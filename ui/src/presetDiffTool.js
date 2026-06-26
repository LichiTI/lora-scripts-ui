// 预设对比工具（Feature 8）
//
// 加载预设前弹出 diff 视图，高亮展示预设值与当前配置的差异字段，
// 用户可选择「应用预设」或「取消」。
//
// 工厂函数模式：createPresetDiffTool({ state, mergeConfigPatch, resetTransientState, saveDraft, renderView })
// 返回：{ openPresetDiff }
//
// config.js 的 applyPreset 改为：
//   window.openPresetDiff ? window.openPresetDiff(index) : _doApplyPreset(index)

import { escapeHtml } from './utils/dom.js';

const MODAL_CLASS = 'training-option-help-modal preset-diff-modal';

export function createPresetDiffTool({ state, mergeConfigPatch, resetTransientState, saveDraft, renderView }) {

  function closePresetDiff() {
    document.querySelector('.preset-diff-modal')?.remove();
  }

  function openPresetDiff(index) {
    const preset = state.presets?.[index];
    if (!preset) return;
    closePresetDiff();

    const diffs = _computeDiff(state.config, preset);

    const overlay = document.createElement('div');
    overlay.className = MODAL_CLASS + ' open';
    overlay.innerHTML = renderDiff(preset, diffs);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePresetDiff(); });

    const applyBtn  = overlay.querySelector('[data-pd-apply]');
    const cancelBtn = overlay.querySelector('[data-pd-cancel]');

    if (applyBtn) {
      applyBtn.onclick = () => {
        closePresetDiff();
        mergeConfigPatch(preset);
        state.hasLocalDraft = true;
        resetTransientState();
        saveDraft();
        renderView('config');
      };
    }
    if (cancelBtn) cancelBtn.onclick = closePresetDiff;

    document.body.appendChild(overlay);
  }

  return { openPresetDiff, closePresetDiff };
}

// ── Diff 计算 ──────────────────────────────────────────────────────────

function _computeDiff(currentConfig, preset) {
  const diffs = [];
  // 跳过内部元信息字段
  const SKIP = new Set(['__training_type__', 'model_train_type', 'name', '_meta']);

  for (const [key, presetVal] of Object.entries(preset)) {
    if (SKIP.has(key) || key.startsWith('_')) continue;
    const currentVal = currentConfig[key];
    const ps = String(presetVal ?? '');
    const cs = String(currentVal ?? '');
    if (ps !== cs) {
      diffs.push({ key, currentVal: cs, presetVal: ps });
    }
  }
  return diffs;
}

// ── 渲染 ──────────────────────────────────────────────────────────────

function renderDiff(preset, diffs) {
  const presetName = preset.name || preset.output_name || '预设';
  const diffCount  = diffs.length;

  const rowsHtml = diffCount === 0
    ? '<tr><td colspan="3" class="pd-no-diff">与当前配置无差异 — 应用预设不会更改任何字段。</td></tr>'
    : diffs.map(({ key, currentVal, presetVal }) => `
      <tr class="pd-row">
        <td class="pd-key">${escapeHtml(key)}</td>
        <td class="pd-current">${_renderVal(currentVal)}</td>
        <td class="pd-preset pd-changed">${_renderVal(presetVal)}</td>
      </tr>
    `).join('');

  return `
    <div class="training-option-help-dialog preset-diff-dialog"
         role="dialog" aria-modal="true" aria-label="预设对比">
      <div class="training-option-help-head">
        <div>
          <span class="training-option-help-category">预设对比</span>
          <h3>📋 ${escapeHtml(presetName)}</h3>
        </div>
        <button class="modal-close" type="button" title="取消" data-pd-cancel>×</button>
      </div>
      <div class="training-option-help-body preset-diff-body">
        <p class="field-desc">
          ${diffCount === 0
            ? '此预设与当前配置完全一致。'
            : `应用此预设将修改 <strong>${diffCount}</strong> 个字段（<span class="pd-badge-changed">橙色</span> 为预设新值）：`
          }
        </p>
        <div class="pd-table-wrap">
          <table class="lora-meta-table preset-diff-table">
            <thead>
              <tr>
                <th>字段</th>
                <th>当前值</th>
                <th>预设值</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
      <div class="training-option-help-foot">
        <button class="btn btn-outline" type="button" data-pd-cancel>取消</button>
        <button class="btn btn-primary" type="button" data-pd-apply>✓ 应用预设</button>
      </div>
    </div>
  `;
}

/** 渲染单个值（截断超长字符串）*/
function _renderVal(val) {
  if (val === '' || val == null) return '<span class="pd-empty">—</span>';
  const s = String(val);
  const display = s.length > 80 ? s.slice(0, 80) + '…' : s;
  return escapeHtml(display);
}
