// renderers/index.js — 渲染层入口
// 在 Stage 2 逐步迁移过程中，已迁移的模块从这里导出，main.js 逐步减负。
// 最终形态：createRenderers(ctx) 工厂统一装配。

export { renderAbout } from './about.js';
export { renderGuide } from './guide.js';
export { renderLogs } from './logs.js';
export { createBuiltinPickerRenderer } from './builtinPickerModal.js';
export { createStatusDeckRenderer } from './statusDeck.js';
export { createNavigatorRenderer } from './navigator.js';
export { createSettingsRenderer } from './settings.js';
export { createConfigFormRenderer } from './configForm.js';
export { createPreflightRenderer } from './preflight.js';
export { createSamplesRenderer } from './samples.js';
export { createWizardRenderer } from './wizard.js';
export { createPluginsRenderer } from './plugins.js';
export { createToolsRenderer } from './tools.js';
export { createDatasetRenderer } from './dataset.js';
export { createSysMonitorRenderer } from './sysMonitor.js';
export { createTrainingRenderer } from './training.js';

