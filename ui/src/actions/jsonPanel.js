// actions/jsonPanel.js — JSON 预览面板（setupJsonPanel + updateJSONPreview）
// 依赖（工厂注入）：state, buildRunConfig

import { $ } from '../utils/dom.js';

export function createJsonPanelActions({ state, buildRunConfig }) {
  function setupJsonPanel() {
    const panel = $('.json-panel');
    const toggleBtn = $('#json-panel-toggle');
    const toggleIcon = $('#json-panel-toggle use');
    if (!panel || !toggleBtn || !toggleIcon) {
      return;
    }

    const applyPanelState = () => {
      panel.classList.toggle('collapsed', state.jsonPanelCollapsed);
      toggleBtn.title = state.jsonPanelCollapsed ? '展开参数预览' : '收起参数预览';
      toggleIcon.setAttribute('href', state.jsonPanelCollapsed ? '#icon-chevron-left' : '#icon-chevron-right');
    };

    toggleBtn.addEventListener('click', () => {
      state.jsonPanelCollapsed = !state.jsonPanelCollapsed;
      applyPanelState();
    });

    applyPanelState();
  }

  function updateJSONPreview() {
    const jsonViewer = $('#json-viewer code');
    if (!jsonViewer) {
      return;
    }

    const payload = buildRunConfig(state.config, state.activeTrainingType);
    jsonViewer.textContent = JSON.stringify(payload, null, 2);
  }

  return { setupJsonPanel, updateJSONPreview };
}
