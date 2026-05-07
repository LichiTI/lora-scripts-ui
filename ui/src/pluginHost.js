/**
 * pluginHost.js — 新 UI 插件宿主层
 *
 * 职责：
 * 1. slotRegistry — 管理白名单化的 UI 扩展挂载点
 * 2. pluginRuntimeStore — 插件运行时状态管理
 * 3. 错误隔离 — 插件渲染失败不拖垮页面
 *
 * 设计原则：
 * - slot 必须白名单化，插件只能挂到定义好的 slot
 * - 无插件时返回空结果，不影响原有布局
 * - 插件内容渲染失败时自动降级
 */

import { api } from './api.js';

// ═══════════════════════════════════════════════════════
// Slot Registry — 白名单化的 UI 扩展挂载点
// ═══════════════════════════════════════════════════════

const BUILTIN_SLOTS = {
  'settings.section':           { label: '设置页扩展区块', multiple: true },
  'config.after_status_deck':   { label: '配置页状态卡片后', multiple: true },
  'training.runtime_widget':    { label: '训练页运行时组件', multiple: true },
  'tools.entry':                { label: '工具页入口', multiple: true },
  'training.preflight_panel':   { label: '训练预检扩展面板', multiple: true },
};

// slot 贡献存储: { slotId: [ { pluginId, render, priority } ] }
const _slotContributions = {};

for (const id of Object.keys(BUILTIN_SLOTS)) {
  _slotContributions[id] = [];
}

/**
 * 注册一个 slot 贡献
 * @param {string} slotId - 必须是 BUILTIN_SLOTS 中的 key
 * @param {object} contribution - { pluginId, render: () => string, priority?: number }
 */
export function registerSlotContribution(slotId, contribution) {
  if (!BUILTIN_SLOTS[slotId]) {
    console.warn('[PluginHost] Unknown slot "' + slotId + '", ignored.');
    return false;
  }
  if (typeof contribution.render !== 'function') {
    console.warn('[PluginHost] Contribution to "' + slotId + '" missing render(), ignored.');
    return false;
  }
  _slotContributions[slotId].push({
    pluginId: contribution.pluginId || 'unknown',
    render: contribution.render,
    priority: contribution.priority || 0,
  });
  _slotContributions[slotId].sort(function(a, b) { return b.priority - a.priority; });
  return true;
}

/**
 * 渲染指定 slot 的所有贡献，带错误隔离
 * @param {string} slotId
 * @returns {string} HTML 字符串，无贡献时返回空字符串
 */
export function renderSlot(slotId) {
  if (!BUILTIN_SLOTS[slotId]) return '';
  var contributions = _slotContributions[slotId];
  if (!contributions || contributions.length === 0) return '';

  var html = '';
  for (var i = 0; i < contributions.length; i++) {
    var c = contributions[i];
    try {
      var result = c.render();
      if (typeof result === 'string' && result.trim()) {
        html += result;
      }
    } catch (err) {
      console.error('[PluginHost] Slot "' + slotId + '" render error from plugin "' + c.pluginId + '":', err);
      html += '<div class="plugin-slot-error">插件 ' + c.pluginId + ' 渲染失败</div>';
    }
  }
  return html;
}

/**
 * 获取所有已注册的 slot 信息
 */
export function getRegisteredSlots() {
  return Object.keys(BUILTIN_SLOTS).map(function(id) {
    return {
      id: id,
      label: BUILTIN_SLOTS[id].label,
      multiple: BUILTIN_SLOTS[id].multiple,
      contributionCount: _slotContributions[id] ? _slotContributions[id].length : 0,
    };
  });
}

// ═══════════════════════════════════════════════════════
// Plugin Runtime Store — 插件运行时状态管理
// ═══════════════════════════════════════════════════════

export var pluginStore = {
  runtime: null,       // /api/plugins/runtime 返回的完整数据
  capabilities: null,  // /api/plugins/capabilities
  hooks: null,         // /api/plugins/hooks
  audit: null,         // /api/plugins/audit
  loading: false,
  error: '',
};

/** 加载插件运行时状态 */
export async function loadPluginRuntime() {
  pluginStore.loading = true;
  pluginStore.error = '';
  try {
    var resp = await api.getPluginRuntime();
    pluginStore.runtime = (resp && resp.data) ? resp.data : null;
  } catch (e) {
    pluginStore.error = e.message || '无法连接插件服务';
    pluginStore.runtime = null;
  } finally {
    pluginStore.loading = false;
  }
}

/** 加载插件能力列表 */
export async function loadPluginCapabilities() {
  try {
    var resp = await api.getPluginCapabilities();
    pluginStore.capabilities = (resp && resp.data) ? resp.data : null;
  } catch (e) {
    pluginStore.capabilities = null;
  }
}

/** 加载插件钩子列表 */
export async function loadPluginHooks() {
  try {
    var resp = await api.getPluginHooks();
    pluginStore.hooks = (resp && resp.data) ? resp.data : null;
  } catch (e) {
    pluginStore.hooks = null;
  }
}

/** 加载审计日志 */
export async function loadPluginAudit(limit) {
  try {
    var resp = await api.getPluginAudit(limit || 50);
    pluginStore.audit = (resp && resp.data) ? resp.data : null;
  } catch (e) {
    pluginStore.audit = null;
  }
}

/** 重新加载所有插件 */
export async function reloadAllPlugins() {
  try {
    await api.reloadPlugins();
    await loadPluginRuntime();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** 审批插件 */
export async function approvePlugin(pluginId) {
  try {
    await api.approvePlugin(pluginId);
    await loadPluginRuntime();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** 撤销插件审批 */
export async function revokePlugin(pluginId) {
  try {
    await api.revokePluginApproval(pluginId);
    await loadPluginRuntime();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** 切换开发者模式 */
export async function toggleDeveloperMode(enabled) {
  try {
    await api.setPluginDeveloperMode(enabled);
    await loadPluginRuntime();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
