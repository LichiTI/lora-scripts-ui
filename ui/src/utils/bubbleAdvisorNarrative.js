import { _ico, escapeHtml } from './dom.js';

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function finiteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatPct(value, digits = 1) {
  const num = finiteNumber(value);
  return num === null ? '—' : (num * 100).toFixed(digits) + '%';
}

function formatUtil(value, digits = 1) {
  const num = finiteNumber(value);
  return num === null ? '—' : num.toFixed(digits) + '%';
}

function labelForDiagnosis(kind) {
  const labels = {
    data_bound: '数据供给跟不上',
    transfer_bound: '传输/Offload 等待',
    optimizer_bound: 'Optimizer/Backward 热点',
    host_scheduling_bound: 'Host/日志/保存占用热路径',
    logging_checkpoint_bound: '日志/保存占用热路径',
    workload_underfilled: '任务太轻，GPU 没有足够工作量',
    gpu_saturated: 'GPU 已接近饱和',
  };
  return labels[kind] || kind || '证据不足';
}

function labelForAction(kind) {
  const labels = {
    set_dataloader_workers: '调整 DataLoader workers',
    set_dataloader_prefetch_factor: '调整 DataLoader prefetch',
    enable_pin_memory: '启用 pin_memory',
    enable_non_blocking_transfer: '启用 non_blocking H2D',
    enable_block_prefetch: '启用 block prefetch',
    increase_block_prefetch_depth: '提高 block prefetch 深度',
    enable_fused_adamw: '切换 fused AdamW',
    enable_foreach_optimizer: '切换 foreach optimizer',
    increase_train_batch_size: '提高 batch size',
    increase_gradient_accumulation: '提高梯度累积',
    disable_sync_profiler_mode: '关闭同步 profiler',
    increase_logging_interval: '降低日志频率',
    increase_checkpoint_interval: '拉长保存间隔',
    move_validation_after_training_window: '移出热路径 validation',
    no_action_monitor_throughput: '保持配置并监控吞吐',
    explain_workload_underfilled: '解释 workload underfilled',
  };
  return labels[kind] || kind || '暂无动作';
}

function collectCandidates(preflight) {
  const pf = objectValue(preflight);
  const advisor = objectValue(pf.training_advisor);
  const runtime = objectValue(pf.runtime);
  return [
    pf.bubble_controller,
    pf.bubble_runtime_controller,
    advisor.bubble_controller,
    advisor.bubble_runtime_controller,
    runtime.bubble_controller,
  ].filter((item) => item && typeof item === 'object' && !Array.isArray(item));
}

export function getPrimaryBubbleAdvisorReport(preflight) {
  const reports = collectCandidates(preflight);
  return reports.find((report) => objectValue(report.action_plan).status === 'advisor_patch_ready') || reports[0] || null;
}

export function normalizeBubbleAdvisorReport(report) {
  const source = objectValue(report);
  if (!source.controller && !source.action_plan && !source.diagnosis) return null;
  const diagnosis = objectValue(source.diagnosis);
  const evidence = objectValue(diagnosis.evidence);
  const action = objectValue(diagnosis.recommended_action);
  const plan = objectValue(source.action_plan || source);
  const rollback = objectValue(plan.rollback);
  const safety = objectValue(plan.safety);
  const overlay = objectValue(plan.config_overlay);
  const restore = objectValue(rollback.restore);
  const mutations = Array.isArray(plan.mutations) ? plan.mutations : [];
  const overlayKeys = Object.keys(overlay);
  const mutationKeys = mutations.map((item) => String(objectValue(item).path || '')).filter(Boolean);
  const patchKeys = overlayKeys.length ? overlayKeys : mutationKeys;

  return {
    enabled: !!source.enabled,
    mode: String(source.mode || plan.mode || 'report_only'),
    status: String(source.status || plan.status || 'report_only'),
    phase: String(source.phase || plan.phase || ''),
    diagnosisKind: String(diagnosis.kind || ''),
    diagnosisLabel: labelForDiagnosis(String(diagnosis.kind || '')),
    confidence: finiteNumber(diagnosis.confidence),
    actionKind: String(plan.action_kind || action.kind || ''),
    actionLabel: labelForAction(String(plan.action_kind || action.kind || '')),
    domain: String(plan.domain || ''),
    planStatus: String(plan.status || ''),
    canApplyToNextRequest: plan.can_apply_to_next_request === true,
    canApplyDuringCurrentRun: plan.can_apply_during_current_run === true,
    patchKeys,
    restoreKeys: Object.keys(restore),
    dataWaitShare: finiteNumber(evidence.data_wait_share),
    h2dShare: finiteNumber(evidence.h2d_transfer_share),
    optimizerShare: finiteNumber(evidence.optimizer_share),
    hostGapShare: finiteNumber(evidence.host_gap_share),
    activeGpu: finiteNumber(evidence.active_gpu_util_pct_mean),
    memoryRatio: finiteNumber(safety.memory_ratio),
    maxRegressionRatio: finiteNumber(rollback.max_regression_ratio),
    rollbackMetric: String(rollback.metric || 'steady_samples_per_second'),
    compareWindow: String(rollback.compare_window || 'post_warmup_steady_window'),
    notes: Array.isArray(plan.notes) ? plan.notes.map(String).filter(Boolean) : [],
  };
}

export function hasBubbleAdvisorPatch(preflight) {
  const info = normalizeBubbleAdvisorReport(getPrimaryBubbleAdvisorReport(preflight));
  return !!(info && info.planStatus === 'advisor_patch_ready' && info.canApplyToNextRequest);
}

