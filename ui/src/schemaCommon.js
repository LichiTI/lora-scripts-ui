// ================================================================
// schemaCommon.js — Schema 公共工具库（谓词 / 常量 / OPTIONS）
// 跨训练族共享的纯函数与常量。sdxlSchema / animaSchema / schemaFieldGroups
// 都从这里 import。本文件不 import 任何 schema 文件，保证单向依赖无环。
// 提取自 sdxlSchema.js（原样搬运，零行为变更）。
// ================================================================

// ---- 谓词组合器 ----
export function when(key, expected) { return (c) => c[key] === expected; }
export function all(...fns) { return (c) => fns.every((f) => f(c)); }
export function oneOf(key, values) { return (c) => values.includes(c[key]); }
export function optimizerIs(value) { return (c) => String(c.optimizer_type || '').trim().toLowerCase() === String(value || '').trim().toLowerCase(); }
export function adamwFamilyOptimizer(c) { return ['adamw', 'adamw8bit'].includes(String(c.optimizer_type || '').trim().toLowerCase()); }
export function swapEnabled(c) { return c.swap_granularity && c.swap_granularity !== 'off'; }
export function nonResidentBlockMode(key) { return (c) => c[key] && c[key] !== 'resident'; }
export function streamingBlockMode(key) { return when(key, 'streaming_offload'); }
export const flowEnabled = when('flow_model', true);
export const LOSS_AWARE_SCHEDULERS = ['loss_gated_cosine', 'loss_weighted_annealed_cosine'];
export const lossAwareScheduler = oneOf('lr_scheduler', LOSS_AWARE_SCHEDULERS);
export const lossWeightedScheduler = when('lr_scheduler', 'loss_weighted_annealed_cosine');
export const muonOptimizer = optimizerIs('Muon');
export const fp8BaseStorageEnabled = (c) => c.fp8_base === true || (c.weight_compression_enabled === true && c.weight_compression_format === 'fp8_e4m3');

// ---- 调度器常量 ----
export const STANDARD_SCHEDULERS = [
  'linear',
  'cosine',
  'cosine_with_restarts',
  'polynomial',
  'constant',
  'constant_with_warmup',
  'adafactor',
  'inverse_sqrt',
  'reduce_lr_on_plateau',
  'cosine_with_min_lr',
  'cosine_warmup_with_min_lr',
  'loss_gated_cosine',
  'loss_weighted_annealed_cosine',
  'warmup_stable_decay',
  'piecewise_constant',
];

// ---- OPTIONS 常量 ----
export const DIT_BLOCK_RESIDENCY_OPTIONS = [
  { value: 'resident', label: '常驻 GPU（resident）' },
  { value: 'streaming_offload', label: 'Streaming Offload（平衡）' },
  { value: 'block_cpu_pinned', label: 'Block CPU pinned（最低显存/最慢）' },
];

export const PCIE_TRANSFER_FORMAT_OPTIONS = [
  { value: 'off', label: '关闭（off）' },
  { value: 'fp8_e4m3', label: 'FP8 E4M3 传输（实验）' },
  { value: 'int8_rowwise', label: 'INT8 行缩放传输（实验）' },
  { value: 'uint4_rowwise', label: 'UINT4 行缩放传输（更实验）' },
  { value: 'raw_bf16', label: 'Raw BF16 传输（对照）' },
  { value: 'raw_fp16', label: 'Raw FP16 传输（对照）' },
];

export const ACTIVATION_COMPRESSION_DTYPE_OPTIONS = [
  { value: 'fp16', label: 'FP16（默认）' },
  { value: 'bf16', label: 'BF16' },
  { value: 'fp8_e4m3', label: 'FP8 E4M3（实验）' },
];

export const DDPM_TIMESTEP_SAMPLING_OPTIONS = [
  { value: '', label: '默认均匀采样' },
  { value: 'uniform', label: 'Uniform（均匀）' },
  { value: 'logit_normal', label: 'Logit Normal' },
  { value: 'low_snr_bias', label: 'Low-SNR Bias（FasterDiT）' },
];

export const FASTER_DIT_SNR_MODE_OPTIONS = [
  { value: 'sqrt', label: 'sqrt（推荐）' },
  { value: 'log', label: 'log（更激进）' },
  { value: 'standard', label: 'standard（标准）' },
];

export const LORA_RECOMPUTE_OPTIONS = [
  { value: 'auto', label: '自动（DiT 默认开启）' },
  { value: 'on', label: '强制开启' },
  { value: 'off', label: '关闭（用于 A/B）' },
];

