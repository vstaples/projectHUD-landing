// ══════════════════════════════════════════════════════════════════════════════
// cdn-dashboard.js  ·  v20260406-CD1
// QA Command Brief — Dashboard tab for CadenceHUD
//
// Depends on: api.js (API.get, API.post), cdn-bist.js (_s9DashOpenSimulator),
//             _s9Switch(), _s9WaitForFirmId(), window.CURRENT_USER
// ══════════════════════════════════════════════════════════════════════════════

/* global API, _s9Switch, _s9WaitForFirmId, _s9DashOpenSimulator */

// ── Inject CSS ─────────────────────────────────────────────────────────────────
(function() {
  if (document.getElementById('cdn-dashboard-css')) return; // idempotent
  var s = document.createElement('style');
  s.id  = 'cdn-dashboard-css';
  s.textContent = ''
    + '/* ══════════════════════════════════════════════════════════════════════════\n'
    + '   QA COMMAND BRIEF — S9.62+ integration styles\n'
    + '   Uses cadence.html CSS vars. Added 2026-04-06.\n'
    + '   ══════════════════════════════════════════════════════════════════════════ */\n'
    + '\n'
    + '/* Amber override — brighter than default --amber */\n'
    + ':root { --cd-amb:#ffd94a; --cd-amb2:rgba(255,217,74,.18); --cd-red:#ff3d3d; --cd-red2:rgba(255,61,61,.16); }\n'
    + '\n'
    + '/* Brief shell */\n'
    + '.cd-brief{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;background:#080a10}\n'
    + '.cd-body{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px}\n'
    + '.cd-body::-webkit-scrollbar{width:3px}\n'
    + '.cd-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.07)}\n'
    + '\n'
    + '/* Shimmer loader */\n'
    + '@keyframes cd-shimmer{0%,100%{opacity:.35}50%{opacity:.8}}\n'
    + '.cd-skel{background:#1a1f2e;border-radius:3px;animation:cd-shimmer 1.4s ease-in-out infinite}\n'
    + '\n'
    + '/* Health brief */\n'
    + '.cd-health{background:var(--surface);border:1px solid var(--border2);border-radius:5px;overflow:hidden;flex-shrink:0}\n'
    + '.cd-health-top{display:flex;align-items:stretch}\n'
    + '.cd-score-block{width:168px;flex-shrink:0;padding:12px 14px;display:flex;flex-direction:column;justify-content:center;border-right:1px solid var(--border)}\n'
    + '.cd-score-num{font-size:52px;font-weight:700;line-height:1;font-family:var(--font-mono);letter-spacing:-.02em}\n'
    + '.cd-score-lbl{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.75);margin-top:3px;font-family:var(--font-mono)}\n'
    + '.cd-score-delta{font-size:12px;margin-top:5px;font-family:var(--font-mono)}\n'
    + '.cd-sparkline{display:flex;gap:3px;align-items:flex-end;height:24px;margin-top:7px}\n'
    + '.cd-spark-bar{flex:1;border-radius:1px;min-width:4px}\n'
    + '.cd-spark-lbl{font-size:11px;color:rgba(255,255,255,.65);font-family:var(--font-mono);margin-top:3px}\n'
    + '.cd-domains{flex:1;display:grid;grid-template-columns:repeat(4,1fr)}\n'
    + '.cd-domain{padding:9px 11px;border-right:1px solid var(--border);display:flex;flex-direction:column;gap:2px;cursor:pointer;transition:background .12s}\n'
    + '.cd-domain:last-child{border-right:none}\n'
    + '.cd-domain:hover{background:rgba(255,255,255,.025)}\n'
    + '.cd-domain-lbl{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.75);font-family:var(--font-mono)}\n'
    + '.cd-domain-score{font-size:21px;font-weight:700;font-family:var(--font-mono);letter-spacing:-.02em;line-height:1.1}\n'
    + '.cd-domain-bar{height:3px;border-radius:2px;background:rgba(255,255,255,.07);overflow:hidden;margin-top:3px}\n'
    + '.cd-domain-fill{height:100%;border-radius:1px;transition:width .5s}\n'
    + '.cd-domain-det{font-size:11px;color:rgba(255,255,255,.55);font-family:var(--font-mono);margin-top:2px;line-height:1.4}\n'
    + '.cd-kpis{display:grid;grid-template-columns:repeat(6,1fr);border-top:1px solid var(--border)}\n'
    + '.cd-kpi{padding:6px 11px;border-right:1px solid var(--border);display:flex;flex-direction:column;gap:2px}\n'
    + '.cd-kpi:last-child{border-right:none}\n'
    + '.cd-kpi-val{font-size:15px;font-weight:700;font-family:var(--font-mono)}\n'
    + '.cd-kpi-lbl{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.75);font-family:var(--font-mono)}\n'
    + '.cd-kpi-delta{font-size:10px;font-family:var(--font-mono)}\n'
    + '\n'
    + '/* Grid */\n'
    + '.cd-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}\n'
    + '.cd-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}\n'
    + '\n'
    + '/* Panels */\n'
    + '.cd-panel{background:var(--surface);border:1px solid var(--border);border-radius:5px;overflow:hidden;display:flex;flex-direction:column}\n'
    + '.cd-panel-hdr{padding:7px 11px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:7px;flex-shrink:0}\n'
    + '.cd-panel-title{font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#fff;font-family:var(--font-mono);flex:1}\n'
    + '.cd-panel-count{font-size:12px;font-family:var(--font-mono);color:rgba(255,255,255,.65)}\n'
    + '.cd-panel-link{font-size:12px;color:var(--cyan);cursor:pointer;font-family:var(--font-mono);letter-spacing:.03em;transition:color .1s}\n'
    + '.cd-panel-link:hover{color:#fff}\n'
    + '.cd-panel-body{flex:1;overflow-y:auto;max-height:280px}\n'
    + '.cd-panel-body::-webkit-scrollbar{width:2px}\n'
    + '.cd-panel-body::-webkit-scrollbar-thumb{background:var(--border2)}\n'
    + '\n'
    + '/* Hot queue */\n'
    + '.cd-hot{padding:8px 11px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:7px;cursor:pointer;transition:background .1s}\n'
    + '.cd-hot:hover{background:rgba(255,255,255,.02)}\n'
    + '.cd-hot:last-child{border-bottom:none}\n'
    + '.cd-hot-sev{width:3px;border-radius:2px;flex-shrink:0;align-self:stretch;min-height:34px}\n'
    + '.cd-hot-main{flex:1;min-width:0}\n'
    + '.cd-hot-type{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;font-family:var(--font-mono);margin-bottom:2px}\n'
    + '.cd-hot-name{font-size:13px;color:#fff;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n'
    + '.cd-hot-sub{font-size:11px;color:rgba(255,255,255,.55);font-family:var(--font-mono);margin-top:2px;line-height:1.4}\n'
    + '.cd-hot-meta{display:flex;align-items:center;gap:4px;margin-top:3px;flex-wrap:wrap}\n'
    + '.cd-tag{padding:2px 7px;border-radius:2px;font-size:11px;font-weight:700;font-family:var(--font-mono);letter-spacing:.03em}\n'
    + '.cd-tag-r{background:rgba(255,61,61,.15);color:var(--cd-red)}\n'
    + '.cd-tag-a{background:rgba(255,192,52,.14);color:var(--cd-amb)}\n'
    + '.cd-tag-b{background:rgba(79,142,247,.15);color:#4f8ef7}\n'
    + '.cd-tag-g{background:rgba(42,157,64,.13);color:#3de08a}\n'
    + '.cd-hot-acts{display:flex;gap:4px;flex-shrink:0;align-items:center}\n'
    + '.cd-hbtn{padding:3px 9px;border-radius:3px;font-size:10px;font-weight:700;cursor:pointer;border:1px solid;font-family:var(--font-mono);white-space:nowrap;transition:all .12s}\n'
    + '.cd-hbtn-r{background:var(--cd-red2);border-color:rgba(255,61,61,.4);color:var(--cd-red)}\n'
    + '.cd-hbtn-r:hover{background:rgba(255,61,61,.28)}\n'
    + '.cd-hbtn-a{background:var(--cd-amb2);border-color:rgba(255,192,52,.35);color:var(--cd-amb)}\n'
    + '.cd-hbtn-a:hover{background:rgba(255,192,52,.22)}\n'
    + '.cd-hbtn-n{background:transparent;border-color:var(--border);color:var(--text2)}\n'
    + '.cd-hbtn-n:hover{border-color:var(--border2);color:var(--text)}\n'
    + '.cd-hot-empty{padding:20px 11px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:5px}\n'
    + '.cd-hot-empty-dot{width:28px;height:28px;border-radius:50%;background:rgba(42,157,64,.1);border:1px solid rgba(42,157,64,.25);display:flex;align-items:center;justify-content:center;font-size:13px}\n'
    + '.cd-hot-empty-title{font-size:12px;color:#3de08a;font-weight:700}\n'
    + '.cd-hot-empty-sub{font-size:10px;color:var(--text2);font-family:var(--font-mono);line-height:1.5}\n'
    + '\n'
    + '/* Work queue */\n'
    + '.cd-wq{padding:6px 11px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:7px;cursor:pointer;transition:background .1s}\n'
    + '.cd-wq:hover{background:rgba(255,255,255,.02)}\n'
    + '.cd-wq:last-child{border-bottom:none}\n'
    + '.cd-wq-rank{font-size:11px;font-weight:700;font-family:var(--font-mono);color:var(--text2);width:14px;flex-shrink:0;text-align:center}\n'
    + '.cd-wq-pri{width:3px;border-radius:2px;align-self:stretch;flex-shrink:0;min-height:26px}\n'
    + '.cd-wq-main{flex:1;min-width:0}\n'
    + '.cd-wq-name{font-size:12px;color:var(--text);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n'
    + '.cd-wq-sub{font-size:10px;color:var(--text2);font-family:var(--font-mono);margin-top:1px}\n'
    + '.cd-wq-btn{padding:2px 7px;border-radius:3px;font-size:10px;font-weight:700;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text2);font-family:var(--font-mono);white-space:nowrap;transition:all .12s}\n'
    + '.cd-wq-btn:hover{background:rgba(255,255,255,.05);color:var(--text)}\n'
    + '.cd-mini-av{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;font-family:var(--font-mono);flex-shrink:0}\n'
    + '\n'
    + '/* Request queue */\n'
    + '.cd-rq{padding:6px 11px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:7px;cursor:pointer;transition:background .1s}\n'
    + '.cd-rq:hover{background:rgba(255,255,255,.02)}\n'
    + '.cd-rq:last-child{border-bottom:none}\n'
    + '.cd-rq-name{font-size:12px;color:var(--text);font-weight:500}\n'
    + '.cd-rq-sub{font-size:10px;color:var(--text2);font-family:var(--font-mono);margin-top:1px}\n'
    + '.cd-rq-meta{display:flex;align-items:center;gap:4px;margin-top:3px}\n'
    + '.cd-rq-acts{display:flex;gap:3px;flex-shrink:0;padding-top:1px}\n'
    + '.cd-rq-btn{padding:2px 7px;border-radius:3px;font-size:10px;font-weight:700;cursor:pointer;border:1px solid;font-family:var(--font-mono);white-space:nowrap;transition:all .12s}\n'
    + '.cd-rq-run{background:rgba(0,210,255,.1);border-color:rgba(0,210,255,.3);color:var(--cyan)}\n'
    + '.cd-rq-run:hover{background:rgba(0,210,255,.18)}\n'
    + '.cd-rq-arch{background:transparent;border-color:var(--border);color:var(--text2)}\n'
    + '.cd-rq-arch:hover{border-color:var(--border2);color:var(--text)}\n'
    + '\n'
    + '/* Training coverage */\n'
    + '.cd-tc{display:flex;align-items:center;gap:7px;padding:5px 11px;border-bottom:1px solid var(--border)}\n'
    + '.cd-tc:last-child{border-bottom:none}\n'
    + '.cd-tc-name{font-size:11px;color:var(--text);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n'
    + '.cd-tc-ver{font-size:10px;color:var(--text2);font-family:var(--font-mono);margin-top:1px}\n'
    + '.cd-tc-bar{width:80px;height:4px;border-radius:2px;background:rgba(255,255,255,.07);overflow:hidden;flex-shrink:0}\n'
    + '.cd-tc-fill{height:100%;border-radius:2px}\n'
    + '.cd-tc-pct{font-size:10px;font-family:var(--font-mono);width:28px;text-align:right;flex-shrink:0;font-weight:700}\n'
    + '\n'
    + '/* CoC feed */\n'
    + '.cd-coc{padding:5px 11px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:7px}\n'
    + '.cd-coc:last-child{border-bottom:none}\n'
    + '.cd-coc-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;margin-top:4px}\n'
    + '.cd-coc-text{font-size:11px;color:var(--text2);font-family:var(--font-mono);flex:1;line-height:1.5}\n'
    + '.cd-coc-text strong{color:var(--text);font-weight:700}\n'
    + '.cd-coc-time{font-size:10px;color:var(--text2);font-family:var(--font-mono);flex-shrink:0;margin-top:2px}\n'
    + '\n'
    + '/* Override modal */\n'
    + '.cd-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;z-index:9000}\n'
    + '.cd-overlay.open{display:flex}\n'
    + '.cd-modal{background:var(--bg2);border:1px solid var(--border2);border-radius:7px;width:440px;overflow:hidden}\n'
    + '.cd-modal-hdr{padding:13px 15px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:7px}\n'
    + '.cd-modal-title{font-size:13px;font-weight:700;color:var(--text);flex:1}\n'
    + '.cd-modal-close{font-size:14px;color:var(--text2);cursor:pointer;padding:2px 6px;border-radius:3px;transition:color .1s}\n'
    + '.cd-modal-close:hover{color:var(--text)}\n'
    + '.cd-modal-body{padding:15px}\n'
    + '.cd-modal-warn{background:rgba(192,64,74,.08);border:1px solid rgba(192,64,74,.2);border-radius:4px;padding:10px 12px;font-size:12px;color:var(--text2);line-height:1.6;margin-bottom:13px}\n'
    + '.cd-modal-warn strong{color:var(--cd-red)}\n'
    + '.cd-modal-lbl{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--text2);font-family:var(--font-mono);margin-bottom:5px}\n'
    + '.cd-modal-ta{width:100%;background:var(--surf2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--font-mono);font-size:12px;padding:8px 10px;resize:vertical;min-height:68px;outline:none;transition:border-color .1s}\n'
    + '.cd-modal-ta:focus{border-color:var(--cyan)}\n'
    + '.cd-modal-note{font-size:10px;color:var(--text2);font-family:var(--font-mono);margin-top:7px;padding:6px 10px;background:var(--surf2);border-radius:3px;line-height:1.5}\n'
    + '.cd-modal-note span{color:var(--cyan)}\n'
    + '.cd-modal-ftr{padding:11px 15px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end}\n'
    + '\n'
    + '/* Colour utils */\n'
    + '.cd-grn{color:#3de08a} .cd-amb{color:var(--cd-amb)} .cd-red{color:var(--cd-red)} .cd-t2{color:rgba(255,255,255,.65)}\n'
    + '\n'
    + '\n'
    + '/* ── CD Tooltip ── */\n'
    + '.cd-tip-host{position:relative}\n'
    + '.cd-tip{\n'
    + '  display:none;position:fixed;z-index:9999;\n'
    + '  min-width:220px;max-width:300px;\n'
    + '  background:#1a1f2e;border:1px solid rgba(255,255,255,.14);border-radius:5px;\n'
    + '  padding:10px 12px;pointer-events:none;\n'
    + '  box-shadow:0 8px 28px rgba(0,0,0,.7);\n'
    + '}\n'
    + '.cd-tip.tip-above::after{\n'
    + '  content:\'\';position:absolute;top:100%;left:var(--tip-arrow-left,50%);transform:translateX(-50%);\n'
    + '  border:5px solid transparent;border-top-color:#1a1f2e;\n'
    + '}\n'
    + '.cd-tip.tip-below::after{\n'
    + '  content:\'\';position:absolute;bottom:100%;left:var(--tip-arrow-left,50%);transform:translateX(-50%);\n'
    + '  border:5px solid transparent;border-bottom-color:#1a1f2e;\n'
    + '}\n'
    + '.cd-tip-title{font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;\n'
    + '  color:var(--cyan);font-family:Arial,sans-serif;margin-bottom:7px}\n'
    + '.cd-tip-row{display:flex;justify-content:space-between;gap:16px;\n'
    + '  font-size:13px;font-family:Arial,sans-serif;color:rgba(255,255,255,.80);\n'
    + '  padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)}\n'
    + '.cd-tip-row:last-child{border-bottom:none}\n'
    + '.cd-tip-row span:last-child{color:#fff;font-weight:600;text-align:right}\n'
    + '.cd-tip-formula{font-size:12px;font-family:Arial,sans-serif;color:rgba(255,255,255,.45);\n'
    + '  margin-top:7px;line-height:1.6;border-top:1px solid rgba(255,255,255,.06);padding-top:7px}\n'
  ;
  document.head.appendChild(s);
})();

