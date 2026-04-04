// cdn-script-editor.js — CadenceHUD: Visual Test Script Editor
// LOAD ORDER: 9th (after cdn-bist.js, before cdn-instances.js)
// Depends on: cdn-bist.js (runBistScript, _bistAssert, _bistBuildState),
//             cdn-form-editor.js (_formDefs, _formFields, FORM_ROLES),
//             cdn-template-editor.js (_selectedTmpl),
//             api.js (API.get/post/patch/del), cadence.html globals
console.log('%c[cdn-script-editor] v20260404-SE1','background:#7F77DD;color:#fff;font-weight:700;padding:2px 8px;border-radius:3px');

// ─────────────────────────────────────────────────────────────────────────────
// MODULE STATE
// ─────────────────────────────────────────────────────────────────────────────
var _seScripts        = [];   // bist_test_scripts rows for current template
var _seSelectedId     = null; // currently open script id
var _seSelectedStep   = null; // currently selected step id in timeline
var _seDirty          = false;
var _seRecentRuns     = [];   // bist_runs rows (last 20)
var _seDragAction     = null; // action type being dragged from palette
var _seDragTmplSeq    = null; // template step seq being dragged
var _seRunning        = false;
var _seFormFieldCache = {};   // formId → [{id,label,type,role}] populated lazily

// ── Iron rules: var + bare globals ───────────────────────────────────────────
var _seEditorEl       = null; // root DOM element for the editor panel

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
var SE_ACTIONS = [
  { action: 'launch_instance',    icon: '▶', label: 'Launch',   color: '#7F77DD' },
  { action: 'complete_step',      icon: '✓', label: 'Complete', color: '#60a5fa' },
  { action: 'complete_form_section', icon: '◧', label: 'Fill Section', color: '#b070e0' },
  { action: 'assert_only',        icon: '≡', label: 'Assert',   color: '#f59e0b' },
  { action: 'wait',               icon: '⏱', label: 'Wait',     color: '#6b7280' },
];

// Assertion operators
var SE_OPS = ['eq','not_eq','gte','lte','contains','exists','not_exists'];

