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

/**
 * 创建一个空的 metrics 对象。用于初始化 state.trainingMetrics 或 reset。
 */
function createEmptyMetrics() {
  return {
    speeds: [],
    losses: [],
    epochs: [],
    startTime: null,
    lastStep: 0,
    totalSteps: 0,
    bTier: null,
    ghostReplay: null,
    memoryOptimization: null,
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
}

function parsePcieDeltaCacheLine(line) {
  if (!line || !line.includes('PCIe Delta/Cache observe:')) return null;
  const familyPrefix = line.match(/(?:^|\s)(Anima|Newbie|Native SDXL)\s+PCIe Delta\/Cache observe:/);
  const payload = line.slice(line.indexOf('PCIe Delta/Cache observe:') + 'PCIe Delta/Cache observe:'.length).trim();
  const result = {
    label: familyPrefix ? familyPrefix[1] : '',
    raw: line.trim(),
  };
  payload.split(/\s+/).forEach(function(part) {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx);
    let value = part.slice(idx + 1).replace(/[,;]$/, '');
    if (value.endsWith('MB')) value = value.slice(0, -2);
    if (['candidates', 'high', 'medium', 'prefetch_missed', 'errors'].includes(key)) {
      result[key] = Number(value) || 0;
    } else if (['transfer', 'estimated_cache'].includes(key)) {
      result[key] = Number(value) || 0;
    } else {
      result[key] = value;
    }
  });
  if (!result.family && result.label) {
    result.family = String(result.label).toLowerCase().replace(/\s+/g, '_');
  }
  return result;
}

function parsePcieCacheV0Line(line) {
  if (!line || !line.includes('PCIe Cache v0:')) return null;
  const familyPrefix = line.match(/(?:^|\s)(Anima|Newbie|Native SDXL)\s+PCIe Cache v0:/);
  const payload = line.slice(line.indexOf('PCIe Cache v0:') + 'PCIe Cache v0:'.length).trim();
  const result = {
    label: familyPrefix ? familyPrefix[1] : '',
    raw: line.trim(),
  };
  payload.split(/\s+/).forEach(function(part) {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx);
    let value = part.slice(idx + 1).replace(/[,;]$/, '');
    if (value.endsWith('MB')) value = value.slice(0, -2);
    if (key === 'enabled') {
      result.enabled = value === 'True' || value === 'true' || value === '1';
    } else if (['selected', 'hits', 'misses', 'errors'].includes(key)) {
      result[key] = Number(value) || 0;
    } else if (['cache', 'budget'].includes(key)) {
      result[key] = Number(value) || 0;
    } else {
      result[key] = value;
    }
  });
  return result;
}

function parsePcieCacheV0RecommendationLine(line) {
  if (!line || !line.includes('PCIe Cache v0 recommendation:')) return null;
  const familyPrefix = line.match(/(?:^|\s)(Anima|Newbie|Native SDXL)\s+PCIe Cache v0 recommendation:/);
  const payload = line.slice(line.indexOf('PCIe Cache v0 recommendation:') + 'PCIe Cache v0 recommendation:'.length).trim();
  const result = {
    label: familyPrefix ? familyPrefix[1] : '',
    raw: line.trim(),
  };
  payload.split(/\s+/).forEach(function(part) {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx);
    let value = part.slice(idx + 1).replace(/[,;]$/, '');
    if (value.endsWith('MB')) value = value.slice(0, -2);
    if (key === 'budget') {
      result.suggested_budget_mb = Number(value) || 0;
    } else if (key === 'auto' || key === 'will_auto_enable') {
      result.will_auto_enable = value === 'True' || value === 'true' || value === '1';
    } else {
      result[key] = value;
    }
  });
  if (result.will_auto_enable == null) result.will_auto_enable = false;
  return result;
}

function applyPcieDeltaCacheProfile(metrics, profile, label) {
  if (!profile || typeof profile !== 'object') return;
  metrics.pcieDeltaCache = {
    label: label || profile.family || '',
    family: profile.family || '',
    mode: profile.mode || '',
    candidates: Number(profile.candidate_count || 0),
    high: Number(profile.high_value_count || 0),
    medium: Number(profile.medium_value_count || 0),
    transfer: Number(profile.total_transfer_mb || 0),
    estimated_cache: Number(profile.estimated_cache_mb || 0),
    prefetch_missed: Number(profile.prefetch_missed_total || 0),
    errors: Number(profile.error_count || 0),
    next: profile.next_action || '',
    raw: profile.summary_text || '',
  };
}

function applyPcieCacheV0Profile(metrics, profile, label) {
  if (!profile || typeof profile !== 'object') return;
  metrics.pcieCacheV0 = {
    label: label || profile.family || '',
    family: profile.family || '',
    enabled: !!profile.enabled,
    mode: profile.mode || '',
    selected: Number(profile.selected_count || 0),
    skipped: Number(profile.skipped_count || 0),
    cache: Number(profile.cache_mb || 0),
    budget: Number(profile.budget_mb || 0),
    hits: Number(profile.hit_count || 0),
    misses: Number(profile.miss_count || 0),
    errors: Number(profile.error_count || 0),
    reason: profile.reason || '',
    selectedRows: Array.isArray(profile.selected) ? profile.selected : [],
  };
}

