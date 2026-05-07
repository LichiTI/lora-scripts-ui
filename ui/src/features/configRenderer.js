import { escapeHtml, icon as _ico } from '../utils/dom.js';

export function createConfigRenderer({
  state,
  trainingTypes,
  getSectionsForTab,
  isFieldVisible,
  canUseBuiltinPicker,
  renderSlot,
  renderNavigator,
  syncTopbarState,
  syncFooterAction,
  updateJSONPreview,
}) {
  function renderConfig(container) {
    const tt = state.activeTrainingType;
    const typeLabel = trainingTypes.find((t) => t.id === tt)?.label || tt;
    const sections = getSectionsForTab(state.activeTab, tt);
    const visibleSections = sections.filter((section) =>
      section.fields.some((field) => field.type !== 'hidden' && isFieldVisible(field, state.config))
    );

    container.innerHTML = `
      <div class="form-container">
        <header class="section-title">
          <h2>${typeLabel} LoRA 模式</h2>
          <p></p>
        </header>
        <div class="status-deck" id="status-deck">${renderStatusDeck()}</div>
        ${renderPreflightReport()}
        ${renderSlot('training.preflight_panel')}
        ${renderSlot('config.after_status_deck')}
        <div class="section-toolbar">
          <div class="toolbar-actions toolbar-check-actions">
            <button class="btn btn-outline btn-check" type="button" onclick="runPreflight()" style="width:100%;">
              <span class="btn-check-label">训练预检</span>
              <span class="btn-check-desc">检测运行环境 + 检查数据集路径、底模路径等参数</span>
            </button>
          </div>
        </div>
        ${visibleSections.map(renderSection).join('')}
      </div>
    `;

    renderNavigator();
    syncTopbarState();
    syncFooterAction();
    updateJSONPreview();
  }

  function renderSection(section) {
    const fields = section.fields.filter((field) => field.type !== 'hidden' && isFieldVisible(field, state.config));
    const realFieldCount = fields.filter((field) => field.type !== 'ui_group').length;

    return `
      <section class="form-section" id="${escapeHtml(section.id)}">
        <header class="section-header">
          <h3>${escapeHtml(section.title)}</h3>
          <span class="section-meta">${realFieldCount} 项参数</span>
        </header>
        <div class="section-summary">${escapeHtml(section.description)}</div>
        <div class="section-content">
          ${fields.map((field) => renderField(field)).join('')}
        </div>
      </section>
    `;
  }

  function renderField(field) {
    const value = state.config[field.key];
    const label = field.label;
    const defaultValue = field.defaultValue ?? '';
    if (field.type === 'ui_group') {
      return `
        <div class="config-group group-heading" data-field-key="${field.key}">
          <div class="group-heading-title">${escapeHtml(label || '')}</div>
          ${field.desc ? `<p class="group-heading-desc">${escapeHtml(field.desc)}</p>` : ''}
        </div>
      `;
    }
    const isPicker = field.type === 'file' || field.type === 'folder';
    const isModified = String(value ?? '') !== String(defaultValue);
    const showBuiltinPicker = canUseBuiltinPicker(field);
    const canUndo = Object.hasOwn(state.fieldUndo, field.key);
    const canReset = String(value ?? '') !== String(defaultValue ?? '');
    const pickerMode = field.pickerType || field.type;
    const builtinPickerIcon = (pickerMode === 'folder' || pickerMode === 'output-folder') ? '#icon-folder' : '#icon-file';
    const renderHeader = () => `
      <div class="field-header-row">
        <label>${escapeHtml(label)}</label>
        <div class="field-inline-actions" data-field-key="${field.key}">
          <button class="field-menu-toggle" type="button" title="参数更多操作" data-field-menu-key="${field.key}">···</button>
          ${showBuiltinPicker ? `<button class="picker-mode-icon-btn" type="button" title="内置文件选择器" onclick="openNativePicker('${field.key}', '${pickerMode}')"><svg class="icon"><use href="${builtinPickerIcon}"></use></svg></button>` : ''}
        </div>
      </div>
    `;

    const modCls = isModified ? ' field-modified' : '';
    if (field.type === 'boolean') {
      return `
        <div class="config-group row boolean-card${modCls}" data-field-key="${field.key}">
          <div class="label-col">
            ${renderHeader()}
            <p class="field-desc">${escapeHtml(field.desc || '')}</p>
          </div>
          <label class="switch switch-compact">
            <input type="checkbox" ${value ? 'checked' : ''} onchange="updateConfigValue('${field.key}', this.checked)">
            <span class="slider round"></span>
          </label>
        </div>
      `;
    }

    if (field.type === 'select') {
      let filteredOptions = field.options;
      const ensureCurrentOption = (options) => {
        const current = value === undefined || value === null ? '' : String(value);
        if (!current || options.includes(current)) {
          return options;
        }
        return [current, ...options];
      };
      if (field.key === 'optimizer_type') {
        const vis = JSON.parse(localStorage.getItem('sd-rescripts:visible-optimizers') || '[]');
        if (vis.length > 0) filteredOptions = field.options.filter((o) => vis.includes(o));
      }
      if (field.key === 'lr_scheduler') {
        const vis = JSON.parse(localStorage.getItem('sd-rescripts:visible-schedulers') || '[]');
        if (vis.length > 0) filteredOptions = field.options.filter((o) => vis.includes(o));
      }
      filteredOptions = ensureCurrentOption(filteredOptions);
      return `
        <div class="config-group${modCls}" data-field-key="${field.key}">
          ${renderHeader()}
          <p class="field-desc">${escapeHtml(field.desc || '')}</p>
          <select onchange="updateConfigValue('${field.key}', this.value)">
            ${filteredOptions.map((option) => `<option value="${escapeHtml(option)}" ${String(value) === String(option) ? 'selected' : ''}>${escapeHtml(option || '默认')}</option>`).join('')}
          </select>
        </div>
      `;
    }

    if (field.type === 'textarea') {
      return `
        <div class="config-group${modCls}" data-field-key="${field.key}">
          ${renderHeader()}
          <p class="field-desc">${escapeHtml(field.desc || '')}</p>
          <textarea class="text-area" oninput="updateConfigValue('${field.key}', this.value)">${escapeHtml(value || '')}</textarea>
        </div>
      `;
    }

    const inputType = field.type === 'number' || field.type === 'slider' ? 'number' : 'text';
    const inputValue = value === undefined || value === null ? '' : value;

    if (isPicker) {
      return `
        <div class="config-group${modCls}" data-field-key="${field.key}">
          ${renderHeader()}
          <p class="field-desc">${escapeHtml(field.desc || '')}</p>
          <div class="input-picker">
            <button class="picker-icon" type="button" onclick="pickPath('${field.key}', '${field.pickerType || 'folder'}')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <input type="text" value="${escapeHtml(inputValue)}" oninput="updateConfigValue('${field.key}', this.value)">
          </div>
        </div>
      `;
    }



    return `
      <div class="config-group${modCls}" data-field-key="${field.key}">
        ${renderHeader()}
        <p class="field-desc">${escapeHtml(field.desc || '')}</p>
        <input class="text-input" type="${inputType}" value="${escapeHtml(inputValue)}" ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''} ${field.step !== undefined ? `step="${field.step}"` : ''} oninput="updateConfigValue('${field.key}', this.value)">
      </div>
    `;
  }

  function renderGpuInfo() {
    if (state.runtimeError) return state.runtimeError;
    if (!state.runtime?.cards?.length) return '等待检测显卡信息';
    return state.runtime.cards.map((card) => {
      if (typeof card === 'string') return card;
      return card.name || JSON.stringify(card);
    }).join('，');
  }

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

  function renderPreflightReport() {
    const pf = state.preflight;
    if (!pf) return '';

    const errors = pf.errors || [];
    const warnings = pf.warnings || [];
    const notes = pf.notes || [];
    const ds = pf.dataset;
    const deps = pf.dependencies;

    if (errors.length === 0 && warnings.length === 0 && notes.length === 0 && !ds) {
      return '';
    }

    const canStart = pf.can_start;
    const borderColor = canStart ? (warnings.length > 0 ? '#f59e0b' : '#22c55e') : '#ef4444';
    const statusIcon = canStart ? (warnings.length > 0 ? _ico('alert-tri') : _ico('check-circle')) : _ico('x-circle');
    const statusText = canStart ? (warnings.length > 0 ? '预检通过（有警告）' : '预检通过') : '预检未通过';
    const statusColor = canStart ? (warnings.length > 0 ? '#f59e0b' : '#22c55e') : '#ef4444';

    let html = '<section class="form-section" id="preflight-report" style="border-left:3px solid ' + borderColor + ';">';
    html += '<header class="section-header" style="display:flex;justify-content:space-between;align-items:center;">';
    html += '<h3>' + statusIcon + ' 训练预检报告</h3>';
    html += '<button type="button" onclick="dismissPreflightReport()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.1rem;padding:2px 6px;" title="关闭">×</button>';
    html += '</header>';
    html += '<div class="section-content" style="display:block;">';

    // 状态概览
    html += '<div style="font-weight:700;color:' + statusColor + ';margin-bottom:12px;">' + statusText + '</div>';

    
    if (errors.length > 0) {
      html += '<div class="preflight-group">';
      html += '<div class="preflight-group-title" style="color:#ef4444;">' + _ico('x-circle', 14) + ' 错误 (' + errors.length + ')</div>';
      errors.forEach(function(e) {
        html += '<div class="preflight-item preflight-error">' + escapeHtml(e) + '</div>';
      });
      html += '</div>';
    }

    // 警告列表
    if (warnings.length > 0) {
      html += '<div class="preflight-group">';
      html += '<div class="preflight-group-title" style="color:#f59e0b;">' + _ico('alert-tri', 14) + ' 警告 (' + warnings.length + ')</div>';
      warnings.forEach(function(w) {
        html += '<div class="preflight-item preflight-warning">' +escapeHtml(w) + '</div>';
      });
      html += '</div>';
    }

    // 数据集摘要
    if (ds) {
      html += '<div class="preflight-group">';
      html += '<div class="preflight-group-title">' + _ico('folder', 14) + ' 数据集</div>';
      html += '<div class="preflight-dataset-grid">';
      html += _pfTag('图片数', ds.image_count || 0);
      html += _pfTag('有效图片', ds.effective_image_count || 0);
      html += _pfTag('标注覆盖', ((ds.caption_coverage || 0) * 100).toFixed(0) + '%');
      if (ds.alpha_capable_image_count > 0) html += _pfTag('含透明通道', ds.alpha_capable_image_count);
      if (ds.broken_image_count > 0) html += _pfTag('损坏图片', ds.broken_image_count, 'err');
      if (ds.images_without_caption_count > 0) html += _pfTag('缺少标注', ds.images_without_caption_count, 'warn');
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
          html += '<div class="preflight-item preflight-error">' + escapeHtml(d.display_name) + ' — ' + escapeHtml(d.reason || '缺失') + '</div>';
        });
        required.filter(function(d) { return d.importable; }).forEach(function(d) {
          html += '<div class="preflight-item preflight-ok">' + escapeHtml(d.display_name) + ' ' + escapeHtml(d.version || '') + ' ✓</div>';
        });
        html += '</div>';
      }
    }

    // 提示信息（可折叠）
    if (notes.length > 0) {
      html += '<details class="preflight-group" style="margin-top:8px;">';
      html += '<summary class="preflight-group-title" style="cursor:pointer;">' + _ico('check-circle', 14) + ' 提示 (' + notes.length + ')</summary>';
      notes.forEach(function(n) {
        html += '<div class="preflight-item preflight-note">' + escapeHtml(n) + '</div>';
      });
      html += '</details>';
    }

    html += '</div></section>';
    return html;
  }

  function _pfTag(label, value, type) {
    var color = type === 'err' ? '#ef4444' : (type === 'warn' ? '#f59e0b' : 'var(--text-main)');
    return '<div class="preflight-tag"><span class="preflight-tag-label">' + label + '</span><span class="preflight-tag-value" style="color:' + color + ';">' + value + '</span></div>';
  }

  function dismissPreflightReport() {
    state.preflight = null;
    var el = document.getElementById('preflight-report');
    if (el) el.remove();
  };


  function renderStatusDeck() {
    const runtimeLabel = state.runtimeError
      ? '离线'
      : state.loading.runtime
        ? '检测中...'
      : state.runtime?.cards?.length
        ? `${state.runtime.cards.length} 张显卡`
        : '检测中';

    // === 注意力后端检测 ===
    const xf = state.runtime?.xformers;
    const rt = state.runtime?.runtime;
    const sagePkg = rt?.packages?.sageattention;
    const flashPkg = rt?.packages?.flash_attn;
    const xfInstalled = xf?.installed;
    const xfSupported = xf?.supported;
    const sageInstalled = sagePkg?.importable;
    const flashInstalled = flashPkg?.importable;

    let attnLabel = '检测中';
    let attnDetail = '暂无状态信息';
    if (xf || sagePkg || flashPkg) {
      const parts = [];
      if (xfInstalled) {
        parts.push(`xFormers ${xf.version || ''} ${xfSupported ? '✓' : '(不支持)'}`);
      } else {
        parts.push('xFormers 未安装');
      }
      if (sageInstalled) {
        parts.push(`SageAttention ${sagePkg.version || ''} ✓`);
      } else {
        parts.push('SageAttention 未安装');
      }
      if (flashInstalled) {
        parts.push(`FlashAttention ${flashPkg.version || ''} ✓`);
      } else {
        parts.push('FlashAttention 未安装');
      }
      attnLabel = (xfSupported || sageInstalled || flashInstalled) ? '可用' : '受限';
      attnDetail = parts.join(' · ');
      if (xf?.reason) attnDetail += ` — ${xf.reason}`;
    }

    const preflightLabel = state.preflight
      ? state.preflight.can_start
        ? '可以启动'
        : `${state.preflight.errors.length} 个错误`
      : '未检查';
    const taskCount = state.tasks.filter((task) => task.status === 'RUNNING').length;

    return `
      <div class="status-card">
        <span class="status-label">运行环境</span>
        <strong class="status-value">${escapeHtml(runtimeLabel)}</strong>
        <span class="status-sub">${escapeHtml(renderGpuInfo())}</span>
      </div>
      <div class="status-card">
        <span class="status-label">注意力后端</span>
        <strong class="status-value">${escapeHtml(attnLabel)}</strong>
        <span class="status-sub">${escapeHtml(attnDetail)}</span>
      </div>
      <div class="status-card">
        <span class="status-label">训练预检</span>
        <strong class="status-value">${escapeHtml(preflightLabel)}</strong>
        <span class="status-sub">${escapeHtml(renderPreflightDetail())}</span>
      </div>
      <div class="status-card" id="task-status-card">
        <span class="status-label">任务</span>
        <strong class="status-value">${taskCount}</strong>
        <span class="status-sub">${taskCount > 0 ? `有 ${taskCount} 个任务运行中` : '空闲'}</span>
      </div>
    `;
  }

  function bindGlobals(targetWindow) {
    targetWindow.dismissPreflightReport = dismissPreflightReport;
  }

  return {
    renderConfig,
    renderStatusDeck,
    renderPreflightReport,
    renderField,
    dismissPreflightReport,
    bindGlobals,
  };
}
