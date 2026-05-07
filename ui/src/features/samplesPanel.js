import { escapeHtml, icon as _ico } from '../utils/dom.js';

export function createSamplesPanelController({ api, showToast }) {
  let sampleCache = [];
  let sampleSort = 'time-desc';
  let sampleFilter = '';
  let lightboxIndex = -1;

  function renderSamplesPanel() {
    return '<div class="train-pf-scroll" id="samples-panel">'
      + '<div class="train-pf-header"><div style="display:flex;align-items:center;gap:10px;">'
      + _ico('eye', 16) + ' <span style="font-size:0.9rem;font-weight:700;">训练预览图</span></div>'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      + '<button class="btn btn-outline btn-sm" type="button" onclick="refreshSampleImages()" style="font-size:0.68rem;">' + _ico('refresh-cw', 13) + ' 刷新</button>'
      + '<button class="btn btn-outline btn-sm" type="button" onclick="openOutputFolder()" style="font-size:0.68rem;">' + _ico('folder', 13) + ' 打开 output 文件夹</button>'
      + '</div></div>'
      + '<div id="samples-toolbar" style="padding:8px 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
      + '<input type="text" id="sample-filter-input" placeholder="输入关键词筛选..." value="' + escapeHtml(sampleFilter) + '" oninput="applySampleFilter(this.value)" style="flex:1;min-width:140px;max-width:300px;padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-panel);color:var(--text-main);font-size:0.78rem;outline:none;">'
      + '<select id="sample-sort-select" onchange="applySampleSort(this.value)" style="padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-panel);color:var(--text-main);font-size:0.78rem;cursor:pointer;">'
      + '<option value="time-desc"' + (sampleSort === 'time-desc' ? ' selected' : '') + '>最新优先</option>'
      + '<option value="time-asc"' + (sampleSort === 'time-asc' ? ' selected' : '') + '>最旧优先</option>'
      + '<option value="epoch-asc"' + (sampleSort === 'epoch-asc' ? ' selected' : '') + '>Epoch 正序</option>'
      + '<option value="epoch-desc"' + (sampleSort === 'epoch-desc' ? ' selected' : '') + '>Epoch 倒序</option>'
      + '<option value="name-asc"' + (sampleSort === 'name-asc' ? ' selected' : '') + '>名称 A→Z</option>'
      + '<option value="name-desc"' + (sampleSort === 'name-desc' ? ' selected' : '') + '>名称 Z→A</option>'
      + '</select>'
      + '<span id="sample-count-badge" style="font-size:0.7rem;color:var(--text-muted);"></span>'
      + '</div>'
      + '<div id="samples-grid" style="padding:12px;"><div style="text-align:center;padding:40px;color:var(--text-muted);">' + _ico('loader', 20) + ' 加载中...</div></div>'
      + '</div>'
      + '<div id="sample-lightbox" class="sample-lightbox" style="display:none;" onclick="closeSampleLightbox(event)">'
      + '<button class="lb-arrow lb-arrow-left" type="button" onclick="event.stopPropagation();lightboxNav(-1)" title="上一张 (←)">&#10094;</button>'
      + '<button class="lb-arrow lb-arrow-right" type="button" onclick="event.stopPropagation();lightboxNav(1)" title="下一张 (→)">&#10095;</button>'
      + '<div class="sample-lightbox-inner">'
      + '<img id="sample-lightbox-img" src="" alt="">'
      + '<div id="sample-lightbox-name" style="color:#fff;font-size:0.82rem;margin-top:8px;text-align:center;"></div>'
      + '<button type="button" onclick="closeSampleLightbox()" style="position:absolute;top:12px;right:12px;background:rgba(0,0,0,0.5);color:#fff;border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:1.2rem;">×</button>'
      + '</div></div>';
  }

  function extractEpoch(name) {
    const match = name.match(/_e(\d+)_/);
    return match ? parseInt(match[1]) : -1;
  }

  function extractPrefix(name) {
    const match = name.match(/^(.+?)_e\d+_/);
    return match ? match[1] : name.replace(/\.[^.]+$/, '');
  }

  function sortAndFilterSamples(images) {
    let filtered = images;
    if (sampleFilter) {
      const keyword = sampleFilter.toLowerCase();
      filtered = images.filter((img) => img.name.toLowerCase().includes(keyword));
    }

    const sorted = filtered.slice();
    switch (sampleSort) {
      case 'time-asc': sorted.sort((a, b) => a.mtime - b.mtime); break;
      case 'time-desc': sorted.sort((a, b) => b.mtime - a.mtime); break;
      case 'epoch-asc': sorted.sort((a, b) => extractEpoch(a.name) - extractEpoch(b.name) || a.name.localeCompare(b.name)); break;
      case 'epoch-desc': sorted.sort((a, b) => extractEpoch(b.name) - extractEpoch(a.name) || a.name.localeCompare(b.name)); break;
      case 'name-asc': sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'name-desc': sorted.sort((a, b) => b.name.localeCompare(a.name)); break;
      default: sorted.sort((a, b) => b.mtime - a.mtime);
    }
    return sorted;
  }

  function renderSampleGrid(images) {
    const grid = document.getElementById('samples-grid');
    const badge = document.getElementById('sample-count-badge');
    if (!grid) return;

    const sorted = sortAndFilterSamples(images);
    if (badge) {
      const totalStr = images.length + ' 张';
      if (sampleFilter && sorted.length !== images.length) {
        badge.textContent = '显示 ' + sorted.length + ' / ' + totalStr;
      } else {
        badge.textContent = totalStr;
      }
    }

    if (sorted.length === 0) {
      if (sampleFilter) {
        grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">'
          + '未找到匹配「' + escapeHtml(sampleFilter) + '」的图片</div>';
      } else {
        grid.innerHTML = '<div style="text-align:center;padding:48px 20px;color:var(--text-muted);">'
          + _ico('folder', 32) + '<br><br>'
          + '<div style="font-size:0.85rem;">暂无预览图</div>'
          + '<div style="font-size:0.75rem;margin-top:4px;">训练时启用「训练预览图」后，生成的图片会显示在这里</div>'
          + '</div>';
      }
      return;
    }

    const prefixes = new Set(sorted.map((img) => extractPrefix(img.name)));
    const showPrefix = prefixes.size > 1;

    grid.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;">'
      + sorted.map((img) => {
        const src = '/api/local/sample_file?name=' + encodeURIComponent(img.name);
        const displayName = img.name.replace(/\.[^.]+$/, '');
        const epoch = extractEpoch(img.name);
        const epochTag = epoch >= 0 ? 'Epoch ' + epoch : '';
        const prefix = extractPrefix(img.name);
        return '<div class="sample-thumb" onclick="openSampleLightbox(\'' + escapeHtml(img.name) + '\')" style="cursor:pointer;background:var(--bg-hover);border-radius:8px;overflow:hidden;transition:transform 0.15s;">'
          + '<div style="aspect-ratio:1;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#000;">'
          + '<img src="' + src + '" loading="lazy" style="width:100%;height:100%;object-fit:contain;">'
          + '</div>'
          + '<div style="padding:6px 8px;">'
          + '<div style="font-size:0.7rem;color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(img.name) + '">' + escapeHtml(displayName) + '</div>'
          + '<div style="display:flex;gap:6px;align-items:center;margin-top:2px;">'
          + (epochTag ? '<span style="font-size:0.62rem;color:var(--accent);">' + epochTag + '</span>' : '')
          + (showPrefix ? '<span style="font-size:0.58rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100px;" title="' + escapeHtml(prefix) + '">' + escapeHtml(prefix) + '</span>' : '')
          + '</div>'
          + '</div></div>';
      }).join('')
      + '</div>';
  }

  async function refreshSampleImages() {
    const grid = document.getElementById('samples-grid');
    if (!grid) return;
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">' + _ico('loader', 20) + ' 加载中...</div>';
    try {
      const resp = await api.getSampleImages();
      sampleCache = (resp && resp.data && resp.data.images) ? resp.data.images : [];
      renderSampleGrid(sampleCache);
    } catch (error) {
      grid.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">' + _ico('x-circle', 20) + ' 加载失败: ' + escapeHtml(error.message || '') + '</div>';
    }
  }

  function applySampleSort(sortValue) {
    sampleSort = sortValue;
    renderSampleGrid(sampleCache);
  }

  function applySampleFilter(keyword) {
    sampleFilter = keyword;
    renderSampleGrid(sampleCache);
  }

  function openSampleLightbox(fileName) {
    const lightbox = document.getElementById('sample-lightbox');
    const img = document.getElementById('sample-lightbox-img');
    const nameEl = document.getElementById('sample-lightbox-name');
    if (!lightbox || !img) return;

    const sorted = sortAndFilterSamples(sampleCache);
    lightboxIndex = sorted.findIndex((sample) => sample.name === fileName);
    img.src = '/api/local/sample_file?name=' + encodeURIComponent(fileName);
    if (nameEl) nameEl.textContent = fileName;
    lightbox.style.display = 'flex';
  }

  function lightboxNav(dir) {
    const sorted = sortAndFilterSamples(sampleCache);
    if (sorted.length === 0) return;
    lightboxIndex = (lightboxIndex + dir + sorted.length) % sorted.length;
    const target = sorted[lightboxIndex];
    const img = document.getElementById('sample-lightbox-img');
    const nameEl = document.getElementById('sample-lightbox-name');
    if (img) img.src = '/api/local/sample_file?name=' + encodeURIComponent(target.name);
    if (nameEl) nameEl.textContent = target.name;
  }

  function closeSampleLightbox(event) {
    if (event && event.target) {
      const tag = event.target.tagName;
      if (tag === 'IMG' || event.target.classList.contains('lb-arrow') || event.target.closest('.sample-lightbox-inner')) return;
    }
    const lightbox = document.getElementById('sample-lightbox');
    if (lightbox) lightbox.style.display = 'none';
    lightboxIndex = -1;
  }

  async function openOutputFolder() {
    try {
      await api.openFolder('output');
      showToast('✓ 已打开 output 文件夹');
    } catch (error) {
      showToast(error.message || '打开文件夹失败');
    }
  }

  function bindGlobals(target = window) {
    target.refreshSampleImages = refreshSampleImages;
    target.applySampleSort = applySampleSort;
    target.applySampleFilter = applySampleFilter;
    target.openSampleLightbox = openSampleLightbox;
    target.lightboxNav = lightboxNav;
    target.closeSampleLightbox = closeSampleLightbox;
    target.openOutputFolder = openOutputFolder;
  }

  function bindKeyboardShortcuts(doc = document) {
    doc.addEventListener('keydown', (event) => {
      const lightbox = doc.getElementById('sample-lightbox');
      if (!lightbox || lightbox.style.display === 'none') return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); lightboxNav(-1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); lightboxNav(1); }
      else if (event.key === 'Escape') { closeSampleLightbox(); }
    });
  }

  return {
    renderSamplesPanel,
    refreshSampleImages,
    applySampleSort,
    applySampleFilter,
    openSampleLightbox,
    lightboxNav,
    closeSampleLightbox,
    openOutputFolder,
    bindGlobals,
    bindKeyboardShortcuts,
  };
}
