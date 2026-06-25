import { _ico, escapeHtml } from './dom.js';

const CROSS_RUN_COOLDOWN_STATUSES = new Set([
  'needs_more_evidence',
  'rollback_failed',
  'rolled_back',
]);

const HISTORY_KEPT_STATUSES = new Set(['kept', 'keep_recommended', 'keep_observed']);
const HISTORY_ROLLBACK_STATUSES = new Set(['rolled_back', 'rollback_recommended', 'rollback_failed']);
const HISTORY_BLOCKED_STATUSES = new Set([
  'action_already_attempted',
  'blocked_action_not_runtime_safe',
  'cross_run_action_cooldown',
  'duplicate_blocked',
  'needs_more_evidence',
]);
const HISTORY_ACTIVE_STATUSES = new Set(['applied', 'auto_apply_ready', 'cooldown', 'auto_apply_cooldown']);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function finiteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatSigned(value, suffix = '', digits = 1) {
  const num = finiteNumber(value);
  if (num === null) return '—';
  return (num > 0 ? '+' : '') + num.toFixed(digits) + suffix;
}

function formatPlain(value, suffix = '', digits = 3) {
  const num = finiteNumber(value);
  if (num === null) return '—';
  return num.toFixed(digits) + suffix;
}

function statusVisual(status) {
  const map = {
    auto_apply_ready: { label: '准备应用', color: 'var(--info)', icon: 'zap' },
    cooldown: { label: '冷却中', color: 'var(--info)', icon: 'clock' },
    auto_apply_cooldown: { label: '冷却中', color: 'var(--info)', icon: 'clock' },
    kept: { label: '已保留', color: 'var(--success)', icon: 'check-circle' },
    keep_recommended: { label: '建议保留', color: 'var(--success)', icon: 'check-circle' },
    keep_observed: { label: '观察保留', color: 'var(--success)', icon: 'check-circle' },
    rolled_back: { label: '已回滚', color: 'var(--danger)', icon: 'rotate-ccw' },
    rollback_recommended: { label: '建议回滚', color: 'var(--danger)', icon: 'rotate-ccw' },
    rollback_failed: { label: '回滚失败', color: 'var(--danger)', icon: 'alert-tri' },
    needs_more_evidence: { label: '证据不足', color: 'var(--warning)', icon: 'alert-tri' },
    action_already_attempted: { label: '已跳过重复动作', color: 'var(--text-dim)', icon: 'minus-line' },
    blocked_action_not_runtime_safe: { label: '仅下次应用', color: 'var(--text-dim)', icon: 'lock' },
    cross_run_action_cooldown: { label: '跨轮冷却', color: 'var(--text-dim)', icon: 'clock' },
  };
  return map[status] || { label: status || '在线闭环', color: 'var(--text-dim)', icon: 'activity' };
}

function actionLabel(domain, kind) {
  const parts = [domain, kind].map(function(item) { return String(item || '').trim(); }).filter(Boolean);
  return parts.length ? parts.join(' / ') : 'closed-loop action';
}

function boolish(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const text = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enable', 'enabled'].includes(text);
}

function taskIdOf(task) {
  return String((task && (task.id || task.task_id)) || '');
}

function summaryForTask(task, summaries) {
  const taskId = taskIdOf(task);
  if (!taskId || !summaries) return {};
  if (summaries instanceof Map) return asObject(summaries.get(taskId));
  return asObject(summaries[taskId]);
}

function closedLoopStatesForTask(task, summaries) {
  const metadata = asObject(task?.metadata);
  const cached = summaryForTask(task, summaries);
  const embedded = asObject(task?._summary);
  return [
    metadata.bubble_closed_loop_state,
    task?.bubble_closed_loop_state,
    cached.bubbleClosedLoopState,
    cached.bubble_closed_loop_state,
    embedded.bubbleClosedLoopState,
    embedded.bubble_closed_loop_state,
  ].filter(function(item) { return item && typeof item === 'object' && !Array.isArray(item); });
}

function compactEvaluation(evaluation) {
  const source = asObject(evaluation);
  if (!Object.keys(source).length) return {};
  const before = asObject(source.before);
  const after = asObject(source.after);
  const result = {};
  for (const key of ['steady_samples_per_second_gain_ratio', 'steady_samples_per_second_gain_pct', 'evaluated_step']) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  if (Object.keys(before).length) {
    result.before = {};
    for (const key of ['steady_samples_per_second', 'active_gpu_util_pct_mean', 'host_gap_share', 'final_loss']) {
      if (before[key] !== undefined) result.before[key] = before[key];
    }
  }
  if (Object.keys(after).length) {
    result.after = {};
    for (const key of ['steady_samples_per_second', 'active_gpu_util_pct_mean', 'host_gap_share', 'final_loss']) {
      if (after[key] !== undefined) result.after[key] = after[key];
    }
  }
  return result;
}

