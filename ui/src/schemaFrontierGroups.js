// schemaFrontierGroups.js — 通用前沿技术字段组（anima / sdxl / newbie 共用）
// 所有字段均 default-off，无 arch 依赖，可在任意训练类型的 frontier/expert section 引用。
import { all, when } from './schemaCommon.js';

// ── Scale Guidance + Quality Loss Pack ────────────────────────────────────────
export const S_QUALITY_OPTIMIZATION_PACK = [
  { key: 'scale_guidance_mode', type: 'select', label: 'Scale Guidance 模式', desc: '一键引导训练侧重不同尺度。detail=注重细节; style=注重风格; composition=注重构图; off=关闭(默认)。', defaultValue: 'off', options: [
    { value: 'off', label: '关闭 (默认)' },
    { value: 'detail', label: '注重细节 (detail)' },
    { value: 'style', label: '注重风格 (style)' },
    { value: 'composition', label: '注重构图 (composition)' },
  ] },
  { key: 'lineart_preservation_enabled', type: 'boolean', label: '启用线稿保护损失', desc: '实验功能。Sobel 边缘检测提取 latent 线稿特征，防止线条模糊成网格。default-off。', defaultValue: false },
  { key: 'lineart_preservation_weight', type: 'number', label: '线稿损失权重', desc: '相对主损失权重，推荐 0.05-0.2。', defaultValue: 0.1, min: 0, max: 1, step: 0.01, visibleWhen: (c) => c.lineart_preservation_enabled },
  { key: 'lineart_preservation_edge_weight', type: 'number', label: '边缘权重因子', desc: '边缘区域相对整体的权重放大倍数，默认 3.0。', defaultValue: 3.0, min: 1, max: 10, step: 0.5, visibleWhen: (c) => c.lineart_preservation_enabled },
  { key: 'lineart_preservation_min_t', type: 'number', label: '最小 sigma (线稿)', desc: 'sigma 窗口下界，0=全范围。', defaultValue: 0.0, min: 0, max: 1, step: 0.05, visibleWhen: (c) => c.lineart_preservation_enabled },
  { key: 'lineart_preservation_max_t', type: 'number', label: '最大 sigma (线稿)', desc: 'sigma 窗口上界，1=全范围。', defaultValue: 1.0, min: 0, max: 1, step: 0.05, visibleWhen: (c) => c.lineart_preservation_enabled },
  { key: 'dct_frequency_enabled', type: 'boolean', label: '启用 DCT 频域损失', desc: '实验功能。DCT 分解频率，对高频分量施加更高权重。default-off。', defaultValue: false },
  { key: 'dct_frequency_weight', type: 'number', label: 'DCT 损失权重', desc: '推荐 0.05-0.15。', defaultValue: 0.1, min: 0, max: 1, step: 0.01, visibleWhen: (c) => c.dct_frequency_enabled },
  { key: 'dct_frequency_high_weight', type: 'number', label: '高频权重因子', desc: '高频相对低频的权重倍数，默认 2.0。', defaultValue: 2.0, min: 1, max: 5, step: 0.5, visibleWhen: (c) => c.dct_frequency_enabled },
  { key: 'dct_frequency_low_cutoff', type: 'number', label: '低频 cutoff 比例', desc: '前多少比例算低频，默认 0.3。', defaultValue: 0.3, min: 0.1, max: 0.5, step: 0.05, visibleWhen: (c) => c.dct_frequency_enabled },
  { key: 'dct_frequency_min_t', type: 'number', label: '最小 sigma (DCT)', desc: 'sigma 窗口下界，0=全范围。', defaultValue: 0.0, min: 0, max: 1, step: 0.05, visibleWhen: (c) => c.dct_frequency_enabled },
  { key: 'dct_frequency_max_t', type: 'number', label: '最大 sigma (DCT)', desc: 'sigma 窗口上界，1=全范围。', defaultValue: 1.0, min: 0, max: 1, step: 0.05, visibleWhen: (c) => c.dct_frequency_enabled },
  { key: 'gram_texture_enabled', type: 'boolean', label: '启用 Gram 纹理损失', desc: '实验功能。Gram 矩阵捕捉纹理统计特征，防止网状纹理/风格不稳定。default-off。', defaultValue: false },
  { key: 'gram_texture_weight', type: 'number', label: 'Gram 损失权重', desc: '推荐 0.03-0.1。', defaultValue: 0.05, min: 0, max: 1, step: 0.01, visibleWhen: (c) => c.gram_texture_enabled },
  { key: 'gram_texture_normalize', type: 'boolean', label: '归一化 Gram 矩阵', desc: '除以 C*H*W 使损失与尺寸无关。', defaultValue: true, visibleWhen: (c) => c.gram_texture_enabled },
  { key: 'gram_texture_min_t', type: 'number', label: '最小 sigma (Gram)', desc: 'sigma 窗口下界，0=全范围。', defaultValue: 0.0, min: 0, max: 1, step: 0.05, visibleWhen: (c) => c.gram_texture_enabled },
  { key: 'gram_texture_max_t', type: 'number', label: '最大 sigma (Gram)', desc: 'sigma 窗口上界，1=全范围。', defaultValue: 1.0, min: 0, max: 1, step: 0.05, visibleWhen: (c) => c.gram_texture_enabled },

  // ── Phase 2: Hard Negative Mining ──────────────────────────────────────────
  { key: 'hard_negative_mining_enabled', type: 'boolean', label: '启用困难样本挖掘 (Hard Negative Mining)', desc: 'Phase 2.1。只回传 loss 最高的 top-k% 样本梯度，聚焦困难样本训练。类似 Focal Loss 思想。default-off。', defaultValue: false },
  { key: 'hard_negative_mining_ratio', type: 'number', label: '困难样本保留比例', desc: '保留 top-k% 的困难样本。推荐 0.5 (保留 50%)。', defaultValue: 0.5, min: 0.1, max: 1.0, step: 0.05, visibleWhen: (c) => c.hard_negative_mining_enabled },
  { key: 'hard_negative_mining_warmup_steps', type: 'number', label: 'Warmup 步数', desc: '前 N 步不启用困难样本挖掘，让模型先稳定训练。', defaultValue: 100, min: 0, step: 10, visibleWhen: (c) => c.hard_negative_mining_enabled },
  { key: 'hard_negative_mining_mode', type: 'select', label: '挖掘模式', desc: 'topk=保留 top-k% 困难样本; threshold=保留 loss > threshold 的样本。', defaultValue: 'topk', options: [
    { value: 'topk', label: 'Top-K 模式' },
    { value: 'threshold', label: 'Threshold 模式' },
  ], visibleWhen: (c) => c.hard_negative_mining_enabled },
  { key: 'hard_negative_mining_threshold_multiplier', type: 'number', label: 'Threshold 系数', desc: 'Threshold 模式的阈值系数 (threshold = mean_loss × multiplier)。', defaultValue: 1.2, min: 1.0, max: 3.0, step: 0.1, visibleWhen: (c) => c.hard_negative_mining_enabled && c.hard_negative_mining_mode === 'threshold' },

  // ── Phase 2: Multi-Scale DiT Supervision ───────────────────────────────────
  { key: 'multi_scale_supervision_enabled', type: 'boolean', label: '启用多尺度 DiT 监督 (Multi-Scale Supervision)', desc: 'Phase 2.2。在 DiT 中间层 (4/8/12) 上做 student-teacher 自蒸馏，引导网络学习更平滑的语义空间。需要两次 forward，显存开销较大。default-off。', defaultValue: false },
  { key: 'multi_scale_supervision_weight', type: 'number', label: '多尺度损失权重', desc: '相对主损失权重。推荐 0.1-0.3。', defaultValue: 0.1, min: 0, max: 1, step: 0.05, visibleWhen: (c) => c.multi_scale_supervision_enabled },
  { key: 'multi_scale_layers', type: 'text', label: '监督层列表', desc: '要监督的 DiT 层，逗号分隔 (如 "4,8,12")。层越多开销越大。', defaultValue: '4,8,12', visibleWhen: (c) => c.multi_scale_supervision_enabled },
  { key: 'multi_scale_loss_type', type: 'select', label: '特征损失类型', desc: 'MSE=均方误差; Cosine=余弦距离 (1 - cosine_similarity)。', defaultValue: 'mse', options: [
    { value: 'mse', label: 'MSE (均方误差)' },
    { value: 'cosine', label: 'Cosine (余弦距离)' },
  ], visibleWhen: (c) => c.multi_scale_supervision_enabled },
  { key: 'multi_scale_min_t', type: 'number', label: '最小 sigma (多尺度)', desc: 'sigma 窗口下界，0=全范围。只在指定范围内应用多尺度监督。', defaultValue: 0.0, min: 0, max: 1, step: 0.05, visibleWhen: (c) => c.multi_scale_supervision_enabled },
  { key: 'multi_scale_max_t', type: 'number', label: '最大 sigma (多尺度)', desc: 'sigma 窗口上界，1=全范围。', defaultValue: 1.0, min: 0, max: 1, step: 0.05, visibleWhen: (c) => c.multi_scale_supervision_enabled },

  // ── Phase 3: LPIPS Latent Loss ─────────────────────────────────────────────
  { key: 'lpips_latent_enabled', type: 'boolean', label: '启用 LPIPS Latent 感知损失 (Phase 3)', desc: 'Phase 3.1。利用 DiT 中间层特征计算感知相似度，类似 LPIPS 但在 latent 空间操作。与 Multi-Scale 复用特征提取。default-off。', defaultValue: false },
  { key: 'lpips_latent_weight', type: 'number', label: 'LPIPS Latent 损失权重', desc: '相对主损失权重。推荐 0.05-0.15。', defaultValue: 0.1, min: 0, max: 1, step: 0.01, visibleWhen: (c) => c.lpips_latent_enabled },
  { key: 'lpips_latent_feature_layers', type: 'text', label: '特征层列表', desc: '使用哪些 DiT 层特征，逗号分隔 (如 "4,8,12")。需与 Multi-Scale 层对齐。', defaultValue: '4,8,12', visibleWhen: (c) => c.lpips_latent_enabled },
  { key: 'lpips_latent_feature_weight', type: 'text', label: '各层权重', desc: '各层权重，逗号分隔 (如 "1.0,1.0,1.0")。可给深层更高权重。', defaultValue: '1.0,1.0,1.0', visibleWhen: (c) => c.lpips_latent_enabled },
  { key: 'lpips_latent_normalize_features', type: 'boolean', label: '归一化特征', desc: '是否归一化特征 (L2 norm)。归一化后损失更关注方向而非幅度。', defaultValue: true, visibleWhen: (c) => c.lpips_latent_enabled },
  { key: 'lpips_latent_min_t', type: 'number', label: '最小 sigma (LPIPS)', desc: 'sigma 窗口下界，0=全范围。', defaultValue: 0.0, min: 0, max: 1, step: 0.05, visibleWhen: (c) => c.lpips_latent_enabled },
  { key: 'lpips_latent_max_t', type: 'number', label: '最大 sigma (LPIPS)', desc: 'sigma 窗口上界，1=全范围。', defaultValue: 1.0, min: 0, max: 1, step: 0.05, visibleWhen: (c) => c.lpips_latent_enabled },

  // ── Phase 3: Contrastive Latent Consistency ────────────────────────────────
  { key: 'contrastive_latent_enabled', type: 'boolean', label: '启用对比学习 Latent 一致性 (Phase 3)', desc: 'Phase 3.2。对比学习风格的一致性损失：同一 clean latent 在不同噪声下的 x0 预测应该接近。简化模式 (noise_pairs=1) 无额外前向传播。default-off。', defaultValue: false },
  { key: 'contrastive_latent_weight', type: 'number', label: '对比学习损失权重', desc: '相对主损失权重。推荐 0.05-0.2。', defaultValue: 0.1, min: 0, max: 1, step: 0.01, visibleWhen: (c) => c.contrastive_latent_enabled },
  { key: 'contrastive_latent_noise_pairs', type: 'number', label: '对比对数', desc: '对比对数。1=简化模式 (只用当前批次)；>=2 需额外前向传播 (+20-30% 时间)。推荐 1。', defaultValue: 1, min: 1, max: 5, step: 1, visibleWhen: (c) => c.contrastive_latent_enabled },
  { key: 'contrastive_latent_temperature', type: 'number', label: '对比学习温度', desc: '对比学习温度系数 (保留，当前简化实现未使用)。', defaultValue: 0.07, min: 0.01, max: 0.2, step: 0.01, visibleWhen: (c) => c.contrastive_latent_enabled },
  { key: 'contrastive_latent_min_t', type: 'number', label: '最小 sigma (对比)', desc: 'sigma 窗口下界。限制在中间噪声段 (如 0.2-0.8)。', defaultValue: 0.2, min: 0, max: 1, step: 0.05, visibleWhen: (c) => c.contrastive_latent_enabled },
  { key: 'contrastive_latent_max_t', type: 'number', label: '最大 sigma (对比)', desc: 'sigma 窗口上界。限制在中间噪声段。', defaultValue: 0.8, min: 0, max: 1, step: 0.05, visibleWhen: (c) => c.contrastive_latent_enabled },
];

