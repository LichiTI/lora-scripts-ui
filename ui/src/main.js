﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { t } from './i18n.js';
import { api } from './api.js';
import {
  pluginStore,
  loadPluginRuntime,
  loadPluginCapabilities,
  loadPluginHooks,
  loadPluginAudit,
  reloadAllPlugins,
  approvePlugin,
  revokePlugin,
  toggleDeveloperMode,
  renderSlot,
  getRegisteredSlots,
} from './pluginHost.js';
import {
  UI_TABS,
  SDXL_SECTIONS,
  TRAINING_TYPES,
  applyBackendConfigOptions,
  buildRunConfig,
  createDefaultConfig,
  getAvailableTabs,
  getFieldDefinition,
  getSectionsForTab,
  getSectionsForType,
  isFieldVisible,
  normalizeDraftValue,
} from './sdxlSchema.js';
import {
  SCHEDULER_TYPE_TO_VALUE,
} from './features/settingsOptions.js';
import {
  TOPBAR_TABS,
  CONDITIONAL_KEYS,
  COLLAPSIBLE_FIELD_KEYS,
  DRAFT_STORAGE_KEY,
  DELETED_TASK_IDS_STORAGE_KEY,
} from './utils/constants.js';
import { $, $$, escapeHtml, _ico, showToast } from './utils/dom.js';
import {
  readUiPreferences,
  readDraftFromStorage,
  writeDraftToStorage,
  loadDeletedTaskIds as _readDeletedIdsFromStorage,
  persistDeletedTaskIds as _persistDeletedIdsToStorage,
} from './utils/storage.js';
import { configToToml as _configToToml, parseSimpleToml as _parseSimpleToml } from './utils/toml.js';
import {
  renderLogLines as _renderLogLines,
  createTrainingLogCursor,
  mergeTrainingLogLines,
  collectIncrementalTrainingLogLines,
} from './utils/logRender.js';
import {
  collectTrainingMetrics as _collectTrainingMetricsFromLines,
  parseLinesIntoMetrics,
  formatDuration,
  buildSummaryFromMetrics,
  generateTrainingSummary as _generateSummaryFromMetrics,
  generateSummaryFromTaskLog,
  renderSummaryCard,
  _appendSageEnvNote,
} from './utils/trainingMetrics.js';

import { renderAbout, renderGuide, renderLogs, refreshTensorBoardStatus, startTensorBoardFromLogs, stopTensorBoardFromLogs, createBuiltinPickerRenderer, createStatusDeckRenderer, createNavigatorRenderer, createSettingsRenderer, createConfigFormRenderer, createPreflightRenderer, createSamplesRenderer, createWizardRenderer, createPluginsRenderer, createToolsRenderer, createDatasetRenderer, createSysMonitorRenderer, createTrainingRenderer, renderTurboCore, turboCoreProbeStatus, turboCoreCopyFlags } from './renderers/index.js';
import { createThemeActions, createTrainTabsActions, createJsonPanelActions, createFieldMenuActions, createTaskHistoryActions, createSearchActions, createPickerActions, createLayoutActions, createConfigActions, createSampleActions, createWizardActions, createPluginsActions, createToolsActions, createNavActions, createRuntimeActions, createTerminateActions, createSavedConfigsActions, createTrainingActions, createTrainingMetadataActions } from './actions/index.js';


const uiPreferences = readUiPreferences();

const state = {
  compactLayout: false,
  importInputBound: false,
  pickerInputBound: false,
  navigatorWidth: uiPreferences.navigatorWidth,
  jsonPanelWidth: uiPreferences.jsonPanelWidth,
  fieldUndo: {},
  activeFieldMenu: null,
  datasetSubTab: 'tagger',
  trainSubTab: 'monitor',
  selectedTool: '',
  builtinPicker: {
    open: false,
    fieldKey: '',
    pickerType: '',
    rootLabel: '',
    items: [],
  },
  layoutDefaults: {
    compactLayout: false,
    navigatorWidth: 240,
    jsonPanelWidth: 280,
  },
  jsonPanelCollapsed: uiPreferences.jsonPanelCollapsed,
  lang: 'zh',
  theme: uiPreferences.theme,
  roundedUI: uiPreferences.roundedUI,
  verticalTabs: uiPreferences.verticalTabs,
  configWaterfall: localStorage.getItem('sd-rescripts:config-waterfall') === 'true',
  activeModule: 'config',
  activeTab: uiPreferences.activeTab,
  navigatorCollapsed: uiPreferences.navigatorCollapsed,
  sections: {
    'training-types': true,
    'preset-list': true,
  },
  accentColor: localStorage.getItem('accentColor') || null,
  activeTrainingType: uiPreferences.activeTrainingType,
  config: createDefaultConfig(uiPreferences.activeTrainingType),
  hasLocalDraft: false,
  presets: [],
  tasks: [],
  trainingFailed: false,
  taskSummaries: {},
  trainingSummary: null,
  trainingLogSnapshot: {
    taskId: '',
    html: '',
    updatedAt: 0,
  },
  activeTrainingTaskId: '',
  trainingMetrics: {
    speeds: [],       // { time, itPerSec }
    losses: [],       // { time, step, loss }
    epochs: [],       // { epoch, total }
    startTime: null,
    lastStep: 0,
    totalSteps: 0,
  },
  interrogators: null,
  runtime: null,
  preflight: null,
  datasetAnalysis: null,
  samplePrompt: null,
  runtimeError: '',
  lastMessage: '',
  backendOffline: false,
  sysMonitor: null,
  _taskHistoryDirty: false,
  _deletedTaskIds: _readDeletedIdsFromStorage(),
  loading: {
    runtime: false,
    preflight: false,
    samplePrompt: false,
    run: false,
  },
};

