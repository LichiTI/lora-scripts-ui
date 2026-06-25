// actions/taskHistory.js — 任务历史持久化与合并
//   loadLocalTaskHistory / saveLocalTaskHistory / mergeTaskHistory
//   deleteTaskHistory / clearAllTaskHistory
//
// 依赖（工厂注入）：state, api, showToast,
//                  getPendingTrainingMetadata, applyTaskMetadata, rememberTrainingTaskMetadata,
//                  renderView, renderTaskStatus

import { compareActiveTasksFirst, getTaskId, isTaskActive } from '../utils/taskStatus.js';
import { persistDeletedTaskIds as persistDeletedIdsToStorage } from '../utils/storage.js';

const PERSISTED_TASK_STATUSES = new Set(['FINISHED', 'COMPLETED', 'TERMINATED', 'FAILED', 'CANCELLED']);

function isTerminalTaskStatus(status) {
  return PERSISTED_TASK_STATUSES.has(String(status || '').trim().toUpperCase());
}

export function createTaskHistoryActions(deps) {
  const {
    state,
    api,
    showToast,
    renderView,
    renderTaskStatus,
  } = deps;
  // 这三个依赖可能来自后续装配的 trainingMetadata 工厂，运行时延迟解析以避免 TDZ
  const getPendingTrainingMetadata = (...args) => deps.getPendingTrainingMetadata(...args);
  const applyTaskMetadata = (...args) => deps.applyTaskMetadata(...args);
  const rememberTrainingTaskMetadata = (...args) => deps.rememberTrainingTaskMetadata(...args);

  function getPersistableTasks(tasks) {
    return (tasks || []).filter((task) => isTerminalTaskStatus(task?.status));
  }

  function persistDeletedTaskIds() {
    persistDeletedIdsToStorage(state._deletedTaskIds || []);
  }

  function setupTaskHistoryBeforeUnload() {
    window.addEventListener('beforeunload', () => {
      if (!state._taskHistoryDirty) return;
      const completed = getPersistableTasks(state.tasks);
      if (completed.length === 0) return;
      const blob = new Blob([JSON.stringify({ tasks: completed })], { type: 'application/json' });
      navigator.sendBeacon('/api/local/task_history', blob);
    });
  }

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
    const META_KEYS = ['output_name', 'model_train_type', 'created_at', 'training_type_label', 'resolution', 'network_dim', 'queue_position', 'queue_depth', 'queue_message', '_summary', '_recentlyFinished'];
    const byId = new Map();
    const localById = new Map();
    const currentById = new Map();
    for (const t of (currentTasks || [])) currentById.set(getTaskId(t), t);
    for (const t of localHistory) {
      const taskId = getTaskId(t);
      if (deletedIds.has(taskId)) continue;
      localById.set(taskId, t);
      byId.set(taskId, { ...t });
    }
    const pendingMeta = getPendingTrainingMetadata();
    const activeTaskId = state.activeTrainingTaskId || (pendingMeta && pendingMeta.taskId) || '';
    for (const t of backendTasks) {
      const taskId = getTaskId(t);
      if (deletedIds.has(taskId)) continue;
      const existing = byId.get(taskId);
      if (existing) {
        const saved = localById.get(taskId);
        // 后端覆盖 status/returncode，但保留本地已有的元数据
        for (const k of META_KEYS) {
          if (!t[k]) { const cur = currentById.get(taskId); if (cur&& cur[k] !== undefined && cur[k] !=='') t[k] = cur[k]; }
          if (saved && saved[k] !== undefined && saved[k] !== '' && !t[k]) t[k] = saved[k];
        }
        const meta = getPendingTrainingMetadata(taskId) || (!activeTaskId && isTaskActive(t) ? pendingMeta : null);
        if (meta) applyTaskMetadata(t, meta, { force: false });
        if (meta && !state.activeTrainingTaskId) rememberTrainingTaskMetadata(taskId, meta);
        Object.assign(existing, t);
      } else {
        const meta = getPendingTrainingMetadata(taskId) || (!activeTaskId && isTaskActive(t) ? pendingMeta : null);
        if (meta) applyTaskMetadata(t, meta, { force: false });
        if (meta && !state.activeTrainingTaskId) rememberTrainingTaskMetadata(taskId, meta);
        byId.set(taskId, { ...t });
      }
    }
    const arr = Array.from(byId.values());
    arr.sort(compareActiveTasksFirst);
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
      const localCount = state.tasks.filter(t => !isTaskActive(t)).length;
      // 后端 DELETE /api/tasks 会返回 {data: {deleted: N}}，优先使用其计数；失败时回退到本地统计
      const resp = await api.deleteAllTasks();
      const backendDeleted = Number(resp?.data?.deleted);
      const deletedCount = Number.isFinite(backendDeleted) ? backendDeleted : localCount;
      // 重新拉取任务列表
      const tasksResponse = await api.getTasks();
   // 把所有非运行中的任务加入黑名单，防止轮询又拉回来
      const allBackendTasks = tasksResponse?.data?.tasks || [];
      for (const t of allBackendTasks) { if (!isTaskActive(t)) state._deletedTaskIds.add(getTaskId(t)); }
      for (const t of state.tasks) { if (!isTaskActive(t)) state._deletedTaskIds.add(getTaskId(t)); }
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
    getPersistableTasks,
    persistDeletedTaskIds,
    setupTaskHistoryBeforeUnload,
    loadLocalTaskHistory,
    saveLocalTaskHistory,
    mergeTaskHistory,
    deleteTaskHistory,
    clearAllTaskHistory,
  };
}
