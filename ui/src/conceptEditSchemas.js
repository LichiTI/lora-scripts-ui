// conceptEditSchemas.js — 概念编辑训练 SECTIONS（iLECO / ADDifT / Multi-ADDifT）
// SDXL / SD1.5 / Anima 概念编辑的工厂函数与调用。
// 从 sdxlSchema.js 抽出（阶段 2c）。
import {
  sec, S_SAVE, netLora, S_LR, S_PREVIEW,
  S_SPEED_SDXL, S_SPEED_SD15, S_SPEED_FLOW,
  S_NOISE, S_ADV, S_THERMAL, S_DISTRIBUTED,
  flowParams, ditGradientCheckpointingField,
} from './schemaFieldGroups.js';
import { when, all } from './schemaCommon.js';

const conceptEditModelFields = (typeId, label, isSdxl = false) => [
  { key: 'model_train_type', type: 'hidden', defaultValue: typeId },
  { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: `${label} 底模路径（pretrained_model_name_or_path）`, desc: '底模文件路径', defaultValue: './sd-models/model.safetensors' },
  { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '从某个 save_state 保存的中断状态继续训练，填写文件路径', defaultValue: '' },
  { key: 'vae', type: 'file', pickerType: 'model-file', label: 'VAE 路径（vae）', desc: '(可选) VAE 模型文件路径，使用外置 VAE 文件覆盖模型内本身的', defaultValue: '' },
  { key: 'network_weights', type: 'file', pickerType: 'output-model-file', label: '继续训练 LoRA（network_weights）', desc: '从已有的 LoRA 模型上继续训练，填写路径', defaultValue: '' },
  ...(isSdxl ? [] : [{ key: 'v2', type: 'boolean', label: 'SD 2.x 模型（v2）', desc: '使用 SD 2.x 模型', defaultValue: false }]),
  { key: 'clip_skip', type: 'slider', label: 'CLIP 跳层（clip_skip）', desc: '概念编辑模式也会沿用当前训练路线的 CLIP 跳层语义。SDXL 默认保持 2 即可。', defaultValue: 2, min: 0, max: 12, step: 1 },
];

const conceptEditIdeaFields = (mode) => {
  const fields = [
    { key: 'concept_edit_mode', type: 'hidden', defaultValue: mode },
    { key: 'original_prompt', type: 'textarea', label: '原始概念提示词（original_prompt）', desc: '要削弱、擦除或作为基线概念的提示词。', defaultValue: '' },
    { key: 'target_prompt', type: 'textarea', label: '目标概念提示词（target_prompt）', desc: '目标概念提示词。iLECO 留空时表示偏向“擦除原概念”。', defaultValue: '' },
  ];

  if (mode === 'addift') {
    fields.push(
      { key: 'original_image_path', type: 'file', pickerType: 'image-file', label: '原始图像（original_image_path）', desc: 'ADDifT 的原始图像。建议与目标图像内容尽量一一对应。', defaultValue: '' },
      { key: 'target_image_path', type: 'file', pickerType: 'image-file', label: '目标图像（target_image_path）', desc: 'ADDifT 的目标图像。建议与原始图像分辨率一致。', defaultValue: '' },
    );
  }

  if (mode === 'multi-addift') {
    fields.push(
      { key: 'concept_edit_data_dir', type: 'folder', pickerType: 'folder', label: '概念编辑数据集目录（concept_edit_data_dir）', desc: '放置成对图像的数据集目录。当前版本先按固定分辨率读入，不走普通 LoRA 的子文件夹 repeat 语义。', defaultValue: './train/concept-edit' },
      { key: 'diff_target_name', type: 'string', label: '目标图后缀（diff_target_name）', desc: '例如 `_closed_eyes`，则会把 `image.png` 与 `image_closed_eyes.png` 配对。', defaultValue: '_target' },
    );
  }

  return fields;
};