// Assertion check path categories
var SE_CHECK_WORKFLOW = [
  { path: 'instance.status',         label: 'Instance status' },
  { path: 'step[N].state',           label: 'Step N — state' },
  { path: 'step[N].outcome',         label: 'Step N — outcome' },
  { path: 'step[N].loops',           label: 'Step N — loop count' },
  { path: 'step[N].route_to',        label: 'Step N — route_to step id' },
  { path: 'step[N].activated_at',    label: 'Step N — activated timestamp' },
];
var SE_CHECK_FORM_BASE = [
  { path: 'step[N].form.required_fields_complete', label: 'All required fields complete' },
  { path: 'step[N].form.sections_complete',        label: 'Sections complete (count)' },
  { path: 'step[N].form.sections_total',           label: 'Sections total (count)' },
  { path: 'step[N].form.route_count',              label: 'Form route count' },
];

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT — called from renderTmplTests / Tests panel open
// ─────────────────────────────────────────────────────────────────────────────
async function seOpenEditor(templateId) {
  var panelEl = document.getElementById('tmpl-tests-panel');
  if (!panelEl) return;
  var bodyEl = document.getElementById('tmpl-tests-body');
  if (!bodyEl) return;

  _seEditorEl = bodyEl;
  bodyEl.innerHTML = '<div style="padding:24px;text-align:center;font-size:12px;color:var(--muted)">Loading scripts…</div>';

  try {
    var [scripts, runs] = await Promise.all([
      API.get('bist_test_scripts?firm_id=eq.' + FIRM_ID_CAD + '&template_id=eq.' + templateId + '&order=created_at.asc').catch(function(){ return []; }),
      API.get('bist_runs?firm_id=eq.' + FIRM_ID_CAD + '&order=run_at.desc&limit=40').catch(function(){ return []; }),
    ]);
    _seScripts = (scripts || []).map(function(s) {
      var spec = typeof s.script === 'string' ? JSON.parse(s.script) : (s.script || {});
      return { id: s.id, name: s.name || spec.name || 'Unnamed', spec: spec, _raw: s };
    });
    _seRecentRuns = runs || [];

    // Pick first script or last selected
    if (!_seSelectedId && _seScripts.length) _seSelectedId = _seScripts[0].id;

    seRenderEditor();
  } catch(e) {
    bodyEl.innerHTML = '<div style="padding:12px;color:var(--red);font-size:12px">Failed to load: ' + escHtml(e.message) + '</div>';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN RENDER
// ─────────────────────────────────────────────────────────────────────────────
function seRenderEditor() {
  if (!_seEditorEl) return;
  var tmpl = _selectedTmpl;
  var tmplSteps = (tmpl && tmpl.steps) ? tmpl.steps : [];

  _seEditorEl.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;padding:0';

  _seEditorEl.innerHTML =
    '<div style="display:flex;height:100%;overflow:hidden;background:var(--bg1)">' +

    // ── LEFT: script list + palette ───────────────────────────────────────
    '<div style="width:190px;flex-shrink:0;border-right:1px solid var(--border);' +
    'display:flex;flex-direction:column;background:var(--bg1);overflow:hidden">' +

      // Script list header
      '<div style="padding:8px 12px 6px;border-bottom:1px solid var(--border);' +
      'display:flex;align-items:center;justify-content:space-between;flex-shrink:0">' +
      '<span style="font-size:10px;font-weight:700;letter-spacing:.1em;color:var(--muted);' +
      'text-transform:uppercase">Test Scripts</span>' +
      '<button onclick="seNewScript()" style="background:none;border:none;color:var(--cad);' +
      'font-size:18px;cursor:pointer;line-height:1;padding:0" title="New script">+</button>' +
      '</div>' +

      // Script list
      '<div style="flex:1;overflow-y:auto;border-bottom:1px solid var(--border)" id="se-script-list">' +
      seRenderScriptList() +
      '</div>' +

      // Action palette
      '<div style="flex-shrink:0">' +
      '<div style="padding:6px 12px 4px;font-size:9px;font-weight:700;letter-spacing:.1em;' +
      'color:var(--muted);text-transform:uppercase;border-bottom:1px solid var(--border)">' +
      'Action Blocks — drag to timeline' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:8px">' +
      SE_ACTIONS.map(function(a) {
        return '<div draggable="true" ' +
          'ondragstart="sePalDragStart(event,\'' + a.action + '\')" ' +
          'ondragend="sePalDragEnd(event)" ' +
          'style="padding:6px 5px;border:1px dashed rgba(255,255,255,.12);border-radius:4px;' +
          'cursor:grab;text-align:center;background:var(--bg2);transition:all .12s;user-select:none"' +
          'onmouseover="this.style.borderColor=\'' + a.color + '\';this.style.background=\'rgba(127,119,221,.08)\'"' +
          'onmouseout="this.style.borderColor=\'rgba(255,255,255,.12)\';this.style.background=\'var(--bg2)\'">' +
          '<div style="font-size:14px;margin-bottom:2px">' + a.icon + '</div>' +
          '<div style="font-size:8px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;' +
          'color:rgba(255,255,255,.55)">' + a.label + '</div>' +
          '</div>';
      }).join('') +
      '</div>' +
      '</div>' +

      // Template steps palette
      '<div style="flex-shrink:0;border-top:1px solid var(--border)">' +
      '<div style="padding:5px 12px 3px;font-size:9px;font-weight:700;letter-spacing:.1em;' +
      'color:var(--muted);text-transform:uppercase">Template Steps — drag to insert</div>' +
      '<div style="max-height:140px;overflow-y:auto">' +
      (tmplSteps.length ? tmplSteps.map(function(s) {
        var typeColor = seStepTypeColor(s.step_type);
        return '<div draggable="true" ' +
          'ondragstart="seTmplDragStart(event,' + s.sequence_order + ',\'' +
          escAttr(s.name) + '\',\'' + escAttr(s.step_type) + '\')" ' +
          'ondragend="sePalDragEnd(event)" ' +
          'style="display:flex;align-items:center;gap:5px;padding:4px 10px;' +
          'cursor:grab;border-bottom:1px solid var(--border);transition:background .1s;user-select:none"' +
          'onmouseover="this.style.background=\'var(--bg2)\'"' +
          'onmouseout="this.style.background=\'transparent\'">' +
          '<span style="font-size:9px;font-family:var(--font-mono);color:var(--muted);width:14px;text-align:center">' + s.sequence_order + '</span>' +
          '<span style="font-size:10px;color:var(--text1);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(s.name) + '</span>' +
          '<span style="font-size:8px;color:' + typeColor + ';font-family:var(--font-mono)">' + (s.step_type || '') + '</span>' +
          '</div>';
      }).join('') : '<div style="padding:8px 12px;font-size:10px;color:var(--muted)">No steps yet</div>') +
      '</div>' +
      '</div>' +

    '</div>' + // end left

    // ── CENTER: timeline ──────────────────────────────────────────────────
    '<div style="flex:1;display:flex;flex-direction:column;min-width:0;overflow:hidden">' +

      // Script header bar
      '<div style="background:var(--bg2);border-bottom:1px solid var(--border);' +
      'padding:6px 12px;display:flex;align-items:center;gap:8px;flex-shrink:0" id="se-script-hdr">' +
      seRenderScriptHeader() +
      '</div>' +

      // Drop zone toolbar
      '<div style="background:var(--bg1);border-bottom:1px solid var(--border);' +
      'padding:5px 12px;display:flex;align-items:center;gap:8px;flex-shrink:0">' +
      '<span style="font-size:10px;color:var(--muted);font-style:italic">Drop action here to append →</span>' +
      '<div id="se-dz-append" ' +
      'ondragover="seDzOver(event,\'se-dz-append\')" ' +
      'ondragleave="seDzLeave(\'se-dz-append\')" ' +
      'ondrop="seDzDrop(event)" ' +
      'style="flex:1;height:28px;border:1px dashed rgba(255,255,255,.15);border-radius:4px;' +
      'display:flex;align-items:center;justify-content:center;font-size:10px;' +
      'color:var(--muted);transition:all .15s;cursor:default">+ Drop to append</div>' +
      '<button onclick="seAddAssertToLast()" ' +
      'style="padding:4px 9px;font-size:10px;font-weight:600;border-radius:4px;cursor:pointer;' +
      'border:1px solid rgba(74,222,128,.4);background:rgba(74,222,128,.1);color:#4ade80">+ Assert</button>' +
      '</div>' +

      // Timeline scroll area
      '<div style="flex:1;overflow-y:auto;padding:12px" id="se-timeline">' +
      seRenderTimeline() +
      '</div>' +

      // Footer
      '<div style="background:var(--bg1);border-top:1px solid var(--border);' +
      'padding:5px 12px;display:flex;align-items:center;gap:10px;flex-shrink:0;font-size:10px">' +
      '<span style="color:var(--muted);letter-spacing:.06em;text-transform:uppercase">Cleanup</span>' +
      '<select id="se-cleanup" onchange="seSetCleanup(this.value)" ' +
      'style="font-size:10px;background:var(--bg0);border:1px solid var(--border);' +
      'border-radius:3px;padding:2px 6px;color:var(--text2);cursor:pointer">' +
      '<option value="delete">Delete instance after run</option>' +
      '<option value="suspend">Suspend instance</option>' +
      '<option value="keep">Keep instance</option>' +
      '</select>' +
      '<span style="margin-left:auto;font-family:var(--font-mono);color:var(--muted)" id="se-run-meta"></span>' +
      '</div>' +

    '</div>' + // end center

    // ── RIGHT: property inspector + suite stats ───────────────────────────
    '<div style="width:220px;flex-shrink:0;border-left:1px solid var(--border);' +
    'display:flex;flex-direction:column;background:var(--bg1);overflow:hidden">' +

      // Suite stats
      '<div style="padding:10px 12px;border-bottom:1px solid var(--border);flex-shrink:0">' +
      '<div style="font-size:9px;font-weight:700;letter-spacing:.1em;color:var(--muted);' +
      'text-transform:uppercase;margin-bottom:8px">Suite</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px" id="se-stats">' +
      seRenderStats() +
      '</div>' +
      '</div>' +

      // Recent runs
      '<div style="padding:10px 12px;border-bottom:1px solid var(--border);flex-shrink:0">' +
      '<div style="font-size:9px;font-weight:700;letter-spacing:.1em;color:var(--muted);' +
      'text-transform:uppercase;margin-bottom:6px">Recent runs</div>' +
      '<div id="se-recent-runs">' + seRenderRecentRuns() + '</div>' +
      '</div>' +

      // Property inspector
      '<div style="flex:1;overflow-y:auto;padding:10px 12px" id="se-prop-inspector">' +
      '<div style="font-size:9px;font-weight:700;letter-spacing:.1em;color:var(--muted);' +
      'text-transform:uppercase;margin-bottom:6px">Step Properties</div>' +
      '<div style="font-size:10px;color:var(--muted);font-style:italic">Click a step to inspect &amp; edit</div>' +
      '</div>' +

      // Gate status
      '<div style="padding:10px 12px;border-top:1px solid var(--border);flex-shrink:0" id="se-gate">' +
      seRenderGateStatus() +
      '</div>' +

    '</div>' + // end right

    '</div>'; // end outer flex

  // Hydrate cleanup select from current script
  seHydrateCleanup();
  seHydrateRunMeta();
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRIPT LIST
// ─────────────────────────────────────────────────────────────────────────────
function seRenderScriptList() {
  if (!_seScripts.length) {
    return '<div style="padding:16px 12px;font-size:10px;color:var(--muted);text-align:center;line-height:1.6">' +
      'No test scripts yet.<br>Click + to create one.</div>';
  }
  return _seScripts.map(function(sc) {
    var run = seLatestRun(sc.id);
    var status = seRunStatus(run);
    var sel = _seSelectedId === sc.id;
    var dotColor = status === 'pass' ? '#4ade80' : status === 'fail' ? '#f87171' : 'rgba(255,255,255,.3)';
    var dotLabel = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'NEW';
    var dotLabelColor = status === 'pass' ? '#4ade80' : status === 'fail' ? '#f87171' : 'var(--muted)';
    var stepCount = (sc.spec.steps || []).length;
    return '<div onclick="seSelectScript(\'' + sc.id + '\')" ' +
      'style="padding:7px 12px;cursor:pointer;border-bottom:1px solid var(--border);' +
      (sel ? 'background:rgba(127,119,221,.08);border-left:2px solid var(--cad);padding-left:10px' : 'border-left:2px solid transparent') + ';transition:background .1s"' +
      'onmouseover="if(\'' + sc.id + '\'!==\'' + _seSelectedId + '\')this.style.background=\'rgba(255,255,255,.02)\'"' +
      'onmouseout="if(\'' + sc.id + '\'!==\'' + _seSelectedId + '\')this.style.background=\'transparent\'">' +
      '<div style="font-size:11px;color:' + (sel ? 'var(--text)' : 'var(--text1)') + ';margin-bottom:3px;line-height:1.3">' +
      escHtml(sc.name) + '</div>' +
      '<div style="display:flex;align-items:center;gap:5px">' +
      '<div style="width:6px;height:6px;border-radius:50%;background:' + dotColor + ';flex-shrink:0"></div>' +
      '<span style="font-size:9px;color:' + dotLabelColor + '">' + dotLabel + '</span>' +
      '<span style="font-size:9px;color:var(--muted);margin-left:auto;font-family:var(--font-mono)">' + stepCount + ' steps</span>' +
      '</div>' +
      '</div>';
  }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRIPT HEADER BAR
// ─────────────────────────────────────────────────────────────────────────────
function seRenderScriptHeader() {
  var sc = seCurrentScript();
  if (!sc) {
    return '<span style="font-size:11px;color:var(--muted)">Select or create a test script</span>';
  }
  var run = seLatestRun(sc.id);
  var status = seRunStatus(run);
  var badgeColor = status === 'pass' ? '#4ade80' : status === 'fail' ? '#f87171' : 'var(--muted)';
  var badgeBg    = status === 'pass' ? 'rgba(74,222,128,.12)' : status === 'fail' ? 'rgba(248,113,113,.12)' : 'rgba(255,255,255,.06)';
  var badgeText  = status === 'pass' ? 'PASSING' : status === 'fail' ? 'FAILING' : 'NOT RUN';

  return '<input id="se-title-input" value="' + escAttr(sc.name) + '" ' +
    'onchange="seRenameScript(this.value)" ' +
    'style="background:transparent;border:none;font-size:12px;font-weight:600;' +
    'color:var(--text);font-family:Arial,sans-serif;outline:none;flex:1;min-width:0">' +
    '<span style="font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;' +
    'padding:2px 6px;border-radius:3px;font-family:var(--font-mono);color:' + badgeColor + ';' +
    'background:' + badgeBg + ';border:1px solid ' + badgeColor + '33;flex-shrink:0" id="se-status-badge">' + badgeText + '</span>' +
    '<button onclick="seRunScript()" ' +
    'style="padding:3px 10px;font-size:10px;font-weight:600;border-radius:4px;cursor:pointer;' +
    'border:1px solid rgba(255,255,255,.15);background:transparent;color:var(--text2);' +
    'transition:all .12s;font-family:Arial,sans-serif" ' +
    'onmouseover="this.style.background=\'rgba(255,255,255,.06)\'" ' +
    'onmouseout="this.style.background=\'transparent\'" ' +
    'id="se-run-btn">▶ Run</button>' +
    '<button onclick="seDeleteScript()" ' +
    'style="padding:3px 8px;font-size:10px;border-radius:4px;cursor:pointer;' +
    'border:1px solid rgba(248,113,113,.3);background:rgba(248,113,113,.08);' +
    'color:#f87171;font-family:Arial,sans-serif">🗑</button>';
}

// ─────────────────────────────────────────────────────────────────────────────
// TIMELINE
// ─────────────────────────────────────────────────────────────────────────────
function seRenderTimeline() {
  var sc = seCurrentScript();
  if (!sc) {
    return '<div style="padding:32px;text-align:center;font-size:11px;color:var(--muted)">' +
      'Select a script from the left panel, or create a new one.</div>';
  }

  var steps = sc.spec.steps || [];
  if (!steps.length) {
    return '<div style="padding:32px;text-align:center;font-size:11px;color:var(--muted);line-height:1.8">' +
      'No steps yet.<br>Drag an action block from the left palette, or drop a template step.</div>' +
      seRenderAddRow();
  }

  var run = seLatestRun(sc.id);
  var failedStepId = (run && run.status === 'failed') ? run.failure_step : null;

  // Failure banner
  var banner = '';
  if (run && run.status === 'failed' && run.failure_reason) {
    banner = '<div style="background:rgba(248,113,113,.07);border:1px solid rgba(248,113,113,.2);' +
      'border-radius:4px;padding:6px 10px;margin-bottom:10px;font-size:10px;color:#f87171;' +
      'display:flex;align-items:flex-start;gap:7px">' +
      '<span style="font-weight:700;flex-shrink:0">✕ ' + escHtml(run.failure_step || '') + '</span>' +
      '<span>' + escHtml(run.failure_reason) + '</span>' +
      '</div>';
  }

  var html = banner;
  var stepsBeforeFail = true;
  for (var i = 0; i < steps.length; i++) {
    var stp = steps[i];
    var isLast = i === steps.length - 1;
    if (stp.id === failedStepId) stepsBeforeFail = false;

    // Determine run result for this step
    var stepResult = 'pending';
    if (run) {
      if (run.status === 'passed') {
        stepResult = 'pass';
      } else if (run.status === 'failed') {
        if (stp.id === failedStepId) stepResult = 'fail';
        else if (stepsBeforeFail) stepResult = 'pass';
        else stepResult = 'ghost';
      }
    }

    html += seRenderStepCard(stp, i, isLast, stepResult, failedStepId, run);
  }

  html += seRenderAddRow();
  return html;
}

function seRenderStepCard(stp, idx, isLast, result, failedStepId, run) {
  var tmpl = _selectedTmpl;
  var tmplSteps = (tmpl && tmpl.steps) ? tmpl.steps : [];

  // Node appearance
  var nodeIcon  = result === 'pass' ? '✓' : result === 'fail' ? '✕' : (idx + 1);
  var nodeBg    = result === 'pass' ? 'rgba(74,222,128,.12)'  : result === 'fail' ? 'rgba(248,113,113,.12)' : 'rgba(127,119,221,.12)';
  var nodeBdr   = result === 'pass' ? '#4ade80'               : result === 'fail' ? '#f87171' : '#7F77DD';
  var nodeColor = result === 'pass' ? '#4ade80'               : result === 'fail' ? '#f87171' : '#7F77DD';
  if (stp.action === 'launch_instance') { nodeBg = 'rgba(127,119,221,.18)'; nodeBdr = '#7F77DD'; nodeColor = '#7F77DD'; }
  var ghost = result === 'ghost';
  var isSel = _seSelectedStep === stp.id;

  // Tag
  var tagHtml = seActionTag(stp.action);

  // Title
  var title = seStepTitle(stp, tmplSteps);

  // Outcome chip
  var outChip = '';
  if (stp.action === 'complete_step' && stp.params && stp.params.outcome) {
    outChip = seOutcomeChip(stp.params.outcome);
  }

  // Actor
  var actor = (stp.params && stp.params.actor) ? stp.params.actor
            : (stp.action === 'launch_instance' && stp.params && stp.params.launched_by) ? stp.params.launched_by
            : '';

  // Route back bar
  var routeBar = '';
  if (stp.action === 'complete_step' && stp.params && stp.params.route_to_seq != null) {
    var rtStep = tmplSteps.find(function(s){ return s.sequence_order === Number(stp.params.route_to_seq); });
    routeBar = '<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;' +
      'background:rgba(248,113,113,.07);border:1px solid rgba(248,113,113,.22);' +
      'border-radius:4px;font-size:9px;color:#f87171;font-family:var(--font-mono);margin-top:5px">' +
      '↩ ROUTE BACK → seq ' + stp.params.route_to_seq +
      (rtStep ? ' (' + escHtml(rtStep.name) + ')' : '') +
      '<button onclick="seClearRoute(\'' + stp.id + '\')" ' +
      'style="background:none;border:none;color:rgba(248,113,113,.6);font-size:9px;' +
      'cursor:pointer;margin-left:auto;font-family:Arial,sans-serif">clear ×</button>' +
      '</div>';
  }

  // Assertions
  var assertsHtml = seRenderAssertions(stp, result, run, failedStepId);

  // Card body — varies by action
  var bodyHtml = seRenderCardBody(stp, tmplSteps, routeBar, assertsHtml, result);

  // Line below spine node
  var lineStyle = 'width:2px;flex:1;min-height:12px;margin:2px 0;';
  if (stp.params && stp.params.route_to_seq != null) {
    lineStyle += 'background:repeating-linear-gradient(to bottom,#f87171 0,#f87171 4px,transparent 4px,transparent 8px)';
  } else {
    lineStyle += 'background:rgba(255,255,255,.1)';
  }

  return '<div class="se-step-row" data-id="' + stp.id + '" ' +
    'style="display:flex;gap:0;position:relative;' + (ghost ? 'opacity:.35' : '') + '">' +
    // Spine
    '<div style="width:30px;flex-shrink:0;display:flex;flex-direction:column;align-items:center">' +
    '<div style="width:26px;height:26px;border-radius:50%;display:flex;align-items:center;' +
    'justify-content:center;font-size:9px;font-weight:700;font-family:var(--font-mono);' +
    'flex-shrink:0;border:2px solid ' + nodeBdr + ';background:' + nodeBg + ';' +
    'color:' + nodeColor + ';z-index:2">' + nodeIcon + '</div>' +
    (isLast ? '' : '<div style="' + lineStyle + '"></div>') +
    '</div>' +
    // Card
    '<div style="flex:1;padding:0 0 12px 10px;min-width:0">' +
    '<div onclick="seSelectStep(\'' + stp.id + '\')" ' +
    'style="background:var(--bg2);border:1px solid ' +
    (result === 'fail' ? 'rgba(248,113,113,.4)' : isSel ? 'rgba(127,119,221,.35)' : 'rgba(255,255,255,.07)') +
    ';border-radius:5px;overflow:hidden;cursor:pointer;transition:border-color .12s">' +
    // Card header
    '<div style="padding:5px 10px;display:flex;align-items:center;gap:6px;' +
    'background:' + (result === 'fail' ? 'rgba(248,113,113,.05)' : 'rgba(255,255,255,.03)') + ';' +
    'border-bottom:' + (bodyHtml ? '1px solid rgba(255,255,255,.06)' : 'none') + '">' +
    tagHtml +
    '<span style="font-size:11px;font-weight:600;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
    title + '</span>' +
    outChip +
    (actor ? '<span style="font-size:9px;color:var(--muted);font-family:var(--font-mono);flex-shrink:0">' + escHtml(actor) + '</span>' : '') +
    '<span style="font-size:9px;color:rgba(255,255,255,.2);font-family:var(--font-mono);flex-shrink:0">' + stp.id + '</span>' +
    '<button onclick="event.stopPropagation();seDeleteStep(\'' + stp.id + '\')" ' +
    'style="background:none;border:none;color:rgba(255,255,255,.2);cursor:pointer;' +
    'font-size:12px;padding:0 0 0 4px;line-height:1;flex-shrink:0" ' +
    'onmouseover="this.style.color=\'#f87171\'" onmouseout="this.style.color=\'rgba(255,255,255,.2)\'">×</button>' +
    '</div>' +
    bodyHtml +
    '</div>' +
    '</div>' +
    '</div>';
}

function seRenderCardBody(stp, tmplSteps, routeBar, assertsHtml, result) {
  var parts = [];

  if (stp.action === 'launch_instance') {
    parts.push(seFieldRow('Title', (stp.params && stp.params.title) || 'BIST — {timestamp}', true));
    parts.push(seFieldRow('Actor', (stp.params && stp.params.launched_by) || 'system', true));

  } else if (stp.action === 'complete_step') {
    var seq = stp.params ? stp.params.step_seq : null;
    var tmplStep = seq ? tmplSteps.find(function(s){ return s.sequence_order === Number(seq); }) : null;
    var isForm = tmplStep && (tmplStep.step_type === 'form' || tmplStep.step_type === 'collaborative_form');

    // Outcome + actor row (inline selects)
    var outcomeOpts = seOutcomeOptions(tmplStep ? tmplStep.step_type : 'action');
    var actorOpts = seActorOptions(stp.params ? stp.params.actor : '');

    parts.push('<div style="padding:6px 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<span style="font-size:9px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;width:56px;flex-shrink:0">Outcome</span>' +
      '<select onchange="event.stopPropagation();seUpdateParam(\'' + stp.id + '\',\'outcome\',this.value)" ' +
      'onclick="event.stopPropagation()" ' +
      'style="font-size:10px;font-family:var(--font-mono);background:var(--bg0);border:1px solid var(--border);border-radius:3px;padding:2px 5px;color:var(--text2);cursor:pointer;outline:none">' +
      outcomeOpts + '</select>' +
      '<span style="font-size:9px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;flex-shrink:0;margin-left:8px">Actor</span>' +
      '<select onchange="event.stopPropagation();seUpdateParam(\'' + stp.id + '\',\'actor\',this.value)" ' +
      'onclick="event.stopPropagation()" ' +
      'style="font-size:10px;font-family:var(--font-mono);background:var(--bg0);border:1px solid var(--border);border-radius:3px;padding:2px 5px;color:var(--text2);cursor:pointer;outline:none">' +
      actorOpts + '</select>' +
      '</div>');

    // Form data block — only for form-type steps
    if (isForm && stp.params && stp.params.form_data) {
      parts.push(seRenderFormDataBlock(stp, tmplStep));
    } else if (isForm) {
      parts.push('<div style="padding:2px 10px 6px">' +
        '<button onclick="event.stopPropagation();seAddFormData(\'' + stp.id + '\')" ' +
        'style="font-size:9px;color:#b070e0;background:none;border:none;cursor:pointer;' +
        'font-family:Arial,sans-serif">+ Set form field values</button>' +
        '</div>');
    }

    if (routeBar) parts.push('<div style="padding:0 10px 6px">' + routeBar + '</div>');

  } else if (stp.action === 'complete_form_section') {
    var seq2 = stp.params ? stp.params.step_seq : null;
    var tmplStep2 = seq2 ? tmplSteps.find(function(s){ return s.sequence_order === Number(seq2); }) : null;
    parts.push('<div style="padding:6px 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      seFieldRow('Step seq', seq2 || '—', true) +
      seFieldRow('Section', (stp.params && stp.params.section_id) || '—', true) +
      seFieldRow('Actor', (stp.params && stp.params.actor) || '—', true) +
      '</div>');
    if (tmplStep2) {
      parts.push('<div style="padding:2px 10px 6px;font-size:9px;color:#b070e0">' +
        'Form: ' + escHtml(tmplStep2.name) + ' (' + escHtml(tmplStep2.step_type || '') + ')</div>');
    }

  } else if (stp.action === 'wait') {
    parts.push('<div style="padding:6px 10px">' +
      '<span style="font-size:9px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-right:8px">Wait</span>' +
      '<input type="number" value="' + ((stp.params && stp.params.ms) || 500) + '" ' +
      'onchange="event.stopPropagation();seUpdateParam(\'' + stp.id + '\',\'ms\',parseInt(this.value))" ' +
      'onclick="event.stopPropagation()" ' +
      'style="width:64px;font-size:10px;background:var(--bg0);border:1px solid var(--border);' +
      'border-radius:3px;padding:2px 5px;color:var(--text);outline:none" />' +
      '<span style="font-size:9px;color:var(--muted);margin-left:6px">ms</span>' +
      '</div>');

  } else if (stp.action === 'assert_only') {
    // No body fields beyond assertions
  }

  // Assertions section (all action types can have assertions)
  if (assertsHtml) {
    parts.push('<div style="padding:0 10px 8px">' +
      '<div style="font-size:9px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px">Assertions</div>' +
      assertsHtml +
      '<button onclick="event.stopPropagation();seAddAssert(\'' + stp.id + '\')" ' +
      'style="font-size:9px;color:#f59e0b;background:none;border:none;cursor:pointer;' +
      'margin-top:4px;font-family:Arial,sans-serif">+ assertion</button>' +
      '</div>');
  } else {
    parts.push('<div style="padding:2px 10px 6px">' +
      '<button onclick="event.stopPropagation();seAddAssert(\'' + stp.id + '\')" ' +
      'style="font-size:9px;color:#f59e0b;background:none;border:none;cursor:pointer;font-family:Arial,sans-serif">+ assertion</button>' +
      '</div>');
  }

  if (!parts.length) return '';
  return parts.join('');
}

function seRenderFormDataBlock(stp, tmplStep) {
  var fd = stp.params.form_data || {};
  var keys = Object.keys(fd);
  if (!keys.length) {
    return '<div style="padding:2px 10px 6px;font-size:9px;color:#b070e0">Form data: (empty) ' +
      '<button onclick="event.stopPropagation();seAddFormData(\'' + stp.id + '\')" ' +
      'style="font-size:9px;color:#b070e0;background:none;border:none;cursor:pointer">edit</button></div>';
  }
  return '<div style="padding:4px 10px 6px">' +
    '<div style="font-size:9px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px">Form field values</div>' +
    keys.map(function(k) {
      return '<div style="display:flex;align-items:center;gap:6px;padding:2px 0">' +
        '<span style="font-size:9px;color:#b070e0;font-family:var(--font-mono);flex:1">' + escHtml(k) + '</span>' +
        '<span style="font-size:9px;color:var(--text2);font-family:var(--font-mono)">' + escHtml(String(fd[k])) + '</span>' +
        '</div>';
    }).join('') +
    '</div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSERTIONS
// ─────────────────────────────────────────────────────────────────────────────
function seRenderAssertions(stp, result, run, failedStepId) {
  var asserts = stp.asserts || [];
  if (!asserts.length) return '';

  var isFailed = result === 'fail' && stp.id === failedStepId;

  var rows = asserts.map(function(a, ai) {
    // Determine if this specific assertion failed
    var aFailed = isFailed && run && run.failure_reason &&
      run.failure_reason.indexOf(a.check) === 0;
    var aResult = result === 'pass' ? 'pass' : aFailed ? 'fail' : result;

    var rowBg  = aFailed ? 'rgba(248,113,113,.08)' : 'rgba(255,255,255,.03)';
    var rowBdr = aFailed ? 'rgba(248,113,113,.3)'  : 'rgba(255,255,255,.08)';

    // Operator / value display
    var opVal = '';
    if (a.eq         !== undefined) opVal = 'eq ' + JSON.stringify(a.eq);
    else if (a.not_eq !== undefined) opVal = '≠ ' + JSON.stringify(a.not_eq);
    else if (a.gte   !== undefined) opVal = '≥ ' + a.gte;
    else if (a.lte   !== undefined) opVal = '≤ ' + a.lte;
    else if (a.contains !== undefined) opVal = 'contains ' + JSON.stringify(a.contains);
    else if (a.exists !== undefined) opVal = 'exists';
    else if (a.not_exists !== undefined) opVal = 'not_exists';

    var resultEl = '';
    if (result === 'pass') resultEl = '<span style="font-size:9px;font-weight:700;color:#4ade80;margin-left:auto">✓</span>';
    else if (aFailed) {
      // Extract actual value from failure_reason: "path: expected X, got Y"
      var actualVal = '?';
      if (run && run.failure_reason) {
        var m = run.failure_reason.match(/got (.+)$/);
        if (m) actualVal = m[1];
      }
      resultEl = '<span style="font-size:9px;font-weight:700;color:#f87171;margin-left:auto">✕ got ' + escHtml(actualVal) + '</span>';
    }

    return '<div style="display:flex;align-items:center;gap:5px;padding:3px 7px;' +
      'background:' + rowBg + ';border-radius:3px;border:1px solid ' + rowBdr + ';margin-bottom:3px">' +
      '<span style="font-size:9px;color:#2dd4bf;font-family:var(--font-mono);flex:1;overflow:hidden;text-overflow:ellipsis">' +
      escHtml(a.check) + '</span>' +
      '<span style="font-size:9px;font-weight:700;color:#f59e0b;font-family:var(--font-mono)">' + escHtml(opVal) + '</span>' +
      resultEl +
      '<button onclick="event.stopPropagation();seDeleteAssert(\'' + stp.id + '\',' + ai + ')" ' +
      'style="background:none;border:none;color:rgba(255,255,255,.2);cursor:pointer;font-size:10px;' +
      'padding:0 0 0 4px;line-height:1;flex-shrink:0" ' +
      'onmouseover="this.style.color=\'#f87171\'" onmouseout="this.style.color=\'rgba(255,255,255,.2)\'">×</button>' +
      '</div>';
  }).join('');

  // Diff panel for failed assertion
  var diffHtml = '';
  if (isFailed && run && run.failure_reason) {
    var failedAssert = (asserts || []).find(function(a) {
      return run.failure_reason && run.failure_reason.indexOf(a.check) === 0;
    });
    if (failedAssert) {
      var mActual = run.failure_reason.match(/got (.+)$/);
      var mExpected = run.failure_reason.match(/expected ([^,]+)/);
      var actualStr  = mActual  ? mActual[1]  : '?';
      var expectedStr = mExpected ? mExpected[1] : '?';
      diffHtml = '<div style="background:var(--bg2);border:1px solid rgba(248,113,113,.25);' +
        'border-radius:4px;padding:7px 9px;margin-top:4px">' +
        '<div style="font-size:9px;font-weight:700;color:#f87171;margin-bottom:5px;letter-spacing:.05em">' +
        '✕ Diff — ' + escHtml(failedAssert.check) + '</div>' +
        '<div style="display:flex;gap:6px;font-size:9px;font-family:var(--font-mono);margin-bottom:3px">' +
        '<span style="color:var(--muted);width:52px;flex-shrink:0">Expected</span>' +
        '<span style="color:#4ade80">' + escHtml(expectedStr) + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:6px;font-size:9px;font-family:var(--font-mono);margin-bottom:5px">' +
        '<span style="color:var(--muted);width:52px;flex-shrink:0">Actual</span>' +
        '<span style="color:#f87171">' + escHtml(actualStr) + '</span>' +
        '</div>' +
        '<div style="font-size:9px;color:var(--muted);line-height:1.5">' +
        seGenerateDiffHint(failedAssert, actualStr, expectedStr) +
        '</div>' +
        '</div>';
    }
  }

  return rows + diffHtml;
}

function seGenerateDiffHint(assert, actual, expected) {
  // Smart hints based on the assertion check path
  var check = assert.check || '';
  if (check.indexOf('.loops') >= 0) {
    return 'Step completed ' + escHtml(actual) + ' time(s) at assertion point. ' +
      'Consider using <span style="color:#f59e0b;font-family:var(--font-mono)">eq:' + escHtml(actual) + '</span> ' +
      'or repositioning this assertion before the repeat block.';
  }
  if (check.indexOf('.state') >= 0) {
    return 'Step state was <span style="color:#f87171;font-family:var(--font-mono)">' + escHtml(actual) + '</span> ' +
      'at assertion time. Check sequence — step may not have advanced yet.';
  }
  if (check.indexOf('.outcome') >= 0) {
    return 'Last outcome recorded was <span style="color:#f87171;font-family:var(--font-mono)">' + escHtml(actual) + '</span>. ' +
      'Verify the complete_step action fires with the correct outcome before this assertion.';
  }
  if (check.indexOf('form.') >= 0) {
    return 'Form field value mismatch. Confirm form_data in the complete_step action sets this field correctly.';
  }
  return 'Expected <span style="color:#4ade80;font-family:var(--font-mono)">' + escHtml(expected) + '</span>, ' +
    'got <span style="color:#f87171;font-family:var(--font-mono)">' + escHtml(actual) + '</span>.';
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPERTY INSPECTOR
// ─────────────────────────────────────────────────────────────────────────────
function seRenderPropInspector(stepId) {
  var el = document.getElementById('se-prop-inspector');
  if (!el) return;

  var sc = seCurrentScript();
  if (!sc || !stepId) {
    el.innerHTML = '<div style="font-size:9px;font-weight:700;letter-spacing:.1em;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Step Properties</div>' +
      '<div style="font-size:10px;color:var(--muted);font-style:italic">Click a step to inspect &amp; edit</div>';
    return;
  }

  var stp = (sc.spec.steps || []).find(function(s){ return s.id === stepId; });
  if (!stp) return;

  var tmpl = _selectedTmpl;
  var tmplSteps = (tmpl && tmpl.steps) ? tmpl.steps : [];
  var tmplStep = stp.params && stp.params.step_seq
    ? tmplSteps.find(function(s){ return s.sequence_order === Number(stp.params.step_seq); })
    : null;
  var isForm = tmplStep && (tmplStep.step_type === 'form' || tmplStep.step_type === 'collaborative_form');

  var html = '<div style="font-size:9px;font-weight:700;letter-spacing:.1em;color:var(--muted);text-transform:uppercase;margin-bottom:8px">Step — ' + escHtml(stp.id) + '</div>';

  // Template step selector (for complete_step / complete_form_section)
  if (stp.action === 'complete_step' || stp.action === 'complete_form_section') {
    html += '<div style="margin-bottom:8px">' +
      '<div style="font-size:9px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px">Template step</div>' +
      '<select onchange="seUpdateParam(\'' + stp.id + '\',\'step_seq\',parseInt(this.value))" ' +
      'style="width:100%;font-size:10px;font-family:var(--font-mono);background:var(--bg0);' +
      'border:1px solid var(--border);border-radius:3px;padding:3px 6px;color:var(--text2);outline:none;cursor:pointer">' +
      tmplSteps.map(function(ts) {
        var sel = stp.params && Number(stp.params.step_seq) === ts.sequence_order ? 'selected' : '';
        return '<option value="' + ts.sequence_order + '" ' + sel + '>' +
          ts.sequence_order + '. ' + escHtml(ts.name) + ' (' + (ts.step_type||'') + ')</option>';
      }).join('') +
      '</select>' +
      '</div>';
  }

  // Actor
  if (stp.action !== 'assert_only') {
    var actorKey = stp.action === 'launch_instance' ? 'launched_by' : 'actor';
    var actorVal = (stp.params && stp.params[actorKey]) || '';
    html += '<div style="margin-bottom:8px">' +
      '<div style="font-size:9px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px">Actor</div>' +
      '<select onchange="seUpdateParam(\'' + stp.id + '\',\'' + actorKey + '\',this.value)" ' +
      'style="width:100%;font-size:10px;font-family:var(--font-mono);background:var(--bg0);' +
      'border:1px solid var(--border);border-radius:3px;padding:3px 6px;color:var(--text2);outline:none;cursor:pointer">' +
      seActorOptions(actorVal) + '</select>' +
      '</div>';
  }

  // Outcome (complete_step)
  if (stp.action === 'complete_step') {
    html += '<div style="margin-bottom:8px">' +
      '<div style="font-size:9px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px">Outcome</div>' +
      '<select onchange="seUpdateParam(\'' + stp.id + '\',\'outcome\',this.value)" ' +
      'style="width:100%;font-size:10px;font-family:var(--font-mono);background:var(--bg0);' +
      'border:1px solid var(--border);border-radius:3px;padding:3px 6px;color:var(--text2);outline:none;cursor:pointer">' +
      seOutcomeOptions(tmplStep ? tmplStep.step_type : 'action', stp.params ? stp.params.outcome : '') +
      '</select>' +
      '</div>';

    // Route back
    html += '<div style="margin-bottom:8px">' +
      '<div style="font-size:9px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px">Route back to seq</div>' +
      '<select onchange="seUpdateRouteBack(\'' + stp.id + '\',this.value)" ' +
      'style="width:100%;font-size:10px;font-family:var(--font-mono);background:var(--bg0);' +
      'border:1px solid var(--border);border-radius:3px;padding:3px 6px;color:var(--text2);outline:none;cursor:pointer">' +
      '<option value="">— No route back —</option>' +
      tmplSteps.map(function(ts) {
        var sel = stp.params && Number(stp.params.route_to_seq) === ts.sequence_order ? 'selected' : '';
        return '<option value="' + ts.sequence_order + '" ' + sel + '>' +
          ts.sequence_order + '. ' + escHtml(ts.name) + '</option>';
      }).join('') +
      '</select>' +
      '</div>';

    // Form data fields — shown when step is a form type
    if (isForm) {
      html += '<div style="margin-bottom:8px">' +
        '<div style="font-size:9px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px">Form field values</div>' +
        seRenderFormFieldEditor(stp, tmplStep) +
        '</div>';
    }
  }

  // Section id (complete_form_section)
  if (stp.action === 'complete_form_section') {
    var sectionId = (stp.params && stp.params.section_id) || '';
    html += '<div style="margin-bottom:8px">' +
      '<div style="font-size:9px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px">Section ID</div>' +
      '<input value="' + escAttr(sectionId) + '" ' +
      'onchange="seUpdateParam(\'' + stp.id + '\',\'section_id\',this.value)" ' +
      'style="width:100%;font-size:10px;font-family:var(--font-mono);background:var(--bg0);' +
      'border:1px solid var(--border);border-radius:3px;padding:3px 6px;color:var(--text);outline:none" />' +
      '</div>';
  }

  // Add assertion builder
  html += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">' +
    '<div style="font-size:9px;font-weight:700;letter-spacing:.1em;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Add Assertion</div>' +
    seRenderAssertBuilder(stp, tmplStep, isForm) +
    '</div>';

  // Delete step
  html += '<div style="margin-top:10px">' +
    '<button onclick="seDeleteStep(\'' + stp.id + '\')" ' +
    'style="width:100%;padding:4px 0;font-size:9px;border-radius:4px;cursor:pointer;' +
    'border:1px solid rgba(248,113,113,.3);background:rgba(248,113,113,.07);color:#f87171;' +
    'font-family:Arial,sans-serif">Remove step</button>' +
    '</div>';

  el.innerHTML = html;
}

function seRenderFormFieldEditor(stp, tmplStep) {
  var fd = (stp.params && stp.params.form_data) || {};
  // Try to get field list from cache or form definition
  var formId = tmplStep ? tmplStep.form_id || tmplStep.form_template_id : null;
  var fields = formId ? (_seFormFieldCache[formId] || []) : [];

  var html = '';
  if (fields.length) {
    // Render known fields
    html += fields.map(function(f) {
      var val = fd[f.id] !== undefined ? fd[f.id] : '';
      return '<div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">' +
        '<span style="font-size:9px;color:#b070e0;font-family:var(--font-mono);width:80px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escAttr(f.label) + '">' + escHtml(f.id) + '</span>' +
        '<input value="' + escAttr(String(val)) + '" placeholder="' + escAttr(f.type) + '" ' +
        'onchange="seUpdateFormField(\'' + stp.id + '\',\'' + escAttr(f.id) + '\',this.value)" ' +
        'style="flex:1;font-size:9px;font-family:var(--font-mono);background:var(--bg0);' +
        'border:1px solid var(--border);border-radius:3px;padding:2px 5px;color:var(--text);outline:none" />' +
        '</div>';
    }).join('');
  } else {
    // Free-form key-value pairs
    var keys2 = Object.keys(fd);
    html += keys2.map(function(k) {
      return '<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">' +
        '<input value="' + escAttr(k) + '" placeholder="field_id" ' +
        'style="width:80px;flex-shrink:0;font-size:9px;font-family:var(--font-mono);background:var(--bg0);border:1px solid var(--border);border-radius:3px;padding:2px 4px;color:var(--text);outline:none" />' +
        '<input value="' + escAttr(String(fd[k])) + '" placeholder="value" ' +
        'onchange="seUpdateFormField(\'' + stp.id + '\',\'' + escAttr(k) + '\',this.value)" ' +
        'style="flex:1;font-size:9px;font-family:var(--font-mono);background:var(--bg0);border:1px solid var(--border);border-radius:3px;padding:2px 4px;color:var(--text);outline:none" />' +
        '</div>';
    }).join('');
    html += '<button onclick="seAddFormField(\'' + stp.id + '\')" ' +
      'style="font-size:9px;color:#b070e0;background:none;border:none;cursor:pointer;font-family:Arial,sans-serif;padding:0;margin-top:2px">+ add field</button>';
  }
  return html;
}

function seRenderAssertBuilder(stp, tmplStep, isForm) {
  var seq = stp.params ? stp.params.step_seq : null;
  var stepN = seq ? 'step[' + seq + ']' : 'step[N]';

  // Build check path options
  var workflowPaths = SE_CHECK_WORKFLOW.map(function(c) {
    return c.path.replace('step[N]', stepN);
  });
  var formPaths = isForm ? SE_CHECK_FORM_BASE.map(function(c) {
    return c.path.replace('step[N]', stepN);
  }) : [];

  // If we have cached form fields, also add step[N].form.fields.*
  var formId = tmplStep ? tmplStep.form_id || tmplStep.form_template_id : null;
  var formFields = formId ? (_seFormFieldCache[formId] || []) : [];
  var fieldPaths = formFields.map(function(f) {
    return stepN + '.form.fields.' + f.id;
  });

  var allPaths = workflowPaths.concat(formPaths).concat(fieldPaths);

  return '<div style="display:flex;flex-direction:column;gap:4px">' +
    '<div style="font-size:9px;color:var(--muted);margin-bottom:2px">Check path</div>' +
    '<select id="pi-check-' + stp.id + '" ' +
    'style="width:100%;font-size:9px;font-family:var(--font-mono);background:var(--bg0);' +
    'border:1px solid var(--border);border-radius:3px;padding:2px 5px;color:var(--text2);outline:none;cursor:pointer">' +
    allPaths.map(function(p) { return '<option value="' + escAttr(p) + '">' + escHtml(p) + '</option>'; }).join('') +
    '<option value="custom">— custom path —</option>' +
    '</select>' +
    '<div style="display:flex;gap:4px;margin-top:2px">' +
    '<select id="pi-op-' + stp.id + '" ' +
    'style="flex:1;font-size:9px;font-family:var(--font-mono);background:var(--bg0);' +
    'border:1px solid var(--border);border-radius:3px;padding:2px 4px;color:var(--text2);outline:none;cursor:pointer">' +
    SE_OPS.map(function(op) { return '<option>' + op + '</option>'; }).join('') +
    '</select>' +
    '<input id="pi-val-' + stp.id + '" placeholder="value" ' +
    'style="flex:1;font-size:9px;font-family:var(--font-mono);background:var(--bg0);' +
    'border:1px solid var(--border);border-radius:3px;padding:2px 4px;color:var(--text);outline:none" />' +
    '</div>' +
    '<button onclick="seAddAssertFromInspector(\'' + stp.id + '\')" ' +
    'style="margin-top:2px;padding:3px 0;font-size:9px;font-weight:600;border-radius:4px;cursor:pointer;' +
    'border:1px solid rgba(74,222,128,.4);background:rgba(74,222,128,.1);color:#4ade80;' +
    'font-family:Arial,sans-serif">+ Add assertion</button>' +
    '</div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS + GATE
// ─────────────────────────────────────────────────────────────────────────────
function seRenderStats() {
  var passing = 0, failing = 0, notRun = 0, assertions = 0;
  _seScripts.forEach(function(sc) {
    var run = seLatestRun(sc.id);
    var s = seRunStatus(run);
    if (s === 'pass') passing++;
    else if (s === 'fail') failing++;
    else notRun++;
    (sc.spec.steps || []).forEach(function(stp) {
      assertions += (stp.asserts || []).length;
    });
  });
  return seStatCard(passing, 'Passing', '#4ade80') +
    seStatCard(failing, 'Failing', '#f87171') +
    seStatCard(notRun, 'Not run', 'var(--muted)') +
    seStatCard(assertions, 'Assertions', '#f59e0b');
}

function seStatCard(val, label, color) {
  return '<div style="background:var(--bg2);border-radius:4px;padding:7px 9px;border:1px solid var(--border)">' +
    '<div style="font-size:18px;font-weight:700;font-family:var(--font-mono);line-height:1;margin-bottom:2px;color:' + color + '">' + val + '</div>' +
    '<div style="font-size:9px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase">' + label + '</div>' +
    '</div>';
}

function seRenderRecentRuns() {
  var relevant = _seRecentRuns.slice(0, 6);
  if (!relevant.length) return '<div style="font-size:10px;color:var(--muted);font-style:italic">No runs yet</div>';
  return relevant.map(function(r) {
    var sc = _seScripts.find(function(s){ return s.id === r.script_id; });
    var name = sc ? sc.name : (r.script_id || '').slice(0, 8);
    var dotColor = r.status === 'passed' ? '#4ade80' : r.status === 'failed' ? '#f87171' : 'var(--muted)';
    var dur = r.duration_ms ? (r.duration_ms / 1000).toFixed(1) + 's' : '—';
    return '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border)">' +
      '<div style="width:6px;height:6px;border-radius:50%;background:' + dotColor + ';flex-shrink:0"></div>' +
      '<span style="font-size:10px;color:var(--text2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(name) + '</span>' +
      '<span style="font-size:9px;color:var(--muted);font-family:var(--font-mono);flex-shrink:0">' + dur + '</span>' +
      '</div>';
  }).join('');
}

function seRenderGateStatus() {
  var passing = _seScripts.filter(function(sc) { return seRunStatus(seLatestRun(sc.id)) === 'pass'; }).length;
  var total = _seScripts.length;
  var allPass = total > 0 && passing === total;
  var hasFail = _seScripts.some(function(sc) { return seRunStatus(seLatestRun(sc.id)) === 'fail'; });

  if (allPass) {
    return '<div style="background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.3);' +
      'border-radius:4px;padding:7px 10px">' +
      '<div style="font-size:10px;font-weight:700;color:#4ade80">✓ Gate clear</div>' +
      '<div style="font-size:9px;color:rgba(74,222,128,.7);margin-top:2px">All ' + total + ' scripts passing — ready to release</div>' +
      '</div>';
  }
  if (hasFail) {
    var failCount = _seScripts.filter(function(sc) { return seRunStatus(seLatestRun(sc.id)) === 'fail'; }).length;
    return '<div style="background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.3);' +
      'border-radius:4px;padding:7px 10px">' +
      '<div style="font-size:10px;font-weight:700;color:#f87171">✕ Cannot Release</div>' +
      '<div style="font-size:9px;color:rgba(248,113,113,.7);margin-top:2px">' + failCount + ' script(s) failing. Fix before publishing.</div>' +
      '</div>';
  }
  return '<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);' +
    'border-radius:4px;padding:7px 10px">' +
    '<div style="font-size:10px;font-weight:700;color:#f59e0b">○ Not run</div>' +
    '<div style="font-size:9px;color:rgba(245,158,11,.7);margin-top:2px">Run scripts against current version before releasing.</div>' +
    '</div>';
}

function seRenderAddRow() {
  return '<div style="display:flex;gap:6px;padding:8px 0 0 40px;flex-wrap:wrap">' +
    SE_ACTIONS.map(function(a) {
      return '<button onclick="seQuickAdd(\'' + a.action + '\')" ' +
        'style="padding:3px 8px;border:1px dashed rgba(255,255,255,.12);border-radius:4px;' +
        'font-size:9px;color:var(--muted);cursor:pointer;transition:all .12s;background:transparent;' +
        'font-family:Arial,sans-serif" ' +
        'onmouseover="this.style.borderColor=\'' + a.color + '\';this.style.color=\'' + a.color + '\'" ' +
        'onmouseout="this.style.borderColor=\'rgba(255,255,255,.12)\';this.style.color=\'var(--muted)\'">' +
        '+ ' + a.label + '</button>';
    }).join('') +
    '</div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAG AND DROP
// ─────────────────────────────────────────────────────────────────────────────
function sePalDragStart(event, action) {
  _seDragAction = action;
  _seDragTmplSeq = null;
  event.dataTransfer.effectAllowed = 'copy';
}
function seTmplDragStart(event, seq, name, type) {
  _seDragAction = 'complete_step';
  _seDragTmplSeq = seq;
  event.dataTransfer.effectAllowed = 'copy';
}
function sePalDragEnd(event) {
  _seDragAction = null;
  _seDragTmplSeq = null;
}
function seDzOver(event, id) {
  event.preventDefault();
  var el = document.getElementById(id);
  if (el) { el.style.borderColor = 'var(--cad)'; el.style.background = 'rgba(127,119,221,.08)'; el.style.color = 'var(--cad)'; }
}
function seDzLeave(id) {
  var el = document.getElementById(id);
  if (el) { el.style.borderColor = 'rgba(255,255,255,.15)'; el.style.background = 'transparent'; el.style.color = 'var(--muted)'; }
}
function seDzDrop(event) {
  event.preventDefault();
  seDzLeave('se-dz-append');
  seAppendActionStep(_seDragAction, _seDragTmplSeq);
}

function seAppendActionStep(action, tmplSeq) {
  if (!action) return;
  var sc = seCurrentScript();
  if (!sc) return;
  var steps = sc.spec.steps = sc.spec.steps || [];
  var newId = 's' + (Date.now() % 100000);

  var params = {};
  if (action === 'launch_instance') {
    params = { title: 'BIST — {timestamp}', launched_by: seDefaultActor() };
  } else if (action === 'complete_step') {
    var seq = tmplSeq || 1;
    var tmplStep = seGetTmplStep(seq);
    params = { step_seq: seq, actor: seDefaultActor(),
      outcome: tmplStep ? seDefaultOutcome(tmplStep.step_type) : 'submitted' };
  } else if (action === 'complete_form_section') {
    params = { step_seq: tmplSeq || 1, section_id: 'section_a', actor: seDefaultActor() };
  } else if (action === 'wait') {
    params = { ms: 500 };
  } else if (action === 'assert_only') {
    params = {};
  }

  steps.push({ id: newId, action: action, params: params, asserts: [] });
  _seDirty = true;
  _seSelectedStep = newId;
  seRefreshTimeline();
  seRenderPropInspector(newId);
}

function seQuickAdd(action) {
  seAppendActionStep(action, null);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP MUTATIONS
// ─────────────────────────────────────────────────────────────────────────────
function seSelectScript(id) {
  _seSelectedId = id;
  _seSelectedStep = null;
  var listEl = document.getElementById('se-script-list');
  if (listEl) listEl.innerHTML = seRenderScriptList();
  var hdrEl = document.getElementById('se-script-hdr');
  if (hdrEl) hdrEl.innerHTML = seRenderScriptHeader();
  seRefreshTimeline();
  seRenderPropInspector(null);
  seHydrateCleanup();
  seHydrateRunMeta();
}

function seSelectStep(id) {
  _seSelectedStep = id;
  // Update card borders
  document.querySelectorAll('.se-step-row').forEach(function(row) {
    var card = row.querySelector('[style*="border-radius:5px"]') || row.querySelector('[style*="border-radius: 5px"]');
    if (card) {
      var rid = row.getAttribute('data-id');
      if (rid === id) {
        card.style.borderColor = 'rgba(127,119,221,.35)';
      } else if (card.style.borderColor !== 'rgba(248,113,113,.4)') {
        card.style.borderColor = 'rgba(255,255,255,.07)';
      }
    }
  });
  seRenderPropInspector(id);
}

function seDeleteStep(id) {
  var sc = seCurrentScript();
  if (!sc) return;
  sc.spec.steps = (sc.spec.steps || []).filter(function(s){ return s.id !== id; });
  if (_seSelectedStep === id) { _seSelectedStep = null; seRenderPropInspector(null); }
  _seDirty = true;
  seRefreshTimeline();
}

function seUpdateParam(stepId, key, val) {
  var stp = seGetStep(stepId);
  if (!stp) return;
  stp.params = stp.params || {};
  stp.params[key] = val;
  _seDirty = true;
  seRefreshTimeline();
}

function seUpdateRouteBack(stepId, val) {
  var stp = seGetStep(stepId);
  if (!stp) return;
  stp.params = stp.params || {};
  stp.params.route_to_seq = val ? parseInt(val) : null;
  _seDirty = true;
  seRefreshTimeline();
}

function seClearRoute(stepId) {
  seUpdateRouteBack(stepId, null);
}

function seUpdateFormField(stepId, fieldId, val) {
  var stp = seGetStep(stepId);
  if (!stp) return;
  stp.params = stp.params || {};
  stp.params.form_data = stp.params.form_data || {};
  stp.params.form_data[fieldId] = val;
  _seDirty = true;
}

function seAddFormData(stepId) {
  var stp = seGetStep(stepId);
  if (!stp) return;
  stp.params = stp.params || {};
  stp.params.form_data = stp.params.form_data || {};
  _seDirty = true;
  seRenderPropInspector(stepId);
}

function seAddFormField(stepId) {
  var key = prompt('Field ID:');
  if (!key) return;
  seUpdateFormField(stepId, key, '');
  seRenderPropInspector(stepId);
}

function seAddAssert(stepId) {
  var stp = seGetStep(stepId);
  if (!stp) return;
  stp.asserts = stp.asserts || [];
  var seq = stp.params ? stp.params.step_seq : null;
  var check = seq ? ('step[' + seq + '].state') : 'step[1].state';
  stp.asserts.push({ check: check, eq: 'done' });
  _seDirty = true;
  seRefreshTimeline();
  seRenderPropInspector(stepId);
}

function seAddAssertToLast() {
  var sc = seCurrentScript();
  if (!sc || !sc.spec.steps || !sc.spec.steps.length) return;
  var last = sc.spec.steps[sc.spec.steps.length - 1];
  seAddAssert(last.id);
  _seSelectedStep = last.id;
  seRenderPropInspector(last.id);
}

function seAddAssertFromInspector(stepId) {
  var checkEl = document.getElementById('pi-check-' + stepId);
  var opEl    = document.getElementById('pi-op-'    + stepId);
  var valEl   = document.getElementById('pi-val-'   + stepId);
  var check   = checkEl ? checkEl.value : 'step[1].state';
  var op      = opEl    ? opEl.value    : 'eq';
  var val     = valEl   ? valEl.value   : '';

  var stp = seGetStep(stepId);
  if (!stp) return;
  stp.asserts = stp.asserts || [];

  var assertObj = { check: check };
  // Map op to assertion key
  if (op === 'eq')         assertObj.eq         = seCoerceVal(val);
  else if (op === 'not_eq') assertObj.not_eq     = seCoerceVal(val);
  else if (op === 'gte')    assertObj.gte        = Number(val);
  else if (op === 'lte')    assertObj.lte        = Number(val);
  else if (op === 'contains') assertObj.contains = val;
  else if (op === 'exists')   assertObj.exists   = true;
  else if (op === 'not_exists') assertObj.not_exists = true;

  stp.asserts.push(assertObj);
  _seDirty = true;
  seRefreshTimeline();
  seRenderPropInspector(stepId);
}

function seDeleteAssert(stepId, idx) {
  var stp = seGetStep(stepId);
  if (!stp || !stp.asserts) return;
  stp.asserts.splice(idx, 1);
  _seDirty = true;
  seRefreshTimeline();
  seRenderPropInspector(stepId);
}

// Coerce string value to appropriate type for assertions
function seCoerceVal(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  var n = Number(v);
  if (!isNaN(n) && v.trim() !== '') return n;
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRIPT CRUD
// ─────────────────────────────────────────────────────────────────────────────
async function seNewScript() {
  if (!_selectedTmpl) { cadToast('Select a template first', 'info'); return; }
  var name = prompt('Script name:');
  if (!name) return;
  try {
    var spec = {
      name: name,
      template_id: _selectedTmpl.id,
      template_version: _selectedTmpl.version || '0.0.0',
      cleanup: 'delete',
      steps: [],
    };
    var rows = await API.post('bist_test_scripts', {
      firm_id:     FIRM_ID_CAD,
      template_id: _selectedTmpl.id,
      name:        name,
      script:      JSON.stringify(spec),
      created_at:  new Date().toISOString(),
    });
    if (rows && rows[0]) {
      var sc = { id: rows[0].id, name: name, spec: spec, _raw: rows[0] };
      _seScripts.push(sc);
      _seSelectedId = sc.id;
      _seSelectedStep = null;
      seRenderEditor();
      cadToast('Script created', 'success');
    }
  } catch(e) {
    cadToast('Create failed: ' + e.message, 'error');
  }
}

function seRenameScript(name) {
  var sc = seCurrentScript();
  if (!sc) return;
  sc.name = name;
  sc.spec.name = name;
  _seDirty = true;
}

async function seDeleteScript() {
  var sc = seCurrentScript();
  if (!sc) return;
  if (!confirm('Delete "' + sc.name + '"? This cannot be undone.')) return;
  try {
    await API.del('bist_test_scripts?id=eq.' + sc.id);
    _seScripts = _seScripts.filter(function(s){ return s.id !== sc.id; });
    _seSelectedId = _seScripts.length ? _seScripts[0].id : null;
    _seSelectedStep = null;
    seRenderEditor();
    cadToast('Script deleted', 'success');
  } catch(e) {
    cadToast('Delete failed: ' + e.message, 'error');
  }
}

async function seSaveScript() {
  var sc = seCurrentScript();
  if (!sc) return;
  // Update name from input
  var inp = document.getElementById('se-title-input');
  if (inp) { sc.name = inp.value; sc.spec.name = inp.value; }
  // Update cleanup
  var cl = document.getElementById('se-cleanup');
  if (cl) sc.spec.cleanup = cl.value;
  try {
    await API.patch('bist_test_scripts?id=eq.' + sc.id, {
      name:   sc.name,
      script: JSON.stringify(sc.spec),
      updated_at: new Date().toISOString(),
    });
    _seDirty = false;
    cadToast('Script saved', 'success');
  } catch(e) {
    cadToast('Save failed: ' + e.message, 'error');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN
// ─────────────────────────────────────────────────────────────────────────────
async function seRunScript() {
  var sc = seCurrentScript();
  if (!sc) return;
  if (_seRunning) { cadToast('Run already in progress', 'info'); return; }

  // Auto-save before running
  await seSaveScript().catch(function(){});

  _seRunning = true;
  var btn = document.getElementById('se-run-btn');
  var badge = document.getElementById('se-status-badge');
  if (btn) btn.textContent = '⏱ Running…';
  if (badge) { badge.textContent = 'RUNNING'; badge.style.color = '#f59e0b'; badge.style.background = 'rgba(245,158,11,.12)'; badge.style.borderColor = 'rgba(245,158,11,.3)'; }

  try {
    var result = await runBistScript(sc.id, function(ev) {
      // Forward progress events to cockpit if open, else just console
      if (ev.type === 'step_pass') {
        console.log('[SE] Pass:', ev.stepId);
      } else if (ev.type === 'step_fail') {
        console.warn('[SE] Fail:', ev.stepId, ev.reason);
      }
    });

    // Reload runs
    _seRecentRuns = await API.get(
      'bist_runs?firm_id=eq.' + FIRM_ID_CAD + '&order=run_at.desc&limit=40'
    ).catch(function(){ return _seRecentRuns; });

    // Refresh UI
    seRefreshTimeline();
    var statsEl = document.getElementById('se-stats');
    if (statsEl) statsEl.innerHTML = seRenderStats();
    var runsEl = document.getElementById('se-recent-runs');
    if (runsEl) runsEl.innerHTML = seRenderRecentRuns();
    var gateEl = document.getElementById('se-gate');
    if (gateEl) gateEl.innerHTML = seRenderGateStatus();

    var passed = result.status === 'passed';
    if (badge) {
      badge.textContent = passed ? 'PASSING' : 'FAILING';
      badge.style.color = passed ? '#4ade80' : '#f87171';
      badge.style.background = passed ? 'rgba(74,222,128,.12)' : 'rgba(248,113,113,.12)';
      badge.style.borderColor = passed ? 'rgba(74,222,128,.33)' : 'rgba(248,113,113,.33)';
    }
    cadToast(passed ? '✓ Script passed' : '✕ Script failed — see diff panel', passed ? 'success' : 'error');

  } catch(e) {
    cadToast('Run error: ' + e.message, 'error');
  } finally {
    _seRunning = false;
    if (btn) btn.textContent = '▶ Run';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTIAL REFRESH — avoids full re-render on minor edits
// ─────────────────────────────────────────────────────────────────────────────
function seRefreshTimeline() {
  var el = document.getElementById('se-timeline');
  if (el) el.innerHTML = seRenderTimeline();
}

function seHydrateCleanup() {
  var sc = seCurrentScript();
  var el = document.getElementById('se-cleanup');
  if (el && sc) el.value = sc.spec.cleanup || 'delete';
}

function seSetCleanup(val) {
  var sc = seCurrentScript();
  if (sc) { sc.spec.cleanup = val; _seDirty = true; }
}

function seHydrateRunMeta() {
  var el = document.getElementById('se-run-meta');
  if (!el) return;
  var sc = seCurrentScript();
  if (!sc) { el.textContent = ''; return; }
  var run = seLatestRun(sc.id);
  if (!run) { el.textContent = 'Never run'; return; }
  var dur = run.duration_ms ? (run.duration_ms / 1000).toFixed(1) + 's' : '—';
  var ts = new Date(run.run_at).toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'});
  el.textContent = 'Last run: ' + ts + ' · ' + dur;
}


// ─────────────────────────────────────────────────────────────────────────────
// FORM STATE HYDRATION
// Real schema:
//   workflow_form_definitions — field metadata per template step
//     columns: id, step_id, firm_id, fields (jsonb array), routing (jsonb)
//     fields[] shape: { id, label, type, role, required, stage, ... }
//     routing shape: { stages: [{ stage, role, parallel_within_stage }] }
//   workflow_form_responses — one row per (instance_id, step_id, stage, field_id)
//     columns: id, instance_id, step_id, form_def_id, stage, field_id,
//              value (text), note, filled_by, filled_at
//     unique constraint: (instance_id, step_id, stage, field_id) — use upsert
//
// Augments state.steps[N].form so assertions like:
//   step[N].form.fields.risk_score  → field value (text)
//   step[N].form.required_fields_complete → bool
//   step[N].form.sections_complete  → int
//   step[N].form.sections.stage_1.state → 'complete'|'pending'
// ─────────────────────────────────────────────────────────────────────────────

async function _seHydrateFormState(state, instId, tmplSteps) {
  if (!instId || !tmplSteps || !tmplSteps.length) return state;
  try {
    // Single query — all form responses for this instance
    var responses = await API.get(
      'workflow_form_responses?instance_id=eq.' + instId +
      '&order=stage.asc,filled_at.asc'
    ).catch(function(){ return []; });

    if (!responses || !responses.length) return state;

    // Group by step_id
    var byStep = {};
    responses.forEach(function(r) {
      if (!byStep[r.step_id]) byStep[r.step_id] = [];
      byStep[r.step_id].push(r);
    });

    tmplSteps.forEach(function(tmplStep) {
      var stepResponses = byStep[tmplStep.id];
      if (!stepResponses || !stepResponses.length) return;

      var seq = tmplStep.sequence_order;
      if (!state.steps[seq]) return;

      // Build field values map — latest value per field_id (highest stage wins)
      var fields = {};
      var stagesWithResponses = new Set();
      var stagesWithValues = new Set();

      stepResponses.forEach(function(r) {
        // Always overwrite so higher-stage response wins for same field
        if (r.value !== null && r.value !== '') fields[r.field_id] = r.value;
        stagesWithResponses.add(r.stage);
        if (r.value !== null && r.value !== '') stagesWithValues.add(r.stage);
      });

      // Pull cached form definition to determine required fields and stage config
      var defKey = 'def_' + tmplStep.id;
      var formDef = _seFormFieldCache[defKey];
      var defFields = formDef ? (formDef.fields || []) : [];
      var routingStages = formDef ? ((formDef.routing || {}).stages || []) : [];

      // Required fields check
      var requiredIds = defFields.filter(function(f){ return f.required; }).map(function(f){ return f.id; });
      var requiredFieldsComplete = requiredIds.length === 0 ||
        requiredIds.every(function(fid){ return fields[fid] !== undefined && fields[fid] !== ''; });

      // Build sections map keyed by 'stage_N'
      var sectionStates = {};
      routingStages.forEach(function(rs) {
        var n = rs.stage;
        var stageResps = stepResponses.filter(function(r){ return r.stage === n; });
        var stageFields = {};
        stageResps.forEach(function(r){ stageFields[r.field_id] = r.value; });
        sectionStates['stage_' + n] = {
          section_id:   'stage_' + n,
          role:         rs.role || '',
          state:        stageResps.length > 0 ? 'complete' : 'pending',
          completed_by: stageResps.length > 0 ? (stageResps[0].filled_by || '') : null,
          field_values: stageFields,
        };
      });

      state.steps[seq].form = {
        fields:                   fields,
        sections_complete:        stagesWithValues.size,
        sections_total:           routingStages.length || stagesWithResponses.size || 1,
        route_count:              stagesWithResponses.size,
        required_fields_complete: requiredFieldsComplete,
        sections:                 sectionStates,
      };

      console.log('[SE:hydrate] seq', seq, '| fields:', Object.keys(fields).length,
        '| stages_complete:', stagesWithValues.size, '| required_ok:', requiredFieldsComplete);
    });

  } catch(e) {
    console.warn('[SE] _seHydrateFormState failed (non-fatal):', e.message);
  }
  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM FIELD CACHING
// Queries workflow_form_definitions keyed by step_id (not form/template id).
// Caches under 'def_{stepId}' for use by _seHydrateFormState and the assertion
// builder. Call seLoadFormDefForStep(stepId) before rendering assertion paths.
// ─────────────────────────────────────────────────────────────────────────────
async function seLoadFormDefForStep(stepId) {
  var key = 'def_' + stepId;
  if (!stepId || _seFormFieldCache[key]) return;
  try {
    var rows = await API.get(
      'workflow_form_definitions?step_id=eq.' + stepId +
      '&select=id,fields,routing&limit=1'
    ).catch(function(){ return []; });
    if (rows && rows[0]) {
      _seFormFieldCache[key] = {
        id:      rows[0].id,
        fields:  (rows[0].fields || []).map(function(f) {
          return {
            id:       f.id,
            label:    f.label || f.id,
            type:     f.type || 'text',
            role:     f.role || '',
            required: !!f.required,
            stage:    f.stage || 1,
          };
        }),
        routing: rows[0].routing || {},
      };
      console.log('[SE:formcache] step', stepId, '| fields:',
        _seFormFieldCache[key].fields.length, '| routing stages:',
        ((_seFormFieldCache[key].routing || {}).stages || []).length);
    }
  } catch(e) {
    console.warn('[SE] seLoadFormDefForStep failed for', stepId, ':', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE_STEP HOOK — writes workflow_form_responses when form_data present
// Called by cdn-bist.js after step_completed CoC write:
//   if (stp.params?.form_data && typeof window._seOnCompleteStep === 'function')
//     await window._seOnCompleteStep(stp, instId, stepBySeq)
//
// Maps form_data fields to individual workflow_form_responses rows.
// Uses the unique constraint: (instance_id, step_id, stage, field_id).
// PostgREST upsert: POST with Prefer: resolution=merge-duplicates header
// handled transparently via API.post on the unique conflict columns.
// ─────────────────────────────────────────────────────────────────────────────
window._seOnCompleteStep = async function(stp, instId, stepBySeq) {
  var fd = stp.params && stp.params.form_data;
  if (!fd || !instId) return;

  var seq  = stp.params && stp.params.step_seq;
  var step = seq ? stepBySeq[seq] : null;
  if (!step) {
    console.warn('[SE:complete_step] no template step at seq', seq, '— skipping form write');
    return;
  }

  // Ensure form def is cached so we know field types and stages
  await seLoadFormDefForStep(step.id);
  var defKey = 'def_' + step.id;
  var formDef = _seFormFieldCache[defKey];

  // Look up form_def_id (needed as FK in workflow_form_responses)
  var formDefId = formDef ? formDef.id : null;
  if (!formDefId) {
    console.warn('[SE:complete_step] no workflow_form_definitions row for step',
      step.id, '— form_data fields will not be written');
    return;
  }

  // Resolve which stage each field belongs to from the form definition
  var defFields = (formDef && formDef.fields) || [];
  var fieldStageMap = {};
  defFields.forEach(function(f){ fieldStageMap[f.id] = f.stage || 1; });

  // Build one workflow_form_responses row per field in form_data
  // Use the actor slug to find a resource id if possible
  var actorSlug = stp.params.actor || '';
  var resource = (window._resources_cad || []).find(function(r) {
    return (r.name || '').toLowerCase().replace(/\s+/g, '_') === actorSlug;
  });
  var filledBy = resource ? resource.id : null;

  var fieldKeys = Object.keys(fd);
  var writes = fieldKeys.map(function(fieldId) {
    var stage = fieldStageMap[fieldId] || 1;
    return API.post('workflow_form_responses', {
      instance_id:  instId,
      step_id:      step.id,
      form_def_id:  formDefId,
      stage:        stage,
      field_id:     fieldId,
      value:        String(fd[fieldId] !== null && fd[fieldId] !== undefined ? fd[fieldId] : ''),
      filled_by:    filledBy,
      filled_at:    new Date().toISOString(),
    }).catch(function(e) {
      // Unique constraint violation = already exists → attempt update via patch
      // PostgREST: PATCH with filter on all four unique cols
      return API.patch(
        'workflow_form_responses?instance_id=eq.' + instId +
        '&step_id=eq.' + step.id +
        '&stage=eq.' + stage +
        '&field_id=eq.' + encodeURIComponent(fieldId),
        { value: String(fd[fieldId] !== null ? fd[fieldId] : ''), filled_at: new Date().toISOString() }
      ).catch(function(e2) {
        console.warn('[SE] form_responses upsert failed for field', fieldId, ':', e2.message);
      });
    });
  });

  await Promise.all(writes);
  console.log('[SE:complete_step] wrote', fieldKeys.length, 'form_response rows for step',
    step.id, '| formDefId:', formDefId);
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE_FORM_SECTION HOOK — writes section responses to workflow_form_responses
// Called by cdn-bist.js for the complete_form_section action type:
//   if (typeof window._seOnFormSection === 'function')
//     await window._seOnFormSection(stp, instId, stepBySeq)
//
// Writes a section_completed sub-event to the CoC, then writes individual
// workflow_form_responses rows for the section's field_data.
// ─────────────────────────────────────────────────────────────────────────────
window._seOnFormSection = async function(stp, instId, stepBySeq) {
  var seq  = stp.params && stp.params.step_seq;
  var step = seq ? stepBySeq[seq] : null;
  if (!step || !instId) return;

  var sectionId = (stp.params && stp.params.section_id) || 'default';
  var actor     = (stp.params && stp.params.actor) || 'system';
  var fd        = (stp.params && stp.params.field_data) || {};

  try {
    // Write section_completed CoC sub-event
    await API.post('workflow_step_instances', {
      instance_id:      instId,
      firm_id:          FIRM_ID_CAD,
      event_type:       'section_completed',
      template_step_id: step.id,
      step_type:        step.step_type || 'form',
      step_name:        step.name,
      event_notes:      'Section: ' + sectionId,
      actor_name:       actor,
      created_at:       new Date().toISOString(),
    });
    console.log('[SE:form_section] CoC event written for section', sectionId, 'step', step.id);

    // Only write form_responses if field_data was provided
    var fdKeys = Object.keys(fd);
    if (!fdKeys.length) return;

    // Ensure form def is cached
    await seLoadFormDefForStep(step.id);
    var defKey = 'def_' + step.id;
    var formDef = _seFormFieldCache[defKey];
    var formDefId = formDef ? formDef.id : null;

    if (!formDefId) {
      console.warn('[SE:form_section] no form_def found for step', step.id, '— skipping field writes');
      return;
    }

    // Resolve stage number from section_id — section_id convention is 'stage_N'
    // or a role name. Fall back to stage 1.
    var stage = 1;
    var stageMatch = String(sectionId).match(/(\d+)$/);
    if (stageMatch) {
      stage = parseInt(stageMatch[1], 10);
    } else {
      // Try matching section_id to a routing stage by role name
      var routingStages = ((formDef.routing || {}).stages || []);
      var rs = routingStages.find(function(s){ return s.role === sectionId; });
      if (rs) stage = rs.stage;
    }

    var resource = (window._resources_cad || []).find(function(r) {
      return (r.name || '').toLowerCase().replace(/\s+/g, '_') === actor;
    });
    var filledBy = resource ? resource.id : null;

    var writes = fdKeys.map(function(fieldId) {
      return API.post('workflow_form_responses', {
        instance_id:  instId,
        step_id:      step.id,
        form_def_id:  formDefId,
        stage:        stage,
        field_id:     fieldId,
        value:        String(fd[fieldId] !== null && fd[fieldId] !== undefined ? fd[fieldId] : ''),
        filled_by:    filledBy,
        filled_at:    new Date().toISOString(),
      }).catch(function(e) {
        return API.patch(
          'workflow_form_responses?instance_id=eq.' + instId +
          '&step_id=eq.' + step.id +
          '&stage=eq.' + stage +
          '&field_id=eq.' + encodeURIComponent(fieldId),
          { value: String(fd[fieldId] !== null ? fd[fieldId] : ''), filled_at: new Date().toISOString() }
        ).catch(function(e2) {
          console.warn('[SE:form_section] upsert failed for field', fieldId, ':', e2.message);
        });
      });
    });

    await Promise.all(writes);
    console.log('[SE:form_section] wrote', fdKeys.length, 'response rows | stage:', stage,
      '| section:', sectionId);

  } catch(e) {
    console.warn('[SE] _seOnFormSection failed (non-fatal):', e.message);
  }
};

// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function seCurrentScript() {
  return _seScripts.find(function(s){ return s.id === _seSelectedId; }) || null;
}
function seGetStep(stepId) {
  var sc = seCurrentScript();
  if (!sc) return null;
  return (sc.spec.steps || []).find(function(s){ return s.id === stepId; }) || null;
}
function seGetTmplStep(seq) {
  var tmpl = _selectedTmpl;
  if (!tmpl || !tmpl.steps) return null;
  return tmpl.steps.find(function(s){ return s.sequence_order === Number(seq); }) || null;
}
function seLatestRun(scriptId) {
  return _seRecentRuns.find(function(r){ return r.script_id === scriptId; }) || null;
}
function seRunStatus(run) {
  if (!run) return 'none';
  return run.status === 'passed' ? 'pass' : run.status === 'failed' ? 'fail' : 'none';
}
function seDefaultActor() {
  // Use current user resource slug if available
  if (window._resources_cad && window._resources_cad.length) {
    var r = window._resources_cad[0];
    return (r.name || 'team_member').toLowerCase().replace(/\s+/g, '_');
  }
  return 'team_member';
}
function seDefaultOutcome(stepType) {
  var map = { approval:'approved', signoff:'signed', meeting:'complete', form:'submitted', collaborative_form:'submitted', action:'done' };
  return map[stepType] || 'submitted';
}
function seOutcomeOptions(stepType, current) {
  var map = {
    approval: ['approved','rejected','changes_requested'],
    signoff:  ['signed','declined'],
    meeting:  ['complete','design_change'],
    form:     ['submitted','saved_incomplete'],
    collaborative_form: ['submitted','saved_incomplete'],
    action:   ['done','skipped'],
    external: ['submitted','saved_incomplete'],
  };
  var opts = (map[stepType] || ['submitted','done','rejected']).map(function(o) {
    return '<option value="' + escAttr(o) + '"' + (o === current ? ' selected' : '') + '>' + escHtml(o) + '</option>';
  }).join('');
  // Also allow custom current value not in list
  if (current && (map[stepType] || []).indexOf(current) < 0) {
    opts = '<option value="' + escAttr(current) + '" selected>' + escHtml(current) + '</option>' + opts;
  }
  return opts;
}
function seActorOptions(current) {
  var resources = (window._resources_cad || []).filter(function(r){ return !r.is_external; });
  var slugs = resources.map(function(r){
    return (r.name || 'team_member').toLowerCase().replace(/\s+/g, '_');
  });
  if (!slugs.length) slugs = ['vaughn_staples','chris_staples','carlos_reyes','system'];
  return slugs.map(function(s) {
    return '<option value="' + escAttr(s) + '"' + (s === current ? ' selected' : '') + '>' + escHtml(s) + '</option>';
  }).join('');
}
function seStepTitle(stp, tmplSteps) {
  if (stp.action === 'launch_instance') return 'Instance launched';
  if (stp.action === 'wait') return 'Wait ' + ((stp.params && stp.params.ms) || 500) + 'ms';
  if (stp.action === 'assert_only') return 'Assert only';
  if (stp.action === 'complete_form_section') {
    var seq2 = stp.params ? stp.params.step_seq : null;
    var ts2 = seq2 ? tmplSteps.find(function(s){ return s.sequence_order === Number(seq2); }) : null;
    return '◧ Section: ' + ((stp.params && stp.params.section_id) || '?') + (ts2 ? ' (' + ts2.name + ')' : '');
  }
  var seq = stp.params ? stp.params.step_seq : null;
  var ts = seq ? tmplSteps.find(function(s){ return s.sequence_order === Number(seq); }) : null;
  return ts ? (seq + '. ' + ts.name) : ('seq ' + (seq || '?'));
}
function seActionTag(action) {
  var map = {
    launch_instance: ['▶ launch', 'rgba(127,119,221,.2)', '#7F77DD'],
    complete_step:   ['✓ complete', 'rgba(96,165,250,.15)', '#60a5fa'],
    complete_form_section: ['◧ fill section', 'rgba(176,112,224,.18)', '#b070e0'],
    assert_only:     ['≡ assert', 'rgba(245,158,11,.15)', '#f59e0b'],
    wait:            ['⏱ wait', 'rgba(107,114,128,.2)', '#9ca3af'],
  };
  var m = map[action] || [action, 'rgba(255,255,255,.08)', 'var(--muted)'];
  return '<span style="font-size:8px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;' +
    'padding:2px 5px;border-radius:3px;font-family:var(--font-mono);' +
    'background:' + m[1] + ';color:' + m[2] + '">' + m[0] + '</span>';
}
function seOutcomeChip(outcome) {
  var map = {
    approved: ['rgba(74,222,128,.15)','#4ade80','rgba(74,222,128,.3)'],
    submitted: ['rgba(96,165,250,.15)','#60a5fa','rgba(96,165,250,.3)'],
    rejected: ['rgba(248,113,113,.15)','#f87171','rgba(248,113,113,.3)'],
    declined: ['rgba(245,158,11,.15)','#f59e0b','rgba(245,158,11,.3)'],
    signed:   ['rgba(74,222,128,.15)','#4ade80','rgba(74,222,128,.3)'],
    complete: ['rgba(74,222,128,.12)','#4ade80','rgba(74,222,128,.25)'],
  };
  var m = map[outcome] || ['rgba(255,255,255,.08)','var(--muted)','rgba(255,255,255,.15)'];
  return '<span style="display:inline-flex;align-items:center;padding:2px 7px;border-radius:10px;' +
    'font-size:8px;font-weight:700;font-family:var(--font-mono);' +
    'background:' + m[0] + ';color:' + m[1] + ';border:1px solid ' + m[2] + '">' + escHtml(outcome) + '</span>';
}
function seStepTypeColor(type) {
  var map = { approval:'#3d9970', form:'#b070e0', collaborative_form:'#b070e0',
    signoff:'#c47d18', meeting:'#60a5fa', action:'rgba(255,255,255,.4)', external:'#c9a84c' };
  return map[type] || 'var(--muted)';
}
function seFieldRow(label, val, inline) {
  return '<span style="font-size:9px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;' +
    (inline ? 'flex-shrink:0;' : 'display:block;margin-bottom:2px') + '">' + escHtml(label) + '</span>' +
    '<span style="font-size:9px;color:var(--text2);font-family:var(--font-mono);' +
    (inline ? 'flex-shrink:0' : '') + '">' + escHtml(String(val)) + '</span>';
}

// escAttr — escape for HTML attribute values (reuse escHtml or define minimal version)
function escAttr(s) {
  if (!s) return '';
  return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION WITH EXISTING Tests PANEL
// The existing loadTmplTests / renderTmplTests in cdn-bist.js renders a read-only
// view. We upgrade it: when the Tests panel opens for a template, call seOpenEditor.
// We wrap toggleTmplTests so seOpenEditor fires on open.
// ─────────────────────────────────────────────────────────────────────────────
(function _installSeHook() {
  var _deadline = Date.now() + 8000;
  function _tryHook() {
    if (typeof loadTmplTests !== 'function') {
      if (Date.now() < _deadline) setTimeout(_tryHook, 150);
      return;
    }
    // Override loadTmplTests to use the visual editor
    var _origLoad = window.loadTmplTests;
    window.loadTmplTests = function(templateId) {
      // If the tests body exists, route to SE editor
      var bodyEl = document.getElementById('tmpl-tests-body');
      if (bodyEl) {
        return seOpenEditor(templateId);
      }
      return _origLoad.apply(this, arguments);
    };
    console.log('[cdn-script-editor] loadTmplTests hooked — visual editor active');
  }
  _tryHook();
})();

// ─────────────────────────────────────────────────────────────────────────────
// KEYBOARD SHORTCUT: Cmd/Ctrl+S saves current script
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    var panel = document.getElementById('tmpl-tests-panel');
    if (panel && panel.classList.contains('open') && _seSelectedId) {
      e.preventDefault();
      seSaveScript();
    }
  }
});

// Orange console badge — Iron Rule
console.log('%c[cdn-script-editor] v20260404-SE1 loaded — form-aware BIST editor active',
  'background:#c47d18;color:#000;font-weight:700;padding:2px 10px;border-radius:3px');