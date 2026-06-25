"""
批量生成 LR / Optimizer / Compile 族 wiki entries
运行: python tools/gen_wiki_batch2.py
"""
import json, os

ENTRIES_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'training-wiki', 'entries')

def write(name, data):
    path = os.path.join(ENTRIES_DIR, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'  wrote {name}')

# ── 学习率核心字段 ─────────────────────────────────────────────────────────────

write('learning_rate.json', {
  'key': 'learning_rate',
  'title': '总学习率',
  'category': '训练 / 学习率',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'aliases': ['unet_lr'],
  'standard': {
    'summary': '控制每步参数更新的幅度。值越大更新越激进，收敛越快但容易过拟合或崩溃；值越小越保守。',
    'effect': 'LoRA 训练典型范围 1e-5~1e-3。对于 DiT 类模型（Anima）建议从 1e-4 开始；SDXL LoRA 常用 1e-4~5e-4。',
    'whenToUse': '绝大多数情况下这是最需要调整的单个超参。先固定其他参数，通过 loss 曲线判断是否需要调整 LR。',
    'avoidWhen': '使用自适应优化器（Prodigy/D-Adaptation）时，这个 LR 通常应设为 1.0（让优化器自动估计有效步长）。'
  },
  'advanced': {
    'principle': '梯度下降更新：θ_t+1 = θ_t - lr × ∇L(θ_t)。LR 过高 → loss 震荡/发散；LR 过低 → 收敛极慢。通常配合 warmup 和 scheduler 使用。',
    'intervention': '与 train_unet_lr / train_text_encoder_lr 分开设置时，此字段失效，分路径 LR 优先。',
    'expectedImpact': 'LR 翻倍 → 收敛速度约快 2×，但稳定性下降。LR 减半 → 需要约 2× 步数达到相同效果。',
    'tradeoffs': 'LR 是训练最敏感的超参之一，小数据集应使用更小 LR（防止过拟合），大数据集可适当提高。'
  },
  'relatedConfigs': ['lr_scheduler', 'lr_warmup_steps', 'unet_lr', 'text_encoder_lr']
})

write('unet_lr.json', {
  'key': 'unet_lr',
  'title': 'UNet/DiT 学习率',
  'category': '训练 / 学习率',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'aliases': ['network_module_lr'],
  'standard': {
    'summary': '单独设置 UNet（或 DiT）的学习率，与文本编码器的学习率分开控制。',
    'effect': '设置后总 learning_rate 对 UNet 失效。允许 UNet 和 TE 使用不同步长，常见配置是 UNet LR > TE LR（因为 UNet 是主要学习目标）。',
    'whenToUse': '希望分别控制 UNet 和 TE 学习节奏时使用。典型：UNet LR=1e-4，TE LR=5e-5。',
    'avoidWhen': '不需要差异化控制时，只设总 learning_rate 即可。同时设置两者会使总 LR 失效。'
  },
  'advanced': {
    'principle': '通过 param_groups 对不同模块设置独立 lr，允许 optimizer 对 UNet 和 TE 参数使用不同步长。',
    'tradeoffs': '如果 TE LR 过高，TE 的语义理解会偏离预训练，导致推理时文本控制力下降。'
  },
  'relatedConfigs': ['learning_rate', 'text_encoder_lr', 'lr_scheduler']
})

write('text_encoder_lr.json', {
  'key': 'text_encoder_lr',
  'title': '文本编码器学习率',
  'category': '训练 / 学习率',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'aliases': ['te_lr', 'te2_lr'],
  'standard': {
    'summary': '单独设置文本编码器（CLIP/T5 等）的学习率，通常设为 UNet LR 的 1/2 ~ 1/10。',
    'effect': '较低的 TE LR 保留预训练语义理解能力，同时允许 TE 适配新概念（如角色/风格触发词）。',
    'whenToUse': '训练包含 TE 时（train_text_encoder=true），建议单独设置 TE LR 使其低于 UNet LR。',
    'avoidWhen': 'train_text_encoder=false 时设置无意义。'
  },
  'advanced': {
    'principle': 'TE 的语义表征空间比 UNet 更「脆弱」，过高 LR 会破坏 CLIP 的语义一致性，导致提示词响应变弱。',
    'tradeoffs': 'TE LR=0 相当于不训练 TE；过高 LR 导致语言理解退化。经验值：UNet LR / 5 ~ UNet LR / 2。'
  },
  'relatedConfigs': ['learning_rate', 'unet_lr', 'train_text_encoder']
})

