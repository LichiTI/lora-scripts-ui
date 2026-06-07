// renderers/settings.js — 设置页面渲染
// 依赖：state、t、escapeHtml、$、_ico、renderSlot
// 以及 actions 回调：applyAndPersistLayout, renderView, applyTheme, showToast
// 注：updateLayoutWidth 为 window 箭头函数，直接用 window.updateLayoutWidth 调用

import { $, escapeHtml, _ico } from '../utils/dom.js';

export function createSettingsRenderer({ state, t, renderSlot, applyAndPersistLayout, renderView, applyTheme, setColorTheme, showToast }) {
  return function(container) {
    const savedTbUrl = localStorage.getItem('sd-rescripts:tensorboard-url') || '';

    container.innerHTML = `
      <div class="form-container">
        <header class="section-title">
          <h2>${t('settings.title', state.lang)}</h2>
          <p>控制界面布局、训练 UI 配置等。</p>
        </header>

        <section class="form-section">
          <header class="section-header"><h3>界面布局</h3></header>
          <div class="section-content" style="display:block;">
            <div class="settings-row">
              <div>
                <label>${t('settings.theme', state.lang)}</label>
                <p class="field-desc">配色方案：只控制颜色，不影响动效与组件表现。</p>
              </div>
              <select id="theme-select">
                <option value="dark" ${state.theme === 'dark' ? 'selected' : ''}>${t('settings.dark', state.lang)}</option>
                <option value="light" ${state.theme === 'light' ? 'selected' : ''}>${t('settings.light', state.lang)}</option>
                <option value="clay" ${state.theme === 'clay' ? 'selected' : ''}>${state.lang === 'zh' ? '薰衣草' : '💜 Lavender'}</option>
              </select>
            </div>
            <div class="settings-row">
              <div>
                <label>风格主题</label>
                <p class="field-desc">表现效果：可与深色 / 浅色 / 薰衣草任意组合。<b>注意：液态玻璃（Glass）主题包含全局背景模糊与随机动态水波扩散效果，性能开销极大，如遇卡顿请切回经典。</b></p>
              </div>
              <select id="ui-theme-select">
                <option value="classic" ${(state.uiTheme || 'classic') === 'classic' ? 'selected' : ''}>经典</option>
                <option value="brutalist" ${state.uiTheme === 'brutalist' ? 'selected' : ''}>粗野</option>
                <option value="joy" ${state.uiTheme === 'joy' ? 'selected' : ''}>活泼</option>
                <option value="glass" ${state.uiTheme === 'glass' ? 'selected' : ''}>玻璃</option>
              </select>
            </div>
            <div class="settings-row">
              <div>
                <label>圆角模式</label>
                <p class="field-desc">开启后所有组件使用大圆角风格，关闭则使用默认方角。</p>
              </div>
              <label class="switch switch-compact">
                <input type="checkbox" id="rounded-ui-toggle" ${state.roundedUI ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>
            <div class="settings-row">
              <div>
                <label>标签栏竖排</label>
                <p class="field-desc">将顶部配置标签栏改为左侧竖向排列，适合宽屏或标签较多时使用。</p>
              </div>
              <label class="switch switch-compact">
                <input type="checkbox" id="vertical-tabs-toggle" ${state.verticalTabs ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>
            <div class="settings-row">
              <div>
                <label>配置页瀑布流模式</label>
                <p class="field-desc">开启后「配置」模块所有标签页的参数会在同一页中铺开，点击顶部标签会平滑滚动到对应分段。关闭后回到原本的分页式（每个标签栏一个页面）。</p>
              </div>
              <label class="switch switch-compact">
                <input type="checkbox" id="config-waterfall-toggle" ${state.configWaterfall ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>
            <div class="settings-row settings-sub-row ${state.configWaterfall ? '' : 'is-disabled'}">
              <div>
                <label>瀑布流紧凑双排</label>
                <p class="field-desc">仅在瀑布流模式开启时生效。把参数分段按左右两列排列，提高宽屏下的信息密度。</p>
              </div>
              <label class="switch switch-compact">
                <input type="checkbox" id="config-waterfall-two-column-toggle" ${state.configWaterfallTwoColumn ? 'checked' : ''} ${state.configWaterfall ? '' : 'disabled'}>
                <span class="slider round"></span>
              </label>
            </div>
            <div class="settings-row settings-slider-row">
              <label>左侧资源管理器宽度</label>
              <div class="settings-slider-control">
                <input type="range" id="navigator-width-slider" min="180" max="420" step="10" value="${state.navigatorWidth}">
                <strong id="navigator-width-value">${state.navigatorWidth}px</strong>
              </div>
            </div>
            <div class="settings-row settings-slider-row">
              <label>右侧参数预览宽度</label>
              <div class="settings-slider-control">
                <input type="range" id="json-width-slider" min="220" max="460" step="10" value="${state.jsonPanelWidth}">
                <strong id="json-width-value">${state.jsonPanelWidth}px</strong>
              </div>
            </div>
            <div class="settings-row">
              <label>布局重置</label>
              <button class="btn btn-outline btn-sm" type="button" id="reset-layout-btn">恢复默认</button>
            </div>
          </div>
        </section>

        <section class="form-section">
          <header class="section-header"><h3>训练 UI 设置</h3></header>
          <div class="section-content" style="display:block;">
            <div class="settings-row">
              <div>
                <label>tensorboard_url</label>
                <p class="field-desc">TensorBoard 地址，留空则使用默认端口 6006。</p>
              </div>
              <input class="text-input" type="text" id="settings-tb-url" value="${escapeHtml(savedTbUrl)}" placeholder="http://127.0.0.1:6006" style="width:280px;">
            </div>
            <div class="settings-row">
              <button class="btn btn-primary btn-sm" type="button" id="save-ui-settings-btn">保存训练 UI 设置</button>
            </div>
          </div>
        </section>

        ${renderSlot('settings.section')}
      </div>
    `;

    $('#theme-select')?.addEventListener('change', (e) => {
      if (typeof setColorTheme === 'function') setColorTheme(e.target.value, e);
      else { state.theme = e.target.value; localStorage.setItem('theme', state.theme); applyTheme(); }
    });
    $('#ui-theme-select')?.addEventListener('change', (e) => { state.uiTheme = e.target.value; localStorage.setItem('sd-rescripts:ui-theme', state.uiTheme); applyTheme(); });
    $('#rounded-ui-toggle')?.addEventListener('change', (e) => {
      state.roundedUI = e.target.checked; localStorage.setItem('roundedUI', state.roundedUI); applyTheme();
    });
    $('#vertical-tabs-toggle')?.addEventListener('change', (e) => {
      state.verticalTabs = e.target.checked; localStorage.setItem('verticalTabs', state.verticalTabs); applyTheme();
    });
    $('#config-waterfall-toggle')?.addEventListener('change', (e) => {
      state.configWaterfall = e.target.checked;
      localStorage.setItem('sd-rescripts:config-waterfall', state.configWaterfall ? 'true' : 'false');
      showToast(state.configWaterfall ? '已开启瀑布流模式' : '已关闭瀑布流模式');
      renderView('settings');
      // 当前如果正在配置页，立即生效；否则下次进入配置页生效
    });
    $('#config-waterfall-two-column-toggle')?.addEventListener('change', (e) => {
      state.configWaterfallTwoColumn = e.target.checked;
      localStorage.setItem('sd-rescripts:config-waterfall-two-column', state.configWaterfallTwoColumn ? 'true' : 'false');
      showToast(state.configWaterfallTwoColumn ? '已开启瀑布流紧凑双排' : '已关闭瀑布流紧凑双排');
    });
    $('#navigator-width-slider')?.addEventListener('input', (e) => window.updateLayoutWidth('navigator', e.target.value, false));
    $('#navigator-width-slider')?.addEventListener('change', (e) => window.updateLayoutWidth('navigator', e.target.value, true));
    $('#json-width-slider')?.addEventListener('input', (e) => window.updateLayoutWidth('json', e.target.value, false));
    $('#json-width-slider')?.addEventListener('change', (e) => window.updateLayoutWidth('json', e.target.value, true));
    $('#reset-layout-btn')?.addEventListener('click', () => {
      state.navigatorWidth = state.layoutDefaults.navigatorWidth;
      state.jsonPanelWidth = state.layoutDefaults.jsonPanelWidth;
      applyAndPersistLayout();
      renderView('settings');
    });
    $('#save-ui-settings-btn')?.addEventListener('click', () => {
      localStorage.setItem('sd-rescripts:tensorboard-url', $('#settings-tb-url')?.value?.trim() || '');
      showToast('训练 UI 设置已保存。');
    });
  };
}
