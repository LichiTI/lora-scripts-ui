export function createCaptionCleanupPanel({ api, $, escapeHtml, showToast }) {
  // ========== Caption 清洗 ==========
  function renderCaptionCleanup() {
    const content = $('#dataset-content');
    if (!content) return;
    content.innerHTML = `
      <section class="form-section">
        <header class="section-header"><h3>Caption 清洗</h3></header>
        <div class="section-summary">批量清理数据集中的 caption 文件：去重、排序、搜索替换、追加/删除标签等。</div>
     <div class="section-content tool-fields">
          <div class="config-group" style="grid-column:1/-1;">
            <label>数据集路径</label>
            <div class="input-picker">
              <button class="picker-icon" type="button" onclick="pickPathForInput('cleanup-path', 'folder')">
                <svg class="icon"><use href="#icon-folder"></use></svg>
              </button>
              <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('cleanup-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
              <input class="text-input" type="text" id="cleanup-path" placeholder="./train/your_dataset">
            </div>
          </div>
          <div class="config-group">
            <label>Caption 扩展名</label>
            <input class="text-input" type="text" id="cleanup-ext" value=".txt">
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>递归处理子目录</label></div>
            <label class="switch switch-compact"><input type="checkbox" id="cleanup-recursive"checked><span class="slider round"></span></label>
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>去除重复标签</label></div>
            <label class="switch switch-compact"><input type="checkbox" id="cleanup-dedupe" checked><span class="slider round"></span></label>
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>标签排序</label></div>
            <label class="switch switch-compact"><input type="checkbox" id="cleanup-sort"><span class="slider round"></span></label>
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>合并空白字符</label></div>
            <label class="switch switch-compact"><input type="checkbox" id="cleanup-collapse-ws" checked><span class="slider round"></span></label>
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>下划线转空格</label></div>
            <label class="switch switch-compact"><input type="checkbox" id="cleanup-underscore"><span class="slider round"></span></label>
          </div>
          <div class="config-group">
            <label>前置追加标签</label>
            <input class="text-input" type="text" id="cleanup-prepend" placeholder="tag1, tag2">
          </div>
          <div class="config-group">
            <label>后置追加标签</label>
            <input class="text-input" type="text" id="cleanup-append" placeholder="tag1, tag2">
          </div>
          <div class="config-group">
            <label>删除指定标签</label>
            <input class="text-input" type="text" id="cleanup-remove" placeholder="tag_to_remove">
          </div>
          <div class="config-group">
            <label>搜索文本</label>
            <input class="text-input" type="text" id="cleanup-search" placeholder="搜索内容">
          </div>
          <div class="config-group">
            <label>替换文本</label>
            <input class="text-input" type="text" id="cleanup-replace" placeholder="替换为">
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>使用正则表达式</label></div>
            <label class="switch switch-compact"><input type="checkbox" id="cleanup-regex"><span class="slider round"></span></label>
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>应用前自动备份</label></div>
            <label class="switch switch-compact"><input type="checkbox" id="cleanup-backup" checked><span class="slider round"></span></label>
          </div>
        </div>
        <div class="tool-actions" style="display:flex;gap:8px;">
          <button class="btn btn-outline btn-sm" type="button" onclick="runCaptionCleanupPreview()">预览变更</button>
          <button class="btn btn-primary btn-sm" type="button" onclick="runCaptionCleanupApply()">提交异步清洗</button>
        </div>
        <div id="cleanup-job" style="margin-top:12px;"></div>
        <div id="cleanup-result" style="margin-top:16px;"></div>
      </section>
    `;
  }

  function gatherCleanupParams() {
    return {
      path: $('#cleanup-path')?.value?.trim() || '',
      caption_extension: $('#cleanup-ext')?.value || '.txt',
      recursive: $('#cleanup-recursive')?.checked ?? true,
      dedupe_tags: $('#cleanup-dedupe')?.checked ?? true,
      sort_tags: $('#cleanup-sort')?.checked || false,
      collapse_whitespace: $('#cleanup-collapse-ws')?.checked ?? true,
      replace_underscore: $('#cleanup-underscore')?.checked || false,
      prepend_tags: $('#cleanup-prepend')?.value || '',
      append_tags: $('#cleanup-append')?.value || '',
      remove_tags:$('#cleanup-remove')?.value || '',
      search_text: $('#cleanup-search')?.value || '',
      replace_text: $('#cleanup-replace')?.value || '',
      use_regex: $('#cleanup-regex')?.checked || false,
      create_backup_before_apply: $('#cleanup-backup')?.checked ?? true,
    };
}

  async function runCaptionCleanupPreview() {
    const params = gatherCleanupParams();
    if (!params.path) { showToast('请先填写数据集路径。'); return; }
  const result = $('#cleanup-result');
    if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>预览中...</span></div>';
    try {
      const response = await api.captionCleanupPreview(params);
      const data = response?.data;
      if (!data) { if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>无结果</span></div>'; return; }
      const summary = data.summary || {};
      const samples = data.samples ||[];
      if (result) result.innerHTML = `
        <div class="module-list">
          <div class="module-list-item module-list-item-static">
            <div class="module-list-main">
              <strong>扫描文件: ${summary.total_file_count?? '-'}</strong>
              <span class="module-list-meta">将变更: ${summary.changed_file_count ?? '-'} | 无变化: ${summary.unchanged_file_count ?? '-'}</span>
            </div>
          </div>
          ${samples.map((s) => `
            <div class="module-list-item module-list-item-static">
              <div class="module-list-main">
                <strong>${escapeHtml(s.file)}</strong>
                <span class="module-list-meta">前: ${escapeHtml(s.before || '')}</span>
                <span class="module-list-meta" style="color:var(--accent);">后: ${escapeHtml(s.after || '')}</span>
              </div>
            </div>
          `).join('')}
    </div>
      `;
    } catch (error) {
      if (result) result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(error.message || '预览失败')}</span></div>`;
    }
  }

  async function runCaptionCleanupApply() {
      const params = gatherCleanupParams();
      if (!params.path) { showToast('请先填写数据集路径。'); return; }
      const jobEl = $('#cleanup-job');
      if (jobEl) jobEl.innerHTML = '提交中...';
      try {
        const response = await api.captionCleanupStart(params);
        const jobId = response?.data?.job_id;
        const preview = response?.data?.preview;
        if (preview) {
          const result = $('#cleanup-result');
          if (result && preview.summary) {
            result.innerHTML = `
              <div class="module-list">
                <div class="module-list-item module-list-item-static">
                  <div class="module-list-main">
                    <strong>即将变更: ${preview.summary.changed_file_count ?? '-'}</strong>
                    <span class="module-list-meta">扫描文件: ${preview.summary.total_file_count ?? '-'} | 无变化: ${preview.summary.unchanged_file_count ?? '-'}</span>
                  </div>
                </div>
              </div>
            `;
          }
        }
        if (!jobId) throw new Error('未返回 job_id');
        if (jobEl) jobEl.innerHTML = `清洗任务已提交：${escapeHtml(jobId)}`;
        showToast('Caption 清洗任务已提交。');
        pollCleanupJob(jobId);
      } catch (error) {
        if (jobEl) jobEl.innerHTML = `<span style="color:var(--danger);">${escapeHtml(error.message || '提交失败')}</span>`;
        showToast(error.message || 'Caption 清洗失败。');
      }
    };
  
    async function pollCleanupJob(jobId) {
      const jobEl = $('#cleanup-job');
      const result = $('#cleanup-result');
      const timer = setInterval(async () => {
        try {
          const data = await api.getJob(jobId);
          if (jobEl) {
            jobEl.innerHTML = `任务 ${escapeHtml(jobId)}: ${escapeHtml(data.status || 'pending')} ${(Math.round((data.progress || 0) * 100))}% <button class="btn btn-outline btn-sm" type="button" onclick="cancelCleanupJob('${escapeHtml(jobId)}')">取消</button>`;
          }
          if (data.status === 'completed') {
            clearInterval(timer);
            const changed = data.metadata?.preview?.summary?.changed_file_count;
            if (result) {
              result.innerHTML = `<div class="builtin-picker-empty"><span>清洗完成${changed != null ? `，预估改动 ${changed} 个文件` : ''}。</span></div>`;
            }
            showToast('Caption 清洗完成。');
            runCaptionCleanupPreview();
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
  
    async function cancelCleanupJob(jobId) {
      try {
        await api.cancelJob(jobId);
        showToast('已请求取消清洗任务。');
      } catch (error) {
        showToast(error.message || '取消失败。');
      }
    }

  return {
    renderCaptionCleanup,
    runCaptionCleanupPreview,
    runCaptionCleanupApply,
    cancelCleanupJob,
  };
}