const conceptEditTrainingFields = (defaults = {}) => [
  { key: 'resolution', type: 'string', label: '训练分辨率（resolution）', desc: '概念编辑首版先按固定分辨率处理，建议和训练目标接近。SDXL 推荐 1024,1024；SD1.5 推荐 512,512。', defaultValue: defaults.resolution || '1024,1024' },
  { key: 'max_train_steps', type: 'number', label: '最大训练步数（max_train_steps）', desc: '概念编辑模式优先按 step 控制训练长度。iLECO 常见 300~1000；ADDifT 常见 30~150。', defaultValue: defaults.maxTrainSteps || 500, min: 1 },
  { key: 'train_batch_size', type: 'slider', label: '批量大小（train_batch_size）', desc: '概念编辑建议从小 batch 开始。ADDifT / Multi-ADDifT 一般推荐 1~2。', defaultValue: defaults.batchSize || 1, min: 1, max: 8, step: 1 },
  { key: 'gradient_checkpointing', type: 'boolean', label: '梯度检查点（gradient_checkpointing）', desc: '启用梯度检查点以节省显存。', defaultValue: true },
  { key: 'gradient_accumulation_steps', type: 'number', label: '梯度累加步数（gradient_accumulation_steps）', desc: '梯度累加步数', defaultValue: 1, min: 1 },
  { key: 'network_train_unet_only', type: 'boolean', label: '仅训练 U-Net / DiT（network_train_unet_only）', desc: '概念编辑首版默认只训练 U-Net / DiT，更接近参考项目常见用法。', defaultValue: true },
  { key: 'network_train_text_encoder_only', type: 'boolean', label: '仅训练文本编码器（network_train_text_encoder_only）', desc: '不建议概念编辑首版单独训练文本编码器。', defaultValue: false },
  { key: 'min_timestep', type: 'number', label: '最小时间步（min_timestep）', desc: '动作/配件类差分常见 500；风格类常见 200。', defaultValue: defaults.minTimestep ?? '' , min: 0 },
  { key: 'max_timestep', type: 'number', label: '最大时间步（max_timestep）', desc: '动作/配件类差分常见 1000；风格类常见 400。', defaultValue: defaults.maxTimestep ?? '', min: 1 },
  { key: 'concept_edit_fixed_timestep_per_batch', type: 'boolean', label: '批内固定时间步（concept_edit_fixed_timestep_per_batch）', desc: '同一 batch 内共享同一个 timestep。适合概念编辑实验时减小批内波动。', defaultValue: false },
  { key: 'concept_edit_diff_alt_ratio', type: 'number', label: '差分交替倍率（concept_edit_diff_alt_ratio）', desc: 'ADDifT 交替差分倍率。保持 1 最稳；更激进的实验可调成负值，但不建议默认这么做。', defaultValue: 1, step: 0.1, visibleWhen: (c) => ['addift', 'multi-addift'].includes(String(c.concept_edit_mode || '').toLowerCase()) },
  { key: 'concept_edit_use_diff_mask', type: 'boolean', label: '启用差分掩码（concept_edit_use_diff_mask）', desc: 'Multi-ADDifT 可按原图/目标图像素差自动生成 mask，减少无关区域干扰。', defaultValue: false, visibleWhen: (c) => ['addift', 'multi-addift'].includes(String(c.concept_edit_mode || '').toLowerCase()) },
];

const conceptEditSections = ({ typeId, label, isSdxl = false, mode, resolution, maxTrainSteps, minTimestep = '', maxTimestep = '' }) => [
  sec('model-settings', 'model', '训练用模型', `${label} 概念编辑底模与恢复训练。`, conceptEditModelFields(typeId, label, isSdxl)),
  sec('save-settings', 'model', '保存设置', '输出路径、格式与训练状态。', [...S_SAVE]),
  sec('concept-settings', 'dataset', '概念编辑输入', '这里定义原始概念、目标概念，以及 ADDifT / Multi-ADDifT 需要的图像或配对目录。', conceptEditIdeaFields(mode)),
  sec('network-settings', 'network', '网络设置', '概念编辑首版先复用现有 LoRA / LyCORIS 网络参数。', netLora('networks.lora', isSdxl ? 32 : 16, isSdxl ? 32 : 16, isSdxl ? 512 : 256)),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '概念编辑建议优先从 AdamW / Prodigy 一类稳定路线开始。', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '概念编辑首版优先按 step 控制训练时长，不走普通 LoRA 的数据集 epoch 语义。', conceptEditTrainingFields({ resolution, maxTrainSteps, minTimestep, maxTimestep })),
  sec('preview-settings', 'preview', '预览图设置', '可选。概念编辑首版也可以沿用普通训练预览。', [...S_PREVIEW]),
  sec('speed-settings', 'speed', '速度优化', '混合精度、缓存与注意力后端。', [...(isSdxl ? S_SPEED_SDXL : S_SPEED_SD15)]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与辅助损失设置。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '实验开关与杂项参数。', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '首版概念编辑暂不建议多机多卡；这里仍保留通用入口。', [...S_DISTRIBUTED]),
];

