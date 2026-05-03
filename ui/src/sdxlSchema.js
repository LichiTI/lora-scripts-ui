// ================================================================
// sdxlSchema.js — 多训练类型 Schema 系统
// 支持: LoRA / Finetune / ControlNet / Textual Inversion 全系列
// ================================================================

import {
  ALL_OPTIMIZERS,
  ALL_SCHEDULERS,
  SCHEDULER_VALUE_TO_TYPE,
} from './features/settingsOptions.js';

export const UI_TABS = [
  { key: 'model', label: '模型' },
  { key: 'dataset', label: '数据集' },
  { key: 'network', label: '网络' },
  { key: 'optimizer', label: '优化器' },
  { key: 'training', label: '训练' },
  { key: 'preview', label: '预览/验证' },
  { key: 'speed', label: '加速' },
  { key: 'advanced', label: '高级' },
];

function when(key, expected) { return (c) => c[key] === expected; }
function all(...fns) { return (c) => fns.every((f) => f(c)); }

const STANDARD_SCHEDULERS = [
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
  'warmup_stable_decay',
  'piecewise_constant',
];

// ================================================================
// 训练类型注册表
// ================================================================
export const TRAINING_TYPES = [
  // LoRA
  { id: 'sdxl-lora',          group: 'LoRA',              label: 'SDXL' },
  { id: 'anima-lora',         group: 'LoRA',              label: 'Anima' },
  { id: 'newbie-lora',        group: 'LoRA',              label: 'Newbie (实验)' },
  { id: 'flux-lora',          group: 'LoRA',              label: 'FLUX' },
  { id: 'sd3-lora',           group: 'LoRA',              label: 'SD3' },
  { id: 'lumina-lora',        group: 'LoRA',              label: 'Lumina' },
  { id: 'hunyuan-image-lora', group: 'LoRA',              label: '混元图像' },
  { id: 'sd-lora',            group: 'LoRA',              label: 'SD 1.5' },
  // Finetune
  { id: 'sdxl-finetune',      group: 'Finetune',          label: 'SDXL' },
  { id: 'anima-finetune',     group: 'Finetune',          label: 'Anima' },
  { id: 'flux-finetune',      group: 'Finetune',          label: 'FLUX' },
  { id: 'sd3-finetune',       group: 'Finetune',          label: 'SD3' },
  { id: 'lumina-finetune',    group: 'Finetune',          label: 'Lumina' },
  { id: 'sd-dreambooth',      group: 'Finetune',          label: 'SD DreamBooth' },
  // ControlNet
  { id: 'sd-controlnet',      group: 'ControlNet',        label: 'SD 1.5' },
  { id: 'sdxl-controlnet',    group: 'ControlNet',        label: 'SDXL' },
  { id: 'flux-controlnet',    group: 'ControlNet',        label: 'FLUX' },
  // Textual Inversion
  { id: 'sd-textual-inversion',   group: 'Textual Inversion', label: 'SD 1.5 TI' },
  { id: 'sdxl-textual-inversion', group: 'Textual Inversion', label: 'SDXL TI' },
  // 其他模型训练
  { id: 'yolo',                group: '其他模型训练',      label: 'YOLO 模型训练' },
  { id: 'aesthetic-scorer',    group: '其他模型训练',      label: '美学评分模型训练' },
];

