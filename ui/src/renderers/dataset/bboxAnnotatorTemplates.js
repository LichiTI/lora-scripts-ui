import { buildBBoxHandleSpecs } from './bboxGeometry.js';

export function renderBBoxBatchJobPanelHtml({ job, jobId, escapeHtml }) {
  if (!job || !jobId) return '';
  const metadata = job.metadata || {};
  const total = Number(metadata.total_images || job.total_items || 0);
  const completed = Number(metadata.completed_count || job.completed_items || 0);
  const saved = Number(metadata.saved_count || 0);
  const skipped = Number(metadata.skipped_existing_count || 0);
  const failed = Number(metadata.failed_count || 0);
  const percent = Math.max(0, Math.min(100, Math.round((Number(job.progress || 0) || 0) * 100)));
  const currentImage = String(metadata.current_image || '').trim();
  const canCancel = job.status === 'running' || job.status === 'pending';
  return `
    <div style="margin-top:12px;padding:12px;border:1px solid var(--border-color, rgba(255,255,255,0.08));border-radius:8px;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">
        <strong>批量预标注任务 ${escapeHtml(job.id || jobId || '')}</strong>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span class="module-list-meta">${escapeHtml(job.status || 'pending')} · ${percent}%</span>
          ${canCancel ? `<button class="btn btn-outline btn-sm" type="button" onclick="cancelBBoxBatchPredict('${escapeHtml(job.id || jobId || '')}')">取消</button>` : ''}
        </div>
      </div>
      <div class="module-list-meta" style="margin-top:8px;">
        ${completed}/${total || '?'} 张 | 写入 ${saved} 张 | 跳过 ${skipped} 张 | 失败 ${failed} 张
      </div>
      ${currentImage ? `<div class="module-list-meta" style="margin-top:6px;">当前：${escapeHtml(currentImage)}</div>` : ''}
      ${job.error ? `<div class="module-list-meta" style="margin-top:6px;color:var(--danger);">${escapeHtml(job.error)}</div>` : ''}
    </div>
  `;
}

export function renderBBoxImageListHtml({ images, currentIndex, escapeHtml }) {
  if (!images.length) return '<div class="builtin-picker-empty"><span>还没有载入图片列表。</span></div>';
  return images.map((entry, index) => {
    const active = index === currentIndex;
    const label = entry.annotated ? `已标 ${entry.box_count ?? 0}` : '未标注';
    return `
      <button
        class="module-list-item module-list-item-static"
        type="button"
        onclick="openBBoxImageByIndex(${index})"
        style="width:100%;text-align:left;border:${active ? '1px solid var(--accent)' : '1px solid var(--border-color, rgba(255,255,255,0.08))'};background:${active ? 'rgba(99,102,241,0.12)' : 'transparent'};margin-bottom:8px;cursor:pointer;"
      >
        <div class="module-list-main">
          <strong>${escapeHtml(entry.relative_path || entry.image_path || `image_${index}`)}</strong>
          <span class="module-list-meta">${entry.width} x ${entry.height} | ${escapeHtml(label)}</span>
        </div>
      </button>
    `;
  }).join('');
}

export function renderBBoxBoxListHtml({ boxes, selectedIndex, getClassLabel, escapeHtml }) {
  if (!boxes.length) return '<div class="builtin-picker-empty"><span>当前图片还没有框。拖动画布即可新增。</span></div>';
  return boxes.map((box, index) => {
    const active = index === selectedIndex;
    const width = Math.max(0, (box.x2 - box.x1) * 100).toFixed(1);
    const height = Math.max(0, (box.y2 - box.y1) * 100).toFixed(1);
    const conf = box.confidence != null ? ` | conf ${(Number(box.confidence) || 0).toFixed(2)}` : '';
    return `
      <button
        class="module-list-item module-list-item-static"
        type="button"
        onclick="selectBBoxIndex(${index})"
        style="width:100%;text-align:left;border:${active ? '1px solid var(--accent)' : '1px solid var(--border-color, rgba(255,255,255,0.08))'};background:${active ? 'rgba(99,102,241,0.12)' : 'transparent'};margin-bottom:8px;cursor:pointer;"
      >
        <div class="module-list-main">
          <strong>#${index + 1} · ${escapeHtml(getClassLabel(box.class_id, box.class_name))}</strong>
          <span class="module-list-meta">${width}% x ${height}%${conf}</span>
        </div>
      </button>
    `;
  }).join('');
}

