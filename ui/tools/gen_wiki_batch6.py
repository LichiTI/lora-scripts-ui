"""
批量生成剩余 wiki entries — 批次6
覆盖: lossless缓存/sample/peak_vram/turbocore/LoRA变体/保存/misc
"""
import json, os

ENTRIES_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'training-wiki', 'entries')

def write(name, data):
    path = os.path.join(ENTRIES_DIR, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'  wrote {name}')

# ── Lossless 缓存引擎 ─────────────────────────────────────────────────────────

write('lossless_cache_replacement_mode.json', {
  'key': 'lossless_cache_replacement_mode',
  'title': '无损缓存引擎后端',
  'category': '速度 / 缓存',
  'appliesTo': ['anima-lora'],
  'aliases': ['lossless_cache_replacement_codecs', 'lossless_cache_replacement_prefetch_depth',
              'lossless_cache_replacement_read_mode', 'lossless_cache_replacement_fallback_to_raw',
              'lossless_cache_replacement_decoded_payload_cache',
              'lossless_cache_replacement_decoded_payload_cache_max_bytes'],
  'standard': {
    'summary': '选择训练缓存的存储引擎后端：off = 原版 npz/safetensors；lxfs/lynx = Lulynx 无损压缩引擎，提供更快的读写速度和更小的磁盘占用。',
    'effect': 'lxfs/lynx 模式完全替换 DataLoader 的缓存路径，使用自定义无损压缩格式（lz4fast/zstd 等）存储 latent，I/O 速度约快 20%~40%（取决于 SSD 速度）。',
    'whenToUse': '数据集大、I/O 成为训练瓶颈（CPU/IO 等待时间 > 训练时间的 5%）时考虑开启。NVMe SSD 效果更明显。',
    'avoidWhen': '小数据集（<100张）或 GPU-bound 训练（GPU 使用率持续 >95%）时，I/O 优化收益被 GPU 计算掩盖，提升不明显。'
  },
  'advanced': {
    'principle': 'lossless 引擎通过 lossless_cache_replacement_codecs（lz4fast/zstd1/raw）控制压缩算法；prefetch_depth 控制异步预取深度；decoded_payload_cache 将解压后的 latent 保留在内存（减少重复解压）；fallback_to_raw 在引擎错误时回退到原格式。',
    'tradeoffs': 'lossless 引擎复杂度更高，首次缓存生成需要转换格式（比 npz 慢）；但稳态读取速度更快。对于 anima 大基座的 GPU-bound 训练，提升约 2.3%（端到端）；数据密集型训练提升更显著。'
  },
  'relatedConfigs': ['cache_latents', 'cache_latents_to_disk', 'latent_cache_disk_format']
})

# ── 采样预览 ──────────────────────────────────────────────────────────────────

write('sample_every_n_steps.json', {
  'key': 'sample_every_n_steps',
  'title': '每 N 步生成预览图',
  'category': '训练 / 预览',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'aliases': ['sample_every_n_epochs', 'sample_at_first', 'sample_cfg',
              'sample_cache_seam_window_size'],
  'standard': {
    'summary': '每隔 N 步使用当前 LoRA 权重生成预览图，用于监控训练进度。0 = 不生成预览。',
    'effect': '设为 50 = 每 50 步生成一组预览图保存到输出目录。可以直观看到 LoRA 在不同步数的学习效果。',
    'whenToUse': '长训练（>200步）推荐开启，帮助判断最佳停止点（防止过拟合后才发现）。',
    'avoidWhen': '生成预览会暂停训练约 5~30 秒（取决于生成步数和分辨率），频率过高会浪费训练时间。建议不超过每 50 步一次。'
  },
  'advanced': {
    'principle': '每 N 步后暂停优化器，使用 eval 模式运行 DDIM/DPM 等采样器生成固定 prompt 的图像，然后恢复训练。sample_at_first = 是否在第 0 步（训练前）也生成一张作为基准对比。sample_cfg 控制生成时的 CFG 强度。',
    'tradeoffs': '生成预览使用训练器的 GPU，会短暂打断 GPU 的训练计算流。batch 越大、采样步数越多，预览越耗时。建议 sample_num_steps 设为 20~25（快速采样）。'
  },
  'relatedConfigs': ['save_every_n_steps', 'output_dir']
})

