import { $, $$, escapeHtml } from '../utils/dom.js';
import { ALL_OPTIMIZERS, ALL_SCHEDULERS } from './settingsOptions.js';

export function renderSettingsPage(container, deps) {
  const {
    state,
    t,
    renderSlot,
    applyTheme,
    updateLayoutWidth,
    applyAndPersistLayout,
    renderView,
    activateUiProfile,
    showToast,
    builtinLegacyUiProfileId,
  } = deps;

  const allOptimizers = ALL_OPTIMIZERS;
  const allSchedulers = ALL_SCHEDULERS;
  const savedTbUrl = localStorage.getItem('sd-rescripts:tensorboard-url') || '';
  const savedOptimizers = JSON.parse(localStorage.getItem('sd-rescripts:visible-optimizers') || '[]');
  const savedSchedulers = JSON.parse(localStorage.getItem('sd-rescripts:visible-schedulers') || '[]');

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
            <label>${t('settings.theme', state.lang)}</label>
            <select id="theme-select">
              <option value="dark" ${state.theme === 'dark' ? 'selected' : ''}>${t('settings.dark', state.lang)}</option>
              <option value="light" ${state.theme === 'light' ? 'selected' : ''}>${t('settings.light', state.lang)}</option>
              <option value="clay" ${state.theme === 'clay' ? 'selected' : ''}>${state.lang === 'zh' ? '薰衣草' : '💜 Lavender'}</option>
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
          <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:8px;">
            <div>
              <label>visible_optimizers</label>
              <p class="field-desc">优化器显示列表（可多选，留空=显示全部）</p>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;" id="settings-optimizers">
              ${allOptimizers.map((o) => `<label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" value="${o}" ${savedOptimizers.includes(o) ? 'checked' : ''}>${o}</label>`).join('')}
            </div>
          </div>
          <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:8px;">
            <div>
              <label>visible_lr_schedulers</label>
              <p class="field-desc">调度器显示列表（可多选，留空=显示全部）</p>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;" id="settings-schedulers">
              ${allSchedulers.map((s) => `<label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" value="${s}" ${savedSchedulers.includes(s) ? 'checked' : ''}>${s}</label>`).join('')}
            </div>
          </div>
          <div class="settings-row">
            <button class="btn btn-primary btn-sm" type="button" id="save-ui-settings-btn">保存训练 UI 设置</button>
          </div>
        </div>
      </section>

      <section class="form-section">
        <header class="section-header"><h3>UI 切换</h3></header>
        <div class="section-content" style="display:block;">
          <div class="settings-row" style="align-items:flex-start;">
            <div>
              <label>切换回经典 UI</label>
              <p class="field-desc">当前正在使用新 UI。如果想返回原本的内置界面，可以直接在这里切换。</p>
            </div>
            <button class="btn btn-outline btn-sm" type="button" id="switch-legacy-ui-btn">切换回经典 UI</button>
          </div>
        </div>
      </section>

      ${renderSlot('settings.section')}
    </div>
  `;

  $('#theme-select')?.addEventListener('change', (event) => {
    state.theme = event.target.value;
    localStorage.setItem('theme', state.theme);
    applyTheme();
  });
  $('#rounded-ui-toggle')?.addEventListener('change', (event) => {
    state.roundedUI = event.target.checked;
    localStorage.setItem('roundedUI', state.roundedUI);
    applyTheme();
  });
  $('#vertical-tabs-toggle')?.addEventListener('change', (event) => {
    state.verticalTabs = event.target.checked;
    localStorage.setItem('verticalTabs', state.verticalTabs);
    applyTheme();
  });
  $('#navigator-width-slider')?.addEventListener('input', (event) => updateLayoutWidth('navigator', event.target.value, false));
  $('#navigator-width-slider')?.addEventListener('change', (event) => updateLayoutWidth('navigator', event.target.value, true));
  $('#json-width-slider')?.addEventListener('input', (event) => updateLayoutWidth('json', event.target.value, false));
  $('#json-width-slider')?.addEventListener('change', (event) => updateLayoutWidth('json', event.target.value, true));
  $('#reset-layout-btn')?.addEventListener('click', () => {
    state.navigatorWidth = state.layoutDefaults.navigatorWidth;
    state.jsonPanelWidth = state.layoutDefaults.jsonPanelWidth;
    applyAndPersistLayout();
    renderView('settings');
  });
  $('#save-ui-settings-btn')?.addEventListener('click', () => {
    localStorage.setItem('sd-rescripts:tensorboard-url', $('#settings-tb-url')?.value?.trim() || '');
    const checkedOpts = [...$$('#settings-optimizers input:checked')].map((input) => input.value);
    localStorage.setItem('sd-rescripts:visible-optimizers', JSON.stringify(checkedOpts));
    const checkedScheds = [...$$('#settings-schedulers input:checked')].map((input) => input.value);
    localStorage.setItem('sd-rescripts:visible-schedulers', JSON.stringify(checkedScheds));
    showToast('训练 UI 设置已保存。');
  });
  $('#switch-legacy-ui-btn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '切换中...';
    try {
      await activateUiProfile(builtinLegacyUiProfileId);
      showToast('已切换到经典 UI，正在刷新...');
      setTimeout(() => {
        window.location.reload();
      }, 250);
    } catch (error) {
      button.disabled = false;
      button.textContent = originalText;
      showToast(error.message || '切换 UI 失败。');
    }
  });
}
