const sec = (id, tab, title, desc, fields) => ({ id, tab, title, description: desc, fields });
const when = (key, expected) => (config) => config[key] === expected;

export const LAB_DISTILLER_SECTIONS = [
  sec('lab-model-settings', 'model', '蒸馏输入', '从传统 LoRA teacher 蒸馏出 Lulynx LAB sidecar。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'lab-distiller' },
    { key: 'unet_path', type: 'file', pickerType: 'model-file', label: 'UNet / SDXL 基础模型（unet_path）', desc: 'SDXL UNet、checkpoint 或 diffusers 模型路径。', defaultValue: '' },
    { key: 'lora_path', type: 'file', pickerType: 'model-file', label: 'Teacher LoRA（lora_path）', desc: '传统 LoRA teacher，通常对应 LoRA 架构模型。', defaultValue: '' },
    { key: 'teacher_path', type: 'file', pickerType: 'model-file', label: '可选 Teacher 模型（teacher_path）', desc: '可选，用于显式指定 teacher 模型资源。', defaultValue: '' },
    { key: 'llm_path', type: 'folder', pickerType: 'folder', label: '文本/语义模型路径（llm_path）', desc: '可填本地 Gemma/Jina CLIP/文本模型目录；留空使用 runner 默认。', defaultValue: 'Qwen/Qwen2.5-0.5B' },
    { key: 'projector_path', type: 'file', pickerType: 'model-file', label: 'Projector（projector_path）', desc: '可选，已有 projector 权重路径。', defaultValue: '' },
  ]),
  sec('lab-run-settings', 'training', '蒸馏参数', '先用 dry-run 验证契约，再做真实短测。', [
    { key: 'dry_run', type: 'boolean', label: '仅验证契约（dry_run）', desc: '开启时只检查配置链路，不启动真实蒸馏。', defaultValue: true },
    { key: 'allow_tokenizer_only_clip', type: 'boolean', label: '允许 tokenizer-only CLIP（allow_tokenizer_only_clip）', desc: '兼容部分不完整 CLIP/Jina CLIP 资源。', defaultValue: false },
    { key: 'steps', type: 'number', label: '蒸馏步数（steps）', desc: '真实蒸馏步数。', defaultValue: 1000, min: 1 },
    { key: 'batch_size', type: 'number', label: 'Batch（batch_size）', desc: '蒸馏 batch size。', defaultValue: 4, min: 1 },
    { key: 'learning_rate', type: 'string', label: '学习率（learning_rate）', desc: '蒸馏学习率。', defaultValue: '1e-5' },
    { key: 'dtype', type: 'select', label: '计算精度（dtype）', desc: 'auto 会根据运行设备选择。', defaultValue: 'bf16', options: ['auto', 'bf16', 'fp16', 'fp32'] },
    { key: 'device', type: 'string', label: '设备（device）', desc: 'cuda、cuda:0 或 cpu。', defaultValue: 'cuda' },
  ]),
  sec('lab-output-settings', 'model', '输出', '输出 sidecar 会写入 output/lab_distiller。', [
    { key: 'output_path', type: 'file', pickerType: 'output-model-file', label: '输出 sidecar（output_path）', desc: '建议使用 output/lab_distiller/*.safetensors。', defaultValue: './output/lab_distiller/sidecar.safetensors' },
  ]),
];