function compactActionForHistory(action, sourceTaskId) {
  const source = asObject(action);
  const status = String(source.status || '').trim();
  const actionId = String(source.action_id || '').trim();
  const domain = String(source.domain || '').trim();
  const actionKind = String(source.action_kind || '').trim();
  if (!status || (!actionId && !domain && !actionKind)) return null;
  const result = {
    action_id: actionId,
    status,
    domain,
    action_kind: actionKind,
    applied_overlay: asObject(source.applied_overlay),
    rollback_restore: asObject(source.rollback_restore),
  };
  if (sourceTaskId) result.source_task_id = sourceTaskId;
  if (source.applied_step !== undefined) result.applied_step = source.applied_step;
  if (source.cooldown_until_step !== undefined) result.cooldown_until_step = source.cooldown_until_step;
  if (source.closed_step !== undefined) result.closed_step = source.closed_step;
  if (source.rollback_applied_overlay !== undefined) {
    result.rollback_applied_overlay = asObject(source.rollback_applied_overlay);
  }
  const evaluation = compactEvaluation(source.evaluation);
  if (Object.keys(evaluation).length) result.evaluation = evaluation;
  return result;
}

function actionsFromClosedLoopState(state, sourceTaskId) {
  const source = asObject(state);
  const rawHistory = Array.isArray(source.action_history) ? source.action_history : [];
  const actions = rawHistory
    .map(function(item) { return compactActionForHistory(item, sourceTaskId); })
    .filter(Boolean);
  const latest = compactActionForHistory(source.latest_action, sourceTaskId);
  const active = compactActionForHistory(source.active_action, sourceTaskId);
  if (latest) actions.push(latest);
  if (active) actions.push(active);
  return actions;
}

function actionHistoryKey(action) {
  return String(action.action_id || '').trim()
    || [
      String(action.domain || '').trim(),
      String(action.action_kind || '').trim(),
      String(action.status || '').trim(),
    ].join('|');
}

export function collectBubbleClosedLoopActionHistoryFromTasks(tasks, summaries = {}, limit = 3) {
  const maxItems = Math.max(0, Number(limit || 0) || 0);
  if (!maxItems || !Array.isArray(tasks) || tasks.length === 0) return [];
  const seen = new Set();
  const collected = [];

  for (let index = 0; index < tasks.length && collected.length < maxItems; index += 1) {
    const task = tasks[index];
    const taskId = taskIdOf(task);
    const states = closedLoopStatesForTask(task, summaries);
    for (const state of states) {
      const actions = actionsFromClosedLoopState(state, taskId);
      for (let actionIndex = actions.length - 1; actionIndex >= 0; actionIndex -= 1) {
        const action = actions[actionIndex];
        if (!CROSS_RUN_COOLDOWN_STATUSES.has(String(action.status || ''))) continue;
        const key = actionHistoryKey(action);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        collected.push(action);
        if (collected.length >= maxItems) break;
      }
      if (collected.length >= maxItems) break;
    }
  }

  return collected.reverse();
}

export function shouldCarryBubbleClosedLoopActionHistory(config) {
  const source = asObject(config);
  const mode = String(source.bubble_controller_mode || source.bubbleControllerMode || '').trim().toLowerCase().replace(/-/g, '_');
  return mode === 'auto_apply' || boolish(source.bubble_controller_auto_apply) || boolish(source.bubbleControllerAutoApply);
}

export function attachBubbleClosedLoopActionHistory(runConfig, tasks, summaries = {}, limit = 3) {
  if (!runConfig || typeof runConfig !== 'object' || Array.isArray(runConfig)) return [];
  if (!shouldCarryBubbleClosedLoopActionHistory(runConfig)) return [];
  const history = collectBubbleClosedLoopActionHistoryFromTasks(tasks, summaries, limit);
  if (!history.length) return [];
  runConfig.bubble_closed_loop_action_history = history;
  if (runConfig.bubble_closed_loop_cross_run_cooldown_runs == null || runConfig.bubble_closed_loop_cross_run_cooldown_runs === '') {
    runConfig.bubble_closed_loop_cross_run_cooldown_runs = 1;
  }
  return history;
}

export function getBubbleClosedLoopHistoryBucket(state) {
  const info = normalizeBubbleClosedLoopState(state);
  if (!info) return 'none';
  if (HISTORY_KEPT_STATUSES.has(info.status)) return 'kept';
  if (HISTORY_ROLLBACK_STATUSES.has(info.status)) return 'rollback';
  if (HISTORY_BLOCKED_STATUSES.has(info.status) || info.blockedReasons.length > 0) return 'blocked';
  if (HISTORY_ACTIVE_STATUSES.has(info.status)) return 'active';
  return 'other';
}

