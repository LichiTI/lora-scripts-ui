// ================================================================
// otherSchemas.js — SD1.5 / DreamBooth / ControlNet / Textual Inversion / YOLO / 美学评分
// 经典(非 anima/sdxl/DiT)训练族的归一 schema。增删这些族的字段只改本文件。
// 依赖方向(单向无环):schemaCommon → schemaFieldGroups → 本文件 → schemaIndex。
// ================================================================
import {
  vParameterizationFields,
  ds,
  netLora,
  rectifiedFlowParams,
  sec,
} from './schemaCommon.js';
import {
  S_SAVE,
  S_CAPTION,
  S_LR,
  S_TRAIN,
  S_PREVIEW,
  S_DISTRIBUTED,
  S_SPEED_SD15,
  S_ADV,
  S_NOISE,
  S_DATA_AUG,
  S_VALIDATION,
  S_THERMAL,
  conceptEditSections,
  finetuneModel,
  cnModel,
  cnDataset,
  cnTrainFields,
  cnLR,
  tiModel,
  tiParams,
} from './schemaFieldGroups.js';

// ---- SD 1.5 LoRA ----
export const SD15_LORA_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'SD1.5 底模与恢复训练。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'sd-lora' },
    { key: 'pretrained_model_name_or_path', type: 'file', pickerType: 'model-file', label: 'SD1.5 底模路径（pretrained_model_name_or_path）', desc: '底模文件路径', defaultValue: './sd-models/model.safetensors' },
    { key: 'resume', type: 'folder', pickerType: 'output-folder', label: '继续训练路径（resume）', desc: '从某个 save_state 保存的中断状态继续训练，填写文件路径', defaultValue: '' },
    { key: 'vae', type: 'file', pickerType: 'model-file', label: 'VAE 路径（vae）', desc: '(可选) VAE 模型文件路径，使用外置 VAE 文件覆盖模型内本身的', defaultValue: '' },
    { key: 'network_weights', type: 'file', pickerType: 'output-model-file', label: '继续训练 LoRA（network_weights）', desc: '从已有的 LoRA 模型上继续训练，填写路径', defaultValue: '' },
    { key: 'v2', type: 'boolean', label: 'SD 2.x 模型（v2）', desc: '使用 SD 2.x 模型', defaultValue: false },
  ]),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('512,512', 1024, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', [...S_CAPTION]),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('network-settings', 'network', '网络设置', '', netLora('networks.lora', 32, 32, 256, [], ['networks.flexrank_lora'])),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(10)),
  sec('v-parameterization-settings', 'training', 'V 参数化', 'v-pred 训练目标开关。', vParameterizationFields()),
  sec('rf-settings', 'training', 'Rectified Flow', 'RF / Flow Matching 训练目标与时间步策略。', rectifiedFlowParams()),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_SD15]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];

// ---- SD 1.5 概念编辑(iLECO / ADDifT / Multi-ADDifT) ----
export const SD15_ILECO_SECTIONS = conceptEditSections({
  typeId: 'sd-ileco',
  label: 'SD 1.5',
  isSdxl: false,
  mode: 'ileco',
  resolution: '512,512',
  maxTrainSteps: 500,
});

export const SD15_ADDIFT_SECTIONS = conceptEditSections({
  typeId: 'sd-addift',
  label: 'SD 1.5',
  isSdxl: false,
  mode: 'addift',
  resolution: '512,512',
  maxTrainSteps: 80,
  minTimestep: 500,
  maxTimestep: 1000,
});

export const SD15_MULTI_ADDIFT_SECTIONS = conceptEditSections({
  typeId: 'sd-multi-addift',
  label: 'SD 1.5',
  isSdxl: false,
  mode: 'multi-addift',
  resolution: '512,512',
  maxTrainSteps: 120,
  minTimestep: 500,
  maxTimestep: 1000,
});

