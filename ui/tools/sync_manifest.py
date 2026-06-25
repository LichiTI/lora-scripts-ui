"""
将 entries/ 目录中所有已存在但未在 manifest 注册的条目批量注册进去
运行: python tools/sync_manifest.py
"""
import json, os, glob

ENTRIES_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'training-wiki', 'entries')
MANIFEST_PATH = os.path.join(os.path.dirname(__file__), '..', 'public', 'training-wiki', 'manifest.json')

with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
    manifest = json.load(f)

# 已注册的 key set
registered_keys = set()
for e in manifest['entries']:
    registered_keys.add(e['key'])
    for a in e.get('aliases', []):
        registered_keys.add(a)

added = 0
for fpath in sorted(glob.glob(os.path.join(ENTRIES_DIR, '*.json'))):
    fname = os.path.basename(fpath)
    try:
        with open(fpath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as ex:
        print(f'SKIP (bad json) {fname}: {ex}')
        continue

    key = data.get('key', fname[:-5])
    if key in registered_keys:
        continue  # 已注册，跳过

    aliases = data.get('aliases', [])
    entry_ref = f'entries/{fname}'
    title = data.get('title', key)
    category = data.get('category', '训练')
    summary = ''
    std = data.get('standard', {})
    if isinstance(std, dict):
        summary = std.get('summary', '')[:120]

    manifest['entries'].append({
        'key': key,
        'title': title,
        'category': category,
        'summary': summary,
        'entry': entry_ref,
        'aliases': aliases,
    })
    registered_keys.add(key)
    for a in aliases:
        registered_keys.add(a)
    added += 1
    print(f'  + {key}')

with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

print(f'\n完成: 新增 {added} 条目，manifest 共 {len(manifest["entries"])} 条')
