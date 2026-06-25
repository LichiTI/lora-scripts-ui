// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
// 统一的 GSAP 封装：集中默认参数，方便整体调优
import gsap from 'gsap';

// 默认动效参数
export const ANIM_DEFAULTS = {
  pageFadeOutDuration: 0.18,
  pageFadeInDuration: 0.22,
  pageOffset: 8, // px
  numberTweenDuration: 0.6,
  numberEase: 'power2.out',
  toastEnterDuration: 0.4,
  toastEnterEase: 'back.out(1.4)',
  toastExitDuration: 0.25,
  toastExitEase: 'power2.in',
  toastOffsetX: 60, // px
};

// 检测用户是否偏好减少动画
function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// 包装 gsap，统一应用 reduced-motion 检查
export const anim = {
  to: (target, vars) => {
    if (prefersReducedMotion()) {
      // 减少动画时，立刻应用最终状态
      Object.entries(vars).forEach(([key, value]) => {
        if (key !== 'duration' && key !== 'ease' && key !== 'onComplete' && key !== 'onUpdate' && typeof value !== 'function') {
          if (target instanceof Element) target.style[key] = typeof value === 'number' && key !== 'opacity' ? `${value}px` : value;
        }
      });
      if (typeof vars.onComplete === 'function') vars.onComplete();
      return { kill: () => {} };
    }
    return gsap.to(target, vars);
  },
  fromTo: (target, fromVars, toVars) => {
    if (prefersReducedMotion()) {
      if (typeof toVars.onComplete === 'function') toVars.onComplete();
      return { kill: () => {} };
    }
    return gsap.fromTo(target, fromVars, toVars);
  },
  timeline: (vars) => gsap.timeline(vars),
};

export { gsap };
