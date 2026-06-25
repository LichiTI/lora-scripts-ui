// renderers/statusDeck.js — 状态卡片渲染（GPU 信息、任务状态、运行环境状态面板）
// 依赖 state、escapeHtml、deps.renderPreflightDetail（通过 deps 对象延迟解析，
// 解决与 preflight 模块的循环依赖：preflight.renderPreflightOverviewPanel 反过来也调用 renderStatusDeck）

import { $, escapeHtml } from '../utils/dom.js';
import { getQueuedTasks, getRunningTasks } from '../utils/taskStatus.js';

export function createStatusDeckRenderer({ state, deps }) {
  // deps.renderPreflightDetail 在 preflight 工厂创建后注入；这里只在调用 renderStatusDeck 时取
  function _renderPreflightDetail() { return deps.renderPreflightDetail ? deps.renderPreflightDetail() : ''; }
  function renderGpuInfo() {
    if (state.runtimeError) return state.runtimeError;
    if (!state.runtime?.cards?.length) return '等待检测显卡信息';
    return state.runtime.cards.map((card) => {
      if (typeof card === 'string') return card;
      return card.name || JSON.stringify(card);
    }).join('，');
  }

  function renderStatusDeck() {
    const hasRuntime = !!state.runtime;
    const cards = Array.isArray(state.runtime?.cards) ? state.runtime.cards : [];
    const environment = state.runtime?.runtime?.environment || state.runtime?.environment || '';
    const runtimeLabel = state.runtimeError
      ? '离线'
      : state.loading.runtime
        ? '检测中...'
      : cards.length
        ? `${cards.length} 张显卡`
        : hasRuntime
          ? '无 CUDA 显卡'
          : '未检测';

    // === 注意力后端检测 ===
    const xf = state.runtime?.xformers;
    const rt = state.runtime?.runtime;
    const sagePkg = rt?.packages?.sageattention;
    const flashPkg = rt?.packages?.flash_attn;
    const xfInstalled = xf?.installed;
    const xfSupported = xf?.supported;
    const sageInstalled = sagePkg?.importable;
    const flashInstalled = flashPkg?.importable;

    let attnLabel = '检测中';
    let attnDetail = '暂无状态信息';
    if (xf || sagePkg || flashPkg) {
      const parts = [];
      if (xfInstalled) {
        parts.push(`xFormers ${xf.version || ''} ${xfSupported ? '✓' : '(不支持)'}`);
      } else {
        parts.push('xFormers 未安装');
      }
      if (sageInstalled) {
        parts.push(`SageAttention ${sagePkg.version || ''} ✓`);
      } else {
        parts.push('SageAttention 未安装');
      }
      if (flashInstalled) {
        parts.push(`FlashAttention ${flashPkg.version || ''} ✓`);
      } else {
        parts.push('FlashAttention 未安装');
      }
      attnLabel = (xfSupported || sageInstalled || flashInstalled) ? '可用' : '受限';
      attnDetail = parts.join(' · ');
      if (xf?.reason) attnDetail += ` — ${xf.reason}`;
    } else if (hasRuntime) {
      attnLabel = '自动';
      attnDetail = environment ? `当前运行环境：${environment}` : '未返回注意力包探测信息，将按训练预检/运行时自动选择';
    }

    const preflightLabel = state.preflight
      ? state.preflight.can_start
        ? '可以启动'
        : `${state.preflight.errors.length} 个错误`
      : '未检查';
    const runningCount = getRunningTasks(state.tasks).length;
    const queuedCount = getQueuedTasks(state.tasks).length;
    const taskCount = runningCount + queuedCount;
    const taskSub = taskCount > 0
      ? `运行 ${runningCount} 个 · 排队 ${queuedCount} 个`
      : '空闲';

    return `
      <div class="status-card">
        <span class="status-label">运行环境</span>
        <strong class="status-value">${escapeHtml(runtimeLabel)}</strong>
        <span class="status-sub">${escapeHtml(renderGpuInfo())}</span>
      </div>
      <div class="status-card">
        <span class="status-label">注意力后端</span>
        <strong class="status-value">${escapeHtml(attnLabel)}</strong>
        <span class="status-sub">${escapeHtml(attnDetail)}</span>
      </div>
      <div class="status-card">
        <span class="status-label">训练预检</span>
        <strong class="status-value">${escapeHtml(preflightLabel)}</strong>
        <span class="status-sub">${escapeHtml(_renderPreflightDetail())}</span>
      </div>
      <div class="status-card" id="task-status-card">
        <span class="status-label">任务</span>
        <strong class="status-value">${taskCount}</strong>
        <span class="status-sub">${escapeHtml(taskSub)}</span>
      </div>
    `;
  }

  function renderTaskStatus() {
    const taskCard = $('#task-status-card .status-value');
    const taskSub = $('#task-status-card .status-sub');
    if (!taskCard || !taskSub) {
      return;
    }

    // 后端离线提示
    if (state.backendOffline) {
      taskCard.textContent = '—';
      taskSub.innerHTML = '<span style="color:var(--danger);">⚠ 后端未连接 (28000)</span>';
      return;
    }

    const runningCount = getRunningTasks(state.tasks).length;
    const queuedCount = getQueuedTasks(state.tasks).length;
    taskCard.textContent = String(runningCount + queuedCount);
    taskSub.textContent = runningCount + queuedCount > 0 ? `运行 ${runningCount} 个 · 排队 ${queuedCount} 个` : '空闲';
  }

  return { renderGpuInfo, renderStatusDeck, renderTaskStatus };
}