export const WINDOW_ATTENTION_BACKEND_OPTIONS = [
  { value: 'auto', label: '自动（优先启动器/预检解析）' },
  { value: 'flex', label: 'FlexAttention' },
  { value: 'sdpa_masked', label: 'SDPA Masked' },
  { value: 'torch_fallback', label: 'Torch Fallback（小序列调试）' },
];

export const LOSS_PRECISION_OPTIONS = [
  { value: 'fp32_loss', label: 'FP32 Loss（默认）' },
  { value: 'mixed_loss', label: 'Mixed Loss（实验）' },
];

export const COMPILE_RUNTIME_OPTIONS = [
  { value: 'auto', label: '自动收敛（显式参数优先）' },
  { value: 'off', label: '关闭（off）' },
  { value: 'compile', label: 'torch.compile' },
  { value: 'compile_cache', label: 'torch.compile + 本地缓存' },
  { value: 'cudagraph', label: 'CUDAGraph 后端（实验）' },
  { value: 'compile_cudagraph', label: 'Compile + CUDAGraph + 缓存（实验）' },
];

export const COMPILE_SHAPE_STRATEGY_OPTIONS = [
  { value: 'auto', label: '自动（按路由探测）' },
  { value: 'fixed_pad', label: 'Fixed Pad（固定视觉 token）' },
  { value: 'token_flatten', label: 'Token Flatten（原生 token bucket）' },
  { value: 'native', label: 'Native（同 token_flatten）' },
];

export const COMPILE_TARGET_STRATEGY_OPTIONS = [
  { value: 'auto', label: '自动（按模块探测）' },
  { value: 'block', label: 'Block（整块编译）' },
  { value: 'inner_forward', label: 'Inner Forward（优先稳定内核路径）' },
];

export const SAFEGUARD_GRADIENT_SCAN_OPTIONS = [
  { value: 'batched', label: 'Batched（推荐）' },
  { value: 'foreach', label: 'Foreach' },
  { value: 'legacy', label: 'Legacy（逐参数）' },
  { value: 'off', label: '关闭梯度范数扫描' },
];

export const FUSED_PROJECTION_MEMORY_MODE_OPTIONS = [
  { value: 'keep_original', label: '保留原始层（keep_original）' },
  { value: 'drop_original', label: '删除原始层（drop_original）' },
  { value: 'materialize_on_save', label: '保存时补回（materialize_on_save）' },
];

export const OPTIMIZER_BACKEND_OPTIONS = [
  { value: 'auto', label: '自动（auto）' },
  { value: 'torch_adamw', label: 'PyTorch AdamW' },
  { value: 'foreach_adamw', label: 'PyTorch Foreach AdamW' },
  { value: 'torch_fused', label: 'PyTorch Fused AdamW' },
  { value: 'bnb_8bit', label: 'bitsandbytes 8-bit AdamW' },
  { value: 'apex', label: 'Apex FusedAdam（可选依赖）' },
  { value: 'lulynx_fused', label: 'Lulynx FusedAdamW（兼容后端）' },
];

export const ADVANCED_OPTIMIZER_STRATEGY_OPTIONS = [
  { value: 'auto', label: '自动（尊重已有配置）' },
  { value: 'off', label: '关闭新策略选择' },
  { value: 'profile_only', label: '仅记录 Profile' },
  { value: 'lora_plus', label: 'LoRA+（现有参数组）' },
  { value: 'rs_lora', label: 'RS-LoRA' },
];

export const DATA_TRANSFER_PROFILE_MODE_OPTIONS = [
  { value: 'event', label: 'Event（推荐，延迟同步）' },
  { value: 'sync', label: 'Sync（精确调试，会变慢）' },
  { value: 'off', label: '关闭' },
];

export const IMAGE_DECODE_BACKEND_OPTIONS = [
  { value: 'pil', label: 'PIL（默认/最兼容）' },
  { value: 'auto', label: '自动（有缓存大小时启用 PIL LRU）' },
  { value: 'pil_lru', label: 'PIL LRU 缓存' },
  { value: 'torchvision_cpu', label: 'torchvision CPU（不占训练显存）' },
];

export const DATA_BACKEND_OPTIONS = [
  { value: 'auto', label: '自动（当前保持 CaptionDataset）' },
  { value: 'caption', label: 'CaptionDataset（当前稳定路径）' },
  { value: 'raw', label: 'Raw/Caption 别名（归一到 CaptionDataset）' },
  { value: 'webdataset', label: 'WebDataset（探测/Profile）' },
  { value: 'dali', label: 'DALI（预留/Profile）' },
];

