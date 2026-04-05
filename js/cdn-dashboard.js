// ══════════════════════════════════════════════════════════════════════════════
// cdn-dashboard.js  ·  v20260406-CD4
// CadenceHUD — Process Certification Portfolio Dashboard
//
// Layout: KPI strip → Cert Portfolio grid (main) + Right rail (health + requests + CoC)
// Hot Queue lives inside the cert portfolio section as a priority band.
//
// Depends on: api.js (API.get, API.post), cdn-bist.js (_s9DashOpenSimulator),
//             _s9Switch(), _s9WaitForFirmId(), window.CURRENT_USER
// ══════════════════════════════════════════════════════════════════════════════

/* global API, _s9Switch, _s9WaitForFirmId, _s9DashOpenSimulator */

console.log('%c[cdn-dashboard] v20260406-CD4 — schema audit clean · all columns verified','background:#1e6a7a;color:#fff;font-weight:700;padding:2px 8px;border-radius:3px');

// ── Inject CSS ─────────────────────────────────────────────────────────────────
(function() {
  if (document.getElementById('cdn-dashboard-css')) return;
  var s = document.createElement('style');
  s.id  = 'cdn-dashboard-css';
  s.textContent = ''
    // Colour vars
    + ':root{--cd-grn:#3de08a;--cd-grn2:rgba(61,224,138,.13);--cd-amb:#f5c842;--cd-amb2:rgba(245,200,66,.14);--cd-red:#e84040;--cd-red2:rgba(232,64,64,.14);--cd-teal:#5fd4c8;--cd-blue:#60a5fa;--cd-pur:#a78bfa}\n'
    // Shell
    + '.cd-brief{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;background:#080a0f;font-family:Arial,sans-serif}\n'
    // KPI strip
    + '.cd-kpi-strip{display:flex;border-bottom:1px solid #1e2535;flex-shrink:0;background:#0d1017}\n'
    + '.cd-kpi{flex:1;padding:9px 14px;border-right:1px solid #1e2535;display:flex;flex-direction:column;gap:2px}\n'
    + '.cd-kpi:last-child{border-right:none}\n'
    + '.cd-kpi-lbl{font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--cd-teal)}\n'
    + '.cd-kpi-val{font-size:19px;font-weight:700;font-family:var(--font-mono,"Courier New",monospace)}\n'
    + '.cd-kpi-sub{font-size:10px;color:rgba(255,255,255,.45)}\n'
    + '.cd-kpi-delta{font-size:10px;font-weight:700}\n'
    // Main body
    + '.cd-body{flex:1;display:flex;overflow:hidden}\n'
    + '.cd-main{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:12px}\n'
    + '.cd-main::-webkit-scrollbar{width:3px}\n'
    + '.cd-main::-webkit-scrollbar-thumb{background:rgba(255,255,255,.07)}\n'
    // Right rail
    + '.cd-rail{width:282px;flex-shrink:0;border-left:1px solid #1e2535;display:flex;flex-direction:column;overflow:hidden}\n'
    + '.cd-rail-sect{border-bottom:1px solid #1e2535;display:flex;flex-direction:column;overflow:hidden}\n'
    + '.cd-rail-sect:last-child{border-bottom:none;flex:1}\n'
    + '.cd-rail-hdr{padding:7px 12px;display:flex;align-items:center;gap:6px;flex-shrink:0}\n'
    + '.cd-rail-title{font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--cd-teal);flex:1}\n'
    + '.cd-rail-count{font-size:10px;color:rgba(255,255,255,.45);font-family:var(--font-mono,"Courier New",monospace)}\n'
    + '.cd-rail-body{flex:1;overflow-y:auto;max-height:200px}\n'
    + '.cd-rail-body.flex-scroll{flex:1;max-height:none}\n'
    + '.cd-rail-body::-webkit-scrollbar{width:2px}\n'
    + '.cd-rail-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.07)}\n'
    // Section labels
    + '.cd-sect-hdr{display:flex;align-items:center;gap:8px;margin-bottom:8px}\n'
    + '.cd-sect-label{font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.4)}\n'
    + '.cd-sect-line{flex:1;height:1px;background:#1e2535}\n'
    // Hot queue items (compact band at top of main)
    + '.cd-hot{padding:7px 11px;border-bottom:1px solid #1e2535;display:flex;align-items:flex-start;gap:7px;cursor:pointer;transition:background .1s}\n'
    + '.cd-hot:hover{background:rgba(255,255,255,.02)}\n'
    + '.cd-hot:last-child{border-bottom:none}\n'
    + '.cd-hot-sev{width:3px;border-radius:2px;flex-shrink:0;align-self:stretch;min-height:28px}\n'
    + '.cd-hot-main{flex:1;min-width:0}\n'
    + '.cd-hot-type{font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;font-family:var(--font-mono,"Courier New",monospace);margin-bottom:1px}\n'
    + '.cd-hot-name{font-size:12px;color:#e2e8f0;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n'
    + '.cd-hot-sub{font-size:10px;color:rgba(255,255,255,.45);font-family:var(--font-mono,"Courier New",monospace);margin-top:1px}\n'
    + '.cd-hot-acts{display:flex;gap:4px;flex-shrink:0;align-items:center}\n'
    + '.cd-hbtn{padding:3px 8px;border-radius:3px;font-size:10px;font-weight:700;cursor:pointer;border:1px solid;font-family:var(--font-mono,"Courier New",monospace);white-space:nowrap;transition:all .12s}\n'
    + '.cd-hbtn-r{background:var(--cd-red2);border-color:rgba(232,64,64,.4);color:var(--cd-red)}\n'
    + '.cd-hbtn-r:hover{background:rgba(232,64,64,.25)}\n'
    + '.cd-hbtn-a{background:var(--cd-amb2);border-color:rgba(245,200,66,.35);color:var(--cd-amb)}\n'
    + '.cd-hbtn-a:hover{background:rgba(245,200,66,.22)}\n'
    + '.cd-hbtn-n{background:transparent;border-color:#2a3347;color:rgba(255,255,255,.5)}\n'
    + '.cd-hbtn-n:hover{border-color:#3a4557;color:#e2e8f0}\n'
    + '.cd-hot-empty{padding:16px 11px;display:flex;align-items:center;gap:8px}\n'
    + '.cd-hot-empty-check{width:22px;height:22px;border-radius:50%;background:var(--cd-grn2);border:1px solid rgba(61,224,138,.25);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--cd-grn);flex-shrink:0}\n'
    + '.cd-hot-empty-text{font-size:11px;color:var(--cd-grn);font-family:var(--font-mono,"Courier New",monospace)}\n'
    // Portfolio grid
    + '.cd-port-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}\n'
    // Workflow card
    + '.cd-wf{background:#0d1017;border:1px solid #1e2535;border-radius:4px;display:flex;flex-direction:column;gap:8px;padding:10px 12px;cursor:pointer;transition:border-color .15s}\n'
    + '.cd-wf:hover{border-color:#252d3f}\n'
    + '.cd-wf.wf-cert  {border-left:2px solid var(--cd-grn)}\n'
    + '.cd-wf.wf-fail  {border-left:2px solid var(--cd-red)}\n'
    + '.cd-wf.wf-stale {border-left:2px solid var(--cd-amb)}\n'
    + '.cd-wf.wf-uncov {border-left:2px solid #4a5568}\n'
    + '.cd-wf-hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:6px}\n'
    + '.cd-wf-name{font-size:12px;font-weight:700;color:#e2e8f0;line-height:1.4}\n'
    + '.cd-wf-ver{font-size:10px;color:rgba(255,255,255,.35);font-family:var(--font-mono,"Courier New",monospace);margin-top:1px}\n'
    + '.cd-pill{font-size:9px;font-weight:700;padding:2px 7px;border-radius:2px;white-space:nowrap;flex-shrink:0;letter-spacing:.04em;text-transform:uppercase;font-family:var(--font-mono,"Courier New",monospace)}\n'
    + '.cd-pill-cert {background:rgba(61,224,138,.1); color:var(--cd-grn); border:1px solid rgba(61,224,138,.3)}\n'
    + '.cd-pill-fail {background:var(--cd-red2);       color:var(--cd-red); border:1px solid rgba(232,64,64,.35)}\n'
    + '.cd-pill-stale{background:var(--cd-amb2);       color:var(--cd-amb); border:1px solid rgba(245,200,66,.3)}\n'
    + '.cd-pill-uncov{background:rgba(74,85,104,.2);   color:#6b7a99;       border:1px solid #2a3347}\n'
    + '.cd-wf-cov{display:flex;align-items:center;gap:6px}\n'
    + '.cd-cov-bar{flex:1;height:3px;background:#1e2535;border-radius:2px;overflow:hidden}\n'
    + '.cd-cov-fill{height:100%;border-radius:2px}\n'
    + '.cd-cov-pct{font-size:10px;font-weight:700;font-family:var(--font-mono,"Courier New",monospace);min-width:30px;text-align:right}\n'
    + '.cd-cov-suite{font-size:10px;color:rgba(255,255,255,.45);font-family:var(--font-mono,"Courier New",monospace)}\n'
    + '.cd-wf-dates{display:flex;align-items:center;justify-content:space-between}\n'
    + '.cd-wf-date{font-size:10px;color:rgba(255,255,255,.35);font-family:var(--font-mono,"Courier New",monospace)}\n'
    + '.cd-wf-acts{display:flex;align-items:center;gap:5px;flex-wrap:wrap}\n'
    + '.cd-wf-btn{padding:3px 8px;border-radius:3px;font-size:10px;font-weight:700;cursor:pointer;border:1px solid #2a3347;background:transparent;color:rgba(255,255,255,.5);font-family:var(--font-mono,"Courier New",monospace);transition:all .12s}\n'
    + '.cd-wf-btn:hover{border-color:#3a4557;color:#e2e8f0}\n'
    + '.cd-wf-btn.primary{color:var(--cd-teal);border-color:rgba(95,212,200,.35)}\n'
    + '.cd-wf-btn.primary:hover{background:rgba(95,212,200,.07)}\n'
    + '.cd-wf-btn.danger{color:var(--cd-red);border-color:rgba(232,64,64,.35)}\n'
    + '.cd-wf-btn.danger:hover{background:var(--cd-red2)}\n'
    // Health score block (rail)
    + '.cd-hs-block{padding:10px 12px;display:flex;flex-direction:column;align-items:center;gap:6px}\n'
    + '.cd-hs-num{font-size:42px;font-weight:700;font-family:var(--font-mono,"Courier New",monospace);line-height:1}\n'
    + '.cd-hs-lbl{font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.45)}\n'
    + '.cd-hs-domains{width:100%;display:flex;flex-direction:column;gap:5px;margin-top:2px}\n'
    + '.cd-hs-dom{display:flex;align-items:center;gap:6px}\n'
    + '.cd-hs-dom-name{font-size:10px;color:rgba(255,255,255,.5);width:82px;flex-shrink:0}\n'
    + '.cd-hs-dom-bar{flex:1;height:3px;background:#1e2535;border-radius:2px;overflow:hidden}\n'
    + '.cd-hs-dom-fill{height:100%;border-radius:2px}\n'
    + '.cd-hs-dom-pct{font-size:10px;font-weight:700;font-family:var(--font-mono,"Courier New",monospace);min-width:26px;text-align:right}\n'
    // Request queue (rail)
    + '.cd-rq{padding:6px 12px;border-bottom:1px solid #1e2535;display:flex;align-items:flex-start;gap:6px;cursor:pointer;transition:background .1s}\n'
    + '.cd-rq:hover{background:rgba(255,255,255,.02)}\n'
    + '.cd-rq:last-child{border-bottom:none}\n'
    + '.cd-rq-badge{font-size:9px;font-weight:700;padding:2px 5px;border-radius:2px;background:rgba(96,165,250,.14);color:var(--cd-blue);border:1px solid rgba(96,165,250,.25);white-space:nowrap;flex-shrink:0;margin-top:1px;font-family:var(--font-mono,"Courier New",monospace);letter-spacing:.03em}\n'
    + '.cd-rq-body{flex:1;min-width:0}\n'
    + '.cd-rq-name{font-size:11px;font-weight:700;color:#e2e8f0}\n'
    + '.cd-rq-from{font-size:10px;color:rgba(255,255,255,.4);font-family:var(--font-mono,"Courier New",monospace);margin-top:1px}\n'
    + '.cd-rq-acts{display:flex;gap:3px;margin-top:4px}\n'
    + '.cd-rq-btn{padding:2px 6px;border-radius:3px;font-size:10px;font-weight:700;cursor:pointer;border:1px solid #2a3347;background:transparent;color:rgba(255,255,255,.45);font-family:var(--font-mono,"Courier New",monospace);transition:all .12s}\n'
    + '.cd-rq-btn:hover{border-color:#3a4557;color:#e2e8f0}\n'
    // CoC feed (rail)
    + '.cd-coc{padding:6px 12px;border-bottom:1px solid #1e2535;display:flex;align-items:flex-start;gap:7px}\n'
    + '.cd-coc:last-child{border-bottom:none}\n'
    + '.cd-coc-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;margin-top:4px}\n'
    + '.cd-coc-text{font-size:10px;color:rgba(255,255,255,.5);font-family:var(--font-mono,"Courier New",monospace);flex:1;line-height:1.5}\n'
    + '.cd-coc-text strong{color:#e2e8f0;font-weight:700}\n'
    + '.cd-coc-time{font-size:9px;color:rgba(255,255,255,.3);font-family:var(--font-mono,"Courier New",monospace);flex-shrink:0;margin-top:3px}\n'
    // Shimmer
    + '@keyframes cd-shimmer{0%,100%{opacity:.35}50%{opacity:.7}}\n'
    + '.cd-skel{background:#1a1f2e;border-radius:3px;animation:cd-shimmer 1.4s ease-in-out infinite}\n'
    // Colour utils
    + '.cd-grn{color:var(--cd-grn)} .cd-amb{color:var(--cd-amb)} .cd-red{color:var(--cd-red)} .cd-t2{color:rgba(255,255,255,.45)}\n'
    // Override modal
    + '.cd-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;z-index:9000}\n'
    + '.cd-overlay.open{display:flex}\n'
    + '.cd-modal{background:#0d1017;border:1px solid #252d3f;border-radius:6px;width:440px;overflow:hidden}\n'
    + '.cd-modal-hdr{padding:12px 14px;border-bottom:1px solid #1e2535;display:flex;align-items:center;gap:7px}\n'
    + '.cd-modal-title{font-size:13px;font-weight:700;color:#e2e8f0;flex:1}\n'
    + '.cd-modal-close{font-size:14px;color:rgba(255,255,255,.4);cursor:pointer;padding:2px 6px;border-radius:3px;transition:color .1s}\n'
    + '.cd-modal-close:hover{color:#e2e8f0}\n'
    + '.cd-modal-body{padding:14px}\n'
    + '.cd-modal-warn{background:rgba(192,64,74,.08);border:1px solid rgba(192,64,74,.2);border-radius:4px;padding:10px 12px;font-size:12px;color:rgba(255,255,255,.6);line-height:1.6;margin-bottom:12px}\n'
    + '.cd-modal-warn strong{color:var(--cd-red)}\n'
    + '.cd-modal-lbl{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.45);font-family:var(--font-mono,"Courier New",monospace);margin-bottom:5px}\n'
    + '.cd-modal-ta{width:100%;background:#080a0f;border:1px solid #1e2535;border-radius:4px;color:#e2e8f0;font-family:var(--font-mono,"Courier New",monospace);font-size:12px;padding:8px 10px;resize:vertical;min-height:64px;outline:none;transition:border-color .1s}\n'
    + '.cd-modal-ta:focus{border-color:var(--cd-teal)}\n'
    + '.cd-modal-note{font-size:10px;color:rgba(255,255,255,.4);font-family:var(--font-mono,"Courier New",monospace);margin-top:7px;padding:6px 10px;background:#080a0f;border-radius:3px;line-height:1.5}\n'
    + '.cd-modal-note span{color:var(--cd-teal)}\n'
    + '.cd-modal-ftr{padding:10px 14px;border-top:1px solid #1e2535;display:flex;gap:8px;justify-content:flex-end}\n'
  ;
  document.head.appendChild(s);
})();

