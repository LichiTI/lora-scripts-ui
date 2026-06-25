"""
批量生成 SafeGuard + AutoController wiki entries
运行: python tools/gen_wiki_batch1.py
"""
import json, os, sys

ENTRIES_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'training-wiki', 'entries')

def write(name, data):
    path = os.path.join(ENTRIES_DIR, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'  wrote {name}')

# ── SafeGuard ────────────────────────────────────────────────────────────────

write('safeguard_enabled.json', {
  'key': 'safeguard_enabled',
  'title': 'SafeGuard（训练安全防护）',
  'category': '训练 / 稳定性',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'aliases': ['lulynx_safeguard_enabled'],
  'standard': {
    'summary': '轻量训练安全防护层，实时监控 loss 是否出现 NaN/Inf 或异常 spike，并可自动降低学习率或中止训练，防止训练崩溃。',
    'effect': '开启后每 N 步检查一次 loss，发现 NaN/Inf 或大幅跳升时触发干预策略（降 LR 或提前停止）。不影响正常训练速度，检查开销极低。',
    'whenToUse': '推荐长时间无人值守训练时开启，或使用较激进学习率时作为保险。对新角色/新数据集调参阶段特别有用。',
    'avoidWhen': '不需要关闭。SafeGuard 本身对训练速度影响极小，可常驻开启。'
  },
  'advanced': {
    'principle': '每隔 nan_check_interval 步在 loss 值上执行 torch.isnan/isinf 检查，并维护一个 loss_window_size 大小的滑动窗口检测 spike（当前 loss 超过窗口均值 × spike_threshold 倍判定为 spike）。',
    'intervention': '三档干预：NaN/Inf 计数超 max_nan_count → 停止；spike → 可选自动降低 LR（系数 lr_reduction_factor）；gradients 扫描模式（batched/foreach/legacy）控制梯度异常检测的 CUDA 同步策略。',
    'expectedImpact': '正常训练不受影响；发生 NaN 爆炸时及时止损，避免浪费整个训练 run。',
    'tradeoffs': '每步多一次 loss tensor 检查（几乎无开销）；自动降 LR 会改变训练轨迹，若 loss 抖动属正常范围应适当调高 spike_threshold。',
    'codePath': 'core/lulynx_trainer/training_loop.py → safeguard_check_step → lulynx_trainer/safeguard.py'
  },
  'relatedConfigs': ['safeguard_nan_check_interval', 'safeguard_max_nan_count', 'safeguard_loss_spike_threshold', 'safeguard_loss_window_size', 'safeguard_auto_reduce_lr', 'safeguard_lr_reduction_factor']
})

write('safeguard_nan_check_interval.json', {
  'key': 'safeguard_nan_check_interval',
  'title': 'NaN 检查间隔',
  'category': '训练 / 稳定性',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'aliases': ['lulynx_safeguard_nan_check_interval'],
  'standard': {
    'summary': '每隔多少个优化步检查一次 NaN/Inf loss。默认 1 = 每步检查。',
    'effect': '增大此值可略微降低检查开销，但 NaN 检测延迟相应增加，出现 NaN 后仍会多跑几步。',
    'whenToUse': '保持默认 1 即可。仅在意极致性能时才考虑设为 5~10。',
    'avoidWhen': '不宜设置过大（>50），否则真实 NaN 崩溃会被忽视很多步。'
  },
  'advanced': {
    'principle': '每 N 步执行 torch.isnan(loss).any() + torch.isinf(loss).any()，代价约为一次 GPU→CPU 同步（约 0.1ms）。',
    'expectedImpact': '从 1 改为 10，理论节省约 1-5μs/step（几乎不可测量），不值得为此牺牲检测实时性。'
  },
  'relatedConfigs': ['safeguard_enabled', 'safeguard_max_nan_count']
})