// ── LoRA 结构变体 ─────────────────────────────────────────────────────────────
export const S_LORA_VARIANTS = [
  { key: 'adalora_enabled', type: 'boolean', label: 'AdaLoRA (SVD 自适应预算)', desc: 'SVD 分解 ΔW=P@Λ@Q，动态分配参数预算到重要层。default-off, parity。', defaultValue: false },
  { key: 'adalora_target_rank', type: 'number', label: 'AdaLoRA 目标 rank', desc: '最终目标 rank (0=使用全局 rank)。', defaultValue: 0, min: 0, step: 1, visibleWhen: (c) => c.adalora_enabled },
  { key: 'adalora_init_rank', type: 'number', label: 'AdaLoRA 初始 rank', desc: '初始 rank (0=1.5×目标 rank)。', defaultValue: 0, min: 0, step: 1, visibleWhen: (c) => c.adalora_enabled },
  { key: 'adalora_orth_reg_weight', type: 'number', label: 'AdaLoRA 正交正则权重', desc: '正交正则化权重，防止 rank collapse。', defaultValue: 0.5, min: 0, step: 0.1, visibleWhen: (c) => c.adalora_enabled },
  { key: 'lora_composer_enabled', type: 'boolean', label: 'LoRA-Composer (区域组合)', desc: '多概念区域感知组合（inference-time）。需提供 layout mask。default-off。', defaultValue: false },
  { key: 'lora_composer_alpha', type: 'number', label: 'Composer fill loss 权重', desc: 'Fill loss 权重 α。', defaultValue: 0.25, min: 0, step: 0.05, visibleWhen: (c) => c.lora_composer_enabled },
  { key: 'lora_composer_beta', type: 'number', label: 'Composer region loss 权重', desc: 'Region perceptual loss 权重 β。', defaultValue: 0.8, min: 0, step: 0.1, visibleWhen: (c) => c.lora_composer_enabled },
  { key: 'delta_lora_enabled', type: 'boolean', label: 'Delta-LoRA (ΔBA 动态缩放)', desc: 'ΔBA 动态缩放 LoRA 更新，提升表达力。default-off, parity。', defaultValue: false },
  { key: 'dora_enabled', type: 'boolean', label: 'DoRA (权重分解)', desc: '分解权重为方向+幅度，比标准 LoRA 表达力强但稍慢。default-off。', defaultValue: false },
  { key: 'dora_mode', type: 'select', label: 'DoRA 模式', desc: '实现模式。', defaultValue: 'split', options: [{ value: 'split', label: 'split' }, { value: 'merged', label: 'merged' }], visibleWhen: (c) => c.dora_enabled },
  { key: 'hydralora_enabled', type: 'boolean', label: 'HydraLoRA (多分支)', desc: '多分支 LoRA + 分支平衡损失。default-off。', defaultValue: false },
  { key: 'hydralora_balance_loss_weight', type: 'number', label: 'Hydra 平衡损失权重', desc: '分支平衡损失权重。', defaultValue: 0.0, step: 0.01, visibleWhen: (c) => c.hydralora_enabled },
  { key: 'reslora_enabled', type: 'boolean', label: 'ResLoRA (跨层残差)', desc: '跨 block 残差 shortcut。default-off。', defaultValue: false },
  { key: 'reslora_mode', type: 'select', label: 'ResLoRA 模式', desc: 'shortcut 合并模式。', defaultValue: 'exact', options: [{ value: 'exact', label: 'exact merge' }, { value: 'approx', label: 'approximate' }], visibleWhen: (c) => c.reslora_enabled },
  { key: 'tensorring_lora_enabled', type: 'boolean', label: 'T-LoRA (Tensor-Ring)', desc: 'Tensor-Ring 分解 W*=W₀T+Δ，单步 fused einsum。default-off。', defaultValue: false },
  { key: 'krona_enabled', type: 'boolean', label: 'KronA (Kronecker 分解)', desc: 'ΔW=scale·kron(w1,w2)，参数比 LoRA 少。显存高于 LoRA。default-off, parity。', defaultValue: false },
  { key: 'krona_factor_in', type: 'number', label: 'KronA in 因子', desc: 'in 侧分解因子 (0=默认 4)。', defaultValue: 0, min: 0, step: 1, visibleWhen: (c) => c.krona_enabled },
  { key: 'krona_factor_out', type: 'number', label: 'KronA out 因子', desc: 'out 侧分解因子 (0=默认 64)。', defaultValue: 0, min: 0, step: 1, visibleWhen: (c) => c.krona_enabled },
  { key: 'krona_allora', type: 'boolean', label: 'KronA 模块级 ALLoRA', desc: 'per-output-channel 梯度归一化。default-off。', defaultValue: false, visibleWhen: (c) => c.krona_enabled },
  { key: 'cdka_enabled', type: 'boolean', label: 'CDKA (Component-Designed Kronecker)', desc: 'KronA 改进，不对称分解 + alpha 缩放。同 KronA 显存特性。default-off, parity。', defaultValue: false },
  { key: 'cdka_alpha', type: 'number', label: 'CDKA alpha', desc: '缩放 = alpha/sqrt(in_n) (0→scale=1.0)。', defaultValue: 16.0, min: 0, step: 0.5, visibleWhen: (c) => c.cdka_enabled },
  { key: 'cdka_factor_in', type: 'number', label: 'CDKA r2 (in 因子)', desc: 'r2 (0=默认 8)。', defaultValue: 0, min: 0, step: 1, visibleWhen: (c) => c.cdka_enabled },
  { key: 'cdka_factor_out', type: 'number', label: 'CDKA r1 (out 因子)', desc: 'r1 (0=默认 2)。', defaultValue: 0, min: 0, step: 1, visibleWhen: (c) => c.cdka_enabled },
  { key: 'lora2_adaptive_enabled', type: 'boolean', label: 'LoRA2 Adaptive (自动 Rank 选择)', desc: '指数衰减权重自动学习最优 rank。每层学习 ν 参数控制有效 rank。Rank-512 质量但 Rank-64 显存。default-off (arXiv:2603.21884)。', defaultValue: false },
  { key: 'lora2_adaptive_r_max', type: 'number', label: 'LoRA2 最大 rank', desc: '最大 rank (实际有效 rank 自动学习)。', defaultValue: 64, min: 4, max: 512, step: 4, visibleWhen: (c) => c.lora2_adaptive_enabled },
  { key: 'lora2_adaptive_nu_init', type: 'number', label: 'LoRA2 nu 初始值', desc: 'nu 初始值 (控制衰减速度，推荐 1.0)。', defaultValue: 1.0, min: 0.1, max: 10.0, step: 0.1, visibleWhen: (c) => c.lora2_adaptive_enabled },
  { key: 'lora2_adaptive_decay_lambda', type: 'number', label: 'LoRA2 衰减系数', desc: '指数衰减系数 λ (推荐 1.0)。', defaultValue: 1.0, min: 0.1, max: 5.0, step: 0.1, visibleWhen: (c) => c.lora2_adaptive_enabled },
  { key: 'ed_lora_enabled', type: 'boolean', label: 'ED-LoRA (Embedding Decomposed)', desc: 'Text embedding 分解为 V=V_rand+V_class 用于多概念定制，保留概念身份。78% identity loss 降低。default-off (Mix-of-Show arXiv:2305.18292)。', defaultValue: false },
  { key: 'ed_lora_decomp_dim', type: 'number', label: 'ED-LoRA 分解维度', desc: 'Embedding 分解维度 (推荐 64)。', defaultValue: 64, min: 32, max: 256, step: 8, visibleWhen: (c) => c.ed_lora_enabled },
  { key: 'ed_lora_num_layers', type: 'number', label: 'ED-LoRA 层数', desc: 'Text encoder transformer 层数 (CLIP 默认 12)。', defaultValue: 12, min: 6, max: 24, step: 1, visibleWhen: (c) => c.ed_lora_enabled },
  { key: 'ed_lora_alpha', type: 'number', label: 'ED-LoRA Alpha', desc: 'V_class 缩放因子 (推荐 1.0)。', defaultValue: 1.0, min: 0.1, max: 5.0, step: 0.1, visibleWhen: (c) => c.ed_lora_enabled },
];

