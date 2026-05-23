// actions/runtimeActions.js — 训练预检 + 运行环境刷新 actions
//   runPreflight / refreshRuntime / applyTrainingAdvisorPatch
//
// 依赖（工厂注入）：state, api, showToast, renderView, updateJSONPreview, buildRunConfig, mergeConfigPatch, saveDraft

export function createRuntimeActions({ state, api, showToast, renderView, updateJSONPreview, buildRunConfig, mergeConfigPatch, saveDraft }) {
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
      if (state.activeModule === 'config') {
       renderView('config');
      } else {
        updateJSONPreview();
      }
    }
  }

  return { runPreflight, refreshRuntime, applyTrainingAdvisorPatch};
}
