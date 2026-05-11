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

  function applyTheme() {
    const root = document.documentElement;
    root.classList.remove('light-theme', 'clay-theme');
    if (state.theme === 'light') root.classList.add('light-theme');
    else if (state.theme === 'clay') root.classList.add('clay-theme');
    root.classList.toggle('rounded-ui', state.roundedUI);
  root.classList.toggle('vertical-tabs', state.verticalTabs);
    const moonIcon = $('.moon-icon');
    const sunIcon = $('.sun-icon');
    const clayIcon = $('.clay-icon');
    if (moonIcon) moonIcon.style.display = state.theme === 'dark' ? 'block' : 'none';
    if (sunIcon) sunIcon.style.display = state.theme === 'light' ? 'block' : 'none';
    if (clayIcon) clayIcon.style.display = state.theme === 'clay' ? 'block' : 'none';
}

  function toggleTheme() {
    const order = ['dark', 'light', 'clay'];
    const idx = order.indexOf(state.theme);
    state.theme = order[(idx + 1) % order.length];
   localStorage.setItem('theme', state.theme);
    applyTheme();
  }

  return { applyLanguage, setLanguage, applyTheme, toggleTheme };
}