// ---- SD DreamBooth ----
export const DB_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'SD DreamBooth 全参微调。', [
    ...finetuneModel('sd-dreambooth', 'SD1.5'),
    { key: 'v2', type: 'boolean', label: 'SD 2.x 模型（v2）', desc: '使用 SD 2.x 模型', defaultValue: false },
  ]),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('512,512', 1024, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', [...S_CAPTION]),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(10)),
  sec('v-parameterization-settings', 'training', 'V 参数化', 'v-pred 训练目标开关。', vParameterizationFields()),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_SD15]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];

// ---- SD ControlNet ----
export const SD_CN_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'SD1.5 ControlNet。', cnModel('sd-controlnet', 'SD1.5', [{ key: 'v2', type: 'boolean', label: 'SD 2.x', desc: 'SD 2.x', defaultValue: false }])),
  sec('save-settings', 'model', '保存设置', '', [...S_SAVE]),
  sec('dataset-settings', 'dataset', '数据集设置', '', cnDataset('512,512', 1024, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', [...S_CAPTION]),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...cnLR]),
  sec('training-settings', 'training', '训练参数', '', [...cnTrainFields]),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_SD15]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];

// ---- SD Textual Inversion ----
export const SD_TI_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'SD1.5 Textual Inversion。', tiModel('sd-textual-inversion', 'SD1.5', [{ key: 'v2', type: 'boolean', label: 'SD 2.x', desc: 'SD 2.x', defaultValue: false }])),
  sec('ti-params', 'model', 'Textual Inversion 专用', '', [...tiParams]),
  sec('save-settings', 'model', '保存设置', '', S_SAVE.map((f) => f.key === 'save_model_as' ? { ...f, defaultValue: 'pt' } : f.key === 'output_name' ? { ...f, defaultValue: 'embedding' } : f)),
  sec('dataset-settings', 'dataset', '数据集设置', '', ds('512,512', 1024, 64)),
  sec('caption-settings', 'dataset', 'Caption 选项', '', [...S_CAPTION]),
  sec('data-aug-settings', 'dataset', '数据增强', '颜色、翻转与裁剪增强。', [...S_DATA_AUG]),
  sec('optimizer-settings', 'optimizer', '学习率与优化器', '', [...S_LR]),
  sec('training-settings', 'training', '训练参数', '', S_TRAIN(10)),
  sec('preview-settings', 'preview', '预览图设置', '', [...S_PREVIEW]),
  sec('validation-settings', 'preview', '验证设置', '验证集划分与验证频率。', [...S_VALIDATION]),
  sec('speed-settings', 'speed', '速度优化', '', [...S_SPEED_SD15]),
  sec('noise-settings', 'advanced', '噪声设置', '噪声偏移与多分辨率噪声。', [...S_NOISE]),
  sec('advanced-settings', 'advanced', '其他设置', '', [...S_ADV]),
  sec('thermal-settings', 'training', '散热与功耗', '训练期间冷却与功率管理。', [...S_THERMAL]),
  sec('distributed-settings', 'advanced', '分布式训练', '多 GPU / 多机分布式训练配置。', [...S_DISTRIBUTED]),
];

