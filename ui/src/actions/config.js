// actions/config.js — 配置读写 actions
//   isTruthyConfigFlag / enforceLycorisDoraSafety / mergeConfigPatch /
//   syncConfigState / refreshFieldHighlights / getPresetLabel /
//   updateConfigValue / resetFieldValue / undoFieldValue /
//   resetAllParams / applyPreset
//
// 依赖（工厂注入）：state, getFieldDefinition, normalizeDraftValue,
//   createDefaultConfig, CONDITIONAL_KEYS,DRAFT_STORAGE_KEY,
//   saveDraft, updateJSONPreview, renderView, resetTransientState

export function createConfigActions({
  state,
  getFieldDefinition,
  normalizeDraftValue,
  createDefaultConfig,
CONDITIONAL_KEYS,
  DRAFT_STORAGE_KEY,
  saveDraft,
updateJSONPreview,
  renderView,
  resetTransientState,
}) {
  function isTruthyConfigFlag(value) {
  if (value === true || value === 1) {
      return true;
   }
    return String(value ?? '').trim().toLowerCase() === 'true';
  }

  function enforceLycorisDoraSafety(target = state.config) {
    if (!target || typeof target !== 'object') {
      return false;
    }
    const networkModule = String(target.network_module|| '').trim().toLowerCase();
    if (networkModule !== 'lycoris.kohya' || !isTruthyConfigFlag(target.dora_wd)) {
      return false;
    }
    if (target.bypass_mode !== false) {
      target.bypass_mode = false;
      return true;
    }
    return false;
  }

  function mergeConfigPatch(patch) {
    if (!patch || typeof patch !== 'object') {
      return;
    }

    const incomingType = patch.__training_type__ || patch.model_train_type || state.activeTrainingType || '';
    if (incomingType.startsWith('sdxl-') && patch.resolution === '512,512') {
      patch = { ...patch, resolution: '1024,1024' };
    }

    for (const [key, value] of Object.entries(patch)) {
      const field = getFieldDefinition(key);
      if (!field) {
        continue;
      }
      state.config[key] = normalizeDraftValue(field, value);
    }
    enforceLycorisDoraSafety();
  }

  function refreshFieldHighlights() {
    document.querySelectorAll('.config-group[data-field-key]').forEach((el) => {
      const key = el.dataset.fieldKey;
      const field = getFieldDefinition(key);
      if (!field) return;
      const value = state.config[key];
      const defaultValue = field.defaultValue ?? '';
      const isModified = String(value ?? '') !== String(defaultValue);
      el.classList.toggle('field-modified', isModified);
    });
  }

  function syncConfigState() {
    enforceLycorisDoraSafety();
    saveDraft();
    updateJSONPreview();
  refreshFieldHighlights();
  }

  function getPresetLabel(preset, index) {
    if (preset?.name) {
      return preset.name;
    }
    if (preset?.output_name) {
      return preset.output_name;
    }
    return `预设 ${index + 1}`;
  }

  function updateConfigValue(key, rawValue) {
    const field = getFieldDefinition(key);
    const normalizedValue = normalizeDraftValue(field, rawValue);
    const previousValue = state.config[key];
    if (String(previousValue ?? '') !== String(normalizedValue ?? '')) {
      state.fieldUndo[key] = previousValue;
    }
    state.config[key] = normalizedValue;
    enforceLycorisDoraSafety();
    if (CONDITIONAL_KEYS.has(key) && state.activeModule === 'config') {
      saveDraft();
      renderView('config');
      return;
    }
    syncConfigState();
  }

  function resetAllParams() {
    state.config = createDefaultConfig(state.activeTrainingType);
    state.hasLocalDraft = false;
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    resetTransientState();
    if (state.activeModule === 'config') {
      renderView('config');
    } else {
      updateJSONPreview();
    }
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

  function applyPreset(index) {
    const preset = state.presets[index];
    if (!preset) {
      return;
    }
    mergeConfigPatch(preset);
    state.hasLocalDraft = true;
    resetTransientState();
    saveDraft();
    renderView('config');
  }

  return {
    isTruthyConfigFlag,
    enforceLycorisDoraSafety,
    mergeConfigPatch,
    refreshFieldHighlights,
    syncConfigState,
    getPresetLabel,
    updateConfigValue,
    resetAllParams,
    resetFieldValue,
    undoFieldValue,
    applyPreset,
  };
}
