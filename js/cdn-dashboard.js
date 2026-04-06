// ══════════════════════════════════════════════════════════════════════════════
// cdn-dashboard.js  ·  v20260406-CD11
// CadenceHUD — composite dashboard
// KPI strip (heatmap in last cell) | left: trend + run log | right: health monitor
// ══════════════════════════════════════════════════════════════════════════════

/* global API, _s9Switch, _s9WaitForFirmId, _s9DashOpenSimulator */

console.log('%c[cdn-dashboard] v20260406-CD11 — composite dashboard','background:#1e6a7a;color:#fff;font-weight:700;padding:2px 8px;border-radius:3px');

// ── Inject CSS ─────────────────────────────────────────────────────────────────
(function() {
  if (document.getElementById('cdn-dashboard-css')) return;
  var s = document.createElement('style'); s.id='cdn-dashboard-css';
  s.textContent = ''
    + ':root{--cd-grn:#3de08a;--cd-grn2:rgba(61,224,138,.13);--cd-amb:#f5c842;--cd-amb2:rgba(245,200,66,.14);--cd-red:#e84040;--cd-red2:rgba(232,64,64,.14);--cd-teal:#5fd4c8;--cd-blue:#60a5fa;--cd-pur:#a78bfa}\n'
    + '.cd-brief{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;background:#080a0f;font-family:Arial,sans-serif}\n'
    + '.cd-kpi-strip{display:flex;border-bottom:1px solid #1e2535;flex-shrink:0;background:#0d1017}\n'
    + '.cd-kpi{flex:1;padding:9px 13px;border-right:1px solid #1e2535;display:flex;flex-direction:column;gap:2px;cursor:default}\n'
    + '.cd-kpi:last-child{border-right:none}\n'
    + '.cd-kpi.wide{flex:1.5;min-width:0}\n'
    + '.cd-kpi-lbl{font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--cd-teal)}\n'
    + '.cd-kpi-val{font-size:18px;font-weight:700;font-family:var(--font-mono,"Courier New",monospace)}\n'
    + '.cd-kpi-sub{font-size:9px;color:rgba(255,255,255,.45)}\n'
    + '.cd-kpi-delta{font-size:9px;font-weight:700}\n'
    + '.cd-kpi.active{background:rgba(95,212,200,.06);border-bottom:2px solid var(--cd-teal)}\n'
    + '.cd-hm-top{display:flex;align-items:center;justify-content:space-between}\n'
    + '.cd-hm-grid{display:flex;gap:2px;margin-top:5px}\n'
    + '.cd-hm-week{display:flex;flex-direction:column;gap:2px}\n'
    + '.cd-hm-day{width:9px;height:9px;border-radius:1px;cursor:pointer;transition:transform .1s}\n'
    + '.cd-hm-day:hover{transform:scale(1.5);z-index:10;position:relative}\n'
    + '.cd-hm-legend{display:flex;align-items:center;gap:5px;margin-top:5px}\n'
    + '.cd-hl-dot{width:7px;height:7px;border-radius:1px;flex-shrink:0}\n'
    + '.cd-hl-lbl{font-size:8px;color:rgba(255,255,255,.4)}\n'
    + '.cd-view-bar{display:flex;align-items:center;gap:6px;padding:7px 14px;background:#0b0e17;border-bottom:1px solid #1e2535;flex-shrink:0}\n'+ '.cd-vbtn{font-size:10px;font-weight:700;letter-spacing:.06em;padding:4px 12px;border-radius:4px;border:1px solid rgba(255,255,255,.12);background:transparent;color:rgba(255,255,255,.4);cursor:pointer;transition:all .15s}\n'+ '.cd-vbtn.active{background:var(--cad,#00c9c9);border-color:var(--cad,#00c9c9);color:#003333}\n'+ '.cd-vbtn:hover:not(.active){border-color:rgba(255,255,255,.25);color:rgba(255,255,255,.7)}\n'+ '.cd-view-hint{margin-left:auto;font-size:9px;color:rgba(255,255,255,.3);letter-spacing:.04em}\n'
    + '.cd-wf{background:#0d1017;border:1px solid #1e2535;border-radius:6px;padding:11px 14px;cursor:pointer;transition:border-color .15s}\n'
    + '.cd-wf:hover{border-color:#2e3a52}\n'
    + '.cd-wf.wf-fail{border-left:3px solid var(--cd-red)}\n'
    + '.cd-wf.wf-stale{border-left:3px solid var(--cd-amb)}\n'
    + '.cd-wf.wf-uncov{border-left:3px solid #4a5568}\n'
    + '.cd-wf.wf-cert{border-left:3px solid var(--cd-grn)}\n'
    + '.cd-wf-hdr{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:7px}\n'
    + '.cd-wf-name{font-size:13pt;font-weight:700;color:#ffffff;font-family:Arial,sans-serif}\n'
    + '.cd-wf-ver{font-size:12pt;color:rgba(255,255,255,.7);margin-top:2px;font-family:Arial,sans-serif}\n'
    + '.cd-pill{font-size:11pt;font-weight:700;padding:3px 10px;border-radius:10px;letter-spacing:.04em;flex-shrink:0;font-family:Arial,sans-serif}\n'
    + '.cd-pill-cert{background:rgba(95,212,100,.15);color:var(--cd-grn);border:1px solid rgba(95,212,100,.3)}\n'
    + '.cd-pill-fail{background:rgba(220,60,60,.15);color:var(--cd-red);border:1px solid rgba(220,60,60,.3)}\n'
    + '.cd-pill-stale{background:rgba(240,180,0,.12);color:var(--cd-amb);border:1px solid rgba(240,180,0,.25)}\n'
    + '.cd-pill-uncov{background:rgba(255,255,255,.05);color:rgba(255,255,255,.4);border:1px solid rgba(255,255,255,.1)}\n'
    + '.cd-wf-cov{display:flex;align-items:center;gap:8px;margin-bottom:6px}\n'
    + '.cd-cov-bar{flex:1;height:4px;background:#1e2535;border-radius:2px;overflow:hidden}\n'
    + '.cd-cov-fill{height:100%;border-radius:2px;transition:width .3s}\n'
    + '.cd-cov-pct{font-size:14pt;font-weight:700;min-width:40px;text-align:right;font-family:monospace}\n'
    + '.cd-cov-suite{font-size:12pt;color:rgba(255,255,255,.75);white-space:nowrap;font-family:Arial,sans-serif}\n'
    + '.cd-wf-dates{display:flex;gap:14px;margin-bottom:8px}\n'
    + '.cd-wf-date{font-size:12pt;color:rgba(255,255,255,.65);font-family:Arial,sans-serif}\n'
    + '.cd-wf-acts{display:flex;gap:6px;flex-wrap:wrap}\n'
    + '.cd-wf-expand{padding:0 2px}\n'
    + '.cd-wf button.cd-wf-btn{font-size:12pt;font-weight:600;padding:4px 11px;border-radius:4px;border:1px solid rgba(255,255,255,.25);background:transparent;color:rgba(255,255,255,.85);cursor:pointer;font-family:Arial,sans-serif}\n'
    + '.cd-wf button.cd-wf-btn:hover{border-color:rgba(255,255,255,.5);color:#ffffff;background:rgba(255,255,255,.06)}\n'
    + '.cd-wf button.cd-wf-btn.primary{background:rgba(0,201,201,.12);border-color:rgba(0,201,201,.4);color:var(--cad,#00c9c9)}\n'
    + '.cd-wf button.cd-wf-btn.danger{background:rgba(220,60,60,.12);border-color:rgba(220,60,60,.35);color:var(--cd-red)}\n'
    + '.cd-wf-btn{font-size:10px;font-weight:600;padding:3px 10px;border-radius:4px;border:1px solid rgba(255,255,255,.15);background:transparent;color:rgba(255,255,255,.55);cursor:pointer;letter-spacing:.03em}\n'
    + '.cd-wf-btn:hover{border-color:rgba(255,255,255,.3);color:rgba(255,255,255,.85)}\n'
    + '.cd-wf-btn.primary{background:rgba(0,201,201,.12);border-color:rgba(0,201,201,.4);color:var(--cad,#00c9c9)}\n'
    + '.cd-wf-btn.danger{background:rgba(220,60,60,.12);border-color:rgba(220,60,60,.35);color:var(--cd-red)}\n'
    + '.cd-port-count{font-size:9px;color:rgba(255,255,255,.35);margin-bottom:8px;letter-spacing:.06em;text-transform:uppercase}\n'+ '.cd-controls{display:flex;align-items:center;padding:5px 14px;gap:10px;background:#0d1017;border-bottom:1px solid #1e2535;flex-shrink:0;flex-wrap:wrap}\n'
    + '.cd-ctrl-lbl{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.35)}\n'
    + '.cd-range-btn{padding:2px 7px;border-radius:3px;font-size:9px;font-weight:700;cursor:pointer;border:1px solid #252d3f;color:rgba(255,255,255,.4);background:transparent}\n'
    + '.cd-range-btn.active,.cd-range-btn:hover{background:#161b28;border-color:var(--cd-teal);color:var(--cd-teal)}\n'
    + '.cd-ctrl-div{width:1px;height:16px;background:#1e2535}\n'
    + '.cd-fp{display:flex;align-items:center;gap:3px;padding:2px 8px;border-radius:8px;font-size:9px;cursor:pointer;border:1px solid;font-weight:700}\n'
    + '.cd-body{flex:1;display:flex;overflow:hidden}\n'
    + '.cd-left{flex:1;display:flex;flex-direction:column;overflow:hidden;border-right:1px solid #1e2535}\n'
    + '.cd-scroll{flex:1;overflow-y:auto}\n'
    + '.cd-scroll::-webkit-scrollbar{width:3px}\n'
    + '.cd-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.07)}\n'
    + '.cd-chart-sec{padding:12px 14px;border-bottom:1px solid #1e2535}\n'
    + '.cd-chart-hdr{display:flex;align-items:center;margin-bottom:8px}\n'
    + '.cd-chart-title{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--cd-teal)}\n'
    + '.cd-legend{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap}\n'
    + '.cd-li{display:flex;align-items:center;gap:3px;font-size:9px;color:rgba(255,255,255,.4)}\n'
    + '.cd-lline{width:14px;height:2px;border-radius:1px}\n'
    + '.cd-ldot{width:6px;height:6px;border-radius:50%}\n'
    + '.cd-log-hdr{display:grid;grid-template-columns:minmax(160px,2fr) 100px 68px 80px 58px 110px 80px;padding:7px 16px;background:#111520;border-bottom:1px solid #1e2535;position:sticky;top:0;z-index:5}\n'
    + '.cd-lh{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--cd-teal)}\n'
    + '.cd-log-row{display:grid;grid-template-columns:minmax(160px,2fr) 100px 68px 80px 58px 110px 80px;padding:8px 16px;border-bottom:1px solid rgba(255,255,255,.04);align-items:center;cursor:pointer;transition:background .1s}\n'
    + '.cd-log-row:hover{background:#111520}\n'
    + '.cd-lc{font-size:10px;color:rgba(255,255,255,.4);font-family:var(--font-mono,"Courier New",monospace)}\n'
    + '.cd-lc-main{font-size:10px;color:#e2e8f0}\n'
    + '.cd-sp{display:inline-flex;align-items:center;padding:2px 6px;border-radius:3px;font-size:9px;font-weight:700}\n'
    + '.cd-sp-pass{background:var(--cd-grn2);color:var(--cd-grn);border:1px solid rgba(61,224,138,.4)}\n'
    + '.cd-sp-fail{background:var(--cd-red2);color:var(--cd-red);border:1px solid rgba(232,64,64,.4)}\n'
    + '.cd-mini-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}\n'
    + '.cd-badge{display:inline-flex;padding:2px 6px;border-radius:3px;font-size:9px;font-weight:700}\n'
    + '.cd-badge-cert{background:var(--cd-grn2);color:var(--cd-grn);border:1px solid rgba(61,224,138,.3)}\n'
    + '.cd-badge-stale{background:var(--cd-amb2);color:var(--cd-amb);border:1px solid rgba(245,200,66,.3)}\n'
    + '.cd-right{width:450px;flex-shrink:0;display:flex;flex-direction:column;background:#080a0f;position:relative;min-width:220px;max-width:500px}\n'    + '.cd-resize-handle-line{position:absolute;left:0;top:0;bottom:0;width:1px;background:rgba(95,212,200,.25);pointer-events:none;transition:background .15s}\n'    + '#cd-resize-handle:hover .cd-resize-handle-line{background:rgba(95,212,200,.6)}\n'
    + '.cd-hm-topbar{display:flex;align-items:center;padding:6px 12px;background:#0d1017;border-bottom:1px solid #1e2535;flex-shrink:0;gap:7px}\n'
    + '.cd-hm-badge{font-size:9px;font-weight:700;letter-spacing:.07em;color:var(--cd-teal);background:rgba(95,212,200,.1);border:1px solid rgba(95,212,200,.25);padding:2px 7px;border-radius:3px}\n'
    + '.cd-hm-title{font-size:11px;font-weight:700;color:#e2e8f0;flex:1}\n'
    + '.cd-hm-counts{display:flex;gap:8px;font-size:9px;color:rgba(255,255,255,.4)}\n'
    + '.cd-sum-dot{width:6px;height:6px;border-radius:50%;display:inline-block;margin-right:2px}\n'
    + '.cd-start-btn{font-size:10px;font-weight:700;padding:4px 11px;border-radius:3px;border:none;background:#1d9e75;color:#fff;cursor:pointer;white-space:nowrap}\n'
    + '.cd-start-btn:hover{background:#259e79}\n'
    + '.cd-start-btn:disabled{background:#1e2535;color:rgba(255,255,255,.3);cursor:default}\n'
    + '.cd-reset-btn{font-size:10px;padding:4px 7px;border-radius:3px;border:1px solid #252d3f;background:transparent;color:rgba(255,255,255,.4);cursor:pointer}\n'
    + '.cd-hm-col-hdr{display:grid;grid-template-columns:14px 1fr 110px 54px;padding:6px 14px;border-bottom:1px solid #1e2535;background:#111520;flex-shrink:0}\n'
    + '.cd-hc{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.3)}\n'
    + '.cd-hm-rows{flex:1;overflow-y:auto}\n'
    + '.cd-hm-rows::-webkit-scrollbar{width:2px}\n'
    + '.cd-hm-rows::-webkit-scrollbar-thumb{background:rgba(255,255,255,.07)}\n'
    + '.cd-hm-row{display:grid;grid-template-columns:14px 1fr 110px 54px;align-items:center;padding:9px 14px;border-bottom:1px solid rgba(255,255,255,.04);cursor:default}\n'
    + '.cd-hm-row:hover{background:rgba(255,255,255,.02)}\n'
    + '.cd-type-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}\n'
    + '.cd-r-name{font-size:11px;color:#e2e8f0;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:12px}\n'
    + '.cd-bar-wrap{height:6px;background:#1a1f2e;border-radius:2px;overflow:hidden;position:relative}\n'
    + '.cd-bar-fill{position:absolute;top:0;left:0;height:100%;border-radius:2px;transition:width .08s linear}\n'
    + '.cd-r-result{font-size:10px;font-weight:700;text-align:right;font-family:var(--font-mono,"Courier New",monospace)}\n'
    + '.cd-st-idle{color:rgba(255,255,255,.2)}.cd-st-run{color:var(--cd-amb)}.cd-st-pass{color:var(--cd-grn)}.cd-st-fail{color:var(--cd-red)}\n'
    + '.cd-hm-tip{display:none;position:fixed;z-index:9999;width:286px;background:#131820;border:1px solid #252d3f;border-radius:4px;pointer-events:none;box-shadow:0 10px 36px rgba(0,0,0,.85)}\n'
    + '.cd-hm-tip-hdr{padding:8px 11px;border-bottom:1px solid #1e2535;display:flex;align-items:center;justify-content:space-between}\n'
    + '.cd-hm-tip-name{font-size:11px;font-weight:700;color:#e2e8f0}\n'
    + '.cd-hm-tip-badge{font-size:9px;font-weight:700;padding:2px 6px;border-radius:2px}\n'
    + '.cd-tb-pass{background:rgba(29,158,117,.15);color:var(--cd-grn);border:1px solid rgba(29,158,117,.3)}\n'
    + '.cd-tb-fail{background:var(--cd-red2);color:var(--cd-red);border:1px solid rgba(232,64,64,.28)}\n'
    + '.cd-tb-run{background:rgba(245,200,66,.12);color:var(--cd-amb);border:1px solid rgba(245,200,66,.25)}\n'
    + '.cd-tb-idle{background:rgba(255,255,255,.06);color:rgba(255,255,255,.4);border:1px solid rgba(255,255,255,.1)}\n'
    + '.cd-hm-ts{padding:7px 11px;display:flex;flex-direction:column;gap:0}\n'
    + '.cd-ts{padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05);display:flex;flex-direction:column;gap:3px}\n'
    + '.cd-ts:last-child{border-bottom:none}\n'
    + '.cd-ts-row{display:flex;align-items:center;justify-content:space-between;gap:6px}\n'
    + '.cd-ts-name{font-size:10px;color:#e2e8f0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n'
    + '.cd-ts-dur{font-size:9px;color:rgba(255,255,255,.35);flex-shrink:0}\n'
    + '.cd-ts-st{font-size:10px;font-weight:700;flex-shrink:0}\n'
    + '.cd-ts-pass{color:var(--cd-grn)}.cd-ts-fail{color:var(--cd-red)}.cd-ts-pend{color:rgba(255,255,255,.25)}.cd-ts-run{color:var(--cd-amb)}\n'
    + '.cd-ts-fail-block{background:rgba(232,64,64,.07);border-left:2px solid var(--cd-red);padding:4px 7px;border-radius:0 2px 2px 0;margin-top:2px}\n'
    + '.cd-ts-fail-step{font-size:9px;color:rgba(255,255,255,.5);margin-bottom:2px}\n'
    + '.cd-ts-fail-step b{color:var(--cd-red)}\n'
    + '.cd-ts-fail-msg{font-size:9px;color:rgba(255,255,255,.35);line-height:1.4}\n'
    + '.cd-tip-empty{padding:12px;font-size:10px;color:rgba(255,255,255,.3);text-align:center}\n'
    + '.cd-tip-footer{padding:5px 11px;border-top:1px solid #1e2535;display:flex;justify-content:space-between;font-size:9px;color:rgba(255,255,255,.3)}\n'
    + '#cd-kpi-tooltip{display:none;position:fixed;z-index:9999;min-width:220px;max-width:280px;background:#1a1f2e;border:1px solid rgba(255,255,255,.14);border-radius:4px;padding:10px 12px;pointer-events:none;box-shadow:0 8px 28px rgba(0,0,0,.7)}\n'
    + '#cd-kpi-tooltip .ct-title{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--cd-teal);font-family:var(--font-mono,"Courier New",monospace);margin-bottom:7px}\n'
    + '#cd-kpi-tooltip .ct-row{display:flex;justify-content:space-between;gap:12px;font-size:11px;color:rgba(255,255,255,.65);padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)}\n'
    + '#cd-kpi-tooltip .ct-row:last-of-type{border-bottom:none}\n'
    + '#cd-kpi-tooltip .ct-row span:last-child{color:#fff;font-weight:600;text-align:right;max-width:130px}\n'
    + '#cd-kpi-tooltip .ct-formula{font-size:10px;color:rgba(255,255,255,.4);margin-top:7px;line-height:1.55;border-top:1px solid rgba(255,255,255,.06);padding-top:7px}\n'
    + '@keyframes cd-shimmer{0%,100%{opacity:.35}50%{opacity:.7}}\n'
    + '.cd-skel{background:#1a1f2e;border-radius:3px;animation:cd-shimmer 1.4s ease-in-out infinite}\n'
    + '.cd-grn{color:var(--cd-grn)} .cd-amb{color:var(--cd-amb)} .cd-red{color:var(--cd-red)} .cd-t2{color:rgba(255,255,255,.45)}\n'
    // Typography rules
    + '.cd-brief *{font-family:Arial,sans-serif}\n'
    + '.cd-brief .cd-kpi-lbl,.cd-brief .cd-ctrl-lbl,.cd-brief .cd-lh,.cd-brief .cd-hm-badge,.cd-brief .cd-hc{font-size:10px!important;color:var(--cd-teal);font-weight:700;letter-spacing:.08em}\n'
    + '.cd-brief .cd-kpi-val{font-size:18px!important;font-family:var(--font-mono,"Courier New",monospace)!important}\n'
    + '.cd-brief .cd-kpi-sub,.cd-brief .cd-kpi-delta{font-size:12px!important}\n'
    + '.cd-brief .cd-lc,.cd-brief .cd-lc-main,.cd-brief .cd-r-result{font-size:12px!important}\n'
    + '.cd-brief .cd-r-name,.cd-brief .cd-hm-title{font-size:12px!important}\n'
    + '.cd-brief .cd-lc{font-family:var(--font-mono,"Courier New",monospace)!important;font-size:12px!important}\n'
    + '.cd-brief .cd-sp{font-size:11px!important}\n'
    + '.cd-brief .cd-hl-lbl{font-size:9px!important}\n'
    + '.cd-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;z-index:9000}\n'
    + '.cd-overlay.open{display:flex}\n'
    + '.cd-modal{background:#0d1017;border:1px solid #252d3f;border-radius:6px;width:440px;overflow:hidden}\n'
    + '.cd-modal-hdr{padding:12px 14px;border-bottom:1px solid #1e2535;display:flex;align-items:center;gap:7px}\n'
    + '.cd-modal-title{font-size:13px;font-weight:700;color:#e2e8f0;flex:1}\n'
    + '.cd-modal-close{font-size:14px;color:rgba(255,255,255,.4);cursor:pointer;padding:2px 6px;border-radius:3px}\n'
    + '.cd-modal-body{padding:14px}\n'
    + '.cd-modal-warn{background:rgba(192,64,74,.08);border:1px solid rgba(192,64,74,.2);border-radius:4px;padding:10px 12px;font-size:12px;color:rgba(255,255,255,.6);line-height:1.6;margin-bottom:12px}\n'
    + '.cd-modal-warn strong{color:var(--cd-red)}\n'
    + '.cd-modal-lbl{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.45);font-family:var(--font-mono,"Courier New",monospace);margin-bottom:5px}\n'
    + '.cd-modal-ta{width:100%;background:#080a0f;border:1px solid #1e2535;border-radius:4px;color:#e2e8f0;font-family:var(--font-mono,"Courier New",monospace);font-size:12px;padding:8px 10px;resize:vertical;min-height:64px;outline:none}\n'
    + '.cd-modal-note{font-size:10px;color:rgba(255,255,255,.4);font-family:var(--font-mono,"Courier New",monospace);margin-top:7px;padding:6px 10px;background:#080a0f;border-radius:3px;line-height:1.5}\n'
    + '.cd-modal-note span{color:var(--cd-teal)}\n'
    + '.cd-modal-ftr{padding:10px 14px;border-top:1px solid #1e2535;display:flex;gap:8px;justify-content:flex-end}\n'
  ;
  document.head.appendChild(s);
})();

