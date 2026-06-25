"""
批量生成 Anima 专用 / Loss 调度器 / 前沿储备字段 wiki entries
运行: python tools/gen_wiki_batch5.py
"""
import json, os

ENTRIES_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'training-wiki', 'entries')

def write(name, data):
    path = os.path.join(ENTRIES_DIR, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'  wrote {name}')

# ── Anima 专用字段 ────────────────────────────────────────────────────────────

write('anima_weighting_scheme.json', {
  'key': 'anima_weighting_scheme',
  'title': 'Anima 训练步权重方案',
  'category': '训练 / Anima 专用',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '控制不同噪声时间步（timestep）对 loss 的贡献权重。不同权重方案让训练聚焦于不同粒度的特征学习。',
    'effect': 'uniform = 所有时间步等权（最简单）；logit_normal = 中等噪声步权重更高（聚焦中频特征）；sigma_sqrt = 基于 sigma 值的平方根加权（聚焦高噪声步）。',
    'whenToUse': 'logit_normal 是 Anima/Flux 等新架构的推荐方案，平衡细节和结构学习。uniform 适合调试时使用（与基础实现最接近）。',
    'avoidWhen': '不了解各方案差异时，保持默认（logit_normal）即可，已经过调优。'
  },
  'advanced': {
    'principle': '训练 loss = E_t[w(t) × ||ε_θ(x_t,t) - ε||²]。权重函数 w(t) 决定模型优化的优先方向：低噪声步（精细细节）vs 高噪声步（全局结构）。logit_normal 通过对数正态分布集中采样中等噪声，等效于关注语义级特征。',
    'tradeoffs': 'sigma_sqrt 偏重高噪声步，可能导致全局结构学习更充分但细节稍弱；logit_normal 是当前 SOTA 扩散模型训练的主流选择。'
  },
  'relatedConfigs': ['anima_sigmoid_scale', 'anima_guidance_scale']
})

write('anima_guidance_scale.json', {
  'key': 'anima_guidance_scale',
  'title': 'Anima 训练 CFG 引导强度',
  'category': '训练 / Anima 专用',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '训练时使用的 CFG（Classifier-Free Guidance）强度。Anima 使用条件/无条件交替训练，此值控制训练时的引导程度。',
    'effect': '值越高，有条件生成和无条件生成的分离越大；0 = 纯无条件训练；1 = 纯条件训练。',
    'whenToUse': '保持默认值（通常 1.0 或模型推荐值）。调整此值需要深入理解 CFG 训练动力学。',
    'avoidWhen': '不了解 CFG 训练机制时不要随意修改，可能导致训练分布与推理分布不匹配。'
  },
  'advanced': {
    'principle': 'Anima 的训练包含条件和无条件两种路径，guidance_scale 控制两者的混合比例。高 CFG 训练 → 推理时 CFG 引导效果更强，但无条件能力可能变弱。',
    'tradeoffs': '训练 CFG 与推理 CFG 应保持一致或接近，否则会产生训练-推理分布不匹配（train-inference gap）。'
  },
  'relatedConfigs': ['anima_weighting_scheme', 'anima_sigmoid_scale']
})

write('anima_sigmoid_scale.json', {
  'key': 'anima_sigmoid_scale',
  'title': 'Anima Sigmoid 时间步缩放',
  'category': '训练 / Anima 专用',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '控制 logit_normal 时间步采样的 sigmoid 缩放系数，决定采样分布的集中程度（宽/窄）。',
    'effect': '值越大，采样越集中于中等噪声步（中频特征）；值越小，采样分布越宽（覆盖更多极端时间步）。',
    'whenToUse': '配合 anima_weighting_scheme=logit_normal 使用，通过调整此值控制训练的"频率偏好"。',
    'avoidWhen': '不使用 logit_normal 权重方案时此参数无效。'
  },
  'advanced': {
    'principle': '时间步采样：t ~ sigmoid(σ × N(0,1))，σ 即 sigmoid_scale。σ 越大，采样越集中于 t=0.5（中等噪声）；σ=1 时接近均匀分布。',
    'tradeoffs': '集中采样中等噪声步有助于学习语义级特征，但可能欠拟合极端（纯噪声 / 纯干净）时间步的分布，影响全局结构或细节极端情况。'
  },
  'relatedConfigs': ['anima_weighting_scheme', 'anima_guidance_scale']
})

