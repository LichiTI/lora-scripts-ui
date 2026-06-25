function createFieldPusher({ fields, renderField, html, rendered }) {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const pushField = (key, wrapperClass = '') => {
    const field = byKey.get(key);
    if (!field || rendered.has(key)) return;
    rendered.add(key);
    const body = renderField(field);
    html.push(wrapperClass ? `<div class="${wrapperClass}">${body}</div>` : body);
  };
  return { byKey, pushField };
}

export function renderDatasetSettingsContentLayout({ fields, renderField, renderRegularizationFieldGroup }) {
  const rendered = new Set();
  const html = [];
  const { byKey, pushField } = createFieldPusher({ fields, renderField, html, rendered });

  pushField('train_data_dir');

  const regField = byKey.get('reg_data_dir');
  const priorField = byKey.get('prior_loss_weight');
  if (regField && priorField) {
    rendered.add('reg_data_dir');
    rendered.add('prior_loss_weight');
    html.push(renderRegularizationFieldGroup(regField, priorField));
  } else {
    pushField('reg_data_dir');
    pushField('prior_loss_weight');
  }

  pushField('resolution', 'dataset-layout-full');
  pushField('enable_bucket');
  pushField('bucket_no_upscale');
  pushField('min_bucket_reso');
  pushField('max_bucket_reso');
  pushField('bucket_reso_steps');
  pushField('bucket_selection_mode');
  pushField('bucket_custom_resos', 'dataset-layout-full');

  fields.forEach((field) => {
    if (!rendered.has(field.key)) html.push(renderField(field));
  });

  return html.join('');
}

export function renderCaptionSettingsContentLayout({ fields, renderField, renderCaptionTagDropoutGroup }) {
  const rendered = new Set();
  const html = [];
  const { byKey, pushField } = createFieldPusher({ fields, renderField, html, rendered });

  pushField('caption_extension');
  pushField('max_token_length');
  pushField('shuffle_caption');
  pushField('weighted_captions');
  pushField('keep_tokens');
  pushField('keep_tokens_separator');
  pushField('caption_tag_dropout_rate', 'dataset-layout-full');
  pushField('caption_source_mix_enabled', 'dataset-layout-full');
  pushField('caption_source_nl_ratio');
  pushField('caption_source_tag_ratio');
  pushField('caption_source_trigger_only_ratio');
  pushField('caption_source_empty_ratio');
  pushField('caption_source_trigger_tokens', 'dataset-layout-full');

  const tagDropoutKeys = [
    'caption_dropout_rate',
    'caption_dropout_every_n_epochs',
    'caption_tag_dropout_targets',
    'caption_tag_dropout_target_mode',
    'caption_tag_dropout_target_count',
  ];
  const tagDropoutFields = tagDropoutKeys.map((key) => byKey.get(key)).filter(Boolean);
  if (tagDropoutFields.length) {
    tagDropoutFields.forEach((field) => rendered.add(field.key));
    html.push(renderCaptionTagDropoutGroup(tagDropoutFields));
  }

  fields.forEach((field) => {
    if (!rendered.has(field.key)) html.push(renderField(field));
  });

  return html.join('');
}

