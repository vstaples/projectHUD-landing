// cdn-instances.js — Cadence: instance list, detail, launch, step lifecycle
// Largest module — instance list render, detail panel, step transitions
// LOAD ORDER: 17th (last — depends on all others)

function launchInstance() {
  if (!_selectedTmpl) return;
  if (_dirtySteps) { cadToast('Save the template before launching', 'info'); return; }
  if (!_selectedTmpl.steps?.length) { cadToast('Add at least one step before launching', 'info'); return; }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <div class="modal-title">Launch — ${escHtml(_selectedTmpl.name)}</div>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:12px">
          <label class="config-label">Instance Title</label>
          <input class="config-input" id="launch-title"
            value="${escHtml(_selectedTmpl.name)} · ${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}" />
        </div>
        <div style="margin-bottom:12px">
          <label class="config-label">Workflow Owner <span style="color:var(--red)">*</span></label>
          <select class="config-select" id="launch-owner">
            ${renderResourceOptions(_myResourceId || '', '— Select owner —')}
          </select>
          <div style="font-size:10px;color:var(--muted);margin-top:4px">
            Owner receives issue escalations and manages blocked steps.
          </div>
        </div>

        <!-- ── STAKES LAYER ─────────────────────────────────── -->
        <div style="margin:16px 0 8px;padding-top:12px;border-top:1px solid var(--border)">
          <div style="font-size:10px;font-weight:700;letter-spacing:.1em;color:var(--cad);text-transform:uppercase;margin-bottom:10px">Stakes & Priority</div>

          <!-- Priority -->
          <div style="margin-bottom:12px">
            <label class="config-label">Priority</label>
            <div style="display:flex;gap:8px" id="launch-priority-btns">
              ${[['routine','⚪ Routine','rgba(255,255,255,.1)','rgba(255,255,255,.15)'],
                 ['important','🟡 Important','rgba(232,168,56,.15)','rgba(232,168,56,.35)'],
                 ['critical','🔴 Critical','rgba(226,75,74,.15)','rgba(226,75,74,.35)']].map(([val,lbl,bg,activeBg])=>`
              <button onclick="_launchPrioritySelect('${val}')" id="lpri-${val}"
                style="flex:1;padding:6px 0;font-size:11px;font-weight:600;
                  background:${val==='routine'?activeBg:bg};
                  border:1px solid ${val==='routine'?'rgba(255,255,255,.3)':'var(--border)'};
                  border-radius:4px;color:var(--text);cursor:pointer;transition:all .15s">${lbl}</button>`).join('')}
            </div>
            <input type="hidden" id="launch-priority" value="routine"/>
          </div>

          <!-- Stakes description -->
          <div style="margin-bottom:12px">
            <label class="config-label">What's at stake? <span style="color:var(--muted);font-weight:400">(optional)</span></label>
            <input class="config-input" id="launch-stakes"
              placeholder="e.g. $250K contract · FDA submission · Novel R&D — first attempt"/>
            <div style="font-size:10px;color:var(--muted);margin-top:4px">
              Surfaces on every task derived from this workflow so assignees understand context.
            </div>
          </div>

          <!-- PERT estimates -->
          <div style="margin-bottom:4px">
            <label class="config-label">Duration Estimate (PERT) <span style="color:var(--muted);font-weight:400">(optional)</span></label>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
              <div>
                <div style="font-size:10px;color:var(--green);margin-bottom:3px;font-weight:600">Optimistic (days)</div>
                <input class="config-input" id="launch-pert-o" type="number" min="0" placeholder="Best case" style="font-size:11px"/>
              </div>
              <div>
                <div style="font-size:10px;color:var(--amber);margin-bottom:3px;font-weight:600">Most Likely (days)</div>
                <input class="config-input" id="launch-pert-m" type="number" min="0" placeholder="Realistic" style="font-size:11px" oninput="_launchPertUpdate()"/>
              </div>
              <div>
                <div style="font-size:10px;color:var(--red);margin-bottom:3px;font-weight:600">Pessimistic (days)</div>
                <input class="config-input" id="launch-pert-p" type="number" min="0" placeholder="Worst case" style="font-size:11px" oninput="_launchPertUpdate()"/>
              </div>
            </div>
            <div id="launch-pert-result" style="margin-top:6px;font-size:10px;color:var(--muted);min-height:14px"></div>
          </div>
        </div>

        <div style="margin-bottom:12px;margin-top:4px">
          <label class="config-label">Link to project &amp; task <span style="color:var(--muted);font-weight:400">(optional)</span></label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
            <select class="config-select" id="launch-project" style="font-size:11px"
              onchange="_launchProjectChanged()">
              <option value="">— No project —</option>
            </select>
            <select class="config-select" id="launch-task" style="font-size:11px" disabled>
              <option value="">— Select project first —</option>
            </select>
          </div>
          <div style="font-size:10px;color:var(--muted);margin-top:4px">
            When linked: task status mirrors instance — <em>in progress</em> while running, <em>complete</em> when instance closes.
          </div>
        </div>

        <div style="margin-bottom:12px;margin-top:4px">
          <label class="config-label">Notes (optional)</label>
          <textarea class="config-textarea" id="launch-notes" placeholder="Any additional context for this instance..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn btn-solid" onclick="confirmLaunch()">▶ Launch Workflow</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // Populate project dropdown asynchronously after modal is in DOM
  API.get(`projects?firm_id=eq.${FIRM_ID_CAD}&status=eq.active&select=id,name&order=name.asc`)
    .then(projects => {
      const sel = document.getElementById('launch-project');
      if (!sel) return;
      sel.innerHTML = '<option value="">— No project —</option>' +
        (projects || []).map(p =>
          `<option value="${p.id}">${escHtml(p.name)}</option>`
        ).join('');
    }).catch(() => {});
}

function _launchPrioritySelect(val) {
  document.getElementById('launch-priority').value = val;
  const colors = { routine:['rgba(255,255,255,.15)','rgba(255,255,255,.3)'], important:['rgba(232,168,56,.35)','rgba(232,168,56,.6)'], critical:['rgba(226,75,74,.35)','rgba(226,75,74,.6)'] };
  const borders = { routine:'rgba(255,255,255,.3)', important:'rgba(232,168,56,.6)', critical:'rgba(226,75,74,.6)' };
  ['routine','important','critical'].forEach(p => {
    const btn = document.getElementById(`lpri-${p}`);
    if (!btn) return;
    const active = p === val;
    btn.style.background = active ? colors[p][0] : 'rgba(255,255,255,.05)';
    btn.style.borderColor = active ? borders[p] : 'var(--border)';
    btn.style.boxShadow = active ? `0 0 0 1px ${borders[p]}` : 'none';
  });
}

function _launchPertUpdate() {
  const o = parseFloat(document.getElementById('launch-pert-o')?.value)||0;
  const m = parseFloat(document.getElementById('launch-pert-m')?.value)||0;
  const p = parseFloat(document.getElementById('launch-pert-p')?.value)||0;
  const el = document.getElementById('launch-pert-result');
  if (!el) return;
  if (!m && !p) { el.textContent=''; return; }
  const expected = ((o + 4*m + p) / 6).toFixed(1);
  const variance = ((p - o) / 6).toFixed(1);
  const spread = p - o;
  const epistemic = spread > 10 ? '⚠ High epistemic risk — wide variance suggests novel or uncertain work'
    : spread > 4 ? '~ Moderate uncertainty'
    : spread > 0 ? '✓ Low variance — well-understood work' : '';
  el.innerHTML = `Expected: <strong>${expected} days</strong> · Std dev: ±${variance}d &nbsp;
    <span style="color:${spread>10?'var(--red)':spread>4?'var(--amber)':'var(--green)'}">${epistemic}</span>`;
}

function _launchProjectChanged() {
  const projSel = document.getElementById('launch-project');
  const taskSel = document.getElementById('launch-task');
  if (!projSel || !taskSel) return;

  const projId = projSel.value;
  taskSel.innerHTML = '<option value="">Loading…</option>';
  taskSel.disabled = true;

  if (!projId) {
    taskSel.innerHTML = '<option value="">— Select project first —</option>';
    return;
  }

  API.get(`tasks?project_id=eq.${projId}&status=not.in.(complete,cancelled)&select=id,name,status&order=name.asc`)
    .then(tasks => {
      if (!taskSel) return;
      if (!tasks?.length) {
        taskSel.innerHTML = '<option value="">— No open tasks —</option>';
        taskSel.disabled = true;
        return;
      }
      taskSel.innerHTML = '<option value="">— No task link —</option>' +
        tasks.map(t => `<option value="${t.id}">${escHtml(t.name)}</option>`).join('');
      taskSel.disabled = false;
    }).catch(() => {
      taskSel.innerHTML = '<option value="">— Failed to load —</option>';
      taskSel.disabled = true;
    });
}

async function confirmLaunch() {
  const title      = document.getElementById('launch-title')?.value?.trim();
  const ownerResId = document.getElementById('launch-owner')?.value;
  const notes      = document.getElementById('launch-notes')?.value?.trim();
  const priority   = document.getElementById('launch-priority')?.value || 'routine';
  const stakes     = document.getElementById('launch-stakes')?.value?.trim() || null;
  const pertO      = parseFloat(document.getElementById('launch-pert-o')?.value)||null;
  const pertM      = parseFloat(document.getElementById('launch-pert-m')?.value)||null;
  const pertP      = parseFloat(document.getElementById('launch-pert-p')?.value)||null;
  const projectId  = document.getElementById('launch-project')?.value || null;
  const taskId     = document.getElementById('launch-task')?.value    || null;

  if (!title)      { cadToast('Title required', 'error'); return; }
  if (!ownerResId) { cadToast('Owner required — select who will manage this instance', 'error'); return; }

  const ownerUser  = _users_cad.find(u => u.resource_id === ownerResId);
  const launchedBy = ownerUser?.id || _myUserId || null;
  const ownerName  = _resources_cad.find(r => r.id === ownerResId)?.name || '';

  if (!launchedBy) {
    cadToast('Selected owner has no app user account — please select someone with a login', 'error');
    return;
  }

  try {
    const res = await API.post('workflow_instances', {
      firm_id:     FIRM_ID_CAD,
      template_id: _selectedTmpl.id,
      title,
      notes:       notes || null,
      status:      'in_progress',
      launched_by: launchedBy,
      launched_at: new Date().toISOString(),
      priority,
      stakes,
      pert_optimistic:  pertO,
      pert_likely:      pertM,
      pert_pessimistic: pertP,
      ...(projectId ? { project_id:     projectId } : {}),
      ...(taskId    ? { source_task_id: taskId    } : {}),
    });

    if (res?.[0]?.id) {
      const instanceId = res[0].id;

      // If bound to a task — mark it in_progress
      if (taskId) {
        API.patch(`tasks?id=eq.${taskId}`, {
          status:     'in_progress',
          updated_at: new Date().toISOString(),
        }).catch(() => {});
      }

      // Write launch CoC event
      await API.post('workflow_step_instances', {
        instance_id:  instanceId,
        firm_id:      FIRM_ID_CAD,
        step_type:    'trigger',
        step_name:    'Instance launched',
        status:       'complete',
        event_type:   'instance_launched',
        event_notes:  `Launched from template: ${_selectedTmpl.name}${ownerName ? ' · Owner: ' + ownerName : ''}`,
        actor_resource_id: null,
      });

      _instances.unshift(res[0]);
      updateBadges();

      // Activate first step and notify assignee
      const firstStep = (_selectedTmpl.steps || [])
        .slice().sort((a,b) => a.sequence_order - b.sequence_order)
        .find(s => s.step_type !== 'trigger');
      if (firstStep) {
        await API.post('workflow_step_instances', {
          instance_id:      instanceId,
          firm_id:          FIRM_ID_CAD,
          event_type:       'step_activated',
          template_step_id: firstStep.id,
          step_type:        firstStep.step_type || 'action',
          step_name:        firstStep.name || null,
          actor_name:       'System',
          created_at:       new Date().toISOString(),
        }).catch(() => {});
        const fakeInst = { ...res[0], title };
        _notifyStepActivated(instanceId, firstStep, fakeInst).catch(() => {});
      }

      document.querySelector('.modal-overlay')?.remove();
      cadToast('Workflow launched', 'success');
      switchTab('instances');
    }
  } catch(e) {
    cadToast('Launch failed: ' + e.message, 'error');
  }
}