// ── Override modal HTML ────────────────────────────────────────────────────────
(function() {
  if (document.getElementById('cd-override-modal')) return;
  var div = document.createElement('div');
  div.innerHTML =
    '<div class="cd-overlay" id="cd-override-modal" onclick="_cdCloseOverlay(event)">' +
      '<div class="cd-modal">' +
        '<div class="cd-modal-hdr">' +
          '<div class="cd-modal-title">Override — Governance Exception</div>' +
          '<div class="cd-modal-close" onclick="_cdCloseOverlayBtn()">✕</div>' +
        '</div>' +
        '<div class="cd-modal-body">' +
          '<div class="cd-modal-warn"><strong>This is a governance override.</strong> You are acknowledging an exception to established quality thresholds. A written rationale is required and will be permanently recorded in the Chain of Custody.</div>' +
          '<div class="cd-modal-lbl">Rationale (required — minimum 20 characters)</div>' +
          '<textarea class="cd-modal-ta" id="cd-override-rationale" placeholder="Describe the business reason for this override…"></textarea>' +
          '<div class="cd-modal-note">Recorded as: <span id="cd-override-coc-label">override.applied</span> · Actor: <span id="cd-override-actor">—</span> · Entity: <span id="cd-override-entity">—</span> · <span style="color:var(--cd-red)">Immutable</span></div>' +
        '</div>' +
        '<div class="cd-modal-ftr">' +
          '<button class="btn btn-sm" onclick="_cdCloseOverlayBtn()">Cancel</button>' +
          '<button class="btn btn-sm" id="cd-override-confirm-btn" onclick="_cdConfirmOverride()" style="background:var(--cd-red2);border:1px solid rgba(232,64,64,.4);color:var(--cd-red)">Confirm Override</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(div.firstElementChild);
})();

