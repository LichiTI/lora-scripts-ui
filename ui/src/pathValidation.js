// 路径字段存在性验证管理器（单例，事件委托）。
//
// 在 file/folder 类型的输入框值变更时，异步向后端确认路径是否存在，
// 并在字段旁注入颜色指示标。
//
// 使用方式：
//   import { initPathValidation } from './pathValidation.js';
//   initPathValidation({ api });
//
// 不修改 configForm.js 模板 — 全程用事件委托。

const INDICATOR_CLASS = 'path-validation-indicator';
const DEBOUNCE_MS = 400;
const _timers = new Map();   // field key → timer id
const _cache = new Map();    // path → { exists, type }

let _api = null;

export function initPathValidation({ api }) {
  _api = api;
  document.addEventListener('change', _onChange);
  document.addEventListener('pathfield:validate', _onCustomValidate);
}

// ── 事件处理 ─────────────────────────────────────────────────────────

function _onChange(e) {
  const input = e.target.closest?.('.input-picker input, input[data-path-key]');
  if (!input) return;

  const group = input.closest('[data-field-key]');
  const fieldKey = group?.dataset?.fieldKey || input.dataset?.pathKey;
  if (!fieldKey) return;

  const value = (input.value || '').trim();
  _scheduleValidation(fieldKey, value, group || input.parentElement);
}

function _onCustomValidate(e) {
  const { fieldKey, value, groupEl } = e.detail || {};
  if (!fieldKey || !value) return;
  _scheduleValidation(fieldKey, value, groupEl);
}

function _scheduleValidation(fieldKey, value, groupEl) {
  if (_timers.has(fieldKey)) clearTimeout(_timers.get(fieldKey));

  if (!value) {
    _removeIndicator(groupEl, fieldKey);
    return;
  }

  // 缓存命中：直接渲染
  if (_cache.has(value)) {
    _renderIndicator(groupEl, fieldKey, _cache.get(value));
    return;
  }

  // 显示"验证中"
  _setIndicator(groupEl, fieldKey, 'checking', '');

  const tid = setTimeout(async () => {
    _timers.delete(fieldKey);
    const result = await _checkPath(value);
    _cache.set(value, result);
    _renderIndicator(groupEl, fieldKey, result);
  }, DEBOUNCE_MS);

  _timers.set(fieldKey, tid);
}

// ── 后端调用 ─────────────────────────────────────────────────────────

async function _checkPath(path) {
  if (!_api) return null;
  try {
    const resp = await _api.checkPathExists(path);
    return resp?.data || { exists: false, type: 'missing' };
  } catch (_e) {
    return null;  // 网络失败：静默不标记
  }
}

// ── 指示器渲染 ───────────────────────────────────────────────────────

function _renderIndicator(groupEl, fieldKey, result) {
  if (!result) { _removeIndicator(groupEl, fieldKey); return; }
  if (result.exists) {
    _setIndicator(groupEl, fieldKey, 'ok', result.type === 'dir' ? '✓ 目录存在' : '✓ 文件存在');
  } else {
    _setIndicator(groupEl, fieldKey, 'warn', '⚠ 路径不存在');
  }
}

function _setIndicator(groupEl, fieldKey, status, text) {
  if (!groupEl) return;
  let el = groupEl.querySelector(`.${INDICATOR_CLASS}`);
  if (!el) {
    el = document.createElement('span');
    el.className = INDICATOR_CLASS;
    el.dataset.forField = fieldKey;
    // 插入到 .input-picker 后面（或 groupEl 末尾）
    const picker = groupEl.querySelector('.input-picker');
    if (picker && picker.parentNode) {
      picker.parentNode.insertBefore(el, picker.nextSibling);
    } else {
      groupEl.appendChild(el);
    }
  }
  el.dataset.status = status;
  el.textContent = text;
}

function _removeIndicator(groupEl, fieldKey) {
  if (!groupEl) return;
  const el = groupEl.querySelector(`.${INDICATOR_CLASS}[data-for-field="${fieldKey}"]`);
  if (el) el.remove();
}
