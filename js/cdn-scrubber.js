// cdn-scrubber.js — Cadence: timeline scrubber, rework cost, urgency/PERT scoring
// LOAD ORDER: 11th

async function instScrubLive() {
  if (_selectedInstance?.id) {
    await _reloadInstance(_selectedInstance.id).catch(() => {});
    _lastCoCCount = (_selectedInstance?._stepInsts || []).length;
  }
  _instScrubPos = 100;
  const s = document.getElementById('inst-scrubber');
  if (s) s.value = 100;
  _instDagFitted = false;
  renderInstanceDAG(_selectedInstance);
  _instRenderScrubNote(null);
  _instRenderReworkCost(_selectedInstance);
}

function instScrubChange(val) {
  _instScrubPos = parseInt(val);
  const inst = _selectedInstance;
  if (!inst) return;
  // Find the CoC event at this position
  const events = _instScrubEvents;
  if (!events.length) return;
  const idx = Math.round((_instScrubPos / 100) * (events.length - 1));
  const evt = events[Math.min(idx, events.length-1)];
  const lbl = document.getElementById('inst-scrub-label');
  if (lbl) {
    if (_instScrubPos >= 100) {
      lbl.textContent = 'Live ◎';
    } else {
      const ts = evt?.created_at ? new Date(evt.created_at) : null;
      lbl.textContent = ts ? ts.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '';
    }
  }
  // Rebuild a "snapshot" CoC up to this event and re-render diagram
  const snapshotCoc = events.slice(0, idx+1);
  const snapInst = { ...inst, _stepInsts: snapshotCoc };
  _instDagFitted = false;
  renderInstanceDAG(snapInst);
  _instRenderScrubNote(evt);
  _instRenderDots(events, idx);
}

function _instInitScrubber(inst) {
  const coc = (inst._stepInsts || []).slice().sort((a,b) => new Date(a.created_at)-new Date(b.created_at));
  _instScrubEvents = coc;
  _instScrubPos = 100;
  const s = document.getElementById('inst-scrubber');
  if (s) { s.value = 100; s.max = 100; }
  _instRenderDots(coc, coc.length-1);
  _instRenderReworkCost(inst);
  _instRenderScrubNote(null);
}

function _instRenderDots(events, activeIdx) {
  const el = document.getElementById('inst-scrub-dots');
  if (!el || !events.length) return;
  const evtColor = {
    instance_launched:'#00b9c3', step_activated:'#e8a838',
    step_completed:'#1D9E75', step_reset:'#E24B4A',
    instance_completed:'#1D9E75', instance_cancelled:'#E24B4A',
    override:'#e8a838', step_reassigned:'#00b9c3',
  };
  const W = el.offsetWidth || 600;
  const H = 24;
  // Build SVG
  const dots = events.map((e, i) => {
    const col = evtColor[e.event_type] || '#666';
    const x = events.length > 1 ? 8 + (i / (events.length-1)) * (W-16) : W/2;
    const isActive = i === activeIdx;
    const isReset = e.event_type === 'step_reset';
    const r = isActive ? 7 : (isReset ? 5 : 4);
    const opacity = isActive ? 1 : 0.65;
    const glow = isActive ? `<circle cx="${x}" cy="${H/2}" r="${r+4}" fill="${col}" opacity="0.2"/>` : '';
    const shape = isReset
      ? `<rect x="${x-r*0.75}" y="${H/2-r*0.75}" width="${r*1.5}" height="${r*1.5}" rx="2" fill="${col}" opacity="${opacity}" transform="rotate(45 ${x} ${H/2})"/>`
      : `<circle cx="${x}" cy="${H/2}" r="${r}" fill="${col}" opacity="${opacity}"/>`;
    return `<g style="cursor:pointer" onclick="_instDotClick(${i})" title="${e.event_type.replace(/_/g,' ')}">${glow}${shape}</g>`;
  }).join('');
  // Track line
  const trackLine = events.length > 1
    ? `<line x1="8" y1="${H/2}" x2="${W-8}" y2="${H/2}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`
    : '';
  el.innerHTML = `<svg width="${W}" height="${H}" style="overflow:visible">${trackLine}${dots}</svg>`;
}

