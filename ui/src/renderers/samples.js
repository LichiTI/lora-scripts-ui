// renderers/samples.js — 训练预览图面板
// 含 5 个渲染函数 + 3 个 action（refreshSampleImages / applySampleSort / applySampleFilter）
// 状态在工厂闭包中维护：_sampleCache / _sampleSort / _sampleFilter
//
// 依赖（工厂注入）：api（调 getSampleImages）

import { escapeHtml, _ico } from '../utils/dom.js';

export function createSamplesRenderer({ api }) {
  // 闭包内状态
  let _sampleCache = [];
  let _sampleSort = 'time-desc';
  let _sampleFilter = '';

  function renderSamplesPanel() {
    return '<div class="train-pf-scroll" id="samples-panel">'
      + '<div class="train-pf-header"><div style="display:flex;align-items:center;gap:10px;">'
      + _ico('eye', 16) + ' <span style="font-size:0.9rem;font-weight:700;">训练预览图</span></div>'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      + '<button class="btn btn-outline btn-sm" type="button" onclick="refreshSampleImages()" style="font-size:0.68rem;">' + _ico('refresh-cw', 13) + ' 刷新</button>'
      + '<button class="btn btn-outline btn-sm" type="button" onclick="openOutputFolder()" style="font-size:0.68rem;">' + _ico('folder', 13) + ' 打开 output 文件夹</button>'
      + '</div></div>'
      // 工具栏：筛选 + 排序
      + '<div id="samples-toolbar" style="padding:8px 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
      + '<input type="text" id="sample-filter-input" placeholder="输入关键词筛选..." value="' + escapeHtml(_sampleFilter) + '" oninput="applySampleFilter(this.value)" style="flex:1;min-width:140px;max-width:300px;padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-panel);color:var(--text-main);font-size:0.78rem;outline:none;">'
      + '<select id="sample-sort-select" onchange="applySampleSort(this.value)" style="padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-panel);color:var(--text-main);font-size:0.78rem;cursor:pointer;">'
      + '<option value="time-desc"' + (_sampleSort === 'time-desc' ? ' selected' : '') + '>最新优先</option>'
     + '<option value="time-asc"' + (_sampleSort === 'time-asc' ? ' selected' : '') + '>最旧优先</option>'
      + '<option value="epoch-asc"' + (_sampleSort === 'epoch-asc' ? ' selected' : '') + '>Epoch 正序</option>'
 + '<option value="epoch-desc"' + (_sampleSort === 'epoch-desc' ? ' selected' : '') + '>Epoch 倒序</option>'
      + '<option value="name-asc"' + (_sampleSort === 'name-asc' ? ' selected' : '') + '>名称 A→Z</option>'
      + '<option value="name-desc"' + (_sampleSort === 'name-desc' ? ' selected' : '') + '>名称 Z→A</option>'
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

  function _extractEpoch(name) {
    var m = name.match(/_e(\d+)_/);
    return m ? parseInt(m[1]) : -1;
  }

  function _extractPrefix(name) {
    //提取训练名称前缀（epoch 之前的部分）
    var m = name.match(/^(.+?)_e\d+_/);
    return m ? m[1]: name.replace(/\.[^.]+$/, '');
  }

  function _sortAndFilterSamples(images) {
    var filtered = images;
    if (_sampleFilter) {
      var kw = _sampleFilter.toLowerCase();
      filtered = images.filter(function(img) { return img.name.toLowerCase().includes(kw); });
    }
    var sorted = filtered.slice();
    switch (_sampleSort) {
      case 'time-asc': sorted.sort(function(a, b) { return a.mtime - b.mtime; }); break;
      case 'time-desc': sorted.sort(function(a, b) { return b.mtime - a.mtime; }); break;
      case 'epoch-asc': sorted.sort(function(a, b) { return _extractEpoch(a.name) - _extractEpoch(b.name) || a.name.localeCompare(b.name); }); break;
      case 'epoch-desc': sorted.sort(function(a, b) { return _extractEpoch(b.name) - _extractEpoch(a.name) || a.name.localeCompare(b.name); }); break;
      case 'name-asc': sorted.sort(function(a, b) { return a.name.localeCompare(b.name); }); break;
      case 'name-desc': sorted.sort(function(a, b) { return b.name.localeCompare(a.name); }); break;
     default: sorted.sort(function(a, b) { return b.mtime - a.mtime; });
    }
    return sorted;
  }

  function _renderSampleGrid(images) {
    var grid = document.getElementById('samples-grid');
    var badge = document.getElementById('sample-count-badge');
    if (!grid) return;

    var sorted = _sortAndFilterSamples(images);
    if (badge) {
      var totalStr = images.length + ' 张';
      if (_sampleFilter && sorted.length !== images.length) {
        badge.textContent = '显示 ' + sorted.length + ' / ' + totalStr;
      } else {
        badge.textContent = totalStr;
      }
    }

    if (sorted.length === 0) {
      if (_sampleFilter) {
        grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">'
          + '未找到匹配「' + escapeHtml(_sampleFilter) + '」的图片</div>';
      } else {
        grid.innerHTML = '<div style="text-align:center;padding:48px 20px;color:var(--text-muted);">'
          + _ico('folder', 32) + '<br><br>'
          + '<div style="font-size:0.85rem;">暂无预览图</div>'
          + '<div style="font-size:0.75rem;margin-top:4px;">训练时启用「训练预览图」后，生成的图片会显示在这里</div>'
          + '</div>';
      }
      return;
    }

    // 检测有多少个不同的训练前缀（用于显示分组标签）
    var prefixes = new Set(sorted.map(function(img) { return _extractPrefix(img.name); }));
    var showPrefix = prefixes.size > 1;

    grid.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;">'
      + sorted.map(function(img) {
        var src = '/api/local/sample_file?name=' + encodeURIComponent(img.name);
        var displayName = img.name.replace(/\.[^.]+$/, '');
        var epoch = _extractEpoch(img.name);
        var epochTag = epoch >= 0 ? 'Epoch ' + epoch : '';
        var prefix = _extractPrefix(img.name);
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

  // ---- actions ----
  async function refreshSampleImages() {
    var grid = document.getElementById('samples-grid');
    if (!grid) return;
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">' + _ico('loader', 20) + ' 加载中...</div>';
    try {
      var resp = await api.getSampleImages();
      _sampleCache = (resp && resp.data && resp.data.images) ? resp.data.images : [];
      _renderSampleGrid(_sampleCache);
    } catch(e) {
      grid.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">' + _ico('x-circle', 20) + ' 加载失败: ' + escapeHtml(e.message || '') + '</div>';
    }
  }

  function applySampleSort(sortValue) {
    _sampleSort = sortValue;
    _renderSampleGrid(_sampleCache);
  }

  function applySampleFilter(keyword) {
    _sampleFilter = keyword;
    _renderSampleGrid(_sampleCache);
  }

  // 暴露仅读访问器（供 lightbox 所需）
  function getSortedSamples() {
    return _sortAndFilterSamples(_sampleCache);
  }

  return {
    renderSamplesPanel,
    refreshSampleImages,
    applySampleSort,
applySampleFilter,
    getSortedSamples,
  };
}
