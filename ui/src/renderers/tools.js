// renderers/tools.js — 工具箱页面（LoRA 提取/合并/缩放等脚本入口）
// 依赖（工厂注入）：state、$、escapeHtml、renderSlot
// 注意：onclick="runTool(...)" 仍依赖 window.runTool（main.js 保留）

import { $, escapeHtml } from '../utils/dom.js';

export function createToolsRenderer({ state, renderSlot }) {
  function renderTools(container) {
    const tools = [
      {
        id: 'extract_lora',
        title: '从模型提取 LoRA',
        desc: '从两个模型的差异中提取 LoRA 网络权重。',
        script: 'networks/extract_lora_from_models.py',
        fields: [
          { key: 'model_org', label: '原始模型路径', type: 'text', placeholder: './sd-models/original.safetensors' },
          { key: 'model_tuned', label: '微调模型路径', type: 'text', placeholder: './sd-models/finetuned.safetensors' },
          { key: 'save_to', label: '输出路径', type: 'text', placeholder: './output/extracted.safetensors' },
          { key: 'dim', label: '网络维度 (dim)', type: 'number', placeholder: '32' },
        ],
      },
      {
        id: 'extract_dylora',
        title: '从 DyLoRA 提取 LoRA',
        desc: '从 DyLoRA 模型中提取指定维度的 LoRA 权重。',
        script: 'networks/extract_lora_from_dylora.py',
        fields: [
          { key: 'model', label: 'DyLoRA 模型路径', type: 'text', placeholder: './output/dylora.safetensors' },
          { key: 'save_to', label: '输出路径', type: 'text', placeholder: './output/extracted.safetensors' },
        { key: 'unit', label: '提取维度 (unit)', type: 'number', placeholder: '4' },
        ],
      },
      {
        id: 'merge_lora',
        title: '合并 LoRA',
        desc: '将多个 LoRA 按指定权重合并为一个。',
        script: 'networks/merge_lora.py',
        fields: [
       { key: 'save_to', label: '输出路径', type: 'text', placeholder: './output/merged.safetensors' },
          { key: 'models', label: 'LoRA 路径（空格分隔）', type: 'text', placeholder: './output/a.safetensors ./output/b.safetensors' },
          { key: 'ratios', label: '合并权重（空格分隔）', type: 'text', placeholder: '0.5 0.5' },
          { key: 'save_precision', label: '保存精度', type: 'text', placeholder: 'fp16' },
        ],
      },
      {
        id: 'sdxl_merge_lora',
        title: 'SDXL 合并 LoRA',
        desc: 'SDXL 专用的 LoRA 合并工具。',
        script: 'networks/sdxl_merge_lora.py',
        fields: [
          { key: 'save_to', label: '输出路径', type: 'text', placeholder: './output/merged_sdxl.safetensors' },
          { key: 'models', label: 'LoRA 路径（空格分隔）', type: 'text', placeholder: './output/a.safetensors ./output/b.safetensors' },
          { key: 'ratios', label: '合并权重（空格分隔）', type: 'text', placeholder: '0.5 0.5' },
          { key: 'save_precision', label: '保存精度', type: 'text', placeholder: 'fp16' },
        ],
      },
      {
        id: 'flux_merge_lora',
        title: 'FLUX 合并 LoRA',
        desc: 'FLUX 专用的 LoRA 合并工具。',
        script: 'networks/flux_merge_lora.py',
        fields: [
          { key: 'save_to', label: '输出路径', type: 'text', placeholder: './output/merged_flux.safetensors' },
          { key: 'models', label: 'LoRA 路径（空格分隔）', type: 'text', placeholder: './output/a.safetensors./output/b.safetensors' },
          { key: 'ratios', label: '合并权重（空格分隔）', type: 'text', placeholder: '0.5 0.5' },
          { key: 'save_precision', label: '保存精度', type: 'text', placeholder: 'fp16' },
        ],
      },
      {
  id: 'flux_extract_lora',
        title: 'FLUX 提取 LoRA',
        desc: '从 FLUX 模型差异中提取 LoRA。',
        script: 'networks/flux_extract_lora.py',
        fields: [
          { key: 'model_org', label: '原始模型路径', type: 'text', placeholder: '' },
          { key: 'model_tuned', label: '微调模型路径', type: 'text', placeholder: '' },
          { key: 'save_to', label: '输出路径', type: 'text', placeholder: './output/flux_extracted.safetensors' },
          { key: 'dim', label: '网络维度', type: 'number', placeholder: '16' },
],
      },
      {
        id: 'resize_lora',
        title:'LoRA 缩放 (Resize)',
        desc: '将 LoRA权重缩放到不同的 dim / rank。',
        script: 'networks/resize_lora.py',
        fields: [
          { key: 'model', label: 'LoRA 模型路径', type: 'text', placeholder: './output/my_lora.safetensors' },
          { key: 'save_to', label: '输出路径', type: 'text', placeholder: './output/resized.safetensors' },
          { key: 'new_rank', label: '目标 Rank', type: 'number', placeholder: '16' },
          { key: 'save_precision', label: '保存精度', type: 'text', placeholder: 'fp16' },
        ],
      },
      {
        id: 'check_lora_weights',
     title: '检查 LoRA 权重',
        desc: '查看 LoRA 文件的权重统计信息。',
        script: 'networks/check_lora_weights.py',
        fields: [
          { key: 'file', label: 'LoRA 文件路径', type: 'text', placeholder: './output/my_lora.safetensors' },
   ],
      },
      {
        id: 'convert_flux_lora',
        title: '转换 FLUX LoRA 格式',
        desc: '在 ai-toolkit 和 sd-scripts 格式之间转换 FLUX LoRA。',
        script: 'networks/convert_flux_lora.py',
        fields: [
          { key: 'src_path', label: '源文件路径',type: 'text', placeholder: './output/source_lora.safetensors' },
          { key: 'dst_path', label: '输出路径', type: 'text', placeholder: './output/converted.safetensors' },
          {key: 'src', label: '源格式', type: 'text', placeholder: 'ai-toolkit' },
          { key: 'dst', label: '目标格式', type: 'text', placeholder: 'sd-scripts' },
   ],
      },

      {
        id: 'convert_hunyuan_lora',
        title: '转换混元图像 LoRA 到 ComfyUI',
        desc: '将混元图像 LoRA转换为 ComfyUI 可用格式。',
        script: 'networks/convert_hunyuan_image_lora_to_comfy.py',
        fields: [
          { key: 'src_path', label: '源文件路径', type: 'text', placeholder: './output/hunyuan_lora.safetensors' },
          { key: 'dst_path', label: '输出路径', type: 'text', placeholder: './output/hunyuan_comfy.safetensors' },
        ],
      },
    {
     id: 'convert_anima_lora',
        title: '转换 Anima LoRA 到 ComfyUI',
        desc: '将 Anima LoRA 转换为 ComfyUI 可用格式。',
        script: 'networks/convert_anima_lora_to_comfy.py',
        fields: [
          { key: 'src_path', label: '源文件路径', type: 'text', placeholder: '' },
          { key: 'dst_path', label: '输出路径', type: 'text', placeholder: '' },
        ],
      },
      {
        id: 'show_metadata',
        title: '查看模型元数据',
        desc: '显示 safetensors/ckpt 文件的元数据信息。',
        script: 'tools/show_metadata.py',
        fields: [
          { key: 'model', label: '模型文件路径', type: 'text', placeholder: './output/model.safetensors' },
        ],
      },
      {
        id: 'merge_models',
        title: '合并模型',
        desc: '按指定比例合并多个 Stable Diffusion 模型。多个模型/比例用空格分隔。',
        script: 'tools/merge_models.py',
        fields: [
          { key: 'models', label: '模型路径（空格分隔）', type: 'text', placeholder: './sd-models/a.safetensors ./sd-models/b.safetensors' },
          { key: 'output', label: '输出路径', type: 'text', placeholder: './output/merged_model.safetensors' },
          { key: 'ratios', label: '合并比例（空格分隔）', type: 'text', placeholder: '0.5 0.5' },
          { key: 'saving_precision', label: '保存精度', type: 'text', placeholder: 'fp16' },
        ],
      },

      {
        id: 'merge_sd3',
        title: '合并 SD3 模型',
        desc: '将 SD3 的 DiT/VAE/CLIP/T5 合并为单个 safetensors 文件。',
        script: 'tools/merge_sd3_safetensors.py',
        fields: [
          { key: 'dit', label: 'DiT/MMDiT模型路径', type: 'text', placeholder: '' },
          { key: 'clip_l', label: 'CLIP-L 路径（可选）', type: 'text', placeholder: '' },
          { key: 'clip_g', label: 'CLIP-G 路径（可选）', type: 'text', placeholder: '' },
          { key: 't5xxl', label: 'T5-XXL 路径（可选）', type: 'text', placeholder: '' },
          { key: 'vae', label: 'VAE 路径（可选）', type: 'text', placeholder: '' },
          { key: 'output', label: '输出路径', type: 'text', placeholder: './output/merged_sd3.safetensors' },
          { key: 'save_precision', label: '保存精度', type: 'text',placeholder: 'fp16' },
        ],
      },

      {
        id: 'convert_diffusers_to_flux',
        title: 'Diffusers 转 FLUX',
        desc: '将 Diffusers 格式转换为 FLUX 格式。',
        script: 'tools/convert_diffusers_to_flux.py',
        fields: [
          { key: 'diffusers_path', label: 'Diffusers 模型文件夹路径', type: 'text', placeholder: '' },
          { key: 'save_to', label: '输出路径', type: 'text', placeholder: './output/flux_converted.safetensors' },
        ],
      },
      {
        id: 'lora_interrogator',
        title: 'LoRA 识别器',
        desc: '检测 LoRA 网络的训练信息。⚠️ 仅支持 SD 1.5 的LoRA，不支持 SDXL/FLUX。底模必须是对应的 SD 1.5 模型。',
        script: 'networks/lora_interrogator.py',
        fields: [
          { key: 'sd_model', label: '基础 SD 1.5模型路径', type: 'text', placeholder: './sd-models/sd15_model.safetensors' },
          { key: 'model', label: 'LoRA 文件路径', type: 'text', placeholder: './output/my_lora.safetensors' },
          { key: 'v2', label: 'SD 2.x 模型', type: 'checkbox' },
          { key: 'clip_skip', label: 'CLIP Skip', type: 'number', placeholder: '' },
        ],
      },

    ];


    const selectedId = state.selectedTool || '';
    const selectedTool = tools.find((t) => t.id === selectedId);

    container.innerHTML = `
      <div class="form-container">
        <header class="section-title">
          <h2>工具箱</h2>
          <p>LoRA 提取、合并等实用工具。选择工具后填写参数并运行。</p>
        </header>
        <div class="config-group">
          <label>选择工具</label>
          <select id="tool-selector">
            <option value="">—— 请选择工具 ——</option>
         ${tools.map((t) => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${escapeHtml(t.title)}</option>`).join('')}
          </select>
        </div>
        <div id="tool-detail">
          ${selectedTool ? renderToolDetail(selectedTool) : '<div class="empty-state" style="margin-top:12px;"><strong>请在上方下拉菜单中选择一个工具</strong></div>'}
        </div>
        ${renderSlot('tools.entry')}
      </div>
    `;

    $('#tool-selector')?.addEventListener('change', (e) => {
      state.selectedTool = e.target.value;
      const detail =$('#tool-detail');
      const tool = tools.find((t) => t.id === e.target.value);
      if (detail) {
        detail.innerHTML = tool ? renderToolDetail(tool) : '<div class="empty-state"><strong>请在上方下拉菜单中选择一个工具</strong></div>';
      }
    });
  }

  function renderToolDetail(tool) {
    const isPathField = (f) => /model|path|save_to|file|src_|dst_/.test(f.key);
    return `
      <section class="form-section tool-section" id="tool-${tool.id}" style="margin-top:16px;">
        <header class="section-header">
  <h3>${escapeHtml(tool.title)}</h3>
        </header>
        <div class="section-summary">${escapeHtml(tool.desc)}</div>
        <div class="section-content tool-fields">
          ${tool.fields.map((f) => {
            const inputId =`tool-${tool.id}-${f.key}`;
            if (isPathField(f)) {
              return `
            <div class="config-group">
              <label>${escapeHtml(f.label)}</label>
              <div class="input-picker">
                <button class="picker-icon" type="button" onclick="pickPathForInput('${inputId}', '${f.key.includes('save') || f.key.includes('dst') ? 'folder' : 'model-file'}')">
                  <svg class="icon"><use href="#icon-folder"></use></svg>
                </button>
                <input class="text-input" type="${f.type}" id="${inputId}" placeholder="${escapeHtml(f.placeholder || '')}">
              </div>
            </div>`;
            }
            return `
            <div class="config-group">
              <label>${escapeHtml(f.label)}</label>
              <input class="text-input" type="${f.type}" id="${inputId}" placeholder="${escapeHtml(f.placeholder || '')}">
            </div>`;
        }).join('')}
        </div>
        <div class="tool-actions" style="display:flex;align-items:center;gap:12px;">
          <button class="btn btn-primary btn-sm" type="button" id="btn-tool-${tool.id}"
            onclick="runTool('${tool.id}', '${escapeHtml(tool.script)}', ${JSON.stringify(tool.fields.map((f) => f.key)).replaceAll('"', '&quot;')})">运行</button>
          <span id="tool-status-${tool.id}" style="font-size:0.82rem;"></span>
        </div>
        <div id="tool-result-${tool.id}" style="display:none;margin-top:12px;padding:12px;border-radius:8px;font-size:0.82rem;white-space:pre-wrap;font-family:monospace;max-height:300px;overflow:auto;"></div>
      </section>
    `;
  }

  return { renderTools, renderToolDetail };
}