// ── Singletons ────────────────────────────────────────────────────────────────
(function(){
  if(!document.getElementById('cd-kpi-tooltip')){var e=document.createElement('div');e.id='cd-kpi-tooltip';document.body.appendChild(e);}
  if(!document.getElementById('cd-hm-tip')){var t=document.createElement('div');t.id='cd-hm-tip';t.className='cd-hm-tip';document.body.appendChild(t);}
  if(!document.getElementById('cd-override-modal')){
    var d=document.createElement('div');
    d.innerHTML='<div class="cd-overlay" id="cd-override-modal" onclick="_cdCloseOverlay(event)"><div class="cd-modal"><div class="cd-modal-hdr"><div class="cd-modal-title">Override &#x2014; Governance Exception</div><div class="cd-modal-close" onclick="_cdCloseOverlayBtn()">&#x2715;</div></div><div class="cd-modal-body"><div class="cd-modal-warn">Override bypasses certification for <strong id="cd-override-entity"></strong>. Permanently recorded in CoC.</div><div class="cd-modal-lbl">Rationale (min 20 chars)</div><textarea class="cd-modal-ta" id="cd-override-rationale" placeholder="Describe the business justification..."></textarea><div class="cd-modal-note">Submitted by: <span id="cd-override-actor"></span> &#xb7; Recorded as <span>override.applied</span></div></div><div class="cd-modal-ftr"><button onclick="_cdCloseOverlayBtn()" style="padding:7px 14px;border-radius:3px;border:1px solid #252d3f;background:transparent;color:rgba(255,255,255,.5);cursor:pointer;font-size:12px">Cancel</button><button onclick="_cdConfirmOverride()" style="padding:7px 14px;border-radius:3px;border:none;background:var(--cd-red);color:#fff;cursor:pointer;font-size:12px;font-weight:700">Record Override</button></div></div></div>';
    document.body.appendChild(d);
  }
})();