# ── Peak VRAM 管理 ────────────────────────────────────────────────────────────

write('peak_vram_control_enabled.json', {
  'key': 'peak_vram_control_enabled',
  'title': 'Peak VRAM 峰值控制',
  'category': '速度 / 显存',
  'appliesTo': ['anima-lora'],
  'aliases': ['peak_vram_auto_protection_enabled', 'peak_vram_diagnostics_enabled',
              'peak_vram_diagnostics_interval', 'peak_vram_micro_batch_enabled',
              'peak_vram_micro_batch_size', 'peak_vram_reduce_enabled',
              'peak_vram_reserved_gb', 'peak_vram_soft_limit_gb', 'peak_vram_target_gb'],
  'standard': {
    'summary': '启用 VRAM 峰值动态管理：实时监控 GPU 显存使用情况，在接近 OOM 时自动触发显存释放或降级措施，防止训练崩溃。',
    'effect': '开启后每步监控 VRAM 使用率，峰值接近设定阈值时自动执行：micro batch 拆分（将当前步分为更小的子 batch）/ 临时卸载 / GC 触发等措施。',
    'whenToUse': '训练偶发 OOM 但平均显存充足时开启（如某些 batch 因高分辨率图偶发 OOM）。',
    'avoidWhen': '显存使用稳定时无需开启（每步都有额外监控开销）。系统性 OOM（每步都 OOM）需要从根本上降低分辨率或 batch size。'
  },
  'advanced': {
    'principle': 'peak_vram_target_gb 设置目标峰值；soft_limit_gb 是触发降级的阈值；reserved_gb 是预留给系统的显存。diagnostics 模式记录每步 VRAM 使用峰值到日志文件，用于找出 VRAM 瓶颈 batch。micro_batch 模式在 VRAM 接近上限时将 batch 拆分为更小单元序列执行（类似 gradient accumulation 但是在 OOM 保护触发时动态生效）。',
    'tradeoffs': '实时 VRAM 监控（torch.cuda.memory_stats）有约 0.5ms/step 的额外开销；micro_batch 拆分会降低每步速度。'
  },
  'relatedConfigs': ['gradient_checkpointing', 'anima_block_prefetch', 'train_batch_size']
})

# ── TurboCore ──────────────────────────────────────────────────────────────────

write('turbocore_native_update_dispatch_enabled.json', {
  'key': 'turbocore_native_update_dispatch_enabled',
  'title': 'TurboCore Native 更新调度',
  'category': '速度 / TurboCore',
  'appliesTo': ['anima-lora'],
  'aliases': ['turbocore_native_update_mode', 'turbocore_prefetch_depth',
              'turbocore_allow_fallback', 'turbocore_disable',
              'turbocore_fused_backward_enabled', 'turbocore_fused_backward_mode',
              'turbocore_kernel_autotune_enabled', 'turbocore_kernel_autotune_target',
              'automagic_fused_backward_enabled'],
  'standard': {
    'summary': 'TurboCore 是 Lulynx 训练器的性能优化引擎，集成多种 CUDA kernel 级别的加速：fused backward、native update dispatch、kernel autotune 等。',
    'effect': 'fused_backward：将多个 backward kernel 合并，减少 kernel 发射开销约 15%~20%（来自梯度释放管理器）；kernel_autotune：自动调优 CUDA kernel 参数（实测 1.14× 加速）；native_update_dispatch：优化权重更新路径。',
    'whenToUse': '所有 TurboCore 组件默认 off（实验性）。逐步开启验证稳定性后再开启更多组件。fused_backward 是最稳定的组件，可优先试用。',
    'avoidWhen': '调试训练问题时建议关闭所有 TurboCore 组件（回归到标准路径）。Windows 上 Triton 支持有限，kernel_autotune 效果可能不明显。'
  },
  'advanced': {
    'principle': 'fused_backward 通过 GradientReleaseManager 将多个参数的 backward 合并（full 档：全量合并，compatible 档：分组合并），减少 CUDA kernel 发射次数。kernel_autotune 通过 NVRTC 生成变体 kernel，自动选择最快配置并缓存。native_update_dispatch 优化 LoRA 权重更新的 CUDA 调度路径。',
    'tradeoffs': 'fused_backward 与某些优化器（如 Prodigy 的特殊 step 逻辑）可能不完全兼容（有 compatible 降级档）。kernel_autotune 首次运行需要额外时间（约 1~3 分钟）进行 profiling，之后缓存加速。'
  },
  'relatedConfigs': ['optimizer_backend', 'torch_compile', 'compile_runtime']
})

