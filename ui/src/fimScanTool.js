// FIM-LoRA 训练前逐层 rank 扫描器（companion tool，弹窗）。
//
// 这是分层训练面板里 fg_lora rank 字段区的「⚡ 打开 FIM 扫描器」按钮的实现：
// 用经验 Fisher 信息扫描各层对当前任务/数据集的敏感度，给出水填充式的
// 「建议层 + 逐层精确 rank」(热力图为一等输出)，并一键写回到分层训练配置
// (fg_lora_rank_policy='fim_profile' + fg_lora_rank_map_json=逐层 rank 映射)。
//
// 后端走与 LR Finder 同构的 job 管理器异步通道：
//   POST /api/system/fim-scan -> { job_id }；轮询 GET /api/jobs/{id}，
//   完成后 job.metadata.report 携带 importance/rank_map/heatmap/suggested_layers。
//
// 该工具只读取/写回 webui 训练配置，不承载 launcher 功能，不新增训练入口。

import { escapeHtml } from './utils/dom.js';

const MODAL_CLASS = 'training-option-help-modal fim-scan-modal';
const POLL_INTERVAL_MS = 1200;

export function createFimScanTool({ state, api, showToast, buildRunConfig }) {
  let pollTimer = null;
  let activeJobId = null;
  let lastReport = null;

  function closeFimScanTool() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    const modal = document.querySelector('.fim-scan-modal');
    if (modal) modal.remove();
  }

  function openFimScanTool() {
    closeFimScanTool();
    lastReport = null;
    activeJobId = null;

    const cfg = state.config || {};
    const calibSteps = numOr(cfg.fim_scan_calib_steps, 8);
    const rMin = numOr(cfg.fim_scan_r_min, 8);
    const rMax = numOr(cfg.fim_scan_r_max, 64);

    const body = document.createElement('div');
    body.className = MODAL_CLASS + ' open';
    body.innerHTML = renderShell({ calibSteps, rMin, rMax });
    body.addEventListener('click', (event) => {
      if (event.target === body) closeFimScanTool();
    });
    document.body.appendChild(body);

    bindControls(body);
  }

  function bindControls(root) {
    const closeBtn = root.querySelector('[data-fim-close]');
    if (closeBtn) closeBtn.onclick = closeFimScanTool;

    const runBtn = root.querySelector('[data-fim-run]');
    if (runBtn) runBtn.onclick = () => startScan(root);

    const cancelBtn = root.querySelector('[data-fim-cancel]');
    if (cancelBtn) cancelBtn.onclick = cancelScan;

    const applyBtn = root.querySelector('[data-fim-apply]');
    if (applyBtn) applyBtn.onclick = applyResult;
  }

  async function startScan(root) {
    const calibSteps = clampInt(readInput(root, 'fim-calib'), 1, 256, 8);
    const rMin = clampInt(readInput(root, 'fim-rmin'), 1, 512, 8);
    const rMaxRaw = clampInt(readInput(root, 'fim-rmax'), 1, 512, 64);
    const rMax = Math.max(rMaxRaw, rMin);

    const statusEl = root.querySelector('[data-fim-status]');
    const resultEl = root.querySelector('[data-fim-result]');
    if (resultEl) resultEl.innerHTML = '';
    setRunning(root, true);

    let runConfig;
    try {
      runConfig = buildRunConfig(state.config, state.activeTrainingType) || {};
    } catch (error) {
      setRunning(root, false);
      if (statusEl) statusEl.innerHTML = errLine(error.message || '配置构建失败');
      return;
    }
    // 扫描参数以弹窗输入为准，覆盖到提交配置上（不污染主配置）。
    const scanConfig = {
      ...runConfig,
      fim_scan_enabled: true,
      fim_scan_calib_steps: calibSteps,
      fim_scan_r_min: rMin,
      fim_scan_r_max: rMax,
    };

    try {
      const resp = await api.startFimScan(scanConfig);
      const jobId = resp?.job_id || resp?.jobId;
      if (!jobId) throw new Error('未返回 job_id');
      activeJobId = jobId;
      if (statusEl) statusEl.innerHTML = busyLine(`扫描任务已提交：${escapeHtml(jobId)}`);
      pollJob(root, jobId);
    } catch (error) {
      setRunning(root, false);
      if (statusEl) statusEl.innerHTML = errLine(error.message || '提交失败');
      showToast(error.message || 'FIM 扫描提交失败。');
    }
  }

  function pollJob(root, jobId) {
    if (pollTimer) clearInterval(pollTimer);
    const statusEl = root.querySelector('[data-fim-status]');
    pollTimer = setInterval(async () => {
      try {
        const data = await api.getJob(jobId);
        const pct = Math.round((data.progress || 0) * 100);
        if (statusEl && data.status === 'running') {
          statusEl.innerHTML = busyLine(`扫描中 ${pct}%（Fisher 校准）`);
        }
        if (data.status === 'completed') {
          clearInterval(pollTimer);
          pollTimer = null;
          const report = data.metadata?.report || null;
          handleComplete(root, report);
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          clearInterval(pollTimer);
          pollTimer = null;
          setRunning(root, false);
          if (statusEl) statusEl.innerHTML = errLine(data.error || data.status || '任务未完成');
        }
      } catch (error) {
        clearInterval(pollTimer);
        pollTimer = null;
        setRunning(root, false);
        if (statusEl) statusEl.innerHTML = errLine(error.message || '轮询失败');
      }
    }, POLL_INTERVAL_MS);
  }

  function handleComplete(root, report) {
    setRunning(root, false);
    const statusEl = root.querySelector('[data-fim-status]');
    const resultEl = root.querySelector('[data-fim-result]');
    if (!report || !report.rank_map || !Object.keys(report.rank_map).length) {
      if (statusEl) statusEl.innerHTML = errLine('扫描完成但未产出 rank_map（未找到 LoRA 层？）');
      return;
    }
    lastReport = report;
    if (statusEl) {
      statusEl.innerHTML = okLine(
        `扫描完成：${Object.keys(report.rank_map).length} 层，` +
        `rank 合计 ${report.rank_total}/${report.rank_budget}（base ${report.base_rank}，${report.steps_used} 步）`
      );
    }
    if (resultEl) resultEl.innerHTML = renderResult(report);
    const applyBtn = root.querySelector('[data-fim-apply]');
    if (applyBtn) applyBtn.disabled = false;
  }

  async function cancelScan() {
    if (!activeJobId) return;
    try {
      await api.cancelJob(activeJobId);
      showToast('已请求取消 FIM 扫描。');
    } catch (error) {
      showToast(error.message || '取消失败。');
    }
  }

  function applyResult() {
    if (!lastReport || !lastReport.rank_map) {
      showToast('请先完成一次扫描。');
      return;
    }
    if (typeof window.updateConfigValue !== 'function') {
      showToast('配置写回不可用。');
      return;
    }
    const mapJson = JSON.stringify(lastReport.rank_map);
    window.updateConfigValue('fg_lora_rank_policy', 'fim_profile');
    window.updateConfigValue('fg_lora_rank_map_json', mapJson);
    showToast('已写回逐层 rank（策略=fim_profile）。');
    closeFimScanTool();
  }

  return { openFimScanTool, closeFimScanTool };
}

