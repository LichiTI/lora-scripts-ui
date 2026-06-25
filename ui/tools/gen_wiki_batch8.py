"""
批次8: 清扫剩余 182 个字段 — 按主题大批量 alias 覆盖
"""
import json, os

ENTRIES_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'training-wiki', 'entries')

def write(name, data):
    path = os.path.join(ENTRIES_DIR, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'  wrote {name}')

# ── VRAM 智能感知 + 自动增强 ──────────────────────────────────────────────────

write('vram_auto_enhance_enabled.json', {
  'key': 'vram_auto_enhance_enabled',
  'title': 'VRAM 自动增强 & 智能感知',
  'category': '速度 / 显存',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['vram_smart_sensing_baseline_steps', 'vram_smart_sensing_delta_cache_enabled',
              'vram_smart_sensing_slowdown_ratio', 'vram_swap_to_ram',
              'anima_block_residency_min_params', 'peak_vram_startup_guard_enabled',
              'peak_vram_startup_guard_mode', 'peak_vram_startup_guard_steps',
              'peak_vram_target_effective_batch'],
  'standard': {
    'summary': 'VRAM 自动增强套件：智能感知（smart_sensing）在训练前几步测量实际 VRAM 使用量，并自动推荐优化措施；vram_swap_to_ram 允许将不活跃权重换到 CPU RAM；startup_guard 在训练启动时预防 OOM。',
    'effect': 'smart_sensing 在 baseline_steps 步内监控 VRAM，检测 slowdown_ratio（VRAM 使用率超阈值时速度下降信号），delta_cache 记录增量变化。startup_guard 在开始训练前分配测试内存，预防编译或首步 OOM 爆炸。',
    'whenToUse': '显存使用不稳定（偶发 OOM）或想自动诊断 VRAM 瓶颈时开启。',
    'avoidWhen': '稳定训练（从不 OOM）时无需开启监控，有额外开销。'
  },
  'advanced': {
    'principle': 'smart_sensing 在 baseline_steps 步内以更频繁的频率记录 VRAM 使用量，建立基线；之后转为定期检查（配合 peak_vram_diagnostics）。vram_swap_to_ram 通过 torch.cuda.memory 的 reserved → system RAM 策略实现（非 offload，只是内存管理策略）。anima_block_residency_min_params 控制块驻留 GPU 所需的最小参数量（小块不值得常驻 GPU）。',
    'tradeoffs': '频繁 VRAM 监控有约 0.5~1ms/step 额外开销；startup_guard 分配的测试内存在验证后立即释放，但可能延迟训练开始约 10~30 秒。'
  },
  'relatedConfigs': ['peak_vram_control_enabled', 'anima_block_prefetch', 'gradient_checkpointing']
})

# ── Wavelet Loss ──────────────────────────────────────────────────────────────

write('wavelet_loss_weight.json', {
  'key': 'wavelet_loss_weight',
  'title': '小波变换 Loss',
  'category': '前沿储备 / 质量',
  'appliesTo': ['anima-lora'],
  'aliases': ['wavelet_loss_approx_weight', 'wavelet_loss_levels'],
  'standard': {
    'summary': '（实验性）小波 loss：通过多级小波分解分析训练输出的高/低频成分，对不同频率的重建误差差异化加权。',
    'effect': 'wavelet_loss_weight 控制总体小波 loss 权重；approx_weight 控制低频近似系数的权重（相对于高频细节系数）；levels 控制小波分解级数（更多级 → 分析更低的频率）。',
    'whenToUse': '实验性功能。对高频细节（纹理/线条清晰度）有要求时可以尝试，比纯 MSE 更能感知频率域的质量。',
    'avoidWhen': '默认关闭。小波 loss 的权重设置需要经验，设置不当可能导致频率不平衡。'
  },
  'advanced': {
    'principle': '离散小波变换（DWT）将信号分解为近似系数（低频，整体结构）和细节系数（高频，边缘/纹理）。多级 DWT（levels 级）逐级分解近似系数，提取越来越低的频率成分。loss = approx_weight × ‖WT_approx‖ + ‖WT_detail‖。',
    'tradeoffs': 'wavelet loss 与 dct loss 有功能重叠（都分析频域），通常选择其中一种使用。DWT 计算复杂度略高于 DCT（但仍较快，约 2~5ms/step）。'
  },
  'relatedConfigs': ['dct_frequency_enabled', 'scale_guidance_mode', 'p2_weighting_enabled']
})

# ── SoftREPA ──────────────────────────────────────────────────────────────────

write('softrepa_enabled.json', {
  'key': 'softrepa_enabled',
  'title': 'SoftREPA（软文本对齐正则化）',
  'category': '前沿储备 / 训练',
  'appliesTo': ['anima-lora'],
  'aliases': ['softrepa_min_weight', 'softrepa_max_weight'],
  'standard': {
    'summary': '（实验性）SoftREPA：通过软约束保持 LoRA 输出与预训练文本表征的对齐，防止 LoRA 过度漂离文本-图像对齐空间。',
    'effect': '在训练 loss 中加入文本-图像对齐正则项，权重在 min_weight 和 max_weight 之间动态调整（基于当前对齐偏差）。',
    'whenToUse': '实验性功能。担心 LoRA 训练破坏原始文本响应能力时可以尝试。',
    'avoidWhen': '默认关闭。对齐正则化会限制 LoRA 的学习自由度，可能减慢概念学习速度。'
  },
  'advanced': {
    'principle': 'REPA（Representation Alignment）是一种在潜在空间对齐表征的方法。SoftREPA 是其软化版本：通过动态权重（在 min/max 之间线性插值）避免过度约束。当前对齐很好时用低权重（自由学习），偏差大时用高权重（拉回对齐）。',
    'tradeoffs': '对齐约束的强度（权重范围）需要根据具体任务调整；太强会阻止 LoRA 学习新概念，太弱则失去正则化效果。'
  },
  'relatedConfigs': ['perceptual_anchor_loss_enabled', 'anima_ema_feat_align_enabled']
})

