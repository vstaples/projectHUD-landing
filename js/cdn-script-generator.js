// ══════════════════════════════════════════════════════════════════════════════
// cdn-script-generator.js  ·  v20260406-SG1
// CadenceHUD — Auto-generate BIST test scripts from template DAG
//
// Entry point: _sgGenerateScripts(templateId)
//   - Loads template steps + outcomes
//   - Enumerates all unique routing paths through the DAG
//   - Generates one bist_test_scripts row per unique path
//   - Skips paths already covered by existing scripts (by path signature)
//   - Returns { created, skipped, paths }
//
// Depends on: api.js, FIRM_ID_CAD, CURRENT_USER, _selectedTmpl
// ══════════════════════════════════════════════════════════════════════════════

console.log('%c[cdn-script-generator] v20260406-SG1 — DAG path enumerator','background:#1a3a6a;color:#a0c8f8;font-weight:700;padding:2px 8px;border-radius:3px');

// ── Resolve actor key → resource name (mirrors cdn-bist.js _bistResolveActor) ─
function _sgResolveActor(actorKey) {
  if (!actorKey || actorKey === 'actor_1') return { key:'actor_1', userName:'Chris Staples' };
  if (actorKey === 'actor_2') return { key:'actor_2', userName:'Vaughn Staples' };
  if (actorKey === 'actor_3') return { key:'actor_3', userName:'Carlos Reyes' };
  return { key: actorKey, userName: actorKey };
}

// ── Determine which actor owns a given step type ──────────────────────────────
function _sgActorForStep(step) {
  var t = (step.step_type || '').toLowerCase();
  if (t === 'approval' || t === 'signoff') return 'actor_2';
  if (t === 'meeting')  return 'actor_2';
  return 'actor_1';
}

// ── Build a path signature for dedup ─────────────────────────────────────────
// Format: "1:submitted|2:submitted|3:rejected|1:submitted|2:submitted|3:approved"
function _sgPathSig(path) {
  return path.map(function(n){ return n.seq+':'+n.outcome; }).join('|');
}

// ── Enumerate all unique paths through the DAG ────────────────────────────────
// Uses DFS with a visit cap to prevent infinite loops on rejection cycles.
function _sgEnumeratePaths(steps) {
  // Build step map by sequence_order
  var bySeq = {};
  steps.forEach(function(s){ bySeq[s.sequence_order] = s; });

  // Find first non-trigger step
  var ordered = steps.slice().sort(function(a,b){ return a.sequence_order - b.sequence_order; });
  var actionSteps = ordered.filter(function(s){ return s.step_type !== 'trigger'; });
  if (!actionSteps.length) return [];

  var firstSeq = actionSteps[0].sequence_order;
  var maxSeq   = actionSteps[actionSteps.length-1].sequence_order;
  var maxVisits = 2; // allow each step to be visited at most 2 times per path (one loop)
  var maxPathLen = actionSteps.length * (maxVisits + 1) + 2;

  var completedPaths = [];

  // node = { seq, outcome }
  // stack frame = { seq, visitCounts, path }
  function dfs(seq, visitCounts, path) {
    if (path.length > maxPathLen) return; // guard against runaway
    var step = bySeq[seq];
    if (!step) return;

    var visits = visitCounts[seq] || 0;
    if (visits >= maxVisits) return; // visit cap

    var newCounts = Object.assign({}, visitCounts);
    newCounts[seq] = visits + 1;

    var outcomes = (step.outcomes || []);
    // If no outcomes defined — treat as single forward advance (no outcome label)
    if (!outcomes.length) {
      var nextSeq = seq + 1;
      var node = { seq: seq, outcome: 'completed' };
      var newPath = path.concat([node]);
      if (bySeq[nextSeq]) {
        dfs(nextSeq, newCounts, newPath);
      } else {
        completedPaths.push(newPath); // end of workflow
      }
      return;
    }

    outcomes.forEach(function(oc) {
      var node = { seq: seq, outcome: oc.id || oc.label || 'completed', label: oc.label, requiresReset: !!oc.requiresReset };
      var newPath = path.concat([node]);

      // Determine next step
      var nextSeq;
      if (oc.requiresReset && step.reject_to) {
        // Explicit reject_to — find that step's seq
        var targetStep = steps.find(function(s){ return s.id === step.reject_to; });
        nextSeq = targetStep ? targetStep.sequence_order : firstSeq;
      } else if (oc.requiresReset) {
        nextSeq = firstSeq; // implicit reset to start
      } else {
        nextSeq = seq + 1; // forward advance
      }

      if (bySeq[nextSeq] && nextSeq !== seq) {
        dfs(nextSeq, newCounts, newPath);
      } else {
        completedPaths.push(newPath); // end of workflow or self-loop guard
      }
    });
  }

  dfs(firstSeq, {}, []);
  return completedPaths;
}

