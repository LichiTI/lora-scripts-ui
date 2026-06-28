// trainingWiki.js — 训练参数 Wiki 词条加载器
// 运行时从 ./training-wiki/manifest.json 解析词条索引，按 fieldKey 拉取详细说明。
// 数据源：后端 resources/training_wiki；前端构建时会拷贝到可访问路径。
// fetch 失败时返回空，由调用方 fallback 到 schema 字段自身的 desc。
const WIKI_ROOT = './training-wiki';

let manifestPromise = null;
const entryPromises = new Map();

export async function loadTrainingWikiManifest() {
  if (!manifestPromise) {
    manifestPromise = fetchJson(`${WIKI_ROOT}/manifest.json`).catch(() => ({ entries: [] }));
  }
  return manifestPromise;
}

export async function loadTrainingWikiEntry(fieldKey) {
  const key = String(fieldKey || '').trim();
  if (!key) return null;
  if (!entryPromises.has(key)) {
    entryPromises.set(key, resolveEntry(key));
  }
  return entryPromises.get(key);
}

export function buildSchemaFallbackEntry(field) {
  if (!field) return null;
  const label = stripKeySuffix(field.label || field.key || '参数说明');
  const summary = field.desc || field.importantDesc || '这个参数来自当前训练 schema，完整 Wiki 条目还在补充中。';
  return {
    key: field.key || '',
    title: label,
    category: '训练参数',
    standard: {
      summary,
      effect: '具体效果取决于当前训练类型和后端运行时解析。',
      whenToUse: '不确定时先保持默认值，小步数短测确认再调整。',
      avoidWhen: '如果它与其它选项互斥、预检提示冲突，优先按预检建议处理。',
    },
    advanced: null,
    relatedConfigs: [],
    fallback: true,
  };
}

async function resolveEntry(key) {
  const manifest = await loadTrainingWikiManifest();
  const item = findManifestEntry(manifest, key);
  if (!item?.entry) return null;
  return fetchJson(`${WIKI_ROOT}/${item.entry}`).catch(() => null);
}

function findManifestEntry(manifest, key) {
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  return entries.find((item) => item.key === key || (Array.isArray(item.aliases) && item.aliases.includes(key))) || null;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Wiki resource not found: ${url}`);
  return response.json();
}

function stripKeySuffix(label) {
  return String(label || '').replace(/（[^）]+）\s*$/, '').trim();
}
