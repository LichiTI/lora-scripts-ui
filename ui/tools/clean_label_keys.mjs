/**
 * P3: 清理 schema label 末尾的 (snake_case_key) 括号后缀
 * 规则: label 字符串末尾 「（[a-z][a-z0-9_]*）」 → 删除
 * 不动: 括号内含中文/大写/空格等非 snake_case 内容
 * 同步将 key 值写入同 field 的 title 属性(若该行已有 title 则跳过)
 *
 * 用法: node tools/clean_label_keys.mjs [--write]
 */
import { readFileSync, writeFileSync } from 'fs';

const KEY_SUFFIX = /（[a-z][a-z0-9_]*）(?=\s*['"`])/g;

// label 行里同时提取该字段的 key 值,用于写 title
const FIELD_KEY = /\bkey:\s*['"`]([^'"`]+)['"`]/;

const FILES = [
  'src/schemaFieldGroups.js',
  'src/animaSchema.js',
  'src/sdxlSchema.js',
];

const write = process.argv.includes('--write');
let totalChanged = 0;

for (const file of FILES) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  let changed = 0;

  const result = lines.map((line) => {
    if (!KEY_SUFFIX.test(line)) return line;
    KEY_SUFFIX.lastIndex = 0;

    // 删除 label 末尾括号 key
    let out = line.replace(KEY_SUFFIX, '');

    // 提取当前 field 的 key,补 title 属性(仅当行内已有 label 且无 title 时)
    const hasLabel = /\blabel:/.test(out);
    const hasTitle = /\btitle:/.test(out);
    if (hasLabel && !hasTitle) {
      const keyMatch = out.match(FIELD_KEY);
      if (keyMatch) {
        // 在 label: '...' 后插入 title: 'key'
        out = out.replace(
          /(label:\s*['"`][^'"`]*['"`])/,
          `$1, title: '${keyMatch[1]}'`,
        );
      }
    }

    changed++;
    return out;
  });

  totalChanged += changed;
  console.log(`${file}: ${changed} 行`);

  if (write) {
    writeFileSync(file, result.join('\n'), 'utf8');
    console.log(`  → 已写入`);
  }
}

console.log(`\n合计: ${totalChanged} 行${write ? ' (已写入)' : ' (dry-run,加 --write 写入)'}`);
