"""
批量生成 caption / block_weight / VRAM 管理族 wiki entries
运行: python tools/gen_wiki_batch4.py
"""
import json, os

ENTRIES_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'training-wiki', 'entries')

def write(name, data):
    path = os.path.join(ENTRIES_DIR, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'  wrote {name}')

# ── Caption / 图说 ────────────────────────────────────────────────────────────

write('caption_extension.json', {
  'key': 'caption_extension',
  'title': '图说文件扩展名',
  'category': '数据集 / 图说',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'standard': {
    'summary': '训练数据集中图说文件的扩展名。训练器会在每张图像同目录查找同名的图说文件。',
    'effect': '.txt = 普通文本图说（每行一个 tag 或自然语言描述）；.caption = ComfyUI 常用格式（功能相同）。',
    'whenToUse': '根据图说文件的实际格式设置。大多数工具（WD tagger、BLIP等）输出 .txt 格式。',
    'avoidWhen': '不需要修改，保持与图说文件的实际扩展名一致即可。'
  },
  'advanced': {
    'principle': '训练器遍历数据集目录时，对每张图像寻找同名 + 指定扩展名的文件作为其图说。若找不到，使用空图说或触发词（取决于其他设置）。',
    'tradeoffs': '同一目录下混用 .txt 和 .caption 时，只会识别 caption_extension 指定的格式，另一种被忽略。'
  },
  'relatedConfigs': ['caption_source_tag_ratio', 'caption_source_nl_ratio']
})

write('caption_dropout_every_n_epochs.json', {
  'key': 'caption_dropout_every_n_epochs',
  'title': '无条件训练间隔',
  'category': '数据集 / 图说',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'standard': {
    'summary': '每 N 个 epoch 完全丢弃一次图说（图说变为空字符串），相当于训练 CFG（无条件生成）的能力。',
    'effect': '开启无条件训练后，模型在 CFG=0 时也能生成合理图像，提升生成的 CFG guidance 效果。',
    'whenToUse': '希望提高推理时 CFG guidance 效果时开启（设为 1~5）。对 CFG 要求高的概念 LoRA 有帮助。',
    'avoidWhen': '数据集极小时，无条件训练会占用一部分训练资源学习"无条件"分布，可能影响概念学习效率。'
  },
  'advanced': {
    'principle': '无条件训练是 CFG（Classifier-Free Guidance）的基础：模型同时学习条件生成（有 caption）和无条件生成（caption=空），推理时用两者差值作为引导方向。',
    'tradeoffs': '过少的无条件训练（>5 epoch 才一次）导致 CFG 引导能力弱；过多（每 epoch 一次）占用太多资源。通常设为 1~3 即可。'
  },
  'relatedConfigs': ['caption_tag_dropout_rate', 'caption_extension']
})

write('caption_tag_dropout_rate.json', {
  'key': 'caption_tag_dropout_rate',
  'title': 'Tag Dropout 率',
  'category': '数据集 / 图说',
  'appliesTo': ['sdxl-lora', 'sd-lora', 'anima-lora'],
  'standard': {
    'summary': '训练时随机丢弃图说中的部分 tag 的概率。默认 0（不丢弃）。',
    'effect': '设为 0.1 = 每个 tag 有 10% 的概率在本步训练中被丢弃。增加图说变化多样性，提升 LoRA 对不同 tag 组合的泛化。',
    'whenToUse': '数据集图说包含大量 tag（>10 个 tag/图）时，开启 dropout（0.05~0.1）可以提升生成的多样性和 tag 响应能力。',
    'avoidWhen': '图说非常短（如只有触发词）时，dropout 会让图说几乎为空，训练效果变差。'
  },
  'advanced': {
    'principle': '对 caption 按 tag 分割后，对每个 tag 独立进行 Bernoulli 采样决定是否保留。触发词通常被保护，不参与 dropout。',
    'tradeoffs': 'tag dropout 增加训练随机性，有助于防止模型过度依赖某些 tag 的组合，但会降低对 tag 语义的精确响应。'
  },
  'relatedConfigs': ['caption_extension', 'caption_dropout_every_n_epochs']
})

