import { $, icon as _ico } from '../utils/dom.js';

const PICKER_TYPE_MAP = {
  'output-folder': 'folder',
  'output-model-file': 'model-file',
};

export function createPickerRuntimeController({ api, state, renderView, showToast, updateConfigValue }) {
  function showPickerOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'picker-overlay';
    overlay.id = 'picker-overlay';
    overlay.innerHTML = '<div class="picker-overlay-box">'
      + '<div class="picker-ol-icon">' + _ico('folder', 32) + '</div>'
      + '<div class="picker-ol-title">\u6587\u4ef6\u9009\u62e9\u5668\u5df2\u6253\u5f00</div>'
      + '<div class="picker-ol-hint">\u8bf7\u5728\u5f39\u51fa\u7684\u7cfb\u7edf\u5bf9\u8bdd\u6846\u4e2d\u9009\u62e9\u6587\u4ef6\u6216\u6587\u4ef6\u5939\u3002<br>'
      + '<strong style="color:var(--accent);">\u2b05 \u5982\u672a\u770b\u5230\u5bf9\u8bdd\u6846\uff0c\u8bf7\u70b9\u51fb\u4efb\u52a1\u680f\u4e2d\u95ea\u70c1\u7684\u7a97\u53e3</strong></div>'
      + '</div>';
    document.body.appendChild(overlay);

    window._pickerPrevTitle = document.title;
    document.title = '\u2b05 \u8bf7\u67e5\u770b\u4efb\u52a1\u680f\u7684\u6587\u4ef6\u9009\u62e9\u5668';

    let blurCount = 0;
    try { window.blur(); } catch (error) { /* ignore */ }
    window._pickerBlurTimer = setInterval(() => {
      try { window.blur(); } catch (error) { /* ignore */ }
      blurCount += 1;
      if (blurCount >= 8) clearInterval(window._pickerBlurTimer);
    }, 250);
  }

  function hidePickerOverlay() {
    if (window._pickerBlurTimer) {
      clearInterval(window._pickerBlurTimer);
      window._pickerBlurTimer = null;
    }
    const overlay = $('#picker-overlay');
    if (overlay) overlay.remove();

    document.title = window._pickerPrevTitle || 'SD-reScripts';
    delete window._pickerPrevTitle;
    try { window.focus(); } catch (error) { /* ignore */ }
  }

  function normalizePickerType(pickerType) {
    return PICKER_TYPE_MAP[pickerType] || pickerType;
  }

  async function pickPathForInput(inputId, pickerType) {
    showPickerOverlay();
    try {
      const response = await api.pickFile(normalizePickerType(pickerType));
      hidePickerOverlay();
      if (response.status !== 'success') {
        showToast(response.message || '选择路径失败。');
        return;
      }
      const input = $(`#${inputId}`);
      if (input) {
        input.value = response.data.path;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (error) {
      hidePickerOverlay();
      showToast(error.message || '选择路径失败。');
    }
  }

  async function pickPath(key, pickerType) {
    showPickerOverlay();
    try {
      const response = await api.pickFile(normalizePickerType(pickerType));
      hidePickerOverlay();
      if (response.status !== 'success') {
        showToast(response.message || '选择路径失败。');
        return;
      }
      updateConfigValue(key, response.data.path);
      if (state.activeModule === 'config') {
        renderView('config');
      }
    } catch (error) {
      hidePickerOverlay();
      showToast(error.message || '选择路径失败。');
    }
  }

  function bindGlobals(targetWindow) {
    targetWindow.pickPathForInput = pickPathForInput;
    targetWindow.pickPath = pickPath;
  }

  return {
    showPickerOverlay,
    hidePickerOverlay,
    pickPathForInput,
    pickPath,
    bindGlobals,
  };
}