write('anima_fixed_visual_tokens.json', {
  'key': 'anima_fixed_visual_tokens',
  'title': 'Anima 固定视觉 Token 数',
  'category': '训练 / Anima 专用',
  'appliesTo': ['anima-lora'],
  'aliases': ['anima_fixed_text_tokens'],
  'standard': {
    'summary': '将训练的视觉 token（图像 patch 序列）长度固定为指定值，避免因批内图像尺寸不同导致的变长序列重编译开销。',
    'effect': '固定后所有 batch 使用相同序列长度（不足的填 padding），torch.compile 可以稳定工作而不频繁重编译。',
    'whenToUse': '开启 torch.compile 时推荐同时固定 token 数以获得稳定的编译加速。',
    'avoidWhen': '数据集图像尺寸差异极大时，固定 token 数会浪费 padding 显存（对最大图像外的其他图像）。'
  },
  'advanced': {
    'principle': 'Anima DiT 的 forward 接受变长 token 序列；固定后统一填充到 max_len，Dynamo 可以编译固定形状的计算图，避免每个新形状触发重编译（graph break）。',
    'tradeoffs': '固定到最大尺寸会浪费小图的计算（padding 位置的计算是无效的），但配合 attention mask 可以避免 padding 影响结果。'
  },
  'relatedConfigs': ['torch_compile', 'compile_runtime', 'anima_block_checkpointing']
})

write('anima_cached_training.json', {
  'key': 'anima_cached_training',
  'title': 'Anima 缓存训练模式',
  'category': '速度 / Anima 专用',
  'appliesTo': ['anima-lora'],
  'aliases': ['anima_online_cache', 'anima_cache_mode', 'anima_vae_disable_cache',
              'anima_cache_text_encoder_outputs_to_disk', 'anima_cached_latent_crop_size'],
  'standard': {
    'summary': 'Anima 的缓存训练模式：将 VAE 编码后的 latent 和 LLM 文本特征预先缓存到磁盘，训练时直接加载，跳过每步的 VAE/LLM 推理，大幅提升训练速度。',
    'effect': '开启后首次运行会预生成缓存文件（较慢），之后每个 epoch 的 VAE/LLM 推理时间几乎为 0，训练速度提升 20%~50%（取决于 batch size 和模型大小）。',
    'whenToUse': '数据集固定（不动态增强 latent）时强烈推荐开启，尤其是多 epoch 训练（缓存只需生成一次）。',
    'avoidWhen': '数据集有动态增强（每 epoch 随机裁剪/翻转影响 latent）时缓存会不准确；或首次运行磁盘空间不足时。'
  },
  'advanced': {
    'principle': '训练前对所有图像运行 VAE encoder 并将 latent 保存为 .npz 文件；对所有 caption 运行 LLM/CLIP 并保存文本 embedding。训练时 DataLoader 直接读取缓存，跳过 VAE/LLM 推理（这部分约占每步时间的 10%~30%）。',
    'tradeoffs': '缓存大小 ≈ 数据量 × latent 维度 × 数据类型大小。对于 1000 张 1024×1024 图像，latent 缓存约 1~5GB；文本缓存较小。lossless 缓存格式（lxfs）可提供更快的读取速度。'
  },
  'relatedConfigs': ['cache_latents', 'cache_latents_to_disk', 'lossless_cache_replacement_mode']
})

