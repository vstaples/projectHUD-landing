// cdn-script-editor.js — CadenceHUD Visual BIST Script Editor
// LOAD ORDER: after cdn-bist.js
console.log('%c[cdn-script-editor] v20260404-SE3','background:#c47d18;color:#000;font-weight:700;padding:2px 8px;border-radius:3px');

// ── State ────────────────────────────────────────────────────────────────────
var _seScripts        = [];
var _seSelectedId     = null;
var _seSelectedStep   = null;
var _seDirty          = false;
var _seRecentRuns     = [];
var _seDragAction     = null;
var _seDragTmplSeq    = null;
var _seRunning        = false;
var _seFormFieldCache = {};
var _seEditorEl       = null;
var _seTmplSteps      = [];

// ── Iron rules helpers ───────────────────────────────────────────────────────
function _seEsc(s) {
  if (!s && s !== 0) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _seCoerceVal(v) {
  if (v === '' || v === null || v === undefined) return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  var n = Number(v);
  if (!isNaN(n) && String(v).trim() !== '') return n;
  return v;
}
function _seGenId() {
  return 's' + Math.random().toString(36).slice(2,7);
}

// ── Constants ────────────────────────────────────────────────────────────────
var SE_ACTION_META = {
  launch_instance:      { icon:'▶', label:'Launch',       color:'#7F77DD' },
  complete_step:        { icon:'✓', label:'Complete Step', color:'#EF9F27' },
  complete_form_section:{ icon:'◧', label:'Form Section',  color:'#2dd4bf' },
  assert_only:          { icon:'≡', label:'Assert Only',   color:'#60a5fa' },
  wait:                 { icon:'⏱', label:'Wait',          color:'rgba(255,255,255,.4)' },
};

var SE_OPS = ['eq','not_eq','gte','lte','contains','exists','not_exists'];

var SE_CHECK_BASE = [
  'instance.status',
  'step[N].state',
  'step[N].outcome',
  'step[N].loops',
  'step[N].route_to',
  'step[N].activated_at',
];

var SE_OUTCOME_BY_TYPE = {
  form:     ['submitted','saved_incomplete'],
  approval: ['approved','rejected','changes_requested'],
  signoff:  ['signed','declined'],
  meeting:  ['concluded','design_change'],
  trigger:  [],
};

// ── CSS ──────────────────────────────────────────────────────────────────────
var SE_CSS = '<style id="se-css">' + [
':root{--se-bg0:#0a0c10;--se-bg1:#10131a;--se-bg2:#181c25;--se-bg3:#1f242e;',
'--se-b:rgba(255,255,255,.06);--se-b2:rgba(255,255,255,.11);--se-b3:rgba(255,255,255,.18);',
'--se-t:rgba(255,255,255,.9);--se-t2:rgba(255,255,255,.6);--se-mu:rgba(255,255,255,.3);',
'--se-cad:#7F77DD;--se-cad2:rgba(127,119,221,.15);--se-cad3:rgba(127,119,221,.07);',
'--se-grn:#4ade80;--se-grn2:rgba(74,222,128,.12);',
'--se-amb:#EF9F27;--se-amb2:rgba(239,159,39,.13);',
'--se-red:#f87171;--se-red2:rgba(248,113,113,.13);',
'--se-teal:#2dd4bf;--se-blu:#60a5fa;}',

'#se-root{display:flex;flex-direction:column;height:100%;background:var(--se-bg0);',
'color:var(--se-t);font-family:Arial,sans-serif;font-size:12px;overflow:hidden}',

'#se-layout{display:flex;flex:1;min-height:0;overflow:hidden}',

/* Left panel */
'#se-left{width:188px;flex-shrink:0;background:var(--se-bg1);border-right:1px solid var(--se-b);',
'display:flex;flex-direction:column;overflow:hidden}',
'.se-ph{padding:7px 10px 5px;font-size:10px;font-weight:700;letter-spacing:.1em;',
'color:var(--se-mu);text-transform:uppercase;display:flex;align-items:center;',
'justify-content:space-between;border-bottom:1px solid var(--se-b);flex-shrink:0}',
'.se-padd{background:none;border:none;color:var(--se-cad);font-size:16px;',
'cursor:pointer;line-height:1;padding:0 2px}',
'.se-padd:hover{color:#fff}',

/* Script list */
'#se-slist{overflow-y:auto;flex-shrink:0;max-height:160px}',
'#se-slist::-webkit-scrollbar{width:2px}',
'#se-slist::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08)}',
'.se-si{padding:6px 10px;cursor:pointer;border-bottom:1px solid var(--se-b);',
'transition:background .1s;position:relative}',
'.se-si:hover{background:rgba(255,255,255,.03)}',
'.se-si.sel{background:var(--se-cad3);border-left:2px solid var(--se-cad);padding-left:8px}',
'.se-sin{font-size:11px;color:var(--se-t);margin-bottom:3px;line-height:1.3;',
'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.se-sim{display:flex;align-items:center;gap:4px}',
'.se-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}',

/* Action palette */
'#se-actgrid{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:8px 10px;flex-shrink:0}',
'.se-ac{padding:6px 5px;border:1px dashed var(--se-b2);border-radius:4px;cursor:grab;',
'text-align:center;transition:all .13s;background:var(--se-bg2);user-select:none}',
'.se-ac:hover{border-color:var(--se-cad);background:var(--se-cad3)}',
'.se-ac:active{cursor:grabbing}',
'.se-ac-icon{display:block;font-size:13px;margin-bottom:2px}',
'.se-ac-lbl{font-size:9px;color:var(--se-t2);letter-spacing:.04em}',

/* Template steps */
'#se-tscroll{overflow-y:auto;flex:1;min-height:0}',
'#se-tscroll::-webkit-scrollbar{width:2px}',
'#se-tscroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08)}',
'.se-ts{display:flex;align-items:center;gap:6px;padding:5px 10px;',
'border-bottom:1px solid var(--se-b);cursor:pointer;transition:background .1s}',
'.se-ts:hover{background:rgba(255,255,255,.04)}',
'.se-tsq{width:16px;height:16px;border-radius:3px;background:var(--se-bg3);',
'display:flex;align-items:center;justify-content:center;font-size:10px;',
'font-family:monospace;color:var(--se-cad);flex-shrink:0;font-weight:700}',
'.se-tsn{font-size:10px;color:var(--se-t2);flex:1;overflow:hidden;',
'text-overflow:ellipsis;white-space:nowrap}',
'.se-tst{font-size:9px;color:var(--se-mu);flex-shrink:0}',

/* Center */
'#se-center{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden}',
'#se-hdr{display:flex;align-items:center;gap:6px;padding:7px 10px;',
'border-bottom:1px solid var(--se-b);flex-shrink:0;background:var(--se-bg1)}',
'#se-title{flex:1;background:transparent;border:none;font-size:13px;',
'font-weight:600;color:var(--se-t);font-family:Arial,sans-serif;outline:none;',
'border-bottom:1px solid transparent;transition:border-color .15s}',
'#se-title:focus{border-bottom-color:var(--se-cad)}',
'.se-badge{font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;',
'padding:2px 7px;border-radius:10px;font-family:monospace}',
'.se-bd-pass{background:var(--se-grn2);color:var(--se-grn);border:1px solid rgba(74,222,128,.3)}',
'.se-bd-fail{background:var(--se-red2);color:var(--se-red);border:1px solid rgba(248,113,113,.3)}',
'.se-bd-new{background:var(--se-cad2);color:var(--se-cad);border:1px solid rgba(127,119,221,.3)}',
'.se-bd-run{background:var(--se-amb2);color:var(--se-amb);border:1px solid rgba(239,159,39,.3)}',
'.se-btn{display:inline-flex;align-items:center;gap:3px;padding:4px 10px;font-size:10px;',
'font-weight:600;border-radius:3px;cursor:pointer;border:1px solid var(--se-b2);',
'background:transparent;color:var(--se-t2);letter-spacing:.04em;',
'transition:all .12s;font-family:Arial,sans-serif;white-space:nowrap}',
'.se-btn:hover{background:rgba(255,255,255,.06);color:var(--se-t)}',
'.se-btn-cad{background:var(--se-cad2);border-color:rgba(127,119,221,.4);color:var(--se-cad)}',
'.se-btn-cad:hover{background:rgba(127,119,221,.25)}',
'.se-btn-grn{background:var(--se-grn2);border-color:rgba(74,222,128,.35);color:var(--se-grn)}',
'.se-btn-red{background:var(--se-red2);border-color:rgba(248,113,113,.35);color:var(--se-red)}',
'.se-btn-red:hover{background:rgba(248,113,113,.22)}',

/* Drop zone toolbar */
'#se-dztb{display:flex;align-items:center;gap:6px;padding:5px 10px;',
'background:var(--se-bg2);border-bottom:1px solid var(--se-b);flex-shrink:0}',
'#se-dz{flex:1;padding:4px 10px;border:1px dashed rgba(255,255,255,.1);border-radius:3px;',
'font-size:10px;color:var(--se-mu);text-align:center;transition:all .15s}',
'#se-dz.over{border-color:var(--se-cad);background:var(--se-cad3);color:var(--se-cad)}',

/* Timeline */
'#se-timeline{flex:1;overflow-y:auto;padding:10px}',
'#se-timeline::-webkit-scrollbar{width:3px}',
'#se-timeline::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08)}',

/* Fail banner */
'.se-banner{display:flex;align-items:flex-start;gap:8px;padding:7px 10px;',
'background:rgba(248,113,113,.07);border:1px solid rgba(248,113,113,.2);',
'border-radius:4px;margin-bottom:8px;font-size:10px;color:var(--se-red)}',
'.se-banner-id{font-weight:700;font-family:monospace;flex-shrink:0}',

/* Step cards */
'.se-card{border-radius:4px;border:1px solid var(--se-b);background:var(--se-bg2);',
'margin-bottom:6px;transition:border-color .15s;cursor:pointer}',
'.se-card:hover{border-color:var(--se-b2)}',
'.se-card.sel{border-color:var(--se-cad);background:rgba(127,119,221,.05)}',
'.se-card.fail{border-color:rgba(248,113,113,.35);background:rgba(248,113,113,.04)}',
'.se-card-hdr{display:flex;align-items:center;gap:6px;padding:6px 8px;',
'border-bottom:1px solid var(--se-b)}',
'.se-card-icon{width:20px;height:20px;border-radius:3px;display:flex;',
'align-items:center;justify-content:center;font-size:11px;flex-shrink:0}',
'.se-card-id{font-size:9px;font-family:monospace;color:var(--se-mu);flex-shrink:0}',
'.se-card-lbl{font-size:11px;font-weight:600;color:var(--se-t);flex:1;',
'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
'.se-card-del{background:none;border:none;color:rgba(255,255,255,.15);',
'cursor:pointer;font-size:13px;padding:0;line-height:1;transition:color .1s}',
'.se-card-del:hover{color:var(--se-red)}',
'.se-card-body{padding:6px 8px}',
'.se-frow{display:flex;align-items:center;gap:5px;margin-bottom:4px;flex-wrap:wrap}',
'.se-fl{font-size:9px;color:var(--se-mu);letter-spacing:.05em;',
'text-transform:uppercase;width:52px;flex-shrink:0}',
'.se-fval{font-size:10px;color:var(--se-t2);font-family:monospace;',
'background:var(--se-bg3);border:1px solid var(--se-b);border-radius:2px;',
'padding:1px 5px}',

/* Outcome chips */
'.se-oc{display:inline-flex;align-items:center;padding:1px 7px;border-radius:8px;',
'font-size:9px;font-weight:700;font-family:monospace;letter-spacing:.03em}',
'.se-oc-sub{background:rgba(96,165,250,.13);color:#60a5fa;border:1px solid rgba(96,165,250,.3)}',
'.se-oc-app{background:var(--se-grn2);color:var(--se-grn);border:1px solid rgba(74,222,128,.3)}',
'.se-oc-rej{background:var(--se-red2);color:var(--se-red);border:1px solid rgba(248,113,113,.3)}',
'.se-oc-dec{background:var(--se-amb2);color:var(--se-amb);border:1px solid rgba(239,159,39,.3)}',
'.se-oc-def{background:var(--se-bg3);color:var(--se-t2);border:1px solid var(--se-b2)}',

/* Route-back arc indicator */
'.se-arc{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;',
'background:rgba(248,113,113,.07);border:1px solid rgba(248,113,113,.2);',
'border-radius:3px;font-size:9px;color:var(--se-red);font-family:monospace;margin-top:3px}',

/* Assertions */
'.se-asc-list{margin-top:5px;display:flex;flex-direction:column;gap:3px}',
'.se-arow{display:flex;align-items:center;gap:4px;padding:3px 6px;',
'background:var(--se-bg0);border-radius:3px;border:1px solid var(--se-b)}',
'.se-arow.fail{border-color:rgba(248,113,113,.3);background:rgba(248,113,113,.04)}',
'.se-arow.pass{border-color:rgba(74,222,128,.25)}',
'.se-a-check{font-size:9px;color:var(--se-teal);font-family:monospace;flex:1}',
'.se-a-op{font-size:9px;font-weight:700;color:var(--se-amb);font-family:monospace}',
'.se-a-val{font-size:9px;color:var(--se-t2);font-family:monospace}',
'.se-a-res{font-size:9px;font-weight:700;margin-left:auto;flex-shrink:0}',
'.se-a-del{background:none;border:none;color:rgba(255,255,255,.15);',
'cursor:pointer;font-size:11px;padding:0 0 0 3px;line-height:1}',
'.se-a-del:hover{color:var(--se-red)}',

/* Diff block */
'.se-diff{background:var(--se-bg3);border:1px solid rgba(248,113,113,.2);',
'border-radius:3px;padding:5px 8px;margin-top:4px;font-size:9px}',
'.se-diff-t{color:var(--se-red);font-weight:700;margin-bottom:3px}',
'.se-diff-row{display:flex;gap:6px;font-family:monospace;margin-bottom:2px}',
'.se-diff-l{color:var(--se-mu);width:44px;flex-shrink:0}',
'.se-diff-e{color:var(--se-grn)}',
'.se-diff-a{color:var(--se-red)}',

/* Add assertion inline */
'.se-add-asc{display:flex;align-items:center;gap:5px;margin-top:5px;flex-wrap:wrap}',
'.se-asc-sel{font-size:10px;font-family:monospace;background:var(--se-bg0);',
'border:1px solid var(--se-b);border-radius:3px;padding:2px 5px;',
'color:var(--se-t2);cursor:pointer;outline:none}',
'.se-asc-sel:focus{border-color:var(--se-cad)}',
'.se-asc-inp{font-size:10px;font-family:monospace;background:var(--se-bg0);',
'border:1px solid var(--se-b);border-radius:3px;padding:2px 5px;',
'color:var(--se-t);width:60px;outline:none}',
'.se-asc-inp:focus{border-color:var(--se-cad)}',

/* Add step row */
'.se-addrow{display:flex;gap:5px;padding:4px 0;flex-wrap:wrap}',
'.se-addchip{padding:3px 9px;border:1px dashed rgba(255,255,255,.1);border-radius:3px;',
'font-size:9px;color:var(--se-mu);cursor:pointer;transition:all .12s;',
'background:transparent;font-family:Arial,sans-serif}',
'.se-addchip:hover{border-color:var(--se-cad);color:var(--se-cad);background:var(--se-cad3)}',

/* Footer */
'#se-footer{display:flex;align-items:center;gap:8px;padding:5px 10px;',
'background:var(--se-bg1);border-top:1px solid var(--se-b);flex-shrink:0;font-size:10px}',
'.se-fsel{font-size:10px;font-family:Arial,sans-serif;background:var(--se-bg0);',
'border:1px solid var(--se-b);border-radius:3px;padding:2px 6px;',
'color:var(--se-t2);cursor:pointer;outline:none}',

/* Right panel */
'#se-right{width:210px;flex-shrink:0;background:var(--se-bg1);',
'border-left:1px solid var(--se-b);display:flex;flex-direction:column;overflow:hidden}',
'.se-rp-sec{border-bottom:1px solid var(--se-b);padding:9px 10px;flex-shrink:0}',
'.se-rp-t{font-size:9px;font-weight:700;letter-spacing:.1em;color:var(--se-mu);',
'text-transform:uppercase;margin-bottom:7px}',
'.se-stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}',
'.se-stat-c{background:var(--se-bg2);border-radius:3px;padding:6px 8px;border:1px solid var(--se-b)}',
'.se-stat-v{font-size:17px;font-weight:700;font-family:monospace;line-height:1;margin-bottom:2px}',
'.se-stat-l{font-size:9px;color:var(--se-mu);letter-spacing:.05em;text-transform:uppercase}',

/* Recent runs */
'.se-run-row{display:flex;align-items:center;gap:6px;padding:4px 0;',
'border-bottom:1px solid var(--se-b)}',
'.se-run-row:last-child{border-bottom:none}',
'.se-run-n{font-size:10px;color:var(--se-t2);flex:1;overflow:hidden;',
'text-overflow:ellipsis;white-space:nowrap}',
'.se-run-t{font-size:9px;color:var(--se-mu);font-family:monospace;flex-shrink:0}',

/* Property inspector */
'#se-pi{flex:1;overflow-y:auto;padding:9px 10px;min-height:0}',
'#se-pi::-webkit-scrollbar{width:2px}',
'#se-pi::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08)}',
'.se-pi-row{display:flex;align-items:center;gap:5px;margin-bottom:7px}',
'.se-pi-lbl{font-size:9px;color:var(--se-mu);letter-spacing:.05em;',
'text-transform:uppercase;width:64px;flex-shrink:0}',
'.se-pi-sel{font-size:10px;font-family:monospace;background:var(--se-bg0);',
'border:1px solid var(--se-b);border-radius:3px;padding:2px 5px;',
'color:var(--se-t2);width:100%;outline:none;cursor:pointer}',
'.se-pi-sel:focus{border-color:var(--se-cad)}',
'.se-pi-inp{font-size:10px;font-family:monospace;background:var(--se-bg0);',
'border:1px solid var(--se-b);border-radius:3px;padding:2px 5px;',
'color:var(--se-t);width:100%;outline:none}',
'.se-pi-inp:focus{border-color:var(--se-cad)}',
'.se-pi-note{font-size:9px;color:var(--se-mu);line-height:1.5;',
'margin-bottom:7px;font-style:italic}',

/* Gate */
'.se-gate-pass{background:var(--se-grn2);border:1px solid rgba(74,222,128,.3);',
'border-radius:3px;padding:7px 9px;margin-bottom:6px}',
'.se-gate-fail{background:var(--se-red2);border:1px solid rgba(248,113,113,.3);',
'border-radius:3px;padding:7px 9px;margin-bottom:6px}',
'.se-gate-warn{background:var(--se-amb2);border:1px solid rgba(239,159,39,.3);',
'border-radius:3px;padding:7px 9px;margin-bottom:6px}',
'.se-gate-t{font-size:10px;font-weight:700;margin-bottom:2px}',
'.se-gate-d{font-size:9px;opacity:.8;line-height:1.5}',
'</style>'].join('');

// ── Entry point ──────────────────────────────────────────────────────────────
// targetElId: ID of the container element to render into (default: 'tmpl-tests-body')
async function seOpenEditor(templateId, targetElId) {
  var targetId = targetElId || 'tmpl-tests-body';
  _seEditorEl = document.getElementById(targetId);
  if (!_seEditorEl) {
    console.warn('[cdn-script-editor] Target element not found:', targetId);
    return;
  }

  _seEditorEl.innerHTML = '<div style="padding:20px;color:rgba(255,255,255,.3);font-size:12px;font-family:Arial,sans-serif">Loading…</div>';

  var tmplId = templateId || _selectedTmpl?.id;
  if (!tmplId) {
    _seEditorEl.innerHTML = '<div style="padding:20px;color:rgba(248,113,113,.7);font-size:12px;font-family:Arial,sans-serif">No template selected.</div>';
    return;
  }

  var results = await Promise.all([
    API.get('bist_test_scripts?firm_id=eq.'+FIRM_ID_CAD+'&template_id=eq.'+tmplId+'&order=created_at.asc').catch(function(){return [];}),
    API.get('bist_runs?firm_id=eq.'+FIRM_ID_CAD+'&template_id=eq.'+tmplId+'&order=run_at.desc&limit=40').catch(function(){return [];}),
    API.get('workflow_template_steps?template_id=eq.'+tmplId+'&order=sequence_order.asc').catch(function(){return [];})
  ]);

  var rawScripts = results[0] || [];
  _seRecentRuns  = results[1] || [];
  _seTmplSteps   = results[2] || [];

  _seScripts = rawScripts.map(function(row) {
    var spec;
    try { spec = typeof row.script === 'string' ? JSON.parse(row.script) : row.script; }
    catch(e) { spec = { name: row.name || 'Untitled', steps: [], cleanup: 'delete' }; }
    return { id: row.id, name: row.name || spec.name || 'Untitled', spec: spec, _raw: row };
  });

  _seSelectedId   = _seScripts.length ? _seScripts[0].id : null;
  _seSelectedStep = null;
  _seDirty        = false;

  seRenderEditor();
}

// ── Full render ──────────────────────────────────────────────────────────────
function seRenderEditor() {
  if (!_seEditorEl) return;

  var sc = _seGetSelected();
  var lastRun = _seLastRunFor(_seSelectedId);

  var html = SE_CSS;
  html += '<div id="se-root">';

  // Layout
  html += '<div id="se-layout">';

  // LEFT
  html += _seRenderLeft();

  // CENTER
  html += '<div id="se-center">';
  html += _seRenderHeader(sc, lastRun);
  html += _seRenderDzToolbar();
  html += '<div id="se-timeline">';
  if (sc) html += _seRenderTimeline(sc, lastRun);
  else html += '<div style="padding:20px;color:var(--se-mu);font-size:12px;font-family:Arial,sans-serif">Select or create a script to begin.</div>';
  html += '</div>';
  html += _seRenderFooter(sc);
  html += '</div>'; // #se-center

  // RIGHT
  html += _seRenderRight(sc);

  html += '</div>'; // #se-layout
  html += '</div>'; // #se-root

  _seEditorEl.innerHTML = html;
  _seBindEvents();
}

// ── Left panel ───────────────────────────────────────────────────────────────
function _seRenderLeft() {
  var html = '<div id="se-left">';

  // Script list
  html += '<div class="se-ph">Scripts<button class="se-padd" onclick="seNewScript()" title="New script">+</button></div>';
  html += '<div id="se-slist">';
  if (!_seScripts.length) {
    html += '<div style="padding:10px;font-size:10px;color:var(--se-mu);font-family:Arial,sans-serif;font-style:italic">No scripts yet</div>';
  }
  _seScripts.forEach(function(sc) {
    var run = _seLastRunFor(sc.id);
    var isSel = sc.id === _seSelectedId;
    var dotColor = !run ? 'var(--se-mu)' : run.status === 'passed' ? 'var(--se-grn)' : 'var(--se-red)';
    var statusTxt = !run ? 'NOT RUN' : run.status === 'passed' ? 'PASSING' : 'FAILING';
    var statusColor = !run ? 'var(--se-mu)' : run.status === 'passed' ? 'var(--se-grn)' : 'var(--se-red)';
    var steps = (sc.spec.steps||[]).length;
    html += '<div class="se-si'+(isSel?' sel':'')+'" onclick="seSelectScript(\''+sc.id+'\')">';
    html += '<div class="se-sin">'+_seEsc(sc.name)+'</div>';
    html += '<div class="se-sim">';
    html += '<div class="se-dot" style="background:'+dotColor+'"></div>';
    html += '<span style="font-size:9px;color:'+statusColor+'">'+statusTxt+'</span>';
    html += '<span style="font-size:9px;color:var(--se-mu);margin-left:auto;font-family:monospace">'+steps+' steps</span>';
    html += '</div></div>';
  });
  html += '</div>';

  // Action palette
  html += '<div class="se-ph" style="margin-top:4px">Action Blocks</div>';
  html += '<div id="se-actgrid">';
  Object.keys(SE_ACTION_META).forEach(function(action) {
    var m = SE_ACTION_META[action];
    html += '<div class="se-ac" draggable="true" ondragstart="sePalDragStart(event,\''+action+'\')" ondragend="sePalDragEnd(event)">';
    html += '<span class="se-ac-icon" style="color:'+m.color+'">'+m.icon+'</span>';
    html += '<span class="se-ac-lbl">'+m.label+'</span>';
    html += '</div>';
  });
  html += '</div>';

  // Template steps
  html += '<div class="se-ph">Template Steps</div>';
  html += '<div id="se-tscroll">';
  if (!_seTmplSteps.length) {
    html += '<div style="padding:8px 10px;font-size:10px;color:var(--se-mu);font-style:italic">No steps found</div>';
  }
  _seTmplSteps.forEach(function(ts) {
    html += '<div class="se-ts" onclick="seInsertTmplStep('+ts.sequence_order+')">';
    html += '<div class="se-tsq">'+ts.sequence_order+'</div>';
    html += '<div class="se-tsn">'+_seEsc(ts.name)+'</div>';
    html += '<div class="se-tst">'+_seEsc(ts.step_type||'')+'</div>';
    html += '</div>';
  });
  html += '</div>';

  html += '</div>'; // #se-left
  return html;
}

// ── Header ───────────────────────────────────────────────────────────────────
function _seRenderHeader(sc, lastRun) {
  var badgeCls = 'se-bd-new', badgeTxt = 'NEW';
  if (lastRun) {
    if (lastRun.status === 'passed') { badgeCls = 'se-bd-pass'; badgeTxt = 'PASSING'; }
    else { badgeCls = 'se-bd-fail'; badgeTxt = 'FAILING'; }
  }
  if (_seDirty) { badgeCls = 'se-bd-run'; badgeTxt = 'UNSAVED'; }

  var html = '<div id="se-hdr">';
  if (sc) {
    html += '<input id="se-title" value="'+_seEsc(sc.name)+'" onchange="seRenameScript(this.value)" placeholder="Script name…"/>';
    html += '<span class="se-badge '+badgeCls+'" id="se-badge">'+badgeTxt+'</span>';
    html += '<button class="se-btn" onclick="seRunScript()" title="Run this script">▶ Run</button>';
    html += '<button class="se-btn se-btn-cad" onclick="seSaveScript()">'+(window._seDirty?'● ':'')+'Save</button>';
    html += '<button class="se-btn se-btn-red" onclick="seDeleteScript()" title="Delete script">🗑</button>';
  } else {
    html += '<span style="flex:1;font-size:12px;color:var(--se-mu);font-family:Arial,sans-serif">No script selected</span>';
  }
  html += '</div>';
  return html;
}

// ── Drop zone toolbar ────────────────────────────────────────────────────────
function _seRenderDzToolbar() {
  return '<div id="se-dztb">'+
    '<div id="se-dz" ondragover="seDzOver(event)" ondragleave="seDzLeave()" ondrop="seDzDrop(event)">'+
    '← Drag action block here to append</div>'+
    '</div>';
}

// ── Timeline ─────────────────────────────────────────────────────────────────
function _seRenderTimeline(sc, lastRun) {
  var steps = sc.spec.steps || [];
  var html = '';

  // Fail banner
  if (lastRun && lastRun.status !== 'passed' && lastRun.failure_step) {
    var reason = lastRun.failure_reason || 'Assertion failed';
    html += '<div class="se-banner">';
    html += '<span class="se-banner-id">✕ '+_seEsc(lastRun.failure_step)+'</span>';
    html += '<span>'+_seEsc(reason)+'</span>';
    html += '</div>';
  }

  steps.forEach(function(stp, idx) {
    html += _seRenderCard(stp, idx, sc, lastRun);
  });

  // Add row
  html += '<div class="se-addrow">';
  html += '<button class="se-addchip" onclick="seQuickAdd(\'launch_instance\')">+ launch</button>';
  html += '<button class="se-addchip" onclick="seQuickAdd(\'complete_step\')">+ complete step</button>';
  html += '<button class="se-addchip" onclick="seQuickAdd(\'assert_only\')">+ assert only</button>';
  html += '<button class="se-addchip" onclick="seQuickAdd(\'wait\')">+ wait</button>';
  html += '</div>';

  return html;
}

// ── Step card ─────────────────────────────────────────────────────────────────
function _seRenderCard(stp, idx, sc, lastRun) {
  var meta     = SE_ACTION_META[stp.action] || { icon:'?', label:stp.action, color:'#888' };
  var isSel    = stp.id === _seSelectedStep;
  var isFail   = lastRun && lastRun.failure_step === stp.id;
  var cls      = 'se-card' + (isSel?' sel':'') + (isFail?' fail':'');
  var tmplStep = stp.params && stp.params.step_seq ? _seTmplStepBySeq(stp.params.step_seq) : null;
  var stepName = tmplStep ? tmplStep.name : (stp.action === 'launch_instance' ? 'Instance Launch' : meta.label);
  var actor    = stp.params && stp.params.actor ? stp.params.actor.replace(/_/g,' ') : '';
  var outcome  = stp.params && stp.params.outcome ? stp.params.outcome : '';
  var routeSeq = stp.params && stp.params.route_to_seq != null ? stp.params.route_to_seq : null;
  var asserts  = stp.asserts || [];

  var html = '<div class="'+cls+'" id="se-c-'+stp.id+'" onclick="seSelectStep(\''+stp.id+'\')">';

  // Card header
  html += '<div class="se-card-hdr">';
  html += '<div class="se-card-icon" style="background:'+meta.color+'22;color:'+meta.color+'">'+meta.icon+'</div>';
  html += '<span class="se-card-id">'+_seEsc(stp.id)+'</span>';
  html += '<span class="se-card-lbl">'+_seEsc(stepName)+'</span>';
  if (stp.params && stp.params.step_seq) {
    html += '<span class="se-fval" style="margin-left:auto">seq '+stp.params.step_seq+'</span>';
  }
  html += '<button class="se-card-del" onclick="event.stopPropagation();seDeleteStep(\''+stp.id+'\')" title="Delete step">✕</button>';
  html += '</div>';

  // Card body — only for selected or failing
  if (isSel || isFail || asserts.length > 0 || routeSeq != null) {
    html += '<div class="se-card-body">';

    // Actor + outcome row
    if (actor || outcome) {
      html += '<div class="se-frow">';
      if (actor) {
        html += '<span class="se-fl">Actor</span>';
        html += '<span class="se-fval">'+_seEsc(actor)+'</span>';
      }
      if (outcome) {
        html += '<span class="se-fl" style="margin-left:8px">Outcome</span>';
        html += '<span class="'+_seOutcomeClass(outcome)+'">'+_seEsc(outcome)+'</span>';
      }
      html += '</div>';
    }

    // Route-back
    if (routeSeq != null) {
      var routeTarget = _seTmplStepBySeq(routeSeq);
      html += '<div class="se-arc">↩ routes back to seq '+routeSeq;
      if (routeTarget) html += ' — '+_seEsc(routeTarget.name);
      html += '</div>';
    }

    // Assertions
    if (asserts.length) {
      html += '<div class="se-asc-list">';
      asserts.forEach(function(a, ai) {
        var opKey = Object.keys(a).find(function(k){ return k !== 'check'; }) || 'eq';
        var aVal  = a[opKey];
        var aPass = _seAssertResult(a, lastRun, stp.id);
        var aRowCls = 'se-arow' + (aPass === false ? ' fail' : aPass === true ? ' pass' : '');
        html += '<div class="'+aRowCls+'">';
        html += '<span class="se-a-check">'+_seEsc(a.check)+'</span>';
        html += '<span class="se-a-op">'+opKey+'</span>';
        html += '<span class="se-a-val">'+_seEsc(String(aVal))+'</span>';
        if (aPass === true)  html += '<span class="se-a-res" style="color:var(--se-grn)">✓</span>';
        if (aPass === false) html += '<span class="se-a-res" style="color:var(--se-red)">✕</span>';
        html += '<button class="se-a-del" onclick="event.stopPropagation();seDeleteAssert(\''+stp.id+'\','+ai+')">✕</button>';
        html += '</div>';

        // Diff block for failed assertion
        if (aPass === false && lastRun && lastRun.failure_assertion) {
          var fa = lastRun.failure_assertion;
          if (fa.check === a.check) {
            html += '<div class="se-diff">';
            html += '<div class="se-diff-t">✕ Assertion failed</div>';
            html += '<div class="se-diff-row"><span class="se-diff-l">expected</span><span class="se-diff-e">'+_seEsc(String(aVal))+'</span></div>';
            if (lastRun.failure_reason) {
              var gotMatch = lastRun.failure_reason.match(/got (.+)$/);
              if (gotMatch) html += '<div class="se-diff-row"><span class="se-diff-l">actual</span><span class="se-diff-a">'+_seEsc(gotMatch[1])+'</span></div>';
            }
            html += '</div>';
          }
        }
      });
      html += '</div>';
    }

    // Add assertion controls (when selected)
    if (isSel) {
      html += _seRenderAddAssert(stp);
    }

    html += '</div>'; // .se-card-body
  }

  html += '</div>'; // .se-card
  return html;
}

// ── Add assertion controls ───────────────────────────────────────────────────
function _seRenderAddAssert(stp) {
  var tmplStep = stp.params && stp.params.step_seq ? _seTmplStepBySeq(stp.params.step_seq) : null;
  var seq      = stp.params && stp.params.step_seq ? stp.params.step_seq : 1;

  // Build check path options
  var checks = ['instance.status'];
  for (var i = 1; i <= Math.max(seq, _seTmplSteps.length); i++) {
    checks.push('step['+i+'].state');
    checks.push('step['+i+'].outcome');
    checks.push('step['+i+'].loops');
  }

  var html = '<div class="se-add-asc" style="margin-top:6px;border-top:1px solid var(--se-b);padding-top:6px">';
  html += '<span style="font-size:9px;color:var(--se-mu);text-transform:uppercase;letter-spacing:.06em">Add assert:</span>';
  html += '<select class="se-asc-sel" id="se-nc-'+stp.id+'" onclick="event.stopPropagation()">';
  checks.forEach(function(c) {
    html += '<option value="'+_seEsc(c)+'">'+_seEsc(c)+'</option>';
  });
  html += '</select>';

  html += '<select class="se-asc-sel" id="se-no-'+stp.id+'" onclick="event.stopPropagation()">';
  SE_OPS.forEach(function(op) {
    html += '<option value="'+op+'">'+op+'</option>';
  });
  html += '</select>';

  html += '<input class="se-asc-inp" id="se-nv-'+stp.id+'" placeholder="value" onclick="event.stopPropagation()"/>';
  html += '<button class="se-btn se-btn-cad" onclick="event.stopPropagation();seAddAssert(\''+stp.id+'\')" style="padding:2px 8px;font-size:9px">+ Add</button>';
  html += '</div>';
  return html;
}

// ── Footer ───────────────────────────────────────────────────────────────────
function _seRenderFooter(sc) {
  var cleanup = sc && sc.spec.cleanup ? sc.spec.cleanup : 'delete';
  var html = '<div id="se-footer">';
  html += '<span style="color:var(--se-mu);letter-spacing:.06em;text-transform:uppercase">Cleanup:</span>';
  html += '<select class="se-fsel" onchange="seSetCleanup(this.value)">';
  ['delete','suspend','keep'].forEach(function(v) {
    html += '<option value="'+v+'"'+(cleanup===v?' selected':'')+'>'+
      {delete:'Delete instance after run',suspend:'Suspend instance',keep:'Keep instance'}[v]+'</option>';
  });
  html += '</select>';
  html += '<span style="margin-left:auto;font-family:monospace;color:var(--se-mu);font-size:10px" id="se-runmeta">';
  if (sc) {
    var run = _seLastRunFor(sc.id);
    if (run) {
      var d = new Date(run.run_at);
      html += 'Last run: '+d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
      if (run.duration_ms) html += ' · '+Math.round(run.duration_ms/1000)+'s';
    }
  }
  html += '</span>';
  html += '</div>';
  return html;
}

// ── Right panel ──────────────────────────────────────────────────────────────
function _seRenderRight(sc) {
  var html = '<div id="se-right">';

  // Suite stats
  html += '<div class="se-rp-sec">';
  html += '<div class="se-rp-t">Suite</div>';
  html += '<div class="se-stat-grid">';
  var passing = 0, failing = 0, notrun = 0;
  _seScripts.forEach(function(s) {
    var r = _seLastRunFor(s.id);
    if (!r) notrun++;
    else if (r.status === 'passed') passing++;
    else failing++;
  });
  var totalAsserts = sc ? (sc.spec.steps||[]).reduce(function(n,s){ return n+(s.asserts||[]).length; }, 0) : 0;
  html += '<div class="se-stat-c"><div class="se-stat-v" style="color:var(--se-grn)">'+passing+'</div><div class="se-stat-l">Passing</div></div>';
  html += '<div class="se-stat-c"><div class="se-stat-v" style="color:var(--se-red)">'+failing+'</div><div class="se-stat-l">Failing</div></div>';
  html += '<div class="se-stat-c"><div class="se-stat-v" style="color:var(--se-mu)">'+notrun+'</div><div class="se-stat-l">Not run</div></div>';
  html += '<div class="se-stat-c"><div class="se-stat-v" style="color:var(--se-amb)">'+totalAsserts+'</div><div class="se-stat-l">Assertions</div></div>';
  html += '</div></div>';

  // Recent runs
  html += '<div class="se-rp-sec">';
  html += '<div class="se-rp-t">Recent runs</div>';
  var shown = _seRecentRuns.slice(0, 6);
  if (!shown.length) {
    html += '<div style="font-size:10px;color:var(--se-mu);font-style:italic">No runs yet</div>';
  }
  shown.forEach(function(r) {
    var dot = r.status === 'passed' ? 'var(--se-grn)' : 'var(--se-red)';
    var sc2 = _seScripts.find(function(s){ return s.id === r.script_id; });
    var name = sc2 ? sc2.name : r.script_id;
    var dur  = r.duration_ms ? Math.round(r.duration_ms/1000)+'s' : '';
    html += '<div class="se-run-row">';
    html += '<div class="se-dot" style="background:'+dot+'"></div>';
    html += '<span class="se-run-n">'+_seEsc(name)+'</span>';
    html += '<span class="se-run-t">'+dur+'</span>';
    html += '</div>';
  });
  html += '</div>';

  // Property inspector
  html += '<div id="se-pi">';
  html += _seRenderPropInspector();
  html += '</div>';

  // Gate status
  html += '<div class="se-rp-sec">';
  html += _seRenderGate();
  html += '</div>';

  html += '</div>'; // #se-right
  return html;
}

// ── Property inspector ───────────────────────────────────────────────────────
function _seRenderPropInspector() {
  var html = '<div class="se-rp-t">Step Properties</div>';
  if (!_seSelectedStep) {
    html += '<div class="se-pi-note">Click a step card to inspect and edit its properties.</div>';
    return html;
  }
  var sc = _seGetSelected(); if (!sc) return html;
  var stp = (sc.spec.steps||[]).find(function(s){ return s.id === _seSelectedStep; });
  if (!stp) return html;

  var meta = SE_ACTION_META[stp.action] || {};

  // Action type (read-only display)
  html += '<div class="se-pi-row">';
  html += '<span class="se-pi-lbl">Action</span>';
  html += '<span class="se-fval">'+_seEsc(meta.label||stp.action)+'</span>';
  html += '</div>';

  if (stp.action === 'complete_step' || stp.action === 'complete_form_section') {
    // Step seq
    html += '<div class="se-pi-row">';
    html += '<span class="se-pi-lbl">Step seq</span>';
    html += '<select class="se-pi-sel" onchange="seUpdateParam(\''+stp.id+'\',\'step_seq\',parseInt(this.value))">';
    _seTmplSteps.forEach(function(ts) {
      var sel = stp.params && stp.params.step_seq === ts.sequence_order ? ' selected' : '';
      html += '<option value="'+ts.sequence_order+'"'+sel+'>'+ts.sequence_order+' — '+_seEsc(ts.name)+'</option>';
    });
    html += '</select></div>';

    // Actor
    var actors = _seGetActors();
    html += '<div class="se-pi-row">';
    html += '<span class="se-pi-lbl">Actor</span>';
    html += '<select class="se-pi-sel" onchange="seUpdateParam(\''+stp.id+'\',\'actor\',this.value)">';
    html += '<option value="">— none —</option>';
    actors.forEach(function(a) {
      var sel = stp.params && stp.params.actor === a.slug ? ' selected' : '';
      html += '<option value="'+_seEsc(a.slug)+'"'+sel+'>'+_seEsc(a.name)+'</option>';
    });
    html += '</select></div>';

    // Outcome (for complete_step)
    if (stp.action === 'complete_step') {
      var tmplStep = stp.params && stp.params.step_seq ? _seTmplStepBySeq(stp.params.step_seq) : null;
      var outcomes = tmplStep ? (SE_OUTCOME_BY_TYPE[tmplStep.step_type] || []) : [];
      html += '<div class="se-pi-row">';
      html += '<span class="se-pi-lbl">Outcome</span>';
      html += '<select class="se-pi-sel" onchange="seUpdateParam(\''+stp.id+'\',\'outcome\',this.value)">';
      html += '<option value="">— none —</option>';
      outcomes.forEach(function(o) {
        var sel = stp.params && stp.params.outcome === o ? ' selected' : '';
        html += '<option value="'+_seEsc(o)+'"'+sel+'>'+_seEsc(o)+'</option>';
      });
      // Allow current value even if not in list
      if (stp.params && stp.params.outcome && !outcomes.includes(stp.params.outcome)) {
        html += '<option value="'+_seEsc(stp.params.outcome)+'" selected>'+_seEsc(stp.params.outcome)+' (custom)</option>';
      }
      html += '</select></div>';

      // Route back
      html += '<div class="se-pi-row">';
      html += '<span class="se-pi-lbl">Route back</span>';
      html += '<select class="se-pi-sel" onchange="seUpdateRouteBack(\''+stp.id+'\',this.value)">';
      html += '<option value="">— none —</option>';
      _seTmplSteps.forEach(function(ts) {
        var sel = stp.params && String(stp.params.route_to_seq) === String(ts.sequence_order) ? ' selected' : '';
        html += '<option value="'+ts.sequence_order+'"'+sel+'>seq '+ts.sequence_order+' — '+_seEsc(ts.name)+'</option>';
      });
      html += '</select></div>';
    }

    // Notes
    html += '<div class="se-pi-row">';
    html += '<span class="se-pi-lbl">Notes</span>';
    html += '<input class="se-pi-inp" value="'+_seEsc((stp.params && stp.params.notes)||'')+'" ';
    html += 'onchange="seUpdateParam(\''+stp.id+'\',\'notes\',this.value)" placeholder="Optional notes"/>';
    html += '</div>';
  }

  if (stp.action === 'launch_instance') {
    html += '<div class="se-pi-row">';
    html += '<span class="se-pi-lbl">Title</span>';
    html += '<input class="se-pi-inp" value="'+_seEsc((stp.params && stp.params.title)||'')+'" ';
    html += 'onchange="seUpdateParam(\''+stp.id+'\',\'title\',this.value)"/>';
    html += '</div>';

    var actors2 = _seGetActors();
    html += '<div class="se-pi-row">';
    html += '<span class="se-pi-lbl">Launched by</span>';
    html += '<select class="se-pi-sel" onchange="seUpdateParam(\''+stp.id+'\',\'launched_by\',this.value)">';
    html += '<option value="">— none —</option>';
    actors2.forEach(function(a) {
      var sel = stp.params && stp.params.launched_by === a.slug ? ' selected' : '';
      html += '<option value="'+_seEsc(a.slug)+'"'+sel+'>'+_seEsc(a.name)+'</option>';
    });
    html += '</select></div>';
  }

  if (stp.action === 'wait') {
    html += '<div class="se-pi-row">';
    html += '<span class="se-pi-lbl">Wait ms</span>';
    html += '<input class="se-pi-inp" type="number" value="'+_seEsc((stp.params && stp.params.ms)||500)+'" ';
    html += 'onchange="seUpdateParam(\''+stp.id+'\',\'ms\',parseInt(this.value))" style="width:80px"/>';
    html += '</div>';
  }

  return html;
}

// ── Gate status ──────────────────────────────────────────────────────────────
function _seRenderGate() {
  var allPass = _seScripts.length > 0 && _seScripts.every(function(s) {
    var r = _seLastRunFor(s.id);
    return r && r.status === 'passed';
  });
  var anyFail = _seScripts.some(function(s) {
    var r = _seLastRunFor(s.id);
    return r && r.status !== 'passed';
  });
  var noneRun = _seScripts.length > 0 && _seScripts.every(function(s) { return !_seLastRunFor(s.id); });
  var noScripts = _seScripts.length === 0;

  var html = '';
  if (noScripts) {
    html += '<div class="se-gate-fail"><div class="se-gate-t" style="color:var(--se-red)">✕ No test coverage</div>';
    html += '<div class="se-gate-d" style="color:var(--se-red)">Add scripts before releasing.</div></div>';
  } else if (allPass) {
    html += '<div class="se-gate-pass"><div class="se-gate-t" style="color:var(--se-grn)">✓ Cleared for release</div>';
    html += '<div class="se-gate-d" style="color:var(--se-grn)">All tests passing.</div></div>';
  } else if (anyFail) {
    var failCount = _seScripts.filter(function(s){ var r=_seLastRunFor(s.id); return r&&r.status!=='passed'; }).length;
    html += '<div class="se-gate-fail"><div class="se-gate-t" style="color:var(--se-red)">✕ Cannot release</div>';
    html += '<div class="se-gate-d" style="color:var(--se-red)">'+failCount+' test'+(failCount>1?'s':'')+' failing.</div></div>';
  } else {
    html += '<div class="se-gate-warn"><div class="se-gate-t" style="color:var(--se-amb)">⚠ Not run</div>';
    html += '<div class="se-gate-d" style="color:var(--se-amb)">Run all scripts against current version.</div></div>';
  }
  return html;
}

// ── Partial refreshes ────────────────────────────────────────────────────────
function seRefreshTimeline() {
  var tl = document.getElementById('se-timeline'); if (!tl) return;
  var sc = _seGetSelected();
  var lastRun = _seLastRunFor(_seSelectedId);
  tl.innerHTML = sc ? _seRenderTimeline(sc, lastRun) : '';
}

function seRefreshPI() {
  var pi = document.getElementById('se-pi'); if (!pi) return;
  pi.innerHTML = _seRenderPropInspector();
}

function seRefreshScriptList() {
  var sl = document.getElementById('se-slist'); if (!sl) return;
  var html = '';
  _seScripts.forEach(function(sc) {
    var run = _seLastRunFor(sc.id);
    var isSel = sc.id === _seSelectedId;
    var dotColor = !run ? 'var(--se-mu)' : run.status === 'passed' ? 'var(--se-grn)' : 'var(--se-red)';
    var statusTxt = !run ? 'NOT RUN' : run.status === 'passed' ? 'PASSING' : 'FAILING';
    var statusColor = !run ? 'var(--se-mu)' : run.status === 'passed' ? 'var(--se-grn)' : 'var(--se-red)';
    var steps = (sc.spec.steps||[]).length;
    html += '<div class="se-si'+(isSel?' sel':'')+'" onclick="seSelectScript(\''+sc.id+'\')">';
    html += '<div class="se-sin">'+_seEsc(sc.name)+'</div>';
    html += '<div class="se-sim">';
    html += '<div class="se-dot" style="background:'+dotColor+'"></div>';
    html += '<span style="font-size:9px;color:'+statusColor+'">'+statusTxt+'</span>';
    html += '<span style="font-size:9px;color:var(--se-mu);margin-left:auto;font-family:monospace">'+steps+' steps</span>';
    html += '</div></div>';
  });
  sl.innerHTML = html;
}

function seRefreshBadge() {
  var b = document.getElementById('se-badge'); if (!b) return;
  var run = _seLastRunFor(_seSelectedId);
  if (_seDirty) { b.className='se-badge se-bd-run'; b.textContent='UNSAVED'; return; }
  if (!run) { b.className='se-badge se-bd-new'; b.textContent='NEW'; return; }
  if (run.status === 'passed') { b.className='se-badge se-bd-pass'; b.textContent='PASSING'; }
  else { b.className='se-badge se-bd-fail'; b.textContent='FAILING'; }
}

// ── Script actions ───────────────────────────────────────────────────────────
function seSelectScript(id) {
  if (_seDirty) {
    if (!confirm('You have unsaved changes. Discard them?')) return;
  }
  _seSelectedId   = id;
  _seSelectedStep = null;
  _seDirty        = false;
  seRenderEditor();
}

async function seNewScript() {
  var name = prompt('Script name:');
  if (!name || !name.trim()) return;
  var tmplId = _selectedTmpl && _selectedTmpl.id;
  if (!tmplId) { cadToast('No template selected', 'error'); return; }
  var spec = { name: name.trim(), template_version: _selectedTmpl.version || '0.0.0',
    cleanup: 'delete', steps: [
      { id: 's1', action: 'launch_instance',
        params: { title: 'BIST — '+name.trim()+' — {timestamp}', launched_by: _seDefaultActor() },
        asserts: [{ eq: 'in_progress', check: 'instance.status' }, { eq: 'active', check: 'step[1].state' }]
      }
    ]
  };
  var rows = await API.post('bist_test_scripts', {
    firm_id: FIRM_ID_CAD, template_id: tmplId,
    name: name.trim(), script: JSON.stringify(spec),
    created_by: null, created_at: new Date().toISOString(),
  }).catch(function(e) { cadToast('Save failed: '+e.message, 'error'); return null; });
  if (!rows || !rows[0]) return;
  var newRow = rows[0];
  _seScripts.push({ id: newRow.id, name: name.trim(), spec: spec, _raw: newRow });
  _seSelectedId   = newRow.id;
  _seSelectedStep = null;
  _seDirty        = false;
  seRenderEditor();
  cadToast('Script created', 'info');
}

function seRenameScript(name) {
  var sc = _seGetSelected(); if (!sc) return;
  sc.name     = name;
  sc.spec.name = name;
  _seDirty = true;
  seRefreshBadge();
}

async function seSaveScript() {
  var sc = _seGetSelected(); if (!sc) return;
  sc.spec.template_version = _selectedTmpl && _selectedTmpl.version ? _selectedTmpl.version : sc.spec.template_version;
  await API.patch('bist_test_scripts?id=eq.'+sc.id, {
    name:   sc.name,
    script: JSON.stringify(sc.spec),
    updated_at: new Date().toISOString(),
  }).catch(function(e) { cadToast('Save failed: '+e.message, 'error'); });
  _seDirty = false;
  seRefreshBadge();
  seRefreshScriptList();
  cadToast('Saved', 'info');
}

async function seDeleteScript() {
  var sc = _seGetSelected(); if (!sc) return;
  if (!confirm('Delete "'+sc.name+'"? This cannot be undone.')) return;
  await API.del('bist_test_scripts?id=eq.'+sc.id).catch(function(){});
  _seScripts = _seScripts.filter(function(s){ return s.id !== sc.id; });
  _seSelectedId   = _seScripts.length ? _seScripts[0].id : null;
  _seSelectedStep = null;
  _seDirty        = false;
  seRenderEditor();
}

async function seRunScript() {
  if (_seRunning) return;
  var sc = _seGetSelected(); if (!sc) return;
  if (_seDirty) await seSaveScript();
  _seRunning = true;
  var badge = document.getElementById('se-badge');
  if (badge) { badge.className='se-badge se-bd-run'; badge.textContent='RUNNING…'; }
  await runBistScript(sc.id, function(ev) {
    // progress logging only — full visuals via Simulator tab
    if (ev.type === 'step_fail') cadToast('Step failed: '+ev.reason, 'error');
  });
  // Reload runs
  _seRecentRuns = await API.get('bist_runs?firm_id=eq.'+FIRM_ID_CAD+
    '&template_id=eq.'+_selectedTmpl.id+'&order=run_at.desc&limit=40').catch(function(){return [];});
  _seRunning = false;
  seRenderEditor();
  cadToast('Run complete', 'info');
}

// ── Step mutations ───────────────────────────────────────────────────────────
function seSelectStep(id) {
  _seSelectedStep = (_seSelectedStep === id) ? null : id;
  seRefreshTimeline();
  seRefreshPI();
}

function seDeleteStep(id) {
  var sc = _seGetSelected(); if (!sc) return;
  sc.spec.steps = (sc.spec.steps||[]).filter(function(s){ return s.id !== id; });
  if (_seSelectedStep === id) _seSelectedStep = null;
  _seDirty = true;
  seRefreshTimeline();
  seRefreshBadge();
}

function seUpdateParam(stepId, key, val) {
  var stp = _seGetStep(stepId); if (!stp) return;
  if (!stp.params) stp.params = {};
  stp.params[key] = val;
  _seDirty = true;
  seRefreshTimeline();
  seRefreshPI();
  seRefreshBadge();
}

function seUpdateRouteBack(stepId, val) {
  var stp = _seGetStep(stepId); if (!stp) return;
  if (!stp.params) stp.params = {};
  if (!val) {
    delete stp.params.route_to_seq;
  } else {
    stp.params.route_to_seq = parseInt(val, 10);
  }
  _seDirty = true;
  seRefreshTimeline();
  seRefreshPI();
  seRefreshBadge();
}

function seSetCleanup(val) {
  var sc = _seGetSelected(); if (!sc) return;
  sc.spec.cleanup = val;
  _seDirty = true;
  seRefreshBadge();
}

function seAddAssert(stepId) {
  var stp = _seGetStep(stepId); if (!stp) return;
  var checkEl = document.getElementById('se-nc-'+stepId);
  var opEl    = document.getElementById('se-no-'+stepId);
  var valEl   = document.getElementById('se-nv-'+stepId);
  if (!checkEl || !opEl || !valEl) return;
  var check = checkEl.value;
  var op    = opEl.value;
  var val   = _seCoerceVal(valEl.value);
  if (!check) return;
  var assert = { check: check };
  assert[op] = val;
  if (!stp.asserts) stp.asserts = [];
  stp.asserts.push(assert);
  _seDirty = true;
  seRefreshTimeline();
  seRefreshBadge();
}

function seDeleteAssert(stepId, idx) {
  var stp = _seGetStep(stepId); if (!stp) return;
  (stp.asserts||[]).splice(idx, 1);
  _seDirty = true;
  seRefreshTimeline();
  seRefreshBadge();
}

function seQuickAdd(action) {
  _seAppendStep(action, null);
}

function seInsertTmplStep(seq) {
  _seAppendStep('complete_step', seq);
}

function _seAppendStep(action, tmplSeq) {
  var sc = _seGetSelected(); if (!sc) return;
  var id   = _seGenId();
  var stp  = { id: id, action: action, params: {}, asserts: [] };

  if (action === 'launch_instance') {
    stp.params = { title: 'BIST — {timestamp}', launched_by: _seDefaultActor() };
    stp.asserts = [{ eq: 'in_progress', check: 'instance.status' }, { eq: 'active', check: 'step[1].state' }];
  } else if (action === 'complete_step') {
    var seq = tmplSeq || (_seTmplSteps.length ? _seTmplSteps[0].sequence_order : 1);
    stp.params = { step_seq: seq, actor: _seDefaultActor(), outcome: '' };
    stp.asserts = [{ eq: 'done', check: 'step['+seq+'].state' }];
  } else if (action === 'wait') {
    stp.params = { ms: 500 };
  }

  if (!sc.spec.steps) sc.spec.steps = [];
  sc.spec.steps.push(stp);
  _seSelectedStep = id;
  _seDirty = true;
  seRefreshTimeline();
  seRefreshPI();
  seRefreshBadge();
  // Scroll to bottom
  setTimeout(function() {
    var tl = document.getElementById('se-timeline');
    if (tl) tl.scrollTop = tl.scrollHeight;
  }, 50);
}

// ── Drag and drop ─────────────────────────────────────────────────────────────
function sePalDragStart(e, action) {
  _seDragAction = action; _seDragTmplSeq = null;
  e.dataTransfer.effectAllowed = 'copy';
}
function sePalDragEnd(e) {
  _seDragAction = null; _seDragTmplSeq = null;
  var dz = document.getElementById('se-dz');
  if (dz) dz.classList.remove('over');
}
function seDzOver(e) {
  e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
  var dz = document.getElementById('se-dz');
  if (dz) dz.classList.add('over');
}
function seDzLeave() {
  var dz = document.getElementById('se-dz');
  if (dz) dz.classList.remove('over');
}
function seDzDrop(e) {
  e.preventDefault();
  var dz = document.getElementById('se-dz');
  if (dz) dz.classList.remove('over');
  if (_seDragAction) _seAppendStep(_seDragAction, _seDragTmplSeq);
  _seDragAction = null; _seDragTmplSeq = null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function _seGetSelected() {
  return _seScripts.find(function(s){ return s.id === _seSelectedId; }) || null;
}
function _seGetStep(stepId) {
  var sc = _seGetSelected(); if (!sc) return null;
  return (sc.spec.steps||[]).find(function(s){ return s.id === stepId; }) || null;
}
function _seTmplStepBySeq(seq) {
  return _seTmplSteps.find(function(s){ return s.sequence_order === seq; }) || null;
}
function _seLastRunFor(scriptId) {
  if (!scriptId) return null;
  return _seRecentRuns.find(function(r){ return r.script_id === scriptId; }) || null;
}
function _seGetActors() {
  if (window._resources_cad && _resources_cad.length) {
    return _resources_cad.map(function(r) {
      return { slug: (r.name||'').toLowerCase().replace(/\s+/g,'_'), name: r.name||r.id };
    });
  }
  return [
    { slug: 'vaughn_staples', name: 'Vaughn Staples' },
    { slug: 'chris_staples',  name: 'Chris Staples'  },
    { slug: 'carlos_reyes',   name: 'Carlos Reyes'   },
  ];
}
function _seDefaultActor() {
  if (window._resources_cad && _resources_cad.length) {
    var me = _resources_cad.find(function(r){ return r.id === window._myResourceId; });
    if (me) return (me.name||'').toLowerCase().replace(/\s+/g,'_');
  }
  return 'vaughn_staples';
}
function _seOutcomeClass(outcome) {
  var map = { submitted:'se-oc se-oc-sub', approved:'se-oc se-oc-app',
    rejected:'se-oc se-oc-rej', declined:'se-oc se-oc-dec' };
  return map[outcome] || 'se-oc se-oc-def';
}
function _seAssertResult(assert, lastRun, stepId) {
  if (!lastRun) return null;
  if (lastRun.status === 'passed') return true;
  if (lastRun.failure_step === stepId) {
    var fa = lastRun.failure_assertion;
    if (fa && fa.check === assert.check) return false;
  }
  return null;
}

// ── Keyboard shortcut ────────────────────────────────────────────────────────
function _seBindEvents() {
  // Cmd/Ctrl+S to save
  var existing = document._seKeyHandler;
  if (existing) document.removeEventListener('keydown', existing);
  document._seKeyHandler = function(e) {
    if (!_seEditorEl) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      seSaveScript();
    }
  };
  document.addEventListener('keydown', document._seKeyHandler);
}

// ── Form hooks (stubs — hydrated by cdn-bist.js if form steps present) ───────
window._seOnCompleteStep = async function(stp, instId, stepBySeq) {};
window._seOnFormSection  = async function(stp, instId, stepBySeq) {};
window._seHydrateFormState = async function(state, instId, tmplSteps) { return state; };

// ── SE3: seOpenEditors is now the public API ───────────────────────────────────
// Call seOpenEditor(templateId, targetElId) from anywhere.
// The Simulator calls seOpenEditor(tmpl.id, 's9-script-editor-body').
// The loadTmplTests hook has been removed — Tests button removed from Library.
console.log('%c[cdn-script-editor] v20260404-SE3 — target-agnostic, Simulator-native',
  'background:#c47d18;color:#000;font-weight:700;padding:2px 8px;border-radius:3px');