const animaConceptEditModelFields = (typeId) => [
  { key: 'model_train_type', type: 'hidden', defaultValue: typeId },
  { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'Anima DiT 权重路径（pretrained_model_name_or_path）', desc: 'Anima 主 DiT / transformer 权重路径', defaultValue: './sd-models/model.safetensors' },
  { key: 'vae', type: 'file', pickerType: 'model-file', label: 'Qwen Image VAE 路径（vae）', desc: 'Anima 概念编辑需要的 VAE 路径', defaultValue: '' },
  { key: 'qwen3', type: 'file', pickerType: 'model-file', label: 'Qwen3 文本模型路径（qwen3）', desc: 'Qwen3 文本模型路径。可填写单文件或本地模型目录', defaultValue: '' },
  { key: 'llm_adapter_path', type: 'file', pickerType: 'model-file', label: 'LLM Adapter 路径（llm_adapter_path）', desc: '单独的 LLM Adapter 权重路径（可选）', defaultValue: '' },
  { key: 't5_tokenizer_path', type: 'folder', pickerType: 'folder', label: 'T5 tokenizer 目录（t5_tokenizer_path）', desc: '可选。留空时回退到项目内置 tokenizer', defaultValue: '' },
  { key: 'network_weights', type: 'file', pickerType: 'output-model-file', label: '继续训练 LoRA（network_weights）', desc: '从已有的概念编辑 LoRA / DoRA / T-LoRA 模型继续训练', defaultValue: '' },
  { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '从某个 save_state 保存的中断状态继续训练，填写文件路径', defaultValue: '' },
];

