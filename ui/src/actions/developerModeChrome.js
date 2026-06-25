export function createDeveloperModeChromeActions({
  state,
  pluginStore,
  loadPluginRuntime,
  renderView,
  queryAll,
}) {
  function isDeveloperModeEnabled() {
    if (pluginStore.runtime && typeof pluginStore.runtime.developer_mode !== 'undefined') {
      return !!pluginStore.runtime.developer_mode;
    }
    return localStorage.getItem('sd-rescripts:developer-mode') === 'true';
  }

  function syncDeveloperOnlyChrome() {
    const enabled = isDeveloperModeEnabled();
    document.body.classList.toggle('developer-mode-enabled', enabled);
    localStorage.setItem('sd-rescripts:developer-mode', enabled ? 'true' : 'false');

    if (!enabled && state.activeModule === 'turbocore') {
      state.activeModule = 'config';
      queryAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.module === 'config'));
      renderView('config');
    }
  }

  async function refreshDeveloperModeChrome() {
    try {
      await loadPluginRuntime();
    } catch (_e) {
      // loadPluginRuntime already handles API errors; keep chrome refresh best-effort.
    }
    syncDeveloperOnlyChrome();
  }

  return {
    isDeveloperModeEnabled,
    syncDeveloperOnlyChrome,
    refreshDeveloperModeChrome,
  };
}
