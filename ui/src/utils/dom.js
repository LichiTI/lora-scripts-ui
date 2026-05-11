// DOM 辅助函数集：选择器、HTML 转义、图标、toast
// 这些函数无业务依赖、可被 renderers / actions / main.js 共用。

/** 查询单个 DOM 元素，没找到返回 null */
export const $ = (selector) => document.querySelector(selector);

/** 查询多个 DOM 元素（NodeList） */
export const $$ = (selector) => document.querySelectorAll(selector);

/** HTML 字符转义，防止在模板字符串拼接中注入 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * 内联 SVG 图标辅助。
 * 引用 index.html 中的 <symbol id="icon-XXX">。
 * @param {string} id - 图标 ID（不含 'icon-' 前缀）
 * @param {number} [size=16] - 图标像素尺寸
 */
export function _ico(id, size) {
  var sz = size || 16;
  return '<svg class="icon" style="width:' + sz + 'px;height:' + sz + 'px;vertical-align:middle;display:inline-block;flex-shrink:0;"><use href="#icon-' + id + '"></use></svg>';
}

/**
 * 轻量级 toast 提示。
 * 容器 #toast-container 会自动创建，如果不存在。
 * 过渡动画依赖 style.css 中的 .toast-item.show 规则。
 */
export function showToast(message, duration = 2500) {
  let container = $('#toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast-item';
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);
  }, duration);
}
