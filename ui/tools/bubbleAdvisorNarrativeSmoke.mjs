import assert from 'node:assert/strict';
import {
  buildBubbleAdvisorShortItems,
  hasBubbleAdvisorPatch,
  normalizeBubbleAdvisorReport,
  renderBubbleAdvisorNarrativePanel,
} from '../src/utils/bubbleAdvisorNarrative.js';
import { createExperimentalTrainingRenderer } from '../src/renderers/experimentalTraining.js';
import { createPreflightRenderer } from '../src/renderers/preflight.js';

const bubbleController = {
  controller: 'bubble_aware_runtime_controller_v0',
  enabled: true,
  mode: 'advisor_patch',
  status: 'advisor_patch_ready',
  phase: 'P2_data_supply_advisor_patch',
  diagnosis: {
    kind: 'data_bound',
    confidence: 0.82,
    evidence: {
      data_wait_share: 0.12,
      h2d_transfer_share: 0.001,
      optimizer_share: 0.04,
      active_gpu_util_pct_mean: 28.5,
    },
    recommended_action: {
      kind: 'set_dataloader_workers',
    },
  },
  action_plan: {
    status: 'advisor_patch_ready',
    apply_mode: 'advisor_patch',
    domain: 'data_supply',
    action_kind: 'set_dataloader_workers',
    can_apply_to_next_request: true,
    can_apply_during_current_run: false,
    config_overlay: {
      cached_dataloader_workers: 2,
      cached_dataloader_auto_policy: true,
    },
    mutations: [
      { path: 'cached_dataloader_workers', current: 0, recommended: 2 },
    ],
    rollback: {
      metric: 'steady_samples_per_second',
      max_regression_ratio: 0.02,
      compare_window: 'post_warmup_steady_window',
      restore: { cached_dataloader_workers: 0 },
    },
    notes: ['next-run only'],
  },
};

const preflight = {
  can_start: true,
  errors: [],
  warnings: [],
  notes: [],
  bubble_controller: bubbleController,
};

const info = normalizeBubbleAdvisorReport(bubbleController);
assert.equal(info.diagnosisLabel, '数据供给跟不上');
assert.equal(info.actionLabel, '调整 DataLoader workers');
assert.equal(info.canApplyToNextRequest, true);
assert.deepEqual(info.patchKeys.sort(), ['cached_dataloader_auto_policy', 'cached_dataloader_workers'].sort());

const items = buildBubbleAdvisorShortItems(preflight);
assert.ok(items.some((item) => item.text.includes('Bubble 来源')));
assert.ok(items.some((item) => item.text.includes('风险/回滚')));
assert.equal(hasBubbleAdvisorPatch(preflight), true);

const panel = renderBubbleAdvisorNarrativePanel(preflight);
assert.match(panel, /Bubble Advisor/);
assert.match(panel, /数据供给跟不上/);
assert.match(panel, /bubble_advisor_action_ledger/);

const experimental = createExperimentalTrainingRenderer({
  state: {
    activeTrainingType: 'sdxl-turbo-lora',
    config: {},
    preflight,
    trainingAdvisorCollapsed: false,
  },
});
const floating = experimental.renderFloatingTrainingAssistant();
assert.match(floating, /Bubble 来源/);
assert.match(floating, /应用建议/);
assert.doesNotMatch(floating, /disabled>.*应用建议/);

const preflightRenderer = createPreflightRenderer({
  state: {
    preflight,
    loading: { preflight: false, pcieTransferBenchmark: false },
    pcieTransferBenchmark: null,
    pcieTransferBenchmarkError: '',
  },
  deps: { renderStatusDeck: () => '' },
});
const report = preflightRenderer.renderPreflightReport();
assert.match(report, /Bubble Advisor/);
assert.match(report, /建议修改/);
assert.match(report, /不热改当前训练/);

console.log('bubbleAdvisorNarrativeSmoke: ok');
