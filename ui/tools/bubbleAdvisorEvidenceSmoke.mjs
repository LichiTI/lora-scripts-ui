import assert from 'node:assert/strict';
import {
  normalizeBubbleAdvisorAbEvidence,
  renderBubbleAdvisorAbEvidenceBadge,
  renderBubbleAdvisorAbEvidenceCard,
  renderSummaryCard,
} from '../src/utils/trainingMetrics.js';

const evidence = {
  report: 'bubble_advisor_ab_evidence_v0',
  status: 'keep_recommended',
  action: {
    action_id: 'bubble-smoke',
    domain: 'transfer',
    action_kind: 'enable_prefetch',
  },
  decision: {
    status: 'keep_recommended',
    recommended_action: 'keep',
    reasons: ['throughput_gain_met'],
  },
  comparison: {
    steady_samples_per_second_before: 1.2,
    steady_samples_per_second_after: 1.32,
    steady_samples_per_second_gain_pct: 10,
    active_gpu_util_pct_delta: 5.5,
    peak_vram_mb_delta: 128,
    final_loss_delta: -0.001,
  },
  before: {
    case_id: 'baseline',
    metrics: { active_gpu_util_pct_mean: 70 },
  },
  after: {
    case_id: 'patched',
    metrics: { active_gpu_util_pct_mean: 75.5 },
  },
  auto_pair: { baseline_found: true },
};

const normalized = normalizeBubbleAdvisorAbEvidence(evidence);
assert.equal(normalized.status, 'keep_recommended');
assert.equal(normalized.label, '建议保留');
assert.equal(normalized.gainPct, 10);

const badge = renderBubbleAdvisorAbEvidenceBadge(evidence);
assert.match(badge, /Bubble A\/B/);
assert.match(badge, /建议保留/);
assert.match(badge, /\+10\.0%/);

const card = renderBubbleAdvisorAbEvidenceCard(evidence);
assert.match(card, /Bubble Advisor A\/B/);
assert.match(card, /吞吐 \+10\.0%/);
assert.match(card, /transfer \/ enable_prefetch/);

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
}, { bubbleAdvisorAbEvidence: evidence });

assert.match(summaryHtml, /Bubble Advisor A\/B/);
assert.match(summaryHtml, /steady samples\/s/);

console.log('bubbleAdvisorEvidenceSmoke: ok');
