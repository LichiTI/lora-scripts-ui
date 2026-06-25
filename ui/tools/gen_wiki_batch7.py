"""
批次7: 用单一文件 + aliases 批量覆盖剩余 lulynx_* / sample / VAE / GPU / misc 族
"""
import json, os

ENTRIES_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'training-wiki', 'entries')

def write(name, data):
    path = os.path.join(ENTRIES_DIR, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'  wrote {name}')

# ── lulynx_* 剩余(SDXL 路线的 lulynx 变体 + 资源管理) ────────────────────────

write('lulynx_block_weight_enabled.json', {
  'key': 'lulynx_block_weight_enabled',
  'title': 'Lulynx Block 权重（SDXL）',
  'category': '训练 / Block 权重',
  'appliesTo': ['sdxl-lora'],
  'aliases': ['lulynx_down_lr_weight', 'lulynx_mid_lr_weight', 'lulynx_up_lr_weight',
              'lulynx_block_lr_zero_threshold', 'lulynx_smart_rank_enabled', 'lulynx_smart_rank_keep_ratio'],
  'standard': {
    'summary': 'SDXL 路线的 Block 级学习率差异化设置：分别对 UNet 的 down blocks / mid block / up blocks 设置独立的学习率权重，实现细粒度控制。',
    'effect': 'down_lr_weight 控制编码器（下采样）块的 LR 倍率；mid_lr_weight 控制瓶颈块；up_lr_weight 控制解码器（上采样）块。',
    'whenToUse': 'SDXL LoRA 时需要对不同层级差异化训练时使用。例如只训练解码器（up）可实现更精细的局部特征学习。',
    'avoidWhen': '不了解 UNet 各层功能时保持默认（所有层等权），差异化设置需要对模型行为有深入理解。'
  },
  'advanced': {
    'principle': 'SDXL UNet 分三段：input_blocks（down，下采样，捕捉低级特征）/ middle_block（mid，瓶颈，高级语义）/ output_blocks（up，上采样，精细化和重建）。差异化 LR 权重等价于更粗粒度的 block weight 控制。smart_rank 根据各层梯度自动调整参与训练的 rank 数量。',
    'tradeoffs': 'up_lr 过高 → 解码器训练过度，结果可能失去整体一致性；down_lr 过高 → 特征提取过度，可能影响其他 LoRA 兼容性。'
  },
  'relatedConfigs': ['block_weight_preset', 'learning_rate', 'block_lr_zero_threshold']
})

write('lulynx_precision_swap_enabled.json', {
  'key': 'lulynx_precision_swap_enabled',
  'title': '精度自动切换',
  'category': '速度 / 显存',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['lulynx_precision_swap_strategy', 'lulynx_weight_residency',
              'lulynx_weight_residency_min_params', 'lulynx_resource_manager_enabled',
              'lulynx_resource_log_interval'],
  'standard': {
    'summary': '动态精度管理：在训练过程中自动切换权重精度（bf16/fp32），非激活状态的权重以低精度存储节省 VRAM，激活时升精度计算。',
    'effect': 'lulynx_weight_residency 控制常驻 GPU 的权重类型（哪些权重始终保持 GPU 高精度版本）；resource_manager 追踪 VRAM 使用并动态决定精度切换时机。',
    'whenToUse': '大模型（>20GB 基座）在有限显存上训练时的精度管理工具。实验性功能。',
    'avoidWhen': '显存充足时无需精度动态切换，会增加精度转换开销。'
  },
  'advanced': {
    'principle': '权重驻留策略（weight_residency）：LoRA 权重始终高精度（fp32/bf16）驻留 GPU；大基座权重在不激活时降为 fp16/int8 等待卸载，前向时提升为 bf16。resource_log_interval 控制 VRAM 使用日志记录频率。',
    'tradeoffs': '频繁精度转换会增加 CPU-GPU 数据传输量，对 PCIe 带宽有要求；精度切换过激可能引入累积数值误差。'
  },
  'relatedConfigs': ['mixed_precision', 'anima_block_prefetch', 'peak_vram_control_enabled']
})

write('lulynx_freq_texture_enabled.json', {
  'key': 'lulynx_freq_texture_enabled',
  'title': 'Lulynx 频域纹理锚点',
  'category': '前沿储备 / 质量',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['lulynx_freq_texture_weight', 'lulynx_latent_anchor_enabled', 'lulynx_latent_anchor_weight'],
  'standard': {
    'summary': '（实验性）Lulynx 质量感知辅助 loss 族：频域纹理锚点（freq_texture）通过频域 Gram 矩阵约束纹理风格；Latent 锚点（latent_anchor）通过 EMA latent 参考约束生成稳定性。',
    'effect': 'freq_texture 有助于保持训练数据的特征纹理风格；latent_anchor 防止生成结果偏离 EMA 稳定版本过远（类似 EMA 蒸馏的 latent 版本）。',
    'whenToUse': '实验性功能，适合研究探索。对特定纹理风格 LoRA 有潜在收益。',
    'avoidWhen': '默认关闭。增加的辅助 loss 会改变训练动力学，不确定效果时不要开启。'
  },
  'advanced': {
    'principle': 'freq_texture = 对特征图做 DCT + Gram 矩阵，计算频域风格距离；latent_anchor = EMA latent vs 当前 latent 的 L2 距离，权重 latent_anchor_weight 控制约束强度。',
    'tradeoffs': '两种 loss 的权重需要仔细调整，过大会主导训练目标；过小则效果不明显。建议通过实验对比确定合适权重。'
  },
  'relatedConfigs': ['perceptual_anchor_loss_enabled', 'anima_ema_feat_align_enabled']
})

