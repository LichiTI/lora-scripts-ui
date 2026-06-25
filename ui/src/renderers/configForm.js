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
import { isAttentionBackendAvailable, makeAttentionOptions } from '../features/attentionCapabilities.js';
import {
  renderCaptionSettingsContentLayout,
  renderDatasetSettingsContentLayout,
  renderNetworkSettingsContentLayout,
  renderOptimizerSettingsContentLayout,
  renderTrainingSettingsContentLayout,
} from './configSectionLayouts.js';
import {
  getFieldConflict as getTemplateFieldConflict,
  getPreviewGroupsForRender as getTemplatePreviewGroupsForRender,
  renderCaptionTagDropoutGroup as renderCaptionTagDropoutGroupTemplate,
  renderConflictHint,
  renderFieldDescription,
  renderGhostReplayHelperCard as renderGhostReplayHelperCardTemplate,
  renderNetworkOptionGroup as renderNetworkOptionGroupTemplate,
  renderPreviewGroupsField as renderPreviewGroupsFieldTemplate,
  renderRegularizationFieldGroup as renderRegularizationFieldGroupTemplate,
  toBool,
} from './configFormTemplates.js';

export function createConfigFormRenderer({ state, canUseBuiltinPicker, isFieldVisible, COLLAPSIBLE_FIELD_KEYS }) {
  function renderGhostReplayHelperCard() {
    if (!state.config.lulynx_ghost_replay) {
      return '';
    }
    return renderGhostReplayHelperCardTemplate(state.ghostReplayRecorder || {});
  }

  function getPreviewGroupsForRender() {
    return getTemplatePreviewGroupsForRender(state.config || {});
  }

  function renderPreviewGroupsField(field, disabledAttr, disabledCls, modCls, conflictWith, renderHeader) {
    return renderPreviewGroupsFieldTemplate({
      field,
      groups: getPreviewGroupsForRender(),
      disabledAttr,
      disabledCls,
      modCls,
      conflictWith,
      renderHeader,
      renderFieldDescription,
      renderConflictHint,
    });
  }

  function resolveFieldOptions(field) {
    const options = field.options || [];
    if (field.attentionBackendOptions) {
      return makeAttentionOptions(options, state.executionProfiles || [], { ...(state.config || {}), runtime: state.runtime });
    }
    return options;
  }

  function getAttentionBackendBlocker(field) {
    if (!field.requiresAttentionBackend) return '';
    const context = { ...(state.config || {}), runtime: state.runtime };
    if (isAttentionBackendAvailable(field.requiresAttentionBackend, state.executionProfiles || [], context)) {
      return '';
    }
    const runtimeInfo = state.runtime?.runtime || {};
    const profile = String(
      state.config.execution_profile_id
      || state.config.runtime_id
      || runtimeInfo.runtime_id
      || runtimeInfo.environment
      || 'standard'
    );
    return `当前 ${profile || 'standard'} 运行时不可用`;
  }

  function getFieldConflict(field) {
    return getTemplateFieldConflict(field, state.config || {});
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
    if (field.type === 'action') {
      const summaryRaw = state.config[field.summaryKey] || '';
      const summary = summaryRaw ? String(summaryRaw) : '';
      const handler = String(field.handler || '').replace(/'/g, "\\'");
      return `
        <div class="config-group config-action-field" data-field-key="${field.key}">
          <div class="field-header-row">
            <label><span>${escapeHtml(label || '')}</span></label>
          </div>
          ${field.desc ? `<p class="field-desc">${escapeHtml(field.desc)}</p>` : ''}
          <button class="btn btn-outline config-action-btn" type="button" onclick="${handler ? `window['${handler}'] && window['${handler}']()` : ''}">
            ${escapeHtml(field.buttonLabel || '打开')}
          </button>
          ${summary ? `<p class="field-desc config-action-summary">${escapeHtml(summary)}</p>` : ''}
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
    const attentionBackendBlocker = getAttentionBackendBlocker(field);
    const conflictWith = getFieldConflict(field) || attentionBackendBlocker;
    const keepActiveAttentionToggleEditable = field.type === 'boolean' && attentionBackendBlocker && toBool(value);
    const disabledAttr = conflictWith && !keepActiveAttentionToggleEditable ? ' disabled' : '';
    const fieldKeyArg = escapeHtml(JSON.stringify(String(field.key || '')));
    const renderHeader = () => `
      <div class="field-header-row">
        <label>
          <span>${escapeHtml(label)}</span>
          <button class="field-help-btn" type="button" title="查看参数说明" aria-label="查看参数说明" onclick="event.preventDefault(); event.stopPropagation(); openTrainingOptionHelp(${fieldKeyArg})">?</button>
        </label>
        <div class="field-inline-actions" data-field-key="${field.key}">
          <button class="field-menu-toggle" type="button" title="参数更多操作" data-field-menu-key="${field.key}">···</button>
          ${showBuiltinPicker ? `<button class="picker-mode-icon-btn" type="button" title="内置文件选择器" onclick="openNativePicker('${field.key}', '${pickerMode}')"><svg class="icon"><use href="${builtinPickerIcon}"></use></svg></button>` : ''}
        </div>
      </div>
    `;

    const modCls = isModified ? ' field-modified' : '';
    const disabledCls = disabledAttr ? ' field-disabled' : '';
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
      const optionDisabled = (option) => Boolean(option && typeof option === 'object' && option.disabled);
      const optionTitle = (option) => option && typeof option === 'object' ? (option.disabledReason || option.title || '') : '';
      const renderOption = (option) => {
        const optionVal = optionValue(option);
        const title = optionTitle(option);
        return `<option value="${escapeHtml(optionVal)}" ${String(value) === String(optionVal) ? 'selected' : ''}${optionDisabled(option) ? ' disabled' : ''}${title ? ` title="${escapeHtml(title)}"` : ''}>${escapeHtml(optionLabel(option))}</option>`;
      };
      const ensureCurrentOption = (options) => {
        const current = value === undefined || value === null ? '' : String(value);
        if (!current || options.some((option) => String(optionValue(option)) === current)) {
          return options;
        }
        return [current, ...options];
      };
      let filteredOptions = ensureCurrentOption(resolveFieldOptions(field));
      if (COLLAPSIBLE_FIELD_KEYS.has(field.key)) {
        return renderCollapsibleField(`
          ${renderHeader()}
          ${renderFieldDescription(field)}
          ${renderConflictHint(conflictWith)}
          <select${disabledAttr} onchange="updateConfigValue('${field.key}', this.value)">
            ${filteredOptions.map(renderOption).join('')}
          </select>
        `);
      }
      return `
        <div class="config-group${modCls}${disabledCls}" data-field-key="${field.key}">
          ${renderHeader()}
          ${renderFieldDescription(field)}
          ${renderConflictHint(conflictWith)}
          <select${disabledAttr} onchange="updateConfigValue('${field.key}', this.value)">
            ${filteredOptions.map(renderOption).join('')}
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
            <button class="picker-icon" type="button"${disabledAttr} onclick="pickPath('${field.key}', '${field.pickerType || 'folder'}')">
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
            <button class="picker-icon" type="button"${disabledAttr} onclick="pickPath('${field.key}', '${field.pickerType || 'folder'}')">
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
    return renderNetworkOptionGroupTemplate({ title, note, fields, dataFieldKey, config: state.config || {}, renderField });
  }

  function renderCaptionTagDropoutGroup(fields) {
    return renderCaptionTagDropoutGroupTemplate({ fields, config: state.config || {}, renderField });
  }

  function renderRegularizationFieldGroup(regField, priorField) {
    return renderRegularizationFieldGroupTemplate({ regField, priorField, config: state.config || {} });
  }

  function renderDatasetSettingsContent(fields) {
    return renderDatasetSettingsContentLayout({ fields, renderField, renderRegularizationFieldGroup });
  }

  function renderCaptionSettingsContent(fields) {
    return renderCaptionSettingsContentLayout({ fields, renderField, renderCaptionTagDropoutGroup });
  }

  function renderNetworkSettingsContent(fields) {
    return renderNetworkSettingsContentLayout({ fields, config: state.config || {}, renderField, renderNetworkOptionGroup });
  }

  function renderOptimizerSettingsContent(fields) {
    return renderOptimizerSettingsContentLayout({ fields, renderField });
  }

  function renderTrainingSettingsContent(fields) {
    return renderTrainingSettingsContentLayout({ fields, config: state.config || {}, renderField });
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
          <div class="section-content">${contentWithHelpers}</div>
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

