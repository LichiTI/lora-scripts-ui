const DATASET_TABS = [
  { id: 'tagger', label: '标签器' },
  { id: 'editor', label: '标签编辑器' },
  { id: 'advanced', label: '高级标签工具' },
  { id: 'translation', label: '预翻译模板' },
  { id: 'resize', label: '图像预处理' },
  { id: 'analysis', label: '数据集分析' },
  { id: 'suggestions', label: '智能建议' },
  { id: 'cleanup', label: 'Caption 清洗' },
  { id: 'tagmanager', label: '标签管理 Lite' },
  { id: 'bbox', label: '框标注 Lite' },
  { id: 'backups', label: 'Caption 备份' },
  { id: 'maskedloss', label: '蒙版损失审查' },
];

export function renderDatasetShell(activeTab = 'tagger') {
  const tabs = DATASET_TABS.map((tab) => (
    `<button class="dataset-tab ${activeTab === tab.id ? 'active' : ''}" type="button" onclick="switchDatasetTab('${tab.id}')">${tab.label}</button>`
  )).join('');

  return `
    <div class="form-container">
      <header class="section-title">
        <h2>数据集处理</h2>
        <p>图片标注、标签编辑、图像预处理、数据集分析与 Caption 清洗。</p>
      </header>
      <div class="dataset-shell-layout">
        <nav class="dataset-tabs" aria-label="数据集处理子页面">
          ${tabs}
        </nav>
        <div id="dataset-content"></div>
      </div>
    </div>
  `;
}