// ================================================================
// 共享字段片段
// ================================================================
const S_SAVE = [
  { key: 'output_name', type: 'string', label: '模型保存名称（output_name）', desc: '模型保存名称', defaultValue: 'aki' },
  { key: 'output_dir', type: 'folder', pickerType: 'folder', label: '模型保存文件夹（output_dir）', desc: '模型保存文件夹', defaultValue: './output' },
  { key: 'save_model_as', type: 'select', label: '保存格式（save_model_as）', desc: '模型保存格式', defaultValue: 'safetensors', options: ['safetensors', 'pt', 'ckpt'] },
  { key: 'save_precision', type: 'select', label: '保存精度（save_precision）', desc: '模型保存精度', defaultValue: 'fp16', options: ['fp16', 'float', 'bf16'] },
  { key: 'save_every_n_epochs', type: 'number', label: '每 N 轮保存（save_every_n_epochs）', desc: '每 N epoch（轮）自动保存一次模型', defaultValue: 2, min: 1 },
  { key: 'save_every_n_steps', type: 'number', label: '每 N 步保存（save_every_n_steps）', desc: '每 N 步自动保存一次模型', defaultValue: '', min: 1 },
  { key: 'save_state', type: 'boolean', label: '保存训练状态（save_state）', desc: '保存训练状态 配合 resume 参数可以继续从某个状态训练', defaultValue: false },
  { key: 'save_state_on_train_end', type: 'boolean', label: '结束时额外保存状态（save_state_on_train_end）', desc: '训练结束时额外保存一次训练状态', defaultValue: false },
  { key: 'save_last_n_epochs_state', type: 'number', label: '保留最近 N 个 epoch 状态（save_last_n_epochs_state）', desc: '仅保存最后 n epoch 的训练状态', defaultValue: '', min: 1, visibleWhen: when('save_state', true) },
  { key: 'save_last_n_steps_state', type: 'number', label: '保留最近 N 步状态（save_last_n_steps_state）', desc: '仅保留最近 N 步范围内的训练状态', defaultValue: '', min: 1, visibleWhen: when('save_state', true) },
  { key: 'save_n_epoch_ratio', type: 'number', label: '按比例保存（save_n_epoch_ratio）', desc: '按 epoch 比例保存，保证整个训练阶段至少保存 N 份模型', defaultValue: '', min: 1 },
  { key: 'save_last_n_epochs', type: 'number', label: '仅保留最近 N 轮模型（save_last_n_epochs）', desc: '仅保留最近 N 个按 epoch 保存的模型', defaultValue: '', min: 1 },
  { key: 'save_last_n_steps', type: 'number', label: '仅保留最近 N 步模型（save_last_n_steps）', desc: '仅保留最近 N 步范围内的按 step 保存模型', defaultValue: '', min: 1 },
  { key: 'log_with', type: 'select', label: '日志模块（log_with）', desc: '日志模块', defaultValue: 'tensorboard', options: ['tensorboard', 'wandb'] },
  { key: 'logging_dir', type: 'folder', pickerType: 'folder', label: '日志保存文件夹（logging_dir）', desc: '日志保存文件夹', defaultValue: './logs' },
  { key: 'log_prefix', type: 'string', label: '日志前缀（log_prefix）', desc: '日志前缀', defaultValue: '' },
  { key: 'log_tracker_name', type: 'string', label: '追踪器名称（log_tracker_name）', desc: '日志追踪器名称', defaultValue: '' },
 { key: 'wandb_run_name', type: 'string', label: 'WandB 运行名称（wandb_run_name）', desc: 'wandb 单次运行显示名称', defaultValue: '', visibleWhen: when('log_with', 'wandb') },
  { key: 'wandb_api_key', type: 'string', label: 'WandB API Key', desc: 'wandb 的 api 密钥', defaultValue: '', visibleWhen: when('log_with', 'wandb') },
  { key: 'log_tracker_config', type: 'file', pickerType: 'model-file', label: '追踪器配置文件（log_tracker_config）', desc: '日志追踪器配置文件路径', defaultValue: '' },
];
const S_CAPTION = [
  { key: 'caption_extension', type: 'string', label: 'Tag 文件扩展名（caption_extension）', desc: 'Tag 文件扩展名', defaultValue: '.txt' },
  { key: 'shuffle_caption', type: 'boolean', label: '随机打乱标签（shuffle_caption）', desc: '训练时随机打乱 tokens', defaultValue: false },
  { key: 'weighted_captions', type: 'boolean', label: '使用带权重 token（weighted_captions）', desc: '使用带权重的 token，不推荐与 shuffle_caption 一同开启', defaultValue: false },
  { key: 'keep_tokens', type: 'number', label: '保留前 N 个 token（keep_tokens）', desc: '在随机打乱 tokens 时，保留前 N 个不变', defaultValue: 0, min: 0, max: 255 },
  { key: 'max_token_length', type: 'number', label: '最大 token 长度（max_token_length）', desc: '最大 token 长度', defaultValue: 255, min: 1 },
  { key: 'caption_dropout_rate', type: 'number', label: '全部标签丢弃概率（caption_dropout_rate）', desc: '丢弃全部标签的概率，对一个图片概率不使用 caption 或 class token', defaultValue: '', min: 0, step: 0.01 },
  { key: 'keep_tokens_separator', type: 'string', label: '保留 token 分隔符（keep_tokens_separator）', desc: '保留 tokens 时使用的分隔符', defaultValue: '' },
  { key: 'caption_dropout_every_n_epochs', type: 'number', label: '每 N 轮丢弃标签（caption_dropout_every_n_epochs）', desc: '每 N 个 epoch 丢弃全部标签', defaultValue: '', min: 0, max: 100, step: 1 },
  { key: 'caption_tag_dropout_rate', type: 'number', label: '按标签丢弃概率（caption_tag_dropout_rate）', desc: '按逗号分隔的标签来随机丢弃 tag 的概率', defaultValue: '', min: 0, step: 0.01 },
  { key: 'caption_tag_dropout_targets', type: 'textarea', label: '指定丢弃 Tag 列表（caption_tag_dropout_targets）', desc: '指定要处理的 tag 列表。一行一个，也支持逗号分隔', defaultValue: '' },
  { key: 'caption_tag_dropout_target_mode', type: 'select', label: '指定 Tag 处理方式（caption_tag_dropout_target_mode）', desc: 'drop_all 全部移除，random_n 仅在命中 tag 中随机丢弃 N 个', defaultValue: 'drop_all', options: ['drop_all', 'random_n'] },
  { key: 'caption_tag_dropout_target_count', type: 'number', label: '随机丢弃数量（caption_tag_dropout_target_count）', desc: '处理方式为 random_n 时，每张图随机丢弃多少个命中 tag', defaultValue: 1, min: 1, step: 1, visibleWhen: when('caption_tag_dropout_target_mode', 'random_n') },
];
const S_LR = [
  { key: 'learning_rate', type: 'string', label: '总学习率（learning_rate）', desc: '总学习率, 在分开设置 U-Net 与文本编码器学习率后这个值失效。', defaultValue: '1e-4' },
  { key: 'unet_lr', type: 'string', label: 'U-Net 学习率（unet_lr）', desc: 'U-Net 学习率', defaultValue: '1e-4' },
  { key: 'text_encoder_lr', type: 'string', label: '文本编码器学习率（text_encoder_lr）', desc: '文本编码器学习率', defaultValue: '1e-5' },
  { key: 'weight_decay', type: 'number', label: '权重衰减（weight_decay）', desc: '权重衰减（等价于自动注入 optimizer_args: weight_decay=...）', defaultValue: '', step: 0.0001 },
  { key: 'lr_scheduler', type: 'select', label: '学习率调度器（lr_scheduler）', desc: '学习率调度器设置；选择 torch.optim.* / pytorch_optimizer.* 等自定义项时会自动写入 lr_scheduler_type', defaultValue: 'cosine_with_restarts', options: ALL_SCHEDULERS },
  { key: 'lr_warmup_steps', type: 'number', label: '预热步数（lr_warmup_steps）', desc: '学习率预热步数', defaultValue: 0, min: 0 },
  { key: 'lr_scheduler_num_cycles', type: 'number', label: '重启次数（lr_scheduler_num_cycles）', desc: '重启次数', defaultValue: 1, min: 1, visibleWhen: when('lr_scheduler', 'cosine_with_restarts') },
  { key: 'optimizer_type', type: 'select', label: '优化器（optimizer_type）', desc: '优化器设置。pytorch_optimizer.* / bitsandbytes.optim.* 会按完整类路径传给后端', defaultValue: 'AdamW8bit', options: ALL_OPTIMIZERS },
  { key: 'min_snr_gamma', type: 'number', label: 'Min-SNR Gamma', desc: '最小信噪比伽马值, 如果启用推荐为 5', defaultValue: '', min: 0, step: 0.1 },
  { key: 'prodigy_d0', type: 'string', label: 'Prodigy d0', desc: 'Prodigy 初始步长估计。留空使用默认值', defaultValue: '', visibleWhen: when('optimizer_type', 'Prodigy') },
  { key: 'prodigy_d_coef', type: 'string', label: 'Prodigy d_coef', desc: 'Prodigy d 系数，影响自适应学习率大小', defaultValue: '2.0', visibleWhen: when('optimizer_type', 'Prodigy') },
  { key: 'lr_scheduler_type', type: 'string', label: '自定义调度器类（lr_scheduler_type）', desc: '自定义学习率调度器类路径。填写后优先于上方调度器，如 torch.optim.lr_scheduler.CosineAnnealingLR', defaultValue: '' },
  { key: 'lr_scheduler_args', type: 'textarea', label: '自定义调度器参数（lr_scheduler_args）', desc: '自定义学习率调度器参数，一行一个 key=value', defaultValue: '' },
  { key: 'optimizer_args_custom', type: 'textarea', label: '自定义 optimizer_args（optimizer_args_custom）', desc: '自定义优化器参数，每行一个 key=value（如 decouple=True）。Prodigy 默认已自动填充标准参数', defaultValue: '' },
];
const S_TRAIN = (epochs = 10) => [
  { key: 'max_train_epochs', type: 'number', label: '最大训练轮数（max_train_epochs）', desc: '最大训练 epoch（轮数）', defaultValue: epochs, min: 1 },
  { key: 'train_batch_size', type: 'slider', label: '批量大小（train_batch_size）', desc: '批量大小。数值越高显存占用越高。', defaultValue: 1, min: 1, max: 32, step: 1 },
  { key: 'gradient_checkpointing', type: 'boolean', label: '梯度检查点（gradient_checkpointing）', desc: '梯度检查点', defaultValue: true },
  { key: 'gradient_accumulation_steps', type: 'number', label: '梯度累加步数（gradient_accumulation_steps）', desc: '梯度累加步数', defaultValue: 1, min: 1 },
  { key: 'network_train_unet_only', type: 'boolean', label: '仅训练 U-Net / DiT（network_train_unet_only）', desc: '仅训练 U-Net / DiT', defaultValue: true },
  { key: 'network_train_text_encoder_only', type: 'boolean', label: '仅训练文本编码器（network_train_text_encoder_only）', desc: '仅训练文本编码器', defaultValue: false },
];
const S_PREVIEW = [
  { key: 'enable_preview', type: 'boolean', label: '启用预览图（enable_preview）', desc: '启用训练预览图', defaultValue: false },
  { key: 'sample_every_n_epochs', type: 'number', label: '每 N 轮生成预览（sample_every_n_epochs）', desc: '每训练 N 个 epoch 生成一次预览图。留空则仅在 epoch 结束时按默认频率生成', defaultValue: '', min: 1, visibleWhen: when('enable_preview', true) },
  { key: 'sample_every_n_steps', type: 'number', label: '每 N 步生成预览（sample_every_n_steps）', desc: '每训练 N 步生成一次预览图（优先于按 epoch）。留空不启用', defaultValue: '', min: 1, visibleWhen: when('enable_preview', true) },
  { key: 'sample_at_first', type: 'boolean', label: '训练前先生成预览（sample_at_first）', desc: '训练开始前先生成一张预览图，可用于确认提示词效果', defaultValue: false, visibleWhen: when('enable_preview', true) },
  { key: 'randomly_choice_prompt', type: 'boolean', label: '随机选择提示词（randomly_choice_prompt）', desc: '随机选择预览图 Prompt', defaultValue: false, visibleWhen: when('enable_preview', true) },
  { key: 'prompt_file', type: 'file', pickerType: 'text-file', label: '提示词文件路径（prompt_file）', desc: '预览图 Prompt 文件路径。填写后将采用文件内的 prompt。', defaultValue: '', visibleWhen: when('enable_preview', true) },
  { key: 'positive_prompts', type: 'textarea', label: '正向提示词（positive_prompts）', desc: '正向提示词', defaultValue: 'masterpiece, best quality, 1girl, solo', visibleWhen: when('enable_preview', true) },
  { key: 'negative_prompts', type: 'textarea', label: '反向提示词（negative_prompts）', desc: '反向提示词', defaultValue: 'lowres, bad anatomy, bad hands, text, error', visibleWhen: when('enable_preview', true) },
  { key: 'sample_width', type: 'number', label: '预览图宽度（sample_width）', desc: '预览图宽', defaultValue: 512, min: 64, visibleWhen: when('enable_preview', true) },
  { key: 'sample_height', type: 'number', label: '预览图高度（sample_height）', desc: '预览图高', defaultValue: 512, min: 64, visibleWhen: when('enable_preview', true) },
  { key: 'sample_cfg', type: 'number', label: 'CFG 系数（sample_cfg）', desc: 'CFG Scale', defaultValue: 7, min: 1, max: 30, visibleWhen: when('enable_preview', true) },
  { key: 'sample_steps', type: 'number', label: '采样步数（sample_steps）', desc: '迭代步数', defaultValue: 24, min: 1, max: 300, visibleWhen: when('enable_preview', true) },
  { key: 'sample_seed', type: 'number', label: '预览图种子（sample_seed）', desc: '预览图随机种子。0 或留空表示每次随机', defaultValue: '', min: 0, visibleWhen: when('enable_preview', true) },
  { key: 'sample_sampler', type: 'select', label: '采样器（sample_sampler）', desc: '生成预览图所用采样器', defaultValue: 'euler_a', options: ['ddim', 'pndm', 'lms', 'euler', 'euler_a', 'heun', 'dpm_2', 'dpm_2_a', 'dpmsolver', 'dpmsolver++'], visibleWhen: when('enable_preview', true) },
  { key: 'random_prompt_include_subdirs', type: 'boolean', label: '从子目录随机选择（random_prompt_include_subdirs）', desc: '从 train_data_dir 下所有子目录随机选择 Prompt', defaultValue: false, visibleWhen: all(when('enable_preview', true), when('randomly_choice_prompt', true)) },
];
const S_SPEED_SDXL = [
  { key: 'mixed_precision', type: 'select', label: '混合精度（mixed_precision）', desc: '训练混合精度, RTX30系列以后也可以指定 bf16', defaultValue: 'bf16', options: ['no', 'fp16', 'bf16'] },
  { key: 'xformers', type: 'boolean', label: '启用 xformers（xformers）', desc: '启用 xformers', defaultValue: true },
  { key: 'sdpa', type: 'boolean', label: '启用 SDPA（sdpa）', desc: '启用 sdpa', defaultValue: true },
  { key: 'sageattn', type: 'boolean', label: '启用 SageAttention（sageattn）', desc: '启用 SageAttention（实验性）', defaultValue: false },
  { key: 'experimental_attention_profile_enabled', type: 'boolean', label: '步骤耗时统计（experimental_attention_profile_enabled）', desc: '步骤耗时窗口统计开关。默认关闭，仅在诊断训练速度/瓶颈时建议开启', defaultValue: false },
  { key: 'experimental_attention_profile_window', type: 'number', label: '统计窗口 (步)（experimental_attention_profile_window）', desc: '每 N 个优化步输出一次聚合耗时摘要', defaultValue: 50, min: 1, visibleWhen: when('experimental_attention_profile_enabled', true) },
  { key: 'flashattn', type: 'boolean', label: '启用 FlashAttention 2（flashattn）', desc: '启用 FlashAttention 2（实验性，需要 FlashAttention 运行时）', defaultValue: false },
  { key: 'cross_attn_fused_kv', type: 'boolean', label: '启用 Fused K/V（cross_attn_fused_kv）', desc: '启用 SDXL cross-attn 的 fused K/V projection 实验开关', defaultValue: false },
  { key: 'mem_eff_attn', type: 'boolean', label: '低显存注意力（mem_eff_attn）', desc: '启用省显存 attention（比 xformers 更兼容，但通常更慢）', defaultValue: false },
  { key: 'lowram', type: 'boolean', label: '低内存模式（lowram）', desc: '低内存模式 该模式下会将 U-net、文本编码器、VAE 直接加载到显存中', defaultValue: false },
  { key: 'cache_latents', type: 'boolean', label: '缓存 Latent（cache_latents）', desc: '缓存图像 latent, 缓存 VAE 输出以减少 VRAM 使用', defaultValue: true },
  { key: 'cache_latents_to_disk', type: 'boolean', label: '缓存 Latent 到磁盘（cache_latents_to_disk）', desc: '缓存图像 latent 到磁盘', defaultValue: true },
  { key: 'latent_cache_disk_format', type: 'select', label: 'Latent 缓存格式（latent_cache_disk_format）', desc: 'latent 磁盘缓存格式。默认 safetensors；若已有旧缓存会自动兼容读取 npz', defaultValue: 'safetensors', options: ['safetensors', 'npz'] },
  { key: 'cache_text_encoder_outputs', type: 'boolean', label: '缓存文本编码器输出（cache_text_encoder_outputs）', desc: '缓存文本编码器的输出，减少显存使用。⚠️ 启用时必须关闭「随机打乱标签」「全部标签丢弃概率」和「按标签丢弃概率」', defaultValue: true },
  { key: 'cache_text_encoder_outputs_to_disk', type: 'boolean', label: '缓存文本编码器输出到磁盘（cache_text_encoder_outputs_to_disk）', desc: '缓存文本编码器的输出到磁盘', defaultValue: false },
  { key: 'full_fp16', type: 'boolean', label: '完全 FP16（full_fp16）', desc: '完全使用 FP16 精度', defaultValue: false },
  { key: 'full_bf16', type: 'boolean', label: '完全 BF16（full_bf16）', desc: '完全使用 BF16 精度', defaultValue: false },
  { key: 'no_half_vae', type: 'boolean', label: '不使用半精度 VAE（no_half_vae）', desc: '不使用半精度 VAE', defaultValue: false },
  { key: 'persistent_data_loader_workers', type: 'boolean', label: '保持数据加载器（persistent_data_loader_workers）', desc: '保留加载训练集的 worker，减少每个 epoch 之间的停顿', defaultValue: true },
  { key: 'vae_batch_size', type: 'number', label: 'VAE 编码批量（vae_batch_size）', desc: 'VAE 编码批量大小', defaultValue: '', min: 1 },
  { key: 'torch_compile', type: 'boolean', label: '启用 torch.compile（torch_compile）', desc: '实验性：启用 PyTorch torch.compile，部分环境可提升训练吞吐。首次编译会更慢，后续迭代加速明显。⚠️ 默认 inductor 后端依赖 Triton，若报错可改用 eager 后端或关闭此项', defaultValue: false },
  { key: 'dynamo_backend', type: 'select', label: 'torch.compile 后端（dynamo_backend）', desc: 'torch.compile 后端。inductor 为默认推荐；cudagraphs 适合固定形状输入；eager/aot_eager 用于调试', defaultValue: 'inductor', options: ['eager', 'aot_eager', 'inductor', 'cudagraphs'], visibleWhen: when('torch_compile', true) },
  { key: 'cpu_offload_checkpointing', type: 'boolean', label: 'CPU 卸载检查点（cpu_offload_checkpointing）', desc: '梯度检查点时将部分张量卸载到 CPU，节省显存', defaultValue: false },
  { key: 'pytorch_cuda_expandable_segments', type: 'boolean', label: '显存碎片优化（pytorch_cuda_expandable_segments）', desc: '训练前自动设置 PYTORCH_ALLOC_CONF=expandable_segments:True，缓解显存碎片导致的 OOM。一般对速度影响很小', defaultValue: true },
];
const S_SPEED_FLOW = [
  { key: 'mixed_precision', type: 'select', label: '混合精度（mixed_precision）', desc: '训练混合精度, RTX30系列以后也可以指定 bf16', defaultValue: 'bf16', options: ['no', 'fp16', 'bf16'] },
  { key: 'fp8_base', type: 'boolean', label: '基础模型使用 FP8（fp8_base）', desc: '基础模型使用 FP8 精度', defaultValue: true },
  { key: 'sdpa', type: 'boolean', label: '启用 SDPA（sdpa）', desc: '启用 sdpa', defaultValue: true },
  { key: 'sageattn', type: 'boolean', label: '启用 SageAttention（sageattn）', desc: '启用 SageAttention（实验性）', defaultValue: false },
  { key: 'experimental_attention_profile_enabled', type: 'boolean', label: '步骤耗时统计（experimental_attention_profile_enabled）', desc: '步骤耗时窗口统计开关。默认关闭，仅在诊断训练速度/瓶颈时建议开启', defaultValue: false },
  { key: 'experimental_attention_profile_window', type: 'number', label: '统计窗口 (步)（experimental_attention_profile_window）', desc: '每 N 个优化步输出一次聚合耗时摘要', defaultValue: 50, min: 1, visibleWhen: when('experimental_attention_profile_enabled', true) },
  { key: 'flashattn', type: 'boolean', label: '启用 FlashAttention 2（flashattn）', desc: '启用 FlashAttention 2（实验性，需要 FlashAttention 运行时）', defaultValue: false },
  { key: 'mem_eff_attn', type: 'boolean', label: '低显存注意力（mem_eff_attn）', desc: '启用省显存 attention（比 xformers 更兼容，但通常更慢）', defaultValue: false },
  { key: 'lowram', type: 'boolean', label: '低内存模式（lowram）', desc: '低内存模式 该模式下会将 U-net、文本编码器、VAE 直接加载到显存中', defaultValue: false },
  { key: 'cache_latents', type: 'boolean', label: '缓存 Latent（cache_latents）', desc: '缓存图像 latent, 缓存 VAE 输出以减少 VRAM 使用', defaultValue: true },
  { key: 'cache_latents_to_disk', type: 'boolean', label: '缓存 Latent 到磁盘（cache_latents_to_disk）', desc: '缓存图像 latent 到磁盘', defaultValue: true },
  { key: 'latent_cache_disk_format', type: 'select', label: 'Latent 缓存格式（latent_cache_disk_format）', desc: 'latent 磁盘缓存格式。默认 safetensors；若已有旧缓存会自动兼容读取 npz', defaultValue: 'safetensors', options: ['safetensors', 'npz'] },
  { key: 'cache_text_encoder_outputs', type: 'boolean', label: '缓存文本编码器输出（cache_text_encoder_outputs）', desc: '缓存文本编码器的输出，减少显存使用。⚠️ 启用时必须关闭「随机打乱标签」「全部标签丢弃概率」和「按标签丢弃概率」', defaultValue: true },
  { key: 'cache_text_encoder_outputs_to_disk', type: 'boolean', label: '缓存文本编码器输出到磁盘（cache_text_encoder_outputs_to_disk）', desc: '缓存文本编码器的输出到磁盘', defaultValue: true },
  { key: 'blocks_to_swap', type: 'number', label: 'Block 交换数（blocks_to_swap）', desc: '在 CPU/GPU 间交换的 block 数量，省显存。', defaultValue: '', min: 1 },
  { key: 'fp8_base_unet', type: 'boolean', label: '仅 U-Net FP8（fp8_base_unet）', desc: '仅对 U-Net / DiT 使用 FP8 精度', defaultValue: false },
  { key: 'text_encoder_batch_size', type: 'number', label: '文本编码器缓存批量（text_encoder_batch_size）', desc: '文本编码器缓存批量大小', defaultValue: '', min: 1 },
  { key: 'disable_mmap_load_safetensors', type: 'boolean', label: '禁用 mmap 加载（disable_mmap_load_safetensors）', desc: '禁用 mmap 方式加载 safetensors，减少共享内存占用', defaultValue: false },
  { key: 'full_fp16', type: 'boolean', label: '完全 FP16（full_fp16）', desc: '完全使用 FP16 精度', defaultValue: false },
  { key: 'full_bf16', type: 'boolean', label: '完全 BF16（full_bf16）', desc: '完全使用 BF16 精度', defaultValue: false },
  { key: 'no_half_vae', type: 'boolean', label: '不使用半精度 VAE（no_half_vae）', desc: '不使用半精度 VAE', defaultValue: false },
  { key: 'persistent_data_loader_workers', type: 'boolean', label: '保持数据加载器（persistent_data_loader_workers）', desc: '保留加载训练集的 worker，减少每个 epoch 之间的停顿', defaultValue: true },
  { key: 'vae_batch_size', type: 'number', label: 'VAE 编码批量（vae_batch_size）', desc: 'VAE 编码批量大小', defaultValue: '', min: 1 },
  { key: 'torch_compile', type: 'boolean', label: '启用 torch.compile（torch_compile）', desc: '实验性：启用 PyTorch torch.compile，部分环境可提升训练吞吐。首次编译会更慢，后续迭代加速明显。⚠️ 默认 inductor 后端依赖 Triton，若报错可改用 eager 后端或关闭此项', defaultValue: false },
  { key: 'dynamo_backend', type: 'select', label: 'torch.compile 后端（dynamo_backend）', desc: 'torch.compile 后端。inductor 为默认推荐；cudagraphs 适合固定形状输入；eager/aot_eager 用于调试', defaultValue: 'inductor', options: ['eager', 'aot_eager', 'inductor', 'cudagraphs'], visibleWhen: when('torch_compile', true) },
  { key: 'cpu_offload_checkpointing', type: 'boolean', label: 'CPU 卸载检查点（cpu_offload_checkpointing）', desc: '梯度检查点时将部分张量卸载到 CPU省显存', defaultValue: false },
  { key: 'pytorch_cuda_expandable_segments', type: 'boolean', label: '显存碎片优化（pytorch_cuda_expandable_segments）', desc: '训练前自动设置 PYTORCH_ALLOC_CONF=expandable_segments:True，缓解显存碎片导致的 OOM。一般对速度影响很小', defaultValue: true },
];
const S_DISTRIBUTED = [
  { key: 'enable_distributed_training', type: 'boolean', label: '启用分布式训练（enable_distributed_training）', desc: '启用分布式启动。当前为最小实现，支持多进程/多机拉起，以及 worker 最小配置与缺失资源同步', defaultValue: false },
  { key: 'num_processes', type: 'number', label: '进程数（num_processes）', desc: '每台机器启动的训练进程数。留空时会优先按所选 GPU 数量自动推断', defaultValue: '', min: 1, visibleWhen: when('enable_distributed_training', true) },
  { key: 'num_machines', type: 'number', label: '机器数（num_machines）', desc: '参与训练的机器总数', defaultValue: 1, min: 1, visibleWhen: when('enable_distributed_training', true) },
  { key: 'machine_rank', type: 'number', label: '当前机器编号（machine_rank）', desc: '当前机器编号，从 0 开始；主节点为 0', defaultValue: 0, min: 0, visibleWhen: when('enable_distributed_training', true) },
  { key: 'main_process_ip', type: 'string', label: '主节点 IP（main_process_ip）', desc: '主节点 IP 地址。多机训练时必填', defaultValue: '', visibleWhen: when('enable_distributed_training', true) },
  { key: 'main_process_port', type: 'number', label: '主节点端口（main_process_port）', desc: '主节点 rendezvous 端口', defaultValue: 29500, min: 1, max: 65535, visibleWhen: when('enable_distributed_training', true) },
  { key: 'nccl_socket_ifname', type: 'string', label: 'NCCL 网卡名（nccl_socket_ifname）', desc: '可选。NCCL 使用的网卡名，例如 Ethernet', defaultValue: '', visibleWhen: when('enable_distributed_training', true) },
  { key: 'gloo_socket_ifname', type: 'string', label: 'Gloo 网卡名（gloo_socket_ifname）', desc: '可选。Gloo 使用的网卡名，例如 Ethernet', defaultValue: '', visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_config_from_main', type: 'boolean', label: '从主节点同步配置（sync_config_from_main）', desc: '仅 worker 使用。从主节点同步训练配置', defaultValue: true, visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_config_keys_from_main', type: 'string', label: '同步配置键（sync_config_keys_from_main）', desc: '要从主节点同步的顶层配置键，逗号分隔。* = 同步全部', defaultValue: '*', visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_missing_assets_from_main', type: 'boolean', label: '从主节点补齐资源（sync_missing_assets_from_main）', desc: '仅 worker 使用。按需从主节点补齐缺失模型、数据集、resume 等路径', defaultValue: true, visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_asset_keys', type: 'string', label: '补齐资源键（sync_asset_keys）', desc: '要从主节点补齐的资源键，逗号分隔', defaultValue: 'pretrained_model_name_or_path,train_data_dir,reg_data_dir,vae,resume', visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_main_repo_dir', type: 'string', label: '主节点项目根目录（sync_main_repo_dir）', desc: '优先填写 worker 可直接访问的共享路径/UNC 路径', defaultValue: '', visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_main_toml', type: 'string', label: '主节点 TOML 路径（sync_main_toml）', desc: '主节点用于同步的 TOML 路径', defaultValue: './config/autosave/distributed-main-latest.toml', visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_ssh_user', type: 'string', label: 'SSH 用户名（sync_ssh_user）', desc: '远程同步时使用的 SSH 用户名', defaultValue: '', visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_ssh_port', type: 'number', label: 'SSH 端口（sync_ssh_port）', desc: '远程同步使用的 SSH 端口', defaultValue: 22, min: 1, max: 65535, visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_use_password_auth', type: 'boolean', label: 'SSH 密码认证（sync_use_password_auth）', desc: '远程同步时启用密码认证', defaultValue: false, visibleWhen: when('enable_distributed_training', true) },
  { key: 'sync_ssh_password', type: 'string', label: 'SSH 密码（sync_ssh_password）', desc: '远程同步密码。更推荐改用环境变量或共享路径', defaultValue: '', visibleWhen: all(when('enable_distributed_training', true), when('sync_use_password_auth', true)) },
  { key: 'clear_dataset_npz_before_train', type: 'boolean', label: '训练前清除缓存（clear_dataset_npz_before_train）', desc: 'worker 训练前清空 .npz 缓存和 metadata_cache.json', defaultValue: false, visibleWhen: when('enable_distributed_training', true) },
  { key: 'ddp_timeout', type: 'number', label: 'DDP 超时（ddp_timeout）', desc: '分布式训练超时时间（秒）', defaultValue: '', min: 0, visibleWhen: when('enable_distributed_training', true) },
  { key: 'ddp_gradient_as_bucket_view', type: 'boolean', label: 'DDP Bucket View', defaultValue: false, visibleWhen: when('enable_distributed_training', true) },
  { key: 'ddp_static_graph', type: 'boolean', label: 'DDP Static Graph', desc: '启用 DDP static_graph 优化', defaultValue: false, visibleWhen: when('enable_distributed_training', true) },
];

const S_LULYNX_SDXL = [
  { key: 'lulynx_experimental_core_enabled', type: 'boolean', label: '启用 Lulynx 实验核心（lulynx_experimental_core_enabled）', desc: '集中管理 SafeGuard、EMA、ResourceManager、BlockWeight、SmartRank、AutoController、LISA、PCGrad、Pause、Prodigy Guard 与轻量监控', defaultValue: false },
  { key: 'lulynx_safeguard_enabled', type: 'boolean', label: '启用 SafeGuard（lulynx_safeguard_enabled）', desc: '桥接到当前训练器的轻量安全防护，可拦截 NaN/Inf loss 与异常 spike', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
  { key: 'lulynx_safeguard_nan_check_interval', type: 'number', label: 'NaN 检查间隔（lulynx_safeguard_nan_check_interval）', desc: '每 N 个优化 step 检查一次 NaN / Inf loss', defaultValue: 1, min: 1, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_safeguard_enabled', true)) },
  { key: 'lulynx_safeguard_max_nan_count', type: 'number', label: '最大连续 NaN（lulynx_safeguard_max_nan_count）', desc: '连续触发多少次 NaN / Inf 后直接停止训练', defaultValue: 3, min: 1, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_safeguard_enabled', true)) },
  { key: 'lulynx_safeguard_loss_spike_threshold', type: 'number', label: 'Loss Spike 阈值（lulynx_safeguard_loss_spike_threshold）', desc: '当前 loss 超过滚动平均值多少倍时判定为 spike', defaultValue: 5.0, min: 1, step: 0.1, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_safeguard_enabled', true)) },
  { key: 'lulynx_safeguard_loss_window_size', type: 'number', label: 'Loss 窗口大小（lulynx_safeguard_loss_window_size）', desc: '判定 loss spike 的滚动窗口大小', defaultValue: 20, min: 2, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_safeguard_enabled', true)) },
  { key: 'lulynx_safeguard_auto_reduce_lr', type: 'boolean', label: '自动降学习率（lulynx_safeguard_auto_reduce_lr）', desc: 'SafeGuard 触发时自动降低学习率', defaultValue: false, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_safeguard_enabled', true)) },
  { key: 'lulynx_safeguard_lr_reduction_factor', type: 'number', label: '降学习率倍率（lulynx_safeguard_lr_reduction_factor）', desc: '自动降低学习率时使用的倍率', defaultValue: 0.5, min: 0.01, max: 1, step: 0.01, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_safeguard_enabled', true), when('lulynx_safeguard_auto_reduce_lr', true)) },
  { key: 'lulynx_ema_enabled', type: 'boolean', label: '启用 EMA（lulynx_ema_enabled）', desc: '桥接到当前训练器的 EMA 实现，对训练参数做指数滑动平均', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
  { key: 'lulynx_ema_decay', type: 'number', label: 'EMA 衰减率（lulynx_ema_decay）', desc: '越接近 1 越平滑，常用 0.999~0.9999', defaultValue: 0.999, min: 0, max: 0.99999, step: 0.0001, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_ema_enabled', true)) },
  { key: 'lulynx_resource_manager_enabled', type: 'boolean', label: '启用 ResourceManager（lulynx_resource_manager_enabled）', desc: '监控显存占用并按设定节奏清理缓存，防止显存碎片累积', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
  { key: 'lulynx_resource_log_interval', type: 'number', label: '资源日志间隔（lulynx_resource_log_interval）', desc: '每 N 个优化 step 输出一次资源日志', defaultValue: 25, min: 1, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_resource_manager_enabled', true)) },
  { key: 'lulynx_block_weight_enabled', type: 'boolean', label: '启用 BlockWeight (SDXL)（lulynx_block_weight_enabled）', desc: '按 SDXL 模型结构分配 Encoder / Mid / Decoder 分层学习率', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
  { key: 'lulynx_down_lr_weight', type: 'string', label: 'Encoder 分层权重 (9段)（lulynx_down_lr_weight）', desc: 'SDXL Encoder 分层学习率权重，共 9 段', defaultValue: '1,1,1,1,1,1,1,1,1', visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_block_weight_enabled', true)) },
  { key: 'lulynx_mid_lr_weight', type: 'string', label: 'Mid 分层权重 (3段)（lulynx_mid_lr_weight）', desc: 'SDXL Mid 分层学习率权重，共 3 段', defaultValue: '1,1,1', visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_block_weight_enabled', true)) },
  { key: 'lulynx_up_lr_weight', type: 'string', label: 'Decoder 分层权重 (9段)（lulynx_up_lr_weight）', desc: 'SDXL Decoder 分层学习率权重，共 9 段', defaultValue: '1,1,1,1,1,1,1,1,1', visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_block_weight_enabled', true)) },
  { key: 'lulynx_block_lr_zero_threshold', type: 'number', label: '权重置零阈值（lulynx_block_lr_zero_threshold）', desc: '低于该阈值的 block 权重按 0 处理', defaultValue: 0, step: 0.01, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_block_weight_enabled', true)) },
  { key: 'lulynx_smart_rank_enabled', type: 'boolean', label: '启用 SmartRank（lulynx_smart_rank_enabled）', desc: '周期性压缩低能量 rank 通道，减少冗余参数。数值越低越激进', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
  { key: 'lulynx_smart_rank_keep_ratio', type: 'number', label: '保留 Rank 比例（lulynx_smart_rank_keep_ratio）', desc: '保留多少比例的 rank 通道。例如 0.75 表示裁掉最弱的 25%', defaultValue: 0.75, min: 0.05, max: 1, step: 0.01, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_smart_rank_enabled', true)) },
  { key: 'lulynx_auto_controller_enabled', type: 'boolean', label: '启用 AutoController（lulynx_auto_controller_enabled）', desc: '根据 loss 平台自动控速、降学习率或提前停止训练', defaultValue: false, visibleWhen: when('lulynx_experimental_core_enabled', true) },
  { key: 'lulynx_auto_check_every', type: 'number', label: '自动判断间隔（lulynx_auto_check_every）', desc: '每 N 个优化 step 做一次 AutoController 判断', defaultValue: 50, min: 1, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_auto_controller_enabled', true)) },
  { key: 'lulynx_auto_early_stop_patience', type: 'number', label: '提前停止耐心值（lulynx_auto_early_stop_patience）', desc: '连续多少次平台期后提前停止训练。数值越大越不容易提前停', defaultValue: 6, min: 1, visibleWhen: all(when('lulynx_experimental_core_enabled', true), when('lulynx_auto_controller_enabled', true)) },
];

const S_SPEED_SD15 = [
  { key: 'mixed_precision', type: 'select', label: '混合精度（mixed_precision）', desc: '训练混合精度, RTX30系列以后也可以指定 bf16', defaultValue: 'fp16', options: ['no', 'fp16', 'bf16'] },
  { key: 'xformers', type: 'boolean', label: '启用 xformers（xformers）', desc: '启用 xformers', defaultValue: true },
  { key: 'sdpa', type: 'boolean', label: '启用 SDPA（sdpa）', desc: '启用 sdpa', defaultValue: false },
  { key: 'mem_eff_attn', type: 'boolean', label: '低显存注意力（mem_eff_attn）', desc: '启用省显存 attention（比 xformers 更兼容，但通常更慢）', defaultValue: false },
  { key: 'cache_latents', type: 'boolean', label: '缓存 Latent（cache_latents）', desc: '缓存图像 latent, 缓存 VAE 输出以减少 VRAM 使用', defaultValue: true },
  { key: 'cache_latents_to_disk', type: 'boolean', label: '缓存 Latent 到磁盘（cache_latents_to_disk）', desc: '缓存图像 latent 到磁盘', defaultValue: true },
  { key: 'latent_cache_disk_format', type: 'select', label: 'Latent 缓存格式（latent_cache_disk_format）', desc: 'latent 磁盘缓存格式。默认 safetensors；若已有旧缓存会自动兼容读取 npz', defaultValue: 'safetensors', options: ['safetensors', 'npz'] },
  { key: 'full_fp16', type: 'boolean', label: '完全 FP16（full_fp16）', desc: '完全使用 FP16 精度', defaultValue: false },
  { key: 'full_bf16', type: 'boolean', label: '完全 BF16（full_bf16）', desc: '完全使用 BF16 精度', defaultValue: false },
  { key: 'no_half_vae', type: 'boolean', label: '不使用半精度 VAE（no_half_vae）', desc: '不使用半精度 VAE', defaultValue: false },
  { key: 'persistent_data_loader_workers', type: 'boolean', label: '保持数据加载器（persistent_data_loader_workers）', desc: '保留加载训练集的 worker，减少每个 epoch 之间的停顿', defaultValue: true },
  { key: 'vae_batch_size', type: 'number', label: 'VAE 编码批量（vae_batch_size）', desc: 'VAE 编码批量大小', defaultValue: '', min: 1 },
  { key: 'torch_compile', type: 'boolean', label: '启用 torch.compile（torch_compile）', desc: '实验性：启用 PyTorch torch.compile，部分环境可提升训练吞吐。首次编译会更慢，后续迭代加速明显。⚠️ 默认 inductor 后端依赖 Triton，若报错可改用 eager 后端或关闭此项', defaultValue: false },
  { key: 'dynamo_backend', type: 'select', label: 'torch.compile 后端（dynamo_backend）', desc: 'torch.compile 后端。inductor 为默认推荐；cudagraphs 适合固定形状输入；eager/aot_eager 用于调试', defaultValue: 'inductor', options: ['eager', 'aot_eager', 'inductor', 'cudagraphs'], visibleWhen: when('torch_compile', true) },
  { key: 'cpu_offload_checkpointing', type: 'boolean', label: 'CPU 卸载检查点（cpu_offload_checkpointing）', desc: '梯度检查点时将部分张量卸载到 CPU，节省显存', defaultValue: false },
  { key: 'pytorch_cuda_expandable_segments', type: 'boolean', label: '显存碎片优化（pytorch_cuda_expandable_segments）', desc: '训练前自动设置 PYTORCH_ALLOC_CONF=expandable_segments:True，缓解显存碎片导致的 OOM。一般对速度影响很小', defaultValue: true },
];
const S_ADV = [
  { key: 'gpu_ids', type: 'string', label: '指定显卡（gpu_ids）', desc: '指定参与训练的 GPU 编号，多卡用逗号分隔（如 0,1）。留空使用默认主显卡。可在启动日志中查看可用 GPU 编号', defaultValue: '' },
  { key: 'noise_offset', type: 'number', label: '噪声偏移（noise_offset）', desc: '在训练中添加噪声偏移来改良生成非常暗或者非常亮的图像，如果启用推荐为 0.1', defaultValue: '', step: 0.01 },
  { key: 'seed', type: 'number', label: '随机种子（seed）', desc: '随机种子', defaultValue: 1337 },
  { key: 'clip_skip', type: 'slider', label: 'CLIP 跳层（clip_skip）', desc: 'CLIP 跳过层数 *玄学*（默认值 2 不会发送给后端，等同于不设置）', defaultValue: 2, min: 0, max: 12, step: 1 },
  { key: 'masked_loss', type: 'boolean', label: '启用蒙版损失（masked_loss）', desc: '启用 Masked Loss。训练带透明蒙版 / alpha 的图像时可用', defaultValue: false },
  { key: 'alpha_mask', type: 'boolean', label: '读取 Alpha 通道作为 Mask（alpha_mask）', desc: '读取训练图像的 alpha 通道作为 loss mask', defaultValue: false },
  { key: 'training_comment', type: 'textarea', label: '训练备注（training_comment）', desc: '写入模型元数据的训练备注', defaultValue: '' },
  { key: 'ui_custom_params', type: 'textarea', label: '自定义 TOML 覆盖（ui_custom_params）', desc: '危险：会直接覆盖界面中的参数。', defaultValue: '' },
  { key: 'no_metadata', type: 'boolean', label: '不写入元数据（no_metadata）', desc: '不向输出模型写入完整训练元数据', defaultValue: false },
  { key: 'initial_epoch', type: 'number', label: '起始 epoch（initial_epoch）', desc: '从指定 epoch 编号开始计数', defaultValue: '', min: 1 },
  { key: 'initial_step', type: 'number', label: '起始 step（initial_step）', desc: '从指定 step 编号开始计数，会覆盖 initial_epoch', defaultValue: '', min: 0 },
  { key: 'skip_until_initial_step', type: 'boolean', label: '跳过前面步数（skip_until_initial_step）', desc: '配合 initial_step 使用，真正跳过前面的训练步数', defaultValue: false },
  { key: 'ema_enabled', type: 'boolean', label: '启用 EMA（ema_enabled）', desc: '启用 EMA（指数滑动平均）。会额外复制一份参数，保存时写出 EMA 权重', defaultValue: false },
  { key: 'ema_decay', type: 'number', label: 'EMA 衰减率（ema_decay）', desc: 'EMA 衰减率。越接近 1 越平滑', defaultValue: 0.999, min: 0, max: 0.99999, step: 0.0001, visibleWhen: when('ema_enabled', true) },
  { key: 'ema_update_every', type: 'number', label: 'EMA 更新间隔（ema_update_every）', desc: '每 N 个优化 step 更新一次 EMA', defaultValue: 1, min: 1, visibleWhen: when('ema_enabled', true) },
  { key: 'ema_update_after_step', type: 'number', label: 'EMA 起始步（ema_update_after_step）', desc: '从第几个优化 step 开始更新 EMA', defaultValue: 0, min: 0, visibleWhen: when('ema_enabled', true) },
  { key: 'safeguard_enabled', type: 'boolean', label: '启用 SafeGuard（safeguard_enabled）', desc: '拦截 NaN/Inf loss 与异常 loss spike', defaultValue: false },
  { key: 'safeguard_nan_check_interval', type: 'number', label: 'NaN 检查间隔（safeguard_nan_check_interval）', desc: '每 N 个优化 step 检查一次 NaN / Inf loss', defaultValue: 1, min: 1, visibleWhen: when('safeguard_enabled', true) },
  { key: 'safeguard_max_nan_count', type: 'number', label: '最大 NaN 次数（safeguard_max_nan_count）', desc: '连续触发多少次 NaN 后停止训练', defaultValue: 3, min: 1, visibleWhen: when('safeguard_enabled', true) },
  { key: 'safeguard_loss_spike_threshold', type: 'number', label: 'Loss Spike 阈值（safeguard_loss_spike_threshold）', desc: '当前 loss 超过滚动平均值多少倍时，判定为 spike 并跳过该 step', defaultValue: 5.0, min: 1, step: 0.1, visibleWhen: when('safeguard_enabled', true) },
  { key: 'safeguard_loss_window_size', type: 'number', label: 'Loss 窗口大小（safeguard_loss_window_size）', desc: '用于判定 loss spike 的滚动窗口大小', defaultValue: 20, min: 2, visibleWhen: when('safeguard_enabled', true) },
  { key: 'safeguard_auto_reduce_lr', type: 'boolean', label: '自动降低学习率（safeguard_auto_reduce_lr）', desc: 'SafeGuard 触发时自动降低学习率', defaultValue: false, visibleWhen: when('safeguard_enabled', true) },
  { key: 'safeguard_lr_reduction_factor', type: 'number', label: '降学习率倍率（safeguard_lr_reduction_factor）', desc: '自动降低学习率时使用的倍率', defaultValue: 0.5, min: 0.01, max: 1, step: 0.01, visibleWhen: all(when('safeguard_enabled', true), when('safeguard_auto_reduce_lr', true)) },
];

const S_NOISE = [
  { key: 'noise_offset_random_strength', type: 'boolean', label: '噪声偏移随机强度（noise_offset_random_strength）', desc: '噪声偏移强度在 0 到 noise_offset 间随机变化', defaultValue: false },
  { key: 'multires_noise_iterations', type: 'number', label: '多分辨率噪声迭代（multires_noise_iterations）', desc: '多分辨率（金字塔）噪声迭代次数 推荐 6-10', defaultValue: '',step: 1 },
  { key: 'multires_noise_discount', type: 'number', label: '多分辨率噪声衰减（multires_noise_discount）', desc: '多分辨率（金字塔）衰减率 推荐 0.3-0.8', defaultValue: '', step: 0.01 },
  { key: 'ip_noise_gamma', type: 'number', label: '输入扰动噪声（ip_noise_gamma）', desc: '输入扰动噪声强度，常用于正则化', defaultValue: '', step: 0.01 },
  { key: 'ip_noise_gamma_random_strength', type: 'boolean', label: '扰动噪声随机强度（ip_noise_gamma_random_strength）', desc: '输入扰动噪声强度在 0 到 ip_noise_gamma 间随机变化', defaultValue: false },
  { key: 'adaptive_noise_scale', type: 'number', label: '自适应噪声缩放（adaptive_noise_scale）', desc: '按 latent 平均绝对值动态追加 noise_offset', defaultValue: '', step: 0.01 },
  { key: 'min_timestep', type: 'number', label: '最小时间步（min_timestep）', desc: '训练时允许的最小 timestep', defaultValue: '', min: 0 },
  { key: 'max_timestep', type: 'number', label: '最大时间步（max_timestep）', desc: '训练时允许的最大 timestep', defaultValue: '', min: 1 },
];
const S_DATA_AUG = [
  { key: 'color_aug', type: 'boolean', label: '颜色增强（color_aug）', desc: '启用颜色改变数据增强', defaultValue: false },
  { key: 'flip_aug', type: 'boolean', label: '翻转增强（flip_aug）', desc: '启用图像翻转数据增强', defaultValue: false },
  { key: 'random_crop', type: 'boolean', label: '随机裁剪（random_crop）', desc: '启用随机剪裁数据增强', defaultValue: false },
];
const S_VALIDATION = [
  { key: 'validation_split', type: 'number', label: '验证集比例（validation_split）', desc: '验证集划分比例，从训练集自动切出一部分做验证', defaultValue: 0, min: 0, max: 1, step: 0.01 },
  { key: 'validation_seed', type: 'number', label: '验证集种子（validation_seed）', desc: '验证集切分随机种子', defaultValue: '' },
  { key: 'validate_every_n_steps', type: 'number', label: '每 N 步验证（validate_every_n_steps）', desc: '每 N 步执行一次验证', defaultValue: '', min: 1 },
  { key: 'validate_every_n_epochs', type: 'number', label: '每 N 轮验证（validate_every_n_epochs）', desc: '每 N 个 epoch 执行一次验证', defaultValue: '', min: 1 },
  { key: 'max_validation_steps', type: 'number', label: '最大验证步数（max_validation_steps）', desc: '每次验证最多处理多少个验证批次', defaultValue: '', min: 1 },
];
const S_THERMAL = [
  { key: 'cooldown_every_n_epochs', type: 'number', label: '每 N 轮冷却（cooldown_every_n_epochs）', desc: '每 N 个 epoch 暂停训练冷却。留空关闭', defaultValue: '', min: 1 },
  { key: 'cooldown_minutes', type: 'number', label: '冷却分钟数（cooldown_minutes）', desc: '每次冷却至少暂停多少分钟', defaultValue: '', min: 0, step: 0.5 },
  { key: 'cooldown_until_temp_c', type: 'number', label: '冷却目标温度(℃)（cooldown_until_temp_c）', desc: '等待显卡温度降到多少℃以下再继续', defaultValue: '', min: 1 },
  { key: 'cooldown_poll_seconds', type: 'number', label: '温度轮询间隔(秒)（cooldown_poll_seconds）', desc: '温度轮询间隔', defaultValue: 15, min: 1 },
  { key: 'gpu_power_limit_w', type: 'number', label: 'GPU 功率墙(W)（gpu_power_limit_w）', desc: '训练前设置显卡功率墙（瓦）', defaultValue: '', min: 1 },
];

// 显存峰值控制 (shared)
const S_PEAK_VRAM = [
  { key: 'peak_vram_control_enabled', type: 'boolean', label: '启用显存峰值控制（peak_vram_control_enabled）', desc: '显存峰值控制兜底开关。主要用于已经接近 OOM、启动峰值容易炸、或后台/驱动占用波动较大时救场。能正常跑就不要开，也不要把下面所有兜底项一起全开', defaultValue: false },
  { key: 'peak_vram_target_effective_batch', type: 'number', label: '目标等效 Batch（peak_vram_target_effective_batch）', desc: '目标等效 batch。填写 0 表示关闭；填写后会优先通过梯度累积去逼近该等效 batch，而不是直接抬高单步 batch。通常先调这个，再考虑更重的兜底项', defaultValue: 0, min: 0, visibleWhen: when('peak_vram_control_enabled', true) },
  { key: 'peak_vram_startup_guard_enabled', type: 'boolean', label: '启动峰值保护（peak_vram_startup_guard_enabled）', desc: '启动峰值保护。仅在训练前几步容易爆显存时建议开启；正常稳定训练建议关闭', defaultValue: false, visibleWhen: when('peak_vram_control_enabled', true) },
  { key: 'peak_vram_startup_guard_mode', type: 'select', label: '保护强度（peak_vram_startup_guard_mode）', desc: 'auto 自动估计；balanced 偏平衡；aggressive 偏省显存', defaultValue: 'auto', options: ['auto', 'balanced', 'aggressive'], visibleWhen: all(when('peak_vram_control_enabled', true), when('peak_vram_startup_guard_enabled', true)) },
  { key: 'peak_vram_startup_guard_steps', type: 'number', label: '保护持续步数（peak_vram_startup_guard_steps）', desc: '启动峰值保护持续多少个优化 step。0 表示整段训练都保留。一般前几步最容易爆显存，不用开太大', defaultValue: 24, min: 0, visibleWhen: all(when('peak_vram_control_enabled', true), when('peak_vram_startup_guard_enabled', true)) },
  { key: 'peak_vram_micro_batch_enabled', type: 'boolean', label: 'Micro-Batch 拆分（peak_vram_micro_batch_enabled）', desc: '启用 micro-batch 拆分执行。很强的保命项，但通常会明显降低速度；只有单步 batch 接近 OOM 时再开', defaultValue: false, visibleWhen: when('peak_vram_control_enabled', true) },
  { key: 'peak_vram_micro_batch_size', type: 'number', label: 'Micro-Batch 大小（peak_vram_micro_batch_size）', desc: '每个 micro-batch 的前后向 batch 大小。例如 batch=8 填 2，按 2+2+2+2 拆分', defaultValue: 1, min: 1, visibleWhen: all(when('peak_vram_control_enabled', true), when('peak_vram_micro_batch_enabled', true)) },
  { key: 'peak_vram_diagnostics_enabled', type: 'boolean', label: '显存诊断（peak_vram_diagnostics_enabled）', desc: '启用轻量显存诊断。仅用于排查问题或测速定位，默认不建议常开', defaultValue: false, visibleWhen: when('peak_vram_control_enabled', true) },
  { key: 'peak_vram_diagnostics_interval', type: 'number', label: '诊断间隔 (步)（peak_vram_diagnostics_interval）', desc: '每 N 个优化 step 输出一次显存诊断', defaultValue: 25, min: 1, visibleWhen: all(when('peak_vram_control_enabled', true), when('peak_vram_diagnostics_enabled', true)) },
  { key: 'peak_vram_auto_protection_enabled', type: 'boolean', label: '动态显存自动保护（peak_vram_auto_protection_enabled）', desc: '启用动态显存自动保护。仅在显存波动、偶发 OOM、或后台抢显存时建议开启；能稳定训练就可关闭以减少额外干预', defaultValue: false, visibleWhen: when('peak_vram_control_enabled', true) },
];


// dataset fields helper
const ds = (reso, bucketMax = 2048, bucketStep = 64, extra = []) => [
  { key: 'train_data_dir', type: 'folder', pickerType: 'folder', label: '训练数据集路径（train_data_dir）', desc: '训练数据集路径', defaultValue: './train/aki' },
  { key: 'reg_data_dir', type: 'folder', pickerType: 'folder', label: '正则化数据集路径（reg_data_dir）', desc: '正则化数据集路径。默认留空，不使用正则化图像', defaultValue: '' },
  { key: 'prior_loss_weight', type: 'number', label: '先验损失权重（prior_loss_weight）', desc: '正则化 - 先验损失权重', defaultValue: 1, min: 0, step: 0.1 },
  { key: 'resolution', type: 'string', label: '训练分辨率（resolution）', desc: '训练图片分辨率，宽x高。支持非正方形，但必须是 64 倍数。', defaultValue: reso },
  { key: 'enable_bucket', type: 'boolean', label: '启用分桶（enable_bucket）', desc: '启用 arb 桶以允许非固定宽高比的图片', defaultValue: true },
  { key: 'min_bucket_reso', type: 'number', label: '桶最小分辨率（min_bucket_reso）', desc: 'arb 桶最小分辨率', defaultValue: 256 },
  { key: 'max_bucket_reso', type: 'number', label: '桶最大分辨率（max_bucket_reso）', desc: 'arb 桶最大分辨率', defaultValue: bucketMax },
  { key: 'bucket_reso_steps', type: 'number', label: '桶划分单位（bucket_reso_steps）', desc: 'arb 桶分辨率划分单位', defaultValue: bucketStep },
  { key: 'bucket_no_upscale', type: 'boolean', label: '桶不放大图片（bucket_no_upscale）', desc: 'arb 桶不放大图片', defaultValue: true },
  { key: 'bucket_selection_mode', type: 'select', label: '分桶策略（bucket_selection_mode）', desc: 'legacy 为原始穷举桶，nearest_only 就近桶，custom_only 自定义桶列表', defaultValue: 'legacy', options: ['legacy', 'nearest_only', 'custom_only'] },
  { key: 'bucket_custom_resos', type: 'textarea', label: '自定义桶列表（bucket_custom_resos）', desc: '一行一个，支持 1024x1024、1024,1536。仅在 custom_only 时生效', defaultValue: '', visibleWhen: when('bucket_selection_mode', 'custom_only') },
  ...extra,
];

// LoRA network fields helper
const netLora = (mod, dim = 32, alpha = 32, maxDim = 512, extra = [], extraModules = []) => [
  { key: 'network_module', type: 'select', label: '训练网络模块（network_module）', desc: '训练网络模块', defaultValue: mod, options: [mod, ...extraModules, ...(mod.includes('lycoris') ? [] : ['lycoris.kohya'])] },
  { key: 'network_dim', type: 'slider', label: '网络维度（network_dim）', desc: '网络维度，常用 4~128，不是越大越好, 低 dim 可以降低显存占用', defaultValue: dim, min: 1, max: maxDim, step: 1 },
  { key: 'network_alpha', type: 'slider', label: '网络 Alpha（network_alpha）', desc: '常用值：等于 network_dim 或 network_dim*1/2 或 1。使用较小的 alpha 需要提升学习率', defaultValue: alpha, min: 1, max: maxDim, step: 1 },
  { key: 'network_dropout', type: 'number', label: '网络 Dropout（network_dropout）', desc: 'dropout 概率（与 lycoris 不兼容，需要用 lycoris 自带的）', defaultValue: 0, min: 0, step: 0.01 },
  { key: 'dim_from_weights', type: 'boolean', label: '从权重推断 Dim（dim_from_weights）', desc: '从已有 network_weights 自动推断 rank / dim', defaultValue: false },
  { key: 'scale_weight_norms', type: 'number', label: '最大范数正则化（scale_weight_norms）', desc: '最大范数正则化。如果使用，推荐为 1', defaultValue: '', min: 0, step: 0.01 },
  { key: 'lycoris_algo', type: 'select', label: 'LyCORIS 算法（lycoris_algo）', desc: 'LyCORIS 网络算法', defaultValue: 'locon', options: ['locon', 'loha', 'lokr', 'ia3', 'dylora', 'glora', 'diag-oft', 'boft'], visibleWhen: when('network_module', 'lycoris.kohya') },
  { key: 'conv_dim', type: 'number', label: '卷积维度（conv_dim）', desc: 'LyCORIS 卷积维度', defaultValue: 4, min: 1, visibleWhen: when('network_module', 'lycoris.kohya') },
  { key: 'conv_alpha', type: 'number', label: '卷积 Alpha（conv_alpha）', desc: 'LyCORIS 卷积 Alpha', defaultValue: 1, min: 1, visibleWhen: when('network_module', 'lycoris.kohya') },
  { key: 'dropout', type: 'number', label: 'LyCORIS Dropout', desc: 'LyCORIS 专用 dropout 概率。推荐 0~0.5，LoHa/LoKr/(IA)^3 暂不支持', defaultValue: 0, min: 0, max: 1, step: 0.01, visibleWhen: when('network_module', 'lycoris.kohya') },
  { key: 'train_norm', type: 'boolean', label: '训练 Norm 层（train_norm）', desc: '额外训练归一化层（LayerNorm/RMSNorm 等）的可学习缩放/偏置，用来微调特征尺度、风格强度和收敛稳定性；会小幅增加显存占用与 LoRA 文件大小，并增加过拟合风险。LyCORIS 的 (IA)^3 不支持，不确定请保持关闭。', defaultValue: false, visibleWhen: when('network_module', 'lycoris.kohya') },
  { key: 'lokr_factor', type: 'number', label: 'LoKr 系数（lokr_factor）', desc: '常用 4~无穷（填写 -1 为无穷）', defaultValue: -1, min: -1, visibleWhen: all(when('network_module', 'lycoris.kohya'), when('lycoris_algo', 'lokr')) },
  { key: 'enable_base_weight', type: 'boolean', label: '启用基础权重（enable_base_weight）', desc: '启用基础权重（差异炼丹）', defaultValue: false },
  { key: 'base_weights', type: 'textarea', label: '基础权重路径（base_weights）', desc: '合并入底模的 LoRA 路径，一行一个路径', defaultValue: '', visibleWhen: when('enable_base_weight', true) },
  { key: 'base_weights_multiplier', type: 'textarea', label: '基础权重比例（base_weights_multiplier）', desc: '合并入底模的 LoRA 权重，一行一个数字', defaultValue: '', visibleWhen: when('enable_base_weight', true) },
  { key: 'network_args_custom', type: 'textarea', label: '自定义 network_args（network_args_custom）', desc: '自定义 network_args，每行一个参数', defaultValue: '' },
  ...extra,
];

// flow-based model params helper
const flowParams = (defaults = {}) => [
  { key: 'timestep_sampling', type: 'select', label: '时间步采样（timestep_sampling）', desc: '时间步采样策略', defaultValue: defaults.ts || 'sigmoid', options: ['sigma', 'uniform', 'sigmoid', 'shift', 'flux_shift'] },
  { key: 'sigmoid_scale', type: 'number', label: 'sigmoid 缩放（sigmoid_scale）', desc: 'sigmoid 缩放系数', defaultValue: defaults.ss || 1.0, step: 0.001 },
  { key: 'model_prediction_type', type: 'select', label: '模型预测类型（model_prediction_type）', desc: '模型预测类型', defaultValue: defaults.mp || 'raw', options: ['raw', 'additive', 'sigma_scaled'] },
  { key: 'discrete_flow_shift', type: 'number', label: '离散流位移（discrete_flow_shift）', desc: '离散流位移值', defaultValue: defaults.dfs || 1.0, step: 0.001 },
  { key: 'guidance_scale', type: 'number', label: 'CFG 引导缩放（guidance_scale）', desc: 'CFG 引导缩放', defaultValue: defaults.gs || 1.0, step: 0.01 },
  { key: 'weighting_scheme', type: 'select', label: '权重策略（weighting_scheme）', desc: '损失加权策略', defaultValue: defaults.ws || 'uniform', options: ['sigma_sqrt', 'logit_normal', 'mode', 'cosmap', 'none', 'uniform'] },
  { key: 'mode_scale', type: 'number', label: 'mode 权重缩放（mode_scale）', desc: 'mode 权重策略的缩放系数', defaultValue: '', step: 0.01 },
  { key: 'loss_type', type: 'select', label: '损失函数类型（loss_type）', desc: '损失函数类型', defaultValue: defaults.lt || 'l2', options: ['l1', 'l2', 'huber', 'smooth_l1'] },
];

const rectifiedFlowParams = () => [
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

// helper: section factory
const sec = (id, tab, title, desc, fields) => ({ id, tab, title, description: desc, fields });

// ================================================================
// SECTIONS 定义: 每种训练类型
// ================================================================

// ---- SDXL LoRA ----
const SDXL_LORA_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'SDXL 底模、VAE 与恢复训练。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'sdxl-lora' },
    { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'SDXL 底模路径（pretrained_model_name_or_path）', desc: '底模文件路径', defaultValue: './sd-models/model.safetensors' },
    { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '从某个 save_state 保存的中断状态继续训练，填写文件路径', defaultValue: '' },
    { key: 'vae', type: 'file', pickerType: 'model-file', label: 'VAE 路径（vae）', desc: '(可选) VAE 模型文件路径，使用外置 VAE 文件覆盖模型内本身的', defaultValue: '' },
    { key: 'network_weights', type: 'file', pickerType: 'output-model-file', label: '继续训练 LoRA（network_weights）', desc: '从已有的 LoRA 模型上继续训练，填写路径', defaultValue: '' },
    { key: 'v_parameterization', type: 'boolean', label: 'V 参数化（v_parameterization）', desc: 'v-parameterization 学习（训练 Illustrious 等 v-pred 模型时需要开启）', defaultValue: false },
    { key: 'zero_terminal_snr', type: 'boolean', label: '零终端 SNR（zero_terminal_snr）', desc: 'Zero Terminal SNR（v-pred 模型训练推荐开启）', defaultValue: true, visibleWhen: when('v_parameterization', true) },
    { key: 'scale_v_pred_loss_like_noise_pred', type: 'boolean', label: '缩放 v-pred 损失（scale_v_pred_loss_like_noise_pred）', desc: '缩放 v-prediction 损失（v-pred 模型训练推荐开启）', defaultValue: true, visibleWhen: when('v_parameterization', true) },
  ]),
  sec('save-settings', 'model', '保存设置', '输出路径、格式与训练状态。', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '训练数据、正则图与分桶。', ds('1024,1024', 2048, 32)),
  sec('caption-settings', 'dataset', 'Caption 选项', '标签打乱与丢弃策略。', [...S_CAPTION]),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('network-settings', 'network', '网络设置', 'LoRA / LyCORIS 参数。', netLora('networks.lora', 32, 32, 512, [
    { key: 'tlora_min_rank', type: 'number', label: 'T-LoRA 最小 Rank（tlora_min_rank）', desc: 'T-LoRA 最小动态 rank。仅在 network_module=networks.tlora 时生效', defaultValue: 1, min: 1, visibleWhen: when('network_module', 'networks.tlora') },
    { key: 'tlora_rank_schedule', type: 'select', label: 'T-LoRA Rank 调度（tlora_rank_schedule）', desc: 'T-LoRA 动态 rank 调度策略', defaultValue: 'cosine', options: ['cosine', 'linear'], visibleWhen: when('network_module', 'networks.tlora') },
    { key: 'tlora_orthogonal_init', type: 'boolean', label: 'T-LoRA 正交初始化（tlora_orthogonal_init）', desc: 'T-LoRA 对 lora_down 使用正交初始化（实验性）', defaultValue: false, visibleWhen: when('network_module', 'networks.tlora') },
    { key: 'pissa_init', type: 'boolean', label: '启用 PiSSA 初始化（pissa_init）', desc: '启用 PiSSA 初始化（实验性，仅在 network_module=networks.lora 时生效）', defaultValue: false, visibleWhen: when('network_module', 'networks.lora') },
    { key: 'pissa_method', type: 'select', label: 'PiSSA 分解方式（pissa_method）', desc: '推荐保持 rSVD 默认值', defaultValue: 'rsvd', options: ['rsvd', 'svd'], visibleWhen: all(when('network_module', 'networks.lora'), when('pissa_init', true)) },
    { key: 'pissa_niter', type: 'number', label: 'PiSSA 幂迭代次数（pissa_niter）', desc: 'PiSSA rSVD 幂迭代次数（高级参数）', defaultValue: 2, min: 0, step: 1, visibleWhen: all(when('network_module', 'networks.lora'), when('pissa_init', true)) },
    { key: 'pissa_oversample', type: 'number', label: 'PiSSA 过采样维度（pissa_oversample）', desc: 'PiSSA rSVD 过采样维度（高级参数）', defaultValue: 8, min: 0, step: 1, visibleWhen: all(when('network_module', 'networks.lora'), when('pissa_init', true)) },
    { key: 'pissa_apply_conv2d', type: 'boolean', label: 'PiSSA 作用于 Conv（pissa_apply_conv2d）', desc: 'PiSSA 额外作用于 1x1 Conv（实验性，默认只初始化 Linear）', defaultValue: false, visibleWhen: all(when('network_module', 'networks.lora'), when('pissa_init', true)) },
    { key: 'pissa_export_mode', type: 'select', label: 'PiSSA 导出模式（pissa_export_mode）', desc: 'PiSSA 模型保存为标准 LoRA 时的导出方式', defaultValue: 'LoRA无损兼容导出', options: ['LoRA无损兼容导出', 'LoRA快速近似导出'], visibleWhen: all(when('network_module', 'networks.lora'), when('pissa_init', true)) },
    { key: 'dora_wd', type: 'boolean', label: '启用 DoRA（dora_wd）', desc: '启用 DoRA（Weight-Decomposed Low-Rank Adaptation）训练。将权重分解为幅度和方向两个分量分别微调，比普通 LoRA 更接近全量微调效果，且不增加推理开销', defaultValue: false },
    { key: 'dylora_unit', type: 'number', label: 'DyLoRA 分块（dylora_unit）', desc: 'dylora 分割块数单位，最小 1 也最慢。一般 4、8、12、16 这几个选', defaultValue: 4, min: 1, visibleWhen: when('network_module', 'networks.dylora') },
  ], ['networks.tlora', 'networks.dylora', 'networks.oft'])),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '学习率、调度器与优化器。', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '训练轮数、批量与梯度。', [...S_TRAIN(10),
    { key: 'enable_block_weights', type: 'boolean', label: '启用分层学习率（enable_block_weights）', desc: '启用分层学习率训练（只支持网络模块 networks.lora）。开启后可在下方分别设置 U-Net Encoder / Mid / Decoder 各层的学习率权重，精细控制模型各部分的训练强度', defaultValue: false },
    { key: 'down_lr_weight', type: 'string', label: 'Encoder 分层权重 (12层)（down_lr_weight）', desc: 'U-Net Encoder 各层的学习率权重，逗号分隔共 12 个值。设为 0 可冻结该层', defaultValue: '1,1,1,1,1,1,1,1,1,1,1,1', visibleWhen: when('enable_block_weights', true) },
    { key: 'mid_lr_weight', type: 'string', label: 'Mid 分层权重 (1层)（mid_lr_weight）', desc: 'U-Net Mid 层的学习率权重，共 1 个值', defaultValue: '1', visibleWhen: when('enable_block_weights', true) },
    { key: 'up_lr_weight', type: 'string', label: 'Decoder 分层权重 (12层)（up_lr_weight）', desc: 'U-Net Decoder 各层的学习率权重，逗号分隔共 12 个值。设为 0 可冻结该层', defaultValue: '1,1,1,1,1,1,1,1,1,1,1,1', visibleWhen: when('enable_block_weights', true) },
    { key: 'block_lr_zero_threshold', type: 'number', label: '分层置零阈值（block_lr_zero_threshold）', desc: '低于该阈值的 block 权重按 0 处理', defaultValue: 0, step: 0.01, visibleWhen: when('enable_block_weights', true) },
  ]),
  sec('rf-settings', 'training', 'Rectified Flow', 'RF / Flow Matching 训练目标与时间步策略。', rectifiedFlowParams()),
  sec('peak-vram-settings', 'speed', '显存峰值控制', '目标等效 batch、启动峰值保护、micro-batch 拆分与显存诊断。', [...S_PEAK_VRAM]),
  sec('block-swap-settings', 'speed', 'SDXL Block Swap（兜底）', '独立的 SDXL U-Net block swap 兜底开关。主要用于显存吃紧时保命，能正常跑就不要开；若同时开启 ≤6GB 低显存优化，则仍会由低显存预设接管 block swap。', [
    { key: 'sdxl_block_swap_enabled', type: 'boolean', label: '启用 SDXL Block Swap（sdxl_block_swap_enabled）', desc: 'SDXL U-Net block swap 兜底开关。主要用于显存吃紧时保命，能正常跑就不要开；若同时开启 ≤6GB 低显存优化，则仍会由低显存预设接管 block swap', defaultValue: false },
    { key: 'sdxl_block_swap_output_blocks', type: 'boolean', label: '交换 Output Blocks（sdxl_block_swap_output_blocks）', desc: '推荐第一步尝试。交换 U-Net output blocks，通常速度影响最小；如果本来能跑，就不建议开', defaultValue: true, visibleWhen: when('sdxl_block_swap_enabled', true) },
    { key: 'sdxl_block_swap_middle_block', type: 'boolean', label: '交换 Middle Block（sdxl_block_swap_middle_block）', desc: '推荐第二步尝试。交换 U-Net middle block，通常仍比较划算，但依然会拖慢训练', defaultValue: true, visibleWhen: when('sdxl_block_swap_enabled', true) },
    { key: 'sdxl_block_swap_offload_after_backward', type: 'boolean', label: '反向后卸载（sdxl_block_swap_offload_after_backward）', desc: '推荐第三步尝试。反向传播结束后立即卸载已交换 block，更省显存，但通常更慢', defaultValue: true, visibleWhen: when('sdxl_block_swap_enabled', true) },
    { key: 'sdxl_block_swap_input_blocks', type: 'boolean', label: '交换 Input Blocks（sdxl_block_swap_input_blocks）', desc: '推荐最后再尝试。交换 U-Net input blocks，显存收益较大，但通常速度损失最大', defaultValue: false, visibleWhen: when('sdxl_block_swap_enabled', true) },
    { key: 'sdxl_block_swap_vram_threshold', type: 'number', label: '显存水线 (%)（sdxl_block_swap_vram_threshold）', desc: '高级参数：block swap 的软显存水线（百分比）。一般保持默认即可', defaultValue: 70, min: 0, max: 99, step: 1, visibleWhen: when('sdxl_block_swap_enabled', true) },
  ]),

  sec('low-vram-settings', 'speed', 'SDXL 低显存优化 (≤6GB)', '开启后会按低显存预设自动调整缓存、预览和训练目标。', [
    { key: 'sdxl_low_vram_optimization', type: 'boolean', label: '启用低显存优化（sdxl_low_vram_optimization）', desc: '低显存优化（≤6GB）。开启后会按低显存预设自动调整缓存、预览和训练目标', defaultValue: false },
    { key: 'sdxl_low_vram_resolution_mode', type: 'select', label: '分辨率规划模式（sdxl_low_vram_resolution_mode）', desc: '推荐 long_edge；short_edge 细节更强但更吃显存', defaultValue: 'long_edge', options: ['long_edge', 'short_edge'], visibleWhen: when('sdxl_low_vram_optimization', true) },
    { key: 'sdxl_low_vram_bucket_reso_steps', type: 'number', label: 'Bucket 步长（sdxl_low_vram_bucket_reso_steps）', desc: '低显存模式 bucket 步长。推荐 32', defaultValue: 32, visibleWhen: when('sdxl_low_vram_optimization', true) },
    { key: 'sdxl_low_vram_two_phase_cache', type: 'boolean', label: '两阶段缓存（sdxl_low_vram_two_phase_cache）', desc: '启用两阶段缓存流程。会优先把缓存阶段与正式训练阶段解耦', defaultValue: true, visibleWhen: when('sdxl_low_vram_optimization', true) },
    { key: 'sdxl_low_vram_component_cpu_residency', type: 'boolean', label: '组件 CPU 驻留（sdxl_low_vram_component_cpu_residency）', desc: 'VAE / 文本编码器会尽量只在需要时临时上 GPU', defaultValue: true, visibleWhen: when('sdxl_low_vram_optimization', true) },
    { key: 'sdxl_low_vram_fixed_block_swap', type: 'boolean', label: 'U-Net Block Swap', desc: '启用 SDXL U-Net block swap', defaultValue: true, visibleWhen: when('sdxl_low_vram_optimization', true) },
    { key: 'sdxl_low_vram_swap_input_blocks', type: 'boolean', label: '交换 Input Blocks（sdxl_low_vram_swap_input_blocks）', desc: '交换 U-Net input blocks。显存收益较大但更慢', defaultValue: false, visibleWhen: all(when('sdxl_low_vram_optimization', true), when('sdxl_low_vram_fixed_block_swap', true)) },
    { key: 'sdxl_low_vram_swap_middle_block', type: 'boolean', label: '交换 Middle Block（sdxl_low_vram_swap_middle_block）', desc: '交换 U-Net middle block。通常比较划算', defaultValue: true, visibleWhen: all(when('sdxl_low_vram_optimization', true), when('sdxl_low_vram_fixed_block_swap', true)) },
    { key: 'sdxl_low_vram_swap_output_blocks', type: 'boolean', label: '交换 Output Blocks（sdxl_low_vram_swap_output_blocks）', desc: '交换 U-Net output blocks。通常建议优先尝试', defaultValue: true, visibleWhen: all(when('sdxl_low_vram_optimization', true), when('sdxl_low_vram_fixed_block_swap', true)) },
    { key: 'sdxl_low_vram_swap_offload_after_backward', type: 'boolean', label: '反向后卸载（sdxl_low_vram_swap_offload_after_backward）', desc: '反向传播结束后把已交换 block 立即移回 CPU。更省显存但更慢', defaultValue: true, visibleWhen: all(when('sdxl_low_vram_optimization', true), when('sdxl_low_vram_fixed_block_swap', true)) },
    { key: 'sdxl_low_vram_swap_vram_threshold', type: 'number', label: '显存水线 (%)（sdxl_low_vram_swap_vram_threshold）', desc: 'block swap 的软显存水线。0 表示始终尽快卸载', defaultValue: 0, min: 0, max: 99, step: 1, visibleWhen: all(when('sdxl_low_vram_optimization', true), when('sdxl_low_vram_fixed_block_swap', true)) },
    { key: 'sdxl_low_vram_preview_policy', type: 'select', label: '预览策略（sdxl_low_vram_preview_policy）', desc: '低显存模式预览策略', defaultValue: 'every_4_epochs', options: ['every_2_epochs', 'every_4_epochs', 'disable'], visibleWhen: when('sdxl_low_vram_optimization', true) },
    { key: 'sdxl_low_vram_auto_protection', type: 'boolean', label: 'OOM 自动保护（sdxl_low_vram_auto_protection）', desc: '预览 OOM 时先降频再自动关闭预览', defaultValue: true, visibleWhen: when('sdxl_low_vram_optimization', true) },
    { key: 'sdxl_low_vram_auto_resolution_probe', type: 'boolean', label: '自动分辨率探测（sdxl_low_vram_auto_resolution_probe）', desc: '启动前自动预跑检查显存，必要时下调分辨率', defaultValue: true, visibleWhen: when('sdxl_low_vram_optimization', true) },
  ]),
  sec('staged-resolution-settings', 'advanced', '阶段分辨率训练', '实验性。1024 基准使用 512/768/1024；2048 基准使用 1024/1536/2048。', [
    { key: 'enable_mixed_resolution_training', type: 'boolean', label: '启用阶段分辨率训练（enable_mixed_resolution_training）', desc: '实验性，仅支持 SDXL', defaultValue: false },
    { key: 'staged_resolution_ratio_512', type: 'number', label: '512 阶段占比 (%)（staged_resolution_ratio_512）', desc: '当最终分辨率最大边 < 512 时忽略', defaultValue: 20, min: 0, max: 100, step: 1, visibleWhen: when('enable_mixed_resolution_training', true) },
    { key: 'staged_resolution_ratio_768', type: 'number', label: '768 阶段占比 (%)（staged_resolution_ratio_768）', desc: '当最终分辨率最大边 < 768 时忽略', defaultValue: 30, min: 0, max: 100, step: 1, visibleWhen: when('enable_mixed_resolution_training', true) },
    { key: 'staged_resolution_ratio_1024', type: 'number', label: '1024 阶段占比 (%)（staged_resolution_ratio_1024）', desc: '1024 基准和 2048 基准都会用到', defaultValue: 50, min: 0, max: 100, step: 1, visibleWhen: when('enable_mixed_resolution_training', true) },
    { key: 'staged_resolution_ratio_1536', type: 'number', label: '1536 阶段占比 (%)（staged_resolution_ratio_1536）', desc: '仅 2048 基准会用到', defaultValue: 30, min: 0, max: 100, step: 1, visibleWhen: when('enable_mixed_resolution_training', true) },
    { key: 'staged_resolution_ratio_2048', type: 'number', label: '2048 阶段占比 (%)（staged_resolution_ratio_2048）', desc: '仅 2048 基准会用到', defaultValue: 50, min: 0, max: 100, step: 1, visibleWhen: when('enable_mixed_resolution_training', true) },
  ]),
  sec('preview-settings', 'preview', '预览图设置', '训练中生成预览图。', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('lulynx-settings', 'advanced', 'Lulynx 实验核心 (SDXL)', 'SafeGuard、EMA、ResourceManager、BlockWeight (SDXL 分层)、SmartRank、AutoController。', S_LULYNX_SDXL),
  sec('speed-settings', 'speed', '速度优化', '混合精度、缓存与注意力后端。', [...S_SPEED_SDXL]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '噪声、种子与实验功能。', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];


// ---- SD 1.5 LoRA ----
const SD15_LORA_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'SD1.5 底模与恢复训练。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'sd-lora' },
    { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'SD1.5 底模路径（pretrained_model_name_or_path）', desc: '底模文件路径', defaultValue: './sd-models/model.safetensors' },
    { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '从某个 save_state 保存的中断状态继续训练，填写文件路径', defaultValue: '' },
    { key: 'vae', type: 'file', pickerType: 'model-file', label: 'VAE 路径（vae）', desc: '(可选) VAE 模型文件路径，使用外置 VAE 文件覆盖模型内本身的', defaultValue: '' },
    { key: 'network_weights', type: 'file', pickerType: 'output-model-file', label: '继续训练 LoRA（network_weights）', desc: '从已有的 LoRA 模型上继续训练，填写路径', defaultValue: '' },
    { key: 'v2', type: 'boolean', label: 'SD 2.x 模型（v2）', desc: '使用 SD 2.x 模型', defaultValue: false },
    { key: 'v_parameterization', type: 'boolean', label: 'V 参数化（v_parameterization）', desc: 'v-parameterization 学习（训练 Illustrious 等 v-pred 模型时需要开启）', defaultValue: false },
  ]),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('512,512', 1024, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', [...S_CAPTION]),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('network-settings', 'network', '网络设置', '', netLora('networks.lora', 32, 32, 256)),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(10)),
  sec('rf-settings', 'training', 'Rectified Flow', 'RF / Flow Matching 训练目标与时间步策略。', rectifiedFlowParams()),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_SD15]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];

// ---- FLUX LoRA ----
const FLUX_LORA_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'FLUX 模型路径。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'flux-lora' },
    { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'FLUX 模型路径（pretrained_model_name_or_path）', desc: '底模文件路径', defaultValue: './sd-models/model.safetensors' },
    { key: 'ae', type: 'file', pickerType: 'model-file', label: 'AE 模型路径（ae）', desc: 'AutoEncoder 模型路径', defaultValue: '' },
    { key: 'clip_l', type: 'file', pickerType: 'model-file', label: 'CLIP-L 路径（clip_l）', desc: 'CLIP-L 文本编码器路径', defaultValue: '' },
    { key: 't5xxl', type: 'file', pickerType: 'model-file', label: 'T5-XXL 路径（t5xxl）', desc: 'T5-XXL 文本编码器路径', defaultValue: '' },
    { key: 'network_weights', type: 'file', pickerType: 'output-model-file', label: '继续训练 LoRA（network_weights）', desc: '从已有的 LoRA 模型上继续训练，填写路径', defaultValue: '' },

    { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '从某个 save_state 保存的中断状态继续训练，填写文件路径', defaultValue: '' },
  ]),
  sec('flux-params', 'model', 'FLUX 专用参数', '时间步采样、CFG、损失函数等。', [
    ...flowParams({ ts: 'sigmoid', gs: 1.0 }),
    { key: 't5xxl_max_token_length', type: 'number', label: 'T5XXL 最大 token（t5xxl_max_token_length）', desc: 'T5-XXL 最大 token 长度', defaultValue: '', min: 1 },
    { key: 'apply_t5_attn_mask', type: 'boolean', label: '应用 T5 注意力掩码（apply_t5_attn_mask）', desc: '应用 T5 注意力掩码以更好处理变长文本', defaultValue: true },
    { key: 'train_t5xxl', type: 'boolean', label: '训练T5XXL（不推荐）（train_t5xxl）', desc: '训练 T5-XXL 文本编码器（不推荐，显存开销极大）', defaultValue: false },
  ]),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('768,768', 2048, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', S_CAPTION.filter((f) => f.key !== 'max_token_length')),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('network-settings', 'network', '网络设置', 'LoRA / T-LoRA / OFT / LyCORIS。', netLora('networks.lora_flux', 4, 16, 256, [
    { key: 'tlora_min_rank', type: 'number', label: 'T-LoRA 最小 Rank（tlora_min_rank）', desc: 'T-LoRA 最小动态 rank。仅在 network_module=networks.tlora_flux 时生效', defaultValue: 1, min: 1, visibleWhen: when('network_module', 'networks.tlora_flux') },
    { key: 'tlora_rank_schedule', type: 'select', label: 'T-LoRA Rank 调度（tlora_rank_schedule）', desc: 'T-LoRA 动态 rank 调度策略', defaultValue: 'cosine', options: ['cosine', 'linear'], visibleWhen: when('network_module', 'networks.tlora_flux') },
    { key: 'tlora_orthogonal_init', type: 'boolean', label: 'T-LoRA 正交初始化（tlora_orthogonal_init）', desc: 'T-LoRA 对 lora_down 使用正交初始化（实验性）', defaultValue: false, visibleWhen: when('network_module', 'networks.tlora_flux') },
  ], ['networks.tlora_flux', 'networks.oft_flux'])),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(20)),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_FLOW]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];

// ---- SD3 LoRA ----
const SD3_LORA_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'SD3 模型路径。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'sd3-lora' },
    { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'SD3 模型路径（pretrained_model_name_or_path）', desc: '底模文件路径', defaultValue: './sd-models/model.safetensors' },
    { key: 'clip_l', type: 'file', pickerType: 'model-file', label: 'CLIP-L 路径（clip_l）', desc: 'CLIP-L 文本编码器路径', defaultValue: '' },
    { key: 'clip_g', type: 'file', pickerType: 'model-file', label: 'CLIP-G 路径（clip_g）', desc: 'CLIP-G 文本编码器路径', defaultValue: '' },
    { key: 't5xxl', type: 'file', pickerType: 'model-file', label: 'T5-XXL 路径（t5xxl）', desc: 'T5-XXL 文本编码器路径', defaultValue: '' },
    { key: 'network_weights', type: 'file', pickerType: 'output-model-file', label: '继续训练 LoRA（network_weights）', desc: '从已有的 LoRA 模型上继续训练，填写路径', defaultValue: '' },
    { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '从某个 save_state 保存的中断状态继续训练，填写文件路径', defaultValue: '' },
  ]),
  sec('sd3-params', 'model', 'SD3 专用参数', '', [
    { key: 'weighting_scheme', type: 'select', label: '权重策略（weighting_scheme）', desc: '权重策略', defaultValue: 'uniform', options: ['sigma_sqrt', 'logit_normal', 'mode', 'cosmap', 'none', 'uniform'] },
    { key: 't5xxl_max_token_length', type: 'number', label: 'T5XXL 最大 token（t5xxl_max_token_length）', desc: 'T5-XXL 最大 token 长度', defaultValue: '', min: 1 },
    { key: 'apply_lg_attn_mask', type: 'boolean', label: '应用 CLIP-L/G 注意力掩码（apply_lg_attn_mask）', desc: '应用 CLIP-L/G 注意力掩码', defaultValue: false },
    { key: 'train_t5xxl', type: 'boolean', label: '训练 T5XXL（train_t5xxl）', desc: '训练 T5-XXL 文本编码器（不推荐，显存开销极大）', defaultValue: false },
    { key: 'clip_l_dropout_rate', type: 'number', label: 'CLIP-L dropout', desc: 'CLIP-L 文本编码器随机丢弃概率', defaultValue: '', min: 0, max: 1, step: 0.01 },
    { key: 'clip_g_dropout_rate', type: 'number', label: 'CLIP-G dropout', desc: 'CLIP-G 文本编码器随机丢弃概率', defaultValue: '', min: 0, max: 1, step: 0.01 },
    { key: 't5_dropout_rate', type: 'number', label: 'T5 dropout', desc: 'T5 文本编码器随机丢弃概率', defaultValue: '', min: 0, max: 1, step: 0.01 },
  ]),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('768,768', 2048, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', S_CAPTION.filter((f) => f.key !== 'max_token_length')),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('network-settings', 'network', '网络设置', '', netLora('networks.lora_sd3', 4, 1, 256)),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(20)),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_FLOW]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];

// ---- Lumina LoRA ----
const LUMINA_LORA_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'Lumina 模型路径。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'lumina-lora' },
    { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'Lumina 模型路径（pretrained_model_name_or_path）', desc: '底模文件路径', defaultValue: './sd-models/model.safetensors' },
    { key: 'ae', type: 'file', pickerType: 'model-file', label: 'AE 模型路径（ae）', desc: 'AutoEncoder 模型路径', defaultValue: '' },
    { key: 'gemma2', type: 'file', pickerType: 'model-file', label: 'Gemma2 模型路径（gemma2）', desc: 'Gemma2 文本模型路径', defaultValue: '' },
    { key: 'network_weights', type: 'file', pickerType: 'output-model-file', label: '继续训练 LoRA（network_weights）', desc: '从已有的 LoRA 模型上继续训练，填写路径', defaultValue: '' },

    { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '从某个 save_state 保存的中断状态继续训练，填写文件路径', defaultValue: '' },
  ]),
  sec('lumina-params', 'model', 'Lumina 专用参数', '', [
    ...flowParams({ ts: 'shift', dfs: 6.0 }),
    { key: 'gemma2_max_token_length', type: 'number', label: 'Gemma2 最大 token（gemma2_max_token_length）', desc: 'Gemma2 最大 token 长度', defaultValue: '', min: 1 },
    { key: 'use_flash_attn', type: 'boolean', label: '启用 Flash Attention（use_flash_attn）', desc: '启用 Flash Attention 加速', defaultValue: false },
    { key: 'use_sage_attn', type: 'boolean', label: '启用 Sage Attention（use_sage_attn）', desc: '启用 Sage Attention 加速', defaultValue: false },
    { key: 'renorm_cfg', type: 'number', label: '重归一化 CFG（renorm_cfg）', desc: '重归一化 CFG', defaultValue: '', step: 0.01 },
    { key: 'system_prompt', type: 'string', label: '系统提示词（system_prompt）', desc: 'Lumina 系统提示词', defaultValue: '' },
    { key: 'sample_batch_size', type: 'number', label: '预览图采样批量（sample_batch_size）', desc: '预览图采样批量大小', defaultValue: '', min: 1 },
  ]),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('1024,1024', 2048, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', S_CAPTION.filter((f) => f.key !== 'max_token_length')),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('network-settings', 'network', '网络设置', '', netLora('networks.lora_lumina', 4, 16, 256)),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(10)),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_FLOW]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];

// ---- HunyuanImage LoRA ----
const HUNYUAN_LORA_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', '混元图像模型路径。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'hunyuan-image-lora' },
    { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'HunyuanImage 模型路径（pretrained_model_name_or_path）', desc: '底模文件路径', defaultValue: './sd-models/model.safetensors' },
    { key: 'text_encoder', type: 'file', pickerType: 'model-file', label: 'Qwen2.5-VL 文本编码器（text_encoder）', desc: '文本编码器路径', defaultValue: '' },
    { key: 'byt5', type: 'file', pickerType: 'model-file', label: 'ByT5 模型路径（byt5）', desc: 'ByT5 模型路径', defaultValue: '' },
    { key: 'network_weights', type: 'file', pickerType: 'output-model-file', label: '继续训练 LoRA（network_weights）', desc: '从已有的 LoRA 模型上继续训练，填写路径', defaultValue: '' },

    { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '从某个 save_state 保存的中断状态继续训练，填写文件路径', defaultValue: '' },
  ]),
  sec('hunyuan-params', 'model', 'HunyuanImage 专用参数', '', [
    ...flowParams({ ts: 'sigma', dfs: 5.0 }),
    { key: 'attn_mode', type: 'select', label: 'Attention 实现（attn_mode）', desc: 'Attention 实现方式', defaultValue: '', options: ['', 'torch', 'xformers', 'flash', 'sageattn'] },
    { key: 'mode_scale', type: 'number', label: 'mode 权重缩放（mode_scale）', desc: 'mode 权重策略的缩放系数', defaultValue: '', step: 0.01 },
    { key: 'split_attn', type: 'boolean', label: '拆分 attention（split_attn）', desc: '拆分 attention 以节省显存', defaultValue: false },
    { key: 'text_encoder_cpu', type: 'boolean', label: '文本编码器用 CPU（text_encoder_cpu）', desc: '将文本编码器放在 CPU 上以节省显存', defaultValue: false },
    { key: 'vae_chunk_size', type: 'number', label: 'VAE 解码分块（vae_chunk_size）', desc: 'VAE 解码时的分块大小，更小值更省显存', defaultValue: '', min: 1 },
  ]),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('1024,1024', 2048, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', S_CAPTION.filter((f) => f.key !== 'max_token_length')),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('network-settings', 'network', '网络设置', '', netLora('networks.lora_hunyuan_image', 16, 16, 256)),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(10)),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_FLOW]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];

// ---- Anima LoRA ----
const ANIMA_LORA_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'Anima 模型路径。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'anima-lora' },
    { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'Anima DiT 权重路径（pretrained_model_name_or_path）', desc: '底模文件路径', defaultValue: './sd-models/model.safetensors' },
    { key: 'vae', type: 'file', pickerType: 'model-file', label: 'Qwen Image VAE 路径（vae）', desc: '(可选) VAE 模型文件路径，使用外置 VAE 文件覆盖模型内本身的', defaultValue: '' },
    { key: 'qwen3', type: 'file', pickerType: 'model-file', label: 'Qwen3 文本模型路径（qwen3）', desc: 'Qwen3 文本模型路径', defaultValue: '' },
    { key: 'llm_adapter_path', type: 'file', pickerType: 'model-file', label: 'LLM Adapter 路径（llm_adapter_path）', desc: 'LLM Adapter 路径', defaultValue: '' },
    { key: 'network_weights', type: 'file', pickerType: 'output-model-file', label: '继续训练 LoRA（network_weights）', desc: '从已有的 LoRA 模型上继续训练，填写路径', defaultValue: '' },
    { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '从某个 save_state 保存的中断状态继续训练，填写文件路径', defaultValue: '' },
  ]),
  sec('anima-params', 'model', 'Anima 专用参数', '', [
    ...flowParams({ ts: 'shift', dfs: 3.0 }),
    { key: 'qwen3_max_token_length', type: 'number', label: 'Qwen3 最大 token（qwen3_max_token_length）', desc: 'Qwen3 最大 token 长度', defaultValue: 512, min: 1 },
    { key: 'mode_scale', type: 'number', label: 'mode 权重缩放（mode_scale）', desc: 'mode 权重策略的缩放系数', defaultValue: '', step: 0.01 },
    { key: 't5_max_token_length', type: 'number', label: 'T5 最大 token（t5_max_token_length）', desc: 'T5 最大 token 长度', defaultValue: 512, min: 1 },
    { key: 'split_attn', type: 'boolean', label: '拆分 attention（split_attn）', desc: '拆分 attention 以节省显存', defaultValue: false },
    { key: 'vae_chunk_size', type: 'number', label: 'VAE 分块大小（vae_chunk_size）', desc: 'VAE 解码时的分块大小，更小值更省显存', defaultValue: '', min: 2 },
  ]),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('1024,1024', 2048, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', S_CAPTION.filter((f) => f.key !== 'max_token_length')),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('network-settings', 'network', '网络设置', 'LoRA / T-LoRA / LoKr 模式。', [
    { key: 'lora_type', type: 'select', label: '适配器类型（lora_type）', desc: 'LoRA 更轻量；T-LoRA 会按时间步动态 rank；LoKr 走内置线性层注入的实验路线', defaultValue: 'lora', options: ['lora', 'tlora', 'lokr'] },
    { key: 'network_dim', type: 'slider', label: '网络维度（network_dim）', desc: '网络维度，常用 4~128，不是越大越好, 低 dim 可以降低显存占用', defaultValue: 16, min: 1, max: 256, step: 1 },
    { key: 'network_alpha', type: 'slider', label: '网络 Alpha（network_alpha）', desc: '常用值：等于 network_dim 或 network_dim*1/2 或 1', defaultValue: 16, min: 1, max: 256, step: 1 },
    { key: 'dim_from_weights', type: 'boolean', label: '从权重推断 Dim（dim_from_weights）', desc: '从已有 network_weights 自动推断 rank / dim', defaultValue: false },
    { key: 'scale_weight_norms', type: 'number', label: '最大范数正则化（scale_weight_norms）', desc: '最大范数正则化。如果使用，推荐为 1', defaultValue: '', min: 0, step: 0.01 },
    { key: 'train_norm', type: 'boolean', label: '训练 Norm 层（train_norm）', desc: '额外训练带可学习参数的归一化层（如 RMSNorm/LayerNorm 的 weight/bias），让 LoRA/T-LoRA/LoKr 之外还能调整特征尺度与分布；可能提升风格/域适配，但会小幅增加显存占用和 LoRA 文件大小，也更容易过拟合，默认建议关闭。', defaultValue: false },
    { key: 'lokr_factor', type: 'number', label: 'LoKr 系数（lokr_factor）', desc: 'LoKr 系数，常用 4~无穷（-1 为无穷）', defaultValue: 8, min: -1, visibleWhen: when('lora_type', 'lokr') },
    { key: 'network_dropout', type: 'number', label: 'Dropout', desc: 'Dropout 概率', defaultValue: 0, min: 0, step: 0.01, visibleWhen: (c) => c.lora_type === 'lora' || c.lora_type === 'tlora' },
    { key: 'tlora_min_rank', type: 'number', label: 'T-LoRA 最小 Rank（tlora_min_rank）', desc: 'T-LoRA 最小动态 rank', defaultValue: 1, min: 1, visibleWhen: when('lora_type', 'tlora') },
    { key: 'tlora_rank_schedule', type: 'select', label: 'T-LoRA Rank 调度（tlora_rank_schedule）', desc: 'T-LoRA 动态 rank 调度策略', defaultValue: 'cosine', options: ['cosine', 'linear'], visibleWhen: when('lora_type', 'tlora') },
    { key: 'tlora_orthogonal_init', type: 'boolean', label: 'T-LoRA 正交初始化（tlora_orthogonal_init）', desc: '对 lora_down 使用正交初始化（实验性）', defaultValue: false, visibleWhen: when('lora_type', 'tlora') },
    { key: 'pissa_init', type: 'boolean', label: '启用 PiSSA 初始化（pissa_init）', desc: '启用 PiSSA 初始化（实验性，仅 LoRA 类型下生效）', defaultValue: false, visibleWhen: when('lora_type', 'lora') },
  ]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(10)),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_FLOW]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];