// ── 感知锚 / 频域纹理损失 ─────────────────────────────────────────────────────
export const S_PERCEPTUAL_ANCHOR_LOSS = [
  { key: 'lulynx_freq_texture_enabled', type: 'boolean', label: '频域纹理损失', desc: 'latent 频域纹理损失，参与 loss-splitting 交替。default-off。', defaultValue: false },
  { key: 'lulynx_freq_texture_weight', type: 'number', label: '频域纹理权重', desc: '损失权重。', defaultValue: 0.0, step: 0.01, visibleWhen: (c) => c.lulynx_freq_texture_enabled },
  { key: 'lulynx_latent_anchor_enabled', type: 'boolean', label: 'Latent 感知锚', desc: 'latent 域感知锚损失，参与 loss-splitting。default-off。', defaultValue: false },
  { key: 'lulynx_latent_anchor_weight', type: 'number', label: '感知锚权重', desc: '损失权重。', defaultValue: 0.0, step: 0.01, visibleWhen: (c) => c.lulynx_latent_anchor_enabled },
];

// ── 采样与优化储备 ────────────────────────────────────────────────────────────
export const S_SAMPLING_OPTIMIZATION_RESERVE = [
  { key: 'adaptive_loss_weighting_enabled', type: 'boolean', label: '自适应损失加权 (learnable SNR γ)', desc: '可学习 SNR gamma 替代固定 min-SNR。default-off。', defaultValue: false },
  { key: 'ant_enabled', type: 'boolean', label: 'ANT 自适应时间步采样', desc: 'per-σ-bin loss EMA → loss-driven 采样，warmup 后生效。default-off。', defaultValue: false },
  { key: 'ant_blend', type: 'number', label: 'ANT 混合比', desc: 'loss-driven 与 uniform 混合 (1=纯 loss-driven)。', defaultValue: 0.7, min: 0, max: 1, step: 0.1, visibleWhen: (c) => c.ant_enabled },
  { key: 'bp_low_enabled', type: 'boolean', label: 'BP-low 低分辨率反传', desc: '高噪声 step 降采样 loss 省显存。default-off。', defaultValue: false },
  { key: 'distillation_enabled', type: 'boolean', label: 'AnyFlow 一致性蒸馏', desc: 'Flow-Matching 一致性蒸馏。default-off。', defaultValue: false },
  { key: 'distillation_mode', type: 'select', label: '蒸馏模式', desc: '蒸馏模式。', defaultValue: 'consistency', options: [{ value: 'consistency', label: 'consistency' }, { value: 'dmd', label: 'DMD' }], visibleWhen: (c) => c.distillation_enabled },
  { key: 'dop_enabled', type: 'boolean', label: 'DOP (差异输出保留)', desc: '保留基座输出差异，防灾难遗忘。default-off。', defaultValue: false },
  { key: 'dop_weight', type: 'number', label: 'DOP 权重', desc: 'DOP 正则权重。', defaultValue: 0.1, step: 0.01, visibleWhen: (c) => c.dop_enabled },
  { key: 'coreset_enabled', type: 'boolean', label: 'Coreset 重要性采样', desc: '基于损失历史的样本重要性采样 (easy/hard/toxic 分级)。default-off。', defaultValue: false },
  { key: 'coreset_easy_weight', type: 'number', label: 'Coreset easy 权重', desc: '简单样本权重。', defaultValue: 1.0, step: 0.1, visibleWhen: (c) => c.coreset_enabled },
  { key: 'coreset_hard_weight', type: 'number', label: 'Coreset hard 权重', desc: '困难样本权重。', defaultValue: 1.5, step: 0.1, visibleWhen: (c) => c.coreset_enabled },
];