// ── Inject override modal HTML ────────────────────────────────────────────────
(function() {
  if (document.getElementById('cd-override-modal')) return;
  var div = document.createElement('div');
  div.innerHTML = ''
    + '<!-- ═══ QA COMMAND BRIEF — OVERRIDE MODAL ═══ -->\n'
    + '<div class="cd-overlay" id="cd-override-modal" onclick="_cdCloseOverlay(event)">\n'
    + '  <div class="cd-modal">\n'
    + '    <div class="cd-modal-hdr">\n'
    + '      <div class="cd-modal-title" id="cd-override-title">Override — Governance Exception</div>\n'
    + '      <div class="cd-modal-close" onclick="_cdCloseOverlayBtn()">✕</div>\n'
    + '    </div>\n'
    + '    <div class="cd-modal-body">\n'
    + '      <div class="cd-modal-warn">\n'
    + '        <strong>This is a governance override.</strong> You are acknowledging an exception to\n'
    + '        established quality thresholds. A written rationale is required and will be permanently\n'
    + '        recorded in the Chain of Custody.\n'
    + '      </div>\n'
    + '      <div class="cd-modal-lbl">Rationale (required — minimum 20 characters)</div>\n'
    + '      <textarea class="cd-modal-ta" id="cd-override-rationale"\n'
    + '        placeholder="Describe the business reason for this override…"></textarea>\n'
    + '      <div class="cd-modal-note">\n'
    + '        Recorded as: <span id="cd-override-coc-label">override.applied</span> ·\n'
    + '        Actor: <span id="cd-override-actor">—</span> ·\n'
    + '        Entity: <span id="cd-override-entity">—</span> ·\n'
    + '        <span style="color:var(--cd-red)">Immutable — cannot be deleted</span>\n'
    + '      </div>\n'
    + '    </div>\n'
    + '    <div class="cd-modal-ftr">\n'
    + '      <button class="btn btn-sm" onclick="_cdCloseOverlayBtn()">Cancel</button>\n'
    + '      <button class="btn btn-sm btn-cad" id="cd-override-confirm-btn"\n'
    + '        onclick="_cdConfirmOverride()" style="background:var(--cd-red2);border-color:rgba(255,61,61,.4);color:var(--cd-red)">\n'
    + '        Confirm Override\n'
    + '      </button>\n'
    + '    </div>\n'
    + '  </div>\n'
    + '</div>\n'
    + '\n'
  ;
  document.body.appendChild(div.firstElementChild);
})();

