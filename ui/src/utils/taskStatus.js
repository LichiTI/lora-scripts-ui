const RUNNING_STATUSES = new Set(['RUNNING', 'STARTING', 'PAUSED']);
const QUEUED_STATUSES = new Set(['QUEUED']);
const SUCCESS_STATUSES = new Set(['FINISHED', 'COMPLETED']);
const FAILURE_STATUSES = new Set(['TERMINATED', 'FAILED', 'CANCELLED', 'CANCELED']);

export function normalizeTaskStatus(status) {
  return String(status || '').trim().toUpperCase();
}

export function getTaskId(task) {
  return String(task?.id || task?.task_id || '');
}

export function isTaskRunning(taskOrStatus) {
  const status = typeof taskOrStatus === 'string' ? taskOrStatus : taskOrStatus?.status;
  return RUNNING_STATUSES.has(normalizeTaskStatus(status));
}

export function isTaskQueued(taskOrStatus) {
  const status = typeof taskOrStatus === 'string' ? taskOrStatus : taskOrStatus?.status;
  return QUEUED_STATUSES.has(normalizeTaskStatus(status));
}

export function isTaskActive(taskOrStatus) {
  return isTaskRunning(taskOrStatus) || isTaskQueued(taskOrStatus);
}

export function isTaskSuccessful(taskOrStatus) {
  const status = typeof taskOrStatus === 'string' ? taskOrStatus : taskOrStatus?.status;
  return SUCCESS_STATUSES.has(normalizeTaskStatus(status));
}

export function isTaskFailed(taskOrStatus) {
  const status = typeof taskOrStatus === 'string' ? taskOrStatus : taskOrStatus?.status;
  return FAILURE_STATUSES.has(normalizeTaskStatus(status));
}

export function isTaskTerminal(taskOrStatus) {
  return isTaskSuccessful(taskOrStatus) || isTaskFailed(taskOrStatus);
}

export function canDeleteTask(task) {
  return !isTaskActive(task);
}

export function getRunningTasks(tasks) {
  return (tasks || []).filter(isTaskRunning);
}

export function getQueuedTasks(tasks) {
  return (tasks || []).filter(isTaskQueued);
}

export function getActiveTasks(tasks) {
  return (tasks || []).filter(isTaskActive);
}

export function getQueuePosition(task) {
  const direct = numberOrNull(task?.queue_position ?? task?.metadata?.queue_position);
  if (direct !== null) return direct;
  const stages = Array.isArray(task?.stages) ? task.stages : [];
  for (let i = stages.length - 1; i >= 0; i -= 1) {
    const value = numberOrNull(stages[i]?.detail?.queue_position);
    if (value !== null) return value;
  }
  return null;
}

export function getQueueMessage(task) {
  return String(task?.queue_message || task?.metadata?.queue_message || '').trim();
}

export function getQueueMetaText(task) {
  if (!isTaskQueued(task)) return '';
  const position = getQueuePosition(task);
  const message = getQueueMessage(task);
  const parts = [];
  if (position !== null) parts.push(`队列位置 ${position}`);
  if (message) parts.push(message);
  return parts.join(' · ');
}

export function compareActiveTasksFirst(a, b) {
  const rankDelta = taskRank(b) - taskRank(a);
  if (rankDelta !== 0) return rankDelta;
  return 0;
}

function taskRank(task) {
  if (isTaskRunning(task)) return 3;
  if (isTaskQueued(task)) return 2;
  if (isTaskTerminal(task)) return 1;
  return 0;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