write('caption_source_tag_ratio.json', {
  'key': 'caption_source_tag_ratio',
  'title': 'Tag 图说比例',
  'category': '数据集 / 图说',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['caption_source_nl_ratio', 'caption_source_empty_ratio', 'caption_source_trigger_only_ratio'],
  'standard': {
    'summary': '图说来源的采样比例分配：tag 格式 / 自然语言格式 / 空图说 / 纯触发词 的各自占比。四项之和应为 1.0。',
    'effect': '控制每步训练时使用何种格式的图说。多格式混合训练可以让 LoRA 同时响应 tag 格式和自然语言描述。',
    'whenToUse': '数据集同时包含 tag 图说和 NL 描述时，设置混合比例（如 tag=0.7，nl=0.3）提升适应性。',
    'avoidWhen': '只有单一格式的图说时无需设置（只用一种格式就好）。'
  },
  'advanced': {
    'principle': '每个训练样本随机按比例从不同图说来源采样：概率分布 [tag, nl, empty, trigger_only]。同一张图可能有多种格式的图说文件。',
    'tradeoffs': 'empty ratio 过高等于部分无条件训练，影响 CFG 引导；trigger_only ratio 过高导致模型只响应触发词，失去细粒度控制能力。'
  },
  'relatedConfigs': ['caption_extension', 'caption_tag_dropout_rate']
})

write('caption_source_trigger_tokens.json', {
  'key': 'caption_source_trigger_tokens',
  'title': '触发词',
  'category': '数据集 / 图说',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'standard': {
    'summary': '训练时添加到图说前面的触发词（trigger token）。推理时使用相同触发词可激活 LoRA 的概念。',
    'effect': '设置后，每个训练样本的图说前都会自动添加触发词，使模型将触发词与训练概念关联。',
    'whenToUse': '训练角色/物体 LoRA 时强烈推荐设置唯一触发词（如 lulynx_char、mychar_v1）。风格 LoRA 可以不设置（直接用风格描述词）。',
    'avoidWhen': '触发词不要与常用词（如 woman、cat）重叠，否则会影响模型对常规提示词的响应。'
  },
  'advanced': {
    'principle': '触发词被添加到每个图说最前面（或通过特定位置策略插入），优化器学习建立触发词 embedding 与概念视觉特征的关联。训练 TE 时这种关联更紧密。',
    'tradeoffs': '触发词越独特（如造词），干扰越小；但太生僻的词在 CLIP tokenizer 中可能被拆分为多个 subword，影响绑定效果。推荐使用 2~3 个简短常见词的组合（如 lulynx person）。'
  },
  'relatedConfigs': ['caption_extension', 'caption_source_trigger_only_ratio', 'train_text_encoder']
})

write('caption_shuffle_strategy.json', {
  'key': 'caption_shuffle_strategy',
  'title': 'Caption 打乱策略',
  'category': '数据集 / 图说',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['caption_shuffle_copies'],
  'standard': {
    'summary': '训练时对 tag 列表的打乱策略：none（不打乱）/ shuffle（每步随机顺序）/ partial（保留前 N 个 tag，打乱其余）。',
    'effect': 'shuffle = 每次训练使用不同 tag 顺序，防止模型对固定 tag 顺序过度依赖，提升对任意顺序的响应能力。',
    'whenToUse': '使用 tag 格式图说时推荐开启 shuffle，提升推理时 tag 顺序的灵活性。',
    'avoidWhen': '自然语言图说（句子结构有语法依赖）不应打乱 tag，保持 none。'
  },
  'advanced': {
    'principle': 'Tag 顺序对 CLIP 处理的影响：CLIP tokenizer 是位置感知的，相同 tag 在不同位置的 embedding 略有不同。shuffle 训练让模型对所有位置的 tag 都有良好响应。',
    'tradeoffs': 'shuffle 会略微增加训练的随机性，单步梯度方向波动更大；但对 tag 组合的泛化能力有明显提升。'
  },
  'relatedConfigs': ['caption_extension', 'caption_tag_dropout_rate', 'caption_source_tag_ratio']
})

