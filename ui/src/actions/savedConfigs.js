// actions/savedConfigs.js —配置保存/读取/导入导出 actions
//   setupImportConfig /switchTrainingType / saveCurrentParams / loadSavedParams /
//   loadNamedConfig / deleteSavedConfig / renameSavedConfig / previewSavedConfig /
//   downloadConfigFile / importConfigFile
//
// 依赖（工厂注入）。保持零行为变更。

import { $, escapeHtml } from '../utils/dom.js';

export function createSavedConfigsActions({
  state,
  api,
  showToast,
  renderView,
  renderNavigator,
  saveDraft,
  resetTransientState,
  updateJSONPreview,
  enforceLycorisDoraSafety,
  mergeConfigPatch,
  // schema
  createDefaultConfig,
  TRAINING_TYPES,
  SCHEDULER_TYPE_TO_VALUE,
  // utils
  parseSimpleToml,
  configToToml,
  buildRunConfig,
  // constants
  DRAFT_STORAGE_KEY,
}) {
  function setupImportConfig() {
    if (state.importInputBound) {
      return;
    }
    const input = $('#config-file-input');
    if (!input) {
      return;
    }
    state.importInputBound = true;
    input.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      try {
        const text = await file.text();
        let parsed;
        if (file.name.endsWith('.toml')) {
        parsed = parseSimpleToml(text);
        } else {
          parsed = JSON.parse(text);
        }
        // ── 旧格式兼容：把 network_args 数组反向映射回独立 UI 字段 ──
        if (Array.isArray(parsed.network_args) && !parsed.lycoris_algo) {
          const argMap = {};
          for (const item of parsed.network_args) {
            const eq = String(item).indexOf('=');
            if (eq > 0) argMap[String(item).slice(0, eq).trim()] = String(item).slice(eq + 1).trim();
          }
          if (argMap.algo) {
            parsed.lycoris_algo = argMap.algo;
            if (!parsed.network_module) parsed.network_module = 'lycoris.kohya';
          }
          if (argMap.conv_dim != null) { const n = Number(argMap.conv_dim); parsed.conv_dim = Number.isNaN(n) ? '' : n; }
          if (argMap.conv_alpha != null) { const n = Number(argMap.conv_alpha); parsed.conv_alpha = Number.isNaN(n) ? '' : n; }
          if (argMap.preset != null) parsed.lycoris_preset = argMap.preset;
          if (argMap.dropout != null) { const n = Number(argMap.dropout); parsed.dropout = Number.isNaN(n) ? '' : n; }
          if (argMap.rank_dropout != null) { const n = Number(argMap.rank_dropout); parsed.rank_dropout = Number.isNaN(n) ? '' : n; }
          if (argMap.module_dropout != null) { const n = Number(argMap.module_dropout); parsed.module_dropout = Number.isNaN(n) ? '' : n; }
          if (argMap.train_norm != null) parsed.train_norm = argMap.train_norm === 'True';
          if (argMap.use_tucker != null) parsed.use_tucker = argMap.use_tucker === 'True';
          else if (argMap.use_cp != null) parsed.use_tucker = argMap.use_cp === 'True';
          else if (argMap.use_conv_cp != null) parsed.use_tucker = argMap.use_conv_cp === 'True';
    else if (argMap.disable_conv_cp != null) parsed.use_tucker = argMap.disable_conv_cp !== 'True';
          if (argMap.use_scalar != null) parsed.use_scalar = argMap.use_scalar === 'True';
          if (argMap.block_size != null) { const n = Number(argMap.block_size); parsed.block_size = Number.isNaN(n) ? '' : n; }
          if (argMap.rescaled != null) parsed.rescaled = argMap.rescaled === 'True';
          if (argMap.constraint != null) { const n = Number(argMap.constraint); parsed.constraint = Number.isNaN(n) ? '' : n; }
          else if (argMap.constrain != null) { const n = Number(argMap.constrain); parsed.constraint = Number.isNaN(n) ? '' : n; }
          if (argMap.rs_lora != null) parsed.rs_lora = argMap.rs_lora === 'True';
          if (argMap.factor != null){ const n = Number(argMap.factor); parsed.lokr_factor = Number.isNaN(n) ? '' : n; }
          if (argMap.dora_wd != null) parsed.dora_wd = argMap.dora_wd === 'True';
          if (argMap.wd_on_output != null) parsed.wd_on_output = argMap.wd_on_output === 'True';
          if (argMap.bypass_mode != null) parsed.bypass_mode = argMap.bypass_mode === 'True';
          if (argMap.decompose_both != null) parsed.decompose_both = argMap.decompose_both === 'True';
          if (argMap.full_matrix != null) parsed.full_matrix = argMap.full_matrix === 'True';
          if (argMap.unbalanced_factorization != null) parsed.unbalanced_factorization = argMap.unbalanced_factorization === 'True';
          if (argMap.scale_weight_norms != null) { const n = Number(argMap.scale_weight_norms); parsed.scale_weight_norms = Number.isNaN(n) ? '' : n; }
          const structured = new Set(['algo', 'conv_dim', 'conv_alpha', 'preset', 'dropout', 'rank_dropout', 'module_dropout', 'train_norm', 'use_tucker', 'use_scalar', 'block_size', 'rescaled', 'constraint', 'constrain', 'rs_lora', 'factor', 'dora_wd', 'wd_on_output', 'bypass_mode', 'decompose_both', 'full_matrix', 'unbalanced_factorization', 'scale_weight_norms', 'disable_conv_cp', 'use_cp', 'use_conv_cp']);
          const remaining =parsed.network_args.filter(a => { const k = String(a).split('=')[0].trim(); return !structured.has(k); });
          if (remaining.length > 0) parsed.network_args_custom = remaining.join('\n');
          delete parsed.network_args;
        }
        // 旧格式：optimizer_args 数组 → 还原 Prodigy 字段
        if (Array.isArray(parsed.optimizer_args) && !parsed.optimizer_args_custom) {
          const remainingArgs = [];
          for (const arg of parsed.optimizer_args) {
            const eqIdx = String(arg).indexOf('=');
            const k = eqIdx > 0 ? String(arg).slice(0, eqIdx).trim() : '';
            const v = eqIdx > 0 ? String(arg).slice(eqIdx + 1).trim() : '';
            if (k === 'd_coef') { parsed.prodigy_d_coef = v; }
            else if (k === 'd0') { parsed.prodigy_d0 = v; }
            else { remainingArgs.push(String(arg)); }
          }
          if (remainingArgs.length > 0) parsed.optimizer_args_custom = remainingArgs.join('\n');
          delete parsed.optimizer_args;
        }
        // 旧格式：lr_scheduler_args 数组 → string
        if (Array.isArray(parsed.lr_scheduler_args)) {
          parsed.lr_scheduler_args = parsed.lr_scheduler_args.join('\n');
        }
        // 自定义调度器类路径 → UI 下拉显示值
        if (typeof parsed.lr_scheduler_type === 'string') {
          const schedulerType = parsed.lr_scheduler_type.trim();
          const bridgedScheduler = SCHEDULER_TYPE_TO_VALUE[schedulerType];
          if (bridgedScheduler) {
            parsed.lr_scheduler = bridgedScheduler;
            delete parsed.lr_scheduler_type;
          }
        }
        // 导入文件时先重置为默认配置，防止旧参数残留
        const importType = parsed.model_train_type || state.activeTrainingType;
        if (importType &&importType !== state.activeTrainingType) {
          window.switchTrainingType(importType);
        }
        state.config = createDefaultConfig(state.activeTrainingType);
        mergeConfigPatch(parsed);
        state.hasLocalDraft = true;
        saveDraft();
        renderView(state.activeModule);
        showToast('配置文件已导入。');
      } catch (error) {
        showToast(error.message || '导入配置文件失败。');
      } finally {
        input.value = '';
      }
    });
  }

  function switchTrainingType(typeId) {
    if (typeId === state.activeTrainingType) return;
    state.activeTrainingType = typeId;
    localStorage.setItem('sd-rescripts:training-type', typeId);
    // 重建配置，保留共用字段的当前值
    const oldConfig = { ...state.config };
    state.config = createDefaultConfig(typeId);
    for (const key of Object.keys(state.config)) {
      if (key === 'model_train_type') continue;
      if (oldConfig[key] !== undefined && oldConfig[key] !== '') {
        state.config[key] = oldConfig[key];
      }
    }
    enforceLycorisDoraSafety();
    state.hasLocalDraft = false;
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    resetTransientState();
    saveDraft();
    if (state.activeModule === 'config') {
      renderView('config');
    } else {
      updateJSONPreview();
    }
  }

  async function saveCurrentParams() {
    const defaultName = state.config.output_name || state.config.pretrained_model_name_or_path?.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || '';
    const modal = $('#builtin-picker-modal');
    const title = $('#builtin-picker-title');
    const pathEl = $('#builtin-picker-path');
    const list = $('#builtin-picker-list');
    if (!modal || !title || !pathEl || !list) return;

    title.textContent = '保存当前参数';
    pathEl.textContent = '请输入保存名称，保存后会直接写入本地文件。';
    list.innerHTML = `
      <div class="save-params-form">
        <input type="text" id="save-params-name" class="text-input" value="${escapeHtml(defaultName)}" placeholder="输入参数名称">
        <button class="btn btn-primary btn-sm" type="button" id="save-params-confirm">保存</button>
      </div>
    `;
    modal.classList.add('open');

    const nameInput = $('#save-params-name');
   const confirmBtn = $('#save-params-confirm');

    // 预加载已存在的名称集合，用于同名检测
    const existingNames = new Set();
    try {
      const listResp = await api.listSavedConfigs();
      const configs = listResp?.data?.configs || [];
      for (const item of configs) {
        if (item && typeof item.name === 'string') existingNames.add(item.name);
      }
    } catch (_) {
      // 获取列表失败不阻断保存流程，后端仍会接收请求
    }

    const submit = async () => {
      const name = nameInput?.value?.trim();
      if (!name) {
        if (pathEl) pathEl.textContent = '请输入保存名称。';
        nameInput?.focus();
        return;
      }
      // 同名双重确认，避免静默覆盖已保存的参数
      const safeName = name.replace(/[<>:"/\\|?*]/g, '_').trim();
      if (existingNames.has(name) || existingNames.has(safeName)) {
        const confirmed = window.confirm(`已存在同名参数：“${name}”。\n是否覆盖原有保存内容？\n如需保留原有参数，请取消后修改名称。`);
        if (!confirmed) {
          if (pathEl) pathEl.textContent = '为避免覆盖原有参数，请修改名称后重试。';
          if (nameInput) {
            nameInput.focus();
            nameInput.select();
          }
          return;
        }
      }
      try {
        // 保存原始 UI 状态（而非 buildRunConfig 转换后的后端 payload），
        // 这样 LyCORIS 算法、日志前缀等 UI 专属字段不会丢失
        const payload = {};
for (const [k, v] of Object.entries(state.config)) {
          if (v !== '' && v != null) payload[k] = v;
        }
        payload.__training_type__ = state.activeTrainingType;
        await api.saveConfig(name, payload);
        saveDraft();
        state.hasLocalDraft = true;
        modal.classList.remove('open');
        showToast('参数已保存：' + name);
        if (state.activeModule === 'config') {
          renderView('config');
  } else {
          renderNavigator();
        }
      } catch (error) {
        if (pathEl) pathEl.textContent = error.message || '保存失败。';
        if (nameInput) {
          nameInput.style.borderColor = 'var(--danger, #d9534f)';
          nameInput.focus();
          nameInput.select();
        }
      }
    };

   confirmBtn?.addEventListener('click', submit);
   nameInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
    nameInput?.focus();
    nameInput?.select();
  }

  async function loadSavedParams() {
    const modal = $('#builtin-picker-modal');
    const title = $('#builtin-picker-title');
    const pathEl = $('#builtin-picker-path');
    const list = $('#builtin-picker-list');
    if (!modal || !title || !pathEl || !list) return;

    title.textContent = '读取已保存参数';
    pathEl.textContent = '选择一个已保存的参数，点击后立即载入。';
    list.innerHTML = '<div class="builtin-picker-empty"><span>加载中...</span></div>';
    const footer = document.querySelector('.builtin-picker-footer');
    if (footer) footer.innerHTML = `<button class="btn btn-outline btn-sm" type="button" id="builtin-picker-cancel" onclick="closeBuiltinPicker()">取消</button>`;
    modal.classList.add('open');

try {
      const response = await api.listSavedConfigs();
      const configs = response?.data?.configs || [];
      if (!configs.length) {
        list.innerHTML = '<div class="builtin-picker-empty"><span>未检测到内容</span></div>';
        return;
      }
 list.innerHTML = configs.map((configItem) => `
        <div class="builtin-picker-item" type="button">
          <span class="builtin-picker-name">${escapeHtml(configItem.name)}</span>
          <span class="builtin-picker-time">${new Date(configItem.time).toLocaleString('zh-CN')}</span>
          <button class="btn btn-outline btn-sm btn-picker-action" type="button" onclick="previewSavedConfig('${escapeHtml(configItem.name)}')">预览</button>
          <button class="btn btn-outline btn-sm btn-picker-action" type="button" onclick="loadNamedConfig('${escapeHtml(configItem.name)}')">载入</button>
          <button class="btn btn-outline btn-sm btn-picker-action" type="button" onclick="event.stopPropagation(); renameSavedConfig('${escapeHtml(configItem.name)}')">重命名</button>
          <button class="builtin-picker-delete-btn" type="button" title="删除" onclick="event.stopPropagation(); deleteSavedConfig('${escapeHtml(configItem.name)}')">✕</button>
        </div>
      `).join('');
    } catch (error) {
      pathEl.textContent = error.message|| '读取列表失败。';
      list.innerHTML= '<div class="builtin-picker-empty"><span>未检测到内容</span></div>';
    }
  }

  async function loadNamedConfig(name) {
    const pathEl = $('#builtin-picker-path');
    try {
      const response = await api.loadSavedConfig(name);
      const data = response?.data;
      if (!data) {
        throw new Error('参数内容为空。');
      }
      // 自动切换训练类型
      const savedType = data.__training_type__ || data.model_train_type || '';
      delete data.__training_type__;

      // ── 旧格式兼容：把 buildRunConfig 产出的后端字段反向映射回 UI 字段 ──
      // 旧保存格式中 LyCORIS 参数被合并进 network_args 数组，日志/优化器等 UI 字段被删除
      if (Array.isArray(data.network_args) && !data.lycoris_algo) {
        const argMap = {};
        for (const item of data.network_args) {
          const eq = String(item).indexOf('=');
          if (eq > 0) argMap[String(item).slice(0, eq).trim()] = String(item).slice(eq + 1).trim();
        }
        if (argMap.algo) {
          data.lycoris_algo = argMap.algo;
          if (!data.network_module) data.network_module = 'lycoris.kohya';
   }
  if (argMap.conv_dim != null) { const n = Number(argMap.conv_dim); data.conv_dim = Number.isNaN(n) ? '' : n; }
        if (argMap.conv_alpha != null) { const n = Number(argMap.conv_alpha); data.conv_alpha = Number.isNaN(n) ? '' : n; }
        if (argMap.preset != null) data.lycoris_preset = argMap.preset;
        if (argMap.dropout != null) { const n = Number(argMap.dropout); data.dropout = Number.isNaN(n) ? '' : n; }
        if (argMap.rank_dropout != null) { const n = Number(argMap.rank_dropout); data.rank_dropout = Number.isNaN(n) ? '' : n; }
        if (argMap.module_dropout != null) { const n = Number(argMap.module_dropout); data.module_dropout = Number.isNaN(n) ? '' : n; }
        if (argMap.train_norm != null) data.train_norm =argMap.train_norm === 'True';
        if (argMap.use_tucker != null) data.use_tucker = argMap.use_tucker === 'True';
        else if (argMap.use_cp != null) data.use_tucker = argMap.use_cp === 'True';
        else if (argMap.use_conv_cp != null) data.use_tucker = argMap.use_conv_cp === 'True';
        else if (argMap.disable_conv_cp != null) data.use_tucker = argMap.disable_conv_cp !== 'True';
        if (argMap.use_scalar != null) data.use_scalar = argMap.use_scalar === 'True';
        if (argMap.block_size != null) { const n = Number(argMap.block_size); data.block_size = Number.isNaN(n) ? '' : n; }
        if (argMap.rescaled != null) data.rescaled = argMap.rescaled === 'True';
        if (argMap.constraint != null) { const n = Number(argMap.constraint); data.constraint = Number.isNaN(n) ? '' : n; }
        else if (argMap.constrain != null) { const n = Number(argMap.constrain); data.constraint = Number.isNaN(n) ? '' : n; }
        if(argMap.rs_lora != null) data.rs_lora = argMap.rs_lora === 'True';
        if (argMap.factor != null) { const n = Number(argMap.factor); data.lokr_factor = Number.isNaN(n) ? '' : n; }
        if (argMap.dora_wd != null) data.dora_wd = argMap.dora_wd === 'True';
      if (argMap.wd_on_output != null) data.wd_on_output = argMap.wd_on_output === 'True';
        if (argMap.bypass_mode != null) data.bypass_mode = argMap.bypass_mode === 'True';
        if (argMap.decompose_both != null) data.decompose_both = argMap.decompose_both === 'True';
        if (argMap.full_matrix != null) data.full_matrix = argMap.full_matrix === 'True';
        if (argMap.unbalanced_factorization != null) data.unbalanced_factorization = argMap.unbalanced_factorization === 'True';
        if (argMap.scale_weight_norms != null) { const n = Number(argMap.scale_weight_norms); data.scale_weight_norms = Number.isNaN(n) ? '' : n; }
        // 剩余非结构化的 args 放入 network_args_custom
        const structured = new Set(['algo', 'conv_dim', 'conv_alpha', 'preset', 'dropout', 'rank_dropout', 'module_dropout', 'train_norm', 'use_tucker', 'use_scalar', 'block_size', 'rescaled', 'constraint', 'constrain', 'rs_lora', 'factor', 'dora_wd', 'wd_on_output', 'bypass_mode', 'decompose_both', 'full_matrix', 'unbalanced_factorization', 'scale_weight_norms', 'disable_conv_cp', 'use_cp', 'use_conv_cp']);
        const remaining = data.network_args.filter(a => { const k = String(a).split('=')[0].trim(); return !structured.has(k); });
        if (remaining.length > 0) data.network_args_custom = remaining.join('\n');
        delete data.network_args;
      }
      // 旧格式：optimizer_args数组 → optimizer_args_custom
      if (Array.isArray(data.optimizer_args) && !data.optimizer_args_custom) {
       // Prodigy 特有字段还原
        const prodigyRestore = {};
        const remainingArgs = [];
        for (const arg of data.optimizer_args) {
          const eqIdx = String(arg).indexOf('=');
          const k = eqIdx > 0 ? String(arg).slice(0, eqIdx).trim() : '';
      const v = eqIdx > 0 ? String(arg).slice(eqIdx + 1).trim() : '';
          if (k === 'd_coef') { prodigyRestore.prodigy_d_coef = v; }
          else if (k === 'd0') { prodigyRestore.prodigy_d0 = v; }
          else { remainingArgs.push(String(arg)); }
        }
        if (prodigyRestore.prodigy_d_coef != null) data.prodigy_d_coef = prodigyRestore.prodigy_d_coef;
   if (prodigyRestore.prodigy_d0 != null) data.prodigy_d0 = prodigyRestore.prodigy_d0;
        if (remainingArgs.length > 0) data.optimizer_args_custom =remainingArgs.join('\n');
        delete data.optimizer_args;
      }
      // 旧格式：lr_scheduler_args 数组 → string
      if (Array.isArray(data.lr_scheduler_args)) {
        data.lr_scheduler_args = data.lr_scheduler_args.join('\n');
      }
      // 自定义调度器类路径 → UI 下拉显示值
      if (typeof data.lr_scheduler_type === 'string') {
        const schedulerType = data.lr_scheduler_type.trim();
        const bridgedScheduler = SCHEDULER_TYPE_TO_VALUE[schedulerType];
        if (bridgedScheduler) {
          data.lr_scheduler = bridgedScheduler;
          delete data.lr_scheduler_type;
        }
      }
      // 旧格式：base_weights 数组 → string
      if (Array.isArray(data.base_weights)) {
        data.base_weights = data.base_weights.join('\n');
        if (!data.enable_base_weight) data.enable_base_weight = true;
      }

      enforceLycorisDoraSafety(data);

      if (savedType && savedType !== state.activeTrainingType) {
        const typeExists = TRAINING_TYPES.some((t) => t.id === savedType);
        if (typeExists) {
          state.activeTrainingType = savedType;
          localStorage.setItem('sd-rescripts:training-type', savedType);
        }
      }
      // 载入已保存参数时必须先回到当前训练类型默认配置，
      // 否则保存文件中缺失的字段会沿用当前草稿中的旧值（例如 reg_data_dir）。
      state.config = createDefaultConfig(state.activeTrainingType);
      mergeConfigPatch(data);
      state.hasLocalDraft = true;
      resetTransientState();
      saveDraft();
      window.closeBuiltinPicker();
      showToast(`已载入参数：${name}${savedType ? ` (${savedType})` : ''}`);
      if (state.activeModule === 'config') {
        renderView('config');
      } else {
        renderNavigator();
      }
    } catch (error) {
      if (pathEl) {
        pathEl.textContent = error.message || '读取参数失败。';
      }
    }
  }

  async function deleteSavedConfig(name) {
    try {
      await api.deleteSavedConfig(name);
      showToast('已删除：' + name);
      window.loadSavedParams();
    } catch (error) {
      showToast(error.message || '删除失败');
    }
  }

  async function renameSavedConfig(oldName) {
    const title = $('#builtin-picker-title');
    const pathEl = $('#builtin-picker-path');
    const list = $('#builtin-picker-list');
    if (!title || !pathEl || !list) return;

    title.textContent = '重命名参数';
    pathEl.textContent = `当前名称：${oldName}`;
    list.innerHTML = `
      <div style="padding: 16px;">
        <input type="text" id="rename-config-input" value="${escapeHtml(oldName)}"
          style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:0.88rem;background:var(--bg-main);color:var(--text-main);"
          placeholder="输入新名称" />
      </div>
    `;
    const footer = document.querySelector('.builtin-picker-footer');
    if (footer) footer.innerHTML = `
      <button class="btn btn-outline btn-sm" type="button" onclick="loadSavedParams()">← 返回列表</button>
      <button class="btn btn-primary btn-sm" type="button" id="rename-config-confirm">确认重命名</button>
    `;

    const input = $('#rename-config-input');
    const confirmBtn = $('#rename-config-confirm');

    const doRename = async () => {
      const newName = input?.value?.trim();
      if (!newName) {
        pathEl.textContent = '请输入新名称。';
        input?.focus();
        return;
      }
      if (newName === oldName) {
        window.loadSavedParams();
        return;
      }
      try {
        await api.renameSavedConfig(oldName, newName);
        showToast('已重命名：' + oldName +' → ' + newName);
        window.loadSavedParams();
      } catch (error) {
        pathEl.textContent = error.message || '重命名失败。';
        if (input) {
          input.style.borderColor = 'var(--danger, #d9534f)';
          input.focus();
          input.select();
        }
      }
    };

    confirmBtn?.addEventListener('click', doRename, { once: true });
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        doRename();
      }
    }, { once: true });
    input?.focus();
    input?.select();
  }

  async function previewSavedConfig(name) {
    const title = $('#builtin-picker-title');
    const pathEl = $('#builtin-picker-path');
    const list = $('#builtin-picker-list');
    if (!title || !pathEl || !list) return;

    title.textContent = `参数预览：${name}`;
    pathEl.textContent = '加载中...';
    list.innerHTML = '<div class="builtin-picker-empty"><span>加载中...</span></div>';
    const footer = document.querySelector('.builtin-picker-footer');
    if (footer) footer.innerHTML = `<button class="btn btn-outline btn-sm" type="button" onclick="loadSavedParams()">← 返回列表</button><button class="btn btn-outline btn-sm" type="button" id="builtin-picker-cancel" onclick="closeBuiltinPicker()">取消</button>`;

    try {
      const response = await api.loadSavedConfig(name);
      const data = response?.data;
      if (!data) throw new Error('参数内容为空。');
      const entries = Object.entries(data);
      pathEl.textContent = `共 ${entries.length} 个参数`;
      list.innerHTML = `
      <div class="params-preview-list">
          ${entries.map(([k, v]) => {
            const display = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
            return `<div class="params-preview-row"><span class="params-key">${escapeHtml(k)}</span><span class="params-val">${escapeHtml(display)}</span></div>`;
          }).join('')}
        </div>
      `;
    } catch (error) {
      pathEl.textContent = error.message || '预览失败。';
    }
  }

  function downloadConfigFile() {
    const config = buildRunConfig(state.config, state.activeTrainingType);
    const tomlStr = configToToml(config);
    const blob = new Blob([tomlStr], { type: 'application/toml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.config.output_name || 'config'}-${timestamp}.toml`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function importConfigFile() {
    $('#config-file-input')?.click();
  }

  return {
    setupImportConfig,
    switchTrainingType,
    saveCurrentParams,
    loadSavedParams,
    loadNamedConfig,
    deleteSavedConfig,
    renameSavedConfig,
    previewSavedConfig,
    downloadConfigFile,
    importConfigFile,
  };
}