write('anima_fused_qkv.json', {
  'key': 'anima_fused_qkv',
  'title': 'Anima Fused QKV',
  'category': '速度 / Anima 专用',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '将 Q、K、V 三个线性投影合并为一个融合矩阵乘法操作，减少 CUDA kernel launch 次数，提升注意力计算效率。',
    'effect': '开启后 QKV 投影通过一次矩阵乘法完成（而非三次），减少 kernel launch 开销约 30%，提升总体训练速度约 2~5%。',
    'whenToUse': '默认应尝试开启（若模型支持），对 Anima 架构的 native forward 有优化效果。',
    'avoidWhen': '模型的 QKV 权重未融合时（需要 weight merging 操作），或 LoRA 注入方式与 fused QKV 不兼容时会自动 fallback。'
  },
  'advanced': {
    'principle': 'Fused QKV 将 W_Q, W_K, W_V 沿 head 维度拼接为一个 W_QKV，单次矩阵乘法 xW_QKV 得到 QKV 拼接结果，再 chunk 分割。减少内存读写次数（W_Q/K/V 分别读取 → 一次读取 W_QKV）。',
    'tradeoffs': 'LoRA 注入 fused QKV 时需要特殊处理（拼接 LoRA 权重对应维度），部分 LoRA 实现可能与之不兼容，遇到问题时关闭。'
  },
  'relatedConfigs': ['anima_fixed_visual_tokens', 'torch_compile']
})

write('anima_compile_scope.json', {
  'key': 'anima_compile_scope',
  'title': 'Anima Compile 范围',
  'category': '速度 / Anima 专用',
  'appliesTo': ['anima-lora'],
  'aliases': ['compile_anima_full_core_enabled', 'compile_cache_enabled', 'compile_cache_prewarm'],
  'standard': {
    'summary': '控制 torch.compile 应用于 Anima 模型的哪些部分：block（逐 block 编译）/ full_core（编译整个 DiT 核心）/ off（不编译）。',
    'effect': 'block = 更细粒度，兼容性好；full_core = 更大编译单元，理论更快但对动态分支敏感；off = 不编译，最安全。',
    'whenToUse': '长训练（>200步）推荐尝试 block 模式。full_core 在确认无 graph break 后可获得更大加速。',
    'avoidWhen': '短训练或调试时保持 off。full_core 遇到动态分支（如 LoRA hook）可能频繁 graph break，实际比 block 更慢。'
  },
  'advanced': {
    'principle': 'compile_cache 将编译结果缓存到磁盘（通常 ~/.cache/torch_compile），下次相同代码和参数时直接加载编译结果，跳过编译时间。compile_cache_prewarm 在首步训练前主动触发编译并填充缓存。',
    'tradeoffs': '缓存编译结果依赖代码未改变（代码变更后缓存失效）；prewarm 增加首步等待时间但让第一步训练立即享受编译加速。'
  },
  'relatedConfigs': ['torch_compile', 'compile_runtime', 'dynamo_backend']
})

write('anima_train_llm_adapter.json', {
  'key': 'anima_train_llm_adapter',
  'title': '训练 LLM Adapter',
  'category': '训练 / Anima 专用',
  'appliesTo': ['anima-lora'],
  'aliases': ['anima_llm_adapter_lr', 'anima_cache_llm_adapter_outputs'],
  'standard': {
    'summary': '是否训练 Anima 中 LLM（大语言模型）部分的 Adapter 层，以增强文本理解和图文对齐能力。',
    'effect': '开启后 LLM Adapter 参与 LoRA 训练，可以更好地让 LLM 理解特定触发词或描述风格。显存增加约 10%~20%。',
    'whenToUse': '训练需要精确文本响应（如特定触发词绑定、复杂描述）时开启。',
    'avoidWhen': '数据集主要是风格/画风（对文本响应要求不高）时可关闭，节省显存和训练时间。'
  },
  'advanced': {
    'principle': 'Anima 的 LLM（如 T5/LLaMA）处理文本描述后输出 text embedding，LLM Adapter 是连接 LLM 输出与 DiT 条件输入的轻量模块。训练 Adapter 可以调整 LLM 的文本表征以更好地适配目标概念。',
    'tradeoffs': 'LLM Adapter 训练会改变 Anima 对所有 LLM 生成文本 embedding 的解读，若训练数据覆盖面窄（<50张），可能引入泛化性问题。'
  },
  'relatedConfigs': ['anima_cross_attn_lr', 'anima_mlp_lr', 'anima_self_attn_lr', 'anima_mod_lr']
})

