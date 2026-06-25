import assert from 'node:assert/strict';
import { buildRunConfig, createDefaultConfig, getFieldDefinition } from '../src/schemaIndex.js';

const prodigyConfig = {
  ...createDefaultConfig('sdxl-lora'),
  optimizer_type: 'Prodigy',
  prodigy_d_coef: '3.5',
  prodigy_d0: '1e-6',
  optimizer_args_custom: 'weight_decay=0.02\nextra_flag=True',
  lr_scheduler: 'torch.optim.lr_scheduler.CosineAnnealingLR',
};
const prodigyPayload = buildRunConfig(prodigyConfig, 'sdxl-lora');
assert.equal(prodigyPayload.lr_scheduler, 'constant');
assert.equal(prodigyPayload.lr_scheduler_type, 'torch.optim.lr_scheduler.CosineAnnealingLR');
assert.deepEqual(prodigyPayload.optimizer_args, [
  'decouple=True',
  'weight_decay=0.02',
  'use_bias_correction=True',
  'd_coef=3.5',
  'd0=1e-6',
  'extra_flag=True',
]);
assert.equal(prodigyPayload.attention_backend, 'auto');

const lycorisConfig = {
  ...createDefaultConfig('sdxl-lora'),
  network_module: 'lycoris.kohya',
  lycoris_algo: 'lokr',
  conv_dim: 8,
  conv_alpha: 4,
  lokr_factor: 2,
  network_args_custom: 'custom_arg=True',
  enable_base_weight: true,
  base_weights: 'a.safetensors\nb.safetensors',
  base_weights_multiplier: '0.25\n0.75',
};
const lycorisPayload = buildRunConfig(lycorisConfig, 'sdxl-lora');
assert.ok(lycorisPayload.network_args.includes('algo=lokr'));
assert.ok(lycorisPayload.network_args.includes('conv_dim=8'));
assert.ok(lycorisPayload.network_args.includes('factor=2'));
assert.ok(lycorisPayload.network_args.includes('custom_arg=True'));
assert.equal(lycorisPayload.lycoris_algo, 'lokr');
assert.equal(lycorisPayload.lycoris_conv_dim, 8);
assert.equal(lycorisPayload.lycoris_conv_alpha, 4);
assert.equal(lycorisPayload.lycoris_lokr_factor, 2);
assert.equal(lycorisPayload.base_weights, undefined);
assert.equal(lycorisPayload.base_weights_multiplier, undefined);
assert.equal('network_args_custom' in lycorisPayload, false);

const lycorisFullConfig = {
  ...createDefaultConfig('sdxl-lora'),
  network_module: 'lycoris.kohya',
  lycoris_algo: 'full',
  dropout: 0.15,
};
const lycorisFullPayload = buildRunConfig(lycorisFullConfig, 'sdxl-lora');
assert.equal(lycorisFullPayload.lycoris_algo, 'full');
assert.equal(lycorisFullPayload.network_dropout, 0.15);
assert.ok(lycorisFullPayload.network_args.includes('algo=full'));
assert.ok(lycorisFullPayload.network_args.includes('dropout=0.15'));

const oftPayload = buildRunConfig({
  ...createDefaultConfig('sdxl-lora'),
  network_module: 'networks.oft',
}, 'sdxl-lora');
assert.equal(oftPayload.network_module, 'lycoris.kohya');
assert.equal(oftPayload.lycoris_algo, 'diag-oft');
assert.ok(oftPayload.network_args.includes('algo=diag-oft'));

const lycorisAliasPayload = buildRunConfig({
  ...createDefaultConfig('sdxl-lora'),
  network_module: 'lycoris',
  lycoris_algo: 'loha',
  dropout: 0.1,
}, 'sdxl-lora');
assert.equal(lycorisAliasPayload.network_module, 'lycoris.kohya');
assert.equal(lycorisAliasPayload.lycoris_algo, 'loha');
assert.ok(lycorisAliasPayload.network_args.includes('algo=loha'));
assert.ok(lycorisAliasPayload.network_args.includes('dropout=0.1'));

const animaPayload = buildRunConfig({
  ...createDefaultConfig('anima-lora'),
  lora_type: 'diag-oft',
}, 'anima-lora');
assert.equal(animaPayload.lora_type, 'diag-oft');

const newbiePayload = buildRunConfig({
  ...createDefaultConfig('newbie-lora'),
  adapter_type: 'full',
}, 'newbie-lora');
assert.equal(newbiePayload.adapter_type, 'full');

for (const [typeId, fieldKey] of [['anima-lora', 'lora_type'], ['newbie-lora', 'adapter_type']]) {
  const adapterOptions = getFieldDefinition(fieldKey, typeId)?.options || [];
  for (const adapter of ['lora', 'dora', 'lora_plus', 'rs_lora', 'lora_fa', 'vera', 'tlora', 'flexrank', 'hydralora', 'fera', 'locon', 'loha', 'lokr', 'ia3', 'full', 'diag-oft', 'oft']) {
    assert.ok(adapterOptions.includes(adapter), `${typeId} should expose adapter ${adapter}`);
  }
  for (const unsupported of ['eva', 'qlora', 'adalora', 'dylora', 'vb_lora', 'xlora', 'boft']) {
    assert.equal(adapterOptions.includes(unsupported), false, `${typeId} should not expose unsupported adapter ${unsupported}`);
  }
}