export function renderBBoxInspectorHtml({ detail, boxes, selectedIndex, dirty, escapeHtml }) {
  const imageLabel = detail?.image_name || '未选择图片';
  const labelPath = detail?.label_path || '-';
  const selected = boxes[selectedIndex] || null;
  return `
    <div class="module-list">
      <div class="module-list-item module-list-item-static">
        <div class="module-list-main">
          <strong>${escapeHtml(imageLabel)}</strong>
          <span class="module-list-meta">${detail ? `${detail.width} x ${detail.height}` : '请选择左侧图片'}</span>
          <span class="module-list-meta">标注文件: ${escapeHtml(labelPath)}</span>
          <span class="module-list-meta">当前框数: ${boxes.length}${dirty ? ' | 有未保存修改' : ''}</span>
        </div>
      </div>
    </div>
    <div style="margin-top:12px;padding:12px;border:1px solid var(--border-color, rgba(255,255,255,0.08));border-radius:8px;">
      <strong style="display:block;margin-bottom:8px;">当前绘制类别</strong>
      <select id="bbox-class-select" onchange="syncBBoxClassControls()" style="width:100%;"></select>
    </div>
    <div style="margin-top:12px;padding:12px;border:1px solid var(--border-color, rgba(255,255,255,0.08));border-radius:8px;">
      <strong style="display:block;margin-bottom:8px;">选中框编辑</strong>
      ${selected ? `
        <div class="config-group" style="margin:0;">
          <label>类别</label>
          <select id="bbox-selected-class" onchange="updateBBoxSelectedClass()" style="width:100%;"></select>
        </div>
        <div class="module-list-meta" style="margin-top:8px;">
          x1=${(selected.x1 || 0).toFixed(3)} | y1=${(selected.y1 || 0).toFixed(3)} | x2=${(selected.x2 || 0).toFixed(3)} | y2=${(selected.y2 || 0).toFixed(3)}
        </div>
      ` : '<div class="module-list-meta">先在右侧框列表或画布中选中一个框。</div>'}
    </div>
    <div style="margin-top:12px;">
      <strong style="display:block;margin-bottom:8px;">框列表</strong>
      <div id="bbox-box-list" style="max-height:38vh;overflow:auto;"></div>
    </div>
  `;
}

export function renderBBoxOverlayHtml({ boxes, draftBox, selectedIndex, displayWidth, displayHeight, getClassLabel, escapeHtml }) {
  const draft = draftBox ? [draftBox] : [];
  return [...boxes, ...draft].map((box, rawIndex) => {
    const isDraft = rawIndex >= boxes.length;
    const index = isDraft ? -1 : rawIndex;
    const x = Math.min(box.x1, box.x2) * displayWidth;
    const y = Math.min(box.y1, box.y2) * displayHeight;
    const w = Math.abs((box.x2 - box.x1) * displayWidth);
    const h = Math.abs((box.y2 - box.y1) * displayHeight);
    const isSelected = index === selectedIndex;
    const color = isDraft ? 'var(--warning)' : (isSelected ? 'var(--success)' : '#60a5fa');
    const label = isDraft ? '绘制中' : getClassLabel(box.class_id, box.class_name);
    const handles = !isDraft && isSelected
      ? buildBBoxHandleSpecs(box, displayWidth, displayHeight).map((handle) => `
          <circle
            data-box-index="${index}"
            data-handle="${handle.name}"
            cx="${handle.x}"
            cy="${handle.y}"
            r="6"
            fill="#ffffff"
            stroke="${color}"
            stroke-width="2"
            style="cursor:${handle.cursor};"
          ></circle>
        `).join('')
      : '';
    return `
      <g data-box-index="${index}">
        <rect
          data-box-index="${index}"
          x="${x}"
          y="${y}"
          width="${w}"
          height="${h}"
          fill="rgba(96,165,250,0.10)"
          stroke="${color}"
          stroke-width="${isDraft ? 2.5 : 2}"
          style="cursor:${isDraft ? 'crosshair' : (isSelected ? 'move' : 'pointer')};"
        ></rect>
        <text data-box-index="${index}" x="${x + 6}" y="${Math.max(14, y + 16)}" fill="${color}" font-size="13" font-weight="700">${escapeHtml(label)}</text>
        ${handles}
      </g>
    `;
  }).join('');
}

export function renderBBoxViewerHtml({ imagePath, escapeHtml }) {
  if (!imagePath) return '<div class="builtin-picker-empty" style="min-height:420px;"><span>先载入左侧图片列表，再选择一张图片开始标注。</span></div>';
  return `
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
      <div class="module-list-meta">${escapeHtml(imagePath || '')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" type="button" onclick="openBBoxPrev()">上一张</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="openBBoxNext()">下一张</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="undoBBoxLast()">撤销最后一个框</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="deleteBBoxSelected()">删除选中框</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="clearBBoxBoxes()">清空当前框</button>
        <button class="btn btn-primary btn-sm" type="button" onclick="saveBBoxCurrent()">保存 YOLO 标注</button>
      </div>
    </div>
    <div class="module-list-meta" style="margin-bottom:12px;">空白处拖动可新建框；拖动已有框可移动；拖拽四角或边中点可拉伸。</div>
    <div style="background:rgba(0,0,0,0.18);border:1px solid var(--border-color, rgba(255,255,255,0.08));border-radius:8px;padding:12px;text-align:center;min-height:420px;">
      <div style="position:relative;display:inline-block;max-width:100%;">
        <img id="bbox-image" alt="bbox-annotator" style="display:block;max-width:100%;height:auto;max-height:72vh;border-radius:6px;" />
        <svg id="bbox-overlay" style="position:absolute;inset:0;width:100%;height:100%;cursor:crosshair;"></svg>
      </div>
    </div>
  `;
}