# ── LoRA 变体 (PiSSA, DoRA, KronA, CDKA) ─────────────────────────────────────

write('pissa_init.json', {
  'key': 'pissa_init',
  'title': 'PiSSA 初始化',
  'category': 'LoRA 变体 / PiSSA',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['pissa_niter', 'pissa_method', 'pissa_apply_conv2d', 'pissa_export_mode'],
  'standard': {
    'summary': 'PiSSA（Principal Singular values and Singular vectors Adaptation）：通过 SVD 初始化 LoRA 的 A/B 矩阵，使初始 LoRA 对齐预训练权重的主要奇异方向，实现更快的收敛。',
    'effect': '与随机初始化相比，PiSSA 初始化可以让训练在更少步数内达到相似的 loss 水平（约快 2~3×）；同时 B×A 的初始输出非零（对齐主奇异方向），比标准 LoRA 更快"记住"新概念。',
    'whenToUse': '步数较少时（<200步）PiSSA 的快速收敛优势最明显。长训练时优势逐渐减弱。',
    'avoidWhen': 'pissa 初始化需要对每个目标层做 SVD（较慢的初始化步骤）；SVD 分解本身对大型权重矩阵耗时较长。'
  },
  'advanced': {
    'principle': 'PiSSA 对预训练权重 W 做 SVD：W = UΣV^T，取前 rank 个奇异值/向量初始化 B = U[:, :rank] × Σ[:rank, :rank]^(1/2) / scale，A = Σ[:rank, :rank]^(1/2) × V[:rank, :]^T / scale。初始 ΔW = B×A ≈ 主成分方向的 W，与 W 最近的低秩近似。',
    'tradeoffs': 'PiSSA 的 export_mode（full_weight 或 lora_weight）影响输出文件：full_weight 模式导出 W_original - B×A + B_new×A_new（合并修改），pissa 推理时等效于标准 LoRA 推理。'
  },
  'relatedConfigs': ['network_dim', 'network_alpha']
})

