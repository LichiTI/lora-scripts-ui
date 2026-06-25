import { SCHEDULER_VALUE_TO_TYPE } from './features/settingsOptions.js';
import { OPT_FIELD_ARG_KEYS } from './features/optimizerParams.js';

const STANDARD_SCHEDULERS = [
  'linear',
  'cosine',
  'cosine_with_restarts',
  'polynomial',
  'constant',
  'constant_with_warmup',
  'adafactor',
  'inverse_sqrt',
  'reduce_lr_on_plateau',
  'cosine_with_min_lr',
  'cosine_warmup_with_min_lr',
  'loss_gated_cosine',
  'loss_weighted_annealed_cosine',
  'warmup_stable_decay',
  'piecewise_constant',
];

const LR_KEYS = new Set(['learning_rate', 'unet_lr', 'text_encoder_lr', 'control_net_lr']);
const LYCORIS_MODULE_ALIASES = new Set(['lycoris.kohya', 'lycoris.locon', 'lycoris']);
const OFT_MODULE_ALIASES = new Set(['networks.oft', 'oft', 'diag-oft', 'diag_oft']);
const SUPPORTED_LYCORIS_ALGOS = new Set(['locon', 'loha', 'lokr', 'ia3', 'full', 'diag-oft']);

function argLines(raw) {
  return String(raw || '')
    .trim()
    .split(/[\n\r]+/)
    .map((line) => line.trim())
    .filter((line) => line && line.includes('='));
}

function appendCustomArgs(args, rawCustomArgs) {
  const customLines = argLines(rawCustomArgs);
  const autoKeys = new Set(args.map((arg) => arg.split('=')[0]));
  for (const line of customLines) {
    const key = line.split('=')[0];
    if (autoKeys.has(key)) {
      const index = args.findIndex((arg) => arg.startsWith(key + '='));
      if (index >= 0) args[index] = line;
    } else {
      args.push(line);
    }
  }
  return args;
}

function collectVisiblePayload(config, typeId, getSectionsForType, isFieldVisible) {
  const payload = {};
  for (const section of getSectionsForType(typeId)) {
    for (const field of section.fields) {
      if (field.type === 'ui_group') continue;
      if (field.type !== 'hidden' && !isFieldVisible(field, config)) continue;
      const value = config[field.key];
      if (field.type === 'boolean') {
        payload[field.key] = Boolean(value);
        continue;
      }
      if (field.type === 'number' || field.type === 'slider') {
        if (value === '' || value == null) continue;
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
          if (parsed === 0 && (field.key === 'network_dropout' || field.key === 'dropout')) continue;
          if (field.key === 'clip_skip' && parsed === 2) continue;
          payload[field.key] = parsed;
        }
        continue;
      }
      if (value === '' || value == null) continue;
      if (LR_KEYS.has(field.key)) {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
          payload[field.key] = parsed;
          continue;
        }
      }
      payload[field.key] = value;
    }
  }
  payload.model_train_type = typeId;
  return payload;
}

function normalizeScheduler(payload) {
  if (payload.lr_scheduler && SCHEDULER_VALUE_TO_TYPE[payload.lr_scheduler]) {
    payload.lr_scheduler_type = SCHEDULER_VALUE_TO_TYPE[payload.lr_scheduler];
    payload.lr_scheduler = 'constant';
  } else if (payload.lr_scheduler && !STANDARD_SCHEDULERS.includes(payload.lr_scheduler)) {
    payload.lr_scheduler_type = payload.lr_scheduler;
    payload.lr_scheduler = 'constant';
  }
}