// ── Action handlers ───────────────────────────────────────────────────────────
function _cdConveneMrb(mrbId) {
  _s9Switch('instances');
  console.log('[CD] Convene MRB:', mrbId);
}
function _cdDelegateItem(btn) {
  if (btn) { btn.textContent = 'Assigned'; btn.style.opacity = '.5'; btn.style.pointerEvents = 'none'; }
}

// ── Query helper ──────────────────────────────────────────────────────────────
function _cdQ(table, opts) {
  var o = opts || {};
  var qs = [];
  (o.filters || []).forEach(function(f) { qs.push(f[0]+'='+f[1]+'.'+encodeURIComponent(f[2])); });
  if (o.select) qs.push('select='+encodeURIComponent(o.select));
  if (o.order)  qs.push('order=' +encodeURIComponent(o.order));
  if (o.limit)  qs.push('limit=' +o.limit);
  return API.get(table + (qs.length ? '?'+qs.join('&') : ''));
}

// ── State ─────────────────────────────────────────────────────────────────────
var _cdCerts       = [];
var _cdRuns        = [];
var _cdOverrideCtx = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function _cdScoreColor(n) { return n >= 90 ? 'var(--cd-grn)' : n >= 75 ? 'var(--cd-amb)' : 'var(--cd-red)'; }
function _cdScoreCls(n)   { return n >= 90 ? 'cd-grn'        : n >= 75 ? 'cd-amb'        : 'cd-red'; }
function _cdRelTime(iso) {
  if (!iso) return '—';
  var d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60)    return d + 's ago';
  if (d < 3600)  return Math.floor(d/60) + 'm ago';
  if (d < 86400) return Math.floor(d/3600) + 'h ago';
  return Math.floor(d/86400) + 'd ago';
}
function _cdEsc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _cdDaysAgo(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// ── Route ─────────────────────────────────────────────────────────────────────
var _cdLastLoad = 0;
var _cdLoadTtl  = 120000;

function _s9RouteDashboard() {
  var panel = document.getElementById('s9-dash-panel');
  if (!panel) return;
  var now = Date.now();
  if (!document.getElementById('cd-body')) {
    _cdRenderShell(panel);
  } else if (now - _cdLastLoad > _cdLoadTtl) {
    _cdLastLoad = now;
    _cdLoadAll();
  }
}

// ── Shell ─────────────────────────────────────────────────────────────────────
function _cdRenderShell(panel) {
  panel.innerHTML =
    '<div class="cd-brief">' +
      // KPI strip
      '<div class="cd-kpi-strip" id="cd-kpi-strip">' +
        [1,2,3,4,5,6].map(function(){
          return '<div class="cd-kpi"><div class="cd-skel" style="height:9px;width:60px;margin-bottom:5px"></div>' +
            '<div class="cd-skel" style="height:18px;width:40px;margin-bottom:4px"></div>' +
            '<div class="cd-skel" style="height:9px;width:80px"></div></div>';
        }).join('') +
      '</div>' +
      // Body
      '<div class="cd-body" id="cd-body">' +
        // Left main
        '<div class="cd-main" id="cd-main">' +
          // Hot queue (hidden until data loads)
          '<div id="cd-hot-wrap" style="background:#0d1017;border:1px solid #1e2535;border-radius:4px;overflow:hidden">' +
            '<div style="display:flex;align-items:center;gap:7px;padding:7px 12px;border-bottom:1px solid #1e2535;flex-shrink:0">' +
              '<div style="font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--cd-red);flex:1" id="cd-hq-label">⚡ Hot Queue</div>' +
              '<div style="font-size:10px;color:rgba(255,255,255,.45);font-family:var(--font-mono,\'Courier New\',monospace)" id="cd-hq-count">Loading…</div>' +
            '</div>' +
            '<div id="cd-hq-body"><div style="padding:10px 12px"><div class="cd-skel" style="height:11px;width:90%;margin-bottom:6px"></div><div class="cd-skel" style="height:11px;width:65%"></div></div></div>' +
          '</div>' +
          // Portfolio grid
          '<div>' +
            '<div class="cd-sect-hdr"><div class="cd-sect-label">Process Certification Portfolio</div><div class="cd-sect-line"></div><div style="font-size:10px;color:rgba(255,255,255,.35);font-family:var(--font-mono,\'Courier New\',monospace)" id="cd-port-count">Loading…</div></div>' +
            '<div class="cd-port-grid" id="cd-port-grid">' +
              [1,2,3,4].map(function(){
                return '<div class="cd-wf wf-uncov"><div class="cd-skel" style="height:12px;width:70%;margin-bottom:8px"></div>' +
                  '<div class="cd-skel" style="height:3px;width:100%;margin-bottom:8px"></div>' +
                  '<div class="cd-skel" style="height:10px;width:50%"></div></div>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +
        // Right rail
        '<div class="cd-rail">' +
          // Health score
          '<div class="cd-rail-sect">' +
            '<div class="cd-rail-hdr"><div class="cd-rail-title">Portfolio Health</div></div>' +
            '<div class="cd-hs-block" id="cd-hs-block">' +
              '<div class="cd-skel" style="height:40px;width:70px;border-radius:4px"></div>' +
              '<div class="cd-skel" style="height:9px;width:90px"></div>' +
            '</div>' +
          '</div>' +
          // Request queue
          '<div class="cd-rail-sect">' +
            '<div class="cd-rail-hdr"><div class="cd-rail-title">Request Queue</div><div class="cd-rail-count" id="cd-rq-count">—</div></div>' +
            '<div class="cd-rail-body" id="cd-rq-body"><div style="padding:10px 12px"><div class="cd-skel" style="height:11px;width:90%;margin-bottom:6px"></div><div class="cd-skel" style="height:11px;width:60%"></div></div></div>' +
          '</div>' +
          // CoC feed
          '<div class="cd-rail-sect" style="flex:1">' +
            '<div class="cd-rail-hdr"><div class="cd-rail-title">Command Record</div><div class="cd-rail-count" id="cd-coc-count">—</div></div>' +
            '<div class="cd-rail-body flex-scroll" id="cd-coc-body"><div style="padding:10px 12px"><div class="cd-skel" style="height:11px;width:95%;margin-bottom:6px"></div><div class="cd-skel" style="height:11px;width:70%;margin-bottom:6px"></div><div class="cd-skel" style="height:11px;width:80%"></div></div></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  _cdLoadAll();
}

// ── Data orchestrator ─────────────────────────────────────────────────────────
async function _cdLoadAll() {
  var firmId;
  try { firmId = await _s9WaitForFirmId(); } catch(e) {}
  if (!firmId) { console.warn('[CD] No firmId — aborting'); return; }
  _cdLastLoad = Date.now();
  _cdLoadKpiAndHealth(firmId);
  _cdLoadHotQueue(firmId);
  _cdLoadPortfolio(firmId);
  _cdLoadRequestQueue(firmId);
  _cdLoadCoc(firmId);
}

// ── KPI strip + Health score ──────────────────────────────────────────────────
async function _cdLoadKpiAndHealth(firmId) {
  try {
    var results = await Promise.all([
      _cdQ('bist_runs', { filters:[['firm_id','eq',firmId]], order:'run_at.desc', limit:100, select:'id,status,run_at,duration_ms,script_id' }),
      _cdQ('bist_certificates', { filters:[['firm_id','eq',firmId]], order:'issued_at.desc', select:'id,status,issued_at,expires_at,template_id,template_version' }),
      _cdQ('health_scores', { filters:[['firm_id','eq',firmId]], order:'calculated_at.desc', limit:7, select:'id,composite_score,domain_scores,calculated_at' })
    ]);
    var runs  = results[0] || [];
    var certs = results[1] || [];
    var hRows = results[2] || [];
    _cdCerts = certs;
    _cdRuns  = runs;
    _cdRenderKpis(runs, certs, hRows[0] || null);
    _cdRenderHealthScore(hRows);
  } catch(e) {
    console.warn('[CD] KPI/Health load failed:', e);
  }
}

function _cdRenderKpis(runs, certs, hs) {
  var el = document.getElementById('cd-kpi-strip'); if (!el) return;
  var now = Date.now(), thirty = 30*86400*1000;
  var r30     = runs.filter(function(r){ return r.run_at && (now - new Date(r.run_at).getTime()) < thirty; });
  var valid   = certs.filter(function(c){ return c.status === 'valid'; }).length;
  var total   = certs.length;
  var failing = certs.filter(function(c){ return c.status === 'invalidated'; }).length;
  var passed  = r30.filter(function(r){ return r.status === 'passed'; });
  var failed  = r30.filter(function(r){ return r.status === 'failed'; });
  var passRate= r30.length ? Math.round((passed.length / r30.length)*100) : null;
  var mttd    = failed.length ? Math.round(failed.reduce(function(a,r){return a+(r.duration_ms||0);},0)/failed.length/60000) : null;
  var thresh  = 30;
  try { if (hs && hs.threshold_config) thresh = Number(hs.threshold_config.stale_cert_days)||30; } catch(e){}
  var oldest  = 0;
  certs.filter(function(c){ return c.status==='valid'; }).forEach(function(c){
    var a = _cdDaysAgo(c.issued_at) || 0;
    if (a > oldest) oldest = a;
  });

  var kpis = [
    { lbl:'Suite Pass Rate',     val: passRate !== null ? passRate+'%' : '—', sub:'last 30 days · '+r30.length+' runs', delta: passRate !== null ? (passRate>=90?'↑ healthy':'↓ review needed') : 'No runs yet', dc: passRate === null ? 'rgba(255,255,255,.35)' : passRate>=90 ? 'var(--cd-grn)' : 'var(--cd-amb)', vc: passRate === null ? 'rgba(255,255,255,.45)' : passRate>=90 ? 'var(--cd-grn)' : 'var(--cd-amb)' },
    { lbl:'Workflows Certified', val: valid+'/'+total,  sub: total ? (valid===total?'All workflows valid':failing+' invalidated') : 'No templates', delta: valid===total?'↑ All valid':'↓ '+failing+' blocked', dc: valid===total?'var(--cd-grn)':'var(--cd-red)', vc: valid===total?'var(--cd-grn)':'var(--cd-amb)' },
    { lbl:'Failing Tests',       val: failing || '0',  sub: failing ? 'Release gate blocked' : 'All gates clear', delta: failing ? '↓ Action required' : '↑ Gates clear', dc: failing ? 'var(--cd-red)' : 'var(--cd-grn)', vc: failing ? 'var(--cd-red)' : 'var(--cd-grn)' },
    { lbl:'Mean Time to Detect', val: mttd ? mttd+'m' : '—',  sub:'failure → discovery', delta:'Last 30 days', dc:'rgba(255,255,255,.35)', vc:'var(--cd-amb)' },
    { lbl:'Suite Runs (30d)',    val: r30.length, sub: passed.length+' passed · '+failed.length+' failed', delta: r30.length ? 'Active certification' : 'No runs this period', dc:'rgba(255,255,255,.35)', vc:'rgba(255,255,255,.85)' },
    { lbl:'Oldest Cert Age',     val: oldest+'d', sub:'threshold: '+thresh+'d', delta: oldest > thresh ? '↓ Stale — re-certify' : oldest > thresh*.7 ? '↓ Approaching threshold' : '↑ Within threshold', dc: oldest > thresh ? 'var(--cd-red)' : oldest > thresh*.7 ? 'var(--cd-amb)' : 'var(--cd-grn)', vc: oldest > thresh ? 'var(--cd-red)' : oldest > thresh*.7 ? 'var(--cd-amb)' : 'var(--cd-grn)' }
  ];

  el.innerHTML = kpis.map(function(k){
    return '<div class="cd-kpi">' +
      '<div class="cd-kpi-lbl">'+_cdEsc(k.lbl)+'</div>' +
      '<div class="cd-kpi-val" style="color:'+k.vc+'">'+k.val+'</div>' +
      '<div class="cd-kpi-sub">'+_cdEsc(k.sub)+'</div>' +
      '<div class="cd-kpi-delta" style="color:'+k.dc+'">'+_cdEsc(k.delta)+'</div>' +
      '</div>';
  }).join('');
}

function _cdRenderHealthScore(hRows) {
  var el = document.getElementById('cd-hs-block'); if (!el) return;
  if (!hRows || !hRows.length) {
    el.innerHTML = '<div class="cd-hs-num cd-t2">—</div><div class="cd-hs-lbl">No score data</div>';
    return;
  }
  var latest = hRows[0];
  var score  = Math.round(latest.composite_score);
  var clr    = _cdScoreColor(score);
  var domains= latest.domain_scores || {};
  var defs   = [
    {key:'process_cert', label:'Certification'},
    {key:'conformance',  label:'Conformance'},
    {key:'cert_currency',label:'Cert freshness'},
    {key:'doc_control',  label:'Doc control'},
  ];
  var domHtml = defs.map(function(d){
    var v   = domains[d.key] !== undefined ? Math.round(domains[d.key]) : null;
    var clr2= v !== null ? _cdScoreColor(v) : 'rgba(255,255,255,.35)';
    var pct = v !== null ? v : 0;
    return '<div class="cd-hs-dom">' +
      '<div class="cd-hs-dom-name">'+_cdEsc(d.label)+'</div>' +
      '<div class="cd-hs-dom-bar"><div class="cd-hs-dom-fill" style="width:'+pct+'%;background:'+clr2+'"></div></div>' +
      '<div class="cd-hs-dom-pct" style="color:'+clr2+'">'+( v !== null ? v : '—')+'</div>' +
      '</div>';
  }).join('');

  el.innerHTML =
    '<div class="cd-hs-num" style="color:'+clr+'">'+score+'</div>' +
    '<div class="cd-hs-lbl">Quality Health Score</div>' +
    '<div class="cd-hs-domains">'+domHtml+'</div>';
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
      select:'id,template_id,template_version,issued_at,workflow_templates(name)'
    });
    (certs||[]).forEach(function(c){
      var tmpl = c.workflow_templates ? c.workflow_templates.name : 'Unknown';
      var ver  = c.template_version || '—';
      items.push({ sev:100, sc:'var(--cd-red)', typeLabel:'Cert Invalidated',
        name: tmpl+' v'+ver,
        sub:  'Modified after cert · Release gate blocked',
        btns: [{cls:'cd-hbtn-r',l:'Re-certify',fn:'_s9DashOpenSimulator("'+c.template_id+'")'},{cls:'cd-hbtn-n',l:'Override',fn:'_cdOpenOverride("cert_invalidated","'+c.id+'","'+_cdEsc(tmpl)+' v'+ver+'")'}]
      });
    });
  } catch(e){}
  done();
  // Escalated MRBs
  try {
    var mrbs = await _cdQ('mrb_cases', { filters:[['firm_id','eq',firmId],['status','eq','escalated']], select:'id,ncmr_id,ncmrs(ncmr_number,material_value,days_on_hold)' });
    (mrbs||[]).forEach(function(m){
      var n = m.ncmrs || {};
      var val = n.material_value ? '$'+(n.material_value/1000).toFixed(1)+'K' : '—';
      items.push({ sev:85, sc:'var(--cd-amb)', typeLabel:'Material on Hold — Escalated',
        name: (n.ncmr_number||'NCMR')+' · MRB not convened',
        sub:  (n.days_on_hold||0)+'d on hold · '+val+' at risk',
        btns: [{cls:'cd-hbtn-a',l:'Convene MRB',fn:'_cdConveneMrb("'+m.id+'")'},{cls:'cd-hbtn-n',l:'View',fn:''}]
      });
    });
  } catch(e){}
  done();
  // Coverage gaps
  try {
    var paths = await _cdQ('bist_coverage_paths', { filters:[['firm_id','eq',firmId],['coverage_status','in','(uncovered,stale)']], select:'id,path_name,coverage_status,template_id,workflow_templates(name)' });
    if (paths && paths.length) {
      var byTmpl = {};
      paths.forEach(function(p){
        var n = p.workflow_templates ? p.workflow_templates.name : 'Template';
        if (!byTmpl[n]) byTmpl[n] = {uncovered:0,stale:0,id:p.template_id};
        if (p.coverage_status==='uncovered') byTmpl[n].uncovered++;
        else byTmpl[n].stale++;
      });
      Object.keys(byTmpl).forEach(function(n){
        var b = byTmpl[n];
        var tot = b.uncovered + b.stale;
        var detail = [];
        if (b.uncovered) detail.push(b.uncovered+' uncovered');
        if (b.stale)     detail.push(b.stale+' stale');
        items.push({ sev:55, sc:'var(--cd-amb)', typeLabel:'Coverage Gap',
          name: n,
          sub:  detail.join(' · ')+' routing paths without test scripts',
          btns: [{cls:'cd-hbtn-a',l:'Write Scripts',fn:'_s9DashOpenSimulator("'+b.id+'")'},{cls:'cd-hbtn-n',l:'View Coverage',fn:'_s9Switch("library")'}]
        });
      });
    }
  } catch(e){}
  done();
}

