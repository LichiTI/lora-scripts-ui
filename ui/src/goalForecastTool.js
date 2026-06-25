// 只读训练达标预测器（copilot 只读预测器阶段，companion tool 弹窗）。
//
// 消费已落盘的 .runs/{run_id}/state.json 时序（loss / validation_loss / L2），
// 对用户设定的目标阈值做饱和幂律趋势拟合 + 达标步数外推 + 收敛/发散判定，
// 回答「按当前趋势能否在总步数内达标」。纯只读 advisory，不触碰训练控制流，
// 不新增训练入口，不承载 launcher 功能。
//
// 后端：GET /api/system/goal-forecast/{run_id}?loss_target=...&total_steps=...
// 同步返回报告（数学开销小，无需 job 轮询）。

import { escapeHtml } from './utils/dom.js';

const MODAL_CLASS = 'training-option-help-modal goal-forecast-modal';

const TREND_LABEL = {
  converging: '收敛',
  diverging: '发散',
  stalled: '停滞',
  noisy: '高噪声',
  insufficient_data: '样本不足',
};
const VERDICT = {
  on_track: { label: '✓ 预计达标', cls: 'gf-verdict-ok' },
  at_risk: { label: '… 存在风险', cls: 'gf-verdict-warn' },
  off_track: { label: '✗ 难以达标', cls: 'gf-verdict-err' },
  unknown: { label: '— 数据不足', cls: 'gf-verdict-warn' },
};

export function createGoalForecastTool({ state, api, showToast }) {
  function closeGoalForecastTool() {
    const modal = document.querySelector('.goal-forecast-modal');
    if (modal) modal.remove();
  }

  function openGoalForecastTool() {
    closeGoalForecastTool();
    const cfg = state.config || {};
    const runId = cfg.__last_run_id || cfg.output_name || '';
    const totalSteps = numOr(cfg.max_train_steps, 0);

    const body = document.createElement('div');
    body.className = MODAL_CLASS + ' open';
    body.innerHTML = renderShell({ runId, totalSteps });
    body.addEventListener('click', (event) => {
      if (event.target === body) closeGoalForecastTool();
    });
    document.body.appendChild(body);
    bindControls(body);
  }

  function bindControls(root) {
    const closeBtn = root.querySelector('[data-gf-close]');
    if (closeBtn) closeBtn.onclick = closeGoalForecastTool;
    const runBtn = root.querySelector('[data-gf-run]');
    if (runBtn) runBtn.onclick = () => runForecast(root);
  }

  async function runForecast(root) {
    const runId = String(readInput(root, 'gf-run-id') || '').trim();
    if (!runId) {
      showToast('请填写要预测的 run_id。');
      return;
    }
    const lossTarget = numOrNull(readInput(root, 'gf-loss'));
    const valTarget = numOrNull(readInput(root, 'gf-val'));
    const l2Target = numOrNull(readInput(root, 'gf-l2'));
    const totalSteps = intOrNull(readInput(root, 'gf-steps'));
    if (lossTarget == null && valTarget == null && l2Target == null) {
      showToast('至少填写一个目标阈值（LOSS / 验证 LOSS / L2）。');
      return;
    }

    const statusEl = root.querySelector('[data-gf-status]');
    const resultEl = root.querySelector('[data-gf-result]');
    if (resultEl) resultEl.innerHTML = '';
    setRunning(root, true);
    if (statusEl) statusEl.innerHTML = busyLine('正在读取时序并外推趋势…');

    try {
      const report = await api.getGoalForecast(runId, {
        lossTarget, validationLossTarget: valTarget, l2Target, totalSteps,
      });
      setRunning(root, false);
      if (!report || report.status === 'insufficient_data') {
        if (statusEl) statusEl.innerHTML = errLine('时序样本不足，无法稳定外推（需 ≥5 个数据点）。');
        if (resultEl && report) resultEl.innerHTML = renderResult(report);
        return;
      }
      if (statusEl) statusEl.innerHTML = okLine(`预测完成（置信度 ${(report.confidence * 100).toFixed(0)}%）。`);
      if (resultEl) resultEl.innerHTML = renderResult(report);
    } catch (error) {
      setRunning(root, false);
      const msg = error?.message || '预测失败';
      if (statusEl) statusEl.innerHTML = errLine(msg);
      showToast(msg);
    }
  }

  return { openGoalForecastTool, closeGoalForecastTool };
}

// ---------- 渲染 ----------