// renderers 工厂装配（Stage 2 增量迁移，随模块到位逐步展开）
const renderBuiltinPickerModal = createBuiltinPickerRenderer(state);
// 共享 deps 对象解决 statusDeck <-> preflight 循环依赖
const _rendererDeps = {};
const {
  renderGpuInfo,
  renderStatusDeck,
  renderTaskStatus,
} = createStatusDeckRenderer({ state, deps: _rendererDeps });
// preflight renderer
const {
  renderPreflightDetail,
  renderPreflightOverviewPanel,
  renderPreflightActionPanel,
  renderPreflightReport,
  renderPreflightPanel,
  _pfTag,
  _pfMetric,
} = createPreflightRenderer({ state, deps: _rendererDeps });
// 反向注入 deps，完成两边互相可见
_rendererDeps.renderStatusDeck = renderStatusDeck;
_rendererDeps.renderPreflightDetail = renderPreflightDetail;
// configForm renderer（field / section / sectionGroups 全集）
const {
  renderField,
  renderFieldDescription,
  renderSection,
  renderDatasetSettingsContent,
  renderCaptionSettingsContent,
  renderNetworkSettingsContent,
  renderOptimizerSettingsContent,
  renderTrainingSettingsContent,
  renderNetworkOptionGroup,
  renderCaptionTagDropoutGroup,
  renderRegularizationFieldGroup,
} = createConfigFormRenderer({ state, canUseBuiltinPicker, isFieldVisible, COLLAPSIBLE_FIELD_KEYS });
// samples renderer（含 5 个渲染函数 + 3 个 action，状态在闭包内维护）
const {
  renderSamplesPanel,
  refreshSampleImages,
  applySampleSort,
  applySampleFilter,
  getSortedSamples: _samplesGetSorted,
} = createSamplesRenderer({ api });
window.refreshSampleImages = refreshSampleImages;
window.applySampleSort = applySampleSort;
window.applySampleFilter = applySampleFilter;
window.refreshTensorBoardStatus = refreshTensorBoardStatus;
window.startTensorBoardFromLogs = startTensorBoardFromLogs;
window.stopTensorBoardFromLogs = stopTensorBoardFromLogs;

// wizard renderer（updateConfigValue 是 window 箭头函数，运行时延迟取）
const { renderWizard } = createWizardRenderer({ state, updateConfigValue: (k, v) => window.updateConfigValue(k, v), getFieldDefinition });
// plugins renderer
const {
  renderPlugins,
  _loadAndRenderPlugins,
  _formatPluginAuditDetail,
} = createPluginsRenderer({ pluginStore, loadPluginRuntime, getRegisteredSlots, api });
// tools renderer
const { renderTools, renderToolDetail } = createToolsRenderer({ state, renderSlot });
// dataset renderer + actions
const {
  renderDataset,
  switchDatasetTab,
  runTagger,
  runLlmTagger,
  refreshTagEditorIframe,
  runImageResize,
  runDatasetAnalysis,
  previewDatasetAnalysis,
  startDatasetAnalysis,
  loadCachedDatasetAnalysis,
  cancelDatasetAnalysisJob,
  viewReviewQueue,
  inspectFindingImage,
  sendFindingToSuggestions,
  loadTagSuggestions,
  refreshTagSuggestionsIndex,
  refineTagSuggestionsWithLlm,
  useSuggestionPreview,
  runCaptionCleanupPreview,
  runCaptionCleanupApply,
  cancelCleanupJob,
  createCaptionBackup,
  listCaptionBackups,
  restoreCaptionBackup,
  runMaskedLossAudit,
} = createDatasetRenderer({ state, api, showToast, renderView });
window.switchDatasetTab = switchDatasetTab;
window.runTagger = runTagger;
window.runLlmTagger = runLlmTagger;
window.refreshTagEditorIframe = refreshTagEditorIframe;
window.runImageResize = runImageResize;
window.runDatasetAnalysis = runDatasetAnalysis;
window.previewDatasetAnalysis = previewDatasetAnalysis;
window.startDatasetAnalysis = startDatasetAnalysis;
window.loadCachedDatasetAnalysis = loadCachedDatasetAnalysis;
window.cancelDatasetAnalysisJob = cancelDatasetAnalysisJob;
window.viewReviewQueue = viewReviewQueue;
window.inspectFindingImage = inspectFindingImage;
window.sendFindingToSuggestions = sendFindingToSuggestions;
window.loadTagSuggestions = loadTagSuggestions;
window.refreshTagSuggestionsIndex = refreshTagSuggestionsIndex;
window.refineTagSuggestionsWithLlm = refineTagSuggestionsWithLlm;
window.useSuggestionPreview = useSuggestionPreview;
window.runCaptionCleanupPreview = runCaptionCleanupPreview;
window.runCaptionCleanupApply = runCaptionCleanupApply;
window.cancelCleanupJob = cancelCleanupJob;
window.createCaptionBackup = createCaptionBackup;
window.listCaptionBackups = listCaptionBackups;
window.restoreCaptionBackup = restoreCaptionBackup;
window.runMaskedLossAudit = runMaskedLossAudit;
// sysMonitor renderer
const { _buildSysMonitorHTML } = createSysMonitorRenderer({ state });
// training renderer（renderTraining + renderTrainingSummaryHTML）
// 副作用函数 syncFooterAction / startTrainingLogPolling / startSysMonitorPolling /
// _pollSystemMonitor 都在 main.js 后续定义；由于它们是 `function` 声明（hoisted），
// 这里通过 getter 在调用时再读取，避免初始化次序问题。
const _trainingDeps = {
  renderPreflightPanel,
  renderSamplesPanel,
  _buildSysMonitorHTML,
  get syncFooterAction() { return syncFooterAction; },
  get startTrainingLogPolling() { return startTrainingLogPolling; },
  get startSysMonitorPolling() { return startSysMonitorPolling; },
  get _pollSystemMonitor() {return _pollSystemMonitor;},
};
const { renderTraining, renderTrainingSummaryHTML } = createTrainingRenderer({ state, renderSlot, deps: _trainingDeps });