export const CACHED_COLLATE_MODE_OPTIONS = [
  { value: 'auto', label: '自动（pad_sequence）' },
  { value: 'pad_sequence', label: 'PyTorch pad_sequence' },
  { value: 'legacy', label: 'Legacy 预分配' },
];

export const CHECKPOINT_POLICY_OPTIONS = [
  { value: 'auto', label: '自动（尊重现有检查点开关）' },
  { value: 'off', label: '关闭' },
  { value: 'full', label: 'Full checkpointing' },
  { value: 'offloaded', label: 'CPU offloaded checkpointing' },
  { value: 'selective', label: 'Selective recompute（Anima 实验，其它回退）' },
];

export const BLOCK_SWAP_STRATEGY_OPTIONS = [
  { value: 'auto', label: '自动（尊重后端解析）' },
  { value: 'sync', label: '同步（保守/调试）' },
  { value: 'async', label: '异步预取' },
];

// ---- 字段级 helper（依赖上方谓词 / OPTIONS）----
export const PCIE_TRANSFER_FORMAT_FIELD = {
  key: 'pcie_transfer_format',
  type: 'select',
  label: 'PCIe 训练传输格式（pcie_transfer_format）',
  desc: '实验性全局方案：仅作用于 CPU-pinned 的冻结 Linear 权重，CPU 侧预打包，训练时传到 GPU 后快速还原。默认关闭；建议先用 PCIe benchmark 对比 FP8/INT8。',
  defaultValue: 'off',
  options: PCIE_TRANSFER_FORMAT_OPTIONS,
};

export const sparseSwapFields = (residencyKey) => [
  { key: 'sparse_swap_enabled', type: 'boolean', label: '稀疏交换方案（sparse_swap_enabled）', desc: '实验性：仅对 Streaming Offload 生效。把冷层分成 warm prefetch 与 cold on-demand，减少低端卡 PCIe 预取队列压力。默认关闭。', defaultValue: false, visibleWhen: streamingBlockMode(residencyKey) },
  { key: 'sparse_swap_warm_fraction', type: 'number', label: '稀疏交换 Warm 比例（sparse_swap_warm_fraction）', desc: '冷层中允许提前预取的比例；剩余冷层按需交换。推荐 0.25-0.40。', defaultValue: 0.35, min: 0, max: 1, step: 0.05, visibleWhen: all(streamingBlockMode(residencyKey), when('sparse_swap_enabled', true)) },
  { key: 'sparse_swap_budget_mb', type: 'number', label: '稀疏交换 Warm 预算 MB（sparse_swap_budget_mb）', desc: '限制 warm prefetch 的 FP16 等效预算。0 表示不额外限制，只按 Warm 比例。', defaultValue: 0, min: 0, step: 64, visibleWhen: all(streamingBlockMode(residencyKey), when('sparse_swap_enabled', true)) },
];

export const pcieDeltaCacheField = (residencyKey) => ({
  key: 'pcie_delta_cache_enabled',
  type: 'boolean',
  label: 'PCIe Delta/Cache 候选分析（pcie_delta_cache_enabled）',
  desc: '实验性手动入口。observe 只输出候选报告；cache_v0 会在预算内缓存部分 CPU-pinned 冻结 Linear 的 GPU 解码副本。默认关闭。',
  defaultValue: false,
  visibleWhen: nonResidentBlockMode(residencyKey),
});

export const pcieDeltaCacheModeFields = (residencyKey) => [
  { key: 'pcie_delta_cache_mode', type: 'select', label: 'PCIe Delta/Cache 模式（pcie_delta_cache_mode）', desc: 'observe 只读观察；cache_v0 是手动实验缓存，不会由自动增强开启。建议只在 prefetch 覆盖差、关闭或 PCIe 等待明显时尝试。', defaultValue: 'observe', options: ['observe', 'cache_v0'], visibleWhen: all(nonResidentBlockMode(residencyKey), when('pcie_delta_cache_enabled', true)) },
  { key: 'pcie_delta_cache_budget_mb', type: 'number', label: 'PCIe Cache v0 预算 MB（pcie_delta_cache_budget_mb）', desc: 'cache_v0 的 GPU 缓存预算。建议 256MB 起步；prefetch 已完整覆盖时通常没有收益，预算过大还可能更慢。0 表示不启用真实缓存。', defaultValue: 256, min: 0, step: 64, visibleWhen: all(nonResidentBlockMode(residencyKey), when('pcie_delta_cache_enabled', true), when('pcie_delta_cache_mode', 'cache_v0')) },
];