write('anima_cross_attn_lr.json', {
  'key': 'anima_cross_attn_lr',
  'title': 'Anima Cross-Attn 学习率',
  'category': '训练 / Anima 专用',
  'appliesTo': ['anima-lora'],
  'aliases': ['anima_self_attn_lr', 'anima_mlp_lr', 'anima_mod_lr'],
  'standard': {
    'summary': '分别设置 Anima 各注意力类型（cross-attn / self-attn / mlp / modulation）的独立学习率，实现细粒度的学习率差异化控制。',
    'effect': '允许对不同功能的模块使用不同学习率：cross-attn 控制文本-图像对齐（通常需要更高 LR）；self-attn 控制图像内部结构（适当 LR）；MLP 控制局部变换（通常可以低 LR）。',
    'whenToUse': '有明确的训练目标（如只改文本响应 → 提高 cross-attn LR，降低 self-attn 和 MLP LR）时使用。高级调参场景。',
    'avoidWhen': '初学或不确定各模块分工时，保持各部分 LR 相同（或只设 global learning_rate）更安全。'
  },
  'advanced': {
    'principle': 'Anima 的 DiT block 分为几类参数组：cross-attn（文本条件输入）/ self-attn（图像自注意力）/ MLP（前馈网络）/ modulation（时间步条件调制），各自对训练的不同方面有独立影响。分别设置 LR 等价于 block weight 的 LR 版本。',
    'tradeoffs': '差异化 LR 需要对模型行为有深入理解；设置不当可能导致某部分过训练（如 cross-attn LR 过高导致文本绑定过强，生成失去灵活性）。'
  },
  'relatedConfigs': ['learning_rate', 'block_weight_preset', 'anima_train_llm_adapter']
})

write('anima_native_block_count.json', {
  'key': 'anima_native_block_count',
  'title': 'Anima Native Block 数',
  'category': '训练 / Anima 专用',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': 'Anima native DiT 路线使用的 block 数量，控制训练时激活的 transformer block 范围。',
    'effect': '通常由训练器自动推断，无需手动设置。修改可以限制 LoRA 注入的 block 范围。',
    'whenToUse': '高级调试场景，或需要只训练模型特定层级的 block 时。通常保持默认（自动推断）。',
    'avoidWhen': '不了解 Anima 架构时不要修改，错误值会导致 LoRA 注入范围错误。'
  },
  'advanced': {
    'principle': 'Anima native runtime 的 block 数由基座模型决定（如 28 个 transformer block）。此参数覆盖自动推断值，用于需要精确控制注入范围的场景。',
    'tradeoffs': '设置为比模型实际 block 数更小的值会导致最深层 block 不被训练，可能影响全局结构学习。'
  },
  'relatedConfigs': ['anima_block_prefetch', 'gradient_checkpointing']
})

write('anima_unsloth_offload.json', {
  'key': 'anima_unsloth_offload',
  'title': 'Unsloth 梯度卸载',
  'category': '速度 / Anima 专用',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '使用 Unsloth 风格的梯度卸载技术，在 backward 过程中将非必要的中间激活卸载到 CPU，进一步降低 VRAM 峰值。',
    'effect': '可以进一步节省 VRAM，使更大分辨率或更多 batch 的训练成为可能，代价是训练速度略有下降。',
    'whenToUse': '开启 gradient_checkpointing 和 block_prefetch 仍然 OOM 时的最后手段。',
    'avoidWhen': '显存充足时不建议使用（额外的 CPU-GPU 数据传输会降低训练速度）。'
  },
  'advanced': {
    'principle': 'Unsloth 方法在 backward 时主动将已完成 backward 的 block 权重卸载到 CPU，并在下一个 block 需要前预取回来，与计算重叠。等效于更细粒度的 gradient checkpointing + offload 组合。',
    'tradeoffs': '实现复杂，与某些 LoRA 实现可能有兼容性问题；建议先用官方 gradient_checkpointing 方案，确认不够用后再尝试此选项。'
  },
  'relatedConfigs': ['gradient_checkpointing', 'anima_block_prefetch', 'blocks_to_swap']
})