function _cdRenderHotQueue(items) {
  var countEl = document.getElementById('cd-hq-count');
  var labelEl = document.getElementById('cd-hq-label');
  var bodyEl  = document.getElementById('cd-hq-body');
  if (!bodyEl) return;
  if (!items.length) {
    if (countEl) { countEl.textContent='0 items'; countEl.style.color='var(--cd-grn)'; }
    if (labelEl) labelEl.style.color = 'var(--cd-grn)';
    bodyEl.innerHTML = '<div class="cd-hot-empty"><div class="cd-hot-empty-check">✓</div><div class="cd-hot-empty-text">All clear — no items requiring immediate action</div></div>';
    return;
  }
  if (countEl) { countEl.textContent=items.length+' item'+(items.length>1?'s':'')+' requiring action'; countEl.style.color='var(--cd-red)'; }
  bodyEl.innerHTML = items.map(function(item){
    var btns = item.btns.map(function(b){ return '<div class="cd-hbtn '+b.cls+'" onclick="'+b.fn+'">'+_cdEsc(b.l)+'</div>'; }).join('');
    return '<div class="cd-hot">' +
      '<div class="cd-hot-sev" style="background:'+item.sc+'"></div>' +
      '<div class="cd-hot-main">' +
        '<div class="cd-hot-type" style="color:'+item.sc+'">'+_cdEsc(item.typeLabel)+'</div>' +
        '<div class="cd-hot-name">'+_cdEsc(item.name)+'</div>' +
        '<div class="cd-hot-sub">'+_cdEsc(item.sub)+'</div>' +
      '</div>' +
      '<div class="cd-hot-acts">'+btns+'</div>' +
      '</div>';
  }).join('');
}