write('lr_scheduler.json', {
  'key': 'lr_scheduler',
  'title': '学习率调度器',
  'category': '训练 / 学习率',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'standard': {
    'summary': '控制学习率在训练过程中如何变化的策略。不同调度器对最终效果有显著影响。',
    'effect': 'cosine_with_restarts = 余弦周期下降（最常用）；constant = 固定不变；linear = 线性衰减；loss_gated_cosine = 根据 loss 改善动态推进余弦。',
    'whenToUse': '推荐 cosine_with_restarts（平衡稳定性和收敛速度）。自适应优化器（Prodigy）可配合 constant_with_warmup。',
    'avoidWhen': '不建议 constant（无衰减，容易在末期过拟合）；loss_gated_cosine 适合长训练，短训练（<100步）意义不大。'
  },
  'advanced': {
    'principle': 'cosine: lr(t) = lr_min + 0.5 × (lr_max - lr_min) × (1 + cos(π × t/T))；restarts 是多次重启余弦（每个周期完整下降后重置）。loss_gated_cosine 在 loss 有改善时锁住当前余弦相位，平台期才推进。',
    'tradeoffs': 'cosine_with_restarts 的重启次数（num_cycles）影响最终 LR：num_cycles=1 结束于 LR≈0（最保守），多周期则在新高度结束。'
  },
  'relatedConfigs': ['lr_warmup_steps', 'lr_scheduler_num_cycles', 'learning_rate', 'loss_scheduler_ema_alpha']
})

write('lr_warmup_steps.json', {
  'key': 'lr_warmup_steps',
  'title': '学习率预热步数',
  'category': '训练 / 学习率',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'standard': {
    'summary': '训练开始时学习率从 0 线性增长到目标值的步数，防止训练初期大梯度破坏预训练权重。',
    'effect': '前 N 步 LR 线性爬升，N 步后达到设定的 learning_rate 并进入正式调度阶段。',
    'whenToUse': '推荐总步数的 5%~10% 作为预热。总步数 500 时，warmup=25~50。使用高学习率（>5e-4）时更需要预热。',
    'avoidWhen': '极短训练（<50步）或已使用自适应优化器（Prodigy 自带预热机制）时可设为 0。'
  },
  'advanced': {
    'principle': '预热期 lr_t = lr_target × (t / warmup_steps)，防止初始 momentum 为 0 时大梯度更新损坏预训练特征。',
    'tradeoffs': '预热过短 → 初期大幅度更新可能影响基础能力；预热过长 → 占用太多有效训练步数。'
  },
  'relatedConfigs': ['learning_rate', 'lr_scheduler', 'lr_scheduler_num_cycles']
})

write('lr_scheduler_num_cycles.json', {
  'key': 'lr_scheduler_num_cycles',
  'title': 'Cosine 重启次数',
  'category': '训练 / 学习率',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'standard': {
    'summary': 'cosine_with_restarts 调度器的重启周期数。默认 1（单次余弦，从目标 LR 衰减到近 0）。',
    'effect': 'num_cycles=1：从 LR 下降到约 0，训练末期最稳定；num_cycles=3：每个周期 LR 从高到低，给优化器多次逃离局部最优的机会。',
    'whenToUse': '长训练（>500 步）可尝试 num_cycles=2~3，让优化器在末期仍有较高 LR 探索。短训练保持 1。',
    'avoidWhen': '使用非余弦调度器时此参数无效。'
  },
  'advanced': {
    'principle': '每个 cycle 长度 = 总步数 / num_cycles，末尾 LR = lr_min（通常接近 0）。多 cycle 相当于多次重新启动探索，但也意味着最终不在 LR 最低点结束。',
    'tradeoffs': 'num_cycles > 1 在训练末期 LR 仍较高，可能导致末期权重不稳定；num_cycles=1 末期 LR 接近 0 更稳定，配合 EMA 效果最好。'
  },
  'relatedConfigs': ['lr_scheduler', 'learning_rate']
})

