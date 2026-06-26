// datasetQualityTool.js — 数据集质量检测弹窗工具（Feature 数据集预检）
//
// 工厂函数模式，复用 trainingSummaryTool.js 的轮询机制
//
// 依赖（工厂注入）：api, showToast

import { escapeHtml } from './utils/dom.js';

const MODAL_CLASS = 'training-option-help-modal dataset-quality-modal';
const POLL_INTERVAL = 500; // 轮询间隔 500ms

export function createDatasetQualityTool({ api, showToast }) {

  function closeDatasetQualityScan() {
    document.querySelector('.dataset-quality-modal')?.remove();
  }

  function openDatasetQualityScan(datasetDir) {
    if (!datasetDir || !datasetDir.trim()) {
      showToast('请先配置数据集目录', 'error');
      return;
    }

    closeDatasetQualityScan();

    // 启动扫描任务
    api.startDatasetQualityScan(datasetDir.trim())
      .then((response) => {
        if (response.error) {
          showToast(`扫描失败：${response.error}`, 'error');
          return;
        }
        const taskId = response.task_id;
        renderScanModal(taskId, datasetDir);
        pollScanStatus(taskId);
      })
      .catch((err) => {
        showToast(`启动扫描失败：${err.message}`, 'error');
      });
  }

  function renderScanModal(taskId, datasetDir) {
    const overlay = document.createElement('div');
    overlay.className = MODAL_CLASS + ' open';
    overlay.dataset.taskId = taskId;
    overlay.innerHTML = `
      <div class="training-option-help-dialog dataset-quality-dialog"
           role="dialog" aria-modal="true" aria-label="数据集质量检测">
        <div class="training-option-help-head">
          <div>
            <span class="training-option-help-category">数据集质量</span>
            <h3>🔍 扫描中...</h3>
          </div>
          <button class="modal-close" type="button" title="关闭" data-dq-close>×</button>
        </div>
        <div class="training-option-help-body dataset-quality-body">
          <p class="field-desc">正在扫描数据集：<code>${escapeHtml(datasetDir)}</code></p>
          <div class="dq-progress-bar">
            <div class="dq-progress-fill" style="width: 0%"></div>
          </div>
          <p class="dq-progress-text">准备中...</p>
        </div>
      </div>
    `;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDatasetQualityScan();
    });

    const closeBtn = overlay.querySelector('[data-dq-close]');
    if (closeBtn) closeBtn.onclick = closeDatasetQualityScan;

    document.body.appendChild(overlay);
  }

  function pollScanStatus(taskId) {
    const modal = document.querySelector(`.dataset-quality-modal[data-task-id="${taskId}"]`);
    if (!modal) return;

    api.getDatasetQualityStatus(taskId)
      .then((status) => {
        if (!document.querySelector(`.dataset-quality-modal[data-task-id="${taskId}"]`)) {
          return; // 用户已关闭弹窗
        }

        if (status.status === 'running') {
          updateProgress(modal, status.progress || 0, status.total || 0);
          setTimeout(() => pollScanStatus(taskId), POLL_INTERVAL);
        } else if (status.status === 'completed') {
          renderResult(modal, status.result);
        } else if (status.status === 'failed') {
          renderError(modal, status.error || '未知错误');
        } else {
          renderError(modal, '任务状态异常');
        }
      })
      .catch((err) => {
        renderError(modal, err.message);
      });
  }

  function updateProgress(modal, processed, total) {
    const progressBar = modal.querySelector('.dq-progress-fill');
    const progressText = modal.querySelector('.dq-progress-text');

    if (total > 0) {
      const percent = Math.round((processed / total) * 100);
      if (progressBar) progressBar.style.width = `${percent}%`;
      if (progressText) progressText.textContent = `已扫描 ${processed} / ${total} 张图片（${percent}%）`;
    } else {
      if (progressText) progressText.textContent = '扫描中...';
    }
  }

  function renderResult(modal, result) {
    const head = modal.querySelector('.training-option-help-head h3');
    const body = modal.querySelector('.dataset-quality-body');

    if (head) head.textContent = '✅ 扫描完成';

    if (!result) {
      body.innerHTML = '<p class="field-desc">扫描结果为空</p>';
      return;
    }

    const {
      total_images,
      resolution_dist,
      missing_captions,
      empty_captions,
      duplicate_groups,
      caption_length_dist,
      color_mode_dist,
      scan_duration_sec,
      warnings,
    } = result;

    const missingRate = total_images > 0 ? (missing_captions.length / total_images * 100).toFixed(1) : 0;
    const emptyRate = total_images > 0 ? (empty_captions.length / total_images * 100).toFixed(1) : 0;
    const dupCount = duplicate_groups.reduce((sum, g) => sum + g.length, 0);
    const dupRate = total_images > 0 ? (dupCount / total_images * 100).toFixed(1) : 0;

    body.innerHTML = `
      <div class="dq-summary">
        <p><strong>总图片数：</strong>${total_images} 张</p>
        <p><strong>扫描耗时：</strong>${scan_duration_sec} 秒</p>
      </div>

      ${warnings.length > 0 ? `
      <div class="dq-warnings">
        <h4>⚠️ 警告（${warnings.length}）</h4>
        <ul>
          ${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
        </ul>
      </div>
      ` : '<p class="dq-success">✅ 未发现明显质量问题</p>'}

      <div class="dq-section">
        <h4>📐 分辨率分布</h4>
        ${renderDistChart(resolution_dist, total_images)}
      </div>

      <div class="dq-section">
        <h4>📝 Caption 配对</h4>
        <p>缺失 Caption：<strong>${missing_captions.length}</strong> 张（${missingRate}%）</p>
        <p>空 Caption：<strong>${empty_captions.length}</strong> 张（${emptyRate}%）</p>
        ${missing_captions.length > 0 ? `
        <details class="dq-detail">
          <summary>查看缺失列表（前 20 条）</summary>
          <ul class="dq-file-list">
            ${missing_captions.slice(0, 20).map(p => `<li><code>${escapeHtml(p)}</code></li>`).join('')}
          </ul>
        </details>
        ` : ''}
      </div>

      <div class="dq-section">
        <h4>🔄 重复图片</h4>
        <p>重复组数：<strong>${duplicate_groups.length}</strong>（共 ${dupCount} 张，${dupRate}%）</p>
        ${duplicate_groups.length > 0 ? `
        <details class="dq-detail">
          <summary>查看重复组（前 5 组）</summary>
          ${duplicate_groups.slice(0, 5).map((g, i) => `
            <div class="dq-dup-group">
              <strong>组 ${i + 1}：</strong>
              <ul class="dq-file-list">
                ${g.map(p => `<li><code>${escapeHtml(p)}</code></li>`).join('')}
              </ul>
            </div>
          `).join('')}
        </details>
        ` : ''}
      </div>

      <div class="dq-section">
        <h4>📏 Caption 长度分布</h4>
        ${renderDistChart(caption_length_dist, Object.values(caption_length_dist).reduce((a, b) => a + b, 0))}
      </div>

      <div class="dq-section">
        <h4>🎨 色彩模式</h4>
        ${renderDistChart(color_mode_dist, total_images)}
      </div>
    `;
  }

  function renderError(modal, errorMsg) {
    const head = modal.querySelector('.training-option-help-head h3');
    const body = modal.querySelector('.dataset-quality-body');

    if (head) head.textContent = '❌ 扫描失败';
    body.innerHTML = `<p class="field-desc" style="color: var(--error-color, #e74c3c);">${escapeHtml(errorMsg)}</p>`;
  }

  function renderDistChart(dist, total) {
    if (!dist || Object.keys(dist).length === 0) {
      return '<p class="field-desc">无数据</p>';
    }

    const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]);
    const maxCount = Math.max(...entries.map(e => e[1]));

    return `
      <div class="dq-chart">
        ${entries.map(([label, count]) => {
          const percent = total > 0 ? (count / total * 100).toFixed(1) : 0;
          const barWidth = maxCount > 0 ? (count / maxCount * 100) : 0;
          return `
            <div class="dq-chart-row">
              <span class="dq-chart-label">${escapeHtml(label)}</span>
              <div class="dq-chart-bar-wrap">
                <div class="dq-chart-bar" style="width: ${barWidth}%"></div>
              </div>
              <span class="dq-chart-value">${count}（${percent}%）</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  return { openDatasetQualityScan, closeDatasetQualityScan };
}
