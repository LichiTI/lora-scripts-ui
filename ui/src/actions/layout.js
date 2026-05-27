// actions/layout.js — 布局偏好与顶底栏同步
//   applyLayoutPreferences / applyAndPersistLayout / resetTransientState
//   syncFooterAction / syncTopbarState / updateLayoutWidth
//
// 依赖（工厂注入）：state, getAvailableTabs
// 注：syncFooterAction 生成的 HTML 中有 onclick="executeTraining()" / "terminateAllTasks()" / "openAdvancedMonitor()" 依赖 window.* (后续 actions 挂上)

import { $, $$, _ico } from '../utils/dom.js';

export function createLayoutActions({ state, getAvailableTabs }) {
  function applyLayoutPreferences() {
    const showConfigChrome = state.activeModule === 'config';
    document.body.classList.toggle('show-config-chrome', showConfigChrome);
    document.documentElement.style.setProperty('--navigator-width', `${state.navigatorWidth}px`);
    document.documentElement.style.setProperty('--json-panel-width', `${state.jsonPanelWidth}px`);

    const navigator = $('#navigator');
    const expandBtn = $('#navigator-expand-btn');
    if (!showConfigChrome) {
      navigator?.classList.remove('collapsed');
      if (expandBtn) {
        expandBtn.style.display = 'none';
      }
      return;
    }

    // 在 config 模块下，根据持久化状态恢复 navigator 的折叠态
    navigator?.classList.toggle('collapsed', state.navigatorCollapsed);
    if (expandBtn) {
      expandBtn.style.display = state.navigatorCollapsed ? 'flex' : 'none';
    }
  }

  function applyAndPersistLayout() {
    localStorage.setItem('sd-rescripts:ui:navigator-width', String(state.navigatorWidth));
    localStorage.setItem('sd-rescripts:ui:json-width', String(state.jsonPanelWidth));
    applyLayoutPreferences();
  }

  function resetTransientState() {
    state.preflight = null;
    state.samplePrompt = null;
    state.lastMessage = '';
  }

  function syncFooterAction() {
    const bar = $('.bottom-bar');
    if (!bar) return;
    // 在 config 和 training 模块显示
    const showBar = state.activeModule === 'config' || state.activeModule === 'training';
    bar.style.display = showBar ? '' : 'none';
    if (!showBar) return;
    const hasRunningTask = state.tasks.some((task) => task.status === 'RUNNING');
    const hasFailedRecent = state.trainingFailed;
    const monitorButton = ''
      + '<button class="btn btn-monitor" type="button" onclick="openAdvancedMonitor()" title="打开 Lulynx 高级监控器">'
      +   '<span class="btn-main">' + _ico('activity') + ' 高级监控器</span>'
      + '</button>';

    if (hasRunningTask) {
      bar.innerHTML = ''
        + monitorButton
        + '<button class="btn btn-execute btn-training-active" disabled>'
        +   '<span class="btn-main">' + _ico('loader') + ' 训练中...</span>'
        + '</button>'
        + '<button class="btn btn-terminate" onclick="terminateAllTasks()">'
      +   '<span class="btn-main">' + _ico('square') + ' 终止训练</span>'
        + '</button>';
    } else if (hasFailedRecent) {
      bar.innerHTML = ''
        + monitorButton
        + '<button class="btn btn-execute btn-training-failed" onclick="executeTraining()">'
        +   '<span class="btn-main">' + _ico('refresh-cw') + ' 训练失败 — 点击重新训练</span>'
        + '</button>';
   } else {
      bar.innerHTML = `
        ${monitorButton}
        <button class="btn btn-primary btn-execute" onclick="executeTraining()" ${state.loading.run ? 'disabled' : ''}>
          <span class="btn-main">${state.loading.run ? '正在启动训练...' : '开始训练'}</span>
        </button>
      `;
    }
  }

  function syncTopbarState() {
    if (state.activeFieldMenu) {
      state.activeFieldMenu = null;
    }
    applyLayoutPreferences();

    // 根据当前训练类型决定哪些 tab 可见
    const availTabs = getAvailableTabs(state.activeTrainingType);
    const availKeys = new Set(availTabs.map((t) => t.key));

    // 如果当前 activeTab 在此类型下不存在，回退到第一个可用 tab
    if (!availKeys.has(state.activeTab)) {
      state.activeTab = availTabs[0]?.key || 'model';
      localStorage.setItem('sdxl_ui_tab', state.activeTab);
    }

    $$('.top-nav-item').forEach((item) => {
     const tab = item.dataset.tab;
      const visible = availKeys.has(tab);
      item.style.display = visible ? '' : 'none';
      item.classList.toggle('active', tab === state.activeTab);
    });
  }

  function updateLayoutWidth(target, rawValue, persist = true) {
    const value = Number(rawValue);
    if (Number.isNaN(value)) {
      return;
    }
    if (target === 'navigator') {
      state.navigatorWidth = value;
    } else if (target === 'json') {
      state.jsonPanelWidth = value;
    }
    if (persist) {
      applyAndPersistLayout();
    } else {
      applyLayoutPreferences();
    }
    if (state.activeModule === 'settings') {
      $('#navigator-width-value').textContent = `${state.navigatorWidth}px`;
      $('#json-width-value').textContent = `${state.jsonPanelWidth}px`;
    }
  }

  return {
    applyLayoutPreferences,
    applyAndPersistLayout,
    resetTransientState,
    syncFooterAction,
    syncTopbarState,
    updateLayoutWidth,
  };
}