write('lulynx_safeguard_gradient_scan_mode.json', {
  'key': 'lulynx_safeguard_gradient_scan_mode',
  'title': 'SafeGuard 梯度扫描模式',
  'category': '训练 / 稳定性',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'standard': {
    'summary': '控制 SafeGuard 梯度异常扫描的 CUDA 同步策略：batched（批量检查，最少同步）/ foreach（遍历检查）/ legacy（逐参数，最多同步）/ off（关闭梯度扫描）。',
    'effect': 'batched 模式 CUDA 同步次数最少（约 1~2 次/步），overhead 最低；legacy 每参数一次同步，老显卡兼容性最好；off 完全跳过梯度范数检查。',
    'whenToUse': '默认 batched 适合现代显卡（Ampere+）。老显卡（Maxwell/Pascal）遇到 batched 报错时改为 legacy。',
    'avoidWhen': '不建议 off（关闭后梯度爆炸检测失效）。'
  },
  'advanced': {
    'principle': 'batched = 将所有参数梯度 concat 后一次性检查 NaN/Inf（一次 CUDA 同步）；foreach = 使用 torch._foreach_* 向量化遍历（约 2~3 次同步）；legacy = for 循环逐参数检查（参数量次同步）。',
    'tradeoffs': 'batched 需要暂时将所有梯度 concat（额外显存峰值）；legacy 同步多但不需要额外内存。'
  },
  'relatedConfigs': ['safeguard_enabled', 'safeguard_nan_check_interval']
})

# ── SDXL Low VRAM 专用 ───────────────────────────────────────────────────────

write('sdxl_low_vram_optimization.json', {
  'key': 'sdxl_low_vram_optimization',
  'title': 'SDXL 低显存优化套件',
  'category': '速度 / 显存',
  'appliesTo': ['sdxl-lora'],
  'aliases': ['sdxl_low_vram_auto_protection', 'sdxl_low_vram_auto_resolution_probe',
              'sdxl_low_vram_bucket_reso_steps', 'sdxl_low_vram_component_cpu_residency',
              'sdxl_low_vram_fixed_block_swap', 'sdxl_low_vram_preview_policy',
              'sdxl_low_vram_resolution_mode', 'sdxl_low_vram_two_phase_cache',
              'sdxl_low_vram_swap_input_blocks', 'sdxl_low_vram_swap_middle_block',
              'sdxl_low_vram_swap_output_blocks', 'sdxl_low_vram_swap_offload_after_backward',
              'sdxl_low_vram_swap_vram_threshold', 'sdxl_block_swap_vram_threshold',
              'sdxl_unet_backend'],
  'standard': {
    'summary': 'SDXL 专用低显存优化套件，整合 block swap、分辨率自适应、两阶段缓存等多种显存节省策略，让 8GB 显卡能够训练 SDXL LoRA。',
    'effect': '一键启用多种低显存策略组合：自动分辨率下探（防止 OOM）、智能 block swap、两阶段缓存（先缓存文本 embedding，再缓存 latent）、CPU 组件驻留等。',
    'whenToUse': '8~12GB 显卡训练 SDXL 时的综合优化套件。比手动逐一配置各个显存选项更方便。',
    'avoidWhen': '16GB+ 显卡无需使用（会降低训练速度）。单独需要某项优化时可以只开启对应的具体选项。'
  },
  'advanced': {
    'principle': '套件按优先级自动组合策略：auto_resolution_probe 先探测在当前显存下可用的最大分辨率；two_phase_cache 优先缓存文本（轻量），再缓存 latent（重量）；fixed_block_swap 固定 offload 特定 block，不动态调整；unet_backend 控制 SDXL UNet 的计算后端（影响 kernel 选择和内存布局）。',
    'tradeoffs': '组合策略的交互效果复杂，auto_protection 开启时会自动降低分辨率（可能影响训练图像比例）；建议先了解单个选项再启用套件。'
  },
  'relatedConfigs': ['sdxl_block_swap_enabled', 'gradient_checkpointing', 'xformers']
})

# ── VAE 参数 ──────────────────────────────────────────────────────────────────

write('vae.json', {
  'key': 'vae',
  'title': 'VAE 路径',
  'category': '模型 / VAE',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'aliases': ['vae_batch_size', 'vae_chunk_size', 'vae_slicing', 'vae_tiling', 'no_half_vae'],
  'standard': {
    'summary': '指定训练时使用的 VAE 模型路径。不填则使用基础模型内置的 VAE。',
    'effect': '使用独立 VAE 文件时（如 sdxl_vae.safetensors），可以获得比模型内置 VAE 更好的图像编解码质量（减少色彩偏差和细节损失）。',
    'whenToUse': 'SDXL 训练推荐使用官方发布的改进版 VAE（fp16-fix 版本），可修复原 VAE 的色彩偏差问题。',
    'avoidWhen': '使用最新的已内置改进 VAE 的基础模型时无需单独指定。'
  },
  'advanced': {
    'principle': 'VAE（Variational Autoencoder）负责将像素空间图像编码到 latent 空间（VAE encode，训练时）和将 latent 解码回图像（VAE decode，生成时）。训练时只用 encode 方向，VAE 本身不被训练（权重冻结）。',
    'intervention': 'vae_batch_size 控制 VAE 编码时的 batch（影响预缓存速度）；vae_slicing 将 VAE 编码分块处理（节省显存，略降速度）；vae_tiling 对大图 VAE 编码分区域处理（高分辨率必备）；no_half_vae 禁止 VAE 使用 fp16（某些老 VAE 在 fp16 下有数值问题）。',
    'tradeoffs': 'vae_tiling 开启后解码结果可能有轻微 tile 边界痕迹；no_half_vae 使 VAE 运行在 fp32，增加显存约 50%（通常只对 VAE 部分有影响）。'
  },
  'relatedConfigs': ['cache_latents', 'mixed_precision', 'resolution']
})

# ── GPU 温控 / 资源 ───────────────────────────────────────────────────────────

write('gpu_lock_clocks_mhz.json', {
  'key': 'gpu_lock_clocks_mhz',
  'title': 'GPU 时钟锁定',
  'category': '速度 / GPU 管理',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['gpu_ids', 'gpu_power_limit_w', 'gpu_target_temp_c'],
  'standard': {
    'summary': 'GPU 性能管理：锁定 GPU 时钟频率（防止 boost 引起不稳定）、设置功耗上限、设置温度目标（超温自动降频）。',
    'effect': 'lock_clocks_mhz = 锁定 GPU core clock，确保每步训练时间稳定（减少 benchmark 误差）；power_limit_w = 限制 GPU 最大功耗；target_temp_c = 超过目标温度时自动限制 boost clock。',
    'whenToUse': '长时间高负载训练且 GPU 温度接近限制（>80°C）时开启温度控制。benchmark 调参时锁频获得更精确的对比数据。',
    'avoidWhen': '正常训练无需锁频（会限制 boost 性能）；温度正常（<75°C）时无需温控。'
  },
  'advanced': {
    'principle': 'gpu_lock_clocks_mhz 通过 nvidia-smi --lock-gpu-clocks 实现（需要 NVIDIA 驱动权限）。power_limit_w 通过 nvidia-smi -pl 设置。temp 超限后 nvidia 驱动会自动降频（thermal throttling），target_temp_c 是在到达硬限前主动降频的软限。',
    'tradeoffs': '锁频低于 GPU 最大 boost clock 会降低峰值性能（实际训练速度下降）；但能提供更一致的每步时间，对长训练的时间预估更准确。'
  },
  'relatedConfigs': ['optimizer_backend', 'peak_vram_control_enabled']
})

