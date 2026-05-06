// 训练类型注册表 - 管理多种训练模式的 schema 定义
// 每个训练类型导出统一结构：{ key, label, trainType, tabs, sections, conditionalKeys }

import { SDXL_LORA_SCHEMA } from './sdxlSchema.js';
import { ANIMA_LORA_SCHEMA } from './animaSchema.js';

export const TRAINING_TYPES = [
  SDXL_LORA_SCHEMA,
  ANIMA_LORA_SCHEMA,
];

export function getTrainingType(key) {
  return TRAINING_TYPES.find((t) => t.key === key) || TRAINING_TYPES[0];
}

// ── 条件显示工具 ──

export function when(key, expected) {
  return (config) => config[key] === expected;
}

export function all(...conditions) {
  return (config) => conditions.every((c) => c(config));
}

// ── schema 通用工具 ──

export function createDefaultConfigFromSections(sections) {
  const config = {};
  for (const section of sections) {
    for (const field of section.fields) {
      if (Array.isArray(field.defaultValue)) {
        config[field.key] = [...field.defaultValue];
      } else {
        config[field.key] = field.defaultValue ?? '';
      }
    }
  }
  return config;
}

export function buildFieldMap(sections) {
  const map = new Map();
  for (const section of sections) {
    for (const field of section.fields) {
      map.set(field.key, field);
    }
  }
  return map;
}

export function isFieldVisible(field, config) {
  if (!field?.visibleWhen) return true;
  return field.visibleWhen(config);
}

export function normalizeDraftValue(field, rawValue) {
  if (!field) return rawValue;
  if (field.type === 'ui_group') return '';
  if (field.type === 'boolean') return Boolean(rawValue);
  if (field.type === 'number' || field.type === 'slider') {
    if (rawValue === '' || rawValue === null || rawValue === undefined) return '';
    const parsed = Number(rawValue);
    return Number.isNaN(parsed) ? '' : parsed;
  }
  return rawValue;
}

export function getSectionsForTab(sections, tabKey) {
  return sections.filter((s) => s.tab === tabKey);
}

export function buildRunConfig(sections, config, trainType) {
  const payload = {};
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.type === 'ui_group') continue;
      if (field.type !== 'hidden' && !isFieldVisible(field, config)) continue;
      const value = config[field.key];
      if (field.type === 'boolean') { payload[field.key] = Boolean(value); continue; }
      if (field.type === 'number' || field.type === 'slider') {
        if (value === '' || value === null || value === undefined) continue;
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) payload[field.key] = parsed;
        continue;
      }
      if (value === '' || value === null || value === undefined) continue;
      payload[field.key] = value;
    }
  }
  payload.model_train_type = trainType;
  return payload;
}
