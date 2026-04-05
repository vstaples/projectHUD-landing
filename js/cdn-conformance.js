// ══════════════════════════════════════════════════════════════════════════════
// cdn-conformance.js  ·  v20260406-CF1
// CadenceHUD — Process Conformance Engine (Phase 1)
//
// What it does:
//   Scans live workflow_step_instances against the certified routing paths
//   encoded in bist_test_scripts for each template. When a step completion
//   carries an outcome that was never exercised in any certified test script
//   for that template, it writes a conformance.exception to coc_events.
//
// Depends on: api.js (API.get, API.post), FIRM_ID_CAD, CURRENT_USER
//
// Entry points:
//   _cdnConformanceRun(firmId)  — full scan, returns exception count
//   _cdnConformanceScan()       — called automatically on load + on a timer
// ══════════════════════════════════════════════════════════════════════════════

console.log('%c[cdn-conformance] v20260406-CF1 — Phase 1 conformance engine','background:#5a1e6a;color:#d4a8f0;font-weight:700;padding:2px 8px;border-radius:3px');

// ── State ─────────────────────────────────────────────────────────────────────
var _cdnConfLastRun    = 0;
var _cdnConfRunning    = false;
var _cdnConfExceptions = [];  // last scan results, readable by dashboard
var _cdnConfInterval   = null;

// ── Auto-scan on load + every 10 minutes ─────────────────────────────────────
(function _cdnAutoScan() {
  // Defer first run until FIRM_ID_CAD is available
  var _tries = 0;
  function _tryStart() {
    var fid = (typeof FIRM_ID_CAD !== 'undefined' && FIRM_ID_CAD) ? FIRM_ID_CAD : null;
    if (fid) {
      _cdnConformanceScan();
      _cdnConfInterval = setInterval(_cdnConformanceScan, 10 * 60 * 1000);
    } else if (_tries++ < 30) {
      setTimeout(_tryStart, 1000);
    }
  }
  setTimeout(_tryStart, 3000); // wait 3s for page bootstrap
})();

// ── Public entry ──────────────────────────────────────────────────────────────
function _cdnConformanceScan() {
  var fid = (typeof FIRM_ID_CAD !== 'undefined' && FIRM_ID_CAD) ? FIRM_ID_CAD : null;
  if (!fid) return;
  _cdnConformanceRun(fid).catch(function(e){ console.warn('[CDN-CONF] Scan failed:', e); });
}

