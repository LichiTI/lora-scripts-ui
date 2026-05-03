import { t } from './i18n.js';
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
  ALL_OPTIMIZERS,
  ALL_SCHEDULERS,
  SCHEDULER_TYPE_TO_VALUE,
} from './features/settingsOptions.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const TOPBAR_TABS = UI_TABS.map((tab) => tab.key);
const BUILTIN_LEGACY_UI_PROFILE_ID = 'builtin-legacy';
const CONDITIONAL_KEYS = new Set([
  'v_parameterization',
  'save_state',
  'network_module',
  'lycoris_algo',
  'lr_scheduler',
  'optimizer_type',
  'enable_preview',
  'randomly_choice_prompt',
  'ema_enabled',
  'safeguard_enabled',
  'torch_compile',
  'enable_base_weight',
  'log_with',
  'lora_type',
  'enable_distributed_training',
  'sync_use_password_auth',
  'lulynx_experimental_core_enabled',
  'lulynx_safeguard_enabled',
  'lulynx_ema_enabled',
  'lulynx_resource_manager_enabled',
  'lulynx_block_weight_enabled',
  'lulynx_smart_rank_enabled',
  'lulynx_auto_controller_enabled',
  'lulynx_lisa_enabled',
  'lulynx_pcgrad_enabled',
  'lulynx_pause_enabled',
  'lulynx_prodigy_guard_enabled',
  'lulynx_advanced_stats_enabled',
  'enable_block_weights',
  'sdxl_low_vram_optimization',
  'sdxl_low_vram_fixed_block_swap',
  'enable_mixed_resolution_training',
  'adapter_type',
  'bucket_selection_mode',
  'peak_vram_control_enabled',
  'peak_vram_startup_guard_enabled',
  'peak_vram_micro_batch_enabled',
  'peak_vram_diagnostics_enabled',
  'peak_vram_auto_protection_enabled',
  'experimental_attention_profile_enabled',
  'flow_model',
  'flow_timestep_distribution',
  'flow_uniform_shift',
  'contrastive_flow_matching',
  'pissa_init',
  'enable_debug_options',
  'caption_tag_dropout_target_mode',
]);
const DRAFT_STORAGE_KEY = 'sd-rescripts:ui:sdxl-draft';

const state = {
  compactLayout: false,
  importInputBound: false,
  pickerInputBound: false,
  navigatorWidth: Number(localStorage.getItem('sd-rescripts:ui:navigator-width') || 240),
  jsonPanelWidth: Number(localStorage.getItem('sd-rescripts:ui:json-width') || 280),
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
  jsonPanelCollapsed: false,
  lang: 'zh',
  theme: localStorage.getItem('theme') || 'dark',
  roundedUI: localStorage.getItem('roundedUI') === 'true',
  verticalTabs: localStorage.getItem('verticalTabs') === 'true',
  activeModule: 'config',
  activeTab: localStorage.getItem('sdxl_ui_tab') || 'model',
  navigatorCollapsed: false,
  sections: {
    'training-types': true,
    'preset-list': true,
  },
  accentColor: localStorage.getItem('accentColor') || null,
  activeTrainingType: localStorage.getItem('sd-rescripts:training-type') || 'sdxl-lora',
  config: createDefaultConfig(localStorage.getItem('sd-rescripts:training-type') || 'sdxl-lora'),
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
  _deletedTaskIds: new Set(),
  loading: {
    runtime: false,
    preflight: false,
    samplePrompt: false,
    run: false,
  },
};

