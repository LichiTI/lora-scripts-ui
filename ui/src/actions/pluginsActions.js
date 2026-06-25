// actions/pluginsActions.js — 插件中心 actions
//   pluginToggleDevMode / pluginReloadAll / pluginApprove / pluginApproveRunner / pluginRevoke / pluginShowAudit
//
// 依赖（工厂注入）：api层（toggleDeveloperMode/reloadAllPlugins/approvePlugin/approvePluginRunner/revokePlugin/loadPluginAudit）
//   pluginStore, _formatPluginAuditDetail, _loadAndRenderPlugins（都是 renderer/pluginHost 提供）
//   showToast

import { escapeHtml, _ico } from '../utils/dom.js';

export function createPluginsActions({
  pluginStore,
  toggleDeveloperMode,
  reloadAllPlugins,
  approvePlugin,
  approvePluginRunner,
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

  async function pluginApproveRunner(pluginId, runnerId) {
    var result = await approvePluginRunner(pluginId, runnerId);
    if (result.ok) {
      showToast('✓ Runner ' + runnerId + ' 已审批');
    } else {
      showToast('⚠ Runner 审批失败: ' + (result.error || '未知错误'));
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

  function pluginDomId(pluginId) {
    return String(pluginId || '').replace(/[^A-Za-z0-9_-]/g, '_');
  }

  function pluginSettingsBody(pluginId) {
    return document.getElementById('plugin-settings-body-' + pluginDomId(pluginId));
  }

  function normalizePluginSettingsPayload(resp) {
    return resp?.data || resp || {};
  }

  function pluginFieldId(pluginId, key) {
    return 'plugin-setting-' + pluginDomId(pluginId) + '-' + pluginDomId(key);
  }

  function specOptions(spec) {
    const options = Array.isArray(spec?.options) ? spec.options : [];
    return options.map((item) => {
      if (item && typeof item === 'object') {
        return {
          value: String(item.value ?? item.id ?? item.key ?? item.label ?? ''),
          label: String(item.label ?? item.name ?? item.value ?? item.id ?? item.key ?? ''),
        };
      }
      return { value: String(item ?? ''), label: String(item ?? '') };
    }).filter((item) => item.value);
  }

  function isReadonlySpec(spec) {
    return spec?.readonly === true || String(spec?.readonly || '').toLowerCase() === 'true';
  }

  function fieldDisplayValue(spec, value) {
    if (spec && Object.prototype.hasOwnProperty.call(spec, 'value')) return spec.value;
    return value;
  }

  function renderReadonlyValue(value) {
    if (Array.isArray(value)) {
      if (value.length === 0) return '<span class="plugin-settings-empty">暂无数据</span>';
      return '<div class="plugin-settings-readonly-tags">'
        + value.map((item) => '<span>' + escapeHtml(String(item ?? '')) + '</span>').join('')
        + '</div>';
    }
    return '<div class="plugin-settings-readonly-value">' + escapeHtml(String(value ?? '')) + '</div>';
  }

  function renderPluginSettingField(pluginId, key, spec, value) {
    spec = spec && typeof spec === 'object' ? spec : {};
    const type = String(spec.type || 'string').toLowerCase();
    const label = String(spec.label || spec.title || key);
    const desc = String(spec.description || spec.hint || '');
    value = fieldDisplayValue(spec, value);
    const id = pluginFieldId(pluginId, key);
    const commonAttrs = ' data-plugin-setting-key="' + escapeHtml(key) + '" data-plugin-setting-type="' + escapeHtml(type) + '"';
    let control = '';

    if (isReadonlySpec(spec) || type === 'info' || type === 'stat' || type === 'readonly' || type === 'list') {
      control = renderReadonlyValue(value);
    } else if (type === 'boolean') {
      control = '<label class="plugin-settings-toggle">'
        + '<input id="' + escapeHtml(id) + '" type="checkbox"' + commonAttrs + (value === true ? ' checked' : '') + '> '
        + '<span>' + escapeHtml(label) + '</span>'
        + '</label>';
    } else if (type === 'select') {
      const options = specOptions(spec);
      control = '<select id="' + escapeHtml(id) + '" class="plugin-settings-control"' + commonAttrs + '>';
      for (const option of options) {
        control += '<option value="' + escapeHtml(option.value) + '" ' + (String(value ?? '') === option.value ? 'selected' : '') + '>'
          + escapeHtml(option.label)
          + '</option>';
      }
      control += '</select>';
    } else if (type === 'multiselect') {
      const options = specOptions(spec);
      const selected = new Set(Array.isArray(value) ? value.map(String) : []);
      control = '<div class="plugin-settings-multiselect"' + commonAttrs + '>';
      if (options.length === 0) {
        control += '<span class="plugin-settings-empty">暂无可选项</span>';
      }
      for (const option of options) {
        control += '<label>'
          + '<input type="checkbox" data-plugin-setting-key="' + escapeHtml(key) + '" data-plugin-setting-type="multiselect" value="' + escapeHtml(option.value) + '" ' + (selected.has(option.value) ? 'checked' : '') + '> '
          + '<span>' + escapeHtml(option.label) + '</span>'
          + '</label>';
      }
      control += '</div>';
    } else if (type === 'textarea') {
      control = '<textarea id="' + escapeHtml(id) + '" class="plugin-settings-control" rows="3"' + commonAttrs + '>'
        + escapeHtml(String(value ?? ''))
        + '</textarea>';
    } else if (type === 'number' || type === 'float' || type === 'integer' || type === 'int') {
      const step = type === 'integer' || type === 'int' ? '1' : String(spec.step ?? 'any');
      const min = spec.min != null ? ' min="' + escapeHtml(String(spec.min)) + '"' : '';
      const max = spec.max != null ? ' max="' + escapeHtml(String(spec.max)) + '"' : '';
      control = '<input id="' + escapeHtml(id) + '" class="plugin-settings-control" type="number" step="' + escapeHtml(step) + '"' + min + max + commonAttrs + ' value="' + escapeHtml(String(value ?? '')) + '">';
    } else {
      const inputType = type === 'password' ? 'password' : 'text';
      control = '<input id="' + escapeHtml(id) + '" class="plugin-settings-control" type="' + inputType + '"' + commonAttrs + ' value="' + escapeHtml(String(value ?? '')) + '">';
    }

    return '<div class="plugin-settings-field">'
      + (type === 'boolean' && !isReadonlySpec(spec) ? control : '<label for="' + escapeHtml(id) + '">' + escapeHtml(label) + '</label>' + control)
      + (desc ? '<p>' + escapeHtml(desc) + '</p>' : '')
      + '</div>';
  }

  function hasWritableSettings(schema, keys) {
    return keys.some((key) => {
      const spec = schema[key] && typeof schema[key] === 'object' ? schema[key] : {};
      const type = String(spec.type || 'string').toLowerCase();
      return !isReadonlySpec(spec) && !['info', 'stat', 'readonly', 'list'].includes(type);
    });
  }

  function renderPluginSettingsForm(pluginId, payload) {
    const schema = payload.schema && typeof payload.schema === 'object' ? payload.schema : {};
    const values = payload.values && typeof payload.values === 'object' ? payload.values : {};
    const keys = Object.keys(schema);
    let html = '<div class="plugin-settings-form" data-plugin-settings-form="' + escapeHtml(pluginId) + '">';
    if (keys.length === 0) {
      html += '<div class="plugin-settings-empty">这个插件没有声明可渲染的设置项。</div>';
    } else {
      for (const key of keys) {
        html += renderPluginSettingField(pluginId, key, schema[key], values[key]);
      }
    }
    if (hasWritableSettings(schema, keys)) {
      html += '<div class="plugin-settings-actions">'
        + '<button class="btn btn-outline btn-sm" type="button" onclick="pluginResetSettings(' + JSON.stringify(pluginId).replace(/"/g, '&quot;') + ')">恢复默认</button>'
        + '<button class="btn btn-primary btn-sm" type="button" onclick="pluginSaveSettings(' + JSON.stringify(pluginId).replace(/"/g, '&quot;') + ')">保存设置</button>'
        + '</div>';
    }
    html += '</div>';
    return html;
  }

  async function pluginToggleSettingsPanel(pluginId) {
    const body = pluginSettingsBody(pluginId);
    if (!body) return;
    if (body.style.display !== 'none' && body.innerHTML.trim()) {
      body.style.display = 'none';
      return;
    }
    body.style.display = 'block';
    body.innerHTML = '<div class="plugin-settings-loading">' + _ico('loader', 14) + ' 加载插件设置...</div>';
    try {
      const payload = normalizePluginSettingsPayload(await getPluginSettings(pluginId));
      body.innerHTML = renderPluginSettingsForm(pluginId, payload);
    } catch (error) {
      body.innerHTML = '<div class="plugin-card-error">加载插件设置失败: ' + escapeHtml(error?.message || String(error)) + '</div>';
    }
  }

  function collectPluginSettingsFromDom(pluginId) {
    const body = pluginSettingsBody(pluginId);
    const result = {};
    if (!body) return result;
    const fields = body.querySelectorAll('[data-plugin-setting-key]');
    fields.forEach((field) => {
      const key = String(field.getAttribute('data-plugin-setting-key') || '').trim();
      const type = String(field.getAttribute('data-plugin-setting-type') || 'string').toLowerCase();
      if (field.getAttribute('data-plugin-setting-readonly') === 'true') return;
      if (!key || Object.prototype.hasOwnProperty.call(result, key)) return;
      if (type === 'boolean') {
        result[key] = !!field.checked;
      } else if (type === 'multiselect') {
        result[key] = Array.from(body.querySelectorAll('[data-plugin-setting-key="' + CSS.escape(key) + '"][data-plugin-setting-type="multiselect"]:checked'))
          .map((el) => String(el.value || ''));
      } else if (type === 'integer' || type === 'int') {
        result[key] = parseInt(field.value || '0', 10);
      } else if (type === 'number' || type === 'float') {
        result[key] = parseFloat(field.value || '0');
      } else {
        result[key] = String(field.value || '');
      }
    });
    return result;
  }

  async function pluginSaveSettings(pluginId) {
    const settings = collectPluginSettingsFromDom(pluginId);
    const result = await savePluginSettings(pluginId, settings);
    if (result?.success === false || result?.ok === false) {
      showToast('⚠ 保存插件设置失败: ' + (result?.error || '未知错误'));
      return;
    }
    showToast('✓ 插件设置已保存');
    syncPytorchOptimizerLocalSettings(pluginId, settings);
    await window.refreshBackendConfigOptions?.();
    const body = pluginSettingsBody(pluginId);
    if (body) {
      const payload = normalizePluginSettingsPayload(result.settings || await getPluginSettings(pluginId));
      body.innerHTML = renderPluginSettingsForm(pluginId, payload);
      body.style.display = 'block';
    }
  }

  async function pluginResetSettings(pluginId) {
    const payload = normalizePluginSettingsPayload(await getPluginSettings(pluginId));
    const defaults = payload.defaults || {};
    const result = await savePluginSettings(pluginId, defaults);
    if (result?.success === false || result?.ok === false) {
      showToast('⚠ 重置插件设置失败: ' + (result?.error || '未知错误'));
      return;
    }
    showToast('✓ 已恢复插件默认设置');
    syncPytorchOptimizerLocalSettings(pluginId, defaults);
    await window.refreshBackendConfigOptions?.();
    const body = pluginSettingsBody(pluginId);
    if (body) {
      const nextPayload = normalizePluginSettingsPayload(result.settings || await getPluginSettings(pluginId));
      body.innerHTML = renderPluginSettingsForm(pluginId, nextPayload);
      body.style.display = 'block';
    }
  }

  async function pluginSavePytorchOptimizerSettings() {
    await pluginSaveSettings('lulynx.optimizer.pytorch_optimizer');
  }

  async function pluginResetPytorchOptimizerSettings() {
    await pluginResetSettings('lulynx.optimizer.pytorch_optimizer');
  }

  function syncPytorchOptimizerLocalSettings(pluginId, settings) {
    if (pluginId !== 'lulynx.optimizer.pytorch_optimizer') return;
    const exposeAll = settings.expose_all_optimizers === true;
    const visible = Array.isArray(settings.visible_optimizers) ? settings.visible_optimizers : [];
    const rawLimit = Number.parseInt(String(settings.max_visible_optimizers ?? visible.length), 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : visible.length;
    const nextVisible = exposeAll ? [] : visible.slice(0, limit).map((name) => `pytorch_optimizer.${name}`);
    try {
      localStorage.setItem('sd-rescripts:visible-optimizers', JSON.stringify(nextVisible));
    } catch (_error) {
      // Storage sync is a UI convenience; persisted plugin settings remain authoritative.
    }
  }

  return {
    pluginToggleDevMode,
    pluginReloadAll,
    pluginApprove,
    pluginApproveRunner,
    pluginRevoke,
    pluginExecuteSdkRunner,
    pluginShowAudit,
    pluginToggleSettingsPanel,
    pluginSaveSettings,
    pluginResetSettings,
    pluginSavePytorchOptimizerSettings,
    pluginResetPytorchOptimizerSettings,
  };
}