write('lr_scheduler_type.json', {
  'key': 'lr_scheduler_type',
  'title': '自定义调度器类',
  'category': '训练 / 学习率',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'standard': {
    'summary': '指定自定义学习率调度器的完整类路径，如 torch.optim.lr_scheduler.CosineAnnealingLR。填写后优先于上方调度器选择。',
    'effect': '后端会按类路径动态导入并实例化该调度器，配合 lr_scheduler_args 传递参数。',
    'whenToUse': '需要使用内置列表外的特殊调度器时填写。',
    'avoidWhen': '有内置选项满足需求时无需使用，内置选项有更好的集成和参数验证。'
  },
  'advanced': {
    'principle': '使用 importlib 动态导入，允许使用 torch.optim.lr_scheduler.* 或 pytorch_optimizer.* 下的任意调度器。',
    'tradeoffs': '需要确保类路径在运行环境中可访问，且参数与调度器构造函数匹配（通过 lr_scheduler_args 传 key=value）。'
  },
  'relatedConfigs': ['lr_scheduler', 'lr_scheduler_args']
})

write('lr_scheduler_args.json', {
  'key': 'lr_scheduler_args',
  'title': '自定义调度器参数',
  'category': '训练 / 学习率',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'standard': {
    'summary': '以 key=value 格式（一行一个）传递给自定义调度器的参数。',
    'effect': '每行解析为一个构造函数参数，数值类型自动转换（int/float），字符串保持原样。',
    'whenToUse': '配合 lr_scheduler_type 使用，如：T_max=500\\neta_min=1e-6。',
    'avoidWhen': '使用内置调度器时无需填写。'
  },
  'advanced': {
    'principle': '参数解析：按行分割 → 按 = 分割 → 尝试 int/float 转换 → 作为 kwargs 传入调度器构造函数。',
    'tradeoffs': '参数名必须与调度器的 __init__ 签名完全匹配，否则会抛出 TypeError。'
  },
  'relatedConfigs': ['lr_scheduler_type', 'lr_scheduler']
})

write('weight_decay.json', {
  'key': 'weight_decay',
  'title': '权重衰减（L2 正则化）',
  'category': '训练 / 优化器',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'standard': {
    'summary': '优化器的 L2 正则化系数，通过在每步更新时对权重施加衰减力来防止过拟合。',
    'effect': '值越大正则化越强，权重倾向于保持较小值；过小（0）则无正则化。LoRA 训练典型值 0.01~0.1。',
    'whenToUse': '数据集较小（<50 张）或训练步数较多（>1000步）时适当增大（0.05~0.1）以防过拟合。',
    'avoidWhen': '使用 Prodigy 等自适应优化器时 weight_decay 的实际效果可能与预期不同，建议保持默认。'
  },
  'advanced': {
    'principle': 'AdamW 将 L2 正则化从梯度解耦（与 Adam 的区别）：θ_t = θ_{t-1} × (1 - lr × weight_decay) - lr × ∇L。AdamW 的实现比 Adam + L2 更正确。',
    'tradeoffs': 'weight_decay 过大会过度约束权重，导致 LoRA 无法充分学习；过小则易过拟合。LoRA 场景因参数量少，通常比全量微调需要更小的 weight_decay。'
  },
  'relatedConfigs': ['optimizer_type', 'learning_rate']
})

write('max_grad_norm.json', {
  'key': 'max_grad_norm',
  'title': '梯度裁剪阈值',
  'category': '训练 / 优化器',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'standard': {
    'summary': '梯度全局范数超过此值时进行裁剪（clip_grad_norm_），防止梯度爆炸。0 或负值 = 不裁剪。',
    'effect': '当所有参数梯度的 L2 范数超过阈值时，等比例缩放所有梯度使范数 = max_grad_norm。',
    'whenToUse': '默认 1.0 适合大多数 LoRA 训练，可作为安全网防止偶发梯度爆炸。',
    'avoidWhen': '已开启 SafeGuard NaN 检测时可放松到 5.0；使用 Prodigy 时其自适应机制可能与裁剪冲突。'
  },
  'advanced': {
    'principle': 'clip_grad_norm_(params, max_grad_norm)：grad_norm = sqrt(sum(g²))；若 > max，则 g = g × max / grad_norm。',
    'tradeoffs': '过激进的裁剪（<0.5）会减慢收敛（梯度信息被大幅压缩）；不裁剪则在学习率偏高时有梯度爆炸风险。'
  },
  'relatedConfigs': ['optimizer_type', 'learning_rate', 'safeguard_enabled']
})

