function _diagProjColor(projId) {
  const palette = ['#00D2FF','#8B5CF6','#1D9E75','#EF9F27','#E24B4A','#F472B6','#38BDF8','#A3E635'];
  if (!projId) return palette[0];
  let h = 0;
  for (let i = 0; i < projId.length; i++) h = (h * 31 + projId.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

// ── Slot allocation engine (pure function) ─────────────────
function _diagAllocateSlots(nodes, CW) {
  const colSlots = {};
  const positions = {};
  const CARD_H = 76, CARD_GAP = 6, ROW_PAD = 8;
  const typeOrder = { task: 0, action: 1 };
  const sorted = [...nodes].sort((a, b) => {
    const da = a.due || '9999', db = b.due || '9999';
    if (da !== db) return da.localeCompare(db);
    return (typeOrder[a.type] ?? 2) - (typeOrder[b.type] ?? 2);
  });
  sorted.forEach(n => {
    const col = n.due || '9999';
    if (!colSlots[col]) colSlots[col] = [];
    let slot = 0;
    while (colSlots[col].includes(slot)) slot++;
    colSlots[col].push(slot);
    positions[n.id] = { col, slot, y: slot * (CARD_H + CARD_GAP) + ROW_PAD };
  });
  return { positions, CARD_H, CARD_GAP, ROW_PAD };
}

// ── Build and render the diagram ──────────────────────────
function _diagApplyTransform() {
  // Zoom = column width only. Rebuild to reflect new CW.
  buildWorkDiagram();
  const lbl = document.getElementById('diag-zoom-lbl');
  if (lbl) lbl.textContent = Math.round(_diagScale * 100) + '%';
}

function buildWorkDiagram() {
  const root    = document.getElementById('mw-diag-root');
  const tlHdr   = document.getElementById('mw-diag-tl-header');
  const stubCol = document.getElementById('mw-diag-stub-col');
  if (!root || !tlHdr || !stubCol) return;
  root.innerHTML = ''; tlHdr.innerHTML = ''; stubCol.innerHTML = '';

  const today = new Date().toLocaleDateString('en-CA');
  const items = _wiItems || [];
  if (!items.length) {
    root.innerHTML = '<div style="padding:40px;text-align:center;font-family:var(--font-mono,monospace);font-size:12px;color:var(--text3)">No tasks in current view</div>';
    return;
  }

  // ── Date columns ──────────────────────────────────────
  const dueDates = [...new Set(items.map(w => w.due).filter(Boolean))].sort();
  const minDate  = dueDates[0] || today;
  const maxDate  = dueDates[dueDates.length - 1] || today;
  const allDates = new Set(dueDates);
  allDates.add(today);
  const endD = new Date(maxDate + 'T00:00:00'); endD.setDate(endD.getDate() + 7);
  for (let d = new Date(minDate + 'T00:00:00'); d <= endD; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) allDates.add(d.toLocaleDateString('en-CA'));
  }
  const DATES = [...allDates].sort();
  const dateIndex = {};
  DATES.forEach((d, i) => dateIndex[d] = i);

  const BASE_CW = 120, CW = Math.round(BASE_CW * _diagScale);
  const CARD_W = 108, CARD_H = 76, CARD_GAP = 6, ROW_PAD = 8;
  const todayIdx = dateIndex[today];
  const totalCW  = DATES.length * CW + 40;

  // ── Group by project ──────────────────────────────────
  const projMap = {};
  items.forEach(w => {
    const key = w.projectId || '__actions__';
    if (!projMap[key]) projMap[key] = { id: key, name: w.projectId ? (w.project || '—') : 'Action Items', nodes: [] };
    projMap[key].nodes.push(w);
  });

  // ══ TOP-RIGHT: Timeline header (h-scroll synced) ══════
  const tlRow = document.createElement('div');
  tlRow.style.cssText = `display:flex;width:${totalCW}px`;
  DATES.forEach(d => {
    const isToday = d === today;
    const dt = new Date(d + 'T00:00:00');
    const col = document.createElement('div');
    col.style.cssText = `width:${CW}px;flex-shrink:0;border-right:1px solid rgba(255,255,255,.04);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3px 0`;
    const dayNum  = dt.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    const dayName = dt.toLocaleDateString('en-US', { weekday:'short' });
    col.innerHTML = `<div style="font-family:var(--font-mono,monospace);font-size:11px;font-weight:${isToday?'700':'400'};color:${isToday?'#00D2FF':'rgba(255,255,255,.3)'}">${dayNum}</div><div style="font-family:var(--font-mono,monospace);font-size:11px;color:${isToday?'#00D2FF':'rgba(255,255,255,.2)'}">${dayName}</div>`;
    tlRow.appendChild(col);
  });
  tlHdr.appendChild(tlRow);

  // ══ CAPACITY BAR ROW (below timeline header) ══════════
  // One bar per day column. Unrated action items excluded.
  // Available: 8h/day. Rated items contribute LOE spread across working days to due date.
  const AVAIL_HRS = 8;

  // Helper: parse LOE string → hours
  function _loeToHours(loeStr) {
    if (!loeStr) return 0;
    const s = loeStr.toLowerCase().trim();
    if (s.includes('week'))  return parseFloat(s) * 40 || 40;
    if (s.includes('day'))   return parseFloat(s) * 8  || 8;
    if (s.includes('hour'))  return parseFloat(s)      || 0;
    return 0;
  }

  // Helper: working days between two date strings (inclusive)
  function _workingDaysBetween(startStr, endStr) {
    const days = [];
    const s = new Date(startStr + 'T00:00:00');
    const e = new Date((endStr || startStr) + 'T00:00:00');
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) days.push(d.toLocaleDateString('en-CA'));
    }
    return days;
  }

  // Build per-date hour allocation map
  const allocMap = {}; // { dateStr: hours }
  DATES.forEach(d => { allocMap[d] = 0; });

  items.forEach(item => {
    let hrs = 0;
    if (item.type === 'action') {
      const neg = negGetState(item.id);
      if (!neg || neg.state === 'unrated') return; // skip unrated
      hrs = _loeToHours(neg.loe || neg.agreedLoe || '');
      if (hrs <= 0) return;
      // Spread evenly across working days from today to proposed/agreed due date
      const dueDate = neg.agreedDue || neg.proposedDue || item.due;
      if (!dueDate) { allocMap[today] = (allocMap[today] || 0) + hrs; return; }
      const spread = _workingDaysBetween(today, dueDate).filter(d => DATES.includes(d));
      if (!spread.length) return;
      const hrsPerDay = hrs / spread.length;
      spread.forEach(d => { allocMap[d] = (allocMap[d] || 0) + hrsPerDay; });
    } else {
      // Task: use budgetHours or effortDays
      hrs = item.budgetHours || (item.effortDays ? item.effortDays * 8 : 0);
      if (hrs <= 0) return;
      if (!item.due) { allocMap[today] = (allocMap[today] || 0) + hrs; return; }
      const spread = _workingDaysBetween(today, item.due).filter(d => DATES.includes(d));
      if (!spread.length) { allocMap[item.due] = (allocMap[item.due] || 0) + hrs; return; }
      const hrsPerDay = hrs / spread.length;
      spread.forEach(d => { allocMap[d] = (allocMap[d] || 0) + hrsPerDay; });
    }
  });

  // Render capacity bar row in tlHdr (second row)
  const capRow = document.createElement('div');
  capRow.className = 'cmp-diag-tl-canvas-chrome';
  capRow.style.cssText = `display:flex;width:${totalCW}px;border-bottom:1px solid rgba(0,210,255,.08)`;
  DATES.forEach(d => {
    const isToday = d === today;
    const alloc   = allocMap[d] || 0;
    const pct     = Math.min(alloc / AVAIL_HRS, 1);
    const over    = alloc > AVAIL_HRS;
    const warn    = pct > 0.7 && !over;
    const barColor = over ? '#E24B4A' : warn ? '#EF9F27' : '#1D9E75';
    const remaining = Math.max(0, AVAIL_HRS - alloc).toFixed(1);
    const col = document.createElement('div');
    col.style.cssText = `width:${CW}px;flex-shrink:0;border-right:1px solid rgba(255,255,255,.04);padding:3px 4px;box-sizing:border-box`;
    col.title = `${d}: ${alloc.toFixed(1)}h allocated / ${AVAIL_HRS}h available`;
    col.innerHTML = `
      <div style="height:5px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden;margin-bottom:2px">
        <div style="height:100%;width:${Math.round(pct*100)}%;background:${barColor};border-radius:2px;transition:width .3s"></div>
      </div>
      <div style="font-family:var(--font-mono,monospace);font-size:11px;font-weight:700;color:${over?'#E24B4A':warn?'#EF9F27':isToday?'#00D2FF':'rgba(255,255,255,.45)'};text-align:center;white-space:nowrap;letter-spacing:.03em">
        ${isToday ? (over?'+':'') + (over ? (alloc-AVAIL_HRS).toFixed(1)+'h over' : remaining+'h left') : alloc > 0 ? alloc.toFixed(1)+'h' : ''}
      </div>`;
    capRow.appendChild(col);
  });
  tlHdr.appendChild(capRow);

  // ══ BOTTOM-RIGHT: Card canvas (master scroll) ═════════
  // ══ BOTTOM-LEFT:  Stub column (v-scroll synced) ═══════
  // Build both in lockstep — each project/lane appends a matching-height row to each

  root.style.cssText = `width:${totalCW}px`;

  Object.values(projMap).forEach(proj => {
    const projColor = _diagProjColor(proj.id === '__actions__' ? null : proj.id);
    const collapsed  = _diagCollapsed.has(proj.id);
    const PROJ_HDR_H = 28;

    // Stub: project header
    const ps = document.createElement('div');
    ps.style.cssText = `height:${PROJ_HDR_H}px;display:flex;align-items:center;gap:7px;padding:0 10px;cursor:pointer;background:rgba(255,255,255,.025);border-bottom:1px solid rgba(255,255,255,.04);box-sizing:border-box`;
    ps.innerHTML = `<div style="width:3px;height:14px;background:${projColor};border-radius:1px;flex-shrink:0"></div><div style="font-family:var(--font-mono,monospace);font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${projColor};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(proj.name)}</div><div id="diag-tog-${proj.id}" style="font-family:var(--font-mono,monospace);font-size:11px;color:rgba(255,255,255,.3)">${collapsed?'▸':'▾'}</div>`;
    ps.dataset.action = 'diag-toggle-proj';
    ps.dataset.projId = proj.id;
    stubCol.appendChild(ps);

    // Canvas: project header (full canvas width)
    const projHdr = document.createElement('div');
    projHdr.style.cssText = `height:${PROJ_HDR_H}px;width:${totalCW}px;background:rgba(255,255,255,.025);border-bottom:1px solid rgba(255,255,255,.04);position:relative`;
    if (todayIdx !== undefined) {
      const tx = todayIdx * CW + CW / 2;
      projHdr.innerHTML = `<div style="position:absolute;left:${tx}px;top:0;bottom:0;width:1px;background:rgba(0,210,255,.12)"></div>`;
    }
    root.appendChild(projHdr);

    if (collapsed) return;

    const taskNodes   = proj.nodes.filter(n => n.type === 'task');
    const actionNodes = proj.nodes.filter(n => n.type === 'action');
    const subLanes = [];
    if (taskNodes.length)   subLanes.push({ label:'Tasks',   nodes:taskNodes });
    if (actionNodes.length) subLanes.push({ label:'Actions', nodes:actionNodes });
    if (!subLanes.length)   subLanes.push({ label:'',        nodes:proj.nodes });

    subLanes.forEach(lane => {
      // Slot allocation
      const colSlots = {}, positions = {};
      const typeOrd = { task:0, action:1 };
      [...lane.nodes].sort((a,b)=>{
        const da=a.due||'9999', db=b.due||'9999';
        return da!==db ? da.localeCompare(db) : (typeOrd[a.type]??2)-(typeOrd[b.type]??2);
      }).forEach(n=>{
        const col=n.due||'9999';
        if(!colSlots[col]) colSlots[col]=[];
        let slot=0; while(colSlots[col].includes(slot)) slot++;
        colSlots[col].push(slot);
        positions[n.id]={col,slot,y:slot*(CARD_H+CARD_GAP)+ROW_PAD};
      });
      const maxSlot = Math.max(0,...lane.nodes.map(n=>positions[n.id]?.slot??0));
      const lh = (maxSlot+1)*(CARD_H+CARD_GAP)+ROW_PAD*2;

      // Stub: lane label
      const ls = document.createElement('div');
      ls.style.cssText = `height:${lh}px;background:rgba(255,255,255,.01);border-bottom:1px solid rgba(255,255,255,.03);display:flex;align-items:flex-start;padding:6px 10px;box-sizing:border-box`;
      ls.innerHTML = `<span style="font-family:var(--font-mono,monospace);font-size:11px;color:rgba(255,255,255,.2);letter-spacing:.06em;text-transform:uppercase">${lane.label}</span>`;
      stubCol.appendChild(ls);

      // Canvas: lane row
      const cv = document.createElement('div');
      cv.style.cssText = `position:relative;height:${lh}px;width:${totalCW}px;border-bottom:1px solid rgba(255,255,255,.03)`;

      // SVG: today line
      const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.style.cssText = `position:absolute;top:0;left:0;pointer-events:none;overflow:visible;z-index:2`;
      svg.setAttribute('width',totalCW); svg.setAttribute('height',lh);
      if (todayIdx !== undefined) {
        const tx = todayIdx*CW+CW/2;
        const vl = document.createElementNS('http://www.w3.org/2000/svg','line');
        vl.setAttribute('x1',tx); vl.setAttribute('y1',0); vl.setAttribute('x2',tx); vl.setAttribute('y2',lh);
        vl.setAttribute('stroke','rgba(0,210,255,.18)'); vl.setAttribute('stroke-width','1.5');
        svg.appendChild(vl);
      }
      cv.appendChild(svg);

      // Node cards
      lane.nodes.forEach(node=>{
        const pos=positions[node.id]; if(!pos) return;
        const colIdx=dateIndex[pos.col]??0;
        const x=colIdx*CW+Math.max(0,(CW-CARD_W)/2);
        const isOverdue=node.overdue, isTod=pos.col===today;
        const nc=isOverdue?'#E24B4A':isTod?'#EF9F27':node.type==='action'?'#8B5CF6':'#00D2FF';
        const pct=node.pct||0, sl=(node.status||'open').replace(/_/g,' ');
        const nd=document.createElement('div');
        nd.style.cssText=`position:absolute;left:${x}px;top:${pos.y}px;width:${CARD_W}px;cursor:pointer;z-index:3`;
        nd.dataset.wiId=node.id; nd.dataset.action='diag-open-task';
        nd.innerHTML=`<div class="diag-nd-inner" style="border:1px solid ${nc}44;border-left:3px solid ${nc};background:rgba(10,12,28,.9);border-radius:3px;padding:5px 7px;height:${CARD_H}px;box-sizing:border-box;overflow:hidden"><div style="font-family:var(--font-mono,monospace);font-size:11px;color:${nc};letter-spacing:.05em;text-transform:uppercase;opacity:.7;margin-bottom:2px">${node.type}</div><div style="font-family:var(--font-mono,monospace);font-size:11px;font-weight:700;color:#F0F6FF;line-height:1.3;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:${CARD_W-14}px" title="${esc(node.title)}">${esc(node.title)}</div><div style="font-family:var(--font-mono,monospace);font-size:11px;color:rgba(255,255,255,.35);margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(node.project)}</div>${pct>0?`<div style="height:2px;background:rgba(255,255,255,.08);border-radius:1px;overflow:hidden;margin-bottom:3px"><div style="height:100%;width:${pct}%;background:${nc};border-radius:1px"></div></div>`:''}<div style="font-family:var(--font-mono,monospace);font-size:11px;padding:1px 5px;border:1px solid ${nc}55;color:${nc};display:inline-block;letter-spacing:.04em">${sl}</div></div>`;
        cv.appendChild(nd);
      });

      // Connectors
      setTimeout(()=>{
        const cvRect=cv.getBoundingClientRect();
        lane.nodes.forEach(node=>{
          if(node.type!=='action') return;
          const parent=proj.nodes.find(p=>p.type==='task'&&positions[p.id]&&positions[node.id]&&
            dateIndex[positions[p.id]?.col]<dateIndex[positions[node.id]?.col]);
          if(!parent) return;
          const pEl=cv.querySelector(`[data-wi-id="${parent.id}"]`), cEl=cv.querySelector(`[data-wi-id="${node.id}"]`);
          if(!pEl||!cEl) return;
          const pR=pEl.getBoundingClientRect(), cR=cEl.getBoundingClientRect();
          const fx=pR.right-cvRect.left, fy=pR.top+pR.height/2-cvRect.top;
          const tx=cR.left-cvRect.left,   ty=cR.top+cR.height/2-cvRect.top;
          const mx=(fx+tx)/2;
          const d=Math.abs(fy-ty)<4?`M${fx},${fy} H${tx}`:`M${fx},${fy} H${mx} V${ty} H${tx}`;
          const path=document.createElementNS('http://www.w3.org/2000/svg','path');
          path.setAttribute('d',d); path.setAttribute('stroke','rgba(0,210,255,.3)');
          path.setAttribute('stroke-width','1.2'); path.setAttribute('fill','none');
          path.setAttribute('stroke-dasharray','4,3');
          const arr=document.createElementNS('http://www.w3.org/2000/svg','polygon');
          arr.setAttribute('points',`${tx},${ty} ${tx-7},${ty-3.5} ${tx-7},${ty+3.5}`);
          arr.setAttribute('fill','rgba(0,210,255,.4)');
          svg.appendChild(path); svg.appendChild(arr);
        });
      },80);

      root.appendChild(cv);
    });
  });
}

