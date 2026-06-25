// 自动训练 Copilot（全自动 RSI 闭环编排，companion tool 弹窗）。
//
// 用户一次性设定目标阈值（loss / 验证 loss / L2）+ 预算护栏（最大试验数 / 每试步数 /
// 总步数）+ 超参搜索空间，点击「开始无人值守」即授权整个会话自动发射训练试验:
//   发射试验 → 轮询训练 → 只读预测器评估 → 爬山调参（带回退护栏）→ 重发,
// 直到「达标即停」或「预算触顶兜底停」。
//
// 不新增训练入口:每个试验都走既有 training_queue_service.enqueue_or_start 通道。
// 本弹窗仅是 advisory + 编排控制面,不承载 launcher / 训练循环本身的功能。
//
// 后端:
//   POST   /api/system/copilot/start
//   GET    /api/system/copilot/status/{session_id}
//   POST   /api/system/copilot/stop/{session_id}

import { escapeHtml } from './utils/dom.js';

const MODAL_CLASS = 'training-option-help-modal copilot-modal';
const POLL_MS = 2500;

const PHASE_LABEL = {
  IDLE: '空闲',
  LAUNCHING: '发射试验',
  POLLING: '轮询训练',
  EVALUATING: '评估趋势',
  DECIDING: '决策调参',
  DONE: '已达标',
  STOPPED: '已停止',
  FAILED: '失败',
};
const VERDICT = {
  goal_met: { label: '✓ 目标达成', cls: 'gf-verdict-ok' },
  budget_exhausted: { label: '… 预算触顶兜底停', cls: 'gf-verdict-warn' },
  converged_local_optimum: { label: '… 收敛到局部最优', cls: 'gf-verdict-warn' },
  no_search_space: { label: '✗ 无搜索空间', cls: 'gf-verdict-err' },
  stopped: { label: '— 已停止', cls: 'gf-verdict-warn' },
};
const TUNABLES = [
  { name: 'learning_rate', label: '学习率', step: 2.0, hint: '×/÷ 步长' },
  { name: 'network_dim', label: 'network_dim', step: 8, hint: '±步长' },
  { name: 'network_alpha', label: 'network_alpha', step: 2.0, hint: '×/÷ 步长' },
  { name: 'min_snr_gamma', label: 'min_snr_gamma', step: 1, hint: '±步长' },
];

export function createCopilotTool({ state, api, showToast }) {
  let pollTimer = null;
  let activeSession = '';

  function stopPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function closeCopilotTool() {
    stopPolling();
    const modal = document.querySelector('.copilot-modal');
    if (modal) modal.remove();
  }

  function openCopilotTool() {
    closeCopilotTool();
    const cfg = state.config || {};
    const body = document.createElement('div');
    body.className = MODAL_CLASS + ' open';
    body.innerHTML = renderShell(cfg);
    body.addEventListener('click', (event) => {
      if (event.target === body) closeCopilotTool();
    });
    document.body.appendChild(body);
    bindControls(body);
  }

  function bindControls(root) {
    const closeBtn = root.querySelector('[data-cp-close]');
    if (closeBtn) closeBtn.onclick = closeCopilotTool;
    const startBtn = root.querySelector('[data-cp-start]');
    if (startBtn) startBtn.onclick = () => startSession(root);
    const stopBtn = root.querySelector('[data-cp-stop]');
    if (stopBtn) stopBtn.onclick = () => stopSession(root);
  }

  async function startSession(root) {
    const payload = collectPayload(root, state.config || {});
    if (!payload) return;

    setRunning(root, true);
    setStatus(root, busyLine('正在授权无人值守会话…'));
    try {
      const res = await api.startCopilot(payload);
      activeSession = res.session_id || '';
      setStatus(root, okLine(`会话已启动：${activeSession}${payload.dry_run ? '（演练模式）' : ''}`));
      toggleStopButton(root, true);
      pollStatus(root);
    } catch (error) {
      setRunning(root, false);
      const msg = error?.message || '启动失败';
      setStatus(root, errLine(msg));
      showToast(msg);
    }
  }

  async function stopSession(root) {
    if (!activeSession) return;
    try {
      await api.stopCopilot(activeSession);
      setStatus(root, busyLine('已请求优雅停止，等待当前试验收尾…'));
    } catch (error) {
      showToast(error?.message || '停止失败');
    }
  }

  function pollStatus(root) {
    stopPolling();
    if (!activeSession) return;
    const tick = async () => {
      let payload;
      try {
        payload = await api.getCopilotStatus(activeSession);
      } catch (error) {
        setStatus(root, errLine(error?.message || '状态读取失败'));
        return;
      }
      const session = payload?.session;
      if (!root.isConnected) return;
      if (session) renderSession(root, session, payload.job_status);
      const phase = session?.phase || '';
      const terminal = phase === 'DONE' || phase === 'STOPPED' || phase === 'FAILED';
      if (terminal) {
        setRunning(root, false);
        toggleStopButton(root, false);
        return;
      }
      pollTimer = setTimeout(tick, POLL_MS);
    };
    pollTimer = setTimeout(tick, 600);
  }

  return { openCopilotTool, closeCopilotTool };
}

