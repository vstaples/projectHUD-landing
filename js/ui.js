// ============================================================
// ProjectHUD — ui.js
// Shared UI helpers: formatters, badges, avatars, components
// Depends on: nothing (pure utility)
// ============================================================

const UI = (() => {

  // ── DATE & TIME ────────────────────────────────────────────
  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function fmtDateShort(d) {
    if (!d) return '—';
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function fmtDateTime(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function daysUntil(d) {
    return Math.ceil((new Date(d + 'T12:00:00') - Date.now()) / 86400000);
  }

  function daysSince(d) {
    return Math.floor((Date.now() - new Date(d)) / 86400000);
  }

  function timeAgo(d) {
    const mins = Math.floor((Date.now() - new Date(d)) / 60000);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7)   return `${days}d ago`;
    return fmtDateShort(d.split('T')[0]);
  }

  function dueDateLabel(dateStr) {
    const days = daysUntil(dateStr);
    if (days < 0)  return { text: `${Math.abs(days)}d LATE`, color: 'var(--red)' };
    if (days === 0) return { text: 'TODAY',                   color: 'var(--amber)' };
    if (days <= 3) return { text: fmtDateShort(dateStr),      color: 'var(--amber)' };
    return           { text: fmtDateShort(dateStr),           color: 'var(--text2)' };
  }

  // ── NUMBER FORMATTING ──────────────────────────────────────
  function pct(num, den) {
    if (!den) return 0;
    return Math.round((num / den) * 100);
  }

  function fmtCurrency(n) {
    if (n == null) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
  }

  function fmtHours(n) {
    if (n == null) return '—';
    return `${parseFloat(n).toFixed(1)}h`;
  }

  function fmtIndex(n) {
    if (n == null) return '—';
    const v = parseFloat(n).toFixed(2);
    return v;
  }

  function indexColor(val) {
    if (val == null) return 'var(--text2)';
    if (val >= 1.0)  return 'var(--green)';
    if (val >= 0.9)  return 'var(--amber)';
    return 'var(--red)';
  }

  // ── INITIALS ───────────────────────────────────────────────
  function initials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  // ── STATUS BADGE HTML ──────────────────────────────────────
  const STATUS_CONFIG = {
    // Project statuses
    active:      { label: 'ACTIVE',      color: 'var(--green)',  bg: 'rgba(0,229,160,0.07)',  border: 'rgba(0,229,160,0.35)' },
    planning:    { label: 'PLANNING',    color: 'var(--text2)',  bg: 'transparent',           border: 'var(--border)' },
    on_hold:     { label: 'ON HOLD',     color: 'var(--amber)',  bg: 'rgba(255,170,0,0.07)',  border: 'rgba(255,170,0,0.35)' },
    complete:    { label: 'COMPLETE',    color: 'var(--green)',  bg: 'rgba(0,229,160,0.07)',  border: 'rgba(0,229,160,0.35)' },
    cancelled:   { label: 'CANCELLED',  color: 'var(--text3)',  bg: 'transparent',           border: 'var(--border)' },
    at_risk:     { label: 'AT RISK',     color: 'var(--amber)',  bg: 'rgba(255,170,0,0.07)',  border: 'rgba(255,170,0,0.35)' },
    blocked:     { label: 'BLOCKED',     color: 'var(--red)',    bg: 'rgba(255,71,87,0.07)',  border: 'rgba(255,71,87,0.35)' },
    // Task statuses
    not_started: { label: 'NOT STARTED',color: 'var(--text3)',  bg: 'transparent',           border: 'var(--border)' },
    ready:       { label: 'READY',       color: 'var(--green)',  bg: 'rgba(0,229,160,0.07)',  border: 'rgba(0,229,160,0.35)' },
    in_progress: { label: 'IN PROGRESS',color: 'var(--cyan)',   bg: 'rgba(0,210,255,0.07)',  border: 'rgba(0,210,255,0.3)' },
    overdue:     { label: 'OVERDUE',     color: 'var(--amber)',  bg: 'rgba(255,170,0,0.07)',  border: 'rgba(255,170,0,0.35)' },
    // Priority
    critical:    { label: 'CRIT',        color: 'var(--red)',    bg: 'rgba(255,71,87,0.08)',  border: 'rgba(255,71,87,0.4)' },
    high:        { label: 'HIGH',        color: 'var(--amber)',  bg: 'rgba(255,170,0,0.08)',  border: 'rgba(255,170,0,0.4)' },
    medium:      { label: 'MED',         color: 'var(--cyan)',   bg: 'rgba(0,210,255,0.06)',  border: 'rgba(0,210,255,0.3)' },
    low:         { label: 'LOW',         color: 'var(--text2)',  bg: 'transparent',           border: 'var(--border)' },
    // RAG
    green:       { label: 'GREEN',       color: 'var(--green)',  bg: 'rgba(0,229,160,0.07)',  border: 'rgba(0,229,160,0.35)' },
    amber:       { label: 'AMBER',       color: 'var(--amber)',  bg: 'rgba(255,170,0,0.07)',  border: 'rgba(255,170,0,0.35)' },
    red:         { label: 'RED',         color: 'var(--red)',    bg: 'rgba(255,71,87,0.07)',  border: 'rgba(255,71,87,0.35)' },
  };

  function badge(status, customLabel) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.not_started;
    const label = customLabel || cfg.label;
    return `<span style="
      display:inline-flex;align-items:center;gap:4px;
      padding:2px 8px;
      font-family:'Share Tech Mono',monospace;
      font-size:9px;font-weight:700;letter-spacing:0.1em;
      color:${cfg.color};
      background:${cfg.bg};
      border:1px solid ${cfg.border};
      white-space:nowrap;
    "><span style="width:5px;height:5px;border-radius:50%;background:currentColor;flex-shrink:0;"></span>${label}</span>`;
  }

  function taskDot(status) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.not_started;
    return `<span style="width:7px;height:7px;border-radius:50%;background:${cfg.color};flex-shrink:0;display:inline-block;"></span>`;
  }

  // ── AVATAR HTML ────────────────────────────────────────────
  function avatar(user, size = 32) {
    const ini = initials(user?.name || '?');
    const src = user?.avatar_path;
    if (src) {
      return `<img src="${src}" style="width:${size}px;height:${size}px;object-fit:cover;border:1px solid rgba(0,210,255,0.3);" alt="${ini}" />`;
    }
    return `<div style="
      width:${size}px;height:${size}px;flex-shrink:0;
      background:#1a3a5a;
      border:1px solid rgba(0,210,255,0.3);
      display:flex;align-items:center;justify-content:center;
      font-family:'Rajdhani',sans-serif;
      font-size:${Math.round(size * 0.38)}px;font-weight:700;
      color:var(--cyan);
    ">${ini}</div>`;
  }

  // ── PROGRESS BAR HTML ──────────────────────────────────────
  function progressBar(pctVal, color) {
    const fillColor = color || (pctVal >= 100 ? 'var(--green)' : pctVal > 50 ? 'var(--cyan)' : 'var(--cyan)');
    return `<div style="height:3px;background:rgba(255,255,255,0.06);">
      <div style="height:100%;width:${pctVal}%;background:${fillColor};transition:width 0.8s ease;"></div>
    </div>`;
  }

  // ── GAUGE SVG ──────────────────────────────────────────────
  function gauge(value, max, color, label, displayVal, size = 56) {
    const r = size * 0.39;
    const circ = 2 * Math.PI * r;
    const ratio = Math.min(value / max, 1);
    const offset = circ * (1 - ratio);
    const cx = size / 2;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
      <div style="width:${size}px;height:${size}px;position:relative;">
        <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="transform:rotate(-90deg)">
          <circle fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="4" cx="${cx}" cy="${cx}" r="${r}"/>
          <circle fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"
            cx="${cx}" cy="${cx}" r="${r}"
            stroke-dasharray="${circ}"
            stroke-dashoffset="${offset}"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
          font-family:'Rajdhani',sans-serif;font-size:${Math.round(size*0.23)}px;font-weight:700;color:${color};"
        >${displayVal}</div>
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:8.5px;color:var(--text3);letter-spacing:0.12em;text-align:center;">${label}</div>
    </div>`;
  }

  // ── ALL CLEAR STATE ────────────────────────────────────────
  function allClear(message = 'ALL CLEAR', sub = '') {
    return `<div style="padding:28px 16px;text-align:center;">
      <div style="font-size:22px;color:var(--cyan);opacity:0.25;margin-bottom:6px;">◈</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--cyan);letter-spacing:0.2em;margin-bottom:4px;">◆ ${message}</div>
      ${sub ? `<div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--text3);letter-spacing:0.08em;">${sub}</div>` : ''}
    </div>`;
  }

  // ── LOADING STATE ──────────────────────────────────────────
  function loading(msg = 'LOADING...') {
    return `<div style="padding:24px 16px;text-align:center;font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--text3);letter-spacing:0.14em;">${msg}</div>`;
  }

  // ── PANEL HEADER HTML ──────────────────────────────────────
  function panelHeader(title, rightHTML = '') {
    return `<div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div style="font-family:'Share Tech Mono',monospace;font-size:10px;font-weight:600;color:var(--text2);letter-spacing:0.18em;display:flex;align-items:center;gap:8px;">
        <span style="display:inline-block;width:2px;height:12px;background:var(--cyan);flex-shrink:0;"></span>
        ${title}
      </div>
      ${rightHTML}
    </div>`;
  }

  return {
    fmtDate, fmtDateShort, fmtDateTime,
    daysUntil, daysSince, timeAgo, dueDateLabel,
    pct, fmtCurrency, fmtHours, fmtIndex, indexColor,
    initials, badge, taskDot, avatar,
    progressBar, gauge, allClear, loading, panelHeader,
    STATUS_CONFIG,
  };

})();