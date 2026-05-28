// actions/runtimeActions.js — 训练预检 + 运行环境刷新 actions
//   runPreflight / refreshRuntime / applyTrainingAdvisorPatch / runPcieTransferBenchmark
//
// 依赖（工厂注入）：state, api, showToast, renderView, updateJSONPreview, buildRunConfig, mergeConfigPatch, saveDraft

export function createRuntimeActions({ state, api, showToast, renderView, updateJSONPreview, buildRunConfig, mergeConfigPatch, saveDraft }) {
  function _cloneBenchmarkParams(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) return {};
    return { ...options };
  }

  function _defaultBenchmarkParams(options = {}) {
    const requested = _cloneBenchmarkParams(options);
    const precision = String(state.config?.mixed_precision || '').toLowerCase();
    if (!requested.compute_dtype) {
      requested.compute_dtype = precision.includes('bf16') ? 'bf16' : (precision.includes('fp32') ? 'fp32' : 'fp16');
    }
    if (requested.no_matmul == null) requested.no_matmul = true;
    if (requested.iters == null) requested.iters = 18;
    if (requested.warmup == null) requested.warmup = 4;
    if (requested.pack_iters == null) requested.pack_iters = 2;
    if (requested.batch == null) {
      requested.batch = Math.max(1, Number(state.config?.train_batch_size || 16) || 16);
    }
    if (requested.shapes == null && requested.rows == null && requested.cols == null) {
      requested.shapes = ['4096x4096'];
    }
    return requested;
  }

  function _normalizeBenchmarkPayload(payload, requestedParams = {}) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const benchmark = source.benchmark || source.pcie_transfer_benchmark
      || ((Array.isArray(source.cases) || Array.isArray(source.formats)) ? source : null);
    const experiment = source.experiment || source.pcie_transfer_format_experiment || source.plan || null;
    const tensorcoreTransferKernel = source.tensorcore_transfer_kernel || null;
    const tensorcoreDecodeBenchmark = source.tensorcore_decode_benchmark || null;
    const tensorcoreDecodeBenchmarkError = source.tensorcore_decode_benchmark_error || '';
    const requested = _cloneBenchmarkParams(requestedParams);

    return {
      benchmark,
      experiment,
      tensorcore_transfer_kernel: tensorcoreTransferKernel,
      tensorcore_decode_benchmark: tensorcoreDecodeBenchmark,
      tensorcore_decode_benchmark_error: tensorcoreDecodeBenchmarkError,
      availability: source.availability || benchmark?.availability || null,
      requested_params: requested,
      updated_at: new Date().toISOString(),
      raw: source,
      error: '',
    };
  }

  function _getPersistedBenchmarkSnapshot() {
    const topLevel = state.pcieTransferBenchmark && typeof state.pcieTransferBenchmark === 'object'
      ? state.pcieTransferBenchmark
      : null;
    const preflight = state.preflight && typeof state.preflight === 'object' ? state.preflight : null;

    if (topLevel) return topLevel;
    if (!preflight) return null;

    const hasPreflightBenchmark = !!(
      preflight.pcie_transfer_benchmark
      || preflight.pcie_transfer_format_experiment
      || preflight.tensorcore_transfer_kernel
      || preflight.tensorcore_decode_benchmark
      || preflight.tensorcore_decode_benchmark_error
      || preflight.pcie_transfer_benchmark_error
    );
    if (!hasPreflightBenchmark) return null;

    return {
      benchmark: preflight.pcie_transfer_benchmark || null,
      experiment: preflight.pcie_transfer_format_experiment || null,
      tensorcore_transfer_kernel: preflight.tensorcore_transfer_kernel || null,
      tensorcore_decode_benchmark: preflight.tensorcore_decode_benchmark || null,
      tensorcore_decode_benchmark_error: preflight.tensorcore_decode_benchmark_error || '',
      requested_params: preflight.pcie_transfer_benchmark_requested_params || {},
      updated_at: preflight.pcie_transfer_benchmark_updated_at || '',
      error: preflight.pcie_transfer_benchmark_error || '',
      raw: null,
    };
  }

  function _writeBenchmarkIntoPreflight(snapshot) {
    if (!state.preflight || typeof state.preflight !== 'object') return;
    const nextPreflight = { ...state.preflight };

    if (snapshot?.benchmark) nextPreflight.pcie_transfer_benchmark = snapshot.benchmark;
    if (snapshot?.experiment) nextPreflight.pcie_transfer_format_experiment = snapshot.experiment;
    if (snapshot?.tensorcore_transfer_kernel) nextPreflight.tensorcore_transfer_kernel = snapshot.tensorcore_transfer_kernel;
    if (snapshot?.tensorcore_decode_benchmark) nextPreflight.tensorcore_decode_benchmark = snapshot.tensorcore_decode_benchmark;
    nextPreflight.tensorcore_decode_benchmark_error = snapshot?.tensorcore_decode_benchmark_error || '';
    nextPreflight.pcie_transfer_benchmark_error = snapshot?.error || '';
    nextPreflight.pcie_transfer_benchmark_updated_at = snapshot?.updated_at || '';
    nextPreflight.pcie_transfer_benchmark_requested_params = snapshot?.requested_params || {};

    state.preflight = nextPreflight;
  }

  function _mergePreflightWithBenchmark(preflightData) {
    const nextPreflight = preflightData && typeof preflightData === 'object' ? { ...preflightData } : {};
    const snapshot = _getPersistedBenchmarkSnapshot();
    if (!snapshot) return nextPreflight;

    if (snapshot.benchmark) nextPreflight.pcie_transfer_benchmark = snapshot.benchmark;
    if (snapshot.experiment) nextPreflight.pcie_transfer_format_experiment = snapshot.experiment;
    if (snapshot.tensorcore_transfer_kernel) nextPreflight.tensorcore_transfer_kernel = snapshot.tensorcore_transfer_kernel;
    if (snapshot.tensorcore_decode_benchmark) nextPreflight.tensorcore_decode_benchmark = snapshot.tensorcore_decode_benchmark;
    if (snapshot.tensorcore_decode_benchmark_error) nextPreflight.tensorcore_decode_benchmark_error = snapshot.tensorcore_decode_benchmark_error;
    if (snapshot.error) nextPreflight.pcie_transfer_benchmark_error = snapshot.error;
    if (snapshot.updated_at) nextPreflight.pcie_transfer_benchmark_updated_at = snapshot.updated_at;
    if (snapshot.requested_params) nextPreflight.pcie_transfer_benchmark_requested_params = snapshot.requested_params;
    return nextPreflight;
  }

  function _setBenchmarkError(message, requestedParams = {}) {
    const previous = _getPersistedBenchmarkSnapshot() || {};
    const next = {
      ...previous,
      requested_params: Object.keys(_cloneBenchmarkParams(requestedParams)).length
        ? _cloneBenchmarkParams(requestedParams)
        : (previous.requested_params || {}),
      updated_at: new Date().toISOString(),
      error: message || 'PCIe 传输格式 benchmark 失败。',
    };
    state.pcieTransferBenchmark = next;
    state.pcieTransferBenchmarkError = next.error;
    _writeBenchmarkIntoPreflight(next);
    return next;
  }

  function _finishRuntimeRender(focusPreflight = false) {
    if (state.activeModule === 'config') {
      renderView('config');
    } else if (state.activeModule === 'training') {
      if (focusPreflight) state.trainSubTab = 'preflight';
      renderView('training');
    } else {
      updateJSONPreview();
    }
  }

  async function runPreflight() {
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
        state.preflight = _mergePreflightWithBenchmark(preflightRes.value.data);
      } else {
        state.preflight = _mergePreflightWithBenchmark({
          can_start: false,
          errors: [preflightRes.reason?.message || preflightRes.value?.message || '训练预检失败。'],
          warnings: [],
        });
      }
      showToast('训练预检完成');
    } catch (error) {

      state.preflight = _mergePreflightWithBenchmark({
        can_start: false,
        errors: [error.message || '训练预检失败。'],
        warnings: [],
      });
      showToast(error.message || '训练预检失败');
    } finally {
      state.loading.preflight = false;
      _finishRuntimeRender(true);
    }
  }

  function _collectAdvisorPatch() {
    const advisor = state.preflight?.training_advisor || {};
    const vramPatch = advisor.vram?.recommended_config_patch || {};
    const aTierPatch = advisor.a_tier?.recommended_config_patch || {};
    const patch = { ...vramPatch, ...aTierPatch };
    Object.keys(patch).forEach((key) => {
      if (key.startsWith('__') || patch[key] === undefined) delete patch[key];
    });
    return patch;
  }

  function applyTrainingAdvisorPatch() {
    const patch = _collectAdvisorPatch();
    const keys = Object.keys(patch);
    if (!keys.length) {
      showToast('当前 Advisor 没有可应用的配置建议。');
      return;
    }
    const preview = keys.slice(0, 8).join(', ') + (keys.length > 8 ? '...' : '');
    const ok = window.confirm('应用 Advisor 建议到当前配置草稿？\n\n将修改: ' + preview + '\n\n不会自动开始训练，建议应用后重新运行预检。');
    if (!ok) return;
    mergeConfigPatch(patch);
    state.hasLocalDraft = true;
    saveDraft();
    state.preflight = null;
    updateJSONPreview();
    showToast('已应用 Advisor 建议，请重新运行训练预检。');
    if (state.activeModule === 'config') {
      renderView('config');
    } else if (state.activeModule === 'training') {
      state.trainSubTab = 'preflight';
      renderView('training');
    }
  }

  async function refreshRuntime() {
    state.loading.runtime = true;
    updateJSONPreview();

    try {
      const response = await api.getGraphicCards();
      state.runtime = response.data || null;
      state.runtimeError = '';
    } catch (error) {
      state.runtimeError =error.message || '运行环境状态不可用。';
    } finally {
      state.loading.runtime = false;
      _finishRuntimeRender(false);
    }
  }

  async function runPcieTransferBenchmark(options = {}) {
    if (state.loading.pcieTransferBenchmark) {
      showToast('PCIe 传输格式 benchmark 正在运行，请稍候。');
      return state.pcieTransferBenchmark;
    }

    const requestedParams = _defaultBenchmarkParams(options);
    state.loading.pcieTransferBenchmark = true;
    state.pcieTransferBenchmarkError = '';
    updateJSONPreview();
    showToast('正在执行 PCIe 传输格式 benchmark...');

    try {
      const response = await api.runPcieTransferBenchmark(requestedParams);
      const snapshot = _normalizeBenchmarkPayload(response?.data || response || {}, requestedParams);
      state.pcieTransferBenchmark = snapshot;
      state.pcieTransferBenchmarkError = '';
      _writeBenchmarkIntoPreflight(snapshot);
      showToast('PCIe 传输格式 benchmark 已完成。');
      return snapshot;
    } catch (error) {
      const message = error?.message || 'PCIe 传输格式 benchmark 失败。';
      _setBenchmarkError(message, requestedParams);
      showToast(message);
      return null;
    } finally {
      state.loading.pcieTransferBenchmark = false;
      _finishRuntimeRender(true);
    }
  }

  return { runPreflight, refreshRuntime, applyTrainingAdvisorPatch, runPcieTransferBenchmark };
}
