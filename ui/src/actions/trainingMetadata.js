// actions/trainingMetadata.js — 训练任务元数据 + summary actions
//   collectTrainingMetrics / buildTaskMetadataFromConfig
//   getPendingTrainingMetadata / applyTaskMetadata / rememberTrainingTaskMetadata
//   resetTrainingMetrics / generateTrainingSummary
//   fetchTaskLogLines / buildAndSaveSummaryFromTaskLog
//   saveTaskSummary / loadTaskSummariesFromCache
//   showTaskSummary
//
// 依赖（工厂注入）。_resetTrainingLogCursor / saveLocalTaskHistory 仍在 main.js
// 以闭包 const身份存在，需要作为依赖注入。

import { $ } from '../utils/dom.js';
import {
  collectTrainingMetrics as _collectTrainingMetricsFromLines,
  generateTrainingSummary as _generateSummaryFromMetrics,
  generateSummaryFromTaskLog,
  renderSummaryCard,
} from '../utils/trainingMetrics.js';
import { getMultiBatchEvidenceFromTask } from '../utils/multiBatchEvidence.js';
import { getTrainingRuntimeSummaryFromTask } from '../utils/trainingRuntimeSummary.js';

export function createTrainingMetadataActions({
  state,
  api,
  TRAINING_TYPES,
  saveLocalTaskHistory,
  _resetTrainingLogCursor,
}) {
  function collectTrainingMetrics(lines) {
    // 委托给 utils/trainingMetrics.js 中的纯函数；副作用（写入 state）保留在此层
    _collectTrainingMetricsFromLines(state.trainingMetrics, lines);
  }

  function buildTaskMetadataFromConfig(config, trainingTypeId) {
    const cfg = config || {};
  const typeId = cfg.model_train_type || trainingTypeId || state.activeTrainingType || '';
    return {
      output_name: cfg.output_name || '',
      model_train_type: typeId,
      created_at: new Date().toLocaleString('zh-CN', { hour12: false }),
      training_type_label: (TRAINING_TYPES.find((item) => item.id === typeId) || {}).label || '',
      resolution: cfg.resolution || '',
      network_dim: cfg.network_dim || cfg.lokr_dim || cfg.dim || '',
    };
  }

  function getPendingTrainingMetadata(taskId = '') {
    const pending = state._pendingTrainingMetadata || null;
    if (!pending) return null;
    if (!taskId) return pending;
    if (pending.taskId && pending.taskId!== taskId) return null;
    return pending;
  }

  function applyTaskMetadata(task, metadata, options = {}) {
    if (!task || !metadata) return;
    const force = !!(options && options.force);
    const keys = ['output_name', 'model_train_type', 'created_at', 'training_type_label', 'resolution', 'network_dim'];
    for (const key of keys) {
      if (metadata[key] !== undefined && metadata[key] !== '' && (force || task[key] === undefined || task[key] === '')) {
        task[key] = metadata[key];
      }
    }
  }

  function rememberTrainingTaskMetadata(taskId, metadata = null) {
    if (!taskId) return;
    const pending = metadata || getPendingTrainingMetadata() || buildTaskMetadataFromConfig(state.config, state.activeTrainingType);
    const normalized = { ...pending, taskId };
    state._pendingTrainingMetadata = normalized;
    state.activeTrainingTaskId = taskId;
    for (const task of state.tasks) {
      if (task.id === taskId || task.task_id === taskId) applyTaskMetadata(task, normalized, { force: false });
    }
  }

  function resetTrainingMetrics(options = {}) {
    const keepLogSnapshot = !!(options && options.keepLogSnapshot);
    state.trainingMetrics ={
      speeds: [], losses: [], epochs: [],
      startTime: null, lastStep: 0, totalSteps: 0,
      bTier: null, ghostReplay: null,
      memoryOptimization: null,
      sdxlLoraLowVramProfile: null,
      precisionSwapProfile: null,
      nativeUnet: null,
      peakVramDiagnostics: null,
      cudaCacheRelease: null,
      pcieDeltaCache: null,
      pcieCacheV0: null,
      pcieCacheV0Recommendation: null,
      vramSmartSensingRuntime: null,
      compileRuntime: null,
    };
    _resetTrainingLogCursor();
    state.trainingSummary = null;
    if (!keepLogSnapshot) {
      state.trainingLogSnapshot = { taskId: '', html: '', updatedAt: 0 };
      const logEl = $('#training-log-container');
      if (logEl) {
        logEl.innerHTML = '<span style="color:var(--text-muted);">已开始新的训练任务，等待训练输出...</span>';
        logEl.scrollTop = 0;
      }
    }
  }

  // 主要工具函数已搬到 utils/trainingMetrics.js。此处保留 0参数封装。
  function generateTrainingSummary() {
    return _generateSummaryFromMetrics(state.trainingMetrics);
  }

  function summaryRenderOptions() {
    return summaryRenderOptionsForTask('');
  }

  function getTaskId(task) {
    return String((task && (task.id || task.task_id)) || '');
  }

  function getBubbleAdvisorAbEvidenceForTask(taskId, explicitTask = null) {
    var task = explicitTask || state.tasks.find(function(t) { return getTaskId(t) === taskId; }) || null;
    var metadata = task && task.metadata && typeof task.metadata === 'object' ? task.metadata : {};
    var cached = taskId && state.taskSummaries ? state.taskSummaries[taskId] : null;
    cached = cached && typeof cached === 'object' ? cached : {};
    var embedded = task && task._summary && typeof task._summary === 'object' ? task._summary : {};
    var evidence = metadata.bubble_advisor_ab_evidence
      || task?.bubble_advisor_ab_evidence
      || cached.bubbleAdvisorAbEvidence
      || cached.bubble_advisor_ab_evidence
      || embedded.bubbleAdvisorAbEvidence
      || embedded.bubble_advisor_ab_evidence
      || null;
    return evidence && typeof evidence === 'object' ? evidence : null;
  }

  function getBubbleClosedLoopStateForTask(taskId, explicitTask = null) {
    var task = explicitTask || state.tasks.find(function(t) { return getTaskId(t) === taskId; }) || null;
    var metadata = task && task.metadata && typeof task.metadata === 'object' ? task.metadata : {};
    var cached = taskId && state.taskSummaries ? state.taskSummaries[taskId] : null;
    cached = cached && typeof cached === 'object' ? cached : {};
    var embedded = task && task._summary && typeof task._summary === 'object' ? task._summary : {};
    var closedLoop = metadata.bubble_closed_loop_state
      || task?.bubble_closed_loop_state
      || cached.bubbleClosedLoopState
      || cached.bubble_closed_loop_state
      || embedded.bubbleClosedLoopState
      || embedded.bubble_closed_loop_state
      || null;
    return closedLoop && typeof closedLoop === 'object' ? closedLoop : null;
  }

  function getMultiBatchEvidenceForTask(taskId, explicitTask = null) {
    var task = explicitTask || state.tasks.find(function(t) { return getTaskId(t) === taskId; }) || null;
    return getMultiBatchEvidenceFromTask(task, state.taskSummaries);
  }

  function getTrainingRuntimeSummaryForTask(taskId, explicitTask = null) {
    var task = explicitTask || state.tasks.find(function(t) { return getTaskId(t) === taskId; }) || null;
    return getTrainingRuntimeSummaryFromTask(task, state.taskSummaries);
  }

  function summaryRenderOptionsForTask(taskId) {
    return {
      pcieTransferBenchmark: state.pcieTransferBenchmark || null,
      showCompileRuntime: true,
      bubbleAdvisorAbEvidence: getBubbleAdvisorAbEvidenceForTask(taskId),
      bubbleClosedLoopState: getBubbleClosedLoopStateForTask(taskId),
      multiBatchEvidence: getMultiBatchEvidenceForTask(taskId),
      trainingRuntimeSummary: getTrainingRuntimeSummaryForTask(taskId),
    };
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
    if (lines.length=== 0) return null;
    const summary = generateSummaryFromTaskLog(lines);
    const evidence = getBubbleAdvisorAbEvidenceForTask(taskId);
    const closedLoop = getBubbleClosedLoopStateForTask(taskId);
    const multiBatchEvidence = getMultiBatchEvidenceForTask(taskId);
    const trainingRuntimeSummary = getTrainingRuntimeSummaryForTask(taskId);
    if (evidence && summary && typeof summary === 'object') {
      summary.bubbleAdvisorAbEvidence = evidence;
    }
    if (closedLoop && summary && typeof summary === 'object') {
      summary.bubbleClosedLoopState = closedLoop;
    }
    if (multiBatchEvidence && summary && typeof summary === 'object') {
      summary.multiBatchEvidence = multiBatchEvidence;
    }
    if (trainingRuntimeSummary && summary && typeof summary === 'object') {
      summary.trainingRuntimeSummary = trainingRuntimeSummary;
    }
    saveTaskSummary(taskId, summary);
await saveLocalTaskHistory();
    return summary;
  }

  /** Save task summary to session cache */
  function saveTaskSummary(taskId, summary) {
    var task = state.tasks.find(function(t) { return getTaskId(t) === taskId; });
    var evidence = getBubbleAdvisorAbEvidenceForTask(taskId, task);
    var closedLoop = getBubbleClosedLoopStateForTask(taskId, task);
    var multiBatchEvidence = getMultiBatchEvidenceForTask(taskId, task);
    var trainingRuntimeSummary = getTrainingRuntimeSummaryForTask(taskId, task);
    if (evidence && summary && typeof summary === 'object' && !summary.bubbleAdvisorAbEvidence && !summary.bubble_advisor_ab_evidence) {
      summary = { ...summary, bubbleAdvisorAbEvidence: evidence };
    }
    if (closedLoop && summary && typeof summary === 'object' && !summary.bubbleClosedLoopState && !summary.bubble_closed_loop_state) {
      summary = { ...summary, bubbleClosedLoopState: closedLoop };
    }
    if (multiBatchEvidence && summary && typeof summary === 'object' && !summary.multiBatchEvidence && !summary.multi_batch_evidence) {
      summary = { ...summary, multiBatchEvidence };
    }
    if (trainingRuntimeSummary && summary && typeof summary === 'object' && !summary.trainingRuntimeSummary && !summary.training_runtime_summary) {
      summary = { ...summary, trainingRuntimeSummary };
    }
    state.taskSummaries[taskId] = summary;
    // 持久化：存到任务对象上，随 task_history.json 一起保存
    if (task) { task._summary = summary; }
    state._taskHistoryDirty = true;
    try {
      var cache = JSON.parse(sessionStorage.getItem('sd-rescripts:task-summaries') || '{}');
      cache[taskId] =summary;
      sessionStorage.setItem('sd-rescripts:task-summaries', JSON.stringify(cache));
    } catch (e) { /* ignore */ }
  }

  /** Load task summaries from session cache (called on init) */
  function loadTaskSummariesFromCache() {
    var SUMMARY_VERSION = 2;
    try {
      var cache = JSON.parse(sessionStorage.getItem('sd-rescripts:task-summaries') || '{}');
      var validCount = 0;
      for (var id in cache) {
        var task = state.tasks.find(function(t) { return t.id === id; });
        if (task && !['FINISHED', 'COMPLETED'].includes(String(task.status || '').toUpperCase())) continue;
        if (cache[id] && cache[id]._v >= SUMMARY_VERSION) {
          state.taskSummaries[id] = cache[id];
          validCount++;
        }
      }
      if (validCount < Object.keys(cache).length) {
        sessionStorage.setItem('sd-rescripts:task-summaries', JSON.stringify(state.taskSummaries));
      }
    } catch (e) { /* ignore */ }
  }

  /** Click handler: show/togglesummary for a historical task */
  async function showTaskSummary(taskId) {
    var panel = document.getElementById('task-summary-' + taskId);
    if (!panel) return;
    var task = state.tasks.find(function(t) { return t.id === taskId; });
 if (task && !['FINISHED', 'COMPLETED'].includes(String(task.status || '').toUpperCase())) {
      panel.innerHTML = '<span style="color:var(--text-dim);font-size:0.82rem;">失败或终止的任务不生成训练总结，请直接查看上方控制台日志。</span>';
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      return;
    }

    // Toggle: if already showing, collapse
    if(panel.dataset.loaded === 'true') {
      if (panel.style.display=== 'none') {
    panel.style.display = 'block';
      } else {
        panel.style.display = 'none';
      }
      return;
    }

  // Check cache first
    if (state.taskSummaries[taskId] && state.taskSummaries[taskId]._v >= 2) {
      panel.innerHTML = renderSummaryCard(state.taskSummaries[taskId], summaryRenderOptionsForTask(taskId));
      panel.style.display = 'block';
      panel.dataset.loaded = 'true';
      return;
    }

    // Fetch log and generate on-the-fly
    panel.innerHTML = '<span style="color:var(--text-dim);font-size:0.82rem;">\u2693 \u6b63\u5728\u5206\u6790\u8bad\u7ec3\u65e5\u5fd7...</span>';
    panel.style.display = 'block';
    try {
 var summary = await buildAndSaveSummaryFromTaskLog(taskId);
      if (!summary) {
        panel.innerHTML = '<span style="color:var(--text-dim);font-size:0.82rem;">\u65e0\u8bad\u7ec3\u8f93\u51fa\u6570\u636e\uff0c\u65e0\u6cd5\u8bc4\u5206\u3002</span>';
        panel.dataset.loaded = 'true';
        return;
      }
      panel.innerHTML = renderSummaryCard(summary, summaryRenderOptionsForTask(taskId));
      panel.dataset.loaded = 'true';
  } catch (e) {
      panel.innerHTML= '<span style="color:var(--danger);font-size:0.82rem;">\u65e5\u5fd7\u83b7\u53d6\u5931\u8d25</span>';
    }
  }

  return {
    collectTrainingMetrics,
   buildTaskMetadataFromConfig,
    getPendingTrainingMetadata,
    applyTaskMetadata,
    rememberTrainingTaskMetadata,
    resetTrainingMetrics,
    generateTrainingSummary,
    fetchTaskLogLines,
    buildAndSaveSummaryFromTaskLog,
    saveTaskSummary,
   loadTaskSummariesFromCache,
showTaskSummary,
  };
}
