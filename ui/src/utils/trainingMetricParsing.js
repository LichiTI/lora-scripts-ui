// Training log parsing and metrics collection helpers.
// Pure functions only: no DOM, no state module access, no renderer imports.

/**
 * Create an empty metrics object for realtime collection or historical replay.
 */
export function createEmptyMetrics() {
  return {
    speeds: [],
    losses: [],
    epochs: [],
    startTime: null,
    lastStep: 0,
    totalSteps: 0,
    bTier: null,
    ghostReplay: null,
    memoryOptimization: null,
    sdxlLoraLowVramProfile: null,
    precisionSwapProfile: null,
    nativeUnet: null,
    peakVramDiagnostics: null,
    cudaCacheRelease: null,
    pcieDeltaCache: null,
    pcieCacheV0: null,
    pcieCacheV0Recommendation: null,
    vramSmartSensingRuntime: null,
    compileRuntime: null,
  };
}

function parsePcieDeltaCacheLine(line) {
  if (!line || !line.includes('PCIe Delta/Cache observe:')) return null;
  const familyPrefix = line.match(/(?:^|\s)(Anima|Newbie|Native SDXL)\s+PCIe Delta\/Cache observe:/);
  const payload = line.slice(line.indexOf('PCIe Delta/Cache observe:') + 'PCIe Delta/Cache observe:'.length).trim();
  const result = {
    label: familyPrefix ? familyPrefix[1] : '',
    raw: line.trim(),
  };
  payload.split(/\s+/).forEach(function(part) {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx);
    let value = part.slice(idx + 1).replace(/[,;]$/, '');
    if (value.endsWith('MB')) value = value.slice(0, -2);
    if (['candidates', 'high', 'medium', 'prefetch_missed', 'errors'].includes(key)) {
      result[key] = Number(value) || 0;
    } else if (['transfer', 'estimated_cache'].includes(key)) {
      result[key] = Number(value) || 0;
    } else {
      result[key] = value;
    }
  });
  if (!result.family && result.label) {
    result.family = String(result.label).toLowerCase().replace(/\s+/g, '_');
  }
  return result;
}

function parsePcieCacheV0Line(line) {
  if (!line || !line.includes('PCIe Cache v0:')) return null;
  const familyPrefix = line.match(/(?:^|\s)(Anima|Newbie|Native SDXL)\s+PCIe Cache v0:/);
  const payload = line.slice(line.indexOf('PCIe Cache v0:') + 'PCIe Cache v0:'.length).trim();
  const result = {
    label: familyPrefix ? familyPrefix[1] : '',
    raw: line.trim(),
  };
  payload.split(/\s+/).forEach(function(part) {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx);
    let value = part.slice(idx + 1).replace(/[,;]$/, '');
    if (value.endsWith('MB')) value = value.slice(0, -2);
    if (key === 'enabled') {
      result.enabled = value === 'True' || value === 'true' || value === '1';
    } else if (['selected', 'hits', 'misses', 'errors'].includes(key)) {
      result[key] = Number(value) || 0;
    } else if (['cache', 'budget'].includes(key)) {
      result[key] = Number(value) || 0;
    } else {
      result[key] = value;
    }
  });
  return result;
}

function parsePcieCacheV0RecommendationLine(line) {
  if (!line || !line.includes('PCIe Cache v0 recommendation:')) return null;
  const familyPrefix = line.match(/(?:^|\s)(Anima|Newbie|Native SDXL)\s+PCIe Cache v0 recommendation:/);
  const payload = line.slice(line.indexOf('PCIe Cache v0 recommendation:') + 'PCIe Cache v0 recommendation:'.length).trim();
  const result = {
    label: familyPrefix ? familyPrefix[1] : '',
    raw: line.trim(),
  };
  payload.split(/\s+/).forEach(function(part) {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx);
    let value = part.slice(idx + 1).replace(/[,;]$/, '');
    if (value.endsWith('MB')) value = value.slice(0, -2);
    if (key === 'budget') {
      result.suggested_budget_mb = Number(value) || 0;
    } else if (key === 'auto' || key === 'will_auto_enable') {
      result.will_auto_enable = value === 'True' || value === 'true' || value === '1';
    } else {
      result[key] = value;
    }
  });
  if (result.will_auto_enable == null) result.will_auto_enable = false;
  return result;
}

