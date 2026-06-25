/**
 * 性能模式切换功能 (Lulynx优化 / 经典兼容)
 *
 * 职责：
 * - 在 webui topbar 显示性能模式切换按钮组
 * - 管理 Triton Phase 1 + Phase 2 融合优化的启用/禁用
 * - 提供亮黄色的 Lulynx 优化模式和蓝色的经典兼容模式
 */

let perfMode = 'lulynx'; // 'lulynx' | 'classic'

/**
 * 初始化性能模式切换器
 */
export function setupPerfModeToggle(api, showToast) {
  const container = document.getElementById('topbar-perf-toggle');
  const buttons = container?.querySelectorAll('.perf-btn');

  if (!container || !buttons || buttons.length === 0) return;

  // 加载初始状态
  loadPerfModeState(api, buttons);

  // 绑定点击事件
  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const mode = btn.getAttribute('data-perf');
      if (mode && mode !== perfMode) {
        await switchPerfMode(api, showToast, buttons, mode);
      }
    });
  });
}

/**
 * 加载性能模式状态
 */
async function loadPerfModeState(api, buttons) {
  try {
    const response = await fetch('/api/perf-mode/status');
    if (response.ok) {
      const data = await response.json();
      perfMode = data.mode || 'lulynx';
      updateUI(buttons, perfMode);
    }
  } catch (error) {
    // 后端不支持或未启动，使用默认 lulynx 模式
    console.log('Performance mode status not available, using default:', error.message);
    updateUI(buttons, 'lulynx');
  }
}

/**
 * 切换性能模式
 */
async function switchPerfMode(api, showToast, buttons, newMode) {
  // 禁用所有按钮防止重复点击
  buttons.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
  });

  try {
    const response = await fetch('/api/perf-mode/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: newMode })
    });

    if (response.ok) {
      perfMode = newMode;
      updateUI(buttons, perfMode);

      if (newMode === 'lulynx') {
        showToast('⚡ Lulynx 高性能优化已启用 (+20-30% 训练加速)');
      } else {
        showToast('🔧 已切换到经典兼容模式 (PyTorch 标准实现)');
      }
    } else {
      throw new Error('切换失败');
    }
  } catch (error) {
    showToast('性能模式切换失败: ' + error.message);
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
    const btnMode = btn.getAttribute('data-perf');
    if (btnMode === mode) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

/**
 * 获取当前性能模式（供其他模块使用）
 */
export function getPerfMode() {
  return perfMode;
}