write('caption_variant_ratio.json', {
  'key': 'caption_variant_ratio',
  'title': 'Caption 变体比例',
  'category': '数据集 / 图说',
  'appliesTo': ['anima-lora'],
  'aliases': ['caption_variants', 'caption_variant_schedule', 'caption_variant_loss_adaptive', 'caption_variant_custom_sequence'],
  'standard': {
    'summary': '在训练中混入 caption 变体（同一图像的多种描述方式）的比例。有助于提升 LoRA 对不同描述风格的适应性。',
    'effect': '0.0 = 总是使用主 caption；0.3 = 30% 的步骤从变体 caption 池中随机选一个；1.0 = 总是使用变体。',
    'whenToUse': '每张图有多个 caption 变体时开启（通过 caption_variants 字段指定变体列表）。',
    'avoidWhen': '没有 caption 变体文件时设为 0，否则会 fallback 到主 caption 或产生错误。'
  },
  'advanced': {
    'principle': 'caption 变体通常存储在 .caption_variants.json 等辅助文件中，训练时按比例从主 caption 和变体池随机采样。',
    'tradeoffs': 'caption 多样性有助于 LoRA 的语言泛化，但需要额外制作 caption 变体文件（增加数据准备工作量）。'
  },
  'relatedConfigs': ['caption_extension', 'caption_source_tag_ratio']
})

# ── Block Weight 族 ───────────────────────────────────────────────────────────

write('block_weight_preset.json', {
  'key': 'block_weight_preset',
  'title': 'Block 权重预设',
  'category': '训练 / Block 权重',
  'appliesTo': ['sdxl-lora', 'sd-lora', 'anima-lora'],
  'aliases': ['block_weight_adaln_cross_attn', 'block_weight_adaln_mlp', 'block_weight_adaln_self_attn',
              'block_weight_cross_attn', 'block_weight_mlp', 'block_weight_self_attn', 'block_weight_vector'],
  'standard': {
    'summary': '通过预设方案快速设置不同 transformer block 类型的 LoRA 权重分配。不同 block 类型（cross-attn / self-attn / MLP 等）在训练中的贡献可以差异化加权。',
    'effect': '预设会自动填充各 block 类型的权重值，无需手动逐项配置。例如 detail 预设提高 cross-attn 权重；structure 预设提高 self-attn 权重。',
    'whenToUse': '希望针对特定训练目标（细节/风格/结构）快速调整各 block 的贡献时使用预设。',
    'avoidWhen': '不确定各 block 权重含义时保持默认（所有 block 权重相等），避免某些 block 被过度强调。'
  },
  'advanced': {
    'principle': 'LoRA 更新 ΔW_block = weight_factor × LoRA_output_block。不同 block 在生成过程中分工不同：cross-attn 控制语义/提示词响应；self-attn 控制结构/布局；MLP 控制细节纹理；adaln 控制时间步条件（对 DiT 类模型）。',
    'tradeoffs': '手动调权需要对模型架构有深入理解。预设提供经验积累的均衡方案，对大多数任务效果良好。非均匀权重可能导致某些方面过训练（如细节过于锐化而结构扭曲）。'
  },
  'relatedConfigs': ['network_dim', 'block_lr_zero_threshold', 'lora_target_linear']
})

write('block_lr_zero_threshold.json', {
  'key': 'block_lr_zero_threshold',
  'title': 'Block LR 零化阈值',
  'category': '训练 / Block 权重',
  'appliesTo': ['sdxl-lora', 'anima-lora'],
  'standard': {
    'summary': '当某个 block 的权重低于此阈值时，将其学习率设为 0（相当于不训练该 block 的 LoRA）。',
    'effect': '有效实现稀疏 block 训练：对不重要的 block 完全停止更新，减少参数量和过拟合风险。',
    'whenToUse': '配合 block weight 差异化设置使用。权重设为 0.01 的 block 不一定需要完全不训练，但若设为 0 则此阈值会让其 LR 清零。',
    'avoidWhen': '所有 block 权重相等时此阈值无意义（没有低权重 block 需要清零）。'
  },
  'advanced': {
    'principle': 'block_lr = base_lr × block_weight；若 block_lr < zero_threshold，则 block_lr = 0。本质是稀疏选择参与训练的 block。',
    'tradeoffs': '阈值设置过大会意外清零本应参与训练的 block；过小则稀疏效果不明显。'
  },
  'relatedConfigs': ['block_weight_preset', 'learning_rate']
})

