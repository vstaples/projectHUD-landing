// cdn-dag-viewer.js — Cadence: template DAG SVG renderer
// nodePos, nodeBC, ah, pill, diamL are DAG geometry helpers
// LOAD ORDER: 6th

function dagZoomIn()    { _dagScale = Math.min(3, _dagScale * 1.25); renderDAG(); }
function dagZoomOut()   { _dagScale = Math.max(0.2, _dagScale * 0.8); renderDAG(); }

function dagZoomOut()   { _dagScale = Math.max(0.2, _dagScale * 0.8); renderDAG(); }
function dagResetView() { _dagPanX = 0; _dagPanY = 0; _dagScale = 1; _dagAutoFitted = false; renderDAG(); }

function dagResetView() { _dagPanX = 0; _dagPanY = 0; _dagScale = 1; _dagAutoFitted = false; renderDAG(); }


function _dagGroupForCards(outcomes) {
  const groups = [];
  outcomes.forEach(o => {
    // Group only when label AND options are identical (true duplicates across steps)
    const key = o.label + '|' + (o.options||[]).join('|');
    const ex  = groups.find(g => g.key === key);
    if (ex) ex.labels.push({ label: o.label, color: o.color });
    else    groups.push({ key, labels:[{ label:o.label, color:o.color }], options: o.options||[] });
  });
  return groups;
}

function _dagAllCardGroups(steps) {
  const seen = {}, groups = [];
  steps.forEach(s => {
    const outs = _dagResetOutcomes(s);
    _dagGroupForCards(outs).forEach(g => {
      if (!seen[g.key]) { seen[g.key] = true; groups.push(g); }
    });
  });
  return groups;
}

function _dagResetOutcomes(s) {
  return _getOutcomes(s).filter(o => o.requiresReset && !o.requiresSuspend && !o.isPartial)
    .map(o => {
      // Each outcome gets specific options based on its id so cards stay distinct
      let options;
      switch(o.id) {
        case 'changes_requested':
          options = ['Revert to prior step', 'Revert to start of workflow', 'Abort instance'];
          break;
        case 'rejected':
          options = ['Revert to start of workflow', 'Abort instance'];
          break;
        case 'declined':
          options = ['Revert to prior step', 'Revert to start of workflow', 'Abort instance'];
          break;
        case 'changes_required':
          options = ['Revert to prior step', 'Revert to start of workflow', 'Abort instance'];
          break;
        default:
          options = ['Revert to prior step', 'Revert to start of workflow', 'Abort instance'];
      }
      return { label: o.label, color: o.color || '#E24B4A', options };
    });
}

function _dagFwdOutcomes(s) {
  return _getOutcomes(s).filter(o => !o.requiresReset && !o.requiresSuspend && !o.isPartial);
}

