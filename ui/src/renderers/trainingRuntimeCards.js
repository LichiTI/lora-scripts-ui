import { escapeHtml } from '../utils/dom.js';
import { getSmartSensingRecommendationItems } from '../utils/trainingMetrics.js';

export function renderPrecisionSwapRuntimeCard(profile) {
  if (!profile || typeof profile !== 'object') return '';
  var selected = Array.isArray(profile.selected_names) ? profile.selected_names : [];
  var selectedText = selected.length ? selected.join(', ') : '未选择';
  var hint = Number(profile.selected_activation_hint_mb || 0);
  var params = Number(profile.selected_parameter_mb || 0);
  var source = profile.profile_source || 'static';
  var obs = (profile.runtime_observations && typeof profile.runtime_observations === 'object') ? profile.runtime_observations : {};
  var avgStep = Number(obs.avg_step_wall_seconds || 0);
  var lastStep = Number(obs.last_step_wall_seconds || 0);
  var swapCount = Number(obs.swap_count || 0);
  var waitCount = Number(obs.wait_count || 0);
  var swapMs = Number(obs.total_swap_ms || 0);
  var prepareCount = Number(obs.prepare_count || 0);
  var prepareMs = Number(obs.total_prepare_ms || 0);
  var peak = (obs.peak_vram_stages && typeof obs.peak_vram_stages === 'object') ? obs.peak_vram_stages : null;
  var peakText = peak
    ? ['forward_mb', 'backward_mb', 'optimizer_mb'].map(function(k) {
        return peak[k] != null ? String(peak[k]) + ' MB' : null;
      }).filter(Boolean).join(' / ')
    : '';
  return '<div class="train-side-section" id="train-precision-swap-card">'
    + '<div class="train-panel-title">Lulynx Precision Swap</div>'
    + '<div class="train-hw-card">'
    +   '<div class="train-hw-row"><span class="hw-label">策略</span><span class="hw-value">' + escapeHtml(String(profile.strategy || 'balanced')) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">后端</span><span class="hw-value">' + escapeHtml(String(profile.backend || 'suffix_block_swap')) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">选中单元</span><span class="hw-value-accent">' + escapeHtml(String(profile.selected_count || selected.length || 0) + ' / ' + String(profile.units_total || 0)) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">BlockSwap</span><span class="hw-value">' + escapeHtml(String(profile.compatible_blocks_to_swap || 0)) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">参数量</span><span class="hw-value">' + (params > 0 ? params.toFixed(1) + ' MB' : '—') + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">激活 Hint</span><span class="hw-value">' + (hint > 0 ? hint.toFixed(1) + ' MB' : '—') + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">观测步数</span><span class="hw-value">' + escapeHtml(String(obs.steps_observed || 0)) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">步耗时</span><span class="hw-value">' + (avgStep > 0 ? escapeHtml(avgStep.toFixed(2) + 's avg / ' + lastStep.toFixed(2) + 's last') : '—') + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">Swap / Wait</span><span class="hw-value">' + escapeHtml(String(swapCount) + ' / ' + String(waitCount)) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">Swap 耗时</span><span class="hw-value">' + (swapMs > 0 ? escapeHtml(swapMs.toFixed(1) + ' ms') : '—') + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">Prepare</span><span class="hw-value">' + (prepareCount > 0 ? escapeHtml(String(prepareCount) + ' / ' + prepareMs.toFixed(1) + ' ms') : '—') + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">峰值阶段</span><span class="hw-value">' + (peakText ? escapeHtml(peakText) : '—') + '</span></div>'
    + '</div>'
    + '<div style="margin-top:8px;font-size:0.68rem;color:var(--text-muted);line-height:1.45;">'
    +   '<div>Profile: ' + escapeHtml(String(source)) + '</div>'
    +   '<div>选中: ' + escapeHtml(selectedText) + '</div>'
    + '</div>'
    + '</div>';
}