# ── VRAM / 内存管理 ───────────────────────────────────────────────────────────

write('lowram.json', {
  'key': 'lowram',
  'title': '低内存模式',
  'category': '速度 / 显存',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'standard': {
    'summary': '启用低内存（RAM）模式，将大部分权重保留在 GPU 显存而非系统内存，降低 CPU RAM 占用。',
    'effect': '开启后主要权重不缓存到 CPU RAM，节省系统内存约 50%。适合 CPU RAM 较小（<16GB）的机器。',
    'whenToUse': '系统内存有限（<16GB）且 GPU 显存充足时开启。',
    'avoidWhen': 'GPU 显存不足时，low_ram 反而会增加 GPU 压力。系统内存充足时无需开启。'
  },
  'advanced': {
    'principle': '正常训练会在 CPU RAM 保留权重副本用于快速加载；low_ram 模式减少这些 RAM 副本，依赖 GPU 的 VRAM 作为主要工作区。',
    'tradeoffs': '低 RAM 模式可能影响训练速度（数据传输路径改变）；在某些情况下反而增加 GPU-CPU 数据交换。'
  },
  'relatedConfigs': ['xformers', 'gradient_checkpointing']
})

write('xformers.json', {
  'key': 'xformers',
  'title': 'xFormers 内存高效注意力',
  'category': '速度 / 显存',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'standard': {
    'summary': '启用 xFormers 库的内存高效注意力（Memory Efficient Attention）实现，显著降低注意力计算的显存占用。',
    'effect': '启用后注意力计算的显存从 O(n²) 降至接近 O(n)（使用 chunked/flash attention）。对高分辨率训练效果显著（1024×1024 可节省 30%~50% 显存）。',
    'whenToUse': '高分辨率（1024+）训练时强烈推荐开启（若 xformers 已安装）。显存不足时优先开启。',
    'avoidWhen': '未安装 xformers 包时会报错（需要 pip install xformers）。某些环境下 xformers 与 torch 版本不兼容，遇到错误时禁用。'
  },
  'advanced': {
    'principle': 'xformers 实现了 Memory Efficient Attention（MEA），将注意力计算分块处理，避免在高分辨率下实例化完整的 n×n 注意力矩阵（n = 序列长度）。底层调用 CUDA 优化 kernel。',
    'tradeoffs': 'xformers 注意力计算结果与 PyTorch 原生不完全相同（非确定性实现），可能影响可复现性；但对训练质量的实际影响极小。'
  },
  'relatedConfigs': ['gradient_checkpointing', 'mixed_precision']
})

write('gradient_checkpointing.json', {
  'key': 'gradient_checkpointing',
  'title': '梯度 Checkpointing',
  'category': '速度 / 显存',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'aliases': ['anima_block_checkpointing', 'anima_block_checkpointing_interval'],
  'standard': {
    'summary': '以重新计算换空间的显存节省技术。前向传播时不保存中间激活值，backward 时按需重新计算，节省约 40%~70% 显存。',
    'effect': '显存节省：约 40%~70%（取决于模型深度）；训练速度：约降低 20%~30%（重计算开销）。大幅扩展可训练分辨率上限。',
    'whenToUse': '显存不足以训练目标分辨率时开启。8GB 显卡训练 SDXL 1024 通常必须开启。',
    'avoidWhen': '显存充足时不建议开启（每步速度下降约 20%，无必要）。'
  },
  'advanced': {
    'principle': '在前向传播时，对指定的模块只保存输入（checkpoint），丢弃中间激活；backward 时从 checkpoint 重新运行前向以获取中间激活。总内存复杂度从 O(L) 降至 O(√L)（L = 层数），但计算量增加约 1/3。Anima 的 anima_block_checkpointing 控制每几个 DiT block 设一个 checkpoint。',
    'tradeoffs': 'checkpoint 间隔越小（更多 checkpoint）= 显存节省越少但重计算越少；间隔越大 = 显存节省越多但重计算开销越大。通常每个 block 一个 checkpoint（interval=1）是默认平衡点。'
  },
  'relatedConfigs': ['mixed_precision', 'anima_block_prefetch', 'xformers']
})

