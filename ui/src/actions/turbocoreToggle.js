/**
 * TurboCore 切换功能
 *
 * 职责：
 * - 在 webui topbar 显示 TurboCore 开关
 * - 调用后端 API 切换 TurboCore 状态
 * - 更新 UI 显示当前状态
 */

let turbocoreEnabled = false;

/**
 * 初始化 TurboCore 切换器
 */
export function setupTurbocoreToggle(api, showToast) {
  const container = document.getElementById('topbar-turbocore-toggle');
  const btn = document.getElementById('turbocore-toggle-btn');
  const label = btn?.querySelector('.turbocore-label');

  if (!container || !btn || !label) return;

  // 加载初始状态
  loadTurbocoreState(api, btn, label);

  // 绑定点击事件
  btn.addEventListener('click', async () => {
    await toggleTurbocore(api, showToast, btn, label);
  });

  // 显示切换器（默认隐藏，加载状态后显示）
  container.style.display = 'flex';
}

/**
 * 加载 TurboCore 状态
 */
async function loadTurbocoreState(api, btn, label) {
  try {
    const response = await fetch('/api/turbocore/status');
    if (response.ok) {
      const data = await response.json();
      turbocoreEnabled = data.enabled || false;
      updateUI(btn, label, turbocoreEnabled);
    }
  } catch (error) {
    // 后端不支持或未启动，保持默认 PyTorch 状态
    console.log('TurboCore status not available:', error.message);
  }
}

/**
 * 切换 TurboCore 状态
 */
async function toggleTurbocore(api, showToast, btn, label) {
  const newState = !turbocoreEnabled;

  // 禁用按钮防止重复点击
  btn.disabled = true;
  btn.style.opacity = '0.5';

  try {
    const response = await fetch('/api/turbocore/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: newState })
    });

    if (response.ok) {
      turbocoreEnabled = newState;
      updateUI(btn, label, turbocoreEnabled);
      showToast(turbocoreEnabled ? 'TurboCore 已启用' : '已切换到 PyTorch 原生');
    } else {
      throw new Error('切换失败');
    }
  } catch (error) {
    showToast('TurboCore 切换失败: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.style.opacity = '1';
  }
}

/**
 * 更新 UI 显示
 */
function updateUI(btn, label, enabled) {
  if (enabled) {
    btn.classList.add('turbocore-active');
    label.textContent = 'TurboCore';
  } else {
    btn.classList.remove('turbocore-active');
    label.textContent = 'PyTorch';
  }
}

/**
 * 获取当前 TurboCore 状态（供其他模块使用）
 */
export function getTurbocoreEnabled() {
  return turbocoreEnabled;
}
