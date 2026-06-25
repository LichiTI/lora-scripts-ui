import { t } from './i18n.js';
import { api } from './api.js';
import { validateModelSelection } from './features/modelArchDetection.js';
import {
  pluginStore,
  loadPluginRuntime,
  loadPluginSdkStatus,
  loadPluginCapabilities,
  loadPluginHooks,
  loadPluginAudit,
  reloadAllPlugins,
  approvePlugin,
  approvePluginRunner,
  revokePlugin,
  toggleDeveloperMode,
  executePluginSdkRunner,
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
} from './schemaIndex.js';
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
import { createInitialAppState } from './utils/appState.js';
import { createFimScanTool } from './fimScanTool.js';
import { createGoalForecastTool } from './goalForecastTool.js';
import { createCopilotTool } from './copilotTool.js';
import { configToToml as _configToToml, parseSimpleToml as _parseSimpleToml } from './utils/toml.js';
import { renderLogLines as _renderLogLines } from './utils/logRender.js';
import {
  buildSchemaFallbackEntry,
  loadTrainingWikiEntry,
} from './utils/trainingWiki.js';
import {
  getActiveTasks,
  getRunningTasks,
  getTaskId,
  isTaskFailed,
  isTaskQueued,
  isTaskRunning,
  isTaskSuccessful,
} from './utils/taskStatus.js';
import { createBackendHeartbeat } from './utils/backendHeartbeat.js';
import { createTaskPolling } from './utils/taskPolling.js';
import { createTrainingLivePolling } from './utils/trainingLivePolling.js';
import { createAppBootstrap } from './utils/appBootstrap.js';
import { bindWindowActions } from './utils/windowActions.js';
import { installGlobalErrorReporter } from './utils/errorReporter.js';
import { reportWebuiError } from './utils/errorReporter.js';

import { createAboutRenderer, renderGuide, renderLogs, refreshTensorBoardStatus, refreshWebuiErrorLogs, startTensorBoardFromLogs, stopTensorBoardFromLogs, createBuiltinPickerRenderer, createStatusDeckRenderer, createNavigatorRenderer, createSettingsRenderer, createConfigFormRenderer, createConfigPageRenderer, createPreflightRenderer, createSamplesRenderer, createWizardRenderer, createPluginsRenderer, createToolsRenderer, createDatasetRenderer, createSysMonitorRenderer, createTrainingRenderer, createExperimentalTrainingRenderer, createConfigShellRenderer, createAppViewRenderer, renderTurboCore, turboCoreProbeStatus, turboCoreCopyFlags } from './renderers/index.js';
import { createThemeActions, createTrainTabsActions, createJsonPanelActions, createFieldMenuActions, createTaskHistoryActions, createSearchActions, createPickerActions, createLayoutActions, createConfigActions, createSampleActions, createWizardActions, createPluginsActions, createToolsActions, createNavActions, createRuntimeActions, createTerminateActions, createSavedConfigsActions, createTrainingActions, createTrainingMetadataActions, createTrainingChromeActions, createPreviewGroupsActions, createExperimentalTrainingActions, createDeveloperModeChromeActions } from './actions/index.js';
import './actions/trainingAssistantChat.js';
import './actions/trainingAssistantConfig.js';
import { setupTurbocoreToggle } from './actions/turbocoreToggle.js';
import { setupPerfModeToggle } from './actions/perfModeToggle.js';
import { setupOptimizerToggle } from './actions/optimizerToggle.js';

