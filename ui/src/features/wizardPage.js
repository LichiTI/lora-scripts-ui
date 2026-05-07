import { escapeHtml } from '../utils/dom.js';

export function createWizardPageController({ state, renderView, updateConfigValue, executeTraining }) {
  function wizardRender() {
    renderView('wizard');
  }

  function renderWizard(container) {
    var c = state.config;
    // 参数预览
    var previewRows = [
      ['pretrained_model_name_or_path', 'SDXL 底模', c.pretrained_model_name_or_path],
      ['train_data_dir', '训练数据集', c.train_data_dir],
      ['output_name', '保存名称', c.output_name],
      ['network_module', '网络模块', c.network_module],
      ['network_dim', 'Rank', c.network_dim],
      ['network_alpha', 'Alpha', c.network_alpha],
      ['lycoris_algo', 'LyCORIS 算法', c.network_module === 'lycoris.kohya' ? c.lycoris_algo : ''],
      ['unet_lr', 'U-Net 学习率', c.unet_lr],
      ['optimizer_type', '优化器', c.optimizer_type],
      ['lr_scheduler', '调度器', c.lr_scheduler],
      ['max_train_epochs', '训练轮数', c.max_train_epochs],
      ['train_batch_size', '批量大小', c.train_batch_size],
      ['gradient_accumulation_steps', '梯度累加', c.gradient_accumulation_steps],
      ['enable_preview', '预览图', c.enable_preview ? '开启' : '关闭'],
      ['mixed_precision', '混合精度', c.mixed_precision],
    ];
    var previewHtml = '<table class="wizard-preview-table">';
    for (var i = 0; i < previewRows.length; i++) {
      var key = previewRows[i][0], label = previewRows[i][1], val = previewRows[i][2];
      if (val === '' || val === undefined || val === null) continue;
      var display = escapeHtml(String(val));
      previewHtml += '<tr class="wizard-preview-row" title="' + escapeHtml(key) + '">'
        + '<td class="wizard-preview-key">' + escapeHtml(label) + '</td>'
        + '<td class="wizard-preview-val">' + display + '</td>'
        + '</tr>';
    }
    previewHtml += '</table>';

    // 网络模块选项
    var netModOptions = ['networks.lora', 'lycoris.kohya', 'networks.dylora', 'networks.oft'];
    var netModSelect = netModOptions.map(function(m) {
      return '<option value="' + m + '"' + (c.network_module === m ? ' selected' : '') + '>' + escapeHtml(m) + '</option>';
    }).join('');

    // LyCORIS 算法选项
    var lycoAlgos = ['locon', 'loha', 'lokr', 'ia3', 'dylora', 'glora', 'diag-oft', 'boft'];
    var lycoSelect = lycoAlgos.map(function(a) {
      return '<option value="' + a + '"' + (c.lycoris_algo === a ? ' selected' : '') + '>' + a + '</option>';
    }).join('');
    var lycoVisible = c.network_module === 'lycoris.kohya' ? '' : 'display:none;';
    var lokrVisible = (c.network_module === 'lycoris.kohya' && c.lycoris_algo === 'lokr') ? '' : 'display:none;';

    // 优化器选项
    var optimizers = ['AdamW8bit', 'Prodigy', 'AdamW', 'Lion8bit', 'Lion', 'SGDNesterov8bit', 'DAdaptation', 'Adafactor'];
    var optSelect = optimizers.map(function(o) {
      return '<option value="' + o + '"' + (c.optimizer_type === o ? ' selected' : '') + '>' + o + '</option>';
    }).join('');

    // 学习率调度器选项
    var schedulers = ['cosine', 'cosine_with_restarts', 'polynomial', 'constant', 'constant_with_warmup', 'linear', 'adafactor'];
    var schSelect = schedulers.map(function(s) {
      return '<option value="' + s + '"' + (c.lr_scheduler === s ? ' selected' : '') + '>' + s + '</option>';
    }).join('');

    // 预览图开关
    var previewOn = !!c.enable_preview;
    var previewDisplay = previewOn ? '' : 'display:none;';

    // 速度优化开关生成器
    var boolSwitch = function(k, lbl, checked) {
      return '<label style="display:flex;align-items:center;gap:8px;margin:4px 0;cursor:pointer;">'
        + '<input type="checkbox"' + (checked ? ' checked' : '') + ' onchange="wizardSet(\'' + k + '\', this.checked)" />'
        + escapeHtml(lbl) + '</label>';
    };

    container.innerHTML = `
      <div class="form-container">
        <header class="section-title">
          <h2 style="font-size:1.5rem;">🚀 快速训练流程</h2>
          <p style="color:var(--text-muted);margin-top:4px;">目前仅供 SDXL LoRA 训练，记得先处理训练集</p>
        </header>

        <div class="wizard-layout">
          <div class="wizard-body">

            <!-- 1. 底模路径 -->
            <div class="wizard-field-group">
              <label class="wizard-field-label">① SDXL 底模路径</label>
              <div class="input-picker">
                <button class="picker-icon" type="button" onclick="pickPathForInput('wz-model', 'file')">
                  <svg class="icon"><use href="#icon-folder"></use></svg>
                </button>
                <button class="picker-mode-icon-btn" type="button" title="内置文件选择器" onclick="openBuiltinPickerForInput('wz-model', 'file')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
                <input class="text-input" type="text" id="wz-model"
                  value="${escapeHtml(c.pretrained_model_name_or_path || '')}"
                  placeholder="选择 .safetensors 底模文件"
                  oninput="wizardSet('pretrained_model_name_or_path', this.value)" />
              </div>
            </div>

            <!-- 2. 训练数据集路径 -->
            <div class="wizard-field-group">
              <label class="wizard-field-label">② 训练数据集路径</label>
              <div class="input-picker">
                <button class="picker-icon" type="button" onclick="pickPathForInput('wz-data', 'folder')">
                  <svg class="icon"><use href="#icon-folder"></use></svg>
                </button>
                <button class="picker-mode-icon-btn" type="button" title="内置文件选择器" onclick="openBuiltinPickerForInput('wz-data', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
                <input class="text-input" type="text" id="wz-data"
                  value="${escapeHtml(c.train_data_dir || '')}"
                  placeholder="包含子文件夹的 train 目录"
                  oninput="wizardSet('train_data_dir', this.value)" />
              </div>
            </div>

            <!-- 3. 保存名称 -->
            <div class="wizard-field-group">
              <label class="wizard-field-label">③ 保存名称</label>
              <input class="text-input" type="text" id="wz-name"
                value="${escapeHtml(c.output_name || '')}"
                placeholder="例如: my_lora"
                oninput="wizardSet('output_name', this.value); wizardSet('logging_dir', this.value ? './logs/' + this.value : '')" />
              <div class="wizard-field-hint">同时作为模型保存名称和日志目录名称</div>
            </div>

            <!-- 4. 网络选择 -->
            <div class="wizard-field-group">
              <label class="wizard-field-label">④ 网络设置</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;">
                <div>
                  <label style="font-size:0.82rem;color:var(--text-muted);">网络模块</label>
                  <select class="field-select" onchange="wizardSet('network_module', this.value); wizardRender()">${netModSelect}</select>
                </div>
                <div style="${lycoVisible}">
                  <label style="font-size:0.82rem;color:var(--text-muted);">LyCORIS 算法</label>
                  <select class="field-select" onchange="wizardSet('lycoris_algo', this.value); wizardRender()">${lycoSelect}</select>
                </div>
                <div>
                  <label style="font-size:0.82rem;color:var(--text-muted);">网络维度 (Rank)</label>
                  <input class="text-input" type="number" value="${c.network_dim || 32}" min="1" max="512" oninput="wizardSet('network_dim', this.value)" />
                </div>
                <div>
                  <label style="font-size:0.82rem;color:var(--text-muted);">网络 Alpha</label>
                  <input class="text-input" type="number" value="${c.network_alpha || 32}" min="1" max="512" oninput="wizardSet('network_alpha', this.value)" />
                </div>
                <div>
                  <label style="font-size:0.82rem;color:var(--text-muted);">网络 Dropout</label>
                  <input class="text-input" type="number" value="${c.network_dropout || 0}" min="0" max="1" step="0.01" oninput="wizardSet('network_dropout', this.value)" />
                </div>
                <div style="${lycoVisible}">
                  <label style="font-size:0.82rem;color:var(--text-muted);">卷积维度</label>
                  <input class="text-input" type="number" value="${c.conv_dim || 4}" min="1" oninput="wizardSet('conv_dim', this.value)" />
                </div>
                <div style="${lycoVisible}">
                  <label style="font-size:0.82rem;color:var(--text-muted);">卷积 Alpha</label>
                  <input class="text-input" type="number" value="${c.conv_alpha || 1}" min="1" oninput="wizardSet('conv_alpha', this.value)" />
                </div>
                <div style="${lycoVisible}">
                  <label style="font-size:0.82rem;color:var(--text-muted);">LyCORIS Dropout</label>
                  <input class="text-input" type="number" value="${c.dropout || 0}" min="0" max="1" step="0.01" oninput="wizardSet('dropout', this.value)" />
                </div>
                <div style="${lokrVisible}">
                  <label style="font-size:0.82rem;color:var(--text-muted);">LoKr 系数</label>
                  <input class="text-input" type="number" value="${c.lokr_factor === undefined ? -1 : c.lokr_factor}" min="-1" oninput="wizardSet('lokr_factor', this.value)" />
                </div>
              </div>
            </div>

            <!-- 5. 优化器 -->
            <div class="wizard-field-group">
              <label class="wizard-field-label">⑤ 优化器设置</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;">
                <div>
                  <label style="font-size:0.82rem;color:var(--text-muted);">U-Net 学习率</label>
                  <input class="text-input" type="text" value="${c.unet_lr || '1e-4'}" oninput="wizardSet('unet_lr', this.value)" />
                </div>
                <div>
                  <label style="font-size:0.82rem;color:var(--text-muted);">调度器</label>
                  <select class="field-select" onchange="wizardSet('lr_scheduler', this.value)">${schSelect}</select>
                </div>
                <div>
                  <label style="font-size:0.82rem;color:var(--text-muted);">优化器</label>
                  <select class="field-select" onchange="wizardSet('optimizer_type', this.value)">${optSelect}</select>
                </div>
              </div>
            </div>

            <!-- 6. 训练参数 -->
            <div class="wizard-field-group">
              <label class="wizard-field-label">⑥ 训练参数</label>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px 12px;">
                <div>
                  <label style="font-size:0.82rem;color:var(--text-muted);">最大训练轮数</label>
                  <input class="text-input" type="number" value="${c.max_train_epochs || 10}" min="1" oninput="wizardSet('max_train_epochs', this.value)" />
                </div>
                <div>
                  <label style="font-size:0.82rem;color:var(--text-muted);">批量大小</label>
                  <input class="text-input" type="number" value="${c.train_batch_size || 1}" min="1" max="32" oninput="wizardSet('train_batch_size', this.value)" />
                </div>
                <div>
                  <label style="font-size:0.82rem;color:var(--text-muted);">梯度累加步数</label>
                  <input class="text-input" type="number" value="${c.gradient_accumulation_steps || 1}" min="1" oninput="wizardSet('gradient_accumulation_steps', this.value)" />
                </div>
              </div>
            </div>

            <!-- 7. 预览图 -->
            <div class="wizard-field-group">
              <label class="wizard-field-label" style="display:flex;align-items:center;gap:10px;">
                ⑦ 预览图
                <label class="switch switch-compact" style="margin:0;"><input type="checkbox" ${previewOn ? 'checked' : ''} onchange="wizardSet('enable_preview', this.checked); wizardRender()" /><span class="slider round"></span></label>
              </label>
              <div id="wz-preview-fields" style="${previewDisplay}display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin-top:8px;">
                <div>
                  <label style="font-size:0.82rem;color:var(--text-muted);">每 N 轮生成预览</label>
                  <input class="text-input" type="number" value="${c.sample_every_n_epochs || ''}" min="1" placeholder="留空=每轮" oninput="wizardSet('sample_every_n_epochs', this.value)" />
                </div>
                <div style="grid-column:1/-1;">
                  <label style="font-size:0.82rem;color:var(--text-muted);">正向提示词</label>
                  <textarea class="field-input" rows="2" oninput="wizardSet('positive_prompts', this.value)" style="width:100%;">${escapeHtml(c.positive_prompts || 'masterpiece, best quality, 1girl, solo')}</textarea>
                </div>
                <div style="grid-column:1/-1;">
                  <label style="font-size:0.82rem;color:var(--text-muted);">反向提示词</label>
                  <textarea class="field-input" rows="2" oninput="wizardSet('negative_prompts', this.value)" style="width:100%;">${escapeHtml(c.negative_prompts || 'lowres, bad anatomy, bad hands, text, error')}</textarea>
                </div>
              </div>
            </div>

            <!-- 8. 速度优化 -->
            <div class="wizard-field-group">
              <label class="wizard-field-label">⑧ 速度优化</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;">
                ${boolSwitch('cache_text_encoder_outputs', '缓存文本编码器输出', !!c.cache_text_encoder_outputs)}
                ${boolSwitch('xformers', '启用 xformers', c.xformers !== false)}
                ${boolSwitch('sdpa', '启用 SDPA', c.sdpa !== false)}
                ${boolSwitch('sageattn', '启用 SageAttention', !!c.sageattn)}
                ${boolSwitch('flashattn', '启用 FlashAttention 2', !!c.flashattn)}
                ${boolSwitch('cross_attn_fused_kv', '启用 Fused K/V', !!c.cross_attn_fused_kv)}
              </div>
            </div>

            <!-- 开始训练 -->
            <div style="text-align:center;margin-top:28px;padding-top:20px;border-top:1px solid var(--border);">
              <button class="btn btn-primary" type="button" onclick="wizardStartTraining()" style="padding:12px 48px;font-size:1.05rem;">
                🚀 开始训练
              </button>
              <div style="font-size:0.8rem;color:var(--text-muted);margin-top:8px;">点击后将自动跳转到训练模块</div>
            </div>

          </div>

          <!-- 右侧参数预览 -->
          <aside class="wizard-preview">
            <div class="wizard-preview-title">📋 当前参数预览</div>
            <div class="wizard-preview-content" id="wz-preview">${previewHtml}</div>
          </aside>
        </div>
      </div>
    `;

    // 自动设置隐藏默认值
    _wizardApplyDefaults();
  }

  /* wizard: 设置参数并刷新预览 */
  function wizardSet(key, value) {
    updateConfigValue(key, value);
    // 刷新右侧预览
    var previewEl = document.getElementById('wz-preview');
    if (previewEl) {
      var c = state.config;
      var rows = [
        ['pretrained_model_name_or_path', 'SDXL 底模', c.pretrained_model_name_or_path],
        ['train_data_dir', '训练数据集', c.train_data_dir],
        ['output_name', '保存名称', c.output_name],
        ['network_module', '网络模块', c.network_module],
        ['network_dim', 'Rank', c.network_dim],
        ['network_alpha', 'Alpha', c.network_alpha],
        ['lycoris_algo', 'LyCORIS 算法', c.network_module === 'lycoris.kohya' ? c.lycoris_algo : ''],
        ['unet_lr', 'U-Net 学习率', c.unet_lr],
        ['optimizer_type', '优化器', c.optimizer_type],
        ['lr_scheduler', '调度器', c.lr_scheduler],
        ['max_train_epochs', '训练轮数', c.max_train_epochs],
        ['train_batch_size', '批量大小', c.train_batch_size],
        ['gradient_accumulation_steps', '梯度累加', c.gradient_accumulation_steps],
        ['enable_preview', '预览图', c.enable_preview ? '开启' : '关闭'],
        ['mixed_precision', '混合精度', c.mixed_precision],
      ];
      var html = '<table class="wizard-preview-table">';
      for (var i = 0; i < rows.length; i++) {
        var k = rows[i][0], lbl = rows[i][1], val = rows[i][2];
        if (val === '' || val === undefined || val === null) continue;
        html += '<tr class="wizard-preview-row" title="' + escapeHtml(k) + '">'
          + '<td class="wizard-preview-key">' + escapeHtml(lbl) + '</td>'
          + '<td class="wizard-preview-val">' + escapeHtml(String(val)) + '</td>'
          + '</tr>';
      }
      html += '</table>';
      previewEl.innerHTML = html;
    }
  };

  /* wizard: 自动设置隐藏默认值 */
  function _wizardApplyDefaults() {
    var c = state.config;
    // 数据集默认参数
    if (c.max_bucket_reso === undefined || c.max_bucket_reso === '') updateConfigValue('max_bucket_reso', 1536);
    if (c.bucket_reso_steps === undefined || c.bucket_reso_steps === '') updateConfigValue('bucket_reso_steps', 64);
    if (!c.shuffle_caption) updateConfigValue('shuffle_caption', true);
    if (c.keep_tokens === undefined || c.keep_tokens === '') updateConfigValue('keep_tokens', 1);
    // 训练默认参数
    if (!c.gradient_checkpointing) updateConfigValue('gradient_checkpointing', true);
    if (!c.network_train_unet_only) updateConfigValue('network_train_unet_only', true);
    // 预览图默认参数
    if (!c.sample_at_first) updateConfigValue('sample_at_first', true);
    if (!c.sample_width || c.sample_width === 512) updateConfigValue('sample_width', 832);
    if (!c.sample_height || c.sample_height === 512) updateConfigValue('sample_height', 1216);
    if (!c.sample_cfg || c.sample_cfg === 7) updateConfigValue('sample_cfg', 5);
    if (!c.sample_seed) updateConfigValue('sample_seed', 2778);
    if (c.sample_sampler !== 'euler_a') updateConfigValue('sample_sampler', 'euler_a');
    // 缓存文本编码器默认关闭
    if (c.cache_text_encoder_outputs === undefined) updateConfigValue('cache_text_encoder_outputs', false);
  }

  /* wizard: 开始训练并跳转 */
  async function wizardStartTraining() {
    // 切换到训练模块
    state.activeModule = 'training';
    state.trainSubTab = 'monitor';
    document.querySelectorAll('.nav-item').forEach(function(el) {
      el.classList.toggle('active', el.dataset.module === 'training');
    });
    renderView('training');
    // 触发训练
    await executeTraining();
  };







  function bindGlobals(targetWindow) {
    targetWindow.wizardSet = wizardSet;
    targetWindow.wizardStartTraining = wizardStartTraining;
    targetWindow.wizardRender = wizardRender;
  }

  return {
    renderWizard,
    wizardSet,
    wizardStartTraining,
    wizardRender,
    bindGlobals,
  };
}
