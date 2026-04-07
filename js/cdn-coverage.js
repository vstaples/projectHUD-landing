// ══════════════════════════════════════════════════════════════════════════════
// cdn-coverage.js  ·  v20260407-CV25
// CadenceHUD — Coverage Tab (full rebuild)
//
// Replaces _s9RenderCoverageTab() in cadence.html.
// Architecture:
//   1. Enumerate ALL routing paths from live template DAG (_sgEnumeratePaths)
//   2. For each path, determine if a test script covers it (_cvPathSig match)
//   3. Determine coverage status: covered | stale | partial | uncovered
//   4. Render: left sidebar (score ring + bars + legend + scripts)
//            + center (stale banner | view toggle | DAG swim lanes | path list | matrix)
//
// Depends on: api.js, cadence.html globals (_sgEnumeratePaths, _s9EscHtml,
//             _s9WaitForFirmId, _selectedTmpl, _s9FmtCovDate)
// ══════════════════════════════════════════════════════════════════════════════

console.log('%c[cdn-coverage] v20260407-CV25 — live DAG coverage','background:#1a3a6a;color:#a0c8f8;font-weight:700;padding:2px 8px;border-radius:3px');

// ── CSS injection ─────────────────────────────────────────────────────────────
(function(){
  if (document.getElementById('cdn-coverage-css')) return;
  var s = document.createElement('style'); s.id = 'cdn-coverage-css';
  s.textContent = [
    '.cv-shell{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;background:#080a0f;font-family:Arial,sans-serif}',
    '.cv-stale-banner{background:rgba(90,64,16,.7);border-bottom:1px solid rgba(245,200,66,.4);padding:5px 16px;font-size:12px;color:#f5c842;display:flex;align-items:center;gap:8px;flex-shrink:0}',
    '.cv-body{flex:1;display:flex;overflow:hidden}',
    // Sidebar
    '.cv-sidebar{width:230px;flex-shrink:0;background:#0c0f18;border-right:1px solid #1e2535;display:flex;flex-direction:column;overflow-y:auto}',
    '.cv-sidebar::-webkit-scrollbar{width:3px}',
    '.cv-sidebar::-webkit-scrollbar-thumb{background:rgba(255,255,255,.07)}',
    '.cv-sb-sect{padding:12px;border-bottom:1px solid #1e2535}',
    '.cv-sb-lbl{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#5fd4c8;margin-bottom:10px}',
    '.cv-ring-wrap{display:flex;flex-direction:column;align-items:center;padding:4px 0 6px}',
    '.cv-ring-lbl{font-size:11px;color:rgba(255,255,255,.35);margin-top:5px;text-align:center}',
    // Score bars
    '.cv-score-tip-wrap{position:relative;cursor:help;margin-bottom:9px}',
    '.cv-score-row{display:flex;justify-content:space-between;margin-bottom:3px}',
    '.cv-score-row-label{font-size:12px;color:rgba(255,255,255,.55)}',
    '.cv-score-row-val{font-size:12px;font-weight:700;font-family:"Courier New",monospace}',
    '.cv-score-bar-wrap{height:3px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden}',
    '.cv-score-bar{height:100%;border-radius:2px;transition:width .5s}',
    '.cv-score-tip{display:none;position:fixed;z-index:9999;width:300px;background:#1a1f2e;border:1px solid rgba(255,255,255,.15);border-radius:5px;padding:14px 16px;pointer-events:none;box-shadow:0 8px 28px rgba(0,0,0,.8);font-family:Arial,sans-serif}',
    '.cv-score-tip-wrap:hover .cv-score-tip{display:block}',
    '.cv-stt{font-size:13px;font-weight:700;color:#5fd4c8;margin-bottom:8px}',
    '.cv-str{display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,.6);padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)}',
    '.cv-str:last-of-type{border-bottom:none}',
    '.cv-str span:last-child{color:#fff;font-weight:700}',
    '.cv-stf{font-size:11px;color:rgba(255,255,255,.45);margin-top:8px;border-top:1px solid rgba(255,255,255,.08);padding-top:8px;line-height:1.6}',
    // Legend
    '.cv-leg-item{display:flex;align-items:center;gap:8px;font-size:12px;color:rgba(255,255,255,.5);margin-bottom:5px}',
    '.cv-leg-dot{width:10px;height:10px;border-radius:2px;flex-shrink:0}',
    '.cv-leg-count{margin-left:auto;font-family:"Courier New",monospace;font-weight:700}',
    // Scripts list
    '.cv-script-item{padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer}',
    '.cv-script-item:last-child{border-bottom:none}',
    '.cv-script-item:hover{opacity:.85}',
    '.cv-script-name{font-size:11px;color:rgba(255,255,255,.85);line-height:1.3;margin-bottom:2px}',
    '.cv-script-meta{font-size:10px;color:rgba(255,255,255,.3);margin-left:13px;margin-bottom:3px}',
    '.cv-script-bar-wrap{margin-left:13px;height:2px;background:rgba(255,255,255,.06);border-radius:1px;overflow:hidden}',
    // Center
    '.cv-center{flex:1;display:flex;flex-direction:column;overflow:hidden;background:#080a0f}',
    '.cv-toggle-bar{background:#0c0f18;border-bottom:1px solid #1e2535;display:flex;align-items:center;padding:5px 16px;gap:6px;flex-shrink:0}',
    '.cv-toggle-btn{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;border-radius:3px;padding:3px 10px;border:1px solid;transition:all .15s}',
    '.cv-toggle-btn.active{background:#161b28;border-color:#5fd4c8;color:#5fd4c8}',
    '.cv-toggle-btn:not(.active){background:transparent;border-color:rgba(255,255,255,.1);color:rgba(255,255,255,.3)}',
    '.cv-toggle-meta{margin-left:auto;font-size:10px;color:rgba(255,255,255,.25)}',
    // Flow view
    '.cv-flow{display:flex;flex-direction:column;flex:1;overflow:hidden}',
    '.cv-dag-scroll{flex:1;overflow-y:auto;padding:20px 16px}',
    '.cv-dag-scroll::-webkit-scrollbar{width:3px}',
    '.cv-dag-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.07)}',
    '.cv-path-section{margin-bottom:24px}',
    '.cv-path-label{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:8px;display:flex;align-items:center;gap:8px}',
    '.cv-path-label-line{flex:1;height:1px;background:rgba(255,255,255,.06)}',
    '.cv-dag-row{display:flex;align-items:center;flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;gap:0}',
    '.cv-dag-row::-webkit-scrollbar{height:3px}',
    '.cv-dag-row::-webkit-scrollbar-thumb{background:rgba(255,255,255,.07)}',
    // DAG nodes
    '.cv-dag-node{display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0}',
    '.cv-dag-box{width:118px;border-radius:4px;padding:7px 9px;cursor:pointer;transition:background-color 0s,border-color 0s,transform .1s;flex-shrink:0}',
    '.cv-dag-box:hover{transform:translateY(-1px)}',
    '.cv-dag-box.covered{background:#0d2a1e;border:1px solid #3dd68c}',
    '.cv-dag-box.stale{background:#2a200a;border:1px solid #f5c842}',
    '.cv-dag-box.partial{background:#1a1a2e;border:1px solid #a78bfa}',
    '.cv-dag-box.uncovered{background:#5a1a1a;border:1px solid #e84040}',
    '.cv-dag-box.scripted{background:#0d2340;border:1px solid #3b82f6}',
    '.cv-dag-box.trigger-node{background:#161b28;border:1px solid #252d3f}',
    '.cv-dag-box-type{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:2px;opacity:.8}',
    '.cv-dag-box-name{font-weight:700;color:#e2e8f0;font-size:11px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.cv-dag-box-status{font-size:9px;margin-top:4px;display:flex;align-items:center;gap:4px}',
    '.cv-dag-box-tag{font-size:8px;padding:1px 5px;border-radius:2px;background:#080a0f;border:1px solid #252d3f;color:#6b7a99;white-space:nowrap;max-width:116px;overflow:hidden;text-overflow:ellipsis;margin-top:3px;cursor:pointer}',
    '.cv-dag-box-tag:hover{border-color:#5fd4c8;color:#5fd4c8}',
    // Connectors
    '.cv-connector{display:flex;flex-direction:column;align-items:center;justify-content:center;width:58px;flex-shrink:0;position:relative}',
    '.cv-edge-label{font-size:8px;color:#6b7a99;margin-bottom:2px;white-space:nowrap;text-align:center;background:#080a0f;padding:0 3px;border-radius:2px}',
    '.cv-edge-arrow{width:100%;height:1px;position:relative}',
    '.cv-edge-arrow::after{content:"▶";position:absolute;right:-6px;top:-6px;font-size:10px}',
    '.cv-edge-arrow.covered{background:#3dd68c;color:#3dd68c}',
    '.cv-edge-arrow.covered::after{color:#3dd68c}',
    '.cv-edge-arrow.stale{background:#f5c842}',
    '.cv-edge-arrow.stale::after{color:#f5c842}',
    '.cv-edge-arrow.uncovered{background:#e84040}',
    '.cv-edge-arrow.scripted{background:#3b82f6}',
    '.cv-edge-arrow.uncovered::after{color:#e84040}',
    '.cv-edge-arrow.none{background:#252d3f}',
    '.cv-edge-arrow.none::after{color:#252d3f}',
    // Path list
    '.cv-path-list{border-top:1px solid #1e2535;flex-shrink:0;max-height:200px;overflow-y:auto;background:#0c0f18}',
    '.cv-path-list::-webkit-scrollbar{width:3px}',
    '.cv-path-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.07)}',
    '.cv-pl-hdr{display:grid;grid-template-columns:1fr 60px 80px 120px 180px 140px;padding:6px 16px;background:#111520;border-bottom:1px solid #1e2535;position:sticky;top:0;z-index:2}',
    '.cv-pl-hc{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5fd4c8}',
    '.cv-pl-row{display:grid;grid-template-columns:1fr 60px 80px 120px 180px 140px;padding:6px 16px;border-bottom:1px solid rgba(255,255,255,.04);align-items:center;cursor:pointer;transition:background .1s}',
    '.cv-pl-row:hover{background:rgba(255,255,255,.02)}',
    '.cv-pl-name{font-size:12px;color:#e2e8f0;display:flex;align-items:center;gap:6px}',
    '.cv-pl-cell{font-size:12px;color:rgba(255,255,255,.45);font-family:"Courier New",monospace}',
    '.cv-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:3px;font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}',
    '.cv-pill-covered{background:rgba(61,214,140,.1);color:#3dd68c;border:1px solid rgba(61,214,140,.35)}',
    '.cv-pill-stale{background:rgba(245,200,66,.1);color:#f5c842;border:1px solid rgba(245,200,66,.35)}',
    '.cv-pill-partial{background:rgba(167,139,250,.1);color:#a78bfa;border:1px solid rgba(167,139,250,.35)}',
    '.cv-pill-uncovered{background:rgba(232,64,64,.1);color:#e84040;border:1px solid rgba(232,64,64,.35)}',
    // Matrix
    '.cv-matrix{display:none;flex:1;overflow:auto;padding:20px}',
    '.cv-matrix.active{display:block}',
    '.cv-mat-table{border-collapse:collapse;font-size:10px;min-width:100%}',
    '.cv-mat-table th{padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#5fd4c8;background:#0d1017;border:1px solid #1e2535;white-space:nowrap;position:sticky;top:0;z-index:2}',
    '.cv-mat-table th.row-hdr{left:0;z-index:3;min-width:150px;text-align:left;color:#94a3b8;font-size:11px;font-weight:700;text-transform:none;letter-spacing:0}',
    '.cv-mat-table td{border:1px solid #1e2535;padding:0;text-align:center;vertical-align:middle}',
    '.cv-mat-table td.step-lbl{padding:5px 10px;text-align:left;color:#94a3b8;background:#0d1017;font-size:11px;white-space:nowrap;position:sticky;left:0;z-index:1;border-right:2px solid #252d3f}',
    '.cv-mat-cell{width:100px;height:36px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;cursor:pointer}',
  ].join('\n');
  document.head.appendChild(s);
})();

