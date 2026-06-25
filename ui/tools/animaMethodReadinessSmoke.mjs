import assert from 'node:assert/strict';
import {
  getAnimaMethodReadiness,
  getGuideOnlyMethodIds,
  getVisibleTrainingToggleIds,
  getWiredReserveMethodIds,
  listAnimaMethodReadiness,
  shouldExposeAsTrainingToggle,
} from '../src/features/animaMethodReadiness.js';
import { TRAINING_TYPES } from '../src/trainingTypeRegistry.js';

const registeredTrainingTypes = new Set(TRAINING_TYPES.map((item) => item.id));
const visibleToggleIds = getVisibleTrainingToggleIds();
const guideOnlyIds = getGuideOnlyMethodIds();
const wiredReserveIds = getWiredReserveMethodIds();

assert.ok(listAnimaMethodReadiness().length >= 12);

for (const id of visibleToggleIds) {
  const readiness = getAnimaMethodReadiness(id);
  assert.ok(readiness, `missing readiness for ${id}`);
  assert.equal(readiness.trainingLaunchAllowed, true, `${id} must be launchable if visible`);
  assert.equal(readiness.runtimeActivationEnabled, true, `${id} must have runtime activation if visible`);
  assert.equal(readiness.requestFieldsEmitted, true, `${id} must emit request fields if visible`);
  assert.equal(registeredTrainingTypes.has(id), true, `${id} must be a registered training type`);
}

for (const id of guideOnlyIds) {
  const readiness = getAnimaMethodReadiness(id);
  assert.ok(readiness, `missing guide-only readiness for ${id}`);
  assert.equal(readiness.visibleTrainingToggleAllowed, false, `${id} must not expose a training toggle`);
  assert.equal(registeredTrainingTypes.has(id), false, `${id} must not be registered as a training type`);
}

for (const id of [
  'cns_sampling',
  'spectrum_probe',
  'smoothcache_probe',
  'tgate_probe',
  'easycontrol_v2',
  'step_expert_routing',
  'chimera_hydra',
  'soft_tokens',
  'modulation_guidance',
  'dp_dmd_turbo',
  'spd_inference',
  'pid_decoder_backend',
  'adapter_target_policy',
  'fg_lora_rank_policy',
  'tlora',
  'dit_blockskip',
]) {
  assert.equal(shouldExposeAsTrainingToggle(id), false, `${id} should stay guide-only`);
}

assert.equal(shouldExposeAsTrainingToggle('lab-distiller'), true);
assert.equal(shouldExposeAsTrainingToggle('sdxl-turbo-lora'), true);
assert.equal(shouldExposeAsTrainingToggle('anima-few-step-lora'), true);
assert.equal(shouldExposeAsTrainingToggle('newbie-few-step-lora'), true);

const pid = getAnimaMethodReadiness('pid_decoder_backend');
assert.equal(pid.requestFieldsEmitted, false);
assert.equal(pid.runtimeActivationEnabled, false);
assert.equal(pid.reserveSeamWired, true);
assert.match(pid.reason, /opt-in/i);

// Wired reserves (blocks 3-4: EasyControl v2 / P3 adapters / P4 / P5) must surface
// as opt-in guide entries while every launch gate stays closed until operator sign-off.
const expectedWiredReserves = [
  'easycontrol_v2',
  'step_expert_routing',
  'chimera_hydra',
  'soft_tokens',
  'modulation_guidance',
  'dp_dmd_turbo',
  'spd_inference',
  'pid_decoder_backend',
];
for (const id of expectedWiredReserves) {
  assert.ok(wiredReserveIds.includes(id), `${id} should be a wired reserve`);
}
for (const id of wiredReserveIds) {
  const readiness = getAnimaMethodReadiness(id);
  assert.ok(readiness, `missing wired-reserve readiness for ${id}`);
  assert.equal(readiness.reserveSeamWired, true, `${id} must be flagged reserveSeamWired`);
  assert.ok(readiness.reserveSeamModule, `${id} must name its reserve seam module`);
  assert.equal(readiness.visibleTrainingToggleAllowed, false, `${id} reserve must stay guide-only`);
  assert.equal(readiness.trainingLaunchAllowed, false, `${id} reserve must not be launchable without operator sign-off`);
  assert.equal(readiness.runtimeActivationEnabled, false, `${id} reserve runtime-activation must stay off`);
  assert.equal(shouldExposeAsTrainingToggle(id), false, `${id} reserve must not be a training toggle`);
}

console.log('animaMethodReadinessSmoke: ok');
