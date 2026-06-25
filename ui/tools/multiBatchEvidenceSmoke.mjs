import assert from 'node:assert/strict';
import {
  getMultiBatchEvidenceFromTask,
  normalizeMultiBatchEvidence,
  renderMultiBatchEvidenceBadge,
  renderMultiBatchEvidenceCard,
} from '../src/utils/multiBatchEvidence.js';
import { renderSummaryCard } from '../src/utils/trainingMetrics.js';

const evidence = {
  multi_batch_promotion_gate: {
    gate: 'lulynx_multi_batch_promotion_gate_v0',
    status: 'ready_for_long_window_probe',
    ready_for_long_window_probe: true,
    candidate_physical_batch_size: 2,
    release_claim_allowed: false,
    blockers: [],
  },
  multi_batch_dataloader: {
    contract: 'lulynx_multi_batch_dataloader_contract_v0',
    ok: true,
    physical_batch_size: 2,
    effective_batch_size: 2,
    drop_last: true,
    release_claim_allowed: false,
  },
  multi_batch_stability_candidate_evidence: {
    report: 'lulynx_multi_batch_stability_candidate_evidence_v0',
    release_claim_allowed: false,
    evidence_complete_for_review: true,
    fresh_promotion_gate_status: 'ready_for_long_window_probe',
    steps_completed: 80,
    steady_samples_per_second: 0.75,
    active_gpu_util_pct_mean: 42,
    peak_vram_mb: 12345,
    final_loss: 0.1234,
  },
};

const normalized = normalizeMultiBatchEvidence(evidence);
assert.equal(normalized.label, '复核证据完整');
assert.equal(normalized.releaseClaimAllowed, false);

const taskEvidence = getMultiBatchEvidenceFromTask({ id: 'task-1', metadata: evidence }, {});
assert.deepEqual(taskEvidence.multi_batch_promotion_gate, evidence.multi_batch_promotion_gate);

const badge = renderMultiBatchEvidenceBadge(evidence);
assert.match(badge, /Multi-batch/);
assert.match(badge, /不可发布/);
assert.doesNotMatch(badge, /发布可用/);

const card = renderMultiBatchEvidenceCard(evidence);
assert.match(card, /Multi-batch 证据/);
assert.match(card, /发布 claim：关闭/);
assert.match(card, /只读 evidence/);
assert.doesNotMatch(card, /发布可用/);

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
}, { multiBatchEvidence: evidence });

assert.match(summaryHtml, /Multi-batch 证据/);
assert.match(summaryHtml, /不可发布|发布 claim：关闭/);

console.log('multiBatchEvidenceSmoke: ok');