export const SDXL_TURBO_LORA_SECTIONS = [
  sec('turbo-model-settings', 'model', 'SDXL 教师与数据', '实验性 few-step LoRA 蒸馏入口。当前重点是 LCM-LoRA/短测链路。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'sdxl-turbo-lora' },
    { key: 'base_model_path', type: 'file', pickerType: 'model-file', label: 'SDXL 基础模型（base_model_path）', desc: 'SDXL checkpoint 或 diffusers 模型目录。', defaultValue: '' },
    { key: 'train_data_dir', type: 'folder', pickerType: 'folder', label: '训练数据目录（train_data_dir）', desc: '用于短测/蒸馏的图像与 caption 目录。', defaultValue: './output/lulynx' },
    { key: 'teacher_lora_path', type: 'file', pickerType: 'model-file', label: 'Teacher LoRA（teacher_lora_path）', desc: '可选，从已有风格/角色 LoRA 蒸馏 few-step 版本。', defaultValue: '' },
    { key: 'teacher_lora_scope', type: 'select', label: 'Teacher LoRA 加载范围（teacher_lora_scope）', desc: '默认 UNet-only。Text Encoder 模式用于兼容性诊断。', defaultValue: 'unet_only', options: ['unet_only', 'unet_and_text_encoder_experimental'] },
    { key: 'vae_path', type: 'file', pickerType: 'model-file', label: 'VAE（vae_path）', desc: '可选，自定义 SDXL VAE。', defaultValue: '' },
  ]),
  sec('turbo-distill-settings', 'training', 'LCM / Turbo 蒸馏参数', '真实短测目前限制为最多 4 步、batch 1，用来验证链路和 sidecar，不代表最终质量。', [
    { key: 'dry_run', type: 'boolean', label: '仅验证契约（dry_run）', desc: '默认开启：写 metadata stub，不启动真实训练。', defaultValue: true },
    { key: 'confirm_real_run', type: 'boolean', label: '确认真实短测（confirm_real_run）', desc: '关闭 dry-run 后必须开启。', defaultValue: false, visibleWhen: when('dry_run', false) },
    { key: 'distill_method', type: 'select', label: '蒸馏方法（distill_method）', desc: '当前推荐 LCM-LoRA。', defaultValue: 'lcm_lora', options: ['lcm_lora', 'turbo_lora'] },
    { key: 'real_objective', type: 'select', label: '真实短测目标（real_objective）', desc: 'LCM consistency 会用 teacher 生成 x0 target。', defaultValue: 'lcm_consistency_probe', options: ['lcm_consistency_probe', 'epsilon_lora_probe'] },
    { key: 'teacher_scheduler', type: 'select', label: 'Teacher Scheduler（teacher_scheduler）', desc: 'Teacher 采样器。', defaultValue: 'dpmpp_2m_karras', options: ['euler_a', 'dpmpp_2m_karras', 'ddim', 'lcm'] },
    { key: 'teacher_steps', type: 'number', label: 'Teacher 步数（teacher_steps）', desc: 'Teacher 推理步数。', defaultValue: 30, min: 1 },
    { key: 'student_scheduler', type: 'select', label: 'Student Scheduler（student_scheduler）', desc: 'Student few-step scheduler。', defaultValue: 'lcm', options: ['lcm', 'euler', 'euler_a'] },
    { key: 'student_steps', type: 'number', label: 'Student 步数（student_steps）', desc: '目标 few-step 步数。', defaultValue: 4, min: 1, max: 12 },
    { key: 'guidance_scale', type: 'number', label: 'CFG / Guidance（guidance_scale）', desc: 'LCM-LoRA 建议从 1.0-2.0 起测。', defaultValue: 1.5, min: 0, max: 12, step: 0.1 },
    { key: 'lcm_target_stride', type: 'number', label: 'LCM 目标跨度（lcm_target_stride）', desc: 'teacher target 使用 t 到 t-stride 的一致性跨度。', defaultValue: 80, min: 1 },
    { key: 'timestep_sampling', type: 'select', label: 'Timestep 采样（timestep_sampling）', desc: '短测时间步采样策略。', defaultValue: 'lcm', options: ['lcm', 'uniform', 'logit_normal'] },
    { key: 'seed', type: 'number', label: '随机种子（seed）', desc: '0 表示使用运行时随机状态。', defaultValue: 42, min: 0 },
    { key: 'distillation_loss_weight', type: 'number', label: '蒸馏损失权重（distillation_loss_weight）', desc: '蒸馏损失权重。', defaultValue: 1.0, min: 0, max: 10, step: 0.1 },
    { key: 'learning_rate', type: 'string', label: '学习率（learning_rate）', desc: 'LoRA 学习率。', defaultValue: '1e-4' },
    { key: 'max_train_steps', type: 'number', label: '最大训练步数（max_train_steps）', desc: '真实短测当前最多 4 步。', defaultValue: 1000, min: 1 },
    { key: 'batch_size', type: 'number', label: 'Batch（batch_size）', desc: '真实短测当前只允许 batch 1。', defaultValue: 1, min: 1 },
    { key: 'resolution', type: 'number', label: '短测分辨率（resolution）', desc: '真实短测限制在 256-512。', defaultValue: 512, min: 256, max: 512, step: 64 },
    { key: 'mixed_precision', type: 'select', label: '混合精度（mixed_precision）', desc: '训练精度。', defaultValue: 'bf16', options: ['bf16', 'fp16', 'fp32'] },
  ]),
  sec('turbo-network-settings', 'network', 'LoRA 网络', 'Student LoRA 结构。', [
    { key: 'network_dim', type: 'number', label: 'Rank（network_dim）', desc: 'LoRA rank。', defaultValue: 16, min: 1, max: 256 },
    { key: 'network_alpha', type: 'number', label: 'Alpha（network_alpha）', desc: 'LoRA alpha。', defaultValue: 16, min: 1, max: 256 },
    { key: 'network_dropout', type: 'number', label: 'Dropout（network_dropout）', desc: 'LoRA dropout。', defaultValue: 0, min: 0, max: 1, step: 0.05 },
    { key: 'target_modules', type: 'select', label: '目标模块（target_modules）', desc: '当前建议 UNet attention。', defaultValue: 'unet_attention', options: ['unet_attention', 'unet_attention_and_mlp'] },
  ]),
  sec('turbo-output-settings', 'model', '输出与验证', '输出会写 scheduler-aware metadata，资源中心可识别为 acceleration LoRA。', [
    { key: 'output_path', type: 'file', pickerType: 'output-model-file', label: '输出 LoRA（output_path）', desc: '建议使用 output/turbo_lora/*.safetensors。', defaultValue: './output/turbo_lora/sdxl_lcm_lora.safetensors' },
    { key: 'metadata_note', type: 'textarea', label: '元数据备注（metadata_note）', desc: '写入输出 sidecar 的备注。', defaultValue: 'Experimental SDXL LCM-LoRA output.' },
    { key: 'samples_dir', type: 'folder', pickerType: 'folder', label: '样张目录（samples_dir）', desc: '可选，用于生成基础样张文件报告。', defaultValue: '' },
  ]),
];

