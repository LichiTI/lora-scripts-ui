// ================================================================
// animaSchema.js — Anima 训练族 Schema(活文件 / 权威来源)
// 这里是 anima-lora / anima-ileco / anima-addift / anima-multi-addift /
// anima-finetune 的唯一权威 schema。未来给 Anima 增删字段只改本文件即可。
//
// 历史包袱说明:旧版本里这些 section 曾混在误命名的 sdxlSchema.js 神文件内,
// 而同名旧 animaSchema.js 是死代码(与 schemaRegistry.js 互相 import 成闭环、
// 无人消费),改它零效果。本次重构已把活代码搬来这里,死代码闭环移除。
//
// 依赖方向(单向无环):schemaCommon → schemaFieldGroups → 本文件 → schemaIndex。
// 公共工具/选项取自 schemaCommon;跨族共享字段组(S_SAVE/S_LR/... )取自 schemaFieldGroups;
// anima 专属常量(S_ANIMA_INFERENCE_ACCEL / animaConcept* )就地定义,不外泄。
// ================================================================
import {
  when, all, sec, ds, flowParams,
  ditGradientCheckpointingField, ditTrainFields,
  NATIVE_ADAPTER_TYPES, ADAPTER_INIT_STRATEGY_OPTIONS, ADAPTER_INIT_EXPORT_MODE_OPTIONS,
  LOFTQ_QUANT_TYPE_OPTIONS, LYCORIS_DELTA_ALGOS,
  nativeLoraInitSelected, loftqInitSelected, pissaInitSelected,
} from './schemaCommon.js';
import {
  S_SAVE, S_CAPTION, S_DATA_AUG, S_LR, S_LR_TARGET, S_LR_FT, S_TRAIN, S_PREVIEW,
  S_VALIDATION, S_NOISE, S_ADV, S_THERMAL, S_DISTRIBUTED,
  S_SPEED_FLOW, S_LULYNX_SDXL, S_DIT_PERFORMANCE_EXPERT,
  VRAM_AUTO_ENHANCE_FIELDS, ANIMA_BLOCK_RESIDENCY_FIELDS,
  conceptEditIdeaFields,
} from './schemaFieldGroups.js';
import {
  S_QUALITY_OPTIMIZATION_PACK, S_LORA_VARIANTS, S_PERCEPTUAL_ANCHOR_LOSS,
  S_SAMPLING_OPTIMIZATION_RESERVE, S_REPA_RESERVE, S_EXPERIMENTAL_PROBES,
  S_DIAGNOSTICS_MONITORING, S_AUTO_CONTROLLER, S_TURBOCORE,
} from './schemaFrontierGroups.js';

// Anima 预览出图推理加速(DiT 块缓存 skip)。仅 Anima 路线;默认关=精确逐块计算=parity。
// 关时方案/强度字段隐藏不输出 → 后端 sample_cache_seam_backend 默认 'none';enable_inference_accel 为纯 UI gate,
// 由 runConfigBuilder.removeUiOnlyFields 删除不传后端。probe 双开由 sampler.create_sampler_from_trainer 据 backend 自动补。
const S_ANIMA_INFERENCE_ACCEL = [
  { key: 'enable_inference_accel', type: 'boolean', label: '允许推理加速 (预览出图)', desc: '可选地加速预览出图：Spectrum/SmoothCache 会跳过部分 DiT 块计算并复用缓存，换取更快出图。会引入质量漂移，预览图可能不完全反映真实训练状态——仅在愿意用质量换速度(如高频出图)时开启；判断训练效果建议关闭。默认关闭=精确逐块计算。', defaultValue: false, visibleWhen: when('enable_preview', true) },
  { key: 'sample_cache_seam_backend', type: 'select', label: '加速方案', desc: 'Spectrum=块缓存线性外推(实测每步均值约 1.59x，有可测漂移，适合成品快出图)；SmoothCache=误差引导缓存(数据自适应，相关性高时复用更多、漂移更小)。', defaultValue: 'spectrum', options: [{ value: 'spectrum', label: 'Spectrum (块缓存线性外推)' }, { value: 'smoothcache', label: 'SmoothCache (误差引导缓存)' }], visibleWhen: all(when('enable_preview', true), when('enable_inference_accel', true)) },
  { key: 'sample_cache_seam_window_size', type: 'number', label: 'Spectrum 窗口大小', desc: '线性外推用的历史窗口。窗口越大跳过越多、越快，但 latent 漂移越大。默认 3。', defaultValue: 3, min: 2, step: 1, visibleWhen: all(when('enable_preview', true), when('enable_inference_accel', true), when('sample_cache_seam_backend', 'spectrum')) },
  { key: 'sample_smoothcache_error_threshold', type: 'number', label: 'SmoothCache 误差阈值', desc: '块间误差低于该阈值才复用缓存。阈值越松(越大)复用越多、越快，但漂移越大。默认 0.08。', defaultValue: 0.08, min: 0, step: 0.01, visibleWhen: all(when('enable_preview', true), when('enable_inference_accel', true), when('sample_cache_seam_backend', 'smoothcache')) },
];

// Anima 训练「忠实原生前向」(#147)。默认关 = 旧路径(#132)逐位不变 = parity，仅显式开启才生效。
// 开启后做两处真修复(A/B 实测让 anima 真正收敛:单概念 loss−92%/cos→0.96,多风格 cos→0.955/0.969):
//   ① 时间步喂 t=sigma∈[0,1](rectified flow),不是 sigma*1000;
//   ② cross-attn context 由冻结的 llm_adapter 现跑产出(Qwen3 hidden + T5 ids),不再直接喂 raw Qwen3 hidden,并启用 3D-RoPE 自注意力。
// 文本侧全程冻结(llm_adapter 只跑不训)。仅 anima-lora 缓存优先路线;faithful 自动关闭 block-checkpoint/缓存/reducer seam,
// 缺 t5_input_ids 或同时开了 reducer 等不兼容时自动回退旧路径(后端醒目提示,不报错)。native anima 默认开;后端 config.anima_faithful_forward 直接消费(Pydantic 声明字段,无需白名单)。
const S_ANIMA_FAITHFUL_FORWARD = [
  { key: 'anima_faithful_forward', type: 'boolean', label: '忠实原生前向 (实验 / native anima 默认开)', desc: '实验功能,native anima 默认开启。用「忠实」原生 DiT 前向训练:时间步 t=sigma∈[0,1]、cross-attn 由冻结 llm_adapter 现跑产出、启用 3D-RoPE。A/B 已验证这能修好 anima 经典的「素材有点风格差异 loss 就下不去」(根因是训练实现的两个 bug,非架构)。仅 anima-lora 缓存优先路线。若缓存缺 T5 token(原生缓存默认带)或同时开了 reducer 加速等不兼容情况,会自动回退旧路径并在日志醒目提示(不报错、非静默)。关闭 = 与旧 #132 路径逐位一致。开启显存占用更高(忠实前向无法用检查点),OOM 时降分辨率/批量。', defaultValue: true },
];

// FG-LoRA 训练时选择性层注入 (adapter_target_policy)。默认 'all' 训练所有层=传统 LoRA=parity。
// 'profiled' / 'gradient_selected' / 'cka_selected' 按重要性选择子集层，减少参数量或重分配 rank。
// fg_lora_rank_policy 控制 rank 分配策略:coupled_prune=删除不重要层、其他层按分数分配 rank;
// center_peak/ascending/descending=保留所有层但重分配 rank 给特定区域。
const S_ADAPTER_TARGET_POLICY = [
  { key: 'adapter_target_policy', type: 'select', label: 'FG-LoRA 选择策略', title: 'adapter_target_policy', desc: 'all=训练所有目标模块(默认，传统 LoRA)；profiled=根据预计算的 profile JSON 选择子集；gradient_selected=按梯度贡献选择；cka_selected=按 CKA 相似度选择。选择性注入可在不增加总参数的情况下提升质量，或在保持质量的情况下减少显存占用。', defaultValue: 'all', options: [
    { value: 'all', label: 'All (训练所有层，传统 LoRA)' },
    { value: 'profiled', label: 'Profiled (使用预计算 profile)' },
    { value: 'gradient_selected', label: 'Gradient Selected (按梯度选择)' },
    { value: 'cka_selected', label: 'CKA Selected (按相似度选择)' },
  ] },
  { key: 'fg_lora_rank_policy', type: 'select', label: 'Rank 分配策略', title: 'fg_lora_rank_policy', desc: 'coupled_prune=剔除不重要层，保留层按分数分配 rank（省显存）；center_peak=保留所有层，中间层更高 rank；ascending=浅层低→深层高；descending=深层低→浅层高；uniform_redistribute=均匀重分配。', defaultValue: 'coupled_prune', options: [
    { value: 'coupled_prune', label: 'Coupled Prune (剔除不重要层)' },
    { value: 'center_peak', label: 'Center Peak (中间层高 rank)' },
    { value: 'ascending', label: 'Ascending (深层高 rank)' },
    { value: 'descending', label: 'Descending (浅层高 rank)' },
    { value: 'uniform_redistribute', label: 'Uniform Redistribute (均匀分配)' },
    { value: 'fim_profile', label: 'FIM Profile (FIM 扫描器逐层精确 rank)' },
  ], visibleWhen: (c) => c.adapter_target_policy !== 'all' },
  { key: 'fg_lora_rank_min', type: 'number', label: '最小 Rank', title: 'fg_lora_rank_min', desc: '选中层的最小 rank。配合 rank 分配策略，低分数层会接近此值。', defaultValue: 4, min: 1, step: 1, visibleWhen: (c) => c.adapter_target_policy !== 'all' },
  { key: 'fg_lora_rank_max', type: 'number', label: '最大 Rank', title: 'fg_lora_rank_max', desc: '选中层的最大 rank。高分数层会接近此值。', defaultValue: 32, min: 1, step: 1, visibleWhen: (c) => c.adapter_target_policy !== 'all' },
  { key: 'adapter_target_policy_fraction', type: 'number', label: '选择层比例', title: 'adapter_target_policy_fraction', desc: '保留多少比例的层（0.0-1.0）。例如 0.5 表示只训练 50% 重要的层。与 top_k 互斥，优先使用 top_k。', defaultValue: 1.0, min: 0, max: 1, step: 0.05, visibleWhen: (c) => c.adapter_target_policy !== 'all' && c.fg_lora_rank_policy === 'coupled_prune' },
  { key: 'adapter_target_policy_top_k', type: 'number', label: '选择层数量', title: 'adapter_target_policy_top_k', desc: '直接指定保留多少个最重要的层。0 表示使用 fraction 比例。', defaultValue: 0, min: 0, step: 1, visibleWhen: (c) => c.adapter_target_policy !== 'all' && c.fg_lora_rank_policy === 'coupled_prune' },
  { key: 'adapter_target_policy_min_score', type: 'number', label: '最低分数阈值', title: 'adapter_target_policy_min_score', desc: '层的重要性分数低于此值会被过滤。0 表示不设阈值。', defaultValue: 0, min: 0, step: 0.01, visibleWhen: (c) => c.adapter_target_policy !== 'all' },
  { key: 'fg_lora_rank_conserve_budget', type: 'boolean', label: '保持总 Rank 预算', title: 'fg_lora_rank_conserve_budget', desc: '重分配策略时，确保总 rank 数不超过传统 LoRA（所有层 × network_dim）。关闭则允许重点层获得更多 rank。', defaultValue: true, visibleWhen: (c) => c.adapter_target_policy !== 'all' && ['center_peak', 'ascending', 'descending', 'uniform_redistribute'].includes(c.fg_lora_rank_policy || '') },
  { key: 'fim_scan_tool', type: 'action', label: 'FIM Rank 扫描器（实验性）', desc: '训练前用经验 Fisher 信息扫描各层对任务的敏感度，自动给出"建议层 + 逐层 rank"水填分配。扫描完成后可一键写回到上面的 Rank 分配策略（fim_profile 模式，逐层精确 rank）。这是独立的预扫描工具，不进入训练主链。', buttonLabel: '打开 FIM 扫描器', handler: 'openFimScanTool', summaryKey: 'fg_lora_rank_map_json', visibleWhen: (c) => c.adapter_target_policy !== 'all' },
  { key: 'fg_lora_rank_map_json', type: 'textarea', label: 'FIM 逐层 Rank 映射', title: 'fg_lora_rank_map_json', desc: '由 FIM 扫描器一键写回的逐层精确 rank 映射（JSON：{完整层路径: rank}）。仅当 Rank 分配策略=fim_profile 时生效。一般不需要手动编辑。', defaultValue: '', visibleWhen: (c) => c.adapter_target_policy !== 'all' && c.fg_lora_rank_policy === 'fim_profile' },
];

