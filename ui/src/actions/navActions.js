// actions/navActions.js — 导航与头部/侧边栏装配 action
//   setupSidebar / setupTopbar / setupNavigator
//   dismissPreflightReport / dismissTrainingSummary
//
// 依赖（工厂注入）：state, TOPBAR_TABS, renderView, toggleTheme, syncTopbarState
//
// 注：_persistTrainingGroupsCollapsed / toggleTrainingGroup 仍留在 main.js，
//   因为它们与 renderNavigator 工厂参数锁定顺序。

import { $, $$ } from '../utils/dom.js';
import { persistNavigatorCollapsed } from '../utils/storage.js';

export function createNavActions({
  state,
  TOPBAR_TABS,
  renderView,
  toggleTheme,
  toggleStyleTheme,
  syncTopbarState,
}) {
  function dismissPreflightReport() {
    state.preflight = null;
    var el = document.getElementById('preflight-report');
    if (el) el.remove();
  }

  function dismissTrainingSummary() {
    state.trainingSummary = null;
    var el = document.getElementById('training-summary-section');
    if (el) el.remove();
  }

  function setupSidebar() {
    $$('.nav-item').forEach((item) => {
      item.addEventListener('click', (event) => {
        event.preventDefault();
        const module = item.dataset.module;
        if (!module) {
          return;
        }
        $$('.nav-item').forEach((navItem) => navItem.classList.remove('active'));
        item.classList.add('active');
        state.activeModule = module;
        renderView(module);
      });
    });

    $('#theme-toggle')?.addEventListener('click', (event) => toggleTheme(event));
    $('#style-toggle')?.addEventListener('click', (event) => toggleStyleTheme(event));
  }

  function setupTopbar() {
    $$('.top-nav-item').forEach((item, index) => {
      const tabKey = TOPBAR_TABS[index];
      if (!tabKey) {
        item.style.display = 'none';
        return;
     }
      item.dataset.tab = tabKey;
      item.addEventListener('click', (event) => {
        event.preventDefault();
   state.activeTab = tabKey;
        localStorage.setItem('sdxl_ui_tab', tabKey);
   if (state.activeModule === 'config') {
          if (state.configWaterfall) {
            // 瀑布流模式：滚动到对应锚点
            const anchor = document.getElementById('waterfall-tab-' + tabKey);
            if (anchor) {
              anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
              //该 tab 在当前训练类型下没有可见 section，直接重渲染
              renderView('config');
            }
            // 仍然刷新 topbar 高亮
            $$('.top-nav-item').forEach((it) => {
              it.classList.toggle('active', it.dataset.tab === tabKey);
            });
          } else {
            renderView('config');
          }
        } else {
          syncTopbarState();
        }
      });
    });
    syncTopbarState();
  }

  function setupNavigator() {
    const nav = $('#navigator');
    const collapseBtn = $('#navigator-collapse-btn');
    const expandBtn = $('#navigator-expand-btn');

    const updateNavUI = () => {
      if (state.activeModule !== 'config') {
        return;
      }
      nav?.classList.toggle('collapsed', state.navigatorCollapsed);
      if(expandBtn) {
        expandBtn.style.display = state.navigatorCollapsed ? 'flex' : 'none';
      }
    };

    collapseBtn?.addEventListener('click', () => {
      state.navigatorCollapsed = true;
      persistNavigatorCollapsed(true);
      updateNavUI();
    });
    expandBtn?.addEventListener('click', () => {
      state.navigatorCollapsed = false;
      persistNavigatorCollapsed(false);
      updateNavUI();
    });
    updateNavUI();

    $$('.nav-section .section-header.collapsible').forEach((header) => {
      header.addEventListener('click', () => {
        const section = header.closest('.nav-section');
        if (!section) return;
        const sectionId = section.id.replace('section-', '');
        state.sections[sectionId] = !state.sections[sectionId];
        section.classList.toggle('collapsed', !state.sections[sectionId]);
      });
    });
  }

  return {
    dismissPreflightReport,
    dismissTrainingSummary,
    setupSidebar,
    setupTopbar,
    setupNavigator,
  };
}
