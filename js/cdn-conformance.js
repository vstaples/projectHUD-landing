// ══════════════════════════════════════════════════════════════════════════════
// cdn-conformance.js  ·  v20260406-CF2
// CadenceHUD — Process Conformance Engine (Phase 2)
//
// Changes from Phase 1:
//   - Writes to dedicated conformance_exceptions table (not coc_events)
//   - Dedup by step_event_id across all scans
//   - Severity: critical if template released, warning if draft
//   - Auto-escalates critical open exceptions > 14 days
//   - MRB case creation on escalation
//   - Dashboard reads conformance_exceptions directly
//   - CoC event written per exception for feed visibility
//
// Entry points:
//   _cdnConformanceScan()            — auto-called on load + every 10 min
//   _cdnConformanceRun(firmId)       — full scan, returns {created, escalated}
//   _cdnConformanceCount()           — cached open exception count
//   _cdnConformanceExceptions()      — cached open exceptions array
//   _cdnConformanceResolve(id, note) — mark resolved
//   _cdnConformanceAcknowledge(id)   — mark acknowledged
//
// Depends on: api.js, FIRM_ID_CAD, CURRENT_USER
// ══════════════════════════════════════════════════════════════════════════════

console.log('%c[cdn-conformance] v20260406-CF2 — Phase 2 · dedicated table · severity · escalation','background:#5a1e6a;color:#d4a8f0;font-weight:700;padding:2px 8px;border-radius:3px');

// State
var _cdnConfRunning          = false;
var _cdnConfExceptions       = [];
var _cdnConfInterval         = null;
var _cdnConfEscThresholdDays = 14;

// Auto-scan on load + every 10 minutes
(function _cdnAutoScan() {
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
  setTimeout(_tryStart, 3000);
})();

function _cdnConformanceScan() {
  var fid = (typeof FIRM_ID_CAD !== 'undefined' && FIRM_ID_CAD) ? FIRM_ID_CAD : null;
  if (!fid) return;
  _cdnConformanceRun(fid).catch(function(e){ console.warn('[CDN-CONF] Scan failed:', e); });
}

