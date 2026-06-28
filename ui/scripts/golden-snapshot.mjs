// 黄金快照生成器：阶段0 验证基准
// 用法: node scripts/golden-snapshot.mjs [outputPath]
// 遍历 SECTIONS_MAP 全部训练类型，dump 结构 + 5 个 type 的 buildRunConfig 输出
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  TRAINING_TYPES,
  getSectionsForType,
  createDefaultConfig,
  buildRunConfig,
} from '../src/schemaIndex.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = process.argv[2] || join(__dirname, 'golden-snapshot.json');

// 稳定序列化：对象 key 递归排序，确保跨次运行可比对
function stable(obj) {
  if (Array.isArray(obj)) return obj.map(stable);
  if (obj && typeof obj === 'object') {
    const sorted = {};
    for (const k of Object.keys(obj).sort()) sorted[k] = stable(obj[k]);
    return sorted;
  }
  return obj;
}
function snapshotValue(v) {
  // undefined / 函数统一标记，确保 JSON 可稳定序列化与比对
  if (v === undefined) return '__UNDEFINED__';
  if (typeof v === 'function') return '__FN__';
  if (Array.isArray(v)) return v.map(snapshotValue);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = snapshotValue(v[k]);
    return o;
  }
  return v;
}

// ---- 1. 结构快照：每个 type 的 [sectionId, tab, fieldKey, type, defaultValue] ----
const structure = {};
for (const { id } of TRAINING_TYPES) {
  const sections = getSectionsForType(id);
  structure[id] = sections.map((s) => ({
    id: s.id,
    tab: s.tab,
    title: s.title,
    fields: (s.fields || []).map((f) => ({
      key: f.key,
      type: f.type,
      defaultValue: snapshotValue(f.defaultValue),
    })),
  }));
}

// ---- 2. buildRunConfig 快照：代表性 type ----
const sampleTypes = [
  'sdxl-lora', 'sd-lora', 'flux-lora', 'anima-lora',
  'newbie-lora', 'sdxl-ileco', 'anima-finetune', 'sd-textual-inversion',
];
const build = {};
for (const id of sampleTypes) {
  const cfg = createDefaultConfig(id);
  build[id] = stable(buildRunConfig(cfg, id));
}

// ---- 3. 统计 ----
const stats = {
  typeCount: TRAINING_TYPES.length,
  totalSections: Object.values(structure).reduce((a, secs) => a + secs.length, 0),
  totalFields: Object.values(structure).reduce(
    (a, secs) => a + secs.reduce((b, s) => b + s.fields.length, 0),
    0,
  ),
  generatedAt: new Date().toISOString(),
};

const snapshot = { stats, structure, build };
writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');

console.log(`✅ 黄金快照已写入: ${outPath}`);
console.log(`   训练类型: ${stats.typeCount}`);
console.log(`   section 总数: ${stats.totalSections}`);
console.log(`   field 总数: ${stats.totalFields}`);
console.log(`   buildRunConfig 采样: ${sampleTypes.length} 个 type`);