function init() {
  loadDraft();
  applyTheme();
  applyLanguage();
  setupSidebar();
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
  setupTopbarSearch();

  // 页面关闭前用 sendBeacon 同步保存任务历史，防止异步 fetch 被中断
  // 使用标记避免与正常保存操作竞态
  window.addEventListener('beforeunload', () => {
    if (state._taskHistoryDirty) {
      const completed = state.tasks.filter(t => t.status !== 'CREATED');
      if (completed.length > 0) {
        navigator.sendBeacon('/api/local/task_history', JSON.stringify({ tasks: completed }));
      }
    }
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function showToast(message, duration = 2500) {
  let container = $('#toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast-item';
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

function loadDraft() {
  const rawDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!rawDraft) {
    return;
  }

  try {
    const parsed = JSON.parse(rawDraft);
    if (!parsed || typeof parsed !== 'object') {
      return;
    }
    mergeConfigPatch(parsed);
    state.hasLocalDraft = true;
  } catch (error) {
    console.warn('Failed to read local draft:', error);
  }
}

function saveDraft() {
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(state.config));
}

function mergeConfigPatch(patch) {
  if (!patch || typeof patch !== 'object') {
    return;
  }

  for (const [key, value] of Object.entries(patch)) {
    const field = getFieldDefinition(key);
    if (!field) {
      continue;
    }
    state.config[key] = normalizeDraftValue(field, value);
  }
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

  const [runtimeResult, presetsResult, savedParamsResult, tasksResult, interrogatorsResult] = await Promise.allSettled([
    api.getGraphicCards(),
    api.getPresets(),
    api.getSavedParams(),
    api.getTasks(),
    api.getInterrogators(),
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
    mergeConfigPatch(savedParamsResult.value.data || {});
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



  state.loading.runtime = false;
  if (state.activeModule === 'config') {
    renderView('config');
  } else {
    updateJSONPreview();
  }
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
        state.backendOffline = false;
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
        const failed = lastTask && (lastTask.status === 'TERMINATED' || (lastTask.returncode != null && lastTask.returncode !== 0));
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
          else if (state.tasks.some((t) => t.status === 'FINISHED')) badge.innerHTML = '<span style="color:#22c55e;font-weight:700;">' + _ico('check-circle') + ' 已完成</span>';
          else badge.innerHTML = '<span style="color:var(--text-dim);">空闲</span>';
        }
      }
    } catch (error) {
      _pollFailCount++;
      if (_pollFailCount === 1) {
        // 首次失败时提示（之后静默，避免刷屏）
        console.warn('[TaskPoll] 后端不可达，轮询将自动降频重试。', error.message || '');
        state.backendOffline = true;
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
  const sections = getSectionsForTab(state.activeTab, tt);
  const visibleSections = sections.filter((section) =>
    section.fields.some((field) => field.type !== 'hidden' && isFieldVisible(field, state.config))
  );

  container.innerHTML = `
    <div class="form-container">
      <header class="section-title">
        <h2>${typeLabel} LoRA 模式</h2>
        <p></p>
      </header>
      <div class="status-deck" id="status-deck">${renderStatusDeck()}</div>
      ${renderPreflightReport()}
      ${renderSlot('training.preflight_panel')}
      ${renderSlot('config.after_status_deck')}
      <div class="section-toolbar">
        <div class="toolbar-actions toolbar-check-actions">
          <button class="btn btn-outline btn-check" type="button" onclick="runPreflight()" style="width:100%;">
            <span class="btn-check-label">训练预检</span>
            <span class="btn-check-desc">检测运行环境 + 检查数据集路径、底模路径等参数</span>
          </button>
        </div>
      </div>
      ${visibleSections.map(renderSection).join('')}
    </div>
  `;

  renderNavigator();
  syncTopbarState();
  syncFooterAction();
  updateJSONPreview();
}

function renderSection(section) {
  const fields = section.fields.filter((field) => field.type !== 'hidden' && isFieldVisible(field, state.config));

  return `
    <section class="form-section" id="${escapeHtml(section.id)}">
      <header class="section-header">
        <h3>${escapeHtml(section.title)}</h3>
        <span class="section-meta">${fields.length} 项参数</span>
      </header>
      <div class="section-summary">${escapeHtml(section.description)}</div>
      <div class="section-content">
        ${fields.map((field) => renderField(field)).join('')}
      </div>
    </section>
  `;
}

function renderField(field) {
  const value = state.config[field.key];
  const label = field.label;
  const defaultValue = field.defaultValue ?? '';
  const isPicker = field.type === 'file' || field.type === 'folder';
  const isModified = String(value ?? '') !== String(defaultValue);
  const showBuiltinPicker = canUseBuiltinPicker(field);
  const canUndo = Object.hasOwn(state.fieldUndo, field.key);
  const canReset = String(value ?? '') !== String(defaultValue ?? '');
  const pickerMode = field.pickerType || field.type;
  const builtinPickerIcon = (pickerMode === 'folder' || pickerMode === 'output-folder') ? '#icon-folder' : '#icon-file';
  const renderHeader = () => `
    <div class="field-header-row">
      <label>${escapeHtml(label)}</label>
      <div class="field-inline-actions" data-field-key="${field.key}">
        <button class="field-menu-toggle" type="button" title="参数更多操作" data-field-menu-key="${field.key}">···</button>
        ${showBuiltinPicker ? `<button class="picker-mode-icon-btn" type="button" title="内置文件选择器" onclick="openNativePicker('${field.key}', '${pickerMode}')"><svg class="icon"><use href="${builtinPickerIcon}"></use></svg></button>` : ''}
      </div>
    </div>
  `;

  const modCls = isModified ? ' field-modified' : '';
  if (field.type === 'boolean') {
    return `
      <div class="config-group row boolean-card${modCls}" data-field-key="${field.key}">
        <div class="label-col">
          ${renderHeader()}
          <p class="field-desc">${escapeHtml(field.desc || '')}</p>
        </div>
        <label class="switch switch-compact">
          <input type="checkbox" ${value ? 'checked' : ''} onchange="updateConfigValue('${field.key}', this.checked)">
          <span class="slider round"></span>
        </label>
      </div>
    `;
  }

  if (field.type === 'select') {
    let filteredOptions = field.options;
    const ensureCurrentOption = (options) => {
      const current = value === undefined || value === null ? '' : String(value);
      if (!current || options.includes(current)) {
        return options;
      }
      return [current, ...options];
    };
    if (field.key === 'optimizer_type') {
      const vis = JSON.parse(localStorage.getItem('sd-rescripts:visible-optimizers') || '[]');
      if (vis.length > 0) filteredOptions = field.options.filter((o) => vis.includes(o));
    }
    if (field.key === 'lr_scheduler') {
      const vis = JSON.parse(localStorage.getItem('sd-rescripts:visible-schedulers') || '[]');
      if (vis.length > 0) filteredOptions = field.options.filter((o) => vis.includes(o));
    }
    filteredOptions = ensureCurrentOption(filteredOptions);
    return `
      <div class="config-group${modCls}" data-field-key="${field.key}">
        ${renderHeader()}
        <p class="field-desc">${escapeHtml(field.desc || '')}</p>
        <select onchange="updateConfigValue('${field.key}', this.value)">
          ${filteredOptions.map((option) => `<option value="${escapeHtml(option)}" ${String(value) === String(option) ? 'selected' : ''}>${escapeHtml(option || '默认')}</option>`).join('')}
        </select>
      </div>
    `;
  }

  if (field.type === 'textarea') {
    return `
      <div class="config-group${modCls}" data-field-key="${field.key}">
        ${renderHeader()}
        <p class="field-desc">${escapeHtml(field.desc || '')}</p>
        <textarea class="text-area" oninput="updateConfigValue('${field.key}', this.value)">${escapeHtml(value || '')}</textarea>
      </div>
    `;
  }

  const inputType = field.type === 'number' || field.type === 'slider' ? 'number' : 'text';
  const inputValue = value === undefined || value === null ? '' : value;

  if (isPicker) {
    return `
      <div class="config-group${modCls}" data-field-key="${field.key}">
        ${renderHeader()}
        <p class="field-desc">${escapeHtml(field.desc || '')}</p>
        <div class="input-picker">
          <button class="picker-icon" type="button" onclick="pickPath('${field.key}', '${field.pickerType || 'folder'}')">
            <svg class="icon"><use href="#icon-folder"></use></svg>
          </button>
          <input type="text" value="${escapeHtml(inputValue)}" oninput="updateConfigValue('${field.key}', this.value)">
        </div>
      </div>
    `;
  }



  return `
    <div class="config-group${modCls}" data-field-key="${field.key}">
      ${renderHeader()}
      <p class="field-desc">${escapeHtml(field.desc || '')}</p>
      <input class="text-input" type="${inputType}" value="${escapeHtml(inputValue)}" ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''} ${field.step !== undefined ? `step="${field.step}"` : ''} oninput="updateConfigValue('${field.key}', this.value)">
    </div>
  `;
}

function renderGpuInfo() {
  if (state.runtimeError) return state.runtimeError;
  if (!state.runtime?.cards?.length) return '等待检测显卡信息';
  return state.runtime.cards.map((card) => {
    if (typeof card === 'string') return card;
    return card.name || JSON.stringify(card);
  }).join('，');
}

function renderPreflightDetail() {
  if (!state.preflight) return '在训练前建议运行一遍训练预检';
  if (state.preflight.can_start) {
    const w = state.preflight.warnings || [];
    return w.length ? `${w.length} 个警告（点击"训练预检"查看详情）` : '全部通过，可以启动训练';
  }
  const errors = state.preflight.errors || [];
  if (!errors.length) return '训练预检未通过';
  return `${errors.length} 个错误（点击"训练预检"查看详情）`;
}

function renderPreflightReport() {
  const pf = state.preflight;
  if (!pf) return '';

  const errors = pf.errors || [];
  const warnings = pf.warnings || [];
  const notes = pf.notes || [];
  const ds = pf.dataset;
  const deps = pf.dependencies;

  if (errors.length === 0 && warnings.length === 0 && notes.length === 0 && !ds) {
    return '';
  }

  const canStart = pf.can_start;
  const borderColor = canStart ? (warnings.length > 0 ? '#f59e0b' : '#22c55e') : '#ef4444';
  const statusIcon = canStart ? (warnings.length > 0 ? _ico('alert-tri') : _ico('check-circle')) : _ico('x-circle');
  const statusText = canStart ? (warnings.length > 0 ? '预检通过（有警告）' : '预检通过') : '预检未通过';
  const statusColor = canStart ? (warnings.length > 0 ? '#f59e0b' : '#22c55e') : '#ef4444';

  let html = '<section class="form-section" id="preflight-report" style="border-left:3px solid ' + borderColor + ';">';
  html += '<header class="section-header" style="display:flex;justify-content:space-between;align-items:center;">';
  html += '<h3>' + statusIcon + ' 训练预检报告</h3>';
  html += '<button type="button" onclick="dismissPreflightReport()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.1rem;padding:2px 6px;" title="关闭">×</button>';
  html += '</header>';
  html += '<div class="section-content" style="display:block;">';

  // 状态概览
  html += '<div style="font-weight:700;color:' + statusColor + ';margin-bottom:12px;">' + statusText + '</div>';

  
  if (errors.length > 0) {
    html += '<div class="preflight-group">';
    html += '<div class="preflight-group-title" style="color:#ef4444;">' + _ico('x-circle', 14) + ' 错误 (' + errors.length + ')</div>';
    errors.forEach(function(e) {
      html += '<div class="preflight-item preflight-error">' + escapeHtml(e) + '</div>';
    });
    html += '</div>';
  }

  // 警告列表
  if (warnings.length > 0) {
    html += '<div class="preflight-group">';
    html += '<div class="preflight-group-title" style="color:#f59e0b;">' + _ico('alert-tri', 14) + ' 警告 (' + warnings.length + ')</div>';
    warnings.forEach(function(w) {
      html += '<div class="preflight-item preflight-warning">' +escapeHtml(w) + '</div>';
    });
    html += '</div>';
  }

  // 数据集摘要
  if (ds) {
    html += '<div class="preflight-group">';
    html += '<div class="preflight-group-title">' + _ico('folder', 14) + ' 数据集</div>';
    html += '<div class="preflight-dataset-grid">';
    html += _pfTag('图片数', ds.image_count || 0);
    html += _pfTag('有效图片', ds.effective_image_count || 0);
    html += _pfTag('标注覆盖', ((ds.caption_coverage || 0) * 100).toFixed(0) + '%');
    if (ds.alpha_capable_image_count > 0) html += _pfTag('含透明通道', ds.alpha_capable_image_count);
    if (ds.broken_image_count > 0) html += _pfTag('损坏图片', ds.broken_image_count, 'err');
    if (ds.images_without_caption_count > 0) html += _pfTag('缺少标注', ds.images_without_caption_count, 'warn');
    html += '</div></div>';
  }

  // 依赖检测
  if (deps) {
    var missing = deps.missing || [];
    var required = deps.required || [];
    if (missing.length > 0 || required.length > 0) {
      html += '<div class="preflight-group">';
      html += '<div class="preflight-group-title">' + _ico('activity', 14) + ' 运行时依赖</div>';
      missing.forEach(function(d) {
        html += '<div class="preflight-item preflight-error">' + escapeHtml(d.display_name) + ' — ' + escapeHtml(d.reason || '缺失') + '</div>';
      });
      required.filter(function(d) { return d.importable; }).forEach(function(d) {
        html += '<div class="preflight-item preflight-ok">' + escapeHtml(d.display_name) + ' ' + escapeHtml(d.version || '') + ' ✓</div>';
      });
      html += '</div>';
    }
  }

  // 提示信息（可折叠）
  if (notes.length > 0) {
    html += '<details class="preflight-group" style="margin-top:8px;">';
    html += '<summary class="preflight-group-title" style="cursor:pointer;">' + _ico('check-circle', 14) + ' 提示 (' + notes.length + ')</summary>';
    notes.forEach(function(n) {
      html += '<div class="preflight-item preflight-note">' + escapeHtml(n) + '</div>';
    });
    html += '</details>';
  }

  html += '</div></section>';
  return html;
}

function _pfTag(label, value, type) {
  var color = type === 'err' ? '#ef4444' : (type === 'warn' ? '#f59e0b' : 'var(--text-main)');
  return '<div class="preflight-tag"><span class="preflight-tag-label">' + label + '</span><span class="preflight-tag-value" style="color:' + color + ';">' + value + '</span></div>';
}

window.dismissPreflightReport = function() {
  state.preflight = null;
  var el = document.getElementById('preflight-report');
  if (el) el.remove();
};


function renderStatusDeck() {
  const runtimeLabel = state.runtimeError
    ? '离线'
    : state.loading.runtime
      ? '检测中...'
    : state.runtime?.cards?.length
      ? `${state.runtime.cards.length} 张显卡`
      : '检测中';

  // === 注意力后端检测 ===
  const xf = state.runtime?.xformers;
  const rt = state.runtime?.runtime;
  const sagePkg = rt?.packages?.sageattention;
  const flashPkg = rt?.packages?.flash_attn;
  const xfInstalled = xf?.installed;
  const xfSupported = xf?.supported;
  const sageInstalled = sagePkg?.importable;
  const flashInstalled = flashPkg?.importable;

  let attnLabel = '检测中';
  let attnDetail = '暂无状态信息';
  if (xf || sagePkg || flashPkg) {
    const parts = [];
    if (xfInstalled) {
      parts.push(`xFormers ${xf.version || ''} ${xfSupported ? '✓' : '(不支持)'}`);
    } else {
      parts.push('xFormers 未安装');
    }
    if (sageInstalled) {
      parts.push(`SageAttention ${sagePkg.version || ''} ✓`);
    } else {
      parts.push('SageAttention 未安装');
    }
    if (flashInstalled) {
      parts.push(`FlashAttention ${flashPkg.version || ''} ✓`);
    } else {
      parts.push('FlashAttention 未安装');
    }
    attnLabel = (xfSupported || sageInstalled || flashInstalled) ? '可用' : '受限';
    attnDetail = parts.join(' · ');
    if (xf?.reason) attnDetail += ` — ${xf.reason}`;
  }

  const preflightLabel = state.preflight
    ? state.preflight.can_start
      ? '可以启动'
      : `${state.preflight.errors.length} 个错误`
    : '未检查';
  const taskCount = state.tasks.filter((task) => task.status === 'RUNNING').length;

  return `
    <div class="status-card">
      <span class="status-label">运行环境</span>
      <strong class="status-value">${escapeHtml(runtimeLabel)}</strong>
      <span class="status-sub">${escapeHtml(renderGpuInfo())}</span>
    </div>
    <div class="status-card">
      <span class="status-label">注意力后端</span>
      <strong class="status-value">${escapeHtml(attnLabel)}</strong>
      <span class="status-sub">${escapeHtml(attnDetail)}</span>
    </div>
    <div class="status-card">
      <span class="status-label">训练预检</span>
      <strong class="status-value">${escapeHtml(preflightLabel)}</strong>
      <span class="status-sub">${escapeHtml(renderPreflightDetail())}</span>
    </div>
    <div class="status-card" id="task-status-card">
      <span class="status-label">任务</span>
      <strong class="status-value">${taskCount}</strong>
      <span class="status-sub">${taskCount > 0 ? `有 ${taskCount} 个任务运行中` : '空闲'}</span>
    </div>
  `;
}

function renderNavigator() {
  const trainingTypeList = $('#section-training-types .group-list');
  if (trainingTypeList) {
    const groups = {};
    for (const tt of TRAINING_TYPES) {
      if (!groups[tt.group]) groups[tt.group] = [];
      groups[tt.group].push(tt);
    }
    // 默认折叠的组
    const defaultCollapsed = new Set(['ControlNet', 'Textual Inversion', '其他模型训练']);
    const _collapsedGroups = state._collapsedTrainingGroups || (state._collapsedTrainingGroups = new Set(defaultCollapsed));
    // 仅在用户切换训练类型时自动展开该组（通过标记避免每次渲染都展开）
    const activeGroup = TRAINING_TYPES.find(t => t.id === state.activeTrainingType)?.group || '';
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

window.toggleTrainingGroup = function(group) {
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
    const tabKey = TOPBAR_TABS[index];
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
    updateNavUI();
  });
  expandBtn?.addEventListener('click', () => {
    state.navigatorCollapsed = false;
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
/* ── Training Metrics Collection & Analysis ── */

/** Incrementally collect speed/loss/epoch from latest poll lines */
function collectTrainingMetrics(lines) {
  const m = state.trainingMetrics;
  if (!m.startTime) m.startTime = Date.now();

  // Scan ALL lines (not just the last match) so we accumulate data points
  // across the entire tail window, not just one per poll.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const speedMatch = line.match(/(\d+\.?\d*)\s*(it\/s|s\/it)/);
    const lossMatch = line.match(/avr_loss[=:]\s*(\d+\.?\d*)/);
    const stepMatch = line.match(/\|\s*(\d+)\/(\d+)\s*\[/);
    const now = Date.now();
    if (speedMatch) {
      let itPerSec = parseFloat(speedMatch[1]);
      if (speedMatch[2] === 's/it') itPerSec = itPerSec > 0 ? 1 / itPerSec : 0;
      m.speeds.push({ time: now, itPerSec });
    }
    if (lossMatch) {
      const curLoss = parseFloat(lossMatch[1]);
      const curStep = stepMatch ? parseInt(stepMatch[1]) : m.lastStep;
      const prevLoss = m.losses.length > 0 ? m.losses[m.losses.length - 1].loss : -1;
      if (curStep > m.lastStep || m.losses.length === 0 || Math.abs(curLoss - prevLoss) > 0.0001) {
        m.losses.push({ time: now, step: curStep, loss: curLoss });
        m.lastStep = curStep;
      }
    }
    if (stepMatch) {
      m.totalSteps = parseInt(stepMatch[2]);
      m.lastStep = Math.max(m.lastStep, parseInt(stepMatch[1]));
    }
    const ep = lines[i].match(/epoch\s+(\d+)\/(\d+)/);
    if (ep) {
      const cur = parseInt(ep[1]);
      const tot = parseInt(ep[2]);
      if (!m.epochs.length || m.epochs[m.epochs.length - 1].epoch < cur) {
        m.epochs.push({ epoch: cur, total: tot });
      }
    }
  }
}

function buildTaskMetadataFromConfig(config, trainingTypeId) {
  const cfg = config || {};
  const typeId = cfg.model_train_type || trainingTypeId || state.activeTrainingType || '';
  return {
    output_name: cfg.output_name || '',
    model_train_type: typeId,
    created_at: new Date().toLocaleString('zh-CN', { hour12: false }),
    training_type_label: (TRAINING_TYPES.find((item) => item.id === typeId) || {}).label || '',
    resolution: cfg.resolution || '',
    network_dim: cfg.network_dim || cfg.lokr_dim || cfg.dim || '',
  };
}

function getPendingTrainingMetadata(taskId = '') {
  const pending = state._pendingTrainingMetadata || null;
  if (!pending) return null;
  if (!taskId) return pending;
  if (pending.taskId && pending.taskId !== taskId) return null;
  return pending;
}

function applyTaskMetadata(task, metadata, options = {}) {
  if (!task || !metadata) return;
  const force = !!(options && options.force);
  const keys = ['output_name', 'model_train_type', 'created_at', 'training_type_label', 'resolution', 'network_dim'];
  for (const key of keys) {
    if (metadata[key] !== undefined && metadata[key] !== '' && (force || task[key] === undefined || task[key] === '')) {
      task[key] = metadata[key];
    }
  }
}

function rememberTrainingTaskMetadata(taskId, metadata = null) {
  if (!taskId) return;
  const pending = metadata || getPendingTrainingMetadata() || buildTaskMetadataFromConfig(state.config, state.activeTrainingType);
  const normalized = { ...pending, taskId };
  state._pendingTrainingMetadata = normalized;
  state.activeTrainingTaskId = taskId;
  for (const task of state.tasks) {
    if (task.id === taskId || task.task_id === taskId) applyTaskMetadata(task, normalized, { force: false });
  }
}

function resetTrainingMetrics(options = {}) {
  const keepLogSnapshot = !!(options && options.keepLogSnapshot);
  state.trainingMetrics = {
    speeds: [], losses: [], epochs: [],
    startTime: null, lastStep: 0, totalSteps: 0,
  };
  _resetTrainingLogCursor();
  state.trainingSummary = null;
  if (!keepLogSnapshot) {
    state.trainingLogSnapshot = { taskId: '', html: '', updatedAt: 0 };
    const logEl = $('#training-log-container');
    if (logEl) {
      logEl.innerHTML = '<span style="color:var(--text-muted);">已开始新的训练任务，等待训练输出...</span>';
      logEl.scrollTop = 0;
    }
  }
}

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const min = Math.floor((sec % 3600) / 60);
const s = sec % 60;
  if (h > 0) return h + 'h ' + min + 'm ' + s + 's';
  if (min > 0) return min + 'm ' + s + 's';
  return s + 's';
}

/** Parse ALL lines at once into a metrics object (for historical replay) */
function parseLinesIntoMetrics(lines) {
  const m = { speeds: [], losses: [], epochs: [], startTime: null, lastStep: 0, totalSteps: 0 };
  let prevStep = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const speedMatch = line.match(/(\d+\.?\d*)\s*(it\/s|s\/it)/);
    const lossMatch = line.match(/avr_loss[=:]\s*(\d+\.?\d*)/);
    const stepMatch = line.match(/\|\s*(\d+)\/(\d+)\s*\[/);
    if (speedMatch) {
      let itPerSec = parseFloat(speedMatch[1]);
      if (speedMatch[2] === 's/it') itPerSec = itPerSec > 0 ? 1 / itPerSec : 0;
      m.speeds.push({ time: 0, itPerSec });
    }
    if (lossMatch) {
      const curLoss = parseFloat(lossMatch[1]);
      const curStep = stepMatch ? parseInt(stepMatch[1]) : prevStep;
      const prevLossVal = m.losses.length > 0 ? m.losses[m.losses.length - 1].loss : -1;
      if (curStep > prevStep || m.losses.length === 0 || Math.abs(curLoss - prevLossVal) > 0.0001) {
        m.losses.push({ time: 0, step: curStep, loss: curLoss });
        prevStep = curStep;
      }
    }
    if (stepMatch) {
      m.totalSteps = parseInt(stepMatch[2]);
      prevStep = Math.max(prevStep, parseInt(stepMatch[1]));
      m.lastStep = prevStep;
    }
    const ep = line.match(/epoch\s+(\d+)\/(\d+)/);
    if (ep) {
      const cur = parseInt(ep[1]);
      const tot = parseInt(ep[2]);
      if (!m.epochs.length || m.epochs[m.epochs.length - 1].epoch < cur) {
        m.epochs.push({ epoch: cur, total: tot });
      }
    }
  }
  return m;
}

/** Inline SVG icon helper for summary cards */
function _ico(id, size) {
  var sz = size || 16;
  return '<svg class="icon" style="width:' + sz + 'px;height:' + sz + 'px;vertical-align:middle;display:inline-block;flex-shrink:0;"><use href="#icon-' + id + '"></use></svg>';
}


/** Pure analysis: metrics object -> summary object */
function buildSummaryFromMetrics(m, elapsedMs) {
  let avgSpeed = 0;
  let speedRating = '';
  let speedColor = '';
  if (m.speeds.length > 0) {
    const warmupCut = Math.max(1, Math.floor(m.speeds.length * 0.1));
    const stable = m.speeds.slice(warmupCut);
    avgSpeed = stable.reduce(function(sum, v) { return sum + v.itPerSec; }, 0) / (stable.length || 1);
  }
  if (avgSpeed >= 3)        { speedRating = _ico('zap') + ' 极快'; speedColor = '#22c55e'; }
  else if (avgSpeed >= 1.5) { speedRating = _ico('zap') + ' 较快'; speedColor = '#22c55e'; }
  else if (avgSpeed >= 0.5) { speedRating = _ico('check-circle') + ' 正常'; speedColor = '#3b82f6'; }
  else if (avgSpeed >= 0.2) { speedRating = _ico('clock') + ' 较慢'; speedColor = '#f59e0b'; }
  else                      { speedRating = _ico('alert-tri') + ' 极慢'; speedColor = '#ef4444'; }

  let lossTrend = '';
  let lossColor = '';
  let lossDetail = '';
  let firstLoss = 0;
  let lastLoss = 0;
  let minLoss = Infinity;
  let lossDelta = 0;

  if (m.losses.length >= 2) {
    const n = m.losses.length;
    const headN = Math.max(1, Math.floor(n * 0.2));
    const tailN = Math.max(1, Math.floor(n * 0.2));
    const headAvg = m.losses.slice(0, headN).reduce(function(s, v) { return s + v.loss; }, 0) / headN;
    const tailAvg = m.losses.slice(n - tailN).reduce(function(s, v) { return s + v.loss; }, 0) / tailN;
    firstLoss = m.losses[0].loss;
    lastLoss = m.losses[n - 1].loss;
    minLoss = Math.min.apply(null, m.losses.map(function(l) { return l.loss; }));
    lossDelta = headAvg > 0 ? (tailAvg - headAvg) / headAvg : 0;

    const halfIdx = Math.floor(n / 2);
    const latterHalf = m.losses.slice(halfIdx);
    const latterMean = latterHalf.reduce(function(s, v) { return s + v.loss; }, 0) / latterHalf.length;
    const latterStd = Math.sqrt(latterHalf.reduce(function(s, v) { return s + Math.pow(v.loss - latterMean, 2); }, 0) / latterHalf.length);
    const volatility = latterMean > 0 ? latterStd / latterMean : 0;

    if (lossDelta < -0.15) {
      lossTrend = _ico('trending-down') + ' 持续下降'; lossColor = '#22c55e';
      lossDetail = 'Loss \u4e0b\u964d\u4e86 ' + Math.abs(lossDelta * 100).toFixed(1) + '%\uff0c\u8bad\u7ec3\u6536\u655b\u826f\u597d\u3002';
    } else if (lossDelta < -0.03) {
      lossTrend = _ico('trending-down') + ' 缓慢下降'; lossColor = '#3b82f6';
      lossDetail = 'Loss \u4e0b\u964d\u4e86 ' + Math.abs(lossDelta * 100).toFixed(1) + '%\uff0c\u6536\u655b\u8d8b\u52bf\u6b63\u5e38\u3002';
    } else if (lossDelta <= 0.03) {
      if (volatility > 0.15) {
        lossTrend = _ico('activity') + ' 波动较大'; lossColor = '#f59e0b';
        lossDetail = 'Loss \u5747\u503c\u57fa\u672c\u6301\u5e73\u4f46\u6ce2\u52a8\u7387 ' + (volatility * 100).toFixed(1) + '% \u504f\u9ad8\uff0c\u53ef\u5c1d\u8bd5\u964d\u4f4e\u5b66\u4e60\u7387\u3002';
      } else {
        lossTrend = _ico('minus-line') + ' 基本持平'; lossColor = '#f59e0b';
        lossDetail = 'Loss \u53d8\u5316\u4ec5 ' + Math.abs(lossDelta * 100).toFixed(1) + '%\uff0c\u53ef\u80fd\u5df2\u63a5\u8fd1\u6536\u655b\u6216\u5b66\u4e60\u7387\u4e0d\u8db3\u3002';
      }
    } else if (lossDelta <= 0.15) {
      lossTrend = _ico('trending-up') + ' 轻微上升'; lossColor = '#ef4444';
      lossDetail = 'Loss \u4e0a\u5347\u4e86 ' + (lossDelta * 100).toFixed(1) + '%\uff0c\u53ef\u80fd\u51fa\u73b0\u8fc7\u62df\u5408\u8ff9\u8c61\u3002';
    } else {
      lossTrend = _ico('trending-up') + ' 明显上升'; lossColor = '#ef4444';
      lossDetail = 'Loss \u4e0a\u5347\u4e86 ' + (lossDelta * 100).toFixed(1) + '%\uff0c\u8bad\u7ec3\u53ef\u80fd\u53d1\u6563\uff0c\u5efa\u8bae\u68c0\u67e5\u5b66\u4e60\u7387\u548c\u6570\u636e\u96c6\u3002';
    }
  } else if (m.losses.length === 1) {
    lastLoss = m.losses[0].loss;
    lossTrend = _ico('alert-tri') + ' 数据不足'; lossColor = 'var(--text-dim)';
    lossDetail = '\u4ec5\u91c7\u96c6\u5230 1 \u4e2a loss \u6570\u636e\u70b9\uff0c\u65e0\u6cd5\u5224\u65ad\u8d8b\u52bf\u3002';
  } else {
    lossTrend = _ico('alert-tri')+ ' 无数据'; lossColor = 'var(--text-dim)';
    lossDetail = '\u672a\u80fd\u89e3\u6790\u5230 loss \u6570\u636e\u3002';
  }

  var lastEpoch = m.epochs.length > 0 ? m.epochs[m.epochs.length - 1] : null;
  var epochDone = lastEpoch ? lastEpoch.epoch : 0;
  var epochTotal = lastEpoch ? lastEpoch.total : 0;

  let overallRating = '';
  let overallColor = '';
  let lossLevelTag = '';
  let lossLevelColor = '';
  if (m.losses.length < 2) {
    overallRating = _ico('alert-tri') + ' 数据不足，无法综合评价';
    overallColor = 'var(--text-dim)';
    lossLevelTag = '\u2014';
    lossLevelColor = 'var(--text-dim)';
  } else {
    var epochRatio = epochTotal > 0 ? epochDone / epochTotal : 1;
    let score = 0;
    // loss trend score (0~3)
    if (lossDelta < -0.15) score += 3;
  else if (lossDelta < -0.03) score += 2;
    else if (lossDelta <= 0.03) score += 1;
    // completion score (0~2)
    if (epochRatio >= 0.95) score += 2;
    else if (epochRatio >= 0.5) score += 1;
    // absolute final loss level — only mild bonus, no penalty
    // (loss scale varies hugely across architectures: SD1.5 ~0.05, SDXL/Prodigy ~0.1-1.0)
    if (lastLoss > 0 && lastLoss < 0.08) score += 1;

    // final loss level tag for display
    if (lastLoss <= 0) {
      lossLevelTag = '\u2014'; lossLevelColor = 'var(--text-dim)';
    } else if (lastLoss < 0.06) {
      lossLevelTag = '\u4f4e'; lossLevelColor = '#22c55e';
    } else if (lastLoss < 0.08) {
      lossLevelTag = '\u6b63\u5e38'; lossLevelColor = '#3b82f6';
    } else if (lastLoss < 0.12) {
      lossLevelTag = '\u6b63\u5e38'; lossLevelColor = '#3b82f6';
    } else if (lastLoss < 0.5) {
      lossLevelTag = '\u6b63\u5e38\u533a\u95f4'; lossLevelColor = '#3b82f6';
    } else if (lastLoss < 1.2) {
      lossLevelTag = '\u81ea\u9002\u5e94\u4f18\u5316\u5668\u6b63\u5e38\u8303\u56f4'; lossLevelColor = '#3b82f6';
    } else {
      lossLevelTag = '\u504f\u9ad8'; lossLevelColor = '#f59e0b';
    }

    // append final loss note to lossDetail
    if (lastLoss > 0) {
      var lvlNote = '';
      // Loss absolute thresholds vary hugely: SD1.5 ~0.02-0.08, SDXL ~0.05-0.12,
      // Prodigy/DAdapt ~0.08-1.0. Only describe, don't judge.
      if (lastLoss < 0.08)       lvlNote = '\u6700\u7ec8 Loss ' + lastLoss.toFixed(4) + '\u3002';
      else if (lastLoss < 0.5)   lvlNote = '\u6700\u7ec8 Loss ' + lastLoss.toFixed(4) + '\u3002\u4e0d\u540c\u67b6\u6784/\u4f18\u5316\u5668\u7684 Loss \u8303\u56f4\u5dee\u5f02\u5f88\u5927\uff0c\u8bf7\u4ee5\u8d8b\u52bf\u800c\u975e\u7edd\u5bf9\u503c\u8bc4\u5224\u3002';
      else if (lastLoss < 1.2)   lvlNote = '\u6700\u7ec8 Loss ' + lastLoss.toFixed(4) + '\u3002Prodigy/DAdapt \u7b49\u81ea\u9002\u5e94\u4f18\u5316\u5668\u7684 Loss \u901a\u5e38\u5728 0.08\u20131.0 \u8303\u56f4\uff0c\u8fd9\u662f\u6b63\u5e38\u7684\u3002';
      else                       lvlNote = _ico('alert-tri') + ' \u6700\u7ec8 Loss ' + lastLoss.toFixed(4) + ' \u504f\u9ad8\uff0c\u5efa\u8bae\u68c0\u67e5\u8bad\u7ec3\u53c2\u6570\u3002';
      lossDetail = lossDetail + ' ' + lvlNote;
    }

    score = Math.max(score, 0);
    if (score >= 6) {
      overallRating = _ico('trophy') + ' 优秀 \u2014 Loss \u6301\u7eed\u6536\u655b\u4e14\u7edd\u5bf9\u503c\u4f4e\uff0c\u8bad\u7ec3\u5145\u5206\u5b8c\u6210';
      overallColor = '#22c55e';
    } else if (score >= 4) {
      overallRating = _ico('check-circle') + ' 良好 \u2014 \u57fa\u672c\u6536\u655b\uff0c\u7ed3\u679c\u53ef\u7528';
      overallColor = '#22c55e';
    } else if (score >= 3) {
      overallRating = _ico('bar-chart') + ' 一般 \u2014 \u6709\u6536\u655b\u8d8b\u52bf\uff0c\u5efa\u8bae\u9002\u5f53\u589e\u52a0\u8bad\u7ec3\u6b65\u6570\u6216\u8c03\u6574\u5b66\u4e60\u7387';
      overallColor = '#3b82f6';
    } else if (score >= 1) {
      overallRating = _ico('alert-tri') + ' 欠佳 \u2014 \u6536\u655b\u4e0d\u660e\u663e\u6216 Loss \u504f\u9ad8\uff0c\u5efa\u8bae\u68c0\u67e5\u5b66\u4e60\u7387\u3001\u6570\u636e\u96c6\u548c\u8bad\u7ec3\u53c2\u6570';
      overallColor = '#f59e0b';
    } else {
      overallRating = _ico('x-circle') + ' 异常 \u2014 Loss \u672a\u6536\u655b\u6216\u8fc7\u9ad8\uff0c\u8bad\u7ec3\u7ed3\u679c\u53ef\u80fd\u4e0d\u53ef\u7528';
      overallColor = '#ef4444';
    }
  }


  var elapsed = typeof elapsedMs === 'number' ? elapsedMs : 0;
  var elapsedStr = elapsed > 0 ? formatDuration(elapsed) : '\u2014';

  return {
    _v: 2,
    avgSpeed, speedRating: speedRating, speedColor: speedColor,
    lossTrend: lossTrend, lossColor: lossColor, lossDetail: lossDetail,
    firstLoss: firstLoss, lastLoss: lastLoss, minLoss: minLoss, lossDelta: lossDelta,
    epochDone: epochDone, epochTotal: epochTotal,
    totalSteps: m.totalSteps, lastStep: m.lastStep,
    sampleCount: m.losses.length,
    elapsed: elapsed, elapsedStr: elapsedStr,
    overallRating: overallRating, overallColor: overallColor,
    lossLevelTag: lossLevelTag, lossLevelColor: lossLevelColor,
  };
}

/** Generate summary from live state.trainingMetrics */
function generateTrainingSummary() {
  var m = state.trainingMetrics;
  var elapsed = m.startTime ? Date.now() - m.startTime : 0;
  var summary = buildSummaryFromMetrics(m, elapsed);
  _appendSageEnvNote(summary);
  return summary;
}

function _appendSageEnvNote(summary) {
  // no-op: SageAttention warning removed
}

/** Generate summary from full log lines (for historical tasks) */
function generateSummaryFromTaskLog(lines) {
  var m = parseLinesIntoMetrics(lines);
  return buildSummaryFromMetrics(m, 0);
}

/** Render a summary object into HTML card */
function renderSummaryCard(s) {
  if (!s) return '';
  var lossRange = (s.firstLoss > 0 ? s.firstLoss.toFixed(4) : '\u2014')
    + ' \u2192 ' + (s.lastLoss > 0 ? s.lastLoss.toFixed(4) : '\u2014');
  if (s.minLoss < Infinity && s.minLoss > 0) {
    lossRange += '\uff08\u6700\u4f4e ' + s.minLoss.toFixed(4) + '\uff09';
  }
  return '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;">'
    + '<div class="status-card" style="flex:1;min-width:150px;">'
    + '<div class="status-label">\u5e73\u5747\u901f\u5ea6</div>'
    + '<div class="status-value" style="color:' + s.speedColor + ';">' + (s.avgSpeed > 0 ? s.avgSpeed.toFixed(2) + ' it/s' : '\u2014') + '</div>'
    + '<div class="status-sub">' + s.speedRating + '</div>'
    + '</div>'
    + '<div class="status-card" style="flex:1;min-width:150px;">'
    + '<div class="status-label">Loss \u8d8b\u52bf</div>'
    + '<div class="status-value" style="color:' + s.lossColor + ';">' + s.lossTrend + '</div>'
    + '<div class="status-sub">' + lossRange + '</div>'
    + '</div>'
    + '<div class="status-card" style="flex:1;min-width:150px;">'
    + '<div class="status-label">\u8bad\u7ec3\u8fdb\u5ea6</div>'
    + '<div class="status-value" style="color:var(--accent);">' + (s.epochDone > 0 ? 'Epoch ' + s.epochDone + '/' + s.epochTotal : 'Step ' + s.lastStep + '/' + s.totalSteps) + '</div>'
    + '<div class="status-sub">' + (s.elapsedStr !== '\u2014' ? '\u8bad\u7ec3\u65f6\u957f\uff1a' + s.elapsedStr + '\u3000' : '') + '\u91c7\u6837\u70b9\uff1a' + s.sampleCount + '</div>'
    + '</div>'
    + '<div class="status-card" style="flex:1;min-width:150px;">'
    + '<div class="status-label">\u6700\u7ec8 Loss</div>'
    + '<div class="status-value" style="color:' + (s.lossLevelColor || 'var(--text-dim)') + ';">' + (s.lastLoss > 0 ? s.lastLoss.toFixed(4) : '\u2014') + '</div>'
    + '<div class="status-sub">' + (s.lossLevelTag || '\u2014') + '</div>'
    + '</div>'
    + '</div>'
    + '<div style="margin-top:8px;">'
    + '<div class="status-card" style="border-left:3px solid ' + s.overallColor + ';">'
    + '<div class="status-label">\u7efc\u5408\u8bc4\u4ef7</div>'
    + '<div style="font-size:0.95rem;font-weight:700;color:' + s.overallColor + ';margin:4px 0;">' + s.overallRating + '</div>'
    + '<div class="status-sub">' + s.lossDetail + '</div>'
    + '</div>'
    + '</div>';
}

/** Render current training summary section */
function renderTrainingSummaryHTML() {
  var s = state.trainingSummary;
  if (!s) return '';
  return '<section class="form-section" id="training-summary-section">'
    + '<header class="section-header" style="display:flex;justify-content:space-between;align-items:center;">'
    + '<h3>\ud83d\udcca \u8bad\u7ec3\u603b\u7ed3</h3>'
    + '<button type="button" onclick="dismissTrainingSummary()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.1rem;padding:2px 6px;line-height:1;" title="\u5173\u95ed">\u00d7</button></header>'
    + '<div class="section-content" style="display:block;">' + renderSummaryCard(s) + '</div>'
    + '</section>';
}

async function fetchTaskLogLines(taskId, preferredTail = 5000) {
  let tail = Math.max(1, Number(preferredTail || 5000) || 5000);
  let resp = await api.getTaskOutput(taskId, tail);
  let data = resp?.data || {};
  let lines = data.lines || [];
  const total = Number(data.total || 0) || 0;
  if (total > lines.length && total > tail) {
    tail = Math.min(5000, Math.max(total, tail));
    resp = await api.getTaskOutput(taskId, tail);
    data = resp?.data || {};
    lines = data.lines || [];
  }
  return lines;
}

async function buildAndSaveSummaryFromTaskLog(taskId) {
  const lines = await fetchTaskLogLines(taskId, 5000);
  if (lines.length === 0) return null;
  const summary = generateSummaryFromTaskLog(lines);
  saveTaskSummary(taskId, summary);
  await saveLocalTaskHistory();
  return summary;
}

/** Save task summary to session cache */
function saveTaskSummary(taskId, summary) {
  state.taskSummaries[taskId] = summary;
  // 持久化：存到任务对象上，随 task_history.json 一起保存
  var task = state.tasks.find(function(t) { return t.id === taskId; });
  if (task) { task._summary = summary; }
  state._taskHistoryDirty = true;
  try {
    var cache = JSON.parse(sessionStorage.getItem('sd-rescripts:task-summaries') || '{}');
    cache[taskId] = summary;
    sessionStorage.setItem('sd-rescripts:task-summaries', JSON.stringify(cache));
  } catch (e) { /* ignore */ }
}

/** Load task summaries from session cache (called on init) */
function loadTaskSummariesFromCache() {
  var SUMMARY_VERSION = 2;
  try {
    var cache = JSON.parse(sessionStorage.getItem('sd-rescripts:task-summaries') || '{}');
    var validCount = 0;
    for (var id in cache) {
      var task = state.tasks.find(function(t) { return t.id === id; });
      if (task && task.status !== 'FINISHED') continue;
      if (cache[id] && cache[id]._v >= SUMMARY_VERSION) {
        state.taskSummaries[id] = cache[id];
        validCount++;
      }
    }
    if (validCount < Object.keys(cache).length) {
      sessionStorage.setItem('sd-rescripts:task-summaries', JSON.stringify(state.taskSummaries));
    }
  } catch (e) { /* ignore */ }
}

/** Load task history from local persistent file (via Vite middleware) */
async function loadLocalTaskHistory() {
  try {
    const resp = await fetch('/api/local/task_history');
    const data = await resp.json();
    return (data?.data?.tasks) || [];
  } catch (e) { return []; }
}

/** Save completed tasks to local persistent file */
async function saveLocalTaskHistory() {
  const completed = state.tasks.filter(t => t.status !== 'CREATED');
  if (completed.length === 0) return;
  try {
    await fetch('/api/local/task_history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: completed }),
    });
    state._taskHistoryDirty = false;
  } catch (e) { /* ignore */ }
}

/** Merge local history with backend live tasks. Backend tasks take priority by id. */
function mergeTaskHistory(backendTasks, localHistory, currentTasks) {
  const deletedIds = state._deletedTaskIds || new Set();
  const META_KEYS = ['output_name', 'model_train_type', 'created_at', 'training_type_label', 'resolution', 'network_dim', '_summary', '_recentlyFinished'];
  const byId = new Map();
  const localById = new Map();
  const currentById = new Map();
  for (const t of (currentTasks || [])) currentById.set(t.id, t);
  for (const t of localHistory) {
    if (deletedIds.has(t.id)) continue;
    localById.set(t.id, t);
    byId.set(t.id, { ...t });
  }
  const pendingMeta = getPendingTrainingMetadata();
  const activeTaskId = state.activeTrainingTaskId || (pendingMeta && pendingMeta.taskId) || '';
  for (const t of backendTasks) {
    if (deletedIds.has(t.id)) continue;
    const existing = byId.get(t.id);
    if (existing) {
      const saved = localById.get(t.id);
      // 后端覆盖 status/returncode，但保留本地已有的元数据
      for (const k of META_KEYS) {
        if (!t[k]) { const cur = currentById.get(t.id); if (cur && cur[k] !== undefined && cur[k] !== '') t[k] = cur[k]; }
        if (saved && saved[k] !== undefined && saved[k] !== '' && !t[k]) t[k] = saved[k];
      }
      const meta = getPendingTrainingMetadata(t.id) || (!activeTaskId && t.status === 'RUNNING' ? pendingMeta : null);
      if (meta) applyTaskMetadata(t, meta, { force: false });
      if (meta && !state.activeTrainingTaskId) rememberTrainingTaskMetadata(t.id, meta);
      Object.assign(existing, t);
    } else {
      const meta = getPendingTrainingMetadata(t.id) || (!activeTaskId && t.status === 'RUNNING' ? pendingMeta : null);
      if (meta) applyTaskMetadata(t, meta, { force: false });
      if (meta && !state.activeTrainingTaskId) rememberTrainingTaskMetadata(t.id, meta);
      byId.set(t.id, { ...t });
    }
  }
  const arr = Array.from(byId.values());
  arr.sort((a, b) => {
    if (a.status === 'RUNNING' && b.status !== 'RUNNING') return -1;
    if (b.status === 'RUNNING' && a.status !== 'RUNNING') return 1;
    return 0;
  });
  return arr;
}


/** Dismiss the training summary card */
window.dismissTrainingSummary = function() {
  state.trainingSummary = null;
  var el = document.getElementById('training-summary-section');
  if (el) el.remove();
};


/** Click handler: show/toggle summary for a historical task */
window.showTaskSummary = async function(taskId) {
  var panel = document.getElementById('task-summary-' + taskId);
  if (!panel) return;
  var task = state.tasks.find(function(t) { return t.id === taskId; });
  if (task && task.status !== 'FINISHED') {
    panel.innerHTML = '<span style="color:var(--text-dim);font-size:0.82rem;">失败或终止的任务不生成训练总结，请直接查看上方控制台日志。</span>';
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    return;
  }

  // Toggle: if already showing, collapse
  if (panel.dataset.loaded === 'true') {
    if (panel.style.display === 'none') {
      panel.style.display = 'block';
    } else {
      panel.style.display = 'none';
    }
    return;
  }

  // Check cache first
  if (state.taskSummaries[taskId] && state.taskSummaries[taskId]._v >= 2) {
    panel.innerHTML = renderSummaryCard(state.taskSummaries[taskId]);
    panel.style.display = 'block';
    panel.dataset.loaded = 'true';
    return;
  }

  // Fetch log and generate on-the-fly
  panel.innerHTML = '<span style="color:var(--text-dim);font-size:0.82rem;">\u2693 \u6b63\u5728\u5206\u6790\u8bad\u7ec3\u65e5\u5fd7...</span>';
  panel.style.display = 'block';
  try {
    var summary = await buildAndSaveSummaryFromTaskLog(taskId);
    if (!summary) {
      panel.innerHTML = '<span style="color:var(--text-dim);font-size:0.82rem;">\u65e0\u8bad\u7ec3\u8f93\u51fa\u6570\u636e\uff0c\u65e0\u6cd5\u8bc4\u5206\u3002</span>';
      panel.dataset.loaded = 'true';
      return;
    }
    panel.innerHTML = renderSummaryCard(summary);
    panel.dataset.loaded = 'true';
  } catch (e) {
    panel.innerHTML = '<span style="color:#ef4444;font-size:0.82rem;">\u65e5\u5fd7\u83b7\u53d6\u5931\u8d25</span>';
  }
};


/** Render dataset visualization sub-tab */
function renderPreflightPanel() {
  var da = state.datasetAnalysis;
  var loading = state.loading.preflight;
  var dataDir = state.config.train_data_dir || '';

  if (!da && !loading) {
    return '<div class="train-pf-empty"><div style="text-align:center;padding:48px 20px;">'
      + _ico('folder', 40) + '<br><br>'
      + '<div style="font-size:0.88rem;color:var(--text-main);font-weight:600;margin-bottom:6px;">\u6570\u636e\u96c6\u9884\u89c8</div>'
      + '<div style="font-size:0.76rem;color:var(--text-muted);margin-bottom:16px;max-width:360px;">'
      + (dataDir ? escapeHtml(dataDir) : '\u8bf7\u5148\u5728\u914d\u7f6e\u9875\u8bbe\u7f6e train_data_dir') + '</div>'
      + '<button class="btn btn-primary btn-sm" type="button" onclick="scanDataset()" style="padding:8px 24px;"'
      + (dataDir ? '' : ' disabled') + '>\u626b\u63cf\u6570\u636e\u96c6</button></div></div>';
  }
  if (loading) {
    return '<div class="train-pf-empty"><div style="text-align:center;padding:48px 20px;">'
      + _ico('loader', 24) + '<br><br><div style="font-size:0.82rem;color:var(--text-muted);">\u6b63\u5728\u626b\u63cf\u6570\u636e\u96c6...</div></div></div>';
  }

  var s = da.summary || {};
  var folders = da.folders || [];
  var topReso = da.top_resolutions || [];
  var batchSize = Number(state.config.train_batch_size) || 1;
  var epochs = Number(state.config.max_train_epochs) || 1;
  var estSteps = Math.ceil((s.effective_image_count || 0) / batchSize) * epochs;

  var metricsHtml = '<div class="train-pf-metrics">'
    + _pfMetric('\u56fe\u7247\u603b\u6570', s.image_count || 0, '')
    + _pfMetric('\u6709\u6548\u56fe\u7247 (\u00d7Repeats)', s.effective_image_count || 0, '')
    + _pfMetric('\u9884\u4f30\u6b65\u6570', estSteps.toLocaleString(), 'accent')
    + '</div>';

  // Resolution bar chart
  var resoHtml = '';
  if (topReso.length > 0) {
    var maxCount = Math.max.apply(null, topReso.map(function(r) { return r.count || 0; }));
    var bars = topReso.slice(0, 6).map(function(r) {
      var cnt = r.count || 0;
      var pct = maxCount > 0 ? Math.round(cnt / maxCount * 100) : 0;
      return '<div class="train-reso-bar-col"><div class="train-reso-count">' + cnt
        + '</div><div class="train-reso-bar" style="height:' + pct + '%"></div>'
        + '<div class="train-reso-label">' + escapeHtml(r.name || '') + '</div></div>';
    }).join('');
    resoHtml = '<div class="train-pf-card"><div class="train-pf-card-hdr"><span>\u5206\u8fa8\u7387\u5206\u5e03</span>'
      + '<span class="train-tag">' + topReso.length + ' \u4e2a\u6876</span></div>'
      + '<div class="train-reso-chart">' + bars + '</div></div>';
  }

  // Diagnostics
  var diags = [];
  var alphaCount = s.alpha_capable_image_count || 0;
  if (s.caption_count > 0) diags.push({ok: true, text: '\u6807\u6ce8\u6587\u4ef6\u5df2\u627e\u5230 (' + (s.caption_coverage * 100).toFixed(0) + '% \u8986\u76d6\u7387)'});
  else diags.push({ok: false, warn: true, text: '\u672a\u627e\u5230\u6807\u6ce8\u6587\u4ef6'});
  if (s.broken_image_count === 0) diags.push({ok: true, text: '\u65e0\u635f\u574f\u56fe\u7247'});
  else diags.push({ok: false, text: s.broken_image_count + ' \u5f20\u635f\u574f\u56fe\u7247'});
  if (alphaCount > 0) diags.push({ok: false, warn: true, text: alphaCount + ' \u5f20\u56fe\u7247\u542b\u900f\u660e\u901a\u9053 (PNG/WebP)\uff0c\u53ef\u80fd\u5f71\u54cd\u8bad\u7ec3\u7ed3\u679c'});
  else diags.push({ok: true, text: '\u65e0\u900f\u660e\u901a\u9053\u56fe\u7247'});
  if (s.images_without_caption_count > 0) diags.push({ok: false, warn: true, text: s.images_without_caption_count + ' \u5f20\u56fe\u7247\u7f3a\u5c11\u6807\u6ce8'});
  if (s.empty_caption_count > 0) diags.push({ok: false, warn: true, text: s.empty_caption_count + ' \u4e2a\u7a7a\u6807\u6ce8\u6587\u4ef6'});
  if (diags.length === 0) diags.push({ok: true, text: '\u5168\u90e8\u68c0\u67e5\u901a\u8fc7'});


  var diagHtml = '<div class="train-pf-card"><div class="train-pf-card-hdr"><span>\u8bca\u65ad</span></div>'
    + '<ul class="train-diag-list">' + diags.map(function(d) {
        var icon = d.ok ? _ico('check-circle', 15) : (d.warn ? _ico('alert-tri', 15) : _ico('x-circle', 15));
        var color = d.ok ? '#22c55e' : (d.warn ? '#f59e0b' : '#ef4444');
        return '<li style="color:' + color + ';">' + icon + ' <span style="color:var(--text-main);">' + escapeHtml(d.text) + '</span></li>';
      }).join('') + '</ul></div>';

  // Folder table with expandable image preview
  var tableHtml = '<div class="train-pf-table-wrap">'
    + '<div class="train-pf-table-hdr"><span class="train-pf-card-hdr"><span>\u6587\u4ef6\u5939\u7ed3\u6784</span></span></div>'
    + '<div class="train-pf-table-head"><div>\u8def\u5f84</div><div>\u6982\u5ff5\u6807\u7b7e</div><div style="text-align:right;">Repeats</div><div style="text-align:right;">\u56fe\u7247\u6570</div></div>';
  tableHtml += folders.map(function(f, idx) {
    var tag = f.name.replace(/^\d+_/, '');
    var repeats = f.repeats || 0;
    var fPath = f.path || '';
    return '<div class="train-pf-table-row" style="cursor:pointer;" onclick="toggleFolderPreview(' + idx + ',this)">'
      + '<div class="train-pf-folder-name">' + _ico('folder', 14) + ' ' + escapeHtml(f.name) + '</div>'
      + '<div class="train-pf-tag" id="pf-tag-' + idx + '">' + escapeHtml(tag) + '</div>'
      + '<div style="text-align:right;font-variant-numeric:tabular-nums;">' + repeats + '</div>'
      + '<div style="text-align:right;font-variant-numeric:tabular-nums;">' + f.image_count + '</div>'
      + '</div>'
      + '<div class="train-pf-thumbs" id="pf-thumbs-' + idx + '" data-folder="' + escapeHtml(fPath) + '" style="display:none;"></div>';
  }).join('');
  tableHtml += '</div>';

  return '<div class="train-pf-scroll">'
    + '<div class="train-pf-header"><div style="display:flex;align-items:center;gap:10px;">'
    + _ico('bar-chart', 16) + ' <span style="font-size:0.9rem;font-weight:700;">\u6570\u636e\u96c6\u9884\u89c8</span></div>'
    + '<div style="display:flex;align-items:center;gap:8px;">'
    + '<span style="font-size:0.68rem;color:var(--text-muted);">' + escapeHtml(dataDir) + '</span>'
    + '<button class="btn btn-outline btn-sm" type="button" onclick="scanDataset()" style="font-size:0.68rem;">\u91cd\u65b0\u626b\u63cf</button>'
    + '</div></div>'
    + metricsHtml
    + '<div class="train-pf-row2">' + resoHtml + diagHtml + '</div>'
    + tableHtml
    + '</div>';
}

function _pfMetric(label, value, type) {
  var color = type === 'accent' ? 'var(--accent)' : (type === 'ok' ? '#22c55e' : (type === 'warn' ? '#f59e0b' : (type === 'err' ? '#ef4444' : 'var(--text-main)')));
  return '<div class="train-pf-metric"><div class="train-pf-metric-label">' + label + '</div>'
    + '<div class="train-pf-metric-val" style="color:' + color + ';">' + value + '</div></div>';
}

/** Render training sample preview panel */
var _sampleCache = [];  // 缓存原始图片列表
var _sampleSort = 'time-desc';  // 排序方式
var _sampleFilter = '';  // 筛选关键词

function renderSamplesPanel() {
  return '<div class="train-pf-scroll" id="samples-panel">'
    + '<div class="train-pf-header"><div style="display:flex;align-items:center;gap:10px;">'
    + _ico('eye', 16) + ' <span style="font-size:0.9rem;font-weight:700;">训练预览图</span></div>'
    + '<div style="display:flex;align-items:center;gap:8px;">'
    + '<button class="btn btn-outline btn-sm" type="button" onclick="refreshSampleImages()" style="font-size:0.68rem;">' + _ico('refresh-cw', 13) + ' 刷新</button>'
    + '<button class="btn btn-outline btn-sm" type="button" onclick="openOutputFolder()" style="font-size:0.68rem;">' + _ico('folder', 13) + ' 打开 output 文件夹</button>'
    + '</div></div>'
    // 工具栏：筛选 + 排序
    + '<div id="samples-toolbar" style="padding:8px 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
    + '<input type="text" id="sample-filter-input" placeholder="输入关键词筛选..." value="' + escapeHtml(_sampleFilter) + '" oninput="applySampleFilter(this.value)" style="flex:1;min-width:140px;max-width:300px;padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-panel);color:var(--text-main);font-size:0.78rem;outline:none;">'
    + '<select id="sample-sort-select" onchange="applySampleSort(this.value)" style="padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-panel);color:var(--text-main);font-size:0.78rem;cursor:pointer;">'
    + '<option value="time-desc"' + (_sampleSort === 'time-desc' ? ' selected' : '') + '>最新优先</option>'
    + '<option value="time-asc"' + (_sampleSort === 'time-asc' ? ' selected' : '') + '>最旧优先</option>'
    + '<option value="epoch-asc"' + (_sampleSort === 'epoch-asc' ? ' selected' : '') + '>Epoch 正序</option>'
    + '<option value="epoch-desc"' + (_sampleSort === 'epoch-desc' ? ' selected' : '') + '>Epoch 倒序</option>'
    + '<option value="name-asc"' + (_sampleSort === 'name-asc' ? ' selected' : '') + '>名称 A→Z</option>'
    + '<option value="name-desc"' + (_sampleSort === 'name-desc' ? ' selected' : '') + '>名称 Z→A</option>'
    + '</select>'
    + '<span id="sample-count-badge" style="font-size:0.7rem;color:var(--text-muted);"></span>'
    + '</div>'
    + '<div id="samples-grid" style="padding:12px;"><div style="text-align:center;padding:40px;color:var(--text-muted);">' + _ico('loader', 20) + ' 加载中...</div></div>'
    + '</div>'
    + '<div id="sample-lightbox" class="sample-lightbox" style="display:none;" onclick="closeSampleLightbox(event)">'
    + '<button class="lb-arrow lb-arrow-left" type="button" onclick="event.stopPropagation();lightboxNav(-1)" title="上一张 (←)">&#10094;</button>'
    + '<button class="lb-arrow lb-arrow-right" type="button" onclick="event.stopPropagation();lightboxNav(1)" title="下一张 (→)">&#10095;</button>'
    + '<div class="sample-lightbox-inner">'
    + '<img id="sample-lightbox-img" src="" alt="">'
    + '<div id="sample-lightbox-name" style="color:#fff;font-size:0.82rem;margin-top:8px;text-align:center;"></div>'
    + '<button type="button" onclick="closeSampleLightbox()" style="position:absolute;top:12px;right:12px;background:rgba(0,0,0,0.5);color:#fff;border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:1.2rem;">×</button>'
    + '</div></div>';
}

function _extractEpoch(name) {
  var m = name.match(/_e(\d+)_/);
  return m ? parseInt(m[1]) : -1;
}

function _extractPrefix(name) {
  // 提取训练名称前缀（epoch 之前的部分）
  var m = name.match(/^(.+?)_e\d+_/);
  return m ? m[1] : name.replace(/\.[^.]+$/, '');
}

function _sortAndFilterSamples(images) {
  var filtered = images;
  if (_sampleFilter) {
    var kw = _sampleFilter.toLowerCase();
    filtered = images.filter(function(img) { return img.name.toLowerCase().includes(kw); });
  }
  var sorted = filtered.slice();
  switch (_sampleSort) {
    case 'time-asc': sorted.sort(function(a, b) { return a.mtime - b.mtime; }); break;
    case 'time-desc': sorted.sort(function(a, b) { return b.mtime - a.mtime; }); break;
    case 'epoch-asc': sorted.sort(function(a, b) { return _extractEpoch(a.name) - _extractEpoch(b.name) || a.name.localeCompare(b.name); }); break;
    case 'epoch-desc': sorted.sort(function(a, b) { return _extractEpoch(b.name) - _extractEpoch(a.name) || a.name.localeCompare(b.name); }); break;
    case 'name-asc': sorted.sort(function(a, b) { return a.name.localeCompare(b.name); }); break;
    case 'name-desc': sorted.sort(function(a, b) { return b.name.localeCompare(a.name); }); break;
    default: sorted.sort(function(a, b) { return b.mtime - a.mtime; });
  }
  return sorted;
}

function _renderSampleGrid(images) {
  var grid = document.getElementById('samples-grid');
  var badge = document.getElementById('sample-count-badge');
  if (!grid) return;

  var sorted = _sortAndFilterSamples(images);
  if (badge) {
    var totalStr = images.length + ' 张';
    if (_sampleFilter && sorted.length !== images.length) {
      badge.textContent = '显示 ' + sorted.length + ' / ' + totalStr;
    } else {
      badge.textContent = totalStr;
    }
  }

  if (sorted.length === 0) {
    if (_sampleFilter) {
      grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">'
        + '未找到匹配「' + escapeHtml(_sampleFilter) + '」的图片</div>';
    } else {
      grid.innerHTML = '<div style="text-align:center;padding:48px 20px;color:var(--text-muted);">'
        + _ico('folder', 32) + '<br><br>'
        + '<div style="font-size:0.85rem;">暂无预览图</div>'
        + '<div style="font-size:0.75rem;margin-top:4px;">训练时启用「训练预览图」后，生成的图片会显示在这里</div>'
        + '</div>';
    }
    return;
  }

  // 检测有多少个不同的训练前缀（用于显示分组标签）
  var prefixes = new Set(sorted.map(function(img) { return _extractPrefix(img.name); }));
  var showPrefix = prefixes.size > 1;

  grid.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;">'
    + sorted.map(function(img) {
      var src = '/api/local/sample_file?name=' + encodeURIComponent(img.name);
      var displayName = img.name.replace(/\.[^.]+$/, '');
      var epoch = _extractEpoch(img.name);
      var epochTag = epoch >= 0 ? 'Epoch ' + epoch : '';
      var prefix = _extractPrefix(img.name);
      return '<div class="sample-thumb" onclick="openSampleLightbox(\'' + escapeHtml(img.name) + '\')" style="cursor:pointer;background:var(--bg-hover);border-radius:8px;overflow:hidden;transition:transform 0.15s;">'
        + '<div style="aspect-ratio:1;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#000;">'
        + '<img src="' + src + '" loading="lazy" style="width:100%;height:100%;object-fit:contain;">'
        + '</div>'
        + '<div style="padding:6px 8px;">'
        + '<div style="font-size:0.7rem;color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(img.name) + '">' + escapeHtml(displayName) + '</div>'
        + '<div style="display:flex;gap:6px;align-items:center;margin-top:2px;">'
        + (epochTag ? '<span style="font-size:0.62rem;color:var(--accent);">' + epochTag + '</span>' : '')
        + (showPrefix ? '<span style="font-size:0.58rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100px;" title="' + escapeHtml(prefix) + '">' + escapeHtml(prefix) + '</span>' : '')
        + '</div>'
        + '</div></div>';
    }).join('')
    + '</div>';
}

window.refreshSampleImages = async function() {
  var grid = document.getElementById('samples-grid');
  if (!grid) return;
  grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">' + _ico('loader', 20) + ' 加载中...</div>';
  try {
    var resp = await api.getSampleImages();
    _sampleCache = (resp && resp.data && resp.data.images) ? resp.data.images : [];
    _renderSampleGrid(_sampleCache);
  } catch(e) {
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">' + _ico('x-circle', 20) + ' 加载失败: ' + escapeHtml(e.message || '') + '</div>';
  }
};

window.applySampleSort = function(sortValue) {
  _sampleSort = sortValue;
  _renderSampleGrid(_sampleCache);
};

window.applySampleFilter = function(keyword) {
  _sampleFilter = keyword;
  _renderSampleGrid(_sampleCache);
};

var _lightboxIndex = -1;

window.openSampleLightbox = function(fileName) {
  var lightbox = document.getElementById('sample-lightbox');
  var img = document.getElementById('sample-lightbox-img');
  var nameEl = document.getElementById('sample-lightbox-name');
  if (!lightbox || !img) return;
  // 找到当前图片在排序后列表中的索引
  var sorted = _sortAndFilterSamples(_sampleCache);
  _lightboxIndex = sorted.findIndex(function(s) { return s.name === fileName; });
  img.src = '/api/local/sample_file?name=' + encodeURIComponent(fileName);
  if (nameEl) nameEl.textContent = fileName;
  lightbox.style.display = 'flex';
};

window.lightboxNav = function(dir) {
  var sorted = _sortAndFilterSamples(_sampleCache);
  if (sorted.length === 0) return;
  _lightboxIndex = (_lightboxIndex + dir + sorted.length) % sorted.length;
  var target = sorted[_lightboxIndex];
  var img = document.getElementById('sample-lightbox-img');
  var nameEl = document.getElementById('sample-lightbox-name');
  if (img) img.src = '/api/local/sample_file?name=' + encodeURIComponent(target.name);
  if (nameEl) nameEl.textContent = target.name;
};

window.closeSampleLightbox = function(event) {
  // 点击箭头、图片、文件名时不关闭
  if (event && event.target) {
    var tag = event.target.tagName;
    if (tag === 'IMG' || event.target.classList.contains('lb-arrow') || event.target.closest('.sample-lightbox-inner')) return;
  }
  var lightbox = document.getElementById('sample-lightbox');
  if (lightbox) lightbox.style.display = 'none';
  _lightboxIndex = -1;
};

// 键盘左右翻页 + ESC 关闭
document.addEventListener('keydown', function(e) {
  var lightbox = document.getElementById('sample-lightbox');
  if (!lightbox || lightbox.style.display === 'none') return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); lightboxNav(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); lightboxNav(1); }
  else if (e.key === 'Escape') { closeSampleLightbox(); }
});

window.openOutputFolder = async function() {
  try {
    await api.openFolder('output');
    showToast('✓ 已打开 output 文件夹');
  } catch (e) {
    showToast(e.message || '打开文件夹失败');
  }
};



window.switchTrainTab = function(tab) {
  state.trainSubTab = tab;
  if (state.activeModule === 'training') {
    renderView('training');
    if (tab === 'preflight' && !state.datasetAnalysis && !state.loading.preflight && state.config.train_data_dir) {
      scanDataset();
    }
    if (tab === 'samples') {
      setTimeout(refreshSampleImages, 100);
    }
  }
};

window.scanDataset = async function() {
  var dataDir = state.config.train_data_dir;
  if (!dataDir) { showToast('\u8bf7\u5148\u8bbe\u7f6e train_data_dir'); return; }
  state.loading.preflight = true;
  if (state.activeModule === 'training') renderView('training');
  try {
    var resp = await api.analyzeDataset({ path: dataDir, caption_extension: state.config.caption_extension || '.txt' });
    if (resp.status === 'success' && resp.data) {
      state.datasetAnalysis = resp.data;
    } else {
      showToast(resp.message || '\u6570\u636e\u96c6\u626b\u63cf\u5931\u8d25');
    }
  } catch(e) {
    showToast(e.message || '\u6570\u636e\u96c6\u626b\u63cf\u5931\u8d25');
  } finally {
    state.loading.preflight = false;
    if (state.activeModule === 'training') renderView('training');
  }
};

/** Toggle image thumbnail preview for a folder row */
window.toggleFolderPreview = async function(idx, rowEl) {
  var panel = document.getElementById('pf-thumbs-' + idx);
  if (!panel) return;
  // Toggle visibility
  if (panel.style.display !== 'none' && panel.dataset.loaded === 'true') {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'flex';
  if (panel.dataset.loaded === 'true') return;
  // Load images
  var folder = panel.dataset.folder;
  if (!folder) return;
  panel.innerHTML = '<span style="font-size:0.72rem;color:var(--text-muted);padding:8px;">\u52a0\u8f7d\u4e2d...</span>';
  try {
    var resp = await api.listDatasetImages(folder, 6);
    var images = (resp && resp.data && resp.data.images) ? resp.data.images : [];
    var total = (resp && resp.data) ? resp.data.total : 0;
    if (images.length === 0) {
      panel.innerHTML = '<span style="font-size:0.72rem;color:var(--text-muted);padding:8px;">\u65e0\u56fe\u7247</span>';
    } else {
      panel.innerHTML = images.map(function(imgPath) {
        var src = '/api/image_resize/file?path=' + encodeURIComponent(imgPath);
        return '<div class="train-pf-thumb"><img src="' + src + '" loading="lazy"></div>';
      }).join('')
      + (total > images.length ? '<div class="train-pf-thumb train-pf-thumb-more" onclick="event.stopPropagation();loadMoreThumbs(' + idx + ',' + total + ')"data-idx="' + idx + '">+' + (total - images.length) + '</div>' : '');
    }
    // Update concept tag from first caption file
    var firstTag = (resp && resp.data && resp.data.first_tag) ? resp.data.first_tag : '';
    if (firstTag) {
      var tagCell = document.getElementById('pf-tag-' + idx);
      if (tagCell) tagCell.textContent = firstTag;
    }
    panel.dataset.loaded = 'true';
  } catch(e) {
    panel.innerHTML = '<span style="font-size:0.72rem;color:#ef4444;padding:8px;">\u52a0\u8f7d\u5931\u8d25</span>';
  }
};

window.runTrainingPreflight = async function() {
  state.loading.preflight = true;
  if (state.activeModule === 'training') renderView('training');
  try {
    var response = await api.runPreflight(buildRunConfig(state.config, state.activeTrainingType));
    state.preflight = response.status === 'success' ? response.data : { can_start: false, errors: [response.message || 'Failed'], warnings: [], notes: [] };
  } catch(e) {
    state.preflight = { can_start: false, errors: [e.message || 'Failed'], warnings: [], notes: [] };
  } finally {
    state.loading.preflight = false;
    if (state.activeModule === 'training') renderView('training');
    else if (state.activeModule === 'config') renderView('config');
  }
};



function renderTraining(container) {
  var running = state.tasks.filter(function(t) { return t.status === 'RUNNING'; });
  var finished = state.tasks.filter(function(t) { return t.status === 'FINISHED'; });
  var terminated = state.tasks.filter(function(t) { return t.status === 'TERMINATED'; });
  var lastTask = state.tasks[state.tasks.length - 1];
  var logSnapshot = state.trainingLogSnapshot || {};
  var hasRunning = running.length > 0;
  var m = state.trainingMetrics;
  var curTask = running[0] || lastTask;
  var taskIdShort = curTask ? curTask.id.slice(0, 8).toUpperCase() : '--------';

  // Compute live metrics for header
  var curStep = m.lastStep || 0;
  var totalSteps = m.totalSteps || 0;
  var lastEp = m.epochs.length > 0 ? m.epochs[m.epochs.length - 1] : null;
  var epochStr = lastEp ? ('Epoch ' + lastEp.epoch + '/' + lastEp.total) : '';
  var curSpeed = m.speeds.length > 0 ? m.speeds[m.speeds.length - 1].itPerSec : 0;
  var remainSec = (curSpeed > 0 && totalSteps > curStep) ? Math.round((totalSteps - curStep) / curSpeed) : 0;
  var remainStr = remainSec > 0 ? formatDuration(remainSec * 1000) : '--:--';
  var curLoss = m.losses.length > 0 ? m.losses[m.losses.length - 1].loss : 0;
  var prevLoss = m.losses.length > 1 ? m.losses[m.losses.length - 2].loss : curLoss;
  var lossDeltaPct = prevLoss > 0 ? ((curLoss - prevLoss) / prevLoss * 100) : 0;
  var lossArrow = lossDeltaPct < 0 ? _ico('trending-down', 12) : (lossDeltaPct > 0 ? _ico('trending-up', 12) : '');
  var lossArrowColor = lossDeltaPct < 0 ? '#22c55e' : (lossDeltaPct > 0 ? '#ef4444' : 'var(--text-dim)');

  // Status indicator
  var statusDot = '', statusText = '';
  if (hasRunning) {
    statusDot = '<span style="width:8px;height:8px;border-radius:50%;background:var(--accent);display:inline-block;animation:pulse-dot 1.5s ease-in-out infinite;"></span>';
    statusText = '<span style="font-family:monospace;font-size:0.82rem;font-weight:700;color:var(--accent);">SESSION_' + taskIdShort + '</span>';
  } else if (state.trainingFailed) {
    statusDot = '<span style="width:8px;height:8px;border-radius:50%;background:#ef4444;display:inline-block;"></span>';
    statusText = '<span style="font-family:monospace;font-size:0.82rem;font-weight:700;color:#ef4444;">FAILED</span>';
  } else if (finished.length > 0) {
    statusDot = '<span style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;"></span>';
    statusText = '<span style="font-family:monospace;font-size:0.82rem;font-weight:700;color:#22c55e;">COMPLETED</span>';
  } else {
    statusDot = '<span style="width:8px;height:8px;border-radius:50%;background:var(--text-muted);display:inline-block;"></span>';
    statusText = '<span style="font-family:monospace;font-size:0.82rem;color:var(--text-muted);">IDLE</span>';
  }

  // Mixed precision tag
  var precisionTag = state.config.mixed_precision ? state.config.mixed_precision.toUpperCase() : 'FP32';

  // GPU info
  var gpuName = '\u68c0\u6d4b\u4e2d...';
  if (state.runtime && state.runtime.cards && state.runtime.cards.length > 0) {
    var card = state.runtime.cards[0];
    gpuName = (typeof card === 'string') ? card : (card.name || 'GPU');
  }

  // Loss sparkline SVG
  var sparkSvg = '';
  if (m.losses.length >= 2) {
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
    sparkSvg = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;">'
      + '<defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity="0.3"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>'
      + '<path d="' + pathD + '" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>'
      + '<path d="' + pathD + ' L100 100 L0 100 Z" fill="url(#lg)"/>'
      + '</svg>';
  }

  // Active params
  var networkAlgo = state.config.network_module || '';
  // Anima 使用 lora_type 字段而非 network_module
  if (!networkAlgo && state.config.lora_type) {
    var lt = state.config.lora_type;
    if (lt === 'lora') networkAlgo = 'LoRA (Anima)';
    else if (lt === 'tlora') networkAlgo = 'T-LoRA (Anima)';
    else if (lt === 'lokr') networkAlgo = 'LoKr (Anima)';
  }
  if (networkAlgo === 'lycoris.kohya' && state.config.lycoris_algo) {
    networkAlgo = 'LyCORIS / ' + state.config.lycoris_algo;
  } else if (networkAlgo === 'networks.lora') { networkAlgo = 'LoRA'; }
  else if (networkAlgo === 'networks.lora_flux') { networkAlgo = 'LoRA (FLUX)'; }
  else if (networkAlgo === 'networks.tlora_flux') { networkAlgo = 'T-LoRA (FLUX)'; }
  else if (networkAlgo === 'networks.oft_flux') { networkAlgo = 'OFT (FLUX)'; }
  else if (networkAlgo === 'networks.lora_anima') { networkAlgo = 'LoRA (Anima)'; }
  else if (networkAlgo === 'networks.tlora_anima') { networkAlgo = 'T-LoRA (Anima)'; }
  else if (networkAlgo === 'networks.lora_sd3') { networkAlgo = 'LoRA (SD3)'; }
  else if (networkAlgo === 'networks.lora_lumina') { networkAlgo = 'LoRA (Lumina)'; }
  else if (networkAlgo === 'networks.lora_hunyuan_image') { networkAlgo = 'LoRA (HunyuanImage)'; }
  else if (networkAlgo === 'networks.dylora') { networkAlgo = 'DyLoRA'; }
  // Newbie 使用 adapter_type 字段
  if (!networkAlgo && state.config.adapter_type && state.config.model_train_type === 'newbie-lora') {
    var at = state.config.adapter_type;
    if (at === 'lora') networkAlgo = 'LoRA (Newbie)';
    else if (at === 'lokr') networkAlgo = 'LoKr (Newbie)';
  }
  var cfgParams = [
    ['\u7f51\u7edc\u7b97\u6cd5', networkAlgo || '\u2014'],
    ['\u5b66\u4e60\u7387\u8c03\u5ea6\u5668', state.config.lr_scheduler || '\u2014'],
    ['\u4f18\u5316\u5668', state.config.optimizer_type || '\u2014'],
    ['\u6279\u91cf\u5927\u5c0f', state.config.train_batch_size || '\u2014'],
    ['\u5b66\u4e60\u7387', state.config.learning_rate || '\u2014'],
    ['\u7f51\u7edc\u7ef4\u5ea6', state.config.network_dim || '\u2014'],
    ['\u7f51\u7edc Alpha', state.config.network_alpha || '\u2014'],
    ['\u8bad\u7ec3\u5206\u8fa8\u7387', state.config.resolution || '\u2014'],
    ['\u6700\u5927\u8f6e\u6570', state.config.max_train_epochs || '\u2014'],
    ['\u4fdd\u5b58\u95f4\u9694', state.config.save_every_n_epochs || '\u2014'],
    ['CLIP \u8df3\u8fc7\u5c42', state.config.clip_skip || '\u2014'],
    ['\u968f\u673a\u79cd\u5b50', state.config.seed || '\u2014'],
  ];
  var paramsHtml = cfgParams.map(function(p) {
    return '<div class="train-param-row">'
      + '<span class="train-param-key">'+ p[0] + '</span>'
      + '<span class="train-param-val">'+ escapeHtml(String(p[1])) + '</span>'
      + '</div>';
  }).join('');

  container.innerHTML = ''
  + '<div class="train-dashboard">'
  + '<div class="train-exec-header">'
  +   '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">'
  +     '<div style="display:flex;align-items:center;gap:8px;">' + statusDot + statusText + '</div>'
  +     '<span class="train-hdr-sep"></span>'
  +     '<span class="train-hdr-label">\u5f53\u524d\u6b65\u6570: <span class="train-hdr-val">' + curStep.toLocaleString() + ' / ' + (totalSteps > 0 ? totalSteps.toLocaleString() : '--') + '</span></span>'
  +     '<span class="train-hdr-label">\u5269\u4f59\u65f6\u95f4: <span class="train-hdr-val">' + remainStr + '</span></span>'
  +     (epochStr ? '<span class="train-hdr-label">' + epochStr + '</span>' : '')
  +   '</div>'
  +   '<div style="display:flex;align-items:center;gap:8px;">'
  +     '<span class="train-tag train-tag-accent">' + precisionTag + '</span>'
  +     (hasRunning && curTask ? '<span class="train-tag">PID: ' + escapeHtml(curTask.id.slice(0, 8)) + '</span>' : '')
  +   '</div>'
  + '</div>'

  // Tab bar
  + '<div class="train-tabs">'
  +   '<button class="train-tab' + (state.trainSubTab === 'monitor' ? ' active' : '') + '" onclick="switchTrainTab(\'monitor\')">' + _ico('terminal', 14) + ' \u76d1\u63a7</button>'
  +   '<button class="train-tab' + (state.trainSubTab === 'samples' ? ' active' : '') + '" onclick="switchTrainTab(\'samples\')">' + _ico('eye', 14) + ' \u9884\u89c8</button>'
  +   '<button class="train-tab' + (state.trainSubTab === 'preflight' ? ' active' : '') + '" onclick="switchTrainTab(\'preflight\')">' + _ico('check-circle', 14) + ' \u9884\u68c0</button>'
  + '</div>'

  // Body: conditional on sub-tab
  + (state.trainSubTab === 'preflight' ? renderPreflightPanel() : '')
  + (state.trainSubTab === 'samples' ? renderSamplesPanel() : '')
  + (state.trainSubTab === 'monitor' ? (
  '<div class="train-body">'
  // ---- Left: Terminal ----
  +   '<div class="train-logs-area">'
  +     '<div class="train-panel-header">'
  +       '<span class="train-panel-title">' + _ico('terminal', 14) + ' \u7cfb\u7edf\u6267\u884c\u65e5\u5fd7</span>'
  +       '<div style="display:flex;gap:8px;align-items:center;">'
  +         '<label style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-muted);cursor:pointer;">'
  +           '<input type="checkbox" id="training-log-autoscroll" checked style="width:13px;height:13px;"> \u81ea\u52a8\u6eda\u52a8'
  +         '</label>'
  +         '<button class="btn btn-outline btn-sm" type="button" onclick="refreshTrainingLog()" style="font-size:0.68rem;padding:2px 10px;">\u5237\u65b0</button>'
  +       '</div>'
  +     '</div>'
  +     '<div id="training-log-container" class="train-terminal">'
  +       (hasRunning
            ? (logSnapshot.html && logSnapshot.taskId === curTask.id
                ? logSnapshot.html
                : '<span style="color:var(--text-muted);">' + _ico('loader', 14) + ' \u6b63\u5728\u52a0\u8f7d\u8bad\u7ec3\u8f93\u51fa...</span>')
            : (logSnapshot.html
                ? logSnapshot.html
                : '<span style="color:var(--text-muted);">\u6682\u65e0\u8bad\u7ec3\u4efb\u52a1\u8fd0\u884c\u4e2d\u3002\u70b9\u51fb\u300c\u5f00\u59cb\u8bad\u7ec3\u300d\u542f\u52a8\u540e\uff0c\u8f93\u51fa\u5c06\u5728\u6b64\u5b9e\u65f6\u663e\u793a\u3002</span>'))
  +     '</div>'
  +   '</div>'

  // ---- Right: Side Panel ----
  +   '<div class="train-side-panel">'

  // Live Loss
  +     '<div class="train-side-section">'
  +       '<div class="train-panel-title">\u5b9e\u65f6 Loss</div>'
  +       '<div style="display:flex;justify-content:space-between;align-items:flex-end;">'
  +         '<span class="train-loss-big">' + (curLoss > 0 ? curLoss.toFixed(4) : '\u2014') + '</span>'
  +         '<span class="train-loss-delta" style="color:' + lossArrowColor + ';">' + lossArrow + ' ' + (lossDeltaPct !== 0 ? (lossDeltaPct > 0 ? '+' : '') + lossDeltaPct.toFixed(1) + '%' : '') + '</span>'
  +       '</div>'
  +       '<div class="train-chart-box">'
  +         (sparkSvg || '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:0.72rem;">\u7b49\u5f85\u6570\u636e...</div>')
  +       '</div>'
  +       (m.losses.length > 0 ? '<div class="train-chart-axis"><span>Step 0</span><span>Step ' + curStep + '</span></div>' : '')
  +     '</div>'

  // Hardware
  +     '<div class="train-side-section">'
  +       '<div class="train-panel-title">' + _ico('activity', 14) + ' \u786c\u4ef6 / \u8d44\u6e90\u76d1\u63a7</div>'
  +       '<div class="train-hw-card">'
  +         '<div class="train-hw-row"><span class="hw-label">\u663e\u5361</span><span class="hw-value">' + escapeHtml(gpuName) + '</span></div>'
  +         '<div class="train-hw-row"><span class="hw-label">\u901f\u5ea6</span><span id="train-live-speed" class="hw-value-accent">' + (curSpeed > 0 ? curSpeed.toFixed(2) + ' it/s' : '\u2014') + '</span></div>'
  +         '<div class="train-hw-row"><span class="hw-label">\u8fd0\u884c\u73af\u5883</span><span class="hw-value">' + (state.runtime && state.runtime.runtime ? state.runtime.runtime.environment : 'standard') + '</span></div>'
  +         '<div class="train-hw-row"><span class="hw-label">\u7cbe\u5ea6</span><span class="hw-value">' + precisionTag + '</span></div>'
  +       '</div>'
  +       '<div id="sys-monitor-panel" class="sysmon-panel">' + _buildSysMonitorHTML() + '</div>'
  +       '</div>'

  // Active params
  +     '<div class="train-side-section">'
  +       '<div class="train-panel-title">' + _ico('settings', 14) + ' \u5f53\u524d\u53c2\u6570</div>'
  +       '<div>' + paramsHtml + '</div>'
  +     '</div>'

  +     renderSlot('training.runtime_widget')

  +   '</div>'
  + '</div>'

  // Training summary + Task history (monitor only)
  + renderTrainingSummaryHTML()
  + '<div class="train-history-section">'
  +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
  +     '<div class="train-panel-title">' + _ico('clock', 14) + ' \u4efb\u52a1\u5386\u53f2</div>'
  +     (state.tasks.length > 0 ? '<button class="btn btn-outline btn-sm" style="font-size:0.7rem;padding:2px 8px;" type="button" onclick="clearAllTaskHistory()">' + _ico('trash-2', 12) + ' \u6e05\u7a7a\u5386\u53f2</button>' : '')
  +   '</div>'
  +   (state.tasks.length === 0
      ? '<p style="color:var(--text-muted);font-size:0.78rem;">\u6682\u65e0\u4efb\u52a1\u8bb0\u5f55</p>'
      : state.tasks.slice().reverse().map(function(task) {
    var statusMap = { RUNNING: _ico('loader') + ' 运行中', FINISHED: _ico('check-circle') + ' 已完成', TERMINATED: _ico('stop-circle') + ' 已终止', CREATED: _ico('clock') + ' 已创建' };
    var statusColor = { RUNNING: '#f59e0b', FINISHED: '#22c55e', TERMINATED: '#ef4444', CREATED: 'var(--text-dim)' };
    var canScore = task.status === 'FINISHED';
    var hasCached = canScore && !!(state.taskSummaries[task.id] && state.taskSummaries[task.id]._v >= 2);
    var isNotRunning = task.status !== 'RUNNING';
    var badge = hasCached ? _ico('bar-chart', 14) : (canScore && !task._recentlyFinished ? '点击评分' : '');
    var taskLabel = task.output_name || task.id.substring(0, 8);
    var timeStr = task.created_at || '';
    var typeTag = task.training_type_label || task.model_train_type || '';
    var metaParts = [timeStr, task.resolution ? ('分辨率 ' + task.resolution) : '', task.network_dim ? ('dim ' + task.network_dim) : ''].filter(Boolean);
    var metaStr = metaParts.join(' · ');
    return '<div style="border-bottom:1px solid var(--border);padding:5px 0;" id="task-row-' + task.id + '">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;">'
      + '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;' + (canScore ? 'cursor:pointer;' : '') + '" ' + (canScore ? 'onclick="showTaskSummary(\'' + task.id + '\')"' : '') + '>'
      + '<span style="font-size:0.78rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(taskLabel) + '</span>'
      + (typeTag ? '<span style="font-size:0.65rem;color:var(--text-muted);background:var(--bg-hover);padding:1px 5px;border-radius:3px;">' + escapeHtml(typeTag) + '</span>' : '')
      + (badge ? '<span style="font-size:0.68rem;color:var(--accent);opacity:0.7;">' + badge + '</span>' : '')
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">'
      + '<span style="color:' + (statusColor[task.status] || 'var(--text-dim)') + ';font-weight:600;font-size:0.78rem;">' + (statusMap[task.status] || task.status) + '</span>'
      + (isNotRunning ? '<button class="btn-icon" style="opacity:0.5;font-size:0.7rem;padding:2px;" type="button" onclick="event.stopPropagation();deleteTaskHistory(\'' + task.id + '\')" title="删除记录">' + _ico('x', 12) + '</button>' : '')

      + '</div>'
      + '</div>'
      + (metaStr ? '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">' + escapeHtml(metaStr) + '</div>' : '')
      + '<div id="task-summary-' + task.id + '" style="display:none;" data-loaded="' + (hasCached ? 'true' : 'false') + '">' + (hasCached ? renderSummaryCard(state.taskSummaries[task.id]) : '') + '</div>'
      + '</div>';
  }).join(''))
  + '</div>'

  + '</div>'
  ) : '') // end monitor conditional
  + '</div>'; // close train-dashboard

  syncFooterAction();
  if (hasRunning) {
    startTrainingLogPolling();
    startSysMonitorPolling();
  } else {
    _pollSystemMonitor(); // 即使没有训练也获取一次当前状态
  }


}



let _trainingLogPollTimer = null;
let _trainingLogCursor = { taskId: '', total: 0, liveLine: '' };

function _resetTrainingLogCursor(taskId = '') {
  _trainingLogCursor = { taskId, total: 0, liveLine: '' };
}

function _normalizeTrainingLiveLine(liveLine) {
  if (typeof liveLine !== 'string') return '';
  return liveLine.replace(/\s+$/, '');
}

function _mergeTrainingLogLines(lines, liveLine) {
  const merged = Array.isArray(lines) ? lines.slice() : [];
  const normalizedLiveLine = _normalizeTrainingLiveLine(liveLine);
  if (normalizedLiveLine && merged[merged.length - 1] !== normalizedLiveLine) {
    merged.push(normalizedLiveLine);
  }
  return merged;
}

function _collectIncrementalTrainingLogLines(taskId, lines, total, liveLine) {
  if (_trainingLogCursor.taskId !== taskId) {
    _resetTrainingLogCursor(taskId);
  }

  const safeLines = Array.isArray(lines) ? lines : [];
  const normalizedLiveLine = _normalizeTrainingLiveLine(liveLine);
  const previousTotal = _trainingLogCursor.total || 0;
  let incremental = safeLines;

  if (previousTotal > 0 && total >= previousTotal) {
    const delta = total - previousTotal;
    if (delta <= 0) {
      incremental = [];
    } else if (delta < safeLines.length) {
      incremental = safeLines.slice(-delta);
    }
  }

  if (normalizedLiveLine && normalizedLiveLine !== _trainingLogCursor.liveLine) {
    if (!incremental.length || incremental[incremental.length - 1] !== normalizedLiveLine) {
      incremental = incremental.concat(normalizedLiveLine);
    }
  }

  _trainingLogCursor = { taskId, total, liveLine: normalizedLiveLine };
  return incremental;
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

function _buildSysMonitorHTML() {
  var d = state.sysMonitor;
  if (!d) return '<div style="color:var(--text-muted);font-size:0.72rem;">等待数据...</div>';
  var html = '';

  // GPU VRAM
  if (d.gpu && d.gpu.available && d.gpu.gpus && d.gpu.gpus.length > 0) {
    d.gpu.gpus.forEach(function(g) {
      var pct = g.utilization_pct || 0;
      var barColor = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : 'var(--accent)';
      var usedMB = g.used_mb || g.allocated_mb || 0;
      html += '<div class="sysmon-row">'
        + '<div class="sysmon-label">' + _ico('cpu', 12) + ' VRAM' + (d.gpu.gpus.length > 1 ? ' #' + g.index : '') + '</div>'
        + '<div class="sysmon-bar-wrap">'
        +   '<div class="sysmon-bar" style="width:' + pct + '%;background:' + barColor + ';"></div>'
        + '</div>'
        + '<div class="sysmon-val">' + usedMB + ' / ' + g.total_mb + ' MB <span style="opacity:0.7;">(' + pct + '%)</span></div>'
        + '</div>';
      // GPU temperature + power (if available from nvidia-smi)
      var extraParts = [];
      if (g.temperature_c != null) extraParts.push(g.temperature_c + '°C');
      if (g.power_draw_w != null) extraParts.push(g.power_draw_w + 'W');
      if (extraParts.length > 0) {
        html += '<div class="sysmon-row sysmon-sub">'
          + '<div class="sysmon-label" style="padding-left:18px;">状态</div>'
          + '<div></div>'
          + '<div class="sysmon-val">' + extraParts.join(' · ') + '</div>'
          + '</div>';
      }
    });
  } else {
    html += '<div class="sysmon-row"><div class="sysmon-label">' + _ico('cpu', 12) + ' VRAM</div><div class="sysmon-val" style="color:var(--text-muted);">不可用</div></div>';
  }

  // CPU
  if (d.cpu && d.cpu.percent !== undefined) {
    var cpuPct = d.cpu.percent;
    var cpuColor = cpuPct > 90 ? '#ef4444' : cpuPct > 70 ? '#f59e0b' : '#3b82f6';
    html += '<div class="sysmon-row">'
      + '<div class="sysmon-label">' + _ico('activity', 12) + ' CPU</div>'
      + '<div class="sysmon-bar-wrap">'
      +   '<div class="sysmon-bar" style="width:' + cpuPct + '%;background:' + cpuColor + ';"></div>'
      + '</div>'
      + '<div class="sysmon-val">' + cpuPct + '%' + (d.cpu.count ? ' <span style="opacity:0.5;">(' + d.cpu.count + ' cores)</span>' : '') + '</div>'
      + '</div>';
  }

  // RAM
  if (d.ram && d.ram.total_mb) {
    var ramPct = d.ram.percent || 0;
    var ramColor = ramPct > 90 ? '#ef4444' : ramPct > 70 ? '#f59e0b' : '#8b5cf6';
    var ramUsedGB = (d.ram.used_mb / 1024).toFixed(1);
    var ramTotalGB = (d.ram.total_mb / 1024).toFixed(1);
    html += '<div class="sysmon-row">'
      + '<div class="sysmon-label">' + _ico('database', 12) + ' RAM</div>'
      + '<div class="sysmon-bar-wrap">'
      +   '<div class="sysmon-bar" style="width:' + ramPct + '%;background:' + ramColor + ';"></div>'
      + '</div>'
      + '<div class="sysmon-val">' + ramUsedGB + ' / ' + ramTotalGB + ' GB <span style="opacity:0.7;">(' + ramPct + '%)</span></div>'
      + '</div>';
  }

  return html;
}

/** Parse ANSI escape codes + keyword-based semantic coloring for log lines */
function _renderLogLines(lines) {
  var ANSI_COLORS = {
    '30': '#666', '31': '#ef4444', '32': '#22c55e', '33': '#f59e0b',
    '34': '#3b82f6', '35': '#a855f7', '36': '#06b6d4', '37': '#e0e6ed',
    '90': '#64748b', '91': '#ff6b6b', '92': '#4ade80', '93': '#fbbf24',
    '94': '#60a5fa', '95': '#c084fc', '96': '#22d3ee', '97': '#f8fafc',
  };
  return lines.map(function(line) {
    line = line.replace(/\r/g, '');
    var hasAnsi = line.indexOf('\x1b[') !== -1;

    // --- ANSI parsing (when real escape codes are present) ---
    if (hasAnsi) {
      var result = '', i = 0, openSpan = false;
      while (i < line.length) {
        if (line.charCodeAt(i) === 27 && line[i+1] === '[') {
          var j = i + 2;
          while (j < line.length && line[j] !== 'm') j++;
          if (j < line.length) {
            var codes = line.substring(i+2, j).split(';');
            if (openSpan) { result += '</span>'; openSpan = false; }
            for (var ci = 0; ci < codes.length; ci++) {
              var c = codes[ci];
              if (c === '0' || c === '') { /* reset */ }
              else if (c === '1') { result += '<span style="font-weight:700;">'; openSpan = true; }
              else if (ANSI_COLORS[c]) { result += '<span style="color:' + ANSI_COLORS[c] + ';">'; openSpan = true; }
            }
            i = j + 1; continue;
          }
        }
        var ch = line[i];
        if (ch === '<') result += '&lt;'; else if (ch === '>') result += '&gt;';
        else if (ch === '&') result += '&amp;'; else if (ch === '"') result += '&quot;';
        else result += ch;
        i++;
      }
      if (openSpan) result += '</span>';
      return '<div class="log-line">' + result + '</div>';
    }

    // --- Keyword-based semantic coloring (no ANSI codes in output) ---
    var safe = escapeHtml(line);
    var color = '';
    if (/\b(error|exception|traceback|failed|fatal|UnicodeDecodeError)\b/i.test(line)) color = '#ef4444';
    else if (/\b(warning|warn|deprecated)\b/i.test(line)) color = '#f59e0b';
    else if (/\b(saved|saving|checkpoint|completed|finished|done)\b/i.test(line)) color = '#22c55e';
    else if (/\bsteps?\b.*\bLoss\b|\bloss[=:]\s*/i.test(line)) color = '#06b6d4';
    else if (/epoch\s+\d|^\s*\d+%\|/i.test(line)) color = '#60a5fa';
    else if (/^(INFO|DEBUG)\b|\bINFO\b|\bDEBUG\b/i.test(line)) color = '#64748b';

    if (color) safe = '<span style="color:' + color + ';">' + safe + '</span>';
    return '<div class="log-line">' + safe + '</div>';
  }).join('');
}


/** Load all remaining thumbnails for a folder */
window.loadMoreThumbs = async function(idx, total) {
  var panel = document.getElementById('pf-thumbs-' + idx);
  if (!panel) return;
  var folder = panel.dataset.folder;
  if (!folder) return;
  try {
    var resp = await api.listDatasetImages(folder, total);
    var images = (resp && resp.data && resp.data.images) ? resp.data.images : [];
    panel.innerHTML = images.map(function(imgPath) {
      var src = '/api/image_resize/file?path=' + encodeURIComponent(imgPath);
      return '<div class="train-pf-thumb"><img src="' + src + '" loading="lazy"></div>';
    }).join('');
  } catch(e) {
    // silent
  }
};

window.refreshTrainingLog = async (taskId = '') => {
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
    const renderedLines = _mergeTrainingLogLines(lines, liveLine);
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
};

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

// ================================================================
// 快速训练流程 (Wizard)
// ================================================================
function renderWizard(container) {
  var c = state.config;
  // 参数预览
  var previewRows = [
    ['pretrained_model_name_or_path', 'SDXL 底模', c.pretrained_model_name_or_path],
    ['train_data_dir', '训练数据集', c.train_data_dir],
    ['output_name', '保存名称', c.output_name],
    ['network_module', '网络模块', c.network_module],
    ['network_dim', 'Rank', c.network_dim],
    ['network_alpha', 'Alpha', c.network_alpha],
    ['lycoris_algo', 'LyCORIS 算法', c.network_module === 'lycoris.kohya' ? c.lycoris_algo : ''],
    ['unet_lr', 'U-Net 学习率', c.unet_lr],
    ['optimizer_type', '优化器', c.optimizer_type],
    ['lr_scheduler', '调度器', c.lr_scheduler],
    ['max_train_epochs', '训练轮数', c.max_train_epochs],
    ['train_batch_size', '批量大小', c.train_batch_size],
    ['gradient_accumulation_steps', '梯度累加', c.gradient_accumulation_steps],
    ['enable_preview', '预览图', c.enable_preview ? '开启' : '关闭'],
    ['mixed_precision', '混合精度', c.mixed_precision],
  ];
  var previewHtml = '<table class="wizard-preview-table">';
  for (var i = 0; i < previewRows.length; i++) {
    var key = previewRows[i][0], label = previewRows[i][1], val = previewRows[i][2];
    if (val === '' || val === undefined || val === null) continue;
    var display = escapeHtml(String(val));
    previewHtml += '<tr class="wizard-preview-row" title="' + escapeHtml(key) + '">'
      + '<td class="wizard-preview-key">' + escapeHtml(label) + '</td>'
      + '<td class="wizard-preview-val">' + display + '</td>'
      + '</tr>';
  }
  previewHtml += '</table>';

  // 网络模块选项
  var netModOptions = ['networks.lora', 'lycoris.kohya', 'networks.dylora', 'networks.oft'];
  var netModSelect = netModOptions.map(function(m) {
    return '<option value="' + m + '"' + (c.network_module === m ? ' selected' : '') + '>' + escapeHtml(m) + '</option>';
  }).join('');

  // LyCORIS 算法选项
  var lycoAlgos = ['locon', 'loha', 'lokr', 'ia3', 'dylora', 'glora', 'diag-oft', 'boft'];
  var lycoSelect = lycoAlgos.map(function(a) {
    return '<option value="' + a + '"' + (c.lycoris_algo === a ? ' selected' : '') + '>' + a + '</option>';
  }).join('');
  var lycoVisible = c.network_module === 'lycoris.kohya' ? '' : 'display:none;';
  var lokrVisible = (c.network_module === 'lycoris.kohya' && c.lycoris_algo === 'lokr') ? '' : 'display:none;';

  // 优化器选项
  var optimizers = ['AdamW8bit', 'Prodigy', 'AdamW', 'Lion8bit', 'Lion', 'SGDNesterov8bit', 'DAdaptation', 'Adafactor'];
  var optSelect = optimizers.map(function(o) {
    return '<option value="' + o + '"' + (c.optimizer_type === o ? ' selected' : '') + '>' + o + '</option>';
  }).join('');

  // 学习率调度器选项
  var schedulers = ['cosine', 'cosine_with_restarts', 'polynomial', 'constant', 'constant_with_warmup', 'linear', 'adafactor'];
  var schSelect = schedulers.map(function(s) {
    return '<option value="' + s + '"' + (c.lr_scheduler === s ? ' selected' : '') + '>' + s + '</option>';
  }).join('');

  // 预览图开关
  var previewOn = !!c.enable_preview;
  var previewDisplay = previewOn ? '' : 'display:none;';

  // 速度优化开关生成器
  var boolSwitch = function(k, lbl, checked) {
    return '<label style="display:flex;align-items:center;gap:8px;margin:4px 0;cursor:pointer;">'
      + '<input type="checkbox"' + (checked ? ' checked' : '') + ' onchange="wizardSet(\'' + k + '\', this.checked)" />'
      + escapeHtml(lbl) + '</label>';
  };

  container.innerHTML = `
    <div class="form-container">
      <header class="section-title">
        <h2 style="font-size:1.5rem;">🚀 快速训练流程</h2>
        <p style="color:var(--text-muted);margin-top:4px;">目前仅供 SDXL LoRA 训练，记得先处理训练集</p>
      </header>

      <div class="wizard-layout">
        <div class="wizard-body">

          <!-- 1. 底模路径 -->
          <div class="wizard-field-group">
            <label class="wizard-field-label">① SDXL 底模路径</label>
            <div class="input-picker">
              <button class="picker-icon" type="button" onclick="pickPathForInput('wz-model', 'file')">
                <svg class="icon"><use href="#icon-folder"></use></svg>
              </button>
              <button class="picker-mode-icon-btn" type="button" title="内置文件选择器" onclick="openBuiltinPickerForInput('wz-model', 'file')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
              <input class="text-input" type="text" id="wz-model"
                value="${escapeHtml(c.pretrained_model_name_or_path || '')}"
                placeholder="选择 .safetensors 底模文件"
                oninput="wizardSet('pretrained_model_name_or_path', this.value)" />
            </div>
          </div>

          <!-- 2. 训练数据集路径 -->
          <div class="wizard-field-group">
            <label class="wizard-field-label">② 训练数据集路径</label>
            <div class="input-picker">
              <button class="picker-icon" type="button" onclick="pickPathForInput('wz-data', 'folder')">
                <svg class="icon"><use href="#icon-folder"></use></svg>
              </button>
              <button class="picker-mode-icon-btn" type="button" title="内置文件选择器" onclick="openBuiltinPickerForInput('wz-data', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
              <input class="text-input" type="text" id="wz-data"
                value="${escapeHtml(c.train_data_dir || '')}"
                placeholder="包含子文件夹的 train 目录"
                oninput="wizardSet('train_data_dir', this.value)" />
            </div>
          </div>

          <!-- 3. 保存名称 -->
          <div class="wizard-field-group">
            <label class="wizard-field-label">③ 保存名称</label>
            <input class="text-input" type="text" id="wz-name"
              value="${escapeHtml(c.output_name || '')}"
              placeholder="例如: my_lora"
              oninput="wizardSet('output_name', this.value); wizardSet('logging_dir', this.value ? './logs/' + this.value : '')" />
            <div class="wizard-field-hint">同时作为模型保存名称和日志目录名称</div>
          </div>

          <!-- 4. 网络选择 -->
          <div class="wizard-field-group">
            <label class="wizard-field-label">④ 网络设置</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;">
              <div>
                <label style="font-size:0.82rem;color:var(--text-muted);">网络模块</label>
                <select class="field-select" onchange="wizardSet('network_module', this.value); renderView('wizard')">${netModSelect}</select>
              </div>
              <div style="${lycoVisible}">
                <label style="font-size:0.82rem;color:var(--text-muted);">LyCORIS 算法</label>
                <select class="field-select" onchange="wizardSet('lycoris_algo', this.value); renderView('wizard')">${lycoSelect}</select>
              </div>
              <div>
                <label style="font-size:0.82rem;color:var(--text-muted);">网络维度 (Rank)</label>
                <input class="text-input" type="number" value="${c.network_dim || 32}" min="1" max="512" oninput="wizardSet('network_dim', this.value)" />
              </div>
              <div>
                <label style="font-size:0.82rem;color:var(--text-muted);">网络 Alpha</label>
                <input class="text-input" type="number" value="${c.network_alpha || 32}" min="1" max="512" oninput="wizardSet('network_alpha', this.value)" />
              </div>
              <div>
                <label style="font-size:0.82rem;color:var(--text-muted);">网络 Dropout</label>
                <input class="text-input" type="number" value="${c.network_dropout || 0}" min="0" max="1" step="0.01" oninput="wizardSet('network_dropout', this.value)" />
              </div>
              <div style="${lycoVisible}">
                <label style="font-size:0.82rem;color:var(--text-muted);">卷积维度</label>
                <input class="text-input" type="number" value="${c.conv_dim || 4}" min="1" oninput="wizardSet('conv_dim', this.value)" />
              </div>
              <div style="${lycoVisible}">
                <label style="font-size:0.82rem;color:var(--text-muted);">卷积 Alpha</label>
                <input class="text-input" type="number" value="${c.conv_alpha || 1}" min="1" oninput="wizardSet('conv_alpha', this.value)" />
              </div>
              <div style="${lycoVisible}">
                <label style="font-size:0.82rem;color:var(--text-muted);">LyCORIS Dropout</label>
                <input class="text-input" type="number" value="${c.dropout || 0}" min="0" max="1" step="0.01" oninput="wizardSet('dropout', this.value)" />
              </div>
              <div style="${lokrVisible}">
                <label style="font-size:0.82rem;color:var(--text-muted);">LoKr 系数</label>
                <input class="text-input" type="number" value="${c.lokr_factor === undefined ? -1 : c.lokr_factor}" min="-1" oninput="wizardSet('lokr_factor', this.value)" />
              </div>
            </div>
          </div>

          <!-- 5. 优化器 -->
          <div class="wizard-field-group">
            <label class="wizard-field-label">⑤ 优化器设置</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;">
              <div>
                <label style="font-size:0.82rem;color:var(--text-muted);">U-Net 学习率</label>
                <input class="text-input" type="text" value="${c.unet_lr || '1e-4'}" oninput="wizardSet('unet_lr', this.value)" />
              </div>
              <div>
                <label style="font-size:0.82rem;color:var(--text-muted);">调度器</label>
                <select class="field-select" onchange="wizardSet('lr_scheduler', this.value)">${schSelect}</select>
              </div>
              <div>
                <label style="font-size:0.82rem;color:var(--text-muted);">优化器</label>
                <select class="field-select" onchange="wizardSet('optimizer_type', this.value)">${optSelect}</select>
              </div>
            </div>
          </div>

          <!-- 6. 训练参数 -->
          <div class="wizard-field-group">
            <label class="wizard-field-label">⑥ 训练参数</label>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px 12px;">
              <div>
                <label style="font-size:0.82rem;color:var(--text-muted);">最大训练轮数</label>
                <input class="text-input" type="number" value="${c.max_train_epochs || 10}" min="1" oninput="wizardSet('max_train_epochs', this.value)" />
              </div>
              <div>
                <label style="font-size:0.82rem;color:var(--text-muted);">批量大小</label>
                <input class="text-input" type="number" value="${c.train_batch_size || 1}" min="1" max="32" oninput="wizardSet('train_batch_size', this.value)" />
              </div>
              <div>
                <label style="font-size:0.82rem;color:var(--text-muted);">梯度累加步数</label>
                <input class="text-input" type="number" value="${c.gradient_accumulation_steps || 1}" min="1" oninput="wizardSet('gradient_accumulation_steps', this.value)" />
              </div>
            </div>
          </div>

          <!-- 7. 预览图 -->
          <div class="wizard-field-group">
            <label class="wizard-field-label" style="display:flex;align-items:center;gap:10px;">
              ⑦ 预览图
              <label class="switch switch-compact" style="margin:0;"><input type="checkbox" ${previewOn ? 'checked' : ''} onchange="wizardSet('enable_preview', this.checked); renderView('wizard')" /><span class="slider round"></span></label>
            </label>
            <div id="wz-preview-fields" style="${previewDisplay}display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin-top:8px;">
              <div>
                <label style="font-size:0.82rem;color:var(--text-muted);">每 N 轮生成预览</label>
                <input class="text-input" type="number" value="${c.sample_every_n_epochs || ''}" min="1" placeholder="留空=每轮" oninput="wizardSet('sample_every_n_epochs', this.value)" />
              </div>
              <div style="grid-column:1/-1;">
                <label style="font-size:0.82rem;color:var(--text-muted);">正向提示词</label>
                <textarea class="field-input" rows="2" oninput="wizardSet('positive_prompts', this.value)" style="width:100%;">${escapeHtml(c.positive_prompts || 'masterpiece, best quality, 1girl, solo')}</textarea>
              </div>
              <div style="grid-column:1/-1;">
                <label style="font-size:0.82rem;color:var(--text-muted);">反向提示词</label>
                <textarea class="field-input" rows="2" oninput="wizardSet('negative_prompts', this.value)" style="width:100%;">${escapeHtml(c.negative_prompts || 'lowres, bad anatomy, bad hands, text, error')}</textarea>
              </div>
            </div>
          </div>

          <!-- 8. 速度优化 -->
          <div class="wizard-field-group">
            <label class="wizard-field-label">⑧ 速度优化</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;">
              ${boolSwitch('cache_text_encoder_outputs', '缓存文本编码器输出', !!c.cache_text_encoder_outputs)}
              ${boolSwitch('xformers', '启用 xformers', c.xformers !== false)}
              ${boolSwitch('sdpa', '启用 SDPA', c.sdpa !== false)}
              ${boolSwitch('sageattn', '启用 SageAttention', !!c.sageattn)}
              ${boolSwitch('flashattn', '启用 FlashAttention 2', !!c.flashattn)}
              ${boolSwitch('cross_attn_fused_kv', '启用 Fused K/V', !!c.cross_attn_fused_kv)}
            </div>
          </div>

          <!-- 开始训练 -->
          <div style="text-align:center;margin-top:28px;padding-top:20px;border-top:1px solid var(--border);">
            <button class="btn btn-primary" type="button" onclick="wizardStartTraining()" style="padding:12px 48px;font-size:1.05rem;">
              🚀 开始训练
            </button>
            <div style="font-size:0.8rem;color:var(--text-muted);margin-top:8px;">点击后将自动跳转到训练模块</div>
          </div>

        </div>

        <!-- 右侧参数预览 -->
        <aside class="wizard-preview">
          <div class="wizard-preview-title">📋 当前参数预览</div>
          <div class="wizard-preview-content" id="wz-preview">${previewHtml}</div>
        </aside>
      </div>
    </div>
  `;

  // 自动设置隐藏默认值
  _wizardApplyDefaults();
}

/* wizard: 设置参数并刷新预览 */
window.wizardSet = function(key, value) {
  updateConfigValue(key, value);
  // 刷新右侧预览
  var previewEl = document.getElementById('wz-preview');
  if (previewEl) {
    var c = state.config;
    var rows = [
      ['pretrained_model_name_or_path', 'SDXL 底模', c.pretrained_model_name_or_path],
      ['train_data_dir', '训练数据集', c.train_data_dir],
      ['output_name', '保存名称', c.output_name],
      ['network_module', '网络模块', c.network_module],
      ['network_dim', 'Rank', c.network_dim],
      ['network_alpha', 'Alpha', c.network_alpha],
      ['lycoris_algo', 'LyCORIS 算法', c.network_module === 'lycoris.kohya' ? c.lycoris_algo : ''],
      ['unet_lr', 'U-Net 学习率', c.unet_lr],
      ['optimizer_type', '优化器', c.optimizer_type],
      ['lr_scheduler', '调度器', c.lr_scheduler],
      ['max_train_epochs', '训练轮数', c.max_train_epochs],
      ['train_batch_size', '批量大小', c.train_batch_size],
      ['gradient_accumulation_steps', '梯度累加', c.gradient_accumulation_steps],
      ['enable_preview', '预览图', c.enable_preview ? '开启' : '关闭'],
      ['mixed_precision', '混合精度', c.mixed_precision],
    ];
    var html = '<table class="wizard-preview-table">';
    for (var i = 0; i < rows.length; i++) {
      var k = rows[i][0], lbl = rows[i][1], val = rows[i][2];
      if (val === '' || val === undefined || val === null) continue;
      html += '<tr class="wizard-preview-row" title="' + escapeHtml(k) + '">'
        + '<td class="wizard-preview-key">' + escapeHtml(lbl) + '</td>'
        + '<td class="wizard-preview-val">' + escapeHtml(String(val)) + '</td>'
        + '</tr>';
    }
    html += '</table>';
    previewEl.innerHTML = html;
  }
};

/* wizard: 自动设置隐藏默认值 */
function _wizardApplyDefaults() {
  var c = state.config;
  // 数据集默认参数
  if (c.max_bucket_reso === undefined || c.max_bucket_reso === '') updateConfigValue('max_bucket_reso', 1536);
  if (c.bucket_reso_steps === undefined || c.bucket_reso_steps === '') updateConfigValue('bucket_reso_steps', 64);
  if (!c.shuffle_caption) updateConfigValue('shuffle_caption', true);
  if (c.keep_tokens === undefined || c.keep_tokens === '') updateConfigValue('keep_tokens', 1);
  // 训练默认参数
  if (!c.gradient_checkpointing) updateConfigValue('gradient_checkpointing', true);
  if (!c.network_train_unet_only) updateConfigValue('network_train_unet_only', true);
  // 预览图默认参数
  if (!c.sample_at_first) updateConfigValue('sample_at_first', true);
  if (!c.sample_width || c.sample_width === 512) updateConfigValue('sample_width', 832);
  if (!c.sample_height || c.sample_height === 512) updateConfigValue('sample_height', 1216);
  if (!c.sample_cfg || c.sample_cfg === 7) updateConfigValue('sample_cfg', 5);
  if (!c.sample_seed) updateConfigValue('sample_seed', 2778);
  if (c.sample_sampler !== 'euler_a') updateConfigValue('sample_sampler', 'euler_a');
  // 缓存文本编码器默认关闭
  if (c.cache_text_encoder_outputs === undefined) updateConfigValue('cache_text_encoder_outputs', false);
}

/* wizard: 开始训练并跳转 */
window.wizardStartTraining = async function() {
  // 切换到训练模块
  state.activeModule = 'training';
  state.trainSubTab = 'monitor';
  document.querySelectorAll('.nav-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.module === 'training');
  });
  renderView('training');
  // 触发训练
  await executeTraining();
};



function renderGuide(container) {
  container.innerHTML = `
    <div class="form-container">
      <header class="section-title">
        <h2>简易教程</h2>
        <p>SDXL LoRA 训练入门指南（仅供参考，出自个人经验）</p>
      </header>

      <div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:20px;padding:12px 16px;background:var(--bg-hover);border-radius:8px;line-height:1.7;">
        相信使用这个丹炉的各位都对 LoRA 有一定了解了，这个简易教程不讲什么定义，只说参数和简单的解释。<br>
        其他参数我不多做说明，都是出自个人经验，仅供参考。我优先使用神童（Prodigy）优化器。<br>
        我们从训练模块从左往右开始说：
      </div>

      <section class="form-section" style="margin-bottom:24px;">
        <header class="section-header"><h3 style="font-size:1.3rem;">1. 模型</h3></header>
        <div class="section-content" style="display:block;line-height:1.8;">
          <h4 style="font-size:1.05rem;margin:16px 0 8px;color:var(--text-main);">训练用模型</h4>
          <p>选择最基础的底模即可，如 noob eps1.1、il0.1、cknb0.5 等，也可以选择微调没那么严重的混合版本（wai13 这种比较早的版本）。</p>
          <p>如果是 v 预测模型，需要开启 <strong>V 参数化</strong>。</p>

          <h4 style="font-size:1.05rem;margin:16px 0 8px;color:var(--text-main);">保存设置</h4>
          <p>主要改变「模型保存名称」「日志名称」即可，还有「每 N 轮保存」。</p>
          <p>这个看情况，我喜欢用 2 ep 一保存，因为我的参数训练出来体积不大可以这么干。</p>
        </div>
      </section>

      <section class="form-section" style="margin-bottom:24px;">
        <header class="section-header"><h3 style="font-size:1.3rem;">2. 数据集</h3></header>
        <div class="section-content" style="display:block;line-height:1.8;">
          <h4 style="font-size:1.05rem;margin:16px 0 8px;color:var(--text-main);">数据集设置</h4>
          <p>将训练集文件夹置于 <code>train</code> 内时，可以使用右侧的按钮直接检测到。</p>
          <p>需要按 <code>xxx--y_xxx</code> 的结构保存，<code>y</code> 是重复次数。如果不确定实际训练的图片数量，可以在设置训练集路径后看下方「训练」模块里的预检，里面会自动帮你计算好。</p>

          <h4 style="font-size:1.05rem;margin:16px 0 8px;color:var(--text-main);">正则化数据集路径</h4>
          <p>有很多教程了，这里说说我的经验：训练人物可以无脑开启，可以防止过拟合。</p>
          <p>画风的正则作用是尽量让画风都吸收进一个触发词里。</p>

          <h4 style="font-size:1.05rem;margin:16px 0 8px;color:var(--text-main);">分桶</h4>
          <p>最大分辨率 <strong>1536</strong>，划分单位 <strong>64</strong>，其他默认即可。</p>
          <p>记得处理你的训练集分辨率，不然你的图会被分桶切的七零八落。</p>

          <h4 style="font-size:1.05rem;margin:16px 0 8px;color:var(--text-main);">Caption 选项</h4>
          <p>没什么好说的，有触发词就打乱 + 保留 1 个标签，没有就无所谓。</p>
        </div>
      </section>

      <section class="form-section" style="margin-bottom:24px;">
        <header class="section-header"><h3 style="font-size:1.3rem;">3. 网络</h3></header>
        <div class="section-content" style="display:block;line-height:1.8;">
          <p>我是 LyCORIS 忠实用户，这里只讲 LyCORIS 3 个设置：</p>

          <div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin:12px 0;">
            <h4 style="font-size:1.05rem;margin:0 0 8px;color:var(--accent);">LoCoN</h4>
            <p>更全面的 LoRA，所以你可以当作lora来训练，用的参数也是差不多的，缺点是容易过拟合，可以开启 DoRA 减少这种情况，与 LoKr 不是很兼容。</p>
            <p style="margin-top:6px;">炼人物：<code>dim 16, alpha 1</code>　　画风：<code>dim 32, alpha 16</code></p>
            <p>LyCORIS Dropout 可以开 <code>0.1</code> 减少过拟合。</p>
          </div>

          <div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin:12px 0;">
            <h4 style="font-size:1.05rem;margin:0 0 8px;color:var(--accent);">LoKr</h4>
            <p>学习高手，训练慢些，推荐炼画风和概念。dim 拉到极大值（如 10000000）是为了直接触发 <strong>Full Matrix Mode</strong>（全矩阵模式），此时 LoKr 不再做低秩分解，而是学习完整的权重变化矩阵，表达能力最强。</p>
            <p style="margin-top:6px;"><code>dim 10000000, alpha 1（或者与dim相同，影响不大可以不用管）</code>　　<code>LoKr 系数(factor) 8</code></p>
          </div>

          <div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin:12px 0;">
            <h4 style="font-size:1.05rem;margin:0 0 8px;color:var(--accent);">LoHa</h4>
            <p>通用性强，显存要求大一点，也同样慢一点，推荐训练人物，可以多人炼进一个丹。dim设置其实就是正常lora的开平方版。</p>
            <p style="margin-top:6px;"><code>dim 4, alpha 1</code>　　可以酌情开启 DoRA，会更容易拟合。</p>
          </div>

          <h4 style="font-size:1.05rem;margin:16px 0 8px;color:var(--text-main);">其余参数</h4>
          <p><strong>最大范数正则化</strong>：使用时不能使用神童优化器，同时学习率需要提升，我这边要 <code>1e-3</code> 开始才行。</p>
        </div>
      </section>

      <section class="form-section" style="margin-bottom:24px;">
        <header class="section-header"><h3 style="font-size:1.3rem;">4. 优化器</h3></header>
        <div class="section-content" style="display:block;line-height:1.8;">
          <h4 style="font-size:1.05rem;margin:16px 0 8px;color:var(--text-main);">学习率与优化器</h4>
          <p>我就说一个优化器：<strong>Prodigy</strong>（神童）。</p>
          <p>调度器选 <code>constant</code>，其他学习率全部设置为 <code>1</code>。</p>
          <p>其他的优化器自己找教程捏，我只用 Adam 和神童。</p>
        </div>
      </section>

      <section class="form-section" style="margin-bottom:24px;">
        <header class="section-header"><h3 style="font-size:1.3rem;">5. 训练</h3></header>
        <div class="section-content" style="display:block;line-height:1.8;">
          <p>我是 4080S，16G 显存。bs 主要是为了训练速度，所以不用太在意。默认开着仅训练 U-Net，也不用管。我的lokr/locon的epoch设置比较保守，实际体验的话不用这么多ep</p>
          <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:0.9rem;">
            <thead><tr style="border-bottom:2px solid var(--border);text-align:left;">
              <th style="padding:8px 12px;">类型</th>
              <th style="padding:8px 12px;">Epoch</th>
              <th style="padding:8px 12px;">Batch Size</th>
              <th style="padding:8px 12px;">梯度累加</th>
            </tr></thead>
            <tbody>
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:8px 12px;">LoCoN / LoKr</td>
                <td style="padding:8px 12px;">30</td>
                <td style="padding:8px 12px;">3</td>
                <td style="padding:8px 12px;">3</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:8px 12px;">LoHa</td>
                <td style="padding:8px 12px;">18</td>
                <td style="padding:8px 12px;">3</td>
                <td style="padding:8px 12px;">2</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="form-section" style="margin-bottom:24px;">
        <header class="section-header"><h3 style="font-size:1.3rem;">6. 预览</h3></header>
        <div class="section-content" style="display:block;line-height:1.8;">
          <p>需要就开着，记得写触发词，但是跟实际使用情况还是有偏差的。</p>
        </div>
      </section>

      <section class="form-section" style="margin-bottom:24px;">
        <header class="section-header"><h3 style="font-size:1.3rem;">7. 加速</h3></header>
        <div class="section-content" style="display:block;line-height:1.8;">
          <p>备注都写好了，用什么环境开什么加速，其他设置我基本都没用。</p>
          <p>如果开启了随机打乱标签，记得关闭<strong>缓存文本编码器输出</strong>。</p>
        </div>
      </section>

      <section class="form-section" style="margin-bottom:24px;">
        <header class="section-header"><h3 style="font-size:1.3rem;">8. 高级</h3></header>
        <div class="section-content" style="display:block;line-height:1.8;">
          <p>自己看，一般来说我不用。</p>
        </div>
      </section>

      <section class="form-section" style="margin-bottom:24px;">
        <header class="section-header"><h3 style="font-size:1.3rem;">📋 总结</h3></header>
        <div class="section-content" style="display:block;line-height:1.8;">
          <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:0.9rem;">
            <thead><tr style="border-bottom:2px solid var(--border);text-align:left;">
              <th style="padding:8px 12px;">类型</th>
              <th style="padding:8px 12px;">适用</th>
              <th style="padding:8px 12px;">Dim</th>
              <th style="padding:8px 12px;">Alpha</th>
              <th style="padding:8px 12px;">Epoch</th>
              <th style="padding:8px 12px;">BS</th>
              <th style="padding:8px 12px;">梯度累加</th>
              <th style="padding:8px 12px;">备注</th>
            </tr></thead>
            <tbody>
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:8px 12px;font-weight:600;color:var(--accent);">LoCoN</td>
                <td style="padding:8px 12px;">人物 / 概念</td>
                <td style="padding:8px 12px;">人16 / 概念32</td>
                <td style="padding:8px 12px;">人1 / 概念16</td>
                <td style="padding:8px 12px;">30</td>
                <td style="padding:8px 12px;">3</td>
                <td style="padding:8px 12px;">3</td>
                <td style="padding:8px 12px;">可开 DoRA</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:8px 12px;font-weight:600;color:var(--accent);">LoKr</td>
                <td style="padding:8px 12px;">画风 / 概念</td>
                <td style="padding:8px 12px;">10000000</td>
                <td style="padding:8px 12px;">1 (或拉满)</td>
                <td style="padding:8px 12px;">30</td>
                <td style="padding:8px 12px;">3</td>
                <td style="padding:8px 12px;">3</td>
                <td style="padding:8px 12px;">factor 8</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:8px 12px;font-weight:600;color:var(--accent);">LoHa</td>
                <td style="padding:8px 12px;">人物</td>
                <td style="padding:8px 12px;">4</td>
                <td style="padding:8px 12px;">1</td>
                <td style="padding:8px 12px;">18</td>
                <td style="padding:8px 12px;">3</td>
                <td style="padding:8px 12px;">2</td>
                <td style="padding:8px 12px;">可开 DoRA</td>
              </tr>
            </tbody>
          </table>
          <p style="margin-top:12px;color:var(--text-muted);font-size:0.85rem;">以上参数均基于 Prodigy 优化器 + constant 调度器 + 学习率全 1 的配置。</p>
        </div>
      </section>

    </div>
  `;
}


// ═══════════════════════════════════════════════════════
// 插件中心
// ═══════════════════════════════════════════════════════

function renderPlugins(container) {
  container.innerHTML = '<div class="form-container">'
    + '<header class="section-title">'
    + '<h2>' + _ico('package', 20) + ' 插件中心</h2>'
    + '<p>管理后端插件运行时状态。插件系统仅支持新 UI。</p>'
    + '</header>'
    + '<div id="plugin-center-content" style="color:var(--text-muted);font-size:0.85rem;">'
    + _ico('loader', 14) + ' 加载插件信息...'
    + '</div>'
    + '</div>';
  _loadAndRenderPlugins();
}

async function _loadAndRenderPlugins() {
  var el = document.getElementById('plugin-center-content');
  if (!el) return;

  await loadPluginRuntime();

  if (pluginStore.error) {
    el.innerHTML = '<section class="form-section">'
      + '<div class="section-content" style="display:block;">'
      + '<div class="plugin-offline-banner">'
      + _ico('alert-tri', 16) + ' 插件服务不可用'
      + '<p style="margin:8px 0 0;font-size:0.78rem;color:var(--text-muted);">' + escapeHtml(pluginStore.error) + '</p>'
      + '<p style="margin:4px 0 0;font-size:0.72rem;color:var(--text-dim);">后端可能尚未启用插件系统，或接口未就绪。这不影响正常训练功能。</p>'
      + '</div>'
      + '</div></section>';
    return;
  }

  var rt = pluginStore.runtime;
  if (!rt) {
    el.innerHTML = '<section class="form-section"><div class="section-content" style="display:block;">'
      + '<p style="color:var(--text-muted);">未获取到插件运行时数据</p>'
      + '</div></section>';
    return;
  }

  var html = '';

  // ── 全局状态概览 ──
  var devMode = rt.developer_mode;
  var totalCount = rt.total_count || 0;
  var enabledCount = rt.enabled_count || 0;
  var loadedCount = rt.loaded_count || 0;

  html += '<section class="form-section">'
    + '<header class="section-header"><h3>' + _ico('activity', 16) + ' 运行时概览</h3></header>'
    + '<div class="section-content" style="display:block;">'
    + '<div class="plugin-stats-grid">'
    + _pluginStatCard('总插件数', totalCount, 'package')
    + _pluginStatCard('已启用', enabledCount, 'check-circle')
    + _pluginStatCard('已加载', loadedCount, 'zap')
    + _pluginStatCard('执行模式', rt.execution_mode || '—', 'shield')
    + '</div>'
    + '<div class="plugin-controls-row">'
    + '<label class="plugin-toggle-label">'
    + '<input type="checkbox" id="plugin-dev-mode-toggle" ' + (devMode ? 'checked' : '') + ' onchange="pluginToggleDevMode(this.checked)">'
    + ' 开发者模式'
    + '</label>'
    + '<button class="btn btn-outline btn-sm" type="button" onclick="pluginReloadAll()">' + _ico('refresh-cw', 12) + ' 重新加载全部</button>'
    + '<button class="btn btn-outline btn-sm" type="button" onclick="pluginShowAudit()">' + _ico('file', 12) + ' 审计日志</button>'
    + '</div>'
    + '<div style="font-size:0.7rem;color:var(--text-dim);margin-top:6px;">'
    + '插件根目录: ' + escapeHtml(rt.plugin_root || '—')
    + '</div>'
    + '</div></section>';

  // ── 插件列表 ──
  var plugins = rt.plugins || [];
  html += '<section class="form-section">'
    + '<header class="section-header"><h3>' + _ico('package', 16) + ' 插件列表 (' + plugins.length + ')</h3></header>'
    + '<div class="section-content" style="display:block;">';

  if (plugins.length === 0) {
    html += '<p style="color:var(--text-muted);padding:12px 0;">暂无已安装的插件</p>';
  } else {
    html += '<div class="plugin-list">';
    for (var i = 0; i < plugins.length; i++) {
      var p = plugins[i];
      html += _renderPluginCard(p);
    }
    html += '</div>';
  }

  html += '</div></section>';

  // ── Slot 注册表 ──
  var slots = getRegisteredSlots();
  html += '<section class="form-section">'
    + '<header class="section-header"><h3>' + _ico('layout', 16) + ' UI 扩展挂载点</h3></header>'
    + '<div class="section-content" style="display:block;">'
    + '<div class="plugin-slot-list">';
  for (var s = 0; s < slots.length; s++) {
    var sl = slots[s];
    html += '<div class="plugin-slot-item">'
      + '<code>' + escapeHtml(sl.id) + '</code>'
      + '<span class="plugin-slot-label">' + escapeHtml(sl.label) + '</span>'
      + '<span class="plugin-slot-count">' + sl.contributionCount + ' 个贡献</span>'
      + '</div>';
  }
  html += '</div></div></section>';

  // ── 审计日志面板（默认隐藏）──
  html += '<div id="plugin-audit-panel" style="display:none;"></div>';

  el.innerHTML = html;
}

function _pluginStatCard(label, value, icon) {
  return '<div class="plugin-stat-card">'
    + '<div class="plugin-stat-icon">' + _ico(icon, 16) + '</div>'
    + '<div class="plugin-stat-info">'
    + '<div class="plugin-stat-value">' + escapeHtml(String(value)) + '</div>'
    + '<div class="plugin-stat-label">' + escapeHtml(label) + '</div>'
    + '</div></div>';
}

function _pluginOnClickArg(value) {
  return escapeHtml(JSON.stringify(String(value ?? '')));
}

function _pluginReasonLabel(reason) {
  var mapping = {
    unsigned: '未签名',
    missing_declared_hash: '缺少声明哈希',
    declared_hash_mismatch: '签名哈希不匹配',
    ed25519_verifier_unavailable: '签名校验器不可用',
    unsupported_signature_scheme: '不支持的签名方案',
    no_approval_record: '没有审批记录',
    capability_not_approved: '能力未审批',
    hash_denied: '插件哈希已被拒绝',
    signer_revoked: '签名者已撤销',
    allowlist_match: '已通过社区核验',
    allowlist_miss: '未通过社区核验',
    not_required: '无需核验',
  };
  return mapping[String(reason || '').trim()] || String(reason || '').trim();
}

function _formatPluginHook(hook) {
  if (typeof hook === 'string') return hook;
  if (!hook || typeof hook !== 'object') return '';

  var eventName = String(hook.event || hook.name || hook.id || '').trim();
  var handlerName = String(hook.handler || '').trim();
  var trainingTypes = Array.isArray(hook.training_types)
    ? hook.training_types.map(function(item) { return String(item || '').trim(); }).filter(Boolean)
    : [];
  var details = [];

  if (handlerName) details.push(handlerName);
  if (trainingTypes.length > 0) details.push(trainingTypes.join('/'));
  if (hook.mutable === true || hook.runtime_mutable === true) details.push('mutable');

  if (!eventName) {
    if (details.length > 0) return details.join(' · ');
    try {
      return JSON.stringify(hook);
    } catch (err) {
      return String(hook);
    }
  }

  return eventName + (details.length > 0 ? ' · ' + details.join(' · ') : '');
}

function _collectPluginTrustTags(p) {
  var policy = (p && p.policy && typeof p.policy === 'object') ? p.policy : {};
  var signature = (p && p.signature && typeof p.signature === 'object') ? p.signature : {};
  var approval = (p && p.approval && typeof p.approval === 'object') ? p.approval : {};
  var trust = (p && p.trust && typeof p.trust === 'object') ? p.trust : {};
  var tags = [];

  var signatureScheme = String(signature.scheme || '').trim().toLowerCase();
  var signatureSigner = String(signature.signer || '').trim();
  if (signature.ok === true && signatureScheme && signatureScheme !== 'none') {
    tags.push(_ico('shield', 10) + ' 签名通过' + (signatureSigner ? ' · ' + escapeHtml(signatureSigner) : ''));
  } else if (signature.ok === false) {
    tags.push(_ico('shield', 10) + ' 签名异常' + (signature.reason ? ' · ' + escapeHtml(_pluginReasonLabel(signature.reason)) : ''));
  } else if (policy.requires_trust_verification) {
    tags.push(_ico('shield', 10) + ' 未签名');
  }

  var approvalRecord = approval.record && typeof approval.record === 'object' ? approval.record : null;
  var approvalGranted = approval.approved === true || policy.approved === true || approvalRecord !== null;
  if (policy.requires_user_approval || approvalGranted || approval.reason) {
    if (approvalGranted) {
      tags.push(_ico('check-circle', 10) + ' 已审批');
    } else {
      tags.push(_ico('alert-tri', 10) + ' 待审批' + (approval.reason ? ' · ' + escapeHtml(_pluginReasonLabel(approval.reason)) : ''));
    }
  }

  if (policy.requires_trust_verification || trust.ok === false || trust.matched_allowlist) {
    if (trust.ok === true || policy.trust_ok === true) {
      tags.push(_ico('shield', 10) + ' 社区核验通过');
    } else {
      tags.push(_ico('alert-tri', 10) + ' 社区核验未通过' + (trust.reason ? ' · ' + escapeHtml(_pluginReasonLabel(trust.reason)) : ''));
    }
  }

  return tags;
}

function _formatPluginAuditDetail(entry) {
  if (!entry || typeof entry !== 'object') return '';
  var payload = entry.payload && typeof entry.payload === 'object' ? entry.payload : null;
  var parts = [];
  var pluginId = String(entry.plugin_id || '').trim();

  if (pluginId) parts.push(pluginId);
  if (!payload) return parts.join(' — ');

  var payloadMessage = '';
  if (typeof payload.message === 'string' && payload.message.trim()) {
    payloadMessage = payload.message.trim();
  } else if (typeof payload.reason === 'string' && payload.reason.trim()) {
    payloadMessage = _pluginReasonLabel(payload.reason);
  } else if (typeof payload.error === 'string' && payload.error.trim()) {
    payloadMessage = payload.error.trim();
  } else if (Array.isArray(payload.missing_capabilities) && payload.missing_capabilities.length > 0) {
    payloadMessage = '缺少能力: ' + payload.missing_capabilities.join(', ');
  } else if (Array.isArray(payload.capabilities) && payload.capabilities.length > 0) {
    payloadMessage = '能力: ' + payload.capabilities.join(', ');
  } else {
    try {
      var serialized = JSON.stringify(payload);
      if (serialized && serialized !== '{}') payloadMessage = serialized;
    } catch (err) {
      payloadMessage = String(payload);
    }
  }

  if (payloadMessage) parts.push(payloadMessage);
  return parts.join(' — ');
}

function _renderPluginCard(p) {
  var statusColor = p.loaded ? '#22c55e' : (p.load_error ? '#ef4444' : 'var(--text-muted)');
  var statusText = p.loaded ? '已加载' : (p.load_error ? '加载失败' : '未加载');
  var statusDot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + statusColor + ';"></span>';
  var policy = (p && p.policy && typeof p.policy === 'object') ? p.policy : {};
  var approval = (p && p.approval && typeof p.approval === 'object') ? p.approval : {};
  var requiresApproval = policy.requires_user_approval === true;
  var approvalRecord = approval.record && typeof approval.record === 'object' ? approval.record : null;
  var approvalGranted = approval.approved === true || policy.approved === true || approvalRecord !== null;
  var canApprove = requiresApproval && !approvalGranted;
  var canRevoke = approvalGranted;
  var actionPluginId = _pluginOnClickArg(p.plugin_id);

  var tierBadge = '';
  if (p.tier != null) {
    var tierColors = { 0: '#22c55e', 1: '#3b82f6', 2: '#f59e0b', 3: '#ef4444' };
    tierBadge = '<span class="plugin-tier-badge" style="background:' + (tierColors[p.tier] || 'var(--text-muted)') + ';">Tier ' + p.tier + '</span>';
  }

  var html = '<div class="plugin-card">'
    + '<div class="plugin-card-header">'
    + '<div class="plugin-card-title">'
    + statusDot + ' '
    + '<strong>' + escapeHtml(p.name || p.plugin_id) + '</strong>'
    + (p.version ? ' <span class="plugin-version">v' + escapeHtml(p.version) + '</span>' : '')
    + tierBadge
    + '</div>'
    + '<div class="plugin-card-actions">';

  if (canApprove) {
    html += '<button class="btn btn-sm" style="background:#22c55e;color:#fff;font-size:0.7rem;padding:2px 8px;" type="button" onclick="pluginApprove(' + actionPluginId + ')">审批</button>';
  }
  if (canRevoke) {
    html += '<button class="btn btn-outline btn-sm" style="font-size:0.7rem;padding:2px 8px;" type="button" onclick="pluginRevoke(' + actionPluginId + ')">撤销审批</button>';
  }

  html += '</div></div>';

  // 描述
  if (p.description) {
    html += '<div class="plugin-card-desc">' + escapeHtml(p.description) + '</div>';
  }

  // 详情
  html += '<div class="plugin-card-meta">';
  html += '<span>ID: <code>' + escapeHtml(p.plugin_id) + '</code></span>';
  html += '<span>状态: <span style="color:' + statusColor + ';font-weight:600;">' + statusText + '</span></span>';
  if (p.enabled != null) html += '<span>' + (p.enabled ? '✓ 已启用' : '✗ 已禁用') + '</span>';
  if (p.execution_allowed != null) html += '<span>' + (p.execution_allowed ? '✓ 已授权执行' : '✗ 未授权') + '</span>';
  html += '</div>';

  // 加载错误
  if (p.load_error) {
    html += '<div class="plugin-card-error">' + _ico('x-circle', 12) + ' ' + escapeHtml(p.load_error) + '</div>';
  }

  // Capabilities
  if (p.capabilities && p.capabilities.length > 0) {
    html += '<div class="plugin-card-tags"><span class="plugin-tag-label">能力:</span>';
    for (var c = 0; c < p.capabilities.length; c++) {
      html += '<span class="plugin-tag">' + escapeHtml(p.capabilities[c]) + '</span>';
    }
    html += '</div>';
  }

  // Hooks
  var hooks = Array.isArray(p.registered_hooks) && p.registered_hooks.length > 0
    ? p.registered_hooks
    : (Array.isArray(p.hooks) ? p.hooks : []);
  if (hooks.length > 0) {
    html += '<div class="plugin-card-tags"><span class="plugin-tag-label">钩子:</span>';
    for (var h = 0; h < hooks.length; h++) {
      var hookLabel = _formatPluginHook(hooks[h]);
      if (!hookLabel) continue;
      html += '<span class="plugin-tag plugin-tag-hook">' + escapeHtml(hookLabel) + '</span>';
    }
    html += '</div>';
  }

  // Trust / Approval
  var trustTags = _collectPluginTrustTags(p);
  if (trustTags.length > 0) {
    html += '<div class="plugin-card-tags"><span class="plugin-tag-label">信任:</span>';
    for (var tIndex = 0; tIndex < trustTags.length; tIndex++) {
      html += '<span class="plugin-tag">' + trustTags[tIndex] + '</span>';
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ── 插件操作（全局函数）──

window.pluginToggleDevMode = async function(enabled) {
  var result = await toggleDeveloperMode(enabled);
  if (result.ok) {
    showToast('✓ 开发者模式已' + (enabled ? '开启' : '关闭'));
  } else {
    showToast('⚠ 操作失败: ' + (result.error || '未知错误'));
  }
  _loadAndRenderPlugins();
};

window.pluginReloadAll = async function() {
  showToast(_ico('loader', 12) + ' 正在重新加载插件...');
  var result = await reloadAllPlugins();
  if (result.ok) {
    showToast('✓ 插件已重新加载');
  } else {
    showToast('⚠ 重新加载失败: ' + (result.error || '未知错误'));
  }
  _loadAndRenderPlugins();
};

window.pluginApprove = async function(pluginId) {
  var result = await approvePlugin(pluginId);
  if (result.ok) {
    showToast('✓ 插件 ' + pluginId + ' 已审批');
  } else {
    showToast('⚠ 审批失败: ' + (result.error || '未知错误'));
  }
  _loadAndRenderPlugins();
};

window.pluginRevoke = async function(pluginId) {
  if (!confirm('确定要撤销插件 "' + pluginId + '" 的审批？')) return;
  var result = await revokePlugin(pluginId);
  if (result.ok) {
    showToast('✓ 已撤销插件 ' + pluginId + ' 的审批');
  } else {
    showToast('⚠ 撤销失败: ' + (result.error || '未知错误'));
  }
  _loadAndRenderPlugins();
};

window.pluginShowAudit = async function() {
  var panel = document.getElementById('plugin-audit-panel');
  if (!panel) return;
  if (panel.style.display !== 'none') {
    panel.style.display = 'none';
    return;
  }
  panel.innerHTML = '<section class="form-section"><div class="section-content" style="display:block;">'
    + _ico('loader', 14) + ' 加载审计日志...</div></section>';
  panel.style.display = 'block';

  await loadPluginAudit(50);
  var audit = pluginStore.audit;
  var html = '<section class="form-section">'
    + '<header class="section-header"><h3>' + _ico('file', 16) + ' 审计日志（最近 50 条）</h3></header>'
    + '<div class="section-content" style="display:block;">';

  var entries = (audit && audit.entries) || audit || [];
  if (audit && Array.isArray(audit.events)) entries = audit.events;
  if (!Array.isArray(entries)) entries = [];

  if (entries.length === 0) {
    html += '<p style="color:var(--text-muted);">暂无审计记录</p>';
  } else {
    html += '<div class="plugin-audit-list">';
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var auditTime = String(e.ts || e.timestamp || e.time || '').trim();
      var auditAction = String(e.event_type || e.action || e.event || '').trim();
      if (e.level && e.level !== 'info') {
        auditAction += auditAction ? ' · ' + String(e.level) : String(e.level);
      }
      var auditDetail = _formatPluginAuditDetail(e);
      html += '<div class="plugin-audit-item">'
        + '<span class="plugin-audit-time">' + escapeHtml(auditTime) + '</span>'
        + '<span class="plugin-audit-action">' + escapeHtml(auditAction) + '</span>'
        + '<span class="plugin-audit-detail">' + escapeHtml(auditDetail) + '</span>'
        + '</div>';
    }
    html += '</div>';
  }

  html += '</div></section>';
  panel.innerHTML = html;
};


function renderAbout(container) {
  container.innerHTML = `
    <div class="form-container">
      <header class="section-title">
        <h2>关于</h2>
      </header>
      <section class="form-section">
        <div class="section-content" style="display:block;">
          <p style="margin-bottom:16px;">SD-reScripts v2.0.0</p>
          <p style="margin-bottom:16px;">由 <a href="https://github.com/Akegarasu/lora-scripts" target="_blank" rel="noopener" style="color:var(--accent);">schemastery</a> 强力驱动</p>
          <h3 style="margin:24px 0 8px;font-size:1.1rem;">下载地址</h3>
          <p>GitHub 地址：<a href="https://github.com/WhitecrowAurora/lora-rescripts" target="_blank" rel="noopener" style="color:var(--accent);">https://github.com/WhitecrowAurora/lora-rescripts</a></p>
          <h3 style="margin:24px 0 8px;font-size:1.1rem;">本前端反馈</h3>
          <p>GitHub 地址：<a href="https://github.com/LichiTI/lora-scripts-ui" target="_blank" rel="noopener" style="color:var(--accent);">https://github.com/LichiTI/lora-scripts-ui</a></p>
        </div>
      </section>
    </div>
  `;
}


function renderSettings(container) {
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

  $('#theme-select')?.addEventListener('change', (e) => { state.theme = e.target.value; localStorage.setItem('theme', state.theme); applyTheme(); });
  $('#rounded-ui-toggle')?.addEventListener('change', (e) => {
    state.roundedUI = e.target.checked; localStorage.setItem('roundedUI', state.roundedUI); applyTheme();
  });
  $('#vertical-tabs-toggle')?.addEventListener('change', (e) => {
    state.verticalTabs = e.target.checked; localStorage.setItem('verticalTabs', state.verticalTabs); applyTheme();
  });
  $('#navigator-width-slider')?.addEventListener('input', (e) => updateLayoutWidth('navigator', e.target.value, false));
  $('#navigator-width-slider')?.addEventListener('change', (e) => updateLayoutWidth('navigator', e.target.value, true));
  $('#json-width-slider')?.addEventListener('input', (e) => updateLayoutWidth('json', e.target.value, false));
  $('#json-width-slider')?.addEventListener('change', (e) => updateLayoutWidth('json', e.target.value, true));
  $('#reset-layout-btn')?.addEventListener('click', () => {
    state.navigatorWidth = state.layoutDefaults.navigatorWidth;
    state.jsonPanelWidth = state.layoutDefaults.jsonPanelWidth;
    applyAndPersistLayout();
    renderView('settings');
  });
  $('#save-ui-settings-btn')?.addEventListener('click', () => {
    localStorage.setItem('sd-rescripts:tensorboard-url', $('#settings-tb-url')?.value?.trim() || '');
    const checkedOpts = [...$$('#settings-optimizers input:checked')].map((i) => i.value);
    localStorage.setItem('sd-rescripts:visible-optimizers', JSON.stringify(checkedOpts));
    const checkedScheds = [...$$('#settings-schedulers input:checked')].map((i) => i.value);
    localStorage.setItem('sd-rescripts:visible-schedulers', JSON.stringify(checkedScheds));
    showToast('训练 UI 设置已保存。');
  });
  $('#switch-legacy-ui-btn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '切换中...';
    try {
      await api.activateUiProfile(BUILTIN_LEGACY_UI_PROFILE_ID);
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



function renderDataset(container) {
  const activeTab = state.datasetSubTab || 'tagger';
  container.innerHTML = `
    <div class="form-container">
      <header class="section-title">
        <h2>数据集处理</h2>
        <p>图片标注、标签编辑、图像预处理、数据集分析与 Caption 清洗。</p>
      </header>
      <div class="dataset-tabs">
        <button class="dataset-tab ${activeTab === 'tagger' ? 'active' : ''}" type="button" onclick="switchDatasetTab('tagger')">标签器</button>
        <button class="dataset-tab ${activeTab === 'editor' ? 'active' : ''}" type="button" onclick="switchDatasetTab('editor')">标签编辑器</button>
        <button class="dataset-tab ${activeTab === 'resize' ? 'active' : ''}" type="button" onclick="switchDatasetTab('resize')">图像预处理</button>
        <button class="dataset-tab ${activeTab === 'analysis' ? 'active' : ''}" type="button" onclick="switchDatasetTab('analysis')">数据集分析</button>
        <button class="dataset-tab ${activeTab === 'cleanup' ? 'active' : ''}" type="button" onclick="switchDatasetTab('cleanup')">Caption 清洗</button>
        <button class="dataset-tab ${activeTab === 'backups' ? 'active' : ''}" type="button" onclick="switchDatasetTab('backups')">Caption 备份</button>
        <button class="dataset-tab ${activeTab === 'maskedloss' ? 'active' : ''}" type="button" onclick="switchDatasetTab('maskedloss')">蒙版损失审查</button>
      </div>
      <div id="dataset-content"></div>
    </div>
  `;
  const renderers = {
    tagger: renderTagger,
    editor: renderTagEditor,
    resize: renderImageResize,
    analysis: renderDatasetAnalysis,
    cleanup: renderCaptionCleanup,
    backups: renderCaptionBackups,
    maskedloss: renderMaskedLossAudit,
  };
  (renderers[activeTab] || renderTagger)();
}

window.switchDatasetTab = (tab) => {
  state.datasetSubTab = tab;
  if (state.activeModule === 'dataset') renderView('dataset');
};


function renderTagger() {
  const content = $('#dataset-content');
  if (!content) return;

  const allInterrogators = state.interrogators?.interrogators || [];
  const defaultModel = 'wd-eva02-large-tagger-v3';
  const wdModels = allInterrogators.filter((m) => m.kind === 'wd' || m.kind === 'cl');
  const llmModels = allInterrogators.filter((m) => m.kind === 'llm');
  const fallbackModels = [
    'wd-convnext-v3', 'wd-swinv2-v3', 'wd-vit-v3',
    'wd14-convnextv2-v2', 'wd14-swinv2-v2', 'wd14-vit-v2', 'wd14-moat-v2',
    'wd-eva02-large-tagger-v3', 'wd-vit-large-tagger-v3',
    'eva02_large_E621_FULL_V1', 'cl_tagger_1_01',
  ];
  const models = wdModels.length > 0 ? wdModels.map((m) => m.name) : fallbackModels;
  const conflicts = ['ignore', 'copy', 'prepend', 'append'];
  const conflictLabels = { ignore: '跳过已有', copy: '覆盖', prepend: '前置追加', append: '后置追加' };
  const presets = state.interrogators?.llm_template_presets || [
    { id: 'anime-tags', label: '动漫标签 / Anime Tags' },
    { id: 'natural-caption', label: '自然语言描述 / Natural Caption' },
  ];

  content.innerHTML = `
    <!-- WD14 / CL 标签器 -->
    <section class="form-section">
      <header class="section-header"><h3>WD14 / CL 标签器</h3></header>
      <div class="section-summary">对训练数据集进行自动标注，为每张图片生成 .txt 标签文件。使用本地 ONNX 模型运行，无需网络。</div>
      <div class="section-content tool-fields">
        <div class="config-group" style="grid-column:1/-1;">
          <label>数据集路径</label>
          <div class="input-picker">
            <button class="picker-icon" type="button" onclick="pickPathForInput('tagger-path', 'folder')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('tagger-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
            <input class="text-input" type="text" id="tagger-path" placeholder="./train/your_dataset">
          </div>
        </div>
        <div class="config-group">
          <label>标注模型</label>
          <select id="tagger-model">
            ${models.map((m) => `<option value="${m}" ${m === defaultModel ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="config-group">
          <label>置信度阈值</label>
          <p class="field-desc">模型对标签的最低置信度，低于此值的标签不会写入，简单来说，数值越低打出的标越多。一般推荐 0.5，调低可获得更多标签但可能不准。</p>
          <input class="text-input" type="number" id="tagger-threshold" value="0.5" min="0" max="1" step="0.01">
        </div>
        <div class="config-group">
          <label>冲突处理</label>
          <select id="tagger-conflict">
            ${conflicts.map((c) => `<option value="${c}" ${c === 'ignore' ? 'selected' : ''}>${conflictLabels[c]}</option>`).join('')}
          </select>
        </div>
        <div class="config-group">
          <label>额外追加标签</label>
          <input class="text-input" type="text" id="tagger-additional" placeholder="tag1, tag2">
        </div>
        <div class="config-group">
          <label>排除标签</label>
          <input class="text-input" type="text" id="tagger-exclude" placeholder="tag_to_remove">
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>递归扫描子目录</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="tagger-recursive" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>替换下划线为空格</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="tagger-underscore" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>转义括号</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="tagger-escape" checked><span class="slider round"></span></label>
        </div>
      </div>
      <div class="tool-actions">
        <button class="btn btn-primary btn-sm" type="button" id="btn-run-tagger" onclick="runTagger()">开始标注</button>
        <span id="tagger-status-hint" style="margin-left:12px;font-size:0.85rem;color:var(--text-dim);"></span>
      </div>
    </section>

    <!-- LLM 标签器 -->
    <section class="form-section">
      <header class="section-header"><h3>LLM 标签器（大语言模型）</h3></header>
      <div class="section-summary">使用 OpenAI / Claude / 自定义 API 的视觉语言模型对图片进行标注。需要填写 API Key，会消耗 API 额度。</div>
      <div class="section-content tool-fields">
        <div class="config-group" style="grid-column:1/-1;">
          <label>数据集路径</label>
          <div class="input-picker">
            <button class="picker-icon" type="button" onclick="pickPathForInput('llm-tagger-path', 'folder')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('llm-tagger-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
            <input class="text-input" type="text" id="llm-tagger-path" placeholder="./train/your_dataset">
          </div>
        </div>
        <div class="config-group">
          <label>LLM 提供商</label>
          <select id="llm-provider">
            ${llmModels.length > 0
              ? llmModels.map((m) => `<option value="${m.name}">${m.name}</option>`).join('')
              : '<option value="llm-openai">llm-openai</option><option value="llm-claude">llm-claude</option><option value="llm-custom">llm-custom</option>'
            }
          </select>
        </div>
        <div class="config-group">
          <label>API Key</label>
          <input class="text-input" type="password" id="llm-api-key" placeholder="sk-...">
        </div>
        <div class="config-group">
          <label>模型名称</label>
          <input class="text-input" type="text" id="llm-model" placeholder="gpt-4o-mini / claude-sonnet-4-20250514">
        </div>
        <div class="config-group">
          <label>API 地址</label>
          <p class="field-desc">自定义提供商时必填，OpenAI/Claude 可留空用默认。</p>
          <input class="text-input" type="text" id="llm-api-base" placeholder="https://api.openai.com/v1">
        </div>
        <div class="config-group">
          <label>模板预设</label>
          <select id="llm-preset">
            ${presets.map((p) => `<option value="${p.id}">${escapeHtml(p.label || p.id)}</option>`).join('')}
          </select>
        </div>
        <div class="config-group">
          <label>冲突处理</label>
          <select id="llm-conflict">
            ${conflicts.map((c) => `<option value="${c}" ${c === 'ignore' ? 'selected' : ''}>${conflictLabels[c]}</option>`).join('')}
          </select>
        </div>
        <div class="config-group">
          <label>Temperature</label>
          <input class="text-input" type="number" id="llm-temperature" value="0.2" min="0" max="2" step="0.1">
        </div>
        <div class="config-group">
          <label>最大 Tokens</label>
          <input class="text-input" type="number" id="llm-max-tokens" value="300" min="1" max="8192">
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>递归扫描子目录</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="llm-recursive"><span class="slider round"></span></label>
        </div>
      </div>
      <div class="tool-actions">
        <button class="btn btn-primary btn-sm" type="button" id="btn-run-llm-tagger" onclick="runLlmTagger()">LLM 开始标注</button>
        <span id="llm-tagger-status-hint" style="margin-left:12px;font-size:0.85rem;color:var(--text-dim);"></span>
      </div>
    </section>
  `;
}

// ── 打标器提交辅助：按钮 loading + 状态提示 ──
function setTaggerButtonLoading(btnId, hintId, loading) {
  const btn = $('#' + btnId);
  const hint = $('#' + hintId);
  if (btn) {
    btn.disabled = loading;
    if (loading) {
      btn.dataset.origText = btn.textContent;
      btn.innerHTML = _ico('loader') + ' 提交中...';
    } else {
      btn.textContent = btn.dataset.origText || '开始标注';
    }
  }
  if (hint) {
    if (loading) {
      hint.innerHTML = '';
    }
  }
}

function showTaggerRunningHint(hintId, message) {
  const hint = $('#' + hintId);
  if (hint) {
    hint.innerHTML = '<span style="color:#f59e0b;">' + _ico('loader') + ' ' + message + '</span>';
  }
}

function showTaggerDoneHint(hintId, message) {
  const hint = $('#' + hintId);
  if (hint) {
    hint.innerHTML = '<span style="color:#22c55e;">' + _ico('check-circle') + ' ' + message + '</span>';
    setTimeout(() => { if (hint) hint.innerHTML = ''; }, 15000);
  }
}

function showTaggerErrorHint(hintId, message) {
  const hint = $('#' + hintId);
  if (hint) {
    hint.innerHTML = '<span style="color:#ef4444;">' + _ico('x-circle') + ' ' + message + '</span>';
  }
}

let _taggerPollTimer = null;
function _pollTaggerProgress(hintId) {
  if (_taggerPollTimer) clearInterval(_taggerPollTimer);
  let _imageCount = '';
  _taggerPollTimer = setInterval(async () => {
    try {
      const tasksResp = await api.getTasks();
      const tasks = tasksResp?.data?.tasks || [];
      const running = tasks.filter(t => t.status === 'RUNNING');
      if (running.length === 0) {
        clearInterval(_taggerPollTimer);
        _taggerPollTimer = null;
        const doneMsg = '标注完成' + (_imageCount ? ` (${_imageCount})` : '') + '！标签文件已生成。';
        showTaggerDoneHint(hintId, doneMsg);
        showToast('✓ ' + doneMsg);
        return;
      }
      const taskId = running[0].id || running[0].task_id;
      if (taskId) {
        const outResp = await api.getTaskOutput(taskId, 30);
        const lines = outResp?.data?.lines || [];
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i];
          const imgMatch = line.match(/[Ff]ound\s+(\d+)\s+image/i);
          if (imgMatch) {
            _imageCount = imgMatch[1] + ' 张图片';
            const hint = document.getElementById(hintId);
            if (hint) {
              hint.innerHTML = '<span style="color:#f59e0b;">' + _ico('loader') + ' 标注中... 检测到 ' + _imageCount + '</span>';
            }
            break;
          }
          if (/all\s*done|识别完成|Unloaded/i.test(line)) {
            clearInterval(_taggerPollTimer);
            _taggerPollTimer = null;
            const doneMsg = '标注完成' + (_imageCount ? ` (${_imageCount})` : '') + '！标签文件已生成。';
            showTaggerDoneHint(hintId, doneMsg);
            showToast('✓ ' + doneMsg);
            return;
          }
        }
      }
    } catch (e) { /* 静默 */ }
  }, 3000);
}


window.runLlmTagger = async () => {
  const pathVal = $('#llm-tagger-path')?.value?.trim();
  if (!pathVal) { showToast('请先填写数据集路径。'); return; }
  const apiKey = $('#llm-api-key')?.value?.trim();
  if (!apiKey) { showToast('请填写 API Key。'); return; }
  const model = $('#llm-model')?.value?.trim();
  if (!model) { showToast('请填写模型名称。'); return; }
  const params = {
    path: pathVal,
    interrogator_model: $('#llm-provider')?.value || 'llm-openai',
    llm_api_key: apiKey,
    llm_model: model,
    llm_api_base: $('#llm-api-base')?.value?.trim() || '',
    llm_template_preset: $('#llm-preset')?.value || 'anime-tags',
    batch_output_action_on_conflict: $('#llm-conflict')?.value || 'ignore',
    llm_temperature: parseFloat($('#llm-temperature')?.value) || 0.2,
    llm_max_tokens: parseInt($('#llm-max-tokens')?.value) || 300,
    batch_input_recursive: $('#llm-recursive')?.checked || false,
    threshold: 0.5,
  };
  setTaggerButtonLoading('btn-run-llm-tagger', 'llm-tagger-status-hint', true);
  try {
    const resp = await api.runInterrogate(params);
    setTaggerButtonLoading('btn-run-llm-tagger', 'llm-tagger-status-hint', false);
    showTaggerRunningHint('llm-tagger-status-hint',
      'LLM 标注后台运行中... 进度请查看后端控制台窗口（任务栏最小化窗口 "LoRA-Backend"）');
    showToast('✓ LLM 标注任务已提交到后端，正在后台运行。完成后 .txt 标签文件会自动生成在图片旁边。');
    _pollTaggerProgress('llm-tagger-status-hint');
  } catch (error) {
    setTaggerButtonLoading('btn-run-llm-tagger', 'llm-tagger-status-hint', false);
    showTaggerErrorHint('llm-tagger-status-hint', error.message || '提交失败');
    showToast(error.message || 'LLM 标注任务启动失败。');
  }
};


window.runTagger = async () => {
  const pathVal = $('#tagger-path')?.value?.trim();
  if (!pathVal) { showToast('请先填写数据集路径。'); return; }
  const params = {
    path: pathVal,
    interrogator_model: $('#tagger-model')?.value || 'wd14-convnextv2-v2',
    threshold: parseFloat($('#tagger-threshold')?.value) || 0.5,
    additional_tags: $('#tagger-additional')?.value || '',
    exclude_tags: $('#tagger-exclude')?.value || '',
    batch_input_recursive: $('#tagger-recursive')?.checked || false,
    batch_output_action_on_conflict: $('#tagger-conflict')?.value || 'ignore',
    replace_underscore: $('#tagger-underscore')?.checked ?? true,
    escape_tag: $('#tagger-escape')?.checked ?? true,
  };
  setTaggerButtonLoading('btn-run-tagger', 'tagger-status-hint', true);
  try {
    const resp = await api.runInterrogate(params);
    setTaggerButtonLoading('btn-run-tagger', 'tagger-status-hint', false);
    showTaggerRunningHint('tagger-status-hint',
      '标注后台运行中（首次需下载模型，可能需要几分钟）... 进度请查看后端控制台窗口');
    showToast('✓ 标注任务已提交到后端，正在后台运行。完成后 .txt 标签文件会自动生成在图片旁边。');
    _pollTaggerProgress('tagger-status-hint');
  } catch (error) {
    setTaggerButtonLoading('btn-run-tagger', 'tagger-status-hint', false);
    showTaggerErrorHint('tagger-status-hint', error.message || '提交失败');
    showToast(error.message || '标注任务启动失败。');
  }
};


function renderTagEditor() {
  const content = $('#dataset-content');
  if (!content) return;
  const teUrl = `http://${location.hostname}:28001`;
  content.innerHTML = `
    <div id="tageditor-status" style="padding:4px 0 12px;font-size:0.85rem;color:var(--text-dim);"></div>
    <section class="form-section" style="padding:0;overflow:hidden;">
      <header class="section-header">
        <h3>标签编辑器 (Tag Editor)</h3>
        <div style="display:flex;gap:8px;">
          <a class="btn btn-outline btn-sm" href="${teUrl}" target="_blank" rel="noopener">新窗口打开</a>
          <button class="btn btn-outline btn-sm" type="button" onclick="refreshTagEditorIframe()">刷新</button>
        </div>
      </header>
      <iframe id="tageditor-iframe" src="${teUrl}" style="width:100%;height:calc(100vh - 340px);min-height:500px;border:none;background:var(--bg-panel);"
        onload="var r=document.getElementById('tageditor-retry');if(r)r.style.display='none'"
        onerror="var r=document.getElementById('tageditor-retry');if(r)r.style.display='block'"></iframe>
      <div id="tageditor-retry" style="display:none;text-align:center;padding:40px;color:var(--text-dim);">
        <p>标签编辑器加载失败或尚未启动完成。训练期间可能暂时不可用。</p>
        <button class="btn btn-outline btn-sm" type="button" onclick="refreshTagEditorIframe()">重试连接</button>
      </div>
    </section>
  `;
  pollTagEditorStatus();
}


async function pollTagEditorStatus() {
  const statusEl = $('#tageditor-status');
  if (!statusEl) return;
  try {
    const data = await api.getTagEditorStatus();
    const labels = {
      ready: '✅ 标签编辑器已就绪',
      starting: '⏳ 标签编辑器正在启动...',
      queued: '⏳ 标签编辑器即将启动...',
      disabled: '⛔ 标签编辑器已禁用（启动时添加了 --disable-tageditor）',
      missing_dependencies: '❌ 依赖未安装，请先运行 install_tageditor',
      missing_launcher: '❌ 文件缺失',
      failed: '❌ 启动失败',
    };
    const text = labels[data.status] || `状态: ${data.status}`;
    statusEl.textContent = text + (data.detail ? ` — ${data.detail}` : '');
    if (!['ready','disabled','failed','missing_dependencies','missing_launcher'].includes(data.status)) {
      setTimeout(pollTagEditorStatus, 2000);
    }
  } catch (e) {
    statusEl.textContent = '无法获取状态';
  }
}

window.refreshTagEditorIframe = () => {
  const iframe = $('#tageditor-iframe');
  if (iframe) iframe.src = `http://${location.hostname}:28001`;
};



function renderImageResize() {
  const content = $('#dataset-content');
  if (!content) return;

  const defaultResolutions = [
    [768, 1344], [832, 1216], [896, 1152], [1024, 1024],
    [1152, 896], [1216, 832], [1344, 768],
  ];

  content.innerHTML = `
    <section class="form-section">
      <header class="section-header"><h3>训练图像缩放预处理</h3></header>
      <div class="section-summary">将图片缩放到最接近的预设目标分辨率，保持宽高比。支持批量转换格式、自动重命名、同步描述文件。<br><strong>推荐常用参数：智能缩放 + 精确裁剪</strong></div>
      <div class="section-content tool-fields">
        <div class="config-group" style="grid-column:1/-1;">
          <label>输入目录</label>
          <div class="input-picker">
            <button class="picker-icon" type="button" onclick="pickPathForInput('resize-input-path', 'folder')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('resize-input-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
            <input class="text-input" type="text" id="resize-input-path" placeholder="选择或输入数据集文件夹路径">
          </div>
          <p class="field-desc">选择或手动输入 train 目录下的数据集文件夹路径。</p>
        </div>
        <div class="config-group" style="grid-column:1/-1;">
          <label>输出目录（留空则覆盖原文件）</label>
          <div class="input-picker">
            <button class="picker-icon" type="button" onclick="pickPathForInput('resize-output', 'folder')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <input class="text-input" type="text" id="resize-output" placeholder="留空则在原目录生成">
          </div>
        </div>
        <div class="config-group">
          <label>输出格式</label>
          <select id="resize-format">
            <option value="ORIGINAL">原格式</option>
            <option value="JPEG" selected>JPEG (.jpg)</option>
            <option value="WEBP">WEBP (.webp)</option>
            <option value="PNG">PNG (.png)</option>
          </select>
        </div>
        <div class="config-group">
          <label>质量 (JPG/WEBP)：<span id="resize-quality-val">100</span>%</label>
          <input type="range" id="resize-quality" value="100" min="1" max="100" step="1" oninput="document.getElementById('resize-quality-val').textContent=this.value">
        </div>
        <div class="config-group" style="grid-column:1/-1;">
          <label>目标分辨率列表</label>
          <input class="text-input" type="text" id="resize-resolutions" value="${defaultResolutions.map((r) => r.join('x')).join(', ')}" placeholder="768x1344, 1024x1024, ...">
          <p class="field-desc">格式：宽x高，逗号分隔。图片会匹配宽高比最接近的分辨率。</p>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>启用智能缩放</label><p class="field-desc">禁用后仅转换格式，不改变尺寸。</p></div>
          <label class="switch switch-compact"><input type="checkbox" id="resize-enable" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>精确裁剪到目标尺寸</label><p class="field-desc">缩放后居中裁剪，输出精确等于目标尺寸。</p></div>
          <label class="switch switch-compact"><input type="checkbox" id="resize-exact" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>递归处理子目录</label><p class="field-desc">扫描并处理所有子文件夹中的图片。</p></div>
          <label class="switch switch-compact"><input type="checkbox" id="resize-recursive" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>自动重命名 (文件夹名_序号)</label><p class="field-desc">输出文件命名为 父文件夹名_1、父文件夹名_2 ...</p></div>
          <label class="switch switch-compact"><input type="checkbox" id="resize-rename" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>处理后删除原图</label><p class="field-desc">处理成功后删除源文件，建议配合输出目录使用。</p></div>
          <label class="switch switch-compact"><input type="checkbox" id="resize-delete" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>同步处理描述文件</label><p class="field-desc">自动同步 .txt / .npz / .caption 文件。</p></div>
          <label class="switch switch-compact"><input type="checkbox" id="resize-sync" checked><span class="slider round"></span></label>
        </div>
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;align-items:center;">
        <button class="btn btn-primary btn-sm" type="button" id="btn-resize-start" onclick="runImageResize()">开始处理</button>
        <span id="resize-status-hint" style="font-size:0.82rem;color:var(--text-dim);"></span>
      </div>
      <div id="resize-log-container" style="display:none;margin-top:12px;max-height:300px;overflow:auto;background:var(--bg-hover);border-radius:8px;padding:10px;font-family:monospace;font-size:0.78rem;white-space:pre-wrap;"></div>
    </section>
  `;
}


let _resizePollTimer = null;

window.runImageResize = async () => {
  const inputDir = $('#resize-input-path')?.value?.trim();
  if (!inputDir) { showToast('请先填写输入目录。'); return; }
  const btn = $('#btn-resize-start');
  const hint = $('#resize-status-hint');
  const logEl = $('#resize-log-container');
  if (btn) { btn.disabled = true; btn.innerHTML = _ico('loader') + ' 处理中...'; }
  if (hint) hint.innerHTML = '';
  if (logEl) { logEl.style.display = 'block'; logEl.textContent = '正在启动图像预处理...\n'; }
  const params = {
    input_dir: inputDir,
    output_dir: $('#resize-output')?.value?.trim() || '',
    format: $('#resize-format')?.value || 'ORIGINAL',
    quality: parseInt($('#resize-quality')?.value) || 95,
    resolutions: $('#resize-resolutions')?.value?.trim() || '',
    enable_resize: $('#resize-enable')?.checked ?? true,
    exact_size: $('#resize-exact')?.checked || false,
    recursive: $('#resize-recursive')?.checked || false,
    rename: $('#resize-rename')?.checked || false,
    delete_original: $('#resize-delete')?.checked || false,
    sync_metadata: $('#resize-sync')?.checked ?? true,
  };
  try {
    const resp = await api.runImageResize(params);
    if (resp.status !== 'success') { throw new Error(resp.message || '启动失败'); }
    showToast('✓ 图像预处理已启动');
    if (hint) hint.innerHTML = '<span style="color:#f59e0b;">' + _ico('loader') + ' 处理中...</span>';
    if (_resizePollTimer) clearInterval(_resizePollTimer);
    _resizePollTimer = setInterval(async () => {
      try {
        const statusResp = await api.getImageResizeStatus();
        const data = statusResp?.data;
        if (!data) return;
        if (logEl && data.lines) {
          logEl.textContent = data.lines.join('\n');
          logEl.scrollTop = logEl.scrollHeight;
        }
        if (data.process_status === 'done' || data.process_status === 'error') {
          clearInterval(_resizePollTimer);
          _resizePollTimer = null;
          if (btn) { btn.disabled = false; btn.textContent = '开始处理'; }
          if (data.process_status === 'done') {
            if (hint) hint.innerHTML = '<span style="color:#22c55e;">' + _ico('check-circle') + ' 处理完成</span>';
            showToast('✓ 图像预处理完成');
          } else {
            if (hint) hint.innerHTML = '<span style="color:#ef4444;">' + _ico('x-circle') + ' 处理异常</span>';
            showToast('图像预处理出现错误，请查看日志');
          }
        }
      } catch (e) { /* 静默 */ }
    }, 1000);
  } catch (error) {
    if (btn) { btn.disabled = false; btn.textContent = '开始处理'; }
    if (hint) hint.innerHTML = '<span style="color:#ef4444;">' + _ico('x-circle') + ' ' + escapeHtml(error.message || '启动失败') + '</span>';
    if (logEl) logEl.textContent = '❌ ' + (error.message || '启动图像预处理失败。');
    showToast(error.message || '图像预处理启动失败。');
  }
};



// ========== 数据集分析 ==========
function renderDatasetAnalysis() {
  const content = $('#dataset-content');
  if (!content) return;
  content.innerHTML = `
    <section class="form-section">
      <header class="section-header"><h3>数据集分析</h3></header>
      <div class="section-summary">分析数据集的图片分布、标签统计、分辨率分布等信息。</div>
      <div class="section-content tool-fields">
        <div class="config-group" style="grid-column:1/-1;">
          <label>数据集路径</label>
          <div class="input-picker">
            <button class="picker-icon" type="button" onclick="pickPathForInput('analysis-path', 'folder')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('analysis-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
            <input class="text-input" type="text" id="analysis-path" placeholder="./train/your_dataset">
          </div>
        </div>
        <div class="config-group">
          <label>Caption 扩展名</label>
          <input class="text-input" type="text" id="analysis-ext" value=".txt">
        </div>
        <div class="config-group">
          <label>Top 标签数</label>
          <input class="text-input" type="number" id="analysis-top" value="40" min="1" max="200">
        </div>
      </div>
      <div class="tool-actions">
        <button class="btn btn-primary btn-sm" type="button" onclick="runDatasetAnalysis()">开始分析</button>
      </div>
      <div id="analysis-result" style="margin-top:16px;"></div>
    </section>
  `;
}

window.runDatasetAnalysis = async () => {
  const pathVal = $('#analysis-path')?.value?.trim();
  if (!pathVal) { showToast('请先填写数据集路径。'); return; }
  const result = $('#analysis-result');
  if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>分析中...</span></div>';
  try {
    const response = await api.analyzeDataset({
      path: pathVal,
      caption_extension: $('#analysis-ext')?.value || '.txt',
      top_tags: parseInt($('#analysis-top')?.value) || 40,
    });
    const data = response?.data;
    if (!data) { if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>无结果</span></div>'; return; }
    if (result) result.innerHTML = `
      <div class="module-list">
        <div class="module-list-item module-list-item-static">
          <div class="module-list-main">
            <strong>图片数量: ${data.total_images ?? '-'}</strong>
            <span class="module-list-meta">有标注: ${data.captioned_images ?? '-'} | 无标注: ${data.uncaptioned_images ?? '-'}</span>
          </div>
        </div>
        ${(data.top_tags || []).map((t) => `
          <div class="module-list-item module-list-item-static">
            <div class="module-list-main"><strong>${escapeHtml(t.tag)}</strong></div>
            <span class="module-list-time">${t.count} 次</span>
          </div>
        `).join('')}
        ${(data.resolution_distribution || []).map((r) => `
          <div class="module-list-item module-list-item-static">
            <div class="module-list-main"><strong>${escapeHtml(r.resolution)}</strong></div>
            <span class="module-list-time">${r.count} 张</span>
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {
    if (result) result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(error.message || '分析失败')}</span></div>`;
  }
};

// ========== Caption 清洗 ==========
function renderCaptionCleanup() {
  const content = $('#dataset-content');
  if (!content) return;
  content.innerHTML = `
    <section class="form-section">
      <header class="section-header"><h3>Caption 清洗</h3></header>
      <div class="section-summary">批量清理数据集中的 caption 文件：去重、排序、搜索替换、追加/删除标签等。</div>
      <div class="section-content tool-fields">
        <div class="config-group" style="grid-column:1/-1;">
          <label>数据集路径</label>
          <div class="input-picker">
            <button class="picker-icon" type="button" onclick="pickPathForInput('cleanup-path', 'folder')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('cleanup-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
            <input class="text-input" type="text" id="cleanup-path" placeholder="./train/your_dataset">
          </div>
        </div>
        <div class="config-group">
          <label>Caption 扩展名</label>
          <input class="text-input" type="text" id="cleanup-ext" value=".txt">
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>递归处理子目录</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="cleanup-recursive" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>去除重复标签</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="cleanup-dedupe" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>标签排序</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="cleanup-sort"><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>合并空白字符</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="cleanup-collapse-ws" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>下划线转空格</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="cleanup-underscore"><span class="slider round"></span></label>
        </div>
        <div class="config-group">
          <label>前置追加标签</label>
          <input class="text-input" type="text" id="cleanup-prepend" placeholder="tag1, tag2">
        </div>
        <div class="config-group">
          <label>后置追加标签</label>
          <input class="text-input" type="text" id="cleanup-append" placeholder="tag1, tag2">
        </div>
        <div class="config-group">
          <label>删除指定标签</label>
          <input class="text-input" type="text" id="cleanup-remove" placeholder="tag_to_remove">
        </div>
        <div class="config-group">
          <label>搜索文本</label>
          <input class="text-input" type="text" id="cleanup-search" placeholder="搜索内容">
        </div>
        <div class="config-group">
          <label>替换文本</label>
          <input class="text-input" type="text" id="cleanup-replace" placeholder="替换为">
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>使用正则表达式</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="cleanup-regex"><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>应用前自动备份</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="cleanup-backup" checked><span class="slider round"></span></label>
        </div>
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" type="button" onclick="runCaptionCleanupPreview()">预览变更</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="runCaptionCleanupApply()">应用清洗</button>
      </div>
      <div id="cleanup-result" style="margin-top:16px;"></div>
    </section>
  `;
}

function gatherCleanupParams() {
  return {
    path: $('#cleanup-path')?.value?.trim() || '',
    caption_extension: $('#cleanup-ext')?.value || '.txt',
    recursive: $('#cleanup-recursive')?.checked ?? true,
    dedupe_tags: $('#cleanup-dedupe')?.checked ?? true,
    sort_tags: $('#cleanup-sort')?.checked || false,
    collapse_whitespace: $('#cleanup-collapse-ws')?.checked ?? true,
    replace_underscore: $('#cleanup-underscore')?.checked || false,
    prepend_tags: $('#cleanup-prepend')?.value || '',
    append_tags: $('#cleanup-append')?.value || '',
    remove_tags: $('#cleanup-remove')?.value || '',
    search_text: $('#cleanup-search')?.value || '',
    replace_text: $('#cleanup-replace')?.value || '',
    use_regex: $('#cleanup-regex')?.checked || false,
    create_backup_before_apply: $('#cleanup-backup')?.checked ?? true,
  };
}

window.runCaptionCleanupPreview = async () => {
  const params = gatherCleanupParams();
  if (!params.path) { showToast('请先填写数据集路径。'); return; }
  const result = $('#cleanup-result');
  if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>预览中...</span></div>';
  try {
    const response = await api.captionCleanupPreview(params);
    const data = response?.data;
    if (!data) { if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>无结果</span></div>'; return; }
    const summary = data.summary || {};
    const samples = data.samples || [];
    if (result) result.innerHTML = `
      <div class="module-list">
        <div class="module-list-item module-list-item-static">
          <div class="module-list-main">
            <strong>扫描文件: ${summary.total_file_count ?? '-'}</strong>
            <span class="module-list-meta">将变更: ${summary.changed_file_count ?? '-'} | 无变化: ${summary.unchanged_file_count ?? '-'}</span>
          </div>
        </div>
        ${samples.map((s) => `
          <div class="module-list-item module-list-item-static">
            <div class="module-list-main">
              <strong>${escapeHtml(s.file)}</strong>
              <span class="module-list-meta">前: ${escapeHtml(s.before || '')}</span>
              <span class="module-list-meta" style="color:var(--accent);">后: ${escapeHtml(s.after || '')}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {
    if (result) result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(error.message || '预览失败')}</span></div>`;
  }
};

window.runCaptionCleanupApply = async () => {
  const params = gatherCleanupParams();
  if (!params.path) { showToast('请先填写数据集路径。'); return; }
  try {
    const response = await api.captionCleanupApply(params);
    showToast(response?.message || 'Caption 清洗已应用。');
    window.runCaptionCleanupPreview();
  } catch (error) {
    showToast(error.message || 'Caption 清洗失败。');
  }
};

// ========== Caption 备份 ==========
function renderCaptionBackups() {
  const content = $('#dataset-content');
  if (!content) return;
  content.innerHTML = `
    <section class="form-section">
      <header class="section-header"><h3>Caption 备份与恢复</h3></header>
      <div class="section-summary">创建数据集 caption 的快照备份，或从已有备份恢复。</div>
      <div class="section-content tool-fields">
        <div class="config-group" style="grid-column:1/-1;">
          <label>数据集路径</label>
          <div class="input-picker">
            <button class="picker-icon" type="button" onclick="pickPathForInput('backup-path', 'folder')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('backup-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
            <input class="text-input" type="text" id="backup-path" placeholder="./train/your_dataset">
          </div>
        </div>
        <div class="config-group">
          <label>备份名称</label>
          <input class="text-input" type="text" id="backup-name" placeholder="my-backup">
        </div>
        <div class="config-group">
          <label>Caption 扩展名</label>
          <input class="text-input" type="text" id="backup-ext" value=".txt">
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>递归子目录</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="backup-recursive" checked><span class="slider round"></span></label>
        </div>
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;">
        <button class="btn btn-primary btn-sm" type="button" onclick="createCaptionBackup()">创建备份</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="listCaptionBackups()">查看已有备份</button>
      </div>
      <div id="backup-result" style="margin-top:16px;"></div>
    </section>
  `;
}

window.createCaptionBackup = async () => {
  const pathVal = $('#backup-path')?.value?.trim();
  if (!pathVal) { showToast('请先填写数据集路径。'); return; }
  try {
    const response = await api.captionBackupCreate({
      path: pathVal,
      caption_extension: $('#backup-ext')?.value || '.txt',
      recursive: $('#backup-recursive')?.checked ?? true,
      snapshot_name: $('#backup-name')?.value?.trim() || '',
    });
    showToast(response?.message || '备份已创建。');
    window.listCaptionBackups();
  } catch (error) {
    showToast(error.message || '备份创建失败。');
  }
};

window.listCaptionBackups = async () => {
  const pathVal = $('#backup-path')?.value?.trim();
  const result = $('#backup-result');
  if (!result) return;
  result.innerHTML = '<div class="builtin-picker-empty"><span>加载中...</span></div>';
  try {
    const response = await api.captionBackupList({ path: pathVal || '' });
    const backups = response?.data?.backups || [];
    if (!backups.length) {
      result.innerHTML = '<div class="builtin-picker-empty"><span>未找到备份</span></div>';
      return;
    }
    result.innerHTML = `
      <div class="module-list">
        ${backups.map((b) => `
          <div class="module-list-item">
            <div class="module-list-main">
              <strong>${escapeHtml(b.archive_name || b.name || '-')}</strong>
              <span class="module-list-meta">${b.file_count ?? '-'} 个文件</span>
            </div>
            <span class="module-list-time">${b.created_at ? new Date(b.created_at).toLocaleString('zh-CN') : '-'}</span>
            <button class="btn btn-outline btn-sm btn-picker-action" type="button" onclick="restoreCaptionBackup('${escapeHtml(b.archive_name || b.name)}')">恢复</button>
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {
    result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(error.message || '读取备份列表失败')}</span></div>`;
  }
};

window.restoreCaptionBackup = async (archiveName) => {
  const pathVal = $('#backup-path')?.value?.trim();
  if (!pathVal) { showToast('请先填写数据集路径。'); return; }
  try {
    const response = await api.captionBackupRestore({ path: pathVal, archive_name: archiveName });
    showToast(response?.message || '备份已恢复。');
  } catch (error) {
    showToast(error.message || '备份恢复失败。');
  }
};

// ========== 蒙版损失审查 ==========
function renderMaskedLossAudit() {
  const content = $('#dataset-content');
  if (!content) return;
  content.innerHTML = `
    <section class="form-section">
      <header class="section-header"><h3>蒙版损失数据集审查</h3></header>
      <div class="section-summary">检查数据集中的图像是否包含 Alpha 通道 / 蒙版，用于 masked_loss 训练。</div>
      <div class="section-content tool-fields">
        <div class="config-group" style="grid-column:1/-1;">
          <label>数据集路径</label>
          <div class="input-picker">
            <button class="picker-icon" type="button" onclick="pickPathForInput('maskedloss-path', 'folder')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('maskedloss-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
            <input class="text-input" type="text" id="maskedloss-path" placeholder="./train/your_dataset">
          </div>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>递归扫描子目录</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="maskedloss-recursive" checked><span class="slider round"></span></label>
        </div>
      </div>
      <div class="tool-actions">
        <button class="btn btn-primary btn-sm" type="button" onclick="runMaskedLossAudit()">开始审查</button>
      </div>
      <div id="maskedloss-result" style="margin-top:16px;"></div>
    </section>
  `;
}

window.runMaskedLossAudit = async () => {
  const pathVal = $('#maskedloss-path')?.value?.trim();
  if (!pathVal) { showToast('请先填写数据集路径。'); return; }
  const result = $('#maskedloss-result');
  if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>审查中...</span></div>';
  try {
    const response = await api.maskedLossAudit({
      path: pathVal,
      recursive: $('#maskedloss-recursive')?.checked ?? true,
    });
    const data = response?.data;
    if (!data) { if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>无结果</span></div>'; return; }
    if (result) result.innerHTML = `
      <div class="module-list">
        <div class="module-list-item module-list-item-static">
          <div class="module-list-main">
            <strong>总图片: ${data.total_images ?? '-'}</strong>
            <span class="module-list-meta">包含 Alpha/Mask: ${data.with_alpha ?? '-'} | 无 Mask: ${data.without_alpha ?? '-'}</span>
          </div>
        </div>
        ${(data.samples || []).map((s) => `
          <div class="module-list-item module-list-item-static">
            <div class="module-list-main">
              <strong>${escapeHtml(s.file || s.name || '-')}</strong>
              <span class="module-list-meta">${s.has_alpha ? '✅ 包含 Alpha' : '❌ 无 Alpha'} | ${s.width}x${s.height}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {
    if (result) result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(error.message || '审查失败')}</span></div>`;
  }
};



function renderLogs(container) {
  const customTbUrl = localStorage.getItem('sd-rescripts:tensorboard-url')?.trim();
  const tbUrl = customTbUrl || `http://${location.hostname}:6006`;
  container.innerHTML = `
    <div class="form-container">
      <header class="section-title">
        <h2>TensorBoard</h2>
        <p>训练日志可视化，查看损失曲线、学习率变化与样本图。TensorBoard 已随训练器自动启动。</p>
      </header>
      <section class="form-section" style="padding:0;overflow:hidden;">
        <iframe id="tb-iframe" src="${tbUrl}" style="width:100%;height:calc(100vh - 240px);min-height:500px;border:none;border-radius:12px;background:var(--bg-panel);"
          onload="var r=document.getElementById('tb-retry');if(r)r.style.display='none'"
          onerror="var r=document.getElementById('tb-retry');if(r)r.style.display='block'"></iframe>
        <div id="tb-retry" style="display:none;text-align:center;padding:40px;color:var(--text-dim);">
          <p>TensorBoard 加载失败。可能尚未启动或训练结束后被回收。</p>
          <button class="btn btn-outline btn-sm" type="button" onclick="document.getElementById('tb-retry').style.display='none';document.getElementById('tb-iframe').src='${tbUrl}'">重试连接</button>
        </div>
      </section>
      <div style="margin-top:12px;display:flex;gap:8px;">
        <a class="btn btn-outline btn-sm" href="${tbUrl}" target="_blank" rel="noopener">在新窗口中打开 TensorBoard</a>
        <button class="btn btn-outline btn-sm" type="button" onclick="document.getElementById('tb-iframe').src='${tbUrl}'">刷新</button>
      </div>

    </div>
  `;

}


function renderTools(container) {
  const tools = [
    {
      id: 'extract_lora',
      title: '从模型提取 LoRA',
      desc: '从两个模型的差异中提取 LoRA 网络权重。',
      script: 'networks/extract_lora_from_models.py',
      fields: [
        { key: 'model_org', label: '原始模型路径', type: 'text', placeholder: './sd-models/original.safetensors' },
        { key: 'model_tuned', label: '微调模型路径', type: 'text', placeholder: './sd-models/finetuned.safetensors' },
        { key: 'save_to', label: '输出路径', type: 'text', placeholder: './output/extracted.safetensors' },
        { key: 'dim', label: '网络维度 (dim)', type: 'number', placeholder: '32' },
      ],
    },
    {
      id: 'extract_dylora',
      title: '从 DyLoRA 提取 LoRA',
      desc: '从 DyLoRA 模型中提取指定维度的 LoRA 权重。',
      script: 'networks/extract_lora_from_dylora.py',
      fields: [
        { key: 'model', label: 'DyLoRA 模型路径', type: 'text', placeholder: './output/dylora.safetensors' },
        { key: 'save_to', label: '输出路径', type: 'text', placeholder: './output/extracted.safetensors' },
        { key: 'unit', label: '提取维度 (unit)', type: 'number', placeholder: '4' },
      ],
    },
    {
      id: 'merge_lora',
      title: '合并 LoRA',
      desc: '将多个 LoRA 按指定权重合并为一个。',
      script: 'networks/merge_lora.py',
      fields: [
        { key: 'save_to', label: '输出路径', type: 'text', placeholder: './output/merged.safetensors' },
        { key: 'models', label: 'LoRA 路径（空格分隔）', type: 'text', placeholder: './output/a.safetensors ./output/b.safetensors' },
        { key: 'ratios', label: '合并权重（空格分隔）', type: 'text', placeholder: '0.5 0.5' },
        { key: 'save_precision', label: '保存精度', type: 'text', placeholder: 'fp16' },
      ],
    },
    {
      id: 'sdxl_merge_lora',
      title: 'SDXL 合并 LoRA',
      desc: 'SDXL 专用的 LoRA 合并工具。',
      script: 'networks/sdxl_merge_lora.py',
      fields: [
        { key: 'save_to', label: '输出路径', type: 'text', placeholder: './output/merged_sdxl.safetensors' },
        { key: 'models', label: 'LoRA 路径（空格分隔）', type: 'text', placeholder: './output/a.safetensors ./output/b.safetensors' },
        { key: 'ratios', label: '合并权重（空格分隔）', type: 'text', placeholder: '0.5 0.5' },
        { key: 'save_precision', label: '保存精度', type: 'text', placeholder: 'fp16' },
      ],
    },
    {
      id: 'flux_merge_lora',
      title: 'FLUX 合并 LoRA',
      desc: 'FLUX 专用的 LoRA 合并工具。',
      script: 'networks/flux_merge_lora.py',
      fields: [
     { key: 'save_to', label: '输出路径', type: 'text', placeholder: './output/merged_flux.safetensors' },
        { key: 'models', label: 'LoRA 路径（空格分隔）', type: 'text', placeholder: './output/a.safetensors ./output/b.safetensors' },
        { key: 'ratios', label: '合并权重（空格分隔）', type: 'text', placeholder: '0.5 0.5' },
        { key: 'save_precision', label: '保存精度', type: 'text', placeholder: 'fp16' },
      ],
    },
    {
      id: 'flux_extract_lora',
      title: 'FLUX 提取 LoRA',
      desc: '从 FLUX 模型差异中提取 LoRA。',
      script: 'networks/flux_extract_lora.py',
      fields: [
        { key: 'model_org', label: '原始模型路径', type: 'text', placeholder: '' },
        { key: 'model_tuned', label: '微调模型路径', type: 'text', placeholder: '' },
        { key: 'save_to', label: '输出路径', type: 'text', placeholder: './output/flux_extracted.safetensors' },
        { key: 'dim', label: '网络维度', type: 'number', placeholder: '16' },
      ],
    },
    {
      id: 'resize_lora',
      title: 'LoRA 缩放 (Resize)',
      desc: '将 LoRA 权重缩放到不同的 dim / rank。',
      script: 'networks/resize_lora.py',
      fields: [
        { key: 'model', label: 'LoRA 模型路径', type: 'text', placeholder: './output/my_lora.safetensors' },
        { key: 'save_to', label: '输出路径', type: 'text', placeholder: './output/resized.safetensors' },
        { key: 'new_rank', label: '目标 Rank', type: 'number', placeholder: '16' },
        { key: 'save_precision', label: '保存精度', type: 'text', placeholder: 'fp16' },
      ],
    },
    {
      id: 'check_lora_weights',
      title: '检查 LoRA 权重',
      desc: '查看 LoRA 文件的权重统计信息。',
      script: 'networks/check_lora_weights.py',
      fields: [
        { key: 'file', label: 'LoRA 文件路径', type: 'text', placeholder: './output/my_lora.safetensors' },
      ],
    },
    {
      id: 'convert_flux_lora',
      title: '转换 FLUX LoRA 格式',
      desc: '在 ai-toolkit 和 sd-scripts 格式之间转换 FLUX LoRA。',
      script: 'networks/convert_flux_lora.py',
      fields: [
        { key: 'src_path', label: '源文件路径', type: 'text', placeholder: './output/source_lora.safetensors' },
        { key: 'dst_path', label: '输出路径', type: 'text', placeholder: './output/converted.safetensors' },
        { key: 'src', label: '源格式', type: 'text', placeholder: 'ai-toolkit' },
        { key: 'dst', label: '目标格式', type: 'text', placeholder: 'sd-scripts' },
      ],
    },

    {
      id: 'convert_hunyuan_lora',
      title: '转换混元图像 LoRA 到 ComfyUI',
      desc: '将混元图像 LoRA 转换为 ComfyUI 可用格式。',
      script: 'networks/convert_hunyuan_image_lora_to_comfy.py',
      fields: [
        { key: 'src_path', label: '源文件路径', type: 'text', placeholder: './output/hunyuan_lora.safetensors' },
        { key: 'dst_path', label: '输出路径', type: 'text', placeholder: './output/hunyuan_comfy.safetensors' },
      ],
    },
    {
      id: 'convert_anima_lora',
      title: '转换 Anima LoRA 到 ComfyUI',
      desc: '将 Anima LoRA 转换为 ComfyUI 可用格式。',
      script: 'networks/convert_anima_lora_to_comfy.py',
      fields: [
        { key: 'src_path', label: '源文件路径', type: 'text', placeholder: '' },
        { key: 'dst_path', label: '输出路径', type: 'text', placeholder: '' },
      ],
    },
    {
      id: 'show_metadata',
      title: '查看模型元数据',
      desc: '显示 safetensors/ckpt 文件的元数据信息。',
      script: 'tools/show_metadata.py',
      fields: [
        { key: 'model', label: '模型文件路径', type: 'text', placeholder: './output/model.safetensors' },
      ],
    },
    {
      id: 'merge_models',
      title: '合并模型',
      desc: '按指定比例合并多个 Stable Diffusion 模型。多个模型/比例用空格分隔。',
      script: 'tools/merge_models.py',
      fields: [
        { key: 'models', label: '模型路径（空格分隔）', type: 'text', placeholder: './sd-models/a.safetensors ./sd-models/b.safetensors' },
        { key: 'output', label: '输出路径', type: 'text', placeholder: './output/merged_model.safetensors' },
        { key: 'ratios', label: '合并比例（空格分隔）', type: 'text', placeholder: '0.5 0.5' },
        { key: 'saving_precision', label: '保存精度', type: 'text', placeholder: 'fp16' },
      ],
    },

    {
      id: 'merge_sd3',
      title: '合并 SD3 模型',
      desc: '将 SD3 的 DiT/VAE/CLIP/T5 合并为单个 safetensors 文件。',
      script: 'tools/merge_sd3_safetensors.py',
      fields: [
        { key: 'dit', label: 'DiT/MMDiT 模型路径', type: 'text', placeholder: '' },
        { key: 'clip_l', label: 'CLIP-L 路径（可选）', type: 'text', placeholder: '' },
        { key: 'clip_g', label: 'CLIP-G 路径（可选）', type: 'text', placeholder: '' },
        { key: 't5xxl', label: 'T5-XXL 路径（可选）', type: 'text', placeholder: '' },
        { key: 'vae', label: 'VAE 路径（可选）', type: 'text', placeholder: '' },
        { key: 'output', label: '输出路径', type: 'text', placeholder: './output/merged_sd3.safetensors' },
        { key: 'save_precision', label: '保存精度', type: 'text', placeholder: 'fp16' },
      ],
    },

    {
      id: 'convert_diffusers_to_flux',
      title: 'Diffusers 转 FLUX',
      desc: '将 Diffusers 格式转换为 FLUX 格式。',
      script: 'tools/convert_diffusers_to_flux.py',
      fields: [
        { key: 'diffusers_path', label: 'Diffusers 模型文件夹路径', type: 'text', placeholder: '' },
        { key: 'save_to', label: '输出路径', type: 'text', placeholder: './output/flux_converted.safetensors' },
      ],
    },
    {
      id: 'lora_interrogator',
      title: 'LoRA 识别器',
      desc: '检测 LoRA 网络的训练信息。⚠️ 仅支持 SD 1.5 的 LoRA，不支持 SDXL/FLUX。底模必须是对应的 SD 1.5 模型。',
      script: 'networks/lora_interrogator.py',
      fields: [
        { key: 'sd_model', label: '基础 SD 1.5 模型路径', type: 'text', placeholder: './sd-models/sd15_model.safetensors' },
        { key: 'model', label: 'LoRA 文件路径', type: 'text', placeholder: './output/my_lora.safetensors' },
        { key: 'v2', label: 'SD 2.x 模型', type: 'checkbox' },
        { key: 'clip_skip', label: 'CLIP Skip', type: 'number', placeholder: '' },
      ],
    },

  ];


  const selectedId = state.selectedTool || '';
  const selectedTool = tools.find((t) => t.id === selectedId);

  container.innerHTML = `
    <div class="form-container">
      <header class="section-title">
        <h2>工具箱</h2>
        <p>LoRA 提取、合并等实用工具。选择工具后填写参数并运行。</p>
      </header>
      <div class="config-group">
        <label>选择工具</label>
        <select id="tool-selector">
          <option value="">—— 请选择工具 ——</option>
          ${tools.map((t) => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${escapeHtml(t.title)}</option>`).join('')}
        </select>
      </div>
      <div id="tool-detail">
        ${selectedTool ? renderToolDetail(selectedTool) : '<div class="empty-state" style="margin-top:12px;"><strong>请在上方下拉菜单中选择一个工具</strong></div>'}
      </div>
      ${renderSlot('tools.entry')}
    </div>
  `;

  $('#tool-selector')?.addEventListener('change', (e) => {
    state.selectedTool = e.target.value;
    const detail = $('#tool-detail');
    const tool = tools.find((t) => t.id === e.target.value);
    if (detail) {
      detail.innerHTML = tool ? renderToolDetail(tool) : '<div class="empty-state"><strong>请在上方下拉菜单中选择一个工具</strong></div>';
    }
  });
}

function renderToolDetail(tool) {
  const isPathField = (f) => /model|path|save_to|file|src_|dst_/.test(f.key);
  return `
    <section class="form-section tool-section" id="tool-${tool.id}" style="margin-top:16px;">
      <header class="section-header">
        <h3>${escapeHtml(tool.title)}</h3>
      </header>
      <div class="section-summary">${escapeHtml(tool.desc)}</div>
      <div class="section-content tool-fields">
        ${tool.fields.map((f) => {
          const inputId = `tool-${tool.id}-${f.key}`;
          if (isPathField(f)) {
            return `
          <div class="config-group">
            <label>${escapeHtml(f.label)}</label>
            <div class="input-picker">
              <button class="picker-icon" type="button" onclick="pickPathForInput('${inputId}', '${f.key.includes('save') || f.key.includes('dst') ? 'folder' : 'model-file'}')">
                <svg class="icon"><use href="#icon-folder"></use></svg>
              </button>
              <input class="text-input" type="${f.type}" id="${inputId}" placeholder="${escapeHtml(f.placeholder || '')}">
            </div>
          </div>`;
          }
          return `
          <div class="config-group">
            <label>${escapeHtml(f.label)}</label>
            <input class="text-input" type="${f.type}" id="${inputId}" placeholder="${escapeHtml(f.placeholder || '')}">
          </div>`;
        }).join('')}
      </div>
      <div class="tool-actions" style="display:flex;align-items:center;gap:12px;">
        <button class="btn btn-primary btn-sm" type="button" id="btn-tool-${tool.id}"
          onclick="runTool('${tool.id}', '${escapeHtml(tool.script)}', ${JSON.stringify(tool.fields.map((f) => f.key)).replaceAll('"', '&quot;')})">运行</button>
        <span id="tool-status-${tool.id}" style="font-size:0.82rem;"></span>
      </div>
      <div id="tool-result-${tool.id}" style="display:none;margin-top:12px;padding:12px;border-radius:8px;font-size:0.82rem;white-space:pre-wrap;font-family:monospace;max-height:300px;overflow:auto;"></div>
    </section>
  `;
}


window.runTool = async (toolId, scriptName, keys) => {
  // ── 参数校验 ──
  const params = { script_name: scriptName };
  let hasAnyField = false;
  // 这些 key 接受空格分隔的多值，后端 run_script 遇到 list 会展开为多个 CLI 参数
  const listKeys = new Set(['models', 'ratios']);
  for (const key of keys) {
    const input = $(`#tool-${toolId}-${key}`);
    if (input && input.value.trim()) {
      const val = input.value.trim();
      if (listKeys.has(key)) {
        params[key] = val.split(/\s+/);
      } else {
        params[key] = val;
      }
      hasAnyField = true;
    }
  }
  if (!hasAnyField) {
    showToast('请至少填写一个参数。');
    return;
  }

  // ── 按钮 loading 态 ──
  const btn = $(`#btn-tool-${toolId}`);
  const statusEl = $(`#tool-status-${toolId}`);
  const resultEl = $(`#tool-result-${toolId}`);
  if (btn) { btn.disabled = true; btn.innerHTML = _ico('loader') + ' 提交中...'; }
  if (statusEl) statusEl.innerHTML = '';
  if (resultEl) { resultEl.style.display = 'none'; resultEl.textContent = ''; }

  try {
    const resp = await api.runScript(params);
    const taskId = resp?.data?.task_id;

    // ── 显示运行中状态 ──
    if (btn) { btn.disabled = true; btn.innerHTML = _ico('loader') + ' 运行中...'; }
    if (statusEl) {
      statusEl.innerHTML = '<span style="color:#f59e0b;">' + _ico('loader', 14) + ' 工具运行中...</span>';
    }
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.style.background = 'var(--bg-hover)';
      resultEl.style.color = 'var(--text-base)';
      resultEl.innerHTML = '<span style="color:var(--text-dim);">' + _ico('loader', 14) + ' 等待输出...</span>';
    }
    showToast('✓ 工具已提交运行。');

    // ── 轮询输出 ──
    if (taskId) {
      let pollCount = 0;
      const maxPolls = 300; // 最多轮询 5 分钟（1s 间隔）
      const pollInterval = setInterval(async () => {
        pollCount++;
        try {
          const outResp = await api.getTaskOutput(taskId, 200);
          const lines = outResp?.data?.lines || [];
          if (lines.length > 0 && resultEl) {
            resultEl.innerHTML = _renderLogLines(lines);
            resultEl.scrollTop = resultEl.scrollHeight;
          }

          // 检查任务是否结束
          const tasksResp = await api.getTasks();
          const allTasks = tasksResp?.data?.tasks || [];
          const thisTask = allTasks.find((t) => t.id === taskId);
          const finished = !thisTask || thisTask.status === 'FINISHED' || thisTask.status === 'TERMINATED';

          if (finished || pollCount >= maxPolls) {
            clearInterval(pollInterval);

            // 延迟 500ms 再拉最终输出（确保后台线程 flush 完）
            setTimeout(async () => {
              // 最终状态
              const failed = thisTask && (thisTask.status === 'TERMINATED' || (thisTask.returncode != null && thisTask.returncode !== 0));
              if (failed) {
                if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444;">' + _ico('x-circle', 14) + ' 工具运行失败 (exit code: ' + (thisTask.returncode ?? '?') + ')</span>';
                if (resultEl) resultEl.style.borderLeft = '3px solid #ef4444';
              } else {
                if (statusEl) statusEl.innerHTML = '<span style="color:#22c55e;">' + _ico('check-circle', 14) + ' 工具运行完成</span>';
                if (resultEl) resultEl.style.borderLeft = '3px solid #22c55e';
              }
              if (btn) { btn.disabled = false; btn.textContent = '运行'; }

              // 拉最终完整输出
              try {
                const finalResp = await api.getTaskOutput(taskId, 200);
                const finalLines = finalResp?.data?.lines || [];
                if (finalLines.length > 0 && resultEl) {
                  resultEl.innerHTML = _renderLogLines(finalLines);
                  resultEl.scrollTop = resultEl.scrollHeight;
                } else if (resultEl && (!resultEl.textContent || resultEl.textContent.includes('等待输出'))) {
                  resultEl.innerHTML = '<span style="color:var(--text-dim);">（脚本无标准输出）</span>';
                }
              } catch (e) { /* ignore */ }
            }, 800);
          }
        } catch (e) {
          // 静默
        }
      }, 1000);
    } else {
      // 后端没返回 task_id（旧版后端），回退到旧行为
      setTimeout(() => {
     if (btn) { btn.disabled = false; btn.textContent = '运行'; }
        if (statusEl) statusEl.innerHTML = '<span style="color:#22c55e;">' + _ico('check-circle', 14) + ' 工具应已完成，请检查输出文件</span>';
        if (resultEl) { resultEl.innerHTML = 'ℹ 工具在后台执行，输出请查看后端控制台窗口。'; resultEl.style.display = 'block'; }
      }, 3000);
    }
  } catch (error) {
    // ── 提交失败 ──
    if (btn) { btn.disabled = false; btn.textContent = '运行'; }
    if (statusEl) {
      statusEl.innerHTML = '<span style="color:#ef4444;">' + _ico('x-circle', 14) + ' ' + escapeHtml(error.message || '提交失败') + '</span>';
    }
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.style.background = 'rgba(239,68,68,0.08)';
      resultEl.style.color = '#ef4444';
      resultEl.textContent = error.message || '工具运行失败。';
    }
    showToast(error.message || '工具运行失败。');
  }
};







window.updateConfigValue = (key, rawValue) => {
  const field = getFieldDefinition(key);
  const normalizedValue = normalizeDraftValue(field, rawValue);
  const previousValue = state.config[key];
  if (String(previousValue ?? '') !== String(normalizedValue ?? '')) {
    state.fieldUndo[key] = previousValue;
  }
  state.config[key] = normalizedValue;
  if (CONDITIONAL_KEYS.has(key) && state.activeModule === 'config') {
    saveDraft();
    renderView('config');
    return;
  }
  syncConfigState();
};

/* ---- Picker overlay helpers ---- */
function _showPickerOverlay() {
  var ol = document.createElement('div');
  ol.className = 'picker-overlay';
  ol.id = 'picker-overlay';
  ol.innerHTML = '<div class="picker-overlay-box">'
    + '<div class="picker-ol-icon">' + _ico('folder', 32) + '</div>'
    + '<div class="picker-ol-title">\u6587\u4ef6\u9009\u62e9\u5668\u5df2\u6253\u5f00</div>'
    + '<div class="picker-ol-hint">\u8bf7\u5728\u5f39\u51fa\u7684\u7cfb\u7edf\u5bf9\u8bdd\u6846\u4e2d\u9009\u62e9\u6587\u4ef6\u6216\u6587\u4ef6\u5939\u3002<br>'
    + '<strong style="color:var(--accent);">\u2b05 \u5982\u672a\u770b\u5230\u5bf9\u8bdd\u6846\uff0c\u8bf7\u70b9\u51fb\u4efb\u52a1\u680f\u4e2d\u95ea\u70c1\u7684\u7a97\u53e3</strong></div>'
    + '</div>';
  document.body.appendChild(ol);
  // Save original title & change to taskbar hint
  window._pickerPrevTitle = document.title;
  document.title = '\u2b05 \u8bf7\u67e5\u770b\u4efb\u52a1\u680f\u7684\u6587\u4ef6\u9009\u62e9\u5668';
  // Repeatedly blur for ~2s to cover dialog spawn delay
  var n = 0;
  try { window.blur(); } catch(_e) {}
  window._pickerBlurTimer = setInterval(function() {
    try { window.blur(); } catch(_e) {}
    if (++n >= 8) clearInterval(window._pickerBlurTimer);
  }, 250);
}
function _hidePickerOverlay() {
  if (window._pickerBlurTimer) {
    clearInterval(window._pickerBlurTimer);
    window._pickerBlurTimer = null;
  }
  var ol = $('#picker-overlay');
  if (ol) ol.remove();
  // Restore title & re-focus browser
  document.title = window._pickerPrevTitle || 'SD-reScripts';
  delete window._pickerPrevTitle;
  try { window.focus(); } catch(_e) {}
}

window.pickPathForInput = async (inputId, pickerType) => {
  _showPickerOverlay();
  try {
    // 后端 pick_file 只支持 folder / model-file / text-file
    // 将 schema 中的扩展 pickerType 映射回后端支持的类型
    const pickerMap = {
      'output-folder': 'folder',
      'output-model-file': 'model-file',
    };
    pickerType = pickerMap[pickerType] || pickerType;

    const response = await api.pickFile(pickerType);
    _hidePickerOverlay();
    if (response.status !== 'success') {
      showToast(response.message || '选择路径失败。');
      return;
    }
    const input = $(`#${inputId}`);
    if (input) {
      input.value = response.data.path;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } catch (error) {
    _hidePickerOverlay();
    showToast(error.message || '选择路径失败。');
  }
};


window.pickPath = async (key, pickerType) => {
  _showPickerOverlay();
  try {
    // 后端 pick_file 只支持 folder / model-file / text-file
    const pickerMap = {
      'output-folder': 'folder',
      'output-model-file': 'model-file',
    };
    pickerType = pickerMap[pickerType] || pickerType;

    const response = await api.pickFile(pickerType);
    _hidePickerOverlay();
    if (response.status !== 'success') {
      showToast(response.message || '选择路径失败。');
      return;
    }
    window.updateConfigValue(key, response.data.path);
    if (state.activeModule === 'config') {
      renderView('config');
    }
  } catch (error) {
    _hidePickerOverlay();
    showToast(error.message || '选择路径失败。');
  }
};

window.runPreflight = async () => {
  state.loading.preflight = true;
  updateJSONPreview();
  showToast('正在执行训练预检...');

  try {
    const [runtimeRes, preflightRes] = await Promise.allSettled([
      api.getGraphicCards(),
      api.runPreflight(buildRunConfig(state.config, state.activeTrainingType)),
    ]);
    if (runtimeRes.status === 'fulfilled') {
      state.runtime = runtimeRes.value.data || null;
      state.runtimeError = '';
    } else {
      state.runtimeError = runtimeRes.reason?.message || '运行环境不可用';
    }
    if (preflightRes.status === 'fulfilled' && preflightRes.value.status === 'success') {
      state.preflight = preflightRes.value.data;
    } else {
      state.preflight = {
        can_start: false,
        errors: [preflightRes.reason?.message || preflightRes.value?.message || '训练预检失败。'],
        warnings: [],
      };
    }
    showToast('训练预检完成');
  } catch (error) {
    state.preflight = {
      can_start: false,
      errors: [error.message || '训练预检失败。'],
      warnings: [],
    };
    showToast(error.message || '训练预检失败');
  } finally {
    state.loading.preflight = false;
    if (state.activeModule === 'config') {
      renderView('config');
    } else if (state.activeModule === 'training') {
      state.trainSubTab = 'preflight';
      renderView('training');
    } else {
      updateJSONPreview();
    }
  }
};

window.refreshRuntime = async () => {
  state.loading.runtime = true;
  updateJSONPreview();

  try {
    const response = await api.getGraphicCards();
    state.runtime = response.data || null;
    state.runtimeError = '';
  } catch (error) {
    state.runtimeError = error.message || '运行环境状态不可用。';
  } finally {
    state.loading.runtime = false;
    if (state.activeModule === 'config') {
      renderView('config');
    } else {
      updateJSONPreview();
    }
  }
};

function setupImportConfig() {
  if (state.importInputBound) {
    return;
  }
  const input = $('#config-file-input');
  if (!input) {
    return;
  }
  state.importInputBound = true;
  input.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      let parsed;
      if (file.name.endsWith('.toml')) {
        parsed = _parseSimpleToml(text);
      } else {
        parsed = JSON.parse(text);
      }
      // ── 旧格式兼容：把 network_args 数组反向映射回独立 UI 字段 ──
      if (Array.isArray(parsed.network_args) && !parsed.lycoris_algo) {
        const argMap = {};
        for (const item of parsed.network_args) {
          const eq = String(item).indexOf('=');
          if (eq > 0) argMap[String(item).slice(0, eq).trim()] = String(item).slice(eq + 1).trim();
        }
        if (argMap.algo) {
          parsed.lycoris_algo = argMap.algo;
          if (!parsed.network_module) parsed.network_module = 'lycoris.kohya';
        }
        if (argMap.conv_dim != null) { const n = Number(argMap.conv_dim); parsed.conv_dim = Number.isNaN(n) ? '' : n; }
        if (argMap.conv_alpha != null) { const n = Number(argMap.conv_alpha); parsed.conv_alpha = Number.isNaN(n) ? '' : n; }
        if (argMap.dropout != null) { const n = Number(argMap.dropout); parsed.dropout = Number.isNaN(n) ? '' : n; }
        if (argMap.train_norm != null) parsed.train_norm = argMap.train_norm === 'True';
        if (argMap.factor != null) { const n = Number(argMap.factor); parsed.lokr_factor = Number.isNaN(n) ? '' : n; }
        if (argMap.dora_wd != null) parsed.dora_wd = argMap.dora_wd === 'True';
        if (argMap.scale_weight_norms != null) { const n = Number(argMap.scale_weight_norms); parsed.scale_weight_norms = Number.isNaN(n) ? '' : n; }
        const structured = new Set(['algo', 'conv_dim', 'conv_alpha', 'dropout', 'train_norm', 'factor', 'dora_wd', 'scale_weight_norms']);
        const remaining = parsed.network_args.filter(a => { const k = String(a).split('=')[0].trim(); return !structured.has(k); });
        if (remaining.length > 0) parsed.network_args_custom = remaining.join('\n');
        delete parsed.network_args;
      }
      // 旧格式：optimizer_args 数组 → 还原 Prodigy 字段
      if (Array.isArray(parsed.optimizer_args) && !parsed.optimizer_args_custom) {
        const remainingArgs = [];
        for (const arg of parsed.optimizer_args) {
          const eqIdx = String(arg).indexOf('=');
          const k = eqIdx > 0 ? String(arg).slice(0, eqIdx).trim() : '';
          const v = eqIdx > 0 ? String(arg).slice(eqIdx + 1).trim() : '';
          if (k === 'd_coef') { parsed.prodigy_d_coef = v; }
          else if (k === 'd0') { parsed.prodigy_d0 = v; }
          else { remainingArgs.push(String(arg)); }
        }
        if (remainingArgs.length > 0) parsed.optimizer_args_custom = remainingArgs.join('\n');
        delete parsed.optimizer_args;
      }
      // 旧格式：lr_scheduler_args 数组 → string
      if (Array.isArray(parsed.lr_scheduler_args)) {
        parsed.lr_scheduler_args = parsed.lr_scheduler_args.join('\n');
      }
      // 自定义调度器类路径 → UI 下拉显示值
      if (typeof parsed.lr_scheduler_type === 'string') {
        const schedulerType = parsed.lr_scheduler_type.trim();
        const bridgedScheduler = SCHEDULER_TYPE_TO_VALUE[schedulerType];
        if (bridgedScheduler) {
          parsed.lr_scheduler = bridgedScheduler;
          delete parsed.lr_scheduler_type;
        }
      }
      // 导入文件时先重置为默认配置，防止旧参数残留
      const importType = parsed.model_train_type || state.activeTrainingType;
      if (importType && importType !== state.activeTrainingType) {
        window.switchTrainingType(importType);
      }
      state.config = createDefaultConfig(state.activeTrainingType);
      mergeConfigPatch(parsed);
      state.hasLocalDraft = true;
      saveDraft();
      renderView(state.activeModule);
      showToast('配置文件已导入。');
    } catch (error) {
      showToast(error.message || '导入配置文件失败。');
    } finally {
      input.value = '';
    }
  });
}

function setupNativePicker() {
  if (state.pickerInputBound) {
    return;
  }
  const input = $('#native-picker-input');
  if (!input) {
    return;
  }
  state.pickerInputBound = true;
  input.addEventListener('change', (event) => {
    const fieldKey = input.dataset.fieldKey;
    const fieldType = input.dataset.fieldType;
    const files = Array.from(event.target.files || []);
    if (!fieldKey || files.length === 0) {
      return;
    }
    let nextValue = '';
    if (fieldType === 'folder') {
      const firstPath = files[0].webkitRelativePath || files[0].name;
      nextValue = firstPath.split('/')[0] || firstPath;
    } else {
      nextValue = files[0].name;
    }
    window.updateConfigValue(fieldKey, nextValue);
    input.value = '';
    delete input.dataset.fieldKey;
    delete input.dataset.fieldType;
  });
}

function renderBuiltinPickerModal() {
  const modal = $('#builtin-picker-modal');
  const title = $('#builtin-picker-title');
  const path = $('#builtin-picker-path');
  const list = $('#builtin-picker-list');
  const footer = document.querySelector('.builtin-picker-footer');
  if (footer) footer.innerHTML = `
    <button class="btn btn-outline btn-sm" type="button" onclick="refreshBuiltinPicker()">🔄 刷新</button>
    <button class="btn btn-outline btn-sm" type="button" onclick="closeBuiltinPicker()">取消</button>
  `;
  if (!modal || !title || !path || !list) {
    return;
  }
  modal.classList.toggle('open', state.builtinPicker.open);
  if (!state.builtinPicker.open) {
    return;
  }
  const pt = state.builtinPicker.pickerType;
  title.textContent = (pt === 'folder' || pt === 'output-folder') ? '请选择目录' : '请选择模型文件';
  path.textContent = state.builtinPicker.rootLabel;
  if (state.builtinPicker.loading) {
    list.innerHTML = `<div class="builtin-picker-empty"><span>⏳ 加载中...</span></div>`;
    return;
  }
  if (!state.builtinPicker.items || !state.builtinPicker.items.length) {
    list.innerHTML = `
      <div class="builtin-picker-empty">
        <span>未检测到内容</span>
      </div>
    `;
    return;
  }
  list.innerHTML = state.builtinPicker.items.map((item) => `
      <button class="builtin-picker-item" type="button" onclick="selectBuiltinPickerItem('${escapeHtml(item)}')">
        <span class="builtin-picker-name">${escapeHtml(item)}</span>
      </button>
    `).join('');
}

window.openNativePicker = (fieldKey, pickerType) => {
  state.builtinPicker = { open: true, fieldKey, pickerType, rootLabel: '', items: [], loading: true };
  renderBuiltinPickerModal();
  api.getBuiltinPicker(pickerType)
    .then((response) => {
      state.builtinPicker = {
        open: true,
        fieldKey,
        pickerType,
        rootLabel: response?.data?.rootLabel || '',
        items: response?.data?.items || [],
        loading: false,
      };
      renderBuiltinPickerModal();
    })
    .catch((error) => {
      state.builtinPicker.open = false;
      renderBuiltinPickerModal();
      showToast(error.message || '打开内置文件选择器失败。');
    });
};

window.closeBuiltinPicker = () => {
  state.builtinPicker.open = false;
  renderBuiltinPickerModal();
};
window.refreshBuiltinPicker = () => {
  if (!state.builtinPicker.open) return;
  const { fieldKey, pickerType } = state.builtinPicker;
  state.builtinPicker.loading = true;
  state.builtinPicker.items = [];
  renderBuiltinPickerModal();
  api.getBuiltinPicker(pickerType)
    .then((response) => {
      state.builtinPicker = {
        open: true, fieldKey, pickerType,
        rootLabel: response?.data?.rootLabel || '',
        items: response?.data?.items || [],
        loading: false,
      };
      renderBuiltinPickerModal();
    })
    .catch(() => {
      state.builtinPicker.loading = false;
      renderBuiltinPickerModal();
      showToast('刷新失败');
    });
};



window.selectBuiltinPickerItem = (item) => {
  const root = state.builtinPicker.rootLabel.replaceAll('\\', '/');
  const fullPath = `${root}/${item}`;
  state.builtinPicker.open = false;
  renderBuiltinPickerModal();
  // 如果是为普通 input 元素选择的（targetInputId 模式）
  if (state.builtinPicker._targetInputId) {
    const input = $(`#${state.builtinPicker._targetInputId}`);
    if (input) {
      input.value = fullPath;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    state.builtinPicker._targetInputId = null;
  } else {
    window.updateConfigValue(state.builtinPicker.fieldKey, fullPath);
    if (state.activeModule === 'config') renderView('config');
  }
};

window.openBuiltinPickerForInput = (inputId, pickerType) => {
  state.builtinPicker = { open: true, fieldKey: '', pickerType, rootLabel: '', items: [], loading: true, _targetInputId: inputId };
  renderBuiltinPickerModal();
  api.getBuiltinPicker(pickerType)
    .then((response) => {
      state.builtinPicker = { ...state.builtinPicker, rootLabel: response?.data?.rootLabel || '', items: response?.data?.items || [], loading: false };
      renderBuiltinPickerModal();
    })
    .catch((error) => { state.builtinPicker.open = false; renderBuiltinPickerModal(); showToast(error.message || '打开内置文件选择器失败。'); });
};

function setupFieldMenus() {
  function closeAllMenus() {
    document.querySelectorAll('.field-menu-dropdown').forEach((m) => m.remove());
    state.activeFieldMenu = null;
  }

  function openMenu(key, anchor) {
    closeAllMenus();
    state.activeFieldMenu = key;
    const field = getFieldDefinition(key);
    if (!field) return;
    const value = state.config[field.key];
    const defaultValue = field.defaultValue ?? '';
    const canUndo = Object.hasOwn(state.fieldUndo, field.key);
    const canReset = String(value ?? '') !== String(defaultValue ?? '');

    const menu = document.createElement('div');
    menu.className = 'field-menu field-menu-dropdown';
    menu.innerHTML = `
      <button class="field-menu-item ${canUndo ? '' : 'disabled'}" type="button" ${canUndo ? '' : 'disabled'}>撤销更改</button>
      <button class="field-menu-item ${canReset ? '' : 'disabled'}" type="button" ${canReset ? '' : 'disabled'}>恢复默认</button>
    `;
    menu.addEventListener('click', (e) => e.stopPropagation());
    const btns = menu.querySelectorAll('.field-menu-item');
    if (canUndo) btns[0].addEventListener('click', () => { closeAllMenus(); window.undoFieldValue(key); });
    if (canReset) btns[1].addEventListener('click', () => { closeAllMenus(); window.resetFieldValue(key); });
    anchor.appendChild(menu);
  }

  document.addEventListener('click', (event) => {
    const toggle = event.target?.closest?.('[data-field-menu-key]');
    if (toggle) {
      event.preventDefault();
      event.stopPropagation();
      const key = toggle.dataset.fieldMenuKey;
      if (state.activeFieldMenu === key) {
        closeAllMenus();
      } else {
        const anchor = toggle.closest('.field-inline-actions');
        if (anchor) openMenu(key, anchor);
      }
      return;
    }
    if (event.target?.closest?.('.field-menu-dropdown')) {
      return;
    }
    if (state.activeFieldMenu) {
      closeAllMenus();
    }
  });
  $('#builtin-picker-close')?.addEventListener('click', window.closeBuiltinPicker);
  $('#builtin-picker-cancel')?.addEventListener('click', window.closeBuiltinPicker);
  $('#builtin-picker-modal')?.addEventListener('click', (event) => {
    if (event.target?.id === 'builtin-picker-modal') {
      window.closeBuiltinPicker();
    }
  });
}

window.switchTrainingType = (typeId) => {
  if (typeId === state.activeTrainingType) return;
  state.activeTrainingType = typeId;
  localStorage.setItem('sd-rescripts:training-type', typeId);
  // 重建配置，保留共用字段的当前值
  const oldConfig = { ...state.config };
  state.config = createDefaultConfig(typeId);
  for (const key of Object.keys(state.config)) {
    if (key === 'model_train_type') continue;
    if (oldConfig[key] !== undefined && oldConfig[key] !== '') {
      state.config[key] = oldConfig[key];
    }
  }
  state.hasLocalDraft = false;
  localStorage.removeItem(DRAFT_STORAGE_KEY);
  resetTransientState();
  saveDraft();
  if (state.activeModule === 'config') {
    renderView('config');
  } else {
    updateJSONPreview();
  }
};


window.resetAllParams = () => {
  state.config = createDefaultConfig(state.activeTrainingType);
  state.hasLocalDraft = false;
  localStorage.removeItem(DRAFT_STORAGE_KEY);
  resetTransientState();
  if (state.activeModule === 'config') {
    renderView('config');
  } else {
    updateJSONPreview();
  }
};


window.saveCurrentParams = () => {
  const defaultName = state.config.output_name || state.config.pretrained_model_name_or_path?.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || '';
  const modal = $('#builtin-picker-modal');
  const title = $('#builtin-picker-title');
  const pathEl = $('#builtin-picker-path');
  const list = $('#builtin-picker-list');
  if (!modal || !title || !pathEl || !list) return;

  title.textContent = '保存当前参数';
  pathEl.textContent = '请输入保存名称，保存后会直接写入本地文件。';
  list.innerHTML = `
    <div class="save-params-form">
      <input type="text" id="save-params-name" class="text-input" value="${escapeHtml(defaultName)}" placeholder="输入参数名称">
      <button class="btn btn-primary btn-sm" type="button" id="save-params-confirm">保存</button>
    </div>
  `;
  modal.classList.add('open');

  const nameInput = $('#save-params-name');
  const confirmBtn = $('#save-params-confirm');
  const submit = async () => {
    const name = nameInput?.value?.trim();
    if (!name) {
      if (pathEl) pathEl.textContent = '请输入保存名称。';
      nameInput?.focus();
      return;
    }
    try {
      // 保存原始 UI 状态（而非 buildRunConfig 转换后的后端 payload），
      // 这样 LyCORIS 算法、日志前缀等 UI 专属字段不会丢失
      const payload = {};
      for (const [k, v] of Object.entries(state.config)) {
        if (v !== '' && v != null) payload[k] = v;
      }
      payload.__training_type__ = state.activeTrainingType;
      await api.saveConfig(name, payload);
      saveDraft();
      state.hasLocalDraft = true;
      modal.classList.remove('open');
      showToast('参数已保存：' + name);
      if (state.activeModule === 'config') {
        renderView('config');
      } else {
        renderNavigator();
      }
    } catch (error) {
      if (pathEl) pathEl.textContent = error.message || '保存失败。';
      if (nameInput) {
        nameInput.style.borderColor = 'var(--danger, #d9534f)';
        nameInput.focus();
        nameInput.select();
      }
    }
  };

  confirmBtn?.addEventListener('click', submit, { once: true });
  nameInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  }, { once: true });
  nameInput?.focus();
  nameInput?.select();
};

window.loadSavedParams = async () => {
  const modal = $('#builtin-picker-modal');
  const title = $('#builtin-picker-title');
  const pathEl = $('#builtin-picker-path');
  const list = $('#builtin-picker-list');
  if (!modal || !title || !pathEl || !list) return;

  title.textContent = '读取已保存参数';
  pathEl.textContent = '选择一个已保存的参数，点击后立即载入。';
  list.innerHTML = '<div class="builtin-picker-empty"><span>加载中...</span></div>';
  const footer = document.querySelector('.builtin-picker-footer');
  if (footer) footer.innerHTML = `<button class="btn btn-outline btn-sm" type="button" id="builtin-picker-cancel" onclick="closeBuiltinPicker()">取消</button>`;
  modal.classList.add('open');

  try {
    const response = await api.listSavedConfigs();
    const configs = response?.data?.configs || [];
    if (!configs.length) {
      list.innerHTML = '<div class="builtin-picker-empty"><span>未检测到内容</span></div>';
      return;
    }
    list.innerHTML = configs.map((configItem) => `
      <div class="builtin-picker-item" type="button">
        <span class="builtin-picker-name">${escapeHtml(configItem.name)}</span>
        <span class="builtin-picker-time">${new Date(configItem.time).toLocaleString('zh-CN')}</span>
        <button class="btn btn-outline btn-sm btn-picker-action" type="button" onclick="previewSavedConfig('${escapeHtml(configItem.name)}')">预览</button>
        <button class="btn btn-outline btn-sm btn-picker-action" type="button" onclick="loadNamedConfig('${escapeHtml(configItem.name)}')">载入</button>
        <button class="btn btn-outline btn-sm btn-picker-action" type="button" onclick="event.stopPropagation(); renameSavedConfig('${escapeHtml(configItem.name)}')">重命名</button>
        <button class="builtin-picker-delete-btn" type="button" title="删除" onclick="event.stopPropagation(); deleteSavedConfig('${escapeHtml(configItem.name)}')">✕</button>
      </div>
    `).join('');
  } catch (error) {
    pathEl.textContent = error.message || '读取列表失败。';
    list.innerHTML = '<div class="builtin-picker-empty"><span>未检测到内容</span></div>';
  }
};

window.loadNamedConfig = async (name) => {
  const pathEl = $('#builtin-picker-path');
  try {
    const response = await api.loadSavedConfig(name);
    const data = response?.data;
    if (!data) {
      throw new Error('参数内容为空。');
    }
    // 自动切换训练类型
    const savedType = data.__training_type__ || data.model_train_type || '';
    delete data.__training_type__;

    // ── 旧格式兼容：把 buildRunConfig 产出的后端字段反向映射回 UI 字段 ──
    // 旧保存格式中 LyCORIS 参数被合并进 network_args 数组，日志/优化器等 UI 字段被删除
    if (Array.isArray(data.network_args) && !data.lycoris_algo) {
      const argMap = {};
      for (const item of data.network_args) {
        const eq = String(item).indexOf('=');
        if (eq > 0) argMap[String(item).slice(0, eq).trim()] = String(item).slice(eq + 1).trim();
      }
      if (argMap.algo) {
        data.lycoris_algo = argMap.algo;
        if (!data.network_module) data.network_module = 'lycoris.kohya';
      }
      if (argMap.conv_dim != null) { const n = Number(argMap.conv_dim); data.conv_dim = Number.isNaN(n) ? '' : n; }
      if (argMap.conv_alpha != null) { const n = Number(argMap.conv_alpha); data.conv_alpha = Number.isNaN(n) ? '' : n; }
      if (argMap.dropout != null) { const n = Number(argMap.dropout); data.dropout = Number.isNaN(n) ? '' : n; }
      if (argMap.train_norm != null) data.train_norm = argMap.train_norm === 'True';
      if (argMap.factor != null) { const n = Number(argMap.factor); data.lokr_factor = Number.isNaN(n) ? '' : n; }
      if (argMap.dora_wd != null) data.dora_wd = argMap.dora_wd === 'True';
      if (argMap.scale_weight_norms != null) { const n = Number(argMap.scale_weight_norms); data.scale_weight_norms = Number.isNaN(n) ? '' : n; }
      // 剩余非结构化的 args 放入 network_args_custom
      const structured = new Set(['algo', 'conv_dim', 'conv_alpha', 'dropout', 'train_norm', 'factor', 'dora_wd', 'scale_weight_norms']);
      const remaining = data.network_args.filter(a => { const k = String(a).split('=')[0].trim(); return !structured.has(k); });
      if (remaining.length > 0) data.network_args_custom = remaining.join('\n');
      delete data.network_args;
    }
    // 旧格式：optimizer_args 数组 → optimizer_args_custom
    if (Array.isArray(data.optimizer_args) && !data.optimizer_args_custom) {
      // Prodigy 特有字段还原
      const prodigyRestore = {};
      const remainingArgs = [];
      for (const arg of data.optimizer_args) {
        const eqIdx = String(arg).indexOf('=');
        const k = eqIdx > 0 ? String(arg).slice(0, eqIdx).trim() : '';
        const v = eqIdx > 0 ? String(arg).slice(eqIdx + 1).trim() : '';
        if (k === 'd_coef') { prodigyRestore.prodigy_d_coef = v; }
        else if (k === 'd0') { prodigyRestore.prodigy_d0 = v; }
        else { remainingArgs.push(String(arg)); }
      }
      if (prodigyRestore.prodigy_d_coef != null) data.prodigy_d_coef = prodigyRestore.prodigy_d_coef;
      if (prodigyRestore.prodigy_d0 != null) data.prodigy_d0 = prodigyRestore.prodigy_d0;
      if (remainingArgs.length > 0) data.optimizer_args_custom = remainingArgs.join('\n');
      delete data.optimizer_args;
    }
    // 旧格式：lr_scheduler_args 数组 → string
    if (Array.isArray(data.lr_scheduler_args)) {
      data.lr_scheduler_args = data.lr_scheduler_args.join('\n');
    }
    // 自定义调度器类路径 → UI 下拉显示值
    if (typeof data.lr_scheduler_type === 'string') {
      const schedulerType = data.lr_scheduler_type.trim();
      const bridgedScheduler = SCHEDULER_TYPE_TO_VALUE[schedulerType];
      if (bridgedScheduler) {
        data.lr_scheduler = bridgedScheduler;
        delete data.lr_scheduler_type;
      }
    }
    // 旧格式：base_weights 数组 → string
    if (Array.isArray(data.base_weights)) {
      data.base_weights = data.base_weights.join('\n');
      if (!data.enable_base_weight) data.enable_base_weight = true;
    }

    if (savedType && savedType !== state.activeTrainingType) {
      const typeExists = TRAINING_TYPES.some((t) => t.id === savedType);
      if (typeExists) {
        state.activeTrainingType = savedType;
        localStorage.setItem('sd-rescripts:training-type', savedType);
        state.config = createDefaultConfig(savedType);
      }
    }
    mergeConfigPatch(data);
    state.hasLocalDraft = true;
    resetTransientState();
    saveDraft();
    window.closeBuiltinPicker();
    showToast(`已载入参数：${name}${savedType ? ` (${savedType})` : ''}`);
    if (state.activeModule === 'config') {
      renderView('config');
    } else {
      renderNavigator();
    }
  } catch (error) {
    if (pathEl) {
      pathEl.textContent = error.message || '读取参数失败。';
    }
  }
};

window.deleteSavedConfig = async (name) => {
  try {
    await api.deleteSavedConfig(name);
    showToast('已删除：' + name);
    window.loadSavedParams();
  } catch (error) {
    showToast(error.message || '删除失败');
  }
};

window.renameSavedConfig = async (oldName) => {
  const title = $('#builtin-picker-title');
  const pathEl = $('#builtin-picker-path');
  const list = $('#builtin-picker-list');
  if (!title || !pathEl || !list) return;

  title.textContent = '重命名参数';
  pathEl.textContent = `当前名称：${oldName}`;
  list.innerHTML = `
    <div style="padding: 16px;">
      <input type="text" id="rename-config-input" value="${escapeHtml(oldName)}"
        style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.88rem;background:var(--bg-main);color:var(--text-main);"
        placeholder="输入新名称" />
    </div>
  `;
  const footer = document.querySelector('.builtin-picker-footer');
  if (footer) footer.innerHTML = `
    <button class="btn btn-outline btn-sm" type="button" onclick="loadSavedParams()">← 返回列表</button>
    <button class="btn btn-primary btn-sm" type="button" id="rename-config-confirm">确认重命名</button>
  `;

  const input = $('#rename-config-input');
  const confirmBtn = $('#rename-config-confirm');

  const doRename = async () => {
    const newName = input?.value?.trim();
    if (!newName) {
      pathEl.textContent = '请输入新名称。';
      input?.focus();
      return;
    }
    if (newName === oldName) {
      window.loadSavedParams();
      return;
    }
    try {
      await api.renameSavedConfig(oldName, newName);
      showToast('已重命名：' + oldName +' → ' + newName);
      window.loadSavedParams();
    } catch (error) {
      pathEl.textContent = error.message || '重命名失败。';
      if (input) {
        input.style.borderColor = 'var(--danger, #d9534f)';
        input.focus();
        input.select();
      }
    }
  };

  confirmBtn?.addEventListener('click', doRename, { once: true });
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      doRename();
    }
  }, { once: true });
  input?.focus();
  input?.select();
};


window.previewSavedConfig = async (name) => {
  const title = $('#builtin-picker-title');
  const pathEl = $('#builtin-picker-path');
  const list = $('#builtin-picker-list');
  if (!title || !pathEl || !list) return;

  title.textContent = `参数预览：${name}`;
  pathEl.textContent = '加载中...';
  list.innerHTML = '<div class="builtin-picker-empty"><span>加载中...</span></div>';
  const footer = document.querySelector('.builtin-picker-footer');
  if (footer) footer.innerHTML = `<button class="btn btn-outline btn-sm" type="button" onclick="loadSavedParams()">← 返回列表</button><button class="btn btn-outline btn-sm" type="button" id="builtin-picker-cancel" onclick="closeBuiltinPicker()">取消</button>`;

  try {
    const response = await api.loadSavedConfig(name);
    const data = response?.data;
    if (!data) throw new Error('参数内容为空。');
    const entries = Object.entries(data);
    pathEl.textContent = `共 ${entries.length} 个参数`;
    list.innerHTML = `
      <div class="params-preview-list">
        ${entries.map(([k, v]) => {
          const display = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
          return `<div class="params-preview-row"><span class="params-key">${escapeHtml(k)}</span><span class="params-val">${escapeHtml(display)}</span></div>`;
        }).join('')}
      </div>
    `;
  } catch (error) {
    pathEl.textContent = error.message || '预览失败。';
  }
};

// ── TOML 序列化 / 反序列化（轻量版，覆盖训练配置的平铺结构） ──
function _tomlValue(v) {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    // TOML 内联数组：[ "a", "b" ]
    return '[ ' + v.map(item => {
      if (typeof item === 'string') return '"' + item.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
      return String(item);
    }).join(', ') + ' ]';
  }
  if (typeof v === 'string') {
    return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
  }
  return String(v);
}

function _configToToml(config) {
  const lines = ['# Generated by LoRA ReScripts UI', '# ' + new Date().toISOString(), ''];
  for (const [key, val] of Object.entries(config)) {
    if (val === undefined || val === null) continue;
    lines.push(key + ' = ' + _tomlValue(val));
  }
  return lines.join('\n') + '\n';
}

function _parseSimpleToml(text) {
  const result = {};
  // 预处理：将多行数组合并为单行，以便逐行解析
  const rawLines = text.split(/\r?\n/);
  const mergedLines = [];
  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];
    // 检测行尾有未闭合的 [ （简单启发式：= [ 但同行没有 ]）
    if (/=\s*\[/.test(line) && !line.includes(']')) {
      while (i + 1 < rawLines.length && !rawLines[i].includes(']')) {
        i++;
        line += ' ' + rawLines[i].trim();
      }
    }
    mergedLines.push(line);
  }
  for (const raw of mergedLines) {
    // Strip comments, but only outside quoted strings.
    // Simple heuristic: if a # appears, check if it's inside a quoted value.
    const commentIdx = raw.indexOf('#');
    const quoteBeforeComment = commentIdx >= 0 ? (raw.slice(0, commentIdx).split('"').length - 1) % 2 : 0;
    const line = (quoteBeforeComment ? raw : (commentIdx >= 0 ? raw.slice(0, commentIdx) : raw)).trim();
    if (!line || line.startsWith('[')) continue; // skip empty, comments, section headers
    const eqIdx = line.indexOf('=');
    if (eqIdx < 1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    // boolean
    if (val === 'true') { result[key] = true; continue; }
    if (val === 'false') { result[key] = false; continue; }
    // array
    if (val.startsWith('[')) {
      // simple inline array parser
      const inner = val.slice(1, val.lastIndexOf(']')).trim();
      if (!inner) { result[key] = []; continue; }
      const items = [];
      // match quoted strings or bare values between commas
      const re = /"((?:[^"\\]|\\.)*)"|([^,"\s]+)/g;
      let m;
      while ((m = re.exec(inner)) !== null) {
        if (m[1] !== undefined) items.push(m[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"'));
        else if (m[2] !== undefined) {
          const n = Number(m[2]);
          items.push(Number.isNaN(n) ? m[2] : n);
        }
      }
      result[key] = items; continue;
    }
    // quoted string
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      result[key] = val.slice(1, -1).replace(/\\\\/g, '\\').replace(/\\"/g, '"').replace(/\\n/g, '\n');
      continue;
    }
    // number
    const num = Number(val);
    if (!Number.isNaN(num) && val !== '') { result[key] = num; continue; }
    // fallback: bare string
    result[key] = val;
  }
  return result;
}


