import { _ico, escapeHtml } from './dom.js';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function finiteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function boolValue(value) {
  return typeof value === 'boolean' ? value : null;
}

function formatPercent(value, digits = 1) {
  const num = finiteNumber(value);
  return num === null ? '—' : (num * 100).toFixed(digits) + '%';
}

function formatUtil(value, digits = 1) {
  const num = finiteNumber(value);
  return num === null ? '—' : num.toFixed(digits) + '%';
}

function formatNumber(value, digits = 3, suffix = '') {
  const num = finiteNumber(value);
  return num === null ? '—' : num.toFixed(digits) + suffix;
}

function taskIdOf(task) {
  return String((task && (task.id || task.task_id)) || '');
}

function diagnosisModeLabel(summary) {
  const source = String(summary.source || '');
  const phase = String(summary.phase || '');
  const controllerMode = String(summary.controller_mode || '');
  const controllerStatus = String(summary.controller_status || '');
  if (source === 'runtime_feature_summary' || controllerMode === 'report_only' || phase === 'P1_report_only') {
    return '只读诊断';
  }
  if (controllerMode === 'advisor_patch' || controllerStatus === 'advisor_patch_ready') {
    return '下次训练建议';
  }
  if (controllerMode === 'auto_apply') {
    return '受控自动调优';
  }
  return '诊断摘要';
}

function diagnosisLabel(kind) {
  const labels = {
    data_bound: '数据供给偏慢',
    transfer_bound: '传输/Offload 等待',
    optimizer_bound: 'Optimizer 热点',
    host_scheduling_bound: 'Host/日志/保存热路径',
    logging_checkpoint_bound: 'Host/日志/保存热路径',
    workload_underfilled: '任务太轻',
    gpu_saturated: 'GPU 已接近饱和',
    compute_bound: '计算主导',
    balanced: '暂未发现单一瓶颈',
    unknown: '证据不足',
  };
  return labels[kind] || kind || labels.unknown;
}

function diagnosisExplanation(kind) {
  const explanations = {
    data_bound: '这次训练更像是在等数据，而不是先卡在算力本身。先看 workers、prefetch 与 cache-first。',
    transfer_bound: '这次训练更像是在等 H2D / Offload 传输。先看 pin_memory、non_blocking 和预取。',
    optimizer_bound: '热路径更多花在 optimizer / backward。优先验证 fused 或 native optimizer 路线。',
    host_scheduling_bound: '日志、保存、validation 或其他 host 调度更像是热路径来源。先减少同步工作。',
    logging_checkpoint_bound: '日志、保存、validation 或其他 host 调度更像是热路径来源。先减少同步工作。',
    workload_underfilled: '当前更像是 workload 本身偏轻。优先看吞吐、显存和 loss 稳定性，而不是盯 util 数字。',
    gpu_saturated: '当前已经比较接近 GPU 饱和。继续为了 util 冒险调参价值不高，更该盯住吞吐和稳定性。',
    compute_bound: '当前主要时间花在模型计算上，不是数据或传输先卡住。适合继续比对 compute / kernel 路线。',
    balanced: '这一小段窗口里没有明显单一瓶颈，先结合更长窗口和吞吐再判断。',
    unknown: '当前证据还不够强，适合先补短窗口 profile 或更完整的训练摘要。',
  };
  return explanations[kind] || explanations.unknown;
}

function diagnosisColor(kind) {
  const colors = {
    data_bound: 'var(--info)',
    transfer_bound: 'var(--warning)',
    optimizer_bound: 'var(--warning)',
    host_scheduling_bound: 'var(--warning)',
    logging_checkpoint_bound: 'var(--warning)',
    workload_underfilled: 'var(--text-dim)',
    gpu_saturated: 'var(--success)',
    compute_bound: 'var(--info)',
    balanced: 'var(--info)',
    unknown: 'var(--text-dim)',
  };
  return colors[kind] || 'var(--text-dim)';
}

