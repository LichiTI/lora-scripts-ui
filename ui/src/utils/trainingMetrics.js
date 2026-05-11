// 训练指标解析与总结生成。
// 全部是纯函数、不访问 state，调用者传入原始日志行 / metrics 对象。
//
// metrics 对象结构：
//   {
//     speeds:   [{ time: number, itPerSec: number }, ...]
//     losses:   [{ time: number, step: number, loss: number }, ...]
//     epochs:   [{ epoch: number, total: number }, ...]
//     startTime: number | null
//     lastStep:  number
//     totalSteps: number
//   }

import { _ico } from './dom.js';

/**
 * 创建一个空的 metrics 对象。用于初始化 state.trainingMetrics 或 reset。
 */
function createEmptyMetrics() {
  return { speeds: [], losses: [], epochs: [], startTime: null, lastStep: 0, totalSteps: 0 };
}

/**
 * 从同一轮 poll 的增量日志行中增量采集指标（训练运行中调用）。
 * 会原地修改传入的 metrics 对象。
 * @param {object} metrics - 使用者提供的 metrics（通常是 state.trainingMetrics）
 * @param {string[]} lines - 本轮新增的日志行
 */
export function collectTrainingMetrics(metrics, lines) {
  const m = metrics;
  if (!m.startTime) m.startTime = Date.now();

  // 扫描所有行（不仅仅是最后一次匹配），以便在整个 tail 窗口中累积多个采样点
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const speedMatch = line.match(/(\d+\.?\d*)\s*(it\/s|s\/it)/);
    const lossMatch = line.match(/avr_loss[=:]\s*(\d+\.?\d*)/);
    const stepMatch = line.match(/\|\s*(\d+)\/(\d+)\s*\[/);
    const now = Date.now();
    if (speedMatch) {
      let itPerSec = parseFloat(speedMatch[1]);
      if (speedMatch[2] === 's/it') itPerSec = itPerSec > 0 ? 1 / itPerSec : 0;
      m.speeds.push({ time: now, itPerSec });
    }
    if (lossMatch) {
      const curLoss = parseFloat(lossMatch[1]);
      const curStep = stepMatch ? parseInt(stepMatch[1]) : m.lastStep;
      const prevLoss = m.losses.length > 0 ? m.losses[m.losses.length - 1].loss : -1;
      if (curStep > m.lastStep || m.losses.length === 0 || Math.abs(curLoss - prevLoss) > 0.0001) {
        m.losses.push({ time: now, step: curStep, loss: curLoss });
        m.lastStep = curStep;
      }
    }
    if (stepMatch) {
      m.totalSteps = parseInt(stepMatch[2]);
      m.lastStep = Math.max(m.lastStep, parseInt(stepMatch[1]));
    }
    const ep = lines[i].match(/epoch\s+(\d+)\/(\d+)/);
    if (ep) {
      const cur = parseInt(ep[1]);
      const tot = parseInt(ep[2]);
      if (!m.epochs.length || m.epochs[m.epochs.length - 1].epoch < cur) {
        m.epochs.push({ epoch: cur, total: tot });
      }
    }
  }
}

/**
 * 一次性解析全部日志行生成 metrics 对象（用于历史任务回放）。
 * @param {string[]} lines
 * @returns {object} metrics 对象
 */
export function parseLinesIntoMetrics(lines) {
  const m = createEmptyMetrics();
  let prevStep = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const speedMatch = line.match(/(\d+\.?\d*)\s*(it\/s|s\/it)/);
    const lossMatch = line.match(/avr_loss[=:]\s*(\d+\.?\d*)/);
    const stepMatch = line.match(/\|\s*(\d+)\/(\d+)\s*\[/);
    if (speedMatch) {
      let itPerSec = parseFloat(speedMatch[1]);
      if (speedMatch[2] === 's/it') itPerSec = itPerSec > 0 ? 1 / itPerSec : 0;
      m.speeds.push({ time: 0, itPerSec });
    }
    if (lossMatch) {
      const curLoss = parseFloat(lossMatch[1]);
      const curStep = stepMatch ? parseInt(stepMatch[1]) : prevStep;
      const prevLossVal = m.losses.length > 0 ? m.losses[m.losses.length - 1].loss : -1;
      if (curStep > prevStep || m.losses.length === 0 || Math.abs(curLoss - prevLossVal) > 0.0001) {
        m.losses.push({ time: 0, step: curStep, loss: curLoss });
        prevStep = curStep;
      }
    }
    if (stepMatch) {
      m.totalSteps = parseInt(stepMatch[2]);
      prevStep = Math.max(prevStep, parseInt(stepMatch[1]));
      m.lastStep = prevStep;
    }
    const ep = line.match(/epoch\s+(\d+)\/(\d+)/);
    if (ep) {
      const cur = parseInt(ep[1]);
      const tot = parseInt(ep[2]);
      if (!m.epochs.length || m.epochs[m.epochs.length - 1].epoch < cur) {
        m.epochs.push({ epoch: cur, total: tot });
      }
    }
  }
  return m;
}