window.downloadConfigFile = () => {
  const config = buildRunConfig(state.config, state.activeTrainingType);
  const tomlStr = _configToToml(config);
  const blob = new Blob([tomlStr], { type: 'application/toml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${state.config.output_name || 'config'}-${timestamp}.toml`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

window.importConfigFile = () => {
  $('#config-file-input')?.click();
};

window.resetFieldValue = (key) => {
  const field = getFieldDefinition(key);
  if (!field) return;
  state.activeFieldMenu = null;
  window.updateConfigValue(key, field.defaultValue ?? '');
  if (state.activeModule === 'config') renderView('config');
};

window.undoFieldValue = (key) => {
  if (!Object.hasOwn(state.fieldUndo, key)) {
    return;
  }
  const previousValue = state.fieldUndo[key];
  delete state.fieldUndo[key];
  state.activeFieldMenu = null;
  const field = getFieldDefinition(key);
  state.config[key] = normalizeDraftValue(field, previousValue);
  syncConfigState();
  if (state.activeModule === 'config') renderView('config');
};

window.updateLayoutWidth = (target, rawValue, persist = true) => {
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
};

function validateConfigConflicts() {
  const c = state.config;
  const tt = state.activeTrainingType;
  const errors = [];
  const warnings = [];
  const isSageEnv = (state.runtime?.runtime?.environment || '').includes('sageattention');
  const toBool = (v) => v === true || v === 'true' || v === 1;
  const toNum = (v) => { const n = Number(v); return Number.isNaN(n) ? 0 : n; };

  // 1. 缓存文本编码器输出 与 标签打乱/丢弃 冲突
  if (toBool(c.cache_text_encoder_outputs)) {
    const conflicts = [];
    if (toBool(c.shuffle_caption)) conflicts.push('随机打乱标签');
    if (toNum(c.caption_dropout_rate) > 0) conflicts.push('全部标签丢弃概率');
    if (toNum(c.caption_tag_dropout_rate) > 0) conflicts.push('按标签丢弃概率');
    if (toNum(c.token_warmup_step) > 0) conflicts.push('Token 预热步数');
    if (conflicts.length > 0) {
      errors.push(`缓存文本编码器输出时不能同时使用「${conflicts.join('」「')}」。请关闭「缓存文本编码器输出」或关闭「${conflicts.join('」「')}」。`);
    }
  }

  // 2. 缓存文本编码器输出 与 训练文本编码器 冲突
  if (toBool(c.cache_text_encoder_outputs) && !toBool(c.network_train_unet_only)) {
    errors.push('训练文本编码器时不能同时启用「缓存文本编码器输出」。请先关闭该缓存或开启「仅训练 U-Net」。');
  }

  // 3. 磁盘缓存暗示内存缓存
  if (toBool(c.cache_text_encoder_outputs_to_disk) && !toBool(c.cache_text_encoder_outputs)) {
    errors.push('「缓存文本编码器输出到磁盘」已开启但「缓存文本编码器输出」未开启。请一并勾选「缓存文本编码器输出」。');
  }

  // 4. 注意力后端全部未开启
  if (!toBool(c.xformers) && !toBool(c.sdpa) && !toBool(c.sageattn) && !toBool(c.flashattn) && !toBool(c.mem_eff_attn)) {
    errors.push('未启用任何注意力加速后端（xformers / SDPA / SageAttention / FlashAttention）。训练将极度缓慢且显存占用极高。请至少开启 SDPA。');
  }


  // 6. xformers + SDPA 同时开启
  if (toBool(c.xformers) && toBool(c.sdpa)) {
    // 不阻断，但给提示（这里不加 error，只在 preflight 里显示 g）
  }

  // 7. 桶划分单位校验
  const bucketStep = toNum(c.bucket_reso_steps) || 64;
  if ((tt.startsWith('sdxl') || tt === 'sdxl-controlnet') && bucketStep % 32 !== 0) {
    errors.push(`SDXL 训练的桶划分单位必须是 32 的倍数，当前值 ${bucketStep} 不符合。`);
  }
  if ((tt.startsWith('sd-') || tt === 'sd-dreambooth') && bucketStep % 64 !== 0) {
    errors.push(`SD1.5 训练的桶划分单位必须是 64 的倍数，当前值 ${bucketStep} 不符合。`);
  }

  // 8. 仅训练 U-Net 和 仅训练文本编码器 同时勾选
  if (toBool(c.network_train_unet_only) && toBool(c.network_train_text_encoder_only)) {
    errors.push('不能同时勾选「仅训练 U-Net」和「仅训练文本编码器」。请只保留其中一个，或两个都不勾（即两者都训练）。');
  }


  // 9. noise_offset 与 multires_noise_iterations 冲突
  if (toNum(c.noise_offset) > 0 && toNum(c.multires_noise_iterations) > 0) {
    errors.push('noise_offset 与 multires_noise_iterations 不能同时使用。请只保留其中一个噪声策略。');
  }

  // 10. full_fp16 与 full_bf16 冲突
  if (toBool(c.full_fp16) && toBool(c.full_bf16)) {
    errors.push('不能同时启用「完全 FP16」和「完全 BF16」。请只保留其中一个。');
  }

  // 11. 学习率为 0 警告
  const effUnetLr = Number(c.unet_lr || c.learning_rate || 0);
  const effTeLr = Number(c.text_encoder_lr || c.learning_rate || 0);
  if (toBool(c.network_train_unet_only) && effUnetLr === 0) {
    warnings.push('当前仅训练 U-Net，但 U-Net 学习率为 0，训练将无效。');
  }
  if (toBool(c.network_train_text_encoder_only) && effTeLr === 0) {
    warnings.push('当前仅训练文本编码器，但文本编码器学习率为 0，训练将无效。');
  }

  // 12. 缓存 latent 到磁盘但未开缓存
  if (toBool(c.cache_latents_to_disk) && !toBool(c.cache_latents)) {
    warnings.push('「缓存 Latent 到磁盘」已开启但「缓存 Latent」未开启。建议一并开启。');
  }

  // 13. blocks_to_swap 与 cpu_offload_checkpointing 冲突（Anima 特有）
  if (toNum(c.blocks_to_swap) > 0 && toBool(c.cpu_offload_checkpointing)) {
    warnings.push('blocks_to_swap 与 cpu_offload_checkpointing 通常不建议同时使用。');
  }

  // 14. Rectified Flow 与 v-parameterization 冲突
  if (toBool(c.flow_model) && toBool(c.v_parameterization)) {
    errors.push('Rectified Flow 不能与「V 参数化」同时开启。请二选一。');
  }

  // 15. 对比 Flow Matching 依赖 Rectified Flow
  if (toBool(c.contrastive_flow_matching) && !toBool(c.flow_model)) {
    errors.push('启用「对比 Flow Matching」前，必须先开启「Rectified Flow」。');
  }

  // 16. RF logit-normal 标准差必须大于 0
  if (toBool(c.flow_model) && String(c.flow_timestep_distribution || 'logit_normal') === 'logit_normal' && toNum(c.flow_logit_std) <= 0) {
    errors.push('RF Logit Std 必须大于 0。');
  }

  // 17. RF 固定偏移比率必须为正数
  if (toBool(c.flow_model) && c.flow_uniform_static_ratio !== '' && c.flow_uniform_static_ratio != null && toNum(c.flow_uniform_static_ratio) <= 0) {
    errors.push('RF 固定偏移比率必须大于 0。');
  }


  return { errors, warnings };
}


window.executeTraining = async () => {
  state.loading.run = true;
  const runConfig = buildRunConfig(state.config, state.activeTrainingType);
  const launchMetadata = buildTaskMetadataFromConfig(runConfig, state.activeTrainingType);
  syncFooterAction();
  resetTrainingMetrics();
  let trainingLaunched = false;
  const clientCheck = validateConfigConflicts();
  if (clientCheck.errors.length > 0) {
    showToast(clientCheck.errors[0]);
    state.preflight = { can_start: false, errors: clientCheck.errors, warnings: clientCheck.warnings };
    state.loading.run = false;
    if (state.activeModule === 'config') renderView('config');
    return;
  }
  // sage 环境警告：不阻断，但弹确认
  if (clientCheck.warnings.length > 0) {
    const proceed = confirm(clientCheck.warnings.join('\n\n') + '\n\n是否继续训练？');
    if (!proceed) {
      state.loading.run = false;
      syncFooterAction();
      return;
    }
  }

  try {
    const preflightResponse = await api.runPreflight(runConfig);
    if (preflightResponse.status !== 'success' || !preflightResponse.data?.can_start) {
      state.preflight = preflightResponse.data || {
        can_start: false,
        errors: [preflightResponse.message || '训练预检阻止了本次训练。'],
        warnings: [],
      };
      showToast('预检未通过，请先修正错误。');
      return;
    }

    state.preflight = preflightResponse.data;
    state._pendingTrainingMetadata = launchMetadata;
    state.activeTrainingTaskId = '';
    const response = await api.runTraining(runConfig);
    if (response.status !== 'success') {
      state._pendingTrainingMetadata = null;
      state.activeTrainingTaskId = '';
      showToast(response.message || '训练启动失败。');
      return;
    }
    trainingLaunched = true;

    state.trainingFailed = false;
    state.lastMessage = response.message || '训练已启动。';
    showToast(state.lastMessage);
    const responseTaskId = response?.data?.task_id || response?.data?.id || '';
    if (responseTaskId) rememberTrainingTaskMetadata(responseTaskId, launchMetadata);

    const tasksResponse = await api.getTasks();
    const freshTasks = tasksResponse?.data?.tasks || [];
    // 为刚启动的新任务注入元数据，后端 dump 只返回 id/status/returncode
    const localHistory = await loadLocalTaskHistory();
    for (const t of freshTasks) {
      // 对 RUNNING 任务且缺少 output_name 的注入元数据（新任务 or 之前漏注入的）
      if (t.status === 'RUNNING') {
        const meta = getPendingTrainingMetadata(t.id) || (!state.activeTrainingTaskId ? launchMetadata : null);
        if (meta) {
          if (!state.activeTrainingTaskId) rememberTrainingTaskMetadata(t.id, meta);
          applyTaskMetadata(t, meta, { force: false });
        }
      }
    }
    state.tasks = mergeTaskHistory(freshTasks, localHistory, state.tasks);
    state._taskHistoryDirty = true;
    await saveLocalTaskHistory();
    await refreshTrainingLog(state.activeTrainingTaskId || responseTaskId);
    startTrainingLogPolling();
    startSysMonitorPolling();
  } catch (error) {
    if (!trainingLaunched) {
      state._pendingTrainingMetadata = null;
      state.activeTrainingTaskId = '';
    }
    showToast(error.message || '训练请求失败。');
  } finally {
    state.loading.run = false;
    if (state.activeModule === 'training') {
      renderView('training');
    } else if (state.activeModule === 'config') {
      renderView('config');
    } else {
      updateJSONPreview();
    }
  }
};

window.applyPreset = (index) => {
  const preset = state.presets[index];
  if (!preset) {
    return;
  }
  mergeConfigPatch(preset);
  state.hasLocalDraft = true;
  resetTransientState();
  saveDraft();
  renderView('config');
};

window.terminateAllTasks = async () => {
  const runningTasks = state.tasks.filter((t) => t.status === 'RUNNING');
  if (!runningTasks.length) {
    showToast('当前没有运行中的任务。');
    return;
  }
  try {
    for (const task of runningTasks) {
      await api.terminateTask(task.task_id || task.id);
    }
    showToast('已发送终止请求。');
    const tasksResponse = await api.getTasks();
    const backendTasks = tasksResponse?.data?.tasks || [];
    const localHistory = await loadLocalTaskHistory();
    state.tasks = mergeTaskHistory(backendTasks, localHistory, state.tasks);
    state._taskHistoryDirty = true;
    await saveLocalTaskHistory();
    syncFooterAction();
    if (state.activeModule === 'config') {
      renderView('config');
    }
  } catch (error) {
    showToast(error.message || '终止任务失败。');
  }
};

// ── 任务历史删除 ──

window.deleteTaskHistory = async (taskId) => {
  try {
    await api.deleteTask(taskId);
    state._deletedTaskIds.add(taskId);
    // 从前端状态中移除
    state.tasks = state.tasks.filter((t) => t.id !== taskId);
    await saveLocalTaskHistory();
    delete state.taskSummaries[taskId];
    try {
      var cache = JSON.parse(sessionStorage.getItem('sd-rescripts:task-summaries') || '{}');
      delete cache[taskId];
      sessionStorage.setItem('sd-rescripts:task-summaries', JSON.stringify(cache));
    } catch (e) { /* ignore */ }
    // 刷新界面
    if (state.activeModule === 'training') {
      renderView('training');
    }
    renderTaskStatus();
  } catch (error) {
    showToast(error.message || '删除任务失败。');
  }
};

window.clearAllTaskHistory = async () => {
  if (!confirm('确认清空所有已完成的任务历史？\n（正在运行的任务不会被删除）')) return;
  try {
    const resp = await api.deleteAllTasks();
    showToast('已清空 ' + (resp?.data?.deleted || 0) + ' 条任务记录');
    // 重新拉取任务列表
    const tasksResponse = await api.getTasks();
    // 把所有非运行中的任务加入黑名单，防止轮询又拉回来
    const allBackendTasks = tasksResponse?.data?.tasks || [];
    for (const t of allBackendTasks) { if (t.status !== 'RUNNING') state._deletedTaskIds.add(t.id); }
    state.tasks = allBackendTasks.filter(t => !state._deletedTaskIds.has(t.id));
    try { await fetch('/api/local/task_history', { method: 'DELETE' }); } catch (e) {}
    state.taskSummaries = {};
    try { sessionStorage.removeItem('sd-rescripts:task-summaries'); } catch (e) {}
    if (state.activeModule === 'training') {
      renderView('training');
    }
    renderTaskStatus();
  } catch (error) {
    showToast(error.message || '清空历史失败。');
  }
};



/* ── Topbar Config Search ── */
function setupTopbarSearch() {
  const input = $('#topbar-search-input');
  const dropdown = $('#topbar-search-dropdown');
  if (!input || !dropdown) return;

  let _searchTimer = null;

  input.addEventListener('input', () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      const query = input.value.trim().toLowerCase();
      if (!query || query.length < 1) {
        dropdown.classList.remove('open');
        dropdown.innerHTML = '';
        return;
      }
      const results = _searchConfigFields(query);
      if (results.length === 0) {
        dropdown.innerHTML = '<div class="topbar-search-empty">未找到匹配的配置项</div>';
        dropdown.classList.add('open');
        return;
      }
      dropdown.innerHTML = results.slice(0, 20).map((r) => {
        const highlightedLabel = _highlightMatch(r.field.label, query);
        const tabLabel = UI_TABS.find((t) => t.key === r.tab)?.label || r.tab;
        return '<div class="topbar-search-item" onclick="jumpToConfigField(\'' + escapeHtml(r.tab) + '\', \'' + escapeHtml(r.sectionId) + '\', \'' + escapeHtml(r.field.key) + '\')">' +
          '<span class="topbar-search-item-label">' + highlightedLabel + '</span>' +
          '<span class="topbar-search-item-meta">' +
          '<span class="search-tab-tag">' + escapeHtml(tabLabel) + '</span>' +
          '<span>' + escapeHtml(r.sectionTitle) + '</span>' +
          '<span style="opacity:0.4;font-family:monospace;">' + escapeHtml(r.field.key) + '</span>' +
          '</span></div>';
      }).join('');
      dropdown.classList.add('open');
    }, 150);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim() && dropdown.innerHTML) {
      dropdown.classList.add('open');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#topbar-search')) {
      dropdown.classList.remove('open');
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropdown.classList.remove('open');
      input.blur();
    }
  });
}

