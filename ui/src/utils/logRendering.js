import { escapeHtml } from './dom.js';

const ANSI_COLORS = {
  '30': '#666',
  '31': '#ef4444',
  '32': '#22c55e',
  '33': '#f59e0b',
  '34': '#3b82f6',
  '35': '#a855f7',
  '36': '#06b6d4',
  '37': '#e0e6ed',
  '90': '#64748b',
  '91': '#ff6b6b',
  '92': '#4ade80',
  '93': '#fbbf24',
  '94': '#60a5fa',
  '95': '#c084fc',
  '96': '#22d3ee',
  '97': '#f8fafc',
};

export function createTrainingLogCursor(taskId = '') {
  return { taskId, total: 0, liveLine: '' };
}

export function normalizeTrainingLiveLine(liveLine) {
  if (typeof liveLine !== 'string') return '';
  return liveLine.replace(/\s+$/, '');
}

export function mergeTrainingLogLines(lines, liveLine) {
  const merged = Array.isArray(lines) ? lines.slice() : [];
  const normalizedLiveLine = normalizeTrainingLiveLine(liveLine);
  if (normalizedLiveLine && merged[merged.length - 1] !== normalizedLiveLine) {
    merged.push(normalizedLiveLine);
  }
  return merged;
}

export function collectIncrementalTrainingLogLines(cursor, taskId, lines, total, liveLine) {
  let nextCursor = cursor && typeof cursor === 'object'
    ? cursor
    : createTrainingLogCursor();

  if (nextCursor.taskId !== taskId) {
    nextCursor = createTrainingLogCursor(taskId);
  }

  const safeLines = Array.isArray(lines) ? lines : [];
  const normalizedLiveLine = normalizeTrainingLiveLine(liveLine);
  const previousTotal = nextCursor.total || 0;
  let incremental = safeLines;

  if (previousTotal > 0 && total >= previousTotal) {
    const delta = total - previousTotal;
    if (delta <= 0) {
      incremental = [];
    } else if (delta < safeLines.length) {
      incremental = safeLines.slice(-delta);
    }
  }

  if (normalizedLiveLine && normalizedLiveLine !== nextCursor.liveLine) {
    if (!incremental.length || incremental[incremental.length - 1] !== normalizedLiveLine) {
      incremental = incremental.concat(normalizedLiveLine);
    }
  }

  return {
    incremental,
    cursor: { taskId, total, liveLine: normalizedLiveLine },
  };
}

/** Parse ANSI escape codes + keyword-based semantic coloring for log lines */
export function renderLogLines(lines) {
  return lines.map((rawLine) => {
    const line = String(rawLine ?? '').replace(/\r/g, '');
    const hasAnsi = line.indexOf('\x1b[') !== -1;

    if (hasAnsi) {
      return '<div class="log-line">' + renderAnsiLine(line) + '</div>';
    }

    let safe = escapeHtml(line);
    const color = getSemanticLogLineColor(line);
    if (color) safe = '<span style="color:' + color + ';">' + safe + '</span>';
    return '<div class="log-line">' + safe + '</div>';
  }).join('');
}

function renderAnsiLine(line) {
  let result = '';
  let index = 0;
  let openSpan = false;

  while (index < line.length) {
    if (line.charCodeAt(index) === 27 && line[index + 1] === '[') {
      let codeEnd = index + 2;
      while (codeEnd < line.length && line[codeEnd] !== 'm') codeEnd++;
      if (codeEnd < line.length) {
        const codes = line.substring(index + 2, codeEnd).split(';');
        if (openSpan) {
          result += '</span>';
          openSpan = false;
        }
        for (const code of codes) {
          if (code === '0' || code === '') {
            // reset
          } else if (code === '1') {
            result += '<span style="font-weight:700;">';
            openSpan = true;
          } else if (ANSI_COLORS[code]) {
            result += '<span style="color:' + ANSI_COLORS[code] + ';">';
            openSpan = true;
          }
        }
        index = codeEnd + 1;
        continue;
      }
    }

    result += escapeLogCharacter(line[index]);
    index += 1;
  }

  if (openSpan) result += '</span>';
  return result;
}

function escapeLogCharacter(char) {
  if (char === '<') return '&lt;';
  if (char === '>') return '&gt;';
  if (char === '&') return '&amp;';
  if (char === '"') return '&quot;';
  return char;
}

function getSemanticLogLineColor(line) {
  if (/\b(error|exception|traceback|failed|fatal|UnicodeDecodeError)\b/i.test(line)) return '#ef4444';
  if (/\b(warning|warn|deprecated)\b/i.test(line)) return '#f59e0b';
  if (/\b(saved|saving|checkpoint|completed|finished|done)\b/i.test(line)) return '#22c55e';
  if (/\bsteps?\b.*\bLoss\b|\bloss[=:]\s*/i.test(line)) return '#06b6d4';
  if (/epoch\s+\d|^\s*\d+%\|/i.test(line)) return '#60a5fa';
  if (/^(INFO|DEBUG)\b|\bINFO\b|\bDEBUG\b/i.test(line)) return '#64748b';
  return '';
}