// Anima 时间步采样策略 (timestep_sampling_strategy)。控制训练时采样哪些时间步。
// 默认 'disabled' 全范围均匀采样=传统训练=parity。'simple' 限制到指定范围，'advanced' 支持分段权重采样。
const S_TIMESTEP_SAMPLING_STRATEGY = [
  { key: 'timestep_sampling_mode', type: 'select', label: '时间步采样模式', desc: 'disabled=全范围均匀采样(默认，传统训练)；simple=限制到指定范围；advanced=自定义分段权重采样。用途：风格 LoRA 可集中训练高噪声阶段(500-1000)，细节修复 LoRA 可集中训练低噪声阶段(0-300)。', defaultValue: 'disabled', options: [
    { value: 'disabled', label: 'Disabled (全范围均匀采样，传统训练)' },
    { value: 'simple', label: 'Simple (范围限制)' },
    { value: 'advanced', label: 'Advanced (分段权重采样)' },
  ] },
  { key: 'min_timestep', type: 'number', label: '最小时间步', title: 'min_timestep', desc: '训练时采样的最小时间步（包含）。0=几乎无噪声（最终细节），1000=纯噪声（整体结构）。例如风格 LoRA 可设置 500 只影响早期构图。', defaultValue: 0, min: 0, max: 1000, step: 1, visibleWhen: (c) => c.timestep_sampling_mode === 'simple' },
  { key: 'max_timestep', type: 'number', label: '最大时间步', title: 'max_timestep', desc: '训练时采样的最大时间步（不包含）。例如细节修复 LoRA 可设置 300 只影响后期细节。', defaultValue: 1000, min: 0, max: 1000, step: 1, visibleWhen: (c) => c.timestep_sampling_mode === 'simple' },
  { key: 'timestep_segments', type: 'textarea', label: '分段配置', title: 'timestep_segments', desc: '格式: "start:end:weight, start:end:weight, ..."。例如 "0:300:0.2, 300:700:0.6, 700:1000:0.2" 表示低噪声段 20% 采样、中间段 60% 采样、高噪声段 20% 采样。段不能重叠。weight 是相对权重（会自动归一化）。', defaultValue: '', placeholder: '例如: 0:300:0.2, 300:700:0.6, 700:1000:0.2', visibleWhen: (c) => c.timestep_sampling_mode === 'advanced' },
  // ── Anima Flow 时间步分布 (独立于上方的范围过滤) ──
  { key: 'timestep_sampling', type: 'select', label: '时间步采样分布', title: 'timestep_sampling', desc: '控制 sigma 的采样概率分布，独立于上方的范围过滤。shift = 作者推荐，sigmoid 偏置后加 flow shift，适合 Anima 基座；sigma = 传统均匀随机（torch.rand）；logit_normal = logit-normal，Flux 默认风格；其他选项为实验性。', defaultValue: 'shift', options: [
    { value: 'shift', label: 'shift（推荐，sigmoid 偏置 + flow shift）' },
    { value: 'sigma', label: 'sigma（传统均匀，torch.rand）' },
    { value: 'uniform', label: 'uniform（均匀 linspace）' },
    { value: 'sigmoid', label: 'sigmoid（sigmoid 压缩）' },
    { value: 'logit_normal', label: 'logit_normal（Flux 风格）' },
    { value: 'flux_shift', label: 'flux_shift（Flux + dynamic shift）' },
    { value: 'qwen_shift', label: 'qwen_shift（Qwen 变体）' },
    { value: 'ideogram4_shift', label: 'ideogram4_shift（Ideogram 4 变体）' },
    { value: 'logsnr', label: 'logsnr（log-SNR 均匀）' },
  ] },
  { key: 'discrete_flow_shift', type: 'number', label: 'Flow Shift', title: 'discrete_flow_shift', desc: 'shift/sigmoid/flux_shift 模式下的偏置量。较大值使采样向中等噪声集中（σ ≈ 0.5 区间），作者推荐 3.0；默认 1.0 = 轻度偏置。', defaultValue: 3.0, min: 0.1, max: 10.0, step: 0.1, visibleWhen: (c) => ['shift', 'sigmoid', 'flux_shift', 'qwen_shift', 'ideogram4_shift'].includes(c.timestep_sampling) },
  { key: 'anima_sigmoid_scale', type: 'number', label: 'Sigmoid Scale', title: 'anima_sigmoid_scale', desc: 'sigmoid 分布的压缩系数。较大值使分布更集中，较小值使分布更平坦。', defaultValue: 1.0, min: 0.1, max: 5.0, step: 0.1, visibleWhen: (c) => ['sigmoid', 'shift'].includes(c.timestep_sampling) },
  { key: 'anima_weighting_scheme', type: 'select', label: 'Loss 加权方案', title: 'anima_weighting_scheme', desc: '按 sigma 对 loss 施加非均匀权重，引导模型更关注某些噪声阶段。none = 不加权（推荐起点）；sigma_sqrt = √σ(1-σ)，均衡高低噪声；logit_normal = logit-normal 加权；mode = 单峰 mode 加权。', defaultValue: '', options: [
    { value: '', label: '不加权 (none)' },
    { value: 'sigma_sqrt', label: 'sigma_sqrt（均衡高低噪声）' },
    { value: 'logit_normal', label: 'logit_normal（logit-normal 加权）' },
    { value: 'mode', label: 'mode（单峰）' },
    { value: 'cosmap', label: 'cosmap（余弦映射）' },
  ] },
  { key: 'flow_logit_mean', type: 'number', label: 'Logit Mean', title: 'flow_logit_mean', desc: 'logit_normal 分布的均值参数（logit 空间）。0.0 = 对称，负值偏向低噪声，正值偏向高噪声。', defaultValue: 0.0, min: -5.0, max: 5.0, step: 0.1, visibleWhen: (c) => c.timestep_sampling === 'logit_normal' || c.anima_weighting_scheme === 'logit_normal' },
  { key: 'flow_logit_std', type: 'number', label: 'Logit Std', title: 'flow_logit_std', desc: 'logit_normal 分布的标准差参数。较大值使采样更分散，较小值更集中。', defaultValue: 1.0, min: 0.1, max: 5.0, step: 0.1, visibleWhen: (c) => c.timestep_sampling === 'logit_normal' || c.anima_weighting_scheme === 'logit_normal' },
  // Smart Noise Scheduler (arXiv:2407.03297, default-off reserve)
  { key: 'smart_noise_enabled', type: 'boolean', label: 'Smart Noise Scheduler', title: 'smart_noise_enabled', desc: 'logSNR 感知的自适应 timestep 采样，集中训练在 logSNR≈0 (σ≈0.5) 最敏感区域。arXiv:2407.03297 ICCV 2025。default-off 储备。', defaultValue: false },
  { key: 'smart_noise_logsnr_focus', type: 'number', label: 'Smart Noise 焦点 logSNR', title: 'smart_noise_logsnr_focus', desc: '焦点在 logSNR 空间的位置。0.0 = σ=0.5 平衡点（推荐）；负值偏向低噪声（细节），正值偏向高噪声（结构）。', defaultValue: 0.0, min: -3.0, max: 3.0, step: 0.1, visibleWhen: (c) => c.smart_noise_enabled },
  { key: 'smart_noise_focus_strength', type: 'number', label: 'Smart Noise 聚焦强度', title: 'smart_noise_focus_strength', desc: '聚焦强度，范围 [0,1]。0.0 = 均匀分布（关闭），1.0 = 纯聚焦。推荐 0.5-0.8。', defaultValue: 0.5, min: 0.0, max: 1.0, step: 0.05, visibleWhen: (c) => c.smart_noise_enabled },
  { key: 'smart_noise_focus_spread', type: 'number', label: 'Smart Noise 焦点宽度', title: 'smart_noise_focus_spread', desc: '焦点高斯分布的标准差（logSNR 单位）。较大值覆盖更宽范围，较小值更集中。', defaultValue: 2.0, min: 0.5, max: 5.0, step: 0.1, visibleWhen: (c) => c.smart_noise_enabled },
  // BP-low (Low-Resolution Backward, default-off reserve)
  { key: 'bp_low_enabled', type: 'boolean', label: 'BP-low 低分辨率反传', title: 'bp_low_enabled', desc: '高噪声 timestep 使用低分辨率反传以节省显存（SDXL 约 37% VRAM 节省）。default-off 储备。', defaultValue: false },
  { key: 'bp_low_factor', type: 'number', label: 'BP-low 下采样倍数', title: 'bp_low_factor', desc: '下采样倍数。2 = 半分辨率（64→32），4 = 四分之一分辨率。越大省显存越多但精度略降。', defaultValue: 2, min: 2, max: 4, step: 1, visibleWhen: (c) => c.bp_low_enabled },
  { key: 'bp_low_noise_threshold', type: 'number', label: 'BP-low 噪声阈值', title: 'bp_low_noise_threshold', desc: '触发低分辨率反传的 sigma 阈值。仅 sigma > 该值的 timestep 会下采样。推荐 0.5（中高噪声）。', defaultValue: 0.5, min: 0.1, max: 0.9, step: 0.05, visibleWhen: (c) => c.bp_low_enabled },
  { key: 'bp_low_schedule', type: 'select', label: 'BP-low 调度策略', title: 'bp_low_schedule', desc: 'step = 阶跃开关（sigma > threshold 直接下采样）；cosine = 余弦平滑过渡（更平滑但稍复杂）。', defaultValue: 'step', options: [
    { value: 'step', label: 'step（阶跃）' },
    { value: 'cosine', label: 'cosine（余弦平滑）' },
  ], visibleWhen: (c) => c.bp_low_enabled },
];


