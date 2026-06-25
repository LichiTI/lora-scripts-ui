export function createExperimentalTrainingActions({
  state,
  api,
  showToast,
  renderView,
}) {
  function switchToTrainingMonitor() {
    state.trainSubTab = 'monitor';
    state.activeModule = 'training';
    renderView('training');
  }

  function getOutputPath() {
    return String(state.config?.output_path || '').trim();
  }

  function getRuntimeId() {
    return state.config?.runtime_id || state.config?.execution_profile_id || '';
  }

  async function validateTurboLoraOutputFromConfig() {
    const outputPath = getOutputPath();
    if (!outputPath) {
      showToast('请先填写输出 LoRA 路径。');
      return;
    }
    try {
      showToast('正在提交输出 sidecar 验证任务...');
      const response = await api.validateTurboLoraOutput(outputPath, getRuntimeId());
      if (response.status !== 'success') {
        showToast(response.message || '输出验证任务提交失败。');
        return;
      }
      showToast(response.message || '输出验证任务已提交，可在训练监控/日志中查看。');
      switchToTrainingMonitor();
    } catch (error) {
      showToast(error.message || '输出验证请求失败。');
    }
  }

  async function reportTurboLoraSamplesFromConfig() {
    const outputPath = getOutputPath();
    if (!outputPath) {
      showToast('请先填写输出 LoRA 路径。');
      return;
    }
    try {
      showToast('正在提交样张报告任务...');
      const response = await api.reportTurboLoraSamples(
        outputPath,
        String(state.config?.samples_dir || '').trim(),
        getRuntimeId(),
      );
      if (response.status !== 'success') {
        showToast(response.message || '样张报告任务提交失败。');
        return;
      }
      showToast(response.message || '样张报告任务已提交，可在训练监控/日志中查看。');
      switchToTrainingMonitor();
    } catch (error) {
      showToast(error.message || '样张报告请求失败。');
    }
  }

  return {
    validateTurboLoraOutputFromConfig,
    reportTurboLoraSamplesFromConfig,
  };
}