// ---- SD DreamBooth / SDXL Finetune (共用 schema) ----
const finetuneModel = (typeId, label) => [
  { key: 'model_train_type', type: 'hidden', defaultValue: typeId },
  { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: `${label} 底模路径`, desc: '底模文件路径', defaultValue: './sd-models/model.safetensors' },
  { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '从某个 save_state 保存的中断状态继续训练，填写文件路径', defaultValue: '' },
  { key: 'vae', type: 'file', pickerType: 'model-file', label: 'VAE 路径（vae）', desc: '(可选) VAE 模型文件路径，使用外置 VAE 文件覆盖模型内本身的', defaultValue: '' },
];
const DB_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'SD DreamBooth 全参微调。', [
    ...finetuneModel('sd-dreambooth', 'SD1.5'),
    { key: 'v2', type: 'boolean', label: 'SD 2.x 模型（v2）', desc: '使用 SD 2.x 模型', defaultValue: false },
    { key: 'v_parameterization', type: 'boolean', label: 'V 参数化（v_parameterization）', desc: 'v-parameterization 学习（训练 Illustrious 等 v-pred 模型时需要开启）', defaultValue: false },
  ]),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('512,512', 1024, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', [...S_CAPTION]),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(10)),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_SD15]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];
const SDXL_FT_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'SDXL 全参微调。', [
    ...finetuneModel('sdxl-finetune', 'SDXL'),
    { key: 'v_parameterization', type: 'boolean', label: 'V 参数化（v_parameterization）', desc: 'v-parameterization 学习（训练 Illustrious 等 v-pred 模型时需要开启）', defaultValue: false },
  ]),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('1024,1024', 2048, 32)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', [...S_CAPTION]),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(10)),
  sec('rf-settings', 'training', 'Rectified Flow', 'RF / Flow Matching 训练目标与时间步策略。', rectifiedFlowParams()),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_SDXL]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];