write('dpo_enabled.json', {
  'key': 'dpo_enabled',
  'title': 'DPO（直接偏好优化）',
  'category': '前沿储备 / 训练',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['dpo_beta', 'dpo_logprob_scale', 'dpo_preference_pair_field', 'dpo_rejected_perturb'],
  'standard': {
    'summary': '（实验性）DPO（Direct Preference Optimization）：使用偏好对数据（preferred / rejected 图像对）训练 LoRA，使生成更符合人类偏好，而非单纯最小化重建 loss。',
    'effect': '开启后需要数据集包含偏好对（每张图有一个被偏好版本和一个被拒绝版本），训练 loss 改为最大化偏好图与拒绝图之间的对数似然差。',
    'whenToUse': '实验性功能。有高质量偏好对数据集时可以使用，适合微调已收敛 LoRA 的"偏好方向"。',
    'avoidWhen': '没有偏好对数据时无法使用。DPO 对数据质量非常敏感，低质量偏好对会导致训练崩溃。'
  },
  'advanced': {
    'principle': 'DPO loss = -log σ(β × (log π_θ(y_w|x) - log π_ref(y_w|x)) - β × (log π_θ(y_l|x) - log π_ref(y_l|x)))，其中 y_w 是偏好图，y_l 是拒绝图，β 是温度系数。需要参考模型 π_ref（通常是训练前的基础模型）。',
    'tradeoffs': 'DPO 需要两次 forward（参考模型 + 当前模型），显存和计算量约翻倍。dpo_beta 控制 KL 散度惩罚强度：β 过大会过度约束使模型偏向参考模型；过小则不约束，可能走捷径。'
  },
  'relatedConfigs': ['ema_enabled', 'network_dim']
})

write('fg_lora_rank_policy.json', {
  'key': 'fg_lora_rank_policy',
  'title': 'Fine-Grained LoRA Rank 策略',
  'category': 'LoRA 变体 / Fine-Grained',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['fg_lora_rank_min', 'fg_lora_rank_max', 'fg_lora_rank_conserve_budget', 'fg_lora_rank_map_json'],
  'standard': {
    'summary': '细粒度 LoRA rank 策略：对不同层分配不同的 rank，而非全局使用同一 rank，可在相同参数预算下提升学习效率。',
    'effect': 'coupled-prune = 根据层重要性自动剪枝分配 rank（重要层高 rank，次要层低 rank）；orthogonal-redistribute = 正交重分配（保持总参数量，优化各层 rank 分布）。',
    'whenToUse': '实验性功能。想在固定参数预算下最大化学习效率时尝试。',
    'avoidWhen': '不了解各层重要性时保持默认（全局统一 rank），不确定性更小。'
  },
  'advanced': {
    'principle': '通过分析各层梯度 stable rank 或权重奇异值分布，动态调整各层的 LoRA rank 分配。fg_lora_rank_map_json 允许手动指定每层的 rank，提供最大灵活性。',
    'tradeoffs': '非均匀 rank 分配使 LoRA 结构更复杂，与某些推理框架（如 A1111）的标准 LoRA 加载可能不完全兼容。'
  },
  'relatedConfigs': ['network_dim', 'network_alpha', 'adapter_target_policy']
})

write('adapter_target_policy.json', {
  'key': 'adapter_target_policy',
  'title': 'LoRA 适配目标策略',
  'category': 'LoRA 变体 / 目标选择',
  'appliesTo': ['anima-lora'],
  'aliases': ['adapter_target_policy_fraction', 'adapter_target_policy_min_score', 'adapter_target_policy_top_k',
              'adapter_init_strategy', 'adapter_init_export_mode'],
  'standard': {
    'summary': '控制 LoRA 注入哪些层的策略：top_k = 选择对训练目标最重要的 K 个层；fraction = 按比例选择最重要的层；score_threshold = 按重要性分数阈值筛选。',
    'effect': '相比全层注入，目标层选择可以让相同参数量集中在最重要的层上，提升参数效率。',
    'whenToUse': '实验性功能。有明确的层重要性偏好（如只训练 cross-attn 不训练 MLP）或希望减少参数量时使用。',
    'avoidWhen': '不清楚各层重要性时保持全层注入（默认），全层注入通常比次优的层选择效果更好。'
  },
  'advanced': {
    'principle': '根据 adapter_target_policy 计算各层的重要性分数（通常基于梯度 L2 norm 或 Fisher information），只注入分数最高的层。adapter_init_strategy 控制选中层的初始化方式（random / pissa / spectral）。',
    'tradeoffs': '层选择策略需要额外的 profiling 步骤（计算各层重要性），增加初始化时间；错误的重要性度量可能导致选出的层并非最关键层。'
  },
  'relatedConfigs': ['network_dim', 'fg_lora_rank_policy']
})