const animaConceptEditNetworkFields = [
  { key: 'lora_type', type: 'select', label: '适配器类型（lora_type）', desc: 'Anima 概念编辑当前支持原生 LoRA / LoRA-FA / VeRA / T-LoRA / LoKr。概念编辑首版建议优先从普通 LoRA 开始。', defaultValue: 'lora', options: ['lora', 'lora_fa', 'vera', 'tlora', 'lokr'] },
  { key: 'network_dim', type: 'slider', label: '网络维度（network_dim）', desc: '网络维度，常用 4~64。概念编辑通常不需要太大 rank。', defaultValue: 16, min: 1, max: 256, step: 1 },
  { key: 'network_alpha', type: 'slider', label: '网络 Alpha（network_alpha）', desc: '常用值：等于 network_dim 或更小。Alpha 越小通常需要更高学习率。', defaultValue: 16, min: 1, max: 256, step: 1 },
  { key: 'dim_from_weights', type: 'boolean', label: '从权重推断 Dim（dim_from_weights）', desc: '从已有 network_weights 自动推断 rank / dim', defaultValue: false },
  { key: 'scale_weight_norms', type: 'number', label: '最大范数正则化（scale_weight_norms）', desc: '最大范数正则化。如果使用，推荐从 1 附近开始', defaultValue: '', min: 0, step: 0.01 },
  { key: 'train_norm', type: 'boolean', label: '训练 Norm 层（train_norm）', desc: '额外训练带可学习参数的归一化层。概念编辑一般先关闭，只有明确需要时再开。', defaultValue: false },
  { key: 'dora_wd', type: 'boolean', label: '启用 DoRA（dora_wd）', desc: '仅在 Anima 原生 LoRA 路线下生效。DoRA 开启后会自动关闭 bypass_mode。', defaultValue: false, visibleWhen: when('lora_type', 'lora') },
  { key: 'bypass_mode', type: 'boolean', label: 'Bypass Mode（bypass_mode）', desc: '兼容字段。普通 Anima LoRA 一般建议关闭；启用 DoRA 时会自动强制关闭。', defaultValue: false, visibleWhen: (c) => c.lora_type === 'lora' && !c.dora_wd },
  { key: 'network_dropout', type: 'number', label: 'Dropout（network_dropout）', desc: 'LoRA / LoRA-FA / VeRA / T-LoRA dropout 概率', defaultValue: 0, min: 0, step: 0.01, visibleWhen: (c) => ['lora', 'lora_fa', 'vera', 'tlora'].includes(c.lora_type) },
  { key: 'tlora_min_rank', type: 'number', label: 'T-LoRA 最小 Rank（tlora_min_rank）', desc: 'T-LoRA 最小动态 rank', defaultValue: 1, min: 1, visibleWhen: when('lora_type', 'tlora') },
  { key: 'tlora_rank_schedule', type: 'select', label: 'T-LoRA Rank 调度（tlora_rank_schedule）', desc: 'T-LoRA 动态 rank 调度策略', defaultValue: 'cosine', options: ['cosine', 'linear'], visibleWhen: when('lora_type', 'tlora') },
  { key: 'tlora_orthogonal_init', type: 'boolean', label: 'T-LoRA 正交初始化（tlora_orthogonal_init）', desc: '对 lora_down 使用正交初始化（实验性）', defaultValue: false, visibleWhen: when('lora_type', 'tlora') },
  { key: 'lokr_factor', type: 'number', label: 'LoKr 系数（lokr_factor）', desc: 'LoKr 分解因子。当前 Anima LoKr 会自动回落到可整除的线性注入 factor', defaultValue: 8, min: -1, visibleWhen: when('lora_type', 'lokr') },
  { key: 'pissa_init', type: 'boolean', label: '启用 PiSSA 初始化（pissa_init）', desc: '实验性，仅在原生 LoRA 类型下生效。若同时启用 DoRA，后端会自动忽略 PiSSA。', defaultValue: false, visibleWhen: (c) => c.lora_type === 'lora' && !c.dora_wd },
  { key: 'pissa_method', type: 'select', label: 'PiSSA 分解方式（pissa_method）', desc: '推荐保持 rSVD 默认值', defaultValue: 'rsvd', options: ['rsvd', 'svd'], visibleWhen: all(when('lora_type', 'lora'), when('pissa_init', true)) },
  { key: 'pissa_niter', type: 'number', label: 'PiSSA 幂迭代次数（pissa_niter）', desc: 'PiSSA rSVD 幂迭代次数（高级参数）', defaultValue: 2, min: 0, step: 1, visibleWhen: all(when('lora_type', 'lora'), when('pissa_init', true)) },
  { key: 'pissa_oversample', type: 'number', label: 'PiSSA 过采样维度（pissa_oversample）', desc: 'PiSSA rSVD 过采样维度（高级参数）', defaultValue: 8, min: 0, step: 1, visibleWhen: all(when('lora_type', 'lora'), when('pissa_init', true)) },
  { key: 'pissa_apply_conv2d', type: 'boolean', label: 'PiSSA 作用于 Conv（pissa_apply_conv2d）', desc: 'PiSSA 额外作用于 1x1 Conv（实验性）', defaultValue: false, visibleWhen: all(when('lora_type', 'lora'), when('pissa_init', true)) },
  { key: 'pissa_export_mode', type: 'select', label: 'PiSSA 导出模式（pissa_export_mode）', desc: 'PiSSA 模型保存为标准 LoRA 时的导出方式', defaultValue: 'LoRA无损兼容导出', options: ['LoRA无损兼容导出', 'LoRA快速近似导出'], visibleWhen: all(when('lora_type', 'lora'), when('pissa_init', true)) },
  { key: 'enable_base_weight', type: 'boolean', label: '启用基础权重（enable_base_weight）', desc: '启用基础权重（差异炼丹）', defaultValue: false },
  { key: 'base_weights', type: 'textarea', label: '基础权重路径（base_weights）', desc: '合并入底模的 LoRA 路径，一行一个路径', defaultValue: '', visibleWhen: when('enable_base_weight', true) },
  { key: 'base_weights_multiplier', type: 'textarea', label: '基础权重比例（base_weights_multiplier）', desc: '合并入底模的 LoRA 权重，一行一个数字', defaultValue: '', visibleWhen: when('enable_base_weight', true) },
  { key: 'network_args_custom', type: 'textarea', label: '自定义 network_args（network_args_custom）', desc: '自定义 network_args，每行一个参数。Anima 概念编辑会直接附加到后端 payload。', defaultValue: '' },
];

