// renderers/navigator.js — 左侧导航器渲染（训练类型分组列表 + 参数管理面板）
// 依赖 state、TRAINING_TYPES、$、_persistTrainingGroupsCollapsed

import { $ } from '../utils/dom.js';

export function createNavigatorRenderer({ state, TRAINING_TYPES, _persistTrainingGroupsCollapsed }) {
  return function renderNavigator() {
    const trainingTypeList = $('#section-training-types .group-list');
    if (trainingTypeList) {
      const groups = {};
      for (const tt of TRAINING_TYPES) {
        if (!groups[tt.group]) groups[tt.group] = [];
        groups[tt.group].push(tt);
      }
      // 默认折叠的组（首次进入时使用）
      const defaultCollapsed = ['ControlNet', 'Textual Inversion', '其他模型训练', '实验训练'];
      if (!state._collapsedTrainingGroups) {
        const saved = localStorage.getItem('sd-rescripts:training-groups-collapsed');
        let initial;
        if (saved !== null) {
          try {
            const parsed = JSON.parse(saved);
            initial = Array.isArray(parsed) ? parsed : defaultCollapsed;
          } catch (_e) {
            initial = defaultCollapsed;
          }
        } else {
          initial = defaultCollapsed;
        }
        state._collapsedTrainingGroups = new Set(initial);
      }
      const _collapsedGroups = state._collapsedTrainingGroups;
      // 仅在用户切换训练类型时自动展开该组（通过标记避免每次渲染都展开）
      const activeGroup = TRAINING_TYPES.find(t => t.id === state.activeTrainingType)?.group || '';
      if (activeGroup && _collapsedGroups.has(activeGroup) && state._lastExpandedForType !== state.activeTrainingType) {
        _collapsedGroups.delete(activeGroup);
        state._lastExpandedForType = state.activeTrainingType;
        _persistTrainingGroupsCollapsed();
      }

      trainingTypeList.innerHTML = Object.entries(groups).map(([group, items]) => {
        const collapsed = _collapsedGroups.has(group);
        const arrow = collapsed ? '▸' : '▾';
        return `<li class="group-header${collapsed ? ' collapsed' : ''}" onclick="toggleTrainingGroup('${group}')">`
          + `<span class="group-arrow">${arrow}</span> ${group} <span class="group-count">${items.length}</span></li>`
          + (collapsed ? '' : items.map((tt) => {
              const disabled = !!tt.disabled;
              const cls = `${tt.id === state.activeTrainingType ? 'active' : ''}${disabled ? ' disabled' : ''}`.trim();
              const title = disabled && tt.disabledReason ? ` title="${tt.disabledReason}"` : '';
              const click = disabled ? '' : ` onclick="switchTrainingType('${tt.id}')"`;
              return `<li class="${cls}"${click}${title}>${tt.label}</li>`;
            }).join(''));
      }).join('');
    }

    const presetPanel = $('#panel-preset-actions');
    if (presetPanel) {
      presetPanel.innerHTML = `
        <div class="panel-preset-title">参数管理</div>
        <div class="panel-preset-grid">
          <button class="btn btn-outline btn-sm" type="button" onclick="resetAllParams()">重置参数</button>
          <button class="btn btn-outline btn-sm" type="button" onclick="saveCurrentParams()">保存参数</button>
          <button class="btn btn-outline btn-sm" type="button" onclick="loadSavedParams()">读取参数</button>
          <button class="btn btn-outline btn-sm" type="button" onclick="downloadConfigFile()">导出文件</button>
          <button class="btn btn-outline btn-sm" type="button" onclick="importConfigFile()">导入文件</button>
        </div>
      `;
    }

  };
}
