import { escapeHtml, _ico } from '../utils/dom.js';

const EXPERIMENTAL_TYPES = new Set([
  'lab-distiller',
  'sdxl-turbo-lora',
  'anima-few-step-lora',
  'newbie-few-step-lora',
]);

function toBool(value) {
  return value === true || value === 1 || String(value ?? '').trim().toLowerCase() === 'true';
}

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function pill(label, tone = 'neutral') {
  return `<span class="experiment-pill experiment-pill-${tone}">${escapeHtml(label)}</span>`;
}

function metric(label, value, tone = 'neutral') {
  return `
    <div class="experiment-mini-metric experiment-mini-metric-${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function advisorItem(text, tone = 'note') {
  return `<li class="floating-advisor-item floating-advisor-${tone}">${escapeHtml(text)}</li>`;
}

function advisorTone(preflight) {
  if (!preflight) return 'note';
  if ((preflight.errors || []).length > 0 || !preflight.can_start) return 'error';
  if ((preflight.warnings || []).length > 0) return 'warning';
  return 'ok';
}

function getExperimentalCopy(typeId) {
  if (typeId === 'lab-distiller') {
    return {
      title: 'LAB Distiller',
      desc: '把传统 LoRA 蒸馏为 Lulynx sidecar。真实短测前先保持 dry-run，确认 CLIP/Jina CLIP teacher、bf16 和 1e-5 学习率。',
    };
  }
  if (typeId === 'sdxl-turbo-lora') {
    return {
      title: 'SDXL Turbo / LCM LoRA',
      desc: '实验 few-step LoRA 入口。dry-run 负责契约和 metadata；真实短测只验证加载、梯度、保存和 sidecar，不等于质量完成。',
    };
  }
  if (typeId === 'anima-few-step-lora') {
    return {
      title: 'Anima Few-step LoRA',
      desc: 'Anima DiT few-step acceleration 契约入口。当前用于打通 metadata、资源识别和后端 runner。',
    };
  }
  if (typeId === 'newbie-few-step-lora') {
    return {
      title: 'Newbie Few-step LoRA',
      desc: 'Newbie DiT few-step acceleration 契约入口。真实质量训练后置，当前先验证表单到 runner 的链路。',
    };
  }
  return null;
}

function collectAdvisorItems(typeId, config, preflight) {
  const items = [];
  if (preflight) {
    const errors = preflight.errors || [];
    const warnings = preflight.warnings || [];
    if (errors.length > 0) items.push({ tone: 'error', text: `预检有 ${errors.length} 个错误，先处理最上面的阻断项。` });
    if (warnings.length > 0) items.push({ tone: 'warning', text: `预检有 ${warnings.length} 个警告，启动前建议快速扫一遍。` });
    if (preflight.can_start && errors.length === 0) items.push({ tone: 'ok', text: '预检允许启动；可以进入训练页监控任务。' });
  } else {
    items.push({ tone: 'note', text: '建议先运行一次训练预检，助手会结合后端 advisor 给更具体的建议。' });
  }

  if (typeId === 'lab-distiller') {
    if (toBool(config.dry_run)) items.push({ tone: 'note', text: '当前是 dry-run，只验证契约，不会做真实蒸馏。' });
    if (!hasText(config.teacher_path) && !toBool(config.allow_tokenizer_only_clip)) {
      items.push({ tone: 'warning', text: '真实蒸馏建议填写 CLIP/Jina CLIP teacher；tokenizer-only 只适合烟测。' });
    }
    if (String(config.dtype || '').toLowerCase() !== 'bf16') {
      items.push({ tone: 'warning', text: '本地短测稳定路径是 bf16，fp16 曾出现非有限值风险。' });
    }
    if (Math.abs(toNum(config.learning_rate, 1e-5) - 1e-5) > 1e-8) {
      items.push({ tone: 'note', text: 'LAB 短测推荐学习率 1e-5，过高会让矩阵预测分布更容易发散。' });
    }
  }

  if (typeId === 'sdxl-turbo-lora') {
    const dryRun = toBool(config.dry_run);
    if (!dryRun && !toBool(config.confirm_real_run)) {
      items.push({ tone: 'error', text: '关闭 dry-run 后必须勾选 confirm_real_run，避免误启动真实短测。' });
    }
    if (!dryRun && toNum(config.max_train_steps, 1) > 4) {
      items.push({ tone: 'error', text: '真实 Turbo/LCM 短测目前最多 4 步。' });
    }
    if (!dryRun && toNum(config.batch_size, 1) > 1) {
      items.push({ tone: 'error', text: '真实 Turbo/LCM 短测目前最多 batch 1。' });
    }
    if (!hasText(config.teacher_lora_path)) {
      items.push({ tone: 'note', text: '没有 teacher LoRA 时会训练通用 few-step LoRA；风格/角色加速建议填同架构 teacher LoRA。' });
    }
  }

  if (typeId === 'anima-few-step-lora' || typeId === 'newbie-few-step-lora') {
    items.push({ tone: 'note', text: '该路线当前是契约/metadata 入口，真实质量训练和质量评估会在后续阶段补齐。' });
    if (!hasText(config.base_model_path || config.pretrained_model_name_or_path)) {
      items.push({ tone: 'warning', text: '建议先填对应 DiT base model，方便后续真实 few-step 路线无缝升级。' });
    }
  }

  const advisor = preflight?.training_advisor || {};
  const patch = {
    ...(advisor.vram?.recommended_config_patch || {}),
    ...(advisor.a_tier?.recommended_config_patch || {}),
  };
  const patchKeys = Object.keys(patch);
  if (patchKeys.length > 0) {
    items.push({ tone: 'ok', text: `后端 advisor 提供了 ${patchKeys.length} 个可应用建议，可点击“应用 Advisor 建议”。` });
  }
  return items.slice(0, 7);
}

function renderLabPanel(config) {
  const dryRun = toBool(config.dry_run);
  const teacherReady = hasText(config.teacher_path) || toBool(config.allow_tokenizer_only_clip);
  return `
    <div class="experiment-quality-grid">
      ${metric('运行模式', dryRun ? 'dry-run 契约' : '真实蒸馏', dryRun ? 'neutral' : 'accent')}
      ${metric('CLIP Teacher', teacherReady ? '已提供/允许 fallback' : '建议补齐', teacherReady ? 'success' : 'warning')}
      ${metric('精度', String(config.dtype || 'bf16'), String(config.dtype || 'bf16') === 'bf16' ? 'success' : 'warning')}
      ${metric('学习率', String(config.learning_rate || '1e-5'), 'neutral')}
    </div>
    <div class="experiment-note-list">
      <div>输出 sidecar：<code>${escapeHtml(config.output_path || './output/lab_distiller/sidecar.safetensors')}</code></div>
      <div>质量边界：dry-run 只验证契约；真实短测通过也只证明矩阵数据、形状和分布基本有效。</div>
    </div>
  `;
}

function renderTurboPanel(config) {
  const dryRun = toBool(config.dry_run);
  const realGuardOk = dryRun || (toBool(config.confirm_real_run) && toNum(config.max_train_steps, 1) <= 4 && toNum(config.batch_size, 1) <= 1);
  return `
    <div class="experiment-quality-grid">
      ${metric('运行模式', dryRun ? 'dry-run metadata' : '真实短测', dryRun ? 'neutral' : 'accent')}
      ${metric('真实短测护栏', realGuardOk ? '通过' : '需调整', realGuardOk ? 'success' : 'danger')}
      ${metric('Student 步数', String(config.student_steps || 4), 'neutral')}
      ${metric('Teacher Scope', String(config.teacher_lora_scope || 'unet_only'), 'neutral')}
    </div>
    <div class="experiment-note-list">
      <div>输出 LoRA：<code>${escapeHtml(config.output_path || './output/turbo_lora/sdxl_lcm_lora.safetensors')}</code></div>
      <div>质量边界：验证按钮会写 sidecar metadata；样张报告只做基础文件/数量记录，不做主观质量判断。</div>
    </div>
    <div class="experiment-actions">
      <button class="btn btn-outline btn-sm" type="button" onclick="validateTurboLoraOutputFromConfig()">
        ${_ico('check-circle', 13)} 验证输出 sidecar
      </button>
      <button class="btn btn-outline btn-sm" type="button" onclick="reportTurboLoraSamplesFromConfig()">
        ${_ico('image', 13)} 生成样张报告
      </button>
    </div>
  `;
}

function renderDitPanel(typeId, config) {
  const family = typeId.includes('newbie') ? 'Newbie' : 'Anima';
  return `
    <div class="experiment-quality-grid">
      ${metric('模型族', family, 'accent')}
      ${metric('运行模式', 'contract dry-run', 'neutral')}
      ${metric('Few-step 目标', String(config.few_step_objective || 'contract_probe'), 'neutral')}
      ${metric('Sigma', String(config.sigma_schedule || 'family_default'), 'neutral')}
    </div>
    <div class="experiment-note-list">
      <div>输出 LoRA：<code>${escapeHtml(config.output_path || `./output/dit_few_step_lora/${family.toLowerCase()}_few_step_lora.safetensors`)}</code></div>
      <div>质量边界：当前用于产品链路和资源识别；真实 DiT few-step 质量训练后续补。</div>
    </div>
  `;
}

export function createExperimentalTrainingRenderer({ state }) {
  function renderExperimentalTrainingPanel() {
    const typeId = state.activeTrainingType;
    if (!EXPERIMENTAL_TYPES.has(typeId)) return '';
    const copy = getExperimentalCopy(typeId);
    const config = state.config || {};
    const dryRun = toBool(config.dry_run);
    const chips = [
      pill(typeId, 'accent'),
      pill(dryRun ? 'dry-run' : 'real/smoke', dryRun ? 'neutral' : 'warning'),
      pill(config.output_path ? 'output set' : 'output default', config.output_path ? 'success' : 'neutral'),
    ].join('');
    const body = typeId === 'lab-distiller'
      ? renderLabPanel(config)
      : typeId === 'sdxl-turbo-lora'
        ? renderTurboPanel(config)
        : renderDitPanel(typeId, config);

    return `
      <section class="form-section experimental-panel">
        <header class="section-header">
          <div>
            <h3 class="section-heading">${_ico('activity', 15)} ${escapeHtml(copy.title)}</h3>
            <p class="section-desc">${escapeHtml(copy.desc)}</p>
          </div>
          <div class="experiment-chip-row">${chips}</div>
        </header>
        <div class="section-content experiment-panel-body">
          ${body}
        </div>
      </section>
    `;
  }

  function renderFloatingTrainingAssistant() {
    const config = state.config || {};
    const items = collectAdvisorItems(state.activeTrainingType, config, state.preflight);
    const advisor = state.preflight?.training_advisor || {};
    const hasPatch = Boolean(
      Object.keys(advisor.vram?.recommended_config_patch || {}).length
      || Object.keys(advisor.a_tier?.recommended_config_patch || {}).length
    );
    const status = state.preflight
      ? state.preflight.can_start
        ? '预检通过'
        : `预检阻断 ${(state.preflight.errors || []).length}`
      : '等待预检';
    const collapsed = Boolean(state.trainingAdvisorCollapsed);
    const tone = advisorTone(state.preflight);
    const itemCount = items.length;
    const patchCount = Object.keys(advisor.vram?.recommended_config_patch || {}).length
      + Object.keys(advisor.a_tier?.recommended_config_patch || {}).length;
    const toggleLabel = collapsed ? '展开训练助手' : '收起训练助手';
    const pos = state.trainingAdvisorPosition;
    const positionStyle = pos
      ? ` style="left:${Math.max(0, Number(pos.x) || 0)}px;top:${Math.max(0, Number(pos.y) || 0)}px;right:auto;bottom:auto;"`
      : '';

    return `
      <aside class="floating-training-advisor ${collapsed ? 'is-collapsed' : ''}" aria-label="训练助手"${positionStyle}>
        <div class="floating-advisor-head" onpointerdown="startTrainingAdvisorDrag(event)">
          <div>
            <strong>${_ico('activity', 14)} 训练助手</strong>
            <span>${escapeHtml(status)}</span>
          </div>
          <div class="floating-advisor-head-actions">
            <span class="floating-advisor-status-dot floating-advisor-status-${tone}" aria-hidden="true"></span>
            <button class="floating-advisor-toggle" type="button" onclick="toggleTrainingAdvisor()" title="${escapeHtml(toggleLabel)}" aria-label="${escapeHtml(toggleLabel)}">
              ${_ico('chevron-down', 14)}
            </button>
          </div>
        </div>
        <div class="floating-advisor-collapsed-row">
          ${pill(state.activeTrainingType || 'training', 'neutral')}
          <span>${itemCount} 条建议</span>
          ${patchCount ? `<span>${patchCount} 个可应用</span>` : ''}
        </div>
        <div class="floating-advisor-body">
          <ul class="floating-advisor-list">
            ${items.map((item) => advisorItem(item.text, item.tone)).join('')}
          </ul>
          <div class="floating-advisor-actions">
            <button class="btn btn-outline btn-sm" type="button" onclick="runPreflight()">${_ico('check-circle', 13)} 预检</button>
            <button class="btn btn-outline btn-sm" type="button" onclick="applyTrainingAdvisorPatch()" ${hasPatch ? '' : 'disabled'}>${_ico('zap', 13)} 应用建议</button>
          </div>
        </div>
      </aside>
    `;
  }

  return {
    renderExperimentalTrainingPanel,
    renderFloatingTrainingAssistant,
  };
}
