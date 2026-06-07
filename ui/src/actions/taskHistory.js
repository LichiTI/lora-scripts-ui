// actions/taskHistory.js — 任务历史持久化与合并
//   loadLocalTaskHistory / saveLocalTaskHistory / mergeTaskHistory
//   deleteTaskHistory / clearAllTaskHistory
//

import { formatDuration } from '../utils/trainingMetrics.js';

function readTaskStartMs(task) {
  const direct = Number(task && (task.created_at_ms || task.started_at_ms || task.start_time_ms));
  if (Number.isFinite(direct) && direct > 0) return direct;
  const raw = String((task && (task.created_at || task.started_at || task.start_time)) || '').trim();
  if (!raw) return 0;
  const parsed = Date.parse(raw.replace(/\//g, '-'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function ensureTaskDuration(task) {
  if (!task) return task;
  const status = String(task.status || '').toUpperCase();
  if (status === 'RUNNING' || status === 'CREATED') return task;
  if (Number(task.duration_ms || 0) > 0) return task;
  const startMs = readTaskStartMs(task);
  const endMs = Number(task.finished_at_ms || task.completed_at_ms || task.ended_at_ms || Date.now());
  if (!startMs || !Number.isFinite(endMs) || endMs <= startMs) return task;
  task.duration_ms = endMs - startMs;
  task.duration_str = formatDuration(task.duration_ms);
  if (!task.finished_at) task.finished_at = new Date(endMs).toLocaleString('zh-CN', { hour12: false });
  if (task._summary && typeof task._summary === 'object') {
    task._summary.elapsed = task.duration_ms;
    task._summary.elapsedStr = task.duration_str;
    task._summary.totalDurationMs = task.duration_ms;
    task._summary.totalDurationStr = task.duration_str;
  }
  return task;
}
// 依赖（工厂注入）：state, api, showToast,
//                  getPersistableTasks,
//                  getPendingTrainingMetadata, applyTaskMetadata, rememberTrainingTaskMetadata,
//                  persistDeletedTaskIds, renderView, renderTaskStatus

export function createTaskHistoryActions(deps) {
  const {
    state,
    api,
    showToast,
    getPersistableTasks,
    persistDeletedTaskIds,
    renderView,
    renderTaskStatus,
  } = deps;
  // 这三个依赖可能来自后续装配的 trainingMetadata 工厂，运行时延迟解析以避免 TDZ
  const getPendingTrainingMetadata = (...args) => deps.getPendingTrainingMetadata(...args);
  const applyTaskMetadata = (...args) => deps.applyTaskMetadata(...args);
  const rememberTrainingTaskMetadata = (...args) => deps.rememberTrainingTaskMetadata(...args);

  /** Load task history from local persistent file (via Vite middleware) */
  async function loadLocalTaskHistory() {
    try {
      const resp = await fetch('/api/local/task_history');
      const data = await resp.json();
      return (data?.data?.tasks) || [];
    } catch (e) { return []; }
  }

  /** Save completed tasks to local persistent file */
  async function saveLocalTaskHistory() {
    const completed = getPersistableTasks(state.tasks);
    if (completed.length === 0) return;
    try {
      await fetch('/api/local/task_history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: completed }),
      });
      state._taskHistoryDirty = false;
    } catch(e) { /* ignore */ }
  }

  /** Merge localhistory with backend live tasks. Backend tasks take priority by id. */
 function mergeTaskHistory(backendTasks, localHistory,currentTasks) {
    const deletedIds = state._deletedTaskIds || new Set();
    const META_KEYS = ['output_name', 'model_train_type', 'created_at', 'created_at_ms', 'finished_at', 'finished_at_ms', 'duration_ms', 'duration_str', 'training_type_label', 'resolution', 'network_dim', '_summary', '_recentlyFinished'];
    const byId = new Map();
    const localById = new Map();
    const currentById = new Map();
    for (const t of (currentTasks || [])) currentById.set(t.id, t);
    for (const t of localHistory) {
      if (deletedIds.has(t.id)) continue;
      localById.set(t.id, t);
      byId.set(t.id, { ...t });
    }
    const pendingMeta = getPendingTrainingMetadata();
    const activeTaskId = state.activeTrainingTaskId || (pendingMeta && pendingMeta.taskId) || '';
    for (const t of backendTasks) {
      if (deletedIds.has(t.id)) continue;
      const existing = byId.get(t.id);
      if (existing) {
        const saved = localById.get(t.id);
        const cur = currentById.get(t.id);
        for (const k of ['created_at', 'created_at_ms']) {
          if ((t[k] === undefined || t[k] === '') && cur && cur[k] !== undefined && cur[k] !== '') t[k] = cur[k];
          if ((t[k] === undefined || t[k] === '') && saved && saved[k] !== undefined && saved[k] !== '') t[k] = saved[k];
        }
        ensureTaskDuration(t);
        // 后端覆盖 status/returncode，但保留本地已有的元数据
        for (const k of META_KEYS) {
          if (!t[k]) { const curTask = currentById.get(t.id); if (curTask&& curTask[k] !== undefined && curTask[k] !=='') t[k] = curTask[k]; }
          if (saved && saved[k] !== undefined && saved[k] !== '' && !t[k]) t[k] = saved[k];
        }
        const meta = getPendingTrainingMetadata(t.id) || (!activeTaskId && t.status === 'RUNNING'? pendingMeta : null);
        if (meta) applyTaskMetadata(t, meta, { force: false });
        if (meta && !state.activeTrainingTaskId) rememberTrainingTaskMetadata(t.id, meta);
        Object.assign(existing, t);
      } else {
        const meta = getPendingTrainingMetadata(t.id) || (!activeTaskId && t.status === 'RUNNING' ? pendingMeta : null);
        if (meta) applyTaskMetadata(t, meta, { force: false });
        if (meta && !state.activeTrainingTaskId) rememberTrainingTaskMetadata(t.id, meta);
        ensureTaskDuration(t);
        byId.set(t.id, { ...t });
      }
    }
    const arr = Array.from(byId.values());
    arr.sort((a, b) => {
      if (a.status === 'RUNNING' && b.status !== 'RUNNING') return -1;
      if (b.status === 'RUNNING' && a.status !== 'RUNNING') return 1;
      return 0;
    });
 return arr;
  }

  // ── 任务历史删除 ──

  async function deleteTaskHistory(taskId) {
    try {
      await api.deleteTask(taskId);
      state._deletedTaskIds.add(taskId);
      persistDeletedTaskIds();
      // 从前端状态中移除
      state.tasks = state.tasks.filter((t) => t.id !== taskId);
      await saveLocalTaskHistory();
      delete state.taskSummaries[taskId];
      try {
        var cache = JSON.parse(sessionStorage.getItem('sd-rescripts:task-summaries') || '{}');
        delete cache[taskId];
        sessionStorage.setItem('sd-rescripts:task-summaries', JSON.stringify(cache));
    } catch (e) { /* ignore */ }
      // 刷新界面
      if (state.activeModule === 'training') {
        renderView('training');
      }
      renderTaskStatus();
    } catch (error) {
      showToast(error.message || '删除任务失败。');
    }
  }

  async function clearAllTaskHistory() {
    if (!confirm('确认清空所有已完成的任务历史？\n（正在运行的任务不会被删除）')) return;
    try {
      const localCount = state.tasks.filter(t => t.status !== 'RUNNING').length;
      // 后端 DELETE /api/tasks 会返回 {data: {deleted: N}}，优先使用其计数；失败时回退到本地统计
      const resp = await api.deleteAllTasks();
      const backendDeleted = Number(resp?.data?.deleted);
      const deletedCount = Number.isFinite(backendDeleted) ? backendDeleted : localCount;
      // 重新拉取任务列表
      const tasksResponse = await api.getTasks();
   // 把所有非运行中的任务加入黑名单，防止轮询又拉回来
      const allBackendTasks = tasksResponse?.data?.tasks || [];
      for (const t of allBackendTasks) { if (t.status !== 'RUNNING') state._deletedTaskIds.add(t.id); }
      for (const t of state.tasks) { if (t.status !== 'RUNNING') state._deletedTaskIds.add(t.id); }
      persistDeletedTaskIds();
      state.tasks = allBackendTasks.filter(t => !state._deletedTaskIds.has(t.id));
      // 注意：api.deleteAllTasks() 内部已同步清空本地 task_history.json，这里不再重复调用
      state.taskSummaries = {};
 try { sessionStorage.removeItem('sd-rescripts:task-summaries'); } catch (e) {}
      if (state.activeModule === 'training') {
        renderView('training');
      }
      renderTaskStatus();
      showToast('已清空 ' + deletedCount + ' 条任务记录');
    } catch (error) {
      showToast(error.message || '清空历史失败。');
    }
  }

  return {
    loadLocalTaskHistory,
    saveLocalTaskHistory,
    mergeTaskHistory,
    deleteTaskHistory,
    clearAllTaskHistory,
  };
}
