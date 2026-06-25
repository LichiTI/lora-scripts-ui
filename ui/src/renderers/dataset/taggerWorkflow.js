import { renderTaggerTemplate } from './taggerTemplate.js';

export function createTaggerWorkflow({ state, api, $, _ico, escapeHtml, showToast }) {
  let taggerPollTimer = null;

  function renderTagger() {
    const content = $('#dataset-content');
    if (!content) return;

    const allInterrogators = state.interrogators?.interrogators || [];
    const defaultModel = 'wd-eva02-large-v3';
    const wdModels = allInterrogators.filter((model) => model.kind === 'wd' || model.kind === 'cl');
    const llmModels = allInterrogators.filter((model) => model.kind === 'llm');
    const llmChannels = state.interrogators?.llm_channels || [];
    const fallbackModels = [
      'wd-eva02-large-v3',
      'wd-convnext-v3',
      'wd-swinv2-v3',
      'wd-vit-v3',
      'wd14-convnextv2-v2',
      'wd14-swinv2-v2',
      'wd14-vit-v2',
      'wd14-moat-v2',
      'wd-eva02-large-tagger-v3',
      'wd-vit-large-tagger-v3',
      'eva02_large_E621_FULL_V1',
      'cl_tagger_1_01',
    ];
    const models = wdModels.length > 0 ? wdModels.map((model) => model.name) : fallbackModels;
    const conflicts = ['ignore', 'copy', 'prepend', 'append'];
    const conflictLabels = { ignore: '跳过已有', copy: '覆盖', prepend: '前置追加', append: '后置追加' };
    const presets = state.interrogators?.llm_template_presets || [
      { id: 'anime-tags', label: '动漫标签 / Anime Tags' },
      { id: 'natural-caption', label: '自然语言描述 / Natural Caption' },
    ];

    content.innerHTML = renderTaggerTemplate({
      models,
      defaultModel,
      llmModels,
      llmChannels,
      presets,
      conflicts,
      conflictLabels,
      escapeHtml,
    });
  }

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
    if (hint && loading) {
      hint.innerHTML = '';
    }
  }

  function showTaggerRunningHint(hintId, message) {
    const hint = $('#' + hintId);
    if (hint) {
      hint.innerHTML = '<span style="color:var(--warning);">' + _ico('loader') + ' ' + message + '</span>';
    }
  }

  function showTaggerDoneHint(hintId, message) {
    const hint = $('#' + hintId);
    if (hint) {
      hint.innerHTML = '<span style="color:var(--success);">' + _ico('check-circle') + ' ' + message + '</span>';
      setTimeout(() => {
        if (hint) hint.innerHTML = '';
      }, 15000);
    }
  }

  function showTaggerErrorHint(hintId, message) {
    const hint = $('#' + hintId);
    if (hint) {
      hint.innerHTML = '<span style="color:var(--danger);">' + _ico('x-circle') + ' ' + message + '</span>';
    }
  }

  function formatTaggerHealthMessage(health) {
    const errors = Array.isArray(health?.errors) ? health.errors.filter(Boolean) : [];
    const warnings = Array.isArray(health?.warnings) ? health.warnings.filter(Boolean) : [];
    if (errors.length) return errors.join('；');
    if (warnings.length) return warnings.join('；');
    const count = Number(health?.image_count || 0);
    return count > 0 ? `预检通过，检测到 ${count} 张图片。` : '预检通过。';
  }

  function formatTaggerSummary(summary, fallbackCount) {
    if (!summary || typeof summary !== 'object') {
      return '标注完成' + (fallbackCount ? ` (${fallbackCount})` : '') + '！标签文件已生成。';
    }
    const total = Number(summary.total_images || 0);
    const written = Number(summary.written_count || 0);
    const skippedExisting = Number(summary.skipped_existing_count || 0);
    const skippedEmpty = Number(summary.skipped_empty_count || 0);
    const empty = Number(summary.empty_output_count || 0);
    const parts = [];
    if (total) parts.push(`共 ${total} 张`);
    parts.push(`写入 ${written} 张`);
    if (skippedExisting) parts.push(`跳过已有 ${skippedExisting} 张`);
    if (skippedEmpty) parts.push(`空输出跳过 ${skippedEmpty} 张`);
    if (empty && !skippedEmpty) parts.push(`空输出 ${empty} 张`);
    return '标注完成：' + parts.join('，') + '。';
  }

  function getSelectedFallbackChannels() {
    const select = $('#llm-fallback-channels');
    if (!select) return [];
    return Array.from(select.selectedOptions || []).map((option) => option.value).filter(Boolean);
  }

  function updateChannelState(channels) {
    state.interrogators = {
      ...(state.interrogators || {}),
      llm_channels: Array.isArray(channels) ? channels : [],
    };
  }

  async function refreshLlmTaggerChannels() {
    try {
      const response = await api.getLlmTaggerChannels();
      updateChannelState(response?.data?.channels || []);
      renderTagger();
      showToast('LLM 通道已刷新。');
    } catch (error) {
      showToast(error.message || '刷新 LLM 通道失败。');
    }
  }

  async function saveLlmTaggerChannelFromForm() {
    const name = $('#llm-channel-name')?.value?.trim() || '';
    const provider = $('#llm-channel-provider')?.value || 'openai_compatible';
    const model = $('#llm-channel-model')?.value?.trim() || '';
    const apiKeys = $('#llm-channel-keys')?.value || '';
    const existing = (state.interrogators?.llm_channels || []).find((channel) => String(channel.id || '') === channelIdFromName(name));
    if (!name || !model) {
      showToast('请填写通道名称和模型。');
      return;
    }
    if (!existing && !apiKeys.trim()) {
      showToast('新通道请至少填写一个 API Key。');
      return;
    }
    try {
      const response = await api.saveLlmTaggerChannel({
        name,
        provider,
        model,
        api_base: $('#llm-channel-base')?.value?.trim() || '',
        api_keys: apiKeys,
        replace_api_keys: !!apiKeys.trim(),
        enabled: true,
        retries: parseInt($('#llm-retries')?.value, 10) || 1,
      });
      updateChannelState(response?.data?.channels || []);
      renderTagger();
      showToast(`已保存 LLM 通道：${name}`);
    } catch (error) {
      showToast(error.message || '保存 LLM 通道失败。');
    }
  }

  function channelIdFromName(name) {
    return String(name || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }

  async function clearSelectedLlmTaggerChannelKeys() {
    const channelId = $('#llm-channel')?.value || '';
    if (!channelId) {
      showToast('请先选择要清空密钥的通道。');
      return;
    }
    if (channelId.startsWith('env-')) {
      showToast('环境变量通道的密钥来自系统环境，不能在这里清空。');
      return;
    }
    try {
      const response = await api.clearLlmTaggerChannelKeys(channelId);
      updateChannelState(response?.data?.channels || []);
      renderTagger();
      showToast('已清空所选通道的 API Key。');
    } catch (error) {
      showToast(error.message || '清空 API Key 失败。');
    }
  }

  async function deleteSelectedLlmTaggerChannel() {
    const channelId = $('#llm-channel')?.value || '';
    if (!channelId) {
      showToast('请先选择要删除的通道。');
      return;
    }
    if (channelId.startsWith('env-')) {
      showToast('环境变量通道不能在这里删除。');
      return;
    }
    try {
      const response = await api.deleteLlmTaggerChannel(channelId);
      updateChannelState(response?.data?.channels || []);
      renderTagger();
      showToast('已删除所选 LLM 通道。');
    } catch (error) {
      showToast(error.message || '删除 LLM 通道失败。');
    }
  }

  function pollTaggerProgress(hintId, taskId = '') {
    if (taggerPollTimer) clearInterval(taggerPollTimer);
    let imageCount = '';
    const targetTaskId = String(taskId || '');
    taggerPollTimer = setInterval(async () => {
      try {
        const tasksResp = await api.getTasks();
        const tasks = tasksResp?.data?.tasks || [];
        const targetTask = targetTaskId
          ? tasks.find((task) => String(task.id || task.task_id || '') === targetTaskId)
          : null;
        const running = targetTask
          ? (String(targetTask.status || '').toUpperCase() === 'RUNNING' ? [targetTask] : [])
          : tasks.filter((task) => task.status === 'RUNNING');
        if (running.length === 0) {
          clearInterval(taggerPollTimer);
          taggerPollTimer = null;
          const finished = targetTask || tasks.find((task) => ['COMPLETED', 'FINISHED'].includes(String(task.status || '').toUpperCase()) && String(task.type || '').toLowerCase() === 'tagging');
          const doneMsg = formatTaggerSummary(finished?.metadata?.summary, imageCount);
          showTaggerDoneHint(hintId, doneMsg);
          showToast('✓ ' + doneMsg);
          return;
        }
        const taskId = running[0].id || running[0].task_id;
        if (!taskId) return;

        const outResp = await api.getTaskOutput(taskId, 30);
        const lines = outResp?.data?.lines || [];
        for (let index = lines.length - 1; index >= 0; index -= 1) {
          const line = lines[index];
          const imgMatch = line.match(/[Ff]ound\s+(\d+)\s+image/i);
          if (imgMatch) {
            imageCount = imgMatch[1] + ' 张图片';
            const hint = document.getElementById(hintId);
            if (hint) {
              hint.innerHTML = '<span style="color:var(--warning);">' + _ico('loader') + ' 标注中... 检测到 ' + imageCount + '</span>';
            }
            break;
          }
          if (/all\s*done|识别完成|Unloaded/i.test(line)) {
            clearInterval(taggerPollTimer);
            taggerPollTimer = null;
            const doneMsg = '标注完成' + (imageCount ? ` (${imageCount})` : '') + '！标签文件已生成。';
            showTaggerDoneHint(hintId, doneMsg);
            showToast('✓ ' + doneMsg);
            return;
          }
        }
      } catch (error) {
        // Progress polling is best-effort; the backend task continues independently.
      }
    }, 3000);
  }

  async function runLlmTagger() {
    const pathVal = $('#llm-tagger-path')?.value?.trim();
    if (!pathVal) {
      showToast('请先填写数据集路径。');
      return;
    }
    const channelId = $('#llm-channel')?.value || '';
    if (!channelId) {
      showToast('请先选择可用的 LLM 通道，或先保存一个通道。');
      return;
    }
    const params = {
      path: pathVal,
      method: 'llm',
      llm_channel_id: channelId,
      llm_fallback_channel_ids: getSelectedFallbackChannels().filter((id) => id !== channelId),
      llm_fallback_enabled: $('#llm-fallback-enabled')?.checked ?? true,
      llm_model: $('#llm-model')?.value?.trim() || '',
      llm_template_preset: $('#llm-preset')?.value || 'anime-tags',
      batch_output_action_on_conflict: $('#llm-conflict')?.value || 'ignore',
      llm_temperature: parseFloat($('#llm-temperature')?.value) || 0.2,
      llm_max_tokens: parseInt($('#llm-max-tokens')?.value, 10) || 300,
      llm_retries: parseInt($('#llm-retries')?.value, 10) || 1,
      llm_min_tags: parseInt($('#llm-min-tags')?.value, 10) || 1,
      llm_max_tags: parseInt($('#llm-max-tags')?.value, 10) || 120,
      batch_input_recursive: $('#llm-recursive')?.checked || false,
      threshold: 0.5,
    };
    setTaggerButtonLoading('btn-run-llm-tagger', 'llm-tagger-status-hint', true);
    try {
      const healthResp = await api.checkInterrogateHealth(params);
      const health = healthResp?.data || {};
      const healthMessage = formatTaggerHealthMessage(health);
      if (!health.ok) {
        throw new Error(healthMessage || 'LLM 标注预检未通过。');
      }
      if (Array.isArray(health.warnings) && health.warnings.length) {
        showToast(healthMessage);
      }
      const response = await api.runInterrogate(params);
      const taskId = response?.data?.task_id || response?.task_id || '';
      setTaggerButtonLoading('btn-run-llm-tagger', 'llm-tagger-status-hint', false);
      showTaggerRunningHint(
        'llm-tagger-status-hint',
        'LLM 标注后台运行中... 进度请查看后端控制台窗口（任务栏最小化窗口 "LoRA-Backend"）',
      );
      showToast('✓ LLM 标注任务已提交到后端，正在后台运行。完成后 .txt 标签文件会自动生成在图片旁边。');
      pollTaggerProgress('llm-tagger-status-hint', taskId);
    } catch (error) {
      setTaggerButtonLoading('btn-run-llm-tagger', 'llm-tagger-status-hint', false);
      showTaggerErrorHint('llm-tagger-status-hint', error.message || '提交失败');
      showToast(error.message || 'LLM 标注任务启动失败。');
    }
  }

  async function runTagger() {
    const pathVal = $('#tagger-path')?.value?.trim();
    if (!pathVal) {
      showToast('请先填写数据集路径。');
      return;
    }
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
      protect_empty_output: $('#tagger-empty-protect')?.checked ?? true,
    };
    setTaggerButtonLoading('btn-run-tagger', 'tagger-status-hint', true);
    try {
      const healthResp = await api.checkInterrogateHealth({ ...params, method: 'wd14' });
      const health = healthResp?.data || {};
      const healthMessage = formatTaggerHealthMessage(health);
      if (!health.ok) {
        throw new Error(healthMessage || '标注预检未通过。');
      }
      if (Array.isArray(health.warnings) && health.warnings.length) {
        showToast(healthMessage);
      }
      const response = await api.runInterrogate(params);
      const taskId = response?.data?.task_id || response?.task_id || '';
      setTaggerButtonLoading('btn-run-tagger', 'tagger-status-hint', false);
      showTaggerRunningHint(
        'tagger-status-hint',
        '标注后台运行中（首次需下载模型，可能需要几分钟）... 进度请查看后端控制台窗口',
      );
      showToast('✓ 标注任务已提交到后端，正在后台运行。完成后 .txt 标签文件会自动生成在图片旁边。');
      pollTaggerProgress('tagger-status-hint', taskId);
    } catch (error) {
      setTaggerButtonLoading('btn-run-tagger', 'tagger-status-hint', false);
      showTaggerErrorHint('tagger-status-hint', error.message || '提交失败');
      showToast(error.message || '标注任务启动失败。');
    }
  }

  return {
    renderTagger,
    runTagger,
    runLlmTagger,
    refreshLlmTaggerChannels,
    saveLlmTaggerChannelFromForm,
    clearSelectedLlmTaggerChannelKeys,
    deleteSelectedLlmTaggerChannel,
  };
}
