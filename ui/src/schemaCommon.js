// ================================================================
// schemaCommon.js — 训练类型 Schema 公共工具库
// 跨模型族共享的谓词/选项/字段构造器。各族 schema 文件(animaSchema/sdxlSchema/
// otherSchemas)与字段组库(schemaFieldGroups)都从这里 import。
// 纯数据 + 纯函数,无副作用,可在浏览器与 node 下直接 import。
// ================================================================
import {
  ALL_OPTIMIZERS,
  ALL_SCHEDULERS,
  FRONTIER_OPTIMIZER_CANDIDATE_OPTIONS,
  TARGET_LORA_OPTIMIZERS,
  getOptimizersForTrainingMode,
  schedulerOptions,
} from './features/settingsOptions.js';

export {
  ALL_OPTIMIZERS,
  ALL_SCHEDULERS,
  FRONTIER_OPTIMIZER_CANDIDATE_OPTIONS,
  TARGET_LORA_OPTIMIZERS,
  getOptimizersForTrainingMode,
  schedulerOptions,
};

// ---- 谓词组合器 ----
export function when(key, expected) { return (c) => c[key] === expected; }
export function all(...fns) { return (c) => fns.every((f) => f(c)); }
export function oneOf(key, values) { return (c) => values.includes(c[key]); }
export function optimizerIs(value) { return (c) => String(c.optimizer_type || '').trim().toLowerCase() === String(value || '').trim().toLowerCase(); }
export function adamwFamilyOptimizer(c) { return ['adamw', 'adamw8bit'].includes(String(c.optimizer_type || '').trim().toLowerCase()); }
export function swapEnabled(c) { return c.swap_granularity && c.swap_granularity !== 'off'; }
export function nonResidentBlockMode(key) { return (c) => c[key] && c[key] !== 'resident'; }
export function streamingBlockMode(key) { return when(key, 'streaming_offload'); }
export function fieldValueIn(key, values) { return (c) => values.includes(c[key]); }
export const flowEnabled = when('flow_model', true);
export const LOSS_AWARE_SCHEDULERS = ['loss_gated_cosine', 'loss_weighted_annealed_cosine'];
export const lossAwareScheduler = oneOf('lr_scheduler', LOSS_AWARE_SCHEDULERS);
export const lossWeightedScheduler = when('lr_scheduler', 'loss_weighted_annealed_cosine');

// ---- 选项数组 ----
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

export const LOW_VRAM_PROFILE_OPTIONS = [
  { value: 'off', label: '关闭（off）' },
  { value: 'standard_16g', label: '16G 稳定档：缓存 + 检查点（standard_16g）' },
  { value: 'low_12g', label: '12G 低显存档：阶段分辨率 + 轻量交换（low_12g）' },
  { value: 'very_low_8g', label: '8G 极限档：CPU 检查点 + 更强交换（very_low_8g）' },
  { value: 'experimental', label: '研究实验档：手动验证后使用（experimental）' },
];

export const ACCELERATION_PROFILE_OPTIONS = [
  { value: 'off', label: '关闭（off）' },
  { value: 'safe', label: '稳妥：缓存 + Foreach AdamW' },
  { value: 'balanced', label: '均衡：按模型推荐加速补丁' },
  { value: 'aggressive', label: '激进：启用模型级 compile/fast path 建议' },
  { value: 'low_vram', label: '低显存：缓存到磁盘 + offloaded checkpoint' },
];

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

export const VORTEX_RUNTIME_MODE_OPTIONS = [
  { value: 'observe', label: '观察报告（observe）' },
  { value: 'planner', label: '规划器报告（planner）' },
  { value: 'cache_observe', label: 'Cache 候选观察（cache_observe）' },
  { value: 'cache_v0', label: 'Cache v0 手动实验（cache_v0）' },
];

export const VORTEX_LOW_VRAM_PROTECTION_MODE_OPTIONS = [
  { value: 'observe', label: '只观察（observe）' },
  { value: 'protect', label: '低显存保护（protect）' },
];