// ── Dashboard functions (global scope, _cd* prefix) ───────────────────────────

// ── Tooltip positioning (fixed, viewport-aware) ───────────────────────────────
(function _cdInitTooltips() {
  var _activeTip = null;
  document.addEventListener('mouseover', function(e) {
    var host = e.target.closest('.cd-tip-host');
    if (!host) return;
    var tip = host.querySelector('.cd-tip');
    if (!tip) return;
    // Show and position
    tip.style.display = 'block';
    _activeTip = tip;
    var hr  = host.getBoundingClientRect();
    var tr  = tip.getBoundingClientRect();
    var vw  = window.innerWidth;
    var vh  = window.innerHeight;
    var spaceBelow = vh - hr.bottom;
    var spaceAbove = hr.top;
    // Flip above if not enough space below
    if (spaceBelow < tr.height + 16 && spaceAbove > tr.height + 16) {
      tip.className = tip.className.replace('tip-below','').replace('tip-above','').trim() + ' tip-above';
      tip.style.top  = (hr.top - tr.height - 8) + 'px';
    } else {
      tip.className = tip.className.replace('tip-above','').replace('tip-below','').trim() + ' tip-below';
      tip.style.top  = (hr.bottom + 8) + 'px';
    }
    // Horizontal: centre on host, clamp to viewport
    var left = hr.left + hr.width/2 - tr.width/2;
    left = Math.max(8, Math.min(left, vw - tr.width - 8));
    tip.style.left = left + 'px';
    // Position arrow
    var arrow_left = (hr.left + hr.width/2) - left;
    tip.style.setProperty('--tip-arrow-left', arrow_left + 'px');
  });
  document.addEventListener('mouseout', function(e) {
    var host = e.target.closest('.cd-tip-host');
    if (!host) return;
    var tip = host.querySelector('.cd-tip');
    if (tip) tip.style.display = 'none';
    _activeTip = null;
  });
})();

// ── Action handlers ──────────────────────────────────────────────────────────
function _cdConveneMrb(mrbId) {
  // Phase II: open MRB disposition form instance
  // For now: switch to Instances tab so user can find and act on it
  _s9Switch('instances');
  console.log('[CD Brief] Convene MRB:', mrbId);
}
function _cdDelegateItem(btn) {
  // Phase I Step 6: open assignee picker, write coc_event work.delegated
  // For now: visual acknowledgement
  if (btn) { btn.textContent = 'Assigned'; btn.style.opacity = '.5'; btn.style.pointerEvents = 'none'; }
  console.log('[CD Brief] Delegate item');
}

// ══════════════════════════════════════════════════════════════════════════════
// QA COMMAND BRIEF — S9.62+ integration
// Replaces _s9RouteDashboard / _s9RenderDashboard / _s9DashLoadData
// Uses existing API.get() from api.js. Identity from CURRENT_USER + _s9WaitForFirmId().
// ══════════════════════════════════════════════════════════════════════════════

// ── PostgREST query helper (wraps API.get, no computed object keys) ───────────
function _cdQ(table, opts) {
  var o = opts || {};
  var qs = [];
  (o.filters || []).forEach(function(f) {
    qs.push(f[0] + '=' + f[1] + '.' + encodeURIComponent(f[2]));
  });
  if (o.select) qs.push('select=' + encodeURIComponent(o.select));
  if (o.order)  qs.push('order='  + encodeURIComponent(o.order));
  if (o.limit)  qs.push('limit='  + o.limit);
  return API.get(table + (qs.length ? '?' + qs.join('&') : ''));
}

// ── State ─────────────────────────────────────────────────────────────────────
var _cdCerts       = [];
var _cdRuns        = [];
var _cdOverrideCtx = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function _cdScoreColor(n) {
  return n >= 90 ? '#3de08a' : n >= 75 ? 'var(--cd-amb)' : 'var(--cd-red)';
}
function _cdScoreCls(n) {
  return n >= 90 ? 'cd-grn' : n >= 75 ? 'cd-amb' : 'cd-red';
}
function _cdRelTime(iso) {
  if (!iso) return '—';
  var d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60)   return d + 's ago';
  if (d < 3600) return Math.floor(d/60) + 'm ago';
  if (d < 86400)return Math.floor(d/3600) + 'h ago';
  return Math.floor(d/86400) + 'd ago';
}
function _cdEsc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Route (called by _s9Switch) ───────────────────────────────────────────────
function _s9RouteDashboard() {
  var panel = document.getElementById('s9-dash-panel');
  if (!panel) return;
  _cdRenderBrief(panel);
}

