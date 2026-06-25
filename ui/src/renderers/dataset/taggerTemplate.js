export function renderTaggerTemplate({ models, defaultModel, llmModels, presets, conflicts, conflictLabels, llmChannels, escapeHtml }) {
  const usableChannels = (llmChannels || []).filter((channel) => channel.enabled && channel.has_key);
  const channelOptions = (llmChannels || []).length
    ? llmChannels.map((channel) => {
        const disabled = channel.enabled && channel.has_key ? '' : 'disabled';
        const reason = !channel.enabled ? '（禁用）' : (!channel.has_key ? '（缺少 Key）' : '');
        const label = `${channel.name || channel.id} · ${channel.provider || 'api'} · ${channel.model || '-'} ${reason}`;
        return `<option value="${escapeHtml(channel.id || '')}" ${disabled}>${escapeHtml(label)}</option>`;
      }).join('')
    : '<option value="">未配置通道</option>';
  const fallbackOptions = usableChannels.map((channel) => `<option value="${escapeHtml(channel.id || '')}">${escapeHtml(channel.name || channel.id)}</option>`).join('');
  return `
    <!-- WD14 / CL 标签器 -->
    <section class="form-section">
      <header class="section-header"><h3>WD14 / CL 标签器</h3></header>
      <div class="section-summary">对训练数据集进行自动标注，为每张图片生成 .txt 标签文件。使用本地 ONNX 模型运行，无需网络。</div>
      <div class="section-content tool-fields">
        <div class="config-group" style="grid-column:1/-1;">
          <label>数据集路径</label>
          <div class="input-picker">
            <button class="picker-icon" type="button" onclick="pickPathForInput('tagger-path', 'folder')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('tagger-path', 'folder')"><svgclass="icon"><use href="#icon-folder"></use></svg></button>
            <input class="text-input" type="text" id="tagger-path" placeholder="./train/your_dataset">
          </div>
        </div>
        <div class="config-group">
          <label>标注模型</label>
          <select id="tagger-model">
            ${models.map((m) => `<option value="${m}" ${m === defaultModel ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="config-group">
          <label>置信度阈值</label>
          <p class="field-desc">模型对标签的最低置信度，低于此值的标签不会写入，简单来说，数值越低打出的标越多。一般推荐 0.5，调低可获得更多标签但可能不准。</p>
          <input class="text-input" type="number" id="tagger-threshold" value="0.5" min="0" max="1" step="0.01">
        </div>
        <div class="config-group">
          <label>冲突处理</label>
          <select id="tagger-conflict">
            ${conflicts.map((c) => `<option value="${c}" ${c === 'ignore' ? 'selected': ''}>${conflictLabels[c]}</option>`).join('')}
          </select>
        </div>
        <div class="config-group">
          <label>额外追加标签</label>
          <input class="text-input" type="text" id="tagger-additional" placeholder="tag1, tag2">
        </div>
        <div class="config-group">
          <label>排除标签</label>
          <input class="text-input" type="text" id="tagger-exclude" placeholder="tag_to_remove">
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>递归扫描子目录</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="tagger-recursive" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>替换下划线为空格</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="tagger-underscore" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>转义括号</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="tagger-escape" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>空输出保护</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="tagger-empty-protect" checked><span class="slider round"></span></label>
        </div>
      </div>
      <div class="tool-actions">
        <button class="btn btn-primary btn-sm" type="button" id="btn-run-tagger" onclick="runTagger()">开始标注</button>
        <span id="tagger-status-hint" style="margin-left:12px;font-size:0.85rem;color:var(--text-dim);"></span>
      </div>
    </section>

    <!-- LLM 标签器 -->
    <section class="form-section">
      <header class="section-header"><h3>LLM 标签器（大语言模型）</h3></header>
      <div class="section-summary">使用 OpenAI / Claude / 自定义 API 的视觉语言模型对图片进行标注。需要填写 API Key，会消耗 API 额度。</div>
      <div class="section-content tool-fields">
        <div class="config-group" style="grid-column:1/-1;">
          <label>数据集路径</label>
          <div class="input-picker">
            <button class="picker-icon" type="button" onclick="pickPathForInput('llm-tagger-path', 'folder')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('llm-tagger-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
            <input class="text-input" type="text" id="llm-tagger-path" placeholder="./train/your_dataset">
          </div>
        </div>
        <div class="config-group">
          <label>主通道</label>
          <select id="llm-channel">${channelOptions}</select>
        </div>
        <div class="config-group">
          <label>备用通道</label>
          <select id="llm-fallback-channels" multiple size="3">${fallbackOptions}</select>
        </div>
        <div class="config-group">
          <label>模型覆盖</label>
          <input class="text-input" type="text" id="llm-model" placeholder="留空使用通道默认模型">
        </div>
        <div class="config-group">
          <label>重试次数</label>
          <input class="text-input" type="number" id="llm-retries" value="1" min="0" max="5">
        </div>
        <div class="config-group">
          <label>模板预设</label>
          <select id="llm-preset">
            ${presets.map((p) => `<option value="${p.id}">${escapeHtml(p.label ||p.id)}</option>`).join('')}
          </select>
        </div>
        <div class="config-group">
          <label>冲突处理</label>
          <select id="llm-conflict">
            ${conflicts.map((c) => `<option value="${c}" ${c === 'ignore' ? 'selected' : ''}>${conflictLabels[c]}</option>`).join('')}
          </select>
        </div>
        <div class="config-group">
          <label>Temperature</label>
          <input class="text-input" type="number" id="llm-temperature" value="0.2" min="0" max="2" step="0.1">
        </div>
        <div class="config-group">
          <label>最大 Tokens</label>
          <input class="text-input" type="number" id="llm-max-tokens" value="300" min="1" max="8192">
        </div>
        <div class="config-group">
          <label>最少标签数</label>
          <input class="text-input" type="number" id="llm-min-tags" value="1" min="0" max="100">
        </div>
        <div class="config-group">
          <label>最多标签数</label>
          <input class="text-input" type="number" id="llm-max-tags" value="120" min="1" max="500">
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>递归扫描子目录</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="llm-recursive"><span class="slider round"></span></label>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>自动回退备用通道</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="llm-fallback-enabled" checked><span class="slider round"></span></label>
        </div>
        <div class="config-group" style="grid-column:1/-1;">
          <label>通道管理</label>
          <div style="display:grid;grid-template-columns:1fr 160px 1fr 1fr;gap:8px;align-items:end;">
            <input class="text-input" type="text" id="llm-channel-name" placeholder="通道名称">
            <select id="llm-channel-provider">
              <option value="openai_compatible">OpenAI 兼容</option>
              <option value="gemini">Gemini</option>
              <option value="anthropic">Anthropic</option>
            </select>
            <input class="text-input" type="text" id="llm-channel-model" placeholder="默认模型">
            <input class="text-input" type="text" id="llm-channel-base" placeholder="API 地址，可留空">
          </div>
          <textarea class="text-input" id="llm-channel-keys" style="margin-top:8px;min-height:72px;width:100%;" placeholder="API Key，一行一个；已有通道留空会保留旧密钥"></textarea>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" type="button" onclick="saveLlmTaggerChannelFromForm()">保存通道</button>
            <button class="btn btn-outline btn-sm" type="button" onclick="refreshLlmTaggerChannels()">刷新通道</button>
            <button class="btn btn-outline btn-sm" type="button" onclick="clearSelectedLlmTaggerChannelKeys()">清空密钥</button>
            <button class="btn btn-outline btn-sm" type="button" onclick="deleteSelectedLlmTaggerChannel()">删除所选通道</button>
          </div>
        </div>
      </div>
      <div class="tool-actions">
        <button class="btn btn-primary btn-sm" type="button" id="btn-run-llm-tagger" onclick="runLlmTagger()">LLM 开始标注</button>
        <span id="llm-tagger-status-hint" style="margin-left:12px;font-size:0.85rem;color:var(--text-dim);"></span>
      </div>
    </section>
  `;
}
