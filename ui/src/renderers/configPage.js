export function createConfigPageRenderer({
  state,
  TRAINING_TYPES,
  escapeHtml,
  renderPreflightOverviewPanel,
  renderPreflightReport,
  renderSlot,
  renderExperimentalTrainingPanel,
  renderConfigSections,
  renderFloatingTrainingAssistant,
  renderNavigator,
  syncTopbarState,
  syncFooterAction,
  updateJSONPreview,
  setupWaterfallScrollSpy,
}) {
  function renderConfig(container) {
    const trainingType = state.activeTrainingType;
    const typeLabel = TRAINING_TYPES.find((type) => type.id === trainingType)?.label || trainingType;
    const waterfall = !!state.configWaterfall;

    container.innerHTML = `
      <div class="form-container${waterfall ? ' form-container-waterfall' : ''}">
        <header class="section-title">
          <h2>${escapeHtml(typeLabel)} LoRA 模式</h2>
          <p>${waterfall ? '<span style="color:var(--text-muted);font-size:0.82rem;">📜 瀑布流模式：所有参数在同一页展示，可通过顶部标签栏快速跳转。</span>' : ''}</p>
        </header>
        ${renderPreflightOverviewPanel()}
        ${renderPreflightReport()}
        ${renderSlot('training.preflight_panel')}
        ${renderSlot('config.after_status_deck')}
        ${renderExperimentalTrainingPanel()}
        ${renderConfigSections(trainingType, waterfall)}
        ${renderFloatingTrainingAssistant()}
      </div>
    `;

    renderNavigator();
    syncTopbarState();
    syncFooterAction();
    updateJSONPreview();

    if (waterfall) {
      setupWaterfallScrollSpy?.(container);
    }
  }

  return {
    renderConfig,
  };
}
