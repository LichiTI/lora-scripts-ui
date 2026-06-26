// Anima LoRA schema - based on mikazuki/schema/anima-lora.ts
// 注意：本文件不再依赖 schemaRegistry.js，以避免与 sdxlSchema.js 形成循环依赖
// (sdxlSchema → animaSchema → schemaRegistry → sdxlSchema)。
// when/all/oneOf 为纯函数，此处内联即可。

import { schedulerOptions } from './features/settingsOptions.js';

function when(key, expected) {
  return (config) => config[key] === expected;
}
function all(...conditions) {
  return (config) => conditions.every((c) => c(config));
}
function oneOf(key, values) {
  return (config) => values.includes(config[key]);
}

const ANIMA_TABS = [
  { key: 'model', label: '模型' },
  { key: 'dataset', label: '数据集' },
  { key: 'network', label: '网络' },
  { key: 'optimizer', label: '优化器' },
  { key: 'training', label: '训练' },
  { key: 'preview', label: '预览/验证' },
  { key: 'speed', label: '加速' },
  { key: 'advanced', label: '高级' },
];

const ANIMA_BLOCK_WEIGHTS_28 = Array(28).fill('1').join(',');
const swapEnabled = oneOf('swap_granularity', ['auto', 'block', 'merged_block', 'layer']);
const adamwFamilyOptimizer = (c) => ['adamw', 'adamw8bit'].includes(String(c.optimizer_type || '').trim().toLowerCase());
const muonOptimizer = (c) => String(c.optimizer_type || '').trim().toLowerCase() === 'muon';
const fp8BaseStorageEnabled = (c) => c.fp8_base === true || (c.weight_compression_enabled === true && c.weight_compression_format === 'fp8_e4m3');
const nonResidentBlockMode = (key) => (c) => c[key] && c[key] !== 'resident';
const streamingBlockMode = (key) => when(key, 'streaming_offload');
const LOSS_AWARE_SCHEDULERS = ['loss_gated_cosine', 'loss_weighted_annealed_cosine'];
const lossAwareScheduler = oneOf('lr_scheduler', LOSS_AWARE_SCHEDULERS);
const lossWeightedScheduler = when('lr_scheduler', 'loss_weighted_annealed_cosine');

const ANIMA_SCHEDULERS = [
  'linear',
  'cosine',
  'cosine_with_restarts',
  'polynomial',
  'constant',
  'constant_with_warmup',
  'loss_gated_cosine',
  'loss_weighted_annealed_cosine',
];

const LOSS_AWARE_LR_FIELDS = [
  { key: 'loss_scheduler_ema_alpha', type: 'number', label: 'Loss 平滑系数', desc: '用 EMA 平滑原始 loss，避免单个 batch 抖动误导调度器。越大越敏感，推荐 0.05-0.20。', defaultValue: 0.1, min: 0, max: 1, step: 0.01, visibleWhen: lossAwareScheduler },
  { key: 'loss_scheduler_min_delta', type: 'number', label: '有效下降阈值', desc: 'EMA loss 至少下降这么多才算仍在变好。默认偏保守，避免微小波动长期锁住余弦。', defaultValue: 0.0005, min: 0, step: 0.00001, visibleWhen: lossAwareScheduler },
  { key: 'loss_scheduler_relative_delta', type: 'number', label: '相对下降阈值', desc: '按最佳 EMA loss 的比例判断有效下降。默认 0.001 会过滤后期很小的训练 loss 抖动。', defaultValue: 0.001, min: 0, max: 1, step: 0.0001, visibleWhen: lossAwareScheduler },
  { key: 'loss_scheduler_patience', type: 'number', label: '平台期等待步数', desc: '连续多少个 optimizer step 没有有效下降后，才继续推进余弦相位。', defaultValue: 8, min: 1, step: 1, visibleWhen: lossAwareScheduler },
  { key: 'loss_scheduler_cooldown', type: 'number', label: '冷却步数', desc: '刚出现有效下降后，先忽略多少步平台期判断，减少来回抖动。', defaultValue: 0, min: 0, step: 1, visibleWhen: lossAwareScheduler },
  { key: 'loss_scheduler_max_hold_steps', type: 'number', label: '最长锁定步数', desc: '连续不推进余弦相位的最大步数。0 表示自动保护上限（约 5% 有效训练步，最多 200 步），避免训练 loss 形成负反馈循环。', defaultValue: 0, min: 0, step: 1, visibleWhen: lossAwareScheduler },
  { key: 'loss_scheduler_late_gamma', type: 'number', label: '后期 Loss 权重曲线', desc: '仅用于 Loss 加权退火余弦。值越大，越晚才让 loss 强力影响余弦相位。', defaultValue: 2.0, min: 0.01, step: 0.1, visibleWhen: lossWeightedScheduler },
  { key: 'loss_scheduler_lock_weight_threshold', type: 'number', label: '锁定权重阈值', desc: '仅用于 Loss 加权退火余弦。训练进度带来的 loss 权重达到该值后，loss 下降才允许锁住当前余弦值。默认 0.7，避免太早由 loss 接管。', defaultValue: 0.7, min: 0, max: 1, step: 0.05, visibleWhen: lossWeightedScheduler },
  { key: 'loss_scheduler_min_advance_ratio', type: 'number', label: '最小推进速度', desc: '仅用于 Loss 加权退火余弦。未锁定或触发保护上限时，每步至少推进多少余弦相位，避免后期完全停住。', defaultValue: 0.25, min: 0, max: 1, step: 0.05, visibleWhen: lossWeightedScheduler },
];

const ANIMA_BLOCK_RESIDENCY_OPTIONS = [
  { value: 'resident', label: '常驻 GPU（resident）' },
  { value: 'streaming_offload', label: 'Streaming Offload（平衡）' },
  { value: 'block_cpu_pinned', label: 'Block CPU pinned（最低显存/最慢）' },
];

const PCIE_TRANSFER_FORMAT_OPTIONS = [
  { value: 'off', label: '关闭（off）' },
  { value: 'fp8_e4m3', label: 'FP8 E4M3 传输（实验）' },
  { value: 'int8_rowwise', label: 'INT8 行缩放传输（实验）' },
  { value: 'uint4_rowwise', label: 'UINT4 行缩放传输（更实验）' },
  { value: 'raw_bf16', label: 'Raw BF16 传输（对照）' },
  { value: 'raw_fp16', label: 'Raw FP16 传输（对照）' },
];

const ACTIVATION_COMPRESSION_DTYPE_OPTIONS = [
  { value: 'fp16', label: 'FP16（默认）' },
  { value: 'bf16', label: 'BF16' },
  { value: 'fp8_e4m3', label: 'FP8 E4M3（实验）' },
];

const DDPM_TIMESTEP_SAMPLING_OPTIONS = [
  { value: '', label: '默认均匀采样' },
  { value: 'uniform', label: 'Uniform（均匀）' },
  { value: 'logit_normal', label: 'Logit Normal' },
  { value: 'low_snr_bias', label: 'Low-SNR Bias（FasterDiT）' },
];

const FASTER_DIT_SNR_MODE_OPTIONS = [
  { value: 'sqrt', label: 'sqrt（推荐）' },
  { value: 'log', label: 'log（更激进）' },
  { value: 'standard', label: 'standard（标准）' },
];

const LORA_RECOMPUTE_OPTIONS = [
  { value: 'auto', label: '自动（DiT 默认开启）' },
  { value: 'on', label: '强制开启' },
  { value: 'off', label: '关闭（用于 A/B）' },
];

const WINDOW_ATTENTION_BACKEND_OPTIONS = [
  { value: 'auto', label: '自动（优先启动器/预检解析）' },
  { value: 'flex', label: 'FlexAttention' },
  { value: 'sdpa_masked', label: 'SDPA Masked' },
  { value: 'torch_fallback', label: 'Torch Fallback（小序列调试）' },
];

const LOSS_PRECISION_OPTIONS = [
  { value: 'fp32_loss', label: 'FP32 Loss（默认）' },
  { value: 'mixed_loss', label: 'Mixed Loss（实验）' },
];

const COMPILE_RUNTIME_OPTIONS = [
  { value: 'auto', label: '自动收敛（显式参数优先）' },
  { value: 'off', label: '关闭（off）' },
  { value: 'compile', label: 'torch.compile' },
  { value: 'compile_cache', label: 'torch.compile + 本地缓存' },
  { value: 'cudagraph', label: 'CUDAGraph 后端（实验）' },
  { value: 'compile_cudagraph', label: 'Compile + CUDAGraph + 缓存（实验）' },
];

const COMPILE_SHAPE_STRATEGY_OPTIONS = [
  { value: 'auto', label: '自动（按路由探测）' },
  { value: 'fixed_pad', label: 'Fixed Pad（固定视觉 token）' },
  { value: 'token_flatten', label: 'Token Flatten（原生 token bucket）' },
  { value: 'native', label: 'Native（同 token_flatten）' },
];

const COMPILE_TARGET_STRATEGY_OPTIONS = [
  { value: 'auto', label: '自动（按模块探测）' },
  { value: 'block', label: 'Block（整块编译）' },
  { value: 'inner_forward', label: 'Inner Forward（优先稳定内核路径）' },
];

const SAFEGUARD_GRADIENT_SCAN_OPTIONS = [
  { value: 'batched', label: 'Batched（推荐）' },
  { value: 'foreach', label: 'Foreach' },
  { value: 'legacy', label: 'Legacy（逐参数）' },
  { value: 'off', label: '关闭梯度范数扫描' },
];

const FUSED_PROJECTION_MEMORY_MODE_OPTIONS = [
  { value: 'keep_original', label: '保留原始层（keep_original）' },
  { value: 'drop_original', label: '删除原始层（drop_original）' },
  { value: 'materialize_on_save', label: '保存时补回（materialize_on_save）' },
];

const OPTIMIZER_BACKEND_OPTIONS = [
  { value: 'auto', label: '自动（auto）' },
  { value: 'torch_adamw', label: 'PyTorch AdamW' },
  { value: 'foreach_adamw', label: 'PyTorch Foreach AdamW' },
  { value: 'torch_fused', label: 'PyTorch Fused AdamW' },
  { value: 'bnb_8bit', label: 'bitsandbytes 8-bit AdamW' },
  { value: 'apex', label: 'Apex FusedAdam（可选依赖）' },
  { value: 'lulynx_fused', label: 'Lulynx FusedAdamW（兼容后端）' },
];

const ADVANCED_OPTIMIZER_STRATEGY_OPTIONS = [
  { value: 'auto', label: '自动（尊重已有配置）' },
  { value: 'off', label: '关闭新策略选择' },
  { value: 'profile_only', label: '仅记录 Profile' },
  { value: 'lora_plus', label: 'LoRA+（现有参数组）' },
  { value: 'rs_lora', label: 'RS-LoRA' },
];

const DATA_TRANSFER_PROFILE_MODE_OPTIONS = [
  { value: 'event', label: 'Event（推荐，延迟同步）' },
  { value: 'sync', label: 'Sync（精确调试，会变慢）' },
  { value: 'off', label: '关闭' },
];

const IMAGE_DECODE_BACKEND_OPTIONS = [
  { value: 'pil', label: 'PIL（默认/最兼容）' },
  { value: 'auto', label: '自动（有缓存大小时启用 PIL LRU）' },
  { value: 'pil_lru', label: 'PIL LRU 缓存' },
  { value: 'torchvision_cpu', label: 'torchvision CPU（不占训练显存）' },
];

const DATA_BACKEND_OPTIONS = [
  { value: 'auto', label: '自动（当前保持现有数据路径）' },
  { value: 'caption', label: 'CaptionDataset（当前稳定路径）' },
  { value: 'raw', label: 'Raw/Caption 别名（归一到 CaptionDataset）' },
  { value: 'webdataset', label: 'WebDataset（探测/Profile）' },
  { value: 'dali', label: 'DALI（预留/Profile）' },
];

const CACHED_COLLATE_MODE_OPTIONS = [
  { value: 'auto', label: '自动（pad_sequence）' },
  { value: 'pad_sequence', label: 'PyTorch pad_sequence' },
  { value: 'legacy', label: 'Legacy 预分配' },
];

const CHECKPOINT_POLICY_OPTIONS = [
  { value: 'auto', label: '自动（尊重现有检查点开关）' },
  { value: 'off', label: '关闭' },
  { value: 'full', label: 'Full checkpointing' },
  { value: 'offloaded', label: 'CPU offloaded checkpointing' },
  { value: 'selective', label: 'Selective recompute（Anima 实验，其它回退）' },
];