// ===== actions 装配（Stage 3，逐步补充）=====
const { applyLanguage, setLanguage, applyTheme, toggleTheme } = createThemeActions({ state, t, renderView });
// trainTabs：scanDataset 仍为 main.js 中后续声明的 window.scanDataset；用闭包 lambda 延迟取
const { switchTrainTab } = createTrainTabsActions({
  state,
  renderView,
  scanDataset:() => window.scanDataset?.(),
  refreshSampleImages,
});
const { setupJsonPanel, updateJSONPreview } = createJsonPanelActions({ state, buildRunConfig });
const { setupFieldMenus } = createFieldMenuActions({ state, getFieldDefinition });
window.switchTrainTab = switchTrainTab;
// taskHistory 包含 mergeTaskHistory / deleteTaskHistory / clearAllTaskHistory 等
// 注意：getPendingTrainingMetadata / applyTaskMetadata / rememberTrainingTaskMetadata
// 现在来自 trainingMetadata 工厂（L900+ 才装配），用 getter 延迟取以避免 TDZ。
const _taskHistoryDeps = {
  state,
  api,
  showToast,
  getPersistableTasks,
  persistDeletedTaskIds,
  renderView,
  renderTaskStatus,
  get getPendingTrainingMetadata() { return getPendingTrainingMetadata; },
  get applyTaskMetadata() { return applyTaskMetadata; },
  get rememberTrainingTaskMetadata() { return rememberTrainingTaskMetadata; },
};
const {
  loadLocalTaskHistory,
  saveLocalTaskHistory,
  mergeTaskHistory,
  deleteTaskHistory,
  clearAllTaskHistory,
} = createTaskHistoryActions(_taskHistoryDeps);
window.deleteTaskHistory = deleteTaskHistory;
window.clearAllTaskHistory = clearAllTaskHistory;
// search
const { setupTopbarSearch, jumpToConfigField } = createSearchActions({ state, UI_TABS, getSectionsForType, renderView });
window.jumpToConfigField = jumpToConfigField;
// picker actions
const {
  pickPath,
  pickPathForInput,
  openNativePicker,
  closeBuiltinPicker,
  refreshBuiltinPicker,
  selectBuiltinPickerItem,
  selectBuiltinPickerCurrentRoot,
  openBuiltinPickerForInput,
  setupNativePicker,
} = createPickerActions({ state, api, showToast, renderView, renderBuiltinPickerModal });
window.pickPath = pickPath;
window.pickPathForInput = pickPathForInput;
window.openNativePicker = openNativePicker;
window.closeBuiltinPicker = closeBuiltinPicker;
window.refreshBuiltinPicker = refreshBuiltinPicker;
window.selectBuiltinPickerItem = selectBuiltinPickerItem;
window.selectBuiltinPickerCurrentRoot = selectBuiltinPickerCurrentRoot;
window.openBuiltinPickerForInput = openBuiltinPickerForInput;












// loadDeletedTaskIds 直接使用 utils/storage.js 的导出（已在顶部 import）
// 这里保留 0 参数封装供 onclick / window 引用：从 state._deletedTaskIds 取再写入
function persistDeletedTaskIds() {
  _persistDeletedIdsToStorage(state._deletedTaskIds || []);
}

window.persistDeletedTaskIds = persistDeletedTaskIds;

const PERSISTED_TASK_STATUSES = new Set(['FINISHED', 'COMPLETED', 'TERMINATED', 'FAILED', 'CANCELLED']);

function isTerminalTaskStatus(status) {
  return PERSISTED_TASK_STATUSES.has(String(status || '').trim().toUpperCase());
}

function isDeveloperModeEnabled() {
  if (pluginStore.runtime && typeof pluginStore.runtime.developer_mode !== 'undefined') {
    return !!pluginStore.runtime.developer_mode;
  }
  return localStorage.getItem('sd-rescripts:developer-mode') === 'true';
}

function syncDeveloperOnlyChrome() {
  const enabled = isDeveloperModeEnabled();
  document.body.classList.toggle('developer-mode-enabled', enabled);
  localStorage.setItem('sd-rescripts:developer-mode', enabled ? 'true' : 'false');

  if (!enabled && state.activeModule === 'turbocore') {
    state.activeModule = 'config';
    $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.module === 'config'));
    renderView('config');
  }
}

async function refreshDeveloperModeChrome() {
  try {
    await loadPluginRuntime();
  } catch (_e) {
    // loadPluginRuntime 自身会吞掉接口错误；这里保持兜底，避免后端不可用时影响 UI。
  }
  syncDeveloperOnlyChrome();
}

function getPersistableTasks(tasks) {
  return (tasks || []).filter((task) => {
    return isTerminalTaskStatus(task?.status);
  });
}

function init() {
  loadDraft();
  applyTheme();
  applyLanguage();
  setupSidebar();
  syncDeveloperOnlyChrome();
  setupTopbar();
  setupNavigator();
  applyLayoutPreferences();
  setupNativePicker();
  setupFieldMenus();
  setupImportConfig();
  setupJsonPanel();
  loadBootstrapData().then(function() {
    renderView(state.activeModule);
  });
  loadTaskSummariesFromCache();
  renderView(state.activeModule);
  startTaskPolling();
  startBackendHeartbeat();
  setupTopbarSearch();
  refreshDeveloperModeChrome();

  // 页面关闭前用 sendBeacon 同步保存任务历史，防止异步 fetch 被中断
  // 使用标记避免与正常保存操作竞态
  window.addEventListener('beforeunload', () => {
    if (state._taskHistoryDirty) {
      const completed = getPersistableTasks(state.tasks);
      if (completed.length > 0) {
        const blob = new Blob([JSON.stringify({ tasks: completed })], { type: 'application/json' });
        navigator.sendBeacon('/api/local/task_history', blob);
      }
    }
  });
}


// 草稿读写：底层 IO 在 utils/storage.js，这里只做 state 合并/写入
function migrateLegacyDefaultOutputName(config) {
  if (!config || typeof config !== 'object') return config;
  const outputName = String(config.output_name ?? '').trim();
  if (outputName !== 'aki' && outputName !== 'aki_') return config;
  return { ...config, output_name: 'lulynx_' };
}

function loadDraft() {
  const parsed = readDraftFromStorage();
  if (!parsed) return;
  mergeConfigPatch(migrateLegacyDefaultOutputName(parsed));
  state.hasLocalDraft = true;
}

function saveDraft() {
  writeDraftToStorage(state.config);
}


function canUseBuiltinPicker(field) {
  if (!field) {
    return false;
  }
  // 有 pickerType 的字段都有内置选择器按钮
  if (field.pickerType) {
    return true;
  }
  // file/folder 类型字段也支持
  return field.type === 'file' || field.type === 'folder';
}

