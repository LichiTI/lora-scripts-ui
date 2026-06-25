/**
 * 训练助手对话功能（已集成到主后端）
 *
 * 职责：
 * - 调用 /api/training-assistant/chat-llm 端点（主后端路由）
 * - 管理对话历史
 * - 处理角色预设切换
 */

let chatSessionId = null;
let chatHistory = [];
let currentPreset = 'lora_expert';
let isChatMode = false;

/**
 * 切换 AI 模式
 */
window.toggleAIMode = function() {
  isChatMode = !isChatMode;
  const container = document.getElementById('training-assistant-chat-panel');

  if (isChatMode) {
    // 展开对话面板
    container.style.display = 'block';
    loadChatHistory();
  } else {
    // 收起对话面板
    container.style.display = 'none';
  }

  // 重新渲染助手
  const advisorEl = document.querySelector('.floating-training-advisor');
  if (advisorEl) {
    renderTrainingAssistantWithChat();
  }
};

/**
 * 切换预设
 */
window.switchChatPreset = function(presetId) {
  currentPreset = presetId;

  // 更新 UI 高亮
  document.querySelectorAll('.chat-preset-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-preset="${presetId}"]`)?.classList.add('active');

  console.log('切换预设:', presetId);
};

/**
 * 发送消息
 */
window.sendChatMessage = async function() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();

  if (!message) return;

  // 清空输入框
  input.value = '';

  // 添加用户消息到 UI
  addMessageToUI('user', message);

  // 显示加载状态
  const loadingId = addLoadingMessage();

  try {
    // 获取当前配置
    const config = typeof getAssistantRequestConfig === 'function'
      ? getAssistantRequestConfig()
      : { provider: 'local', preset: currentPreset };

    // 调用 API（集成到主后端）
    const response = await fetch('/api/training-assistant/chat-llm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: chatSessionId,
        message: message,
        provider: config.provider,
        preset: config.preset,
        tools_enabled: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`API 错误: ${response.status}`);
    }

    const data = await response.json();

    // 保存 session_id
    if (!chatSessionId) {
      chatSessionId = data.session_id;
    }

    // 移除加载消息
    removeLoadingMessage(loadingId);

    // 添加助手回复到 UI
    addMessageToUI('assistant', data.response);

    // 保存到历史
    chatHistory.push(
      { role: 'user', content: message },
      { role: 'assistant', content: data.response }
    );

  } catch (error) {
    console.error('发送消息失败:', error);
    removeLoadingMessage(loadingId);
    addMessageToUI('error', '发送失败: ' + error.message);
  }
};

/**
 * 添加消息到 UI
 */
function addMessageToUI(role, content) {
  const messagesEl = document.getElementById('chat-messages');
  const messageEl = document.createElement('div');
  messageEl.className = `chat-message chat-message-${role}`;

  if (role === 'user') {
    messageEl.innerHTML = `
      <div class="chat-message-content">
        <strong>你：</strong>${escapeHtml(content)}
      </div>
    `;
  } else if (role === 'assistant') {
    messageEl.innerHTML = `
      <div class="chat-message-content">
        <strong>助手：</strong>${escapeHtml(content)}
      </div>
    `;
  } else if (role === 'error') {
    messageEl.innerHTML = `
      <div class="chat-message-content chat-message-error">
        ${escapeHtml(content)}
      </div>
    `;
  }

  messagesEl.appendChild(messageEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/**
 * 添加加载消息
 */
function addLoadingMessage() {
  const messagesEl = document.getElementById('chat-messages');
  const loadingId = 'loading-' + Date.now();
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message chat-message-loading';
  messageEl.id = loadingId;
  messageEl.innerHTML = `
    <div class="chat-message-content">
      <strong>助手：</strong>正在思考...
    </div>
  `;
  messagesEl.appendChild(messageEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return loadingId;
}

/**
 * 移除加载消息
 */
function removeLoadingMessage(loadingId) {
  const el = document.getElementById(loadingId);
  if (el) el.remove();
}

/**
 * 加载历史消息
 */
function loadChatHistory() {
  const messagesEl = document.getElementById('chat-messages');
  messagesEl.innerHTML = '';

  if (chatHistory.length === 0) {
    messagesEl.innerHTML = '<div class="chat-empty">开始对话，问我任何关于训练的问题</div>';
  } else {
    chatHistory.forEach(msg => {
      addMessageToUI(msg.role, msg.content);
    });
  }
}

/**
 * 清空对话
 */
window.clearChat = function() {
  if (confirm('确定要清空对话历史吗？')) {
    chatHistory = [];
    chatSessionId = null;
    loadChatHistory();
  }
};

/**
 * 输入框回车发送
 */
document.addEventListener('DOMContentLoaded', function() {
  const input = document.getElementById('chat-input');
  if (input) {
    input.addEventListener('keypress', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }
});

// 工具函数
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
