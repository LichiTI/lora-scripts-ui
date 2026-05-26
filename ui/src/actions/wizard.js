// actions/wizard.js — wizard 页 actions
//   wizardSet / wizardStartTraining
//
// 依赖（工厂注入）：state, updateConfigValue, renderView, executeTraining

import { escapeHtml } from '../utils/dom.js';
import { schedulerOption } from '../features/settingsOptions.js';

export function createWizardActions({ state, updateConfigValue, renderView, executeTraining }) {
  function wizardSet(key, value) {
    updateConfigValue(key, value);
    if (key === 'train_length_mode') {
      renderView('wizard');
      return;
    }
    // 刷新右侧预览
    var previewEl = document.getElementById('wz-preview');
    if (previewEl) {
      var c = state.config;
      var rows = [
        ['pretrained_model_name_or_path', 'SDXL 底模', c.pretrained_model_name_or_path],
        ['train_data_dir', '训练数据集', c.train_data_dir],
        ['output_name', '保存名称', c.output_name],
        ['network_module', '网络模块', c.network_module],
        ['network_dim', 'Rank', c.network_dim],
        ['network_alpha', 'Alpha', c.network_alpha],
        ['lycoris_algo', 'LyCORIS 算法', c.network_module === 'lycoris.kohya' ? c.lycoris_algo : ''],
        ['unet_lr', 'U-Net 学习率', c.unet_lr],
        ['optimizer_type', '优化器', c.optimizer_type],
        ['lr_scheduler', '调度器', schedulerOption(c.lr_scheduler).label],
        [(c.train_length_mode || '最大轮数') === '最大步数' ? 'max_train_steps' : 'max_train_epochs', (c.train_length_mode || '最大轮数') === '最大步数' ? '训练步数' : '训练轮数', (c.train_length_mode || '最大轮数') === '最大步数' ? c.max_train_steps : c.max_train_epochs],
        ['train_batch_size', '批量大小', c.train_batch_size],
        ['gradient_accumulation_steps', '梯度累加', c.gradient_accumulation_steps],
        ['enable_preview', '预览图', c.enable_preview ? '开启' : '关闭'],
        ['mixed_precision', '混合精度', c.mixed_precision],
      ];
      var html = '<table class="wizard-preview-table">';
 for (var i = 0; i < rows.length; i++) {
        var k = rows[i][0], lbl = rows[i][1], val = rows[i][2];
        if (val === '' || val === undefined || val === null) continue;
        html += '<tr class="wizard-preview-row" title="' + escapeHtml(k) + '">'
          + '<td class="wizard-preview-key">' + escapeHtml(lbl) + '</td>'
          + '<td class="wizard-preview-val">' + escapeHtml(String(val)) + '</td>'
          + '</tr>';
      }
      html += '</table>';
      previewEl.innerHTML = html;
    }
  }

  async function wizardStartTraining() {
    // 切换到训练模块
    state.activeModule = 'training';
    state.trainSubTab = 'monitor';
    document.querySelectorAll('.nav-item').forEach(function(el) {
      el.classList.toggle('active', el.dataset.module === 'training');
    });
    renderView('training');
    // 触发训练
    await executeTraining();
  }

  return { wizardSet, wizardStartTraining };
}