async function loadBootstrapData() {
  state.loading.runtime = true;
  updateJSONPreview();

  const [runtimeResult, presetsResult, savedParamsResult, tasksResult, interrogatorsResult, configOptionsResult] = await Promise.allSettled([
    api.getGraphicCards(),
    api.getPresets(),
    api.getSavedParams(),
    api.getTasks(),
    api.getInterrogators(),
    api.getConfigOptions(),
  ]);

  if (runtimeResult.status === 'fulfilled') {
    state.runtime = runtimeResult.value.data || null;
    state.runtimeError = '';
  } else {
    state.runtimeError = runtimeResult.reason?.message || '运行环境状态不可用。';
  }

  if (presetsResult.status === 'fulfilled') {
    state.presets = presetsResult.value?.data?.presets || [];
  }

  if (savedParamsResult.status === 'fulfilled' && !state.hasLocalDraft) {
    mergeConfigPatch(migrateLegacyDefaultOutputName(savedParamsResult.value.data || {}));
    saveDraft();
  }

  if (tasksResult.status === 'fulfilled') {
    const backendTasks = tasksResult.value?.data?.tasks || [];
    const localHistory = await loadLocalTaskHistory();
    state.tasks = mergeTaskHistory(backendTasks, localHistory, state.tasks);
    state._taskHistoryDirty = true;
    // 从持久化的任务对象恢复摘要数据
    for (const t of state.tasks) {
      if (t.status === 'FINISHED' && t._summary && t._summary._v >= 2) state.taskSummaries[t.id] = t._summary;
    }
  }
  if (interrogatorsResult.status === 'fulfilled') {
    state.interrogators = interrogatorsResult.value?.data || null;
  }

  if (configOptionsResult.status === 'fulfilled') {
    state.backendConfigOptions = configOptionsResult.value?.data || null;
    applyBackendConfigOptions(state.backendConfigOptions);
  }



  state.loading.runtime = false;
  if (state.activeModule === 'config') {
    renderView('config');
  } else {
    updateJSONPreview();

  }
}

async function refreshBackendConfigOptions() {
  try {
    const resp = await api.getConfigOptions();
    state.backendConfigOptions = resp?.data || null;
    applyBackendConfigOptions(state.backendConfigOptions);
    if (state.activeModule === 'config') renderView('config');
  } catch (_e) { /* ignore */ }
}
window.refreshBackendConfigOptions = refreshBackendConfigOptions;


const BACKEND_OFFLINE_MESSAGE = '未连接到后端,可能是因为VPN/防火墙或未启动后端';

function ensureBackendOfflineOverlay() {
  let overlay = document.getElementById('backend-offline-overlay');
  if (overlay) {
    return overlay;
  }

  overlay = document.createElement('div');
  overlay.id = 'backend-offline-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="backend-offline-panel" role="alert" aria-live="assertive">
      <div class="backend-offline-title">${BACKEND_OFFLINE_MESSAGE}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function setBackendOffline(offline) {
  const nextOffline = Boolean(offline);
  const changed = state.backendOffline !== nextOffline;
  state.backendOffline = nextOffline;

  const overlay = ensureBackendOfflineOverlay();
  overlay.classList.toggle('visible', nextOffline);
  overlay.setAttribute('aria-hidden', nextOffline ? 'false' : 'true');

  if (changed) {
    renderTaskStatus();
    syncFooterAction();
  }
}

function startBackendHeartbeat() {
  const INTERVAL = 3000;
  let inFlight = false;

  async function probe() {
    if (inFlight) {
      return;
    }
    inFlight = true;
    try {
      const response = await fetch('/health', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`health check failed: ${response.status}`);
      }
      setBackendOffline(false);
    } catch (error) {
      if (!state.backendOffline) {
        console.warn('[BackendHeartbeat] 后端不可达。', error?.message || '');
      }
      setBackendOffline(true);
    } finally {
      inFlight = false;
    }
  }

  ensureBackendOfflineOverlay();
  probe();
  window.setInterval(probe, INTERVAL);
}

function startTaskPolling() {
  let _pollFailCount = 0;
  const BASE_INTERVAL = 3000;
  const MAX_INTERVAL = 30000;

  async function poll() {
    try {
      const hadRunning = state.tasks.some((t) => t.status === 'RUNNING');
      const prevRunningIds = state.tasks.filter(t => t.status === 'RUNNING').map(t => t.id || t.task_id);


      const response = await api.getTasks();
      const backendTasks = response?.data?.tasks || [];
      const localHistory = await loadLocalTaskHistory();
      state.tasks = mergeTaskHistory(backendTasks, localHistory, state.tasks);
      state._taskHistoryDirty = true;
      const hasRunning = state.tasks.some((t) => t.status === 'RUNNING');

      // 后端恢复在线
      if (_pollFailCount > 0) {
        _pollFailCount = 0;
        setBackendOffline(false);
        showToast('✓ 后端服务已连接');
        renderTaskStatus();
      }

      // 检测训练结束：之前有运行中的任务，现在没了
      if (hadRunning && !hasRunning) {
        // 找到刚刚从 RUNNING 变成其他状态的那个任务
        const lastTask = state.tasks.find(t => prevRunningIds.includes(t.id || t.task_id))
          || state.tasks[state.tasks.length - 1];
        const lastTaskId = lastTask && (lastTask.id || lastTask.task_id);
        for (const task of state.tasks) {
          if (prevRunningIds.includes(task.id || task.task_id) && task.status !== 'RUNNING') task._recentlyFinished = true;
        }
        const failed = lastTask && (['TERMINATED', 'FAILED', 'CANCELLED'].includes(String(lastTask.status || '').toUpperCase()) || (lastTask.returncode != null && lastTask.returncode !== 0));
        await refreshTrainingLog(lastTaskId);
        if (failed) {
          state.trainingSummary = null;
        } else {
          let summary = null;
          if (lastTaskId) {
            try { summary = await buildAndSaveSummaryFromTaskLog(lastTaskId); } catch (_summaryError) { summary = null; }
          }
          if (!summary) {
            summary = generateTrainingSummary();
            if (lastTaskId && summary) {
              saveTaskSummary(lastTaskId, summary);
              await saveLocalTaskHistory();  // 立即持久化摘要
            }
          }
          state.trainingSummary = summary;
        }
        state.activeTrainingTaskId = '';
        state._pendingTrainingMetadata = null;
        state.trainingFailed = !!failed;
        if (!failed) showToast('' + _ico('check-circle') + ' 训练已完成');
        else showToast('' + _ico('x-circle') + ' 训练失败');
        if (state.activeModule === 'training') {
          renderView('training');
        }
      }

      updateJSONPreview();
      renderTaskStatus();
      syncFooterAction();
      await saveLocalTaskHistory();  // persist completed tasks
      if (hasRunning) {
        startTrainingLogPolling();
        startSysMonitorPolling();
      }
      // 训练模块的状态卡片也需要实时刷新
      if (state.activeModule === 'training') {
        const badge = $('#training-status-badge');
        if (badge) {
          const r = state.tasks.some((t) => t.status === 'RUNNING');
          if (r) badge.innerHTML = '<span style="color:#f59e0b;font-weight:700;">' + _ico('loader') + ' 训练中</span>';
          else if (state.trainingFailed) badge.innerHTML = '<span style="color:#ef4444;font-weight:700;">' + _ico('x-circle') + ' 训练失败</span>';
          else if (state.tasks.some((t) => ['FINISHED', 'COMPLETED'].includes(String(t.status || '').toUpperCase()))) badge.innerHTML = '<span style="color:#22c55e;font-weight:700;">' + _ico('check-circle') + ' 已完成</span>';
          else badge.innerHTML = '<span style="color:var(--text-dim);">空闲</span>';
        }
      }
    } catch (error) {
      _pollFailCount++;
      if (_pollFailCount === 1) {
        // 首次失败时提示（之后静默，避免刷屏）
        console.warn('[TaskPoll] 后端不可达，轮询将自动降频重试。', error.message || '');
        setBackendOffline(true);
        renderTaskStatus();
        syncFooterAction();
      }
      // 后端离线超过 3 次 (约 9 秒+)，将 RUNNING 任务标记为 TERMINATED
      if (_pollFailCount >= 3) {
        var hadRunning = state.tasks.some((t) => t.status === 'RUNNING');
        state.tasks.forEach(function(t) {
          if (t.status === 'RUNNING') t.status = 'TERMINATED';
        });
        if (hadRunning) {
          state.trainingSummary = null;
          state.trainingFailed = true;
          syncFooterAction();
          if (state.activeModule === 'training') renderView('training');
        }
      }
    }

    // 退避策略：后端离线时逐步增大轮询间隔（3s → 6s → 12s → ... → 30s）
    const delay = _pollFailCount > 0
      ? Math.min(BASE_INTERVAL * Math.pow(2, _pollFailCount), MAX_INTERVAL)
      : BASE_INTERVAL;
    setTimeout(poll, delay);
  }

  setTimeout(poll, BASE_INTERVAL);
}


