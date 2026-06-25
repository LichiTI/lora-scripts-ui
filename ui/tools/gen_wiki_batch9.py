"""
最终批次: 清扫剩余 40 个字段
"""
import json, os

ENTRIES_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'training-wiki', 'entries')

def write(name, data):
    path = os.path.join(ENTRIES_DIR, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'  wrote {name}')

write('lulynx_ema_enabled.json', {
  'key': 'lulynx_ema_enabled',
  'title': 'EMA（SDXL/旧版路线）',
  'category': '训练 / 平滑',
  'appliesTo': ['sdxl-lora'],
  'aliases': ['lulynx_ema_decay', 'lulynx_auto_check_every', 'lulynx_auto_early_stop_patience'],
  'standard': {
    'summary': 'SDXL/旧版路线下 Lulynx 管理的 EMA 开关和衰减率，以及 AutoController 的检查间隔和早停耐心值。',
    'effect': '功能同 ema_enabled / ema_decay（标准版），通过 route_service.py 三归一路由到后端同一实现。lulynx_auto_check_every 等同于 ac_warmup_steps 中的"检查频率"含义。',
    'whenToUse': '这些字段是 SDXL/旧版路线的 Lulynx 前缀变体，Anima 路线请使用无前缀版本（ema_enabled / ac_* 等）。',
    'avoidWhen': '在 Anima 路线下不要使用这些字段，使用对应的标准版字段。'
  },
  'relatedConfigs': ['ema_enabled', 'ema_decay', 'ac_enabled']
})

write('caption_tag_dropout_targets.json', {
  'key': 'caption_tag_dropout_targets',
  'title': 'Caption Tag Dropout 目标',
  'category': '数据集 / 图说',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['caption_tag_dropout_target_count', 'caption_tag_dropout_target_mode',
              'anima_caption_variant_cache', 'dual_caption_long_key', 'dual_caption_short_key'],
  'standard': {
    'summary': 'Tag Dropout 的精细控制：targets 指定只对特定 tag 类别做 dropout；target_count 控制目标 dropout 的 tag 数量；target_mode 控制 dropout 的方式（random/structured）。dual_caption 支持同时有长/短两种图说的数据集（通过 long_key/short_key 指定字段名）。anima_caption_variant_cache 开启 caption 变体缓存。',
    'effect': 'targets 列表中的 tag 类别才参与 dropout，其他 tag 不受影响（如只对描述性 tag 做 dropout，保留触发词）。',
    'whenToUse': '需要精确控制哪些 tag 参与 dropout 时使用。dual_caption 适合数据集同时有详细描述和简短标签两种格式。',
    'avoidWhen': '简单的 tag dropout 用 caption_tag_dropout_rate 即可，无需精细控制目标。'
  },
  'relatedConfigs': ['caption_tag_dropout_rate', 'caption_source_tag_ratio']
})

write('compile_cache_reuse.json', {
  'key': 'compile_cache_reuse',
  'title': '编译缓存复用',
  'category': '速度 / 编译',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['compile_cache_root'],
  'standard': {
    'summary': 'compile_cache_reuse 控制是否跨会话复用 torch.compile 的编译缓存；compile_cache_root 指定缓存文件的存储目录。',
    'effect': '开启 reuse 后，相同代码和模型的训练可以直接使用之前的编译缓存，跳过首次编译等待（节省 1~5 分钟）。',
    'whenToUse': '多次训练同一模型类型时开启 reuse，充分利用已有编译缓存。',
    'avoidWhen': '代码频繁变动时缓存会失效（自动重编译），reuse 对这种场景意义不大。'
  },
  'relatedConfigs': ['torch_compile', 'compile_runtime', 'anima_compile_scope']
})

write('cpu_offload_checkpointing.json', {
  'key': 'cpu_offload_checkpointing',
  'title': 'CPU Offload Checkpointing',
  'category': '速度 / 显存',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['cpu_offload_checkpointing_mode', 'cpu_offload_checkpointing_pool_gb',
              'te_vae_offload_strategy'],
  'standard': {
    'summary': '将 gradient checkpoint 的中间激活值卸载到 CPU，而非只是丢弃（标准 checkpointing 是丢弃后重算）。比标准 checkpointing 节省更多 VRAM，但增加 CPU-GPU 传输开销。',
    'effect': 'mode 控制卸载策略（哪些激活卸载，哪些保留 GPU）；pool_gb 限制 CPU 内存池大小（防止占满 RAM）。te_vae_offload_strategy 控制文本编码器和 VAE 的卸载时机。',
    'whenToUse': '开启标准 gradient_checkpointing 仍然 OOM 时的进一步措施。比 block_swap 更细粒度。',
    'avoidWhen': 'CPU-GPU 传输速度（PCIe 带宽）成为瓶颈时，offload checkpointing 可能比重算更慢。'
  },
  'relatedConfigs': ['gradient_checkpointing', 'anima_block_prefetch', 'activation_compression_enabled']
})

