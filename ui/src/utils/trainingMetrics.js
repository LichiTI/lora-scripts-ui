import { icon as _ico } from './dom.js';

export function createEmptyTrainingMetrics() {
  return {
    speeds: [],
    losses: [],
    epochs: [],
    startTime: null,
    lastStep: 0,
    totalSteps: 0,
  };
}

/** Incrementally collect speed/loss/epoch from latest poll lines into an existing metrics object. */
export function appendTrainingMetrics(metrics, lines, nowFactory = () => Date.now()) {
  if (!metrics.startTime) metrics.startTime = nowFactory();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const speedMatch = line.match(/(\d+\.?\d*)\s*(it\/s|s\/it)/);
    const lossMatch = line.match(/avr_loss[=:]\s*(\d+\.?\d*)/);
    const stepMatch = line.match(/\|\s*(\d+)\/(\d+)\s*\[/);
    const now = nowFactory();

    if (speedMatch) {
      let itPerSec = parseFloat(speedMatch[1]);
      if (speedMatch[2] === 's/it') itPerSec = itPerSec > 0 ? 1 / itPerSec : 0;
      metrics.speeds.push({ time: now, itPerSec });
    }

    if (lossMatch) {
      const curLoss = parseFloat(lossMatch[1]);
      const curStep = stepMatch ? parseInt(stepMatch[1]) : metrics.lastStep;
      const prevLoss = metrics.losses.length > 0 ? metrics.losses[metrics.losses.length - 1].loss : -1;
      if (curStep > metrics.lastStep || metrics.losses.length === 0 || Math.abs(curLoss - prevLoss) > 0.0001) {
        metrics.losses.push({ time: now, step: curStep, loss: curLoss });
        metrics.lastStep = curStep;
      }
    }

    if (stepMatch) {
      metrics.totalSteps = parseInt(stepMatch[2]);
      metrics.lastStep = Math.max(metrics.lastStep, parseInt(stepMatch[1]));
    }

    const ep = line.match(/epoch\s+(\d+)\/(\d+)/);
    if (ep) {
      const cur = parseInt(ep[1]);
      const tot = parseInt(ep[2]);
      if (!metrics.epochs.length || metrics.epochs[metrics.epochs.length - 1].epoch < cur) {
        metrics.epochs.push({ epoch: cur, total: tot });
      }
    }
  }
}

export function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const min = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return h + 'h ' + min + 'm ' + s + 's';
  if (min > 0) return min + 'm ' + s + 's';
  return s + 's';
}

/** Parse ALL lines at once into a metrics object (for historical replay). */
export function parseLinesIntoMetrics(lines) {
  const metrics = createEmptyTrainingMetrics();
  let prevStep = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const speedMatch = line.match(/(\d+\.?\d*)\s*(it\/s|s\/it)/);
    const lossMatch = line.match(/avr_loss[=:]\s*(\d+\.?\d*)/);
    const stepMatch = line.match(/\|\s*(\d+)\/(\d+)\s*\[/);

    if (speedMatch) {
      let itPerSec = parseFloat(speedMatch[1]);
      if (speedMatch[2] === 's/it') itPerSec = itPerSec > 0 ? 1 / itPerSec : 0;
      metrics.speeds.push({ time: 0, itPerSec });
    }

    if (lossMatch) {
      const curLoss = parseFloat(lossMatch[1]);
      const curStep = stepMatch ? parseInt(stepMatch[1]) : prevStep;
      const prevLossVal = metrics.losses.length > 0 ? metrics.losses[metrics.losses.length - 1].loss : -1;
      if (curStep > prevStep || metrics.losses.length === 0 || Math.abs(curLoss - prevLossVal) > 0.0001) {
        metrics.losses.push({ time: 0, step: curStep, loss: curLoss });
        prevStep = curStep;
      }
    }

    if (stepMatch) {
      metrics.totalSteps = parseInt(stepMatch[2]);
      prevStep = Math.max(prevStep, parseInt(stepMatch[1]));
      metrics.lastStep = prevStep;
    }

    const ep = line.match(/epoch\s+(\d+)\/(\d+)/);
    if (ep) {
      const cur = parseInt(ep[1]);
      const tot = parseInt(ep[2]);
      if (!metrics.epochs.length || metrics.epochs[metrics.epochs.length - 1].epoch < cur) {
        metrics.epochs.push({ epoch: cur, total: tot });
      }
    }
  }

  return metrics;
}