function renderView(module) {
  const container = $('.content-area');
  if (container) {
    container.classList.toggle('train-fullbleed', module === 'training');
  }
  if (!container) {
    return;
  }
  applyLayoutPreferences();
  syncFooterAction();

  if (module === 'config') {
    renderConfig(container);
    return;
  }

  if (module === 'settings') {
    renderSettings(container);
    return;
  }
  if (module === 'logs') {
    renderLogs(container);
    return;
  }
  if (module === 'tools') {
    renderTools(container);
    return;
  }
  if (module === 'dataset') {
    renderDataset(container);
    return;
  }
  if (module === 'about') {
    renderAbout(container);
    return;
  }
  if (module === 'guide') {
    renderGuide(container);
    return;
  }
  if (module === 'wizard') {
    renderWizard(container);
    return;
  }
  if (module === 'plugins') {
    renderPlugins(container);
    return;
  }
  if (module === 'turbocore') {
    renderTurboCore(container);
    return;
  }
  if (module === 'training') {
    renderTraining(container);
    return;
  }

  container.innerHTML = `
    <div class="form-container">
      <header class="section-title">
        <h2>${escapeHtml(module.toUpperCase())}</h2>
        <p>这个模块暂未接入真实功能，目前先集中完善 SDXL 训练页。</p>
      </header>
      <div class="empty-state">
        <strong>开发中</strong>
        <span>当前原型保留了导航结构，但主要开发集中在 SDXL LoRA 参数页。</span>
      </div>
    </div>
  `;
}

function renderConfig(container) {
  const tt = state.activeTrainingType;
  const typeLabel = TRAINING_TYPES.find((t) => t.id === tt)?.label || tt;

  // 瀑布流模式：把所有 Tab 的 sections 按 UI_TABS 顺序铺开成一页
  let visibleSections;
  let waterfall = !!state.configWaterfall;
  if (waterfall) {
    const allSections = [];
    const tabKeyToLabel = {};
    for (const tab of UI_TABS) tabKeyToLabel[tab.key] = tab.label;
    const availTabKeys = getAvailableTabs(tt).map((t) => t.key);
    for (const tabKey of availTabKeys) {
      const tabSections = getSectionsForTab(tabKey, tt);
      for (const section of tabSections) {
        // 给 section 注入 _tabKey/_tabLabel 用于渲染分组锚点
        allSections.push({ ...section, _tabKey: tabKey, _tabLabel: tabKeyToLabel[tabKey] || tabKey });
      }
    }
    visibleSections = allSections.filter((section) =>
      section.fields.some((field) => field.type !== 'hidden' && isFieldVisible(field, state.config))
    );
  } else {
    const sections = getSectionsForTab(state.activeTab, tt);
    visibleSections = sections.filter((section) =>
      section.fields.some((field) => field.type !== 'hidden' && isFieldVisible(field, state.config))
    );
  }

  // 瀑布流：在每个新 tab 段前插入分组标题（tab 锚点）
  let lastRenderedTab = '';
  const renderSectionWithAnchor = (section) => {
    if (!waterfall) return renderSection(section);
    let prefix = '';
    if (section._tabKey && section._tabKey !== lastRenderedTab) {
      lastRenderedTab = section._tabKey;
      prefix = `<div class="waterfall-tab-anchor" id="waterfall-tab-${escapeHtml(section._tabKey)}" data-waterfall-tab="${escapeHtml(section._tabKey)}">
        <h2 class="waterfall-tab-title">${escapeHtml(section._tabLabel)}</h2>
      </div>`;
    }
    return prefix + renderSection(section);
  };

  container.innerHTML = `
    <div class="form-container${waterfall ? ' form-container-waterfall' : ''}">
      <header class="section-title">
        <h2>${typeLabel} LoRA 模式</h2>
        <p>${waterfall ? '<span style="color:var(--text-muted);font-size:0.82rem;">📜 瀑布流模式：所有参数在同一页展示，可通过顶部标签栏快速跳转。</span>' : ''}</p>
      </header>
      ${renderPreflightOverviewPanel()}
      ${renderPreflightReport()}
      ${renderSlot('training.preflight_panel')}
      ${renderSlot('config.after_status_deck')}
      ${visibleSections.map(renderSectionWithAnchor).join('')}
    </div>
  `;

  renderNavigator();
  syncTopbarState();
  syncFooterAction();
  updateJSONPreview();

  // 瀑布流模式：监听滚动来高亮顶部 tab
  if (waterfall) {
    _setupWaterfallScrollSpy(container);
  }
}

