// Centralized catalogs for optimizer / scheduler display settings.
// Keep these lists broad: the settings page uses them to let users decide
// which choices should be visible in training forms. Some entries are aliases
// or custom class paths that are bridged to backend arguments at submit time.

export const BASE_OPTIMIZERS = [
  'AdamW',
  'AdamW8bit',
  'PagedAdamW8bit',
  'PagedAdamW',
  'PagedAdamW32bit',
  'RAdamScheduleFree',
  'AdamWScheduleFree',
  'SGDScheduleFree',
  'Lion',
  'Lion8bit',
  'PagedLion8bit',
  'SGDNesterov',
  'SGDNesterov8bit',
  'DAdaptation',
  'DAdaptAdamPreprint',
  'DAdaptAdam',
  'DAdaptAdaGrad',
  'DAdaptAdan',
  'DAdaptAdanIP',
  'DAdaptLion',
  'DAdaptSGD',
  'Adafactor',
  'AdaFactor',
  'Prodigy',
  'prodigyplus.ProdigyPlusScheduleFree',
  'pytorch_optimizer.CAME',
  'bitsandbytes.optim.AdEMAMix8bit',
  'bitsandbytes.optim.PagedAdEMAMix8bit',
];

export const PYTORCH_OPTIMIZER_NAMES = [
  'LBFGS',
  'SGD',
  'Adam',
  'AdamW',
  'NAdam',
  'RMSprop',
  'A2Grad',
  'ADOPT',
  'APOLLO',
  'ASGD',
  'AccSGD',
  'AdEMAMix',
  'AdaBelief',
  'AdaBound',
  'AdaDelta',
  'AdaFactor',
  'AdaGC',
  'AdaGO',
  'AdaHessian',
  'AdaLOMO',
  'AdaMax',
  'AdaMod',
  'AdaMuon',
  'AdaNorm',
  'AdaPNM',
  'AdaShift',
  'AdaSmooth',
  'AdaTAM',
  'Adai',
  'Adalite',
  'AdamC',
  'AdamG',
  'AdamMini',
  'AdamP',
  'AdamS',
  'AdamWSN',
  'Adan',
  'AggMo',
  'Aida',
  'AliG',
  'Alice',
  'BCOS',
  'Amos',
  'Ano',
  'ApolloDQN',
  'AvaGrad',
  'BSAM',
  'CAME',
  'Conda',
  'Compass',
  'DAdaptAdaGrad',
  'DAdaptAdam',
  'DAdaptAdan',
  'DAdaptLion',
  'DAdaptSGD',
  'DeMo',
  'DiffGrad',
  'DistributedMuon',
  'EXAdam',
  'EmoFact',
  'EmoLynx',
  'EmoNavi',
  'FAdam',
  'FOCUS',
  'FTRL',
  'Fira',
  'Fromage',
  'GaLore',
  'Grams',
  'Gravity',
  'GrokFastAdamW',
  'Kate',
  'Kron',
  'LARS',
  'LOMO',
  'LaProp',
  'Lamb',
  'Lion',
  'MADGRAD',
  'MARS',
  'MSVAG',
  'Muon',
  'Nero',
  'NovoGrad',
  'PAdam',
  'PID',
  'PNM',
  'Prodigy',
  'QHAdam',
  'QHM',
  'RACS',
  'RAdam',
  'Ranger',
  'Ranger21',
  'Ranger25',
  'SCION',
  'SCIONLight',
  'SGDP',
  'SGDSaI',
  'SGDW',
  'SM3',
  'SOAP',
  'SPAM',
  'SPlus',
  'SRMM',
  'SWATS',
  'ScalableShampoo',
  'ScheduleFreeAdamW',
  'ScheduleFreeRAdam',
  'ScheduleFreeSGD',
  'Shampoo',
  'SignSGD',
  'SimplifiedAdEMAMix',
  'SophiaH',
  'StableAdamW',
  'StableSPAM',
  'TAM',
  'Tiger',
  'VSGD',
  'Yogi',
  'SpectralSphere',
];

function optimizerBaseName(name) {
  const value = String(name || '').trim();
  const dotIndex = value.lastIndexOf('.');
  return (dotIndex === -1 ? value : value.slice(dotIndex + 1)).toLowerCase();
}

