// renderers/logs.js — TensorBoard iframe 页面

import { api } from '../api.js';
import { escapeHtml, showToast } from '../utils/dom.js';

const webuiErrorState = {
  errors: [],
  meta: {},
  kindFilter: 'all',
  kindOptions: new Set(),
  query: '',
  expanded: new Set(),
};

function _defaultTensorBoardUrl(statusPayload) {
  if (statusPayload && statusPayload.url) return statusPayload.url;
  const customTbUrl = localStorage.getItem('sd-rescripts:tensorboard-url')?.trim();
  return customTbUrl || `http://${location.hostname}:6006`;
}

function _defaultLogdir(statusPayload) {
  if (statusPayload && statusPayload.logdir) return statusPayload.logdir;
  return localStorage.getItem('sd-rescripts:tensorboard-logdir')?.trim() || './logs';
}

export function renderLogs(container) {
  const savedLogdir = localStorage.getItem('sd-rescripts:tensorboard-logdir')?.trim() || './logs';
  const customTbUrl = localStorage.getItem('sd-rescripts:tensorboard-url')?.trim();
  const tbUrl = customTbUrl || `http://${location.hostname}:6006`;
  container.innerHTML = `
    <div class="form-container">
      <header class="section-title">
        <h2>TensorBoard</h2>
        <p>训练日志可视化，查看损失曲线、学习率变化与样本图。</p>
      </header>
      <section class="form-section">
        <header class="section-header"><h3>TensorBoard 控制</h3></header>
        <div class="section-content" style="display:block;">
          <div id="tb-status" style="font-size:0.85rem;color:var(--text-muted);margin-bottom:10px;">正在读取状态...</div>
          <div class="settings-row" style="align-items:center;gap:10px;flex-wrap:wrap;">
            <label>日志目录</label>
            <input class="text-input" type="text" id="tb-logdir" value="${savedLogdir}" placeholder="./logs" style="min-width:280px;">
            <button class="btn btn-primary btn-sm" type="button" onclick="startTensorBoardFromLogs()">启动 / 连接</button>
            <button class="btn btn-outline btn-sm" type="button" onclick="stopTensorBoardFromLogs()">停止</button>
            <button class="btn btn-outline btn-sm" type="button" onclick="refreshTensorBoardStatus()">刷新状态</button>
            <a class="btn btn-outline btn-sm" id="tb-open-link" href="${tbUrl}" target="_blank" rel="noopener">新窗口打开</a>
          </div>
        </div>
      </section>
      <section class="form-section" style="padding:0;overflow:hidden;">
        <iframe id="tb-iframe" src="${tbUrl}" style="width:100%;height:calc(100vh - 340px);min-height:500px;border:none;border-radius:12px;background:var(--bg-panel);"
          onload="var r=document.getElementById('tb-retry');if(r)r.style.display='none'"
          onerror="var r=document.getElementById('tb-retry');if(r)r.style.display='block'"></iframe>
        <div id="tb-retry" style="display:none;text-align:center;padding:40px;color:var(--text-dim);">
          <p>TensorBoard 加载失败。可能尚未启动、端口被占用，或日志目录暂无事件文件。</p>
          <button class="btn btn-outline btn-sm" type="button" onclick="refreshTensorBoardStatus(true)">重试连接</button>
        </div>
      </section>
      <section class="form-section">
        <header class="section-header">
          <h3>前端错误</h3>
          <button class="btn btn-outline btn-sm" type="button" onclick="refreshWebuiErrorLogs()">刷新</button>
        </header>
        <div class="section-content" style="display:block;">
          <div class="settings-row" style="align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
            <label>类型</label>
            <select class="text-input" id="webui-error-kind-filter" style="width:220px;max-width:100%;">
              <option value="all">全部类型</option>
            </select>
            <label>搜索</label>
            <input class="text-input" type="search" id="webui-error-query" placeholder="消息 / URL / 接口" style="width:260px;max-width:100%;">
          </div>
          <div id="webui-error-status" style="font-size:0.85rem;color:var(--text-muted);margin-bottom:10px;">正在读取错误日志...</div>
          <div id="webui-error-list" style="display:flex;flex-direction:column;gap:8px;"></div>
        </div>
      </section>
    </div>
  `;
  refreshTensorBoardStatus().then((data) => {
    if (data && data.available !== false && data.running !== true) {
      startTensorBoardFromLogs();
    }
  });
  document.getElementById('webui-error-kind-filter')?.addEventListener('change', (event) => {
    webuiErrorState.kindFilter = event.target?.value || 'all';
    refreshWebuiErrorLogs();
  });
  document.getElementById('webui-error-query')?.addEventListener('input', (event) => {
    webuiErrorState.query = event.target?.value?.trim() || '';
    clearTimeout(webuiErrorState.queryTimer);
    webuiErrorState.queryTimer = setTimeout(() => refreshWebuiErrorLogs(), 250);
  });
  document.getElementById('webui-error-list')?.addEventListener('click', handleWebuiErrorListClick);
  refreshWebuiErrorLogs();
}

function formatWebuiErrorTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return date.toLocaleString();
}

function webuiErrorKey(item, index) {
  return `${item?.timestamp || ''}:${item?.kind || ''}:${item?.message || ''}:${index}`;
}

function filteredWebuiErrors() {
  return webuiErrorState.errors.map((item, index) => ({ item, index }));
}

function updateWebuiErrorKindOptions(errors) {
  const select = document.getElementById('webui-error-kind-filter');
  if (!select) return;
  for (const item of errors) webuiErrorState.kindOptions.add(String(item?.kind || 'webui_error'));
  if (webuiErrorState.kindFilter && webuiErrorState.kindFilter !== 'all') webuiErrorState.kindOptions.add(webuiErrorState.kindFilter);
  const kinds = Array.from(webuiErrorState.kindOptions).sort();
  if (webuiErrorState.kindFilter !== 'all' && !kinds.includes(webuiErrorState.kindFilter)) {
    webuiErrorState.kindFilter = 'all';
  }
  select.innerHTML = [
    '<option value="all">全部类型</option>',
    ...kinds.map((kind) => `<option value="${escapeHtml(kind)}">${escapeHtml(kind)}</option>`),
  ].join('');
  select.value = webuiErrorState.kindFilter;
}

function updateWebuiErrorStatus() {
  const statusEl = document.getElementById('webui-error-status');
  if (!statusEl) return;
  const visibleCount = filteredWebuiErrors().length;
  const totalCount = webuiErrorState.errors.length;
  const data = webuiErrorState.meta || {};
  const bits = [webuiErrorState.kindFilter === 'all' && !webuiErrorState.query ? `${totalCount} 条最近错误` : `${visibleCount} 条匹配错误`];
  if (data.retention_days) bits.push(`保留 ${data.retention_days} 天`);
  if (data.removed_old_files) bits.push(`已清理 ${data.removed_old_files} 个旧文件`);
  statusEl.textContent = bits.join(' · ');
}

function stringifyWebuiError(item) {
  return JSON.stringify(item || {}, null, 2);
}

function renderWebuiErrorItem(item, index) {
  const key = webuiErrorKey(item, index);
  const isExpanded = webuiErrorState.expanded.has(key);
  const kind = escapeHtml(item?.kind || 'webui_error');
  const message = escapeHtml(item?.message || 'WebUI error');
  const time = escapeHtml(formatWebuiErrorTime(item?.timestamp));
  const url = escapeHtml(item?.url || '');
  const detailJson = escapeHtml(stringifyWebuiError(item));
  const detailBits = [];
  if (item?.context?.path) detailBits.push(`接口: ${item.context.path}`);
  if (item?.context?.status) detailBits.push(`状态: ${item.context.status}`);
  if (item?.client_host) detailBits.push(`客户端: ${item.client_host}`);
  if (item?.file) detailBits.push(`文件: ${item.file}`);
  const details = escapeHtml(detailBits.join(' · '));
  return `
    <article style="border:1px solid var(--border-color);border-radius:8px;padding:10px 12px;background:var(--bg-panel);">
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;">
        <strong style="font-size:0.9rem;color:var(--text-primary);">${kind}</strong>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-size:0.78rem;color:var(--text-muted);">${time}</span>
          <button class="btn btn-outline btn-sm webui-error-toggle" type="button" data-key="${escapeHtml(key)}">${isExpanded ? '收起' : '详情'}</button>
          <button class="btn btn-outline btn-sm webui-error-copy" type="button" data-index="${index}">复制</button>
        </div>
      </div>
      <div style="margin-top:6px;font-size:0.9rem;color:var(--text-primary);white-space:pre-wrap;overflow-wrap:anywhere;">${message}</div>
      ${details ? `<div style="margin-top:6px;font-size:0.78rem;color:var(--text-muted);overflow-wrap:anywhere;">${details}</div>` : ''}
      ${url ? `<div style="margin-top:4px;font-size:0.78rem;color:var(--text-muted);overflow-wrap:anywhere;">${url}</div>` : ''}
      <pre style="display:${isExpanded ? 'block' : 'none'};margin:10px 0 0;padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-sunken, rgba(0,0,0,0.08));color:var(--text-muted);font-size:0.78rem;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto;">${detailJson}</pre>
    </article>
  `;
}