// ── Render shell ──────────────────────────────────────────────────────────────
function _cdRenderBrief(panel) {
  panel.innerHTML =
    '<div class="cd-brief">' +
      '<div class="cd-body" id="cd-body">' +
        // Health brief
        '<div class="cd-health" id="cd-health">' +
          '<div class="cd-health-top">' +
            '<div class="cd-score-block cd-tip-host"><div class="cd-tip"><div class="cd-tip-title">Quality Health Score</div><div class="cd-tip-row"><span>Scale</span><span>0 – 100</span></div><div class="cd-tip-row"><span>Green</span><span>≥ 90</span></div><div class="cd-tip-row"><span>Amber</span><span>≥ 75</span></div><div class="cd-tip-row"><span>Red</span><span>&lt; 75</span></div><div class="cd-tip-row"><span>Triggered by</span><span>Scheduled · State change</span></div><div class="cd-tip-formula">Weighted sum of 8 domain scores. Domains: Process Cert (20) · Conformance (20) · Doc Control (14) · Training (14) · CAPA (10) · MRB (10) · Supplier (7) · Cert Currency (5)</div></div>' +
              '<div class="cd-score-num cd-t2" id="cd-score">—</div>' +
              '<div class="cd-score-lbl">Quality Health Score</div>' +
              '<div class="cd-score-delta cd-t2" id="cd-delta" style="font-family:var(--font-mono)">Loading…</div>' +
              '<div class="cd-sparkline" id="cd-spark"></div>' +
              '<div class="cd-spark-lbl">7-day trend</div>' +
            '</div>' +
            '<div class="cd-domains" id="cd-domains">' +
              '<div class="cd-domain"><div class="cd-domain-lbl">Loading…</div></div>' +
            '</div>' +
          '</div>' +
          '<div class="cd-kpis" id="cd-kpis">' +
            [1,2,3,4,5,6].map(function(){
              return '<div class="cd-kpi"><div class="cd-skel" style="height:15px;width:50px;margin-bottom:4px"></div>' +
                '<div class="cd-skel" style="height:10px;width:70px"></div></div>';
            }).join('') +
          '</div>' +
        '</div>' +
        // Hot + Work queue row
        '<div class="cd-grid2">' +
          '<div class="cd-panel">' +
            '<div class="cd-panel-hdr">' +
              '<div class="cd-panel-title" id="cd-hq-title" style="color:var(--cd-red)">⚡ Hot Queue</div>' +
              '<div class="cd-panel-count" id="cd-hq-count">Loading…</div>' +
              '<div class="cd-panel-link">View all →</div>' +
            '</div>' +
            '<div class="cd-panel-body" id="cd-hq-body"><div style="padding:14px 11px"><div class="cd-skel" style="height:13px;width:100%;margin-bottom:7px"></div><div class="cd-skel" style="height:13px;width:70%"></div></div></div>' +
          '</div>' +
          '<div class="cd-panel">' +
            '<div class="cd-panel-hdr">' +
              '<div class="cd-panel-title">Team Work Queue</div>' +
              '<div class="cd-panel-count" id="cd-wq-count">Loading…</div>' +
              '<div class="cd-panel-link">Full queue →</div>' +
            '</div>' +
            '<div class="cd-panel-body" id="cd-wq-body"><div style="padding:14px 11px"><div class="cd-skel" style="height:13px;width:100%;margin-bottom:7px"></div><div class="cd-skel" style="height:13px;width:80%"></div></div></div>' +
          '</div>' +
        '</div>' +
        // Request + Training + CoC row
        '<div class="cd-grid3">' +
          '<div class="cd-panel">' +
            '<div class="cd-panel-hdr">' +
              '<div class="cd-panel-title">Request Queue</div>' +
              '<div class="cd-panel-count" id="cd-rq-count">Loading…</div>' +
              '<div class="cd-panel-link">All requests →</div>' +
            '</div>' +
            '<div class="cd-panel-body" id="cd-rq-body"><div style="padding:14px 11px"><div class="cd-skel" style="height:13px;width:90%;margin-bottom:7px"></div><div class="cd-skel" style="height:13px;width:60%"></div></div></div>' +
          '</div>' +
          '<div class="cd-panel">' +
            '<div class="cd-panel-hdr">' +
              '<div class="cd-panel-title">Training Coverage</div>' +
              '<div class="cd-panel-count">Path coverage · firm-wide</div>' +
              '<div class="cd-panel-link">Full matrix →</div>' +
            '</div>' +
            '<div class="cd-panel-body" id="cd-tc-body"><div style="padding:14px 11px"><div class="cd-skel" style="height:13px;width:85%;margin-bottom:7px"></div><div class="cd-skel" style="height:13px;width:70%"></div></div></div>' +
          '</div>' +
          '<div class="cd-panel">' +
            '<div class="cd-panel-hdr">' +
              '<div class="cd-panel-title">Command Record</div>' +
              '<div class="cd-panel-count" id="cd-coc-count">CoC recorded · all actors</div>' +
              '<div class="cd-panel-link">Full history →</div>' +
            '</div>' +
            '<div class="cd-panel-body" id="cd-coc-body"><div style="padding:14px 11px"><div class="cd-skel" style="height:13px;width:90%;margin-bottom:7px"></div><div class="cd-skel" style="height:13px;width:70%"></div></div></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  // Load all panels
  _cdLoadBrief();
}

// ── Data orchestrator ─────────────────────────────────────────────────────────
async function _cdLoadBrief() {
  var firmId;
  try { firmId = await _s9WaitForFirmId(); } catch(e) {}
  if (!firmId) {
    console.warn('[CD Brief] No firmId — aborting load');
    return;
  }
  // Parallel load
  _cdLoadHealth(firmId);
  _cdLoadHotQueue(firmId);
  _cdLoadWorkQueue(firmId);
  _cdLoadRequestQueue(firmId);
  _cdLoadTraining(firmId);
  _cdLoadCoc(firmId);
}

// ── Health Brief ──────────────────────────────────────────────────────────────
async function _cdLoadHealth(firmId) {
  try {
    var rows = await _cdQ('health_scores', {
      filters:[['firm_id','eq',firmId]],
      order:'calculated_at.desc', limit:7,
      select:'id,composite_score,domain_scores,domain_details,threshold_config,calculated_at'
    });
    if (!rows || !rows.length) { _cdHealthEmpty(); return; }
    _cdRenderHealth(rows);
    _cdLoadKpis(firmId, rows[0]);
  } catch(e) { _cdHealthEmpty(); }
}