// ── Portfolio Certification Grid ──────────────────────────────────────────────
async function _cdLoadPortfolio(firmId) {
  try {
    var results = await Promise.all([
      _cdQ('workflow_templates', { filters:[['firm_id','eq',firmId]], select:'id,name,version,status,updated_at,created_at' }),
      _cdQ('bist_certificates', { filters:[['firm_id','eq',firmId]], order:'issued_at.desc', select:'id,status,template_id,template_version,issued_at,expires_at' }),
      _cdQ('bist_test_scripts', { filters:[['firm_id','eq',firmId]], select:'id,template_id,name' }),
      _cdQ('bist_coverage_paths', { filters:[['firm_id','eq',firmId]], select:'id,template_id,coverage_status' })
    ]);
    var tmpls   = results[0] || [];
    var certs   = results[1] || [];
    var scripts = results[2] || [];
    var paths   = results[3] || [];

    // Fetch runs via script_id join — bist_runs has no template_id
    var runs = [];
    if (scripts.length) {
      var scriptIds = scripts.map(function(s){ return s.id; }).join(',');
      try {
        runs = await API.get('bist_runs?firm_id=eq.'+firmId+'&script_id=in.('+scriptIds+')&order=run_at.desc&limit=200&select=id,status,run_at,script_id,steps_passed,steps_failed') || [];
      } catch(e) { runs = []; }
    }

    _cdRenderPortfolio(tmpls, certs, scripts, runs, paths);
  } catch(e) {
    console.warn('[CD] Portfolio load failed:', e);
    var el = document.getElementById('cd-port-grid');
    if (el) el.innerHTML = '<div style="grid-column:1/-1;padding:12px;font-size:11px;color:rgba(255,255,255,.4)">Portfolio unavailable — '+_cdEsc(e.message||'')+'</div>';
  }
}

