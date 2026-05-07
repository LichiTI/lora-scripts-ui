import { $, escapeHtml, icon as _ico } from '../utils/dom.js';
import { TOOL_DEFINITIONS } from './toolDefinitions.js';

export function createToolsPageController({ api, state, renderSlot, renderLogLines, showToast }) {
  function renderToolsPage(container) {
    const tools = TOOL_DEFINITIONS;
    const selectedId = state.selectedTool || '';
    const selectedTool = tools.find((tool) => tool.id === selectedId);

    container.innerHTML = `
      <div class="form-container">
        <header class="section-title">
          <h2>工具箱</h2>
          <p>LoRA 提取、合并等实用工具。选择工具后填写参数并运行。</p>
        </header>
        <div class="config-group">
          <label>选择工具</label>
          <select id="tool-selector">
            <option value="">—— 请选择工具 ——</option>
            ${tools.map((tool) => `<option value="${tool.id}" ${tool.id === selectedId ? 'selected' : ''}>${escapeHtml(tool.title)}</option>`).join('')}
          </select>
        </div>
        <div id="tool-detail">
          ${selectedTool ? renderToolDetail(selectedTool) : '<div class="empty-state" style="margin-top:12px;"><strong>请在上方下拉菜单中选择一个工具</strong></div>'}
        </div>
        ${renderSlot('tools.entry')}
      </div>
    `;

    $('#tool-selector')?.addEventListener('change', (event) => {
      state.selectedTool = event.target.value;
      const detail = $('#tool-detail');
      const tool = tools.find((item) => item.id === event.target.value);
      if (detail) {
        detail.innerHTML = tool ? renderToolDetail(tool) : '<div class="empty-state"><strong>请在上方下拉菜单中选择一个工具</strong></div>';
      }
    });
  }

  async function runTool(toolId, scriptName, keys) {
    const params = { script_name: scriptName };
    let hasAnyField = false;
    // 这些 key 接受空格分隔的多值，后端 run_script 遇到 list 会展开为多个 CLI 参数
    const listKeys = new Set(['models', 'ratios']);
    for (const key of keys) {
      const input = $(`#tool-${toolId}-${key}`);
      if (input && input.value.trim()) {
        const value = input.value.trim();
        if (listKeys.has(key)) {
          params[key] = value.split(/\s+/);
        } else {
          params[key] = value;
        }
        hasAnyField = true;
      }
    }
    if (!hasAnyField) {
      showToast('请至少填写一个参数。');
      return;
    }

    const btn = $(`#btn-tool-${toolId}`);
    const statusEl = $(`#tool-status-${toolId}`);
    const resultEl = $(`#tool-result-${toolId}`);
    if (btn) { btn.disabled = true; btn.innerHTML = _ico('loader') + ' 提交中...'; }
    if (statusEl) statusEl.innerHTML = '';
    if (resultEl) { resultEl.style.display = 'none'; resultEl.textContent = ''; }

    try {
      const resp = await api.runScript(params);
      const taskId = resp?.data?.task_id;

      if (btn) { btn.disabled = true; btn.innerHTML = _ico('loader') + ' 运行中...'; }
      if (statusEl) {
        statusEl.innerHTML = '<span style="color:#f59e0b;">' + _ico('loader', 14) + ' 工具运行中...</span>';
      }
      if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.style.background = 'var(--bg-hover)';
        resultEl.style.color = 'var(--text-base)';
        resultEl.innerHTML = '<span style="color:var(--text-dim);">' + _ico('loader', 14) + ' 等待输出...</span>';
      }
      showToast('✓ 工具已提交运行。');

      if (taskId) {
        pollToolTask(taskId, { btn, statusEl, resultEl });
      } else {
        setTimeout(() => {
          if (btn) { btn.disabled = false; btn.textContent = '运行'; }
          if (statusEl) statusEl.innerHTML = '<span style="color:#22c55e;">' + _ico('check-circle', 14) + ' 工具应已完成，请检查输出文件</span>';
          if (resultEl) { resultEl.innerHTML = 'ℹ 工具在后台执行，输出请查看后端控制台窗口。'; resultEl.style.display = 'block'; }
        }, 3000);
      }
    } catch (error) {
      if (btn) { btn.disabled = false; btn.textContent = '运行'; }
      if (statusEl) {
        statusEl.innerHTML = '<span style="color:#ef4444;">' + _ico('x-circle', 14) + ' ' + escapeHtml(error.message || '提交失败') + '</span>';
      }
      if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.style.background = 'rgba(239,68,68,0.08)';
        resultEl.style.color = '#ef4444';
        resultEl.textContent = error.message || '工具运行失败。';
      }
      showToast(error.message || '工具运行失败。');
    }
  }

  function bindGlobals(targetWindow) {
    targetWindow.runTool = runTool;
  }

  async function pollToolTask(taskId, refs) {
    let pollCount = 0;
    const maxPolls = 300; // 最多轮询 5 分钟（1s 间隔）
    const pollInterval = setInterval(async () => {
      pollCount++;
      try {
        const outResp = await api.getTaskOutput(taskId, 200);
        const lines = outResp?.data?.lines || [];
        if (lines.length > 0 && refs.resultEl) {
          refs.resultEl.innerHTML = renderLogLines(lines);
          refs.resultEl.scrollTop = refs.resultEl.scrollHeight;
        }

        const tasksResp = await api.getTasks();
        const allTasks = tasksResp?.data?.tasks || [];
        const thisTask = allTasks.find((task) => task.id === taskId);
        const finished = !thisTask || thisTask.status === 'FINISHED' || thisTask.status === 'TERMINATED';

        if (finished || pollCount >= maxPolls) {
          clearInterval(pollInterval);
          setTimeout(async () => {
            await finalizeToolTask(taskId, thisTask, refs);
          }, 800);
        }
      } catch (error) {
        // 静默，保持旧行为。
      }
    }, 1000);
  }

  async function finalizeToolTask(taskId, task, refs) {
    const failed = task && (task.status === 'TERMINATED' || (task.returncode != null && task.returncode !== 0));
    if (failed) {
      if (refs.statusEl) refs.statusEl.innerHTML = '<span style="color:#ef4444;">' + _ico('x-circle', 14) + ' 工具运行失败 (exit code: ' + (task.returncode ?? '?') + ')</span>';
      if (refs.resultEl) refs.resultEl.style.borderLeft = '3px solid #ef4444';
    } else {
      if (refs.statusEl) refs.statusEl.innerHTML = '<span style="color:#22c55e;">' + _ico('check-circle', 14) + ' 工具运行完成</span>';
      if (refs.resultEl) refs.resultEl.style.borderLeft = '3px solid #22c55e';
    }
    if (refs.btn) { refs.btn.disabled = false; refs.btn.textContent = '运行'; }

    try {
      const finalResp = await api.getTaskOutput(taskId, 200);
      const finalLines = finalResp?.data?.lines || [];
      if (finalLines.length > 0 && refs.resultEl) {
        refs.resultEl.innerHTML = renderLogLines(finalLines);
        refs.resultEl.scrollTop = refs.resultEl.scrollHeight;
      } else if (refs.resultEl && (!refs.resultEl.textContent || refs.resultEl.textContent.includes('等待输出'))) {
        refs.resultEl.innerHTML = '<span style="color:var(--text-dim);">（脚本无标准输出）</span>';
      }
    } catch (error) {
      // ignore
    }
  }

  return {
    renderToolsPage,
    runTool,
    bindGlobals,
  };
}

