// actions/toolsActions.js —工具运行 action
//   runTool(toolId, scriptName, keys)
//
// 依赖（工厂注入）：api, showToast, _renderLogLines

import { $, escapeHtml, _ico } from '../utils/dom.js';

export function createToolsActions({ api, showToast, _renderLogLines }) {
  function getToolboxStore() {
    if (!window.__lulynxToolboxStore) {
      window.__lulynxToolboxStore = { results: {} };
    }
    return window.__lulynxToolboxStore;
  }

  function cacheCoreResult(toolId, payload) {
    getToolboxStore().results[toolId] = payload?.data ?? payload;
  }

  function downloadText(filename, content, mimeType = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function renderMetric(label, value) {
    return '<div class="xray-metric"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(String(value ?? '-')) + '</strong></div>';
  }

  function renderHeatCards(items, valueKey, labelKey, metaKeys = []) {
    if (!Array.isArray(items) || items.length === 0) return '<div class="xray-empty">暂无热度数据</div>';
    const max = Math.max(...items.map((item) => Number(item?.[valueKey] ?? 0)), 1);
    return '<div class="xray-heat-grid">' + items.map((item) => {
      const value = Number(item?.[valueKey] ?? 0);
      const pct = Math.max(0, Math.min(100, (value / max) * 100));
      const status = String(item?.status || '').toLowerCase();
      const statusClass = status === 'critical' ? 'critical' : status === 'warning' ? 'warning' : 'good';
      const meta = metaKeys.map((key) => '<span>' + escapeHtml(key.replace(/_/g, ' ')) + ': ' + escapeHtml(String(item?.[key] ?? '-')) + '</span>').join('');
      return '<article class="xray-heat-card ' + statusClass + '">'
        + '<header><strong>' + escapeHtml(String(item?.[labelKey] ?? item?.key ?? item?.id ?? '-')) + '</strong><em>' + escapeHtml(String(item?.status ?? 'good')) + '</em></header>'
        + '<div class="xray-heat-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>'
        + '<div class="xray-heat-meta">'
        + '<span>' + escapeHtml(String(value.toFixed ? value.toFixed(6) : value)) + '</span>'
        + meta
        + '</div>'
        + '</article>';
    }).join('') + '</div>';
  }

  function renderRecommendationCards(items) {
    if (!Array.isArray(items) || items.length === 0) return '<div class="xray-empty">暂无建议</div>';
    return '<div class="xray-reco-grid">' + items.map((item) => {
      const kind = String(item?.type || 'info').toLowerCase();
      return '<article class="xray-reco-card ' + escapeHtml(kind) + '">'
        + '<strong>' + escapeHtml(String(item?.position ?? item?.block_id ?? '建议')) + '</strong>'
        + '<p>' + escapeHtml(String(item?.issue ?? item?.suggestion ?? '')) + '</p>'
        + '<span>' + escapeHtml(String(item?.suggestion ?? '')) + '</span>'
        + '</article>';
    }).join('') + '</div>';
  }

  function buildAnalyzerSummary(body, layers, positionAnalysis, recommendations) {
    const topLayer = [...layers].sort((a, b) => Number(b.rms || 0) - Number(a.rms || 0))[0];
    const hotBlock = [...positionAnalysis].sort((a, b) => Number(b.avg_rms || 0) - Number(a.avg_rms || 0))[0];
    const lines = [
      'LoRA Analyzer Report',
      'file: ' + String(body.file_name || '-'),
      'type: ' + String(body.lora_type || body.format || 'LoRA'),
      'size_mb: ' + String(body.file_size_mb ?? '-'),
      'layers: ' + String(body.num_layers ?? layers.length),
      'params: ' + String(body.total_params ?? '-'),
      'hot_block: ' + String(hotBlock?.key || '-'),
      'top_rms_layer: ' + String(topLayer?.name || '-'),
      'recommendations: ' + String(recommendations.length),
    ];
    return lines.join('\n');
  }

  function buildAnalyzerTextReport(body, layers, positionAnalysis, recommendations) {
    const topLayers = [...layers]
      .sort((a, b) => Number(b.rms || 0) - Number(a.rms || 0))
      .slice(0, 5)
      .map((layer) => '- ' + String(layer.name || '-') + ' | rank=' + String(layer.rank ?? '-') + ' | rms=' + String(layer.rms ?? '-'));
    const topBlocks = [...positionAnalysis]
      .sort((a, b) => Number(b.avg_rms || 0) - Number(a.avg_rms || 0))
      .slice(0, 6)
      .map((block) => '- ' + String(block.key || '-') + ' | avg_rms=' + String(block.avg_rms ?? '-') + ' | status=' + String(block.status || 'good'));
    const suggestionLines = recommendations.length
      ? recommendations.map((item) => '- ' + String(item.position || '-') + ': ' + String(item.issue || '-') + ' | ' + String(item.suggestion || '-'))
      : ['- 暂无自动建议'];

    return [
      buildAnalyzerSummary(body, layers, positionAnalysis, recommendations),
      '',
      'Top Blocks',
      ...topBlocks,
      '',
      'Top RMS Layers',
      ...topLayers,
      '',
      'Recommendations',
      ...suggestionLines,
    ].join('\n');
  }

  function renderBlockRows(blocks) {
    if (!Array.isArray(blocks) || blocks.length === 0) return '<div class="xray-empty">暂无区块数据</div>';
    const max = Math.max(...blocks.map((b) => Number(b.normalized_magnitude ?? b.magnitude ?? 0)), 1);
    return blocks.map((block) => {
      const value = Number(block.normalized_magnitude ?? block.magnitude ?? 0);
      const pct = Math.max(0, Math.min(100, (value / max) * 100));
      const level = pct > 80 ? 'over' : pct > 55 ? 'active' : pct > 25 ? 'warm' : 'quiet';
      return '<tr>'
        + '<td><strong>' + escapeHtml(block.id || block.block || '-') + '</strong></td>'
        + '<td>' + escapeHtml(String(block.layer_count ?? block.layers ?? 0)) + '</td>'
        + '<td><div class="xray-bar"><i class="' + level + '" style="width:' + pct.toFixed(1) + '%"></i></div></td>'
        + '<td class="xray-num">' + escapeHtml(String((block.magnitude ?? value).toFixed ? (block.magnitude ?? value).toFixed(4) : (block.magnitude ?? value))) + '</td>'
        + '</tr>';
    }).join('');
  }

  function renderLayerRows(layers) {
    if (!Array.isArray(layers) || layers.length === 0) return '<div class="xray-empty">暂无层数据</div>';
    return layers.slice(0, 24).map((layer) => {
      const anomaly = (layer.anomaly || layer.has_anomaly) ? '<span class="xray-pill danger">异常</span>' : '<span class="xray-pill">正常</span>';
      return '<tr>'
        + '<td title="' + escapeHtml(layer.name || '') + '">' + escapeHtml(layer.name || '-') + '</td>'
        + '<td class="xray-num">' + escapeHtml(String(layer.rank ?? '-')) + '</td>'
        + '<td class="xray-num">' + escapeHtml(String(layer.rms ?? '-')) + '</td>'
        + '<td class="xray-num">' + escapeHtml(String(layer.sparsity ?? '-')) + '</td>'
        + '<td>' + anomaly + '</td>'
        + '</tr>';
    }).join('');
  }

  function renderLayerDigest(layers) {
    if (!Array.isArray(layers) || layers.length === 0) return '<div class="xray-empty">暂无层摘要</div>';
    const sorted = [...layers].sort((a, b) => Number(b.rms || 0) - Number(a.rms || 0)).slice(0, 8);
    return '<div class="xray-layer-digest">' + sorted.map((layer) => {
      const rms = Number(layer.rms || 0);
      const sparsity = Number(layer.sparsity || 0) * 100;
      return '<article class="xray-layer-card">'
        + '<strong>' + escapeHtml(String(layer.name || '-')) + '</strong>'
        + '<span>Rank ' + escapeHtml(String(layer.rank ?? '-')) + ' · RMS ' + escapeHtml(String(rms.toFixed ? rms.toFixed(5) : rms)) + '</span>'
        + '<div class="xray-layer-meta">稀疏度 ' + escapeHtml(String(sparsity.toFixed ? sparsity.toFixed(1) : sparsity)) + '%</div>'
        + '</article>';
    }).join('') + '</div>';
  }

  function renderCoreResult(toolId, payload) {
    const body = payload?.data ?? payload;
    if (payload?.card_base64 || body?.card_base64) {
      const card = payload?.card_base64 ? payload : body;
      return '<img alt="Diagnostic Card" class="xray-card-image" src="data:' + (card.mime_type || 'image/png') + ';base64,' + card.card_base64 + '">';
    }
    if (toolId === 'core_lora_analyze' && body) {
      const layers = Array.isArray(body.layers) ? body.layers : [];
      const positionAnalysis = Array.isArray(body.position_analysis) ? body.position_analysis : [];
      const recommendations = Array.isArray(body.recommendations) ? body.recommendations : [];
      const summary = buildAnalyzerSummary(body, layers, positionAnalysis, recommendations);
      return '<div class="xray-result">'
        + '<div class="xray-result-head"><div><strong>LoRA Analyzer</strong><span>权重结构、rank 与异常层摘要</span></div></div>'
        + '<div class="xray-metrics">'
        + renderMetric('文件', body.file_name)
        + renderMetric('大小 MB', body.file_size_mb)
        + renderMetric('类型', body.lora_type || body.format || 'LoRA')
        + renderMetric('层数', body.num_layers)
        + renderMetric('参数量', body.total_params)
        + '</div>'
        + '<div class="xray-section-head"><strong>报告摘要</strong><span>可直接复制到备注、issue 或诊断卡流程</span></div>'
        + '<div class="xray-summary-box"><pre>' + escapeHtml(summary) + '</pre><div class="xray-summary-actions">'
        + '<button class="toolbox-mini-btn" type="button" data-copy-text="' + escapeHtml(summary) + '">复制摘要</button>'
        + '<button class="toolbox-mini-btn" type="button" data-export-tool="core_lora_analyze" data-export-format="json">导出 JSON</button>'
        + '<button class="toolbox-mini-btn" type="button" data-export-tool="core_lora_analyze" data-export-format="txt">导出 TXT</button>'
        + '</div></div>'
        + '<div class="xray-section-head"><strong>Block 摘要</strong><span>按 block / position 观察训练强度分布</span></div>'
        + renderHeatCards(positionAnalysis, 'avg_rms', 'key', ['component', 'avg_sparsity', 'layer_count', 'dead_count', 'overfit_count', 'underfit_count'])
        + '<div class="xray-table-wrap"><table class="xray-table"><thead><tr><th>层名</th><th>Rank</th><th>RMS</th><th>稀疏度</th><th>状态</th></tr></thead><tbody>'
        + renderLayerRows(layers)
        + '</tbody></table></div>'
        + '<div class="xray-section-head"><strong>高 RMS 层</strong><span>优先关注的样本层</span></div>'
        + renderLayerDigest(layers)
        + '<div class="xray-section-head"><strong>建议</strong><span>自动生成的修正建议</span></div>'
        + renderRecommendationCards(recommendations)
        + '<details class="xray-json"><summary>查看原始 JSON</summary><pre>' + escapeHtml(JSON.stringify(body, null, 2)) + '</pre></details>'
        + '</div>';
    }
    if (toolId === 'core_lora_block_analyze' && body) {
      const blocks = body.blocks || body.position_analysis || [];
      return '<div class="xray-result">'
        + '<div class="xray-result-head"><div><strong>LoRA Block XRay</strong><span>按 TE / IN / MID / OUT 观察区块活跃度</span></div></div>'
        + renderHeatCards(blocks, 'magnitude', 'id', ['layer_count', 'status'])
        + '<div class="xray-table-wrap"><table class="xray-table"><thead><tr><th>区块</th><th>层数</th><th>活跃度</th><th>强度</th></tr></thead><tbody>'
        + renderBlockRows(blocks)
        + '</tbody></table></div>'
        + '<details class="xray-json"><summary>查看原始 JSON</summary><pre>' + escapeHtml(JSON.stringify(body, null, 2)) + '</pre></details>'
        + '</div>';
    }
    if (body?.success || body?.output_path || body?.output_paths || body?.residual_path) {
      const outputs = [body.output_path, body.residual_path, body.adapter_path, ...(body.output_paths || [])].filter(Boolean);
      return '<div class="xray-result"><div class="xray-result-head"><div><strong>工具运行完成</strong><span>输出文件已写入指定路径</span></div></div>'
        + '<div class="xray-metrics">' + renderMetric('状态', body.success === false ? '失败' : '成功') + renderMetric('输出数', outputs.length) + renderMetric('处理层数', body.converted_layers ?? body.tensor_count ?? '-') + '</div>'
        + (outputs.length ? '<div class="xray-output-list">' + outputs.map((p) => '<code>' + escapeHtml(p) + '</code>').join('') + '</div>' : '')
        + '<details class="xray-json"><summary>查看原始 JSON</summary><pre>' + escapeHtml(JSON.stringify(body, null, 2)) + '</pre></details></div>';
    }
    return '<pre class="xray-plain-json">' + escapeHtml(JSON.stringify(body, null, 2)) + '</pre>';
  }

  async function runTool(toolId, scriptName, keys) {
    // ── 参数校验 ──
    const isCoreEndpoint = String(scriptName || '').startsWith('/api/');
    const params = isCoreEndpoint ? {} : { script_name: scriptName };
   let hasAnyField = false;
    // 这些 key 接受空格分隔的多值，后端 run_script 遇到 list 会展开为多个 CLI 参数
    const listKeys = new Set(['models', 'ratios']);
    for (const key of keys) {
      const input = $(`#tool-${toolId}-${key}`);
      if (input && input.value.trim()) {
        const val = input.value.trim();
        if (['keep_blocks', 'drop_blocks', 'issues'].includes(key)) {
          params[key] = val.split(',').map((part) => part.trim()).filter(Boolean);
        } else if (['rank', 'health_score', 'alpha'].includes(key)) {
          params[key] = Number(val);
        } else if (key === 'ratio') {
          params[key] = Number(val);
        } else if (['base_params', 'x_axis', 'y_axis', 'z_axis', 'metrics'].includes(key)) {
          params[key] = JSON.parse(val);
        } else if (['half'].includes(key)) {
          params[key] = !['0', 'false', 'no', 'off'].includes(val.toLowerCase());
        } else if (listKeys.has(key)) {
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
      if (isCoreEndpoint) {
        const resp = await api.runCoreTool(scriptName, params);
        if (btn) { btn.disabled = false; btn.textContent = '运行'; }
        if (statusEl) statusEl.innerHTML = '<span style="color:#22c55e;">' + _ico('check-circle', 14) + ' 工具运行完成</span>';
        if (resultEl) {
          resultEl.style.display = 'block';
          resultEl.style.background = 'var(--bg-hover)';
          resultEl.style.color = 'var(--text-base)';
          resultEl.style.borderLeft = '3px solid #22c55e';
          const payload = resp?.data ?? resp;
          cacheCoreResult(toolId, payload);
          resultEl.innerHTML = renderCoreResult(toolId, payload);
          resultEl.querySelectorAll('[data-copy-text]').forEach((button) => {
            button.addEventListener('click', async () => {
              const text = button.getAttribute('data-copy-text') || '';
              try {
                await navigator.clipboard.writeText(text);
                showToast('已复制摘要。');
              } catch (_error) {
                showToast('复制失败，请手动复制。');
              }
            });
          });
          resultEl.querySelectorAll('[data-export-tool]').forEach((button) => {
            button.addEventListener('click', () => {
              const exportTool = button.getAttribute('data-export-tool') || '';
              const format = button.getAttribute('data-export-format') || 'json';
              const cached = getToolboxStore().results[exportTool];
              if (!cached) {
                showToast('未找到可导出的分析结果。');
                return;
              }
              if (format === 'json') {
                downloadText((cached.file_name || 'lora_analysis') + '.json', JSON.stringify(cached, null, 2), 'application/json;charset=utf-8');
                showToast('已导出 JSON。');
                return;
              }
              if (format === 'txt' && exportTool === 'core_lora_analyze') {
                const layers = Array.isArray(cached.layers) ? cached.layers : [];
                const positionAnalysis = Array.isArray(cached.position_analysis) ? cached.position_analysis : [];
                const recommendations = Array.isArray(cached.recommendations) ? cached.recommendations : [];
                downloadText((cached.file_name || 'lora_analysis') + '.txt', buildAnalyzerTextReport(cached, layers, positionAnalysis, recommendations));
                showToast('已导出 TXT。');
              }
            });
          });
        }
        showToast('✓ 工具运行完成。');
        return;
      }

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