# ── SDS LoRA ──────────────────────────────────────────────────────────────────

write('sds_lora_enabled.json', {
  'key': 'sds_lora_enabled',
  'title': 'SDS-LoRA（奇异值分解 LoRA）',
  'category': 'LoRA 变体 / SDS',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'standard': {
    'summary': '（实验性）SDS-LoRA（Spectral Decomposed Symmetric LoRA）：对 LoRA 的 A/B 矩阵做谱分解，通过正交化保证 LoRA 更新的各向同性，防止训练过程中出现的奇异值偏态（少数方向主导更新）。',
    'effect': '开启后 LoRA 更新在各方向更均匀（各向异性消除），有助于稳定训练、防止某些特征方向过度拟合。',
    'whenToUse': '实验性功能，cleanroom 实现已完成并验证（7/7 smoke 通过）。与标准 LoRA parity 兼容，默认 off。',
    'avoidWhen': '默认关闭。SDS-LoRA 在 LLM/ViT 上验证，DiT（Anima）未全面验证，建议先实验确认效果再用于正式训练。'
  },
  'advanced': {
    'principle': '维护 Q_A/Q_B 的 detached buffer（不参与 autograd），对 A/B 做定期 QR 刷新（orthogonalization）使梯度条件数降低（实测从 8.28 → 2.71）。warmup 阶段先做 SVD 重参数化，确保训练初期权重已正交化。系数 1/(2s) 而非论文的 1/√(2s)（原论文有笔误）。',
    'tradeoffs': 'QR 刷新有额外计算开销（每 N 步一次 SVD/QR，约 1~5ms）；orthogonalization 改变了梯度传播路径，与标准 LoRA 的训练轨迹不同（虽然初始权重 parity）。'
  },
  'relatedConfigs': ['network_dim', 'pissa_init', 'dora_enabled']
})

# ── FP8 / 精度控制 ────────────────────────────────────────────────────────────

write('fp8_base.json', {
  'key': 'fp8_base',
  'title': 'FP8 基座精度',
  'category': '训练 / 精度',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'aliases': ['fp8_base_unet', 'full_bf16', 'full_fp16', 'no_half_vae',
              'loss_precision', 'flashattn', 'sageattn', 'sdpa', 'mem_eff_attn', 'split_attn'],
  'standard': {
    'summary': '控制训练精度和注意力实现：fp8_base 将基础模型权重量化为 FP8（节省约 50% 显存）；full_bf16/full_fp16 强制整个训练使用 bf16/fp16；注意力实现（flashattn/sageattn/sdpa/mem_eff_attn/split_attn）控制注意力计算的具体 kernel。',
    'effect': 'fp8_base = 基座以 FP8 存储，显存节省约 50%，有一定精度损失；flashattn = FlashAttention v2/v3（最快，需要特定 CUDA 版本）；sdpa = PyTorch 内置 scaled_dot_product_attention（默认，稳定）；sageattn = SageAttention（优化版本）。',
    'whenToUse': 'flashattn 在支持的环境下最推荐；sdpa 是最安全的通用选择；fp8_base 在极低显存场景（<10GB 训练 SDXL）时考虑。',
    'avoidWhen': 'fp8_base 有明显的精度损失，不建议用于需要高质量输出的训练；flashattn 安装复杂，遇到兼容性问题时改用 sdpa/xformers。'
  },
  'advanced': {
    'principle': 'FP8（8位浮点）有 e4m3 和 e5m2 两种：e4m3 精度更高（指数4位，尾数3位），e5m2 范围更大（通常用于梯度）。基座 FP8 量化：forward 时 dequantize（FP8→BF16），backward 梯度仍在 BF16，只有权重存储是 FP8。flashattn 通过 IO-aware 算法将注意力矩阵保留在 SRAM 中，避免 HBM 读写，对长序列效果最好。',
    'tradeoffs': 'FP8 训练目前只在 H100 等高端卡有完善支持；A100/A10 等卡 FP8 计算可能回退到 FP16/BF16 仿真（无实际加速）。'
  },
  'relatedConfigs': ['mixed_precision', 'xformers', 'gradient_checkpointing']
})

# ── 注意力模式 ────────────────────────────────────────────────────────────────

