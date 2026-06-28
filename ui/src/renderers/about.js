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

export function createAboutRenderer() {
  function renderAbout(container) {
    container.innerHTML = '<div class="form-container">'
      + '<header class="section-title">'
      + '<h2>关于</h2>'
      + '<p>版本来源与前端项目入口。</p>'
      + '</header>'
      + renderStaticAbout()
      + '</div>';
  }

  return {
    renderAbout,
  };
}