function applyPcieDeltaCacheProfile(metrics, profile, label) {
  if (!profile || typeof profile !== 'object') return;
  metrics.pcieDeltaCache = {
    label: label || profile.family || '',
    family: profile.family || '',
    mode: profile.mode || '',
    candidates: Number(profile.candidate_count || 0),
    high: Number(profile.high_value_count || 0),
    medium: Number(profile.medium_value_count || 0),
    transfer: Number(profile.total_transfer_mb || 0),
    estimated_cache: Number(profile.estimated_cache_mb || 0),
    prefetch_missed: Number(profile.prefetch_missed_total || 0),
    errors: Number(profile.error_count || 0),
    next: profile.next_action || '',
    raw: profile.summary_text || '',
  };
}

function applyPcieCacheV0Profile(metrics, profile, label) {
  if (!profile || typeof profile !== 'object') return;
  metrics.pcieCacheV0 = {
    label: label || profile.family || '',
    family: profile.family || '',
    enabled: !!profile.enabled,
    mode: profile.mode || '',
    selected: Number(profile.selected_count || 0),
    skipped: Number(profile.skipped_count || 0),
    cache: Number(profile.cache_mb || 0),
    budget: Number(profile.budget_mb || 0),
    hits: Number(profile.hit_count || 0),
    misses: Number(profile.miss_count || 0),
    errors: Number(profile.error_count || 0),
    reason: profile.reason || '',
    selectedRows: Array.isArray(profile.selected) ? profile.selected : [],
  };
}

function applyPcieCacheV0RecommendationProfile(metrics, profile, label) {
  if (!profile || typeof profile !== 'object') return;
  metrics.pcieCacheV0Recommendation = {
    label: label || profile.family || '',
    family: profile.family || '',
    decision: profile.decision || profile.action || '',
    reason: profile.reason || '',
    suggested_budget_mb: Number(profile.suggested_budget_mb || 0),
    will_auto_enable: !!profile.will_auto_enable,
    candidate_count: Number(profile.candidate_count || 0),
    high_value_count: Number(profile.high_value_count || 0),
    total_transfer_mb: Number(profile.total_transfer_mb || 0),
    prefetch_enabled: !!profile.prefetch_enabled,
    prefetch_missed: Number(profile.prefetch_missed || 0),
    profile_prefetch_missed: Number(profile.profile_prefetch_missed || 0),
    current_mode: profile.current_mode || '',
    raw: profile.summary_text || '',
  };
}

function appendLossPoint(metrics, now, curStep, curLoss) {
  const prevLoss = metrics.losses.length > 0 ? metrics.losses[metrics.losses.length - 1].loss : -1;
  if (curStep > metrics.lastStep || metrics.losses.length === 0 || Math.abs(curLoss - prevLoss) > 0.0001) {
    metrics.losses.push({ time: now, step: curStep, loss: curLoss });
    metrics.lastStep = Math.max(metrics.lastStep, curStep);
  }
}

