// 训练前参数摘要确认卡（Feature 4）
//
// 在 preflight 通过后、api.runTraining 前弹出只读摘要卡，
// 用户确认才真正启动训练，取消则中止。
//
// 使用方式：
//   import { createTrainingSummaryTool } from './trainingSummaryTool.js';
//   const { openTrainingSummary } = createTrainingSummaryTool();
//   window.openTrainingSummary = openTrainingSummary;  // trainingActions.js 通过 window 调用

import { escapeHtml } from './utils/dom.js';

const MODAL_CLASS = 'training-option-help-modal training-summary-modal';

export function createTrainingSummaryTool() {

  function closeTrainingSummary() {
    document.querySelector('.training-summary-modal')?.remove();
  }

  /**
   * 弹出训练摘要确认弹窗，返回 Promise<boolean>。
   * true = 用户点击「确认启动训练」，false = 用户取消或关闭。
   */
  function openTrainingSummary(config, trainingType, _runConfig) {
    closeTrainingSummary();
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = MODAL_CLASS + ' open';
      overlay.innerHTML = renderSummary(config, trainingType);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { closeTrainingSummary(); resolve(false); }
      });

      const confirmBtn = overlay.querySelector('[data-ts-confirm]');
      const cancelBtn  = overlay.querySelector('[data-ts-cancel]');
      if (confirmBtn) confirmBtn.onclick = () => { closeTrainingSummary(); resolve(true); };
      if (cancelBtn)  cancelBtn.onclick  = () => { closeTrainingSummary(); resolve(false); };

      document.body.appendChild(overlay);
    });
  }

  return { openTrainingSummary, closeTrainingSummary };
}

// ── 渲染 ──────────────────────────────────────────────────────────────

function renderSummary(config, trainingType) {
  const rows = buildSummaryRows(config, trainingType);
  const rowsHtml = rows.map(({ label, value, warn }) => `
    <tr class="${warn ? 'ts-row-warn' : ''}">
      <td class="ts-label">${escapeHtml(label)}</td>
      <td class="ts-value">${escapeHtml(String(value ?? '—'))}</td>
    </tr>
  `).join('');

  return `
    <div class="training-option-help-dialog training-summary-dialog"
         role="dialog" aria-modal="true" aria-label="训练参数确认">
      <div class="training-option-help-head">
        <div>
          <span class="training-option-help-category">训练确认</span>
          <h3>🚀 即将启动训练</h3>
        </div>
        <button class="modal-close" type="button" title="取消" data-ts-cancel>×</button>
      </div>
      <div class="training-option-help-body training-summary-body">
        <p class="field-desc">请确认以下参数无误后再启动训练：</p>
        <table class="lora-meta-table training-summary-table">
          <thead>
            <tr><th>参数</th><th>值</th></tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div class="training-option-help-foot">
        <button class="btn btn-outline" type="button" data-ts-cancel>取消</button>
        <button class="btn btn-primary" type="button" data-ts-confirm>✓ 确认启动训练</button>
      </div>
    </div>
  `;
}

function buildSummaryRows(config, trainingType) {
  const c = config || {};
  const rows = [];

  const add = (label, value, { warn = false } = {}) => rows.push({ label, value, warn });

  add('训练类型', trainingType || c.model_train_type || '—');
  add('输出名称', c.output_name || '—', { warn: !c.output_name });
  add('输出目录', c.output_dir || '—', { warn: !c.output_dir });
  add('基础模型', _short(c.pretrained_model_name_or_path));

  // LoRA / 网络
  const networkMod = c.network_module || c.lora_type || '';
  if (networkMod) add('网络模块', networkMod);
  if (c.network_dim)   add('LoRA Rank',  c.network_dim);
  if (c.network_alpha) add('LoRA Alpha', c.network_alpha);

  // 训练参数
  const steps = c.max_train_steps || c.max_train_epochs
    ? (c.max_train_steps ? `${c.max_train_steps} 步` : `${c.max_train_epochs} Epoch`)
    : '—';
  add('训练量', steps);
  if (c.train_batch_size) add('Batch Size', c.train_batch_size);
  if (c.resolution)       add('训练分辨率', c.resolution);

  // 学习率
  const lr = c.unet_lr || c.learning_rate;
  if (lr) add('学习率', lr);
  if (c.optimizer_type || c.optimizer) add('优化器', c.optimizer_type || c.optimizer);
  if (c.lr_scheduler)    add('LR Scheduler', c.lr_scheduler);

  return rows;
}

/** 截断长路径只保留文件名 */
function _short(p) {
  if (!p) return '—';
  return p.replace(/\\/g, '/').split('/').pop() || p;
}
