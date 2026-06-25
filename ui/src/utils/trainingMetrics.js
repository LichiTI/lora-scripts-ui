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

import { _ico, escapeHtml } from './dom.js';
import { collectTrainingMetrics, parseLinesIntoMetrics } from './trainingMetricParsing.js';
import {
  getPcieCacheV0DecisionLabel,
  getPcieDeltaCacheNextLabel,
  renderPcieTransferBenchmarkCard,
  renderSmartSensingRecommendationList,
  renderUnifiedRecommendationCard,
} from './trainingMetricRecommendations.js';
import { renderBubbleClosedLoopCard } from './bubbleClosedLoopEvidence.js';
import { renderMultiBatchEvidenceCard } from './multiBatchEvidence.js';
import { renderTrainingRuntimeSummaryCard } from './trainingRuntimeSummary.js';

export { collectTrainingMetrics, createEmptyMetrics, parseLinesIntoMetrics } from './trainingMetricParsing.js';
export {
  getSmartSensingRecommendationItems,
  getTransferFormatDisplayName,
  renderPcieTransferBenchmarkCard,
  renderSmartSensingRecommendationList,
  renderUnifiedRecommendationCard,
} from './trainingMetricRecommendations.js';

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
  if (avgSpeed >= 3) { speedRating = _ico('zap') + ' \u6781\u5feb'; speedColor = 'var(--success)'; }
  else if (avgSpeed >= 1.5) { speedRating = _ico('zap') + ' \u8f83\u5feb'; speedColor = 'var(--success)'; }
  else if (avgSpeed >= 0.5) { speedRating = _ico('check-circle') + ' \u6b63\u5e38'; speedColor = 'var(--info)'; }
  else if (avgSpeed >= 0.2) { speedRating = _ico('clock') + ' \u8f83\u6162'; speedColor = 'var(--warning)'; }
  else { speedRating = _ico('alert-tri') + ' \u6781\u6162'; speedColor = 'var(--danger)'; }

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
      lossTrend = _ico('trending-down') + ' \u6301\u7eed\u4e0b\u964d'; lossColor = 'var(--success)';
      lossDetail = 'Loss \u4e0b\u964d\u4e86 ' + Math.abs(lossDelta * 100).toFixed(1) + '%\uff0c\u8bad\u7ec3\u6536\u655b\u826f\u597d\u3002';
    } else if (lossDelta < -0.03) {
      lossTrend = _ico('trending-down') + ' \u7f13\u6162\u4e0b\u964d'; lossColor = 'var(--info)';
      lossDetail = 'Loss \u4e0b\u964d\u4e86 ' + Math.abs(lossDelta * 100).toFixed(1) + '%\uff0c\u6536\u655b\u8d8b\u52bf\u6b63\u5e38\u3002';
    } else if (lossDelta <= 0.03) {
      if (volatility > 0.15) {
        lossTrend = _ico('activity') + ' \u6ce2\u52a8\u8f83\u5927'; lossColor = 'var(--warning)';
        lossDetail = 'Loss \u5747\u503c\u57fa\u672c\u6301\u5e73\u4f46\u6ce2\u52a8\u7387 ' + (volatility * 100).toFixed(1) + '% \u504f\u9ad8\uff0c\u53ef\u5c1d\u8bd5\u964d\u4f4e\u5b66\u4e60\u7387\u3002';
      } else {
        lossTrend = _ico('minus-line') + ' \u57fa\u672c\u6301\u5e73'; lossColor = 'var(--warning)';
        lossDetail = 'Loss \u53d8\u5316\u4ec5 ' + Math.abs(lossDelta * 100).toFixed(1) + '%\uff0c\u53ef\u80fd\u5df2\u63a5\u8fd1\u6536\u655b\u6216\u5b66\u4e60\u7387\u4e0d\u8db3\u3002';
      }
    } else if (lossDelta <= 0.15) {
      lossTrend = _ico('trending-up') + ' \u8f7b\u5fae\u4e0a\u5347'; lossColor = 'var(--danger)';
      lossDetail = 'Loss \u4e0a\u5347\u4e86 ' + (lossDelta * 100).toFixed(1) + '%\uff0c\u53ef\u80fd\u51fa\u73b0\u8fc7\u62df\u5408\u8ff9\u8c61\u3002';
    } else {
      lossTrend = _ico('trending-up') + ' \u660e\u663e\u4e0a\u5347'; lossColor = 'var(--danger)';
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
      lossLevelTag = '\u4f4e'; lossLevelColor = 'var(--success)';
    } else if (lastLoss < 0.08) {
      lossLevelTag = '\u6b63\u5e38'; lossLevelColor = 'var(--info)';
    } else if (lastLoss < 0.12) {
      lossLevelTag = '\u6b63\u5e38'; lossLevelColor = 'var(--info)';
    } else if (lastLoss < 0.5) {
      lossLevelTag = '\u6b63\u5e38\u533a\u95f4'; lossLevelColor = 'var(--info)';
    } else if (lastLoss < 1.2) {
      lossLevelTag = '\u81ea\u9002\u5e94\u4f18\u5316\u5668\u6b63\u5e38\u8303\u56f4'; lossLevelColor = 'var(--info)';
    } else {
      lossLevelTag = '\u504f\u9ad8'; lossLevelColor = 'var(--warning)';
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
      overallColor = 'var(--success)';
    } else if (score >= 4) {
      overallRating = _ico('check-circle') + ' \u826f\u597d \u2014 \u57fa\u672c\u6536\u655b\uff0c\u7ed3\u679c\u53ef\u7528';
      overallColor = 'var(--success)';
    } else if (score >= 3) {
      overallRating = _ico('bar-chart') + ' \u4e00\u822c \u2014 \u6709\u6536\u655b\u8d8b\u52bf\uff0c\u5efa\u8bae\u9002\u5f53\u589e\u52a0\u8bad\u7ec3\u6b65\u6570\u6216\u8c03\u6574\u5b66\u4e60\u7387';
      overallColor = 'var(--info)';
    } else if (score >= 1) {
      overallRating = _ico('alert-tri') + ' \u6b20\u4f73 \u2014 \u6536\u655b\u4e0d\u660e\u663e\u6216 Loss \u504f\u9ad8\uff0c\u5efa\u8bae\u68c0\u67e5\u5b66\u4e60\u7387\u3001\u6570\u636e\u96c6\u548c\u8bad\u7ec3\u53c2\u6570';
      overallColor = 'var(--warning)';
    } else {
      overallRating = _ico('x-circle') + ' \u5f02\u5e38 \u2014 Loss \u672a\u6536\u655b\u6216\u8fc7\u9ad8\uff0c\u8bad\u7ec3\u7ed3\u679c\u53ef\u80fd\u4e0d\u53ef\u7528';
      overallColor = 'var(--danger)';
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
    sdxlLoraLowVramProfile: m.sdxlLoraLowVramProfile || null,
    pcieDeltaCache: m.pcieDeltaCache || null,
    pcieCacheV0: m.pcieCacheV0 || null,
    pcieCacheV0Recommendation: m.pcieCacheV0Recommendation || null,
    vramSmartSensingRuntime: m.vramSmartSensingRuntime || null,
    compileRuntime: m.compileRuntime || null,
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

function _asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function _finiteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function _formatSigned(value, suffix = '', digits = 1) {
  const num = _finiteNumber(value);
  if (num === null) return '—';
  const sign = num > 0 ? '+' : '';
  return sign + num.toFixed(digits) + suffix;
}

function _formatPlain(value, suffix = '', digits = 2) {
  const num = _finiteNumber(value);
  if (num === null) return '—';
  return num.toFixed(digits) + suffix;
}

function _reasonLabel(reason) {
  const labels = {
    throughput_gain_met: '吞吐收益达标',
    throughput_gain_below_threshold: '吞吐收益未达阈值',
    throughput_regressed: '吞吐回退',
    missing_throughput_evidence: '缺少吞吐证据',
    vram_ratio_exceeded: '显存超过阈值',
    loss_regressed: 'Loss 回退',
    before_throughput_estimated: '基线吞吐为估算',
    after_throughput_estimated: 'patched 吞吐为估算',
    missing_action_ledger_source_report: '缺少源 run 证据',
  };
  return labels[reason] || reason;
}

export function normalizeBubbleAdvisorAbEvidence(evidence) {
  const source = _asObject(evidence);
  if (!source.report && !source.decision && !source.comparison) return null;
  const decision = _asObject(source.decision);
  const comparison = _asObject(source.comparison);
  const action = _asObject(source.action);
  const before = _asObject(source.before);
  const after = _asObject(source.after);
  const beforeMetrics = _asObject(before.metrics);
  const afterMetrics = _asObject(after.metrics);
  const status = String(source.status || decision.status || 'needs_review');
  const recommendedAction = String(decision.recommended_action || '');
  const statusMap = {
    keep_recommended: { label: '建议保留', color: 'var(--success)', icon: 'check-circle' },
    rollback_recommended: { label: '建议回滚', color: 'var(--danger)', icon: 'rotate-ccw' },
    needs_review: { label: '需要复核', color: 'var(--warning)', icon: 'alert-tri' },
    insufficient_evidence: { label: '证据不足', color: 'var(--text-dim)', icon: 'alert-tri' },
  };
  const visual = statusMap[status] || statusMap.needs_review;
  const reasons = Array.isArray(decision.reasons) ? decision.reasons.map(function(item) { return String(item); }).filter(Boolean) : [];
  return {
    status,
    recommendedAction,
    label: visual.label,
    color: visual.color,
    icon: visual.icon,
    actionId: String(action.action_id || ''),
    domain: String(action.domain || ''),
    actionKind: String(action.action_kind || ''),
    gainPct: _finiteNumber(comparison.steady_samples_per_second_gain_pct),
    beforeSps: _finiteNumber(comparison.steady_samples_per_second_before),
    afterSps: _finiteNumber(comparison.steady_samples_per_second_after),
    gpuDelta: _finiteNumber(comparison.active_gpu_util_pct_delta),
    vramDelta: _finiteNumber(comparison.peak_vram_mb_delta),
    lossDelta: _finiteNumber(comparison.final_loss_delta),
    beforeGpu: _finiteNumber(beforeMetrics.active_gpu_util_pct_mean),
    afterGpu: _finiteNumber(afterMetrics.active_gpu_util_pct_mean),
    beforeCase: String(before.case_id || ''),
    afterCase: String(after.case_id || ''),
    reasons,
    autoPair: _asObject(source.auto_pair),
  };
}

export function renderBubbleAdvisorAbEvidenceBadge(evidence) {
  const info = normalizeBubbleAdvisorAbEvidence(evidence);
  if (!info) return '';
  const gain = info.gainPct === null ? '' : ' · 吞吐 ' + _formatSigned(info.gainPct, '%');
  return '<span style="font-size:0.68rem;color:' + info.color + ';background:var(--bg-hover);border:1px solid var(--border);padding:1px 6px;border-radius:4px;white-space:nowrap;">'
    + _ico(info.icon, 12) + ' Bubble A/B ' + escapeHtml(info.label + gain)
    + '</span>';
}

export function renderBubbleAdvisorAbEvidenceCard(evidence) {
  const info = normalizeBubbleAdvisorAbEvidence(evidence);
  if (!info) return '';
  const domain = [info.domain, info.actionKind].filter(Boolean).join(' / ') || 'advisor patch';
  const reasonText = info.reasons.length
    ? info.reasons.slice(0, 3).map(_reasonLabel).join('，')
    : '暂无详细原因';
  const autoPairText = info.autoPair && info.autoPair.baseline_found === false
    ? '未自动找到基线证据'
    : '已关联基线证据';
  return '<div style="margin-top:8px;">'
    + '<div class="status-card" style="border-left:3px solid ' + info.color + ';">'
    + '<div class="status-label">Bubble Advisor A/B</div>'
    + '<div style="font-size:0.95rem;font-weight:700;color:' + info.color + ';margin:4px 0;">'
    + _ico(info.icon, 14) + ' ' + escapeHtml(info.label)
    + (info.gainPct !== null ? ' / 吞吐 ' + escapeHtml(_formatSigned(info.gainPct, '%')) : '')
    + '</div>'
    + '<div class="status-sub">'
    + '动作 ' + escapeHtml(domain)
    + (info.actionId ? '，ID ' + escapeHtml(info.actionId) : '')
    + '；' + escapeHtml(reasonText)
    + '</div>'
    + '<div class="status-sub" style="margin-top:4px;">'
    + 'steady samples/s ' + escapeHtml(_formatPlain(info.beforeSps, '', 3))
    + ' → ' + escapeHtml(_formatPlain(info.afterSps, '', 3))
    + '；GPU active Δ ' + escapeHtml(_formatSigned(info.gpuDelta, '%'))
    + '；VRAM Δ ' + escapeHtml(_formatSigned(info.vramDelta, ' MB'))
    + '；Loss Δ ' + escapeHtml(_formatSigned(info.lossDelta, '', 4))
    + '</div>'
    + '<div class="status-sub" style="margin-top:4px;">'
    + escapeHtml(autoPairText)
    + (info.beforeGpu !== null || info.afterGpu !== null
      ? '；GPU active ' + escapeHtml(_formatPlain(info.beforeGpu, '%')) + ' → ' + escapeHtml(_formatPlain(info.afterGpu, '%'))
      : '')
    + '</div>'
    + '</div>'
    + '</div>';
}

/**
 * 将 summary 对象渲染为 HTML 卡片。
 */
export function renderSummaryCard(s, extra = {}) {
  if (!s) return '';
  const showCompileRuntime = !!extra.showCompileRuntime;
  let lossRange = (s.firstLoss > 0 ? s.firstLoss.toFixed(4) : '\u2014')
    + ' \u2192 ' + (s.lastLoss > 0 ? s.lastLoss.toFixed(4) : '\u2014');
  if (s.minLoss < Infinity && s.minLoss > 0) {
    lossRange += '\uff08\u6700\u4f4e ' + s.minLoss.toFixed(4) + '\uff09';
  }
  const pcie = s.pcieDeltaCache && typeof s.pcieDeltaCache === 'object' ? s.pcieDeltaCache : null;
  const cacheV0 = s.pcieCacheV0 && typeof s.pcieCacheV0 === 'object' ? s.pcieCacheV0 : null;
  const cacheV0Recommendation = s.pcieCacheV0Recommendation && typeof s.pcieCacheV0Recommendation === 'object' ? s.pcieCacheV0Recommendation : null;
  const smart = s.vramSmartSensingRuntime && typeof s.vramSmartSensingRuntime === 'object' ? s.vramSmartSensingRuntime : null;
  const compileRuntime = s.compileRuntime && typeof s.compileRuntime === 'object' ? s.compileRuntime : null;
  const lowVramProfile = s.sdxlLoraLowVramProfile && typeof s.sdxlLoraLowVramProfile === 'object' ? s.sdxlLoraLowVramProfile : null;
  const pcieTransferBenchmark = extra.pcieTransferBenchmark || null;
  const bubbleAdvisorAbEvidence = extra.bubbleAdvisorAbEvidence
    || extra.bubble_advisor_ab_evidence
    || s.bubbleAdvisorAbEvidence
    || s.bubble_advisor_ab_evidence
    || null;
  const bubbleAdvisorAbEvidenceCard = renderBubbleAdvisorAbEvidenceCard(bubbleAdvisorAbEvidence);
  const bubbleClosedLoopState = extra.bubbleClosedLoopState
    || extra.bubble_closed_loop_state
    || s.bubbleClosedLoopState
    || s.bubble_closed_loop_state
    || null;
  const bubbleClosedLoopCard = renderBubbleClosedLoopCard(bubbleClosedLoopState);
  const multiBatchEvidence = extra.multiBatchEvidence
    || extra.multi_batch_evidence
    || s.multiBatchEvidence
    || {
      multi_batch_promotion_gate: extra.multiBatchPromotionGate || extra.multi_batch_promotion_gate || s.multiBatchPromotionGate || s.multi_batch_promotion_gate,
      multi_batch_dataloader: extra.multiBatchDataloader || extra.multi_batch_dataloader || s.multiBatchDataloader || s.multi_batch_dataloader,
      multi_batch_stability_candidate_evidence: extra.multiBatchStabilityCandidateEvidence || extra.multi_batch_stability_candidate_evidence || s.multiBatchStabilityCandidateEvidence || s.multi_batch_stability_candidate_evidence,
    };
  const multiBatchEvidenceCard = renderMultiBatchEvidenceCard(multiBatchEvidence);
  const trainingRuntimeSummary = extra.trainingRuntimeSummary
    || extra.training_runtime_summary
    || s.trainingRuntimeSummary
    || s.training_runtime_summary
    || null;
  const trainingRuntimeSummaryCard = renderTrainingRuntimeSummaryCard(trainingRuntimeSummary);
  const pcieNextLabel = pcie ? getPcieDeltaCacheNextLabel(pcie) : '';
  const pcieCard = pcie ? (
    '<div style="margin-top:8px;">'
    + '<div class="status-card" style="border-left:3px solid ' + (Number(pcie.errors || 0) > 0 ? 'var(--danger)' : 'var(--info)') + ';">'
    + '<div class="status-label">PCIe Delta/Cache 候选</div>'
    + '<div style="font-size:0.95rem;font-weight:700;color:var(--text);margin:4px 0;">'
    + escapeHtml(String(pcie.candidates || 0)) + ' 个候选 / 高价值 ' + escapeHtml(String(pcie.high || 0))
    + '</div>'
    + '<div class="status-sub">'
    + '传输 ' + escapeHtml(Number(pcie.transfer || 0).toFixed(1)) + ' MB，估算缓存 '
    + escapeHtml(Number(pcie.estimated_cache || 0).toFixed(1)) + ' MB，miss '
    + escapeHtml(String(pcie.prefetch_missed || 0)) + '，错误 ' + escapeHtml(String(pcie.errors || 0))
    + '</div>'
    + '<div class="status-sub" style="margin-top:4px;">' + escapeHtml(pcieNextLabel) + '；prefetch 已完整覆盖时通常不需要 Cache v0</div>'
    + '</div>'
    + '</div>'
  ) : '';
  const cacheV0Card = cacheV0 ? (
    '<div style="margin-top:8px;">'
    + '<div class="status-card" style="border-left:3px solid ' + (Number(cacheV0.errors || 0) > 0 ? 'var(--danger)' : (cacheV0.enabled ? 'var(--success)' : '#94a3b8')) + ';">'
    + '<div class="status-label">PCIe Cache v0</div>'
    + '<div style="font-size:0.95rem;font-weight:700;color:var(--text);margin:4px 0;">'
    + (cacheV0.enabled ? '已启用' : '未启用') + ' / 选中 ' + escapeHtml(String(cacheV0.selected || 0))
    + '</div>'
    + '<div class="status-sub">'
    + '缓存 ' + escapeHtml(Number(cacheV0.cache || 0).toFixed(1)) + ' MB / 预算 '
    + escapeHtml(Number(cacheV0.budget || 0).toFixed(1)) + ' MB，hit/miss '
    + escapeHtml(String(cacheV0.hits || 0)) + '/' + escapeHtml(String(cacheV0.misses || 0))
    + '，错误 ' + escapeHtml(String(cacheV0.errors || 0))
    + '</div>'
    + '<div class="status-sub" style="margin-top:4px;">' + escapeHtml(String(cacheV0.reason || '')) + '；适合 prefetch miss 高或关闭时对比</div>'
    + '</div>'
    + '</div>'
  ) : '';
  const cacheV0DecisionLabel = cacheV0Recommendation ? getPcieCacheV0DecisionLabel(cacheV0Recommendation) : '';
  const cacheV0RecommendationCard = cacheV0Recommendation ? (
    '<div style="margin-top:8px;">'
    + '<div class="status-card" style="border-left:3px solid ' + (cacheV0Recommendation.decision === 'try_manually' ? 'var(--info)' : (cacheV0Recommendation.decision === 'do_not_try_yet' ? 'var(--danger)' : '#94a3b8')) + ';">'
    + '<div class="status-label">PCIe Cache v0 推荐</div>'
    + '<div style="font-size:0.95rem;font-weight:700;color:var(--text);margin:4px 0;">'
    + escapeHtml(cacheV0DecisionLabel) + ' / ' + (cacheV0Recommendation.will_auto_enable ? '会自动启用' : '不会自动启用')
    + '</div>'
    + '<div class="status-sub">'
    + '原因 ' + escapeHtml(String(cacheV0Recommendation.reason || '—')) + '，建议预算 '
    + escapeHtml(Number(cacheV0Recommendation.suggested_budget_mb || 0).toFixed(1)) + ' MB'
    + '</div>'
    + '<div class="status-sub" style="margin-top:4px;">候选 '
    + escapeHtml(String(cacheV0Recommendation.candidate_count || 0)) + ' / 高价值 '
    + escapeHtml(String(cacheV0Recommendation.high_value_count || 0)) + '，当前模式 '
    + escapeHtml(String(cacheV0Recommendation.current_mode || 'observe'))
    + '；这是推荐，不代表 PCIe Cache v0 已实际启用</div>'
    + '</div>'
    + '</div>'
  ) : '';
  const smartCard = smart ? (
    '<div style="margin-top:8px;">'
    + '<div class="status-card" style="border-left:3px solid ' + (smart.phase === 'runtime_slowdown' ? 'var(--warning)' : 'var(--info)') + ';">'
    + '<div class="status-label">显存智能感知</div>'
    + '<div style="font-size:0.95rem;font-weight:700;color:var(--text);margin:4px 0;">'
    + escapeHtml(String(smart.phase || 'observe')) + ' / ' + escapeHtml(String(smart.action || 'observe'))
    + '</div>'
    + '<div class="status-sub">'
    + '基线 ' + escapeHtml(Number(smart.baseline_avg_step_seconds || 0).toFixed(3)) + 's，窗口 '
    + escapeHtml(Number(smart.window_avg_step_seconds || 0).toFixed(3)) + 's，倍率 '
    + escapeHtml(Number(smart.slowdown_ratio || 0).toFixed(2))
    + '</div>'
    + (smart.phase === 'runtime_slowdown' ? '<div class="status-sub" style="margin-top:4px;font-weight:700;color:var(--text);">下次推荐配置</div>' : '')
    + renderSmartSensingRecommendationList(smart)
    + '<div class="status-sub" style="margin-top:4px;">' + (smart.phase === 'runtime_slowdown' ? '本次不会自动改策略；建议用于下次启动训练前手动配置' : (smart.shared_vram_suspected ? '疑似显存压力/共享显存介入；只输出建议，不中途改策略' : '基线观察中或未检测到显存压力')) + '</div>'
    + '</div>'
    + '</div>'
  ) : '';
  const lowVramChangeCount = lowVramProfile && lowVramProfile.changes && typeof lowVramProfile.changes === 'object'
    ? Object.keys(lowVramProfile.changes).length
    : 0;
  const lowVramSkippedCount = lowVramProfile && Array.isArray(lowVramProfile.skipped) ? lowVramProfile.skipped.length : 0;
  const lowVramWarningCount = lowVramProfile && Array.isArray(lowVramProfile.warnings) ? lowVramProfile.warnings.length : 0;
  const lowVramCard = lowVramProfile ? (
    '<div style="margin-top:8px;">'
    + '<div class="status-card" style="border-left:3px solid ' + (lowVramProfile.enabled ? 'var(--success)' : '#94a3b8') + ';">'
    + '<div class="status-label">SDXL/LoRA 低显存档位</div>'
    + '<div style="font-size:0.95rem;font-weight:700;color:var(--text);margin:4px 0;">'
    + escapeHtml(String(lowVramProfile.effective || lowVramProfile.requested || 'off'))
    + ' / ' + (lowVramProfile.enabled ? '已启用' : '未启用')
    + '</div>'
    + '<div class="status-sub">'
    + '请求 ' + escapeHtml(String(lowVramProfile.requested || 'off'))
    + '，runtime 改动 ' + escapeHtml(String(lowVramChangeCount))
    + '，跳过 ' + escapeHtml(String(lowVramSkippedCount))
    + '，警告 ' + escapeHtml(String(lowVramWarningCount))
    + '</div>'
    + '<div class="status-sub" style="margin-top:4px;">'
    + (lowVramProfile.enabled
      ? '本次训练已按该档位启用缓存、梯度检查点、组件驻留和权重交换等低显存策略。'
      : '本次未启用低显存档位；如显存紧张，可在下次启动前选择 16G 稳定档、12G 低显存档或 8G 极限档。')
    + '</div>'
    + '</div>'
    + '</div>'
  ) : '';
  const compileCard = showCompileRuntime && compileRuntime ? (
    '<div style="margin-top:8px;">'
    + '<div class="status-card" style="border-left:3px solid var(--info);">'
    + '<div class="status-label">Compile Runtime</div>'
    + '<div style="font-size:0.95rem;font-weight:700;color:var(--text);margin:4px 0;">'
    + 'route ' + escapeHtml(String(compileRuntime.route || 'unknown'))
    + ' / ' + escapeHtml(String(compileRuntime.resolved || 'eager'))
    + '</div>'
    + '<div class="status-sub">'
    + 'scope ' + escapeHtml(String(compileRuntime.torch_compile_scope || 'off'))
    + '，shape ' + escapeHtml(String(compileRuntime.compile_shape_strategy || 'auto'))
    + '，target ' + escapeHtml(String(compileRuntime.compile_target_strategy || 'auto'))
    + '</div>'
    + '<div class="status-sub" style="margin-top:4px;">'
    + '静态 shape 来源：' + escapeHtml(String(compileRuntime.effective_static_shape_source || 'unknown'))
    + '；警告 ' + escapeHtml(String(compileRuntime.warning_count || 0))
    + '；编译命中 ' + escapeHtml(String(compileRuntime.compiled_target_messages || 0))
    + '</div>'
    + '</div>'
    + '</div>'
  ) : '';
  const benchmarkCard = renderPcieTransferBenchmarkCard(pcieTransferBenchmark);
  const recommendationCard = renderUnifiedRecommendationCard({
    pcieTransferBenchmark,
    pcieCacheV0Recommendation: cacheV0Recommendation,
    vramSmartSensingRuntime: smart,
  });
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
    + '</div>'
    + bubbleAdvisorAbEvidenceCard
    + bubbleClosedLoopCard
    + multiBatchEvidenceCard
    + trainingRuntimeSummaryCard
    + pcieCard
    + cacheV0RecommendationCard
    + cacheV0Card
    + lowVramCard
    + smartCard
    + compileCard
    + benchmarkCard
    + recommendationCard;
}