// ---- 瀑布流滚动联动 ----
let _waterfallScrollHandler = null;
function _setupWaterfallScrollSpy(container) {
  if (_waterfallScrollHandler) {
    document.removeEventListener('scroll', _waterfallScrollHandler, true);
    _waterfallScrollHandler = null;
  }
  const anchors = container.querySelectorAll('.waterfall-tab-anchor');
  if (!anchors.length) return;
  _waterfallScrollHandler = () => {
    if (state.activeModule !== 'config' || !state.configWaterfall) return;
    let curTab = '';
    const triggerY = 140; // topbar 大约高度
    anchors.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top <= triggerY) curTab = el.dataset.waterfallTab;
    });
    if (curTab && curTab !== state.activeTab) {
      state.activeTab = curTab;
      localStorage.setItem('sdxl_ui_tab', curTab);
      $$('.top-nav-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.tab === curTab);
      });
    }
  };
  document.addEventListener('scroll', _waterfallScrollHandler, true);
}





window.toggleTrainingGroup = function(group) {
  if (!state._collapsedTrainingGroups) state._collapsedTrainingGroups = new Set();
  if (state._collapsedTrainingGroups.has(group)) {
    state._collapsedTrainingGroups.delete(group);
  } else {
    state._collapsedTrainingGroups.add(group);
  }
  _persistTrainingGroupsCollapsed();
  renderNavigator();
};

function _persistTrainingGroupsCollapsed() {
  try {
    const arr = Array.from(state._collapsedTrainingGroups || []);
    localStorage.setItem('sd-rescripts:training-groups-collapsed', JSON.stringify(arr));
  } catch (_e) { /* ignore */ }
}

// layout actions—提前装配以供后续 renderSettings/_trainingDeps 使用
const {
  applyLayoutPreferences,
  applyAndPersistLayout,
  resetTransientState,
  syncFooterAction,
  syncTopbarState,
  updateLayoutWidth,
} = createLayoutActions({ state, getAvailableTabs });
window.updateLayoutWidth = updateLayoutWidth;
// config actions—依赖 layout.resetTransientState、jsonPanel.updateJSONPreview
const {
  isTruthyConfigFlag,
  enforceLycorisDoraSafety,
  mergeConfigPatch,
  refreshFieldHighlights,
  syncConfigState,
  getPresetLabel,
  updateConfigValue,
  resetAllParams,
  resetFieldValue,
  undoFieldValue,
  applyPreset,
} = createConfigActions({
  state,
  getFieldDefinition,
  normalizeDraftValue,
  createDefaultConfig,
  CONDITIONAL_KEYS,
  DRAFT_STORAGE_KEY,
  saveDraft,
  updateJSONPreview,
  renderView,
 resetTransientState,
});
window.updateConfigValue = updateConfigValue;
window.resetAllParams = resetAllParams;
window.resetFieldValue = resetFieldValue;
window.undoFieldValue = undoFieldValue;
window.applyPreset = applyPreset;
// sample actions—依赖 _samplesGetSorted (samples renderer)
const {
  openSampleLightbox,
  lightboxNav,
  closeSampleLightbox,
  openOutputFolder,
  scanDataset,
  toggleFolderPreview,
  loadMoreThumbs,
  runTrainingPreflight,
} = createSampleActions({
  state,
  api,
  showToast,
  renderView,
  getSortedSamples: _samplesGetSorted,
  buildRunConfig,
});
window.openSampleLightbox = openSampleLightbox;
window.lightboxNav = lightboxNav;
window.closeSampleLightbox = closeSampleLightbox;
window.openOutputFolder = openOutputFolder;
window.scanDataset = scanDataset;
window.toggleFolderPreview = toggleFolderPreview;
window.loadMoreThumbs = loadMoreThumbs;
window.runTrainingPreflight = runTrainingPreflight;
// wizard / plugins / tools actions
// wizard.executeTraining 指向 main.js 中 window.executeTraining（后续 Stage 3.16 迁到 actions/training.js）
const { wizardSet, wizardStartTraining } = createWizardActions({
  state,
  updateConfigValue,
  renderView,
  executeTraining: () => window.executeTraining?.(),
});
window.wizardSet = wizardSet;
window.wizardStartTraining = wizardStartTraining;
const {
  pluginToggleDevMode,
  pluginReloadAll,
  pluginApprove,
  pluginRevoke,
  pluginShowAudit,
  pluginSavePytorchOptimizerSettings,
  pluginResetPytorchOptimizerSettings,
} = createPluginsActions({
  pluginStore,
  toggleDeveloperMode,
  reloadAllPlugins,
  approvePlugin,
  revokePlugin,
  loadPluginAudit,
  getPluginSettings: api.getPluginSettings,
  savePluginSettings: api.savePluginSettings,
  _formatPluginAuditDetail,
  _loadAndRenderPlugins,
  showToast,
});
window.pluginToggleDevMode = async function(enabled) {
  await pluginToggleDevMode(enabled);
  syncDeveloperOnlyChrome();
};
window.pluginReloadAll = pluginReloadAll;
window.pluginApprove = pluginApprove;
window.pluginRevoke = pluginRevoke;
window.pluginShowAudit = pluginShowAudit;
window.pluginSavePytorchOptimizerSettings = pluginSavePytorchOptimizerSettings;
window.pluginResetPytorchOptimizerSettings = pluginResetPytorchOptimizerSettings;
window.turboCoreProbeStatus = turboCoreProbeStatus;
window.turboCoreCopyFlags = turboCoreCopyFlags;
const { runTool } = createToolsActions({ api, showToast, _renderLogLines });
window.runTool = runTool;