write('anima_block_prefetch.json', {
  'key': 'anima_block_prefetch',
  'title': 'Anima Block 预取（CPU Offload）',
  'category': '速度 / 显存',
  'appliesTo': ['anima-lora'],
  'aliases': ['anima_block_prefetch_depth', 'anima_block_prefetch_mode'],
  'standard': {
    'summary': '将 Anima DiT block 的权重在不使用时卸载到 CPU（offload），使用前预取回 GPU，显著降低 VRAM 峰值，代价是训练速度下降。',
    'effect': '开启后大基座（如 Anima 全尺寸）可在 <12GB 显卡上运行 LoRA 训练，但速度可能降低 30%~60%（取决于预取深度和 PCIe 带宽）。',
    'whenToUse': '大模型（>12GB VRAM）在低显存 GPU（<16GB）上训练时的保命选项。',
    'avoidWhen': '显存充足时（>24GB for anima full）不需要，开启会降低速度。PCIe 带宽低（如 PCIe 3.0 ×8 以下）的机器速度下降更明显。'
  },
  'advanced': {
    'principle': '在 DiT block 的 forward/backward 前，将下 prefetch_depth 个 block 的权重异步从 CPU 传输到 GPU；当前 block 计算完成后将其权重异步卸载回 CPU。形成流水线：CPU→GPU 传输与 GPU 计算重叠。',
    'intervention': 'prefetch_mode=adaptive：基于 blockskip 感知，不跳过的 block 才预取（减少不必要的数据传输）；prefetch_mode=original：均匀预取（parity 基准）。',
    'tradeoffs': 'prefetch_depth 越大 = 提前传输的 block 越多 = 传输与计算重叠越充分 = 速度越快，但峰值 VRAM 增加；深度过大反而没有显存节省效果。'
  },
  'relatedConfigs': ['gradient_checkpointing', 'blocks_to_swap', 'anima_block_residency_min_params']
})

write('blocks_to_swap.json', {
  'key': 'blocks_to_swap',
  'title': '换入/换出的 Block 数',
  'category': '速度 / 显存',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'aliases': ['block_swap_strategy'],
  'standard': {
    'summary': '将指定数量的 transformer block 权重换出到 CPU 内存，只在需要时换入 GPU，降低 VRAM 峰值。',
    'effect': '每个 block 约占 400MB~2GB VRAM（取决于模型），换出 N 个 block 可节省相应 VRAM。代价是训练速度下降（PCIe 传输开销）。',
    'whenToUse': '显存不足但不想用 gradient_checkpointing 时的替代方案；或两者结合使用以最大化显存节省。',
    'avoidWhen': '显存充足时无需使用（会降低训练速度）。'
  },
  'advanced': {
    'principle': '类似 CPU offload 但以整个 block 为单位。选择换出频率最低（离输出最远）的 block，最大化换出收益与换入开销比。',
    'tradeoffs': 'block_swap 的速度开销取决于 PCIe 带宽。NVMe → GPU Direct Storage 可以绕过 CPU，提升传输速度（实验性）。'
  },
  'relatedConfigs': ['gradient_checkpointing', 'anima_block_prefetch']
})