function dedupeKeepOrder(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function invertKeepFirst(mapping) {
  const result = {};
  for (const [value, type] of Object.entries(mapping)) {
    if (!Object.hasOwn(result, type)) {
      result[type] = value;
    }
  }
  return result;
}

const BASE_OPTIMIZER_BASE_NAMES = new Set(BASE_OPTIMIZERS.map(optimizerBaseName));

export const ALL_OPTIMIZERS = dedupeKeepOrder([
  ...BASE_OPTIMIZERS,
  ...PYTORCH_OPTIMIZER_NAMES
    .filter((name) => !BASE_OPTIMIZER_BASE_NAMES.has(name.toLowerCase()))
    .map((name) => `pytorch_optimizer.${name}`),
]);

export const BUILTIN_SCHEDULERS = [
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

export const SCHEDULER_LABELS = Object.freeze({
  linear: '线性衰减（linear）',
  cosine: '余弦退火（cosine）',
  cosine_with_restarts: '余弦重启（cosine_with_restarts）',
  polynomial: '多项式衰减（polynomial）',
  constant: '恒定学习率（constant）',
  constant_with_warmup: '预热后恒定（constant_with_warmup）',
  adafactor: 'Adafactor 内置调度（adafactor）',
  inverse_sqrt: '反平方根衰减（inverse_sqrt）',
  reduce_lr_on_plateau: '平台期降学习率（reduce_lr_on_plateau）',
  cosine_with_min_lr: '带最小值余弦（cosine_with_min_lr）',
  cosine_warmup_with_min_lr: '预热 + 最小值余弦（cosine_warmup_with_min_lr）',
  loss_gated_cosine: 'Loss 门控余弦（loss_gated_cosine）',
  loss_weighted_annealed_cosine: 'Loss 加权退火余弦（loss_weighted_annealed_cosine）',
  warmup_stable_decay: '预热-稳定-衰减（warmup_stable_decay）',
  piecewise_constant: '分段恒定（piecewise_constant）',
});

export function schedulerOption(value) {
  const raw = value && typeof value === 'object'
    ? String(value.value ?? '').trim()
    : String(value || '').trim();
  const fallbackLabel = value && typeof value === 'object'
    ? String(value.label ?? raw)
    : raw;
  return { value: raw, label: SCHEDULER_LABELS[raw] || fallbackLabel };
}

export function schedulerOptions(values) {
  return (Array.isArray(values) ? values : []).map(schedulerOption).filter((option) => option.value);
}

export const CUSTOM_SCHEDULERS = [
  'torch.optim.lr_scheduler.CosineAnnealingLR',
  'torch.optim.lr_scheduler.CosineAnnealingWarmRestarts',
  'torch.optim.lr_scheduler.OneCycleLR',
  'torch.optim.lr_scheduler.StepLR',
  'torch.optim.lr_scheduler.MultiStepLR',
  'torch.optim.lr_scheduler.CyclicLR',
  'pytorch_optimizer.CosineAnnealingWarmupRestarts',
  'pytorch_optimizer.REXScheduler',
  'pytorch_optimizer.CosineScheduler',
  'pytorch_optimizer.LinearScheduler',
  'pytorch_optimizer.PolyScheduler',
  'pytorch_optimizer.ProportionScheduler',
  'pytorch_optimizer.get_chebyshev_schedule',
  'pytorch_optimizer.get_wsd_schedule',
  // Backward-compatible display aliases kept for existing saved UI settings.
  'cosine_annealing',
  'cosine_annealing_with_warmup',
  'cosine_annealing_warm_restarts',
  'rex',
];

export const ALL_SCHEDULERS = dedupeKeepOrder([
  ...BUILTIN_SCHEDULERS,
  ...CUSTOM_SCHEDULERS,
]);

export const SCHEDULER_VALUE_TO_TYPE = Object.freeze({
  'torch.optim.lr_scheduler.CosineAnnealingLR': 'torch.optim.lr_scheduler.CosineAnnealingLR',
  'torch.optim.lr_scheduler.CosineAnnealingWarmRestarts': 'torch.optim.lr_scheduler.CosineAnnealingWarmRestarts',
  'torch.optim.lr_scheduler.OneCycleLR': 'torch.optim.lr_scheduler.OneCycleLR',
  'torch.optim.lr_scheduler.StepLR': 'torch.optim.lr_scheduler.StepLR',
  'torch.optim.lr_scheduler.MultiStepLR': 'torch.optim.lr_scheduler.MultiStepLR',
  'torch.optim.lr_scheduler.CyclicLR': 'torch.optim.lr_scheduler.CyclicLR',
  'pytorch_optimizer.CosineAnnealingWarmupRestarts': 'pytorch_optimizer.CosineAnnealingWarmupRestarts',
  'pytorch_optimizer.REXScheduler': 'pytorch_optimizer.REXScheduler',
  'pytorch_optimizer.CosineScheduler': 'pytorch_optimizer.CosineScheduler',
  'pytorch_optimizer.LinearScheduler': 'pytorch_optimizer.LinearScheduler',
  'pytorch_optimizer.PolyScheduler': 'pytorch_optimizer.PolyScheduler',
  'pytorch_optimizer.ProportionScheduler': 'pytorch_optimizer.ProportionScheduler',
  'pytorch_optimizer.get_chebyshev_schedule': 'pytorch_optimizer.get_chebyshev_schedule',
  'pytorch_optimizer.get_wsd_schedule': 'pytorch_optimizer.get_wsd_schedule',
  cosine_annealing: 'torch.optim.lr_scheduler.CosineAnnealingLR',
  cosine_annealing_with_warmup: 'pytorch_optimizer.CosineAnnealingWarmupRestarts',
  cosine_annealing_warm_restarts: 'torch.optim.lr_scheduler.CosineAnnealingWarmRestarts',
  rex: 'pytorch_optimizer.REXScheduler',
});

export const SCHEDULER_TYPE_TO_VALUE = Object.freeze({
  ...invertKeepFirst(SCHEDULER_VALUE_TO_TYPE),
  'torch.optim.lr_scheduler.CosineAnnealingLR': 'cosine_annealing',
  'pytorch_optimizer.CosineAnnealingWarmupRestarts': 'cosine_annealing_with_warmup',
  'torch.optim.lr_scheduler.CosineAnnealingWarmRestarts': 'cosine_annealing_warm_restarts',
  'pytorch_optimizer.REXScheduler': 'rex',
});
