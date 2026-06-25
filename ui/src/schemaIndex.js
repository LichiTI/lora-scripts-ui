// ================================================================
// schemaIndex.js — 训练族 schema 汇总入口 + 公共 API
// 把各族(sdxl / anima / 长尾 / DiT 长尾 / 实验)的 section 汇成 SECTIONS_MAP,
// 并对外暴露 getSectionsForType / createDefaultConfig / buildRunConfig 等公共 API。
// 这是 main.js 与各 smoke/parity 工具的唯一公共入口(原先在 sdxlSchema 神文件尾部)。
// ================================================================
import { TRAINING_TYPES as _ALL_TRAINING_TYPES, UI_TABS } from './trainingTypeRegistry.js';
export const TRAINING_TYPES = _ALL_TRAINING_TYPES.filter((t) => !t.hidden);
export { UI_TABS };import { FRONTIER_OPTIMIZER_CANDIDATE_OPTIONS, TARGET_LORA_OPTIMIZERS, schedulerOptions } from './features/settingsOptions.js';
import { buildRunConfigFromSections } from './runConfigBuilder.js';
import {
  SDXL_LORA_SECTIONS, SDXL_ILECO_SECTIONS, SDXL_ADDIFT_SECTIONS, SDXL_MULTI_ADDIFT_SECTIONS,
  SDXL_FT_SECTIONS, SDXL_CN_SECTIONS, SDXL_TI_SECTIONS,
} from './sdxlSchema.js';
import {
  ANIMA_LORA_SECTIONS, ANIMA_ILECO_SECTIONS, ANIMA_ADDIFT_SECTIONS,
  ANIMA_MULTI_ADDIFT_SECTIONS, ANIMA_FT_SECTIONS,
} from './animaSchema.js';
import {
  SD15_LORA_SECTIONS, SD15_ILECO_SECTIONS, SD15_ADDIFT_SECTIONS, SD15_MULTI_ADDIFT_SECTIONS,
  DB_SECTIONS, SD_CN_SECTIONS, SD_TI_SECTIONS, YOLO_SECTIONS, AESTHETIC_SCORER_SECTIONS,
} from './otherSchemas.js';
import {
  FLUX_LORA_SECTIONS, LUMINA_LORA_SECTIONS, QWEN_IMAGE_LORA_SECTIONS, HUNYUAN_DIT_LORA_SECTIONS,
  HUNYUAN_IMAGE_COMPAT_SECTIONS, FLUX_FT_SECTIONS, LUMINA_FT_SECTIONS, FLUX_CN_SECTIONS, NEWBIE_LORA_SECTIONS,
} from './otherDitSchemas.js';
import {
  LAB_DISTILLER_SECTIONS, SDXL_TURBO_LORA_SECTIONS, ANIMA_FEW_STEP_LORA_SECTIONS, NEWBIE_FEW_STEP_LORA_SECTIONS,
} from './experimentalTrainingSchemas.js';

// TRAINING_TYPES / UI_TABS 已在文件顶部 filter 后导出

// ================================================================
// SECTIONS_MAP
// ================================================================
const SECTIONS_MAP = {
  'sdxl-lora':              SDXL_LORA_SECTIONS,
  'sdxl-ileco':             SDXL_ILECO_SECTIONS,
  'sdxl-addift':            SDXL_ADDIFT_SECTIONS,
  'sdxl-multi-addift':      SDXL_MULTI_ADDIFT_SECTIONS,
  'sd-lora':                SD15_LORA_SECTIONS,
  'sd-ileco':               SD15_ILECO_SECTIONS,
  'sd-addift':              SD15_ADDIFT_SECTIONS,
  'sd-multi-addift':        SD15_MULTI_ADDIFT_SECTIONS,
  'flux-lora':              FLUX_LORA_SECTIONS,
  'lumina-lora':            LUMINA_LORA_SECTIONS,
  'qwen-image-lora':        QWEN_IMAGE_LORA_SECTIONS,
  'hunyuan-dit-lora':       HUNYUAN_DIT_LORA_SECTIONS,
  'hunyuan-image-lora':     HUNYUAN_IMAGE_COMPAT_SECTIONS,
  'anima-lora':             ANIMA_LORA_SECTIONS,
  'anima-ileco':            ANIMA_ILECO_SECTIONS,
  'anima-addift':           ANIMA_ADDIFT_SECTIONS,
  'anima-multi-addift':     ANIMA_MULTI_ADDIFT_SECTIONS,
  'newbie-lora':            NEWBIE_LORA_SECTIONS,
  'lab-distiller':          LAB_DISTILLER_SECTIONS,
  'sdxl-turbo-lora':        SDXL_TURBO_LORA_SECTIONS,
  'anima-few-step-lora':    ANIMA_FEW_STEP_LORA_SECTIONS,
  'newbie-few-step-lora':   NEWBIE_FEW_STEP_LORA_SECTIONS,
  'sd-dreambooth':          DB_SECTIONS,
  'sdxl-finetune':          SDXL_FT_SECTIONS,
  'flux-finetune':          FLUX_FT_SECTIONS,
  'lumina-finetune':        LUMINA_FT_SECTIONS,
  'anima-finetune':         ANIMA_FT_SECTIONS,
  'sd-controlnet':          SD_CN_SECTIONS,
  'sdxl-controlnet':        SDXL_CN_SECTIONS,
  'flux-controlnet':        FLUX_CN_SECTIONS,
  'sd-textual-inversion':   SD_TI_SECTIONS,
  'sdxl-textual-inversion': SDXL_TI_SECTIONS,
  'yolo':                   YOLO_SECTIONS,
  'aesthetic-scorer':       AESTHETIC_SCORER_SECTIONS,
};