function applyProgressJson(metrics, data, now) {
  if (!data || typeof data !== 'object') return false;
  const curStep = Number(data.step || 0) || 0;
  const totalSteps = Number(data.total_steps || 0) || 0;
  const curEpoch = Number(data.epoch || 0) || 0;
  const totalEpochs = Number(data.total_epochs || 0) || 0;
  const curLoss = Number(data.loss);

  if (curStep > 0) {
    metrics.lastStep = Math.max(metrics.lastStep, curStep);
  }
  if (totalSteps > 0) {
    metrics.totalSteps = totalSteps;
  }
  if (Number.isFinite(curLoss)) {
    appendLossPoint(metrics, now, curStep || metrics.lastStep, curLoss);
  }
  if (curEpoch > 0) {
    const prevEpoch = metrics.epochs.length > 0 ? metrics.epochs[metrics.epochs.length - 1] : null;
    if (!prevEpoch || prevEpoch.epoch < curEpoch || prevEpoch.total !== totalEpochs) {
      metrics.epochs.push({ epoch: curEpoch, total: totalEpochs || (prevEpoch ? prevEpoch.total : 0) });
    }
  }
  if (data.b_tier && typeof data.b_tier === 'object') {
    metrics.bTier = data.b_tier;
    if (data.b_tier.ghost_replay && typeof data.b_tier.ghost_replay === 'object') {
      metrics.ghostReplay = data.b_tier.ghost_replay;
    }
  }
  if (data.memory_optimization && typeof data.memory_optimization === 'object') {
    metrics.memoryOptimization = data.memory_optimization;
    if (data.memory_optimization.precision_swap_profile && typeof data.memory_optimization.precision_swap_profile === 'object') {
      metrics.precisionSwapProfile = data.memory_optimization.precision_swap_profile;
    }
  }
  if (data.sdxl_lora_low_vram_profile && typeof data.sdxl_lora_low_vram_profile === 'object') {
    metrics.sdxlLoraLowVramProfile = data.sdxl_lora_low_vram_profile;
  }
  if (data.native_unet && typeof data.native_unet === 'object') {
    metrics.nativeUnet = data.native_unet;
    const residency = data.native_unet.weight_residency;
    if (residency && residency.pcie_delta_cache) {
      applyPcieDeltaCacheProfile(metrics, residency.pcie_delta_cache, 'Native SDXL');
    }
    if (residency && residency.pcie_cache_v0) {
      applyPcieCacheV0Profile(metrics, residency.pcie_cache_v0, 'Native SDXL');
    }
    if (residency && residency.pcie_cache_v0_recommendation) {
      applyPcieCacheV0RecommendationProfile(metrics, residency.pcie_cache_v0_recommendation, 'Native SDXL');
    }
  }
  if (data.anima_block_residency && typeof data.anima_block_residency === 'object') {
    const profile = data.anima_block_residency.pcie_delta_cache;
    if (profile) applyPcieDeltaCacheProfile(metrics, profile, 'Anima');
    if (data.anima_block_residency.pcie_cache_v0) {
      applyPcieCacheV0Profile(metrics, data.anima_block_residency.pcie_cache_v0, 'Anima');
    }
    if (data.anima_block_residency.pcie_cache_v0_recommendation) {
      applyPcieCacheV0RecommendationProfile(metrics, data.anima_block_residency.pcie_cache_v0_recommendation, 'Anima');
    }
  }
  if (data.newbie_block_residency && typeof data.newbie_block_residency === 'object') {
    const profile = data.newbie_block_residency.pcie_delta_cache;
    if (profile) applyPcieDeltaCacheProfile(metrics, profile, 'Newbie');
    if (data.newbie_block_residency.pcie_cache_v0) {
      applyPcieCacheV0Profile(metrics, data.newbie_block_residency.pcie_cache_v0, 'Newbie');
    }
    if (data.newbie_block_residency.pcie_cache_v0_recommendation) {
      applyPcieCacheV0RecommendationProfile(metrics, data.newbie_block_residency.pcie_cache_v0_recommendation, 'Newbie');
    }
  }
  if (data.peak_vram_diagnostics && typeof data.peak_vram_diagnostics === 'object') {
    metrics.peakVramDiagnostics = data.peak_vram_diagnostics;
  }
  if (data.cuda_cache_release && typeof data.cuda_cache_release === 'object') {
    metrics.cudaCacheRelease = data.cuda_cache_release;
  }
  if (data.vram_smart_sensing_runtime && typeof data.vram_smart_sensing_runtime === 'object') {
    metrics.vramSmartSensingRuntime = data.vram_smart_sensing_runtime;
  }
  if (data.compile_runtime && typeof data.compile_runtime === 'object') {
    metrics.compileRuntime = data.compile_runtime;
  }
  return true;
}

/**
 * Collect metrics from the incremental log lines of one polling round.
 * Mutates the supplied metrics object in place.
 */
