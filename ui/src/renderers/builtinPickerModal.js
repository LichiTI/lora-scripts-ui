// renderers/builtinPickerModal.js — 内置文件选择器模态框渲染（工厂模式，闭包 state）
// 依赖 state.builtinPicker（由 main.js 中 openNativePicker / refreshBuiltinPicker 等 action 写入）
// 依赖 escapeHtml（从 utils/dom.js 导入）
// 依赖 $ 选择器（从 utils/dom.js 导入）

import { $, escapeHtml } from '../utils/dom.js';

export function createBuiltinPickerRenderer(state) {
  return function() {
  const modal = $('#builtin-picker-modal');
  const title = $('#builtin-picker-title');
  const path = $('#builtin-picker-path');
  const list = $('#builtin-picker-list');
  const footer = document.querySelector('.builtin-picker-footer');
  const pt = state.builtinPicker.pickerType;
  const canSelectCurrent = pt === 'folder' || pt === 'output-folder' || pt === 'train-dir';
  if (footer) footer.innerHTML = `
    ${canSelectCurrent ? '<button class="btn btn-outline btn-sm" type="button" onclick="selectBuiltinPickerCurrentRoot()">选择当前目录</button>' : ''}
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
  title.textContent = (pt === 'folder' || pt === 'output-folder') ? '请选择目录' : '请选择模型文件';
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
  };
}