// ---------- 渲染 ----------

function renderShell({ calibSteps, rMin, rMax }) {
  return `
    <div class="training-option-help-dialog fim-scan-dialog" role="dialog" aria-modal="true" aria-label="FIM Rank 扫描器">
      <div class="training-option-help-head">
        <div>
          <span class="training-option-help-category">前沿 · 分层 Rank</span>
          <h3>⚡ FIM Rank 扫描器</h3>
        </div>
        <button class="modal-close" type="button" title="关闭" data-fim-close>×</button>
      </div>
      <div class="training-option-help-body fim-scan-body">
        <p class="field-desc">
          训练前用经验 Fisher 信息扫描各层对当前数据集的敏感度，水填充式分配逐层精确 rank。
          会用当前训练配置跑约若干步校准 backward，不写权重、不进入正式训练。
          完成后可一键写回（策略=fim_profile）。
        </p>
        <div class="fim-scan-params">
          ${numField('fim-calib', '校准步数', calibSteps, 1, 256, 1)}
          ${numField('fim-rmin', '最小 rank (r_min)', rMin, 1, 512, 1)}
          ${numField('fim-rmax', '最大 rank (r_max)', rMax, 1, 512, 1)}
        </div>
        <div class="fim-scan-actions">
          <button class="btn btn-primary" type="button" data-fim-run>开始扫描</button>
          <button class="btn btn-outline" type="button" data-fim-cancel>取消任务</button>
        </div>
        <div class="fim-scan-status" data-fim-status></div>
        <div class="fim-scan-result" data-fim-result></div>
      </div>
      <div class="training-option-help-foot fim-scan-foot">
        <button class="btn btn-primary" type="button" data-fim-apply disabled>一键写回逐层 rank</button>
      </div>
    </div>
  `;
}