// ---- FLUX Finetune ----
const FLUX_FT_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'FLUX 全参微调。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'flux-finetune' },
    { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'FLUX 模型路径（pretrained_model_name_or_path）', desc: '底模文件路径', defaultValue: './sd-models/model.safetensors' },
    { key: 'ae', type: 'file', pickerType: 'model-file', label: 'AE 路径（ae）', desc: 'AutoEncoder 模型路径', defaultValue: '' },
    { key: 'clip_l', type: 'file', pickerType: 'model-file', label: 'CLIP-L 路径（clip_l）', desc: 'CLIP-L 文本编码器路径', defaultValue: '' },
    { key: 't5xxl', type: 'file', pickerType: 'model-file', label: 'T5-XXL 路径（t5xxl）', desc: 'T5-XXL 文本编码器路径', defaultValue: '' },
    { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '从某个 save_state 保存的中断状态继续训练，填写文件路径', defaultValue: '' },
  ]),
  sec('flux-params', 'model', 'FLUX 专用参数', '', [
    ...flowParams({ ts: 'sigma', mp: 'sigma_scaled', dfs: 3.0, gs: 3.5 }),
    { key: 't5xxl_max_token_length', type: 'number', label: 'T5XXL 最大 token（t5xxl_max_token_length）', desc: 'T5-XXL 最大 token 长度', defaultValue: '', min: 1 },
    { key: 'apply_t5_attn_mask', type: 'boolean', label: '应用 T5 注意力掩码（apply_t5_attn_mask）', desc: '应用 T5 注意力掩码以更好处理变长文本', defaultValue: false },
    { key: 'mem_eff_save', type: 'boolean', label: '省内存保存（mem_eff_save）', desc: '实验性：使用更省内存的保存方式', defaultValue: false },
    { key: 'blockwise_fused_optimizers', type: 'boolean', label: 'Blockwise fused optimizer', desc: '使用分块融合优化器，全参微调时可大幅省显存', defaultValue: false },
  ]),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('768,768', 2048, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', S_CAPTION.filter((f) => f.key !== 'max_token_length')),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(20)),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_FLOW]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];

// ---- SD3 Finetune ----
const SD3_FT_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'SD3 全参微调。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'sd3-finetune' },
    { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'SD3 模型路径（pretrained_model_name_or_path）', desc: '底模文件路径', defaultValue: './sd-models/model.safetensors' },
    { key: 'vae', type: 'file', pickerType: 'model-file', label: 'VAE 路径（vae）', desc: '(可选) VAE 模型文件路径，使用外置 VAE 文件覆盖模型内本身的', defaultValue: '' },
    { key: 'clip_l', type: 'file', pickerType: 'model-file', label: 'CLIP-L 路径（clip_l）', desc: 'CLIP-L 文本编码器路径', defaultValue: '' },
    { key: 'clip_g', type: 'file', pickerType: 'model-file', label: 'CLIP-G 路径（clip_g）', desc: 'CLIP-G 文本编码器路径', defaultValue: '' },
    { key: 't5xxl', type: 'file', pickerType: 'model-file', label: 'T5-XXL 路径（t5xxl）', desc: 'T5-XXL 文本编码器路径', defaultValue: '' },
    { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '从某个 save_state 保存的中断状态继续训练，填写文件路径', defaultValue: '' },
  ]),
  sec('sd3-params', 'model', 'SD3 专用参数', '', [
    { key: 'weighting_scheme', type: 'select', label: '权重策略（weighting_scheme）', desc: '权重策略', defaultValue: 'uniform', options: ['sigma_sqrt', 'logit_normal', 'mode', 'cosmap', 'none', 'uniform'] },
    { key: 't5xxl_max_token_length', type: 'number', label: 'T5XXL 最大 token（t5xxl_max_token_length）', desc: 'T5-XXL 最大 token 长度', defaultValue: 256, min: 1 },
    { key: 'training_shift', type: 'number', label: '训练位移（training_shift）', desc: '训练时间步偏移值', defaultValue: 1.0, step: 0.001 },
    { key: 'train_text_encoder', type: 'boolean', label: '训练 CLIP-L/G（train_text_encoder）', desc: '同时训练 CLIP-L/G 文本编码器', defaultValue: false },
    { key: 'train_t5xxl', type: 'boolean', label: '训练 T5XXL（train_t5xxl）', desc: '训练 T5-XXL 文本编码器（不推荐，显存开销极大）', defaultValue: false },
    { key: 'blockwise_fused_optimizers', type: 'boolean', label: 'Blockwise fused optimizer', desc: '使用分块融合优化器，全参微调时可大幅省显存', defaultValue: false },
  ]),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('1024,1024', 2048, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', S_CAPTION.filter((f) => f.key !== 'max_token_length')),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(20)),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_FLOW]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];

// ---- Lumina Finetune ----
const LUMINA_FT_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'Lumina 全参微调。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'lumina-finetune' },
    { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'Lumina 模型路径（pretrained_model_name_or_path）', desc: 'Lumina 模型路径', defaultValue: './sd-models/model.safetensors' },
    { key: 'ae', type: 'file', pickerType: 'model-file', label: 'AE 路径（ae）', desc: 'AE 路径', defaultValue: '' },
    { key: 'gemma2', type: 'file', pickerType: 'model-file', label: 'Gemma2 路径（gemma2）', desc: 'Gemma2 路径', defaultValue: '' },
    { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '继续训练路径', defaultValue: '' },
  ]),
  sec('lumina-params', 'model', 'Lumina 专用参数', '', [
    ...flowParams({ ts: 'shift', dfs: 6.0 }),
    { key: 'gemma2_max_token_length', type: 'number', label: 'Gemma2 最大 token（gemma2_max_token_length）', desc: 'Gemma2 最大 token', defaultValue: '', min: 1 },
    { key: 'use_flash_attn', type: 'boolean', label: '启用 Flash Attention（use_flash_attn）', desc: '启用 Flash Attention', defaultValue: false },
    { key: 'use_sage_attn', type: 'boolean', label: '启用 Sage Attention（use_sage_attn）', desc: '启用 Sage Attention', defaultValue: false },
    { key: 'renorm_cfg', type: 'number', label: '重归一化 CFG（renorm_cfg）', desc: '重归一化 CFG', defaultValue: '', step: 0.01 },
    { key: 'sample_batch_size', type: 'number', label: '预览图采样批量（sample_batch_size）', desc: '预览图采样批量大小', defaultValue: '', min: 1 },
    { key: 'mem_eff_save', type: 'boolean', label: '省内存保存（mem_eff_save）', desc: '实验性：使用更省内存的保存方式', defaultValue: false },
  ]),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('1024,1024', 2048, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', S_CAPTION.filter((f) => f.key !== 'max_token_length')),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(10)),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_FLOW]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];

// ---- Anima Finetune ----
const ANIMA_FT_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'Anima 全参微调。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'anima-finetune' },
    { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'Anima DiT 路径（pretrained_model_name_or_path）', desc: 'Anima DiT 路径', defaultValue: './sd-models/model.safetensors' },
    { key: 'vae', type: 'file', pickerType: 'model-file', label: 'Qwen Image VAE 路径（vae）', desc: 'Qwen Image VAE 路径', defaultValue: '' },
    { key: 'qwen3', type: 'file', pickerType: 'model-file', label: 'Qwen3 文本模型路径（qwen3）', desc: 'Qwen3 文本模型路径', defaultValue: '' },
    { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '继续训练路径', defaultValue: '' },
  ]),
  sec('anima-params', 'model', 'Anima 专用参数', '', [
    ...flowParams({ ts: 'shift', dfs: 3.0 }),
    { key: 'qwen3_max_token_length', type: 'number', label: 'Qwen3 最大 token（qwen3_max_token_length）', desc: 'Qwen3 最大 token', defaultValue: 512, min: 1 },
    { key: 'mode_scale', type: 'number', label: 'mode 权重缩放（mode_scale）', desc: 'mode 权重策略的缩放系数', defaultValue: '', step: 0.01 },
    { key: 't5_max_token_length', type: 'number', label: 'T5 最大 token（t5_max_token_length）', desc: 'T5 最大 token', defaultValue: 512, min: 1 },
    { key: 'split_attn', type: 'boolean', label: '拆分 attention（split_attn）', desc: '拆分 attention', defaultValue: false },
  ]),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('1024,1024', 2048, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', S_CAPTION.filter((f) => f.key !== 'max_token_length')),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(10)),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_FLOW]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];

// ---- ControlNet (SD / SDXL / FLUX) ----
const cnModel = (typeId, label, extra = []) => [
  { key: 'model_train_type', type: 'hidden', defaultValue: typeId },
  { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: `${label} 底模路径`, desc: '底模文件路径', defaultValue: './sd-models/model.safetensors' },
  { key: 'controlnet_model_name_or_path', type: 'file', pickerType: 'model-file', label: '已有 ControlNet 模型路径（controlnet_model_name_or_path）', desc: '留空从头训练。', defaultValue: '' },
  { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '继续训练路径', defaultValue: '' },
  { key: 'vae', type: 'file', pickerType: 'model-file', label: 'VAE 路径（vae）', desc: 'VAE 路径', defaultValue: '' },
  ...extra,
];
const cnDataset = (reso, bucketMax, bucketStep) => [
  { key: 'train_data_dir', type: 'folder', pickerType: 'folder', label: '训练数据集路径（train_data_dir）', desc: '训练数据集路径', defaultValue: './train/aki' },
  { key: 'conditioning_data_dir', type: 'folder', pickerType: 'folder', label: '条件图数据集路径（conditioning_data_dir）', desc: '条件图数据集路径', defaultValue: '' },
  { key: 'resolution', type: 'string', label: '训练分辨率（resolution）', desc: '训练分辨率', defaultValue: reso },
  { key: 'enable_bucket', type: 'boolean', label: '启用分桶（enable_bucket）', desc: '启用分桶', defaultValue: true },
  { key: 'min_bucket_reso', type: 'number', label: '桶最小分辨率（min_bucket_reso）', desc: '桶最小分辨率', defaultValue: 256 },
  { key: 'max_bucket_reso', type: 'number', label: '桶最大分辨率（max_bucket_reso）', desc: '桶最大分辨率', defaultValue: bucketMax },
  { key: 'bucket_reso_steps', type: 'number', label: '桶划分单位（bucket_reso_steps）', desc: '桶划分单位', defaultValue: bucketStep },
];
const cnTrainFields = [
  { key: 'max_train_epochs', type: 'number', label: '最大训练轮数（max_train_epochs）', desc: '最大训练轮数', defaultValue: 10, min: 1 },
  { key: 'train_batch_size', type: 'slider', label: '批量大小（train_batch_size）', desc: '批量大小', defaultValue: 1, min: 1, max: 32, step: 1 },
  { key: 'gradient_checkpointing', type: 'boolean', label: '梯度检查点（gradient_checkpointing）', desc: '梯度检查点', defaultValue: false },
  { key: 'gradient_accumulation_steps', type: 'number', label: '梯度累加步数（gradient_accumulation_steps）', desc: '梯度累加步数', defaultValue: 1, min: 1 },
  { key: 'max_grad_norm', type: 'number', label: '梯度裁剪上限（max_grad_norm）', desc: '梯度裁剪上限', defaultValue: 1.0, min: 0, step: 0.1 },
];
const cnLR = [
  { key: 'learning_rate', type: 'string', label: '学习率（learning_rate）', desc: '学习率', defaultValue: '1e-4' },
  { key: 'control_net_lr', type: 'string', label: 'ControlNet 学习率（control_net_lr）', desc: 'ControlNet 学习率', defaultValue: '1e-4' },
  { key: 'lr_scheduler', type: 'select', label: '学习率调度器（lr_scheduler）', desc: '学习率调度器；选择 torch.optim.* / pytorch_optimizer.* 等自定义项时会自动写入 lr_scheduler_type', defaultValue: 'cosine_with_restarts', options: ALL_SCHEDULERS },
  { key: 'lr_warmup_steps', type: 'number', label: '预热步数（lr_warmup_steps）', desc: '预热步数', defaultValue: 0, min: 0 },
  { key: 'optimizer_type', type: 'select', label: '优化器（optimizer_type）', desc: '优化器。pytorch_optimizer.* / bitsandbytes.optim.* 会按完整类路径传给后端', defaultValue: 'AdamW8bit', options: ALL_OPTIMIZERS },
];
const SD_CN_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'SD1.5 ControlNet。', cnModel('sd-controlnet', 'SD1.5', [{ key: 'v2', type: 'boolean', label: 'SD 2.x', desc: 'SD 2.x', defaultValue: false }])),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', cnDataset('512,512', 1024, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', [...S_CAPTION]),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...cnLR]),
  sec('training-settings', 'training', '训练参数', '', [...cnTrainFields]),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_SD15]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];
