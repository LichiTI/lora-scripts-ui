import { buildSummaryFromMetrics, generateSummaryFromTaskLog, createEmptyTrainingMetrics } from '../utils/trainingMetrics.js';

export function createTaskHistorySummaryController({ api, state, renderView }) {
  function generateTrainingSummary() {
    const metrics = state.trainingMetrics;
    const elapsed = metrics.startTime ? Date.now() - metrics.startTime : 0;
    return buildSummaryFromMetrics(metrics, elapsed);
  }

  function resetTrainingMetrics(options = {}) {
    const keepLogSnapshot = !!(options && options.keepLogSnapshot);
    state.trainingMetrics = createEmptyTrainingMetrics();
    state.trainingSummary = null;
    if (!keepLogSnapshot) {
      state.trainingLogSnapshot = { taskId: '', html: '', updatedAt: 0 };
    }
  }

  function renderSummaryCard(summary) {
    if (!summary) return '';
    let lossRange = (summary.firstLoss > 0 ? summary.firstLoss.toFixed(4) : '\u2014')
      + ' \u2192 ' + (summary.lastLoss > 0 ? summary.lastLoss.toFixed(4) : '\u2014');
    if (summary.minLoss < Infinity && summary.minLoss > 0) {
      lossRange += '\uff08\u6700\u4f4e ' + summary.minLoss.toFixed(4) + '\uff09';
    }
    return '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;">'
      + '<div class="status-card" style="flex:1;min-width:150px;">'
      + '<div class="status-label">\u5e73\u5747\u901f\u5ea6</div>'
      + '<div class="status-value" style="color:' + summary.speedColor + ';">' + (summary.avgSpeed > 0 ? summary.avgSpeed.toFixed(2) + ' it/s' : '\u2014') + '</div>'
      + '<div class="status-sub">' + summary.speedRating + '</div>'
      + '</div>'
      + '<div class="status-card" style="flex:1;min-width:150px;">'
      + '<div class="status-label">Loss \u8d8b\u52bf</div>'
      + '<div class="status-value" style="color:' + summary.lossColor + ';">' + summary.lossTrend + '</div>'
      + '<div class="status-sub">' + lossRange + '</div>'
      + '</div>'
      + '<div class="status-card" style="flex:1;min-width:150px;">'
      + '<div class="status-label">\u8bad\u7ec3\u8fdb\u5ea6</div>'
      + '<div class="status-value" style="color:var(--accent);">' + (summary.epochDone > 0 ? 'Epoch ' + summary.epochDone + '/' + summary.epochTotal : 'Step ' + summary.lastStep + '/' + summary.totalSteps) + '</div>'
      + '<div class="status-sub">' + (summary.elapsedStr !== '\u2014' ? '\u8bad\u7ec3\u65f6\u957f\uff1a' + summary.elapsedStr + '\u3000' : '') + '\u91c7\u6837\u70b9\uff1a' + summary.sampleCount + '</div>'
      + '</div>'
      + '<div class="status-card" style="flex:1;min-width:150px;">'
      + '<div class="status-label">\u6700\u7ec8 Loss</div>'
      + '<div class="status-value" style="color:' + (summary.lossLevelColor || 'var(--text-dim)') + ';">' + (summary.lastLoss > 0 ? summary.lastLoss.toFixed(4) : '\u2014') + '</div>'
      + '<div class="status-sub">' + (summary.lossLevelTag || '\u2014') + '</div>'
      + '</div>'
      + '</div>'
      + '<div style="margin-top:8px;">'
      + '<div class="status-card" style="border-left:3px solid ' + summary.overallColor + ';">'
      + '<div class="status-label">\u7efc\u5408\u8bc4\u4ef7</div>'
      + '<div style="font-size:0.95rem;font-weight:700;color:' + summary.overallColor + ';margin:4px 0;">' + summary.overallRating + '</div>'
      + '<div class="status-sub">' + summary.lossDetail + '</div>'
      + '</div>'
      + '</div>';
  }

  function renderTrainingSummaryHTML() {
    const summary = state.trainingSummary;
    if (!summary) return '';
    return '<section class="form-section" id="training-summary-section">'
      + '<header class="section-header" style="display:flex;justify-content:space-between;align-items:center;">'
      + '<h3>\ud83d\udcca \u8bad\u7ec3\u603b\u7ed3</h3>'
      + '<button type="button" onclick="dismissTrainingSummary()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.1rem;padding:2px 6px;line-height:1;" title="\u5173\u95ed">\u00d7</button></header>'
      + '<div class="section-content" style="display:block;">' + renderSummaryCard(summary) + '</div>'
      + '</section>';
  }

  function saveTaskSummary(taskId, summary) {
    state.taskSummaries[taskId] = summary;
    const task = state.tasks.find((item) => item.id === taskId);
    if (task) task._summary = summary;
    state._taskHistoryDirty = true;
    try {
      const cache = JSON.parse(sessionStorage.getItem('sd-rescripts:task-summaries') || '{}');
      cache[taskId] = summary;
      sessionStorage.setItem('sd-rescripts:task-summaries', JSON.stringify(cache));
    } catch (error) { /* ignore */ }
  }

  function loadTaskSummariesFromCache() {
    const SUMMARY_VERSION = 2;
    try {
      const cache = JSON.parse(sessionStorage.getItem('sd-rescripts:task-summaries') || '{}');
      let validCount = 0;
      for (const id in cache) {
        const task = state.tasks.find((item) => item.id === id);
        if (task && task.status !== 'FINISHED') continue;
        if (cache[id] && cache[id]._v >= SUMMARY_VERSION) {
          state.taskSummaries[id] = cache[id];
          validCount += 1;
        }
      }
      if (validCount < Object.keys(cache).length) {
        sessionStorage.setItem('sd-rescripts:task-summaries', JSON.stringify(state.taskSummaries));
      }
    } catch (error) { /* ignore */ }
  }

  async function fetchTaskLogLines(taskId, preferredTail = 5000) {
    let tail = Math.max(1, Number(preferredTail || 5000) || 5000);
    let resp = await api.getTaskOutput(taskId, tail);
    let data = resp?.data || {};
    let lines = data.lines || [];
    const total = Number(data.total || 0) || 0;
    if (total > lines.length && total > tail) {
      tail = Math.min(5000, Math.max(total, tail));
      resp = await api.getTaskOutput(taskId, tail);
      data = resp?.data || {};
      lines = data.lines || [];
    }
    return lines;
  }

  async function buildAndSaveSummaryFromTaskLog(taskId) {
    const lines = await fetchTaskLogLines(taskId, 5000);
    if (lines.length === 0) return null;
    const summary = generateSummaryFromTaskLog(lines);
    saveTaskSummary(taskId, summary);
    await saveLocalTaskHistory();
    return summary;
  }

  async function loadLocalTaskHistory() {
    try {
      const resp = await fetch('/api/local/task_history');
      const data = await resp.json();
      return data?.data?.tasks || [];
    } catch (error) {
      return [];
    }
  }

  async function saveLocalTaskHistory() {
    const completed = state.tasks.filter((task) => task.status !== 'CREATED');
    if (completed.length === 0) return;
    try {
      await fetch('/api/local/task_history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: completed }),
      });
      state._taskHistoryDirty = false;
    } catch (error) { /* ignore */ }
  }

  function mergeTaskHistory(backendTasks, localHistory, currentTasks) {
    const deletedIds = state._deletedTaskIds || new Set();
    const META_KEYS = ['output_name', 'model_train_type', 'created_at', 'training_type_label', 'resolution', 'network_dim', '_summary', '_recentlyFinished'];
    const byId = new Map();
    const localById = new Map();
    const currentById = new Map();
    for (const task of (currentTasks || [])) currentById.set(task.id, task);
    for (const task of localHistory) {
      if (deletedIds.has(task.id)) continue;
      localById.set(task.id, task);
      byId.set(task.id, { ...task });
    }
    for (const task of backendTasks) {
      if (deletedIds.has(task.id)) continue;
      const existing = byId.get(task.id);
      if (existing) {
        const saved = localById.get(task.id);
        for (const key of META_KEYS) {
          if (!task[key]) {
            const current = currentById.get(task.id);
            if (current && current[key] !== undefined && current[key] !== '') task[key] = current[key];
          }
          if (saved && saved[key] !== undefined && saved[key] !== '' && !task[key]) task[key] = saved[key];
        }
        const pending = state._pendingTrainingMetadata || null;
        const activeTaskId = state.activeTrainingTaskId || (pending && pending.taskId) || '';
        const shouldUsePending = pending && (
          pending.taskId === task.id || (!activeTaskId && task.status === 'RUNNING')
        );
        let assignedPending = false;
        if (shouldUsePending) {
          const metaKeys = ['output_name', 'model_train_type', 'created_at', 'training_type_label', 'resolution', 'network_dim'];
          for (const key of metaKeys) {
            if (pending[key] !== undefined && pending[key] !== '' && !task[key]) task[key] = pending[key];
          }
          if (!state.activeTrainingTaskId && task.status === 'RUNNING') {
            state.activeTrainingTaskId = task.id;
            state._pendingTrainingMetadata = { ...pending, taskId: task.id };
            assignedPending = true;
          }
        }
        Object.assign(existing, task);
        if (assignedPending) Object.assign(existing, state._pendingTrainingMetadata);
      } else {
        const pending = state._pendingTrainingMetadata || null;
        const activeTaskId = state.activeTrainingTaskId || (pending && pending.taskId) || '';
        const shouldUsePending = pending && (
          pending.taskId === task.id || (!activeTaskId && task.status === 'RUNNING')
        );
        if (shouldUsePending) {
          const metaKeys = ['output_name', 'model_train_type', 'created_at', 'training_type_label', 'resolution', 'network_dim'];
          for (const key of metaKeys) {
            if (pending[key] !== undefined && pending[key] !== '' && !task[key]) task[key] = pending[key];
          }
          if (!state.activeTrainingTaskId && task.status === 'RUNNING') {
            state.activeTrainingTaskId = task.id;
            state._pendingTrainingMetadata = { ...pending, taskId: task.id };
          }
        }
        byId.set(task.id, { ...task });
      }
    }
    const result = Array.from(byId.values());
    result.sort((a, b) => {
      if (a.status === 'RUNNING' && b.status !== 'RUNNING') return -1;
      if (b.status === 'RUNNING' && a.status !== 'RUNNING') return 1;
      return 0;
    });
    return result;
  }

  function dismissTrainingSummary() {
    state.trainingSummary = null;
    const element = document.getElementById('training-summary-section');
    if (element) element.remove();
  }

  async function showTaskSummary(taskId) {
    const panel = document.getElementById('task-summary-' + taskId);
    if (!panel) return;

    const task = state.tasks.find((item) => item.id === taskId);
    if (task && task.status !== 'FINISHED') {
      panel.innerHTML = '<span style="color:var(--text-dim);font-size:0.82rem;">失败或终止的任务不生成训练总结，请直接查看上方控制台日志。</span>';
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      return;
    }

    if (panel.dataset.loaded === 'true') {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      return;
    }

    if (state.taskSummaries[taskId] && state.taskSummaries[taskId]._v >= 2) {
      panel.innerHTML = renderSummaryCard(state.taskSummaries[taskId]);
      panel.style.display = 'block';
      panel.dataset.loaded = 'true';
      return;
    }

    panel.innerHTML = '<span style="color:var(--text-dim);font-size:0.82rem;">\u2693 \u6b63\u5728\u5206\u6790\u8bad\u7ec3\u65e5\u5fd7...</span>';
    panel.style.display = 'block';
    try {
      const summary = await buildAndSaveSummaryFromTaskLog(taskId);
      if (!summary) {
        panel.innerHTML = '<span style="color:var(--text-dim);font-size:0.82rem;">\u65e0\u8bad\u7ec3\u8f93\u51fa\u6570\u636e\uff0c\u65e0\u6cd5\u8bc4\u5206\u3002</span>';
        panel.dataset.loaded = 'true';
        return;
      }
      panel.innerHTML = renderSummaryCard(summary);
      panel.dataset.loaded = 'true';
    } catch (error) {
      panel.innerHTML = '<span style="color:#ef4444;font-size:0.82rem;">\u65e5\u5fd7\u83b7\u53d6\u5931\u8d25</span>';
    }
  }

  function bindGlobals(targetWindow) {
    targetWindow.dismissTrainingSummary = dismissTrainingSummary;
    targetWindow.showTaskSummary = showTaskSummary;
  }

  return {
    generateTrainingSummary,
    buildAndSaveSummaryFromTaskLog,
    resetTrainingMetrics,
    renderSummaryCard,
    renderTrainingSummaryHTML,
    saveTaskSummary,
    loadTaskSummariesFromCache,
    loadLocalTaskHistory,
    saveLocalTaskHistory,
    mergeTaskHistory,
    dismissTrainingSummary,
    showTaskSummary,
    bindGlobals,
  };
}
