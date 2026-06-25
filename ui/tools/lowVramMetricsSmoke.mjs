import assert from 'node:assert/strict';
import { generateSummaryFromTaskLog, renderSummaryCard } from '../src/utils/trainingMetrics.js';

const profile = {
  requested: 'low_12g',
  effective: 'low_12g',
  enabled: true,
  changes: {
    cache_latents: { before: false, after: true },
    gradient_checkpointing: { before: false, after: true },
    swap_granularity: { before: 'off', after: 'merged_block' },
  },
  skipped: [{ key: 'cache_text_encoder_outputs', reason: 'caption/text-encoder settings need live text encoding' }],
  warnings: [],
};

const lines = [
  `PROGRESS_JSON: ${JSON.stringify({ status: 'training', step: 1, total_steps: 2, epoch: 1, total_epochs: 1, loss: 0.24, lr: 1e-4, sdxl_lora_low_vram_profile: profile })}`,
  `PROGRESS_JSON: ${JSON.stringify({ status: 'training', step: 2, total_steps: 2, epoch: 1, total_epochs: 1, loss: 0.18, lr: 1e-4, sdxl_lora_low_vram_profile: profile })}`,
];

const summary = generateSummaryFromTaskLog(lines);
assert.equal(summary.sdxlLoraLowVramProfile.effective, 'low_12g');
assert.equal(summary.sdxlLoraLowVramProfile.enabled, true);

const html = renderSummaryCard(summary);
assert.ok(html.includes('SDXL/LoRA 低显存档位'));
assert.ok(html.includes('low_12g'));
assert.ok(html.includes('runtime 改动 3'));
assert.ok(html.includes('跳过 1'));

console.log('lowVramMetricsSmoke: ok');
