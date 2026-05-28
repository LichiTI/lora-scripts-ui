// actions/pluginsActions.js — 插件中心 actions
//   pluginToggleDevMode / pluginReloadAll / pluginApprove / pluginRevoke / pluginShowAudit
//
// 依赖（工厂注入）：api层（toggleDeveloperMode/reloadAllPlugins/approvePlugin/revokePlugin/loadPluginAudit）
//   pluginStore, _formatPluginAuditDetail, _loadAndRenderPlugins（都是 renderer/pluginHost 提供）
//   showToast

import { escapeHtml, _ico } from '../utils/dom.js';

export function createPluginsActions({
  pluginStore,
  toggleDeveloperMode,
  reloadAllPlugins,
  approvePlugin,
  revokePlugin,
  executePluginSdkRunner,
  loadPluginAudit,
  getPluginSettings,
  savePluginSettings,
  _formatPluginAuditDetail,
  _loadAndRenderPlugins,
  showToast,
}) {
  async function pluginToggleDevMode(enabled) {
    var result = await toggleDeveloperMode(enabled);
    if (result.ok) {
      showToast('✓ 开发者模式已' + (enabled ? '开启' : '关闭'));
    } else {
      showToast('⚠操作失败: ' + (result.error || '未知错误'));
    }
    _loadAndRenderPlugins();
  }

  async function pluginReloadAll() {
    showToast(_ico('loader', 12) + ' 正在重新加载插件...');
    var result = await reloadAllPlugins();
   if (result.ok) {
      showToast('✓ 插件已重新加载');
    } else {
      showToast('⚠ 重新加载失败: ' + (result.error || '未知错误'));
    }
    _loadAndRenderPlugins();
  }

  async function pluginApprove(pluginId) {
    var result = await approvePlugin(pluginId);
    if (result.ok) {
      showToast('✓ 插件 ' + pluginId + ' 已审批');
    } else {
      showToast('⚠ 审批失败: ' + (result.error || '未知错误'));
    }
    _loadAndRenderPlugins();
  }

  async function pluginRevoke(pluginId) {
    if (!confirm('确定要撤销插件 "' + pluginId + '" 的审批？'))return;
    var result = await revokePlugin(pluginId);
    if (result.ok) {
      showToast('✓ 已撤销插件 ' + pluginId + ' 的审批');
    } else {
      showToast('⚠ 撤销失败: ' + (result.error || '未知错误'));
    }
    _loadAndRenderPlugins();
  }

  async function pluginExecuteSdkRunner(runnerId, schemaId) {
    var payload = {
      dry_run: true,
      title: 'WebUI SDK probe',
    };
    if (schemaId) payload.schema_id = schemaId;

    showToast(_ico('loader', 12) + ' 正在提交 SDK Runner 试运行...');
    var result = await executePluginSdkRunner(runnerId, payload);
    if (result.ok) {
      var data = result.data || {};
      var jobId = data.job_id || data.task_id || data.id || '';
      showToast('✓ SDK Runner 已提交' + (jobId ? ': ' + jobId : ''));
    } else {
      showToast('⚠ SDK Runner 提交失败: ' + (result.error || '未知错误'));
    }
    _loadAndRenderPlugins();
  }

  async function pluginShowAudit() {
 var panel = document.getElementById('plugin-audit-panel');
    if (!panel) return;
    if (panel.style.display !== 'none') {
      panel.style.display = 'none';
    return;
    }
    panel.innerHTML = '<section class="form-section"><div class="section-content" style="display:block;">'
      + _ico('loader', 14) + ' 加载审计日志...</div></section>';
    panel.style.display = 'block';

    await loadPluginAudit(50);
    var audit = pluginStore.audit;
    var html = '<section class="form-section">'
      + '<header class="section-header"><h3>' + _ico('file', 16) + ' \u5ba1\u8ba1\u65e5\u5fd7\uff08\u6700\u8fd1 50 \u6761\uff09</h3></header>'
      + '<div class="section-content" style="display:block;">';

    var entries = (audit && audit.entries) || audit || [];
 if (audit && Array.isArray(audit.events)) entries = audit.events;
    if (!Array.isArray(entries)) entries = [];

    if (entries.length === 0) {
      html += '<p style="color:var(--text-muted);">暂无审计记录</p>';
    } else {
      html += '<div class="plugin-audit-list">';
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var auditTime = String(e.ts || e.timestamp || e.time || '').trim();
        var auditAction = String(e.event_type || e.action || e.event || '').trim();
        if (e.level && e.level !== 'info') {
          auditAction += auditAction ? ' · ' + String(e.level) : String(e.level);
        }
        var auditDetail = _formatPluginAuditDetail(e);
        html += '<div class="plugin-audit-item">'
          + '<span class="plugin-audit-time">' + escapeHtml(auditTime) + '</span>'
          + '<span class="plugin-audit-action">' + escapeHtml(auditAction) + '</span>'
          + '<span class="plugin-audit-detail">' + escapeHtml(auditDetail) + '</span>'
          + '</div>';
      }
      html += '</div>';
    }

    html += '</div></section>';
    panel.innerHTML = html;
  }

  async function pluginSavePytorchOptimizerSettings() {
    const pluginId = 'lulynx.optimizer.pytorch_optimizer';
    const exposeAll = !!document.getElementById('po-expose-all')?.checked;
    const visible = Array.from(document.querySelectorAll('.po-visible-optimizer:checked'))
      .map((el) => String(el.value || '').trim())
      .filter(Boolean);

    const result = await savePluginSettings(pluginId, {
      expose_all_optimizers: exposeAll,
      visible_optimizers: visible,
    });
    if (result?.success === false || result?.ok === false) {
      showToast('⚠ 保存插件设置失败: ' + (result?.error || '未知错误'));
      return;
    }

    const nextVisible = exposeAll ? [] : visible.map((name) => `pytorch_optimizer.${name}`);
    localStorage.setItem('sd-rescripts:visible-optimizers', JSON.stringify(nextVisible));
    showToast('✓ PyTorch Optimizer 插件设置已保存');
    await window.refreshBackendConfigOptions?.();
    _loadAndRenderPlugins();
  }

  async function pluginResetPytorchOptimizerSettings() {
    const pluginId = 'lulynx.optimizer.pytorch_optimizer';
    const resp = await getPluginSettings(pluginId);
    const payload = resp?.data || resp || {};
    const defaults = payload.defaults || {};
    const result = await savePluginSettings(pluginId, defaults);
    if (result?.success === false || result?.ok === false) {
      showToast('⚠ 重置插件设置失败: ' + (result?.error || '未知错误'));
      return;
    }

    const defaultVisible = defaults.expose_all_optimizers === true
      ? []
      : Array.isArray(defaults.visible_optimizers)
      ? defaults.visible_optimizers.map((name) => `pytorch_optimizer.${name}`)
      : [];
    localStorage.setItem('sd-rescripts:visible-optimizers', JSON.stringify(defaultVisible));
    showToast('✓ 已恢复 PyTorch Optimizer 插件默认设置');
    await window.refreshBackendConfigOptions?.();
    _loadAndRenderPlugins();
  }

  return {
    pluginToggleDevMode,
    pluginReloadAll,
    pluginApprove,
    pluginRevoke,
    pluginExecuteSdkRunner,
    pluginShowAudit,
    pluginSavePytorchOptimizerSettings,
    pluginResetPytorchOptimizerSettings,
  };
}
