"""
批量生成 LoRA 网络结构 + 训练核心基础字段 wiki entries
运行: python tools/gen_wiki_batch3.py
"""
import json, os

ENTRIES_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'training-wiki', 'entries')

def write(name, data):
    path = os.path.join(ENTRIES_DIR, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'  wrote {name}')

# ── LoRA 网络结构 ────────────────────────────────────────────────────────────

write('network_dim.json', {
  'key': 'network_dim',
  'title': 'LoRA Rank（网络维度）',
  'category': 'LoRA / 网络结构',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'aliases': ['rank', 'lora_rank'],
  'standard': {
    'summary': 'LoRA 的秩（rank），决定低秩矩阵 A 和 B 的中间维度大小。rank 越高，LoRA 的表达能力越强，但参数量和显存占用也越大。',
    'effect': 'rank=4：最低表达力，适合简单风格；rank=16：均衡（最常用）；rank=64~128：接近全量微调的表达力，适合复杂概念。',
    'whenToUse': 'rank=16 是大多数 LoRA 任务的起点。角色/概念类 LoRA 用 16~64；风格类可低至 4~8；需要精细细节时提高到 64~128。',
    'avoidWhen': 'rank > 128 时通常收益递减，参数已接近全量微调数量级，不如考虑使用更完整的微调方式。'
  },
  'advanced': {
    'principle': 'LoRA: ΔW = α/rank × B × A，其中 A ∈ R^{rank×d_in}，B ∈ R^{d_out×rank}。rank 控制中间维度，决定 LoRA 的信息瓶颈宽度。参数量 = (d_in + d_out) × rank，线性增长。',
    'tradeoffs': 'rank 翻倍 → 参数量翻倍 → 过拟合风险翻倍 → 通常需要更多数据。rank 与 network_alpha 共同决定实际缩放：有效缩放 = alpha/rank，建议 alpha <= rank 以避免缩放过大。'
  },
  'relatedConfigs': ['network_alpha', 'network_module', 'lora_rank_dropout']
})

write('network_alpha.json', {
  'key': 'network_alpha',
  'title': 'LoRA Alpha（缩放系数）',
  'category': 'LoRA / 网络结构',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'aliases': ['alpha', 'lora_alpha'],
  'standard': {
    'summary': 'LoRA 输出的缩放系数。实际学习率有效缩放 = lr × alpha / rank。通常设为 rank 的 1/2 或等于 rank。',
    'effect': 'alpha=rank：缩放系数为 1，LoRA 权重按原始幅度生效；alpha=rank/2：缩放为 0.5，更保守；alpha=1：若 rank=16 则有效缩放 1/16，等价于 LR 极小。',
    'whenToUse': '推荐 alpha = rank 或 rank/2（如 rank=16，alpha=8~16）。使用高 rank 时为了稳定性可降低 alpha/rank 比值。',
    'avoidWhen': 'alpha > rank（缩放 > 1）会放大 LoRA 更新，训练初期可能不稳定。alpha=0 则 LoRA 永远输出 0，训练无效。'
  },
  'advanced': {
    'principle': 'ΔW = (alpha/rank) × B × A。alpha/rank 等价于对 LoRA 输出的全局乘法缩放，与 lr 正交但效果相似。维持 alpha/rank 常数时改变 rank 不影响收敛速度。',
    'tradeoffs': '实际上 alpha 和 lr 是高度冗余的：lr × (alpha/rank) 才是有效步长。常见做法是固定 alpha=rank（缩放=1），只调 lr。'
  },
  'relatedConfigs': ['network_dim', 'learning_rate']
})

write('network_module.json', {
  'key': 'network_module',
  'title': 'LoRA 网络模块',
  'category': 'LoRA / 网络结构',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'standard': {
    'summary': '选择 LoRA 的实现模块。networks.lora 是标准线性 LoRA；networks.lora_fa 是 Frozen-A 变体；lora_flux / lora_sd3 是针对特定架构的专用实现。',
    'effect': '不同模块决定 LoRA 如何注入目标层、是否支持特殊变体（DoRA、LyCORIS 等）。',
    'whenToUse': '大多数情况使用默认值即可，训练器会根据模型类型自动选择合适的模块。',
    'avoidWhen': '手动修改模块路径需要了解内部实现，错误的模块路径会导致训练失败。'
  },
  'advanced': {
    'principle': '模块以类路径形式指定（如 networks.lora），训练器通过 importlib 动态加载并初始化 LoRA 结构。',
    'tradeoffs': '自定义模块允许接入第三方 LoRA 实现，但需要与训练器接口兼容。'
  },
  'relatedConfigs': ['network_dim', 'network_alpha']
})

