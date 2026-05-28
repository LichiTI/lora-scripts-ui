// actions/trainingActions.js — 训练启动核心流程
//   validateConfigConflicts / executeTraining
//
// 依赖较多，均通过工厂注入。保持零行为变更。

export function createTrainingActions({
  state,
  api,
  showToast,
  renderView,
  updateJSONPreview,
  syncFooterAction,
  buildRunConfig,
  buildTaskMetadataFromConfig,
  resetTrainingMetrics,
  rememberTrainingTaskMetadata,
  getPendingTrainingMetadata,
  applyTaskMetadata,
  loadLocalTaskHistory,
  saveLocalTaskHistory,
  mergeTaskHistory,
  refreshTrainingLog,
  startTrainingLogPolling,
  startSysMonitorPolling,
}) {
  function switchToTrainingMonitor() {
    state.activeModule = 'training';
    state.trainSubTab = 'monitor';
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.module === 'training');
    });
  }

  function validateConfigConflicts() {
    const c = state.config;
    const tt = state.activeTrainingType;
    const errors = [];
    const warnings = [];
    const isSageEnv = (state.runtime?.runtime?.environment || '').includes('sageattention');
    const toBool = (v) => v === true || v === 'true' || v === 1;
    const toNum = (v) => { const n = Number(v); return Number.isNaN(n) ? 0 : n; };
    const networkModule = String(c.network_module || '').trim().toLowerCase();
    const loraType = String(c.lora_type || '').trim().toLowerCase();
    const optimizerText = `${c.optimizer_type || ''} ${c.optimizer || ''}`.toLowerCase();
    const routeText = String((tt || '') + ' ' + (c.model_train_type || '')).toLowerCase();
    const isNativeDitSelectiveRoute = routeText.includes('anima') || routeText.includes('newbie');
    const swapGranularity = String(c.swap_granularity || 'off').trim().toLowerCase().replace('-', '_');
    const validSwapGranularities = new Set(['off', 'auto', 'block', 'merged_block', 'layer']);
    const swapRatio = toNum(c.swap_ratio);
    const swapCount = toNum(c.swap_count);
    const legacyBlocksToSwap = toNum(c.blocks_to_swap);
    const memorySwapEnabled = (swapGranularity !== 'off' && (swapRatio > 0 || swapCount > 0 || swapGranularity === 'auto')) || legacyBlocksToSwap > 0;
    const moduleOffloadEnabled = toBool(c.module_offload_enabled);
    const moduleOffloadRatio = toNum(c.module_offload_ratio);
    const moduleOffloadBackboneRatio = c.module_offload_backbone_ratio === '' || c.module_offload_backbone_ratio == null ? null : toNum(c.module_offload_backbone_ratio);
    const moduleOffloadTextEncoderRatio = c.module_offload_text_encoder_ratio === '' || c.module_offload_text_encoder_ratio == null ? null : toNum(c.module_offload_text_encoder_ratio);
    const effectiveModuleOffloadBackboneRatio = moduleOffloadBackboneRatio == null ? moduleOffloadRatio : moduleOffloadBackboneRatio;
    const effectiveModuleOffloadTextEncoderRatio = moduleOffloadTextEncoderRatio == null ? moduleOffloadRatio : moduleOffloadTextEncoderRatio;
    const moduleOffloadRequested = moduleOffloadEnabled && (effectiveModuleOffloadBackboneRatio > 0 || effectiveModuleOffloadTextEncoderRatio > 0);
    const distributedEnabled = toBool(c.enable_distributed_training) || toBool(c.enable_distributed) || toBool(c.multi_gpu) || toNum(c.num_processes) > 1 || toNum(c.num_machines) > 1;
    const moduleOffloadPipelineRoute = String(tt || '').includes('controlnet') || String(tt || '').includes('ip-adapter') || String(tt || '').includes('lllite') || toBool(c.ip_adapter_enabled) || Boolean(String(c.controlnet_model || '').trim());
    const checkpointPolicy = String(c.checkpoint_policy || 'auto').trim().toLowerCase().replace('-', '_');
    const checkpointRequestsOffload = checkpointPolicy === 'offloaded' || (checkpointPolicy === 'auto' && toBool(c.cpu_offload_checkpointing));
    const checkpointRequestsGenericGradient = checkpointPolicy === 'full' || (checkpointPolicy === 'selective' && !isNativeDitSelectiveRoute) || (checkpointPolicy === 'auto' && toBool(c.gradient_checkpointing));
    const flowModel = String(c.flow_model || '').trim();
    const flowEnabled = flowModel === 'rectified_flow' || flowModel === 'cfm' || toBool(c.flow_model);
    const timestepSampling = String(c.timestep_sampling || c.flow_timestep_distribution || 'uniform');
    const supportedVramSwapModules = new Set([
      'networks.lora',
      'networks.lora_fa',
      'networks.vera',
      'networks.tlora',
      'networks.lora_flux',
      'networks.tlora_flux',
      'networks.lora_sd3',
      'networks.lora_lumina',
      'networks.lora_hunyuan_image',
      'networks.lora_anima',
      'networks.tlora_anima',
    ]);
    const unsupportedVramSwapOptimizerKeywords = ['bitsandbytes', '8bit', 'paged', 'ademamix'];

    // 1. 缓存文本编码器输出 与 标签打乱/丢弃 冲突
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

    // 2. 缓存文本编码器输出 与 训练文本编码器 冲突
    if (toBool(c.cache_text_encoder_outputs) && !toBool(c.network_train_unet_only)) {
      errors.push('训练文本编码器时不能同时启用「缓存文本编码器输出」。请先关闭该缓存或开启「仅训练 U-Net」。');
    }

    // 3. 磁盘缓存暗示内存缓存
    if (toBool(c.cache_text_encoder_outputs_to_disk) && !toBool(c.cache_text_encoder_outputs)) {
      errors.push('「缓存文本编码器输出到磁盘」已开启但「缓存文本编码器输出」未开启。请一并勾选「缓存文本编码器输出」。');
    }

    // 4. 注意力后端全部未开启
    if (!toBool(c.xformers) && !toBool(c.sdpa) && !toBool(c.sageattn) && !toBool(c.flashattn) && !toBool(c.mem_eff_attn)) {
      errors.push('未启用任何注意力加速后端（xformers / SDPA / SageAttention / FlashAttention）。训练将极度缓慢且显存占用极高。请至少开启 SDPA。');
    }


    // 6. xformers + SDPA 同时开启
    if (toBool(c.xformers) && toBool(c.sdpa)) {
      // 不阻断，但给提示（这里不加 error，只在 preflight 里显示 g）
    }

    // 7. 桶划分单位校验
    const bucketStep = toNum(c.bucket_reso_steps) || 64;
    if ((tt.startsWith('sdxl') || tt === 'sdxl-controlnet') && bucketStep % 32 !== 0) {
      errors.push(`SDXL 训练的桶划分单位必须是 32 的倍数，当前值 ${bucketStep} 不符合。`);
    }
    if ((tt.startsWith('sd-') || tt === 'sd-dreambooth') && bucketStep % 64 !== 0) {
      errors.push(`SD1.5 训练的桶划分单位必须是 64 的倍数，当前值 ${bucketStep} 不符合。`);
    }

    // 8. 仅训练 U-Net 和 仅训练文本编码器 同时勾选
    if (toBool(c.network_train_unet_only) && toBool(c.network_train_text_encoder_only)) {
      errors.push('不能同时勾选「仅训练 U-Net」和「仅训练文本编码器」。请只保留其中一个，或两个都不勾（即两者都训练）。');
    }


    // 9. noise_offset 与 multires_noise_iterations 冲突
    if (toNum(c.noise_offset) > 0 && toNum(c.multires_noise_iterations) > 0) {
      errors.push('noise_offset 与 multires_noise_iterations 不能同时使用。请只保留其中一个噪声策略。');
    }

    // 10. full_fp16 与 full_bf16 冲突
    if (toBool(c.full_fp16) && toBool(c.full_bf16)) {
      errors.push('不能同时启用「完全 FP16」和「完全 BF16」。请只保留其中一个。');
    }

    if (networkModule=== 'lycoris.kohya' && toBool(c.dora_wd) && toBool(c.bypass_mode)) {
      warnings.push('当前 LyCORIS 同时启用了「DoRA」和「Bypass Mode」。这条组合存在已知 bypass 缺陷风险，建议关闭 bypass_mode。');
    }
    if (networkModule === 'lycoris.kohya' && String(c.lycoris_algo || '').toLowerCase() === 'ia3' && toBool(c.train_norm)) {
      warnings.push('当前 LyCORIS 算法为 IA3，一般不建议同时开启「训练 Norm 层」，请确认这是你有意为之。');
    }

    if (toBool(c.vram_swap_to_ram)) {
      if (toBool(c.full_fp16) || toBool(c.full_bf16)) {
        warnings.push('已启用「VRAMSwap to RAM」，但它暂不支持与 full_fp16 /full_bf16 同时使用，后端会自动忽略该项。');
      }
      if (toBool(c.deepspeed)) {
        warnings.push('已启用「VRAM Swap to RAM」，但它暂不支持与 DeepSpeed 同时使用，后端会自动忽略该项。');
      }
      if (toBool(c.enable_distributed_training)) {
       warnings.push('已启用「VRAM Swap to RAM」，但它当前只支持单进程训练。若本次按分布式方式启动，后端会自动忽略该项。');
      }
      if (unsupportedVramSwapOptimizerKeywords.some((keyword) => optimizerText.includes(keyword))) {
        warnings.push(`已启用「VRAM Swap to RAM」，但当前优化器「${c.optimizer_type || '未知优化器'}」暂不在支持范围内，后端会自动忽略该项。`);
      }
      if (isAnimaRoute) {
        if (!['lora', 'lora_fa', 'vera', 'tlora'].includes(loraType)) {
          warnings.push(`已启用「VRAM Swap to RAM」，但当前 Anima 适配器类型「${c.lora_type || '未识别'}」暂不支持。现阶段仅支持 LoRA / LoRA-FA / VeRA / T-LoRA，后端会自动忽略该项。`);
        }
      } else if (!supportedVramSwapModules.has(networkModule)) {
        warnings.push(`已启用「VRAM Swap to RAM」，但当前网络路线「${c.network_module || '未识别'}」暂不支持。现阶段仅支持原生 LoRA / LoRA-FA / VeRA / T-LoRA 路线，后端会自动忽略该项。`);
      }
    }

    // 11. 学习率为 0 警告
    const effUnetLr = Number(c.unet_lr || c.learning_rate || 0);
    const effTeLr = Number(c.text_encoder_lr || c.learning_rate || 0);
    if (toBool(c.network_train_unet_only) && effUnetLr === 0){
      warnings.push('当前仅训练 U-Net，但 U-Net 学习率为 0，训练将无效。');
    }
    if (toBool(c.network_train_text_encoder_only) && effTeLr === 0) {
      warnings.push('当前仅训练文本编码器，但文本编码器学习率为 0，训练将无效。');
    }

    // 12. 缓存 latent 到磁盘但未开缓存
    if (toBool(c.cache_latents_to_disk) && !toBool(c.cache_latents)) {
      warnings.push('「缓存 Latent 到磁盘」已开启但「缓存 Latent」未开启。建议一并开启。');
    }

    // 13. 显存交换 / 模块级 Offload 冲突
    if (!validSwapGranularities.has(swapGranularity)) {
      errors.push(`显存交换模式无效：${swapGranularity}。`);
    }
    if (swapRatio < 0 || swapRatio > 1) {
      errors.push('显存交换比例必须在 0 到 1 之间。');
    }
    if (memorySwapEnabled && toBool(c.torch_compile)) {
      errors.push('显存交换不能与 torch.compile 同时使用。请关闭其中一个。');
    }
    if (memorySwapEnabled && toBool(c.vram_swap_to_ram)) {
      errors.push('显存交换不能与 VRAM Swap to RAM 同时使用。请只保留一种显存搬运策略。');
    }
    if (memorySwapEnabled && (toBool(c.safe_fallback) || toBool(c.newbie_safe_fallback))) {
      errors.push('显存交换不能与 OOM 安全回退同时使用。请关闭其中一个。');
    }
    if (swapGranularity === 'layer' && checkpointRequestsGenericGradient) {
      errors.push('Layer Swap 不能与通用梯度检查点同时使用。请改用 block/merged_block，或关闭 full / 会回退为 full 的 selective checkpoint。');
    }
    if (memorySwapEnabled && checkpointRequestsOffload) {
      warnings.push('显存交换与 cpu_offload_checkpointing 通常不建议同时使用。');
    }

    if (moduleOffloadRatio < 0 || moduleOffloadRatio > 100) {
      errors.push('模块级 Offload 总比例必须在 0 到 100 之间。');
    }
    if (moduleOffloadBackboneRatio != null && (moduleOffloadBackboneRatio < 0 || moduleOffloadBackboneRatio > 100)) {
      errors.push('模块级 Offload 的主干覆盖比例必须在 0 到 100 之间。');
    }
    if (moduleOffloadTextEncoderRatio != null && (moduleOffloadTextEncoderRatio < 0 || moduleOffloadTextEncoderRatio > 100)) {
      errors.push('模块级 Offload 的文本编码器覆盖比例必须在 0 到 100 之间。');
    }
    if (moduleOffloadRequested && memorySwapEnabled) {
      errors.push('模块级 Offload 不能与现有显存交换同时使用。请关闭其中一个。');
    }
    if (moduleOffloadRequested && toBool(c.vram_swap_to_ram)) {
      errors.push('模块级 Offload 不能与 VRAM Swap to RAM 同时使用。请只保留一种 CPU offload 策略。');
    }
    if (moduleOffloadRequested && (toBool(c.safe_fallback) || toBool(c.newbie_safe_fallback))) {
      errors.push('模块级 Offload 不能与 OOM 安全回退同时使用。请关闭其中一个。');
    }
    if (moduleOffloadRequested && toBool(c.torch_compile)) {
      errors.push('模块级 Offload 不能与 torch.compile 同时使用。请关闭其中一个。');
    }
    if (moduleOffloadRequested && distributedEnabled) {
      errors.push('模块级 Offload v1 目前只支持单 GPU eager 训练，不能与分布式 / 多卡同时使用。');
    }
    if (moduleOffloadRequested && toBool(c.deepspeed)) {
      errors.push('模块级 Offload v1 不能与 DeepSpeed 同时使用。');
    }
    if (moduleOffloadRequested && moduleOffloadPipelineRoute) {
      errors.push('模块级 Offload v1 不能用于 ControlNet / IP-Adapter / LLLite 路线。');
    }
    if (moduleOffloadRequested && checkpointRequestsGenericGradient) {
      errors.push('模块级 Offload v1 不能与通用梯度检查点同时使用。');
    }
    if (moduleOffloadRequested && checkpointRequestsOffload) {
      errors.push('模块级 Offload 不能与 cpu_offload_checkpointing 同时使用。');
    }

    // 14. Flow Matching 参数校验
    if (flowEnabled && toBool(c.v_parameterization)) {
      errors.push('Flow Matching 不能与「V 参数化」同时开启。请二选一。');
    }

    // 15. 对比 Flow Matching 依赖 Rectified Flow
    if (toBool(c.contrastive_flow_matching) && !flowEnabled) {
      errors.push('启用「对比 Flow Matching」前，必须先开启「Rectified Flow」。');
    }

    // 16. RF logit-normal 标准差必须大于 0
    if (flowEnabled && timestepSampling === 'logit_normal' && toNum(c.flow_logit_std) <= 0) {
      errors.push('RF Logit Std 必须大于 0。');
    }

    // 17. RF 固定偏移比率不能小于 0
    if (flowEnabled && c.flow_uniform_static_ratio !== '' && c.flow_uniform_static_ratio != null && toNum(c.flow_uniform_static_ratio) < 0) {
      errors.push('RF 固定偏移比率不能小于 0。');
    }


    return { errors,warnings };
  }

  function getLabLaunchApi(trainingType) {
    if (trainingType === 'lab-distiller') return api.startLabDistiller;
    if (trainingType === 'sdxl-turbo-lora') return api.startTurboLora;
    if (trainingType === 'anima-few-step-lora' || trainingType === 'newbie-few-step-lora') {
      return api.startDitFewStepLora;
    }
    return null;
  }

  async function executeTraining() {
    state.loading.run = true;
    const runConfig = buildRunConfig(state.config, state.activeTrainingType);
    const launchMetadata = buildTaskMetadataFromConfig(runConfig, state.activeTrainingType);
    const labLaunchApi = getLabLaunchApi(state.activeTrainingType);
    syncFooterAction();
    resetTrainingMetrics();
    let trainingLaunched = false;
    const clientCheck = validateConfigConflicts();
    if (clientCheck.errors.length > 0) {
      showToast(clientCheck.errors[0]);
      state.preflight = { can_start: false, errors: clientCheck.errors, warnings: clientCheck.warnings };
      state.loading.run = false;
      syncFooterAction();
      if (state.activeModule === 'config') renderView('config');
      return;
    }
    // sage 环境警告：不阻断，但弹确认
    if (clientCheck.warnings.length > 0) {
      const proceed = confirm(clientCheck.warnings.join('\n\n') + '\n\n是否继续训练？');
      if (!proceed) {
     state.loading.run = false;
        syncFooterAction();
        return;
      }
    }

    try {
      if (!labLaunchApi) {
        const preflightResponse =await api.runPreflight(runConfig);
        if (preflightResponse.status !== 'success' || !preflightResponse.data?.can_start) {
          state.preflight = preflightResponse.data || {
            can_start: false,
        errors: [preflightResponse.message || '训练预检阻止了本次训练。'],
            warnings: [],
          };
          state.loading.run = false;
          syncFooterAction();
          showToast('预检未通过，请先修正错误。');
          return;
        }

        state.preflight = preflightResponse.data;
        if (state.preflight?.execution_profile_id) {
          runConfig.execution_profile_id = state.preflight.execution_profile_id;
        }
        if (state.preflight?.resolved_attention_backend) {
          runConfig.attention_backend = state.preflight.resolved_attention_backend;
        }
      } else {
        state.preflight = {
          can_start: true,
          errors: [],
          warnings: ['实验训练由 Lulynx LAB 后端路由校验，已跳过普通 sd-scripts 预检。'],
        };
      }
      state._pendingTrainingMetadata = launchMetadata;
      state.activeTrainingTaskId = '';
      const response = labLaunchApi ? await labLaunchApi(runConfig) : await api.runTraining(runConfig);
      if (response.status !== 'success') {
        state._pendingTrainingMetadata = null;
      state.activeTrainingTaskId = '';
        showToast(response.message || '训练启动失败。');
        return;
      }
      trainingLaunched = true;

      state.trainingFailed = false;
      state.lastMessage = response.message || (labLaunchApi ? '实验训练任务已提交。' : '训练已启动。');
      showToast(state.lastMessage);
      resetTrainingMetrics();
      const responseTaskId = response?.data?.task_id || response?.data?.id || '';
      if (response?.data?.execution_profile_id) {
        launchMetadata.execution_profile_id = response.data.execution_profile_id;
      }
      if (response?.data?.resolved_attention_backend) {
        launchMetadata.attention_backend = response.data.resolved_attention_backend;
      }
      if (responseTaskId) state.activeTrainingTaskId = responseTaskId;
      if (responseTaskId) rememberTrainingTaskMetadata(responseTaskId, launchMetadata);
      switchToTrainingMonitor();
      renderView('training');
      const tasksResponse = await api.getTasks();
      const freshTasks = tasksResponse?.data?.tasks || [];
      const localHistory = await loadLocalTaskHistory();
      for (const t of freshTasks) {
        // 为刚启动的新任务注入元数据，后端 dump 只返回 id/status/returncode
        // 对 RUNNING 任务且缺少 output_name 的注入元数据（新任务 or 之前漏注入的）
        if (t.status === 'RUNNING') {
          const meta = getPendingTrainingMetadata(t.id) || (!state.activeTrainingTaskId ? launchMetadata : null);
          if (meta) {
            if (!state.activeTrainingTaskId) rememberTrainingTaskMetadata(t.id, meta);
            applyTaskMetadata(t, meta, { force: false });
          }
        }
}
      state.tasks = mergeTaskHistory(freshTasks, localHistory, state.tasks);
      state._taskHistoryDirty = true;
      await saveLocalTaskHistory();
      await refreshTrainingLog(state.activeTrainingTaskId || responseTaskId);
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
      syncFooterAction();
      if (state.activeModule === 'training') {
        renderView('training');
      } else if (state.activeModule === 'config') {
        renderView('config');
      } else {
        updateJSONPreview();
      }
    }
  }

  return { validateConfigConflicts, executeTraining };
}