function _instDotClick(idx) {
  const events = _instScrubEvents;
  if (!events.length) return;
  const pct = events.length > 1 ? Math.round((idx / (events.length-1)) * 100) : 100;
  const s = document.getElementById('inst-scrubber');
  if (s) s.value = pct;
  instScrubChange(pct);
}

function _instRenderScrubNote(evt) {
  const el = document.getElementById('inst-scrub-note');
  if (!el) return;
  if (!evt || _instScrubPos >= 100) {
    el.innerHTML = `<div style="color:var(--muted);font-size:11px;padding-top:4px">
      Drag the replay slider ← to travel back through the workflow history.
      Each event dot shows a CoC entry — rejections, activations, notes.
    </div>`;
    return;
  }
  const evtLabel = {
    instance_launched:'Instance Launched', step_activated:'Step Activated',
    step_completed:'Step Completed', step_reset:'Step Reset',
    instance_completed:'Instance Completed', override:'PM Override',
    step_reassigned:'Reassigned',
  };
  const evtColor = {
    step_completed:'var(--green)', step_activated:'#e8a838',
    step_reset:'var(--red)', instance_launched:'var(--cad)',
    instance_completed:'var(--green)', override:'#e8a838',
  };
  const col   = evtColor[evt.event_type] || 'var(--muted)';
  const lbl   = evtLabel[evt.event_type] || evt.event_type;
  const ts    = evt.created_at ? new Date(evt.created_at).toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '';
  const stepName = evt.template_step_id
    ? (_selectedInstance?._tmplSteps||[]).find(s=>s.id===evt.template_step_id)?.name || ''
    : '';
  const isReset = evt.event_type === 'step_reset';
  const step = (_selectedInstance?._tmplSteps||[]).find(s=>s.id===evt.template_step_id);
  const actorName = (evt.actor_name && evt.actor_name !== 'System')
    ? evt.actor_name
    : (step?.assignee_name || step?.assignee_email || null);

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:nowrap;overflow:hidden">
      <div style="width:9px;height:9px;border-radius:50%;background:${col};flex-shrink:0"></div>
      <span style="font-size:13px;font-weight:600;color:${col};white-space:nowrap">${lbl}</span>
      ${stepName?`<span style="font-size:12px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${escHtml(stepName)}</span>`:''}
      ${evt.outcome?`<span style="font-size:11px;color:var(--text2);white-space:nowrap">→ <strong style="color:${col}">${escHtml(evt.outcome)}</strong></span>`:''}
      ${actorName?`<span style="font-size:12px;color:var(--muted);white-space:nowrap">👤 ${escHtml(actorName)}</span>`:''}
      ${ts?`<span style="font-size:11px;color:var(--muted);font-family:var(--font-mono);white-space:nowrap;margin-left:auto">${ts}</span>`:''}
    </div>
    ${(evt.event_notes||evt.notes)?`
      <div style="margin-top:8px;padding:8px 10px;background:${isReset?'rgba(226,75,74,.08)':'var(--surf2)'};
        border-left:3px solid ${col};border-radius:0 4px 4px 0">
        <div style="font-size:10px;font-weight:600;letter-spacing:.08em;color:${col};margin-bottom:3px;text-transform:uppercase">Notes</div>
        <div style="font-size:12px;color:var(--text);line-height:1.5">${escHtml(evt.event_notes||evt.notes)}</div>
      </div>` : (isReset ? `<div style="margin-top:5px;font-size:11px;color:var(--red);font-style:italic">No notes recorded for this rejection</div>` : '')}`;
}

function _instRenderReworkCost(inst) {
  const el = document.getElementById('inst-rework-cost');
  if (!el || !inst) return;
  const coc   = inst._stepInsts || [];
  const steps = inst._tmplSteps || [];

  // Count resets per step
  const resetsByStep = {};
  const resetTimeByStep = {};
  coc.forEach(e => {
    if (e.event_type === 'step_reset' && e.template_step_id) {
      resetsByStep[e.template_step_id] = (resetsByStep[e.template_step_id]||0)+1;
    }
  });

  // Total time in reset loops — from each reset event to the next activation of same step
  let totalReworkMs = 0;
  steps.forEach(s => {
    const resets = coc.filter(e=>e.event_type==='step_reset'&&e.template_step_id===s.id);
    const activations = coc.filter(e=>e.event_type==='step_activated'&&e.template_step_id===s.id);
    resets.forEach((r,i) => {
      // Find the next activation after this reset
      const nextAct = activations.find(a => new Date(a.created_at) > new Date(r.created_at));
      if (nextAct) {
        totalReworkMs += new Date(nextAct.created_at) - new Date(r.created_at);
      }
    });
  });

  const totalResets = Object.values(resetsByStep).reduce((a,b)=>a+b,0);
  if (!totalResets) {
    el.innerHTML = `<div style="color:var(--green);font-size:11px;padding-top:4px">
      <div style="font-weight:600;margin-bottom:4px">✓ No rework</div>
      <div style="color:var(--muted)">This instance has moved forward without any rejections.</div>
    </div>`;
    return;
  }

  const reworkH = Math.floor(totalReworkMs/3600000);
  const reworkM = Math.floor((totalReworkMs%3600000)/60000);
  const reworkStr = reworkH>0?`${reworkH}h ${reworkM}m`:`${reworkM}m`;

  const stepsWithRework = steps.filter(s=>resetsByStep[s.id]);
  el.innerHTML = `
    <div style="font-size:10px;font-weight:700;letter-spacing:.1em;color:var(--red);margin-bottom:8px">REWORK COST</div>
    <div style="display:flex;justify-content:space-between;margin-bottom:6px">
      <span style="font-size:12px;color:var(--muted)">Total loops</span>
      <span style="font-size:13px;font-weight:600;color:var(--red)">${totalResets}×</span>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:10px">
      <span style="font-size:12px;color:var(--muted)">Time in rework</span>
      <span style="font-size:13px;font-weight:600;color:var(--red)">${reworkStr}</span>
    </div>
    ${stepsWithRework.map(s => `
    <div style="padding:6px 8px;background:rgba(226,75,74,.07);border-radius:4px;
      border-left:3px solid var(--red);margin-bottom:5px">
      <div style="font-size:12px;font-weight:600;color:var(--text2)">${escHtml(s.name||'Step')}</div>
      <div style="font-size:11px;color:var(--red)">${resetsByStep[s.id]}× rework</div>
    </div>`).join('')}`;
}

function instScrubClick(e) {
  const el = document.getElementById('inst-scrub-dots');
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const pct = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
  const s = document.getElementById('inst-scrubber');
  if (s) { s.value = pct; instScrubChange(pct); }
}

function _instUrgencyScore(inst) {
  // Higher = more urgent. Priority multiplier × elapsed time × rework penalty
  const priMult = { critical:10, important:3, routine:1 }[inst.priority||'routine'] || 1;
  const elapsedH = inst.launched_at ? (Date.now()-new Date(inst.launched_at))/3600000 : 0;
  const coc = inst._stepInsts || [];
  const resets = coc.filter(e=>e.event_type==='step_reset').length;
  return priMult * (elapsedH + resets * 8);
}

function _instThermalColor(inst) {
  // Returns border color based on priority + elapsed time
  const pri = inst.priority || 'routine';
  if (pri === 'critical') return '#E24B4A';
  if (pri === 'important') return '#e8a838';
  // Routine — thermal based on elapsed days
  const days = inst.launched_at ? (Date.now()-new Date(inst.launched_at))/86400000 : 0;
  if (days > 7)  return '#E24B4A';
  if (days > 3)  return '#e8a838';
  return 'transparent';
}

function _instPertExpected(inst) {
  const o=inst.pert_optimistic, m=inst.pert_likely, p=inst.pert_pessimistic;
  if (!m && !p) return null;
  return ((( o||0) + 4*(m||0) + (p||0)) / 6).toFixed(1);
}

function _instPertVariance(inst) {
  const o=inst.pert_optimistic||0, p=inst.pert_pessimistic||0;
  return p - o;
}