function renderShell({ runId, totalSteps }) {
  return `
    <div class="training-option-help-dialog goal-forecast-dialog" role="dialog" aria-modal="true" aria-label="达标预测">
      <div class="training-option-help-head">
        <div>
          <span class="training-option-help-category">Copilot · 只读预测</span>
          <h3>📈 训练达标预测</h3>
        </div>
        <button class="modal-close" type="button" title="关闭" data-gf-close>×</button>
      </div>
      <div class="training-option-help-body goal-forecast-body">
        <p class="field-desc">
          读取该 run 已落盘的 loss / 验证 loss / L2 时序，做饱和幂律趋势外推，
          判定收敛/发散并预测达到目标阈值所需步数，回答「按当前趋势能否在总步数内达标」。
          纯只读建议，不改动任何训练参数。
        </p>
        <div class="goal-forecast-params">
          ${textField('gf-run-id', 'run_id', runId, '例如 20260618-...')}
          ${numField('gf-steps', '总步数预算（留空用 run 自带）', totalSteps > 0 ? totalSteps : '', 0, 10000000, 1)}
          ${numField('gf-loss', 'LOSS 目标（低于即达标）', '', 0, 1000, 'any')}
          ${numField('gf-val', '验证 LOSS 目标（可选）', '', 0, 1000, 'any')}
          ${numField('gf-l2', 'L2 范数目标（可选）', '', 0, 100000, 'any')}
        </div>
        <div class="goal-forecast-actions">
          <button class="btn btn-primary" type="button" data-gf-run>开始预测</button>
        </div>
        <div class="goal-forecast-status" data-gf-status></div>
        <div class="goal-forecast-result" data-gf-result></div>
      </div>
    </div>
  `;
}

function renderResult(report) {
  const verdict = VERDICT[report.verdict] || VERDICT.unknown;
  const rows = (report.forecasts || []).map(renderForecastRow).join('');
  const recs = (report.recommendations || []).map((r) =>
    `<li>${escapeHtml(r.message || '')}</li>`).join('');
  return `
    <div class="gf-verdict ${verdict.cls}">${escapeHtml(verdict.label)}</div>
    <div class="gf-metric-list">${rows}</div>
    ${recs ? `<ul class="gf-recs">${recs}</ul>` : ''}
  `;
}

function renderForecastRow(fc) {
  const trend = TREND_LABEL[fc.trend] || fc.trend;
  const trendCls = `gf-trend-${fc.trend}`;
  const latest = fc.latest_value != null ? fmt(fc.latest_value) : '—';
  let eta = '—';
  if (fc.will_reach_within_budget === true && fc.note === 'already at or below goal') {
    eta = '已达标';
  } else if (fc.eta_step != null) {
    const within = fc.will_reach_within_budget;
    const badge = within === true ? '✓预算内' : within === false ? '✗超预算' : '';
    eta = `~${fc.eta_step} 步 ${badge}`;
  } else {
    eta = '当前趋势不可达';
  }
  return `
    <div class="gf-metric-row">
      <span class="gf-metric-name">${escapeHtml(fc.metric)}</span>
      <span class="gf-metric-trend ${trendCls}">${escapeHtml(trend)}</span>
      <span class="gf-metric-cur">当前 ${escapeHtml(latest)} → 目标 ${escapeHtml(fmt(fc.goal))}</span>
      <span class="gf-metric-eta">${escapeHtml(eta)}</span>
      ${fc.note ? `<span class="gf-metric-note">${escapeHtml(fc.note)}</span>` : ''}
    </div>
  `;
}

// ---------- 小工具 ----------

function textField(id, label, value, placeholder) {
  return `
    <label class="gf-field">
      <span>${escapeHtml(label)}</span>
      <input class="text-input" type="text" data-gf-input="${id}"
             value="${escapeHtml(String(value || ''))}" placeholder="${escapeHtml(placeholder || '')}">
    </label>
  `;
}

function numField(id, label, value, min, max, step) {
  return `
    <label class="gf-field">
      <span>${escapeHtml(label)}</span>
      <input class="text-input" type="number" data-gf-input="${id}"
             value="${escapeHtml(String(value))}" min="${min}" max="${max}" step="${step}">
    </label>
  `;
}

function readInput(root, id) {
  const el = root.querySelector(`[data-gf-input="${id}"]`);
  return el ? el.value : '';
}

function setRunning(root, running) {
  const runBtn = root.querySelector('[data-gf-run]');
  if (runBtn) runBtn.disabled = running;
}

function numOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function numOrNull(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(raw) {
  const n = numOrNull(raw);
  return n == null ? null : Math.round(n);
}

function fmt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(4);
}

function busyLine(text) {
  return `<span class="gf-status-busy">${escapeHtml(text)}</span>`;
}
function okLine(text) {
  return `<span class="gf-status-ok">${escapeHtml(text)}</span>`;
}
function errLine(text) {
  return `<span class="gf-status-err">${escapeHtml(text)}</span>`;
}