write('lora_rank_dropout.json', {
  'key': 'lora_rank_dropout',
  'title': 'LoRA Rank Dropout',
  'category': 'LoRA / 网络结构',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'aliases': ['network_dropout'],
  'standard': {
    'summary': '训练时随机丢弃 LoRA 的部分 rank 维度，类似于 Dropout 的正则化效果。默认 0（不丢弃）。',
    'effect': '设为 0.1 = 每步随机丢弃 10% 的 rank 维度。增加正则化，降低对特定 rank 方向的依赖，有助于泛化。',
    'whenToUse': '数据集小但 rank 较高（>32）时可开启（0.05~0.1）防止过拟合。',
    'avoidWhen': '低 rank（<=8）时 dropout 会过度损失有限的表达能力。高 dropout 率（>0.3）容易训练不稳定。'
  },
  'advanced': {
    'principle': '每个 forward 随机生成 mask，将选中的 rank 维度清零（Bernoulli 采样）。等价于训练了一系列不同 rank 子集，提高泛化性。',
    'tradeoffs': 'rank dropout 增加训练随机性，配合较高 LR 才能充分采样各 rank 子集；过低 LR 时 dropout 效果不明显。'
  },
  'relatedConfigs': ['network_dim', 'network_alpha']
})

write('lora_target_linear.json', {
  'key': 'lora_target_linear',
  'title': 'LoRA 目标线性层',
  'category': 'LoRA / 网络结构',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'standard': {
    'summary': '是否将 LoRA 注入所有线性层（包括 MLP 的 fc1/fc2）。开启后注入面更广，表达力更强。',
    'effect': '默认 False = 只注入注意力层（Q/K/V/Out）；True = 同时注入 MLP 的全连接层，参数量大幅增加。',
    'whenToUse': '复杂概念/多角色训练时开启，以获得更强的表达力。简单风格 LoRA 可保持 False。',
    'avoidWhen': '显存紧张时，注入 MLP 线性层会显著增加参数量和显存。'
  },
  'advanced': {
    'principle': '遍历模型所有 nn.Linear 层（而非只有 attention projection），为每个线性层添加 LoRA 旁路。MLP 层的激活函数位于线性层之间，不受 LoRA 影响。',
    'tradeoffs': '注入 MLP 可以捕获特征空间的变化，不只是注意力路径，但参数量约增加 2~3 倍。'
  },
  'relatedConfigs': ['network_dim', 'network_module']
})

write('train_text_encoder.json', {
  'key': 'train_text_encoder',
  'title': '训练文本编码器',
  'category': 'LoRA / 训练目标',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'aliases': ['train_text_encoder_1', 'train_text_encoder_2'],
  'standard': {
    'summary': '是否同时训练文本编码器（CLIP 等）的 LoRA 权重。开启后可以让模型更好地理解和绑定触发词。',
    'effect': '关闭（默认）= 只训练 UNet/DiT，文本编码器固定；开启 = TE 同时训练，触发词与概念绑定更紧密，但显存增加约 20%~50%。',
    'whenToUse': '训练新概念/角色且触发词响应不佳时开启。简单风格 LoRA 或数据集图说对应简单时可关闭。',
    'avoidWhen': '数据集极小（<10张）时训练 TE 容易过拟合，导致其他提示词失效。显存不足时优先关闭。'
  },
  'advanced': {
    'principle': 'TE LoRA 通过改变 CLIP 的 token embedding 空间，使特定触发词的嵌入向量更接近概念的视觉特征。UNet LoRA 学习在给定 TE 输出时如何生成，两者协同工作。',
    'tradeoffs': '训练 TE 会略微改变整个文本编码空间，可能影响与其他 LoRA 的兼容性。一般 TE LR 应远低于 UNet LR。'
  },
  'relatedConfigs': ['text_encoder_lr', 'unet_lr', 'learning_rate']
})

# ── 训练基础参数 ─────────────────────────────────────────────────────────────