write('cdka_enabled.json', {
  'key': 'cdka_enabled',
  'title': 'CDKA（Kronecker 压缩适配）',
  'category': 'LoRA 变体 / Kronecker',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['cdka_alpha', 'cdka_factor_in', 'cdka_factor_out'],
  'standard': {
    'summary': '（实验性）CDKA（Compactly Decomposed Kronecker Adaptation）：通过 Kronecker 积分解权重更新，比标准 LoRA 参数效率更高（更少参数 ≈ 相同表达力）。',
    'effect': '通过 ΔW = scale × kron(w1, w2) 形式，以更少参数描述权重更新。factor_in/factor_out 控制 Kronecker 因子的维度分解方式。',
    'whenToUse': '希望减少 LoRA 参数量的实验性场景（如资源受限的边缘部署）。实验性功能。',
    'avoidWhen': 'VRAM 不是瓶颈时 CDKA 的参数优势不明显；同等参数量下 CDKA 的表达力可能不如标准 LoRA。'
  },
  'advanced': {
    'principle': 'ΔW = scale × kron(w1, w2)，w1 ∈ R^{out_f × in_f}，w2 ∈ R^{out/out_f × in/in_f}。w1 零初始化确保 ΔW=0 parity 起始。factor_in=0 表示未设置（truthy check 修复了一个 bug）。',
    'tradeoffs': 'Kronecker 展开需要 materialize 完整 ΔW（out × in 大矩阵），实际 VRAM 比标准 LoRA 高约 3GB（是低秩矩阵 vs 完整矩阵的 trade-off），参数少但 VRAM 不省。'
  },
  'relatedConfigs': ['network_dim', 'network_alpha', 'pissa_init']
})

# ── 保存选项 ──────────────────────────────────────────────────────────────────

write('save_model_as.json', {
  'key': 'save_model_as',
  'title': '保存格式',
  'category': '训练 / 保存',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora', 'newbie-lora'],
  'aliases': ['save_last_n_epochs', 'save_last_n_epochs_state', 'save_last_n_steps_state', 'save_n_epoch_ratio'],
  'standard': {
    'summary': '控制 LoRA 权重文件的保存格式：safetensors（推荐，快速加载，无安全风险）/ pt（PyTorch 原始格式）/ ckpt（旧格式，不推荐）。',
    'effect': 'safetensors = 最广泛兼容（A1111/ComfyUI 原生支持）；pt = PyTorch 原生，某些工具更好支持；ckpt = 旧格式，含 Python pickle 有安全风险。',
    'whenToUse': '推荐 safetensors（最安全且兼容性最好）。',
    'avoidWhen': 'ckpt 格式因含 Python pickle 存在代码执行风险，不建议分发（作为分发给其他人的格式）。'
  },
  'advanced': {
    'principle': 'safetensors 是 HuggingFace 设计的安全格式：只存储 tensor 数据（无 Python 对象），并发安全（mmap 读取）。pt 通过 pickle 序列化完整 Python 对象，功能更全但有安全风险。',
    'tradeoffs': 'save_last_n_steps_state 控制是否同时保存优化器状态（用于恢复训练），状态文件约为 LoRA 文件的 2~4×（优化器 m/v 动量）。'
  },
  'relatedConfigs': ['save_every_n_steps', 'output_dir', 'ema_enabled']
})

