// renderers/preflight.js — 训练预检相关渲染
// 7 个函数：renderPreflightDetail, renderPreflightOverviewPanel, renderPreflightActionPanel,
//          renderPreflightReport, _pfTag, renderPreflightPanel (数据集预览), _pfMetric
//
// 依赖（工厂注入）：state, escapeHtml, _ico, deps.renderStatusDeck（通过 deps 对象延迟解析，
// 解决与 statusDeck 的循环依赖）

import { escapeHtml, _ico } from '../utils/dom.js';

export function createPreflightRenderer({ state, deps }) {
  function _renderStatusDeck() { return deps.renderStatusDeck ? deps.renderStatusDeck() : ''; }
  function renderPreflightDetail() {
    if (!state.preflight) return '在训练前建议运行一遍训练预检';
    if (state.preflight.can_start) {
      const w = state.preflight.warnings || [];
      return w.length ? `${w.length} 个警告（点击"训练预检"查看详情）` : '全部通过，可以启动训练';
    }
    const errors = state.preflight.errors || [];
    if (!errors.length) return '训练预检未通过';
    return `${errors.length} 个错误（点击"训练预检"查看详情）`;
  }

  function renderPreflightActionPanel() {
    const isRunning = state.loading.preflight;
    return `
      <div class="section-toolbar preflight-action-panel">
        <div class="toolbar-actions toolbar-check-actions">
          <button class="btn btn-outline btn-check" type="button" onclick="runPreflight()" style="width:100%;" ${isRunning ? 'disabled' : ''}>
            <span class="btn-check-label">${isRunning ? '正在预检...' : '运行训练预检'}</span>
            <span class="btn-check-desc">检测运行环境 + 检查数据集路径、底模路径等参数</span>
          </button>
        </div>
      </div>
    `;
  }

  function renderPreflightOverviewPanel() {
    return `
      <details class="form-section collapsible-panel preflight-overview-panel">
        <summary class="section-header collapsible-summary preflight-overview-summary">
          <span class="collapsible-summary-main">
            <span class="collapsible-title">训练预检</span>
            <span class="collapsible-desc">运行环境、注意力后端、预检状态、任务状态和预检操作</span>
          </span>
          <span class="collapsible-caret" aria-hidden="true">⌄</span>
        </summary>
        <div class="preflight-overview-body">
          <div class="status-deck" id="status-deck">${_renderStatusDeck()}</div>
          ${renderPreflightActionPanel()}
        </div>
      </details>
    `;
  }

  function _pfTag(label, value, type) {
    var color = type === 'err' ? '#ef4444' : (type === 'warn' ? '#f59e0b' : 'var(--text-main)');
    return '<div class="preflight-tag"><span class="preflight-tag-label">' + label + '</span><span class="preflight-tag-value" style="color:' + color + ';">' + value + '</span></div>';
  }

  function _formatPreflightIssue(issue) {
    if (issue == null) return '';
    if (typeof issue === 'string') return issue;
    if (typeof issue !== 'object') return String(issue);
    var msg = String(issue.message || issue.detail || issue.reason || issue.error || '').trim();
    var code = String(issue.code || '').trim();
    if (msg && code) return msg + ' [' + code + ']';
    if (msg) return msg;
    try {
      return JSON.stringify(issue);
    } catch (_e) {
      return String(issue);
    }
  }


  function _advisorModuleTag(label, moduleState) {
    var enabled = !!(moduleState && (moduleState.enabled || moduleState.status === 'covered_by_module_offload'));
    return _pfTag(label, enabled ? '已配置' : '未启用', enabled ? 'ok' : '');
  }

  function _advisorResearchTag(label, moduleState) {
    if (!moduleState) return _pfTag(label, '未知', 'warn');
    var requested = !!(moduleState.requested || moduleState.enabled);
    var status = String(moduleState.status || '');
    var value = '未启用';
    var tone = '';
    if (requested && status === 'manual_experimental') {
      value = '实验启用';
      tone = 'warn';
    } else if (requested && status === 'partial_experimental') {
      value = '实验请求';
      tone = 'warn';
    } else if (requested) {
      value = '研究请求';
      tone = 'warn';
    } else if (status === 'available_manual') {
      value = '可手动启用';
    } else if (status === 'partial_experimental') {
      value = '部分接线';
      tone = 'warn';
    }
    return _pfTag(label, value, tone);
  }

  function _renderAdvisorSummary(advisor) {
    if (!advisor || !advisor.available) return '';
    var summary = advisor.summary || {};
    var aTier = advisor.a_tier || {};
    var bTier = advisor.b_tier || {};
    var modules = aTier.modules || {};
    var bModules = bTier.modules || {};
    var findings = advisor.findings || [];
    var vram = advisor.vram || {};
    var dataset = advisor.dataset || {};
    var patch = { ...(vram.recommended_config_patch || {}), ...(aTier.recommended_config_patch || {}) };
    var patchKeys = Object.keys(patch).filter(function(k) { return !k.startsWith('__') && patch[k] !== undefined; });
    var html = '<details class="preflight-group collapsible-subgroup" style="margin-top:8px;">';
    html += '<summary class="preflight-group-title">' + _ico('activity', 14) + ' 训练 Advisor（S/A/B 级）<span class="collapsible-caret" aria-hidden="true">⌄</span></summary>';
    html += '<div class="preflight-dataset-grid">';
    html += _pfTag('状态', summary.status || 'ok', summary.status === 'error' ? 'err' : (summary.status === 'warning' ? 'warn' : 'ok'));
    html += _pfTag('发现项', findings.length || summary.finding_count || 0);
    if (vram.estimated_gb != null) html += _pfTag('估算显存', vram.estimated_gb + ' GB', vram.safety === 'danger' ? 'err' : (vram.safety === 'tight' ? 'warn' : ''));
    if (dataset.image_count != null) html += _pfTag('Advisor图片', dataset.image_count || 0);
    html += _advisorModuleTag('Vortex融合', modules.memory_vortex_fusion);
    html += _advisorModuleTag('Block Weight', modules.block_weight);
    html += _advisorModuleTag('Smart Rank', modules.smart_rank);
    html += _advisorModuleTag('Auto Controller', modules.auto_controller);
    html += _advisorModuleTag('EMA', modules.ema);
    html += _advisorModuleTag('Masked Loss', modules.masked_loss);
    html += _advisorModuleTag('Smart Caption', modules.smart_caption);
    html += _advisorModuleTag('Bucket', modules.dataset_bucket);
    html += _advisorResearchTag('Hutchinson', bModules.hutchinson_scan);
    html += _advisorResearchTag('PCGrad', bModules.pcgrad);
    html += _advisorResearchTag('Ghost Replay', bModules.ghost_replay);
    html += _advisorResearchTag('Geometric Lock', bModules.manifold_constraint);
    html += '</div>';
    if (patchKeys.length) {
      html += '<div class="preflight-item preflight-note">建议修改: ' + escapeHtml(patchKeys.slice(0, 8).join(', ') + (patchKeys.length > 8 ? '...' : '')) + '</div>';
      html += '<button class="btn btn-outline btn-sm" type="button" onclick="applyTrainingAdvisorPatch()" style="margin-top:8px;">' + _ico('check-circle', 14) + ' 手动应用 Advisor 建议</button>';
    }
    if (aTier.notes && aTier.notes.length) {
      aTier.notes.slice(0, 4).forEach(function(n) {
        html += '<div class="preflight-item preflight-note">' + escapeHtml(n) + '</div>';
      });
    }
    if (bTier.notes && bTier.notes.length) {
      bTier.notes.slice(0, 4).forEach(function(n) {
        html += '<div class="preflight-item preflight-note">' + escapeHtml(n) + '</div>';
      });
    }
    html += '<div class="preflight-item preflight-note">Advisor 只生成报告；只有点击上方按钮才会写入当前配置草稿，不会自动开始训练。</div>';
    html += '</details>';
    return html;
  }
  function renderPreflightReport() {
    const pf = state.preflight;
    if (!pf) return '';

    const errors = pf.errors || [];
    const warnings = pf.warnings || [];
    const notes = pf.notes || [];
    const ds = pf.dataset;
    const deps = pf.dependencies;
    const advisor = pf.training_advisor;

    if (errors.length === 0 && warnings.length === 0 && notes.length === 0 && !ds && !advisor) {
      return '';
    }

    const canStart = pf.can_start;
    const borderColor = canStart ? (warnings.length > 0 ? '#f59e0b' : '#22c55e') : '#ef4444';
    const statusIcon = canStart ? (warnings.length > 0 ? _ico('alert-tri') : _ico('check-circle')) : _ico('x-circle');
    const statusText = canStart ? (warnings.length > 0 ? '预检通过（有警告）' : '预检通过') : '预检未通过';
    const statusColor = canStart ? (warnings.length > 0 ? '#f59e0b' : '#22c55e') : '#ef4444';

    let html = '<section class="form-section preflight-report-section" id="preflight-report" style="border-left:3px solid ' + borderColor + ';">';
    html += '<header class="section-header preflight-report-summary">';
   html += '<span class="collapsible-summary-main"><span class="collapsible-title">' + statusIcon + ' 训练预检报告</span>';
    html += '<span class="collapsible-desc" style="color:' + statusColor + ';">' + statusText + '</span></span>';
    html += '<span class="collapsible-actions"><button type="button" onclick="dismissPreflightReport()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.1rem;padding:2px 6px;" title="关闭">×</button></span>';
    html += '</header>';
    html += '<div class="section-content" style="display:block;">';

    // 状态概览
    html += '<div style="font-weight:700;color:' + statusColor + ';margin-bottom:12px;">' + statusText + '</div>';

    if (errors.length > 0) {
      html += '<div class="preflight-group">';
      html += '<div class="preflight-group-title" style="color:#ef4444;">' + _ico('x-circle', 14) + ' 错误 (' + errors.length + ')</div>';
      errors.forEach(function(e) {
        html += '<div class="preflight-item preflight-error">' + escapeHtml(_formatPreflightIssue(e)) + '</div>';
      });
      html += '</div>';
    }

    // 警告列表
    if (warnings.length > 0) {
      html += '<div class="preflight-group">';
      html += '<div class="preflight-group-title" style="color:#f59e0b;">' + _ico('alert-tri', 14) + ' 警告 (' + warnings.length + ')</div>';
      warnings.forEach(function(w) {
        html += '<div class="preflight-item preflight-warning">' + escapeHtml(_formatPreflightIssue(w)) + '</div>';
      });
      html += '</div>';
    }

    // 数据集摘要
    if (ds) {
      html += '<div class="preflight-group">';
      html += '<div class="preflight-group-title">' + _ico('folder', 14) + ' 数据集</div>';
      html += '<div class="preflight-dataset-grid">';
      html += _pfTag('图片数', ds.image_count|| 0);
      html += _pfTag('有效图片', ds.effective_image_count || 0);
      html += _pfTag('标注覆盖', ((ds.caption_coverage || 0) * 100).toFixed(0) + '%');
      if (ds.alpha_capable_image_count > 0) html += _pfTag('含透明通道', ds.alpha_capable_image_count);
      if (ds.broken_image_count > 0) html += _pfTag('损坏图片', ds.broken_image_count, 'err');
      if (ds.images_without_caption_count > 0) html +=_pfTag('缺少标注', ds.images_without_caption_count, 'warn');
      html += '</div></div>';
    }

    // 依赖检测
    if (deps) {
      var missing = deps.missing || [];
      var required = deps.required || [];
      if (missing.length > 0 || required.length > 0) {
        html += '<div class="preflight-group">';
        html += '<div class="preflight-group-title">' + _ico('activity', 14) + ' 运行时依赖</div>';
        missing.forEach(function(d) {
          html += '<div class="preflight-item preflight-error">' + escapeHtml(d.display_name) + ' - ' + escapeHtml(d.reason || '缺失') + '</div>';
        });
        required.filter(function(d) { return d.importable; }).forEach(function(d) {
          html += '<div class="preflight-item preflight-ok">' + escapeHtml(d.display_name) + ' ' + escapeHtml(d.version || '') + ' ✓</div>';
        });
        html += '</div>';
      }
    }

    html += _renderAdvisorSummary(advisor);

    // 提示信息（保留可折叠）
    if (notes.length > 0) {
      html += '<details class="preflight-group collapsible-subgroup" style="margin-top:8px;">';
      html += '<summary class="preflight-group-title">' + _ico('check-circle', 14) + ' 提示 (' + notes.length + ')<span class="collapsible-caret" aria-hidden="true">⌄</span></summary>';
      notes.forEach(function(n) {
        html += '<div class="preflight-item preflight-note">' + escapeHtml(_formatPreflightIssue(n)) + '</div>';
      });
      html += '</details>';
    }


    html += '</div></section>';
    return html;
  }

  function _pfMetric(label, value, type) {
    var color = type === 'accent' ? 'var(--accent)' : (type === 'ok' ? '#22c55e' : (type === 'warn' ? '#f59e0b' : (type === 'err' ? '#ef4444' : 'var(--text-main)')));
    return '<div class="train-pf-metric"><div class="train-pf-metric-label">' + label + '</div>'
      + '<div class="train-pf-metric-val" style="color:' + color + ';">' + value + '</div></div>';
  }

  /** Render dataset visualization sub-tab */
  function renderPreflightPanel() {
    var da = state.datasetAnalysis;
    var loading = state.loading.preflight;
    var dataDir = state.config.train_data_dir || '';

    if (!da && !loading) {
      return '<div class="train-pf-empty"><div style="text-align:center;padding:48px 20px;">'
        + _ico('folder', 40) + '<br><br>'
        + '<div style="font-size:0.88rem;color:var(--text-main);font-weight:600;margin-bottom:6px;">\u6570\u636e\u96c6\u9884\u89c8</div>'
        + '<div style="font-size:0.76rem;color:var(--text-muted);margin-bottom:16px;max-width:360px;">'
        + (dataDir ? escapeHtml(dataDir) : '\u8bf7\u5148\u5728\u914d\u7f6e\u9875\u8bbe\u7f6e train_data_dir') + '</div>'
        + '<button class="btn btn-primary btn-sm" type="button" onclick="scanDataset()" style="padding:8px 24px;"'
        + (dataDir ? '' : ' disabled') + '>\u626b\u63cf\u6570\u636e\u96c6</button></div></div>';
    }
    if (loading) {
      return '<div class="train-pf-empty"><div style="text-align:center;padding:48px 20px;">'
        + _ico('loader', 24) + '<br><br><div style="font-size:0.82rem;color:var(--text-muted);">\u6b63\u5728\u626b\u63cf\u6570\u636e\u96c6...</div></div></div>';
    }

    var s = da.summary || {};
    var folders = da.folders || [];
    var topReso = da.top_resolutions || [];
    var batchSize = Number(state.config.train_batch_size) || 1;
    var trainLengthMode = state.config.train_length_mode || '最大轮数';
    var epochs = Number(state.config.max_train_epochs) || 1;
    var maxTrainSteps = Number(state.config.max_train_steps) || 0;
    var estSteps = trainLengthMode === '最大步数'
      ? maxTrainSteps
      : Math.ceil((s.effective_image_count || 0) / batchSize) * epochs;

    var metricsHtml = '<div class="train-pf-card">'
      + '<div class="train-pf-card-hdr"><span>\u6570\u636e\u6982\u89c8</span></div>'
      + '<div class="train-pf-metrics">'
      + _pfMetric('\u56fe\u7247\u603b\u6570', s.image_count || 0, '')
      + _pfMetric('\u6709\u6548\u56fe\u7247 (\u00d7Repeats)', s.effective_image_count || 0, '')
      + _pfMetric('\u9884\u4f30\u6b65\u6570', estSteps.toLocaleString(), 'accent')
      + '</div></div>';

    // Resolution bar chart
    var resoHtml = '';
    if (topReso.length > 0) {
      var maxCount = Math.max.apply(null, topReso.map(function(r) { return r.count || 0; }));
      var bars = topReso.slice(0, 6).map(function(r) {
        var cnt = r.count || 0;
        var pct = maxCount > 0 ? Math.round(cnt / maxCount * 100) : 0;
        return '<div class="train-reso-bar-col"><div class="train-reso-count">' + cnt
          + '</div><div class="train-reso-bar" style="height:' + pct + '%"></div>'
          + '<div class="train-reso-label">' + escapeHtml(r.name || '') + '</div></div>';
      }).join('');
      resoHtml = '<div class="train-pf-card">'
        + '<div class="train-pf-card-hdr"><span>\u5206\u8fa8\u7387\u5206\u5e03</span>'
        + '<span class="train-tag">' + topReso.length + ' \u4e2a\u6876</span></div>'
        + '<div class="train-reso-chart">' + bars + '</div></div>';
    }

    // Diagnostics
    var diags = [];
    var alphaCount = s.alpha_capable_image_count || 0;
    if (s.caption_count > 0) diags.push({ok: true, text: '\u6807\u6ce8\u6587\u4ef6\u5df2\u627e\u5230 (' + (s.caption_coverage * 100).toFixed(0) + '% \u8986\u76d6\u7387)'});
    else diags.push({ok: false,warn: true, text: '\u672a\u627e\u5230\u6807\u6ce8\u6587\u4ef6'});
    if (s.broken_image_count === 0) diags.push({ok: true, text: '\u65e0\u635f\u574f\u56fe\u7247'});
    else diags.push({ok: false, text: s.broken_image_count + ' \u5f20\u635f\u574f\u56fe\u7247'});
    if (alphaCount > 0) diags.push({ok: false, warn: true, text: alphaCount + ' \u5f20\u56fe\u7247\u542b\u900f\u660e\u901a\u9053 (PNG/WebP)\uff0c\u53ef\u80fd\u5f71\u54cd\u8bad\u7ec3\u7ed3\u679c'});
    else diags.push({ok: true, text: '\u65e0\u900f\u660e\u901a\u9053\u56fe\u7247'});
    if (s.images_without_caption_count > 0) diags.push({ok: false, warn: true, text: s.images_without_caption_count + '\u5f20\u56fe\u7247\u7f3a\u5c11\u6807\u6ce8'});
    if (s.empty_caption_count > 0) diags.push({ok: false, warn: true, text:s.empty_caption_count + ' \u4e2a\u7a7a\u6807\u6ce8\u6587\u4ef6'});
    if (diags.length === 0) diags.push({ok: true, text: '\u5168\u90e8\u68c0\u67e5\u901a\u8fc7'});

    var diagHtml = '<div class="train-pf-card">'
      + '<div class="train-pf-card-hdr"><span>\u8bca\u65ad</span></div>'
      + '<ul class="train-diag-list">' + diags.map(function(d) {
          var icon = d.ok ? _ico('check-circle', 15) : (d.warn ? _ico('alert-tri', 15) : _ico('x-circle', 15));
          var color = d.ok ? '#22c55e' : (d.warn ? '#f59e0b' : '#ef4444');
          return '<li style="color:' + color + ';">' + icon + ' <span style="color:var(--text-main);">' + escapeHtml(d.text) + '</span></li>';
        }).join('') + '</ul></div>';

    //Folder table with expandable image preview
    var tableHtml = '<div class="train-pf-table-wrap">'
      + '<div class="train-pf-table-hdr"><span class="train-pf-card-hdr"><span>\u6587\u4ef6\u5939\u7ed3\u6784</span></span></div>'
      + '<div class="train-pf-table-head"><div>\u8def\u5f84</div><div>\u6982\u5ff5\u6807\u7b7e</div><div style="text-align:right;">Repeats</div><div style="text-align:right;">\u56fe\u7247\u6570</div></div>';
    tableHtml += folders.map(function(f, idx) {
      var rawTag = f.first_tag || f.caption_preview || f.name.replace(/^\d+_/, '');
      var tag = String(rawTag || '').split(',')[0].split('\n')[0].trim();
      var repeats = f.repeats || 0;
      var fPath = f.path || '';
      return '<div class="train-pf-table-row" style="cursor:pointer;" onclick="toggleFolderPreview(' + idx + ',this)">'
        + '<div class="train-pf-folder-name">' + _ico('folder', 14) + ' ' + escapeHtml(f.name) + '</div>'
        + '<div class="train-pf-tag" id="pf-tag-' + idx + '">' + escapeHtml(tag) + '</div>'
        + '<div style="text-align:right;font-variant-numeric:tabular-nums;">' + repeats + '</div>'
        + '<div style="text-align:right;font-variant-numeric:tabular-nums;">' + f.image_count + '</div>'
        + '</div>'
        + '<div class="train-pf-thumbs" id="pf-thumbs-' + idx + '" data-folder="' + escapeHtml(fPath) + '" style="display:none;"></div>';
    }).join('');
    tableHtml += '</div>';


    return '<div class="train-pf-scroll">'
      + '<div class="train-pf-header"><div style="display:flex;align-items:center;gap:10px;">'
      + _ico('bar-chart', 16) + ' <span style="font-size:0.9rem;font-weight:700;">\u6570\u636e\u96c6\u9884\u89c8</span></div>'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      + '<span style="font-size:0.68rem;color:var(--text-muted);">' + escapeHtml(dataDir) + '</span>'
      + '<button class="btn btn-outline btn-sm" type="button" onclick="scanDataset()" style="font-size:0.68rem;">\u91cd\u65b0\u626b\u63cf</button>'
      + '</div></div>'
      + metricsHtml
      + '<div class="train-pf-row2">' + resoHtml + diagHtml + '</div>'
      + tableHtml
      + '</div>';
  }

  return {
    renderPreflightDetail,
    renderPreflightOverviewPanel,
    renderPreflightActionPanel,
    renderPreflightReport,
    renderPreflightPanel,
    _pfTag,
    _pfMetric,
  };
}