write('cooldown_minutes.json', {
  'key': 'cooldown_minutes',
  'title': 'GPU 温控冷却',
  'category': '速度 / GPU 管理',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['cooldown_poll_seconds', 'cooldown_until_temp_c'],
  'standard': {
    'summary': '在训练过程中，若 GPU 温度超过阈值则暂停 N 分钟等待冷却，防止持续高温损坏 GPU。',
    'effect': 'cooldown_until_temp_c = 降到此温度后才恢复训练；poll_seconds = 每隔多少秒检查一次温度；minutes = 最大等待时间（超过后强制继续）。',
    'whenToUse': 'GPU 温度经常超过 85°C 的训练环境（散热不良、超频显卡）推荐设置保护。',
    'avoidWhen': 'GPU 温度正常（<80°C）或有良好散热时无需设置，徒增训练时间。'
  },
  'advanced': {
    'principle': '通过 nvidia-smi 轮询 GPU 温度，超过阈值时调用 time.sleep 暂停训练步骤。cooldown_until_temp_c 比 cooldown_minutes 更精准（基于实际温度），两者可以一起设置（哪个条件先满足就继续）。',
    'tradeoffs': '频繁冷却暂停会显著延长总训练时间；建议先改善散热条件（清灰、增加机箱风扇）再依赖软件温控。'
  },
  'relatedConfigs': ['gpu_lock_clocks_mhz', 'gpu_target_temp_c']
})

# ── 采样预览参数 ──────────────────────────────────────────────────────────────

write('sample_sampler.json', {
  'key': 'sample_sampler',
  'title': '预览采样器',
  'category': '训练 / 预览',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'aliases': ['sample_steps', 'sample_height', 'sample_width', 'sample_seed',
              'sample_smoothcache_error_threshold'],
  'standard': {
    'summary': '控制训练过程中生成预览图使用的采样器（如 euler / euler_a / dpm++ 等）和生成参数（步数、分辨率、种子）。',
    'effect': 'euler/euler_a 速度快（适合预览）；dpm++ 质量更高（需要更多步数）。sample_steps 通常设 15~25（快速预览），不需要像推理时那么多步。',
    'whenToUse': 'euler 配合 15~20 步是最快的预览方案，足以判断 LoRA 训练方向是否正确。',
    'avoidWhen': '预览不需要使用最高质量采样器，避免浪费训练时间（生成预览会暂停训练）。'
  },
  'advanced': {
    'principle': '预览生成使用与推理相同的采样器逻辑，但步数更少。sample_smoothcache_error_threshold 控制 SmoothCache 的误差容忍度（用于加速预览生成）。sample_seed 固定后每次预览使用相同种子，方便对比不同步数的变化。',
    'tradeoffs': 'sample_width/height 应与 resolution 匹配，分辨率不匹配时预览效果可能误导（预览清晰但实际生成不同分辨率时效果可能不同）。'
  },
  'relatedConfigs': ['sample_every_n_steps', 'output_dir']
})

# ── 梯度高级控制 ──────────────────────────────────────────────────────────────

write('gradient_accumulation_mode.json', {
  'key': 'gradient_accumulation_mode',
  'title': '梯度累积模式',
  'category': '训练 / 梯度',
  'appliesTo': ['anima-lora'],
  'aliases': ['gradient_release_mode', 'gradient_guard_agc_clip_factor', 'gradient_guard_agc_eps'],
  'standard': {
    'summary': '高级梯度累积控制：mode 选择标准梯度累积（standard）还是即时梯度释放（immediate）；release_mode 控制 fused backward 中的梯度释放时机。',
    'effect': 'immediate 模式在每层 backward 完成后立即释放不再需要的梯度，减少梯度累积的峰值显存。AGC（自适应梯度裁剪）通过按层参数范数归一化裁剪，比全局 clip_grad_norm 更精细。',
    'whenToUse': '显存极度紧张时可以尝试 immediate 模式；AGC 在训练不稳定时可以替代或补充 max_grad_norm。',
    'avoidWhen': 'immediate 模式与某些优化器实现不完全兼容；AGC 参数（agc_clip_factor/agc_eps）设置不当可能过度裁剪。'
  },
  'advanced': {
    'principle': 'AGC（Adaptive Gradient Clipping）：clip_threshold = agc_clip_factor × max(‖W‖_F, agc_eps)；若 ‖∇W‖_F > clip_threshold 则裁剪 ∇W *= clip_threshold / ‖∇W‖_F。等价于"梯度范数不超过权重范数的 agc_clip_factor 倍"，对每层独立计算（不像 max_grad_norm 是全局）。',
    'tradeoffs': 'AGC 与 max_grad_norm 同时使用时双重裁剪，应选其一。AGC 对大权重层（如 MLP）的裁剪阈值更大，对小权重层（如 LoRA）更严格。'
  },
  'relatedConfigs': ['gradient_accumulation_steps', 'max_grad_norm', 'turbocore_fused_backward_enabled']
})

# ── 网络参数 ──────────────────────────────────────────────────────────────────