/**
 * 将毫秒时长格式化为 'XhYmZs' / 'YmZs' / 'Zs'。
 */
export function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const min = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return h + 'h ' + min + 'm ' + s + 's';
  if (min > 0) return min + 'm ' + s + 's';
  return s + 's';
}

// 预留接口：SageAttention 预警已下线，但保留函数位置以防未来补回。
export function _appendSageEnvNote(_summary) {
  // no-op: SageAttention warning removed
}

/**
 * 纯分析函数：metrics 对象 → summary 对象。
 * @param {object} m - metrics 对象
 * @param {number} elapsedMs - 训练耗时毫秒数
 */
export function buildSummaryFromMetrics(m, elapsedMs) {
  let avgSpeed = 0;
  let speedRating = '';
  let speedColor = '';
  if (m.speeds.length > 0) {
    const warmupCut = Math.max(1, Math.floor(m.speeds.length * 0.1));
    const stable = m.speeds.slice(warmupCut);
    avgSpeed = stable.reduce(function (sum, v) { return sum + v.itPerSec; }, 0) / (stable.length || 1);
  }
  if (avgSpeed >= 3) { speedRating = _ico('zap') + ' \u6781\u5feb'; speedColor = '#22c55e'; }
  else if (avgSpeed >= 1.5) { speedRating = _ico('zap') + ' \u8f83\u5feb'; speedColor = '#22c55e'; }
  else if (avgSpeed >= 0.5) { speedRating = _ico('check-circle') + ' \u6b63\u5e38'; speedColor = '#3b82f6'; }
  else if (avgSpeed >= 0.2) { speedRating = _ico('clock') + ' \u8f83\u6162'; speedColor = '#f59e0b'; }
  else { speedRating = _ico('alert-tri') + ' \u6781\u6162'; speedColor = '#ef4444'; }

  let lossTrend = '';
  let lossColor = '';
  let lossDetail = '';
  let firstLoss = 0;
  let lastLoss = 0;
  let minLoss = Infinity;
  let lossDelta = 0;

  if (m.losses.length >= 2) {
    const n = m.losses.length;
    const headN = Math.max(1, Math.floor(n * 0.2));
    const tailN = Math.max(1, Math.floor(n * 0.2));
    const headAvg = m.losses.slice(0, headN).reduce(function (s, v) { return s + v.loss; }, 0) / headN;
    const tailAvg = m.losses.slice(n - tailN).reduce(function (s, v) { return s + v.loss; }, 0) / tailN;
    firstLoss = m.losses[0].loss;
    lastLoss = m.losses[n - 1].loss;
    minLoss = Math.min.apply(null, m.losses.map(function (l) { return l.loss; }));
    lossDelta = headAvg > 0 ? (tailAvg - headAvg) / headAvg : 0;

    const halfIdx = Math.floor(n / 2);
    const latterHalf = m.losses.slice(halfIdx);
    const latterMean = latterHalf.reduce(function (s, v) { return s + v.loss; }, 0) / latterHalf.length;
    const latterStd = Math.sqrt(latterHalf.reduce(function (s, v) { return s + Math.pow(v.loss - latterMean, 2); }, 0) / latterHalf.length);
    const volatility = latterMean > 0 ? latterStd / latterMean : 0;

    if (lossDelta < -0.15) {
      lossTrend = _ico('trending-down') + ' \u6301\u7eed\u4e0b\u964d'; lossColor = '#22c55e';
      lossDetail = 'Loss \u4e0b\u964d\u4e86 ' + Math.abs(lossDelta * 100).toFixed(1) + '%\uff0c\u8bad\u7ec3\u6536\u655b\u826f\u597d\u3002';
    } else if (lossDelta < -0.03) {
      lossTrend = _ico('trending-down') + ' \u7f13\u6162\u4e0b\u964d'; lossColor = '#3b82f6';
      lossDetail = 'Loss \u4e0b\u964d\u4e86 ' + Math.abs(lossDelta * 100).toFixed(1) + '%\uff0c\u6536\u655b\u8d8b\u52bf\u6b63\u5e38\u3002';
    } else if (lossDelta <= 0.03) {
      if (volatility > 0.15) {
        lossTrend = _ico('activity') + ' \u6ce2\u52a8\u8f83\u5927'; lossColor = '#f59e0b';
        lossDetail = 'Loss \u5747\u503c\u57fa\u672c\u6301\u5e73\u4f46\u6ce2\u52a8\u7387 ' + (volatility * 100).toFixed(1) + '% \u504f\u9ad8\uff0c\u53ef\u5c1d\u8bd5\u964d\u4f4e\u5b66\u4e60\u7387\u3002';
      } else {
        lossTrend = _ico('minus-line') + ' \u57fa\u672c\u6301\u5e73'; lossColor = '#f59e0b';
        lossDetail = 'Loss \u53d8\u5316\u4ec5 ' + Math.abs(lossDelta * 100).toFixed(1) + '%\uff0c\u53ef\u80fd\u5df2\u63a5\u8fd1\u6536\u655b\u6216\u5b66\u4e60\u7387\u4e0d\u8db3\u3002';
      }
    } else if (lossDelta <= 0.15) {
      lossTrend = _ico('trending-up') + ' \u8f7b\u5fae\u4e0a\u5347'; lossColor = '#ef4444';
      lossDetail = 'Loss \u4e0a\u5347\u4e86 ' + (lossDelta * 100).toFixed(1) + '%\uff0c\u53ef\u80fd\u51fa\u73b0\u8fc7\u62df\u5408\u8ff9\u8c61\u3002';
    } else {
      lossTrend = _ico('trending-up') + ' \u660e\u663e\u4e0a\u5347'; lossColor = '#ef4444';
      lossDetail = 'Loss \u4e0a\u5347\u4e86 ' + (lossDelta * 100).toFixed(1) + '%\uff0c\u8bad\u7ec3\u53ef\u80fd\u53d1\u6563\uff0c\u5efa\u8bae\u68c0\u67e5\u5b66\u4e60\u7387\u548c\u6570\u636e\u96c6\u3002';
    }
  } else if (m.losses.length === 1) {
    lastLoss = m.losses[0].loss;
    lossTrend = _ico('alert-tri') + ' \u6570\u636e\u4e0d\u8db3'; lossColor = 'var(--text-dim)';
    lossDetail = '\u4ec5\u91c7\u96c6\u5230 1 \u4e2a loss \u6570\u636e\u70b9\uff0c\u65e0\u6cd5\u5224\u65ad\u8d8b\u52bf\u3002';
  } else {
    lossTrend = _ico('alert-tri') + ' \u65e0\u6570\u636e'; lossColor = 'var(--text-dim)';
    lossDetail = '\u672a\u80fd\u89e3\u6790\u5230 loss \u6570\u636e\u3002';
  }

  const lastEpoch = m.epochs.length > 0 ? m.epochs[m.epochs.length - 1] : null;
  const epochDone = lastEpoch ? lastEpoch.epoch : 0;
  const epochTotal = lastEpoch ? lastEpoch.total : 0;

  let overallRating = '';
  let overallColor = '';
  let lossLevelTag = '';
  let lossLevelColor = '';
  if (m.losses.length < 2) {
    overallRating = _ico('alert-tri') + ' \u6570\u636e\u4e0d\u8db3\uff0c\u65e0\u6cd5\u7efc\u5408\u8bc4\u4ef7';
    overallColor = 'var(--text-dim)';
    lossLevelTag = '\u2014';
    lossLevelColor = 'var(--text-dim)';
  } else {
    const epochRatio = epochTotal > 0 ? epochDone / epochTotal : 1;
    let score = 0;
    if (lossDelta < -0.15) score += 3;
    else if (lossDelta < -0.03) score += 2;
    else if (lossDelta <= 0.03) score += 1;
    if (epochRatio >= 0.95) score += 2;
    else if (epochRatio >= 0.5) score += 1;
    if (lastLoss > 0 && lastLoss < 0.08) score += 1;

    if (lastLoss <= 0) {
      lossLevelTag = '\u2014'; lossLevelColor = 'var(--text-dim)';
    } else if (lastLoss < 0.06) {
      lossLevelTag = '\u4f4e'; lossLevelColor = '#22c55e';
    } else if (lastLoss < 0.08) {
      lossLevelTag = '\u6b63\u5e38'; lossLevelColor = '#3b82f6';
    } else if (lastLoss < 0.12) {
      lossLevelTag = '\u6b63\u5e38'; lossLevelColor = '#3b82f6';
    } else if (lastLoss < 0.5) {
      lossLevelTag = '\u6b63\u5e38\u533a\u95f4'; lossLevelColor = '#3b82f6';
    } else if (lastLoss < 1.2) {
      lossLevelTag = '\u81ea\u9002\u5e94\u4f18\u5316\u5668\u6b63\u5e38\u8303\u56f4'; lossLevelColor = '#3b82f6';
    } else {
      lossLevelTag = '\u504f\u9ad8'; lossLevelColor = '#f59e0b';
    }

    if (lastLoss > 0) {
      let lvlNote = '';
      if (lastLoss < 0.08) lvlNote = '\u6700\u7ec8 Loss ' + lastLoss.toFixed(4) + '\u3002';
      else if (lastLoss < 0.5) lvlNote = '\u6700\u7ec8 Loss ' + lastLoss.toFixed(4) + '\u3002\u4e0d\u540c\u67b6\u6784/\u4f18\u5316\u5668\u7684 Loss \u8303\u56f4\u5dee\u5f02\u5f88\u5927\uff0c\u8bf7\u4ee5\u8d8b\u52bf\u800c\u975e\u7edd\u5bf9\u503c\u8bc4\u5224\u3002';
      else if (lastLoss < 1.2) lvlNote = '\u6700\u7ec8 Loss ' + lastLoss.toFixed(4) + '\u3002Prodigy/DAdapt \u7b49\u81ea\u9002\u5e94\u4f18\u5316\u5668\u7684 Loss \u901a\u5e38\u5728 0.08\u20131.0 \u8303\u56f4\uff0c\u8fd9\u662f\u6b63\u5e38\u7684\u3002';
      else lvlNote = _ico('alert-tri') + ' \u6700\u7ec8 Loss ' + lastLoss.toFixed(4) + ' \u504f\u9ad8\uff0c\u5efa\u8bae\u68c0\u67e5\u8bad\u7ec3\u53c2\u6570\u3002';
      lossDetail = lossDetail + ' ' + lvlNote;
    }

    score = Math.max(score, 0);
    if (score >= 6) {
      overallRating = _ico('trophy') + ' \u4f18\u79c0 \u2014 Loss \u6301\u7eed\u6536\u655b\u4e14\u7edd\u5bf9\u503c\u4f4e\uff0c\u8bad\u7ec3\u5145\u5206\u5b8c\u6210';
      overallColor = '#22c55e';
    } else if (score >= 4) {
      overallRating = _ico('check-circle') + ' \u826f\u597d \u2014 \u57fa\u672c\u6536\u655b\uff0c\u7ed3\u679c\u53ef\u7528';
      overallColor = '#22c55e';
    } else if (score >= 3) {
      overallRating = _ico('bar-chart') + ' \u4e00\u822c \u2014 \u6709\u6536\u655b\u8d8b\u52bf\uff0c\u5efa\u8bae\u9002\u5f53\u589e\u52a0\u8bad\u7ec3\u6b65\u6570\u6216\u8c03\u6574\u5b66\u4e60\u7387';
      overallColor = '#3b82f6';
    } else if (score >= 1) {
      overallRating = _ico('alert-tri') + ' \u6b20\u4f73 \u2014 \u6536\u655b\u4e0d\u660e\u663e\u6216 Loss \u504f\u9ad8\uff0c\u5efa\u8bae\u68c0\u67e5\u5b66\u4e60\u7387\u3001\u6570\u636e\u96c6\u548c\u8bad\u7ec3\u53c2\u6570';
      overallColor = '#f59e0b';
    } else {
      overallRating = _ico('x-circle') + ' \u5f02\u5e38 \u2014 Loss \u672a\u6536\u655b\u6216\u8fc7\u9ad8\uff0c\u8bad\u7ec3\u7ed3\u679c\u53ef\u80fd\u4e0d\u53ef\u7528';
      overallColor = '#ef4444';
    }
  }

  const elapsed = typeof elapsedMs === 'number' ? elapsedMs : 0;
  const elapsedStr = elapsed > 0 ? formatDuration(elapsed) : '\u2014';

  return {
    _v: 2,
    avgSpeed, speedRating, speedColor,
    lossTrend, lossColor, lossDetail,
    firstLoss, lastLoss, minLoss, lossDelta,
    epochDone, epochTotal,
    totalSteps: m.totalSteps, lastStep: m.lastStep,
    sampleCount: m.losses.length,
    elapsed, elapsedStr,
    overallRating, overallColor,
    lossLevelTag, lossLevelColor,
  };
}

