// renderers/dataset.js — 数据集处理页面（标签器 / 标签编辑器 / 图像预处理 / 数据集分析 / Caption 清洗 / Caption 备份 / 蒙版损失审查）
//
// 包含 7 个 render 函数 + 4 个 hint 辅助 + gatherCleanupParams + _pollTaggerProgress
// 以及 14 个 action（runTagger / runLlmTagger / runImageResize / runDatasetAnalysis / 等）
// 工厂返回所有 render 函数 + actions（main.js 负责把 actions 挂到 window）
//
// 依赖（工厂注入）：state、api、$、escapeHtml、_ico、showToast

import { $, escapeHtml, _ico } from '../utils/dom.js';
import { createBBoxAnnotator } from './dataset/bboxAnnotator.js';
import { createCaptionBackups } from './dataset/captionBackups.js';
import { createCaptionCleanupPanel } from './dataset/captionCleanupPanel.js';
import { createImageResizePanel } from './dataset/imageResizePanel.js';
import { createAnalysisSuggestions } from './dataset/analysisSuggestions.js';
import { createMaskedLossAudit } from './dataset/maskedLossAudit.js';
import { renderDatasetShell } from './dataset/shell.js';
import { createAdvancedTagToolsPanel } from './dataset/advancedTagToolsPanel.js';
import { createTagEditorPanel } from './dataset/tagEditorPanel.js';
import { createTagTranslationPanel } from './dataset/tagTranslationPanel.js';
import { createTaggerWorkflow } from './dataset/taggerWorkflow.js';
import {
  appendUniqueTextLine,
  decodeTagManagerQuickValue as decodeTagManagerPresetQuickValue,
  deleteTagManagerPresetByName,
  loadTagManagerPresets as loadTagManagerPresetList,
  saveTagManagerPresets as saveTagManagerPresetList,
  upsertTagManagerPreset,
} from './dataset/tagManagerPresets.js';

