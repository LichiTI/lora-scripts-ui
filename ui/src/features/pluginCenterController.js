import { icon as _ico } from '../utils/dom.js';
import {
  renderPluginAuditLoading,
  renderPluginAuditPanel,
  renderPluginCenterContent,
  renderPluginCenterShell,
  renderPluginOfflineState,
  renderPluginRuntimeEmpty,
} from './pluginCenter.js';

export function createPluginCenterController({
  pluginStore,
  loadPluginRuntime,
  loadPluginAudit,
  reloadAllPlugins,
  approvePlugin,
  revokePlugin,
  toggleDeveloperMode,
  getRegisteredSlots,
  showToast,
}) {
  function renderPlugins(container) {
    container.innerHTML = renderPluginCenterShell();
    loadAndRenderPlugins();
  }

  async function loadAndRenderPlugins() {
    const element = document.getElementById('plugin-center-content');
    if (!element) return;

    await loadPluginRuntime();

    if (pluginStore.error) {
      element.innerHTML = renderPluginOfflineState(pluginStore.error);
      return;
    }

    const runtime = pluginStore.runtime;
    if (!runtime) {
      element.innerHTML = renderPluginRuntimeEmpty();
      return;
    }

    const slots = getRegisteredSlots();
    element.innerHTML = renderPluginCenterContent(runtime, slots);
  }

  async function pluginToggleDevMode(enabled) {
    const result = await toggleDeveloperMode(enabled);
    if (result.ok) {
      showToast('✓ 开发者模式已' + (enabled ? '开启' : '关闭'));
    } else {
      showToast('⚠ 操作失败: ' + (result.error || '未知错误'));
    }
    loadAndRenderPlugins();
  }

  async function pluginReloadAll() {
    showToast(_ico('loader', 12) + ' 正在重新加载插件...');
    const result = await reloadAllPlugins();
    if (result.ok) {
      showToast('✓ 插件已重新加载');
    } else {
      showToast('⚠ 重新加载失败: ' + (result.error || '未知错误'));
    }
    loadAndRenderPlugins();
  }

  async function pluginApprove(pluginId) {
    const result = await approvePlugin(pluginId);
    if (result.ok) {
      showToast('✓ 插件 ' + pluginId + ' 已审批');
    } else {
      showToast('⚠ 审批失败: ' + (result.error || '未知错误'));
    }
    loadAndRenderPlugins();
  }

  async function pluginRevoke(pluginId) {
    if (!confirm('确定要撤销插件 "' + pluginId + '" 的审批？')) return;
    const result = await revokePlugin(pluginId);
    if (result.ok) {
      showToast('✓ 已撤销插件 ' + pluginId + ' 的审批');
    } else {
      showToast('⚠ 撤销失败: ' + (result.error || '未知错误'));
    }
    loadAndRenderPlugins();
  }

  async function pluginShowAudit() {
    const panel = document.getElementById('plugin-audit-panel');
    if (!panel) return;
    if (panel.style.display !== 'none') {
      panel.style.display = 'none';
      return;
    }
    panel.innerHTML = renderPluginAuditLoading();
    panel.style.display = 'block';

    await loadPluginAudit(50);
    const audit = pluginStore.audit;
    panel.innerHTML = renderPluginAuditPanel(audit);
  }

  function bindGlobals(targetWindow) {
    targetWindow.pluginToggleDevMode = pluginToggleDevMode;
    targetWindow.pluginReloadAll = pluginReloadAll;
    targetWindow.pluginApprove = pluginApprove;
    targetWindow.pluginRevoke = pluginRevoke;
    targetWindow.pluginShowAudit = pluginShowAudit;
  }

  return {
    renderPlugins,
    loadAndRenderPlugins,
    pluginToggleDevMode,
    pluginReloadAll,
    pluginApprove,
    pluginRevoke,
    pluginShowAudit,
    bindGlobals,
  };
}