function _cdRenderPortfolio(tmpls, certs, scripts, runs, paths) {
  var gridEl = document.getElementById('cd-port-grid'); if (!gridEl) return;
  var countEl= document.getElementById('cd-port-count');

  // Build lookup maps
  var certByTmpl = {};
  certs.forEach(function(c){ if (!certByTmpl[c.template_id]) certByTmpl[c.template_id] = c; });
  var scriptsByTmpl = {};
  // Also build script_id → template_id map for run joining
  var tmplByScriptId = {};
  scripts.forEach(function(s){
    if (!scriptsByTmpl[s.template_id]) scriptsByTmpl[s.template_id] = 0;
    scriptsByTmpl[s.template_id]++;
    tmplByScriptId[s.id] = s.template_id;
  });
  // Build runsByTmpl via script_id join
  var runsByTmpl = {};
  runs.forEach(function(r){
    var tmplId = r.template_id || tmplByScriptId[r.script_id];
    if (!tmplId) return;
    if (!runsByTmpl[tmplId]) runsByTmpl[tmplId] = [];
    runsByTmpl[tmplId].push(r);
  });
  var pathsByTmpl = {};
  paths.forEach(function(p){ if (!pathsByTmpl[p.template_id]) pathsByTmpl[p.template_id] = {total:0,covered:0}; pathsByTmpl[p.template_id].total++; if (p.coverage_status==='covered') pathsByTmpl[p.template_id].covered++; });

  if (!tmpls.length) {
    gridEl.innerHTML = '<div style="grid-column:1/-1;padding:24px;text-align:center;font-size:11px;color:rgba(255,255,255,.35)">No workflow templates yet. Create your first template in Library.</div>';
    if (countEl) countEl.textContent = '0 templates';
    return;
  }

  if (countEl) countEl.textContent = tmpls.length+' template'+(tmpls.length>1?'s':'');

  gridEl.innerHTML = tmpls.map(function(t){
    var cert   = certByTmpl[t.id] || null;
    var tmplRuns = runsByTmpl[t.id] || [];
    var tmplPaths= pathsByTmpl[t.id] || {total:0,covered:0};
    var scriptCt = scriptsByTmpl[t.id] || 0;
    var lastRun  = tmplRuns[0] || null;
    var passCt   = tmplRuns.filter(function(r){ return r.status==='passed'; }).length;
    var failCt   = tmplRuns.filter(function(r){ return r.status==='failed'; }).length;

    // Coverage
    var covPct = tmplPaths.total > 0 ? Math.round((tmplPaths.covered / tmplPaths.total)*100) : 0;
    var covClr = covPct >= 80 ? 'var(--cd-grn)' : covPct >= 40 ? 'var(--cd-amb)' : 'var(--cd-red)';
    if (!tmplPaths.total) { covPct = 0; covClr = '#4a5568'; }

    // Status
    var statusCls, statusPillCls, statusLabel;
    if (!cert || cert.status === 'revoked') {
      if (scriptCt === 0) {
        statusCls = 'wf-uncov'; statusPillCls = 'cd-pill-uncov'; statusLabel = 'Not Covered';
      } else {
        statusCls = 'wf-uncov'; statusPillCls = 'cd-pill-uncov'; statusLabel = 'Uncertified';
      }
    } else if (cert.status === 'invalidated') {
      statusCls = 'wf-fail';  statusPillCls = 'cd-pill-fail';  statusLabel = 'Cert Invalid';
    } else {
      // valid cert — check age
      var age = _cdDaysAgo(cert.issued_at) || 0;
      var thresh = 30;
      if (age > thresh) {
        statusCls = 'wf-stale'; statusPillCls = 'cd-pill-stale'; statusLabel = 'Cert Stale';
      } else {
        statusCls = 'wf-cert'; statusPillCls = 'cd-pill-cert'; statusLabel = 'Certified';
      }
    }

    // Suite line
    var suiteLine = scriptCt
      ? passCt+' passing · '+failCt+' failing · '+scriptCt+' script'+(scriptCt>1?'s':'')
      : '0 scripts — no test coverage';

    // Cert date
    var certDateLine = cert && cert.issued_at
      ? 'Cert issued ' + _cdRelTime(cert.issued_at)
      : 'Never certified';

    // Last run
    var lastRunLine = lastRun
      ? 'Last run '+_cdRelTime(lastRun.run_at)
      : 'Never run';

    // Action buttons
    var actBtns;
    if (statusCls === 'wf-fail') {
      actBtns =
        '<div class="cd-wf-btn" onclick="event.stopPropagation()">View failure</div>' +
        '<div class="cd-wf-btn danger" onclick="event.stopPropagation();_s9DashOpenSimulator(\''+t.id+'\')">Re-certify</div>' +
        '<div class="cd-wf-btn" onclick="event.stopPropagation();_cdConveneMrb(\''+t.id+'\')">Convene MRB</div>';
    } else if (statusCls === 'wf-uncov') {
      actBtns = '<div class="cd-wf-btn primary" onclick="event.stopPropagation();_s9DashOpenSimulator(\''+t.id+'\')">Write test scripts →</div>';
    } else if (statusCls === 'wf-stale') {
      actBtns =
        '<div class="cd-wf-btn" onclick="event.stopPropagation()">View history</div>' +
        '<div class="cd-wf-btn primary" onclick="event.stopPropagation();_s9DashOpenSimulator(\''+t.id+'\')">Re-certify</div>';
    } else {
      actBtns =
        '<div class="cd-wf-btn" onclick="event.stopPropagation()">View cert</div>' +
        '<div class="cd-wf-btn" onclick="event.stopPropagation();_s9DashOpenSimulator(\''+t.id+'\')">Run suite</div>' +
        '<div class="cd-wf-btn primary" onclick="event.stopPropagation();_s9DashOpenSimulator(\''+t.id+'\')">Simulate</div>';
    }

    return '<div class="cd-wf '+statusCls+'" onclick="_s9DashOpenSimulator(\''+t.id+'\')">' +
      '<div class="cd-wf-hdr">' +
        '<div><div class="cd-wf-name">'+_cdEsc(t.name)+'</div><div class="cd-wf-ver">v'+_cdEsc(t.version||'—')+' · '+_cdEsc(t.status||'draft')+'</div></div>' +
        '<span class="cd-pill '+statusPillCls+'">'+statusLabel+'</span>' +
      '</div>' +
      '<div class="cd-wf-cov">' +
        '<div class="cd-cov-bar"><div class="cd-cov-fill" style="width:'+covPct+'%;background:'+covClr+'"></div></div>' +
        '<div class="cd-cov-pct" style="color:'+covClr+'">'+covPct+'%</div>' +
        '<div class="cd-cov-suite cd-t2">'+_cdEsc(suiteLine)+'</div>' +
      '</div>' +
      '<div class="cd-wf-dates"><span class="cd-wf-date">'+_cdEsc(certDateLine)+'</span><span class="cd-wf-date">'+_cdEsc(lastRunLine)+'</span></div>' +
      '<div class="cd-wf-acts">'+actBtns+'</div>' +
      '</div>';
  }).join('');
}