async function _cdnConformanceRun(firmId) {
  if (_cdnConfRunning) return { created:0, escalated:0 };
  _cdnConfRunning = true;

  try {
    // 1. Valid certs
    var certs = await API.get(
      'bist_certificates?firm_id=eq.'+firmId+'&status=eq.valid&order=issued_at.desc&select=id,template_id,template_version,issued_at'
    ).catch(function(){ return []; });

    if (!certs || !certs.length) {
      await _cdnLoadOpenExceptions(firmId);
      _cdnConfRunning = false;
      return { created:0, escalated:0 };
    }

    var certByTmpl = {};
    certs.forEach(function(c){ if (!certByTmpl[c.template_id]) certByTmpl[c.template_id] = c; });
    var certedTmplIds = Object.keys(certByTmpl);

    // 2. Template metadata (for severity)
    var templates = await API.get(
      'workflow_templates?firm_id=eq.'+firmId+'&id=in.('+certedTmplIds.join(',')+')&select=id,name,status'
    ).catch(function(){ return []; });
    var tmplMeta = {};
    (templates||[]).forEach(function(t){ tmplMeta[t.id] = t; });

    // 3. Build certified outcome map from test scripts
    var scripts = await API.get(
      'bist_test_scripts?firm_id=eq.'+firmId+'&template_id=in.('+certedTmplIds.join(',')+')'
    ).catch(function(){ return []; });

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

    // 4. Recent step completions (14 days)
    var since = new Date(Date.now() - 14*86400*1000).toISOString();
    var stepEvents = await API.get(
      'workflow_step_instances?firm_id=eq.'+firmId+
      '&event_type=eq.step_completed'+
      '&created_at=gte.'+since+
      '&order=created_at.desc&limit=500'+
      '&select=id,instance_id,template_step_id,step_name,outcome,created_at,actor_name'
    ).catch(function(){ return []; });

    if (!stepEvents || !stepEvents.length) {
      await _cdnLoadOpenExceptions(firmId);
      _cdnConfRunning = false;
      return { created:0, escalated:0 };
    }

    // 5. Template step metadata
    var stepIds = []; var seenIds = {};
    (stepEvents||[]).forEach(function(e){ if (e.template_step_id && !seenIds[e.template_step_id]){ stepIds.push(e.template_step_id); seenIds[e.template_step_id]=true; } });
    var tmplStepsArr = stepIds.length ? await API.get(
      'workflow_template_steps?id=in.('+stepIds.join(',')+')&select=id,template_id,sequence_order,name'
    ).catch(function(){ return []; }) : [];
    var stepMeta = {};
    (tmplStepsArr||[]).forEach(function(s){ stepMeta[s.id] = s; });

    // 6. Instance metadata
    var instIds = []; var seenInst = {};
    (stepEvents||[]).forEach(function(e){ if (e.instance_id && !seenInst[e.instance_id]){ instIds.push(e.instance_id); seenInst[e.instance_id]=true; } });
    var instances = instIds.length ? await API.get(
      'workflow_instances?id=in.('+instIds.join(',')+')&select=id,template_id,status'
    ).catch(function(){ return []; }) : [];
    var instMeta = {};
    (instances||[]).forEach(function(i){ instMeta[i.id] = i; });

    // 7. Existing exceptions — dedup by step_event_id
    var existingRows = await API.get(
      'conformance_exceptions?firm_id=eq.'+firmId+'&created_at=gte.'+since+'&select=id,step_event_id'
    ).catch(function(){ return []; });
    var existingKeys = {};
    (existingRows||[]).forEach(function(r){ if (r.step_event_id) existingKeys[r.step_event_id] = true; });

    // 8. Detect and write new exceptions
    var actorName = (window.CURRENT_USER && window.CURRENT_USER.name) || 'System';
    var actorId   = (window.CURRENT_USER && window.CURRENT_USER.resource_id) || null;
    var created = 0;

    for (var i = 0; i < stepEvents.length; i++) {
      var ev   = stepEvents[i];
      var inst = instMeta[ev.instance_id];
      if (!inst) continue;
      var tmplId = inst.template_id;
      if (!certByTmpl[tmplId]) continue;
      var meta = stepMeta[ev.template_step_id];
      if (!meta) continue;
      var seq     = String(meta.sequence_order);
      var outcome = ev.outcome || null;
      if (!outcome) continue;
      var certedForSeq = certifiedOutcomes[tmplId] && certifiedOutcomes[tmplId][seq];
      if (!certedForSeq) continue;
      if (certedForSeq['__any__'] || certedForSeq[outcome]) continue;
      if (existingKeys[ev.id]) continue;

      var tmpl     = tmplMeta[tmplId] || {};
      var severity = (tmpl.status === 'released') ? 'critical' : 'warning';

      await API.post('conformance_exceptions', {
        firm_id:       firmId,
        template_id:   tmplId,
        instance_id:   ev.instance_id,
        step_event_id: ev.id,
        step_seq:      Number(seq),
        outcome:       outcome,
        actor_name:    ev.actor_name || null,
        cert_id:       certByTmpl[tmplId].id,
        status:        'open',
        severity:      severity,
        occurred_at:   ev.created_at || new Date().toISOString(),
      }).catch(function(e){ console.warn('[CDN-CONF] Write failed:', e); });

      existingKeys[ev.id] = true;
      created++;

      // CoC feed entry
      API.post('coc_events', {
        firm_id:           firmId,
        entity_type:       'workflow_instance',
        entity_id:         ev.instance_id,
        event_type:        'conformance.exception',
        actor_name:        actorName,
        actor_resource_id: actorId,
        metadata: {
          template_name: tmpl.name || '—',
          step_seq:      seq,
          outcome:       outcome,
          severity:      severity,
          description:   'Outcome "'+outcome+'" on step seq '+seq+' not in any certified test script',
        },
        event_class:  'conformance',
        severity:     severity,
        occurred_at:  ev.created_at || new Date().toISOString(),
      }).catch(function(){});
    }

    // 9. Escalate stale critical exceptions
    var escalated = await _cdnEscalateStale(firmId);

    // 10. Refresh cache
    await _cdnLoadOpenExceptions(firmId);

    if (created || escalated) {
      console.warn('%c[cdn-conformance] '+created+' new · '+escalated+' escalated',
        'background:#5a1e6a;color:#f0c0ff;padding:2px 8px;border-radius:3px');
    } else {
      console.log('%c[cdn-conformance] Clean','background:#1a4a2a;color:#3de08a;padding:2px 8px;border-radius:3px');
    }

    _cdnConfRunning = false;
    return { created:created, escalated:escalated };

  } catch(e) {
    console.warn('[CDN-CONF] Run failed:', e);
    _cdnConfRunning = false;
    return { created:0, escalated:0 };
  }
}