const CUDA_CACHE_RELEASE_OPTIONS = [
  { value: 'off', label: '关闭（off）' },
  { value: 'oom_only', label: '仅 OOM 恢复（oom_only）' },
  { value: 'phase_boundary', label: '阶段边界（phase_boundary）' },
  { value: 'after_optimizer', label: '优化器后释放（after_optimizer）' },
  { value: 'aggressive', label: '激进低显存（aggressive）' },
];

const BLOCK_SWAP_STRATEGY_OPTIONS = [
  { value: 'auto', label: '自动（尊重后端解析）' },
  { value: 'sync', label: '同步（保守/调试）' },
  { value: 'async', label: '异步预取' },
];

const ANIMA_SECTIONS = [
  {
    id: 'model-settings',
    tab: 'model',
    title: '训练用模型',
    description: 'Anima DiT 权重、VAE、文本模型与恢复训练。',
    fields: [
      { key: 'model_train_type', type: 'hidden', defaultValue: 'anima-lora' },
      { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'Anima DiT 权重路径', desc: 'Anima 主 DiT / transformer 权重路径。', defaultValue: './sd-models/model.safetensors' },
      { key: 'vae', type: 'file', pickerType: 'model-file', label: 'Qwen Image VAE 路径', desc: 'Anima 训练必填。', defaultValue: '' },
      { key: 'qwen3', type: 'file', pickerType: 'model-file', label: 'Qwen3 文本模型路径', desc: '可填单个 safetensors 或本地模型6ee录。', defaultValue: '' },
      { key: 'llm_adapter_path', type: 'file', pickerType: 'model-file', label: 'LLM Adapter 路径', desc: '（可选）覆盖 Anima 内置 Adapter。', defaultValue: '' },
      { key: 't5_tokenizer_path', type: 'folder', pickerType: 'folder', label: 'T5 Tokenizer 目录', desc: '（可选）留空回退到 configs/t5_old。', defaultValue: '' },
      { key: 'network_weights', type: 'file', pickerType: 'output-model-file', label: '继续训练 LoRA', desc: '从已有的 LoRA 模型上继续训练，填写路径', defaultValue: '' },
      { key: 'dit_adapter_path', type: 'file', pickerType: 'output-model-file', label: 'Anima DiT Adapter', desc: '加载已有 Anima DiT adapter 权重，仅作为 adapter 权重恢复/初始化使用。', defaultValue: '' },
      { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径', desc: '从 save_state 保存的中断状态继续训练。', defaultValue: '' },
    ],
  },
  {
    id: 'anima-params',
    tab: 'model',
    title: 'Anima 专用参数',
    description: '时间步采样、注意力实现与 VAE 设置。',
    fields: [
      { key: 'qwen3_max_token_length', type: 'number', label: 'Qwen3 最大 token 长度', defaultValue: 512, min: 1 },
      { key: 't5_max_token_length', type: 'number', label: 'T5 最大 token 长度', defaultValue: 512, min: 1 },
      { key: 'timestep_sampling', type: 'select', label: '时间步采样', desc: '默认与官方 Anima 一致的 shift。', defaultValue: 'shift', options: ['sigma', 'uniform', 'sigmoid', 'logit_normal', 'shift', 'flux_shift'] },
      { key: 'discrete_flow_shift', type: 'number', label: 'Flow Shift', desc: 'Rectified Flow 位移，默认 3.0。', defaultValue: 3.0, step: 0.001 },
      { key: 'native_training_method', type: 'select', label: '训练方法', desc: '可选 Anima 原生方法；默认 LoRA，不替换现有训练器行为。', defaultValue: 'lora', options: ['lora', 'ortholora', 'tlora', 'lora_ortho_tlora'] },
      { key: 'sigmoid_scale', type: 'slider', label: 'Sigmoid 缩放', desc: '仅当时间步采样为 sigmoid 时生效。', defaultValue: 1.0, min: 0.01, max: 10, step: 0.01, visibleWhen: when('timestep_sampling', 'sigmoid') },
      { key: 'guidance_scale', type: 'number', label: '引导缩放', desc: 'Anima 引导缩放系数，默认 1.0。', defaultValue: 1.0, min: 0, max: 20, step: 0.1 },
      { key: 'weighting_scheme', type: 'select', label: '时间步权重策略', desc: 'none=均匀权重（全部为 1.0，等价于旧 uniform）。', defaultValue: 'none', options: ['none', 'sigma_sqrt', 'logit_normal', 'mode', 'cosmap'] },
      { key: 'mode_scale', type: 'number', label: 'mode 权重缩放', desc: 'mode 权重策略的缩放系数', defaultValue: '', step: 0.01 },
      { key: 'attn_mode', type: 'select', label: 'Attention 实现', desc: 'Attention 实现。留空时按当前运行时自动选择；在 FlashAttention 运行时下，Anima 会优先尝试 FlashAttention 2。', defaultValue: '', options: ['', 'torch', 'xformers', 'sageattn', 'flash'] },
      { key: 'split_attn', type: 'boolean', label: '拆分 Attention', desc: '拆分 attention 降低显存，会牺牲速度。', defaultValue: false },
      { key: 'vae_chunk_size', type: 'number', label: 'VAE 分块大小', desc: '需为偶数。', defaultValue: '', min: 2 },
      { key: 'vae_disable_cache', type: 'boolean', label: '禁用 VAE 缓存', defaultValue: false },
      { key: 'unsloth_offload_checkpointing', type: 'boolean', label: 'Unsloth Offload', desc: '更快的 CPU RAM activation offload。', defaultValue: false },
    ],
  },
  {
    id: 'save-settings',
    tab: 'model',
    title: '保存设置',
    description: '输出路径、格式与训练状态快照。',
    fields: [
      { key: 'output_name', type: 'string', label: '模型保存名称', defaultValue: 'lulynx_' },
      { key: 'output_dir', type: 'folder', pickerType: 'folder', label: '模型保存文件夹', defaultValue: './output' },
      { key: 'save_model_as', type: 'select', label: '保存格式', defaultValue: 'safetensors', options: ['safetensors', 'pt', 'ckpt'] },
      { key: 'save_precision', type: 'select', label: '保存精度', defaultValue: 'fp16', options: ['fp16', 'float', 'bf16'] },
      { key: 'save_every_n_epochs', type: 'number', label: '每 N 轮保存', defaultValue: 2, min: 1 },
      { key: 'save_every_n_steps', type: 'number', label: '每 N 步保存', defaultValue: '', min: 1 },
      { key: 'save_state', type: 'boolean', label: '保存训练状态', defaultValue: false },
      { key: 'save_state_on_train_end', type: 'boolean', label: '结束时额外保存状态', defaultValue: false },
      { key: 'save_last_n_epochs_state', type: 'number', label: '保留最近 N 个 epoch 状态', defaultValue: '', min: 1, visibleWhen: when('save_state', true) },
    ],
  },
  {
    id: 'dataset-settings',
    tab: 'dataset',
    title: '数据集设置',
    description: '训练数据、正则图与分桶策略。',
    fields: [
      { key: 'train_data_dir', type: 'folder', pickerType: 'folder', label: '训练数据集路径', defaultValue: './train/aki' },
      { key: 'reg_data_dir', type: 'folder', pickerType: 'folder', label: '正则化数据集路径', defaultValue: '' },
      { key: 'resolution', type: 'string', label: '训练分辨率', desc: '宽,高，必须是 64 的倍数。', defaultValue: '1024,1024' },
      { key: 'enable_bucket', type: 'boolean', label: '启用分桶', defaultValue: true },
      { key: 'min_bucket_reso', type: 'number', label: '桶最小分辨率', defaultValue: 256 },
      { key: 'max_bucket_reso', type: 'number', label: '桶最大分辨率', defaultValue: 2048 },
      { key: 'bucket_reso_steps', type: 'number', label: '桶划分单位', defaultValue: 64 },
      { key: 'bucket_no_upscale', type: 'boolean', label: '桶不放大图片', defaultValue: true },
      { key: 'image_decode_backend', type: 'select', label: '图片解码后端', desc: 'pil 最兼容；pil_lru 会按文件 mtime/大小缓存已解码 RGB/Alpha；torchvision_cpu 使用 torchvision 在 CPU 解码后回到现有 PIL augment 链路，不提前占用训练显存。', defaultValue: 'pil', options: IMAGE_DECODE_BACKEND_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
      { key: 'data_backend', type: 'select', label: '数据后端', desc: 'auto 当前保持现有 Anima 数据路径；webdataset/dali 只做探测与运行记录，不会静默替换训练主路径。', defaultValue: 'auto', options: DATA_BACKEND_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
      { key: 'image_decode_cache_size', type: 'number', label: '图片解码缓存张数', desc: '每个 DataLoader worker 的 PIL 解码 LRU 容量。0 关闭缓存；缓存越大内存占用越高。', defaultValue: 0, min: 0, visibleWhen: all(when('performance_expert_mode', true), oneOf('image_decode_backend', ['auto', 'pil_lru'])) },
    ],
  },
  {
    id: 'peak-vram-settings',
    tab: 'speed',
    title: '显存峰值控制',
    description: '目标等效 batch、启动峰值保护、micro-batch 拆分与显存诊断。',
    fields: [
      { key: 'peak_vram_control_enabled', type: 'boolean', label: '启用显存峰值控制', desc: '提供目标等效 batch、启动峰值保护、micro-batch 拆分与轻量显存诊断', defaultValue: false },
      { key: 'peak_vram_target_effective_batch', type: 'number', label: '目标等效 Batch', desc: '填写 0 表示关闭。填写后会自动计算并覆盖梯度累积步数（gradient_accumulation_steps），使 batch_size × 累积步数 ≈ 目标值，而不会抬高单步 batch', defaultValue: 0, min: 0, visibleWhen: v => v.peak_vram_control_enabled === true },
      { key: 'peak_vram_startup_guard_enabled', type: 'boolean', label: '启动峰值保护', desc: '训练开始前若干步套用更保守的省显存策略（推荐高 batch 开启）', defaultValue: false, visibleWhen: v => v.peak_vram_control_enabled === true },
      { key: 'peak_vram_startup_guard_mode', type: 'select', label: '保护强度', desc: 'auto 自动估计；balanced 偏平衡；aggressive 偏省显存', defaultValue: 'auto', options: ['auto', 'balanced', 'aggressive'], visibleWhen: v => v.peak_vram_control_enabled === true && v.peak_vram_startup_guard_enabled === true },
      { key: 'peak_vram_startup_guard_steps', type: 'number', label: '保护持续步数', desc: '启动峰值保护持续多少个优化 step。0 表示整段训练都保留。一般前几步最容易爆显存，不用开太大', defaultValue: 24, min: 0, visibleWhen: v => v.peak_vram_control_enabled === true && v.peak_vram_startup_guard_enabled === true },
      { key: 'peak_vram_micro_batch_enabled', type: 'boolean', label: 'Micro-Batch 拆分', desc: '把当前 batch 拆成更小的前后向子批次，降低单次峰值显存。也有助于改善大 batch 下的过拟合问题', defaultValue: false, visibleWhen: v => v.peak_vram_control_enabled === true },
      { key: 'peak_vram_micro_batch_size', type: 'number', label: 'Micro-Batch 大小', desc: '每个 micro-batch 的前后向 batch 大小', defaultValue: 1, min: 1, visibleWhen: v => v.peak_vram_control_enabled === true && v.peak_vram_micro_batch_enabled === true },
      { key: 'peak_vram_diagnostics_enabled', type: 'boolean', label: '显存诊断', desc: '训练中按设定间隔输出显存峰值', defaultValue: false, visibleWhen: v => v.peak_vram_control_enabled === true },
      { key: 'peak_vram_diagnostics_interval', type: 'number', label: '诊断间隔 (步)', desc: '每 N 个优化 step 输出一次显存诊断', defaultValue: 25, min: 1, visibleWhen: v => v.peak_vram_control_enabled === true && v.peak_vram_diagnostics_enabled === true },
      { key: 'peak_vram_auto_protection_enabled', type: 'boolean', label: '动态显存自动保护', desc: '遇到真实 OOM 时自动降一档保护并重试当前 step，稳定后逐档恢复。注意：开启后训练速度会略有下降，仅建议在显存紧张时使用', defaultValue: false, visibleWhen: v => v.peak_vram_control_enabled === true },
    ],
  },

  {
    id: 'caption-settings',
    tab: 'dataset',
    title: 'Caption（Tag）选项',
    description: 'Anima 支持 JSON 结构化标签。',
    fields: [
      { key: 'prefer_json_caption', type: 'boolean', label: '优先 JSON 标签', desc: '优先读取同名 JSON 标签文件；若不存在回退 TXT。', defaultValue: true },
      { key: 'caption_extension', type: 'string', label: 'Tag 文件扩展名', defaultValue: '.txt' },
      { key: 'shuffle_caption', type: 'boolean', label: '随机打乱标签', desc: 'JSON 模式下分组打乱。', defaultValue: false },
      { key: 'shuffle_caption_tags_only', type: 'boolean', label: '仅打乱 Tag 部分', desc: '结构化 JSON 标注时只打乱 tags，保留自然语言描述顺序', defaultValue: false },
      { key: 'keep_tokens', type: 'number', label: '保留前 N 个 token', defaultValue: 0, min: 0, max: 255 },
      { key: 'caption_tag_dropout_rate', type: 'number', label: '标签丢弃概率', defaultValue: '', min: 0, step: 0.01 },
      { key: 'caption_source_mix_enabled', type: 'boolean', label: '启用 Tag/NL 混合采样', desc: '仅对同时含 tags 与 nl 的结构化 JSON caption 生效。按 NL / Tag / 仅触发词 / 空文本四路抽样；cache-first 需要重建文本缓存以生成 caption_variant_* 变体。', defaultValue: false },
      { key: 'caption_source_nl_ratio', type: 'number', label: 'NL 比例 (%)', desc: '默认 65。选中自然语言描述时，会输出「触发词 + NL」。', defaultValue: 65, min: 0, max: 100, step: 1, visibleWhen: when('caption_source_mix_enabled', true) },
      { key: 'caption_source_tag_ratio', type: 'number', label: 'Tag 比例 (%)', desc: '默认 20。选中标签时，会输出「触发词 + Tag」。', defaultValue: 20, min: 0, max: 100, step: 1, visibleWhen: when('caption_source_mix_enabled', true) },
      { key: 'caption_source_trigger_only_ratio', type: 'number', label: '仅触发词比例 (%)', desc: '默认 10。只保留触发词，用来增强触发稳定性。', defaultValue: 10, min: 0, max: 100, step: 1, visibleWhen: when('caption_source_mix_enabled', true) },
      { key: 'caption_source_empty_ratio', type: 'number', label: '空文本比例 (%)', desc: '默认 5。完全不输入文本，用作轻量 caption dropout。', defaultValue: 5, min: 0, max: 100, step: 1, visibleWhen: when('caption_source_mix_enabled', true) },
      { key: 'caption_source_trigger_tokens', type: 'textarea', label: '触发词列表', desc: '逗号或换行分隔。留空时会优先尝试使用 JSON 中的 concept / identity / trigger 字段。', defaultValue: '', visibleWhen: when('caption_source_mix_enabled', true) },
    ],
  },
  {
    id: 'concept-geometry-settings',
    tab: 'dataset',
    title: '概念几何采样',
    description: '训练侧概念几何分析、采样与加权；不是新的 LoRA 格式，不改变 checkpoint 结构。',
    fields: [
      { key: 'concept_geometry_enabled', type: 'boolean', label: '启用概念几何采样', desc: '开启后可基于 concept_geometry.json 对样本做课程/密度采样与 loss 加权。', defaultValue: false },
      { key: 'concept_geometry_path', type: 'file', pickerType: 'file', label: '概念几何文件', desc: '可选 JSON 元数据；留空时默认读取 train_data_dir/concept_geometry.json，兼容旧 h_lora_geometry.json。', defaultValue: '', visibleWhen: when('concept_geometry_enabled', true) },
      { key: 'concept_geometry_sampler_mode', type: 'select', label: '采样模式', desc: 'curriculum 偏课程；density 偏密度；density_curriculum 结合两者；concept_batch 使用 v2 概念邻域组 batch。', defaultValue: 'density_curriculum', options: ['curriculum', 'density', 'density_curriculum', 'concept_batch'], visibleWhen: when('concept_geometry_enabled', true) },
      { key: 'concept_geometry_loss_weighting', type: 'boolean', label: 'Loss 加权', desc: '对 batch 中样本附加几何权重；与普通 caption weight 相乘。', defaultValue: false, visibleWhen: when('concept_geometry_enabled', true) },
      { key: 'concept_geometry_density_power', type: 'number', label: '密度幂次', desc: '调节密度分布对采样/加权的影响强度。', defaultValue: 1.0, min: 0, max: 4, step: 0.1, visibleWhen: when('concept_geometry_enabled', true) },
      { key: 'concept_geometry_source_priority', type: 'string', label: '概念来源优先级', desc: '逗号分隔：explicit,folder,nl,identity,tag,stem。默认优先 caption 明确声明。', defaultValue: 'explicit,folder,nl,identity,tag,stem', visibleWhen: when('concept_geometry_enabled', true) },
      { key: 'concept_geometry_alias_map', type: 'textarea', label: '概念别名 JSON', desc: '可选。准备 concept_geometry.json 时把别名归一到主概念，例如 {"露露":"lulu"}。', defaultValue: '', visibleWhen: when('concept_geometry_enabled', true) },
      { key: 'concept_geometry_alias_map_path', type: 'file', pickerType: 'file', label: '概念别名文件', desc: '可选 JSON 文件；适合复用较大的别名表。', defaultValue: '', visibleWhen: when('concept_geometry_enabled', true) },

      { key: 'concept_geometry_semantic_enabled', type: 'boolean', label: '增强语义解析', desc: '仅在准备 concept_geometry.json 时使用 text embedding；默认关闭，不下载、不联网。', defaultValue: false, visibleWhen: when('concept_geometry_enabled', true) },
      { key: 'concept_geometry_embedding_provider', type: 'select', label: 'Embedding 来源', desc: 'local_path 使用本地模型；auto_download 需确认后下载推荐模型；api 调用 OpenAI-compatible embeddings。', defaultValue: 'local_path', options: ['local_path', 'auto_download', 'api'], visibleWhen: when('concept_geometry_semantic_enabled', true) },
      { key: 'concept_geometry_embedding_backend', type: 'select', label: 'Embedding 后端', desc: '默认 PyTorch；ONNX 是预留给开发者适配的接口。', defaultValue: 'pytorch', options: ['pytorch', 'onnx'], visibleWhen: when('concept_geometry_semantic_enabled', true) },
      { key: 'concept_geometry_embedding_model', type: 'string', label: 'Embedding 模型', desc: '推荐 BAAI/bge-m3；自动下载会使用 Hugging Face 仓库。', defaultValue: 'BAAI/bge-m3', visibleWhen: when('concept_geometry_semantic_enabled', true) },
      { key: 'concept_geometry_embedding_model_path', type: 'folder', pickerType: 'folder', label: '本地 Embedding 模型目录', defaultValue: '', visibleWhen: when('concept_geometry_embedding_provider', 'local_path') },
      { key: 'concept_geometry_embedding_api_base', type: 'string', label: 'Embedding API Base', desc: 'OpenAI-compatible /v1/embeddings 服务地址。线上 API 会上传 caption/tag。', defaultValue: '', visibleWhen: when('concept_geometry_embedding_provider', 'api') },
      { key: 'concept_geometry_embedding_api_key', type: 'string', label: 'Embedding API Key', defaultValue: '', visibleWhen: when('concept_geometry_embedding_provider', 'api') },

      { key: 'concept_geometry_translation_enabled', type: 'boolean', label: '中文 NL 翻译增强', desc: '准备 concept_geometry.json 时，把中文/日文等 caption 翻译成英文后再送入 embedding；默认关闭。', defaultValue: false, visibleWhen: when('concept_geometry_semantic_enabled', true) },
      { key: 'concept_geometry_translation_provider', type: 'select', label: '翻译来源', defaultValue: 'local_path', options: ['local_path', 'api'], visibleWhen: when('concept_geometry_translation_enabled', true) },
      { key: 'concept_geometry_translation_model_path', type: 'folder', pickerType: 'folder', label: '本地翻译模型目录', defaultValue: '', visibleWhen: when('concept_geometry_translation_provider', 'local_path') },
      { key: 'concept_geometry_translation_api_base', type: 'string', label: '翻译 API Base', desc: 'OpenAI-compatible /v1/chat/completions 服务地址。线上 API 会上传 caption。', defaultValue: '', visibleWhen: when('concept_geometry_translation_provider', 'api') },
      { key: 'concept_geometry_translation_api_key', type: 'string', label: '翻译 API Key', defaultValue: '', visibleWhen: when('concept_geometry_translation_provider', 'api') },
    ],
  },
  {
    id: 'network-settings',
    tab: 'network',
    title: '网络设置',
    description: 'LoRA / T-LoRA / LoKr 适配器参数。',
    fields: [
      { key: 'lora_type', type: 'select', label: '适配器类型', desc: 'LoRA 是基础路线；LoRA-FA 冻结 lora_down；VeRA 使用共享随机投影；T-LoRA 动态 rank；LoKr 为实验路线。', defaultValue: 'lora', options: ['lora', 'dora', 'lora_fa', 'vera', 'tlora', 'hydralora', 'fera', 'loha', 'locon', 'lokr'] },
      { key: 'network_dim', type: 'slider', label: '网络维度', defaultValue: 16, min: 1, max: 512, step: 1 },
      { key: 'network_alpha', type: 'slider', label: '网络 Alpha', defaultValue: 16, min: 1, max: 512, step: 1 },
      { key: 'dim_from_weights', type: 'boolean', label: '从权重推断 Dim', defaultValue: false },
      { key: 'scale_weight_norms', type: 'number', label: '最大范数正则化', defaultValue: '', min: 0, step: 0.01 },
      { key: 'anima_train_llm_adapter', type: 'boolean', label: '训练 LLM Adapter', desc: '普通 Anima LoRA 默认保持关闭，更贴近低显存参考路径；开启后会把 LLM Adapter 也纳入 LoRA 目标，可能提升特定文本对齐但会增加显存和计算量。', defaultValue: false },
      { key: 'network_dropout', type: 'number', label: 'Dropout', defaultValue: 0, min: 0, step: 0.01, visibleWhen: (c) => c.lora_type === 'lora' || c.lora_type === 'lora_fa' || c.lora_type === 'vera' || c.lora_type === 'tlora' || c.lora_type === 'lokr' },
      { key: 'tlora_min_rank', type: 'number', label: 'T-LoRA 最小 Rank', defaultValue: 1, min: 1, visibleWhen: when('lora_type', 'tlora') },
      { key: 'tlora_rank_schedule', type: 'select', label: 'T-LoRA Rank 调度', defaultValue: 'linear', options: ['constant', 'linear', 'geometric'], visibleWhen: when('lora_type', 'tlora') },
      { key: 'pissa_init', type: 'boolean', label: '启用 PiSSA 初始化', defaultValue: false, visibleWhen: when('lora_type', 'lora') },
      { key: 'lokr_factor', type: 'number', label: 'LoKr 分解因子', defaultValue: -1, min: -1, visibleWhen: when('lora_type', 'lokr') },
      { key: 'lokr_rank_dropout', type: 'number', label: 'LoKr Rank Dropout', defaultValue: 0, min: 0, max: 1, step: 0.01, visibleWhen: when('lora_type', 'lokr') },
      { key: 'lokr_module_dropout', type: 'number', label: 'LoKr Module Dropout', defaultValue: 0, min: 0, max: 1, step: 0.01, visibleWhen: when('lora_type', 'lokr') },
      { key: 'lokr_train_norm', type: 'boolean', label: 'LoKr 训练 Norm', desc: '启用后 LoKr 会额外注入 LayerNorm/RMSNorm 适配参数。', defaultValue: false, visibleWhen: when('lora_type', 'lokr') },
      { key: 'lokr_export_mode', type: 'select', label: 'LoKr 保存格式', desc: 'native 保留原生 LoKr 权重；lora_compatible 会展开为标准 LoRA 兼容权重。', defaultValue: 'native', options: ['native', 'lora_compatible'], visibleWhen: when('lora_type', 'lokr') },
      { key: 'hydralora_num_experts', type: 'number', label: 'HydraLoRA 专家数', defaultValue: 4, min: 1, visibleWhen: when('lora_type', 'hydralora') },
      { key: 'hydralora_routing', type: 'select', label: 'HydraLoRA 路由', defaultValue: 'top_k', options: ['top_k', 'dense'], visibleWhen: when('lora_type', 'hydralora') },
      { key: 'hydralora_top_k', type: 'number', label: 'HydraLoRA Top-K', defaultValue: 2, min: 1, visibleWhen: when('lora_type', 'hydralora') },
      { key: 'hydralora_balance_loss_weight', type: 'number', label: 'HydraLoRA 均衡 Loss 权重', defaultValue: 0, min: 0, step: 0.001, visibleWhen: when('lora_type', 'hydralora') },
      { key: 'fera_gate_init', type: 'number', label: 'FeRA Gate 初始值', defaultValue: 0, step: 0.001, visibleWhen: when('lora_type', 'fera') },
      { key: 'easy_control_enabled', type: 'boolean', label: '启用 EasyControl', desc: '接收 batch 中的 control_images 并在 noisy latent 前加入轻量 residual；完整 sidecar 数据集接线仍需后续闭环。', defaultValue: false },
      { key: 'control_image_dir', type: 'folder', pickerType: 'folder', label: 'Control 图片目录', defaultValue: '', visibleWhen: when('easy_control_enabled', true) },
      { key: 'control_suffix', type: 'string', label: 'Control 文件后缀', defaultValue: '', visibleWhen: when('easy_control_enabled', true) },
      { key: 'easy_control_scale', type: 'number', label: 'EasyControl Scale', defaultValue: 1, min: 0, step: 0.01, visibleWhen: when('easy_control_enabled', true) },
      { key: 'easy_control_channels', type: 'number', label: 'EasyControl 通道数', defaultValue: 3, min: 1, visibleWhen: when('easy_control_enabled', true) },
      { key: 'ip_adapter_enabled', type: 'boolean', label: '启用 IP-Adapter', desc: '训练 projector 并支持 batch 中的 ip_adapter_image_features；真实图像编码器接线仍需后续闭环。', defaultValue: false },
      { key: 'ip_adapter_encoder_dim', type: 'number', label: 'IP-Adapter Encoder Dim', defaultValue: 1024, min: 1, visibleWhen: when('ip_adapter_enabled', true) },
      { key: 'ip_adapter_cond_dim', type: 'number', label: 'IP-Adapter Cond Dim', defaultValue: 1152, min: 1, visibleWhen: when('ip_adapter_enabled', true) },
      { key: 'ip_adapter_num_image_tokens', type: 'number', label: 'IP-Adapter Image Tokens', defaultValue: 16, min: 1, visibleWhen: when('ip_adapter_enabled', true) },
      { key: 'ip_adapter_scale', type: 'number', label: 'IP-Adapter Scale', defaultValue: 1, min: 0, step: 0.01, visibleWhen: when('ip_adapter_enabled', true) },
      { key: 'ip_adapter_cond_mode', type: 'select', label: 'IP-Adapter Cond 模式', defaultValue: 'concat', options: ['concat', 'replace'], visibleWhen: when('ip_adapter_enabled', true) },
      { key: 'reft_enabled', type: 'boolean', label: '启用 ReFT', desc: '在指定 DiT 模块 hidden state 上训练低秩 residual intervention。', defaultValue: false },
      { key: 'reft_target_modules', type: 'textarea', label: 'ReFT 目标模块', desc: '逗号/换行分隔的模块路径，例如 net.blocks.0 或 blocks.0。', defaultValue: '', visibleWhen: when('reft_enabled', true) },
      { key: 'reft_rank', type: 'number', label: 'ReFT Rank', defaultValue: 8, min: 1, visibleWhen: when('reft_enabled', true) },
      { key: 'reft_init_scale', type: 'number', label: 'ReFT 初始尺度', defaultValue: 0, min: 0, step: 0.001, visibleWhen: when('reft_enabled', true) },
    ],
  },
  {
    id: 'optimizer-settings',
    tab: 'optimizer',
    title: '学习率与优化器',
    description: '学习率、调度器与优化器类型。',
    fields: [
      { key: 'learning_rate', type: 'string', label: '总学习率', defaultValue: '1e-4' },
      { key: 'unet_lr', type: 'string', label: 'DiT 学习率', defaultValue: '1e-4' },
      { key: 'text_encoder_lr', type: 'string', label: '文本编码器学习率', defaultValue: '1e-5' },
      { key: 'weight_decay', type: 'number', label: '权重衰减', desc: '权重衰减（等价于自动注入 optimizer_args: weight_decay=...）', defaultValue: '', step: 0.0001 },
      { key: 'lr_scheduler', type: 'select', label: '学习率调度器', desc: 'Loss 门控余弦会在 loss 有效下降时保持当前余弦值，平台期再继续推进；Loss 加权退火余弦会越到后期越依赖 loss 信号。', defaultValue: 'cosine_with_restarts', options: schedulerOptions(ANIMA_SCHEDULERS) },
      { key: 'lr_warmup_steps', type: 'number', label: '预热步数', defaultValue: 0, min: 0 },
      { key: 'lr_scheduler_num_cycles', type: 'number', label: '重启次数', defaultValue: 1, min: 1, visibleWhen: when('lr_scheduler', 'cosine_with_restarts') },
      ...LOSS_AWARE_LR_FIELDS,
      { key: 'optimizer_type', type: 'select', label: '优化器', defaultValue: 'pytorch_optimizer.CAME', options: ['AdamW', 'AdamW8bit', 'KahanAdamW8bit', 'PagedAdamW8bit', 'Lion', 'Lion8bit', 'DAdaptation', 'DAdaptAdam', 'DAdaptLion', 'AdaFactor', 'Prodigy', 'prodigyplus.ProdigyPlusScheduleFree', 'AnimaFactoredAdamW', 'Muon', 'pytorch_optimizer.CAME', 'pytorch_optimizer.StableAdamW', 'pytorch_optimizer.SCION'] },
      { key: 'optimizer_backend', type: 'select', label: 'AdamW 后端', desc: '仅细化 AdamW / AdamW8bit 的实现路线；optimizer_args 中显式 foreach/fused 参数优先，后端不可用时训练器会 fallback 并写入运行记录。', defaultValue: 'auto', options: OPTIMIZER_BACKEND_OPTIONS, visibleWhen: all(when('performance_expert_mode', true), adamwFamilyOptimizer) },
      { key: 'advanced_optimizer_strategy', type: 'select', label: '高级优化策略', desc: '默认 auto 不改变训练；lora_plus 复用现有 LoRA+ 参数组；rs_lora 会让原生 LoRA/DoRA 路线启用 alpha/sqrt(rank) 的 adapter scaling；LyCORIS 既有 rs_lora/network_args 仍优先由它自己的字段处理。', defaultValue: 'auto', options: ADVANCED_OPTIMIZER_STRATEGY_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
      { key: 'muon_momentum', type: 'number', label: 'Muon Momentum', desc: '后端原生 Muon 优化器参数：Newton-Schulz 正交化动量。', defaultValue: 0.95, min: 0, max: 1, step: 0.01, visibleWhen: muonOptimizer },
      { key: 'muon_ns_steps', type: 'number', label: 'Muon NS 步数', desc: 'Muon Newton-Schulz 迭代步数。步数越高正交化越充分但开销越大。', defaultValue: 5, min: 1, step: 1, visibleWhen: muonOptimizer },
      { key: 'muon_lr_ratio', type: 'number', label: 'Muon AdamW 回退 LR 倍率', desc: 'Muon 对 1D/scalar 参数回退 AdamW 参数组的学习率倍率。', defaultValue: 1.0, min: 0, step: 0.05, visibleWhen: muonOptimizer },
      { key: 'min_snr_gamma', type: 'number', label: 'Min-SNR Gamma', defaultValue: '', min: 0, step: 0.1 },
    ],
  },
  {
    id: 'training-settings',
    tab: 'training',
    title: '训练相关参数',
    description: '基础训练轮数、批量与反向传播。',
    fields: [
      { key: 'max_train_epochs', type: 'number', label: '最大训练轮数', defaultValue: 10, min: 1 },
      { key: 'train_batch_size', type: 'slider', label: '批量大小', defaultValue: 1, min: 1, max: 32, step: 1 },
      { key: 'gradient_checkpointing', type: 'boolean', label: 'Anima 通用检查点', desc: 'Anima 原生 DiT 主路径由加速页的 Anima DiT Block Checkpointing 控制。两者同开不会双重叠加；本项保留给兼容配置/旧训练路径。', defaultValue: true },
      { key: 'gradient_accumulation_steps', type: 'number', label: '梯度累加步数', defaultValue: 1, min: 1 },
      { key: 'network_train_unet_only', type: 'boolean', label: '仅训练 DiT', desc: '仅训练 DiT / U-Net。', defaultValue: true },
      { key: 'network_train_text_encoder_only', type: 'boolean', label: '仅训练文本编码器', defaultValue: false },
    ],
  },
  {
    id: 'staged-resolution-settings',
    tab: 'training',
    title: '阶段分辨率训练',
    description: '实验性，支持 Anima。1024 基准使用 512/768/1024；2048 基准使用 1024/1536/2048。',
    fields: [
      { key: 'enable_mixed_resolution_training', type: 'boolean', label: '启用阶段分辨率训练', defaultValue: false },
      { key: 'staged_resolution_ratio_512', type: 'number', label: '512 阶段占比 (%)', desc: '当最终分辨率最大边 < 512 时忽略', defaultValue: 20, min: 0, max: 100, step: 1, visibleWhen: when('enable_mixed_resolution_training', true) },
      { key: 'staged_resolution_ratio_768', type: 'number', label: '768 阶段占比 (%)', desc: '当最终分辨率最大边 < 768 时忽略', defaultValue: 30, min: 0, max: 100, step: 1, visibleWhen: when('enable_mixed_resolution_training', true) },
      { key: 'staged_resolution_ratio_1024', type: 'number', label: '1024 阶段占比 (%)', desc: '1024 基准和 2048 基准都会用到', defaultValue: 50, min: 0, max: 100, step: 1, visibleWhen: when('enable_mixed_resolution_training', true) },
      { key: 'staged_resolution_ratio_1536', type: 'number', label: '1536 阶段占比 (%)', desc: '仅 2048 基准会用到', defaultValue: 30, min: 0, max: 100, step: 1, visibleWhen: when('enable_mixed_resolution_training', true) },
      { key: 'staged_resolution_ratio_2048', type: 'number', label: '2048 阶段占比 (%)', desc: '仅 2048 基准会用到', defaultValue: 50, min: 0, max: 100, step: 1, visibleWhen: when('enable_mixed_resolution_training', true) },
      { key: 'staged_resolution_stage_batch_sizes', type: 'string', label: '阶段 Batch（可选）', desc: '按分辨率指定 batch，例如 512:2,768:1,1024:1。留空则所有阶段继承上方批量大小。', defaultValue: '', visibleWhen: when('enable_mixed_resolution_training', true) },
    ],
  },
  {
    id: 'preview-settings',
    tab: 'preview',
    title: '训练预览图',
    description: 'Anima 训练中生成预览图的配置。',
    fields: [
      { key: 'enable_preview', type: 'boolean', label: '启用预览图', defaultValue: false },
      { key: 'positive_prompts', type: 'textarea', label: '正向提示词', defaultValue: 'newest, safe, 1girl, masterpiece, best quality', visibleWhen: when('enable_preview', true) },
      { key: 'negative_prompts', type: 'textarea', label: '反向提示词', defaultValue: '', visibleWhen: when('enable_preview', true) },
      { key: 'preview_groups', type: 'preview_groups', label: '预览测试组', desc: '可添加多组预览，并为每组单独设置 seed、LoRA 权重和延迟启用轮次；例如第三组从第 3 个 epoch 后再开始测试泛化性。留空时仍使用上方旧提示词。', defaultValue: [], visibleWhen: when('enable_preview', true) },
      { key: 'sample_width', type: 'number', label: '预览图宽', defaultValue: 1024, min: 64, visibleWhen: when('enable_preview', true) },
      { key: 'sample_height', type: 'number', label: '预览图高', defaultValue: 1024, min: 64, visibleWhen: when('enable_preview', true) },
      { key: 'sample_cfg', type: 'number', label: 'CFG', defaultValue: 4, min: 1, max: 30, visibleWhen: when('enable_preview', true) },
      { key: 'sample_steps', type: 'number', label: '推理步数', defaultValue: 25, min: 1, max: 300, visibleWhen: when('enable_preview', true) },
      { key: 'sample_sampler', type: 'select', label: '采样器', desc: '预览采样器。当前 Anima 训练预览只支持 euler / k_euler；导入旧配置时会自动把不兼容值规范化', defaultValue: 'euler', options: ['euler', 'k_euler'], visibleWhen: when('enable_preview', true) },
      { key: 'sample_scheduler', type: 'select', label: '预览调度器', desc: 'Anima 预览调度器。当前训练预览支持 simple', defaultValue: 'simple', options: ['simple'], visibleWhen: when('enable_preview', true) },
      { key: 'sample_every_n_epochs', type: 'number', label: '每 N 个 epoch 生成', defaultValue: 2, min: 1, visibleWhen: when('enable_preview', true) },
      { key: 'sample_at_first', type: 'boolean', label: '训练前先生成', defaultValue: false, visibleWhen: when('enable_preview', true) },
      { key: 'eval_data_dir', type: 'folder', pickerType: 'folder', label: '自定义验证集路径', desc: '独立验证集目录。填了这里就不会从训练集切图；用户可以手动复制一部分图片和 caption 到这个目录，用于计算验证 loss', defaultValue: '' },
      { key: 'eval_batch_size', type: 'number', label: '验证批量大小', desc: '验证集 batch。0 或留空时使用训练 batch', defaultValue: '', min: 0 },
      { key: 'validation_split', type: 'number', label: '验证集划分比例', desc: '兼容旧用法：从训练集自动切出一部分做验证。若已填写自定义验证集路径，则不会切分训练集', defaultValue: 0, min: 0, max: 1, step: 0.01 },
      { key: 'validate_every_n_steps', type: 'number', label: '每 N 步验证', desc: '每 N 个 optimizer step 执行一次验证。留空则只按 epoch 验证', defaultValue: '', min: 1 },
      { key: 'validate_every_n_epochs', type: 'number', label: '每 N 轮验证', desc: '每 N 个 epoch 执行一次验证', defaultValue: '', min: 1 },
      { key: 'max_validation_steps', type: 'number', label: '最大验证步数', desc: '每次验证最多处理多少个验证批次。留空表示完整验证集', defaultValue: '', min: 1 },
      { key: 'log_with', type: 'select', label: '日志模块', defaultValue: 'tensorboard', options: ['tensorboard', 'wandb'] },
      { key: 'logging_dir', type: 'folder', pickerType: 'folder', label: '日志保存文件夹', defaultValue: './logs' },
    ],
  },
  {
    id: 'speed-settings',
    tab: 'speed',
    title: '速度优化选项',
    description: '混合精度、缓存与 FP8。',
    fields: [
      { key: 'mixed_precision', type: 'select', label: '混合精度', defaultValue: 'bf16', options: ['no', 'fp16', 'bf16'] },
      { key: 'fp8_base', type: 'boolean', label: 'FP8 基础模型', defaultValue: false },
      { key: 'fp8_base_compute', type: 'boolean', label: 'FP8 Base Compute', desc: '后端新增：在支持的 Ada/Hopper FP8 Tensor Core 上直接运行冻结基础权重 GEMM；不支持时后端回退。默认关闭，建议只在 FP8 base 存储稳定后开启。', defaultValue: false, visibleWhen: fp8BaseStorageEnabled },
      { key: 'fp8_base_unet', type: 'boolean', label: 'FP8 仅 DiT', defaultValue: false },
      { key: 'weight_compression_enabled', type: 'boolean', label: '基础权重压缩', desc: '对冻结的主干或文本编码器权重做省显存压缩。第一版使用 FP8 e4m3，并跳过可训练参数和适配器参数。', defaultValue: false },
      { key: 'weight_compression_preset', type: 'select', label: '压缩预设', desc: '推荐先用省显存-稳妥；文本编码器预设仅在不训练文本编码器时使用。高级字段可覆盖预设。', defaultValue: 'off', options: ['off', 'stable_backbone_int8', 'aggressive_backbone_uint4', 'text_encoder_int8', 'both_int8', 'experimental_float8'] },
      { key: 'weight_compression_target', type: 'select', label: '压缩目标', desc: 'backbone 压缩 DiT/U-Net；text_encoder 压缩文本编码器；both 同时启用。', defaultValue: 'none', options: ['none', 'backbone', 'text_encoder', 'both'], visibleWhen: when('weight_compression_enabled', true) },
      { key: 'weight_compression_format', type: 'select', label: '压缩格式', desc: 'fp8_e4m3 为原生稳定路径；torchao / quanto 格式需要对应运行库，当前只尝试冻结 Linear 权重。', defaultValue: 'fp8_e4m3', options: ['fp8_e4m3', 'torchao_int8', 'torchao_uint4', 'torchao_float8', 'quanto_int8', 'quanto_float8'], visibleWhen: when('weight_compression_enabled', true) },
      { key: 'weight_compression_include_patterns', type: 'text', label: '压缩包含模式', desc: '可选，逗号分隔；匹配组件/参数名后才压缩。', defaultValue: '', visibleWhen: when('weight_compression_enabled', true) },
      { key: 'weight_compression_exclude_patterns', type: 'text', label: '压缩排除模式', desc: '可选，逗号分隔；匹配组件/参数名的权重会跳过。', defaultValue: '', visibleWhen: when('weight_compression_enabled', true) },
      { key: 'weight_compression_allow_offload_combo', type: 'boolean', label: '允许与 Offload 同开', desc: '高级实验选项；默认不建议与模块级 offload 同时启用，避免调试困难。', defaultValue: false, visibleWhen: when('weight_compression_enabled', true) },
      { key: 'compression_companion_enabled', type: 'boolean', label: '压缩恢复适配器', desc: '加载一个冻结 LoRA 补偿适配器，先合并进基础权重，再进行权重压缩。当前仅支持 merge_into_base。', defaultValue: false, visibleWhen: when('weight_compression_enabled', true) },
      { key: 'compression_companion_path', type: 'file', pickerType: 'file', label: '恢复适配器路径', desc: 'LoRA / safetensors / pt 路径；会合并进 base，不作为训练 adapter 保存。', defaultValue: '', visibleWhen: when('compression_companion_enabled', true) },
      { key: 'compression_companion_type', type: 'select', label: '恢复适配器类型', defaultValue: 'lora', options: ['lora'], visibleWhen: when('compression_companion_enabled', true) },
      { key: 'compression_companion_mode', type: 'select', label: '恢复适配器模式', defaultValue: 'merge_into_base', options: ['merge_into_base'], visibleWhen: when('compression_companion_enabled', true) },
      { key: 'compression_companion_scale', type: 'number', label: '恢复适配器强度', desc: '合并到 base 时的倍率；1.0 表示原始强度。', defaultValue: 1.0, step: 0.05, visibleWhen: when('compression_companion_enabled', true) },
      { key: 'flashattn', type: 'boolean', label: '启用 FlashAttention 2', desc: '启用 FlashAttention 2（实验性，需要 FlashAttention 运行时）', defaultValue: false },
      { key: 'lowram', type: 'boolean', label: '低内存模式', defaultValue: false },
      { key: 'cache_latents', type: 'boolean', label: '缓存 Latent', defaultValue: true },
      { key: 'cache_latents_to_disk', type: 'boolean', label: '缓存 Latent 到磁盘', defaultValue: true },
      { key: 'latent_cache_disk_format', type: 'select', label: 'Latent 缓存格式', desc: 'latent 磁盘缓存格式。默认 safetensors；若已有旧缓存会自动兼容读取 npz', defaultValue: 'safetensors', options: ['safetensors', 'npz'] },
      { key: 'latent_cache_disk_dtype', type: 'select', label: 'Latent 缓存精度', desc: 'latent 磁盘缓存保存精度。auto 会尽量保留运行时 dtype；fp16 更省空间，fp32 兼容性更高。若选择 npz + bf16，后端会自动回退为 fp32', defaultValue: 'auto', options: ['auto', 'fp16', 'bf16', 'fp32'], visibleWhen: v => v.cache_latents_to_disk === true },
      { key: 'cache_text_encoder_outputs', type: 'boolean', label: '缓存文本编码器输出', defaultValue: true },
      { key: 'cache_text_encoder_outputs_to_disk', type: 'boolean', label: '缓存文本编码器输出到磁盘', defaultValue: true },
      { key: 'text_encoder_outputs_cache_disk_format', type: 'select', label: '文本缓存格式', desc: '文本编码器输出磁盘缓存格式。默认 safetensors；若已有旧的 npz 缓存也会自动兼容读取', defaultValue: 'safetensors', options: ['safetensors', 'npz'], visibleWhen: v => v.cache_text_encoder_outputs_to_disk === true },
      { key: 'text_encoder_outputs_cache_dtype', type: 'select', label: '文本缓存精度', desc: '文本编码器输出磁盘缓存的保存精度。auto 会尽量保留运行时 dtype；fp16 / bf16 更省空间，fp32 兼容性更高', defaultValue: 'auto', options: ['auto', 'fp16', 'bf16', 'fp32'], visibleWhen: v => v.cache_text_encoder_outputs_to_disk === true },
      { key: 'text_encoder_batch_size', type: 'number', label: '文本编码器批量大小', defaultValue: '', min: 1 },
      { key: 'activation_compression_enabled', type: 'boolean', label: '激活压缩', desc: '实验性：压缩 autograd 保存的激活张量以降低显存峰值。默认关闭，适合 Anima/DiT 全量微调或低显存 A/B。', defaultValue: false },
      { key: 'activation_compression_dtype', type: 'select', label: '激活压缩精度', desc: '激活压缩保存精度。FP8 更激进，需谨慎做质量对照。', defaultValue: 'fp16', options: ACTIVATION_COMPRESSION_DTYPE_OPTIONS, visibleWhen: when('activation_compression_enabled', true) },
      { key: 'activation_compression_min_tensor_mb', type: 'number', label: '激活压缩最小张量 MB', desc: '只压缩达到该大小的激活张量；0 表示不过滤。', defaultValue: 1.0, min: 0, step: 0.1, visibleWhen: when('activation_compression_enabled', true) },
      { key: 'vram_auto_enhance_enabled', type: 'boolean', label: '显存不足自动增强', desc: '训练预检判断显存紧张时，自动尝试 Streaming Offload、DiT Block Checkpointing、Streaming Prefetch 和稀疏交换。不会自动启用 PCIe 低精度传输。', defaultValue: true },
      { key: 'enhanced_protection_mode', type: 'boolean', label: '增强防护模式', desc: '默认关闭。开启后，显存自动增强流程才允许把 PCIe 训练传输格式自动提升到 FP8 E4M3；仍只作用于 CPU-pinned 的冻结 Linear 权重。', defaultValue: false, visibleWhen: when('vram_auto_enhance_enabled', true) },
      { key: 'vram_smart_sensing_baseline_steps', type: 'number', label: '智能感知基线步数', desc: '二阶段智能感知用于建立平均速度基线的步数。达到基线后，后续 step 若明显变慢才输出建议。', defaultValue: 50, min: 5, step: 5, visibleWhen: when('vram_auto_enhance_enabled', true) },
      { key: 'vram_smart_sensing_slowdown_ratio', type: 'number', label: '智能感知变慢阈值', desc: '后续窗口平均耗时相对基线的触发倍率。1.5 表示慢 50% 才提示。只建议，不会中途改训练策略。', defaultValue: 1.5, min: 1.05, step: 0.05, visibleWhen: when('vram_auto_enhance_enabled', true) },
      { key: 'vram_smart_sensing_delta_cache_enabled', type: 'boolean', label: '智能感知 Delta/Cache 候选', desc: '默认关闭。开启后，显存自动增强只会打开只读候选识别，不分配缓存、不改变训练 tensor 路径，用于判断哪些 PCIe 交换层适合后续做 Delta/Cache。', defaultValue: false, visibleWhen: when('vram_auto_enhance_enabled', true) },
      { key: 'native_runtime_profile', type: 'select', label: '原生运行配置', desc: '可选优化配置；standard 保持当前行为。', defaultValue: 'standard', options: ['standard', 'aggressive', 'anima_fast', 'anima_low_vram', 'anima_experimental'] },
      { key: 'anima_cache_mode', type: 'select', label: 'Anima 缓存模式', desc: 'cache_first 使用已有 Anima cache；online/rebuild 为显式边界。', defaultValue: 'cache_first', options: ['cache_first', 'online', 'rebuild_cache', 'force_cache_only'] },
      { key: 'sdpa_backend_policy', type: 'select', label: 'SDPA 后端', desc: '仅当注意力后端为 SDPA 时生效。Cutlass (EffiAttn) 对应 PyTorch 的 EFFICIENT_ATTENTION 路线。', defaultValue: 'cutlass', options: ['cutlass', 'flash', 'cudnn', 'math', 'auto'] },
      { key: 'anima_fixed_text_tokens', type: 'number', label: '固定文本 Token 数', desc: '0=动态 padding；512 可用于 Anima fast 静态形状。', defaultValue: 0, min: 0, max: 2048, step: 64 },
      { key: 'anima_fixed_visual_tokens', type: 'select', label: '视觉 Token 档位', desc: '0=自动/no-pad（默认，按缓存动态分桶）。固定档位会把所有图 pad 到方形 token canvas：1024=32x32 latent(≤512px)、4096=64x64(≤1024px)、16384=128x128(≤2048px)。', defaultValue: '0', options: ['0', '1024', '4096', '16384'] },
      { key: 'anima_cached_latent_crop_size', type: 'number', label: '缓存 Latent 裁剪', desc: '0=使用完整缓存 latent；正数会裁剪缓存 latent，主要用于冒烟/debug/显存探测。', defaultValue: 0, min: 0, max: 256, step: 1 },
      { key: 'anima_compile_scope', type: 'select', label: '编译范围', desc: 'per_block 为优先支持目标；full_cudagraph 仍为实验边界。留空关闭。', defaultValue: '', options: ['', 'per_block', 'full_cudagraph'] },
      { key: 'lora_activation_recompute_mode', type: 'select', label: 'LoRA 分支重算', desc: '降低原生 DiT LoRA 反传激活峰值。auto 会在 Anima/Newbie 路线默认开启；off 主要用于 benchmark 对比。', defaultValue: 'auto', options: LORA_RECOMPUTE_OPTIONS },
      { key: 'anima_block_residency', type: 'select', label: 'Anima Streaming Offload', desc: '控制原生 Anima 冻结 DiT 权重的驻留策略。Streaming Offload 是省显存与速度的平衡档，但 1024/4096-token 训练需要配合 DiT Block Checkpointing；Block CPU pinned 是极限低显存档。', defaultValue: 'resident', options: ANIMA_BLOCK_RESIDENCY_OPTIONS },
      { key: 'anima_block_residency_min_params', type: 'number', label: 'Anima Offload 最小参数量', desc: '只托管参数量达到该阈值的冻结 Linear。Streaming Offload 下 0 表示 hot-aware 自动阈值：边缘 block 和 attention/modulation 热路径常驻，冷的大 Linear 才会流式卸载；Block CPU pinned 下 0 表示不过滤。', defaultValue: 0, min: 0, visibleWhen: nonResidentBlockMode('anima_block_residency') },
      { key: 'anima_block_checkpointing', type: 'boolean', label: 'Anima DiT Block Checkpointing', desc: '训练时重算 DiT block 以降低反传激活峰值。高分辨率非 resident 驻留会由后端自动启用；手动开启可让预检和配置更直观。', defaultValue: false, visibleWhen: nonResidentBlockMode('anima_block_residency') },
      { key: 'anima_block_checkpointing_mode', type: 'select', label: 'Anima Block Checkpoint 模式', desc: 'block 按整块重算；selective 为 op-level SAC（保留 matmul/SDPA，只重算 elementwise）。', defaultValue: 'block', options: ['block', 'selective'], visibleWhen: all(nonResidentBlockMode('anima_block_residency'), when('anima_block_checkpointing', true)) },
      { key: 'anima_block_checkpointing_interval', type: 'number', label: 'Anima Block Checkpoint 间隔', desc: '每 N 个 block 做一次 checkpoint（1=全部 block）。N>1 用更多显存换更少重算。', defaultValue: 1, min: 1, step: 1, visibleWhen: all(nonResidentBlockMode('anima_block_residency'), when('anima_block_checkpointing', true)) },
      { key: 'anima_block_prefetch', type: 'boolean', label: 'Anima Streaming Prefetch', desc: '实验性：仅对 Streaming Offload 生效，提前把后续 block 的 CPU-pinned 冻结 Linear 权重异步拉到 GPU，尝试减少 PCIe 等待。默认关闭，建议先用 benchmark 对比速度。', defaultValue: false, visibleWhen: when('anima_block_residency', 'streaming_offload') },
      { key: 'anima_block_prefetch_depth', type: 'number', label: 'Anima Prefetch 深度', desc: '提前预取后续多少个 DiT block。1 表示当前 block 入口同时预热当前和下一个 block；过大可能增加瞬时显存。', defaultValue: 1, min: 0, max: 4, visibleWhen: all(when('anima_block_residency', 'streaming_offload'), when('anima_block_prefetch', true)) },
      { key: 'pcie_transfer_format', type: 'select', label: 'PCIe 训练传输格式', desc: '实验性全局方案：仅作用于 CPU-pinned 的冻结 Linear 权重，CPU 侧预打包，训练时传到 GPU 后快速还原。默认关闭；建议先用 PCIe benchmark 对比 FP8/INT8。', defaultValue: 'off', options: PCIE_TRANSFER_FORMAT_OPTIONS, visibleWhen: nonResidentBlockMode('anima_block_residency') },
      { key: 'sparse_swap_enabled', type: 'boolean', label: '稀疏交换方案', desc: '实验性：仅对 Streaming Offload 生效。把冷层分成 warm prefetch 与 cold on-demand，减少低端卡 PCIe 预取队列压力。默认关闭。', defaultValue: false, visibleWhen: streamingBlockMode('anima_block_residency') },
      { key: 'sparse_swap_warm_fraction', type: 'number', label: '稀疏交换 Warm 比例', desc: '冷层中允许提前预取的比例；剩余冷层按需交换。推荐 0.25-0.40。', defaultValue: 0.35, min: 0, max: 1, step: 0.05, visibleWhen: all(streamingBlockMode('anima_block_residency'), when('sparse_swap_enabled', true)) },
      { key: 'sparse_swap_budget_mb', type: 'number', label: '稀疏交换 Warm 预算 MB', desc: '限制 warm prefetch 的 FP16 等效预算。0 表示不额外限制，只按 Warm 比例。', defaultValue: 0, min: 0, step: 64, visibleWhen: all(streamingBlockMode('anima_block_residency'), when('sparse_swap_enabled', true)) },
      { key: 'pcie_delta_cache_enabled', type: 'boolean', label: 'PCIe Delta/Cache 候选分析', desc: '实验性手动入口。observe 只输出候选报告；cache_v0 会在预算内缓存部分 CPU-pinned 冻结 Linear 的 GPU 解码副本。默认关闭。', defaultValue: false, visibleWhen: nonResidentBlockMode('anima_block_residency') },
      { key: 'pcie_delta_cache_mode', type: 'select', label: 'PCIe Delta/Cache 模式', desc: 'observe 只读观察；cache_v0 是手动实验缓存，不会由自动增强开启。建议只在 prefetch 覆盖差、关闭或 PCIe 等待明显时尝试。', defaultValue: 'observe', options: ['observe', 'cache_v0'], visibleWhen: all(nonResidentBlockMode('anima_block_residency'), when('pcie_delta_cache_enabled', true)) },
      { key: 'pcie_delta_cache_budget_mb', type: 'number', label: 'PCIe Cache v0 预算 MB', desc: 'cache_v0 的 GPU 缓存预算。建议 256MB 起步；prefetch 已完整覆盖时通常没有收益，预算过大还可能更慢。0 表示不启用真实缓存。', defaultValue: 256, min: 0, step: 64, visibleWhen: all(nonResidentBlockMode('anima_block_residency'), when('pcie_delta_cache_enabled', true), when('pcie_delta_cache_mode', 'cache_v0')) },
      { key: 'swap_granularity', type: 'select', label: '显存交换模式', desc: 'off 关闭；auto 自动选择；block 按 block 搬运；merged_block 合并 block 降低 PCIe 传输次数；layer 为 Fine-grained / Layer Swap（现有细粒度 swap，不是真模块级 offload）。', defaultValue: 'off', options: ['off', 'auto', 'block', 'merged_block', 'layer'] },
      { key: 'swap_ratio', type: 'slider', label: '显存交换比例', desc: '按原始 block/layer 总数计算交换比例。0 表示只在 auto 或 swap_count 下生效。', defaultValue: 0, min: 0, max: 1, step: 0.05, visibleWhen: swapEnabled },
      { key: 'swap_count', type: 'number', label: '显存交换数量', desc: '高级：绝对交换数量。大于 0 时优先于比例。', defaultValue: 0, min: 0, visibleWhen: swapEnabled },
      { key: 'block_merge_size', type: 'number', label: '合并 Block 大小', desc: 'merged_block 模式下每组包含的 block 数。', defaultValue: 2, min: 2, visibleWhen: when('swap_granularity', 'merged_block') },
      { key: 'block_swap_strategy', type: 'select', label: 'BlockSwap 搬运策略', desc: 'auto 使用后端解析；sync 保守同步；async 使用现有异步预取。', defaultValue: 'auto', options: BLOCK_SWAP_STRATEGY_OPTIONS, visibleWhen: all(swapEnabled, when('performance_expert_mode', true)) },
      { key: 'module_offload_enabled', type: 'boolean', label: '模块级 Offload', desc: 'clean-room 新路线：按比例让冻结的 Linear / Conv 模块常驻 CPU，训练时按需临时回到 GPU。与现有 swap 互斥。', defaultValue: false },
      { key: 'module_offload_profile_enabled', type: 'boolean', label: '使用 Offload Profile', desc: '启用后可用 conservative / balanced / aggressive 预设填充主干与文本编码器比例；显式覆盖比例仍优先。', defaultValue: false, visibleWhen: when('module_offload_enabled', true) },
      { key: 'module_offload_profile', type: 'select', label: 'Offload Profile', desc: 'conservative: 主干25%/文本0%；balanced: 主干50%/文本25%；aggressive: 主干75%/文本50%。', defaultValue: 'custom', options: ['custom', 'conservative', 'balanced', 'aggressive'], visibleWhen: v => v.module_offload_enabled === true && v.module_offload_profile_enabled === true },
      { key: 'module_offload_ratio', type: 'number', label: '模块 Offload 比例', desc: '0-100，表示参与 offload 的可管理模块占比，不是目标显存占比。', defaultValue: 0, min: 0, max: 100, visibleWhen: when('module_offload_enabled', true) },
      { key: 'module_offload_backbone_ratio', type: 'number', label: '主干覆盖比例', desc: '可选 0-100；留空则继承总比例。backbone 指 UNet 或 DiT 主干。', defaultValue: '', min: 0, max: 100, visibleWhen: when('module_offload_enabled', true) },
      { key: 'module_offload_text_encoder_ratio', type: 'number', label: '文本编码器覆盖比例', desc: '可选 0-100；留空则继承总比例，并对每个启用的文本编码器独立生效。', defaultValue: '', min: 0, max: 100, visibleWhen: when('module_offload_enabled', true) },
      { key: 'module_offload_min_param_mb', type: 'number', label: '最小模块 MB', desc: '只 offload 参数量达到该 MB 的候选模块；0 表示不过滤。', defaultValue: 0, min: 0, step: 0.1, visibleWhen: when('module_offload_enabled', true) },
      { key: 'module_offload_include_patterns', type: 'text', label: '包含模块模式', desc: '可选，逗号分隔；匹配 scope/path/type 后才作为候选。', defaultValue: '', visibleWhen: when('module_offload_enabled', true) },
      { key: 'module_offload_exclude_patterns', type: 'text', label: '排除模块模式', desc: '可选，逗号分隔；匹配 scope/path/type 的候选会跳过。', defaultValue: '', visibleWhen: when('module_offload_enabled', true) },
      { key: 'module_offload_prefetch_enabled', type: 'boolean', label: '实验 Prefetch / Streaming', desc: '实验性，会变慢，可能不兼容部分训练配置。第一版仅尝试 frozen backbone Linear 预热，失败会降级为普通 module_offload。', defaultValue: false, visibleWhen: when('module_offload_enabled', true) },
      { key: 'module_offload_prefetch_mode', type: 'select', label: 'Prefetch 模式', desc: '高级实验入口；当前仅 experimental。', defaultValue: 'experimental', options: ['experimental'], visibleWhen: v => v.module_offload_enabled === true && v.module_offload_prefetch_enabled === true },
      { key: 'blocks_to_swap', type: 'number', label: '旧版 Block 交换数量', desc: '兼容旧配置。新配置建议使用上方显存交换模式、比例和数量。', defaultValue: '', min: 1 },
      { key: 'performance_expert_mode', type: 'boolean', label: '性能专家模式', desc: '在训练 WebUI 中展开高级性能策略。默认保持自动策略；仅在 A/B、长序列或瓶颈诊断时调整。', defaultValue: false },
      { key: 'compile_runtime', type: 'select', label: 'Compile 运行策略', desc: '统一表达编译意图；短训和低显存建议保持 off/auto。长训练或复训可尝试 compile_cache；Anima 短测中 compile_cache + token_flatten + inner_forward 稳定段更快，但首步更慢且峰值显存更高。已有 torch_compile、scope 或启动参数显式启用时后端优先尊重显式参数。', defaultValue: 'off', options: COMPILE_RUNTIME_OPTIONS },
      { key: '__ui_group_compile_expert_collapsed', type: 'ui_group', label: '高级 Compile 策略已收起', desc: '基础 Compile 运行策略可在普通模式选择；shape / target / cudagraph 等复杂覆盖项仍收在专家模式。关闭专家模式时不会发送 shape/target 等复杂覆盖项，后端会继续按显式启动参数优先并自动 fallback。', visibleWhen: when('performance_expert_mode', false) },
      { key: 'cross_attn_fused_kv', type: 'boolean', label: 'Anima Fused K/V', desc: '融合 Anima cross-attention 的 K/V projection。默认保留原始层；显存模式需在专家模式中选择。', defaultValue: false, visibleWhen: when('performance_expert_mode', true) },
      { key: 'anima_fused_qkv', type: 'boolean', label: 'Anima Fused Q/K/V', desc: '融合 Anima self-attention 的 Q/K/V projection。默认保留原始层；LoRA 包裹层会自动跳过。', defaultValue: false, visibleWhen: when('performance_expert_mode', true) },
      { key: 'fused_projection_memory_mode', type: 'select', label: 'Fused Projection 显存模式', desc: 'keep_original 最兼容；drop_original 会移除原始 Q/K/V 层以节省显存；materialize_on_save 训练中移除，state_dict 保存时从 fused 权重补回原始 key。', defaultValue: 'keep_original', options: FUSED_PROJECTION_MEMORY_MODE_OPTIONS, visibleWhen: all(when('performance_expert_mode', true), (c) => c.cross_attn_fused_kv === true || c.anima_fused_qkv === true) },
      { key: 'experimental_attention_profile_enabled', type: 'boolean', label: 'Sliding Window Attention', desc: '实验性窗口注意力。auto 会优先尊重启动器/预检解析后的 attention backend；不支持窗口实现时再 fallback。', defaultValue: false, visibleWhen: when('performance_expert_mode', true) },
      { key: 'experimental_attention_profile_window', type: 'number', label: '窗口大小', desc: '每个 token 可关注的历史窗口大小。越大越接近全注意力，也越耗显存。', defaultValue: 100, min: 10, visibleWhen: all(when('performance_expert_mode', true), when('experimental_attention_profile_enabled', true)) },
      { key: 'experimental_attention_profile_backend', type: 'select', label: '窗口注意力后端', desc: 'auto 优先使用启动器/预检传入的 attention 参数；FlexAttention 需要 CUDA 与对应 PyTorch 支持。', defaultValue: 'auto', options: WINDOW_ATTENTION_BACKEND_OPTIONS, visibleWhen: all(when('performance_expert_mode', true), when('experimental_attention_profile_enabled', true)) },
      { key: 'experimental_attention_profile_torch_max_tokens', type: 'number', label: 'Torch 回退最大 Token', desc: '防止纯 PyTorch O(n²) fallback 在长序列误跑。仅 torch_fallback 生效。', defaultValue: 2048, min: 128, visibleWhen: all(when('performance_expert_mode', true), when('experimental_attention_profile_enabled', true), when('experimental_attention_profile_backend', 'torch_fallback')) },
      { key: 'data_transfer_profile_enabled', type: 'boolean', label: '数据传输 Profiling', desc: '采样 CPU/GPU tensor 传输耗时。默认关闭；event 模式开销较低，sync 只用于精确排查。', defaultValue: false, visibleWhen: when('performance_expert_mode', true) },
      { key: 'data_transfer_profile_mode', type: 'select', label: '传输计时模式', desc: 'event 使用 CUDA events 延迟同步；sync 保留旧全局同步计时；off 忽略 profiling。', defaultValue: 'event', options: DATA_TRANSFER_PROFILE_MODE_OPTIONS, visibleWhen: all(when('performance_expert_mode', true), when('data_transfer_profile_enabled', true)) },
      { key: 'data_transfer_profile_window', type: 'number', label: '传输采样窗口', desc: '每累计多少次传输输出一次汇总。', defaultValue: 50, min: 1, visibleWhen: all(when('performance_expert_mode', true), when('data_transfer_profile_enabled', true)) },
      { key: 'loss_precision', type: 'select', label: 'Loss 精度策略', desc: 'fp32_loss 保持当前稳定路径；mixed_loss 保留模型输出精度计算核心 loss，减少临时 FP32 副本，但属于实验选项。', defaultValue: 'fp32_loss', options: LOSS_PRECISION_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
      { key: 'compile_shape_strategy', type: 'select', label: 'Compile Shape 策略', desc: 'auto 会按路由自动选择；token_flatten/native 主要用于 Anima/Newbie cache-first + no-pad token bucket。长训练可与 compile_cache 搭配优先尝试 token_flatten；若启动参数或其他显式配置冲突，后端优先尊重显式参数，再做 fallback。', defaultValue: 'auto', options: COMPILE_SHAPE_STRATEGY_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
      { key: 'compile_target_strategy', type: 'select', label: 'Compile Target 策略', desc: 'auto 由后端按模块能力探测；inner_forward 会优先 block 内稳定 forward 路径，block 保留整块编译。Anima 矩阵短测中 inner_forward 优于 block；与启动参数冲突时先尊重显式参数。', defaultValue: 'auto', options: COMPILE_TARGET_STRATEGY_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
      { key: 'cached_collate_mode', type: 'select', label: '缓存数据 Collate', desc: '仅影响 Anima/Newbie cache-first 数据集。auto/pad_sequence 使用 PyTorch 原生序列 padding；legacy 保留旧预分配循环路径，用于对照或兼容排查。', defaultValue: 'auto', options: CACHED_COLLATE_MODE_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
      { key: 'checkpoint_policy', type: 'select', label: 'Checkpoint 策略', desc: 'auto 尊重现有 gradient_checkpointing / cpu_offload_checkpointing；full 强制通用检查点；offloaded 使用 CPU saved-tensor/offload 路径；selective 会先做能力探测，当前 Anima/Newbie native DiT 有实验性真实接线；其它路线仍会 fallback 并写入运行记录。', defaultValue: 'auto', options: CHECKPOINT_POLICY_OPTIONS, visibleWhen: when('performance_expert_mode', true) },
      { key: 'turbocore_experimental_fp8', type: 'boolean', label: 'TurboCore FP8 实验路径', desc: '后端新增的 TurboCore FP8 请求开关。默认关闭；当前只作为显式实验请求，后端仍会按能力解析并可回退。', defaultValue: false, visibleWhen: when('performance_expert_mode', true) },
      { key: 'cuda_cache_release_strategy', type: 'select', label: 'CUDA 缓存释放策略', desc: 'oom_only 仅在 OOM 恢复时释放；phase_boundary 在 TE/VAE / 组件下 CPU 边界释放；after_optimizer 保留旧低显存稳妥档；aggressive 会把阶段边界和训练步释放都打开。旧 every_step 配置会自动按 aggressive 兼容。', defaultValue: 'oom_only', options: CUDA_CACHE_RELEASE_OPTIONS },
      { key: 'cuda_cache_release_interval', type: 'number', label: '缓存释放间隔', desc: '每 N 个优化 step 允许一次缓存释放。1 最省显存；2~10 可减少同步频率，适合显存略紧但想保留速度时尝试。', defaultValue: 1, min: 1, visibleWhen: (c) => c.cuda_cache_release_strategy && c.cuda_cache_release_strategy !== 'off' },
      { key: 'vram_swap_to_ram', type: 'boolean', label: 'VRAM Swap to RAM', desc: '实验性：让原生 Anima LoRA / LoRA-FA / VeRA / T-LoRA 适配器权重常驻 CPU RAM，前向时再按需拉回训练设备。更省显存，但通常更慢；暂不支持 LoKr、多进程、full_fp16/full_bf16 以及部分 8bit/paged 优化器', defaultValue: false },
      { key: 'cpu_offload_checkpointing', type: 'boolean', label: 'CPU Offload 梯度检查点', defaultValue: false },
      { key: 'cpu_offload_checkpointing_mode', type: 'select', label: 'CPU Offload 检查点模式', desc: 'standard 使用 save_on_cpu；pinned_async 使用固定内存 + 异步 CUDA 流传输（更快，显存换速度）。', defaultValue: 'standard', options: ['standard', 'pinned_async'], visibleWhen: when('cpu_offload_checkpointing', true) },
      { key: 'disable_mmap_load_safetensors', type: 'boolean', label: '禁用 mmap 加载', defaultValue: false },
      { key: 'pytorch_cuda_expandable_segments', type: 'boolean', label: '显存碎片优化', desc: '训练前自动设置 PYTORCH_ALLOC_CONF=expandable_segments:True，缓解显存碎片导致的 OOM', defaultValue: true },
      { key: 'gradient_release_enabled', type: 'boolean', label: '梯度释放', desc: '逐参数释放梯度以降低梯度显存峰值（基于 AdamA 论文）。后端默认开启。', defaultValue: true },
      { key: 'gradient_release_mode', type: 'select', label: '梯度释放模式', desc: 'compatible 兼容梯度累积（节省较小，默认）；post_step 为基线；full 立即释放（峰值显存省约 15-20%，但与梯度累积/裁剪/fp16 不兼容，冲突时后端自动降级为 compatible）。', defaultValue: 'compatible', options: ['compatible', 'post_step', 'full'], visibleWhen: when('gradient_release_enabled', true) },
    ],
  },
  {
    id: 'lulynx-experimental-core',
    tab: 'advanced',
    title: 'Lulynx 实验核心',
    description: 'SafeGuard、EMA、ResourceManager、BlockWeight (Anima 28层)、SmartRank、AutoController。',
    fields: [
      { key: 'lulynx_experimental_core_enabled', type: 'boolean', label: '启用 Lulynx 实验核心', desc: '集中管理 SafeGuard、EMA、ResourceManager、BlockWeight、SmartRank、AutoController、LISA、PCGrad、Pause、Prodigy Guard 与轻量监控', defaultValue: false },
      { key: 'lulynx_safeguard_enabled', type: 'boolean', label: '启用 SafeGuard', desc: '桥接到当前训练器的轻量安全防护，可拦截 NaN/Inf loss 与异常 spike', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
      { key: 'lulynx_safeguard_nan_check_interval', type: 'number', label: 'NaN 检查间隔', desc: '每 N 个优化 step 检查一次 NaN / Inf loss', defaultValue: 1, min: 1, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_safeguard_enabled', true)) },
      { key: 'lulynx_safeguard_max_nan_count', type: 'number', label: '最大连续 NaN', desc: '连续触发多少次 NaN / Inf 后直接停止训练', defaultValue: 3, min: 1, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_safeguard_enabled', true)) },
      { key: 'lulynx_safeguard_loss_spike_threshold', type: 'number', label: 'Loss Spike 阈值', desc: '当前 loss 超过滚动平均值多少倍时判定为 spike', defaultValue: 5.0, min: 1, step: 0.1, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_safeguard_enabled', true)) },
      { key: 'lulynx_safeguard_loss_window_size', type: 'number', label: 'Loss 窗口大小', desc: '判定 loss spike 的滚动窗口大小', defaultValue: 20, min: 2, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_safeguard_enabled', true)) },
      { key: 'lulynx_safeguard_auto_reduce_lr', type: 'boolean', label: '自动降学习率', desc: 'SafeGuard 触发时自动降低学习率', defaultValue: false, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_safeguard_enabled', true)) },
      { key: 'lulynx_safeguard_lr_reduction_factor', type: 'number', label: '降学习率倍率', desc: '自动降低学习率时使用的倍率', defaultValue: 0.5, min: 0.01, max: 1, step: 0.01, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_safeguard_enabled', true), when('lulynx_safeguard_auto_reduce_lr', true)) },
      { key: 'lulynx_ema_enabled', type: 'boolean', label: '启用 EMA', desc: '桥接到当前训练器的 EMA 实现，对训练参数做指数滑动平均', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
      { key: 'lulynx_ema_decay', type: 'number', label: 'EMA 衰减率', desc: '越接近 1 越平滑，常用 0.999~0.9999', defaultValue: 0.999, min: 0, max: 0.99999, step: 0.0001, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_ema_enabled', true)) },
      { key: 'lulynx_resource_manager_enabled', type: 'boolean', label: '启用 ResourceManager', desc: '监控显存占用并按设定节奏清理缓存，防止显存碎片累积', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
      { key: 'lulynx_resource_log_interval', type: 'number', label: '资源日志间隔', desc: '每 N 个优化 step 输出一次资源日志', defaultValue: 25, min: 1, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_resource_manager_enabled', true)) },
      { key: 'lulynx_block_weight_enabled', type: 'boolean', label: '启用 BlockWeight (28层)', desc: '按 Anima 主 transformer 28 层结构分配分层学习率', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
      { key: 'lulynx_anima_block_lr_weights', type: 'textarea', label: 'Anima 分层权重', desc: '共 28 层，blocks.0~blocks.27。设为 0 可冻结该层', defaultValue: ANIMA_BLOCK_WEIGHTS_28, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_block_weight_enabled', true)) },
      { key: 'lulynx_anima_llm_adapter_lr_weight', type: 'number', label: 'LLM Adapter 学习率倍率', desc: 'LLM Adapter 模块的学习率倍率', defaultValue: 1.0, step: 0.01, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_block_weight_enabled', true)) },
      { key: 'lulynx_anima_final_layer_lr_weight', type: 'number', label: 'final_layer 学习率倍率', desc: 'final_layer 模块的学习率倍率', defaultValue: 1.0, step: 0.01, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_block_weight_enabled', true)) },
      { key: 'lulynx_anima_norm_lr_weight', type: 'number', label: 'Norm 层学习率倍率', desc: '匹配 norm 层的学习率倍率', defaultValue: 1.0, step: 0.01, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_block_weight_enabled', true)) },
      { key: 'lulynx_smart_rank_enabled', type: 'boolean', label: '启用 SmartRank', desc: '周期性压缩低能量 rank 通道，减少冗余参数', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
      { key: 'lulynx_smart_rank_keep_ratio', type: 'number', label: '保留 Rank 比例', desc: '保留多少比例的 rank 通道。例如 0.75 表示裁掉最弱的 25%', defaultValue: 0.75, min: 0.05, max: 1, step: 0.01, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_smart_rank_enabled', true)) },
      { key: 'lulynx_auto_controller_enabled', type: 'boolean', label: '启用 AutoController', desc: '根据 loss 平台自动控速、降学习率或提前停止训练', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
      { key: 'lulynx_auto_check_every', type: 'number', label: '自动判断间隔', desc: '每 N 个优化 step 做一次 AutoController 判断', defaultValue: 50, min: 1, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_auto_controller_enabled', true)) },
      { key: 'lulynx_auto_early_stop_patience', type: 'number', label: '提前停止耐心值', desc: '连续多少次平台期后提前停止训练。数值越大越不容易提前停', defaultValue: 6, min: 1, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_auto_controller_enabled', true)) },
      { key: 'lulynx_pcgrad_enabled', type: 'boolean', label: '启用 PCGrad', desc: '实验性：在梯度累积边界对微批次梯度做冲突投影。默认关闭，建议按需手动启用。', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
      { key: 'lulynx_pcgrad_conflict_threshold', type: 'number', label: 'PCGrad 冲突阈值', desc: '余弦相似度低于该阈值时视为冲突。常用 0 或略小于 0。', defaultValue: 0.0, step: 0.01, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_pcgrad_enabled', true)) },
      { key: 'lulynx_pcgrad_reduction', type: 'select', label: 'PCGrad 聚合方式', desc: 'mean 更稳，sum 更接近未缩放累积。', defaultValue: 'mean', options: ['mean', 'sum'], visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_pcgrad_enabled', true)) },
      { key: 'hutchinson_auto_freeze', type: 'boolean', label: '启用 Hutchinson Auto-Freeze', desc: '实验性：训练前扫描可训练参数并冻结低熵层，同时写出报告。默认关闭。', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
      { key: 'hutchinson_freeze_ratio', type: 'number', label: 'Hutchinson 冻结比例', desc: '按低熵排序冻结多少比例的可训练张量。建议先从 0.1~0.3 试。', defaultValue: 0.5, min: 0, max: 1, step: 0.01, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('hutchinson_auto_freeze', true)) },
      { key: 'lulynx_hutchinson_probes', type: 'number', label: 'Hutchinson 探针数', desc: '探针越多越稳定但越慢。', defaultValue: 30, min: 1, step: 1, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('hutchinson_auto_freeze', true)) },
      { key: 'lulynx_geometric_lock', type: 'boolean', label: '启用 Geometric Lock', desc: '实验性：用特征流形约束保持结构。首次捕获作为 baseline，默认关闭。', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
      { key: 'lulynx_manifold_weight', type: 'number', label: 'Geometric Lock 权重', desc: '建议小权重起步，例如 0.005~0.02。', defaultValue: 0.01, min: 0, step: 0.001, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_geometric_lock', true)) },
      { key: 'lulynx_proj_dim', type: 'number', label: '投影维度', desc: '随机投影维度，越大越准但越耗算力。', defaultValue: 128, min: 1, step: 1, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_geometric_lock', true)) },
      { key: 'lulynx_manifold_sparse_freq', type: 'number', label: 'Geometric Lock 间隔', desc: '每 N 步计算一次约束，数值越大越省。', defaultValue: 1, min: 1, step: 1, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_geometric_lock', true)) },
      { key: 'lulynx_anchor_layers', type: 'string', label: '锚点层过滤', desc: '逗号分隔的模块名片段。留空时自动选择 mid/double/single 关键层。', defaultValue: '', visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_geometric_lock', true)) },
      { key: 'lulynx_ghost_replay', type: 'boolean', label: '启用 Ghost Replay', desc: '实验性：读取离线指纹并在匹配层/时间步时追加蒸馏损失。默认关闭。', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
      { key: 'lulynx_ghost_path', type: 'string', label: 'Ghost 指纹路径', desc: '.lulynx 指纹文件路径。缺失时训练会自动跳过 replay。', defaultValue: '', visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_ghost_replay', true)) },
      { key: 'lulynx_ghost_interval', type: 'number', label: 'Ghost Replay 间隔', desc: '每 N 个 step 尝试一次 replay loss。', defaultValue: 100, min: 1, step: 1, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_ghost_replay', true)) },
      { key: 'lulynx_ghost_weight', type: 'number', label: 'Ghost Replay 权重', desc: '建议小权重起步，例如 0.01~0.05。', defaultValue: 0.05, min: 0, step: 0.001, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_ghost_replay', true)) },
    ],
  },
  {
    id: 'advanced-settings',
    tab: 'advanced',
    title: '其他设置',
    description: '噪声、随机种子与实验功能。',
    fields: [
      { key: 'noise_offset', type: 'number', label: '噪声偏移', defaultValue: '', step: 0.01 },
      { key: 'ddpm_timestep_sampling', type: 'select', label: 'DDPM 时间步采样', desc: '后端新增：DDPM/标准扩散时间步采样策略。low_snr_bias 可与 FasterDiT SNR 权重配合；留空保持旧默认。', defaultValue: '', options: DDPM_TIMESTEP_SAMPLING_OPTIONS },
      { key: 'seed', type: 'number', label: '随机种子', defaultValue: 1337 },
      { key: 'masked_loss', type: 'boolean', label: '启用蓬版损失', defaultValue: false },
      { key: 'alpha_mask', type: 'boolean', label: '读取 Alpha 通道作 Mask', defaultValue: false },
      { key: 'wavelet_loss_enabled', type: 'boolean', label: '启用 Wavelet Loss', desc: '实验性：叠加多尺度 wavelet 细节损失', defaultValue: false },
      { key: 'wavelet_loss_weight', type: 'number', label: 'Wavelet Loss 权重', defaultValue: 0.05, min: 0, step: 0.01, visibleWhen: when('wavelet_loss_enabled', true) },
      { key: 'wavelet_loss_levels', type: 'number', label: 'Wavelet 层数', defaultValue: 1, min: 1, max: 4, step: 1, visibleWhen: when('wavelet_loss_enabled', true) },
      { key: 'wavelet_loss_approx_weight', type: 'number', label: 'Wavelet 低频权重', defaultValue: 0, min: 0, step: 0.01, visibleWhen: when('wavelet_loss_enabled', true) },
      { key: 'training_comment', type: 'textarea', label: '训练备注', defaultValue: '' },
      { key: 'custom_toml', type: 'textarea', label: '自定义 TOML', desc: '附加 TOML 覆盖（高级，谨慎使用）。', defaultValue: '' },
      { key: 'ui_custom_params', type: 'textarea', label: '自定义 TOML 覆盖', desc: '危险：直接覆盖界面参数。', defaultValue: '' },
    ],
  },
  {
    id: 'distributed-settings',
    tab: 'advanced',
    title: '分布式训练',
    description: '多 GPU / 多机分布式训练配置。',
    fields: [
      { key: 'enable_distributed_training', type: 'boolean', label: '启用分布式训练', desc: '启用分布式启动', defaultValue: false },
      { key: 'num_processes', type: 'number', label: '进程数', desc: '每台机器启动的训练进程数', defaultValue: '', min: 1, visibleWhen: when('enable_distributed_training', true) },
      { key: 'num_machines', type: 'number', label: '机器数', defaultValue: 1, min: 1, visibleWhen: when('enable_distributed_training', true) },
      { key: 'machine_rank', type: 'number', label: '当前机器编号', defaultValue: 0, min: 0, visibleWhen: when('enable_distributed_training', true) },
      { key: 'main_process_ip', type: 'string', label: '主节点 IP', defaultValue: '', visibleWhen: when('enable_distributed_training', true) },
      { key: 'main_process_port', type: 'number', label: '主节点端口', defaultValue: 29500, min: 1, max: 65535, visibleWhen: when('enable_distributed_training', true) },
      { key: 'nccl_socket_ifname', type: 'string', label: 'NCCL 网卡名', defaultValue: '', visibleWhen: when('enable_distributed_training', true) },
      { key: 'gloo_socket_ifname', type: 'string', label: 'Gloo 网卡名', defaultValue: '', visibleWhen: when('enable_distributed_training', true) },
      { key: 'sync_config_from_main', type: 'boolean', label: '从主节点同步配置', defaultValue: true, visibleWhen: when('enable_distributed_training', true) },
      { key: 'sync_missing_assets_from_main', type: 'boolean', label: '从主节点补齐资源', defaultValue: true, visibleWhen: when('enable_distributed_training', true) },
      { key: 'clear_dataset_npz_before_train', type: 'boolean', label: '训练前清除缓存', defaultValue: false, visibleWhen: when('enable_distributed_training', true) },
      { key: 'ddp_timeout', type: 'number', label: 'DDP 超时', defaultValue: '', min: 0, visibleWhen: when('enable_distributed_training', true) },
      { key: 'ddp_static_graph', type: 'boolean', label: 'DDP Static Graph', defaultValue: false, visibleWhen: when('enable_distributed_training', true) },
    ],
  },
];

const ANIMA_CONDITIONAL_KEYS = new Set([
  'lora_type', 'enable_preview', 'save_state', 'prefer_json_caption',
  'lr_scheduler', 'optimizer_type', 'optimizer_backend', 'advanced_optimizer_strategy',
  'fp8_base', 'weight_compression_enabled', 'activation_compression_enabled',
  'anima_block_residency',
  'anima_block_prefetch',
  'performance_expert_mode',
  '__ui_group_compile_expert_collapsed',
  'cross_attn_fused_kv',
  'anima_fused_qkv',
  'fused_projection_memory_mode',
  'image_decode_backend',
  'data_backend',
  'loss_precision',
  'compile_runtime',
  'compile_shape_strategy',
  'compile_target_strategy',
  'cached_collate_mode',
  'checkpoint_policy',
  'experimental_attention_profile_enabled',
  'experimental_attention_profile_backend',
  'data_transfer_profile_enabled',
  'cuda_cache_release_strategy',
  'lulynx_experimental_core_enabled', 'lulynx_safeguard_enabled',
  'lulynx_ema_enabled', 'lulynx_resource_manager_enabled',
  'lulynx_block_weight_enabled', 'lulynx_smart_rank_enabled',
  'lulynx_auto_controller_enabled', 'lulynx_pcgrad_enabled', 'lulynx_safeguard_auto_reduce_lr',
  'enable_distributed_training', 'wavelet_loss_enabled',
  'caption_source_mix_enabled',
  'concept_geometry_enabled', 'concept_geometry_semantic_enabled',
  'concept_geometry_embedding_provider', 'concept_geometry_translation_enabled',
  'concept_geometry_translation_provider',
  'cpu_offload_checkpointing',
  'gradient_release_enabled',
  'anima_block_checkpointing',
]);

export const ANIMA_LORA_SCHEMA = {
  key: 'anima-lora',
  label: 'Anima LoRA',
  trainType: 'anima-lora',
  tabs: ANIMA_TABS,
  sections: ANIMA_SECTIONS,
  conditionalKeys: ANIMA_CONDITIONAL_KEYS,
};


