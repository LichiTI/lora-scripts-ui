// renderers/dataset/advancedTagToolsPanel.js — 高级标签工具（P1/P2/P3 统一单 Tab）
//
// 内部二级分段：集成打标 / 结构化 / 近重复 / 频率批量 / 审查队列 / 版本历史 /
//               策略包 / 重标队列 / 一键管线 / 跨数据集情报
// 所有写操作均遵循 preview→apply 两段式，后端按 advanced_enabled 门控。
//
// 依赖（工厂注入）：api、$、escapeHtml、showToast

const SEGMENTS = [
  { id: 'pipeline', label: '一键管线' },
  { id: 'ensemble', label: '集成打标' },
  { id: 'structure', label: '结构化' },
  { id: 'dedupe', label: '近重复' },
  { id: 'frequency', label: '频率批量' },
  { id: 'review', label: '审查队列' },
  { id: 'policy', label: '策略包' },
  { id: 'retag', label: '重标队列' },
  { id: 'version', label: '版本历史' },
  { id: 'cross', label: '跨数据集情报' },
];

export function createAdvancedTagToolsPanel({ api, $, escapeHtml, showToast }) {
  let activeSegment = 'pipeline';
  let advancedEnabled = null;

  const esc = (value) => escapeHtml(String(value ?? ''));

  function pathPicker(id, placeholder = './train/your_dataset') {
    return `
      <div class="config-group" style="grid-column:1/-1;">
        <label>数据集路径</label>
        <div class="input-picker">
          <button class="picker-icon" type="button" onclick="pickPathForInput('${id}', 'folder')">
            <svg class="icon"><use href="#icon-folder"></use></svg>
          </button>
          <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('${id}', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
          <input class="text-input" type="text" id="${id}" placeholder="${placeholder}">
        </div>
      </div>`;
  }

  function boolCard(id, label, checked = true) {
    return `
      <div class="config-group row boolean-card">
        <div class="label-col"><label>${label}</label></div>
        <label class="switch switch-compact"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span class="slider round"></span></label>
      </div>`;
  }

  function setResult(id, html) {
    const el = $('#' + id);
    if (el) el.innerHTML = html;
  }

  function busy(id, text = '处理中...') {
    setResult(id, `<div class="builtin-picker-empty"><span>${esc(text)}</span></div>`);
  }

  function errorBox(id, error) {
    setResult(id, `<div class="builtin-picker-empty"><span>${esc(error?.message || '操作失败')}</span></div>`);
  }

  function unwrap(response) {
    const data = response?.data;
    if (data && data.status === 'error') throw new Error(data.message || '后端返回错误');
    return data || {};
  }

  function samplesList(samples) {
    const rows = Array.isArray(samples) ? samples : [];
    if (!rows.length) return '<div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>没有需要改写的文件</strong></div></div>';
    return rows.map((s) => `
      <div class="module-list-item module-list-item-static">
        <div class="module-list-main">
          <strong>${esc(s.image_path || s.file || '-')}</strong>
          <span class="module-list-meta">前: ${esc(s.before || '')}</span>
          <span class="module-list-meta" style="color:var(--accent);">后: ${esc(s.after || '')}</span>
        </div>
      </div>`).join('');
  }

  // ---------------------------------------------------------------- shell

  async function renderAdvancedTagTools() {
    const content = $('#dataset-content');
    if (!content) return;
    if (advancedEnabled === null) {
      try {
        const status = await api.getTagEditorStatus();
        advancedEnabled = Boolean(status?.data?.advanced_enabled ?? status?.advanced_enabled);
      } catch (_e) {
        advancedEnabled = false;
      }
    }
    const nav = SEGMENTS.map((s) => (
      `<button class="dataset-tab ${activeSegment === s.id ? 'active' : ''}" type="button" onclick="switchAdvancedTagSegment('${s.id}')">${s.label}</button>`
    )).join('');
    content.innerHTML = `
      <section class="form-section">
        <header class="section-header"><h3>高级标签工具</h3></header>
        <div class="section-summary">集成打标、结构化、近重复、频率批量、审查/重标队列、版本历史、策略包、闭环管线与跨数据集情报。写操作均为预览→应用两段式。</div>
        ${advancedEnabled ? '' : '<div class="builtin-picker-empty" style="margin:8px 0;"><span>高级标签功能未启用：请在 tag_editor_config 中开启 advanced 能力后再使用。</span></div>'}
        <nav class="dataset-tabs" aria-label="高级标签工具分段" style="margin-bottom:12px;">${nav}</nav>
        <div id="adv-segment-body"></div>
      </section>`;
    renderSegment();
  }

  function switchAdvancedTagSegment(segment) {
    activeSegment = segment;
    renderSegment();
  }

  function renderSegment() {
    const body = $('#adv-segment-body');
    if (!body) return;
    const map = {
      pipeline: segPipeline,
      ensemble: segEnsemble,
      structure: segStructure,
      dedupe: segDedupe,
      frequency: segFrequency,
      review: segReview,
      policy: segPolicy,
      retag: segRetag,
      version: segVersion,
      cross: segCross,
    };
    body.innerHTML = (map[activeSegment] || segPipeline)();
    if (activeSegment === 'policy') refreshPolicyPacks();
  }

  // ---------------------------------------------------------------- P3.3 pipeline

  function segPipeline() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-pipe-path')}
        <div class="config-group"><label>策略包 ID</label><input class="text-input" type="text" id="adv-pipe-pack" placeholder="sdxl_general_lora"></div>
        <div class="config-group"><label>路线（可空）</label><input class="text-input" type="text" id="adv-pipe-route" placeholder="sdxl / anima / newbie"></div>
        <div class="config-group"><label>批量大小</label><input class="text-input" type="number" id="adv-pipe-batch" value="10" min="1"></div>
        ${boolCard('adv-pipe-backup', '应用前自动备份', true)}
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvPipelinePlan()">计划（只读）</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="runAdvPipelineRun()">运行闭环（写）</button>
      </div>
      <div id="adv-pipe-result" style="margin-top:16px;"></div>`;
  }

  function pipelineParams() {
    return {
      path: $('#adv-pipe-path')?.value?.trim() || '',
      policy_pack: $('#adv-pipe-pack')?.value?.trim() || '',
      route_family: $('#adv-pipe-route')?.value?.trim() || '',
      batch_size: Number($('#adv-pipe-batch')?.value || 10) || 10,
      create_backup: $('#adv-pipe-backup')?.checked ?? true,
    };
  }

  async function runAdvPipelinePlan() {
    const params = pipelineParams();
    if (!params.path || !params.policy_pack) { showToast('请填写数据集路径与策略包 ID。'); return; }
    busy('adv-pipe-result', '生成计划中...');
    try {
      const data = unwrap(await api.pipelinePlan(params));
      const q = data.queue_summary || {};
      const p = data.policy_summary || {};
      setResult('adv-pipe-result', `
        <div class="module-list">
          <div class="module-list-item module-list-item-static"><div class="module-list-main">
            <strong>计划（不写盘）</strong>
            <span class="module-list-meta">队列标记: ${q.flagged_count ?? '-'} / ${q.image_count ?? '-'} 图</span>
            <span class="module-list-meta">策略包将改: ${p.changed_count ?? '-'} / 扫描 ${p.scanned_caption_count ?? '-'}</span>
            <span class="module-list-meta">本批待处理: ${data.batch_size ?? 0}</span>
          </div></div>
          ${samplesList(data.policy_samples)}
        </div>`);
    } catch (error) { errorBox('adv-pipe-result', error); }
  }

  async function runAdvPipelineRun() {
    const params = pipelineParams();
    if (!params.path || !params.policy_pack) { showToast('请填写数据集路径与策略包 ID。'); return; }
    busy('adv-pipe-result', '运行闭环中...');
    try {
      const data = unwrap(await api.pipelineRun(params));
      const r = data.recheck || {};
      setResult('adv-pipe-result', `
        <div class="module-list">
          <div class="module-list-item module-list-item-static"><div class="module-list-main">
            <strong>闭环完成</strong>
            <span class="module-list-meta">改写文件: ${data.modified_count ?? 0} | 标记完成: ${data.marked_done_count ?? 0}</span>
            <span class="module-list-meta">备份: ${esc(data.backup_name || '（无）')}</span>
            <span class="module-list-meta" style="color:var(--accent);">问题数 ${r.findings_before ?? '-'} → ${r.findings_after ?? '-'}（解决 ${r.findings_resolved ?? 0}）</span>
          </div></div>
        </div>`);
      showToast('闭环清洗完成。');
    } catch (error) { errorBox('adv-pipe-result', error); }
  }

  // ---------------------------------------------------------------- P1.1 ensemble

  function segEnsemble() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-ens-path')}
        <div class="config-group"><label>路线（可空）</label><input class="text-input" type="text" id="adv-ens-route" placeholder="sdxl / anima / newbie"></div>
        ${boolCard('adv-ens-backup', '应用前自动备份', true)}
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvEnsemblePreview()">预览</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="runAdvEnsembleApply()">应用（写）</button>
      </div>
      <div id="adv-ens-result" style="margin-top:16px;"></div>`;
  }

  function ensembleParams() {
    return {
      dir: $('#adv-ens-path')?.value?.trim() || '',
      route_family: $('#adv-ens-route')?.value?.trim() || '',
      create_backup: $('#adv-ens-backup')?.checked ?? true,
    };
  }

  async function runAdvEnsemblePreview() {
    const params = ensembleParams();
    if (!params.dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-ens-result', '预览中...');
    try {
      const data = unwrap(await api.ensembleTagPreview(params));
      const s = data.summary || {};
      setResult('adv-ens-result', `<div class="module-list">
        <div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>集成打标预览</strong>
        <span class="module-list-meta">将改: ${s.changed_count ?? '-'} / 扫描 ${s.scanned_caption_count ?? '-'}</span></div></div>
        ${samplesList(data.samples)}</div>`);
    } catch (error) { errorBox('adv-ens-result', error); }
  }

  async function runAdvEnsembleApply() {
    const params = ensembleParams();
    if (!params.dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-ens-result', '应用中...');
    try {
      const data = unwrap(await api.ensembleTagApply(params));
      setResult('adv-ens-result', `<div class="builtin-picker-empty"><span>集成打标已应用，改写 ${data.modified_count ?? 0} 个文件。</span></div>`);
      showToast('集成打标已应用。');
    } catch (error) { errorBox('adv-ens-result', error); }
  }

  // ---------------------------------------------------------------- P1.2 structure

  function segStructure() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-str-path')}
        <div class="config-group"><label>操作</label><input class="text-input" type="text" id="adv-str-op" placeholder="flat_to_structured"></div>
        ${boolCard('adv-str-backup', '应用前自动备份', true)}
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvStructurePreview()">预览</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="runAdvStructureApply()">应用（写）</button>
      </div>
      <div id="adv-str-result" style="margin-top:16px;"></div>`;
  }

  function structureParams() {
    return {
      dir: $('#adv-str-path')?.value?.trim() || '',
      operation: $('#adv-str-op')?.value?.trim() || 'flat_to_structured',
      create_backup: $('#adv-str-backup')?.checked ?? true,
    };
  }

  async function runAdvStructurePreview() {
    const params = structureParams();
    if (!params.dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-str-result', '预览中...');
    try {
      const data = unwrap(await api.structurePreview(params));
      const s = data.summary || {};
      setResult('adv-str-result', `<div class="module-list">
        <div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>结构化预览</strong>
        <span class="module-list-meta">将改: ${s.changed_count ?? '-'} / 扫描 ${s.scanned_caption_count ?? '-'}</span></div></div>
        ${samplesList(data.samples)}</div>`);
    } catch (error) { errorBox('adv-str-result', error); }
  }

  async function runAdvStructureApply() {
    const params = structureParams();
    if (!params.dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-str-result', '应用中...');
    try {
      const data = unwrap(await api.structureApply(params));
      setResult('adv-str-result', `<div class="builtin-picker-empty"><span>结构化已应用，改写 ${data.modified_count ?? 0} 个文件。</span></div>`);
      showToast('结构化已应用。');
    } catch (error) { errorBox('adv-str-result', error); }
  }

  // ---------------------------------------------------------------- P1.3 dedupe

  function segDedupe() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-dup-path')}
        <div class="config-group"><label>相似阈值</label><input class="text-input" type="number" id="adv-dup-threshold" value="6" min="0" max="64" step="1"></div>
      </div>
      <div class="tool-actions"><button class="btn btn-outline btn-sm" type="button" onclick="runAdvDedupe()">扫描近重复</button></div>
      <div id="adv-dup-result" style="margin-top:16px;"></div>`;
  }

  async function runAdvDedupe() {
    const params = {
      dir: $('#adv-dup-path')?.value?.trim() || '',
      hamming_threshold: Number($('#adv-dup-threshold')?.value || 6) || 6,
    };
    if (!params.dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-dup-result', '扫描中...');
    try {
      const data = unwrap(await api.nearDuplicatesReview(params));
      const clusters = data.clusters || [];
      setResult('adv-dup-result', `<div class="module-list">
        <div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>近重复簇: ${clusters.length}</strong>
        <span class="module-list-meta">涉及图片: ${data.summary?.duplicate_image_count ?? '-'}</span></div></div>
        ${clusters.slice(0, 30).map((c) => `<div class="module-list-item module-list-item-static"><div class="module-list-main">
          <strong>簇 #${esc(c.cluster_id ?? '-')}（${(c.members || []).length} 张）</strong>
          <span class="module-list-meta">caption 一致性: ${c.caption_consistency ?? '-'}</span></div></div>`).join('')}</div>`);
    } catch (error) { errorBox('adv-dup-result', error); }
  }

  // ---------------------------------------------------------------- P1.4 frequency

  function segFrequency() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-freq-path')}
        <div class="config-group"><label>操作</label><input class="text-input" type="text" id="adv-freq-op" placeholder="prune_rare / promote_frequent"></div>
        <div class="config-group"><label>阈值</label><input class="text-input" type="number" id="adv-freq-threshold" value="3" min="0"></div>
        ${boolCard('adv-freq-backup', '应用前自动备份', true)}
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvFrequencyPreview()">预览</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="runAdvFrequencyApply()">应用（写）</button>
      </div>
      <div id="adv-freq-result" style="margin-top:16px;"></div>`;
  }

  function frequencyParams() {
    return {
      dir: $('#adv-freq-path')?.value?.trim() || '',
      operation: $('#adv-freq-op')?.value?.trim() || '',
      threshold: Number($('#adv-freq-threshold')?.value || 3) || 3,
      create_backup: $('#adv-freq-backup')?.checked ?? true,
    };
  }

  async function runAdvFrequencyPreview() {
    const params = frequencyParams();
    if (!params.dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-freq-result', '预览中...');
    try {
      const data = unwrap(await api.frequencyBatchPreview(params));
      const s = data.summary || {};
      setResult('adv-freq-result', `<div class="module-list">
        <div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>频率批量预览</strong>
        <span class="module-list-meta">将改: ${s.changed_count ?? '-'} / 扫描 ${s.scanned_caption_count ?? '-'}</span></div></div>
        ${samplesList(data.samples)}</div>`);
    } catch (error) { errorBox('adv-freq-result', error); }
  }

  async function runAdvFrequencyApply() {
    const params = frequencyParams();
    if (!params.dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-freq-result', '应用中...');
    try {
      const data = unwrap(await api.frequencyBatchApply(params));
      setResult('adv-freq-result', `<div class="builtin-picker-empty"><span>频率批量已应用，改写 ${data.modified_count ?? 0} 个文件。</span></div>`);
      showToast('频率批量已应用。');
    } catch (error) { errorBox('adv-freq-result', error); }
  }

  // ---------------------------------------------------------------- P1.5 review

  function segReview() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-rev-path')}
        <div class="config-group"><label>路线（可空）</label><input class="text-input" type="text" id="adv-rev-route" placeholder="sdxl / anima / newbie"></div>
      </div>
      <div class="tool-actions"><button class="btn btn-outline btn-sm" type="button" onclick="runAdvReviewQueue()">构建审查队列</button></div>
      <div id="adv-rev-result" style="margin-top:16px;"></div>`;
  }

  async function runAdvReviewQueue() {
    const params = {
      dir: $('#adv-rev-path')?.value?.trim() || '',
      route_family: $('#adv-rev-route')?.value?.trim() || '',
    };
    if (!params.dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-rev-result', '构建中...');
    try {
      const data = unwrap(await api.reviewQueue(params));
      const queues = data.queues || {};
      const keys = Object.keys(queues);
      setResult('adv-rev-result', `<div class="module-list">
        ${keys.length ? keys.map((k) => `<div class="module-list-item module-list-item-static"><div class="module-list-main">
          <strong>${esc(k)}</strong><span class="module-list-meta">${(queues[k] || []).length} 项</span></div></div>`).join('')
          : '<div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>队列为空</strong></div></div>'}</div>`);
    } catch (error) { errorBox('adv-rev-result', error); }
  }

  // ---------------------------------------------------------------- P2.2 policy

  function segPolicy() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-pol-path')}
        <div class="config-group"><label>策略包</label><select id="adv-pol-pack" class="text-input"><option value="">加载中...</option></select></div>
        ${boolCard('adv-pol-backup', '应用前自动备份', true)}
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" type="button" onclick="refreshAdvPolicyPacks()">刷新策略包</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvPolicyPreview()">预览</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="runAdvPolicyApply()">应用（写）</button>
      </div>
      <div id="adv-pol-result" style="margin-top:16px;"></div>`;
  }

  async function refreshPolicyPacks() {
    const select = $('#adv-pol-pack');
    if (!select) return;
    try {
      const data = unwrap(await api.policyPackList({}));
      const packs = data.packs || [];
      select.innerHTML = packs.length
        ? packs.map((p) => `<option value="${esc(p.id)}">${esc(p.name || p.id)}${p.builtin ? '（内置）' : ''}</option>`).join('')
        : '<option value="">（无策略包）</option>';
    } catch (_e) {
      select.innerHTML = '<option value="">加载失败</option>';
    }
  }

  function policyParams() {
    return {
      dir: $('#adv-pol-path')?.value?.trim() || '',
      pack_id: $('#adv-pol-pack')?.value || '',
      create_backup: $('#adv-pol-backup')?.checked ?? true,
    };
  }

  async function runAdvPolicyPreview() {
    const params = policyParams();
    if (!params.dir || !params.pack_id) { showToast('请填写路径并选择策略包。'); return; }
    busy('adv-pol-result', '预览中...');
    try {
      const data = unwrap(await api.policyPackPreview(params));
      const s = data.summary || {};
      setResult('adv-pol-result', `<div class="module-list">
        <div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>策略包预览: ${esc(data.pack_id)}</strong>
        <span class="module-list-meta">将改: ${s.changed_count ?? '-'} / 扫描 ${s.scanned_caption_count ?? '-'}</span></div></div>
        ${samplesList(data.samples)}</div>`);
    } catch (error) { errorBox('adv-pol-result', error); }
  }

  async function runAdvPolicyApply() {
    const params = policyParams();
    if (!params.dir || !params.pack_id) { showToast('请填写路径并选择策略包。'); return; }
    busy('adv-pol-result', '应用中...');
    try {
      const data = unwrap(await api.policyPackApply(params));
      setResult('adv-pol-result', `<div class="builtin-picker-empty"><span>策略包已应用，改写 ${data.modified_count ?? 0} 个文件。备份: ${esc(data.backup_name || '（无）')}</span></div>`);
      showToast('策略包已应用。');
    } catch (error) { errorBox('adv-pol-result', error); }
  }

  // ---------------------------------------------------------------- P2.3 retag

  function segRetag() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-retag-path')}
        <div class="config-group"><label>路线（可空）</label><input class="text-input" type="text" id="adv-retag-route" placeholder="sdxl / anima / newbie"></div>
        <div class="config-group"><label>批量大小</label><input class="text-input" type="number" id="adv-retag-batch" value="10" min="1"></div>
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvRetagBuild()">构建队列</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvRetagNext()">下一批</button>
      </div>
      <div id="adv-retag-result" style="margin-top:16px;"></div>`;
  }

  function retagPath() { return $('#adv-retag-path')?.value?.trim() || ''; }

  async function runAdvRetagBuild() {
    const dir = retagPath();
    if (!dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-retag-result', '构建中...');
    try {
      const data = unwrap(await api.retagQueueBuild({ dir, route_family: $('#adv-retag-route')?.value?.trim() || '' }));
      renderRetagPriority(data);
    } catch (error) { errorBox('adv-retag-result', error); }
  }

  async function runAdvRetagNext() {
    const dir = retagPath();
    if (!dir) { showToast('请先填写数据集路径。'); return; }
    busy('adv-retag-result', '读取中...');
    try {
      const data = unwrap(await api.retagQueueNext({ dir, batch_size: Number($('#adv-retag-batch')?.value || 10) || 10 }));
      const batch = data.batch || [];
      setResult('adv-retag-result', `<div class="module-list">
        <div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>本批 ${batch.length} 项 | 剩余待处理 ${data.remaining_pending ?? 0}</strong></div></div>
        ${batch.map((e) => retagRow(dir, e)).join('')}</div>`);
    } catch (error) { errorBox('adv-retag-result', error); }
  }

  function renderRetagPriority(data) {
    const dir = retagPath();
    const priority = (data.priority || []).slice(0, 50);
    const sum = data.summary || {};
    setResult('adv-retag-result', `<div class="module-list">
      <div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>队列已构建</strong>
      <span class="module-list-meta">标记: ${sum.flagged_count ?? 0} / ${sum.image_count ?? 0} 图</span></div></div>
      ${priority.map((e) => retagRow(dir, e)).join('')}</div>`);
  }

  function retagRow(dir, entry) {
    const path = entry.image_path || '';
    const enc = encodeURIComponent(path);
    return `<div class="module-list-item module-list-item-static"><div class="module-list-main">
      <strong>${esc(path)}</strong>
      <span class="module-list-meta">分数 ${entry.score ?? '-'} | 状态 ${esc(entry.status || 'pending')}</span>
      <span style="display:flex;gap:6px;margin-top:4px;">
        <button class="btn btn-outline btn-sm" type="button" onclick="markAdvRetag('${esc(dir)}','${enc}','done')">完成</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="markAdvRetag('${esc(dir)}','${enc}','skipped')">跳过</button>
      </span></div></div>`;
  }

  async function markAdvRetag(dir, encodedPath, status) {
    try {
      await api.retagQueueMark({ dir, image_path: decodeURIComponent(encodedPath), status });
      showToast(`已标记为 ${status}。`);
    } catch (error) { showToast(error.message || '标记失败。'); }
  }

  // ---------------------------------------------------------------- P2.1 version

  function segVersion() {
    return `
      <div class="section-content tool-fields">
        ${pathPicker('adv-ver-path')}
        <div class="config-group"><label>图片相对/绝对路径</label><input class="text-input" type="text" id="adv-ver-image" placeholder="a.png"></div>
        <div class="config-group"><label>回退到版本号</label><input class="text-input" type="number" id="adv-ver-target" value="1" min="0"></div>
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvVersionHistory()">历史</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="runAdvVersionRevert()">回退（写）</button>
      </div>
      <div id="adv-ver-result" style="margin-top:16px;"></div>`;
  }

  function versionParams() {
    return {
      dir: $('#adv-ver-path')?.value?.trim() || '',
      image_path: $('#adv-ver-image')?.value?.trim() || '',
    };
  }

  async function runAdvVersionHistory() {
    const params = versionParams();
    if (!params.dir || !params.image_path) { showToast('请填写数据集路径与图片路径。'); return; }
    busy('adv-ver-result', '读取中...');
    try {
      const data = unwrap(await api.versionHistory(params));
      const versions = data.versions || [];
      setResult('adv-ver-result', `<div class="module-list">
        <div class="module-list-item module-list-item-static"><div class="module-list-main"><strong>版本数: ${data.version_count ?? versions.length}</strong></div></div>
        ${versions.map((v) => `<div class="module-list-item module-list-item-static"><div class="module-list-main">
          <strong>v${esc(v.v)} · ${esc(v.operation || '')}</strong>
          <span class="module-list-meta">${esc(v.timestamp || '')}</span>
          <span class="module-list-meta" style="color:var(--accent);">${esc((v.new || '').slice(0, 160))}</span></div></div>`).join('')}</div>`);
    } catch (error) { errorBox('adv-ver-result', error); }
  }

  async function runAdvVersionRevert() {
    const params = { ...versionParams(), to_version: Number($('#adv-ver-target')?.value || 1) || 1 };
    if (!params.dir || !params.image_path) { showToast('请填写数据集路径与图片路径。'); return; }
    busy('adv-ver-result', '回退中...');
    try {
      const data = unwrap(await api.versionRevert(params));
      setResult('adv-ver-result', `<div class="builtin-picker-empty"><span>已回退到 v${esc(params.to_version)}：${esc((data.caption || '').slice(0, 200))}</span></div>`);
      showToast('已回退。');
    } catch (error) { errorBox('adv-ver-result', error); }
  }

  // ---------------------------------------------------------------- P3.2 cross

  function segCross() {
    return `
      <div class="section-content tool-fields">
        <div class="config-group" style="grid-column:1/-1;">
          <label>多数据集路径（一行一个，或逗号分隔）</label>
          <textarea class="text-input" id="adv-cross-paths" style="min-height:120px;width:100%;" placeholder="./train/ds_a&#10;./train/ds_b"></textarea>
        </div>
        <div class="config-group"><label>稀有 DF 阈值</label><input class="text-input" type="number" id="adv-cross-rare" value="1" min="1"></div>
        <div class="config-group"><label>别名相似度</label><input class="text-input" type="number" id="adv-cross-alias" value="0.82" min="0" max="1" step="0.01"></div>
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;">
        <button class="btn btn-primary btn-sm" type="button" onclick="runAdvCrossAggregate()">聚合分析</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="runAdvCrossResult()">读取缓存</button>
      </div>
      <div id="adv-cross-result" style="margin-top:16px;"></div>`;
  }

  function crossPaths() {
    return ($('#adv-cross-paths')?.value || '')
      .replace(/\r/g, '\n').split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  }

  function renderCross(data) {
    const freq = (data.global_tag_frequency || []).slice(0, 20);
    const rare = (data.rare_tag_library || []).slice(0, 20);
    const alias = (data.alias_evolution || []).slice(0, 20);
    const pairs = (data.style_similarity?.pairs || []).slice(0, 20);
    setResult('adv-cross-result', `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;">
        <div class="module-list-item module-list-item-static" style="align-items:flex-start;"><div class="module-list-main">
          <strong>全局高频（${data.dataset_count ?? '-'} 集 / 唯一 ${data.global_unique_tags ?? '-'}）</strong>
          ${freq.map((e) => `<span class="module-list-meta">${esc(e.tag)} x ${e.count}</span>`).join('') || '<span class="module-list-meta">—</span>'}</div></div>
        <div class="module-list-item module-list-item-static" style="align-items:flex-start;"><div class="module-list-main">
          <strong>稀有标签库</strong>
          ${rare.map((e) => `<span class="module-list-meta">${esc(e.tag)} · DF ${e.dataset_frequency} · ${e.global_count}</span>`).join('') || '<span class="module-list-meta">—</span>'}</div></div>
        <div class="module-list-item module-list-item-static" style="align-items:flex-start;"><div class="module-list-main">
          <strong>别名演化建议</strong>
          ${alias.map((e) => `<span class="module-list-meta">${esc(e.variant)} → ${esc(e.canonical)}（${esc(e.reason)} ${e.confidence}）</span>`).join('') || '<span class="module-list-meta">—</span>'}</div></div>
        <div class="module-list-item module-list-item-static" style="align-items:flex-start;"><div class="module-list-main">
          <strong>风格指纹相似度</strong>
          ${pairs.map((p) => `<span class="module-list-meta">${esc(p.a.slice(0, 8))}↔${esc(p.b.slice(0, 8))}: ${p.cosine}</span>`).join('') || '<span class="module-list-meta">—</span>'}</div></div>
      </div>`);
  }

  async function runAdvCrossAggregate() {
    const paths = crossPaths();
    if (paths.length < 1) { showToast('请至少填写一个数据集路径。'); return; }
    busy('adv-cross-result', '聚合分析中...');
    try {
      const data = unwrap(await api.crossDatasetAggregate({
        dataset_paths: paths,
        rare_df_threshold: Number($('#adv-cross-rare')?.value || 1) || 1,
        alias_min_similarity: Number($('#adv-cross-alias')?.value || 0.82) || 0.82,
      }));
      renderCross(data);
      showToast('跨数据集聚合完成。');
    } catch (error) { errorBox('adv-cross-result', error); }
  }

  async function runAdvCrossResult() {
    const paths = crossPaths();
    if (paths.length < 1) { showToast('请至少填写一个数据集路径。'); return; }
    busy('adv-cross-result', '读取缓存中...');
    try {
      const data = unwrap(await api.crossDatasetResult({ dataset_paths: paths }));
      if (data.status === 'missing') { setResult('adv-cross-result', '<div class="builtin-picker-empty"><span>无缓存，请先聚合分析。</span></div>'); return; }
      renderCross(data);
    } catch (error) { errorBox('adv-cross-result', error); }
  }

  return {
    renderAdvancedTagTools,
    // window actions
    switchAdvancedTagSegment,
    runAdvPipelinePlan,
    runAdvPipelineRun,
    runAdvEnsemblePreview,
    runAdvEnsembleApply,
    runAdvStructurePreview,
    runAdvStructureApply,
    runAdvDedupe,
    runAdvFrequencyPreview,
    runAdvFrequencyApply,
    runAdvReviewQueue,
    refreshAdvPolicyPacks: refreshPolicyPacks,
    runAdvPolicyPreview,
    runAdvPolicyApply,
    runAdvRetagBuild,
    runAdvRetagNext,
    markAdvRetag,
    runAdvVersionHistory,
    runAdvVersionRevert,
    runAdvCrossAggregate,
    runAdvCrossResult,
  };
}