function _diagApplyTransform() {
  buildWorkDiagram();
  const lbl = document.getElementById('diag-zoom-lbl');
  if (lbl) lbl.textContent = Math.round(_diagScale * 100) + '%';
}

// ── Scroll sync: canvas drives header + stub ────────────
(function _initDiagScrollSync() {
  document.addEventListener('scroll', function(ev) {
    const canvas = document.getElementById('mw-diag-canvas-wrap');
    if (!canvas || ev.target !== canvas) return;
    const tl  = document.getElementById('mw-diag-tl-header');
    const stub = document.getElementById('mw-diag-stub-col');
    if (tl)   tl.scrollLeft   = canvas.scrollLeft;   // h-sync: timeline follows canvas
    if (stub) stub.scrollTop  = canvas.scrollTop;     // v-sync: stubs follow canvas
  }, true);

  // Wheel zoom: adjust CW, rebuild
  document.addEventListener('wheel', function(ev) {
    const canvas = document.getElementById('mw-diag-canvas-wrap');
    if (!canvas || !_diagramMode || !canvas.contains(ev.target)) return;
    ev.preventDefault();
    _diagScale = Math.min(3, Math.max(0.3, _diagScale + (ev.deltaY > 0 ? -0.1 : 0.1)));
    const sl = canvas.scrollLeft, st = canvas.scrollTop;
    buildWorkDiagram();
    canvas.scrollLeft = sl; canvas.scrollTop = st;
    const lbl = document.getElementById('diag-zoom-lbl');
    if (lbl) lbl.textContent = Math.round(_diagScale * 100) + '%';
  }, { passive:false });

  // Drag pan
  let _px=false, _lx=0, _ly=0;
  document.addEventListener('mousedown', function(ev) {
    const canvas = document.getElementById('mw-diag-canvas-wrap');
    if (!canvas || !_diagramMode || !canvas.contains(ev.target)) return;
    if (ev.target.closest('[data-action]')) return;
    _px=true; _lx=ev.clientX; _ly=ev.clientY;
    canvas.style.cursor='grabbing';
  });
  document.addEventListener('mousemove', function(ev) {
    if (!_px) return;
    const canvas = document.getElementById('mw-diag-canvas-wrap');
    if (!canvas) return;
    canvas.scrollLeft -= ev.clientX - _lx;
    canvas.scrollTop  -= ev.clientY - _ly;
    _lx=ev.clientX; _ly=ev.clientY;
  });
  document.addEventListener('mouseup', function() {
    _px=false;
    const canvas = document.getElementById('mw-diag-canvas-wrap');
    if (canvas) canvas.style.cursor='grab';
  });
  document.addEventListener('touchstart', function(ev) {
    const canvas=document.getElementById('mw-diag-canvas-wrap');
    if (!canvas||!_diagramMode||!canvas.contains(ev.target)||ev.touches.length!==1) return;
    _px=true; _lx=ev.touches[0].clientX; _ly=ev.touches[0].clientY;
  },{passive:true});
  document.addEventListener('touchmove', function(ev) {
    if (!_px||ev.touches.length!==1) return;
    const canvas=document.getElementById('mw-diag-canvas-wrap');
    if (!canvas) return;
    canvas.scrollLeft -= ev.touches[0].clientX - _lx;
    canvas.scrollTop  -= ev.touches[0].clientY - _ly;
    _lx=ev.touches[0].clientX; _ly=ev.touches[0].clientY;
  },{passive:true});
  document.addEventListener('touchend',()=>{ _px=false; });
})();