/** Pure analysis: metrics object -> summary object. */
export function buildSummaryFromMetrics(metrics, elapsedMs) {
  let avgSpeed = 0;
  let speedRating = '';
  let speedColor = '';
  if (metrics.speeds.length > 0) {
    const warmupCut = Math.max(1, Math.floor(metrics.speeds.length * 0.1));
    const stable = metrics.speeds.slice(warmupCut);
    avgSpeed = stable.reduce((sum, v) => sum + v.itPerSec, 0) / (stable.length || 1);
  }
  if (avgSpeed >= 3)        { speedRating = _ico('zap') + ' 极快'; speedColor = '#22c55e'; }
  else if (avgSpeed >= 1.5) { speedRating = _ico('zap') + ' 较快'; speedColor = '#22c55e'; }
  else if (avgSpeed >= 0.5) { speedRating = _ico('check-circle') + ' 正常'; speedColor = '#3b82f6'; }
  else if (avgSpeed >= 0.2) { speedRating = _ico('clock') + ' 较慢'; speedColor = '#f59e0b'; }
  else                      { speedRating = _ico('alert-tri') + ' 极慢'; speedColor = '#ef4444'; }

  let lossTrend = '';
  let lossColor = '';
  let lossDetail = '';
  let firstLoss = 0;
  let lastLoss = 0;
  let minLoss = Infinity;
  let lossDelta = 0;

  if (metrics.losses.length >= 2) {
    const n = metrics.losses.length;
    const headN = Math.max(1, Math.floor(n * 0.2));
    const tailN = Math.max(1, Math.floor(n * 0.2));
    const headAvg = metrics.losses.slice(0, headN).reduce((s, v) => s + v.loss, 0) / headN;
    const tailAvg = metrics.losses.slice(n - tailN).reduce((s, v) => s + v.loss, 0) / tailN;
    firstLoss = metrics.losses[0].loss;
    lastLoss = metrics.losses[n - 1].loss;
    minLoss = Math.min.apply(null, metrics.losses.map((l) => l.loss));
    lossDelta = headAvg > 0 ? (tailAvg - headAvg) / headAvg : 0;

    const halfIdx = Math.floor(n / 2);
    const latterHalf = metrics.losses.slice(halfIdx);
    const latterMean = latterHalf.reduce((s, v) => s + v.loss, 0) / latterHalf.length;
    const latterStd = Math.sqrt(latterHalf.reduce((s, v) => s + Math.pow(v.loss - latterMean, 2), 0) / latterHalf.length);
    const volatility = latterMean > 0 ? latterStd / latterMean : 0;

    if (lossDelta < -0.15) {
      lossTrend = _ico('trending-down') + ' 持续下降'; lossColor = '#22c55e';
      lossDetail = 'Loss 下降了 ' + Math.abs(lossDelta * 100).toFixed(1) + '%，训练收敛良好。';
    } else if (lossDelta < -0.03) {
      lossTrend = _ico('trending-down') + ' 缓慢下降'; lossColor = '#3b82f6';
      lossDetail = 'Loss 下降了 ' + Math.abs(lossDelta * 100).toFixed(1) + '%，收敛趋势正常。';
    } else if (lossDelta <= 0.03) {
      if (volatility > 0.15) {
        lossTrend = _ico('activity') + ' 波动较大'; lossColor = '#f59e0b';
        lossDetail = 'Loss 均值基本持平但波动率 ' + (volatility * 100).toFixed(1) + '% 偏高，可尝试降低学习率。';
      } else {
        lossTrend = _ico('minus-line') + ' 基本持平'; lossColor = '#f59e0b';
        lossDetail = 'Loss 变化仅 ' + Math.abs(lossDelta * 100).toFixed(1) + '%，可能已接近收敛或学习率不足。';
      }
    } else if (lossDelta <= 0.15) {
      lossTrend = _ico('trending-up') + ' 轻微上升'; lossColor = '#ef4444';
      lossDetail = 'Loss 上升了 ' + (lossDelta * 100).toFixed(1) + '%，可能出现过拟合迹象。';
    } else {
      lossTrend = _ico('trending-up') + ' 明显上升'; lossColor = '#ef4444';
      lossDetail = 'Loss 上升了 ' + (lossDelta * 100).toFixed(1) + '%，训练可能发散，建议检查学习率和数据集。';
    }
  } else if (metrics.losses.length === 1) {
    lastLoss = metrics.losses[0].loss;
    lossTrend = _ico('alert-tri') + ' 数据不足'; lossColor = 'var(--text-dim)';
    lossDetail = '仅采集到 1 个 loss 数据点，无法判断趋势。';
  } else {
    lossTrend = _ico('alert-tri') + ' 无数据'; lossColor = 'var(--text-dim)';
    lossDetail = '未能解析到 loss 数据。';
  }

  const lastEpoch = metrics.epochs.length > 0 ? metrics.epochs[metrics.epochs.length - 1] : null;
  const epochDone = lastEpoch ? lastEpoch.epoch : 0;
  const epochTotal = lastEpoch ? lastEpoch.total : 0;

  let overallRating = '';
  let overallColor = '';
  let lossLevelTag = '';
  let lossLevelColor = '';
  if (metrics.losses.length < 2) {
    overallRating = _ico('alert-tri') + ' 数据不足，无法综合评价';
    overallColor = 'var(--text-dim)';
    lossLevelTag = '—';
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
      lossLevelTag = '—'; lossLevelColor = 'var(--text-dim)';
    } else if (lastLoss < 0.06) {
      lossLevelTag = '低'; lossLevelColor = '#22c55e';
    } else if (lastLoss < 0.08) {
      lossLevelTag = '正常'; lossLevelColor = '#3b82f6';
    } else if (lastLoss < 0.12) {
      lossLevelTag = '正常'; lossLevelColor = '#3b82f6';
    } else if (lastLoss < 0.5) {
      lossLevelTag = '正常区间'; lossLevelColor = '#3b82f6';
    } else if (lastLoss < 1.2) {
      lossLevelTag = '自适应优化器正常范围'; lossLevelColor = '#3b82f6';
    } else {
      lossLevelTag = '偏高'; lossLevelColor = '#f59e0b';
    }

    if (lastLoss > 0) {
      let lvlNote = '';
      if (lastLoss < 0.08)       lvlNote = '最终 Loss ' + lastLoss.toFixed(4) + '。';
      else if (lastLoss < 0.5)   lvlNote = '最终 Loss ' + lastLoss.toFixed(4) + '。不同架构/优化器的 Loss 范围差异很大，请以趋势而非绝对值评判。';
      else if (lastLoss < 1.2)   lvlNote = '最终 Loss ' + lastLoss.toFixed(4) + '。Prodigy/DAdapt 等自适应优化器的 Loss 通常在 0.08–1.0 范围，这是正常的。';
      else                       lvlNote = _ico('alert-tri') + ' 最终 Loss ' + lastLoss.toFixed(4) + ' 偏高，建议检查训练参数。';
      lossDetail = lossDetail + ' ' + lvlNote;
    }

    score = Math.max(score, 0);
    if (score >= 6) {
      overallRating = _ico('trophy') + ' 优秀 — Loss 持续收敛且绝对值低，训练充分完成';
      overallColor = '#22c55e';
    } else if (score >= 4) {
      overallRating = _ico('check-circle') + ' 良好 — 基本收敛，结果可用';
      overallColor = '#22c55e';
    } else if (score >= 3) {
      overallRating = _ico('bar-chart') + ' 一般 — 有收敛趋势，建议适当增加训练步数或调整学习率';
      overallColor = '#3b82f6';
    } else if (score >= 1) {
      overallRating = _ico('alert-tri') + ' 欠佳 — 收敛不明显或 Loss 偏高，建议检查学习率、数据集和训练参数';
      overallColor = '#f59e0b';
    } else {
      overallRating = _ico('x-circle') + ' 异常 — Loss 未收敛或过高，训练结果可能不可用';
      overallColor = '#ef4444';
    }
  }

  const elapsed = typeof elapsedMs === 'number' ? elapsedMs : 0;
  const elapsedStr = elapsed > 0 ? formatDuration(elapsed) : '—';

  return {
    _v: 2,
    avgSpeed,
    speedRating,
    speedColor,
    lossTrend,
    lossColor,
    lossDetail,
    firstLoss,
    lastLoss,
    minLoss,
    lossDelta,
    epochDone,
    epochTotal,
    totalSteps: metrics.totalSteps,
    lastStep: metrics.lastStep,
    sampleCount: metrics.losses.length,
    elapsed,
    elapsedStr,
    overallRating,
    overallColor,
    lossLevelTag,
    lossLevelColor,
  };
}

export function generateSummaryFromTaskLog(lines) {
  return buildSummaryFromMetrics(parseLinesIntoMetrics(lines), 0);
}
