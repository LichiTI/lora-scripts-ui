// renderers/plugins.js — 插件中心渲染（运行时概览 + 列表 + Slot 注册表）

import { escapeHtml, _ico } from '../utils/dom.js';

export function createPluginsRenderer({ pluginStore, loadPluginRuntime, loadPluginSdkStatus, getRegisteredSlots, api }) {
  function renderPlugins(container) {
    container.innerHTML = '<div class="form-container">'
      + '<header class="section-title">'
      + '<h2>' + _ico('package', 20) + ' 插件中心</h2>'
      + '<p>管理后端插件运行时状态。插件系统仅支持新 UI。</p>'
      + '</header>'
      + '<div id="plugin-center-content" style="color:var(--text-muted);font-size:0.85rem;">'
      + _ico('loader', 14) + ' 加载插件信息...'
      + '</div>'
      + '</div>';
    _loadAndRenderPlugins();
  }

  async function _loadAndRenderPlugins() {
    var el = document.getElementById('plugin-center-content');
    if (!el) return;

    await loadPluginRuntime();
    if (typeof loadPluginSdkStatus === 'function') {
      await loadPluginSdkStatus();
    }

    if (pluginStore.error) {
      el.innerHTML = '<section class="form-section">'
        + '<div class="section-content" style="display:block;">'
        + '<div class="plugin-offline-banner">'
        + _ico('alert-tri', 16) + ' 插件服务不可用'
        + '<p style="margin:8px 0 0;font-size:0.78rem;color:var(--text-muted);">' + escapeHtml(pluginStore.error) + '</p>'
        + '<p style="margin:4px 0 0;font-size:0.72rem;color:var(--text-dim);">后端可能尚未启用插件系统，或接口未就绪。这不影响正常训练功能。</p>'
        + '</div>'
        + '</div></section>';
      return;
    }

    var rt = pluginStore.runtime;
    if (!rt) {
      el.innerHTML = '<section class="form-section"><div class="section-content" style="display:block;">'
        + '<p style="color:var(--text-muted);">未获取到插件运行时数据</p>'
        + '</div></section>';
      return;
    }

    var html = '';
    var devMode = rt.developer_mode;
    var orch = (rt.orchestrator && typeof rt.orchestrator === 'object') ? rt.orchestrator : {};
    var plugins = [];
    if (Array.isArray(rt.plugins)) {
      plugins = rt.plugins;
    } else if (orch.plugins && typeof orch.plugins === 'object') {
      plugins = Object.keys(orch.plugins).map(function(pluginId) {
        var item = orch.plugins[pluginId] || {};
        var state = String(item.state || '').toLowerCase();
        return Object.assign({}, item, {
          plugin_id: pluginId,
          name: item.name || item.display_name || pluginId,
          loaded: state === 'active' || state === 'loaded',
          load_error: item.error || '',
        });
      });
    }
    var totalCount = rt.total_count ?? rt.plugin_count ?? orch.plugin_count ?? plugins.length;
    var enabledCount = rt.enabled_count ?? rt.active_count ?? orch.active_count ?? plugins.filter(function(p) { return p.loaded; }).length;
    var loadedCount = rt.loaded_count ?? rt.active_count ?? orch.active_count ?? plugins.filter(function(p) { return p.loaded; }).length;

    html += '<section class="form-section">'
      + '<header class="section-header"><h3>' + _ico('activity', 16) + ' 运行时概览</h3></header>'
      + '<div class="section-content" style="display:block;">'
      + '<div class="plugin-stats-grid">'
      + _pluginStatCard('总插件数', totalCount, 'package')
      + _pluginStatCard('已启用', enabledCount, 'check-circle')
      + _pluginStatCard('已加载', loadedCount, 'zap')
      + _pluginStatCard('执行模式', rt.execution_mode || (devMode ? 'developer' : 'policy'), 'shield')
      + '</div>'
      + '<div class="plugin-controls-row">'
      + '<label class="plugin-toggle-label">'
      + '<input type="checkbox" id="plugin-dev-mode-toggle" ' + (devMode ? 'checked' : '') + ' onchange="pluginToggleDevMode(this.checked)">'
      + ' 开发者模式'
      + '</label>'
      + '<button class="btn btn-outline btn-sm" type="button" onclick="pluginReloadAll()">' + _ico('refresh-cw', 12) + ' 重新加载全部</button>'
      + '<button class="btn btn-outline btn-sm" type="button" onclick="pluginShowAudit()">' + _ico('file', 12) + ' 审计日志</button>'
      + '</div>'
      + '<div style="font-size:0.7rem;color:var(--text-dim);margin-top:6px;">'
      + '插件根目录: ' + escapeHtml(rt.plugin_root|| '—')
      + '</div>'
      + '</div></section>';

    html += '<section class="form-section">'
      + '<header class="section-header"><h3>' + _ico('package', 16) + ' 插件列表 (' + plugins.length + ')</h3></header>'
      + '<div class="section-content" style="display:block;">';

    if (plugins.length === 0) {
      html += '<p style="color:var(--text-muted);padding:12px 0;">暂无已安装的插件</p>';
    } else {
      html += '<div class="plugin-list">';
      for (var i = 0; i < plugins.length; i++) {
        html += _renderPluginCard(plugins[i]);
      }
      html += '</div>';
    }
    html += '</div></section>';

    html += _renderSdkRunnerSection(pluginStore.sdk);

    var slots = getRegisteredSlots();
    html += '<section class="form-section">'
      + '<header class="section-header"><h3>' + _ico('layout', 16) + ' UI 扩展挂载点</h3></header>'
      + '<div class="section-content" style="display:block;">'
      + '<div class="plugin-slot-list">';
    for (var s = 0; s < slots.length; s++) {
      var sl = slots[s];
      html += '<div class="plugin-slot-item">'
        + '<code>' + escapeHtml(sl.id) + '</code>'
        + '<span class="plugin-slot-label">' + escapeHtml(sl.label) + '</span>'
        + '<span class="plugin-slot-count">' + sl.contributionCount + ' 个贡献</span>'
        + '</div>';
    }
    html += '</div></div></section>';
    html += '<div id="plugin-audit-panel" style="display:none;"></div>';
    el.innerHTML = html;
  }

  function _pluginStatCard(label, value, icon) {
    return '<div class="plugin-stat-card">'
      + '<div class="plugin-stat-icon">' + _ico(icon, 16) + '</div>'
      + '<div class="plugin-stat-info">'
      + '<div class="plugin-stat-value">' + escapeHtml(String(value)) + '</div>'
      + '<div class="plugin-stat-label">' + escapeHtml(label) + '</div>'
      + '</div></div>';
  }

  function _pluginOnClickArg(value) {
    return escapeHtml(JSON.stringify(String(value ?? '')));
  }

  function _formatListTags(items) {
    if (!Array.isArray(items) || items.length === 0) return '<span class="plugin-tag">无</span>';
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var label = String(items[i] || '').trim();
      if (!label) continue;
      html += '<span class="plugin-tag">' + escapeHtml(label) + '</span>';
    }
    return html || '<span class="plugin-tag">无</span>';
  }

  function _renderSdkRunnerSection(sdkStatus) {
    var runners = [];
    if (sdkStatus && Array.isArray(sdkStatus.runner_capabilities)) {
      runners = sdkStatus.runner_capabilities;
    } else if (sdkStatus && Array.isArray(sdkStatus.runners)) {
      runners = sdkStatus.runners;
    }

    var html = '<section class="form-section">'
      + '<header class="section-header"><h3>' + _ico('terminal', 16) + ' SDK Runner</h3></header>'
      + '<div class="section-content" style="display:block;">';

    if (!sdkStatus) {
      html += '<p style="color:var(--text-muted);font-size:0.78rem;">SDK 状态暂不可用。后端未启动或插件 SDK 接口未就绪时会显示此状态。</p>';
    } else if (runners.length === 0) {
      html += '<p style="color:var(--text-muted);font-size:0.78rem;">当前没有插件声明 SDK Runner。</p>';
    } else {
      html += '<div class="plugin-list">';
      for (var i = 0; i < runners.length; i++) {
        html += _renderSdkRunnerCard(runners[i]);
      }
      html += '</div>';
    }
    html += '</div></section>';
    return html;
  }

  function _renderSdkRunnerCard(runner) {
    runner = runner || {};
    var review = runner.permission_review && typeof runner.permission_review === 'object'
      ? runner.permission_review
      : null;
    var runnerId = String(runner.runner_id || runner.id || '').trim();
    var pluginId = String((review && review.plugin_id) || runner.plugin_id || '').trim();
    var schemas = Array.isArray(runner.schema_ids) ? runner.schema_ids : [];
    if (schemas.length === 0 && Array.isArray(runner.request_schema_ids)) schemas = runner.request_schema_ids;
    if (schemas.length === 0 && runner.request_schema_id) schemas = [runner.request_schema_id];
    if (schemas.length === 0 && review && review.request_schema_id) schemas = [review.request_schema_id];
    var permissions = Array.isArray(runner.permissions) ? runner.permissions : [];
    if (permissions.length === 0 && review && Array.isArray(review.required_permissions)) permissions = review.required_permissions;
    var artifacts = review && Array.isArray(review.artifact_types) ? review.artifact_types : [];
    var schemaPolicy = review && review.schema_policy && typeof review.schema_policy === 'object' ? review.schema_policy : null;
    var entrypointPolicy = review && review.entrypoint_policy && typeof review.entrypoint_policy === 'object' ? review.entrypoint_policy : null;
    var sandboxPolicy = review && review.sandbox_policy && typeof review.sandbox_policy === 'object' ? review.sandbox_policy : null;
    var safeRootRoles = schemaPolicy && Array.isArray(schemaPolicy.safe_root_roles) ? schemaPolicy.safe_root_roles : [];
    var pathIntents = schemaPolicy && Array.isArray(schemaPolicy.path_intents) ? schemaPolicy.path_intents : [];
    var warnings = review && Array.isArray(review.warnings) ? review.warnings : [];
    var approvalReady = runner.approval_ready === true || runner.approved === true;
    if (review && typeof review.approval_ready === 'boolean') approvalReady = review.approval_ready;
    var executionAvailable = runner.execution_available !== false;
    if (review && typeof review.execution_available === 'boolean') executionAvailable = review.execution_available;
    var statusText = approvalReady && executionAvailable ? '可试运行' : (approvalReady ? '等待执行环境' : '待审批');
    var statusColor = approvalReady && executionAvailable ? 'var(--success)' : (approvalReady ? 'var(--warning)' : 'var(--danger)');
    var schemaForRun = schemas.length > 0 ? schemas[0] : '';

    var html = '<div class="plugin-card">'
      + '<div class="plugin-card-header">'
      + '<div class="plugin-card-title">'
      + '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + statusColor + ';"></span> '
      + '<strong>' + escapeHtml(runnerId || 'unnamed.runner') + '</strong>'
      + '<span class="plugin-version">' + escapeHtml(statusText) + '</span>'
      + '</div>'
      + '<div class="plugin-card-actions">';

    if (!approvalReady && pluginId && runnerId) {
      html += '<button class="btn btn-sm" style="background:var(--success);color:#fff;font-size:0.7rem;padding:2px 8px;" type="button" onclick="pluginApproveRunner(' + _pluginOnClickArg(pluginId) + ', ' + _pluginOnClickArg(runnerId) + ')">审批 Runner</button>';
      html += '<button class="btn btn-outline btn-sm" style="font-size:0.7rem;padding:2px 8px;" type="button" onclick="pluginApprove(' + _pluginOnClickArg(pluginId) + ')">审批插件</button>';
    }
    if (approvalReady && executionAvailable && runnerId) {
      html += '<button class="btn btn-outline btn-sm" style="font-size:0.7rem;padding:2px 8px;" type="button" onclick="pluginExecuteSdkRunner(' + _pluginOnClickArg(runnerId) + ', ' + _pluginOnClickArg(schemaForRun) + ')">提交试运行</button>';
    }
    html += '</div></div>';

    html += '<div class="plugin-card-meta">'
      + '<span>插件: <code>' + escapeHtml(pluginId || '—') + '</code></span>'
      + '<span>执行: ' + escapeHtml(executionAvailable ? '可用' : '不可用') + '</span>'
      + '</div>';

    html += '<div class="plugin-card-tags"><span class="plugin-tag-label">Schema:</span>' + _formatListTags(schemas) + '</div>';
    html += '<div class="plugin-card-tags"><span class="plugin-tag-label">权限:</span>' + _formatListTags(permissions) + '</div>';
    if (artifacts.length > 0) {
      html += '<div class="plugin-card-tags"><span class="plugin-tag-label">产物:</span>' + _formatListTags(artifacts) + '</div>';
    }
    if (safeRootRoles.length > 0 || pathIntents.length > 0) {
      html += '<div class="plugin-card-tags"><span class="plugin-tag-label">路径策略:</span>'
        + _formatListTags(safeRootRoles.map(function(role) { return 'root:' + role; }).concat(pathIntents.map(function(intent) { return 'intent:' + intent; })))
        + '</div>';
    }
    if (review && review.request_schema && review.request_schema.schema_path) {
      html += '<div class="plugin-card-meta"><span>Schema 文件: <code>'
        + escapeHtml(review.request_schema.schema_path)
        + '</code></span></div>';
    }
    if (entrypointPolicy && entrypointPolicy.entrypoint) {
      html += '<div class="plugin-card-meta"><span>入口: <code>'
        + escapeHtml(entrypointPolicy.entrypoint)
        + '</code></span><span>'
        + escapeHtml(entrypointPolicy.available ? '已解析' : '需检查')
        + '</span></div>';
    }
    if (sandboxPolicy && sandboxPolicy.execution_mode) {
      var elevated = Array.isArray(sandboxPolicy.elevated_permissions) ? sandboxPolicy.elevated_permissions : [];
      html += '<div class="plugin-card-meta"><span>隔离: <code>'
        + escapeHtml(sandboxPolicy.execution_mode)
        + '</code></span><span>'
        + escapeHtml(String(sandboxPolicy.timeout_seconds || 30))
        + 's</span>';
      if (elevated.length > 0) {
        html += '<span>高权限: ' + escapeHtml(elevated.join(', ')) + '</span>';
      }
      html += '</div>';
    }
    if (warnings.length > 0) {
      html += '<div class="plugin-card-meta" style="color:var(--warning,#f59e0b);">'
        + _ico('alert-tri', 12) + ' '
        + escapeHtml(String(warnings[0].message || warnings[0].code || '需要检查插件声明'))
        + '</div>';
    }
    return html + '</div>';
  }

  function _pluginReasonLabel(reason) {
    var mapping = {
      unsigned: '未签名',
      missing_declared_hash: '缺少声明哈希',
      declared_hash_mismatch: '签名哈希不匹配',
      ed25519_verifier_unavailable: '签名校验器不可用',
      unsupported_signature_scheme: '不支持的签名方案',
      no_approval_record: '没有审批记录',
      capability_not_approved: '能力未审批',
      hash_denied: '插件哈希已被拒绝',
      signer_revoked: '签名者已撤销',
      allowlist_match: '已通过社区核验',
      allowlist_miss: '未通过社区核验',
      not_required: '无需核验',
    };
    return mapping[String(reason || '').trim()] || String(reason || '').trim();
  }

  function _formatPluginHook(hook) {
    if (typeof hook === 'string') return hook;
    if (!hook || typeof hook !== 'object') return '';
    var eventName = String(hook.event || hook.name || hook.id || '').trim();
    var handlerName = String(hook.handler || '').trim();
    var trainingTypes = Array.isArray(hook.training_types)
      ? hook.training_types.map(function(item) { return String(item || '').trim();}).filter(Boolean)
      : [];
    var details = [];
    if (handlerName) details.push(handlerName);
    if (trainingTypes.length > 0) details.push(trainingTypes.join('/'));
    if (hook.mutable === true || hook.runtime_mutable === true) details.push('mutable');
    if (!eventName) {
      if (details.length > 0) return details.join(' · ');
      try { return JSON.stringify(hook); } catch (err) { return String(hook); }
    }
    return eventName + (details.length > 0 ? ' · ' + details.join(' · ') : '');
  }

  function _collectPluginTrustTags(p) {
    var policy = (p && p.policy && typeof p.policy === 'object') ? p.policy : {};
    var signature = (p && p.signature && typeof p.signature === 'object') ? p.signature : {};
    var approval = (p && p.approval && typeof p.approval === 'object') ? p.approval : {};
    var trust = (p && p.trust && typeof p.trust === 'object') ? p.trust : {};
    var tags = [];

    var signatureScheme = String(signature.scheme || '').trim().toLowerCase();
    var signatureSigner = String(signature.signer || '').trim();
    if (signature.ok === true && signatureScheme && signatureScheme !== 'none') {
      tags.push(_ico('shield', 10) + ' 签名通过' + (signatureSigner ? ' · ' + escapeHtml(signatureSigner) : ''));
    } else if (signature.ok === false) {
      tags.push(_ico('shield', 10) + ' 签名异常' + (signature.reason ? ' · ' + escapeHtml(_pluginReasonLabel(signature.reason)) : ''));
    } else if (policy.requires_trust_verification) {
      tags.push(_ico('shield', 10) + ' 未签名');
    }

    var approvalRecord = approval.record && typeof approval.record === 'object' ? approval.record : null;
    var approvalGranted = approval.approved === true || policy.approved === true || approvalRecord !== null;
    if (policy.requires_user_approval || approvalGranted || approval.reason) {
      if (approvalGranted) {
        tags.push(_ico('check-circle', 10) + ' 已审批');
      } else {
        tags.push(_ico('alert-tri', 10) + ' 待审批' + (approval.reason ? ' · ' + escapeHtml(_pluginReasonLabel(approval.reason)) : ''));
      }
    }

    if (policy.requires_trust_verification || trust.ok === false || trust.matched_allowlist) {
      if (trust.ok === true || policy.trust_ok === true) {
        tags.push(_ico('shield', 10) + ' 社区核验通过');
      } else {
        tags.push(_ico('alert-tri', 10) + ' 社区核验未通过' + (trust.reason ? ' · ' + escapeHtml(_pluginReasonLabel(trust.reason)) : ''));
      }
    }
    return tags;
  }

  function _formatPluginAuditDetail(entry) {
    if (!entry || typeof entry !== 'object') return '';
    var payload = entry.payload && typeof entry.payload === 'object' ? entry.payload : null;
    var parts = [];
    var pluginId = String(entry.plugin_id || '').trim();
    if (pluginId) parts.push(pluginId);
    if (!payload) return parts.join(' — ');
    var payloadMessage = '';
    if (typeof payload.message === 'string' && payload.message.trim()) {
      payloadMessage = payload.message.trim();
    } else if (typeof payload.reason === 'string' && payload.reason.trim()) {
      payloadMessage = _pluginReasonLabel(payload.reason);
    } else if (typeof payload.error === 'string' && payload.error.trim()) {
      payloadMessage = payload.error.trim();
    } else if (Array.isArray(payload.missing_capabilities) && payload.missing_capabilities.length > 0) {
      payloadMessage = '缺少能力: ' + payload.missing_capabilities.join(', ');
    } else if (Array.isArray(payload.capabilities) && payload.capabilities.length > 0) {
      payloadMessage = '能力: ' + payload.capabilities.join(', ');
    } else {
      try {
        var serialized = JSON.stringify(payload);
        if (serialized && serialized !== '{}') payloadMessage = serialized;
      } catch (err) {
        payloadMessage = String(payload);
      }
    }
    if (payloadMessage) parts.push(payloadMessage);
    return parts.join(' — ');
  }

  function _renderPluginCard(p) {
    var isLoaded = p.loaded === true || p.active === true;
    var loadError = p.load_error || p.error || '';
    var statusColor = isLoaded ? 'var(--success)' : (loadError ? 'var(--danger)' : 'var(--text-muted)');
    var statusText = isLoaded ? '已加载' : (loadError ? '加载失败' : '未加载');
    var statusDot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + statusColor + ';"></span>';
    var policy = (p && p.policy && typeof p.policy === 'object') ? p.policy : {};
    var approval = (p && p.approval && typeof p.approval === 'object') ? p.approval : {};
    var requiresApproval = policy.requires_user_approval === true;
    var approvalRecord = approval.record && typeof approval.record === 'object' ? approval.record : null;
    var approvalGranted = approval.approved === true || policy.approved === true || approvalRecord !== null;
    var canApprove = requiresApproval && !approvalGranted;
    var canRevoke = approvalGranted;
    var actionPluginId = _pluginOnClickArg(p.plugin_id);
    var tierBadge = '';
    if (p.tier != null) {
      var tierColors = { 0: 'var(--success)', 1: 'var(--info)', 2: 'var(--warning)', 3: 'var(--danger)' };
      tierBadge = '<span class="plugin-tier-badge" style="background:' + (tierColors[p.tier] || 'var(--text-muted)') + ';">Tier ' + p.tier + '</span>';
    }

    var html = '<div class="plugin-card">'
      + '<div class="plugin-card-header">'
      + '<div class="plugin-card-title">'
      + statusDot + ' '
      + '<strong>' + escapeHtml(p.name || p.plugin_id) + '</strong>'
      + (p.version ? ' <span class="plugin-version">v' + escapeHtml(p.version) + '</span>' : '')
      + tierBadge
      + '</div>'
      + '<div class="plugin-card-actions">';

    if (canApprove) {
      html += '<button class="btn btn-sm" style="background:var(--success);color:#fff;font-size:0.7rem;padding:2px 8px;" type="button" onclick="pluginApprove(' + actionPluginId + ')">审批</button>';
    }
    if (canRevoke) {
      html += '<button class="btn btn-outline btn-sm" style="font-size:0.7rem;padding:2px 8px;" type="button" onclick="pluginRevoke(' + actionPluginId + ')">撤销审批</button>';
    }
    html += '</div></div>';

    if (p.description) {
      html += '<div class="plugin-card-desc">' + escapeHtml(p.description) + '</div>';
    }

    html += '<div class="plugin-card-meta">';
    html += '<span>ID: <code>' + escapeHtml(p.plugin_id) + '</code></span>';
    html += '<span>状态: <span style="color:' + statusColor + ';font-weight:600;">' + statusText + '</span></span>';
    if (p.enabled != null) html += '<span>' + (p.enabled ? '✓ 已启用' : '✗ 已禁用') + '</span>';
    if (p.execution_allowed != null) html += '<span>' + (p.execution_allowed ? '✓ 已授权执行' : '✗ 未授权') + '</span>';
    html += '</div>';

    if (loadError) {
      html += '<div class="plugin-card-error">' + _ico('x-circle', 12) + ' ' + escapeHtml(loadError) + '</div>';
    }

    if (p.capabilities && p.capabilities.length > 0) {
      html += '<div class="plugin-card-tags"><span class="plugin-tag-label">能力:</span>';
      for (var c = 0; c < p.capabilities.length; c++) {
        html += '<span class="plugin-tag">' + escapeHtml(p.capabilities[c]) + '</span>';
      }
      html += '</div>';
    }

    var hooks = Array.isArray(p.registered_hooks) && p.registered_hooks.length > 0
      ? p.registered_hooks
      : (Array.isArray(p.hooks) ? p.hooks : []);
    if (hooks.length > 0) {
      html += '<div class="plugin-card-tags"><span class="plugin-tag-label">钩子:</span>';
      for (var h = 0; h < hooks.length; h++) {
        var hookLabel = _formatPluginHook(hooks[h]);
        if (!hookLabel) continue;
        html += '<span class="plugin-tag plugin-tag-hook">' + escapeHtml(hookLabel) + '</span>';
      }
      html += '</div>';
    }

    var trustTags = _collectPluginTrustTags(p);
    if (trustTags.length > 0) {
      html += '<div class="plugin-card-tags"><span class="plugin-tag-label">信任:</span>';
      for (var tIndex = 0; tIndex < trustTags.length; tIndex++) {
        html += '<span class="plugin-tag">' + trustTags[tIndex] + '</span>';
      }
      html += '</div>';
    }

    if (_pluginHasSettingsPanel(p)) {
      html += _renderPluginSettingsPanel(p);
    }

    html += '</div>';
    return html;
  }

  function _pluginHasSettingsPanel(plugin) {
    var panel = plugin && plugin.settings_panel && typeof plugin.settings_panel === 'object' ? plugin.settings_panel : null;
    if (!panel) return false;
    return _pluginSettingsFieldCount(panel) > 0;
  }

  function _pluginSettingsFieldCount(panel) {
    var schema = panel && panel.settings_schema && typeof panel.settings_schema === 'object' ? panel.settings_schema : {};
    return Object.keys(schema).length;
  }

  function _renderPluginSettingsPanel(plugin) {
    var pluginId = String(plugin.plugin_id || plugin.id || '').trim();
    if (!pluginId) return '';
    var panel = plugin.settings_panel && typeof plugin.settings_panel === 'object' ? plugin.settings_panel : {};
    var title = String(panel.title || '插件控制面板');
    var desc = String(panel.description || '这个插件声明了自己的高级设置。');
    var fieldCount = _pluginSettingsFieldCount(panel);
    return '<div class="plugin-card-settings plugin-settings-panel" data-plugin-settings-panel="' + escapeHtml(pluginId) + '">'
      + '<div class="plugin-settings-header">'
      + '<div class="plugin-settings-title-block">'
      + '<strong>' + escapeHtml(title) + '</strong>'
      + '<span>' + escapeHtml(desc) + '</span>'
      + '</div>'
      + '<button class="btn btn-outline btn-sm" type="button" onclick="pluginToggleSettingsPanel(' + _pluginOnClickArg(pluginId) + ')">'
      + _ico('settings', 12) + ' 设置'
      + '</button>'
      + '</div>'
      + '<div class="plugin-settings-preview">' + fieldCount + ' 个可配置项</div>'
      + '<div class="plugin-settings-body" id="plugin-settings-body-' + escapeHtml(_pluginDomId(pluginId)) + '" style="display:none;"></div>'
      + '</div>';
  }

  function _pluginDomId(pluginId) {
    return String(pluginId || '').replace(/[^A-Za-z0-9_-]/g, '_');
  }

  return {
    renderPlugins,
    _loadAndRenderPlugins,
    _formatPluginAuditDetail,
  };
}