write('offload_optimizer_device.json', {
  'key': 'offload_optimizer_device',
  'title': '优化器状态卸载',
  'category': '速度 / 显存',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'aliases': ['offload_param_to_cpu', 'offload_gradients', 'disk_offload_path'],
  'standard': {
    'summary': '将优化器状态（Adam 的 m/v 动量）卸载到 CPU 或磁盘，以节省 GPU 显存。显存节省约等于参数量大小（Adam 有 2× 参数量的动量存储）。',
    'effect': 'CPU offload：优化器 step 在 CPU 执行，节省显存约等于模型参数量 × 2；disk offload：进一步卸载到 NVMe，显存节省更大但速度更慢。',
    'whenToUse': '极低显存场景（<8GB）的保命选项，配合 gradient_checkpointing 和 xformers 使用。优先考虑 AdamW8bit 省显存（速度更好）。',
    'avoidWhen': '显存足够的情况下，卸载优化器会显著拖慢训练速度（尤其是磁盘卸载，每步需要读写大量数据）。'
  },
  'advanced': {
    'principle': 'CPU offload：每步 optimizer.step 前将梯度传到 CPU，在 CPU 上执行 AdamW 更新，再将新参数传回 GPU。增加约 2× CPU-GPU 数据传输。disk offload：更进一步将动量存储在 NVMe，仅在更新时读取。',
    'tradeoffs': '卸载的速度代价：CPU offload ≈ 2-5× 慢（取决于 PCIe 带宽）；disk offload ≈ 5-20× 慢（取决于 SSD 速度）。但对于原本显存不足无法训练的场景，这是唯一选择。'
  },
  'relatedConfigs': ['gradient_checkpointing', 'anima_block_prefetch', 'xformers']
})

write('activation_compression_enabled.json', {
  'key': 'activation_compression_enabled',
  'title': '激活值压缩',
  'category': '速度 / 显存',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['activation_compression_dtype', 'activation_compression_min_tensor_mb',
              'activation_cpu_offload_enabled', 'activation_cpu_offload_min_tensor_mb', 'activation_cpu_offload_pool_gb'],
  'standard': {
    'summary': '对前向传播的中间激活值进行量化压缩存储（如 fp8/int8），减少激活值占用的显存。',
    'effect': '激活值压缩后以低精度格式保存，backward 时解压缩使用。根据压缩比可节省 20%~60% 的激活显存。',
    'whenToUse': '开启 gradient_checkpointing 后仍然显存不足时可叠加使用。显存 <12GB 且需要训练大模型 LoRA 时。',
    'avoidWhen': '压缩/解压缩引入额外计算开销和精度损失；显存足够时不值得。'
  },
  'advanced': {
    'principle': '在激活值保存点（checkpoint 位置）对激活 tensor 量化（如 FP8 = 原始 1/4 大小），backward 时反量化（dequantize）后用于梯度计算。量化引入的精度误差通常对训练收敛影响极小。',
    'tradeoffs': 'activation_cpu_offload 是另一路：将激活直接卸载到 CPU（不量化），速度更慢但精度更高；compression 量化后仍在 GPU，速度损失更小但精度略低。两者可组合。'
  },
  'relatedConfigs': ['gradient_checkpointing', 'anima_block_prefetch']
})

# ── 高级训练控制 ──────────────────────────────────────────────────────────────

write('noise_offset.json', {
  'key': 'noise_offset',
  'title': 'Noise Offset',
  'category': '训练 / 噪声控制',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'standard': {
    'summary': '在训练噪声中加入全局偏移量，帮助模型学习生成更暗或更亮的图像（解决 SD 生成图偏中等亮度的问题）。',
    'effect': '启用后（如 0.1）模型可以更好地生成极暗或极亮场景。值越大偏移越强。',
    'whenToUse': '训练数据集包含明显暗部或高光细节的图像时（如夜景、强光场景）开启。值 0.05~0.1 是常见范围。',
    'avoidWhen': '普通光照条件的数据集无需使用。值过大（>0.2）会引入不必要的亮度偏差。'
  },
  'advanced': {
    'principle': '在采样的噪声 ε 上加入全局偏移 Δ：ε_noisy = ε + Δ × N(0, 1)_scalar。这个全局偏移在整张图上均匀作用，改变图像的整体亮度域覆盖。原始论文提出此方法解决 DDPM 训练的亮度偏差问题。',
    'tradeoffs': 'noise offset 会略微增加训练多样性（更多亮度范围），但需要数据集本身包含相应亮度范围的图像，否则训练效果有限。'
  },
  'relatedConfigs': ['adaptive_noise_scale', 'zero_terminal_snr']
})