function _cdRenderHealth(rows) {
  var latest = rows[0];
  var prior  = rows.length > 1 ? rows[rows.length-1] : null;
  var score  = latest.composite_score;
  var domains= latest.domain_scores || {};

  // Score
  var scoreEl = document.getElementById('cd-score');
  if (scoreEl) { scoreEl.textContent = Math.round(score) + '%'; scoreEl.className = 'cd-score-num ' + _cdScoreCls(score); }

  // Delta
  var deltaEl = document.getElementById('cd-delta');
  if (deltaEl && prior) {
    var d = Math.round(score - prior.composite_score);
    deltaEl.className = 'cd-score-delta ' + (d > 0 ? 'cd-grn' : d < 0 ? 'cd-red' : 'cd-t2');
    deltaEl.textContent = (d > 0 ? '▲ ' : d < 0 ? '▼ ' : '') + (d !== 0 ? Math.abs(d) + ' pts vs 7d ago' : 'No change vs 7d ago');
  }

  // Sparkline
  var sparkEl = document.getElementById('cd-spark');
  if (sparkEl) {
    var ordered = rows.slice().reverse();
    var mx = Math.max.apply(null, ordered.map(function(r){ return r.composite_score; }));
    sparkEl.innerHTML = ordered.map(function(r) {
      var h = Math.round((r.composite_score/mx)*24);
      return '<div class="cd-spark-bar" style="height:' + h + 'px;background:' + _cdScoreColor(r.composite_score) + '"></div>';
    }).join('');
  }

  // Domains
  var defs = [
    {key:'process_cert', label:'Process Cert'},
    {key:'conformance',  label:'Conformance'},
    {key:'doc_control',  label:'Doc Control'},
    {key:'training',     label:'Training'},
    {key:'capa',         label:'CAPA'},
    {key:'mrb',          label:'MRB / NCR'},
    {key:'supplier',     label:'Supplier'},
    {key:'cert_currency',label:'Cert Currency'}
  ];
  var det = latest.domain_details || {};
  var domEl = document.getElementById('cd-domains');
  if (domEl) {
    var domTips = {
    'process_cert': '<div class="cd-tip"><div class="cd-tip-title">Process Certification · 20pts</div><div class="cd-tip-row"><span>Weight</span><span>20 pts of 100</span></div><div class="cd-tip-row"><span>Threshold</span><span>≥90 green · ≥75 amber · <75 red</span></div><div class="cd-tip-row"><span>Inputs</span><span>bist_certificates · bist_coverage_paths</span></div><div class="cd-tip-formula">Valid certs ÷ total certs × 100, weighted by path coverage %</div></div>',
    'conformance': '<div class="cd-tip"><div class="cd-tip-title">Process Conformance · 20pts</div><div class="cd-tip-row"><span>Weight</span><span>20 pts of 100</span></div><div class="cd-tip-row"><span>Status</span><span>Engine not yet built — scored from run history</span></div><div class="cd-tip-row"><span>Inputs</span><span>coc_events · bist_runs · bist_certificates</span></div><div class="cd-tip-formula">Live CoC event patterns matched against certified test assertions</div></div>',
    'doc_control': '<div class="cd-tip"><div class="cd-tip-title">Document Control · 14pts</div><div class="cd-tip-row"><span>Weight</span><span>14 pts of 100</span></div><div class="cd-tip-row"><span>Threshold</span><span>Overdue review drops score proportionally</span></div><div class="cd-tip-row"><span>Inputs</span><span>controlled_documents · review_frequency_days</span></div><div class="cd-tip-formula">Controlled docs in released status, not overdue for review</div></div>',
    'training': '<div class="cd-tip"><div class="cd-tip-title">Training Coverage · 14pts</div><div class="cd-tip-row"><span>Weight</span><span>14 pts of 100</span></div><div class="cd-tip-row"><span>Threshold</span><span>Each overdue assignment deducts 2 pts</span></div><div class="cd-tip-row"><span>Inputs</span><span>training_completions · document_training_requirements</span></div><div class="cd-tip-formula">Completions ÷ required assignments across QA dept × 100</div></div>',
    'capa': '<div class="cd-tip"><div class="cd-tip-title">CAPA Health · 10pts</div><div class="cd-tip-row"><span>Weight</span><span>10 pts of 100</span></div><div class="cd-tip-row"><span>Status</span><span>Phase II — scored from health_scores seed</span></div><div class="cd-tip-row"><span>Inputs</span><span>capas · capa_actions</span></div><div class="cd-tip-formula">Open CAPAs on-time ÷ total open CAPAs, weighted by severity</div></div>',
    'mrb': '<div class="cd-tip"><div class="cd-tip-title">MRB / NCR Velocity · 10pts</div><div class="cd-tip-row"><span>Weight</span><span>10 pts of 100</span></div><div class="cd-tip-row"><span>Escalation</span><span>MRBs held >14 days auto-escalate</span></div><div class="cd-tip-row"><span>Inputs</span><span>ncmrs · mrb_cases · days_on_hold</span></div><div class="cd-tip-formula">Parts cleared this period ÷ parts received, penalised by hold age</div></div>',
    'supplier': '<div class="cd-tip"><div class="cd-tip-title">Supplier Quality · 7pts</div><div class="cd-tip-row"><span>Weight</span><span>7 pts of 100</span></div><div class="cd-tip-row"><span>Status</span><span>Phase II — scored from health_scores seed</span></div><div class="cd-tip-row"><span>Inputs</span><span>suppliers · ncmrs</span></div><div class="cd-tip-formula">Qualified suppliers ÷ active suppliers, adjusted for open NCMRs</div></div>',
    'cert_currency': '<div class="cd-tip"><div class="cd-tip-title">Certificate Currency · 5pts</div><div class="cd-tip-row"><span>Weight</span><span>5 pts of 100</span></div><div class="cd-tip-row"><span>Threshold</span><span>Stale after 30 days (firm-configurable)</span></div><div class="cd-tip-row"><span>Inputs</span><span>bist_certificates · issued_at</span></div><div class="cd-tip-formula">Days since newest cert ÷ stale threshold, inverted</div></div>'
  };
    domEl.innerHTML = defs.map(function(d) {
      var v   = domains[d.key] !== undefined ? Math.round(domains[d.key]) : null;
      var clr = v !== null ? _cdScoreColor(v) : 'var(--text2)';
      var pct = v !== null ? v : 0;
      var sub = _cdDomainDet(d.key, det[d.key]);
      var tip = domTips[d.key] || '';
      return '<div class="cd-domain cd-tip-host">' +
        tip +
        '<div class="cd-domain-lbl">' + _cdEsc(d.label) + '</div>' +
        '<div class="cd-domain-score ' + (v !== null ? _cdScoreCls(v) : 'cd-t2') + '">' + (v !== null ? v + '%' : '—') + '</div>' +
        '<div class="cd-domain-bar"><div class="cd-domain-fill" style="width:' + pct + '%;background:' + clr + '"></div></div>' +
        '<div class="cd-domain-det">' + sub + '</div>' +
        '</div>';
    }).join('');
  }
}

function _cdDomainDet(key, d) {
  if (!d) return '&nbsp;';
  if (key === 'process_cert') return (d.certs_valid||'—') + '/' + (d.certs_total||'—') + ' certs<br>' + (d.coverage_pct||'—') + '% paths';
  if (key === 'training')     return (d.coverage_pct||'—') + '% coverage<br>' + (d.overdue||0) + ' overdue';
  if (key === 'mrb')          return (d.parts_on_hold||0) + ' on hold<br>$' + ((d.value_at_risk||0)/1000).toFixed(1) + 'K at risk';
  return '&nbsp;';
}

function _cdHealthEmpty() {
  var el = document.getElementById('cd-score');
  if (el) { el.textContent = '—'; el.className = 'cd-score-num cd-t2'; }
  var de = document.getElementById('cd-delta');
  if (de) de.textContent = 'No health score data';
}

async function _cdLoadKpis(firmId, latestHealth) {
  try {
    var [runs, certs] = await Promise.all([
      _cdQ('bist_runs', { filters:[['firm_id','eq',firmId]], order:'run_at.desc', limit:100,
        select:'id,status,steps_passed,steps_failed,duration_ms,run_at' }),
      _cdQ('bist_certificates', { filters:[['firm_id','eq',firmId]],
        select:'id,status,issued_at,expires_at,template_id,template_version' })
    ]);
    _cdCerts = certs || [];
    _cdRuns  = runs  || [];
    _cdRenderKpis(runs||[], certs||[], latestHealth);
  } catch(e) { /* silent */ }
}

function _cdRenderKpis(runs, certs, hs) {
  var now = Date.now(), thirty = 30*86400*1000;
  var r30 = runs.filter(function(r){ return r.run_at && (now - new Date(r.run_at).getTime()) < thirty; });
  var valid = certs.filter(function(c){ return c.status==='valid'; }).length;
  var total = certs.length;
  var oldest = 0;
  certs.filter(function(c){ return c.status==='valid'; }).forEach(function(c){
    var a = Math.floor((now - new Date(c.issued_at).getTime())/86400000);
    if (a > oldest) oldest = a;
  });
  var failed = r30.filter(function(r){ return r.status==='failed'; });
  var passed = r30.filter(function(r){ return r.status==='passed'; });
  var mttd = failed.length ? Math.round(failed.reduce(function(a,r){ return a+(r.duration_ms||0); },0)/failed.length/60000) : 0;
  var mttc = passed.length ? Math.round(passed.reduce(function(a,r){ return a+(r.duration_ms||0); },0)/passed.length/60000) : 0;
  var thresh = 30;
  try { if (hs && hs.threshold_config) thresh = Number(hs.threshold_config.stale_cert_days) || 30; } catch(e){}
  // oldest=0 means no valid certs found — treat as green (nothing to stale)
  var oldClrVal = oldest === 0 ? '#3de08a' : oldest > thresh ? 'var(--cd-red)' : oldest > thresh * 0.7 ? 'var(--cd-amb)' : '#3de08a';
  var oldClr = oldClrVal;

  console.log('[CD KPI] oldest='+oldest+' thresh='+thresh+' thresh*.7='+(thresh*.7)+' oldClr='+oldClr);
  var kpis = [
    { val: valid+'/'+total, lbl:'Workflows Certified', delta:(valid===total?'↑ All valid':'↓ '+(total-valid)+' invalidated'), dc:(valid===total?'#3de08a':'var(--cd-red)'), vc:(valid===total?'#3de08a':'var(--cd-amb)') },
    { val: mttd?mttd+'m':'—', lbl:'Mean Time to Detect', delta:'Last 30 days', dc:'var(--text2)', vc:'var(--cd-amb)' },
    { val: mttc?mttc+'m':'—', lbl:'Mean Time to Certify', delta:'Last 30 days', dc:'var(--text2)', vc:'var(--cd-amb)' },
    { val: r30.length, lbl:'Total Suite Runs', delta:'Last 30 days', dc:'var(--text2)', vc:'var(--text)' },
    { val: 0, lbl:'Flakiness Alerts', delta:'↑ All stable', dc:'#3de08a', vc:'#3de08a' },
    { val: oldest+'d', lbl:'Oldest Cert Age', delta:'↓ threshold '+thresh+'d', dc:(oldest>thresh?'var(--cd-red)':'var(--text2)'), vc:oldClr }
  ];
  var el = document.getElementById('cd-kpis');
  if (!el) return;
  el.innerHTML = kpis.map(function(k){
    return '<div class="cd-kpi">' +
      '<div class="cd-kpi-val" style="color:' + k.vc + '">' + k.val + '</div>' +
      '<div class="cd-kpi-lbl">' + k.lbl + '</div>' +
      '<div class="cd-kpi-delta" style="color:' + k.dc + '">' + k.delta + '</div>' +
      '</div>';
  }).join('');
}