write('safeguard_max_nan_count.json', {
  'key': 'safeguard_max_nan_count',
  'title': '最大连续 NaN 次数',
  'category': '训练 / 稳定性',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'aliases': ['lulynx_safeguard_max_nan_count'],
  'standard': {
    'summary': '连续检测到多少次 NaN/Inf loss 后强制停止训练。默认 3。',
    'effect': '设为 1 = 首次 NaN 立即停止（最严格）；设为 10 = 允许偶发 NaN 继续，仅持续 NaN 时停止。',
    'whenToUse': '默认 3 适合大多数场景。使用 FP16 且 NaN 偶发概率较高时可提高到 5~10。',
    'avoidWhen': '不建议设为 0（不停止）或过大（掩盖真实崩溃）。'
  },
  'advanced': {
    'principle': '维护连续 NaN 计数器：正常步归零，触发时递增，超过阈值抛出 SafeGuardException 终止训练。',
    'tradeoffs': '设置过低（=1）可能因混合精度偶发数值噪声误触发；设置过高则真实崩溃时浪费更多 GPU 时间。'
  },
  'relatedConfigs': ['safeguard_enabled', 'safeguard_nan_check_interval']
})

write('safeguard_loss_spike_threshold.json', {
  'key': 'safeguard_loss_spike_threshold',
  'title': 'Loss Spike 阈值',
  'category': '训练 / 稳定性',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'aliases': ['lulynx_safeguard_loss_spike_threshold'],
  'standard': {
    'summary': '当前 loss 超过滑动窗口均值多少倍时判定为 spike（异常跳升）。默认 5.0。',
    'effect': '阈值越小越敏感，越容易误触发；越大则容忍更大的 loss 波动。触发后执行自动降 LR 或计入统计。',
    'whenToUse': '初训新素材时 loss 变化较大，建议调高到 8~10。稳定收敛阶段可降至 3~5 以更敏锐捕捉异常。',
    'avoidWhen': '不建议设为 1~2（对正常 loss 波动过于敏感，会频繁触发降 LR 影响收敛）。'
  },
  'advanced': {
    'principle': 'spike_score = current_loss / (window_mean + 1e-8)，超过阈值触发。配合 loss_window_size 控制均值基准稳定性。',
    'tradeoffs': '训练早期 loss 尚未稳定时窗口均值本身波动大，阈值设低容易误触发。'
  },
  'relatedConfigs': ['safeguard_enabled', 'safeguard_loss_window_size', 'safeguard_auto_reduce_lr']
})

write('safeguard_loss_window_size.json', {
  'key': 'safeguard_loss_window_size',
  'title': 'Loss 窗口大小',
  'category': '训练 / 稳定性',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'aliases': ['lulynx_safeguard_loss_window_size'],
  'standard': {
    'summary': '用于检测 loss spike 的滑动窗口大小（步数），窗口内均值作为「正常 loss」基准。默认 20。',
    'effect': '窗口越大，基准均值越稳定，不易被短暂波动影响；窗口越小，基准对近期 loss 更敏感。',
    'whenToUse': '默认 20 适合大多数训练。总步数 <100 时可减小到 5~10；长训练（>1000 步）可增大到 50。',
    'avoidWhen': '窗口过小（<5）时均值不稳定；过大（>100）时基准更新太慢，早期 spike 可能被淹没。'
  },
  'advanced': {
    'principle': '使用循环队列（deque with maxlen=window_size）维护最近 N 步 loss，取均值为 spike 检测基准。',
    'tradeoffs': '窗口大小影响「正常 loss」基准的平滑程度，与 spike_threshold 共同决定触发灵敏度。'
  },
  'relatedConfigs': ['safeguard_enabled', 'safeguard_loss_spike_threshold']
})

write('safeguard_auto_reduce_lr.json', {
  'key': 'safeguard_auto_reduce_lr',
  'title': '自动降低学习率',
  'category': '训练 / 稳定性',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'aliases': ['lulynx_safeguard_auto_reduce_lr'],
  'standard': {
    'summary': 'SafeGuard 检测到 loss spike 时，自动将学习率乘以 lr_reduction_factor 降低，而非直接停止训练。',
    'effect': '开启后 spike 触发时不停训，尝试以更低学习率继续。适合无人值守训练，宁可慢下来也不中断。',
    'whenToUse': '希望训练全程无人值守且不因一次 spike 中断时开启。结合 lr_reduction_factor=0.5 调整降幅。',
    'avoidWhen': '若 loss 爆炸是真实崩溃（如数据错误），自动降 LR 也救不了，建议关闭让训练直接停止排查。'
  },
  'advanced': {
    'principle': '触发 spike 后调用 optimizer.param_groups 遍历，将所有参数组 lr *= lr_reduction_factor。不影响优化器动量等状态。',
    'tradeoffs': '多次触发导致 LR 呈指数衰减（连续 3 次 0.5 倍 → 降至原 LR × 0.125），可能影响后续收敛速度。'
  },
  'relatedConfigs': ['safeguard_enabled', 'safeguard_lr_reduction_factor', 'safeguard_loss_spike_threshold']
})