write('adaptive_noise_scale.json', {
  'key': 'adaptive_noise_scale',
  'title': '自适应噪声缩放',
  'category': '训练 / 噪声控制',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'standard': {
    'summary': '自适应调整 noise offset 的幅度：根据每步噪声的实际统计量动态设置偏移大小，而非固定值。',
    'effect': '使 noise offset 根据实际噪声分布自动调整，比固定 noise_offset 更精准地覆盖极端亮度范围。',
    'whenToUse': '开启 noise_offset 时可以考虑改用 adaptive_noise_scale 获得更稳定的效果。',
    'avoidWhen': '不了解 noise offset 的效果时，两者都不开启更安全。'
  },
  'advanced': {
    'principle': '对每步噪声 tensor 计算统计量（如 std），以此动态确定 offset 大小，使偏移幅度与噪声强度自适应匹配。',
    'tradeoffs': '自适应版本实现略复杂，在某些步骤中偏移幅度可能意外过大（噪声统计量异常时）。'
  },
  'relatedConfigs': ['noise_offset', 'zero_terminal_snr']
})

write('zero_terminal_snr.json', {
  'key': 'zero_terminal_snr',
  'title': 'Zero Terminal SNR',
  'category': '训练 / 噪声控制',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'standard': {
    'summary': '使训练使用的 noise schedule 在 T=1000（最终时间步）时信噪比精确等于 0，确保训练和推理的噪声分布严格对齐。',
    'effect': '修正原始 DDPM 训练中 T=1000 时 SNR 非零的微小偏差。对生成极暗/极亮图像有帮助，与 noise_offset 功能互补。',
    'whenToUse': '搭配 v-prediction loss 使用时推荐开启（v-prediction 模型特别依赖 SNR=0 的边界条件）。SDXL 使用 v-pred 时可考虑开启。',
    'avoidWhen': '使用原始 epsilon-prediction 的模型（如 SD1.5 标准版）开启效果有限甚至有负面影响。'
  },
  'advanced': {
    'principle': '将 α_T（signal_to_noise(T)）调整为精确 0，使 q(x_T|x_0) = N(0, I)（纯噪声）。标准 DDPM 中 α_T ≈ 10⁻⁴，与 0 的偏差导致模型在极端噪声步骤有微小但累积的误差。',
    'tradeoffs': '开启 zero_terminal_snr 需要配合相应的 v-prediction 推理；若模型未以此训练，推理时需要特殊处理（部分推理框架已自动处理）。'
  },
  'relatedConfigs': ['noise_offset', 'adaptive_noise_scale']
})

write('multires_noise_iterations.json', {
  'key': 'multires_noise_iterations',
  'title': '多分辨率噪声',
  'category': '训练 / 噪声控制',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'aliases': ['multires_noise_discount'],
  'standard': {
    'summary': '使用多分辨率噪声替代标准高斯噪声：生成多个不同分辨率的噪声图并加权叠加，有助于学习多尺度特征。',
    'effect': 'iterations=6 = 生成 6 个不同分辨率的噪声层叠加。使模型同时学习全局结构和局部细节的噪声去除。',
    'whenToUse': '希望 LoRA 同时改善全局构图和局部细节时可以尝试。对风格类 LoRA 可能有益。',
    'avoidWhen': '不确定效果时不建议使用，多分辨率噪声改变了训练分布，可能需要更多步数才能收敛。'
  },
  'advanced': {
    'principle': '生成 N 个不同下采样分辨率的高斯噪声，上采样回原始分辨率后加权叠加（discount 控制每层权重的衰减）。多分辨率噪声包含更多低频成分，引导模型学习全局特征。',
    'tradeoffs': 'multires_noise 显著改变噪声分布，与标准 noise schedule 不完全兼容，可能影响推理时使用标准采样器的效果。'
  },
  'relatedConfigs': ['noise_offset', 'zero_terminal_snr']
})

print('Caption / Block Weight / VRAM / 噪声控制: 全部条目完成')