// Anima 专属：JLT EMA 特征自蒸馏（非通用，仅 anima 路线）
const S_ANIMA_JLT_EMA = [
  { key: 'anima_ema_feat_align_enabled', type: 'boolean', label: 'JLT EMA 特征自蒸馏', desc: 'JLT 储备:EMA-of-LoRA 影子 + 特征自蒸馏对齐。default-off, 仅 anima。', defaultValue: false },
  { key: 'anima_ema_feat_align_weight', type: 'number', label: 'EMA 特征对齐权重', desc: '对齐损失权重。', defaultValue: 0.0, step: 0.01, visibleWhen: (c) => c.anima_ema_feat_align_enabled },
];


// ── Phase C: 缓存系统配置（统一：内存/磁盘/格式/引擎）──
const _diskEnabled = (c) => c.cache_latents_to_disk || c.cache_text_encoder_outputs_to_disk;
const _losslessOff = (c) => _diskEnabled(c) && (c.lossless_cache_replacement_mode === 'off' || !c.lossless_cache_replacement_mode);
const _losslessOn  = (c) => _diskEnabled(c) && c.lossless_cache_replacement_mode && c.lossless_cache_replacement_mode !== 'off';
const S_CACHE_SYSTEM = [
  // ── 内存缓存开关 ──
  { key: 'cache_latents', type: 'boolean', label: '启用 Latent 内存缓存', desc: '缓存 VAE 编码后的 latent 张量，避免每步重复编码。强烈推荐开启（除非动态增强需要每步重新编码）。', defaultValue: true },
  { key: 'cache_text_encoder_outputs', type: 'boolean', label: '启用文本编码器输出缓存', desc: '缓存文本编码器（Qwen3/T5）的输出。固定标签时强烈推荐开启。标签变体/动态标签时需关闭。', defaultValue: false },
  // ── 磁盘持久化 ──
  { key: 'cache_latents_to_disk', type: 'boolean', label: 'Latent 缓存到磁盘', desc: '将 latent 缓存持久化到磁盘，跨训练 run 复用。适合大数据集或多次反复训练同一批数据。', defaultValue: false },
  { key: 'cache_text_encoder_outputs_to_disk', type: 'boolean', label: '文本编码器输出缓存到磁盘', desc: '将文本编码器输出缓存到磁盘。适合长文本或大数据集。', defaultValue: false },
  // ── 缓存引擎后端（任一磁盘缓存开启时显示）──
  { key: 'lossless_cache_replacement_mode', type: 'select', label: '磁盘缓存引擎', desc: '磁盘缓存后端。原版=标准 npz/safetensors/pt；LXFS/LYNX=无损压缩引擎（实验性，data-bound 场景收益更明显）；SQLite=manifest 索引引擎（实验性）。', defaultValue: 'off', options: [
    { value: 'off', label: '原版（npz / safetensors / pt）' },
    { value: 'anima_lxfs_probe', label: 'LXFS flat sidecar（实验）' },
    { value: 'anima_lynx_manifest_probe', label: 'LYNX manifest shard（实验）' },
    { value: 'anima_sqlite_bin_probe', label: 'SQLite manifest 索引（实验）' },
  ], visibleWhen: _diskEnabled },
  // ── 原版分支：格式与精度（引擎=原版时显示）──
  { key: 'latent_cache_disk_format', type: 'select', label: 'Latent 磁盘格式', desc: 'Latent 缓存文件格式。npz = NumPy 压缩（推荐）；safetensors = Hugging Face 格式；pt = PyTorch 原生格式。', defaultValue: 'npz', options: [
    { value: 'npz', label: 'NPZ (NumPy 压缩)' },
    { value: 'safetensors', label: 'SafeTensors' },
    { value: 'pt', label: 'PyTorch (.pt)' },
  ], visibleWhen: (c) => _losslessOff(c) && c.cache_latents_to_disk },
  { key: 'latent_cache_disk_dtype', type: 'select', label: 'Latent 磁盘精度', desc: 'Latent 缓存精度。float16 = 半精度（推荐，节省空间）；bfloat16 = BF16；float32 = 全精度。', defaultValue: 'float16', options: [
    { value: 'float16', label: 'Float16 (半精度)' },
    { value: 'bfloat16', label: 'BFloat16' },
    { value: 'float32', label: 'Float32 (全精度)' },
  ], visibleWhen: (c) => _losslessOff(c) && c.cache_latents_to_disk },
  { key: 'text_encoder_outputs_cache_disk_format', type: 'select', label: '文本编码器输出磁盘格式', desc: '文本编码器输出缓存文件格式。', defaultValue: 'npz', options: [
    { value: 'npz', label: 'NPZ (NumPy 压缩)' },
    { value: 'safetensors', label: 'SafeTensors' },
    { value: 'pt', label: 'PyTorch (.pt)' },
  ], visibleWhen: (c) => _losslessOff(c) && c.cache_text_encoder_outputs_to_disk },
  { key: 'text_encoder_outputs_cache_disk_dtype', type: 'select', label: '文本编码器输出磁盘精度', desc: '文本编码器输出缓存精度。', defaultValue: 'float16', options: [
    { value: 'float16', label: 'Float16 (半精度)' },
    { value: 'bfloat16', label: 'BFloat16' },
    { value: 'float32', label: 'Float32 (全精度)' },
  ], visibleWhen: (c) => _losslessOff(c) && c.cache_text_encoder_outputs_to_disk },
  { key: 'disable_mmap_load_safetensors', type: 'boolean', label: '禁用 mmap 加载', desc: '禁用 mmap 方式加载 safetensors，减少共享内存占用。适合网络存储或 HDD。', defaultValue: false, visibleWhen: (c) => _losslessOff(c) && c.latent_cache_disk_format === 'safetensors' },
  // ── Lossless 引擎分支（引擎!=原版时显示）──
  { key: 'lossless_cache_replacement_codecs', type: 'select', label: '压缩编码', desc: 'sidecar 压缩编码。lz4fast=速度优先（默认），zstd1=压缩率优先，raw=不压缩，fast-cache=组合。', defaultValue: 'lz4fast', options: [{ value: 'lz4fast', label: 'lz4fast' }, { value: 'zstd1', label: 'zstd1' }, { value: 'raw', label: 'raw' }, { value: 'fast-cache', label: 'fast-cache（组合）' }], visibleWhen: _losslessOn },
  { key: 'lossless_cache_replacement_prefetch_depth', type: 'number', label: '预取深度', desc: 'prefetch_thread 预取队列深度。', defaultValue: 2, min: 1, step: 1, visibleWhen: _losslessOn },
  { key: 'lossless_cache_replacement_read_mode', type: 'select', label: '读取模式', desc: 'prefetch_thread=后台线程预取（默认），sync=同步读取。', defaultValue: 'prefetch_thread', options: [{ value: 'prefetch_thread', label: 'prefetch_thread' }, { value: 'sync', label: 'sync' }], visibleWhen: _losslessOn },
  { key: 'lossless_cache_replacement_fallback_to_raw', type: 'boolean', label: '损坏自动回退', desc: 'sidecar 缺失/损坏时回退原版 npz 而非崩训练。关闭=strict 硬失败。', defaultValue: true, visibleWhen: _losslessOn },
  { key: 'lossless_cache_replacement_decoded_payload_cache', type: 'boolean', label: '解码载荷驻留内存', desc: '将解码后的 latent 载荷驻留在 CPU 内存，减少重复磁盘 IO（data-bound 场景有效）。', defaultValue: false, visibleWhen: _losslessOn },
  { key: 'lossless_cache_replacement_decoded_payload_cache_max_bytes', type: 'number', label: '内存载荷池上限 (bytes)', desc: '0 = 不限制；设置上限可防止 OOM。', defaultValue: 0, min: 0, step: 536870912, visibleWhen: (c) => _losslessOn(c) && c.lossless_cache_replacement_decoded_payload_cache },
];

