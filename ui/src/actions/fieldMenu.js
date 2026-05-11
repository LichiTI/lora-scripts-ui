// actions/fieldMenu.js — 字段右侧 ··· 菜单（撤销更改 / 恢复默认）
// 依赖（工厂注入）：state, getFieldDefinition
// 注：菜单项点击后调用 window.undoFieldValue / window.resetFieldValue，
// builtin-picker 闭合则用 window.closeBuiltinPicker（都是 Stage 3 其他模块挂上去的）。

import { $} from '../utils/dom.js';

export function createFieldMenuActions({ state, getFieldDefinition }) {
  function setupFieldMenus() {
    function closeAllMenus() {
      document.querySelectorAll('.field-menu-dropdown').forEach((m) => m.remove());
      state.activeFieldMenu = null;
    }

    function openMenu(key, anchor) {
      closeAllMenus();
      state.activeFieldMenu = key;
      const field = getFieldDefinition(key);
      if (!field) return;
      const value = state.config[field.key];
      const defaultValue = field.defaultValue ?? '';
      const canUndo = Object.hasOwn(state.fieldUndo, field.key);
      const canReset = String(value ??'') !== String(defaultValue ?? '');

      const menu = document.createElement('div');
      menu.className = 'field-menu field-menu-dropdown';
      menu.innerHTML = `
        <button class="field-menu-item ${canUndo ? '' : 'disabled'}" type="button" ${canUndo ? '' : 'disabled'}>撤销更改</button>
        <button class="field-menu-item ${canReset ? '' : 'disabled'}" type="button" ${canReset ? '' : 'disabled'}>恢复默认</button>
      `;
      menu.addEventListener('click', (e) => e.stopPropagation());
      const btns = menu.querySelectorAll('.field-menu-item');
      if (canUndo) btns[0].addEventListener('click', () => { closeAllMenus(); window.undoFieldValue(key); });
      if (canReset) btns[1].addEventListener('click', () => { closeAllMenus(); window.resetFieldValue(key); });
    anchor.appendChild(menu);
    }

    document.addEventListener('click', (event) => {
      const toggle = event.target?.closest?.('[data-field-menu-key]');
      if (toggle){
        event.preventDefault();
        event.stopPropagation();
        const key = toggle.dataset.fieldMenuKey;
        if (state.activeFieldMenu === key) {
      closeAllMenus();
        } else {
          const anchor = toggle.closest('.field-inline-actions');
          if (anchor) openMenu(key, anchor);
     }
        return;
      }
      if (event.target?.closest?.('.field-menu-dropdown')) {
        return;
      }
if (state.activeFieldMenu) {
        closeAllMenus();
      }
    });
    $('#builtin-picker-close')?.addEventListener('click',window.closeBuiltinPicker);
    $('#builtin-picker-cancel')?.addEventListener('click', window.closeBuiltinPicker);
    $('#builtin-picker-modal')?.addEventListener('click', (event) => {
      if (event.target?.id === 'builtin-picker-modal') {
        window.closeBuiltinPicker();
      }
    });
  }

  return { setupFieldMenus };
}