# ── 优化器 ─────────────────────────────────────────────────────────────────────

write('optimizer_type.json', {
  'key': 'optimizer_type',
  'title': '优化器',
  'category': '训练 / 优化器',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'standard': {
    'summary': '选择参数更新算法。不同优化器在收敛速度、显存占用、训练稳定性上有显著差异。',
    'effect': 'AdamW8bit（默认）= 量化 Adam，省显存；AdamW = 标准 Adam，精度更高；Prodigy = 自适应步长，无需调 LR；Lion = 更新方向为符号，低显存。',
    'whenToUse': 'AdamW8bit 是最省显存的安全选择；Prodigy 适合懒得调 LR 的场景；AdamW 适合追求最高精度。',
    'avoidWhen': 'SGD/SGD+Momentum 在 LoRA 微调中通常效果差；过于激进的优化器（如大步长 Lion）在小数据集上容易过拟合。'
  },
  'advanced': {
    'principle': 'AdamW: m = β₁m + (1-β₁)g; v = β₂v + (1-β₂)g²; θ -= lr × m / (√v + ε)（解耦 weight_decay）。8bit 版对 m/v 做量化存储，省约 75% 动量显存。',
    'tradeoffs': 'AdamW8bit vs AdamW：8bit 省约 6GB(对 7B 模型)，但有量化误差，大模型影响更小；LoRA 参数少，8bit 量化误差相对明显但通常可接受。'
  },
  'relatedConfigs': ['optimizer_backend', 'learning_rate', 'weight_decay', 'optimizer_args']
})

write('optimizer_backend.json', {
  'key': 'optimizer_backend',
  'title': '优化器后端',
  'category': '训练 / 优化器',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'standard': {
    'summary': 'AdamW 路线的实现档位：auto（自动检测最优）、fused（CUDA fused 最快）、foreach（批处理，次快）、bnb（bitsandbytes 量化）。',
    'effect': 'fused ≈ 1.8ms/step；foreach ≈ 5ms/step；bnb ≈ 36ms/step（8bit 省显存但慢）。compiled_step = torch.compile 包装任意优化器 step。',
    'whenToUse': 'auto 在大多数情况下自动选择最优。显存极紧时用 bnb；追求极致速度时用 fused（需 CUDA）。',
    'avoidWhen': 'compiled_step 是实验性功能，首次编译慢且可能在某些优化器上失败（有自动回退）。'
  },
  'advanced': {
    'principle': 'fused：将 AdamW 多个 kernel 合并为一次 CUDA launch，减少 kernel 发射开销；foreach：向量化遍历所有参数，比逐参数循环快约 3×；compiled_step：torch.compile 将整个 step 编译为 TorchScript/Triton kernel。',
    'tradeoffs': 'fused 要求 CUDA 且不支持所有 tensor dtype；bnb 8bit 对 LoRA 小权重量化误差相对大，可能影响精细收敛。'
  },
  'relatedConfigs': ['optimizer_type', 'compile_runtime']
})

write('optimizer_args.json', {
  'key': 'optimizer_args',
  'title': '优化器额外参数',
  'category': '训练 / 优化器',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'aliases': ['optimizer_args_custom'],
  'standard': {
    'summary': '以 key=value 格式（一行一个）向优化器传递额外参数，如 betas 或特定优化器的专有选项。',
    'effect': '每行解析为一个 kwargs 传入优化器构造函数。支持列表值：betas=[0.9,0.999]。',
    'whenToUse': '微调优化器的 β 参数（如调低 β₂ 加快 Adam variance 估计响应速度）或传入特定优化器的专有参数（如 Prodigy 的 use_bias_correction）。',
    'avoidWhen': '不清楚优化器参数的作用时不要随意填写，错误参数会导致优化器初始化失败。'
  },
  'advanced': {
    'principle': '后端使用 runConfigBuilder 直接将解析后的 dict 作为 **kwargs 传入优化器构造函数，不做额外验证。',
    'tradeoffs': '灵活性极高，但参数名和类型必须与优化器的 __init__ 签名完全对应。'
  },
  'relatedConfigs': ['optimizer_type', 'optimizer_backend']
})

