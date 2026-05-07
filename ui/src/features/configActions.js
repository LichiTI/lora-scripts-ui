import { $, $$ } from '../utils/dom.js';
import { configToToml, parseSimpleToml } from '../utils/toml.js';
import { SCHEDULER_TYPE_TO_VALUE } from './settingsOptions.js';

export function createConfigActionsController({
  state,
  api,
  conditionalKeys,
  draftStorageKey,
  buildRunConfig,
  createDefaultConfig,
  getFieldDefinition,
  normalizeDraftValue,
  mergeConfigPatch,
  resetTransientState,
  saveDraft,
  renderView,
  syncConfigState,
  updateJSONPreview,
  applyAndPersistLayout,
  applyLayoutPreferences,
  showToast,
}) {
  function updateConfigValue(key, rawValue) {
    const field = getFieldDefinition(key);
    const normalizedValue = normalizeDraftValue(field, rawValue);
    const previousValue = state.config[key];
    if (String(previousValue ?? '') !== String(normalizedValue ?? '')) {
      state.fieldUndo[key] = previousValue;
    }
    state.config[key] = normalizedValue;
    if (conditionalKeys.has(key) && state.activeModule === 'config') {
      saveDraft();
      renderView('config');
      return;
    }
    syncConfigState();
  }

  function setupImportConfig() {
    if (state.importInputBound) {
      return;
    }
    const input = $('#config-file-input');
    if (!input) {
      return;
    }
    state.importInputBound = true;
    input.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      try {
        const text = await file.text();
        let parsed;
        if (file.name.endsWith('.toml')) {
          parsed = parseSimpleToml(text);
        } else {
          parsed = JSON.parse(text);
        }
        normalizeImportedConfig(parsed);
        const importType = parsed.model_train_type || state.activeTrainingType;
        if (importType && importType !== state.activeTrainingType) {
          switchTrainingType(importType);
        }
        state.config = createDefaultConfig(state.activeTrainingType);
        mergeConfigPatch(parsed);
        state.hasLocalDraft = true;
        saveDraft();
        renderView(state.activeModule);
        showToast('配置文件已导入。');
      } catch (error) {
        showToast(error.message || '导入配置文件失败。');
      } finally {
        input.value = '';
      }
    });
  }

  function setupFieldMenus() {
    function closeAllMenus() {
      document.querySelectorAll('.field-menu-dropdown').forEach((menu) => menu.remove());
      state.activeFieldMenu = null;
    }

    function openMenu(key, anchor) {
      closeAllMenus();
      state.activeFieldMenu = key;
      const field = getFieldDefinition(key);
      if (!field) return;
      const value = state.config[field.key];
      const defaultValue = field.defaultValue ?? '';
      const canUndo = Object.hasOwn(state.fieldUndo, field.key);
      const canReset = String(value ?? '') !== String(defaultValue ?? '');

      const menu = document.createElement('div');
      menu.className = 'field-menu field-menu-dropdown';
      menu.innerHTML = `
        <button class="field-menu-item ${canUndo ? '' : 'disabled'}" type="button" ${canUndo ? '' : 'disabled'}>撤销更改</button>
        <button class="field-menu-item ${canReset ? '' : 'disabled'}" type="button" ${canReset ? '' : 'disabled'}>恢复默认</button>
      `;
      menu.addEventListener('click', (event) => event.stopPropagation());
      const buttons = menu.querySelectorAll('.field-menu-item');
      if (canUndo) buttons[0].addEventListener('click', () => { closeAllMenus(); undoFieldValue(key); });
      if (canReset) buttons[1].addEventListener('click', () => { closeAllMenus(); resetFieldValue(key); });
      anchor.appendChild(menu);
    }

    document.addEventListener('click', (event) => {
      const toggle = event.target?.closest?.('[data-field-menu-key]');
      if (toggle) {
        event.preventDefault();
        event.stopPropagation();
        const key = toggle.dataset.fieldMenuKey;
        if (state.activeFieldMenu === key) {
          closeAllMenus();
        } else {
          const anchor = toggle.closest('.field-inline-actions');
          if (anchor) openMenu(key, anchor);
        }
        return;
      }
      if (event.target?.closest?.('.field-menu-dropdown')) {
        return;
      }
      if (state.activeFieldMenu) {
        closeAllMenus();
      }
    });
    $('#builtin-picker-close')?.addEventListener('click', window.closeBuiltinPicker);
    $('#builtin-picker-cancel')?.addEventListener('click', window.closeBuiltinPicker);
    $('#builtin-picker-modal')?.addEventListener('click', (event) => {
      if (event.target?.id === 'builtin-picker-modal') {
        window.closeBuiltinPicker();
      }
    });
  }

  function switchTrainingType(typeId) {
    if (typeId === state.activeTrainingType) return;
    state.activeTrainingType = typeId;
    localStorage.setItem('sd-rescripts:training-type', typeId);
    const oldConfig = { ...state.config };
    state.config = createDefaultConfig(typeId);
    for (const key of Object.keys(state.config)) {
      if (key === 'model_train_type') continue;
      if (oldConfig[key] !== undefined && oldConfig[key] !== '') {
        state.config[key] = oldConfig[key];
      }
    }
    state.hasLocalDraft = false;
    localStorage.removeItem(draftStorageKey);
    resetTransientState();
    saveDraft();
    if (state.activeModule === 'config') {
      renderView('config');
    } else {
      updateJSONPreview();
    }
  }

  function resetAllParams() {
    state.config = createDefaultConfig(state.activeTrainingType);
    state.hasLocalDraft = false;
    localStorage.removeItem(draftStorageKey);
    resetTransientState();
    if (state.activeModule === 'config') {
      renderView('config');
    } else {
      updateJSONPreview();
    }
  }

  function downloadConfigFile() {
    const config = buildRunConfig(state.config, state.activeTrainingType);
    const tomlStr = configToToml(config);
    const blob = new Blob([tomlStr], { type: 'application/toml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.config.output_name || 'config'}-${timestamp}.toml`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function importConfigFile() {
    $('#config-file-input')?.click();
  }

  function resetFieldValue(key) {
    const field = getFieldDefinition(key);
    if (!field) return;
    state.activeFieldMenu = null;
    updateConfigValue(key, field.defaultValue ?? '');
    if (state.activeModule === 'config') renderView('config');
  }

  function undoFieldValue(key) {
    if (!Object.hasOwn(state.fieldUndo, key)) {
      return;
    }
    const previousValue = state.fieldUndo[key];
    delete state.fieldUndo[key];
    state.activeFieldMenu = null;
    const field = getFieldDefinition(key);
    state.config[key] = normalizeDraftValue(field, previousValue);
    syncConfigState();
    if (state.activeModule === 'config') renderView('config');
  }

  function updateLayoutWidth(target, rawValue, persist = true) {
    const value = Number(rawValue);
    if (Number.isNaN(value)) {
      return;
    }
    if (target === 'navigator') {
      state.navigatorWidth = value;
    } else if (target === 'json') {
      state.jsonPanelWidth = value;
    }
    if (persist) {
      applyAndPersistLayout();
    } else {
      applyLayoutPreferences();
    }
    if (state.activeModule === 'settings') {
      $('#navigator-width-value').textContent = `${state.navigatorWidth}px`;
      $('#json-width-value').textContent = `${state.jsonPanelWidth}px`;
    }
  }

  function bindGlobals(targetWindow) {
    targetWindow.updateConfigValue = updateConfigValue;
    targetWindow.switchTrainingType = switchTrainingType;
    targetWindow.resetAllParams = resetAllParams;
    targetWindow.downloadConfigFile = downloadConfigFile;
    targetWindow.importConfigFile = importConfigFile;
    targetWindow.resetFieldValue = resetFieldValue;
    targetWindow.undoFieldValue = undoFieldValue;
    targetWindow.updateLayoutWidth = updateLayoutWidth;
  }

  return {
    updateConfigValue,
    setupImportConfig,
    setupFieldMenus,
    switchTrainingType,
    resetAllParams,
    downloadConfigFile,
    importConfigFile,
   resetFieldValue,
    undoFieldValue,
    updateLayoutWidth,
    bindGlobals,
  };
}

function normalizeImportedConfig(parsed) {
  if (Array.isArray(parsed.network_args) && !parsed.lycoris_algo) {
    const argMap = {};
    for (const item of parsed.network_args) {
      const eq = String(item).indexOf('=');
      if (eq > 0) argMap[String(item).slice(0, eq).trim()] = String(item).slice(eq + 1).trim();
    }
    if (argMap.algo) {
      parsed.lycoris_algo = argMap.algo;
      if (!parsed.network_module) parsed.network_module = 'lycoris.kohya';
    }
    if (argMap.conv_dim != null) { const n = Number(argMap.conv_dim); parsed.conv_dim = Number.isNaN(n) ? '' : n; }
    if (argMap.conv_alpha != null) { const n = Number(argMap.conv_alpha); parsed.conv_alpha = Number.isNaN(n) ? '' : n; }
    if (argMap.preset != null) parsed.lycoris_preset = argMap.preset;
    if (argMap.dropout != null) { const n = Number(argMap.dropout); parsed.dropout = Number.isNaN(n) ? '' : n; }
    if (argMap.rank_dropout != null) { const n = Number(argMap.rank_dropout); parsed.rank_dropout = Number.isNaN(n) ? '' : n; }
    if (argMap.module_dropout != null) { const n = Number(argMap.module_dropout); parsed.module_dropout = Number.isNaN(n) ? '' : n; }
    if (argMap.train_norm != null) parsed.train_norm = argMap.train_norm === 'True';
    if (argMap.use_tucker != null) parsed.use_tucker = argMap.use_tucker === 'True';
    else if (argMap.use_cp != null) parsed.use_tucker = argMap.use_cp === 'True';
    else if (argMap.use_conv_cp != null) parsed.use_tucker = argMap.use_conv_cp === 'True';
    else if (argMap.disable_conv_cp != null) parsed.use_tucker = argMap.disable_conv_cp !== 'True';
    if (argMap.use_scalar != null) parsed.use_scalar = argMap.use_scalar === 'True';
    if (argMap.block_size != null) { const n = Number(argMap.block_size); parsed.block_size = Number.isNaN(n) ? '' : n; }
    if (argMap.rescaled != null) parsed.rescaled = argMap.rescaled === 'True';
    if (argMap.constraint != null) { const n = Number(argMap.constraint); parsed.constraint = Number.isNaN(n) ? '' : n; }
    else if (argMap.constrain != null) { const n = Number(argMap.constrain); parsed.constraint = Number.isNaN(n) ? '' : n; }
    if (argMap.rs_lora != null) parsed.rs_lora = argMap.rs_lora === 'True';
    if (argMap.factor != null) { const n = Number(argMap.factor); parsed.lokr_factor = Number.isNaN(n) ? '' : n; }
    if (argMap.dora_wd != null) parsed.dora_wd = argMap.dora_wd === 'True';
    if (argMap.wd_on_output != null) parsed.wd_on_output = argMap.wd_on_output === 'True';
    if (argMap.bypass_mode != null) parsed.bypass_mode = argMap.bypass_mode === 'True';
    if (argMap.decompose_both != null) parsed.decompose_both = argMap.decompose_both === 'True';
    if (argMap.full_matrix != null) parsed.full_matrix = argMap.full_matrix === 'True';
    if (argMap.unbalanced_factorization != null) parsed.unbalanced_factorization = argMap.unbalanced_factorization === 'True';
    if (argMap.scale_weight_norms != null) { const n = Number(argMap.scale_weight_norms); parsed.scale_weight_norms = Number.isNaN(n) ? '' : n; }
    const structured = new Set(['algo', 'conv_dim', 'conv_alpha', 'preset', 'dropout', 'rank_dropout', 'module_dropout', 'train_norm', 'use_tucker', 'use_scalar', 'block_size', 'rescaled', 'constraint', 'constrain', 'rs_lora', 'factor', 'dora_wd', 'wd_on_output', 'bypass_mode', 'decompose_both', 'full_matrix', 'unbalanced_factorization', 'scale_weight_norms', 'disable_conv_cp', 'use_cp', 'use_conv_cp']);
    const remaining = parsed.network_args.filter((arg) => {
      const key = String(arg).split('=')[0].trim();
      return !structured.has(key);
    });
    if (remaining.length > 0) parsed.network_args_custom = remaining.join('\n');
    delete parsed.network_args;
  }

  if (Array.isArray(parsed.optimizer_args) && !parsed.optimizer_args_custom) {
    const remainingArgs = [];
    for (const arg of parsed.optimizer_args) {
      const eqIdx = String(arg).indexOf('=');
      const key = eqIdx > 0 ? String(arg).slice(0, eqIdx).trim() : '';
      const value = eqIdx > 0 ? String(arg).slice(eqIdx + 1).trim() : '';
      if (key === 'd_coef') { parsed.prodigy_d_coef = value; }
      else if (key === 'd0') { parsed.prodigy_d0 = value; }
      else { remainingArgs.push(String(arg)); }
    }
    if (remainingArgs.length > 0) parsed.optimizer_args_custom = remainingArgs.join('\n');
    delete parsed.optimizer_args;
  }

  if (Array.isArray(parsed.lr_scheduler_args)) {
    parsed.lr_scheduler_args = parsed.lr_scheduler_args.join('\n');
  }

  if (typeof parsed.lr_scheduler_type === 'string') {
    const schedulerType = parsed.lr_scheduler_type.trim();
    const bridgedScheduler = SCHEDULER_TYPE_TO_VALUE[schedulerType];
    if (bridgedScheduler) {
      parsed.lr_scheduler = bridgedScheduler;
      delete parsed.lr_scheduler_type;
    }
  }
}