const SDXL_CN_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'SDXL ControlNet。', cnModel('sdxl-controlnet', 'SDXL', [{ key: 'v_parameterization', type: 'boolean', label: 'V 参数化（v_parameterization）', desc: 'V 参数化', defaultValue: false }])),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', cnDataset('1024,1024', 2048, 32)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', [...S_CAPTION]),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...cnLR]),
  sec('training-settings', 'training', '训练参数', '', [...cnTrainFields]),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_SDXL]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];
const FLUX_CN_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'FLUX ControlNet。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'flux-controlnet' },
    { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'FLUX 模型路径（pretrained_model_name_or_path）', desc: 'FLUX 模型路径', defaultValue: './sd-models/model.safetensors' },
    { key: 'ae', type: 'file', pickerType: 'model-file', label: 'AE 路径（ae）', desc: 'AE 路径', defaultValue: '' },
    { key: 'clip_l', type: 'file', pickerType: 'model-file', label: 'CLIP-L 路径（clip_l）', desc: 'CLIP-L 路径', defaultValue: '' },
    { key: 't5xxl', type: 'file', pickerType: 'model-file', label: 'T5-XXL 路径（t5xxl）', desc: 'T5-XXL 路径', defaultValue: '' },
    { key: 'controlnet_model_name_or_path', type: 'file', pickerType: 'model-file', label: '已有 ControlNet 路径（controlnet_model_name_or_path）', desc: '已有 ControlNet 路径', defaultValue: '' },
    { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '继续训练路径', defaultValue: '' },
  ]),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', cnDataset('768,768', 2048, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', S_CAPTION.filter((f) => f.key !== 'max_token_length')),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...cnLR]),
  sec('training-settings', 'training', '训练参数', '', [...cnTrainFields]),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_FLOW]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];

