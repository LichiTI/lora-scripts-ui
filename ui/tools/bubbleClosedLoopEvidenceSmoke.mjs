import assert from 'node:assert/strict';
import { createTrainingActions } from '../src/actions/trainingActions.js';
import { createTrainingRenderer } from '../src/renderers/training.js';
import {
  attachBubbleClosedLoopActionHistory,
  collectBubbleClosedLoopActionHistoryFromTasks,
  getBubbleClosedLoopHistoryBucket,
  normalizeBubbleClosedLoopState,
  renderBubbleClosedLoopBadge,
  renderBubbleClosedLoopCard,
  shouldCarryBubbleClosedLoopActionHistory,
} from '../src/utils/bubbleClosedLoopEvidence.js';
import { renderSummaryCard } from '../src/utils/trainingMetrics.js';

const closedLoop = {
  report: 'bubble_runtime_closed_loop_state_v0',
  status: 'rolled_back',
  mode: 'auto_apply',
  action_history_count: 1,
  latest_action: {
    action_id: 'bubble-runtime-smoke',
    status: 'rolled_back',
    domain: 'host_scheduling',
    action_kind: 'disable_sync_profiler_mode',
    applied_step: 8,
    cooldown_until_step: 16,
    closed_step: 16,
    applied_overlay: {
      step_phase_profile_enabled: false,
      data_transfer_profile_mode: 'event',
    },
    rollback_restore: {
      step_phase_profile_enabled: true,
      data_transfer_profile_mode: 'sync',
    },
    evaluation: {
      steady_samples_per_second_gain_pct: -10,
      before: { steady_samples_per_second: 10, active_gpu_util_pct_mean: 35, host_gap_share: 0.15 },
      after: { steady_samples_per_second: 9, active_gpu_util_pct_mean: 32, host_gap_share: 0.14 },
    },
  },
};

const normalized = normalizeBubbleClosedLoopState(closedLoop);
assert.equal(normalized.status, 'rolled_back');
assert.equal(normalized.label, '已回滚');
assert.equal(normalized.gainPct, -10);
assert.equal(getBubbleClosedLoopHistoryBucket(closedLoop), 'rollback');

const badge = renderBubbleClosedLoopBadge(closedLoop);
assert.match(badge, /Bubble Auto/);
assert.match(badge, /已回滚/);
assert.match(badge, /-10\.0%/);

const card = renderBubbleClosedLoopCard(closedLoop);
assert.match(card, /Bubble 在线闭环/);
assert.match(card, /host_scheduling \/ disable_sync_profiler_mode/);
assert.match(card, /step_phase_profile_enabled/);

const summaryHtml = renderSummaryCard({
  _v: 2,
  avgSpeed: 1.2,
  speedColor: 'var(--success)',
  speedRating: '正常',
  firstLoss: 0.5,
  lastLoss: 0.4,
  minLoss: 0.4,
  lossColor: 'var(--success)',
  lossTrend: '下降',
  lossDetail: 'ok',
  lossLevelColor: 'var(--success)',
  lossLevelTag: '正常',
  epochDone: 1,
  epochTotal: 1,
  lastStep: 16,
  totalSteps: 16,
  elapsedStr: '—',
  sampleCount: 4,
  overallColor: 'var(--success)',
  overallRating: 'ok',
}, { bubbleClosedLoopState: closedLoop });

assert.match(summaryHtml, /Bubble 在线闭环/);
assert.match(summaryHtml, /steady samples\/s/);

const actionHistory = collectBubbleClosedLoopActionHistoryFromTasks([
  {
    id: 'recent-run',
    status: 'FINISHED',
    metadata: { bubble_closed_loop_state: closedLoop },
  },
  {
    id: 'older-run',
    status: 'FINISHED',
    _summary: {
      bubbleClosedLoopState: {
        ...closedLoop,
        latest_action: {
          ...closedLoop.latest_action,
          action_id: 'bubble-runtime-kept',
          status: 'kept',
        },
      },
    },
  },
], {}, 3);
assert.equal(actionHistory.length, 1);
assert.equal(actionHistory[0].action_id, 'bubble-runtime-smoke');
assert.equal(actionHistory[0].status, 'rolled_back');
assert.equal(actionHistory[0].source_task_id, 'recent-run');
assert.equal(actionHistory[0].evaluation.steady_samples_per_second_gain_pct, -10);

assert.equal(shouldCarryBubbleClosedLoopActionHistory({ bubble_controller_mode: 'auto_apply' }), true);
assert.equal(shouldCarryBubbleClosedLoopActionHistory({ bubble_controller_mode: 'advisor_patch' }), false);

const autoApplyRequest = { bubble_controller_mode: 'auto_apply' };
const attached = attachBubbleClosedLoopActionHistory(autoApplyRequest, [
  { id: 'recent-run', metadata: { bubble_closed_loop_state: closedLoop } },
], {}, 3);
assert.equal(attached.length, 1);
assert.equal(autoApplyRequest.bubble_closed_loop_action_history[0].action_id, 'bubble-runtime-smoke');
assert.equal(autoApplyRequest.bubble_closed_loop_cross_run_cooldown_runs, 1);