function renderDAG() {
  const wrap   = document.getElementById('dag-canvas-wrap');
  const canvas = document.getElementById('dag-canvas');
  if (!wrap || !canvas || !_selectedTmpl) return;

  const steps = (_selectedTmpl.steps || [])
    .filter(s => s.step_type !== 'trigger')
    .sort((a, b) => a.sequence_order - b.sequence_order);

  const W = wrap.offsetWidth  || 800;
  const H = wrap.offsetHeight || 400;

  if (W < 10 || H < 10) { setTimeout(() => renderDAG(), 100); return; }

  canvas.width  = W; canvas.height = H;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  if (!steps.length) {
    ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.font = '13px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('No steps yet — add steps to see the diagram', W/2, H/2);
    _dagBuildCards(steps); return;
  }

  // Layout constants
  // Taller node to accommodate name only (owner goes above)
  const NW = 152, NH = 58, HGAP = 72;
  // PAD accounts for trigger circle (24r+gap) on left and terminal on right, plus owner label space above
  const PAD_L = 56, PAD_R = 56;
  const OWNER_H = 22;   // height of owner strip above each node
  const NODE_Y  = 50 + OWNER_H;  // nodes start below owner strip space
  const TRUNK_DROP = 22, BRANCH_GAP = 30, BRANCH_REACH = 108, DR = 8;

  const contentW = PAD_L + steps.length * NW + (steps.length - 1) * HGAP + PAD_R;
  let maxResets = 0;
  steps.forEach(s => { maxResets = Math.max(maxResets, _dagResetOutcomes(s).length); });
  const contentH = NODE_Y + NH + TRUNK_DROP + maxResets * BRANCH_GAP + 30;

  if (!_dagAutoFitted) {
    _dagAutoFitted = true;
    // Target: ~48px margin each side from outermost elements (trigger circle left, terminal circle right)
    // The outermost visual elements are at x≈16 (trigger circle left edge) and x≈contentW-16 (terminal right edge)
    // So visual width = contentW - 32, and we want it to fit in W - 96 (48px margin each side)
    const MARGIN = 48;
    _dagScale = Math.max(0.15, Math.min(1.5, (W - MARGIN * 2) / contentW));
    // Position so left margin is exactly MARGIN px
    _dagPanX = MARGIN;
    // Center vertically in available canvas height
    const scaledH = contentH * _dagScale;
    _dagPanY = scaledH < H ? (H - scaledH) / 2 : MARGIN;
  }

  function nodePos(id) {
    const i = steps.findIndex(s => s.id === id);
    return { x: PAD_L + i * (NW + HGAP), y: NODE_Y };
  }
  function nodeBC(id) { const p = nodePos(id); return { x: p.x + NW/2, y: p.y + NH }; }

  function ah(x, y, dir, col, a=0.75) {
    const sz=7; ctx.beginPath(); ctx.fillStyle=col; ctx.globalAlpha=a;
    if(dir==='right'){ctx.moveTo(x,y);ctx.lineTo(x-sz,y-sz*.5);ctx.lineTo(x-sz,y+sz*.5);}
    if(dir==='left') {ctx.moveTo(x,y);ctx.lineTo(x+sz,y-sz*.5);ctx.lineTo(x+sz,y+sz*.5);}
    ctx.closePath(); ctx.fill(); ctx.globalAlpha=1;
  }

  function pill(text, cx, cy, col, mw) {
    ctx.font = '9px monospace'; let t = text;
    while (t.length > 4 && ctx.measureText(t).width > (mw||999)) t = t.slice(0,-1);
    if (t !== text) t += '…';
    const tw=ctx.measureText(t).width, pw=Math.min(tw+8,mw||tw+8), ph=12;
    ctx.fillStyle='rgba(10,12,18,.9)'; ctx.globalAlpha=.92;
    ctx.beginPath(); ctx.roundRect(cx-pw/2,cy-ph/2,pw,ph,3); ctx.fill();
    ctx.fillStyle=col; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.globalAlpha=1; ctx.fillText(t,cx,cy);
  }

  function diamL(cx, cy, r, col) {
    ctx.beginPath();
    ctx.moveTo(cx-r,cy); ctx.lineTo(cx,cy-r*0.65); ctx.lineTo(cx+r,cy); ctx.lineTo(cx,cy+r*0.65);
    ctx.closePath();
    ctx.fillStyle=col+'25'; ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.globalAlpha=0.9;
    ctx.fill(); ctx.stroke(); ctx.globalAlpha=1;
  }

  ctx.save();
  ctx.translate(_dagPanX, _dagPanY);
  ctx.scale(_dagScale, _dagScale);

  // Trigger
  const fp0 = nodePos(steps[0].id);
  const tx = fp0.x - 36, ty = fp0.y + NH/2;
  ctx.beginPath(); ctx.arc(tx,ty,12,0,Math.PI*2);
  ctx.fillStyle='rgba(192,64,74,.12)'; ctx.strokeStyle='rgba(192,64,74,.55)'; ctx.lineWidth=1.5;
  ctx.fill(); ctx.stroke();
  ctx.fillStyle='#c0404a'; ctx.font='11px sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('⚡',tx,ty);
  ctx.beginPath(); ctx.strokeStyle='rgba(255,255,255,.18)'; ctx.lineWidth=1.2;
  ctx.moveTo(tx+12,ty); ctx.lineTo(fp0.x,ty); ctx.stroke();
  ah(fp0.x, ty, 'right', 'rgba(255,255,255,.25)');

  // Terminal
  const lpLast = nodePos(steps[steps.length-1].id);
  const termX = lpLast.x + NW + HGAP/2, termY = lpLast.y + NH/2;
  ctx.beginPath(); ctx.strokeStyle='rgba(42,157,64,.5)'; ctx.lineWidth=1.5;
  ctx.moveTo(lpLast.x+NW,termY); ctx.lineTo(termX-14,termY); ctx.stroke();
  ah(termX-2,termY,'right','rgba(42,157,64,.7)');
  ctx.beginPath(); ctx.arc(termX,termY,12,0,Math.PI*2);
  ctx.fillStyle='rgba(42,157,64,.1)'; ctx.strokeStyle='rgba(42,157,64,.5)'; ctx.lineWidth=1.5;
  ctx.fill(); ctx.stroke();
  ctx.fillStyle='#7af0a0'; ctx.font='11px sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('✓',termX,termY);

  // Forward edges
  steps.forEach((s, i) => {
    const next = steps[i+1]; if (!next) return;
    const fp = nodePos(s.id), tp = nodePos(next.id);
    const x1 = fp.x+NW, x2 = tp.x, my = fp.y+NH/2;
    const fwdOuts = _dagFwdOutcomes(s);
    // Use default color if no outcomes
    const col = fwdOuts.length ? (fwdOuts[0].color || '#1D9E75') : '#1D9E75';
    ctx.beginPath(); ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.globalAlpha=0.6;
    ctx.moveTo(x1,my); ctx.lineTo(x2-8,my); ctx.stroke(); ctx.globalAlpha=1;
    ah(x2,my,'right',col);
    if (fwdOuts.length === 1) {
      pill(fwdOuts[0].label, (x1+x2)/2, my-11, fwdOuts[0].color||'#1D9E75');
    } else if (fwdOuts.length > 1) {
      // Branch tree above for multiple fwd outcomes
      const spacing=14, topY=fp.y-6-(fwdOuts.length-1)*spacing, trunkX=x1+10;
      ctx.beginPath(); ctx.strokeStyle='rgba(255,255,255,.15)'; ctx.lineWidth=1;
      ctx.moveTo(x1,my); ctx.lineTo(trunkX,my); ctx.lineTo(trunkX,topY); ctx.stroke();
      fwdOuts.forEach((o, li) => {
        const brY = topY + li*spacing;
        const oc  = o.color || '#1D9E75';
        ctx.beginPath(); ctx.strokeStyle=oc; ctx.lineWidth=1.5; ctx.globalAlpha=0.7;
        ctx.moveTo(trunkX,brY); ctx.lineTo(x2-8,brY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2-8,brY); ctx.lineTo(x2-8,my); ctx.stroke();
        ctx.globalAlpha=1; ah(x2,my,'right',oc);
        pill(o.label, (trunkX+x2-8)/2, brY-9, oc);
      });
      ctx.setLineDash([]);
    }
  });

  const _dagHitZones = [];

  // Reset branches — one per outcome, from node bottom-center
  steps.forEach(s => {
    const outs = _dagResetOutcomes(s);
    if (!outs.length) return;
    const bc = nodeBC(s.id);
    const trunkX = bc.x;
    ctx.beginPath(); ctx.strokeStyle='rgba(255,255,255,.15)'; ctx.lineWidth=1;
    ctx.moveTo(trunkX, bc.y);
    ctx.lineTo(trunkX, bc.y + TRUNK_DROP + (outs.length-1)*BRANCH_GAP + 4);
    ctx.stroke();
    outs.forEach((o, bi) => {
      const brY    = bc.y + TRUNK_DROP + bi * BRANCH_GAP;
      const diamCX = trunkX - BRANCH_REACH;
      const diamRX = diamCX + DR;
      ctx.beginPath(); ctx.strokeStyle=o.color; ctx.lineWidth=1.5;
      ctx.setLineDash([5,3]); ctx.globalAlpha=0.65;
      ctx.moveTo(trunkX,brY); ctx.lineTo(diamRX+2,brY);
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1;
      ctx.beginPath(); ctx.strokeStyle=o.color; ctx.lineWidth=1; ctx.globalAlpha=0.4;
      ctx.moveTo(trunkX-3,brY); ctx.lineTo(trunkX+3,brY); ctx.stroke(); ctx.globalAlpha=1;
      diamL(diamCX, brY, DR, o.color);
      pill(o.label, (trunkX+diamRX)/2, brY-9, o.color, BRANCH_REACH-DR-12);
      // Register hit zone for click-to-edit
      _dagHitZones.push({ cx: diamCX, cy: brY, r: DR+6, stepId: s.id });
    });
  });

  // Nodes on top
  steps.forEach(s => {
    const meta = STEP_META[s.step_type] || STEP_META.action;
    const p    = nodePos(s.id);
    const isSel = _selectedStep?.id === s.id;
    ctx.fillStyle='rgba(0,0,0,.3)'; ctx.beginPath(); ctx.roundRect(p.x+2,p.y+2,NW,NH,7); ctx.fill();
    ctx.fillStyle='#1a1d26';
    ctx.strokeStyle = isSel ? 'var(--cad)' : (meta.badgeText + '88');
    ctx.lineWidth = isSel ? 2 : 1.5;
    ctx.beginPath(); ctx.roundRect(p.x,p.y,NW,NH,7); ctx.fill(); ctx.stroke();
    if (isSel) {
      ctx.fillStyle='rgba(0,185,195,.08)'; ctx.beginPath(); ctx.roundRect(p.x,p.y,NW,NH,7); ctx.fill();
    }
    ctx.fillStyle=meta.badgeText; ctx.globalAlpha=0.65;
    ctx.beginPath(); ctx.roundRect(p.x,p.y,4,NH,[7,0,0,7]); ctx.fill(); ctx.globalAlpha=1;

    // ── Owner strip ABOVE the node rect ──────────────────────────────────────
    const ownerName = s.assignee_name ||
      _users_cad?.find(u => u.id === s.assignee_user_id)?.name ||
      _resources_cad?.find(r => r.id === s.assignee_resource_id)?.name || null;
    if (ownerName) {
      const initials = ownerName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      const avatarR  = 9;
      const ax = p.x + 4 + avatarR;
      const ay = p.y - OWNER_H/2;   // centered in the space above the node
      // Avatar circle
      ctx.beginPath(); ctx.arc(ax, ay, avatarR, 0, Math.PI*2);
      ctx.fillStyle = meta.badgeText + '40'; ctx.strokeStyle = meta.badgeText + '88'; ctx.lineWidth = 1;
      ctx.fill(); ctx.stroke();
      // Initials
      ctx.fillStyle = meta.badgeText; ctx.font = '600 9px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = 0.95;
      ctx.fillText(initials, ax, ay); ctx.globalAlpha = 1;
      // Name
      const nameX = ax + avatarR + 6;
      let nameStr = ownerName;
      ctx.font = '500 10px system-ui,sans-serif';
      const maxNameW = NW - (nameX - p.x) - 6;
      while (nameStr.length > 2 && ctx.measureText(nameStr).width > maxNameW)
        nameStr = nameStr.slice(0, -1);
      if (nameStr !== ownerName) nameStr += '…';
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(nameStr, nameX, ay);
    }

    // ── Step name inside node ─────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = '500 11px system-ui,sans-serif';
    let name = s.name || '';
    if (ctx.measureText(name).width > NW - 22) {
      while (name.length > 3 && ctx.measureText(name + '…').width > NW - 22) name = name.slice(0, -1);
      name += '…';
    }
    ctx.fillText(name, p.x + 12, p.y + NH/2 - 6);

    // Type badge bottom-left
    ctx.fillStyle = meta.badgeText; ctx.globalAlpha = 0.55;
    ctx.font = '10px monospace'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
    ctx.fillText(meta.label.toUpperCase(), p.x + 12, p.y + NH - 7); ctx.globalAlpha = 1;
    // Seq number bottom-right
    ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.font = '9px monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(s.sequence_order, p.x + NW - 8, p.y + NH - 8);
    // Due days — top right inside node
    if (s.due_days) {
      ctx.fillStyle = '#e8a838'; ctx.globalAlpha = 0.85; ctx.font = '9px monospace';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('+' + s.due_days + 'd', p.x + NW - 8, p.y + 8); ctx.globalAlpha = 1;
    }
  });

  ctx.restore();

  // Store hit zones for event handler
  canvas._dagHitZones = _dagHitZones;
  const zlbl = document.getElementById('dag-zoom-label');
  if (zlbl) zlbl.textContent = Math.round(_dagScale * 100) + '%';

  // Build HTML decision cards
  _dagBuildCards(steps);
}

