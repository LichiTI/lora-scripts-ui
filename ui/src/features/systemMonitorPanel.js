import { icon as _ico } from '../utils/dom.js';

export function buildSysMonitorHTML(data) {
  if (!data) return '<div style="color:var(--text-muted);font-size:0.72rem;">等待数据...</div>';

  let html = '';

  if (data.gpu && data.gpu.available && data.gpu.gpus && data.gpu.gpus.length > 0) {
    data.gpu.gpus.forEach((gpu) => {
      const pct = gpu.utilization_pct || 0;
      const barColor = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : 'var(--accent)';
      const usedMB = gpu.used_mb || gpu.allocated_mb || 0;
      html += '<div class="sysmon-row">'
        + '<div class="sysmon-label">' + _ico('cpu', 12) + ' VRAM' + (data.gpu.gpus.length > 1 ? ' #' + gpu.index : '') + '</div>'
        + '<div class="sysmon-bar-wrap">'
        + '<div class="sysmon-bar" style="width:' + pct + '%;background:' + barColor + ';"></div>'
        + '</div>'
        + '<div class="sysmon-val">' + usedMB + ' / ' + gpu.total_mb + ' MB <span style="opacity:0.7;">(' + pct + '%)</span></div>'
        + '</div>';

      const extraParts = [];
      if (gpu.temperature_c != null) extraParts.push(gpu.temperature_c + '°C');
      if (gpu.power_draw_w != null) extraParts.push(gpu.power_draw_w + 'W');
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

  if (data.cpu && data.cpu.percent !== undefined) {
    const cpuPct = data.cpu.percent;
    const cpuColor = cpuPct > 90 ? '#ef4444' : cpuPct > 70 ? '#f59e0b' : '#3b82f6';
    html += '<div class="sysmon-row">'
      + '<div class="sysmon-label">' + _ico('activity', 12) + ' CPU</div>'
      + '<div class="sysmon-bar-wrap">'
      + '<div class="sysmon-bar" style="width:' + cpuPct + '%;background:' + cpuColor + ';"></div>'
      + '</div>'
      + '<div class="sysmon-val">' + cpuPct + '%' + (data.cpu.count ? ' <span style="opacity:0.5;">(' + data.cpu.count + ' cores)</span>' : '') + '</div>'
      + '</div>';
  }

  if (data.ram && data.ram.total_mb) {
    const ramPct = data.ram.percent || 0;
    const ramColor = ramPct > 90 ? '#ef4444' : ramPct > 70 ? '#f59e0b' : '#8b5cf6';
    const ramUsedGB = (data.ram.used_mb / 1024).toFixed(1);
    const ramTotalGB = (data.ram.total_mb / 1024).toFixed(1);
    html += '<div class="sysmon-row">'
      + '<div class="sysmon-label">' + _ico('database', 12) + ' RAM</div>'
      + '<div class="sysmon-bar-wrap">'
      + '<div class="sysmon-bar" style="width:' + ramPct + '%;background:' + ramColor + ';"></div>'
      + '</div>'
      + '<div class="sysmon-val">' + ramUsedGB + ' / ' + ramTotalGB + ' GB <span style="opacity:0.7;">(' + ramPct + '%)</span></div>'
      + '</div>';
  }

  return html;
}