write('network_args_custom.json', {
  'key': 'network_args_custom',
  'title': 'LoRA 网络自定义参数',
  'category': 'LoRA / 网络结构',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['network_weights', 'network_train_unet_only', 'network_train_text_encoder_only'],
  'standard': {
    'summary': '向 LoRA 网络模块传递额外参数（key=value 格式），用于启用特定网络的高级功能（如 LyCORIS 的 conv_dim / dropout 等）。',
    'effect': 'network_weights = 从已有 LoRA 文件继续训练（预加载权重）；train_unet_only = 只训练 UNet 不训练 TE；train_text_encoder_only = 只训练 TE 不训练 UNet；network_args_custom 传额外参数给 network_module。',
    'whenToUse': 'network_weights 用于接续训练（从 checkpoint 继续）；train_unet_only 用于不需要 TE 训练的场景（节省显存和时间）。',
    'avoidWhen': 'network_args_custom 中的参数名必须与具体 network_module 的接口匹配，否则会导致初始化失败。'
  },
  'advanced': {
    'principle': 'network_weights 加载已有 LoRA 的 state_dict 作为训练起点（warm start），可以在已收敛 LoRA 基础上继续微调。train_unet_only/text_encoder_only 通过 param_groups 控制哪组参数参与优化。',
    'tradeoffs': '从已有 LoRA warm start（network_weights）时，预加载权重的 LR 应适当降低（避免覆盖已学到的内容）；从随机初始化时 LR 可以更高。'
  },
  'relatedConfigs': ['network_dim', 'network_module', 'train_text_encoder']
})

# ── DoRA ──────────────────────────────────────────────────────────────────────

write('dora_enabled.json', {
  'key': 'dora_enabled',
  'title': 'DoRA（方向-幅度分解 LoRA）',
  'category': 'LoRA 变体 / DoRA',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['dora_mode', 'dora_wd'],
  'standard': {
    'summary': 'DoRA（Weight-Decomposed Low-Rank Adaptation）：将权重更新分解为方向变化（LoRA 负责）和幅度变化（可学习缩放负责），更精确地模拟全量微调的行为。',
    'effect': '相比标准 LoRA，DoRA 在相同 rank 下通常能达到更高的质量，因为分离方向和幅度变化允许更灵活的学习。',
    'whenToUse': '追求更高 LoRA 质量（相当于升高 rank 的效果但不增加参数量）时尝试。dora_mode 控制幅度分解的实现方式；dora_wd 控制幅度的 weight decay。',
    'avoidWhen': 'DoRA 增加每层一个可学习幅度参数（约 rank/d_out 个额外参数，很少），开销极小；但与某些 LoRA 加载器（老版 A1111）不兼容，确认推理端支持 DoRA 再使用。'
  },
  'advanced': {
    'principle': 'DoRA: W_DoRA = (m / ‖W_0 + BA‖) × (W_0 + BA)，m ∈ R^{d_out} 是可学习的逐输出通道幅度向量。初始化 m = ‖W_0‖（保持 parity），训练中 m 独立于 B/A 方向变化更新。',
    'tradeoffs': 'DoRA 文件比标准 LoRA 略大（多出 m 向量）；推理时需要专门的 DoRA 加载逻辑（ComfyUI 1.3+ 已原生支持）。'
  },
  'relatedConfigs': ['network_dim', 'network_alpha', 'pissa_init']
})

# ── 加速配置 / inference_accel ────────────────────────────────────────────────

write('enable_inference_accel.json', {
  'key': 'enable_inference_accel',
  'title': '推理加速（采样预览）',
  'category': '速度 / 推理加速',
  'appliesTo': ['anima-lora'],
  'aliases': ['enable_preview', 'enable_base_weight', 'enable_block_weights', 'enable_block_weight_filter',
              'enable_distributed_training', 'enable_sequential_cpu_offload'],
  'standard': {
    'summary': 'enable_inference_accel 为训练中的采样预览启用推理加速（SmoothCache/SpeculativeDecoding 等）；其他 enable_* 字段是各功能的主开关。',
    'effect': 'enable_inference_accel 开启后预览生成速度提升约 1.3~1.6×；enable_base_weight 允许训练带有基础权重偏置的 LoRA；enable_block_weights 开启 block 级 LR 权重；enable_distributed_training 开启多卡训练（需要多 GPU 环境）。',
    'whenToUse': '各字段视需求开启，大多数有对应的细粒度配置参数。enable_sequential_cpu_offload 是最激进的 offload（逐层），仅在极端低 VRAM 时使用。',
    'avoidWhen': 'enable_distributed_training 需要多 GPU 环境且正确配置 DDP；enable_sequential_cpu_offload 极大降低训练速度，只作为 OOM 最后手段。'
  },
  'advanced': {
    'principle': '这些开关字段通常控制对应功能模块的激活状态。enable_* 设为 false 时，对应模块的所有子参数即使设置也不生效。',
    'tradeoffs': '顶层开关使功能的启用/禁用更方便，但需要注意开关与子参数的组合：开关 off 但子参数有值时，子参数静默不生效（无警告）。'
  },
  'relatedConfigs': ['blocks_to_swap', 'anima_block_prefetch', 'gradient_checkpointing']
})

# ── Concept Edit ──────────────────────────────────────────────────────────────

write('concept_edit_mode.json', {
  'key': 'concept_edit_mode',
  'title': 'Concept Edit 模式',
  'category': '训练 / 概念编辑',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['concept_edit_data_dir', 'concept_edit_diff_alt_ratio', 'concept_edit_fixed_timestep_per_batch',
              'concept_edit_use_diff_mask', 'concept_geometry_compute_backend',
              'concept_geometry_density_power', 'concept_geometry_loss_weighting',
              'concept_geometry_path', 'concept_geometry_sampler_mode',
              'concept_geometry_semantic_enabled', 'concept_geometry_translation_enabled'],
  'standard': {
    'summary': '概念编辑训练模式：在保留模型其他能力的同时，针对性地修改或替换特定概念（如修改特定角色外观、移除特定风格倾向）。',
    'effect': 'concept_edit_mode 选择编辑策略：diff_mask = 只修改概念差异区域；fixed_timestep = 固定时间步训练特定概念。geometry 相关参数控制基于 3D/几何感知的概念编辑（利用深度/法线图信息）。',
    'whenToUse': '实验性高级功能。需要精确编辑现有概念（而非简单添加新概念）时使用。',
    'avoidWhen': '普通 LoRA 训练（添加新角色/风格）不需要使用概念编辑模式，复杂度高收益有限。'
  },
  'advanced': {
    'principle': '概念编辑通过构建"原始概念"和"目标概念"的对比损失，引导模型在保留其他语义的同时，只修改目标概念方向的表征。geometry_path 提供 3D/几何先验（如深度图），使编辑更符合 3D 一致性。',
    'tradeoffs': '概念编辑需要精心准备原始/目标对比数据集；geometry 功能需要额外的深度/法线图数据，准备工作量较大。'
  },
  'relatedConfigs': ['network_dim', 'learning_rate']
})