const reportOnlyRequest = { bubble_controller_mode: 'report_only' };
assert.deepEqual(attachBubbleClosedLoopActionHistory(reportOnlyRequest, [
  { id: 'recent-run', metadata: { bubble_closed_loop_state: closedLoop } },
], {}, 3), []);
assert.equal(reportOnlyRequest.bubble_closed_loop_action_history, undefined);

globalThis.document = { querySelectorAll: () => [] };
globalThis.confirm = () => true;

let launchedRequest = null;
const trainingState = {
  activeTrainingType: 'sdxl-lora',
  activeModule: 'config',
  trainSubTab: 'monitor',
  loading: { run: false },
  runtime: null,
  config: {
    sdpa: true,
    bubble_controller_mode: 'auto_apply',
    network_train_unet_only: true,
    learning_rate: 0.0001,
    unet_lr: 0.0001,
  },
  tasks: [
    { id: 'recent-run', status: 'FINISHED', metadata: { bubble_closed_loop_state: closedLoop } },
  ],
  taskSummaries: {},
  preflight: null,
  _pendingTrainingMetadata: null,
  activeTrainingTaskId: '',
  trainingFailed: false,
  lastMessage: '',
};

const trainingActions = createTrainingActions({
  state: trainingState,
  api: {
    runPreflight: async () => ({ status: 'success', data: { can_start: true, errors: [], warnings: [] } }),
    runTraining: async (config) => {
      launchedRequest = config;
      return { status: 'success', data: { task_id: 'next-run', status: 'RUNNING' }, message: '' };
    },
    getTasks: async () => ({ data: { tasks: [] } }),
  },
  showToast: () => {},
  renderView: () => {},
  updateJSONPreview: () => {},
  syncFooterAction: () => {},
  buildRunConfig: (config, typeId) => ({ ...config, model_train_type: typeId }),
  buildTaskMetadataFromConfig: () => ({}),
  resetTrainingMetrics: () => {},
  rememberTrainingTaskMetadata: () => {},
  getPendingTrainingMetadata: () => null,
  applyTaskMetadata: () => {},
  loadLocalTaskHistory: async () => [],
  saveLocalTaskHistory: async () => {},
  mergeTaskHistory: () => [],
  refreshTrainingLog: async () => {},
  startTrainingLogPolling: () => {},
  startSysMonitorPolling: () => {},
});

await trainingActions.executeTraining();
assert.equal(launchedRequest.bubble_closed_loop_action_history.length, 1);
assert.equal(launchedRequest.bubble_closed_loop_action_history[0].action_id, 'bubble-runtime-smoke');
assert.equal(launchedRequest.bubble_closed_loop_cross_run_cooldown_runs, 1);

const keptClosedLoop = {
  ...closedLoop,
  status: 'kept',
  latest_action: {
    ...closedLoop.latest_action,
    action_id: 'bubble-runtime-kept',
    status: 'kept',
    evaluation: {
      ...closedLoop.latest_action.evaluation,
      steady_samples_per_second_gain_pct: 5,
    },
  },
};
assert.equal(getBubbleClosedLoopHistoryBucket(keptClosedLoop), 'kept');

const renderState = {
  activeModule: 'training',
  trainSubTab: 'monitor',
  bubbleClosedLoopHistoryFilter: 'rollback',
  tasks: [
    { id: 'kept-run', status: 'FINISHED', output_name: 'kept-task', metadata: { bubble_closed_loop_state: keptClosedLoop } },
    { id: 'rolled-run', status: 'FINISHED', output_name: 'rolled-task', metadata: { bubble_closed_loop_state: closedLoop } },
  ],
  taskSummaries: {},
  trainingSummary: null,
  trainingLogSnapshot: {},
  trainingFailed: false,
  activeTrainingTaskId: '',
  runtime: null,
  preflight: null,
  pcieTransferBenchmark: null,
  config: {},
  trainingMetrics: {
    speeds: [],
    losses: [],
    epochs: [],
    bTier: null,
    memoryOptimization: null,
    nativeUnet: null,
    peakVramDiagnostics: null,
    cudaCacheRelease: null,
    pcieDeltaCache: null,
    pcieCacheV0: null,
    pcieCacheV0Recommendation: null,
    vramSmartSensingRuntime: null,
    compileRuntime: null,
    lastStep: 0,
    totalSteps: 0,
  },
};
const renderer = createTrainingRenderer({
  state: renderState,
  renderSlot: () => '',
  deps: {
    renderPreflightPanel: () => '',
    renderSamplesPanel: () => '',
    _buildSysMonitorHTML: () => '',
    syncFooterAction: () => {},
    startTrainingLogPolling: () => {},
    startSysMonitorPolling: () => {},
    _pollSystemMonitor: () => {},
  },
});
const container = { innerHTML: '' };
renderer.renderTraining(container);
assert.match(container.innerHTML, /setBubbleClosedLoopHistoryFilter\('rollback'\)/);
assert.match(container.innerHTML, /rolled-task/);
assert.doesNotMatch(container.innerHTML, /kept-task/);
assert.match(container.innerHTML, /Bubble Auto/);

console.log('bubbleClosedLoopEvidenceSmoke: ok');
