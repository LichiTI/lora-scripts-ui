// actions/trainTabs.js — 训练页子tab 切换
// 依赖（工厂注入）：state, renderView, scanDataset, refreshSampleImages

export function createTrainTabsActions({ state,renderView, scanDataset, refreshSampleImages }) {
  function switchTrainTab(tab) {
    state.trainSubTab = tab;
    if (state.activeModule === 'training') {
      renderView('training');
      if (tab=== 'preflight' && !state.datasetAnalysis && !state.loading.preflight && state.config.train_data_dir) {
        scanDataset();
      }
      if (tab === 'samples') {
        setTimeout(refreshSampleImages, 100);
      }
    }
  }

  function setBubbleClosedLoopHistoryFilter(filter) {
    const allowed = new Set(['all', 'kept', 'rollback', 'blocked', 'active', 'none']);
    state.bubbleClosedLoopHistoryFilter = allowed.has(filter) ? filter : 'all';
    if (state.activeModule === 'training') {
      renderView('training');
    }
  }

  return { switchTrainTab, setBubbleClosedLoopHistoryFilter };
}
