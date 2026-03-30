// ══════════════════════════════════════════════════════════
// INLINE COMPLETION PANEL (1.C) — renders below work row
// ══════════════════════════════════════════════════════════
let _cmpSignal = null;
let _cmpItem   = null;

function openCompletionPanel(item) {
  _cmpItem = item; _cmpSignal = null;
  document.getElementById('completion-micro-panel')?.remove();
  document.getElementById('inprogress-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'completion-micro-panel';
  panel.style.cssText = 'grid-column:1/-1;border-bottom:2px solid var(--compass-cyan);background:rgba(0,210,255,.03);padding:12px 16px 14px;animation:micro-open 180ms ease';

  panel.innerHTML = `
    <div style="font-family:var(--font-head);font-size:11px;letter-spacing:.1em;
      text-transform:uppercase;color:var(--compass-cyan);margin-bottom:8px;font-weight:700">
      ${item.type==='task'?'Complete task':'Resolve action'} —
      <span style="font-weight:400;color:var(--text2)">${esc(item.title.slice(0,60))}</span>
    </div>
    <div style="display:grid;grid-template-columns:105px 155px 1fr;gap:12px;align-items:start">
      <div>
        <div style="font-family:var(--font-head);font-size:11px;color:var(--text3);
          letter-spacing:.07em;text-transform:uppercase;margin-bottom:5px">Hours</div>
        <input id="cmp-hours" type="number" min="0" max="24" step="0.25" placeholder="0.0"
          style="width:80px;font-family:var(--font-display);font-size:22px;font-weight:700;
            padding:7px 10px;background:var(--bg2);border:1px solid var(--compass-cyan);
            color:var(--compass-cyan);outline:none;text-align:center"/>
      </div>
      <div>
        <div style="font-family:var(--font-head);font-size:11px;color:var(--text3);
          letter-spacing:.07em;text-transform:uppercase;margin-bottom:8px">Signal</div>
        <div style="display:flex;gap:10px">
          <button id="cmp-sig-green" onclick="setCmpSignal('green')" title="On track"
            style="width:28px;height:28px;border-radius:50%;border:2px solid #1D9E75;background:transparent;cursor:pointer;transition:all .12s"
            onmouseenter="this.style.background='rgba(29,158,117,.2)'"
            onmouseleave="this.style.background=_cmpSignal==='green'?'#1D9E75':'transparent'"></button>
          <button id="cmp-sig-yellow" onclick="setCmpSignal('yellow')" title="Some uncertainty"
            style="width:28px;height:28px;border-radius:50%;border:2px solid #EF9F27;background:transparent;cursor:pointer;transition:all .12s"
            onmouseenter="this.style.background='rgba(239,159,39,.2)'"
            onmouseleave="this.style.background=_cmpSignal==='yellow'?'#EF9F27':'transparent'"></button>
          <button id="cmp-sig-red" onclick="setCmpSignal('red')" title="At risk"
            style="width:28px;height:28px;border-radius:50%;border:2px solid #E24B4A;background:transparent;cursor:pointer;transition:all .12s"
            onmouseenter="this.style.background='rgba(226,75,74,.2)'"
            onmouseleave="this.style.background=_cmpSignal==='red'?'#E24B4A':'transparent'"></button>
        </div>
      </div>
      <div>
        <div style="font-family:var(--font-head);font-size:11px;color:var(--text3);
          letter-spacing:.07em;text-transform:uppercase;margin-bottom:5px">Note <span style="color:var(--muted)">(optional)</span></div>
        <textarea id="cmp-note" rows="3" placeholder="What did you complete?"
          style="width:100%;font-family:var(--font-body);font-size:12px;padding:7px 10px;
            background:var(--bg2);border:1px solid var(--border);color:var(--text1);
            outline:none;resize:none;box-sizing:border-box"></textarea>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px">
      <div style="display:flex;align-items:center;gap:12px">
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;
          font-family:var(--font-head);font-size:11px;color:var(--text3)">
          <input id="cmp-billable" type="checkbox" checked style="accent-color:var(--compass-cyan)"/>Billable</label>
        <span id="cmp-status" style="font-family:var(--font-head);font-size:11px;color:var(--compass-amber);min-height:14px"></span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button onclick="skipCompletion()"
          style="font-family:var(--font-head);font-size:11px;font-weight:600;letter-spacing:.07em;
            text-transform:uppercase;padding:6px 14px;background:none;
            border:1px solid var(--border);color:var(--text3);cursor:pointer"
          onmouseenter="this.style.borderColor='var(--text2)';this.style.color='var(--text1)'"
          onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--text3)'">
          Skip <span style="font-weight:400;color:var(--muted)">— no time</span></button>
        <button id="cmp-submit" onclick="submitCompletion()"
          style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.07em;
            text-transform:uppercase;padding:6px 18px;background:var(--compass-cyan);
            color:#060a10;border:none;cursor:pointer;transition:opacity .12s"
          onmouseenter="this.style.opacity='.85'" onmouseleave="this.style.opacity='1'">Complete →</button>
      </div>
    </div>`;

  const wiRow = document.querySelector(`.wi-row[data-wi-id="${item.id}"]`);
  if (wiRow) wiRow.insertAdjacentElement('afterend', panel);
  else { const l=document.getElementById('work-list-rows'); if(l) l.appendChild(panel); }
  setTimeout(() => document.getElementById('cmp-hours')?.focus(), 80);
}

function setCmpSignal(sig) {
  _cmpSignal = _cmpSignal === sig ? null : sig;
  const colors = { green:'#1D9E75', yellow:'#EF9F27', red:'#E24B4A' };
  ['green','yellow','red'].forEach(s => {
    const btn = document.getElementById(`cmp-sig-${s}`);
    if (btn) btn.style.background = _cmpSignal === s ? colors[s] : 'transparent';
  });
}

function closeCompletionPanel() {
  const panel = document.getElementById('completion-micro-panel');
  if (!panel) return;
  panel.style.transition = 'opacity .15s';
  panel.style.opacity = '0';
  setTimeout(() => panel.remove(), 160);
  _cmpItem = null; _cmpSignal = null;
}

document.addEventListener('keydown', e => { if (e.key==='Escape') closeCompletionPanel(); });

// ── Skip — mark done without time, write CoC event ───────
async function skipCompletion() {
  const item = _cmpItem;
  if (!item) { closeCompletionPanel(); return; }
  closeCompletionPanel();

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
  const proj = item.projectId ? _projects?.find(p=>p.id===item.projectId) : null;

  _doneToday.unshift({ id:item.id, title:item.title, project:proj?.name||'—',
    time:timeStr, hours:0, signal:null, noTime:true });

  try {
    await API.post('coc_events',{
      id: crypto.randomUUID(),
      firm_id: 'aaaaaaaa-0001-0001-0001-000000000001',
      entity_id: item.id,
      entity_type: item.type === 'task' ? 'task' : 'action_item',
      event_type: 'completed',
      step_name: item.type === 'task' ? 'Task completed' : 'Action item resolved',
      event_notes: 'Completed — no time logged',
      actor_name: _myResource?.name || null,
      actor_resource_id: _myResource?.id || null,
      outcome: 'on_track',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }).catch(()=>{});
    if (item.type==='task') await API.patch(`tasks?id=eq.${item.id}`,{status:'complete',pct_complete:100,updated_at:now.toISOString()}).catch(()=>{});
    else await API.patch(`workflow_action_items?id=eq.${item.id}`,{status:'resolved',resolved_at:now.toISOString()}).catch(()=>{});
  } catch(e) {}

  // Update Done Today list inline
  const dtList = document.getElementById('done-today-list');
  if (dtList) {
    dtList.querySelector('[style*="italic"]')?.remove();
    const r=document.createElement('div'); r.style.cssText='display:flex;align-items:center;gap:8px;padding:7px 13px;border-bottom:1px solid var(--border);animation:micro-open 200ms ease';
    r.innerHTML=`<span style="color:var(--compass-green);font-size:13px">✓</span>
      <div style="flex:1;min-width:0"><div style="font-family:var(--font-body);font-size:12px;font-weight:500;color:var(--text0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(item.title)}</div>
      <div style="font-family:var(--font-head);font-size:11px;color:var(--text3)">${esc(proj?.name||'—')} · ${timeStr} · no time logged</div></div>
      <div style="width:8px;height:8px;border-radius:50%;background:var(--muted)"></div>
      <div style="font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--text3)">—</div>`;
    dtList.insertBefore(r, dtList.firstChild);
  }
  const ctr=document.getElementById('done-today-count');
  if (ctr) { ctr.textContent=_doneToday.length; const card=ctr.closest('.stat-done-today'); if(card){card.classList.add('stat-done-pulse');setTimeout(()=>card.classList.remove('stat-done-pulse'),450);} }
  const wiRow=document.querySelector(`.wi-row[data-wi-id="${item.id}"]`);
  if (wiRow) { wiRow.style.transition='opacity 320ms ease'; wiRow.style.opacity='0.3'; setTimeout(()=>wiRow.remove(),340); }
  compassToast(`${esc(item.title.slice(0,40))} — skipped`);
  setTimeout(()=>{_viewLoaded['user']=false;_mwLoadUserView();},360);
}

// ══════════════════════════════════════════════════════════
// COMPLETION MICRO-PANEL
// Captures hours, signal (G/Y/R), and note on any work item

async function submitCompletion() {
  const item     = _cmpItem;
  if (!item) return;

  const hoursRaw = parseFloat(document.getElementById('cmp-hours')?.value || 0);
  const note     = (document.getElementById('cmp-note')?.value || '').trim();
  const billable = document.getElementById('cmp-billable')?.checked ?? true;
  const statusEl = document.getElementById('cmp-status');
  const submitBtn = document.getElementById('cmp-submit');

  // Validate: hours require a note
  if (hoursRaw > 0 && note.length < 10) {
    if (statusEl) statusEl.textContent = 'Add a note to log hours (10+ chars)';
    document.getElementById('cmp-note')?.focus();
    return;
  }

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }
  if (statusEl)  statusEl.textContent = '';

  const today = new Date().toLocaleDateString('en-CA');
  const promises = [];

  // ── 1. Write time_entries row if hours logged ──────────────
  if (hoursRaw > 0) {
    promises.push(
      API.post('time_entries', {
        firm_id:     'aaaaaaaa-0001-0001-0001-000000000001',
        resource_id: _myResource?.id  || null,
        user_id:     _myResource?.user_id || null,
        project_id:  item.projectId   || null,
        task_id:     item.type === 'task'   ? item.id : null,
        source_type: 'direct',
        date:        today,
        hours:       hoursRaw,
        is_billable: billable,
        notes:       note || null,
      }).catch(() => {})
    );
  }

  // ── 2. Patch the work item status ──────────────────────────
  if (item.type === 'task') {
    promises.push(
      API.patch(`tasks?id=eq.${item.id}`, {
        status:       'complete',
        pct_complete: 100,
        updated_at:   new Date().toISOString(),
      }).catch(() => {})
    );
  } else if (item.type === 'action') {
    promises.push(
      API.patch(`workflow_action_items?id=eq.${item.id}`, {
        status:      'resolved',
        resolved_at: new Date().toISOString(),
        resolution_note: note || null,
      }).catch(() => {})
    );
  }

  // ── 3. Write CoC completion event to coc_events ──────────
  const cocEvtId = crypto.randomUUID();
  const cocEvt = {
    id:          cocEvtId,
    firm_id:     'aaaaaaaa-0001-0001-0001-000000000001',
    entity_id:   item.id,
    entity_type: item.type === 'task' ? 'task' : 'action_item',
    event_type:  'completed',
    step_name:   item.type === 'task' ? 'Task completed' : 'Action item resolved',
    event_notes: note || null,
    actor_name:  _myResource?.name || null,
    actor_resource_id: _myResource?.id || null,
    outcome:     _cmpSignal === 'green' ? 'on_track' : _cmpSignal === 'yellow' ? 'at_risk' : _cmpSignal === 'red' ? 'blocked' : 'on_track',
    created_at:  new Date().toISOString(),
    updated_at:  new Date().toISOString(),
  };
  promises.push(API.post('coc_events', cocEvt).catch(()=>{}));
  // Optimistically update local cache
  if (!window._myCocEvents) window._myCocEvents = [];
  window._myCocEvents.unshift(cocEvt);

  try {
    await Promise.all(promises);
    closeCompletionPanel();

    // ── Persist to Done Today ──────────────────────────────
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
    const proj = item.projectId ? _projects?.find(p=>p.id===item.projectId) : null;
    _doneToday.unshift({ id:item.id, title:item.title, project:proj?.name||'—',
      time:timeStr, hours:hoursRaw, signal:_cmpSignal, noTime:hoursRaw===0 });

    // ── Inline Done Today update ───────────────────────────
    const dtList = document.getElementById('done-today-list');
    if (dtList) {
      dtList.querySelector('[style*="italic"]')?.remove();
      const sc=_cmpSignal==='green'?'var(--compass-green)':_cmpSignal==='red'?'var(--compass-red)':'var(--compass-amber)';
      const r=document.createElement('div'); r.style.cssText='display:flex;align-items:center;gap:8px;padding:7px 13px;border-bottom:1px solid var(--border);animation:micro-open 200ms ease';
      r.innerHTML=`<span style="color:var(--compass-green);font-size:13px">✓</span>
        <div style="flex:1;min-width:0"><div style="font-family:var(--font-body);font-size:12px;font-weight:500;color:var(--text0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(item.title)}</div>
        <div style="font-family:var(--font-head);font-size:11px;color:var(--text3)">${esc(proj?.name||'—')} · ${timeStr}${hoursRaw===0?' · no time logged':''}</div></div>
        ${_cmpSignal?`<div style="width:8px;height:8px;border-radius:50%;background:${sc};flex-shrink:0"></div>`:'<div style="width:8px;height:8px"></div>'}
        <div style="font-family:var(--font-display);font-size:13px;font-weight:700;color:${hoursRaw===0?'var(--text3)':'var(--compass-cyan)'}">${hoursRaw===0?'—':hoursRaw.toFixed(1)+'h'}</div>`;
      dtList.insertBefore(r, dtList.firstChild);
    }
    // ── Pulse Done Today counter ───────────────────────────
    const ctr=document.getElementById('done-today-count');
    if (ctr) { ctr.textContent=_doneToday.length; const card=ctr.closest('.stat-done-today'); if(card){card.classList.add('stat-done-pulse');setTimeout(()=>card.classList.remove('stat-done-pulse'),450);} }
    // ── Fade out completed row ─────────────────────────────
    const wiRow=document.querySelector(`.wi-row[data-wi-id="${item.id}"]`);
    if (wiRow) { wiRow.style.transition='opacity 320ms ease'; wiRow.style.opacity='0.3'; setTimeout(()=>wiRow.remove(),340); }

    compassToast(`${esc(item.title.slice(0,40))} — marked complete`);
    setTimeout(()=>{_viewLoaded['user']=false;_mwLoadUserView();},360);
  } catch(e) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Mark complete →'; }
    if (statusEl)  statusEl.textContent = 'Failed — try again';
  }
}

// Close panel on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeCompletionPanel();
});

// ── Bar chart / gauge day filter ─────────────────────────
function filterTimeLog(date) {
  _teFilter = (_teFilter === date) ? null : date;
  _viewLoaded['user'] = false;
  _mwLoadUserView();
}