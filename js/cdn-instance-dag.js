// cdn-instance-dag.js — Cadence: live instance DAG, heat map, history, swimlane
// stepState() drives the DAG node coloring from CoC events
// LOAD ORDER: 16th

function toggleInstDagCoC(btn) {
  const panel = document.getElementById('inst-dag-coc-panel');
  if (!panel) return;
  const isOpen = panel.style.width === '300px';
  if (isOpen) {
    panel.style.width = '0';
    panel.style.borderLeftWidth = '0';
    panel.style.display = 'none';
    btn.textContent = 'CoC ▸';
    btn.style.color = 'var(--muted)';
    btn.style.borderColor = 'var(--border)';
  } else {
    panel.style.display = 'flex';
    panel.style.width = '300px';
    panel.style.borderLeftWidth = '1px';
    btn.textContent = 'CoC ▾';
    btn.style.color = 'var(--cad)';
    btn.style.borderColor = 'var(--cad-wire)';
    // Populate CoC body
    const inst = _selectedInstance;
    const body = document.getElementById('inst-dag-coc-body');
    if (!body || !inst) return;
    const coc = (inst._stepInsts || []).slice().reverse();
    const evtColor = {
      instance_launched:'var(--cad)', step_activated:'#e8a838',
      step_completed:'var(--green)', step_reset:'var(--muted)',
      instance_completed:'var(--green)', instance_cancelled:'var(--red)',
      override:'#e8a838', step_reassigned:'var(--accent)',
    };
    const evtLabel = {
      instance_launched:'Launched', step_activated:'Activated',
      step_completed:'Completed', step_reset:'Reset',
      instance_completed:'Completed', instance_cancelled:'Cancelled',
      override:'PM Override', step_reassigned:'Reassigned',
    };
    // Build step name lookup from template steps
    const stepNameById = {};
    (inst._tmplSteps||[]).forEach(s => { stepNameById[s.id] = s.name || STEP_META[s.step_type]?.label || 'Step'; });

    body.innerHTML = coc.length ? coc.map(e => {
      const col = evtColor[e.event_type] || 'var(--muted)';
      const lbl = evtLabel[e.event_type] || e.event_type;
      const ts  = e.created_at ? new Date(e.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '';
      // Resolve step name from lookup rather than relying on stored step_name field
      const stepName = e.template_step_id ? stepNameById[e.template_step_id] : null;
      return `<div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
        <div style="width:7px;height:7px;border-radius:50%;background:${col};flex-shrink:0;margin-top:4px"></div>
        <div style="min-width:0">
          <div style="font-size:10px;font-weight:600;color:${col}">${lbl}</div>
          ${stepName?`<div style="font-size:9px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(stepName)}</div>`:''}
          ${e.outcome?`<div style="font-size:9px;color:var(--text2)">${escHtml(e.outcome)}</div>`:''}
          ${e.actor_name?`<div style="font-size:9px;color:var(--muted)">${escHtml(e.actor_name)}</div>`:''}
          ${e.event_notes?`<div style="font-size:9px;color:var(--text2);margin-top:2px;padding:2px 5px;background:var(--surf2);border-left:2px solid ${col}">${escHtml(e.event_notes)}</div>`:''}
          <div style="font-size:8px;color:var(--muted);font-family:monospace;margin-top:1px">${ts}</div>
        </div>
      </div>`;
    }).join('') : '<div style="color:var(--muted);font-size:11px;padding:20px 0;text-align:center">No events yet</div>';
    // Trigger DAG refit since canvas width changed
    setTimeout(() => { _instDagFitted=false; renderInstanceDAG(inst); }, 250);
  }
}

function _populateReworkBadges() {
  const inst = _selectedInstance;
  if (!inst) return;
  (inst._tmplSteps || []).forEach(s => {
    const badge = document.getElementById('rwbadge-' + s.id);
    if (!badge) return;
    const stepInsts = inst._stepInsts || [];
    const resets = stepInsts.filter(e =>
      e.event_type === 'step_reset' && e.template_step_id === s.id
    ).length;
    const rejections = stepInsts.filter(e => {
      if (e.event_type !== 'step_completed') return false;
      if (e.template_step_id !== s.id) return false;
      if (!e.outcome) return false;
      const oDef = _getOutcomes(s).find(o => o.id === e.outcome);
      return !!(oDef?.requiresReset);
    }).length;
    const count = resets + rejections;
    if (count) {
      badge.innerHTML =
        '<div style="font-family:var(--font-hud);font-size:14px;font-weight:700;' +
        'color:#E24B4A;letter-spacing:.04em;text-align:right">\u21a9 ' + count + '\u00d7</div>' +
        '<div style="font-family:var(--font-mono);font-size:8px;text-transform:uppercase;letter-spacing:.1em;' +
        'margin-top:1px;color:#E24B4A;text-align:right">Rework</div>';
    }
  });
}

function _heatLevel(n) {
  if (n === 0) return 'cold';
  if (n <= 3)  return 'low';
  if (n <= 9)  return 'moderate';
  return 'high';
}

function _buildReworkHeatMap(inst) {
  const allInsts = _instances.filter(i =>
    i.template_id === inst.template_id &&
    (i.status === 'in_progress' || i.status === 'complete')
  );
  const map = {}; // stepId → {total, byInstance:{id→count}, typeA, typeB}

  allInsts.forEach(sib => {
    (sib._stepInsts || []).forEach(e => {
      const sid = e.template_step_id;
      if (!sid) return;
      if (!map[sid]) map[sid] = { total:0, byInstance:{}, typeA:0, typeB:0, stepName:null };

      if (e.event_type === 'step_reset') {
        map[sid].total++;
        map[sid].byInstance[sib.id] = (map[sid].byInstance[sib.id]||0) + 1;
        map[sid].stepName = map[sid].stepName || e.step_name || null;
        const note = (e.event_notes||'').toLowerCase();
        if (note.includes('reset by')) map[sid].typeB++;
        else map[sid].typeA++;
      }

      if (e.event_type === 'step_completed' && e.outcome) {
        const stepDef = (inst._tmplSteps||[]).find(s=>s.id===sid);
        const oDef    = stepDef ? _getOutcomes(stepDef).find(o=>o.id===e.outcome) : null;
        if (oDef?.requiresReset) {
          map[sid].total++;
          map[sid].byInstance[sib.id] = (map[sid].byInstance[sib.id]||0) + 1;
          map[sid].stepName = map[sid].stepName || e.step_name || null;
          map[sid].typeA++;
        }
      }
    });
  });
  return map;
}

function _toggleHistory() {
  const inst = _selectedInstance;
  if (!inst) return;
  const dagWrap   = document.getElementById('inst-dag-wrap');
  const inDiagram = inst._viewMode === 'diagram' ||
    (dagWrap && getComputedStyle(dagWrap).display !== 'none');
  if (!inDiagram) { cadToast('Switch to Diagram mode first', 'info'); return; }
  inst._viewMode  = 'diagram';
  _historyActive  = !_historyActive;
  // Swimlane and History are mutually exclusive
  if (_historyActive && _swimlaneActive) {
    _swimlaneActive = false;
    const swBtn = document.getElementById('sw-toggle-btn');
    if (swBtn) { swBtn.style.background='transparent'; swBtn.style.color='var(--muted)'; }
    const swPanel = document.getElementById('sw-info-panel');
    if (swPanel) swPanel.style.display = 'none';
    _swHidePopup(true);
  }
  const btn = document.getElementById('hx-toggle-btn');
  if (btn) {
    btn.style.background = _historyActive ? '#ff5f6b'      : 'transparent';
    btn.style.color      = _historyActive ? '#fff'         : 'var(--muted)';
    btn.style.borderColor= _historyActive ? '#ff5f6b'      : 'var(--border)';
  }
  if (!_historyActive) _hxHidePopup(true);
  if (_historyActive) _swLoadSiblingData(inst); // reuse sibling loader
  const panel = document.getElementById('hx-info-panel');
  if (panel) {
    panel.style.display = _historyActive ? 'flex' : 'none';
    if (_historyActive) _hxPopulatePanel(inst);
  }
  renderInstanceDAG(inst);
}

function _toggleSwimlane() {
  const inst = _selectedInstance;
  if (!inst) return;
  // Check actual diagram visibility — _viewMode may not be set on fresh load
  const dagWrap = document.getElementById('inst-dag-wrap');
  const inDiagram = inst._viewMode === 'diagram' ||
    (dagWrap && dagWrap.style.display !== 'none' && getComputedStyle(dagWrap).display !== 'none');
  if (!inDiagram) {
    cadToast('Switch to Diagram mode first', 'info');
    return;
  }
  // Ensure _viewMode is set so subsequent checks work
  inst._viewMode = 'diagram';
  _swimlaneActive = !_swimlaneActive;
  // Swimlane and History are mutually exclusive
  if (_swimlaneActive && _historyActive) {
    _historyActive = false;
    const hxBtn = document.getElementById('hx-toggle-btn');
    if (hxBtn) { hxBtn.style.background='transparent'; hxBtn.style.color='var(--muted)'; hxBtn.style.borderColor='var(--border)'; }
    const hxPanel = document.getElementById('hx-info-panel');
    if (hxPanel) hxPanel.style.display = 'none';
    _hxHidePopup(true);
  }
  // Update toggle button appearance
  const btn = document.getElementById('sw-toggle-btn');
  if (btn) {
    btn.style.background = _swimlaneActive ? 'var(--cad)' : 'transparent';
    btn.style.color      = _swimlaneActive ? 'var(--bg0)' : 'var(--muted)';
  }
  // Hide popup if turning off
  if (!_swimlaneActive) _swHidePopup(true);
  // Show/hide swimlane info overlay over the replay zone
  const swPanel = document.getElementById('sw-info-panel');
  if (swPanel) {
    swPanel.style.display = _swimlaneActive ? 'flex' : 'none';
    if (_swimlaneActive) _swPopulateInfoPanel(inst);
  }
  renderInstanceDAG(inst);
  _swUpdateBottleneckBanner(inst);
}

function _instanceHealth(inst) {
  if (!inst) return 'gray';
  if (inst.status === 'suspended') return 'gray';
  const coc  = inst._stepInsts || [];
  const last = coc[coc.length - 1];
  if (!last) return 'amber';
  if (last.event_type === 'step_completed') {
    const stepDef = (inst._tmplSteps || []).find(s => s.id === last.template_step_id);
    const oDef    = stepDef ? _getOutcomes(stepDef).find(o => o.id === last.outcome) : null;
    return oDef?.requiresReset ? 'red' : 'green';
  }
  if (last.event_type === 'step_activated') return 'amber';
  return 'gray';
}

function instDagZoom(f) { _instDagScale=Math.max(0.2,Math.min(3,_instDagScale*f)); renderInstanceDAG(_selectedInstance); }
function instDagReset() {
  _instDagPanX=0; _instDagPanY=0; _instDagScale=1; _instDagFitted=false;
  renderInstanceDAG(_selectedInstance);
}

function instDagReset() {
  _instDagPanX=0; _instDagPanY=0; _instDagScale=1; _instDagFitted=false;
  renderInstanceDAG(_selectedInstance);
}

function renderInstanceDAG(inst) {
  if (!inst) return;
  const wrap   = document.getElementById('inst-dag-canvas-wrap');
  const canvas = document.getElementById('inst-dag-canvas');
  if (!wrap || !canvas) return;

  const steps = (inst._tmplSteps || [])
    .filter(s => s.step_type !== 'trigger')
    .sort((a,b) => a.sequence_order - b.sequence_order);
  const coc = inst._stepInsts || [];

  const W = wrap.offsetWidth  || 800;
  const H = wrap.offsetHeight || 400;

  if (W < 10 || H < 10) { setTimeout(() => renderInstanceDAG(inst), 100); return; }

  canvas.width = W; canvas.height = H;
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,W,H);

  if (!steps.length) {
    ctx.fillStyle='rgba(255,255,255,.2)'; ctx.font='13px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('No steps in this template',W/2,H/2); return;
  }

  // ── Derive state from CoC ─────────────────────────────────────────────────
  const latestEvt = {};
  coc.forEach(e => { if (e.template_step_id) latestEvt[e.template_step_id] = e; });

  const completedIds = new Set(
    Object.entries(latestEvt).filter(([,e])=>e.event_type==='step_completed').map(([id])=>id)
  );
  const resetIds = new Set(
    Object.entries(latestEvt).filter(([,e])=>e.event_type==='step_reset').map(([id])=>id)
  );
  const activeIds = new Set(
    Object.entries(latestEvt).filter(([,e])=>e.event_type==='step_activated').map(([id])=>id)
  );

  // Rejection loops count per step — resets + direct requiresReset completions
  const loopCount = {};
  coc.forEach(e => {
    if (e.event_type === 'step_reset' && e.template_step_id) {
      loopCount[e.template_step_id] = (loopCount[e.template_step_id]||0) + 1;
    }
    if (e.event_type === 'step_completed' && e.template_step_id && e.outcome) {
      const stepDef = steps.find(s => s.id === e.template_step_id);
      const oDef = stepDef ? _getOutcomes(stepDef).find(o => o.id === e.outcome) : null;
      if (oDef?.requiresReset) {
        loopCount[e.template_step_id] = (loopCount[e.template_step_id]||0) + 1;
      }
    }
  });

  // Activation timestamps for elapsed time
  const activatedAt = {};
  coc.filter(e=>e.event_type==='step_activated'&&e.template_step_id)
     .forEach(e=>{ if(!activatedAt[e.template_step_id]) activatedAt[e.template_step_id]=e.created_at; });
  const completedAt = {};
  coc.filter(e=>e.event_type==='step_completed'&&e.template_step_id)
     .forEach(e=>{ completedAt[e.template_step_id]=e.created_at; });

  // Latest outcome per step
  const stepOutcome = {};
  coc.filter(e=>e.event_type==='step_completed'&&e.template_step_id&&e.outcome)
     .forEach(e=>{ stepOutcome[e.template_step_id]=e.outcome; });

  // Which edges were actually traversed
  const traversedEdges = new Set();
  coc.filter(e=>e.event_type==='step_activated'&&e.template_step_id)
     .forEach(e=>{
       const idx=steps.findIndex(s=>s.id===e.template_step_id);
       if(idx>0) traversedEdges.add(`${steps[idx-1].id}->${e.template_step_id}`);
     });

  // Derive step state
  function stepState(s) {
    const e = latestEvt[s.id];
    if (!e) return 'pending';
    if (e.event_type==='step_completed') {
      const oDef = _getOutcomes(s).find(o=>o.id===stepOutcome[s.id]);
      return oDef?.requiresReset ? 'rejected' : 'complete';
    }
    if (e.event_type==='step_activated') return 'active';
    if (e.event_type==='step_reset')     return 'reset';
    return 'pending';
  }

  const STATE_COLORS = {
    complete: '#1D9E75',
    active:   '#e8a838',
    rejected: '#E24B4A',
    reset:    '#BA7517',
    pending:  'rgba(255,255,255,.2)',
  };
  const STATE_BG = {
    complete: 'rgba(29,158,117,.12)',
    active:   'rgba(232,168,56,.1)',
    rejected: 'rgba(226,75,74,.12)',
    reset:    'rgba(186,117,23,.08)',
    pending:  'rgba(255,255,255,.03)',
  };

  // ── Layout — mirrors template DAG exactly ────────────────────────────────
  const NW=152, NH=68, HGAP=72, PAD_L=56, PAD_R=56;
  const OWNER_H=22, NODE_Y=50+OWNER_H;
  const contentW = PAD_L + steps.length*NW + (steps.length-1)*HGAP + PAD_R;
  const contentH = NODE_Y + NH + 30;

  if (!_instDagFitted) {
    _instDagFitted = true;
    const MARGIN = 48;
    _instDagScale = Math.max(0.15, Math.min(1.5, (W - MARGIN*2) / contentW));
    _instDagPanX  = MARGIN;
    const scaledH = contentH * _instDagScale;
    _instDagPanY  = scaledH < H ? (H - scaledH) / 2 : MARGIN;
  }

  function nodePos(id) {
    const i=steps.findIndex(s=>s.id===id);
    return {x:PAD_L+i*(NW+HGAP), y:NODE_Y};
  }

  function ah(x,y,dir,col,a=0.8) {
    const sz=7; ctx.beginPath(); ctx.fillStyle=col; ctx.globalAlpha=a;
    if(dir==='right'){ctx.moveTo(x,y);ctx.lineTo(x-sz,y-sz*.5);ctx.lineTo(x-sz,y+sz*.5);}
    if(dir==='left') {ctx.moveTo(x,y);ctx.lineTo(x+sz,y-sz*.5);ctx.lineTo(x+sz,y+sz*.5);}
    if(dir==='down')  {ctx.moveTo(x,y);ctx.lineTo(x-sz*.5,y-sz);ctx.lineTo(x+sz*.5,y-sz);}
    ctx.closePath(); ctx.fill(); ctx.globalAlpha=1;
  }

  ctx.save();
  ctx.translate(_instDagPanX, _instDagPanY);
  ctx.scale(_instDagScale, _instDagScale);

  // ── Trigger ───────────────────────────────────────────────────────────────
  const fp0=nodePos(steps[0].id);
  const tx=fp0.x-36, ty=fp0.y+NH/2;
  ctx.beginPath(); ctx.arc(tx,ty,12,0,Math.PI*2);
  ctx.fillStyle='rgba(192,64,74,.15)'; ctx.strokeStyle='rgba(192,64,74,.6)'; ctx.lineWidth=1.5;
  ctx.fill(); ctx.stroke();
  ctx.fillStyle='#c0404a'; ctx.font='11px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('⚡',tx,ty);
  ctx.beginPath(); ctx.strokeStyle='rgba(255,255,255,.2)'; ctx.lineWidth=1.2;
  ctx.moveTo(tx+12,ty); ctx.lineTo(fp0.x,ty); ctx.stroke();
  ah(fp0.x,ty,'right','rgba(255,255,255,.3)');

  // ── Rejection arcs — FROM the rejecting step BACK TO where flow returned ──
  // A rejection arc exists when: step X was completed with a reset outcome,
  // and then a step Y (Y < X) was re-activated afterward.
  // We draw one arc per unique (srcStep → tgtStep) pair, labeled with count.
  const arcMap = {}; // key: "srcIdx->tgtIdx" → { srcIdx, tgtIdx, count }

  // Find all step_completed events with reset outcomes
  coc.forEach(resetEvt => {
    if (resetEvt.event_type !== 'step_completed') return;
    const srcStep = steps.find(s => s.id === resetEvt.template_step_id);
    if (!srcStep) return;
    const oDef = _getOutcomes(srcStep).find(o => o.id === resetEvt.outcome);
    if (!oDef?.requiresReset) return;
    const srcIdx = steps.indexOf(srcStep);

    // Find the step that was re-activated immediately after this rejection
    const afterTime = new Date(resetEvt.created_at);
    const nextAct = coc.find(e =>
      e.event_type === 'step_activated' &&
      e.template_step_id !== resetEvt.template_step_id &&
      new Date(e.created_at) > afterTime
    );
    if (!nextAct) return;
    const tgtIdx = steps.findIndex(s => s.id === nextAct.template_step_id);
    if (tgtIdx < 0 || tgtIdx >= srcIdx) return; // only backward arcs

    const key = `${srcIdx}->${tgtIdx}`;
    if (!arcMap[key]) arcMap[key] = { srcIdx, tgtIdx, count: 0 };
    arcMap[key].count++;
  });

  // Draw arcs
  Object.values(arcMap).forEach((arc, i) => {
    const { srcIdx, tgtIdx, count } = arc;
    const fp = nodePos(steps[srcIdx].id);
    const tp = nodePos(steps[tgtIdx].id);
    const arcDepth = 50 + i * 12; // stagger multiple arcs
    const x1 = fp.x + NW/2, y1 = fp.y + NH;
    const x2 = tp.x + NW/2, y2 = tp.y + NH;
    const cy = y1 + arcDepth;
    const cx = (x1 + x2) / 2;

    ctx.beginPath();
    ctx.strokeStyle = '#E24B4A';
    ctx.lineWidth = Math.min(2.5, 1 + count * 0.5);
    ctx.setLineDash([6, 3]); ctx.globalAlpha = 0.75;
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1, cy, x2, cy, x2, y2);
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    // Upward arrowhead at target (arc terminates back at the node bottom)
    ah(x2, y2, 'down', '#E24B4A', 0.85);

    // Count badge at arc midpoint
    const bw = 48, bh = 14;
    ctx.fillStyle = 'rgba(226,75,74,.18)'; ctx.strokeStyle = '#E24B4A'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.roundRect(cx - bw/2, cy - bh/2, bw, bh, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#E24B4A'; ctx.font = '600 9px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`↩ ${count}× reset`, cx, cy);
  });
  function instPill(text, cx, cy, col) {
    ctx.font = '9px monospace';
    let t = text;
    const maxW = HGAP - 8;
    while (t.length > 3 && ctx.measureText(t).width > maxW) t = t.slice(0,-1);
    if (t !== text) t += '…';
    const tw = ctx.measureText(t).width, pw = tw+8, ph = 13;
    ctx.fillStyle = 'rgba(10,12,18,.92)'; ctx.globalAlpha = .95;
    ctx.beginPath(); ctx.roundRect(cx-pw/2, cy-ph/2, pw, ph, 3); ctx.fill();
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = 1; ctx.fillText(t, cx, cy);
  }

  steps.forEach((s,i) => {
    const next=steps[i+1]; if(!next) return;
    const fp=nodePos(s.id), tp=nodePos(next.id);
    const x1=fp.x+NW, x2=tp.x, my=fp.y+NH/2;
    const traversed=traversedEdges.has(`${s.id}->${next.id}`);
    const state=stepState(s);
    const edgeCol=traversed
      ? (state==='rejected'?'#E24B4A':state==='complete'?'#1D9E75':'#e8a838')
      : 'rgba(255,255,255,.12)';
    ctx.beginPath(); ctx.strokeStyle=edgeCol; ctx.lineWidth=traversed?2:1;
    ctx.setLineDash(traversed?[]:[4,4]);
    ctx.globalAlpha=traversed?.85:.4;
    ctx.moveTo(x1,my); ctx.lineTo(x2-8,my); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha=1;
    if(traversed) ah(x2,my,'right',edgeCol,0.85);
    // Outcome pill on the edge line for traversed edges with an outcome
    if(traversed && stepOutcome[s.id]) {
      const oDef=_getOutcomes(s).find(o=>o.id===stepOutcome[s.id]);
      const oLabel=oDef?.label||stepOutcome[s.id];
      const oCol=oDef?.color||edgeCol;
      instPill(oLabel, (x1+x2)/2, my-11, oCol);
    }
  });

  // ── Terminal ──────────────────────────────────────────────────────────────
  const lp=nodePos(steps[steps.length-1].id);
  const termX=lp.x+NW+HGAP/2, termY=lp.y+NH/2;
  const instDone=inst.status==='complete';
  ctx.beginPath(); ctx.strokeStyle=instDone?'rgba(42,157,64,.7)':'rgba(255,255,255,.15)'; ctx.lineWidth=1.5;
  ctx.moveTo(lp.x+NW,termY); ctx.lineTo(termX-14,termY); ctx.stroke();
  if(instDone) ah(termX-2,termY,'right','rgba(42,157,64,.8)');
  ctx.beginPath(); ctx.arc(termX,termY,12,0,Math.PI*2);
  ctx.fillStyle=instDone?'rgba(42,157,64,.2)':'rgba(255,255,255,.04)';
  ctx.strokeStyle=instDone?'rgba(42,157,64,.6)':'rgba(255,255,255,.15)'; ctx.lineWidth=1.5;
  ctx.fill(); ctx.stroke();
  ctx.fillStyle=instDone?'#7af0a0':'rgba(255,255,255,.2)'; ctx.font='12px sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(instDone?'✓':'◎',termX,termY);

  // ── Nodes ─────────────────────────────────────────────────────────────────
  const now=Date.now();
  steps.forEach(s => {
    const meta=STEP_META[s.step_type]||STEP_META.action;
    const p=nodePos(s.id);
    const state=stepState(s);
    const stateCol=STATE_COLORS[state]||STATE_COLORS.pending;
    const stateBg=STATE_BG[state]||STATE_BG.pending;

    // Pulse ring for active step
    if(state==='active') {
      const pulse=(Math.sin(now/600)+1)/2;
      ctx.beginPath(); ctx.arc(p.x+NW/2,p.y+NH/2,Math.max(NW,NH)/2+6+pulse*8,0,Math.PI*2);
      ctx.strokeStyle='#e8a838'; ctx.lineWidth=1.5; ctx.globalAlpha=0.2+pulse*0.3;
      ctx.stroke(); ctx.globalAlpha=1;
    }

    // History card click highlight — bright purple ring that fades
    if (_hxHighlightStep === s.id) {
      const pulse = (Math.sin(now/400)+1)/2;
      ctx.beginPath(); ctx.arc(p.x+NW/2, p.y+NH/2, Math.max(NW,NH)/2+8+pulse*6, 0, Math.PI*2);
      ctx.strokeStyle='#b432dc'; ctx.lineWidth=2.5; ctx.globalAlpha=0.4+pulse*0.5;
      ctx.stroke(); ctx.globalAlpha=1;
      // Solid outline
      ctx.beginPath(); ctx.roundRect(p.x-3, p.y-3, NW+6, NH+6, 9);
      ctx.strokeStyle='#b432dc'; ctx.lineWidth=2; ctx.globalAlpha=0.6;
      ctx.stroke(); ctx.globalAlpha=1;
    }

    // Node shadow
    ctx.fillStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.roundRect(p.x+2,p.y+2,NW,NH,7); ctx.fill();

    // Node body
    ctx.fillStyle=stateBg; ctx.strokeStyle=stateCol; ctx.lineWidth=state==='active'?2:1.5;
    ctx.beginPath(); ctx.roundRect(p.x,p.y,NW,NH,7); ctx.fill(); ctx.stroke();

    // Left accent bar
    ctx.fillStyle=stateCol; ctx.globalAlpha=0.8;
    ctx.beginPath(); ctx.roundRect(p.x,p.y,4,NH,[7,0,0,7]); ctx.fill(); ctx.globalAlpha=1;

    // Owner above node — check all assignee sources
    const ownerName = s.assignee_name
      || _users_cad?.find(u=>u.id===s.assignee_user_id)?.name
      || _resources_cad?.find(r=>r.id===s.assignee_resource_id)?.name
      || (s.assignee_type==='pm' ? 'Project Manager' : null)
      || null;
    if(ownerName) {
      const initials=ownerName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      const ax=p.x+4+9, ay=p.y-OWNER_H/2;
      ctx.beginPath(); ctx.arc(ax,ay,9,0,Math.PI*2);
      ctx.fillStyle=stateCol+'40'; ctx.strokeStyle=stateCol+'88'; ctx.lineWidth=1; ctx.fill(); ctx.stroke();
      ctx.fillStyle=stateCol; ctx.font='600 9px system-ui,sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.globalAlpha=0.95;
      ctx.fillText(initials,ax,ay); ctx.globalAlpha=1;
      let nm=ownerName; ctx.font='500 10px system-ui,sans-serif';
      const nmX=ax+9+6, maxW=NW-(nmX-p.x)-6;
      while(nm.length>2&&ctx.measureText(nm).width>maxW) nm=nm.slice(0,-1);
      if(nm!==ownerName) nm+='…';
      ctx.fillStyle='rgba(255,255,255,.7)'; ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillText(nm,nmX,ay);
    }

    // Step name — upper portion of node
    ctx.fillStyle='rgba(255,255,255,.92)'; ctx.textAlign='left'; ctx.textBaseline='top';
    ctx.font='500 11px system-ui,sans-serif';
    let name=s.name||'';
    if(ctx.measureText(name).width>NW-22){
      while(name.length>3&&ctx.measureText(name+'…').width>NW-22) name=name.slice(0,-1);
      name+='…';
    }
    ctx.fillText(name, p.x+12, p.y+10);

    // Elapsed timer — prominently in the middle of the node body
    let elapsedStr=null, elapsedCol='rgba(255,255,255,.4)';
    if(state==='active' && activatedAt[s.id]) {
      const ms=now-new Date(activatedAt[s.id]);
      const h=Math.floor(ms/3600000), m=Math.floor((ms%3600000)/60000);
      elapsedStr='⏱ '+(h>0?`${h}h ${m}m`:`${m}m`);
      elapsedCol='#e8a838';
    } else if(activatedAt[s.id] && completedAt[s.id]) {
      const ms=new Date(completedAt[s.id])-new Date(activatedAt[s.id]);
      const h=Math.floor(ms/3600000), m=Math.floor((ms%3600000)/60000);
      elapsedStr='⏱ '+(h>0?`${h}h ${m}m`:`${m}m`);
      elapsedCol='rgba(255,255,255,.4)';
    }
    if(elapsedStr) {
      ctx.font='600 11px system-ui,sans-serif';
      ctx.fillStyle=elapsedCol; ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillText(elapsedStr, p.x+12, p.y+NH/2+6);
    }

    // State label bottom-left
    const stateLabel={complete:'✓ Complete',active:'● Active',rejected:'✕ Rejected',reset:'↩ Reset',pending:'Pending'};
    ctx.fillStyle=stateCol; ctx.globalAlpha=0.8; ctx.font='8px monospace';
    ctx.textBaseline='bottom'; ctx.textAlign='left';
    ctx.fillText(stateLabel[state]||state, p.x+12, p.y+NH-7); ctx.globalAlpha=1;

    // Seq num bottom-right
    ctx.fillStyle='rgba(255,255,255,.2)'; ctx.font='9px monospace';
    ctx.textAlign='right'; ctx.textBaseline='bottom';
    ctx.fillText(s.sequence_order, p.x+NW-8, p.y+NH-8);

    // Confidence dot — bottom-left corner, from latest step comment signal
    const latestConf = (() => {
      const comments = (inst._stepComments || [])
        .filter(c => c.template_step_id === s.id && c.confidence && !c.is_deleted)
        .sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
      return comments[0]?.confidence || null;
    })();
    if (latestConf) {
      const confColors = { green:'#1D9E75', yellow:'#e8a838', red:'#E24B4A' };
      const cx = p.x + 10, cy = p.y + NH - 10;
      ctx.fillStyle = confColors[latestConf]; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI*2); ctx.stroke();

      // Store hit region for hover tooltip
      const latestComment = (inst._stepComments || [])
        .filter(c => c.template_step_id === s.id && c.confidence && !c.is_deleted)
        .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0];
      _confDots.push({
        stepId: s.id,
        stepName: s.name || s.step_type,
        conf: latestConf,
        author: latestComment?.author_name || 'Unknown',
        body: latestComment?.body || '',
        ts: latestComment?.created_at || null,
        x: cx, y: cy, r: 8, // slightly larger hit radius
      });
    }

    // Rework badge — inside node, bottom-right corner above seq number
    if (loopCount[s.id]) {
      const rCount = loopCount[s.id];
      const bw=64, bh=13;
      const bx = p.x + NW - bw - 6;
      const by = p.y + NH - bh - 6;
      ctx.fillStyle='#E24B4A'; ctx.globalAlpha=0.88;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill(); ctx.globalAlpha=1;
      ctx.fillStyle='#fff'; ctx.font='700 8px system-ui,sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(`\u21a9 ${rCount}\u00d7 rework`, bx+bw/2, by+bh/2);
    }
  });

  // ── Swimlane dot cluster overlay ─────────────────────────────────────────
  _swimlaneClusters = [];
  _confDots = [];
  if (_swimlaneActive) {

    // ── Dot color palette — distinct from amber node borders ─────────────
    // in_progress siblings: cyan-blue  / selected instance: white outline
    // completed instances:  bright teal
    const SW_COLORS = {
      active:    '#00d2ff',   // cyan — in-progress siblings
      red:       '#ff5f6b',   // bright red — blocked/rejected siblings
      completed: '#26e8a0',   // bright teal — fully completed instances
      selected:  '#ffffff',   // white outline — the currently viewed instance
      gray:      '#6a8aaa',   // muted blue-gray — stalled
    };

    // Build step → instance map
    // Layer 1: in-progress siblings (excluding selected instance)
    const byStep = {};

    _instances.filter(i =>
      i.template_id === inst.template_id &&
      i.id          !== inst.id &&
      i.status      === 'in_progress' &&
      i.current_step_id
    ).forEach(sib => {
      const sid = sib.current_step_id;
      if (!byStep[sid]) byStep[sid] = [];
      byStep[sid].push({ inst: sib, type: 'sibling' });
    });

    // Layer 2: selected instance — add it to its own current step cluster
    const selActiveEvt = (inst._stepInsts || []).slice().reverse()
      .find(e => e.event_type === 'step_activated');
    if (selActiveEvt?.template_step_id) {
      const sid = selActiveEvt.template_step_id;
      if (!byStep[sid]) byStep[sid] = [];
      byStep[sid].unshift({ inst, type: 'selected' }); // first position
    }

    // Layer 3: completed instances — dot on their final completed step
    _instances.filter(i =>
      i.template_id === inst.template_id &&
      i.id          !== inst.id &&
      i.status      === 'complete'
    ).forEach(sib => {
      // Find last step_completed event
      const lastDone = (sib._stepInsts || []).slice().reverse()
        .find(e => e.event_type === 'step_completed');
      if (!lastDone?.template_step_id) return;
      const sid = lastDone.template_step_id;
      if (!byStep[sid]) byStep[sid] = [];
      byStep[sid].push({ inst: sib, type: 'completed' });
    });

    Object.entries(byStep).forEach(([stepId, entries]) => {
      const p = nodePos(stepId);
      if (!p || p.x < 0) return;

      const DOT_R   = 4.5;
      const DOT_GAP = 11;
      const MAX_DOTS = 5;
      const shown    = entries.slice(0, MAX_DOTS);
      const clusterW = shown.length * DOT_GAP + 8;
      const clusterH = 18;

      // Position: top-right corner of node, overlapping the border
      const bx = p.x + NW - clusterW/2;
      const by = p.y - clusterH/2;

      // Badge background — distinct dark panel with cyan border
      ctx.save();
      ctx.fillStyle   = 'rgba(6,14,28,0.96)';
      ctx.strokeStyle = '#00d2ff';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, clusterW, clusterH, 5);
      ctx.fill(); ctx.stroke();
      ctx.restore();

      // Dots
      shown.forEach((entry, i) => {
        const dx = bx + 4 + i * DOT_GAP + DOT_R;
        const dy = by + clusterH / 2;
        if (entry.type === 'selected') {
          // White outline ring — "you are here"
          ctx.beginPath();
          ctx.arc(dx, dy, DOT_R, 0, Math.PI * 2);
          ctx.strokeStyle = SW_COLORS.selected;
          ctx.lineWidth   = 1.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(dx, dy, DOT_R - 2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.fill();
        } else if (entry.type === 'completed') {
          ctx.beginPath();
          ctx.arc(dx, dy, DOT_R, 0, Math.PI * 2);
          ctx.fillStyle = SW_COLORS.completed;
          ctx.fill();
        } else {
          // in-progress sibling — color by health
          const health = _instanceHealth(entry.inst);
          const col = health === 'red'   ? SW_COLORS.red
                    : health === 'green' ? SW_COLORS.completed
                    : health === 'gray'  ? SW_COLORS.gray
                    : SW_COLORS.active;
          ctx.beginPath();
          ctx.arc(dx, dy, DOT_R, 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();
        }
      });

      // Overflow count
      if (entries.length > MAX_DOTS) {
        ctx.fillStyle = '#00d2ff';
        ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('+' + (entries.length - MAX_DOTS), bx + clusterW - 10, by + clusterH / 2);
      }

      // Store hit region — siblings array for popup (all types)
      _swimlaneClusters.push({
        stepId,
        siblings: entries.map(e => e.inst),
        x: bx, y: by,
        w: clusterW, h: clusterH,
      });
    });
  }

  // ── Rework History heat layer ─────────────────────────────────────────────
  _historyClusters = [];
  if (_historyActive) {
    const heatMap = _buildReworkHeatMap(inst);
    const maxHeat = Math.max(...Object.values(heatMap).map(h => h.total), 1);

    steps.forEach(s => {
      const heat = heatMap[s.id];
      if (!heat || heat.total === 0) return;
      const level = _heatLevel(heat.total);
      const cols  = HEAT_COLORS[level];
      const p     = nodePos(s.id);

      // Node border color override for high heat
      if (level === 'high') {
        ctx.save();
        ctx.strokeStyle = '#b432dc';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.roundRect(p.x, p.y, NW, NH, 7);
        ctx.stroke();
        ctx.restore();
      } else if (level === 'moderate') {
        ctx.save();
        ctx.strokeStyle = '#8c50c8';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.roundRect(p.x, p.y, NW, NH, 7);
        ctx.stroke();
        ctx.restore();
      }

      // Heat badge — outside lower-left corner, shifted left of arc paths
      const label  = `\u21a9 ${heat.total}\u00d7${heat.total === maxHeat && heat.total >= 10 ? ' \u25b2' : ''}`;
      const bw     = heat.total >= 10 ? 52 : 44, bh = 14;
      const bx     = p.x;            // flush with node left edge
      const by     = p.y + NH + 6;   // 6px below node bottom, left of arc center

      ctx.save();
      ctx.fillStyle   = cols.fill;
      ctx.strokeStyle = cols.stroke;
      ctx.lineWidth   = level === 'high' ? 1.5 : 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 4);
      ctx.fill(); ctx.stroke();

      ctx.fillStyle    = cols.text;
      ctx.font         = `bold 8px sans-serif`;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + 5, by + bh/2);
      ctx.restore();

      // Store hit region with generous padding
      _historyClusters.push({ stepId: s.id, heat, x: bx, y: by, w: bw, h: bh });
    });
  }

  ctx.restore();

  // Update zoom label if present
  const zlbl=document.getElementById('dag-zoom-label');
  if(zlbl) zlbl.textContent=Math.round(_instDagScale*100)+'%';

  // Animate pulse for active step — only schedule next frame if still fitted
  // (prevents stale pulse frames from running before a refit)
  if(_instDagPulseFrame) cancelAnimationFrame(_instDagPulseFrame);
  _instDagPulseFrame = null;
  if(_instDagFitted && (steps.some(s=>stepState(s)==='active') || _hxHighlightStep) && inst._viewMode==='diagram') {
    _instDagPulseFrame=requestAnimationFrame(()=>renderInstanceDAG(inst));
  }

  // Wire events (once)
  if(!wrap._instDagEventsInit) {
    wrap._instDagEventsInit=true;
    wrap.addEventListener('mousedown',e=>{
      _instDagDrag=true; _instDagDSX=e.clientX; _instDagDSY=e.clientY;
      _instDagPSX=_instDagPanX; _instDagPSY=_instDagPanY;
      wrap.style.cursor='grabbing'; e.preventDefault();
    });
    window.addEventListener('mousemove',e=>{
      if(!_instDagDrag) return;
      _instDagPanX=_instDagPSX+(e.clientX-_instDagDSX);
      _instDagPanY=_instDagPSY+(e.clientY-_instDagDSY);
      renderInstanceDAG(inst);
    });
    window.addEventListener('mouseup',()=>{ _instDagDrag=false; wrap.style.cursor='grab'; });
    wrap.addEventListener('wheel',e=>{
      if (_tooltipSticky) return; // don't pan when tooltip is open and being scrolled
      e.preventDefault();
      if(e.ctrlKey||e.metaKey){
        const r=wrap.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
        const f=e.deltaY<0?1.12:0.89,ns=Math.max(0.2,Math.min(3,_instDagScale*f));
        _instDagPanX=mx-(mx-_instDagPanX)*(ns/_instDagScale);
        _instDagPanY=my-(my-_instDagPanY)*(ns/_instDagScale);
        _instDagScale=ns;
      } else { _instDagPanX-=e.deltaX; _instDagPanY-=e.deltaY; }
      renderInstanceDAG(inst);
    },{passive:false});
    // Mousemove — cursor change on node hover only (history via button, not hover)
    wrap.addEventListener('mousemove', e => {
      if (_instDagDrag) return;
      if (_tooltipSticky) return;
      const r   = wrap.getBoundingClientRect();
      const mx  = (e.clientX - r.left  - _instDagPanX) / _instDagScale;
      const my  = (e.clientY - r.top   - _instDagPanY) / _instDagScale;

      // Confidence signal dot hover
      if (_confDots.length) {
        const confHit = _confDots.find(d => {
          const dx = mx - d.x, dy = my - d.y;
          return Math.sqrt(dx*dx + dy*dy) <= d.r;
        });
        if (confHit) {
          wrap.style.cursor = 'default';
          _showConfDotTooltip(confHit, e.clientX, e.clientY);
          return;
        }
      }

      // History heat badge hover
      if (_historyActive && _historyClusters.length) {
        const PAD = 4;
        const hxHit = _historyClusters.find(c =>
          mx >= c.x - PAD && mx <= c.x + c.w + PAD &&
          my >= c.y - PAD && my <= c.y + c.h + PAD);
        if (hxHit) {
          wrap.style.cursor = 'pointer';
          _hxShowPopup(hxHit, e.clientX, e.clientY, inst);
          return;
        } else {
          _hxStartHidePopup();
        }
      }

      // Swimlane cluster hover
      if (_swimlaneActive && _swimlaneClusters.length) {
        const PAD = 4; // tolerance px
        const hit = _swimlaneClusters.find(c =>
          mx >= c.x - PAD && mx <= c.x + c.w + PAD &&
          my >= c.y - PAD && my <= c.y + c.h + PAD);
        if (hit) {
          wrap.style.cursor = 'pointer';
          _swShowPopup(hit, e.clientX, e.clientY, wrap);
          return;
        } else {
          _swStartHidePopup();
        }
      }

      let hit = false;
      steps.forEach((s, i) => {
        const px = PAD_L + i * (NW + HGAP), py = NODE_Y;
        if (mx >= px && mx <= px + NW && my >= py && my <= py + NH) hit = true;
      });
      wrap.style.cursor = hit ? 'default' : 'grab';
    });
    wrap.addEventListener('mouseleave', () => {
      wrap.style.cursor = 'grab';
      _swStartHidePopup();
      _hxStartHidePopup();
      _hideConfDotTooltip();
    });
    // Click node to open step completion in list view
    wrap.addEventListener('click',e=>{
      const r=wrap.getBoundingClientRect();
      const mx=(e.clientX-r.left-_instDagPanX)/_instDagScale;
      const my=(e.clientY-r.top-_instDagPanY)/_instDagScale;
      steps.forEach((s,i)=>{
        const px=PAD_L+i*(NW+HGAP), py=NODE_Y;
        if(mx>=px&&mx<=px+NW&&my>=py&&my<=py+NH) {
          // Switch to list mode and select this step
          _selectedInstance._viewMode='list';
          _selectedInstance._selectedStep=s.id;
          const el=document.getElementById('instance-detail');
          if(el) renderInstanceDetail(el,_selectedInstance);
          // Scroll to step
          requestAnimationFrame(()=>{
            document.getElementById(`inst-step-${s.id}`)?.scrollIntoView({behavior:'smooth',block:'center'});
          });
        }
      });
    });
  }
}