function renderWebuiErrorList() {
  const listEl = document.getElementById('webui-error-list');
  updateWebuiErrorStatus();
  if (!listEl) return;
  const visible = filteredWebuiErrors();
  listEl.innerHTML = visible.length
    ? visible.map(({ item, index }) => renderWebuiErrorItem(item, index)).join('')
    : '<div style="color:var(--text-muted);font-size:0.9rem;padding:10px 0;">暂无前端错误记录。</div>';
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

async function handleWebuiErrorListClick(event) {
  const button = event.target?.closest?.('button');
  if (!button) return;
  if (button.classList.contains('webui-error-toggle')) {
    const key = button.dataset.key || '';
    if (webuiErrorState.expanded.has(key)) webuiErrorState.expanded.delete(key);
    else webuiErrorState.expanded.add(key);
    renderWebuiErrorList();
    return;
  }
  if (button.classList.contains('webui-error-copy')) {
    const index = Number(button.dataset.index);
    const item = Number.isFinite(index) ? webuiErrorState.errors[index] : null;
    if (!item) return;
    try {
      await copyText(stringifyWebuiError(item));
      showToast('已复制前端错误');
    } catch (_error) {
      showToast('复制失败');
    }
  }
}

export async function refreshWebuiErrorLogs(limit = 80) {
  const statusEl = document.getElementById('webui-error-status');
  const listEl = document.getElementById('webui-error-list');
  if (statusEl) statusEl.textContent = '正在读取错误日志...';
  try {
    const resp = await api.getWebuiErrors({ limit, kind: webuiErrorState.kindFilter, q: webuiErrorState.query });
    const data = resp?.data || {};
    const errors = Array.isArray(data.errors) ? data.errors : [];
    webuiErrorState.errors = errors;
    webuiErrorState.meta = data;
    updateWebuiErrorKindOptions(errors);
    renderWebuiErrorList();
    return data;
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message || '无法读取前端错误日志';
    if (listEl) listEl.innerHTML = '';
  }
  return null;
}

export async function refreshTensorBoardStatus(reloadIframe = false) {
  const statusEl = document.getElementById('tb-status');
  const logdirInput = document.getElementById('tb-logdir');
  const logdir = logdirInput?.value?.trim() || './logs';
  try {
    const resp = await api.getTensorBoardStatus(logdir);
    const data = resp?.data || {};
    const url = _defaultTensorBoardUrl(data);
    const resolvedLogdir = _defaultLogdir(data);
    if (logdirInput && resolvedLogdir && logdirInput.value !== resolvedLogdir) {
      logdirInput.value = resolvedLogdir;
    }
    localStorage.setItem('sd-rescripts:tensorboard-logdir', logdir);
    const open = document.getElementById('tb-open-link');
    if (open) open.href = url;
    if (statusEl) {
      const bits = [];
      bits.push(data.running ? '✅ 运行中' : '⏸ 未运行');
      if (data.available === false) bits.push('TensorBoard 包不可用');
      if (data.has_events === false) bits.push('暂无事件文件');
      if (data.logdir) bits.push('日志目录: ' + data.logdir);
      if (data.reason) bits.push(data.reason);
      statusEl.textContent = bits.join(' · ');
    }
    if (reloadIframe || data.running) {
      const iframe = document.getElementById('tb-iframe');
      if (iframe) iframe.src = url;
    }
    return data;
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message || '无法获取 TensorBoard 状态';
  }
  return null;
}

export async function startTensorBoardFromLogs() {
  const logdir = document.getElementById('tb-logdir')?.value?.trim() || './logs';
  localStorage.setItem('sd-rescripts:tensorboard-logdir', logdir);
  try {
    await api.startTensorBoard(logdir, 6006);
  } finally {
    await refreshTensorBoardStatus(true);
  }
}

export async function stopTensorBoardFromLogs() {
  try {
    await api.stopTensorBoard();
  } finally {
    await refreshTensorBoardStatus(false);
  }
}
