// actions/terminateActions.js — 终止训练任务 actions
//   terminateAllTasks
//
// 依赖（工厂注入）：state, api, showToast, renderView,
//   loadLocalTaskHistory, saveLocalTaskHistory, mergeTaskHistory, syncFooterAction

import { getActiveTasks } from '../utils/taskStatus.js';

export function createTerminateActions({
  state,
  api,
  showToast,
  renderView,
  loadLocalTaskHistory,
  saveLocalTaskHistory,
  mergeTaskHistory,
  syncFooterAction,
}) {
  async function refreshTasksAfterTerminate() {
    const tasksResponse = await api.getTasks();
    const backendTasks = tasksResponse?.data?.tasks || [];
    const localHistory = await loadLocalTaskHistory();
    state.tasks = mergeTaskHistory(backendTasks, localHistory, state.tasks);
    state._taskHistoryDirty = true;
    await saveLocalTaskHistory();
    syncFooterAction();
    if (state.activeModule === 'config' || state.activeModule === 'training') {
      renderView(state.activeModule);
    }
  }

  async function terminateTask(taskId) {
    const id = String(taskId || '').trim();
    if (!id) return;
    try {
      await api.terminateTask(id);
      showToast('已发送终止/取消请求。');
      await refreshTasksAfterTerminate();
    } catch (error) {
      showToast(error.message || '终止任务失败。');
    }
  }

  async function terminateAllTasks() {
    const activeTasks = getActiveTasks(state.tasks);
    if (!activeTasks.length) {
      showToast('当前没有运行中或排队中的任务。');
      return;
    }
    try {
      for (const task of activeTasks) {
        await api.terminateTask(task.task_id || task.id);
      }
      showToast('已发送终止/取消请求。');
      await refreshTasksAfterTerminate();
    } catch (error) {
      showToast(error.message || '终止任务失败。');
    }
  }

  return { terminateTask, terminateAllTasks };
}