const state = createInitialAppState({ createDefaultConfig });
installGlobalErrorReporter();
const { renderAbout, loadAboutReleaseReadiness, refreshAboutReleaseReadiness } = createAboutRenderer({ api, showToast, reportWebuiError });

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
const { renderSections: renderConfigSections } = createConfigShellRenderer({
  state,
  UI_TABS,
  getAvailableTabs,
  getSectionsForTab,
  isFieldVisible,
  renderSection,
  escapeHtml,
});
const {
  renderExperimentalTrainingPanel,
  renderFloatingTrainingAssistant,
} = createExperimentalTrainingRenderer({ state });
// samples renderer（含 5 个渲染函数 + 3 个 action，状态在闭包内维护）
const {
  renderSamplesPanel,
  refreshSampleImages,
  applySampleSort,
  applySampleFilter,
  getSortedSamples: _samplesGetSorted,
} = createSamplesRenderer({ api });
bindWindowActions({
  refreshSampleImages,
  applySampleSort,
  applySampleFilter,
  refreshTensorBoardStatus,
  refreshWebuiErrorLogs,
  startTensorBoardFromLogs,
  stopTensorBoardFromLogs,
  loadAboutReleaseReadiness,
  refreshAboutReleaseReadiness,
});

// wizard renderer（updateConfigValue 是 window 箭头函数，运行时延迟取）
const { renderWizard } = createWizardRenderer({ state, updateConfigValue: (k, v) => window.updateConfigValue(k, v), getFieldDefinition });
// plugins renderer
const {
  renderPlugins,
  _loadAndRenderPlugins,
  _formatPluginAuditDetail,
} = createPluginsRenderer({ pluginStore, loadPluginRuntime, loadPluginSdkStatus, getRegisteredSlots, api });
// tools renderer
const { renderTools, renderToolDetail } = createToolsRenderer({ state, renderSlot });
// dataset renderer + actions
const {
  renderDataset,
  switchDatasetTab,
  runTagger,
  runLlmTagger,
  refreshLlmTaggerChannels,
  saveLlmTaggerChannelFromForm,
  clearSelectedLlmTaggerChannelKeys,
  deleteSelectedLlmTaggerChannel,
  refreshTagEditorIframe,
  startTagTranslation,
  stopTagTranslation,
  refreshTagTranslationStatus,
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
  switchAdvancedTagSegment,
  runAdvPipelinePlan,
  runAdvPipelineRun,
  runAdvEnsemblePreview,
  runAdvEnsembleApply,
  runAdvStructurePreview,
  runAdvStructureApply,
  runAdvDedupe,
  runAdvFrequencyPreview,
  runAdvFrequencyApply,
  runAdvReviewQueue,
  refreshAdvPolicyPacks,
  runAdvPolicyPreview,
  runAdvPolicyApply,
  runAdvRetagBuild,
  runAdvRetagNext,
  markAdvRetag,
  runAdvVersionHistory,
  runAdvVersionRevert,
  runAdvCrossAggregate,
  runAdvCrossResult,
} = createDatasetRenderer({ state, api, showToast, renderView });
bindWindowActions({
  switchDatasetTab,
  runTagger,
  runLlmTagger,
  refreshLlmTaggerChannels,
  saveLlmTaggerChannelFromForm,
  clearSelectedLlmTaggerChannelKeys,
  deleteSelectedLlmTaggerChannel,
  refreshTagEditorIframe,
  startTagTranslation,
  stopTagTranslation,
  refreshTagTranslationStatus,
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
  switchAdvancedTagSegment,
  runAdvPipelinePlan,
  runAdvPipelineRun,
  runAdvEnsemblePreview,
  runAdvEnsembleApply,
  runAdvStructurePreview,
  runAdvStructureApply,
  runAdvDedupe,
  runAdvFrequencyPreview,
  runAdvFrequencyApply,
  runAdvReviewQueue,
  refreshAdvPolicyPacks,
  runAdvPolicyPreview,
  runAdvPolicyApply,
  runAdvRetagBuild,
  runAdvRetagNext,
  markAdvRetag,
  runAdvVersionHistory,
  runAdvVersionRevert,
  runAdvCrossAggregate,
  runAdvCrossResult,
});
// sysMonitor renderer
const { _buildSysMonitorHTML } = createSysMonitorRenderer({ state });
const {
  resetTrainingLogCursor: _resetTrainingLogCursor,
  refreshTrainingLog,
  startTrainingLogPolling,
  startSysMonitorPolling,
  pollSystemMonitor: _pollSystemMonitor,
  fetchGpuStatus: _fetchGpuStatus,
} = createTrainingLivePolling({
  state,
  api,
  collectTrainingMetrics: (lines) => collectTrainingMetrics(lines),
  resetTrainingMetrics: (options) => resetTrainingMetrics(options),
  buildSysMonitorHTML: () => _buildSysMonitorHTML(),
});
bindWindowActions({ refreshTrainingLog });
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
const { switchTrainTab, setBubbleClosedLoopHistoryFilter } = createTrainTabsActions({
  state,
  renderView,
  scanDataset:() => window.scanDataset?.(),
  refreshSampleImages,
});
const { setupJsonPanel, updateJSONPreview } = createJsonPanelActions({ state, buildRunConfig });
const { setupFieldMenus } = createFieldMenuActions({ state, getFieldDefinition });
bindWindowActions({ switchTrainTab, setBubbleClosedLoopHistoryFilter });
// taskHistory 包含 mergeTaskHistory / deleteTaskHistory / clearAllTaskHistory 等
// 注意：getPendingTrainingMetadata / applyTaskMetadata / rememberTrainingTaskMetadata
// 现在来自 trainingMetadata 工厂（L900+ 才装配），用 getter 延迟取以避免 TDZ。
const _taskHistoryDeps = {
  state,
  api,
  showToast,
  renderView,
  renderTaskStatus,
  get getPendingTrainingMetadata() { return getPendingTrainingMetadata; },
  get applyTaskMetadata() { return applyTaskMetadata; },
  get rememberTrainingTaskMetadata() { return rememberTrainingTaskMetadata; },
};
const {
  persistDeletedTaskIds,
  setupTaskHistoryBeforeUnload,
  loadLocalTaskHistory,
  saveLocalTaskHistory,
  mergeTaskHistory,
  deleteTaskHistory,
  clearAllTaskHistory,
} = createTaskHistoryActions(_taskHistoryDeps);
bindWindowActions({ deleteTaskHistory, clearAllTaskHistory });
// search
const { setupTopbarSearch, jumpToConfigField } = createSearchActions({ state, UI_TABS, getSectionsForType, renderView });
bindWindowActions({ jumpToConfigField });
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
bindWindowActions({
  pickPath,
  pickPathForInput,
  openNativePicker,
  closeBuiltinPicker,
  refreshBuiltinPicker,
  selectBuiltinPickerItem,
  selectBuiltinPickerCurrentRoot,
  openBuiltinPickerForInput,
});












