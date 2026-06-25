const ATTENTION_ALIASES = {
  '': 'auto',
  default: 'auto',
  auto: 'auto',
  torch: 'torch',
  native: 'torch',
  sdpa: 'sdpa',
  xformers: 'xformers',
  flash: 'flash2',
  flash2: 'flash2',
  flashattn: 'flash2',
  flashattention: 'flash2',
  flashattention2: 'flash2',
  fa2: 'flash2',
  sage: 'sageattn',
  sageattn: 'sageattn',
  sageattention: 'sageattn',
  sageattention2: 'sageattn',
  flex: 'flexattn',
  flexattn: 'flexattn',
  flexattention: 'flexattn',
  sparge: 'spargeattn2',
  spargeattn: 'spargeattn2',
  spargeattn2: 'spargeattn2',
};

const ATTENTION_LABELS = {
  auto: '自动（按当前运行时解析）',
  torch: 'Torch',
  sdpa: 'SDPA',
  xformers: 'xFormers',
  flash2: 'FlashAttention 2',
  sageattn: 'SageAttention',
  flexattn: 'FlexAttention',
  spargeattn2: 'Sparse GEMM Attention 2',
};

export function normalizeAttentionBackend(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return ATTENTION_ALIASES[key] || key || 'auto';
}

function profileId(value) {
  return String(value || '').trim().toLowerCase() || 'standard';
}

export function getCurrentExecutionProfileId(config = {}) {
  const runtime = config.runtime && typeof config.runtime === 'object' ? config.runtime : null;
  const runtimeInfo = runtime?.runtime && typeof runtime.runtime === 'object' ? runtime.runtime : null;
  return profileId(
    config.execution_profile_id
    || config.runtime_id
    || config.native_runtime_profile
    || runtimeInfo?.runtime_id
    || runtimeInfo?.environment
    || runtime?.runtime_id
    || runtime?.environment
    || 'standard'
  );
}

export function findExecutionProfile(profiles, config = {}) {
  const wanted = getCurrentExecutionProfileId(config);
  const list = Array.isArray(profiles) ? profiles : [];
  return list.find((profile) => profileId(profile?.id) === wanted)
    || list.find((profile) => profileId(profile?.id) === 'standard')
    || null;
}

export function buildAttentionCapability(profiles, config = {}) {
  const profile = findExecutionProfile(profiles, config);
  const supported = new Set((profile?.supported_attention_backends || []).map(normalizeAttentionBackend));
  const available = new Set((profile?.available_attention_backends || []).map(normalizeAttentionBackend));
  for (const backend of ['auto', 'sdpa', 'torch']) {
    supported.add(backend);
    available.add(backend);
  }
  return {
    profile,
    profileId: profileId(profile?.id || getCurrentExecutionProfileId(config)),
    supported,
    available,
  };
}

export function isAttentionBackendAvailable(backend, profiles, config = {}) {
  const normalized = normalizeAttentionBackend(backend);
  if (normalized === 'auto') return true;
  if (!Array.isArray(profiles) || profiles.length === 0) return true;
  const capability = buildAttentionCapability(profiles, config);
  return capability.supported.has(normalized) && capability.available.has(normalized);
}

export function makeAttentionOptions(values, profiles, config = {}) {
  const capability = buildAttentionCapability(profiles, config);
  return (Array.isArray(values) ? values : []).map((item) => {
    const option = item && typeof item === 'object' ? { ...item } : { value: item, label: item || '自动' };
    const normalized = normalizeAttentionBackend(option.value);
    const value = option.value ?? '';
    const label = option.label || ATTENTION_LABELS[normalized] || String(value || '自动');
    const unavailable = Array.isArray(profiles) && profiles.length > 0 && normalized !== 'auto'
      && (!capability.supported.has(normalized) || !capability.available.has(normalized));
    return {
      ...option,
      value,
      label: unavailable ? `${label}（当前运行时不可用）` : label,
      disabled: Boolean(option.disabled || unavailable),
      disabledReason: unavailable
        ? `当前 ${capability.profileId} 运行时未提供 ${ATTENTION_LABELS[normalized] || normalized}`
        : option.disabledReason,
    };
  });
}
