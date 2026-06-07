import { DRAFT_STORAGE_KEY, DELETED_TASK_IDS_STORAGE_KEY } from './constants.js';

const STORAGE_KEYS = Object.freeze({
  theme: 'theme',
  uiTheme: 'sd-rescripts:ui-theme',
  roundedUI: 'roundedUI',
  verticalTabs: 'verticalTabs',
  activeTab: 'sdxl_ui_tab',
  trainingType: 'sd-rescripts:training-type',
  navigatorWidth: 'sd-rescripts:ui:navigator-width',
  jsonWidth: 'sd-rescripts:ui:json-width',
  navigatorCollapsed: 'sd-rescripts:ui:navigator-collapsed',
  jsonCollapsed: 'sd-rescripts:ui:json-collapsed',
  legacyNavigatorCollapsed: 'sd-rescripts:navigator-collapsed',
});

export { DRAFT_STORAGE_KEY, DELETED_TASK_IDS_STORAGE_KEY, STORAGE_KEYS };

function readBool(key, fallback = false) {
  const value = localStorage.getItem(key);
  if (value === null) return fallback;
  return value === 'true';
}

function readNumber(key, fallback) {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readNavigatorCollapsed() {
  const current = localStorage.getItem(STORAGE_KEYS.navigatorCollapsed);
  if (current !== null) return current === 'true';
  return readBool(STORAGE_KEYS.legacyNavigatorCollapsed, false);
}

export function readUiPreferences() {
  const rawTheme = localStorage.getItem(STORAGE_KEYS.theme) || 'dark';
  const mainThemes = new Set(['dark', 'light', 'clay']);
  const styleThemes = new Set(['classic', 'brutalist', 'joy', 'glass']);
  const rawUiTheme = localStorage.getItem(STORAGE_KEYS.uiTheme);
  return {
    navigatorWidth: readNumber(STORAGE_KEYS.navigatorWidth, 240),
    jsonPanelWidth: readNumber(STORAGE_KEYS.jsonWidth, 280),
    jsonPanelCollapsed: readBool(STORAGE_KEYS.jsonCollapsed, false),
    navigatorCollapsed: readNavigatorCollapsed(),
    theme: mainThemes.has(rawTheme) ? rawTheme : 'dark',
    uiTheme: styleThemes.has(rawUiTheme) ? rawUiTheme : (styleThemes.has(rawTheme) ? rawTheme : 'classic'),
    roundedUI: readBool(STORAGE_KEYS.roundedUI, false),
    verticalTabs: readBool(STORAGE_KEYS.verticalTabs, false),
    activeTab: localStorage.getItem(STORAGE_KEYS.activeTab) || 'model',
    activeTrainingType: localStorage.getItem(STORAGE_KEYS.trainingType) || 'sdxl-lora',
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

/**
 * 从 localStorage 读取并解析 SDXL 草稿。
 * @returns {object | null} 解析后的配置 patch，或 null（不存在/解析失败）
 */
export function readDraftFromStorage() {
  const rawDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!rawDraft) return null;
  try {
    const parsed = JSON.parse(rawDraft);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (error) {
    console.warn('Failed to read local draft:', error);
    return null;
  }
}

/**
 * 将当前配置作为草稿写入 localStorage。
 * @param {object} config
 */
export function writeDraftToStorage(config) {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    /* localStorage 满或被禁用时静默 */
  }
}

/**
 * 读取已删除的任务 ID 集合（用于本地伪删除，使后端历史同步时过滤掉已被用户删除的项）。
 * @returns {Set<string>}
 */
export function loadDeletedTaskIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(DELETED_TASK_IDS_STORAGE_KEY) || '[]');
    return new Set(Array.isArray(ids) ? ids.map((id) => String(id)) : []);
  } catch (error) {
    return new Set();
  }
}

/**
 * 将已删除 ID 集合写回 localStorage。
 * @param {Iterable<string>} ids
 */
export function persistDeletedTaskIds(ids) {
  try {
    const arr = Array.from(ids || []).filter(Boolean);
    localStorage.setItem(DELETED_TASK_IDS_STORAGE_KEY, JSON.stringify(arr));
  } catch (error) {
    /* ignore */
  }
}