bindWindowActions({ persistDeletedTaskIds });

let _developerModeChromeActions = null;

function syncDeveloperOnlyChrome() {
  _developerModeChromeActions?.syncDeveloperOnlyChrome();
}

async function refreshDeveloperModeChrome() {
  return _developerModeChromeActions?.refreshDeveloperModeChrome();
}

function init() {
  // Initialize model architecture detection
  window.validateModelSelection = validateModelSelection;
  window.currentTrainingType = state.activeTrainingType;

  loadDraft();

  // Check for theme parameter in URL (from launcher embedding)
  const urlParams = new URLSearchParams(window.location.search);
  const urlTheme = urlParams.get('launcher_theme') || urlParams.get('theme');
  if (urlTheme && (urlTheme === 'light' || urlTheme === 'dark')) {
    console.log('[DEBUG webui] Setting initial theme from URL:', urlTheme);
    state.theme = urlTheme;
    localStorage.setItem('theme', urlTheme);
  }

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
  setupPerfModeToggle(api, showToast);
  setupOptimizerToggle(api, showToast);
  loadBootstrapData().then(function() {
    renderView(state.activeModule);
  });
  loadTaskSummariesFromCache();
  renderView(state.activeModule);
  startTaskPolling();
  startBackendHeartbeat();
  setupTopbarSearch();
  refreshDeveloperModeChrome();
  setupTaskHistoryBeforeUnload();
  fetch('/api/app_version').then(r => r.ok ? r.json() : null).then(d => {
    const el = document.getElementById('app-version-display');
    if (el && d) el.textContent = d.backend_version || d.version || '';
  }).catch(() => {});

  // Listen for theme sync messages from launcher (when embedded in iframe)
  window.addEventListener('message', (event) => {
    if (event.data && (event.data.type === 'LAUNCHER_THEME_SYNC' || event.data.type === 'launcher:theme-change')) {
      const launcherTheme = event.data.theme;
      console.log('[DEBUG webui] Received theme sync from launcher:', launcherTheme);

      // Map launcher theme (light/dark) to webui theme (light/dark/clay)
      if (launcherTheme === 'light' && state.theme !== 'light') {
        state.theme = 'light';
        localStorage.setItem('theme', 'light');
        applyTheme();
      } else if (launcherTheme === 'dark' && state.theme !== 'dark' && state.theme !== 'clay') {
        state.theme = 'dark';
        localStorage.setItem('theme', 'dark');
        applyTheme();
      }
    }
  });
}