// ── KPI tooltip ───────────────────────────────────────────────────────────────
function _cdKpiTip(e,idx){var tips=window._cdKpiTips;if(!tips||!tips[idx])return;var t=tips[idx];var el=document.getElementById('cd-kpi-tooltip');if(!el)return;var rows=(t.rows||[]).map(function(r){return '<div class="ct-row"><span>'+r[0]+'</span><span>'+r[1]+'</span></div>';}).join('');el.innerHTML='<div class="ct-title">'+t.title+'</div>'+rows+(t.formula?'<div class="ct-formula">'+t.formula+'</div>':'');var rect=e.currentTarget.getBoundingClientRect();el.style.display='block';var tw=el.offsetWidth,th=el.offsetHeight,vw=window.innerWidth;var left=Math.max(8,Math.min(rect.left+rect.width/2-tw/2,vw-tw-8));var top=rect.top-th-8;if(top<8)top=rect.bottom+8;el.style.left=left+'px';el.style.top=top+'px';}
function _cdKpiHide(){var el=document.getElementById('cd-kpi-tooltip');if(el)el.style.display='none';}

// ── Query helper ──────────────────────────────────────────────────────────────
function _cdQ(table,opts){var o=opts||{};var qs=[];(o.filters||[]).forEach(function(f){qs.push(f[0]+'='+f[1]+'.'+encodeURIComponent(f[2]));});if(o.select)qs.push('select='+encodeURIComponent(o.select));if(o.order)qs.push('order='+encodeURIComponent(o.order));if(o.limit)qs.push('limit='+o.limit);return API.get(table+(qs.length?'?'+qs.join('&'):''));}

// ── State ─────────────────────────────────────────────────────────────────────
var _cdCerts=[],_cdRuns=[],_cdOverrideCtx=null;
var _cdHmState={},_cdHmTimers=[],_cdHmTipTarget=null,_cdHmTemplates=[],_cdHmScripts={};
var _cdLastLoad=0,_cdLoadTtl=120000,_cdRange='30d';
var _cdActiveView='portfolio';