// ---- Textual Inversion ----
const tiModel = (typeId, label, extra = []) => [
  { key: 'model_train_type', type: 'hidden', defaultValue: typeId },
  { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: `${label} 底模路径`, desc: '底模文件路径', defaultValue: './sd-models/model.safetensors' },
  { key: 'weights', type: 'file', pickerType: 'model-file', label: '初始 embedding 权重路径（weights）', desc: '初始 embedding 权重路径', defaultValue: '' },
  { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '继续训练路径', defaultValue: '' },
  { key: 'vae', type: 'file', pickerType: 'model-file', label: 'VAE 路径（vae）', desc: 'VAE 路径', defaultValue: '' },
  ...extra,
];
const tiParams = [
  { key: 'token_string', type: 'string', label: 'Token 字符串（token_string）', desc: 'tokenizer 中不存在的新 token。', defaultValue: '' },
  { key: 'init_word', type: 'string', label: '初始化词（init_word）', desc: '初始化词', defaultValue: '' },
  { key: 'num_vectors_per_token', type: 'number', label: '每 token 向量数（num_vectors_per_token）', desc: '每 token 向量数', defaultValue: 1, min: 1 },
  { key: 'use_object_template', type: 'boolean', label: '使用物体模板（use_object_template）', desc: '使用物体模板', defaultValue: false },
  { key: 'use_style_template', type: 'boolean', label: '使用风格模板（use_style_template）', desc: '使用风格模板', defaultValue: false },
];
const SD_TI_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'SD1.5 Textual Inversion。', tiModel('sd-textual-inversion', 'SD1.5', [{ key: 'v2', type: 'boolean', label: 'SD 2.x', desc: 'SD 2.x', defaultValue: false }])),
  sec('ti-params', 'model', 'Textual Inversion 专用', '', [...tiParams]),
  sec('save-settings', 'model', '保存设置', '', S_SAVE.map((f) => f.key === 'save_model_as' ? { ...f, defaultValue: 'pt' } : f.key === 'output_name' ? { ...f, defaultValue: 'embedding' } : f)),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('512,512', 1024, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', [...S_CAPTION]),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(10)),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_SD15]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];
const SDXL_TI_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'SDXL Textual Inversion。', tiModel('sdxl-textual-inversion', 'SDXL')),
  sec('ti-params', 'model', 'Textual Inversion 专用', '', [...tiParams]),
  sec('save-settings', 'model', '保存设置', '', S_SAVE.map((f) => f.key === 'save_model_as' ? { ...f, defaultValue: 'pt' } : f.key === 'output_name' ? { ...f, defaultValue: 'embedding' } : f)),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('1024,1024', 2048, 32)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', [...S_CAPTION]),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(10)),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_SDXL]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];

