import assert from 'node:assert/strict';
import { createRuntimeActions } from '../src/actions/runtimeActions.js';

const calls = [];
const state = {
  activeModule: 'training',
  trainSubTab: 'preflight',
  hasLocalDraft: false,
  config: {},
  loading: { preflight: false, runtime: false },
  preflight: {
    training_advisor: {
      vram: {
        recommended_config_patch: {
          gradient_checkpointing: true,
          module_offload_enabled: true,
        },
      },
      a_tier: {
        recommended_config_patch: {
          smart_rank_enabled: false,
          __internal: 'skip',
        },
      },
    },
  },
};

globalThis.window = {
  confirm: () => true,
};

const actions = createRuntimeActions({
  state,
  api: {},
  showToast: (message) => calls.push(['toast', message]),
  renderView: (view) => calls.push(['render', view]),
  updateJSONPreview: () => calls.push(['json']),
  buildRunConfig: (config) => config,
  mergeConfigPatch: (patch) => {
    calls.push(['patch', { ...patch }]);
    Object.assign(state.config, patch);
  },
  saveDraft: () => calls.push(['save']),
});

actions.applyTrainingAdvisorPatch();
assert.equal(state.config.gradient_checkpointing, true);
assert.equal(state.config.module_offload_enabled, true);
assert.equal(state.config.smart_rank_enabled, false);
assert.equal(Object.hasOwn(state.config, '__internal'), false);
assert.equal(state.hasLocalDraft, true);
assert.equal(state.preflight, null);
assert.deepEqual(calls.find((item) => item[0] === 'render'), ['render', 'training']);

state.preflight = { training_advisor: { vram: { recommended_config_patch: { x: 1 } }, a_tier: {} } };
window.confirm = () => false;
actions.applyTrainingAdvisorPatch();
assert.notEqual(state.preflight, null);
assert.equal(state.config.x, undefined);

state.preflight = { training_advisor: { vram: {}, a_tier: {} } };
window.confirm = () => true;
actions.applyTrainingAdvisorPatch();
assert.ok(calls.some((item) => item[0] === 'toast' && String(item[1]).includes('没有可应用')));

console.log('advisorPatchSmoke: ok');