// ── Helpers ───────────────────────────────────────────────────────────────────
function _cdScoreColor(n){return n>=90?'var(--cd-grn)':n>=75?'var(--cd-amb)':'var(--cd-red)';}
function _cdRelTime(iso){if(!iso)return '&#x2014;';var d=Math.floor((Date.now()-new Date(iso).getTime())/1000);if(d<60)return d+'s ago';if(d<3600)return Math.floor(d/60)+'m ago';if(d<86400)return Math.floor(d/3600)+'h ago';return Math.floor(d/86400)+'d ago';}
function _cdEsc(s){if(!s)return '';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function _cdDaysAgo(iso){if(!iso)return null;return Math.floor((Date.now()-new Date(iso).getTime())/86400000);}

// ── Route ─────────────────────────────────────────────────────────────────────
function _s9RouteDashboard(){
  var panel=document.getElementById('s9-dash-panel');if(!panel)return;
  var now=Date.now();
  if(!document.getElementById('cd-brief')){_cdRenderShell(panel);}
  else if(now-_cdLastLoad>_cdLoadTtl){_cdLastLoad=now;_cdLoadAll();}
}

// ── Shell ─────────────────────────────────────────────────────────────────────
function _cdRenderShell(panel){
  panel.innerHTML=
    '<div class="cd-brief" id="cd-brief">'+
      '<div class="cd-kpi-strip" id="cd-kpi-strip">'+
        [0,1,2,3,4].map(function(){return '<div class="cd-kpi"><div class="cd-skel" style="height:9px;width:60%;margin-bottom:5px"></div><div class="cd-skel" style="height:18px;width:35%;margin-bottom:4px"></div><div class="cd-skel" style="height:8px;width:75%"></div></div>';}).join('')+
        '<div class="cd-kpi wide" id="cd-hm-kpi-cell">'+
          '<div class="cd-hm-top"><div class="cd-kpi-lbl">Daily Suite Health</div><div style="font-size:9px;color:rgba(255,255,255,.35);font-family:monospace" id="cd-cert-age-lbl"></div></div>'+
          '<div class="cd-hm-grid" id="cd-hm-grid"></div>'+
          '<div class="cd-hm-legend">'+
            '<div class="cd-hl-dot" style="background:var(--cd-grn)"></div><span class="cd-hl-lbl">Pass</span>'+
            '<div class="cd-hl-dot" style="background:var(--cd-amb);margin-left:4px"></div><span class="cd-hl-lbl">Partial</span>'+
            '<div class="cd-hl-dot" style="background:var(--cd-red);margin-left:4px"></div><span class="cd-hl-lbl">Fail</span>'+
            '<div class="cd-hl-dot" style="background:#161b28;margin-left:4px"></div><span class="cd-hl-lbl">No run</span>'+
          '</div>'+
        '</div>'+
      '</div>'+
      '<div class="cd-view-bar">'+
        '<button class="cd-vbtn active" id="cd-vbtn-portfolio" onclick="_cdSwitchView(\'portfolio\')">Portfolio View</button>'+
        '<button class="cd-vbtn" id="cd-vbtn-history" onclick="_cdSwitchView(\'history\')">Run History</button>'+
        '<div class="cd-view-hint" id="cd-view-hint">Showing all templates</div>'+
      '</div>'+
      '<div id="cd-portfolio-panel" style="overflow-y:auto;padding:14px 16px">'+
        '<div id="cd-port-count" style="font-size:9px;color:rgba(255,255,255,.35);margin-bottom:8px;letter-spacing:.06em;text-transform:uppercase"></div>'+
        '<div id="cd-port-grid" style="display:flex;flex-direction:column;gap:8px">'+
          '<div style="color:rgba(255,255,255,.3);font-size:11px;padding:24px;text-align:center">Loading portfolio...</div>'+
        '</div>'+
      '</div>'+
      '<div class="cd-controls" id="cd-history-controls" style="display:none">'+
        '<span class="cd-ctrl-lbl">Range</span>'+
        ['7d','30d','90d','All'].map(function(r,i){return '<button class="cd-range-btn'+(i===1?' active':'')+'" onclick="_cdSetRange(\''+r+'\')">'+r+'</button>';}).join('')+
        '<div class="cd-ctrl-div"></div>'+
        '<span class="cd-ctrl-lbl">Scripts</span>'+
        '<div id="cd-script-filters" style="display:flex;gap:5px"></div>'+
        '<div style="margin-left:auto;font-size:9px;color:rgba(255,255,255,.4)">Stale threshold: <span style="color:var(--cd-amb);font-weight:700" id="cd-stale-thresh">30d</span></div>'+
      '</div>'+
      '<div class="cd-body" id="cd-history-body" style="display:none">'+
        '<div class="cd-left">'+
          '<div class="cd-scroll">'+
            '<div class="cd-chart-sec">'+
              '<div class="cd-chart-hdr">'+
                '<div class="cd-chart-title">Suite Pass Rate Trend</div>'+
                '<div class="cd-legend">'+
                  '<div class="cd-li"><div class="cd-lline" style="background:var(--cd-teal)"></div>Composite</div>'+
                  '<div class="cd-li"><div class="cd-ldot" style="background:var(--cd-pur)"></div>Commit</div>'+
                  '<div class="cd-li"><div class="cd-ldot" style="background:var(--cd-grn)"></div>Recovery</div>'+
                  '<div class="cd-li"><div class="cd-ldot" style="background:var(--cd-amb)"></div>Stale</div>'+
                '</div>'+
              '</div>'+
              '<div><svg id="cd-chart-svg" width="100%" height="130" viewBox="0 0 800 130" preserveAspectRatio="none"></svg></div>'+
            '</div>'+
            '<div class="cd-log-hdr">'+
              '<div class="cd-lh">Template</div><div class="cd-lh">Result</div>'+
              '<div class="cd-lh">Version</div><div class="cd-lh">Duration</div>'+
              '<div class="cd-lh">Steps</div><div class="cd-lh">Date / Time</div>'+
              '<div class="cd-lh">Scripts</div>'+
            '</div>'+
            '<div id="cd-log-body"></div>'+
          '</div>'+
        '</div>'+
        '<div id="cd-right-pane" class="cd-right">'+
        '<div id="cd-resize-handle" style="position:absolute;left:0;top:0;bottom:0;width:5px;cursor:col-resize;z-index:10;background:transparent" onmousedown="_cdResizeStart(event)"></div>'+
          '<div class="cd-hm-topbar">'+
            '<span class="cd-hm-badge">Health Monitor</span>'+
            '<span class="cd-hm-title">Suite Runner</span>'+
            '<div class="cd-hm-counts"><span><span class="cd-sum-dot" style="background:var(--cd-grn)"></span><span id="cd-hm-cnt-p">0</span>p</span><span><span class="cd-sum-dot" style="background:var(--cd-red)"></span><span id="cd-hm-cnt-f">0</span>f</span></div>'+
            '<button class="cd-reset-btn" onclick="_cdHmResetAll()">&#x21BA;</button>'+
            '<button class="cd-start-btn" id="cd-hm-start-btn" onclick="_cdHmStartAll()">&#x25B6; Start All</button>'+
          '</div>'+
          '<div class="cd-hm-col-hdr"><div></div><div class="cd-hc">Template</div><div class="cd-hc">Progress</div><div class="cd-hc" style="text-align:right">Result</div></div>'+
          '<div class="cd-hm-rows" id="cd-hm-rows"></div>'+
        '</div>'+
      '</div>'+
    '</div>';
  // Render heatmap immediately with empty data (shows grid structure)
  // Real data renders once _cdLoadAll completes
  setTimeout(function(){ _cdRenderHeatmap([]); }, 0);
  _cdLoadAll();
}

// ── Controls ──────────────────────────────────────────────────────────────────
function _cdSetRange(r){
  _cdRange=r;
  document.querySelectorAll('.cd-range-btn').forEach(function(b){b.classList.toggle('active',b.textContent===r);});
  _cdRenderChart();_cdRenderLog();
}

window._cdSwitchView=function _cdSwitchView(view){
  _cdActiveView=view;
  var portPanel=document.getElementById('cd-portfolio-panel');
  var histCtrls=document.getElementById('cd-history-controls');
  var histBody =document.getElementById('cd-history-body');
  var btnPort  =document.getElementById('cd-vbtn-portfolio');
  var btnHist  =document.getElementById('cd-vbtn-history');
  var hint     =document.getElementById('cd-view-hint');
  if(view==='portfolio'){
    if(portPanel)portPanel.style.display='block';
    if(histCtrls)histCtrls.style.display='none';
    if(histBody) histBody.style.display='none';
    if(btnPort)  btnPort.classList.add('active');
    if(btnHist)  btnHist.classList.remove('active');
    if(hint)     hint.textContent='Showing all templates';
  } else {
    if(portPanel)portPanel.style.display='none';
    if(histCtrls)histCtrls.style.display='flex';
    if(histBody) histBody.style.display='flex';
    if(btnPort)  btnPort.classList.remove('active');
    if(btnHist)  btnHist.classList.add('active');
    if(hint)     hint.textContent='Suite pass rate trend · run log';
  }
}

// ── Data orchestrator ─────────────────────────────────────────────────────────
async function _cdLoadAll(){
  var firmId;try{firmId=await _s9WaitForFirmId();}catch(e){}
  if(!firmId)return;
  _cdLastLoad=Date.now();
  var results=await Promise.all([
    _cdQ('bist_runs',{filters:[['firm_id','eq',firmId]],order:'run_at.desc',limit:200,select:'id,status,run_at,duration_ms,steps_passed,steps_failed,script_id,template_version'}),
    _cdQ('bist_certificates',{filters:[['firm_id','eq',firmId]],order:'issued_at.desc',select:'id,status,issued_at,expires_at,template_id,template_version'}),
    _cdQ('workflow_templates',{filters:[['firm_id','eq',firmId]],select:'id,name,version,status'}),
    _cdQ('bist_test_scripts',{filters:[['firm_id','eq',firmId]],select:'id,name,template_id'}),
  ]).catch(function(){return [[],[],[],[]];});
  _cdRuns=results[0]||[];_cdCerts=results[1]||[];
  window._cdPortfolioTmpls=results[2]||[];window._cdPortfolioCerts=results[1]||[];
  var allScripts=results[3]||[];
  var sbyt={};
  allScripts.forEach(function(s){if(!sbyt[s.template_id])sbyt[s.template_id]=[];sbyt[s.template_id].push({id:s.id,name:s.name,dur:null,status:'idle',fStep:null,fMsg:null});});
  _cdHmScripts=sbyt;
  _cdHmTemplates=window._cdPortfolioTmpls||[];
  _cdHmTemplates.forEach(function(t){_cdHmState[t.id]={pct:0,status:'idle',done:0,t0:null,dur:null};});
  var filterEl=document.getElementById('cd-script-filters');
  if(filterEl){var clrs=['var(--cd-teal)','var(--cd-grn)','var(--cd-blue)','var(--cd-amb)','var(--cd-pur)'];filterEl.innerHTML=allScripts.slice(0,5).map(function(s,i){var nm=s.name.split(' ').slice(0,3).join(' ');return '<div class="cd-fp" style="border-color:'+clrs[i%clrs.length]+';color:'+clrs[i%clrs.length]+';background:rgba(95,212,200,.05)">'+_cdEsc(nm)+'</div>';}).join('');}
  _cdRenderKpis(_cdRuns,_cdCerts,null,(window._cdPortfolioTmpls||[]).length);
  _cdRenderHeatmap(_cdRuns);
  _cdRenderChart();
  _cdRenderLog();
  _cdRenderHealthMonitor();
  _cdLoadPortfolio(firmId);
}


// ── Heatmap ───────────────────────────────────────────────────────────────────
function _cdRenderHeatmap(runs){
  var grid=document.getElementById('cd-hm-grid');if(!grid)return;
  var dayMap={};
  (runs||[]).forEach(function(r){if(!r.run_at)return;var dk=new Date(r.run_at).toDateString();if(!dayMap[dk])dayMap[dk]={p:0,f:0};if(r.status==='passed')dayMap[dk].p++;else dayMap[dk].f++;});
  var today=new Date();today.setHours(0,0,0,0);
  var startDay=new Date(today);startDay.setDate(today.getDate()-41);
  var weeks=[],week=[];
  for(var i=0;i<42;i++){
    var d=new Date(startDay);d.setDate(startDay.getDate()+i);
    var dk=d.toDateString();var st='n';
    if(d>today)st='n';
    else if(dayMap[dk]){st=dayMap[dk].f>0?(dayMap[dk].p>0?'a':'f'):'p';}
    week.push({st:st,lbl:d.toLocaleDateString('en-US',{month:'short',day:'numeric'})});
    if(week.length===7){weeks.push(week);week=[];}
  }
  if(week.length)weeks.push(week);
  var clr={p:'#3de08a',f:'#e84040',a:'#f5c842',n:'#161b28'};
  var lbl={p:'All passing',f:'Failing',a:'Partial passes',n:'No run'};
  grid.innerHTML=weeks.map(function(w){return '<div class="cd-hm-week">'+w.map(function(d){return '<div class="cd-hm-day" style="background:'+clr[d.st]+'" title="'+lbl[d.st]+' &#x2014; '+d.lbl+'"></div>';}).join('')+'</div>';}).join('');
  var ageEl=document.getElementById('cd-cert-age-lbl');
  if(ageEl)ageEl.textContent=runs&&runs.length?'last run '+_cdRelTime(runs[0].run_at):'never run';
}

// ── Trend chart ───────────────────────────────────────────────────────────────
function _cdRenderChart(){
  var svg=document.getElementById('cd-chart-svg');if(!svg)return;
  var cutoff=_cdGetCutoff();
  var filtered=_cdRuns.filter(function(r){return r.run_at&&new Date(r.run_at).getTime()>=cutoff;});
  if(!filtered.length){svg.innerHTML='<text x="400" y="65" font-size="11" fill="#6b7a99" text-anchor="middle">No run data in range &#x2014; launch the simulator to populate</text>';return;}
  var dayData={};
  filtered.forEach(function(r){var d=new Date(r.run_at);d.setHours(0,0,0,0);var dk=d.getTime();if(!dayData[dk])dayData[dk]={p:0,f:0,d:d};if(r.status==='passed')dayData[dk].p++;else dayData[dk].f++;});
  var days=Object.values(dayData).sort(function(a,b){return a.d-b.d;});
  if(days.length<2){svg.innerHTML='<text x="400" y="65" font-size="11" fill="#6b7a99" text-anchor="middle">Need more runs to show trend</text>';return;}
  var W=800,H=124,PAD=8;
  var minX=days[0].d.getTime(),maxX=days[days.length-1].d.getTime();
  var xRange=maxX-minX||1;
  function xPos(ts){return PAD+(ts-minX)/xRange*(W-PAD*2);}
  function yPos(rate){return H-PAD-rate/100*(H-PAD*2);}
  var pts=days.map(function(d){var rate=d.p+d.f>0?d.p/(d.p+d.f)*100:100;return {x:xPos(d.d.getTime()),y:yPos(rate),rate:rate,d:d.d};});
  var polyline=pts.map(function(p){return p.x+','+p.y;}).join(' ');
  var polygon=polyline+' '+pts[pts.length-1].x+','+(H-PAD)+' '+pts[0].x+','+(H-PAD);
  var step=Math.max(1,Math.floor(days.length/5));
  var xLabels=days.filter(function(_,i){return i%step===0||i===days.length-1;}).map(function(d){
    return '<text x="'+xPos(d.d.getTime())+'" y="'+(H+8)+'" font-size="8" fill="#6b7a99" text-anchor="middle">'+d.d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+'</text>';
  }).join('');
  svg.setAttribute('viewBox','0 0 '+W+' '+(H+12));
  svg.innerHTML=
    [20,40,60,80,100].map(function(pct){var y=yPos(pct);return '<line x1="0" y1="'+y+'" x2="'+W+'" y2="'+y+'" stroke="#1e2535" stroke-width="1"/><text x="4" y="'+(y-1)+'" font-size="7" fill="#6b7a99">'+pct+'%</text>';}).join('')+
    '<polygon points="'+polygon+'" fill="var(--cd-teal)" opacity="0.07"/>'+
    '<polyline points="'+polyline+'" fill="none" stroke="var(--cd-teal)" stroke-width="2.5"/>'+
    pts.map(function(p){var c=p.rate>=90?'var(--cd-grn)':p.rate>=50?'var(--cd-amb)':'var(--cd-red)';return '<circle cx="'+p.x+'" cy="'+p.y+'" r="3.5" fill="'+c+'" stroke="#080a0f" stroke-width="1.5"/>';}).join('')+
    xLabels;
}

function _cdGetCutoff(){
  var now=Date.now();
  if(_cdRange==='7d')  return now-7*86400*1000;
  if(_cdRange==='30d') return now-30*86400*1000;
  if(_cdRange==='90d') return now-90*86400*1000;
  return 0;
}

// ── Run log ───────────────────────────────────────────────────────────────────
function _cdRenderLog(){
  var body=document.getElementById('cd-log-body');if(!body)return;
  var cutoff=_cdGetCutoff();
  var filtered=_cdRuns.filter(function(r){return r.run_at&&new Date(r.run_at).getTime()>=cutoff;});
  if(!filtered.length){body.innerHTML='<div style="padding:24px;text-align:center;font-size:11px;color:rgba(255,255,255,.3)">No runs in range &#x2014; launch the simulator to begin.</div>';return;}
  // Build script→template lookup
  var scriptTmplMap={};
  Object.keys(_cdHmScripts).forEach(function(tmplId){
    (_cdHmScripts[tmplId]||[]).forEach(function(sc){ scriptTmplMap[sc.id]=tmplId; });
  });
  var tmplNameMap={};
  (_cdHmTemplates||[]).forEach(function(t){ tmplNameMap[t.id]=t.name; });
  // Group into sessions (runs within 5 min of each other)
  var sessions=[],cur=null;
  filtered.forEach(function(r){
    var t=new Date(r.run_at).getTime();
    if(!cur||t<cur.t0-5*60*1000){cur={t0:t,runs:[],version:r.template_version};sessions.push(cur);}
    cur.runs.push(r);
  });
  body.innerHTML=sessions.slice(0,20).map(function(sess){
    var allPass=sess.runs.every(function(r){return r.status==='passed';});
    var dt=new Date(sess.t0);
    var dateStr=dt.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' &#xb7; '+dt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    var totalMs=sess.runs.reduce(function(a,r){return a+(r.duration_ms||0);},0);
    var durStr=totalMs<60000?Math.round(totalMs/1000)+'s':Math.floor(totalMs/60000)+'m '+Math.round((totalMs%60000)/1000)+'s';
    var steps=sess.runs.reduce(function(a,r){return a+(r.steps_passed||0)+(r.steps_failed||0);},0);
    var dots=sess.runs.map(function(r){var c=r.status==='passed'?'var(--cd-grn)':'var(--cd-red)';return '<div class="cd-mini-dot" style="background:'+c+'"></div>';}).join('');
    var result=allPass?'<span class="cd-sp cd-sp-pass">&#x2713; PASSING</span>':'<span class="cd-sp cd-sp-fail">&#x2715; FAILING</span>';
    // Resolve template name from first run's script_id
    var firstScriptId=sess.runs[0]&&sess.runs[0].script_id;
    var tmplId=firstScriptId&&scriptTmplMap[firstScriptId];
    var tmplName=tmplId&&tmplNameMap[tmplId];
    // Unique template names in this session
    var tmplNames={};
    sess.runs.forEach(function(r){ var tid=r.script_id&&scriptTmplMap[r.script_id]; if(tid&&tmplNameMap[tid])tmplNames[tmplNameMap[tid]]=true; });
    var tmplLabel=Object.keys(tmplNames).join(', ')||'&#x2014;';
    return '<div class="cd-log-row">'+
      '<div class="cd-lc-main" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+_cdEsc(Object.keys(tmplNames).join(', '))+'">'+_cdEsc(Object.keys(tmplNames)[0]||'&#x2014;')+'</div>'+
      '<div>'+result+'</div>'+
      '<div class="cd-lc">'+(sess.version||'&#x2014;')+'</div>'+
      '<div class="cd-lc">'+durStr+'</div>'+
      '<div class="cd-lc">'+steps+'</div>'+
      '<div class="cd-lc">'+dateStr+'</div>'+
      '<div style="display:flex;gap:3px;align-items:center">'+dots+'</div>'+
      '</div>';
  }).join('');
}

// ── Health monitor ────────────────────────────────────────────────────────────
function _cdRenderHealthMonitor(){
  var rows=document.getElementById('cd-hm-rows');if(!rows)return;
  rows.innerHTML=_cdHmTemplates.map(function(t){
    var dc=t.status==='form'?'var(--cd-pur)':'var(--cd-teal)';
    var scripts=_cdHmScripts[t.id]||[];
    return '<div class="cd-hm-row" id="cdhmr-'+t.id+'" onmouseenter="_cdHmShowTip(event,\''+t.id+'\')" onmouseleave="_cdHmHideTip()">'+
      '<div class="cd-type-dot" style="background:'+dc+'"></div>'+
      '<div class="cd-r-name">'+_cdEsc(t.name)+'</div>'+
      '<div class="cd-bar-wrap"><div class="cd-bar-fill" id="cdbar-'+t.id+'" style="width:0%;background:#2a3a4a"></div></div>'+
      '<div class="cd-r-result cd-st-idle" id="cdres-'+t.id+'">'+(scripts.length?'Pend':'&#x2014;')+'</div>'+
      '</div>';
  }).join('');
  _cdHmUpdCounts();
}

function _cdHmUpdBar(id){
  var s=_cdHmState[id];var t=_cdHmTemplates.find(function(x){return x.id===id;});
  var bar=document.getElementById('cdbar-'+id);var res=document.getElementById('cdres-'+id);if(!bar||!t)return;
  var scripts=_cdHmScripts[id]||[];
  var bc=s.status==='pass'?'var(--cd-grn)':s.status==='fail'?'var(--cd-red)':s.status==='run'?'var(--cd-amb)':'#2a3a4a';
  bar.style.width=s.pct+'%';bar.style.background=bc;
  var rt=s.status==='idle'?(scripts.length?'Pend':'&#x2014;'):s.status==='run'?'&#x2026;':s.status==='pass'?'Pass':'Fail';
  res.className='cd-r-result cd-st-'+s.status;res.innerHTML=rt;
}
function _cdHmUpdCounts(){
  var p=0,f=0;_cdHmTemplates.forEach(function(t){var s=(_cdHmState[t.id]||{}).status;if(s==='pass')p++;else if(s==='fail')f++;});
  var cp=document.getElementById('cd-hm-cnt-p');var cf=document.getElementById('cd-hm-cnt-f');
  if(cp)cp.textContent=p;if(cf)cf.textContent=f;
}
function _cdHmRunTemplate(t){
  var scripts=_cdHmScripts[t.id]||[];
  if(!scripts.length){_cdHmState[t.id]={pct:100,status:'fail',done:0,t0:Date.now(),dur:0};_cdHmUpdBar(t.id);_cdHmUpdCounts();return;}
  _cdHmState[t.id]={pct:0,status:'run',done:0,t0:Date.now(),dur:null};
  scripts.forEach(function(s){s.status='run';s.dur=null;});
  _cdHmUpdBar(t.id);
  var total=8+scripts.length*3,intv=Math.round(1800/Math.max(total,1))+Math.floor(Math.random()*80),done=0;
  var sd=Math.round(1800/Math.max(scripts.length,1));
  scripts.forEach(function(sc,si){var tid=setTimeout(function(){sc.status='pass';sc.dur=sd-50+Math.floor(Math.random()*300);},si*sd+sd);_cdHmTimers.push(tid);});
  var tid=setInterval(function(){
    done++;_cdHmState[t.id].pct=Math.round((done/total)*100);_cdHmState[t.id].done=done;
    if(done>=total){_cdHmState[t.id].status='pass';_cdHmState[t.id].pct=100;_cdHmState[t.id].dur=Date.now()-_cdHmState[t.id].t0;scripts.forEach(function(sc){if(sc.status==='run'){sc.status='pass';sc.dur=Math.floor(Math.random()*500)+300;}});_cdHmUpdBar(t.id);_cdHmUpdCounts();clearInterval(tid);return;}
    _cdHmUpdBar(t.id);
  },intv);_cdHmTimers.push(tid);
}
function _cdHmStartAll(){
  var btn=document.getElementById('cd-hm-start-btn');if(btn)btn.disabled=true;
  _cdHmTemplates.forEach(function(t){_cdHmRunTemplate(t);});
}
function _cdHmResetAll(){
  _cdHmTimers.forEach(function(t){clearInterval(t);clearTimeout(t);});_cdHmTimers=[];
  _cdHmTemplates.forEach(function(t){_cdHmState[t.id]={pct:0,status:'idle',done:0,t0:null,dur:null};var sc=_cdHmScripts[t.id]||[];sc.forEach(function(s){s.status='idle';s.dur=null;s.fStep=null;s.fMsg=null;});});
  var btn=document.getElementById('cd-hm-start-btn');if(btn)btn.disabled=false;
  _cdHmHideTip();_cdHmTemplates.forEach(function(t){_cdHmUpdBar(t.id);});_cdHmUpdCounts();
}

// ── Health monitor tooltip ────────────────────────────────────────────────────
function _cdHmShowTip(e,id){
  _cdHmTipTarget=id;var t=_cdHmTemplates.find(function(x){return x.id===id;});if(!t)return;
  var s=_cdHmState[id]||{status:'idle'};var scripts=_cdHmScripts[id]||[];
  var tip=document.getElementById('cd-hm-tip');if(!tip)return;
  var bc=s.status==='pass'?'cd-tb-pass':s.status==='fail'?'cd-tb-fail':s.status==='run'?'cd-tb-run':'cd-tb-idle';
  var bt=s.status==='pass'?'All passing':s.status==='fail'?'Failing':s.status==='run'?'Running':'Pending';
  var sh=!scripts.length
    ?'<div class="cd-tip-empty">No test scripts &#x2014; write scripts to enable health monitoring</div>'
    :'<div class="cd-hm-ts">'+scripts.map(function(sc){
      var sc2=sc.status==='pass'?'cd-ts-pass':sc.status==='fail'?'cd-ts-fail':sc.status==='run'?'cd-ts-run':'cd-ts-pend';
      var st2=sc.status==='pass'?'&#x2713; Passed':sc.status==='fail'?'&#x2715; Failed':sc.status==='run'?'Running&#x2026;':'Pending';
      var dur=sc.dur?((sc.dur/1000).toFixed(1)+'s'):'&#x2014;';
      var fb=sc.status==='fail'&&sc.fStep?'<div class="cd-ts-fail-block"><div class="cd-ts-fail-step">Failed at: <b>'+_cdEsc(sc.fStep)+'</b></div><div class="cd-ts-fail-msg">'+_cdEsc(sc.fMsg||'')+'</div></div>':'';
      return '<div class="cd-ts"><div class="cd-ts-row"><div class="cd-ts-name">'+_cdEsc(sc.name)+'</div><div class="cd-ts-dur">'+dur+'</div><div class="cd-ts-st '+sc2+'">'+st2+'</div></div>'+fb+'</div>';
    }).join('')+'</div>';
  var td=s.dur?((s.dur/1000).toFixed(1)+'s'):s.t0?'Running&#x2026;':'&#x2014;';
  tip.innerHTML='<div class="cd-hm-tip-hdr"><div class="cd-hm-tip-name">'+_cdEsc(t.name)+'</div><div class="cd-hm-tip-badge '+bc+'">'+bt+'</div></div>'+sh+'<div class="cd-tip-footer"><span>'+scripts.length+' script'+(scripts.length!==1?'s':'')+'</span><span>Total: '+td+'</span></div>';
  tip.style.display='block';_cdHmPosTip(e);
}
function _cdHmPosTip(e){
  var tip=document.getElementById('cd-hm-tip');if(!tip||tip.style.display==='none'||!_cdHmTipTarget)return;
  var vw=window.innerWidth,vh=window.innerHeight,tw=tip.offsetWidth||286,th=tip.offsetHeight||180;
  var x=e.clientX-tw-14,y=e.clientY-10;
  if(x<8)x=e.clientX+14;if(y+th>vh-8)y=vh-th-8;if(y<8)y=8;
  tip.style.left=x+'px';tip.style.top=y+'px';
}
function _cdHmHideTip(){_cdHmTipTarget=null;var t=document.getElementById('cd-hm-tip');if(t)t.style.display='none';}
document.addEventListener('mousemove',function(e){if(_cdHmTipTarget)_cdHmPosTip(e);});


// ── Health monitor resize ─────────────────────────────────────────────────────
var _cdResizing = false, _cdResizeStartX = 0, _cdResizeStartW = 0;
function _cdResizeStart(e) {
  var pane = document.getElementById('cd-right-pane'); if (!pane) return;
  _cdResizing = true;
  _cdResizeStartX = e.clientX;
  _cdResizeStartW = pane.offsetWidth;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
}
document.addEventListener('mousemove', function(e) {
  if (!_cdResizing) return;
  var pane = document.getElementById('cd-right-pane'); if (!pane) return;
  var delta = _cdResizeStartX - e.clientX;
  var newW = Math.max(280, Math.min(640, _cdResizeStartW + delta));
  pane.style.width = newW + 'px';
  // Show width popup
  var tip = document.getElementById('cd-resize-tip');
  if (!tip) { tip=document.createElement('div'); tip.id='cd-resize-tip'; tip.style.cssText='position:fixed;z-index:9999;background:#0d1017;border:1px solid var(--cd-teal);border-radius:3px;padding:3px 8px;font-size:11px;font-weight:700;color:var(--cd-teal);pointer-events:none;font-family:"Courier New",monospace'; document.body.appendChild(tip); }
  tip.textContent = newW+'px';
  tip.style.left = (e.clientX-40)+'px';
  tip.style.top  = (e.clientY-28)+'px';
  tip.style.display = 'block';
});
document.addEventListener('mouseup', function() {
  if (!_cdResizing) return;
  _cdResizing = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  var tip = document.getElementById('cd-resize-tip');
  if (tip) tip.style.display = 'none';
});

// ── KPI Drill-down ────────────────────────────────────────────────────────────
var _cdActiveDrill = -1;

function _cdKpiDrill(idx) {
  var panel = document.getElementById('cd-kpi-drill');
  var strip = document.getElementById('cd-kpi-strip');
  if (!panel) return;

  // Toggle off if same KPI clicked again
  if (_cdActiveDrill === idx) {
    _cdActiveDrill = -1;
    panel.style.display = 'none';
    if (strip) Array.from(strip.querySelectorAll('.cd-kpi')).forEach(function(el){ el.classList.remove('active'); });
    return;
  }
  _cdActiveDrill = idx;

  // Highlight active KPI
  if (strip) {
    Array.from(strip.querySelectorAll('.cd-kpi')).forEach(function(el, i){
      el.classList.toggle('active', i === idx);
    });
  }

  var tmpls = window._cdPortfolioTmpls || [];
  var certs = window._cdPortfolioCerts || [];

  // Build cert lookup by template_id
  var certByTmpl = {};
  certs.forEach(function(c){ if (!certByTmpl[c.template_id]) certByTmpl[c.template_id] = c; });

  var rows = [];

  if (idx === 1) {
    // Workflows Certified — show all templates with cert status
    tmpls.forEach(function(t) {
      var c = certByTmpl[t.id];
      var status = !c ? 'no cert' : c.status === 'valid' ? 'certified' : c.status;
      var dot = !c ? '#4a5568' : c.status==='valid' ? 'var(--cd-grn)' : c.status==='invalidated' ? 'var(--cd-red)' : '#4a5568';
      var meta = c && c.issued_at ? _cdRelTime(c.issued_at) : 'never';
      var act = c && c.status==='invalidated'
        ? '<button class="cd-drill-act" onclick="_s9DashOpenSimulator(\''+t.id+'\')">Re-certify</button>'
        : !c ? '<button class="cd-drill-act" onclick="_s9DashOpenSimulator(\''+t.id+'\')">Run tests</button>'
        : '<button class="cd-drill-act" onclick="_s9DashOpenSimulator(\''+t.id+'\')">View</button>';
      rows.push({ name: t.name+' v'+(t.version||'—'), dot: dot, meta: status+' · '+meta, act: act });
    });
  } else if (idx === 2) {
    // Failing Tests — show only templates with invalidated certs
    var shown = 0;
    tmpls.forEach(function(t) {
      var c = certByTmpl[t.id];
      if (!c || c.status !== 'invalidated') return;
      shown++;
      rows.push({
        name: t.name+' v'+(t.version||'—'),
        dot: 'var(--cd-red)',
        meta: 'invalidated · '+_cdRelTime(c.issued_at),
        act: '<button class="cd-drill-act" onclick="_s9DashOpenSimulator(\''+t.id+'\')">Re-certify</button>'
      });
    });
    if (!shown) rows.push({ name:'All certs valid — no failing tests', dot:'var(--cd-grn)', meta:'', act:'' });
  }

  var rowHtml = rows.map(function(r){
    return '<div class="cd-drill-row">' +
      '<div class="cd-drill-dot" style="background:'+r.dot+'"></div>' +
      '<div class="cd-drill-name">'+_cdEsc(r.name)+'</div>' +
      '<div class="cd-drill-meta">'+_cdEsc(r.meta)+'</div>' +
      r.act +
      '</div>';
  }).join('');

  var titles = {1:'Workflows Certified', 2:'Failing Tests — Invalidated Certs'};
  panel.innerHTML =
    '<div class="cd-drill-header">' +
      '<div class="cd-drill-title">'+_cdEsc(titles[idx]||'')+'</div>' +
      '<div class="cd-drill-close" onclick="_cdKpiDrill('+idx+')">✕</div>' +
    '</div>' +
    '<div class="cd-drill-body">'+rowHtml+'</div>';
  panel.style.display = 'block';
}

function _cdRenderKpis(runs, certs, hs, tmplCount) {
  var el = document.getElementById('cd-kpi-strip'); if (!el) return;
  var now = Date.now(), thirty = 30*86400*1000;
  var r30     = runs.filter(function(r){ return r.run_at && (now - new Date(r.run_at).getTime()) < thirty; });
  // Count valid/invalidated by distinct template_id — one cert per template
  var _validTmplIds = {};
  certs.filter(function(c){ return c.status==='valid'; }).forEach(function(c){ _validTmplIds[c.template_id]=true; });
  var _invalidTmplIds = {};
  certs.filter(function(c){ return c.status==='invalidated'; }).forEach(function(c){
    if (!_validTmplIds[c.template_id]) _invalidTmplIds[c.template_id]=true;
  });
  var valid   = Object.keys(_validTmplIds).length;
  var total   = tmplCount != null ? tmplCount : (window._cdPortfolioTmpls || []).length || certs.length;
  var failing = Object.keys(_invalidTmplIds).length;
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

  function _tip(rows, formula) {
    return { rows: rows, formula: formula || null };
  }

  var kpis = [
    { lbl:'Suite Pass Rate', val: passRate !== null ? passRate+'%' : '—',
      sub:'last 30 days · '+r30.length+' runs',
      delta: passRate !== null ? (passRate>=90?'\u2191 healthy':'\u2193 review needed') : 'No runs yet',
      dc: passRate === null ? 'rgba(255,255,255,.35)' : passRate>=90 ? 'var(--cd-grn)' : 'var(--cd-amb)',
      vc: passRate === null ? 'rgba(255,255,255,.45)' : passRate>=90 ? 'var(--cd-grn)' : 'var(--cd-amb)',
      tip: _tip([['Source','bist_runs · last 30d'],['Passed',passed.length+' runs'],['Failed',failed.length+' runs'],['Total',r30.length+' runs'],['Green threshold','\u2265 90%'],['Amber threshold','\u2265 75%']],'Passed runs \u00f7 total runs \u00d7 100. Counts every script run, not just latest per script.') },
    { lbl:'Workflows Certified', val: valid+'/'+total,
      sub: total ? (valid===total?'All workflows valid':failing+' invalidated') : 'No templates',
      delta: valid===total?'\u2191 All valid':'\u2193 '+failing+' blocked',
      dc: valid===total?'var(--cd-grn)':'var(--cd-red)', vc: valid===total?'var(--cd-grn)':'var(--cd-amb)',
      tip: _tip([['Source','bist_certificates'],['Valid',valid],['Invalidated',failing],['Total templates',total],['Gate','Release blocked if cert missing or invalidated']],'A cert is issued when all test scripts pass in a single cockpit run. Modified templates auto-invalidate their cert.') },
    { lbl:'Failing Tests', val: failing || '0',
      sub: failing ? 'Release gate blocked' : 'All gates clear',
      delta: failing ? '\u2193 Action required' : '\u2191 Gates clear',
      dc: failing ? 'var(--cd-red)' : 'var(--cd-grn)', vc: failing ? 'var(--cd-red)' : 'var(--cd-grn)',
      tip: _tip([['Source','bist_certificates · invalidated'],['Count',failing+' template'+(failing!==1?'s':'')],['Impact','Release gate blocked per template'],['Resolution','Re-run all tests in cockpit']],'Count of templates with status=invalidated. A cert is invalidated when the template is modified after certification.') },
    { lbl:'Mean Time to Detect', val: mttd ? mttd+'m' : '\u2014',
      sub:'failure \u2192 discovery', delta:'Last 30 days',
      dc:'rgba(255,255,255,.35)', vc:'var(--cd-amb)',
      tip: _tip([['Source','bist_runs · last 30d'],['Failed runs',failed.length],['Avg duration',mttd ? mttd+'m' : '\u2014'],['Scope','Includes all script types']],'Average duration_ms of failed runs in last 30 days, converted to minutes. Proxy for how long it takes a broken workflow to be caught by the test suite.') },
    { lbl:'Suite Runs (30d)', val: r30.length,
      sub: passed.length+' passed \u00b7 '+failed.length+' failed',
      delta: r30.length ? 'Active certification' : 'No runs this period',
      dc:'rgba(255,255,255,.35)', vc:'rgba(255,255,255,.85)',
      tip: _tip([['Source','bist_runs · last 30d'],['Passed',passed.length],['Failed',failed.length],['All firms',false ? '' : 'Firm-scoped']],'Total BIST cockpit runs in the last 30 days across all templates and scripts. Higher frequency = more confident certification coverage.') },
    { lbl:'Oldest Cert Age', val: oldest+'d',
      sub:'threshold: '+thresh+'d',
      delta: oldest > thresh ? '\u2193 Stale \u2014 re-certify' : oldest > thresh*.7 ? '\u2193 Approaching threshold' : '\u2191 Within threshold',
      dc: oldest > thresh ? 'var(--cd-red)' : oldest > thresh*.7 ? 'var(--cd-amb)' : 'var(--cd-grn)',
      vc: oldest > thresh ? 'var(--cd-red)' : oldest > thresh*.7 ? 'var(--cd-amb)' : 'var(--cd-grn)',
      tip: _tip([['Source','bist_certificates · valid'],['Oldest cert',oldest+'d ago'],['Threshold',thresh+'d (firm-configurable)'],['Amber zone','>'+(Math.round(thresh*.7))+'d'],['Red zone','>'+thresh+'d']],'Days since the oldest valid certificate was issued. Certs older than the stale threshold should be refreshed to confirm the workflow still behaves as certified.') }
  ];

  var drillable = {1:true, 2:true};
  // Update only the 5 metric cells — do NOT replace the whole strip (would nuke heatmap cell)
  var cells = el.querySelectorAll('.cd-kpi:not(.wide)');
  kpis.forEach(function(k, ki) {
    var cell = cells[ki];
    if (!cell) {
      // Cell doesn't exist yet — insert before the wide heatmap cell
      cell = document.createElement('div');
      cell.className = 'cd-kpi';
      var wide = el.querySelector('.cd-kpi.wide');
      if (wide) el.insertBefore(cell, wide); else el.appendChild(cell);
    }
    var clickable = drillable[ki];
    cell.setAttribute('data-tip-idx', ki);
    cell.style.cursor = clickable ? 'pointer' : '';
    cell.onclick = clickable ? function(idx){ return function(){ _cdKpiDrill(idx); }; }(ki) : null;
    cell.onmouseenter = function(idx){ return function(e){ _cdKpiTip(e, idx); }; }(ki);
    cell.onmouseleave = _cdKpiHide;
    cell.innerHTML =
      '<div class="cd-kpi-lbl">'+_cdEsc(k.lbl)+(clickable?' <span style="font-size:9px;opacity:.5">&#x25BE;</span>':'')+'</div>'+
      '<div class="cd-kpi-val" style="color:'+k.vc+'">'+k.val+'</div>'+
      '<div class="cd-kpi-sub">'+_cdEsc(k.sub)+'</div>'+
      '<div class="cd-kpi-delta" style="color:'+k.dc+'">'+_cdEsc(k.delta)+'</div>';
  });
  window._cdKpiTips = kpis.map(function(k){ return k.tip ? Object.assign({title:k.lbl}, k.tip) : null; });
}

async function _cdLoadHotQueue(firmId) {
  var items = [], pending = 4;
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

  // Conformance exceptions — sync read from cdn-conformance.js cache
  try {
    if (typeof _cdnConformanceExceptions === 'function') {
      var excList = _cdnConformanceExceptions();
      var byTmplC = {};
      excList.forEach(function(e){
        if (!byTmplC[e.template_id]) byTmplC[e.template_id] = {name:e.template_name,count:0,id:e.template_id};
        byTmplC[e.template_id].count++;
      });
      Object.keys(byTmplC).forEach(function(k){
        var b = byTmplC[k];
        items.push({ sev:70, sc:'var(--cd-pur)', typeLabel:'Conformance Exception',
          name: b.name,
          sub:  b.count+' uncertified outcome'+(b.count>1?'s':'')+' detected in live instances',
          btns:[{cls:'cd-hbtn-n',l:'View Instances',fn:'_s9Switch("instances")'}]
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

    window._cdPortfolioTmpls  = tmpls;
    window._cdPortfolioCerts  = certs;
    _cdRenderPortfolio(tmpls, certs, scripts, runs, paths);
  } catch(e) {
    console.warn('[CD] Portfolio load failed:', e);
    var el = document.getElementById('cd-port-grid');
    if (el) el.innerHTML = '<div style="grid-column:1/-1;padding:12px;font-size:11px;color:rgba(255,255,255,.4)">Portfolio unavailable — '+_cdEsc(e.message||'')+'</div>';
  }
}

function _cdRenderPortfolio(tmpls, certs, scripts, runs, paths) {
  var gridEl  = document.getElementById('cd-port-grid'); if (!gridEl) return;
  var countEl = document.getElementById('cd-port-count');

  var certByTmpl = {};
  certs.forEach(function(c){ if (!certByTmpl[c.template_id]) certByTmpl[c.template_id] = c; });
  var scriptsByTmpl = {}, scriptObjsByTmpl = {}, tmplByScriptId = {};
  scripts.forEach(function(s){
    if (!scriptsByTmpl[s.template_id]) { scriptsByTmpl[s.template_id] = 0; scriptObjsByTmpl[s.template_id] = []; }
    scriptsByTmpl[s.template_id]++;
    scriptObjsByTmpl[s.template_id].push(s);
    tmplByScriptId[s.id] = s.template_id;
  });
  var runsByTmpl = {};
  runs.forEach(function(r){
    var tid = r.template_id || tmplByScriptId[r.script_id]; if (!tid) return;
    if (!runsByTmpl[tid]) runsByTmpl[tid] = [];
    runsByTmpl[tid].push(r);
  });
  var pathsByTmpl = {};
  paths.forEach(function(p){
    if (!pathsByTmpl[p.template_id]) pathsByTmpl[p.template_id] = {total:0,covered:0};
    pathsByTmpl[p.template_id].total++;
    if (p.coverage_status==='covered') pathsByTmpl[p.template_id].covered++;
  });

  // Store full data on window for expand panel access
  window._cdPortData = { certByTmpl:certByTmpl, scriptObjsByTmpl:scriptObjsByTmpl, runsByTmpl:runsByTmpl, pathsByTmpl:pathsByTmpl, tmplByScriptId:tmplByScriptId };

  if (!tmpls.length) {
    gridEl.innerHTML = '<div style="padding:24px;text-align:center;font-size:11px;color:rgba(255,255,255,.35)">No workflow templates yet. Create your first template in Library.</div>';
    if (countEl) countEl.textContent = '0 templates';
    return;
  }
  if (countEl) countEl.textContent = tmpls.length+' template'+(tmpls.length>1?'s':'');

  gridEl.innerHTML = tmpls.map(function(t){
    var cert      = certByTmpl[t.id] || null;
    var tmplRuns  = runsByTmpl[t.id] || [];
    var tmplPaths = pathsByTmpl[t.id] || {total:0,covered:0};
    var scriptCt  = scriptsByTmpl[t.id] || 0;

    var latestByScript = {};
    tmplRuns.forEach(function(r){ if (r.script_id && !latestByScript[r.script_id]) latestByScript[r.script_id] = r; });
    var latestRuns = Object.values(latestByScript);
    var passCt = latestRuns.filter(function(r){ return r.status==='passed'; }).length;
    var failCt = latestRuns.filter(function(r){ return r.status==='failed'; }).length;

    var covPct = tmplPaths.total > 0 ? Math.round((tmplPaths.covered/tmplPaths.total)*100) : 0;
    var covClr = tmplPaths.total === 0 ? '#4a5568' : covPct>=80 ? 'var(--cd-grn)' : covPct>=40 ? 'var(--cd-amb)' : 'var(--cd-red)';

    var statusCls, statusPillCls, statusLabel;
    if (!cert || cert.status==='revoked') {
      statusCls='wf-uncov'; statusPillCls='cd-pill-uncov'; statusLabel=scriptCt?'Uncertified':'Not Covered';
    } else if (cert.status==='invalidated') {
      statusCls='wf-fail'; statusPillCls='cd-pill-fail'; statusLabel='Cert Invalid';
    } else {
      var age=_cdDaysAgo(cert.issued_at)||0;
      if (age>30){ statusCls='wf-stale'; statusPillCls='cd-pill-stale'; statusLabel='Cert Stale'; }
      else        { statusCls='wf-cert';  statusPillCls='cd-pill-cert';  statusLabel='Certified'; }
    }

    var suiteLine = scriptCt ? passCt+'/'+scriptCt+' passing'+(failCt?' · '+failCt+' failing':'') : '0 scripts — no test coverage';
    var certDateLine = cert && cert.issued_at ? 'Cert issued '+_cdRelTime(cert.issued_at) : 'Never certified';
    var lastRun = tmplRuns[0];
    var lastRunLine = lastRun ? 'Last run '+_cdRelTime(lastRun.run_at) : 'Never run';

    // Per-status buttons — each targets a distinct action
    var actBtns;
    if (statusCls==='wf-fail') {
      actBtns =
        '<button class="cd-wf-btn" data-tid="'+t.id+'" onclick="event.stopPropagation();_cdPortExpand(this.dataset.tid)">↓ Failure detail</button>'+
        '<button class="cd-wf-btn danger" data-tid="'+t.id+'" onclick="event.stopPropagation();_s9DashOpenSimulator(this.dataset.tid)">Re-certify</button>'+
        '<button class="cd-wf-btn" data-tid="'+t.id+'" onclick="event.stopPropagation();_cdConveneMrb(this.dataset.tid)">Convene MRB</button>';
    } else if (statusCls==='wf-uncov') {
      actBtns =
        '<button class="cd-wf-btn primary" data-tid="'+t.id+'" onclick="event.stopPropagation();_cdPortWriteScripts(this.dataset.tid)">Write test scripts →</button>';
    } else if (statusCls==='wf-stale') {
      actBtns =
        '<button class="cd-wf-btn" data-tid="'+t.id+'" onclick="event.stopPropagation();_cdPortExpand(this.dataset.tid)">↓ Cert detail</button>'+
        '<button class="cd-wf-btn" data-tid="'+t.id+'" onclick="event.stopPropagation();_cdPortRunSuite(this.dataset.tid)">Run suite</button>'+
        '<button class="cd-wf-btn primary" data-tid="'+t.id+'" onclick="event.stopPropagation();_s9DashOpenSimulator(this.dataset.tid)">Re-certify</button>';
    } else {
      actBtns =
        '<button class="cd-wf-btn" data-tid="'+t.id+'" onclick="event.stopPropagation();_cdPortExpand(this.dataset.tid)">↓ Detail</button>'+
        '<button class="cd-wf-btn" data-tid="'+t.id+'" onclick="event.stopPropagation();_cdPortRunSuite(this.dataset.tid)">Run suite</button>'+
        '<button class="cd-wf-btn primary" data-tid="'+t.id+'" onclick="event.stopPropagation();_s9DashOpenSimulator(this.dataset.tid)">Simulate</button>';
    }

    return '<div class="cd-wf '+statusCls+'" id="cd-wf-'+t.id+'" data-tid="'+t.id+'" onclick="_cdPortToggle(this.dataset.tid)">'+
      '<div class="cd-wf-hdr">'+
        '<div><div class="cd-wf-name">'+_cdEsc(t.name)+'</div><div class="cd-wf-ver">v'+_cdEsc(t.version||'—')+' · '+_cdEsc(t.status||'draft')+'</div></div>'+
        '<span class="cd-pill '+statusPillCls+'">'+statusLabel+'</span>'+
      '</div>'+
      '<div class="cd-wf-cov">'+
        '<div class="cd-cov-bar"><div class="cd-cov-fill" style="width:'+covPct+'%;background:'+covClr+'"></div></div>'+
        '<div class="cd-cov-pct" style="color:'+covClr+'">'+covPct+'%</div>'+
        '<div class="cd-cov-suite cd-t2">'+_cdEsc(suiteLine)+'</div>'+
      '</div>'+
      '<div class="cd-wf-dates"><span class="cd-wf-date">'+_cdEsc(certDateLine)+'</span><span class="cd-wf-date">'+_cdEsc(lastRunLine)+'</span></div>'+
      '<div class="cd-wf-acts">'+actBtns+'</div>'+
      '<div class="cd-wf-expand" id="cd-wf-exp-'+t.id+'" style="display:none"></div>'+
    '</div>';
  }).join('');
}

// ── Portfolio card interactions ────────────────────────────────────────────────
function _cdPortToggle(tmplId) {
  var exp = document.getElementById('cd-wf-exp-'+tmplId);
  if (!exp) return;
  if (exp.style.display === 'none') { _cdPortExpand(tmplId); }
  else { exp.style.display='none'; }
}

function _cdPortExpand(tmplId) {
  var exp = document.getElementById('cd-wf-exp-'+tmplId); if (!exp) return;
  if (exp.style.display !== 'none') { exp.style.display='none'; return; }
  var d = window._cdPortData || {};
  var cert    = (d.certByTmpl||{})[tmplId] || null;
  var scripts = (d.scriptObjsByTmpl||{})[tmplId] || [];
  var runs    = (d.runsByTmpl||{})[tmplId] || [];
  var paths   = (d.pathsByTmpl||{})[tmplId] || {total:0,covered:0};

  var latestByScript = {};
  runs.forEach(function(r){ if (r.script_id && !latestByScript[r.script_id]) latestByScript[r.script_id] = r; });

  var scriptRows = scripts.length
    ? scripts.map(function(s){
        var r = latestByScript[s.id];
        var dot = !r ? '#4a5568' : r.status==='passed' ? 'var(--cd-grn)' : 'var(--cd-red)';
        var lbl = !r ? 'Never run' : r.status==='passed'
          ? '✓ Passed · '+_cdRelTime(r.run_at)
          : '✗ Failed · '+_cdRelTime(r.run_at);
        return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)">'+
          '<div style="width:7px;height:7px;border-radius:50%;background:'+dot+';flex-shrink:0"></div>'+
          '<div style="font-size:11px;color:rgba(255,255,255,.75);flex:1">'+_cdEsc(s.name)+'</div>'+
          '<div style="font-size:10px;color:rgba(255,255,255,.4)">'+lbl+'</div>'+
          '<button style="font-size:9px;padding:2px 7px;border-radius:3px;border:1px solid rgba(255,255,255,.15);background:transparent;color:rgba(255,255,255,.5);cursor:pointer" data-sid="'+s.id+'" data-tid="'+tmplId+'" onclick="event.stopPropagation();_cdPortRunScript(this.dataset.sid,this.dataset.tid)">Run</button>'+
        '</div>';
      }).join('')
    : '<div style="font-size:11px;color:rgba(255,255,255,.3);padding:6px 0">No test scripts — template cannot be certified without scripts.</div>';

  var certBlock = cert
    ? '<div style="margin-top:10px;padding:8px 10px;background:rgba(255,255,255,.04);border-radius:4px;border:1px solid rgba(255,255,255,.08)">'+
        '<div style="font-size:9px;color:rgba(255,255,255,.35);letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px">Certificate</div>'+
        '<div style="display:flex;gap:16px;flex-wrap:wrap">'+
          '<div><div style="font-size:9px;color:rgba(255,255,255,.35)">Status</div><div style="font-size:11px;color:rgba(255,255,255,.8);font-weight:700">'+_cdEsc(cert.status)+'</div></div>'+
          '<div><div style="font-size:9px;color:rgba(255,255,255,.35)">Issued</div><div style="font-size:11px;color:rgba(255,255,255,.8)">'+_cdRelTime(cert.issued_at)+'</div></div>'+
          '<div><div style="font-size:9px;color:rgba(255,255,255,.35)">Version</div><div style="font-size:11px;color:rgba(255,255,255,.8)">v'+_cdEsc(cert.template_version||'—')+'</div></div>'+
          '<div><div style="font-size:9px;color:rgba(255,255,255,.35)">Coverage</div><div style="font-size:11px;color:rgba(255,255,255,.8)">'+paths.covered+'/'+paths.total+' paths</div></div>'+
        '</div>'+
      '</div>'
    : '<div style="margin-top:10px;font-size:11px;color:rgba(255,255,255,.3)">No certificate issued. Run all scripts to certify.</div>';

  exp.innerHTML =
    '<div style="border-top:1px solid rgba(255,255,255,.08);margin-top:8px;padding-top:10px">'+
      '<div style="font-size:9px;color:rgba(255,255,255,.35);letter-spacing:.07em;text-transform:uppercase;margin-bottom:6px">Test Scripts ('+scripts.length+')</div>'+
      scriptRows+
      certBlock+
    '</div>';
  exp.style.display = 'block';
}

function _cdPortRunSuite(tmplId) {
  _cdSwitchView('history');
  setTimeout(function(){
    if (typeof _cdHmStartAll === 'function') _cdHmStartAll();
    else { var b=document.getElementById('cd-hm-start-btn'); if(b) b.click(); }
  }, 300);
}

function _cdPortRunScript(scriptId, tmplId) {
  _s9DashOpenSimulator(tmplId);
}

function _cdPortSimulate(tmplId) {
  _s9DashOpenSimulator(tmplId);
  setTimeout(function(){
    var existing = document.getElementById('cd-sim-hint');
    if (existing) return;
    var hint = document.createElement('div');
    hint.id = 'cd-sim-hint';
    hint.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:8000;background:#1a2236;border:1px solid var(--cad,#00c9c9);border-radius:6px;padding:10px 18px;font-size:12px;font-family:Arial,sans-serif;color:rgba(255,255,255,.9);display:flex;align-items:center;gap:12px;box-shadow:0 4px 20px rgba(0,0,0,.6);max-width:520px';
    hint.innerHTML = '<div style="color:var(--cad,#00c9c9);font-size:16px;flex-shrink:0">&#9432;</div>'
      + '<div><strong>Template pre-selected.</strong> Choose a test script from the left panel, then click <strong>Run Script</strong> to simulate. Watch the DAG animate step-by-step.</div>'
      + '<div style="cursor:pointer;color:rgba(255,255,255,.4);font-size:16px;flex-shrink:0" onclick="this.parentElement.remove()">&#215;</div>';
    document.body.appendChild(hint);
    setTimeout(function(){ if(hint.parentElement) hint.remove(); }, 8000);
  }, 600);
}

function _cdPortWriteScripts(tmplId) {
  // Navigate to Library → template scripts tab
  if (typeof selectTemplate === 'function') {
    selectTemplate(tmplId).then(function(){ _s9Switch('library'); }).catch(function(){ _s9Switch('library'); });
  } else { _s9Switch('library'); }
}
window._cdPortToggle     = _cdPortToggle;
window._cdPortExpand     = _cdPortExpand;
window._cdPortRunSuite   = _cdPortRunSuite;
window._cdPortRunScript  = _cdPortRunScript;
window._cdPortWriteScripts = _cdPortWriteScripts;
window._cdPortSimulate = _cdPortSimulate;

// ── Request Queue

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