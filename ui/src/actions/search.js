// actions/search.js — 顶部配置项搜索
//   setupTopbarSearch + _searchConfigFields + _highlightMatch + jumpToConfigField
//
// 依赖（工厂注入）：state, UI_TABS, getSectionsForType, renderView

import { $, $$, escapeHtml } from '../utils/dom.js';

export function createSearchActions({ state, UI_TABS, getSectionsForType, renderView }) {
  function _searchConfigFields(query) {
    const tt = state.activeTrainingType;
    const sections = getSectionsForType(tt);
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

  function _highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('(' + escapedQuery + ')', 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
  }

  function setupTopbarSearch() {
    const input = $('#topbar-search-input');
    const dropdown = $('#topbar-search-dropdown');
    if (!input || !dropdown) return;

    let _searchTimer = null;

    input.addEventListener('input', () => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        const query = input.value.trim().toLowerCase();
        if (!query || query.length < 1) {
          dropdown.classList.remove('open');
          dropdown.innerHTML = '';
          return;
        }
        const results = _searchConfigFields(query);
        if (results.length === 0) {
          dropdown.innerHTML = '<div class="topbar-search-empty">未找到匹配的配置项</div>';
          dropdown.classList.add('open');
          return;
      }
       dropdown.innerHTML = results.slice(0, 20).map((r) => {
          const highlightedLabel = _highlightMatch(r.field.label, query);
          const tabLabel = UI_TABS.find((t) => t.key === r.tab)?.label || r.tab;
          return '<div class="topbar-search-item" onclick="jumpToConfigField(\'' + escapeHtml(r.tab) + '\', \'' + escapeHtml(r.sectionId) + '\', \'' + escapeHtml(r.field.key) + '\')">' +
            '<span class="topbar-search-item-label">' + highlightedLabel + '</span>' +
            '<span class="topbar-search-item-meta">' +
            '<span class="search-tab-tag">' + escapeHtml(tabLabel) + '</span>' +
            '<span>' + escapeHtml(r.sectionTitle) + '</span>' +
            '<span style="opacity:0.4;font-family:monospace;">' + escapeHtml(r.field.key) + '</span>' +
            '</span></div>';
        }).join('');
        dropdown.classList.add('open');
      }, 150);
    });

    input.addEventListener('focus', () => {
      if (input.value.trim() && dropdown.innerHTML) {
        dropdown.classList.add('open');
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#topbar-search')) {
        dropdown.classList.remove('open');
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        dropdown.classList.remove('open');
        input.blur();
      }
    });
  }

  function jumpToConfigField(tab, sectionId, fieldKey) {
    const dropdown =$('#topbar-search-dropdown');
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
        setTimeout(() =>fieldEl.classList.remove('field-search-highlight'), 2000);
      } else {
        const sectionEl = document.getElementById(sectionId);
        if(sectionEl) {
          sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
}

  return { setupTopbarSearch, jumpToConfigField };
}
