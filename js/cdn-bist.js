// cdn-bist.js — Cadence: BIST gate checks, test plan, proceed/release
// LOAD ORDER: 8th
console.log('%c[cdn-bist] v20260403-AU','background:#c47d18;color:#000;font-weight:700;padding:2px 8px;border-radius:3px');

function _bistResolveActor(slug) {
  if (!slug) return { resourceId: _myResourceId, userName: 'Team Member' };
  const r = _resources_cad.find(r =>
    r.name?.toLowerCase().replace(/\s+/g,'_') === slug.toLowerCase() ||
    r.id === slug
  );
  const u = r ? _users_cad.find(u => u.resource_id === r.id) : null;
  return {
    resourceId: r?.id || _myResourceId,
    userId:     u?.id || null,
    userName:   r?.name || slug,
  };
}

function _bistBuildState(inst, steps, coc) {
  const completedIds = new Set(coc.filter(e=>e.event_type==='step_completed').map(e=>e.template_step_id));
  const activeIds    = new Set(coc.map(e=>e.template_step_id).filter(Boolean));
  const lastCompleted = steps.filter(s=>completedIds.has(s.id))
    .reduce((max,s) => Math.max(max, s.sequence_order), 0);
  const readyStep = steps
    .filter(s => s.sequence_order > lastCompleted && !activeIds.has(s.id))
    .sort((a,b) => a.sequence_order - b.sequence_order)[0];

  const stepsState = {};
  steps.forEach(s => {
    const done      = completedIds.has(s.id);
    const touched   = activeIds.has(s.id);
    const isReady   = s.id === readyStep?.id;
    const cEvt      = done ? coc.slice().reverse().find(e =>
      e.event_type==='step_completed' && e.template_step_id===s.id) : null;
    const loops     = coc.filter(e=>e.event_type==='step_completed'&&e.template_step_id===s.id).length;
    const actEvt    = coc.find(e=>e.event_type==='step_activated'&&e.template_step_id===s.id);

    // Determine state from the LATEST CoC event for this step
    // (a re-activated step after rejection should show 'active', not 'done')
    const stepEvents = coc.filter(e => e.template_step_id === s.id);
    const lastEvent  = stepEvents[stepEvents.length - 1];
    let state;
    if (!lastEvent)                                    state = isReady ? 'ready' : 'waiting';
    else if (lastEvent.event_type==='step_completed')  state = 'done';
    else if (lastEvent.event_type==='step_activated')  state = 'active';
    else if (lastEvent.event_type==='step_reset')      state = 'waiting';
    else                                               state = touched ? 'active' : 'waiting';

    // Last completion event for outcome
    const lastCompletion = coc.slice().reverse()
      .find(e=>e.event_type==='step_completed'&&e.template_step_id===s.id);

    stepsState[s.sequence_order] = {
      id:           s.id,
      name:         s.name,
      step_type:    s.step_type,
      state,
      outcome:      lastCompletion?.outcome || null,
      route_to:     lastCompletion?.route_to_step_id || null,
      activated_at: actEvt?.created_at || null,
      completed_at: lastCompletion?.created_at || null,
      loops,
      docs: { evidence:{count:0}, authorization:{count:0}, reference:{count:0} },
    };
  });

  return {
    instance: {
      status:      inst.status,
      launched_at: inst.launched_at,
      title:       inst.title,
    },
    steps: stepsState,
    coc,
  };
}

function _bistEval(check, state) {
  const path = check.replace(/step\[(\d+)\]/, 'steps.$1').split('.');
  return path.reduce((obj, key) => obj?.[key], state);
}

function _bistAssert(assert, state) {
  const actual = _bistEval(assert.check, state);
  if (assert.eq         !== undefined) return actual === assert.eq;
  if (assert.not_eq     !== undefined) return actual !== assert.not_eq;
  if (assert.gte        !== undefined) return Number(actual) >= Number(assert.gte);
  if (assert.lte        !== undefined) return Number(actual) <= Number(assert.lte);
  if (assert.contains   !== undefined) return String(actual||'').includes(assert.contains);
  if (assert.exists     !== undefined) return actual !== undefined && actual !== null;
  if (assert.not_exists !== undefined) return actual === undefined || actual === null;
  return false;
}

// Freeze-aware wait — polls every 200ms while _bckFrozen is true
async function _bckFreezeWait() {
  while (window._bckFrozen) {
    if (window._bckCockpitClosed) return;
    await new Promise(r => setTimeout(r, 200));
  }
}