function actionLabel(kind) {
  const labels = {
    set_dataloader_workers: '尝试提高 DataLoader workers',
    set_dataloader_prefetch_factor: '尝试提高 DataLoader prefetch',
    enable_pin_memory: '尝试启用 pin_memory',
    enable_non_blocking_transfer: '尝试启用 non_blocking H2D',
    enable_block_prefetch: '尝试启用 block prefetch',
    increase_block_prefetch_depth: '尝试提高 block prefetch 深度',
    enable_fused_adamw: '尝试切到 fused AdamW',
    profile_native_optimizer: '继续采集 optimizer 路线证据',
    increase_train_batch_size: '在显存安全前提下提高 batch',
    explain_workload_underfilled: '先给出 workload 解释',
    disable_sync_profiler_mode: '关闭同步 profiler 热路径',
    increase_logging_interval: '降低日志频率',
    increase_checkpoint_interval: '拉长 checkpoint 间隔',
    move_validation_after_training_window: '把 validation 移出热路径窗口',
    profile_compute_kernel: '继续比对 compute / kernel 路线',
    collect_more_evidence: '先补更多运行证据',
    no_action_monitor_throughput: '保持配置并继续监控吞吐',
    recommend_cache_first: '优先转向 cache-first / 数据预处理',
    keep_dataloader_workers: '先保持当前 worker 策略',
    reduce_hot_path_sync: '继续减少 host 侧同步工作',
    profile_transfer_path: '继续采集传输路径证据',
  };
  return labels[kind] || kind || '暂无动作建议';
}

function renderMetricPill(icon, label, value) {
  return '<div style="flex:1;min-width:120px;border:1px solid var(--border);border-radius:6px;padding:8px 10px;background:var(--bg-hover);">'
    + '<div style="display:flex;align-items:center;gap:4px;font-size:0.66rem;color:var(--text-muted);">'
    + _ico(icon, 12) + '<span>' + escapeHtml(label) + '</span>'
    + '</div>'
    + '<div style="margin-top:4px;font-size:0.82rem;font-weight:700;color:var(--text);">' + escapeHtml(value) + '</div>'
    + '</div>';
}

function renderChip(text, color = 'var(--text-muted)', border = 'var(--border)') {
  return '<span style="font-size:0.68rem;color:' + color + ';border:1px solid ' + border + ';border-radius:999px;padding:2px 8px;background:var(--bg-hover);white-space:nowrap;">'
    + escapeHtml(text)
    + '</span>';
}

export function getTrainingRuntimeSummaryFromTask(task, summaries = {}) {
  const taskId = taskIdOf(task);
  const metadata = asObject(task?.metadata);
  const cached = taskId ? asObject(summaries[taskId]) : {};
  const embedded = asObject(task?._summary);
  const summary = metadata.training_runtime_summary
    || task?.training_runtime_summary
    || cached.trainingRuntimeSummary
    || cached.training_runtime_summary
    || embedded.trainingRuntimeSummary
    || embedded.training_runtime_summary
    || null;
  return normalizeTrainingRuntimeSummary(summary) ? summary : null;
}

export function normalizeTrainingRuntimeSummary(source) {
  const record = asObject(source);
  if (!Object.keys(record).length) return null;
  const stepPhase = asObject(record.step_phase);
  const gpu = asObject(record.gpu);
  const runtime = asObject(record.runtime);
  const safety = asObject(record.safety);
  const diagnosisKind = String(record.diagnosis_kind || record.dominant_bottleneck || 'unknown');
  const actionKind = String(record.recommended_action_kind || '');
  const actionReason = String(record.recommended_action_reason || '');
  return {
    diagnosisKind,
    diagnosisLabel: diagnosisLabel(diagnosisKind),
    diagnosisExplanation: diagnosisExplanation(diagnosisKind),
    diagnosisColor: diagnosisColor(diagnosisKind),
    modeLabel: diagnosisModeLabel(record),
    actionKind,
    actionLabel: actionLabel(actionKind),
    actionReason,
    throughput: finiteNumber(stepPhase.steady_samples_per_second),
    meanStepMs: finiteNumber(stepPhase.mean_step_ms),
    dataWaitShare: finiteNumber(stepPhase.data_wait_share),
    h2dShare: finiteNumber(stepPhase.h2d_transfer_share),
    optimizerShare: finiteNumber(stepPhase.optimizer_share),
    hostGapShare: finiteNumber(stepPhase.host_gap_share),
    gpuActive: finiteNumber(gpu.active_gpu_util_pct_mean),
    memoryRatio: finiteNumber(safety.memory_ratio),
    vramSafe: boolValue(safety.vram_safe),
    runtime,
    throughputPriority: record.throughput_priority === true,
    noGpu99Claim: record.no_gpu_99_claim === true,
  };
}

