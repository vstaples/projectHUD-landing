// ── Action item negotiation state badges ──────────────────
// Renders a negotiation state badge inline on work item rows
window.getNegotiationBadgeHtml = function(state) {
  const cfg = {
    unrated:     { label:'Unrated', style:'border:1px dashed rgba(255,255,255,.2);color:rgba(255,255,255,.35);background:rgba(255,255,255,.03)' },
    pending:     { label:'Pending agreement', style:'border:1px dashed rgba(239,159,39,.4);color:#EF9F27;background:rgba(239,159,39,.06)' },
    negotiating: { label:'Negotiating', style:'border:1px solid rgba(139,92,246,.4);color:#8B5CF6;background:rgba(139,92,246,.07)' },
    agreed:      { label:'Agreed \u00B7 locked', style:'border:1px solid rgba(29,158,117,.4);color:#1D9E75;background:rgba(29,158,117,.07)' },
    escalated:   { label:'Escalated', style:'border:1px solid rgba(226,75,74,.4);color:#E24B4A;background:rgba(226,75,74,.07)' },
  };
  const c = cfg[state] || cfg.unrated;
  return `<span style="font-family:var(--font-head);font-size:10px;padding:1px 7px;letter-spacing:.05em;${c.style}">${c.label}</span>`;
};

// ── Action item negotiation — state engine ────────────────
// Negotiation state persisted in workflow_action_items.negotiation_state (jsonb)
// In-memory cache: window._negStateCache = { [itemId]: stateObj }
// States: 'unrated' | 'pending' | 'negotiating' | 'agreed' | 'escalated'

window._negStateCache = window._negStateCache || {};

window.negGetState = function(itemId) {
  // 1. Check in-memory cache first (populated from DB on load)
  if (window._negStateCache[itemId]) return window._negStateCache[itemId];
  // 2. Fall back to DB data in myActionItems
  const ai = (window.myActionItems||[]).find(a=>a.id===itemId);
  if (ai?.negotiation_state) {
    window._negStateCache[itemId] = ai.negotiation_state;
    return ai.negotiation_state;
  }
  // 3. Default unrated
  return { state: 'unrated', thread: [] };
};

window.negSaveState = function(itemId, data) {
  // Update in-memory cache immediately
  window._negStateCache[itemId] = data;
  // Update myActionItems cache so row borders re-render correctly
  const ai = (window.myActionItems||[]).find(a=>a.id===itemId);
  if (ai) ai.negotiation_state = data;
  // Persist to Supabase async — no await, fire and forget
  API.patch(`workflow_action_items?id=eq.${itemId}`, {
    negotiation_state: data
  }).catch(e => console.warn('[Compass] negSaveState write failed:', e));
};

window.negRowBorderStyle = function(itemId) {
  const s = negGetState(itemId).state;
  if (s === 'unrated')     return 'border-left:3px dashed rgba(255,255,255,.2)';
  if (s === 'pending')     return 'border-left:3px dashed rgba(239,159,39,.5)';
  if (s === 'negotiating') return 'border-left:3px solid rgba(139,92,246,.6)';
  if (s === 'agreed')      return 'border-left:3px solid rgba(29,158,117,.5)';
  if (s === 'escalated')   return 'border-left:3px solid rgba(226,75,74,.5)';
  return '';
};

// Write a CoC event for negotiation milestone
window.negWriteCoCEvent = async function(itemId, eventNotes, actorName) {
  const now   = new Date().toISOString();
  // CoC.write() handles identity, optimistic cache, and persist
  const written = await window.CoC.write('negotiation.loe_proposed', itemId, {
    entityType: 'action_item',
    stepName:   'LOE negotiation',
    notes:      eventNotes,
    outcome:    'on_track',
    actorName:  actorName || null,
  });
  if (written) _negRefreshModalCoC(itemId);
};