function renderInstancesTab(el) {
  const statusLabel = { pending:'PENDING', in_progress:'IN PROGRESS', complete:'COMPLETE', cancelled:'CANCELLED', overridden:'OVERRIDDEN' };
  const statusColor = { pending:'var(--muted)', in_progress:'var(--cad)', complete:'var(--green)', cancelled:'var(--muted)', overridden:'var(--amber)' };
  const priIcon = { critical:'🔴', important:'🟡', routine:'⚪' };

  // Filter instances
  const myResId = _myResourceId;
  const myUserId = _myUserId;

  const filtered = _instances.filter(inst => {
    // Search
    if (_instSearch) {
      const q = _instSearch.toLowerCase();
      const tmpl = _templates.find(t=>t.id===inst.template_id);
      const hay = `${inst.title||''} ${tmpl?.name||''} ${inst.stakes||''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    // Tab filter
    if (_instFilter === 'mine') {
      // Any active step assigned to me
      const myStep = (inst._tmplSteps||[]).find(s => {
        const evt = (inst._stepInsts||[]).slice().reverse().find(e=>e.template_step_id===s.id);
        return evt?.event_type==='step_activated' && (s.assignee_user_id===myUserId||s.assignee_resource_id===myResId);
      });
      return !!myStep;
    }
    if (_instFilter === 'active') return inst.status==='in_progress';
    if (_instFilter === 'done')   return inst.status==='complete'||inst.status==='cancelled';
    return true;
  });

  // Sort: mine tab by urgency, others by launched_at desc
  if (_instFilter === 'mine') {
    filtered.sort((a,b) => _instUrgencyScore(b) - _instUrgencyScore(a));
  }

  // Tab counts
  const counts = {
    all: _instances.length,
    mine: _instances.filter(inst => (inst._tmplSteps||[]).some(s => {
      const evt = (inst._stepInsts||[]).slice().reverse().find(e=>e.template_step_id===s.id);
      return evt?.event_type==='step_activated'&&(s.assignee_user_id===myUserId||s.assignee_resource_id===myResId);
    })).length,
    active: _instances.filter(i=>i.status==='in_progress').length,
    done: _instances.filter(i=>i.status==='complete'||i.status==='cancelled').length,
  };

  el.innerHTML = `
    <div style="position:absolute;inset:0;display:flex;overflow:hidden">

      <!-- Left: instance list with filter + search -->
      <div style="width:340px;flex-shrink:0;border-right:1px solid var(--border);
        display:flex;flex-direction:column;overflow:hidden">

        <!-- Filter tabs -->
        <div style="padding:8px 10px 0;flex-shrink:0;border-bottom:1px solid var(--border)">
          <div style="display:flex;gap:2px;margin-bottom:8px">
            ${[['all','All'],['mine','My Work'],['active','In Process'],['done','Complete']].map(([f,lbl])=>`
            <button onclick="_setInstFilter('${f}')" id="ifilter-${f}"
              style="flex:1;padding:5px 4px;font-size:10px;font-weight:600;border:none;
                border-radius:3px;cursor:pointer;transition:all .15s;letter-spacing:.02em;
                background:${_instFilter===f?'var(--cad)':'transparent'};
                color:${_instFilter===f?'var(--bg0)':'var(--muted)'}">
              ${lbl}${counts[f]?` <span style="opacity:.7">${counts[f]}</span>`:''}
            </button>`).join('')}
          </div>
          <!-- Search -->
          <div style="position:relative;margin-bottom:8px">
            <input id="inst-search-input" value="${escHtml(_instSearch)}"
              oninput="_setInstSearch(this.value)"
              placeholder="Search instances..."
              style="width:100%;padding:5px 8px 5px 26px;font-size:11px;background:var(--surf2);
                border:1px solid var(--border);border-radius:3px;color:var(--text);box-sizing:border-box"/>
            <span style="position:absolute;left:8px;top:50%;transform:translateY(-50%);
              font-size:11px;color:var(--muted)">⌕</span>
            ${_instSearch?`<button onclick="_setInstSearch('')"
              style="position:absolute;right:6px;top:50%;transform:translateY(-50%);
                background:none;border:none;color:var(--muted);cursor:pointer;font-size:12px">✕</button>`:''}
          </div>
        </div>

        <!-- Instance list -->
        <div style="flex:1;overflow-y:auto">
          ${!filtered.length
            ? `<div style="padding:40px 20px;text-align:center;color:var(--muted)">
                ${_instFilter==='mine'
                  ? `<div style="font-size:24px;margin-bottom:8px">◎</div>
                     <div style="font-size:13px;font-weight:500;color:var(--cad)">You're all caught up</div>
                     <div style="font-size:11px;margin-top:4px">No items waiting on you</div>`
                  : `<div style="font-size:12px">No instances found</div>`}
               </div>`
            : filtered.map(inst => {
                const tmpl   = _templates.find(t=>t.id===inst.template_id);
                const active = _selectedInstance?.id === inst.id;
                const color  = statusColor[inst.status] || 'var(--muted)';
                const thermal = _instThermalColor(inst);
                const pri    = inst.priority || 'routine';
                const isCrit = pri==='critical';
                const isImp  = pri==='important';
                const pertExp = _instPertExpected(inst);
                const pertVar = _instPertVariance(inst);
                const highVar = pertVar > 10;

                // Find active step for this user (My Work context)
                const myActiveStep = (inst._tmplSteps||[]).find(s => {
                  const evt = (inst._stepInsts||[]).slice().reverse().find(e=>e.template_step_id===s.id);
                  return evt?.event_type==='step_activated';
                });
                const activeStepEvt = myActiveStep ? (inst._stepInsts||[]).slice().reverse().find(e=>e.template_step_id===myActiveStep?.id&&e.event_type==='step_activated') : null;
                const waitingMs = activeStepEvt ? Date.now()-new Date(activeStepEvt.created_at) : 0;
                const waitingH = Math.floor(waitingMs/3600000);
                const waitingM = Math.floor((waitingMs%3600000)/60000);
                const waitStr = waitingH>0?`${waitingH}h ${waitingM}m`:`${waitingM}m`;
                const resets = (inst._stepInsts||[]).filter(e=>e.event_type==='step_reset'&&e.template_step_id===myActiveStep?.id).length;

                return `
                <div onclick="selectInstance('${inst.id}')"
                  style="padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer;
                    background:${active?'var(--surf2)':'transparent'};
                    border-left:3px solid ${active?'var(--cad)':thermal};
                    transition:background .12s;position:relative">

                  <!-- Priority + Stakes line -->
                  ${inst.stakes||pri!=='routine'?`
                  <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">
                    <span style="font-size:10px">${priIcon[pri]||''}</span>
                    ${inst.stakes?`<span style="font-size:10px;font-weight:600;
                      color:${isCrit?'var(--red)':isImp?'var(--amber)':'var(--text2)'};
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1">
                      ${escHtml(inst.stakes)}</span>`:''}
                    ${highVar?`<span style="font-size:10px;color:var(--red);font-weight:600;white-space:nowrap">⚠ High variance</span>`:''}
                  </div>`:''}

                  <!-- Title -->
                  <div style="font-size:12px;font-weight:500;color:var(--text);
                    margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    ${escHtml(inst.title||tmpl?.name||'Untitled')}
                  </div>

                  <!-- Status + template -->
                  <div style="font-size:10px;color:var(--muted);display:flex;gap:6px;align-items:center;margin-bottom:3px">
                    <span style="color:${color};font-weight:600;font-size:10px;
                      letter-spacing:.08em;text-transform:uppercase">${statusLabel[inst.status]||inst.status}</span>
                    <span>${escHtml(tmpl?.name||'—')}</span>
                  </div>

                  <!-- Active step context -->
                  ${myActiveStep?`
                  <div style="font-size:10px;color:var(--text2);display:flex;align-items:center;gap:5px;flex-wrap:wrap">
                    <span style="color:var(--amber)">●</span>
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px">${escHtml(myActiveStep.name||'—')}</span>
                    <span style="color:var(--muted)">· ${waitStr}</span>
                    ${resets?`<span style="color:var(--red);font-weight:600">↩ ${resets}×</span>`:''}
                  </div>`:''}

                  <!-- Task binding badge -->
                  ${inst.source_task_id?`
                  <div style="display:inline-flex;align-items:center;gap:4px;margin-top:3px;
                    padding:2px 7px;font-size:10px;font-family:var(--font-mono);
                    color:var(--cad);border:1px solid rgba(79,142,247,.3);
                    background:rgba(79,142,247,.07);border-radius:3px;
                    cursor:pointer;white-space:nowrap"
                    onclick="event.stopPropagation();_openLinkedTask('${inst.source_task_id}','${inst.project_id||''}')"
                    title="Open linked task">
                    ⛓ Linked task
                  </div>`:''}

                  <!-- PERT expected duration -->
                  ${pertExp?`<div style="font-size:10px;color:var(--muted);margin-top:2px">
                    Expected: ${pertExp}d${pertVar>0?` ±${((pertVar)/6).toFixed(1)}d`:''}
                  </div>`:''}

                  <!-- Pulse animation for critical -->
                  ${isCrit&&inst.status==='in_progress'?`
                  <div style="position:absolute;top:8px;right:8px;width:8px;height:8px;
                    border-radius:50%;background:var(--red);
                    animation:critPulse 2s ease-in-out infinite"></div>`:''}
                </div>`;
              }).join('')}
        </div>
      </div>

      <!-- Right: instance detail -->
      <div id="instance-detail" class="inst-dag-col" style="min-width:0">
        ${_selectedInstance
          ? ''
          : `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
               height:100%;color:var(--muted);gap:8px">
               <div style="font-size:32px;opacity:.2">◎</div>
               <div style="font-size:12px">Select an instance to view its status and history</div>
             </div>`}
      </div>

    </div>`;

  if (_selectedInstance) {
    const detailEl = document.getElementById('instance-detail');
    if (detailEl) renderInstanceDetail(detailEl, _selectedInstance);
  }
}

function _setInstFilter(f) {
  _instFilter = f;
  const el = document.getElementById('cad-content');
  if (el) renderInstancesTab(el);
}

function _setInstSearch(q) {
  _instSearch = q;
  const el = document.getElementById('cad-content');
  if (el) renderInstancesTab(el);
}

async function selectInstance(id) {
  _instDagFitted=false; _instDagPanX=0; _instDagPanY=0; _instDagScale=1;
  if(_instDagPulseFrame) { cancelAnimationFrame(_instDagPulseFrame); _instDagPulseFrame=null; }
  const wrap=document.getElementById('inst-dag-canvas-wrap');
  if(wrap) wrap._instDagEventsInit=false;
  _selectedInstance = _instances.find(i => i.id === id) || null;
  if (!_selectedInstance) return;

  // Re-render the list to update active state
  renderInstancesTab(document.getElementById('cad-content'));

  // Load step instances (CoC) for this instance
  const detailEl = document.getElementById('instance-detail');
  if (!detailEl) return;
  detailEl.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted);font-size:12px">Loading…</div>`;

  try {
    const [stepInsts, tmplSteps, stepComments, actionItems] = await Promise.all([
      API.get(`workflow_step_instances?instance_id=eq.${id}&order=created_at.asc,id.asc`).catch(()=>[]),
      (() => {
        const tmpl = _templates.find(t => t.id === _selectedInstance.template_id);
        return tmpl
          ? API.get(`workflow_template_steps?template_id=eq.${tmpl.id}&order=sequence_order.asc`).catch(()=>[])
          : Promise.resolve([]);
      })(),
      API.get(`step_comments?instance_id=eq.${id}&is_deleted=eq.false&order=created_at.asc`).catch(()=>[]),
      API.get(`workflow_action_items?instance_id=eq.${id}&order=created_at.asc`).catch(()=>[]),
    ]);
    _selectedInstance._stepInsts    = stepInsts    || [];
    _selectedInstance._stepComments = stepComments || [];
    _selectedInstance._actionItems  = actionItems  || [];
    _lastCoCCount = _selectedInstance._stepInsts.length;
    // Hydrate _attachedDocs from attached_docs column (same as selectTemplate)
    _selectedInstance._tmplSteps  = (tmplSteps || []).map(s => ({
      ...s,
      _attachedDocs: (s.attached_docs || []).map(d => ({
        name: d.name, version: d.version, role: d.role||'reference',
        size: d.size, path: d.path||null, url: d.url||null,
      })),
      _meetingAgenda: Array.isArray(s.meeting_agenda) ? s.meeting_agenda : [],
    }));
    renderInstanceDetail(detailEl, _selectedInstance);
    // Start realtime + polling for external changes (e.g. email responses)
    if (_selectedInstance.status === 'in_progress') {
      _startExternalEventDetection(id);
    }
    // Populate rework badges after data and DOM are both ready
    setTimeout(_populateReworkBadges, 100);
  } catch(e) {
    detailEl.innerHTML = `<div style="padding:40px;color:var(--red)">Failed to load: ${escHtml(e.message)}</div>`;
  }
}

function renderInstanceDetail(el, inst) {
  const tmpl      = _templates.find(t => t.id === inst.template_id);
  const steps     = inst._tmplSteps  || [];
  const coc       = inst._stepInsts  || [];
  const selStep   = inst._selectedStep || null;

  const statusColor = {
    pending:'var(--muted)', in_progress:'var(--cad)',
    complete:'var(--green)', cancelled:'var(--red)', overridden:'var(--amber)'
  };
  const evtColor  = {
    instance_launched:'var(--cad)', step_activated:'#e8a838',
    step_action:'var(--green)', step_completed:'var(--green)',
    rejected:'var(--red)', escalation_triggered:'#e8a838',
    override:'#e8a838', instance_completed:'var(--green)',
    token_issued:'var(--muted)', reminder_sent:'var(--muted)',
    step_reassigned:'var(--accent)', instance_suspended:'#e8a838',
    instance_cancelled:'var(--red)', step_reset:'var(--muted)',
  };
  const evtLabel  = {
    instance_launched:'Instance Launched', step_activated:'Step Activated',
    step_action:'Action Taken', step_completed:'Step Completed',
    rejected:'Rejected', escalation_triggered:'Escalation Triggered',
    override:'PM Override', instance_completed:'Instance Completed',
    token_issued:'Token Issued', reminder_sent:'Reminder Sent',
    step_reassigned:'Assignee Reassigned', instance_suspended:'Suspended',
    instance_cancelled:'Cancelled', step_reset:'Step Reset',
    instance_cancelled:'Cancelled',
  };

  const activeStepIds    = new Set(coc.map(e => e.template_step_id).filter(Boolean));
  const rejectedStepIds  = new Set(coc.filter(e => e.event_type==='rejected').map(e => e.template_step_id));

  // Build latest-event-per-step map — last event wins
  const latestStepEvent = {};
  coc.forEach(e => {
    if (e.template_step_id) latestStepEvent[e.template_step_id] = e;
  });

  // A step is truly "done" only if its LATEST event is step_completed
  // Steps that were completed then reset or re-activated are NOT done
  const completedStepIds = new Set(
    Object.entries(latestStepEvent)
      .filter(([, e]) => e.event_type === 'step_completed')
      .map(([id]) => id)
  );

  const resetStepIds = new Set(
    Object.entries(latestStepEvent)
      .filter(([, e]) => e.event_type === 'step_reset')
      .map(([id]) => id)
  );

  // Derive the "ready" step — immediately follows the last FORWARD completion
  // Exclude steps completed with a reset outcome (rejected, declined, etc.)
  const lastCompletedOrder = steps
    .filter(s => {
      if (!completedStepIds.has(s.id)) return false;
      const evt = latestStepEvent[s.id];
      if (evt?.event_type !== 'step_completed') return false;
      const oDef = _getOutcomes(s).find(o => o.id === evt.outcome);
      return !oDef?.requiresReset; // only count forward completions
    })
    .reduce((max, s) => Math.max(max, s.sequence_order), 0);
  const readyStep = steps
    .filter(s => {
      const latest = latestStepEvent[s.id];
      return s.sequence_order > lastCompletedOrder
          && (!latest || latest.event_type === 'step_reset');
    })
    .sort((a, b) => a.sequence_order - b.sequence_order)[0];
  const readyStepId = readyStep?.id || null;

  // Map step_id → earliest activation timestamp for elapsed timers
  const stepActivatedAt = {};
  coc.filter(e => e.event_type === 'step_activated' && e.template_step_id)
     .forEach(e => { if (!stepActivatedAt[e.template_step_id]) stepActivatedAt[e.template_step_id] = e.created_at; });

  // For steps with no activation event, fall back to when the prior step completed
  // (covers existing instances predating auto-activation, and the ready step)
  steps.forEach((s, idx) => {
    if (!stepActivatedAt[s.id] && !completedStepIds.has(s.id)) {
      const prior = steps[idx - 1];
      if (prior && completedStepIds.has(prior.id)) {
        const priorCompletion = coc.slice().reverse()
          .find(e => e.event_type === 'step_completed' && e.template_step_id === prior.id);
        if (priorCompletion) stepActivatedAt[s.id] = priorCompletion.created_at;
      }
    }
  });

  // Build map of step_id → completion timestamp
  const stepCompletedAt = {};
  coc.filter(e => e.event_type === 'step_completed' && e.template_step_id)
     .forEach(e => { stepCompletedAt[e.template_step_id] = e.created_at; });

  // Build map of step_id → rework count
  // A step's rework count = how many times it was reset (step_reset events)
  // This captures both direct rejections AND resets caused by upstream rejections
  const stepRejectionCount = {};
  // Count step_reset events per step (each reset = one rework loop)
  coc.filter(e => e.event_type === 'step_reset' && e.template_step_id)
     .forEach(e => {
       stepRejectionCount[e.template_step_id] = (stepRejectionCount[e.template_step_id] || 0) + 1;
     });
  // Also count direct rejections on the step itself (requiresReset completions)
  coc.filter(e => e.event_type === 'step_completed' && e.template_step_id && e.outcome)
     .forEach(e => {
       const stepDef = steps.find(s => s.id === e.template_step_id);
       const oDef = stepDef ? _getOutcomes(stepDef).find(o => o.id === e.outcome) : null;
       if (oDef?.requiresReset) {
         stepRejectionCount[e.template_step_id] = (stepRejectionCount[e.template_step_id] || 0) + 1;
       }
     });

  // Map step_id → latest reassignment CoC event
  const reassignments = {};
  coc.filter(e => e.event_type === 'step_reassigned').forEach(e => {
    if (e.template_step_id) reassignments[e.template_step_id] = e;
  });

  const isCancelled  = inst.status === 'cancelled';
  const isComplete   = inst.status === 'complete';
  const canAct       = !isCancelled && !isComplete;
  const viewMode     = inst._viewMode || 'list';

  el.innerHTML = `
    <div class="inst-dag-col" style="height:100%">
    <!-- Header -->
    <div style="padding:14px 20px;border-bottom:1px solid var(--border);
      display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0">
      <div style="min-width:0">
        <div style="font-size:15px;font-weight:600;color:var(--text);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${escHtml(inst.title||tmpl?.name||'Untitled Instance')}
        </div>
        <div style="font-size:10px;color:var(--muted);display:flex;gap:10px;margin-top:2px;flex-wrap:wrap">
          <span>Template: <strong style="color:var(--text2)">${escHtml(tmpl?.name||'—')}</strong></span>
          <span>Launched: <strong style="color:var(--text2)">${inst.launched_at
            ? new Date(inst.launched_at).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})
            : '—'}</strong></span>
          ${inst.source_task_id ? `
          <span id="inst-task-binding-${inst.id}" style="color:var(--cad);cursor:pointer"
            onclick="_openLinkedTask('${inst.source_task_id}','${inst.project_id||''}')">
            ⛓ <span id="inst-task-name-${inst.id}">Linked task</span>
          </span>` : ''}
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--muted)">${inst.id.substring(0,8)}…</span>
        </div>
      </div>

      <!-- View Mode tabs -->
      <div style="display:flex;align-items:center;gap:0;border:1px solid var(--border);border-radius:5px;overflow:hidden;flex-shrink:0">
        <button onclick="setInstViewMode('list')"
          style="padding:5px 12px;font-size:10px;font-weight:600;letter-spacing:.06em;
            background:${viewMode==='list'?'var(--cad)':'transparent'};
            color:${viewMode==='list'?'var(--bg0)':'var(--muted)'};
            border:none;cursor:pointer;transition:all .12s">LIST</button>
        <button onclick="setInstViewMode('diagram')"
          style="padding:5px 12px;font-size:10px;font-weight:600;letter-spacing:.06em;
            background:${viewMode==='diagram'?'var(--cad)':'transparent'};
            color:${viewMode==='diagram'?'var(--bg0)':'var(--muted)'};
            border:none;border-left:1px solid var(--border);cursor:pointer;transition:all .12s">DIAGRAM</button>
      </div>

      <!-- Swimlane toggle — Option D: always visible, grayed in list mode -->
      <button id="sw-toggle-btn" onclick="_toggleSwimlane()"
        style="padding:5px 12px;font-size:10px;font-weight:600;letter-spacing:.06em;
          background:${_swimlaneActive?'var(--cad)':'transparent'};
          color:${_swimlaneActive?'var(--bg0)':'var(--muted)'};
          border:1px solid var(--border);border-radius:5px;cursor:pointer;
          transition:all .12s;flex-shrink:0;
          opacity:${viewMode==='diagram'?'1':'0.35'};
          pointer-events:${viewMode==='diagram'?'auto':'none'}"
        title="Toggle portfolio swimlane overlay">
        ◉ Swimlane
      </button>

      <!-- History toggle — rework heat layer -->
      <button id="hx-toggle-btn" onclick="_toggleHistory()"
        style="padding:5px 12px;font-size:10px;font-weight:600;letter-spacing:.06em;
          background:${_historyActive?'#ff5f6b':'transparent'};
          color:${_historyActive?'#fff':'var(--muted)'};
          border:1px solid ${_historyActive?'#ff5f6b':'var(--border)'};
          border-radius:5px;cursor:pointer;
          transition:all .12s;flex-shrink:0;
          opacity:${viewMode==='diagram'?'1':'0.35'};
          pointer-events:${viewMode==='diagram'?'auto':'none'}"
        title="Toggle rework history heat layer">
        ↩ History
      </button>

      <!-- Digital elapsed clock — dd:hh:mm since launch -->
      ${inst.launched_at && canAct ? `
      <div style="flex-shrink:0;text-align:center;
        background:var(--bg1);border:1px solid var(--border2);border-radius:5px;
        padding:6px 14px;min-width:110px">
        <div id="inst-clock-${inst.id}"
          data-from="${inst.launched_at}"
          style="font-family:var(--font-mono);font-size:20px;font-weight:700;
            letter-spacing:.08em;color:var(--cad);line-height:1">
          ${(()=>{
            const ms = Date.now() - new Date(inst.launched_at);
            const m = Math.floor(ms/60000), h = Math.floor(m/60), d = Math.floor(h/24);
            return String(d).padStart(2,'0')+':'+String(h%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
          })()}
        </div>
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;
          letter-spacing:.12em;margin-top:3px">Elapsed Time<br/>dd:hh:mm</div>
      </div>` : ''}
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <!-- Status badge -->
        <span style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
          color:${statusColor[inst.status]||'var(--muted)'};
          border:1px solid ${statusColor[inst.status]||'var(--border)'};
          padding:3px 8px;border-radius:3px">
          ${inst.status?.replace('_',' ').toUpperCase()||'—'}
        </span>
        <!-- Briefing button — always visible in both list and diagram mode -->
        <button onclick="showIntelBriefing('${inst.id}')"
          class="btn btn-ghost btn-sm"
          style="font-size:10px;color:var(--cad);border-color:rgba(0,185,195,.4);
            font-weight:600;letter-spacing:.04em"
          onmouseover="this.style.background='rgba(0,185,195,.1)'"
          onmouseout="this.style.background='none'">
          ◎ Briefing
        </button>
        <!-- Action buttons -->
        ${canAct ? `
          <button class="btn btn-ghost btn-sm" title="Suspend instance"
            onclick="suspendInstance('${inst.id}')"
            style="font-size:10px;color:var(--amber);border-color:rgba(212,144,31,.4)">
            ⏸ Suspend
          </button>
          <button class="btn btn-ghost btn-sm" title="Cancel instance"
            onclick="cancelInstance('${inst.id}')"
            style="font-size:10px;color:var(--red);border-color:rgba(192,64,74,.4)">
            ✕ Cancel
          </button>` : ''}
        <button class="btn btn-ghost btn-sm" title="Delete instance permanently"
          onclick="deleteInstance('${inst.id}')"
          style="font-size:10px;color:var(--muted);border-color:var(--border)">
          🗑 Delete
        </button>
      </div>
    </div>

    <!-- Body: conditional on view mode -->
    <div class="inst-dag-col">
    ${viewMode === 'diagram' ? `
      <!-- ── DIAGRAM VIEW ─────────────────────────────────────── -->
      <div id="inst-dag-wrap" class="inst-dag-col">
        <!-- Diagram controls -->
        <div style="display:flex;gap:6px;padding:5px 12px;border-bottom:1px solid var(--border);flex-shrink:0;align-items:center;background:var(--bg1)">
          <button onclick="instDagZoom(1.2)" style="padding:2px 8px;font-size:11px;background:none;border:1px solid var(--border);border-radius:3px;color:var(--text2);cursor:pointer">+ Zoom</button>
          <button onclick="instDagZoom(0.83)" style="padding:2px 8px;font-size:11px;background:none;border:1px solid var(--border);border-radius:3px;color:var(--text2);cursor:pointer">− Zoom</button>
          <button onclick="instDagReset()" style="padding:2px 8px;font-size:11px;background:none;border:1px solid var(--border);border-radius:3px;color:var(--text2);cursor:pointer">⟲ Reset</button>
          <div style="display:flex;gap:10px;margin-left:12px;align-items:center">
            <span style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted)"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--green)"></span>Complete</span>
            <span style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted)"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--amber)"></span>Active</span>
            <span style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted)"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--red)"></span>Rejected</span>
            <span style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted)"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--muted)"></span>Pending</span>
          </div>
          <span style="margin-left:auto;font-size:10px;color:var(--muted)">Click node to act</span>
          <button onclick="toggleInstDagCoC(this)" id="inst-dag-coc-btn"
            style="padding:2px 10px;font-size:10px;font-weight:600;background:none;
              border:1px solid var(--border);border-radius:3px;color:var(--muted);
              cursor:pointer;letter-spacing:.04em;margin-left:8px;transition:all .15s">CoC ▸</button>
        </div>
        <!-- Bottleneck banner — shown by _swUpdateBottleneckBanner() -->
        <div id="sw-bottleneck-banner" style="display:none;padding:7px 16px;
          background:rgba(226,75,74,.08);border-bottom:1px solid rgba(226,75,74,.3);
          flex-shrink:0;align-items:center;gap:8px;font-size:11px;color:var(--text)">
          <div style="width:7px;height:7px;border-radius:50%;background:#E24B4A;flex-shrink:0"></div>
          <span id="sw-bottleneck-text"></span>
        </div>

        <!-- Canvas row — flex:1 min-height:0 exactly like template dag-cards parent -->
        <div style="flex:1;min-height:0;position:relative;display:flex;overflow:hidden">
          <div id="inst-dag-canvas-wrap" style="flex:1;position:relative;overflow:hidden;cursor:grab">
            <canvas id="inst-dag-canvas" style="display:block;position:absolute;top:0;left:0"></canvas>
          </div>
          <!-- Slide-in CoC panel -->
          <div id="inst-dag-coc-panel" style="width:0;display:none;overflow:hidden;transition:width .22s cubic-bezier(.4,0,.2,1);
            border-left:0px solid var(--border);background:var(--bg1);flex-shrink:0;display:flex;flex-direction:column">
            <div style="padding:10px 14px;border-bottom:1px solid var(--border);flex-shrink:0">
              <span style="font-size:10px;font-weight:700;letter-spacing:.12em;color:var(--muted);text-transform:uppercase">Chain of Custody</span>
            </div>
            <div id="inst-dag-coc-body" style="flex:1;overflow-y:auto;padding:10px 14px;font-size:10px"></div>
          </div>
        </div>
        <!-- ── REWORK PANEL — flex-shrink:0 direct child, exactly like dag-cards ── -->
        <div id="inst-rework-panel" style="flex-shrink:0;border-top:1px solid var(--border);background:var(--bg1);display:flex;flex-direction:column;height:235px;overflow:hidden;min-height:235px;max-height:235px;position:relative">

          <!-- ── Swimlane overlay — shown when _swimlaneActive, hides replay content ── -->
          <div id="sw-info-panel" style="display:none;position:absolute;inset:0;z-index:10;
            background:var(--bg1);border-top:1px solid var(--border);
            flex-direction:column;overflow:hidden">
            <!-- Swimlane header -->
            <div style="display:flex;align-items:center;gap:10px;padding:6px 14px;
              border-bottom:1px solid var(--border);flex-shrink:0">
              <span style="font-size:11px;font-weight:700;letter-spacing:.1em;
                color:#00d2ff;white-space:nowrap">&#9711; SWIMLANE</span>
              <div style="display:flex;align-items:center;gap:14px;margin-left:8px;flex-wrap:wrap">
                <span style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted)">
                  <span style="display:inline-block;width:9px;height:9px;border-radius:50%;border:1.5px solid #fff"></span>You (selected instance)
                </span>
                <span style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted)">
                  <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#00d2ff"></span>In-progress sibling
                </span>
                <span style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted)">
                  <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#26e8a0"></span>Completed
                </span>
                <span style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted)">
                  <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#ff5f6b"></span>Blocked
                </span>
              </div>
              <span style="margin-left:auto;font-size:10px;color:var(--muted);font-style:italic">
                Hover cluster on diagram · hold 1.5s for briefing
              </span>
            </div>
            <!-- Swimlane instance list -->
            <div id="sw-info-body" style="flex:1;overflow-y:auto;padding:10px 14px;
              display:flex;flex-wrap:wrap;gap:10px;align-content:flex-start"></div>
          </div>

          <!-- ── History heat zone — shown when _historyActive ── -->
          <div id="hx-info-panel" style="display:none;position:absolute;inset:0;z-index:11;
            background:var(--bg1);border-top:1px solid var(--border);
            flex-direction:column;overflow:hidden">
            <!-- History header -->
            <div style="display:flex;align-items:center;gap:10px;padding:6px 14px;
              border-bottom:1px solid var(--border);flex-shrink:0">
              <span style="font-size:11px;font-weight:700;letter-spacing:.1em;
                color:#ff5f6b;white-space:nowrap">&#8629; HISTORY</span>
              <div style="display:flex;align-items:center;gap:14px;margin-left:8px;flex-wrap:wrap">
                <span style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted)">
                  <span style="display:inline-block;width:28px;height:6px;border-radius:3px;background:#5f78c8"></span>Low (1–3)
                </span>
                <span style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted)">
                  <span style="display:inline-block;width:28px;height:6px;border-radius:3px;background:#8c50c8"></span>Moderate (4–9)
                </span>
                <span style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted)">
                  <span style="display:inline-block;width:28px;height:6px;border-radius:3px;background:#b432dc"></span>High (10+) ▲ bottleneck
                </span>
              </div>
              <span style="margin-left:auto;font-size:10px;color:var(--muted);font-style:italic">
                Hover badge on diagram for breakdown
              </span>
            </div>
            <!-- Heat zone cards -->
            <div id="hx-info-body" style="flex:1;overflow-y:auto;padding:10px 14px;
              display:flex;flex-wrap:wrap;gap:10px;align-content:flex-start"></div>
          </div>
          <!-- Scrubber row -->
          <div style="display:flex;align-items:center;gap:10px;padding:6px 14px;border-bottom:1px solid var(--border);flex-shrink:0">
            <span style="font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--muted);white-space:nowrap">REPLAY</span>
            <!-- Event dot track -->
            <div id="inst-scrub-dots" style="position:relative;flex:1;height:24px;cursor:pointer" onclick="instScrubClick(event)">
              <!-- dots rendered by JS -->
            </div>
            <!-- Scrubber input -->
            <input type="range" id="inst-scrubber" min="0" max="100" value="100"
              oninput="instScrubChange(this.value)"
              style="width:160px;accent-color:var(--cad);cursor:pointer;flex-shrink:0"/>
            <span id="inst-scrub-label" style="font-size:11px;color:var(--muted);font-family:var(--font-mono);white-space:nowrap;min-width:110px;text-align:right">Live ◎</span>
            <button onclick="instScrubLive()" id="inst-scrub-live-btn"
              style="padding:5px 12px;font-size:12px;font-weight:700;background:var(--cad);border:none;
                border-radius:3px;color:var(--bg0);cursor:pointer;white-space:nowrap;letter-spacing:.04em">LIVE</button>
          </div>
          <!-- Note card row -->
          <div style="display:flex;gap:0;flex:1;overflow:hidden;min-height:0">
            <!-- Rework cost summary -->
            <div id="inst-rework-cost" style="width:280px;min-width:280px;max-width:280px;border-right:1px solid var(--border);
              padding:10px 14px;overflow-y:auto;font-size:12px;min-height:0"></div>
            <!-- Active event note -->
            <div id="inst-scrub-note" style="flex:1;padding:10px 14px;overflow-y:auto;min-width:0;min-height:0;font-size:12px"></div>
          </div>
        </div>
      </div>
    ` : `
      <!-- ── LIST VIEW ────────────────────────────────────────── -->
      <div style="flex:1;display:flex;overflow:hidden;min-height:0">

      <!-- Workflow Steps — fills remaining width -->
      <div style="flex:1;overflow-y:auto;padding:16px 20px;min-width:0">
        <div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
          color:var(--muted);margin-bottom:12px">Workflow Steps
          <span style="font-weight:400;font-size:10px;color:var(--muted);margin-left:8px">
            — click a step to start, complete, or reassign
          </span>
        </div>
        ${!steps.length
          ? `<div style="font-size:12px;color:var(--muted)">Template steps not loaded.</div>`
          : steps.map((s, idx) => {
              const meta     = STEP_META[s.step_type] || STEP_META.action;
              const isReset  = resetStepIds.has(s.id);
              const done     = completedStepIds.has(s.id);
              const rejected = rejectedStepIds.has(s.id);
              const touched  = activeStepIds.has(s.id)
                             && latestStepEvent[s.id]?.event_type === 'step_activated';
              const isSel    = selStep === s.id;
              const isLast   = idx === steps.length - 1;
              const reassign = reassignments[s.id];

              // Resolve outcome for completed steps
              const completionEvt = done
                ? coc.slice().reverse().find(e => e.event_type==='step_completed' && e.template_step_id===s.id)
                : null;
              const outcomeDef = completionEvt?.outcome
                ? _getOutcomes(s).find(o => o.id === completionEvt.outcome)
                : null;
              const isRejectedOutcome = !!(outcomeDef?.requiresReset);

              const isReady  = s.id === readyStepId;
              const outcomeColor = outcomeDef?.color || (done ? 'var(--green)' : null);
              const nodeColor = outcomeColor || (rejected?'var(--red)':touched?'var(--cad)':isReady?'var(--accent)':'var(--surf3)');
              const textColor = outcomeColor || (done?'var(--green)':rejected?'var(--red)':touched?'var(--text)':isReady?'var(--accent)':'var(--muted)');
              // Node icon: ✕ for rejected/reset outcomes, ✓ for clean completions
              const nodeIcon  = done
                ? (isRejectedOutcome ? '✕' : '✓')
                : rejected ? '✕' : meta.icon;

              // Current assignee — from reassignment CoC or template definition
              const assigneeDisplay = reassign
                ? `<span style="color:var(--accent)">↻ ${escHtml(reassign.assignee_name||reassign.assignee_email||'Reassigned')}</span>`
                : s.assignee_type === 'pm' ? 'Project Manager'
                : s.assignee_name || s.assignee_email || s.assignee_role
                  || (s.assignee_type === 'user' && _users_cad.find(u=>u.id===s.assignee_user_id)?.name)
                  || '—';

              return `
              <div style="display:flex;gap:0;margin-bottom:0" id="istep-${s.id}" data-tipstep="${s.id}">
                <div style="width:36px;flex-shrink:0;display:flex;flex-direction:column;align-items:center">
                  <div style="width:26px;height:26px;border-radius:50%;
                    background:${nodeColor};border:1.5px solid ${nodeColor};
                    display:flex;align-items:center;justify-content:center;
                    font-size:11px;color:${done||rejected||touched?'#fff':meta.badgeText};
                    cursor:pointer;flex-shrink:0;font-family:var(--font-hud)"
                    onclick="toggleInstanceStep('${inst.id}','${s.id}')">
                    ${nodeIcon}
                  </div>
                  ${!isLast?`<div style="width:2px;flex:1;min-height:${isSel?'0':'24'}px;background:${touched?'var(--border2)':'var(--border)'};margin:2px 0"></div>`:''}
                </div>
                <div style="flex:1;min-width:0;padding:3px 0 0 10px">
                  <!-- Step card — clickable -->
                  <div onclick="toggleInstanceStep('${inst.id}','${s.id}')"
                    style="cursor:pointer;padding:6px 10px;
                      border-radius:${isSel?'5px 5px 0 0':'5px'};
                      background:${isSel?'var(--surf2)':touched&&!done&&!rejected?'rgba(0,210,255,0.04)':'var(--bg2)'};
                      border:1px solid ${isSel?'var(--cad-wire)':touched&&!done&&!rejected?'var(--cad-wire)':'var(--border)'};
                      border-left:${touched&&!done&&!rejected?'5px solid var(--cad)':'1px solid '+(isSel?'var(--cad-wire)':'var(--border)')};
                      margin-bottom:0;transition:all .12s">
                    <div style="display:flex;align-items:center;gap:8px">
                      <!-- Step name + meta — grows to fill -->
                      <div style="flex:1;min-width:0">
                        <div style="font-size:12px;font-weight:700;color:var(--text)">
                          ${escHtml(s.name||meta.label)}
                        </div>
                        <div style="display:grid;grid-template-columns:130px 150px 100px 80px;gap:0 12px;margin-top:3px;align-items:center">
                          <span style="color:${meta.badgeText};font-size:10px;letter-spacing:.06em;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${meta.label}</span>
                          <span style="color:var(--text2);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${assigneeDisplay}</span>
                          <span style="font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${
                            done ? (() => {
                              const cEvt = coc.slice().reverse().find(e => e.event_type==='step_completed' && e.template_step_id===s.id);
                              const oLabel = cEvt?.outcome ? (_getOutcomes(s).find(o=>o.id===cEvt.outcome)?.label || cEvt.outcome) : 'Complete';
                              const oColor = cEvt?.outcome ? (_getOutcomes(s).find(o=>o.id===cEvt.outcome)?.color || 'var(--green)') : 'var(--green)';
                              return '<span style="color:'+oColor+'">&#10003; '+escHtml(oLabel)+'</span>';
                            })() :
                            rejected ? '<span style="color:var(--red)">&#10005; Rejected</span>' :
                            touched&&!done&&!rejected ? '<span style="font-size:10px;font-weight:700;color:var(--bg0);padding:2px 8px;border-radius:4px;background:var(--cad);letter-spacing:.06em">IN PROCESS</span>' :
                            isReady&&!touched ? '<span style="color:var(--accent)">&#9679; Ready</span>' : ''
                          }</span>
                          <span style="color:var(--muted);font-size:10px;white-space:nowrap">${s.due_days!=null?'&#9201; '+(s.due_type==='before_completion'?s.due_days+'d before':'&#43;'+s.due_days+'d'):''}</span>
                        </div>                      </div>
                      <!-- Rework badge — right side, left of timer -->
                      <span id="rwbadge-${s.id}" style="flex-shrink:0;margin-right:10px;text-align:right"></span>
                      <!-- History button -->
                      <button onclick="event.stopPropagation();_showStepTooltip('${s.id}',event)"
                        title="Step history"
                        style="flex-shrink:0;margin-right:8px;width:26px;height:26px;
                          border-radius:4px;border:1px solid var(--border);
                          background:var(--bg1);color:var(--muted);cursor:pointer;
                          font-size:12px;display:flex;align-items:center;justify-content:center;
                          transition:all .12s"
                        onmouseenter="this.style.borderColor='var(--cad)';this.style.color='var(--cad)'"
                        onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">
                        &#128336;
                      </button>
                      <!-- Elapsed timer — right justified, dd:hh:mm -->
                      ${(() => {
                        const activatedAt  = stepActivatedAt[s.id];
                        const completedAt  = stepCompletedAt[s.id];
                        const monoStyle    = 'font-family:var(--font-mono);font-size:13px;letter-spacing:.04em';
                        const labelStyle   = 'font-size:10px;text-transform:uppercase;letter-spacing:.1em;margin-top:1px';
                        
                        function calcElapsed(from, to) {
                          const ms = (to ? new Date(to) : new Date()) - new Date(from);
                          if (ms < 0) return '00:00:00';
                          const m = Math.floor(ms/60000), h = Math.floor(m/60), d = Math.floor(h/24);
                          return `${String(d).padStart(2,'0')}:${String(h%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
                        }
                        if (done && activatedAt) {
                          const elapsed = calcElapsed(activatedAt, completedAt);
                          return `<div style="text-align:right;flex-shrink:0">
                            <div style="${monoStyle};color:var(--green)">${elapsed}</div>
                            <div style="${labelStyle};color:var(--green)">Elapsed</div>
                          </div>`;
                        } else if (activatedAt) {
                          const elapsed = calcElapsed(activatedAt, null);
                          const timerColor = touched ? 'var(--cad)' : 'var(--accent)';
                          const timerLabel = touched ? 'Elapsed' : 'Pending';
                          return `<div style="text-align:right;flex-shrink:0">
                            <div id="timer-${s.id}" data-from="${activatedAt}"
                              style="${monoStyle};color:${timerColor}">${elapsed}</div>
                            <div style="${labelStyle};color:${timerColor}">${timerLabel}</div>
                          </div>`;
                        } else {
                          return `<div style="text-align:right;flex-shrink:0">
                            <div style="${monoStyle};color:${isReady?'var(--accent)':'var(--muted)'}">--:--:--</div>
                            <div style="${labelStyle};color:${isReady?'var(--accent)':'var(--muted)'}">
                              ${isReady ? 'Ready' : 'Waiting'}
                            </div>
                          </div>`;
                        }
                      })()}
                      <!-- Chevron -->
                      <span style="font-size:10px;color:var(--muted);flex-shrink:0;
                        transition:transform .15s;transform:rotate(${isSel?180:0}deg)">▼</span>
                    </div>
                  </div>

                  <!-- Inline config + reassignment panel -->
                  ${isSel ? `
                  <div style="border:1px solid var(--cad-wire);border-top:none;border-radius:0 0 5px 5px;
                    background:var(--bg1);padding:12px 14px;margin-bottom:0">

                    <!-- Config read-only summary — hidden for meeting steps (redundant with inline card) -->
                    ${s.step_type !== 'meeting' ? `
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;
                      font-size:11px;margin-bottom:12px;padding-bottom:12px;
                      border-bottom:1px solid var(--border)">
                      <div><span style="color:var(--muted);font-size:10px;letter-spacing:.1em;text-transform:uppercase">Due</span>
                        <div style="color:var(--text2);font-size:10px;margin-top:2px">${s.due_days!=null?(s.due_type==='before_completion'?s.due_days+'d before target':'+'+s.due_days+' business days'):'Not set'}</div></div>
                      ${s.escalate_after_days?`<div><span style="color:var(--muted);font-size:10px;letter-spacing:.1em;text-transform:uppercase">Escalate After</span>
                        <div style="color:var(--amber);font-size:10px;margin-top:2px">${s.escalate_after_days}d → ${s.escalate_to||'PM'}</div></div>`:''}
                      ${s.instructions?`<div style="grid-column:1/-1"><span style="color:var(--muted);font-size:10px;letter-spacing:.1em;text-transform:uppercase">Instructions</span>
                        <div style="color:var(--text2);font-size:11px;margin-top:2px;line-height:1.4">${escHtml(s.instructions)}</div></div>`:''}
                    </div>` : ''}

                    <!-- Meeting step: inline meeting card (populated by renderCadMeetingStep) -->
                    ${s.step_type === 'meeting' ? `
                    <div id="cad-meeting-${s.id}" style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)">
                      <div style="font-size:11px;color:var(--muted);padding:8px 0">Loading meeting…</div>
                    </div>` : ''}

                    <!-- Form step: inline fill panel (populated by renderFormFillPanel) -->
                    ${s.step_type === 'form' ? `
                    <div id="cad-form-${s.id}" style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)">
                      <div style="font-size:11px;color:var(--muted);padding:8px 0">Loading form…</div>
                    </div>` : ''}

                    ${(s._attachedDocs||[]).length ? `
                    <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)">
                      <div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
                        color:var(--muted);margin-bottom:6px">Attached Documents</div>
                      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
                        ${(s._attachedDocs||[]).map(d => {
                          const roleColor = d.role==='authorization'?'var(--amber)':d.role==='evidence'?'var(--green)':'var(--accent)';
                          const roleIcon  = d.role==='authorization'?'⬆':d.role==='evidence'?'📝':'📋';
                          return `<div class="attached-doc" style="gap:6px">
                            <span style="color:${roleColor};flex-shrink:0">${roleIcon}</span>
                            <span class="attached-doc-name" style="flex:1;font-size:11px">${escHtml(d.name)}</span>
                            <span style="font-size:10px;color:var(--cad);font-family:var(--font-mono);flex-shrink:0;white-space:nowrap">${escHtml(d.version||'')}</span>
                            ${d.url?`<button class="attached-doc-remove" style="color:var(--accent)"
                              onclick="window.open('${d.url}','_blank')" title="View">⤢</button>`:''}
                          </div>`;
                        }).join('')}
                      </div>
                    </div>` : ''}

                    <!-- Reassignment section — always collapsed behind toggle -->
                    ${canAct ? `
                    <div style="margin-top:4px">
                      <button onclick="toggleCadReassign('${s.id}')"
                        style="background:none;border:none;cursor:pointer;padding:0;
                          display:flex;align-items:center;gap:5px;
                          font-size:10px;font-weight:600;letter-spacing:.12em;
                          text-transform:uppercase;color:var(--muted)">
                        <span id="cad-reassign-chevron-${s.id}"
                          style="font-size:10px;transition:transform .2s">▶</span>
                        ↻ Reassign for This Instance
                      </button>
                      <div id="cad-reassign-panel-${s.id}" style="display:none;margin-top:8px">

                      <!-- Current assignees — compact chips with ✕ on reassigned -->
                      <div id="reassign-list-${s.id}" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;min-height:24px">
                        ${(() => {
                          const list = [];
                          const templateName = s.assignee_type==='pm' ? 'Project Manager'
                            : s.assignee_name || s.assignee_email || s.assignee_role
                              || (_users_cad.find(u=>u.id===s.assignee_user_id)?.name) || null;
                          // Check if template assignee has been overridden
                          const templateOverridden = coc.some(e =>
                            e.event_type==='step_assignee_override' && e.template_step_id===s.id);
                          if (templateName && !templateOverridden)
                            list.push({ name: templateName, source: 'template' });
                          coc.filter(e=>e.event_type==='step_reassigned'&&e.template_step_id===s.id).forEach(r => {
                            if (r.assignee_name||r.assignee_email) {
                              // Skip if a removal tombstone exists for this CoC event's assignee
                              const removed = coc.some(e =>
                                e.event_type==='step_reassignment_removed' &&
                                e.template_step_id===s.id &&
                                (e.assignee_name===r.assignee_name||e.assignee_email===r.assignee_email));
                              if (!removed)
                                list.push({ name: r.assignee_name||r.assignee_email,
                                  source: 'reassigned', cocId: r.id });
                            }
                          });
                          return list.map(a => `
                            <span style="display:inline-flex;align-items:center;gap:5px;
                              padding:3px 8px 3px 10px;border-radius:12px;font-size:11px;
                              background:${a.source==='reassigned'?'rgba(79,142,247,.15)':'var(--surf3)'};
                              border:1px solid ${a.source==='reassigned'?'rgba(79,142,247,.35)':'var(--border2)'};
                              color:${a.source==='reassigned'?'var(--accent)':'var(--text2)'}">
                              ${escHtml(a.name)}
                              <button onclick="${a.source==='reassigned'
                                ? `removeReassignment('${inst.id}','${s.id}','${a.cocId}')`
                                : `overrideTemplateAssignee('${inst.id}','${s.id}')`}"
                                style="background:none;border:none;
                                color:${a.source==='reassigned'?'rgba(79,142,247,.6)':'rgba(255,255,255,.3)'};
                                cursor:pointer;font-size:11px;padding:0;line-height:1;margin-left:2px"
                                title="Remove">✕</button>
                            </span>`).join('')
                          || '<span style="font-size:10px;color:var(--muted)">No assignee set</span>';
                        })()}
                      </div>

                      <!-- Add assignee — grouped by department/external -->
                      <div style="display:grid;grid-template-columns:1fr auto;gap:6px;align-items:end;margin-bottom:8px">
                        <div>
                          <label style="font-size:10px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;display:block;margin-bottom:4px">Add Assignee</label>
                          <select class="config-select" id="reassign-res-${s.id}" style="font-size:11px">
                            ${renderResourceOptions('', '— Select resource —')}
                          </select>
                        </div>
                        <button class="btn btn-solid btn-sm" style="font-size:10px;white-space:nowrap"
                          onclick="addReassignment('${inst.id}','${s.id}')">+ Add</button>
                      </div>
                      <!-- External override fields (shown when external resource selected or step is external) -->
                      ${s.assignee_type==='external'?`
                      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
                        <div>
                          <label style="font-size:10px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;display:block;margin-bottom:3px">Name Override</label>
                          <input class="config-input" id="reassign-name-${s.id}" style="font-size:11px"
                            value="${escHtml(reassign?.assignee_name||s.assignee_name||'')}"
                            placeholder="Full name" />
                        </div>
                        <div>
                          <label style="font-size:10px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;display:block;margin-bottom:3px">Email Override</label>
                          <input class="config-input" id="reassign-email-${s.id}" type="email" style="font-size:11px"
                            value="${escHtml(reassign?.assignee_email||s.assignee_email||'')}"
                            placeholder="email@example.com" />
                        </div>
                      </div>`:''}
                      <span id="reassign-status-${s.id}" style="font-size:10px;color:var(--muted)"></span>

                    ${s.step_type === 'meeting' ? `</div></div>` : `</div></div>`}` : `
                    <div style="font-size:10px;color:var(--muted)">
                      Instance is ${inst.status} — reassignment not available.
                    </div>`}

                    <!-- Complete Step — outcome selection (shown when step is active or ready, not yet done) -->
                    ${canAct && (touched || isReady) && !done ? `
                    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
                      <div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
                        color:var(--muted);margin-bottom:8px">Complete this step</div>

                      <!-- Tier 1: Semantic outcome buttons — hollow dot, fills on select -->
                      <div style="display:flex;flex-direction:column;gap:5px" id="outcome-btns-${s.id}">
                        ${_getOutcomes(s).map(o => `
                        <button id="obtn-${s.id}-${o.id}"
                          onclick="selectOutcome('${s.id}','${escHtml(o.id)}',${!!o.requiresReset},${!!o.requiresSuspend})"
                          style="display:flex;align-items:center;gap:10px;padding:9px 12px;
                            border:1px solid ${o.color}55;border-radius:6px;
                            background:${o.color}0a;cursor:pointer;text-align:left;width:100%;
                            transition:background .12s;position:relative"
                          onmouseover="if(!this.classList.contains('selected'))this.style.background='${o.color}1e'"
                          onmouseout="if(!this.classList.contains('selected'))this.style.background='${o.color}0a'">
                          <div id="obtn-dot-${s.id}-${o.id}"
                            style="width:9px;height:9px;border-radius:50%;flex-shrink:0;
                              pointer-events:none;
                              border:1.5px solid ${o.color};background:transparent"></div>
                          <span style="font-size:12px;font-weight:500;color:${o.color};
                            pointer-events:none">${escHtml(o.label)}</span>
                          ${o.holdsForActions ? `<span style="margin-left:auto;font-size:10px;color:${o.color};opacity:.7;pointer-events:none">holds until actions resolve</span>` : ''}
                          ${o.requiresSuspend ? `<span style="margin-left:auto;font-size:10px;color:${o.color};opacity:.7;pointer-events:none">suspends instance</span>` : ''}
                        </button>`).join('')}
                      </div>

                      <!-- Notes — required for reset/reject outcomes, optional otherwise -->
                      <div style="margin-top:8px">
                        <label id="complete-notes-label-${s.id}"
                          style="font-size:10px;color:var(--muted);letter-spacing:.1em;
                          text-transform:uppercase;display:block;margin-bottom:3px">
                          Notes (optional)
                        </label>
                        <textarea id="complete-notes-${s.id}" class="config-textarea"
                          style="font-size:11px;resize:vertical;min-height:48px"
                          placeholder="Add context, reason, or summary…"></textarea>
                      </div>

                      <!-- Routing disposition — hidden until a reset outcome is selected -->
                      <div id="routing-disposition-${s.id}" style="display:none;margin-top:10px">
                        <div style="font-size:10px;font-weight:600;letter-spacing:.12em;
                          text-transform:uppercase;color:var(--muted);margin-bottom:6px">
                          Return workflow to
                        </div>
                        <div style="display:flex;flex-direction:column;gap:4px" id="route-options-${s.id}">
                          <!-- Populated by selectOutcome based on prior steps -->
                        </div>
                      </div>

                      <!-- Suspend condition — hidden until a suspend outcome is selected -->
                      <div id="suspend-condition-wrap-${s.id}" style="display:none;margin-top:8px">
                        <label style="font-size:10px;color:var(--muted);letter-spacing:.1em;
                          text-transform:uppercase;display:block;margin-bottom:3px">
                          Condition to re-activate</label>
                        <input class="config-input" id="suspend-condition-${s.id}"
                          style="font-size:11px" placeholder="e.g. Revised design package received" />
                      </div>

                      <!-- Routing override — collapsed opt-in for non-reset outcomes -->
                      <div id="routing-override-${s.id}" style="display:none;margin-top:10px;
                        border:1px solid var(--border);border-radius:6px;overflow:hidden">
                        <button onclick="toggleRoutingOverride('${s.id}')"
                          style="width:100%;padding:8px 12px;background:var(--bg2);border:none;
                            cursor:pointer;display:flex;align-items:center;justify-content:space-between;
                            font-size:10px;color:var(--muted);text-align:left">
                          <span>↩ Override routing</span>
                          <span id="routing-chevron-${s.id}" style="font-size:10px;transition:transform .15s">▶</span>
                        </button>
                        <div id="routing-body-${s.id}" style="display:none;padding:10px 12px;
                          border-top:1px solid var(--border);background:var(--bg1)">
                          <label style="font-size:10px;color:var(--muted);letter-spacing:.1em;
                            text-transform:uppercase;display:block;margin-bottom:4px">Return to step</label>
                          <select id="route-target-${s.id}" class="config-select" style="font-size:11px;width:100%">
                            <option value="">— Advance normally —</option>
                            ${(inst._tmplSteps||[])
                              .filter(ps => ps.sequence_order < s.sequence_order)
                              .sort((a,b) => b.sequence_order - a.sequence_order)
                              .map(ps => `<option value="${ps.id}">${ps.sequence_order}. ${escHtml(ps.name||STEP_META[ps.step_type]?.label||'Step')}</option>`)
                              .join('')}
                          </select>
                        </div>
                      </div>

                      <!-- Submit button — appears once outcome + any required disposition is selected -->
                      <button id="complete-submit-${s.id}" style="display:none;margin-top:10px;
                        width:100%;padding:9px;border-radius:6px;border:none;
                        background:var(--cad);color:#fff;font-size:12px;font-weight:600;
                        cursor:pointer;letter-spacing:.02em"
                        onclick="submitComplete('${inst.id}','${s.id}')">
                        Complete step
                      </button>
                    </div>` : ''}

                    <!-- Already completed — show outcome badge -->
                    ${done ? (() => {
                      const completionEvt = coc.slice().reverse().find(e =>
                        e.event_type === 'step_completed' && e.template_step_id === s.id);
                      const outDef   = completionEvt?.outcome
                        ? _getOutcomes(s).find(o => o.id === completionEvt.outcome)
                        : null;
                      const outLabel = outDef?.label || completionEvt?.outcome || 'Completed';
                      const outColor = outDef?.color || 'var(--green)';
                      const actor    = completionEvt?.actor_name;
                      const notes    = completionEvt?.event_notes;
                      const routeTo  = completionEvt?.route_to_step_name;
                      return `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:${notes||routeTo?'6px':'0'}">
                          <div style="width:8px;height:8px;border-radius:50%;background:${outColor};flex-shrink:0"></div>
                          <span style="font-size:12px;color:${outColor};font-weight:500">${escHtml(outLabel)}</span>
                          ${actor?`<span style="font-size:10px;color:var(--muted);margin-left:auto">by ${escHtml(actor)}</span>`:''}
                        </div>
                        ${routeTo?`<div style="font-size:10px;color:var(--amber);margin-top:3px">↩ Returns to: ${escHtml(routeTo)}</div>`:''}
                        ${notes?`<div style="font-size:11px;color:var(--text2);margin-top:4px;line-height:1.4;
                          padding:6px 8px;background:var(--bg2);border-radius:4px;
                          border-left:2px solid ${outColor}">${escHtml(notes)}</div>`:''}
                      </div>`;
                    })() : ''}

                  </div>` : ''}

                  <!-- ── Step Comment Thread ─────────────────────────────── -->
                  ${isSel ? `
                  <div style="border:1px solid var(--border);border-top:none;
                    border-radius:0 0 5px 5px;background:var(--bg1);
                    padding:10px 14px 12px;margin-bottom:0">

                    <!-- Thread header -->
                    <div style="font-size:10px;font-weight:600;letter-spacing:.12em;
                      text-transform:uppercase;color:var(--muted);margin-bottom:8px;
                      display:flex;align-items:center;gap:8px">
                      <span>&#9997; Comments</span>
                      <span id="comment-count-${s.id}" style="color:var(--text2);font-weight:400"></span>
                      <div style="flex:1"></div>
                      <button onclick="openDirectActionItem('${s.id}')"
                        style="font-size:10px;font-weight:600;letter-spacing:.08em;
                          text-transform:uppercase;padding:3px 10px;
                          background:rgba(79,142,247,.1);border:1px solid rgba(79,142,247,.35);
                          border-radius:3px;color:var(--accent);cursor:pointer;
                          white-space:nowrap;transition:all .12s"
                        onmouseenter="this.style.background='rgba(79,142,247,.2)'"
                        onmouseleave="this.style.background='rgba(79,142,247,.1)'">
                        &#43; Add Action Item
                      </button>
                    </div>

                    <!-- Existing comments -->
                    <div id="comment-thread-${s.id}" style="margin-bottom:8px"></div>

                    <!-- Action items for this step -->
                    <div id="action-items-${s.id}" style="margin-bottom:8px"></div>

                    <!-- New comment input -->
                    <div style="border:1px solid var(--border);border-radius:5px;
                      background:var(--bg2);overflow:hidden">
                      <!-- Confidence + flags row -->
                      <div style="display:flex;align-items:center;gap:6px;
                        padding:6px 10px;border-bottom:1px solid var(--border)">
                        <span style="font-size:10px;color:var(--muted);letter-spacing:.06em;
                          text-transform:uppercase;margin-right:2px">Signal</span>
                        <button id="conf-green-${s.id}" onclick="setCommentConf('${s.id}','green')"
                          title="On track"
                          style="width:18px;height:18px;border-radius:50%;border:2px solid var(--green);
                            background:transparent;cursor:pointer;transition:all .12s;flex-shrink:0"></button>
                        <button id="conf-yellow-${s.id}" onclick="setCommentConf('${s.id}','yellow')"
                          title="Uncertain"
                          style="width:18px;height:18px;border-radius:50%;border:2px solid var(--amber);
                            background:transparent;cursor:pointer;transition:all .12s;flex-shrink:0"></button>
                        <button id="conf-red-${s.id}" onclick="setCommentConf('${s.id}','red')"
                          title="Blocked"
                          style="width:18px;height:18px;border-radius:50%;border:2px solid var(--red);
                            background:transparent;cursor:pointer;transition:all .12s;flex-shrink:0"></button>
                        <div style="width:1px;height:14px;background:var(--border);margin:0 4px"></div>
                        <span style="font-size:10px;color:var(--muted);letter-spacing:.06em;
                          text-transform:uppercase;margin-right:4px">Hours Worked</span>
                        <input id="comment-hours-${s.id}" type="number" min="0" max="24" step="0.25"
                          placeholder="0.0" oninput="_validateCommentPost('${s.id}')"
                          style="width:52px;font-size:11px;padding:2px 6px;
                            background:var(--bg1);border:1px solid var(--border);
                            border-radius:3px;color:var(--text);font-family:var(--font-mono)" />
                        <div style="flex:1"></div>
                        <span id="conf-label-${s.id}" style="font-size:10px;color:var(--muted);font-style:italic"></span>
                      </div>
                      <!-- Text area -->
                      <textarea id="comment-body-${s.id}"
                        placeholder="Add a note, flag a risk, log progress…"
                        oninput="_validateCommentPost('${s.id}')"
                        style="width:100%;box-sizing:border-box;padding:8px 10px;
                          font-size:11px;line-height:1.5;resize:vertical;min-height:56px;
                          background:transparent;border:none;color:var(--text);
                          font-family:var(--font-body);outline:none"></textarea>
                      <!-- Submit row -->
                      <div style="display:flex;justify-content:flex-end;gap:6px;
                        padding:5px 8px;border-top:1px solid var(--border)">
                        <span id="comment-status-${s.id}" style="font-size:10px;
                          color:var(--muted);align-self:center"></span>
                        <button onclick="postStepComment('${inst.id}','${s.id}')"
                          style="font-size:10px;font-weight:600;padding:4px 14px;
                            background:var(--cad);color:#fff;border:none;
                            border-radius:4px;cursor:pointer;letter-spacing:.04em">
                          Post
                        </button>
                      </div>
                    </div>
                  </div>` : ''}

                  <div style="height:${isSel?'4':'20'}px"></div>
                </div>
              </div>`;
            }).join('')}
      </div>

      <!-- Chain of Custody — fixed 300px right -->
      <div style="width:300px;flex-shrink:0;border-left:1px solid var(--border);overflow-y:auto;padding:16px">
        <div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
          color:var(--muted);margin-bottom:12px">Chain of Custody</div>
        ${!coc.length
          ? `<div style="font-size:11px;color:var(--muted)">No events yet.</div>`
          : coc.slice().reverse().map(evt => {
              const color = evtColor[evt.event_type] || 'var(--muted)';
              const label = evtLabel[evt.event_type] || evt.event_type?.replace(/_/g,' ');
              const step  = steps.find(s => s.id === evt.template_step_id);
              const ts    = evt.created_at ? new Date(evt.created_at) : null;
              return `
              <div style="display:flex;gap:8px;margin-bottom:12px">
                <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:14px">
                  <div style="width:7px;height:7px;border-radius:50%;background:${color};margin-top:3px;flex-shrink:0"></div>
                  <div style="width:1px;flex:1;min-height:8px;background:var(--border);margin-top:2px"></div>
                </div>
                <div style="flex:1;min-width:0;padding-bottom:2px">
                  <div style="font-size:10px;font-weight:600;color:${color}">${label}</div>
                  ${step?`<div style="font-size:10px;color:var(--muted);margin-top:1px">→ ${escHtml(step.name||'')}</div>`:''}
                  ${evt.outcome ? (() => {
                    const outDef = step ? _getOutcomes(step).find(o => o.id === evt.outcome) : null;
                    const outColor = outDef?.color || color;
                    const outLabel = outDef?.label || evt.outcome;
                    return `<div style="display:inline-flex;align-items:center;gap:5px;margin-top:3px;
                      padding:2px 8px;border-radius:10px;
                      background:${outColor}22;border:1px solid ${outColor}55">
                      <div style="width:6px;height:6px;border-radius:50%;background:${outColor};flex-shrink:0"></div>
                      <span style="font-size:10px;font-weight:500;color:${outColor}">${escHtml(outLabel)}</span>
                    </div>`;
                  })() : ''}
                  ${evt.route_to_step_name ? `
                    <div style="font-size:10px;color:var(--amber);margin-top:3px;display:flex;align-items:center;gap:4px">
                      <span>↩</span>
                      <span>Returns to: ${escHtml(evt.route_to_step_name)}</span>
                    </div>` : ''}
                  ${evt.suspend_condition ? `
                    <div style="font-size:10px;color:var(--muted);margin-top:2px;
                      padding:3px 6px;background:var(--surf2);border-left:2px solid var(--amber)">
                      Awaiting: ${escHtml(evt.suspend_condition)}
                    </div>` : ''}
                  ${evt.actor_name?`<div style="font-size:10px;color:var(--text2)">By ${escHtml(evt.actor_name)}</div>`:''}
                  ${evt.notes||evt.event_notes?`<div style="font-size:10px;color:var(--text2);margin-top:2px;
                    padding:3px 6px;background:var(--surf2);border-left:2px solid ${color}">
                    ${escHtml(evt.notes||evt.event_notes)}</div>`:''}
                  ${ts?`<div style="font-size:10px;color:var(--muted);margin-top:1px;font-family:var(--font-mono)">
                    ${ts.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</div>`:''}
                </div>
              </div>`;
            }).join('')}
      </div>

      </div>

    </div>
    `}
    </div>
    </div>`; // close outer body flex and root wrapper

  // Start live tick for active step timers (dd:hh:mm updates every 30s)
  _startElapsedTimer(inst);

  // If diagram mode, render the instance DAG after DOM settles
  // Mirror the template DAG technique: explicitly set flex styles on container first,
  // then let browser do a layout pass before measuring
  if (viewMode === 'diagram') {
    const wrap = document.getElementById('inst-dag-wrap');
    if (wrap) {
      wrap.style.display        = 'flex';
      wrap.style.flexDirection  = 'column';
      wrap.style.flex           = '1';
      wrap.style.minHeight      = '0';
    }
    const canvasWrap = document.getElementById('inst-dag-canvas-wrap');
    if (canvasWrap) {
      canvasWrap.style.flex     = '1';
      canvasWrap.style.minHeight = '0';
    }
    setTimeout(() => {
      renderInstanceDAG(inst);
      _instInitScrubber(inst);
      // Re-render dots after layout settles so SVG width is correct
      setTimeout(() => _instRenderDots(_instScrubEvents, _instScrubEvents.length-1), 100);
    }, 50);
  }

  // Populate rework badges after DOM settles
  setTimeout(_populateReworkBadges, 150);
  setTimeout(_populateAllCommentThreads, 100);

  // Resolve linked task name asynchronously if bound
  if (inst.source_task_id) {
    setTimeout(() => _resolveLinkedTaskName(inst.id, inst.source_task_id), 80);
  }
}

function setInstViewMode(mode) {
  if (!_selectedInstance) return;
  // Kill any running pulse animation before switching modes
  if (_instDagPulseFrame) { cancelAnimationFrame(_instDagPulseFrame); _instDagPulseFrame = null; }
  _instDagFitted = false;
  _selectedInstance._viewMode = mode;
  // Reset CoC panel to closed state when switching to diagram
  if (mode === 'diagram') {
    const cocPanel = document.getElementById('inst-dag-coc-panel');
    if (cocPanel) { cocPanel.style.width='0'; cocPanel.style.borderLeftWidth='0'; cocPanel.style.display='none'; }
    const cocBtn = document.getElementById('inst-dag-coc-btn');
    if (cocBtn) { cocBtn.textContent='CoC ▸'; cocBtn.style.color='var(--muted)'; }
    // Lazy-load sibling CoCs for swimlane health classification
    if (_swimlaneActive) _swLoadSiblingData(_selectedInstance);
  }
  const el = document.getElementById('instance-detail');
  if (el) renderInstanceDetail(el, _selectedInstance);
  setTimeout(_populateReworkBadges, 50);
  // Update bottleneck banner
  setTimeout(() => _swUpdateBottleneckBanner(_selectedInstance), 100);
}

function toggleInstanceStep(instId, stepId) {
  const inst = _instances.find(i => i.id === instId);
  if (!inst) return;
  inst._selectedStep = inst._selectedStep === stepId ? null : stepId;
  const detailEl = document.getElementById('instance-detail');
  if (detailEl) renderInstanceDetail(detailEl, inst);
  if (inst._selectedStep === stepId) {
    const step = inst._tmplSteps?.find(s => s.id === stepId);
    if (step?.step_type === 'meeting') {
      setTimeout(() => renderCadMeetingStep(inst, step), 60);
    }
    if (step?.step_type === 'form') {
      setTimeout(() => renderFormFillPanel(inst, step), 60);
    }
    setTimeout(() => {
      _renderCommentThread(stepId);
      _renderActionItems(stepId);
    }, 60);
  }
}

async function startStep(instId, stepId) {
  try {
    const inst = _instances.find(i => i.id === instId);
    const step = inst?._tmplSteps?.find(s => s.id === stepId);
    await API.post('workflow_step_instances', {
      instance_id:      instId,
      firm_id:          FIRM_ID_CAD,
      event_type:       'step_activated',
      template_step_id: stepId,
      step_type:        step?.step_type || 'action',
      step_name:        step?.name || null,
      created_at:       new Date().toISOString(),
    });
    // Update current_step_id for Swimlane tracking
    API.patch(`workflow_instances?id=eq.${instId}`, {
      current_step_id:   stepId,
      current_step_name: step?.name || null,
      current_step_type: step?.step_type || null,
    }).catch(() => {});
    if (inst) {
      inst.current_step_id   = stepId;
      inst.current_step_name = step?.name || null;
      inst.current_step_type = step?.step_type || null;
    }
    _notifyStepActivated(instId, step, inst).catch(() => {});
    await _reloadInstance(instId);
    cadToast('Step started — elapsed timer running', 'success');
  } catch(e) {
    cadToast('Failed to start step: ' + e.message, 'error');
  }
}

function selectOutcome(stepId, outcomeId, requiresReset, requiresSuspend) {
  // Resolve outcome definition
  const outcome = _instances.flatMap(i => i._tmplSteps||[])
    .flatMap(s => _getOutcomes(s))
    .find(o => o.id === outcomeId);

  // Deselect all buttons — restore hollow dots and original backgrounds
  document.querySelectorAll(`#outcome-btns-${stepId} button`).forEach(b => {
    b.classList.remove('selected');
    b.style.outline    = 'none';
    b.style.boxShadow  = 'none';
    // Restore original faint background from the button's border color
    const borderColor = b.style.borderColor || '';
    const hex = borderColor.replace(/55$/, '');
    b.style.background = hex ? hex + '0a' : '';
    const dot = b.querySelector('[id^="obtn-dot-"]');
    if (dot) dot.style.background = 'transparent';
  });

  // Select clicked button — fill dot, outline only (no box-shadow)
  const btn = document.getElementById(`obtn-${stepId}-${outcomeId}`);
  if (btn) {
    btn.classList.add('selected');
    btn.style.outline    = '2px solid currentColor';
    btn.style.boxShadow  = 'none';
    const dot = document.getElementById(`obtn-dot-${stepId}-${outcomeId}`);
    if (dot) {
      const color = dot.style.borderColor || 'currentColor';
      dot.style.background = color;
    }
  }

  // Store selection
  const container = document.getElementById(`outcome-btns-${stepId}`);
  if (container) container.dataset.selected = outcomeId;

  // Notes — required for reset outcomes, optional for others
  const notesLabel    = document.getElementById(`complete-notes-label-${stepId}`);
  const notesTextarea = document.getElementById(`complete-notes-${stepId}`);
  if (requiresReset) {
    if (notesLabel)    notesLabel.innerHTML =
      'Notes <span style="color:var(--red)">*</span><span style="color:var(--muted)"> — required for this outcome</span>';
    if (notesTextarea) {
      notesTextarea.placeholder = 'Required — explain reason for rejection or reset…';
      notesTextarea.style.borderColor = 'var(--red)44';
    }
  } else {
    if (notesLabel)    notesLabel.textContent = 'Notes (optional)';
    if (notesTextarea) {
      notesTextarea.placeholder = 'Add context, reason, or summary…';
      notesTextarea.style.borderColor = '';
    }
  }

  // Hide all disposition panels and submit button first — clean slate
  const dispEl     = document.getElementById(`routing-disposition-${stepId}`);
  const overrideEl = document.getElementById(`routing-override-${stepId}`);
  const suspendEl  = document.getElementById(`suspend-condition-wrap-${stepId}`);
  const submitBtn  = document.getElementById(`complete-submit-${stepId}`);
  if (dispEl)     dispEl.style.display     = 'none';
  if (overrideEl) overrideEl.style.display = 'none';
  if (suspendEl)  suspendEl.style.display  = 'none';
  if (submitBtn)  submitBtn.style.display  = 'none';

  // Clear route-target hidden field
  const hiddenRoute = document.getElementById(`route-target-${stepId}`);
  if (hiddenRoute) hiddenRoute.value = '';

  if (requiresSuspend) {
    if (suspendEl) suspendEl.style.display = 'block';
    if (submitBtn) {
      submitBtn.style.display = 'block';
      submitBtn.textContent   = 'Suspend instance';
    }

  } else if (requiresReset) {
    if (dispEl) {
      dispEl.style.display = 'block';
      const inst    = _selectedInstance;
      const currSeq = inst?._tmplSteps?.find(s => s.id === stepId)?.sequence_order || 999;
      const prior   = (inst?._tmplSteps || [])
        .filter(s => s.step_type !== 'trigger' && s.sequence_order < currSeq)
        .sort((a, b) => a.sequence_order - b.sequence_order);

      const optionsEl = document.getElementById(`route-options-${stepId}`);
      if (optionsEl) {
        const firstStep = prior[0];
        const prevStep  = prior[prior.length - 1];

        const makeRouteBtn = (label, stepId2, targetId) => `
          <button onclick="selectRoute('${stepId}','${targetId || ''}')"
            id="rbtn-${stepId}-${targetId||'first'}"
            style="display:flex;align-items:center;gap:8px;padding:8px 12px;
              border:1px solid var(--border);border-radius:5px;background:var(--bg2);
              cursor:pointer;text-align:left;width:100%;font-size:11px;
              color:var(--text2);transition:background .1s"
            onmouseover="this.style.background='var(--surf2)'"
            onmouseout="this.style.background=this.classList.contains('selected-route')?'var(--surf3)':'var(--bg2)'">
            <span style="color:var(--red);font-size:10px;width:12px">↩</span>
            ${escHtml(label)}
          </button>`;

        let html = '';
        if (firstStep) {
          html += makeRouteBtn(`Reset to beginning — ${firstStep.name}`, stepId, firstStep.id);
        }
        if (prevStep && prevStep.id !== firstStep?.id) {
          html += makeRouteBtn(`Back one step — ${prevStep.name}`, stepId, prevStep.id);
        }
        if (prior.length > 2) {
          prior.slice().reverse().forEach(ps => {
            if (ps.id !== firstStep?.id && ps.id !== prevStep?.id) {
              html += makeRouteBtn(ps.name, stepId, ps.id);
            }
          });
        }
        optionsEl.innerHTML = html;
      }
    }
    // submitBtn stays hidden until a route is chosen via selectRoute()

  } else {
    // Normal outcome — show optional routing override and submit button
    if (overrideEl) overrideEl.style.display = 'block';
    if (submitBtn) {
      submitBtn.style.display = 'block';
      submitBtn.textContent   = 'Complete step';
    }
  }
}

