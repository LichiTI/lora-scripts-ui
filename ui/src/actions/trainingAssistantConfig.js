/**
 * 训练助手配置管理
 *
 * 职责：
 * - 管理 LLM provider 配置（local/claude/openai/gemini）
 * - 管理 API Key
 * - 管理模型选择
 * - 持久化用户配置
 */

// 配置状态
let assistantConfig = {
  provider: 'local',  // local | claude | openai | gemini | ollama
  apiKey: '',
  model: '',  // 具体模型名称
  preset: 'lora_expert',  // lora_expert | diagnostics | calculator | concise
  chatMode: false,  // false=结构化建议 true=自由对话
};

// Provider 配置
const PROVIDER_CONFIG = {
  local: {
    name: '本地模型',
    requiresApiKey: false,
    models: ['qwen-2.5-7b', 'llama-3.2-3b'],
    defaultModel: 'qwen-2.5-7b',
    description: '本地运行，无需 API Key，速度较慢'
  },
  claude: {
    name: 'Claude (Anthropic)',
    requiresApiKey: true,
    models: ['claude-3.5-sonnet', 'claude-3-haiku'],
    defaultModel: 'claude-3.5-sonnet',
    description: '质量最高，推荐使用'
  },
  openai: {
    name: 'OpenAI GPT',
    requiresApiKey: true,
    models: ['gpt-4o', 'gpt-4o-mini'],
    defaultModel: 'gpt-4o-mini',
    description: '速度快，质量好'
  },
  gemini: {
    name: 'Google Gemini',
    requiresApiKey: true,
    models: ['gemini-1.5-flash', 'gemini-1.5-pro'],
    defaultModel: 'gemini-1.5-flash',
    description: '免费额度大'
  },
  ollama: {
    name: 'Ollama (本地)',
    requiresApiKey: false,
    models: ['qwen2.5:7b', 'llama3.2:3b', 'deepseek-r1:7b'],
    defaultModel: 'qwen2.5:7b',
    description: '需要本地运行 Ollama 服务'
  }
};

/**
 * 切换配置面板显示/隐藏
 */
window.toggleAssistantConfig = function() {
  const configPanel = document.getElementById('assistant-config-panel');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.querySelector('.chat-input-area');

  if (!configPanel) return;

  const isVisible = configPanel.style.display !== 'none';

  if (isVisible) {
    // 隐藏配置，显示对话
    configPanel.style.display = 'none';
    if (chatMessages) chatMessages.style.display = 'block';
    if (chatInput) chatInput.style.display = 'flex';
  } else {
    // 显示配置，隐藏对话
    configPanel.style.display = 'block';
    if (chatMessages) chatMessages.style.display = 'none';
    if (chatInput) chatInput.style.display = 'none';
    // 渲染配置面板
    renderAssistantConfigPanel();
  }
};

// 预设配置
const PRESET_CONFIG = {
  lora_expert: {
    name: 'LoRA 专家',
    description: '擅长配置调优和问题诊断',
    icon: '🎓'
  },
  diagnostics: {
    name: '诊断专家',
    description: '专注分析训练问题',
    icon: '🔍'
  },
  calculator: {
    name: '参数计算',
    description: '显存估算和性能预测',
    icon: '🧮'
  },
  concise: {
    name: '简洁助手',
    description: '简明扼要的建议',
    icon: '⚡'
  }
};

/**
 * 加载配置
 */
function loadAssistantConfig() {
  try {
    const saved = localStorage.getItem('lulynx:training-assistant-config');
    if (saved) {
      const parsed = JSON.parse(saved);
      assistantConfig = { ...assistantConfig, ...parsed };
    }

    // 确保模型有默认值
    if (!assistantConfig.model && assistantConfig.provider) {
      assistantConfig.model = PROVIDER_CONFIG[assistantConfig.provider]?.defaultModel || '';
    }
  } catch (e) {
    console.warn('Failed to load assistant config:', e);
  }
}

/**
 * 保存配置
 */
function saveAssistantConfig() {
  try {
    localStorage.setItem('lulynx:training-assistant-config', JSON.stringify(assistantConfig));
  } catch (e) {
    console.error('Failed to save assistant config:', e);
  }
}

/**
 * 切换 Provider
 */
window.switchAssistantProvider = function(provider) {
  if (!PROVIDER_CONFIG[provider]) {
    console.error('Unknown provider:', provider);
    return;
  }

  assistantConfig.provider = provider;
  assistantConfig.model = PROVIDER_CONFIG[provider].defaultModel;
  saveAssistantConfig();

  // 重新渲染配置面板
  renderAssistantConfigPanel();
};

/**
 * 设置 API Key
 */