write('attn_mode.json', {
  'key': 'attn_mode',
  'title': '注意力模式',
  'category': '速度 / 注意力',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['cross_attn_fused_kv', 'fused_projection_memory_mode',
              'experimental_attention_profile_enabled', 'experimental_attention_profile_backend',
              'experimental_attention_profile_torch_max_tokens', 'experimental_attention_profile_window'],
  'standard': {
    'summary': '选择注意力计算的实现方式：sdpa（默认，PyTorch 内置）/ flash（FlashAttention）/ sage（SageAttention）/ xformers / vanilla（标准 PyTorch，最慢）。',
    'effect': 'flash/sage 速度最快，显存效率最高；sdpa 是稳健的通用选择；vanilla 是调试用最慢实现。cross_attn_fused_kv 将 cross-attention 的 K/V 融合投影，减少 kernel launch 次数。',
    'whenToUse': '优先使用 flash（已安装 flash-attention）或 sdpa（未安装 flash 时默认）。',
    'avoidWhen': 'vanilla 只用于调试；experimental_attention_profile 是性能分析工具，正式训练不需要。'
  },
  'advanced': {
    'principle': 'FlashAttention：IO-aware 分块计算，将 Q/K/V 分块加载到 SRAM，避免 n² 注意力矩阵 HBM 读写；SageAttention 进一步量化 QK 计算到 INT8，提升吞吐。fused_projection_memory_mode 控制 QKV 投影的内存布局（通道优先 vs 批量优先），影响 GPU L2 缓存命中率。',
    'tradeoffs': 'flash/sage 的加速主要来自长序列（高分辨率 latent，token 数 >256），短序列优势不明显。anima native runtime 的注意力实现在 Rust 侧（Python 是 shape-only stub），此参数影响 Python 侧的注意力（如 TE cross-attention）。'
  },
  'relatedConfigs': ['xformers', 'mixed_precision', 'compile_runtime']
})

# ── 基础 LoRA / 模型参数 ──────────────────────────────────────────────────────

write('pretrained_model_name_or_path.json', {
  'key': 'pretrained_model_name_or_path',
  'title': '基础模型路径',
  'category': '模型 / 基础',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'aliases': ['v2', 'model_train_type', 'base_weights', 'base_weights_multiplier',
              'weights', 'dim_from_weights', 'num_vectors_per_token'],
  'standard': {
    'summary': '训练使用的基础模型文件路径（.safetensors / .ckpt）或 HuggingFace model ID。所有 LoRA 权重都基于此模型进行适配。',
    'effect': '不同的基础模型决定了 LoRA 的底层特性和生成风格基础。SD1.5 / SDXL / Anima / Flux 等不同架构需要对应路线的训练配置。',
    'whenToUse': '每次训练必须设置。路径支持本地绝对路径和 HuggingFace Hub 的模型 ID。',
    'avoidWhen': '基础模型路径错误会导致训练立即失败（文件不存在或格式不匹配）。确保模型格式与 model_train_type 匹配。'
  },
  'advanced': {
    'principle': 'v2 = 是否是 SD 2.x 系列（影响 CLIP tokenizer 和 UNet 架构的选择）；base_weights/multiplier 允许在基础模型上叠加额外的初始权重（如先加载一个已训练的 LoRA 作为起点）；dim_from_weights 从预加载权重文件推断 network_dim；num_vectors_per_token 是 textual inversion 专用（每个 token 的嵌入向量数）。',
    'tradeoffs': '从 HuggingFace Hub 加载需要网络连接（或预先下载缓存）；本地路径更可靠但需要手动管理文件。'
  },
  'relatedConfigs': ['network_dim', 'output_dir', 'mixed_precision']
})

# ── 训练噪声控制（剩余）──────────────────────────────────────────────────────

write('ip_noise_gamma.json', {
  'key': 'ip_noise_gamma',
  'title': 'Input Perturbation 噪声',
  'category': '训练 / 噪声控制',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'aliases': ['ip_noise_gamma_random_strength', 'noise_offset_random_strength', 'noise_offset_type',
              'alpha_mask', 'color_aug', 'random_crop'],
  'standard': {
    'summary': 'IP（Input Perturbation）噪声：在训练时对输入添加额外扰动，提升模型对噪声的鲁棒性。ip_noise_gamma 控制扰动强度；ip_noise_gamma_random_strength 开启随机化强度。',
    'effect': '相比 noise_offset（全局亮度偏移），IP 噪声是更通用的输入扰动，从不同方向增加训练数据多样性。alpha_mask 使用图像 Alpha 通道作为 loss 掩码（只计算非透明区域的 loss）。color_aug 启用色彩数据增强（随机调整亮度/饱和度等）。random_crop 随机裁剪代替固定中心裁剪。',
    'whenToUse': 'alpha_mask 适合透明背景训练数据（角色切图）；color_aug 和 random_crop 是通用数据增强，小数据集时特别有效。',
    'avoidWhen': 'ip_noise 值过大（>0.1）会引入过多噪声干扰，降低训练质量；alpha_mask 要求所有训练图像有 Alpha 通道（PNG 格式，背景透明）。'
  },
  'advanced': {
    'principle': 'IP 噪声：x_noisy = x_t + gamma × N(0, I)，在标准加噪步骤的噪声上再叠加一层扰动。这与 noise_offset（改变全局亮度偏移）不同：IP 噪声改变整体噪声强度但不改变噪声方向。alpha_mask：loss = mean(mask × (pred - target)²) / mean(mask)，只对 Alpha>0 的像素计算 loss。',
    'tradeoffs': 'color_aug 和 random_crop 增加数据多样性但改变了每个 epoch 的训练样本分布，与缓存训练（cache_latents）存在矛盾（缓存是固定的，增强是动态的）——开启增强时应关闭 latent 缓存。'
  },
  'relatedConfigs': ['noise_offset', 'cache_latents', 'resolution']
})

