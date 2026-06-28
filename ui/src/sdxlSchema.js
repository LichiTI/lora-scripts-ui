// ================================================================
// sdxlSchema.js — SDXL 家族训练类型 Schema（LoRA / Finetune）
// 仅定义 SDXL 家族 SECTIONS（纯数据）。SECTIONS_MAP 与公共 API 见 schemaIndex.js。
// ================================================================

import { when, all } from './schemaCommon.js';
import {
  sec, ds, netLora, vParameterizationFields, rectifiedFlowParams, finetuneModel,
  S_SAVE, S_CAPTION, S_DATA_AUG, S_LR, S_TRAIN, S_PREVIEW, S_VALIDATION,
  S_STAGED_RESOLUTION, S_SPEED_SDXL, S_NOISE, S_ADV, S_THERMAL, S_DISTRIBUTED,
  S_PEAK_VRAM, S_LULYNX_SDXL,
} from './schemaFieldGroups.js';

// ---- SDXL LoRA ----
export const SDXL_LORA_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'SDXL 底模、VAE 与恢复训练。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'sdxl-lora' },
    { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'SDXL 底模路径（pretrained_model_name_or_path）', desc: '底模文件路径', defaultValue: './sd-models/model.safetensors' },
    { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '从某个 save_state 保存的中断状态继续训练，填写文件路径', defaultValue: '' },
    { key: 'vae', type: 'file', pickerType: 'model-file', label: 'VAE 路径（vae）', desc: '(可选) VAE 模型文件路径，使用外置 VAE 文件覆盖模型内本身的', defaultValue: '' },
    { key: 'network_weights', type: 'file', pickerType: 'output-model-file', label: '继续训练 LoRA（network_weights）', desc: '从已有的 LoRA 模型上继续训练，填写路径', defaultValue: '' },
  ]),
  sec('save-settings', 'model', '保存设置', '输出路径、格式与训练状态。', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '训练数据、正则图与分桶。', [...ds('1024,1024', 2048, 32), ...S_STAGED_RESOLUTION]),
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
  sec('v-parameterization-settings', 'training', 'V 参数化', 'v-pred 训练目标与相关补偿项。', vParameterizationFields(true)),
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
  sec('preview-settings', 'preview', '预览图设置', '训练中生成预览图。', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('lulynx-settings', 'advanced', 'Lulynx 实验核心 (SDXL)', 'SafeGuard、EMA、ResourceManager、BlockWeight (SDXL 分层)、SmartRank、AutoController。', S_LULYNX_SDXL),
  sec('speed-settings', 'speed', '速度优化', '混合精度、缓存与注意力后端。', [...S_SPEED_SDXL]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '噪声、种子与实验功能。', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];
export const SDXL_FT_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'SDXL 全参微调。', [
    ...finetuneModel('sdxl-finetune', 'SDXL'),
  ]),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('1024,1024', 2048, 32)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', [...S_CAPTION]),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(10)),
  sec('v-parameterization-settings', 'training', 'V 参数化', 'v-pred 训练目标开关。', vParameterizationFields()),
  sec('rf-settings', 'training', 'Rectified Flow', 'RF / Flow Matching 训练目标与时间步策略。', rectifiedFlowParams()),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_SDXL]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];