function renderToolDetail(tool) {
  const isPathField = (field) => /model|path|save_to|file|src_|dst_/.test(field.key);
  return `
    <section class="form-section tool-section" id="tool-${tool.id}" style="margin-top:16px;">
      <header class="section-header">
        <h3>${escapeHtml(tool.title)}</h3>
      </header>
      <div class="section-summary">${escapeHtml(tool.desc)}</div>
      <div class="section-content tool-fields">
        ${tool.fields.map((field) => {
          const inputId = `tool-${tool.id}-${field.key}`;
          if (isPathField(field)) {
            return `
          <div class="config-group">
            <label>${escapeHtml(field.label)}</label>
            <div class="input-picker">
              <button class="picker-icon" type="button" onclick="pickPathForInput('${inputId}', '${field.key.includes('save') || field.key.includes('dst') ? 'folder' : 'model-file'}')">
                <svg class="icon"><use href="#icon-folder"></use></svg>
              </button>
              <input class="text-input" type="${field.type}" id="${inputId}" placeholder="${escapeHtml(field.placeholder || '')}">
            </div>
          </div>`;
          }
          return `
          <div class="config-group">
            <label>${escapeHtml(field.label)}</label>
            <input class="text-input" type="${field.type}" id="${inputId}" placeholder="${escapeHtml(field.placeholder || '')}">
          </div>`;
        }).join('')}
      </div>
      <div class="tool-actions" style="display:flex;align-items:center;gap:12px;">
        <button class="btn btn-primary btn-sm" type="button" id="btn-tool-${tool.id}"
          onclick="runTool('${tool.id}', '${escapeHtml(tool.script)}', ${JSON.stringify(tool.fields.map((field) => field.key)).replaceAll('"', '&quot;')})">运行</button>
        <span id="tool-status-${tool.id}" style="font-size:0.82rem;"></span>
      </div>
      <div id="tool-result-${tool.id}" style="display:none;margin-top:12px;padding:12px;border-radius:8px;font-size:0.82rem;white-space:pre-wrap;font-family:monospace;max-height:300px;overflow:auto;"></div>
    </section>
  `;
}
