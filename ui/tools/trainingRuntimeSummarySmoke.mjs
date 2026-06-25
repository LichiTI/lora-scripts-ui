import assert from 'node:assert/strict';
import { renderSummaryCard } from '../src/utils/trainingMetrics.js';
import {
  getTrainingRuntimeSummaryFromTask,
  normalizeTrainingRuntimeSummary,
  renderTrainingRuntimeSummaryCard,
} from '../src/utils/trainingRuntimeSummary.js';

const summary = {
  report: 'training_runtime_task_summary_v0',
  source: 'bubble_controller',
  controller_mode: 'advisor_patch',
  controller_status: 'advisor_patch_ready',
  diagnosis_kind: 'data_bound',
  dominant_bottleneck: 'data_bound',
  recommended_action_kind: 'set_dataloader_workers',
  recommended_action_reason: 'workers 太低，data_wait 占比偏高',
  throughput_priority: true,
  no_gpu_99_claim: true,
  step_phase: {
    steady_samples_per_second: 1.234,
    mean_step_ms: 812.5,
    data_wait_share: 0.34,
    h2d_transfer_share: 0.08,
    optimizer_share: 0.12,
    host_gap_share: 0.09,
  },
  gpu: {
    active_gpu_util_pct_mean: 57.8,
  },
  runtime: {
    workers: 2,
    prefetch_factor: 2,
    train_batch_size: 1,
    gradient_accumulation_steps: 1,
    data_transfer_non_blocking: true,
    prefetch_enabled: true,
  },
  safety: {
    memory_ratio: 0.72,
    vram_safe: true,
  },
};

const normalized = normalizeTrainingRuntimeSummary(summary);
assert.equal(normalized.diagnosisKind, 'data_bound');
assert.equal(normalized.modeLabel, '下次训练建议');
assert.equal(normalized.actionLabel, '尝试提高 DataLoader workers');
assert.equal(normalized.throughput, 1.234);

const task = {
  id: 'task-rt-1',
  metadata: {
    training_runtime_summary: summary,
  },
};
const fromTask = getTrainingRuntimeSummaryFromTask(task, {});
assert.equal(fromTask.recommended_action_kind, 'set_dataloader_workers');

const card = renderTrainingRuntimeSummaryCard(summary);
assert.match(card, /训练运行摘要/);
assert.match(card, /数据供给偏慢/);
assert.match(card, /尝试提高 DataLoader workers/);
assert.match(card, /GPU Active/);

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
}, { trainingRuntimeSummary: summary });

assert.match(summaryHtml, /训练运行摘要/);
assert.match(summaryHtml, /首发口径以吞吐和稳定性优先/);

console.log('trainingRuntimeSummarySmoke: ok');
