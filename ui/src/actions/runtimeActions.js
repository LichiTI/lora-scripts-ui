// actions/runtimeActions.js — 训练预检 + 运行环境刷新 actions
//   runPreflight / refreshRuntime
//
// 依赖（工厂注入）：state, api, showToast, renderView, updateJSONPreview, buildRunConfig

export function createRuntimeActions({ state, api, showToast, renderView, updateJSONPreview, buildRunConfig }) {
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

  return { runPreflight, refreshRuntime};
}