write('max_train_steps.json', {
  'key': 'max_train_steps',
  'title': '最大训练步数',
  'category': '训练 / 基础',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'aliases': ['num_train_steps', 'train_steps'],
  'standard': {
    'summary': '控制训练的总步数上限（优先于 epoch 数）。一步 = 一次优化器更新（forward + backward + optimizer.step）。',
    'effect': '典型范围：简单风格 100~300步；角色 LoRA 300~1000步；复杂概念 1000~3000步。',
    'whenToUse': '推荐用步数控制训练时长（比 epoch 更直观，尤其是数据集大小变化时）。',
    'avoidWhen': '步数过多（>5000步且数据集<50张）容易过拟合，建议配合 EMA 和 safeguard 使用。'
  },
  'advanced': {
    'principle': '有效步数 = max_train_steps / gradient_accumulation_steps（若使用梯度累积）。实际消耗显卡时间正比于步数 × 每步时间。',
    'tradeoffs': '步数 vs epoch：相同数据集大小时等效，但 max_train_steps 在数据集大小变化时更稳定（不随数据量变化而意外变长/变短）。'
  },
  'relatedConfigs': ['num_train_epochs', 'train_batch_size', 'gradient_accumulation_steps']
})

write('num_train_epochs.json', {
  'key': 'num_train_epochs',
  'title': '训练 Epoch 数',
  'category': '训练 / 基础',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'standard': {
    'summary': '以 epoch（整个数据集过完一轮）为单位控制训练时长。实际步数 = epoch × (数据集大小 / batch_size)。',
    'effect': '相同数据集下与 max_train_steps 等效；数据集大时 epoch 模式更直观（训练几遍数据集）。',
    'whenToUse': '数据集固定、习惯以「过几遍数据」衡量训练量时使用。训练量会随数据集大小自动调整。',
    'avoidWhen': '数据集大小不固定时，epoch 控制的实际步数可能意外变长/变短，建议改用 max_train_steps。'
  },
  'advanced': {
    'principle': '当 max_train_steps 和 num_train_epochs 同时设置时，以先达到的为准（min 语义）。',
    'tradeoffs': 'epoch 模式的隐患：数据集包含动态增强（augmentation）时，每 epoch 的样本分布略有不同，可能需要更多 epoch 才能充分学习。'
  },
  'relatedConfigs': ['max_train_steps', 'train_batch_size']
})

write('train_batch_size.json', {
  'key': 'train_batch_size',
  'title': '训练批大小',
  'category': '训练 / 基础',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'standard': {
    'summary': '每步处理的图像数量。较大 batch 训练更稳定但显存占用更多；较小 batch 有更高梯度噪声。',
    'effect': 'batch=1（默认）= 每步 1 张图，梯度噪声最大但显存最省；batch=4 = 每步平均 4 张，梯度更稳定但需要 4× 显存。',
    'whenToUse': '大多数 LoRA 训练使用 batch=1~4。8GB 显卡通常只能 batch=1~2；16GB 可尝试 batch=4。',
    'avoidWhen': 'batch > 8 对显存要求极高，且 LoRA 训练本身数据集较小，大 batch 意义有限。'
  },
  'advanced': {
    'principle': 'batch size 越大，每步梯度估计越准确（方差更低），但梯度方向更"平均"，可能错过尖锐的局部最优。理论上 bs × lr 应保持正比（linear scaling rule），但实践中 LoRA 不严格遵守。',
    'tradeoffs': 'batch=1 + gradient_accumulation_steps=4 ≈ batch=4（梯度等效），但显存占用类似 batch=1。'
  },
  'relatedConfigs': ['gradient_accumulation_steps', 'max_train_steps', 'learning_rate']
})

write('gradient_accumulation_steps.json', {
  'key': 'gradient_accumulation_steps',
  'title': '梯度累积步数',
  'category': '训练 / 基础',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'standard': {
    'summary': '每 N 步才执行一次 optimizer.step()。模拟大 batch 训练（有效 batch = batch_size × gradient_accumulation_steps），但只使用 batch=1 的显存。',
    'effect': 'gradient_accumulation_steps=4 相当于 batch=4，但只用 batch=1 的显存。有效步数 = max_train_steps，但每有效步内部执行 4 次 forward/backward。',
    'whenToUse': '显存不足以增大 batch_size 时，通过梯度累积模拟大 batch 效果。8GB 显卡可 batch=1 + accum=4。',
    'avoidWhen': 'batch_size 已经满足需求时无需额外累积（会降低训练速度，每步耗时 × N）。'
  },
  'advanced': {
    'principle': '累积 N 步梯度（不执行 optimizer.step），第 N 步时除以 N 取平均后更新参数。梯度等效于 batch × N 的大 batch，但每步的 BN/LN statistics 仍基于小 batch。',
    'tradeoffs': '梯度累积 vs 大 batch：计算时间线性增加（N 步 forward），但显存等价 batch=1。若有 BatchNorm 层（SDXL/SD UNet），累积可能影响 BN statistics 准确性。'
  },
  'relatedConfigs': ['train_batch_size', 'learning_rate', 'max_train_steps']
})