write('anima_rematerializable_block_enabled.json', {
  'key': 'anima_rematerializable_block_enabled',
  'title': 'Anima 可重物化 Block',
  'category': '速度 / Anima 专用',
  'appliesTo': ['anima-lora'],
  'aliases': ['anima_rematerializable_block_mode'],
  'standard': {
    'summary': '将特定 DiT block 标记为"可重物化"（rematerializable），允许在显存压力下按需放弃这些 block 的激活并在需要时重新计算，比 gradient checkpointing 更灵活。',
    'effect': '在显存充足时缓存激活（快速 backward）；显存紧张时丢弃激活并重算（节省显存），实现自适应显存管理。',
    'whenToUse': '动态显存需求变化较大时（如不同大小图像交替训练），自适应显存管理比固定 checkpoint 更高效。',
    'avoidWhen': '固定分辨率训练时，静态 gradient_checkpointing 通常更简单有效。'
  },
  'advanced': {
    'principle': '通过 torch 的 activation recomputation API 标记 block 为 rematerializable，PyTorch 内存管理器在 OOM 风险时自动触发重计算而非直接 OOM。比手动 checkpoint 更细粒度。',
    'tradeoffs': '自适应重物化的决策时机（何时触发重算）不完全可预测，可能在关键时刻引入额外计算延迟。'
  },
  'relatedConfigs': ['gradient_checkpointing', 'anima_block_prefetch']
})

write('anima_ema_feat_align_enabled.json', {
  'key': 'anima_ema_feat_align_enabled',
  'title': 'EMA 特征自蒸馏',
  'category': '前沿储备 / Anima',
  'appliesTo': ['anima-lora'],
  'aliases': ['anima_ema_feat_align_weight'],
  'standard': {
    'summary': '（实验性）使用 EMA 影子模型输出的特征作为教师信号，通过特征对齐 loss 约束主模型训练，类似知识蒸馏机制。',
    'effect': '开启后增加一个辅助 loss：主模型特征与 EMA 影子模型特征之间的 MSE 对齐。有助于稳定训练，防止训练偏离 EMA 太远。',
    'whenToUse': '实验性功能，适合研究探索。对特别长步数训练（>1000步）的稳定性有潜在收益。',
    'avoidWhen': '默认关闭。普通 LoRA 训练无需开启，增加的辅助 loss 会改变训练动力学。'
  },
  'advanced': {
    'principle': '维护一个 EMA 影子副本（decay=0.999），每步计算主模型和 EMA 模型在相同输入上的特征差（L2）作为 alignment_loss，权重 ema_feat_align_weight 控制其对总 loss 的影响。EMA 影子是一个"滑动平均的稳定版本"，作为教师引导主模型不要偏离太远。',
    'tradeoffs': '额外的 EMA forward pass 增加约 50% 显存（EMA 副本需要存储所有参数）和约 20% 计算量。权重设置不当（过大）会过度约束主模型的学习速度。'
  },
  'relatedConfigs': ['ema_enabled', 'ema_decay']
})

# ── Loss 调度器参数 ────────────────────────────────────────────────────────────