# ── Sync 配置同步 ─────────────────────────────────────────────────────────────

write('sync_config_from_main.json', {
  'key': 'sync_config_from_main',
  'title': '配置同步（主仓库）',
  'category': '训练 / 配置管理',
  'appliesTo': ['anima-lora'],
  'aliases': ['sync_asset_keys', 'sync_config_keys_from_main', 'sync_main_repo_dir',
              'sync_main_toml', 'sync_missing_assets_from_main', 'sync_ssh_password',
              'sync_ssh_port', 'sync_ssh_user', 'sync_use_password_auth'],
  'standard': {
    'summary': '从主训练仓库同步配置和资产（如数据集、基础模型路径）到当前训练环境，支持本地路径或 SSH 远程同步。',
    'effect': '开启后会从 sync_main_repo_dir（本地）或 SSH 远程拉取 sync_main_toml 中指定的配置字段和文件资产，覆盖本地配置。',
    'whenToUse': '多机训练或团队协作时，通过配置同步确保各机器使用一致的训练配置。',
    'avoidWhen': '单机训练或本地配置已经完整时无需使用同步功能。'
  },
  'advanced': {
    'principle': '本地同步通过文件系统直接复制；SSH 同步通过 Paramiko/fabric 连接远程机器，sync_asset_keys 指定需要同步的具体配置键列表，sync_missing_assets_from_main 自动发现并同步主仓库有但本地缺失的资源文件。',
    'tradeoffs': 'SSH 同步需要远程机器的访问权限（密码/密钥），sync_ssh_password 明文存储在配置中有安全风险，建议改用密钥认证（use_password_auth=false）。'
  },
  'relatedConfigs': ['output_dir', 'train_data_dir']
})

# ── 训练数据 ──────────────────────────────────────────────────────────────────

write('train_data_dir.json', {
  'key': 'train_data_dir',
  'title': '训练数据目录',
  'category': '数据集 / 基础',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'aliases': ['train_length_mode', 'train_norm', 'data_backend',
              'data_transfer_profile_enabled', 'data_transfer_profile_mode', 'data_transfer_profile_window'],
  'standard': {
    'summary': '训练图像数据集的目录路径。目录下的图像文件（.png/.jpg 等）和对应的图说文件（.txt/.caption）构成训练数据集。',
    'effect': '支持绝对路径和相对路径。可以包含子目录（需要图说文件）。data_transfer_profile 记录数据加载的耗时统计，用于诊断 I/O 瓶颈。',
    'whenToUse': '每次训练必须设置。建议为每次训练实验使用独立的数据目录。',
    'avoidWhen': '数据目录中混入非训练文件（如 .DS_Store、Thumbs.db）可能被误识别，建议清理干净。'
  },
  'advanced': {
    'principle': '训练器遍历数据目录，寻找支持格式的图像（png/jpg/webp）及同名图说文件（caption_extension 设定的扩展名）。子目录支持需要图说文件或子目录名被识别为概念名。data_backend 选择图像读取后端（pillow / opencv），影响读取速度和格式支持。',
    'tradeoffs': '数据在 NVMe 上训练速度最快（I/O 延迟低）；HDD 上大数据集可能成为 I/O 瓶颈（配合缓存可改善）。'
  },
  'relatedConfigs': ['caption_extension', 'cache_latents', 'resolution']
})

# ── Lineart 保存 ──────────────────────────────────────────────────────────────

write('lineart_preservation_enabled.json', {
  'key': 'lineart_preservation_enabled',
  'title': '线稿保留 Loss',
  'category': '前沿储备 / 质量',
  'appliesTo': ['anima-lora'],
  'aliases': ['lineart_preservation_weight', 'lineart_preservation_edge_weight',
              'lineart_preservation_min_t', 'lineart_preservation_max_t'],
  'standard': {
    'summary': '（实验性）线稿保留辅助 loss：通过边缘检测约束训练输出保留原始线稿的清晰度和精确度，适合线稿/插画风格 LoRA。',
    'effect': '开启后增加一个基于 Canny/Sobel 边缘检测的辅助 loss，鼓励生成保留或增强线条清晰度。edge_weight 控制边缘像素的相对权重（相比非边缘区域）。',
    'whenToUse': '实验性功能。线稿风格 LoRA 或对线条清晰度有高要求的训练场景。min_t/max_t 控制只在特定噪声级别激活（建议只在中低噪声级别激活，高噪声步骤线稿信息已丢失）。',
    'avoidWhen': '默认关闭。非线稿风格训练（如照片写实）使用此 loss 意义不大。'
  },
  'advanced': {
    'principle': 'lineart_preservation 与 lineart_loss（在 Quality Reserve Pack 中）类似但有区分：preservation 侧重保留原始图像的线条（忠实重建），loss 侧重生成的边缘质量。两者均基于边缘检测，min_t/max_t 通过 sigma 阈值控制激活范围。',
    'tradeoffs': 'edge_weight 过高会过度约束边缘区域的重建（可能在低噪声步骤欠拟合非边缘区域）；过低则效果不明显。建议从 edge_weight=2~5 开始尝试。'
  },
  'relatedConfigs': ['lineart_loss_enabled', 'dct_frequency_enabled', 'perceptual_anchor_loss_enabled']
})

# ── 分布式训练 ────────────────────────────────────────────────────────────────

