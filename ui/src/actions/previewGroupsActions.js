export function createPreviewGroupsActions({
  state,
  syncConfigState,
  saveDraft,
  updateJSONPreview,
  renderView,
}) {
  function previewGroupsForEdit() {
    const raw = state.config.preview_groups;
    if (Array.isArray(raw)) return raw.map((group) => ({ ...(group || {}) }));
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map((group) => ({ ...(group || {}) }));
      } catch (_e) {
        // Ignore invalid legacy string values and fall back to prompt-derived groups.
      }
    }
    const prompts = String(state.config.positive_prompts || state.config.sample_prompts || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const negative = String(state.config.negative_prompts || state.config.sample_negative || '');
    return (prompts.length ? prompts : ['']).map((prompt, index) => ({
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

  function commitPreviewGroups(groups) {
    state.config.preview_groups = groups;
    syncConfigState();
    saveDraft();
    updateJSONPreview();
    renderView('config');
  }

  function addPreviewGroup() {
    const groups = previewGroupsForEdit();
    groups.push({
      name: `测试组 ${groups.length + 1}`,
      mode: groups.length === 0 ? 'lora' : 'base',
      prompt: String(state.config.positive_prompts || state.config.sample_prompts || ''),
      negative_prompt: String(state.config.negative_prompts || state.config.sample_negative || ''),
      seed: state.config.sample_seed || '',
      lora_weight: 1,
      start_epoch: '',
      start_after_epochs: '',
    });
    commitPreviewGroups(groups);
  }

  function removePreviewGroup(index) {
    const groups = previewGroupsForEdit();
    groups.splice(Number(index), 1);
    commitPreviewGroups(groups);
  }

  function updatePreviewGroup(index, key, value) {
    const groups = previewGroupsForEdit();
    const groupIndex = Number(index);
    if (!Number.isInteger(groupIndex) || groupIndex < 0 || groupIndex >= groups.length) return;
    groups[groupIndex] = { ...(groups[groupIndex] || {}), [key]: value };
    state.config.preview_groups = groups;
    syncConfigState();
    saveDraft();
    updateJSONPreview();
  }

  return {
    addPreviewGroup,
    removePreviewGroup,
    updatePreviewGroup,
  };
}