// ── Sync enumerated paths to bist_coverage_paths ─────────────────────────────
async function _cvSyncPathsToDB(pathData, pathNames, steps, version) {
  try {
    var firmId = await _s9WaitForFirmId();
    var tmpl   = (typeof _selectedTmpl !== 'undefined') ? _selectedTmpl : null;
    if (!firmId || !tmpl || !tmpl.id) return;
    var templateId = tmpl.id;

    // Fetch existing path sigs for this template
    var existing = await API.get(
      'bist_coverage_paths?firm_id=eq.'+firmId+'&template_id=eq.'+templateId+'&select=_path_sig'
    ).catch(function(){ return []; });
    var existingSigs = {};
    (existing||[]).forEach(function(r){ if(r._path_sig) existingSigs[r._path_sig] = true; });

    // Delete stale DB paths whose sig is no longer in the current enumeration
    var currentSigs = {};
    pathData.forEach(function(pd){ if(pd.sig) currentSigs[pd.sig] = true; });
    var staleSigs = Object.keys(existingSigs).filter(function(sig){ return !currentSigs[sig]; });
    for (var si = 0; si < staleSigs.length; si++) {
      await API.del(
        'bist_coverage_paths?firm_id=eq.'+firmId+'&template_id=eq.'+templateId+'&_path_sig=eq.'+encodeURIComponent(staleSigs[si])
      ).catch(function(){});
    }
    // Also delete no-sig legacy rows when current enumeration has sigs
    if (pathData.some(function(pd){ return pd.sig; })) {
      await API.del(
        'bist_coverage_paths?firm_id=eq.'+firmId+'&template_id=eq.'+templateId+'&_path_sig=is.null'
      ).catch(function(){});
    }

    // Insert any paths not yet in DB
    var stepBySeq = {};
    (steps||[]).forEach(function(s){ stepBySeq[s.sequence_order||s.seq] = s; });

    for (var i = 0; i < pathData.length; i++) {
      var pd = pathData[i];
      if (!pd.sig || existingSigs[pd.sig]) continue;
      var stepSeq = (pd.path||[]).map(function(n){
        var s = stepBySeq[n.seq];
        return (s ? s.name : ('Step '+n.seq)) + (n.outcome ? '→'+n.outcome : '');
      });
      await API.post('bist_coverage_paths', {
        firm_id:          firmId,
        template_id:      templateId,
        template_version: version || tmpl.version || '0.0.0',
        path_name:        pathNames[i] || ('Path '+(i+1)),
        step_sequence:    stepSeq,
        coverage_status:  pd.status === 'covered' ? 'covered' : pd.status === 'stale' ? 'stale' : 'uncovered',
        covering_script_id: pd.sc ? pd.sc.id : null,
        _path_sig:        pd.sig,
        created_at:       new Date().toISOString()
      }).catch(function(){});
      existingSigs[pd.sig] = true;
    }
  } catch(e) {
    console.warn('[CV] _cvSyncPathsToDB failed:', e);
  }
}