write('num_processes.json', {
  'key': 'num_processes',
  'title': '并行进程数',
  'category': '训练 / 分布式',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['num_machines', 'main_process_ip', 'main_process_port',
              'ddp_gradient_as_bucket_view', 'ddp_static_graph', 'ddp_timeout', 'gpu_ids'],
  'standard': {
    'summary': '分布式训练（DDP）的进程数（通常等于 GPU 数量）。num_processes=1 = 单卡训练（默认）；>1 = 多卡数据并行。',
    'effect': '多卡训练：每卡各自计算一个 batch 的梯度，汇总后同步更新参数。等效 batch size = batch_size × num_processes。',
    'whenToUse': '有多块 GPU 且希望加速训练时使用。DDP 提供线性加速（2 卡 ≈ 2× 速度）但需要正确配置通信参数。',
    'avoidWhen': 'LoRA 训练数据集通常很小（<100张），多卡并行在数据层面意义不大；单卡高效率通常比多卡 DDP 更实用。'
  },
  'advanced': {
    'principle': 'DDP（DistributedDataParallel）：每个进程持有完整模型副本，独立计算本地 batch 梯度，all-reduce 操作同步梯度后各自更新。ddp_gradient_as_bucket_view 优化 all-reduce 的内存效率；ddp_static_graph 在计算图固定时提供额外优化。',
    'tradeoffs': 'DDP 有通信开销（all-reduce），小模型/小 batch 时通信可能成为瓶颈（多卡反而比单卡慢）。LoRA 参数量少（约 1~100MB），通信开销相对可控。'
  },
  'relatedConfigs': ['train_batch_size', 'gradient_accumulation_steps']
})

# ── 日志 / WandB ──────────────────────────────────────────────────────────────

write('wandb_api_key.json', {
  'key': 'wandb_api_key',
  'title': 'WandB 训练跟踪',
  'category': '训练 / 日志',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'aliases': ['wandb_run_name', 'log_tracker_name', 'log_tracker_config', 'log_prefix'],
  'standard': {
    'summary': '配置 Weights & Biases（WandB）训练追踪：API Key 验证身份，run_name 设置本次训练的显示名称。训练过程中的 loss、LR、速度等指标自动上传到 WandB 看板。',
    'effect': '开启后可以在 wandb.ai 实时查看训练曲线、对比不同实验、存储训练配置历史。',
    'whenToUse': '需要系统化追踪和对比多次训练实验时使用。适合调参阶段（对比不同 LR/rank/optimizer 的 loss 曲线）。',
    'avoidWhen': 'wandb_api_key 不要硬编码到配置文件（有泄露风险），建议通过环境变量或 wandb login 命令设置。不需要远程追踪时保持 None（默认只记录本地日志）。'
  },
  'advanced': {
    'principle': 'WandB 集成通过 wandb.init() + wandb.log() 实现，log_prefix 给所有指标添加前缀（方便同一项目下多次训练的指标区分）。log_tracker_config 指定额外记录的配置字段（默认记录全部训练配置）。',
    'tradeoffs': 'WandB 上传需要网络连接，中断训练时离线缓存的数据会在恢复网络后自动同步。付费计划限制大量数据上传；开源项目可免费使用基本功能。'
  },
  'relatedConfigs': ['output_dir', 'output_name']
})

# ── 验证集 ────────────────────────────────────────────────────────────────────

write('validate_every_n_steps.json', {
  'key': 'validate_every_n_steps',
  'title': '验证集评估',
  'category': '训练 / 评估',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['validate_every_n_epochs', 'eval_data_dir', 'eval_batch_size',
              'max_validation_steps'],
  'standard': {
    'summary': '每 N 步在验证集上评估 loss，用于检测过拟合（训练 loss 下降但验证 loss 上升）。',
    'effect': '开启后每 N 步暂停训练，在 eval_data_dir 的验证集上计算 loss（不更新权重）。可以早期发现过拟合。',
    'whenToUse': '有独立验证集（与训练集图像不重叠）时使用。验证集通常取训练集的 10%~20%。',
    'avoidWhen': 'LoRA 训练数据集通常很小（<50张），难以分出有效验证集；多数 LoRA 训练不使用正式验证集（用预览图目测代替）。'
  },
  'advanced': {
    'principle': '验证评估仅计算 forward pass 的 loss（torch.no_grad()），不计算梯度，速度快且不影响权重。max_validation_steps 限制验证集的最大评估批次数（大验证集时避免过长暂停）。',
    'tradeoffs': '验证 loss 是比训练 loss 更可信的过拟合指标；但 LoRA 的目标通常是主观质量而非 loss 数值，单纯追踪 loss 可能与实际生成质量不完全对应。'
  },
  'relatedConfigs': ['sample_every_n_steps', 'save_every_n_steps']
})

# ── 残差 LoRA ─────────────────────────────────────────────────────────────────

write('reslora_enabled.json', {
  'key': 'reslora_enabled',
  'title': 'ResLoRA（残差 LoRA）',
  'category': 'LoRA 变体 / 残差',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['reslora_mode'],
  'standard': {
    'summary': '（实验性）ResLoRA：在 LoRA 层之间添加残差连接，缓解深层 LoRA 的梯度消失问题，提升学习稳定性。',
    'effect': '在多个 LoRA 层之间建立跳跃连接，允许梯度直接传播跳过中间 LoRA 层，解决深层 LoRA 收敛缓慢的问题。',
    'whenToUse': '实验性功能。注入层数较多（如全层 LoRA，注入 60+ 层）时可以尝试缓解深层梯度消失。',
    'avoidWhen': '低 rank 或注入层数少时不需要。block_shortcut 实现需要相邻层的形状匹配，形状不一致时有自动 skip 保护（shape guard）。'
  },
  'advanced': {
    'principle': 'ResLoRA 在每 N 个 LoRA block 之间添加旁路连接（类似 ResNet 的 shortcut），前一 block 的输出直接加到后 N 个 block 后，绕过 N 个 LoRA 层的潜在梯度瓶颈。reslora_mode 控制残差连接的粒度（block/layer 级别）。',
    'tradeoffs': '残差连接改变了 LoRA 的前向计算结构，与标准 LoRA 不完全兼容（推理时需要 ResLoRA-aware 的加载器）。跨层 shortcut 要求前后层形状匹配，不匹配时会自动跳过（但跳过意味着该位置没有残差保护）。'
  },
  'relatedConfigs': ['network_dim', 'network_module', 'dora_enabled']
})

# ── KronA（Kronecker LoRA 变体）───────────────────────────────────────────────

