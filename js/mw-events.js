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