// ---- YOLO 训练 ----
const YOLO_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'YOLO 模型配置。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'yolo' },
    { key: 'pretrained_model_name_or_path', type: 'string', label: 'YOLO 模型权重（pretrained_model_name_or_path）', desc: 'YOLO 模型权重或模型 yaml。可填本地路径或官方模型名如 yolo11n.pt', defaultValue: 'yolo11n.pt' },
    { key: 'resume', type: 'file', pickerType: 'model-file', label: '继续训练检查点（resume）', desc: '从已有 YOLO 训练检查点继续训练。填写 last.pt 一类的检查点文件路径', defaultValue: '' },
  ]),
  sec('dataset-settings', 'dataset', '数据集设置', 'YOLO 数据集目录与类别。', [
    { key: 'yolo_data_config_path', type: 'file', pickerType: 'model-file', label: '自定义数据集 yaml（yolo_data_config_path）', desc: '可选。自定义 YOLO 数据集 yaml。填写后下方训练/验证目录仅作参考', defaultValue: '' },
    { key: 'train_data_dir', type: 'folder', pickerType: 'folder', label: '训练图像目录（train_data_dir）', desc: '训练图像目录', defaultValue: './datasets/images/train' },
    { key: 'val_data_dir', type: 'folder', pickerType: 'folder', label: '验证图像目录（val_data_dir）', desc: '验证图像目录。留空时回退为训练目录', defaultValue: './datasets/images/val' },
    { key: 'class_names', type: 'textarea', label: '类别名称（class_names）', desc: '类别名称，一行一个', defaultValue: 'class0' },
  ]),
  sec('save-settings', 'model', '保存设置', '', [
    { key: 'output_name', type: 'string', label: '输出名称（output_name）', desc: '本次训练输出名称', defaultValue: 'exp' },
    { key: 'output_dir', type: 'folder', pickerType: 'folder', label: '输出目录（output_dir）', desc: '训练输出目录', defaultValue: './output/yolo' },
    { key: 'save_every_n_epochs', type: 'number', label: '每 N 轮保存（save_every_n_epochs）', desc: '每 N 个 epoch 保存一次检查点', defaultValue: 10, min: 1 },
  ]),
  sec('training-settings', 'training', '训练参数', '', [
    { key: 'epochs', type: 'number', label: '训练轮数（epochs）', desc: '训练 epoch 数', defaultValue: 100, min: 1 },
    { key: 'batch', type: 'number', label: '批量大小（batch）', desc: '训练批量大小', defaultValue: 16, min: 1 },
    { key: 'imgsz', type: 'number', label: '输入分辨率（imgsz）', desc: '训练输入分辨率', defaultValue: 640, min: 32 },
    { key: 'workers', type: 'number', label: '数据加载 Worker（workers）', desc: '数据加载 worker 数量', defaultValue: 8, min: 0 },
    { key: 'device', type: 'string', label: '设备（device）', desc: '手动指定设备，如 0、0,1、cpu。留空自动检测', defaultValue: '' },
    { key: 'seed', type: 'number', label: '随机种子（seed）', desc: '随机种子', defaultValue: 1337 },
  ]),
];

// ---- 美学评分模型训练 ----
const AESTHETIC_SCORER_SECTIONS = [
  sec('output-settings', 'model', '输出设置', '模型输出配置。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'aesthetic-scorer' },
    { key: 'output_name', type: 'string', label: '模型保存名称（output_name）', desc: '模型保存名称', defaultValue: 'aesthetic-scorer-best' },
    { key: 'output_dir', type: 'folder', pickerType: 'folder', label: '输出目录（output_dir）', desc: '模型输出目录', defaultValue: './output/aesthetic-scorer' },
    { key: 'save_model_as', type: 'select', label: '保存格式（save_model_as）', desc: '模型保存格式', defaultValue: 'safetensors', options: ['safetensors', 'pt', 'pth', 'ckpt'] },
  ]),
  sec('dataset-settings', 'dataset', '数据集设置', '标注文件与图片配置。', [
    { key: 'annotations', type: 'file', pickerType: 'model-file', label: '标注文件路径（annotations）', desc: '标注文件路径，支持 .jsonl、.csv、.db', defaultValue: './datasets/aesthetic/annotations.jsonl' },
    { key: 'image_root', type: 'folder', pickerType: 'folder', label: '图片根目录（image_root）', desc: '图片根目录。留空时按标注文件中的路径直接解析', defaultValue: '' },
    { key: 'train_split', type: 'string', label: '训练 split（train_split）', desc: '训练 split 名称，如 train', defaultValue: '' },
    { key: 'val_split', type: 'string', label: '验证 split（val_split）', desc: '验证 split 名称，如 val', defaultValue: '' },
    { key: 'val_ratio', type: 'number', label: '验证集比例（val_ratio）', desc: '未使用 split 时按比例随机切分验证集', defaultValue: 0.1, min: 0.01, max: 0.99, step: 0.01 },
    { key: 'target_dims', type: 'textarea', label: '评分维度（target_dims）', desc: '参与训练的评分维度，一行一个', defaultValue: 'aesthetic\ncomposition\ncolor\nsexual' },
  ]),
  sec('training-settings', 'training', '训练参数', '', [
    { key: 'batch_size', type: 'number', label: '批量大小（batch_size）', desc: '训练 batch size', defaultValue: 8, min: 1 },
    { key: 'num_workers', type: 'number', label: 'DataLoader Worker', desc: 'DataLoader worker 数', defaultValue: 4, min: 0 },
    { key: 'epochs', type: 'number', label: '训练轮数（epochs）', desc: '训练轮数', defaultValue: 10, min: 1 },
    { key: 'learning_rate', type: 'string', label: '学习率（learning_rate）', desc: '学习率', defaultValue: '3e-4' },
    { key: 'weight_decay', type: 'string', label: '权重衰减（weight_decay）', desc: '权重衰减', defaultValue: '1e-4' },
    { key: 'loss', type: 'select', label: '损失函数（loss）', desc: '回归损失函数', defaultValue: 'mse', options: ['mse', 'smooth_l1'] },
    { key: 'cls_loss_weight', type: 'number', label: '分类损失权重（cls_loss_weight）', desc: 'in_domain 二分类损失权重', defaultValue: 1.0, min: 0, step: 0.1 },
    { key: 'cls_pos_weight', type: 'string', label: '正样本权重（cls_pos_weight）', desc: '分类正样本权重。留空不额外加权', defaultValue: '' },
    { key: 'seed', type: 'number', label: '随机种子（seed）', desc: '随机种子', defaultValue: 42 },
    { key: 'device', type: 'string', label: '设备（device）', desc: 'cuda、cuda:0、cpu', defaultValue: 'cuda' },
  ]),
  sec('head-settings', 'network', '融合头设置', 'Fusion head 参数。', [
    { key: 'hidden_dims', type: 'string', label: '隐层维度（hidden_dims）', desc: 'Fusion head 隐层维度，逗号分隔', defaultValue: '1024,256' },
    { key: 'dropout', type: 'number', label: 'Dropout', desc: 'Fusion head dropout', defaultValue: 0.2, min: 0, max: 1, step: 0.01 },
    { key: 'freeze_extractors', type: 'boolean', label: '冻结提取器（freeze_extractors）', desc: '冻结 JTP-3 与 Waifu CLIP 特征提取器', defaultValue: true },
    { key: 'include_waifu_score', type: 'boolean', label: '启用 Waifu 分支（include_waifu_score）', desc: '启用 Waifu Scorer v3 额外分支特征', defaultValue: true },
  ]),
  sec('extractor-settings', 'advanced', '特征提取器设置', '', [
    { key: 'jtp3_model_id', type: 'string', label: 'JTP-3 模型 ID（jtp3_model_id）', desc: 'JTP-3 模型 ID 或本地目录', defaultValue: 'RedRocket/JTP-3' },
    { key: 'jtp3_fallback_model_id', type: 'string', label: 'JTP-3 回退模型（jtp3_fallback_model_id）', desc: 'JTP-3 加载失败时的回退模型 ID', defaultValue: '' },
    { key: 'hf_token_env', type: 'string', label: 'HF Token 环境变量（hf_token_env）', desc: '读取 HuggingFace Token 的环境变量名', defaultValue: 'HF_TOKEN' },
    { key: 'waifu_clip_model_name', type: 'string',label: 'Waifu CLIP 模型（waifu_clip_model_name）', desc: 'Waifu CLIP 模型名称', defaultValue: 'ViT-L-14' },
    { key: 'waifu_clip_pretrained', type: 'string', label: 'CLIP 预训练（waifu_clip_pretrained）', desc: 'Waifu CLIP 预训练权重名称', defaultValue: 'openai' },
    { key: 'wv3_head_path', type: 'file', pickerType: 'model-file', label: 'Waifu v3 头部路径（wv3_head_path）', desc: 'Waifu Scorer v3 头部权重路径。留空时自动尝试内置路径', defaultValue: '' },
  ]),
];

// ---- Newbie LoRA (实验) ----
const NEWBIE_LORA_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'Newbie 基座模型与可选组件路径。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'newbie-lora' },
    { key: 'pretrained_model_name_or_path', type: 'folder', pickerType: 'folder', label: 'Newbie 基座模型目录（pretrained_model_name_or_path）', desc: '必填，要求完整本地目录', defaultValue: '' },
    { key: 'transformer_path', type: 'folder', pickerType: 'folder', label: 'Transformer 目录（transformer_path）', desc: '单独指定 transformer 目录（可选）', defaultValue: '' },
    { key: 'gemma_model_path', type: 'folder', pickerType: 'folder', label: 'Gemma 文本编码器目录（gemma_model_path）', desc: '单独指定 Gemma 文本编码器目录（可选）', defaultValue: '' },
    { key: 'clip_model_path', type: 'folder', pickerType: 'folder', label: 'Jina CLIP 目录（clip_model_path）', desc: '单独指定 Jina CLIP 目录（可选）', defaultValue: '' },
    { key: 'vae_path', type: 'folder', pickerType: 'folder', label: 'VAE 目录（vae_path）', desc: '单独指定 VAE 目录（可选）', defaultValue: '' },
    { key: 'resume', type: 'folder', pickerType: 'folder', label: '继续训练路径（resume）', desc: '从已有 checkpoint / save_state 路径继续训练（可选）', defaultValue: '' },
  ]),
  sec('dataset-settings', 'dataset', '数据集设置', '训练数据与分辨率。', [
    { key: 'train_data_dir', type: 'folder', pickerType: 'folder', label: '训练图片目录（train_data_dir）', desc: '训练图片目录', defaultValue: './train/aki' },
    { key: 'resolution', type: 'string', label: '训练分辨率（resolution）', desc: '训练分辨率，宽x高。当前建议 1024 起步', defaultValue: '1024,1024' },
    { key: 'dataloader_num_workers', type: 'number', label: 'DataLoader 线程数（dataloader_num_workers）', desc: 'DataLoader 工作线程数', defaultValue: 4, min: 0 },
    { key: 'enable_bucket', type: 'boolean', label: '启用 Bucket（enable_bucket）', desc: '启用 bucket 以适配不同宽高比素材', defaultValue: true },
    { key: 'min_bucket_reso', type: 'number', label: 'Bucket 最小分辨率（min_bucket_reso）', desc: 'bucket 最小分辨率', defaultValue: 256, min: 64 },
    { key: 'max_bucket_reso', type: 'number', label: 'Bucket 最大分辨率（max_bucket_reso）', desc: 'bucket 最大分辨率', defaultValue: 2048, min: 64 },
    { key: 'bucket_reso_steps', type: 'number', label: 'Bucket 步长（bucket_reso_steps）', desc: 'bucket 分辨率步长', defaultValue: 64, min: 1 },
    { key: 'caption_extension', type: 'string', label: 'Caption 扩展名（caption_extension）', desc: '回退读取的 caption 扩展名', defaultValue: '.txt' },
  ]),
  sec('save-settings', 'model', '训练与保存', '训练参数与输出设置。', [
    { key: 'output_dir', type: 'folder', pickerType: 'folder', label: '输出目录（output_dir）', desc: '输出目录', defaultValue: './output/newbie' },
    { key: 'output_name', type: 'string', label: '输出名称（output_name）', desc: '输出名称', defaultValue: 'newbie-lora' },
    { key: 'save_every_n_steps', type: 'number', label: '每 N 步保存（save_every_n_steps）', desc: '每 N 步保存一次。0 表示仅在训练结束时保存', defaultValue: 0, min: 0 },
    { key: 'save_every_n_epochs', type: 'number', label: '每 N 轮保存（save_every_n_epochs）', desc: '每 N 个 epoch 保存一次。0 表示每个 epoch 都保存', defaultValue: 0, min: 0 },
    { key: 'max_train_epochs', type: 'number', label: '最大训练轮数（max_train_epochs）', desc: '最大训练 epoch', defaultValue: 50, min: 1 },
    { key: 'max_train_steps', type: 'number', label: '最大训练步数（max_train_steps）', desc: '最大训练步数。0 表示按 epoch 推导', defaultValue: 0, min: 0 },
    { key: 'train_batch_size', type: 'number', label: '批量大小（train_batch_size）', desc: '单卡 batch size', defaultValue: 1, min: 1 },
    { key: 'gradient_accumulation_steps', type: 'number', label: '梯度累积（gradient_accumulation_steps）', desc: '梯度累积步数', defaultValue: 1, min: 1 },
    { key: 'gradient_checkpointing', type: 'boolean', label: '梯度检查点（gradient_checkpointing）', desc: '启用梯度检查点', defaultValue: true },
    { key: 'mixed_precision', type: 'select', label: '训练精度（mixed_precision）', desc: '训练精度', defaultValue: 'bf16', options: ['bf16', 'fp16', 'fp32'] },
    { key: 'seed', type: 'number', label: '随机种子（seed）', desc: '随机种子', defaultValue: 42 },
  ]),
  sec('optimizer-settings', 'training', '优化器与学习率', '', [
    { key: 'optimizer_type', type: 'select', label: '优化器（optimizer_type）', desc: 'Newbie 当前后端仅正式支持 AdamW8bit / AdamW', defaultValue: 'AdamW8bit', options: ['AdamW8bit', 'AdamW'] },
    { key: 'learning_rate', type: 'string', label: '学习率（learning_rate）', desc: '学习率', defaultValue: '0.0001' },
    { key: 'weight_decay', type: 'number', label: '权重衰减（weight_decay）', desc: '权重衰减', defaultValue: 0.01, min: 0, step: 0.0001 },
    { key: 'lr_scheduler', type: 'select', label: '学习率调度器（lr_scheduler）', desc: 'Newbie 使用 diffusers 调度器', defaultValue: 'cosine', options: ['linear', 'cosine', 'cosine_with_restarts', 'polynomial', 'constant', 'constant_with_warmup', 'piecewise_constant'] },
    { key: 'lr_warmup_steps', type: 'number', label: 'Warmup 步数（lr_warmup_steps）', desc: 'warmup 步数', defaultValue: 100, min: 0 },
    { key: 'max_grad_norm', type: 'number', label: '梯度裁剪（max_grad_norm）', desc: '梯度裁剪', defaultValue: 1.0, min: 0, step: 0.01 },
  ]),
  sec('peak-vram-settings', 'speed', '显存峰值控制', '目标等效 batch、启动峰值保护、micro-batch 拆分与显存诊断。', [...S_PEAK_VRAM]),

  sec('adapter-settings', 'network', '适配器设置', 'LoRA / LoKr 适配器参数。', [
    { key: 'adapter_type', type: 'select', label: '适配器类型（adapter_type）', desc: '适配器类型', defaultValue: 'lora', options: ['lora', 'lokr'] },
    { key: 'network_dim', type: 'number', label: 'Rank (Dim)', desc: 'LoRA / LoKr rank', defaultValue: 32, min: 1 },
    { key: 'network_alpha', type: 'number', label: 'Alpha', desc: 'LoRA / LoKr alpha', defaultValue: 32, min: 1 },
    { key: 'network_dropout', type: 'number', label: 'Dropout', desc: 'LoRA dropout', defaultValue: 0.05, min: 0, step: 0.01 },
    { key: 'newbie_target_modules', type: 'textarea', label: '目标模块列表（newbie_target_modules）', desc: '目标模块列表，一行一个', defaultValue: 'attention.qkv\nattention.out\nfeed_forward.w2\ntime_text_embed.1\nclip_text_pooled_proj.1' },
    { key: 'lokr_rank', type: 'number', label: 'LoKr Rank', desc: 'LoKr rank', defaultValue: 32, min: 1, visibleWhen: when('adapter_type', 'lokr') },
    { key: 'lokr_alpha', type: 'number', label: 'LoKr Alpha', desc: 'LoKr alpha', defaultValue: 32, min: 1, visibleWhen: when('adapter_type', 'lokr') },
    { key: 'lokr_factor', type: 'number', label: 'LoKr Factor', desc: 'LoKr factor。-1 表示自动', defaultValue: -1, visibleWhen: when('adapter_type', 'lokr') },
    { key: 'lokr_dropout', type: 'number', label: 'LoKr Dropout', desc: 'LoKr dropout', defaultValue: 0.05, min: 0, step: 0.01, visibleWhen: when('adapter_type', 'lokr') },
    { key: 'lokr_rank_dropout', type: 'number', label: 'LoKr Rank Dropout', desc: 'LoKr rank dropout', defaultValue: 0, min: 0, step: 0.01, visibleWhen: when('adapter_type', 'lokr') },
    { key: 'lokr_module_dropout', type: 'number', label: 'LoKr Module Dropout', desc: 'LoKr module dropout', defaultValue: 0, min: 0, step: 0.01, visibleWhen: when('adapter_type', 'lokr') },
    { key: 'lokr_train_norm', type: 'boolean', label: 'LoKr 训练 Norm（lokr_train_norm）', desc: 'LoKr 同时训练模型中的归一化层可学习参数（如 LayerNorm/RMSNorm 的缩放/偏置），可增强特征尺度与风格适配；会小幅增加显存占用和 LoRA 文件大小，并增加过拟合风险，普通训练建议先关闭。', defaultValue: false, visibleWhen: when('adapter_type', 'lokr') },
  ]),
  sec('cache-runtime-settings', 'speed', '缓存与运行时', '缓存流程控制与显存管理。', [
    { key: 'use_cache', type: 'boolean', label: '启用缓存流程（use_cache）', desc: '当前强烈建议保持开启', defaultValue: true },
    { key: 'newbie_force_cache_only', type: 'boolean', label: '仅缓存完备样本参与训练（newbie_force_cache_only）', desc: '只使用缓存完备样本进入正式训练', defaultValue: true },
    { key: 'newbie_rebuild_cache', type: 'boolean', label: '强制重建缓存（newbie_rebuild_cache）', desc: '强制重建已有缓存', defaultValue: false },
    { key: 'gemma3_prompt', type: 'textarea', label: 'Gemma3 系统提示词（gemma3_prompt）', desc: 'Gemma3 系统提示词。默认与官方模板对齐', defaultValue: 'You are an assistant designed to generate high-quality anime images with the highest degree of image-text alignment based on textual prompts. <Prompt Start>' },
    { key: 'newbie_gemma_max_token_length', type: 'number', label: 'Gemma 最大 Token（newbie_gemma_max_token_length）', desc: 'Gemma 最大 token 长度', defaultValue: 512, min: 32 },
    { key: 'newbie_clip_max_token_length', type: 'number', label: 'CLIP 最大 Token（newbie_clip_max_token_length）', desc: 'CLIP 最大 token 长度', defaultValue: 2048, min: 32 },
    { key: 'newbie_caption_length_bucket_size', type: 'number', label: 'Caption Bucket 大小（newbie_caption_length_bucket_size）', desc: 'caption 长度 bucket 大小。0 表示关闭，仅按分辨率 bucket，更贴近官方', defaultValue: 0, min: 0 },
    { key: 'blocks_to_swap', type: 'number', label: 'CPU 交换 Block 数（blocks_to_swap）', desc: '交换到 CPU 的 block 数量。0 表示关闭', defaultValue: 0, min: 0 },
    { key: 'newbie_auto_swap_release', type: 'boolean', label: '自动 Swap 释放（newbie_auto_swap_release）', desc: '开启后会在显存占用持续偏低时逐步减少 blocks_to_swap，以回收一部分训练速度', defaultValue: false },
    { key: 'cpu_offload_checkpointing', type: 'boolean', label: 'CPU 卸载检查点（cpu_offload_checkpointing）', desc: '实验性：checkpointing 时把部分张量卸载到 CPU', defaultValue: false },
    { key: 'pytorch_cuda_expandable_segments', type: 'boolean', label: '显存碎片优化（pytorch_cuda_expandable_segments）', desc: '启用 PyTorch CUDA expandable_segments 以降低碎片化 OOM', defaultValue: true },
    { key: 'newbie_safe_fallback', type: 'boolean', label: 'OOM 安全回退（newbie_safe_fallback）', desc: 'OOM 时自动尝试更保守的 Newbie 安全回退', defaultValue: true },
    { key: 'trust_remote_code', type: 'boolean', label: '允许远程代码（trust_remote_code）', desc: '允许 transformers / diffusers 加载远程自定义代码', defaultValue: true },
  ]),
  sec('log-settings', 'model', '日志设置', '', [
    { key: 'log_with', type: 'select', label: '日志模块（log_with）', desc: '日志模块', defaultValue: 'tensorboard', options: ['tensorboard', 'wandb'] },
    { key: 'logging_dir', type: 'folder', pickerType: 'folder', label: '日志保存文件夹（logging_dir）', desc: '日志保存文件夹', defaultValue: './logs' },
    { key: 'log_prefix', type: 'string', label: '日志前缀（log_prefix）', desc: '日志前缀', defaultValue: '' },
    { key: 'wandb_api_key', type: 'string', label: 'WandB API Key', desc: 'wandb 的 api 密钥', defaultValue: '', visibleWhen: when('log_with', 'wandb') },
  ]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
];