async function _cdnConformanceRun(firmId) {
  if (_cdnConfRunning) return _cdnConfExceptions.length;
  _cdnConfRunning = true;
  _cdnConfLastRun = Date.now();

  try {
    // 1. Load all templates with a valid cert (only certified templates are in scope)
    var certs = await API.get(
      'bist_certificates?firm_id=eq.'+firmId+'&status=eq.valid&order=issued_at.desc&select=id,template_id,template_version,issued_at'
    ).catch(function(){ return []; });

    if (!certs || !certs.length) {
      _cdnConfExceptions = [];
      _cdnConfRunning = false;
      return 0;
    }

    // Dedupe — one cert per template (latest)
    var certByTmpl = {};
    certs.forEach(function(c){ if (!certByTmpl[c.template_id]) certByTmpl[c.template_id] = c; });
    var certedTmplIds = Object.keys(certByTmpl);

    // 2. Load all test scripts for those templates
    var scripts = await API.get(
      'bist_test_scripts?firm_id=eq.'+firmId+'&template_id=in.('+certedTmplIds.join(',')+')'
    ).catch(function(){ return []; });

    // 3. Build certified outcome map: { templateId: { step_seq: Set(outcomes) } }
    var certifiedOutcomes = {};
    (scripts||[]).forEach(function(s) {
      var tmplId = s.template_id;
      if (!certifiedOutcomes[tmplId]) certifiedOutcomes[tmplId] = {};
      var spec = null;
      try { spec = typeof s.script === 'string' ? JSON.parse(s.script) : s.script; } catch(e){ return; }
      if (!spec || !Array.isArray(spec.steps)) return;
      spec.steps.forEach(function(step) {
        if (step.action !== 'complete_step') return;
        var seq     = step.params && step.params.step_seq != null ? String(step.params.step_seq) : null;
        var outcome = step.params && step.params.outcome ? step.params.outcome : '__any__';
        if (!seq) return;
        if (!certifiedOutcomes[tmplId][seq]) certifiedOutcomes[tmplId][seq] = {};
        certifiedOutcomes[tmplId][seq][outcome] = true;
      });
    });

    // 4. Load recent live step completions (last 7 days, active instances only)
    var since = new Date(Date.now() - 7*86400*1000).toISOString();
    var stepEvents = await API.get(
      'workflow_step_instances?firm_id=eq.'+firmId+
      '&event_type=eq.step_completed'+
      '&created_at=gte.'+since+
      '&order=created_at.desc&limit=500'+
      '&select=id,instance_id,template_step_id,step_name,outcome,created_at,actor_name'
    ).catch(function(){ return []; });

    if (!stepEvents || !stepEvents.length) {
      _cdnConfExceptions = [];
      _cdnConfRunning = false;
      return 0;
    }

    // 5. Load template_step → seq mapping for steps that appeared in events
    var stepIds = [...new Set((stepEvents||[]).map(function(e){ return e.template_step_id; }).filter(Boolean))];
    var tmplSteps = stepIds.length ? await API.get(
      'workflow_template_steps?id=in.('+stepIds.join(',')+')'+'&select=id,template_id,sequence_order,name'
    ).catch(function(){ return []; }) : [];
    var stepMeta = {};
    (tmplSteps||[]).forEach(function(s){ stepMeta[s.id] = s; });

    // 6. Load instances to get template_id per instance
    var instanceIds = [...new Set((stepEvents||[]).map(function(e){ return e.instance_id; }).filter(Boolean))];
    var instances = instanceIds.length ? await API.get(
      'workflow_instances?id=in.('+instanceIds.join(',')+')'+'&select=id,template_id,status'
    ).catch(function(){ return []; }) : [];
    var instMeta = {};
    (instances||[]).forEach(function(i){ instMeta[i.id] = i; });

    // 7. Load already-recorded exceptions (to avoid duplicate writes)
    var existingExcs = await API.get(
      'coc_events?firm_id=eq.'+firmId+'&event_type=eq.conformance.exception&created_at=gte.'+since+
      '&select=id,entity_id,metadata'
    ).catch(function(){ return []; });
    var existingKeys = {};
    (existingExcs||[]).forEach(function(e){
      var m = e.metadata || {};
      if (m.step_event_id) existingKeys[m.step_event_id] = true;
    });

    // 8. Detect exceptions
    var newExceptions = [];
    var newCocWrites  = [];

    (stepEvents||[]).forEach(function(ev) {
      var inst   = instMeta[ev.instance_id];
      if (!inst) return;
      var tmplId = inst.template_id;
      if (!certByTmpl[tmplId]) return;  // template not certified — skip
      var meta   = stepMeta[ev.template_step_id];
      if (!meta) return;
      var seq     = String(meta.sequence_order);
      var outcome = ev.outcome || null;
      if (!outcome) return;  // no outcome — skip (can't evaluate)

      var certedForSeq = certifiedOutcomes[tmplId] && certifiedOutcomes[tmplId][seq];
      if (!certedForSeq) return;  // step not in any test script — skip

      // Check: is this outcome certified?
      var isCertified = certedForSeq['__any__'] || certedForSeq[outcome];
      if (isCertified) return;

      // Skip if already written
      if (existingKeys[ev.id]) return;

      var exc = {
        step_event_id:   ev.id,
        instance_id:     ev.instance_id,
        template_id:     tmplId,
        template_name:   meta.name || ev.step_name || 'Unknown step',
        step_seq:        seq,
        outcome:         outcome,
        actor:           ev.actor_name || '—',
        occurred_at:     ev.created_at,
        cert_id:         certByTmpl[tmplId].id,
        severity:        'warning',
      };
      newExceptions.push(exc);

      // Queue CoC write
      newCocWrites.push(exc);
    });

    // 9. Write new exceptions to coc_events
    var actorName = (window.CURRENT_USER && window.CURRENT_USER.name) || 'System';
    var actorId   = (window.CURRENT_USER && window.CURRENT_USER.resource_id) || null;

    for (var i = 0; i < newCocWrites.length; i++) {
      var exc = newCocWrites[i];
      await API.post('coc_events', {
        firm_id:           firmId,
        entity_type:       'workflow_instance',
        entity_id:         exc.instance_id,
        event_type:        'conformance.exception',
        actor_name:        actorName,
        actor_resource_id: actorId,
        metadata: {
          step_event_id:  exc.step_event_id,
          template_id:    exc.template_id,
          template_name:  exc.template_name,
          step_seq:       exc.step_seq,
          outcome:        exc.outcome,
          actor:          exc.actor,
          cert_id:        exc.cert_id,
          description:    'Outcome "'+exc.outcome+'" on step seq '+exc.step_seq+' not exercised in any certified test script',
        },
        event_class:  'conformance',
        severity:     'warning',
        occurred_at:  exc.occurred_at || new Date().toISOString(),
      }).catch(function(e){ console.warn('[CDN-CONF] CoC write failed:', e); });
    }

    // 10. Merge into state (existing + new, last 7d)
    _cdnConfExceptions = newExceptions;

    if (newExceptions.length) {
      console.warn('%c[cdn-conformance] '+newExceptions.length+' new exception(s) detected',
        'background:#5a1e6a;color:#f0c0ff;padding:2px 8px;border-radius:3px');
    } else {
      console.log('%c[cdn-conformance] No new exceptions','background:#1a4a2a;color:#3de08a;padding:2px 8px;border-radius:3px');
    }

    _cdnConfRunning = false;
    return newExceptions.length;

  } catch(e) {
    console.warn('[CDN-CONF] Run failed:', e);
    _cdnConfRunning = false;
    return 0;
  }
}

// ── Dashboard integration ─────────────────────────────────────────────────────
// Returns cached exception count for KPI strip / hot queue use
function _cdnConformanceCount() {
  return _cdnConfExceptions.length;
}

// Returns exceptions array for hot queue rendering
function _cdnConformanceExceptions() {
  return _cdnConfExceptions.slice();
}