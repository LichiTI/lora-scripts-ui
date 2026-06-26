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

    applyAccentColor();

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

  // 强调色：仅 dark/light 生效；clay 主题固定薰衣草色，忽略强调色
  function applyAccentColor() {
    const root = document.documentElement;
    const color = state.accentColor;
    if (!color || color === 'default' || state.theme === 'clay') {
      root.removeAttribute('data-lx-accent');
    } else {
      root.setAttribute('data-lx-accent', color);
    }
  }

  function setAccentColor(color) {
    state.accentColor= color;
    localStorage.setItem('accentColor', color);
    applyAccentColor();
  }

  // ── Launcher 内嵌主题同步 ──────────────────────────────────────────────
  // 启动器「内嵌显示」用 iframe 加载本前端，并通过 URL 参数 launcher_theme=
  // 和 postMessage({type:'launcher:theme-change', theme}) 下发主题。
  // 这里只应用视觉（applyTheme），不写 localStorage —— 避免污染用户在
  // 独立浏览器打开本前端时保存的主题偏好。启动器只下发配色方案（dark/
  // light/clay），不含风格主题与强调色，二者仍由前端自身设置控制。
  function applyLauncherTheme(rawTheme) {
    var theme = ['dark', 'light', 'clay'].indexOf(rawTheme) !== -1 ? rawTheme : null;
    if (!theme || theme === state.theme) return;
    state.theme = theme;
    applyTheme();
  }

  function initLauncherThemeSync() {
    // 1. 首帧：读取 iframe src 上的 launcher_theme 参数
    try {
      var urlTheme = new URLSearchParams(window.location.search).get('launcher_theme');
      if (urlTheme) applyLauncherTheme(urlTheme);
    } catch (_e) { /* URLSearchParams 不可用时忽略 */ }
    // 2. 运行时：监听启动器切换主题的 postMessage
    window.addEventListener('message', function(event) {
      var data = event && event.data;
      if (data && data.type === 'launcher:theme-change' && typeof data.theme === 'string') {
        applyLauncherTheme(data.theme);
      }
    });
  }

  let _glassRippleTimer = null;
  function _startGlassRippleTimer() {
    if (_glassRippleTimer) return;
    _glassRippleTimer = setInterval(_randomizeGlassRipple, 10000); // match animation duration
  }
  _startGlassRippleTimer();

  return { applyLanguage, setLanguage, applyTheme, setColorTheme, toggleTheme, toggleStyleTheme, setAccentColor, initLauncherThemeSync };
}
