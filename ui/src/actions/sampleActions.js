// actions/sampleActions.js — 训练预览/数据集预览 actions
//   openSampleLightbox / lightboxNav / closeSampleLightbox
//   openOutputFolder
//   scanDataset / toggleFolderPreview / loadMoreThumbs
//   runTrainingPreflight
//
// 依赖（工厂注入）：state, api, showToast, renderView,
//   getSortedSamples（来自 samples renderer）, buildRunConfig

export function createSampleActions({ state, api, showToast, renderView, getSortedSamples, buildRunConfig }) {
  let _lightboxIndex = -1;

  function openSampleLightbox(fileName) {
    var lightbox = document.getElementById('sample-lightbox');
    var img = document.getElementById('sample-lightbox-img');
    var nameEl = document.getElementById('sample-lightbox-name');
    if (!lightbox || !img) return;
    // 找到当前图片在排序后列表中的索引
    var sorted = getSortedSamples();
    _lightboxIndex = sorted.findIndex(function(s) { return s.name === fileName; });
    img.src = '/api/local/sample_file?name=' + encodeURIComponent(fileName);
    if (nameEl) nameEl.textContent = fileName;
    lightbox.classList.add('open');
  }

  function lightboxNav(dir) {
    var sorted = getSortedSamples();
    if (sorted.length === 0) return;
    _lightboxIndex = (_lightboxIndex + dir + sorted.length) % sorted.length;
    var target = sorted[_lightboxIndex];
    var img = document.getElementById('sample-lightbox-img');
    var nameEl = document.getElementById('sample-lightbox-name');
    if (img) img.src = '/api/local/sample_file?name=' + encodeURIComponent(target.name);
    if (nameEl) nameEl.textContent = target.name;
  }

  function closeSampleLightbox(event) {
    // 点击箭头、图片、文件名时不关闭
    if (event && event.target) {
      var tag = event.target.tagName;
      if (tag === 'IMG' || event.target.classList.contains('lb-arrow') || event.target.closest('.sample-lightbox-inner')) return;
    }
    var lightbox = document.getElementById('sample-lightbox');
    if (lightbox) lightbox.classList.remove('open');
    _lightboxIndex = -1;
  }

  // 键盘左右翻页 + ESC 关闭（一次性安装）
  function bindKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
      var lightbox = document.getElementById('sample-lightbox');
      if (!lightbox || !lightbox.classList.contains('open')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); lightboxNav(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); lightboxNav(1); }
      else if (e.key === 'Escape') { closeSampleLightbox(); }
    });
  }
  bindKeyboardShortcuts();

  async function openOutputFolder() {
    try {
      await api.openFolder('output');
      showToast('✓ 已打开 output 文件夹');
    } catch (e) {
      showToast(e.message || '打开文件夹失败');
    }
  }

  async function scanDataset() {
    var dataDir = state.config.train_data_dir;
    if (!dataDir) { showToast('请先设置 train_data_dir'); return; }
    state.loading.preflight = true;
    if (state.activeModule === 'training') renderView('training');
    try {
      var resp = await api.analyzeDataset({ path: dataDir, caption_extension: state.config.caption_extension || '.txt' });
      if (resp.status === 'success' && resp.data) {
        state.datasetAnalysis = resp.data;
      } else {
        showToast(resp.message || '数据集扫描失败');
      }
    } catch(e) {
      showToast(e.message || '数据集扫描失败');
    } finally {
      state.loading.preflight = false;
      if (state.activeModule === 'training') renderView('training');
    }
  }

  /** Toggle image thumbnail preview for a folder row */
  async function toggleFolderPreview(idx, rowEl) {
    var panel = document.getElementById('pf-thumbs-' + idx);
    if (!panel) return;
    // Toggle visibility
    if (panel.style.display !== 'none' && panel.dataset.loaded === 'true') {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'flex';
    if (panel.dataset.loaded === 'true') return;
    // Load images
    var folder = panel.dataset.folder;
    if (!folder) return;
    panel.innerHTML = '<span style="font-size:0.72rem;color:var(--text-muted);padding:8px;">加载中...</span>';
    try {
      var resp = await api.listDatasetImages(folder, 6);
      var images = (resp && resp.data && resp.data.images) ? resp.data.images : [];
      var total = (resp && resp.data) ? resp.data.total : 0;
      if (images.length === 0) {
        panel.innerHTML = '<span style="font-size:0.72rem;color:var(--text-muted);padding:8px;">无图片</span>';
      } else {
        panel.innerHTML = images.map(function(imgPath) {
          var src = '/api/image_resize/file?path=' + encodeURIComponent(imgPath);
          return '<div class="train-pf-thumb"><img src="' + src + '" loading="lazy"></div>';
        }).join('')
        + (total > images.length ? '<div class="train-pf-thumb train-pf-thumb-more" onclick="event.stopPropagation();loadMoreThumbs(' + idx + ',' + total + ')"data-idx="' + idx + '">+' + (total - images.length) + '</div>' : '');
      }
      // Update concept tag from first caption file
      var firstTag = (resp && resp.data && resp.data.first_tag) ? resp.data.first_tag : '';
      if (firstTag) {
        var tagCell = document.getElementById('pf-tag-' + idx);
        if (tagCell) tagCell.textContent = firstTag;
      }
      panel.dataset.loaded = 'true';
    } catch(e) {
      panel.innerHTML = '<span style="font-size:0.72rem;color:var(--danger);padding:8px;">加载失败</span>';
    }
  }

  /** Load all remaining thumbnails for a folder */
  async function loadMoreThumbs(idx, total) {
    var panel = document.getElementById('pf-thumbs-' + idx);
    if (!panel) return;
    var folder = panel.dataset.folder;
    if (!folder) return;
    try {
      var resp = await api.listDatasetImages(folder, total);
      var images = (resp && resp.data && resp.data.images) ? resp.data.images : [];
      panel.innerHTML = images.map(function(imgPath) {
        var src = '/api/image_resize/file?path=' + encodeURIComponent(imgPath);
        return '<div class="train-pf-thumb"><img src="' + src + '" loading="lazy"></div>';
      }).join('');
    } catch(e) {
      // silent
    }
  }

  async function runTrainingPreflight() {
    state.loading.preflight = true;
 if (state.activeModule === 'training') renderView('training');
    try {
      var response = await api.runPreflight(buildRunConfig(state.config, state.activeTrainingType));
      state.preflight = response.status === 'success' ? response.data : { can_start: false, errors: [response.message || 'Failed'], warnings: [], notes: [] };
    } catch(e){
      state.preflight = { can_start: false, errors: [e.message || 'Failed'], warnings: [], notes: [] };
    } finally {
   state.loading.preflight = false;
      if (state.activeModule === 'training') renderView('training');
      else if (state.activeModule === 'config') renderView('config');
    }
  }

  return {
    openSampleLightbox,
    lightboxNav,
    closeSampleLightbox,
    openOutputFolder,
    scanDataset,
    toggleFolderPreview,
    loadMoreThumbs,
    runTrainingPreflight,
  };
}