export function renderTrainingRuntimeSummaryCard(source) {
  const info = normalizeTrainingRuntimeSummary(source);
  if (!info) return '';

  const runtimeChips = [];
  if (finiteNumber(info.runtime.workers) !== null) runtimeChips.push(renderChip('workers ' + String(info.runtime.workers)));
  if (finiteNumber(info.runtime.prefetch_factor) !== null && Number(info.runtime.prefetch_factor) > 0) {
    runtimeChips.push(renderChip('prefetch ' + String(info.runtime.prefetch_factor)));
  }
  if (finiteNumber(info.runtime.prefetch_depth) !== null && Number(info.runtime.prefetch_depth) > 0) {
    runtimeChips.push(renderChip('block prefetch ' + String(info.runtime.prefetch_depth)));
  }
  if (finiteNumber(info.runtime.train_batch_size) !== null) {
    runtimeChips.push(renderChip('batch ' + String(info.runtime.train_batch_size)));
  }
  if (finiteNumber(info.runtime.gradient_accumulation_steps) !== null && Number(info.runtime.gradient_accumulation_steps) > 1) {
    runtimeChips.push(renderChip('grad acc ' + String(info.runtime.gradient_accumulation_steps)));
  }
  if (info.runtime.optimizer_backend) {
    runtimeChips.push(renderChip('optimizer ' + String(info.runtime.optimizer_backend)));
  }
  if (info.runtime.pin_memory === true) runtimeChips.push(renderChip('pin_memory', 'var(--success)', 'var(--success)'));
  if (info.runtime.prefetch_enabled === true) runtimeChips.push(renderChip('预取已启用', 'var(--accent)', 'var(--accent)'));
  if (info.runtime.data_transfer_non_blocking === true) runtimeChips.push(renderChip('non_blocking H2D', 'var(--success)', 'var(--success)'));
  if (info.runtime.offload_active === true) runtimeChips.push(renderChip('正在使用 offload', 'var(--warning)', 'var(--warning)'));

  const guardrailText = info.noGpu99Claim || info.throughputPriority
    ? '首发口径以吞吐和稳定性优先。这里提供的是瓶颈解释与下一步建议，不是泛化的 GPU 99% 承诺。'
    : '';

  return '<div style="margin-top:8px;">'
    + '<div class="status-card" style="border-left:3px solid ' + info.diagnosisColor + ';">'
    + '<div class="status-label">训练运行摘要</div>'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;margin:4px 0 0;">'
    + '<div style="font-size:0.95rem;font-weight:700;color:' + info.diagnosisColor + ';">'
    + _ico('activity', 14) + ' ' + escapeHtml(info.diagnosisLabel)
    + '</div>'
    + renderChip(info.modeLabel, 'var(--text)', 'var(--border)')
    + '</div>'
    + '<div class="status-sub" style="margin-top:6px;">' + escapeHtml(info.diagnosisExplanation) + '</div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">'
    + renderMetricPill('activity', '吞吐', info.throughput === null ? '—' : formatNumber(info.throughput) + ' it/s')
    + renderMetricPill('cpu', 'GPU Active', formatUtil(info.gpuActive))
    + renderMetricPill('bar-chart', '平均 Step', info.meanStepMs === null ? '—' : formatNumber(info.meanStepMs) + ' ms')
    + renderMetricPill('shield', '显存占用', info.memoryRatio === null ? '—' : formatPercent(info.memoryRatio) + (info.vramSafe === false ? ' · 显存偏紧' : ''))
    + '</div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">'
    + renderMetricPill('package', 'Data wait', formatPercent(info.dataWaitShare))
    + renderMetricPill('package', 'H2D', formatPercent(info.h2dShare))
    + renderMetricPill('bar-chart', 'Optimizer', formatPercent(info.optimizerShare))
    + renderMetricPill('clock', 'Host gap', formatPercent(info.hostGapShare))
    + '</div>'
    + ((info.actionKind || info.actionReason)
      ? '<div style="margin-top:8px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-hover);">'
        + '<div style="font-size:0.72rem;font-weight:700;color:var(--text);">建议下一步</div>'
        + '<div style="margin-top:4px;font-size:0.8rem;color:var(--text);">' + escapeHtml(info.actionLabel) + '</div>'
        + (info.actionReason ? '<div style="margin-top:4px;font-size:0.72rem;color:var(--text-muted);">' + escapeHtml(info.actionReason) + '</div>' : '')
        + '</div>'
      : '')
    + (runtimeChips.length
      ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">' + runtimeChips.join('') + '</div>'
      : '')
    + (guardrailText
      ? '<div class="status-sub" style="margin-top:8px;">' + escapeHtml(guardrailText) + '</div>'
      : '')
    + '</div>'
    + '</div>';
}