// ── Phase C: Anima 高级配置 ──
const S_ANIMA_ADVANCED = [
  { key: 'anima_self_attn_lr', type: 'number', label: 'Self-Attention 学习率', desc: 'Anima DiT Self-Attention 层的独立学习率。0 = 使用全局学习率。高级用户可针对不同层设置不同学习率。', defaultValue: 0, min: 0, step: 1e-6 },
  { key: 'anima_cross_attn_lr', type: 'number', label: 'Cross-Attention 学习率', desc: 'Anima DiT Cross-Attention 层的独立学习率。0 = 使用全局学习率。', defaultValue: 0, min: 0, step: 1e-6 },
  { key: 'anima_mlp_lr', type: 'number', label: 'MLP 学习率', desc: 'Anima DiT MLP（前馈网络）层的独立学习率。0 = 使用全局学习率。', defaultValue: 0, min: 0, step: 1e-6 },
  { key: 'anima_mod_lr', type: 'number', label: 'Modulation 学习率', desc: 'Anima DiT Modulation（AdaLN）层的独立学习率。0 = 使用全局学习率。', defaultValue: 0, min: 0, step: 1e-6 },
  { key: 'anima_llm_adapter_lr', type: 'number', label: 'LLM Adapter 学习率', desc: 'Anima LLM Adapter 的独立学习率。0 = 使用全局学习率。仅在训练 LLM Adapter 时生效。', defaultValue: 0, min: 0, step: 1e-6 },
  { key: 'anima_train_llm_adapter', type: 'boolean', label: '训练 LLM Adapter', desc: '是否训练 Anima LLM Adapter。普通 LoRA 训练默认冻结 Adapter，仅训练 DiT。高级用户可开启联合训练。', defaultValue: false },
  { key: 'anima_fixed_text_tokens', type: 'number', label: '固定文本 Token 长度', desc: '0 = 动态批内 padding（默认）；>0 = 固定长度（如 512）。固定长度可加速编译优化路径，但会增加 padding 开销。', defaultValue: 0, min: 0, step: 64 },
  { key: 'anima_fixed_visual_tokens', type: 'number', label: '固定视觉 Token 长度', desc: '0 = 保持缓存大小（默认）；>0 = 固定长度（如 4096）。用于静态形状编译优化。', defaultValue: 0, min: 0, step: 64 },
  { key: 'anima_fused_qkv', type: 'boolean', label: '融合 QKV 投影', desc: '融合 Anima DiT Self-Attention 的 Q/K/V 投影为单个矩阵乘法。可提升性能，但不是所有 LoRA 类型都支持。', defaultValue: false },
];

const S_MEMORY_OFFLOAD = [
  { key: 'enable_sequential_cpu_offload', type: 'boolean', label: '启用顺序 CPU Offload', desc: '将模型组件顺序 offload 到 CPU，仅在需要时加载到 GPU。大幅减少显存占用，但会增加延迟。', defaultValue: false },
  { key: 'module_offload_enhanced', type: 'boolean', label: '增强模块 Offload', desc: '使用增强的模块 offload 策略（更智能的调度）。', defaultValue: false, visibleWhen: when('enable_sequential_cpu_offload', true) },
  { key: 'module_offload_profile', type: 'select', label: 'Module Offload 配置', desc: '预设的 offload 策略：balanced=平衡；aggressive=激进（最省显存）；conservative=保守（更快）。', defaultValue: 'balanced', options: [
    { value: 'balanced', label: 'Balanced (平衡)' },
    { value: 'aggressive', label: 'Aggressive (激进省显存)' },
    { value: 'conservative', label: 'Conservative (保守快速)' },
  ], visibleWhen: when('enable_sequential_cpu_offload', true) },
  { key: 'module_offload_profile_enabled', type: 'boolean', label: '启用 Offload Profile', desc: '启用预设的 offload 配置（vs 手动配置）。', defaultValue: true, visibleWhen: when('enable_sequential_cpu_offload', true) },
  { key: 'module_offload_min_param_mb', type: 'number', label: 'Offload 最小参数大小（MB）', desc: '只有参数大于此值的模块才会被 offload（避免小模块频繁传输的开销）。', defaultValue: 10, min: 1, step: 1, visibleWhen: when('enable_sequential_cpu_offload', true) },
  { key: 'module_offload_include_patterns', type: 'textarea', label: 'Offload 包含模式', desc: '要 offload 的模块名称模式（逗号分隔，支持通配符）。例如 "*.mlp,*.attn"。', defaultValue: '', visibleWhen: when('enable_sequential_cpu_offload', true) },
  { key: 'module_offload_exclude_patterns', type: 'textarea', label: 'Offload 排除模式', desc: '不要 offload 的模块名称模式（逗号分隔）。例如 "*.norm,*.embedding"。', defaultValue: '', visibleWhen: when('enable_sequential_cpu_offload', true) },
  { key: 'module_offload_prefetch_enabled', type: 'boolean', label: '启用 Offload 预取', desc: '提前预取下一个要用的模块（减少等待时间）。', defaultValue: true, visibleWhen: when('enable_sequential_cpu_offload', true) },
  { key: 'module_offload_prefetch_mode', type: 'select', label: 'Offload 预取模式', desc: 'simple=简单顺序预取；adaptive=自适应预取（根据历史模式）。', defaultValue: 'simple', options: [
    { value: 'simple', label: 'Simple (简单顺序)' },
    { value: 'adaptive', label: 'Adaptive (自适应)' },
  ], visibleWhen: all(when('enable_sequential_cpu_offload', true), when('module_offload_prefetch_enabled', true)) },
  { key: 'module_offload_verify_state', type: 'boolean', label: '验证 Offload 状态', desc: '每次传输后验证模块状态正确性（调试用，会降低性能）。', defaultValue: false, visibleWhen: when('enable_sequential_cpu_offload', true) },
  { key: 'cpu_offload_checkpointing_mode', type: 'select', label: 'CPU Offload Checkpointing 模式', desc: '梯度检查点与 CPU offload 结合模式：none=不结合；auto=自动选择；full=完整 offload。', defaultValue: 'none', options: [
    { value: 'none', label: 'None (不结合)' },
    { value: 'auto', label: 'Auto (自动)' },
    { value: 'full', label: 'Full (完整 offload)' },
  ] },
  { key: 'cpu_offload_checkpointing_pool_gb', type: 'number', label: 'CPU Offload Checkpointing 池大小（GB）', desc: 'CPU 端用于存储检查点的内存池大小。', defaultValue: 4, min: 1, max: 64, step: 1, visibleWhen: (c) => c.cpu_offload_checkpointing_mode && c.cpu_offload_checkpointing_mode !== 'none' },
  { key: 'bubble_controller_allow_optimizer_swap', type: 'boolean', label: '允许优化器状态交换', desc: 'Bubble Controller 允许将优化器状态交换到 CPU（极端显存紧张时）。', defaultValue: false },
  { key: 'newbie_auto_swap_release', type: 'boolean', label: '新手模式自动释放', desc: '新手模式：训练步间自动释放不需要的显存（更安全但稍慢）。', defaultValue: false },
  { key: 'vae_slicing', type: 'boolean', label: 'VAE 切片', desc: 'VAE 编码/解码时使用切片（省显存）。', defaultValue: false },
  { key: 'vae_tiling', type: 'boolean', label: 'VAE 分块', desc: 'VAE 使用分块处理（处理超大图像时省显存）。', defaultValue: false },
];

