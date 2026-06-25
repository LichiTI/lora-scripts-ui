export function createAnalysisSuggestions({ state, api, $, escapeHtml, showToast, renderView }) {
  // ========== 数据集分析 ==========
  function renderDatasetAnalysis() {
      const content = $('#dataset-content');
      if (!content) return;
      content.innerHTML = `
        <section class="form-section">
          <header class="section-header"><h3>数据集分析</h3></header>
          <div class="section-summary">提交后台分析任务，生成可复用的 Findings、审查队列、Route 检查和标签分布摘要。</div>
          <div class="section-content tool-fields">
            <div class="config-group" style="grid-column:1/-1;">
              <label>数据集路径</label>
              <div class="input-picker">
                <button class="picker-icon" type="button" onclick="pickPathForInput('analysis-path', 'folder')">
                  <svg class="icon"><use href="#icon-folder"></use></svg>
                </button>
                <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('analysis-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
                <input class="text-input" type="text" id="analysis-path" placeholder="./train/your_dataset">
              </div>
            </div>
            <div class="config-group">
              <label>Caption 扩展名</label>
              <input class="text-input" type="text" id="analysis-ext" value=".txt">
            </div>
            <div class="config-group">
              <label>Top 标签数</label>
              <input class="text-input" type="number" id="analysis-top" value="40" min="1" max="200">
            </div>
            <div class="config-group">
              <label>Route Family</label>
              <select id="analysis-route">
                <option value="">通用 / Generic</option>
                <option value="sdxl">SDXL</option>
                <option value="anima">Anima</option>
                <option value="newbie">Newbie</option>
              </select>
            </div>
          </div>
          <div class="tool-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" type="button" onclick="previewDatasetAnalysis()">快速预览</button>
            <button class="btn btn-primary btn-sm" type="button" onclick="startDatasetAnalysis()">提交分析任务</button>
            <button class="btn btn-outline btn-sm" type="button" onclick="loadCachedDatasetAnalysis()">打开缓存结果</button>
          </div>
          <div id="analysis-job" style="margin-top:12px;font-size:0.9rem;color:var(--text-dim);"></div>
          <div id="analysis-result" style="margin-top:16px;"></div>
        </section>
      `;
    }
  
    function _renderAnalysisReport(data, targetId = 'analysis-result') {
      state.tagAnalysisReport = data || null;
      const result = $('#' + targetId);
      if (!result) return;
      const summary = data?.summary || {};
      const routeAudit = data?.route_audit || {};
      const findings = data?.findings || [];
      const topTags = data?.tag_distribution?.top_tags || [];
      const reviewQueues = data?.review_queues || {};
      const findingsByImage = {};
      findings.forEach((finding) => {
        const imagePath = finding.image_path || '__dataset__';
        if (!findingsByImage[imagePath]) findingsByImage[imagePath] = [];
        findingsByImage[imagePath].push(finding);
      });
      const imageEntries = Object.entries(findingsByImage).filter(([key]) => key !== '__dataset__').slice(0, 8);
      result.innerHTML = `
        <div class="module-list">
          <div class="module-list-item module-list-item-static">
            <div class="module-list-main">
              <strong>图片: ${summary.image_count ?? '-'}</strong>
              <span class="module-list-meta">已写 Caption: ${summary.captioned_count ?? '-'} | 缺失: ${summary.missing_caption_count ?? '-'} | 空白: ${summary.empty_caption_count ?? '-'}</span>
              <span class="module-list-meta">Route: ${escapeHtml(routeAudit.route_family || 'generic')} | 主风格: ${escapeHtml(summary.caption_style || '-')}</span>
              <span class="module-list-meta">Token Density: ${routeAudit.token_density ?? '-'}</span>
            </div>
          </div>
          ${Object.entries(data?.findings_by_severity || {}).map(([severity, count]) => `
            <div class="module-list-item module-list-item-static">
              <div class="module-list-main"><strong>${escapeHtml(severity)}</strong></div>
              <span class="module-list-time">${count}</span>
            </div>
          `).join('')}
          ${topTags.slice(0, 8).map((entry) => `
            <div class="module-list-item module-list-item-static">
              <div class="module-list-main"><strong>${escapeHtml(entry.tag)}</strong></div>
              <span class="module-list-time">${entry.count}</span>
            </div>
          `).join('')}
        </div>
        <div style="margin-top:14px;">
          <strong>审查队列</strong>
          <div class="module-list" style="margin-top:8px;">
            ${Object.entries(reviewQueues).slice(0, 6).map(([code, paths]) => `
              <div class="module-list-item module-list-item-static">
                <div class="module-list-main"><strong>${escapeHtml(code)}</strong><span class="module-list-meta">${paths.length} 张</span></div>
                <button class="btn btn-outline btn-sm btn-picker-action" type="button" onclick="viewReviewQueue('${encodeURIComponent(code)}')">查看</button>
              </div>
            `).join('') || '<div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>无</strong></div></div>'}
          </div>
        </div>
        <div id="analysis-queue-view" style="margin-top:14px;"></div>
        <div style="margin-top:14px;">
          <strong>按图片查看 Findings</strong>
          <div class="module-list" style="margin-top:8px;">
            ${imageEntries.map(([imagePath, imageFindings]) => `
              <div class="module-list-item module-list-item-static">
                <div class="module-list-main">
                  <strong>${escapeHtml((imagePath || '').split(/[\\\\/]/).pop() || imagePath)}</strong>
                  <span class="module-list-meta">${imageFindings.length} 条 findings</span>
                </div>
                <button class="btn btn-outline btn-sm btn-picker-action" type="button" onclick="inspectFindingImage('${encodeURIComponent(imagePath)}')">查看</button>
              </div>
            `).join('') || '<div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>无</strong></div></div>'}
          </div>
        </div>
        <div id="analysis-image-view" style="margin-top:14px;"></div>
        <div style="margin-top:14px;">
          <strong>Top Findings</strong>
          <div class="module-list" style="margin-top:8px;">
            ${findings.slice(0, 8).map((finding) => `
              <div class="module-list-item module-list-item-static">
                <div class="module-list-main">
                  <strong>${escapeHtml(finding.code || '-')}</strong>
                  <span class="module-list-meta">${escapeHtml(finding.message || '')}</span>
                  <span class="module-list-meta">${escapeHtml((finding.image_path || '').split(/[\\\\/]/).pop() || 'dataset')}</span>
                </div>
              </div>
            `).join('') || '<div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>无</strong></div></div>'}
          </div>
        </div>
      `;
    }
  
    function viewReviewQueue(code) {
      const report = state.tagAnalysisReport || {};
      const queueCode = decodeURIComponent(code || '');
      const container = $('#analysis-queue-view');
      if (!container) return;
      const paths = (report.review_queues && report.review_queues[queueCode]) || [];
      container.innerHTML = `
        <strong>${escapeHtml(queueCode)} 队列</strong>
        <div class="module-list" style="margin-top:8px;">
          ${paths.slice(0, 12).map((path) => `
            <div class="module-list-item module-list-item-static">
              <div class="module-list-main">
                <strong>${escapeHtml((path || '').split(/[\\\\/]/).pop() || path)}</strong>
                <span class="module-list-meta">${escapeHtml(path)}</span>
              </div>
              <button class="btn btn-outline btn-sm btn-picker-action" type="button" onclick="sendFindingToSuggestions('${encodeURIComponent(path)}')">送到建议面板</button>
            </div>
          `).join('') || '<div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>无条目</strong></div></div>'}
        </div>
      `;
    }
  
    function inspectFindingImage(encodedPath) {
      const imagePath = decodeURIComponent(encodedPath || '');
      const report = state.tagAnalysisReport || {};
      const findings = (report.findings || []).filter((finding) => (finding.image_path || '') === imagePath);
      const container = $('#analysis-image-view');
      if (!container) return;
      container.innerHTML = `
        <strong>${escapeHtml((imagePath || '').split(/[\\\\/]/).pop() || imagePath)}</strong>
        <div class="module-list" style="margin-top:8px;">
          ${findings.map((finding) => `
            <div class="module-list-item module-list-item-static">
              <div class="module-list-main">
                <strong>${escapeHtml(finding.code || '-')}</strong>
                <span class="module-list-meta">${escapeHtml(finding.message || '')}</span>
                ${finding.related_tags?.length ? `<span class="module-list-meta">${escapeHtml(finding.related_tags.join(', '))}</span>` : ''}
              </div>
              <span class="module-list-time">${escapeHtml(finding.severity || '')}</span>
            </div>
          `).join('') || '<div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>无 findings</strong></div></div>'}
        </div>
      `;
    }
  
    function sendFindingToSuggestions(encodedPath) {
      const imagePath = decodeURIComponent(encodedPath || '');
      state.datasetSubTab = 'suggestions';
      renderView('dataset');
      setTimeout(() => {
        const suggestPath = $('#suggest-path');
        const suggestImage = $('#suggest-image');
        const analysisPath = $('#analysis-path')?.value?.trim();
        if (suggestPath && analysisPath) suggestPath.value = analysisPath;
        if (suggestImage) suggestImage.value = imagePath;
      }, 0);
    }
  
    async function runDatasetAnalysis() {
    return previewDatasetAnalysis();
  }

  async function previewDatasetAnalysis() {
      const pathVal = $('#analysis-path')?.value?.trim();
      if (!pathVal) { showToast('请先填写数据集路径。'); return; }
      const result = $('#analysis-result');
      if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>预览中...</span></div>';
      try {
        const response = await api.previewTagAnalysis({
          path: pathVal,
          caption_extension: $('#analysis-ext')?.value || '.txt',
          route_family: $('#analysis-route')?.value || '',
        });
        const data = response?.data;
        if (!data) { if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>无结果</span></div>'; return; }
        _renderAnalysisReport(data);
      } catch (error) {
        if (result) result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(error.message || '分析失败')}</span></div>`;
      }
    };
  
    async function startDatasetAnalysis() {
      const pathVal = $('#analysis-path')?.value?.trim();
      if (!pathVal) { showToast('请先填写数据集路径。'); return; }
      const jobEl = $('#analysis-job');
      if (jobEl) jobEl.innerHTML = '提交中...';
      try {
        const response = await api.startTagAnalysis({
          path: pathVal,
          caption_extension: $('#analysis-ext')?.value || '.txt',
          route_family: $('#analysis-route')?.value || '',
        });
        const jobId = response?.data?.job_id;
        if (!jobId) throw new Error('未返回 job_id');
        if (jobEl) jobEl.innerHTML = `后台任务已提交：${escapeHtml(jobId)}`;
        showToast('分析任务已提交。');
        pollAnalysisJob(jobId, pathVal);
      } catch (error) {
        if (jobEl) jobEl.innerHTML = `<span style="color:var(--danger);">${escapeHtml(error.message || '提交失败')}</span>`;
        showToast(error.message || '分析任务提交失败。');
      }
    }
  
    async function loadCachedDatasetAnalysis() {
      const pathVal = $('#analysis-path')?.value?.trim();
      if (!pathVal) { showToast('请先填写数据集路径。'); return; }
      const result = $('#analysis-result');
      if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>读取缓存中...</span></div>';
      try {
        const response = await api.getTagAnalysisResult({ path: pathVal, caption_extension: $('#analysis-ext')?.value || '.txt' });
        const data = response?.data || {};
        if (data.status === 'missing') {
          if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>暂无缓存结果，请先提交分析任务。</span></div>';
          return;
        }
        if (data.status === 'stale') {
          showToast('缓存结果已过期，建议重新分析。');
        }
        _renderAnalysisReport(data.payload || {});
      } catch (error) {
        if (result) result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(error.message || '读取失败')}</span></div>`;
      }
    }
  
    async function pollAnalysisJob(jobId, datasetPath) {
      const jobEl = $('#analysis-job');
      const result = $('#analysis-result');
      if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>后台分析运行中...</span></div>';
      const timer = setInterval(async () => {
        try {
          const response = await api.getJob(jobId);
          const data = response || {};
          if (jobEl) {
            jobEl.innerHTML = `任务 ${escapeHtml(jobId)}: ${escapeHtml(data.status || 'pending')} ${(Math.round((data.progress || 0) * 100))}% <button class="btn btn-outline btn-sm" type="button" onclick="cancelDatasetAnalysisJob('${escapeHtml(jobId)}')">取消</button>`;
          }
          if (data.status === 'completed') {
            clearInterval(timer);
            const cached = await api.getTagAnalysisResult({ job_id: jobId, path: datasetPath });
            _renderAnalysisReport(cached?.data?.payload || {});
            showToast('数据集分析完成。');
          } else if (data.status === 'failed' || data.status === 'cancelled') {
            clearInterval(timer);
            if (result) result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(data.error || data.status || '任务未完成')}</span></div>`;
          }
        } catch (error) {
          clearInterval(timer);
          if (jobEl) jobEl.innerHTML = `<span style="color:var(--danger);">${escapeHtml(error.message || '轮询失败')}</span>`;
        }
      }, 1200);
    }
  
    async function cancelDatasetAnalysisJob(jobId) {
      try {
        await api.cancelJob(jobId);
        showToast('已请求取消分析任务。');
      } catch (error) {
        showToast(error.message || '取消失败。');
      }
    }
  
    function renderTagSuggestions() {
      const content = $('#dataset-content');
      if (!content) return;
      content.innerHTML = `
        <section class="form-section">
          <header class="section-header"><h3>智能建议</h3></header>
          <div class="section-summary">基于已缓存的数据集分析，给当前图片或数据集生成规则建议；LLM refine 仅作为可选二级动作。</div>
          <div class="section-content tool-fields">
            <div class="config-group" style="grid-column:1/-1;">
              <label>数据集路径</label>
              <div class="input-picker">
                <button class="picker-icon" type="button" onclick="pickPathForInput('suggest-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
                <button class="picker-mode-icon-btn" type="button" onclick="openBuiltinPickerForInput('suggest-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
                <input class="text-input" type="text" id="suggest-path" placeholder="./train/your_dataset">
              </div>
            </div>
            <div class="config-group">
              <label>图片路径（可选，单张）</label>
              <input class="text-input" type="text" id="suggest-image" placeholder="H:/dataset/img.png">
            </div>
            <div class="config-group">
              <label>Route Family</label>
              <select id="suggest-route">
                <option value="">通用 / Generic</option>
                <option value="sdxl">SDXL</option>
                <option value="anima">Anima</option>
                <option value="newbie">Newbie</option>
              </select>
            </div>
            <div class="config-group">
              <label>LLM API Key（可选）</label>
              <input class="text-input" type="password" id="suggest-api-key" placeholder="sk-...">
            </div>
          </div>
          <div class="tool-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" type="button" onclick="loadTagSuggestions()">获取规则建议</button>
            <button class="btn btn-outline btn-sm" type="button" onclick="refreshTagSuggestionsIndex()">刷新建议缓存</button>
            <button class="btn btn-outline btn-sm" type="button" onclick="refineTagSuggestionsWithLlm()">LLM Refine</button>
          </div>
          <div id="suggest-result" style="margin-top:16px;"></div>
        </section>
      `;
    }
  
    function _renderSuggestionReport(data, targetId = 'suggest-result') {
      state.tagSuggestionReport = data || null;
      const result = $('#' + targetId);
      if (!result) return;
      const suggestions = data?.suggestions || [];
      result.innerHTML = `
        <div class="module-list">
          ${suggestions.map((entry) => `
            <div class="module-list-item module-list-item-static">
              <div class="module-list-main">
                <strong>${escapeHtml(entry.code || '-')}</strong>
                <span class="module-list-meta">${escapeHtml(entry.message || '')}</span>
                ${entry.tags?.length ? `<span class="module-list-meta">${escapeHtml(entry.tags.join(', '))}</span>` : ''}
              </div>
              <span class="module-list-time">${Math.round((entry.confidence || 0) * 100)}%</span>
              <button class="btn btn-outline btn-sm btn-picker-action" type="button" onclick="useSuggestionPreview(${suggestions.indexOf(entry)})">预览</button>
            </div>
          `).join('') || '<div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>无建议</strong></div></div>'}
        </div>
        <div id="suggest-preview" style="margin-top:14px;"></div>
      `;
    }
  
    function useSuggestionPreview(index) {
      const report = state.tagSuggestionReport || {};
      const entry = (report.suggestions || [])[Number(index)];
      const container = $('#suggest-preview');
      if (!container || !entry) return;
      const previewText = entry.tags?.length ? entry.tags.join(', ') : (entry.message || '');
      container.innerHTML = `
        <strong>建议预览</strong>
        <div class="module-list" style="margin-top:8px;">
          <div class="module-list-item module-list-item-static">
            <div class="module-list-main">
              <strong>${escapeHtml(entry.code || '-')}</strong>
              <span class="module-list-meta">${escapeHtml(entry.suggested_action || entry.message || '')}</span>
            </div>
          </div>
        </div>
        <textarea class="text-input" style="margin-top:8px;min-height:88px;width:100%;">${escapeHtml(previewText)}</textarea>
      `;
    }
  
    async function loadTagSuggestions() {
      const pathVal = $('#suggest-path')?.value?.trim();
      if (!pathVal) { showToast('请先填写数据集路径。'); return; }
      const imagePath = $('#suggest-image')?.value?.trim();
      const result = $('#suggest-result');
      if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>加载建议中...</span></div>';
      try {
        const response = await api.getTagSuggestions({
          path: pathVal,
          route_family: $('#suggest-route')?.value || '',
          image_paths: imagePath ? [imagePath] : [],
        });
        const data = response?.data || {};
        if (data.status === 'needs_refresh') {
          if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>还没有可复用的分析缓存，请先在“数据集分析”页提交分析任务。</span></div>';
          return;
        }
        _renderSuggestionReport(data);
      } catch (error) {
        if (result) result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(error.message || '读取失败')}</span></div>`;
      }
    }
  
    async function refineTagSuggestionsWithLlm() {
      const pathVal = $('#suggest-path')?.value?.trim();
      if (!pathVal) { showToast('请先填写数据集路径。'); return; }
      const imagePath = $('#suggest-image')?.value?.trim();
      const result = $('#suggest-result');
      if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>请求 LLM refine 中...</span></div>';
      try {
        const response = await api.refineTagSuggestions({
          path: pathVal,
          route_family: $('#suggest-route')?.value || '',
          image_paths: imagePath ? [imagePath] : [],
          api_key: $('#suggest-api-key')?.value?.trim() || '',
        });
        const data = response?.data || {};
        if (data.status === 'unavailable') {
          if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>未配置 API Key，当前返回规则建议兜底信息。</span></div>';
          return;
        }
        _renderSuggestionReport({ suggestions: data.suggestions || [] });
      } catch (error) {
        if (result) result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(error.message || 'LLM refine 失败')}</span></div>`;
      }
    }
  
    async function refreshTagSuggestionsIndex() {
      const pathVal = $('#suggest-path')?.value?.trim();
      if (!pathVal) { showToast('请先填写数据集路径。'); return; }
      const result = $('#suggest-result');
      if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>刷新建议缓存中...</span></div>';
      try {
        const response = await api.refreshTagSuggestions({
          path: pathVal,
          route_family: $('#suggest-route')?.value || '',
        });
        const jobId = response?.data?.job_id;
        if (!jobId) throw new Error('未返回 job_id');
        const timer = setInterval(async () => {
          try {
            const job = await api.getJob(jobId);
            if (job.status === 'completed') {
              clearInterval(timer);
              showToast('建议缓存刷新完成。');
              loadTagSuggestions();
            } else if (job.status === 'failed' || job.status === 'cancelled') {
              clearInterval(timer);
              if (result) result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(job.error || job.status || '刷新失败')}</span></div>`;
            }
          } catch (error) {
            clearInterval(timer);
            if (result) result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(error.message || '刷新失败')}</span></div>`;
          }
        }, 1200);
      } catch (error) {
        if (result) result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(error.message || '刷新失败')}</span></div>`;
      }
    }

  return {
    renderDatasetAnalysis,
    runDatasetAnalysis,
    previewDatasetAnalysis,
    startDatasetAnalysis,
    loadCachedDatasetAnalysis,
    cancelDatasetAnalysisJob,
    viewReviewQueue,
    inspectFindingImage,
    sendFindingToSuggestions,
    renderTagSuggestions,
    loadTagSuggestions,
    refreshTagSuggestionsIndex,
    refineTagSuggestionsWithLlm,
    useSuggestionPreview,
  };
}