// ── Request Queue ─────────────────────────────────────────────────────────────
async function _cdLoadRequestQueue(firmId) {
  try {
    var tmpls = await _cdQ('workflow_templates', { filters:[['firm_id','eq',firmId],['status','eq','draft']], select:'id,name,version,status,updated_at' });
    _cdRenderRequestQueue(tmpls||[]);
  } catch(e) {
    var el = document.getElementById('cd-rq-body');
    if (el) el.innerHTML = '<div style="padding:10px 12px;font-size:10px;color:rgba(255,255,255,.35)">Request queue unavailable</div>';
  }
}

function _cdRenderRequestQueue(tmpls) {
  var countEl = document.getElementById('cd-rq-count');
  var bodyEl  = document.getElementById('cd-rq-body');
  if (!bodyEl) return;
  if (countEl) countEl.textContent = tmpls.length ? tmpls.length+' pending' : '0';
  if (!tmpls.length) {
    bodyEl.innerHTML = '<div style="padding:10px 12px;font-size:10px;color:var(--cd-grn);font-family:var(--font-mono,\'Courier New\',monospace)">No pending requests</div>';
    return;
  }
  bodyEl.innerHTML = tmpls.map(function(t){
    return '<div class="cd-rq">' +
      '<div class="cd-rq-badge">DRAFT</div>' +
      '<div class="cd-rq-body">' +
        '<div class="cd-rq-name">'+_cdEsc(t.name)+'</div>' +
        '<div class="cd-rq-from">v'+_cdEsc(t.version||'—')+' · '+_cdRelTime(t.updated_at)+'</div>' +
        '<div class="cd-rq-acts">' +
          '<div class="cd-rq-btn" onclick="_s9DashOpenSimulator(\''+t.id+'\')">Run Cert</div>' +
          '<div class="cd-rq-btn">Archive</div>' +
        '</div>' +
      '</div>' +
      '</div>';
  }).join('');
}