function _dagBuildCards(steps) {
  const cardsEl = document.getElementById('dag-cards');
  if (!cardsEl) return;
  const groups = _dagAllCardGroups(steps);
  if (!groups.length) { cardsEl.innerHTML = ''; cardsEl.style.display = 'none'; return; }
  cardsEl.style.display = 'flex';
  const optColors = ['#BA7517','#E24B4A','#666'];

  // Find which step owns each group (for click → open panel)
  function findStepForGroup(g) {
    for (const re of resetEdges || []) {
      const step = steps.find(s => s.id === re.from);
      if (!step) continue;
      const outs = _dagResetOutcomes(step);
      if (outs.some(o => g.labels.some(lb => lb.label === o.label))) return step;
    }
    return null;
  }

  cardsEl.innerHTML = groups.map((g, gi) => {
    const borderCol = g.labels.length === 1 ? g.labels[0].color : '#BA7517';
    // Title-case helper
    const toTitleCase = s => s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    const headerHTML = g.labels.map(lb =>
      `<span style="color:${lb.color};font-weight:600;font-size:12px">${escHtml(toTitleCase(lb.label))}</span>`
    ).join('<span style="color:#383838;margin:0 4px">·</span>');
    const optsHTML = g.options.map((opt, i) => {
      const isAbort = opt.toLowerCase().includes('abort');
      const col  = isAbort ? '#666' : optColors[Math.min(i,1)];
      const icon = isAbort ? '✕' : '↩';
      return `<div style="display:flex;align-items:flex-start;gap:6px;padding:4px 0;border-top:1px solid rgba(255,255,255,.06)">
        <span style="color:${col};font-size:12px;flex-shrink:0;margin-top:1px">${icon}</span>
        <span style="color:rgba(255,255,255,.75);font-size:11px;line-height:1.4">${escHtml(opt)}</span>
      </div>`;
    }).join('');
    return `<div id="dag-card-${gi}"
      onclick="dagCardClick(${gi})"
      style="background:var(--bg2);border:1px solid ${borderCol}44;border-radius:5px;
        padding:10px 12px;min-width:160px;flex:1;max-width:220px;cursor:pointer;
        transition:border-color .15s,background .15s"
      onmouseover="this.style.borderColor='${borderCol}99'"
      onmouseout="if(_dagActiveCard!==${gi})this.style.borderColor='${borderCol}44'">
      <div style="font-size:10px;color:rgba(255,255,255,.9);letter-spacing:.08em;text-transform:uppercase;
        margin-bottom:6px;font-weight:700">Decision Outcomes</div>
      <div style="margin-bottom:7px;line-height:1.7">${headerHTML}</div>
      ${optsHTML}
    </div>`;
  }).join('');

  // Store groups on element for click handler
  cardsEl._dagGroups = groups;
  cardsEl._dagSteps  = steps;
}