// Escalate stale critical open exceptions
async function _cdnEscalateStale(firmId) {
  var threshold = new Date(Date.now() - _cdnConfEscThresholdDays*86400*1000).toISOString();
  var stale = await API.get(
    'conformance_exceptions?firm_id=eq.'+firmId+'&status=eq.open&severity=eq.critical&occurred_at=lte.'+threshold+'&select=id,template_id,instance_id,outcome,step_seq'
  ).catch(function(){ return []; });
  if (!stale || !stale.length) return 0;

  var now       = new Date().toISOString();
  var actorName = (window.CURRENT_USER && window.CURRENT_USER.name) || 'System';
  var actorId   = (window.CURRENT_USER && window.CURRENT_USER.resource_id) || null;

  for (var i = 0; i < stale.length; i++) {
    var exc = stale[i];
    await API.patch('conformance_exceptions?id=eq.'+exc.id, {
      status: 'escalated', escalated_at: now
    }).catch(function(){});

    API.post('mrb_cases', {
      firm_id: firmId, status: 'pending',
      disposition: 'Conformance exception — outcome "'+exc.outcome+'" on step seq '+exc.step_seq+' not certified',
      created_at: now,
    }).catch(function(){});

    API.post('coc_events', {
      firm_id: firmId, entity_type: 'conformance_exception', entity_id: exc.id,
      event_type: 'mrb.escalated', actor_name: actorName, actor_resource_id: actorId,
      metadata: { exception_id: exc.id, template_id: exc.template_id, days_open: _cdnConfEscThresholdDays },
      event_class: 'governance', severity: 'critical', occurred_at: now,
    }).catch(function(){});
  }
  return stale.length;
}

// Load open exceptions into cache
async function _cdnLoadOpenExceptions(firmId) {
  var rows = await API.get(
    'conformance_exceptions?firm_id=eq.'+firmId+
    '&status=in.(open,acknowledged,escalated)'+
    '&order=occurred_at.desc&limit=50'+
    '&select=id,template_id,instance_id,step_seq,outcome,actor_name,severity,status,occurred_at'
  ).catch(function(){ return []; });
  _cdnConfExceptions = rows || [];
}

// Resolution actions
async function _cdnConformanceResolve(exceptionId, note) {
  var now   = new Date().toISOString();
  var actId = (window.CURRENT_USER && window.CURRENT_USER.resource_id) || null;
  await API.patch('conformance_exceptions?id=eq.'+exceptionId, {
    status: 'resolved', resolution_note: note || null, resolved_by: actId, resolved_at: now,
  }).catch(function(e){ console.warn('[CDN-CONF] Resolve failed:', e); });
  _cdnConfExceptions = _cdnConfExceptions.filter(function(e){ return e.id !== exceptionId; });
}

async function _cdnConformanceAcknowledge(exceptionId) {
  await API.patch('conformance_exceptions?id=eq.'+exceptionId, { status: 'acknowledged' })
    .catch(function(e){ console.warn('[CDN-CONF] Acknowledge failed:', e); });
  _cdnConfExceptions = _cdnConfExceptions.map(function(e){
    return e.id === exceptionId ? Object.assign({}, e, {status:'acknowledged'}) : e;
  });
}

// Public accessors
function _cdnConformanceCount()      { return _cdnConfExceptions.length; }
function _cdnConformanceExceptions() { return _cdnConfExceptions.slice(); }

window._cdnConformanceRun         = _cdnConformanceRun;
window._cdnConformanceResolve     = _cdnConformanceResolve;
window._cdnConformanceAcknowledge = _cdnConformanceAcknowledge;
window._cdnConformanceCount       = _cdnConformanceCount;
window._cdnConformanceExceptions  = _cdnConformanceExceptions;