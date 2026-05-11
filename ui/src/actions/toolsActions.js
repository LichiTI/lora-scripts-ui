// actions/toolsActions.js —工具运行 action
//   runTool(toolId, scriptName, keys)
//
// 依赖（工厂注入）：api, showToast, _renderLogLines

import { $, escapeHtml, _ico } from '../utils/dom.js';

export function createToolsActions({ api, showToast, _renderLogLines }) {
  async function runTool(toolId, scriptName, keys) {
    // ── 参数校验 ──
    const params = { script_name: scriptName };
   let hasAnyField = false;
    // 这些 key 接受空格分隔的多值，后端 run_script 遇到 list 会展开为多个 CLI 参数
    const listKeys = new Set(['models', 'ratios']);
    for (const key of keys) {
      const input = $(`#tool-${toolId}-${key}`);
      if (input && input.value.trim()) {
        const val = input.value.trim();
        if (listKeys.has(key)) {
          params[key] = val.split(/\s+/);
        } else {
          params[key] = val;
        }
        hasAnyField = true;
      }
    }
    if (!hasAnyField) {
      showToast('请至少填写一个参数。');
      return;
    }

    // ── 按钮 loading 态 ──
    const btn = $(`#btn-tool-${toolId}`);
const statusEl = $(`#tool-status-${toolId}`);
    const resultEl = $(`#tool-result-${toolId}`);
    if (btn) { btn.disabled = true; btn.innerHTML = _ico('loader') + ' 提交中...'; }
    if (statusEl) statusEl.innerHTML = '';
    if (resultEl) { resultEl.style.display = 'none'; resultEl.textContent = ''; }

    try {
      const resp = await api.runScript(params);
      const taskId = resp?.data?.task_id;

      // ── 显示运行中状态 ──
      if (btn) { btn.disabled = true; btn.innerHTML = _ico('loader') + ' 运行中...'; }
      if (statusEl) {
        statusEl.innerHTML = '<span style="color:#f59e0b;">' + _ico('loader', 14) + ' 工具运行中...</span>';
      }
      if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.style.background = 'var(--bg-hover)';
        resultEl.style.color ='var(--text-base)';
        resultEl.innerHTML = '<span style="color:var(--text-dim);">' + _ico('loader', 14) + ' 等待输出...</span>';
      }
      showToast('✓ 工具已提交运行。');

      // ── 轮询输出 ──
      if (taskId) {
        let pollCount = 0;
        const maxPolls = 300; // 最多轮询 5 分钟（1s 间隔）
        const pollInterval = setInterval(async () => {
          pollCount++;
          try {
            const outResp = await api.getTaskOutput(taskId, 200);
            const lines = outResp?.data?.lines || [];
            if (lines.length > 0 && resultEl) {
              resultEl.innerHTML = _renderLogLines(lines);
              resultEl.scrollTop = resultEl.scrollHeight;
            }

            // 检查任务是否结束
            const tasksResp = await api.getTasks();
            const allTasks = tasksResp?.data?.tasks || [];
            const thisTask = allTasks.find((t) => t.id === taskId);
            const finished = !thisTask || thisTask.status === 'FINISHED' || thisTask.status === 'TERMINATED';

            if (finished || pollCount >= maxPolls) {
              clearInterval(pollInterval);

              // 延迟 500ms 再拉最终输出（确保后台线程 flush 完）
              setTimeout(async () => {
                // 最终状态
                const failed = thisTask && (thisTask.status === 'TERMINATED' || (thisTask.returncode != null && thisTask.returncode !== 0));
                if (failed) {
                  if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444;">' + _ico('x-circle', 14) + ' 工具运行失败 (exit code: ' + (thisTask.returncode ?? '?') + ')</span>';
                  if (resultEl) resultEl.style.borderLeft = '3px solid #ef4444';
                } else {
                  if (statusEl) statusEl.innerHTML ='<span style="color:#22c55e;">' + _ico('check-circle', 14) + ' 工具运行完成</span>';
                  if (resultEl) resultEl.style.borderLeft = '3px solid #22c55e';
                }
                if (btn) { btn.disabled = false; btn.textContent = '运行'; }

                // 拉最终完整输出
                try {
                  const finalResp = await api.getTaskOutput(taskId, 200);
                  const finalLines = finalResp?.data?.lines || [];
                  if (finalLines.length > 0 && resultEl) {
                    resultEl.innerHTML = _renderLogLines(finalLines);
                    resultEl.scrollTop = resultEl.scrollHeight;
                  } else if (resultEl && (!resultEl.textContent || resultEl.textContent.includes('等待输出'))) {
                    resultEl.innerHTML = '<span style="color:var(--text-dim);">（脚本无标准输出）</span>';
                  }
                } catch (e) { /* ignore */ }
              }, 800);
            }
          } catch (e) {
            // 静默
          }
        }, 1000);
      } else {
        // 后端没返回 task_id（旧版后端），回退到旧行为
        setTimeout(() => {
          if (btn) { btn.disabled = false; btn.textContent = '运行'; }
          if (statusEl) statusEl.innerHTML = '<span style="color:#22c55e;">' + _ico('check-circle', 14) + ' 工具应已完成，请检查输出文件</span>';
          if (resultEl) { resultEl.innerHTML = 'ℹ 工具在后台执行，输出请查看后端控制台窗口。'; resultEl.style.display = 'block'; }
        }, 3000);
      }
    } catch (error) {
      // ── 提交失败 ──
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

  return { runTool };
}
