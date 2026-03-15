// ============================================================
// ProjectHUD — ticker.js
// Live activity ticker — animated scroll with real-time events
// Depends on: config.js, auth.js, ui.js
// Usage: Ticker.init('ticker-scroll', events)
// ============================================================

const Ticker = (() => {

  let animFrame = null;
  let pos = 0;
  let paused = false;

  function buildItems(events) {
    return events.map(e =>
      `<span style="display:inline-flex;align-items:center;gap:6px;padding:0 18px;
        font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--text2);">
        <span style="color:var(--text3);margin:0 4px;">·</span>
        <span style="color:var(--text0);font-weight:600;">${e.user}</span>
        <span style="color:var(--cyan);">${e.action}</span>
        <span>"${e.target}"</span>
        <span style="color:var(--text3);font-size:9px;">${e.time}</span>
      </span>`
    ).join('');
  }

  function init(scrollId, events) {
    const scroll = document.getElementById(scrollId);
    const wrap = scroll?.parentElement;
    if (!scroll || !wrap) return;

    // Duplicate content for seamless loop
    const html = buildItems([...events, ...events]);
    scroll.innerHTML = html;

    wrap.addEventListener('mouseenter', () => paused = true);
    wrap.addEventListener('mouseleave', () => paused = false);

    if (animFrame) cancelAnimationFrame(animFrame);
    pos = 0;

    function animate() {
      if (!paused) {
        pos -= 0.5;
        const half = scroll.scrollWidth / 2;
        if (Math.abs(pos) >= half) pos = 0;
        scroll.style.transform = `translateX(${pos}px)`;
      }
      animFrame = requestAnimationFrame(animate);
    }
    animFrame = requestAnimationFrame(animate);
  }

  // Default placeholder events — replaced by real audit_log data
  const DEFAULT_EVENTS = [
    { user: 'V. Staples', action: 'updated task status', target: 'Build #1: Materials Readiness', time: '2m ago' },
    { user: 'A. Smith',   action: 'completed task',      target: 'Isolation Cover: Issue PO for Materials', time: '18m ago' },
    { user: 'R. White',   action: 'updated task',        target: 'Quote Custom Parts → IN PROGRESS', time: '1h ago' },
    { user: 'V. Staples', action: 'reviewed milestone',  target: 'Design Review Complete & Approved', time: '2h ago' },
    { user: 'A. Smith',   action: 'completed task',      target: 'Tungsten Cables: Purchase Materials', time: '3h ago' },
    { user: 'R. White',   action: 'updated task',        target: 'Leak Seals: Purchase Materials', time: '4h ago' },
  ];

  return { init, DEFAULT_EVENTS };

})();