export function normalizeBubbleClosedLoopState(state) {
  const source = asObject(state);
  const latest = asObject(source.latest_action);
  const active = asObject(source.active_action);
  const action = Object.keys(latest).length ? latest : active;
  const evaluation = asObject(action.evaluation);
  const before = asObject(evaluation.before);
  const after = asObject(evaluation.after);
  const status = String(action.status || source.status || '');
  if (!status && !Object.keys(action).length) return null;
  const visual = statusVisual(status);
  const gainPct = finiteNumber(evaluation.steady_samples_per_second_gain_pct);
  return {
    status,
    label: visual.label,
    color: visual.color,
    icon: visual.icon,
    mode: String(source.mode || ''),
    reason: String(source.reason || ''),
    blockedReasons: Array.isArray(source.blocked_reasons) ? source.blocked_reasons.map(String).filter(Boolean) : [],
    actionId: String(action.action_id || ''),
    domain: String(action.domain || source.domain || ''),
    actionKind: String(action.action_kind || source.candidate_action || ''),
    appliedStep: finiteNumber(action.applied_step),
    cooldownUntilStep: finiteNumber(action.cooldown_until_step),
    closedStep: finiteNumber(action.closed_step),
    appliedOverlay: asObject(action.applied_overlay),
    rollbackRestore: asObject(action.rollback_restore),
    rollbackAppliedOverlay: asObject(action.rollback_applied_overlay),
    historyCount: finiteNumber(source.action_history_count) || 0,
    gainPct,
    beforeSps: finiteNumber(before.steady_samples_per_second),
    afterSps: finiteNumber(after.steady_samples_per_second),
    beforeGpu: finiteNumber(before.active_gpu_util_pct_mean),
    afterGpu: finiteNumber(after.active_gpu_util_pct_mean),
    beforeHostGap: finiteNumber(before.host_gap_share),
    afterHostGap: finiteNumber(after.host_gap_share),
  };
}

export function renderBubbleClosedLoopBadge(state) {
  const info = normalizeBubbleClosedLoopState(state);
  if (!info) return '';
  const gain = info.gainPct === null ? '' : ' · ' + formatSigned(info.gainPct, '%');
  return '<span style="font-size:0.68rem;color:' + info.color + ';background:var(--bg-hover);border:1px solid var(--border);padding:1px 6px;border-radius:4px;white-space:nowrap;">'
    + _ico(info.icon, 12) + ' Bubble Auto ' + escapeHtml(info.label + gain)
    + '</span>';
}

export function renderBubbleClosedLoopCard(state) {
  const info = normalizeBubbleClosedLoopState(state);
  if (!info) return '';
  const overlayKeys = Object.keys(info.appliedOverlay);
  const rollbackKeys = Object.keys(info.rollbackRestore);
  const blocked = info.blockedReasons.length ? '；阻断 ' + info.blockedReasons.slice(0, 3).join('，') : '';
  const stepText = [
    info.appliedStep !== null ? '应用 step ' + String(Math.round(info.appliedStep)) : '',
    info.cooldownUntilStep !== null ? '冷却到 ' + String(Math.round(info.cooldownUntilStep)) : '',
    info.closedStep !== null ? '关闭 step ' + String(Math.round(info.closedStep)) : '',
  ].filter(Boolean).join('，');
  return '<div style="margin-top:8px;">'
    + '<div class="status-card" style="border-left:3px solid ' + info.color + ';">'
    + '<div class="status-label">Bubble 在线闭环</div>'
    + '<div style="font-size:0.95rem;font-weight:700;color:' + info.color + ';margin:4px 0;">'
    + _ico(info.icon, 14) + ' ' + escapeHtml(info.label)
    + (info.gainPct !== null ? ' / 吞吐 ' + escapeHtml(formatSigned(info.gainPct, '%')) : '')
    + '</div>'
    + '<div class="status-sub">'
    + '动作 ' + escapeHtml(actionLabel(info.domain, info.actionKind))
    + (info.actionId ? '，ID ' + escapeHtml(info.actionId) : '')
    + (info.historyCount ? '，历史 ' + escapeHtml(String(info.historyCount)) + ' 次' : '')
    + blocked
    + '</div>'
    + '<div class="status-sub" style="margin-top:4px;">'
    + 'steady samples/s ' + escapeHtml(formatPlain(info.beforeSps))
    + ' → ' + escapeHtml(formatPlain(info.afterSps))
    + '；GPU active ' + escapeHtml(formatPlain(info.beforeGpu, '%', 1))
    + ' → ' + escapeHtml(formatPlain(info.afterGpu, '%', 1))
    + '；host gap ' + escapeHtml(formatPlain(info.beforeHostGap, '', 3))
    + ' → ' + escapeHtml(formatPlain(info.afterHostGap, '', 3))
    + '</div>'
    + '<div class="status-sub" style="margin-top:4px;">'
    + (stepText ? escapeHtml(stepText) + '；' : '')
    + '应用项 ' + escapeHtml(overlayKeys.join(', ') || '—')
    + '；回滚项 ' + escapeHtml(rollbackKeys.join(', ') || '—')
    + '</div>'
    + '</div>'
    + '</div>';
}