write('distillation_enabled.json', {
  'key': 'distillation_enabled',
  'title': '知识蒸馏',
  'category': '前沿储备 / 训练',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['distillation_mode'],
  'standard': {
    'summary': '（实验性）知识蒸馏：使用大型教师模型的输出来指导 LoRA 训练，替代或补充标准扩散 loss，提升学习效率。',
    'effect': 'distillation_mode 控制蒸馏策略（feature / logit / score）：feature = 中间特征对齐；logit = 最终预测对齐；score = 分数函数对齐（Consistency Distillation 等）。',
    'whenToUse': '实验性功能。有更大基础模型可作为教师时可以尝试提升 LoRA 训练效率。',
    'avoidWhen': '默认关闭。蒸馏需要同时运行教师模型（显存约翻倍），大多数 LoRA 训练不适用。'
  },
  'relatedConfigs': ['anima_ema_feat_align_enabled', 'perceptual_anchor_loss_enabled']
})

write('enhanced_protection_mode.json', {
  'key': 'enhanced_protection_mode',
  'title': '增强防护模式',
  'category': '训练 / 稳定性',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['swap_count', 'swap_ratio'],
  'standard': {
    'summary': '开启增强防护模式时，训练器会在多个层面加强稳定性保护：更频繁的梯度检查、自动 LR 回退、内存压力监控等。swap_count/ratio 控制相关的交换操作参数。',
    'effect': '开启后训练更稳定但速度可能略慢（约 5~10%）。适合不稳定的训练环境（高 LR、小数据集、不稳定架构）。',
    'whenToUse': '遇到频繁 NaN/Inf 或训练不稳定时作为综合保护措施。',
    'avoidWhen': '稳定训练环境无需开启，避免额外开销。'
  },
  'relatedConfigs': ['safeguard_enabled', 'max_grad_norm', 'peak_vram_control_enabled']
})

write('frontier_optimizer_candidate.json', {
  'key': 'frontier_optimizer_candidate',
  'title': 'Frontier 优化器候选',
  'category': '训练 / 优化器',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['frontier_optimizer_product_candidate_enabled'],
  'standard': {
    'summary': '选择已回签的 Frontier 优化器产品候选（如 AutomagicPlusPlus / AutoProdigy / Riemannion / Rose / Aurora 等实验性优化器）。需要先开启 frontier_optimizer_product_candidate_enabled 才生效。',
    'effect': '覆盖 optimizer_type，使用选中的前沿优化器。这些优化器均以 cleanroom 方式实现，default-off。',
    'whenToUse': '有明确需要测试前沿优化器时使用。先了解各优化器的特性（通过问号帮助或文档）再开启。',
    'avoidWhen': '不了解具体优化器特性时不要随意切换。前沿优化器可能有未知的稳定性问题。'
  },
  'relatedConfigs': ['optimizer_type', 'optimizer_backend']
})

write('copilot_tool.json', {
  'key': 'copilot_tool',
  'title': '训练 Copilot 工具',
  'category': '训练 / 辅助工具',
  'appliesTo': ['anima-lora'],
  'aliases': ['goal_forecast_tool', 'ui_custom_params'],
  'standard': {
    'summary': '训练辅助工具：copilot 在训练过程中提供实时建议（如 LR 调整建议、过拟合预警）；goal_forecast 预测达到目标 loss 所需的额外步数；ui_custom_params 允许传递自定义 UI 参数。',
    'effect': 'copilot_tool 开启后，训练日志中会包含训练健康状态的诊断建议（基于当前 loss 趋势和梯度统计）。',
    'whenToUse': '实验性功能，适合希望获得训练过程智能建议的场景。',
    'avoidWhen': '这些工具增加监控开销，追求纯粹训练速度时关闭。'
  },
  'relatedConfigs': ['advanced_stats_enabled', 'wandb_api_key']
})