// ---- Anima 概念编辑(iLECO / ADDifT / Multi-ADDifT)字段与 section 模板 ----
const animaConceptEditModelFields = (typeId) => [
  { key: 'model_train_type', type: 'hidden', defaultValue: typeId },
  { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'Anima DiT 权重路径', title: 'pretrained_model_name_or_path', desc: 'Anima 主 DiT / transformer 权重路径', defaultValue: './sd-models/model.safetensors' },
  { key: 'vae', type: 'file', pickerType: 'model-file', label: 'Qwen Image VAE 路径', title: 'vae', desc: 'Anima 概念编辑需要的 VAE 路径', defaultValue: '' },
  { key: 'qwen3', type: 'file', pickerType: 'model-file', label: 'Qwen3 文本模型路径', title: 'qwen3', desc: 'Qwen3 文本模型路径。可填写单文件或本地模型目录', defaultValue: '' },
  { key: 'llm_adapter_path', type: 'file', pickerType: 'model-file', label: 'LLM Adapter 路径', title: 'llm_adapter_path', desc: '单独的 LLM Adapter 权重路径（可选）', defaultValue: '' },
  { key: 't5_tokenizer_path', type: 'folder', pickerType: 'folder', label: 'T5 tokenizer 目录', title: 't5_tokenizer_path', desc: '可选。留空时回退到项目内置 tokenizer', defaultValue: '' },
  { key: 'network_weights', type: 'file', pickerType: 'output-model-file', label: '继续训练 LoRA', title: 'network_weights', desc: '从已有的概念编辑 LoRA / DoRA / T-LoRA 模型继续训练', defaultValue: '' },
  { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径', title: 'resume', desc: '从某个 save_state 保存的中断状态继续训练，填写文件路径', defaultValue: '' },
];

const animaConceptEditNetworkFields = [
  { key: 'lora_type', type: 'select', label: '适配器类型', title: 'lora_type', desc: 'Anima 概念编辑当前支持原生 LoRA / DoRA / LoRA+ / rsLoRA / LoRA-FA / VeRA / T-LoRA / FlexRank / HydraLoRA / FeRA / LyCORIS。概念编辑首版建议优先从普通 LoRA 开始。', defaultValue: 'lora', options: NATIVE_ADAPTER_TYPES },
  { key: 'network_dim', type: 'slider', label: '网络维度', title: 'network_dim', desc: '网络维度，常用 4~64。概念编辑通常不需要太大 rank。', defaultValue: 16, min: 1, max: 256, step: 1 },
  { key: 'network_alpha', type: 'slider', label: '网络 Alpha', title: 'network_alpha', desc: '常用值：等于 network_dim 或更小。Alpha 越小通常需要更高学习率。', defaultValue: 16, min: 1, max: 256, step: 1 },
  { key: 'dim_from_weights', type: 'boolean', label: '从权重推断 Dim', title: 'dim_from_weights', desc: '从已有 network_weights 自动推断 rank / dim', defaultValue: false },
  { key: 'scale_weight_norms', type: 'number', label: '最大范数正则化', title: 'scale_weight_norms', desc: '最大范数正则化。如果使用，推荐从 1 附近开始', defaultValue: '', min: 0, step: 0.01 },
  { key: 'train_norm', type: 'boolean', label: '训练 Norm 层', title: 'train_norm', desc: '额外训练带可学习参数的归一化层。概念编辑一般先关闭，只有明确需要时再开。', defaultValue: false },
  { key: 'dora_wd', type: 'boolean', label: '启用 DoRA', title: 'dora_wd', desc: '仅在 Anima 原生 LoRA 路线下生效。DoRA 开启后会自动关闭 bypass_mode。', defaultValue: false, visibleWhen: when('lora_type', 'lora') },
  { key: 'bypass_mode', type: 'boolean', label: 'Bypass Mode', title: 'bypass_mode', desc: '兼容字段。普通 Anima LoRA 一般建议关闭；启用 DoRA 时会自动强制关闭。', defaultValue: false, visibleWhen: (c) => c.lora_type === 'lora' && !c.dora_wd },
  { key: 'adapter_init_strategy', type: 'select', label: 'LoRA 初始化策略', title: 'adapter_init_strategy', desc: '统一初始化入口：默认 LoRA / PiSSA / OLoRA。仅原生 LoRA 且未启用 DoRA 时生效。', defaultValue: 'default', options: ADAPTER_INIT_STRATEGY_OPTIONS, visibleWhen: (c) => c.lora_type === 'lora' && !c.dora_wd },
  { key: 'adapter_init_export_mode', type: 'select', label: '初始化导出模式', title: 'adapter_init_export_mode', desc: 'auto 会在最终保存时导出成可加载到原始底模的 LoRA；raw 保留精确训练状态用于恢复。', defaultValue: 'auto', options: ADAPTER_INIT_EXPORT_MODE_OPTIONS, visibleWhen: (c) => c.lora_type === 'lora' && nativeLoraInitSelected(c) },
  { key: 'loftq_bits', type: 'number', label: 'LoftQ 量化位宽', title: 'loftq_bits', desc: 'LoftQ 首版使用 fake-quant/dequant 权重残差初始化；不是持久 4bit base runtime。', defaultValue: 4, min: 2, max: 8, step: 1, visibleWhen: all(when('lora_type', 'lora'), loftqInitSelected) },
  { key: 'loftq_quant_type', type: 'select', label: 'LoftQ 量化粒度', title: 'loftq_quant_type', desc: 'rowwise 按输出通道量化，tensorwise 按整层张量量化。', defaultValue: 'rowwise', options: LOFTQ_QUANT_TYPE_OPTIONS, visibleWhen: all(when('lora_type', 'lora'), loftqInitSelected) },
  { key: 'network_dropout', type: 'number', label: 'Dropout', title: 'network_dropout', desc: '原生 LoRA / LoRA-FA / VeRA / T-LoRA / FlexRank / HydraLoRA / FeRA / LyCORIS delta 路线的 dropout 概率', defaultValue: 0, min: 0, step: 0.01, visibleWhen: (c) => ['lora', 'dora', 'lora_plus', 'rs_lora', 'lora_fa', 'vera', 'tlora', 'flexrank', 'hydralora', 'fera', ...LYCORIS_DELTA_ALGOS].includes(c.lora_type) },
  { key: 'flexrank_lora_rank_range_min', type: 'number', label: 'FlexRank 最小 Rank', title: 'flexrank_lora_rank_range_min', desc: 'FlexRank 每步随机采样激活 rank 的下界；最大 rank 仍使用 network_dim。', defaultValue: 1, min: 1, visibleWhen: when('lora_type', 'flexrank') },
  { key: 'tlora_min_rank', type: 'number', label: 'T-LoRA 最小 Rank', title: 'tlora_min_rank', desc: 'T-LoRA 最小动态 rank', defaultValue: 1, min: 1, visibleWhen: when('lora_type', 'tlora') },
  { key: 'tlora_rank_schedule', type: 'select', label: 'T-LoRA Rank 调度', title: 'tlora_rank_schedule', desc: 'T-LoRA 动态 rank 调度策略', defaultValue: 'cosine', options: ['cosine', 'linear'], visibleWhen: when('lora_type', 'tlora') },
  { key: 'tlora_orthogonal_init', type: 'boolean', label: 'T-LoRA 正交初始化', title: 'tlora_orthogonal_init', desc: '对 lora_down 使用正交初始化（实验性）', defaultValue: false, visibleWhen: when('lora_type', 'tlora') },
  { key: 'lokr_factor', type: 'number', label: 'LoKr 系数', title: 'lokr_factor', desc: 'LoKr 分解因子。当前 Anima LoKr 会自动回落到可整除的线性注入 factor', defaultValue: 8, min: -1, visibleWhen: when('lora_type', 'lokr') },
  { key: 'pissa_init', type: 'boolean', label: '启用 PiSSA 初始化', title: 'pissa_init', desc: '实验性，仅在原生 LoRA 类型下生效。若同时启用 DoRA，后端会自动忽略 PiSSA。', defaultValue: false, visibleWhen: (c) => c.lora_type === 'lora' && !c.dora_wd },
  { key: 'pissa_method', type: 'select', label: 'PiSSA 分解方式', title: 'pissa_method', desc: '推荐保持 rSVD 默认值', defaultValue: 'rsvd', options: ['rsvd', 'svd'], visibleWhen: all(when('lora_type', 'lora'), pissaInitSelected) },
  { key: 'pissa_niter', type: 'number', label: 'PiSSA 幂迭代次数', title: 'pissa_niter', desc: 'PiSSA rSVD 幂迭代次数（高级参数）', defaultValue: 2, min: 0, step: 1, visibleWhen: all(when('lora_type', 'lora'), pissaInitSelected) },
  { key: 'pissa_oversample', type: 'number', label: 'PiSSA 过采样维度', title: 'pissa_oversample', desc: 'PiSSA rSVD 过采样维度（高级参数）', defaultValue: 8, min: 0, step: 1, visibleWhen: all(when('lora_type', 'lora'), pissaInitSelected) },
  { key: 'pissa_apply_conv2d', type: 'boolean', label: 'PiSSA 作用于 Conv', title: 'pissa_apply_conv2d', desc: 'PiSSA 额外作用于 1x1 Conv（实验性）', defaultValue: false, visibleWhen: all(when('lora_type', 'lora'), pissaInitSelected) },
  { key: 'pissa_export_mode', type: 'select', label: 'PiSSA 导出模式', title: 'pissa_export_mode', desc: 'PiSSA 模型保存为标准 LoRA 时的导出方式', defaultValue: 'LoRA无损兼容导出', options: ['LoRA无损兼容导出', 'LoRA快速近似导出'], visibleWhen: all(when('lora_type', 'lora'), pissaInitSelected) },
  { key: 'enable_base_weight', type: 'boolean', label: '启用基础权重', title: 'enable_base_weight', desc: '启用基础权重（差异炼丹）', defaultValue: false },
  { key: 'base_weights', type: 'textarea', label: '基础权重路径', title: 'base_weights', desc: '合并入底模的 LoRA 路径，一行一个路径', defaultValue: '', visibleWhen: when('enable_base_weight', true) },
  { key: 'base_weights_multiplier', type: 'textarea', label: '基础权重比例', title: 'base_weights_multiplier', desc: '合并入底模的 LoRA 权重，一行一个数字', defaultValue: '', visibleWhen: when('enable_base_weight', true) },
  { key: 'network_args_custom', type: 'textarea', label: '自定义 network_args', title: 'network_args_custom', desc: '自定义 network_args，每行一个参数。Anima 概念编辑会直接附加到后端 payload。', defaultValue: '' },
];

const animaConceptEditTrainingFields = (defaults = {}) => [
  { key: 'resolution', type: 'string', label: '训练分辨率', title: 'resolution', desc: 'Anima 概念编辑首版先按固定分辨率处理，建议保持 1024,1024 起步。', defaultValue: defaults.resolution || '1024,1024' },
  { key: 'max_train_steps', type: 'number', label: '最大训练步数', title: 'max_train_steps', desc: 'Anima 概念编辑首版优先按 step 控制训练长度。iLECO 常见 300~1000；ADDifT 常见 30~150。', defaultValue: defaults.maxTrainSteps || 500, min: 1 },
  { key: 'train_batch_size', type: 'slider', label: '批量大小', title: 'train_batch_size', desc: '概念编辑建议从小 batch 开始。ADDifT / Multi-ADDifT 一般推荐 1~2。', defaultValue: defaults.batchSize || 1, min: 1, max: 8, step: 1 },
  ditGradientCheckpointingField('Anima'),
  { key: 'gradient_accumulation_steps', type: 'number', label: '梯度累加步数', title: 'gradient_accumulation_steps', desc: '梯度累加步数', defaultValue: 1, min: 1 },
  { key: 'network_train_unet_only', type: 'boolean', label: '仅训练 DiT', title: 'network_train_unet_only', desc: 'Anima 概念编辑当前只支持 DiT-only 路线。保持开启即可。', defaultValue: true },
  { key: 'network_train_text_encoder_only', type: 'boolean', label: '仅训练文本编码器', title: 'network_train_text_encoder_only', desc: 'Anima 概念编辑当前不支持单独训练文本编码器。请保持关闭。', defaultValue: false },
  { key: 'min_timestep', type: 'number', label: '最小时间步', title: 'min_timestep', desc: '动作/配件类差分常见 500；风格类常见 200。', defaultValue: defaults.minTimestep ?? '', min: 0 },
  { key: 'max_timestep', type: 'number', label: '最大时间步', title: 'max_timestep', desc: '动作/配件类差分常见 1000；风格类常见 400。', defaultValue: defaults.maxTimestep ?? '', min: 1 },
  { key: 'concept_edit_fixed_timestep_per_batch', type: 'boolean', label: '批内固定时间步', title: 'concept_edit_fixed_timestep_per_batch', desc: '同一 batch 内共享同一个 timestep，适合概念编辑实验时减小批内波动。', defaultValue: false },
  { key: 'concept_edit_diff_alt_ratio', type: 'number', label: '差分交替倍率', title: 'concept_edit_diff_alt_ratio', desc: 'ADDifT 交替差分倍率。保持 1 最稳；更激进的实验可调成负值，但不建议默认这么做。', defaultValue: 1, step: 0.1, visibleWhen: (c) => ['addift', 'multi-addift'].includes(String(c.concept_edit_mode || '').toLowerCase()) },
  { key: 'concept_edit_use_diff_mask', type: 'boolean', label: '启用差分掩码', title: 'concept_edit_use_diff_mask', desc: 'ADDifT / Multi-ADDifT 可按原图/目标图像素差自动生成 mask，减少无关区域干扰。', defaultValue: false, visibleWhen: (c) => ['addift', 'multi-addift'].includes(String(c.concept_edit_mode || '').toLowerCase()) },
];

const animaConceptEditSections = ({ typeId, mode, maxTrainSteps, minTimestep = '', maxTimestep = '' }) => [
  sec('model-settings', 'model', '训练用模型', 'Anima 概念编辑底模、Qwen3/T5 组件与恢复训练。', animaConceptEditModelFields(typeId)),
  sec('anima-params', 'model', 'Anima 专用参数', 'Anima 概念编辑会沿用自身的 flow/noise/prompt 编码链路。', [
    ...flowParams({ ts: 'shift', dfs: 3.0, tsExtra: ['logit_normal'] }),
    { key: 'qwen3_max_token_length', type: 'number', label: 'Qwen3 最大 token', title: 'qwen3_max_token_length', desc: 'Qwen3 最大 token 长度', defaultValue: 512, min: 1 },
    { key: 't5_max_token_length', type: 'number', label: 'T5 最大 token', title: 't5_max_token_length', desc: 'T5 最大 token 长度', defaultValue: 512, min: 1 },
    { key: 'attn_mode', type: 'select', label: 'Attention 实现', title: 'attn_mode', desc: '留空时按当前运行时自动选择；不可用的后端会保留显示但禁用。', defaultValue: '', attentionBackendOptions: true, options: [
      { value: '', label: '自动（按当前运行时解析）' },
      { value: 'torch', label: 'Torch' },
      { value: 'sdpa', label: 'SDPA' },
      { value: 'xformers', label: 'xFormers' },
      { value: 'sageattn', label: 'SageAttention' },
      { value: 'flash', label: 'FlashAttention 2' },
    ] },
    { key: 'split_attn', type: 'boolean', label: '拆分 attention', title: 'split_attn', desc: '拆分 attention 以节省显存。显存充足、能正常跑时一般建议关闭。', defaultValue: false },
    { key: 'vae_chunk_size', type: 'number', label: 'VAE 分块大小', title: 'vae_chunk_size', desc: 'VAE 编码/解码分块大小（需为偶数）', defaultValue: '', min: 2 },
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

// ---- Anima LoRA ----
// Anima LoRA 推荐 AdamW：optimizer_backend=auto 会解析为单内核 fused 发射，消除
// bnb AdamW8bit 逐参数微内核在优化器阶段造成的 GPU 空泡（参考实测步时约降 25%）。
// 仅覆盖 anima-lora 的默认值与文案，公共 S_LR_TARGET（sdxl 等共享）保持不变。
const S_LR_ANIMA_LORA = S_LR_TARGET.map((field) => field.key === 'optimizer_type'
  ? { ...field, defaultValue: 'AdamW', desc: `${field.desc}。Anima LoRA 推荐 AdamW：auto 后端会走单内核 fused 发射，比 AdamW8bit 减少约 25% 步时；需要 8-bit 省显存时可改回 AdamW8bit，或把 AdamW 后端切到 torchao 8-bit` }
  : field);

export const ANIMA_LORA_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'Anima 模型路径。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'anima-lora' },
    { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'Anima DiT 权重路径', title: 'pretrained_model_name_or_path', desc: '底模文件路径', defaultValue: './sd-models/model.safetensors' },
    { key: 'vae', type: 'file', pickerType: 'model-file', label: 'Qwen Image VAE 路径', title: 'vae', desc: '(可选) VAE 模型文件路径，使用外置 VAE 文件覆盖模型内本身的', defaultValue: '' },
    { key: 'qwen3', type: 'file', pickerType: 'model-file', label: 'Qwen3 文本模型路径', title: 'qwen3', desc: 'Qwen3 文本模型路径', defaultValue: '' },
    { key: 'llm_adapter_path', type: 'file', pickerType: 'model-file', label: 'LLM Adapter 路径', title: 'llm_adapter_path', desc: 'LLM Adapter 路径', defaultValue: '' },
    { key: 'network_weights', type: 'file', pickerType: 'output-model-file', label: '继续训练 LoRA', title: 'network_weights', desc: '从已有的 LoRA 模型上继续训练，填写路径', defaultValue: '' },
    { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径', title: 'resume', desc: '从某个 save_state 保存的中断状态继续训练，填写文件路径', defaultValue: '' },
  ]),
  sec('anima-params', 'model', 'Anima 专用参数', '', [
    ...flowParams({ ts: 'shift', dfs: 3.0, tsExtra: ['logit_normal'] }),
    { key: 'qwen3_max_token_length', type: 'number', label: 'Qwen3 最大 token', title: 'qwen3_max_token_length', desc: 'Qwen3 最大 token 长度', defaultValue: 512, min: 1 },
    { key: 'mode_scale', type: 'number', label: 'mode 权重缩放', title: 'mode_scale', desc: 'mode 权重策略的缩放系数', defaultValue: '', step: 0.01 },
    { key: 'flow_uncertainty_weighting_enabled', type: 'boolean', label: 'EDM2 自适应损失权重', title: 'flow_uncertainty_weighting_enabled', desc: '实验功能：学习一个按 sigma 的不确定度 u(σ)，损失变为 loss/exp(u)+u（EDM2）。自动下调高噪声区权重，无需手挑 weighting_scheme。默认关闭=与原损失逐位一致。', defaultValue: false },
    { key: 'flow_uncertainty_weighting_lr', type: 'number', label: 'EDM2 学习率', title: 'flow_uncertainty_weighting_lr', desc: 'EDM2 不确定度参数的学习率。推荐 1e-2，使用单独的无衰减参数组。', defaultValue: 0.01, min: 0, max: 1, step: 0.001, visibleWhen: (c) => c.flow_uncertainty_weighting_enabled },
    { key: 'flow_uncertainty_weighting_channels', type: 'number', label: 'EDM2 通道数', title: 'flow_uncertainty_weighting_channels', desc: 'EDM2 Fourier 特征库大小。更大值表达能力更强，但参数更多。推荐 128。', defaultValue: 128, min: 32, max: 512, step: 32, visibleWhen: (c) => c.flow_uncertainty_weighting_enabled },
    { key: 'anima_guidance_scale', type: 'number', label: 'CFG 引导强度', title: 'anima_guidance_scale', desc: 'Classifier-Free Guidance 强度。1.0 = 无引导；>1.0 增强文本对齐；推荐 1.0-3.0。', defaultValue: 1.0, min: 1, max: 10, step: 0.1 },
    { key: 't5_max_token_length', type: 'number', label: 'T5 最大 token', title: 't5_max_token_length', desc: 'T5 最大 token 长度', defaultValue: 512, min: 1 },
    { key: 'split_attn', type: 'boolean', label: '拆分 attention', title: 'split_attn', desc: '拆分 attention 以节省显存', defaultValue: false },
    { key: 'vae_chunk_size', type: 'number', label: 'VAE 分块大小', title: 'vae_chunk_size', desc: 'VAE 解码时的分块大小，更小值更省显存', defaultValue: '', min: 2 },
  ]),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('1024,1024', 2048, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', S_CAPTION.filter((f) => f.key !== 'max_token_length')),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('network-settings', 'network', '网络设置', 'LoRA / T-LoRA / LoKr 模式。', [
    { key: 'lora_type', type: 'select', label: '适配器类型', title: 'lora_type', desc: 'LoRA 是基础路线；DoRA / LoRA+ / rsLoRA / PiSSA 走原生 LoRA 扩展；LoRA-FA / VeRA / T-LoRA / FlexRank / HydraLoRA / FeRA / LyCORIS 会映射到对应后端路径。', defaultValue: 'lora', options: NATIVE_ADAPTER_TYPES },
    { key: 'network_dim', type: 'slider', label: '网络维度', title: 'network_dim', desc: '网络维度，常用 4~128，不是越大越好, 低 dim 可以降低显存占用', defaultValue: 16, min: 1, max: 256, step: 1 },
    { key: 'network_alpha', type: 'slider', label: '网络 Alpha', title: 'network_alpha', desc: '常用值：等于 network_dim 或 network_dim*1/2 或 1', defaultValue: 16, min: 1, max: 256, step: 1 },
    { key: 'dim_from_weights', type: 'boolean', label: '从权重推断 Dim', title: 'dim_from_weights', desc: '从已有 network_weights 自动推断 rank / dim', defaultValue: false },
    { key: 'scale_weight_norms', type: 'number', label: '最大范数正则化', title: 'scale_weight_norms', desc: '最大范数正则化。如果使用，推荐为 1', defaultValue: '', min: 0, step: 0.01 },
    { key: 'train_norm', type: 'boolean', label: '训练 Norm 层', title: 'train_norm', desc: '额外训练带可学习参数的归一化层（如 RMSNorm/LayerNorm 的 weight/bias），让 LoRA/T-LoRA/LoKr 之外还能调整特征尺度与分布；可能提升风格/域适配，但会小幅增加显存占用和 LoRA 文件大小，也更容易过拟合，默认建议关闭。', defaultValue: false },
    { key: 'anima_train_llm_adapter', type: 'boolean', label: '训练 LLM Adapter', title: 'anima_train_llm_adapter', desc: '普通 Anima LoRA 默认关闭，更接近低显存参考路径；开启后会把 LLM Adapter 纳入 LoRA 训练目标，增加显存和计算量。', defaultValue: false },
    { key: 'dora_wd', type: 'boolean', label: '启用 DoRA', title: 'dora_wd', desc: '仅在 Anima 原生 LoRA 路线下生效。DoRA 会把权重分成方向与幅度两部分来训练，通常比普通 LoRA 更接近全量微调表现。', defaultValue: false, visibleWhen: when('lora_type', 'lora') },
    { key: 'bypass_mode', type: 'boolean', label: 'Bypass Mode', title: 'bypass_mode', desc: '仅保留兼容字段。当前 Anima DoRA 开启时会自动强制关闭；普通 Anima LoRA 默认也建议关闭。', defaultValue: false, visibleWhen: (c) => c.lora_type === 'lora' && !c.dora_wd },
    { key: 'adapter_init_strategy', type: 'select', label: 'LoRA 初始化策略', title: 'adapter_init_strategy', desc: '统一初始化入口：默认 LoRA / PiSSA / OLoRA。仅原生 LoRA 且未启用 DoRA 时生效。', defaultValue: 'default', options: ADAPTER_INIT_STRATEGY_OPTIONS, visibleWhen: (c) => c.lora_type === 'lora' && !c.dora_wd },
    { key: 'adapter_init_export_mode', type: 'select', label: '初始化导出模式', title: 'adapter_init_export_mode', desc: 'auto 会在最终保存时导出成可加载到原始底模的 LoRA；raw 保留精确训练状态用于恢复。', defaultValue: 'auto', options: ADAPTER_INIT_EXPORT_MODE_OPTIONS, visibleWhen: (c) => c.lora_type === 'lora' && nativeLoraInitSelected(c) },
    { key: 'loftq_bits', type: 'number', label: 'LoftQ 量化位宽', title: 'loftq_bits', desc: 'LoftQ 首版使用 fake-quant/dequant 权重残差初始化；不是持久 4bit base runtime。', defaultValue: 4, min: 2, max: 8, step: 1, visibleWhen: all(when('lora_type', 'lora'), loftqInitSelected) },
    { key: 'loftq_quant_type', type: 'select', label: 'LoftQ 量化粒度', title: 'loftq_quant_type', desc: 'rowwise 按输出通道量化，tensorwise 按整层张量量化。', defaultValue: 'rowwise', options: LOFTQ_QUANT_TYPE_OPTIONS, visibleWhen: all(when('lora_type', 'lora'), loftqInitSelected) },
    { key: 'lokr_factor', type: 'number', label: 'LoKr 系数', title: 'lokr_factor', desc: 'LoKr 系数，常用 4~无穷（-1 为无穷）', defaultValue: 8, min: -1, visibleWhen: when('lora_type', 'lokr') },
    { key: 'network_dropout', type: 'number', label: 'Dropout', desc: 'Dropout 概率', defaultValue: 0, min: 0, step: 0.01, visibleWhen: (c) => ['lora', 'dora', 'lora_plus', 'rs_lora', 'lora_fa', 'vera', 'tlora', 'flexrank', 'hydralora', 'fera', ...LYCORIS_DELTA_ALGOS].includes(c.lora_type) },
    { key: 'flexrank_lora_rank_range_min', type: 'number', label: 'FlexRank 最小 Rank', title: 'flexrank_lora_rank_range_min', desc: 'FlexRank 每步随机采样激活 rank 的下界；最大 rank 仍使用 network_dim。', defaultValue: 1, min: 1, visibleWhen: when('lora_type', 'flexrank') },
    { key: 'tlora_min_rank', type: 'number', label: 'T-LoRA 最小 Rank', title: 'tlora_min_rank', desc: 'T-LoRA 最小动态 rank', defaultValue: 1, min: 1, visibleWhen: when('lora_type', 'tlora') },
    { key: 'tlora_rank_schedule', type: 'select', label: 'T-LoRA Rank 调度', title: 'tlora_rank_schedule', desc: 'T-LoRA 动态 rank 调度策略', defaultValue: 'cosine', options: ['cosine', 'linear'], visibleWhen: when('lora_type', 'tlora') },
    { key: 'tlora_orthogonal_init', type: 'boolean', label: 'T-LoRA 正交初始化', title: 'tlora_orthogonal_init', desc: '对 lora_down 使用正交初始化（实验性）', defaultValue: false, visibleWhen: when('lora_type', 'tlora') },
    { key: 'pissa_init', type: 'boolean', label: '启用 PiSSA 初始化', title: 'pissa_init', desc: '启用 PiSSA 初始化（实验性，仅 LoRA 类型下生效）', defaultValue: false, visibleWhen: when('lora_type', 'lora') },
    { key: 'network_args_custom', type: 'textarea', label: '自定义 network_args', title: 'network_args_custom', desc: '自定义 network_args，每行一个参数。Anima 路线会直接附加到后端 payload。', defaultValue: '' },
  ]),
  sec('fg-lora-settings', 'network', 'FG-LoRA / 选择性注入', '选择性训练重要的层，减少参数量或重分配 rank。默认 all=训练所有层。', [...S_ADAPTER_TARGET_POLICY]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR_ANIMA_LORA]),
  sec('training-settings', 'training', '训练参数', '', [...ditTrainFields(S_TRAIN(10), 'Anima'), ...S_ANIMA_FAITHFUL_FORWARD]),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW, ...S_ANIMA_INFERENCE_ACCEL]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...VRAM_AUTO_ENHANCE_FIELDS, ...ANIMA_BLOCK_RESIDENCY_FIELDS, ...S_DIT_PERFORMANCE_EXPERT, ...S_SPEED_FLOW.filter((f) => !new Set([
    'cache_latents', 'cache_latents_to_disk', 'latent_cache_disk_format', 'latent_cache_disk_dtype',
    'cache_text_encoder_outputs', 'cache_text_encoder_outputs_to_disk',
    'text_encoder_outputs_cache_disk_format', 'text_encoder_outputs_cache_disk_dtype',
    'disable_mmap_load_safetensors', 'torch_compile', 'dynamo_backend',
  ]).has(f.key))]),
  sec('noise-settings', 'training', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('timestep-sampling-settings', 'training', '时间步采样策略', '控制训练时采样哪些时间步。可用于集中训练特定噪声阶段。', [...S_TIMESTEP_SAMPLING_STRATEGY]),
  sec('quality-optimization-phase1', 'frontier', '图像质量优化储备 (Phase 1+2)', '实验功能包。Phase 1: 线稿保护、DCT 频域、Gram 纹理 (针对高频纹理/网状问题)。Phase 2: 困难样本挖掘 (聚焦困难样本训练) + 多尺度 DiT 监督 (中间层自蒸馏)。全部默认关闭，需显式启用。建议先启用单个技术测试效果，再考虑组合使用。', [...S_QUALITY_OPTIMIZATION_PACK]),
  sec('lora-variants', 'network', 'LoRA 变体 (Phase2 储备)', '实验性 LoRA 结构变体。全部 default-off, 与标准 LoRA 位级 parity。详见后端各模块文档。', [...S_LORA_VARIANTS], { expert: true }),
  sec('perceptual-anchor-loss', 'frontier', '感知锚/频域纹理损失', 'Lulynx 感知储备:latent 频域纹理 + 感知锚, 参与 loss-splitting 交替。default-off。', [...S_PERCEPTUAL_ANCHOR_LOSS]),
  sec('sampling-optimization-reserve', 'optimizer', '采样与优化储备', 'ANT 自适应采样 / BP-low / AnyFlow 蒸馏 / DOP / Coreset / 自适应加权。全部 default-off。', [...S_SAMPLING_OPTIMIZATION_RESERVE], { expert: true }),
  sec('repa-jlt-reserve', 'frontier', 'REPA/JLT 表征对齐', 'SoftREPA + JLT EMA 特征自蒸馏。default-off。', [...S_REPA_RESERVE, ...S_ANIMA_JLT_EMA]),
  sec('experimental-probes', 'frontier', '实验探测', '高度实验性探针/诊断开关。default-off, 不建议生产用。', [...S_EXPERIMENTAL_PROBES]),
  sec('diagnostics-monitoring', 'frontier', '诊断与监控', '高级监控/统计/深度诊断/逐层监测/profiling。default-off。', [...S_DIAGNOSTICS_MONITORING]),
  sec('autocontroller-settings', 'optimizer', 'AutoController (自动控制器)', '高级功能。根据训练状态自动调整学习率、早停、TE 冻结等。适合长时间无人值守训练。默认关闭。', [...S_AUTO_CONTROLLER], { expert: true }),
  sec('lulynx-settings', 'frontier', 'Lulynx 实验核心 (Anima)', 'SafeGuard、EMA、ResourceManager、SmartRank、AutoController。', S_LULYNX_SDXL.filter((f) => !new Set([
    'lulynx_ema_enabled', 'lulynx_ema_decay',
    'lulynx_safeguard_enabled', 'lulynx_safeguard_nan_check_interval', 'lulynx_safeguard_gradient_scan_mode',
    'lulynx_safeguard_max_nan_count', 'lulynx_safeguard_loss_spike_threshold',
    'lulynx_safeguard_loss_window_size', 'lulynx_safeguard_auto_reduce_lr', 'lulynx_safeguard_lr_reduction_factor',
    'lulynx_auto_controller_enabled', 'lulynx_auto_check_every', 'lulynx_auto_early_stop_patience',
  ]).has(f.key))),
  sec('turbocore-settings', 'speed', 'TurboCore 内核优化', 'CUDA/Triton 内核自动调优与加速。默认自动启用，调优结果缓存复用。高级用户可调整工作空间、预取深度或禁用特定优化。', [...S_TURBOCORE], { expert: true }),
  sec('cache-system-settings', 'speed', '缓存系统', '训练缓存配置：latent/文本编码器输出的磁盘格式、精度与存储位置。', [...S_CACHE_SYSTEM]),
  sec('anima-advanced-settings', 'model', 'Anima 高级配置', 'Anima 分组学习率、LoRA 目标模块与其他高级选项。仅在需要精细控制时调整。', [...S_ANIMA_ADVANCED], { expert: true }),
  sec('training-misc-settings', 'training', '其他训练选项', '随机种子、蒙版损失、训练备注与断点续训偏移。', [
    { key: 'goal_forecast_tool', type: 'action', label: '训练达标预测（Copilot 只读预测器）', desc: '读取已训练 run 的 loss / 验证 loss / L2 时序，做饱和幂律趋势外推，判定收敛/发散并预测达到目标阈值所需步数，回答"按当前趋势能否在总步数内达标"。纯只读建议，不改动训练参数、不进入训练主链。', buttonLabel: ' 打开达标预测', handler: 'openGoalForecastTool' },
    { key: 'copilot_tool', type: 'action', label: '自动训练 Copilot（全自动闭环编排）', desc: '一次授权无人值守：设定目标阈值（loss / 验证 loss / L2）+ 预算护栏 + 超参搜索空间，Copilot 自动发射训练试验、用只读预测器评估趋势、爬山调参（带回退护栏：变差则回滚到历史最优再换方向），直到达标即停或预算触顶兜底停。每个试验走既有训练队列通道，不新增训练入口。', buttonLabel: ' 自动训练 Copilot', handler: 'openCopilotTool' },
    { key: 'seed', type: 'number', label: '随机种子', title: 'seed', desc: '随机种子', defaultValue: 1337 },
    { key: 'clip_skip', type: 'slider', label: 'CLIP 跳层', title: 'clip_skip', desc: 'CLIP 跳过层数 *玄学*（默认值 2 不会发送给后端，等同于不设置）', defaultValue: 2, min: 0, max: 12, step: 1 },
    { key: 'masked_loss', type: 'boolean', label: '启用蒙版损失', title: 'masked_loss', desc: '启用 Masked Loss。训练带透明蒙版 / alpha 的图像时可用', defaultValue: false },
    { key: 'alpha_mask', type: 'boolean', label: '读取 Alpha 通道作为 Mask', title: 'alpha_mask', desc: '读取训练图像的 alpha 通道作为 loss mask', defaultValue: false },
    { key: 'training_comment', type: 'textarea', label: '训练备注', title: 'training_comment', desc: '写入模型元数据的训练备注', defaultValue: '' },
    { key: 'no_metadata', type: 'boolean', label: '不写入元数据', title: 'no_metadata', desc: '不向输出模型写入完整训练元数据', defaultValue: false },
    { key: 'initial_epoch', type: 'number', label: '起始 epoch', title: 'initial_epoch', desc: '从指定 epoch 编号开始计数', defaultValue: '', min: 1 },
    { key: 'initial_step', type: 'number', label: '起始 step', title: 'initial_step', desc: '从指定 step 编号开始计数，会覆盖 initial_epoch', defaultValue: '', min: 0 },
    { key: 'skip_until_initial_step', type: 'boolean', label: '跳过前面步数', title: 'skip_until_initial_step', desc: '配合 initial_step 使用，真正跳过前面的训练步数', defaultValue: false },
  ]),
  sec('ema-settings', 'optimizer', 'EMA（指数滑动平均）', 'EMA 副本与更新策略。启用后保存时额外写出 EMA 权重。', [
    { key: 'ema_enabled', type: 'boolean', label: '启用 EMA', title: 'ema_enabled', desc: '启用 EMA（指数滑动平均）。会额外复制一份参数，保存时写出 EMA 权重', defaultValue: false },
    { key: 'ema_decay', type: 'number', label: 'EMA 衰减率', title: 'ema_decay', desc: 'EMA 衰减率。越接近 1 越平滑', defaultValue: 0.999, min: 0, max: 0.99999, step: 0.0001, visibleWhen: (c) => c.ema_enabled },
    { key: 'ema_update_every', type: 'number', label: 'EMA 更新间隔', title: 'ema_update_every', desc: '每 N 个优化 step 更新一次 EMA', defaultValue: 1, min: 1, visibleWhen: (c) => c.ema_enabled },
    { key: 'ema_update_after_step', type: 'number', label: 'EMA 起始步', title: 'ema_update_after_step', desc: '从第几个优化 step 开始更新 EMA', defaultValue: 0, min: 0, visibleWhen: (c) => c.ema_enabled },
  ]),
  sec('safeguard-wavelet-settings', 'frontier', 'SafeGuard + Wavelet Loss', 'NaN/Spike 拦截与多尺度 wavelet 损失。全部 default-off。', [
    { key: 'safeguard_enabled', type: 'boolean', label: '启用 SafeGuard', title: 'safeguard_enabled', desc: '拦截 NaN/Inf loss 与异常 loss spike', defaultValue: false },
    { key: 'safeguard_nan_check_interval', type: 'number', label: 'NaN 检查间隔', title: 'safeguard_nan_check_interval', desc: '每 N 个优化 step 检查一次 NaN / Inf loss', defaultValue: 1, min: 1, visibleWhen: (c) => c.safeguard_enabled },
    { key: 'safeguard_max_nan_count', type: 'number', label: '最大 NaN 次数', title: 'safeguard_max_nan_count', desc: '连续触发多少次 NaN 后停止训练', defaultValue: 3, min: 1, visibleWhen: (c) => c.safeguard_enabled },
    { key: 'safeguard_loss_spike_threshold', type: 'number', label: 'Loss Spike 阈值', title: 'safeguard_loss_spike_threshold', desc: '当前 loss 超过滚动平均值多少倍时，判定为 spike 并跳过该 step', defaultValue: 5.0, min: 1, step: 0.1, visibleWhen: (c) => c.safeguard_enabled },
    { key: 'safeguard_loss_window_size', type: 'number', label: 'Loss 窗口大小', title: 'safeguard_loss_window_size', desc: '用于判定 loss spike 的滚动窗口大小', defaultValue: 20, min: 2, visibleWhen: (c) => c.safeguard_enabled },
    { key: 'safeguard_auto_reduce_lr', type: 'boolean', label: '自动降低学习率', title: 'safeguard_auto_reduce_lr', desc: 'SafeGuard 触发时自动降低学习率', defaultValue: false, visibleWhen: (c) => c.safeguard_enabled },
    { key: 'safeguard_lr_reduction_factor', type: 'number', label: '降学习率倍率', title: 'safeguard_lr_reduction_factor', desc: '自动降低学习率时使用的倍率', defaultValue: 0.5, min: 0.01, max: 1, step: 0.01, visibleWhen: (c) => c.safeguard_enabled && c.safeguard_auto_reduce_lr },
    { key: 'wavelet_loss_enabled', type: 'boolean', label: '启用 Wavelet Loss', title: 'wavelet_loss_enabled', desc: '实验性：在像素空间损失之外叠加多尺度 wavelet 细节损失。默认关闭，不影响旧配置', defaultValue: false },
    { key: 'wavelet_loss_weight', type: 'number', label: 'Wavelet Loss 权重', title: 'wavelet_loss_weight', desc: '建议从很小的值开始，例如 0.02 ~ 0.1', defaultValue: 0.05, min: 0, step: 0.01, visibleWhen: (c) => c.wavelet_loss_enabled },
    { key: 'wavelet_loss_levels', type: 'number', label: 'Wavelet 层数', title: 'wavelet_loss_levels', desc: '多尺度分解层数。层数越高越偏向大结构约束', defaultValue: 1, min: 1, max: 4, step: 1, visibleWhen: (c) => c.wavelet_loss_enabled },
    { key: 'wavelet_loss_approx_weight', type: 'number', label: 'Wavelet 低频权重', title: 'wavelet_loss_approx_weight', desc: '是否额外约束最后一层低频 LL 分量。通常保持 0 即可', defaultValue: 0, min: 0, step: 0.01, visibleWhen: (c) => c.wavelet_loss_enabled },
  ]),
  sec('system-settings', 'advanced', '系统设置', '指定 GPU 与自定义 TOML 覆盖。', [
    { key: 'gpu_ids', type: 'string', label: '指定显卡', title: 'gpu_ids', desc: '指定参与训练的 GPU 编号，多卡用逗号分隔（如 0,1）。留空使用默认主显卡。可在启动日志中查看可用 GPU 编号', defaultValue: '' },
    { key: 'ui_custom_params', type: 'textarea', label: '自定义 TOML 覆盖', title: 'ui_custom_params', desc: '危险：会直接覆盖界面中的参数。', defaultValue: '' },
  ]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];

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

// ---- Anima Finetune ----
export const ANIMA_FT_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'Anima 全参微调。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'anima-finetune' },
    { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'Anima DiT 路径', title: 'pretrained_model_name_or_path', desc: 'Anima DiT 路径', defaultValue: './sd-models/model.safetensors' },
    { key: 'vae', type: 'file', pickerType: 'model-file', label: 'Qwen Image VAE 路径', title: 'vae', desc: 'Qwen Image VAE 路径', defaultValue: '' },
    { key: 'qwen3', type: 'file', pickerType: 'model-file', label: 'Qwen3 文本模型路径', title: 'qwen3', desc: 'Qwen3 文本模型路径', defaultValue: '' },
    { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径', title: 'resume', desc: '继续训练路径', defaultValue: '' },
  ]),
  sec('anima-params', 'model', 'Anima 专用参数', '', [
    ...flowParams({ ts: 'shift', dfs: 3.0, tsExtra: ['logit_normal'] }),
    { key: 'qwen3_max_token_length', type: 'number', label: 'Qwen3 最大 token', title: 'qwen3_max_token_length', desc: 'Qwen3 最大 token', defaultValue: 512, min: 1 },
    { key: 'mode_scale', type: 'number', label: 'mode 权重缩放', title: 'mode_scale', desc: 'mode 权重策略的缩放系数', defaultValue: '', step: 0.01 },
    { key: 'flow_uncertainty_weighting_enabled', type: 'boolean', label: 'EDM2 自适应损失权重', title: 'flow_uncertainty_weighting_enabled', desc: '实验功能：学习一个按 sigma 的不确定度 u(σ)，损失变为 loss/exp(u)+u（EDM2）。自动下调高噪声区权重，无需手挑 weighting_scheme。默认关闭=与原损失逐位一致。', defaultValue: false },
    { key: 't5_max_token_length', type: 'number', label: 'T5 最大 token', title: 't5_max_token_length', desc: 'T5 最大 token', defaultValue: 512, min: 1 },
    { key: 'split_attn', type: 'boolean', label: '拆分 attention', title: 'split_attn', desc: '拆分 attention', defaultValue: false },
  ]),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('1024,1024', 2048, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', S_CAPTION.filter((f) => f.key !== 'max_token_length')),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR_FT]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(10)),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_FLOW]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];
