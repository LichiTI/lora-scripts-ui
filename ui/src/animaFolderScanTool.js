// Anima 模型文件夹智能识别工具（companion tool，弹窗）。
//
// 用户点击「🔍 智能识别模型文件夹」按钮 → 弹出文件夹选择 → 后端扫描
// safetensors 二进制头 + 文件名 pattern → 自动填充 DiT/VAE/Qwen3/T5/LLM Adapter 路径字段。
//
// 高置信度单候选：静默写回。
// 多候选 / 低置信度：在弹窗冲突解决器中让用户手动选择。
//
// 组件→字段映射：
//   dit_model     → pretrained_model_name_or_path
//   vae           → vae
//   qwen3         → qwen3
//   llm_adapter   → llm_adapter_path
//   t5_tokenizer  → t5_tokenizer_path

import { escapeHtml } from './utils/dom.js';

const MODAL_CLASS = 'training-option-help-modal anima-scan-modal';

// 组件元数据：中文名 + 对应的配置字段 key
const COMPONENT_META = {
  dit_model:    { label: 'Anima DiT 主模型', field: 'pretrained_model_name_or_path' },
  vae:          { label: 'VAE',               field: 'vae' },
  qwen3:        { label: 'Qwen3 文本模型',    field: 'qwen3' },
  llm_adapter:  { label: 'LLM Adapter',       field: 'llm_adapter_path' },
  t5_tokenizer: { label: 'T5 Tokenizer 目录', field: 't5_tokenizer_path' },
};

const COMP_ORDER = ['dit_model', 'vae', 'qwen3', 'llm_adapter', 't5_tokenizer'];

export function createAnimaFolderScanTool({ state: _state, api, showToast }) {
  // ── 选中值（每组件 key → 路径字符串）──
  let _selections = {};

  function closeAnimaFolderScanner() {
    const modal = document.querySelector('.anima-scan-modal');
    if (modal) modal.remove();
    _selections = {};
  }

  async function openAnimaFolderScanner() {
    closeAnimaFolderScanner();
    _selections = {};

    // 1. 先用原生 folder picker 让用户选文件夹
    let folderPath = null;
    try {
      const resp = await api.pickFile('folder', 'anima_model_root');
      folderPath = resp?.data?.path;
    } catch (_e) {
      // pickFile 被用户取消或不可用时直接返回
    }
    if (!folderPath) return;

    // 2. 显示扫描中 loading 弹窗
    const body = document.createElement('div');
    body.className = MODAL_CLASS + ' open';
    body.innerHTML = renderLoadingShell(folderPath);
    body.addEventListener('click', (e) => { if (e.target === body) closeAnimaFolderScanner(); });
    document.body.appendChild(body);

    // 3. 调用后端扫描
    let scanResult = null;
    try {
      const resp = await api.scanAnimaFolder(folderPath);
      scanResult = resp?.data;
    } catch (err) {
      const statusEl = body.querySelector('[data-scan-status]');
      if (statusEl) statusEl.innerHTML = errLine(err?.message || '扫描请求失败');
      return;
    }

    if (!scanResult || scanResult.error) {
      const statusEl = body.querySelector('[data-scan-status]');
      if (statusEl) statusEl.innerHTML = errLine(scanResult?.error || '扫描失败');
      return;
    }

    const components = scanResult.components || {};

    // 4. 检查是否所有自动选中都是单候选 → 可直接写回，无需弹冲突解决器
    const needsConflict = COMP_ORDER.some((c) => {
      const comp = components[c];
      return comp?.found && !comp?.auto_selected;
    });
    const hasAnyFound = COMP_ORDER.some((c) => components[c]?.found);

    if (!hasAnyFound) {
      body.remove();
      showToast('未在该目录找到可识别的模型文件。');
      return;
    }

    if (!needsConflict) {
      // 所有候选均可自动选择，直接写回并给提示
      body.remove();
      _applyAutoSelections(components, showToast);
      return;
    }

    // 5. 有冲突 → 更新弹窗为冲突解决器
    body.innerHTML = renderConflictShell(folderPath, components);
    body.addEventListener('click', (e) => { if (e.target === body) closeAnimaFolderScanner(); });

    // 初始化选中状态（自动选中优先预置）
    COMP_ORDER.forEach((compKey) => {
      const comp = components[compKey];
      if (comp?.auto_selected) {
        _selections[compKey] = comp.auto_selected;
        // 预置 radio
        const radio = body.querySelector(`input[name="${compKey}"][value="${CSS.escape(comp.auto_selected)}"]`);
        if (radio) radio.checked = true;
      }
    });

    _bindConflictControls(body, components);
  }

  function _applyAutoSelections(components, toast) {
    let filled = 0;
    COMP_ORDER.forEach((compKey) => {
      const comp = components[compKey];
      const meta = COMPONENT_META[compKey];
      if (!comp?.auto_selected || !meta) return;
      if (typeof window.updateConfigValue === 'function') {
        window.updateConfigValue(meta.field, comp.auto_selected);
        filled++;
      }
    });
    if (filled > 0) {
      toast(`已自动填充 ${filled} 个模型路径。`);
    } else {
      toast('未能写回任何路径（updateConfigValue 不可用）。');
    }
  }

  function _bindConflictControls(root, components) {
    const closeBtn = root.querySelector('[data-scan-close]');
    if (closeBtn) closeBtn.onclick = closeAnimaFolderScanner;

    const applyBtn = root.querySelector('[data-scan-apply]');
    if (applyBtn) {
      applyBtn.onclick = () => {
        // 收集当前 radio / select 选中值
        COMP_ORDER.forEach((compKey) => {
          const comp = components[compKey];
          if (!comp?.found) return;
          const radios = root.querySelectorAll(`input[name="${compKey}"]`);
          for (const r of radios) {
            if (r.checked) { _selections[compKey] = r.value; break; }
          }
        });

        // 写回
        let filled = 0;
        COMP_ORDER.forEach((compKey) => {
          const meta = COMPONENT_META[compKey];
          const chosen = _selections[compKey];
          if (!chosen || !meta) return;
          if (typeof window.updateConfigValue === 'function') {
            window.updateConfigValue(meta.field, chosen);
            filled++;
          }
        });

        closeAnimaFolderScanner();
        if (filled > 0) {
          showToast(`已填充 ${filled} 个模型路径。`);
        } else {
          showToast('未选择任何路径。');
        }
      };
    }

    // 跳过按钮
    const skipBtn = root.querySelector('[data-scan-skip]');
    if (skipBtn) skipBtn.onclick = closeAnimaFolderScanner;
  }

  return { openAnimaFolderScanner, closeAnimaFolderScanner };
}