const ditFewStepSections = (family, label) => [
  sec(`${family}-few-step-model-settings`, 'model', `${label} few-step 输入`, '当前为契约入口，用来打通 metadata、资源中心和后端 runner。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: `${family}-few-step-lora` },
    { key: 'model_family', type: 'hidden', defaultValue: family },
    { key: 'base_model_path', type: 'file', pickerType: 'model-file', label: `${label} 基础模型（base_model_path）`, desc: '可选，记录到 metadata。', defaultValue: '' },
    { key: 'transformer_path', type: 'folder', pickerType: 'folder', label: 'Transformer 目录（transformer_path）', desc: '可选，记录到 metadata。', defaultValue: '' },
    { key: 'teacher_adapter_path', type: 'file', pickerType: 'model-file', label: 'Teacher Adapter（teacher_adapter_path）', desc: '可选，用已有 adapter 作为 teacher。', defaultValue: '' },
  ]),
  sec(`${family}-few-step-distill-settings`, 'training', 'Few-step 目标', '真实质量训练放在后续阶段；这里先生成可识别的 acceleration LoRA 契约产物。', [
    { key: 'dry_run', type: 'boolean', label: '仅验证契约（dry_run）', desc: '当前固定为契约 dry-run。', defaultValue: true },
    { key: 'distill_method', type: 'string', label: '蒸馏方法（distill_method）', desc: '记录到 metadata。', defaultValue: 'family_flow_consistency' },
    { key: 'few_step_objective', type: 'string', label: 'Few-step 目标（few_step_objective）', desc: '记录到 metadata。', defaultValue: 'contract_probe' },
    { key: 'sigma_schedule', type: 'string', label: 'Sigma Schedule（sigma_schedule）', desc: '记录到 metadata。', defaultValue: 'family_default' },
    { key: 'teacher_steps', type: 'number', label: 'Teacher 步数（teacher_steps）', desc: 'metadata 中的 teacher 步数。', defaultValue: 28, min: 1 },
    { key: 'student_steps', type: 'number', label: 'Student 步数（student_steps）', desc: '目标 few-step 步数。', defaultValue: 4, min: 1 },
    { key: 'guidance_scale', type: 'number', label: 'Guidance（guidance_scale）', desc: '目标 guidance。', defaultValue: 1.0, min: 0, step: 0.1 },
    { key: 'seed', type: 'number', label: '随机种子（seed）', desc: 'metadata seed。', defaultValue: 42, min: 0 },
  ]),
  sec(`${family}-few-step-network-settings`, 'network', 'LoRA 网络', 'Acceleration LoRA metadata。', [
    { key: 'adapter_type', type: 'select', label: '适配器类型（adapter_type）', desc: '当前默认 LoRA。', defaultValue: 'lora', options: ['lora'] },
    { key: 'network_module', type: 'string', label: '网络模块（network_module）', desc: '写入 metadata 的网络模块。', defaultValue: 'networks.lora' },
    { key: 'network_dim', type: 'number', label: 'Rank（network_dim）', desc: 'LoRA rank。', defaultValue: 16, min: 1 },
    { key: 'network_alpha', type: 'number', label: 'Alpha（network_alpha）', desc: 'LoRA alpha。', defaultValue: 16, min: 1 },
  ]),
  sec(`${family}-few-step-output-settings`, 'model', '输出', '输出 metadata-only safetensors，用于资源中心识别与后续真实训练替换。', [
    { key: 'output_path', type: 'file', pickerType: 'output-model-file', label: '输出 LoRA（output_path）', desc: '建议使用 output/dit_few_step_lora/*.safetensors。', defaultValue: `./output/dit_few_step_lora/${family}_few_step_lora.safetensors` },
  ]),
];

export const ANIMA_FEW_STEP_LORA_SECTIONS = ditFewStepSections('anima', 'Anima');
export const NEWBIE_FEW_STEP_LORA_SECTIONS = ditFewStepSections('newbie', 'Newbie');