function _initDagEvents() {
  const wrap = document.getElementById('dag-canvas-wrap');
  if (!wrap || wrap._dagEventsInit) return;
  wrap._dagEventsInit = true;

  wrap.addEventListener('mousedown', e => {
    _dagDragging   = true;
    _dagDragStartX = e.clientX;
    _dagDragStartY = e.clientY;
    _dagPanStartX  = _dagPanX;
    _dagPanStartY  = _dagPanY;
    wrap.style.cursor = 'grabbing';
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!_dagDragging) return;
    _dagPanX = _dagPanStartX + (e.clientX - _dagDragStartX);
    _dagPanY = _dagPanStartY + (e.clientY - _dagDragStartY);
    renderDAG();
  });
  window.addEventListener('mouseup', () => {
    if (!_dagDragging) return;
    _dagDragging = false;
    wrap.style.cursor = 'grab';
  });
  wrap.addEventListener('wheel', e => {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+scroll = zoom (zoom toward cursor position)
      e.preventDefault();
      const rect    = wrap.getBoundingClientRect();
      const mouseX  = e.clientX - rect.left;
      const mouseY  = e.clientY - rect.top;
      const factor  = e.deltaY < 0 ? 1.12 : 0.89;
      const newScale = Math.max(0.2, Math.min(3, _dagScale * factor));
      // Adjust pan so zoom is centered on cursor
      _dagPanX = mouseX - (mouseX - _dagPanX) * (newScale / _dagScale);
      _dagPanY = mouseY - (mouseY - _dagPanY) * (newScale / _dagScale);
      _dagScale = newScale;
      renderDAG();
    } else {
      // Plain scroll = pan
      e.preventDefault();
      _dagPanX -= e.deltaX;
      _dagPanY -= e.deltaY;
      renderDAG();
    }
  }, { passive: false });

  // ── Panel resize drag ─────────────────────────────────────────────────────
  const resizeHandle = document.getElementById('dag-panel-resize');
  if (resizeHandle) {
    let _resizing = false, _resizeStartX = 0, _resizeStartW = 0;
    resizeHandle.addEventListener('mousedown', e => {
      const panel = document.getElementById('dag-slide-panel');
      if (!panel) return;
      _resizing    = true;
      _resizeStartX = e.clientX;
      _resizeStartW = panel.offsetWidth;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
      e.stopPropagation();
    });
    window.addEventListener('mousemove', e => {
      if (!_resizing) return;
      const panel = document.getElementById('dag-slide-panel');
      if (!panel) return;
      const delta  = _resizeStartX - e.clientX; // dragging left = wider
      const newW   = Math.max(260, Math.min(700, _resizeStartW + delta));
      panel.style.width = newW + 'px';
      // Suppress transition during drag
      panel.style.transition = 'none';
    });
    window.addEventListener('mouseup', () => {
      if (!_resizing) return;
      _resizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const panel = document.getElementById('dag-slide-panel');
      if (panel) panel.style.transition = 'transform .22s cubic-bezier(.4,0,.2,1)';
    });
  }

  wrap.addEventListener('mousemove', e => {
    if (_dagDragging) return;
    const cv   = document.getElementById('dag-canvas');
    const rect = wrap.getBoundingClientRect();
    const mx   = (e.clientX - rect.left  - _dagPanX) / _dagScale;
    const my   = (e.clientY - rect.top   - _dagPanY) / _dagScale;
    // Check diamond zones
    const zones  = cv?._dagHitZones || [];
    const diamHit = zones.find(z => Math.hypot(mx - z.cx, my - z.cy) <= z.r);
    if (diamHit) { wrap.style.cursor = 'pointer'; return; }
    // Check node zones
    const steps = (_selectedTmpl?.steps||[]).filter(s=>s.step_type!=='trigger')
      .sort((a,b)=>a.sequence_order-b.sequence_order);
    const NW=152, NH=58, HGAP=72, PAD_L=56, OWNER_H=22, NODE_Y=50+OWNER_H;
    const nodeHit = steps.some((s,i) => {
      const sx=PAD_L+i*(NW+HGAP), sy=NODE_Y;
      return mx>=sx && mx<=sx+NW && my>=sy && my<=sy+NH;
    });
    wrap.style.cursor = nodeHit ? 'pointer' : 'grab';
  });

  wrap.addEventListener('click', e => {
    // Only fire if mousedown and click are within 5px (genuine click, not a drag)
    if (Math.abs(e.clientX - _dagDragStartX) > 5 ||
        Math.abs(e.clientY - _dagDragStartY) > 5) return;
    const cv   = document.getElementById('dag-canvas');
    const steps = (_selectedTmpl?.steps||[])
      .filter(s => s.step_type !== 'trigger')
      .sort((a,b) => a.sequence_order - b.sequence_order);
    // Must match renderDAG layout constants exactly
    const NW=152, NH=58, HGAP=72, PAD_L=56, OWNER_H=22, NODE_Y=50+OWNER_H;
    const rect = wrap.getBoundingClientRect();
    const mx   = (e.clientX - rect.left  - _dagPanX) / _dagScale;
    const my   = (e.clientY - rect.top   - _dagPanY) / _dagScale;
    // Diamond hit zones first
    const zones   = cv?._dagHitZones || [];
    const diamHit = zones.find(z => Math.hypot(mx - z.cx, my - z.cy) <= z.r);
    if (diamHit) { _dagJumpToStep(diamHit.stepId, true); return; }
    // Node hit zones
    steps.forEach((s, i) => {
      const sx = PAD_L + i*(NW+HGAP), sy = NODE_Y;
      if (mx >= sx && mx <= sx+NW && my >= sy && my <= sy+NH) {
        _dagJumpToStep(s.id, false);
      }
    });
  });
}

