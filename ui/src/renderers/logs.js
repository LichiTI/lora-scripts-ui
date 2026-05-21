// renderers/logs.js — TensorBoard iframe 页面

import { api } from '../api.js';

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
    </div>
  `;
  refreshTensorBoardStatus().then((data) => {
    if (data && data.available !== false && data.running !== true) {
      startTensorBoardFromLogs();
    }
  });
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
