// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
// 数字 tween 工具 — 用于训练面板的实时数字滚动
// 设计原则：
// - 整页 re-render 会重建 DOM，所以用「逻辑 key」缓存上次值，渲染后按 CSS 选择器找节点
// - 只在差异显著时 tween（避免与轮询节奏冲突造成抖动）
// - 首次出现的值直接显示，不动画
import { gsap, ANIM_DEFAULTS } from './anim.js';

// 每个 key 的状态：last value, last tween instance
const _state = new Map();

/**
 * 注册并 tween 一个数字显示元素到新值。
 * @param {string} key - 逻辑 key（如 'loss', 'step'），用于跨 re-render 缓存
 * @param {Element} el - 当前 DOM 节点（每次渲染都可能是新节点）
 * @param {number} newValue - 目标值
 * @param {(v: number) => string} format - 格式化函数（含单位）
 * @param {object} [opts]
 * @param {number} [opts.threshold=0.05] - 相对差异阈值（5%），低于则不 tween
 * @param {number} [opts.absoluteThreshold=1] - 绝对差异阈值，整数计数适用
 * @param {boolean} [opts.integer=false] - 整数模式（用 Math.round）
 */
export function tweenNumber(key, el, newValue, format, opts = {}) {
  if (!el || !Number.isFinite(newValue)) return;
  const threshold = opts.threshold ?? 0.05;
  const absThreshold = opts.absoluteThreshold ?? 1;
  const integer = !!opts.integer;

  const prev = _state.get(key);
  // 首次出现 — 直接显示
  if (!prev || !Number.isFinite(prev.value)) {
    el.textContent = format(newValue);
    _state.set(key, { value: newValue });
    return;
  }

  // 杀掉上一次未完成的 tween
  if (prev.tween) prev.tween.kill();

  const delta = Math.abs(newValue - prev.value);
  const relativeDelta = prev.value !== 0 ? delta / Math.abs(prev.value) : delta;
  // 差异太小 — 直接 snap，避免轮询冲突造成抖动
  if (delta < absThreshold && relativeDelta < threshold) {
    el.textContent = format(newValue);
    _state.set(key, { value: newValue });
    return;
  }

  // 执行 tween
  const proxy = { val: prev.value };
  const tween = gsap.to(proxy, {
    val: newValue,
    duration: ANIM_DEFAULTS.numberTweenDuration,
    ease: ANIM_DEFAULTS.numberEase,
    overwrite: 'auto',
    onUpdate: () => {
      const v = integer ? Math.round(proxy.val) : proxy.val;
      el.textContent = format(v);
    },
    onComplete: () => {
      el.textContent = format(newValue);
      const cur = _state.get(key);
      if (cur && cur.tween === tween) _state.set(key, { value: newValue });
    },
  });
  _state.set(key, { value: newValue, tween });
}

/** 清空所有缓存 — 在切换训练任务时调用 */
export function clearNumberCache() {
  _state.forEach((entry) => { if (entry.tween) entry.tween.kill(); });
  _state.clear();
}