function _dagJumpToStep(stepId, scrollToOutcomes) {
  const step = _selectedTmpl?.steps?.find(s => s.id === stepId);
  if (!step) return;
  _selectedStep = step;

  const panel  = document.getElementById('dag-slide-panel');
  const header = document.getElementById('dag-panel-title');
  const icon   = document.getElementById('dag-panel-icon');
  const body   = document.getElementById('dag-panel-body');
  if (!panel || !body) return;

  const meta = STEP_META[step.step_type] || STEP_META.action;
  icon.textContent  = meta.icon;
  icon.style.color  = meta.badgeText;
  header.textContent = step.name || meta.label;

  body.innerHTML = renderInlineStepConfig(step);

  // Slide in
  panel.style.transform = 'translateX(0)';
  _dagPanelOpen = true;

  // Redraw to show highlight on selected node
  renderDAG();

  // Scroll to outcomes section if requested (diamond click)
  if (scrollToOutcomes) {
    requestAnimationFrame(() => {
      const outcomeSection = body.querySelector('[id^="outcomes-section-"], .outcomes-section, [data-section="outcomes"]');
      if (outcomeSection) {
        outcomeSection.scrollIntoView({ behavior:'smooth', block:'start' });
      } else {
        // Find outcomes accordion by scanning for "Outcomes" label text
        const labels = body.querySelectorAll('.config-label, label');
        for (const l of labels) {
          if (l.textContent.toLowerCase().includes('outcome')) {
            l.scrollIntoView({ behavior:'smooth', block:'start' });
            break;
          }
        }
      }
    });
  }
}

