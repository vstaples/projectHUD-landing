// VERSION: 20260423-CMD78
window._mwEventsVersion = 'v20260423-CMD78';
console.log('%c[mw-events] v20260423-CMD78 — B-UI-9 v2.0: approval-failure observability (Part A emit instance.approval_failed + Part B CoC write + Part C admin notify via shared helper)','background:#c47d18;color:#000;font-weight:700;padding:2px 8px;border-radius:3px');

// Resolve FIRM_ID safely across page contexts
function _mwFirmId() { try { return FIRM_ID; } catch(_) { return window.FIRM_ID || "aaaaaaaa-0001-0001-0001-000000000001"; } }

// ── CSS for inline panels ─────────────────────────────────
(function() {
  if (document.getElementById('f1-style')) return;
  const s = document.createElement('style');
  s.id = 'f1-style';
  s.textContent = `
    @keyframes micro-open { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
    @keyframes done-pulse  { 0%{transform:scale(1)} 40%{transform:scale(1.18)} 100%{transform:scale(1)} }
    .stat-done-pulse #done-today-count { animation: done-pulse 400ms ease; }
  `;
  document.head.appendChild(s);
})();

// ── Permanent delegated listeners ────────────────────────
document.addEventListener('change', function(ev) {
  const projSel = ev.target.closest('.wf-proj-sel');
  if (projSel) { _wfProject = projSel.value; _viewLoaded['user'] = false; _mwLoadUserView(); }
});
document.addEventListener('click', function(ev) {
  // ── CoC toggle ─────────────────────────────────────────
  if (ev.target.closest('[data-action="close-wi-modal"]')) {
    document.querySelectorAll('.wi-expanded').forEach(e=>e.remove());
    document.getElementById('wi-backdrop')?.remove();
    document.querySelectorAll('.wi-row').forEach(r=>{r.classList.remove('wi-selected');r.style.borderLeft='';r.style.background='';});
    return;
  }

  // ── Diagram toggle ──────────────────────────────────────
  if (ev.target.closest('[data-action="diagram-list"]')) {
    _diagramMode = false;
    const listEl = document.getElementById('work-list-rows');
    const diagEl = document.getElementById('mw-diagram-wrap');
    if (listEl) listEl.style.display = '';
    if (diagEl) diagEl.style.display = 'none';
    // Update pill styles
    const panel = document.getElementById('mw-worklist-panel');
    if (panel) {
      const btns = panel.querySelectorAll('[data-action="diagram-list"],[data-action="diagram-diag"]');
      btns.forEach(b => {
        const isActive = b.dataset.action === 'diagram-list';
        b.style.background = isActive ? 'rgba(239,159,39,.2)' : 'none';
        b.style.color = isActive ? '#EF9F27' : 'rgba(255,255,255,.3)';
      });
      // Hide zoom controls
      const zc = document.getElementById('diag-zoom-controls');
      if (zc) zc.style.display = 'none';
    }
    return;
  }
  if (ev.target.closest('[data-action="diagram-diag"]')) {
    _diagramMode = true;
    const listEl = document.getElementById('work-list-rows');
    const diagEl = document.getElementById('mw-diagram-wrap');
    if (listEl) listEl.style.display = 'none';
    if (diagEl) diagEl.style.display = '';
    // Update pill styles
    const panel = document.getElementById('mw-worklist-panel');
    if (panel) {
      const btns = panel.querySelectorAll('[data-action="diagram-list"],[data-action="diagram-diag"]');
      btns.forEach(b => {
        const isActive = b.dataset.action === 'diagram-diag';
        b.style.background = isActive ? 'rgba(239,159,39,.2)' : 'none';
        b.style.color = isActive ? '#EF9F27' : 'rgba(255,255,255,.3)';
      });
      // Show zoom controls
      const zc2 = document.getElementById('diag-zoom-controls');
      if (zc2) zc2.style.display = 'flex';
    }
    buildWorkDiagram();
    return;
  }
  if (ev.target.closest('[data-action="diag-zoom-in"]')) {
    const cw=document.getElementById('mw-diag-canvas-wrap');
    const sl=cw?.scrollLeft||0, st=cw?.scrollTop||0;
    _diagScale = Math.min(3, _diagScale + 0.15); buildWorkDiagram();
    if(cw){cw.scrollLeft=sl;cw.scrollTop=st;}
    const lbl=document.getElementById('diag-zoom-lbl'); if(lbl) lbl.textContent=Math.round(_diagScale*100)+'%';
    return;
  }
  if (ev.target.closest('[data-action="diag-zoom-out"]')) {
    const cw=document.getElementById('mw-diag-canvas-wrap');
    const sl=cw?.scrollLeft||0, st=cw?.scrollTop||0;
    _diagScale = Math.max(0.3, _diagScale - 0.15); buildWorkDiagram();
    if(cw){cw.scrollLeft=sl;cw.scrollTop=st;}
    const lbl=document.getElementById('diag-zoom-lbl'); if(lbl) lbl.textContent=Math.round(_diagScale*100)+'%';
    return;
  }
  if (ev.target.closest('[data-action="diag-zoom-reset"]')) {
    _diagScale = 1;
    buildWorkDiagram();
    const cw=document.getElementById('mw-diag-canvas-wrap');
    if(cw){cw.scrollLeft=0;cw.scrollTop=0;}
    const lbl=document.getElementById('diag-zoom-lbl'); if(lbl) lbl.textContent='100%';
    return;
  }
  if (ev.target.closest('[data-action="diag-maximize"]')) {
    const panel = document.getElementById('mw-worklist-panel');
    if (panel) panel.classList.toggle('diag-maximized');
    const vp = document.getElementById('mw-diag-tl-wrap');
    if (vp) vp.style.height = panel?.classList.contains('diag-maximized') ? 'calc(100vh - 200px)' : '480px';
    return;
  }
  if (ev.target.closest('[data-action="diag-toggle-proj"]')) {
    const projId = ev.target.closest('[data-action="diag-toggle-proj"]').dataset.projId;
    if (_diagCollapsed.has(projId)) _diagCollapsed.delete(projId); else _diagCollapsed.add(projId);
    buildWorkDiagram();
    return;
  }
  if (ev.target.closest('[data-action="diag-open-task"]')) {
    const wiId = ev.target.closest('[data-action="diag-open-task"]').dataset.wiId;
    const item = (_wiItems || []).find(w => w.id === wiId);
    if (item) openWorkItemExpanded(item);
    return;
  }

  if (ev.target.closest('[data-action="toggle-coc"]')) {
    console.log('[Compass] CoC toggle clicked');
    const coc = document.getElementById('mw-coc');
    console.log('[Compass] mw-coc element:', coc, 'display:', coc?.style.display);
    if (coc) {
      const open = coc.style.display === 'flex';
      coc.style.display = open ? 'none' : 'flex';
      coc.style.flexDirection = 'column';
      console.log('[Compass] CoC display set to:', coc.style.display);
    } else {
      console.warn('[Compass] mw-coc NOT FOUND in DOM');
    }
    return;
  }

  // ── Type filter ───────────────────────────────────────────
  const typeBtn = ev.target.closest('.wf-type-btn');
  if (typeBtn) { _wfType = typeBtn.dataset.type; _viewLoaded['user']=false; _mwLoadUserView(); return; }
  // ── Status filter ─────────────────────────────────────────
  const statusBtn = ev.target.closest('.wf-status-btn');
  if (statusBtn) { _wfStatus = statusBtn.dataset.status; _viewLoaded['user']=false; _mwLoadUserView(); return; }
  // ── Date range filter ─────────────────────────────────────
  const dateBtn = ev.target.closest('.wf-date-btn');
  if (dateBtn) { _wfDateRange = dateBtn.dataset.range; _viewLoaded['user']=false; _mwLoadUserView(); return; }
  // ── Week stepper ──────────────────────────────────────────
  if (ev.target.closest('#week-step-back')) {
    _weekOffset += 1;
    _activeGauge = null; _teFilter = null;
    _viewLoaded['user'] = false; _mwLoadUserView(); return;
  }
  if (ev.target.closest('#week-step-fwd') && _weekOffset > 0) {
    _weekOffset -= 1;
    _activeGauge = null; _teFilter = null;
    _viewLoaded['user'] = false; _mwLoadUserView(); return;
  }
  // ── Gauge click → toggle active / filter time log ─────────
  const gaugeCol = ev.target.closest('.gauge-col');
  if (gaugeCol) {
    const d = gaugeCol.dataset.gaugeDate;
    _activeGauge = (_activeGauge === d) ? null : d;
    _teFilter = _activeGauge;
    _viewLoaded['user']=false; _mwLoadUserView(); return;
  }
  // ── Gauge clear filter ────────────────────────────────────
  if (ev.target.closest('.gauge-clear-btn')) {
    _activeGauge=null; _teFilter=null; _viewLoaded['user']=false; _mwLoadUserView(); return;
  }
  // ── Day dot → open weekly drawer scrolled to that day ─────
  const dayDot = ev.target.closest('.day-dot');
  if (dayDot) { openFullWeeklyTimesheet({ expandDay: dayDot.dataset.day }); return; }
  // ── Open weekly timesheet buttons ─────────────────────────
  if (ev.target.closest('.open-weekly-ts-btn')) {
    const btn = ev.target.closest('.open-weekly-ts-btn');
    openFullWeeklyTimesheet({ expandDay: btn.dataset.expandToday ? new Date().toLocaleDateString('en-CA') : null });
    return;
  }
  // ── Week view footer / legacy ─────────────────────────────
  if (ev.target.closest('.te-week-footer')) {
    const anyEntry = _teEntries[0];
    if (anyEntry) openWeeklyTimesheet(anyEntry);
    else compassToast('No entries this week', 2000);
    return;
  }
  // ── Clear time log filter ─────────────────────────────────
  if (ev.target.closest('.te-clear-filter')) { filterTimeLog(null); return; }
  // ── Legacy bar chart column ───────────────────────────────
  const barCol = ev.target.closest('.te-bar-col');
  if (barCol && barCol.dataset.hasHours === 'true') { filterTimeLog(barCol.dataset.date); return; }
  // ── Work item action button ───────────────────────────────
  const actionBtn = ev.target.closest('.wi-action-btn');
  if (actionBtn) {
    ev.stopPropagation();
    const item = _wiItems.find(w => w.id === actionBtn.dataset.wiId);
    if (!item) return;
    const status = actionBtn.dataset.wiStatus;
    if (item.type==='action') {
      const _title = item.title || '';

      // ── Resubmit items — check FIRST before any role routing ────────────
      // Use includes() + instance check to avoid Unicode encoding mismatches.
      if (item.instanceId && (_title.includes('Changes requested:') || _title.includes('Re-review requested:'))) {
        openResubmitPanel(item);
        return;
      }

      // ── Informational items → dismiss on click ───────────────────────────
      if (item.instanceId && (_title.includes('Approved:') || _title.includes('Partial approval:'))) {
        API.patch(`workflow_action_items?id=eq.${item.id}`, { status:'resolved', updated_at: new Date().toISOString() })
          .then(() => { _viewLoaded['user'] = false; _mwLoadUserView(); })
          .catch(() => {});
        compassToast('Notification dismissed.');
        return;
      }

      // ── Legacy review/approve items ──────────────────────────────────────
      const isLegacyReview  = item.instanceId && _title.startsWith('Review request:');
      const isLegacyApprove = item.instanceId && _title.startsWith('Approve request:');
      if (item.instanceId && (isLegacyReview || isLegacyApprove)) {
        const parentInst = (window._wfInstances||[]).find(i => i.id === item.instanceId);
        if (parentInst?.status === 'cancelled') {
          compassToast('This request was withdrawn by the submitter.', 3000);
          API.patch(`workflow_action_items?id=eq.${item.id}`, { status: 'resolved' })
            .then(() => { _viewLoaded['user'] = false; _mwLoadUserView(); }).catch(() => {});
          return;
        }
        openRequestReviewPanel(item, isLegacyApprove);
        return;
      }

      // ── workflow_requests rows (reviewer/approver) ───────────────────────
      if (item.instanceId && item._wrRole) {
        const parentInst = (window._wfInstances||[]).find(i => i.id === item.instanceId);
        if (parentInst?.status === 'cancelled') {
          compassToast('This request was withdrawn by the submitter.', 3000);
          API.patch(`workflow_requests?id=eq.${item.id}`, { status: 'cancelled' })
            .then(() => { _viewLoaded['user'] = false; _mwLoadUserView(); }).catch(() => {});
          return;
        }
        openRequestReviewPanel(item, item._wrRole === 'approver');
        return;
      }
      const _ns = negGetState(item.id).state;
      if (_ns==='unrated' || _ns==='pending' || _ns==='negotiating' || _ns==='escalated') {
        openWorkItemExpanded(item);
      } else {
        openCompletionPanel({ id:item.id, type:item.type, title:item.title, projectId:item.projectId||null });
      }
    } else if (parseInt(actionBtn.dataset.wiPct)>=100) {
      openCompletionPanel({ id:item.id, type:item.type, title:item.title, projectId:item.projectId||null });
    } else {
      openInProgressPanel(item);
    }
    return;
  }
  // ── Completion circle ─────────────────────────────────────
  const wiCircle = ev.target.closest('.wi-complete-circle');
  if (wiCircle) {
    ev.stopPropagation();
    const item = _wiItems.find(w => w.id === wiCircle.dataset.wiId);
    if (item) openCompletionPanel({ id:item.id, type:item.type, title:item.title, projectId:item.projectId||null });
    return;
  }
  // ── Legacy wi-complete ────────────────────────────────────
  const wiComplete = ev.target.closest('.wi-complete');
  if (wiComplete) {
    ev.stopPropagation();
    openCompletionPanel({ id:wiComplete.dataset.wiId, type:wiComplete.dataset.wiType,
      title:wiComplete.dataset.wiTitle, projectId:wiComplete.dataset.wiProjectid||null });
    return;
  }
  // ── Work item row → detail drawer ─────────────────────────
  const wiRow = ev.target.closest('.wi-row');
  if (wiRow && !ev.target.closest('.wi-action-btn') && !ev.target.closest('.wi-complete-circle')) {
    document.querySelectorAll('.wi-row').forEach(r => r.classList.remove('wi-selected'));
    wiRow.classList.add('wi-selected');
    const item = _wiItems.find(w => w.id === wiRow.dataset.wiId);
    if (!item) return;
    const _t = item.title || '';
    // Resubmit items → resubmit panel
    if (item.instanceId && (_t.includes('Changes requested:') || _t.includes('Re-review requested:'))) {
      openResubmitPanel(item);
      return;
    }
    // workflow_requests rows (reviewer/approver) → review panel
    if (item._isWrRow && item.instanceId) {
      openRequestReviewPanel(item, item._wrRole === 'approver');
      return;
    }
    openWorkItemDrawer(item);
    return;
  }
  // ── New time entry ────────────────────────────────────────
  if (ev.target.closest('.te-new-btn')) { openNewTimeEntry(); return; }
  // ── Time log row ──────────────────────────────────────────
  const teRow = ev.target.closest('.te-row');
  if (teRow) {
    const teId=teRow.dataset.teId, isCad=teRow.dataset.teCadence==='true';
    _teSelected = teId;
    document.querySelectorAll('.te-row').forEach(r => {
      const isThis = r.dataset.teId === teId;
      r.style.borderLeft = isThis ? '2px solid var(--compass-cyan)' : '2px solid transparent';
      r.style.background = isThis ? 'rgba(0,210,255,.04)' : '';
      r.onmouseleave = () => { r.style.background = isThis ? 'rgba(0,210,255,.04)' : ''; };
    });
    if (isCad) { window.location.href = '/cadence.html'; return; }
    const entry = _teEntries.find(e => e.id === teId);
    if (entry) {
      const proj = _projects.find(p => p.id === entry.project_id);
      openTimeEntryEdit({ id:entry.id, hours:entry.hours, notes:entry.notes||'',
        is_billable:entry.is_billable, date:entry.date, week_start_date:entry.week_start_date,
        project_id:entry.project_id, project_name:proj?.name||'—',
        step_name:entry.step_name||null, source_type:entry.source_type });
    }
    return;
  }
  // ── Timesheet submit ──────────────────────────────────────
  const tsSubmit = ev.target.closest('.ts-submit-btn');
  if (tsSubmit) {
    submitTimesheetWeek(tsSubmit.dataset.weekId, tsSubmit.dataset.weekStart, tsSubmit.dataset.weekHours);
    return;
  }
});