// ── REPA / JLT 表征对齐（去掉 anima 专属的 ema_feat_align）────────────────────
export const S_REPA_RESERVE = [
  { key: 'softrepa_enabled', type: 'boolean', label: 'SoftREPA (软表征对齐)', desc: 'REPA 软化版，按 schedule 渐进对齐视觉编码器表征。default-off。', defaultValue: false },
  { key: 'softrepa_min_weight', type: 'number', label: 'SoftREPA 最小权重', desc: 'schedule 起始权重。', defaultValue: 0.0, step: 0.01, visibleWhen: (c) => c.softrepa_enabled },
  { key: 'softrepa_max_weight', type: 'number', label: 'SoftREPA 最大权重', desc: 'schedule 结束权重。', defaultValue: 1.0, step: 0.01, visibleWhen: (c) => c.softrepa_enabled },
];

// ── 实验探针 ──────────────────────────────────────────────────────────────────
export const S_EXPERIMENTAL_PROBES = [
  { key: 'fera_enabled', type: 'boolean', label: 'FERA 探测', desc: '实验性特征探测。default-off。', defaultValue: false },
  { key: 'fim_scan_enabled', type: 'boolean', label: 'FIM 扫描', desc: 'Fisher 信息矩阵扫描。default-off。', defaultValue: false },
  { key: 'forgetting_probe_enabled', type: 'boolean', label: '遗忘探测', desc: '监测训练中的概念遗忘。default-off。', defaultValue: false },
  { key: 'grad_cosine_enabled', type: 'boolean', label: '梯度余弦监测', desc: '梯度方向余弦监测（诊断）。default-off。', defaultValue: false },
  { key: 'flexrank_lora_enabled', type: 'boolean', label: 'FlexRank LoRA', desc: '弹性 rank LoRA（实验性）。default-off。', defaultValue: false },
  { key: 'fractional_grad_damping_enabled', type: 'boolean', label: '分数梯度阻尼', desc: '分数阶梯度阻尼（实验性）。default-off。', defaultValue: false },
  { key: 'sds_lora_enabled', type: 'boolean', label: 'SDS-LoRA (无奇异值梯度)', desc: '双分支产出各向同性梯度，warmup SVD 重参数化。default-off。', defaultValue: false },
];

