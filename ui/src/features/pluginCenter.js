import { escapeHtml, icon as _ico } from '../utils/dom.js';

export function renderPluginCenterShell() {
  return '<div class="form-container">'
    + '<header class="section-title">'
    + '<h2>' + _ico('package', 20) + ' 插件中心</h2>'
    + '<p>管理后端插件运行时状态。插件系统仅支持新 UI。</p>'
    + '</header>'
    + '<div id="plugin-center-content" style="color:var(--text-muted);font-size:0.85rem;">'
    + _ico('loader', 14) + ' 加载插件信息...'
    + '</div>'
    + '</div>';
}

export function renderPluginOfflineState(error) {
  return '<section class="form-section">'
    + '<div class="section-content" style="display:block;">'
    + '<div class="plugin-offline-banner">'
    + _ico('alert-tri', 16) + ' 插件服务不可用'
    + '<p style="margin:8px 0 0;font-size:0.78rem;color:var(--text-muted);">' + escapeHtml(error) + '</p>'
    + '<p style="margin:4px 0 0;font-size:0.72rem;color:var(--text-dim);">后端可能尚未启用插件系统，或接口未就绪。这不影响正常训练功能。</p>'
    + '</div>'
    + '</div></section>';
}

export function renderPluginRuntimeEmpty() {
  return '<section class="form-section"><div class="section-content" style="display:block;">'
    + '<p style="color:var(--text-muted);">未获取到插件运行时数据</p>'
    + '</div></section>';
}

export function renderPluginCenterContent(runtime, slots = []) {
  const rt = runtime || {};
  const plugins = rt.plugins || [];
  let html = '';

  html += renderPluginRuntimeOverview(rt);
  html += renderPluginList(plugins);
  html += renderPluginSlots(slots);
  html += '<div id="plugin-audit-panel" style="display:none;"></div>';

  return html;
}

export function renderPluginAuditLoading() {
  return '<section class="form-section"><div class="section-content" style="display:block;">'
    + _ico('loader', 14) + ' 加载审计日志...</div></section>';
}

export function renderPluginAuditPanel(audit) {
  let html = '<section class="form-section">'
    + '<header class="section-header"><h3>' + _ico('file', 16) + ' 审计日志（最近 50 条）</h3></header>'
    + '<div class="section-content" style="display:block;">';

  let entries = (audit && audit.entries) || audit || [];
  if (audit && Array.isArray(audit.events)) entries = audit.events;
  if (!Array.isArray(entries)) entries = [];

  if (entries.length === 0) {
    html += '<p style="color:var(--text-muted);">暂无审计记录</p>';
  } else {
    html += '<div class="plugin-audit-list">';
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const auditTime = String(entry.ts || entry.timestamp || entry.time || '').trim();
      let auditAction = String(entry.event_type || entry.action || entry.event || '').trim();
      if (entry.level && entry.level !== 'info') {
        auditAction += auditAction ? ' · ' + String(entry.level) : String(entry.level);
      }
      const auditDetail = formatPluginAuditDetail(entry);
      html += '<div class="plugin-audit-item">'
        + '<span class="plugin-audit-time">' + escapeHtml(auditTime) + '</span>'
        + '<span class="plugin-audit-action">' + escapeHtml(auditAction) + '</span>'
        + '<span class="plugin-audit-detail">' + escapeHtml(auditDetail) + '</span>'
        + '</div>';
    }
    html += '</div>';
  }

  html += '</div></section>';
  return html;
}

function renderPluginRuntimeOverview(rt) {
  const devMode = rt.developer_mode;
  const totalCount = rt.total_count || 0;
  const enabledCount = rt.enabled_count || 0;
  const loadedCount = rt.loaded_count || 0;

  return '<section class="form-section">'
    + '<header class="section-header"><h3>' + _ico('activity', 16) + ' 运行时概览</h3></header>'
    + '<div class="section-content" style="display:block;">'
    + '<div class="plugin-stats-grid">'
    + pluginStatCard('总插件数', totalCount, 'package')
    + pluginStatCard('已启用', enabledCount, 'check-circle')
    + pluginStatCard('已加载', loadedCount, 'zap')
    + pluginStatCard('执行模式', rt.execution_mode || '—', 'shield')
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
    + '插件根目录: ' + escapeHtml(rt.plugin_root || '—')
    + '</div>'
    + '</div></section>';
}

function renderPluginList(plugins) {
  let html = '<section class="form-section">'
    + '<header class="section-header"><h3>' + _ico('package', 16) + ' 插件列表 (' + plugins.length + ')</h3></header>'
    + '<div class="section-content" style="display:block;">';

  if (plugins.length === 0) {
    html += '<p style="color:var(--text-muted);padding:12px 0;">暂无已安装的插件</p>';
  } else {
    html += '<div class="plugin-list">';
    for (let i = 0; i < plugins.length; i++) {
      html += renderPluginCard(plugins[i]);
    }
    html += '</div>';
  }

  html += '</div></section>';
  return html;
}

