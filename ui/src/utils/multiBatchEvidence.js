import { _ico, escapeHtml } from './dom.js';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function finiteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatPlain(value, suffix = '', digits = 2) {
  const num = finiteNumber(value);
  return num === null ? '—' : num.toFixed(digits) + suffix;
}

function yesNo(value) {
  return value ? '是' : '否';
}

function listText(value, emptyText = '无') {
  return Array.isArray(value) && value.length
    ? value.slice(0, 3).map(function(item) { return String(item); }).join('，')
    : emptyText;
}

function readEvidenceParts(source) {
  const src = asObject(source);
  const gate = src.gate === 'lulynx_multi_batch_promotion_gate_v0'
    ? src
    : asObject(src.multi_batch_promotion_gate || src.promotionGate);
  const dataloader = src.contract === 'lulynx_multi_batch_dataloader_contract_v0'
    ? src
    : asObject(src.multi_batch_dataloader || src.dataloader);
  const stability = src.report === 'lulynx_multi_batch_stability_candidate_evidence_v0'
    ? src
    : asObject(src.multi_batch_stability_candidate_evidence || src.stabilityCandidateEvidence);
  return { gate, dataloader, stability };
}

export function getMultiBatchEvidenceFromTask(task, summaries = {}) {
  const taskId = String((task && (task.id || task.task_id)) || '');
  const metadata = asObject(task?.metadata);
  const cached = taskId ? asObject(summaries[taskId]) : {};
  const embedded = asObject(task?._summary);
  const evidence = {
    multi_batch_promotion_gate: metadata.multi_batch_promotion_gate || task?.multi_batch_promotion_gate || cached.multiBatchPromotionGate || cached.multi_batch_promotion_gate || embedded.multiBatchPromotionGate || embedded.multi_batch_promotion_gate,
    multi_batch_dataloader: metadata.multi_batch_dataloader || task?.multi_batch_dataloader || cached.multiBatchDataloader || cached.multi_batch_dataloader || embedded.multiBatchDataloader || embedded.multi_batch_dataloader,
    multi_batch_stability_candidate_evidence: metadata.multi_batch_stability_candidate_evidence || task?.multi_batch_stability_candidate_evidence || cached.multiBatchStabilityCandidateEvidence || cached.multi_batch_stability_candidate_evidence || embedded.multiBatchStabilityCandidateEvidence || embedded.multi_batch_stability_candidate_evidence,
  };
  return normalizeMultiBatchEvidence(evidence) ? evidence : null;
}

export function normalizeMultiBatchEvidence(source) {
  const parts = readEvidenceParts(source);
  if (!Object.keys(parts.gate).length && !Object.keys(parts.dataloader).length && !Object.keys(parts.stability).length) return null;
  const gateReady = parts.gate.ready_for_long_window_probe === true;
  const stabilityComplete = parts.stability.evidence_complete_for_review === true;
  const blocked = Array.isArray(parts.gate.blockers) && parts.gate.blockers.length > 0;
  const label = blocked ? '推广阻断' : (stabilityComplete ? '复核证据完整' : (gateReady ? '可进长窗复核' : '复核证据'));
  const color = blocked ? 'var(--warning)' : (stabilityComplete ? 'var(--info)' : 'var(--text-dim)');
  return {
    label,
    color,
    icon: blocked ? 'alert-tri' : 'lock',
    releaseClaimAllowed: false,
    gate: parts.gate,
    dataloader: parts.dataloader,
    stability: parts.stability,
  };
}

export function renderMultiBatchEvidenceBadge(source) {
  const info = normalizeMultiBatchEvidence(source);
  if (!info) return '';
  return '<span style="font-size:0.68rem;color:' + info.color + ';background:var(--bg-hover);border:1px solid var(--border);padding:1px 6px;border-radius:4px;white-space:nowrap;">'
    + _ico(info.icon, 12) + ' Multi-batch ' + escapeHtml(info.label + ' · 不可发布')
    + '</span>';
}

export function renderMultiBatchEvidenceCard(source) {
  const info = normalizeMultiBatchEvidence(source);
  if (!info) return '';
  const gate = info.gate;
  const dataloader = info.dataloader;
  const stability = info.stability;
  const batch = gate.candidate_physical_batch_size || dataloader.physical_batch_size || '—';
  const gateLine = Object.keys(gate).length
    ? 'Gate ' + String(gate.status || 'unknown') + '，batch ' + String(batch) + '，阻断 ' + listText(gate.blockers)
    : 'Gate 证据缺失';
  const loaderLine = Object.keys(dataloader).length
    ? 'DataLoader ' + (dataloader.ok ? 'ok' : 'blocked') + '，physical/effective '
      + String(dataloader.physical_batch_size || '—') + '/' + String(dataloader.effective_batch_size || '—')
      + '，drop_last ' + yesNo(dataloader.drop_last) + '，警告 ' + listText(dataloader.warnings)
    : 'DataLoader contract 缺失';
  const stabilityLine = Object.keys(stability).length
    ? '候选复核 ' + (stability.evidence_complete_for_review ? '完整' : '未完整')
      + '，fresh gate ' + String(stability.fresh_promotion_gate_status || 'missing')
      + '，steps ' + String(stability.steps_completed || 0)
      + '，steady ' + formatPlain(stability.steady_samples_per_second, '', 3)
      + ' samples/s，active GPU ' + formatPlain(stability.active_gpu_util_pct_mean, '%', 1)
      + '，VRAM ' + formatPlain(stability.peak_vram_mb, ' MB', 1)
      + '，Loss ' + formatPlain(stability.final_loss, '', 4)
    : '长窗 stability candidate evidence 缺失';
  return '<div style="margin-top:8px;">'
    + '<div class="status-card" style="border-left:3px solid ' + info.color + ';">'
    + '<div class="status-label">Multi-batch 证据</div>'
    + '<div style="font-size:0.95rem;font-weight:700;color:' + info.color + ';margin:4px 0;">'
    + _ico(info.icon, 14) + ' ' + escapeHtml(info.label) + ' / 发布 claim：关闭'
    + '</div>'
    + '<div class="status-sub">' + escapeHtml(gateLine) + '</div>'
    + '<div class="status-sub" style="margin-top:4px;">' + escapeHtml(loaderLine) + '</div>'
    + '<div class="status-sub" style="margin-top:4px;">' + escapeHtml(stabilityLine) + '</div>'
    + '<div class="status-sub" style="margin-top:4px;">只读 evidence，不用于 batch2/4/8 发布 claim。</div>'
    + '</div>'
    + '</div>';
}
