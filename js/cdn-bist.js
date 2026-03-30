// cdn-bist.js — Cadence: BIST gate checks, test plan, proceed/release
// LOAD ORDER: 8th

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
    template_version: spec.template_version || _selectedTmpl?.version || '?',
    status:           'running',
    steps_passed:     0,
    steps_failed:     0,
    run_by:           _myResourceId || null,
    run_at:           new Date().toISOString(),
  });
  const runId      = runRows?.[0]?.id;
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
            </button>` : ''}
          ${tier === 3 ? `
            <div style="flex:1;font-size:11px;color:var(--green)">
              ✓ All tests passing — ready to release
            </div>
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
  document.body.appendChild(overlay);
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