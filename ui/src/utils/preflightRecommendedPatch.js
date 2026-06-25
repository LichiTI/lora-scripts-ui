// utils/preflightRecommendedPatch.js - collect report-only config patches from preflight payloads

function objectPatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

export function cleanRecommendedConfigPatch(patch) {
  const clean = {};
  Object.entries(objectPatch(patch)).forEach(([key, value]) => {
    if (!key || key.startsWith('__') || value === undefined) return;
    clean[key] = value;
  });
  return clean;
}

function collectRecommendedActionPatch(preflight) {
  const pf = objectPatch(preflight);
  const actions = [];
  if (Array.isArray(pf.repair_actions)) actions.push(...pf.repair_actions);
  if (Array.isArray(pf.repair_plan?.repair_actions)) actions.push(...pf.repair_plan.repair_actions);

  const patch = {};
  actions.forEach((action) => {
    if (!action || action.code !== 'preflight.apply_recommended_config_patch') return;
    Object.assign(patch, objectPatch(action.config_override_patch));
  });
  return cleanRecommendedConfigPatch(patch);
}

export function collectAdvisorRecommendedConfigPatch(preflight) {
  const advisor = objectPatch(objectPatch(preflight).training_advisor);
  const vramPatch = objectPatch(objectPatch(advisor.vram).recommended_config_patch);
  const aTierPatch = objectPatch(objectPatch(advisor.a_tier).recommended_config_patch);
  return cleanRecommendedConfigPatch({ ...vramPatch, ...aTierPatch });
}

export function collectBackendRecommendedConfigPatch(preflight) {
  const pf = objectPatch(preflight);
  const topLevelPatch = objectPatch(pf.recommended_config_patch);
  const actionPatch = collectRecommendedActionPatch(pf);
  return cleanRecommendedConfigPatch({ ...topLevelPatch, ...actionPatch });
}

export function collectPreflightRecommendedConfigPatch(preflight) {
  return cleanRecommendedConfigPatch({
    ...collectAdvisorRecommendedConfigPatch(preflight),
    ...collectBackendRecommendedConfigPatch(preflight),
  });
}

export function recommendedConfigPatchKeys(patch) {
  return Object.keys(cleanRecommendedConfigPatch(patch));
}