write('mixed_precision.json', {
  'key': 'mixed_precision',
  'title': '混合精度训练',
  'category': '训练 / 精度',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'standard': {
    'summary': '控制训练时使用的浮点精度。bf16 = BFloat16（推荐，数值范围更大）；fp16 = Float16（需要 GradScaler）；no = FP32 全精度（最精确但最慢）。',
    'effect': 'bf16：显存约为 fp32 的 1/2，速度更快，数值稳定（动态范围与 fp32 相同）；fp16：显存 1/2，但容易出现 overflow（需要 loss scaling）。',
    'whenToUse': '推荐 bf16（Ampere 以上显卡支持，RTX 30/40 系列）。老显卡（Turing/V100）只支持 fp16，需要 GradScaler。',
    'avoidWhen': 'no/fp32 只在需要极高精度调试时使用，显存占用翻倍且速度降低约 40%。'
  },
  'advanced': {
    'principle': 'bf16 = 1 符号位 + 8 指数位 + 7 尾数位（与 fp32 指数位相同）；fp16 = 1+5+10（指数位仅 5，动态范围小，大梯度下溢出风险高）。训练器使用 amp.autocast 自动选择精度。',
    'tradeoffs': 'bf16 尾数位精度不如 fp16，在需要极高精度的数值计算中不如 fp16；但 bf16 的动态范围与 fp32 相同，实践中 LoRA 训练极少遇到 bf16 数值问题。'
  },
  'relatedConfigs': ['optimizer_type', 'torch_compile']
})

write('save_every_n_steps.json', {
  'key': 'save_every_n_steps',
  'title': '每 N 步保存一次',
  'category': '训练 / 保存',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'standard': {
    'summary': '每隔 N 个优化步保存一次 LoRA checkpoint。0 = 只在训练结束时保存。',
    'effect': '设为 100 → 每 100 步保存一次，可以从中间步骤的 checkpoint 选择最佳版本。',
    'whenToUse': '长训练（>300步）推荐每 50~100 步保存一次，方便对比不同步数的效果找到最优点。',
    'avoidWhen': '保存频率过高（如每 10 步）会占用大量磁盘空间，每个 LoRA 文件约 60~200MB。'
  },
  'advanced': {
    'principle': '每 N 步调用 save_model()，写出当前 LoRA state_dict（不含优化器状态）。若同时开启 EMA，同时保存 EMA 权重副本。',
    'tradeoffs': '频繁保存 = 更多选择但更多磁盘空间；不频繁 = 省空间但可能错过最优步数。'
  },
  'relatedConfigs': ['save_every_n_epochs', 'save_last_n_steps', 'ema_enabled']
})

write('save_every_n_epochs.json', {
  'key': 'save_every_n_epochs',
  'title': '每 N Epoch 保存一次',
  'category': '训练 / 保存',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'standard': {
    'summary': '每隔 N 个 epoch 保存一次 LoRA checkpoint，配合 epoch 训练使用。',
    'effect': '功能与 save_every_n_steps 相同，但以 epoch 为单位。若两者都设置，取先到的触发。',
    'whenToUse': '使用 epoch 控制训练时长时使用。',
    'avoidWhen': '使用 max_train_steps 控制训练时，save_every_n_epochs 可能永不触发（epoch 边界不与步数对齐）。'
  },
  'advanced': {
    'principle': 'epoch 结束时检查是否满足 save_every_n_epochs 条件（current_epoch % n == 0）。',
    'tradeoffs': '与步数保存的差异：epoch 边界取决于数据集大小，不如步数控制精确。'
  },
  'relatedConfigs': ['save_every_n_steps', 'num_train_epochs']
})

