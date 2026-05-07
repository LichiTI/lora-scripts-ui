const translations = {
  en: {
    nav: {
      config: '配置',
      training: '训练',
      tagger: '标注',
      dataset: '数据集处理',
      logs: '日志',
      tools: '工具',
      settings: '设置',
      about: '关于',
    },
    navigator: {
      header: '资源管理器',
      training_types: '训练类型',
      preset_list: '参数管理',
      new_preset: '新建预设',
      editing: '正在编辑...',
    },
    topbar: {
      model: '模型',
      tagger: '数据集',
      dataset: '网络',
      optimizer: '优化器',
      advanced: '训练',
      tensorboard: '预览',
      tools: '加速',
      help: '高级',
    },
    config: {
      title: '模型配置',
      subtitle: '定义基础架构与核心权重重分布参数。',
      base_model_path: '基础模型路径',
      precision: '训练精度',
      save_format: '保存格式',
      network_rank: '网络秩 (DIM)',
      network_alpha: '网络 ALPHA',
      enable_preview: '启用训练预览',
      enable_preview_desc: '在训练期间实时生成样本图以监控质量。',
    },
    actions: {
      execute: '开始训练',
      press_f5: '',
    },
    json_panel: {
      header: '参数预览',
    },
    settings: {
      title: '系统设置',
      language: '语言',
      theme: '主题',
      dark: '深色',
      light: '浅色',
      accent_color: '强调色',
      reset: '重置',
    },
  },
  zh: {
    nav: {
      config: '配置',
      training: '训练',
      tagger: '标注',
      dataset: '数据集处理',
      logs: '日志',
      tools: '工具',
      settings: '设置',
      about: '关于',
    },
    navigator: {
      header: '资源管理器',
      training_types: '训练类型',
      preset_list: '参数管理',
      new_preset: '新建预设',
      editing: '正在编辑...',
    },
    topbar: {
      model: '模型',
      tagger: '数据集',
      dataset: '网络',
      optimizer: '优化器',
      advanced: '训练',
      tensorboard: '预览',
      tools: '加速',
      help: '高级',
    },
    config: {
      title: '模型配置',
      subtitle: '定义基础架构与核心权重重分布参数。',
      base_model_path: '基础模型路径',
      precision: '训练精度',
      save_format: '保存格式',
      network_rank: '网络秩 (DIM)',
      network_alpha: '网络 ALPHA',
      enable_preview: '启用训练预览',
      enable_preview_desc: '在训练期间实时生成样本图以监控质量。',
    },
    actions: {
      execute: '开始训练',
      press_f5: '',
    },
    json_panel: {
      header: '参数预览',
    },
    settings: {
      title: '系统设置',
      language: '语言',
      theme: '主题',
      dark: '深色',
      light: '浅色',
      accent_color: '强调色',
      reset: '重置',
    },
  },
};

export const t = (path, lang = 'zh') => {
  const keys = path.split('.');
  let result = translations[lang] || translations.zh;
  for (const key of keys) {
    if (!result || !result[key]) return path;
    result = result[key];
  }
  return result;
};

export default translations;