const renderNavigator = createNavigatorRenderer({ state, TRAINING_TYPES, _persistTrainingGroupsCollapsed });
// settings renderer（updateLayoutWidth 是 window 箭头函数，不在依赖列表中）
const renderSettings = createSettingsRenderer({ state, t, renderSlot, applyAndPersistLayout, renderView, applyTheme, showToast });
// nav actions（依赖 renderNavigator 间接通过 toggleTrainingGroup → 该函数仍在 main.js 内）
const {
  dismissPreflightReport,
  dismissTrainingSummary,
  setupSidebar,
  setupTopbar,
  setupNavigator,
} = createNavActions({
  state,
  TOPBAR_TABS,
  renderView,
  toggleTheme,
  syncTopbarState,
});
window.dismissPreflightReport = dismissPreflightReport;
window.dismissTrainingSummary = dismissTrainingSummary;
// runtime actions
const { runPreflight, refreshRuntime } = createRuntimeActions({ state, api, showToast, renderView, updateJSONPreview, buildRunConfig });
window.runPreflight = runPreflight;
window.refreshRuntime = refreshRuntime;
// terminate actions
const { terminateAllTasks } = createTerminateActions({
  state, api, showToast, renderView,
  loadLocalTaskHistory, saveLocalTaskHistory, mergeTaskHistory, syncFooterAction,
});
window.terminateAllTasks = terminateAllTasks;
// savedConfigs actions
const {
  setupImportConfig,
  switchTrainingType,
  saveCurrentParams,
  loadSavedParams,
  loadNamedConfig,
  deleteSavedConfig,
  renameSavedConfig,
  previewSavedConfig,
  downloadConfigFile,
  importConfigFile,
} = createSavedConfigsActions({
  state, api, showToast, renderView, renderNavigator,
  saveDraft, resetTransientState, updateJSONPreview,
  enforceLycorisDoraSafety, mergeConfigPatch,
  createDefaultConfig, TRAINING_TYPES, SCHEDULER_TYPE_TO_VALUE,
  parseSimpleToml: _parseSimpleToml, configToToml: _configToToml, buildRunConfig,
  DRAFT_STORAGE_KEY,
});
window.switchTrainingType = switchTrainingType;
window.saveCurrentParams = saveCurrentParams;
window.loadSavedParams = loadSavedParams;
window.loadNamedConfig = loadNamedConfig;
window.deleteSavedConfig = deleteSavedConfig;
window.renameSavedConfig = renameSavedConfig;
window.previewSavedConfig = previewSavedConfig;
window.downloadConfigFile = downloadConfigFile;
window.importConfigFile = importConfigFile;
// trainingMetadata actions —提前装配（trainingActions 依赖 buildTaskMetadataFromConfig、resetTrainingMetrics 等）
const {
  collectTrainingMetrics,
  buildTaskMetadataFromConfig,
  getPendingTrainingMetadata,
  applyTaskMetadata,
  rememberTrainingTaskMetadata,
  resetTrainingMetrics,
  generateTrainingSummary,
  fetchTaskLogLines,
  buildAndSaveSummaryFromTaskLog,
  saveTaskSummary,
  loadTaskSummariesFromCache,
  showTaskSummary,
} = createTrainingMetadataActions({
  state, api, TRAINING_TYPES, saveLocalTaskHistory,
  _resetTrainingLogCursor: () => _resetTrainingLogCursor(),
});
window.showTaskSummary = showTaskSummary;

// trainingActions — validateConfigConflicts + executeTraining
const { validateConfigConflicts, executeTraining } = createTrainingActions({
  state, api, showToast, renderView, updateJSONPreview, syncFooterAction,
  buildRunConfig, buildTaskMetadataFromConfig, resetTrainingMetrics,
  rememberTrainingTaskMetadata, getPendingTrainingMetadata, applyTaskMetadata,
  loadLocalTaskHistory, saveLocalTaskHistory, mergeTaskHistory,
  refreshTrainingLog, startTrainingLogPolling, startSysMonitorPolling,
});
window.executeTraining = executeTraining;









/* ── Training Metrics Collection & Analysis ── */

/** Incrementally collect speed/loss/epoch from latest poll lines */











let _trainingLogPollTimer = null;
let _trainingLogCursor = createTrainingLogCursor();

function _resetTrainingLogCursor(taskId = '') {
  _trainingLogCursor = createTrainingLogCursor(taskId);
}

function _collectIncrementalTrainingLogLines(taskId, lines, total, liveLine) {
  const result = collectIncrementalTrainingLogLines(_trainingLogCursor, taskId, lines, total, liveLine);
  _trainingLogCursor = result.cursor;
  return result.incremental;
}

function getActiveTrainingLogTask() {
  if (state.activeTrainingTaskId) {
    const active = state.tasks.find((t) => t.id === state.activeTrainingTaskId || t.task_id === state.activeTrainingTaskId);
    if (active) return active;
  }
  const running = state.tasks.filter((t) => t.status === 'RUNNING');
  return running[0] || null;
}

function startTrainingLogPolling() {
  if (_trainingLogPollTimer) return;
  _trainingLogPollTimer = setInterval(() => {
    const target = getActiveTrainingLogTask();
    if (!target || target.status !== 'RUNNING') {
      clearInterval(_trainingLogPollTimer);
      _trainingLogPollTimer = null;
      // 最后刷一次
      refreshTrainingLog(target && target.id);
      return;
    }
    refreshTrainingLog(target.id);
  }, 2000);
}

// ── System Monitor Polling ─────────────────────────────
let _sysMonitorTimer = null;

async function _pollSystemMonitor() {
  try {
    var resp = await api.getSystemMonitor();
    if (resp && resp.data) {
      state.sysMonitor = resp.data;
      _renderSysMonitorInPlace();
    }
  } catch (e) { /* silent */ }
}

function startSysMonitorPolling() {
  if (_sysMonitorTimer) return;
  _pollSystemMonitor();
  _sysMonitorTimer = setInterval(() => {
    if (!state.tasks.some((t) => t.status === 'RUNNING')) {
      clearInterval(_sysMonitorTimer);
      _sysMonitorTimer = null;
      _pollSystemMonitor(); // final update
      return;
    }
    _pollSystemMonitor();
  }, 3000);
}

function _renderSysMonitorInPlace() {
  var el = document.getElementById('sys-monitor-panel');
  if (!el) return;
  el.innerHTML = _buildSysMonitorHTML();
}