function selectRoute(stepId, targetStepId) {
  // Highlight selected route button
  document.querySelectorAll(`#route-options-${stepId} button`).forEach(b => {
    b.classList.remove('selected-route');
    b.style.background   = 'var(--bg2)';
    b.style.borderColor  = 'var(--border)';
    b.style.color        = 'var(--text2)';
  });
  const btn = document.getElementById(`rbtn-${stepId}-${targetStepId || 'first'}`);
  if (btn) {
    btn.classList.add('selected-route');
    btn.style.background  = 'var(--surf3)';
    btn.style.borderColor = 'var(--red)';
    btn.style.color       = 'var(--text)';
  }

  // Store the route target in the hidden select (reuse existing route-target element)
  let hiddenRoute = document.getElementById(`route-target-${stepId}`);
  if (!hiddenRoute) {
    hiddenRoute = document.createElement('input');
    hiddenRoute.type = 'hidden';
    hiddenRoute.id   = `route-target-${stepId}`;
    document.getElementById(`routing-disposition-${stepId}`)?.appendChild(hiddenRoute);
  }
  hiddenRoute.value = targetStepId || '';

  // Show submit button now that route is chosen
  const submitBtn = document.getElementById(`complete-submit-${stepId}`);
  if (submitBtn) {
    submitBtn.style.display = 'block';
    submitBtn.textContent   = 'Complete step';
  }
}