write('krona_enabled.json', {
  'key': 'krona_enabled',
  'title': 'KronA（Kronecker LoRA）',
  'category': 'LoRA 变体 / Kronecker',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['krona_factor_in', 'krona_factor_out', 'krona_allora'],
  'standard': {
    'summary': '（实验性）KronA（Kronecker Adaptation）：通过两个小矩阵的 Kronecker 积来表示权重更新，在保持低参数量的同时比标准 LoRA 有更好的参数效率。',
    'effect': 'ΔW = scale × kron(A, B)，A 和 B 的维度由 factor_in/factor_out 控制。krona_allora = True 时启用 ALLoRA（自适应幅度归一化），限制各通道的更新幅度。',
    'whenToUse': '实验性功能，追求参数效率的场景。KronA 通常在相同参数量下比标准 LoRA 有更强的表达力。',
    'avoidWhen': 'KronA 展开后的 ΔW 是完整大矩阵（out × in），与 LoRA 低秩矩阵不同，实际 VRAM 消耗更高（CDKA 和 KronA 的共同问题）。'
  },
  'advanced': {
    'principle': 'KronA: ΔW = scale × kron(w1, w2)，kron(w1, w2)_{ij} = w1_{i//rows2, j//cols2} × w2_{i%rows2, j%cols2}。w1 维度 = (out_f × in_f)，w2 = (out//out_f × in//in_f)，参数量 = out_f×in_f + out//out_f×in//in_f << out×in。ALLoRA 按每输出通道对 ΔW 行向量的范数归一化，防止某些通道的更新幅度过大。',
    'tradeoffs': 'Kronecker 积的计算需要 materialize 完整 ΔW（out×in），比 LoRA 的 B@A 需要更多临时内存；但参数量更少，理论上更难过拟合。'
  },
  'relatedConfigs': ['cdka_enabled', 'network_dim', 'network_alpha']
})

# ── T-LoRA (Tensor Ring) ──────────────────────────────────────────────────────

write('tlora_rank_schedule.json', {
  'key': 'tlora_rank_schedule',
  'title': 'T-LoRA（张量环 LoRA）',
  'category': 'LoRA 变体 / 张量',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['tlora_min_rank', 'tlora_orthogonal_init'],
  'standard': {
    'summary': '（实验性）T-LoRA（Tensor-Ring LoRA）：使用张量环分解替代标准矩阵分解，在参数量不变的情况下增加 LoRA 的隐式秩。',
    'effect': 'tlora_rank_schedule 控制不同训练阶段的有效 rank（如从高 rank 逐渐降低）；tlora_orthogonal_init 使用正交初始化提升训练稳定性。',
    'whenToUse': '实验性功能。追求比标准 LoRA 更高的参数效率（相同参数量 → 更高隐式秩）时尝试。',
    'avoidWhen': '默认关闭。张量环分解的前向计算比标准 LoRA 更复杂，且推理时需要专门支持。'
  },
  'advanced': {
    'principle': '张量环（Tensor Ring）分解：W ≈ Tr(G_1, G_2, ..., G_k)，通过闭环收缩多个三阶张量核来表示权重矩阵。隐式秩 = 各核维度的乘积，远超标准 LoRA 的显式 rank。',
    'tradeoffs': '张量环计算比矩阵乘法更复杂（多次收缩），训练速度可能慢 2~3×；但参数效率理论上更高，适合参数量受限的场景。'
  },
  'relatedConfigs': ['network_dim', 'network_alpha', 'krona_enabled', 'cdka_enabled']
})

# ── 加速配置档位 ──────────────────────────────────────────────────────────────

write('acceleration_profile.json', {
  'key': 'acceleration_profile',
  'title': '加速档位预设',
  'category': '速度 / 整合',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'standard': {
    'summary': '一键启用针对特定模型路线（SDXL/SD15/Anima/Newbie/Flux）优化的加速组合：自动推荐 cache、optimizer、checkpoint、compile 和低显存补丁。',
    'effect': '选择对应路线的档位后，训练器会自动配置推荐的缓存策略（cache_latents/disk）、优化器档位（fused/foreach）、是否开启 gradient_checkpointing 等，无需手动逐一设置。',
    'whenToUse': '不想手动调整多个速度参数时，使用对应路线的预设档位快速获得合理的性能配置。',
    'avoidWhen': '需要精细控制具体参数时，预设档位的值可能不是最优。预设是"不错的默认值"，不是针对特定硬件调优的最优值。'
  },
  'advanced': {
    'principle': '预设会覆盖多个速度相关字段的默认值，包括：optimizer_backend（auto → fused/foreach）、compile_runtime（off → compile_cache）、cache_latents（false → true）等。实际配置优先级：显式用户设置 > 预设值 > 代码默认值。',
    'tradeoffs': '预设的组合针对通用场景优化，不同显卡/数据集的实际最优配置可能不同。建议用预设作为起点，再根据实际速度监控数据微调。'
  },
  'relatedConfigs': ['optimizer_backend', 'compile_runtime', 'gradient_checkpointing', 'cache_latents']
})

# ── 缓存磁盘格式 ──────────────────────────────────────────────────────────────

write('latent_cache_disk_format.json', {
  'key': 'latent_cache_disk_format',
  'title': 'Latent 缓存磁盘格式',
  'category': '速度 / 缓存',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'aliases': ['latent_cache_disk_dtype', 'text_encoder_outputs_cache_disk_format',
              'text_encoder_outputs_cache_disk_dtype', 'cache_latents_to_disk',
              'cache_text_encoder_outputs_to_disk', 'text_encoder_outputs_cache_dtype'],
  'standard': {
    'summary': '原版缓存引擎（lossless_cache_replacement_mode=off）下，latent 缓存文件的存储格式和精度。',
    'effect': 'format=npz（默认）= NumPy 压缩格式，兼容性最好；safetensors = HuggingFace 格式，读取更快；pt = PyTorch 格式。dtype=float16/bfloat16/float32 控制缓存精度（float16 最省空间）。',
    'whenToUse': '开启 cache_latents_to_disk 后选择合适格式。npz 兼容性最广；safetensors 读取最快；pt 与 PyTorch 生态集成最好。',
    'avoidWhen': 'lossless_cache_replacement_mode != off 时此参数无效（lossless 引擎有自己的格式控制）。'
  },
  'advanced': {
    'principle': 'latent 缓存存储 VAE encoder 输出的 float 张量，原版引擎通过 numpy.savez_compressed（npz）或 safetensors.torch.save_file 写出。dtype 降精度（float32 → float16）可以节省约 50% 磁盘空间，引入的精度误差通常在训练中不可感知（latent 空间的 float16 精度已够用）。',
    'tradeoffs': 'npz 的 gzip 压缩在读取时需要解压（CPU 开销）；safetensors 是原始张量（无压缩，读取更快但文件更大）；lossless 引擎（lxfs/lynx）提供中间方案（快速有损压缩如 lz4）。'
  },
  'relatedConfigs': ['cache_latents', 'lossless_cache_replacement_mode', 'anima_cached_training']
})

