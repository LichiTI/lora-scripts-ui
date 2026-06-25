import { readDraftFromStorage, writeDraftToStorage } from './storage.js';

export function migrateLegacyDraftConfig(config) {
  if (!config || typeof config !== 'object') return config;
  const patch = {};
  const outputName = String(config.output_name ?? '').trim();
  if (outputName === 'aki' || outputName === 'aki_') {
    patch.output_name = 'lulynx_';
  }
  const trainDataDir = String(config.train_data_dir ?? '').replaceAll('\\', '/').replace(/\/+$/, '').trim();
  if (trainDataDir === './train/aki' || trainDataDir === 'train/aki') {
    patch.train_data_dir = './output/lulynx';
  }
  if (Object.keys(patch).length === 0) return config;
  return { ...config, ...patch };
}

export function createAppBootstrap({
  state,
  api,
  mergeConfigPatch,
  applyBackendConfigOptions,
  updateJSONPreview,
  renderView,
  loadLocalTaskHistory,
  mergeTaskHistory,
}) {
  function loadDraft() {
    const parsed = readDraftFromStorage();
    if (!parsed) return;
    mergeConfigPatch(migrateLegacyDraftConfig(parsed));
    state.hasLocalDraft = true;
  }

  function saveDraft() {
    writeDraftToStorage(state.config);
  }

  async function loadBootstrapData() {
    state.loading.runtime = true;
    updateJSONPreview();

    const startTime = Date.now();
    console.log('[DEBUG appBootstrap] Starting loadBootstrapData...');

    const timers = {};
    const timedFetch = (name, promise) => {
      const start = Date.now();
      return promise.finally(() => {
        timers[name] = Date.now() - start;
      });
    };

    const [
      runtimeResult,
      presetsResult,
      savedParamsResult,
      tasksResult,
      interrogatorsResult,
      configOptionsResult,
      executionProfilesResult,
    ] = await Promise.allSettled([
      timedFetch('getGraphicCards', api.getGraphicCards()),
      timedFetch('getPresets', api.getPresets()),
      timedFetch('getSavedParams', api.getSavedParams()),
      timedFetch('getTasks', api.getTasks()),
      timedFetch('getInterrogators', api.getInterrogators()),
      timedFetch('getConfigOptions', api.getConfigOptions()),
      timedFetch('getExecutionProfiles', api.getExecutionProfiles()),
    ]);

    const totalTime = Date.now() - startTime;
    console.log('[DEBUG appBootstrap] API timings:', timers);
    console.log('[DEBUG appBootstrap] Total loadBootstrapData time:', totalTime, 'ms');

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
      mergeConfigPatch(migrateLegacyDraftConfig(savedParamsResult.value.data || {}));
      saveDraft();
    }

    if (tasksResult.status === 'fulfilled') {
      const backendTasks = tasksResult.value?.data?.tasks || [];
      const localHistory = await loadLocalTaskHistory();
      state.tasks = mergeTaskHistory(backendTasks, localHistory, state.tasks);
      state._taskHistoryDirty = true;
      for (const task of state.tasks) {
        if (task.status === 'FINISHED' && task._summary && task._summary._v >= 2) {
          state.taskSummaries[task.id] = task._summary;
        }
      }
    }

    if (interrogatorsResult.status === 'fulfilled') {
      state.interrogators = interrogatorsResult.value?.data || null;
    }

    if (configOptionsResult.status === 'fulfilled') {
      state.backendConfigOptions = configOptionsResult.value?.data || null;
      applyBackendConfigOptions(state.backendConfigOptions);
    }

    if (executionProfilesResult.status === 'fulfilled') {
      state.executionProfiles = executionProfilesResult.value?.data?.profiles || [];
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
      const [optionsResp, profilesResp] = await Promise.allSettled([
        api.getConfigOptions(),
        api.getExecutionProfiles(),
      ]);
      if (optionsResp.status === 'fulfilled') {
        state.backendConfigOptions = optionsResp.value?.data || null;
        applyBackendConfigOptions(state.backendConfigOptions);
      }
      if (profilesResp.status === 'fulfilled') {
        state.executionProfiles = profilesResp.value?.data?.profiles || [];
      }
      if (state.activeModule === 'config') renderView('config');
    } catch (_e) {
      // Keep bootstrap refresh best-effort; visible backend-offline state is handled by heartbeat.
    }
  }

  return {
    loadDraft,
    saveDraft,
    loadBootstrapData,
    refreshBackendConfigOptions,
  };
}