export const vortexRuntimeFields = (residencyKey, baseVisible = null) => {
  const visible = baseVisible ? all(baseVisible, nonResidentBlockMode(residencyKey)) : nonResidentBlockMode(residencyKey);
  const enabled = all(visible, when('vortex_enabled', true));
  const lowVramEnabled = all(enabled, when('vortex_low_vram_protection_enabled', true));
  return [
    {
      key: 'vortex_enabled',
      type: 'boolean',
      label: 'Vortex 显存管理（vortex_enabled）',
      desc: '默认关闭。开启后只进入显式 Vortex 运行契约；observe/planner 只输出报告，cache_v0 属于手动实验入口，不会自动升级为产品默认路径。',
      defaultValue: false,
      visibleWhen: visible,
    },
    {
      key: 'vortex_mode',
      type: 'select',
      label: 'Vortex 模式（vortex_mode）',
      desc: 'observe/planner 不改变训练 tensor 路径；cache_observe 会接入候选统计；cache_v0 才会按预算尝试 GPU 解码缓存，建议只在监控显示 PCIe 等待明显时手动 A/B。',
      defaultValue: 'observe',
      options: VORTEX_RUNTIME_MODE_OPTIONS,
      visibleWhen: enabled,
    },
    {
      key: 'vortex_budget_mb',
      type: 'number',
      label: 'Vortex Cache 预算 MB（vortex_budget_mb）',
      desc: '仅 cache_v0 手动实验使用；会映射到底层 PCIe Delta/Cache 预算。0 表示不分配真实缓存。',
      defaultValue: 256,
      min: 0,
      step: 64,
      visibleWhen: all(enabled, when('vortex_mode', 'cache_v0')),
    },
    {
      key: 'vortex_low_vram_protection_enabled',
      type: 'boolean',
      label: 'Vortex 低显存保护（vortex_low_vram_protection_enabled）',
      desc: '默认关闭。开启后允许 Vortex 在低显存压力下收紧 prefetch/缓存策略；不会启用 active rematerialization。',
      defaultValue: false,
      visibleWhen: enabled,
    },
    {
      key: 'vortex_low_vram_protection_mode',
      type: 'select',
      label: '低显存保护模式（vortex_low_vram_protection_mode）',
      desc: 'observe 只记录低显存信号；protect 会在触发阈值时偏向保守 prefetch 和缓存预算。',
      defaultValue: 'observe',
      options: VORTEX_LOW_VRAM_PROTECTION_MODE_OPTIONS,
      visibleWhen: lowVramEnabled,
    },
    {
      key: 'vortex_low_vram_min_free_mb',
      type: 'number',
      label: '低显存保底 MB（vortex_low_vram_min_free_mb）',
      desc: '低于该 free VRAM 水位时触发保护判断。0 表示使用后端默认/观察值。',
      defaultValue: 0,
      min: 0,
      step: 64,
      visibleWhen: lowVramEnabled,
    },
    {
      key: 'vortex_low_vram_prefetch_throttle',
      type: 'boolean',
      label: '低显存时收紧 Prefetch（vortex_low_vram_prefetch_throttle）',
      desc: '低显存保护触发时限制预取深度，避免预取队列把显存顶爆。默认开启。',
      defaultValue: true,
      visibleWhen: lowVramEnabled,
    },
  ];
};

export const LORA_RECOMPUTE_OPTIONS = [
  { value: 'auto', label: '自动（DiT 默认开启）' },
  { value: 'on', label: '强制开启' },
  { value: 'off', label: '关闭（用于 A/B）' },
];

export const ADAPTER_INIT_STRATEGY_OPTIONS = ['default', 'pissa', 'olora', 'loftq'];
export const ADAPTER_INIT_EXPORT_MODE_OPTIONS = ['auto', 'raw', 'lora_compatible', 'approximate'];
export const LOFTQ_QUANT_TYPE_OPTIONS = ['rowwise', 'tensorwise'];
export const nativeLoraInitSelected = (c) => String(c.adapter_init_strategy || '').trim().toLowerCase() !== 'default';
export const pissaInitSelected = (c) => c.pissa_init === true || String(c.adapter_init_strategy || '').trim().toLowerCase() === 'pissa';
export const loftqInitSelected = when('adapter_init_strategy', 'loftq');