const TARGET_OPTIMIZER_TRAINING_TYPES = new Set(['sdxl-lora', 'anima-lora', 'newbie-lora']);

// 兼容旧名
export const SDXL_SECTIONS = SDXL_LORA_SECTIONS;

// ================================================================
// 公共 API
// ================================================================
export function getSectionsForType(typeId) {
  return SECTIONS_MAP[typeId] || SDXL_LORA_SECTIONS;
}

function buildFieldMap(sections) {
  const map = new Map();
  for (const s of sections) for (const f of s.fields) map.set(f.key, f);
  return map;
}

const _fmCache = {};
function getFieldMapForType(typeId) {
  if (!_fmCache[typeId]) _fmCache[typeId] = buildFieldMap(getSectionsForType(typeId));
  return _fmCache[typeId];
}

export function getFieldDefinition(key, typeId) {
  if (typeId) return getFieldMapForType(typeId).get(key);
  for (const sections of Object.values(SECTIONS_MAP)) {
    const map = buildFieldMap(sections);
    if (map.has(key)) return map.get(key);
  }
  return undefined;
}

export function applyBackendConfigOptions(optionsPayload) {
  const payload = optionsPayload && typeof optionsPayload === 'object' ? optionsPayload : {};
  const optionValue = (option) => option && typeof option === 'object'
    ? String(option.value ?? '').trim()
    : String(option || '').trim();
  const uniqueOptions = (values) => {
    const seen = new Set();
    return (Array.isArray(values) ? values : [])
      .map((option) => {
        const value = optionValue(option);
        if (!value || seen.has(value)) return null;
        seen.add(value);
        return option && typeof option === 'object' ? { ...option, value } : value;
      })
      .filter(Boolean);
  };
  const optimizers = uniqueOptions(payload.optimizers || payload.optimizer_type);
  const schedulers = uniqueOptions(payload.schedulers || payload.lr_scheduler);
  const frontierCandidates = uniqueOptions(
    (payload.frontier_optimizer_candidates || []).map((item) => (
      item && typeof item === 'object'
        ? { value: item.name || item.value, label: item.label || item.name || item.value }
        : item
    ))
  );
  if (optimizers.length === 0 && schedulers.length === 0 && frontierCandidates.length === 0) return false;
  const mergedOptimizerOptions = uniqueOptions([...optimizers, ...TARGET_LORA_OPTIMIZERS]);
  const frontierOptimizerOptions = uniqueOptions([
    ...frontierCandidates,
    ...FRONTIER_OPTIMIZER_CANDIDATE_OPTIONS,
  ]);

  for (const [typeId, sections] of Object.entries(SECTIONS_MAP)) {
    for (const section of sections) {
      for (const field of section.fields || []) {
        if (field.key === 'optimizer_type' && optimizers.length > 0 && TARGET_OPTIMIZER_TRAINING_TYPES.has(typeId)) {
          field.options = mergedOptimizerOptions;
        } else if (field.key === 'frontier_optimizer_candidate' && frontierOptimizerOptions.length > 0) {
          field.options = frontierOptimizerOptions;
        } else if (field.key === 'lr_scheduler' && schedulers.length > 0) {
          field.options = schedulerOptions(schedulers);
        }
      }
    }
  }
  Object.keys(_fmCache).forEach((key) => delete _fmCache[key]);
  return true;
}