export function renderBBoxAnnotatorShellHtml({ bboxState, escapeHtml }) {
  return `
    <section class="form-section">
      <header class="section-header"><h3>框标注 Lite</h3></header>
      <div class="section-summary">做 YOLO 检测框数据集。支持手动画框、读写 YOLO txt，以及用 YOLO 模型给当前图片做预标注后再人工修正。</div>
      <div class="section-content tool-fields">
        <div class="config-group" style="grid-column:1/-1;">
          <label>数据集 / 图片目录</label>
          <div class="input-picker">
            <button class="picker-icon" type="button" onclick="pickPathForInput('bbox-path', 'folder')">
              <svg class="icon"><use href="#icon-folder"></use></svg>
            </button>
            <button class="picker-mode-icon-btn" type="button" title="内置文件选择器（train 目录）" onclick="openBuiltinPickerForInput('bbox-path', 'folder')"><svg class="icon"><use href="#icon-folder"></use></svg></button>
            <input class="text-input" type="text" id="bbox-path" placeholder="./datasets/yolo/images/train" value="${escapeHtml(bboxState.datasetPath || '')}">
          </div>
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>递归扫描子目录</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="bbox-recursive" ${bboxState.recursive ? 'checked' : ''}><span class="slider round"></span></label>
        </div>
        <div class="config-group">
          <label>类别名称</label>
          <p class="field-desc">一行一个。顺序就是 YOLO 的 class id 顺序。手动画框和模型预标注后的类别映射都会用这里。</p>
          <textarea class="text-input" id="bbox-class-names" style="min-height:120px;width:100%;" oninput="syncBBoxClassControls()" placeholder="person&#10;cat&#10;dog">${escapeHtml(bboxState.classNamesText || '')}</textarea>
        </div>
        <div class="config-group">
          <label>YOLO 预标注模型</label>
          <input class="text-input" type="text" id="bbox-predict-model" value="${escapeHtml(bboxState.predictModel || 'yolo11n.pt')}" placeholder="yolo11n.pt / 自定义权重路径">
        </div>
        <div class="config-group">
          <label>预标注阈值</label>
          <input class="text-input" type="number" id="bbox-predict-conf" value="${Number(bboxState.predictConf || 0.25)}" min="0" max="1" step="0.01">
        </div>
        <div class="config-group">
          <label>IoU 阈值</label>
          <input class="text-input" type="number" id="bbox-predict-iou" value="${Number(bboxState.predictIou || 0.45)}" min="0" max="1" step="0.01">
        </div>
        <div class="config-group">
          <label>设备（可选）</label>
          <input class="text-input" type="text" id="bbox-predict-device" value="${escapeHtml(bboxState.predictDevice || '')}" placeholder="0 / cpu / 留空自动">
        </div>
        <div class="config-group row boolean-card">
          <div class="label-col"><label>预标注后保留现有框</label></div>
          <label class="switch switch-compact"><input type="checkbox" id="bbox-predict-append" ${bboxState.appendPredictions ? 'checked' : ''}><span class="slider round"></span></label>
        </div>
        <div class="config-group">
          <label>批量预标注写回策略</label>
          <select id="bbox-batch-write-mode">
            <option value="skip_existing" ${bboxState.batchWriteMode === 'skip_existing' ? 'selected' : ''}>跳过已有标注</option>
            <option value="overwrite" ${bboxState.batchWriteMode === 'overwrite' ? 'selected' : ''}>覆盖已有标注</option>
            <option value="append" ${bboxState.batchWriteMode === 'append' ? 'selected' : ''}>追加到已有标注</option>
          </select>
          <p class="field-desc">只在你手动点击批量按钮后生效。默认只处理未标注图片。</p>
        </div>
      </div>
      <div class="tool-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" type="button" onclick="refreshBBoxDataset()">载入图片列表</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="predictBBoxCurrent()">YOLO 预标注当前图</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="startBBoxBatchPredict()">YOLO 批量预标注整个目录</button>
        <button class="btn btn-outline btn-sm" type="button" onclick="cancelBBoxBatchPredict()">取消批量任务</button>
        <span id="bbox-status" style="font-size:0.9rem;color:var(--text-dim);"></span>
      </div>
      <div id="bbox-batch-job" style="margin-top:12px;"></div>
    </section>
    <section class="form-section">
      <div style="display:grid;grid-template-columns:minmax(260px,320px) minmax(0,1fr) minmax(260px,320px);gap:16px;align-items:start;">
        <div>
          <header class="section-header"><h3>图片列表</h3></header>
          <div id="bbox-image-list" style="max-height:72vh;overflow:auto;"></div>
        </div>
        <div>
          <header class="section-header"><h3>标注画布</h3></header>
          <div id="bbox-viewer"></div>
        </div>
        <div>
          <header class="section-header"><h3>检查与修正</h3></header>
          <div id="bbox-inspector"></div>
        </div>
      </div>
    </section>
  `;
}