write('safeguard_lr_reduction_factor.json', {
  'key': 'safeguard_lr_reduction_factor',
  'title': '降学习率倍率',
  'category': '训练 / 稳定性',
  'appliesTo': ['anima-lora', 'sdxl-lora', 'sd-lora'],
  'aliases': ['lulynx_safeguard_lr_reduction_factor'],
  'standard': {
    'summary': '每次 SafeGuard 触发自动降 LR 时，学习率乘以的系数。默认 0.5（减半）。',
    'effect': '0.5 = 每次触发减半；0.8 = 温和降低 20%；0.1 = 激进降至 10%。',
    'whenToUse': '默认 0.5 是稳健选择。若 loss 波动频繁但不严重，可改 0.8 避免 LR 衰减过快。',
    'avoidWhen': '不建议设为 0（LR 清零，训练停滞）或 1.0（等于不降）。'
  },
  'advanced': {
    'principle': 'new_lr = current_lr * lr_reduction_factor，应用于所有 param_groups。多次触发累乘，属于永久性降低，不会自动恢复。',
    'tradeoffs': '若误触发多次会导致 LR 过低，建议同时调高 spike_threshold 减少误触发频率。'
  },
  'relatedConfigs': ['safeguard_enabled', 'safeguard_auto_reduce_lr', 'safeguard_loss_spike_threshold']
})

print('SafeGuard: 7 个条目完成')

# ── AutoController (ac_*) ────────────────────────────────────────────────────
# 主条目 ac_enabled + 子条目各成一文件

write('ac_enabled.json', {
  'key': 'ac_enabled',
  'title': 'AutoController（自动训练控制器）',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'aliases': ['lulynx_auto_controller_enabled', 'auto_controller_enabled'],
  'standard': {
    'summary': '智能训练控制器，根据 loss、CLIP 漂移、梯度秩等指标自动调整学习率、触发早停或冻结文本编码器。适合长时间无人值守训练。',
    'effect': '开启后训练器在后台持续监控训练健康状态，自动响应平台期/崩溃/收敛信号，不需要人工看顾。',
    'whenToUse': '长步数训练（>300 步）、无人值守场景。配合智能早停可防止过拟合继续浪费时间。',
    'avoidWhen': '短训练（<100 步）或需要精确控制每步行为时。AutoController 的自动调整会改变原定训练计划。'
  },
  'advanced': {
    'principle': '每 ac_warmup_steps 步后启动，每 ac_loss_plateau_window 步评估一次损失趋势、CLIP 漂移、梯度 stable rank。根据多种信号联合决策触发相应干预。',
    'intervention': '可触发：智能早停（long-term loss 无改善）/ 学习率衰减（loss 平台期）/ 自动 TE 冻结（指定步数后）/ 动态损失缩放 / 自动 LR 调整（GSNR/目标 loss）。',
    'expectedImpact': '正常收敛训练几乎不会触发任何干预；平台期或过拟合时自动介入，节省无效训练时间。',
    'tradeoffs': '参数组合复杂，各干预策略叠加时行为难以预测。建议先开启基本版（只开早停+LR衰减），熟悉后再开启 GSNR/CLIP 等高级监控。',
    'codePath': 'core/lulynx_trainer/auto_controller.py → AutoControllerMixin'
  },
  'relatedConfigs': ['ac_warmup_steps', 'ac_enable_smart_early_stopping', 'ac_enable_smart_lr_decay', 'ac_enable_auto_te_freeze', 'ac_loss_plateau_window']
})

