import { $, $$, escapeHtml } from '../utils/dom.js';

export function createTopbarSearchController({ state, uiTabs, getSectionsForType, renderView }) {
  function setupTopbarSearch() {
    const input = $('#topbar-search-input');
    const dropdown = $('#topbar-search-dropdown');
    if (!input || !dropdown) return;

    let searchTimer = null;
    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const query = input.value.trim().toLowerCase();
        if (!query) {
          dropdown.classList.remove('open');
          dropdown.innerHTML = '';
          return;
        }
        const results = searchConfigFields(query).slice(0, 12);
        if (!results.length) {
          dropdown.innerHTML = '<div class="topbar-search-empty">未找到匹配参数</div>';
          dropdown.classList.add('open');
          return;
        }
        dropdown.innerHTML = results.map((result) => {
          const highlightedLabel = highlightMatch(result.field.label || result.field.key, query);
          const tabLabel = uiTabs.find((tab) => tab.key === result.tab)?.label || result.tab;
          return `
            <button class="topbar-search-result" type="button" onclick="jumpToConfigField('${result.tab}', '${result.sectionId}', '${result.field.key}')">
              <span class="topbar-search-result-title">${highlightedLabel}</span>
              <span class="topbar-search-result-meta">${escapeHtml(tabLabel)} / ${escapeHtml(result.sectionTitle || '')} · ${escapeHtml(result.field.key)}</span>
            </button>
          `;
        }).join('');
        dropdown.classList.add('open');
      }, 120);
    });

    input.addEventListener('focus', () => {
      if (input.value.trim() && dropdown.innerHTML) {
        dropdown.classList.add('open');
      }
    });

    document.addEventListener('click', (event) => {
      if (!event.target?.closest?.('.topbar-search')) {
        dropdown.classList.remove('open');
      }
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        dropdown.classList.remove('open');
        input.blur();
      }
    });
  }

  function searchConfigFields(query) {
    const trainingType = state.activeTrainingType;
    const sections = getSectionsForType(trainingType);
    const results = [];
    for (const section of sections) {
      for (const field of section.fields) {
        if (field.type === 'hidden' || field.type === 'ui_group') continue;
        const matchLabel = (field.label || '').toLowerCase().includes(query);
        const matchKey = (field.key || '').toLowerCase().includes(query);
        const matchDesc = (field.desc || '').toLowerCase().includes(query);
        if (matchLabel || matchKey || matchDesc) {
          results.push({
            field,
            tab: section.tab,
            sectionId: section.id,
            sectionTitle: section.title,
            score: matchLabel ? 3 : (matchKey ? 2 : 1),
          });
        }
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('(' + escapedQuery + ')', 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
  }

  function jumpToConfigField(tab, sectionId, fieldKey) {
    const dropdown = $('#topbar-search-dropdown');
    if (dropdown) dropdown.classList.remove('open');

    if (state.activeModule !== 'config') {
      state.activeModule = 'config';
      $$('.nav-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.module === 'config');
      });
    }
    state.activeTab = tab;
    localStorage.setItem('sdxl_ui_tab', tab);
    renderView('config');

    requestAnimationFrame(() => {
      const fieldEl = document.querySelector('.config-group[data-field-key="' + fieldKey + '"]');
      if (fieldEl) {
        fieldEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        fieldEl.classList.add('field-search-highlight');
        setTimeout(() => fieldEl.classList.remove('field-search-highlight'), 2000);
      } else {
        const sectionEl = document.getElementById(sectionId);
        if (sectionEl) {
          sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  }

  function bindGlobals(targetWindow) {
    targetWindow.jumpToConfigField = jumpToConfigField;
  }

  return {
    setupTopbarSearch,
    searchConfigFields,
    highlightMatch,
    jumpToConfigField,
    bindGlobals,
  };
}