// Refresh the CoC column in the open work item modal for a given item
function _negRefreshModalCoC(itemId) {
  const panel = document.querySelector(`.wi-expanded[data-wi-id="${itemId}"]`);
  if (!panel) return;
  // Re-compute events for this item
  const _itemInstIds = new Set((window._wfInstances||[]).filter(w=>w.task_id===itemId).map(w=>w.id));
  const _aiInst = (window.myActionItems||[]).find(a=>a.id===itemId)?.instance_id;
  if (_aiInst) _itemInstIds.add(_aiInst);
  const evts = (window._myCocEvents||[]).filter(e=>
    e.entity_id === itemId ||
    _itemInstIds.has(e.entity_id) ||
    _itemInstIds.has(e.instance_id)
  );
  const _evtColor={instance_launched:'#00D2FF',instance_completed:'#1D9E75',step_activated:'#e8a838',
    step_completed:'#1D9E75',step_action:'#00D2FF',step_reset:'#E24B4A',
    management_decision:'#EF9F27',intervention:'#8B5CF6'};
  const _evtLabel={instance_launched:'Launched',instance_completed:'Completed',step_activated:'Activated',
    step_completed:'Step done',step_action:'Action',step_reset:'Reset',
    management_decision:'Decision',intervention:'Intervention'};
  const _E=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const cocHtml = evts.length ? evts.map((e,i)=>{
    const col=_evtColor[e.event_type]||'#5A84A8';
    const lbl=_evtLabel[e.event_type]||e.event_type.replace(/_/g,' ');
    const step=(e.step_name||'').replace(/^CONCERN:\s*/,'');
    const note=e.event_notes||'';
    const ts=e.created_at?new Date(e.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
    let h='<div style="display:flex;gap:6px;margin-bottom:8px">';
    h+='<div style="display:flex;flex-direction:column;align-items:center;width:10px;flex-shrink:0">';
    h+='<div style="width:6px;height:6px;border-radius:50%;background:'+col+';margin-top:2px;flex-shrink:0"></div>';
    if(i<evts.length-1) h+='<div style="width:1px;flex:1;min-height:8px;background:rgba(255,255,255,.08);margin-top:2px"></div>';
    h+='</div><div style="flex:1;min-width:0">';
    h+='<div style="font-family:var(--font-head);font-size:11px;font-weight:700;color:'+col+'">'+_E(lbl)+'</div>';
    if(step) h+='<div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.4);margin-top:1px">&rarr; '+_E(step.slice(0,40))+'</div>';
    if(e.actor_name) h+='<div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.3)">By '+_E(e.actor_name)+'</div>';
    if(note) h+='<div style="font-family:var(--font-body);font-size:11px;color:rgba(240,246,255,.65);margin-top:2px;padding:2px 6px;background:rgba(255,255,255,.03);border-left:2px solid '+col+';line-height:1.4;word-break:break-word">'+_E(note.slice(0,120))+'</div>';
    if(ts) h+='<div style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.2);margin-top:1px">'+ts+'</div>';
    h+='</div></div>';
    return h;
  }).join('') : '<div style="font-family:var(--font-head);font-size:11px;color:var(--text3);line-height:1.6">No CoC history for this item yet.</div>';
  // Find and update the CoC column header count + body
  const cocCol = panel.querySelector('[data-coc-col]');
  if (cocCol) {
    const countEl = cocCol.querySelector('[data-coc-count]');
    const bodyEl  = cocCol.querySelector('[data-coc-body]');
    if (countEl) countEl.textContent = 'Chain of Custody (' + evts.length + ')';
    if (bodyEl)  bodyEl.innerHTML = cocHtml;
  }
}

// ── Render the full negotiation panel (injected into the action item modal) ──
window.renderNegPanel = function(itemId, assignerName) {
  const neg = negGetState(itemId);
  const s   = neg.state;
  const el  = document.getElementById('neg-panel-' + itemId);
  if (!el) return;

  const fmtTs = iso => iso ? new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '';

  // ── Clock countdown (24h from submitted_at) ──────────────
  const clockHtml = (startIso, label) => {
    if (!startIso) return '';
    const deadline = new Date(startIso).getTime() + 24*60*60*1000;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return `<div style="display:flex;align-items:center;gap:7px;padding:6px 10px;background:rgba(239,159,39,.05);border:1px solid rgba(239,159,39,.2);margin-bottom:8px"><div style="width:7px;height:7px;border-radius:50%;background:#EF9F27;flex-shrink:0"></div><span style="font-family:var(--font-head);font-size:11px;color:rgba(239,159,39,.8);flex:1">${label}</span><span style="font-family:var(--font-head);font-size:13px;font-weight:700;color:#EF9F27">Auto-accepted</span></div>`;
    const h = Math.floor(remaining/3600000), m = Math.floor((remaining%3600000)/60000);
    return `<div style="display:flex;align-items:center;gap:7px;padding:6px 10px;background:rgba(239,159,39,.05);border:1px solid rgba(239,159,39,.2);margin-bottom:8px"><div style="width:7px;height:7px;border-radius:50%;background:#EF9F27;animation:myrActivePulse 1.5s infinite;flex-shrink:0"></div><span style="font-family:var(--font-head);font-size:11px;color:rgba(239,159,39,.8);flex:1">${label}</span><span style="font-family:var(--font-head);font-size:13px;font-weight:700;color:#EF9F27">${h}h ${m}m</span></div>`;
  };

  // ── Action zone by state ──────────────────────────────────
  let actionZone = '';
  const myName = _myResource?.name || 'Me';

  if (s === 'unrated') {
    actionZone = `
      <div style="font-family:var(--font-head);font-size:11px;letter-spacing:.08em;color:#00D2FF;text-transform:uppercase;margin-bottom:7px">Rate this action item</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:7px">
        <span style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.6)">Effort Estimate (hrs):</span>
        <input id="neg-loe-${itemId}" type="number" min="0.25" max="999" step="0.25" placeholder="0.0"
          style="width:60px;font-family:var(--font-display);font-size:14px;font-weight:700;padding:3px 4px;background:#0a1525;border:1px solid rgba(0,210,255,.2);color:var(--compass-cyan);outline:none;text-align:center"
          oninput="negCheckSubmitGate('${itemId}')" />
        <span style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.6)">Proposed Due Date:</span>
        <input id="neg-due-${itemId}" type="date" style="padding:4px 8px;background:#1a2a40;border:1px solid rgba(0,210,255,.2);color:#C8DFF0;font-family:var(--font-head);font-size:11px;outline:none" onchange="negCheckSubmitGate('${itemId}')"/>
      </div>
      <textarea id="neg-comment-${itemId}" rows="3" placeholder="Required: explain your LOE — what does this involve, why will it take this long, what constraints apply? (min 20 chars)"
        style="width:100%;padding:6px 9px;background:rgba(255,255,255,.04);border:1px solid rgba(0,210,255,.3);color:#F0F6FF;font-family:var(--font-body);font-size:11px;outline:none;resize:none;margin-bottom:4px;box-sizing:border-box"
        oninput="negCheckSubmitGate('${itemId}')"></textarea>
      <div style="font-family:var(--font-head);font-size:11px;color:var(--text3);margin-bottom:7px">Comment is required and becomes a permanent CoC record.</div>
      <div style="display:flex;gap:6px;align-items:center">
        <button onclick="negCheckSubmitGate('${itemId}');negSubmitRating('${itemId}')" id="neg-submit-${itemId}"
          style="font-family:var(--font-head);font-size:11px;padding:5px 14px;background:rgba(0,210,255,.08);border:1px solid rgba(0,210,255,.3);color:#00D2FF;cursor:not-allowed;letter-spacing:.06em;opacity:.5" disabled>Submit rating →</button>
        <span style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.2)">Assigner will be notified</span>
      </div>`;
  } else if (s === 'pending') {
    actionZone = `
      <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.35);line-height:1.6;margin-bottom:7px">
        Your LOE rating has been submitted. <strong style="color:#EF9F27">${assignerName||'The assigner'}</strong> has 24h to respond before your proposed date is auto-accepted.
      </div>
      <textarea id="neg-addupdate-${itemId}" rows="2" placeholder="Add a follow-up comment to the thread (optional)..."
        style="width:100%;padding:6px 9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#C8DFF0;font-family:var(--font-body);font-size:11px;outline:none;resize:none;margin-bottom:7px;box-sizing:border-box"></textarea>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button onclick="negAddThreadUpdate('${itemId}')" style="font-family:var(--font-head);font-size:11px;padding:5px 13px;background:rgba(0,210,255,.08);border:1px solid rgba(0,210,255,.3);color:#00D2FF;cursor:pointer;letter-spacing:.06em">Add to thread →</button>
        <button onclick="negEscalate('${itemId}')" style="font-family:var(--font-head);font-size:11px;padding:5px 13px;background:none;border:1px solid rgba(226,75,74,.35);color:#E24B4A;cursor:pointer;letter-spacing:.06em">Escalate to PM</button>
        <button onclick="negReviseRating('${itemId}')" style="font-family:var(--font-head);font-size:11px;padding:5px 13px;background:none;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.4);cursor:pointer;letter-spacing:.06em">Revise my rating</button>
      </div>`;
  } else if (s === 'negotiating') {
    const counter = (neg.thread||[]).filter(m=>m.role==='assigner').slice(-1)[0];
    actionZone = `
      <div style="font-family:var(--font-head);font-size:11px;color:rgba(139,92,246,.8);line-height:1.6;padding:6px 9px;background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.18);border-left:2px solid #8B5CF6;margin-bottom:8px">
        ${esc(assignerName||'Assigner')} has countered — your response required within 24h.
      </div>
      <textarea id="neg-response-${itemId}" rows="2" placeholder="Your response — accept, counter, or explain further..."
        style="width:100%;padding:6px 9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#C8DFF0;font-family:var(--font-body);font-size:11px;outline:none;resize:none;margin-bottom:7px;box-sizing:border-box"></textarea>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:5px">
        <button onclick="negAcceptCounter('${itemId}')" style="font-family:var(--font-head);font-size:11px;padding:5px 13px;background:rgba(29,158,117,.08);border:1px solid rgba(29,158,117,.4);color:#1D9E75;cursor:pointer;letter-spacing:.06em">Accept counter ✓</button>
        <button onclick="negSubmitCounter('${itemId}')" style="font-family:var(--font-head);font-size:11px;padding:5px 13px;background:none;border:1px solid rgba(239,159,39,.35);color:#EF9F27;cursor:pointer;letter-spacing:.06em">Submit new counter</button>
        <button onclick="negEscalate('${itemId}')" style="font-family:var(--font-head);font-size:11px;padding:5px 13px;background:none;border:1px solid rgba(226,75,74,.35);color:#E24B4A;cursor:pointer;letter-spacing:.06em">Escalate to PM</button>
      </div>`;
  } else if (s === 'agreed') {
    actionZone = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <div style="padding:6px 10px;background:rgba(29,158,117,.07);border:1px solid rgba(29,158,117,.25);font-family:var(--font-head);font-size:11px;color:#1D9E75">LOE: ${esc(neg.agreedLoe||'—')}</div>
        <div style="padding:6px 10px;background:rgba(29,158,117,.07);border:1px solid rgba(29,158,117,.25);font-family:var(--font-head);font-size:11px;color:#1D9E75">Due: ${esc(neg.agreedDue||'—')}</div>
        <div style="padding:6px 10px;background:rgba(29,158,117,.07);border:1px solid rgba(29,158,117,.25);font-family:var(--font-head);font-size:11px;color:#1D9E75">Agreed: ${fmtTs(neg.lockedAt)}</div>
      </div>
      <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.3);margin-bottom:8px;line-height:1.55">Thread permanently locked. CoC record immutable. To renegotiate, raise a new concern.</div>
      <div style="display:flex;gap:6px">
        <button onclick="compassToast('Renegotiation concern opened.');negEscalate('${itemId}')" style="font-family:var(--font-head);font-size:11px;padding:5px 13px;background:none;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.4);cursor:pointer;letter-spacing:.06em">Raise renegotiation concern</button>
      </div>`;
  } else if (s === 'escalated') {
    actionZone = `
      <div style="font-family:var(--font-head);font-size:11px;color:rgba(226,75,74,.7);padding:7px 10px;background:rgba(226,75,74,.05);border:1px solid rgba(226,75,74,.2);border-left:2px solid #E24B4A;margin-bottom:8px;line-height:1.55">
        Escalated to PM. Full thread forwarded. PM has 24h to issue a binding decision.
      </div>
      <button onclick="compassToast('Context added to escalation thread.')" style="font-family:var(--font-head);font-size:11px;padding:5px 13px;background:none;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.4);cursor:pointer;letter-spacing:.06em">Add context for PM</button>`;
  }

  const stateFlowHtml = `
    <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:10px">
      ${[['unrated','rgba(255,255,255,.2)','rgba(255,255,255,.35)','Unrated'],
         ['pending','rgba(239,159,39,.4)','#EF9F27','Pending agreement'],
         ['negotiating','rgba(139,92,246,.4)','#8B5CF6','Under negotiation'],
         ['agreed','rgba(29,158,117,.4)','#1D9E75','Agreed · locked'],
        ].map(([st, bc, tc, lbl]) =>
          `<span style="font-family:var(--font-head);font-size:11px;padding:3px 10px;border:1px solid ${bc};color:${tc};border-radius:20px;${s===st?'font-weight:700;':'opacity:.5'}">${lbl}</span><span style="font-size:11px;color:rgba(255,255,255,.2)">→</span>`
        ).join('').replace(/→$/, '')}
    </div>`;

  const clockSection = s === 'pending' ? clockHtml(neg.submittedAt, 'Assigner response window — auto-accepted if no response')
                     : s === 'negotiating' ? clockHtml(neg.counterReceivedAt, 'Assignee response window')
                     : '';

  // Thread in descending order (newest first)
  const threadDesc = [...(neg.thread||[])].reverse();
  const threadDescHtml = threadDesc.map(msg => {
    const isSystem = msg.role === 'system';
    const isAssigner = msg.role === 'assigner';
    const bubbleCls = isSystem
      ? 'background:rgba(29,158,117,.04);border:1px solid rgba(29,158,117,.2);color:rgba(29,158,117,.9);font-size:11px'
      : isAssigner
        ? 'background:rgba(0,210,255,.04);border:1px solid rgba(0,210,255,.18)'
        : 'background:rgba(139,92,246,.04);border:1px solid rgba(139,92,246,.2)';
    const avBg = isSystem ? 'background:rgba(29,158,117,.15);color:#1D9E75' : isAssigner ? 'background:rgba(0,210,255,.15);color:#00D2FF' : 'background:rgba(139,92,246,.15);color:#8B5CF6';
    const avLabel = isSystem ? '✓' : (msg.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    return `<div style="display:flex;gap:8px;margin-bottom:8px">
      <div style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;margin-top:2px;${avBg}">${avLabel}</div>
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.35);margin-bottom:3px">${esc(msg.name||'')} <span style="font-size:10px;color:rgba(255,255,255,.2)">${fmtTs(msg.ts)}</span></div>
        <div style="font-family:var(--font-body);font-size:12px;color:rgba(240,246,255,.8);line-height:1.6;padding:8px 10px;${bubbleCls}">${esc(msg.text||'')}${msg.loe?`<div style="display:flex;gap:6px;margin-top:6px"><span style="font-family:var(--font-head);font-size:11px;padding:2px 8px;border:1px solid rgba(139,92,246,.3);background:rgba(139,92,246,.06);color:#8B5CF6">LOE: ${esc(msg.loe)}</span><span style="font-family:var(--font-head);font-size:11px;padding:2px 8px;border:1px solid rgba(139,92,246,.3);background:rgba(139,92,246,.06);color:#8B5CF6">Proposed due: ${esc(msg.proposedDue||'')}</span></div>`:''}${msg.comment?`<div style="margin-top:5px;padding:4px 8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(240,246,255,.65);line-height:1.5">${esc(msg.comment)}</div>`:''}</div>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="font-family:var(--font-head);font-size:11px;letter-spacing:.1em;color:#00D2FF;text-transform:uppercase;margin-bottom:10px">LOE Negotiation</div>
    ${stateFlowHtml}
    ${clockSection}
    <div style="border-top:1px solid rgba(255,255,255,.06);padding-top:10px;background:rgba(255,255,255,.01);margin-bottom:10px">
      ${actionZone}
    </div>
    ${threadDesc.length ? `
    <div style="border-top:1px solid rgba(255,255,255,.05);padding-top:10px">
      <div style="font-family:var(--font-head);font-size:10px;letter-spacing:.08em;color:rgba(255,255,255,.2);text-transform:uppercase;margin-bottom:8px">Thread — ${threadDesc.length} message${threadDesc.length!==1?'s':''} · newest first</div>
      ${threadDescHtml}
    </div>` : ''}`;
};

// ── Negotiation actions ───────────────────────────────────
window.negCheckSubmitGate = function(itemId) {
  const loe     = document.getElementById('neg-loe-' + itemId)?.value;
  const due     = document.getElementById('neg-due-' + itemId)?.value;
  const comment = document.getElementById('neg-comment-' + itemId)?.value?.trim() || '';
  const btn     = document.getElementById('neg-submit-' + itemId);
  const ready   = loe && due && comment.length >= 20;
  if (btn) {
    btn.disabled = !ready;
    btn.style.opacity  = ready ? '1'    : '0.5';
    btn.style.cursor   = ready ? 'pointer' : 'not-allowed';
    btn.style.borderColor = ready ? 'rgba(0,210,255,.4)' : 'rgba(255,255,255,.15)';
  }
};

window.negSubmitRating = async function(itemId) {
  const loe     = document.getElementById('neg-loe-' + itemId)?.value;
  const due     = document.getElementById('neg-due-' + itemId)?.value;
  const comment = document.getElementById('neg-comment-' + itemId)?.value?.trim();
  if (!loe || !due || !comment || comment.length < 20) {
    compassToast('LOE, proposed due date, and a detailed comment are all required.', 3000);
    return;
  }
  const myName = _myResource?.name || 'Me';
  const neg = negGetState(itemId);
  neg.state = 'pending';
  neg.loe = loe;
  neg.proposedDue = due;
  neg.submittedAt = new Date().toISOString();
  neg.thread = neg.thread || [];
  neg.thread.push({ role:'assignee', name:myName, ts:neg.submittedAt, text:'LOE assessment submitted.', loe, proposedDue:due, comment });
  negSaveState(itemId, neg);
  await negWriteCoCEvent(itemId, `LOE rating submitted: ${loe}, proposed due ${due}. Comment: ${comment}`, myName);

  // ── Notify the assigner via HUDNotif ─────────────────────────────
  (async () => {
    try {
      // Get the item to find assigner user_id
      const aiData = (window.myActionItems||[]).find(a => a.id === itemId);
      let assignerUserId = null;

      // Look up assigner user_id via resources table using their name
      if (neg.assignerName) {
        console.log('[HUDNotif] Looking up assigner user_id by name:', neg.assignerName);
        const parts = (neg.assignerName || '').trim().split(' ');
        const firstName = parts[0] || '';
        const lastName  = parts.slice(1).join(' ') || '';
        const resRows = await API.get(
          'resources?select=user_id&first_name=eq.' + encodeURIComponent(firstName) +
          '&last_name=eq.' + encodeURIComponent(lastName) + '&limit=1'
        ).catch(() => []);
        assignerUserId = resRows && resRows[0] ? resRows[0].user_id : null;
        console.log('[HUDNotif] Assigner user_id resolved:', assignerUserId);
      }

      if (assignerUserId && typeof window.HUDNotif !== 'undefined') {
        await window.HUDNotif.notify(
          assignerUserId,
          'loe_response',
          myName + ' submitted an LOE rating on \u201c' + (aiData?.title || 'your action item') + '\u201d — proposed due ' + due,
          'action',
          itemId
        );
        console.log('[HUDNotif] Assigner notified:', assignerUserId);
      } else if (!assignerUserId) {
        console.warn('[HUDNotif] Could not resolve assigner user_id — notification not delivered');
      } else {
        console.warn('[HUDNotif] window.HUDNotif not available — is notif.js loaded?');
      }
    } catch (e) {
      console.warn('[HUDNotif] Notify-assigner error (non-fatal):', e);
    }
  })();

  compassToast('Rating submitted. Assigner will be notified. 24h response window started.');
  // Re-render panel and update row border
  renderNegPanel(itemId, neg.assignerName);
  _negRefreshRow(itemId);
};

window.negEscalate = function(itemId) {
  const neg = negGetState(itemId);
  neg.state = 'escalated';
  negSaveState(itemId, neg);
  negWriteCoCEvent(itemId, 'Escalated to PM for binding decision.', _myResource?.name);
  compassToast('Escalated to PM. Full thread forwarded.');
  renderNegPanel(itemId, neg.assignerName);
  _negRefreshRow(itemId);
};

window.negReviseRating = function(itemId) {
  const neg = negGetState(itemId);
  neg.state = 'unrated';
  negSaveState(itemId, neg);
  renderNegPanel(itemId, neg.assignerName);
  _negRefreshRow(itemId);
};

window.negAcceptCounter = function(itemId) {
  const neg = negGetState(itemId);
  const myName = _myResource?.name || 'Me';
  const lastCounter = (neg.thread||[]).filter(m=>m.role==='assigner').slice(-1)[0];
  neg.state = 'agreed';
  neg.agreedLoe = neg.loe;
  neg.agreedDue = lastCounter?.counterDue || neg.proposedDue;
  neg.lockedAt  = new Date().toISOString();
  neg.thread = neg.thread || [];
  neg.thread.push({ role:'assignee', name:myName, ts:neg.lockedAt, text:`Counter accepted. COB ${neg.agreedDue} confirmed.` });
  neg.thread.push({ role:'system', name:'System · CoC event written', ts:neg.lockedAt,
    text:`Agreement reached. Due date: ${neg.agreedDue}. LOE: ${neg.agreedLoe}. Thread locked — immutable from this point.` });
  negSaveState(itemId, neg);
  negWriteCoCEvent(itemId, `Agreement reached. LOE: ${neg.agreedLoe}, Due: ${neg.agreedDue}. Thread locked.`, myName);
  compassToast('Counter accepted. Agreement locked. CoC event written.');
  renderNegPanel(itemId, neg.assignerName);
  _negRefreshRow(itemId);
};

window.negSubmitCounter = function(itemId) {
  const response = document.getElementById('neg-response-' + itemId)?.value?.trim();
  if (!response) { compassToast('Enter your counter-proposal before submitting.', 2500); return; }
  const myName = _myResource?.name || 'Me';
  const neg = negGetState(itemId);
  neg.thread = neg.thread || [];
  neg.thread.push({ role:'assignee', name:myName, ts:new Date().toISOString(), text:response });
  negSaveState(itemId, neg);
  negWriteCoCEvent(itemId, `Counter-proposal submitted: ${response}`, myName);
  compassToast('Counter submitted. Assigner has 24h to respond.');
  renderNegPanel(itemId, neg.assignerName);
};

// Add a follow-up comment to the thread while in pending state
window.negAddThreadUpdate = function(itemId) {
  const text = document.getElementById('neg-addupdate-' + itemId)?.value?.trim();
  if (!text) { compassToast('Enter a comment before adding to thread.', 2000); return; }
  const myName = _myResource?.name || 'Me';
  const neg = negGetState(itemId);
  neg.thread = neg.thread || [];
  neg.thread.push({ role:'assignee', name:myName, ts:new Date().toISOString(), text });
  negSaveState(itemId, neg);
  negWriteCoCEvent(itemId, `Follow-up: ${text}`, myName);
  compassToast('Comment added to negotiation thread.');
  renderNegPanel(itemId, neg.assignerName);
};

// Called by PM view to post a counter to the assignee
window.negPostCounter = function(itemId, counterText, counterDue, assignerName) {
  const neg = negGetState(itemId);
  neg.state = 'negotiating';
  neg.counterReceivedAt = new Date().toISOString();
  neg.assignerName = assignerName;
  neg.thread = neg.thread || [];
  neg.thread.push({ role:'assigner', name:assignerName, ts:neg.counterReceivedAt, text:counterText, counterDue });
  negSaveState(itemId, neg);
  compassToast('Counter posted. Assignee notified.');
  renderNegPanel(itemId, assignerName);
  _negRefreshRow(itemId);
};

function _negRefreshRow(itemId) {
  const row = document.querySelector(`.wi-row[data-wi-id="${itemId}"]`);
  if (!row) return;
  const neg = negGetState(itemId);
  const s = neg.state;
  // Update left border on row
  if (s === 'unrated')     { row.style.borderLeft = '3px dashed rgba(255,255,255,.2)'; row.style.background = ''; }
  else if (s === 'pending')     { row.style.borderLeft = '3px dashed rgba(239,159,39,.5)'; }
  else if (s === 'negotiating') { row.style.borderLeft = '3px solid rgba(139,92,246,.6)'; }
  else if (s === 'agreed')      { row.style.borderLeft = '3px solid rgba(29,158,117,.5)'; }
  else if (s === 'escalated')   { row.style.borderLeft = '3px solid rgba(226,75,74,.5)'; }
  // Update badge in row if present
  const badgeEl = row.querySelector('[data-neg-badge]');
  if (badgeEl) badgeEl.outerHTML = `<span data-neg-badge style="font-family:var(--font-head);font-size:10px;padding:1px 6px;letter-spacing:.05em;${negGetState(itemId).style||''}">${negGetState(itemId).state}</span>`;
}