// ---------- 采集 ----------

function collectPayload(root, cfg) {
  const lossT = numOrNull(readInput(root, 'cp-loss'));
  const valT = numOrNull(readInput(root, 'cp-val'));
  const l2T = numOrNull(readInput(root, 'cp-l2'));
  if (lossT == null && valT == null && l2T == null) {
    alertInline(root, '至少填写一个目标阈值（LOSS / 验证 LOSS / L2）。');
    return null;
  }
  const dryRun = !!root.querySelector('[data-cp-input="cp-dry"]')?.checked;
  const searchSpace = TUNABLES
    .filter((t) => root.querySelector(`[data-cp-enable="${t.name}"]`)?.checked)
    .map((t) => ({
      name: t.name,
      enabled: true,
      step: numOr(readInput(root, `cp-step-${t.name}`), t.step),
    }));
  if (!dryRun && searchSpace.length === 0) {
    alertInline(root, '真实运行至少需勾选一个可调超参（演练模式可不选）。');
    return null;
  }

  return {
    base_config: { ...cfg },
    goals: { loss: lossT, validation_loss: valT, l2_norm: l2T },
    budget: {
      max_trials: intOr(readInput(root, 'cp-max-trials'), 6),
      steps_per_trial: intOr(readInput(root, 'cp-steps-per'), 100),
      max_total_steps: intOr(readInput(root, 'cp-max-total'), 2000),
      max_gpu_hours: numOr(readInput(root, 'cp-gpu-hours'), 0),
    },
    retention: {
      keep_snapshots: intOr(readInput(root, 'cp-keep-snaps'), 10),
      protect_best: !!root.querySelector('[data-cp-input="cp-protect-best"]')?.checked,
      purge_on_finish: !!root.querySelector('[data-cp-input="cp-purge"]')?.checked,
    },
    search_space: searchSpace,
    start_policy: root.querySelector('[data-cp-input="cp-policy"]')?.value || 'warm_start',
    execution_profile_id: cfg.execution_profile_id || cfg.__execution_profile_id || 'standard',
    attention_backend: cfg.attention_backend || 'auto',
    schema_id: cfg.__schema_id || '',
    dry_run: dryRun,
  };
}

// ---------- 渲染 ----------