function normalizeOptimizerArgs(payload) {
  if (payload.frontier_optimizer_product_candidate_enabled && payload.frontier_optimizer_candidate) {
    payload.optimizer_type = String(payload.frontier_optimizer_candidate || '').trim();
    payload.frontier_optimizer_product_candidate_enabled = true;
    delete payload.frontier_optimizer_candidate;
  } else {
    delete payload.frontier_optimizer_candidate;
    if (!payload.frontier_optimizer_product_candidate_enabled) {
      delete payload.frontier_optimizer_product_candidate_enabled;
    }
  }

  const rawOptimizerType = String(payload.optimizer_type || '').trim();
  const pluginOptimizerMatch = rawOptimizerType.match(/^PytorchOptimizer[:/](.+)$/i)
    || rawOptimizerType.match(/^pytorch_optimizer\.(.+)$/i);
  if (pluginOptimizerMatch) {
    const pluginOptimizerName = pluginOptimizerMatch[1].trim();
    payload.optimizer_type = 'PytorchOptimizer';
    const lines = argLines(payload.optimizer_args_custom);
    const hasNameArg = lines.some((line) => /^\s*(name|optimizer_name|optimizer)\s*=/.test(line));
    payload.optimizer_args = hasNameArg ? lines : ['name=' + pluginOptimizerName, ...lines];
    delete payload.prodigy_d0;
    delete payload.prodigy_d_coef;
    delete payload.optimizer_args_custom;
    return;
  }

  const genericOptimizerMatch = rawOptimizerType.match(/^GenericOptimizer[:/](.+)$/i)
    || rawOptimizerType.match(/^(bitsandbytes\.optim\..+)$/i);
  if (genericOptimizerMatch) {
    const genericOptimizerName = genericOptimizerMatch[1].trim();
    payload.optimizer_type = 'GenericOptimizer';
    const lines = argLines(payload.optimizer_args_custom);
    const hasNameArg = lines.some((line) => /^\s*(name|optimizer_name|optimizer)\s*=/.test(line));
    payload.optimizer_args = hasNameArg ? lines : ['name=' + genericOptimizerName, ...lines];
    delete payload.prodigy_d0;
    delete payload.prodigy_d_coef;
    delete payload.optimizer_args_custom;
    return;
  }

  const optimizerKey = String(payload.optimizer_type || '').trim().toLowerCase();
  const isProdigy = optimizerKey === 'prodigy';
  const isProdigyPlus = optimizerKey === 'prodigyplus.prodigyplusschedulefree';
  if (isProdigy || isProdigyPlus) {
    const args = [];
    if (isProdigy) {
      args.push('decouple=True');
      args.push('weight_decay=0.01');
    }
    args.push('use_bias_correction=True');
    const dCoef = String(payload.prodigy_d_coef || '2.0').trim();
    if (dCoef && dCoef !== '0') args.push('d_coef=' + dCoef);
    const d0 = String(payload.prodigy_d0 || '').trim();
    if (d0 && d0 !== '' && d0 !== '0') args.push('d0=' + d0);
    payload.optimizer_args = appendCustomArgs(args, payload.optimizer_args_custom);
  } else if (payload.optimizer_type && ['DAdaptation', 'DAdaptAdam', 'DAdaptLion'].includes(payload.optimizer_type)) {
    payload.optimizer_args = appendCustomArgs(['decouple=True'], payload.optimizer_args_custom);
  } else {
    // 收集 opt_* 专属字段组装 args
    const specificArgs = [];
    for (const [fieldKey, argName] of Object.entries(OPT_FIELD_ARG_KEYS)) {
      const val = payload[fieldKey];
      if (val != null && val !== '') specificArgs.push(`${argName}=${val}`);
    }
    const customArgs = argLines(payload.optimizer_args_custom);
    if (specificArgs.length > 0 || customArgs.length > 0) {
      payload.optimizer_args = appendCustomArgs(specificArgs, payload.optimizer_args_custom);
    }
  }
  delete payload.prodigy_d0;
  delete payload.prodigy_d_coef;
  delete payload.optimizer_args_custom;
  // 清理所有 opt_* 临时字段
  for (const key of Object.keys(payload)) {
    if (key.startsWith('opt_')) delete payload[key];
  }
}

