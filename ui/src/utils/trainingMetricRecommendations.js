import { escapeHtml } from './dom.js';

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

export function getPcieDeltaCacheNextLabel(profile) {
  return ({
    cache_v0_manual_candidate: '可手动试验 Cache v0（prefetch 覆盖差时优先）',
    observe_more_steps: '建议继续观察更多 step',
    keep_observing: '继续观察',
    no_cache_candidate: '暂无缓存候选',
    fix_transfer_errors_before_cache: '先处理传输错误',
    disabled: '未启用',
  }[profile?.next] || profile?.next || '观察中');
}

export function getPcieCacheV0DecisionLabel(profile) {
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
    + (promising.length ? '<div class="status-sub" style="color:var(--info);">有接近可用的形状：' + escapeHtml(promising.slice(0, 3).map(function (row) { return row.shape; }).join('，')) + '</div>' : '');
}

export function renderPcieTransferBenchmarkCard(snapshot, options = {}) {
  const normalized = _normalizeBenchmarkSnapshot(snapshot);
  const loading = !!options.loading;
  const error = String(options.error || normalized?.error || '');
  const title = String(options.title || 'PCIe 传输格式 Benchmark');

  if (loading) {
    return '<div style="margin-top:8px;">'
      + '<div class="status-card" style="border-left:3px solid var(--info);">'
      + '<div class="status-label">' + escapeHtml(title) + '</div>'
      + '<div style="font-size:0.95rem;font-weight:700;color:var(--text);margin:4px 0;">正在运行 benchmark...</div>'
      + '<div class="status-sub">手动测试本机 CPU→GPU 传输格式，不会自动改训练配置</div>'
      + '</div>'
      + '</div>';
  }

  if (!normalized && !error) return '';
  if (!normalized && error) {
    return '<div style="margin-top:8px;">'
      + '<div class="status-card" style="border-left:3px solid var(--danger);">'
      + '<div class="status-label">' + escapeHtml(title) + '</div>'
      + '<div style="font-size:0.95rem;font-weight:700;color:var(--danger);margin:4px 0;">Benchmark 失败</div>'
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
          + (!tcMatmulFused && fusedMatmulError ? '<div class="status-sub" style="color:var(--warning);">Fused matmul 跳过：' + escapeHtml(fusedMatmulError.slice(0, 180)) + (fusedMatmulError.length > 180 ? '...' : '') + '</div>' : '')
        : '')
      + (tcDecodeError ? '<div class="status-sub" style="color:var(--danger);">TC 短测错误：' + escapeHtml(tcDecodeError) + '</div>' : '')
      + (!tcTriton && tritonError ? '<div class="status-sub" style="color:var(--warning);">Triton decode 跳过：' + escapeHtml(tritonError.slice(0, 180)) + (tritonError.length > 180 ? '...' : '') + '</div>' : '')
      + '<div class="status-sub">研究原型，不参与 PCIe 推荐排序，也不会自动改训练配置</div>'
    : '';

  return '<div style="margin-top:8px;">'
    + '<div class="status-card" style="border-left:3px solid ' + (error ? 'var(--danger)' : 'var(--info)') + ';">'
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
    + (error ? '<div class="status-sub" style="margin-top:4px;color:var(--danger);">最近一次错误：' + escapeHtml(error) + '</div>' : '')
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

  const borderColor = smart?.phase === 'runtime_slowdown' ? 'var(--warning)' : 'var(--info)';
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