# ── Staged Resolution ─────────────────────────────────────────────────────────

write('staged_resolution_ratio_512.json', {
  'key': 'staged_resolution_ratio_512',
  'title': '分阶段分辨率（512）',
  'category': '训练 / 分辨率',
  'appliesTo': ['anima-lora'],
  'aliases': ['staged_resolution_ratio_768', 'staged_resolution_ratio_1024',
              'staged_resolution_ratio_1536', 'staged_resolution_ratio_2048'],
  'standard': {
    'summary': '分阶段分辨率训练：控制在各个分辨率级别（512/768/1024/1536/2048）上分配的训练比例，先低分辨率后高分辨率循序渐进。',
    'effect': '设置各分辨率的比例后，训练在不同分辨率下循环，先以低分辨率快速学习全局特征，再以高分辨率精炼细节。',
    'whenToUse': '实验性功能。希望在有限步数内兼顾全局结构和细节质量时可以尝试。',
    'avoidWhen': '默认单一固定分辨率对大多数 LoRA 训练已经足够；分阶段分辨率实现复杂，效果需要实验验证。'
  },
  'advanced': {
    'principle': '按照配置的比例，每步从不同分辨率 bucket 采样：ratio_512=0.3, ratio_1024=0.7 意味着 30% 步骤用 512 分辨率，70% 用 1024。低分辨率步骤更快（显存占用低），高分辨率步骤更慢但细节更丰富。',
    'tradeoffs': '分阶段分辨率需要所有分辨率的 bucket 预先生成，增加初始化时间；低分辨率训练的梯度对高分辨率特征的作用有限。'
  },
  'relatedConfigs': ['resolution', 'enable_bucket', 'bucket_reso_steps']
})

# ── 采样优化 ──────────────────────────────────────────────────────────────────

write('ant_loss_sampler_enabled.json', {
  'key': 'ant_loss_sampler_enabled',
  'title': 'ANT Loss 采样器',
  'category': '前沿储备 / 训练',
  'appliesTo': ['anima-lora'],
  'aliases': ['ant_loss_sampler_bins', 'ant_loss_sampler_alpha', 'ant_loss_sampler_beta_schedule'],
  'standard': {
    'summary': '（实验性）per-sigma-bin 的自适应 loss 采样器：维护每个噪声 sigma 区间的历史 loss EMA，用多项式分布代替均匀时间步采样，重点训练 loss 最高（最难）的 sigma 区间。',
    'effect': '优化时间步的采样效率：sigma 区间 loss 高（模型在该区间表现差）→ 增加采样该区间的概率。动态适应训练状态，比固定权重方案更智能。',
    'whenToUse': '实验性功能。与 anima_weighting_scheme 正交（一个控制 loss 权重，一个控制采样分布），可以叠加使用。',
    'avoidWhen': '默认关闭。EMA 需要一定步数积累才能反映真实 loss 分布，短训练（<100步）效果不明显。'
  },
  'advanced': {
    'principle': '将 sigma 空间分为 ant_loss_sampler_bins 个区间，维护各区间的 loss EMA（指数滑动平均，系数 ant_loss_sampler_alpha）。采样时以多项式分布按 loss EMA 值采样（高 loss 区间高概率）。beta_schedule 控制 EMA 更新的学习率衰减，防止后期对早期噪声信号过度敏感。',
    'tradeoffs': '与 anima_weighting_scheme 同时使用时需要注意：weighting_scheme 改变各步的 loss 权重（梯度幅度），而 loss_sampler 改变哪些步骤被选中（采样频率）；两者叠加效果复杂，建议分开测试。'
  },
  'relatedConfigs': ['anima_weighting_scheme', 'p2_weighting_enabled', 'scale_guidance_mode']
})

# ── LR Finder ─────────────────────────────────────────────────────────────────

write('lr_finder_enabled.json', {
  'key': 'lr_finder_enabled',
  'title': 'LR Finder（学习率探索器）',
  'category': '训练 / 学习率',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['lr_finder_start_lr', 'lr_finder_end_lr', 'lr_finder_num_steps'],
  'standard': {
    'summary': '（实验性）LR Finder：在正式训练前运行一段测试训练，从低到高扫描学习率，记录 loss 曲线，帮助找到最优学习率范围。',
    'effect': '运行 lr_finder_num_steps 步，LR 从 start_lr 指数增长到 end_lr，记录各 LR 下的 loss。loss 开始上升前的 LR 区间是推荐的最大 LR。',
    'whenToUse': '不确定目标模型的最优 LR 时，先运行 LR Finder 再正式训练。特别适合新架构（Anima）或新优化器组合。',
    'avoidWhen': 'LR Finder 只是参考，不保证精确找到最优 LR；小数据集下 loss 曲线噪声大，参考价值有限。运行 Finder 后会重置模型到初始状态（浪费这些步骤的学习）。'
  },
  'advanced': {
    'principle': '基于 fastai LR Range Test：从 start_lr 开始，每步按指数增长 LR（LR_t = start_lr × (end_lr/start_lr)^(t/num_steps)），记录 loss 曲线。最优 LR ≈ loss 开始快速下降的 LR 的 1/3（steepest descent 点再降一个数量级）。',
    'tradeoffs': 'LR Finder 运行期间消耗实际 GPU 时间但不保留权重更新（Finder 完成后重置）；在小数据集上 loss 曲线噪声大，最优点不易判断。'
  },
  'relatedConfigs': ['learning_rate', 'optimizer_type', 'lr_scheduler']
})

print('批次7 全部条目完成')