// ── Gauge dwell 900ms → Day Intelligence Briefing ─────────
document.addEventListener('mouseover', function(ev) {
  const gc = ev.target.closest('.gauge-col');
  if (!gc) return;
  clearTimeout(_dwellTimer);
  _dwellTimer = setTimeout(() => {
    if (gc.matches(':hover') && gc.dataset.gaugeHasData === 'true')
      openDayBriefing(gc.dataset.gaugeDate);
  }, 900);
});
document.addEventListener('mouseout', function(ev) {
  if (ev.target.closest('.gauge-col')) clearTimeout(_dwellTimer);
});

// ── In-Progress Update Panel (1.C) ───────────────────────
window.openInProgressPanel = function openInProgressPanel(item) {
  document.getElementById('completion-micro-panel')?.remove();
  document.getElementById('inprogress-panel')?.remove();
  const row = document.querySelector(`.wi-row[data-wi-id="${item.id}"]`);
  if (!row) return;
  const panel = document.createElement('div');
  panel.id = 'inprogress-panel';
  panel.style.cssText = 'grid-column:1/-1;border-bottom:2px solid var(--compass-amber);background:rgba(239,159,39,.04);padding:12px 16px;animation:micro-open 180ms ease';
  panel.innerHTML = `
    <div style="font-family:var(--font-head);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--compass-amber);margin-bottom:10px;font-weight:700">
      Update progress — ${esc(item.title.slice(0,50))}</div>
    <div style="display:grid;grid-template-columns:170px 110px 160px auto;gap:12px;align-items:start">
      <div>
        <div style="font-family:var(--font-head);font-size:11px;color:var(--text3);letter-spacing:.07em;text-transform:uppercase;margin-bottom:5px">% Complete</div>
        <div style="display:flex;align-items:center;gap:8px">
          <input id="ip-range" type="range" min="0" max="100" step="5" value="${item.pct||0}"
            style="flex:1;accent-color:var(--compass-amber)"
            oninput="document.getElementById('ip-pct').value=this.value"/>
          <input id="ip-pct" type="number" min="0" max="100" value="${item.pct||0}"
            style="width:52px;font-family:var(--font-display);font-size:16px;font-weight:700;
              padding:4px 6px;background:var(--bg2);border:1px solid rgba(239,159,39,.4);
              color:var(--compass-amber);outline:none;text-align:center"
            oninput="document.getElementById('ip-range').value=this.value"/>
        </div>
      </div>
      <div>
        <div style="font-family:var(--font-head);font-size:11px;color:var(--text3);letter-spacing:.07em;text-transform:uppercase;margin-bottom:5px">Hours today</div>
        <input id="ip-hours" type="number" min="0" max="24" step="0.25" placeholder="0.0"
          style="width:80px;font-family:var(--font-display);font-size:16px;font-weight:700;
            padding:6px 8px;background:var(--bg2);border:1px solid rgba(0,210,255,.3);
            color:var(--compass-cyan);outline:none;text-align:center"/>
      </div>
      <div>
        <div style="font-family:var(--font-head);font-size:11px;color:var(--text3);letter-spacing:.07em;text-transform:uppercase;margin-bottom:5px">Status</div>
        <select id="ip-status" style="font-family:var(--font-head);font-size:12px;font-weight:600;padding:6px 8px;
          background:var(--bg2);color:var(--text1);border:1px solid var(--border);width:100%;cursor:pointer">
          <option value="in_progress" ${item.status==='in_progress'?'selected':''}>Tasks In Progress</option>
          <option value="not_started" ${item.status==='not_started'?'selected':''}>Not Started</option>
          <option value="blocked" ${item.status==='blocked'?'selected':''}>Tasks Blocked</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-end;padding-bottom:1px">
        <button onclick="document.getElementById('inprogress-panel').remove()"
          style="font-family:var(--font-head);font-size:11px;font-weight:600;letter-spacing:.06em;
            padding:7px 12px;background:none;border:1px solid var(--border);color:var(--text3);cursor:pointer">Cancel</button>
        <button id="ip-save-btn" onclick="saveInProgressUpdate('${item.id}','${item.projectId||''}')"
          style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.06em;
            padding:7px 16px;background:var(--compass-amber);color:#060a10;border:none;cursor:pointer"
          onmouseenter="this.style.opacity='.85'" onmouseleave="this.style.opacity='1'">Save →</button>
      </div>
    </div>`;
  row.insertAdjacentElement('afterend', panel);
  document.getElementById('ip-pct')?.focus();
}

