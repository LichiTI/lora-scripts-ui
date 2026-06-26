import { gsap } from '../utils/anim.js';
import { ANIM_DEFAULTS } from '../utils/anim.js';

export function createAppViewRenderer({
  state,
  query,
  escapeHtml,
  applyLayoutPreferences,
  syncFooterAction,
  renderConfig,
  renderSettings,
  renderLogs,
  renderTools,
  renderDataset,
  renderAbout,
  renderGuide,
  renderWizard,
  renderPlugins,
  renderTurboCore,
  renderTraining,
}) {
  const renderers = {
    config: renderConfig,
    settings: renderSettings,
    logs: renderLogs,
    tools: renderTools,
    dataset: renderDataset,
    about: renderAbout,
    guide: renderGuide,
    wizard: renderWizard,
    plugins: renderPlugins,
    turbocore: renderTurboCore,
    training: renderTraining,
  };

  function renderFallback(container, module) {
    container.innerHTML = `
      <div class="form-container">
        <header class="section-title">
          <h2>${escapeHtml(module.toUpperCase())}</h2>
          <p>这个模块暂未接入真实功能，目前先集中完善 SDXL 训练页。</p>
        </header>
        <div class="empty-state">
          <strong>开发中</strong>
          <span>当前原型保留了导航结构，但主要开发集中在 SDXL LoRA 参数页。</span>
        </div>
      </div>
    `;
  }

  // 记录上一次渲染的模块，用于判断"模块切换"vs"同模块 re-render"
  let lastRenderedModule = null;
  let isFirstRender = true;
  // 当前进行中的过渡 timeline，确保快速切换时不叠加
  let currentTimeline = null;

  function prefersReducedMotion() {
    return typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function doRender(container, module) {
    container.classList.toggle('train-fullbleed', module === 'training');
    applyLayoutPreferences();
    syncFooterAction();
    const renderer = renderers[module];
    if (renderer) {
      renderer(container);
    } else {
      renderFallback(container, module);
    }
    // Feature 5: 触发视图渲染完成事件，供 promptHistory 等模块监听
    document.dispatchEvent(new CustomEvent('lulynx:viewRendered'));
  }

  function renderView(module) {
    const container = query('.content-area');
    if (!container) return;

    const isModuleSwitch = lastRenderedModule !== null && lastRenderedModule !== module;

    // 同一模块的 re-render，或首次渲染，或用户偏好减少动画 → 直接渲染
    if (!isModuleSwitch || prefersReducedMotion()) {
      doRender(container, module);
      lastRenderedModule = module;
      if (isFirstRender) {
        // 首次渲染：仅做轻量淡入（无位移），避免启动空白感
        isFirstRender = false;
        gsap.fromTo(container,
          { opacity: 0 },
          { opacity: 1, duration: ANIM_DEFAULTS.pageFadeInDuration, ease: 'power2.out', overwrite: 'auto' }
        );
      }
      return;
    }

    // 模块切换：fade-out → swap → fade-in
    if (currentTimeline) {
      currentTimeline.kill();
      currentTimeline = null;
    }

    const tl = gsap.timeline({
      onComplete: () => { currentTimeline = null; },
    });
    currentTimeline = tl;

    tl.to(container, {
      opacity: 0,
      y: -ANIM_DEFAULTS.pageOffset,
      duration: ANIM_DEFAULTS.pageFadeOutDuration,
      ease: 'power2.in',
    })
    .add(() => {
      doRender(container, module);
      lastRenderedModule = module;
    })
    .fromTo(container,
      { opacity: 0, y: ANIM_DEFAULTS.pageOffset },
      { opacity: 1, y: 0, duration: ANIM_DEFAULTS.pageFadeInDuration, ease: 'power2.out' }
    );
  }

  return { renderView };
}
