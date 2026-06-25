export function createTagTranslationPanel({ api, $, escapeHtml, showToast }) {
  let pollTimer = null;
  let templatesCache = [];

  function renderTagTranslationPanel() {
    const content = $('#dataset-content');
    if (!content) return;
    content.innerHTML = `
      <section class="form-section">
        <header class="section-header"><h3>标签百科预翻译</h3></header>
        <div class="section-summary">批量翻译 Danbooru 标签百科缓存，结果会用于标签建议和标签检索。</div>
        <div class="section-content tool-fields">
          <div class="config-group">
            <label>预翻译模板</label>
            <select id="tag-translation-template">
              <option value="">加载中...</option>
            </select>
            <p class="field-desc" id="tag-translation-template-desc">正在读取后端模板。</p>
          </div>
          <div class="config-group">
            <label>目标语言</label>
            <input class="text-input" id="tag-translation-target-lang" type="text" value="Chinese">
          </div>
          <div class="config-group">
            <label>LLM Provider</label>
            <select id="tag-translation-provider">
              <option value="local">本地 LLM</option>
              <option value="openai">OpenAI / 在线</option>
            </select>
          </div>
          <div class="config-group">
            <label>最大 Tokens</label>
            <input class="text-input" id="tag-translation-max-tokens" type="number" value="4096" min="512" max="32768" step="512">
          </div>
        </div>
        <div class="tool-actions" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" type="button" id="btn-start-tag-translation" onclick="startTagTranslation()">开始预翻译</button>
          <button class="btn btn-outline btn-sm" type="button" onclick="refreshTagTranslationStatus()">刷新状态</button>
          <button class="btn btn-outline btn-sm" type="button" onclick="stopTagTranslation()">停止</button>
          <span id="tag-translation-status" style="font-size:0.85rem;color:var(--text-dim);"></span>
        </div>
        <div id="tag-translation-template-rules" class="module-list" style="margin-top:14px;"></div>
      </section>
    `;
    bindTemplateDescription();
    loadTagTranslationTemplates();
    refreshTagTranslationStatus({ silent: true });
  }

  async function loadTagTranslationTemplates() {
    try {
      const response = await api.getTagTranslationTemplates();
      const payload = response?.data || response || {};
      templatesCache = Array.isArray(payload.templates) ? payload.templates : [];
      const select = $('#tag-translation-template');
      if (!select) return;
      const defaultId = payload.default_template_id || templatesCache[0]?.id || '';
      select.innerHTML = templatesCache.length
        ? templatesCache.map((template) => `<option value="${escapeHtml(template.id || '')}">${escapeHtml(template.label || template.id || '')}</option>`).join('')
        : '<option value="">暂无模板</option>';
      select.value = defaultId;
      updateTemplateDescription();
    } catch (error) {
      const desc = $('#tag-translation-template-desc');
      if (desc) desc.textContent = error.message || '读取模板失败。';
    }
  }

  function bindTemplateDescription() {
    const select = $('#tag-translation-template');
    if (select) select.onchange = updateTemplateDescription;
  }

  function updateTemplateDescription() {
    const templateId = $('#tag-translation-template')?.value || '';
    const template = templatesCache.find((item) => String(item.id || '') === templateId);
    const desc = $('#tag-translation-template-desc');
    if (desc) desc.textContent = template?.description || '选择一个预翻译模板。';
    const rules = $('#tag-translation-template-rules');
    if (!rules || !template) return;
    const policies = template.category_policy || {};
    const policyHtml = Object.entries(policies).map(([name, text]) => `
      <div class="module-list-item module-list-item-static">
        <div class="module-list-main">
          <strong>${escapeHtml(categoryLabel(name))}</strong>
          <span class="module-list-meta">${escapeHtml(text)}</span>
        </div>
      </div>
    `).join('');
    rules.innerHTML = policyHtml;
  }

  async function startTagTranslation() {
    const templateId = $('#tag-translation-template')?.value || '';
    if (!templateId) {
      showToast('请先选择一个预翻译模板。');
      return;
    }
    setBusy(true);
    try {
      await api.startTagTranslation({
        template_id: templateId,
        target_lang: $('#tag-translation-target-lang')?.value?.trim() || 'Chinese',
        provider: $('#tag-translation-provider')?.value || 'local',
        max_tokens: Number($('#tag-translation-max-tokens')?.value || 4096) || 4096,
      });
      showToast('标签预翻译任务已启动。');
      pollTranslationStatus();
    } catch (error) {
      setBusy(false);
      setStatus(error.message || '启动失败。', true);
      showToast(error.message || '启动标签预翻译失败。');
    }
  }

  async function stopTagTranslation() {
    try {
      await api.stopTagTranslation();
      showToast('已请求停止标签预翻译。');
      refreshTagTranslationStatus();
    } catch (error) {
      showToast(error.message || '停止失败。');
    }
  }

  async function refreshTagTranslationStatus(options = {}) {
    try {
      const status = await api.getTagTranslationStatus();
      renderStatus(status);
    } catch (error) {
      if (!options.silent) setStatus(error.message || '刷新状态失败。', true);
    }
  }

  function pollTranslationStatus() {
    if (pollTimer) clearInterval(pollTimer);
    refreshTagTranslationStatus({ silent: true });
    pollTimer = setInterval(refreshTagTranslationStatus, 2000);
  }

  function renderStatus(status) {
    const total = Number(status?.total || 0);
    const processed = Number(status?.processed || 0);
    const running = !!status?.running;
    const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
    const batch = status?.current_batch ? `，当前批次 ${status.current_batch}` : '';
    setStatus(running ? `运行中：${processed}/${total} (${pct}%)${batch}` : `未运行：${processed}/${total}`);
    setBusy(running);
    if (!running && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function setBusy(busy) {
    const btn = $('#btn-start-tag-translation');
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? '预翻译中...' : '开始预翻译';
  }

  function setStatus(text, error = false) {
    const status = $('#tag-translation-status');
    if (!status) return;
    status.style.color = error ? 'var(--danger)' : 'var(--text-dim)';
    status.textContent = text;
  }

  function categoryLabel(name) {
    const labels = { general: '通用', artist: '作者', copyright: '作品', character: '角色', meta: '元信息' };
    return labels[name] || name;
  }

  return {
    renderTagTranslationPanel,
    startTagTranslation,
    stopTagTranslation,
    refreshTagTranslationStatus,
  };
}
