import {
  clampBBoxValue,
  getBBoxClassLabel as resolveBBoxClassLabel,
  getBBoxClassOptions as resolveBBoxClassOptions,
  normalizeBBoxBox as normalizeBBoxBoxGeometry,
  parseBBoxClassNames as parseBBoxClassNamesText,
} from './bboxGeometry.js';
import { bindBBoxCanvasInteractions as bindBBoxCanvasInteractionsController } from './bboxCanvasInteractions.js';
import {
  renderBBoxBatchJobPanelHtml,
  renderBBoxAnnotatorShellHtml,
  renderBBoxBoxListHtml,
  renderBBoxImageListHtml,
  renderBBoxInspectorHtml,
  renderBBoxOverlayHtml,
  renderBBoxViewerHtml,
} from './bboxAnnotatorTemplates.js';

export function createBBoxAnnotator({ state, api, $, escapeHtml, showToast }) {
  const bboxState = state.datasetBBoxAnnotator || (state.datasetBBoxAnnotator = {
    datasetPath: "",
    recursive: true,
    images: [],
    currentIndex: 0,
    currentImagePath: "",
    currentDetail: null,
    boxes: [],
    selectedIndex: -1,
    dirty: false,
    classNamesText: "",
    drawClassId: 0,
    predictModel: "yolo11n.pt",
    predictConf: 0.25,
    predictIou: 0.45,
    predictDevice: "",
    appendPredictions: false,
    batchWriteMode: "skip_existing",
    batchJobId: "",
    batchJobSnapshot: null,
    batchPollTimer: null,
    drawing: null,
  });

  function parseBBoxClassNames(text = bboxState.classNamesText || '') {
    return parseBBoxClassNamesText(text);
  }

  function getBBoxClassOptions() {
    return resolveBBoxClassOptions(bboxState.classNamesText || '');
  }

  function getBBoxClassLabel(classId, fallbackName = '') {
    return resolveBBoxClassLabel(bboxState.classNamesText || '', classId, fallbackName);
  }

  function normalizeBBoxBox(box, overrides = {}) {
    return normalizeBBoxBoxGeometry(box, overrides, bboxState.classNamesText || '');
  }

  function syncBBoxInputsToState() {
    bboxState.datasetPath = $('#bbox-path')?.value?.trim() || bboxState.datasetPath || '';
    bboxState.recursive = $('#bbox-recursive')?.checked ?? bboxState.recursive ?? true;
    bboxState.classNamesText = $('#bbox-class-names')?.value ?? bboxState.classNamesText ?? '';
    bboxState.predictModel = $('#bbox-predict-model')?.value?.trim() || bboxState.predictModel || 'yolo11n.pt';
    bboxState.predictConf = Number($('#bbox-predict-conf')?.value || bboxState.predictConf || 0.25);
    bboxState.predictIou = Number($('#bbox-predict-iou')?.value || bboxState.predictIou || 0.45);
    bboxState.predictDevice = $('#bbox-predict-device')?.value?.trim() || bboxState.predictDevice || '';
    bboxState.appendPredictions = $('#bbox-predict-append')?.checked ?? bboxState.appendPredictions ?? false;
    bboxState.batchWriteMode = $('#bbox-batch-write-mode')?.value || bboxState.batchWriteMode || 'skip_existing';
  }

  function renderBBoxClassSelectOptions(selectId, selectedValue = 0) {
    const select = $('#' + selectId);
    if (!select) return;
    const options = getBBoxClassOptions();
    const desired = Math.max(0, Number(selectedValue) || 0);
    select.innerHTML = options.map((label, index) => (
      `<option value="${index}" ${index === desired ? 'selected' : ''}>${index}: ${escapeHtml(label)}</option>`
    )).join('');
    if (desired >= options.length && options.length) {
      select.value = String(options.length - 1);
    }
  }

  function setBBoxStatus(message, isError = false) {
    const node = $('#bbox-status');
    if (!node) return;
    if (!message) {
      node.innerHTML = '';
      return;
    }
    node.innerHTML = `<span style="color:${isError ? 'var(--danger)' : 'var(--text-dim)'};">${escapeHtml(message)}</span>`;
  }

  function clearBBoxBatchPollTimer() {
    if (bboxState.batchPollTimer) {
      clearInterval(bboxState.batchPollTimer);
      bboxState.batchPollTimer = null;
    }
  }

  function renderBBoxBatchJobPanel() {
    const node = $('#bbox-batch-job');
    if (!node) return;
    node.innerHTML = renderBBoxBatchJobPanelHtml({ job: bboxState.batchJobSnapshot, jobId: bboxState.batchJobId, escapeHtml });
  }

  function renderBBoxImageList() {
    const list = $('#bbox-image-list');
    if (!list) return;
    list.innerHTML = renderBBoxImageListHtml({ images: bboxState.images, currentIndex: bboxState.currentIndex, escapeHtml });
  }

  function renderBBoxBoxList() {
    const list = $('#bbox-box-list');
    if (!list) return;
    list.innerHTML = renderBBoxBoxListHtml({
      boxes: bboxState.boxes,
      selectedIndex: bboxState.selectedIndex,
      getClassLabel: getBBoxClassLabel,
      escapeHtml,
    });
  }

  function renderBBoxInspector() {
    const inspector = $('#bbox-inspector');
    if (!inspector) return;
    const selected = bboxState.boxes[bboxState.selectedIndex] || null;
    inspector.innerHTML = renderBBoxInspectorHtml({
      detail: bboxState.currentDetail,
      boxes: bboxState.boxes,
      selectedIndex: bboxState.selectedIndex,
      dirty: bboxState.dirty,
      escapeHtml,
    });
    renderBBoxClassSelectOptions('bbox-class-select', bboxState.drawClassId);
    if (selected) renderBBoxClassSelectOptions('bbox-selected-class', selected.class_id);
    renderBBoxBoxList();
  }

  function renderBBoxOverlay() {
    const overlay = $('#bbox-overlay');
    const image = $('#bbox-image');
    if (!overlay || !image) return;
    const displayWidth = Math.max(1, image.clientWidth || image.naturalWidth || 1);
    const displayHeight = Math.max(1, image.clientHeight || image.naturalHeight || 1);
    overlay.setAttribute('viewBox', `0 0 ${displayWidth} ${displayHeight}`);
    overlay.setAttribute('preserveAspectRatio', 'none');
    overlay.innerHTML = renderBBoxOverlayHtml({
      boxes: bboxState.boxes,
      draftBox: bboxState.drawing?.draftBox || null,
      selectedIndex: bboxState.selectedIndex,
      displayWidth,
      displayHeight,
      getClassLabel: getBBoxClassLabel,
      escapeHtml,
    });
  }

  function bindBBoxCanvasInteractions() {
    bindBBoxCanvasInteractionsController({
      bboxState,
      $,
      normalizeBBoxBox,
      getBBoxClassLabel,
      renderBBoxOverlay,
      renderBBoxInspector,
    });
  }

  function renderBBoxViewer() {
    const viewer = $('#bbox-viewer');
    if (!viewer) return;
    if (!bboxState.currentDetail) {
      viewer.innerHTML = renderBBoxViewerHtml({ imagePath: '', escapeHtml });
      return;
    }
    viewer.innerHTML = renderBBoxViewerHtml({ imagePath: bboxState.currentDetail.image_path || '', escapeHtml });
    const img = $('#bbox-image');
    if (!img) return;
    img.onload = () => {
      renderBBoxOverlay();
      bindBBoxCanvasInteractions();
    };
    img.src = api.getBBoxImageUrl(bboxState.currentDetail.image_path) + `&ts=${Date.now()}`;
  }

  function renderBBoxClassControls() {
    syncBBoxInputsToState();
    const classSelect = $('#bbox-class-select');
    if (classSelect) {
      const current = Math.max(0, Number(classSelect.value || bboxState.drawClassId || 0));
      bboxState.drawClassId = current;
      renderBBoxClassSelectOptions('bbox-class-select', current);
      bboxState.drawClassId = Number($('#bbox-class-select')?.value || current || 0);
    }
    if (bboxState.selectedIndex >= 0 && bboxState.boxes[bboxState.selectedIndex]) {
      renderBBoxClassSelectOptions('bbox-selected-class', bboxState.boxes[bboxState.selectedIndex].class_id);
    }
    if (state.datasetSubTab === 'bbox') {
      renderBBoxBoxList();
      renderBBoxOverlay();
    }
  }

  async function loadBBoxImageByIndex(index, { bypassDirty = false } = {}) {
    syncBBoxInputsToState();
    if (index < 0 || index >= bboxState.images.length) return;
    if (!bypassDirty && bboxState.dirty && bboxState.currentImagePath && !window.confirm('当前图片有未保存修改，确定切换图片吗？')) {
      return;
    }
    const entry = bboxState.images[index];
    setBBoxStatus(`读取图片：${entry.relative_path || entry.image_path}`);
    try {
      const response = await api.readBBoxAnnotation({ image_path: entry.image_path });
      const detail = response?.data || {};
      bboxState.currentIndex = index;
      bboxState.currentImagePath = entry.image_path;
      bboxState.currentDetail = detail;
      bboxState.boxes = Array.isArray(detail.boxes) ? detail.boxes.map((box) => normalizeBBoxBox(box)) : [];
      bboxState.selectedIndex = bboxState.boxes.length ? 0 : -1;
      bboxState.dirty = false;
      bboxState.drawing = null;
      renderBBoxImageList();
      renderBBoxInspector();
      renderBBoxViewer();
      renderBBoxClassControls();
      setBBoxStatus(`已载入 ${entry.relative_path || entry.image_path}`);
    } catch (error) {
      setBBoxStatus(error.message || '读取图片失败。', true);
      showToast(error.message || '读取图片失败。');
    }
  }

  async function refreshBBoxDataset() {
    syncBBoxInputsToState();
    if (!bboxState.datasetPath) {
      showToast('请先填写图片目录或数据集目录。');
      return;
    }
    setBBoxStatus('正在扫描图片列表...');
    const list = $('#bbox-image-list');
    if (list) list.innerHTML = '<div class="builtin-picker-empty"><span>扫描中...</span></div>';
    try {
      const response = await api.listBBoxImages({
        path: bboxState.datasetPath,
        recursive: bboxState.recursive,
      });
      const images = response?.data?.images || [];
      bboxState.images = images;
      const existingIndex = images.findIndex((entry) => entry.image_path === bboxState.currentImagePath);
      if (!images.length) {
        bboxState.currentIndex = 0;
        bboxState.currentImagePath = '';
        bboxState.currentDetail = null;
        bboxState.boxes = [];
        bboxState.selectedIndex = -1;
        bboxState.dirty = false;
        renderBBoxImageList();
        renderBBoxInspector();
        renderBBoxViewer();
        setBBoxStatus('没有找到图片。');
        return;
      }
      const targetIndex = existingIndex >= 0 ? existingIndex : 0;
      await loadBBoxImageByIndex(targetIndex, { bypassDirty: true });
      setBBoxStatus(`已载入 ${images.length} 张图片。`);
    } catch (error) {
      if (list) list.innerHTML = `<div class="builtin-picker-empty"><span>${escapeHtml(error.message || '扫描失败')}</span></div>`;
      setBBoxStatus(error.message || '扫描失败。', true);
      showToast(error.message || '扫描图片失败。');
    }
  }

  function remapPredictedBBoxClasses(boxes) {
    const classNames = parseBBoxClassNames();
    if (!classNames.length) return boxes;
    const lookup = new Map(classNames.map((name, index) => [name.toLowerCase(), index]));
    return boxes.map((box) => {
      const className = String(box.class_name || '').trim();
      if (className && lookup.has(className.toLowerCase())) {
        return {
          ...box,
          class_id: lookup.get(className.toLowerCase()),
          class_name: classNames[lookup.get(className.toLowerCase())] || className,
        };
      }
      return box;
    });
  }

  async function predictBBoxCurrent() {
    syncBBoxInputsToState();
    if (!bboxState.currentImagePath) {
      showToast('请先选择一张图片。');
      return;
    }
    setBBoxStatus('正在执行 YOLO 预标注...');
    try {
      const response = await api.predictBBoxAnnotation({
        image_path: bboxState.currentImagePath,
        model: bboxState.predictModel || 'yolo11n.pt',
        conf: bboxState.predictConf,
        iou: bboxState.predictIou,
        device: bboxState.predictDevice || '',
      });
      const predicted = remapPredictedBBoxClasses((response?.data?.boxes || []).map((box) => ({
        ...box,
        class_id: Number(box.class_id || 0),
        x1: clampBBoxValue(box.x1),
        y1: clampBBoxValue(box.y1),
        x2: clampBBoxValue(box.x2),
        y2: clampBBoxValue(box.y2),
      }))).map((box) => normalizeBBoxBox(box));
      bboxState.boxes = bboxState.appendPredictions ? [...bboxState.boxes, ...predicted] : predicted;
      bboxState.selectedIndex = bboxState.boxes.length ? 0 : -1;
      bboxState.dirty = true;
      renderBBoxInspector();
      renderBBoxOverlay();
      setBBoxStatus(`模型预标注完成，得到 ${predicted.length} 个框。`);
      showToast(`预标注完成：${predicted.length} 个框`);
    } catch (error) {
      setBBoxStatus(error.message || 'YOLO 预标注失败。', true);
      showToast(error.message || 'YOLO 预标注失败。');
    }
  }

  async function pollBBoxBatchJob(jobId) {
    clearBBoxBatchPollTimer();
    const tick = async () => {
      try {
        const data = await api.getJob(jobId);
        bboxState.batchJobId = jobId;
        bboxState.batchJobSnapshot = data || null;
        renderBBoxBatchJobPanel();
        if (data.status === 'completed') {
          clearBBoxBatchPollTimer();
          const metadata = data.metadata || {};
          const summary = `批量预标注完成：写入 ${Number(metadata.saved_count || 0)} 张，跳过 ${Number(metadata.skipped_existing_count || 0)} 张，失败 ${Number(metadata.failed_count || 0)} 张。`;
          if (!bboxState.dirty && bboxState.datasetPath) {
            await refreshBBoxDataset();
          }
          setBBoxStatus(summary, false);
          renderBBoxBatchJobPanel();
          showToast('批量 YOLO 预标注完成。');
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          clearBBoxBatchPollTimer();
          const message = data.error || (data.status === 'cancelled' ? '批量任务已取消。' : '批量任务失败。');
          setBBoxStatus(message, data.status === 'failed');
          renderBBoxBatchJobPanel();
          showToast(message);
        }
      } catch (error) {
        clearBBoxBatchPollTimer();
        bboxState.batchJobSnapshot = {
          id: jobId,
          status: 'failed',
          error: error.message || '批量任务轮询失败。',
          progress: 0,
          metadata: bboxState.batchJobSnapshot?.metadata || {},
        };
        renderBBoxBatchJobPanel();
        setBBoxStatus(error.message || '批量任务轮询失败。', true);
      }
    };
    await tick();
    if (!bboxState.batchJobSnapshot || !['completed', 'failed', 'cancelled'].includes(String(bboxState.batchJobSnapshot.status || ''))) {
      bboxState.batchPollTimer = setInterval(tick, 1200);
    }
  }

  async function startBBoxBatchPredict() {
    syncBBoxInputsToState();
    if (bboxState.batchJobId && ['pending', 'running'].includes(String(bboxState.batchJobSnapshot?.status || ''))) {
      showToast('已有批量预标注任务在运行，请先等它完成或手动取消。');
      return;
    }
    if (!bboxState.datasetPath) {
      showToast('请先填写图片目录或数据集目录。');
      return;
    }
    setBBoxStatus('正在提交批量 YOLO 预标注任务...');
    try {
      const response = await api.startBBoxBatchPredict({
        path: bboxState.datasetPath,
        recursive: bboxState.recursive,
        model: bboxState.predictModel || 'yolo11n.pt',
        conf: bboxState.predictConf,
        iou: bboxState.predictIou,
        device: bboxState.predictDevice || '',
        write_mode: bboxState.batchWriteMode || 'skip_existing',
      });
      const jobId = response?.data?.job_id || '';
      if (!jobId) throw new Error('未返回 job_id');
      bboxState.batchJobId = jobId;
      bboxState.batchJobSnapshot = {
        id: jobId,
        status: 'pending',
        progress: 0,
        metadata: {
          total_images: Number(response?.data?.total_images || 0),
          completed_count: 0,
          saved_count: 0,
          skipped_existing_count: 0,
          failed_count: 0,
          write_mode: bboxState.batchWriteMode || 'skip_existing',
        },
      };
      renderBBoxBatchJobPanel();
      setBBoxStatus(`批量任务已提交，共 ${Number(response?.data?.total_images || 0)} 张图片。`);
      showToast('批量 YOLO 预标注任务已提交。');
      await pollBBoxBatchJob(jobId);
    } catch (error) {
      setBBoxStatus(error.message || '批量 YOLO 预标注提交失败。', true);
      showToast(error.message || '批量 YOLO 预标注提交失败。');
    }
  }

  async function cancelBBoxBatchPredict(jobId = bboxState.batchJobId) {
    if (!jobId) {
      showToast('当前没有运行中的批量任务。');
      return;
    }
    try {
      await api.cancelJob(jobId);
      showToast('已请求取消批量预标注任务。');
    } catch (error) {
      showToast(error.message || '取消失败。');
    }
  }

  async function saveBBoxCurrent() {
    if (!bboxState.currentImagePath) {
      showToast('请先选择一张图片。');
      return;
    }
    setBBoxStatus('正在保存 YOLO 标注...');
    try {
      const response = await api.saveBBoxAnnotation({
        image_path: bboxState.currentImagePath,
        boxes: bboxState.boxes,
      });
      bboxState.dirty = false;
      if (bboxState.images[bboxState.currentIndex]) {
        bboxState.images[bboxState.currentIndex].annotated = true;
        bboxState.images[bboxState.currentIndex].box_count = response?.data?.box_count ?? bboxState.boxes.length;
      }
      if (bboxState.currentDetail) bboxState.currentDetail.label_path = response?.data?.label_path || bboxState.currentDetail.label_path;
      renderBBoxImageList();
      renderBBoxInspector();
      setBBoxStatus(`已保存 ${response?.data?.box_count ?? bboxState.boxes.length} 个框。`);
      showToast('YOLO 标注已保存。');
    } catch (error) {
      setBBoxStatus(error.message || '保存失败。', true);
      showToast(error.message || '保存失败。');
    }
  }

  function deleteBBoxSelected() {
    if (bboxState.selectedIndex < 0 || !bboxState.boxes[bboxState.selectedIndex]) {
      showToast('请先选择一个框。');
      return;
    }
    bboxState.boxes.splice(bboxState.selectedIndex, 1);
    bboxState.selectedIndex = bboxState.boxes.length ? Math.min(bboxState.selectedIndex, bboxState.boxes.length - 1) : -1;
    bboxState.dirty = true;
    renderBBoxInspector();
    renderBBoxOverlay();
  }

  function undoBBoxLast() {
    if (!bboxState.boxes.length) return;
    bboxState.boxes.pop();
    bboxState.selectedIndex = bboxState.boxes.length - 1;
    bboxState.dirty = true;
    renderBBoxInspector();
    renderBBoxOverlay();
  }

  function clearBBoxBoxes() {
    if (!bboxState.boxes.length) return;
    if (!window.confirm('确定清空当前图片的所有框吗？')) return;
    bboxState.boxes = [];
    bboxState.selectedIndex = -1;
    bboxState.dirty = true;
    renderBBoxInspector();
    renderBBoxOverlay();
  }

  function selectBBoxIndex(index) {
    bboxState.selectedIndex = Number(index);
    renderBBoxInspector();
    renderBBoxOverlay();
  }

  function updateBBoxSelectedClass() {
    const selected = bboxState.boxes[bboxState.selectedIndex];
    if (!selected) return;
    const nextClassId = Number($('#bbox-selected-class')?.value || selected.class_id || 0);
    selected.class_id = nextClassId;
    selected.class_name = getBBoxClassLabel(nextClassId, selected.class_name || '');
    bboxState.dirty = true;
    renderBBoxInspector();
    renderBBoxOverlay();
  }

  async function openBBoxPrev() {
    if (!bboxState.images.length) return;
    const nextIndex = Math.max(0, bboxState.currentIndex - 1);
    await loadBBoxImageByIndex(nextIndex);
  }

  async function openBBoxNext() {
    if (!bboxState.images.length) return;
    const nextIndex = Math.min(bboxState.images.length - 1, bboxState.currentIndex + 1);
    await loadBBoxImageByIndex(nextIndex);
  }

  function renderBBoxAnnotator() {
    const content = $('#dataset-content');
    if (!content) return;
    content.innerHTML = renderBBoxAnnotatorShellHtml({ bboxState, escapeHtml });
    renderBBoxImageList();
    renderBBoxInspector();
    renderBBoxViewer();
    renderBBoxClassControls();
    renderBBoxBatchJobPanel();
  }

  return {
    renderBBoxAnnotator,
    refreshBBoxDataset,
    openBBoxImageByIndex: (index) => loadBBoxImageByIndex(Number(index)),
    saveBBoxCurrent,
    predictBBoxCurrent,
    startBBoxBatchPredict,
    cancelBBoxBatchPredict,
    deleteBBoxSelected,
    undoBBoxLast,
    clearBBoxBoxes,
    selectBBoxIndex,
    updateBBoxSelectedClass,
    syncBBoxClassControls: renderBBoxClassControls,
    openBBoxPrev,
    openBBoxNext,
  };
}