function normalizeLycorisNetworkArgs(payload, typeId) {
  const rawNetworkModule = String(payload.network_module || '').trim().toLowerCase();
  const isOftAlias = OFT_MODULE_ALIASES.has(rawNetworkModule);
  const isLycoris = LYCORIS_MODULE_ALIASES.has(rawNetworkModule) || isOftAlias;

  if (isOftAlias) {
    payload.network_module = 'lycoris.kohya';
    payload.lycoris_algo = 'diag-oft';
  } else if (LYCORIS_MODULE_ALIASES.has(rawNetworkModule)) {
    payload.network_module = 'lycoris.kohya';
  }

  if (!isLycoris || typeId.startsWith('anima')) {
    const customLines = String(payload.network_args_custom || '')
      .trim()
      .split(/[\n\r]+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (customLines.length > 0) {
      payload.network_args = [...(payload.network_args || []), ...customLines];
    }
    delete payload.network_args_custom;
    return;
  }

  const networkArgs = [];
  let algo = String(payload.lycoris_algo || 'locon').trim().toLowerCase().replace(/_/g, '-');
  if (!SUPPORTED_LYCORIS_ALGOS.has(algo)) algo = 'locon';
  payload.lycoris_algo = algo;
  networkArgs.push('algo=' + algo);
  if (payload.conv_dim != null && String(payload.conv_dim) !== '') {
    payload.lycoris_conv_dim = payload.conv_dim;
    networkArgs.push('conv_dim=' + payload.conv_dim);
  }
  if (payload.conv_alpha != null && String(payload.conv_alpha) !== '') {
    payload.lycoris_conv_alpha = payload.conv_alpha;
    networkArgs.push('conv_alpha=' + payload.conv_alpha);
  }
  if (payload.lycoris_preset != null && String(payload.lycoris_preset).trim() !== '') networkArgs.push('preset=' + String(payload.lycoris_preset).trim());
  if (payload.dropout != null && Number(payload.dropout) > 0) {
    payload.network_dropout = payload.dropout;
    networkArgs.push('dropout=' + payload.dropout);
  }
  if (payload.rank_dropout != null && String(payload.rank_dropout) !== '' && Number(payload.rank_dropout) > 0) {
    payload.lokr_rank_dropout = payload.rank_dropout;
    networkArgs.push('rank_dropout=' + payload.rank_dropout);
  }
  if (payload.module_dropout != null && String(payload.module_dropout) !== '' && Number(payload.module_dropout) > 0) {
    payload.lokr_module_dropout = payload.module_dropout;
    networkArgs.push('module_dropout=' + payload.module_dropout);
  }
  if (payload.train_norm != null) {
    payload.lycoris_train_norm = Boolean(payload.train_norm);
    networkArgs.push('train_norm=' + (payload.train_norm ? 'True' : 'False'));
  }
  if (payload.use_tucker) networkArgs.push('use_tucker=True');
  if (payload.use_scalar) networkArgs.push('use_scalar=True');
  if (payload.block_size != null && String(payload.block_size) !== '' && Number(payload.block_size) > 0) networkArgs.push('block_size=' + payload.block_size);
  if (payload.rescaled) networkArgs.push('rescaled=True');
  if (payload.constraint != null && String(payload.constraint) !== '') networkArgs.push('constraint=' + payload.constraint);
  if (payload.rs_lora) networkArgs.push('rs_lora=True');
  if (algo === 'lokr' && payload.lokr_factor != null) {
    payload.lycoris_lokr_factor = payload.lokr_factor;
    networkArgs.push('factor=' + payload.lokr_factor);
  }
  if (algo === 'lokr' && payload.decompose_both) {
    payload.lokr_decompose_both = true;
    networkArgs.push('decompose_both=True');
  }
  if (algo === 'lokr' && payload.full_matrix) {
    payload.lokr_full_matrix = true;
    networkArgs.push('full_matrix=True');
  }
  if (algo === 'lokr' && payload.unbalanced_factorization) {
    payload.lokr_unbalanced_factorization = true;
    networkArgs.push('unbalanced_factorization=True');
  }
  if (payload.dora_wd) {
    networkArgs.push('dora_wd=True');
    if (['locon', 'loha', 'lokr'].includes(algo) && payload.wd_on_output != null) {
      networkArgs.push('wd_on_output=' + (payload.wd_on_output ? 'True' : 'False'));
    }
  }
  const forcedBypassMode = payload.dora_wd ? false : payload.bypass_mode;
  if (forcedBypassMode != null) networkArgs.push('bypass_mode=' + (forcedBypassMode ? 'True' : 'False'));
  if (payload.scale_weight_norms != null && String(payload.scale_weight_norms) !== '') networkArgs.push('scale_weight_norms=' + payload.scale_weight_norms);

  const customLines = String(payload.network_args_custom || '')
    .trim()
    .split(/[\n\r]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  payload.network_args = [...networkArgs, ...customLines];

  for (const key of [
    'conv_dim', 'conv_alpha', 'lycoris_preset', 'dropout',
    'rank_dropout', 'module_dropout', 'train_norm', 'use_tucker', 'use_scalar',
    'block_size', 'rescaled', 'constraint', 'rs_lora', 'lokr_factor', 'dora_wd',
    'wd_on_output', 'bypass_mode', 'decompose_both', 'full_matrix',
    'unbalanced_factorization', 'enable_base_weight',
    'network_args_custom',
  ]) {
    delete payload[key];
  }
}

function normalizeListTextareas(payload) {
  if (payload.enable_base_weight) {
    if (payload.base_weights && typeof payload.base_weights === 'string') {
      const lines = payload.base_weights.split(/[\n\r]+/).map((line) => line.trim()).filter(Boolean);
      payload.base_weights = lines.length > 0 ? lines : undefined;
    }
    if (payload.base_weights_multiplier && typeof payload.base_weights_multiplier === 'string') {
      const lines = payload.base_weights_multiplier.split(/[\n\r]+/).map((line) => line.trim()).filter(Boolean);
      payload.base_weights_multiplier = lines.length > 0 ? lines.map(Number).filter((value) => !Number.isNaN(value)) : undefined;
    }
  } else {
    delete payload.base_weights;
    delete payload.base_weights_multiplier;
  }
  delete payload.enable_base_weight;

  if (payload.lr_scheduler_args && typeof payload.lr_scheduler_args === 'string') {
    const lines = argLines(payload.lr_scheduler_args);
    payload.lr_scheduler_args = lines.length > 0 ? lines : undefined;
    if (!payload.lr_scheduler_args) delete payload.lr_scheduler_args;
  }

  if (payload.newbie_target_modules && typeof payload.newbie_target_modules === 'string') {
    const cleaned = payload.newbie_target_modules.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    payload.newbie_target_modules = cleaned || undefined;
  }
}

function normalizeAttention(payload) {
  const explicitAttention = String(payload.attn_mode || payload.attention_backend || '').trim().toLowerCase();
  if (!explicitAttention) {
    payload.attention_backend = 'auto';
  } else if (explicitAttention === 'flash' || explicitAttention === 'flashattn' || explicitAttention === 'fa2') {
    payload.attention_backend = 'flash2';
  } else {
    payload.attention_backend = explicitAttention;
  }
  if (payload.attention_backend !== 'xformers') payload.xformers = false;
  if (payload.attention_backend !== 'sageattn' && payload.attention_backend !== 'sageattention') payload.sageattn = false;
  if (payload.attention_backend !== 'flash2') payload.flashattn = false;
}

function removeUiOnlyFields(payload) {
  if (!payload.enable_block_weights) {
    delete payload.down_lr_weight;
    delete payload.mid_lr_weight;
    delete payload.up_lr_weight;
    delete payload.block_lr_zero_threshold;
  }
  delete payload.enable_block_weights;
  delete payload.train_length_mode;
  delete payload.enable_inference_accel;

  const initStrategy = String(payload.adapter_init_strategy || payload.init_lora_weights || 'default').trim().toLowerCase();
  const pissaStrategy = initStrategy === 'pissa' || Boolean(payload.pissa_init);
  if (pissaStrategy) {
    payload.adapter_init_strategy = 'pissa';
    payload.pissa_init = true;
  }
  if (!pissaStrategy) {
    delete payload.pissa_method;
    delete payload.pissa_niter;
    delete payload.pissa_oversample;
    delete payload.pissa_apply_conv2d;
    delete payload.pissa_export_mode;
  }
  if (!payload.adapter_init_strategy || payload.adapter_init_strategy === 'default') {
    delete payload.adapter_init_export_mode;
    delete payload.loftq_bits;
    delete payload.loftq_quant_type;
  } else if (payload.adapter_init_strategy !== 'loftq') {
    delete payload.loftq_bits;
    delete payload.loftq_quant_type;
  }
  if (!payload.lr_scheduler_type || !payload.lr_scheduler_type.trim()) delete payload.lr_scheduler_type;
  if (payload.huber_schedule === '') delete payload.huber_schedule;
}

export function buildRunConfigFromSections(config, typeId, { getSectionsForType, isFieldVisible }) {
  const resolvedTypeId = typeId || config.model_train_type || 'sdxl-lora';
  const payload = collectVisiblePayload(config, resolvedTypeId, getSectionsForType, isFieldVisible);
  normalizeScheduler(payload);
  normalizeOptimizerArgs(payload);
  normalizeLycorisNetworkArgs(payload, resolvedTypeId);
  normalizeListTextareas(payload);
  removeUiOnlyFields(payload);
  normalizeAttention(payload);
  return payload;
}