export function collectTrainingMetrics(metrics, lines) {
  const m = metrics;
  if (!m.startTime) m.startTime = Date.now();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const now = Date.now();
    if (line.includes('PROGRESS_JSON:')) {
      try {
        const marker = 'PROGRESS_JSON:';
        const data = JSON.parse(line.slice(line.indexOf(marker) + marker.length).trim());
        if (applyProgressJson(m, data, now)) {
          continue;
        }
      } catch (_err) {
        // Fallback to legacy regex parsing below.
      }
    }
    const pcieDeltaCache = parsePcieDeltaCacheLine(line);
    if (pcieDeltaCache) {
      m.pcieDeltaCache = pcieDeltaCache;
      continue;
    }
    const pcieCacheV0 = parsePcieCacheV0Line(line);
    if (pcieCacheV0) {
      m.pcieCacheV0 = pcieCacheV0;
      continue;
    }
    const pcieCacheV0Recommendation = parsePcieCacheV0RecommendationLine(line);
    if (pcieCacheV0Recommendation) {
      m.pcieCacheV0Recommendation = pcieCacheV0Recommendation;
      continue;
    }
    const speedMatch = line.match(/(\d+\.?\d*)\s*(it\/s|s\/it)/);
    const lossMatch = line.match(/avr_loss[=:]\s*(\d+\.?\d*)/);
    const stepMatch = line.match(/\|\s*(\d+)\/(\d+)\s*\[/);
    if (speedMatch) {
      let itPerSec = parseFloat(speedMatch[1]);
      if (speedMatch[2] === 's/it') itPerSec = itPerSec > 0 ? 1 / itPerSec : 0;
      m.speeds.push({ time: now, itPerSec });
    }
    if (lossMatch) {
      const curLoss = parseFloat(lossMatch[1]);
      const curStep = stepMatch ? parseInt(stepMatch[1]) : m.lastStep;
      appendLossPoint(m, now, curStep, curLoss);
    }
    if (stepMatch) {
      m.totalSteps = parseInt(stepMatch[2]);
      m.lastStep = Math.max(m.lastStep, parseInt(stepMatch[1]));
    }
    const ep = lines[i].match(/epoch\s+(\d+)\/(\d+)/);
    if (ep) {
      const cur = parseInt(ep[1]);
      const tot = parseInt(ep[2]);
      if (!m.epochs.length || m.epochs[m.epochs.length - 1].epoch < cur) {
        m.epochs.push({ epoch: cur, total: tot });
      }
    }
  }
}

/**
 * Parse full task logs into a metrics object for historical replay.
 */
export function parseLinesIntoMetrics(lines) {
  const m = createEmptyMetrics();
  let prevStep = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('PROGRESS_JSON:')) {
      try {
        const marker = 'PROGRESS_JSON:';
        const data = JSON.parse(line.slice(line.indexOf(marker) + marker.length).trim());
        if (applyProgressJson(m, data, 0)) {
          prevStep = m.lastStep;
          continue;
        }
      } catch (_err) {
        // Ignore and continue with regex fallback.
      }
    }
    const pcieDeltaCache = parsePcieDeltaCacheLine(line);
    if (pcieDeltaCache) {
      m.pcieDeltaCache = pcieDeltaCache;
      continue;
    }
    const pcieCacheV0 = parsePcieCacheV0Line(line);
    if (pcieCacheV0) {
      m.pcieCacheV0 = pcieCacheV0;
      continue;
    }
    const pcieCacheV0Recommendation = parsePcieCacheV0RecommendationLine(line);
    if (pcieCacheV0Recommendation) {
      m.pcieCacheV0Recommendation = pcieCacheV0Recommendation;
      continue;
    }
    const speedMatch = line.match(/(\d+\.?\d*)\s*(it\/s|s\/it)/);
    const lossMatch = line.match(/avr_loss[=:]\s*(\d+\.?\d*)/);
    const stepMatch = line.match(/\|\s*(\d+)\/(\d+)\s*\[/);
    if (speedMatch) {
      let itPerSec = parseFloat(speedMatch[1]);
      if (speedMatch[2] === 's/it') itPerSec = itPerSec > 0 ? 1 / itPerSec : 0;
      m.speeds.push({ time: 0, itPerSec });
    }
    if (lossMatch) {
      const curLoss = parseFloat(lossMatch[1]);
      const curStep = stepMatch ? parseInt(stepMatch[1]) : prevStep;
      appendLossPoint(m, 0, curStep, curLoss);
      prevStep = m.lastStep;
    }
    if (stepMatch) {
      m.totalSteps = parseInt(stepMatch[2]);
      prevStep = Math.max(prevStep, parseInt(stepMatch[1]));
      m.lastStep = prevStep;
    }
    const ep = line.match(/epoch\s+(\d+)\/(\d+)/);
    if (ep) {
      const cur = parseInt(ep[1]);
      const tot = parseInt(ep[2]);
      if (!m.epochs.length || m.epochs[m.epochs.length - 1].epoch < cur) {
        m.epochs.push({ epoch: cur, total: tot });
      }
    }
  }
  return m;
}
