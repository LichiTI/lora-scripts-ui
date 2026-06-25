import assert from 'node:assert/strict';
import { createAboutRenderer } from '../src/renderers/about.js';

let requested = 0;
const api = {
  async getFirstReleaseReadiness() {
    requested += 1;
    return {
      data: {
        stable_baseline_ready: true,
        release_blockers: [],
        deferred_research_blockers: [
          'p4_nvcomp_not_product_ready',
          'resource_center_gate_closed',
        ],
        core_release_smoke: { ok: true },
        batch1_handler_parity_smoke: { ok: true },
        experimental_claim_gate_evidence: { ok: true },
        note_zh: '该状态只评估第一版 stable baseline 是否可发布。',
      },
    };
  },
  async refreshFirstReleaseReadiness() {
    requested += 1;
    return {
      data: {
        stable_baseline_ready: true,
        release_blockers: [],
        deferred_research_blockers: [
          'p4_nvcomp_not_product_ready',
          'resource_center_gate_closed',
        ],
        core_release_smoke: { ok: true },
        batch1_handler_parity_smoke: { ok: true },
        experimental_claim_gate_evidence: { ok: true },
        note_zh: '该状态只评估第一版 stable baseline 是否可发布。',
      },
    };
  },
};

globalThis.window = {};
globalThis.document = {
  getElementById(id) {
    if (id !== 'about-readiness-panel') return null;
    return panel;
  },
};

const panel = {
  innerHTML: '',
  outerHTML: '',
};

const renderer = createAboutRenderer({
  api,
  showToast: () => {},
  reportWebuiError: () => {},
});

const staticHtml = renderer.renderReadinessCard({
  stable_baseline_ready: true,
  release_blockers: [],
  deferred_research_blockers: ['p4_nvcomp_not_product_ready'],
  core_release_smoke: { ok: true },
  batch1_handler_parity_smoke: { ok: true },
  experimental_claim_gate_evidence: { ok: true },
  note_zh: '该状态只评估第一版 stable baseline 是否可发布。',
});

assert.match(staticHtml, /第一版发布状态/);
assert.match(staticHtml, /stable baseline 可发布/);
assert.match(staticHtml, /延后研究项/);
assert.match(staticHtml, /实验能力 release claim 已保持 fail-closed/);

await renderer.loadAboutReleaseReadiness();
assert.equal(requested, 1);
assert.match(panel.outerHTML, /首发阻塞项/);
assert.match(panel.outerHTML, /Release smoke/);

panel.outerHTML = '';
await renderer.refreshAboutReleaseReadiness();
assert.equal(requested, 2);
assert.match(panel.outerHTML, /stable baseline 可发布/);

console.log('aboutFirstReleaseSmoke: ok');