# ── 训练细节控制 ──────────────────────────────────────────────────────────────

write('keep_tokens_separator.json', {
  'key': 'keep_tokens_separator',
  'title': '触发词保护分隔符',
  'category': '数据集 / 图说',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'aliases': ['shuffle_caption_tags_only', 'weighted_captions', 'token_string',
              'init_word', 'use_object_template', 'use_style_template',
              'positive_prompts', 'negative_prompts', 'prompt_file',
              'randomly_choice_prompt', 'random_prompt_include_subdirs'],
  'standard': {
    'summary': '控制训练时图说处理的细节：keep_tokens_separator 指定触发词区域的分隔符（该分隔符前的 token 在 shuffle 时固定不变）；weighted_captions 支持带权重的图说格式（如 (tag:1.5)）。',
    'effect': 'keep_tokens_separator（如 "|||"）让分隔符前的 token 保持固定顺序（通常是触发词），分隔符后的 tag 可以 shuffle；weighted_captions 允许对特定 tag 设置权重影响其学习强度。',
    'whenToUse': '触发词 + 描述性 tag 混合的图说格式时使用 keep_tokens_separator 保护触发词不被 shuffle 打乱；有权重图说时启用 weighted_captions。',
    'avoidWhen': '纯自然语言图说（非 tag 格式）不适合 shuffle 相关设置；token_string 和 init_word 是 textual inversion 专用，LoRA 训练不需要。'
  },
  'advanced': {
    'principle': 'keep_tokens_separator 在 caption 按 "," 分割为 tag 列表时，标记固定区域（不参与 shuffle）和随机区域的边界。用于保证触发词始终在 caption 前部（CLIP 对早期 token 权重略高）。weighted_captions 解析 (word:weight) 格式，根据权重缩放对应 token 的 embedding。',
    'tradeoffs': '使用分隔符保护触发词时，所有训练图的 caption 格式必须一致（都有分隔符且分隔符位置固定），否则部分图的触发词仍可能被 shuffle。'
  },
  'relatedConfigs': ['caption_shuffle_strategy', 'caption_source_trigger_tokens', 'caption_tag_dropout_rate']
})

# ── 模型加载 / 恢复 ───────────────────────────────────────────────────────────

write('resume.json', {
  'key': 'resume',
  'title': '恢复训练',
  'category': '训练 / 恢复',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'aliases': ['initial_epoch', 'initial_step', 'skip_until_initial_step', 'save_state_on_train_end'],
  'standard': {
    'summary': '从之前的训练状态恢复：resume 指定状态文件路径（包含优化器状态、步数等）；initial_step/epoch 指定从第几步/epoch 开始计数。',
    'effect': 'resume 加载完整训练状态（不只是 LoRA 权重，还包含优化器动量、调度器状态）；save_state_on_train_end 在训练结束时额外保存完整状态以备未来恢复。',
    'whenToUse': '训练意外中断（断电/崩溃）后恢复，或需要在已有训练基础上继续训练时使用 resume。',
    'avoidWhen': '与 network_weights（只加载 LoRA 权重，不加载优化器状态）区分：resume 是完整恢复（包括 LR 调度状态），network_weights 是 warm start（从已有 LoRA 权重重新开始训练）。'
  },
  'advanced': {
    'principle': '训练状态包含：模型权重（LoRA A/B）+ 优化器状态（m/v momentum）+ 调度器状态（当前步数/LR）。resume 从这个完整 checkpoint 恢复，skip_until_initial_step 允许从恢复点开始跳过前 N 步（用于快速跳到某个检查点继续）。',
    'tradeoffs': '完整状态文件约为 LoRA 文件的 3~5×（优化器动量额外占用）；每步保存一次状态会极大占用磁盘。建议配合 save_every_n_steps 间隔保存，只保留几个状态 checkpoint。'
  },
  'relatedConfigs': ['network_weights', 'save_state_on_train_end', 'output_dir']
})

# ── 采样时间步 ────────────────────────────────────────────────────────────────

write('timestep_sampling.json', {
  'key': 'timestep_sampling',
  'title': '时间步采样策略',
  'category': '训练 / 时间步',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['timestep_sampling_mode', 'timestep_segments', 'min_timestep', 'max_timestep',
              'mode_scale', 'bypass_mode'],
  'standard': {
    'summary': '控制训练时如何采样噪声时间步（timestep）：uniform（均匀）/ logit_normal（对数正态，推荐）/ sigma_sqrt（平方根加权）/ mode（峰值采样）。',
    'effect': 'logit_normal 集中采样中等噪声步（最常用）；uniform 每个时间步等概率（标准实现）；sigma_sqrt 偏向高噪声步（学习全局结构）；mode 在特定峰值周围采样（配合 mode_scale）。',
    'whenToUse': 'logit_normal 是 Flux/Anima 等新架构的推荐选择，比 uniform 有更好的训练效率。SD1.5/SDXL 通常保持 uniform。',
    'avoidWhen': 'min_timestep/max_timestep 裁剪时间步范围时需要谨慎：去掉高噪声步（>900）会影响全局结构学习；去掉低噪声步（<100）会影响细节学习。'
  },
  'advanced': {
    'principle': '训练 loss 在不同时间步（噪声级别）的信息量分布不均：中等噪声步包含最多语义信息（高 SNR）。logit_normal 通过非均匀采样将更多训练资源集中在信息量最大的区域。bypass_mode 在特定实现中跳过时间步嵌入，直接使用原始 sigma 值（适合某些特殊架构）。timestep_segments 将时间步空间分段，允许对每段设置不同采样权重。',
    'tradeoffs': 'logit_normal 的 sigma_scale 参数影响集中程度（见 anima_sigmoid_scale）；与 P2 weighting / scale_guidance 存在功能重叠，避免多种时间步加权机制叠加使用。'
  },
  'relatedConfigs': ['anima_weighting_scheme', 'anima_sigmoid_scale', 'p2_weighting_enabled']
})