export function renderNetworkSettingsContentLayout({ fields, config = {}, renderField, renderNetworkOptionGroup }) {
  const rendered = new Set();
  const html = [];
  const { byKey, pushField } = createFieldPusher({ fields, renderField, html, rendered });
  const isLycoris = config.network_module === 'lycoris.kohya';
  const doraGroupKeys = ['rs_lora', 'bypass_mode', 'use_tucker', 'use_scalar'];
  const lycorisRegularizationKeys = ['dropout', 'rank_dropout', 'module_dropout', 'scale_weight_norms'];

  const pushBaseWeightFields = () => {
    pushField('enable_base_weight', 'dataset-layout-full');
    pushField('base_weights', 'dataset-layout-full');
    pushField('base_weights_multiplier', 'dataset-layout-full');
  };
  const pushDoraFields = () => {
    pushField('dora_wd', 'dataset-layout-full');
    pushField('wd_on_output', 'dataset-layout-full');
  };
  const pushDoraOptionGroup = (groupField) => {
    const groupFields = doraGroupKeys.map((key) => byKey.get(key)).filter(Boolean);
    if (!groupFields.length) return;
    groupFields.forEach((field) => rendered.add(field.key));
    html.push(renderNetworkOptionGroup(groupField?.label || 'DoRA 与兼容选项', groupField?.desc || '', groupFields, 'network-dora-group'));
  };
  const pushLycorisRegularizationGroup = (groupField) => {
    const groupFields = lycorisRegularizationKeys.map((key) => byKey.get(key)).filter(Boolean);
    if (!groupFields.length) return;
    groupFields.forEach((field) => rendered.add(field.key));
    html.push(renderNetworkOptionGroup(groupField?.label || '正则化与稳定性', groupField?.desc || '', groupFields, 'network-lycoris-regularization-group'));
  };

  pushField('network_module');
  pushField('dim_from_weights');
  pushField('network_dim');
  pushField('network_alpha');
  if (!isLycoris) {
    pushField('network_dropout');
    pushField('scale_weight_norms');
  }
  pushField('__ui_group_lycoris_');
  pushField('lycoris_algo');
  pushField('train_norm');
  pushField('conv_dim');
  pushField('conv_alpha');

  const lycorisPresetTarget = isLycoris && fields.some((field) => field.key === 'network_args_custom')
    ? 'network_args_custom'
    : null;

  fields.forEach((field) => {
    if (rendered.has(field.key)) return;
    if (isLycoris && (field.key === 'train_norm' || field.key === 'lycoris_preset')) return;
    if (isLycoris && lycorisRegularizationKeys.includes(field.key)) return;
    if (['dora_wd', 'wd_on_output', 'enable_base_weight', 'base_weights', 'base_weights_multiplier'].includes(field.key)) return;
    if (field.label === '正则化与稳定性') {
      rendered.add(field.key);
      pushLycorisRegularizationGroup(field);
      return;
    }
    if (field.key === '__ui_group_dora_') {
      rendered.add(field.key);
      pushDoraOptionGroup(field);
      return;
    }
    if (doraGroupKeys.includes(field.key)) return;
    if (field.key === 'network_args_custom') {
      pushDoraFields();
      pushBaseWeightFields();
    }
    rendered.add(field.key);
    html.push(renderField(field));
    if (isLycoris && field.key === lycorisPresetTarget) {
      pushField('lycoris_preset', 'dataset-layout-full');
    }
  });

  if (isLycoris) {
    pushField('lycoris_preset', 'dataset-layout-full');
  }
  pushDoraFields();
  pushBaseWeightFields();

  return html.join('');
}

export function renderOptimizerSettingsContentLayout({ fields, renderField }) {
  const rendered = new Set();
  const html = [];
  const { pushField } = createFieldPusher({ fields, renderField, html, rendered });

  pushField('optimizer_type', 'dataset-layout-full');
  pushField('learning_rate', 'dataset-layout-full');
  pushField('unet_lr');
  pushField('text_encoder_lr');
  pushField('lr_scheduler', 'dataset-layout-full');
  pushField('lr_warmup_steps');
  pushField('lr_scheduler_num_cycles');
  pushField('loss_scheduler_ema_alpha');
  pushField('loss_scheduler_min_delta');
  pushField('loss_scheduler_relative_delta');
  pushField('loss_scheduler_patience');
  pushField('loss_scheduler_cooldown');
  pushField('loss_scheduler_max_hold_steps');
  pushField('loss_scheduler_late_gamma');
  pushField('loss_scheduler_lock_weight_threshold');
  pushField('loss_scheduler_min_advance_ratio');
  pushField('lr_scheduler_type', 'dataset-layout-full');
  pushField('min_snr_gamma', 'dataset-layout-full');

  fields.forEach((field) => {
    if (!rendered.has(field.key)) html.push(renderField(field));
  });

  return html.join('');
}

export function renderTrainingSettingsContentLayout({ fields, config = {}, renderField }) {
  const rendered = new Set();
  const html = [];
  const { byKey, pushField } = createFieldPusher({ fields, renderField, html, rendered });
  const isStepMode = (config.train_length_mode || '最大轮数') === '最大步数';
  const activeLengthKey = isStepMode ? 'max_train_steps' : 'max_train_epochs';
  const fallbackLengthField = isStepMode
    ? {
        key: 'max_train_steps',
        type: 'number',
        label: '最大训练步数（max_train_steps）',
        desc: '最大训练 step（步数）',
        defaultValue: 1000,
        min: 1,
      }
    : {
        key: 'max_train_epochs',
        type: 'number',
        label: '最大训练轮数（max_train_epochs）',
        desc: '最大训练 epoch（轮数）',
        defaultValue: 10,
        min: 1,
      };
  const pushLengthField = (wrapperClass = '') => {
    if (rendered.has(activeLengthKey)) return;
    rendered.add(activeLengthKey);
    const field = byKey.get(activeLengthKey) || fallbackLengthField;
    const body = renderField(field);
    html.push(wrapperClass ? `<div class="${wrapperClass}">${body}</div>` : body);
  };

  pushField('train_length_mode', 'dataset-layout-full');
  pushLengthField('dataset-layout-full');
  pushField('train_batch_size');
  pushField('gradient_checkpointing');
  pushField('gradient_accumulation_steps');
  pushField('network_train_unet_only');
  pushField('network_train_text_encoder_only');
  pushField('enable_block_weights');

  fields.forEach((field) => {
    if (field.key === 'train_length_mode' || field.key === 'max_train_epochs' || field.key === 'max_train_steps') return;
    if (!rendered.has(field.key)) html.push(renderField(field));
  });

  return html.join('');
}
