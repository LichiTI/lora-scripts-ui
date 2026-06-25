/**
 * Model Architecture Detection Module
 *
 * Automatically detects model architecture (Anima/SDXL/FLUX/SD15/SD3) from safetensors files
 * and warns users if they selected a model that doesn't match the current training page.
 */

// State
let pendingDetection = null;
let detectionCache = new Map();

/**
 * Detect model architecture from safetensors file
 * @param {string} modelPath - Path to .safetensors file
 * @returns {Promise<{arch: string, displayName: string, confidence: string} | null>}
 */
export async function detectModelArchitecture(modelPath) {
  if (!modelPath || !modelPath.trim()) {
    return null;
  }

  // Check cache
  if (detectionCache.has(modelPath)) {
    return detectionCache.get(modelPath);
  }

  try {
    const response = await fetch('/api/detect_model_arch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_path: modelPath })
    });

    const result = await response.json();

    if (result.success && result.data) {
      const detection = {
        arch: result.data.detected_arch,
        displayName: result.data.display_name,
        confidence: result.data.confidence
      };

      // Cache result
      detectionCache.set(modelPath, detection);

      return detection;
    }

    return null;
  } catch (error) {
    console.error('Model architecture detection failed:', error);
    return null;
  }
}

/**
 * Get current training page type from URL or state
 * @returns {'anima' | 'sdxl' | 'flux' | 'sd15' | 'sd3' | null}
 */
function getCurrentPageArch() {
  // Check URL hash
  const hash = window.location.hash;
  if (hash.includes('anima')) return 'anima';
  if (hash.includes('sdxl')) return 'sdxl';
  if (hash.includes('flux')) return 'flux';

  // Check global state if available
  if (window.currentTrainingType) {
    const type = String(window.currentTrainingType).toLowerCase();
    if (type.includes('anima')) return 'anima';
    if (type.includes('sdxl')) return 'sdxl';
    if (type.includes('flux')) return 'flux';
    if (type.includes('sd15') || type.includes('sd1.5')) return 'sd15';
    if (type.includes('sd3')) return 'sd3';
  }

  return null;
}

/**
 * Get display name for architecture
 */
function getArchDisplayName(arch) {
  const names = {
    'anima': 'Anima',
    'sdxl': 'SDXL',
    'flux': 'FLUX',
    'sd15': 'SD 1.5',
    'sd3': 'SD3',
    'unknown': '未知'
  };
  return names[arch] || '未知';
}

/**
 * Show architecture mismatch dialog
 * @param {string} detectedArch - Detected architecture
 * @param {string} currentArch - Current page architecture
 * @param {string} modelPath - Model file path
 * @returns {Promise<'switch' | 'continue'>}
 */
function showArchMismatchDialog(detectedArch, currentArch, modelPath) {
  return new Promise((resolve) => {
    const detectedName = getArchDisplayName(detectedArch);
    const currentName = getArchDisplayName(currentArch);

    // Create dialog HTML
    const dialog = document.createElement('div');
    dialog.className = 'arch-mismatch-dialog-overlay';
    dialog.innerHTML = `
      <div class="arch-mismatch-dialog">
        <div class="dialog-header">
          <svg class="icon-warning" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <h3>模型架构不匹配</h3>
        </div>

        <div class="dialog-body">
          <p class="dialog-message">
            检测到您选择的模型是 <strong>${detectedName}</strong> 架构，
            但当前在 <strong>${currentName}</strong> 训练页面
          </p>

          <div class="dialog-model-path">
            <div class="model-path-label">模型路径</div>
            <div class="model-path-value" title="${modelPath}">${modelPath}</div>
          </div>

          <div class="dialog-hint">
            <svg class="icon-info" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" stroke-width="2"/>
              <path d="M12 16v-4m0-4h.01" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <span>${detectedName} 模型需要使用 ${detectedName} 训练页，继续使用可能导致训练失败</span>
          </div>
        </div>

        <div class="dialog-footer">
          <button class="btn-continue" type="button">坚持使用</button>
          <button class="btn-switch" type="button">切换到 ${detectedName} 页面</button>
        </div>
      </div>
    `;

    // Event listeners
    const btnContinue = dialog.querySelector('.btn-continue');
    const btnSwitch = dialog.querySelector('.btn-switch');

    const cleanup = () => {
      dialog.remove();
    };

    btnContinue.addEventListener('click', () => {
      cleanup();
      resolve('continue');
    });

    btnSwitch.addEventListener('click', () => {
      cleanup();
      resolve('switch');
    });

    // Close on overlay click
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        cleanup();
        resolve('continue');
      }
    });

    document.body.appendChild(dialog);
  });
}

