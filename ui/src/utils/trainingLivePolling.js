import { $, _ico } from './dom.js';
import {
  createTrainingLogCursor,
  mergeTrainingLogLines,
  collectIncrementalTrainingLogLines,
  renderLogLines,
} from './logRender.js';
import { formatDuration } from './trainingMetrics.js';
import {
  getActiveTasks,
  getRunningTasks,
  getTaskId,
  isTaskActive,
  isTaskQueued,
  isTaskRunning,
} from './taskStatus.js';

export function createTrainingLivePolling({
  state,
  api,
  collectTrainingMetrics,
  resetTrainingMetrics,
  buildSysMonitorHTML,
}) {
  let trainingLogPollTimer = null;
  let trainingLogCursor = createTrainingLogCursor();
  let sysMonitorTimer = null;
  let gpuPollCooldown = false;

  function resetTrainingLogCursor(taskId = '') {
    trainingLogCursor = createTrainingLogCursor(taskId);
  }

  function collectIncrementalLines(taskId, lines, total, liveLine) {
    const result = collectIncrementalTrainingLogLines(trainingLogCursor, taskId, lines, total, liveLine);
    trainingLogCursor = result.cursor;
    return result.incremental;
  }

  function getActiveTrainingLogTask() {
    if (state.activeTrainingTaskId) {
      const active = state.tasks.find((task) => task.id === state.activeTrainingTaskId || task.task_id === state.activeTrainingTaskId);
      if (active) return active;
    }
    return getRunningTasks(state.tasks)[0] || getActiveTasks(state.tasks)[0] || null;
  }

  function startTrainingLogPolling() {
    if (trainingLogPollTimer) return;
    trainingLogPollTimer = setInterval(() => {
      const target = getActiveTrainingLogTask();
      if (!target) {
        clearInterval(trainingLogPollTimer);
        trainingLogPollTimer = null;
        return;
      }
      if (isTaskQueued(target)) return;
      if (!isTaskRunning(target)) {
        clearInterval(trainingLogPollTimer);
        trainingLogPollTimer = null;
        refreshTrainingLog(getTaskId(target));
        return;
      }
      refreshTrainingLog(getTaskId(target));
    }, 2000);
  }

  async function pollSystemMonitor() {
    try {
      const resp = await api.getSystemMonitor();
      if (resp && resp.data) {
        state.sysMonitor = resp.data;
        renderSysMonitorInPlace();
      }
    } catch (_e) {
      // Keep monitoring best-effort; backend status is handled elsewhere.
    }
  }

  function startSysMonitorPolling() {
    if (sysMonitorTimer) return;
    pollSystemMonitor();
    sysMonitorTimer = setInterval(() => {
      if (!state.tasks.some(isTaskActive)) {
        clearInterval(sysMonitorTimer);
        sysMonitorTimer = null;
        pollSystemMonitor();
        return;
      }
      pollSystemMonitor();
    }, 3000);
  }

  function renderSysMonitorInPlace() {
    const el = document.getElementById('sys-monitor-panel');
    if (!el) return;
    el.innerHTML = buildSysMonitorHTML();
  }

  async function refreshTrainingLog(taskId = '') {
    const running = getRunningTasks(state.tasks);
    const explicitTarget = taskId
      ? state.tasks.find((task) => task.id === taskId || task.task_id === taskId) || { id: taskId, task_id: taskId, status: 'FINISHED' }
      : null;
    const cursorTarget = trainingLogCursor.taskId
      ? state.tasks.find((task) => task.id === trainingLogCursor.taskId || task.task_id === trainingLogCursor.taskId)
      : null;
    const activeTarget = getActiveTrainingLogTask();
    const target = explicitTarget || activeTarget || running[0] || cursorTarget || state.tasks[state.tasks.length - 1];
    if (!target) return;

    const targetId = target.id || target.task_id;
    if (!targetId) return;
    if (trainingLogCursor.taskId && trainingLogCursor.taskId !== targetId) {
      resetTrainingMetrics({ keepLogSnapshot: !isTaskRunning(target) });
    }
    if (isTaskQueued(target)) return;

    try {
      const resp = await api.getTaskOutput(targetId, 1000);
      const lines = resp?.data?.lines || [];
      const total = Number(resp?.data?.total || 0) || 0;
      const liveLine = resp?.data?.live_line || '';
      const renderedLines = mergeTrainingLogLines(lines, liveLine);
      const incrementalLines = collectIncrementalLines(targetId, lines, total, liveLine);
      const logEl = $('#training-log-container');
      const isRunningTarget = isTaskRunning(target) || state.tasks.some((task) => isTaskRunning(task) && getTaskId(task) === targetId);

      if (incrementalLines.length > 0 && isRunningTarget) {
        collectTrainingMetrics(incrementalLines);
      }

      const placeholderHtml = '<span style="color:var(--text-dim);">等待训练输出...</span>';
      const nextLogHtml = renderedLines.length === 0 ? placeholderHtml : renderLogLines(renderedLines);
      state.trainingLogSnapshot = { taskId: targetId, html: nextLogHtml, updatedAt: Date.now() };

      if (!logEl) {
        updateTrainingLiveMetrics();
        return;
      }
      logEl.innerHTML = nextLogHtml;

      const autoScroll = $('#training-log-autoscroll');
      if (autoScroll?.checked) {
        logEl.scrollTop = logEl.scrollHeight;
      }

      updateTrainingLiveMetrics();
    } catch (_e) {
      // Log polling is intentionally silent to avoid noisy UI during restarts.
    }
  }

  function updateTrainingLiveMetrics() {
    const metrics = state.trainingMetrics;
    if (!metrics) return;
    const curStep = metrics.lastStep || 0;

    const hdrLabels = document.querySelectorAll('.train-hdr-label');
    if (hdrLabels.length >= 1) {
      const stepEl = hdrLabels[0].querySelector('.train-hdr-val');
      if (stepEl) stepEl.textContent = `${metrics.lastStep.toLocaleString()} / ${metrics.totalSteps > 0 ? metrics.totalSteps.toLocaleString() : '--'}`;
    }
    if (hdrLabels.length >= 2) {
      const curSpeed = metrics.speeds.length > 0 ? metrics.speeds[metrics.speeds.length - 1].itPerSec : 0;
      const remain = curSpeed > 0 && metrics.totalSteps > metrics.lastStep ? Math.round((metrics.totalSteps - metrics.lastStep) / curSpeed) : 0;
      const remainEl = hdrLabels[1].querySelector('.train-hdr-val');
      if (remainEl) remainEl.textContent = remain > 0 ? formatDuration(remain * 1000) : '--:--';
    }

    const speedEl = document.getElementById('train-live-speed');
    if (speedEl && metrics.speeds.length > 0) {
      speedEl.textContent = `${metrics.speeds[metrics.speeds.length - 1].itPerSec.toFixed(2)} it/s`;
    }

    const lossEl = document.querySelector('.train-loss-big');
    const deltaEl = document.querySelector('.train-loss-delta');
    if (lossEl && metrics.losses.length > 0) {
      const curLoss = metrics.losses[metrics.losses.length - 1].loss;
      lossEl.textContent = curLoss > 0 ? curLoss.toFixed(4) : '\u2014';
      if (deltaEl) {
        const prevLoss = metrics.losses.length > 1 ? metrics.losses[metrics.losses.length - 2].loss : curLoss;
        const lossDeltaPct = prevLoss > 0 ? ((curLoss - prevLoss) / prevLoss) * 100 : 0;
        const lossArrowColor = lossDeltaPct < 0 ? 'var(--success)' : (lossDeltaPct > 0 ? 'var(--danger)' : 'var(--text-dim)');
        const lossArrow = lossDeltaPct < 0 ? _ico('trending-down', 12) : (lossDeltaPct > 0 ? _ico('trending-up', 12) : '');
        deltaEl.style.color = lossArrowColor;
        deltaEl.innerHTML = `${lossArrow} ${lossDeltaPct !== 0 ? `${lossDeltaPct > 0 ? '+' : ''}${lossDeltaPct.toFixed(1)}%` : ''}`;
      }
    }

    const chartBox = document.querySelector('.train-chart-box');
    if (chartBox && metrics.losses.length >= 2) {
      const pts = metrics.losses.slice(-50);
      const maxLoss = Math.max(...pts.map((point) => point.loss));
      const minLoss = Math.min(...pts.map((point) => point.loss));
      const range = maxLoss - minLoss || 0.001;
      const pathParts = [];
      for (let index = 0; index < pts.length; index += 1) {
        const px = (index / (pts.length - 1)) * 100;
        const py = 100 - ((pts[index].loss - minLoss) / range) * 90 - 5;
        pathParts.push(`${index === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`);
      }
      const pathD = pathParts.join(' ');
      chartBox.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;">'
        + '<defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity="0.3"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>'
        + `<path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`
        + `<path d="${pathD} L100 100 L0 100 Z" fill="url(#lg)"/>`
        + '</svg>';
    }

    const axisEl = document.querySelector('.train-chart-axis');
    if (axisEl && metrics.losses.length > 0) {
      axisEl.innerHTML = `<span>Step 0</span><span>Step ${curStep}</span>`;
    }
  }

  async function fetchGpuStatus() {
    if (gpuPollCooldown) return;
    gpuPollCooldown = true;
    setTimeout(() => { gpuPollCooldown = false; }, 4000);
    try {
      const resp = await api.getGpuStatus();
      const data = resp && resp.data;
      if (!data || !data.available || !data.gpus || !data.gpus.length) return;
      const gpu = data.gpus[0];
      const vramText = document.getElementById('train-vram-text');
      const vramFill = document.getElementById('train-vram-fill');
      if (vramText) vramText.textContent = `${gpu.allocated_mb} / ${gpu.total_mb} MB (${gpu.utilization_pct}%)`;
      if (vramFill) vramFill.style.width = `${Math.min(gpu.utilization_pct, 100)}%`;
    } catch (_e) {
      // Best-effort live GPU chip.
    }
  }

  return {
    resetTrainingLogCursor,
    refreshTrainingLog,
    startTrainingLogPolling,
    startSysMonitorPolling,
    pollSystemMonitor,
    fetchGpuStatus,
  };
}