write('ac_enable_smart_early_stopping.json', {
  'key': 'ac_enable_smart_early_stopping',
  'title': '智能早停',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '损失长期不下降时自动停止训练，避免过拟合或无效训练浪费时间。',
    'effect': '若在 ac_early_stopping_patience 次评估窗口内 loss 改善小于 ac_early_stopping_threshold，则自动停止训练。',
    'whenToUse': '长步数训练或不确定最佳步数时开启。可防止过拟合继续。',
    'avoidWhen': 'loss 曲线有明显振荡但整体在下降时，早停可能误判平台期。'
  },
  'advanced': {
    'principle': '维护最近 ac_early_stopping_patience 个评估窗口的 best loss，若当前 best 相比历史 best 改善 < threshold，触发停止。',
    'tradeoffs': 'patience 设置过小（<3）容易误触发；过大（>20）则失去保护意义。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_early_stopping_patience', 'ac_early_stopping_threshold']
})

write('ac_early_stopping_patience.json', {
  'key': 'ac_early_stopping_patience',
  'title': '早停耐心值',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': 'loss 在多少次连续评估窗口内没有改善就触发早停。默认 5。',
    'effect': 'patience=5 表示允许连续 5 个评估窗口（每窗口 ac_loss_plateau_window 步）没有改善才停止。',
    'whenToUse': '训练初期 loss 波动大时建议设为 8~10；稳定训练可保持 5。',
    'avoidWhen': '不建议设为 1~2（太容易误触发）。'
  },
  'advanced': {
    'principle': '统计连续未改善评估次数，超过 patience 触发。每次 loss 有改善时计数器归零。',
    'tradeoffs': '与 loss_plateau_window 乘积决定总容忍步数：patience=5, window=50 → 250 步无改善才停止。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_enable_smart_early_stopping', 'ac_early_stopping_threshold', 'ac_loss_plateau_window']
})

write('ac_early_stopping_threshold.json', {
  'key': 'ac_early_stopping_threshold',
  'title': '早停阈值',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': 'loss 改善小于此值视为无改善。默认 0.001（改善 0.001 以上才计为「有进展」）。',
    'effect': '阈值越大越宽松（更难触发早停）；越小越严格（微小改善也算有进展）。',
    'whenToUse': '默认 0.001 适合大多数 LoRA 训练。若 loss 量级很小（如 <0.01），可适当降低到 0.0001。',
    'avoidWhen': '不建议设为 0（任何微小改善都算有进展，早停永远不触发）。'
  },
  'advanced': {
    'principle': '改善量 = max(hist_losses) - current_best。若改善量 < threshold 视为未改善，patience 计数器递增。',
    'tradeoffs': '需要与训练的 loss 量级匹配，不同 scheduler/optimizer 组合的 loss 范围差异较大。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_enable_smart_early_stopping', 'ac_early_stopping_patience']
})

write('ac_enable_smart_lr_decay.json', {
  'key': 'ac_enable_smart_lr_decay',
  'title': '智能学习率衰减',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '检测到 loss 进入平台期时自动降低学习率，尝试突破平台继续收敛。',
    'effect': '触发时将学习率乘以 ac_lr_decay_factor，最多触发 ac_max_decays 次。',
    'whenToUse': '长训练中 loss 反复出现平台期时开启，让训练器自动微调 LR 突破瓶颈。',
    'avoidWhen': '配合 cosine/rex 等本身带衰减的 scheduler 时意义不大，可能造成 LR 双重衰减。'
  },
  'advanced': {
    'principle': '评估 loss 平台（基于 loss_plateau_window 窗口），若确认平台则触发 lr *= ac_lr_decay_factor，并记录衰减次数（最多 max_decays 次）。',
    'tradeoffs': 'LR 衰减不可逆，多次触发后可能导致 LR 过低而训练停滞。建议 max_decays 不超过 3~5。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_lr_decay_factor', 'ac_max_decays', 'ac_loss_plateau_window']
})

write('ac_lr_decay_factor.json', {
  'key': 'ac_lr_decay_factor',
  'title': '学习率衰减系数',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '智能 LR 衰减触发时，学习率乘以的系数。默认 0.5（减半）。',
    'effect': '0.5 = 每次减半；0.7 = 温和降低 30%；0.3 = 激进降至 30%。',
    'whenToUse': '默认 0.5 稳健。若平台期后希望温和调整可改为 0.7~0.8。',
    'avoidWhen': '不建议设为 0 或 1.0。'
  },
  'advanced': {
    'principle': 'new_lr = current_lr * ac_lr_decay_factor，应用于所有参数组，永久生效。',
    'tradeoffs': '多次触发后 LR 呈指数衰减：3 次 × 0.5 → 原 LR 的 12.5%。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_enable_smart_lr_decay', 'ac_max_decays']
})