write('loss_scheduler_ema_alpha.json', {
  'key': 'loss_scheduler_ema_alpha',
  'title': 'Loss 调度器平滑系数',
  'category': '训练 / Loss 调度器',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['loss_scheduler_min_delta', 'loss_scheduler_relative_delta', 'loss_scheduler_patience',
              'loss_scheduler_cooldown', 'loss_scheduler_max_hold_steps',
              'loss_scheduler_late_gamma', 'loss_scheduler_lock_weight_threshold', 'loss_scheduler_min_advance_ratio'],
  'standard': {
    'summary': 'Loss 门控余弦（loss_gated_cosine）/ Loss 加权退火余弦（loss_weighted_annealed_cosine）调度器的 EMA 平滑系数，控制 loss 平滑度以过滤 batch 抖动。',
    'effect': '值越大（接近 1）= 对 loss 波动越不敏感，需要持续更长时间的下降才视为"有效下降"；值越小 = 响应更快但容易被噪声影响。',
    'whenToUse': '配合 loss_gated_cosine 或 loss_weighted_annealed_cosine 调度器使用，让调度器的「进退」决策基于平滑后的 loss，而非单步噪声。',
    'avoidWhen': '使用其他调度器（cosine_with_restarts / linear 等）时这些参数均无效。'
  },
  'advanced': {
    'principle': 'loss_ema = ema_alpha × loss_ema + (1-ema_alpha) × current_loss，用平滑 loss 替代原始 loss 做调度决策。min_delta / relative_delta 定义"有效下降"的阈值；patience 是连续多少次无效下降才推进余弦相位；cooldown 防止来回抖动；max_hold_steps 限制最长锁定时间。',
    'tradeoffs': '参数组合较多，调整时建议一次只改一个参数观察效果。loss_gated_cosine 比 cosine_with_restarts 更复杂但对 loss 收敛的响应更精准。'
  },
  'relatedConfigs': ['lr_scheduler', 'learning_rate']
})

# ── 前沿储备字段 ──────────────────────────────────────────────────────────────

write('ant_enabled.json', {
  'key': 'ant_enabled',
  'title': 'ANT（自适应噪声训练）',
  'category': '前沿储备 / 训练',
  'appliesTo': ['anima-lora'],
  'aliases': ['ant_blend'],
  'standard': {
    'summary': '（实验性）ANT（Adaptive Noise Training）：在训练噪声中加入来自数据集的可学习对抗噪声，使模型更鲁棒。',
    'effect': '开启后，训练噪声不再是纯高斯，而是混合了少量从数据集统计量派生的"对抗方向"噪声，提升模型对相关分布的鲁棒性。',
    'whenToUse': '实验性功能，适合研究对比。ant_blend 控制对抗噪声的混合比例（0.0~1.0）。',
    'avoidWhen': '默认关闭。普通 LoRA 训练无需开启。'
  },
  'advanced': {
    'principle': 'ANT 在噪声采样时混合 ε_gaussian 和 ε_adaptive（基于数据集梯度方向的噪声），比例由 ant_blend 控制。对抗噪声让模型被迫对更难的噪声方向进行去噪，提升泛化性。',
    'tradeoffs': '对抗噪声的计算需要额外的 forward pass 来估计数据方向，增加约 20%~50% 的计算量。效果在大数据集上更显著。'
  },
  'relatedConfigs': ['noise_offset', 'anima_weighting_scheme']
})

write('bp_low_enabled.json', {
  'key': 'bp_low_enabled',
  'title': 'BP-Low（低范数 backward 传播）',
  'category': '前沿储备 / 训练',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '（实验性）BP-Low：在 backward 传播时对梯度进行低范数正则化，有助于防止梯度爆炸并提升训练稳定性。',
    'effect': '梯度范数过大时进行额外的 norm 约束，比 clip_grad_norm 更软性（不直接截断，而是正则化）。',
    'whenToUse': '实验性功能。在 safeguard 触发梯度爆炸较频繁时可以叠加尝试。',
    'avoidWhen': '默认关闭。与 max_grad_norm 功能有部分重叠，通常选择其中一种使用。'
  },
  'advanced': {
    'principle': 'BP-Low 在每次 backward 后对梯度向量添加 L2 惩罚项，拉向低范数方向，类似于优化器的 weight_decay 但作用于梯度而非权重。',
    'tradeoffs': '低范数约束会减慢梯度方向的变化速度，可能影响收敛速度；但在高 LR 场景下显著提升稳定性。'
  },
  'relatedConfigs': ['max_grad_norm', 'safeguard_enabled']
})

