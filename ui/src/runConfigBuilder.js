// runConfigBuilder.js — 构建 run config（前端 UI config → 后端训练 payload）
// 从 sdxlSchema.js 抽出（阶段 1b）。
// ctx 注入 getSectionsForType / isFieldVisible，避免对 schemaIndex 的循环依赖。

import { SCHEDULER_VALUE_TO_TYPE } from './features/settingsOptions.js';
import { STANDARD_SCHEDULERS } from './schemaCommon.js';

export function buildRunConfigFromSections(config, typeId, ctx) {
  const tid = typeId || config.model_train_type || 'sdxl-lora';
  const payload = {};
  // 学习率字段虽然 schema type='string'（支持 1e-4 输入），但传给后端必须是数字
  const lrKeys = new Set(['learning_rate', 'unet_lr', 'text_encoder_lr', 'control_net_lr']);
  for (const s of ctx.getSectionsForType(tid)) {
    for (const f of s.fields) {
      if (f.type === 'ui_group') continue;
      if (f.type !== 'hidden' && !ctx.isFieldVisible(f, config)) continue;
      const v = config[f.key];
      if (f.type === 'boolean') { payload[f.key] = Boolean(v); continue; }
      if (f.type === 'number' || f.type === 'slider') {
        if (v === '' || v == null) continue;
        const p = Number(v); if (!Number.isNaN(p)) {
          // dropout 类参数：值为 0 时不写入，避免传无效参数给后端
          if (p === 0 && (f.key === 'network_dropout' || f.key === 'dropout')) continue;
          if (f.key === 'clip_skip' && p === 2) continue;  // clip_skip=2 是界面默认值，不发送（等同旧前端不传 clip_skip）
          payload[f.key] = p;
        } continue;
      }
      if (v === '' || v == null) continue;
      if (lrKeys.has(f.key)) {
        const n = Number(v);
        if (!Number.isNaN(n)) { payload[f.key] = n; continue; }
      }
      payload[f.key] = v;
    }
  }
  payload.model_train_type = tid;

  // ── 扩展调度器显示项 → 后端自定义 lr_scheduler_type ──
  // UI 的 lr_scheduler 下拉可显示 torch.optim / pytorch_optimizer 调度器。
  // 后端 train_util 仍要求这类调度器通过 lr_scheduler_type 传入。
  if (payload.lr_scheduler && SCHEDULER_VALUE_TO_TYPE[payload.lr_scheduler]) {
    payload.lr_scheduler_type = SCHEDULER_VALUE_TO_TYPE[payload.lr_scheduler];
    payload.lr_scheduler = 'constant';
  } else if (payload.lr_scheduler && !STANDARD_SCHEDULERS.includes(payload.lr_scheduler)) {
    payload.lr_scheduler_type = payload.lr_scheduler;
    payload.lr_scheduler = 'constant';
  }

  // ── Prodigy / ProdigyPlus / 自适应优化器 optimizer_args 自动组装 ──
  // 旧前端会自动生成 optimizer_args = ["decouple=True", "weight_decay=0.01", ...]
  // 新前端需要在这里复现相同逻辑，否则 Prodigy 训练结果全是噪点
  const rawOptimizerType = String(payload.optimizer_type || '').trim();
  const pluginOptimizerMatch = rawOptimizerType.match(/^PytorchOptimizer[:/](.+)$/i)
    || rawOptimizerType.match(/^pytorch_optimizer\.(.+)$/i);
  if (pluginOptimizerMatch) {
    const pluginOptimizerName = pluginOptimizerMatch[1].trim();
    payload.optimizer_type = 'PytorchOptimizer';
    const existingCustomArgs = String(payload.optimizer_args_custom || '').trim();
    const lines = existingCustomArgs
      ? existingCustomArgs.split(/[\n\r]+/).map(s => s.trim()).filter(s => s && s.includes('='))
      : [];
    const hasNameArg = lines.some((line) => /^\s*(name|optimizer_name|optimizer)\s*=/.test(line));
    payload.optimizer_args = hasNameArg ? lines : ['name=' + pluginOptimizerName, ...lines];
    delete payload.prodigy_d0;
    delete payload.prodigy_d_coef;
    delete payload.optimizer_args_custom;
  }

  const optimizerKey = String(payload.optimizer_type || '').trim().toLowerCase();
  const isProdigy = optimizerKey === 'prodigy';
  const isProdigyPlus = optimizerKey === 'prodigyplus.prodigyplusschedulefree';
  if (pluginOptimizerMatch) {
    // handled above
  } else if (isProdigy || isProdigyPlus) {
    const optimArgs = [];
    if (isProdigy) {
      optimArgs.push('decouple=True');
      optimArgs.push('weight_decay=0.01');
    }
    optimArgs.push('use_bias_correction=True');
    const dCoef = String(payload.prodigy_d_coef || '2.0').trim();
    if (dCoef && dCoef !== '0') {
      optimArgs.push('d_coef=' + dCoef);
    }
    const d0 = String(payload.prodigy_d0 || '').trim();
    if (d0 && d0 !== '' && d0 !== '0') {
      optimArgs.push('d0=' + d0);
    }
    // 合并用户自定义 optimizer_args
    const customArgsRaw = String(payload.optimizer_args_custom || '').trim();
    if (customArgsRaw) {
      const customLines = customArgsRaw.split(/[\n\r]+/).map(s => s.trim()).filter(s => s && s.includes('='));
      // 用户自定义参数覆盖自动生成的同名参数
      const autoKeys = new Set(optimArgs.map(a => a.split('=')[0]));
      for (const line of customLines) {
        const key = line.split('=')[0];
        if (autoKeys.has(key)) {
          // 替换自动生成的
          const idx = optimArgs.findIndex(a => a.startsWith(key + '='));
          if (idx >= 0) optimArgs[idx] = line;
        } else {
          optimArgs.push(line);
        }
      }
    }
    payload.optimizer_args = optimArgs;
    delete payload.prodigy_d0;
    delete payload.prodigy_d_coef;
    delete payload.optimizer_args_custom;
  } else if (payload.optimizer_type && ['DAdaptation', 'DAdaptAdam', 'DAdaptLion'].includes(payload.optimizer_type)) {
    // DAdaptation 系列也需要 decouple
    const optimArgs = ['decouple=True'];
    const customArgsRaw = String(payload.optimizer_args_custom || '').trim();
    if (customArgsRaw) {
      const customLines = customArgsRaw.split(/[\n\r]+/).map(s => s.trim()).filter(s => s && s.includes('='));
      const autoKeys = new Set(optimArgs.map(a => a.split('=')[0]));
      for (const line of customLines) {
        const key = line.split('=')[0];
        if (autoKeys.has(key)) {
          const idx = optimArgs.findIndex(a => a.startsWith(key + '='));
          if (idx >= 0) optimArgs[idx] = line;
        } else {
          optimArgs.push(line);
        }
      }
    }
    payload.optimizer_args = optimArgs;
    delete payload.prodigy_d0;
    delete payload.prodigy_d_coef;
    delete payload.optimizer_args_custom;
  } else {
    // 非自适应优化器：如果有自定义 args 仍然传
    const customArgsRaw = String(payload.optimizer_args_custom || '').trim();
    if (customArgsRaw) {
      payload.optimizer_args = customArgsRaw.split(/[\n\r]+/).map(s => s.trim()).filter(s => s && s.includes('='));
    }
    delete payload.prodigy_d0;
    delete payload.prodigy_d_coef;
    delete payload.optimizer_args_custom;
  }

  // ── LyCORIS network_args 转换 ──
  // 后端 sd-scripts 要求 lycoris.kohya 的参数通过 network_args 数组传入，
  // 如 ["algo=locon", "conv_dim=16", ...]。UI 字段是独立的 key，需要在此组装。
  // Anima 类型由后端 apply_anima_ui_overrides 自行处理，这里跳过。
  if (payload.network_module === 'lycoris.kohya' && !tid.startsWith('anima')) {
    const networkArgs = [];
    const algo = String(payload.lycoris_algo || 'locon').trim().toLowerCase();
    networkArgs.push('algo=' + algo);

    if (payload.conv_dim != null && String(payload.conv_dim) !== '') {
      networkArgs.push('conv_dim=' + payload.conv_dim);
    }
    if (payload.conv_alpha != null && String(payload.conv_alpha) !== '') {
      networkArgs.push('conv_alpha=' + payload.conv_alpha);
    }
    if (payload.lycoris_preset != null && String(payload.lycoris_preset).trim() !== '') {
      networkArgs.push('preset=' + String(payload.lycoris_preset).trim());
    }
    if (payload.dropout != null && Number(payload.dropout) > 0) {
      networkArgs.push('dropout=' + payload.dropout);
    }
    if (payload.rank_dropout != null && String(payload.rank_dropout) !== '' && Number(payload.rank_dropout) > 0) {
      networkArgs.push('rank_dropout=' + payload.rank_dropout);
    }
    if (payload.module_dropout != null && String(payload.module_dropout) !== '' && Number(payload.module_dropout) > 0) {
      networkArgs.push('module_dropout=' + payload.module_dropout);
    }
    if (payload.train_norm != null) {
      networkArgs.push('train_norm=' + (payload.train_norm ? 'True' : 'False'));
    }
    if (payload.use_tucker) {
      networkArgs.push('use_tucker=True');
    }
    if (payload.use_scalar) {
      networkArgs.push('use_scalar=True');
    }
    if (payload.block_size != null && String(payload.block_size) !== '' && Number(payload.block_size) > 0) {
      networkArgs.push('block_size=' + payload.block_size);
    }
    if (payload.rescaled) {
      networkArgs.push('rescaled=True');
    }
    if (payload.constraint != null && String(payload.constraint) !== '') {
      networkArgs.push('constraint=' + payload.constraint);
    }
    if (payload.rs_lora) {
      networkArgs.push('rs_lora=True');
    }
    if (algo === 'lokr' && payload.lokr_factor != null) {
      networkArgs.push('factor=' + payload.lokr_factor);
    }
    if (algo === 'lokr' && payload.decompose_both) {
      networkArgs.push('decompose_both=True');
    }
    if (algo === 'lokr' && payload.full_matrix) {
      networkArgs.push('full_matrix=True');
    }
    if (algo === 'lokr' && payload.unbalanced_factorization) {
      networkArgs.push('unbalanced_factorization=True');
    }
    if (payload.dora_wd) {
      networkArgs.push('dora_wd=True');
      if (['locon', 'loha', 'lokr'].includes(algo) && payload.wd_on_output != null) {
        networkArgs.push('wd_on_output=' + (payload.wd_on_output ? 'True' : 'False'));
      }
    }
    const forcedBypassMode = payload.dora_wd ? false : payload.bypass_mode;
    if (forcedBypassMode != null) {
      networkArgs.push('bypass_mode=' + (forcedBypassMode ? 'True' : 'False'));
    }
    if (payload.scale_weight_norms != null && String(payload.scale_weight_norms) !== '') {
      networkArgs.push('scale_weight_norms=' + payload.scale_weight_norms);
    }

    payload.network_args = networkArgs;
    // 合并 network_args_custom
    const netArgsCustomRaw = String(payload.network_args_custom || '').trim();
    if (netArgsCustomRaw) {
      const customLines = netArgsCustomRaw.split(/[\n\r]+/).map(s => s.trim()).filter(s => s);
      payload.network_args.push(...customLines);
    }
    // 清理原始 UI 字段，避免 sd-scripts 不认识这些 key 报错或误用
    delete payload.lycoris_algo;
    delete payload.conv_dim;
    delete payload.conv_alpha;
    delete payload.lycoris_preset;
    delete payload.dropout;
    delete payload.rank_dropout;
    delete payload.module_dropout;
    delete payload.train_norm;
    delete payload.use_tucker;
    delete payload.use_scalar;
    delete payload.block_size;
    delete payload.rescaled;
    delete payload.constraint;
    delete payload.rs_lora;
    delete payload.lokr_factor;
    delete payload.dora_wd;
    delete payload.wd_on_output;
    delete payload.bypass_mode;
    delete payload.decompose_both;
    delete payload.full_matrix;
    delete payload.unbalanced_factorization;
    delete payload.network_dropout;  // 与 lycoris 不兼容，避免冲突
    delete payload.enable_base_weight;
    delete payload.network_args_custom;
  } else {
    // 非 LyCORIS: 处理 network_args_custom
    const netArgsCustomRaw = String(payload.network_args_custom || '').trim();
    if (netArgsCustomRaw) {
      const existingArgs = payload.network_args || [];
      const customLines = netArgsCustomRaw.split(/[\n\r]+/).map(s => s.trim()).filter(s => s);
      payload.network_args = [...existingArgs, ...customLines];
    }
    delete payload.network_args_custom;
  }

  // ── base_weights textarea → 数组 ──
  if (payload.enable_base_weight) {
    if (payload.base_weights && typeof payload.base_weights === 'string') {
      const lines = payload.base_weights.split(/[\n\r]+/).map(s => s.trim()).filter(s => s);
      payload.base_weights = lines.length > 0 ? lines : undefined;
    }

    if (payload.base_weights_multiplier && typeof payload.base_weights_multiplier === 'string') {
      const lines = payload.base_weights_multiplier.split(/[\n\r]+/).map(s => s.trim()).filter(s => s);
      payload.base_weights_multiplier = lines.length > 0 ? lines.map(Number).filter(n => !Number.isNaN(n)) : undefined;
    }
  } else {
    delete payload.base_weights;
    delete payload.base_weights_multiplier;
  }
  delete payload.enable_base_weight;

  // ── block weights: UI 开关 → 子字段清理 ──
  if (!payload.enable_block_weights) {
    delete payload.down_lr_weight;
    delete payload.mid_lr_weight;
    delete payload.up_lr_weight;
    delete payload.block_lr_zero_threshold;
  }
  delete payload.enable_block_weights;

  // ── train_length_mode: 纯 UI 开关，后端无对应 CLI 参数 ──
  // 它仅决定 UI 显示哪一个长度字段（max_train_epochs / max_train_steps），
  // 真正的长度字段已经由上方的 visibleWhen 过滤逻辑保证只发激活的那个，
  // 这里把控制开关本身从 payload 中移除，避免污染 .toml 文件和 metadata。
  delete payload.train_length_mode;

  // ── PiSSA: 关闭时清理子字段 ──
  if (!payload.pissa_init) {
    delete payload.pissa_method;
    delete payload.pissa_niter;
    delete payload.pissa_oversample;
    delete payload.pissa_apply_conv2d;
    delete payload.pissa_export_mode;
  }

  // ── lr_scheduler_args textarea → 数组 ──
  if (payload.lr_scheduler_args && typeof payload.lr_scheduler_args === 'string') {
    const lines = payload.lr_scheduler_args.split(/[\n\r]+/).map(s => s.trim()).filter(s => s && s.includes('='));
    payload.lr_scheduler_args = lines.length > 0 ? lines : undefined;
    if (!payload.lr_scheduler_args) delete payload.lr_scheduler_args;
  }

  // ── lr_scheduler_type 空值清理 ──
  if (!payload.lr_scheduler_type || !payload.lr_scheduler_type.trim()) delete payload.lr_scheduler_type;
  // ── huber_schedule 空值清理 ──

  if (payload.huber_schedule === '') delete payload.huber_schedule;

  // ── Newbie: newbie_target_modules textarea → 换行分隔保留原始字符串 ──
  // 后端 newbie_lora_train.py 自行 split('\n')，所以保持 \n 分隔的字符串即可
  if (payload.newbie_target_modules && typeof payload.newbie_target_modules === 'string') {
    const cleaned = payload.newbie_target_modules.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    payload.newbie_target_modules = cleaned || undefined;
  }

  return payload;
}
