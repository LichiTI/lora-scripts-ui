export function createCaptionBackups({ api, $, escapeHtml, showToast }) {
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
              <input class="text-input" type="text" id="backup-path" placeholder="./train/your_dataset">
            </div>
          </div>
          <div class="config-group">
            <label>备份名称</label>
            <input class="text-input" type="text" id="backup-name" placeholder="my-backup">
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
    if (!pathVal) {
      showToast('请先填写数据集路径。');
      return;
    }
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
          ${backups.map((backup) => `
            <div class="module-list-item">
              <div class="module-list-main">
                <strong>${escapeHtml(backup.archive_name || backup.name || '-')}</strong>
                <span class="module-list-meta">${backup.file_count ?? '-'} 个文件</span>
              </div>
              <span class="module-list-time">${backup.created_at ? new Date(backup.created_at).toLocaleString('zh-CN') : '-'}</span>
              <button class="btn btn-outline btn-sm btn-picker-action" type="button" onclick="restoreCaptionBackup('${escapeHtml(backup.archive_name || backup.name)}')">恢复</button>
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
    if (!pathVal) {
      showToast('请先填写数据集路径。');
      return;
    }
    try {
      const response = await api.captionBackupRestore({ path: pathVal, archive_name: archiveName });
      showToast(response?.message || '备份已恢复。');
    } catch (error) {
      showToast(error.message || '备份恢复失败。');
    }
  }

  return {
    renderCaptionBackups,
    createCaptionBackup,
    listCaptionBackups,
    restoreCaptionBackup,
  };
}