write('scale_guidance_mode.json', {
  'key': 'scale_guidance_mode',
  'title': 'Scale Guidance 模式',
  'category': '前沿储备 / 训练',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '（实验性）Scale Guidance：通过调整不同噪声时间步的 loss 权重，引导训练聚焦于特定频率的特征（细节 / 风格 / 构图）。',
    'effect': 'detail = 提高高频特征（细节/纹理）的训练权重；style = 聚焦中频风格特征；composition = 提高低频结构/构图权重；off = 标准权重。',
    'whenToUse': '有明确训练目标（如需要更清晰细节 → detail；需要统一构图风格 → composition）时使用。实验性功能。',
    'avoidWhen': '默认 off。不确定目标时保持 off 使用标准权重，各频率均衡训练。'
  },
  'advanced': {
    'principle': '基于信噪比（SNR）的频率域分析：高 SNR 步（低噪声）→ 高频细节；低 SNR 步（高噪声）→ 低频构图。scale_guidance 通过调整不同 SNR 区间的 loss 权重，控制各频段的学习强度。',
    'tradeoffs': '频率域聚焦可能造成其他频率的学习不足，例如 detail 模式强化细节但可能弱化整体构图。建议配合基线对比（无/有 scale_guidance）验证效果。'
  },
  'relatedConfigs': ['anima_weighting_scheme', 'p2_weighting_enabled']
})

write('p2_weighting_enabled.json', {
  'key': 'p2_weighting_enabled',
  'title': 'P2 Weighting（感知优先权重）',
  'category': '前沿储备 / 训练',
  'appliesTo': ['anima-lora'],
  'aliases': ['p2_weighting_gamma', 'p2_weighting_k'],
  'standard': {
    'summary': '（实验性）P2 Weighting：按照人类感知重要性对不同噪声级别的 loss 进行加权，减少对低信噪比步骤的过度依赖，提升感知质量。',
    'effect': '中等噪声级别的 loss 权重提高，极高/极低噪声步权重降低，使训练更专注于人类可感知的图像质量改善。',
    'whenToUse': '追求感知质量（如图像清晰度、细节层次）时尝试开启。实验性功能。',
    'avoidWhen': '默认关闭。效果在小数据集上不明显，建议 >200 张图时才对比测试。'
  },
  'advanced': {
    'principle': 'P2 权重：w(λ) = (k + SNR(λ))^(-γ)，SNR(λ) = e^λ/(1+e^λ)。k 控制权重下限，γ 控制 SNR 影响的曲率。γ=1 使权重线性随 SNR 变化；更大 γ 使中间 SNR 区间权重更突出。',
    'tradeoffs': 'P2 weighting 改变了训练的有效 loss 分布，不同于标准 flow matching loss；效果依赖于 γ 和 k 的正确设置，设置不当可能不如默认加权。'
  },
  'relatedConfigs': ['anima_weighting_scheme', 'scale_guidance_mode']
})

write('band_timestep_scheduler_enabled.json', {
  'key': 'band_timestep_scheduler_enabled',
  'title': 'Band Timestep Scheduler（频带时间步调度器）',
  'category': '前沿储备 / 训练',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '（实验性）基于小波分析的自适应时间步采样器：对每个训练样本动态计算其高/低频能量，并据此调整时间步采样分布，使高频细节丰富的图像获得更多高频对应的噪声步训练。',
    'effect': '对高频丰富的图像（纹理细腻）增加高噪声步的采样概率，让模型为该图像多学习细节方向的去噪；低频主导的图像（大色块）多采样低噪声步。',
    'whenToUse': '数据集高频/低频内容差异较大时（如同时包含线稿和照片）可以尝试，让训练自适应图像内容。实验性功能。',
    'avoidWhen': '默认关闭。内容均匀的数据集（全是同风格图像）使用意义不大。'
  },
  'advanced': {
    'principle': '对每张图像的 latent 做 DCT/小波变换，计算高频能量 E_high 和低频能量 E_low，以此调制时间步采样的偏置（类似 P2 weighting 但基于内容感知而非全局统计）。',
    'tradeoffs': '每步额外的小波计算增加约 3~8% 的训练开销；对于 GPU-bound 训练此额外开销相对不明显。'
  },
  'relatedConfigs': ['anima_weighting_scheme', 'p2_weighting_enabled', 'scale_guidance_mode']
})