write('ac_max_decays.json', {
  'key': 'ac_max_decays',
  'title': '最大衰减次数',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '智能 LR 衰减最多可触发的次数，超过后不再继续降低。默认 3。',
    'effect': '防止 LR 因反复平台期无限下降至接近 0。3 次 × 0.5 = LR 降至原来的 12.5%。',
    'whenToUse': '默认 3 适合大多数场景。长训练（>1000 步）可适当增加到 5。',
    'avoidWhen': '不建议设为 0（完全不降）或过大（LR 接近 0 后训练无效）。'
  },
  'advanced': {
    'principle': '计数器在每次触发衰减时递增，达到 max_decays 后停止响应平台期信号。',
    'tradeoffs': 'max_decays 与 lr_decay_factor 共同决定 LR 的最终下限。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_enable_smart_lr_decay', 'ac_lr_decay_factor']
})

write('ac_enable_auto_te_freeze.json', {
  'key': 'ac_enable_auto_te_freeze',
  'title': '自动冻结文本编码器',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '训练到指定步数（ac_te_freeze_step）后自动冻结文本编码器，减少后续显存占用和计算量。',
    'effect': '冻结 TE 后 TE 参数不再更新，节省约 10-20% 的 backward 开销（取决于 TE 参与度）。',
    'whenToUse': '训练文本编码器且步数较长时开启。常见做法：前半段训练 TE，后半段冻结 TE 让 UNet/DiT 继续精调。',
    'avoidWhen': '从不训练文本编码器（train_text_encoder=false）时此选项无意义。'
  },
  'advanced': {
    'principle': '到达 ac_te_freeze_step 时，对 text_encoder 的所有参数调用 requires_grad_(False)，从优化器 param_groups 中移除 TE 参数。',
    'tradeoffs': '冻结时机（te_freeze_step）需要根据训练步数比例调整，过早冻结可能限制风格学习，过晚则失去节省的意义。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_te_freeze_step']
})

write('ac_te_freeze_step.json', {
  'key': 'ac_te_freeze_step',
  'title': 'TE 冻结步数',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '在第几个优化步冻结文本编码器。需开启 ac_enable_auto_te_freeze 才生效。',
    'effect': '在此步数后 TE 不再被优化器更新，后续步骤只训练 UNet/DiT 层。',
    'whenToUse': '通常设为总步数的 40%~60%。如总步数 500，可设为 200~300。',
    'avoidWhen': '设为 0 时等于立即冻结（从第 0 步就不训练 TE），相当于关闭 TE 训练。'
  },
  'advanced': {
    'principle': 'step >= ac_te_freeze_step 时触发一次性冻结操作，之后每步跳过 TE backward。',
    'tradeoffs': '需要与 train_text_encoder 联动，确认 TE 确实在前半段被训练。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_enable_auto_te_freeze']
})

write('ac_enable_dynamic_loss_scaling.json', {
  'key': 'ac_enable_dynamic_loss_scaling',
  'title': '动态损失缩放',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '根据梯度范数动态调整 loss 的缩放系数，防止梯度爆炸或消失。',
    'effect': '梯度范数过大时缩小 loss 缩放，过小时放大，维持梯度在健康范围内。',
    'whenToUse': '使用 FP16 混合精度训练且梯度不稳定时考虑开启。',
    'avoidWhen': '已使用 GradScaler 或 BF16（不需要动态缩放）时避免与系统级 loss scaler 冲突。'
  },
  'advanced': {
    'principle': '基于历史梯度范数动态调整 loss 缩放系数，类似 AMP GradScaler 的自定义实现。',
    'tradeoffs': '与系统级 GradScaler 可能冲突，需要确认不重复开启。'
  },
  'relatedConfigs': ['ac_enabled']
})