export function getSectionsForTab(tabKey, typeId) {
  const sections = getSectionsForType(typeId || 'sdxl-lora');
  let filtered = sections.filter((s) => {
    if (tabKey === 'dataset') return s.tab === 'dataset' || s.id === 'noise-settings';
    if (tabKey === 'advanced') return s.tab === 'advanced' && s.id !== 'noise-settings';
    if (tabKey === 'frontier') return s.tab === 'frontier';
    if (tabKey === 'model') return (s.tab === 'model' && s.id !== 'save-settings') || s.id === 'v-parameterization-settings' || s.id === 'rf-settings';
    if (tabKey === 'training') return (s.tab === 'training' || s.id === 'save-settings') && s.id !== 'v-parameterization-settings' && s.id !== 'rf-settings';
    return s.tab === tabKey;
  });

  if (tabKey === 'dataset') {
    const dataAugIndex = filtered.findIndex((s) => s.id === 'data-aug-settings');
    const noiseIndex = filtered.findIndex((s) => s.id === 'noise-settings');
    if (dataAugIndex !== -1 && noiseIndex !== -1 && noiseIndex !== dataAugIndex + 1) {
      const [noiseSection] = filtered.splice(noiseIndex, 1);
      filtered.splice(dataAugIndex + 1, 0, noiseSection);
    }
  }

  if (tabKey === 'training') {
    const trainingIndex = filtered.findIndex((s) => s.id === 'training-settings');
    const saveIndex = filtered.findIndex((s) => s.id === 'save-settings');
    if (trainingIndex !== -1 && saveIndex !== -1 && saveIndex !== trainingIndex + 1) {
      const [saveSection] = filtered.splice(saveIndex, 1);
      filtered.splice(trainingIndex + 1, 0, saveSection);
    }
  }

  if (tabKey === 'model') {
    const modelIndex = filtered.findIndex((s) => s.id === 'model-settings');
    const vParamIndex = filtered.findIndex((s) => s.id === 'v-parameterization-settings');
    const rfIndex = filtered.findIndex((s) => s.id === 'rf-settings');
    const moved = [];
    if (vParamIndex !== -1) {
      moved.push(filtered.splice(vParamIndex, 1)[0]);
    }
    const rfCurrentIndex = filtered.findIndex((s) => s.id === 'rf-settings');
    if (rfCurrentIndex !== -1) {
      moved.push(filtered.splice(rfCurrentIndex, 1)[0]);
    }
    if (modelIndex !== -1 && moved.length) {
      filtered.splice(modelIndex + 1, 0, ...moved);
    }
  }

  return filtered;
}

export function getAvailableTabs(typeId, config) {
  const sections = getSectionsForType(typeId || 'sdxl-lora');
  const tabSet = new Set();
  for (const s of sections) tabSet.add(s.tab);
  const expertMode = !!(config && config.performance_expert_mode);
  return UI_TABS.filter((t) => tabSet.has(t.key) && (!t.expertOnly || expertMode));
}

export function isFieldVisible(field, config) {
  if (!field?.visibleWhen) return true;
  return field.visibleWhen(config);
}

export function createDefaultConfig(typeId) {
  const config = {};
  for (const s of getSectionsForType(typeId || 'sdxl-lora'))
    for (const f of s.fields)
      config[f.key] = Array.isArray(f.defaultValue) ? [...f.defaultValue] : (f.defaultValue ?? '');
  return config;
}

export function normalizeDraftValue(field, rawValue) {
  if (!field) return rawValue;
  if (field.type === 'ui_group') return '';
  if (field.key === 'prior_loss_weight' && (rawValue === '' || rawValue === null || rawValue === undefined)) return 1;
  if (field.type === 'boolean') return Boolean(rawValue);
  if (field.type === 'number' || field.type === 'slider') {
    if (rawValue === '' || rawValue === null || rawValue === undefined) return '';
    const p = Number(rawValue);
    return Number.isNaN(p) ? '' : p;
  }
  return rawValue;
}

export function buildRunConfig(config, typeId) {
  return buildRunConfigFromSections(config, typeId, { getSectionsForType, isFieldVisible });
}
