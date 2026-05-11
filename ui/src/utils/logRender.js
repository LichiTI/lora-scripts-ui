// 训练日志渲染：ANSI 颜色解析 + 关键字语义着色。
// 不依赖 state，调用者传入原始日志行数组即可。

import { escapeHtml } from './dom.js';

const ANSI_COLORS = {
  '30': '#666', '31': '#ef4444', '32': '#22c55e', '33': '#f59e0b',
  '34': '#3b82f6', '35': '#a855f7', '36': '#06b6d4', '37': '#e0e6ed',
  '90': '#64748b', '91': '#ff6b6b', '92': '#4ade80', '93': '#fbbf24',
  '94': '#60a5fa', '95': '#c084fc', '96': '#22d3ee', '97': '#f8fafc',
};

/**
 * 将多行日志渲染为带语义色的 HTML。
 * - 如果行中含 ANSI 转义序列，则解析 \x1b[Nm 处理颜色 / 加粗
 * - 否则按关键字语义着色（error/warn/saved/loss/epoch/info）
 * @param {string[]} lines
 * @returns {string} HTML 串
 */
export function renderLogLines(lines) {
  return lines.map(function (line) {
    line = line.replace(/\r/g, '');
    const hasAnsi = line.indexOf('\x1b[') !== -1;

    // --- ANSI 解析 ---
    if (hasAnsi) {
      let result = '';
      let i = 0;
      let openSpan = false;
      while (i < line.length) {
        if (line.charCodeAt(i) === 27 && line[i + 1] === '[') {
          let j = i + 2;
          while (j < line.length && line[j] !== 'm') j++;
          if (j < line.length) {
            const codes = line.substring(i + 2, j).split(';');
            if (openSpan) { result += '</span>'; openSpan = false; }
            for (let ci = 0; ci < codes.length; ci++) {
              const c = codes[ci];
              if (c === '0' || c === '') { /* reset */ }
              else if (c === '1') { result += '<span style="font-weight:700;">'; openSpan = true; }
              else if (ANSI_COLORS[c]) { result += '<span style="color:' + ANSI_COLORS[c] + ';">'; openSpan = true; }
            }
            i = j + 1; continue;
          }
        }
        const ch = line[i];
        if (ch === '<') result += '&lt;';
        else if (ch === '>') result += '&gt;';
        else if (ch === '&') result += '&amp;';
        else if (ch === '"') result += '&quot;';
        else result += ch;
        i++;
      }
      if (openSpan) result += '</span>';
      return '<div class="log-line">' + result + '</div>';
    }

    // --- 关键字语义着色 ---
    let safe = escapeHtml(line);
    let color = '';
    if (/\b(error|exception|traceback|failed|fatal|UnicodeDecodeError)\b/i.test(line)) color = '#ef4444';
    else if (/\b(warning|warn|deprecated)\b/i.test(line)) color = '#f59e0b';
    else if (/\b(saved|saving|checkpoint|completed|finished|done)\b/i.test(line)) color = '#22c55e';
    else if (/\bsteps?\b.*\bLoss\b|\bloss[=:]\s*/i.test(line)) color = '#06b6d4';
    else if (/epoch\s+\d|^\s*\d+%\|/i.test(line)) color = '#60a5fa';
    else if (/^(INFO|DEBUG)\b|\bINFO\b|\bDEBUG\b/i.test(line)) color = '#64748b';

    if (color) safe = '<span style="color:' + color + ';">' + safe + '</span>';
    return '<div class="log-line">' + safe + '</div>';
  }).join('');
}
