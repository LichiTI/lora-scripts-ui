// LoRA 元数据读取工具（companion tool，弹窗）。
//
// 用户点击「📖 读取 LoRA 元数据」按钮 → 弹出文件选择器 → 后端读取
// safetensors 二进制头 → 解析 __metadata__ → 展示格式化训练参数摘要。
//
// 工厂函数模式：createLoraMetaTool({ state, api, showToast })
// 返回：{ openLoraMetaReader, closeLoraMetaReader }

import { escapeHtml } from './utils/dom.js';

const MODAL_CLASS = 'training-option-help-modal lora-meta-modal';

export function createLoraMetaTool({ state: _state, api, showToast }) {

  function closeLoraMetaReader() {
    const modal = document.querySelector('.lora-meta-modal');
    if (modal) modal.remove();
  }

  async function openLoraMetaReader() {
    closeLoraMetaReader();

    // 1. 文件选择器
    let filePath = null;
    try {
      const resp = await api.pickFile('file', 'lora_file');
      filePath = resp?.data?.path;
    } catch (_e) { /* 用户取消 */ }
    if (!filePath) return;

    // 2. 仅接受 .safetensors / .pt / .ckpt
    const ext = filePath.split('.').pop().toLowerCase();
    if (!['safetensors', 'pt', 'ckpt'].includes(ext)) {
      showToast('请选择 .safetensors / .pt / .ckpt 格式的 LoRA 文件。');
      return;
    }

    // 3. 加载中弹窗
    const overlay = document.createElement('div');
    overlay.className = MODAL_CLASS + ' open';
    overlay.innerHTML = renderLoading(filePath);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLoraMetaReader(); });
    document.body.appendChild(overlay);

    // 4. 读取元数据
    let result = null;
    try {
      const resp = await api.readLoraMetadata(filePath);
      result = resp?.data;
    } catch (err) {
      _setStatus(overlay, '❌ 请求失败：' + (err?.message || '未知错误'));
      return;
    }

    if (!result || result.error) {
      _setStatus(overlay, '❌ ' + (result?.error || '读取失败'));
      return;
    }

    // 5. 渲染结果
    overlay.innerHTML = renderResult(result);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLoraMetaReader(); });
    const closeBtn = overlay.querySelector('[data-lora-meta-close]');
    if (closeBtn) closeBtn.onclick = closeLoraMetaReader;
  }

  return { openLoraMetaReader, closeLoraMetaReader };
}

// ── 辅助 ────────────────────────────────────────────────────────────

function _setStatus(overlay, html) {
  const el = overlay.querySelector('[data-lora-meta-status]');
  if (el) el.innerHTML = html;
}

// ── 渲染 ────────────────────────────────────────────────────────────

function renderLoading(filePath) {
  const fname = filePath.replace(/\\/g, '/').split('/').pop();
  return `
    <div class="training-option-help-dialog lora-meta-dialog" role="dialog" aria-modal="true" aria-label="LoRA 元数据">
      <div class="training-option-help-head">
        <div>
          <span class="training-option-help-category">LoRA 信息</span>
          <h3>📖 LoRA 元数据</h3>
        </div>
        <button class="modal-close" type="button" title="关闭" data-lora-meta-close>×</button>
      </div>
      <div class="training-option-help-body lora-meta-body">
        <p class="field-desc lora-meta-filepath">📄 ${escapeHtml(fname)}</p>
        <div data-lora-meta-status>
          <span class="fim-status-busy">正在读取文件头部元数据（不加载权重）…</span>
        </div>
      </div>
    </div>
  `;
}

function renderResult(result) {
  const fname = result.filename || '未知文件';
  const sizeMb = result.size_mb ? `${result.size_mb} MB` : '';

  const keyRows = (result.key_fields || []).map(f => `
    <tr>
      <td class="lora-meta-label">${escapeHtml(f.label)}</td>
      <td class="lora-meta-value">${escapeHtml(String(f.value))}</td>
    </tr>
  `).join('');

  const extraRows = (result.extra_fields || []).slice(0, 20).map(f => `
    <tr class="lora-meta-extra">
      <td class="lora-meta-label lora-meta-key-raw">${escapeHtml(f.key)}</td>
      <td class="lora-meta-value">${escapeHtml(String(f.value)).slice(0, 200)}</td>
    </tr>
  `).join('');

  const extraCount = (result.extra_fields || []).length;
  const extraSection = extraCount > 0 ? `
    <details class="lora-meta-extra-section">
      <summary>其余原始字段（${extraCount} 个）</summary>
      <table class="lora-meta-table">${extraRows}</table>
      ${extraCount > 20 ? `<p class="field-desc">仅展示前 20 项</p>` : ''}
    </details>
  ` : '';

  const emptyNote = (result.key_fields || []).length === 0 && extraCount === 0
    ? '<p class="field-desc">未找到 __metadata__ 信息（可能是原始 checkpoint 格式）。</p>'
    : '';

  return `
    <div class="training-option-help-dialog lora-meta-dialog" role="dialog" aria-modal="true" aria-label="LoRA 元数据">
      <div class="training-option-help-head">
        <div>
          <span class="training-option-help-category">LoRA 信息</span>
          <h3>📖 ${escapeHtml(fname)}</h3>
        </div>
        <button class="modal-close" type="button" title="关闭" data-lora-meta-close>×</button>
      </div>
      <div class="training-option-help-body lora-meta-body">
        ${sizeMb ? `<p class="field-desc lora-meta-size">文件大小：${escapeHtml(sizeMb)}</p>` : ''}
        ${emptyNote}
        ${keyRows ? `<table class="lora-meta-table lora-meta-keytable">${keyRows}</table>` : ''}
        ${extraSection}
      </div>
      <div class="training-option-help-foot">
        <button class="btn btn-outline" type="button" data-lora-meta-close>关闭</button>
      </div>
    </div>
  `;
}