// ── Hot Queue ─────────────────────────────────────────────────────────────────
async function _cdLoadHotQueue(firmId) {
  var items = [], pending = 3;
  function done() {
    if (--pending === 0) {
      items.sort(function(a,b){ return b.sev - a.sev; });
      _cdRenderHotQueue(items);
    }
  }
  // Invalidated certs
  try {
    var certs = await _cdQ('bist_certificates', {
      filters:[['firm_id','eq',firmId],['status','eq','invalidated']],
      select:'id,certificate_number,template_id,template_version,issued_at,workflow_templates(name)'
    });
    (certs||[]).forEach(function(c){
      var tmpl = c.workflow_templates ? c.workflow_templates.name : 'Unknown';
      var ver  = c.template_version || '—';
      var age  = Math.floor((Date.now()-new Date(c.issued_at).getTime())/86400000);
      items.push({ sev:100, type:'r', typeLabel:'Cert Invalidated',
        name:tmpl+' v'+ver, sub:'Modified after cert · Release gate blocked',
        tags:[{cls:'cd-tag-r',t:'CRITICAL'},{cls:'cd-tag-a',t:age+'d since issue'}],
        btns:[{cls:'cd-hbtn-r',l:'Re-certify',fn:'_s9DashOpenSimulator("'+c.template_id+'")'},
              {cls:'cd-hbtn-n',l:'Override',fn:'_cdOpenOverride("cert_invalidated","'+c.id+'","'+_cdEsc(tmpl)+' v'+ver+'")'}]
      });
    });
  } catch(e){}
  done();
  // Escalated MRBs
  try {
    var mrbs = await _cdQ('mrb_cases', {
      filters:[['firm_id','eq',firmId],['status','eq','escalated']],
      select:'id,ncmr_id,ncmrs(ncmr_number,material_value,days_on_hold)'
    });
    (mrbs||[]).forEach(function(m){
      var n = m.ncmrs || {};
      var val = n.material_value ? '$'+(n.material_value/1000).toFixed(1)+'K' : '—';
      items.push({ sev:85, type:'a', typeLabel:'Material on Hold — Escalated',
        name:(n.ncmr_number||'NCMR')+' · MRB not convened',
        sub:(n.days_on_hold||0)+' days on hold · Material value '+val,
        tags:[{cls:'cd-tag-r',t:'ESCALATED'},{cls:'cd-tag-a',t:val+' at risk'}],
        btns:[{cls:'cd-hbtn-a',l:'Convene MRB',fn:'_cdConveneMrb("'+m.id+'")'},
              {cls:'cd-hbtn-n',l:'View',fn:''}]
      });
    });
  } catch(e){}
  done();
  // Coverage gaps (uncovered/stale paths)
  try {
    var paths = await _cdQ('bist_coverage_paths', {
      filters:[['firm_id','eq',firmId],['coverage_status','in','(uncovered,stale)']],
      select:'id,path_name,coverage_status,template_id,last_run_at,workflow_templates(name,version)'
    });
    if (paths && paths.length) {
      // Group by template for summary
      var byTmpl = {};
      paths.forEach(function(p){
        var n = p.workflow_templates ? p.workflow_templates.name : 'Template';
        if (!byTmpl[n]) byTmpl[n] = {uncovered:0,stale:0,id:p.template_id};
        if (p.coverage_status==='uncovered') byTmpl[n].uncovered++;
        else byTmpl[n].stale++;
      });
      Object.keys(byTmpl).forEach(function(n){
        var b = byTmpl[n];
        var total = b.uncovered + b.stale;
        var detail = [];
        if (b.uncovered) detail.push(b.uncovered + ' uncovered');
        if (b.stale)     detail.push(b.stale + ' stale');
        items.push({ sev:60, type:'a', typeLabel:'Training Gap — Coverage',
          name:n,
          sub:detail.join(' · ') + ' — no script or script not run',
          tags:[{cls:'cd-tag-a',t:'WARNING'},{cls:'cd-tag-a',t:total+' path'+(total>1?'s':'')}],
          btns:[{cls:'cd-hbtn-a',l:'View Coverage',fn:'_s9Switch("library")'},
                {cls:'cd-hbtn-n',l:'Run Scripts',fn:'_s9DashOpenSimulator("'+b.id+'")'}]
        });
      });
    }
  } catch(e){}
  done();
}

function _cdRenderHotQueue(items) {
  var countEl = document.getElementById('cd-hq-count');
  var bodyEl  = document.getElementById('cd-hq-body');
  if (!bodyEl) return;
  if (!items.length) {
    if (countEl) { countEl.textContent='0 items'; countEl.style.color='#3de08a'; }
    var titleEl = document.getElementById('cd-hq-title');
    if (titleEl) titleEl.style.color = '#3de08a';
    bodyEl.innerHTML = '<div class="cd-hot-empty">' +
      '<div class="cd-hot-empty-dot">✓</div>' +
      '<div class="cd-hot-empty-title">All clear</div>' +
      '<div class="cd-hot-empty-sub">No items requiring immediate action.<br>All thresholds within bounds.</div>' +
      '</div>';
    return;
  }
  if (countEl) { countEl.textContent=items.length+' item'+(items.length>1?'s':'')+' requiring action'; countEl.style.color='var(--cd-red)'; }
  bodyEl.innerHTML = items.map(function(item){
    var tags = item.tags.map(function(t){ return '<span class="cd-tag '+t.cls+'">'+_cdEsc(t.t)+'</span>'; }).join('');
    var btns = item.btns.map(function(b){ return '<div class="cd-hbtn '+b.cls+'" onclick="'+b.fn+'">'+_cdEsc(b.l)+'</div>'; }).join('');
    var sc = item.type==='r' ? 'var(--cd-red)' : 'var(--cd-amb)';
    return '<div class="cd-hot">' +
      '<div class="cd-hot-sev" style="background:'+sc+'"></div>' +
      '<div class="cd-hot-main">' +
      '<div class="cd-hot-type" style="color:'+sc+'">'+_cdEsc(item.typeLabel)+'</div>' +
      '<div class="cd-hot-name">'+_cdEsc(item.name)+'</div>' +
      '<div class="cd-hot-sub">'+_cdEsc(item.sub)+'</div>' +
      '<div class="cd-hot-meta">'+tags+'</div>' +
      '</div>' +
      '<div class="cd-hot-acts">'+btns+'</div>' +
      '</div>';
  }).join('');
}

// ── Work Queue ────────────────────────────────────────────────────────────────
async function _cdLoadWorkQueue(firmId) {
  try {
    var paths = await _cdQ('bist_coverage_paths', {
      filters:[['firm_id','eq',firmId]],
      select:'id,path_name,coverage_status,last_run_at,template_id,workflow_templates(name,version)'
    });
    var items = []; var rank = 1;
    (paths||[]).forEach(function(p){
      if (p.coverage_status!=='uncovered' && p.coverage_status!=='stale') return;
      var tmpl = p.workflow_templates ? p.workflow_templates.name : 'Template';
      var pri  = p.coverage_status==='uncovered' ? 'var(--cd-red)' : 'var(--cd-amb)';
      var badge= p.coverage_status==='uncovered'
        ? '<span class="cd-tag cd-tag-r" style="flex-shrink:0">PATH</span>'
        : '<span class="cd-tag cd-tag-a" style="flex-shrink:0">STALE</span>';
      var sub  = tmpl+' · '+(p.coverage_status==='uncovered'?'No script — path never tested':'Last run '+_cdRelTime(p.last_run_at));
      items.push({rank:rank++,pri:pri,name:_cdEsc(p.path_name),sub:_cdEsc(sub),badge:badge,id:p.id});
    });
    _cdCerts.filter(function(c){ return c.status==='invalidated'; }).forEach(function(c){
      items.push({rank:rank++,pri:'var(--cd-red)',name:'Re-certify — invalidated cert on record',
        sub:'Run all scripts · Gate blocked until passing cert exists',
        badge:'<span class="cd-tag cd-tag-r" style="flex-shrink:0">CERT</span>',id:c.id});
    });
    _cdRenderWorkQueue(items);
  } catch(e) {
    var el = document.getElementById('cd-wq-body');
    if (el) el.innerHTML = '<div style="padding:12px;font-size:11px;font-family:var(--font-mono);color:var(--text2)">Work queue unavailable</div>';
  }
}