window.setAssistantApiKey = function() {
  const input = document.getElementById('assistant-api-key-input');
  if (!input) return;

  assistantConfig.apiKey = input.value.trim();
  saveAssistantConfig();

  // 显示成功提示
  const btn = document.querySelector('.assistant-config-save-btn');
  if (btn) {
    const originalText = btn.textContent;
    btn.textContent = '✓ 已保存';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  }
};

/**
 * 切换模型
 */
window.switchAssistantModel = function(model) {
  assistantConfig.model = model;
  saveAssistantConfig();

  // 更新 UI
  document.querySelectorAll('.assistant-model-option').forEach(el => {
    el.classList.toggle('active', el.dataset.model === model);
  });
};

/**
 * 切换对话模式
 */
window.toggleChatMode = function() {
  assistantConfig.chatMode = !assistantConfig.chatMode;
  saveAssistantConfig();

  // 重新渲染面板
  if (typeof renderTrainingAssistantWithChat === 'function') {
    renderTrainingAssistantWithChat();
  }
};

/**
 * 渲染配置面板
 */
function renderAssistantConfigPanel() {
  const container = document.getElementById('assistant-config-panel');
  if (!container) return;

  const currentProvider = PROVIDER_CONFIG[assistantConfig.provider];

  const html = `
    <div class="assistant-config-section">
      <h4 class="assistant-config-title">模型提供商</h4>
      <div class="assistant-provider-list">
        ${Object.entries(PROVIDER_CONFIG).map(([key, config]) => `
          <button
            class="assistant-provider-option ${assistantConfig.provider === key ? 'active' : ''}"
            onclick="switchAssistantProvider('${key}')"
            title="${escapeHtml(config.description)}"
          >
            ${escapeHtml(config.name)}
          </button>
        `).join('')}
      </div>
    </div>

    ${currentProvider.requiresApiKey ? `
      <div class="assistant-config-section">
        <h4 class="assistant-config-title">API Key</h4>
        <div class="assistant-api-key-row">
          <input
            type="password"
            id="assistant-api-key-input"
            class="assistant-api-key-input"
            placeholder="输入你的 API Key"
            value="${escapeHtml(assistantConfig.apiKey)}"
          />
          <button class="assistant-config-save-btn" onclick="setAssistantApiKey()">保存</button>
        </div>
        <p class="assistant-config-hint">
          ${escapeHtml(currentProvider.description)}
        </p>
      </div>
    ` : ''}

    <div class="assistant-config-section">
      <h4 class="assistant-config-title">模型选择</h4>
      <div class="assistant-model-list">
        ${currentProvider.models.map(model => `
          <button
            class="assistant-model-option ${assistantConfig.model === model ? 'active' : ''}"
            data-model="${escapeHtml(model)}"
            onclick="switchAssistantModel('${escapeHtml(model)}')"
          >
            ${escapeHtml(model)}
          </button>
        `).join('')}
      </div>
    </div>

    <div class="assistant-config-section">
      <h4 class="assistant-config-title">对话模式</h4>
      <div class="assistant-mode-toggle">
        <button
          class="assistant-mode-option ${!assistantConfig.chatMode ? 'active' : ''}"
          onclick="assistantConfig.chatMode = false; saveAssistantConfig(); renderAssistantConfigPanel();"
        >
          📋 结构化建议
        </button>
        <button
          class="assistant-mode-option ${assistantConfig.chatMode ? 'active' : ''}"
          onclick="assistantConfig.chatMode = true; saveAssistantConfig(); renderAssistantConfigPanel();"
        >
          💬 自由对话
        </button>
      </div>
      <p class="assistant-config-hint">
        ${assistantConfig.chatMode
          ? '自由对话模式：灵活交流，工具可选'
          : '结构化建议：强制调用工具生成配置'
        }
      </p>
    </div>

    <div class="assistant-config-section">
      <h4 class="assistant-config-title">角色预设</h4>
      <div class="assistant-preset-list">
        ${Object.entries(PRESET_CONFIG).map(([key, config]) => `
          <button
            class="assistant-preset-option ${assistantConfig.preset === key ? 'active' : ''}"
            onclick="assistantConfig.preset = '${key}'; saveAssistantConfig(); renderAssistantConfigPanel();"
            title="${escapeHtml(config.description)}"
          >
            <span class="preset-icon">${config.icon}</span>
            ${escapeHtml(config.name)}
          </button>
        `).join('')}
      </div>
    </div>
  `;

  container.innerHTML = html;
}

/**
 * 获取当前配置（供发送请求时使用）
 */
function getAssistantRequestConfig() {
  return {
    provider: assistantConfig.provider,
    api_key: assistantConfig.apiKey,
    model: assistantConfig.model,
    preset: assistantConfig.preset,
  };
}

// 初始化
loadAssistantConfig();

// 工具函数
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