write('save_last_n_steps.json', {
  'key': 'save_last_n_steps',
  'title': '只保留最近 N 个 checkpoint',
  'category': '训练 / 保存',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'standard': {
    'summary': '限制最多保留多少个中间 checkpoint（最近的 N 个），旧的自动删除。0 = 保留所有。',
    'effect': '防止磁盘被大量 checkpoint 占满，仅保留最近几个版本用于对比。',
    'whenToUse': '磁盘空间有限时推荐设为 3~5，只保留最近几个版本。',
    'avoidWhen': '希望保留全部 checkpoint 对比时设为 0。'
  },
  'advanced': {
    'principle': '每次保存新 checkpoint 时，检查现有 checkpoint 数量，超过 N 则删除最旧的（按时间戳排序）。',
    'tradeoffs': '删除是不可逆的，若误删了最优 checkpoint 则无法恢复。建议至少保留 3 个以上。'
  },
  'relatedConfigs': ['save_every_n_steps', 'save_every_n_epochs']
})

write('output_dir.json', {
  'key': 'output_dir',
  'title': '输出目录',
  'category': '训练 / 输出',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'standard': {
    'summary': 'LoRA 权重文件的保存目录。训练完成后，最终 LoRA 和所有中间 checkpoint 保存在此目录下。',
    'effect': '目录不存在时自动创建。支持绝对路径和相对路径（相对于训练器工作目录）。',
    'whenToUse': '每次训练建议使用独立的输出目录，便于区分不同实验的结果。',
    'avoidWhen': '多个训练任务共用同一输出目录时，文件名可能冲突，建议使用不同目录或不同 output_name。'
  },
  'advanced': {
    'principle': '输出文件命名规则：{output_name}-{step}.safetensors（中间）/ {output_name}.safetensors（最终）。EMA 文件额外添加 _ema 后缀。',
    'tradeoffs': '磁盘空间需要留足：每个 16-rank LoRA 约 20~80MB，64-rank 约 80~320MB；若频繁保存 checkpoint 需要预留更多空间。'
  },
  'relatedConfigs': ['output_name', 'save_every_n_steps']
})

write('output_name.json', {
  'key': 'output_name',
  'title': '输出文件名',
  'category': '训练 / 输出',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'standard': {
    'summary': 'LoRA 文件的基础名称（不含扩展名）。最终文件名为 {output_name}.safetensors。',
    'effect': '设置有意义的名称有助于区分不同实验（如 character_v1、style_watercolor）。',
    'whenToUse': '每次实验设置描述性名称，包含角色/风格名称和版本号。',
    'avoidWhen': '名称中避免使用空格或特殊字符，部分系统（A1111、ComfyUI）对文件名有限制。'
  },
  'advanced': {
    'principle': '中间 checkpoint 命名：{output_name}-{step}.safetensors；最终文件：{output_name}.safetensors。EMA 副本：{output_name}_ema.safetensors。',
    'tradeoffs': '若文件名已存在，默认覆盖（不会添加序号）。建议每次修改参数时更新版本号。'
  },
  'relatedConfigs': ['output_dir']
})

write('seed.json', {
  'key': 'seed',
  'title': '随机种子',
  'category': '训练 / 基础',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'standard': {
    'summary': '控制训练的随机性（数据顺序、初始化、dropout等）。相同 seed 在相同数据/参数下产出相同结果。',
    'effect': '固定 seed（如 42）= 可复现训练；-1 或不设置 = 每次训练结果略有不同。',
    'whenToUse': '需要比较不同超参设置的效果时，固定 seed 排除随机性干扰。',
    'avoidWhen': '测试泛化性（看不同随机性下的训练是否都能收敛）时可以不固定 seed。'
  },
  'advanced': {
    'principle': '设置 torch.manual_seed + numpy seed + Python random seed，影响：权重初始化、数据集 shuffle 顺序、dropout mask、data augmentation 随机性。',
    'tradeoffs': '固定 seed 的复现性依赖于相同的代码版本、CUDA 版本和 GPU 型号——不同 GPU 上即使相同 seed 结果也可能不同（CUDA nondeterminism）。'
  },
  'relatedConfigs': []
})

write('resolution.json', {
  'key': 'resolution',
  'title': '训练分辨率',
  'category': '数据集 / 预处理',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'standard': {
    'summary': '训练时图像的目标分辨率（像素）。单值（如 512）= 正方形；两值（如 512,768）= 宽×高。',
    'effect': 'SD1.5 基础分辨率 512；SDXL 为 1024；Anima 支持灵活分辨率（通过 bucket）。影响显存和训练效果。',
    'whenToUse': '匹配目标模型的训练分辨率。SDXL = 1024；SD1.5 = 512；Anima = 512~1024（视显存）。',
    'avoidWhen': '分辨率过高（>1024）时显存需求指数级增长，且超出基础模型训练分辨率后效果不一定更好。'
  },
  'advanced': {
    'principle': '训练分辨率影响注意力计算量（O(n²) 随序列长度平方增长）。1024² = 4× 显存相比 512²。Bucket 训练下，此值作为最大分辨率上限，实际每图按比例裁剪。',
    'tradeoffs': '高分辨率训练更好地保留细节，但需要更多显存和时间。通常建议匹配推理时的目标分辨率。'
  },
  'relatedConfigs': ['bucket_reso_steps', 'enable_bucket']
})

