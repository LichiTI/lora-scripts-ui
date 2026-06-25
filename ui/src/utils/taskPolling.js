export function createTaskPolling({
  state,
  api,
  loadLocalTaskHistory,
  mergeTaskHistory,
  setBackendOffline,
  showToast,
  renderTaskStatus,
  refreshTrainingLog,
  buildAndSaveSummaryFromTaskLog,
  generateTrainingSummary,
  saveTaskSummary,
  saveLocalTaskHistory,
  updateJSONPreview,
  syncFooterAction,
  startTrainingLogPolling,
  startSysMonitorPolling,
  renderView,
  getRunningTasks,
  getActiveTasks,
  getTaskId,
  isTaskRunning,
  isTaskFailed,
  isTaskQueued,
  isTaskSuccessful,
  $,
  _ico,
  setTimeoutImpl = (callback, delay) => window.setTimeout(callback, delay),
  baseInterval = 3000,
  maxInterval = 30000,
} = {}) {
  let pollFailCount = 0;

  async function handleTrainingFinished({ prevRunningIds, hasActive }) {
    const lastTask = state.tasks.find((task) => prevRunningIds.includes(task.id || task.task_id))
      || state.tasks[state.tasks.length - 1];
    const lastTaskId = lastTask && (lastTask.id || lastTask.task_id);
    for (const task of state.tasks) {
      if (prevRunningIds.includes(getTaskId(task)) && !isTaskRunning(task)) task._recentlyFinished = true;
    }
    const failed = lastTask && (isTaskFailed(lastTask) || (lastTask.returncode != null && lastTask.returncode !== 0));
    await refreshTrainingLog(lastTaskId);
    if (failed) {
      state.trainingSummary = null;
    } else {
      let summary = null;
      if (lastTaskId) {
        try { summary = await buildAndSaveSummaryFromTaskLog(lastTaskId); } catch (_summaryError) { summary = null; }
      }
      if (!summary) {
        summary = generateTrainingSummary();
        if (lastTaskId && summary) {
          saveTaskSummary(lastTaskId, summary);
          await saveLocalTaskHistory();
        }
      }
      state.trainingSummary = summary;
    }
    if (!hasActive) {
      state.activeTrainingTaskId = '';
      state._pendingTrainingMetadata = null;
    }
    state.trainingFailed = !!failed;
    if (hasActive) showToast('' + _ico('clock') + ' 当前训练已结束，队列中的任务将自动继续。');
    else if (!failed) showToast('' + _ico('check-circle') + ' 训练已完成');
    else showToast('' + _ico('x-circle') + ' 训练失败');
    if (state.activeModule === 'training') {
      renderView('training');
    }
  }

  function updateTrainingStatusBadge() {
    if (state.activeModule !== 'training') return;
    const badge = $('#training-status-badge');
    if (!badge) return;
    const running = getRunningTasks(state.tasks).length > 0;
    const queued = state.tasks.some(isTaskQueued);
    if (running) badge.innerHTML = '<span style="color:var(--warning);font-weight:700;">' + _ico('loader') + ' 训练中</span>';
    else if (queued) badge.innerHTML = '<span style="color:var(--info);font-weight:700;">' + _ico('clock') + ' 排队中</span>';
    else if (state.trainingFailed) badge.innerHTML = '<span style="color:var(--danger);font-weight:700;">' + _ico('x-circle') + ' 训练失败</span>';
    else if (state.tasks.some(isTaskSuccessful)) badge.innerHTML = '<span style="color:var(--success);font-weight:700;">' + _ico('check-circle') + ' 已完成</span>';
    else badge.innerHTML = '<span style="color:var(--text-dim);">空闲</span>';
  }

  function markRunningTasksTerminated() {
    const hadRunning = getRunningTasks(state.tasks).length > 0;
    state.tasks.forEach((task) => {
      if (isTaskRunning(task)) task.status = 'TERMINATED';
    });
    if (hadRunning) {
      state.trainingSummary = null;
      state.trainingFailed = true;
      syncFooterAction();
      if (state.activeModule === 'training') renderView('training');
    }
  }

  async function poll() {
    try {
      const hadRunning = getRunningTasks(state.tasks).length > 0;
      const prevRunningIds = getRunningTasks(state.tasks).map(getTaskId);

      const response = await api.getTasks();
      const backendTasks = response?.data?.tasks || [];
      const localHistory = await loadLocalTaskHistory();
      state.tasks = mergeTaskHistory(backendTasks, localHistory, state.tasks);
      state._taskHistoryDirty = true;
      const hasRunning = getRunningTasks(state.tasks).length > 0;
      const hasActive = getActiveTasks(state.tasks).length > 0;

      if (pollFailCount > 0) {
        pollFailCount = 0;
        setBackendOffline(false);
        showToast('✓ 后端服务已连接');
        renderTaskStatus();
      }

      if (hadRunning && !hasRunning) {
        await handleTrainingFinished({ prevRunningIds, hasActive });
      }

      updateJSONPreview();
      renderTaskStatus();
      syncFooterAction();
      await saveLocalTaskHistory();
      if (hasActive) {
        startTrainingLogPolling();
        startSysMonitorPolling();
      }
      updateTrainingStatusBadge();
    } catch (error) {
      pollFailCount++;
      if (pollFailCount === 1) {
        console.warn('[TaskPoll] 后端不可达，轮询将自动降频重试。', error.message || '');
        setBackendOffline(true);
        renderTaskStatus();
        syncFooterAction();
      }
      if (pollFailCount >= 3) {
        markRunningTasksTerminated();
      }
    }

    const delay = pollFailCount > 0
      ? Math.min(baseInterval * Math.pow(2, pollFailCount), maxInterval)
      : baseInterval;
    setTimeoutImpl(poll, delay);
  }

  function startTaskPolling() {
    setTimeoutImpl(poll, baseInterval);
  }

  return { startTaskPolling };
}
