// renderers/toolsTemplates.js - pure HTML builders for the toolbox page

export function createToolTemplates({ escapeHtml, prunerGroups }) {
  function renderToolCard(tool, active) {
    return `
      <button class="toolbox-card${active ? ' active' : ''}" type="button" data-tool-id="${escapeHtml(tool.id)}">
        <span class="toolbox-card-icon">${escapeHtml(tool.icon || '•')}</span>
        <span class="toolbox-card-body"><strong>${escapeHtml(tool.title)}</strong><em>${escapeHtml(tool.desc)}</em></span>
      </button>
    `;
  }

  function renderToolChip(tool) {
    return `<button class="toolbox-chip" type="button" data-tool-id="${escapeHtml(tool.id)}">${escapeHtml(tool.title)}</button>`;
  }

  function renderToolWelcome(coreTools) {
    return `
      <section class="toolbox-welcome">
        <div class="toolbox-welcome-icon">🔬</div>
        <h3>选择一个工具开始</h3>
        <p>推荐先从 LoRA Analyzer 或 Block XRay 开始，确认层强度和异常后再做剪枝、SVD 合并或诊断卡。</p>
        <div class="toolbox-quick-row">
          ${coreTools.slice(0, 3).map((tool) => renderToolChip(tool)).join('')}
        </div>
      </section>
    `;
  }

  function renderToolDetail(tool) {
    const isPathField = (field) => /model|path|save_to|file|src_|dst_/.test(field.key);
    const pickerTypeForField = (field) => {
      const key = field.key || '';
      if (/output_dir/i.test(key)) return 'output-folder';
      if (/output_path|save_to|dst_path/i.test(key)) return 'output-model-file';
      if (/model_path|base_model|finetuned_model|checkpoint_path|src_path|path|file/i.test(key)) return 'model-file';
      return 'model-file';
    };

    return `
      <section class="form-section tool-section toolbox-detail-card" id="tool-${tool.id}">
        <header class="section-header toolbox-detail-head">
          <div class="toolbox-detail-title"><span>${escapeHtml(tool.icon || '•')}</span><h3>${escapeHtml(tool.title)}</h3></div>
          ${tool.group ? `<small>${escapeHtml(tool.group)}</small>` : ''}
        </header>
        <div class="section-summary">${escapeHtml(tool.desc)}</div>
        ${tool.id === 'core_lora_prune' ? renderPrunerAssist(tool) : ''}
        <div class="section-content tool-fields">
          ${tool.fields.map((field) => {
            const inputId = `tool-${tool.id}-${field.key}`;
            if (isPathField(field)) {
              return `
            <div class="config-group">
              <label>${escapeHtml(field.label)}</label>
              <div class="input-picker">
                <button class="picker-icon" type="button" onclick="pickPathForInput('${inputId}', '${pickerTypeForField(field)}')">
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
            onclick="runTool('${tool.id}', '${escapeHtml(tool.endpoint || tool.script)}', ${JSON.stringify(tool.fields.map((field) => field.key)).replaceAll('"', '&quot;')})">运行</button>
          <span id="tool-status-${tool.id}" style="font-size:0.82rem;"></span>
        </div>
        <div id="tool-result-${tool.id}" style="display:none;margin-top:12px;padding:12px;border-radius:8px;font-size:0.82rem;white-space:pre-wrap;font-family:monospace;max-height:300px;overflow:auto;"></div>
      </section>
    `;
  }

  function renderPrunerAssist(tool) {
    return `
      <section class="toolbox-subpanel">
        <div class="toolbox-subpanel-head">
          <strong>Block Presets</strong>
          <span>先选预置，再按需微调 keep / drop。</span>
        </div>
        <div class="toolbox-preset-row">
          ${(tool.presets || []).map((preset) => `<button class="toolbox-preset-btn" type="button" data-pruner-preset="${escapeHtml(preset.name)}" data-keep="${escapeHtml(preset.keep || '')}" data-drop="${escapeHtml(preset.drop || '')}">${escapeHtml(preset.name)}</button>`).join('')}
        </div>
        <div class="toolbox-block-actions">
          <button class="toolbox-mini-btn" type="button" data-pruner-select="all">全选到 keep</button>
          <button class="toolbox-mini-btn" type="button" data-pruner-select="style">风格块</button>
          <button class="toolbox-mini-btn" type="button" data-pruner-select="character">角色块</button>
          <button class="toolbox-mini-btn" type="button" data-pruner-select="clear">清空</button>
        </div>
        <div class="toolbox-block-actions">
          <button class="toolbox-mini-btn" type="button" data-pruner-source="analyzer">载入 Analyzer 建议</button>
          <button class="toolbox-mini-btn" type="button" data-pruner-source="xray">载入 Block XRay 热区</button>
          <span class="toolbox-inline-hint" id="tool-${tool.id}-pruner-hint"></span>
        </div>
        ${prunerGroups.map((group) => `
          <div class="toolbox-block-group">
            <span>${escapeHtml(group.label)}</span>
            <div class="toolbox-block-grid">
              ${group.blocks.map((block) => `<button class="toolbox-block-chip" type="button" data-pruner-block="${block}">${block}</button>`).join('')}
            </div>
          </div>
        `).join('')}
      </section>
    `;
  }

  return { renderToolCard, renderToolChip, renderToolWelcome, renderToolDetail, renderPrunerAssist };
}
