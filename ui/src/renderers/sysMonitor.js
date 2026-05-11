// renderers/sysMonitor.js — 系统资源监控面板 HTML 构造
// 依赖（工厂注入）：state、_ico

import { _ico } from '../utils/dom.js';

export function createSysMonitorRenderer({ state }) {
  function _buildSysMonitorHTML() {
    var d = state.sysMonitor;
    if (!d) return '<div style="color:var(--text-muted);font-size:0.72rem;">等待数据...</div>';
    var html = '';

    // GPU VRAM
    if (d.gpu && d.gpu.available && d.gpu.gpus && d.gpu.gpus.length > 0) {
      d.gpu.gpus.forEach(function(g) {
        var pct = g.utilization_pct || 0;
        var barColor = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : 'var(--accent)';
        var usedMB = g.used_mb || g.allocated_mb || 0;
        html += '<div class="sysmon-row">'
          + '<div class="sysmon-label">' + _ico('cpu', 12) + ' VRAM' + (d.gpu.gpus.length> 1 ? ' #' + g.index : '') + '</div>'
          + '<div class="sysmon-bar-wrap">'
          +   '<div class="sysmon-bar" style="width:' + pct + '%;background:' + barColor + ';"></div>'
          + '</div>'
          + '<div class="sysmon-val">' + usedMB + ' / ' + g.total_mb + ' MB <span style="opacity:0.7;">(' + pct + '%)</span></div>'
          + '</div>';
        // GPU temperature + power (if available from nvidia-smi)
        var extraParts = [];
        if (g.temperature_c != null) extraParts.push(g.temperature_c + '°C');
        if (g.power_draw_w != null) extraParts.push(g.power_draw_w + 'W');
        if (extraParts.length > 0) {
          html += '<div class="sysmon-row sysmon-sub">'
            + '<div class="sysmon-label" style="padding-left:18px;">状态</div>'
            + '<div></div>'
            + '<div class="sysmon-val">' + extraParts.join(' · ') + '</div>'
            + '</div>';
        }
      });
    } else {
      html += '<div class="sysmon-row"><div class="sysmon-label">' + _ico('cpu', 12) + ' VRAM</div><div class="sysmon-val" style="color:var(--text-muted);">不可用</div></div>';
    }

    // CPU
    if (d.cpu && d.cpu.percent !== undefined) {
      var cpuPct = d.cpu.percent;
      var cpuColor = cpuPct > 90 ? '#ef4444' : cpuPct > 70 ? '#f59e0b' : '#3b82f6';
      html += '<div class="sysmon-row">'
        + '<div class="sysmon-label">' + _ico('activity', 12) + ' CPU</div>'
        + '<div class="sysmon-bar-wrap">'
        +   '<div class="sysmon-bar" style="width:' + cpuPct + '%;background:' + cpuColor + ';"></div>'
        + '</div>'
        + '<div class="sysmon-val">' + cpuPct + '%' + (d.cpu.count ? ' <span style="opacity:0.5;">(' + d.cpu.count + ' cores)</span>' : '') + '</div>'
        + '</div>';
    }

    // RAM
    if (d.ram && d.ram.total_mb) {
      var ramPct = d.ram.percent || 0;
      var ramColor = ramPct > 90 ? '#ef4444' : ramPct > 70 ? '#f59e0b' : '#8b5cf6';
      var ramUsedGB = (d.ram.used_mb / 1024).toFixed(1);
      var ramTotalGB = (d.ram.total_mb / 1024).toFixed(1);
      html += '<div class="sysmon-row">'
        + '<div class="sysmon-label">' + _ico('database', 12) + ' RAM</div>'
        + '<div class="sysmon-bar-wrap">'
        +   '<div class="sysmon-bar" style="width:' + ramPct + '%;background:' + ramColor + ';"></div>'
        + '</div>'
        + '<div class="sysmon-val">' + ramUsedGB + ' / ' + ramTotalGB + ' GB <span style="opacity:0.7;">(' + ramPct + '%)</span></div>'
        + '</div>';
    }

    return html;
  }

  return { _buildSysMonitorHTML };
}