window.saveInProgressUpdate = async function saveInProgressUpdate(itemId, projectId) {
  const pct=parseInt(document.getElementById('ip-pct')?.value)||0;
  const hours=parseFloat(document.getElementById('ip-hours')?.value||0);
  const status=document.getElementById('ip-status')?.value||'in_progress';
  const btn=document.getElementById('ip-save-btn');
  if (btn) { btn.textContent='…'; btn.disabled=true; }
  const today=new Date().toLocaleDateString('en-CA');
  try {
    const ps=[API.patch(`tasks?id=eq.${itemId}`,{pct_complete:pct,status,updated_at:new Date().toISOString()}).catch(()=>{})];
    if (hours>0&&_myResource?.id) {
      const id=crypto.randomUUID();
      ps.push(API.post('time_entries',{id,firm_id:'aaaaaaaa-0001-0001-0001-000000000001',
        resource_id:_myResource.id,user_id:_myResource.user_id||null,
        project_id:projectId||null,task_id:itemId,source_type:'direct',
        date:today,hours,is_billable:true}).catch(()=>{}));
    }
    await Promise.all(ps);
    document.getElementById('inprogress-panel')?.remove();
    compassToast('Progress updated');
    _viewLoaded['user']=false; _mwLoadUserView();
  } catch(e) {
    if (btn) { btn.textContent='Save →'; btn.disabled=false; }
    compassToast('Failed — '+e.message,2500);
  }
}
// ── Request Review Panel ───────────────────────────────────────────────────
// Opens when a reviewer clicks their "Review request: ..." action item.
// Shows the request details, reviewer instructions, and Approve / Reject buttons.
// Writes to workflow_instances (status), workflow_action_items (resolved),
// and coc_events (audit trail). Notifies the submitter via their My Work queue.
// ─────────────────────────────────────────────────────────────────────────────

