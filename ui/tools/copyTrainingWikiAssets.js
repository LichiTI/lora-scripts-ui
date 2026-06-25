import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const uiRoot = path.resolve(here, '..');
const projectRoot = path.resolve(uiRoot, '..', '..', '..');
const wikiSource = path.join(projectRoot, 'resources', 'training_wiki');

function copyWiki(target) {
  if (!fs.existsSync(wikiSource)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(wikiSource, target, { recursive: true, force: true });
}

export function copyTrainingWikiAssets() {
  return {
    name: 'copy-training-wiki-assets',
    buildStart() {
      copyWiki(path.join(uiRoot, 'public', 'training-wiki'));
    },
    closeBundle() {
      copyWiki(path.join(uiRoot, 'dist', 'training-wiki'));
    },
  };
}