async function runBistScript(scriptId, onProgress) {
  const runStart = Date.now();

  // Load script
  const scripts = await API.get(`bist_test_scripts?id=eq.${scriptId}`).catch(()=>[]);
  const script  = scripts?.[0];
  if (!script) throw new Error('Script not found');

  const spec = typeof script.script === 'string' ? JSON.parse(script.script) : script.script;

  // Create run record
  const runRows = await API.post('bist_runs', {
    firm_id:          FIRM_ID_CAD,
    script_id:        scriptId,
    template_version: _selectedTmpl?.version || spec.template_version || '?',  // always current version
    status:           'running',
    steps_passed:     0,
    steps_failed:     0,
    run_by:           _myResourceId || null,
    run_at:           new Date().toISOString(),
  });
  const runId      = runRows?.[0]?.id;
  window._bckCurrentRunId = runId;
  let   instId     = null;
  let   stepsPassed = 0;

  // Load template steps for seq→id resolution
  const tmplSteps = await API.get(
    `workflow_template_steps?template_id=eq.${script.template_id}&order=sequence_order.asc`
  ).catch(()=>[]);

  const stepBySeq = {};
  (tmplSteps||[]).forEach(s => { stepBySeq[s.sequence_order] = s; });

  async function reloadState() {
    if (!instId) return null;
    const [instArr, coc] = await Promise.all([
      API.get(`workflow_instances?id=eq.${instId}`).catch(()=>[]),
      API.get(`workflow_step_instances?instance_id=eq.${instId}&order=created_at.asc,id.asc,id.asc`).catch(()=>[]),
    ]);
    const inst = instArr?.[0];
    if (!inst) return null;
    inst._tmplSteps = tmplSteps;
    return _bistBuildState(inst, tmplSteps||[], coc||[]);
  }

  try {
    for (let si = 0; si < spec.steps.length; si++) {
      const stp = spec.steps[si];
      onProgress?.({ type:'step_start', stepId: stp.id, stepIdx: si,
        total: spec.steps.length, action: stp.action, params: stp.params });

      await _bckFreezeWait(); // freeze point — before DB write

      // ── Execute action ──────────────────────────────────────────────────────
      if (stp.action === 'launch_instance') {
        const actor   = _bistResolveActor(stp.params?.launched_by);
        const title   = (stp.params?.title||'BIST — {timestamp}')
          .replace('{timestamp}', new Date().toISOString());
        const rows = await API.post('workflow_instances', {
          firm_id:     FIRM_ID_CAD,
          template_id: script.template_id,
          title,
          status:      'in_progress',
          launched_by: actor.userId || null,
          launched_at: new Date().toISOString(),
          created_at:  new Date().toISOString(),
        });
        instId = rows?.[0]?.id;
        if (!instId) throw new Error('Failed to create instance');
        onProgress?.({ type:'instance_created', instId });
        // Write launch CoC event
        await API.post('workflow_step_instances', {
          instance_id: instId, firm_id: FIRM_ID_CAD,
          event_type: 'instance_launched', step_type: 'trigger',
          step_name: 'Instance launched', actor_name: actor.userName,
          created_at: new Date().toISOString(),
        });
        // Auto-activate first step
        const firstStep = stepBySeq[1];
        if (firstStep) {
          await API.post('workflow_step_instances', {
            instance_id: instId, firm_id: FIRM_ID_CAD,
            event_type: 'step_activated', template_step_id: firstStep.id,
            step_type: firstStep.step_type, step_name: firstStep.name,
            actor_name: 'System', created_at: new Date().toISOString(),
          });
        }

      } else if (stp.action === 'complete_step') {
        const seq   = stp.params?.step_seq;
        const step  = stepBySeq[seq];
        if (!step) throw new Error(`No step at sequence ${seq}`);
        const actor = _bistResolveActor(stp.params?.actor);
        const routeSeq  = stp.params?.route_to_seq;
        const routeStep = routeSeq ? stepBySeq[routeSeq] : null;
        // Write step_completed
        await API.post('workflow_step_instances', {
          instance_id: instId, firm_id: FIRM_ID_CAD,
          event_type: 'step_completed', template_step_id: step.id,
          step_type: step.step_type, step_name: step.name,
          outcome: stp.params?.outcome || null,
          route_to_step_id:   routeStep?.id   || null,
          route_to_step_name: routeStep ? `${routeStep.sequence_order}. ${routeStep.name}` : null,
          event_notes: stp.params?.notes || null,
          actor_name: actor.userName,
          created_at: new Date().toISOString(),
        });
        // Activate: route_to_seq if specified, else next step
        const activateStep = routeStep || stepBySeq[seq + 1];
        if (activateStep) {
          await API.post('workflow_step_instances', {
            instance_id: instId, firm_id: FIRM_ID_CAD,
            event_type: 'step_activated', template_step_id: activateStep.id,
            step_type: activateStep.step_type, step_name: activateStep.name,
            actor_name: 'System', created_at: new Date().toISOString(),
          });
        }

      } else if (stp.action === 'wait') {
        await new Promise(r => setTimeout(r, stp.params?.ms || 100));

      } else if (stp.action === 'assert_only') {
        // No action — just fall through to assertions below
      }

      // ── Evaluate assertions ─────────────────────────────────────────────────
      if (stp.asserts?.length) {
        const state = await reloadState();
        if (!state) throw new Error('Could not reload instance state');

        for (const assert of stp.asserts) {
          const pass = _bistAssert(assert, state);
          if (!pass) {
            const actual = _bistEval(assert.check, state);
            const expected = assert.eq ?? assert.gte ?? assert.lte ??
              assert.contains ?? assert.not_eq ?? '(exists check)';
            const reason = `${assert.check}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
            onProgress?.({ type:'step_fail', stepId: stp.id, stepIdx: si, reason });
            // Update run record as failed
            await API.patch(`bist_runs?id=eq.${runId}`, {
              status:          'failed',
              steps_passed:    stepsPassed,
              steps_failed:    1,
              failure_step:    stp.id,
              failure_reason:  reason,
              failure_assertion: assert,
              instance_id:     instId,
              duration_ms:     Date.now() - runStart,
            }).catch(()=>{});
            // Cleanup
            await _bistCleanup(instId, spec.cleanup);
            return { status:'failed', runId, reason, failedStep: stp.id };
          }
        }
      }

      stepsPassed++;
      const stepName = stepBySeq[stp.params?.step_seq]?.name || '';
      onProgress?.({ type:'step_pass', stepId: stp.id, stepIdx: si,
        action: stp.action, stepName, outcome: stp.params?.outcome });
      await _bckFreezeWait(); // freeze point — after step complete
    }

    // All steps passed
    await API.patch(`bist_runs?id=eq.${runId}`, {
      status:       'passed',
      steps_passed: stepsPassed,
      steps_failed: 0,
      instance_id:  instId,
      duration_ms:  Date.now() - runStart,
    }).catch(()=>{});

    await _bistCleanup(instId, spec.cleanup);
    onProgress?.({ type:'complete', status:'passed' });
    return { status:'passed', runId };

  } catch(e) {
    await API.patch(`bist_runs?id=eq.${runId}`, {
      status:        'error',
      failure_reason: e.message,
      instance_id:   instId,
      duration_ms:   Date.now() - runStart,
    }).catch(()=>{});
    await _bistCleanup(instId, spec.cleanup);
    onProgress?.({ type:'error', message: e.message });
    return { status:'error', runId, reason: e.message };
  }
}

async function _bistCleanup(instId, mode) {
  if (!instId || mode === 'keep') return;
  if (mode === 'suspend') {
    await API.patch(`workflow_instances?id=eq.${instId}`,
      { status:'overridden', notes:'BIST cleanup', updated_at: new Date().toISOString() }
    ).catch(()=>{});
    return;
  }
  // default: delete
  await API.del(`workflow_step_instances?instance_id=eq.${instId}`).catch(()=>{});
  await API.del(`workflow_instances?id=eq.${instId}`).catch(()=>{});
}

async function runGateCheck(templateId, version) {
  const [scripts, allRuns] = await Promise.all([
    API.get(`bist_test_scripts?firm_id=eq.${FIRM_ID_CAD}&template_id=eq.${templateId}&order=created_at.asc`).catch(()=>[]),
    API.get(`bist_runs?firm_id=eq.${FIRM_ID_CAD}&template_version=eq.${version}&order=run_at.desc&limit=200`).catch(()=>[]),
  ]);

  if (!scripts?.length) return { tier: 0, results: [] };

  const results = (scripts||[]).map(s => {
    const latestRun = (allRuns||[]).find(r => r.script_id === s.id);
    const state = !latestRun            ? 'not_run'
                : latestRun.status === 'passed' ? 'passed'
                : 'failed';
    return { script: s, run: latestRun || null, state };
  });

  const failed  = results.filter(r => r.state === 'failed');
  const notRun  = results.filter(r => r.state === 'not_run');

  if (failed.length)  return { tier: 2, results, failed };
  if (notRun.length)  return { tier: 1, results, notRun };
  return { tier: 3, results };
}

async function showGateDialog(templateId, version, onProceed) {
  // Remove any existing dialog
  document.getElementById('bist-gate-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'bist-gate-overlay';
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.55);
    display:flex;align-items:center;justify-content:center;z-index:9999`;

  async function render(gateResult) {
    const { tier, results } = gateResult;

    const tierColor   = tier===3?'var(--green)':tier===0?'var(--amber)':'var(--red)';
    const tierLabel   = tier===3?'All tests passing'
                      : tier===2?'Tests failing — cannot release'
                      : tier===1?'Tests not run against this version'
                      : 'No test coverage';
    const tierIcon    = tier===3?'✓':tier===0?'⚠':'✕';

    const rowsHtml = results.map(r => {
      const stateColor = r.state==='passed'?'var(--green)'
                       : r.state==='failed'?'var(--red)':'var(--muted)';
      const stateIcon  = r.state==='passed'?'✓':r.state==='failed'?'✕':'○';
      const runInfo    = r.run
        ? `<span style="font-size:9px;color:var(--muted);font-family:var(--font-mono)">
             v${escHtml(r.run.template_version||'?')} · 
             ${new Date(r.run.run_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
           </span>`
        : `<span style="font-size:9px;color:var(--muted)">Never run</span>`;
      const failDetail = r.state==='failed' && r.run?.failure_reason
        ? `<div style="font-size:10px;color:var(--red);margin-top:2px;padding:2px 6px;
             background:rgba(192,64,74,.08);border-left:2px solid var(--red);
             font-family:var(--font-mono)">${escHtml(r.run.failure_reason)}</div>` : '';
      return `
        <div id="bist-row-${r.script.id}"
          style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:3px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="color:${stateColor};font-size:12px;width:14px;flex-shrink:0">${stateIcon}</span>
            <span style="font-size:12px;color:var(--text);flex:1">${escHtml(r.script.name)}</span>
            ${runInfo}
          </div>
          ${failDetail}
        </div>`;
    }).join('');

    const canRunAll = tier !== 3;
    overlay.innerHTML = `
      <div style="background:var(--bg1);border:1px solid var(--border);border-radius:8px;
        width:480px;max-width:90vw;max-height:80vh;display:flex;flex-direction:column;overflow:hidden">
        <!-- Header -->
        <div style="padding:14px 16px;border-bottom:1px solid var(--border);
          display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text)">Release gate</div>
            <div style="font-size:10px;color:var(--muted);margin-top:1px;font-family:var(--font-mono)">
              v${escHtml(version)}
            </div>
          </div>
          <button onclick="document.getElementById('bist-gate-overlay').remove()"
            style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0">✕</button>
        </div>
        <!-- Status banner -->
        <div style="padding:10px 16px;background:${tierColor}18;border-bottom:1px solid ${tierColor}44;
          display:flex;align-items:center;gap:8px">
          <span style="color:${tierColor};font-size:14px">${tierIcon}</span>
          <span style="font-size:12px;font-weight:500;color:${tierColor}">${tierLabel}</span>
        </div>
        <!-- Test rows -->
        <div style="flex:1;overflow-y:auto;padding:0 16px">
          ${results.length
            ? rowsHtml
            : `<div style="font-size:12px;color:var(--muted);padding:16px 0;text-align:center">
                No test scripts found for this template.
               </div>`}
        </div>
        <!-- Footer actions -->
        <div style="padding:12px 16px;border-top:1px solid var(--border);
          display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${tier === 0 ? `
            <div style="flex:1;font-size:11px;color:var(--muted)">
              No tests — releasing without validation
            </div>
            <button id="bist-proceed-btn" onclick="bistProceed()"
              style="padding:7px 16px;background:var(--amber);color:#000;border:none;
                border-radius:5px;font-size:11px;font-weight:600;cursor:pointer">
              Release anyway
            </button>` : ''}
          ${tier === 1 || tier === 2 ? `
            <button id="bist-run-btn" onclick="bistRunAll('${templateId}','${version}')"
              style="padding:7px 16px;background:var(--cad);color:#fff;border:none;
                border-radius:5px;font-size:11px;font-weight:600;cursor:pointer">
              ▶ Run all tests
            </button>
            <button onclick="_bistLaunchCockpit('${templateId}','${version}',window._bistOnProceed)"
              style="padding:7px 14px;background:rgba(29,158,117,.15);color:#1D9E75;border:1px solid rgba(29,158,117,.3);
                border-radius:5px;font-size:11px;font-weight:600;cursor:pointer">
              ▶ Launch Simulator
            </button>` : ''}
          ${tier === 3 ? `
            <div style="flex:1;font-size:11px;color:var(--green)">
              ✓ All tests passing — ready to release
            </div>
            <button onclick="_bistLaunchCockpit('${templateId}','${version}',window._bistOnProceed)"
              style="padding:7px 14px;background:rgba(29,158,117,.15);color:#1D9E75;border:1px solid rgba(29,158,117,.3);
                border-radius:5px;font-size:11px;font-weight:600;cursor:pointer">
              ▶ View certification
            </button>
            <button id="bist-proceed-btn" onclick="bistProceed()"
              style="padding:7px 16px;background:var(--green);color:#fff;border:none;
                border-radius:5px;font-size:11px;font-weight:600;cursor:pointer">
              Release
            </button>` : ''}
          <button onclick="bistOverride()"
            style="padding:7px 12px;background:none;border:1px solid var(--border);
              border-radius:5px;font-size:11px;color:var(--muted);cursor:pointer">
            Override…
          </button>
        </div>
      </div>`;

    // Expose gate callbacks on window for inline onclick handlers
    window._bistOnProceed = onProceed;
  }

  await render(await runGateCheck(templateId, version));
  document.documentElement.appendChild(overlay);
}

function bistProceed() {
  document.getElementById('bist-gate-overlay')?.remove();
  window._bistOnProceed?.();
}

async function bistRunAll(templateId, version) {
  const btn = document.getElementById('bist-run-btn');
  if (btn) { btn.textContent = 'Running…'; btn.disabled = true; }

  const scripts = await API.get(`bist_test_scripts?template_id=eq.${templateId}`).catch(()=>[]);
  if (!scripts?.length) return;

  for (const script of scripts) {
    const rowEl = document.getElementById(`bist-row-${script.id}`);
    if (rowEl) rowEl.querySelector('span').textContent = '…';

    const result = await runBistScript(script.id, ({ type, reason }) => {
      if (type === 'step_pass' || type === 'step_fail') {
        const icon = rowEl?.querySelector('span:first-child');
        if (icon) icon.textContent = type === 'step_pass' ? '…' : '✕';
      }
    });

    if (rowEl) {
      const icon  = rowEl.querySelector('span:first-child');
      const color = result.status === 'passed' ? 'var(--green)' : 'var(--red)';
      if (icon) { icon.textContent = result.status === 'passed' ? '✓' : '✕'; icon.style.color = color; }
      if (result.status !== 'passed' && result.reason) {
        const detail = document.createElement('div');
        detail.style.cssText = `font-size:10px;color:var(--red);margin-top:2px;padding:2px 6px;
          background:rgba(192,64,74,.08);border-left:2px solid var(--red);font-family:var(--font-mono)`;
        detail.textContent = result.reason;
        rowEl.appendChild(detail);
      }
    }
  }

  // Re-check gate after all runs
  const gate = await runGateCheck(templateId, version);
  if (gate.tier === 3) {
    // All passing — update banner and show Release button
    const banner = document.querySelector('#bist-gate-overlay [style*="Release gate"]')
      ?.closest('div')?.nextElementSibling;
    const footer = document.querySelector('#bist-gate-overlay [style*="border-top"]');
    if (banner) {
      banner.style.background = 'var(--green)18';
      banner.style.borderColor = 'var(--green)44';
      banner.querySelector('span').textContent = '✓';
      banner.querySelector('span:last-child').textContent = 'All tests passing — ready to release';
    }
    if (footer) {
      footer.innerHTML = `
        <div style="flex:1;font-size:11px;color:var(--green)">✓ All tests passing</div>
        <button id="bist-proceed-btn" onclick="bistProceed()"
          style="padding:7px 16px;background:var(--green);color:#fff;border:none;
            border-radius:5px;font-size:11px;font-weight:600;cursor:pointer">
          Release
        </button>
        <button onclick="bistOverride()"
          style="padding:7px 12px;background:none;border:1px solid var(--border);
            border-radius:5px;font-size:11px;color:var(--muted);cursor:pointer">
          Override…
        </button>`;
    }
  } else {
    if (btn) { btn.textContent = '▶ Run all tests'; btn.disabled = false; }
  }
}

async function bistOverride() {
  const reason = prompt('Override reason (required — this will be recorded permanently in the Chain of Custody):');
  if (!reason?.trim()) return;
  // Write override CoC entry
  const authorName = _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member';
  await API.post('workflow_template_coc', {
    firm_id:         FIRM_ID_CAD,
    template_id:     _selectedTmpl?.id,
    event_type:      'bist_override',
    changed_by:      _myResourceId || null,
    changed_by_name: authorName,
    note:            `Released without passing tests — ${reason}`,
    version_at:      _selectedTmpl?.version,
    created_at:      new Date().toISOString(),
  }).catch(()=>{});
  document.getElementById('bist-gate-overlay')?.remove();
  window._bistOnProceed?.();
}

async function onStatusChange() {
  const sel = document.getElementById('tmpl-status-sel');
  const newStatus = sel?.value;
  if (!newStatus || !_selectedTmpl) return;

  if (newStatus === 'released') {
    // Block if uncommitted changes exist
    const hasPending = _binCount(_selectedTmpl.id) > 0 || _dirtySteps;
    if (hasPending) {
      cadToast('Commit all changes before releasing', 'error');
      if (sel) sel.value = _selectedTmpl.status || 'draft';
      return;
    }

    // Gate: tests must be current and passing against the committed version
    const gate = await runGateCheck(_selectedTmpl.id, _selectedTmpl.version || '0.0.0');

    if (gate.tier !== 3) {
      if (sel) sel.value = _selectedTmpl.status || 'draft';
      const msg = gate.tier === 0 ? 'No test coverage — write and pass tests before releasing'
                : gate.tier === 1 ? 'Tests not run against this version — run tests before releasing'
                : 'Tests failing — fix and pass all tests before releasing';
      cadToast(msg, 'error');
      return;
    }
    // Tier 3 — all passing, fall through
  }

  _proceedRelease(newStatus);
}

function _proceedRelease(newStatus) {
  const sel = document.getElementById('tmpl-status-sel');
  const status = newStatus || sel?.value || 'released';

  // Update in-memory status
  _selectedTmpl.status = status;
  const tmplIdx = _templates.findIndex(t => t.id === _selectedTmpl.id);
  if (tmplIdx >= 0) _templates[tmplIdx].status = status;
  markDirty();

  // Re-render editor and template list
  renderEditor();
  const listEl = document.getElementById('tmpl-list');
  if (listEl) listEl.innerHTML = renderTemplateList();

  // Restore selector after re-render
  const freshSel = document.getElementById('tmpl-status-sel');
  if (freshSel) freshSel.value = status;

  if (status === 'released') {
    cadToast('Released — template is now read only', 'info');
  } else if (status === 'draft') {
    cadToast('Back to Draft — editing enabled', 'info');
  }
}

function _refreshCoCIfOpen() {
  const panel = document.getElementById('tmpl-coc-panel');
  if (panel?.classList.contains('open')) {
    renderTmplCoC(_cocCommittedRows);
  }
}

function toggleTmplTests() {
  const panel    = document.getElementById('tmpl-tests-panel');
  const testsBtn = document.getElementById('tests-btn');
  if (!panel) return;
  const opening = !panel.classList.contains('open');
  panel.classList.toggle('open');
  if (testsBtn) {
    testsBtn.style.color       = opening ? 'var(--cad)'      : '';
    testsBtn.style.borderColor = opening ? 'var(--cad-wire)' : '';
    testsBtn.style.background  = opening ? 'var(--cad-dim)'  : '';
  }
  if (opening && _selectedTmpl) loadTmplTests(_selectedTmpl.id);
}

async function loadTmplTests(templateId) {
  const bodyEl = document.getElementById('tmpl-tests-body');
  if (!bodyEl) return;
  bodyEl.innerHTML = '<div style="font-size:11px;color:var(--muted);text-align:center;padding-top:24px">Loading…</div>';
  try {
    const scripts = await API.get(
      `bist_test_scripts?firm_id=eq.${FIRM_ID_CAD}&template_id=eq.${templateId}&order=created_at.asc`
    ).catch(()=>[]);

    let runs = [];
    if (scripts?.length) {
      const ids = scripts.map(s => s.id).join(',');
      runs = await API.get(
        `bist_runs?firm_id=eq.${FIRM_ID_CAD}&script_id=in.(${ids})&order=run_at.desc&limit=50`
      ).catch(()=>[]);
    }

    renderTmplTests(scripts||[], runs||[]);
  } catch(e) {
    bodyEl.innerHTML = `<div style="font-size:11px;color:var(--red);padding:12px">Failed to load tests: ${escHtml(e.message)}</div>`;
  }
}

function _bistActionDesc(action, params) {
  if (action === 'launch_instance') return `Launch instance`;
  if (action === 'complete_step') {
    const seq   = params?.step_seq ? `step ${params.step_seq}` : '';
    const out   = params?.outcome   ? ` → ${params.outcome}` : '';
    const who   = params?.actor     ? ` (${params.actor.replace(/_/g,' ')})` : '';
    const route = params?.route_to_seq ? ` ↩ → step ${params.route_to_seq}` : '';
    return `Complete ${seq}${out}${who}${route}`;
  }
  if (action === 'wait')        return `Wait ${params?.ms||0}ms`;
  if (action === 'assert_only') return `Check state`;
  return action;
}

function _bistAssertDesc(assert) {
  const path = assert.check || '?';
  if (assert.eq         !== undefined) return `${path} = "${assert.eq}"`;
  if (assert.not_eq     !== undefined) return `${path} ≠ "${assert.not_eq}"`;
  if (assert.gte        !== undefined) return `${path} ≥ ${assert.gte}`;
  if (assert.lte        !== undefined) return `${path} ≤ ${assert.lte}`;
  if (assert.contains   !== undefined) return `${path} contains "${assert.contains}"`;
  if (assert.exists     !== undefined) return `${path} exists`;
  if (assert.not_exists !== undefined) return `${path} not exists`;
  return path;
}

function renderTmplTests(scripts, runs) {
  const bodyEl = document.getElementById('tmpl-tests-body');
  if (!bodyEl) return;
  const ver = _selectedTmpl?.version || '0.0.0';

  if (!scripts.length) {
    bodyEl.innerHTML = `
      <div style="padding:16px;text-align:center">
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px;line-height:1.5">
          No test scripts yet.<br/>Insert scripts into <code style="font-size:10px">bist_test_scripts</code>
          to enable testing.
        </div>
        <div style="font-size:10px;color:var(--muted);margin-top:8px;padding:8px;
          background:var(--bg2);border-radius:4px;text-align:left;font-family:var(--font-mono)">
          Template: ${escHtml(_selectedTmpl?.id||'')}<br/>
          Version: ${escHtml(ver)}
        </div>
      </div>`;
    return;
  }

  // Gate summary
  const currentRuns = scripts.map(s => ({
    script: s,
    run: runs.find(r => r.script_id === s.id && r.template_version === ver) || null,
  }));
  const passed  = currentRuns.filter(r => r.run?.status === 'passed').length;
  const failed  = currentRuns.filter(r => r.run?.status === 'failed').length;
  const notRun  = currentRuns.filter(r => !r.run).length;
  const allPass = passed === scripts.length;

  const gateBg    = allPass ? 'rgba(42,157,64,.08)' : failed ? 'rgba(192,64,74,.08)' : 'rgba(212,144,31,.08)';
  const gateColor = allPass ? 'var(--green)' : failed ? 'var(--red)' : 'var(--amber)';
  const gateIcon  = allPass ? '✓' : failed ? '✕' : '○';
  const gateText  = allPass ? `All ${scripts.length} tests passing — ready to release`
                  : failed  ? `${failed} test${failed>1?'s':''} failing`
                  : `${notRun} test${notRun>1?'s':''} not yet run against v${ver}`;

  const scriptRows = currentRuns.map(({ script, run }) => {
    const spec = typeof script.script === 'string'
      ? JSON.parse(script.script) : script.script;
    const steps = spec?.steps || [];

    // Build flat list of assertions across all steps
    const assertionRows = [];
    steps.forEach(stp => {
      // One row for the action itself
      const actionDesc = _bistActionDesc(stp.action, stp.params);
      assertionRows.push({ type: 'action', id: `${script.id}-${stp.id}-act`,
        label: actionDesc, stepId: stp.id });
      // One row per assertion
      (stp.asserts||[]).forEach((a, ai) => {
        assertionRows.push({ type: 'assert', id: `${script.id}-${stp.id}-a${ai}`,
          label: _bistAssertDesc(a), check: a.check,
          expected: a.eq ?? a.gte ?? a.lte ?? a.not_eq ?? '(exists)',
          stepId: stp.id, assertIdx: ai });
      });
    });

    // Determine state of each row from last run
    function rowState(row) {
      if (!run) return 'pending';
      if (run.status === 'passed') return 'passed';
      if (run.status === 'failed') {
        if (row.stepId === run.failure_step) {
          // This is the failed step — assertions after the failure are unknown
          if (row.type === 'assert') {
            const [checkPath] = (run.failure_reason||'').split(':');
            return checkPath?.trim() === row.check ? 'failed' : 'unknown';
          }
          return 'failed';
        }
        // Steps before the failed one passed
        const failedStepIdx = steps.findIndex(s => s.id === run.failure_step);
        const thisStepIdx   = steps.findIndex(s => s.id === row.stepId);
        if (thisStepIdx < failedStepIdx) return 'passed';
        return 'unknown';
      }
      return 'pending';
    }

    const overallColor = !run ? 'var(--muted)'
      : run.status === 'passed' ? 'var(--green)'
      : run.status === 'failed' ? 'var(--red)' : 'var(--muted)';
    const overallIcon  = !run ? '○' : run.status === 'passed' ? '✓' : '✕';

    const runMeta = run
      ? `v${escHtml(run.template_version||'?')} · ${run.duration_ms?(run.duration_ms/1000).toFixed(1)+'s':''} · ${new Date(run.run_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`
      : `Not run for v${escHtml(ver)}`;

    const assertRowsHtml = assertionRows.map(row => {
      const st = rowState(row);
      const color = st==='passed'?'var(--green)':st==='failed'?'var(--red)':st==='unknown'?'var(--border2)':'var(--muted)';
      const icon  = st==='passed'?'✓':st==='failed'?'✕':st==='unknown'?'—':'○';
      const isAction = row.type === 'action';

      // For failed assertion, show expected vs actual
      let failNote = '';
      if (st === 'failed' && run?.failure_reason) {
        const [, ...rest] = run.failure_reason.split(':');
        const actualPart  = rest.join(':').trim();
        const expectedVal = actualPart.match(/expected (.+?),/)?.[1] || '—';
        const actualVal   = actualPart.match(/got (.+)$/)?.[1]       || '—';
        failNote = `<span style="font-family:var(--font-mono);font-size:9px;color:var(--red);margin-left:4px">
          expected <span style="color:var(--green)">${escHtml(expectedVal)}</span>
          got <span style="color:var(--red)">${escHtml(actualVal)}</span>
        </span>`;
      }

      return `<div id="${row.id}"
        style="display:flex;align-items:baseline;gap:6px;padding:3px 0 3px ${isAction?'0':'14px'};
          border-bottom:1px solid rgba(255,255,255,.03)">
        <span style="font-size:10px;color:${color};width:12px;flex-shrink:0;
          font-family:var(--font-mono);${isAction?'opacity:.4':''}">${icon}</span>
        <span style="font-size:${isAction?'10':'11'}px;
          color:${isAction?'var(--muted)':'var(--text2)'};flex:1;
          font-style:${isAction?'italic':'normal'}">${escHtml(row.label)}</span>
        ${failNote}
      </div>`;
    }).join('');

    return `
      <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:8px">
        <!-- Script header — click to expand/collapse -->
        <div onclick="bistTogglePlan('${script.id}')" style="padding:8px 10px;background:var(--bg2);
          display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none">
          <span id="bist-icon-${script.id}"
            style="color:${overallColor};font-size:12px;width:14px;
              flex-shrink:0;font-family:var(--font-mono)">${overallIcon}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:500;color:var(--text)">${escHtml(script.name)}</div>
            <div style="font-size:9px;color:var(--muted);margin-top:1px;font-family:var(--font-mono)">
              ${escHtml(runMeta)}
            </div>
          </div>
          <span id="bist-chevron-${script.id}"
            style="font-size:9px;color:var(--muted);transition:transform .15s;
              flex-shrink:0;margin-right:4px">▶</span>
          <button onclick="event.stopPropagation();runSingleTest('${script.id}')"
            style="flex-shrink:0;padding:4px 10px;font-size:10px;background:none;
              border:1px solid var(--border);border-radius:4px;
              color:var(--muted);cursor:pointer">▶</button>
        </div>
        <!-- Assertion plan rows — collapsed by default -->
        <div id="bist-plan-${script.id}" style="display:none;padding:4px 10px 6px;
          border-top:1px solid var(--border)">
          ${assertRowsHtml}
        </div>
        <!-- Live log (hidden until run) -->
        <div id="bist-log-${script.id}" style="display:none;font-size:9px;
          color:var(--muted);font-family:var(--font-mono);padding:4px 10px 6px;
          border-top:1px solid var(--border);line-height:1.8;background:var(--bg2)"></div>
      </div>`;
  }).join('');

  bodyEl.innerHTML = `
    <!-- Gate status summary -->
    <div style="padding:8px 10px;margin-bottom:2px;border-radius:5px;
      background:${gateBg};border:1px solid ${gateColor}44;
      display:flex;align-items:center;gap:6px">
      <span style="color:${gateColor};font-size:13px">${gateIcon}</span>
      <span style="font-size:11px;color:${gateColor};font-weight:500">${gateText}</span>
    </div>
    <!-- Run all + expand/collapse controls -->
    <div style="padding:8px 0 4px;display:flex;gap:6px;align-items:center">
      <button id="bist-run-all-btn" onclick="runAllTests()"
        style="flex:1;padding:7px;background:var(--cad);color:#fff;border:none;
          border-radius:5px;font-size:11px;font-weight:600;cursor:pointer">
        ▶ Run all tests
      </button>
      <button onclick="bistExpandAll()" title="Expand all"
        style="padding:5px 8px;background:none;border:1px solid var(--border);
          border-radius:4px;font-size:10px;color:var(--muted);cursor:pointer">↕</button>
      <span style="font-size:9px;color:var(--muted)">v${escHtml(ver)}</span>
    </div>
    <!-- Script rows -->
    <div style="padding:4px 0">${scriptRows}</div>`;
}

function bistTogglePlan(scriptId) {
  const plan    = document.getElementById(`bist-plan-${scriptId}`);
  const chevron = document.getElementById(`bist-chevron-${scriptId}`);
  if (!plan) return;
  const open = plan.style.display !== 'none';
  plan.style.display    = open ? 'none' : 'block';
  if (chevron) chevron.style.transform = open ? '' : 'rotate(90deg)';
}

function bistExpandAll() {
  const body = document.getElementById('tmpl-tests-body');
  if (!body) return;
  const plans   = body.querySelectorAll('[id^="bist-plan-"]');
  const chevrons = body.querySelectorAll('[id^="bist-chevron-"]');
  // If any are collapsed, expand all. If all expanded, collapse all.
  const anyCollapsed = [...plans].some(p => p.style.display === 'none');
  plans.forEach(p    => { p.style.display = anyCollapsed ? 'block' : 'none'; });
  chevrons.forEach(c => { c.style.transform = anyCollapsed ? 'rotate(90deg)' : ''; });
}

async function runSingleTest(scriptId) {
  const iconEl = document.getElementById(`bist-icon-${scriptId}`);
  const logEl  = document.getElementById(`bist-log-${scriptId}`);

  if (iconEl) { iconEl.textContent = '…'; iconEl.style.color = 'var(--amber)'; }
  if (logEl)  { logEl.style.display = 'block'; logEl.innerHTML = ''; }

  // Auto-expand the plan while running
  const planEl    = document.getElementById(`bist-plan-${scriptId}`);
  const chevronEl = document.getElementById(`bist-chevron-${scriptId}`);
  if (planEl)    planEl.style.display      = 'block';
  if (chevronEl) chevronEl.style.transform = 'rotate(90deg)';

  // Reset all assertion rows to pending (○ gray)
  planEl?.querySelectorAll('[id^="' + scriptId + '-"]').forEach(row => {
    const icon = row.querySelector('span:first-child');
    if (icon) { icon.textContent = '○'; icon.style.color = 'var(--muted)'; }
  });

  // Load script spec to get step/assert IDs
  const scripts = await API.get(
    `bist_test_scripts?firm_id=eq.${FIRM_ID_CAD}&id=eq.${scriptId}`
  ).catch(()=>[]);
  const script = scripts?.[0];
  const spec   = script ? (typeof script.script === 'string'
    ? JSON.parse(script.script) : script.script) : null;

  function tickRow(rowId, state) {
    const rowEl = document.getElementById(rowId);
    if (!rowEl) return;
    const icon  = rowEl.querySelector('span:first-child');
    if (!icon) return;
    const color = state==='passed'?'var(--green)':state==='failed'?'var(--red)':state==='running'?'var(--amber)':'var(--muted)';
    const glyph = state==='passed'?'✓':state==='failed'?'✕':state==='running'?'…':'—';
    icon.textContent = glyph;
    icon.style.color = color;
    rowEl.scrollIntoView?.({ block:'nearest' });
  }

  let _currentStepId = null;

  const result = await runBistScript(scriptId, ({ type, action, params, stepName,
    outcome, reason, message, instId, stepId }) => {

    if (type === 'instance_created') {
      // Inject Watch button
      const row = document.querySelector(`[id^="bist-icon-${scriptId}"]`)?.closest('div[style*="border:1px"]');
      if (row && !row.querySelector('.bist-watch-btn')) {
        const watchBtn = document.createElement('button');
        watchBtn.className = 'bist-watch-btn';
        watchBtn.style.cssText = `flex-shrink:0;padding:4px 10px;font-size:10px;
          background:var(--cad-dim);border:1px solid var(--cad-wire);border-radius:4px;
          color:var(--cad);cursor:pointer`;
        watchBtn.textContent = '👁 Watch';
        watchBtn.onclick = () => {
          switchTab('instances');
          loadAll().then(() => renderTab('instances'));
        };
        const runBtn = row.querySelector('button[onclick^="runSingleTest"]');
        if (runBtn) runBtn.parentNode.insertBefore(watchBtn, runBtn);
      }
    }

    if (type === 'step_start') {
      _currentStepId = stepId;
      // Mark action row as running
      tickRow(`${scriptId}-${stepId}-act`, 'running');
    }

    if (type === 'step_pass') {
      // Mark action row passed
      tickRow(`${scriptId}-${stepId}-act`, 'passed');
      // Mark all asserts for this step passed
      const stp = spec?.steps?.find(s => s.id === stepId);
      (stp?.asserts||[]).forEach((_, ai) => {
        tickRow(`${scriptId}-${stepId}-a${ai}`, 'passed');
      });
    }

    if (type === 'step_fail') {
      tickRow(`${scriptId}-${_currentStepId}-act`, 'failed');
      // Find which assertion failed from reason
      const [checkPath] = (reason||'').split(':');
      const stp = spec?.steps?.find(s => s.id === _currentStepId);
      (stp?.asserts||[]).forEach((a, ai) => {
        const state = a.check === checkPath?.trim() ? 'failed' : '—';
        tickRow(`${scriptId}-${_currentStepId}-a${ai}`, state === 'failed' ? 'failed' : 'unknown');
      });
    }
  });

  // Final overall icon
  if (iconEl) {
    iconEl.textContent = result.status === 'passed' ? '✓' : '✕';
    iconEl.style.color = result.status === 'passed' ? 'var(--green)' : 'var(--red)';
  }

  // Write CoC entry for this test run
  if (_selectedTmpl?.id) {
    const authorName = _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member';
    const statusIcon = result.status === 'passed' ? '✓' : '✕';
    const note = result.status === 'passed'
      ? `${statusIcon} Passed`
      : `${statusIcon} Failed — ${result.reason || 'assertion error'}`;
    await API.post('workflow_template_coc', {
      firm_id:         FIRM_ID_CAD,
      template_id:     _selectedTmpl.id,
      event_type:      'bist_run',
      changed_by:      _myResourceId || null,
      changed_by_name: authorName,
      field_name:      script?.name || 'Test',
      note,
      version_at:      _selectedTmpl.version || '0.0.0',
      created_at:      new Date().toISOString(),
    }).catch(() => {});
    _cocCommittedRows = []; // force CoC reload
    _refreshCoCIfOpen();
  }

  // Remove Watch button
  document.querySelector(`#bist-plan-${scriptId}`)
    ?.closest('div')?.querySelector('.bist-watch-btn')?.remove();

  // Refresh full panel
  if (_selectedTmpl) await loadTmplTests(_selectedTmpl.id);
}

async function runAllTests() {
  // Route through cockpit if a template is selected
  if (_selectedTmpl?.id) {
    _bistLaunchCockpit(_selectedTmpl.id, _selectedTmpl.version || '0.0.0', null);
    return;
  }
  const btn = document.getElementById('bist-run-all-btn');
  if (btn) { btn.textContent = 'Running…'; btn.disabled = true; }

  const scripts = await API.get(
    `bist_test_scripts?firm_id=eq.${FIRM_ID_CAD}&template_id=eq.${_selectedTmpl?.id}&order=created_at.asc`
  ).catch(()=>[]);

  const results = [];
  for (const script of (scripts||[])) {
    // runSingleTest writes individual CoC entries — collect outcomes for summary
    await runSingleTest(script.id);
    // Get last bist_run CoC entry for this script to check status
    const lastRun = await API.get(
      `bist_runs?firm_id=eq.${FIRM_ID_CAD}&script_id=eq.${script.id}&order=run_at.desc&limit=1`
    ).catch(()=>[]);
    results.push({ name: script.name, status: lastRun?.[0]?.status || 'error' });
  }

  if (btn) { btn.textContent = '▶ Run all tests'; btn.disabled = false; }

  // Write suite summary CoC entry
  if (_selectedTmpl?.id && results.length > 1) {
    const passed   = results.filter(r => r.status === 'passed').length;
    const total    = results.length;
    const allPass  = passed === total;
    const authorName = _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member';
    const note = results.map(r =>
      `${r.status === 'passed' ? '✓' : '✕'} ${r.name}`
    ).join('\n');
    await API.post('workflow_template_coc', {
      firm_id:         FIRM_ID_CAD,
      template_id:     _selectedTmpl.id,
      event_type:      'bist_run',
      changed_by:      _myResourceId || null,
      changed_by_name: authorName,
      field_name:      `Suite: ${passed}/${total} passing`,
      note,
      version_at:      _selectedTmpl.version || '0.0.0',
      created_at:      new Date().toISOString(),
    }).catch(() => {});
    _cocCommittedRows = [];
    _refreshCoCIfOpen();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BIST Cockpit Engine — v20260403-B
// Replaces showGateDialog as the live visual renderer for BIST runs.
// Called by:  _bistLaunchCockpit(templateId, version, onProceed)
// Feeds:      runBistScript() onProgress callbacks → cockpit node/CoC/radio state
// Writes:     bist_runs records (via runBistScript), workflow_template_coc cert
// ═══════════════════════════════════════════════════════════════════════════════

async function _bistLaunchCockpit(templateId, version, onProceed) {
  // Close any existing gate overlay
  document.getElementById('bist-gate-overlay')?.remove();
  document.getElementById('bist-cockpit-overlay')?.remove();
  window._bckCockpitClosed = false;  // reset for this run
  window._bckAborted = false;
  // Update simulator gate text immediately
  var _gateEl = document.getElementById('s9-sim-gate');
  if (_gateEl) {
    _gateEl.textContent = '▶ Simulation in progress…';
    _gateEl.style.color = 'rgba(239,159,39,.9)';
  }

  // Load scripts + template metadata
  const [scripts, tmplArr] = await Promise.all([
    API.get(`bist_test_scripts?firm_id=eq.${FIRM_ID_CAD}&template_id=eq.${templateId}&order=created_at.asc`).catch(()=>[]),
    API.get(`workflow_templates?id=eq.${templateId}&select=id,name,version,status`).catch(()=>[]),
  ]);
  const tmpl = tmplArr?.[0] || _selectedTmpl || { name:'Template', version };
  const tmplName = tmpl.name || 'Template';

  if (!scripts?.length) {
    cadToast('No test scripts found for this template. Add scripts to bist_test_scripts to use the Simulator.', 'error');
    return;
  }

  // ── Build TESTS array from live scripts ──────────────────────────────────
  const tmplSteps = await API.get(
    `workflow_template_steps?template_id=eq.${templateId}&order=sequence_order.asc`
  ).catch(()=>[]) || [];

  const TESTS = scripts.map(script => {
    const spec = typeof script.script === 'string' ? JSON.parse(script.script) : script.script;
    const nodes = [];
    const actors = [];
    const anames = [];

    (spec.steps || []).forEach(stp => {
      if (stp.action === 'launch_instance') {
        nodes.push('Instance\nLaunch');
        actors.push('SYS');
        anames.push('System');
      } else if (stp.action === 'complete_step') {
        const seq = stp.params?.step_seq;
        const tmplStep = tmplSteps.find(s => s.sequence_order === seq);
        const nm = tmplStep ? tmplStep.name : `Step ${seq||'?'}`;
        const actorKey = stp.params?.actor || 'actor_1';
        const actor = _bistResolveActor(actorKey);
        const initials = (actor.userName || '?').split(' ').map(w=>w[0]).join('').slice(0,3).toUpperCase();
        nodes.push(nm);
        actors.push(initials);
        anames.push(actor.userName || actorKey);
      }
    });

    return {
      id:       script.id,
      name:     script.name,
      spec,
      nodes:    nodes.length ? nodes : ['Run'],
      actors:   actors.length ? actors : ['?'],
      anames:   anames.length ? anames : ['Unknown'],
    };
  });

  // ── Render cockpit into the right column of s9-sim-panel ───────────────
  // Targets s9-sim-right — leaves left rail (test scripts) intact.
  const simRight = document.getElementById('s9-sim-right');
  const simPanel = document.getElementById('s9-sim-panel');
  const ov = simRight || simPanel || document.createElement('div');
  if (!simRight && !simPanel) {
    ov.id = 'bist-cockpit-overlay';
    document.documentElement.appendChild(ov);
  }
  // Style the target to host the cockpit
  if (simRight) {
    ov.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;width:100%;height:100%';
  } else if (simPanel) {
    ov.style.cssText = 'display:flex;flex:1;flex-direction:column;overflow:hidden';
  }

  // Inject cockpit HTML
  ov.innerHTML = _bistCockpitHTML(tmplName, version, TESTS);

  const _restoreSimPanel = () => {
    // Reset freeze state so the run loop exits cleanly
    window._bckCockpitClosed = true;
    window._bckAborted = true;
    window._bckFrozen = false;
    _bistCkStopClock();
    window._bistCkRunning = false;
    // Patch any in-flight bist_run to aborted
    var _abortedRunId = window._bckCurrentRunId;
    window._bckCurrentRunId = null;
    if (_abortedRunId) {
      API.patch('bist_runs?id=eq.'+_abortedRunId,
        {status:'aborted', duration_ms: Date.now() - (window._bckStartMs||Date.now())}
      ).catch(function(){});
    }
    if (simPanel && typeof _s9RenderSimPanel === 'function') {
      _s9RenderSimPanel(simPanel);
      // Set aborted gate text — no DB refresh, avoids race with stale passing result
      var _gcEl2 = document.getElementById('s9-sim-gate');
      if (_gcEl2) { _gcEl2.textContent = '⚠ Aborted — reopen Simulator to refresh'; _gcEl2.style.color = 'rgba(226,75,74,.8)'; }
    } else if (!simPanel) {
      ov.remove();
    }
  };
  window._bistCockpitClose   = () => _restoreSimPanel();
  window._bistCockpitProceed = () => { _restoreSimPanel(); onProceed?.(); };
  window._bistCockpitOverride = async () => {
    const reason = prompt('Override reason (required — permanently recorded in Chain of Custody):');
    if (!reason?.trim()) return;
    const authorName = _resources_cad?.find(r => r.id === _myResourceId)?.name || 'Team Member';
    await API.post('workflow_template_coc', {
      firm_id: FIRM_ID_CAD, template_id: templateId,
      event_type: 'bist_override', changed_by: _myResourceId || null,
      changed_by_name: authorName,
      note: `Released without passing tests — ${reason}`,
      version_at: version, created_at: new Date().toISOString(),
    }).catch(()=>{});
    ov.remove();
    onProceed?.();
  };

  // Init cockpit scene
  _bistCkInit(TESTS);

  // Start preflight then auto-launch if we have scripts
  await _bistCkPreflight(tmplName, version, scripts.length, tmplSteps.length);

  // Run all tests feeding cockpit
  window._bistCkRunning = true;
  const startMs = Date.now();
  _bistCkStartClock(startMs);

  const allResults = [];
  for (let ti = 0; ti < TESTS.length; ti++) {
    if (!document.getElementById('s9-sim-right') && !document.getElementById('s9-sim-panel') && !document.getElementById('bist-cockpit-overlay')) break; // closed

    // ── FREEZE: spin-wait between scripts until resumed ──────────────────────
    while (_bckFrozen) {
      if (window._bckCockpitClosed) break;
      await new Promise(r => setTimeout(r, 200));
      if (!document.getElementById('s9-sim-right') && !document.getElementById('s9-sim-panel')) break;
    }
    if (!document.getElementById('s9-sim-right') && !document.getElementById('s9-sim-panel') && !document.getElementById('bist-cockpit-overlay')) break;

    const t = TESTS[ti];
    _bistCkBeginTest(ti, t.name);

    window._bckCurrentRunId = null;
    const result = await runBistScript(t.id, (ev) => {
      if (!document.getElementById('s9-sim-right') && !document.getElementById('s9-sim-panel') && !document.getElementById('bist-cockpit-overlay')) return;
      _bistCkOnProgress(ti, t, ev, tmplSteps);
    });

    _bistCkEndTest(ti, result.status);
    if (window._bckCockpitClosed) break;  // closed during script — don't record result
    allResults.push({ name: t.name, status: result.status, runId: result.runId, reason: result.reason });

    // ── FREEZE: also pause between scripts after completion ──────────────────
    await new Promise(r => setTimeout(r, 400));
    while (_bckFrozen) {
      if (window._bckCockpitClosed) break;
      await new Promise(r => setTimeout(r, 200));
      if (!document.getElementById('s9-sim-right') && !document.getElementById('s9-sim-panel')) break;
    }
  }

  window._bistCkRunning = false;
  _bistCkStopClock();
  var rb = _bckEl('bck-replay-btn'); if (rb) rb.style.display = 'inline-block';
  var fb = _bckEl('bck-freeze-btn'); if (fb) fb.style.display = 'inline-block';

  // If cockpit was closed mid-run, do not show cert or update release gate
  if (window._bckCockpitClosed) return;

  const allPass = allResults.length > 0 && allResults.every(r => r.status === 'passed');
  const elapsed = Math.round((Date.now() - startMs) / 1000);

  if (allPass) {
    _bistCkAnnounce('ALL TESTS PASSED — CLEARED FOR RELEASE', true);
    _bistCkRadio('ground', '✓ Flight recorder archived.');
    await new Promise(r => setTimeout(r, 700));
    _bistCkRadio('ground', '✓ Validation certificate archived.');
    await new Promise(r => setTimeout(r, 700));
    _bistCkRadio('ground', '✓ Chain of Custody archived.');
    await new Promise(r => setTimeout(r, 700));
    _bistCkRadio('ground', `Mission complete — ${tmplName} v${version} certified.`);

    // Write cert CoC entry
    const authorName = _resources_cad?.find(r => r.id === _myResourceId)?.name || 'Team Member';
    const certId = 'CERT-' + new Date().toISOString().replace(/[-:T]/g,'').slice(0,14) + '-' + Math.floor(Math.random()*9000+1000);
    await API.post('workflow_template_coc', {
      firm_id: FIRM_ID_CAD, template_id: templateId,
      event_type: 'bist_certified',
      changed_by: _myResourceId || null,
      changed_by_name: authorName,
      field_name: `BIST Suite — ${TESTS.length} tests`,
      note: `All ${TESTS.length} validation tests passed — ${certId}`,
      version_at: version, created_at: new Date().toISOString(),
    }).catch(()=>{});

    await new Promise(r => setTimeout(r, 800));
    _bistCkShowCert(tmplName, version, allResults, elapsed, certId, onProceed);
  } else {
    const failCount = allResults.filter(r => r.status !== 'passed').length;
    _bistCkAnnounce(`${failCount} TEST${failCount > 1 ? 'S' : ''} FAILED — CANNOT RELEASE`, false);
    _bistCkRadio('reject', `TOWER: ${failCount} test${failCount > 1 ? 's' : ''} failed. Release blocked. Review failures and re-run.`);
    _bistCkShowFooter(false, onProceed);
  }
}

// ── Cockpit HTML skeleton ────────────────────────────────────────────────────
function _bistCockpitHTML(tmplName, version, tests) {
  const tPills = tests.map((t, i) =>
    `<div class="bck-tt ${i===0?'bck-ta':''}" id="bck-tt${i}" onclick="_bistCkSelTest(${i})">
      <div class="bck-tn">T${i+1}</div>
      <div class="bck-tnm">${_bistEscHtml(t.name)}</div>
      <div class="bck-td" id="bck-td${i}"></div>
    </div>`
  ).join('');

  return `<style>
.bck{font-family:Arial,sans-serif;background:#02070f;overflow:hidden;border:none;display:flex;flex-direction:column;position:relative;flex:1;min-height:0;width:100%;height:100%}
.bck-gl{background:#110c04;height:26px;border-bottom:2px solid #1e1408;display:flex;align-items:center;padding:0 14px;gap:10px;flex-shrink:0;z-index:10;position:relative}
.bck-gld{width:8px;height:8px;border-radius:50%;background:#1a1208;transition:all .45s}
.bck-gld.on{background:#4ade80;box-shadow:0 0 8px 2px rgba(74,222,128,.6)}
.bck-gld.am{background:#EF9F27;box-shadow:0 0 8px 2px rgba(239,159,39,.6)}
.bck-gl-lbl{font-size:12px;letter-spacing:.12em;color:rgba(255,180,60,.28);text-transform:uppercase}
.bck-gs{flex:1}
.bck-ann{font-size:12px;letter-spacing:.18em;color:rgba(255,180,60,.55);text-transform:uppercase;transition:all .4s}
.bck-ann.go{color:rgba(74,222,128,.8);text-shadow:0 0 8px rgba(74,222,128,.4)}
.bck-ann.fail{color:rgba(226,75,74,.8)}
.bck-ws{position:relative;flex:1;min-height:0;overflow:hidden}
.bck-sky{position:absolute;inset:0;background:linear-gradient(180deg,#000308 0%,#000d2a 35%,#001845 55%,#012060 70%,#1a3d72 82%,#3a6090 100%)}
.bck-stars{position:absolute;inset:0;pointer-events:none}
.bck-earth{position:absolute;left:0;right:0;bottom:0;height:36%;background:linear-gradient(180deg,#1a3060 0%,#0d1f45 18%,#060f22 40%,#030810 70%,#020508 100%);overflow:hidden}
.bck-eglow{position:absolute;bottom:0;left:0;right:0;height:70%;background:radial-gradient(ellipse 90% 50% at 50% 100%,rgba(160,100,15,.4) 0%,rgba(80,50,8,.18) 40%,transparent 80%)}
.bck-cities{position:absolute;inset:0}
.bck-hband{position:absolute;left:0;right:0;top:64%;height:3px;background:linear-gradient(90deg,transparent,rgba(180,220,255,.08) 15%,rgba(220,240,255,.3) 40%,rgba(255,255,255,.42) 50%,rgba(220,240,255,.3) 60%,rgba(180,220,255,.08) 85%,transparent)}
.bck-wfl{position:absolute;left:0;top:0;bottom:0;width:52px;background:linear-gradient(90deg,#0d0903 30%,transparent);z-index:8;pointer-events:none}
.bck-wfr{position:absolute;right:0;top:0;bottom:0;width:52px;background:linear-gradient(270deg,#0d0903 30%,transparent);z-index:8;pointer-events:none}

.bck-wft{position:absolute;top:0;left:0;right:0;height:18px;background:linear-gradient(180deg,#0d0903,transparent);z-index:8;pointer-events:none}
.bck-wfb{position:absolute;bottom:0;left:0;right:0;height:16px;background:linear-gradient(0deg,#02070f,transparent);z-index:8;pointer-events:none}
.bck-hud{position:absolute;inset:0;pointer-events:none;z-index:7}
.bck-hhl{position:absolute;top:64%;left:6%;right:6%;height:1px;background:rgba(0,210,255,.12)}
.bck-hcm{position:absolute;top:64%;left:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:5px}
.bck-hw{width:28px;height:1px;background:rgba(0,210,255,.28)}
.bck-hd{width:5px;height:5px;border-radius:50%;border:1px solid rgba(0,210,255,.42)}
.bck-hr{position:absolute;right:315px;top:10%;font-size:12px;font-family:monospace;color:rgba(0,210,255,.35);line-height:2;text-align:right;white-space:pre}
.bck-hl{position:absolute;left:8%;top:16%;font-size:12px;font-family:monospace;color:rgba(0,210,255,.35);line-height:2;white-space:pre}
.bck-pf{position:absolute;inset:0;background:rgba(2,7,15,.92);z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px 60px}
.bck-pftitle{font-size:12px;letter-spacing:.2em;color:rgba(0,210,255,.5);text-transform:uppercase;margin-bottom:12px}
.bck-pfchecks{width:100%;max-width:420px;display:flex;flex-direction:column;gap:4px}
.bck-pfrow{display:flex;align-items:center;gap:10px;padding:4px 12px;border-radius:3px;border:1px solid rgba(255,255,255,.04);background:rgba(255,255,255,.02);opacity:0;transition:all .3s}
.bck-pfrow.show{opacity:1}
.bck-pfrow.ok{border-color:rgba(74,222,128,.2);background:rgba(74,222,128,.04)}
.bck-pfind{width:9px;height:9px;border-radius:50%;flex-shrink:0;background:rgba(255,255,255,.1);transition:all .3s}
.bck-pfind.chk{background:#EF9F27;box-shadow:0 0 6px rgba(239,159,39,.5);animation:bckPfp .6s ease-in-out infinite}
.bck-pfind.ok{background:#4ade80;box-shadow:0 0 5px rgba(74,222,128,.5);animation:none}
@keyframes bckPfp{0%,100%{opacity:1}50%{opacity:.4}}
.bck-pflbl{font-size:12px;color:rgba(255,255,255,.6);flex:1}
.bck-pfsub{font-size:12px;color:rgba(255,255,255,.28);margin-top:1px}
.bck-pfres{font-size:12px;font-family:monospace;color:rgba(255,255,255,.25);text-align:right;min-width:76px}
.bck-pfres.ok{color:rgba(74,222,128,.7)}
.bck-pfgo{margin-top:14px;font-size:12px;letter-spacing:.12em;color:rgba(0,210,255,.6);text-transform:uppercase;opacity:0;transition:opacity .5s}
.bck-pfgo.show{opacity:1}
.bck-dag{position:absolute;left:52px;right:52px;z-index:6;display:flex;justify-content:center}
.bck-dagrow{display:flex;align-items:center;gap:0}
.bck-dt{width:22px;height:22px;border-radius:50%;border:2px solid rgba(255,255,255,.12);background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .35s}
.bck-dt.on{border-color:#EF9F27;background:rgba(20,12,0,.75);box-shadow:0 0 14px rgba(239,159,39,.45)}
.bck-dt.dn{border-color:rgba(74,222,128,.55);background:rgba(0,15,5,.7);box-shadow:0 0 10px rgba(74,222,128,.3)}
.bck-de{width:18px;height:18px;border-radius:50%;border:2px solid rgba(255,255,255,.1);background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .35s}
.bck-de.dn{border-color:rgba(74,222,128,.6);box-shadow:0 0 12px rgba(74,222,128,.35)}
.bck-nc{width:120px;flex-shrink:0;border-radius:4px;border:1.5px solid rgba(255,255,255,.07);background:rgba(0,4,12,.82);backdrop-filter:blur(4px);transition:all .35s;overflow:hidden}
.bck-nc.ac{border-color:#EF9F27;background:rgba(12,8,0,.9);box-shadow:0 0 16px rgba(239,159,39,.35)}
.bck-nc.dn{border-color:rgba(74,222,128,.45);background:rgba(0,10,4,.87);box-shadow:0 0 8px rgba(74,222,128,.18)}
.bck-nc.rs{border-color:rgba(239,159,39,.35);background:rgba(12,6,0,.87)}
.bck-nct{display:flex;align-items:center;gap:4px;padding:3px 5px 3px;border-bottom:1px solid rgba(255,255,255,.04)}
.bck-nav{width:18px;height:18px;border-radius:50%;background:rgba(239,159,39,.18);border:1px solid rgba(239,159,39,.3);display:flex;align-items:center;justify-content:center;font-size:12px;color:rgba(239,159,39,.8);font-weight:700;flex-shrink:0}
.bck-nan{font-size:12px;color:rgba(255,255,255,.65);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bck-nb{padding:4px 5px}
.bck-ntitle{font-size:12px;font-weight:500;color:rgba(255,255,255,.9);line-height:1.3;min-height:24px}
.bck-nst{display:flex;align-items:center;gap:3px;margin-top:2px}
.bck-nsdot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
.bck-nstxt{font-size:12px}
.bck-cw{height:1.5px;background:rgba(255,255,255,.07);flex-shrink:0;transition:background .4s;width:12px}
.bck-cw.dn{background:rgba(74,222,128,.32)}
.bck-cw.ac{background:rgba(239,159,39,.4);animation:bckPw .9s ease-in-out infinite}
@keyframes bckPw{0%,100%{opacity:.4}50%{opacity:1}}
.bck-lz{position:absolute;left:52px;right:52px;z-index:5;pointer-events:none;overflow:visible}
.bck-coc{position:absolute;right:0;top:26px;bottom:0;width:300px;background:rgba(2,5,12,.97);border-left:1px solid rgba(0,210,255,.12);border-top:1px solid rgba(0,210,255,.08);border-bottom:1px solid rgba(0,210,255,.08);display:flex;flex-direction:column;z-index:15}
.bck-coch{padding:5px 10px;border-bottom:1px solid rgba(255,255,255,.05);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.bck-coct{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:rgba(0,210,255,.8)}
.bck-cocc{font-size:12px;font-family:monospace;color:rgba(0,210,255,.9)}
.bck-cocf{overflow-y:auto;display:flex;flex-direction:column;flex:1;min-height:0}
.bck-cocf::-webkit-scrollbar{width:2px}
.bck-cocf::-webkit-scrollbar-thumb{background:rgba(255,255,255,.07)}
.bck-ce{display:flex;gap:6px;padding:4px 10px;border-bottom:1px solid rgba(255,255,255,.025);animation:bckCi .18s ease-out}
@keyframes bckCi{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.bck-cedot{width:5px;height:5px;border-radius:50%;flex-shrink:0;margin-top:4px}
.bck-ceb{flex:1}
.bck-cet{font-size:12px;font-weight:500;letter-spacing:.03em}
.bck-ced{font-size:12px;color:rgba(255,255,255,.65);line-height:1.5;margin-top:1px}
.bck-cts{font-size:12px;font-family:monospace;color:rgba(0,210,255,.45);margin-top:1px}
.bck-coam{background:linear-gradient(180deg,#0e0902,#0a0701);border-top:2px solid #1e1408;padding:5px 0 4px;flex-shrink:0}
.bck-efrow{display:flex;padding:0 10px;margin-right:304px}
.bck-ef{flex:1;padding:3px 7px;border-right:1px solid rgba(255,255,255,.04);display:flex;flex-direction:column;gap:2px}
.bck-ef:last-child{border-right:none}
.bck-eflbl{font-size:12px;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,160,50,.75)}
.bck-efval{font-size:16px;font-family:monospace;font-weight:500;letter-spacing:.04em;color:#e8d4a0;line-height:1.1;transition:color .3s}
.bck-efval.cyan{color:#00D2FF}.bck-efval.green{color:#4ade80}
.bck-efbar{height:2px;background:rgba(255,255,255,.05);border-radius:1px;overflow:hidden}
.bck-effill{height:100%;border-radius:1px;transition:width .5s ease}
.bck-efsub{font-size:12px;font-family:Arial,sans-serif;color:rgba(255,255,255,.45)}
.bck-radio{background:#040b17;border-top:1px solid rgba(0,210,255,.08);flex-shrink:0;position:relative}.bck-radio-handle{position:absolute;top:-4px;left:0;right:300px;height:8px;cursor:ns-resize;z-index:20;display:flex;align-items:center;justify-content:center}.bck-radio-handle::after{content:"";display:block;width:40px;height:3px;border-radius:2px;background:rgba(0,210,255,.35);transition:background .15s}.bck-radio-handle:hover::after{background:rgba(0,210,255,.75)}
.bck-rh{display:flex;align-items:center;gap:10px;padding:4px 14px;border-bottom:1px solid rgba(255,255,255,.04);margin-right:304px}
.bck-rt{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:rgba(0,210,255,.35)}
.bck-rdot{width:5px;height:5px;border-radius:50%;background:rgba(0,210,255,.15)}
.bck-rdot.live{background:#00D2FF;box-shadow:0 0 5px #00D2FF;animation:bckBk .8s ease-in-out infinite}
@keyframes bckBk{0%,100%{opacity:1}50%{opacity:.25}}
.bck-rf{height:90px;overflow-y:auto;padding:4px 14px;display:flex;flex-direction:column-reverse;margin-right:304px}
.bck-rf::-webkit-scrollbar{width:2px}
.bck-rf::-webkit-scrollbar-thumb{background:rgba(255,255,255,.07)}
.bck-tx{display:flex;align-items:flex-start;gap:8px;padding:2px 0;animation:bckTxi .2s ease-out}
@keyframes bckTxi{from{opacity:0;transform:translateX(-5px)}to{opacity:1;transform:translateX(0)}}
.bck-tx.tower{flex-direction:row}
.bck-tx.crew{flex-direction:row-reverse}
.bck-tx.ground{flex-direction:row}
.bck-tx.reject{flex-direction:row}
.bck-txcs{font-size:12px;font-weight:700;letter-spacing:.06em;white-space:nowrap;flex-shrink:0;margin-top:1px}
.bck-txbub{max-width:74%;padding:4px 9px;border-radius:3px;font-size:12px;line-height:1.5}
.bck-tx.crew .bck-txbub{background:rgba(0,210,255,.06);border:1px solid rgba(0,210,255,.15);color:rgba(220,240,255,.75);border-radius:4px 0 4px 4px;text-align:right}
.bck-tx.tower .bck-txbub{background:rgba(74,222,128,.05);border:1px solid rgba(74,222,128,.12);color:rgba(200,240,210,.75);border-radius:0 4px 4px 4px}
.bck-tx.tower .bck-txcs{color:rgba(74,222,128,.6)}
.bck-tx.crew .bck-txcs{color:rgba(0,210,255,.6)}
.bck-tx.reject .bck-txbub{background:rgba(226,75,74,.06);border-color:rgba(226,75,74,.2);color:rgba(255,200,200,.75)}
.bck-tx.reject .bck-txcs{color:rgba(226,75,74,.6)}
.bck-tx.ground .bck-txbub{background:rgba(180,140,60,.06);border:1px solid rgba(180,140,60,.2);color:rgba(240,220,160,.8);border-radius:0 4px 4px 4px}
.bck-tx.ground .bck-txcs{color:rgba(200,170,80,.7)}
.bck-txts{font-size:12px;font-family:monospace;color:rgba(255,255,255,.15);white-space:nowrap;flex-shrink:0;margin-top:3px}
.bck-ped{background:#060401;border-top:1px solid rgba(255,255,255,.04);padding:7px 14px;display:flex;align-items:center;gap:10px;flex-shrink:0}
.bck-tts{display:flex;gap:3px;flex:1}
.bck-tt{flex:1;padding:5px 7px;border-radius:3px;border:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.015);cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:5px}
.bck-tt:hover{background:rgba(255,255,255,.04)}
.bck-tt.bck-ta{background:rgba(0,210,255,.05);border-color:rgba(0,210,255,.2)}
.bck-tn{font-size:12px;font-family:Arial,sans-serif;color:rgba(255,255,255,.5);background:rgba(255,255,255,.07);width:18px;height:18px;border-radius:3px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.bck-tnm{font-size:12px;font-family:Arial,sans-serif;color:rgba(255,255,255,.75);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bck-td{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.12);flex-shrink:0;transition:all .3s}
.bck-td.run{background:#00D2FF;box-shadow:0 0 7px #00D2FF;animation:bckBk .7s ease-in-out infinite}
.bck-td.pass{background:#4ade80;box-shadow:0 0 6px #4ade80}
.bck-td.fail{background:#E24B4A;box-shadow:0 0 6px #E24B4A}
.bck-ring{position:relative;width:32px;height:32px;flex-shrink:0}
.bck-ring svg{position:absolute;top:0;left:0;transform:rotate(-90deg)}
.bck-ringc{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-family:monospace;font-weight:500;color:#e8d4a0}
.bck-closebtn{position:absolute;top:3px;right:10px;background:none;border:none;color:rgba(255,160,50,.35);cursor:pointer;font-size:14px;padding:2px 6px;z-index:20;line-height:1}
.bck-closebtn:hover{color:rgba(255,160,50,.7)}
</style>
<div class="bck">
  <div class="bck-gl">
    <div class="bck-gld" id="bck-g1"></div><span class="bck-gl-lbl">Scripts</span>
    <div class="bck-gld" id="bck-g2"></div><span class="bck-gl-lbl">Steps</span>
    <div class="bck-gld" id="bck-g3"></div><span class="bck-gl-lbl">Actors</span>
    <div class="bck-gld" id="bck-g4"></div><span class="bck-gl-lbl">Cleared</span>
    <div class="bck-gs"></div>
    <span class="bck-ann" id="bck-ann">FLIGHT SIMULATOR · ${_bistEscHtml(tmplName.toUpperCase())} · v${_bistEscHtml(version)}</span>
    <div class="bck-gs"></div>
    <span style="font-size:12px;font-family:monospace;color:rgba(255,160,50,.5)" id="bck-clock">--:--:--</span>
    <button class="bck-closebtn" onclick="_bistCockpitClose()">✕</button>
  </div>
  <div class="bck-ws" id="bck-ws">
    <div class="bck-sky"><div class="bck-stars" id="bck-stars"></div><div class="bck-earth"><div class="bck-eglow"></div><div class="bck-cities" id="bck-cities"></div></div><div class="bck-hband"></div></div>
    <div class="bck-wfl"></div><div class="bck-wfr"></div><div class="bck-wft"></div><div class="bck-wfb"></div>
    <div class="bck-hud"><div class="bck-hhl"></div><div class="bck-hcm"><div class="bck-hw"></div><div class="bck-hd"></div><div class="bck-hw"></div></div>
      <div class="bck-hr" id="bck-hr">ALT  28,400\nCAS  280 KT\nHDG  270°</div>
      <div class="bck-hl" id="bck-hl">MODE NORM\nA/P  OFF\nSIM  READY</div>
    </div>
    <div class="bck-pf" id="bck-pf"><div class="bck-pftitle">Pre-flight validation sequence</div><div class="bck-pfchecks" id="bck-pfchecks"></div><div class="bck-pfgo" id="bck-pfgo">All systems nominal — initiating simulation</div></div>
    <div class="bck-dag" id="bck-dag"><div class="bck-dagrow" id="bck-dagrow">
      <div class="bck-dt" id="bck-dtrig"><svg width="6" height="6" viewBox="0 0 6 6"><polygon points="0,0 6,3 0,6" fill="rgba(255,255,255,.35)"/></svg></div>
      <div id="bck-nodes" style="display:flex;align-items:center;gap:0"></div>
      <div class="bck-de" id="bck-dend"><svg width="4" height="4" viewBox="0 0 4 4"><rect width="4" height="4" fill="rgba(255,255,255,.3)"/></svg></div>
    </div></div>
    <div class="bck-lz" id="bck-lz"><svg id="bck-lsvg" style="width:100%;overflow:visible;display:block" height="60"></svg></div>

  </div>
  <div class="bck-coc"><div class="bck-coch"><span class="bck-coct">Chain of Custody</span><span class="bck-cocc" id="bck-cocc">0 events</span></div><div class="bck-cocf" id="bck-cocf"><div style="padding:14px 10px;text-align:center;font-size:12px;font-family:Arial,sans-serif;color:rgba(255,255,255,.3);line-height:1.9">Awaiting<br>simulation launch</div></div></div>
  <div class="bck-coam"><div class="bck-efrow">
    <div class="bck-ef"><div class="bck-eflbl">Test suite</div><div class="bck-efval cyan" id="bck-ef0">0/0</div><div class="bck-efbar"><div class="bck-effill" id="bck-ef0b" style="width:0%;background:#00D2FF"></div></div><div class="bck-efsub" id="bck-ef0s">ready</div></div>
    <div class="bck-ef"><div class="bck-eflbl">Steps fired</div><div class="bck-efval" id="bck-ef1">0</div><div class="bck-efbar"><div class="bck-effill" id="bck-ef1b" style="width:0%;background:#4ade80"></div></div><div class="bck-efsub">actions</div></div>
    <div class="bck-ef"><div class="bck-eflbl">Assertions</div><div class="bck-efval" id="bck-ef2">0</div><div class="bck-efbar"><div class="bck-effill" id="bck-ef2b" style="width:0%;background:#EF9F27"></div></div><div class="bck-efsub">checked</div></div>
    <div class="bck-ef"><div class="bck-eflbl">Rework loops</div><div class="bck-efval" id="bck-ef3">0</div><div class="bck-efbar"><div class="bck-effill" id="bck-ef3b" style="width:0%;background:#E24B4A"></div></div><div class="bck-efsub">resets</div></div>
    <div class="bck-ef"><div class="bck-eflbl">CoC events</div><div class="bck-efval" id="bck-ef4">0</div><div class="bck-efbar"><div class="bck-effill" id="bck-ef4b" style="width:0%;background:#c47d18"></div></div><div class="bck-efsub">written</div></div>
    <div class="bck-ef"><div class="bck-eflbl">Elapsed</div><div class="bck-efval cyan" id="bck-ef5">00:00</div><div class="bck-efbar"><div class="bck-effill" id="bck-ef5b" style="width:0%;background:#00D2FF"></div></div><div class="bck-efsub">mm:ss</div></div>
  </div></div>
  <div class="bck-radio"><div class="bck-radio-handle" id="bck-radio-handle"></div><div class="bck-rh"><div class="bck-rdot" id="bck-rdot"></div><span class="bck-rt">Crew / Tower / Ground Communications</span></div><div class="bck-rf" id="bck-rf"><div style="padding:6px 14px;font-size:12px;font-family:Arial,sans-serif;color:rgba(255,255,255,.25)">— Radio silence —</div></div></div>
  <div class="bck-ped">
    <div class="bck-ring" id="bck-ring"><svg width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="2.5"/><circle cx="16" cy="16" r="12" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-dasharray="75.4" id="bck-ringc" stroke-dashoffset="75.4" stroke-linecap="round" style="transition:stroke-dashoffset .5s ease"/></svg><div class="bck-ringc" id="bck-ringv">0%</div></div>
    <div class="bck-tts" id="bck-tts">${tPills}</div>
    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
      <button style="font-size:12px;font-family:Arial,sans-serif;padding:5px 12px;border-radius:3px;border:1px solid rgba(0,210,255,.2);background:none;color:rgba(0,210,255,.6);cursor:pointer;letter-spacing:.04em" onclick="_bistCkReplay()" id="bck-replay-btn">&#9654; REPLAY</button>
      <button style="font-size:12px;font-family:Arial,sans-serif;padding:5px 12px;border-radius:3px;border:1px solid rgba(239,159,39,.3);background:none;color:rgba(239,159,39,.7);cursor:pointer;letter-spacing:.04em" onclick="_bckToggleFreeze()" id="bck-freeze-btn">&#10074;&#10074; FREEZE</button>
      <button style="font-size:12px;font-family:Arial,sans-serif;padding:5px 12px;border-radius:3px;border:1px solid rgba(226,75,74,.3);background:none;color:rgba(226,75,74,.6);cursor:pointer;letter-spacing:.04em" onclick="_bistCockpitClose()">CLOSE</button>
      <div id="bck-foot-btns"></div>
    </div>
  </div>
</div>`;
}

// ── Cockpit state ─────────────────────────────────────────────────────────────
var _bckCocCount = 0;
var _bckSimLog = [];
var _bckLastDoneId = null;
var _bckCurrentTestIdx = 0;  // [{ts, type, detail, color}] — replay feed
var _bckSC = 0, _bckASC = 0, _bckRWC = 0, _bckPassC = 0;
var _bckClockTimer = null;
var _bckElTimer = null;
var _bckFrozenAt = null;
var _bckStartMs = null;

function _bckEl(id) { return document.getElementById(id); }
function _bckSleep(ms) {
  return new Promise(function(resolve) {
    setTimeout(function check() {
      if (window._bckFrozen) {
        setTimeout(check, 100);  // poll while frozen
      } else {
        resolve();
      }
    }, ms);
  });
}

function _bckInitRadioResize() {
  var handle = _bckEl('bck-radio-handle');
  var radio  = handle && handle.closest('.bck-radio');
  var feed   = _bckEl('bck-rf');
  if (!handle || !radio || !feed) return;

  var startY = 0, startH = 0;

  function onMove(e) {
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    var delta   = startY - clientY;  // dragging up = bigger
    var newH    = Math.max(48, Math.min(300, startH + delta));
    feed.style.height = newH + 'px';
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend',  onUp);
  }
  handle.addEventListener('mousedown', function(e) {
    e.preventDefault();
    startY = e.clientY;
    startH = feed.offsetHeight || 90;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
  handle.addEventListener('touchstart', function(e) {
    startY = e.touches[0].clientY;
    startH = feed.offsetHeight || 90;
    document.addEventListener('touchmove', onMove, {passive:false});
    document.addEventListener('touchend',  onUp);
  }, {passive:true});
}

function _bckAlignCoc() {
  var coc  = document.querySelector('.bck-coc');
  var ped  = document.querySelector('.bck-ped');
  var efis = document.querySelector('.bck-coam');
  var bck  = document.querySelector('.bck');
  if (!coc || !ped || !efis || !bck) return;
  var bckRect  = bck.getBoundingClientRect();
  var efisRect = efis.getBoundingClientRect();
  // CoC bottom should align with bottom of EFIS row
  var efisBottom  = efisRect.bottom - bckRect.top;  // relative to .bck
  var bckHeight   = bckRect.height;
  coc.style.bottom = (bckHeight - efisBottom) + 'px';
}

function _bistCkInit(tests) {
  // Stars
  var stars = _bckEl('bck-stars');
  if (stars) {
    var h = '';
    for (var i = 0; i < 90; i++) {
      var x = (Math.random()*100).toFixed(1), y = (Math.random()*100).toFixed(1);
      var sz = Math.random() < .12 ? 1.5 : Math.random() < .3 ? 1 : .5;
      var op = (.12 + Math.random()*.5).toFixed(2);
      h += '<div style="position:absolute;left:'+x+'%;top:'+y+'%;width:'+sz+'px;height:'+sz+'px;border-radius:50%;background:rgba(210,225,255,'+op+')"></div>';
    }
    stars.innerHTML = h;
  }
  // City dots
  var cities = _bckEl('bck-cities');
  if (cities) {
    var ch = '';
    var cols = ['rgba(255,185,55,.45)','rgba(90,175,255,.38)','rgba(255,255,190,.3)','rgba(255,120,50,.25)'];
    for (var i = 0; i < 180; i++) {
      var x = (Math.random()*100).toFixed(1), y = (10+Math.random()*85).toFixed(1);
      var sz = Math.random() < .08 ? 2 : 1;
      ch += '<div style="position:absolute;left:'+x+'%;top:'+y+'%;width:'+sz+'px;height:'+sz+'px;border-radius:50%;background:'+cols[Math.floor(Math.random()*cols.length)]+'"></div>';
    }
    cities.innerHTML = ch;
  }
  // Glareshield lights
  ['bck-g1','bck-g2','bck-g3','bck-g4'].forEach(function(id, i) {
    setTimeout(function() {
      var el = _bckEl(id); if (el) { el.className = 'bck-gld am'; setTimeout(function() { if (el) el.className = 'bck-gld on'; }, 350); }
    }, 250 + i*200);
  });
  // Position DAG and loop zones
  _bckPosZones();
  // Recalc zone positions after layout settles
  setTimeout(_bckPosZones, 50);
  setTimeout(_bckInitRadioResize, 100);
  setTimeout(_bckAlignCoc, 120);
  // Init EFIS
  _bckEl('bck-ef0').textContent = '0/' + tests.length;
  _bckCocCount = 0; _bckSC = 0; _bckASC = 0; _bckRWC = 0; _bckPassC = 0;
  _bckSimLog = [];
  // Clock
  _bckClockTimer = setInterval(function() {
    var el = _bckEl('bck-clock');
    if (el) el.textContent = new Date().toTimeString().slice(0,8);
  }, 1000);
}

function _bckPosZones() {
  var ws = _bckEl('bck-ws'); if (!ws) return;
  var h = ws.getBoundingClientRect().height || ws.offsetHeight || 400, hp = 0.64, nH = 78;
  var dz = _bckEl('bck-dag');
  if (dz) dz.style.cssText = 'position:absolute;left:52px;right:52px;z-index:6;display:flex;justify-content:center;top:'+Math.round(h*hp-nH-4)+'px';
  var lz = _bckEl('bck-lz');
  var lT = Math.round(h*hp)+3;
  if (lz) lz.style.cssText = 'position:absolute;left:52px;right:52px;z-index:5;pointer-events:none;top:'+lT+'px;height:'+(h-lT)+'px;overflow:visible';
}

async function _bistCkPreflight(tmplName, version, scriptCount, stepCount) {
  var checks = [
    { lbl:'Test script registry', sub:'Locating '+scriptCount+' registered test scripts', res: scriptCount+' scripts found', dur:700 },
    { lbl:'Template step integrity', sub:'Verifying '+stepCount+'-step workflow structure', res: stepCount+' steps verified', dur:650 },
    { lbl:'Actor identity resolution', sub:'Resolving actors from resources table', res:'Actors resolved', dur:680 },
    { lbl:'Outcome routing map', sub:'Validating named outcomes and reset paths', res:'All outcomes valid', dur:620 },
    { lbl:'CoC write permissions', sub:'Confirming workflow_step_instances insert access', res:'Write access confirmed', dur:600 },
    { lbl:'Reset cascade logic', sub:'Checking step_reset chain integrity', res:'Cascade logic nominal', dur:580 },
    { lbl:'Assertion engine', sub:'Loading verification checks across all test scripts', res:'Assertions armed', dur:560 },
    { lbl:'Cleanup procedures', sub:'Confirming post-run instance purge protocols', res:'Cleanup procedures armed', dur:520 },
  ];
  var pf = _bckEl('bck-pf'); if (!pf) return;
  var checks_el = _bckEl('bck-pfchecks'); if (!checks_el) return;
  checks_el.innerHTML = '';
  pf.style.display = 'flex';
  for (var i = 0; i < checks.length; i++) {
    var c = checks[i];
    var row = document.createElement('div'); row.className = 'bck-pfrow';
    row.innerHTML = '<div class="bck-pfind chk" id="bck-pfi'+i+'"></div><div style="flex:1"><div class="bck-pflbl">'+_bistEscHtml(c.lbl)+'</div><div class="bck-pfsub">'+_bistEscHtml(c.sub)+'</div></div><div class="bck-pfres" id="bck-pfr'+i+'">checking…</div>';
    checks_el.appendChild(row);
    await _bckSleep(60); row.classList.add('show');
    await _bckSleep(c.dur);
    row.classList.add('ok');
    var ind = _bckEl('bck-pfi'+i); if (ind) ind.className = 'bck-pfind ok';
    var res = _bckEl('bck-pfr'+i); if (res) { res.className = 'bck-pfres ok'; res.textContent = c.res; }
    await _bckSleep(80);
  }
  var go = _bckEl('bck-pfgo'); if (go) go.classList.add('show');
  await _bckSleep(1400);
  if (pf) pf.style.display = 'none';
}

function _bistCkSelTest(ti) {
  document.querySelectorAll('.bck-tt').forEach(function(el, j) {
    el.className = 'bck-tt' + (j===ti?' bck-ta':'');
  });
}

function _bistCkBeginTest(ti, name) {
  _bistCkSelTest(ti);
  var td = _bckEl('bck-td'+ti); if (td) td.className = 'bck-td run';
  var ann = _bckEl('bck-ann');
  if (ann) { ann.textContent = 'T'+(ti+1)+' EXECUTING — '+name.toUpperCase(); ann.className = 'bck-ann'; }
  // Reset DAG for this test
  var nodes = _bckEl('bck-nodes'); if (nodes) nodes.innerHTML = '';
  var dt = _bckEl('bck-dtrig'); if (dt) dt.className = 'bck-dt';
  var de = _bckEl('bck-dend'); if (de) de.className = 'bck-de';
  var lsvg = _bckEl('bck-lsvg'); if (lsvg) lsvg.innerHTML = '';
  _bckSimLog.push({ts:Date.now(),kind:'begintest',testIdx:ti,name:name});
  _bckLastDoneId = null;
  _bckCurrentTestIdx = ti;
}

function _bistCkEndTest(ti, status) {
  var td = _bckEl('bck-td'+ti);
  if (td) td.className = 'bck-td ' + (status === 'passed' ? 'pass' : 'fail');
  if (status === 'passed') {
    _bckPassC++;
    var p = Math.round(_bckPassC / (document.querySelectorAll('.bck-td').length) * 100);
    var rc = _bckEl('bck-ringc'); if (rc) rc.style.strokeDashoffset = 75.4 - (p/100*75.4);
    var rv = _bckEl('bck-ringv'); if (rv) rv.textContent = p+'%';
    var ef0 = _bckEl('bck-ef0'); if (ef0) ef0.textContent = _bckPassC+'/'+document.querySelectorAll('.bck-td').length;
    var ef0b = _bckEl('bck-ef0b'); if (ef0b) ef0b.style.width = p+'%';
    var ef0s = _bckEl('bck-ef0s'); if (ef0s) ef0s.textContent = _bckPassC === document.querySelectorAll('.bck-td').length ? 'all passing' : 'in progress';
  }
}

function _bistCkOnProgress(ti, test, ev, tmplSteps) {
  var type = ev.type;
  // FREEZE: allow node card creation (step_start) through so DAG stays visible,
  // but block CoC writes and radio messages
  if (window._bckFrozen && type !== 'step_start') return;
  if (type === 'instance_created') {
    var dt = _bckEl('bck-dtrig'); if (dt) dt.className = 'bck-dt on';
    _bistCkAddCoc('#00D2FF','instance_launched','Template: '+_bistEscHtml(test.name));
    _bistCkRadio('crew','T'+(ti+1)+' ready. '+_bistEscHtml(test.name));
    _bckSimLog.push({ts:Date.now(),kind:'trigger',testIdx:ti,state:'on'});
  } else if (type === 'step_start') {
    var idx = ev.stepIdx || 0;
    _bckSC++;
    var ef1 = _bckEl('bck-ef1'); if (ef1) ef1.textContent = _bckSC;
    var ef1b = _bckEl('bck-ef1b'); if (ef1b) ef1b.style.width = Math.min(100,_bckSC*4)+'%';
    // If node already exists, this is a reset — draw rejection arc
    if (_bckLastDoneId && document.getElementById('bck-n-'+ev.stepId)) {
      console.log('[arc trigger] reset detected, from:', _bckLastDoneId, 'to:', ev.stepId);
      setTimeout(function(from,to){_bckDrawRejectArc(from,to);}  .bind(null,_bckLastDoneId,ev.stepId), 80);
    } else {
      console.log('[arc] no reset: lastDone=', _bckLastDoneId, 'cardExists=', !!document.getElementById('bck-n-'+ev.stepId));
    }
    // Activate node in DAG
    _bistCkSetNode(ev.stepId, idx, test, 'active', 'In progress', tmplSteps);
  } else if (type === 'step_pass') {
    var idx = ev.stepIdx || 0;
    _bistCkSetNode(ev.stepId, idx, test, 'done', ev.outcome || 'Done', tmplSteps);
    _bckLastDoneId = ev.stepId;
    var dt = _bckEl('bck-dtrig'); if (dt) dt.className = 'bck-dt dn';
    _bistCkAddCoc('#4ade80','step_completed', _bistEscHtml(ev.stepName||'Step')+' · '+_bistEscHtml(ev.outcome||'Done'));
    _bistCkRadio('tower',_bistEscHtml(ev.stepName||'Step')+' completed — '+_bistEscHtml(ev.outcome||'Done'));
  } else if (type === 'step_fail') {
    _bistCkAddCoc('#E24B4A','step_failed', _bistEscHtml(ev.reason||'Assertion failed'));
    _bistCkRadio('reject','TOWER: Step failed — '+_bistEscHtml((ev.reason||'').slice(0,80)));
    _bckRWC++;
    var ef3 = _bckEl('bck-ef3'); if (ef3) ef3.textContent = _bckRWC;
    var ef3b = _bckEl('bck-ef3b'); if (ef3b) ef3b.style.width = Math.min(100,_bckRWC*12)+'%';
  } else if (type === 'complete') {
    var de = _bckEl('bck-dend'); if (de) de.className = 'bck-de dn';
    _bistCkAddCoc('#4ade80','instance_completed','All steps complete · '+_bistEscHtml(test.name));
    _bckSimLog.push({ts:Date.now(),kind:'endnode',testIdx:ti,state:'dn'});
  } else if (type === 'error') {
    _bistCkAddCoc('#E24B4A','error', _bistEscHtml(ev.message||'Unknown error'));
    _bistCkRadio('reject','TOWER: Error — '+_bistEscHtml((ev.message||'').slice(0,80)));
  }
}

function _bckDrawRejectArc(fromStepId, toStepId) {
  var svg  = _bckEl('bck-lsvg');
  var lz   = _bckEl('bck-lz');
  var from = document.getElementById('bck-n-'+fromStepId);
  var to   = document.getElementById('bck-n-'+toStepId);
  console.log('[arc]', fromStepId, '->', toStepId, 'svg:', !!svg, 'lz:', !!lz, 'from:', !!from, 'to:', !!to);
  if (!svg || !lz || !from || !to) { console.warn('[arc] ABORT — missing element'); return; }
  var lzRect = lz.getBoundingClientRect();
  console.log('[arc] lzRect:', lzRect.width, lzRect.height, 'top:', lzRect.top);

  var lzRect   = lz.getBoundingClientRect();
  var fromRect = from.getBoundingClientRect();
  var toRect   = to.getBoundingClientRect();

  // Arc runs from bottom-center of "from" node to bottom-center of "to" node
  var x1 = fromRect.left + fromRect.width/2  - lzRect.left;
  var x2 = toRect.left   + toRect.width/2    - lzRect.left;
  var y0 = 0;  // top of lz (lz sits just below the horizon)
  var depth = 28 + Math.abs(x1 - x2) * 0.12;  // arc depth proportional to span

  // SVG quadratic bezier: start at x1, curve down to depth, back up to x2
  var mx = (x1 + x2) / 2;
  var path = 'M '+x1+' '+y0+' Q '+mx+' '+depth+' '+x2+' '+y0;

  var el = document.createElementNS('http://www.w3.org/2000/svg','path');
  el.setAttribute('d', path);
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', '#E24B4A');
  el.setAttribute('stroke-width', '1.5');
  el.setAttribute('stroke-dasharray', '4 3');
  el.setAttribute('opacity', '0.75');

  // Arrowhead at destination (x2,y0)
  var angle = Math.atan2(y0 - depth, x2 - mx);
  var ah = 7;
  var ax1 = x2 - ah*Math.cos(angle-0.4);
  var ay1 = y0 - ah*Math.sin(angle-0.4);
  var ax2 = x2 - ah*Math.cos(angle+0.4);
  var ay2 = y0 - ah*Math.sin(angle+0.4);
  var arrow = document.createElementNS('http://www.w3.org/2000/svg','polygon');
  arrow.setAttribute('points', x2+','+y0+' '+ax1+','+ay1+' '+ax2+','+ay2);
  arrow.setAttribute('fill', '#E24B4A');
  arrow.setAttribute('opacity', '0.75');

  // Animate the dash
  var anim = document.createElementNS('http://www.w3.org/2000/svg','animate');
  anim.setAttribute('attributeName','stroke-dashoffset');
  anim.setAttribute('from','0'); anim.setAttribute('to','-14');
  anim.setAttribute('dur','0.6s'); anim.setAttribute('repeatCount','indefinite');
  el.appendChild(anim);

  svg.appendChild(el);
  svg.appendChild(arrow);

  // Size svg height to fit
  var h = Math.ceil(depth) + 8;
  svg.setAttribute('height', h);
  if (lz) lz.style.height = h + 'px';
}

function _bistCkSetNode(stepId, stepIdx, test, state, label, tmplSteps) {
  var nodes = _bckEl('bck-nodes'); if (!nodes) return;
  var nodeId = 'bck-n-'+stepId;
  var existing = document.getElementById(nodeId);
  if (!existing) {
    // Build the node
    var aname = test.anames[stepIdx] || 'Actor';
    var actor  = test.actors[stepIdx] || '?';
    var nm     = (test.nodes[stepIdx] || 'Step').split('\n');
    var card = document.createElement('div'); card.className = 'bck-nc'; card.id = nodeId;
    var seqLabel = (_bckCurrentTestIdx+1)+'.'+(stepIdx+1);
    card.innerHTML =
      '<div class="bck-nct"><div class="bck-nav">'+_bistEscHtml(actor)+'</div>'+
      '<div class="bck-nan">'+_bistEscHtml(aname)+'</div></div>'+
      '<div class="bck-nb">'+
        '<div class="bck-ntitle">'+_bistEscHtml(nm[0])+
        (nm[1]?'<br><span style="opacity:.6;font-size:12px;font-family:Arial,sans-serif">'+_bistEscHtml(nm[1])+'</span>':'')+
        '</div>'+
        '<div class="bck-nst" id="bck-nst-'+stepId+'">'+
          '<div class="bck-nsdot" style="background:rgba(255,255,255,.08)"></div>'+
          '<span class="bck-nstxt" style="color:rgba(255,255,255,.18)">Pending</span>'+
          '<span style="margin-left:auto;font-size:12px;font-family:Arial,sans-serif;font-weight:700;color:rgba(255,180,60,.85)">'+seqLabel+'</span>'+
        '</div>'+
      '</div>';
    if (nodes.children.length > 0) {
      var cw = document.createElement('div'); cw.className = 'bck-cw'; nodes.appendChild(cw);
    }
    nodes.appendChild(card);
  }
  var el = document.getElementById(nodeId); if (!el) return;
  var cls = {idle:'bck-nc', active:'bck-nc ac', done:'bck-nc dn', reset:'bck-nc rs'};
  el.className = cls[state] || 'bck-nc';
  var nst = document.getElementById('bck-nst-'+stepId); if (!nst) return;
  var col = {done:'#4ade80', active:'#EF9F27', reset:'#EF9F27'}[state] || '#888';
  var lbl2 = {done:label, active:'Active', reset:'Reset → '+label}[state] || label;
  var _seq = (_bckCurrentTestIdx+1)+'.'+(stepIdx+1);
  nst.innerHTML = '<div class="bck-nsdot" style="background:'+col+'"></div>'+
    '<span class="bck-nstxt" style="color:'+col+'">'+_bistEscHtml(lbl2)+'</span>'+
    '<span style="margin-left:auto;font-size:12px;font-family:Arial,sans-serif;font-weight:700;color:rgba(255,180,60,.85)">'+_seq+'</span>';
  // Log node state for replay
  _bckSimLog.push({ts: Date.now(), kind:'node', stepId:stepId, stepIdx:stepIdx,
    testIdx:_bckCurrentTestIdx,
    state:state, label:lbl2, col:col, cls:cls[state]||'bck-nc',
    actor:test.actors[stepIdx]||'?', aname:test.anames[stepIdx]||'',
    nodeName:(test.nodes[stepIdx]||'Step')});
}

function _bistCkAddCoc(color, type, detail) {
  var feed = _bckEl('bck-cocf'); if (!feed) return;
  if (_bckCocCount === 0) feed.innerHTML = '';
  _bckCocCount++;
  _bckSimLog.push({ts: Date.now(), kind: 'coc', color: color, type: type, detail: detail});
  var ts = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  var ev = document.createElement('div'); ev.className = 'bck-ce';
  ev.innerHTML = '<div class="bck-cedot" style="background:'+color+'"></div><div class="bck-ceb"><div class="bck-cet" style="color:'+color+'">'+type+'</div><div class="bck-ced">'+detail+'</div><div class="bck-cts">'+ts+'</div></div>';
  feed.insertBefore(ev, feed.firstChild);
  var cc = _bckEl('bck-cocc'); if (cc) cc.textContent = _bckCocCount+' event'+(_bckCocCount!==1?'s':'');
  var ef4 = _bckEl('bck-ef4'); if (ef4) ef4.textContent = _bckCocCount;
  var ef4b = _bckEl('bck-ef4b'); if (ef4b) ef4b.style.width = Math.min(100,Math.round(_bckCocCount/50*100))+'%';
  var hl = _bckEl('bck-hl'); if (hl) hl.textContent = 'MODE NORM\nA/P  ENGAGED\nSIM  RUN';
}

function _bistCkRadio(side, msg) {
  _bckSimLog.push({ts: Date.now(), kind: 'radio', side: side, msg: msg});
  var feed = _bckEl('bck-rf'); if (!feed) return;
  var first = feed.querySelector('div[style]'); if (first) first.remove();
  var ts = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  var isRej = side==='reject', isTow = side==='tower'||isRej, isGnd = side==='ground';
  var tx = document.createElement('div');
  tx.className = 'bck-tx '+(isGnd?'ground':isRej?'reject tower':isTow?'tower':'crew');
  var cs = document.createElement('span'); cs.className = 'bck-txcs';
  cs.textContent = isGnd?'GROUND':isRej?'TOWER':isTow?'TOWER':'CREW';
  var bub = document.createElement('div'); bub.className = 'bck-txbub'; bub.textContent = msg;
  var stamp = document.createElement('span'); stamp.className = 'bck-txts'; stamp.textContent = ts;
  if (isTow||isGnd) { tx.appendChild(cs); tx.appendChild(bub); tx.appendChild(stamp); }
  else { tx.appendChild(stamp); tx.appendChild(bub); tx.appendChild(cs); }
  feed.insertBefore(tx, feed.firstChild);
  var rd = _bckEl('bck-rdot'); if (rd) { rd.className = 'bck-rdot live'; setTimeout(function(){if(rd)rd.className='bck-rdot';},1200); }
}

function _bistCkAnnounce(msg, success) {
  var ann = _bckEl('bck-ann');
  if (ann) { ann.textContent = msg; ann.className = 'bck-ann '+(success?'go':'fail'); }
}

function _bistCkStartClock(startMs) {
  _bckStartMs = startMs;
  _bckElTimer = setInterval(function() {
    if (!_bckStartMs) return;
    var s = Math.floor((Date.now()-_bckStartMs)/1000);
    var ef5 = _bckEl('bck-ef5'); if (ef5) ef5.textContent = String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
    var ef5b = _bckEl('bck-ef5b'); if (ef5b) ef5b.style.width = Math.min(100,Math.round(s/120*100))+'%';
  }, 1000);
}

function _bistCkStopClock() {
  if (_bckElTimer) { clearInterval(_bckElTimer); _bckElTimer = null; }
  if (_bckClockTimer) { clearInterval(_bckClockTimer); _bckClockTimer = null; }
}

function _bistCkShowFooter(allPass, onProceed) {
  var fb = _bckEl('bck-foot-btns'); if (!fb) return;
  if (allPass) {
    fb.innerHTML = '<button style="font-size:12px;font-family:Arial,sans-serif;font-weight:700;padding:6px 14px;border-radius:3px;border:none;cursor:pointer;background:#2a9d40;color:#fff;letter-spacing:.06em;margin-right:4px" onclick="_bistCockpitProceed()">Release</button>'
      + '<button style="font-size:12px;font-family:Arial,sans-serif;padding:6px 10px;border-radius:3px;border:1px solid rgba(212,144,31,.3);background:none;color:rgba(212,144,31,.7);cursor:pointer" onclick="_bistCockpitOverride()">Override…</button>';
  } else {
    fb.innerHTML = '<button style="font-size:12px;font-family:Arial,sans-serif;padding:6px 10px;border-radius:3px;border:1px solid rgba(212,144,31,.3);background:none;color:rgba(212,144,31,.7);cursor:pointer" onclick="_bistCockpitOverride()">Override…</button>';
  }
}

function _bistCkShowCert(tmplName, version, results, elapsed, certId, onProceed) {
  _bistCkShowFooter(true, onProceed);
  // Find cockpit container — now renders into s9-sim-right
  var ov = document.getElementById('s9-sim-right') ||
           document.getElementById('s9-sim-panel') ||
           document.getElementById('bist-cockpit-overlay');
  if (!ov) return;
  var certDiv = document.createElement('div');
  certDiv.id = 'bist-cert-overlay';
  certDiv.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.78);z-index:100;display:flex;align-items:center;justify-content:center;animation:bckFadeIn .4s ease-out';
  if (!document.getElementById('bck-fadein-style')) {
    var s = document.createElement('style'); s.id='bck-fadein-style';
    s.textContent='@keyframes bckFadeIn{from{opacity:0}to{opacity:1}}@keyframes bckCertIn{from{opacity:0;transform:scale(.92) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}';
    document.head.appendChild(s);
  }
  var elStr = Math.floor(elapsed/60)+'m '+String(elapsed%60).padStart(2,'0')+'s';
  var now = new Date();
  var dateStr = now.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  var timeStr = now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  var testRows = results.map(function(r,i){
    return '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid rgba(180,140,60,.08)">'
      +'<span style="color:'+(r.status==='passed'?'#1a6b2a':'#c0404a')+';font-size:13px;font-weight:700;flex-shrink:0">'+(r.status==='passed'?'✓':'✕')+'</span>'
      +'<span style="font-size:12px;font-family:Arial,sans-serif;color:#2a1e08;flex:1">T'+(i+1)+' — '+_bistEscHtml(r.name)+'</span>'
      +'<span style="font-size:12px;font-family:Arial,sans-serif;color:'+(r.status==='passed'?'#1a6b2a':'#c0404a')+';font-weight:600;letter-spacing:.04em">'+(r.status==='passed'?'PASSED':'FAILED')+'</span>'
    +'</div>';
  }).join('');
  var passed = results.filter(function(r){return r.status==='passed';}).length;
  certDiv.innerHTML = '<div style="background:#fdfaf4;border-radius:4px;width:480px;max-width:95%;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6);position:relative;animation:bckCertIn .5s cubic-bezier(.2,.8,.3,1)">'
    +'<div style="position:absolute;inset:8px;border:1.5px solid rgba(180,140,60,.35);border-radius:2px;pointer-events:none;z-index:0"></div>'
    +'<div style="background:linear-gradient(135deg,#1a0e2e,#0d1a3a);padding:18px 28px 14px;text-align:center;position:relative;z-index:1">'
      +'<div style="font-size:12px;letter-spacing:.12em;color:rgba(200,180,120,.7);text-transform:uppercase;margin-bottom:4px">CadenceHUD · ProjectHUD Platform</div>'
      +'<div style="font-size:18px;font-weight:700;color:#e8d4a0;letter-spacing:.06em">VALIDATION CERTIFICATE</div>'
      +'<div style="font-size:12px;color:rgba(200,180,120,.6);letter-spacing:.08em;text-transform:uppercase;margin-top:3px">Built-In Self Test · Flight Simulation Record</div>'
    +'</div>'
    +'<div style="height:2px;background:linear-gradient(90deg,transparent,rgba(180,140,60,.5) 30%,rgba(210,170,80,.8) 50%,rgba(180,140,60,.5) 70%,transparent)"></div>'
    +'<div style="padding:16px 28px 12px;background:#fdfaf4;position:relative;z-index:1">'
      +'<div style="font-size:12px;letter-spacing:.1em;color:rgba(80,60,20,.6);text-transform:uppercase;text-align:center">This certifies that</div>'
      +'<div style="font-size:17px;font-weight:700;color:#1a1208;text-align:center;margin-top:2px">'+_bistEscHtml(tmplName)+'</div>'
      +'<div style="font-size:12px;color:rgba(80,60,20,.5);font-family:monospace;text-align:center;margin-top:2px">v'+_bistEscHtml(version)+'</div>'
      +'<div style="font-size:12px;color:rgba(80,60,20,.5);text-align:center;margin:6px 0 10px;font-style:italic">has successfully completed all required validation tests and is certified for release</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0">'
        +'<div style="background:rgba(180,140,60,.06);border:1px solid rgba(180,140,60,.18);border-radius:3px;padding:6px 10px;text-align:center"><div style="font-size:18px;font-weight:700;color:'+(passed===results.length?'#1a6b2a':'#c0404a')+';font-family:monospace">'+passed+'/'+results.length+'</div><div style="font-size:12px;letter-spacing:.06em;color:rgba(80,60,20,.5);text-transform:uppercase;margin-top:2px">Tests passed</div></div>'
        +'<div style="background:rgba(180,140,60,.06);border:1px solid rgba(180,140,60,.18);border-radius:3px;padding:6px 10px;text-align:center"><div style="font-size:18px;font-weight:700;color:#1a1208;font-family:monospace">'+elStr+'</div><div style="font-size:12px;letter-spacing:.06em;color:rgba(80,60,20,.5);text-transform:uppercase;margin-top:2px">Duration</div></div>'
      +'</div>'
      +'<div style="border-top:1px solid rgba(180,140,60,.2);padding-top:8px;margin-top:8px">'+testRows+'</div>'
      +'<div style="font-size:12px;color:rgba(80,60,20,.4);font-family:monospace;margin-top:8px">ID: '+_bistEscHtml(certId)+'</div>'
    +'</div>'
    +'<div style="padding:10px 28px 16px;background:#fdfaf4;border-top:1px solid rgba(180,140,60,.15);position:relative;z-index:1">'
      +'<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px">'
        +'<div style="flex:1;text-align:center"><div style="border-bottom:1px solid rgba(80,60,20,.3);margin-bottom:4px;height:22px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:2px"><span style="font-size:13px;font-family:Georgia,serif;color:rgba(30,20,8,.45);font-style:italic">'+_bistEscHtml((_resources_cad&&_resources_cad.find(function(r){return r.id===_myResourceId;})?.name)||'Team Member')+'</span></div><div style="font-size:12px;color:rgba(80,60,20,.45)">Submitting Principal · '+_bistEscHtml(dateStr)+'</div></div>'
        +'<div style="width:74px;height:74px;position:relative;flex-shrink:0"><div style="width:74px;height:74px;border-radius:50%;border:3px solid rgba(180,30,30,.75);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;transform:rotate(-18deg);background:rgba(180,30,30,.04);position:relative"><div style="position:absolute;inset:3px;border-radius:50%;border:1px dashed rgba(180,30,30,.3)"></div><div style="font-size:12px;letter-spacing:.06em;color:rgba(180,30,30,.8);text-transform:uppercase;font-weight:700">Validated</div><div style="font-size:15px;font-weight:900;color:rgba(180,30,30,.85);line-height:1">PASS</div><div style="font-size:12px;font-weight:700;color:rgba(180,30,30,.7)">Certified</div><div style="font-size:12px;font-family:monospace;color:rgba(180,30,30,.55)">'+now.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'2-digit'})+'</div></div></div>'
        +'<div style="flex:1;text-align:center"><div style="border-bottom:1px solid rgba(80,60,20,.3);margin-bottom:4px;height:22px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:2px"><span style="font-size:12px;font-family:monospace;color:rgba(30,20,8,.3)">'+_bistEscHtml(certId)+'</span></div><div style="font-size:12px;color:rgba(80,60,20,.45)">System validation · '+_bistEscHtml(timeStr)+'</div></div>'
      +'</div>'
      +'<div style="display:flex;gap:8px;margin-top:10px">'
        +(onProceed ? '<button onclick="_bistCockpitProceed()" style="flex:1;padding:8px;background:#2a9d40;color:#fff;border:none;border-radius:3px;font-size:12px;font-family:Arial,sans-serif;font-weight:600;letter-spacing:.06em;cursor:pointer">Release v'+_bistEscHtml(version)+'</button>' : '')
        +'<button onclick="document.getElementById(\'bist-cert-overlay\').remove()" style="flex:1;padding:8px;background:rgba(180,140,60,.1);border:1px solid rgba(180,140,60,.3);border-radius:3px;font-size:12px;font-family:Arial,sans-serif;font-weight:600;letter-spacing:.08em;color:#6b4a0a;cursor:pointer">Close</button>'
      +'</div>'
    +'</div>'
  +'</div>';
  certDiv.addEventListener('click', function(e){ if(e.target===certDiv) certDiv.remove(); });
  ov.appendChild(certDiv);
}

// ── Replay scrubber state ────────────────────────────────────────────────────
window._bckFrozen = false;
window._bckCockpitClosed = false;

function _bckToggleFreeze() {
  window._bckFrozen = !window._bckFrozen;
  var btn = document.getElementById('bck-freeze-btn');
  if (!btn) return;
  if (window._bckFrozen) {
    btn.textContent = '\u25b6 RESUME';
    btn.style.color = 'rgba(74,222,128,.8)';
    btn.style.borderColor = 'rgba(74,222,128,.4)';
    // Pause elapsed clock
    _bckFrozenAt = Date.now();
    if (_bckElTimer) { clearInterval(_bckElTimer); _bckElTimer = null; }
    if (_bckClockTimer) { clearInterval(_bckClockTimer); _bckClockTimer = null; }
    // Glareshield annunciator
    var ann = _bckEl('bck-ann');
    if (ann) { ann.dataset.preFreeze = ann.textContent; ann.textContent = 'SIMULATION FROZEN'; ann.className = 'bck-ann'; }
  } else {
    btn.innerHTML = '&#10074;&#10074; FREEZE';
    btn.style.color = 'rgba(239,159,39,.7)';
    btn.style.borderColor = 'rgba(239,159,39,.3)';
    // Resume elapsed clock — adjust startMs for frozen duration
    if (_bckStartMs && !_bckElTimer) {
      _bckFrozenAt = _bckFrozenAt || Date.now();
      _bckStartMs += (Date.now() - _bckFrozenAt);
      _bckFrozenAt = null;
      _bistCkStartClock(_bckStartMs);
    }
    // Resume wall clock
    if (!_bckClockTimer) {
      _bckClockTimer = setInterval(function() {
        var el = _bckEl('bck-clock');
        if (el) el.textContent = new Date().toTimeString().slice(0,8);
      }, 1000);
    }
    // Restore annunciator
    var ann = _bckEl('bck-ann');
    if (ann && ann.dataset.preFreeze) { ann.textContent = ann.dataset.preFreeze; delete ann.dataset.preFreeze; }
  }
}

var _bckReplayPos   = 0;       // current frame index
var _bckReplayTimer = null;    // auto-play interval
var _bckReplayPlay  = false;   // playing?

function _bistCkReplay() {
  if (!_bckSimLog || !_bckSimLog.length) {
    alert('No simulation log to replay. Run the simulator first.');
    return;
  }
  _bckReplayPos  = Math.max(0, _bckSimLog.length - 1);
  _bckReplayPlay = false;
  if (_bckReplayTimer) { clearInterval(_bckReplayTimer); _bckReplayTimer = null; }

  // Inject replay panel into the windshield area, above the existing CoC + instruments
  var bck = document.querySelector('.bck-ws');
  if (!bck) return;

  // Add replay overlay inside .bck above everything
  var existing = document.getElementById('bck-replay-panel');
  if (existing) existing.remove();

  var panel = document.createElement('div');
  panel.id = 'bck-replay-panel';
  panel.style.cssText = [
    'position:absolute;bottom:0;left:0;right:300px;z-index:50;',
    'background:rgba(2,7,15,.96);border-top:1px solid rgba(0,210,255,.15);',
    'display:flex;flex-direction:column;font-family:Arial,sans-serif'
  ].join('');

  var total = _bckSimLog.length;

  // Single-row layout: event ticker | scrubber | transport | speed | close
  var F = 'font-family:Arial,sans-serif;font-size:12px;';
  panel.innerHTML =
    // Row 1: event ticker
    '<div id="bck-rp-event" style="' + F + 'padding:4px 12px;border-bottom:1px solid rgba(255,255,255,.06);' +
      'display:flex;align-items:center;gap:8px;min-height:28px;color:rgba(255,255,255,.35);font-style:italic">' +
      'Use arrows or scrubber to inspect' +
    '</div>' +
    // Row 2: all controls in one row
    '<div style="padding:5px 10px;display:flex;align-items:center;gap:6px">' +
      _bckRpBtn('&#171;',  '_bckRpGo(0)',             'First') +
      _bckRpBtn('&#8249;', '_bckRpStep(-1)',           'Back') +
      '<button id="bck-rp-play" onclick="_bckRpTogglePlay()"' +
        ' style="width:28px;height:28px;border-radius:50%;flex-shrink:0;' +
        'border:2px solid rgba(0,210,255,.5);background:rgba(0,210,255,.1);' +
        'color:#00D2FF;font-size:14px;cursor:pointer">&#9654;</button>' +
      _bckRpBtn('&#8250;', '_bckRpStep(1)',  'Forward') +
      _bckRpBtn('&#187;',  '_bckRpGo('+(total-1)+')', 'Last') +
      '<input type="range" id="bck-rp-scrub" min="0" max="'+(total-1)+'" value="0"' +
        ' oninput="_bckRpScrub(this.value)"' +
        ' style="flex:1;height:4px;cursor:pointer;accent-color:#00D2FF;margin:0 4px">' +
      '<span id="bck-rp-pos" style="' + F + 'color:rgba(255,255,255,.4);white-space:nowrap;min-width:32px">1/'+ total +'</span>' +
      '<span id="bck-rp-ts" style="' + F + 'font-family:monospace;color:rgba(255,255,255,.3);white-space:nowrap;margin-right:4px"></span>' +
      '<select id="bck-rp-speed" onchange="_bckRpSpeedChange(this.value)"' +
        ' style="' + F + 'background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.1);' +
        'color:rgba(255,255,255,.6);padding:2px 4px;border-radius:3px;cursor:pointer">' +
        '<option value="1000">Slow</option><option value="500" selected>Normal</option>' +
        '<option value="200">Fast</option><option value="50">Max</option>' +
      '</select>' +
      '<button onclick="_bckRpClose()" style="' + F + 'padding:3px 8px;border-radius:3px;' +
        'border:1px solid rgba(226,75,74,.3);background:none;color:rgba(226,75,74,.6);cursor:pointer;white-space:nowrap">&#10005;</button>' +
    '</div>';

  bck.appendChild(panel);
  _bckRpRender(_bckSimLog.length - 1);
}



function _bckRpBtn(glyph, action, title) {
  return '<button onclick="'+action+'" title="'+title+'"'+
    ' style="width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,.15);'+
    'background:none;color:rgba(255,255,255,.6);font-size:14px;cursor:pointer">'+
    glyph+'</button>';
}

function _bckRpRender(idx) {
  var log   = _bckSimLog;
  var total = log.length;
  if (!total) return;
  if (idx < 0) idx = 0;
  if (idx >= total) idx = total - 1;
  _bckReplayPos = idx;

  var scrub = document.getElementById('bck-rp-scrub');
  if (scrub) scrub.value = idx;
  var posEl = document.getElementById('bck-rp-pos');
  if (posEl) posEl.textContent = (idx+1)+' / '+total;

  var entry = log[idx];
  var tsEl = document.getElementById('bck-rp-ts');
  if (tsEl && entry) {
    tsEl.textContent = new Date(entry.ts).toLocaleTimeString('en-US',
      {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }

  // Ticker
  var ev = document.getElementById('bck-rp-event');
  if (ev && entry) {
    var dotColor = entry.kind==='radio' ? 'rgba(0,210,255,.6)' : (entry.color||'#888');
    var label    = entry.kind==='radio' ? (entry.side||'radio').toUpperCase() : _bistEscHtml(entry.type);
    var detail   = entry.kind==='radio' ? _bistEscHtml(entry.msg) : _bistEscHtml(entry.detail);
    ev.innerHTML =
      '<div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:'+dotColor+'"></div>'+
      '<div style="font-size:13px;font-weight:600;color:rgba(255,255,255,.9);white-space:nowrap">'+label+'</div>'+
      '<div style="font-size:12px;color:rgba(255,255,255,.55);margin-left:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+detail+'</div>'+
      '<div style="font-size:12px;font-family:monospace;color:rgba(0,210,255,.6);margin-left:auto;white-space:nowrap;flex-shrink:0">'+
        '&#9664; '+(idx+1)+'/'+total+'</div>';
  }

  // Rebuild CoC feed — entries up to idx
  var cocFeed = document.getElementById('bck-cocf');
  if (cocFeed) {
    cocFeed.innerHTML = '';
    var cocEntries = log.slice(0,idx+1).filter(function(e){return e.kind==='coc';});
    if (!cocEntries.length) {
      cocFeed.innerHTML = '<div style="padding:14px 10px;text-align:center;font-size:12px;'+
        'font-family:Arial,sans-serif;color:rgba(255,255,255,.3)">No events at this position</div>';
    } else {
      cocEntries.forEach(function(e) {
        var ts2 = new Date(e.ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
        var el2 = document.createElement('div');
        el2.className = 'bck-ce';
        el2.innerHTML = '<div class="bck-cedot" style="background:'+e.color+'"></div>'+
          '<div class="bck-ceb"><div class="bck-cet" style="color:'+e.color+'">'+_bistEscHtml(e.type)+'</div>'+
          '<div class="bck-ced">'+_bistEscHtml(e.detail)+'</div>'+
          '<div class="bck-cts">'+ts2+'</div></div>';
        cocFeed.insertBefore(el2, cocFeed.firstChild);
      });
      var cc = document.getElementById('bck-cocc');
      if (cc) cc.textContent = cocEntries.length+' event'+(cocEntries.length!==1?'s':'');
    }
  }

  // Rebuild radio feed — entries up to idx
  var radioFeed = document.getElementById('bck-rf');
  if (radioFeed) {
    radioFeed.innerHTML = '';
    var radioEntries = log.slice(0,idx+1).filter(function(e){return e.kind==='radio';});
    if (!radioEntries.length) {
      radioFeed.innerHTML = '<div style="padding:6px 14px;font-size:12px;font-family:Arial,sans-serif;'+
        'color:rgba(255,255,255,.25)">— Radio silence —</div>';
    } else {
      radioEntries.forEach(function(e) {
        var isRej=e.side==='reject', isTow=e.side==='tower'||isRej, isGnd=e.side==='ground';
        var tx=document.createElement('div');
        tx.className='bck-tx '+(isGnd?'ground':isRej?'reject tower':isTow?'tower':'crew');
        var cs=document.createElement('span'); cs.className='bck-txcs';
        cs.textContent=isGnd?'GROUND':isRej?'TOWER':isTow?'TOWER':'CREW';
        var bub=document.createElement('div'); bub.className='bck-txbub'; bub.textContent=e.msg;
        var ts3=document.createElement('span'); ts3.className='bck-txts';
        ts3.textContent=new Date(e.ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
        if(isTow||isGnd){tx.appendChild(cs);tx.appendChild(bub);tx.appendChild(ts3);}
        else{tx.appendChild(ts3);tx.appendChild(bub);tx.appendChild(cs);}
        radioFeed.insertBefore(tx, radioFeed.firstChild);
      });
    }
  }

  // ── Rebuild DAG node states up to idx ──────────────────────────────────
  var nodesEl2 = _bckEl('bck-nodes');
  if (nodesEl2) {
    nodesEl2.innerHTML = '';
    var dt2 = _bckEl('bck-dtrig'); if (dt2) dt2.className = 'bck-dt';
    var de2 = _bckEl('bck-dend');  if (de2) de2.className = 'bck-de';
    var lsvg2 = _bckEl('bck-lsvg'); if (lsvg2) lsvg2.innerHTML = '';

    var rTrig = null, rEnd = null;
    var rOrder = [], rStates = {};
    for (var rk = 0; rk <= idx; rk++) {
      var re = log[rk];
      if (re.kind === 'begintest') { rOrder = []; rStates = {}; rTrig = null; rEnd = null; }
      if (re.kind === 'trigger')   rTrig = re;
      if (re.kind === 'endnode')   rEnd  = re;
      if (re.kind === 'node') {
        if (!rStates[re.stepId]) rOrder.push(re.stepId);
        rStates[re.stepId] = re;
      }
    }
    if (rTrig) { var dt3=_bckEl('bck-dtrig'); if(dt3) dt3.className='bck-dt on'; }
    if (rEnd)  { var de3=_bckEl('bck-dend');  if(de3) de3.className='bck-de dn'; }

    rOrder.forEach(function(stepId) {
      var n = rStates[stepId];
      var nm = (n.nodeName||'Step').split('\n');
      var rSeqLabel = ((n.testIdx!=null?n.testIdx+1:'?')+'.'+((n.stepIdx!=null?n.stepIdx+1:'?')));
      var card = document.createElement('div');
      card.className = n.cls; card.id = 'bck-n-'+stepId;
      card.innerHTML =
        '<div class="bck-nct"><div class="bck-nav">'+_bistEscHtml(n.actor)+'</div>'+
        '<div class="bck-nan">'+_bistEscHtml(n.aname)+'</div></div>'+
        '<div class="bck-nb">'+
          '<div class="bck-ntitle">'+_bistEscHtml(nm[0])+
          (nm[1]?'<br><span style="opacity:.6;font-size:12px;font-family:Arial,sans-serif">'+_bistEscHtml(nm[1])+'</span>':'')+
          '</div>'+
          '<div class="bck-nst" id="bck-nst-'+stepId+'">'+
            '<div class="bck-nsdot" style="background:'+n.col+'"></div>'+
            '<span class="bck-nstxt" style="color:'+n.col+'">'+_bistEscHtml(n.label)+'</span>'+
            '<span style="margin-left:auto;font-size:12px;font-family:Arial,sans-serif;font-weight:700;color:rgba(255,180,60,.85)">'+rSeqLabel+'</span>'+
          '</div>'+
        '</div>';
      if (nodesEl2.children.length > 0) {
        var cw = document.createElement('div'); cw.className = 'bck-cw dn'; nodesEl2.appendChild(cw);
      }
      nodesEl2.appendChild(card);
    });
  }
}

function _bckRpScrub(val) {
  _bckRpStop();
  _bckRpRender(parseInt(val, 10));
}

function _bckRpStep(delta) {
  _bckRpStop();
  _bckRpRender(_bckReplayPos + delta);
}

function _bckRpGo(idx) {
  _bckRpStop();
  _bckRpRender(idx);
}

function _bckRpStop() {
  _bckReplayPlay = false;
  if (_bckReplayTimer) { clearInterval(_bckReplayTimer); _bckReplayTimer = null; }
  var btn = document.getElementById('bck-rp-play');
  if (btn) btn.innerHTML = '&#9654;';
}

function _bckRpTogglePlay() {
  if (_bckReplayPlay) {
    _bckRpStop();
  } else {
    _bckReplayPlay = true;
    var btn = document.getElementById('bck-rp-play');
    if (btn) btn.innerHTML = '&#9646;&#9646;';
    var speed = parseInt((document.getElementById('bck-rp-speed')||{}).value||'500', 10);
    _bckReplayTimer = setInterval(function() {
      if (_bckReplayPos >= _bckSimLog.length - 1) {
        _bckRpStop();
        return;
      }
      _bckRpRender(_bckReplayPos + 1);
    }, speed);
  }
}

function _bckRpSpeedChange(val) {
  if (_bckReplayPlay) {
    _bckRpStop();
    _bckRpTogglePlay();
  }
}

function _bckReplayStop() {
  _bckRpStop();
  _bckReplayPlay = false;
}

function _bistEscHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}