export function createDatasetRenderer({ state, api, showToast, renderView }) {
  const bboxAnnotator = createBBoxAnnotator({ state, api, $, escapeHtml, showToast });
  const analysisSuggestions = createAnalysisSuggestions({ state, api, $, escapeHtml, showToast, renderView });
  const captionBackups = createCaptionBackups({ api, $, escapeHtml, showToast });
  const captionCleanupPanel = createCaptionCleanupPanel({ api, $, escapeHtml, showToast });
  const maskedLossAudit = createMaskedLossAudit({ api, $, escapeHtml, showToast });
  const imageResizePanel = createImageResizePanel({ api, $, _ico, escapeHtml, showToast });
  const advancedTagToolsPanel = createAdvancedTagToolsPanel({ api, $, escapeHtml, showToast });
  const tagEditorPanel = createTagEditorPanel({ api, $, showToast });
  const tagTranslationPanel = createTagTranslationPanel({ api, $, escapeHtml, showToast });
  const taggerWorkflow = createTaggerWorkflow({ state, api, $, _ico, escapeHtml, showToast });

  function renderDataset(container) {
    const activeTab = state.datasetSubTab || 'tagger';
    container.innerHTML = renderDatasetShell(activeTab);
    const renderers = {
      tagger: taggerWorkflow.renderTagger,
      editor: tagEditorPanel.renderTagEditor,
      advanced: advancedTagToolsPanel.renderAdvancedTagTools,
      translation: tagTranslationPanel.renderTagTranslationPanel,
      resize: imageResizePanel.renderImageResize,
      analysis: analysisSuggestions.renderDatasetAnalysis,
      suggestions: analysisSuggestions.renderTagSuggestions,
      cleanup: captionCleanupPanel.renderCaptionCleanup,
      tagmanager: renderTagManagerLite,
      bbox: bboxAnnotator.renderBBoxAnnotator,
      backups: captionBackups.renderCaptionBackups,
      maskedloss: maskedLossAudit.renderMaskedLossAudit,
    };
   (renderers[activeTab] || renderTagger)();
  }

  function switchDatasetTab(tab) {
    state.datasetSubTab = tab;
    if (state.activeModule === 'dataset') renderView('dataset');
}

  function loadTagManagerPresets() {
    return loadTagManagerPresetList();
  }

  function saveTagManagerPresets(presets) {
    saveTagManagerPresetList(presets);
  }

  function refreshTagManagerPresetOptions(selectedName = '') {
    const select = $('#tagmanager-preset-select');
    if (!select) return;
    const presets = loadTagManagerPresets();
    select.innerHTML = `
      <option value="">选择已保存预设</option>
      ${presets.map((preset) => `<option value="${escapeHtml(preset.name || '')}">${escapeHtml(preset.name || '')}</option>`).join('')}
    `;
    if (selectedName) select.value = selectedName;
  }

  function gatherTagManagerPresetSnapshot() {
    return {
      caption_extension: $('#tagmanager-ext')?.value || '.txt',
      recursive: $('#tagmanager-recursive')?.checked ?? true,
      dedupe_tags: $('#tagmanager-dedupe')?.checked ?? true,
      sort_tags: $('#tagmanager-sort')?.checked || false,
      create_backup_before_apply: $('#tagmanager-backup')?.checked ?? true,
      alias_map: $('#tagmanager-alias')?.value || '',
      blacklist_tags: $('#tagmanager-blacklist')?.value || '',
      bulk_replace_rules: $('#tagmanager-replace-rules')?.value || '',
      stats_top_limit: Number($('#tagmanager-top')?.value || 15) || 15,
    };
  }

  function applyTagManagerPresetPayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    if ($('#tagmanager-ext')) $('#tagmanager-ext').value = payload.caption_extension || '.txt';
    if ($('#tagmanager-recursive')) $('#tagmanager-recursive').checked = payload.recursive ?? true;
    if ($('#tagmanager-dedupe')) $('#tagmanager-dedupe').checked = payload.dedupe_tags ?? true;
    if ($('#tagmanager-sort')) $('#tagmanager-sort').checked = payload.sort_tags || false;
    if ($('#tagmanager-backup')) $('#tagmanager-backup').checked = payload.create_backup_before_apply ?? true;
    if ($('#tagmanager-alias')) $('#tagmanager-alias').value = payload.alias_map || '';
    if ($('#tagmanager-blacklist')) $('#tagmanager-blacklist').value = payload.blacklist_tags || '';
    if ($('#tagmanager-replace-rules')) $('#tagmanager-replace-rules').value = payload.bulk_replace_rules || '';
    if ($('#tagmanager-top')) $('#tagmanager-top').value = String(payload.stats_top_limit || 15);
  }

  function saveCurrentTagManagerPreset() {
    const input = $('#tagmanager-preset-name');
    const name = input?.value?.trim() || '';
    if (!name) {
      showToast('请先填写预设名称。');
      return;
    }
    const presets = loadTagManagerPresets();
    const snapshot = gatherTagManagerPresetSnapshot();
    const next = upsertTagManagerPreset(presets, name, snapshot);
    saveTagManagerPresets(next);
    refreshTagManagerPresetOptions(name);
    showToast(`已保存预设：${name}`);
  }

  function applySavedTagManagerPreset() {
    const select = $('#tagmanager-preset-select');
    const name = select?.value?.trim() || '';
    if (!name) {
      showToast('请先选择一个预设。');
      return;
    }
    const preset = loadTagManagerPresets().find((entry) => String(entry.name || '').trim() === name);
    if (!preset) {
      showToast('预设不存在或已删除。');
      refreshTagManagerPresetOptions('');
      return;
    }
    applyTagManagerPresetPayload(preset.config || {});
    if ($('#tagmanager-preset-name')) $('#tagmanager-preset-name').value = name;
    showToast(`已载入预设：${name}`);
  }

  function deleteSavedTagManagerPreset() {
    const select = $('#tagmanager-preset-select');
    const name = select?.value?.trim() || '';
    if (!name) {
      showToast('请先选择一个预设。');
      return;
    }
    const next = deleteTagManagerPresetByName(loadTagManagerPresets(), name);
    saveTagManagerPresets(next);
    refreshTagManagerPresetOptions('');
    showToast(`已删除预设：${name}`);
  }

  function decodeTagManagerQuickValue(encodedValue) {
    return decodeTagManagerPresetQuickValue(encodedValue);
  }

  function appendUniqueTagManagerLine(textareaId, value) {
    const textarea = $('#' + textareaId);
    if (!textarea) return false;
    const result = appendUniqueTextLine(textarea.value, value);
    textarea.value = result.value;
    return result.added;
  }

  function appendTagManagerBlacklistFromStats(encodedValue) {
    const tag = decodeTagManagerQuickValue(encodedValue);
    if (!tag) return;
    const added = appendUniqueTagManagerLine('tagmanager-blacklist', tag);
    showToast(added ? `已加入黑名单候选：${tag}` : `黑名单里已经有：${tag}`);
  }

  function appendTagManagerAliasSourceFromStats(encodedValue) {
    const tag = decodeTagManagerQuickValue(encodedValue);
    const textarea = $('#tagmanager-alias');
    if (!tag || !textarea) return;
    const existingLines = textarea.value
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const hasSource = existingLines.some((line) => {
      const source = line.split(/=>|->|=/)[0]?.trim()?.toLowerCase();
      return source === tag.toLowerCase();
    });
    if (hasSource) {
      showToast(`Alias 规则里已经有：${tag}`);
      return;
    }
    existingLines.push(`${tag} => `);
    textarea.value = existingLines.join('\n');
    textarea.focus();
    showToast(`已加入 Alias 源标签：${tag}`);
  }

  // ========== Tag Manager Lite ==========
  function renderTagManagerLite() {
    const content = $('#dataset-content');
    if (!content) return;
    content.innerHTML = `
      <section class="form-section">
        <header class="section-header"><h3>Tag Manager Lite</h3></header>
        <div class="section-summary">对整套 caption 做 alias、黑名单、批量替换，并预览 tag / caption 频率变化。只有点击应用后才会写回磁盘。</div>
        <div class="section-content tool-fields">
          <div class="config-group" style="grid-column:1/-1;">
            <label>规则预设</label>
            <p class="field-desc">预设保存在当前浏览器，只用于快速复用 Tag Manager Lite 规则。</p>
            <div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) auto auto auto;gap:8px;align-items:end;">
              <input class="text-input" type="text" id="tagmanager-preset-name" placeholder="例如：统一风格清洗">
              <select id="tagmanager-preset-select"></select>
              <button class="btn btn-outline btn-sm" type="button" onclick="saveCurrentTagManagerPreset()">保存当前</button>
              <button class="btn btn-outline btn-sm" type="button" onclick="applySavedTagManagerPreset()">载入预设</button>
              <button class="btn btn-outline btn-sm" type="button" onclick="deleteSavedTagManagerPreset()">删除预设</button>
            </div>
          </div>
          <div class="config-group" style="grid-column:1/-1;">
            <label>数据集路径</label>
            <div class="input-picker">
              <button class="picker-icon" type="button" onclick="pickPathForInput('tagmanager-path', 'folder')">
                <svg class="icon"><use href="#icon-folder"></use></svg>
              </button>
              <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('tagmanager-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
              <input class="text-input" type="text" id="tagmanager-path" placeholder="./train/your_dataset">
            </div>
          </div>
          <div class="config-group">
            <label>Caption 扩展名</label>
            <input class="text-input" type="text" id="tagmanager-ext" value=".txt">
          </div>
          <div class="config-group">
            <label>统计 Top 数量</label>
            <input class="text-input" type="number" id="tagmanager-top" value="15" min="1" max="100">
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>递归处理子目录</label></div>
            <label class="switch switch-compact"><input type="checkbox" id="tagmanager-recursive" checked><span class="slider round"></span></label>
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>去除重复标签</label></div>
            <label class="switch switch-compact"><input type="checkbox" id="tagmanager-dedupe" checked><span class="slider round"></span></label>
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>标签排序</label></div>
            <label class="switch switch-compact"><input type="checkbox" id="tagmanager-sort"><span class="slider round"></span></label>
          </div>
          <div class="config-group row boolean-card">
            <div class="label-col"><label>应用前自动备份</label></div>
            <label class="switch switch-compact"><input type="checkbox" id="tagmanager-backup" checked><span class="slider round"></span></label>
          </div>
          <div class="config-group">
            <label>Alias 规则</label>
            <p class="field-desc">一行一条，格式 <code>旧标签 =&gt; 新标签</code>，按完整标签精确匹配。</p>
            <textarea class="text-input" id="tagmanager-alias" style="min-height:124px;width:100%;" placeholder="1girl => girl&#10;blue_hair => aqua hair"></textarea>
          </div>
          <div class="config-group">
            <label>黑名单标签</label>
            <p class="field-desc">一行一个，或使用逗号分隔。命中的完整标签会被移除。</p>
            <textarea class="text-input" id="tagmanager-blacklist" style="min-height:124px;width:100%;" placeholder="signature&#10;watermark"></textarea>
          </div>
          <div class="config-group">
            <label>批量替换</label>
            <p class="field-desc">一行一条，格式 <code>搜索文本 =&gt; 替换文本</code>，会按顺序作用在整条 caption 文本上。</p>
            <textarea class="text-input" id="tagmanager-replace-rules" style="min-height:124px;width:100%;" placeholder="blue hair => aqua hair&#10;low quality =>"></textarea>
          </div>
        </div>
        <div class="tool-actions" style="display:flex;gap:8px;">
          <button class="btn btn-outline btn-sm" type="button" onclick="runTagManagerPreview()">统计 / 预览</button>
          <button class="btn btn-primary btn-sm" type="button" onclick="runTagManagerApply()">提交异步应用</button>
        </div>
        <div id="tagmanager-job" style="margin-top:12px;"></div>
        <div id="tagmanager-result" style="margin-top:16px;"></div>
      </section>
    `;
    refreshTagManagerPresetOptions();
  }

  function gatherTagManagerParams() {
    return {
      path: $('#tagmanager-path')?.value?.trim() || '',
      caption_extension: $('#tagmanager-ext')?.value || '.txt',
      recursive: $('#tagmanager-recursive')?.checked ?? true,
      dedupe_tags: $('#tagmanager-dedupe')?.checked ?? true,
      sort_tags: $('#tagmanager-sort')?.checked || false,
      create_backup_before_apply: $('#tagmanager-backup')?.checked ?? true,
      alias_map: $('#tagmanager-alias')?.value || '',
      blacklist_tags: $('#tagmanager-blacklist')?.value || '',
      bulk_replace_rules: $('#tagmanager-replace-rules')?.value || '',
      stats_top_limit: Number($('#tagmanager-top')?.value || 15) || 15,
      remove_parens: false,
      collapse_whitespace: false,
      replace_underscore: false,
      max_tag_len: 0,
    };
  }

  function renderTagManagerFrequencyRows(entries, fieldName) {
    const rows = Array.isArray(entries) ? entries : [];
    if (!rows.length) {
      return '<span class="module-list-meta">暂无数据</span>';
    }
    return rows.map((entry) => {
      const rawLabel = fieldName === 'caption' ? (entry.caption || '(空 caption)') : (entry.tag || '-');
      const label = String(rawLabel || '');
      const shortLabel = label.length > 96 ? `${label.slice(0, 96)}...` : label;
      if (fieldName === 'tag') {
        const encoded = encodeURIComponent(label);
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <span class="module-list-meta" title="${escapeHtml(label)}">${escapeHtml(shortLabel)} x ${entry.count ?? 0}</span>
            <span style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="btn btn-outline btn-sm btn-picker-action" type="button" onclick="appendTagManagerBlacklistFromStats('${encoded}')">黑名单</button>
              <button class="btn btn-outline btn-sm btn-picker-action" type="button" onclick="appendTagManagerAliasSourceFromStats('${encoded}')">Alias</button>
            </span>
          </div>
        `;
      }
      return `<span class="module-list-meta" title="${escapeHtml(label)}">${escapeHtml(shortLabel)} x ${entry.count ?? 0}</span>`;
    }).join('');
  }

  function renderTagManagerPreviewResult(data) {
    const result = $('#tagmanager-result');
    if (!result) return;
    const summary = data?.summary || {};
    const rules = data?.rules || {};
    const stats = data?.stats || {};
    const beforeStats = stats.before || {};
    const afterStats = stats.after || {};
    const samples = data?.samples || [];
    result.innerHTML = `
      <div class="module-list">
        <div class="module-list-item module-list-item-static">
          <div class="module-list-main">
            <strong>扫描文件: ${summary.total_file_count ?? '-'}</strong>
            <span class="module-list-meta">将变更: ${summary.changed_file_count ?? '-'} | 无变化: ${summary.unchanged_file_count ?? '-'}</span>
            <span class="module-list-meta">Alias: ${rules.alias_count ?? 0} | 黑名单: ${rules.blacklist_count ?? 0} | 批量替换: ${rules.bulk_replace_count ?? 0}</span>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-top:16px;">
        <div class="module-list-item module-list-item-static" style="align-items:flex-start;">
          <div class="module-list-main">
            <strong>变更前统计</strong>
            <span class="module-list-meta">有 caption: ${beforeStats.captioned_count ?? 0} | 空 caption: ${beforeStats.empty_count ?? 0}</span>
            <span class="module-list-meta">唯一标签: ${beforeStats.unique_tag_count ?? 0} | 总标签量: ${beforeStats.total_tag_count ?? 0}</span>
            <span class="module-list-meta">平均标签数: ${beforeStats.avg_tags_per_caption ?? 0} | 重复 caption: ${beforeStats.repeated_caption_count ?? 0}</span>
          </div>
        </div>
        <div class="module-list-item module-list-item-static" style="align-items:flex-start;">
          <div class="module-list-main">
            <strong>变更后统计</strong>
            <span class="module-list-meta">有 caption: ${afterStats.captioned_count ?? 0} | 空 caption: ${afterStats.empty_count ?? 0}</span>
            <span class="module-list-meta">唯一标签: ${afterStats.unique_tag_count ?? 0} | 总标签量: ${afterStats.total_tag_count ?? 0}</span>
            <span class="module-list-meta">平均标签数: ${afterStats.avg_tags_per_caption ?? 0} | 重复 caption: ${afterStats.repeated_caption_count ?? 0}</span>
          </div>
        </div>
        <div class="module-list-item module-list-item-static" style="align-items:flex-start;">
          <div class="module-list-main">
            <strong>变更前 Top Tags</strong>
            ${renderTagManagerFrequencyRows(beforeStats.top_tags || [], 'tag')}
          </div>
        </div>
        <div class="module-list-item module-list-item-static" style="align-items:flex-start;">
          <div class="module-list-main">
            <strong>变更后 Top Tags</strong>
            ${renderTagManagerFrequencyRows(afterStats.top_tags || [], 'tag')}
          </div>
        </div>
        <div class="module-list-item module-list-item-static" style="align-items:flex-start;">
          <div class="module-list-main">
            <strong>变更前 Top Captions</strong>
            ${renderTagManagerFrequencyRows(beforeStats.top_captions || [], 'caption')}
          </div>
        </div>
        <div class="module-list-item module-list-item-static" style="align-items:flex-start;">
          <div class="module-list-main">
            <strong>变更后 Top Captions</strong>
            ${renderTagManagerFrequencyRows(afterStats.top_captions || [], 'caption')}
          </div>
        </div>
      </div>
      <div class="module-list" style="margin-top:16px;">
        ${samples.length
          ? samples.map((sample) => `
            <div class="module-list-item module-list-item-static">
              <div class="module-list-main">
                <strong>${escapeHtml(sample.file || '-')}</strong>
                <span class="module-list-meta">前: ${escapeHtml(sample.before || '')}</span>
                <span class="module-list-meta" style="color:var(--accent);">后: ${escapeHtml(sample.after || '')}</span>
              </div>
            </div>
          `).join('')
          : `
            <div class="module-list-item module-list-item-static">
              <div class="module-list-main">
                <strong>没有发现需要改写的文件</strong>
                <span class="module-list-meta">当前规则组合不会改动现有 caption。</span>
              </div>
            </div>
          `}
      </div>
    `;
  }

  async function runTagManagerPreview() {
    const params = gatherTagManagerParams();
    if (!params.path) { showToast('请先填写数据集路径。'); return; }
    const result = $('#tagmanager-result');
    if (result) result.innerHTML = '<div class="builtin-picker-empty"><span>统计中...</span></div>';
    try {
      const response = await api.tagManagerLitePreview(params);
      renderTagManagerPreviewResult(response?.data || {});
    } catch (error) {
      if (result) result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(error.message || '预览失败')}</span></div>`;
    }
  }

  async function runTagManagerApply() {
    const params = gatherTagManagerParams();
    if (!params.path) { showToast('请先填写数据集路径。'); return; }
    const jobEl = $('#tagmanager-job');
    if (jobEl) jobEl.innerHTML = '提交中...';
    try {
      const response = await api.tagManagerLiteStart(params);
      const jobId = response?.data?.job_id;
      const preview = response?.data?.preview;
      if (preview) renderTagManagerPreviewResult(preview);
      if (!jobId) throw new Error('未返回 job_id');
      if (jobEl) jobEl.innerHTML = `标签管理任务已提交：${escapeHtml(jobId)}`;
      showToast('Tag Manager Lite 任务已提交。');
      pollTagManagerJob(jobId);
    } catch (error) {
      if (jobEl) jobEl.innerHTML = `<span style="color:var(--danger);">${escapeHtml(error.message || '提交失败')}</span>`;
      showToast(error.message || 'Tag Manager Lite 提交失败。');
    }
  }

  async function pollTagManagerJob(jobId) {
    const jobEl = $('#tagmanager-job');
    const result = $('#tagmanager-result');
    const timer = setInterval(async () => {
      try {
        const data = await api.getJob(jobId);
        if (jobEl) {
          jobEl.innerHTML = `任务 ${escapeHtml(jobId)}: ${escapeHtml(data.status || 'pending')} ${(Math.round((data.progress || 0) * 100))}% <button class="btn btn-outline btn-sm" type="button" onclick="cancelTagManagerJob('${escapeHtml(jobId)}')">取消</button>`;
        }
        if (data.status === 'completed') {
          clearInterval(timer);
          const changed = data.metadata?.preview?.summary?.changed_file_count;
          if (result && (!result.innerHTML || !result.innerHTML.trim())) {
            result.innerHTML = `<div class="builtin-picker-empty"><span>批量改写完成${changed != null ? `，预估改动 ${changed} 个文件` : ''}。</span></div>`;
          }
          showToast('Tag Manager Lite 处理完成。');
          runTagManagerPreview();
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          clearInterval(timer);
          if (result) result.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(data.error || data.status || '任务未完成')}</span></div>`;
        }
      } catch (error) {
        clearInterval(timer);
        if (jobEl) jobEl.innerHTML = `<span style="color:var(--danger);">${escapeHtml(error.message || '轮询失败')}</span>`;
      }
    }, 1200);
  }

  async function cancelTagManagerJob(jobId) {
    try {
      await api.cancelJob(jobId);
      showToast('已请求取消标签管理任务。');
    } catch (error) {
      showToast(error.message || '取消失败。');
    }
  }

  return {
    renderDataset,
    // actions（main.js 把它们挂到 window）
    switchDatasetTab,
    refreshBBoxDataset: bboxAnnotator.refreshBBoxDataset,
    openBBoxImageByIndex: bboxAnnotator.openBBoxImageByIndex,
    saveBBoxCurrent: bboxAnnotator.saveBBoxCurrent,
    predictBBoxCurrent: bboxAnnotator.predictBBoxCurrent,
    startBBoxBatchPredict: bboxAnnotator.startBBoxBatchPredict,
    cancelBBoxBatchPredict: bboxAnnotator.cancelBBoxBatchPredict,
    deleteBBoxSelected: bboxAnnotator.deleteBBoxSelected,
    undoBBoxLast: bboxAnnotator.undoBBoxLast,
    clearBBoxBoxes: bboxAnnotator.clearBBoxBoxes,
    selectBBoxIndex: bboxAnnotator.selectBBoxIndex,
    updateBBoxSelectedClass: bboxAnnotator.updateBBoxSelectedClass,
    syncBBoxClassControls: bboxAnnotator.syncBBoxClassControls,
    openBBoxPrev: bboxAnnotator.openBBoxPrev,
    openBBoxNext: bboxAnnotator.openBBoxNext,
    runTagger: taggerWorkflow.runTagger,
    runLlmTagger: taggerWorkflow.runLlmTagger,
    refreshLlmTaggerChannels: taggerWorkflow.refreshLlmTaggerChannels,
    saveLlmTaggerChannelFromForm: taggerWorkflow.saveLlmTaggerChannelFromForm,
    clearSelectedLlmTaggerChannelKeys: taggerWorkflow.clearSelectedLlmTaggerChannelKeys,
    deleteSelectedLlmTaggerChannel: taggerWorkflow.deleteSelectedLlmTaggerChannel,
    refreshTagEditorIframe: tagEditorPanel.refreshTagEditorIframe,
    startTagTranslation: tagTranslationPanel.startTagTranslation,
    stopTagTranslation: tagTranslationPanel.stopTagTranslation,
    refreshTagTranslationStatus: tagTranslationPanel.refreshTagTranslationStatus,
    runImageResize: imageResizePanel.runImageResize,
    runDatasetAnalysis: analysisSuggestions.runDatasetAnalysis,
    runCaptionCleanupPreview: captionCleanupPanel.runCaptionCleanupPreview,
    runCaptionCleanupApply: captionCleanupPanel.runCaptionCleanupApply,
    runTagManagerPreview,
    runTagManagerApply,
    cancelTagManagerJob,
    saveCurrentTagManagerPreset,
    applySavedTagManagerPreset,
    deleteSavedTagManagerPreset,
    appendTagManagerBlacklistFromStats,
    appendTagManagerAliasSourceFromStats,
    createCaptionBackup: captionBackups.createCaptionBackup,
    listCaptionBackups: captionBackups.listCaptionBackups,
    restoreCaptionBackup: captionBackups.restoreCaptionBackup,
    runMaskedLossAudit: maskedLossAudit.runMaskedLossAudit,
    // ===== 高级标签工具（P1/P2/P3） =====
    switchAdvancedTagSegment: advancedTagToolsPanel.switchAdvancedTagSegment,
    runAdvPipelinePlan: advancedTagToolsPanel.runAdvPipelinePlan,
    runAdvPipelineRun: advancedTagToolsPanel.runAdvPipelineRun,
    runAdvEnsemblePreview: advancedTagToolsPanel.runAdvEnsemblePreview,
    runAdvEnsembleApply: advancedTagToolsPanel.runAdvEnsembleApply,
    runAdvStructurePreview: advancedTagToolsPanel.runAdvStructurePreview,
    runAdvStructureApply: advancedTagToolsPanel.runAdvStructureApply,
    runAdvDedupe: advancedTagToolsPanel.runAdvDedupe,
    runAdvFrequencyPreview: advancedTagToolsPanel.runAdvFrequencyPreview,
    runAdvFrequencyApply: advancedTagToolsPanel.runAdvFrequencyApply,
    runAdvReviewQueue: advancedTagToolsPanel.runAdvReviewQueue,
    refreshAdvPolicyPacks: advancedTagToolsPanel.refreshAdvPolicyPacks,
    runAdvPolicyPreview: advancedTagToolsPanel.runAdvPolicyPreview,
    runAdvPolicyApply: advancedTagToolsPanel.runAdvPolicyApply,
    runAdvRetagBuild: advancedTagToolsPanel.runAdvRetagBuild,
    runAdvRetagNext: advancedTagToolsPanel.runAdvRetagNext,
    markAdvRetag: advancedTagToolsPanel.markAdvRetag,
    runAdvVersionHistory: advancedTagToolsPanel.runAdvVersionHistory,
    runAdvVersionRevert: advancedTagToolsPanel.runAdvVersionRevert,
    runAdvCrossAggregate: advancedTagToolsPanel.runAdvCrossAggregate,
    runAdvCrossResult: advancedTagToolsPanel.runAdvCrossResult,
  };
}

