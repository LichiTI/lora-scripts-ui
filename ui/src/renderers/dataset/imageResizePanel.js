export function createImageResizePanel({ api, $, _ico, escapeHtml, showToast }) {
  let resizePollTimer = null;

  function renderImageResize() {
    const content = $('#dataset-content');
    if (!content) return;

    const defaultResolutions = [
      [768, 1344],
      [832, 1216],
      [896, 1152],
      [1024, 1024],
      [1152, 896],
      [1216, 832],
      [1344, 768],
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
            <input type="range" id="resize-quality" value="100" min="1" max="100" step="1" oninput="document.getElementById('resize-quality-val').textContent=this.value">
          </div>
          <div class="config-group" style="grid-column:1/-1;">
            <label>目标分辨率列表</label>
            <input class="text-input" type="text" id="resize-resolutions" value="${defaultResolutions.map((resolution) => resolution.join('x')).join(', ')}" placeholder="768x1344, 1024x1024, ...">
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

  async function runImageResize() {
    const inputDir = $('#resize-input-path')?.value?.trim();
    if (!inputDir) {
      showToast('请先填写输入目录。');
      return;
    }
    const btn = $('#btn-resize-start');
    const hint = $('#resize-status-hint');
    const logEl = $('#resize-log-container');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = _ico('loader') + ' 处理中...';
    }
    if (hint) hint.innerHTML = '';
    if (logEl) {
      logEl.style.display = 'block';
      logEl.textContent = '正在启动图像预处理...\n';
    }
    const params = {
      input_dir: inputDir,
      output_dir: $('#resize-output')?.value?.trim() || '',
      format: $('#resize-format')?.value || 'ORIGINAL',
      quality: parseInt($('#resize-quality')?.value, 10) || 95,
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
      if (resp.status !== 'success') {
        throw new Error(resp.message || '启动失败');
      }
      showToast('✓ 图像预处理已启动');
      if (hint) hint.innerHTML = '<span style="color:var(--warning);">' + _ico('loader') + ' 处理中...</span>';
      if (resizePollTimer) clearInterval(resizePollTimer);
      resizePollTimer = setInterval(async () => {
        try {
          const statusResp = await api.getImageResizeStatus();
          const data = statusResp?.data;
          if (!data) return;
          if (logEl && data.lines) {
            logEl.textContent = data.lines.join('\n');
            logEl.scrollTop = logEl.scrollHeight;
          }
          if (data.process_status === 'done' || data.process_status === 'error' || data.process_status === 'unavailable') {
            clearInterval(resizePollTimer);
            resizePollTimer = null;
            if (btn) {
              btn.disabled = false;
              btn.textContent = '开始处理';
            }
            if (data.process_status === 'done') {
              if (hint) hint.innerHTML = '<span style="color:var(--success);">' + _ico('check-circle') + ' 处理完成</span>';
              showToast('✓ 图像预处理完成');
            } else if (data.process_status === 'unavailable') {
              if (hint) hint.innerHTML = '<span style="color:var(--success);">' + _ico('check-circle') + ' 已提交，稍后查看输出目录</span>';
              showToast('图像预处理已提交，Beta45 后端不提供实时日志');
            } else {
              if (hint) hint.innerHTML = '<span style="color:var(--danger);">' + _ico('x-circle') + ' 处理异常</span>';
              showToast('图像预处理出现错误，请查看日志');
            }
          }
        } catch (error) {
          // Resize status polling is best-effort; leave the backend task running.
        }
      }, 1000);
    } catch (error) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '开始处理';
      }
      if (hint) hint.innerHTML = '<span style="color:var(--danger);">' + _ico('x-circle') + ' ' + escapeHtml(error.message || '启动失败') + '</span>';
      if (logEl) logEl.textContent = '❌ ' + (error.message || '启动图像预处理失败。');
      showToast(error.message || '图像预处理启动失败。');
    }
  }

  return {
    renderImageResize,
    runImageResize,
  };
}