export const SUPPORTED_LYCORIS_ALGOS = ['locon', 'loha', 'lokr', 'glora', 'glokr', 'ia3', 'full', 'diag-oft'];
export const LYCORIS_DELTA_ALGOS = ['locon', 'loha', 'lokr', 'glora', 'glokr', 'full'];
export const LYCORIS_CONV_ALGOS = ['locon', 'lokr', 'glora'];
export const LYCORIS_NETWORK_MODULES = ['lycoris.kohya', 'lycoris'];
export const LYCORIS_OR_OFT_NETWORK_MODULES = [...LYCORIS_NETWORK_MODULES, 'networks.oft'];
export const lycorisNetworkSelected = fieldValueIn('network_module', LYCORIS_NETWORK_MODULES);
export const nonLycorisNetworkSelected = (c) => !LYCORIS_OR_OFT_NETWORK_MODULES.includes(c.network_module);
export const LORA_METHOD_TYPES = [
  'lora', 'dora', 'lora_plus', 'rs_lora', 'lora_fa', 'vera', 'tlora', 'flexrank',
  'hydralora', 'fera',
];
export const LYCORIS_METHOD_TYPES = ['locon', 'loha', 'lokr', 'glora', 'glokr', 'ia3', 'full', 'diag-oft', 'oft'];
export const NATIVE_ADAPTER_TYPES = [
  ...LORA_METHOD_TYPES,
  ...LYCORIS_METHOD_TYPES,
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
  { value: 'compiled_step', label: 'torch.compile 包装任意优化器（实验）' },
  { value: 'apex', label: 'Apex FusedAdam（可选依赖）' },
  { value: 'lulynx_fused', label: 'Lulynx FusedAdamW（兼容后端）' },
];