function renderShell(cfg) {
  const steps = numOr(cfg.max_train_steps, 0);
  return `
    <div class="training-option-help-dialog copilot-dialog" role="dialog" aria-modal="true" aria-label="自动训练 Copilot">
      <div class="training-option-help-head">
        <div>
          <span class="training-option-help-category">Copilot · 全自动闭环</span>
          <h3>🤖 自动训练 Copilot</h3>
        </div>
        <button class="modal-close" type="button" title="关闭" data-cp-close>×</button>
      </div>
      <div class="training-option-help-body copilot-body">
        <p class="field-desc">
          一次授权无人值守:Copilot 自动发射训练试验、用只读预测器评估趋势、爬山调参
          （带<strong>回退护栏</strong>:某轮变差则回滚到历史最优再换方向),直到
          <strong>达标即停</strong>或<strong>预算触顶兜底停</strong>。每个试验走既有训练队列通道,不新增入口。
        </p>

        <div class="cp-section">
          <div class="cp-section-title">目标阈值（低于即达标，至少一项）</div>
          <div class="goal-forecast-params">
            ${numField('cp-loss', 'LOSS 目标', '', 0, 1000, 'any')}
            ${numField('cp-val', '验证 LOSS 目标（可选）', '', 0, 1000, 'any')}
            ${numField('cp-l2', 'L2 范数目标（可选）', '', 0, 100000, 'any')}
          </div>
        </div>

        <div class="cp-section">
          <div class="cp-section-title">预算护栏（任一触顶即兜底停）</div>
          <div class="goal-forecast-params">
            ${numField('cp-max-trials', '最大试验数', 6, 1, 100, 1)}
            ${numField('cp-steps-per', '每试验步数', steps > 0 ? Math.min(steps, 200) : 100, 10, 100000, 1)}
            ${numField('cp-max-total', '总步数上限', 2000, 10, 10000000, 1)}
            ${numField('cp-gpu-hours', 'GPU 小时上限（0=不限）', 0, 0, 1000, 'any')}
          </div>
        </div>

        <div class="cp-section">
          <div class="cp-section-title">超参搜索空间（爬山调参的可动维度）</div>
          <div class="cp-search-space">
            ${TUNABLES.map(renderTunableRow).join('')}
          </div>
        </div>

        <div class="cp-section">
          <div class="cp-section-title">运行选项</div>
          <div class="cp-run-options">
            <label class="gf-field">
              <span>起点策略</span>
              <select class="text-input" data-cp-input="cp-policy">
                <option value="warm_start">温启动（载入上一轮 LoRA 权重，默认）</option>
                <option value="from_scratch">从零开始（每试验全新初始化）</option>
              </select>
            </label>
            <label class="cp-check">
              <input type="checkbox" data-cp-input="cp-dry" checked>
              <span>演练模式（合成趋势，不真正发射训练，用于验证闭环）</span>
            </label>
          </div>
        </div>

        <div class="cp-section">
          <div class="cp-section-title">中间态保留策略（不会自动删除，除非超限或手动清理）</div>
          <div class="cp-run-options">
            <label class="gf-field">
              <span>保留快照数（0=无限）</span>
              <input class="text-input" type="number" data-cp-input="cp-keep-snaps"
                     value="10" min="0" max="1000" step="1">
            </label>
            <label class="cp-check">
              <input type="checkbox" data-cp-input="cp-protect-best" checked>
              <span>保护最优试验（即使超限也不淘汰★标记的最优）</span>
            </label>
            <label class="cp-check">
              <input type="checkbox" data-cp-input="cp-purge">
              <span>完成后清空所有中间态（仅保留最终 session 记录）</span>
            </label>
          </div>
        </div>

        <div class="goal-forecast-actions">
          <button class="btn btn-primary" type="button" data-cp-start>🤖 开始无人值守</button>
          <button class="btn" type="button" data-cp-stop disabled>停止会话</button>
        </div>
        <div class="goal-forecast-status" data-cp-status></div>
        <div class="goal-forecast-result" data-cp-session></div>
      </div>
    </div>
  `;
}

function renderTunableRow(t) {
  return `
    <div class="cp-tunable-row">
      <label class="cp-check">
        <input type="checkbox" data-cp-enable="${t.name}">
        <span>${escapeHtml(t.label)}</span>
      </label>
      <label class="cp-step">
        <span>${escapeHtml(t.hint)}</span>
        <input class="text-input" type="number" data-cp-input="cp-step-${t.name}"
               value="${t.step}" min="0" step="any">
      </label>
    </div>
  `;
}

