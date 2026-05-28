// renderers/training.js — 训练仪表盘面板渲染
//
// 包含：renderTraining(主代表盘) + renderTrainingSummaryHTML(训练总结侧面板)
//
// 依赖（工厂注入）：
//   - state
//   - renderSlot（插件完发区，来自 pluginHost）
//   - deps.renderPreflightPanel：preflight 模块提供的预检面板
//   - deps.renderSamplesPanel：samples 模块提供的预览面板
//   - deps._buildSysMonitorHTML：sysMonitor 模块提供的资源监控面板
//   - deps.syncFooterAction / startTrainingLogPolling / startSysMonitorPolling /
//     _pollSystemMonitor：main.js 中现有的 actions（Stage 3 会一起抽到 actions/）
//
// 该文件仅负责生成 HTML 与调用依赖入口，不读写 localStorage、不调 api。

import { escapeHtml, _ico } from '../utils/dom.js';
import { schedulerOption } from '../features/settingsOptions.js';
import { formatDuration, getSmartSensingRecommendationItems, renderSummaryCard } from '../utils/trainingMetrics.js';

export function createTrainingRenderer({ state, renderSlot, deps }) {
  function _renderPreflightPanel() {
    return deps && typeof deps.renderPreflightPanel === 'function' ? deps.renderPreflightPanel() : '';
  }
  function _renderSamplesPanel() {
    return deps && typeof deps.renderSamplesPanel === 'function' ? deps.renderSamplesPanel() : '';
  }
  function _buildSysMonitorHTML() {
    return deps && typeof deps._buildSysMonitorHTML === 'function' ? deps._buildSysMonitorHTML() : '';
  }
  function _syncFooterAction() {
    if (deps && typeof deps.syncFooterAction === 'function') deps.syncFooterAction();
  }
  function _startTrainingLogPolling() {
    if (deps && typeof deps.startTrainingLogPolling === 'function') deps.startTrainingLogPolling();
  }
  function _startSysMonitorPolling() {
    if (deps && typeof deps.startSysMonitorPolling === 'function') deps.startSysMonitorPolling();
  }
  function _pollSystemMonitorOnce() {
    if (deps && typeof deps._pollSystemMonitor === 'function') deps._pollSystemMonitor();
  }

  /** Render current training summary section */
  function renderTrainingSummaryHTML() {
    var s = state.trainingSummary;
    if (!s) return '';
    return '<section class="form-section" id="training-summary-section">'
      + '<header class="section-header" style="display:flex;justify-content:space-between;align-items:center;">'
      + '<h3>\ud83d\udcca \u8bad\u7ec3\u603b\u7ed3</h3>'
      + '<button type="button" onclick="dismissTrainingSummary()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.1rem;padding:2px 6px;line-height:1;" title="\u5173\u95ed">\u00d7</button></header>'
      + '<div class="section-content" style="display:block;">' + renderSummaryCard(s, { pcieTransferBenchmark: state.pcieTransferBenchmark }) +'</div>'
      + '</section>';
  }

  function renderPrecisionSwapRuntimeCard(profile) {
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

  function renderNativeUnetRuntimeCard(profile) {
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
      +   '<div class="train-hw-row"><span class="hw-label">Skeleton</span><span class="hw-value" style="color:' + (ready ? '#22c55e' : '#f59e0b') + ';">' + (ready ? '可用' : '不可用') + '</span></div>'
      +   '<div class="train-hw-row"><span class="hw-label">Forward Probe</span><span class="hw-value" style="color:' + (probeOk ? '#22c55e' : '#f59e0b') + ';">' + (probeOk ? '通过' : '未通过') + '</span></div>'
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

  function renderPeakVramDiagnosticsCard(diagnostics, cacheRelease) {
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

  function renderPcieDeltaCacheRuntimeCard(profile) {
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
      +   '<div class="train-hw-row"><span class="hw-label">Miss / 错误</span><span class="hw-value" style="color:' + (errors > 0 ? '#ef4444' : 'var(--text)') + ';">' + escapeHtml(String(profile.prefetch_missed || 0) + ' / ' + String(errors)) + '</span></div>'
      +   '<div class="train-hw-row"><span class="hw-label">建议</span><span class="hw-value">' + escapeHtml(next) + '</span></div>'
      +   '<div class="train-hw-row"><span class="hw-label">提示</span><span class="hw-value">prefetch 已完整覆盖时通常不需要 Cache v0</span></div>'
      + '</div>'
      + '</div>';
  }

  function renderPcieCacheV0RuntimeCard(profile) {
    if (!profile || typeof profile !== 'object') return '';
    var enabled = !!profile.enabled;
    var errors = Number(profile.errors || 0);
    return '<div class="train-side-section" id="train-pcie-cache-v0-card">'
      + '<div class="train-panel-title">PCIe Cache v0</div>'
      + '<div class="train-hw-card">'
      +   '<div class="train-hw-row"><span class="hw-label">状态</span><span class="hw-value" style="color:' + (errors > 0 ? '#ef4444' : (enabled ? '#22c55e' : 'var(--text-dim)')) + ';">' + (enabled ? '已启用' : '未启用') + '</span></div>'
      +   '<div class="train-hw-row"><span class="hw-label">选中层</span><span class="hw-value-accent">' + escapeHtml(String(profile.selected || 0)) + '</span></div>'
      +   '<div class="train-hw-row"><span class="hw-label">缓存 / 预算</span><span class="hw-value">' + escapeHtml(Number(profile.cache || 0).toFixed(1) + ' / ' + Number(profile.budget || 0).toFixed(1) + ' MB') + '</span></div>'
      +   '<div class="train-hw-row"><span class="hw-label">Hit / Miss</span><span class="hw-value">' + escapeHtml(String(profile.hits || 0) + ' / ' + String(profile.misses || 0)) + '</span></div>'
      +   '<div class="train-hw-row"><span class="hw-label">错误</span><span class="hw-value">' + escapeHtml(String(errors)) + '</span></div>'
      +   '<div class="train-hw-row"><span class="hw-label">原因</span><span class="hw-value">' + escapeHtml(String(profile.reason || '—')) + '</span></div>'
      +   '<div class="train-hw-row"><span class="hw-label">使用建议</span><span class="hw-value">适合 prefetch miss 高或关闭时对比</span></div>'
      + '</div>'
      + '</div>';
  }

  function renderPcieCacheV0RecommendationRuntimeCard(profile, cacheProfile) {
    if (!profile || typeof profile !== 'object') return '';
    var decisionMap = {
      try_manually: '建议手动试验',
      keep_observing: '继续观察',
      not_recommended: '暂不推荐',
      do_not_try_yet: '暂勿尝试',
      recommend_only: '仅推荐',
    };
    var decision = decisionMap[profile.decision] || profile.decision || '观察中';
    var color = profile.decision === 'try_manually' ? '#38bdf8' : (profile.decision === 'do_not_try_yet' ? '#ef4444' : 'var(--text)');
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

  function renderSmartSensingRuntimeCard(profile) {
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
      +   '<div class="train-hw-row"><span class="hw-label">变慢倍率</span><span class="hw-value" style="color:' + (slowdown ? '#f59e0b' : 'var(--text)') + ';">' + escapeHtml(Number(profile.slowdown_ratio || 0).toFixed(2) + 'x') + '</span></div>'
      +   '<div class="train-hw-row"><span class="hw-label">显存压力</span><span class="hw-value">' + (profile.shared_vram_suspected ? '疑似' : '未触发') + '</span></div>'
      +   recommendationHtml
      +   '<div class="train-hw-row"><span class="hw-label">说明</span><span class="hw-value">本次不会自动改策略；建议用于下次启动训练前手动配置</span></div>'
      + '</div>'
      + '</div>';
  }

  function renderTraining(container) {
    var running = state.tasks.filter(function(t) { return t.status === 'RUNNING'; });
    var finished = state.tasks.filter(function(t) { return ['FINISHED', 'COMPLETED'].includes(String(t.status || '').toUpperCase()); });
    var terminated = state.tasks.filter(function(t) { return ['TERMINATED', 'FAILED', 'CANCELLED'].includes(String(t.status || '').toUpperCase()); });
    var lastTask = state.tasks[state.tasks.length - 1];
    var logSnapshot = state.trainingLogSnapshot || {};
    var hasRunning = running.length > 0;
    var m = state.trainingMetrics;
    var curTask = running[0] || lastTask;
    var taskIdShort = curTask ? curTask.id.slice(0, 8).toUpperCase() : '--------';

    // Compute live metrics for header
    var curStep = m.lastStep || 0;
    var totalSteps = m.totalSteps || 0;
    var lastEp = m.epochs.length > 0 ? m.epochs[m.epochs.length - 1] : null;
    var epochStr = lastEp ? ('Epoch ' + lastEp.epoch + '/' + lastEp.total) : '';
    var curSpeed = m.speeds.length > 0 ? m.speeds[m.speeds.length - 1].itPerSec : 0;
    var remainSec = (curSpeed > 0 && totalSteps > curStep) ?Math.round((totalSteps - curStep) / curSpeed) : 0;
    var remainStr = remainSec > 0 ? formatDuration(remainSec * 1000) : '--:--';
    var curLoss = m.losses.length > 0 ? m.losses[m.losses.length - 1].loss : 0;
    var prevLoss = m.losses.length > 1 ? m.losses[m.losses.length - 2].loss : curLoss;
    var lossDeltaPct =prevLoss > 0 ? ((curLoss - prevLoss) / prevLoss * 100) : 0;
    var lossArrow = lossDeltaPct < 0 ? _ico('trending-down', 12) : (lossDeltaPct > 0 ? _ico('trending-up', 12) : '');
    var lossArrowColor = lossDeltaPct < 0 ? '#22c55e' : (lossDeltaPct > 0 ? '#ef4444' : 'var(--text-dim)');
    var ghost = m.ghostReplay || (m.bTier && m.bTier.ghost_replay) || null;
    var precisionSwapProfile = m.precisionSwapProfile
      || (m.memoryOptimization && m.memoryOptimization.precision_swap_profile)
      || (state.preflight && state.preflight.precision_swap_profile)
      || null;
    var nativeUnetProfile = m.nativeUnet
      || (state.preflight && state.preflight.native_unet_profile)
      || null;
    var peakVramDiagnostics = m.peakVramDiagnostics || null;
    var cudaCacheRelease = m.cudaCacheRelease || null;
    var pcieDeltaCache = m.pcieDeltaCache || (state.trainingSummary && state.trainingSummary.pcieDeltaCache) || null;
    var pcieCacheV0 = m.pcieCacheV0 || (state.trainingSummary && state.trainingSummary.pcieCacheV0) || null;
    var pcieCacheV0Recommendation = m.pcieCacheV0Recommendation || (state.trainingSummary && state.trainingSummary.pcieCacheV0Recommendation) || null;
    var smartSensingRuntime = m.vramSmartSensingRuntime || (state.trainingSummary && state.trainingSummary.vramSmartSensingRuntime) || null;
    var showGhostCard = !!(state.config.lulynx_ghost_replay || ghost);
    var ghostStatus = ghost && ghost.last_status ? String(ghost.last_status) : 'idle';
    var ghostStatusMap = {
      idle: '\u5f85\u673a',
      matched: '\u547d\u4e2d',
      matched_zero_loss: '\u547d\u4e2d (0 Loss)',
      no_match: '\u672a\u547d\u4e2d',
      interval_skip: '\u95f4\u9694\u8df3\u8fc7',
      no_features: '\u65e0\u7279\u5f81',
      capture_unavailable: '\u672a\u5b89\u88c5 Capture',
      compute_error: '\u8ba1\u7b97\u9519\u8bef',
      non_finite: '\u975e\u6709\u9650\u503c',
    };
    var ghostStatusColor = (
      ghostStatus === 'matched' || ghostStatus === 'matched_zero_loss' ? '#22c55e' :
      ghostStatus === 'compute_error' || ghostStatus === 'non_finite' ? '#ef4444' :
      ghostStatus === 'no_match' ? '#f59e0b' :
      'var(--text-dim)'
    );
    var ghostStatusLabel = ghostStatusMap[ghostStatus] || ghostStatus;
    var ghostLastLoss = ghost && ghost.last_loss != null ? Number(ghost.last_loss).toFixed(4) : '\u2014';
    var ghostAvgLoss = ghost && ghost.loss_events > 0 ? Number(ghost.avg_loss || 0).toFixed(4) : '\u2014';
    var ghostAttemptText = ghost ? (String(ghost.matches || 0) + ' / ' + String(ghost.attempts || 0)) : '\u2014';
    var ghostLayerText = ghost ? (String(ghost.last_matched_layers || 0) + ' / ' + String(ghost.model_matched_layer_count || 0)) : '\u2014';
    var ghostCompatText = ghost ? String(ghost.compatibility_status || 'unknown') : '\u672a\u52a0\u8f7d';
    var ghostWarnings = ghost && Array.isArray(ghost.warnings) ? ghost.warnings.filter(Boolean).slice(0, 2) : [];
    var ghostCardHtml = showGhostCard ? (
      '<div class="train-side-section" id="train-ghost-card">'
      + '<div class="train-panel-title">Ghost Replay</div>'
      + '<div class="train-hw-card">'
      +   '<div class="train-hw-row"><span class="hw-label">\u72b6\u6001</span><span id="train-ghost-status" class="hw-value" style="color:' + ghostStatusColor + ';">' + escapeHtml(ghostStatusLabel) + '</span></div>'
      +   '<div class="train-hw-row"><span class="hw-label">\u547d\u4e2d / \u5c1d\u8bd5</span><span id="train-ghost-attempts" class="hw-value">' + escapeHtml(ghostAttemptText) + '</span></div>'
      +   '<div class="train-hw-row"><span class="hw-label">\u672c\u6b21\u5c42\u547d\u4e2d</span><span id="train-ghost-layers" class="hw-value">' + escapeHtml(ghostLayerText) + '</span></div>'
      +   '<div class="train-hw-row"><span class="hw-label">\u672c\u6b21 / \u5747\u503c Loss</span><span id="train-ghost-loss" class="hw-value">' + escapeHtml(ghostLastLoss + ' / ' + ghostAvgLoss) + '</span></div>'
      +   '<div class="train-hw-row"><span class="hw-label">\u517c\u5bb9\u6027</span><span id="train-ghost-compat" class="hw-value">' + escapeHtml(ghostCompatText) + '</span></div>'
      + '</div>'
      + '<div id="train-ghost-warnings" style="margin-top:8px;font-size:0.68rem;color:var(--text-muted);line-height:1.45;">'
      +   (ghostWarnings.length > 0 ? ghostWarnings.map(function(item) { return '<div>' + escapeHtml(item) + '</div>'; }).join('') : '')
      + '</div>'
      + '</div>'
    ) : '';

    // Status indicator
var statusDot = '', statusText = '';
    if (hasRunning) {
      statusDot = '<span style="width:8px;height:8px;border-radius:50%;background:var(--accent);display:inline-block;animation:pulse-dot 1.5s ease-in-out infinite;"></span>';
      statusText = '<span style="font-family:monospace;font-size:0.82rem;font-weight:700;color:var(--accent);">SESSION_' + taskIdShort + '</span>';
    } else if (state.trainingFailed) {
      statusDot ='<span style="width:8px;height:8px;border-radius:50%;background:#ef4444;display:inline-block;"></span>';
      statusText = '<span style="font-family:monospace;font-size:0.82rem;font-weight:700;color:#ef4444;">FAILED</span>';
    } else if (finished.length > 0) {
      statusDot = '<span style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;"></span>';
      statusText = '<span style="font-family:monospace;font-size:0.82rem;font-weight:700;color:#22c55e;">COMPLETED</span>';
    } else {
      statusDot = '<span style="width:8px;height:8px;border-radius:50%;background:var(--text-muted);display:inline-block;"></span>';
      statusText = '<span style="font-family:monospace;font-size:0.82rem;color:var(--text-muted);">IDLE</span>';
   }

    // Mixed precision tag
    var precisionTag = state.config.mixed_precision ? state.config.mixed_precision.toUpperCase() : 'FP32';

    // GPU info
    var gpuName = '\u68c0\u6d4b\u4e2d...';
    if (state.runtime && state.runtime.cards && state.runtime.cards.length > 0){
      var card = state.runtime.cards[0];
      gpuName = (typeof card === 'string') ? card : (card.name || 'GPU');
    }

    // Loss sparklineSVG
    var sparkSvg = '';
    if (m.losses.length >= 2) {
      var pts = m.losses.slice(-50);
      var maxL = Math.max.apply(null, pts.map(function(p) { return p.loss; }));
      var minL = Math.min.apply(null, pts.map(function(p) { return p.loss; }));
      var range = maxL- minL || 0.001;
      var pathParts = [];
      for (var pi = 0; pi < pts.length; pi++) {
        var px = (pi / (pts.length - 1)) * 100;
        var py = 100 - ((pts[pi].loss - minL) / range) * 90 - 5;
        pathParts.push((pi === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1));
      }
      var pathD = pathParts.join(' ');
      sparkSvg = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;">'
        + '<defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity="0.3"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>'
        + '<path d="' + pathD + '"fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>'
       + '<path d="' + pathD + ' L100 100 L0 100 Z" fill="url(#lg)"/>'
        + '</svg>';
    }

    // Active params
    var networkAlgo = state.config.network_module || '';
    // Anima 使用 lora_type 字段而非 network_module
    if ((!networkAlgo || networkAlgo === 'networks.lora_anima' || networkAlgo === 'networks.tlora_anima') && state.config.lora_type) {
      var lt = state.config.lora_type;
 if (lt === 'lora') networkAlgo = 'LoRA (Anima)';
      else if (lt === 'lora_fa') networkAlgo = 'LoRA-FA (Anima)';
      else if (lt === 'vera')networkAlgo = 'VeRA (Anima)';
      else if (lt === 'tlora') networkAlgo = 'T-LoRA (Anima)';
      else if (lt === 'lokr') networkAlgo = 'LoKr (Anima)';
    }
    if (networkAlgo === 'lycoris.kohya' && state.config.lycoris_algo) {
      networkAlgo = 'LyCORIS / ' + state.config.lycoris_algo;
    } else if (networkAlgo === 'networks.lora') { networkAlgo = 'LoRA'; }
    else if (networkAlgo === 'networks.lora_flux') { networkAlgo = 'LoRA (FLUX)'; }
    else if (networkAlgo === 'networks.tlora_flux') { networkAlgo = 'T-LoRA (FLUX)'; }
    else if (networkAlgo === 'networks.oft_flux') { networkAlgo = 'OFT (FLUX)'; }
    else if (networkAlgo === 'networks.lora_anima') { networkAlgo = 'LoRA (Anima)'; }
    else if (networkAlgo === 'networks.tlora_anima') { networkAlgo = 'T-LoRA (Anima)'; }
    else if (networkAlgo === 'networks.lora_sd3') { networkAlgo = 'LoRA (SD3)'; }
    else if (networkAlgo === 'networks.lora_lumina') { networkAlgo = 'LoRA (Lumina)'; }
    else if (networkAlgo === 'networks.lora_hunyuan_image') { networkAlgo = 'LoRA (HunyuanImage)'; }
    else if (networkAlgo === 'networks.dylora') { networkAlgo = 'DyLoRA'; }
  // Newbie 使用 adapter_type 字段
    if (!networkAlgo && state.config.adapter_type && state.config.model_train_type === 'newbie-lora') {
      var at = state.config.adapter_type;
      if (at === 'lora') networkAlgo = 'LoRA (Newbie)';
  else if (at === 'lokr') networkAlgo = 'LoKr (Newbie)';
    }
    var trainLengthLabel = (state.config.train_length_mode || '\u6700\u5927\u8f6e\u6570') === '\u6700\u5927\u6b65\u6570' ? '\u6700\u5927\u6b65\u6570' : '\u6700\u5927\u8f6e\u6570';
    var trainLengthValue = (state.config.train_length_mode || '\u6700\u5927\u8f6e\u6570') === '\u6700\u5927\u6b65\u6570'
      ? (state.config.max_train_steps || '\u2014')
      : (state.config.max_train_epochs || '\u2014');
    var cfgParams = [
      ['\u7f51\u7edc\u7b97\u6cd5', networkAlgo || '\u2014'],
    ['\u5b66\u4e60\u7387\u8c03\u5ea6\u5668', state.config.lr_scheduler ? schedulerOption(state.config.lr_scheduler).label : '\u2014'],
      ['\u4f18\u5316\u5668', state.config.optimizer_type || '\u2014'],
      ['\u6279\u91cf\u5927\u5c0f', state.config.train_batch_size || '\u2014'],
      ['\u5b66\u4e60\u7387', state.config.learning_rate || '\u2014'],
   ['\u7f51\u7edc\u7ef4\u5ea6', state.config.network_dim || '\u2014'],
      ['\u7f51\u7edc Alpha', state.config.network_alpha || '\u2014'],
      ['\u8bad\u7ec3\u5206\u8fa8\u7387', state.config.resolution || '\u2014'],
      [trainLengthLabel, trainLengthValue],
      ['\u4fdd\u5b58\u95f4\u9694', state.config.save_every_n_epochs || '\u2014'],
      ['CLIP \u8df3\u8fc7\u5c42', state.config.clip_skip || '\u2014'],
      ['\u968f\u673a\u79cd\u5b50', state.config.seed || '\u2014'],
    ];
    var paramsHtml = cfgParams.map(function(p) {
      return '<div class="train-param-row">'
        + '<span class="train-param-key">'+ p[0] + '</span>'
        + '<span class="train-param-val">'+ escapeHtml(String(p[1])) + '</span>'
        + '</div>';
    }).join('');

    container.innerHTML = ''
    + '<div class="train-dashboard">'
    + '<div class="train-exec-header">'
    +   '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">'
    +     '<div style="display:flex;align-items:center;gap:8px;">' + statusDot + statusText + '</div>'
  +     '<span class="train-hdr-sep"></span>'
    +     '<span class="train-hdr-label">\u5f53\u524d\u6b65\u6570: <span class="train-hdr-val">' + curStep.toLocaleString() + ' / ' + (totalSteps > 0 ? totalSteps.toLocaleString() : '--') + '</span></span>'
    +   '<span class="train-hdr-label">\u5269\u4f59\u65f6\u95f4: <span class="train-hdr-val">' + remainStr + '</span></span>'
    +     (epochStr ? '<span class="train-hdr-label">' + epochStr+ '</span>' : '')
    +   '</div>'
    +   '<div style="display:flex;align-items:center;gap:8px;">'
    +     '<span class="train-tag train-tag-accent">' + precisionTag + '</span>'
    +     (hasRunning && curTask ? '<span class="train-tag">PID: ' +escapeHtml(curTask.id.slice(0, 8)) + '</span>' : '')
    +   '</div>'
    + '</div>'

    // Tab bar
    + '<div class="train-tabs">'
    +   '<button class="train-tab' + (state.trainSubTab === 'monitor' ? ' active' : '') + '" onclick="switchTrainTab(\'monitor\')">' + _ico('terminal', 14) + ' \u76d1\u63a7</button>'
    +   '<button class="train-tab' + (state.trainSubTab === 'samples' ? ' active' : '') + '" onclick="switchTrainTab(\'samples\')">' + _ico('eye', 14) + ' \u9884\u89c8</button>'
    +   '<button class="train-tab' + (state.trainSubTab === 'preflight' ? ' active' : '') + '" onclick="switchTrainTab(\'preflight\')">' + _ico('check-circle', 14) + ' \u9884\u68c0</button>'
    + '</div>'

    // Body: conditional on sub-tab
    + (state.trainSubTab === 'preflight' ? _renderPreflightPanel() : '')
   + (state.trainSubTab === 'samples' ?_renderSamplesPanel() : '')
    + (state.trainSubTab === 'monitor' ? (
    '<div class="train-body">'
    // ---- Left: Terminal ----
    +   '<div class="train-logs-area">'
    +     '<div class="train-panel-header">'
    +       '<span class="train-panel-title">' + _ico('terminal', 14) + ' \u7cfb\u7edf\u6267\u884c\u65e5\u5fd7</span>'
    +       '<div style="display:flex;gap:8px;align-items:center;">'
   +         '<label style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-muted);cursor:pointer;">'
    +           '<input type="checkbox" id="training-log-autoscroll" checked style="width:13px;height:13px;"> \u81ea\u52a8\u6eda\u52a8'
    +         '</label>'
    +         '<button class="btn btn-outline btn-sm" type="button" onclick="refreshTrainingLog()" style="font-size:0.68rem;padding:2px 10px;">\u5237\u65b0</button>'
    +       '</div>'
    +     '</div>'
    +     '<div id="training-log-container" class="train-terminal">'
   +       (hasRunning
        ? (logSnapshot.html && logSnapshot.taskId === curTask.id
                  ? logSnapshot.html
                  : '<span style="color:var(--text-muted);">' + _ico('loader', 14) + ' \u6b63\u5728\u52a0\u8f7d\u8bad\u7ec3\u8f93\u51fa...</span>')
              : (logSnapshot.html
                  ? logSnapshot.html
                  : '<span style="color:var(--text-muted);">\u6682\u65e0\u8bad\u7ec3\u4efb\u52a1\u8fd0\u884c\u4e2d\u3002\u70b9\u51fb\u300c\u5f00\u59cb\u8bad\u7ec3\u300d\u542f\u52a8\u540e\uff0c\u8f93\u51fa\u5c06\u5728\u6b64\u5b9e\u65f6\u663e\u793a\u3002</span>'))
    +     '</div>'
    +   '</div>'

    // ---- Right: Side Panel ----
    +   '<div class="train-side-panel">'

    // Live Loss
    +     '<div class="train-side-section">'
    +       '<div class="train-panel-title">\u5b9e\u65f6 Loss</div>'
    +       '<div style="display:flex;justify-content:space-between;align-items:flex-end;">'
    +         '<span class="train-loss-big">' +(curLoss > 0 ? curLoss.toFixed(4) : '\u2014')+ '</span>'
    +         '<span class="train-loss-delta" style="color:' + lossArrowColor + ';">' + lossArrow + ' ' + (lossDeltaPct !== 0 ? (lossDeltaPct > 0 ? '+' : '') + lossDeltaPct.toFixed(1) + '%' : '') + '</span>'
    +       '</div>'
    +       '<div class="train-chart-box">'
    +         (sparkSvg || '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:0.72rem;">\u7b49\u5f85\u6570\u636e...</div>')
    +     '</div>'
    +       (m.losses.length > 0 ? '<div class="train-chart-axis"><span>Step 0</span><span>Step ' + curStep + '</span></div>' : '')
    +     '</div>'

    +     ghostCardHtml

    // Hardware
    +'<div class="train-side-section">'
    +       '<div class="train-panel-title">' + _ico('activity', 14) + ' \u786c\u4ef6 / \u8d44\u6e90\u76d1\u63a7</div>'
    +       '<div class="train-hw-card">'
    +         '<div class="train-hw-row"><span class="hw-label">\u663e\u5361</span><span class="hw-value">' + escapeHtml(gpuName) + '</span></div>'
    +  '<div class="train-hw-row"><span class="hw-label">\u901f\u5ea6</span><span id="train-live-speed" class="hw-value-accent">' + (curSpeed >0 ? curSpeed.toFixed(2) + ' it/s' : '\u2014') + '</span></div>'
    +         '<div class="train-hw-row"><span class="hw-label">\u8fd0\u884c\u73af\u5883</span><span class="hw-value">' + (state.runtime && state.runtime.runtime ? state.runtime.runtime.environment : 'standard') + '</span></div>'
    +         '<div class="train-hw-row"><span class="hw-label">\u7cbe\u5ea6</span><span class="hw-value">' + precisionTag + '</span></div>'
    +       '</div>'
    +       '<div id="sys-monitor-panel" class="sysmon-panel">' + _buildSysMonitorHTML() + '</div>'
    +       '</div>'

    +     renderNativeUnetRuntimeCard(nativeUnetProfile)

    +     renderPeakVramDiagnosticsCard(peakVramDiagnostics, cudaCacheRelease)

    +     renderPcieDeltaCacheRuntimeCard(pcieDeltaCache)

    +     renderPcieCacheV0RecommendationRuntimeCard(pcieCacheV0Recommendation, pcieCacheV0)

    +     renderPcieCacheV0RuntimeCard(pcieCacheV0)

    +     renderSmartSensingRuntimeCard(smartSensingRuntime)

    +     renderPrecisionSwapRuntimeCard(precisionSwapProfile)

    // Active params
    +     '<div class="train-side-section">'
    +       '<div class="train-panel-title">' + _ico('settings',14) + '\u5f53\u524d\u53c2\u6570</div>'
    +       '<div>' + paramsHtml + '</div>'
    +     '</div>'

   +     renderSlot('training.runtime_widget')

    +   '</div>'
    + '</div>'

    // Training summary + Task history (monitor only)
    + renderTrainingSummaryHTML()
    + '<div class="train-history-section">'
    +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
    +     '<div class="train-panel-title">' + _ico('clock', 14) + ' \u4efb\u52a1\u5386\u53f2</div>'
    +     (state.tasks.length > 0 ? '<button class="btn btn-outline btn-sm" style="font-size:0.7rem;padding:2px 8px;" type="button"onclick="clearAllTaskHistory()">' + _ico('trash-2', 12) + ' \u6e05\u7a7a\u5386\u53f2</button>' : '')
    +   '</div>'
    +   (state.tasks.length === 0
        ? '<p style="color:var(--text-muted);font-size:0.78rem;">\u6682\u65e0\u4efb\u52a1\u8bb0\u5f55</p>'
        : state.tasks.slice().reverse().map(function(task) {
      var statusMap = { RUNNING: _ico('loader') + ' \u8fd0\u884c\u4e2d', FINISHED: _ico('check-circle')+ ' \u5df2\u5b8c\u6210', COMPLETED: _ico('check-circle') + ' \u5df2\u5b8c\u6210', TERMINATED: _ico('stop-circle') + ' \u5df2\u7ec8\u6b62', FAILED: _ico('x-circle') + ' \u5931\u8d25', CANCELLED: _ico('stop-circle') + ' \u5df2\u53d6\u6d88', CREATED: _ico('clock') + ' \u5df2\u521b\u5efa' };
      var statusColor = { RUNNING: '#f59e0b', FINISHED: '#22c55e', COMPLETED: '#22c55e', TERMINATED: '#ef4444', FAILED: '#ef4444', CANCELLED: '#ef4444', CREATED: 'var(--text-dim)' };
      var canScore = ['FINISHED', 'COMPLETED'].includes(String(task.status || '').toUpperCase());
      var hasCached = canScore && !!(state.taskSummaries[task.id] && state.taskSummaries[task.id]._v >= 2);
      var isNotRunning = String(task.status || '').toUpperCase() !== 'RUNNING';
      var badge = hasCached ? _ico('bar-chart', 14) : (canScore && !task._recentlyFinished ? '\u70b9\u51fb\u8bc4\u5206' : '');
      var taskLabel= task.output_name || task.id.substring(0, 8);
      var timeStr = task.created_at || '';
      var typeTag = task.training_type_label || task.model_train_type || '';
   var metaParts = [timeStr, task.resolution ? ('\u5206\u8fa8\u7387 ' + task.resolution) : '', task.network_dim ? ('dim ' + task.network_dim) : ''].filter(Boolean);
      var metaStr = metaParts.join(' \u00b7 ');
      return '<div style="border-bottom:1px solid var(--border);padding:5px 0;" id="task-row-' + task.id + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;">'
        + '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;' + (canScore ? 'cursor:pointer;' : '') + '" ' + (canScore ? 'onclick="showTaskSummary(\'' + task.id + '\')"' : '') + '>'
        + '<span style="font-size:0.78rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(taskLabel) + '</span>'
        + (typeTag ? '<span style="font-size:0.65rem;color:var(--text-muted);background:var(--bg-hover);padding:1px 5px;border-radius:3px;">' + escapeHtml(typeTag) + '</span>' : '')
        + (badge ? '<span style="font-size:0.68rem;color:var(--accent);opacity:0.7;">' + badge + '</span>' : '')
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">'
        + '<span style="color:' + (statusColor[task.status] || 'var(--text-dim)') + ';font-weight:600;font-size:0.78rem;">' + (statusMap[task.status] || task.status) + '</span>'
        + (isNotRunning ? '<button class="btn-icon" style="opacity:0.5;font-size:0.7rem;padding:2px;" type="button" onclick="event.stopPropagation();deleteTaskHistory(\'' + task.id + '\')" title="\u5220\u9664\u8bb0\u5f55">' + _ico('x', 12) + '</button>' : '')

        + '</div>'
        + '</div>'
        + (metaStr ? '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">' + escapeHtml(metaStr) + '</div>' :'')
        + '<div id="task-summary-' + task.id + '" style="display:none;" data-loaded="' + (hasCached ? 'true' : 'false') + '">' + (hasCached ? renderSummaryCard(state.taskSummaries[task.id], { pcieTransferBenchmark: state.pcieTransferBenchmark }) : '') + '</div>'
        + '</div>';
    }).join(''))
    + '</div>'

    + '</div>'
    ) : '') // end monitor conditional
    + '</div>'; // close train-dashboard

    _syncFooterAction();
    if (hasRunning) {
      _startTrainingLogPolling();
      _startSysMonitorPolling();
    } else {
      _pollSystemMonitorOnce(); // \u5373\u4f7f\u6ca1\u6709\u8bad\u7ec3\u4e5f\u83b7\u53d6\u4e00\u6b21\u5f53\u524d\u72b6\u6001
    }
  }

  return { renderTraining, renderTrainingSummaryHTML };
}