async function refreshTrainingLog(taskId = '') {
  const running = state.tasks.filter((t) => t.status === 'RUNNING');
  const explicitTarget = taskId
    ? state.tasks.find((t) => t.id === taskId || t.task_id === taskId) || { id: taskId, task_id: taskId, status: 'FINISHED' }
    : null;
  const cursorTarget = _trainingLogCursor.taskId ? state.tasks.find((t) => t.id === _trainingLogCursor.taskId || t.task_id === _trainingLogCursor.taskId) : null;
  const activeTarget = getActiveTrainingLogTask();
  const target = explicitTarget || activeTarget || running[0] || cursorTarget || state.tasks[state.tasks.length - 1];
  if (!target) return;

  const targetId = target.id || target.task_id;
  if (!targetId) return;
  if (_trainingLogCursor.taskId && _trainingLogCursor.taskId !== targetId) {
    resetTrainingMetrics({ keepLogSnapshot: target.status !== 'RUNNING' });
  }

  try {
    const resp = await api.getTaskOutput(targetId, 1000);
    const lines = resp?.data?.lines || [];
    const total = Number(resp?.data?.total || 0) || 0;
    const liveLine = resp?.data?.live_line || '';
    const renderedLines = mergeTrainingLogLines(lines, liveLine);
    const incrementalLines = _collectIncrementalTrainingLogLines(targetId, lines, total, liveLine);
    const logEl = $('#training-log-container');
    const isRunningTarget = target.status === 'RUNNING' || state.tasks.some((t) => t.status === 'RUNNING' && t.id === targetId);

    // Collect metrics from each poll
    if (incrementalLines.length > 0 && isRunningTarget) {
      collectTrainingMetrics(incrementalLines);
    }

    const placeholderHtml = '<span style="color:var(--text-dim);">等待训练输出...</span>';
    let nextLogHtml = placeholderHtml;
    if (renderedLines.length === 0) {
      nextLogHtml = placeholderHtml;
    } else {
      nextLogHtml = _renderLogLines(renderedLines);
    }
    state.trainingLogSnapshot = { taskId: targetId, html: nextLogHtml, updatedAt: Date.now() };

    if (!logEl) {
      _updateTrainingLiveMetrics();
      return;
    }
    logEl.innerHTML = nextLogHtml;

    const autoScroll = $('#training-log-autoscroll');
    if (autoScroll?.checked) {
      logEl.scrollTop = logEl.scrollHeight;
    }

    // Live-update header metrics & right panel
    _updateTrainingLiveMetrics();
  } catch (e) {
    // 静默失败
  }
}

window.refreshTrainingLog = refreshTrainingLog;

function _updateTrainingLiveMetrics() {
  var m = state.trainingMetrics;
  if (!m) return;
  var curStep = m.lastStep || 0;

  // Update step count in header (find .train-hdr-val elements)
  var hdrLabels = document.querySelectorAll('.train-hdr-label');
  if (hdrLabels.length >= 1) {
    var stepEl = hdrLabels[0].querySelector('.train-hdr-val');
    if (stepEl) stepEl.textContent = m.lastStep.toLocaleString() + ' / ' + (m.totalSteps > 0 ? m.totalSteps.toLocaleString() : '--');
  }
  if (hdrLabels.length >= 2) {
    var curSpeed = m.speeds.length > 0 ? m.speeds[m.speeds.length - 1].itPerSec : 0;
    var remain = (curSpeed > 0 && m.totalSteps > m.lastStep) ? Math.round((m.totalSteps - m.lastStep) / curSpeed) : 0;
    var remainEl = hdrLabels[1].querySelector('.train-hdr-val');
    if (remainEl) remainEl.textContent = remain > 0 ? formatDuration(remain * 1000) : '--:--';
  }

  // Update live speed
  var speedEl = document.getElementById('train-live-speed');
  if (speedEl && m.speeds.length > 0) {
    speedEl.textContent = m.speeds[m.speeds.length - 1].itPerSec.toFixed(2) + ' it/s';
  }
  
  // ── Live Loss value + delta ──
  var lossEl = document.querySelector('.train-loss-big');
  var deltaEl = document.querySelector('.train-loss-delta');
  if (lossEl && m.losses.length > 0) {
    var curLoss = m.losses[m.losses.length - 1].loss;
    lossEl.textContent = curLoss > 0 ? curLoss.toFixed(4) : '\u2014';
    if (deltaEl) {
      var prevLoss = m.losses.length > 1 ? m.losses[m.losses.length - 2].loss : curLoss;
      var lossDeltaPct = prevLoss > 0 ? ((curLoss - prevLoss) / prevLoss * 100) : 0;
      var lossArrowColor = lossDeltaPct < 0 ? '#22c55e' : (lossDeltaPct > 0 ? '#ef4444' : 'var(--text-dim)');
      var lossArrow = lossDeltaPct < 0 ? _ico('trending-down', 12) : (lossDeltaPct > 0 ? _ico('trending-up', 12) : '');
      deltaEl.style.color = lossArrowColor;
      deltaEl.innerHTML = lossArrow + ' ' + (lossDeltaPct !== 0 ? (lossDeltaPct > 0 ? '+' : '') + lossDeltaPct.toFixed(1) + '%' : '');
    }
  }

  // ── Live sparkline chart ──
  var chartBox = document.querySelector('.train-chart-box');
  if (chartBox && m.losses.length >= 2) {
    var pts = m.losses.slice(-50);
    var maxL = Math.max.apply(null, pts.map(function(p) { return p.loss; }));
    var minL = Math.min.apply(null, pts.map(function(p) { return p.loss; }));
    var range = maxL - minL || 0.001;
    var pathParts = [];
    for (var pi = 0; pi < pts.length; pi++) {
      var px = (pi / (pts.length - 1)) * 100;
      var py = 100 - ((pts[pi].loss - minL) / range) * 90 - 5;
      pathParts.push((pi === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1));
    }
    var pathD = pathParts.join(' ');
    chartBox.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;">'
      + '<defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity="0.3"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>'
      + '<path d="' + pathD + '" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>'
      + '<path d="' + pathD + ' L100 100 L0 100 Z" fill="url(#lg)"/>'
      + '</svg>';
  }

  // ── Live chart axis ──
  var axisEl = document.querySelector('.train-chart-axis');
  if (axisEl && m.losses.length > 0) {
    axisEl.innerHTML = '<span>Step 0</span><span>Step ' + curStep + '</span>';
  }
}

var _gpuPollCooldown = false;
async function _fetchGpuStatus() {
  if (_gpuPollCooldown) return;
  _gpuPollCooldown = true;
  setTimeout(function() { _gpuPollCooldown = false; }, 4000); // max once per 4s
  try {
    var resp = await api.getGpuStatus();
    var d = resp && resp.data;
    if (!d || !d.available || !d.gpus || !d.gpus.length) return;
    var g = d.gpus[0];
    var vramText = document.getElementById('train-vram-text');
    var vramFill = document.getElementById('train-vram-fill');
    if (vramText) vramText.textContent = g.allocated_mb + ' / ' + g.total_mb + ' MB (' + g.utilization_pct + '%)';
    if (vramFill) vramFill.style.width = Math.min(g.utilization_pct, 100) + '%';
  } catch(e) { /* silent */ }
}























document.addEventListener('DOMContentLoaded', init);