/**
 * 从实时 metrics 生成 summary。
 * @param {object} metrics - state.trainingMetrics
 */
export function generateTrainingSummary(metrics) {
  const elapsed = metrics.startTime ? Date.now() - metrics.startTime : 0;
  const summary = buildSummaryFromMetrics(metrics, elapsed);
  _appendSageEnvNote(summary);
  return summary;
}

/**
 * 从历史任务的全量日志生成 summary。
 */
export function generateSummaryFromTaskLog(lines) {
  const m = parseLinesIntoMetrics(lines);
  return buildSummaryFromMetrics(m, 0);
}

/**
 * 将 summary 对象渲染为 HTML 卡片。
 */
export function renderSummaryCard(s) {
  if (!s) return '';
  let lossRange = (s.firstLoss > 0 ? s.firstLoss.toFixed(4) : '\u2014')
    + ' \u2192 ' + (s.lastLoss > 0 ? s.lastLoss.toFixed(4) : '\u2014');
  if (s.minLoss < Infinity && s.minLoss > 0) {
    lossRange += '\uff08\u6700\u4f4e ' + s.minLoss.toFixed(4) + '\uff09';
  }
  return '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;">'
    + '<div class="status-card" style="flex:1;min-width:150px;">'
    + '<div class="status-label">\u5e73\u5747\u901f\u5ea6</div>'
    + '<div class="status-value" style="color:' + s.speedColor + ';">' + (s.avgSpeed > 0 ? s.avgSpeed.toFixed(2) + ' it/s' : '\u2014') + '</div>'
    + '<div class="status-sub">' + s.speedRating + '</div>'
    + '</div>'
    + '<div class="status-card" style="flex:1;min-width:150px;">'
    + '<div class="status-label">Loss \u8d8b\u52bf</div>'
    + '<div class="status-value" style="color:' + s.lossColor + ';">' + s.lossTrend + '</div>'
    + '<div class="status-sub">' + lossRange + '</div>'
    + '</div>'
    + '<div class="status-card" style="flex:1;min-width:150px;">'
    + '<div class="status-label">\u8bad\u7ec3\u8fdb\u5ea6</div>'
    + '<div class="status-value" style="color:var(--accent);">' + (s.epochDone > 0 ? 'Epoch ' + s.epochDone + '/' + s.epochTotal : 'Step ' + s.lastStep + '/' + s.totalSteps) + '</div>'
    + '<div class="status-sub">' + (s.elapsedStr !== '\u2014' ? '\u8bad\u7ec3\u65f6\u957f\uff1a' + s.elapsedStr + '\u3000' : '') + '\u91c7\u6837\u70b9\uff1a' + s.sampleCount + '</div>'
    + '</div>'
    + '<div class="status-card" style="flex:1;min-width:150px;">'
    + '<div class="status-label">\u6700\u7ec8 Loss</div>'
    + '<div class="status-value" style="color:' + (s.lossLevelColor || 'var(--text-dim)') + ';">' + (s.lastLoss > 0 ? s.lastLoss.toFixed(4) : '\u2014') + '</div>'
    + '<div class="status-sub">' + (s.lossLevelTag || '\u2014') + '</div>'
    + '</div>'
    + '</div>'
    + '<div style="margin-top:8px;">'
    + '<div class="status-card" style="border-left:3px solid ' + s.overallColor + ';">'
    + '<div class="status-label">\u7efc\u5408\u8bc4\u4ef7</div>'
    + '<div style="font-size:0.95rem;font-weight:700;color:' + s.overallColor + ';margin:4px 0;">' + s.overallRating + '</div>'
    + '<div class="status-sub">' + s.lossDetail + '</div>'
    + '</div>'
    + '</div>';
}