write('ac_enable_auto_lr_adjustment.json', {
  'key': 'ac_enable_auto_lr_adjustment',
  'title': '自动学习率调整（GSNR）',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '根据梯度信噪比（GSNR）或目标 loss 自动调整学习率，追踪训练健康指标实现更精确的控制。',
    'effect': '当 GSNR 偏离目标时，按 ac_auto_lr_scale_factor 调整 LR，以保持梯度质量在期望范围内。',
    'whenToUse': '对训练质量要求高、有充足调参经验时开启。需要配合 ac_target_gsnr 设置合理目标值。',
    'avoidWhen': '初学者不建议开启，GSNR 目标设置不当会导致 LR 反复剧烈波动。'
  },
  'advanced': {
    'principle': 'GSNR = (mean_grad / std_grad)²，反映梯度信号质量。GSNR 过低（梯度噪声大）→ 降 LR；过高（梯度过于集中）→ 可适当提高 LR。',
    'tradeoffs': '计算 GSNR 需要对所有参数梯度做统计，额外开销约 5~10%；目标值需要根据具体模型和数据集调整。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_auto_lr_scale_factor', 'ac_target_gsnr', 'ac_target_loss']
})

write('ac_auto_lr_scale_factor.json', {
  'key': 'ac_auto_lr_scale_factor',
  'title': '自动学习率缩放因子',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '自动 LR 调整触发时的缩放系数。默认 1.0（不缩放）。',
    'effect': '>1.0 = 提高 LR；<1.0 = 降低 LR。配合 GSNR 目标使用。',
    'whenToUse': '配合 ac_enable_auto_lr_adjustment 使用，根据 GSNR 偏差方向调整。',
    'avoidWhen': '不清楚 GSNR 目标时保持默认 1.0（相当于禁用缩放）。'
  },
  'advanced': {
    'principle': '基于 GSNR 与目标的偏差比例，按 scale_factor 调整 LR，实现闭环控制。',
    'tradeoffs': 'scale_factor 过大会导致 LR 剧烈振荡。建议从 1.0 附近小步调整。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_enable_auto_lr_adjustment', 'ac_target_gsnr']
})

write('ac_target_gsnr.json', {
  'key': 'ac_target_gsnr',
  'title': '目标 GSNR',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '期望的梯度信噪比（Gradient Signal-to-Noise Ratio）目标值。默认 5.0。',
    'effect': 'GSNR 高于目标 → 可适当提高 LR；GSNR 低于目标 → 降低 LR。',
    'whenToUse': '开启 ac_enable_auto_lr_adjustment 后设置。5.0 是 LoRA 训练的经验合理范围。',
    'avoidWhen': '没有 GSNR 监控经验时不建议调整，保持默认。'
  },
  'advanced': {
    'principle': 'GSNR = E[‖g‖²] / Var[g]，刻画梯度的信号质量。工业训练常见范围 1~20。LoRA 由于参数少，GSNR 通常比全量微调高。',
    'tradeoffs': '目标值需要根据实际训练 GSNR 曲线校准，初始建议先观察几次训练的 GSNR 范围再设定目标。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_enable_auto_lr_adjustment', 'ac_target_loss']
})

write('ac_target_loss.json', {
  'key': 'ac_target_loss',
  'title': '目标 Loss',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '期望达到的目标 loss 值。达到此值后 AutoController 可触发收敛相关策略。默认 0.0（不设目标）。',
    'effect': '设为 0 = 不使用目标 loss。设为具体值后 AutoController 会在 loss 接近目标时调整策略。',
    'whenToUse': '对训练质量有明确量化目标时设置。LoRA 训练通常 loss 在 0.05~0.2 范围收敛。',
    'avoidWhen': '不清楚目标 loss 量级时保持 0（禁用）。'
  },
  'advanced': {
    'principle': '与 GSNR 目标联合使用，当 loss 接近 target_loss 时可调整 LR 策略避免过拟合。',
    'tradeoffs': '目标 loss 需要根据具体任务和基座模型校准，设置不当可能导致训练过早停止。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_enable_auto_lr_adjustment', 'ac_target_gsnr']
})

