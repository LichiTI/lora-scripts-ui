import { _ico, escapeHtml } from '../utils/dom.js';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstLines(items, limit = 6) {
  return Array.isArray(items) ? items.filter(Boolean).slice(0, limit) : [];
}

function statCard(label, value) {
  return '<div class="about-stat-card">'
    + '<div class="about-stat-label">' + escapeHtml(label) + '</div>'
    + '<div class="about-stat-value">' + escapeHtml(String(value)) + '</div>'
    + '</div>';
}

function healthCard(ok, title, detail) {
  return '<div class="about-health-card' + (ok ? ' is-ok' : ' is-warn') + '">'
    + '<div class="about-health-title">'
    + _ico(ok ? 'check-circle' : 'alert-tri', 14)
    + '<span>' + escapeHtml(title) + '</span>'
    + '</div>'
    + '<div class="about-health-detail">' + escapeHtml(detail) + '</div>'
    + '</div>';
}

function renderReadinessCard(status) {
  const payload = asObject(status);
  const ready = payload.stable_baseline_ready === true;
  const releaseBlockers = Array.isArray(payload.release_blockers) ? payload.release_blockers : [];
  const deferred = Array.isArray(payload.deferred_research_blockers) ? payload.deferred_research_blockers : [];
  const releaseSmokePassed = asObject(payload.core_release_smoke).ok === true;
  const batch1ParityPassed = asObject(payload.batch1_handler_parity_smoke).ok === true;
  const claimGateClosed = asObject(payload.experimental_claim_gate_evidence).ok === true;
  const note = String(payload.note_zh || payload.note_en || '').trim();

  return '<section class="form-section about-card">'
    + '<header class="section-header">'
    + '<h3>' + _ico('shield', 16) + ' 第一版发布状态</h3>'
    + '</header>'
    + '<div class="section-content" style="display:block;">'
    + '<div class="about-release-banner' + (ready ? ' is-ready' : ' is-blocked') + '">'
    + '<div class="about-release-title">'
    + _ico(ready ? 'check-circle' : 'alert-tri', 16)
    + '<span>' + escapeHtml(ready ? 'stable baseline 可发布' : '首发仍有阻塞项') + '</span>'
    + '</div>'
    + '<div class="about-release-note">' + escapeHtml(note || '该状态只评估 stable baseline 首发是否可发布。') + '</div>'
    + '</div>'
    + '<div class="about-stat-grid">'
    + statCard('首发阻塞项', releaseBlockers.length)
    + statCard('延后研究项', deferred.length)
    + statCard('Release smoke', releaseSmokePassed ? '通过' : '需关注')
    + statCard('Batch1 行为等价', batch1ParityPassed ? '通过' : '需关注')
    + '</div>'
    + '<div class="about-health-grid">'
    + healthCard(releaseSmokePassed, '首发 smoke', releaseSmokePassed ? '核心 release smoke 已覆盖并通过。' : '缺少首发 smoke 通过证据。')
    + healthCard(batch1ParityPassed, 'Batch1 baseline', batch1ParityPassed ? 'batch1 行为等价 smoke 已通过。' : 'batch1 行为等价证据缺失。')
    + healthCard(claimGateClosed, '实验发布口径', claimGateClosed ? '实验能力 release claim 已保持 fail-closed。' : '实验能力口径关闭证据缺失。')
    + '</div>'
    + (deferred.length
      ? '<div class="about-deferred-box">'
        + '<div class="about-deferred-label">当前延后研究线路</div>'
        + '<div class="about-deferred-text">' + escapeHtml(firstLines(deferred).join(' · '))
        + (deferred.length > 6 ? ' · +' + String(deferred.length - 6) : '')
        + '</div>'
        + '</div>'
      : '')
    + '</div>'
    + '</section>';
}

