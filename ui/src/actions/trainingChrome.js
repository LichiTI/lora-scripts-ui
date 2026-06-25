export function createTrainingChromeActions({
  state,
  getFieldDefinition,
  loadTrainingWikiEntry,
  buildSchemaFallbackEntry,
  escapeHtml,
  renderNavigator,
  renderView,
  queryAll,
}) {
  let waterfallScrollHandler = null;

  function persistTrainingGroupsCollapsed() {
    try {
      const arr = Array.from(state._collapsedTrainingGroups || []);
      localStorage.setItem('sd-rescripts:training-groups-collapsed', JSON.stringify(arr));
    } catch (_e) {
      // Ignore blocked storage; UI state can be restored from defaults.
    }
  }

  function toggleTrainingGroup(group) {
    if (!state._collapsedTrainingGroups) state._collapsedTrainingGroups = new Set();
    if (state._collapsedTrainingGroups.has(group)) {
      state._collapsedTrainingGroups.delete(group);
    } else {
      state._collapsedTrainingGroups.add(group);
    }
    persistTrainingGroupsCollapsed();
    renderNavigator();
  }

  function toggleTrainingAdvisor() {
    state.trainingAdvisorCollapsed = !state.trainingAdvisorCollapsed;
    localStorage.setItem('sd-rescripts:training-advisor-collapsed', state.trainingAdvisorCollapsed ? 'true' : 'false');
    renderView(state.activeModule || 'config');
  }

  async function openTrainingOptionHelp(fieldKey) {
    const field = getFieldDefinition(fieldKey, state.activeTrainingType);
    renderTrainingOptionHelpModal({ loading: true, field, fieldKey });
    try {
      const wikiEntry = await loadTrainingWikiEntry(fieldKey);
      renderTrainingOptionHelpModal({ entry: wikiEntry || buildSchemaFallbackEntry(field), field, fieldKey });
    } catch (_error) {
      renderTrainingOptionHelpModal({ entry: buildSchemaFallbackEntry(field), field, fieldKey });
    }
  }

  function closeTrainingOptionHelp() {
    const modal = document.querySelector('.training-option-help-modal');
    if (modal) modal.remove();
  }

  function renderTrainingOptionHelpModal({ entry = null, loading = false, field = null, fieldKey = '' }) {
    closeTrainingOptionHelp();
    const safeEntry = entry || buildSchemaFallbackEntry(field) || {
      key: fieldKey,
      title: fieldKey || '参数说明',
      category: '训练参数',
      standard: {
        summary: '正在加载参数说明...',
        effect: '',
        whenToUse: '',
        avoidWhen: '',
      },
      relatedConfigs: [],
    };
    const standard = safeEntry.standard || {};
    const related = Array.isArray(safeEntry.relatedConfigs) ? safeEntry.relatedConfigs : [];
    const body = document.createElement('div');
    body.className = 'training-option-help-modal open';
    body.innerHTML = `
      <div class="training-option-help-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(safeEntry.title || '参数说明')}">
        <div class="training-option-help-head">
          <div>
            <span class="training-option-help-category">${escapeHtml(safeEntry.category || '训练参数')}</span>
            <h3>${escapeHtml(safeEntry.title || field?.label || fieldKey || '参数说明')}</h3>
          </div>
          <button class="modal-close" type="button" title="关闭" onclick="closeTrainingOptionHelp()">×</button>
        </div>
        <div class="training-option-help-body">
          ${loading ? '<p class="field-desc">正在加载参数说明...</p>' : ''}
          ${renderHelpRow('简单说', standard.summary)}
          ${renderHelpRow('打开后效果', standard.effect)}
          ${renderHelpRow('适合什么时候开', standard.whenToUse)}
          ${renderHelpRow('什么时候先别开', standard.avoidWhen)}
          ${safeEntry.fallback ? '<p class="training-option-help-note">完整 Wiki 条目还在补充中，当前内容来自训练 schema。</p>' : ''}
          ${related.length ? `<div class="training-option-help-related">${related.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
        </div>
      </div>
    `;
    body.addEventListener('click', (event) => {
      if (event.target === body) closeTrainingOptionHelp();
    });
    document.body.appendChild(body);
  }

  function renderHelpRow(title, text) {
    if (!text) return '';
    return `
      <div class="training-option-help-row">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(text)}</p>
      </div>
    `;
  }

  function startTrainingAdvisorDrag(event) {
    if (event.button !== 0 || event.target?.closest?.('button')) return;
    const panel = event.currentTarget?.closest?.('.floating-training-advisor');
    if (!panel) return;
    event.preventDefault();

    const rect = panel.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const margin = 12;

    panel.classList.add('is-dragging');
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;

    const clampPosition = (clientX, clientY) => {
      const maxX = Math.max(margin, window.innerWidth - panel.offsetWidth - margin);
      const maxY = Math.max(margin, window.innerHeight - panel.offsetHeight - margin);
      return {
        x: Math.min(Math.max(margin, clientX - offsetX), maxX),
        y: Math.min(Math.max(margin, clientY - offsetY), maxY),
      };
    };

    const move = (moveEvent) => {
      const pos = clampPosition(moveEvent.clientX, moveEvent.clientY);
      panel.style.left = `${pos.x}px`;
      panel.style.top = `${pos.y}px`;
    };

    const stop = (upEvent) => {
      const pos = clampPosition(upEvent.clientX, upEvent.clientY);
      state.trainingAdvisorPosition = pos;
      localStorage.setItem('sd-rescripts:training-advisor-position', JSON.stringify(pos));
      panel.classList.remove('is-dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  function setupWaterfallScrollSpy(container) {
    if (waterfallScrollHandler) {
      document.removeEventListener('scroll', waterfallScrollHandler, true);
      waterfallScrollHandler = null;
    }
    const anchors = container.querySelectorAll('.waterfall-tab-anchor');
    if (!anchors.length) return;
    waterfallScrollHandler = () => {
      if (state.activeModule !== 'config' || !state.configWaterfall) return;
      let curTab = '';
      const triggerY = 140;
      anchors.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top <= triggerY) curTab = el.dataset.waterfallTab;
      });
      if (curTab && curTab !== state.activeTab) {
        state.activeTab = curTab;
        localStorage.setItem('sdxl_ui_tab', curTab);
        queryAll('.top-nav-item').forEach((item) => {
          item.classList.toggle('active', item.dataset.tab === curTab);
        });
      }
    };
    document.addEventListener('scroll', waterfallScrollHandler, true);
  }

  return {
    persistTrainingGroupsCollapsed,
    toggleTrainingGroup,
    toggleTrainingAdvisor,
    openTrainingOptionHelp,
    closeTrainingOptionHelp,
    startTrainingAdvisorDrag,
    setupWaterfallScrollSpy,
  };
}