write('enable_bucket.json', {
  'key': 'enable_bucket',
  'title': '启用 Bucket 分辨率',
  'category': '数据集 / 预处理',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'standard': {
    'summary': '启用多分辨率桶（bucket）训练，允许不同尺寸的图像分组训练，减少黑边和裁剪损失。',
    'effect': '关闭 = 所有图像强制缩放到同一分辨率（可能产生拉伸/黑边）；开启 = 按比例分组到最近的桶，保留原始比例。',
    'whenToUse': '数据集包含不同纵横比的图像时强烈推荐开启。现代训练几乎都应该开启。',
    'avoidWhen': '所有训练图像已是相同分辨率时无需开启（效果相同但略有开销）。'
  },
  'advanced': {
    'principle': 'Bucket 训练：将图像按分辨率比例分组（如 4:3、1:1、3:4 等），同一桶内的图像 batch 在一起，避免跨比例混合造成的形状不一致。Bucket 分辨率以 bucket_reso_steps 为步长枚举。',
    'tradeoffs': '开启后同一 batch 内图像分辨率一致（同桶），但 batch 之间分辨率可能不同，对 compile 的固定形状优化有影响。'
  },
  'relatedConfigs': ['resolution', 'bucket_reso_steps', 'bucket_no_upscale']
})

write('bucket_reso_steps.json', {
  'key': 'bucket_reso_steps',
  'title': 'Bucket 分辨率步长',
  'category': '数据集 / 预处理',
  'appliesTo': ['sdxl-lora', 'sd-lora', 'anima-lora'],
  'standard': {
    'summary': 'Bucket 分辨率的枚举步长（像素）。决定生成多少个不同分辨率的桶，值越小桶越细，图像裁剪损失越少。',
    'effect': 'steps=64 = 分辨率以 64 像素为步长（256/320/384...）；steps=32 = 桶更密，图像更精准分组。',
    'whenToUse': '默认 64 适合大多数场景。数据集比例差异大（如同时有 1:1 和 16:9 图）时可降低到 32。',
    'avoidWhen': 'steps 过小（<16）会生成大量极少用到的桶，内存开销增加且意义不大。'
  },
  'advanced': {
    'principle': '桶生成算法：从最小分辨率到最大分辨率，以 steps 为间隔枚举所有面积接近 target_resolution² 的分辨率对。每张图像被分配到面积差异最小的桶。',
    'tradeoffs': '步长越小 = 桶越多 = 图像裁剪损失越少，但相同桶内图像数量更少（batch 内相同分辨率的图更难凑齐）。'
  },
  'relatedConfigs': ['enable_bucket', 'resolution', 'bucket_no_upscale']
})

write('bucket_no_upscale.json', {
  'key': 'bucket_no_upscale',
  'title': '禁止 Bucket 放大',
  'category': '数据集 / 预处理',
  'appliesTo': ['sdxl-lora', 'sd-lora'],
  'standard': {
    'summary': '开启后，Bucket 训练不会将小于目标分辨率的图像放大（超分），只缩小不放大。',
    'effect': '防止小图被放大训练（放大引入的模糊/噪声可能影响训练质量）。图像保持原始分辨率或缩小到匹配的桶。',
    'whenToUse': '数据集中包含低分辨率图像（如 256×256）时推荐开启，避免放大劣化图像质量。',
    'avoidWhen': '数据集全为高分辨率图像时无需开启（不会触发放大）。'
  },
  'advanced': {
    'principle': '在桶分配时，若图像最大维度小于桶的最小维度，则不分配到该桶而是寻找面积更小的桶（或丢弃）。',
    'tradeoffs': '可能导致小图被分配到更小的桶（更低分辨率训练），影响这部分数据的贡献度。'
  },
  'relatedConfigs': ['enable_bucket', 'resolution', 'bucket_reso_steps']
})

print('LoRA 结构 + 训练基础: 全部条目完成')
