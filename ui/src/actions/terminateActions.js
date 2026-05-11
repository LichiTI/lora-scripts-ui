// actions/terminateActions.js — 终止训练任务 actions
//   terminateAllTasks
//
// 依赖（工厂注入）：state, api, showToast, renderView,
//   loadLocalTaskHistory, saveLocalTaskHistory, mergeTaskHistory, syncFooterAction

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
  async function terminateAllTasks() {
    const runningTasks = state.tasks.filter((t) => t.status === 'RUNNING');
    if (!runningTasks.length) {
      showToast('当前没有运行中的任务。');
      return;
    }
    try {
      for (const task of runningTasks) {
        await api.terminateTask(task.task_id || task.id);
      }
      showToast('已发送终止请求。');
      const tasksResponse = await api.getTasks();
      const backendTasks = tasksResponse?.data?.tasks || [];
      const localHistory = await loadLocalTaskHistory();
      state.tasks = mergeTaskHistory(backendTasks, localHistory, state.tasks);
      state._taskHistoryDirty = true;
      await saveLocalTaskHistory();
      syncFooterAction();
      if (state.activeModule === 'config') {
        renderView('config');
      }
    } catch (error) {
      showToast(error.message || '终止任务失败。');
    }
  }

  return { terminateAllTasks };
}