# ── 高级诊断 / 监控 ───────────────────────────────────────────────────────────

write('advanced_stats_enabled.json', {
  'key': 'advanced_stats_enabled',
  'title': '高级统计监控',
  'category': '训练 / 诊断',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['layer_monitor_enabled', 'layer_monitor_mode', 'step_phase_profile_enabled',
              'deep_diagnostics_enabled', 'fim_scan_enabled', 'fim_scan_tool',
              'data_transfer_profile_enabled', 'data_transfer_profile_mode', 'data_transfer_profile_window',
              'forgetting_probe_enabled', 'bubble_controller_allow_optimizer_swap'],
  'standard': {
    'summary': '高级训练诊断工具集：advanced_stats 记录梯度范数/权重范数/更新比等统计；layer_monitor 逐层监控；step_phase_profile 分析每步各阶段耗时；deep_diagnostics 深度诊断模式。',
    'effect': '开启后在训练日志或 WandB 中显示额外统计指标，帮助诊断训练问题（过拟合/梯度消失/I/O 瓶颈等）。',
    'whenToUse': '训练表现异常（loss 不下降/爆炸/速度慢）时开启对应诊断工具定位问题。正常训练无需开启（额外开销）。',
    'avoidWhen': '所有诊断工具都有不同程度的性能开销（约 1%~10%），不应在追求训练速度时常驻开启。'
  },
  'advanced': {
    'principle': 'fim_scan（Fisher Information Matrix 扫描）估计各参数的重要性（对 loss 的 sensitivity），用于判断哪些层值得使用更高 rank；forgetting_probe 定期评估模型对预训练能力的遗忘程度；bubble_controller 检测并控制优化器的 bubble（无效更新步骤）。layer_monitor 的 mode 控制监控粒度（block/layer/sublayer）。',
    'tradeoffs': 'FIM 扫描需要多次 forward pass（估计 Fisher），开销与参数量成正比；layer_monitor 的详细模式需要每层 hook，累积开销随网络深度增加。'
  },
  'relatedConfigs': ['wandb_api_key', 'turbocore_profile', 'peak_vram_diagnostics_enabled']
})

# ── Optimizer 预设 / 状态分页 ─────────────────────────────────────────────────

write('optimizer_preset.json', {
  'key': 'optimizer_preset',
  'title': '优化器预设',
  'category': '训练 / 优化器',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['optimizer_state_paging_min_tensor_mb', 'optimizer_state_paging_pin_memory',
              'newbie_auto_swap_release'],
  'standard': {
    'summary': '优化器快速预设方案：选择已调优的优化器 + 学习率 + beta 参数组合，无需手动配置每个参数。',
    'effect': '根据训练目标（稳定收敛/快速收敛/低显存）选择预设，自动填充 optimizer_type / optimizer_backend / weight_decay 等参数。optimizer_state_paging 将优化器状态（动量）分页卸载到 CPU，节省显存。',
    'whenToUse': '不确定优化器参数时使用预设作为起点；optimizer_state_paging 在 AdamW 优化器状态占用显著时（>2GB）且 CPU RAM 充足时开启。',
    'avoidWhen': '有精细调参需求时不使用预设（预设优先级低于手动设置）；state_paging 增加 CPU-GPU 数据交换开销，建议先用 AdamW8bit（原生省显存）。'
  },
  'advanced': {
    'principle': 'optimizer_state_paging：将优化器动量 tensor（m/v）分页到 CPU，大于 min_tensor_mb 的 tensor 才分页（避免小 tensor 频繁传输）；pin_memory 使用 CPU 固定内存（page-locked），加速 GPU-CPU 传输。newbie_auto_swap_release 是新手模式特有的自动 block swap 管理（自动决定何时释放换出的 block）。',
    'tradeoffs': 'optimizer_state_paging 的 pin_memory=True 会占用更多 CPU RAM（固定内存），但传输速度约快 2×；min_tensor_mb 设置过小会导致大量小 tensor 频繁传输（反而更慢）。'
  },
  'relatedConfigs': ['optimizer_type', 'optimizer_backend', 'anima_block_prefetch']
})

# ── 杂项字段 ──────────────────────────────────────────────────────────────────