let _appBootstrap = null;

function loadDraft() {
  _appBootstrap?.loadDraft();
}

function saveDraft() {
  _appBootstrap?.saveDraft();
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
  return _appBootstrap?.loadBootstrapData();
}

async function refreshBackendConfigOptions() {
  return _appBootstrap?.refreshBackendConfigOptions();
}
window.refreshBackendConfigOptions = refreshBackendConfigOptions;


// layout actions—必须在 createBackendHeartbeat / createTaskPolling 之前，
// 因为它们需要 syncFooterAction（const 不会 hoist，会触发 TDZ）
const {
  applyLayoutPreferences,
  applyAndPersistLayout,
  resetTransientState,
  syncFooterAction,
  syncTopbarState,
  updateLayoutWidth,
  setupModeToggle,
} = createLayoutActions({ state, getAvailableTabs });
bindWindowActions({ updateLayoutWidth });
setupModeToggle(renderView);

const { setBackendOffline, startBackendHeartbeat } = createBackendHeartbeat({
  state,
  renderTaskStatus,
  syncFooterAction,
});
const { startTaskPolling } = createTaskPolling({
  state,
  api,
  loadLocalTaskHistory,
  mergeTaskHistory,
  setBackendOffline,
  showToast,
  renderTaskStatus,
  refreshTrainingLog: (taskId) => refreshTrainingLog(taskId),
  buildAndSaveSummaryFromTaskLog: (taskId) => buildAndSaveSummaryFromTaskLog(taskId),
  generateTrainingSummary: () => generateTrainingSummary(),
  saveTaskSummary: (...args) => saveTaskSummary(...args),
  saveLocalTaskHistory,
  updateJSONPreview,
  syncFooterAction,
  startTrainingLogPolling: () => startTrainingLogPolling(),
  startSysMonitorPolling: () => startSysMonitorPolling(),
  renderView,
  getRunningTasks,
  getActiveTasks,
  getTaskId,
  isTaskRunning,
  isTaskFailed,
  isTaskQueued,
  isTaskSuccessful,
  $,
  _ico,
});


let _renderViewImpl = null;

function renderView(module) {
  _renderViewImpl?.(module);
}

let _renderConfigImpl = null;

function renderConfig(container) {
  _renderConfigImpl?.(container);
}

