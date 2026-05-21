// renderers/dataset.js — 数据集处理页面（标签器 / 标签编辑器 / 图像预处理 / 数据集分析 / Caption 清洗 / Caption 备份 / 蒙版损失审查）
//
// 包含 7 个 render 函数 + 4 个 hint 辅助 + gatherCleanupParams + _pollTaggerProgress
// 以及 14 个 action（runTagger / runLlmTagger / runImageResize / runDatasetAnalysis / 等）
// 工厂返回所有 render 函数 + actions（main.js 负责把 actions 挂到 window）
//
// 依赖（工厂注入）：state、api、$、escapeHtml、_ico、showToast

import { $, escapeHtml, _ico } from '../utils/dom.js';

export function createDatasetRenderer({ state, api, showToast, renderView }) {
  function renderDataset(container) {
    const activeTab = state.datasetSubTab || 'tagger';
    container.innerHTML = `
      <div class="form-container">
        <header class="section-title">
          <h2>数据集处理</h2>
          <p>图片标注、标签编辑、图像预处理、数据集分析与 Caption 清洗。</p>
        </header>
        <div class="dataset-tabs">
          <button class="dataset-tab ${activeTab === 'tagger' ? 'active' : ''}" type="button" onclick="switchDatasetTab('tagger')">标签器</button>
          <button class="dataset-tab ${activeTab === 'editor' ? 'active' : ''}" type="button" onclick="switchDatasetTab('editor')">标签编辑器</button>
          <button class="dataset-tab ${activeTab === 'resize' ? 'active' : ''}" type="button" onclick="switchDatasetTab('resize')">图像预处理</button>
          <button class="dataset-tab ${activeTab === 'analysis' ? 'active' : ''}" type="button" onclick="switchDatasetTab('analysis')">数据集分析</button>
          <button class="dataset-tab ${activeTab === 'suggestions' ? 'active' : ''}" type="button" onclick="switchDatasetTab('suggestions')">智能建议</button>
          <button class="dataset-tab ${activeTab === 'cleanup' ? 'active' : ''}" type="button" onclick="switchDatasetTab('cleanup')">Caption 清洗</button>
          <button class="dataset-tab ${activeTab === 'backups' ? 'active' : ''}" type="button" onclick="switchDatasetTab('backups')">Caption 备份</button>
          <button class="dataset-tab ${activeTab === 'maskedloss' ? 'active' : ''}" type="button" onclick="switchDatasetTab('maskedloss')">蒙版损失审查</button>
        </div>
        <div id="dataset-content"></div>
      </div>
    `;
    const renderers = {
      tagger: renderTagger,
      editor: renderTagEditor,
      resize: renderImageResize,
      analysis: renderDatasetAnalysis,
      suggestions: renderTagSuggestions,
      cleanup: renderCaptionCleanup,
      backups: renderCaptionBackups,
      maskedloss: renderMaskedLossAudit,
    };
   (renderers[activeTab] || renderTagger)();
  }

  function switchDatasetTab(tab) {
    state.datasetSubTab = tab;
    if (state.activeModule === 'dataset') renderView('dataset');
}

  function renderTagger() {
    const content = $('#dataset-content');
    if (!content) return;

    const allInterrogators = state.interrogators?.interrogators|| [];
const defaultModel = 'wd-eva02-large-v3';
    const wdModels = allInterrogators.filter((m) => m.kind === 'wd' || m.kind === 'cl');
    const llmModels = allInterrogators.filter((m) => m.kind === 'llm');
    const fallbackModels = [
      'wd-eva02-large-v3', 'wd-convnext-v3', 'wd-swinv2-v3', 'wd-vit-v3',
      'wd14-convnextv2-v2', 'wd14-swinv2-v2', 'wd14-vit-v2', 'wd14-moat-v2',
     'wd-eva02-large-tagger-v3', 'wd-vit-large-tagger-v3',
      'eva02_large_E621_FULL_V1', 'cl_tagger_1_01',
    ];
    const models =wdModels.length > 0 ? wdModels.map((m) => m.name) : fallbackModels;
    const conflicts = ['ignore', 'copy', 'prepend', 'append'];
    const conflictLabels = {ignore: '跳过已有', copy: '覆盖', prepend: '前置追加', append: '后置追加' };
    const presets = state.interrogators?.llm_template_presets|| [
      { id: 'anime-tags', label: '动漫标签 / Anime Tags' },
      { id: 'natural-caption', label: '自然语言描述 / Natural Caption' },
    ];

    content.innerHTML = `
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
            <label>LLM 提供商</label>
            <select id="llm-provider">
              ${llmModels.length > 0
                ? llmModels.map((m) => `<option value="${m.name}">${m.name}</option>`).join('')
                : '<option value="llm-openai">llm-openai</option><option value="llm-claude">llm-claude</option><option value="llm-custom">llm-custom</option>'
              }
        </select>
          </div>
          <divclass="config-group">
            <label>API Key</label>
            <input class="text-input"type="password" id="llm-api-key" placeholder="sk-...">
          </div>
          <div class="config-group">
            <label>模型名称</label>
            <input class="text-input" type="text"id="llm-model" placeholder="gpt-4o-mini / claude-sonnet-4-20250514">
          </div>
          <div class="config-group">
            <label>API 地址</label>
            <p class="field-desc">自定义提供商时必填，OpenAI/Claude 可留空用默认。</p>
            <input class="text-input" type="text" id="llm-api-base" placeholder="https://api.openai.com/v1">
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
          <div class="config-group row boolean-card">
            <div class="label-col"><label>递归扫描子目录</label></div>
            <label class="switch switch-compact"><input type="checkbox" id="llm-recursive"><span class="slider round"></span></label>
          </div>
        </div>
        <div class="tool-actions">
          <button class="btn btn-primary btn-sm" type="button" id="btn-run-llm-tagger" onclick="runLlmTagger()">LLM 开始标注</button>
          <span id="llm-tagger-status-hint" style="margin-left:12px;font-size:0.85rem;color:var(--text-dim);"></span>
        </div>
      </section>
    `;
  }

  // ── 打标器提交辅助：按钮 loading + 状态提示 ──
  function setTaggerButtonLoading(btnId, hintId, loading) {
    const btn = $('#' + btnId);
    const hint = $('#' + hintId);
    if (btn) {
      btn.disabled = loading;
      if (loading) {
        btn.dataset.origText = btn.textContent;
        btn.innerHTML = _ico('loader') + ' 提交中...';
      } else {
        btn.textContent = btn.dataset.origText || '开始标注';
      }
    }
    if (hint) {
      if (loading) {
        hint.innerHTML = '';
      }
    }
  }

  function showTaggerRunningHint(hintId, message) {
    const hint = $('#' + hintId);
    if (hint) {
      hint.innerHTML = '<span style="color:#f59e0b;">' + _ico('loader') + ' ' + message + '</span>';
    }
  }

  function showTaggerDoneHint(hintId, message) {
    const hint = $('#' + hintId);
    if (hint) {
      hint.innerHTML = '<span style="color:#22c55e;">' + _ico('check-circle') + ' ' + message + '</span>';
      setTimeout(() => { if (hint) hint.innerHTML = ''; }, 15000);
    }
  }

  function showTaggerErrorHint(hintId, message) {
    const hint = $('#' + hintId);
    if (hint) {
      hint.innerHTML = '<span style="color:#ef4444;">' + _ico('x-circle') + ' ' + message + '</span>';
    }
  }

  let _taggerPollTimer = null;
  function _pollTaggerProgress(hintId) {
    if (_taggerPollTimer) clearInterval(_taggerPollTimer);
    let _imageCount='';
    _taggerPollTimer = setInterval(async () => {
      try {
        const tasksResp = await api.getTasks();
        const tasks = tasksResp?.data?.tasks || [];
        const running = tasks.filter(t => t.status === 'RUNNING');
        if (running.length === 0) {
          clearInterval(_taggerPollTimer);
          _taggerPollTimer = null;
          const doneMsg= '标注完成' + (_imageCount ? ` (${_imageCount})` : '') + '！标签文件已生成。';
          showTaggerDoneHint(hintId, doneMsg);
          showToast('✓ ' + doneMsg);
          return;
        }
        const taskId = running[0].id || running[0].task_id;
        if (taskId) {
          const outResp = await api.getTaskOutput(taskId, 30);
          const lines = outResp?.data?.lines || [];
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            const imgMatch = line.match(/[Ff]ound\s+(\d+)\s+image/i);
            if (imgMatch) {
              _imageCount = imgMatch[1] + ' 张图片';
              const hint = document.getElementById(hintId);
              if (hint) {
                hint.innerHTML = '<span style="color:#f59e0b;">' + _ico('loader') + ' 标注中... 检测到 ' + _imageCount + '</span>';
              }
             break;
            }
            if (/all\s*done|识别完成|Unloaded/i.test(line)) {
              clearInterval(_taggerPollTimer);
              _taggerPollTimer = null;
              const doneMsg = '标注完成' + (_imageCount ? ` (${_imageCount})` : '') + '！标签文件已生成。';
              showTaggerDoneHint(hintId, doneMsg);
              showToast('✓ ' + doneMsg);
              return;
            }
          }
        }
      } catch (e) { /* 静默 */ }
    }, 3000);
  }

