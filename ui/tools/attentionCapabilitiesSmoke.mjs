import assert from 'node:assert/strict';
import { isAttentionBackendAvailable, makeAttentionOptions } from '../src/features/attentionCapabilities.js';

const profiles = [
  {
    id: 'standard',
    supported_attention_backends: ['sdpa', 'xformers', 'torch'],
    available_attention_backends: ['sdpa', 'torch'],
  },
  {
    id: 'flash2',
    supported_attention_backends: ['flash2', 'sdpa', 'xformers', 'torch'],
    available_attention_backends: ['flash2', 'sdpa', 'torch'],
  },
];

const values = [
  { value: '', label: '自动' },
  { value: 'sdpa', label: 'SDPA' },
  { value: 'xformers', label: 'xFormers' },
  { value: 'flash', label: 'FlashAttention 2' },
];

assert.equal(isAttentionBackendAvailable('sdpa', profiles, { runtime: { runtime: { environment: 'standard' } } }), true);
assert.equal(isAttentionBackendAvailable('xformers', profiles, { runtime: { runtime: { environment: 'standard' } } }), false);
assert.equal(isAttentionBackendAvailable('flash2', profiles, { runtime: { runtime: { environment: 'standard' } } }), false);
assert.equal(isAttentionBackendAvailable('flash2', profiles, { runtime: { runtime: { environment: 'flash2' } } }), true);

const standardOptions = makeAttentionOptions(values, profiles, { runtime: { runtime: { environment: 'standard' } } });
assert.equal(standardOptions.find((option) => option.value === 'sdpa')?.disabled, false);
assert.equal(standardOptions.find((option) => option.value === 'xformers')?.disabled, true);
assert.equal(standardOptions.find((option) => option.value === 'flash')?.disabled, true);

const flashOptions = makeAttentionOptions(values, profiles, { runtime: { runtime: { runtime_id: 'flash2' } } });
assert.equal(flashOptions.find((option) => option.value === 'flash')?.disabled, false);

console.log('attentionCapabilitiesSmoke: ok');