// layout actions—提前装配以供后续 renderSettings/_trainingDeps 使用
// （已在 createBackendHeartbeat 之前完成装配，此处保留注释作为锚点）
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
_appBootstrap = createAppBootstrap({
  state,
  api,
  mergeConfigPatch,
  applyBackendConfigOptions,
  updateJSONPreview,
  renderView,
  loadLocalTaskHistory,
  mergeTaskHistory,
});
const {
  validateTurboLoraOutputFromConfig,
  reportTurboLoraSamplesFromConfig,
} = createExperimentalTrainingActions({
  state,
  api,
  showToast,
  renderView,
});
bindWindowActions({ validateTurboLoraOutputFromConfig, reportTurboLoraSamplesFromConfig });
const {
  addPreviewGroup,
  removePreviewGroup,
  updatePreviewGroup,
} = createPreviewGroupsActions({
  state,
  syncConfigState,
  saveDraft,
  updateJSONPreview,
  renderView,
});
bindWindowActions({
  addPreviewGroup,
  removePreviewGroup,
  updatePreviewGroup,
  updateConfigValue,
  resetAllParams,
  resetFieldValue,
  undoFieldValue,
  applyPreset,
});
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
bindWindowActions({
  openSampleLightbox,
  lightboxNav,
  closeSampleLightbox,
  openOutputFolder,
  scanDataset,
  toggleFolderPreview,
  loadMoreThumbs,
  runTrainingPreflight,
});

window.openAdvancedMonitor = async function() {
  try {
    await api.openAdvancedMonitor();
    showToast('高级监控器已打开。');
  } catch (error) {
    showToast(error?.message || '打开高级监控器失败。');
  }
};

// FIM Rank 扫描器（分层训练面板 fg_lora rank 字段区的 companion tool）
const { openFimScanTool, closeFimScanTool } = createFimScanTool({
  state,
  api,
  showToast,
  buildRunConfig,
});
bindWindowActions({ openFimScanTool, closeFimScanTool });

// 训练达标预测器（copilot 只读预测器阶段，advisory companion tool）
const { openGoalForecastTool, closeGoalForecastTool } = createGoalForecastTool({
  state,
  api,
  showToast,
});
bindWindowActions({ openGoalForecastTool, closeGoalForecastTool });

// 自动训练 Copilot（全自动 RSI 闭环编排面板，授权一次无人值守训练会话）
const { openCopilotTool, closeCopilotTool } = createCopilotTool({
  state,
  api,
  showToast,
});
bindWindowActions({ openCopilotTool, closeCopilotTool });