export function renderNativeUnetRuntimeCard(profile) {
  if (!profile || typeof profile !== 'object') return '';
  var coverage = (profile.native_coverage && typeof profile.native_coverage === 'object') ? profile.native_coverage : {};
  var probe = (profile.native_forward_probe && typeof profile.native_forward_probe === 'object')
    ? profile.native_forward_probe
    : ((coverage.native_forward_probe && typeof coverage.native_forward_probe === 'object') ? coverage.native_forward_probe : {});
  var probeOk = !!(profile.native_forward_probe_ok || coverage.native_forward_probe_ok || probe.ok);
  var ready = !!(profile.available || coverage.skeleton_ready);
  var blocks = profile.blocks_total || profile.native_ready_blocks || coverage.implemented_top_blocks || 0;
  var active = !!profile.active;
  var residency = (profile.weight_residency && typeof profile.weight_residency === 'object') ? profile.weight_residency : null;
  return '<div class="train-side-section" id="train-native-unet-card">'
    + '<div class="train-panel-title">Native SDXL U-Net</div>'
    + '<div class="train-hw-card">'
    +   '<div class="train-hw-row"><span class="hw-label">后端</span><span class="hw-value">' + escapeHtml(String(profile.backend || 'diffusers')) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">模式</span><span class="hw-value">' + escapeHtml(String(profile.mode || 'shadow')) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">Skeleton</span><span class="hw-value" style="color:' + (ready ? 'var(--success)' : 'var(--warning)') + ';">' + (ready ? '可用' : '不可用') + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">Forward Probe</span><span class="hw-value" style="color:' + (probeOk ? 'var(--success)' : 'var(--warning)') + ';">' + (probeOk ? '通过' : '未通过') + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">Top Blocks</span><span class="hw-value-accent">' + escapeHtml(String(blocks || '—')) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">训练接管</span><span class="hw-value">' + (active ? '代理接管' : '未接管') + '</span></div>'
    +   (residency ? '<div class="train-hw-row"><span class="hw-label">权重驻留</span><span class="hw-value">' + escapeHtml(String(residency.mode || 'resident')) + '</span></div>' : '')
    +   (residency ? '<div class="train-hw-row"><span class="hw-label">CPU Linear</span><span class="hw-value">' + escapeHtml(String(residency.active_linear_count || 0) + ' / ' + String(residency.managed_linear_count || 0)) + '</span></div>' : '')
    +   (residency ? '<div class="train-hw-row"><span class="hw-label">CPU Conv2d</span><span class="hw-value">' + escapeHtml(String(residency.active_conv2d_count || 0) + ' / ' + String(residency.managed_conv2d_count || 0)) + '</span></div>' : '')
    + '</div>'
    + '<div style="margin-top:8px;font-size:0.68rem;color:var(--text-muted);line-height:1.45;">'
    +   '<div>Forward: ' + escapeHtml(profile.native_forward_integrated ? 'integrated' : 'diagnostic') + '</div>'
    +   (probe.output_shape ? '<div>Probe 输出: ' + escapeHtml(String(probe.output_shape.join ? probe.output_shape.join('x') : probe.output_shape)) + '</div>' : '')
    + '</div>'
    + '</div>';
}

export function renderPeakVramDiagnosticsCard(diagnostics, cacheRelease) {
  if (!diagnostics || typeof diagnostics !== 'object') return '';
  var stages = (diagnostics.stages && typeof diagnostics.stages === 'object') ? diagnostics.stages : {};
  var release = (cacheRelease && typeof cacheRelease === 'object') ? cacheRelease : null;
  function _fmt(value) {
    var n = Number(value || 0);
    return n > 0 ? n.toFixed(1) + ' MB' : '—';
  }
  function _stageRow(label, key) {
    var item = stages[key] && typeof stages[key] === 'object' ? stages[key] : null;
    if (!item) return '';
    return '<div class="train-hw-row"><span class="hw-label">' + escapeHtml(label) + '</span><span class="hw-value">'
      + escapeHtml(_fmt(item.peak_allocated_mb) + ' alloc / ' + _fmt(item.peak_reserved_mb) + ' reserved')
      + '</span></div>';
  }
  return '<div class="train-side-section" id="train-vram-diagnostics-card">'
    + '<div class="train-panel-title">VRAM Diagnostics</div>'
    + '<div class="train-hw-card">'
    +   '<div class="train-hw-row"><span class="hw-label">Reserved 峰值</span><span class="hw-value-accent">' + escapeHtml(_fmt(diagnostics.max_reserved_mb)) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">Reserved 阶段</span><span class="hw-value">' + escapeHtml(String(diagnostics.max_reserved_stage || '—')) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">Allocated 峰值</span><span class="hw-value">' + escapeHtml(_fmt(diagnostics.max_allocated_mb)) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">Allocated 阶段</span><span class="hw-value">' + escapeHtml(String(diagnostics.max_allocated_stage || '—')) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">缓存差距</span><span class="hw-value">' + escapeHtml(_fmt(diagnostics.allocator_cache_gap_mb)) + '</span></div>'
    +   _stageRow('Forward', 'forward')
    +   _stageRow('Backward', 'backward')
    +   _stageRow('Optimizer', 'optimizer')
    +   (release ? '<div class="train-hw-row"><span class="hw-label">清缓存策略</span><span class="hw-value">' + escapeHtml(String(release.strategy || 'off')) + '</span></div>' : '')
    +   (release ? '<div class="train-hw-row"><span class="hw-label">释放 Reserved</span><span class="hw-value">' + escapeHtml(_fmt(release.released_reserved_mb)) + '</span></div>' : '')
    +   (release ? '<div class="train-hw-row"><span class="hw-label">清缓存耗时</span><span class="hw-value">' + escapeHtml(Number(release.elapsed_ms || 0).toFixed(1) + ' ms') + '</span></div>' : '')
    + '</div>'
    + '</div>';
}

