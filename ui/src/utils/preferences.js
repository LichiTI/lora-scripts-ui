const STORAGE_KEYS = Object.freeze({
  theme: 'theme',
  roundedUI: 'roundedUI',
  verticalTabs: 'verticalTabs',
  accentColor: 'accentColor',
  activeTab: 'sdxl_ui_tab',
  trainingType: 'sd-rescripts:training-type',
  navigatorWidth: 'sd-rescripts:ui:navigator-width',
  jsonWidth: 'sd-rescripts:ui:json-width',
  navigatorCollapsed: 'sd-rescripts:ui:navigator-collapsed',
  jsonCollapsed: 'sd-rescripts:ui:json-collapsed',
});

function readBool(key, fallback = false) {
  const value = localStorage.getItem(key);
  if (value === null) return fallback;
  return value === 'true';
}

function readNumber(key, fallback) {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function readUiPreferences() {
  return {
    navigatorWidth: readNumber(STORAGE_KEYS.navigatorWidth, 240),
    jsonPanelWidth: readNumber(STORAGE_KEYS.jsonWidth, 280),
    jsonPanelCollapsed: readBool(STORAGE_KEYS.jsonCollapsed, false),
    navigatorCollapsed: readBool(STORAGE_KEYS.navigatorCollapsed, false),
    theme: localStorage.getItem(STORAGE_KEYS.theme) || 'dark',
    roundedUI: readBool(STORAGE_KEYS.roundedUI, false),
    verticalTabs: readBool(STORAGE_KEYS.verticalTabs, false),
    activeTab: localStorage.getItem(STORAGE_KEYS.activeTab) || 'model',
    activeTrainingType: localStorage.getItem(STORAGE_KEYS.trainingType) || 'sdxl-lora',
    accentColor: localStorage.getItem(STORAGE_KEYS.accentColor) || null,
  };
}

export function persistLayoutWidths({ navigatorWidth, jsonPanelWidth }) {
  localStorage.setItem(STORAGE_KEYS.navigatorWidth, String(navigatorWidth));
  localStorage.setItem(STORAGE_KEYS.jsonWidth, String(jsonPanelWidth));
}

export function persistNavigatorCollapsed(collapsed) {
  localStorage.setItem(STORAGE_KEYS.navigatorCollapsed, String(Boolean(collapsed)));
}

export function persistJsonPanelCollapsed(collapsed) {
  localStorage.setItem(STORAGE_KEYS.jsonCollapsed, String(Boolean(collapsed)));
}

export { STORAGE_KEYS };