function toggleRoutingOverride(stepId) {
  const body    = document.getElementById(`routing-body-${stepId}`);
  const chevron = document.getElementById(`routing-chevron-${stepId}`);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display    = open ? 'none' : 'block';
  if (chevron) chevron.style.transform = open ? '' : 'rotate(90deg)';
}

async function _notifyStepActivated(instId, step, inst, isBist = false) {
  if (isBist) return; // never notify for test runs
  const hasAssignee = (step?.assignee_email && step.assignee_email.trim())
    || (step?.assignee_user_id && step.assignee_user_id.trim())
    || (step?.assignee_resource_id && step.assignee_resource_id.trim());
  if (!hasAssignee) return; // no addressee

  // Resolve assignee email — from step directly, user record, or resource record
  let assigneeEmail = step.assignee_email || null;
  let assigneeName  = step.assignee_name  || null;

  if (!assigneeEmail && step.assignee_user_id) {
    const u = _users_cad.find(u => u.id === step.assignee_user_id);
    assigneeEmail = u?.email || null;
    if (!assigneeName) {
      const r = _resources_cad.find(r => r.id === u?.resource_id);
      assigneeName  = r?.name || u?.name || null;
      assigneeEmail = assigneeEmail || r?.email || null;
    }
  }

  // Final fallback — look up resource directly by assignee_resource_id
  if (!assigneeEmail && step.assignee_resource_id) {
    const r = _resources_cad.find(r => r.id === step.assignee_resource_id);
    assigneeEmail = r?.email || null;
    if (!assigneeName) assigneeName = r?.name || null;
  }

  if (!assigneeEmail) return; // still no email — skip silently

  // Resolve launcher name
  const launcher = inst?.launched_by
    ? (_users_cad.find(u => u.id === inst.launched_by)?.name ||
       _resources_cad.find(r => r.id === inst.launched_by)?.name || null)
    : null;

  // ── External response token generation ───────────────────────────────────
  // Generate a signed token for approval/signoff/review/external steps so
  // the assignee can respond directly from email without logging in.
  const _externalStepTypes = ['approval','signoff','review','external','confirmation'];
  let approveUrl  = null;
  let rejectUrl   = null;
  let tokenRecord = null;

  if (_externalStepTypes.includes(step.step_type)) {
    try {
      // Build token: UUID + HMAC-style binding string (firm:instance:step)
      const rawToken   = crypto.randomUUID();
      const bindingStr = `${FIRM_ID_CAD}:${instId}:${step.id}`;
      // Simple deterministic hash for tamper detection (not cryptographic HMAC —
      // true HMAC requires the Edge Function for secret key; this is a client-side
      // binding signal that the Edge Function validates against the stored record)
      const encoder  = new TextEncoder();
      const hashBuf  = await crypto.subtle.digest('SHA-256', encoder.encode(bindingStr + rawToken));
      const tokenHmac = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2,'0')).join('').slice(0,32);

      // Snapshot outcomes at token generation time
      const outcomesSnapshot = _getOutcomes(step);

      // PM identity
      const pmResource = _resources_cad.find(r => r.id === _myResourceId);
      const pmEmail    = pmResource?.email || null;
      const pmName     = pmResource?.name  || 'Project Manager';

      // Expiry: 30 days
      const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

      tokenRecord = {
        firm_id:           FIRM_ID_CAD,
        instance_id:       instId,
        template_step_id:  step.id,
        token:             rawToken,
        token_hmac:        tokenHmac,
        // Legacy columns (prior schema) — keep populated for compatibility
        token_hash:        tokenHmac,
        recipient_email:   assigneeEmail,
        recipient_name:    assigneeName || null,
        assignee_email:    assigneeEmail,
        assignee_name:     assigneeName || null,
        outcomes_json:     outcomesSnapshot,
        step_name:         step.name || null,
        step_instructions: step.instructions || null,
        instance_title:    inst?.title || null,
        template_name:     _selectedTmpl?.name || null,
        pm_email:          pmEmail,
        pm_name:           pmName,
        expires_at:        expiresAt,
        generated_at:      new Date().toISOString(),
        issued_at:         new Date().toISOString(),
      };

      await API.post('external_step_tokens', tokenRecord);

      // Build the approve.html URLs — use explicit base to ensure correct domain
      const base = (window.location.origin || 'https://projecthud.com') + '/approve.html';
      approveUrl = `${base}?token=${rawToken}`;
      rejectUrl  = `${base}?token=${rawToken}&outcome=reject`;

      console.log(`[ExternalToken] Generated for step "${step.name}" → ${rawToken.slice(0,8)}...`);
    } catch (tokenErr) {
      // Token failure is non-fatal — email still sends, just without action buttons
      console.warn('[ExternalToken] Failed to generate token:', tokenErr);
    }
  }
  // ── End token generation ──────────────────────────────────────────────────

  const payload = {
    instance_id:    instId,
    instance_title: inst?.title || null,
    template_name:  _selectedTmpl?.name || null,
    step_id:        step.id,
    step_name:      step.name,
    step_type:      step.step_type,
    assignee_name:  assigneeName,
    assignee_email: assigneeEmail,
    due_days:       step.due_days   || null,
    due_type:       step.due_type   || null,
    launched_by:    launcher,
    is_bist:        false,
    // External response URLs — present only for eligible step types
    approve_url:    approveUrl,
    reject_url:     rejectUrl,
    has_action_buttons: !!(approveUrl && rejectUrl),
    outcomes:       approveUrl ? _getOutcomes(step) : null,
  };

  await fetch('/api/notify-step-activated', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) {
      console.warn('Notification error:', data);
      cadToast(`Notification failed: ${JSON.stringify(data.error||data)}`, 'error');
    } else if (data.skipped) {
      console.log('Notification skipped:', data.skipped);
    } else {
      cadToast(`Email sent to ${assigneeEmail}`, 'info');
    }
  }).catch(err => {
    console.warn('Notification fetch failed:', err);
    cadToast('Notification fetch failed: ' + err.message, 'error');
  });
}