// ── Path signature (mirrors cdn-script-generator.js) ─────────────────────────
function _cvPathSig(path) {
  return path.map(function(n){ return n.seq+':'+n.outcome; }).join('|');
}

// ── Extract path signature from a bist_test_scripts row ──────────────────────
function _cvScriptSig(sc) {
  var spec = null;
  try { spec = typeof sc.script === 'string' ? JSON.parse(sc.script) : sc.script; } catch(e){ return null; }
  if (!spec) return null;
  if (spec._path_sig) return spec._path_sig;
  // Reconstruct from steps
  var steps = (spec.steps||[]).filter(function(s){ return s.action==='complete_step'; });
  if (!steps.length) return null;
  return steps.map(function(s){
    var seq = s.params && s.params.step_seq != null ? s.params.step_seq : '?';
    var out = s.params && s.params.outcome ? s.params.outcome : 'completed';
    return seq+':'+out;
  }).join('|');
}

// ── Score color ───────────────────────────────────────────────────────────────
function _cvColor(v){ return v>=80?'#3dd68c':v>=50?'#f5c842':'#e84040'; }

// ── Status pill ───────────────────────────────────────────────────────────────
function _cvPill(st){
  var cfg={covered:{cls:'cv-pill-covered',lbl:'Covered'},stale:{cls:'cv-pill-stale',lbl:'Stale'},
    partial:{cls:'cv-pill-partial',lbl:'Partial'},uncovered:{cls:'cv-pill-uncovered',lbl:'Uncovered'},
    scripted:{cls:'cv-pill-stale',lbl:'Scripted'}}[st]
    ||{cls:'cv-pill-uncovered',lbl:'Uncovered'};
  return '<span class="cv-pill '+cfg.cls+'"><span style="width:5px;height:5px;border-radius:50%;background:currentColor;display:inline-block"></span>'+cfg.lbl+'</span>';
}

// ── Score bar with tooltip ────────────────────────────────────────────────────
function _cvScoreBar(lbl, val, tipTitle, tipRows, tipFormula, tipResult){
  var c = _cvColor(val);
  var tipHtml = '<div class="cv-stt">'+tipTitle+'</div>'+
    tipRows.map(function(r){ return '<div class="cv-str"><span>'+r[0]+'</span><span>'+r[1]+'</span></div>'; }).join('')+
    '<div class="cv-stf">'+tipFormula+'</div>'+
    '<div style="display:flex;justify-content:space-between;margin-top:5px;font-size:10px">'+
      '<span style="color:rgba(255,255,255,.35)">Score</span>'+
      '<span style="color:'+c+';font-weight:700">'+tipResult+'</span>'+
    '</div>';
  return '<div class="cv-score-tip-wrap">'+
    '<div class="cv-score-row">'+
      '<span class="cv-score-row-label">'+lbl+'</span>'+
      '<span class="cv-score-row-val" style="color:'+c+'">'+val+'%</span>'+
    '</div>'+
    '<div class="cv-score-bar-wrap"><div class="cv-score-bar" style="width:'+val+'%;background:'+c+'"></div></div>'+
    '<div class="cv-score-tip">'+tipHtml+'</div>'+
  '</div>';
}