function renderStaticAbout() {
  return '<section class="form-section about-card">'
    + '<div class="section-content" style="display:block;">'
    + '<p style="margin-bottom:16px;">SD-reScripts v1.6.0</p>'
    + '<p style="margin-bottom:16px;">由 <a href="https://github.com/Akegarasu/lora-scripts" target="_blank" rel="noopener" style="color:var(--accent);">schemastery</a> 强力驱动</p>'
    + '<h3 style="margin:24px 0 8px;font-size:1.1rem;">下载地址</h3>'
    + '<p>GitHub 地址：<a href="https://github.com/WhitecrowAurora/lora-rescripts" target="_blank" rel="noopener" style="color:var(--accent);">https://github.com/WhitecrowAurora/lora-rescripts</a></p>'
    + '<h3 style="margin:24px 0 8px;font-size:1.1rem;">本前端反馈</h3>'
    + '<p>GitHub 地址：<a href="https://github.com/LichiTI/lora-scripts-ui" target="_blank" rel="noopener" style="color:var(--accent);">https://github.com/LichiTI/lora-scripts-ui</a></p>'
    + '</div>'
    + '</section>';
}

export function createAboutRenderer({ api, showToast, reportWebuiError }) {
  function renderAbout(container) {
    container.innerHTML = '<div class="form-container">'
      + '<header class="section-title">'
      + '<h2>关于</h2>'
      + '<p>首发产品化状态、版本来源与前端项目入口。</p>'
      + '</header>'
      + '<div class="about-toolbar">'
      + '<button class="btn btn-outline btn-sm" type="button" onclick="refreshAboutReleaseReadiness()">'
      + _ico('refresh-cw', 12) + ' 刷新首发状态'
      + '</button>'
      + '</div>'
      + '<div id="about-readiness-panel" class="about-loading-state">'
      + _ico('loader', 14) + ' 正在读取第一版发布状态...'
      + '</div>'
      + renderStaticAbout()
      + '</div>';
    void loadAboutReleaseReadiness();
  }

  async function loadAboutReleaseReadiness() {
    const panel = document.getElementById('about-readiness-panel');
    if (!panel) return;
    panel.innerHTML = _ico('loader', 14) + ' 正在读取第一版发布状态...';
    try {
      const response = await api.getFirstReleaseReadiness();
      panel.outerHTML = renderReadinessCard(response?.data || {});
    } catch (error) {
      if (typeof reportWebuiError === 'function') {
        reportWebuiError('about_first_release_readiness_load_failed', error, { path: '/api/system/first_release_readiness' });
      }
      panel.innerHTML = '<div class="about-inline-error">'
        + _ico('alert-tri', 14) + ' '
        + escapeHtml(error instanceof Error ? error.message : String(error))
        + '</div>';
      if (typeof showToast === 'function') {
        showToast('第一版发布状态读取失败');
      }
    }
  }

  async function refreshAboutReleaseReadiness() {
    const panel = document.getElementById('about-readiness-panel');
    if (!panel) return;
    panel.innerHTML = _ico('loader', 14) + ' 正在刷新第一版发布状态...';
    try {
      const response = await api.refreshFirstReleaseReadiness();
      panel.outerHTML = renderReadinessCard(response?.data || {});
      if (typeof showToast === 'function') {
        showToast('第一版发布状态已刷新');
      }
    } catch (error) {
      if (typeof reportWebuiError === 'function') {
        reportWebuiError('about_first_release_readiness_refresh_failed', error, { path: '/api/system/first_release_readiness/refresh' });
      }
      panel.innerHTML = '<div class="about-inline-error">'
        + _ico('alert-tri', 14) + ' '
        + escapeHtml(error instanceof Error ? error.message : String(error))
        + '</div>';
      if (typeof showToast === 'function') {
        showToast('第一版发布状态刷新失败');
      }
    }
  }

  return {
    renderAbout,
    loadAboutReleaseReadiness,
    refreshAboutReleaseReadiness,
    renderReadinessCard,
  };
}
