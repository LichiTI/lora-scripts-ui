// 快照验证器：每个阶段后运行，确保零行为变更
// 用法: node scripts/verify-snapshot.mjs [goldenPath]
// 输出: PASS（与黄金快照一致）/ FAIL（列出每处差异）
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  TRAINING_TYPES,
  getSectionsForType,
  createDefaultConfig,
  buildRunConfig,
} from '../src/schemaIndex.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const goldenPath = process.argv[2] || join(__dirname, 'golden-snapshot.json');

// ---- 复用 golden-snapshot.mjs 的序列化逻辑（保持完全一致）----
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

// 实时生成当前快照
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
const sampleTypes = [
  'sdxl-lora', 'sd-lora', 'flux-lora', 'anima-lora',
  'newbie-lora', 'sdxl-ileco', 'anima-finetune', 'sd-textual-inversion',
];
const build = {};
for (const id of sampleTypes) {
  const cfg = createDefaultConfig(id);
  build[id] = stable(buildRunConfig(cfg, id));
}
const current = { structure, build };

// 读取黄金快照
const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));

// ---- 深度对比 ----
const diffs = [];
function diff(a, b, path) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      diffs.push(`${path}: 数组长度 ${a.length} → ${b.length}`);
      return;
    }
    for (let i = 0; i < a.length; i++) diff(a[i], b[i], `${path}[${i}]`);
    return;
  }
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!(k in a)) diffs.push(`${path}.${k}: 新增字段 = ${JSON.stringify(b[k])}`);
      else if (!(k in b)) diffs.push(`${path}.${k}: 删除字段（原值 ${JSON.stringify(a[k])}）`);
      else diff(a[k], b[k], `${path}.${k}`);
    }
    return;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    diffs.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  }
}

// 对比结构
const goldenTypes = Object.keys(golden.structure).sort();
const currentTypes = Object.keys(current.structure).sort();
if (JSON.stringify(goldenTypes) !== JSON.stringify(currentTypes)) {
  diffs.push(`训练类型集合变化:\n  黄金: ${goldenTypes.join(', ')}\n  当前: ${currentTypes.join(', ')}`);
}
for (const id of goldenTypes) {
  if (current.structure[id]) diff(golden.structure[id], current.structure[id], `[结构] ${id}`);
}
// 对比 buildRunConfig
for (const id of Object.keys(golden.build)) {
  if (current.build[id]) diff(golden.build[id], current.build[id], `[buildRunConfig] ${id}`);
  else diffs.push(`[buildRunConfig] ${id}: 当前缺失`);
}

// ---- 输出 ----
console.log('═'.repeat(60));
console.log(`黄金快照: ${goldenPath}`);
console.log(`当前类型: ${currentTypes.length} | section: ${Object.values(structure).reduce((a, s) => a + s.length, 0)} | field: ${Object.values(structure).reduce((a, secs) => a + secs.reduce((b, s) => b + s.fields.length, 0), 0)}`);
console.log('═'.repeat(60));
if (diffs.length === 0) {
  console.log('✅ PASS — 与黄金快照完全一致，零行为变更');
  process.exit(0);
} else {
  console.log(`❌ FAIL — 发现 ${diffs.length} 处差异:`);
  // 只显示前 60 条，避免刷屏
  for (const d of diffs.slice(0, 60)) console.log(`  • ${d}`);
  if (diffs.length > 60) console.log(`  ... 还有 ${diffs.length - 60} 处差异未显示`);
  process.exit(1);
}