// ── Step type color ───────────────────────────────────────────────────────────
function _cvStepTypeColor(stepType){
  var t = (stepType||'').toLowerCase();
  if(t==='approval'||t==='signoff') return '#3dd68c';
  if(t==='meeting') return '#5fd4c8';
  if(t==='form') return '#a78bfa';
  if(t==='trigger') return '#f5820a';
  return '#5fd4c8';
}

// ── Main renderer — replaces _s9RenderCoverageTab ────────────────────────────
function _s9RenderCoverageTab(container, scripts, runs, steps, version) {

  var STALE_DAYS = 7;
  var NOW = Date.now();

  // ── Last run per script ──
  var lastRunMap = {};
  (runs||[]).forEach(function(r){ if(!lastRunMap[r.script_id]) lastRunMap[r.script_id]=r; });

  // ── Script status ──
  function scriptStatus(sc){
    var r = lastRunMap[sc.id];
    if(!r) return 'scripted'; // has script, not yet run
    var days = (NOW-new Date(r.run_at).getTime())/86400000;
    if(days>STALE_DAYS) return 'stale';
    return (r.status==='passed') ? 'covered' : 'stale';
  }

  // ── Build sig→script map ──
  var sigMap = {}; // sig → {sc, status}
  scripts.forEach(function(sc){
    var sig = _cvScriptSig(sc);
    if(sig) sigMap[sig] = {sc:sc, status:scriptStatus(sc)};
  });

  // ── Enumerate all DAG paths ──
  var allPaths = [];
  if (typeof _sgEnumeratePaths === 'function' && steps.length) {
    try { allPaths = _sgEnumeratePaths(steps); } catch(e){ console.warn('[CV] DAG enumerate failed:', e); }
  }
  // Fallback: one path per script
  if (!allPaths.length) {
    scripts.forEach(function(sc, i){
      var sig = _cvScriptSig(sc)||('script-'+i);
      allPaths.push({_sig:sig, _scriptFallback:sc, steps:[]});
    });
  }

  // ── Classify each path ──
  var pathData = allPaths.map(function(path){
    var sig = Array.isArray(path) ? _cvPathSig(path) : (path._sig||'');
    var match = sigMap[sig];
    var status = match ? match.status : 'uncovered';
    var sc = match ? match.sc : null;
    return {path: Array.isArray(path)?path:[], sig:sig, status:status, sc:sc};
  });

  // Expose pathData for _s9CovCreateScript
  window._cvLastPathData = pathData;
  window._cvLastSteps    = steps;
  // Upsert enumerated paths to bist_coverage_paths (async, non-blocking)
  // Pass path names computed here (pathName is a closure, not available async)
  var pathNamesForSync = pathData.map(function(pd, pi){ return pathName(pd, pi); });
  _cvSyncPathsToDB(pathData, pathNamesForSync, steps, version);
  // Inject Re-run buttons only when no run is active
  setTimeout(function(){
    if (!window._cvRunActive) _cvInjectAllRerunButtons();
  }, 50);

  // ── Counts ──
  var covCt=0, staleCt=0, scriptedCt=0, uncovCt=0;
  pathData.forEach(function(p){
    if(p.status==='covered')      covCt++;
    else if(p.status==='stale')   staleCt++;
    else if(p.status==='scripted') scriptedCt++;
    else uncovCt++;
  });
  var totalPaths = pathData.length || 1;

  // ── Scores ──
  // Path coverage: % of paths that have ANY script (scripted + covered + stale)
  var scriptedPaths = covCt + staleCt + scriptedCt;
  var pathScore = Math.round(scriptedPaths / totalPaths * 100);

  // Run coverage: % of paths with a PASSING run (covered only)
  var runScore = Math.round(covCt / totalPaths * 100);



  // Freshness: % of scripted paths run within stale window
  var freshScore = scriptedPaths ? Math.round((covCt+staleCt*0.5)/scriptedPaths*100) : 0;

  // Ring shows path coverage (scripts exist) — most actionable for QA manager
  var ringScore = pathScore;
  var compColor = _cvColor(runScore);
  var ringColor  = _cvColor(ringScore);

  // ── Stale check ──
  var staleScript = scripts.find(function(sc){ return scriptStatus(sc)==='stale'; });

  // ── DAG path name ──
  function pathName(pd, idx){
    var prefix = 'Path '+(idx+1)+': ';
    if(pd.sc){
      var n = pd.sc.name||('Script '+(idx+1));
      // Avoid double prefix if script was created via auto-generate (already prefixed)
      return n.indexOf('Path '+(idx+1)+':')===0 ? n : prefix+n;
    }
    if(pd.path&&pd.path.length){
      var resets = pd.path.filter(function(n){return n.requiresReset;}).length;
      var lastOut = pd.path[pd.path.length-1];
      var base = resets>0 ? resets+' reset'+(resets>1?'s':'')+' — '+(lastOut&&lastOut.outcome||'') : 'Clean path — '+(lastOut&&lastOut.outcome||'');
      return prefix+base;
    }
    return prefix;
  }

  // ── DAG node for a template step ──
  function dagNode(seq, outcome, status, step, scriptName){
    var boxCls = 'cv-dag-box '+(status||'uncovered');
    var dotClr = status==='covered'?'#3dd68c':status==='stale'?'#f5c842':status==='partial'?'#a78bfa':'#e84040';
    var statusLbl = status==='covered'?'covered':status==='stale'?'stale · '+STALE_DAYS+'d':status==='partial'?'partial':'no coverage';
    var typeClr = step ? _cvStepTypeColor(step.step_type) : '#5fd4c8';
    var stepName = step ? (step.name||('Step '+seq)) : ('Step '+seq);
    var stepType = step ? (step.step_type||'action') : 'action';
    return '<div class="cv-dag-node">'+
      '<div class="'+boxCls+'">'+
        '<div class="cv-dag-box-type" style="color:'+typeClr+'">'+_s9EscHtml(stepType)+'</div>'+
        '<div class="cv-dag-box-name" title="'+_s9EscHtml(stepName)+'">'+_s9EscHtml(stepName)+'</div>'+
        '<div class="cv-dag-box-status">'+
          '<span style="width:5px;height:5px;border-radius:50%;background:'+dotClr+';flex-shrink:0;display:inline-block"></span>'+
          '<span style="font-size:9px;color:'+dotClr+'">'+statusLbl+'</span>'+
        '</div>'+
        (status==='uncovered'?'':
          '<div class="cv-dag-box-tag" title="'+_s9EscHtml(scriptName||'')+'">'+_s9EscHtml((scriptName||'').split(' ').slice(0,4).join(' '))+'</div>'
        )+
      '</div>'+
    '</div>';
  }

  // ── Connector ──
  function connector(outcome, status){
    var edgeCls = status==='covered'?'covered':status==='stale'?'stale':status==='partial'?'stale':'uncovered';
    return '<div class="cv-connector">'+
      '<div class="cv-edge-label">'+_s9EscHtml(outcome||'')+'</div>'+
      '<div class="cv-edge-arrow '+edgeCls+'"></div>'+
    '</div>';
  }

  // ── DAG swim lanes ──
  function dagHtml(){
    if(!pathData.length){
      return '<div style="font-size:12px;color:rgba(255,255,255,.25);padding:20px;text-align:center">No test scripts yet — create scripts to see path coverage.</div>';
    }
    var stepBySeq = {};
    steps.forEach(function(s){ stepBySeq[s.sequence_order||s.seq] = s; });

    return pathData.map(function(pd, pi){
      var status = pd.status;
      var lbl = status==='uncovered'
        ? '<span style="color:#e84040">&#x26A0; Uncovered &#x2014; '+_s9EscHtml(pathName(pd,pi))+'</span>'
        : status==='scripted'
        ? '<span style="color:#3b82f6">▶ Scripted, not yet run &#x2014; '+_s9EscHtml(pathName(pd,pi))+'</span>'
        : _s9EscHtml(pathName(pd,pi));
      var scriptName = pd.sc ? pd.sc.name : '';

      // Build node chain from path steps
      var nodeChain = '';
      if(pd.path && pd.path.length){
        // Trigger node
        nodeChain +=
          '<div class="cv-dag-node">'+
            '<div class="cv-dag-box trigger-node">'+
              '<div class="cv-dag-box-type" style="color:#f5820a">Trigger</div>'+
              '<div class="cv-dag-box-name">Instance Launch</div>'+
            '</div>'+
          '</div>'+
          connector('starts', status);

        pd.path.forEach(function(node, ni){
          var step = stepBySeq[node.seq];
          nodeChain += dagNode(node.seq, node.outcome, status, step, scriptName);
          if(ni < pd.path.length-1){
            nodeChain += connector(node.outcome||'', status);
          }
        });

        // End node
        nodeChain +=
          connector(pd.path[pd.path.length-1].outcome||'', status)+
          '<div class="cv-dag-node">'+
            '<div class="cv-dag-box '+status+'" style="width:60px;text-align:center">'+
              '<div class="cv-dag-box-name" style="font-size:10px">'+(status==='uncovered'?'END':'&#x2713; END')+'</div>'+
            '</div>'+
          '</div>';
      } else if(pd._scriptFallback) {
        // Fallback: render script steps
        var sc = pd._scriptFallback;
        var spec=null; try{spec=typeof sc.script==='string'?JSON.parse(sc.script):sc.script;}catch(e){}
        var stps = spec&&Array.isArray(spec.steps)?spec.steps:[];
        nodeChain = stps.map(function(stp,si){
          var nm = stp.params&&stp.params.step_seq!=null ? 'Step '+stp.params.step_seq : 'Step '+(si+1);
          var ac = (stp.assertions||stp.asserts||[]).length;
          return '<div class="cv-dag-node"><div class="cv-dag-box '+status+'">'+
            '<div class="cv-dag-box-type" style="color:#5fd4c8">'+_s9EscHtml(stp.action||'step')+'</div>'+
            '<div class="cv-dag-box-name">'+_s9EscHtml(nm)+'</div>'+
            (ac?'<div style="font-size:9px;color:rgba(255,255,255,.3);margin-top:3px">'+ac+' assert'+(ac!==1?'s':'')+'</div>':'')+
          '</div></div>'+
          (si<stps.length-1?connector('',status):'');
        }).join('');
      }

      var cta = status==='uncovered'
        ? '<div style="margin-left:16px;display:flex;align-items:center">'+
            '<span style="font-size:11px;color:#5fd4c8;cursor:pointer;text-decoration:underline" '+
              'onclick="_s9CovCreateScript(\''+_s9EscHtml(pathName(pd,pi))+'\','+pi+')">+ Create covering script &rarr;</span>'+
          '</div>'
        : status==='scripted'
        ? (pd.sc ? '<div style="margin-left:16px;font-size:11px;color:#3b82f6;cursor:pointer;text-decoration:underline"'
          + ' onclick="_cvRunPathScript(\''+pd.sc.id+'\','+pi+')"'
          + ' id="cv-run-cta-'+pi+'"'
          + '>▶ Run coverage script to verify this path</div>' : '')
        : '';

      return '<div class="cv-path-section" id="cv-path-sec-'+pi+'">'+
        '<div class="cv-path-label">'+lbl+'<div class="cv-path-label-line"></div></div>'+
        '<div class="cv-dag-row" id="cv-dag-row-'+pi+'">'+nodeChain+cta+'</div>'+
      '</div>';
    }).join('');
  }

  // ── Inline path script runner ────────────────────────────────────────────────
  window._cvInjectAllRerunButtons = function() {
    var pd = window._cvLastPathData || [];
    pd.forEach(function(p, pi) {
      if (p.sc && (p.status === 'covered' || p.status === 'stale' || p.status === 'scripted')) {
        _cvInjectRerunBtn(pi, p.sc.id);
      }
    });
  };

  window._cvInjectRerunBtn = function _cvInjectRerunBtn(pi, sid) {
    // Remove existing rerun btn if present
    var existing = document.getElementById('cv-rerun-btn-'+pi);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    // Hide the CTA (run link) since path is now complete
    var cta = document.getElementById('cv-run-cta-'+pi);
    if (cta) { cta.style.display = 'none'; }
    // Inject rerun btn after END block in dag-row
    var dagRow = document.getElementById('cv-dag-row-'+pi);
    if (!dagRow) return;
    var btn = document.createElement('div');
    btn.id = 'cv-rerun-btn-'+pi;
    btn.style.cssText = 'display:flex;align-items:center;margin-left:12px;flex-shrink:0';
    btn.innerHTML = '<span style="font-size:11px;color:#3de08a;margin-right:8px">✓ Verified</span>'+
      '<span style="font-size:11px;color:#3b82f6;cursor:pointer;text-decoration:underline" '+
      'onclick="_cvResetPath('+pi+',\''+sid+'\')">&#x21ba; Re-run</span>';
    dagRow.appendChild(btn);
  };

  window._cvRunPathScript = function(scriptId, pathIdx) {
    var sec = document.getElementById('cv-path-sec-'+pathIdx);
    if (!sec) return;
    var cta = document.getElementById('cv-run-cta-'+pathIdx);
    if (cta) cta.style.opacity = '0.4';

    // Display name from pathData
    var pd2 = window._cvLastPathData && window._cvLastPathData[pathIdx];
    var displayName = pd2 ? pathName(pd2, pathIdx) : ('Path '+(pathIdx+1));

    // Progress overlay
    var overlay = document.createElement('div');
    overlay.id = 'cv-run-overlay-'+pathIdx;
    overlay.style.cssText = 'position:absolute;background:rgba(13,16,23,.95);border:1px solid #3b82f6;'+
      'border-radius:5px;padding:12px 16px;font-family:Arial,sans-serif;font-size:11px;'+
      'color:rgba(255,255,255,.7);z-index:100;min-width:320px;max-width:440px;'+
      'box-shadow:0 8px 28px rgba(0,0,0,.8)';
    overlay.innerHTML = '<div style="font-weight:700;color:#3b82f6;margin-bottom:8px">▶ Running: '+_s9EscHtml(displayName||scriptId.slice(0,8))+'</div>'+
      '<div id="cv-run-log-'+pathIdx+'" style="font-size:11px;color:rgba(255,255,255,.55);line-height:1.8"></div>';
    sec.style.position = 'relative';
    sec.appendChild(overlay);

    var logEl = document.getElementById('cv-run-log-'+pathIdx);
    var CLR = {info:'rgba(255,255,255,.45)', pass:'#3de08a', fail:'#e84040'};
    function log(type, msg) {
      if (!logEl) return;
      var line = document.createElement('div');
      line.style.color = CLR[type] || CLR.info;
      line.textContent = msg;
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
    }

    // Use shared step-state model
    var adapter = CadenceStepState.coverageAdapter(pathIdx);
    var runner  = CadenceStepState.createRunner(scriptId, adapter);

    runner.run(log, function(passed, result) {
      if (cta) cta.style.opacity = '1';
      // Auto-close overlay after 2s
      setTimeout(function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 2000);
      // Inject Re-run button
      _cvInjectRerunBtn(pathIdx, scriptId);
      // Update coverage_status in DB if passed
      if (passed) {
        var pd3 = window._cvLastPathData && window._cvLastPathData[pathIdx];
        if (pd3 && pd3.sig) {
          _s9WaitForFirmId().then(function(firmId){
            var tmpl3 = (typeof _selectedTmpl !== 'undefined') ? _selectedTmpl : null;
            if (!firmId || !tmpl3) return;
            API.patch(
              'bist_coverage_paths?firm_id=eq.'+firmId+'&template_id=eq.'+tmpl3.id+'&_path_sig=eq.'+pd3.sig,
              { coverage_status: 'covered', covering_script_id: scriptId, last_run_at: new Date().toISOString() }
            ).catch(function(){});
          });
        }
      }
      // Refresh coverage status pills and dashboard
      if (typeof _s9LoadCoverageData === 'function' && typeof _selectedTmpl !== 'undefined' && _selectedTmpl) {
        setTimeout(function(){ _s9LoadCoverageData(_selectedTmpl.id, _selectedTmpl.version||'0.0.0'); }, 1000);
      }
    });
  };


  window._cvResetPath = function(pathIdx, scriptId) {
    // Reset DAG nodes to scripted (blue)
    var dagRow = document.getElementById('cv-dag-row-'+pathIdx);
    if (dagRow) {
      dagRow.querySelectorAll('.cv-dag-box:not(.trigger-node)').forEach(function(b){
        b.className = b.className.replace(/\bcovered\b|\buncovered\b|\bstale\b/g,'').trim()+' scripted';
      });
      dagRow.querySelectorAll('.cv-edge-arrow').forEach(function(a){
        a.className = a.className.replace(/\bcovered\b|\buncovered\b|\bstale\b/g,'').trim()+' scripted';
      });
    }
    // Remove rerun btn and overlay
    var rb = document.getElementById('cv-rerun-btn-'+pathIdx);
    if (rb && rb.parentNode) rb.parentNode.removeChild(rb);
    var ov = document.getElementById('cv-run-overlay-'+pathIdx);
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    // Run immediately
    window._cvRunPathScript(scriptId, pathIdx);
  };

  // ── Path list table ──
  function pathListHtml(){
    if(!pathData.length) return '<div style="font-size:12px;color:rgba(255,255,255,.3);padding:12px 16px">No paths enumerated.</div>';
    return '<div class="cv-pl-hdr">'+
      '<div class="cv-pl-hc">Routing Path</div>'+
      '<div class="cv-pl-hc">Steps</div>'+
      '<div class="cv-pl-hc">Asserts</div>'+
      '<div class="cv-pl-hc">Last Run</div>'+
      '<div class="cv-pl-hc">Script</div>'+
      '<div class="cv-pl-hc">Status</div>'+
    '</div>'+
    pathData.map(function(pd, pi){
      var sc = pd.sc;
      var r  = sc ? lastRunMap[sc.id] : null;
      var spec=null; try{if(sc)spec=typeof sc.script==='string'?JSON.parse(sc.script):sc.script;}catch(e){}
      var stpCt = spec&&Array.isArray(spec.steps)?spec.steps.length:(pd.path?pd.path.length:0);
      var assertCt = spec&&Array.isArray(spec.steps)?spec.steps.reduce(function(a,s){return a+(s.assertions||s.asserts||[]).length;},0):0;
      var lastRunStr = r ? _s9FmtCovDate(r.run_at) : 'Never';
      var scName = sc ? (sc.name||'Unnamed') : '—';
      var dotClr = pd.status==='covered'?'#3dd68c':pd.status==='stale'?'#f5c842':pd.status==='partial'?'#a78bfa':'#e84040';
      return '<div class="cv-pl-row"'+
        (sc?' onclick="_s9OpenScriptEditor(\''+sc.id+'\')"':'')+'>'+
        '<div class="cv-pl-name">'+
          '<span style="width:6px;height:6px;border-radius:50%;background:'+dotClr+';display:inline-block;flex-shrink:0"></span>'+
          _s9EscHtml(pathName(pd,pi))+
        '</div>'+
        '<div class="cv-pl-cell">'+stpCt+'</div>'+
        '<div class="cv-pl-cell">'+assertCt+'</div>'+
        '<div class="cv-pl-cell">'+lastRunStr+'</div>'+
        '<div style="font-size:12px;color:#5fd4c8;white-space:nowrap;min-width:160px">'+_s9EscHtml(scName)+'</div>'+
        '<div>'+_cvPill(pd.status)+'</div>'+
      '</div>';
    }).join('');
  }

  // ── Matrix view ──
  function matrixHtml(){
    if(!scripts.length||!steps.length){
      return '<div style="font-size:12px;color:rgba(255,255,255,.25);padding:20px;text-align:center">Matrix requires both workflow steps and test scripts.</div>';
    }
    var scriptHeaders = scripts.map(function(sc){
      var words=(sc.name||'').split(' '); var short=words.slice(0,3).join(' ')+(words.length>3?'&#x2026;':'');
      var st=scriptStatus(sc); var c=st==='covered'?'#3dd68c':st==='stale'?'#f5c842':'#e84040';
      return '<th style="color:'+c+'">'+_s9EscHtml(short)+'</th>';
    }).join('');
    var stepBySeq={};steps.forEach(function(s){stepBySeq[s.sequence_order||s.seq]=s;});
    var scriptSpecs=scripts.map(function(sc){ try{return typeof sc.script==='string'?JSON.parse(sc.script):sc.script;}catch(e){return null;} });
    var rows=steps.map(function(step){
      var cells=scripts.map(function(sc,si){
        var spec=scriptSpecs[si]; if(!spec) return '<td><div class="cv-mat-cell" style="background:#0d0f16"></div></td>';
        var stps=Array.isArray(spec.steps)?spec.steps:[];
        var touches=stps.some(function(s){ return s.action==='complete_step'&&s.params&&s.params.step_seq===step.sequence_order; });
        if(!touches) return '<td><div class="cv-mat-cell" style="background:#0d0f16;color:rgba(255,255,255,.15)">&#x2014;</div></td>';
        var st=scriptStatus(sc);
        var bg=st==='covered'?'rgba(61,214,140,.12)':st==='stale'?'rgba(245,200,66,.12)':'rgba(232,64,64,.12)';
        var c=st==='covered'?'#3dd68c':st==='stale'?'#f5c842':'#e84040';
        var lbl=st==='covered'?'&#x2713;':st==='stale'?'~':'&#x2715;';
        return '<td><div class="cv-mat-cell" style="background:'+bg+';color:'+c+'" title="'+_s9EscHtml(sc.name)+' &#x2014; '+st+'">'+lbl+'</div></td>';
      }).join('');
      var stpName=(step.name||'Step '+(step.sequence_order||'?'));
      var stpTypeClr=_cvStepTypeColor(step.step_type);
      return '<tr><td class="step-lbl cv-mat-table" style="padding:5px 10px;text-align:left;color:#94a3b8;background:#0d1017;border:1px solid #1e2535;white-space:nowrap;position:sticky;left:0;z-index:1;border-right:2px solid #252d3f">'+
        '<span style="font-size:9px;font-weight:700;color:'+stpTypeClr+';text-transform:uppercase;margin-right:6px">'+(step.step_type||'action')+'</span>'+
        _s9EscHtml(stpName)+
      '</td>'+cells+'</tr>';
    }).join('');
    var legend=['<span style="background:rgba(61,214,140,.12);border:1px solid rgba(61,214,140,.3)">&#x2713; Covered</span>',
      '<span style="background:rgba(245,200,66,.12);border:1px solid rgba(245,200,66,.3)">~ Stale</span>',
      '<span style="background:rgba(232,64,64,.12);border:1px solid rgba(232,64,64,.3)">&#x2715; Uncovered</span>',
      '<span style="background:#0d0f16;border:1px solid #252d3f">&#x2014; N/A</span>',
    ].map(function(h){return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:10px;color:rgba(255,255,255,.45);padding:2px 6px;border-radius:3px">'+h+'</span>';}).join('');
    return '<table class="cv-mat-table"><thead><tr><th class="row-hdr cv-mat-table">Step / Outcome</th>'+scriptHeaders+'</tr></thead><tbody>'+rows+'</tbody></table>'+
      '<div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+legend+'</div>';
  }

  // ── Assemble ──
  var _covView = window._s9CovView || 'flow';
  container.innerHTML =

    (staleScript
      ? '<div class="cv-stale-banner">&#x26A0; <b style="color:#fff">1 script</b> last ran more than '+STALE_DAYS+' days ago &#x2014; coverage may not reflect current state.<span style="margin-left:auto;cursor:pointer;text-decoration:underline" onclick="_s9LaunchSimulator()">Re-run stale scripts &rarr;</span></div>'
      : '') +

    '<div class="cv-body">'+

      // Sidebar
      '<div class="cv-sidebar">'+
        '<div class="cv-sb-sect">'+
          '<div class="cv-sb-lbl">Coverage Score</div>'+
          '<div class="cv-ring-wrap">'+
            '<div style="position:relative;width:90px;height:90px">'+
              '<svg width="90" height="90" viewBox="0 0 90 90" style="transform:rotate(-90deg)">'+
                '<circle cx="45" cy="45" r="38" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="7"/>'+
                '<circle cx="45" cy="45" r="38" fill="none" stroke="'+ringColor+'" stroke-width="7" stroke-dasharray="'+Math.round(ringScore*2.39)+' 239" stroke-linecap="round"/>'+
              '</svg>'+
              '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:22px;font-weight:700;color:'+ringColor+';font-family:\'Courier New\',monospace">'+ringScore+'%</div>'+
            '</div>'+
            '<div class="cv-ring-lbl">Path Coverage</div>'+
          '</div>'+
          '<div style="margin-top:10px">'+
            _cvScoreBar('Path coverage',pathScore,'Path Coverage',
              [['Total paths',totalPaths],['Scripted (any run status)',scriptedPaths],['Passing runs',covCt],['No script yet',uncovCt]],
              'paths with a script ÷ total paths',
              scriptedPaths+' ÷ '+totalPaths+' = '+pathScore+'%')+
            _cvScoreBar('Run coverage',runScore,'Run Coverage',
              [['Total paths',totalPaths],['Paths with passing run',covCt],['Scripted not run',scriptedCt],['Stale (>'+STALE_DAYS+'d)',staleCt]],
              'paths with passing run ÷ total paths',
              covCt+' ÷ '+totalPaths+' = '+runScore+'%')+

            _cvScoreBar('Freshness',freshScore,'Freshness',
              [['Scripted paths',scriptedPaths],['Passing runs',covCt],['Stale (>'+STALE_DAYS+'d)',staleCt],['Never run',scriptedCt]],
              '(passing + 0.5×stale) ÷ scripted paths',
              '('+(covCt)+' + '+(staleCt*0.5)+') ÷ '+scriptedPaths+' = '+freshScore+'%')+
          '</div>'+
        '</div>'+

        '<div class="cv-sb-sect">'+
          '<div class="cv-sb-lbl">Path Status</div>'+
          [['#3dd68c','Covered &#x2014; passing',covCt],['#f5c842','Covered &#x2014; stale',staleCt],['#3b82f6','Scripted &#x2014; not yet run',scriptedCt],['#e84040','Uncovered &#x2014; no script',uncovCt]].map(function(r){
            return '<div class="cv-leg-item"><div class="cv-leg-dot" style="background:'+r[0]+'"></div>'+r[1]+'<span class="cv-leg-count" style="color:'+r[0]+'">'+r[2]+'</span></div>';
          }).join('')+
        '</div>'+

        '<div class="cv-sb-sect">'+
          '<div class="cv-sb-lbl">Scripts</div>'+
          (scripts.length ? scripts.map(function(sc){
            var st=scriptStatus(sc); var r=lastRunMap[sc.id];
            var dotClr=st==='covered'?'#3dd68c':st==='stale'?'#f5c842':'#e84040';
            var spec=null; try{spec=typeof sc.script==='string'?JSON.parse(sc.script):sc.script;}catch(e){}
            var stpCt=spec&&Array.isArray(spec.steps)?spec.steps.length:0;
            var barW=st==='covered'?100:st==='stale'?60:0;
            return '<div class="cv-script-item" onclick="_s9OpenScriptEditor(\''+sc.id+'\')">'+
              '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">'+
                '<span style="width:7px;height:7px;border-radius:50%;background:'+dotClr+';flex-shrink:0;display:inline-block"></span>'+
                '<span class="cv-script-name">'+_s9EscHtml(sc.name||'Unnamed')+'</span>'+
              '</div>'+
              '<div class="cv-script-meta">'+stpCt+' steps &#xb7; '+(r?_s9FmtCovDate(r.run_at):'Never')+'</div>'+
              '<div class="cv-script-bar-wrap"><div style="height:100%;width:'+barW+'%;background:'+dotClr+';border-radius:1px"></div></div>'+
            '</div>';
          }).join('') : '<div style="font-size:11px;color:rgba(255,255,255,.25);font-style:italic">No scripts yet</div>')+
        '</div>'+

        (uncovCt>0
          ? '<div class="cv-sb-sect"><div class="cv-sb-lbl" style="color:#e84040">&#x26A0; Uncovered Paths</div>'+
              '<div style="font-size:11px;color:rgba(255,255,255,.45);line-height:1.6">'+
                '<div style="color:#e84040;font-weight:700;margin-bottom:4px">'+uncovCt+' path'+(uncovCt!==1?'s have':' has')+' no test coverage</div>'+
                'Scripts without a passing run leave routing paths unverified.'+
              '</div></div>'
          : '')+

      '</div>'+

      // Center
      '<div class="cv-center">'+
        '<div class="cv-toggle-bar">'+
          '<button id="s9-cov-btn-flow" class="cv-toggle-btn'+(_covView==='flow'?' active':'')+'" onclick="_s9CovSetView(\'flow\')">&#x2B21; Flow + Path List</button>'+
          '<button id="s9-cov-btn-matrix" class="cv-toggle-btn'+(_covView==='matrix'?' active':'')+'" onclick="_s9CovSetView(\'matrix\')">&#x25A6; Matrix</button>'+
          '<span class="cv-toggle-meta">'+scripts.length+' scripts &#xb7; '+steps.length+' steps &#xb7; Last analyzed '+(runs.length?_s9FmtCovDate(runs[0].run_at):'never')+'</span>'+
        '</div>'+

        '<div id="s9-cov-flow" style="display:'+(_covView==='flow'?'flex':'none')+';flex-direction:column;flex:1;overflow:hidden">'+
          '<div class="cv-dag-scroll" id="s9-cov-dag">'+dagHtml()+'</div>'+
          '<div class="cv-path-list">'+pathListHtml()+'</div>'+
        '</div>'+

        '<div id="s9-cov-matrix" class="cv-matrix'+(_covView==='matrix'?' active':'')+'">'+matrixHtml()+'</div>'+

      '</div>'+

    '</div>';
}

window._s9RenderCoverageTab = _s9RenderCoverageTab;