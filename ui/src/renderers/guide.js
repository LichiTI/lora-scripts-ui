// renderers/guide.js — 简易教程页面（纯静态 HTML，零状态依赖）
// 从 main.js 原样迁移，保持零行为变更。

export function renderGuide(container) {
  container.innerHTML = `
    <div class="form-container">
      <header class="section-title">
        <h2>简易教程</h2>
        <p>SDXL LoRA 训练入门指南（仅供参考，出自个人经验）</p>
      </header>

      <div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:20px;padding:12px 16px;background:var(--bg-hover);border-radius:8px;line-height:1.7;">
        相信使用这个丹炉的各位都对 LoRA 有一定了解了，这个简易教程不讲什么定义，只说参数和简单的解释。<br>
        其他参数我不多做说明，都是出自个人经验，仅供参考。我优先使用神童（Prodigy）优化器。<br>
        我们从训练模块从左往右开始说：
      </div>

      <section class="form-section" style="margin-bottom:24px;">
        <header class="section-header"><h3 style="font-size:1.3rem;">1. 模型</h3></header>
        <div class="section-content" style="display:block;line-height:1.8;">
          <h4 style="font-size:1.05rem;margin:16px 0 8px;color:var(--text-main);">训练用模型</h4>
          <p>选择最基础的底模即可，如 noob eps1.1、il0.1、cknb0.5 等，也可以选择微调没那么严重的混合版本（wai13 这种比较早的版本）。</p>
          <p>如果是 v 预测模型，需要开启 <strong>V 参数化</strong>。</p>

          <h4 style="font-size:1.05rem;margin:16px 0 8px;color:var(--text-main);">保存设置</h4>
          <p>主要改变「模型保存名称」「日志名称」即可，还有「每 N 轮保存」。</p>
          <p>这个看情况，我喜欢用 2 ep 一保存，因为我的参数训练出来体积不大可以这么干。</p>
        </div>
      </section>

      <section class="form-section" style="margin-bottom:24px;">
        <header class="section-header"><h3 style="font-size:1.3rem;">2. 数据集</h3></header>
        <div class="section-content" style="display:block;line-height:1.8;">
          <h4 style="font-size:1.05rem;margin:16px 0 8px;color:var(--text-main);">数据集设置</h4>
          <p>将训练集文件夹置于 <code>train</code> 内时，可以使用右侧的按钮直接检测到。</p>
          <p>需要按 <code>xxx--y_xxx</code> 的结构保存，<code>y</code> 是重复次数。如果不确定实际训练的图片数量，可以在设置训练集路径后看下方「训练」模块里的预检，里面会自动帮你计算好。</p>

          <h4 style="font-size:1.05rem;margin:16px 0 8px;color:var(--text-main);">正则化数据集路径</h4>
          <p>有很多教程了，这里说说我的经验：训练人物可以无脑开启，可以防止过拟合。</p>
          <p>画风的正则作用是尽量让画风都吸收进一个触发词里。</p>

          <h4 style="font-size:1.05rem;margin:16px 0 8px;color:var(--text-main);">分桶</h4>
          <p>最大分辨率 <strong>1536</strong>，划分单位 <strong>64</strong>，其他默认即可。</p>
          <p>记得处理你的训练集分辨率，不然你的图会被分桶切的七零八落。</p>

          <h4 style="font-size:1.05rem;margin:16px 0 8px;color:var(--text-main);">Caption 选项</h4>
          <p>没什么好说的，有触发词就打乱 + 保留 1 个标签，没有就无所谓。</p>
        </div>
      </section>

      <section class="form-section" style="margin-bottom:24px;">
        <header class="section-header"><h3 style="font-size:1.3rem;">3. 网络</h3></header>
        <div class="section-content" style="display:block;line-height:1.8;">
          <p>我是 LyCORIS 忠实用户，这里只讲 LyCORIS 3 个设置：</p>

          <div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin:12px 0;">
            <h4 style="font-size:1.05rem;margin:0 0 8px;color:var(--accent);">LoCoN</h4>
            <p>更全面的 LoRA，所以你可以当作lora来训练，用的参数也是差不多的，缺点是容易过拟合，可以开启 DoRA 减少这种情况，与 LoKr 不是很兼容。</p>
            <p style="margin-top:6px;">炼人物：<code>dim 16, alpha 1</code>　　画风：<code>dim 32, alpha 16</code></p>
            <p>LyCORIS Dropout 可以开 <code>0.1</code> 减少过拟合。</p>
          </div>

          <div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin:12px 0;">
            <h4 style="font-size:1.05rem;margin:0 0 8px;color:var(--accent);">LoKr</h4>
            <p>学习高手，训练慢些，推荐炼画风和概念。dim 拉到极大值（如 10000000）是为了直接触发 <strong>Full Matrix Mode</strong>（全矩阵模式），此时 LoKr 不再做低秩分解，而是学习完整的权重变化矩阵，表达能力最强。</p>
            <p style="margin-top:6px;"><code>dim 10000000, alpha 1（或者与dim相同，影响不大可以不用管）</code>　　<code>LoKr 系数(factor) 8</code></p>
          </div>

          <div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin:12px 0;">
            <h4 style="font-size:1.05rem;margin:0 0 8px;color:var(--accent);">LoHa</h4>
            <p>通用性强，显存要求大一点，也同样慢一点，推荐训练人物，可以多人炼进一个丹。dim设置其实就是正常lora的开平方版。</p>
            <p style="margin-top:6px;"><code>dim 4, alpha 1</code>　　可以酌情开启 DoRA，会更容易拟合。</p>
          </div>

          <h4 style="font-size:1.05rem;margin:16px 0 8px;color:var(--text-main);">其余参数</h4>
          <p><strong>最大范数正则化</strong>：使用时不能使用神童优化器，同时学习率需要提升，我这边要 <code>1e-3</code> 开始才行。</p>
        </div>
      </section>

      <section class="form-section" style="margin-bottom:24px;">
        <header class="section-header"><h3 style="font-size:1.3rem;">4. 优化器</h3></header>
        <div class="section-content" style="display:block;line-height:1.8;">
          <h4 style="font-size:1.05rem;margin:16px 0 8px;color:var(--text-main);">学习率与优化器</h4>
          <p>我就说一个优化器：<strong>Prodigy</strong>（神童）。</p>
          <p>调度器选 <code>constant</code>，其他学习率全部设置为 <code>1</code>。</p>
          <p>其他的优化器自己找教程捏，我只用 Adam 和神童。</p>
        </div>
      </section>

      <section class="form-section" style="margin-bottom:24px;">
        <header class="section-header"><h3 style="font-size:1.3rem;">5. 训练</h3></header>
        <div class="section-content" style="display:block;line-height:1.8;">
          <p>我是 4080S，16G 显存。bs 主要是为了训练速度，所以不用太在意。默认开着仅训练 U-Net，也不用管。我的lokr/locon的epoch设置比较保守，实际体验的话不用这么多ep</p>
          <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:0.9rem;">
            <thead><tr style="border-bottom:2px solid var(--border);text-align:left;">
              <th style="padding:8px 12px;">类型</th>
              <th style="padding:8px 12px;">Epoch</th>
              <th style="padding:8px 12px;">Batch Size</th>
              <th style="padding:8px 12px;">梯度累加</th>
            </tr></thead>
            <tbody>
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:8px 12px;">LoCoN / LoKr</td>
                <td style="padding:8px 12px;">30</td>
                <td style="padding:8px 12px;">3</td>
                <td style="padding:8px 12px;">3</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:8px 12px;">LoHa</td>
                <td style="padding:8px 12px;">18</td>
                <td style="padding:8px 12px;">3</td>
                <td style="padding:8px 12px;">2</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="form-section" style="margin-bottom:24px;">
        <header class="section-header"><h3 style="font-size:1.3rem;">6. 预览</h3></header>
        <div class="section-content" style="display:block;line-height:1.8;">
          <p>需要就开着，记得写触发词，但是跟实际使用情况还是有偏差的。</p>
        </div>
      </section>

      <section class="form-section" style="margin-bottom:24px;">
        <header class="section-header"><h3 style="font-size:1.3rem;">7. 加速</h3></header>
        <div class="section-content" style="display:block;line-height:1.8;">
          <p>备注都写好了，用什么环境开什么加速，其他设置我基本都没用。</p>
          <p>如果开启了随机打乱标签，记得关闭<strong>缓存文本编码器输出</strong>。</p>
        </div>
      </section>

      <section class="form-section" style="margin-bottom:24px;">
        <header class="section-header"><h3 style="font-size:1.3rem;">8. 高级</h3></header>
        <div class="section-content" style="display:block;line-height:1.8;">
          <p>自己看，一般来说我不用。</p>
        </div>
      </section>

      <section class="form-section" style="margin-bottom:24px;">
        <header class="section-header"><h3 style="font-size:1.3rem;">📋 总结</h3></header>
        <div class="section-content" style="display:block;line-height:1.8;">
          <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:0.9rem;">
            <thead><tr style="border-bottom:2px solid var(--border);text-align:left;">
              <th style="padding:8px 12px;">类型</th>
              <th style="padding:8px 12px;">适用</th>
              <th style="padding:8px 12px;">Dim</th>
              <th style="padding:8px 12px;">Alpha</th>
              <th style="padding:8px 12px;">Epoch</th>
              <th style="padding:8px 12px;">BS</th>
              <th style="padding:8px 12px;">梯度累加</th>
              <th style="padding:8px 12px;">备注</th>
            </tr></thead>
            <tbody>
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:8px 12px;font-weight:600;color:var(--accent);">LoCoN</td>
                <td style="padding:8px 12px;">人物 / 概念</td>
                <td style="padding:8px 12px;">人16 / 概念32</td>
                <td style="padding:8px 12px;">人1 / 概念16</td>
                <td style="padding:8px 12px;">30</td>
                <td style="padding:8px 12px;">3</td>
                <td style="padding:8px 12px;">3</td>
                <td style="padding:8px 12px;">可开 DoRA</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:8px 12px;font-weight:600;color:var(--accent);">LoKr</td>
                <td style="padding:8px 12px;">画风 / 概念</td>
                <td style="padding:8px 12px;">10000000</td>
                <td style="padding:8px 12px;">1 (或拉满)</td>
                <td style="padding:8px 12px;">30</td>
                <td style="padding:8px 12px;">3</td>
                <td style="padding:8px 12px;">3</td>
                <td style="padding:8px 12px;">factor 8</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:8px 12px;font-weight:600;color:var(--accent);">LoHa</td>
                <td style="padding:8px 12px;">人物</td>
                <td style="padding:8px 12px;">4</td>
                <td style="padding:8px 12px;">1</td>
                <td style="padding:8px 12px;">18</td>
                <td style="padding:8px 12px;">3</td>
                <td style="padding:8px 12px;">2</td>
                <td style="padding:8px 12px;">可开 DoRA</td>
              </tr>
            </tbody>
          </table>
          <p style="margin-top:12px;color:var(--text-muted);font-size:0.85rem;">以上参数均基于 Prodigy 优化器 + constant 调度器 + 学习率全 1 的配置。</p>
        </div>
      </section>

    </div>
  `;
}