write('module_offload_prefetch_enabled.json', {
  'key': 'module_offload_prefetch_enabled',
  'title': '模块 Offload 预取配置',
  'category': '速度 / 显存',
  'appliesTo': ['anima-lora'],
  'aliases': ['module_offload_prefetch_mode', 'module_offload_profile', 'module_offload_profile_enabled',
              'module_offload_ratio', 'module_offload_text_encoder_ratio', 'module_offload_verify_state'],
  'standard': {
    'summary': '模块 offload 的预取和性能分析控制：prefetch_enabled 启用异步预取（在当前 block 计算时预取下一个 block）；profile 模式记录每个模块的传输时间；ratio 控制整体 offload 比例。',
    'effect': 'prefetch 让 GPU 计算与 CPU-GPU 数据传输重叠，提升 offload 效率（减少等待时间）；profile 帮助识别传输瓶颈。',
    'whenToUse': '使用 module_offload 时推荐同时开启 prefetch；profile 在性能调优时使用。verify_state 在每次换入/换出时验证数据完整性（调试用）。',
    'avoidWhen': 'verify_state 有显著额外开销，只在怀疑数据损坏时临时开启。'
  },
  'relatedConfigs': ['module_offload_backbone_ratio', 'anima_block_prefetch', 'blocks_to_swap']
})

write('pissa_oversample.json', {
  'key': 'pissa_oversample',
  'title': 'PiSSA 过采样',
  'category': 'LoRA 变体 / PiSSA',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'standard': {
    'summary': '（实验性）PiSSA 的过采样选项：对初始化 SVD 时的奇异值进行过采样，以获得更准确的主方向估计，特别对大矩阵有效。',
    'effect': '开启后 SVD 初始化使用随机化 SVD 方法（RSVD）而非完整 SVD，通过过采样获得近似主奇异方向，速度更快但精度略低。',
    'whenToUse': '大型权重矩阵（如 d_in × d_out > 10000²）的 PiSSA 初始化时，标准 SVD 过慢，可用过采样 RSVD 加速。',
    'avoidWhen': '小矩阵（如 LoRA 常见的 1024×1024）用标准 SVD 即可，无需过采样。'
  },
  'relatedConfigs': ['pissa_init', 'network_dim']
})

write('turbocore_profile.json', {
  'key': 'turbocore_profile',
  'title': 'TurboCore 性能分析',
  'category': '速度 / TurboCore',
  'appliesTo': ['anima-lora'],
  'aliases': ['turbocore_strict', 'turbocore_tuned_kernel_disable',
              'turbocore_update_shadow_mode', 'turbocore_workspace_mb'],
  'standard': {
    'summary': 'TurboCore 调试和分析参数：profile 记录各 TurboCore 组件的耗时统计；strict 开启严格验证模式（错误时 fail-closed 而非 fallback）；tuned_kernel_disable 禁用特定调优 kernel（测试/调试用）；workspace_mb 设置 TurboCore 内部工作区大小。',
    'effect': 'profile 将 TurboCore 各阶段的时间细分记录到日志，帮助定位性能瓶颈；update_shadow_mode 控制 shadow 权重更新的时机（用于 TurboCore 的回签验证流程）。',
    'whenToUse': '调试 TurboCore 行为或性能分析时使用。正常训练保持默认（不开启这些调试选项）。',
    'avoidWhen': 'strict 模式会在 TurboCore 组件失败时立即报错（而非自动 fallback），只在调试时使用。'
  },
  'relatedConfigs': ['turbocore_native_update_dispatch_enabled', 'optimizer_backend']
})

write('validation_seed.json', {
  'key': 'validation_seed',
  'title': '验证随机种子',
  'category': '训练 / 评估',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'standard': {
    'summary': '验证集评估时使用的随机种子，确保每次验证使用相同的随机状态（可重复比较）。',
    'effect': '固定 validation_seed 后，相同模型在验证集上的 loss 评估完全可重复，方便跨训练运行比较。',
    'whenToUse': '开启验证集评估（validate_every_n_steps）时设置，获得可重复的验证 loss。',
    'avoidWhen': '不使用验证集时此参数无意义。'
  },
  'relatedConfigs': ['validate_every_n_steps', 'seed']
})

print('最终批次完成')