// ---- YOLO 训练 ----
export const YOLO_SECTIONS = [
  sec('model-settings', 'model', '训练用模型', 'YOLO 模型配置。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'yolo' },
    { key: 'pretrained_model_name_or_path', type: 'string', label: 'YOLO 模型权重（pretrained_model_name_or_path）', desc: 'YOLO 模型权重或模型 yaml。可填本地路径或官方模型名如 yolo11n.pt', defaultValue: 'yolo11n.pt' },
    { key: 'resume', type: 'file', pickerType: 'model-file', label: '继续训练检查点（resume）', desc: '从已有 YOLO 训练检查点继续训练。填写 last.pt 一类的检查点文件路径', defaultValue: '' },
  ]),
  sec('dataset-settings', 'dataset', '数据集设置', 'YOLO 数据集目录与类别。', [
    { key: 'yolo_data_config_path', type: 'file', pickerType: 'model-file', label: '自定义数据集 yaml（yolo_data_config_path）', desc: '可选。自定义 YOLO 数据集 yaml。填写后下方训练/验证目录仅作参考', defaultValue: '' },
    { key: 'train_data_dir', type: 'folder', pickerType: 'folder', label: '训练图像目录（train_data_dir）', desc: '训练图像目录', defaultValue: './datasets/images/train' },
    { key: 'val_data_dir', type: 'folder', pickerType: 'folder', label: '验证图像目录（val_data_dir）', desc: '验证图像目录。留空时回退为训练目录', defaultValue: './datasets/images/val' },
    { key: 'class_names', type: 'textarea', label: '类别名称（class_names）', desc: '类别名称，一行一个', defaultValue: 'class0' },
  ]),
  sec('save-settings', 'model', '保存设置', '', [
    { key: 'output_name', type: 'string', label: '输出名称（output_name）', desc: '本次训练输出名称', defaultValue: 'exp' },
    { key: 'output_dir', type: 'folder', pickerType: 'folder', label: '输出目录（output_dir）', desc: '训练输出目录', defaultValue: './output/yolo' },
    { key: 'save_every_n_epochs', type: 'number', label: '每 N 轮保存（save_every_n_epochs）', desc: '每 N 个 epoch 保存一次检查点', defaultValue: 10, min: 1 },
  ]),
  sec('training-settings', 'training', '训练参数', '', [
    { key: 'epochs', type: 'number', label: '训练轮数（epochs）', desc: '训练 epoch 数', defaultValue: 100, min: 1 },
    { key: 'batch', type: 'number', label: '批量大小（batch）', desc: '训练批量大小', defaultValue: 16, min: 1 },
    { key: 'imgsz', type: 'number', label: '输入分辨率（imgsz）', desc: '训练输入分辨率', defaultValue: 640, min: 32 },
    { key: 'workers', type: 'number', label: '数据加载 Worker（workers）', desc: '数据加载 worker 数量', defaultValue: 8, min: 0 },
    { key: 'device', type: 'string', label: '设备（device）', desc: '手动指定设备，如 0、0,1、cpu。留空自动检测', defaultValue: '' },
    { key: 'seed', type: 'number', label: '随机种子（seed）', desc: '随机种子', defaultValue: 1337 },
  ]),
];