write('clear_dataset_npz_before_train.json', {
  'key': 'clear_dataset_npz_before_train',
  'title': '训练前清除缓存',
  'category': '数据集 / 缓存',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'aliases': ['persistent_data_loader_workers', 'cached_collate_mode', 'bucket_selection_mode',
              'image_decode_backend', 'image_decode_cache_size'],
  'standard': {
    'summary': 'clear_dataset_npz_before_train = 开始训练前删除旧的 .npz 缓存文件，强制重新生成（当数据集图像已更新时使用）。',
    'effect': '防止数据集更改后训练器仍使用旧缓存（旧缓存与新图像不匹配）。persistent_data_loader_workers 让 DataLoader worker 进程在 epoch 间保持存活（避免重复启动开销）。image_decode_backend 控制图像解码库（PIL/cv2/libjpeg-turbo）。',
    'whenToUse': '修改了训练数据集图像内容后开启 clear；数据加载速度慢时尝试 persistent_workers=True 和 image_decode_cache。',
    'avoidWhen': '数据集未修改时不要开启 clear（浪费重新生成时间）；persistent_workers 在显存有限时可能额外占用 CPU 内存。'
  },
  'advanced': {
    'principle': '.npz 缓存以图像文件名 + 分辨率为键（不包含图像内容 hash），所以图像内容更改但文件名不变时，缓存不会自动失效。clear_before_train 是手动失效机制。bucket_selection_mode 控制 Bucket 分桶算法（按总像素/按短边/按长边等不同策略）。',
    'tradeoffs': 'persistent_data_loader_workers=True 会让 worker 进程长期存活（占用约 200MB~1GB 额外内存），但消除了每 epoch 重启 worker 的开销（约 2~10 秒）。'
  },
  'relatedConfigs': ['cache_latents', 'enable_bucket', 'train_data_dir']
})

write('scale_weight_norms.json', {
  'key': 'scale_weight_norms',
  'title': '权重范数缩放',
  'category': 'LoRA / 训练控制',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'aliases': ['block_merge_size', 'bypass_mode', 'down_lr_weight', 'mid_lr_weight', 'up_lr_weight',
              'disable_mmap_load_safetensors', 'no_metadata', 'training_comment'],
  'standard': {
    'summary': '对 LoRA 权重矩阵的 Frobenius 范数进行软约束（Max Norm regularization），防止权重无限增大。与 weight_decay 互补。',
    'effect': '设为正数（如 1.0）时，若权重矩阵范数超过该值则按比例缩放。对防止过拟合有帮助，但不如 weight_decay 那么系统性。',
    'whenToUse': '训练后期 LoRA 权重范数持续增大时（通过 advanced_stats 监控）可以开启。',
    'avoidWhen': '与 weight_decay 同时使用时有功能重叠，通常选一种即可。'
  },
  'advanced': {
    'principle': 'Max Norm：对每个权重矩阵 W，若 ‖W‖_F > scale_weight_norms，则 W = W × (scale / ‖W‖_F)。等价于投影到范数球内。与 weight_decay（每步乘以 1-lr×wd 的硬约束）相比，max norm 是软约束（只在超出时才生效）。down/mid/up_lr_weight 是 SDXL/SD UNet 各段的学习率权重（与 lulynx_block_weight 类似但直接命名）。disable_mmap_load_safetensors 关闭 safetensors 的 mmap 加载（某些 NFS 挂载或 Windows 兼容性问题时需要）。no_metadata 不在输出文件中写入训练元数据（隐私场景）。training_comment 写入到输出文件的元数据注释字段。',
    'tradeoffs': 'Max Norm 对全精度（fp32）权重效果更显著；在混合精度训练中，只有主权重（fp32 copy）受约束，fp16 副本由 GradScaler 管理。'
  },
  'relatedConfigs': ['weight_decay', 'max_grad_norm', 'network_dim']
})

# ── 杂项 2 ────────────────────────────────────────────────────────────────────

write('logging_dir.json', {
  'key': 'logging_dir',
  'title': '日志目录',
  'category': '训练 / 日志',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'aliases': ['log_prefix', 'log_tracker_name', 'log_tracker_config',
              'pytorch_cuda_expandable_segments', 'cuda_cache_release_interval', 'cuda_cache_release_strategy',
              'gloo_socket_ifname', 'nccl_socket_ifname', 'machine_rank'],
  'standard': {
    'summary': '训练日志文件（TensorBoard 格式）的保存目录。pytorch_cuda_expandable_segments 优化 CUDA 内存分配策略，cuda_cache_release 控制 CUDA 缓存释放频率。',
    'effect': 'logging_dir 设置后可以用 tensorboard --logdir 查看训练曲线；pytorch_cuda_expandable_segments=True 允许 CUDA 分配器动态扩展内存段，减少碎片；cuda_cache_release 定期调用 torch.cuda.empty_cache()（通常不需要，PyTorch 自动管理）。',
    'whenToUse': 'logging_dir 在需要 TensorBoard 可视化时设置；pytorch_cuda_expandable_segments=True 在显存碎片严重（OOM 但 reserved >> allocated）时尝试。',
    'avoidWhen': 'cuda_cache_release 频率过高会在 empty_cache 时引入额外同步开销；通常 PyTorch 的自动内存管理已足够好，不需要手动干预。'
  },
  'advanced': {
    'principle': 'pytorch_cuda_expandable_segments：新的 CUDA 内存分配器策略（PyTorch 2.0+），允许将已分配的内存段动态扩展（而非固定大小段），减少因碎片导致的 OOM（reserved 高但无法分配连续内存的场景）。gloo/nccl_socket_ifname 指定分布式训练的网络接口，多机训练时防止使用错误的网卡（如 loopback 接口）。',
    'tradeoffs': 'expandable_segments 在某些 CUDA 版本（<12.0）下可能有兼容性问题；分布式训练的 socket_ifname 错误配置会导致节点间通信失败（报 timeout 错误）。'
  },
  'relatedConfigs': ['wandb_api_key', 'output_dir', 'num_processes']
})