function renderPluginSlots(slots) {
  let html = '<section class="form-section">'
    + '<header class="section-header"><h3>' + _ico('layout', 16) + ' UI 扩展挂载点</h3></header>'
    + '<div class="section-content" style="display:block;">'
    + '<div class="plugin-slot-list">';

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    html += '<div class="plugin-slot-item">'
      + '<code>' + escapeHtml(slot.id) + '</code>'
      + '<span class="plugin-slot-label">' + escapeHtml(slot.label) + '</span>'
      + '<span class="plugin-slot-count">' + slot.contributionCount + ' 个贡献</span>'
      + '</div>';
  }

  html += '</div></div></section>';
  return html;
}

function pluginStatCard(label, value, icon) {
  return '<div class="plugin-stat-card">'
    + '<div class="plugin-stat-icon">' + _ico(icon, 16) + '</div>'
    + '<div class="plugin-stat-info">'
    + '<div class="plugin-stat-value">' + escapeHtml(String(value)) + '</div>'
    + '<div class="plugin-stat-label">' + escapeHtml(label) + '</div>'
    + '</div></div>';
}

function pluginOnClickArg(value) {
  return escapeHtml(JSON.stringify(String(value ?? '')));
}

function pluginReasonLabel(reason) {
  const mapping = {
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

function formatPluginHook(hook) {
  if (typeof hook === 'string') return hook;
  if (!hook || typeof hook !== 'object') return '';

  const eventName = String(hook.event || hook.name || hook.id || '').trim();
  const handlerName = String(hook.handler || '').trim();
  const trainingTypes = Array.isArray(hook.training_types)
    ? hook.training_types.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const details = [];

  if (handlerName) details.push(handlerName);
  if (trainingTypes.length > 0) details.push(trainingTypes.join('/'));
  if (hook.mutable === true || hook.runtime_mutable === true) details.push('mutable');

  if (!eventName) {
    if (details.length > 0) return details.join(' · ');
    try {
      return JSON.stringify(hook);
    } catch (err) {
      return String(hook);
    }
  }

  return eventName + (details.length > 0 ? ' · ' + details.join(' · ') : '');
}

function collectPluginTrustTags(plugin) {
  const policy = (plugin && plugin.policy && typeof plugin.policy === 'object') ? plugin.policy : {};
  const signature = (plugin && plugin.signature && typeof plugin.signature === 'object') ? plugin.signature : {};
  const approval = (plugin && plugin.approval && typeof plugin.approval === 'object') ? plugin.approval : {};
  const trust = (plugin && plugin.trust && typeof plugin.trust === 'object') ? plugin.trust : {};
  const tags = [];

  const signatureScheme = String(signature.scheme || '').trim().toLowerCase();
  const signatureSigner = String(signature.signer || '').trim();
  if (signature.ok === true && signatureScheme && signatureScheme !== 'none') {
    tags.push(_ico('shield', 10) + ' 签名通过' + (signatureSigner ? ' · ' + escapeHtml(signatureSigner) : ''));
  } else if (signature.ok === false) {
    tags.push(_ico('shield', 10) + ' 签名异常' + (signature.reason ? ' · ' + escapeHtml(pluginReasonLabel(signature.reason)) : ''));
  } else if (policy.requires_trust_verification) {
    tags.push(_ico('shield', 10) + ' 未签名');
  }

  const approvalRecord = approval.record && typeof approval.record === 'object' ? approval.record : null;
  const approvalGranted = approval.approved === true || policy.approved === true || approvalRecord !== null;
  if (policy.requires_user_approval || approvalGranted || approval.reason) {
    if (approvalGranted) {
      tags.push(_ico('check-circle', 10) + ' 已审批');
    } else {
      tags.push(_ico('alert-tri', 10) + ' 待审批' + (approval.reason ? ' · ' + escapeHtml(pluginReasonLabel(approval.reason)) : ''));
    }
  }

  if (policy.requires_trust_verification || trust.ok === false || trust.matched_allowlist) {
    if (trust.ok === true || policy.trust_ok === true) {
      tags.push(_ico('shield', 10) + ' 社区核验通过');
    } else {
      tags.push(_ico('alert-tri', 10) + ' 社区核验未通过' + (trust.reason ? ' · ' + escapeHtml(pluginReasonLabel(trust.reason)) : ''));
    }
  }

  return tags;
}

function formatPluginAuditDetail(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const payload = entry.payload && typeof entry.payload === 'object' ? entry.payload : null;
  const parts = [];
  const pluginId = String(entry.plugin_id || '').trim();

  if (pluginId) parts.push(pluginId);
  if (!payload) return parts.join(' — ');

  let payloadMessage = '';
  if (typeof payload.message === 'string' && payload.message.trim()) {
    payloadMessage = payload.message.trim();
  } else if (typeof payload.reason === 'string' && payload.reason.trim()) {
    payloadMessage = pluginReasonLabel(payload.reason);
  } else if (typeof payload.error === 'string' && payload.error.trim()) {
    payloadMessage = payload.error.trim();
  } else if (Array.isArray(payload.missing_capabilities) && payload.missing_capabilities.length > 0) {
    payloadMessage = '缺少能力: ' + payload.missing_capabilities.join(', ');
  } else if (Array.isArray(payload.capabilities) && payload.capabilities.length > 0) {
    payloadMessage = '能力: ' + payload.capabilities.join(', ');
  } else {
    try {
      const serialized = JSON.stringify(payload);
      if (serialized && serialized !== '{}') payloadMessage = serialized;
    } catch (err) {
      payloadMessage = String(payload);
    }
  }

  if (payloadMessage) parts.push(payloadMessage);
  return parts.join(' — ');
}

function renderPluginCard(plugin) {
  const statusColor = plugin.loaded ? '#22c55e' : (plugin.load_error ? '#ef4444' : 'var(--text-muted)');
  const statusText = plugin.loaded ? '已加载' : (plugin.load_error ? '加载失败' : '未加载');
  const statusDot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + statusColor + ';"></span>';
  const policy = (plugin && plugin.policy && typeof plugin.policy === 'object') ? plugin.policy : {};
  const approval = (plugin && plugin.approval && typeof plugin.approval === 'object') ? plugin.approval : {};
  const requiresApproval = policy.requires_user_approval === true;
  const approvalRecord = approval.record && typeof approval.record === 'object' ? approval.record : null;
  const approvalGranted = approval.approved === true || policy.approved === true || approvalRecord !== null;
  const canApprove = requiresApproval && !approvalGranted;
  const canRevoke = approvalGranted;
  const actionPluginId = pluginOnClickArg(plugin.plugin_id);

  let tierBadge = '';
  if (plugin.tier != null) {
    const tierColors = { 0: '#22c55e', 1: '#3b82f6', 2: '#f59e0b', 3: '#ef4444' };
    tierBadge = '<span class="plugin-tier-badge" style="background:' + (tierColors[plugin.tier] || 'var(--text-muted)') + ';">Tier ' + plugin.tier + '</span>';
  }

  let html = '<div class="plugin-card">'
    + '<div class="plugin-card-header">'
    + '<div class="plugin-card-title">'
    + statusDot + ' '
    + '<strong>' + escapeHtml(plugin.name || plugin.plugin_id) + '</strong>'
    + (plugin.version ? ' <span class="plugin-version">v' + escapeHtml(plugin.version) + '</span>' : '')
    + tierBadge
    + '</div>'
    + '<div class="plugin-card-actions">';

  if (canApprove) {
    html += '<button class="btn btn-sm" style="background:#22c55e;color:#fff;font-size:0.7rem;padding:2px 8px;" type="button" onclick="pluginApprove(' + actionPluginId + ')">审批</button>';
  }
  if (canRevoke) {
    html += '<button class="btn btn-outline btn-sm" style="font-size:0.7rem;padding:2px 8px;" type="button" onclick="pluginRevoke(' + actionPluginId + ')">撤销审批</button>';
  }

  html += '</div></div>';

  if (plugin.description) {
    html += '<div class="plugin-card-desc">' + escapeHtml(plugin.description) + '</div>';
  }

  html += '<div class="plugin-card-meta">';
  html += '<span>ID: <code>' + escapeHtml(plugin.plugin_id) + '</code></span>';
  html += '<span>状态: <span style="color:' + statusColor + ';font-weight:600;">' + statusText + '</span></span>';
  if (plugin.enabled != null) html += '<span>' + (plugin.enabled ? '✓ 已启用' : '✗ 已禁用') + '</span>';
  if (plugin.execution_allowed != null) html += '<span>' + (plugin.execution_allowed ? '✓ 已授权执行' : '✗ 未授权') + '</span>';
  html += '</div>';

  if (plugin.load_error) {
    html += '<div class="plugin-card-error">' + _ico('x-circle', 12) + ' ' + escapeHtml(plugin.load_error) + '</div>';
  }

  if (plugin.capabilities && plugin.capabilities.length > 0) {
    html += '<div class="plugin-card-tags"><span class="plugin-tag-label">能力:</span>';
    for (let i = 0; i < plugin.capabilities.length; i++) {
      html += '<span class="plugin-tag">' + escapeHtml(plugin.capabilities[i]) + '</span>';
    }
    html += '</div>';
  }

  const hooks = Array.isArray(plugin.registered_hooks) && plugin.registered_hooks.length > 0
    ? plugin.registered_hooks
    : (Array.isArray(plugin.hooks) ? plugin.hooks : []);
  if (hooks.length > 0) {
    html += '<div class="plugin-card-tags"><span class="plugin-tag-label">钩子:</span>';
    for (let i = 0; i < hooks.length; i++) {
      const hookLabel = formatPluginHook(hooks[i]);
      if (!hookLabel) continue;
      html += '<span class="plugin-tag plugin-tag-hook">' + escapeHtml(hookLabel) + '</span>';
    }
    html += '</div>';
  }

  const trustTags = collectPluginTrustTags(plugin);
  if (trustTags.length > 0) {
    html += '<div class="plugin-card-tags"><span class="plugin-tag-label">信任:</span>';
    for (let i = 0; i < trustTags.length; i++) {
      html += '<span class="plugin-tag">' + trustTags[i] + '</span>';
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}