// ================================================================
// SECTIONS_MAP
// ================================================================
const SECTIONS_MAP = {
  'sdxl-lora':              SDXL_LORA_SECTIONS,
  'sd-lora':                SD15_LORA_SECTIONS,
  'flux-lora':              FLUX_LORA_SECTIONS,
  'sd3-lora':               SD3_LORA_SECTIONS,
  'lumina-lora':            LUMINA_LORA_SECTIONS,
  'hunyuan-image-lora':     HUNYUAN_LORA_SECTIONS,
  'anima-lora':             ANIMA_LORA_SECTIONS,
  'newbie-lora':            NEWBIE_LORA_SECTIONS,
  'sd-dreambooth':          DB_SECTIONS,
  'sdxl-finetune':          SDXL_FT_SECTIONS,
  'flux-finetune':          FLUX_FT_SECTIONS,
  'sd3-finetune':           SD3_FT_SECTIONS,
  'lumina-finetune':        LUMINA_FT_SECTIONS,
  'anima-finetune':         ANIMA_FT_SECTIONS,
  'sd-controlnet':          SD_CN_SECTIONS,
  'sdxl-controlnet':        SDXL_CN_SECTIONS,
  'flux-controlnet':        FLUX_CN_SECTIONS,
  'sd-textual-inversion':   SD_TI_SECTIONS,
  'sdxl-textual-inversion': SDXL_TI_SECTIONS,
  'yolo':                   YOLO_SECTIONS,
  'aesthetic-scorer':       AESTHETIC_SCORER_SECTIONS,
};

// 兼容旧名
export const SDXL_SECTIONS = SDXL_LORA_SECTIONS;

// ================================================================
// 公共 API
// ================================================================
export function getSectionsForType(typeId) {
  return SECTIONS_MAP[typeId] || SDXL_LORA_SECTIONS;
}

function buildFieldMap(sections) {
  const map = new Map();
  for (const s of sections) for (const f of s.fields) map.set(f.key, f);
  return map;
}

const _fmCache = {};
function getFieldMapForType(typeId) {
  if (!_fmCache[typeId]) _fmCache[typeId] = buildFieldMap(getSectionsForType(typeId));
  return _fmCache[typeId];
}

export function getFieldDefinition(key, typeId) {
  if (typeId) return getFieldMapForType(typeId).get(key);
  for (const sections of Object.values(SECTIONS_MAP)) {
    const map = buildFieldMap(sections);
    if (map.has(key)) return map.get(key);
  }
  return undefined;
}

export function getSectionsForTab(tabKey, typeId) {
  return getSectionsForType(typeId || 'sdxl-lora').filter((s) => s.tab === tabKey);
}

export function getAvailableTabs(typeId) {
  const sections = getSectionsForType(typeId || 'sdxl-lora');
  const tabSet = new Set();
  for (const s of sections) tabSet.add(s.tab);
  return UI_TABS.filter((t) => tabSet.has(t.key));
}

export function isFieldVisible(field, config) {
  if (!field?.visibleWhen) return true;
  return field.visibleWhen(config);
}

export function createDefaultConfig(typeId) {
  const config = {};
  for (const s of getSectionsForType(typeId || 'sdxl-lora'))
    for (const f of s.fields)
      config[f.key] = Array.isArray(f.defaultValue) ? [...f.defaultValue] : (f.defaultValue ?? '');
  return config;
}

export function normalizeDraftValue(field, rawValue) {
  if (!field) return rawValue;
  if (field.type === 'boolean') return Boolean(rawValue);
  if (field.type === 'number' || field.type === 'slider') {
    if (rawValue === '' || rawValue === null || rawValue === undefined) return '';
    const p = Number(rawValue);
    return Number.isNaN(p) ? '' : p;
  }
  return rawValue;
}

export function buildRunConfig(config, typeId) {
  const tid = typeId || config.model_train_type || 'sdxl-lora';
  const payload = {};
  // 学习率字段虽然 schema type='string'（支持 1e-4 输入），但传给后端必须是数字
  const lrKeys = new Set(['learning_rate', 'unet_lr', 'text_encoder_lr', 'control_net_lr']);
  for (const s of getSectionsForType(tid)) {
    for (const f of s.fields) {
      if (f.type !== 'hidden' && !isFieldVisible(f, config)) continue;
      const v = config[f.key];
      if (f.type === 'boolean') { payload[f.key] = Boolean(v); continue; }
      if (f.type === 'number' || f.type === 'slider') {
        if (v === '' || v == null) continue;
        const p = Number(v); if (!Number.isNaN(p)) {
          // dropout 类参数：值为 0 时不写入，避免传无效参数给后端
          if (p === 0 && (f.key === 'network_dropout' || f.key === 'dropout')) continue;
          if (f.key === 'clip_skip' && p === 2) continue;  // clip_skip=2 是界面默认值，不发送（等同旧前端不传 clip_skip）
          payload[f.key] = p;
        } continue;
      }
      if (v === '' || v == null) continue;
      if (lrKeys.has(f.key)) {
        const n = Number(v);
        if (!Number.isNaN(n)) { payload[f.key] = n; continue; }
      }
      payload[f.key] = v;
    }
  }
  payload.model_train_type = tid;

  // ── 扩展调度器显示项 → 后端自定义 lr_scheduler_type ──
  // UI 的 lr_scheduler 下拉可显示 torch.optim / pytorch_optimizer 调度器。
  // 后端 train_util 仍要求这类调度器通过 lr_scheduler_type 传入。
  if (payload.lr_scheduler && SCHEDULER_VALUE_TO_TYPE[payload.lr_scheduler]) {
    payload.lr_scheduler_type = SCHEDULER_VALUE_TO_TYPE[payload.lr_scheduler];
    payload.lr_scheduler = 'constant';
  } else if (payload.lr_scheduler && !STANDARD_SCHEDULERS.includes(payload.lr_scheduler)) {
    payload.lr_scheduler_type = payload.lr_scheduler;
    payload.lr_scheduler = 'constant';
  }

  // ── Prodigy / 自适应优化器 optimizer_args 自动组装 ──
  // 旧前端会自动生成 optimizer_args = ["decouple=True", "weight_decay=0.01", ...]
  // 新前端需要在这里复现相同逻辑，否则 Prodigy 训练结果全是噪点
  if (payload.optimizer_type === 'Prodigy') {
    const optimArgs = [];
    optimArgs.push('decouple=True');
    optimArgs.push('weight_decay=0.01');
    optimArgs.push('use_bias_correction=True');
    const dCoef = String(payload.prodigy_d_coef || '2.0').trim();
    if (dCoef && dCoef !== '0') {
      optimArgs.push('d_coef=' + dCoef);
    }
    const d0 = String(payload.prodigy_d0 || '').trim();
    if (d0 && d0 !== '' && d0 !== '0') {
      optimArgs.push('d0=' + d0);
    }
    // 合并用户自定义 optimizer_args
    const customArgsRaw = String(payload.optimizer_args_custom || '').trim();
    if (customArgsRaw) {
      const customLines = customArgsRaw.split(/[\n\r]+/).map(s => s.trim()).filter(s => s && s.includes('='));
      // 用户自定义参数覆盖自动生成的同名参数
      const autoKeys = new Set(optimArgs.map(a => a.split('=')[0]));
      for (const line of customLines) {
        const key = line.split('=')[0];
        if (autoKeys.has(key)) {
          // 替换自动生成的
          const idx = optimArgs.findIndex(a => a.startsWith(key + '='));
          if (idx >= 0) optimArgs[idx] = line;
        } else {
          optimArgs.push(line);
        }
      }
    }
    payload.optimizer_args = optimArgs;
    delete payload.prodigy_d0;
    delete payload.prodigy_d_coef;
    delete payload.optimizer_args_custom;
  } else if (payload.optimizer_type && ['DAdaptation', 'DAdaptAdam', 'DAdaptLion'].includes(payload.optimizer_type)) {
    // DAdaptation 系列也需要 decouple
    const optimArgs = ['decouple=True'];
    const customArgsRaw = String(payload.optimizer_args_custom || '').trim();
    if (customArgsRaw) {
      const customLines = customArgsRaw.split(/[\n\r]+/).map(s => s.trim()).filter(s => s && s.includes('='));
      const autoKeys = new Set(optimArgs.map(a => a.split('=')[0]));
      for (const line of customLines) {
        const key = line.split('=')[0];
        if (autoKeys.has(key)) {
          const idx = optimArgs.findIndex(a => a.startsWith(key + '='));
          if (idx >= 0) optimArgs[idx] = line;
        } else {
          optimArgs.push(line);
        }
      }
    }
    payload.optimizer_args = optimArgs;
    delete payload.prodigy_d0;
    delete payload.prodigy_d_coef;
    delete payload.optimizer_args_custom;
  } else {
    // 非自适应优化器：如果有自定义 args 仍然传
    const customArgsRaw = String(payload.optimizer_args_custom || '').trim();
    if (customArgsRaw) {
      payload.optimizer_args = customArgsRaw.split(/[\n\r]+/).map(s => s.trim()).filter(s => s && s.includes('='));
    }
    delete payload.prodigy_d0;
    delete payload.prodigy_d_coef;
    delete payload.optimizer_args_custom;
  }

  // ── LyCORIS network_args 转换 ──
  // 后端 sd-scripts 要求 lycoris.kohya 的参数通过 network_args 数组传入，
  // 如 ["algo=locon", "conv_dim=16", ...]。UI 字段是独立的 key，需要在此组装。
  // Anima 类型由后端 apply_anima_ui_overrides 自行处理，这里跳过。
  if (payload.network_module === 'lycoris.kohya' && !tid.startsWith('anima')) {
    const networkArgs = [];
    const algo = String(payload.lycoris_algo || 'locon').trim().toLowerCase();
    networkArgs.push('algo=' + algo);

    if (payload.conv_dim != null && String(payload.conv_dim) !== '') {
      networkArgs.push('conv_dim=' + payload.conv_dim);
    }
    if (payload.conv_alpha != null && String(payload.conv_alpha) !== '') {
      networkArgs.push('conv_alpha=' + payload.conv_alpha);
    }
    if (payload.dropout != null && Number(payload.dropout) > 0) {
      networkArgs.push('dropout=' + payload.dropout);
    }
    if (payload.train_norm != null) {
      networkArgs.push('train_norm=' + (payload.train_norm ? 'True' : 'False'));
    }
    if (algo === 'lokr' && payload.lokr_factor != null) {
      networkArgs.push('factor=' + payload.lokr_factor);
    }
    if (payload.dora_wd) {
      networkArgs.push('dora_wd=True');
    }
    if (payload.scale_weight_norms != null && String(payload.scale_weight_norms) !== '') {
      networkArgs.push('scale_weight_norms=' + payload.scale_weight_norms);
    }

    payload.network_args = networkArgs;
    // 合并 network_args_custom
    const netArgsCustomRaw = String(payload.network_args_custom || '').trim();
    if (netArgsCustomRaw) {
      const customLines = netArgsCustomRaw.split(/[\n\r]+/).map(s => s.trim()).filter(s => s);
      payload.network_args.push(...customLines);
    }
    // 清理原始 UI 字段，避免 sd-scripts 不认识这些 key 报错或误用
    delete payload.lycoris_algo;
    delete payload.conv_dim;
    delete payload.conv_alpha;
    delete payload.dropout;
    delete payload.train_norm;
    delete payload.lokr_factor;
    delete payload.dora_wd;
    delete payload.network_dropout;  // 与 lycoris 不兼容，避免冲突
    delete payload.enable_base_weight;
    delete payload.network_args_custom;
  } else {
    // 非 LyCORIS: 处理 network_args_custom
    const netArgsCustomRaw = String(payload.network_args_custom || '').trim();
    if (netArgsCustomRaw) {
      const existingArgs = payload.network_args || [];
      const customLines = netArgsCustomRaw.split(/[\n\r]+/).map(s => s.trim()).filter(s => s);
      payload.network_args = [...existingArgs, ...customLines];
    }
    delete payload.network_args_custom;
  }

  // ── base_weights textarea → 数组 ──
  if (payload.enable_base_weight) {
    if (payload.base_weights && typeof payload.base_weights === 'string') {
      const lines = payload.base_weights.split(/[\n\r]+/).map(s => s.trim()).filter(s => s);
      payload.base_weights = lines.length > 0 ? lines : undefined;
    }

    if (payload.base_weights_multiplier && typeof payload.base_weights_multiplier === 'string') {
      const lines = payload.base_weights_multiplier.split(/[\n\r]+/).map(s => s.trim()).filter(s => s);
      payload.base_weights_multiplier = lines.length > 0 ? lines.map(Number).filter(n => !Number.isNaN(n)) : undefined;
    }
  } else {
    delete payload.base_weights;
    delete payload.base_weights_multiplier;
  }
  delete payload.enable_base_weight;

  // ── block weights: UI 开关 → 子字段清理 ──
  if (!payload.enable_block_weights) {
    delete payload.down_lr_weight;
    delete payload.mid_lr_weight;
    delete payload.up_lr_weight;
    delete payload.block_lr_zero_threshold;
  }
  delete payload.enable_block_weights;

  // ── PiSSA: 关闭时清理子字段 ──
  if (!payload.pissa_init) {
    delete payload.pissa_method;
    delete payload.pissa_niter;
    delete payload.pissa_oversample;
    delete payload.pissa_apply_conv2d;
    delete payload.pissa_export_mode;
  }

  // ── lr_scheduler_args textarea → 数组 ──
  if (payload.lr_scheduler_args && typeof payload.lr_scheduler_args === 'string') {
    const lines = payload.lr_scheduler_args.split(/[\n\r]+/).map(s => s.trim()).filter(s => s && s.includes('='));
    payload.lr_scheduler_args = lines.length > 0 ? lines : undefined;
    if (!payload.lr_scheduler_args) delete payload.lr_scheduler_args;
  }

  // ── lr_scheduler_type 空值清理 ──
  if (!payload.lr_scheduler_type || !payload.lr_scheduler_type.trim()) delete payload.lr_scheduler_type;
  // ── huber_schedule 空值清理 ──

  if (payload.huber_schedule === '') delete payload.huber_schedule;

  // ── Newbie: newbie_target_modules textarea → 换行分隔保留原始字符串 ──
  // 后端 newbie_lora_train.py 自行 split('\n')，所以保持 \n 分隔的字符串即可
  if (payload.newbie_target_modules && typeof payload.newbie_target_modules === 'string') {
    const cleaned = payload.newbie_target_modules.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    payload.newbie_target_modules = cleaned || undefined;
  }

  return payload;
}