# ── QR3 / Qwen3 / T5 ─────────────────────────────────────────────────────────

write('qwen3.json', {
  'key': 'qwen3',
  'title': 'Qwen3 LLM 路径',
  'category': '模型 / 文本编码器',
  'appliesTo': ['anima-lora'],
  'aliases': ['qwen3_max_token_length', 't5_max_token_length', 't5_tokenizer_path',
              'llm_adapter_path', 'text_encoder_batch_size'],
  'standard': {
    'summary': 'Anima 使用的文本编码器（LLM）配置：qwen3 指定 Qwen3 模型路径（Anima 的主文本编码器）；t5 参数配置 T5 编码器（备用或联合编码器）；text_encoder_batch_size 控制文本编码的 batch 大小（影响预缓存速度）。',
    'effect': 'qwen3_max_token_length 限制文本编码的最大 token 数（超出截断）；t5_max_token_length 同理。llm_adapter_path 指定预训练的 LLM Adapter 权重（若有）。',
    'whenToUse': '通常保持默认（使用 Anima 内置的 LLM 配置）。只有需要替换 LLM 路径或调整 token 限制时才手动设置。',
    'avoidWhen': 'qwen3_max_token_length 设置过短会截断长描述，导致后半部分文本完全丢失；过长则增加内存和计算开销（注意力复杂度 O(n²)）。'
  },
  'advanced': {
    'principle': 'Anima 的双编码器架构：Qwen3（主 LLM，处理完整自然语言描述）+ T5（辅助，处理结构化描述）。两路 embedding 通过 cross-attention 共同条件化 DiT 的生成过程。text_encoder_batch_size 在预缓存阶段控制每次 LLM 推理处理多少个 caption（不影响训练 batch）。',
    'tradeoffs': 'Qwen3 的 max_token_length 设置影响显存：4096 token 的 attention 是 256 token 的 16× 显存（O(n²)）。实践中 512~1024 token 的自然语言描述已经足够详细，2048+ 一般不需要。'
  },
  'relatedConfigs': ['anima_train_llm_adapter', 'anima_cache_llm_adapter_outputs', 'train_text_encoder']
})

# ── Delta LoRA / Hybrid ────────────────────────────────────────────────────────

write('delta_lora_enabled.json', {
  'key': 'delta_lora_enabled',
  'title': 'Delta-LoRA',
  'category': 'LoRA 变体 / Delta',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['hydralora_balance_loss_weight', 'tensorring_lora_enabled', 'flexrank_lora_rank_range_min',
              'fractional_grad_damping_enabled', 'grad_cosine_enabled', 'lora_type',
              'lora_activation_recompute_mode', 'lokr_factor',
              'loftq_bits', 'loftq_quant_type'],
  'standard': {
    'summary': '多种 LoRA 变体汇总：Delta-LoRA（更新差分优化）/ HydraLoRA（多头 LoRA，平衡不同特征）/ TensorRing（张量环 LoRA）/ FlexRank（弹性秩）/ LoftQ（量化初始化）/ LoKr（Kronecker 分解）。',
    'effect': '各变体在标准 LoRA 基础上提供不同的参数效率或正则化特性：Delta-LoRA 优化 LoRA 的更新增量；HydraLoRA 多分支学习不同特征方向；LoftQ 为量化基座模型提供优化初始化；LoKr 使用 Kronecker 分解。',
    'whenToUse': '各变体均为实验性功能，需要根据具体任务对比测试。大多数场景标准 LoRA 已经足够，只有明确的参数效率或质量需求时才尝试变体。',
    'avoidWhen': '这些变体通常不与推理框架（A1111/ComfyUI）的标准 LoRA 加载器兼容，使用前确认推理端支持该变体格式。'
  },
  'advanced': {
    'principle': 'Delta-LoRA：只更新 LoRA 增量方向（∆W），固定 A/B 矩阵的乘积方向；HydraLoRA：多个 A 矩阵共享一个 B 矩阵（或反之），每个 A 学习不同特征子空间；LoftQ：先量化基座，再用 SVD 初始化 LoRA 补偿量化误差；lokr_factor 控制 LoKr 的 Kronecker 分解维度比例（通常为 ⌈√d_in⌉ × ⌈√d_out⌉）。fractional_grad_damping/grad_cosine 是梯度控制技术，通过阻尼或余弦相似性约束梯度更新方向。',
    'tradeoffs': '变体越复杂（如 TensorRing），与现有推理基础设施的兼容性越低，导出和部署成本越高。建议在实验阶段使用，产品化前确认端到端可用。'
  },
  'relatedConfigs': ['network_dim', 'pissa_init', 'krona_enabled', 'cdka_enabled']
})

# ── Coreset 采样 ──────────────────────────────────────────────────────────────

