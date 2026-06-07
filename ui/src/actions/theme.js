// actions/theme.js — 主题与语言切换 actions
// 依赖（工厂注入）：state, t, renderView

import { $, $$ } from '../utils/dom.js';

export function createThemeActions({ state, t, renderView }) {
  function applyLanguage() {
    $$('[data-i18n]').forEach((element) => {
      const key = element.dataset.i18n;
      element.textContent = t(key, state.lang);
    });
  }

  function setLanguage(lang) {
    state.lang = lang;
    localStorage.setItem('lang', lang);
    applyLanguage();
    renderView(state.activeModule);
  }

  function _randomizeGlassRipple() {
    const root = document.documentElement;
    if (root.dataset.lxTheme === 'glass') {
      const x = 10 + Math.random() * 80; // 10% to 90%
      const y = 10 + Math.random() * 80;
      const size = 5 + Math.random() * 15; // 5vw to 20vw
      root.style.setProperty('--glass-ripple-x', `${x}%`);
      root.style.setProperty('--glass-ripple-y', `${y}%`);
      root.style.setProperty('--glass-ripple-size', `${size}vw`);
    }
  }

  function applyTheme() {
    const root = document.documentElement;
    const mainTheme = ['dark', 'light', 'clay'].includes(state.theme) ? state.theme : 'dark';
    const styleTheme = ['classic', 'brutalist', 'joy', 'glass'].includes(state.uiTheme) ? state.uiTheme : 'classic';

    root.classList.remove('light-theme', 'clay-theme');
    if (mainTheme === 'light') root.classList.add('light-theme');
    else if (mainTheme === 'clay') root.classList.add('clay-theme');
    root.dataset.theme = mainTheme === 'dark' ? 'dark' : 'light';
    root.dataset.lxTheme = styleTheme;
    root.classList.toggle('rounded-ui', state.roundedUI);
    root.classList.toggle('vertical-tabs', state.verticalTabs);

    const moonIcon = $('.moon-icon');
    const sunIcon = $('.sun-icon');
    const clayIcon = $('.clay-icon');
    if (moonIcon) moonIcon.style.display = mainTheme === 'dark' ? 'block' : 'none';
    if (sunIcon) sunIcon.style.display = mainTheme === 'light' ? 'block' : 'none';
    if (clayIcon) clayIcon.style.display = mainTheme === 'clay' ? 'block' : 'none';

    _randomizeGlassRipple();
  }

  function _prepareThemeRipple(event) {
    const root = document.documentElement;
    const x = event && typeof event.clientX === 'number' ? event.clientX : Math.round(window.innerWidth / 2);
    const y = event && typeof event.clientY === 'number' ? event.clientY : Math.round(window.innerHeight / 2);
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    root.style.setProperty('--ripple-cx', `${x}px`);
    root.style.setProperty('--ripple-cy', `${y}px`);
    root.style.setProperty('--ripple-radius', `${radius}px`);
    return { x, y, radius };
  }

  function _themeBackground(theme) {
    if (theme === 'light') return '#f8fafc';
    if (theme === 'clay') return '#f0eef5';
    return '#0b0f14';
  }

  function setColorTheme(theme, event) {
    const nextTheme = ['dark', 'light', 'clay'].includes(theme) ? theme : 'dark';
    const previousTheme = state.theme;
    if (previousTheme === nextTheme) {
      applyTheme();
      return;
    }
    const ripple = _prepareThemeRipple(event);
    const commit = () => {
      state.theme = nextTheme;
      localStorage.setItem('theme', state.theme);
      applyTheme();
    };
    if (typeof document.startViewTransition === 'function') {
      try {
        document.startViewTransition(commit);
        return;
      } catch (_error) {
        // Fall through to overlay fallback.
      }
    }

    const overlay = document.createElement('div');
    overlay.className = 'theme-ripple-fallback';
    overlay.style.background = _themeBackground(nextTheme);
    overlay.style.clipPath = `circle(0px at ${ripple.x}px ${ripple.y}px)`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.style.clipPath = `circle(${ripple.radius}px at ${ripple.x}px ${ripple.y}px)`;
    });
    setTimeout(commit, 180);
    setTimeout(() => overlay.remove(), 560);
  }

  function toggleTheme(event) {
    const order = ['dark', 'light', 'clay'];
    const idx = order.indexOf(state.theme);
    setColorTheme(order[(idx + 1) % order.length], event);
  }

  function setStyleTheme(theme, event) {
    const nextTheme = ['classic', 'brutalist', 'joy', 'glass'].includes(theme) ? theme : 'classic';
    if (state.uiTheme === nextTheme) return;

    const ripple = _prepareThemeRipple(event);
    const commit = () => {
      state.uiTheme = nextTheme;
      localStorage.setItem('sd-rescripts:ui-theme', state.uiTheme);
      applyTheme();
    };

    if (typeof document.startViewTransition === 'function') {
      try {
        document.startViewTransition(commit);
        return;
      } catch (_error) {
        // Fall through
      }
    }
    commit();
  }

  function toggleStyleTheme(event) {
    const order = ['classic', 'brutalist', 'joy', 'glass'];
    const idx = order.indexOf(state.uiTheme);
    setStyleTheme(order[(idx + 1) % order.length], event);
  }

  let _glassRippleTimer = null;
  function _startGlassRippleTimer() {
    if (_glassRippleTimer) return;
    _glassRippleTimer = setInterval(_randomizeGlassRipple, 10000); // match animation duration
  }
  _startGlassRippleTimer();

  return { applyLanguage, setLanguage, applyTheme, setColorTheme, toggleTheme, toggleStyleTheme };
}
