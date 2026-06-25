/**
 * 优化器模式切换功能 (PyTorch / TurboCore 按钮组)
 *
 * 职责：
 * - 在 webui topbar 显示优化器模式切换按钮组
 * - 替代原来的 TurboCore 单按钮设计，改为平铺的两按钮
 * - 调用后端 API 切换优化器状态
 */

let optimizerMode = 'turbocore'; // 'pytorch' | 'turbocore'

/**
 * 初始化优化器模式切换器
 */
export function setupOptimizerToggle(api, showToast) {
  const container = document.getElementById('topbar-optimizer-toggle');
  const buttons = container?.querySelectorAll('.optimizer-btn');

  if (!container || !buttons || buttons.length === 0) return;

  // 加载初始状态
  loadOptimizerState(api, buttons);

  // 绑定点击事件
  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const mode = btn.getAttribute('data-optimizer');
      if (mode && mode !== optimizerMode) {
        await switchOptimizer(api, showToast, buttons, mode);
      }
    });
  });
}

/**
 * 加载优化器状态
 */
async function loadOptimizerState(api, buttons) {
  try {
    const response = await fetch('/api/turbocore/status');
    if (response.ok) {
      const data = await response.json();
      optimizerMode = data.enabled ? 'turbocore' : 'pytorch';
      updateUI(buttons, optimizerMode);
    }
  } catch (error) {
    // 后端不支持或未启动，使用默认 turbocore 模式
    console.log('Optimizer status not available, using default:', error.message);
    updateUI(buttons, 'turbocore');
  }
}

/**
 * 切换优化器模式
 */
async function switchOptimizer(api, showToast, buttons, newMode) {
  // 禁用所有按钮防止重复点击
  buttons.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
  });

  try {
    const enabled = newMode === 'turbocore';
    const response = await fetch('/api/turbocore/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });

    if (response.ok) {
      optimizerMode = newMode;
      updateUI(buttons, optimizerMode);

      if (newMode === 'turbocore') {
        showToast('TurboCore 优化器已启用 (20x 加速)');
      } else {
        showToast('已切换到 PyTorch 原生优化器');
      }
    } else {
      throw new Error('切换失败');
    }
  } catch (error) {
    showToast('优化器切换失败: ' + error.message);
  } finally {
    buttons.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
    });
  }
}

/**
 * 更新 UI 显示
 */
function updateUI(buttons, mode) {
  buttons.forEach(btn => {
    const btnMode = btn.getAttribute('data-optimizer');
    if (btnMode === mode) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

/**
 * 获取当前优化器模式（供其他模块使用）
 */
export function getOptimizerMode() {
  return optimizerMode;
}

/**
 * 兼容旧的 getTurbocoreEnabled 函数
 */
export function getTurbocoreEnabled() {
  return optimizerMode === 'turbocore';
}