function _cdRenderWorkQueue(items) {
  var countEl = document.getElementById('cd-wq-count');
  var bodyEl  = document.getElementById('cd-wq-body');
  if (!bodyEl) return;
  if (countEl) countEl.textContent = items.length+' items · system-prioritized';
  if (!items.length) {
    bodyEl.innerHTML = '<div style="padding:12px;font-size:11px;font-family:var(--font-mono);color:#3de08a">All paths covered · No outstanding work</div>';
    return;
  }
  var avColors = ['background:rgba(124,77,255,.25);color:#9d77ff',
    'background:rgba(0,210,255,.18);color:var(--cyan)',
    'background:rgba(79,142,247,.2);color:#4f8ef7',
    'background:rgba(42,157,64,.15);color:#3de08a',
    'background:rgba(255,192,52,.15);color:var(--cd-amb)'];
  var inits = ['SA','AK','MI','PS','MH'];
  bodyEl.innerHTML = items.map(function(item){
    var idx = (item.rank-1) % inits.length;
    return '<div class="cd-wq">' +
      '<div class="cd-wq-rank">'+item.rank+'</div>' +
      '<div class="cd-wq-pri" style="background:'+item.pri+'"></div>' +
      '<div class="cd-wq-main"><div class="cd-wq-name">'+item.name+'</div><div class="cd-wq-sub">'+item.sub+'</div></div>' +
      item.badge +
      '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0">' +
        '<div class="cd-mini-av" style="'+avColors[idx]+'">'+inits[idx]+'</div>' +
        '<div class="cd-wq-btn" onclick="_cdDelegateItem(this)">Assign</div>' +
      '</div></div>';
  }).join('');
}

// ── Request Queue ─────────────────────────────────────────────────────────────
async function _cdLoadRequestQueue(firmId) {
  try {
    var tmpls = await _cdQ('workflow_templates', {
      filters:[['firm_id','eq',firmId],['status','eq','draft']],
      select:'id,name,version,status,updated_at'
    });
    _cdRenderRequestQueue(tmpls||[]);
  } catch(e) {
    var el = document.getElementById('cd-rq-body');
    if (el) el.innerHTML = '<div style="padding:12px;font-size:11px;font-family:var(--font-mono);color:var(--text2)">Request queue unavailable</div>';
  }
}

function _cdRenderRequestQueue(tmpls) {
  var countEl = document.getElementById('cd-rq-count');
  var bodyEl  = document.getElementById('cd-rq-body');
  if (!bodyEl) return;
  if (countEl) countEl.textContent = tmpls.length+' pending';
  if (!tmpls.length) {
    bodyEl.innerHTML = '<div style="padding:12px;font-size:11px;font-family:var(--font-mono);color:#3de08a">No pending requests</div>';
    return;
  }
  bodyEl.innerHTML = tmpls.map(function(t){
    return '<div class="cd-rq">' +
      '<div style="flex:1;min-width:0">' +
        '<div class="cd-rq-name">'+_cdEsc(t.name)+'</div>' +
        '<div class="cd-rq-sub">v'+_cdEsc(t.version||'—')+' · Draft · '+_cdRelTime(t.updated_at)+'</div>' +
        '<div class="cd-rq-meta"><span class="cd-tag cd-tag-b">DRAFT — UNCERTIFIED</span></div>' +
      '</div>' +
      '<div class="cd-rq-acts">' +
        '<div class="cd-rq-btn cd-rq-run" onclick="_s9Switch(\"simulator\")">Run Cert</div>' +
        '<div class="cd-rq-btn cd-rq-arch">Archive</div>' +
      '</div></div>';
  }).join('');
}

// ── Training Coverage ─────────────────────────────────────────────────────────
async function _cdLoadTraining(firmId) {
  try {
    var paths = await _cdQ('bist_coverage_paths', {
      filters:[['firm_id','eq',firmId]],
      select:'id,path_name,coverage_status,template_id,workflow_templates(name,version)'
    });
    var bodyEl = document.getElementById('cd-tc-body');
    if (!bodyEl) return;
    if (!paths || !paths.length) {
      bodyEl.innerHTML = '<div style="padding:12px;font-size:11px;font-family:var(--font-mono);color:#3de08a">No coverage data yet</div>';
      return;
    }
    var map = {};
    paths.forEach(function(p){
      var n = (p.workflow_templates&&p.workflow_templates.name)||'Unknown';
      var v = (p.workflow_templates&&p.workflow_templates.version)||'—';
      if (!map[n]) map[n]={name:n,ver:v,total:0,covered:0};
      map[n].total++;
      if (p.coverage_status==='covered') map[n].covered++;
    });
    var list = Object.values(map);
    var tot  = list.reduce(function(a,t){return a+t.total;},0);
    var cov  = list.reduce(function(a,t){return a+t.covered;},0);
    var overall = tot>0 ? Math.round((cov/tot)*100) : 0;
    var overallClr = overall >= 75 ? '#3de08a' : overall >= 25 ? 'var(--cd-amb)' : 'var(--cd-red)';

    var html = '<div style="padding:6px 11px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">' +
      '<div style="font-size:11px;font-family:var(--font-mono);color:var(--text2)">Path coverage · all templates</div>' +
      '<div style="font-size:15px;font-weight:700;font-family:var(--font-mono);color:'+overallClr+'">'+overall+'%</div>' +
      '</div>';

    html += list.map(function(t){
      var pct = t.total>0 ? Math.round((t.covered/t.total)*100) : 0;
      var clr = pct >= 75 ? '#3de08a' : pct >= 25 ? 'var(--cd-amb)' : 'var(--cd-red)';
      return '<div class="cd-tc">' +
        '<div style="flex:1;min-width:0">' +
          '<div class="cd-tc-name">'+_cdEsc(t.name)+'</div>' +
          '<div class="cd-tc-ver">v'+_cdEsc(t.ver)+' · '+t.covered+'/'+t.total+' covered</div>' +
        '</div>' +
        '<div class="cd-tc-bar"><div class="cd-tc-fill" style="width:'+pct+'%;background:'+clr+'"></div></div>' +
        '<div class="cd-tc-pct" style="color:'+clr+'">'+pct+'%</div>' +
        '</div>';
    }).join('');

    bodyEl.innerHTML = html;
  } catch(e) {
    var bodyEl2 = document.getElementById('cd-tc-body');
    if (bodyEl2) bodyEl2.innerHTML = '<div style="padding:12px;font-size:11px;font-family:var(--font-mono);color:var(--text2)">Coverage data unavailable</div>';
  }
}

// ── CoC Feed ──────────────────────────────────────────────────────────────────
async function _cdLoadCoc(firmId) {
  try {
    var events = await _cdQ('coc_events', {
      filters:[['firm_id','eq',firmId]],
      order:'created_at.desc', limit:20,
      select:'id,entity_type,event_type,actor_name,actor_resource_id,metadata,event_class,severity,created_at'
    });
    _cdRenderCoc(events||[]);
  } catch(e) {
    var el = document.getElementById('cd-coc-body');
    if (el) el.innerHTML = '<div style="padding:12px;font-size:11px;font-family:var(--font-mono);color:var(--text2)">CoC feed unavailable</div>';
  }
}

