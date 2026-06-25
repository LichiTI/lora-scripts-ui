export function createTagEditorPanel({ api, $, showToast }) {
  function renderTagEditor() {
    const content = $('#dataset-content');
    if (!content) return;
    content.innerHTML = `
      <div id="tageditor-status" style="padding:4px 0 12px;font-size:0.85rem;color:var(--text-dim);"></div>
      <section class="form-section">
        <header class="section-header">
          <h3>标签编辑器 (Tag Editor)</h3>
        </header>
        <div class="section-summary">当前版本使用集成式 Tag Editor，不再依赖外部 28001 iframe。下面是常用入口。</div>
        <div class="section-content" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
          <button class="btn btn-outline" type="button" onclick="switchDatasetTab('tagger')">WD14 / CL 自动标注</button>
          <button class="btn btn-outline" type="button" onclick="switchDatasetTab('translation')">标签百科预翻译</button>
          <button class="btn btn-outline" type="button" onclick="switchDatasetTab('suggestions')">智能标签建议</button>
          <button class="btn btn-outline" type="button" onclick="switchDatasetTab('cleanup')">Caption 清洗</button>
          <button class="btn btn-outline" type="button" onclick="switchDatasetTab('backups')">Caption 备份 / 恢复</button>
          <button class="btn btn-outline" type="button" onclick="switchDatasetTab('analysis')">数据集分析</button>
        </div>
        <div style="margin-top:12px;color:var(--text-muted);font-size:0.82rem;line-height:1.6;">
          如果你要批量修改标签，请先进入「智能标签建议」或「Caption 清洗」；如果要重新打标，请进入「标签器」。
        </div>
      </section>
    `;
    pollTagEditorStatus();
  }

  async function pollTagEditorStatus() {
    const statusEl = $('#tageditor-status');
    if (!statusEl) return;
    try {
      const data = await api.getTagEditorStatus();
      const payload = data?.data || data || {};
      const labels = {
        ready: '✅ 标签编辑器已就绪',
        cleanroom: '✅ 集成式标签编辑器已就绪',
        starting: '⏳ 标签编辑器正在启动...',
        queued: '⏳ 标签编辑器即将启动...',
        disabled: '⛔ 标签编辑器已禁用（启动时添加了 --disable-tageditor）',
        missing_dependencies: '❌ 依赖未安装，请先运行 install_tageditor',
        missing_launcher: '❌ 文件缺失',
        failed: '❌ 启动失败',
      };
      const status = payload.status || 'unknown';
      const text = labels[status] || `状态: ${status}`;
      statusEl.textContent = text + (payload.detail ? ` — ${payload.detail}` : '');
      if (!['ready', 'cleanroom', 'disabled', 'failed', 'missing_dependencies', 'missing_launcher'].includes(status)) {
        setTimeout(pollTagEditorStatus, 2000);
      }
    } catch (error) {
      statusEl.textContent = '无法获取状态';
    }
  }

  function refreshTagEditorIframe() {
    pollTagEditorStatus();
  }

  return {
    renderTagEditor,
    refreshTagEditorIframe,
  };
}