write('optimizer_args_custom.json', {
  'key': 'optimizer_args_custom',
  'title': '优化器自定义参数（原始格式）',
  'category': '训练 / 优化器',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'standard': {
    'summary': '以原始字符串格式传递优化器参数，支持更复杂的格式（如嵌套结构）。',
    'effect': '与 optimizer_args 功能类似，但允许直接传递 Python 字面量格式。',
    'whenToUse': '需要传递复杂嵌套参数时使用。普通参数建议使用 optimizer_args。',
    'avoidWhen': '大多数情况使用 optimizer_args 即可。'
  },
  'advanced': {
    'principle': '后端通过 ast.literal_eval 或 eval 解析，允许更复杂的数据结构。',
    'tradeoffs': '安全性略低（eval 解析），建议只填写可信内容。'
  },
  'relatedConfigs': ['optimizer_type', 'optimizer_args']
})

write('prodigy_d0.json', {
  'key': 'prodigy_d0',
  'title': 'Prodigy 初始步长估计',
  'category': '训练 / 优化器',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'standard': {
    'summary': 'Prodigy / ProdigyPlus 优化器的初始步长估计值 d₀。留空则使用优化器默认值（自动估计）。',
    'effect': '较大的 d₀ 让 Prodigy 初始更激进；较小的 d₀ 让其从更保守的步长开始积累估计。',
    'whenToUse': '通常留空（自动估计）。若训练初期 loss 特别不稳定，可尝试设置小初始值（如 1e-6）。',
    'avoidWhen': '不了解 Prodigy 步长机制时保持默认（留空）。'
  },
  'advanced': {
    'principle': 'Prodigy 通过在线估计梯度与权重的内积关系，自动推断有效步长。d₀ 是初始估计的起点，影响估计的收敛速度。',
    'tradeoffs': 'd₀ 设置不当可能导致前几步步长过大/过小，从而影响 TE 和 UNet 权重的初始更新。'
  },
  'relatedConfigs': ['optimizer_type', 'prodigy_d_coef']
})

write('prodigy_d_coef.json', {
  'key': 'prodigy_d_coef',
  'title': 'Prodigy d 系数',
  'category': '训练 / 优化器',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'standard': {
    'summary': 'Prodigy / ProdigyPlus 的 d 系数，影响自适应学习率的放大倍数。默认 2.0。',
    'effect': '值越大，Prodigy 推断的有效步长越大（等效于提高学习率）；值越小越保守。',
    'whenToUse': 'Prodigy 配合大 d_coef（2.0~3.0）可实现较快收敛。若发现 loss 震荡，可降至 1.0~1.5。',
    'avoidWhen': 'd_coef > 5 容易导致训练不稳定。'
  },
  'advanced': {
    'principle': 'd_coef 缩放 Prodigy 的步长估计：effective_lr ≈ d₀ × d_coef × (gradient geometry estimation)。',
    'tradeoffs': 'Prodigy 配合 cosine scheduler 时的效果依赖于 d_coef 的校准，不同任务的最优值差异较大。'
  },
  'relatedConfigs': ['optimizer_type', 'prodigy_d0']
})

# ── Torch Compile ──────────────────────────────────────────────────────────────