write('perceptual_anchor_loss_enabled.json', {
  'key': 'perceptual_anchor_loss_enabled',
  'title': '感知锚点 Loss',
  'category': '前沿储备 / 质量',
  'appliesTo': ['anima-lora'],
  'aliases': ['perceptual_anchor_loss_weight'],
  'standard': {
    'summary': '（实验性）在训练 loss 中加入感知特征对齐项：利用预训练视觉特征提取器（DINO/CLIP 等）计算训练输出与参考的特征相似度，补充像素级 loss 的不足。',
    'effect': '感知 loss 有助于训练输出在语义层面更接近参考（如保持细节纹理、结构一致性），而不只是像素级重建。',
    'whenToUse': '实验性功能。当 MSE loss 的训练结果感知质量不满意时可以叠加尝试。',
    'avoidWhen': '默认关闭。感知特征提取器需要额外显存（约 0.5~2GB），且提取计算增加约 10%~20% 训练时间。'
  },
  'advanced': {
    'principle': '感知 loss = ||ϕ(x_pred) - ϕ(x_target)||²，其中 ϕ 是预训练网络的特征提取函数（如 DINO-ViT 的中间层激活）。用于补充像素 MSE 无法捕捉的高级语义信息。',
    'tradeoffs': '感知 loss 的权重（perceptual_anchor_loss_weight）需要谨慎设置：权重过大会主导训练，使模型追求特征匹配而忽略去噪目标；权重过小则无明显效果。'
  },
  'relatedConfigs': ['lineart_loss_enabled', 'dct_loss_enabled', 'gram_matrix_loss_enabled']
})

write('lineart_loss_enabled.json', {
  'key': 'lineart_loss_enabled',
  'title': '线稿 Loss',
  'category': '前沿储备 / 质量',
  'appliesTo': ['anima-lora'],
  'aliases': ['lineart_loss_weight', 'dct_loss_enabled', 'dct_loss_weight',
              'gram_matrix_loss_enabled', 'gram_matrix_loss_weight'],
  'standard': {
    'summary': '（实验性）质量感知辅助 loss 族：lineart_loss 通过边缘检测约束线条清晰度；dct_loss 通过 DCT 频域约束纹理细节；gram_matrix_loss 通过 Gram 矩阵约束风格一致性。',
    'effect': '各辅助 loss 分别从不同维度约束训练输出质量，补充标准扩散模型 loss 的感知盲区。',
    'whenToUse': '实验性功能，适合特定风格要求的 LoRA（如线稿风格、高频纹理风格）。各 loss 有独立的 weight 参数控制强度。',
    'avoidWhen': '默认关闭。多个辅助 loss 叠加时需要仔细平衡各 weight，否则可能导致训练不稳定。'
  },
  'advanced': {
    'principle': 'lineart_loss: Canny 边缘检测后计算预测和目标边缘图的 L1；dct_loss: 对 latent/特征图做 DCT，计算高频系数的 L2 差异；gram_loss: 特征图 Gram 矩阵（G = F × F^T）的 L2，等价于捕捉特征的二阶统计量（风格信息）。',
    'tradeoffs': 'lineart 需要实时 Canny 计算（约 2ms/image GPU）；dct 开销极小（几乎免费）；gram 需要完整矩阵乘法（O(C²)，C = 通道数）。三者可以独立开启或叠加。'
  },
  'relatedConfigs': ['perceptual_anchor_loss_enabled', 'scale_guidance_mode']
})

print('Anima 专用 / Loss 调度器 / 前沿储备: 全部条目完成')