function renderSession(root, session, jobStatus) {
  const el = root.querySelector('[data-cp-session]');
  if (!el) return;
  const phase = PHASE_LABEL[session.phase] || session.phase || '';
  const verdict = session.verdict ? (VERDICT[session.verdict] || VERDICT.stopped) : null;
  const trials = session.trials || [];
  const bestIdx = session.best_trial_index;
  const snapshots = session.snapshots || [];
  const snapMap = new Map(snapshots.map(s => [s.trial_index, s]));
  const rows = trials.map((t) => renderTrialRow(t, t.index === bestIdx, session.session_id, snapMap.get(t.index))).join('');
  el.innerHTML = `
    <div class="cp-session-head">
      <span class="cp-phase">阶段：${escapeHtml(phase)}</span>
      <span class="cp-spent">已用步数：${escapeHtml(String(session.total_steps_spent || 0))}</span>
      ${jobStatus ? `<span class="cp-job">job：${escapeHtml(jobStatus)}</span>` : ''}
    </div>
    ${verdict ? `<div class="gf-verdict ${verdict.cls}">${escapeHtml(verdict.label)}</div>` : ''}
    <div class="cp-trials">${rows || '<div class="cp-empty">尚无试验…</div>'}</div>
    ${session.message ? `<div class="cp-message">${escapeHtml(session.message)}</div>` : ''}
  `;
}

function renderTrialRow(trial, isBest, sessionId, snapshot) {
  const vals = trial.config_values || {};
  const parts = Object.keys(vals)
    .map((k) => `${shortKey(k)}=${fmt(vals[k])}`)
    .join(' · ');
  const score = trial.score != null ? fmt(trial.score) : '—';
  const met = trial.goal_met ? '<span class="cp-met">✓达标</span>' : '';
  const reportLink = snapshot
    ? `<a class="cp-report-link" href="/api/system/copilot/report/${encodeURIComponent(sessionId)}/${encodeURIComponent(trial.index)}" target="_blank" title="查看中间态报告">📄</a>`
    : '';
  return `
    <div class="cp-trial-row ${isBest ? 'cp-trial-best' : ''} cp-trial-${escapeHtml(trial.status)}">
      <span class="cp-trial-idx">#${escapeHtml(String(trial.index))}${isBest ? ' ★' : ''}</span>
      <span class="cp-trial-cfg">${escapeHtml(parts)}</span>
      <span class="cp-trial-score">score ${escapeHtml(score)}</span>
      <span class="cp-trial-status">${escapeHtml(trial.status)}</span>
      ${met}
      ${reportLink}
    </div>
  `;
}

// ---------- 小工具 ----------

function numField(id, label, value, min, max, step) {
  return `
    <label class="gf-field">
      <span>${escapeHtml(label)}</span>
      <input class="text-input" type="number" data-cp-input="${id}"
             value="${escapeHtml(String(value))}" min="${min}" max="${max}" step="${step}">
    </label>
  `;
}

function readInput(root, id) {
  const el = root.querySelector(`[data-cp-input="${id}"]`);
  return el ? el.value : '';
}

function shortKey(k) {
  return ({ learning_rate: 'lr', network_dim: 'dim', network_alpha: 'alpha', min_snr_gamma: 'snr' })[k] || k;
}

function setRunning(root, running) {
  const startBtn = root.querySelector('[data-cp-start]');
  if (startBtn) startBtn.disabled = running;
}

function toggleStopButton(root, enabled) {
  const stopBtn = root.querySelector('[data-cp-stop]');
  if (stopBtn) stopBtn.disabled = !enabled;
}

function setStatus(root, html) {
  const el = root.querySelector('[data-cp-status]');
  if (el) el.innerHTML = html;
}

function alertInline(root, text) {
  setStatus(root, errLine(text));
}

function numOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function intOr(raw, fallback) {
  const n = numOrNull(raw);
  return n == null ? fallback : Math.round(n);
}

function fmt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (n !== 0 && Math.abs(n) < 0.001) return n.toExponential(2);
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