async function submitComplete(instId, stepId) {
  const container   = document.getElementById(`outcome-btns-${stepId}`);
  const outcomeId   = container?.dataset.selected;
  if (!outcomeId) { cadToast('Select an outcome first', 'error'); return; }

  const inst        = _instances.find(i => i.id === instId);
  const step        = inst?._tmplSteps?.find(s => s.id === stepId);
  const outcomeDef  = _getOutcomes(step||{}).find(o => o.id === outcomeId);
  const outcomeLabel = outcomeDef?.label || outcomeId;

  const notes           = document.getElementById(`complete-notes-${stepId}`)?.value?.trim() || null;
  const routeTargetId   = document.getElementById(`route-target-${stepId}`)?.value || null;
  const routeTargetStep = routeTargetId
    ? inst?._tmplSteps?.find(s => s.id === routeTargetId)
    : null;
  const suspendCondition = document.getElementById(`suspend-condition-${stepId}`)?.value?.trim() || null;
  const authorName      = _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member';

  // Notes required for reset outcomes
  if (outcomeDef?.requiresReset && !notes) {
    cadToast('Notes are required when rejecting or requesting changes', 'error');
    document.getElementById(`complete-notes-${stepId}`)?.focus();
    return;
  }

  // Form gate check — block completion if required fields are unfilled
  if (step?.step_type === 'form') {
    const gateResult = await _formGateCheck(instId, stepId);
    if (!gateResult.passed) {
      cadToast(
        `${gateResult.missing} required field${gateResult.missing !== 1 ? 's' : ''} unfilled — complete the form before submitting`,
        'error'
      );
      document.getElementById(`cad-form-${stepId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  }

  const submitBtn = document.getElementById(`complete-submit-${stepId}`);
  if (submitBtn) { submitBtn.textContent = 'Saving…'; submitBtn.disabled = true; }

  try {
    await API.post('workflow_step_instances', {
      instance_id:        instId,
      firm_id:            FIRM_ID_CAD,
      event_type:         'step_completed',
      template_step_id:   stepId,
      step_type:          step?.step_type || 'action',
      step_name:          step?.name || null,
      outcome:            outcomeId,
      route_to_step_id:   routeTargetId   || null,
      route_to_step_name: routeTargetStep ? `${routeTargetStep.sequence_order}. ${routeTargetStep.name||'Step'}` : null,
      suspend_condition:  suspendCondition || null,
      event_notes:        notes,
      actor_name:         authorName,
      created_at:         new Date().toISOString(),
    });

    // ── Layer 2 routing engine ────────────────────────────────────────────────
    const allSteps   = inst?._tmplSteps || [];
    const currOrder  = step?.sequence_order || 0;

    if (outcomeDef?.requiresSuspend) {
      // ── Suspend instance ──────────────────────────────────────────────────
      await API.patch(`workflow_instances?id=eq.${instId}`, {
        status:     'overridden',
        notes:      suspendCondition || `Suspended by ${authorName} — ${outcomeLabel}`,
        updated_at: new Date().toISOString(),
      }).catch(() => {});
      await API.post('workflow_step_instances', {
        instance_id: instId, firm_id: FIRM_ID_CAD,
        event_type:  'instance_suspended',
        step_name:   'Instance suspended',
        step_type:   'trigger',
        event_notes: suspendCondition || outcomeLabel,
        actor_name:  authorName,
        created_at:  new Date().toISOString(),
      }).catch(() => {});

    } else if (routeTargetId) {
      // ── Explicit route — reset intervening steps, activate target ─────────
      const targetStep = allSteps.find(s => s.id === routeTargetId);
      if (targetStep) {
        const now = Date.now();
        const stepsToReset = allSteps
          .filter(s => s.sequence_order >= targetStep.sequence_order
                    && s.sequence_order < currOrder)
          .sort((a, b) => a.sequence_order - b.sequence_order);
        for (let i = 0; i < stepsToReset.length; i++) {
          const rs = stepsToReset[i];
          await API.post('workflow_step_instances', {
            instance_id:      instId, firm_id: FIRM_ID_CAD,
            event_type:       'step_reset',
            template_step_id: rs.id,
            step_type:        rs.step_type || 'action',
            step_name:        rs.name || null,
            actor_name:       'System',
            event_notes:      `Reset by ${outcomeLabel} on ${step?.name}`,
            created_at:       new Date(now + i + 1).toISOString(),
          });
        }
        // Activate target — timestamp after all resets
        await API.post('workflow_step_instances', {
          instance_id:      instId, firm_id: FIRM_ID_CAD,
          event_type:       'step_activated',
          template_step_id: targetStep.id,
          step_type:        targetStep.step_type || 'action',
          step_name:        targetStep.name || null,
          actor_name:       'System',
          created_at:       new Date(now + stepsToReset.length + 2).toISOString(),
        }).catch(() => {});
        _notifyStepActivated(instId, targetStep, inst).catch(() => {});

        // ── Task binding: rejection puts linked task back to in_progress ──
        if (inst?.source_task_id) {
          API.patch(`tasks?id=eq.${inst.source_task_id}`, {
            status:     'in_progress',
            updated_at: new Date().toISOString(),
          }).catch(() => {});
        }
      }

    } else if (outcomeDef?.requiresReset) {
      // ── Implicit reset — reset all steps back to first, activate first ────
      const firstStep = allSteps
        .filter(s => s.step_type !== 'trigger')
        .sort((a, b) => a.sequence_order - b.sequence_order)[0];
      if (firstStep) {
        const now = Date.now();
        const stepsToReset = allSteps
          .filter(s => s.sequence_order >= firstStep.sequence_order
                    && s.sequence_order < currOrder)
          .sort((a, b) => a.sequence_order - b.sequence_order);
        for (let i = 0; i < stepsToReset.length; i++) {
          const rs = stepsToReset[i];
          await API.post('workflow_step_instances', {
            instance_id:      instId, firm_id: FIRM_ID_CAD,
            event_type:       'step_reset',
            template_step_id: rs.id,
            step_type:        rs.step_type || 'action',
            step_name:        rs.name || null,
            actor_name:       'System',
            event_notes:      `Reset by ${outcomeLabel} on ${step?.name}`,
            created_at:       new Date(now + i + 1).toISOString(),
          });
        }
        await API.post('workflow_step_instances', {
          instance_id:      instId, firm_id: FIRM_ID_CAD,
          event_type:       'step_activated',
          template_step_id: firstStep.id,
          step_type:        firstStep.step_type || 'action',
          step_name:        firstStep.name || null,
          actor_name:       'System',
          created_at:       new Date(now + stepsToReset.length + 2).toISOString(),
        }).catch(() => {});
        _notifyStepActivated(instId, firstStep, inst).catch(() => {});

        // ── Task binding: rejection puts linked task back to in_progress ──
        if (inst?.source_task_id) {
          API.patch(`tasks?id=eq.${inst.source_task_id}`, {
            status:     'in_progress',
            updated_at: new Date().toISOString(),
          }).catch(() => {});
        }
      }

    } else {
      // ── Normal forward progression ────────────────────────────────────────
      const nextStep = allSteps
        .filter(s => s.sequence_order > currOrder)
        .sort((a, b) => a.sequence_order - b.sequence_order)[0];

      if (nextStep) {
        // More steps remain — activate next
        await API.post('workflow_step_instances', {
          instance_id:      instId, firm_id: FIRM_ID_CAD,
          event_type:       'step_activated',
          template_step_id: nextStep.id,
          step_type:        nextStep.step_type || 'action',
          step_name:        nextStep.name || null,
          actor_name:       'System',
          created_at:       new Date().toISOString(),
        }).catch(() => {});
        _notifyStepActivated(instId, nextStep, inst).catch(() => {});
      } else {
        // Last step completed — mark instance complete
        await API.patch(`workflow_instances?id=eq.${instId}`, {
          status:       'complete',
          completed_at: new Date().toISOString(),
          updated_at:   new Date().toISOString(),
        }).catch(() => {});
        await API.post('workflow_step_instances', {
          instance_id: instId, firm_id: FIRM_ID_CAD,
          event_type:  'instance_completed',
          step_name:   'Instance completed',
          step_type:   'trigger',
          event_notes: `All steps completed`,
          actor_name:  authorName,
          created_at:  new Date().toISOString(),
        }).catch(() => {});

        // ── Task binding: mark linked task complete ───────────────────────
        if (inst?.source_task_id) {
          API.patch(`tasks?id=eq.${inst.source_task_id}`, {
            status:      'complete',
            pct_complete: 100,
            updated_at:  new Date().toISOString(),
          }).catch(() => {});
        }
      }
    }

    await _reloadInstance(instId);
    updateBadges();

    // Update instance list to reflect new status
    const listEl = document.getElementById('inst-list');
    if (listEl) {
      const updatedInst = _instances.find(i => i.id === instId);
      if (updatedInst) {
        const freshInsts = await API.get(
          `workflow_instances?id=eq.${instId}`
        ).catch(() => []);
        if (freshInsts?.[0]) {
          Object.assign(updatedInst, freshInsts[0]);
          renderTab('instances');
        }
      }
    }

    const toastMsg = outcomeDef?.requiresSuspend
      ? `Instance suspended — ${outcomeLabel}`
      : routeTargetStep
        ? `${outcomeLabel} — returning to: ${routeTargetStep.name}`
        : outcomeDef?.requiresReset
          ? `${outcomeLabel} — resetting to step 1`
          : `Step completed — ${outcomeLabel}`;
    cadToast(toastMsg, 'success');
  } catch(e) {
    cadToast('Failed to complete step: ' + e.message, 'error');
    if (submitBtn) { submitBtn.textContent = 'Complete step'; submitBtn.disabled = false; }
  }
}

async function completeStep(instId, stepId, outcomeId, outcomeLabel) {
  // Thin wrapper — select the outcome and submit immediately (no routing override)
  const container = document.getElementById(`outcome-btns-${stepId}`);
  if (container) container.dataset.selected = outcomeId;
  await submitComplete(instId, stepId);
}

async function suspendInstance(instId) {
  const reason = prompt('Reason for suspension (optional):');
  if (reason === null) return; // cancelled prompt
  try {
    await API.patch(`workflow_instances?id=eq.${instId}`, {
      status: 'overridden',
      notes:  reason || null,
      updated_at: new Date().toISOString(),
    });
    await API.post('workflow_step_instances', {
      instance_id: instId, firm_id: FIRM_ID_CAD,
      event_type:  'instance_suspended',
      step_type:   'trigger',
      step_name:   'Instance suspended',
      event_notes: reason || null,
      created_at:  new Date().toISOString(),
    });
    await _reloadInstance(instId);
    cadToast('Instance suspended', 'success');
  } catch(e) { cadToast('Suspend failed: ' + e.message, 'error'); }
}

async function cancelInstance(instId) {
  const reason = prompt('Reason for cancellation:');
  if (reason === null) return;
  if (!confirm('Cancel this instance permanently? This cannot be undone.')) return;
  try {
    await API.patch(`workflow_instances?id=eq.${instId}`, {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      notes: reason || null,
      updated_at: new Date().toISOString(),
    });
    await API.post('workflow_step_instances', {
      instance_id: instId, firm_id: FIRM_ID_CAD,
      event_type:  'instance_cancelled',
      step_type:   'trigger',
      step_name:   'Instance cancelled',
      event_notes: reason || null,
      created_at:  new Date().toISOString(),
    });
    await _reloadInstance(instId);
    cadToast('Instance cancelled', 'success');
  } catch(e) { cadToast('Cancel failed: ' + e.message, 'error'); }
}

async function deleteInstance(instId) {
  if (!confirm('Permanently delete this instance and all its Chain of Custody records? This cannot be undone.')) return;
  try {
    await API.del(`workflow_step_instances?instance_id=eq.${instId}`);
    await API.del(`workflow_instances?id=eq.${instId}`);
    _instances = _instances.filter(i => i.id !== instId);
    _selectedInstance = null;
    _stopElapsedTimer();
    renderInstancesTab(document.getElementById('cad-content'));
    cadToast('Instance deleted', 'success');
  } catch(e) { cadToast('Delete failed: ' + e.message, 'error'); }
}

function _openLinkedTask(taskId, projectId) {
  if (!taskId) return;
  const url = projectId
    ? `/project-detail.html?id=${projectId}&task=${taskId}`
    : `/project-detail.html?task=${taskId}`;
  window.open(url, '_blank');
}

function _resolveLinkedTaskName(instId, taskId) {
  if (!taskId) return;
  const el = document.getElementById(`inst-task-name-${instId}`);
  if (!el) return;
  API.get(`tasks?id=eq.${taskId}&select=id,name`).then(rows => {
    const name = rows?.[0]?.name;
    if (name && el) el.textContent = escHtml(name);
  }).catch(() => {});
}

async function _reloadInstance(instId) {
  const fresh = await API.get(`workflow_instances?id=eq.${instId}&select=*`).catch(()=>[]);
  if (fresh?.[0]) {
    const idx = _instances.findIndex(i => i.id === instId);
    if (idx >= 0) {
      _instances[idx] = { ..._instances[idx], ...fresh[0] };
      _selectedInstance = _instances[idx];
      // Reload CoC
      _selectedInstance._stepInsts = await API.get(
        `workflow_step_instances?instance_id=eq.${instId}&order=created_at.asc,id.asc`
      ).catch(() => _selectedInstance._stepInsts || []);
    }
  }
  renderInstancesTab(document.getElementById('cad-content'));
  const detailEl = document.getElementById('instance-detail');
  if (detailEl && _selectedInstance) renderInstanceDetail(detailEl, _selectedInstance);
  setTimeout(_populateReworkBadges, 50);
}