window.openRequestReviewPanel = async function openRequestReviewPanel(item) {
  document.getElementById('req-review-panel')?.remove();

  const firmId  = _mwFirmId();
  const resName = _myResource?.name || 'Unknown';
  const resId   = _myResource?.id   || null;

  // Fetch the workflow instance for full context — retry once on 502
  let instance = null;
  let cocEvents = [];
  if (item.instanceId) {
    const _fetchReviewData = () => Promise.all([
      API.get(`workflow_instances?id=eq.${item.instanceId}&select=*&limit=1`).catch(()=>[]),
      API.get(`coc_events?entity_id=eq.${item.instanceId}&order=occurred_at.asc&select=*`).catch(()=>[]),
    ]);
    try {
      let [instRows, coc] = await _fetchReviewData();
      if (!instRows?.length) {
        await new Promise(r => setTimeout(r, 1500));
        [instRows, coc] = await _fetchReviewData();
      }
      instance  = instRows?.[0] || null;
      cocEvents = coc || [];
    } catch(e) { console.warn('[ReviewPanel] fetch failed:', e); }
  }

  // Resolve the Cadence assignee_role for the current step
  // Used to activate the correct signature field in the review form
  let cadenceRole = null;
  if (instance && instance.current_step_id) {
    try {
      const stepRows = await API.get(
        `workflow_template_steps?id=eq.${instance.current_step_id}&select=assignee_role&limit=1`
      ).catch(() => []);
      cadenceRole = stepRows?.[0]?.assignee_role || null;
    } catch(_) {}
  }
  // Fallback: derive from _wrRole if step lookup fails
  if (!cadenceRole) {
    cadenceRole = item._wrRole === 'reviewer' ? 'submitter' : null;
  }

  // Parse submission details from CoC event notes
  let submittedDetails = {};
  // Use MOST RECENT request.submitted event — captures resubmitted documents
  const submitEvent = cocEvents
    .filter(e => e.event_type === 'request.submitted')
    .sort((a,b) => new Date(b.occurred_at||b.created_at) - new Date(a.occurred_at||a.created_at))[0];
  if (submitEvent) {
    try { submittedDetails = JSON.parse(submitEvent.event_notes || '{}'); } catch(_) {}
  }

  const docName      = submittedDetails.doc_name || instance?.title || item.title;
  // Don't show placeholder default body as instructions
  const _rawInstructions = submittedDetails.instructions || item.body || '';
  const instructions = (_rawInstructions === 'New request' || _rawInstructions === 'Document review request') ? '' : _rawInstructions;
  const deadline     = submittedDetails.deadline || item.due || '';
  const submittedBy  = instance?.submitted_by_name || item.createdBy || 'Unknown';
  const submittedAt  = submitEvent
    ? new Date(submitEvent.occurred_at||submitEvent.created_at)
        .toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})
    : '';

  // CoC timeline rows — 3-column grid: event type | actor | timestamp
  const cocHtml = cocEvents.length
    ? cocEvents.map(e => {
        const t = new Date(e.occurred_at||e.created_at).toLocaleString('en-US',
          {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
        const typeLabel = (e.event_type||'').replace('request.','').replace(/_/g,' ');
        const dotColor  = e.event_type==='request.submitted'?'#00D2FF':
                          e.event_type==='request.approved'?'#1D9E75':
                          e.event_type==='request.completed'?'#1D9E75':
                          e.event_type==='request.changes_requested'?'#E24B4A':
                          (e.event_type||'').includes('reject')?'#E24B4A':'#EF9F27';
        const typeColor = e.event_type==='request.approved'?'#1D9E75':
                          e.event_type==='request.changes_requested'?'#E24B4A':
                          e.event_type==='request.submitted'?'rgba(0,210,255,.85)':'rgba(255,255,255,.6)';
        let notes = '';
        try { const p = JSON.parse(e.event_notes||'{}'); notes = p.comments||p.note||''; } catch(_){}
        return `<div style="display:grid;grid-template-columns:7px 130px 1fr auto;
                            gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);
                            font-family:var(--font-head);font-size:11px;align-items:start">
          <div style="width:7px;height:7px;border-radius:50%;background:${dotColor};margin-top:3px;flex-shrink:0"></div>
          <div style="color:${typeColor};font-weight:600;text-transform:capitalize">${esc(typeLabel)}</div>
          <div style="color:rgba(255,255,255,.5)">${esc(e.actor_name||'System')}${notes?` <span style="color:rgba(255,255,255,.28);font-style:italic">— ${esc(notes)}</span>`:''}
          </div>
          <div style="color:rgba(255,255,255,.25);white-space:nowrap;text-align:right">${esc(t)}</div>
        </div>`;
      }).join('')
    : `<div style="font-family:var(--font-head);font-size:10px;color:rgba(255,255,255,.2);padding:4px 0">No events yet.</div>`;

  // Clickable document list from submission CoC notes
  const docsHtml = (submittedDetails.docs||[]).length
    ? `<div style="margin-bottom:14px">
        <div style="font-family:var(--font-head);font-size:12px;letter-spacing:.08em;
                    text-transform:uppercase;color:rgba(255,255,255,.6);margin-bottom:6px">
          Documents
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${(submittedDetails.docs||[]).map(d => {
            const icon = (d.mime||'').includes('pdf')||(d.name||'').endsWith('.pdf') ? '📄' :
                         (d.mime||'').includes('word')||(d.name||'').endsWith('.docx') ? '📝' :
                         (d.source==='form') ? '◈' : '📎';
            // Append cadenceRole to form paths so myrOpenAttachment
            // knows which signature field to activate for this reviewer
            const rawPath = d.source === 'form' && cadenceRole
              ? (d.path||'') + ':' + cadenceRole
              : (d.path||'');
            const safePathAttr = rawPath.replace(/'/g,"\\'");
            return `<button onclick="myrOpenAttachment('${safePathAttr}')"
              style="display:flex;align-items:center;gap:7px;padding:5px 10px;
                     background:rgba(0,210,255,.04);border:1px solid rgba(0,210,255,.15);
                     color:#00D2FF;font-family:var(--font-head);font-size:11px;
                     cursor:pointer;text-align:left;transition:background .12s;width:100%"
              onmouseover="this.style.background='rgba(0,210,255,.1)'"
              onmouseout="this.style.background='rgba(0,210,255,.04)'">
              <span>${icon}</span>
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.name||'Document')}</span>
              <span style="color:rgba(255,255,255,.3);font-size:11px;flex-shrink:0">↗ View</span>
            </button>`;
          }).join('')}
        </div>
      </div>`
    : '';

  const overlay = document.createElement('div');
  overlay.id = 'req-review-panel';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:800;' +
    'display:flex;align-items:center;justify-content:center;padding:20px';

  overlay.innerHTML = `
    <div style="background:#0d1b2e;border:1px solid rgba(0,210,255,.3);width:560px;max-height:88vh;
                border-radius:4px;overflow:hidden;display:flex;flex-direction:column">

      <!-- Header -->
      <div style="padding:14px 18px 12px;border-bottom:1px solid rgba(255,255,255,.07);
                  display:flex;align-items:flex-start;gap:10px;flex-shrink:0">
        <div style="flex:1">
          <div style="font-family:var(--font-head);font-size:13px;font-weight:700;color:#F0F6FF;margin-bottom:3px">
            Document Review Request
          </div>
          <div style="font-family:var(--font-head);font-size:11px;color:rgba(0,210,255,.7)">
            ${esc(docName)}
          </div>
          <div style="font-family:var(--font-head);font-size:12px;color:rgba(255,255,255,.45);margin-top:3px">
            Submitted by <strong style="color:rgba(255,255,255,.7)">${esc(submittedBy)}</strong>${submittedAt?' · '+submittedAt:''}
            ${deadline?` · Due ${esc(deadline)}`:''}
          </div>
        </div>
        <button onclick="document.getElementById('req-review-panel').remove()"
          style="background:none;border:1px solid rgba(226,75,74,.3);color:#E24B4A;
                 width:22px;height:22px;cursor:pointer;font-family:var(--font-head);
                 font-size:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center">
          &#x2715;
        </button>
      </div>

      <!-- Body -->
      <div style="flex:1;overflow-y:auto;padding:16px 18px">

        ${docsHtml}

        <!-- Instructions -->
        ${instructions ? `
        <div style="margin-bottom:14px">
          <div style="font-family:var(--font-head);font-size:12px;letter-spacing:.08em;
                      text-transform:uppercase;color:rgba(255,255,255,.6);margin-bottom:6px">
            Review Instructions
          </div>
          <div style="font-family:var(--font-head);font-size:12px;color:rgba(240,246,255,.7);
                      padding:9px 12px;background:rgba(0,210,255,.04);
                      border:1px solid rgba(0,210,255,.12);border-left:2px solid rgba(0,210,255,.4);
                      line-height:1.6">
            ${esc(instructions)}
          </div>
        </div>` : ''}

        <!-- Review comments -->
        <div style="margin-bottom:14px">
          <label style="font-family:var(--font-head);font-size:12px;letter-spacing:.08em;
                        text-transform:uppercase;color:rgba(255,255,255,.6);display:block;margin-bottom:6px">
            Your Review Comments
            <span style="text-transform:none;letter-spacing:0;color:rgba(255,255,255,.2)"> (optional)</span>
          </label>
          <textarea id="rrp-comments"
            placeholder="Add your review notes, observations, or change requests…"
            style="width:100%;padding:8px 10px;background:#1a2a40;border:1px solid rgba(0,210,255,.2);
                   color:#C8DFF0;font-family:var(--font-head);font-size:12px;outline:none;
                   resize:none;box-sizing:border-box;line-height:1.6"
            rows="4"
            onfocus="this.style.borderColor='rgba(0,210,255,.5)'"
            onblur="this.style.borderColor='rgba(0,210,255,.2)'"></textarea>
        </div>

        <!-- Chain of custody -->
        <div>
          <div style="font-family:var(--font-head);font-size:12px;letter-spacing:.08em;
                      text-transform:uppercase;color:rgba(255,255,255,.6);margin-bottom:6px">
            Chain of Custody
          </div>
          <div style="padding:2px 0">${cocHtml}</div>
        </div>
      </div>

      <!-- Action footer -->
      <div style="padding:12px 18px;border-top:1px solid rgba(255,255,255,.07);
                  display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;
                  background:rgba(0,0,0,.2)">
        <button onclick="document.getElementById('req-review-panel').remove()"
          style="font-family:var(--font-head);font-size:11px;padding:6px 16px;
                 background:none;border:1px solid rgba(255,255,255,.15);
                 color:rgba(255,255,255,.4);cursor:pointer;letter-spacing:.06em">
          Cancel
        </button>
        <button id="rrp-reject-btn"
          onclick="_rrpSubmit('${item.id}','${item.instanceId||''}','rejected','${item._wrRole||''}')"
          style="font-family:var(--font-head);font-size:11px;font-weight:700;padding:6px 18px;
                 background:rgba(226,75,74,.1);border:1px solid rgba(226,75,74,.4);
                 color:#E24B4A;cursor:pointer;letter-spacing:.06em">
          ✗ Request Changes
        </button>
        <button id="rrp-approve-btn"
          onclick="_rrpSubmit('${item.id}','${item.instanceId||''}','approved','${item._wrRole||''}')"
          style="font-family:var(--font-head);font-size:11px;font-weight:700;padding:6px 18px;
                 background:rgba(29,158,117,.15);border:1px solid rgba(29,158,117,.4);
                 color:#1D9E75;cursor:pointer;letter-spacing:.06em">
          ✓ Approve
        </button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  document.getElementById('rrp-comments')?.focus();

  // B-UI-4 (CMD74): fire modal.opened after DOM commit. The
  // appendChild above is synchronous and the subtree is queryable
  // immediately; the rAF is a belt-and-suspenders paint-tick guard
  // mirroring B-UI-1's work_queue.rendered pattern. The Wait ForModal
  // consumer can query form fields and buttons inside the overlay
  // immediately after resolve.
  //
  // Role literal is derived here at the emit boundary, not forwarded
  // from item._wrRole directly. This pins Wait ForModal's match
  // target to a stable one-of-two vocabulary ('reviewer' | 'approver')
  // even if _wrRole's internal values change. The protocol surface
  // owns its vocabulary independent of internal field churn. Site 2
  // (Resubmit panel) uses the same emit-boundary pattern with literal
  // 'submitter_resubmit'.
  if (typeof window._cmdEmit === 'function') {
    requestAnimationFrame(function() {
      window._cmdEmit('modal.opened', {
        modal_id:    'req-review-panel',
        modal_name:  'Document Review Request',
        instance_id: item.instanceId || null,
        role:        (item && item._wrRole === 'approver') ? 'approver' : 'reviewer',
      });
    });
  }
}

// ── Resubmit Panel ────────────────────────────────────────────────────────────
// Opens when the SUBMITTER clicks a "↺ Changes requested" or "↺ Re-review requested"
// action item. Lets them upload revised documents and resubmit to reviewers.
// On submit: resolves their action item, creates reviewer work items, notifies.
// ─────────────────────────────────────────────────────────────────────────────
window.openResubmitPanel = async function openResubmitPanel(item) {
  document.getElementById('req-resubmit-panel')?.remove();

  const firmId  = _mwFirmId();
  const resName = _myResource?.name || 'Unknown';
  const resId   = _myResource?.id   || null;

  // Fetch instance + CoC for full context
  let instance = null;
  let cocEvents = [];
  if (item.instanceId) {
    try {
      const [instRows, coc] = await Promise.all([
        API.get(`workflow_instances?id=eq.${item.instanceId}&select=*&limit=1`).catch(()=>[]),
        API.get(`coc_events?entity_id=eq.${item.instanceId}&order=occurred_at.asc&select=*`).catch(()=>[]),
      ]);
      instance  = instRows?.[0] || null;
      cocEvents = coc || [];
    } catch(e) { console.warn('[ResubmitPanel] fetch failed:', e); }
  }

  // Get most recent submission details (captures reviewer list from original submit,
  // but prior docs from the most recent resubmission)
  let submittedDetails = {};
  // For reviewer list: use the FIRST submitted event (has the full reviewer/approver config)
  const firstSubmitEvent = cocEvents
    .filter(e => e.event_type === 'request.submitted')
    .sort((a,b) => new Date(a.occurred_at||a.created_at) - new Date(b.occurred_at||b.created_at))[0];
  if (firstSubmitEvent) {
    try { submittedDetails = JSON.parse(firstSubmitEvent.event_notes || '{}'); } catch(_) {}
  }

  // Get the changes_requested event for context
  const changesEv = [...cocEvents].reverse().find(e => e.event_type === 'request.changes_requested');
  let changesNote = '';
  if (changesEv) {
    try { changesNote = JSON.parse(changesEv.event_notes||'{}').comments || ''; } catch(_) {}
  }

  const reviewers    = submittedDetails.reviewers || [];
  const approver     = submittedDetails.approver || null;
  const instTitle    = instance?.title || item.title || 'Document review';
  const changerName  = changesEv?.actor_name || 'Approver';

  // Prior documents shown as reminders
  const priorDocs = (submittedDetails.docs||[]);
  const priorDocsHtml = priorDocs.length ? `
    <div style="margin-bottom:4px;font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.35)">
      Prior documents (re-upload revised versions below):
    </div>
    ${priorDocs.map(d => `<div style="font-family:var(--font-head);font-size:11px;
      color:rgba(255,255,255,.3);padding:3px 8px;background:rgba(255,255,255,.02);
      border-left:2px solid rgba(255,255,255,.1);margin-bottom:2px">
      📄 ${esc(d.name||'Document')} <span style="color:rgba(255,75,74,.4)">↑ re-upload required</span>
    </div>`).join('')}` : '';

  const overlay = document.createElement('div');
  overlay.id = 'req-resubmit-panel';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:800;' +
    'display:flex;align-items:center;justify-content:center;padding:20px';

  overlay.innerHTML = `
    <div style="background:#0d1b2e;border:1px solid rgba(239,159,39,.35);width:560px;max-height:88vh;
                border-radius:4px;overflow:hidden;display:flex;flex-direction:column">

      <!-- Header -->
      <div style="padding:14px 18px 12px;border-bottom:1px solid rgba(255,255,255,.07);
                  display:flex;align-items:flex-start;gap:10px;flex-shrink:0;
                  background:rgba(239,159,39,.04)">
        <div style="flex:1">
          <div style="font-family:var(--font-head);font-size:11px;letter-spacing:.08em;
                      text-transform:uppercase;color:#EF9F27;margin-bottom:4px">
            ↺ Changes Requested — Resubmit
          </div>
          <div style="font-family:var(--font-head);font-size:13px;font-weight:700;color:#F0F6FF;margin-bottom:3px">
            ${esc(instTitle)}
          </div>
          <div style="font-family:var(--font-head);font-size:12px;color:rgba(255,255,255,.45)">
            ${changerName} requested changes${changesNote ? ' — ' + esc(changesNote) : ''}
          </div>
        </div>
        <button onclick="document.getElementById('req-resubmit-panel').remove()"
          style="background:none;border:1px solid rgba(226,75,74,.3);color:#E24B4A;
                 width:22px;height:22px;cursor:pointer;font-family:var(--font-head);
                 font-size:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center">
          &#x2715;
        </button>
      </div>

      <!-- Body -->
      <div style="flex:1;overflow-y:auto;padding:16px 18px">

        <!-- Reviewers being notified -->
        <div style="margin-bottom:14px;padding:10px 12px;background:rgba(0,210,255,.03);
                    border:1px solid rgba(0,210,255,.1);border-left:2px solid rgba(0,210,255,.3)">
          <div style="font-family:var(--font-head);font-size:12px;color:rgba(0,210,255,.7);margin-bottom:4px">
            Reviewers to be notified on resubmit:
          </div>
          <div style="font-family:var(--font-head);font-size:12px;color:rgba(255,255,255,.65)">
            ${reviewers.map(r => esc(r.name||r.email||'Reviewer')).join(' · ') || 'No reviewers found'}
          </div>
        </div>

        <!-- Prior docs reminder -->
        ${priorDocsHtml ? `<div style="margin-bottom:14px">${priorDocsHtml}</div>` : ''}

        <!-- New document upload -->
        <div style="margin-bottom:14px">
          <div style="font-family:var(--font-head);font-size:12px;letter-spacing:.06em;
                      text-transform:uppercase;color:rgba(255,255,255,.6);margin-bottom:6px">
            Attach Revised Document(s) <span style="color:#E24B4A">*</span>
          </div>
          <label id="rsb-file-label"
            style="display:flex;align-items:center;gap:8px;padding:10px 14px;
                   background:rgba(0,210,255,.04);border:1px dashed rgba(0,210,255,.3);
                   color:#00D2FF;font-family:var(--font-head);font-size:12px;
                   cursor:pointer;transition:background .12s"
            onmouseover="this.style.background='rgba(0,210,255,.09)'"
            onmouseout="this.style.background='rgba(0,210,255,.04)'">
            <span>📎</span>
            <span id="rsb-file-names">Click to attach PDF, Word, or Excel</span>
            <input type="file" id="rsb-file-input" multiple accept=".pdf,.doc,.docx,.xls,.xlsx"
              style="display:none" onchange="_rsbOnFiles(this)">
          </label>
        </div>

        <!-- Resubmit note -->
        <div style="margin-bottom:14px">
          <label style="font-family:var(--font-head);font-size:12px;letter-spacing:.06em;
                        text-transform:uppercase;color:rgba(255,255,255,.6);display:block;margin-bottom:6px">
            Note to Reviewers
            <span style="text-transform:none;letter-spacing:0;color:rgba(255,255,255,.3);font-size:11px"> (optional)</span>
          </label>
          <textarea id="rsb-note"
            placeholder="Describe what was changed in this revision…"
            style="width:100%;padding:8px 10px;background:#1a2a40;border:1px solid rgba(0,210,255,.2);
                   color:#C8DFF0;font-family:var(--font-head);font-size:12px;outline:none;
                   resize:none;box-sizing:border-box;line-height:1.6" rows="3"
            onfocus="this.style.borderColor='rgba(0,210,255,.5)'"
            onblur="this.style.borderColor='rgba(0,210,255,.2)'"></textarea>
        </div>

        <div id="rsb-status" style="font-family:var(--font-head);font-size:12px;
             color:rgba(255,75,74,.8);min-height:16px;margin-bottom:8px"></div>

      </div>

      <!-- Footer -->
      <div style="padding:12px 18px;border-top:1px solid rgba(255,255,255,.07);
                  display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;
                  background:rgba(0,0,0,.2)">
        <button onclick="document.getElementById('req-resubmit-panel').remove()"
          style="font-family:var(--font-head);font-size:11px;padding:6px 16px;
                 background:none;border:1px solid rgba(255,255,255,.15);
                 color:rgba(255,255,255,.4);cursor:pointer;letter-spacing:.06em">
          Cancel
        </button>
        <button id="rsb-submit-btn"
          onclick="_rsbSubmit('${item.id}','${item.instanceId||''}')"
          style="font-family:var(--font-head);font-size:11px;font-weight:700;padding:6px 20px;
                 background:rgba(239,159,39,.12);border:1px solid rgba(239,159,39,.5);
                 color:#EF9F27;cursor:pointer;letter-spacing:.06em">
          ↺ Resubmit for Review
        </button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  // B-UI-4 (CMD74): fire modal.opened after DOM commit.
  if (typeof window._cmdEmit === 'function') {
    requestAnimationFrame(function() {
      window._cmdEmit('modal.opened', {
        modal_id:    'req-resubmit-panel',
        modal_name:  'Resubmit for Review',
        instance_id: item.instanceId || null,
        role:        'submitter_resubmit',
      });
    });
  }

  // Store context for submit handler
  window._rsbContext = { reviewers, approver, submittedDetails, firmId };
};

