function buildTaskMetadataFromConfig(config, trainingTypeId, trainingTypes) {
  const cfg = config || {};
  const typeId = cfg.model_train_type || trainingTypeId || '';
  return {
    output_name: cfg.output_name || '',
    model_train_type: typeId,
    created_at: new Date().toLocaleString('zh-CN', { hour12: false }),
    training_type_label: (trainingTypes.find((item) => item.id === typeId) || {}).label || '',
    resolution: cfg.resolution || '',
    network_dim: cfg.network_dim || cfg.lokr_dim || cfg.dim || '',
  };
}

function applyTaskMetadata(task, metadata, options = {}) {
  if (!task || !metadata) return;
  const force = !!(options && options.force);
  const keys = ['output_name', 'model_train_type', 'created_at', 'training_type_label', 'resolution', 'network_dim'];
  for (const key of keys) {
    if (metadata[key] !== undefined && metadata[key] !== '' && (force || task[key] === undefined || task[key] === '')) {
      task[key] = metadata[key];
    }
  }
}

export function createTrainingActionsController({
  api,
  state,
  trainingTypes,
  buildRunConfig,
  renderView,
  updateJSONPreview,
  syncFooterAction,
  resetTrainingMetrics,
  loadLocalTaskHistory,
  saveLocalTaskHistory,
  mergeTaskHistory,
  renderTaskStatus,
  startTrainingLogPolling,
  startSysMonitorPolling,
  showToast,
}) {
  async function runPreflight() {
    state.loading.preflight = true;
    updateJSONPreview();
    showToast('正在执行训练预检...');

    try {
      const [runtimeRes, preflightRes] = await Promise.allSettled([
        api.getGraphicCards(),
        api.runPreflight(buildRunConfig(state.config, state.activeTrainingType)),
      ]);
      if (runtimeRes.status === 'fulfilled') {
        state.runtime = runtimeRes.value.data || null;
        state.runtimeError = '';
      } else {
        state.runtimeError = runtimeRes.reason?.message || '运行环境不可用';
      }
      if (preflightRes.status === 'fulfilled' && preflightRes.value.status === 'success') {
        state.preflight = preflightRes.value.data;
      } else {
        state.preflight = {
          can_start: false,
          errors: [preflightRes.reason?.message || preflightRes.value?.message || '训练预检失败。'],
          warnings: [],
        };
      }
      showToast('训练预检完成');
    } catch (error) {
      state.preflight = {
        can_start: false,
        errors: [error.message || '训练预检失败。'],
        warnings: [],
      };
      showToast(error.message || '训练预检失败');
    } finally {
      state.loading.preflight = false;
      if (state.activeModule === 'config') {
        renderView('config');
      } else if (state.activeModule === 'training') {
        state.trainSubTab = 'preflight';
        renderView('training');
      } else {
        updateJSONPreview();
      }
    }
  }

  async function refreshRuntime() {
    state.loading.runtime = true;
    updateJSONPreview();

    try {
      const response = await api.getGraphicCards();
      state.runtime = response.data || null;
      state.runtimeError = '';
    } catch (error) {
      state.runtimeError = error.message || '运行环境状态不可用。';
    } finally {
      state.loading.runtime = false;
      if (state.activeModule === 'config') {
        renderView('config');
      } else {
        updateJSONPreview();
      }
    }
  }

  function validateConfigConflicts() {
    const c = state.config;
    const tt = state.activeTrainingType;
    const errors = [];
    const warnings = [];
    const isSageEnv = (state.runtime?.runtime?.environment || '').includes('sageattention');
    const toBool = (v) => v === true || v === 'true' || v === 1;
    const toNum = (v) => { const n = Number(v); return Number.isNaN(n) ? 0 : n; };

    if (toBool(c.cache_text_encoder_outputs)) {
      const conflicts = [];
      if (toBool(c.shuffle_caption)) conflicts.push('随机打乱标签');
      if (toNum(c.caption_dropout_rate) > 0) conflicts.push('全部标签丢弃概率');
      if (toNum(c.caption_tag_dropout_rate) > 0) conflicts.push('按标签丢弃概率');
      if (toNum(c.token_warmup_step) > 0) conflicts.push('Token 预热步数');
      if (conflicts.length > 0) {
        errors.push(`缓存文本编码器输出时不能同时使用「${conflicts.join('」「')}」。请关闭「缓存文本编码器输出」或关闭「${conflicts.join('」「')}」。`);
      }
    }

    if (toBool(c.cache_text_encoder_outputs) && !toBool(c.network_train_unet_only)) {
      errors.push('训练文本编码器时不能同时启用「缓存文本编码器输出」。请先关闭该缓存或开启「仅训练 U-Net」。');
    }

    if (toBool(c.cache_text_encoder_outputs_to_disk) && !toBool(c.cache_text_encoder_outputs)) {
      errors.push('「缓存文本编码器输出到磁盘」已开启但「缓存文本编码器输出」未开启。请一并勾选「缓存文本编码器输出」。');
    }

    if (!toBool(c.xformers) && !toBool(c.sdpa) && !toBool(c.sageattn) && !toBool(c.flashattn) && !toBool(c.mem_eff_attn)) {
      errors.push('未启用任何注意力加速后端（xformers / SDPA / SageAttention / FlashAttention）。训练将极度缓慢且显存占用极高。请至少开启 SDPA。');
    }

    if (toBool(c.xformers) && toBool(c.sdpa)) {
      // 不阻断，但给提示（这里不加 error，只在 preflight 里显示）。
    }

    const bucketStep = toNum(c.bucket_reso_steps) || 64;
    if ((tt.startsWith('sdxl') || tt === 'sdxl-controlnet') && bucketStep % 32 !== 0) {
      errors.push(`SDXL 训练的桶划分单位必须是 32 的倍数，当前值 ${bucketStep} 不符合。`);
    }
    if ((tt.startsWith('sd-') || tt === 'sd-dreambooth') && bucketStep % 64 !== 0) {
      errors.push(`SD1.5 训练的桶划分单位必须是 64 的倍数，当前值 ${bucketStep} 不符合。`);
    }

    if (toBool(c.network_train_unet_only) && toBool(c.network_train_text_encoder_only)) {
      errors.push('不能同时勾选「仅训练 U-Net」和「仅训练文本编码器」。请只保留其中一个，或两个都不勾（即两者都训练）。');
    }

    if (toNum(c.noise_offset) > 0 && toNum(c.multires_noise_iterations) > 0) {
      errors.push('noise_offset 与 multires_noise_iterations 不能同时使用。请只保留其中一个噪声策略。');
    }

    if (toBool(c.full_fp16) && toBool(c.full_bf16)) {
      errors.push('不能同时启用「完全 FP16」和「完全 BF16」。请只保留其中一个。');
    }

    const effUnetLr = Number(c.unet_lr || c.learning_rate || 0);
    const effTeLr = Number(c.text_encoder_lr || c.learning_rate || 0);
    if (toBool(c.network_train_unet_only) && effUnetLr === 0) {
      warnings.push('当前仅训练 U-Net，但 U-Net 学习率为 0，训练将无效。');
    }
    if (toBool(c.network_train_text_encoder_only) && effTeLr === 0) {
      warnings.push('当前仅训练文本编码器，但文本编码器学习率为 0，训练将无效。');
    }

    if (toBool(c.cache_latents_to_disk) && !toBool(c.cache_latents)) {
      warnings.push('「缓存 Latent 到磁盘」已开启但「缓存 Latent」未开启。建议一并开启。');
    }

    if (toNum(c.blocks_to_swap) > 0 && toBool(c.cpu_offload_checkpointing)) {
      warnings.push('blocks_to_swap 与 cpu_offload_checkpointing 通常不建议同时使用。');
    }

    if (toBool(c.flow_model) && toBool(c.v_parameterization)) {
      errors.push('Rectified Flow 不能与「V 参数化」同时开启。请二选一。');
    }

    if (toBool(c.contrastive_flow_matching) && !toBool(c.flow_model)) {
      errors.push('启用「对比 Flow Matching」前，必须先开启「Rectified Flow」。');
    }

    if (toBool(c.flow_model) && String(c.flow_timestep_distribution || 'logit_normal') === 'logit_normal' && toNum(c.flow_logit_std) <= 0) {
      errors.push('RF Logit Std 必须大于 0。');
    }

    if (toBool(c.flow_model) && c.flow_uniform_static_ratio !== '' && c.flow_uniform_static_ratio != null && toNum(c.flow_uniform_static_ratio) <= 0) {
      errors.push('RF 固定偏移比率必须大于 0。');
    }

    if (isSageEnv) {
      // Reserved for future SageAttention-specific runtime hints. Kept to preserve existing behavior.
    }

    return { errors, warnings };
  }

  async function executeTraining() {
    state.loading.run = true;
    const runConfig = buildRunConfig(state.config, state.activeTrainingType);
    const launchMetadata = buildTaskMetadataFromConfig(runConfig, state.activeTrainingType, trainingTypes);
    syncFooterAction();
    resetTrainingMetrics();
    let trainingLaunched = false;
    const clientCheck = validateConfigConflicts();
    if (clientCheck.errors.length > 0) {
      showToast(clientCheck.errors[0]);
      state.preflight = { can_start: false, errors: clientCheck.errors, warnings: clientCheck.warnings };
      state.loading.run = false;
      if (state.activeModule === 'config') renderView('config');
      return;
    }
    if (clientCheck.warnings.length > 0) {
      const proceed = confirm(clientCheck.warnings.join('\n\n') + '\n\n是否继续训练？');
      if (!proceed) {
        state.loading.run = false;
        syncFooterAction();
        return;
      }
    }

    try {
      const preflightResponse = await api.runPreflight(runConfig);
      if (preflightResponse.status !== 'success' || !preflightResponse.data?.can_start) {
        state.preflight = preflightResponse.data || {
          can_start: false,
          errors: [preflightResponse.message || '训练预检阻止了本次训练。'],
          warnings: [],
        };
        showToast('预检未通过，请先修正错误。');
        return;
      }

      state.preflight = preflightResponse.data;
      state._pendingTrainingMetadata = launchMetadata;
      state.activeTrainingTaskId = '';
      const response = await api.runTraining(runConfig);
      if (response.status !== 'success') {
        state._pendingTrainingMetadata = null;
        state.activeTrainingTaskId = '';
        showToast(response.message || '训练启动失败。');
        return;
      }
      trainingLaunched = true;

      state.trainingFailed = false;
      state.lastMessage = response.message || '训练已启动。';
      showToast(state.lastMessage);
      resetTrainingMetrics();
      const responseTaskId = response?.data?.task_id || response?.data?.id || '';
      if (responseTaskId) {
        state.activeTrainingTaskId = responseTaskId;
        state._pendingTrainingMetadata = { ...launchMetadata, taskId: responseTaskId };
      }
      const tasksResponse = await api.getTasks();
      const freshTasks = tasksResponse?.data?.tasks || [];
      const localHistory = await loadLocalTaskHistory();
      for (const task of freshTasks) {
        if (task.status === 'RUNNING') {
          let meta = null;
          if (state._pendingTrainingMetadata && (!state._pendingTrainingMetadata.taskId || state._pendingTrainingMetadata.taskId === task.id)) {
            meta = state._pendingTrainingMetadata;
          } else if (!state.activeTrainingTaskId) {
            meta = launchMetadata;
            state.activeTrainingTaskId = task.id;
            state._pendingTrainingMetadata = { ...launchMetadata, taskId: task.id };
          }
          if (meta) applyTaskMetadata(task, meta, { force: false });
        }
      }
      state.tasks = mergeTaskHistory(freshTasks, localHistory, state.tasks);
      state._taskHistoryDirty = true;
      await saveLocalTaskHistory();
      if (window.refreshTrainingLog) {
        await window.refreshTrainingLog(state.activeTrainingTaskId || responseTaskId);
      }
      startTrainingLogPolling();
      startSysMonitorPolling();
    } catch (error) {
      if (!trainingLaunched) {
        state._pendingTrainingMetadata = null;
        state.activeTrainingTaskId = '';
      }
      showToast(error.message || '训练请求失败。');
    } finally {
      state.loading.run = false;
      if (state.activeModule === 'training') {
        renderView('training');
      } else if (state.activeModule === 'config') {
        renderView('config');
      } else {
        updateJSONPreview();
      }
    }
  }

  async function terminateAllTasks() {
    const runningTasks = state.tasks.filter((task) => task.status === 'RUNNING');
    if (!runningTasks.length) {
      showToast('当前没有运行中的任务。');
      return;
    }
    try {
      for (const task of runningTasks) {
        await api.terminateTask(task.task_id || task.id);
      }
      showToast('已发送终止请求。');
      const tasksResponse = await api.getTasks();
      const backendTasks = tasksResponse?.data?.tasks || [];
      const localHistory = await loadLocalTaskHistory();
      state.tasks = mergeTaskHistory(backendTasks, localHistory, state.tasks);
      state._taskHistoryDirty = true;
      await saveLocalTaskHistory();
      syncFooterAction();
      if (state.activeModule === 'config') {
        renderView('config');
      }
    } catch (error) {
      showToast(error.message || '终止任务失败。');
    }
  }

  async function deleteTaskHistory(taskId) {
    try {
      await api.deleteTask(taskId);
      state._deletedTaskIds.add(taskId);
      state.tasks = state.tasks.filter((task) => task.id !== taskId);
      await saveLocalTaskHistory();
      delete state.taskSummaries[taskId];
      try {
        const cache = JSON.parse(sessionStorage.getItem('sd-rescripts:task-summaries') || '{}');
        delete cache[taskId];
        sessionStorage.setItem('sd-rescripts:task-summaries', JSON.stringify(cache));
      } catch (error) { /* ignore */ }
      if (state.activeModule === 'training') {
        renderView('training');
      }
      renderTaskStatus();
    } catch (error) {
      showToast(error.message || '删除任务失败。');
    }
  }

  async function clearAllTaskHistory() {
    if (!confirm('确认清空所有已完成的任务历史？\n（正在运行的任务不会被删除）')) return;
    try {
      const resp = await api.deleteAllTasks();
      showToast('已清空 ' + (resp?.data?.deleted || 0) + ' 条任务记录');
      const tasksResponse = await api.getTasks();
      const allBackendTasks = tasksResponse?.data?.tasks || [];
      for (const task of allBackendTasks) {
        if (task.status !== 'RUNNING') state._deletedTaskIds.add(task.id);
      }
      state.tasks = allBackendTasks.filter((task) => !state._deletedTaskIds.has(task.id));
      try { await fetch('/api/local/task_history', { method: 'DELETE' }); } catch (error) { /* ignore */ }
      state.taskSummaries = {};
      try { sessionStorage.removeItem('sd-rescripts:task-summaries'); } catch (error) { /* ignore */ }
      if (state.activeModule === 'training') {
        renderView('training');
      }
      renderTaskStatus();
    } catch (error) {
      showToast(error.message || '清空历史失败。');
    }
  }

  function bindGlobals(targetWindow) {
    targetWindow.runPreflight = runPreflight;
    targetWindow.refreshRuntime = refreshRuntime;
    targetWindow.executeTraining = executeTraining;
    targetWindow.terminateAllTasks = terminateAllTasks;
    targetWindow.deleteTaskHistory = deleteTaskHistory;
    targetWindow.clearAllTaskHistory = clearAllTaskHistory;
  }

  return {
    runPreflight,
    refreshRuntime,
    validateConfigConflicts,
    executeTraining,
    terminateAllTasks,
    deleteTaskHistory,
    clearAllTaskHistory,
    bindGlobals,
  };
}