/**
 * Validate model selection and show warning if needed
 * @param {string} modelPath - Selected model path
 * @param {string} fieldKey - Field key (e.g., 'pretrained_model_name_or_path')
 * @returns {Promise<boolean>} - true if validation passed or user confirmed
 */
export async function validateModelSelection(modelPath, fieldKey) {
  // Skip validation if not a model path field
  if (!fieldKey || !fieldKey.includes('model') && !fieldKey.includes('path')) {
    return true;
  }

  // Skip if path is empty
  if (!modelPath || !modelPath.trim()) {
    return true;
  }

  // Skip if not a safetensors file
  if (!modelPath.toLowerCase().endsWith('.safetensors')) {
    return true;
  }

  const currentArch = getCurrentPageArch();
  if (!currentArch) {
    // Can't determine current page, skip validation
    return true;
  }

  // Cancel pending detection if exists
  if (pendingDetection) {
    clearTimeout(pendingDetection.timeout);
  }

  // Debounce detection (wait 500ms after user stops typing)
  return new Promise((resolve) => {
    pendingDetection = {
      timeout: setTimeout(async () => {
        pendingDetection = null;

        const detection = await detectModelArchitecture(modelPath);

        if (!detection || detection.arch === 'unknown') {
          // Unknown architecture, allow
          resolve(true);
          return;
        }

        if (detection.arch !== currentArch) {
          // Mismatch detected, show dialog
          const action = await showArchMismatchDialog(
            detection.arch,
            currentArch,
            modelPath
          );

          if (action === 'switch') {
            // User wants to switch page
            switchToArchPage(detection.arch);
            resolve(false);
          } else {
            // User wants to continue anyway
            showWarningIndicator(fieldKey);
            resolve(true);
          }
        } else {
          // Match, clear any existing warning
          clearWarningIndicator(fieldKey);
          resolve(true);
        }
      }, 500)
    };
  });
}

/**
 * Switch to the correct training page
 * @param {string} targetArch - Target architecture
 */
function switchToArchPage(targetArch) {
  // Save current config to session storage for migration
  if (window.getCurrentConfig && window.setCurrentConfig) {
    const currentConfig = window.getCurrentConfig();
    sessionStorage.setItem('migrated_training_config', JSON.stringify(currentConfig));
  }

  // Navigate to target page
  const routes = {
    'anima': '#/training/anima',
    'sdxl': '#/training/sdxl',
    'flux': '#/training/flux',
    'sd15': '#/training/sd15',
    'sd3': '#/training/sd3'
  };

  const targetRoute = routes[targetArch];
  if (targetRoute) {
    window.location.hash = targetRoute;
    window.location.reload();
  }
}

/**
 * Show warning indicator next to field
 * @param {string} fieldKey - Field key
 */
function showWarningIndicator(fieldKey) {
  const fieldGroup = document.querySelector(`[data-field-key="${fieldKey}"]`);
  if (!fieldGroup) return;

  // Remove existing warning
  const existing = fieldGroup.querySelector('.arch-warning-indicator');
  if (existing) existing.remove();

  // Add warning indicator
  const warning = document.createElement('div');
  warning.className = 'arch-warning-indicator';
  warning.innerHTML = `
    <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-width="2" stroke-linecap="round"/>
    </svg>
    <span>模型架构可能不匹配</span>
  `;

  const inputPicker = fieldGroup.querySelector('.input-picker');
  if (inputPicker) {
    inputPicker.parentNode.insertBefore(warning, inputPicker.nextSibling);
  }
}

/**
 * Clear warning indicator
 * @param {string} fieldKey - Field key
 */
function clearWarningIndicator(fieldKey) {
  const fieldGroup = document.querySelector(`[data-field-key="${fieldKey}"]`);
  if (!fieldGroup) return;

  const warning = fieldGroup.querySelector('.arch-warning-indicator');
  if (warning) {
    warning.remove();
  }
}

/**
 * Clear detection cache (useful for testing)
 */
export function clearDetectionCache() {
  detectionCache.clear();
}
