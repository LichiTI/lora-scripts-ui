// Schema parity 快照(golden master)。用于把"按训练族拆分 sdxlSchema 神文件"重构
// 做成可证明的行为保功能:改动前 --capture 固化全部训练类型的 schema 行为,之后每阶段
// --check 与 baseline 逐字节比对,任何漂移(漏字段/错序/默认值变/payload 变)即 fail。
//
// 覆盖每个 TRAINING_TYPES.id:
//   - getSectionsForType  结构序列化(函数 visibleWhen → 稳定 token 'ƒ',保 section/field 全形)
//   - createDefaultConfig 默认值
//   - getAvailableTabs    页签集
//   - buildRunConfig      payload(默认 + 每 boolean 翻转 + 每 select 选项,穷尽 visibleWhen 门控)
//
// 用法(纯 node,无需 python 环境):
//   node ui/tools/schemaParitySnapshot.mjs --capture   # 改动前采 baseline
//   node ui/tools/schemaParitySnapshot.mjs --check      # 每阶段后比对
//
// 重构 Stage 3 把公共 API 迁到 schemaIndex.js 时,把下面这行 import 一并改到 ../src/schemaIndex.js。
// baseline 是路径无关的纯数据,迁移 import 不影响比对有效性。
import {
  TRAINING_TYPES,
  getSectionsForType,
  createDefaultConfig,
  getAvailableTabs,
  buildRunConfig,
} from '../src/schemaIndex.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(HERE, '.schema-parity-baseline.json');

// 函数不可序列化:JSON 默认会丢弃函数值,使 visibleWhen 的存在性丢失。replacer 把任意函数
// 转成稳定 token 'ƒ',从而记录"该字段有/无 visibleWhen"这一结构事实(谓词闭包重构时原样
// 搬运,行为按构造等价;buildRunConfig 排列另行覆盖谓词的实际逻辑)。
const fnReplacer = (_k, v) => (typeof v === 'function' ? 'ƒ' : v);

function fieldsOf(typeId) {
  const out = [];
  for (const section of getSectionsForType(typeId)) {
    for (const f of section.fields || []) out.push(f);
  }
  return out;
}

function optionValue(opt) {
  return opt && typeof opt === 'object' ? opt.value : opt;
}

// 默认 + 逐 boolean 翻转 + 逐 select 选项:O(字段数) 个配置,穷尽 boolean/select 门控的
// visibleWhen 分支(本仓 visibleWhen 绝大多数由 boolean 开关或 select 取值驱动)。
function permutations(typeId) {
  const base = createDefaultConfig(typeId);
  const variants = [['default', base]];
  for (const f of fieldsOf(typeId)) {
    if (!f || !f.key) continue;
    if (f.type === 'boolean') {
      variants.push([`bool:${f.key}=${!base[f.key]}`, { ...base, [f.key]: !base[f.key] }]);
    } else if (f.type === 'select' && Array.isArray(f.options)) {
      for (const opt of f.options) {
        const val = optionValue(opt);
        variants.push([`sel:${f.key}=${val}`, { ...base, [f.key]: val }]);
      }
    }
  }
  return variants;
}

function safe(fn) {
  try {
    return { ok: fn() };
  } catch (e) {
    return { err: String(e && e.message ? e.message : e) };
  }
}

function buildSnapshot() {
  const snap = {};
  for (const t of TRAINING_TYPES) {
    const typeId = t.id;
    const runConfigs = {};
    for (const [label, cfg] of permutations(typeId)) {
      runConfigs[label] = safe(() => buildRunConfig(cfg, typeId));
    }
    snap[typeId] = {
      sections: safe(() => getSectionsForType(typeId)),
      defaults: safe(() => createDefaultConfig(typeId)),
      tabs: safe(() => getAvailableTabs(typeId)),
      runConfigs,
    };
  }
  // 稳定排序键 + ƒ-replacer,确保字节级可复现。
  return JSON.stringify(snap, fnReplacer, 1);
}

// ── 逐类型 diff 定位,便于排错 ──
function firstDiff(a, b) {
  const oa = JSON.parse(a);
  const ob = JSON.parse(b);
  const types = new Set([...Object.keys(oa), ...Object.keys(ob)]);
  for (const typeId of types) {
    const sa = JSON.stringify(oa[typeId] ?? null, null, 1);
    const sb = JSON.stringify(ob[typeId] ?? null, null, 1);
    if (sa !== sb) {
      for (const sub of ['sections', 'defaults', 'tabs', 'runConfigs']) {
        const da = JSON.stringify(oa[typeId]?.[sub] ?? null);
        const db = JSON.stringify(ob[typeId]?.[sub] ?? null);
        if (da !== db) {
          if (sub === 'runConfigs') {
            const ra = oa[typeId]?.runConfigs ?? {};
            const rb = ob[typeId]?.runConfigs ?? {};
            for (const lbl of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
              if (JSON.stringify(ra[lbl]) !== JSON.stringify(rb[lbl])) {
                return `type='${typeId}' runConfigs['${lbl}']\n  baseline: ${JSON.stringify(ra[lbl])}\n  current : ${JSON.stringify(rb[lbl])}`;
              }
            }
          }
          return `type='${typeId}' .${sub}\n  baseline: ${da.slice(0, 400)}\n  current : ${db.slice(0, 400)}`;
        }
      }
      return `type='${typeId}' 差异(子键级未定位)`;
    }
  }
  return '(整体不同但逐类型一致——可能是类型集合本身变化)';
}

const mode = process.argv[2];
const current = buildSnapshot();

if (mode === '--capture') {
  writeFileSync(BASELINE, current, 'utf8');
  const n = Object.keys(JSON.parse(current)).length;
  console.log(`captured baseline: ${BASELINE}`);
  console.log(`  ${n} training types snapshotted (${current.length} bytes)`);
  process.exit(0);
} else if (mode === '--check') {
  if (!existsSync(BASELINE)) {
    console.error(`FAIL — baseline 不存在,先跑 --capture: ${BASELINE}`);
    process.exit(1);
  }
  const baseline = readFileSync(BASELINE, 'utf8');
  if (baseline === current) {
    const n = Object.keys(JSON.parse(current)).length;
    console.log(`PASS — schema parity 全绿:${n} 训练类型逐字节一致(${current.length} bytes)`);
    process.exit(0);
  }
  console.error('FAIL — schema parity 漂移:');
  console.error(firstDiff(baseline, current));
  process.exit(1);
} else {
  console.error('用法: node ui/tools/schemaParitySnapshot.mjs --capture | --check');
  process.exit(2);
}