write('coreset_easy_weight.json', {
  'key': 'coreset_easy_weight',
  'title': 'Coreset 数据重要性采样',
  'category': '数据集 / 采样',
  'appliesTo': ['anima-lora'],
  'aliases': ['coreset_hard_weight'],
  'standard': {
    'summary': '（实验性）Coreset 采样：根据数据点对训练的"难易度"（loss 大小）差异化采样。hard 样本（loss 高）被采样更多次；easy 样本（loss 低）被采样更少次。',
    'effect': 'coreset_hard_weight 控制高 loss（难样本）的相对采样权重；easy_weight 控制低 loss（易样本）权重。有助于让训练聚焦于模型还未充分学习的样本。',
    'whenToUse': '实验性功能。数据集质量参差不齐（部分样本 loss 持续高）时可以用 coreset 提高对困难样本的关注度。',
    'avoidWhen': '数据集很小（<30张）时 loss 统计不稳定，coreset 权重误差大。loss 高的样本不一定是"重要"样本，可能是标注质量差的样本（此时增加采样反而有害）。'
  },
  'advanced': {
    'principle': 'Coreset 维护每个样本的历史 loss EMA，在 DataLoader 采样时按 loss 加权（高 loss → 高权重 → 更频繁采样）。hard_weight/easy_weight 控制高/低 loss 样本的相对采样倍率比。',
    'tradeoffs': 'Coreset 改变了数据集的采样分布（不再是均匀 i.i.d.），与标准 ERM（经验风险最小化）有理论偏差。对于小数据集 LoRA，数据多样性比重要性采样更重要。'
  },
  'relatedConfigs': ['train_data_dir', 'caption_tag_dropout_rate']
})

# ── 模型条件化 / ControlNet ───────────────────────────────────────────────────

write('conditioning_data_dir.json', {
  'key': 'conditioning_data_dir',
  'title': '条件化数据目录',
  'category': '训练 / 条件化',
  'appliesTo': ['sdxl-lora', 'anima-lora'],
  'aliases': ['controlnet_model_name_or_path', 'control_net_lr', 'model_to_condition_enabled',
              'diff_target_name', 'target_image_path', 'target_prompt',
              'original_image_path', 'original_prompt', 'dop_weight', 'dpo_weight'],
  'standard': {
    'summary': '条件化训练相关设置：conditioning_data_dir 包含条件图像（如边缘图、深度图）；controlnet_model_name_or_path 指定 ControlNet 模型路径；diff 系列参数用于差异对比训练。',
    'effect': '条件化训练允许同时学习原始概念和条件化生成（如同时学习角色外观和对应的边缘图条件）。dop_weight/dpo_weight 控制不同目标的损失权重。',
    'whenToUse': '需要训练 ControlNet LoRA 或条件化 LoRA 时使用。大多数标准 LoRA 训练不需要条件化数据。',
    'avoidWhen': '不需要条件化生成时不要设置（增加复杂度和计算量）。'
  },
  'advanced': {
    'principle': 'ControlNet LoRA 在标准 LoRA 基础上额外学习条件化控制：condition_image → ControlNet encoder → 条件特征注入 UNet/DiT。diff_target 系列用于"差分微调"（PALP/Custom Diffusion 等方法的实现）：对比 target（新概念）和 original（基础概念），只保留差异方向的更新。',
    'tradeoffs': '条件化训练需要额外准备条件图像数据集（与训练图像对应的边缘图/深度图等），数据准备工作量是主要障碍。'
  },
  'relatedConfigs': ['pretrained_model_name_or_path', 'network_dim', 'learning_rate']
})

# ── LyCORIS 特定 ─────────────────────────────────────────────────────────────

write('max_bucket_reso.json', {
  'key': 'max_bucket_reso',
  'title': 'Bucket 最大分辨率',
  'category': '数据集 / 分辨率',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'aliases': ['min_bucket_reso', 'num_vectors_per_token', 'training_comment',
              'ephemeral_preview_pipeline', 'preview_device', 'preview_groups'],
  'standard': {
    'summary': 'Bucket 训练的分辨率范围：max_bucket_reso 设置最大分辨率（超过的图像不会放入更大的桶而是缩小）；min_bucket_reso 设置最小分辨率（低于的图像按需放大或丢弃）。',
    'effect': '限制分辨率范围可以控制训练的显存使用上限（max）和确保训练分辨率不会过低（min）。',
    'whenToUse': 'max_bucket_reso 在数据集包含超高分辨率图像时防止 OOM；min_bucket_reso 在数据集包含低分辨率图像时避免无效训练。',
    'avoidWhen': '与 resolution（全局目标分辨率）重复设置时，max/min 是 bucket 分组的上下界，resolution 是理想桶面积目标，两者共同约束。'
  },
  'advanced': {
    'principle': 'Bucket 算法在 [min_bucket_reso, max_bucket_reso] 范围内枚举所有可能的 bucket 尺寸，步长为 bucket_reso_steps。超出范围的图像会被缩放到范围边界最近的 bucket。',
    'tradeoffs': 'max/min 设置过紧（范围太小）会导致大量图像被强制缩放（偏离原始比例），可能影响训练质量。'
  },
  'relatedConfigs': ['enable_bucket', 'resolution', 'bucket_reso_steps']
})

print('批次8 全部条目完成')
