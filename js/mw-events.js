// VERSION: 20260402-120700
console.log('%c[mw-events] v20260402-120700','background:#c47d18;color:#000;font-weight:700;padding:2px 8px;border-radius:3px');

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
      // ── Review requests from My Requests system ──────────
      // These are identified by instanceId + title prefix "Review request:"
      // Route to the dedicated review panel instead of LOE negotiation.
      if (item.instanceId && (item.title||'').startsWith('Review request:')) {
        openRequestReviewPanel(item);
        return;
      }
      const _ns = negGetState(item.id).state;
      if (_ns==='unrated' || _ns==='pending' || _ns==='negotiating' || _ns==='escalated') {
        // Not yet agreed — open drawer to LOE negotiation panel
        openWorkItemExpanded(item);
      } else {
        // Agreed or locked — ready to resolve
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
    if (item) openWorkItemDrawer(item);
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
function openInProgressPanel(item) {
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

async function saveInProgressUpdate(itemId, projectId) {
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

async function openRequestReviewPanel(item) {
  document.getElementById('req-review-panel')?.remove();

  const firmId  = _mwFirmId();
  const resName = _myResource?.name || 'Unknown';
  const resId   = _myResource?.id   || null;

  // Fetch the workflow instance for full context
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
    } catch(e) { console.warn('[ReviewPanel] fetch failed:', e); }
  }

  // Parse submission details from CoC event notes
  let submittedDetails = {};
  const submitEvent = cocEvents.find(e => e.event_type === 'request.submitted');
  if (submitEvent) {
    try { submittedDetails = JSON.parse(submitEvent.event_notes || '{}'); } catch(_) {}
  }

  const docName      = submittedDetails.doc_name || instance?.title || item.title;
  const instructions = submittedDetails.instructions || item.body || '';
  const deadline     = submittedDetails.deadline || item.due || '';
  const submittedBy  = instance?.submitted_by_name || item.createdBy || 'Unknown';
  const submittedAt  = submitEvent
    ? new Date(submitEvent.occurred_at||submitEvent.created_at)
        .toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})
    : '';

  // CoC timeline rows
  const cocHtml = cocEvents.length
    ? cocEvents.map(e => {
        const t = new Date(e.occurred_at||e.created_at).toLocaleString('en-US',
          {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
        const typeLabel = (e.event_type||'').replace('request.','').replace(/_/g,' ');
        const dotColor  = e.event_type==='request.submitted'?'#00D2FF':
                          e.event_type==='request.completed'?'#1D9E75':
                          (e.event_type||'').includes('reject')?'#E24B4A':'#EF9F27';
        return `<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);
                            font-family:var(--font-head);font-size:10px;align-items:flex-start">
          <div style="width:6px;height:6px;border-radius:50%;background:${dotColor};flex-shrink:0;margin-top:3px"></div>
          <div style="color:rgba(0,210,255,.8);min-width:110px">${esc(typeLabel)}</div>
          <div style="color:rgba(255,255,255,.4)">${esc(e.actor_name||'System')}</div>
          <div style="color:rgba(255,255,255,.2);margin-left:auto">${esc(t)}</div>
        </div>`;
      }).join('')
    : `<div style="font-family:var(--font-head);font-size:10px;color:rgba(255,255,255,.2);padding:4px 0">No events yet.</div>`;

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

        <!-- Instructions -->
        ${instructions ? `
        <div style="margin-bottom:14px">
          <div style="font-family:var(--font-head);font-size:10px;letter-spacing:.08em;
                      text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:6px">
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
          <label style="font-family:var(--font-head);font-size:10px;letter-spacing:.08em;
                        text-transform:uppercase;color:rgba(255,255,255,.3);display:block;margin-bottom:6px">
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
          <div style="font-family:var(--font-head);font-size:10px;letter-spacing:.08em;
                      text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:6px">
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
          onclick="_rrpSubmit('${item.id}','${item.instanceId||''}','rejected')"
          style="font-family:var(--font-head);font-size:11px;font-weight:700;padding:6px 18px;
                 background:rgba(226,75,74,.1);border:1px solid rgba(226,75,74,.4);
                 color:#E24B4A;cursor:pointer;letter-spacing:.06em">
          ✗ Request Changes
        </button>
        <button id="rrp-approve-btn"
          onclick="_rrpSubmit('${item.id}','${item.instanceId||''}','approved')"
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
}

// ── Review panel submit ───────────────────────────────────
window._rrpSubmit = async function(actionItemId, instanceId, decision) {
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
    // 1. Update workflow_instance status + current step
    if (instanceId) {
      await API.patch(`workflow_instances?id=eq.${instanceId}`, {
        status:           newStatus,
        current_step_name: stepName,
        updated_at:       now,
      }).catch(()=>{});
    }

    // 2. Resolve the action item
    await API.patch(`workflow_action_items?id=eq.${actionItemId}`, {
      status: 'resolved',
      updated_at: now,
    }).catch(()=>{});

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

    // 4. If approved, notify submitter via a new action item in their My Work
    //    Fetch instance to get submitted_by_resource_id
    if (instanceId) {
      const instRows = await API.get(
        `workflow_instances?id=eq.${instanceId}&select=submitted_by_resource_id,submitted_by_name,title&limit=1`
      ).catch(()=>[]);
      const inst = instRows?.[0];
      if (inst?.submitted_by_resource_id && inst.submitted_by_resource_id !== resId) {
        await API.post('workflow_action_items', {
          id:                crypto.randomUUID(),
          firm_id:           _mwFirmId(),
          instance_id:       instanceId,
          title:             approved
            ? `✓ Approved: ${inst.title||'Document review request'}`
            : `↺ Changes requested: ${inst.title||'Document review request'}`,
          body: comments || (approved ? 'Your request has been approved.' : 'Changes were requested. Please revise and resubmit.'),
          status:            'open',
          owner_resource_id: inst.submitted_by_resource_id,
          owner_name:        inst.submitted_by_name || '',
          created_by_name:   resName,
        }).catch(()=>{});
      }
    }

    document.getElementById('req-review-panel')?.remove();
    compassToast(approved
      ? `✓ Request approved${comments?' — comments recorded':''}. Submitter notified.`
      : `↺ Changes requested${comments?' — feedback recorded':''}. Submitter notified.`
    );

    // Email submitter and any external parties
    if (inst?.submitted_by_resource_id) {
      try {
        const submitterRes = (_resources||[]).find(r => r.id === inst.submitted_by_resource_id);
        if (submitterRes?.email) {
          window._myrNotify && _myrNotify({
            toEmail: submitterRes.email, toName: submitterRes.name || inst.submitted_by_name,
            fromName: resName,
            stepName: approved ? 'Approved' : 'Changes requested',
            stepType: 'review',
            title: inst.title || 'Document review request',
            instanceId,
            body: comments || (approved ? 'Your request has been approved.' : 'Changes were requested.'),
          });
        }
      } catch(_) {}
    }

    // Refresh My Work to remove resolved item
    _viewLoaded['user'] = false;
    _mwLoadUserView();

  } catch(e) {
    console.error('[ReviewPanel] submit failed:', e);
    compassToast('Submit failed — ' + (e.message||'check console'), 4000);
    ['rrp-approve-btn','rrp-reject-btn'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    });
  }
};