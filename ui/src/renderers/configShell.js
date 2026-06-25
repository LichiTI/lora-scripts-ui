export function createConfigShellRenderer({
  state,
  UI_TABS,
  getAvailableTabs,
  getSectionsForTab,
  isFieldVisible,
  renderSection,
  escapeHtml,
}) {
  function visibleSectionPredicate(section) {
    if (section.expert && !state.config.performance_expert_mode) return false;
    return section.fields.some((field) => field.type !== 'hidden' && isFieldVisible(field, state.config));
  }

  function getVisibleSections(trainingType, waterfall) {
    if (!waterfall) {
      return getSectionsForTab(state.activeTab, trainingType).filter(visibleSectionPredicate);
    }

    const tabKeyToLabel = {};
    for (const tab of UI_TABS) tabKeyToLabel[tab.key] = tab.label;

    const allSections = [];
    const availableTabKeys = getAvailableTabs(trainingType, state.config).map((tab) => tab.key);
    for (const tabKey of availableTabKeys) {
      const tabSections = getSectionsForTab(tabKey, trainingType);
      for (const section of tabSections) {
        allSections.push({
          ...section,
          _tabKey: tabKey,
          _tabLabel: tabKeyToLabel[tabKey] || tabKey,
        });
      }
    }
    return allSections.filter(visibleSectionPredicate);
  }

  function renderSections(trainingType, waterfall) {
    const visibleSections = getVisibleSections(trainingType, waterfall);
    let lastRenderedTab = '';
    return visibleSections.map((section) => {
      if (!waterfall) return renderSection(section);
      let prefix = '';
      if (section._tabKey && section._tabKey !== lastRenderedTab) {
        lastRenderedTab = section._tabKey;
        prefix = `<div class="waterfall-tab-anchor" id="waterfall-tab-${escapeHtml(section._tabKey)}" data-waterfall-tab="${escapeHtml(section._tabKey)}">
          <h2 class="waterfall-tab-title">${escapeHtml(section._tabLabel)}</h2>
        </div>`;
      }
      return prefix + renderSection(section);
    }).join('');
  }

  return {
    renderSections,
  };
}
