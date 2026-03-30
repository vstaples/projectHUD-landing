// cdn-tooltips.js — Cadence: step tooltips, history popup (hx), swimlane popup (sw)
// LOAD ORDER: 12th

function _getOrCreateTooltip() {
  let el = document.getElementById('coc-hover-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'coc-hover-tooltip';
    el.style.cssText = [
      'position:fixed',
      'z-index:9999',
      'width:380px',
      'max-height:420px',
      'background:#060a10',
      'border:1px solid rgba(0,210,255,0.28)',
      'border-radius:6px',
      'overflow:hidden',
      'pointer-events:none',
      'display:none',
      'flex-direction:column',
      'font-family:var(--font-body)',
      'box-shadow:0 8px 32px rgba(0,0,0,0.7)',
    ].join(';');
    document.body.appendChild(el);
  }
  return el;
}

function _showStepTooltip(stepId, event) {
  if (_tooltipStepId === stepId && _tooltipVisible) {
    _closeStepTooltip(); // toggle — click again to close
    return;
  }
  clearTimeout(_tooltipTimer);
  _renderStepTooltip(stepId, event);
}

function _hideStepTooltip(force) {
  if (_tooltipSticky && !force) return;  // sticky — ignore hover-away
  clearTimeout(_tooltipTimer);
  _tooltipTimer = setTimeout(() => {
    const el = document.getElementById('coc-hover-tooltip');
    if (el) { el.style.display = 'none'; el.style.pointerEvents = 'none'; }
    _tooltipVisible = false;
    _tooltipStepId  = null;
    _tooltipSticky  = false;
  }, 180);
}

function _closeStepTooltip() {
  _tooltipSticky = false;
  _hideStepTooltip(true);
}