async function runLlmTagger() {
    const pathVal = $('#llm-tagger-path')?.value?.trim();
    if (!pathVal) { showToast('请先填写数据集路径。'); return; }
    const apiKey = $('#llm-api-key')?.value?.trim();
    if (!apiKey) { showToast('请填写 API Key。'); return; }
    const model = $('#llm-model')?.value?.trim();
    if (!model) { showToast('请填写模型名称。'); return; }
    const params = {
  path: pathVal,
 interrogator_model: $('#llm-provider')?.value || 'llm-openai',
      llm_api_key: apiKey,
llm_model: model,
      llm_api_base: $('#llm-api-base')?.value?.trim() || '',
      llm_template_preset: $('#llm-preset')?.value || 'anime-tags',
      batch_output_action_on_conflict: $('#llm-conflict')?.value || 'ignore',
      llm_temperature: parseFloat($('#llm-temperature')?.value) || 0.2,
      llm_max_tokens: parseInt($('#llm-max-tokens')?.value) || 300,
      batch_input_recursive: $('#llm-recursive')?.checked || false,
      threshold: 0.5,
    };
    setTaggerButtonLoading('btn-run-llm-tagger', 'llm-tagger-status-hint', true);
    try {
      const resp = await api.runInterrogate(params);
      setTaggerButtonLoading('btn-run-llm-tagger', 'llm-tagger-status-hint', false);
      showTaggerRunningHint('llm-tagger-status-hint',
        'LLM 标注后台运行中... 进度请查看后端控制台窗口（任务栏最小化窗口 "LoRA-Backend"）');
      showToast('✓ LLM 标注任务已提交到后端，正在后台运行。完成后 .txt 标签文件会自动生成在图片旁边。');
      _pollTaggerProgress('llm-tagger-status-hint');
    } catch (error) {
      setTaggerButtonLoading('btn-run-llm-tagger', 'llm-tagger-status-hint', false);
      showTaggerErrorHint('llm-tagger-status-hint', error.message || '提交失败');
      showToast(error.message || 'LLM 标注任务启动失败。');
    }
  }

  async function runTagger() {
    const pathVal = $('#tagger-path')?.value?.trim();
    if (!pathVal) { showToast('请先填写数据集路径。'); return; }
    const params = {
      path: pathVal,
      interrogator_model: $('#tagger-model')?.value || 'wd-eva02-large-v3',
      threshold: parseFloat($('#tagger-threshold')?.value) || 0.5,
      additional_tags: $('#tagger-additional')?.value || '',
      exclude_tags: $('#tagger-exclude')?.value || '',
      batch_input_recursive: $('#tagger-recursive')?.checked || false,
      batch_output_action_on_conflict: $('#tagger-conflict')?.value || 'ignore',
      replace_underscore: $('#tagger-underscore')?.checked ?? true,
      escape_tag: $('#tagger-escape')?.checked ?? true,
    };
    setTaggerButtonLoading('btn-run-tagger', 'tagger-status-hint', true);
    try {
      const resp = await api.runInterrogate(params);
      setTaggerButtonLoading('btn-run-tagger', 'tagger-status-hint', false);
      showTaggerRunningHint('tagger-status-hint',
        '标注后台运行中（首次需下载模型，可能需要几分钟）... 进度请查看后端控制台窗口');
      showToast('✓ 标注任务已提交到后端，正在后台运行。完成后 .txt 标签文件会自动生成在图片旁边。');
      _pollTaggerProgress('tagger-status-hint');
   } catch (error) {
      setTaggerButtonLoading('btn-run-tagger', 'tagger-status-hint', false);
      showTaggerErrorHint('tagger-status-hint', error.message || '提交失败');
     showToast(error.message || '标注任务启动失败。');
    }
  }

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
      if (!['ready','cleanroom','disabled','failed','missing_dependencies','missing_launcher'].includes(status)) {
        setTimeout(pollTagEditorStatus, 2000);
      }
    } catch (e) {
      statusEl.textContent = '无法获取状态';
    }
  }

  function refreshTagEditorIframe() {
    // Backward-compatible global hook used by older buttons.
    pollTagEditorStatus();
  }

  function renderImageResize() {
    const content = $('#dataset-content');
    if (!content) return;

    const defaultResolutions = [
      [768, 1344], [832, 1216], [896, 1152], [1024, 1024],
      [1152, 896], [1216, 832], [1344, 768],
    ];

    content.innerHTML = `
      <section class="form-section">
        <header class="section-header"><h3>训练图像缩放预处理</h3></header>
        <div class="section-summary">将图片缩放到最接近的预设目标分辨率，保持宽高比。支持批量转换格式、自动重命名、同步描述文件。<br><strong>推荐常用参数：智能缩放 + 精确裁剪</strong></div>
        <div class="section-content tool-fields">
          <div class="config-group" style="grid-column:1/-1;">
            <label>输入目录</label>
            <div class="input-picker">
              <button class="picker-icon" type="button" onclick="pickPathForInput('resize-input-path', 'folder')">
                <svg class="icon"><use href="#icon-folder"></use></svg>
              </button>
              <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('resize-input-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
    <input class="text-input" type="text" id="resize-input-path" placeholder="选择或输入数据集文件夹路径">
            </div>
            <p class="field-desc">选择或手动输入 train 目录下的数据集文件夹路径。</p>
          </div>
          <div class="config-group" style="grid-column:1/-1;">
            <label>输出目录（留空则生成 resized 子目录）</label>
            <div class="input-picker">
              <button class="picker-icon" type="button" onclick="pickPathForInput('resize-output', 'folder')">
                <svg class="icon"><use href="#icon-folder"></use></svg>
              </button>
              <input class="text-input" type="text" id="resize-output" placeholder="留空则生成 输入目录/resized">
            </div>
            <p class="field-desc">为避免误覆盖，后端默认输出到 resized 子目录，不会直接覆盖原图。</p>
          </div>
          <div class="config-group">
            <label>输出格式</label>
            <select id="resize-format">
              <option value="ORIGINAL">原格式</option>
              <option value="JPEG" selected>JPEG (.jpg)</option>
              <option value="WEBP">WEBP (.webp)</option>
              <option value="PNG">PNG (.png)</option>
            </select>
          </div>
          <div class="config-group">
           <label>质量 (JPG/WEBP)：<span id="resize-quality-val">100</span>%</label>
            <input type="range" id="resize-quality" value="100" min="1" max="100"step="1" oninput="document.getElementById('resize-quality-val').textContent=this.value">
          </div>
          <div class="config-group" style="grid-column:1/-1;">
            <label>目标分辨率列表</label>
            <input class="text-input" type="text" id="resize-resolutions" value="${defaultResolutions.map((r) => r.join('x')).join(', ')}" placeholder="768x1344, 1024x1024, ...">
            <p class="field-desc">格式：宽x高，逗号分隔。图片会匹配宽高比最接近的分辨率。</p>
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>启用智能缩放</label><p class="field-desc">禁用后仅转换格式，不改变尺寸。</p></div>
            <label class="switch switch-compact"><input type="checkbox" id="resize-enable" checked><span class="slider round"></span></label>
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>精确裁剪到目标尺寸</label><p class="field-desc">缩放后居中裁剪，输出精确等于目标尺寸。</p></div>
            <label class="switch switch-compact"><input type="checkbox" id="resize-exact" checked><span class="slider round"></span></label>
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>递归处理子目录</label><p class="field-desc">扫描并处理所有子文件夹中的图片。</p></div>
            <label class="switch switch-compact"><input type="checkbox" id="resize-recursive" checked><span class="slider round"></span></label>
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>启用重命名</label><p class="field-desc">输出文件按所选规则重命名，避免同名覆盖。</p></div>
            <label class="switch switch-compact"><input type="checkbox" id="resize-rename" checked><span class="slider round"></span></label>
          </div>
          <div class="config-group">
            <label>重命名模式</label>
            <select id="resize-rename-mode">
              <option value="legacy_suffix">原名追加 _resized</option>
              <option value="folder_sequence" selected>文件夹名_00001</option>
            </select>
            <p class="field-desc">例如：cat.png → cat_resized.jpg，或 dataset_00001.jpg。</p>
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>处理后删除原图</label><p class="field-desc">安全模式下后端会忽略删除请求；建议手动确认输出后再清理源文件。</p></div>
            <label class="switch switch-compact"><input type="checkbox" id="resize-delete"><span class="slider round"></span></label>
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>同步处理描述文件</label><p class="field-desc">自动同步 .txt / .npz / .caption 文件。</p></div>
            <label class="switch switch-compact"><input type="checkbox" id="resize-sync" checked><span class="slider round"></span></label>
          </div>
        </div>
        <div class="tool-actions" style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-primary btn-sm" type="button" id="btn-resize-start" onclick="runImageResize()">开始处理</button>
          <span id="resize-status-hint" style="font-size:0.82rem;color:var(--text-dim);"></span>
        </div>
        <div id="resize-log-container" style="display:none;margin-top:12px;max-height:300px;overflow:auto;background:var(--bg-hover);border-radius:8px;padding:10px;font-family:monospace;font-size:0.78rem;white-space:pre-wrap;"></div>
      </section>
    `;
  }

  let _resizePollTimer = null;

  async function runImageResize() {
    const inputDir = $('#resize-input-path')?.value?.trim();
    if (!inputDir) { showToast('请先填写输入目录。'); return; }
    const btn = $('#btn-resize-start');
    const hint = $('#resize-status-hint');
    const logEl = $('#resize-log-container');
    if (btn) { btn.disabled = true; btn.innerHTML = _ico('loader') + ' 处理中...'; }
    if (hint) hint.innerHTML = '';
    if (logEl) { logEl.style.display = 'block'; logEl.textContent = '正在启动图像预处理...\n'; }
    const params = {
      input_dir: inputDir,
      output_dir: $('#resize-output')?.value?.trim() || '',
      format: $('#resize-format')?.value || 'ORIGINAL',
      quality: parseInt($('#resize-quality')?.value) || 95,
      resolutions: $('#resize-resolutions')?.value?.trim() || '',
      enable_resize: $('#resize-enable')?.checked ?? true,
      exact_size: $('#resize-exact')?.checked || false,
      recursive: $('#resize-recursive')?.checked || false,
      rename: $('#resize-rename')?.checked || false,
      rename_mode: $('#resize-rename-mode')?.value || 'legacy_suffix',
      delete_original: $('#resize-delete')?.checked || false,
      sync_metadata: $('#resize-sync')?.checked ?? true,
    };
    try {
      const resp = await api.runImageResize(params);
      if (resp.status !== 'success') { throw new Error(resp.message || '启动失败'); }
      showToast('✓ 图像预处理已启动');
      if (hint) hint.innerHTML = '<span style="color:#f59e0b;">' + _ico('loader') + ' 处理中...</span>';
      if (_resizePollTimer) clearInterval(_resizePollTimer);
      _resizePollTimer = setInterval(async () => {
        try {
       const statusResp = await api.getImageResizeStatus();
          const data = statusResp?.data;
          if (!data) return;
          if (logEl && data.lines) {
            logEl.textContent = data.lines.join('\n');
            logEl.scrollTop = logEl.scrollHeight;
          }
          if (data.process_status === 'done' || data.process_status === 'error' || data.process_status === 'unavailable') {
            clearInterval(_resizePollTimer);
            _resizePollTimer = null;
            if (btn) { btn.disabled = false; btn.textContent = '开始处理'; }
            if (data.process_status === 'done') {
              if (hint) hint.innerHTML = '<span style="color:#22c55e;">' + _ico('check-circle') + ' 处理完成</span>';
              showToast('✓ 图像预处理完成');
            } else if (data.process_status === 'unavailable') {
              if (hint) hint.innerHTML = '<span style="color:#22c55e;">' + _ico('check-circle') + ' 已提交，稍后查看输出目录</span>';
              showToast('图像预处理已提交，Beta45 后端不提供实时日志');
            } else {
              if (hint) hint.innerHTML = '<span style="color:#ef4444;">' + _ico('x-circle') + ' 处理异常</span>';
              showToast('图像预处理出现错误，请查看日志');
            }
          }
        } catch (e) { /* 静默 */ }
    }, 1000);
    } catch (error) {
      if (btn) { btn.disabled = false; btn.textContent = '开始处理'; }
      if (hint) hint.innerHTML = '<span style="color:#ef4444;">' + _ico('x-circle') + ' ' + escapeHtml(error.message || '启动失败')+ '</span>';
      if(logEl) logEl.textContent = '❌ ' + (error.message || '启动图像预处理失败。');
      showToast(error.message || '图像预处理启动失败。');
    }
  }

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
        if (jobEl) jobEl.innerHTML = `<span style="color:#ef4444;">${escapeHtml(error.message || '提交失败')}</span>`;
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
          if (jobEl) jobEl.innerHTML = `<span style="color:#ef4444;">${escapeHtml(error.message || '轮询失败')}</span>`;
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
    if (result) result.innerHTML = '<divclass="builtin-picker-empty"><span>预览中...</span></div>';
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
        if (jobEl) jobEl.innerHTML = `<span style="color:#ef4444;">${escapeHtml(error.message || '提交失败')}</span>`;
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
          if (jobEl) jobEl.innerHTML = `<span style="color:#ef4444;">${escapeHtml(error.message || '轮询失败')}</span>`;
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

  // ========== Caption 备份==========
  function renderCaptionBackups() {
    const content = $('#dataset-content');
    if (!content) return;
    content.innerHTML = `
      <section class="form-section">
   <header class="section-header"><h3>Caption 备份与恢复</h3></header>
        <div class="section-summary">创建数据集 caption 的快照备份，或从已有备份恢复。</div>
        <div class="section-content tool-fields">
          <div class="config-group" style="grid-column:1/-1;">
            <label>数据集路径</label>
            <div class="input-picker">
              <button class="picker-icon" type="button" onclick="pickPathForInput('backup-path', 'folder')">
                <svg class="icon"><use href="#icon-folder"></use></svg>
              </button>
              <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('backup-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
             <input class="text-input" type="text"id="backup-path" placeholder="./train/your_dataset">
            </div>
          </div>
          <div class="config-group">
            <label>备份名称</label>
            <input class="text-input"type="text" id="backup-name" placeholder="my-backup">
          </div>
       <div class="config-group">
            <label>Caption 扩展名</label>
            <input class="text-input" type="text" id="backup-ext" value=".txt">
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>递归子目录</label></div>
            <label class="switch switch-compact"><input type="checkbox" id="backup-recursive" checked><span class="slider round"></span></label>
          </div>
        </div>
        <div class="tool-actions" style="display:flex;gap:8px;">
          <button class="btn btn-primary btn-sm" type="button" onclick="createCaptionBackup()">创建备份</button>
          <button class="btn btn-outline btn-sm" type="button" onclick="listCaptionBackups()">查看已有备份</button>
        </div>
        <div id="backup-result" style="margin-top:16px;"></div>
      </section>
    `;
  }

  async function createCaptionBackup() {
    const pathVal = $('#backup-path')?.value?.trim();
    if (!pathVal) { showToast('请先填写数据集路径。');return; }
    try {
      const response = await api.captionBackupCreate({
        path: pathVal,
        caption_extension: $('#backup-ext')?.value || '.txt',
        recursive: $('#backup-recursive')?.checked ?? true,
        snapshot_name: $('#backup-name')?.value?.trim() || '',
      });
      showToast(response?.message || '备份已创建。');
      listCaptionBackups();
    } catch (error) {
      showToast(error.message || '备份创建失败。');
    }
  }

  async function listCaptionBackups() {
    const pathVal = $('#backup-path')?.value?.trim();
    const result = $('#backup-result');
    if (!result) return;
    result.innerHTML = '<div class="builtin-picker-empty"><span>加载中...</span></div>';
    try {
      const response = await api.captionBackupList({ path: pathVal || '' });
      const backups = response?.data?.backups || [];
      if (!backups.length) {
        result.innerHTML = '<div class="builtin-picker-empty"><span>未找到备份</span></div>';
        return;
      }
      result.innerHTML = `
        <div class="module-list">
          ${backups.map((b) => `
            <div class="module-list-item">
              <div class="module-list-main">
                <strong>${escapeHtml(b.archive_name || b.name || '-')}</strong>
      <span class="module-list-meta">${b.file_count ?? '-'} 个文件</span>
            </div>
              <span class="module-list-time">${b.created_at ? new Date(b.created_at).toLocaleString('zh-CN') : '-'}</span>
              <button class="btn btn-outline btn-sm btn-picker-action" type="button" onclick="restoreCaptionBackup('${escapeHtml(b.archive_name || b.name)}')">恢复</button>
            </div>
          `).join('')}
        </div>
      `;
    } catch (error) {
      result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(error.message || '读取备份列表失败')}</span></div>`;
    }
  }

  async function restoreCaptionBackup(archiveName) {
    const pathVal = $('#backup-path')?.value?.trim();
    if (!pathVal) { showToast('请先填写数据集路径。'); return; }
    try {
      const response = await api.captionBackupRestore({ path: pathVal, archive_name: archiveName });
      showToast(response?.message || '备份已恢复。');
    } catch (error) {
      showToast(error.message || '备份恢复失败。');
    }
  }

  // ========== 蒙版损失审查 ==========
  function renderMaskedLossAudit() {
    const content = $('#dataset-content');
    if (!content) return;
    content.innerHTML = `
      <section class="form-section">
        <header class="section-header"><h3>蒙版损失数据集审查</h3></header>
        <div class="section-summary">检查数据集中的图像是否包含 Alpha 通道 / 蒙版，用于 masked_loss 训练。</div>
        <div class="section-content tool-fields">
          <div class="config-group" style="grid-column:1/-1;">
            <label>数据集路径</label>
            <div class="input-picker">
              <button class="picker-icon" type="button" onclick="pickPathForInput('maskedloss-path', 'folder')">
                <svg class="icon"><use href="#icon-folder"></use></svg>
              </button>
              <button class="picker-mode-icon-btn"type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('maskedloss-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
              <input class="text-input" type="text" id="maskedloss-path" placeholder="./train/your_dataset">
            </div>
         </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>递归扫描子目录</label></div>
            <label class="switch switch-compact"><input type="checkbox" id="maskedloss-recursive" checked><span class="slider round"></span></label>
          </div>
        </div>
        <div class="tool-actions">
        <button class="btn btn-primary btn-sm" type="button" onclick="runMaskedLossAudit()">开始审查</button>
        </div>
        <div id="maskedloss-result" style="margin-top:16px;"></div>
      </section>
    `;
  }

  async function runMaskedLossAudit() {
    const pathVal = $('#maskedloss-path')?.value?.trim();
    if (!pathVal) { showToast('请先填写数据集路径。'); return; }
const result = $('#maskedloss-result');
    if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>审查中...</span></div>';
    try {
      const response = await api.maskedLossAudit({
        path: pathVal,
        recursive: $('#maskedloss-recursive')?.checked ?? true,
      });
      const data = response?.data;
      if (!data) { if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>无结果</span></div>'; return; }
      if (result) result.innerHTML = `
        <div class="module-list">
          <div class="module-list-item module-list-item-static">
            <div class="module-list-main">
              <strong>总图片: ${data.total_images ?? '-'}</strong>
              <span class="module-list-meta">包含 Alpha/Mask: ${data.with_alpha ?? '-'} | 无 Mask: ${data.without_alpha ?? '-'}</span>
            </div>
          </div>
          ${(data.samples || []).map((s) => `
            <div class="module-list-item module-list-item-static">
              <div class="module-list-main">
                <strong>${escapeHtml(s.file || s.name || '-')}</strong>
                <span class="module-list-meta">${s.has_alpha ? '✅ 包含 Alpha' : '❌ 无 Alpha'} | ${s.width}x${s.height}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (error) {
      if (result) result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(error.message || '审查失败')}</span></div>`;
    }
  }

  return {
    renderDataset,
    // actions（main.js 把它们挂到 window）
    switchDatasetTab,
    runTagger,
    runLlmTagger,
    refreshTagEditorIframe,
    runImageResize,
    runDatasetAnalysis,
    runCaptionCleanupPreview,
    runCaptionCleanupApply,
    createCaptionBackup,
    listCaptionBackups,
    restoreCaptionBackup,
    runMaskedLossAudit,
  };
}
