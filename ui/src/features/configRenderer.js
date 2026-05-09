import { escapeHtml, icon as _ico } from '../utils/dom.js';

const COLLAPSIBLE_FIELD_KEYS = new Set([
  'reg_data_dir',
  'prior_loss_weight',
]);

export function createConfigRenderer({
  state,
  trainingTypes,
  getSectionsForTab,
  isFieldVisible,
  canUseBuiltinPicker,
  renderSlot,
  renderNavigator,
  syncTopbarState,
  syncFooterAction,
  updateJSONPreview,
}) {
  function renderConfig(container) {
    const tt = state.activeTrainingType;
    const typeLabel = trainingTypes.find((t) => t.id === tt)?.label || tt;
    const sections = getSectionsForTab(state.activeTab, tt);
    const visibleSections = sections.filter((section) =>
      section.fields.some((field) => field.type !== 'hidden' && isFieldVisible(field, state.config))
    );

    container.innerHTML = `
      <div class="form-container">
        <header class="section-title">
          <h2>${typeLabel} LoRA 模式</h2>
          <p></p>
        </header>
        ${renderPreflightOverviewPanel()}
        ${renderPreflightReport()}
        ${renderSlot('training.preflight_panel')}
        ${renderSlot('config.after_status_deck')}
        ${visibleSections.map(renderSection).join('')}
      </div>
    `;

    renderNavigator();
    syncTopbarState();
    syncFooterAction();
    updateJSONPreview();
  }

  function renderSection(section) {
    const fields = section.fields.filter((field) => field.type !== 'hidden' && isFieldVisible(field, state.config));
    const realFieldCount = fields.filter((field) => field.type !== 'ui_group').length;
    const sectionDescription = section.id === 'noise-settings'
      ? `改善lora明暗度 ${section.description || ''}`.trim()
      : section.description;
    const content = section.id === 'dataset-settings'
      ? renderDatasetSettingsContent(fields)
      : section.id === 'caption-settings'
      ? renderCaptionSettingsContent(fields)
      : section.id === 'network-settings'
        ? renderNetworkSettingsContent(fields)
        : section.id === 'optimizer-settings'
          ? renderOptimizerSettingsContent(fields)
          : section.id === 'training-settings'
            ? renderTrainingSettingsContent(fields)
      : fields.map((field) => renderField(field)).join('');

    if (section.id === 'data-aug-settings' || section.id === 'noise-settings' || section.id === 'validation-settings') {
      const panelClass = section.id === 'noise-settings'
        ? 'noise-settings-panel'
        : section.id === 'validation-settings'
          ? 'validation-settings-panel'
          : 'data-aug-panel';
      const summaryClass = section.id === 'noise-settings'
        ? 'noise-settings-summary'
        : section.id === 'validation-settings'
          ? 'validation-settings-summary'
          : 'data-aug-summary';
      const summaryDesc = section.id === 'data-aug-settings'
        ? '方法老旧不推荐使用'
        : section.id === 'noise-settings'
          ? '改善lora明暗度'
          : '';
      return `
        <details class="form-section collapsible-panel ${panelClass}" id="${escapeHtml(section.id)}">
          <summary class="section-header collapsible-summary ${summaryClass}">
            <span class="collapsible-summary-main">
              <span class="collapsible-title">${escapeHtml(section.title)}</span>
              ${summaryDesc ? `<span class="collapsible-desc">${escapeHtml(summaryDesc)}</span>` : ''}
            </span>
            <span class="collapsible-actions">
              <span class="section-meta">${realFieldCount} 项参数</span>
              <span class="collapsible-caret" aria-hidden="true">⌄</span>
            </span>
          </summary>
          <div class="section-summary">${escapeHtml(sectionDescription)}</div>
          <div class="section-content">${content}</div>
        </details>
      `;
    }

    return `
      <section class="form-section" id="${escapeHtml(section.id)}">
        <header class="section-header">
          <h3>${escapeHtml(section.title)}</h3>
          <span class="section-meta">${realFieldCount} 项参数</span>
        </header>
        <div class="section-summary">${escapeHtml(sectionDescription)}</div>
        <div class="section-content">${content}</div>
      </section>
    `;
  }

  function renderDatasetSettingsContent(fields) {
    const byKey = new Map(fields.map((field) => [field.key, field]));
    const rendered = new Set();
    const html = [];
    const pushField = (key, wrapperClass = '') => {
      const field = byKey.get(key);
      if (!field || rendered.has(key)) return;
      rendered.add(key);
      const body = renderField(field);
      html.push(wrapperClass ? `<div class="${wrapperClass}">${body}</div>` : body);
    };

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

  function renderCaptionSettingsContent(fields) {
    const byKey = new Map(fields.map((field) => [field.key, field]));
    const rendered = new Set();
    const html = [];
    const pushField = (key, wrapperClass = '') => {
      const field = byKey.get(key);
      if (!field || rendered.has(key)) return;
      rendered.add(key);
      const body = renderField(field);
      html.push(wrapperClass ? `<div class="${wrapperClass}">${body}</div>` : body);
    };

    pushField('caption_extension');
    pushField('max_token_length');
    pushField('shuffle_caption');
    pushField('weighted_captions');
    pushField('keep_tokens');
    pushField('keep_tokens_separator');
    pushField('caption_tag_dropout_rate', 'dataset-layout-full');

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

  function renderNetworkSettingsContent(fields) {
    const byKey = new Map(fields.map((field) => [field.key, field]));
    const rendered = new Set();
    const html = [];
    const isLycoris = state.config.network_module === 'lycoris.kohya';
    const doraGroupKeys = ['rs_lora', 'bypass_mode', 'use_tucker', 'use_scalar'];
    const lycorisRegularizationKeys = ['dropout', 'rank_dropout', 'module_dropout', 'scale_weight_norms'];
    const pushField = (key, wrapperClass = '') => {
      const field = byKey.get(key);
      if (!field || rendered.has(key)) return;
      rendered.add(key);
      const body = renderField(field);
      html.push(wrapperClass ? `<div class="${wrapperClass}">${body}</div>` : body);
    };
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

  function renderOptimizerSettingsContent(fields) {
    const byKey = new Map(fields.map((field) => [field.key, field]));
    const rendered = new Set();
    const html = [];
    const pushField = (key, wrapperClass = '') => {
      const field = byKey.get(key);
      if (!field || rendered.has(key)) return;
      rendered.add(key);
      const body = renderField(field);
      html.push(wrapperClass ? `<div class="${wrapperClass}">${body}</div>` : body);
    };

    pushField('optimizer_type', 'dataset-layout-full');
    pushField('learning_rate', 'dataset-layout-full');
    pushField('unet_lr');
    pushField('text_encoder_lr');
    pushField('lr_scheduler', 'dataset-layout-full');
    pushField('lr_warmup_steps');
    pushField('lr_scheduler_num_cycles');
    pushField('lr_scheduler_type', 'dataset-layout-full');
    pushField('min_snr_gamma', 'dataset-layout-full');

    fields.forEach((field) => {
      if (!rendered.has(field.key)) html.push(renderField(field));
    });

    return html.join('');
  }

  function renderTrainingSettingsContent(fields) {
    const byKey = new Map(fields.map((field) => [field.key, field]));
    const rendered = new Set();
    const html = [];
    const isStepMode = (state.config.train_length_mode || '最大轮数') === '最大步数';
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
    const pushField = (key, wrapperClass = '') => {
      const field = byKey.get(key);
      if (!field || rendered.has(key)) return;
      rendered.add(key);
      const body = renderField(field);
      html.push(wrapperClass ? `<div class="${wrapperClass}">${body}</div>` : body);
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

  function renderNetworkOptionGroup(title, note, fields, dataFieldKey) {
    const configuredCount = fields.reduce((count, field) => {
      const value = state.config[field.key];
      if (field.type === 'boolean') return value ? count + 1 : count;
      return value === undefined || value === null || value === '' ? count : count + 1;
    }, 0);
    const summaryText = configuredCount ? `${configuredCount} 项已设` : '未设置';
    const summaryClass = configuredCount ? '' : ' is-empty';
    const isModified = fields.some((field) => String(state.config[field.key] ?? '') !== String(field.defaultValue ?? ''));
    const modCls = isModified ? ' field-modified' : '';

    return `
      <details class="config-group collapsible-field collapsible-field-group dataset-layout-full network-group-panel${modCls}" data-field-key="${escapeHtml(dataFieldKey || 'network-option-group')}">
        <summary class="collapsible-field-summary">
          <span class="collapsible-field-summary-main">
            <span class="collapsible-field-title">${escapeHtml(title)}</span>
            ${note ? `<span class="collapsible-field-note">${escapeHtml(note)}</span>` : ''}
          </span>
          <span class="collapsible-field-value${summaryClass}">${escapeHtml(summaryText)}</span>
          <span class="collapsible-caret" aria-hidden="true">⌄</span>
        </summary>
        <div class="collapsible-field-body">
          <div class="network-group-grid">
            ${fields.map((field) => renderField(field)).join('')}
          </div>
        </div>
      </details>
    `;
  }

  function renderCaptionTagDropoutGroup(fields) {
    const summaryValue = fields.reduce((count, field) => {
      const value = state.config[field.key];
      return value === undefined || value === null || value === '' ? count : count + 1;
    }, 0);
    const summaryText = summaryValue ? `${summaryValue} 项已设` : '未设置';
    const summaryClass = summaryValue ? '' : ' is-empty';
    const isModified = fields.some((field) => String(state.config[field.key] ?? '') !== String(field.defaultValue ?? ''));
    const modCls = isModified ? ' field-modified' : '';

    return `
      <details class="config-group collapsible-field collapsible-field-group dataset-layout-full${modCls}" data-field-key="caption-tag-dropout-group">
        <summary class="collapsible-field-summary">
          <span class="collapsible-field-summary-main">
            <span class="collapsible-field-title">tag_dropout拓展</span>
            <span class="collapsible-field-note">全部标签丢弃、周期丢弃、指定 Tag 列表和处理方式</span>
          </span>
          <span class="collapsible-field-value${summaryClass}">${escapeHtml(summaryText)}</span>
          <span class="collapsible-caret" aria-hidden="true">⌄</span>
        </summary>
        <div class="collapsible-field-body collapsible-field-group-body">
          ${fields.map((field) => renderField(field)).join('')}
        </div>
      </details>
    `;
  }

  function renderRegularizationFieldGroup(regField, priorField) {
    const regValue = state.config[regField.key];
    const priorValue = state.config[priorField.key];
    const regSummary = regValue === undefined || regValue === null || regValue === '' ? '未设置' : String(regValue);
    const regSummaryClass = regSummary === '未设置' ? ' is-empty' : '';
    const regModified = String(regValue ?? '') !== String(regField.defaultValue ?? '');
    const priorModified = String(priorValue ?? '') !== String(priorField.defaultValue ?? '');
    const modCls = regModified || priorModified ? ' field-modified' : '';
    const priorInputValue = priorValue === undefined || priorValue === null || priorValue === '' ? (priorField.defaultValue ?? 1) : priorValue;

    return `
      <details class="config-group collapsible-field collapsible-field-group${modCls}" data-field-key="${regField.key}">
        <summary class="collapsible-field-summary">
          <span class="collapsible-field-summary-main">
            <span class="collapsible-field-title">${escapeHtml(regField.label)}</span>
            <span class="collapsible-field-note">${escapeHtml(regField.desc || '')}</span>
          </span>
          <span class="collapsible-field-value${regSummaryClass}">${escapeHtml(regSummary)}</span>
          <span class="collapsible-caret" aria-hidden="true">⌄</span>
        </summary>
        <div class="collapsible-field-body collapsible-field-group-body">
          <div class="input-picker">
            <button class="picker-icon" type="button" onclick="pickPath('${regField.key}', '${regField.pickerType || 'folder'}')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <input type="text" value="${escapeHtml(regValue || '')}" oninput="updateConfigValue('${regField.key}', this.value)">
          </div>
          <div class="collapsible-field-subfield" data-field-key="${priorField.key}">
            <label class="collapsible-field-subtitle">${escapeHtml(priorField.label)}</label>
            <p class="field-desc">${escapeHtml(priorField.desc || '')}</p>
            <input class="text-input" type="number" value="${escapeHtml(priorInputValue)}" ${priorField.min !== undefined ? `min="${priorField.min}"` : ''} ${priorField.max !== undefined ? `max="${priorField.max}"` : ''} ${priorField.step !== undefined ? `step="${priorField.step}"` : ''} oninput="updateConfigValue('${priorField.key}', this.value)">
          </div>
        </div>
      </details>
    `;
  }

  function renderFieldDescription(field) {
    const normal = field.desc ? `<p class="field-desc">${escapeHtml(field.desc || '')}</p>` : '';
    const important = field.importantDesc ? `<p class="field-desc field-desc-strong">${escapeHtml(field.importantDesc || '')}</p>` : '';
    return normal + important;
  }

  function renderField(field) {
    const value = state.config[field.key];
    const label = field.label;
    const defaultValue = field.defaultValue ?? '';
    if (field.type === 'ui_group') {
      return `
        <div class="config-group group-heading" data-field-key="${field.key}">
          <div class="group-heading-title">${escapeHtml(label || '')}</div>
          ${field.desc ? `<p class="group-heading-desc">${escapeHtml(field.desc)}</p>` : ''}
        </div>
      `;
    }
    const isPicker = field.type === 'file' || field.type === 'folder';
    const isModified = String(value ?? '') !== String(defaultValue);
    const showBuiltinPicker = canUseBuiltinPicker(field);
    const canUndo = Object.hasOwn(state.fieldUndo, field.key);
    const canReset = String(value ?? '') !== String(defaultValue ?? '');
    const pickerMode = field.pickerType || field.type;
    const builtinPickerIcon = (pickerMode === 'folder' || pickerMode === 'output-folder') ? '#icon-folder' : '#icon-file';
    const renderHeader = () => `
      <div class="field-header-row">
        <label>${escapeHtml(label)}</label>
        <div class="field-inline-actions" data-field-key="${field.key}">
          <button class="field-menu-toggle" type="button" title="参数更多操作" data-field-menu-key="${field.key}">···</button>
          ${showBuiltinPicker ? `<button class="picker-mode-icon-btn" type="button" title="内置文件选择器" onclick="openNativePicker('${field.key}', '${pickerMode}')"><svg class="icon"><use href="${builtinPickerIcon}"></use></svg></button>` : ''}
        </div>
      </div>
    `;

    const modCls = isModified ? ' field-modified' : '';
    const renderCollapsibleField = (bodyHtml) => {
      const rawSummaryValue = value === undefined || value === null || value === '' ? '' : String(value);
      const summaryValue = rawSummaryValue || '未设置';
      const summaryClass = rawSummaryValue ? '' : ' is-empty';
      return `
        <details class="config-group collapsible-field${modCls}" data-field-key="${field.key}">
          <summary class="collapsible-field-summary">
            <span class="collapsible-field-title">${escapeHtml(label)}</span>
            <span class="collapsible-field-value${summaryClass}">${escapeHtml(summaryValue)}</span>
            <span class="collapsible-caret" aria-hidden="true">⌄</span>
          </summary>
          ${field.desc ? `<p class="field-desc collapsible-field-desc">${escapeHtml(field.desc || '')}</p>` : ''}
          <div class="collapsible-field-body">
            ${bodyHtml}
          </div>
        </details>
      `;
    };

    if (field.type === 'boolean') {
      return `
        <div class="config-group row boolean-card${modCls}" data-field-key="${field.key}">
          <div class="label-col">
            ${renderHeader()}
            ${renderFieldDescription(field)}
          </div>
          <label class="switch switch-compact">
            <input type="checkbox" ${value ? 'checked' : ''} onchange="updateConfigValue('${field.key}', this.checked)">
            <span class="slider round"></span>
          </label>
        </div>
      `;
    }

    if (field.type === 'select') {
      let filteredOptions = field.options;
      const ensureCurrentOption = (options) => {
        const current = value === undefined || value === null ? '' : String(value);
        if (!current || options.includes(current)) {
          return options;
        }
        return [current, ...options];
      };
      if (field.key === 'optimizer_type') {
        const vis = JSON.parse(localStorage.getItem('sd-rescripts:visible-optimizers') || '[]');
        if (vis.length > 0) filteredOptions = field.options.filter((o) => vis.includes(o));
      }
      if (field.key === 'lr_scheduler') {
        const vis = JSON.parse(localStorage.getItem('sd-rescripts:visible-schedulers') || '[]');
        if (vis.length > 0) filteredOptions = field.options.filter((o) => vis.includes(o));
      }
      filteredOptions = ensureCurrentOption(filteredOptions);
      if (COLLAPSIBLE_FIELD_KEYS.has(field.key)) {
        return renderCollapsibleField(`
          ${renderHeader()}
          ${renderFieldDescription(field)}
          <select onchange="updateConfigValue('${field.key}', this.value)">
            ${filteredOptions.map((option) => `<option value="${escapeHtml(option)}" ${String(value) === String(option) ? 'selected' : ''}>${escapeHtml(option || '默认')}</option>`).join('')}
          </select>
        `);
      }
      return `
        <div class="config-group${modCls}" data-field-key="${field.key}">
          ${renderHeader()}
          ${renderFieldDescription(field)}
          <select onchange="updateConfigValue('${field.key}', this.value)">
            ${filteredOptions.map((option) => `<option value="${escapeHtml(option)}" ${String(value) === String(option) ? 'selected' : ''}>${escapeHtml(option || '默认')}</option>`).join('')}
          </select>
        </div>
      `;
    }

    if (field.type === 'textarea') {
      if (COLLAPSIBLE_FIELD_KEYS.has(field.key)) {
        return renderCollapsibleField(`
          ${renderHeader()}
          ${renderFieldDescription(field)}
          <textarea class="text-area" oninput="updateConfigValue('${field.key}', this.value)">${escapeHtml(value || '')}</textarea>
        `);
      }
      return `
        <div class="config-group${modCls}" data-field-key="${field.key}">
          ${renderHeader()}
          ${renderFieldDescription(field)}
          <textarea class="text-area" oninput="updateConfigValue('${field.key}', this.value)">${escapeHtml(value || '')}</textarea>
        </div>
      `;
    }

    const inputType = field.type === 'number' || field.type === 'slider' ? 'number' : 'text';
    const inputValue = value === undefined || value === null ? '' : value;

    if (isPicker) {
      if (COLLAPSIBLE_FIELD_KEYS.has(field.key)) {
        return renderCollapsibleField(`
          ${renderHeader()}
          ${renderFieldDescription(field)}
          <div class="input-picker">
            <button class="picker-icon" type="button" onclick="pickPath('${field.key}', '${field.pickerType || 'folder'}')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <input type="text" value="${escapeHtml(inputValue)}" oninput="updateConfigValue('${field.key}', this.value)">
          </div>
        `);
      }
      return `
        <div class="config-group${modCls}" data-field-key="${field.key}">
          ${renderHeader()}
          ${renderFieldDescription(field)}
          <div class="input-picker">
            <button class="picker-icon" type="button" onclick="pickPath('${field.key}', '${field.pickerType || 'folder'}')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <input type="text" value="${escapeHtml(inputValue)}" oninput="updateConfigValue('${field.key}', this.value)">
          </div>
        </div>
      `;
    }



    if (COLLAPSIBLE_FIELD_KEYS.has(field.key)) {
      return renderCollapsibleField(`
        ${renderHeader()}
        ${renderFieldDescription(field)}
        <input class="text-input" type="${inputType}" value="${escapeHtml(inputValue)}" ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''} ${field.step !== undefined ? `step="${field.step}"` : ''} oninput="updateConfigValue('${field.key}', this.value)">
      `);
    }

    return `
      <div class="config-group${modCls}" data-field-key="${field.key}">
        ${renderHeader()}
        ${renderFieldDescription(field)}
        <input class="text-input" type="${inputType}" value="${escapeHtml(inputValue)}" ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''} ${field.step !== undefined ? `step="${field.step}"` : ''} oninput="updateConfigValue('${field.key}', this.value)">
      </div>
    `;
  }

  function renderGpuInfo() {
    if (state.runtimeError) return state.runtimeError;
    if (!state.runtime?.cards?.length) return '等待检测显卡信息';
    return state.runtime.cards.map((card) => {
      if (typeof card === 'string') return card;
      return card.name || JSON.stringify(card);
    }).join('，');
  }

  function renderPreflightDetail() {
    if (!state.preflight) return '在训练前建议运行一遍训练预检';
    if (state.preflight.can_start) {
      const w = state.preflight.warnings || [];
      return w.length ? `${w.length} 个警告（点击"训练预检"查看详情）` : '全部通过，可以启动训练';
    }
    const errors = state.preflight.errors || [];
    if (!errors.length) return '训练预检未通过';
    return `${errors.length} 个错误（点击"训练预检"查看详情）`;
  }

  function renderPreflightOverviewPanel() {
    return `
      <details class="form-section collapsible-panel preflight-overview-panel">
        <summary class="section-header collapsible-summary preflight-overview-summary">
          <span class="collapsible-summary-main">
            <span class="collapsible-title">训练预检</span>
            <span class="collapsible-desc">运行环境、注意力后端、预检状态、任务状态和预检操作</span>
          </span>
          <span class="collapsible-caret" aria-hidden="true">⌄</span>
        </summary>
        <div class="preflight-overview-body">
          <div class="status-deck" id="status-deck">${renderStatusDeck()}</div>
          ${renderPreflightActionPanel()}
        </div>
      </details>
    `;
  }

  function renderPreflightActionPanel() {
    const isRunning = state.loading.preflight;
    return `
      <div class="section-toolbar preflight-action-panel">
        <div class="toolbar-actions toolbar-check-actions">
          <button class="btn btn-outline btn-check" type="button" onclick="runPreflight()" style="width:100%;" ${isRunning ? 'disabled' : ''}>
            <span class="btn-check-label">${isRunning ? '正在预检...' : '运行训练预检'}</span>
            <span class="btn-check-desc">检测运行环境 + 检查数据集路径、底模路径等参数</span>
          </button>
        </div>
      </div>
    `;
  }

  function renderPreflightReport() {
    const pf = state.preflight;
    if (!pf) return '';

    const errors = pf.errors || [];
    const warnings = pf.warnings || [];
    const notes = pf.notes || [];
    const ds = pf.dataset;
    const deps = pf.dependencies;

    if (errors.length === 0 && warnings.length === 0 && notes.length === 0 && !ds) {
      return '';
    }

    const canStart = pf.can_start;
    const borderColor = canStart ? (warnings.length > 0 ? '#f59e0b' : '#22c55e') : '#ef4444';
    const statusIcon = canStart ? (warnings.length > 0 ? _ico('alert-tri') : _ico('check-circle')) : _ico('x-circle');
    const statusText = canStart ? (warnings.length > 0 ? '预检通过（有警告）' : '预检通过') : '预检未通过';
    const statusColor = canStart ? (warnings.length > 0 ? '#f59e0b' : '#22c55e') : '#ef4444';

    let html = '<details class="form-section collapsible-panel preflight-report-section" id="preflight-report" style="border-left:3px solid ' + borderColor + ';" open>';
    html += '<summary class="section-header collapsible-summary preflight-report-summary">';
    html += '<span class="collapsible-summary-main"><span class="collapsible-title">' + statusIcon + ' 训练预检报告</span>';
    html += '<span class="collapsible-desc" style="color:' + statusColor + ';">' + statusText + '</span></span>';
    html += '<span class="collapsible-actions"><span class="collapsible-caret" aria-hidden="true">⌄</span><button type="button" onclick="event.preventDefault();event.stopPropagation();dismissPreflightReport()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.1rem;padding:2px 6px;" title="关闭">×</button></span>';
    html += '</summary>';
    html += '<div class="section-content collapsible-body" style="display:block;">';

    // 状态概览
    html += '<div style="font-weight:700;color:' + statusColor + ';margin-bottom:12px;">' + statusText + '</div>';

    
    if (errors.length > 0) {
      html += '<details class="preflight-group collapsible-subgroup" open>';
      html += '<summary class="preflight-group-title" style="color:#ef4444;">' + _ico('x-circle', 14) + ' 错误 (' + errors.length + ')<span class="collapsible-caret" aria-hidden="true">⌄</span></summary>';
      errors.forEach(function(e) {
        html += '<div class="preflight-item preflight-error">' + escapeHtml(e) + '</div>';
      });
      html += '</details>';
    }

    // 警告列表
    if (warnings.length > 0) {
      html += '<details class="preflight-group collapsible-subgroup" open>';
      html += '<summary class="preflight-group-title" style="color:#f59e0b;">' + _ico('alert-tri', 14) + ' 警告 (' + warnings.length + ')<span class="collapsible-caret" aria-hidden="true">⌄</span></summary>';
      warnings.forEach(function(w) {
        html += '<div class="preflight-item preflight-warning">' +escapeHtml(w) + '</div>';
      });
      html += '</details>';
    }

    // 数据集摘要
    if (ds) {
      html += '<details class="preflight-group collapsible-subgroup" open>';
      html += '<summary class="preflight-group-title">' + _ico('folder', 14) + ' 数据集<span class="collapsible-caret" aria-hidden="true">⌄</span></summary>';
      html += '<div class="preflight-dataset-grid">';
      html += _pfTag('图片数', ds.image_count || 0);
      html += _pfTag('有效图片', ds.effective_image_count || 0);
      html += _pfTag('标注覆盖', ((ds.caption_coverage || 0) * 100).toFixed(0) + '%');
      if (ds.alpha_capable_image_count > 0) html += _pfTag('含透明通道', ds.alpha_capable_image_count);
      if (ds.broken_image_count > 0) html += _pfTag('损坏图片', ds.broken_image_count, 'err');
      if (ds.images_without_caption_count > 0) html += _pfTag('缺少标注', ds.images_without_caption_count, 'warn');
      html += '</div></details>';
    }

    // 依赖检测
    if (deps) {
      var missing = deps.missing || [];
      var required = deps.required || [];
      if (missing.length > 0 || required.length > 0) {
        html += '<details class="preflight-group collapsible-subgroup" open>';
        html += '<summary class="preflight-group-title">' + _ico('activity', 14) + ' 运行时依赖<span class="collapsible-caret" aria-hidden="true">⌄</span></summary>';
        missing.forEach(function(d) {
          html += '<div class="preflight-item preflight-error">' + escapeHtml(d.display_name) + ' - ' + escapeHtml(d.reason || '缺失') + '</div>';
        });
        required.filter(function(d) { return d.importable; }).forEach(function(d) {
          html += '<div class="preflight-item preflight-ok">' + escapeHtml(d.display_name) + ' ' + escapeHtml(d.version || '') + ' ✓</div>';
        });
        html += '</details>';
      }
    }

    // 提示信息（可折叠）
    if (notes.length > 0) {
      html += '<details class="preflight-group collapsible-subgroup" style="margin-top:8px;">';
      html += '<summary class="preflight-group-title">' + _ico('check-circle', 14) + ' 提示 (' + notes.length + ')<span class="collapsible-caret" aria-hidden="true">⌄</span></summary>';
      notes.forEach(function(n) {
        html += '<div class="preflight-item preflight-note">' + escapeHtml(n) + '</div>';
      });
      html += '</details>';
    }

    html += '</div></details>';
    return html;
  }

  function _pfTag(label, value, type) {
    var color = type === 'err' ? '#ef4444' : (type === 'warn' ? '#f59e0b' : 'var(--text-main)');
    return '<div class="preflight-tag"><span class="preflight-tag-label">' + label + '</span><span class="preflight-tag-value" style="color:' + color + ';">' + value + '</span></div>';
  }

  function dismissPreflightReport() {
    state.preflight = null;
    var el = document.getElementById('preflight-report');
    if (el) el.remove();
  };


  function renderStatusDeck() {
    const runtimeLabel = state.runtimeError
      ? '离线'
      : state.loading.runtime
        ? '检测中...'
      : state.runtime?.cards?.length
        ? `${state.runtime.cards.length} 张显卡`
        : '检测中';

    // === 注意力后端检测 ===
    const xf = state.runtime?.xformers;
    const rt = state.runtime?.runtime;
    const sagePkg = rt?.packages?.sageattention;
    const flashPkg = rt?.packages?.flash_attn;
    const xfInstalled = xf?.installed;
    const xfSupported = xf?.supported;
    const sageInstalled = sagePkg?.importable;
    const flashInstalled = flashPkg?.importable;

    let attnLabel = '检测中';
    let attnDetail = '暂无状态信息';
    if (xf || sagePkg || flashPkg) {
      const parts = [];
      if (xfInstalled) {
        parts.push(`xFormers ${xf.version || ''} ${xfSupported ? '✓' : '(不支持)'}`);
      } else {
        parts.push('xFormers 未安装');
      }
      if (sageInstalled) {
        parts.push(`SageAttention ${sagePkg.version || ''} ✓`);
      } else {
        parts.push('SageAttention 未安装');
      }
      if (flashInstalled) {
        parts.push(`FlashAttention ${flashPkg.version || ''} ✓`);
      } else {
        parts.push('FlashAttention 未安装');
      }
      attnLabel = (xfSupported || sageInstalled || flashInstalled) ? '可用' : '受限';
      attnDetail = parts.join(' · ');
      if (xf?.reason) attnDetail += ` — ${xf.reason}`;
    }

    const preflightLabel = state.preflight
      ? state.preflight.can_start
        ? '可以启动'
        : `${state.preflight.errors.length} 个错误`
      : '未检查';
    const taskCount = state.tasks.filter((task) => task.status === 'RUNNING').length;

    return `
      <div class="status-card">
        <span class="status-label">运行环境</span>
        <strong class="status-value">${escapeHtml(runtimeLabel)}</strong>
        <span class="status-sub">${escapeHtml(renderGpuInfo())}</span>
      </div>
      <div class="status-card">
        <span class="status-label">注意力后端</span>
        <strong class="status-value">${escapeHtml(attnLabel)}</strong>
        <span class="status-sub">${escapeHtml(attnDetail)}</span>
      </div>
      <div class="status-card">
        <span class="status-label">训练预检</span>
        <strong class="status-value">${escapeHtml(preflightLabel)}</strong>
        <span class="status-sub">${escapeHtml(renderPreflightDetail())}</span>
      </div>
      <div class="status-card" id="task-status-card">
        <span class="status-label">任务</span>
        <strong class="status-value">${taskCount}</strong>
        <span class="status-sub">${taskCount > 0 ? `有 ${taskCount} 个任务运行中` : '空闲'}</span>
      </div>
    `;
  }

  function bindGlobals(targetWindow) {
    targetWindow.dismissPreflightReport = dismissPreflightReport;
  }

  return {
    renderConfig,
    renderStatusDeck,
    renderPreflightReport,
    renderField,
    dismissPreflightReport,
    bindGlobals,
  };
}