write('checkpoint_policy.json', {
  'key': 'checkpoint_policy',
  'title': 'Checkpoint 保存策略',
  'category': '训练 / 保存',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '控制中间 checkpoint 的保存逻辑：all = 保存所有步的 checkpoint；best = 只保留验证 loss 最低的；last_n = 保留最近 N 个（配合 save_last_n_steps）。',
    'effect': 'best 模式需要评估集，自动选择最优步数的权重保存；last_n 是最常用的节省磁盘空间方式。',
    'whenToUse': '磁盘空间有限时选择 last_n（配合 save_last_n_steps=3~5）；有评估集时 best 模式可自动选择最优点。',
    'avoidWhen': 'LoRA 训练通常没有独立评估集，best 模式对 LoRA 意义有限（使用预览图目测选择更实用）。'
  },
  'advanced': {
    'principle': 'checkpoint_policy 影响 checkpoint 管理器的行为：all = 写出所有 checkpoint 不删除（磁盘空间最大占用）；last_n = 写出后检查总数并删除超限的旧 checkpoint。',
    'tradeoffs': '若训练意外中断，last_n 模式下只能从最近 N 个 checkpoint 恢复；all 模式可以从任意 checkpoint 恢复但磁盘占用极高。'
  },
  'relatedConfigs': ['save_every_n_steps', 'save_last_n_steps', 'save_model_as']
})

# ── SDXL 专用字段 ─────────────────────────────────────────────────────────────

write('sdxl_block_swap_enabled.json', {
  'key': 'sdxl_block_swap_enabled',
  'title': 'SDXL Block Swap',
  'category': '速度 / 显存',
  'appliesTo': ['sdxl-lora'],
  'aliases': ['sdxl_block_swap_input_blocks', 'sdxl_block_swap_middle_block',
              'sdxl_block_swap_output_blocks', 'sdxl_block_swap_offload_after_backward',
              'sdxl_block_swap_sequential_cpu_offload'],
  'standard': {
    'summary': 'SDXL 专用的 block-level CPU offload 实现，将部分 UNet block 卸载到 CPU 内存以节省 VRAM。',
    'effect': '可以在 8GB 显卡上训练 SDXL LoRA（正常需要 12~16GB）。input_blocks / output_blocks / middle_block 分别控制哪些层被 offload。',
    'whenToUse': '8~12GB 显卡训练 SDXL 时的必选项。结合 gradient_checkpointing 和 xformers 使用。',
    'avoidWhen': '显存充足（>16GB）时不需要，会降低训练速度（PCIe 传输开销）。'
  },
  'advanced': {
    'principle': 'SDXL UNet 有 input_blocks（下采样）、middle_block（瓶颈）、output_blocks（上采样）三组，各组可独立 offload。offload_after_backward 在 backward 完成后立即卸载（而非 step 结束），最大化 VRAM 节省。',
    'tradeoffs': 'SDXL block swap 实现是 SDXL 专用的，与 Anima 的 anima_block_prefetch 是不同的实现。sequential_cpu_offload 是最激进的（逐层 offload），最省 VRAM 但最慢。'
  },
  'relatedConfigs': ['gradient_checkpointing', 'xformers', 'blocks_to_swap']
})

write('module_offload_backbone_ratio.json', {
  'key': 'module_offload_backbone_ratio',
  'title': '模块级 Offload 配置',
  'category': '速度 / 显存',
  'appliesTo': ['anima-lora'],
  'aliases': ['module_offload_enhanced', 'module_offload_exclude_patterns',
              'module_offload_include_patterns', 'module_offload_min_param_mb',
              'module_offload_optimizer_enabled', 'module_offload_optimizer_device',
              'module_offload_strategy', 'module_offload_te_ratio'],
  'standard': {
    'summary': '细粒度模块级 CPU offload 配置：按模块名称模式或参数量大小选择性地 offload 特定模块，比全量 offload 更精确。',
    'effect': 'backbone_ratio 控制基座模型权重的 offload 比例；te_ratio 控制文本编码器的 offload 比例；include/exclude_patterns 支持正则表达式精确控制。',
    'whenToUse': '需要精确控制哪些模块 offload 时（比 blocks_to_swap 更细粒度）。高级 VRAM 管理场景。',
    'avoidWhen': '不了解模型各模块结构时，使用更简单的 blocks_to_swap 或 gradient_checkpointing 即可。'
  },
  'advanced': {
    'principle': '模块 offload 通过 register_forward_pre_hook 和 register_forward_hook 在每次 forward 前/后执行 to(device) 操作。enhanced 模式增加异步传输和预取优化。min_param_mb 避免对小模块频繁传输（传输开销 > 节省收益）。',
    'tradeoffs': '细粒度 offload 配置灵活但复杂；参数名 pattern 需要与实际模型的 module 命名匹配，建议先用 print(model) 查看模块结构。'
  },
  'relatedConfigs': ['blocks_to_swap', 'anima_block_prefetch', 'gradient_checkpointing']
})