const sdxlNetworkOptions = (getFieldDefinition('network_module', 'sdxl-lora')?.options || [])
  .map((option) => typeof option === 'string' ? option : option.value);
for (const networkModule of ['networks.lora', 'networks.lora_fa', 'networks.vera', 'networks.tlora', 'networks.flexrank_lora', 'networks.oft', 'lycoris.kohya']) {
  assert.ok(sdxlNetworkOptions.includes(networkModule), `sdxl-lora should expose network module ${networkModule}`);
}
for (const unsupported of ['networks.dylora', 'networks.boft', 'networks.qlora']) {
  assert.equal(sdxlNetworkOptions.includes(unsupported), false, `sdxl-lora should not expose unsupported module ${unsupported}`);
}

const newbieOptimizerPayload = buildRunConfig({
  ...createDefaultConfig('newbie-lora'),
  optimizer_type: 'pytorch_optimizer.CAME',
  optimizer_args_custom: 'eps=1e-8',
  lr_scheduler: 'torch.optim.lr_scheduler.CosineAnnealingLR',
  lr_scheduler_args: 'T_max=10',
}, 'newbie-lora');
assert.equal(newbieOptimizerPayload.optimizer_type, 'PytorchOptimizer');
assert.deepEqual(newbieOptimizerPayload.optimizer_args, ['name=CAME', 'eps=1e-8']);
assert.equal(newbieOptimizerPayload.lr_scheduler, 'constant');
assert.equal(newbieOptimizerPayload.lr_scheduler_type, 'torch.optim.lr_scheduler.CosineAnnealingLR');
assert.deepEqual(newbieOptimizerPayload.lr_scheduler_args, ['T_max=10']);

const sdxlGenericOptimizerPayload = buildRunConfig({
  ...createDefaultConfig('sdxl-lora'),
  optimizer_type: 'bitsandbytes.optim.AdEMAMix8bit',
  optimizer_args_custom: 'min_8bit_size=4096',
}, 'sdxl-lora');
assert.equal(sdxlGenericOptimizerPayload.optimizer_type, 'GenericOptimizer');
assert.deepEqual(sdxlGenericOptimizerPayload.optimizer_args, [
  'name=bitsandbytes.optim.AdEMAMix8bit',
  'min_8bit_size=4096',
]);

for (const typeId of ['sdxl-lora', 'anima-lora', 'newbie-lora']) {
  const optimizerOptions = getFieldDefinition('optimizer_type', typeId)?.options || [];
  assert.ok(optimizerOptions.includes('Automagic++'), `${typeId} should expose Automagic++`);
  assert.ok(optimizerOptions.includes('AutoProdigy'), `${typeId} should expose AutoProdigy`);
  assert.ok(optimizerOptions.includes('KahanAdamW8bit'), `${typeId} should expose KahanAdamW8bit`);
  assert.ok(optimizerOptions.includes('GenericOptimizer'), `${typeId} should expose GenericOptimizer`);
  assert.ok(optimizerOptions.includes('AnimaFactoredAdamW'), `${typeId} should expose AnimaFactoredAdamW`);
  assert.ok(optimizerOptions.includes('bitsandbytes.optim.AdEMAMix8bit'), `${typeId} should expose bitsandbytes class path`);
}

for (const typeId of ['sdxl-lora', 'sd-lora', 'anima-lora', 'newbie-lora', 'flux-lora']) {
  const field = getFieldDefinition('acceleration_profile', typeId);
  assert.ok(field, `${typeId} should expose acceleration_profile`);
  assert.equal(field.defaultValue, 'off');
  const optionValues = (field.options || []).map((option) => typeof option === 'string' ? option : option.value);
  assert.deepEqual(optionValues, ['off', 'safe', 'balanced', 'aggressive', 'low_vram']);

  const payload = buildRunConfig({
    ...createDefaultConfig(typeId),
    acceleration_profile: typeId === 'flux-lora' ? 'balanced' : 'aggressive',
  }, typeId);
  assert.equal(payload.acceleration_profile, typeId === 'flux-lora' ? 'balanced' : 'aggressive');
}

const fluxOptimizerOptions = getFieldDefinition('optimizer_type', 'flux-lora')?.options || [];
assert.equal(fluxOptimizerOptions.includes('Automagic++'), false);
assert.equal(fluxOptimizerOptions.includes('AutoProdigy'), false);
assert.equal(fluxOptimizerOptions.includes('KahanAdamW8bit'), false);
assert.equal(fluxOptimizerOptions.includes('GenericOptimizer'), false);
assert.equal(fluxOptimizerOptions.includes('AnimaFactoredAdamW'), false);

const attentionConfig = {
  ...createDefaultConfig('hunyuan-image-lora'),
  attn_mode: 'flash',
  xformers: true,
  sageattn: true,
};
const attentionPayload = buildRunConfig(attentionConfig, 'hunyuan-image-lora');
assert.equal(attentionPayload.attention_backend, 'flash2');
assert.equal(attentionPayload.xformers, false);
assert.equal(attentionPayload.sageattn, false);

const lowVramAutotunePayload = buildRunConfig({
  ...createDefaultConfig('anima-lora'),
  low_vram_autotune_mode: 'conservative',
}, 'anima-lora');
assert.equal(lowVramAutotunePayload.low_vram_autotune_mode, 'conservative');

console.log('runConfigBuilderSmoke: ok');