// 底模微调专用扩展集:ao_8bit 仅对大参数全参微调有收益(LoRA 小参数拓扑上
// 实测比 bnb 慢 7.6×),因此只在 finetune schema 暴露。
export const OPTIMIZER_BACKEND_OPTIONS_FINETUNE = [
  ...OPTIMIZER_BACKEND_OPTIONS.slice(0, 5),
  { value: 'ao_8bit', label: 'torchao 8-bit AdamW（大参数全参微调场景，需 Triton）' },
  ...OPTIMIZER_BACKEND_OPTIONS.slice(5),
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

// ---- DiT 检查点字段构造器 ----
export const ditGradientCheckpointingField = (family, defaultValue = true) => ({
  key: 'gradient_checkpointing',
  type: 'boolean',
  label: `${family} 通用检查点（gradient_checkpointing）`,
  desc: `${family} 原生 DiT 主路径由加速页的 ${family} DiT Block Checkpointing 控制。两者同开不会双重叠加；本项保留给兼容配置/旧训练路径。`,
  defaultValue,
});

export const ditTrainFields = (fields, family) => fields.map((field) => (
  field.key === 'gradient_checkpointing'
    ? ditGradientCheckpointingField(family, field.defaultValue ?? true)
    : field
));

// ---- V 参数化字段构造器(SDXL / SD1.5 共用) ----
export const vParameterizationFields = (includeVPredOptions = false) => {
  const fields = [
    { key: 'v_parameterization', type: 'boolean', label: 'V 参数化（v_parameterization）', desc: 'v-parameterization 学习（训练 Illustrious 等 v-pred 模型时需要开启）', defaultValue: false },
  ];
  if (includeVPredOptions) {
    fields.push(
      { key: 'zero_terminal_snr', type: 'boolean', label: '零终端 SNR（zero_terminal_snr）', desc: 'Zero Terminal SNR（v-pred 模型训练推荐开启）', defaultValue: true, visibleWhen: when('v_parameterization', true) },
      { key: 'scale_v_pred_loss_like_noise_pred', type: 'boolean', label: '缩放 v-pred 损失（scale_v_pred_loss_like_noise_pred）', desc: '缩放 v-prediction 损失（v-pred 模型训练推荐开启）', defaultValue: true, visibleWhen: when('v_parameterization', true) },
    );
  }
  return fields;
};

// ---- 数据集字段构造器 ----
export const ds = (reso, bucketMax = 2048, bucketStep = 64, extra = []) => [
  { key: 'train_data_dir', type: 'folder', pickerType: 'folder', label: '训练数据集路径（train_data_dir）', desc: '训练数据集路径', defaultValue: './output/lulynx' },
  { key: 'reg_data_dir', type: 'folder', pickerType: 'folder', label: '正则化数据集路径（reg_data_dir）', desc: '正则化数据集路径。默认留空，不使用正则化图像。适用于全量训练，轻量 LoRA 可忽略', defaultValue: '' },
  { key: 'prior_loss_weight', type: 'number', label: '先验损失权重（prior_loss_weight）', desc: '正则化 - 先验损失权重', defaultValue: 1, min: 0, step: 0.1 },
  { key: 'resolution', type: 'string', label: '训练分辨率（resolution）', desc: '训练图片分辨率，宽x高。支持非正方形，但必须是 64 倍数。', importantDesc: '重要:训练集图像会被按比例缩放至训练分辨率总像素进行训练(宽度*高度,与比例无关),sdxl系列模型默认训练分辨率为1024*1024像素.', defaultValue: reso },
  { key: 'enable_bucket', type: 'boolean', label: '启用分桶（enable_bucket）', desc: '启用 arb 桶以允许非固定宽高比的图片', defaultValue: true },
  { key: 'min_bucket_reso', type: 'number', label: '桶最小分辨率（min_bucket_reso）', desc: 'arb 桶最小分辨率', defaultValue: 256 },
  { key: 'max_bucket_reso', type: 'number', label: '桶最大分辨率（max_bucket_reso）', desc: 'arb 桶最大分辨率', defaultValue: bucketMax },
  { key: 'bucket_reso_steps', type: 'number', label: '桶划分单位（bucket_reso_steps）', desc: 'arb 桶分辨率划分单位', defaultValue: bucketStep },
  { key: 'bucket_no_upscale', type: 'boolean', label: '桶不放大图片（bucket_no_upscale）', desc: 'arb 桶不放大图片', defaultValue: true },
  { key: 'bucket_selection_mode', type: 'select', label: '分桶策略（bucket_selection_mode）', desc: 'legacy 为原始穷举桶，nearest_only 就近桶，custom_only 自定义桶列表', defaultValue: 'legacy', options: ['legacy', 'nearest_only', 'custom_only'] },
  { key: 'bucket_custom_resos', type: 'textarea', label: '自定义桶列表（bucket_custom_resos）', desc: '一行一个，支持 1024x1024、1024,1536。仅在 custom_only 时生效', defaultValue: '', visibleWhen: when('bucket_selection_mode', 'custom_only') },
  { key: 'image_decode_backend', type: 'select', label: '图片解码后端（image_decode_backend）', desc: 'pil 最兼容；pil_lru 会按文件 mtime/大小缓存已解码 RGB/Alpha；torchvision_cpu 使用 torchvision 在 CPU 解码后回到现有 PIL augment 链路，不提前占用训练显存。', defaultValue: 'pil', options: IMAGE_DECODE_BACKEND_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
  { key: 'data_backend', type: 'select', label: '数据后端（data_backend）', desc: 'auto/caption 当前继续走 CaptionDataset；webdataset 会探测 Python 包与 tar shard 并写入运行记录，但暂不替换训练主路径；dali 目前只做预留 profile。', defaultValue: 'auto', options: DATA_BACKEND_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
  { key: 'image_decode_cache_size', type: 'number', label: '图片解码缓存张数（image_decode_cache_size）', desc: '每个 DataLoader worker 的 PIL 解码 LRU 容量。0 关闭缓存；缓存越大内存占用越高。', defaultValue: 0, min: 0, visibleWhen: all(when('performance_expert_mode', true), oneOf('image_decode_backend', ['auto', 'pil_lru'])) },
  ...extra,
];

// ---- UI 分组占位字段 ----
export const uiGroup = (title, desc = '', visibleWhen = null) => ({
  key: `__ui_group_${title.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`,
  type: 'ui_group',
  label: title,
  desc,
  defaultValue: '',
  visibleWhen: visibleWhen || undefined,
});

// ---- LoRA / LyCORIS 网络字段构造器 ----
export const netLora = (mod, dim = 32, alpha = 32, maxDim = 512, extra = [], extraModules = [], includeLycoris = true) => [
  { key: 'network_module', type: 'select', label: '训练网络模块（network_module）', desc: '训练网络模块', defaultValue: mod, options: [mod, ...extraModules, ...(includeLycoris && !mod.includes('lycoris') ? ['lycoris.kohya'] : [])] },
  { key: 'network_dim', type: 'slider', label: '网络维度（network_dim）', desc: '网络维度，常用 4~128，不是越大越好, 低 dim 可以降低显存占用', defaultValue: dim, min: 1, max: maxDim, step: 1 },
  { key: 'network_alpha', type: 'slider', label: '网络 Alpha（network_alpha）', desc: '常用值：等于 network_dim 或 network_dim*1/2 或 1。', defaultValue: alpha, min: 1, max: maxDim, step: 1 },
  { key: 'network_dropout', type: 'number', label: '网络 Dropout（network_dropout）', desc: 'dropout 概率（与 lycoris 不兼容，需要用 lycoris 自带的）', defaultValue: 0, min: 0, step: 0.01, visibleWhen: nonLycorisNetworkSelected },
  { key: 'flexrank_lora_rank_range_min', type: 'number', label: 'FlexRank 最小 Rank（flexrank_lora_rank_range_min）', desc: 'FlexRank 每步随机采样激活 rank 的下界；最大 rank 仍使用 network_dim。', defaultValue: 1, min: 1, step: 1, visibleWhen: when('network_module', 'networks.flexrank_lora') },
  { key: 'dim_from_weights', type: 'boolean', label: '从权重推断 Dim（dim_from_weights）', desc: '从已有 network_weights 自动推断 rank / dim', defaultValue: false },
  { key: 'scale_weight_norms', type: 'number', label: '最大范数正则化（scale_weight_norms）', desc: '最大范数正则化。如果使用，推荐为 1', defaultValue: '', min: 0, step: 0.01 },
  uiGroup('LyCORIS 基础结构', '这里放算法类型、卷积维度、preset 这类决定网络骨架的参数。普通 LoRA 路线可直接忽略。', lycorisNetworkSelected),
  { key: 'lycoris_algo', type: 'select', label: 'LyCORIS 算法（lycoris_algo）', desc: '后端原生支持：LoCon / LoHa / LoKr / IA3 / Full / diag-OFT。OFT 会按 diag-OFT 处理。', defaultValue: 'locon', options: SUPPORTED_LYCORIS_ALGOS, visibleWhen: lycorisNetworkSelected },
  { key: 'conv_dim', type: 'number', label: '卷积维度（conv_dim）', desc: 'LyCORIS 卷积维度，仅 LoCon / LoKr 路线使用', defaultValue: 4, min: 1, visibleWhen: (c) => LYCORIS_NETWORK_MODULES.includes(c.network_module) && LYCORIS_CONV_ALGOS.includes(c.lycoris_algo) },
  { key: 'conv_alpha', type: 'number', label: '卷积 Alpha（conv_alpha）', desc: 'LyCORIS 卷积 Alpha，仅 LoCon / LoKr 路线使用', defaultValue: 1, min: 1, visibleWhen: (c) => LYCORIS_NETWORK_MODULES.includes(c.network_module) && LYCORIS_CONV_ALGOS.includes(c.lycoris_algo) },
  { key: 'lycoris_preset', type: 'string', label: 'LyCORIS Preset（preset）', desc: '传给 LyCORIS 库的 preset。通常留空即可，等同于使用其默认 preset。', defaultValue: '', visibleWhen: lycorisNetworkSelected },
  uiGroup('正则化与稳定性', 'LyCORIS 专用 dropout / 正则项。大多数训练保持默认即可。', lycorisNetworkSelected),
  { key: 'dropout', type: 'number', label: 'LyCORIS Dropout', desc: 'LyCORIS 主 dropout 概率。当前后端在 LoCon / LoHa / LoKr / Full 路线消费该字段。', defaultValue: 0, min: 0, max: 1, step: 0.01, visibleWhen: (c) => LYCORIS_NETWORK_MODULES.includes(c.network_module) && LYCORIS_DELTA_ALGOS.includes(c.lycoris_algo) },
  { key: 'rank_dropout', type: 'number', label: 'LoKr Rank Dropout（rank_dropout）', desc: 'LoKr 专用：按 rank/输出维度随机丢弃的概率。', defaultValue: '', min: 0, max: 1, step: 0.01, visibleWhen: all(lycorisNetworkSelected, when('lycoris_algo', 'lokr')) },
  { key: 'module_dropout', type: 'number', label: 'LoKr Module Dropout（module_dropout）', desc: 'LoKr 专用：按整个模块随机丢弃的概率。', defaultValue: '', min: 0, max: 1, step: 0.01, visibleWhen: all(lycorisNetworkSelected, when('lycoris_algo', 'lokr')) },
  { key: 'train_norm', type: 'boolean', label: '训练 Norm 层（train_norm）', desc: '额外训练归一化层（LayerNorm/RMSNorm 等）的可学习缩放/偏置，用来微调特征尺度、风格强度和收敛稳定性；会小幅增加显存占用与 LoRA 文件大小，并增加过拟合风险。IA3 一般不建议开启。', defaultValue: false, visibleWhen: (c) => LYCORIS_NETWORK_MODULES.includes(c.network_module) && c.lycoris_algo !== 'ia3' },
  uiGroup('DoRA 与兼容选项', 'DoRA 当前接在原生 LoRA 路线；LyCORIS 结构请直接选择上方算法。', when('network_module', 'networks.lora')),
  { key: 'dora_wd', type: 'boolean', label: '启用 DoRA（dora_wd）', desc: '在原生 LoRA 路线下启用 DoRA。会将权重分解为方向与幅度两部分分别微调，更接近全量微调表现。', defaultValue: false, visibleWhen: when('network_module', 'networks.lora') },
  { key: 'adapter_init_strategy', type: 'select', label: 'LoRA 初始化策略（adapter_init_strategy）', desc: '统一初始化入口：默认 LoRA / PiSSA / OLoRA。仅原生 LoRA 路线生效，不改变 checkpoint 主格式。', defaultValue: 'default', options: ADAPTER_INIT_STRATEGY_OPTIONS, visibleWhen: all(when('network_module', 'networks.lora'), when('dora_wd', false)) },
  { key: 'adapter_init_export_mode', type: 'select', label: '初始化导出模式（adapter_init_export_mode）', desc: 'auto 会在最终保存时导出成可加载到原始底模的 LoRA；raw 保留精确训练状态用于恢复。', defaultValue: 'auto', options: ADAPTER_INIT_EXPORT_MODE_OPTIONS, visibleWhen: all(when('network_module', 'networks.lora'), nativeLoraInitSelected) },
  { key: 'loftq_bits', type: 'number', label: 'LoftQ 量化位宽（loftq_bits）', desc: 'LoftQ 首版使用 fake-quant/dequant 权重残差初始化；不是持久 4bit base runtime。', defaultValue: 4, min: 2, max: 8, step: 1, visibleWhen: all(when('network_module', 'networks.lora'), loftqInitSelected) },
  { key: 'loftq_quant_type', type: 'select', label: 'LoftQ 量化粒度（loftq_quant_type）', desc: 'rowwise 按输出通道量化，tensorwise 按整层张量量化。', defaultValue: 'rowwise', options: LOFTQ_QUANT_TYPE_OPTIONS, visibleWhen: all(when('network_module', 'networks.lora'), loftqInitSelected) },
  uiGroup('LoKr 专属参数', '这组只会在 LoKr 下出现，包含 Kronecker 分解方式、双侧分解和 full matrix 等更重口味的结构控制。', all(lycorisNetworkSelected, when('lycoris_algo', 'lokr'))),
  { key: 'lokr_factor', type: 'number', label: 'LoKr 系数（lokr_factor）', desc: '常用 4~无穷（填写 -1 为无穷）', defaultValue: -1, min: -1, visibleWhen: all(lycorisNetworkSelected, when('lycoris_algo', 'lokr')) },
  { key: 'decompose_both', type: 'boolean', label: 'LoKr 双侧分解（decompose_both）', desc: 'LoKr 额外分解较小那一侧矩阵。更省参数，但不一定总是更稳，属于典型实验项。', defaultValue: false, visibleWhen: all(lycorisNetworkSelected, when('lycoris_algo', 'lokr')) },
  { key: 'full_matrix', type: 'boolean', label: 'LoKr Full Matrix（full_matrix）', desc: 'LoKr 强制走 full matrix 路线，避免自动退回到分解矩阵。更吃参数和显存，只建议明确需要时启用。', defaultValue: false, visibleWhen: all(lycorisNetworkSelected, when('lycoris_algo', 'lokr')) },
  { key: 'unbalanced_factorization', type: 'boolean', label: 'LoKr 非均衡分解（unbalanced_factorization）', desc: 'LoKr 在分解维度时交换较大的那一侧，改变 Kronecker 分解布局。属于实验型结构参数。', defaultValue: false, visibleWhen: all(lycorisNetworkSelected, when('lycoris_algo', 'lokr')) },
  { key: 'enable_base_weight', type: 'boolean', label: '启用基础权重（enable_base_weight）', desc: '启用基础权重（差异炼丹）', defaultValue: false },
  { key: 'base_weights', type: 'textarea', label: '基础权重路径（base_weights）', desc: '合并入底模的 LoRA 路径，一行一个路径', defaultValue: '', visibleWhen: when('enable_base_weight', true) },
  { key: 'base_weights_multiplier', type: 'textarea', label: '基础权重比例（base_weights_multiplier）', desc: '合并入底模的 LoRA 权重，一行一个数字', defaultValue: '', visibleWhen: when('enable_base_weight', true) },
  { key: 'network_args_custom', type: 'textarea', label: '自定义 network_args（network_args_custom）', desc: '自定义 network_args，每行一个参数', defaultValue: '' },
  ...extra,
];

// ---- flow / rectified-flow 参数构造器 ----
// defaults.tsExtra: 额外的 timestep_sampling 选项(如 anima 路线支持的 'logit_normal',
// SD3 论文消融中优于 uniform);仅在传入时追加,其他训练族不受影响。
export const flowParams = (defaults = {}) => [
  { key: 'timestep_sampling', type: 'select', label: '时间步采样（timestep_sampling）', desc: '时间步采样策略', defaultValue: defaults.ts || 'sigmoid', options: ['sigma', 'uniform', 'sigmoid', 'shift', 'flux_shift', ...(defaults.tsExtra || [])] },
  ...((defaults.tsExtra || []).includes('logit_normal') ? [
    { key: 'flow_logit_mean', type: 'number', label: 'Logit Mean（flow_logit_mean）', desc: 'logit_normal 时间步采样均值（SD3 推荐 0）', defaultValue: 0.0, step: 0.01, visibleWhen: when('timestep_sampling', 'logit_normal') },
    { key: 'flow_logit_std', type: 'number', label: 'Logit Std（flow_logit_std）', desc: 'logit_normal 时间步采样标准差（SD3 推荐 1）', defaultValue: 1.0, min: 0.001, step: 0.01, visibleWhen: when('timestep_sampling', 'logit_normal') },
  ] : []),
  { key: 'sigmoid_scale', type: 'number', label: 'sigmoid 缩放（sigmoid_scale）', desc: 'sigmoid 缩放系数', defaultValue: defaults.ss || 1.0, step: 0.001 },
  { key: 'model_prediction_type', type: 'select', label: '模型预测类型（model_prediction_type）', desc: '模型预测类型', defaultValue: defaults.mp || 'raw', options: ['raw', 'additive', 'sigma_scaled'] },
  { key: 'sdxl_model_prediction_type', type: 'select', label: 'Flow 预测目标（sdxl_model_prediction_type）', desc: 'SDXL/SD1.5 Flow 路径的模型预测目标。', defaultValue: 'epsilon', options: ['epsilon', 'velocity', 'sample'], visibleWhen: flowEnabled },
  { key: 'sdxl_flow_weighting_scheme', type: 'select', label: 'Flow Loss 权重（sdxl_flow_weighting_scheme）', desc: 'Flow loss 的 sigma 权重策略。', defaultValue: 'none', options: ['none', 'sigma_sqrt', 'cosmap', 'logit_normal'], visibleWhen: flowEnabled },
  { key: 'sdxl_flow_shift', type: 'number', label: 'Flow 离散偏移（sdxl_flow_shift）', desc: '离散 flow shift，1.0 表示不偏移。', defaultValue: 1.0, min: 0.001, step: 0.01, visibleWhen: flowEnabled },
  { key: 'sdxl_sigmoid_scale', type: 'number', label: 'Flow Sigmoid Scale（sdxl_sigmoid_scale）', desc: 'sigmoid 时间步采样缩放。', defaultValue: 1.0, min: 0.001, step: 0.01, visibleWhen: all(flowEnabled, when('timestep_sampling', 'sigmoid')) },
  { key: 'discrete_flow_shift', type: 'number', label: '离散流位移（discrete_flow_shift）', desc: '离散流位移值', defaultValue: defaults.dfs || 1.0, step: 0.001 },
  { key: 'guidance_scale', type: 'number', label: 'CFG 引导缩放（guidance_scale）', desc: 'CFG 引导缩放', defaultValue: defaults.gs || 1.0, step: 0.01 },
  { key: 'weighting_scheme', type: 'select', label: '权重策略（weighting_scheme）', desc: '损失加权策略', defaultValue: defaults.ws || 'uniform', options: ['sigma_sqrt', 'logit_normal', 'mode', 'cosmap', 'none', 'uniform'] },
  { key: 'mode_scale', type: 'number', label: 'mode 权重缩放（mode_scale）', desc: 'mode 权重策略的缩放系数', defaultValue: '', step: 0.01 },
  { key: 'loss_type', type: 'select', label: '损失函数类型（loss_type）', desc: '损失函数类型', defaultValue: defaults.lt || 'l2', options: ['l1', 'l2', 'huber', 'smooth_l1'] },
];

export const rectifiedFlowParams = () => [
  { key: 'flow_model', type: 'boolean', label: '启用 Rectified Flow（flow_model）', desc: '启用 RF / Flow Matching 训练目标。不能与 V 参数化同时开启', defaultValue: false },
  { key: 'flow_use_ot', type: 'boolean', label: 'RF 最优传输配对（flow_use_ot）', desc: '按 cosine OT 重新配对 latent 与噪声。batch 大于 1 时才有实际收益', defaultValue: false, visibleWhen: when('flow_model', true) },
  { key: 'flow_timestep_distribution', type: 'select', label: 'RF 时间步分布（flow_timestep_distribution）', desc: 'RF 时间步采样分布', defaultValue: 'logit_normal', options: ['logit_normal', 'uniform'], visibleWhen: when('flow_model', true) },
  { key: 'flow_logit_mean', type: 'number', label: 'RF Logit Mean', desc: 'logit-normal 时间步采样均值', defaultValue: 0.0, step: 0.01, visibleWhen: all(when('flow_model', true), when('flow_timestep_distribution', 'logit_normal')) },
  { key: 'flow_logit_std', type: 'number', label: 'RF Logit Std', desc: 'logit-normal 时间步采样标准差，必须大于 0', defaultValue: 1.0, min: 0.001, step: 0.01, visibleWhen: all(when('flow_model', true), when('flow_timestep_distribution', 'logit_normal')) },
  { key: 'flow_uniform_shift', type: 'boolean', label: 'RF 分辨率偏移（flow_uniform_shift）', desc: '按图像像素数动态偏移 RF 时间步', defaultValue: false, visibleWhen: when('flow_model', true) },
  { key: 'flow_uniform_base_pixels', type: 'number', label: 'RF 基准像素数（flow_uniform_base_pixels）', desc: '分辨率偏移的基准像素数。1024x1024 = 1048576', defaultValue: 1048576, min: 1, step: 1, visibleWhen: all(when('flow_model', true), when('flow_uniform_shift', true)) },
  { key: 'flow_uniform_static_ratio', type: 'number', label: 'RF 固定偏移比率（flow_uniform_static_ratio）', desc: '填写后覆盖分辨率动态偏移。留空则不使用固定比率', defaultValue: '', min: 0.001, step: 0.001, visibleWhen: when('flow_model', true) },
  { key: 'contrastive_flow_matching', type: 'boolean', label: '对比 Flow Matching（contrastive_flow_matching）', desc: '启用 CFM 辅助项。需要同时开启 Rectified Flow', defaultValue: false, visibleWhen: when('flow_model', true) },
  { key: 'cfm_lambda', type: 'number', label: 'CFM 权重（cfm_lambda）', desc: '对比 Flow Matching 权重', defaultValue: 0.05, min: 0, step: 0.001, visibleWhen: all(when('flow_model', true), when('contrastive_flow_matching', true)) },
];

// ---- section 工厂 ----
export const sec = (id, tab, title, desc, fields, opts = {}) => ({ id, tab, title, description: desc, fields, expert: !!opts.expert });