# ── Torch Compile 高级参数 ────────────────────────────────────────────────────

write('torch_compile_mode.json', {
  'key': 'torch_compile_mode',
  'title': 'torch.compile 模式',
  'category': '速度 / 编译',
  'appliesTo': ['anima-lora', 'sdxl-lora'],
  'aliases': ['torch_compile_fullgraph', 'torch_compile_dynamic',
              'torch_compile_scope', 'torch_compile_allow_full_with_per_block'],
  'standard': {
    'summary': 'torch.compile 的编译模式：default（均衡）/ reduce-overhead（最小化 Python 开销）/ max-autotune（最大化调优但编译最慢）。',
    'effect': 'default = 稳健平衡；reduce-overhead = 专注减少 CPU overhead（对小模型/高 batch 场景更有效）；max-autotune = 穷举所有 kernel 变体找最优（编译时间 5~30 分钟，只适合超长训练）。',
    'whenToUse': 'default 适合大多数训练。reduce-overhead 适合 GPU 利用率已很高但 CPU 是瓶颈时。max-autotune 只在训练步数 >1000 且追求极致性能时考虑。',
    'avoidWhen': 'max-autotune 编译时间极长，短训练不划算。'
  },
  'advanced': {
    'principle': 'torch_compile_fullgraph=True 要求无 graph break（全图编译），可能失败；dynamic=True 允许动态形状（生成更多 guard，略慢但更兼容）；scope 控制编译范围（forward only / forward+backward）。',
    'tradeoffs': 'fullgraph=True 不兼容含有 Python 控制流的代码（如 LoRA 的条件 hook）；dynamic=True 比 static 更慢但对变长序列更友好。'
  },
  'relatedConfigs': ['torch_compile', 'dynamo_backend', 'compile_runtime']
})

# ── Flow Matching 参数 ────────────────────────────────────────────────────────

write('flow_logit_mean.json', {
  'key': 'flow_logit_mean',
  'title': 'Flow Matching 时间步均值',
  'category': '训练 / Flow Matching',
  'appliesTo': ['anima-lora'],
  'aliases': ['flow_logit_std', 'flow_uncertainty_weighting_enabled',
              'flow_uncertainty_weighting_channels', 'flow_uncertainty_weighting_lr'],
  'standard': {
    'summary': 'Flow Matching 训练的 logit-normal 时间步采样参数：mean 控制采样分布的均值（偏向哪个噪声级别），std 控制分布宽度。',
    'effect': 'mean=0 → 采样集中于中等噪声（σ≈0.5）；mean>0 → 偏向更高噪声（更粗粒度学习）；mean<0 → 偏向低噪声（更细节学习）。',
    'whenToUse': '默认值（mean=0, std=1）是 Anima 官方推荐，通常无需修改。',
    'avoidWhen': '不了解 Flow Matching 时间步分布时保持默认。'
  },
  'advanced': {
    'principle': 'logit-normal 采样：t ~ sigmoid(μ + σ × N(0,1))，μ=logit_mean，σ=logit_std。时间步 t 通过此分布映射到 [0,1] 区间，对应不同 sigma 噪声级别。flow_uncertainty_weighting 基于 EDM2 的不确定性加权思想，按每个 sigma bin 的历史 loss 统计动态调整采样权重。',
    'tradeoffs': 'logit_mean 调整影响整体训练偏好，与 anima_weighting_scheme / scale_guidance 存在部分功能重叠，避免同时使用多个时间步加权机制（相互影响难以预测）。'
  },
  'relatedConfigs': ['anima_weighting_scheme', 'anima_sigmoid_scale']
})

