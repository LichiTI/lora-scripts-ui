import {
  clampBBoxValue,
  cloneBBoxBox,
  hasBBoxBoxChanged,
  isBBoxBoxLargeEnough,
} from './bboxGeometry.js';

export function bindBBoxCanvasInteractions({
  bboxState,
  $,
  normalizeBBoxBox,
  getBBoxClassLabel,
  renderBBoxOverlay,
  renderBBoxInspector,
}) {
  const overlay = $('#bbox-overlay');
  const image = $('#bbox-image');
  if (!overlay || !image || overlay.dataset.bound === '1') return;
  overlay.dataset.bound = '1';

  const pointerToNorm = (event) => {
    const rect = overlay.getBoundingClientRect();
    return {
      x: clampBBoxValue((event.clientX - rect.left) / Math.max(rect.width, 1)),
      y: clampBBoxValue((event.clientY - rect.top) / Math.max(rect.height, 1)),
    };
  };

  const beginDraw = (event, start) => {
    const classId = Number($('#bbox-class-select')?.value || bboxState.drawClassId || 0);
    bboxState.drawing = {
      mode: 'draw',
      pointerId: event.pointerId,
      start,
      draftBox: {
        class_id: classId,
        class_name: getBBoxClassLabel(classId),
        x1: start.x,
        y1: start.y,
        x2: start.x,
        y2: start.y,
        source: 'manual',
      },
    };
    try { overlay.setPointerCapture(event.pointerId); } catch {}
    renderBBoxOverlay();
  };

  const beginMove = (event, boxIndex, start) => {
    const selected = cloneBBoxBox(bboxState.boxes[boxIndex]);
    if (!selected) return;
    bboxState.selectedIndex = boxIndex;
    bboxState.drawing = {
      mode: 'move',
      pointerId: event.pointerId,
      start,
      boxIndex,
      originalBox: selected,
    };
    renderBBoxInspector();
    try { overlay.setPointerCapture(event.pointerId); } catch {}
    renderBBoxOverlay();
  };

  const beginResize = (event, boxIndex, handle, start) => {
    const selected = cloneBBoxBox(bboxState.boxes[boxIndex]);
    if (!selected) return;
    bboxState.selectedIndex = boxIndex;
    bboxState.drawing = {
      mode: 'resize',
      pointerId: event.pointerId,
      start,
      boxIndex,
      handle,
      originalBox: selected,
    };
    renderBBoxInspector();
    try { overlay.setPointerCapture(event.pointerId); } catch {}
    renderBBoxOverlay();
  };

  overlay.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const start = pointerToNorm(event);
    const boxIndexAttr = event.target?.dataset?.boxIndex ?? '';
    const handle = String(event.target?.dataset?.handle || '');
    const boxIndex = Number(boxIndexAttr);
    if (boxIndexAttr !== '' && Number.isInteger(boxIndex) && boxIndex >= 0 && bboxState.boxes[boxIndex]) {
      event.preventDefault();
      if (handle) {
        beginResize(event, boxIndex, handle, start);
        return;
      }
      beginMove(event, boxIndex, start);
      return;
    }
    event.preventDefault();
    beginDraw(event, start);
  });

  overlay.addEventListener('pointermove', (event) => {
    if (!bboxState.drawing || bboxState.drawing.pointerId !== event.pointerId) return;
    const point = pointerToNorm(event);
    if (bboxState.drawing.mode === 'draw') {
      bboxState.drawing.draftBox.x2 = point.x;
      bboxState.drawing.draftBox.y2 = point.y;
    } else if (bboxState.drawing.mode === 'move') {
      const original = bboxState.drawing.originalBox;
      const dx = point.x - bboxState.drawing.start.x;
      const dy = point.y - bboxState.drawing.start.y;
      const shiftX = Math.min(Math.max(dx, -original.x1), 1 - original.x2);
      const shiftY = Math.min(Math.max(dy, -original.y1), 1 - original.y2);
      bboxState.boxes[bboxState.drawing.boxIndex] = normalizeBBoxBox(original, {
        x1: original.x1 + shiftX,
        y1: original.y1 + shiftY,
        x2: original.x2 + shiftX,
        y2: original.y2 + shiftY,
      });
    } else if (bboxState.drawing.mode === 'resize') {
      const original = bboxState.drawing.originalBox;
      const handle = String(bboxState.drawing.handle || '');
      const next = {
        x1: original.x1,
        y1: original.y1,
        x2: original.x2,
        y2: original.y2,
      };
      if (handle.includes('w')) next.x1 = point.x;
      if (handle.includes('e')) next.x2 = point.x;
      if (handle.includes('n')) next.y1 = point.y;
      if (handle.includes('s')) next.y2 = point.y;
      bboxState.boxes[bboxState.drawing.boxIndex] = normalizeBBoxBox(original, next);
    }
    renderBBoxOverlay();
  });

  const finalizeInteraction = (event) => {
    if (!bboxState.drawing || bboxState.drawing.pointerId !== event.pointerId) return;
    const drawing = bboxState.drawing;
    bboxState.drawing = null;
    if (drawing.mode === 'draw') {
      const normalized = normalizeBBoxBox(drawing.draftBox, { source: 'manual' });
      if (isBBoxBoxLargeEnough(normalized)) {
        bboxState.boxes.push(normalized);
        bboxState.selectedIndex = bboxState.boxes.length - 1;
        bboxState.dirty = true;
        renderBBoxInspector();
      }
    } else if (drawing.mode === 'move' || drawing.mode === 'resize') {
      const index = Number(drawing.boxIndex);
      const current = bboxState.boxes[index];
      if (current) {
        const normalized = normalizeBBoxBox(current);
        if (!isBBoxBoxLargeEnough(normalized, 0.005)) {
          bboxState.boxes[index] = drawing.originalBox;
        } else {
          bboxState.boxes[index] = normalized;
          if (hasBBoxBoxChanged(normalized, drawing.originalBox)) {
            bboxState.dirty = true;
          }
        }
        bboxState.selectedIndex = index;
        renderBBoxInspector();
      }
    }
    try { overlay.releasePointerCapture(event.pointerId); } catch {}
    renderBBoxOverlay();
  };

  overlay.addEventListener('pointerup', finalizeInteraction);
  overlay.addEventListener('pointercancel', (event) => {
    if (!bboxState.drawing || bboxState.drawing.pointerId !== event.pointerId) return;
    const drawing = bboxState.drawing;
    bboxState.drawing = null;
    if ((drawing.mode === 'move' || drawing.mode === 'resize') && bboxState.boxes[drawing.boxIndex]) {
      bboxState.boxes[drawing.boxIndex] = drawing.originalBox;
      bboxState.selectedIndex = drawing.boxIndex;
      renderBBoxInspector();
    }
    renderBBoxOverlay();
  });
}