function _renderStepTooltip(stepId, event) {
  const inst  = _selectedInstance;
  if (!inst) return;
  const step  = (inst._tmplSteps || []).find(s => s.id === stepId);
  if (!step)  return;
  const coc   = (inst._stepInsts || [])
    .filter(e => e.template_step_id === stepId &&
                 e.event_type !== 'step_reset' &&
                 e.event_type !== 'instance_launched')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (!coc.length) return;

  const stepInsts = inst._stepInsts || [];
  const reworkCount = stepInsts.filter(e => e.template_step_id === stepId && e.event_type === 'step_reset').length
    + stepInsts.filter(e => {
        if (e.event_type !== 'step_completed' || e.template_step_id !== stepId || !e.outcome) return false;
        const oDef = _getOutcomes(step).find(o => o.id === e.outcome);
        return !!(oDef?.requiresReset);
      }).length;

  const fmtTs = ts => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', {month:'short', day:'numeric'}) + ', ' +
           d.toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'});
  };

  const evtColor = type => ({
    step_completed: null,
    step_activated: '#00d2ff',
  }[type] || '#7a9bbf');

  const evtRows = coc.slice(0, 18).map(e => {
    const isRej = (() => {
      if (e.event_type !== 'step_completed' || !e.outcome) return false;
      const oDef = _getOutcomes(step).find(o => o.id === e.outcome);
      return !!(oDef?.requiresReset);
    })();
    const color = e.event_type === 'step_activated'
      ? '#00d2ff'
      : isRej ? '#E24B4A' : '#00e5a0';
    const icon  = e.event_type === 'step_activated'
      ? '●' : isRej ? '↩' : '✓';
    const label = e.event_type === 'step_activated'
      ? 'Activated'
      : isRej
        ? (_getOutcomes(step).find(o => o.id === e.outcome)?.label || 'Rejected')
        : (_getOutcomes(step).find(o => o.id === e.outcome)?.label || 'Completed');
    const actor = (e.actor_name && e.actor_name !== 'System')
      ? e.actor_name : 'System';
    const note  = (e.event_notes || '').trim();
    return `
      <div style="padding:7px 12px;border-bottom:1px solid rgba(100,160,220,0.06);
        display:flex;gap:8px;align-items:flex-start">
        <div style="width:7px;height:7px;border-radius:50%;background:${color};
          flex-shrink:0;margin-top:5px"></div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:${note?'3':'0'}px">
            <span style="font-family:var(--font-mono);font-size:10px;font-weight:700;
              color:${color}">${icon} ${escHtml(label)}</span>
            <span style="font-family:var(--font-mono);font-size:10px;color:#7a9bbf">
              ${escHtml(actor)}</span>
            <span style="font-family:var(--font-mono);font-size:10px;color:#3a5a7a;
              margin-left:auto;white-space:nowrap">${fmtTs(e.created_at)}</span>
          </div>
          ${note ? `<div style="font-size:11px;color:#c8dff0;line-height:1.5;
            font-style:italic;border-left:2px solid rgba(0,210,255,0.2);
            padding-left:6px;overflow:hidden;display:-webkit-box;
            -webkit-line-clamp:2;-webkit-box-orient:vertical">
            ${escHtml(note)}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  const more = coc.length > 18
    ? `<div style="padding:8px 12px;font-family:var(--font-mono);font-size:10px;
        text-align:center;border-top:1px solid rgba(100,160,220,0.06)">
        <button onclick="_renderStepTooltipAll('${stepId}')"
          style="background:none;border:1px solid rgba(0,210,255,0.25);
            color:#00d2ff;font-family:var(--font-mono);font-size:10px;
            padding:4px 16px;cursor:pointer;letter-spacing:0.1em;
            border-radius:3px;transition:all .15s"
          onmouseenter="this.style.background='rgba(0,210,255,0.08)'"
          onmouseleave="this.style.background='none'">
          &#9660; Show all ${coc.length - 18} more events
        </button>
      </div>`
    : '';

  const el = _getOrCreateTooltip();
  el.innerHTML = `
    <div style="padding:8px 12px;background:rgba(0,0,0,0.4);
      border-bottom:1px solid rgba(0,210,255,0.12);
      display:flex;align-items:center;gap:8px;flex-shrink:0">
      <div style="font-family:var(--font-ui);font-size:12px;font-weight:700;
        color:#eef4ff;letter-spacing:0.04em;flex:1;min-width:0;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        ${escHtml(step.name || 'Step')}
      </div>
      ${reworkCount ? `<div style="font-family:var(--font-mono);font-size:10px;
        color:#E24B4A;flex-shrink:0">\u21a9 ${reworkCount}\u00d7 rework</div>` : ''}
      <button onclick="_closeStepTooltip()"
        style="background:none;border:none;color:rgba(0,210,255,0.5);cursor:pointer;
          font-size:16px;line-height:1;padding:0 0 0 4px;flex-shrink:0;
          transition:color .15s"
        onmouseenter="this.style.color='#eef4ff'"
        onmouseleave="this.style.color='rgba(0,210,255,0.5)'"
        title="Close">&#10005;</button>
    </div>
    <div style="overflow-y:auto;flex:1">${evtRows}${more}</div>`;

  // Position tooltip — avoid viewport edges
  const TW = 380, TH = Math.min(420, 56 + coc.slice(0,18).length * 42);
  const vw = window.innerWidth, vh = window.innerHeight;
  let tx = event.clientX + 14;
  let ty = event.clientY - 20;
  if (tx + TW > vw - 10) tx = event.clientX - TW - 14;
  if (ty + TH > vh - 10) ty = vh - TH - 10;
  if (ty < 10) ty = 10;

  el.style.left         = tx + 'px';
  el.style.top          = ty + 'px';
  el.style.display      = 'flex';
  el.style.pointerEvents = 'auto';  // enable scroll immediately

  _tooltipVisible = true;
  _tooltipStepId  = stepId;
  _tooltipSticky  = true;  // sticky immediately — close only via X button
}

function _renderStepTooltipAll(stepId) {
  const inst = _selectedInstance;
  if (!inst) return;
  const step = (inst._tmplSteps || []).find(s => s.id === stepId);
  if (!step) return;

  // Re-render the scroll body with all events
  const el = document.getElementById('coc-hover-tooltip');
  if (!el) return;

  const coc = (inst._stepInsts || [])
    .filter(e => e.template_step_id === stepId &&
                 e.event_type !== 'step_reset' &&
                 e.event_type !== 'instance_launched')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const fmtTs = ts => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', {month:'short', day:'numeric'}) + ', ' +
           d.toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'});
  };

  const evtRows = coc.map(e => {
    const isRej = (() => {
      if (e.event_type !== 'step_completed' || !e.outcome) return false;
      const oDef = _getOutcomes(step).find(o => o.id === e.outcome);
      return !!(oDef?.requiresReset);
    })();
    const color = e.event_type === 'step_activated'
      ? '#00d2ff' : isRej ? '#E24B4A' : '#00e5a0';
    const icon  = e.event_type === 'step_activated' ? '\u25cf'
      : isRej ? '\u21a9' : '\u2713';
    const label = e.event_type === 'step_activated' ? 'Activated'
      : isRej ? (_getOutcomes(step).find(o => o.id === e.outcome)?.label || 'Rejected')
      : (_getOutcomes(step).find(o => o.id === e.outcome)?.label || 'Completed');
    const actor = (e.actor_name && e.actor_name !== 'System') ? e.actor_name : 'System';
    const note  = (e.event_notes || '').trim();
    return `<div style="padding:7px 12px;border-bottom:1px solid rgba(100,160,220,0.06);
        display:flex;gap:8px;align-items:flex-start">
        <div style="width:7px;height:7px;border-radius:50%;background:${color};
          flex-shrink:0;margin-top:5px"></div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:${note?'3':'0'}px">
            <span style="font-family:var(--font-mono);font-size:10px;font-weight:700;
              color:${color}">${icon} ${escHtml(label)}</span>
            <span style="font-family:var(--font-mono);font-size:10px;color:#7a9bbf">
              ${escHtml(actor)}</span>
            <span style="font-family:var(--font-mono);font-size:10px;color:#3a5a7a;
              margin-left:auto;white-space:nowrap">${fmtTs(e.created_at)}</span>
          </div>
          ${note ? `<div style="font-size:11px;color:#c8dff0;line-height:1.5;
            font-style:italic;border-left:2px solid rgba(0,210,255,0.2);
            padding-left:6px;overflow:hidden;display:-webkit-box;
            -webkit-line-clamp:2;-webkit-box-orient:vertical">
            ${escHtml(note)}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  // Replace just the scroll body
  const body = el.querySelector('div[style*="overflow-y:auto"]');
  if (body) body.innerHTML = evtRows;

  // Expand height to show more
  el.style.maxHeight = '80vh';
}

function _showConfDotTooltip(dot, clientX, clientY) {
  _hideConfDotTooltip();
  const confLabels = { green:'Confident', yellow:'Some uncertainty', red:'Concerned' };
  const confColors = { green:'#1D9E75',   yellow:'#e8a838',          red:'#E24B4A'  };
  const confIcons  = { green:'&#9679;',   yellow:'&#9679;',           red:'&#9679;' };
  const col   = confColors[dot.conf] || '#888';
  const label = confLabels[dot.conf] || dot.conf;
  const ts    = dot.ts ? new Date(dot.ts).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '';

  const tip = document.createElement('div');
  tip.style.cssText = `position:fixed;z-index:2002;background:var(--bg1);
    border:1px solid var(--border2);border-radius:7px;overflow:hidden;
    width:240px;pointer-events:none`;
  tip.innerHTML = `
    <div style="padding:6px 12px;background:var(--bg2);border-bottom:1px solid var(--border);
      display:flex;align-items:center;gap:7px">
      <span style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
        color:var(--muted)">Confidence signal</span>
    </div>
    <div style="padding:10px 12px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:14px;color:${col}">${confIcons[dot.conf]||'&#9679;'}</span>
        <span style="font-size:13px;font-weight:500;color:${col}">${label}</span>
      </div>
      <div style="font-size:11px;color:var(--text);line-height:1.5;margin-bottom:5px">
        ${dot.body ? `"${escHtml(dot.body.slice(0,80))}${dot.body.length>80?'…':''}"` : '<em style="color:var(--muted)">No comment text</em>'}
      </div>
      <div style="font-size:10px;color:var(--muted)">
        ${escHtml(dot.author)}${ts ? ' · ' + ts : ''}
      </div>
      <div style="font-size:9px;color:var(--muted);margin-top:6px;font-style:italic">
        Latest signal on ${escHtml(dot.stepName)}
      </div>
    </div>`;

  document.body.appendChild(tip);
  const tw = 240, th = tip.offsetHeight || 130;
  let px = clientX + 14, py = clientY - 20;
  if (px + tw > window.innerWidth  - 8) px = clientX - tw - 14;
  if (py + th > window.innerHeight - 8) py = window.innerHeight - th - 8;
  tip.style.left = px + 'px';
  tip.style.top  = py + 'px';
  _confTooltipEl = tip;

  // Auto-hide after 3s of no movement
  clearTimeout(_confTooltipTimer);
  _confTooltipTimer = setTimeout(_hideConfDotTooltip, 3000);
}

function _hideConfDotTooltip() {
  clearTimeout(_confTooltipTimer);
  if (_confTooltipEl) { _confTooltipEl.remove(); _confTooltipEl = null; }
}

function _hxShowPopup(cluster, clientX, clientY, inst) {
  clearTimeout(_historyHideTimer);
  const existingId = _historyPopup?.dataset?.stepId;
  if (existingId === cluster.stepId) return;
  _hxHidePopup(true);

  const heat     = cluster.heat;
  const level    = _heatLevel(heat.total);
  const cols     = HEAT_COLORS[level] || HEAT_COLORS.low;
  const stepName = heat.stepName
    || (inst?._tmplSteps||[]).find(s=>s.id===cluster.stepId)?.name
    || 'This step';

  const maxCount = Math.max(...Object.values(heat.byInstance), 1);
  const typeNote = heat.typeB > heat.typeA
    ? `<div style="font-size:9px;color:#8c50c8;padding:4px 12px 0;font-style:italic">
        &#8629; ${heat.typeB} reset${heat.typeB>1?'s':''} caused by upstream rejection/decline
       </div>`
    : heat.typeA > 0
    ? `<div style="font-size:9px;color:#b432dc;padding:4px 12px 0;font-style:italic">
        &#8629; ${heat.typeA} own failure${heat.typeA>1?'s':''} at this step
       </div>`
    : '';

  const popup = document.createElement('div');
  popup.dataset.stepId = cluster.stepId;
  popup.style.cssText = `position:fixed;z-index:2001;background:var(--bg1);
    border:1px solid var(--border2);border-radius:8px;overflow:hidden;width:280px;`;

  popup.innerHTML = `
    <div style="padding:7px 12px;background:var(--bg2);border-bottom:1px solid var(--border);
      font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${cols.text}">
      ${escHtml(stepName)} — ${heat.total} total rejections
    </div>
    ${typeNote}
    <div id="hx-popup-rows"></div>
    <div style="padding:5px 12px;font-size:9px;color:var(--muted);font-style:italic;
      background:var(--bg2);border-top:0.5px solid var(--border)">
      Hold 1.5s on any row to open Intelligence Briefing
    </div>`;

  // Build rows as DOM elements so we can attach dwell handlers
  const rowsEl = popup.querySelector('#hx-popup-rows');
  const dwellTimers = {};

  Object.entries(heat.byInstance).sort((a,b)=>b[1]-a[1]).forEach(([sibId, cnt]) => {
    const sib  = _instances.find(i=>i.id===sibId);
    const name = sib?.title || sibId.slice(0,8)+'…';
    const pct  = Math.round(cnt/maxCount*100);

    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:8px;padding:7px 12px;
      border-bottom:0.5px solid var(--border);cursor:pointer;
      position:relative;overflow:hidden;transition:background .12s`;

    row.innerHTML = `
      <div style="font-size:11px;font-weight:500;color:var(--text);flex:1;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(name)}</div>
      <div style="width:60px;height:5px;background:var(--border);border-radius:3px;flex-shrink:0">
        <div style="height:5px;border-radius:3px;background:${cols.stroke};width:${pct}%"></div>
      </div>
      <div style="font-size:10px;font-weight:700;color:${cols.text};white-space:nowrap">${cnt}&#215;</div>
      <div class="hx-row-dbar" style="position:absolute;bottom:0;left:0;height:2px;
        background:#b432dc;width:0;border-radius:0"></div>`;

    row.addEventListener('mouseenter', () => {
      row.style.background = 'rgba(180,50,220,.1)';
      row.querySelector('.hx-row-dbar').style.transition = 'none';
      row.querySelector('.hx-row-dbar').style.width = '0%';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        row.querySelector('.hx-row-dbar').style.transition = 'width 1.5s linear';
        row.querySelector('.hx-row-dbar').style.width = '100%';
      }));
      dwellTimers[sibId] = setTimeout(() => {
        _hxHidePopup(true);
        showIntelBriefing(sibId);
      }, 1500);
    });

    row.addEventListener('mouseleave', () => {
      row.style.background = 'transparent';
      const bar = row.querySelector('.hx-row-dbar');
      bar.style.transition = 'none'; bar.style.width = '0%';
      clearTimeout(dwellTimers[sibId]);
    });

    rowsEl.appendChild(row);
  });

  popup.addEventListener('mouseenter', () => clearTimeout(_historyHideTimer));
  popup.addEventListener('mouseleave', () => _hxStartHidePopup());

  document.body.appendChild(popup);
  const pw = 280, ph = popup.offsetHeight || 160;
  let px = clientX + 12, py = clientY - 20;
  if (px + pw > window.innerWidth  - 8) px = clientX - pw - 12;
  if (py + ph > window.innerHeight - 8) py = window.innerHeight - ph - 8;
  popup.style.left = px + 'px';
  popup.style.top  = py + 'px';
  _historyPopup = popup;
}