# ── DCT 频域参数 ──────────────────────────────────────────────────────────────

write('dct_frequency_enabled.json', {
  'key': 'dct_frequency_enabled',
  'title': 'DCT 频域 Loss',
  'category': '前沿储备 / 质量',
  'appliesTo': ['anima-lora'],
  'aliases': ['dct_frequency_high_weight', 'dct_frequency_low_cutoff',
              'dct_frequency_max_t', 'dct_frequency_min_t', 'dct_frequency_weight'],
  'standard': {
    'summary': '（实验性）DCT 频域损失：对训练预测结果进行 DCT 变换，在频域空间计算高低频分量的 loss，以约束特定频段的重建质量。',
    'effect': '高 high_weight = 加强高频（纹理/细节）的重建约束；low_cutoff 控制低/高频分界点。在某些噪声级别范围（min_t~max_t）内才激活。',
    'whenToUse': '实验性功能。对纹理细节要求高的 LoRA 训练（如皮肤纹理、布料质感）可以尝试。',
    'avoidWhen': '默认关闭。DCT 计算开销极小，但效果需要通过 A/B 对比验证。'
  },
  'advanced': {
    'principle': 'DCT loss = ||DCT(x_pred) - DCT(x_target)||² × W（频率加权矩阵），W 对高频系数放大 high_weight 倍。只在 sigma ∈ [min_t, max_t] 的步骤计算（避免对全噪声步骤无效约束）。',
    'tradeoffs': 'DCT loss 与标准 MSE loss 不完全正交（低频 DCT ≈ MSE 的低频版本），需要确保 weight 不过大导致 loss 被 DCT 主导。'
  },
  'relatedConfigs': ['lineart_loss_enabled', 'gram_matrix_loss_enabled', 'perceptual_anchor_loss_enabled']
})

write('gram_texture_enabled.json', {
  'key': 'gram_texture_enabled',
  'title': 'Gram 矩阵纹理 Loss',
  'category': '前沿储备 / 质量',
  'appliesTo': ['anima-lora'],
  'aliases': ['gram_texture_weight', 'gram_texture_min_t', 'gram_texture_max_t', 'gram_texture_normalize'],
  'standard': {
    'summary': '（实验性）Gram 矩阵风格 loss：通过计算特征图的 Gram 矩阵（通道间相关性），约束训练输出的纹理风格一致性。',
    'effect': 'Gram 矩阵捕捉特征的二阶统计量（等价于风格信息），此 loss 鼓励生成保持与目标相同的纹理/风格分布。',
    'whenToUse': '实验性功能。风格 LoRA 训练（希望输出保持特定艺术风格纹理）时可以尝试。',
    'avoidWhen': '默认关闭。Gram 矩阵计算需要完整的特征通道乘法（O(C²)），对大通道数（C>512）有一定计算开销。'
  },
  'advanced': {
    'principle': 'G = F × F^T，G_{ij} = <F_i, F_j>（特征图通道 i 和 j 的内积）。Gram 矩阵等价于特征空间的二阶矩，不保留空间位置信息（只捕捉风格而非内容）。normalize=True 对 Gram 矩阵按元素数归一化，防止深层特征因维度大而主导 loss。',
    'tradeoffs': 'Gram loss 单纯约束风格，可能弱化对内容/结构的约束。通常应与 MSE loss 一起使用（Gram 权重设较小）。'
  },
  'relatedConfigs': ['dct_frequency_enabled', 'lineart_loss_enabled', 'perceptual_anchor_loss_enabled']
})

print('批次6 全部条目完成')
