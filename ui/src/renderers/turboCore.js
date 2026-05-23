// renderers/turboCore.js — TurboCore 开发者入口
// 仅负责前端占位与状态探测，不要求后端接口已经存在。

import { escapeHtml, _ico } from '../utils/dom.js';

export function renderTurboCore(container) {
  container.innerHTML = `
    <div class="form-container turbocore-page">
      <header class="section-title turbocore-hero">
        <div>
          <h2>${_ico('zap', 22)} TurboCore</h2>
          <p>CUDA-Rust / 自研算子 / 训练管理器重写的实验性入口。当前先接入 UI，不依赖后端可用性。</p>
        </div>
        <span class="turbocore-badge">DEV ONLY</span>
      </header>

      <section class="form-section turbocore-section">
        <header class="section-header"><h3>${_ico('activity', 16)} 路线状态</h3></header>
        <div class="section-content" style="display:block;">
          <div class="turbocore-grid">
            ${_card('CUDA-Rust Bridge', '先期支持', '为后续 CUDA-Rust 生态推进预留接入层。')}
            ${_card('Attention Kernels', '规划迁移', '后续可将部分 attention 算子切到 Rust/CUDA 后端。')}
            ${_card('Manager Rewrite', '预留入口', '现存训练/资源管理器未来可逐步迁移到自研 Rust 实现。')}
            ${_card('PyTorch Fallback', '保持兼容', '后端未接入时 UI 仍可打开，仅显示占位和探测信息。')}
          </div>
        </div>
      </section>

      <section class="form-section turbocore-section">
        <header class="section-header"><h3>${_ico('terminal', 16)} 后端探测</h3></header>
        <div class="section-content" style="display:block;">
          <p class="turbocore-muted">当前按钮只做前端适配：如果未来后端提供 <code>/api/turbocore/status</code>，这里会显示真实状态；接口不存在或后端未启动时不会影响 UI。</p>
          <div class="turbocore-actions">
            <button class="btn btn-primary" type="button" onclick="turboCoreProbeStatus()">${_ico('activity', 12)} 探测 TurboCore</button>
            <button class="btn btn-outline" type="button" onclick="turboCoreCopyFlags()">${_ico('code', 12)} 复制实验标记</button>
          </div>
          <pre id="turbocore-status" class="turbocore-status">未探测。TurboCore 入口已在开发者模式下启用。</pre>
        </div>
      </section>

      <section class="form-section turbocore-section">
        <header class="section-header"><h3>${_ico('shield', 16)} 集成边界</h3></header>
        <div class="section-content" style="display:block;">
          <ul class="turbocore-list">
            <li>默认不改变训练配置、不替换现有 PyTorch 路径。</li>
            <li>未来后端接入后建议采用 capability probe：可用则启用，不可用则自动 fallback。</li>
            <li>算子迁移建议从 attention / memory manager / resource scheduler 等高收益区域开始。</li>
            <li>此入口仅在插件开发者模式开启时显示，普通用户不会看到。</li>
          </ul>
        </div>
      </section>
    </div>
  `;
}

function _card(title, status, desc) {
  return '<div class="turbocore-card">'
    + '<div class="turbocore-card-title">' + escapeHtml(title) + '</div>'
    + '<div class="turbocore-card-status">' + escapeHtml(status) + '</div>'
    + '<p>' + escapeHtml(desc) + '</p>'
    + '</div>';
}

export async function turboCoreProbeStatus() {
  const el = document.getElementById('turbocore-status');
  if (!el) return;
  el.textContent = '正在探测 /api/turbocore/status ...';
  try {
    const response = await fetch('/api/turbocore/status', { cache: 'no-store' });
    const text = await response.text();
    let body = text;
    try {
      body = JSON.stringify(JSON.parse(text), null, 2);
    } catch (_e) { /* keep text */ }
    el.textContent = 'HTTP ' + response.status + '\n' + body;
  } catch (error) {
    el.textContent = 'TurboCore 后端尚未就绪或服务未启动。\n' + (error?.message || String(error));
  }
}

export async function turboCoreCopyFlags() {
  const flags = [
    'LULYNX_TURBOCORE=experimental',
    'LULYNX_TURBOCORE_BACKEND=cuda-rust',
    'LULYNX_TURBOCORE_FALLBACK=pytorch',
  ].join('\n');
  try {
    await navigator.clipboard.writeText(flags);
    const el = document.getElementById('turbocore-status');
    if (el) el.textContent = '已复制实验标记：\n' + flags;
  } catch (_e) {
    const el = document.getElementById('turbocore-status');
    if (el) el.textContent = flags;
  }
}
