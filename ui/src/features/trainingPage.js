import { $, escapeHtml, icon as _ico } from '../utils/dom.js';
import {
  collectIncrementalTrainingLogLines,
  createTrainingLogCursor,
  mergeTrainingLogLines,
  renderLogLines,
} from '../utils/logRendering.js';
import { formatDuration } from '../utils/trainingMetrics.js';
import { buildSysMonitorHTML } from './systemMonitorPanel.js';

export function createTrainingPageController({
  api,
  state,
  renderView,
  renderSlot,
  buildRunConfig,
  renderSamplesPanel,
  refreshSampleImages,
  renderTrainingSummaryHTML,
  renderSummaryCard,
  collectTrainingMetrics,
  resetTrainingMetrics,
  syncFooterAction,
  showToast,
}) {
  /** Render dataset visualization sub-tab */
  function renderPreflightPanel() {
    var da = state.datasetAnalysis;
    var loading = state.loading.preflight;
    var dataDir = state.config.train_data_dir || '';

    if (!da && !loading) {
      return '<div class="train-pf-empty"><div style="text-align:center;padding:48px 20px;">'
        + _ico('folder', 40) + '<br><br>'
        + '<div style="font-size:0.88rem;color:var(--text-main);font-weight:600;margin-bottom:6px;">\u6570\u636e\u96c6\u9884\u89c8</div>'
        + '<div style="font-size:0.76rem;color:var(--text-muted);margin-bottom:16px;max-width:360px;">'
        + (dataDir ? escapeHtml(dataDir) : '\u8bf7\u5148\u5728\u914d\u7f6e\u9875\u8bbe\u7f6e train_data_dir') + '</div>'
        + '<button class="btn btn-primary btn-sm" type="button" onclick="scanDataset()" style="padding:8px 24px;"'
        + (dataDir ? '' : ' disabled') + '>\u626b\u63cf\u6570\u636e\u96c6</button></div></div>';
    }
    if (loading) {
      return '<div class="train-pf-empty"><div style="text-align:center;padding:48px 20px;">'
        + _ico('loader', 24) + '<br><br><div style="font-size:0.82rem;color:var(--text-muted);">\u6b63\u5728\u626b\u63cf\u6570\u636e\u96c6...</div></div></div>';
    }

    var s = da.summary || {};
    var folders = da.folders || [];
    var topReso = da.top_resolutions || [];
    var batchSize = Number(state.config.train_batch_size) || 1;
    var epochs = Number(state.config.max_train_epochs) || 1;
    var estSteps = Math.ceil((s.effective_image_count || 0) / batchSize) * epochs;

    var metricsHtml = '<div class="train-pf-metrics">'
      + _pfMetric('\u56fe\u7247\u603b\u6570', s.image_count || 0, '')
      + _pfMetric('\u6709\u6548\u56fe\u7247 (\u00d7Repeats)', s.effective_image_count || 0, '')
      + _pfMetric('\u9884\u4f30\u6b65\u6570', estSteps.toLocaleString(), 'accent')
      + '</div>';

    // Resolution bar chart
    var resoHtml = '';
    if (topReso.length > 0) {
      var maxCount = Math.max.apply(null, topReso.map(function(r) { return r.count || 0; }));
      var bars = topReso.slice(0, 6).map(function(r) {
        var cnt = r.count || 0;
        var pct = maxCount > 0 ? Math.round(cnt / maxCount * 100) : 0;
        return '<div class="train-reso-bar-col"><div class="train-reso-count">' + cnt
          + '</div><div class="train-reso-bar" style="height:' + pct + '%"></div>'
          + '<div class="train-reso-label">' + escapeHtml(r.name || '') + '</div></div>';
      }).join('');
      resoHtml = '<div class="train-pf-card"><div class="train-pf-card-hdr"><span>\u5206\u8fa8\u7387\u5206\u5e03</span>'
        + '<span class="train-tag">' + topReso.length + ' \u4e2a\u6876</span></div>'
        + '<div class="train-reso-chart">' + bars + '</div></div>';
    }

    // Diagnostics
    var diags = [];
    var alphaCount = s.alpha_capable_image_count || 0;
    if (s.caption_count > 0) diags.push({ok: true, text: '\u6807\u6ce8\u6587\u4ef6\u5df2\u627e\u5230 (' + (s.caption_coverage * 100).toFixed(0) + '% \u8986\u76d6\u7387)'});
    else diags.push({ok: false, warn: true, text: '\u672a\u627e\u5230\u6807\u6ce8\u6587\u4ef6'});
    if (s.broken_image_count === 0) diags.push({ok: true, text: '\u65e0\u635f\u574f\u56fe\u7247'});
    else diags.push({ok: false, text: s.broken_image_count + ' \u5f20\u635f\u574f\u56fe\u7247'});
    if (alphaCount > 0) diags.push({ok: false, warn: true, text: alphaCount + ' \u5f20\u56fe\u7247\u542b\u900f\u660e\u901a\u9053 (PNG/WebP)\uff0c\u53ef\u80fd\u5f71\u54cd\u8bad\u7ec3\u7ed3\u679c'});
    else diags.push({ok: true, text: '\u65e0\u900f\u660e\u901a\u9053\u56fe\u7247'});
    if (s.images_without_caption_count > 0) diags.push({ok: false, warn: true, text: s.images_without_caption_count + ' \u5f20\u56fe\u7247\u7f3a\u5c11\u6807\u6ce8'});
    if (s.empty_caption_count > 0) diags.push({ok: false, warn: true, text: s.empty_caption_count + ' \u4e2a\u7a7a\u6807\u6ce8\u6587\u4ef6'});
    if (diags.length === 0) diags.push({ok: true, text: '\u5168\u90e8\u68c0\u67e5\u901a\u8fc7'});


    var diagHtml = '<div class="train-pf-card"><div class="train-pf-card-hdr"><span>\u8bca\u65ad</span></div>'
      + '<ul class="train-diag-list">' + diags.map(function(d) {
          var icon = d.ok ? _ico('check-circle', 15) : (d.warn ? _ico('alert-tri', 15) : _ico('x-circle', 15));
          var color = d.ok ? '#22c55e' : (d.warn ? '#f59e0b' : '#ef4444');
          return '<li style="color:' + color + ';">' + icon + ' <span style="color:var(--text-main);">' + escapeHtml(d.text) + '</span></li>';
        }).join('') + '</ul></div>';

    // Folder table with expandable image preview
    var tableHtml = '<div class="train-pf-table-wrap">'
      + '<div class="train-pf-table-hdr"><span class="train-pf-card-hdr"><span>\u6587\u4ef6\u5939\u7ed3\u6784</span></span></div>'
      + '<div class="train-pf-table-head"><div>\u8def\u5f84</div><div>\u6982\u5ff5\u6807\u7b7e</div><div style="text-align:right;">Repeats</div><div style="text-align:right;">\u56fe\u7247\u6570</div></div>';
    tableHtml += folders.map(function(f, idx) {
      var tag = f.name.replace(/^\d+_/, '');
      var repeats = f.repeats || 0;
      var fPath = f.path || '';
      return '<div class="train-pf-table-row" style="cursor:pointer;" onclick="toggleFolderPreview(' + idx + ',this)">'
        + '<div class="train-pf-folder-name">' + _ico('folder', 14) + ' ' + escapeHtml(f.name) + '</div>'
        + '<div class="train-pf-tag" id="pf-tag-' + idx + '">' + escapeHtml(tag) + '</div>'
        + '<div style="text-align:right;font-variant-numeric:tabular-nums;">' + repeats + '</div>'
        + '<div style="text-align:right;font-variant-numeric:tabular-nums;">' + f.image_count + '</div>'
        + '</div>'
        + '<div class="train-pf-thumbs" id="pf-thumbs-' + idx + '" data-folder="' + escapeHtml(fPath) + '" style="display:none;"></div>';
    }).join('');
    tableHtml += '</div>';

    return '<div class="train-pf-scroll">'
      + '<div class="train-pf-header"><div style="display:flex;align-items:center;gap:10px;">'
      + _ico('bar-chart', 16) + ' <span style="font-size:0.9rem;font-weight:700;">\u6570\u636e\u96c6\u9884\u89c8</span></div>'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      + '<span style="font-size:0.68rem;color:var(--text-muted);">' + escapeHtml(dataDir) + '</span>'
      + '<button class="btn btn-outline btn-sm" type="button" onclick="scanDataset()" style="font-size:0.68rem;">\u91cd\u65b0\u626b\u63cf</button>'
      + '</div></div>'
      + metricsHtml
      + '<div class="train-pf-row2">' + resoHtml + diagHtml + '</div>'
      + tableHtml
      + '</div>';
  }

  function _pfMetric(label, value, type) {
    var color = type === 'accent' ? 'var(--accent)' : (type === 'ok' ? '#22c55e' : (type === 'warn' ? '#f59e0b' : (type === 'err' ? '#ef4444' : 'var(--text-main)')));
    return '<div class="train-pf-metric"><div class="train-pf-metric-label">' + label + '</div>'
      + '<div class="train-pf-metric-val" style="color:' + color + ';">' + value + '</div></div>';
  }

  function switchTrainTab(tab) {
    state.trainSubTab = tab;
    if (state.activeModule === 'training') {
      renderView('training');
      if (tab === 'preflight' && !state.datasetAnalysis && !state.loading.preflight && state.config.train_data_dir) {
        scanDataset();
      }
      if (tab === 'samples') {
        setTimeout(refreshSampleImages, 100);
      }
    }
  };

  async function scanDataset() {
    var dataDir = state.config.train_data_dir;
    if (!dataDir) { showToast('\u8bf7\u5148\u8bbe\u7f6e train_data_dir'); return; }
    state.loading.preflight = true;
    if (state.activeModule === 'training') renderView('training');
    try {
      var resp = await api.analyzeDataset({ path: dataDir, caption_extension: state.config.caption_extension || '.txt' });
      if (resp.status === 'success' && resp.data) {
        state.datasetAnalysis = resp.data;
      } else {
        showToast(resp.message || '\u6570\u636e\u96c6\u626b\u63cf\u5931\u8d25');
      }
    } catch(e) {
      showToast(e.message || '\u6570\u636e\u96c6\u626b\u63cf\u5931\u8d25');
    } finally {
      state.loading.preflight = false;
      if (state.activeModule === 'training') renderView('training');
    }
  };

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
    panel.innerHTML = '<span style="font-size:0.72rem;color:var(--text-muted);padding:8px;">\u52a0\u8f7d\u4e2d...</span>';
    try {
      var resp = await api.listDatasetImages(folder, 6);
      var images = (resp && resp.data && resp.data.images) ? resp.data.images : [];
      var total = (resp && resp.data) ? resp.data.total : 0;
      if (images.length === 0) {
        panel.innerHTML = '<span style="font-size:0.72rem;color:var(--text-muted);padding:8px;">\u65e0\u56fe\u7247</span>';
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
      panel.innerHTML = '<span style="font-size:0.72rem;color:#ef4444;padding:8px;">\u52a0\u8f7d\u5931\u8d25</span>';
    }
  };

  async function runTrainingPreflight() {
    state.loading.preflight = true;
    if (state.activeModule === 'training') renderView('training');
    try {
      var response = await api.runPreflight(buildRunConfig(state.config, state.activeTrainingType));
      state.preflight = response.status === 'success' ? response.data : { can_start: false, errors: [response.message || 'Failed'], warnings: [], notes: [] };
    } catch(e) {
      state.preflight = { can_start: false, errors: [e.message || 'Failed'], warnings: [], notes: [] };
    } finally {
      state.loading.preflight = false;
      if (state.activeModule === 'training') renderView('training');
      else if (state.activeModule === 'config') renderView('config');
    }
  };



  function renderTraining(container) {
    var running = state.tasks.filter(function(t) { return t.status === 'RUNNING'; });
    var finished = state.tasks.filter(function(t) { return t.status === 'FINISHED'; });
    var terminated = state.tasks.filter(function(t) { return t.status === 'TERMINATED'; });
    var lastTask = state.tasks[state.tasks.length - 1];
    var hasRunning = running.length > 0;
    var m = state.trainingMetrics;
    var curTask = running[0] || lastTask;
    var taskIdShort = curTask ? curTask.id.slice(0, 8).toUpperCase() : '--------';
    var logSnapshot = state.trainingLogSnapshot || {};

    // Compute live metrics for header
    var curStep = m.lastStep || 0;
    var totalSteps = m.totalSteps || 0;
    var lastEp = m.epochs.length > 0 ? m.epochs[m.epochs.length - 1] : null;
    var epochStr = lastEp ? ('Epoch ' + lastEp.epoch + '/' + lastEp.total) : '';
    var curSpeed = m.speeds.length > 0 ? m.speeds[m.speeds.length - 1].itPerSec : 0;
    var remainSec = (curSpeed > 0 && totalSteps > curStep) ? Math.round((totalSteps - curStep) / curSpeed) : 0;
    var remainStr = remainSec > 0 ? formatDuration(remainSec * 1000) : '--:--';
    var curLoss = m.losses.length > 0 ? m.losses[m.losses.length - 1].loss : 0;
    var prevLoss = m.losses.length > 1 ? m.losses[m.losses.length - 2].loss : curLoss;
    var lossDeltaPct = prevLoss > 0 ? ((curLoss - prevLoss) / prevLoss * 100) : 0;
    var lossArrow = lossDeltaPct < 0 ? _ico('trending-down', 12) : (lossDeltaPct > 0 ? _ico('trending-up', 12) : '');
    var lossArrowColor = lossDeltaPct < 0 ? '#22c55e' : (lossDeltaPct > 0 ? '#ef4444' : 'var(--text-dim)');

    // Status indicator
    var statusDot = '', statusText = '';
    if (hasRunning) {
      statusDot = '<span style="width:8px;height:8px;border-radius:50%;background:var(--accent);display:inline-block;animation:pulse-dot 1.5s ease-in-out infinite;"></span>';
      statusText = '<span style="font-family:monospace;font-size:0.82rem;font-weight:700;color:var(--accent);">SESSION_' + taskIdShort + '</span>';
    } else if (state.trainingFailed) {
      statusDot = '<span style="width:8px;height:8px;border-radius:50%;background:#ef4444;display:inline-block;"></span>';
      statusText = '<span style="font-family:monospace;font-size:0.82rem;font-weight:700;color:#ef4444;">FAILED</span>';
    } else if (finished.length > 0) {
      statusDot = '<span style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;"></span>';
      statusText = '<span style="font-family:monospace;font-size:0.82rem;font-weight:700;color:#22c55e;">COMPLETED</span>';
    } else {
      statusDot = '<span style="width:8px;height:8px;border-radius:50%;background:var(--text-muted);display:inline-block;"></span>';
      statusText = '<span style="font-family:monospace;font-size:0.82rem;color:var(--text-muted);">IDLE</span>';
    }

    // Mixed precision tag
    var precisionTag = state.config.mixed_precision ? state.config.mixed_precision.toUpperCase() : 'FP32';

    // GPU info
    var gpuName = '\u68c0\u6d4b\u4e2d...';
    if (state.runtime && state.runtime.cards && state.runtime.cards.length > 0) {
      var card = state.runtime.cards[0];
      gpuName = (typeof card === 'string') ? card : (card.name || 'GPU');
    }

    // Loss sparkline SVG
    var sparkSvg = '';
    if (m.losses.length >= 2) {
      var pts = m.losses.slice(-50);
      var maxL = Math.max.apply(null, pts.map(function(p) { return p.loss; }));
      var minL = Math.min.apply(null, pts.map(function(p) { return p.loss; }));
      var range = maxL - minL || 0.001;
      var pathParts = [];
      for (var pi = 0; pi < pts.length; pi++) {
        var px = (pi / (pts.length - 1)) * 100;
        var py = 100 - ((pts[pi].loss - minL) / range) * 90 - 5;
        pathParts.push((pi === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1));
      }
      var pathD = pathParts.join(' ');
      sparkSvg = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;">'
        + '<defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity="0.3"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>'
        + '<path d="' + pathD + '" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>'
        + '<path d="' + pathD + ' L100 100 L0 100 Z" fill="url(#lg)"/>'
        + '</svg>';
    }

    // Active params
    var networkAlgo = state.config.network_module || '';
    // Anima 使用 lora_type 字段而非 network_module
    if (!networkAlgo && state.config.lora_type) {
      var lt = state.config.lora_type;
      if (lt === 'lora') networkAlgo = 'LoRA (Anima)';
      else if (lt === 'tlora') networkAlgo = 'T-LoRA (Anima)';
      else if (lt === 'lokr') networkAlgo = 'LoKr (Anima)';
    }
    if (networkAlgo === 'lycoris.kohya' && state.config.lycoris_algo) {
      networkAlgo = 'LyCORIS / ' + state.config.lycoris_algo;
    } else if (networkAlgo === 'networks.lora') { networkAlgo = 'LoRA'; }
    else if (networkAlgo === 'networks.lora_flux') { networkAlgo = 'LoRA (FLUX)'; }
    else if (networkAlgo === 'networks.tlora_flux') { networkAlgo = 'T-LoRA (FLUX)'; }
    else if (networkAlgo === 'networks.oft_flux') { networkAlgo = 'OFT (FLUX)'; }
    else if (networkAlgo === 'networks.lora_anima') { networkAlgo = 'LoRA (Anima)'; }
    else if (networkAlgo === 'networks.tlora_anima') { networkAlgo = 'T-LoRA (Anima)'; }
    else if (networkAlgo === 'networks.lora_sd3') { networkAlgo = 'LoRA (SD3)'; }
    else if (networkAlgo === 'networks.lora_lumina') { networkAlgo = 'LoRA (Lumina)'; }
    else if (networkAlgo === 'networks.lora_hunyuan_image') { networkAlgo = 'LoRA (HunyuanImage)'; }
    else if (networkAlgo === 'networks.dylora') { networkAlgo = 'DyLoRA'; }
    // Newbie 使用 adapter_type 字段
    if (!networkAlgo && state.config.adapter_type && state.config.model_train_type === 'newbie-lora') {
      var at = state.config.adapter_type;
      if (at === 'lora') networkAlgo = 'LoRA (Newbie)';
      else if (at === 'lokr') networkAlgo = 'LoKr (Newbie)';
    }
    var cfgParams = [
      ['\u7f51\u7edc\u7b97\u6cd5', networkAlgo || '\u2014'],
      ['\u5b66\u4e60\u7387\u8c03\u5ea6\u5668', state.config.lr_scheduler || '\u2014'],
      ['\u4f18\u5316\u5668', state.config.optimizer_type || '\u2014'],
      ['\u6279\u91cf\u5927\u5c0f', state.config.train_batch_size || '\u2014'],
      ['\u5b66\u4e60\u7387', state.config.learning_rate || '\u2014'],
      ['\u7f51\u7edc\u7ef4\u5ea6', state.config.network_dim || '\u2014'],
      ['\u7f51\u7edc Alpha', state.config.network_alpha || '\u2014'],
      ['\u8bad\u7ec3\u5206\u8fa8\u7387', state.config.resolution || '\u2014'],
      ['\u6700\u5927\u8f6e\u6570', state.config.max_train_epochs || '\u2014'],
      ['\u4fdd\u5b58\u95f4\u9694', state.config.save_every_n_epochs || '\u2014'],
      ['CLIP \u8df3\u8fc7\u5c42', state.config.clip_skip || '\u2014'],
      ['\u968f\u673a\u79cd\u5b50', state.config.seed || '\u2014'],
    ];
    var paramsHtml = cfgParams.map(function(p) {
      return '<div class="train-param-row">'
        + '<span class="train-param-key">'+ p[0] + '</span>'
        + '<span class="train-param-val">'+ escapeHtml(String(p[1])) + '</span>'
        + '</div>';
    }).join('');

    container.innerHTML = ''
    + '<div class="train-dashboard">'
    + '<div class="train-exec-header">'
    +   '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">'
    +     '<div style="display:flex;align-items:center;gap:8px;">' + statusDot + statusText + '</div>'
    +     '<span class="train-hdr-sep"></span>'
    +     '<span class="train-hdr-label">\u5f53\u524d\u6b65\u6570: <span class="train-hdr-val">' + curStep.toLocaleString() + ' / ' + (totalSteps > 0 ? totalSteps.toLocaleString() : '--') + '</span></span>'
    +     '<span class="train-hdr-label">\u5269\u4f59\u65f6\u95f4: <span class="train-hdr-val">' + remainStr + '</span></span>'
    +     (epochStr ? '<span class="train-hdr-label">' + epochStr + '</span>' : '')
    +   '</div>'
    +   '<div style="display:flex;align-items:center;gap:8px;">'
    +     '<span class="train-tag train-tag-accent">' + precisionTag + '</span>'
    +     (hasRunning && curTask ? '<span class="train-tag">PID: ' + escapeHtml(curTask.id.slice(0, 8)) + '</span>' : '')
    +   '</div>'
    + '</div>'

    // Tab bar
    + '<div class="train-tabs">'
    +   '<button class="train-tab' + (state.trainSubTab === 'monitor' ? ' active' : '') + '" onclick="switchTrainTab(\'monitor\')">' + _ico('terminal', 14) + ' \u76d1\u63a7</button>'
    +   '<button class="train-tab' + (state.trainSubTab === 'samples' ? ' active' : '') + '" onclick="switchTrainTab(\'samples\')">' + _ico('eye', 14) + ' \u9884\u89c8</button>'
    +   '<button class="train-tab' + (state.trainSubTab === 'preflight' ? ' active' : '') + '" onclick="switchTrainTab(\'preflight\')">' + _ico('check-circle', 14) + ' \u9884\u68c0</button>'
    + '</div>'

    // Body: conditional on sub-tab
    + (state.trainSubTab === 'preflight' ? renderPreflightPanel() : '')
    + (state.trainSubTab === 'samples' ? renderSamplesPanel() : '')
    + (state.trainSubTab === 'monitor' ? (
    '<div class="train-body">'
    // ---- Left: Terminal ----
    +   '<div class="train-logs-area">'
    +     '<div class="train-panel-header">'
    +       '<span class="train-panel-title">' + _ico('terminal', 14) + ' \u7cfb\u7edf\u6267\u884c\u65e5\u5fd7</span>'
    +       '<div style="display:flex;gap:8px;align-items:center;">'
    +         '<label style="display:flex;align-items:center;gap:4px;font-size:0.7rem;color:var(--text-muted);cursor:pointer;">'
    +           '<input type="checkbox" id="training-log-autoscroll" checked style="width:13px;height:13px;"> \u81ea\u52a8\u6eda\u52a8'
    +         '</label>'
    +         '<button class="btn btn-outline btn-sm" type="button" onclick="refreshTrainingLog()" style="font-size:0.68rem;padding:2px 10px;">\u5237\u65b0</button>'
    +       '</div>'
    +     '</div>'
    +     '<div id="training-log-container" class="train-terminal">'
    +       (hasRunning
              ? (logSnapshot.html && logSnapshot.taskId === curTask.id
                  ? logSnapshot.html
                  : '<span style="color:var(--text-muted);">' + _ico('loader', 14) + ' \u6b63\u5728\u52a0\u8f7d\u8bad\u7ec3\u8f93\u51fa...</span>')
              : (logSnapshot.html
                  ? logSnapshot.html
                  : '<span style="color:var(--text-muted);">\u6682\u65e0\u8bad\u7ec3\u4efb\u52a1\u8fd0\u884c\u4e2d\u3002\u70b9\u51fb\u300c\u5f00\u59cb\u8bad\u7ec3\u300d\u542f\u52a8\u540e\uff0c\u8f93\u51fa\u5c06\u5728\u6b64\u5b9e\u65f6\u663e\u793a\u3002</span>'))
    +     '</div>'
    +   '</div>'

    // ---- Right: Side Panel ----
    +   '<div class="train-side-panel">'

    // Live Loss
    +     '<div class="train-side-section">'
    +       '<div class="train-panel-title">\u5b9e\u65f6 Loss</div>'
    +       '<div style="display:flex;justify-content:space-between;align-items:flex-end;">'
    +         '<span class="train-loss-big">' + (curLoss > 0 ? curLoss.toFixed(4) : '\u2014') + '</span>'
    +         '<span class="train-loss-delta" style="color:' + lossArrowColor + ';">' + lossArrow + ' ' + (lossDeltaPct !== 0 ? (lossDeltaPct > 0 ? '+' : '') + lossDeltaPct.toFixed(1) + '%' : '') + '</span>'
    +       '</div>'
    +       '<div class="train-chart-box">'
    +         (sparkSvg || '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:0.72rem;">\u7b49\u5f85\u6570\u636e...</div>')
    +       '</div>'
    +       (m.losses.length > 0 ? '<div class="train-chart-axis"><span>Step 0</span><span>Step ' + curStep + '</span></div>' : '')
    +     '</div>'

    // Hardware
    +     '<div class="train-side-section">'
    +       '<div class="train-panel-title">' + _ico('activity', 14) + ' \u786c\u4ef6 / \u8d44\u6e90\u76d1\u63a7</div>'
    +       '<div class="train-hw-card">'
    +         '<div class="train-hw-row"><span class="hw-label">\u663e\u5361</span><span class="hw-value">' + escapeHtml(gpuName) + '</span></div>'
    +         '<div class="train-hw-row"><span class="hw-label">\u901f\u5ea6</span><span id="train-live-speed" class="hw-value-accent">' + (curSpeed > 0 ? curSpeed.toFixed(2) + ' it/s' : '\u2014') + '</span></div>'
    +         '<div class="train-hw-row"><span class="hw-label">\u8fd0\u884c\u73af\u5883</span><span class="hw-value">' + (state.runtime && state.runtime.runtime ? state.runtime.runtime.environment : 'standard') + '</span></div>'
    +         '<div class="train-hw-row"><span class="hw-label">\u7cbe\u5ea6</span><span class="hw-value">' + precisionTag + '</span></div>'
    +       '</div>'
    +       '<div id="sys-monitor-panel" class="sysmon-panel">' + buildSysMonitorHTML(state.sysMonitor) + '</div>'
    +       '</div>'

    // Active params
    +     '<div class="train-side-section">'
    +       '<div class="train-panel-title">' + _ico('settings', 14) + ' \u5f53\u524d\u53c2\u6570</div>'
    +       '<div>' + paramsHtml + '</div>'
    +     '</div>'

    +     renderSlot('training.runtime_widget')

    +   '</div>'
    + '</div>'

    // Training summary + Task history (monitor only)
    + renderTrainingSummaryHTML()
    + '<div class="train-history-section">'
    +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
    +     '<div class="train-panel-title">' + _ico('clock', 14) + ' \u4efb\u52a1\u5386\u53f2</div>'
    +     (state.tasks.length > 0 ? '<button class="btn btn-outline btn-sm" style="font-size:0.7rem;padding:2px 8px;" type="button" onclick="clearAllTaskHistory()">' + _ico('trash-2', 12) + ' \u6e05\u7a7a\u5386\u53f2</button>' : '')
    +   '</div>'
    +   (state.tasks.length === 0
        ? '<p style="color:var(--text-muted);font-size:0.78rem;">\u6682\u65e0\u4efb\u52a1\u8bb0\u5f55</p>'
        : state.tasks.slice().reverse().map(function(task) {
      var statusMap = { RUNNING: _ico('loader') + ' 运行中', FINISHED: _ico('check-circle') + ' 已完成', TERMINATED: _ico('stop-circle') + ' 已终止', CREATED: _ico('clock') + ' 已创建' };
      var statusColor = { RUNNING: '#f59e0b', FINISHED: '#22c55e', TERMINATED: '#ef4444', CREATED: 'var(--text-dim)' };
      var canScore = task.status === 'FINISHED';
      var hasCached = canScore && !!(state.taskSummaries[task.id] && state.taskSummaries[task.id]._v >= 2);
      var isNotRunning = task.status !== 'RUNNING';
      var badge = hasCached ? _ico('bar-chart', 14) : (canScore && !task._recentlyFinished ? '点击评分' : '');
      var taskLabel = task.output_name || task.id.substring(0, 8);
      var timeStr = task.created_at || '';
      var typeTag = task.training_type_label || task.model_train_type || '';
      var metaParts = [timeStr, task.resolution ? ('分辨率 ' + task.resolution) : '', task.network_dim ? ('dim ' + task.network_dim) : ''].filter(Boolean);
      var metaStr = metaParts.join(' · ');
      return '<div style="border-bottom:1px solid var(--border);padding:5px 0;" id="task-row-' + task.id + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;">'
        + '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;' + (canScore ? 'cursor:pointer;' : '') + '" ' + (canScore ? 'onclick="showTaskSummary(\'' + task.id + '\')"' : '') + '>'
        + '<span style="font-size:0.78rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(taskLabel) + '</span>'
        + (typeTag ? '<span style="font-size:0.65rem;color:var(--text-muted);background:var(--bg-hover);padding:1px 5px;border-radius:3px;">' + escapeHtml(typeTag) + '</span>' : '')
        + (badge ? '<span style="font-size:0.68rem;color:var(--accent);opacity:0.7;">' + badge + '</span>' : '')
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">'
        + '<span style="color:' + (statusColor[task.status] || 'var(--text-dim)') + ';font-weight:600;font-size:0.78rem;">' + (statusMap[task.status] || task.status) + '</span>'
        + (isNotRunning ? '<button class="btn-icon" style="opacity:0.5;font-size:0.7rem;padding:2px;" type="button" onclick="event.stopPropagation();deleteTaskHistory(\'' + task.id + '\')" title="删除记录">' + _ico('x', 12) + '</button>' : '')

        + '</div>'
        + '</div>'
        + (metaStr ? '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">' + escapeHtml(metaStr) + '</div>' : '')
        + '<div id="task-summary-' + task.id + '" style="display:none;" data-loaded="' + (hasCached ? 'true' : 'false') + '">' + (hasCached ? renderSummaryCard(state.taskSummaries[task.id]) : '') + '</div>'
        + '</div>';
    }).join(''))
    + '</div>'

    + '</div>'
    ) : '') // end monitor conditional
    + '</div>'; // close train-dashboard

    syncFooterAction();
    if (hasRunning) {
      startTrainingLogPolling();
      startSysMonitorPolling();
    } else {
      _pollSystemMonitor(); // 即使没有训练也获取一次当前状态
    }


  }



  let _trainingLogPollTimer = null;
  let _trainingLogCursor = createTrainingLogCursor();

  function _resetTrainingLogCursor(taskId = '') {
    _trainingLogCursor = createTrainingLogCursor(taskId);
  }

  function startTrainingLogPolling() {
    if (_trainingLogPollTimer) return;
    _trainingLogPollTimer = setInterval(() => {
      let target = null;
      if (state.activeTrainingTaskId) {
        target = state.tasks.find((t) => t.id === state.activeTrainingTaskId || t.task_id === state.activeTrainingTaskId) || null;
      }
      if (!target) {
        const running = state.tasks.filter((t) => t.status === 'RUNNING');
        target = running[0] || null;
      }
      if (!target || target.status !== 'RUNNING') {
        clearInterval(_trainingLogPollTimer);
        _trainingLogPollTimer = null;
        // 最后刷一次
        refreshTrainingLog(target && (target.id || target.task_id));
        return;
      }
      refreshTrainingLog(target.id || target.task_id);
    }, 2000);
  }

  // ── System Monitor Polling ─────────────────────────────
  let _sysMonitorTimer = null;

  async function _pollSystemMonitor() {
    try {
      var resp = await api.getSystemMonitor();
      if (resp && resp.data) {
        state.sysMonitor = resp.data;
        _renderSysMonitorInPlace();
      }
    } catch (e) { /* silent */ }
  }

  function startSysMonitorPolling() {
    if (_sysMonitorTimer) return;
    _pollSystemMonitor();
    _sysMonitorTimer = setInterval(() => {
      if (!state.tasks.some((t) => t.status === 'RUNNING')) {
        clearInterval(_sysMonitorTimer);
        _sysMonitorTimer = null;
        _pollSystemMonitor(); // final update
        return;
      }
      _pollSystemMonitor();
    }, 3000);
  }

  function _renderSysMonitorInPlace() {
    var el = document.getElementById('sys-monitor-panel');
    if (!el) return;
    el.innerHTML = buildSysMonitorHTML(state.sysMonitor);
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
  };

  async function refreshTrainingLog(taskId = '') {
    const running = state.tasks.filter((t) => t.status === 'RUNNING');
    const explicitTarget = taskId
      ? state.tasks.find((t) => t.id === taskId || t.task_id === taskId) || { id: taskId, task_id: taskId, status: 'FINISHED' }
      : null;
    const cursorTarget = _trainingLogCursor.taskId ? state.tasks.find((t) => t.id === _trainingLogCursor.taskId || t.task_id === _trainingLogCursor.taskId) : null;
    const activeTarget = state.activeTrainingTaskId ? state.tasks.find((t) => t.id === state.activeTrainingTaskId || t.task_id === state.activeTrainingTaskId) : null;
    const target = explicitTarget || activeTarget || running[0] || cursorTarget || state.tasks[state.tasks.length - 1];
    if (!target) return;

    const targetId = target.id || target.task_id;
    if (!targetId) return;
    if (_trainingLogCursor.taskId && _trainingLogCursor.taskId !== targetId) {
      resetTrainingMetrics({ keepLogSnapshot: target.status !== 'RUNNING' });
    }

    try {
      const resp = await api.getTaskOutput(targetId, 1000);
      const lines = resp?.data?.lines || [];
      const total = Number(resp?.data?.total || 0) || 0;
      const liveLine = resp?.data?.live_line || '';
      const renderedLines = mergeTrainingLogLines(lines, liveLine);
      const incrementalResult = collectIncrementalTrainingLogLines(_trainingLogCursor, targetId, lines, total, liveLine);
      const incrementalLines = incrementalResult.incremental;
      _trainingLogCursor = incrementalResult.cursor;
      const logEl = $('#training-log-container');
      const isRunningTarget = target.status === 'RUNNING' || state.tasks.some((t) => t.status === 'RUNNING' && t.id === targetId);

      // Collect metrics from each poll
      if (incrementalLines.length > 0 && isRunningTarget) {
        collectTrainingMetrics(incrementalLines);
      }

      const placeholderHtml = '<span style="color:var(--text-dim);">等待训练输出...</span>';
      let nextLogHtml = placeholderHtml;
      if (renderedLines.length === 0) {
        nextLogHtml = placeholderHtml;
      } else {
        nextLogHtml = renderLogLines(renderedLines);
      }
      state.trainingLogSnapshot = { taskId: targetId, html: nextLogHtml, updatedAt: Date.now() };

      if (!logEl) {
        _updateTrainingLiveMetrics();
        return;
      }
      logEl.innerHTML = nextLogHtml;

      const autoScroll = $('#training-log-autoscroll');
      if (autoScroll?.checked) {
        logEl.scrollTop = logEl.scrollHeight;
      }

      // Live-update header metrics & right panel
      _updateTrainingLiveMetrics();
    } catch (e) {
      // 静默失败
    }
  };

  function _updateTrainingLiveMetrics() {
    var m = state.trainingMetrics;
    if (!m) return;
    var curStep = m.lastStep || 0;

    // Update step count in header (find .train-hdr-val elements)
    var hdrLabels = document.querySelectorAll('.train-hdr-label');
    if (hdrLabels.length >= 1) {
      var stepEl = hdrLabels[0].querySelector('.train-hdr-val');
      if (stepEl) stepEl.textContent = m.lastStep.toLocaleString() + ' / ' + (m.totalSteps > 0 ? m.totalSteps.toLocaleString() : '--');
    }
    if (hdrLabels.length >= 2) {
      var curSpeed = m.speeds.length > 0 ? m.speeds[m.speeds.length - 1].itPerSec : 0;
      var remain = (curSpeed > 0 && m.totalSteps > m.lastStep) ? Math.round((m.totalSteps - m.lastStep) / curSpeed) : 0;
      var remainEl = hdrLabels[1].querySelector('.train-hdr-val');
      if (remainEl) remainEl.textContent = remain > 0 ? formatDuration(remain * 1000) : '--:--';
    }

    // Update live speed
    var speedEl = document.getElementById('train-live-speed');
    if (speedEl && m.speeds.length > 0) {
      speedEl.textContent = m.speeds[m.speeds.length - 1].itPerSec.toFixed(2) + ' it/s';
    }
    
    // ── Live Loss value + delta ──
    var lossEl = document.querySelector('.train-loss-big');
    var deltaEl = document.querySelector('.train-loss-delta');
    if (lossEl && m.losses.length > 0) {
      var curLoss = m.losses[m.losses.length - 1].loss;
      lossEl.textContent = curLoss > 0 ? curLoss.toFixed(4) : '\u2014';
      if (deltaEl) {
        var prevLoss = m.losses.length > 1 ? m.losses[m.losses.length - 2].loss : curLoss;
        var lossDeltaPct = prevLoss > 0 ? ((curLoss - prevLoss) / prevLoss * 100) : 0;
        var lossArrowColor = lossDeltaPct < 0 ? '#22c55e' : (lossDeltaPct > 0 ? '#ef4444' : 'var(--text-dim)');
        var lossArrow = lossDeltaPct < 0 ? _ico('trending-down', 12) : (lossDeltaPct > 0 ? _ico('trending-up', 12) : '');
        deltaEl.style.color = lossArrowColor;
        deltaEl.innerHTML = lossArrow + ' ' + (lossDeltaPct !== 0 ? (lossDeltaPct > 0 ? '+' : '') + lossDeltaPct.toFixed(1) + '%' : '');
      }
    }

    // ── Live sparkline chart ──
    var chartBox = document.querySelector('.train-chart-box');
    if (chartBox && m.losses.length >= 2) {
      var pts = m.losses.slice(-50);
      var maxL = Math.max.apply(null, pts.map(function(p) { return p.loss; }));
      var minL = Math.min.apply(null, pts.map(function(p) { return p.loss; }));
      var range = maxL - minL || 0.001;
      var pathParts = [];
      for (var pi = 0; pi < pts.length; pi++) {
        var px = (pi / (pts.length - 1)) * 100;
        var py = 100 - ((pts[pi].loss - minL) / range) * 90 - 5;
        pathParts.push((pi === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1));
      }
      var pathD = pathParts.join(' ');
      chartBox.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;">'
        + '<defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity="0.3"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>'
        + '<path d="' + pathD + '" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>'
        + '<path d="' + pathD + ' L100 100 L0 100 Z" fill="url(#lg)"/>'
        + '</svg>';
    }

    // ── Live chart axis ──
    var axisEl = document.querySelector('.train-chart-axis');
    if (axisEl && m.losses.length > 0) {
      axisEl.innerHTML = '<span>Step 0</span><span>Step ' + curStep + '</span>';
    }
  }

  var _gpuPollCooldown = false;
  async function _fetchGpuStatus() {
    if (_gpuPollCooldown) return;
    _gpuPollCooldown = true;
    setTimeout(function() { _gpuPollCooldown = false; }, 4000); // max once per 4s
    try {
      var resp = await api.getGpuStatus();
      var d = resp && resp.data;
      if (!d || !d.available || !d.gpus || !d.gpus.length) return;
      var g = d.gpus[0];
      var vramText = document.getElementById('train-vram-text');
      var vramFill = document.getElementById('train-vram-fill');
      if (vramText) vramText.textContent = g.allocated_mb + ' / ' + g.total_mb + ' MB (' + g.utilization_pct + '%)';
      if (vramFill) vramFill.style.width = Math.min(g.utilization_pct, 100) + '%';
    } catch(e) { /* silent */ }
  }

  window.refreshTrainingLog = refreshTrainingLog;
  window.__loraRescriptsTrainingPageController = {
    refreshTrainingLog,
  };


  function bindGlobals(targetWindow) {
    targetWindow.switchTrainTab = switchTrainTab;
    targetWindow.scanDataset = scanDataset;
    targetWindow.toggleFolderPreview = toggleFolderPreview;
    targetWindow.runTrainingPreflight = runTrainingPreflight;
    targetWindow.loadMoreThumbs = loadMoreThumbs;
    targetWindow.refreshTrainingLog = refreshTrainingLog;
  }

  return {
    renderTraining,
    renderPreflightPanel,
    resetTrainingLogCursor: _resetTrainingLogCursor,
    switchTrainTab,
    scanDataset,
    toggleFolderPreview,
    runTrainingPreflight,
    startTrainingLogPolling,
    startSysMonitorPolling,
    refreshTrainingLog,
    loadMoreThumbs,
    bindGlobals,
  };
}
