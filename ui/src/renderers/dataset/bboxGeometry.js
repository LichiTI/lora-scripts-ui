export function clampBBoxValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  if (num < 0) return 0;
  if (num > 1) return 1;
  return num;
}

export function parseBBoxClassNames(text = '') {
  return String(text || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function getBBoxClassOptions(classNamesText = '') {
  const names = parseBBoxClassNames(classNamesText);
  return names.length ? names : ['class0'];
}

export function getBBoxClassLabel(classNamesText, classId, fallbackName = '') {
  const options = getBBoxClassOptions(classNamesText);
  const idx = Number(classId);
  if (Number.isInteger(idx) && idx >= 0 && idx < options.length) return options[idx];
  return fallbackName || `class${Number.isFinite(idx) ? idx : 0}`;
}

export function cloneBBoxBox(box) {
  return box ? { ...box } : null;
}

export function normalizeBBoxBox(box, overrides = {}, classNamesText = '') {
  const next = { ...(box || {}), ...overrides };
  const x1 = clampBBoxValue(Math.min(next.x1, next.x2));
  const y1 = clampBBoxValue(Math.min(next.y1, next.y2));
  const x2 = clampBBoxValue(Math.max(next.x1, next.x2));
  const y2 = clampBBoxValue(Math.max(next.y1, next.y2));
  const classId = Math.max(0, Number(next.class_id || 0));
  return {
    ...next,
    class_id: classId,
    class_name: getBBoxClassLabel(classNamesText, classId, next.class_name || ''),
    x1,
    y1,
    x2,
    y2,
    x_center: clampBBoxValue((x1 + x2) / 2),
    y_center: clampBBoxValue((y1 + y2) / 2),
    width: clampBBoxValue(x2 - x1),
    height: clampBBoxValue(y2 - y1),
  };
}

export function hasBBoxBoxChanged(a, b, epsilon = 1e-5) {
  if (!a || !b) return true;
  return (
    Math.abs((a.x1 || 0) - (b.x1 || 0)) > epsilon ||
    Math.abs((a.y1 || 0) - (b.y1 || 0)) > epsilon ||
    Math.abs((a.x2 || 0) - (b.x2 || 0)) > epsilon ||
    Math.abs((a.y2 || 0) - (b.y2 || 0)) > epsilon ||
    Number(a.class_id || 0) !== Number(b.class_id || 0)
  );
}

export function isBBoxBoxLargeEnough(box, minSize = 0.01) {
  if (!box) return false;
  return (box.x2 - box.x1) >= minSize && (box.y2 - box.y1) >= minSize;
}

export function buildBBoxHandleSpecs(box, displayWidth, displayHeight) {
  const left = Math.min(box.x1, box.x2) * displayWidth;
  const top = Math.min(box.y1, box.y2) * displayHeight;
  const right = Math.max(box.x1, box.x2) * displayWidth;
  const bottom = Math.max(box.y1, box.y2) * displayHeight;
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  return [
    { name: 'nw', x: left, y: top, cursor: 'nwse-resize' },
    { name: 'n', x: centerX, y: top, cursor: 'ns-resize' },
    { name: 'ne', x: right, y: top, cursor: 'nesw-resize' },
    { name: 'e', x: right, y: centerY, cursor: 'ew-resize' },
    { name: 'se', x: right, y: bottom, cursor: 'nwse-resize' },
    { name: 's', x: centerX, y: bottom, cursor: 'ns-resize' },
    { name: 'sw', x: left, y: bottom, cursor: 'nesw-resize' },
    { name: 'w', x: left, y: centerY, cursor: 'ew-resize' },
  ];
}
