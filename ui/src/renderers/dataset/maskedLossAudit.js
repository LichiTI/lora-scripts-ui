export function createMaskedLossAudit({ api, $, escapeHtml, showToast }) {
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
              <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('maskedloss-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
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
    if (!pathVal) {
      showToast('请先填写数据集路径。');
      return;
    }
    const result = $('#maskedloss-result');
    if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>审查中...</span></div>';
    try {
      const response = await api.maskedLossAudit({
        path: pathVal,
        recursive: $('#maskedloss-recursive')?.checked ?? true,
      });
      const data = response?.data;
      if (!data) {
        if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>无结果</span></div>';
        return;
      }
      if (result) {
        result.innerHTML = `
          <div class="module-list">
            <div class="module-list-item module-list-item-static">
              <div class="module-list-main">
                <strong>总图片: ${data.total_images ?? '-'}</strong>
                <span class="module-list-meta">包含 Alpha/Mask: ${data.with_alpha ?? '-'} | 无 Mask: ${data.without_alpha ?? '-'}</span>
              </div>
            </div>
            ${(data.samples || []).map((sample) => `
              <div class="module-list-item module-list-item-static">
                <div class="module-list-main">
                  <strong>${escapeHtml(sample.file || sample.name || '-')}</strong>
                  <span class="module-list-meta">${sample.has_alpha ? '包含 Alpha' : '无 Alpha'} | ${sample.width}x${sample.height}</span>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
    } catch (error) {
      if (result) result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(error.message || '审查失败')}</span></div>`;
    }
  }

  return {
    renderMaskedLossAudit,
    runMaskedLossAudit,
  };
}