// ── 诊断与监控 ────────────────────────────────────────────────────────────────
export const S_DIAGNOSTICS_MONITORING = [
  { key: 'advanced_monitoring_enabled', type: 'boolean', label: '高级监控', desc: '训练过程高级监控（详细指标）。default-off。', defaultValue: false },
  { key: 'advanced_stats_enabled', type: 'boolean', label: '高级统计', desc: '额外训练统计。default-off。', defaultValue: false },
  { key: 'deep_diagnostics_enabled', type: 'boolean', label: '深度诊断', desc: '深度诊断模式（更多日志/探针）。default-off。', defaultValue: false },
  { key: 'layer_monitor_enabled', type: 'boolean', label: '逐层监测', desc: '逐层激活/梯度监测。default-off。', defaultValue: false },
  { key: 'layer_monitor_mode', type: 'select', label: '逐层监测模式', desc: '监测模式。', defaultValue: 'stats', options: [{ value: 'stats', label: 'stats' }, { value: 'full', label: 'full' }], visibleWhen: (c) => c.layer_monitor_enabled },
  { key: 'step_phase_profile_enabled', type: 'boolean', label: '步阶段 profiling', desc: '训练步各阶段耗时 profiling。default-off。', defaultValue: false },
];

// ── AutoController ────────────────────────────────────────────────────────────
export const S_AUTO_CONTROLLER = [
  { key: 'ac_enabled', type: 'boolean', label: '启用 AutoController', desc: '根据训练状态自动调整学习率、早停、TE 冻结等。default-off。', defaultValue: false },
  { key: 'ac_enable_smart_early_stopping', type: 'boolean', label: '智能早停', desc: '损失长期不下降时自动停止训练。', defaultValue: false, visibleWhen: when('ac_enabled', true) },
  { key: 'ac_early_stopping_patience', type: 'number', label: '早停耐心值（步数）', desc: '多少步内无改善就触发早停。', defaultValue: 5, min: 1, step: 1, visibleWhen: all(when('ac_enabled', true), when('ac_enable_smart_early_stopping', true)) },
  { key: 'ac_early_stopping_threshold', type: 'number', label: '早停阈值', desc: '损失改善小于此值视为无改善。', defaultValue: 0.001, min: 0, step: 0.0001, visibleWhen: all(when('ac_enabled', true), when('ac_enable_smart_early_stopping', true)) },
  { key: 'ac_enable_smart_lr_decay', type: 'boolean', label: '智能学习率衰减', desc: '损失平台期自动降低学习率。', defaultValue: false, visibleWhen: when('ac_enabled', true) },
  { key: 'ac_lr_decay_factor', type: 'number', label: '学习率衰减系数', desc: '触发衰减时学习率乘以此系数。', defaultValue: 0.5, min: 0.1, max: 1, step: 0.05, visibleWhen: all(when('ac_enabled', true), when('ac_enable_smart_lr_decay', true)) },
  { key: 'ac_max_decays', type: 'number', label: '最大衰减次数', desc: '学习率最多衰减多少次。', defaultValue: 3, min: 1, step: 1, visibleWhen: all(when('ac_enabled', true), when('ac_enable_smart_lr_decay', true)) },
  { key: 'ac_enable_auto_te_freeze', type: 'boolean', label: '自动冻结文本编码器', desc: '训练到指定步数后自动冻结 TE。', defaultValue: false, visibleWhen: when('ac_enabled', true) },
  { key: 'ac_te_freeze_step', type: 'number', label: 'TE 冻结步数', desc: '在此步数后冻结文本编码器。', defaultValue: 0, min: 0, step: 1, visibleWhen: all(when('ac_enabled', true), when('ac_enable_auto_te_freeze', true)) },
  { key: 'ac_enable_dynamic_loss_scaling', type: 'boolean', label: '动态损失缩放', desc: '根据梯度范数动态调整损失缩放。', defaultValue: false, visibleWhen: when('ac_enabled', true) },
  { key: 'ac_enable_auto_lr_adjustment', type: 'boolean', label: '自动学习率调整', desc: '根据目标 GSNR/损失自动调整学习率。', defaultValue: false, visibleWhen: when('ac_enabled', true) },
  { key: 'ac_auto_lr_scale_factor', type: 'number', label: '自动学习率缩放因子', desc: '自动调整的学习率缩放系数。', defaultValue: 1.0, min: 0.1, max: 10, step: 0.1, visibleWhen: all(when('ac_enabled', true), when('ac_enable_auto_lr_adjustment', true)) },
  { key: 'ac_target_gsnr', type: 'number', label: '目标 GSNR', desc: '目标梯度信噪比。', defaultValue: 5.0, min: 0, step: 0.5, visibleWhen: all(when('ac_enabled', true), when('ac_enable_auto_lr_adjustment', true)) },
  { key: 'ac_target_loss', type: 'number', label: '目标损失', desc: '期望目标损失值（0 不设目标）。', defaultValue: 0.0, min: 0, step: 0.01, visibleWhen: all(when('ac_enabled', true), when('ac_enable_auto_lr_adjustment', true)) },
  { key: 'ac_warmup_steps', type: 'number', label: 'AutoController 预热步数', desc: '多少步后开始生效。', defaultValue: 100, min: 0, step: 10, visibleWhen: when('ac_enabled', true) },
  { key: 'ac_loss_plateau_window', type: 'number', label: '损失平台窗口', desc: '判断损失平台的滑动窗口大小（步数）。', defaultValue: 50, min: 10, step: 10, visibleWhen: when('ac_enabled', true) },
  { key: 'ac_clip_drift_warning', type: 'number', label: 'CLIP 漂移警告阈值', desc: 'CLIP 漂移超过此值发出警告。', defaultValue: 0.03, min: 0, step: 0.001, visibleWhen: when('ac_enabled', true) },
  { key: 'ac_clip_drift_danger', type: 'number', label: 'CLIP 漂移危险阈值', desc: 'CLIP 漂移超过此值触发干预。', defaultValue: 0.05, min: 0, step: 0.001, visibleWhen: when('ac_enabled', true) },
  { key: 'ac_stable_rank_collapse_threshold', type: 'number', label: 'Stable Rank 崩溃阈值', desc: 'Stable Rank 下降超过此比例视为崩溃。', defaultValue: 0.3, min: 0, max: 1, step: 0.05, visibleWhen: when('ac_enabled', true) },
];