// ---- 美学评分模型训练 ----
export const AESTHETIC_SCORER_SECTIONS = [
  sec('output-settings', 'model', '输出设置', '模型输出配置。', [
    { key: 'model_train_type', type: 'hidden', defaultValue: 'aesthetic-scorer' },
    { key: 'output_name', type: 'string', label: '模型保存名称（output_name）', desc: '模型保存名称', defaultValue: 'aesthetic-scorer-best' },
    { key: 'output_dir', type: 'folder', pickerType: 'folder', label: '输出目录（output_dir）', desc: '模型输出目录', defaultValue: './output/aesthetic-scorer' },
    { key: 'save_model_as', type: 'select', label: '保存格式（save_model_as）', desc: '模型保存格式', defaultValue: 'safetensors', options: ['safetensors', 'pt', 'pth', 'ckpt'] },
  ]),
  sec('dataset-settings', 'dataset', '数据集设置', '标注文件与图片配置。', [
    { key: 'annotations', type: 'file', pickerType: 'model-file', label: '标注文件路径（annotations）', desc: '标注文件路径，支持 .jsonl、.csv、.db', defaultValue: './datasets/aesthetic/annotations.jsonl' },
    { key: 'image_root', type: 'folder', pickerType: 'folder', label: '图片根目录（image_root）', desc: '图片根目录。留空时按标注文件中的路径直接解析', defaultValue: '' },
    { key: 'train_split', type: 'string', label: '训练 split（train_split）', desc: '训练 split 名称，如 train', defaultValue: '' },
    { key: 'val_split', type: 'string', label: '验证 split（val_split）', desc: '验证 split 名称，如 val', defaultValue: '' },
    { key: 'val_ratio', type: 'number', label: '验证集比例（val_ratio）', desc: '未使用 split 时按比例随机切分验证集', defaultValue: 0.1, min: 0.01, max: 0.99, step: 0.01 },
    { key: 'target_dims', type: 'textarea', label: '评分维度（target_dims）', desc: '参与训练的评分维度，一行一个', defaultValue: 'aesthetic\ncomposition\ncolor\nsexual' },
  ]),
  sec('training-settings', 'training', '训练参数', '', [
    { key: 'batch_size', type: 'number', label: '批量大小（batch_size）', desc: '训练 batch size', defaultValue: 8, min: 1 },
    { key: 'num_workers', type: 'number', label: 'DataLoader Worker', desc: 'DataLoader worker 数', defaultValue: 4, min: 0 },
    { key: 'epochs', type: 'number', label: '训练轮数（epochs）', desc: '训练轮数', defaultValue: 10, min: 1 },
    { key: 'learning_rate', type: 'string', label: '学习率（learning_rate）', desc: '学习率', defaultValue: '3e-4' },
    { key: 'weight_decay', type: 'string', label: '权重衰减（weight_decay）', desc: '权重衰减', defaultValue: '1e-4' },
    { key: 'loss', type: 'select', label: '损失函数（loss）', desc: '回归损失函数', defaultValue: 'mse', options: ['mse', 'smooth_l1'] },
    { key: 'cls_loss_weight', type: 'number', label: '分类损失权重（cls_loss_weight）', desc: 'in_domain 二分类损失权重', defaultValue: 1.0, min: 0, step: 0.1 },
    { key: 'cls_pos_weight', type: 'string', label: '正样本权重（cls_pos_weight）', desc: '分类正样本权重。留空不额外加权', defaultValue: '' },
    { key: 'seed', type: 'number', label: '随机种子（seed）', desc: '随机种子', defaultValue: 42 },
    { key: 'device', type: 'string', label: '设备（device）', desc: 'cuda、cuda:0、cpu', defaultValue: 'cuda' },
  ]),
  sec('head-settings', 'network', '融合头设置', 'Fusion head 参数。', [
    { key: 'hidden_dims', type: 'string', label: '隐层维度（hidden_dims）', desc: 'Fusion head 隐层维度，逗号分隔', defaultValue: '1024,256' },
    { key: 'dropout', type: 'number', label: 'Dropout', desc: 'Fusion head dropout', defaultValue: 0.2, min: 0, max: 1, step: 0.01 },
    { key: 'freeze_extractors', type: 'boolean', label: '冻结提取器（freeze_extractors）', desc: '冻结 JTP-3 与 Waifu CLIP 特征提取器', defaultValue: true },
    { key: 'include_waifu_score', type: 'boolean', label: '启用 Waifu 分支（include_waifu_score）', desc: '启用 Waifu Scorer v3 额外分支特征', defaultValue: true },
  ]),
  sec('extractor-settings', 'advanced', '特征提取器设置', '', [
    { key: 'jtp3_model_id', type: 'string', label: 'JTP-3 模型 ID（jtp3_model_id）', desc: 'JTP-3 模型 ID 或本地目录', defaultValue: 'RedRocket/JTP-3' },
    { key: 'jtp3_fallback_model_id', type: 'string', label: 'JTP-3 回退模型（jtp3_fallback_model_id）', desc: 'JTP-3 加载失败时的回退模型 ID', defaultValue: '' },
    { key: 'hf_token_env', type: 'string', label: 'HF Token 环境变量（hf_token_env）', desc: '读取 HuggingFace Token 的环境变量名', defaultValue: 'HF_TOKEN' },
    { key: 'waifu_clip_model_name', type: 'string',label: 'Waifu CLIP 模型（waifu_clip_model_name）', desc: 'Waifu CLIP 模型名称', defaultValue: 'ViT-L-14' },
    { key: 'waifu_clip_pretrained', type: 'string', label: 'CLIP 预训练（waifu_clip_pretrained）', desc: 'Waifu CLIP 预训练权重名称', defaultValue: 'openai' },
    { key: 'wv3_head_path', type: 'file', pickerType: 'model-file', label: 'Waifu v3 头部路径（wv3_head_path）', desc: 'Waifu Scorer v3 头部权重路径。留空时自动尝试内置路径', defaultValue: '' },
  ]),
];
