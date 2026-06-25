// 一次性 parity 验证:推理加速 3 控件(开关 enable_inference_accel + 方案 sample_cache_seam_backend
// + 强度 sample_cache_seam_window_size / sample_smoothcache_error_threshold)。
//
// 红线:关时(或 enable_preview 关)→ payload 完全不含任何 cache_seam 字段 → 后端用 configs 默认
// sample_cache_seam_backend='none' = bitwise parity。开时按方案精确透传强度值,且 UI gate 字段
// enable_inference_accel 永不泄漏到后端 payload。
//
// 运行:env/python 无关,纯 node。
//   node H:/lulynx-trainer/plugin/lora-scripts-ui-main/ui/tools/inferenceAccelUiSmoke.mjs
import { createDefaultConfig, buildRunConfig } from '../src/schemaIndex.js';

const TYPE = 'anima-lora';
let failed = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ok  ' + msg); }
  else { console.error('  FAIL ' + msg); failed += 1; }
}

function cfgWith(overrides) {
  return Object.assign(createDefaultConfig(TYPE), overrides);
}

// ── Case A:预览开 + 加速关 → 无任何 cache_seam 字段(回 none = parity) ──
console.log('[A] enable_preview=true, enable_inference_accel=false');
{
  // 即便残留把方案设成 spectrum,关时也必须被隐藏丢弃
  const p = buildRunConfig(cfgWith({
    enable_preview: true,
    enable_inference_accel: false,
    sample_cache_seam_backend: 'spectrum',
    sample_cache_seam_window_size: 7,
  }), TYPE);
  assert(!('sample_cache_seam_backend' in p), '关时不输出 sample_cache_seam_backend');
  assert(!('sample_cache_seam_window_size' in p), '关时不输出 sample_cache_seam_window_size');
  assert(!('sample_smoothcache_error_threshold' in p), '关时不输出 sample_smoothcache_error_threshold');
  assert(!('enable_inference_accel' in p), '关时不泄漏 enable_inference_accel 到后端');
}

// ── Case B:加速开 + Spectrum + 窗口 5 → backend=spectrum + window=5,无 smoothcache 字段 ──
console.log('[B] enable_inference_accel=true, backend=spectrum, window=5');
{
  const p = buildRunConfig(cfgWith({
    enable_preview: true,
    enable_inference_accel: true,
    sample_cache_seam_backend: 'spectrum',
    sample_cache_seam_window_size: 5,
  }), TYPE);
  assert(p.sample_cache_seam_backend === 'spectrum', "backend === 'spectrum'");
  assert(p.sample_cache_seam_window_size === 5, 'window_size === 5(精确透传)');
  assert(!('sample_smoothcache_error_threshold' in p), 'spectrum 下不输出 smoothcache 阈值');
  assert(!('enable_inference_accel' in p), '开时仍不泄漏 enable_inference_accel(UI gate)');
}

// ── Case C:加速开 + SmoothCache + 阈值 0.05 → backend=smoothcache + threshold=0.05,无 window ──
console.log('[C] enable_inference_accel=true, backend=smoothcache, threshold=0.05');
{
  const p = buildRunConfig(cfgWith({
    enable_preview: true,
    enable_inference_accel: true,
    sample_cache_seam_backend: 'smoothcache',
    sample_smoothcache_error_threshold: 0.05,
  }), TYPE);
  assert(p.sample_cache_seam_backend === 'smoothcache', "backend === 'smoothcache'");
  assert(p.sample_smoothcache_error_threshold === 0.05, 'error_threshold === 0.05(精确透传)');
  assert(!('sample_cache_seam_window_size' in p), 'smoothcache 下不输出 spectrum 窗口');
  assert(!('enable_inference_accel' in p), '开时仍不泄漏 enable_inference_accel(UI gate)');
}

// ── Case D:预览整体关 → 加速字段全程不可见,即便强行置位也不输出 ──
console.log('[D] enable_preview=false(整组隐藏)');
{
  const p = buildRunConfig(cfgWith({
    enable_preview: false,
    enable_inference_accel: true,
    sample_cache_seam_backend: 'spectrum',
  }), TYPE);
  assert(!('sample_cache_seam_backend' in p), '预览关 → 不输出 backend');
  assert(!('sample_cache_seam_window_size' in p), '预览关 → 不输出 window');
  assert(!('enable_inference_accel' in p), '预览关 → 不泄漏 enable_inference_accel');
}

// ── Case E:默认配置(未碰任何加速控件)→ parity(等价 Case A 的子集) ──
console.log('[E] 默认配置(零干预)');
{
  const p = buildRunConfig(createDefaultConfig(TYPE), TYPE);
  assert(!('sample_cache_seam_backend' in p), '默认不输出 backend');
  assert(!('sample_cache_seam_window_size' in p), '默认不输出 window');
  assert(!('sample_smoothcache_error_threshold' in p), '默认不输出 threshold');
  assert(!('enable_inference_accel' in p), '默认不泄漏 enable_inference_accel');
}

if (failed === 0) {
  console.log('\nPASS — 推理加速 3 控件 parity 验证全绿');
  process.exit(0);
} else {
  console.error('\nFAIL — ' + failed + ' 条断言失败');
  process.exit(1);
}
