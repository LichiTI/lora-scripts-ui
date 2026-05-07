import { $, escapeHtml } from '../utils/dom.js';

export function createBuiltinPickerController({ api, state, renderView, showToast, updateConfigValue }) {
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
      updateConfigValue(fieldKey, nextValue);
      input.value = '';
      delete input.dataset.fieldKey;
      delete input.dataset.fieldType;
    });
  }

  function renderBuiltinPickerModal() {
    const modal = $('#builtin-picker-modal');
    const title = $('#builtin-picker-title');
    const path = $('#builtin-picker-path');
    const list = $('#builtin-picker-list');
    const footer = document.querySelector('.builtin-picker-footer');
    if (footer) footer.innerHTML = `
      <button class="btn btn-outline btn-sm" type="button" onclick="refreshBuiltinPicker()">🔄 刷新</button>
      <button class="btn btn-outline btn-sm" type="button" onclick="closeBuiltinPicker()">取消</button>
    `;
    if (!modal || !title || !path || !list) {
      return;
    }
    modal.classList.toggle('open', state.builtinPicker.open);
    if (!state.builtinPicker.open) {
      return;
    }
    const pickerType = state.builtinPicker.pickerType;
    title.textContent = (pickerType === 'folder' || pickerType === 'output-folder') ? '请选择目录' : '请选择模型文件';
    path.textContent = state.builtinPicker.rootLabel;
    if (state.builtinPicker.loading) {
      list.innerHTML = `<div class="builtin-picker-empty"><span>⏳ 加载中...</span></div>`;
      return;
    }
    if (!state.builtinPicker.items || !state.builtinPicker.items.length) {
      list.innerHTML = `
        <div class="builtin-picker-empty">
          <span>未检测到内容</span>
        </div>
      `;
      return;
    }
    list.innerHTML = state.builtinPicker.items.map((item) => `
        <button class="builtin-picker-item" type="button" onclick="selectBuiltinPickerItem('${escapeHtml(item)}')">
          <span class="builtin-picker-name">${escapeHtml(item)}</span>
        </button>
      `).join('');
  }

  function openNativePicker(fieldKey, pickerType) {
    state.builtinPicker = { open: true, fieldKey, pickerType, rootLabel: '', items: [], loading: true };
    renderBuiltinPickerModal();
    api.getBuiltinPicker(pickerType)
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
    api.getBuiltinPicker(pickerType)
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

    if (state.builtinPicker._targetInputId) {
      const input = $(`#${state.builtinPicker._targetInputId}`);
      if (input) {
        input.value = fullPath;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      state.builtinPicker._targetInputId = null;
    } else {
      updateConfigValue(state.builtinPicker.fieldKey, fullPath);
      if (state.activeModule === 'config') renderView('config');
    }
  }

  function openBuiltinPickerForInput(inputId, pickerType) {
    state.builtinPicker = { open: true, fieldKey: '', pickerType, rootLabel: '', items: [], loading: true, _targetInputId: inputId };
    renderBuiltinPickerModal();
    api.getBuiltinPicker(pickerType)
      .then((response) => {
        state.builtinPicker = {
          ...state.builtinPicker,
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

  function bindGlobals(targetWindow) {
    targetWindow.openNativePicker = openNativePicker;
    targetWindow.closeBuiltinPicker = closeBuiltinPicker;
    targetWindow.refreshBuiltinPicker = refreshBuiltinPicker;
    targetWindow.selectBuiltinPickerItem = selectBuiltinPickerItem;
    targetWindow.openBuiltinPickerForInput = openBuiltinPickerForInput;
  }

  return {
    setupNativePicker,
    renderBuiltinPickerModal,
    openNativePicker,
    closeBuiltinPicker,
    refreshBuiltinPicker,
    selectBuiltinPickerItem,
    openBuiltinPickerForInput,
    bindGlobals,
  };
}