const animaConceptEditTrainingFields = (defaults = {}) => [
  { key: 'resolution', type: 'string', label: '训练分辨率（resolution）', desc: 'Anima 概念编辑首版先按固定分辨率处理，建议保持 1024,1024 起步。', defaultValue: defaults.resolution || '1024,1024' },
  { key: 'max_train_steps', type: 'number', label: '最大训练步数（max_train_steps）', desc: 'Anima 概念编辑首版优先按 step 控制训练长度。iLECO 常见 300~1000；ADDifT 常见 30~150。', defaultValue: defaults.maxTrainSteps || 500, min: 1 },
  { key: 'train_batch_size', type: 'slider', label: '批量大小（train_batch_size）', desc: '概念编辑建议从小 batch 开始。ADDifT / Multi-ADDifT 一般推荐 1~2。', defaultValue: defaults.batchSize || 1, min: 1, max: 8, step: 1 },
  ditGradientCheckpointingField('Anima'),
  { key: 'gradient_accumulation_steps', type: 'number', label: '梯度累加步数（gradient_accumulation_steps）', desc: '梯度累加步数', defaultValue: 1, min: 1 },
  { key: 'network_train_unet_only', type: 'boolean', label: '仅训练 DiT（network_train_unet_only）', desc: 'Anima 概念编辑当前只支持 DiT-only 路线。保持开启即可。', defaultValue: true },
  { key: 'network_train_text_encoder_only', type: 'boolean', label: '仅训练文本编码器（network_train_text_encoder_only）', desc: 'Anima 概念编辑当前不支持单独训练文本编码器。请保持关闭。', defaultValue: false },
  { key: 'min_timestep', type: 'number', label: '最小时间步（min_timestep）', desc: '动作/配件类差分常见 500；风格类常见 200。', defaultValue: defaults.minTimestep ?? '', min: 0 },
  { key: 'max_timestep', type: 'number', label: '最大时间步（max_timestep）', desc: '动作/配件类差分常见 1000；风格类常见 400。', defaultValue: defaults.maxTimestep ?? '', min: 1 },
  { key: 'concept_edit_fixed_timestep_per_batch', type: 'boolean', label: '批内固定时间步（concept_edit_fixed_timestep_per_batch）', desc: '同一 batch 内共享同一个 timestep，适合概念编辑实验时减小批内波动。', defaultValue: false },
  { key: 'concept_edit_diff_alt_ratio', type: 'number', label: '差分交替倍率（concept_edit_diff_alt_ratio）', desc: 'ADDifT 交替差分倍率。保持 1 最稳；更激进的实验可调成负值，但不建议默认这么做。', defaultValue: 1, step: 0.1, visibleWhen: (c) => ['addift', 'multi-addift'].includes(String(c.concept_edit_mode || '').toLowerCase()) },
  { key: 'concept_edit_use_diff_mask', type: 'boolean', label: '启用差分掩码（concept_edit_use_diff_mask）', desc: 'ADDifT / Multi-ADDifT 可按原图/目标图像素差自动生成 mask，减少无关区域干扰。', defaultValue: false, visibleWhen: (c) => ['addift', 'multi-addift'].includes(String(c.concept_edit_mode || '').toLowerCase()) },
];