function renderResult(report) {
  const heatmap = Array.isArray(report.heatmap) ? report.heatmap : [];
  const rankMap = report.rank_map || {};
  const suggested = new Set(report.suggested_layers || []);
  const heatRows = heatmap.length ? heatmap : heatmapFromRankMap(rankMap);

  const bars = heatRows.map((row) => {
    const name = row.layer;
    const norm = clamp01(row.normalized != null ? row.normalized : 0);
    const rank = rankMap[name] != null ? rankMap[name] : '';
    const hot = suggested.has(name);
    const depth = row.depth != null ? `d${row.depth}` : '';
    return `
      <div class="fim-heat-row${hot ? ' fim-heat-hot' : ''}" title="${escapeHtml(name)}">
        <span class="fim-heat-name">${escapeHtml(shortName(name))}</span>
        <span class="fim-heat-track"><span class="fim-heat-fill" style="width:${(norm * 100).toFixed(1)}%"></span></span>
        <span class="fim-heat-depth">${escapeHtml(depth)}</span>
        <span class="fim-heat-rank">r=${escapeHtml(String(rank))}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="fim-result-summary">
      <span>建议加强层：<b>${suggested.size}</b></span>
      <span>逐层数：<b>${Object.keys(rankMap).length}</b></span>
      <span>rank 合计：<b>${escapeHtml(String(report.rank_total))}</b> / ${escapeHtml(String(report.rank_budget))}</span>
    </div>
    <div class="fim-heatmap">${bars || '<p class="field-desc">无热力数据。</p>'}</div>
  `;
}

function heatmapFromRankMap(rankMap) {
  const entries = Object.entries(rankMap);
  const peak = entries.reduce((m, [, v]) => Math.max(m, v), 0) || 1;
  return entries.map(([layer, rank]) => ({ layer, normalized: rank / peak, depth: null }));
}

// ---------- 小工具 ----------

function numField(id, label, value, min, max, step) {
  return `
    <label class="fim-num-field">
      <span>${escapeHtml(label)}</span>
      <input class="text-input" type="number" data-fim-input="${id}"
             value="${escapeHtml(String(value))}" min="${min}" max="${max}" step="${step}">
    </label>
  `;
}

function readInput(root, id) {
  const el = root.querySelector(`[data-fim-input="${id}"]`);
  return el ? el.value : '';
}

function setRunning(root, running) {
  const runBtn = root.querySelector('[data-fim-run]');
  if (runBtn) runBtn.disabled = running;
  const inputs = root.querySelectorAll('[data-fim-input]');
  inputs.forEach((el) => { el.disabled = running; });
}

function shortName(name) {
  const parts = String(name).split('.');
  return parts.length > 4 ? '…' + parts.slice(-4).join('.') : name;
}

function numOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clampInt(raw, min, max, fallback) {
  let n = parseInt(raw, 10);
  if (!Number.isFinite(n)) n = fallback;
  return Math.min(max, Math.max(min, n));
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function busyLine(text) {
  return `<span class="fim-status-busy">${escapeHtml(text)}</span>`;
}
function okLine(text) {
  return `<span class="fim-status-ok">${escapeHtml(text)}</span>`;
}
function errLine(text) {
  return `<span class="fim-status-err">${escapeHtml(text)}</span>`;
}