write('ac_warmup_steps.json', {
  'key': 'ac_warmup_steps',
  'title': 'AutoController 预热步数',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': 'AutoController 在多少步后才开始生效，避免训练初期不稳定状态误触发干预。默认 100。',
    'effect': '前 100 步 AutoController 处于静默观察状态，不执行任何干预；100 步后开始监控并可能触发策略。',
    'whenToUse': '总步数的 10%~20% 是合理的预热范围。总步数 200 步可设为 20~40；总步数 1000 步可设为 100~200。',
    'avoidWhen': '不建议设为 0（训练刚开始 loss 不稳定，立即监控容易误判）。'
  },
  'advanced': {
    'principle': '预热期内所有监控信号（loss 窗口、GSNR 统计、CLIP 漂移）正常积累，但不触发任何干预动作。预热结束后再开始评估。',
    'tradeoffs': '预热期过长则早停/LR 衰减的保护效果推迟；过短则噪声信号可能导致误触发。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_loss_plateau_window', 'ac_enable_smart_early_stopping']
})

write('ac_loss_plateau_window.json', {
  'key': 'ac_loss_plateau_window',
  'title': '损失平台检测窗口',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '判断 loss 是否进入平台期的滑动窗口大小（步数）。默认 50。',
    'effect': '窗口越大，平台期判断越稳定，不易被短暂波动影响；越小，响应更快但容易误判。',
    'whenToUse': '默认 50 适合大多数 LoRA 训练。总步数较短时可减小到 20；长训练可增大到 100。',
    'avoidWhen': '不建议设为 <10（统计意义太弱）或 >总步数的 20%（永远检测不到平台期）。'
  },
  'advanced': {
    'principle': '维护一个长度为 plateau_window 的 loss 队列，计算趋势斜率，斜率接近 0 则判定为平台期。',
    'tradeoffs': '与 ac_early_stopping_patience 组合决定总容忍步数：window=50, patience=5 → 250 步无改善才早停。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_enable_smart_early_stopping', 'ac_enable_smart_lr_decay', 'ac_early_stopping_patience']
})

write('ac_gradient_rank_plateau_window.json', {
  'key': 'ac_gradient_rank_plateau_window',
  'title': '梯度秩平台检测窗口',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '判断梯度矩阵 stable rank 是否进入平台期的滑动窗口大小。默认 30。',
    'effect': '梯度 stable rank 反映 LoRA 权重的有效秩使用情况，平台期可能意味着 rank 浪费或收敛。',
    'whenToUse': '开启 CLIP 漂移 / Stable Rank 监控时使用。默认值适合大多数场景。',
    'avoidWhen': '未开启 gradient rank 相关监控时此参数无意义。'
  },
  'advanced': {
    'principle': 'stable rank = (‖W‖_F / ‖W‖_2)²，反映权重矩阵的有效秩。rank 平台可能是收敛信号或 rank 利用率低的信号。',
    'tradeoffs': '计算 stable rank 需要 SVD，额外开销较大，仅在需要精细监控时开启。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_stable_rank_collapse_threshold', 'ac_stable_rank_consecutive']
})

write('ac_clip_drift_warning.json', {
  'key': 'ac_clip_drift_warning',
  'title': 'CLIP 漂移警告阈值',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': 'CLIP 分数漂移超过此值时发出警告（不干预）。默认 0.03。',
    'effect': '警告级别仅记录日志，不触发 LR 调整或训练停止，用于提醒用户注意。',
    'whenToUse': '监控训练过程中图像-文本对齐是否出现偏移，可作为过拟合的早期信号。',
    'avoidWhen': '不使用 CLIP 评分评估的训练场景可忽略此参数。'
  },
  'advanced': {
    'principle': 'CLIP 漂移 = |CLIP_score_step_n - CLIP_score_baseline| / CLIP_score_baseline，反映当前生成与训练早期的文本对齐偏差。',
    'tradeoffs': 'CLIP 评估本身有计算开销，频繁评估会影响训练速度。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_clip_drift_danger', 'ac_clip_drift_consecutive']
})

write('ac_clip_drift_danger.json', {
  'key': 'ac_clip_drift_danger',
  'title': 'CLIP 漂移危险阈值',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': 'CLIP 分数漂移超过此值时触发干预（如降低学习率）。默认 0.05。',
    'effect': '超过危险阈值且持续 ac_clip_drift_consecutive 步后，AutoController 会触发相应干预策略。',
    'whenToUse': '配合 CLIP 评估监控开启。0.05 = 对齐度下降 5% 时触发，是常见合理值。',
    'avoidWhen': '若不关心文本对齐（如纯风格 LoRA），可适当调高避免误触发。'
  },
  'advanced': {
    'principle': '危险级别触发干预：降低 LR 或发出停止信号。需连续 ac_clip_drift_consecutive 步超过阈值才触发，防止偶发误触发。',
    'tradeoffs': 'CLIP 分数本身有波动，单步超阈值不足以判断漂移，需要连续超阈值才有意义。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_clip_drift_warning', 'ac_clip_drift_consecutive']
})