// wizard / plugins / tools actions
// wizard.executeTraining 指向 main.js 中 window.executeTraining（后续 Stage 3.16 迁到 actions/training.js）
const { wizardSet, wizardStartTraining } = createWizardActions({
  state,
  updateConfigValue,
  renderView,
  executeTraining: () => window.executeTraining?.(),
});
bindWindowActions({ wizardSet, wizardStartTraining });
const {
  pluginToggleDevMode,
  pluginReloadAll,
  pluginApprove,
  pluginApproveRunner,
  pluginRevoke,
  pluginExecuteSdkRunner,
  pluginShowAudit,
  pluginToggleSettingsPanel,
  pluginSaveSettings,
  pluginResetSettings,
  pluginSavePytorchOptimizerSettings,
  pluginResetPytorchOptimizerSettings,
} = createPluginsActions({
  pluginStore,
  toggleDeveloperMode,
  reloadAllPlugins,
  approvePlugin,
  approvePluginRunner,
  revokePlugin,
  executePluginSdkRunner,
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
bindWindowActions({
  pluginReloadAll,
  pluginApprove,
  pluginApproveRunner,
  pluginRevoke,
  pluginExecuteSdkRunner,
  pluginShowAudit,
  pluginToggleSettingsPanel,
  pluginSaveSettings,
  pluginResetSettings,
  pluginSavePytorchOptimizerSettings,
  pluginResetPytorchOptimizerSettings,
  turboCoreProbeStatus,
  turboCoreCopyFlags,
});
_developerModeChromeActions = createDeveloperModeChromeActions({
  state,
  pluginStore,
  loadPluginRuntime,
  renderView,
  queryAll: $$,
});
const { runTool } = createToolsActions({ api, showToast, _renderLogLines });
bindWindowActions({ runTool });

let _trainingChromeActions = null;
const renderNavigator = createNavigatorRenderer({
  state,
  TRAINING_TYPES,
  _persistTrainingGroupsCollapsed: () => _trainingChromeActions?.persistTrainingGroupsCollapsed(),
});
// settings renderer（updateLayoutWidth 是 window 箭头函数，不在依赖列表中）
const renderSettings = createSettingsRenderer({ state, t, renderSlot, applyAndPersistLayout, renderView, applyTheme, showToast });
_renderConfigImpl = createConfigPageRenderer({
  state,
  TRAINING_TYPES,
  escapeHtml,
  renderPreflightOverviewPanel,
  renderPreflightReport,
  renderSlot,
  renderExperimentalTrainingPanel,
  renderConfigSections,
  renderFloatingTrainingAssistant,
  renderNavigator,
  syncTopbarState,
  syncFooterAction,
  updateJSONPreview,
  setupWaterfallScrollSpy: (container) => _trainingChromeActions?.setupWaterfallScrollSpy(container),
}).renderConfig;
_renderViewImpl = createAppViewRenderer({
  state,
  query: $,
  escapeHtml,
  applyLayoutPreferences,
  syncFooterAction,
  renderConfig,
  renderSettings,
  renderLogs,
  renderTools,
  renderDataset,
  renderAbout,
  renderGuide,
  renderWizard,
  renderPlugins,
  renderTurboCore,
  renderTraining,
}).renderView;
_trainingChromeActions = createTrainingChromeActions({
  state,
  getFieldDefinition,
  loadTrainingWikiEntry,
  buildSchemaFallbackEntry,
  escapeHtml,
  renderNavigator,
  renderView,
  queryAll: $$,
});
bindWindowActions({
  toggleTrainingGroup: _trainingChromeActions.toggleTrainingGroup,
  toggleTrainingAdvisor: _trainingChromeActions.toggleTrainingAdvisor,
  openTrainingOptionHelp: _trainingChromeActions.openTrainingOptionHelp,
  closeTrainingOptionHelp: _trainingChromeActions.closeTrainingOptionHelp,
  startTrainingAdvisorDrag: _trainingChromeActions.startTrainingAdvisorDrag,
});
// nav actions（依赖 renderNavigator 进行训练类型导航刷新）
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
bindWindowActions({ dismissPreflightReport, dismissTrainingSummary });
// runtime actions
const { runPreflight, refreshRuntime, applyTrainingAdvisorPatch, runPcieTransferBenchmark } = createRuntimeActions({
  state,
  api,
  showToast,
  renderView,
  updateJSONPreview,
  buildRunConfig,
  mergeConfigPatch,
  saveDraft,
});
bindWindowActions({ runPreflight, refreshRuntime, applyTrainingAdvisorPatch, runPcieTransferBenchmark });
// terminate actions
const { terminateTask, terminateAllTasks } = createTerminateActions({
  state, api, showToast, renderView,
  loadLocalTaskHistory, saveLocalTaskHistory, mergeTaskHistory, syncFooterAction,
});
bindWindowActions({ terminateTask, terminateAllTasks });
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
bindWindowActions({
  switchTrainingType,
  saveCurrentParams,
  loadSavedParams,
  loadNamedConfig,
  deleteSavedConfig,
  renameSavedConfig,
  previewSavedConfig,
  downloadConfigFile,
  importConfigFile,
});
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
bindWindowActions({ showTaskSummary });

// trainingActions — validateConfigConflicts + executeTraining
const { validateConfigConflicts, executeTraining } = createTrainingActions({
  state, api, showToast, renderView, updateJSONPreview, syncFooterAction,
  buildRunConfig, buildTaskMetadataFromConfig, resetTrainingMetrics,
  rememberTrainingTaskMetadata, getPendingTrainingMetadata, applyTaskMetadata,
  loadLocalTaskHistory, saveLocalTaskHistory, mergeTaskHistory,
  refreshTrainingLog, startTrainingLogPolling, startSysMonitorPolling,
});
bindWindowActions({ executeTraining });























document.addEventListener('DOMContentLoaded', init);