function _hxStartHidePopup() {
  clearTimeout(_historyHideTimer);
  _historyHideTimer = setTimeout(() => _hxHidePopup(false), 280);
}

function _hxHidePopup(immediate) {
  clearTimeout(_historyHideTimer);
  if (_historyPopup) {
    if (immediate) {
      _historyPopup.remove();
    } else {
      _historyPopup.style.transition = 'opacity .15s';
      _historyPopup.style.opacity = '0';
      setTimeout(() => _historyPopup?.remove(), 160);
    }
    _historyPopup = null;
  }
}

function _hxPopulatePanel(inst) {
  const body = document.getElementById('hx-info-body');
  if (!body) return;
  const heatMap  = _buildReworkHeatMap(inst);
  const steps    = (inst._tmplSteps||[]).filter(s=>s.step_type!=='trigger')
                     .sort((a,b)=>a.sequence_order-b.sequence_order);
  const maxTotal = Math.max(...Object.values(heatMap).map(h=>h.total), 1);

  body.innerHTML = steps.map(s => {
    const heat  = heatMap[s.id] || { total:0, typeA:0, typeB:0, byInstance:{}, stepName:s.name };
    heat.stepName = heat.stepName || s.name;
    const level = _heatLevel(heat.total);
    const cols  = HEAT_COLORS[level];
    const pct   = Math.round(heat.total / maxTotal * 100);
    const isBot = heat.total >= 10 && heat.total === maxTotal;

    const causeStr = heat.total === 0
      ? '<span style="color:var(--green);font-size:10px">&#10003; Clean — no rejections</span>'
      : heat.typeB > heat.typeA
      ? `<span style="font-size:10px;color:#8c50c8">&#8629; ${heat.typeB}&#215; upstream reset</span>`
      : `<span style="font-size:10px;color:#b432dc">&#8629; ${heat.typeA}&#215; own failure</span>`;

    const instLines = Object.entries(heat.byInstance).sort((a,b)=>b[1]-a[1])
      .map(([id, cnt]) => {
        const nm = _instances.find(i=>i.id===id)?.title || id.slice(0,8);
        return `<div style="font-size:10px;color:var(--muted)">${escHtml(nm.split('·')[0].trim())}: ${cnt}&#215;</div>`;
      }).join('');

    const heatDataAttr = encodeURIComponent(JSON.stringify({
      stepId: s.id, stepName: s.name,
      total: heat.total, typeA: heat.typeA, typeB: heat.typeB,
      byInstance: heat.byInstance
    }));

    return `<div
      data-step-id="${s.id}"
      data-heat="${heatDataAttr}"
      onclick="_hxCardClick('${s.id}')"
      onmouseenter="_hxCardHover(this, event)"
      onmouseleave="_hxCardLeave()"
      style="flex:1;min-width:160px;max-width:230px;background:var(--bg2);
        border:${heat.total>=10?'2px':'1px'} solid ${cols?cols.stroke:'var(--border)'};
        border-radius:6px;padding:10px 12px;cursor:pointer;transition:border-color .12s,background .12s;
        position:relative;overflow:hidden"
      onmousedown="this.style.background='var(--surf2)'"
      onmouseup="this.style.background='var(--bg2)'">
      <div class="hx-dbar" style="position:absolute;bottom:0;left:0;height:2px;
        background:#b432dc;width:0;border-radius:0;transition:none"></div>
      <div style="font-size:13px;font-weight:500;color:var(--text);margin-bottom:5px;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${isBot?`<span style="color:#b432dc">&#9650; </span>`:''}${escHtml(s.name||s.step_type)}
      </div>
      <div style="font-size:20px;font-weight:500;color:${cols?cols.text:'var(--green)'};margin-bottom:4px">
        ${heat.total}<span style="font-size:12px;color:var(--muted)">&#215;</span>
      </div>
      <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin-bottom:6px">
        <div style="height:4px;border-radius:2px;background:${cols?cols.stroke:'var(--green)'};width:${pct}%"></div>
      </div>
      <div style="margin-bottom:4px">${causeStr}</div>
      ${instLines}
    </div>`;
  }).join('');
}

function _hxCardClick(stepId) {
  // Flash-highlight the node on the DAG canvas for 2.5s
  clearTimeout(_hxHighlightTimer);
  _hxHighlightStep = stepId;
  const inst = _selectedInstance;
  if (inst) renderInstanceDAG(inst);
  _hxHighlightTimer = setTimeout(() => {
    _hxHighlightStep = null;
    if (_selectedInstance) renderInstanceDAG(_selectedInstance);
  }, 2500);
}

function _hxCardHover(el, event) {
  clearTimeout(_hxCardDwellTimer);
  // Animate a dwell bar if present
  const bar = el.querySelector('.hx-dbar');
  if (bar) {
    bar.style.transition = 'none'; bar.style.width = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bar.style.transition = 'width 1.5s linear'; bar.style.width = '100%';
    }));
  }
  _hxCardDwellTimer = setTimeout(() => {
    try {
      const heatData = JSON.parse(decodeURIComponent(el.dataset.heat));
      const cluster  = {
        stepId: heatData.stepId,
        heat: {
          total: heatData.total, typeA: heatData.typeA, typeB: heatData.typeB,
          byInstance: heatData.byInstance, stepName: heatData.stepName,
        },
      };
      _hxShowPopup(cluster, event.clientX, event.clientY, _selectedInstance);
    } catch(e) {}
  }, 1500);
}

function _hxCardLeave() {
  clearTimeout(_hxCardDwellTimer);
  _hxStartHidePopup();
}

function _swPopulateInfoPanel(inst) {
  const body = document.getElementById('sw-info-body');
  if (!body) return;

  const all = _instances.filter(i =>
    i.template_id === inst.template_id &&
    (i.status === 'in_progress' || i.status === 'complete')
  );

  body.innerHTML = all.map(i => {
    const isSel    = i.id === inst.id;
    const health   = i.status === 'complete' ? 'completed' : _instanceHealth(i);
    const dotCol   = health==='completed' ? '#26e8a0'
                   : health==='red'       ? '#ff5f6b'
                   : health==='gray'      ? '#6a8aaa'
                   : '#00d2ff';
    const dotStyle = isSel
      ? 'border:1.5px solid #fff;background:transparent'
      : `background:${dotCol}`;

    const stepName = i.status==='complete'
      ? 'Completed'
      : (i.current_step_name || 'Unknown step');

    let elapsed = '—';
    if (i.launched_at) {
      const ms = Date.now() - new Date(i.launched_at);
      const m=Math.floor(ms/60000), h=Math.floor(m/60), d=Math.floor(h/24);
      elapsed = d>0?`${d}d ${h%24}h`:h>0?`${h}h ${m%60}m`:`${m}m`;
    }

    const rework = (i._stepInsts||[]).filter(e => {
      if (e.event_type==='step_reset') return true;
      if (e.event_type==='step_completed' && e.outcome) {
        const s=(i._tmplSteps||[]).find(s=>s.id===e.template_step_id);
        const o=s?_getOutcomes(s).find(o=>o.id===e.outcome):null;
        return o?.requiresReset;
      }
      return false;
    }).length;

    return `<div onclick="showIntelBriefing('${i.id}')"
      style="flex:1;min-width:180px;max-width:260px;background:var(--bg2);
        border:1px solid ${isSel?'#00d2ff':'var(--border)'};border-radius:6px;
        padding:10px 12px;cursor:pointer;transition:border-color .12s"
      onmouseenter="this.style.borderColor='#00d2ff'"
      onmouseleave="this.style.borderColor='${isSel?'#00d2ff':'var(--border)'}'"
    >
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:6px">
        <div style="width:9px;height:9px;border-radius:50%;flex-shrink:0;${dotStyle}"></div>
        <div style="font-size:11px;font-weight:500;color:var(--text);flex:1;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${escHtml(i.title||'Untitled')}
        </div>
        ${isSel?'<span style="font-size:8px;font-weight:700;letter-spacing:.06em;color:#00d2ff;padding:1px 5px;border:0.5px solid #00d2ff;border-radius:3px">YOU</span>':''}
      </div>
      <div style="font-size:10px;color:var(--muted);margin-bottom:3px">${escHtml(stepName)}</div>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:10px;color:var(--muted)">${elapsed}</span>
        ${rework>0?`<span style="font-size:9px;font-weight:700;color:#ff5f6b">&#8629; ${rework}\u00d7</span>`:''}
        ${i.status==='complete'?'<span style="font-size:9px;font-weight:500;color:#26e8a0">&#10003; Done</span>':''}
      </div>
    </div>`;
  }).join('');
}

async function _swLoadSiblingData(inst) {
  if (!inst) return;
  const siblings = _instances.filter(i =>
    i.template_id === inst.template_id &&
    i.id          !== inst.id &&
    (i.status === 'in_progress' || i.status === 'complete')
  );
  for (const sib of siblings) {
    if (sib._stepInsts) continue; // already loaded
    try {
      const [stepInsts, tmplSteps] = await Promise.all([
        API.get(`workflow_step_instances?instance_id=eq.${sib.id}&order=created_at.asc,id.asc`).catch(()=>[]),
        sib._tmplSteps ? Promise.resolve(null) : (
          API.get(`workflow_template_steps?template_id=eq.${inst.template_id}&order=sequence_order.asc`).catch(()=>[])
        ),
      ]);
      sib._stepInsts = stepInsts || [];
      if (tmplSteps) sib._tmplSteps = tmplSteps.map(s=>({...s,
        _attachedDocs: (s.attached_docs||[]).map(d=>({name:d.name,path:d.path||null,url:d.url||null})),
        _meetingAgenda: Array.isArray(s.meeting_agenda)?s.meeting_agenda:[],
      }));
    } catch(e) {
      console.warn('Swimlane: failed to load sibling CoC for', sib.id, e);
    }
  }
  // Re-render clusters and panels now that health data is available
  if (_selectedInstance?.id === inst.id) {
    if (_swimlaneActive || _historyActive) renderInstanceDAG(inst);
    if (_swimlaneActive) { _swUpdateBottleneckBanner(inst); _swPopulateInfoPanel(inst); }
    if (_historyActive)  { _hxPopulatePanel(inst); }
  }
}

function _swCanvasCoords(e, wrap) {
  const r = wrap.getBoundingClientRect();
  return {
    mx: (e.clientX - r.left  - _instDagPanX) / _instDagScale,
    my: (e.clientY - r.top   - _instDagPanY) / _instDagScale,
    cx: e.clientX, cy: e.clientY,
  };
}

function _swShowPopup(cluster, clientX, clientY, wrap) {
  clearTimeout(_swimlaneHideTimer);
  const existingId = _swimlanePopup?.dataset?.clusterId;
  if (existingId === cluster.stepId) return; // already showing for this cluster
  _swHidePopup(true);

  const popup = document.createElement('div');
  popup.dataset.clusterId = cluster.stepId;
  popup.style.cssText = `
    position:fixed;z-index:2000;
    background:var(--bg1);border:1px solid var(--border2);border-radius:8px;
    overflow:hidden;width:270px;
    box-shadow:0 8px 24px rgba(0,0,0,.5)`;

  // Header
  const stepName = cluster.siblings[0]?.current_step_name || 'This step';
  const hdr = document.createElement('div');
  hdr.style.cssText = 'padding:7px 12px;background:var(--bg2);border-bottom:1px solid var(--border);font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)';
  hdr.textContent = `${cluster.siblings.length} instance${cluster.siblings.length>1?'s':''} · ${stepName}`;
  popup.appendChild(hdr);

  // Rows
  cluster.siblings.forEach(sib => {
    const health = _instanceHealth(sib);
    const col    = _SW_DOT_COLORS[health] || _SW_DOT_COLORS.gray;
    const coc    = sib._stepInsts || [];
    const rework = coc.filter(e => {
      if (e.event_type === 'step_reset') return true;
      if (e.event_type === 'step_completed' && e.template_step_id === sib.current_step_id) {
        const step = (sib._tmplSteps||[]).find(s=>s.id===e.template_step_id);
        const out  = step ? _getOutcomes(step).find(o=>o.id===e.outcome) : null;
        return out?.requiresReset;
      }
      return false;
    }).length;

    // Elapsed at current step
    const activEvt = coc.slice().reverse().find(e =>
      e.event_type==='step_activated' && e.template_step_id===sib.current_step_id);
    let elapsed = '—';
    if (activEvt?.created_at) {
      const ms = Date.now() - new Date(activEvt.created_at);
      const m=Math.floor(ms/60000), h=Math.floor(m/60), d=Math.floor(h/24);
      elapsed = d>0 ? `${d}d ${h%24}h` : h>0 ? `${h}h ${m%60}m` : `${m}m`;
    }

    const prio = sib.priority || 'normal';
    const prioHtml = prio==='critical'
      ? `<span style="font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;color:#E24B4A;border:0.5px solid rgba(226,75,74,.4)">CRIT</span>`
      : prio==='important'
      ? `<span style="font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;color:var(--amber);border:0.5px solid rgba(232,168,56,.4)">HIGH</span>`
      : '';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 12px;cursor:pointer;border-bottom:0.5px solid var(--border);position:relative;overflow:hidden;transition:background .12s';
    row.innerHTML = `
      <div style="width:9px;height:9px;border-radius:50%;background:${col};flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div class="sw-rname" style="font-size:11px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .1s">${escHtml(sib.title||'Untitled')}</div>
        <div style="font-size:10px;color:var(--muted)">${elapsed}</div>
      </div>
      ${rework>0?`<span style="font-size:9px;font-weight:700;color:#E24B4A">↩ ${rework}×</span>`:''}
      ${prioHtml}
      <div class="sw-dbar" style="position:absolute;bottom:0;left:0;height:2px;background:var(--cad);width:0;border-radius:0"></div>`;

    row.addEventListener('mouseenter', () => {
      row.style.background = 'rgba(232,168,56,.1)';
      row.querySelector('.sw-rname').style.color = 'var(--cad)';
      _swStartDwell(row, sib.id);
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = 'transparent';
      row.querySelector('.sw-rname').style.color = 'var(--text)';
      _swCancelDwell(row);
    });
    popup.appendChild(row);
  });

  // "Hold 1.5s" hint
  const hint = document.createElement('div');
  hint.style.cssText = 'padding:5px 12px;font-size:9px;color:var(--muted);font-style:italic;background:var(--bg2)';
  hint.textContent = 'Hold 1.5s on any row to open Intelligence Briefing';
  popup.appendChild(hint);

  // Keep popup alive when cursor is over it
  popup.addEventListener('mouseenter', () => clearTimeout(_swimlaneHideTimer));
  popup.addEventListener('mouseleave', () => _swStartHidePopup());

  // Position near cluster — prefer below-right, flip if off-screen
  document.body.appendChild(popup);
  const pw = 270, ph = popup.offsetHeight || 200;
  let px = clientX + 12, py = clientY - 20;
  if (px + pw > window.innerWidth  - 8) px = clientX - pw - 12;
  if (py + ph > window.innerHeight - 8) py = window.innerHeight - ph - 8;
  popup.style.left = px + 'px';
  popup.style.top  = py + 'px';

  _swimlanePopup = popup;
}

function _swStartHidePopup() {
  clearTimeout(_swimlaneHideTimer);
  _swimlaneHideTimer = setTimeout(() => _swHidePopup(false), 280);
}

function _swHidePopup(immediate) {
  clearTimeout(_swimlaneHideTimer);
  _swCancelDwell(null);
  if (_swimlanePopup) {
    if (immediate) {
      _swimlanePopup.remove();
    } else {
      _swimlanePopup.style.transition = 'opacity .15s';
      _swimlanePopup.style.opacity = '0';
      setTimeout(() => _swimlanePopup?.remove(), 160);
    }
    _swimlanePopup = null;
  }
}

function _swStartDwell(row, instId) {
  _swCancelDwell(null); // cancel any prior dwell
  _swimlaneDwellRow = row;
  const bar = row.querySelector('.sw-dbar');
  if (bar) {
    bar.style.transition = 'none';
    bar.style.width = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bar.style.transition = 'width 1.6s linear';
      bar.style.width = '100%';
    }));
  }
  _swimlaneDwellTimer = setTimeout(() => {
    _swHidePopup(true);
    showIntelBriefing(instId);
  }, 1600);
}

function _swCancelDwell(row) {
  clearTimeout(_swimlaneDwellTimer);
  _swimlaneDwellTimer = null;
  const target = row || _swimlaneDwellRow;
  if (target) {
    const bar = target.querySelector('.sw-dbar');
    if (bar) { bar.style.transition = 'none'; bar.style.width = '0%'; }
  }
  _swimlaneDwellRow = null;
}

function _swUpdateBottleneckBanner(inst) {
  const banner  = document.getElementById('sw-bottleneck-banner');
  const textEl  = document.getElementById('sw-bottleneck-text');
  if (!banner || !textEl) return;

  if (!_swimlaneActive || !inst) {
    banner.style.display = 'none';
    return;
  }

  const siblings = _instances.filter(i =>
    i.template_id === inst.template_id &&
    i.id          !== inst.id &&
    i.status      === 'in_progress' &&
    i.current_step_id
  );
  const total = siblings.length + 1; // include current instance

  // Group by step
  const byStep = {};
  siblings.forEach(s => {
    byStep[s.current_step_id] = (byStep[s.current_step_id]||0) + 1;
  });

  // Find step with most siblings (check if current instance is also there)
  const instActiveStep = (inst._stepInsts||[]).slice().reverse()
    .find(e=>e.event_type==='step_activated');
  if (instActiveStep) {
    byStep[instActiveStep.template_step_id] =
      (byStep[instActiveStep.template_step_id]||0) + 1;
  }

  const maxEntry = Object.entries(byStep).sort((a,b)=>b[1]-a[1])[0];
  if (!maxEntry) { banner.style.display='none'; return; }

  const [stepId, count] = maxEntry;
  const pct = count / Math.max(total, 1);

  if (pct < 0.4 || count < 2) {
    banner.style.display = 'none';
    return;
  }

  const stepName = siblings.find(s=>s.current_step_id===stepId)?.current_step_name
    || (inst._tmplSteps||[]).find(s=>s.id===stepId)?.name
    || 'a step';

  textEl.innerHTML = `<strong>Bottleneck detected</strong> — ${count} of ${total} instances clustered at <strong>${escHtml(stepName)}</strong>`;
  banner.style.display = 'flex';
}