// ── Track selected files for resubmit ────────────────────────────────────────
window._rsbFiles = [];
window._rsbOnFiles = function(input) {
  window._rsbFiles = Array.from(input.files||[]);
  const label = document.getElementById('rsb-file-names');
  if (label) {
    label.textContent = window._rsbFiles.length
      ? window._rsbFiles.map(f => f.name).join(', ')
      : 'Click to attach PDF, Word, or Excel';
  }
};

// ── Resubmit submit handler ───────────────────────────────────────────────────
window._rsbSubmit = async function(actionItemId, instanceId) {
  const note     = document.getElementById('rsb-note')?.value?.trim() || '';
  const statusEl = document.getElementById('rsb-status');
  const submitBtn = document.getElementById('rsb-submit-btn');
  const files    = window._rsbFiles || [];
  const ctx      = window._rsbContext || {};

  if (!files.length) {
    if (statusEl) statusEl.textContent = 'Please attach at least one revised document.';
    return;
  }

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Uploading…'; }
  if (statusEl)  statusEl.textContent = '';

  const firmId  = _mwFirmId();
  const resName = _myResource?.name || 'Unknown';
  const resId   = _myResource?.id   || null;
  const now     = new Date().toISOString();

  try {
    // 1. Upload documents to storage
    const uploadedDocs = [];
    for (const file of files) {
      try {
        const token  = await Auth.getFreshToken().catch(() => Auth.getToken()).catch(() => null);
        const bucket = (typeof _mwStorageBucket === 'function') ? _mwStorageBucket() : 'workflow-documents';
        const path   = `${firmId}/${instanceId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
        const uploadRes = await fetch(
          `${(typeof _mwSupaURL==='function'?_mwSupaURL():'https://dvbetgdzksatcgdfftbs.supabase.co')}/storage/v1/object/${bucket}/${path}`,
          { method:'POST', headers:{
              'Authorization': `Bearer ${token||''}`,
              'Content-Type': file.type||'application/octet-stream',
              'x-upsert': 'true',
            }, body: file }
        );
        if (uploadRes.ok) {
          uploadedDocs.push({ name: file.name, path, mime: file.type, size: file.size, source: 'upload' });
        }
      } catch(uploadErr) { console.warn('[Resubmit] upload error:', uploadErr); }
    }

    if (!uploadedDocs.length) {
      if (statusEl)  statusEl.textContent = 'Upload failed — please try again.';
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '↺ Resubmit for Review'; }
      return;
    }

    // 2. Write new request.submitted CoC event (this is the re-submission record)
    const cocPayload = {
      id:           crypto.randomUUID(),
      firm_id:      firmId,
      entity_id:    instanceId,
      entity_type:  'workflow_instance',
      event_type:   'request.submitted',
      event_class:  'lifecycle',
      severity:     'info',
      event_notes:  JSON.stringify({
        ...ctx.submittedDetails,
        docs:         uploadedDocs,
        doc_name:     uploadedDocs.map(d=>d.name).join(', '),
        note:         note || undefined,
        resubmission: true,
      }),
      actor_name:   resName,
      actor_resource_id: resId,
      occurred_at:  now,
      created_at:   now,
    };
    await API.post('coc_events', cocPayload).catch(()=>{});

    // 3. Reset workflow_instance back to Review step
    await API.patch(`workflow_instances?id=eq.${instanceId}`, {
      status:            'in_progress',
      current_step_name: 'Review',
      updated_at:        now,
      attachments:       uploadedDocs,
    }).catch(()=>{});

    // 4. Re-open all reviewer workflow_requests rows
    await API.patch(
      `workflow_requests?instance_id=eq.${instanceId}&role=eq.reviewer`,
      { status: 'open', updated_at: now }
    ).catch(()=>{});

    // 5. Create new workflow_action_items for each reviewer
    for (const reviewer of (ctx.reviewers||[])) {
      if (!reviewer.id) continue;
      await API.post('workflow_action_items', {
        id:                crypto.randomUUID(),
        firm_id:           firmId,
        instance_id:       instanceId,
        title:             `Review request: ${uploadedDocs.map(d=>d.name).join(', ')}`,
        body:              note || ctx.submittedDetails?.instructions || '',
        status:            'open',
        owner_resource_id: reviewer.id,
        owner_name:        reviewer.name || '',
        created_by_name:   resName,
      }).catch(()=>{});

      // 6. Email reviewer
      if (reviewer.email && window._myrNotify) {
        _myrNotify({
          toEmail:    reviewer.email,
          toName:     reviewer.name || '',
          fromName:   resName,
          stepName:   'Review',
          stepType:   'review',
          title:      uploadedDocs.map(d=>d.name).join(', '),
          instanceId: instanceId,
          body:       note || 'A revised document has been submitted for your review.',
        }).catch(()=>{});
      }
    }

    // 7. Resolve the submitter's "Changes requested" action item
    if (actionItemId) {
      await API.patch(
        `workflow_action_items?id=eq.${actionItemId}`,
        { status: 'resolved', updated_at: now }
      ).catch(()=>{});
    }
    // Also resolve any other open changes-requested items for this instance
    await API.patch(
      `workflow_action_items?instance_id=eq.${instanceId}&status=eq.open`,
      { status: 'resolved', updated_at: now }
    ).catch(()=>{});

    // 8. Close panel and refresh
    document.getElementById('req-resubmit-panel')?.remove();
    window._rsbFiles = [];
    window._mwWorkStale = true;
    window._requestsLoaded = false;
    window.loadUserRequests && window.loadUserRequests();
    window._pollNow && window._pollNow();
    compassToast(`↺ Resubmitted — ${ctx.reviewers?.length||0} reviewer(s) notified.`);

  } catch(err) {
    console.error('[Resubmit] failed:', err);
    if (statusEl)  statusEl.textContent = 'Resubmit failed — ' + (err.message||'check console');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '↺ Resubmit for Review'; }
  }
};


// ── Review panel submit ───────────────────────────────────
window._rrpSubmit = async function(actionItemId, instanceId, decision, wrRole) {
  const comments = document.getElementById('rrp-comments')?.value?.trim() || '';
  const firmId   = _mwFirmId();
  const resName  = _myResource?.name || 'Unknown';
  const resId    = _myResource?.id   || null;
  const now      = new Date().toISOString();

  // Disable buttons
  ['rrp-approve-btn','rrp-reject-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
  });

  const approved   = decision === 'approved';
  const newStatus  = approved ? 'in_progress' : 'in_progress'; // stays active until Approver signs off
  const eventType  = approved ? 'request.approved' : 'request.changes_requested';
  // Simple 3-step flow: Submit → Review → Approve
  // Reviewer approval → moves to Approve step
  // Approver approval → complete; rejection loops back to Review
  const stepName = approved ? 'Approve' : 'Review';

  try {
    // 1. Update workflow_instance — only advance step if all reviewers are now done
    if (instanceId) {
      // Check remaining open reviewer rows AFTER this one resolves
      // We do this before patching so we can count accurately
      const remainingReviewers = await API.get(
        `workflow_requests?instance_id=eq.${instanceId}&role=eq.reviewer&status=eq.open&select=id&limit=50`
      ).catch(e => { console.error('[rrpSubmit] remainingReviewers fetch failed:', e.message); return []; });
      const otherOpenReviewers = (remainingReviewers||[]).filter(r => r.id !== actionItemId);
      const allReviewersDone = otherOpenReviewers.length === 0;

      // Never write current_step_name from _rrpSubmit.
      // For doc-review: step display is driven by CoC approval count in mw-tabs.
      // approve.html is the sole owner of current_step_name for this workflow.
      // Writing it here races with approve.html and overwrites the Submit reset.
      await API.patch(`workflow_instances?id=eq.${instanceId}`, {
        status:     newStatus,
        updated_at: now,
      }).catch(()=>{});
    }

    const isWrRow = !!(wrRole);
    if (isWrRow) {
      await API.patch(`workflow_requests?id=eq.${actionItemId}`, {
        status: 'resolved',
        updated_at: now,
      }).catch(()=>{});
    } else {
      await API.patch(`workflow_action_items?id=eq.${actionItemId}`, {
        status: 'resolved',
        updated_at: now,
      }).catch(e => console.error('[rrpSubmit] workflow_action_items PATCH failed:', e.message));
    }

    // 3. Write CoC event
    await API.post('coc_events', {
      id:                crypto.randomUUID(),
      firm_id:           firmId,
      entity_id:         instanceId || actionItemId,
      entity_type:       'workflow_instance',
      event_type:        eventType,
      event_class:       'lifecycle',
      severity:          approved ? 'info' : 'warning',
      event_notes:       JSON.stringify({
        decision,
        comments,
        reviewer: resName,
      }),
      actor_name:        resName,
      actor_resource_id: resId,
      occurred_at:       now,
      created_at:        now,
    });

    // If approved, notify submitter via a new action item in their My Work
    //    Fetch instance to get submitted_by_resource_id
    // B1 (CMD54): also pull current_step_id so we can derive `seq` for emit #4.
    let inst = null;
    let resolvedSeq = null;
    if (instanceId) {
      const instRows = await API.get(
        `workflow_instances?id=eq.${instanceId}&select=submitted_by_resource_id,submitted_by_name,title,current_step_id&limit=1`
      ).catch(()=>[]);
      inst = instRows?.[0];

      // Derive seq from current_step_id (one tiny extra GET per resolution —
      // acceptable: _rrpSubmit is not a hot path).
      if (inst?.current_step_id) {
        try {
          const stepRows = await API.get(
            `workflow_template_steps?id=eq.${inst.current_step_id}&select=sequence_order&limit=1`
          ).catch(()=>[]);
          if (stepRows && stepRows[0] && stepRows[0].sequence_order != null) {
            resolvedSeq = stepRows[0].sequence_order;
          }
        } catch(_) {}
      }

      // Only notify submitter when changes are requested — that requires their action.
      // Approvals are visible via step color + CoC; no queue item needed.
      // Note: do NOT guard on resId !== submitted_by — submitter may also be a reviewer.
      if (!approved && inst?.submitted_by_resource_id) {
        await API.post('workflow_action_items', {
          id:                crypto.randomUUID(),
          firm_id:           _mwFirmId(),
          instance_id:       instanceId,
          title:             `↺ Changes requested: ${inst.title||'Document review request'}`,
          body:              comments || 'Changes were requested. Please revise and resubmit.',
          status:            'open',
          owner_resource_id: inst.submitted_by_resource_id,
          owner_name:        inst.submitted_by_name || '',
          created_by_name:   resName,
        }).catch(()=>{});
      }

      // Partial approval is recorded in the CoC — no separate action item needed.
      // Other reviewers will see the amber step color in the submitter's My Requests view.
    }

    // ── Emit #4: workflow_request.resolved (B1 / CMD54) ─────────────────────
    // Closes the loop on routing policies and feeds velocity counters (Class 2).
    // CommandHUD cancels any pending dispatch requests keyed to this request.
    // `decision` normalises to the ecosystem-contract vocabulary: the raw
    // parameter value 'rejected' maps to 'changes_requested' because the
    // actual semantic in this flow is changes-requested (see request.changes_requested
    // CoC event and the "Changes requested" UI copy).
    if (typeof window._cmdEmit === 'function' && instanceId) {
      window._cmdEmit('workflow_request.resolved', {
        instance_id:           instanceId,
        seq:                   resolvedSeq,
        resolver_resource_id:  resId,
        resolver_name:         resName,
        decision:              approved ? 'approved' : 'changes_requested',
      });
    }

    // ── Advance to next template step via resolution engine ──────────────────
    // After a successful approval, look up the current step sequence and route
    // the next step. This is what moves the instance from step 1 → 2 → 3 → 4.
    if (approved && instanceId && typeof window._mwResolveAndRoute === 'function') {
      try {
        const instFull = await API.get(
          `workflow_instances?id=eq.${instanceId}` +
          `&select=id,template_id,form_def_id,current_step_id,submitted_by_resource_id,title,launched_at&limit=1`
        ).catch(() => []);
        const instRow = instFull?.[0];
        if (instRow && instRow.template_id) {
          // Load all template steps
          const allSteps = await API.get(
            `workflow_template_steps?template_id=eq.${instRow.template_id}` +
            `&order=sequence_order.asc&select=id,name,step_type,sequence_order,assignee_type,assignee_role,template_id`
          ).catch(() => []);

          // Find the current step and the next one
          const currStep = (allSteps||[]).find(s => s.id === instRow.current_step_id);
          const currSeq  = currStep ? currStep.sequence_order : 0;
          const nextStep = (allSteps||[]).find(s =>
            s.sequence_order > currSeq && s.step_type !== 'trigger'
          );

          if (nextStep) {
            const submitterResId = instRow.submitted_by_resource_id;
            const formName = instRow.title || 'Expense Report';

            // Write step_activated event — fire-and-forget
            API.post('workflow_step_instances', {
              firm_id:     _mwFirmId(),
              instance_id: instanceId,
              event_type:  'step_activated',
              step_name:   nextStep.name,
              step_type:   nextStep.step_type,
              created_at:  now,
            }).catch(() => {});

            // Update instance current_step_id + current_step_name — fire-and-forget
            API.patch(`workflow_instances?id=eq.${instanceId}`, {
              current_step_id:   nextStep.id,
              current_step_name: nextStep.name,
              updated_at:        now,
            }).catch(() => {});

            // Route the next step — fire-and-forget so panel closes immediately.
            // Routing (DB writes + notify) happens in background.
            window._mwResolveAndRoute(
              instanceId, allSteps, nextStep.sequence_order, submitterResId, formName
            ).catch(e => console.warn('[rrpSubmit] next-step routing failed:', e));

            console.log('%c[rrpSubmit] advanced to step ' + nextStep.sequence_order +
              ' (' + nextStep.assignee_role + ') — ' + nextStep.name,
              'background:#1a4a2a;color:#3de08a;padding:2px 8px;border-radius:3px');
          } else {
            // B-UI-8 (CMD77): three changes under one version bump —
            //   (1) schema-drift hotfix: status 'completed' → 'complete'
            //       (workflow_instances_status_check enforces 'complete')
            //   (2) current_step_name: 'Completed' added so HISTORY rows
            //       display "Completed" rather than retaining last in-flight
            //       step label
            //   (3) Part B error propagation: silent .catch(() => {})
            //       previously swallowed PATCH failures, causing downstream
            //       instance.completed emit to fire on un-persisted state.
            //       B-UI-7 ship verification surfaced this (schema-drift
            //       false-completion regression). Rule 34 intra-session
            //       analog: write success is a precondition for the
            //       state-change emit.
            var patchOk = false;
            try {
              await API.patch(`workflow_instances?id=eq.${instanceId}`, {
                status:     'complete',
                current_step_name: 'Completed',
                updated_at: now,
              });
              patchOk = true;
            } catch (err) {
              console.error('[_rrpSubmit] terminal PATCH failed', err);

              // ── B-UI-9 (CMD78) Parts A/B/C: approval-failure observability
              // Iron Rule 34 extended — a state-change outcome must mirror to
              // every actor who needs to know. B-UI-8 Part B already covers
              // the approver (error toast below, unchanged). B-UI-9 adds:
              //   Part A — emit instance.approval_failed onto the bus so
              //            Aegis / submitter-session subscribers receive it.
              //            Emit fires BEFORE the toast so cross-actor signal
              //            goes out even if compassToast is unavailable.
              //   Part B — write a coc_event with event_type
              //            'request.approval_failed' so the audit surface
              //            sees the failed attempt. Matches the direct-post
              //            pattern used elsewhere in this file for
              //            request.submitted / request.approved / etc.
              //   Part C — notify admins via window._notifyAdminsOfIssue
              //            (mw-tabs.js CMD78 extracted helper). Same surface
              //            admins learn about instance.blocked through.
              // workflow_request_id not in scope at this site; null per
              // Scenario D default. resolvedSeq derived earlier at line ~1133.
              var attemptedAt = new Date().toISOString();
              var errMsg = (err && err.message) || String(err);

              // Part A — emit onto bus
              if (typeof window._cmdEmit === 'function') {
                window._cmdEmit('instance.approval_failed', {
                  instance_id:          instanceId,
                  workflow_request_id:  null,
                  approver_resource_id: resId,
                  approver_name:        resName,
                  seq:                  resolvedSeq,
                  error_message:        errMsg,
                  attempted_at:         attemptedAt,
                });
              }

              // Part B — CoC write (fire-and-forget; audit is best-effort)
              API.post('coc_events', {
                id:           crypto.randomUUID(),
                firm_id:      firmId,
                entity_id:    instanceId,
                entity_type:  'workflow_instance',
                event_type:   'request.approval_failed',
                event_class:  'lifecycle',
                severity:     'warning',
                event_notes:  JSON.stringify({
                  approver_name:  resName,
                  seq:            resolvedSeq,
                  error_message:  errMsg,
                  attempted_at:   attemptedAt,
                }),
                actor_name:        resName,
                actor_resource_id: resId,
                occurred_at:       attemptedAt,
                created_at:        attemptedAt,
              }).catch(function(e){ console.warn('[_rrpSubmit] approval_failed CoC write failed:', e && e.message); });

              // Part C — admin notification via shared helper.
              // Fetch submitter resource row for the manager_id fallback, to
              // match _mwResolveAndRoute's data flow exactly. Best-effort; if
              // fetch fails we pass null and admins-via-users-table still fire.
              if (typeof window._notifyAdminsOfIssue === 'function') {
                (async function() {
                  var submitterRes = null;
                  try {
                    var submitterResId = instRow && instRow.submitted_by_resource_id;
                    if (submitterResId) {
                      var subRows = await API.get(
                        'resources?id=eq.' + submitterResId + '&select=id,name,manager_id&limit=1'
                      ).catch(function(){ return []; });
                      submitterRes = subRows && subRows[0] || null;
                    }
                  } catch(_) {}
                  var formName = (instRow && instRow.title) || 'Document review';
                  var adminTitle = '⚠ Approval did not save: ' + formName;
                  var adminBody  = 'Approver ' + resName + ' attempted to approve "' + formName +
                    '" but the save failed (' + errMsg + '). The approver has been asked to retry. ' +
                    'If the failure persists, investigate RLS / schema / service availability on workflow_instances.';
                  await window._notifyAdminsOfIssue(
                    instanceId, firmId, submitterRes,
                    adminTitle, adminBody,
                    '_rrpSubmit.approval_failed'
                  );
                })();
              }
              // ── end B-UI-9 block ──────────────────────────────────────────

              if (typeof window.compassToast === 'function') {
                window.compassToast('Approval did not save — please try again.', 4000);
              }
              // Do NOT fire instance.completed — DB state did not change.
              return;
            }
            console.log('[rrpSubmit] workflow complete — no further steps');

            // ── Emit #6: instance.completed (B1 / CMD54) ────────────────
            // End-of-lifecycle event. Feeds duration statistics (Class 4/6
            // anomaly detection) and terminates Wait ForEvent listeners
            // keyed on this instance. `final_status` normalises to the
            // ecosystem-contract vocabulary ('complete' | 'cancelled');
            // the DB column stores 'complete'.
            if (typeof window._cmdEmit === 'function') {
              let elapsedMs = null;
              if (instRow.launched_at) {
                const launchedMs = Date.parse(instRow.launched_at);
                if (!isNaN(launchedMs)) elapsedMs = Date.now() - launchedMs;
              }
              window._cmdEmit('instance.completed', {
                instance_id:   instanceId,
                template_id:   instRow.template_id || null,
                final_status:  'complete',
                elapsed_ms:    elapsedMs,
              });
            }
          }
        }
      } catch(e) {
        console.error('[rrpSubmit] step advance failed:', e);
      }
    }

    // Close panel and show toast IMMEDIATELY — don't wait for notifications
    document.getElementById('req-review-panel')?.remove();
    compassToast(approved
      ? `✓ Request approved${comments?' — comments recorded':''}. Submitter notified.`
      : `↺ Changes requested${comments?' — feedback recorded':''}. Submitter notified.`
    );

    // Email submitter — fire-and-forget, never block UI on this
    if (inst?.submitted_by_resource_id) {
      try {
        const submitterRes = (_resources||[]).find(r => r.id === inst.submitted_by_resource_id);
        if (submitterRes?.email) {
          _myrNotify({
            toEmail: submitterRes.email, toName: submitterRes.name || inst.submitted_by_name,
            fromName: resName,
            stepName: approved ? 'Approved' : 'Changes requested',
            stepType: 'review',
            title: inst.title || 'Document review request',
            instanceId,
            body: comments || (approved ? 'Your request has been approved.' : 'Changes were requested.'),
          }).catch(()=>{});
        }
      } catch(_) {}
    }

    // If all reviewers have now approved → notify the approver
    // Check workflow_requests (new table) — no title-prefix heuristic needed
    if (approved && instanceId) {
      try {
        const openRequests = await API.get(
          `workflow_requests?instance_id=eq.${instanceId}&status=eq.open&select=id,role,owner_name,owner_resource_id`
        ).catch(() => []);
        // If only the approver row remains open, all reviewers are done
        const onlyApproveLeft = (openRequests||[]).every(r => r.role === 'approver');
        if (onlyApproveLeft && openRequests?.length) {
          // All reviewers done — advance step to Approve.
          // This is now the only place current_step_name is written for doc-review.
          await API.patch(`workflow_instances?id=eq.${instanceId}`, {
            current_step_name: 'Approve',
            updated_at:        new Date().toISOString(),
          }).catch(()=>{});
          const approveRow = openRequests[0];
          const approverRes = (_resources||[]).find(r => r.id === approveRow.owner_resource_id);
          const approverEmail = approverRes?.email || '';
          if (approverEmail) {
            window._myrNotify && _myrNotify({
              toEmail: approverEmail,
              toName:  approveRow.owner_name || '',
              fromName: resName,
              stepName: 'Approve',
              stepType: 'approval',
              title: inst?.title || 'Document review request',
              instanceId,
              body: 'All reviewers have approved. Your sign-off is required.',
            }).catch(()=>{});
          }
        }
      } catch(_) {}
    }

    // Close the review panel immediately
    document.getElementById('req-review-panel')?.remove();
    compassToast(approved
      ? `✓ Approved — submitter notified.`
      : `↺ Changes requested — submitter notified.`
    );

    // Instantly remove the item from the in-memory work list and re-render.
    // No DB read needed — item ID is known, filter it out and refresh in place.
    if (window._wiItems) {
      window._wiItems = window._wiItems.filter(w => w.id !== actionItemId);
      window._mwRefreshWorkItems && window._mwRefreshWorkItems();
    }

    // Mark stale for next visit; silently refresh requests if user is on that tab.
    window._mwWorkStale = true;
    const _rrpActiveTab = typeof _uActiveTab !== 'undefined' ? _uActiveTab : 'work';
    if (_rrpActiveTab === 'requests') {
      window._requestsLoaded = false;
      window.loadUserRequests && window.loadUserRequests();
    }

  } catch(e) {
    console.error('[ReviewPanel] submit failed:', e);
    compassToast('Submit failed — ' + (e.message||'check console'), 4000);
    ['rrp-approve-btn','rrp-reject-btn'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    });
  }
};