export function renderPcieDeltaCacheRuntimeCard(profile) {
  if (!profile || typeof profile !== 'object') return '';
  var errors = Number(profile.errors || 0);
  var nextMap = {
    cache_v0_manual_candidate: '可手动试验 Cache v0（prefetch 覆盖差时优先）',
    observe_more_steps: '建议继续观察更多 step',
    keep_observing: '继续观察',
    no_cache_candidate: '暂无缓存候选',
    fix_transfer_errors_before_cache: '先处理传输错误',
    disabled: '未启用',
  };
  var next = nextMap[profile.next] || profile.next || '观察中';
  return '<div class="train-side-section" id="train-pcie-delta-cache-card">'
    + '<div class="train-panel-title">PCIe Delta/Cache 候选</div>'
    + '<div class="train-hw-card">'
    +   '<div class="train-hw-row"><span class="hw-label">路线</span><span class="hw-value">' + escapeHtml(String(profile.label || profile.family || '—')) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">模式</span><span class="hw-value">' + escapeHtml(String(profile.mode || 'observe')) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">候选 / 高价值</span><span class="hw-value-accent">' + escapeHtml(String(profile.candidates || 0) + ' / ' + String(profile.high || 0)) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">中等候选</span><span class="hw-value">' + escapeHtml(String(profile.medium || 0)) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">传输量</span><span class="hw-value">' + escapeHtml(Number(profile.transfer || 0).toFixed(1) + ' MB') + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">估算缓存</span><span class="hw-value">' + escapeHtml(Number(profile.estimated_cache || 0).toFixed(1) + ' MB') + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">Miss / 错误</span><span class="hw-value" style="color:' + (errors > 0 ? 'var(--danger)' : 'var(--text)') + ';">' + escapeHtml(String(profile.prefetch_missed || 0) + ' / ' + String(errors)) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">建议</span><span class="hw-value">' + escapeHtml(next) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">提示</span><span class="hw-value">prefetch 已完整覆盖时通常不需要 Cache v0</span></div>'
    + '</div>'
    + '</div>';
}

export function renderPcieCacheV0RuntimeCard(profile) {
  if (!profile || typeof profile !== 'object') return '';
  var enabled = !!profile.enabled;
  var errors = Number(profile.errors || 0);
  return '<div class="train-side-section" id="train-pcie-cache-v0-card">'
    + '<div class="train-panel-title">PCIe Cache v0</div>'
    + '<div class="train-hw-card">'
    +   '<div class="train-hw-row"><span class="hw-label">状态</span><span class="hw-value" style="color:' + (errors > 0 ? 'var(--danger)' : (enabled ? 'var(--success)' : 'var(--text-dim)')) + ';">' + (enabled ? '已启用' : '未启用') + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">选中层</span><span class="hw-value-accent">' + escapeHtml(String(profile.selected || 0)) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">缓存 / 预算</span><span class="hw-value">' + escapeHtml(Number(profile.cache || 0).toFixed(1) + ' / ' + Number(profile.budget || 0).toFixed(1) + ' MB') + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">Hit / Miss</span><span class="hw-value">' + escapeHtml(String(profile.hits || 0) + ' / ' + String(profile.misses || 0)) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">错误</span><span class="hw-value">' + escapeHtml(String(errors)) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">原因</span><span class="hw-value">' + escapeHtml(String(profile.reason || '—')) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">使用建议</span><span class="hw-value">适合 prefetch miss 高或关闭时对比</span></div>'
    + '</div>'
    + '</div>';
}