write('ac_clip_drift_consecutive.json', {
  'key': 'ac_clip_drift_consecutive',
  'title': 'CLIP 漂移连续触发次数',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '连续多少步 CLIP 漂移超过危险阈值才触发干预。默认 5。',
    'effect': '防止偶发的 CLIP 分数波动误触发干预，要求持续异常才响应。',
    'whenToUse': '默认 5 适合大多数场景。训练 batch 较小时 CLIP 分数波动更大，可适当增大到 8~10。',
    'avoidWhen': '不建议设为 1（太容易误触发）。'
  },
  'advanced': {
    'principle': '维护连续超阈值计数器，正常步归零，超阈值递增，达到阈值才触发干预。',
    'tradeoffs': '值越大越稳健，但检测延迟越长；实际触发时已经连续多步异常，可能已有一定偏移。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_clip_drift_danger', 'ac_clip_drift_warning']
})

write('ac_stable_rank_collapse_threshold.json', {
  'key': 'ac_stable_rank_collapse_threshold',
  'title': 'Stable Rank 崩溃阈值',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': 'LoRA 权重矩阵 stable rank 下降超过此比例视为崩溃，触发 AutoController 干预。默认 0.3（下降 30%）。',
    'effect': 'stable rank 崩溃通常意味着 LoRA 权重退化为低秩，有效表达能力降低。',
    'whenToUse': '使用较高 rank（>=16）的 LoRA 时开启以防止 rank 崩溃。',
    'avoidWhen': '本来就使用极低 rank（rank=1~2）时 stable rank 本身就低，此监控无意义。'
  },
  'advanced': {
    'principle': 'stable_rank = (‖W‖_F)² / (‖W‖_2)²，崩溃检测 = (baseline_rank - current_rank) / baseline_rank > threshold。',
    'tradeoffs': '计算 stable rank 需要 SVD，对大矩阵开销可观。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_stable_rank_consecutive', 'ac_gradient_rank_plateau_window']
})

write('ac_stable_rank_consecutive.json', {
  'key': 'ac_stable_rank_consecutive',
  'title': 'Stable Rank 连续触发次数',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '连续多少步 stable rank 低于崩溃阈值才触发干预。默认 10。',
    'effect': '防止偶发 SVD 数值波动误触发干预，要求持续崩溃才响应。',
    'whenToUse': '默认 10 适合大多数场景。',
    'avoidWhen': '不使用 stable rank 监控时此参数无意义。'
  },
  'advanced': {
    'principle': '维护连续低于阈值计数器，达到后触发干预（通常为降 LR 或告警）。',
    'tradeoffs': '值越大，检测到真实崩溃的延迟越长；值越小，偶发波动越容易误触发。'
  },
  'relatedConfigs': ['ac_enabled', 'ac_stable_rank_collapse_threshold']
})

write('ac_batch_size_step.json', {
  'key': 'ac_batch_size_step',
  'title': '批量大小调整步长',
  'category': '训练 / 自动化',
  'appliesTo': ['anima-lora'],
  'standard': {
    'summary': '动态批量大小调整时每次增减的步长。默认 1。',
    'effect': '当 AutoController 判断需要调整 batch size 时，每次增减的数量。',
    'whenToUse': '开启动态 batch 调整策略时使用。默认 1 是最保守的步长。',
    'avoidWhen': '未启用动态 batch 调整时此参数无意义。'
  },
  'advanced': {
    'principle': '动态 batch 调整是实验性功能，根据梯度方差和内存状态自动调整每步的有效 batch size。',
    'tradeoffs': 'batch size 变化会影响学习率有效性（通常 batch double → LR double），需要同步调整 LR 或使用自适应优化器。'
  },
  'relatedConfigs': ['ac_enabled']
})

print('AutoController: 18 个条目完成')