function applyPcieCacheV0RecommendationProfile(metrics, profile, label) {
  if (!profile || typeof profile !== 'object') return;
  metrics.pcieCacheV0Recommendation = {
    label: label || profile.family || '',
    family: profile.family || '',
    decision: profile.decision || profile.action || '',
    reason: profile.reason || '',
    suggested_budget_mb: Number(profile.suggested_budget_mb || 0),
    will_auto_enable: !!profile.will_auto_enable,
    candidate_count: Number(profile.candidate_count || 0),
    high_value_count: Number(profile.high_value_count || 0),
    total_transfer_mb: Number(profile.total_transfer_mb || 0),
    prefetch_enabled: !!profile.prefetch_enabled,
    prefetch_missed: Number(profile.prefetch_missed || 0),
    profile_prefetch_missed: Number(profile.profile_prefetch_missed || 0),
    current_mode: profile.current_mode || '',
    raw: profile.summary_text || '',
  };
}

export function getSmartSensingRecommendationItems(profile) {
  if (!profile || typeof profile !== 'object' || profile.phase !== 'runtime_slowdown') return [];
  const rawItems = Array.isArray(profile.recommendations) ? profile.recommendations : [];
  const labels = {
    enable_streaming_offload: 'Streaming Offload：下次训练启用流式权重卸载，降低显存常驻压力',
    enable_streaming_prefetch: 'Prefetch：下次配合预取，提前搬运即将使用的块，减少等待',
    enable_sparse_swap: 'Sparse Swap：下次优先尝试稀疏换入换出，只移动高收益模块',
    enable_delta_cache_observe: 'Delta/Cache Observe：下次开启 Delta/Cache 观察，评估缓存候选与 PCIe 传输',
    check_shared_vram_or_pageable_memory: '检查共享显存/分页内存：确认是否有系统共享显存介入',
    inspect_data_or_cpu_pipeline: '检查数据或 CPU 管线：显存压力不明显时优先排查数据加载瓶颈',
  };
  const fallback = [
    'enable_streaming_offload',
    'enable_streaming_prefetch',
    'enable_sparse_swap',
    'enable_delta_cache_observe',
  ];
  const source = rawItems.length ? rawItems : fallback;
  const seen = new Set();
  return source
    .filter(function (item) {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .map(function (item) {
      return labels[item] || String(item);
    });
}

export function renderSmartSensingRecommendationList(profile) {
  const items = getSmartSensingRecommendationItems(profile);
  if (!items.length) return '';
  return '<div style="margin-top:6px;display:flex;flex-direction:column;gap:3px;">'
    + items.map(function (item) {
      return '<div class="status-sub">• ' + escapeHtml(item) + '</div>';
    }).join('')
    + '</div>';
}

function getPcieDeltaCacheNextLabel(profile) {
  return ({
    cache_v0_manual_candidate: '可手动试验 Cache v0（prefetch 覆盖差时优先）',
    observe_more_steps: '建议继续观察更多 step',
    keep_observing: '继续观察',
    no_cache_candidate: '暂无缓存候选',
    fix_transfer_errors_before_cache: '先处理传输错误',
    disabled: '未启用',
  }[profile?.next] || profile?.next || '观察中');
}

function getPcieCacheV0DecisionLabel(profile) {
  return ({
    try_manually: '建议手动试验',
    keep_observing: '继续观察',
    not_recommended: '暂不推荐',
    do_not_try_yet: '暂勿尝试',
    recommend_only: '仅推荐',
  }[profile?.decision] || profile?.decision || '观察中');
}

export function getTransferFormatDisplayName(format) {
  return ({
    raw_fp16: 'Raw FP16',
    raw_bf16: 'Raw BF16',
    fp8_e4m3: 'FP8 E4M3',
    int8_rowwise: 'INT8 Rowwise',
    uint4_rowwise: 'UINT4 Rowwise',
    tc_fp8_tile_v1: 'TC FP8 Tile v1',
    tc_int8_tile_v1: 'TC INT8 Tile v1',
    tc_uint4_tile_v1: 'TC UINT4 Tile v1',
  }[String(format || '').trim()] || String(format || '—'));
}

function _normalizeBenchmarkSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const benchmark = snapshot.benchmark && typeof snapshot.benchmark === 'object' ? snapshot.benchmark : null;
  const experiment = snapshot.experiment && typeof snapshot.experiment === 'object' ? snapshot.experiment : null;
  const tensorcoreTransferKernel = snapshot.tensorcore_transfer_kernel && typeof snapshot.tensorcore_transfer_kernel === 'object'
    ? snapshot.tensorcore_transfer_kernel
    : null;
  const tensorcoreDecodeBenchmark = snapshot.tensorcore_decode_benchmark && typeof snapshot.tensorcore_decode_benchmark === 'object'
    ? snapshot.tensorcore_decode_benchmark
    : null;
  const tensorcoreDecodeBenchmarkError = String(snapshot.tensorcore_decode_benchmark_error || '');
  if (!benchmark && !experiment && !tensorcoreTransferKernel && !tensorcoreDecodeBenchmark && !tensorcoreDecodeBenchmarkError && !snapshot.error) return null;
  return {
    benchmark,
    experiment,
    tensorcore_transfer_kernel: tensorcoreTransferKernel,
    tensorcore_decode_benchmark: tensorcoreDecodeBenchmark,
    tensorcore_decode_benchmark_error: tensorcoreDecodeBenchmarkError,
    requested_params: snapshot.requested_params && typeof snapshot.requested_params === 'object' ? snapshot.requested_params : {},
    updated_at: String(snapshot.updated_at || ''),
    error: String(snapshot.error || ''),
  };
}

function _benchmarkShapesText(benchmark) {
  const cases = Array.isArray(benchmark?.cases) ? benchmark.cases : [];
  return cases
    .slice(0, 3)
    .map(function (item) {
      const shape = item && typeof item === 'object' ? item.shape : null;
      if (!shape || typeof shape !== 'object') return '';
      const rows = Number(shape.rows || 0);
      const cols = Number(shape.cols || 0);
      return rows > 0 && cols > 0 ? (rows + 'x' + cols) : '';
    })
    .filter(Boolean)
    .join('，');
}

function _firstTensorcoreDecodeCase(payload) {
  const cases = Array.isArray(payload?.cases) ? payload.cases : [];
  return cases.length && cases[0] && typeof cases[0] === 'object' ? cases[0] : null;
}

function _findDecodeResult(caseItem, format, implementation = '') {
  const rows = Array.isArray(caseItem?.results) ? caseItem.results : [];
  return rows.find(function (row) {
    if (!row || typeof row !== 'object') return false;
    if (String(row.format || '') !== format) return false;
    return !implementation || String(row.implementation || '') === implementation;
  }) || null;
}

function _bestDecodeResult(caseItem, format) {
  const rows = Array.isArray(caseItem?.results) ? caseItem.results : [];
  return rows
    .filter(function (row) {
      return row
        && typeof row === 'object'
        && String(row.format || '') === format
        && String(row.implementation || '').startsWith('triton_decode')
        && Number(row.decode_h2d_ms || 0) > 0;
    })
    .sort(function (a, b) {
      return Number(a.decode_h2d_ms || 0) - Number(b.decode_h2d_ms || 0);
    })[0] || null;
}

function _findMatmulResult(caseItem, format, implementation = '') {
  const rows = Array.isArray(caseItem?.matmul_results) ? caseItem.matmul_results : [];
  return rows.find(function (row) {
    if (!row || typeof row !== 'object') return false;
    if (String(row.format || '') !== format) return false;
    return !implementation || String(row.implementation || '') === implementation;
  }) || null;
}

function _bestFusedMatmulResult(caseItem) {
  const rows = Array.isArray(caseItem?.matmul_results) ? caseItem.matmul_results : [];
  return rows
    .filter(function (row) {
      return row
        && typeof row === 'object'
        && String(row.format || '') === 'tc_fp8_tile_v1'
        && String(row.implementation || '').startsWith('triton_fused_decode_matmul')
        && Number(row.decode_h2d_matmul_ms || 0) > 0;
    })
    .sort(function (a, b) {
      return Number(a.decode_h2d_matmul_ms || 0) - Number(b.decode_h2d_matmul_ms || 0);
    })[0] || null;
}

function _renderTcPresetSummary(payload) {
  const summary = payload?.summary && typeof payload.summary === 'object' ? payload.summary : null;
  if (!summary || Number(summary.case_count || 0) <= 1) return '';
  const bestDecode = summary.best_decode && typeof summary.best_decode === 'object' ? summary.best_decode : null;
  const bestFused = summary.best_fused_matmul && typeof summary.best_fused_matmul === 'object' ? summary.best_fused_matmul : null;
  const promising = Array.isArray(summary.promising_cases) ? summary.promising_cases : [];
  return '<div class="status-sub" style="margin-top:6px;font-weight:700;color:var(--text);">真实 Linear preset 汇总</div>'
    + '<div class="status-sub">形状数：' + escapeHtml(String(summary.case_count || 0)) + '，结论：' + escapeHtml(String(summary.decision || 'keep_research_only')) + '</div>'
    + (bestDecode ? '<div class="status-sub">Best decode：' + escapeHtml(String(bestDecode.shape || '—')) + ' / ' + escapeHtml(Number(bestDecode.triton_decode_speedup_vs_fp8_e4m3 || 0).toFixed(3)) + 'x / ' + escapeHtml(String(bestDecode.triton_decode_best || '—')) + '</div>' : '')
    + (bestFused ? '<div class="status-sub">Best fused：' + escapeHtml(String(bestFused.shape || '—')) + ' / ' + escapeHtml(Number(bestFused.triton_fused_matmul_speedup_vs_fp8_e4m3 || 0).toFixed(3)) + 'x / ' + escapeHtml(String(bestFused.triton_fused_matmul_best || '—')) + '</div>' : '')
    + (promising.length ? '<div class="status-sub" style="color:#38bdf8;">有接近可用的形状：' + escapeHtml(promising.slice(0, 3).map(function (row) { return row.shape; }).join('，')) + '</div>' : '');
}

export function renderPcieTransferBenchmarkCard(snapshot, options = {}) {
  const normalized = _normalizeBenchmarkSnapshot(snapshot);
  const loading = !!options.loading;
  const error = String(options.error || normalized?.error || '');
  const title = String(options.title || 'PCIe 传输格式 Benchmark');

  if (loading) {
    return '<div style="margin-top:8px;">'
      + '<div class="status-card" style="border-left:3px solid #38bdf8;">'
      + '<div class="status-label">' + escapeHtml(title) + '</div>'
      + '<div style="font-size:0.95rem;font-weight:700;color:var(--text);margin:4px 0;">正在运行 benchmark...</div>'
      + '<div class="status-sub">手动测试本机 CPU→GPU 传输格式，不会自动改训练配置</div>'
      + '</div>'
      + '</div>';
  }

  if (!normalized && !error) return '';
  if (!normalized && error) {
    return '<div style="margin-top:8px;">'
      + '<div class="status-card" style="border-left:3px solid #ef4444;">'
      + '<div class="status-label">' + escapeHtml(title) + '</div>'
      + '<div style="font-size:0.95rem;font-weight:700;color:#ef4444;margin:4px 0;">Benchmark 失败</div>'
      + '<div class="status-sub">' + escapeHtml(error) + '</div>'
      + '</div>'
      + '</div>';
  }

  const benchmark = normalized?.benchmark || null;
  const experiment = normalized?.experiment || null;
  const roadmap = normalized?.tensorcore_transfer_kernel || null;
  const ranked = Array.isArray(experiment?.ranked_formats) ? experiment.ranked_formats.slice(0, 3) : [];
  const rankedText = ranked.map(function (row) {
    const source = row?.recommendation_source ? ' [' + row.recommendation_source + ']' : '';
    return getTransferFormatDisplayName(row?.format) + source;
  }).join(' → ');
  const device = benchmark?.device ? String(benchmark.device) : '';
  const computeDtype = benchmark?.compute_dtype ? String(benchmark.compute_dtype) : '';
  const shapesText = _benchmarkShapesText(benchmark);
  const testedFormats = Array.isArray(benchmark?.formats) ? benchmark.formats.map(getTransferFormatDisplayName).join('，') : '';
  const selectedSpec = roadmap?.selected_spec && typeof roadmap.selected_spec === 'object' ? roadmap.selected_spec : null;
  const guardrail = Array.isArray(experiment?.guardrails) && experiment.guardrails.length ? String(experiment.guardrails[0]) : '';
  const tcDecode = normalized?.tensorcore_decode_benchmark || null;
  const tcDecodeError = String(normalized?.tensorcore_decode_benchmark_error || '');
  const tcCase = _firstTensorcoreDecodeCase(tcDecode);
  const fp8Decode = _findDecodeResult(tcCase, 'fp8_e4m3');
  const tcReference = _findDecodeResult(tcCase, 'tc_fp8_tile_v1', 'reference_torch') || _findDecodeResult(tcCase, 'tc_fp8_tile_v1');
  const tcTriton = _bestDecodeResult(tcCase, 'tc_fp8_tile_v1') || _findDecodeResult(tcCase, 'tc_fp8_tile_v1', 'triton_decode_v1') || _findDecodeResult(tcCase, 'tc_fp8_tile_v1', 'triton_decode_v0');
  const fp8Matmul = _findMatmulResult(tcCase, 'fp8_e4m3', 'decode_then_matmul');
  const tcMatmulReference = _findMatmulResult(tcCase, 'tc_fp8_tile_v1', 'reference_decode_then_matmul');
  const tcMatmulFused = _bestFusedMatmulResult(tcCase);
  const comparison = tcCase && tcCase.comparison && typeof tcCase.comparison === 'object' ? tcCase.comparison : {};
  const tritonError = String(comparison.triton_error || '');
  const fusedMatmulError = String(comparison.triton_fused_matmul_error || '');
  const tcPresetSummaryHtml = _renderTcPresetSummary(tcDecode);
  const tcDecodeHtml = (tcDecode || tcDecodeError || tritonError)
    ? tcPresetSummaryHtml
      + '<div class="status-sub" style="margin-top:6px;font-weight:700;color:var(--text);">TC FP8 Tile v1 decode-only（首个形状明细）</div>'
      + (fp8Decode ? '<div class="status-sub">FP8 E4M3 decode：' + escapeHtml(Number(fp8Decode.decode_h2d_ms || 0).toFixed(4)) + ' ms</div>' : '')
      + (tcReference ? '<div class="status-sub">Reference decode：' + escapeHtml(Number(tcReference.decode_h2d_ms || 0).toFixed(4)) + ' ms，MAE ' + escapeHtml(Number(tcReference.error_mae || 0).toFixed(8)) + '</div>' : '')
      + (tcTriton ? '<div class="status-sub">Triton ' + escapeHtml(String(tcTriton.implementation || 'decode')) + '：' + escapeHtml(Number(tcTriton.decode_h2d_ms || 0).toFixed(4)) + ' ms，speedup ' + escapeHtml(Number(comparison.triton_decode_speedup_vs_fp8_e4m3 || 0).toFixed(3)) + 'x</div>' : '')
      + (fp8Matmul || tcMatmulReference || tcMatmulFused || fusedMatmulError
        ? '<div class="status-sub" style="margin-top:6px;font-weight:700;color:var(--text);">TC FP8 fused decode+matmul</div>'
          + (fp8Matmul ? '<div class="status-sub">FP8 decode+matmul：' + escapeHtml(Number(fp8Matmul.decode_h2d_matmul_ms || 0).toFixed(4)) + ' ms</div>' : '')
          + (tcMatmulReference ? '<div class="status-sub">Reference decode+matmul：' + escapeHtml(Number(tcMatmulReference.decode_h2d_matmul_ms || 0).toFixed(4)) + ' ms</div>' : '')
          + (tcMatmulFused ? '<div class="status-sub">Triton fused best（' + escapeHtml(String(tcMatmulFused.implementation || 'variant')) + '）：' + escapeHtml(Number(tcMatmulFused.decode_h2d_matmul_ms || 0).toFixed(4)) + ' ms，speedup ' + escapeHtml(Number(comparison.triton_fused_matmul_speedup_vs_fp8_e4m3 || 0).toFixed(3)) + 'x，MAE ' + escapeHtml(Number(tcMatmulFused.error_mae_vs_reference || 0).toFixed(8)) + '</div>' : '')
          + (!tcMatmulFused && fusedMatmulError ? '<div class="status-sub" style="color:#f59e0b;">Fused matmul 跳过：' + escapeHtml(fusedMatmulError.slice(0, 180)) + (fusedMatmulError.length > 180 ? '...' : '') + '</div>' : '')
        : '')
      + (tcDecodeError ? '<div class="status-sub" style="color:#ef4444;">TC 短测错误：' + escapeHtml(tcDecodeError) + '</div>' : '')
      + (!tcTriton && tritonError ? '<div class="status-sub" style="color:#f59e0b;">Triton decode 跳过：' + escapeHtml(tritonError.slice(0, 180)) + (tritonError.length > 180 ? '...' : '') + '</div>' : '')
      + '<div class="status-sub">研究原型，不参与 PCIe 推荐排序，也不会自动改训练配置</div>'
    : '';

  return '<div style="margin-top:8px;">'
    + '<div class="status-card" style="border-left:3px solid ' + (error ? '#ef4444' : '#38bdf8') + ';">'
    + '<div class="status-label">' + escapeHtml(title) + '</div>'
    + '<div style="font-size:0.95rem;font-weight:700;color:var(--text);margin:4px 0;">优先格式：'
    + escapeHtml(getTransferFormatDisplayName(experiment?.recommended_first || '—'))
    + '</div>'
    + (device || computeDtype ? '<div class="status-sub">设备 ' + escapeHtml(device || '—') + ' / 计算精度 ' + escapeHtml(computeDtype || '—') + '</div>' : '')
    + (shapesText ? '<div class="status-sub">测试形状：' + escapeHtml(shapesText) + '</div>' : '')
    + (testedFormats ? '<div class="status-sub">测试格式：' + escapeHtml(testedFormats) + '</div>' : '')
    + (rankedText ? '<div class="status-sub" style="margin-top:4px;">Top3：' + escapeHtml(rankedText) + '</div>' : '')
    + (selectedSpec ? '<div class="status-sub" style="margin-top:4px;">TensorCore 原型：' + escapeHtml(getTransferFormatDisplayName(selectedSpec.name)) + ' / tile ' + escapeHtml(String(selectedSpec.tile_m) + 'x' + String(selectedSpec.tile_k)) + '</div>' : '')
    + (guardrail ? '<div class="status-sub" style="margin-top:4px;">护栏：' + escapeHtml(guardrail) + '</div>' : '')
    + tcDecodeHtml
    + (error ? '<div class="status-sub" style="margin-top:4px;color:#ef4444;">最近一次错误：' + escapeHtml(error) + '</div>' : '')
    + '</div>'
    + '</div>';
}

export function renderUnifiedRecommendationCard(context = {}, options = {}) {
  const title = String(options.title || '总推荐');
  const benchmarkSnapshot = _normalizeBenchmarkSnapshot(context.pcieTransferBenchmark);
  const benchmarkExperiment = benchmarkSnapshot?.experiment || null;
  const tcSummary = benchmarkSnapshot?.tensorcore_decode_benchmark?.summary && typeof benchmarkSnapshot.tensorcore_decode_benchmark.summary === 'object'
    ? benchmarkSnapshot.tensorcore_decode_benchmark.summary
    : null;
  const tcCase = _firstTensorcoreDecodeCase(benchmarkSnapshot?.tensorcore_decode_benchmark);
  const tcComparison = tcCase && tcCase.comparison && typeof tcCase.comparison === 'object' ? tcCase.comparison : null;
  const smart = context.smartSensingRuntime && typeof context.smartSensingRuntime === 'object'
    ? context.smartSensingRuntime
    : (context.vramSmartSensingRuntime && typeof context.vramSmartSensingRuntime === 'object' ? context.vramSmartSensingRuntime : null);
  const cacheV0Recommendation = context.pcieCacheV0Recommendation && typeof context.pcieCacheV0Recommendation === 'object'
    ? context.pcieCacheV0Recommendation
    : null;

  const rows = [];
  if (benchmarkExperiment?.recommended_first) {
    const ranked = Array.isArray(benchmarkExperiment.ranked_formats) ? benchmarkExperiment.ranked_formats.slice(0, 3) : [];
    const reuseFactor = Number(benchmarkExperiment.reuse_factor || 1);
    rows.push({
      label: 'PCIe 传输格式',
      value: '优先 ' + getTransferFormatDisplayName(benchmarkExperiment.recommended_first),
      detail: (ranked.length ? 'Top3：' + ranked.map(function (row) { return getTransferFormatDisplayName(row?.format); }).join(' → ') : '')
        + (reuseFactor > 1 ? '；pack 成本按约 ' + reuseFactor.toFixed(0) + ' 次复用摊销' : ''),
    });
  }
  if (cacheV0Recommendation) {
    const reuse = Number(cacheV0Recommendation.reuse_factor || 0);
    const amortizedMb = Number(cacheV0Recommendation.amortized_transfer_mb_per_step || 0);
    rows.push({
      label: 'Cache v0',
      value: getPcieCacheV0DecisionLabel(cacheV0Recommendation),
      detail: '建议预算 ' + Number(cacheV0Recommendation.suggested_budget_mb || 0).toFixed(1) + ' MB，当前模式 ' + String(cacheV0Recommendation.current_mode || 'observe')
        + (reuse > 1 ? '，约 ' + reuse.toFixed(0) + ' 步摊销' : '')
        + (amortizedMb > 0 ? '，每步约 ' + amortizedMb.toFixed(2) + ' MB' : ''),
    });
  }
  if (tcComparison || tcSummary) {
    const summaryDecode = tcSummary?.best_decode && typeof tcSummary.best_decode === 'object' ? tcSummary.best_decode : null;
    const summaryFused = tcSummary?.best_fused_matmul && typeof tcSummary.best_fused_matmul === 'object' ? tcSummary.best_fused_matmul : null;
    const speedup = Number(summaryDecode?.triton_decode_speedup_vs_fp8_e4m3 || tcComparison?.triton_decode_speedup_vs_fp8_e4m3 || tcComparison?.reference_decode_speedup_vs_fp8_e4m3 || 0);
    const fusedSpeedup = Number(summaryFused?.triton_fused_matmul_speedup_vs_fp8_e4m3 || tcComparison?.triton_fused_matmul_speedup_vs_fp8_e4m3 || 0);
    const hasTritonError = !!String(tcComparison?.triton_error || '');
    const hasFusedResult = fusedSpeedup > 0;
    rows.push({
      label: 'TensorCore 原型',
      value: fusedSpeedup > 1.05 ? 'fused 路径有潜力' : (speedup > 1.05 ? 'decode-only 快于 FP8' : '仍处研究阶段'),
      detail: hasTritonError
        ? 'Triton decode 当前未跑通，保留 reference 对照'
        : ('best decode ' + speedup.toFixed(3) + 'x' + (hasFusedResult ? '，best fused ' + fusedSpeedup.toFixed(3) + 'x' : '')),
    });
  }
  if (smart?.phase === 'runtime_slowdown') {
    const smartItems = getSmartSensingRecommendationItems(smart);
    rows.push({
      label: '显存智能感知',
      value: smartItems.length ? smartItems.slice(0, 2).join('；') : '建议下次按减压档位重试',
      detail: '本次只给建议，不会在中途自动改策略',
    });
  }
  if (!rows.length) return '';

  const borderColor = smart?.phase === 'runtime_slowdown' ? '#f59e0b' : '#38bdf8';
  return '<div style="margin-top:8px;">'
    + '<div class="status-card" style="border-left:3px solid ' + borderColor + ';">'
    + '<div class="status-label">' + escapeHtml(title) + '</div>'
    + rows.map(function (row) {
      return '<div style="margin-top:6px;">'
        + '<div style="font-size:0.92rem;font-weight:700;color:var(--text);">' + escapeHtml(row.label) + '</div>'
        + '<div class="status-sub">' + escapeHtml(row.value) + '</div>'
        + (row.detail ? '<div class="status-sub" style="margin-top:2px;">' + escapeHtml(row.detail) + '</div>' : '')
        + '</div>';
    }).join('')
    + '<div class="status-sub" style="margin-top:6px;">这些建议只用于下次启动或手动对比，不会在本次训练中自动切换。</div>'
    + '</div>'
    + '</div>';
}

function appendLossPoint(metrics, now, curStep, curLoss) {
  const prevLoss = metrics.losses.length > 0 ? metrics.losses[metrics.losses.length - 1].loss : -1;
  if (curStep > metrics.lastStep || metrics.losses.length === 0 || Math.abs(curLoss - prevLoss) > 0.0001) {
    metrics.losses.push({ time: now, step: curStep, loss: curLoss });
    metrics.lastStep = Math.max(metrics.lastStep, curStep);
  }
}

function applyProgressJson(metrics, data, now) {
  if (!data || typeof data !== 'object') return false;
  const curStep = Number(data.step || 0) || 0;
  const totalSteps = Number(data.total_steps || 0) || 0;
  const curEpoch = Number(data.epoch || 0) || 0;
  const totalEpochs = Number(data.total_epochs || 0) || 0;
  const curLoss = Number(data.loss);

  if (curStep > 0) {
    metrics.lastStep = Math.max(metrics.lastStep, curStep);
  }
  if (totalSteps > 0) {
    metrics.totalSteps = totalSteps;
  }
  if (Number.isFinite(curLoss)) {
    appendLossPoint(metrics, now, curStep || metrics.lastStep, curLoss);
  }
  if (curEpoch > 0) {
    const prevEpoch = metrics.epochs.length > 0 ? metrics.epochs[metrics.epochs.length - 1] : null;
    if (!prevEpoch || prevEpoch.epoch < curEpoch || prevEpoch.total !== totalEpochs) {
      metrics.epochs.push({ epoch: curEpoch, total: totalEpochs || (prevEpoch ? prevEpoch.total : 0) });
    }
  }
  if (data.b_tier && typeof data.b_tier === 'object') {
    metrics.bTier = data.b_tier;
    if (data.b_tier.ghost_replay && typeof data.b_tier.ghost_replay === 'object') {
      metrics.ghostReplay = data.b_tier.ghost_replay;
    }
  }
  if (data.memory_optimization && typeof data.memory_optimization === 'object') {
    metrics.memoryOptimization = data.memory_optimization;
    if (data.memory_optimization.precision_swap_profile && typeof data.memory_optimization.precision_swap_profile === 'object') {
      metrics.precisionSwapProfile = data.memory_optimization.precision_swap_profile;
    }
  }
  if (data.native_unet && typeof data.native_unet === 'object') {
    metrics.nativeUnet = data.native_unet;
    const residency = data.native_unet.weight_residency;
    if (residency && residency.pcie_delta_cache) {
      applyPcieDeltaCacheProfile(metrics, residency.pcie_delta_cache, 'Native SDXL');
    }
    if (residency && residency.pcie_cache_v0) {
      applyPcieCacheV0Profile(metrics, residency.pcie_cache_v0, 'Native SDXL');
    }
    if (residency && residency.pcie_cache_v0_recommendation) {
      applyPcieCacheV0RecommendationProfile(metrics, residency.pcie_cache_v0_recommendation, 'Native SDXL');
    }
  }
  if (data.anima_block_residency && typeof data.anima_block_residency === 'object') {
    const profile = data.anima_block_residency.pcie_delta_cache;
    if (profile) applyPcieDeltaCacheProfile(metrics, profile, 'Anima');
    if (data.anima_block_residency.pcie_cache_v0) {
      applyPcieCacheV0Profile(metrics, data.anima_block_residency.pcie_cache_v0, 'Anima');
    }
    if (data.anima_block_residency.pcie_cache_v0_recommendation) {
      applyPcieCacheV0RecommendationProfile(metrics, data.anima_block_residency.pcie_cache_v0_recommendation, 'Anima');
    }
  }
  if (data.newbie_block_residency && typeof data.newbie_block_residency === 'object') {
    const profile = data.newbie_block_residency.pcie_delta_cache;
    if (profile) applyPcieDeltaCacheProfile(metrics, profile, 'Newbie');
    if (data.newbie_block_residency.pcie_cache_v0) {
      applyPcieCacheV0Profile(metrics, data.newbie_block_residency.pcie_cache_v0, 'Newbie');
    }
    if (data.newbie_block_residency.pcie_cache_v0_recommendation) {
      applyPcieCacheV0RecommendationProfile(metrics, data.newbie_block_residency.pcie_cache_v0_recommendation, 'Newbie');
    }
  }
  if (data.peak_vram_diagnostics && typeof data.peak_vram_diagnostics === 'object') {
    metrics.peakVramDiagnostics = data.peak_vram_diagnostics;
  }
  if (data.cuda_cache_release && typeof data.cuda_cache_release === 'object') {
    metrics.cudaCacheRelease = data.cuda_cache_release;
  }
  if (data.vram_smart_sensing_runtime && typeof data.vram_smart_sensing_runtime === 'object') {
    metrics.vramSmartSensingRuntime = data.vram_smart_sensing_runtime;
  }
  if (data.compile_runtime && typeof data.compile_runtime === 'object') {
    metrics.compileRuntime = data.compile_runtime;
  }
  return true;
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
    const now = Date.now();
    if (line.includes('PROGRESS_JSON:')) {
      try {
        const marker = 'PROGRESS_JSON:';
        const data = JSON.parse(line.slice(line.indexOf(marker) + marker.length).trim());
        if (applyProgressJson(m, data, now)) {
          continue;
        }
      } catch (_err) {
        // Fallback to legacy regex parsing below.
      }
    }
    const pcieDeltaCache = parsePcieDeltaCacheLine(line);
    if (pcieDeltaCache) {
      m.pcieDeltaCache = pcieDeltaCache;
      continue;
    }
    const pcieCacheV0 = parsePcieCacheV0Line(line);
    if (pcieCacheV0) {
      m.pcieCacheV0 = pcieCacheV0;
      continue;
    }
    const pcieCacheV0Recommendation = parsePcieCacheV0RecommendationLine(line);
    if (pcieCacheV0Recommendation) {
      m.pcieCacheV0Recommendation = pcieCacheV0Recommendation;
      continue;
    }
    const speedMatch = line.match(/(\d+\.?\d*)\s*(it\/s|s\/it)/);
    const lossMatch = line.match(/avr_loss[=:]\s*(\d+\.?\d*)/);
    const stepMatch = line.match(/\|\s*(\d+)\/(\d+)\s*\[/);
    if (speedMatch) {
      let itPerSec = parseFloat(speedMatch[1]);
      if (speedMatch[2] === 's/it') itPerSec = itPerSec > 0 ? 1 / itPerSec : 0;
      m.speeds.push({ time: now, itPerSec });
    }
    if (lossMatch) {
      const curLoss = parseFloat(lossMatch[1]);
      const curStep = stepMatch ? parseInt(stepMatch[1]) : m.lastStep;
      appendLossPoint(m, now, curStep, curLoss);
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
    if (line.includes('PROGRESS_JSON:')) {
      try {
        const marker = 'PROGRESS_JSON:';
        const data = JSON.parse(line.slice(line.indexOf(marker) + marker.length).trim());
        if (applyProgressJson(m, data, 0)) {
          prevStep = m.lastStep;
          continue;
        }
      } catch (_err) {
        // Ignore and continue with regex fallback.
      }
    }
    const pcieDeltaCache = parsePcieDeltaCacheLine(line);
    if (pcieDeltaCache) {
      m.pcieDeltaCache = pcieDeltaCache;
      continue;
    }
    const pcieCacheV0 = parsePcieCacheV0Line(line);
    if (pcieCacheV0) {
      m.pcieCacheV0 = pcieCacheV0;
      continue;
    }
    const pcieCacheV0Recommendation = parsePcieCacheV0RecommendationLine(line);
    if (pcieCacheV0Recommendation) {
      m.pcieCacheV0Recommendation = pcieCacheV0Recommendation;
      continue;
    }
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
      appendLossPoint(m, 0, curStep, curLoss);
      prevStep = m.lastStep;
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
    _v: 3,
    avgSpeed, speedRating, speedColor,
    lossTrend, lossColor, lossDetail,
    firstLoss, lastLoss, minLoss, lossDelta,
    epochDone, epochTotal,
    totalSteps: m.totalSteps, lastStep: m.lastStep,
    sampleCount: m.losses.length,
    elapsed, elapsedStr,
    totalDurationMs: elapsed,
    totalDurationStr: elapsedStr,
    overallRating, overallColor,
    lossLevelTag, lossLevelColor,
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
export function generateSummaryFromTaskLog(lines, elapsedMs = 0) {
  const m = parseLinesIntoMetrics(lines);
  return buildSummaryFromMetrics(m, elapsedMs);
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
  const pcieTransferBenchmark = extra.pcieTransferBenchmark || null;
  const totalDurationStr = s.totalDurationStr || s.elapsedStr || '\u2014';
  const pcieNextLabel = pcie ? getPcieDeltaCacheNextLabel(pcie) : '';
  const pcieCard = pcie ? (
    '<div style="margin-top:8px;">'
    + '<div class="status-card" style="border-left:3px solid ' + (Number(pcie.errors || 0) > 0 ? '#ef4444' : '#38bdf8') + ';">'
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
    + '<div class="status-card" style="border-left:3px solid ' + (Number(cacheV0.errors || 0) > 0 ? '#ef4444' : (cacheV0.enabled ? '#22c55e' : '#94a3b8')) + ';">'
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
    + '<div class="status-card" style="border-left:3px solid ' + (cacheV0Recommendation.decision === 'try_manually' ? '#38bdf8' : (cacheV0Recommendation.decision === 'do_not_try_yet' ? '#ef4444' : '#94a3b8')) + ';">'
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
    + '<div class="status-card" style="border-left:3px solid ' + (smart.phase === 'runtime_slowdown' ? '#f59e0b' : '#38bdf8') + ';">'
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
  const compileCard = showCompileRuntime && compileRuntime ? (
    '<div style="margin-top:8px;">'
    + '<div class="status-card" style="border-left:3px solid #38bdf8;">'
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
    + '<div class="status-sub">\u603b\u65f6\u957f\uff1a' + escapeHtml(totalDurationStr) + '\u3000\u91c7\u6837\u70b9\uff1a' + s.sampleCount + '</div>'
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
    + pcieCard
    + cacheV0RecommendationCard
    + cacheV0Card
    + smartCard
    + compileCard
    + benchmarkCard
    + recommendationCard;
}