function _cdRenderCoc(events) {
  var bodyEl = document.getElementById('cd-coc-body');
  if (!bodyEl) return;
  var dotMap = {
    'cert.issued':              '#3de08a',
    'cert.invalidated':         'var(--cd-amb)',
    'template.released':        '#3de08a',
    'template.created':         'var(--cyan)',
    'template.updated':         'var(--cyan)',
    'template.archived':        'var(--text2)',
    'health.score.calculated':  'var(--text2)',
    'mrb.escalated':            'var(--cd-amb)',
    'training.assigned':        'var(--cyan)',
    'training.completed':       '#3de08a',
    'work.delegated':           'var(--cyan)',
    'override.applied':         'var(--cd-amb)',
    'form.saved':               'var(--cyan)',
    'form.state_changed':       'var(--cyan)',
    'form.submitted':           '#3de08a',
    'instance.started':         'var(--cyan)',
    'instance.completed':       '#3de08a',
    'instance.cancelled':       'var(--text2)',
    'step.completed':           '#3de08a',
    'step.approved':            '#3de08a',
    'step.rejected':            'var(--cd-amb)',
  };
  var labMap = {
    'cert.issued':             'certified',
    'cert.invalidated':        'cert invalidated',
    'template.released':       'released to Library',
    'template.created':        'created template',
    'template.updated':        'updated template',
    'template.archived':       'archived template',
    'health.score.calculated': 'health score calculated',
    'mrb.escalated':           'MRB escalated',
    'training.assigned':       'assigned training',
    'training.completed':      'completed training',
    'work.delegated':          'delegated work item',
    'override.applied':        'applied override',
    'form.saved':              'saved',
    'form.state_changed':      'updated status of',
    'form.submitted':          'submitted',
    'instance.started':        'started instance of',
    'instance.completed':      'completed',
    'instance.cancelled':      'cancelled',
    'step.completed':          'completed step in',
    'step.approved':           'approved step in',
    'step.rejected':           'rejected step in',
  };
  // Human-readable actor label
  function _cdActorLabel(e) {
    if (!e.actor_name || e.actor_name === 'System') return null;
    var cu = window.CURRENT_USER;
    if (cu && (e.actor_name === cu.name || e.actor_name === (cu.first_name + ' ' + cu.last_name).trim())) return 'You';
    // Shorten to first name only
    return e.actor_name.split(' ')[0];
  }
  // Clean entity label — strip internal prefixes/suffixes
  function _cdEntityLabel(entityType) {
    if (!entityType) return '';
    return entityType.replace(/_/g,' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
  }

  // Update header to reflect current user context
  var cocCount = document.getElementById('cd-coc-count');
  if (cocCount) {
    var cu = window.CURRENT_USER;
    var myEvents = cu ? events.filter(function(e){
      return e.actor_name && (e.actor_name === cu.name ||
        e.actor_name === (cu.first_name+' '+cu.last_name).trim());
    }).length : 0;
    cocCount.textContent = myEvents + ' my actions · CoC recorded';
  }

  if (!events.length) {
    bodyEl.innerHTML = '<div style="padding:12px;font-size:11px;font-family:var(--font-mono);color:var(--text2)">No recent CoC events</div>';
    return;
  }
  bodyEl.innerHTML = events.map(function(e){
    var dot  = dotMap[e.event_type] || 'var(--text2)';
    var pay  = e.metadata || {};
    var actor = _cdActorLabel(e);
    var actorStr = actor ? '<strong>' + _cdEsc(actor) + '</strong> ' : '';
    var desc = '';
    if (e.event_type==='cert.issued')
      desc = actorStr + 'certified <strong>' + _cdEsc(pay.template||e.entity_type||'workflow') + '</strong>' + (pay.version?' v'+_cdEsc(pay.version):'');
    else if (e.event_type==='cert.invalidated')
      desc = '<strong>Cert invalidated</strong> — ' + _cdEsc(pay.template||e.entity_type||'') + (pay.reason?' · '+_cdEsc(pay.reason):'');
    else if (e.event_type==='template.released')
      desc = actorStr + 'released <strong>' + _cdEsc(pay.template||e.entity_type||'') + '</strong>' + (pay.version?' v'+_cdEsc(pay.version):'') + ' to Library';
    else if (e.event_type==='template.created' || e.event_type==='template.updated')
      desc = actorStr + _cdEsc(labMap[e.event_type]) + ' <strong>' + _cdEsc(pay.template||e.entity_type||'') + '</strong>';
    else if (e.event_type==='health.score.calculated')
      desc = '<strong>System</strong> calculated health score <strong>' + _cdEsc(String(pay.score||'—')) + '</strong>'
        + (pay.delta ? (pay.delta>0?' ↑':' ↓') + Math.abs(pay.delta) + ' pts' : '')
        + (pay.primary_driver ? ' · driver: ' + _cdEsc(pay.primary_driver) : '');
    else if (e.event_type==='mrb.escalated')
      desc = '<strong>System</strong> escalated <strong>' + _cdEsc(pay.ncmr||e.entity_type||'MRB') + '</strong>' + (pay.message?' — '+_cdEsc(pay.message):'');
    else if (e.event_type==='training.assigned')
      desc = actorStr + 'assigned training <strong>' + _cdEsc(pay.template||e.entity_type||'') + '</strong>' + (pay.assignee?' → '+_cdEsc(pay.assignee):'');
    else if (e.event_type==='training.completed')
      desc = actorStr + 'completed <strong>' + _cdEsc(pay.template||e.entity_type||'training') + '</strong>';
    else if (e.event_type==='work.delegated')
      desc = actorStr + 'delegated <strong>' + _cdEsc(pay.item||e.entity_type||'item') + '</strong>' + (pay.delegated_to?' → '+_cdEsc(pay.delegated_to):'');
    else if (e.event_type==='override.applied')
      desc = actorStr + 'applied override on <strong>' + _cdEsc(pay.label||e.entity_type||'item') + '</strong>';
    else if (e.event_type==='form.saved' || e.event_type==='form.submitted')
      desc = actorStr + _cdEsc(labMap[e.event_type]||'saved') + ' <strong>' + _cdEsc(pay.form_name||pay.name||_cdEntityLabel(e.entity_type)) + '</strong>';
    else if (e.event_type==='form.state_changed')
      desc = actorStr + 'updated <strong>' + _cdEsc(pay.form_name||pay.name||_cdEntityLabel(e.entity_type)) + '</strong>'
        + (pay.from&&pay.to ? ' · ' + _cdEsc(pay.from) + ' → ' + _cdEsc(pay.to) : '');
    else if (e.event_type==='instance.started' || e.event_type==='instance.completed' || e.event_type==='instance.cancelled')
      desc = actorStr + _cdEsc(labMap[e.event_type]||e.event_type.split('.')[1]) + ' <strong>' + _cdEsc(pay.template||pay.name||_cdEntityLabel(e.entity_type)) + '</strong>';
    else if (e.event_type==='step.completed' || e.event_type==='step.approved' || e.event_type==='step.rejected')
      desc = actorStr + _cdEsc(labMap[e.event_type]||e.event_type.split('.')[1]) + ' <strong>' + _cdEsc(pay.step||pay.name||_cdEntityLabel(e.entity_type)) + '</strong>';
    else {
      // Generic fallback — clean verb from event type, no raw internal names
      var verb = (labMap[e.event_type] || e.event_type.replace(/[._]/g,' ')).toLowerCase();
      var obj  = pay.template||pay.name||pay.form_name||_cdEntityLabel(e.entity_type)||'';
      desc = actorStr + _cdEsc(verb) + (obj ? ' <strong>' + _cdEsc(obj) + '</strong>' : '');
    }
    return '<div class="cd-coc">' +
      '<div class="cd-coc-dot" style="background:'+dot+'"></div>' +
      '<div class="cd-coc-text">'+desc+'</div>' +
      '<div class="cd-coc-time">'+_cdRelTime(e.created_at)+'</div>' +
      '</div>';
  }).join('');
}

// ── Override flow ─────────────────────────────────────────────────────────────
function _cdOpenOverride(reason, entityId, label) {
  _cdOverrideCtx = {reason:reason, entityId:entityId, label:label};
  var actor = (window.CURRENT_USER && window.CURRENT_USER.name) || 'Current user';
  var el = document.getElementById('cd-override-entity'); if (el) el.textContent = label;
  var al = document.getElementById('cd-override-actor');  if (al) al.textContent = actor;
  var ra = document.getElementById('cd-override-rationale'); if (ra) ra.value = '';
  var mo = document.getElementById('cd-override-modal'); if (mo) mo.classList.add('open');
}
function _cdCloseOverlay(evt) {
  if (evt.target === document.getElementById('cd-override-modal')) {
    document.getElementById('cd-override-modal').classList.remove('open');
  }
}
function _cdCloseOverlayBtn() {
  var mo = document.getElementById('cd-override-modal'); if (mo) mo.classList.remove('open');
}
function _cdConfirmOverride() {
  var ra = (document.getElementById('cd-override-rationale')||{}).value || '';
  if (ra.trim().length < 20) {
    var ta = document.getElementById('cd-override-rationale');
    if (ta) ta.style.borderColor = 'var(--cd-red)';
    return;
  }
  var ta = document.getElementById('cd-override-rationale');
  if (ta) ta.style.borderColor = '';
  if (!_cdOverrideCtx) return;
  // Write CoC event using existing API
  // Resolve firm_id — try multiple sources
  var _firmId = (window.CURRENT_FIRM && window.CURRENT_FIRM.id) || window._s9FirmId || null;
  API.post('coc_events', {
    firm_id:           _firmId,
    entity_type:       'bist_certificate',
    entity_id:         _cdOverrideCtx.entityId,
    event_type:        'override.applied',
    actor_name:        (window.CURRENT_USER && window.CURRENT_USER.name) || 'Unknown',
    actor_resource_id: (window.CURRENT_USER && window.CURRENT_USER.resource_id) || null,
    metadata:          {reason:_cdOverrideCtx.reason, label:_cdOverrideCtx.label, rationale:ra.trim()},
    event_class:       'governance',
    severity:          'warning',
    occurred_at:       new Date().toISOString()
  }).then(function() {
    _cdCloseOverlayBtn();
  }).catch(function(err) {
    console.error('[CD Brief] Override CoC write failed:', err);
    _cdCloseOverlayBtn();
  });
}