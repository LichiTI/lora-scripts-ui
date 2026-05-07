import { $, $$, icon as _ico } from '../utils/dom.js';
import {
  persistJsonPanelCollapsed,
  persistLayoutWidths,
  persistNavigatorCollapsed,
} from '../utils/preferences.js';

export function createAppShellController({
  state,
  trainingTypes,
  topbarTabs,
  getAvailableTabs,
  getFieldDefinition,
  buildRunConfig,
  saveDraft,
  renderView,
  t,
}) {
  function renderNavigator() {
    const trainingTypeList = $('#section-training-types .group-list');
    if (trainingTypeList) {
      const groups = {};
      for (const tt of trainingTypes) {
        if (!groups[tt.group]) groups[tt.group] = [];
        groups[tt.group].push(tt);
      }
      // 默认折叠的组
      const defaultCollapsed = new Set(['ControlNet', 'Textual Inversion', '其他模型训练']);
      const _collapsedGroups = state._collapsedTrainingGroups || (state._collapsedTrainingGroups = new Set(defaultCollapsed));
      // 仅在用户切换训练类型时自动展开该组（通过标记避免每次渲染都展开）
      const activeGroup = trainingTypes.find(t => t.id === state.activeTrainingType)?.group || '';
      if (activeGroup && _collapsedGroups.has(activeGroup) && state._lastExpandedForType !== state.activeTrainingType) {
        _collapsedGroups.delete(activeGroup);
        state._lastExpandedForType = state.activeTrainingType;
      }

      trainingTypeList.innerHTML = Object.entries(groups).map(([group, items]) => {
        const collapsed = _collapsedGroups.has(group);
        const arrow = collapsed ? '▸' : '▾';
        return `<li class="group-header${collapsed ? ' collapsed' : ''}" onclick="toggleTrainingGroup('${group}')">`
          + `<span class="group-arrow">${arrow}</span> ${group} <span class="group-count">${items.length}</span></li>`
          + (collapsed ? '' : items.map((tt) =>
              `<li class="${tt.id === state.activeTrainingType ? 'active' : ''}" onclick="switchTrainingType('${tt.id}')">${tt.label}</li>`
            ).join(''));
      }).join('');
    }

    const presetPanel = $('#panel-preset-actions');
    if (presetPanel) {
      presetPanel.innerHTML = `
        <div class="panel-preset-title">参数管理</div>
        <div class="panel-preset-grid">
          <button class="btn btn-outline btn-sm" type="button" onclick="resetAllParams()">重置参数</button>
          <button class="btn btn-outline btn-sm" type="button" onclick="saveCurrentParams()">保存参数</button>
          <button class="btn btn-outline btn-sm" type="button" onclick="loadSavedParams()">读取参数</button>
          <button class="btn btn-outline btn-sm" type="button" onclick="downloadConfigFile()">导出文件</button>
          <button class="btn btn-outline btn-sm" type="button" onclick="importConfigFile()">导入文件</button>
        </div>
      `;
    }

  }

  function toggleTrainingGroup(group) {
    if (!state._collapsedTrainingGroups) state._collapsedTrainingGroups = new Set();
    if (state._collapsedTrainingGroups.has(group)) {
      state._collapsedTrainingGroups.delete(group);
    } else {
      state._collapsedTrainingGroups.add(group);
    }
    renderNavigator();
  };

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

    navigator?.classList.toggle('collapsed', state.navigatorCollapsed);
    if (expandBtn) {
      expandBtn.style.display = state.navigatorCollapsed ? 'flex' : 'none';
    }
  }

  function applyAndPersistLayout() {
    persistLayoutWidths({
      navigatorWidth: state.navigatorWidth,
      jsonPanelWidth: state.jsonPanelWidth,
    });
    applyLayoutPreferences();
  }

  function resetTransientState() {
    state.preflight = null;
    state.samplePrompt = null;
    state.lastMessage = '';
  }

  function syncConfigState() {
    saveDraft();
    updateJSONPreview();
    refreshFieldHighlights();
  }

  function refreshFieldHighlights() {
    document.querySelectorAll('.config-group[data-field-key]').forEach((el) => {
      const key = el.dataset.fieldKey;
      const field = getFieldDefinition(key);
      if (!field) return;
      const value = state.config[key];
      const defaultValue = field.defaultValue ?? '';
      const isModified = String(value ?? '') !== String(defaultValue);
      el.classList.toggle('field-modified', isModified);
    });
  }

  function getPresetLabel(preset, index) {
    if (preset?.name) {
      return preset.name;
    }
    if (preset?.output_name) {
      return preset.output_name;
    }
    return `预设 ${index + 1}`;
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

    if (hasRunningTask) {
      bar.innerHTML = ''
        + '<button class="btn btn-execute btn-training-active" disabled>'
        +   '<span class="btn-main">' + _ico('loader') + ' 训练中...</span>'
        + '</button>'
        + '<button class="btn btn-terminate" onclick="terminateAllTasks()">'
        +   '<span class="btn-main">' + _ico('square') + ' 终止训练</span>'
        + '</button>';
    } else if (hasFailedRecent) {
      bar.innerHTML = ''
        + '<button class="btn btn-execute btn-training-failed" onclick="executeTraining()">'
        +   '<span class="btn-main">' + _ico('refresh-cw') + ' 训练失败 — 点击重新训练</span>'
        + '</button>';
    } else {
      bar.innerHTML = `
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

  function renderTaskStatus() {
    const taskCard = $('#task-status-card .status-value');
    const taskSub = $('#task-status-card .status-sub');
    if (!taskCard || !taskSub) {
      return;
    }

    // 后端离线提示
    if (state.backendOffline) {
      taskCard.textContent = '—';
      taskSub.innerHTML = '<span style="color:#ef4444;">⚠ 后端未连接 (28000)</span>';
      return;
    }

    const running = state.tasks.filter((task) => task.status === 'RUNNING');
    taskCard.textContent = String(running.length);
    taskSub.textContent = running.length > 0 ? `有 ${running.length} 个任务运行中` : '空闲';
  }

  function setupJsonPanel() {
    const panel = $('.json-panel');
    const toggleBtn = $('#json-panel-toggle');
    const toggleIcon = $('#json-panel-toggle use');
    if (!panel || !toggleBtn || !toggleIcon) {
      return;
    }

    const applyPanelState = () => {
      panel.classList.toggle('collapsed', state.jsonPanelCollapsed);
      toggleBtn.title = state.jsonPanelCollapsed ? '展开参数预览' : '收起参数预览';
      toggleIcon.setAttribute('href', state.jsonPanelCollapsed ? '#icon-chevron-left' : '#icon-chevron-right');
    };

    toggleBtn.addEventListener('click', () => {
      state.jsonPanelCollapsed = !state.jsonPanelCollapsed;
      persistJsonPanelCollapsed(state.jsonPanelCollapsed);
      applyPanelState();
    });

    applyPanelState();
  }

  function setupSidebar() {
    $$('.nav-item').forEach((item) => {
      item.addEventListener('click', (event) => {
        event.preventDefault();
        const module = item.dataset.module;
        if (!module) {
          return;
        }
        $$('.nav-item').forEach((navItem) => navItem.classList.remove('active'));
        item.classList.add('active');
        state.activeModule = module;
        renderView(module);
      });
    });

    $('#theme-toggle')?.addEventListener('click', toggleTheme);
  }

  function setupTopbar() {
    $$('.top-nav-item').forEach((item, index) => {
      const tabKey = topbarTabs[index];
      if (!tabKey) {
        item.style.display = 'none';
        return;
      }
      item.dataset.tab = tabKey;
      item.addEventListener('click', (event) => {
        event.preventDefault();
        state.activeTab = tabKey;
        localStorage.setItem('sdxl_ui_tab', tabKey);
        if (state.activeModule === 'config') {
          renderView('config');
        } else {
          syncTopbarState();
        }
      });
    });
    syncTopbarState();
  }

  function setupNavigator() {
    const nav = $('#navigator');
    const collapseBtn = $('#navigator-collapse-btn');
    const expandBtn = $('#navigator-expand-btn');

    const updateNavUI = () => {
      if (state.activeModule !== 'config') {
        return;
      }
      nav?.classList.toggle('collapsed', state.navigatorCollapsed);
      if (expandBtn) {
        expandBtn.style.display = state.navigatorCollapsed ? 'flex' : 'none';
      }
    };

    collapseBtn?.addEventListener('click', () => {
      state.navigatorCollapsed = true;
      persistNavigatorCollapsed(state.navigatorCollapsed);
      updateNavUI();
    });
    expandBtn?.addEventListener('click', () => {
      state.navigatorCollapsed = false;
      persistNavigatorCollapsed(state.navigatorCollapsed);
      updateNavUI();
    });
    updateNavUI();

    $$('.nav-section .section-header.collapsible').forEach((header) => {
      header.addEventListener('click', () => {
        const section = header.closest('.nav-section');
        if (!section) return;
        const sectionId = section.id.replace('section-', '');
        state.sections[sectionId] = !state.sections[sectionId];
        section.classList.toggle('collapsed', !state.sections[sectionId]);
      });
    });
  }
  function updateJSONPreview() {
    const jsonViewer = $('#json-viewer code');
    if (!jsonViewer) {
      return;
    }

    const payload = buildRunConfig(state.config, state.activeTrainingType);
    jsonViewer.textContent = JSON.stringify(payload, null, 2);
  }

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

  function bindGlobals(targetWindow) {
    targetWindow.toggleTrainingGroup = toggleTrainingGroup;
    targetWindow.setLanguage = setLanguage;
    targetWindow.toggleTheme = toggleTheme;
  }

  return {
    renderNavigator,
    toggleTrainingGroup,
    applyLayoutPreferences,
    applyAndPersistLayout,
    resetTransientState,
    syncConfigState,
    refreshFieldHighlights,
    getPresetLabel,
    syncFooterAction,
    syncTopbarState,
    renderTaskStatus,
    setupJsonPanel,
    setupSidebar,
    setupTopbar,
    setupNavigator,
    updateJSONPreview,
    applyLanguage,
    setLanguage,
    applyTheme,
    toggleTheme,
    bindGlobals,
  };
}
