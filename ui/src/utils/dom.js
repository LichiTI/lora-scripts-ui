// DOM 辅助函数集：选择器、HTML 转义、图标、toast
// 这些函数无业务依赖、可被 renderers / actions / main.js 共用。
import { gsap, ANIM_DEFAULTS } from './anim.js';

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
 * 进入/退出动画用 GSAP（back.out 弹性进入 + 柔和退出）。
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

  // 标记 .show 以应用最终背景/边框样式（style.css 仍使用该类设置静态颜色）
  toast.classList.add('show');

  // 进入动画 — 从右侧弹入
  gsap.fromTo(toast,
    { x: ANIM_DEFAULTS.toastOffsetX, opacity: 0, scale: 0.95 },
    {
      x: 0,
      opacity: 1,
      scale: 1,
      duration: ANIM_DEFAULTS.toastEnterDuration,
      ease: ANIM_DEFAULTS.toastEnterEase,
      overwrite: 'auto',
    }
  );

  setTimeout(() => {
    // 退出动画 — 滑出 + 缩小 + 淡出
    gsap.to(toast, {
      x: ANIM_DEFAULTS.toastOffsetX,
      opacity: 0,
      scale: 0.95,
      duration: ANIM_DEFAULTS.toastExitDuration,
      ease: ANIM_DEFAULTS.toastExitEase,
      overwrite: 'auto',
      onComplete: () => toast.remove(),
    });
  }, duration);
}