// ── TurboCore ─────────────────────────────────────────────────────────────────
export const S_TURBOCORE = [
  { key: 'turbocore_native_update_dispatch_enabled', type: 'boolean', label: 'Native 更新派发', desc: 'TurboCore native 更新派发开关。default-off。', defaultValue: false },
  { key: 'turbocore_native_update_mode', type: 'select', label: 'Native 更新模式', desc: 'native 更新模式。', defaultValue: 'auto', options: [{ value: 'auto', label: 'auto' }, { value: 'on', label: 'on' }, { value: 'off', label: 'off' }], visibleWhen: (c) => c.turbocore_native_update_dispatch_enabled },
  { key: 'turbocore_update_shadow_mode', type: 'boolean', label: '更新 shadow 验证', desc: '更新 shadow 验证模式。default-off。', defaultValue: false },
  { key: 'turbocore_tuned_kernel_disable', type: 'boolean', label: '禁用自动调优内核', desc: '关闭 TurboCore 自动调优内核（全局开关），仅在遇到兼容性问题时使用。', defaultValue: false },
  { key: 'turbocore_profile', type: 'select', label: 'TurboCore 性能档位', desc: 'basic=基础; balanced=平衡; aggressive=激进（增加显存）。', defaultValue: 'basic', options: [
    { value: 'basic', label: 'Basic (基础)' },
    { value: 'balanced', label: 'Balanced (平衡)' },
    { value: 'aggressive', label: 'Aggressive (激进)' },
  ] },
  { key: 'turbocore_allow_fallback', type: 'boolean', label: '允许回退到 PyTorch', desc: '优化内核不可用时自动回退，建议保持开启。', defaultValue: true },
  { key: 'turbocore_strict', type: 'boolean', label: '严格模式', desc: '优化内核失败时报错而非回退，用于调试。', defaultValue: false },
  { key: 'turbocore_workspace_mb', type: 'number', label: 'Workspace 大小 (MB)', desc: '0 = 自动分配。', defaultValue: 0, min: 0, step: 64 },
  { key: 'turbocore_prefetch_depth', type: 'number', label: '预取深度', desc: '预取队列深度，默认 2，增加可隐藏延迟但增加显存。', defaultValue: 2, min: 1, max: 8, step: 1 },
  { key: 'turbocore_features', type: 'textarea', label: '启用功能列表', desc: '额外启用的优化功能（逗号分隔），留空=使用 profile 默认。', defaultValue: '' },
  { key: 'turbocore_disable', type: 'textarea', label: '禁用功能列表', desc: '要禁用的优化功能（逗号分隔），用于排查兼容性问题。', defaultValue: '' },
];