write('torch_compile.json', {
  'key': 'torch_compile',
  'title': 'torch.compile（JIT 编译加速）',
  'category': '速度 / 编译',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'standard': {
    'summary': '开启 PyTorch torch.compile 对训练计算图进行 JIT 编译（通过 TorchDynamo + Triton）。首次编译慢，之后每步更快。',
    'effect': '编译成功后，每步加速 10%~40%（取决于模型和显卡）。首次编译需要额外 1~3 分钟。',
    'whenToUse': '训练步数较多（>200步）且显卡支持 Triton（NVIDIA Ampere 以上）时推荐开启以提升吞吐。',
    'avoidWhen': '短训练（<100步）不划算（编译时间 > 收益）；部分老显卡/CPU 上 Triton 不可用；Windows 上 Triton 支持有限（但可用 eager 后端绕过）。'
  },
  'advanced': {
    'principle': 'TorchDynamo 捕获计算图 → Inductor/Triton 生成 CUDA kernel → 缓存编译结果。后续 forward/backward 调用编译好的 kernel，跳过 Python overhead。',
    'intervention': '编译默认应用于 UNet/DiT 的 forward，backward 通过 autograd 自动获得编译加速。',
    'expectedImpact': 'Anima LoRA 测试：compile_cache + token_flatten + inner_forward → 稳定段更快，但首步编译时间 +60-120s，峰值显存 +500MB~1GB。',
    'tradeoffs': '编译有较大内存开销；动态形状（变长序列）需要额外重编译；与某些 LoRA hook 可能冲突（有自动 fallback）。'
  },
  'relatedConfigs': ['dynamo_backend', 'compile_runtime', 'compile_shape_strategy', 'compile_target_strategy']
})

write('dynamo_backend.json', {
  'key': 'dynamo_backend',
  'title': 'torch.compile 后端',
  'category': '速度 / 编译',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'aliases': ['torch_compile_backend'],
  'standard': {
    'summary': '选择 torch.compile 使用的底层后端。不同后端在速度、兼容性、调试友好度上有差异。',
    'effect': 'inductor（默认）= 最优化性能，生成 Triton kernel；cudagraphs = 固定形状下极快；eager = 不编译，仅用 Dynamo 追踪（调试用）；aot_eager = AOT 图捕获但不编译（调试用）。',
    'whenToUse': '生产训练用 inductor；输入形状固定时可尝试 cudagraphs 进一步提速；遇到 inductor bug 时用 eager 调试。',
    'avoidWhen': 'eager/aot_eager 是调试后端，不提供性能提升。'
  },
  'advanced': {
    'principle': 'TorchDynamo 将 Python 计算图降级到 FX 图 → 送入后端：inductor 通过 Triton/CUDA 生成 kernel；cudagraphs 捕获 CUDA stream 命令序列实现零-overhead 重放；eager 直接执行 FX 图。',
    'tradeoffs': 'cudagraphs 要求每次前向输入形状完全相同（否则需重新捕获），变长 token 场景不适用；inductor 首次编译慢但一次编译多次复用。',
    'codePath': 'backend/core/lulynx_trainer/trainer_execution_mixin.py → runtime_optimizations_attention.py:708-718'
  },
  'relatedConfigs': ['torch_compile', 'compile_runtime', 'dynamo_recompile_limit']
})

write('dynamo_recompile_limit.json', {
  'key': 'dynamo_recompile_limit',
  'title': 'Dynamo 重编译次数上限',
  'category': '速度 / 编译',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'standard': {
    'summary': '限制 torch.compile 因动态形状变化触发重编译的最大次数。超过后退回 eager 模式。',
    'effect': '限制过小 → 频繁形状变化时很快退回 eager；限制过大 → 编译时间长，内存占用高。',
    'whenToUse': '训练使用动态形状（如变长 caption、bucket 训练）时调整。默认值通常足够。',
    'avoidWhen': '固定形状训练（fixed_visual=1）时几乎不会触发重编译，此参数无意义。'
  },
  'advanced': {
    'principle': 'TorchDynamo 对不同输入形状会触发不同的编译路径（guard 机制）。超过 recompile_limit 后转为不编译（interpret mode）。',
    'tradeoffs': '提高限制允许更多形状各自获得编译加速，但总编译时间和内存成比例增加。'
  },
  'relatedConfigs': ['torch_compile', 'dynamo_backend', 'compile_shape_strategy']
})