// ── 渲染 ────────────────────────────────────────────────────────

function renderLoadingShell(folderPath) {
  return `
    <div class="training-option-help-dialog anima-scan-dialog" role="dialog" aria-modal="true" aria-label="Anima 模型扫描">
      <div class="training-option-help-head">
        <div>
          <span class="training-option-help-category">模型路径</span>
          <h3>🔍 智能识别模型文件夹</h3>
        </div>
        <button class="modal-close" type="button" title="关闭" data-scan-close>×</button>
      </div>
      <div class="training-option-help-body anima-scan-body">
        <p class="field-desc anima-scan-folder-path">📁 ${escapeHtml(folderPath)}</p>
        <div class="anima-scan-status" data-scan-status>
          <span class="fim-status-busy">正在扫描模型文件（读取 safetensors 文件头，不加载权重）…</span>
        </div>
      </div>
    </div>
  `;
}

function renderConflictShell(folderPath, components) {
  const rows = COMP_ORDER.map((compKey) => {
    const comp = components[compKey];
    const meta = COMPONENT_META[compKey];
    if (!comp?.found) return renderSkippedRow(compKey, meta);
    return renderComponentRow(compKey, meta, comp);
  }).join('');

  return `
    <div class="training-option-help-dialog anima-scan-dialog" role="dialog" aria-modal="true" aria-label="Anima 模型扫描结果">
      <div class="training-option-help-head">
        <div>
          <span class="training-option-help-category">模型路径</span>
          <h3>🔍 智能识别结果</h3>
        </div>
        <button class="modal-close" type="button" title="关闭" data-scan-close>×</button>
      </div>
      <div class="training-option-help-body anima-scan-body">
        <p class="field-desc anima-scan-folder-path">📁 ${escapeHtml(folderPath)}</p>
        <p class="field-desc">以下是扫描到的模型组件候选。每组选择一项后点击「写入路径」，自动候选已预选。</p>
        <div class="anima-scan-components">${rows}</div>
      </div>
      <div class="training-option-help-foot anima-scan-foot">
        <button class="btn btn-outline" type="button" data-scan-skip>取消</button>
        <button class="btn btn-primary" type="button" data-scan-apply>✓ 写入路径</button>
      </div>
    </div>
  `;
}

function renderSkippedRow(compKey, meta) {
  return `
    <div class="anima-scan-comp-row anima-scan-comp-empty">
      <div class="anima-scan-comp-label">${escapeHtml(meta?.label || compKey)}</div>
      <div class="anima-scan-comp-candidates">
        <span class="field-desc">未找到候选文件</span>
      </div>
    </div>
  `;
}

function renderComponentRow(compKey, meta, comp) {
  const candidates = comp.candidates || [];
  const autoSel = comp.auto_selected;

  const radioItems = candidates.map((c, i) => {
    const isChecked = autoSel ? c.path === autoSel : i === 0;
    const confBadge = renderConfBadge(c.confidence);
    const sizeStr = c.size_mb > 0 ? `${c.size_mb.toFixed(0)} MB` : '';
    const fileName = c.path.replace(/\\/g, '/').split('/').pop();
    const detectStr = c.detected_by ? `（${escapeHtml(c.detected_by)}）` : '';
    return `
      <label class="anima-scan-radio-row">
        <input type="radio" name="${escapeHtml(compKey)}" value="${escapeHtml(c.path)}"${isChecked ? ' checked' : ''}>
        <span class="anima-scan-radio-content">
          <span class="anima-scan-filename" title="${escapeHtml(c.path)}">${escapeHtml(fileName)}</span>
          ${confBadge}
          ${sizeStr ? `<span class="anima-scan-size">${escapeHtml(sizeStr)}</span>` : ''}
          <span class="anima-scan-detect">${detectStr}</span>
        </span>
      </label>
    `;
  }).join('');

  const autoTag = autoSel ? '<span class="anima-scan-autotag">自动选中</span>' : '';

  return `
    <div class="anima-scan-comp-row">
      <div class="anima-scan-comp-label">${escapeHtml(meta?.label || compKey)} ${autoTag}</div>
      <div class="anima-scan-comp-candidates">${radioItems}</div>
    </div>
  `;
}

function renderConfBadge(confidence) {
  const cls = confidence === 'high' ? 'conf-high' : confidence === 'medium' ? 'conf-medium' : 'conf-low';
  const txt = confidence === 'high' ? '高' : confidence === 'medium' ? '中' : '低';
  return `<span class="anima-scan-conf ${cls}">${txt}</span>`;
}

function errLine(text) {
  return `<span class="fim-status-err">${escapeHtml(text)}</span>`;
}