// MY COC DRAWER
// ══════════════════════════════════════════════════════════
window.toggleUserCoC = function() {
  const existing = document.getElementById('user-coc-drawer');
  if (existing) { existing.remove(); document.getElementById('nav-coc-btn').style.color=''; return; }

  const drawer = document.createElement('div');
  drawer.id = 'user-coc-drawer';
  drawer.style.cssText = 'position:fixed;top:44px;right:0;width:300px;height:calc(100vh - 44px);background:#080f1e;border-left:1px solid rgba(0,210,255,.2);z-index:150;display:flex;flex-direction:column;animation:slide-in-right 180ms ease';

  // Inject keyframe once
  if (!document.getElementById('coc-drawer-style')) {
    const st = document.createElement('style');
    st.id = 'coc-drawer-style';
    st.textContent = '@keyframes slide-in-right{from{transform:translateX(100%)}to{transform:none}}';
    document.head.appendChild(st);
  }

  const evtColor = {
    instance_launched:'var(--compass-cyan)', instance_completed:'var(--compass-green)',
    step_activated:'#e8a838', step_completed:'var(--compass-green)',
    step_reset:'var(--compass-red)', management_decision:'var(--compass-amber)',
    intervention:'#8B5CF6', flag_acknowledged:'var(--compass-cyan)',
    meeting_created:'var(--compass-cyan)', bist_run:'#8B5CF6', bist_override:'var(--compass-amber)',
  };
  const evtLabel = {
    instance_launched:'Instance Launched', instance_completed:'Instance Completed',
    step_activated:'Step Activated', step_completed:'Step Completed',
    step_reset:'Step Reset', management_decision:'Management Decision',
    intervention:'Intervention', flag_acknowledged:'Flag Acknowledged',
    meeting_created:'Meeting Created', bist_run:'BIST Run', bist_override:'BIST Override',
  };

  const evts = window._myCocEvents || [];
  const rowsHtml = !evts.length
    ? '<div style="font-family:var(--font-mono,monospace);font-size:11px;color:var(--text3);padding:16px;line-height:1.7">No CoC events found.<br><br>Events appear here when you complete workflow steps, save progress updates, or raise concerns.</div>'
    : evts.map((e, i, arr) => {
        const col   = evtColor[e.event_type] || 'rgba(255,255,255,.3)';
        const label = evtLabel[e.event_type] || (e.event_type||'').replace(/_/g,' ') || 'Event';
        const stepName = (e.step_name||'').replace(/^CONCERN:\s*/,'');
        const note  = e.event_notes || '';
        const ts    = e.created_at ? new Date(e.created_at) : null;
        const isLast = i === arr.length - 1;
        const outcomeColor = e.outcome==='on_track'?'var(--compass-green)':e.outcome==='at_risk'?'var(--compass-amber)':e.outcome==='blocked'?'var(--compass-red)':col;
        const outcomeLabel = e.outcome==='on_track'?'On track':e.outcome==='at_risk'?'At risk':e.outcome==='blocked'?'Blocked':e.outcome?(e.outcome.replace(/_/g,' ')):'';
        let h = '<div style="display:flex;gap:8px;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.04)">'
          + '<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:14px">'
          + '<div style="width:7px;height:7px;border-radius:50%;background:'+col+';margin-top:3px;flex-shrink:0"></div>'
          + (!isLast ? '<div style="width:1px;flex:1;min-height:8px;background:rgba(255,255,255,.08);margin-top:2px"></div>' : '')
          + '</div>'
          + '<div style="flex:1;min-width:0;padding-bottom:2px">'
          + '<div style="font-family:var(--font-mono,monospace);font-size:11px;font-weight:700;color:'+col+'">'+esc(label)+'</div>';
        if (stepName) h += '<div style="font-family:var(--font-mono,monospace);font-size:11px;color:rgba(255,255,255,.45);margin-top:1px">→ '+esc(stepName)+'</div>';
        if (outcomeLabel) h += '<div style="display:inline-flex;align-items:center;gap:4px;margin-top:3px;padding:2px 8px;border-radius:10px;border:1px solid '+outcomeColor+'44">'
          + '<div style="width:5px;height:5px;border-radius:50%;background:'+outcomeColor+'"></div>'
          + '<span style="font-family:var(--font-mono,monospace);font-size:11px;font-weight:600;color:'+outcomeColor+'">'+esc(outcomeLabel)+'</span></div>';
        if (e.actor_name) h += '<div style="font-family:var(--font-mono,monospace);font-size:11px;color:rgba(255,255,255,.35);margin-top:2px">By '+esc(e.actor_name)+'</div>';
        if (note) h += '<div style="font-family:var(--font-body);font-size:11px;color:rgba(240,246,255,.7);margin-top:3px;padding:3px 7px;background:rgba(255,255,255,.03);border-left:2px solid '+col+';line-height:1.45;word-break:break-word">'+esc(note.slice(0,180))+(note.length>180?'…':'')+'</div>';
        if (ts) h += '<div style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.25);margin-top:2px">'+ts.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+'</div>';
        h += '</div></div>';
        return h;
      }).join('');

  drawer.innerHTML = `
    <div class="cmp-panel-coc__header" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid rgba(0,210,255,.12);flex-shrink:0">
      <div>
        <div style="font-family:var(--font-mono,monospace);font-size:13px;font-weight:700;color:#F0F6FF;letter-spacing:.05em">Chain of Custody</div>
        <div style="font-family:var(--font-mono,monospace);font-size:11px;color:var(--text3);margin-top:1px">${evts.length} events</div>
      </div>
      <button onclick="toggleUserCoC()" style="background:none;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.4);width:26px;height:26px;cursor:pointer;font-size:13px;transition:all .1s"
        onmouseenter="this.style.color='#fff'" onmouseleave="this.style.color='rgba(255,255,255,.4)'">✕</button>
    </div>
    <div style="flex:1;overflow-y:auto">${rowsHtml}</div>`;

  document.body.appendChild(drawer);
  document.getElementById('nav-coc-btn').style.color = 'var(--compass-cyan)';
};