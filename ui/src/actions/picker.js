// actions/picker.js — 原生文件选择器 + 内置 picker actions
//   _showPickerOverlay / _hidePickerOverlay
//   pickPath / pickPathForInput
//   openNativePicker / closeBuiltinPicker / refreshBuiltinPicker /
//   selectBuiltinPickerItem / openBuiltinPickerForInput
//   setupNativePicker
//
// 依赖（工厂注入）：state, api, showToast, renderView, renderBuiltinPickerModal
// 注：各选择完成后调用 window.updateConfigValue（由 config actions 挂上去）。

import { $, _ico } from '../utils/dom.js';

export function createPickerActions({ state, api, showToast, renderView, renderBuiltinPickerModal }) {
  /* ---- Picker overlay helpers ---- */
  function _showPickerOverlay() {
    var ol = document.createElement('div');
    ol.className = 'picker-overlay';
    ol.id = 'picker-overlay';
    ol.innerHTML = '<div class="picker-overlay-box">'
      + '<div class="picker-ol-icon">' + _ico('folder', 32) + '</div>'
   + '<div class="picker-ol-title">\u6587\u4ef6\u9009\u62e9\u5668\u5df2\u6253\u5f00</div>'
      + '<div class="picker-ol-hint">\u8bf7\u5728\u5f39\u51fa\u7684\u7cfb\u7edf\u5bf9\u8bdd\u6846\u4e2d\u9009\u62e9\u6587\u4ef6\u6216\u6587\u4ef6\u5939\u3002<br>'
      + '<strong style="color:var(--accent);">\u2b05 \u5982\u672a\u770b\u5230\u5bf9\u8bdd\u6846\uff0c\u8bf7\u70b9\u51fb\u4efb\u52a1\u680f\u4e2d\u95ea\u70c1\u7684\u7a97\u53e3</strong></div>'
      + '</div>';
    document.body.appendChild(ol);
    // Saveoriginal title & change to taskbar hint
    window._pickerPrevTitle = document.title;
    document.title = '\u2b05 \u8bf7\u67e5\u770b\u4efb\u52a1\u680f\u7684\u6587\u4ef6\u9009\u62e9\u5668';
    // Repeatedly blur for ~2s to cover dialog spawn delay
    var n = 0;
    try { window.blur(); } catch(_e) {}
    window._pickerBlurTimer = setInterval(function() {
      try { window.blur(); } catch(_e) {}
      if (++n >= 8) clearInterval(window._pickerBlurTimer);
    }, 250);
  }

  function _hidePickerOverlay() {
    if (window._pickerBlurTimer) {
      clearInterval(window._pickerBlurTimer);
      window._pickerBlurTimer = null;
    }
    var ol = $('#picker-overlay');
    if (ol)ol.remove();
    // Restore title & re-focus browser
    document.title = window._pickerPrevTitle || 'SD-reScripts';
    delete window._pickerPrevTitle;
    try { window.focus(); } catch(_e) {}
  }

  async function pickPathForInput(inputId, pickerType) {
    _showPickerOverlay();
    try {
    // 后端 pick_file 只支持 folder / model-file / text-file
      // 将 schema 中的扩展 pickerType 映射回后端支持的类型
      const pickerMap = {
        'output-folder': 'folder',
        'output-model-file': 'model-file',
      };
      pickerType = pickerMap[pickerType] || pickerType;

      const response = await api.pickFile(pickerType, inputId);
      _hidePickerOverlay();
      if (response.status !== 'success') {
        showToast(response.message || '选择路径失败。');
        return;
      }
      if (!response?.data?.path) {
        return;
      }
      const input = $(`#${inputId}`);
      if (input) {
        input.value = response.data.path;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (error) {
      _hidePickerOverlay();
      showToast(error.message || '选择路径失败。');
    }
  }

  async function pickPath(key, pickerType) {
    _showPickerOverlay();
    try {
      // 后端 pick_file 只支持 folder / model-file / text-file
      const pickerMap = {
        'output-folder': 'folder',
        'output-model-file': 'model-file',
      };
      pickerType = pickerMap[pickerType] || pickerType;

      const response = await api.pickFile(pickerType, key);
      _hidePickerOverlay();
      if (response.status !== 'success') {
        showToast(response.message|| '选择路径失败。');
        return;
      }
      if (!response?.data?.path) {
        return;
      }
      window.updateConfigValue(key, response.data.path);
      if (state.activeModule === 'config') {
        renderView('config');
      }
    } catch (error) {
      _hidePickerOverlay();
      showToast(error.message || '选择路径失败。');
    }
  }

  function setupNativePicker() {
    if (state.pickerInputBound) {
      return;
    }
   const input = $('#native-picker-input');
    if (!input) {
      return;
    }
    state.pickerInputBound = true;
    input.addEventListener('change', (event) => {
      const fieldKey = input.dataset.fieldKey;
      const fieldType = input.dataset.fieldType;
      const files = Array.from(event.target.files || []);
      if (!fieldKey || files.length === 0) {
        return;
      }
    let nextValue = '';
      if (fieldType === 'folder') {
        const firstPath = files[0].webkitRelativePath || files[0].name;
        nextValue = firstPath.split('/')[0] || firstPath;
      } else {
        nextValue = files[0].name;
      }
      window.updateConfigValue(fieldKey, nextValue);
      input.value = '';
      delete input.dataset.fieldKey;
      delete input.dataset.fieldType;
    });
  }

  function openNativePicker(fieldKey, pickerType) {
    state.builtinPicker = { open: true, fieldKey, pickerType, rootLabel: '', items: [], loading: true };
    renderBuiltinPickerModal();
    api.getBuiltinPicker(pickerType, fieldKey)
      .then((response) => {
        state.builtinPicker = {
          open: true,
          fieldKey,
          pickerType,
          rootLabel: response?.data?.rootLabel || '',
          items: response?.data?.items || [],
          loading: false,
        };
        renderBuiltinPickerModal();
      })
      .catch((error) => {
        state.builtinPicker.open = false;
        renderBuiltinPickerModal();
        showToast(error.message || '打开内置文件选择器失败。');
      });
  }

  function closeBuiltinPicker() {
    state.builtinPicker.open = false;
    renderBuiltinPickerModal();
  }

  function refreshBuiltinPicker() {
    if (!state.builtinPicker.open) return;
    const { fieldKey, pickerType } = state.builtinPicker;
    state.builtinPicker.loading = true;
    state.builtinPicker.items = [];
    renderBuiltinPickerModal();
    api.getBuiltinPicker(pickerType, fieldKey)
  .then((response) => {
        state.builtinPicker = {
          open: true, fieldKey, pickerType,
          rootLabel: response?.data?.rootLabel || '',
      items: response?.data?.items || [],
          loading: false,
        };
        renderBuiltinPickerModal();
      })
      .catch(() => {
        state.builtinPicker.loading = false;
        renderBuiltinPickerModal();
        showToast('刷新失败');
      });
  }

  function selectBuiltinPickerItem(item) {
    const root = state.builtinPicker.rootLabel.replaceAll('\\', '/');
    const fullPath = `${root}/${item}`;
    state.builtinPicker.open = false;
    renderBuiltinPickerModal();
    // 如果是为普通 input 元素选择的（targetInputId模式）
    if (state.builtinPicker._targetInputId) {
      const input = $(`#${state.builtinPicker._targetInputId}`);
      if (input) {
        input.value = fullPath;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      state.builtinPicker._targetInputId = null;
    } else {
      window.updateConfigValue(state.builtinPicker.fieldKey, fullPath);
      if (state.activeModule === 'config') renderView('config');
    }
  }

  function openBuiltinPickerForInput(inputId, pickerType) {
    state.builtinPicker = { open: true, fieldKey: '', pickerType, rootLabel: '', items: [], loading: true, _targetInputId: inputId };
    renderBuiltinPickerModal();
    api.getBuiltinPicker(pickerType, inputId)
      .then((response) => {
        state.builtinPicker = { ...state.builtinPicker, rootLabel: response?.data?.rootLabel || '', items: response?.data?.items || [], loading: false };
        renderBuiltinPickerModal();
      })
      .catch((error) => { state.builtinPicker.open = false; renderBuiltinPickerModal(); showToast(error.message || '打开内置文件选择器失败。'); });
  }

  return {
    pickPath,
    pickPathForInput,
    openNativePicker,
    closeBuiltinPicker,
    refreshBuiltinPicker,
    selectBuiltinPickerItem,
    openBuiltinPickerForInput,
    setupNativePicker,
  };
}
