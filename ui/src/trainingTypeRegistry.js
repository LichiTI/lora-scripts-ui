// trainingTypeRegistry.js — 训练类型注册表
// 纯数据：UI 标签页定义 + 全部训练类型清单。无业务依赖。
// 从 sdxlSchema.js 抽出（阶段 1a）。

export const UI_TABS = [
  { key: 'model', label: '模型' },
  { key: 'dataset', label: '数据集' },
  { key: 'training', label: '训练' },
  { key: 'network', label: '网络' },
  { key: 'optimizer', label: '优化器' },
  { key: 'preview', label: '预览/验证' },
  { key: 'speed', label: '加速' },
  { key: 'advanced', label: '高级' },
];

export const TRAINING_TYPES = [
  // LoRA
  { id: 'sdxl-lora',          group: 'LoRA',              label: 'SDXL' },
  { id: 'sdxl-ileco',         group: 'LoRA 概念编辑',     label: 'SDXL iLECO' },
  { id: 'sdxl-addift',        group: 'LoRA 概念编辑',     label: 'SDXL ADDifT' },
  { id: 'sdxl-multi-addift',  group: 'LoRA 概念编辑',     label: 'SDXL Multi-ADDifT' },
  { id: 'anima-lora',         group: 'LoRA',              label: 'Anima' },
  { id: 'anima-ileco',        group: 'LoRA 概念编辑',     label: 'Anima iLECO' },
  { id: 'anima-addift',       group: 'LoRA 概念编辑',     label: 'Anima ADDifT' },
  { id: 'anima-multi-addift', group: 'LoRA 概念编辑',     label: 'Anima Multi-ADDifT' },
  { id: 'newbie-lora',        group: 'LoRA',              label: 'Newbie (实验)' },
  { id: 'sdxl-turbo-lora',    group: '实验训练',          label: 'SDXL Turbo / LCM LoRA' },
  { id: 'lab-distiller',      group: '实验训练',          label: 'LAB Distiller' },
  { id: 'anima-few-step-lora', group: '实验训练',         label: 'Anima Few-step LoRA' },
  { id: 'newbie-few-step-lora', group: '实验训练',        label: 'Newbie Few-step LoRA' },
  { id: 'flux-lora',          group: 'LoRA',              label: 'FLUX' },
  { id: 'sd3-lora',           group: 'LoRA',              label: 'SD3' },
  { id: 'lumina-lora',        group: 'LoRA',              label: 'Lumina' },
  { id: 'hunyuan-image-lora', group: 'LoRA',              label: '混元图像' },
  { id: 'sd-lora',            group: 'LoRA',              label: 'SD 1.5' },
  { id: 'sd-ileco',           group: 'LoRA 概念编辑',     label: 'SD 1.5 iLECO' },
  { id: 'sd-addift',          group: 'LoRA 概念编辑',     label: 'SD 1.5 ADDifT' },
  { id: 'sd-multi-addift',    group: 'LoRA 概念编辑',     label: 'SD 1.5 Multi-ADDifT' },
  // Finetune
  { id: 'sdxl-finetune',      group: 'Finetune',          label: 'SDXL' },
  { id: 'anima-finetune',     group: 'Finetune',          label: 'Anima' },
  { id: 'flux-finetune',      group: 'Finetune',          label: 'FLUX' },
  { id: 'sd3-finetune',       group: 'Finetune',          label: 'SD3' },
  { id: 'lumina-finetune',    group: 'Finetune',          label: 'Lumina' },
  { id: 'sd-dreambooth',      group: 'Finetune',          label: 'SD DreamBooth' },
  // ControlNet
  { id: 'sd-controlnet',      group: 'ControlNet',        label: 'SD 1.5' },
  { id: 'sdxl-controlnet',    group: 'ControlNet',        label: 'SDXL' },
  { id: 'flux-controlnet',    group: 'ControlNet',        label: 'FLUX' },
  // Textual Inversion
  { id: 'sd-textual-inversion',   group: 'Textual Inversion', label: 'SD 1.5 TI' },
  { id: 'sdxl-textual-inversion', group: 'Textual Inversion', label: 'SDXL TI' },
  // 其他模型训练
  { id: 'yolo',                group: '其他模型训练',      label: 'YOLO 模型训练' },
  { id: 'aesthetic-scorer',    group: '其他模型训练',      label: '美学评分模型训练' },
];
