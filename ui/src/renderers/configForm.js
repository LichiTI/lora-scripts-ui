// renderers/configForm.js — 配置表单渲染器
// 整合 11 个紧密耦合的函数：renderSection、renderField、renderFieldDescription
// + 5 个 SectionContent 子函数（dataset / caption / network / optimizer / training）
// + 3 个 group 子函数（NetworkOptionGroup / CaptionTagDropoutGroup / RegularizationFieldGroup）
//
// 依赖（通过工厂参数注入）：
//   - state（读 state.config 等）
//   - canUseBuiltinPicker（业务逻辑：判断字段是否能用内置选择器）
//   - isFieldVisible（来自 sdxlSchema.js）
//   - COLLAPSIBLE_FIELD_KEYS（来自 utils/constants.js）
//
// 注：大量内联 onclick="updateConfigValue(...)" / "pickPath(...)" / "openNativePicker(...)"
//     依赖 window.* 全局函数，Stage 5 才转事件委托。

import { escapeHtml } from '../utils/dom.js';

export function createConfigFormRenderer({ state, canUseBuiltinPicker, isFieldVisible, COLLAPSIBLE_FIELD_KEYS }) {
  function renderGhostReplayHelperCard() {
    if (!state.config.lulynx_ghost_replay) {
      return '';
    }
    const recorderState = state.ghostReplayRecorder || {};
    const statusText = recorderState.running
      ? `后台预蒸馏进行中${recorderState.jobProgressText ? ` · ${recorderState.jobProgressText}` : ''}`
      : recorderState.lastOutputPath
        ? `最近输出：${escapeHtml(recorderState.lastOutputPath)}`
        : '生成后的 .lulynx 指纹会自动回填到 Ghost 指纹路径。';
    return `
      <div class="ghost-replay-helper-card">
        <div class="ghost-replay-helper-copy">
          <strong>预蒸馏</strong>
          <span>${escapeHtml(statusText)}</span>
        </div>
        <div class="ghost-replay-helper-actions">
          <button class="btn btn-outline btn-sm" type="button" onclick="openGhostReplayRecorderModal()">
            ${recorderState.running ? '查看进度' : '打开预蒸馏窗口'}
          </button>
        </div>
      </div>
    `;
  }

  function getPreviewGroupsForRender() {
    const raw = state.config.preview_groups;
    let groups = [];
    if (Array.isArray(raw)) {
      groups = raw;
    } else if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        groups = Array.isArray(parsed) ? parsed : [];
      } catch (_e) {
        groups = [];
      }
    }
    if (!groups.length) {
      const prompts = String(state.config.positive_prompts || state.config.sample_prompts || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const negative = String(state.config.negative_prompts || state.config.sample_negative || '');
      groups = (prompts.length ? prompts : ['']).map((prompt, index) => ({
        name: index === 0 ? 'LoRA 对照' : `测试组 ${index + 1}`,
        mode: 'lora',
        prompt,
        negative_prompt: negative,
        seed: state.config.sample_seed || '',
        lora_weight: 1,
        start_epoch: '',
        start_after_epochs: '',
      }));
    }
    return groups.map((group, index) => ({
      name: group && group.name != null ? String(group.name) : `测试组 ${index + 1}`,
      mode: group && group.mode != null ? String(group.mode) : 'lora',
      prompt: group && group.prompt != null ? String(group.prompt) : '',
      negative_prompt: group && group.negative_prompt != null ? String(group.negative_prompt) : '',
      seed: group && group.seed != null ? String(group.seed) : '',
      lora_weight: group && group.lora_weight != null ? String(group.lora_weight) : '1',
      start_epoch: group && group.start_epoch != null ? String(group.start_epoch) : '',
      start_after_epochs: group && group.start_after_epochs != null ? String(group.start_after_epochs) : '',
    }));
  }

  function renderPreviewGroupsField(field, disabledAttr, disabledCls, modCls, conflictWith, renderHeader) {
    const groups = getPreviewGroupsForRender();
    const modeOptions = [
      ['lora', 'LoRA 对照'],
      ['base', '底模对照'],
      ['fit', '拟合测试'],
      ['overfit', '过拟合测试'],
    ];
    const cards = groups.map((group, index) => `
      <div class="preview-test-card" style="border:1px solid var(--line, rgba(148,163,184,.35)); border-radius:14px; padding:12px; margin:10px 0; background:rgba(15,23,42,.03);">
        <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:10px;">
          <strong>测试组 ${index + 1}</strong>
          <button class="btn btn-outline btn-sm" type="button"${disabledAttr} onclick="removePreviewGroup(${index})">删除</button>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; align-items:end;">
          <label class="mini-field"><span>名称</span><input class="text-input" type="text" value="${escapeHtml(group.name)}"${disabledAttr} oninput="updatePreviewGroup(${index}, 'name', this.value)"></label>
          <label class="mini-field"><span>模式</span><select${disabledAttr} onchange="updatePreviewGroup(${index}, 'mode', this.value)">${modeOptions.map(([value, label]) => `<option value="${value}" ${group.mode === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
          <label class="mini-field"><span>Seed</span><input class="text-input" type="number" value="${escapeHtml(group.seed)}"${disabledAttr} oninput="updatePreviewGroup(${index}, 'seed', this.value)"></label>
          <label class="mini-field"><span>LoRA 权重</span><input class="text-input" type="number" step="0.1" value="${escapeHtml(group.lora_weight)}"${disabledAttr} oninput="updatePreviewGroup(${index}, 'lora_weight', this.value)"></label>
          <label class="mini-field"><span>从第 N 轮开始</span><input class="text-input" type="number" min="0" step="1" value="${escapeHtml(group.start_epoch)}"${disabledAttr} oninput="updatePreviewGroup(${index}, 'start_epoch', this.value)"></label>
          <label class="mini-field"><span>N 轮后开始</span><input class="text-input" type="number" min="0" step="1" value="${escapeHtml(group.start_after_epochs)}"${disabledAttr} oninput="updatePreviewGroup(${index}, 'start_after_epochs', this.value)"></label>
        </div>
        <label class="mini-field" style="display:block; margin-top:10px;"><span>正向提示词</span><textarea class="text-area" rows="3"${disabledAttr} oninput="updatePreviewGroup(${index}, 'prompt', this.value)">${escapeHtml(group.prompt)}</textarea></label>
        <label class="mini-field" style="display:block; margin-top:10px;"><span>反向提示词</span><textarea class="text-area" rows="2"${disabledAttr} oninput="updatePreviewGroup(${index}, 'negative_prompt', this.value)">${escapeHtml(group.negative_prompt)}</textarea></label>
      </div>
    `).join('');
    return `
      <div class="config-group${modCls}${disabledCls}" data-field-key="${field.key}">
        ${renderHeader()}
        ${renderFieldDescription(field)}
        ${renderConflictHint(conflictWith)}
        <div class="preview-test-groups">
          ${cards}
          <button class="btn btn-outline" type="button"${disabledAttr} onclick="addPreviewGroup()">+ 添加测试组</button>
        </div>
      </div>
    `;
  }

  function renderFieldDescription(field) {
    const normal = field.desc ? `<p class="field-desc">${escapeHtml(field.desc || '')}</p>` : '';
    const important = field.importantDesc ? `<p class="field-desc field-desc-strong">${escapeHtml(field.importantDesc || '')}</p>` : '';
    return normal + important;
  }

  function toBool(value) {
    if (value === true || value === 1) return true;
    return String(value ?? '').trim().toLowerCase() === 'true';
  }

  function toNum(value) {
    const n = Number(value);
    return Number.isNaN(n) ? 0 : n;
  }

  function getFieldConflict(field) {
    const config = state.config || {};
    const key = field.key;
    const value = config[key];
    const isActive = field.type === 'boolean'
      ? toBool(value)
      : key === 'swap_granularity'
        ? Boolean(String(value ?? 'off').trim()) && String(value ?? 'off').trim() !== 'off'
        : (field.type === 'number' || field.type === 'slider')
          ? toNum(value) > 0
          : Boolean(String(value ?? '').trim());
    if (isActive) return '';

    const cacheText = toBool(config.cache_text_encoder_outputs);
    const cacheLatents = toBool(config.cache_latents);
    const shuffleCaption = toBool(config.shuffle_caption);
    const shuffleCaptionTagsOnly = toBool(config.shuffle_caption_tags_only);
    const captionDropout = toNum(config.caption_dropout_rate) > 0;
    const captionTagDropout = toNum(config.caption_tag_dropout_rate) > 0;
    const captionDropoutEvery = toNum(config.caption_dropout_every_n_epochs) > 0;
    const structuredCaptionMix = toBool(config.caption_source_mix_enabled);
    const tokenWarmup = toNum(config.token_warmup_step) > 0;
    const trainsTextEncoder = !toBool(config.network_train_unet_only);
    const unetOnly = toBool(config.network_train_unet_only);
    const textEncoderOnly = toBool(config.network_train_text_encoder_only);
    const flowEnabled = toBool(config.flow_model) || String(config.flow_model || '').trim() === 'rectified_flow' || String(config.flow_model || '').trim() === 'cfm';
    const vParameterization = toBool(config.v_parameterization);
    const swapMode = String(config.swap_granularity || 'off').trim().toLowerCase().replace('-', '_');
    const swapActive = swapMode !== '' && swapMode !== 'off';
    const moduleOffload = toBool(config.module_offload_enabled);
    const vramSwapToRam = toBool(config.vram_swap_to_ram);
    const torchCompile = toBool(config.torch_compile);
    const distributed = toBool(config.enable_distributed_training) || toBool(config.enable_distributed) || toNum(config.num_processes) > 1 || toNum(config.num_machines) > 1;
    const deepspeed = toBool(config.deepspeed);
    const safeFallback = toBool(config.safe_fallback) || toBool(config.newbie_safe_fallback);

    if (key === 'shuffle_caption' && cacheText) return '缓存文本编码器输出';
    if (key === 'shuffle_caption_tags_only' && cacheText) return '缓存文本编码器输出';
    if (key === 'caption_dropout_rate' && cacheText) return '缓存文本编码器输出';
    if (key === 'caption_tag_dropout_rate' && cacheText) return '缓存文本编码器输出';
    if (key === 'caption_dropout_every_n_epochs' && cacheText) return '缓存文本编码器输出';
    if (key === 'token_warmup_step' && cacheText) return '缓存文本编码器输出';

    if (key === 'cache_text_encoder_outputs') {
      const blockers = [];
      if (shuffleCaption) blockers.push('随机打乱标签');
      if (shuffleCaptionTagsOnly) blockers.push('仅打乱 Tag 部分');
      if (captionDropout) blockers.push('全部标签丢弃概率');
      if (captionTagDropout) blockers.push('按标签丢弃概率');
      if (captionDropoutEvery) blockers.push('每 N 轮丢弃标签');
      if (tokenWarmup) blockers.push('Token 预热步数');
      if (trainsTextEncoder) blockers.push('训练文本编码器');
      if (blockers.length) return blockers.join(' / ');
    }

    if (key === 'cache_text_encoder_outputs_to_disk' && !cacheText) return '缓存文本编码器输出';
    if (key === 'cache_latents_to_disk' && !cacheLatents) return '缓存 Latent';
    if (key === 'cache_latents' && toBool(config.cache_latents_to_disk)) return '缓存 Latent 到磁盘';
    if (key === 'network_train_unet_only' && textEncoderOnly) return '仅训练文本编码器';
    if (key === 'network_train_text_encoder_only' && unetOnly) return '仅训练 U-Net / DiT';
    if (key === 'full_fp16' && toBool(config.full_bf16)) return '完全 BF16';
    if (key === 'full_fp16' && vramSwapToRam) return 'VRAM Swap to RAM';
    if (key === 'full_bf16' && toBool(config.full_fp16)) return '完全 FP16';
    if (key === 'full_bf16' && vramSwapToRam) return 'VRAM Swap to RAM';
    if (key === 'noise_offset' && toNum(config.multires_noise_iterations) > 0) return '多分辨率噪声迭代';
    if (key === 'multires_noise_iterations' && toNum(config.noise_offset) > 0) return '噪声偏移';
    if (key === 'flow_model' && vParameterization) return 'V 参数化';
    if (key === 'v_parameterization' && flowEnabled) return 'Rectified Flow';
    if (key === 'vram_swap_to_ram') {
      const blockers = [];
      if (swapActive) blockers.push('显存交换模式');
      if (moduleOffload) blockers.push('模块级 Offload');
      if (toBool(config.full_fp16)) blockers.push('完全 FP16');
      if (toBool(config.full_bf16)) blockers.push('完全 BF16');
      if (distributed) blockers.push('分布式训练');
      if (deepspeed) blockers.push('DeepSpeed');
      if (blockers.length) return blockers.join(' / ');
    }
    if (key === 'swap_granularity') {
      const blockers = [];
      if (moduleOffload) blockers.push('模块级 Offload');
      if (vramSwapToRam) blockers.push('VRAM Swap to RAM');
      if (torchCompile) blockers.push('torch.compile');
      if (safeFallback) blockers.push('OOM 安全回退');
      if (blockers.length) return blockers.join(' / ');
    }
    if (key === 'module_offload_enabled') {
      const blockers = [];
      if (swapActive) blockers.push('显存交换模式');
      if (vramSwapToRam) blockers.push('VRAM Swap to RAM');
      if (torchCompile) blockers.push('torch.compile');
      if (distributed) blockers.push('分布式训练');
      if (deepspeed) blockers.push('DeepSpeed');
      if (toBool(config.gradient_checkpointing)) blockers.push('梯度检查点');
      if (toBool(config.cpu_offload_checkpointing)) blockers.push('CPU 卸载检查点');
      if (safeFallback) blockers.push('OOM 安全回退');
      if (blockers.length) return blockers.join(' / ');
    }
    if (key === 'torch_compile' && (swapActive || moduleOffload)) {
      return [swapActive ? '显存交换模式' : '', moduleOffload ? '模块级 Offload' : ''].filter(Boolean).join(' / ');
    }
    if (key === 'gradient_checkpointing') {
      if (moduleOffload) return '模块级 Offload';
      if (swapMode === 'layer') return 'Layer Swap';
    }
    if (key === 'cpu_offload_checkpointing' && moduleOffload) return '模块级 Offload';
    if (key === 'enable_distributed_training' && (moduleOffload || vramSwapToRam)) {
      return [moduleOffload ? '模块级 Offload' : '', vramSwapToRam ? 'VRAM Swap to RAM' : ''].filter(Boolean).join(' / ');
    }
    if ((key === 'safe_fallback' || key === 'newbie_safe_fallback') && (swapActive || moduleOffload)) {
      return [swapActive ? '显存交换模式' : '', moduleOffload ? '模块级 Offload' : ''].filter(Boolean).join(' / ');
    }
    return '';
  }

  function renderConflictHint(conflictWith) {
    if (!conflictWith) return '';
    return `<p class="field-desc field-conflict-hint">与「${escapeHtml(conflictWith)}」互斥，请关闭后开启本选项。</p>`;
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
    const conflictWith = getFieldConflict(field);
    const disabledAttr = conflictWith ? ' disabled' : '';
    const renderHeader = () => `
      <div class="field-header-row">
        <label>${escapeHtml(label)}</label>
        <div class="field-inline-actions" data-field-key="${field.key}">
          <button class="field-menu-toggle" type="button" title="参数更多操作" data-field-menu-key="${field.key}">···</button>
          ${showBuiltinPicker ? `<button class="picker-mode-icon-btn" type="button" title="内置文件选择器（项目目录浏览器）" onclick="openNativePicker('${field.key}', '${pickerMode}')"><svg class="icon"><use href="${builtinPickerIcon}"></use></svg></button>` : ''}
        </div>
      </div>
    `;

    const modCls = isModified ? ' field-modified' : '';
    const disabledCls = conflictWith ? ' field-disabled' : '';
    const renderCollapsibleField = (bodyHtml) => {
      const rawSummaryValue = value === undefined || value === null || value === '' ? '' : String(value);
      const summaryValue = rawSummaryValue || '未设置';
      const summaryClass = rawSummaryValue ? '' : ' is-empty';
      return `
        <details class="config-group collapsible-field${modCls}${disabledCls}" data-field-key="${field.key}">
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
        <div class="config-group row boolean-card${modCls}${disabledCls}" data-field-key="${field.key}">
          <div class="label-col">
            ${renderHeader()}
            ${renderFieldDescription(field)}
            ${renderConflictHint(conflictWith)}
          </div>
          <label class="switch switch-compact">
            <input type="checkbox" ${value ? 'checked' : ''}${disabledAttr} onchange="updateConfigValue('${field.key}', this.checked)">
            <span class="slider round"></span>
          </label>
        </div>
      `;
    }

    if (field.type === 'select') {
      const optionValue = (option) => (option && typeof option === 'object') ? option.value : option;
      const optionLabel = (option) => {
        if (option && typeof option === 'object') return option.label ?? option.value ?? '默认';
        return option || '默认';
      };
      const ensureCurrentOption = (options) => {
        const current = value === undefined || value === null ? '' : String(value);
        if (!current || options.some((option) => String(optionValue(option)) === current)) {
          return options;
        }
        return [current, ...options];
      };
      let filteredOptions = ensureCurrentOption(field.options || []);
      if (COLLAPSIBLE_FIELD_KEYS.has(field.key)) {
        return renderCollapsibleField(`
          ${renderHeader()}
          ${renderFieldDescription(field)}
          ${renderConflictHint(conflictWith)}
          <select${disabledAttr} onchange="updateConfigValue('${field.key}', this.value)">
            ${filteredOptions.map((option) => `<option value="${escapeHtml(optionValue(option))}" ${String(value) === String(optionValue(option)) ? 'selected' : ''}>${escapeHtml(optionLabel(option))}</option>`).join('')}
          </select>
        `);
      }
      return `
        <div class="config-group${modCls}${disabledCls}" data-field-key="${field.key}">
          ${renderHeader()}
          ${renderFieldDescription(field)}
          ${renderConflictHint(conflictWith)}
          <select${disabledAttr} onchange="updateConfigValue('${field.key}', this.value)">
            ${filteredOptions.map((option) => `<option value="${escapeHtml(optionValue(option))}" ${String(value) === String(optionValue(option)) ? 'selected' : ''}>${escapeHtml(optionLabel(option))}</option>`).join('')}
          </select>
        </div>
      `;
    }

    if (field.type === 'preview_groups') {
      return renderPreviewGroupsField(field, disabledAttr, disabledCls, modCls, conflictWith, renderHeader);
    }

    if (field.type === 'textarea') {
      if (COLLAPSIBLE_FIELD_KEYS.has(field.key)) {
        return renderCollapsibleField(`
          ${renderHeader()}
          ${renderFieldDescription(field)}
          ${renderConflictHint(conflictWith)}
          <textarea class="text-area"${disabledAttr} oninput="updateConfigValue('${field.key}', this.value)">${escapeHtml(value || '')}</textarea>
        `);
      }
      return `
        <div class="config-group${modCls}${disabledCls}" data-field-key="${field.key}">
          ${renderHeader()}
          ${renderFieldDescription(field)}
          ${renderConflictHint(conflictWith)}
          <textarea class="text-area"${disabledAttr} oninput="updateConfigValue('${field.key}', this.value)">${escapeHtml(value || '')}</textarea>
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
          ${renderConflictHint(conflictWith)}
          <div class="input-picker">
            <button class="picker-icon" type="button" title="系统文件选择器（Windows 资源管理器风格）"${disabledAttr} onclick="pickPath('${field.key}', '${field.pickerType || 'folder'}')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <input type="text" value="${escapeHtml(inputValue)}"${disabledAttr} oninput="updateConfigValue('${field.key}', this.value)">
          </div>
        `);
      }
      return `
        <div class="config-group${modCls}${disabledCls}" data-field-key="${field.key}">
          ${renderHeader()}
          ${renderFieldDescription(field)}
          ${renderConflictHint(conflictWith)}
          <div class="input-picker">
            <button class="picker-icon" type="button" title="系统文件选择器（Windows 资源管理器风格）"${disabledAttr} onclick="pickPath('${field.key}', '${field.pickerType || 'folder'}')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <input type="text" value="${escapeHtml(inputValue)}"${disabledAttr} oninput="updateConfigValue('${field.key}', this.value)">
          </div>
        </div>
      `;
    }



    if (COLLAPSIBLE_FIELD_KEYS.has(field.key)) {
      return renderCollapsibleField(`
        ${renderHeader()}
        ${renderFieldDescription(field)}
        ${renderConflictHint(conflictWith)}
        <input class="text-input" type="${inputType}" value="${escapeHtml(inputValue)}"${disabledAttr} ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''} ${field.step !== undefined ? `step="${field.step}"` : ''} oninput="updateConfigValue('${field.key}', this.value)">
      `);
    }

    return `
      <div class="config-group${modCls}${disabledCls}" data-field-key="${field.key}">
        ${renderHeader()}
        ${renderFieldDescription(field)}
        ${renderConflictHint(conflictWith)}
        <input class="text-input" type="${inputType}" value="${escapeHtml(inputValue)}"${disabledAttr} ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''} ${field.step !== undefined ? `step="${field.step}"` : ''} oninput="updateConfigValue('${field.key}', this.value)">
      </div>
    `;
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
            <button class="picker-icon" type="button" title="系统文件选择器（Windows 资源管理器风格）" onclick="pickPath('${regField.key}', '${regField.pickerType || 'folder'}')">
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
    const showGhostReplayHelper = !!(
      state.config.lulynx_ghost_replay
      && fields.some((field) => String(field.key || '').startsWith('lulynx_ghost_'))
    );
    const contentWithHelpers = content + (showGhostReplayHelper ? renderGhostReplayHelperCard() : '');
    const longSectionIds = new Set(['network-settings', 'optimizer-settings', 'training-settings', 'dataset-settings', 'caption-settings']);
    const waterfallWideClass = (state.configWaterfall && state.configWaterfallTwoColumn && (longSectionIds.has(section.id) || realFieldCount >= 8))
      ? ' waterfall-wide-section'
      : '';

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
        <details class="form-section collapsible-panel ${panelClass}${waterfallWideClass}" id="${escapeHtml(section.id)}">
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
          <div class="section-content">${contentWithHelpers}</div>
        </details>
      `;
    }

    return `
      <section class="form-section${waterfallWideClass}" id="${escapeHtml(section.id)}">
        <header class="section-header">
          <h3>${escapeHtml(section.title)}</h3>
          <span class="section-meta">${realFieldCount} 项参数</span>
        </header>
        <div class="section-summary">${escapeHtml(sectionDescription)}</div>
        <div class="section-content">${contentWithHelpers}</div>
      </section>
    `;
  }

  return {
    renderField,
    renderFieldDescription,
    renderSection,
    renderDatasetSettingsContent,
    renderCaptionSettingsContent,
    renderNetworkSettingsContent,
    renderOptimizerSettingsContent,
    renderTrainingSettingsContent,
    renderNetworkOptionGroup,
    renderCaptionTagDropoutGroup,
    renderRegularizationFieldGroup,
  };
}