export function buildBubbleAdvisorShortItems(preflight) {
  const info = normalizeBubbleAdvisorReport(getPrimaryBubbleAdvisorReport(preflight));
  if (!info) return [];
  const items = [];
  const evidenceParts = [];
  if (info.dataWaitShare !== null) evidenceParts.push('data wait ' + formatPct(info.dataWaitShare));
  if (info.h2dShare !== null) evidenceParts.push('H2D ' + formatPct(info.h2dShare));
  if (info.optimizerShare !== null) evidenceParts.push('optimizer ' + formatPct(info.optimizerShare));
  if (info.hostGapShare !== null) evidenceParts.push('host gap ' + formatPct(info.hostGapShare));
  if (info.activeGpu !== null) evidenceParts.push('GPU active ' + formatUtil(info.activeGpu));
  items.push({
    tone: info.diagnosisKind === 'gpu_saturated' ? 'ok' : 'note',
    text: 'Bubble 来源：' + info.diagnosisLabel + (evidenceParts.length ? '（' + evidenceParts.slice(0, 3).join('，') + '）' : '。'),
  });
  if (info.actionKind) {
    items.push({
      tone: info.planStatus === 'advisor_patch_ready' ? 'ok' : 'note',
      text: '建议动作：' + info.actionLabel + (info.patchKeys.length ? '，将改 ' + info.patchKeys.slice(0, 4).join(', ') : '。'),
    });
  }
  if (info.patchKeys.length) {
    const rollbackText = info.maxRegressionRatio === null
      ? '会记录回滚项'
      : '吞吐回退超过 ' + formatPct(info.maxRegressionRatio) + ' 时建议回滚';
    items.push({
      tone: info.canApplyDuringCurrentRun ? 'warning' : 'note',
      text: '风险/回滚：只应用到下一次训练；' + rollbackText + '。',
    });
    items.push({
      tone: 'note',
      text: '审计：应用后写入 bubble_advisor_action_ledger 和 action_history。',
    });
  } else if (info.planStatus && info.planStatus !== 'report_only') {
    items.push({
      tone: info.planStatus.includes('blocked') ? 'warning' : 'note',
      text: '当前状态：' + info.planStatus + (info.notes.length ? '，' + info.notes[0] : '。'),
    });
  }
  return items;
}

export function renderBubbleAdvisorNarrativePanel(preflight) {
  const info = normalizeBubbleAdvisorReport(getPrimaryBubbleAdvisorReport(preflight));
  if (!info) return '';
  const statusTone = info.planStatus === 'advisor_patch_ready' ? 'ok' : (info.planStatus.includes('blocked') ? 'warn' : '');
  const statusColor = statusTone === 'ok' ? 'var(--success)' : (statusTone === 'warn' ? 'var(--warning)' : 'var(--text-main)');
  const patchPreview = info.patchKeys.length ? info.patchKeys.slice(0, 8).join(', ') : '无 next-run patch';
  const rollback = info.maxRegressionRatio === null
    ? '记录 restore map，需 A/B 复核'
    : info.rollbackMetric + ' 回退超过 ' + formatPct(info.maxRegressionRatio) + ' 时回滚';
  const ledger = info.patchKeys.length
    ? '应用后会写入 bubble_advisor_action_ledger / action_history，下一次 run manifest 可复盘 before/after。'
    : '当前仅展示诊断，不会写入训练配置。';
  return '<details class="preflight-group collapsible-subgroup" style="margin-top:8px;" open>'
    + '<summary class="preflight-group-title">' + _ico('activity', 14) + ' Bubble Advisor<span class="collapsible-caret" aria-hidden="true">⌄</span></summary>'
    + '<div class="preflight-dataset-grid">'
    + '<div class="preflight-tag"><span class="preflight-tag-label">空泡来源</span><span class="preflight-tag-value">' + escapeHtml(info.diagnosisLabel) + '</span></div>'
    + '<div class="preflight-tag"><span class="preflight-tag-label">动作</span><span class="preflight-tag-value">' + escapeHtml(info.actionLabel) + '</span></div>'
    + '<div class="preflight-tag"><span class="preflight-tag-label">状态</span><span class="preflight-tag-value" style="color:' + statusColor + ';">' + escapeHtml(info.planStatus || info.status) + '</span></div>'
    + '<div class="preflight-tag"><span class="preflight-tag-label">GPU active</span><span class="preflight-tag-value">' + escapeHtml(formatUtil(info.activeGpu)) + '</span></div>'
    + '<div class="preflight-tag"><span class="preflight-tag-label">Data wait</span><span class="preflight-tag-value">' + escapeHtml(formatPct(info.dataWaitShare)) + '</span></div>'
    + '<div class="preflight-tag"><span class="preflight-tag-label">H2D</span><span class="preflight-tag-value">' + escapeHtml(formatPct(info.h2dShare)) + '</span></div>'
    + '</div>'
    + '<div class="preflight-item preflight-note">建议修改: ' + escapeHtml(patchPreview) + '</div>'
    + '<div class="preflight-item preflight-note">风险/回滚: 不热改当前训练；' + escapeHtml(rollback) + '；窗口 ' + escapeHtml(info.compareWindow) + '。</div>'
    + '<div class="preflight-item preflight-note">' + escapeHtml(ledger) + '</div>'
    + (info.patchKeys.length ? '<button class="btn btn-outline btn-sm" type="button" onclick="applyTrainingAdvisorPatch()" style="margin-top:8px;">' + _ico('check-circle', 14) + ' 应用 Bubble Advisor 建议</button>' : '')
    + '</details>';
}
