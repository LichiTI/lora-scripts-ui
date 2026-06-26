// 采样提示词历史管理器（Feature 5）
//
// 监听 positive_prompts / negative_prompts 字段的写入，
// 将最近 5 条记录存入 localStorage，并在字段下方渲染历史下拉。
//
// 使用方式：
//   import { initPromptHistory } from './promptHistory.js';
//   // main.js 中在 window.updateConfigValue 赋值后调用：
//   initPromptHistory({ getConfig: () => state.config });
//
// 同时需要在 main.js 包装 window.updateConfigValue：
//   const _origUpdate = window.updateConfigValue;
//   window.updateConfigValue = (key, value) => {
//     _origUpdate(key, value);
//     window.__onConfigValueUpdated?.(key, value);
//   };

const HISTORY_KEYS = ['positive_prompts', 'negative_prompts'];
const MAX_HISTORY  = 5;
const LS_PREFIX    = 'lulynx.prompt_history.';

let _initialized = false;

export function initPromptHistory() {
  if (_initialized) return;
  _initialized = true;

  // 监听 main.js 注入的钩子事件
  window.__onConfigValueUpdated = (key, value) => {
    if (!HISTORY_KEYS.includes(key)) return;
    const v = (value || '').trim();
    if (!v) return;
    _pushHistory(key, v);
    _renderHistoryDropdown(key, v);
  };

  // 页面渲染后，为已有值的字段初始化下拉
  document.addEventListener('lulynx:viewRendered', () => {
    for (const key of HISTORY_KEYS) {
      const list = _loadHistory(key);
      if (list.length > 0) _renderHistoryDropdown(key, null);
    }
  });
}

// ── localStorage ──────────────────────────────────────────────────────

function _loadHistory(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

function _saveHistory(key, list) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(list));
  } catch (_e) { /* 存储满则静默跳过 */ }
}

function _pushHistory(key, value) {
  const list = _loadHistory(key).filter((v) => v !== value);
  list.unshift(value);
  _saveHistory(key, list.slice(0, MAX_HISTORY));
}

// ── UI 渲染 ───────────────────────────────────────────────────────────

const DROPDOWN_CLASS = 'prompt-history-dropdown';

function _renderHistoryDropdown(key, _currentValue) {
  const list = _loadHistory(key);
  // 找目标 textarea/input 的父容器（[data-field-key="xxx"]）
  const group = document.querySelector(`[data-field-key="${key}"]`);
  if (!group) return;

  // 清理旧下拉
  group.querySelector(`.${DROPDOWN_CLASS}`)?.remove();
  if (list.length === 0) return;

  const container = document.createElement('div');
  container.className = DROPDOWN_CLASS;
  container.setAttribute('aria-label', '历史提示词');

  container.innerHTML = `
    <div class="phd-label">
      <span>历史记录</span>
      <button class="phd-clear" type="button" data-phd-clear="${key}" title="清除历史">✕</button>
    </div>
    <ul class="phd-list">
      ${list.map((item, i) => `
        <li class="phd-item" data-phd-index="${i}" data-phd-key="${key}" title="${_escAttr(item)}">
          ${_esc(item.length > 80 ? item.slice(0, 80) + '…' : item)}
        </li>
      `).join('')}
    </ul>
  `;

  container.addEventListener('click', (e) => {
    const item = e.target.closest('.phd-item');
    if (item) {
      const idx = Number(item.dataset.phdIndex);
      const k   = item.dataset.phdKey;
      const val = _loadHistory(k)[idx];
      if (val !== undefined && window.updateConfigValue) {
        window.updateConfigValue(k, val);
      }
      return;
    }
    const clearBtn = e.target.closest('[data-phd-clear]');
    if (clearBtn) {
      const k = clearBtn.dataset.phdClear;
      _saveHistory(k, []);
      container.remove();
    }
  });

  // 追加在 group 末尾
  group.appendChild(container);
}

// ── 工具 ─────────────────────────────────────────────────────────────

function _esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _escAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/&/g, '&amp;');
}
