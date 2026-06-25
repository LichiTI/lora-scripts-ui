export const TAG_MANAGER_PRESETS_STORAGE_KEY = 'sd-rescripts:tag-manager-lite-presets';

export function loadTagManagerPresets(storage = localStorage) {
  try {
    const raw = storage.getItem(TAG_MANAGER_PRESETS_STORAGE_KEY) || '[]';
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry === 'object' && String(entry.name || '').trim());
  } catch {
    return [];
  }
}

export function saveTagManagerPresets(presets, storage = localStorage) {
  storage.setItem(TAG_MANAGER_PRESETS_STORAGE_KEY, JSON.stringify(Array.isArray(presets) ? presets.slice(0, 50) : []));
}

export function upsertTagManagerPreset(presets, name, config) {
  const normalizedName = String(name || '').trim();
  const nextPreset = { name: normalizedName, config };
  const next = (Array.isArray(presets) ? presets : [])
    .filter((preset) => String(preset.name || '').trim().toLowerCase() !== normalizedName.toLowerCase());
  next.unshift(nextPreset);
  return next;
}

export function deleteTagManagerPresetByName(presets, name) {
  const normalizedName = String(name || '').trim();
  return (Array.isArray(presets) ? presets : [])
    .filter((entry) => String(entry.name || '').trim() !== normalizedName);
}

export function decodeTagManagerQuickValue(encodedValue) {
  try {
    return decodeURIComponent(String(encodedValue || ''));
  } catch {
    return String(encodedValue || '');
  }
}

export function appendUniqueTextLine(currentValue, value) {
  const text = String(value || '').trim();
  const existingLines = String(currentValue || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!text) {
    return { added: false, value: existingLines.join('\n') };
  }
  const seen = new Set(existingLines.map((line) => line.toLowerCase()));
  if (seen.has(text.toLowerCase())) {
    return { added: false, value: existingLines.join('\n') };
  }
  existingLines.push(text);
  return { added: true, value: existingLines.join('\n') };
}