function _searchConfigFields(query) {
  const tt = state.activeTrainingType;
  const sections = getSectionsForType(tt);
  const results = [];
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.type === 'hidden') continue;
      const matchLabel = (field.label || '').toLowerCase().includes(query);
      const matchKey = (field.key || '').toLowerCase().includes(query);
      const matchDesc = (field.desc || '').toLowerCase().includes(query);
      if (matchLabel || matchKey || matchDesc) {
        results.push({
          field,
          tab: section.tab,
          sectionId: section.id,
          sectionTitle: section.title,
          score: matchLabel ? 3 : (matchKey ? 2 : 1),
        });
      }
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

function _highlightMatch(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('(' + escapedQuery + ')', 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}

window.jumpToConfigField = function(tab, sectionId, fieldKey) {
  const dropdown = $('#topbar-search-dropdown');
  if (dropdown) dropdown.classList.remove('open');

  if (state.activeModule !== 'config') {
    state.activeModule = 'config';
    $$('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.module === 'config');
    });
  }
  state.activeTab = tab;
  localStorage.setItem('sdxl_ui_tab', tab);
  renderView('config');

  requestAnimationFrame(() => {
    const fieldEl = document.querySelector('.config-group[data-field-key="' + fieldKey + '"]');
    if (fieldEl) {
      fieldEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      fieldEl.classList.add('field-search-highlight');
      setTimeout(() => fieldEl.classList.remove('field-search-highlight'), 2000);
    } else {
      const sectionEl = document.getElementById(sectionId);
      if (sectionEl) {
        sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });
};



document.addEventListener('DOMContentLoaded', init);