function dagCardClick(gi) {
  const cardsEl = document.getElementById('dag-cards');
  if (!cardsEl) return;
  const groups = cardsEl._dagGroups;
  const steps  = cardsEl._dagSteps;
  if (!groups || !steps) return;
  const g = groups[gi];
  if (!g) return;

  // Highlight clicked card, unhighlight others
  _dagActiveCard = gi;
  groups.forEach((_, i) => {
    const el = document.getElementById(`dag-card-${i}`);
    if (!el) return;
    const borderCol = groups[i].labels[0]?.color || '#BA7517';
    if (i === gi) {
      el.style.borderColor = borderCol + 'cc';
      el.style.background  = borderCol + '18';
    } else {
      el.style.borderColor = borderCol + '44';
      el.style.background  = 'var(--bg2)';
    }
  });

  // Find the step that owns this outcome group
  let targetStep = null;
  for (const s of steps) {
    const outs = _dagResetOutcomes(s);
    if (outs.some(o => g.labels.some(lb => lb.label === o.label))) {
      targetStep = s; break;
    }
  }
  if (targetStep) _dagJumpToStep(targetStep.id, true);
}

function dagPanelDeleteStep() {
  if (!_selectedStep) return;
  const id = _selectedStep.id;
  dagClosePanel();
  removeStep(id);
}

function dagClosePanel() {
  const panel = document.getElementById('dag-slide-panel');
  if (panel) panel.style.transform = 'translateX(100%)';
  _dagPanelOpen = false;
  _dagActiveCard = -1;
  // Reset all card highlights
  const cardsEl = document.getElementById('dag-cards');
  if (cardsEl?._dagGroups) {
    cardsEl._dagGroups.forEach((g, i) => {
      const el = document.getElementById(`dag-card-${i}`);
      if (el) { el.style.borderColor = (g.labels[0]?.color||'#BA7517')+'44'; el.style.background='var(--bg2)'; }
    });
  }
  _selectedStep = null;
  renderDAG();
}