const animaConceptEditSections = ({ typeId, mode, maxTrainSteps, minTimestep = '', maxTimestep = '' }) => [
  sec('model-settings', 'model', '训练用模型', 'Anima 概念编辑底模、Qwen3/T5 组件与恢复训练。', animaConceptEditModelFields(typeId)),
  sec('anima-params', 'model', 'Anima 专用参数', 'Anima 概念编辑会沿用自身的 flow/noise/prompt 编码链路。', [
    ...flowParams({ ts: 'shift', dfs: 3.0 }),
    { key: 'qwen3_max_token_length', type: 'number', label: 'Qwen3 最大 token（qwen3_max_token_length）', desc: 'Qwen3 最大 token 长度', defaultValue: 512, min: 1 },
    { key: 't5_max_token_length', type: 'number', label: 'T5 最大 token（t5_max_token_length）', desc: 'T5 最大 token 长度', defaultValue: 512, min: 1 },
    { key: 'attn_mode', type: 'select', label: 'Attention 实现（attn_mode）', desc: '留空时按当前运行时自动选择；在 FlashAttention 运行时下会优先尝试 FlashAttention 2。', defaultValue: '', options: ['', 'torch', 'xformers', 'sageattn', 'flash'] },
    { key: 'split_attn', type: 'boolean', label: '拆分 attention（split_attn）', desc: '拆分 attention 以节省显存。显存充足、能正常跑时一般建议关闭。', defaultValue: false },
    { key: 'vae_chunk_size', type: 'number', label: 'VAE 分块大小（vae_chunk_size）', desc: 'VAE 编码/解码分块大小（需为偶数）', defaultValue: '', min: 2 },
  ]),
  sec('save-settings', 'model', '保存设置', '输出路径、格式与训练状态。', [...S_SAVE]),
  sec('concept-settings', 'dataset', '概念编辑输入', '这里定义原始概念、目标概念，以及 ADDifT / Multi-ADDifT 需要的图像或配对目录。', conceptEditIdeaFields(mode)),
  sec('network-settings', 'network', '网络设置', 'Anima 概念编辑支持原生 LoRA / DoRA / VeRA / T-LoRA / LoKr。', animaConceptEditNetworkFields),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '学习率、调度器与优化器。概念编辑建议先从稳定路线开始。', [...S_LR]),
  sec('training-settings', 'training', '训练参数', 'Anima 概念编辑首版优先按 step 控制训练时长。', animaConceptEditTrainingFields({ resolution: '1024,1024', maxTrainSteps, minTimestep, maxTimestep })),
  sec('preview-settings', 'preview', '预览图设置', '可选。Anima 概念编辑也可以沿用普通训练预览。', [...S_PREVIEW]),
  sec('speed-settings', 'speed', '速度优化', '混合精度、缓存与注意力后端。', [...S_SPEED_FLOW]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与辅助损失设置。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '噪声、种子与实验功能。', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', 'Anima 概念编辑首版不建议多机多卡；这里仍保留通用入口。', [...S_DISTRIBUTED]),
];

export const SDXL_ILECO_SECTIONS = conceptEditSections({
  typeId: 'sdxl-ileco',
  label: 'SDXL',
  isSdxl: true,
  mode: 'ileco',
  resolution: '1024,1024',
  maxTrainSteps: 500,
});

export const SDXL_ADDIFT_SECTIONS = conceptEditSections({
  typeId: 'sdxl-addift',
  label: 'SDXL',
  isSdxl: true,
  mode: 'addift',
  resolution: '1024,1024',
  maxTrainSteps: 80,
  minTimestep: 500,
  maxTimestep: 1000,
});

export const SDXL_MULTI_ADDIFT_SECTIONS = conceptEditSections({
  typeId: 'sdxl-multi-addift',
  label: 'SDXL',
  isSdxl: true,
  mode: 'multi-addift',
  resolution: '1024,1024',
  maxTrainSteps: 120,
  minTimestep: 500,
  maxTimestep: 1000,
});

export const SD15_ILECO_SECTIONS = conceptEditSections({
  typeId: 'sd-ileco',
  label: 'SD 1.5',
  isSdxl: false,
  mode: 'ileco',
  resolution: '512,512',
  maxTrainSteps: 500,
});

export const SD15_ADDIFT_SECTIONS = conceptEditSections({
  typeId: 'sd-addift',
  label: 'SD 1.5',
  isSdxl: false,
  mode: 'addift',
  resolution: '512,512',
  maxTrainSteps: 80,
  minTimestep: 500,
  maxTimestep: 1000,
});

export const SD15_MULTI_ADDIFT_SECTIONS = conceptEditSections({
  typeId: 'sd-multi-addift',
  label: 'SD 1.5',
  isSdxl: false,
  mode: 'multi-addift',
  resolution: '512,512',
  maxTrainSteps: 120,
  minTimestep: 500,
  maxTimestep: 1000,
});

export const ANIMA_ILECO_SECTIONS = animaConceptEditSections({
  typeId: 'anima-ileco',
  mode: 'ileco',
  maxTrainSteps: 500,
});

export const ANIMA_ADDIFT_SECTIONS = animaConceptEditSections({
  typeId: 'anima-addift',
  mode: 'addift',
  maxTrainSteps: 80,
  minTimestep: 500,
  maxTimestep: 1000,
});

export const ANIMA_MULTI_ADDIFT_SECTIONS = animaConceptEditSections({
  typeId: 'anima-multi-addift',
  mode: 'multi-addift',
  maxTrainSteps: 120,
  minTimestep: 500,
  maxTimestep: 1000,
});