export function renderPcieCacheV0RecommendationRuntimeCard(profile, cacheProfile) {
  if (!profile || typeof profile !== 'object') return '';
  var decisionMap = {
    try_manually: '建议手动试验',
    keep_observing: '继续观察',
    not_recommended: '暂不推荐',
    do_not_try_yet: '暂勿尝试',
    recommend_only: '仅推荐',
  };
  var decision = decisionMap[profile.decision] || profile.decision || '观察中';
  var color = profile.decision === 'try_manually' ? 'var(--info)' : (profile.decision === 'do_not_try_yet' ? 'var(--danger)' : 'var(--text)');
  var actualEnabled = cacheProfile && typeof cacheProfile === 'object' ? !!cacheProfile.enabled : false;
  return '<div class="train-side-section" id="train-pcie-cache-v0-recommendation-card">'
    + '<div class="train-panel-title">PCIe Cache v0 推荐</div>'
    + '<div class="train-hw-card">'
    +   '<div class="train-hw-row"><span class="hw-label">路线</span><span class="hw-value">' + escapeHtml(String(profile.label || profile.family || '—')) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">决策</span><span class="hw-value" style="color:' + color + ';">' + escapeHtml(decision) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">原因</span><span class="hw-value">' + escapeHtml(String(profile.reason || '—')) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">建议预算</span><span class="hw-value-accent">' + escapeHtml(Number(profile.suggested_budget_mb || 0).toFixed(1) + ' MB') + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">自动启用</span><span class="hw-value">' + (profile.will_auto_enable ? '是' : '否') + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">实际状态</span><span class="hw-value">' + (actualEnabled ? 'PCIe Cache v0 已启用' : 'PCIe Cache v0 未启用') + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">候选 / 高价值</span><span class="hw-value">' + escapeHtml(String(profile.candidate_count || 0) + ' / ' + String(profile.high_value_count || 0)) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">当前模式</span><span class="hw-value">' + escapeHtml(String(profile.current_mode || 'observe')) + '</span></div>'
    + '</div>'
    + '<div style="margin-top:8px;font-size:0.68rem;color:var(--text-muted);line-height:1.45;">推荐只用于下次或手动对比，不会在本次训练中自动切换 Cache v0。</div>'
    + '</div>';
}

export function renderSmartSensingRuntimeCard(profile) {
  if (!profile || typeof profile !== 'object') return '';
  var slowdown = profile.phase === 'runtime_slowdown';
  var recommendationItems = getSmartSensingRecommendationItems(profile);
  var recommendationHtml = slowdown && recommendationItems.length
    ? '<div class="train-hw-row"><span class="hw-label">下次推荐配置</span><span class="hw-value">' + escapeHtml(recommendationItems.join('；')) + '</span></div>'
    : '';
  return '<div class="train-side-section" id="train-vram-smart-sensing-card">'
    + '<div class="train-panel-title">显存智能感知</div>'
    + '<div class="train-hw-card">'
    +   '<div class="train-hw-row"><span class="hw-label">阶段</span><span class="hw-value">' + escapeHtml(String(profile.phase || 'observe')) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">动作</span><span class="hw-value">' + escapeHtml(String(profile.action || 'observe')) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">基线 / 窗口</span><span class="hw-value">' + escapeHtml(Number(profile.baseline_avg_step_seconds || 0).toFixed(3) + ' / ' + Number(profile.window_avg_step_seconds || 0).toFixed(3) + ' s') + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">变慢倍率</span><span class="hw-value" style="color:' + (slowdown ? 'var(--warning)' : 'var(--text)') + ';">' + escapeHtml(Number(profile.slowdown_ratio || 0).toFixed(2) + 'x') + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">显存压力</span><span class="hw-value">' + (profile.shared_vram_suspected ? '疑似' : '未触发') + '</span></div>'
    +   recommendationHtml
    +   '<div class="train-hw-row"><span class="hw-label">说明</span><span class="hw-value">本次不会自动改策略；建议用于下次启动训练前手动配置</span></div>'
    + '</div>'
    + '</div>';
}

export function renderCompileRuntimeCard(profile) {
  if (!profile || typeof profile !== 'object') return '';
  var route = String(profile.route || 'unknown');
  var resolved = String(profile.resolved || 'eager');
  var compileEnabled = !!profile.torch_compile;
  var scope = String(profile.torch_compile_scope || 'off');
  var shape = String(profile.compile_shape_strategy || 'auto');
  var target = String(profile.compile_target_strategy || 'auto');
  var shapeSource = String(profile.effective_static_shape_source || 'unknown');
  var warningCount = Number(profile.warning_count || 0);
  var compiledTargets = Number(profile.compiled_target_messages || 0);
  return '<div class="train-side-section" id="train-compile-runtime-card">'
    + '<div class="train-panel-title">Compile Runtime</div>'
    + '<div class="train-hw-card">'
    +   '<div class="train-hw-row"><span class="hw-label">路由</span><span class="hw-value">' + escapeHtml(route) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">解析结果</span><span class="hw-value">' + escapeHtml(resolved) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">torch.compile</span><span class="hw-value">' + (compileEnabled ? '开启' : '关闭') + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">scope</span><span class="hw-value">' + escapeHtml(scope) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">shape/target</span><span class="hw-value">' + escapeHtml(shape + ' / ' + target) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">静态 shape 来源</span><span class="hw-value">' + escapeHtml(shapeSource) + '</span></div>'
    +   '<div class="train-hw-row"><span class="hw-label">告警 / 命中</span><span class="hw-value">' + escapeHtml(String(warningCount) + ' / ' + String(compiledTargets)) + '</span></div>'
    + '</div>'
    + '<div style="margin-top:8px;font-size:0.68rem;color:var(--text-muted);line-height:1.45;">启动参数或显式配置优先，shape/target 策略只用于解析与回退。</div>'
    + '</div>';
}