write('compile_runtime.json', {
  'key': 'compile_runtime',
  'title': 'Compile 运行策略',
  'category': '速度 / 编译',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '统一表达编译意图的高层策略选择。off = 不编译；auto = 自动检测；compile_cache = 编译并缓存（推荐长训练）。',
    'effect': 'compile_cache 在首步编译后缓存结果，后续步骤直接复用已编译 kernel，避免重复编译开销。',
    'whenToUse': '长训练（>200步）推荐 compile_cache。短测用 off。',
    'avoidWhen': '低显存（<8GB）时 compile 的额外显存占用可能导致 OOM，建议先测试 off 是否正常。'
  },
  'advanced': {
    'principle': '统一编译意图的前端路由：compile_runtime 决定是否启用编译以及缓存策略，实际后端由 dynamo_backend 决定。当与显式 torch_compile=true 冲突时，显式参数优先。',
    'tradeoffs': 'compile_cache 适合稳定输入形状；若 batch 形状变化频繁，缓存命中率低，退化为逐步重编译。'
  },
  'relatedConfigs': ['torch_compile', 'dynamo_backend', 'compile_shape_strategy', 'compile_target_strategy']
})

write('compile_shape_strategy.json', {
  'key': 'compile_shape_strategy',
  'title': 'Compile Shape 策略',
  'category': '速度 / 编译',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '控制 torch.compile 处理输入形状的方式：auto（自动）/ token_flatten（序列展平，适合 native token bucket）/ fixed_pad（固定填充）。',
    'effect': 'token_flatten 在 Anima/Newbie native token bucket 路线下将变长序列展平，减少形状变化导致的重编译；非 native DiT 自动 fallback 到 fixed_pad。',
    'whenToUse': 'Anima LoRA 长训练推荐 token_flatten + compile_cache 组合。',
    'avoidWhen': '使用非 native DiT 路线（如 SDXL）时 token_flatten 会自动 fallback，保持 auto 即可。'
  },
  'advanced': {
    'principle': 'token_flatten 将 [B, H, W, C] 或 [B, T, C] 展平为 [B×T, C]，确保序列维度合并后形状稳定，减少 Dynamo guard 触发重编译。',
    'tradeoffs': 'token_flatten 需要模型支持展平后的输入形状，不兼容的层会自动回退。'
  },
  'relatedConfigs': ['compile_runtime', 'compile_target_strategy', 'dynamo_backend']
})

write('compile_target_strategy.json', {
  'key': 'compile_target_strategy',
  'title': 'Compile Target 策略',
  'category': '速度 / 编译',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '选择对哪些模块/部分应用编译：auto（自动）/ inner_forward（block 内部 forward）/ block（整块 block）。',
    'effect': 'inner_forward 优先编译 block 内的稳定 forward 路径，跳过外层动态路由；block 编译整个 transformer block。Anima 测试中 inner_forward 效果更稳定。',
    'whenToUse': 'Anima 推荐 inner_forward；其他路线保持 auto（自动探测最适合的目标）。',
    'avoidWhen': 'block 模式在有动态分支的 block 上可能导致编译失败或频繁重编译。'
  },
  'advanced': {
    'principle': 'inner_forward = 只编译 Attention + MLP 的核心计算路径，绕过 block 外层的条件逻辑（如 timestep 路由、跳层逻辑）；block = 完整编译整个 block 单元。',
    'tradeoffs': 'inner_forward 编译范围更小但更稳定；block 编译范围更大但遇到动态分支时容易触发 graph break。'
  },
  'relatedConfigs': ['compile_runtime', 'compile_shape_strategy']
})

write('compile_static_shape_drop_last.json', {
  'key': 'compile_static_shape_drop_last',
  'title': '静态形状丢弃末批',
  'category': '速度 / 编译',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '使用静态形状编译时，若最后一个 batch 大小与编译形状不一致，自动丢弃该 batch 而非重新编译。',
    'effect': '防止末批形状不一致触发额外编译。少量数据损失（最多少于一个 batch 的样本）换取编译稳定性。',
    'whenToUse': '开启 compile 且使用固定 batch 形状时，若遇到末批大小不一致的编译告警可开启。',
    'avoidWhen': '数据集极小（如 <10 张）时丢失末批比例过高，不建议开启。'
  },
  'advanced': {
    'principle': '在 DataLoader 层检测 batch 形状是否与编译时注册的形状一致，不一致时跳过该 batch 而非触发重编译（torch.compile 的重编译代价较高）。',
    'tradeoffs': '丢失数据与避免重编译之间的 trade-off，总体而言编译稳定性通常比丢失几个样本更重要。'
  },
  'relatedConfigs': ['compile_runtime', 'torch_compile', 'dynamo_recompile_limit']
})

print('LR / Optimizer / Compile: 全部条目完成')
