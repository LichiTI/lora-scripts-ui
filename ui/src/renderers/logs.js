// renderers/logs.js — TensorBoard iframe 页面（读 localStorage 的 tb-url，零行为变更）
// 原 main.js 中 renderLogs 的内联 onclick 仍保留（Stage 5 再做事件委托）。

export function renderLogs(container) {
  const customTbUrl = localStorage.getItem('sd-rescripts:tensorboard-url')?.trim();
  const tbUrl = customTbUrl || `http://${location.hostname}:6006`;
  container.innerHTML = `
    <div class="form-container">
      <header class="section-title">
        <h2>TensorBoard</h2>
        <p>训练日志可视化，查看损失曲线、学习率变化与样本图。TensorBoard 已随训练器自动启动。</p>
      </header>
      <section class="form-section" style="padding:0;overflow:hidden;">
        <iframe id="tb-iframe" src="${tbUrl}" style="width:100%;height:calc(100vh - 240px);min-height:500px;border:none;border-radius:12px;background:var(--bg-panel);"
          onload="var r=document.getElementById('tb-retry');if(r)r.style.display='none'"
          onerror="var r=document.getElementById('tb-retry');if(r)r.style.display='block'"></iframe>
        <div id="tb-retry" style="display:none;text-align:center;padding:40px;color:var(--text-dim);">
          <p>TensorBoard 加载失败。可能尚未启动或训练结束后被回收。</p>
          <button class="btn btn-outline btn-sm" type="button" onclick="document.getElementById('tb-retry').style.display='none';document.getElementById('tb-iframe').src='${tbUrl}'">重试连接</button>
        </div>
      </section>
      <div style="margin-top:12px;display:flex;gap:8px;">
        <a class="btn btn-outline btn-sm" href="${tbUrl}" target="_blank" rel="noopener">在新窗口中打开 TensorBoard</a>
        <button class="btn btn-outline btn-sm" type="button" onclick="document.getElementById('tb-iframe').src='${tbUrl}'">刷新</button>
      </div>

    </div>
  `;
}