// ── CoC Feed ─────────────────────────────────────────────────────────────────
async function _cdLoadCoc(firmId) {
  try {
    var events = await _cdQ('coc_events', { filters:[['firm_id','eq',firmId]], order:'created_at.desc', limit:20, select:'id,entity_type,event_type,actor_name,actor_resource_id,metadata,event_class,severity,created_at' });
    _cdRenderCoc(events||[]);
  } catch(e) {
    var el = document.getElementById('cd-coc-body');
    if (el) el.innerHTML = '<div style="padding:10px 12px;font-size:10px;color:rgba(255,255,255,.35)">CoC feed unavailable</div>';
  }
}

function _cdRenderCoc(events) {
  var bodyEl  = document.getElementById('cd-coc-body');
  var countEl = document.getElementById('cd-coc-count');
  if (!bodyEl) return;
  var dotMap = {
    'cert.issued':'var(--cd-grn)','cert.invalidated':'var(--cd-amb)','template.released':'var(--cd-grn)',
    'template.created':'var(--cd-teal)','template.updated':'var(--cd-teal)','template.archived':'rgba(255,255,255,.35)',
    'health.score.calculated':'rgba(255,255,255,.35)','mrb.escalated':'var(--cd-amb)',
    'training.assigned':'var(--cd-teal)','training.completed':'var(--cd-grn)',
    'work.delegated':'var(--cd-teal)','override.applied':'var(--cd-amb)',
    'form.saved':'var(--cd-teal)','form.state_changed':'var(--cd-teal)','form.submitted':'var(--cd-grn)',
    'instance.started':'var(--cd-teal)','instance.completed':'var(--cd-grn)','instance.cancelled':'rgba(255,255,255,.35)',
    'step.completed':'var(--cd-grn)','step.approved':'var(--cd-grn)','step.rejected':'var(--cd-amb)',
  };
  var labMap = {
    'cert.issued':'certified','cert.invalidated':'cert invalidated','template.released':'released',
    'template.created':'created','template.updated':'updated','template.archived':'archived',
    'health.score.calculated':'health score calculated','mrb.escalated':'MRB escalated',
    'training.assigned':'assigned training','training.completed':'completed training',
    'work.delegated':'delegated','override.applied':'applied override',
    'form.saved':'saved','form.state_changed':'updated','form.submitted':'submitted',
    'instance.started':'started','instance.completed':'completed','instance.cancelled':'cancelled',
    'step.completed':'completed step in','step.approved':'approved step in','step.rejected':'rejected step in',
  };
  function _cdActorLabel(e) {
    if (!e.actor_name || e.actor_name === 'System') return null;
    var cu = window.CURRENT_USER;
    if (cu && (e.actor_name === cu.name || e.actor_name === (cu.first_name+' '+cu.last_name).trim())) return 'You';
    return e.actor_name.split(' ')[0];
  }
  function _cdEntityLabel(entityType) {
    if (!entityType) return '';
    return entityType.replace(/_/g,' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
  }

  if (countEl) {
    var cu = window.CURRENT_USER;
    var myEvents = cu ? events.filter(function(e){ return e.actor_name && (e.actor_name===cu.name||e.actor_name===(cu.first_name+' '+cu.last_name).trim()); }).length : 0;
    countEl.textContent = myEvents ? myEvents+' mine · CoC recorded' : 'CoC recorded';
  }
  if (!events.length) {
    bodyEl.innerHTML = '<div style="padding:10px 12px;font-size:10px;color:rgba(255,255,255,.35)">No recent CoC events</div>';
    return;
  }

  bodyEl.innerHTML = events.map(function(e){
    var dot     = dotMap[e.event_type] || 'rgba(255,255,255,.35)';
    var pay     = e.metadata || {};
    var actor   = _cdActorLabel(e);
    var aStr    = actor ? '<strong>'+_cdEsc(actor)+'</strong> ' : '';
    var desc    = '';
    if      (e.event_type==='cert.issued')          desc = aStr+'certified <strong>'+_cdEsc(pay.template||e.entity_type||'workflow')+'</strong>'+(pay.version?' v'+_cdEsc(pay.version):'');
    else if (e.event_type==='cert.invalidated')     desc = '<strong>Cert invalidated</strong> — '+_cdEsc(pay.template||e.entity_type||'');
    else if (e.event_type==='template.released')    desc = aStr+'released <strong>'+_cdEsc(pay.template||e.entity_type||'')+'</strong>'+(pay.version?' v'+_cdEsc(pay.version):'');
    else if (e.event_type==='override.applied')     desc = aStr+'applied override on <strong>'+_cdEsc(pay.label||e.entity_type||'item')+'</strong>';
    else if (e.event_type==='form.saved'||e.event_type==='form.submitted') desc = aStr+_cdEsc(labMap[e.event_type]||'saved')+' <strong>'+_cdEsc(pay.form_name||pay.name||_cdEntityLabel(e.entity_type))+'</strong>';
    else if (e.event_type==='instance.started'||e.event_type==='instance.completed'||e.event_type==='instance.cancelled') desc = aStr+_cdEsc(labMap[e.event_type]||'')+' <strong>'+_cdEsc(pay.template||pay.name||_cdEntityLabel(e.entity_type))+'</strong>';
    else if (e.event_type==='step.completed'||e.event_type==='step.approved'||e.event_type==='step.rejected') desc = aStr+_cdEsc(labMap[e.event_type]||'')+' <strong>'+_cdEsc(pay.step||pay.name||_cdEntityLabel(e.entity_type))+'</strong>';
    else {
      var verb = (labMap[e.event_type]||e.event_type.replace(/[._]/g,' ')).toLowerCase();
      var obj  = pay.template||pay.name||pay.form_name||_cdEntityLabel(e.entity_type)||'';
      desc = aStr+_cdEsc(verb)+(obj?(' <strong>'+_cdEsc(obj)+'</strong>'):'');
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
  if (evt.target === document.getElementById('cd-override-modal')) document.getElementById('cd-override-modal').classList.remove('open');
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
  var _firmId = (window.CURRENT_FIRM && window.CURRENT_FIRM.id) || window._s9FirmId || null;
  API.post('coc_events', {
    firm_id: _firmId, entity_type: 'bist_certificate', entity_id: _cdOverrideCtx.entityId,
    event_type: 'override.applied', actor_name: (window.CURRENT_USER && window.CURRENT_USER.name) || 'Unknown',
    actor_resource_id: (window.CURRENT_USER && window.CURRENT_USER.resource_id) || null,
    metadata: {reason:_cdOverrideCtx.reason, label:_cdOverrideCtx.label, rationale:ra.trim()},
    event_class: 'governance', severity: 'warning', occurred_at: new Date().toISOString()
  }).then(function(){ _cdCloseOverlayBtn(); }).catch(function(){ _cdCloseOverlayBtn(); });
}