// ── Convert a path into a bist_test_script spec ───────────────────────────────
function _sgPathToSpec(path, steps, templateId, version, pathName) {
  var bySeq = {};
  steps.forEach(function(s){ bySeq[s.sequence_order] = s; });

  var scriptSteps = [];
  var si = 1;

  // Step 0: launch_instance
  scriptSteps.push({
    id: 's1',
    action: 'launch_instance',
    params: { actor: 'actor_2', title: 'BIST — '+pathName },
    assertions: [
      { check: 'instance.status', op: 'eq', value: 'in_progress' },
      { check: 'step['+path[0].seq+'].state', op: 'eq', value: 'active' }
    ]
  });

  var visitCount = {};
  path.forEach(function(node, i) {
    si++;
    var step = bySeq[node.seq];
    if (!step) return;

    visitCount[node.seq] = (visitCount[node.seq] || 0) + 1;
    var isRepeat = visitCount[node.seq] > 1;

    var actor = _sgActorForStep(step);
    var specStep = {
      id: 's'+si,
      action: 'complete_step',
      params: {
        step_seq: node.seq,
        outcome:  node.outcome !== 'completed' ? node.outcome : undefined,
        actor:    actor,
      },
      assertions: []
    };

    // Remove undefined outcome
    if (specStep.params.outcome === undefined) delete specStep.params.outcome;

    // Assertion: this step is now done
    specStep.assertions.push({ check: 'step['+node.seq+'].state', op: 'eq', value: 'done' });

    // Assertion: outcome
    if (node.outcome && node.outcome !== 'completed') {
      specStep.assertions.push({ check: 'step['+node.seq+'].outcome', op: 'eq', value: node.outcome });
    }

    // Assertion: loops if repeated
    if (isRepeat) {
      specStep.assertions.push({ check: 'step['+node.seq+'].loops', op: 'eq', value: visitCount[node.seq] });
    }

    // Assertion: next step is active (if not last)
    var nextNode = path[i+1];
    if (nextNode) {
      specStep.assertions.push({ check: 'step['+nextNode.seq+'].state', op: 'eq', value: 'active' });
    }

    scriptSteps.push(specStep);
  });

  return {
    steps:    scriptSteps,
    cleanup:  'delete',
    template_id:      templateId,
    template_version: version,
  };
}

// ── Generate a human-readable path name ──────────────────────────────────────
function _sgPathName(path, steps) {
  var bySeq = {};
  steps.forEach(function(s){ bySeq[s.sequence_order] = s; });

  var hasReset   = path.some(function(n){ return n.requiresReset; });
  var resetCount = path.filter(function(n){ return n.requiresReset; }).length;
  var outcomes   = path.map(function(n){ return n.outcome; }).filter(function(o){ return o && o !== 'completed'; });
  var lastOutcome= outcomes[outcomes.length-1] || 'completed';
  var lastStep   = bySeq[path[path.length-1].seq];

  if (!hasReset) {
    return 'Clean path — '+lastOutcome+(lastStep?' · '+lastStep.name:'');
  }
  return resetCount+' reset'+(resetCount>1?'s':'')+' — '+lastOutcome+(lastStep?' · '+lastStep.name:'');
}

// ── Main entry point ──────────────────────────────────────────────────────────
async function _sgGenerateScripts(templateId) {
  if (!templateId) { cadToast('No template selected', 'error'); return; }
  var tmpl    = (typeof _selectedTmpl !== 'undefined') ? _selectedTmpl : null;
  var version = tmpl && tmpl.version ? tmpl.version : '0.0.0';
  var firmId  = (typeof FIRM_ID_CAD !== 'undefined') ? FIRM_ID_CAD : null;
  if (!firmId) { cadToast('Firm not loaded', 'error'); return; }

  cadToast('Analyzing template DAG...', 'info');

  // Load template steps with outcomes
  var steps = await API.get(
    'workflow_template_steps?template_id=eq.'+templateId+'&order=sequence_order.asc'
  ).catch(function(){ return []; });

  if (!steps || !steps.length) {
    cadToast('No template steps found', 'error');
    return { created:0, skipped:0, paths:[] };
  }

  // Load existing scripts (for dedup by path signature)
  var existing = await API.get(
    'bist_test_scripts?firm_id=eq.'+firmId+'&template_id=eq.'+templateId
  ).catch(function(){ return []; });

  // Build set of existing path signatures
  var existingSigs = {};
  (existing||[]).forEach(function(s) {
    var spec = null;
    try { spec = typeof s.script === 'string' ? JSON.parse(s.script) : s.script; } catch(e){}
    if (spec && spec._path_sig) existingSigs[spec._path_sig] = true;
  });

  // Enumerate paths
  var paths = _sgEnumeratePaths(steps);
  console.log('[SG] Enumerated', paths.length, 'unique paths');

  var created = 0, skipped = 0;
  var actorName = (window.CURRENT_USER && window.CURRENT_USER.name) || 'System';
  var actorId   = (window.CURRENT_USER && window.CURRENT_USER.resource_id) || null;

  for (var i = 0; i < paths.length; i++) {
    var path = paths[i];
    var sig  = _sgPathSig(path);

    if (existingSigs[sig]) { skipped++; continue; }

    var name = _sgPathName(path, steps);
    var spec = _sgPathToSpec(path, steps, templateId, version, name);
    spec._path_sig = sig; // store sig for future dedup

    await API.post('bist_test_scripts', {
      firm_id:          firmId,
      template_id:      templateId,
      template_version: version,
      name:             name,
      script:           JSON.stringify(spec),
      created_by:       actorId,
    }).catch(function(e){ console.warn('[SG] Script write failed:', e); });

    created++;
    existingSigs[sig] = true;
  }

  var msg = created
    ? created+' script'+(created>1?'s':'')+' generated'+(skipped?' · '+skipped+' already existed':'')
    : 'All paths already covered — '+skipped+' script'+(skipped>1?'s':'')+' exist';
  cadToast(msg, created ? 'info' : 'success');
  console.log('%c[SG] Done — created:'+created+' skipped:'+skipped, 'background:#1a3a6a;color:#a0c8f8;padding:2px 8px;border-radius:3px');

  // Refresh script list if visible
  if (typeof loadTmplTests === 'function') loadTmplTests();

  return { created, skipped, paths };
}

// Expose globally
window._sgGenerateScripts = _sgGenerateScripts;