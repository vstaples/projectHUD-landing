// ── Work Item Detail Drawer ───────────────────────────────

// ── CoC write guard — safe no-op if stale coc.js is deployed ─────────────
if (typeof window.CoC?.write !== 'function') {
  console.warn('[CoC] write() not available — stale coc.js. Events will not be recorded until updated.');
  window.CoC = window.CoC || {};
  window.CoC.write = async () => null;
}

function openWorkItemDrawer(item) {
  openWorkItemExpanded(item);
}

function openWorkItemExpanded(item) {
  console.log('[Compass] Task opened — id:', item.id, '| project_id:', item.projectId, '| type:', item.type, '| title:', item.title);
  document.getElementById('wi-drawer')?.remove();

  // Remove any existing expansion
  document.querySelectorAll('.wi-expanded').forEach(e => e.remove());
  document.querySelectorAll('.wi-row').forEach(r => {
    r.classList.remove('wi-selected');
    r.style.borderLeft = '';
  });

  const wiRow = document.querySelector(`.wi-row[data-wi-id="${item.id}"]`);
  if (!wiRow) return;

  // Highlight selected row
  wiRow.classList.add('wi-selected');
  wiRow.style.borderLeft = '3px solid var(--compass-cyan)';
  wiRow.style.background = 'rgba(0,210,255,.04)';

  const typeLabel  = item.type === 'task' ? 'TASK' : 'ACTION ITEM';
  const accentColor = item.overdue ? 'var(--compass-red)' : item.type==='action' ? 'var(--compass-green)' : 'var(--compass-cyan)';
  const statusLabel = (item.status||'open').replace(/_/g,' ');

  // Build modal popup
  const panel = document.createElement('div');
  panel.className = 'wi-expanded';
  panel.dataset.wiId = item.id;
  panel.style.cssText = `
    position:fixed;
    top:50%;left:50%;
    transform:translate(-50%,-50%);
    width:min(980px,96vw);
    height:min(440px,82vh);
    background:#080f1e;
    border:1px solid rgba(0,210,255,.2);
    border-top:3px solid ${accentColor};
    box-shadow:0 20px 60px rgba(0,0,0,.7);
    z-index:250;
    display:flex;
    flex-direction:column;
    overflow:hidden;
    animation:micro-open 180ms ease;
  `;
  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'wi-backdrop';
  backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:249';
  backdrop.addEventListener('click', () => { panel.remove(); backdrop.remove(); document.querySelectorAll('.wi-row').forEach(r=>{r.classList.remove('wi-selected');r.style.borderLeft='';r.style.background='';}); });
  document.body.appendChild(backdrop);

  // ── Section 1: Header strip ──────────────────────────────
  const headerHtml = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;
      padding:10px 14px 8px;border-bottom:1px solid rgba(0,210,255,.08)">
      <div>
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
          <span style="font-family:var(--font-mono);font-size:11px;font-weight:700;
            letter-spacing:.1em;color:${accentColor}">${typeLabel}</span>
          ${item.overdue
            ? `<span style="font-family:var(--font-mono);font-size:11px;font-weight:700;
                color:var(--compass-red);border:1px solid rgba(226,75,74,.4);
                background:rgba(226,75,74,.08);padding:1px 7px">${daysOverdue(item.due)}d overdue</span>`
            : item.status==='blocked'
              ? `<span style="font-family:var(--font-mono);font-size:11px;font-weight:700;
                  color:var(--compass-amber);border:1px solid rgba(239,159,39,.4);
                  background:rgba(239,159,39,.08);padding:1px 7px">Tasks Blocked</span>`
              : ''}
        </div>
        <div style="font-family:var(--font-body);font-size:14px;font-weight:600;
          color:var(--text0);line-height:1.3">${esc(item.title)}</div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-top:3px">
          ${item.type==='action' && item.ownerName ? '<span style="color:#F0F6FF">' + esc(item.ownerName) + '</span> · ' : ''}${item.type==='action' && item.createdBy ? '<span style="color:var(--text3)">Assignor:</span> <span style="color:#00D2FF;font-weight:700">' + esc(item.createdBy) + '</span> · ' : ''}${item.project && item.project.toLowerCase()!=='action item' ? esc(item.project) + ' · ' : ''}${item.due ? 'Due ' + fmtDate(item.due) + ' · ' : ''}<span style="text-transform:capitalize">${statusLabel}</span>${item.type==='action' ? ' · ' + getNegotiationBadgeHtml(negGetState(item.id).state) : ''}
        </div>
      </div>
      <button data-action="close-wi-modal"
        style="background:none;border:none;color:var(--text3);font-size:18px;cursor:pointer;
          padding:0 0 0 14px;line-height:1;flex-shrink:0;transition:color .12s">✕</button>
    </div>`;

  // ── Section 2: Three-column detail + action area ─────────
  const pct = item.pct || 0;
  const barColor = pct >= 80 ? 'var(--compass-green)' : pct >= 40 ? 'var(--compass-cyan)' : 'rgba(255,255,255,.25)';

  // Effort context data
  const bh = item.budgetHours;
  const loggedHrs = _teEntries.filter(e=>e.task_id===item.id).reduce((s,e)=>s+parseFloat(e.hours||0),0);
  const ah = item.actualHours || loggedHrs;
  const usedPct = bh && bh>0 ? Math.min(Math.round(ah/bh*100),150) : 0;
  const effortColor = usedPct>110?'var(--compass-red)':usedPct>80?'var(--compass-amber)':'var(--compass-green)';
  const complexColors = {low:'var(--compass-green)',medium:'var(--compass-amber)',high:'var(--compass-red)',critical:'#E24B4A'};
  const cx = item.complexity ? (complexColors[item.complexity.toLowerCase()]||'var(--text3)') : null;

  // ── Pre-compute CoC events for this item ────────────────
  // coc_events uses entity_id directly — match on item.id
  // Also include any workflow_instance IDs that reference this task (for migrated historical events)
  const _itemInstIds = new Set((window._wfInstances||[]).filter(w=>w.task_id===item.id).map(w=>w.id));
  const _aiInst = (window.myActionItems||[]).find(a=>a.id===item.id)?.instance_id;
  if (_aiInst) _itemInstIds.add(_aiInst);
  const _itemEvts = (window._myCocEvents||[]).filter(e=>
    e.entity_id === item.id ||          // direct entity match (new coc_events)
    _itemInstIds.has(e.entity_id) ||    // migrated workflow_instance events
    _itemInstIds.has(e.instance_id)     // legacy instance_id field fallback
  );
  const _evtColor={instance_launched:'#00D2FF',instance_completed:'#1D9E75',step_activated:'#e8a838',step_completed:'#1D9E75',step_action:'#00D2FF',step_reset:'#E24B4A',management_decision:'#EF9F27',intervention:'#8B5CF6'};
  const _evtLabel={instance_launched:'Launched',instance_completed:'Completed',step_activated:'Activated',step_completed:'Step done',step_action:'Action',step_reset:'Reset',management_decision:'Decision',intervention:'Intervention'};
  const _E=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const _cocHtml = _itemEvts.length ? _itemEvts.map((e,i)=>{
    const col=_evtColor[e.event_type]||'#5A84A8';
    const lbl=_evtLabel[e.event_type]||e.event_type.replace(/_/g,' ');
    const step=(e.step_name||'').replace(/^CONCERN:\s*/,'');
    const note=e.event_notes||'';
    const ts=e.created_at?new Date(e.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
    let h='<div style="display:flex;gap:6px;margin-bottom:8px">';
    h+='<div style="display:flex;flex-direction:column;align-items:center;width:10px;flex-shrink:0">';
    h+='<div style="width:6px;height:6px;border-radius:50%;background:'+col+';margin-top:2px;flex-shrink:0"></div>';
    if(i<_itemEvts.length-1) h+='<div style="width:1px;flex:1;min-height:8px;background:rgba(255,255,255,.08);margin-top:2px"></div>';
    h+='</div><div style="flex:1;min-width:0">';
    h+='<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:'+col+'">'+_E(lbl)+'</div>';
    if(step) h+='<div style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.4);margin-top:1px">&rarr; '+_E(step.slice(0,40))+'</div>';
    if(e.actor_name) h+='<div style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.3)">By '+_E(e.actor_name)+'</div>';
    if(note) h+='<div style="font-family:var(--font-body);font-size:11px;color:rgba(240,246,255,.65);margin-top:2px;padding:2px 6px;background:rgba(255,255,255,.03);border-left:2px solid '+col+';line-height:1.4;word-break:break-word">'+_E(note.slice(0,100))+'</div>';
    if(ts) h+='<div style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,.2);margin-top:1px">'+ts+'</div>';
    h+='</div></div>';
    return h;
  }).join('') : '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);line-height:1.6">No CoC history for this item yet.</div>';

  const detailHtml = `
    <div style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column">

      <!-- Rows 2-4: two-column grid — left=controls+work completed, right=CoC full height -->
      <div style="flex:1;min-height:0;display:grid;grid-template-columns:auto 240px;overflow:hidden">

        <!-- LEFT column: Row 2 meta + Row 3 sentiment+slider + Row 4 work completed -->
        <div style="display:flex;flex-direction:column;min-height:0;border-right:1px solid rgba(0,210,255,.08);min-width:0">

          <!-- Row 2a: Status + Planned tiles -->
          <div style="display:flex;align-items:center;gap:5px;padding:5px 14px;border-bottom:1px solid rgba(0,210,255,.04);flex-shrink:0">
            <div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.08em;color:#00D2FF;text-transform:uppercase;white-space:nowrap;min-width:52px">Planned</div>
            ${item.type==='task'?`
            <select id="wi-status-${item.id}"
              style="font-family:var(--font-mono);font-size:11px;font-weight:600;padding:4px 6px;background:#0a1525;border:1px solid rgba(0,210,255,.15);color:var(--text1);cursor:pointer;flex-shrink:0">
              <option value="not_started" ${item.status==='not_started'?'selected':''}>Not started</option>
              <option value="in_progress" ${item.status==='in_progress'?'selected':''}>In progress</option>
              <option value="blocked" ${item.status==='blocked'?'selected':''}>Tasks Blocked</option>
            </select>`:''}
            ${[
              ['Effort Hrs', bh?bh+'h':item.effortDays?(item.effortDays*8)+'h':'—', ''],
              ['Due',        item.due?fmtDate(item.due):'—', item.overdue?'var(--compass-red)':''],
              ['Budget',     bh?'…':'—', '', 'budget'],
            ].map(([l,v,c,dt])=>`<div style="background:#0a1525;padding:3px 8px;border:1px solid rgba(0,210,255,.08);white-space:nowrap;flex-shrink:0;width:90px;box-sizing:border-box"><div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);letter-spacing:.06em;text-transform:uppercase">${l}</div><div ${dt?'data-tile="'+dt+'"':''} style="font-family:var(--font-body);font-size:12px;font-weight:600;color:${c||'var(--text1)'}">${v}</div></div>`).join('')}
          </div>
          <!-- Row 2b: Actuals tiles + Log Time -->
          <div style="display:flex;align-items:center;gap:5px;padding:5px 14px;border-bottom:1px solid rgba(0,210,255,.07);flex-shrink:0">
            <div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.08em;color:#00D2FF;text-transform:uppercase;white-space:nowrap;min-width:52px">Actuals</div>
            ${[
              ['Act. Start', item.actualStart?fmtDate(item.actualStart):loggedHrs>0?'In progress':'—', ''],
              ['Act. Hrs',   ah.toFixed(1)+'h', usedPct>110?'var(--compass-red)':usedPct>80?'var(--compass-amber)':''],
              ['Spend',      bh?'…':'—', usedPct>110?'var(--compass-red)':usedPct>80?'var(--compass-amber)':'', 'spend'],
              ['Spend %',    bh?usedPct+'%':'—', usedPct>110?'var(--compass-red)':usedPct>80?'var(--compass-amber)':'var(--compass-green)'],
            ].map(([l,v,c,dt])=>`<div style="background:#0a1525;padding:3px 8px;border:1px solid rgba(0,210,255,.08);white-space:nowrap;flex-shrink:0;width:90px;box-sizing:border-box"><div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);letter-spacing:.06em;text-transform:uppercase">${l}</div><div ${dt?'data-tile="'+dt+'"':''} style="font-family:var(--font-body);font-size:12px;font-weight:600;color:${c||'var(--text1)'}">${v}</div></div>`).join('')}
            <div style="width:1px;height:22px;background:rgba(255,255,255,.08);flex-shrink:0;margin-left:4px"></div>
            <div style="display:flex;align-items:center;gap:5px;flex-shrink:0">
              <span style="font-family:var(--font-mono);font-size:11px;color:var(--text3);white-space:nowrap">Log Time (hrs)</span>
              <input id="wi-hrs-${item.id}" type="number" min="0.25" max="24" step="0.25" placeholder="0.0"
                style="width:52px;font-family:var(--font-mono);font-size:14px;font-weight:700;padding:3px 4px;background:#0a1525;border:1px solid rgba(0,210,255,.2);color:var(--compass-cyan);outline:none;text-align:center"/>
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-family:var(--font-mono);font-size:11px;color:var(--text3);white-space:nowrap">
                <input id="wi-bill-${item.id}" type="checkbox" checked style="accent-color:var(--compass-cyan)"/>Billable
              </label>
            </div>
          </div>

          <!-- Row 3: Action item negotiation panel OR sentiment/% done for tasks -->
          ${item.type==='action'?`
          <div id="neg-panel-${item.id}" style="flex:1;overflow-y:auto;padding:12px 14px;min-height:0">
            <div style="font-family:var(--font-mono);font-size:12px;color:#3A5C80">Loading negotiation panel…</div>
          </div>
          `:''}${item.type!=='action'?`
          <div style="display:flex;align-items:center;gap:10px;padding:7px 14px;border-bottom:1px solid rgba(0,210,255,.07);flex-shrink:0">
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
              <span style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--text3)">Sentiment <span style="color:#E24B4A">*</span></span>
              <button id="wi-sig-green-${item.id}" title="On track" onclick="wiSetSignal('${item.id}','green')" style="width:16px;height:16px;border-radius:50%;border:2px solid #1D9E75;background:transparent;cursor:pointer;transition:all .12s;flex-shrink:0"></button>
              <button id="wi-sig-yellow-${item.id}" title="At risk" onclick="wiSetSignal('${item.id}','yellow')" style="width:16px;height:16px;border-radius:50%;border:2px solid #EF9F27;background:transparent;cursor:pointer;transition:all .12s;flex-shrink:0"></button>
              <button id="wi-sig-red-${item.id}" title="Blocked / issue" onclick="wiSetSignal('${item.id}','red')" style="width:16px;height:16px;border-radius:50%;border:2px solid #E24B4A;background:transparent;cursor:pointer;transition:all .12s;flex-shrink:0"></button>
              <input type="hidden" id="wi-sig-active-${item.id}" value=""/>
              <span id="wi-sig-label-${item.id}" style="font-family:var(--font-mono);font-size:11px;color:var(--text3)">— required</span>
            </div>
            ${item.type==='task'?`
            <div style="width:1px;height:20px;background:rgba(255,255,255,.08);flex-shrink:0"></div>
            <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:80px">
              <span style="font-family:var(--font-mono);font-size:11px;color:var(--text3);white-space:nowrap">% Done</span>
              <input id="wi-pct-${item.id}" type="range" min="0" max="100" step="5" value="${pct}"
                style="flex:1;accent-color:var(--compass-amber)"
                oninput="document.getElementById('wi-pct-out-${item.id}').textContent=this.value+'%'"/>
              <span id="wi-pct-out-${item.id}" style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:${barColor};min-width:36px;text-align:right">${pct}%</span>
            </div>`:``}
          </div>

          <!-- Row 4: Work Completed textarea + buttons -->
          <div style="flex:1;padding:8px 14px 0;display:flex;flex-direction:column;gap:5px;min-height:0;overflow:hidden">
            <div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);flex-shrink:0">Work completed <span style="color:#E24B4A">*</span> <span id="wi-comment-req-${item.id}" style="font-weight:400;color:#E24B4A;display:none">Required</span></div>
            <textarea id="wi-comment-${item.id}" placeholder="Describe what was accomplished this session — required to save…" oninput="wiCheckGate('${item.id}')"
              style="flex:1;width:100%;font-family:var(--font-body);font-size:12px;padding:8px 10px;background:#0a1525;border:1px solid rgba(0,210,255,.15);color:var(--text1);outline:none;resize:none;box-sizing:border-box;line-height:1.5;min-height:0;overflow-y:auto"></textarea>
            <!-- Buttons + hint inside work completed pane -->
            <div style="display:flex;gap:6px;flex-shrink:0;padding-top:6px">
              <button id="wi-save-progress-${item.id}" onclick="wiSaveProgress('${item.id}','${item.projectId||''}')" disabled
                style="flex:1;font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.06em;padding:8px;background:rgba(255,255,255,.04);color:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.1);cursor:not-allowed;transition:all .15s;text-align:center;opacity:.5">Save update →</button>
              <button id="wi-mark-complete-${item.id}" onclick="wiMarkComplete('${item.id}','${item.type}',${JSON.stringify(item.title)},'${item.projectId||''}')" disabled
                style="flex:1;font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.06em;padding:8px;background:rgba(255,255,255,.04);color:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.1);cursor:not-allowed;transition:all .15s;text-align:center;opacity:.5">Mark complete →</button>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;flex-shrink:0;padding-top:3px;min-height:16px">
              <span id="wi-save-status-${item.id}" style="font-family:var(--font-mono);font-size:11px;color:var(--compass-amber)"></span>
              <div id="wi-gate-hint-${item.id}" style="font-family:var(--font-mono);font-size:11px;color:#3A5C80">Select sentiment and add a note to unlock</div>
            </div>
          </div>
          `:''}${''}
        </div>

        <!-- RIGHT column: Chain of Custody — full height from row 2 top -->
        <div data-coc-col style="padding:10px 12px;display:flex;flex-direction:column;gap:6px;background:rgba(0,0,0,.15);min-height:0;overflow:hidden">
          <div data-coc-count style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#00D2FF;flex-shrink:0">Chain of Custody (${_itemEvts.length})</div>
          <div data-coc-body style="flex:1;overflow-y:auto;min-height:0">${_cocHtml}</div>
        </div>

      </div>

    <div data-rate-caution style="font-family:var(--font-mono);font-size:11px;color:var(--compass-amber);padding:4px 14px;border-top:1px solid rgba(239,159,39,.15);flex-shrink:0"></div>
    </div>`;
  panel.innerHTML = headerHtml + detailHtml;
  document.body.appendChild(panel);

  // ── Fetch assignee labor rate from hud_role_levels ───────────────
  (async function() {
    try {
      const LOG = (msg, data) => console.log('[RateLookup]', msg, data !== undefined ? data : '');
      LOG('item.type', item.type);
      LOG('item.assignedTo', item.assignedTo);
      LOG('item.ownerResourceId', item.ownerResourceId);
      LOG('_myResource.user_id', _myResource?.user_id);

      let aRes = null;
      if (item.type === 'action' && item.ownerResourceId) {
        const r = await API.get('resources?select=id,hud_role_id,level&id=eq.' + item.ownerResourceId + '&limit=1').catch(()=>[]);
        aRes = r && r[0];
        LOG('action → resource by id', aRes);
      } else if (item.assignedTo) {
        const r = await API.get('resources?select=id,hud_role_id,level&user_id=eq.' + item.assignedTo + '&limit=1').catch(()=>[]);
        aRes = r && r[0];
        LOG('task → resource by user_id', aRes);
      } else {
        const r = await API.get('resources?select=id,hud_role_id,level&user_id=eq.' + (_myResource?.user_id||'') + '&limit=1').catch(()=>[]);
        aRes = r && r[0];
        LOG('fallback → current user resource', aRes);
      }

      const roleId = aRes?.hud_role_id || null;
      const level  = aRes?.level || null;
      LOG('hud_role_id', roleId);
      LOG('level', level);

      let rate = null;
      if (roleId && level) {
        const rlRows = await API.get('hud_role_levels?select=overhead_rate_per_hour&role_id=eq.' + roleId + '&level=eq.' + level + '&limit=1').catch(()=>[]);
        LOG('hud_role_levels result', rlRows);
        rate = rlRows && rlRows[0] ? parseFloat(rlRows[0].overhead_rate_per_hour) : null;
      } else if (roleId && !level) {
        const allLevels = await API.get('hud_role_levels?select=level,overhead_rate_per_hour&role_id=eq.' + roleId).catch(()=>[]);
        LOG('no level set — available levels for this role', allLevels);
      }
      LOG('resolved rate ($/hr)', rate);

      const bh = item.budgetHours || (item.effortDays ? item.effortDays * 8 : null);
      const loggedHrs2 = (_teEntries||[]).filter(e=>e.task_id===item.id).reduce((s,e)=>s+parseFloat(e.hours||0),0);
      const ah2 = item.actualHours || loggedHrs2;
      const budgetTile = panel.querySelector('[data-tile="budget"]');
      const spendTile  = panel.querySelector('[data-tile="spend"]');
      const cautionEl  = panel.querySelector('[data-rate-caution]');
      if (rate && bh && budgetTile) budgetTile.textContent = '$' + Math.round(bh * rate).toLocaleString();
      if (rate && spendTile) spendTile.textContent = '$' + Math.round(ah2 * rate).toLocaleString();
      if (cautionEl) {
        if (!aRes)    cautionEl.textContent = '* Caution: assignee resource record not found — budget cost cannot be calculated.';
        else if (!roleId) cautionEl.textContent = '* Caution: assignee has no role assigned — budget cost cannot be calculated.';
        else if (!level)  cautionEl.textContent = '* Caution: assignee has no seniority level assigned — budget cost cannot be calculated.';
        else if (!rate)   cautionEl.textContent = '* Caution: no labor rate defined for this role/level — budget cost cannot be calculated.';
        else cautionEl.style.display = 'none';
      }
    } catch(e) {
      console.warn('[RateLookup] Error:', e);
    }
  })();

  // Wire negotiation panel for action items
  if (item.type === 'action') {
    const neg = negGetState(item.id);
    // Store assigner name from action item data
    const aiData = (window.myActionItems||[]).find(a=>a.id===item.id);
    if (aiData?.created_by_name && !neg.assignerName) {
      neg.assignerName = aiData.created_by_name;
      negSaveState(item.id, neg);
    }
    setTimeout(() => {
      renderNegPanel(item.id, neg.assignerName || aiData?.created_by_name || 'Assigner');
      // Re-run gate in case form was pre-filled
      setTimeout(() => window.negCheckSubmitGate && window.negCheckSubmitGate(item.id), 50);
    }, 0);
  } else {
    setTimeout(() => document.getElementById(`wi-hrs-${item.id}`)?.focus(), 80);
  }
}

// ── Save inline progress update ──────────────────────────
// ── Signal dot toggle ─────────────────────────────────────
function wiSetSignal(itemId, sig) {
  const colors = { green:'#1D9E75', yellow:'#EF9F27', red:'#E24B4A' };
  const labels = { green:'On track', yellow:'At risk', red:'Blocked / issue' };
  const activeEl = document.getElementById(`wi-sig-active-${itemId}`);
  if (!activeEl) return;
  activeEl.value = (activeEl.value === sig) ? '' : sig; // toggle
  const current = activeEl.value;
  ['green','yellow','red'].forEach(s => {
    const btn = document.getElementById(`wi-sig-${s}-${itemId}`);
    if (!btn) return;
    btn.style.background = current === s ? colors[s] + '55' : 'transparent';
    btn.style.boxShadow  = current === s ? `0 0 0 3px ${colors[s]}44` : 'none';
  });
  const labelEl = document.getElementById(`wi-sig-label-${itemId}`);
  if (labelEl) {
    labelEl.textContent = current ? labels[current] : '— required';
    labelEl.style.color = current ? colors[current] : 'var(--text3)';
  }
  wiCheckGate(itemId);
}

// ── Mark complete — validate first ────────────────────────
function wiMarkComplete(itemId, type, title, projectId) {
  const comment   = document.getElementById(`wi-comment-${itemId}`)?.value?.trim();
  const signal    = document.getElementById(`wi-sig-active-${itemId}`)?.value;
  const reqEl     = document.getElementById(`wi-comment-req-${itemId}`);
  const commentEl = document.getElementById(`wi-comment-${itemId}`);
  let valid = true;
  if (!signal) {
    ['green','yellow','red'].forEach(s => {
      const btn = document.getElementById(`wi-sig-${s}-${itemId}`);
      if (btn) { btn.style.boxShadow = '0 0 0 3px rgba(226,75,74,.4)'; }
    });
    setTimeout(()=>['green','yellow','red'].forEach(s=>{
      const b=document.getElementById(`wi-sig-${s}-${itemId}`);
      if(b&&document.getElementById(`wi-sig-active-${itemId}`)?.value!==s) b.style.boxShadow='none';
    }), 1400);
    valid = false;
  }
  if (!comment) {
    if (reqEl) reqEl.style.display = 'inline';
    if (commentEl) { commentEl.style.borderColor='rgba(226,75,74,.5)'; commentEl.focus(); }
    valid = false;
  }
  if (!valid) return;
  // Pre-fill the completion panel note with the comment
  openCompletionPanel({ id:itemId, type, title, projectId: projectId||null });
  setTimeout(() => {
    const noteEl = document.getElementById('cmp-note');
    if (noteEl && !noteEl.value) noteEl.value = comment;
  }, 80);
}

// ── Save progress update ──────────────────────────────────
// ── CoC drag handle (horizontal resize) ─────────────────
document.addEventListener('mousedown', function(ev) {
  // CoC left-edge drag — resize CoC width
  if (ev.target.closest('#mw-coc-drag')) {
    ev.preventDefault();
    const coc = document.getElementById('mw-coc');
    if (!coc) return;
    const startX = ev.clientX, startW = coc.offsetWidth;
    const onMove = e => { coc.style.width = Math.max(200, Math.min(600, startW - (e.clientX - startX))) + 'px'; };
    const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return;
  }
  // Done Today top-edge drag — redistributes height between Time Log and Done Today
  if (ev.target.closest('#mw-done-resize')) {
    ev.preventDefault();
    const done    = document.getElementById('mw-done-today');
    const timelog = document.getElementById('mw-timelog');
    const handle  = document.getElementById('mw-done-resize');
    if (!done || !timelog) return;
    const startY  = ev.clientY;
    const startDoneH = done.offsetHeight;
    const startLogH  = timelog.offsetHeight;
    if (handle) handle.style.background = 'rgba(0,210,255,.4)';
    const onMove = e => {
      const delta   = e.clientY - startY;           // drag down = grow log, shrink done
      const newLogH = Math.max(80, startLogH + delta);
      const newDoneH= Math.max(60, startDoneH - delta);
      timelog.style.flex = 'none';
      timelog.style.height = newLogH + 'px';
      done.style.flex = 'none';
      done.style.height = newDoneH + 'px';
    };
    const onUp = () => {
      if (handle) handle.style.background = 'rgba(0,210,255,.08)';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return;
  }
});

function wiCheckGate(itemId) {
  const sig     = document.getElementById(`wi-sig-active-${itemId}`)?.value||'';
  const comment = document.getElementById(`wi-comment-${itemId}`)?.value?.trim()||'';
  const ready   = sig !== '' && comment !== '';
  const saveBtn = document.getElementById(`wi-save-progress-${itemId}`);
  const doneBtn = document.getElementById(`wi-mark-complete-${itemId}`);
  const hint    = document.getElementById(`wi-gate-hint-${itemId}`);
  const LOCKED  = {background:'rgba(255,255,255,.04)',color:'rgba(255,255,255,.2)',borderColor:'rgba(255,255,255,.1)',cursor:'not-allowed',opacity:'0.5'};
  if (saveBtn) {
    saveBtn.disabled = !ready;
    Object.assign(saveBtn.style, ready
      ? {background:'rgba(239,159,39,.12)',color:'var(--compass-amber)',borderColor:'rgba(239,159,39,.4)',cursor:'pointer',opacity:'1'}
      : LOCKED);
    saveBtn.onmouseenter = ready ? ()=>saveBtn.style.background='rgba(239,159,39,.22)' : null;
    saveBtn.onmouseleave = ready ? ()=>saveBtn.style.background='rgba(239,159,39,.12)' : null;
  }
  if (doneBtn) {
    doneBtn.disabled = !ready;
    Object.assign(doneBtn.style, ready
      ? {background:'rgba(0,210,255,.1)',color:'var(--compass-cyan)',borderColor:'rgba(0,210,255,.35)',cursor:'pointer',opacity:'1'}
      : LOCKED);
    doneBtn.onmouseenter = ready ? ()=>doneBtn.style.background='rgba(0,210,255,.2)' : null;
    doneBtn.onmouseleave = ready ? ()=>doneBtn.style.background='rgba(0,210,255,.1)' : null;
  }
  if (hint) hint.style.display = ready ? 'none' : 'block';
}

async function wiSaveProgress(itemId, projectId) {
  // Validate: sentiment + comment both required
  const comment   = document.getElementById(`wi-comment-${itemId}`)?.value?.trim()||'';
  const signal    = document.getElementById(`wi-sig-active-${itemId}`)?.value||'';
  const reqEl     = document.getElementById(`wi-comment-req-${itemId}`);
  const commentEl = document.getElementById(`wi-comment-${itemId}`);
  let valid = true;
  if (!signal) {
    ['green','yellow','red'].forEach(s=>{
      const b=document.getElementById(`wi-sig-${s}-${itemId}`);
      if(b){b.style.boxShadow='0 0 0 3px rgba(226,75,74,.4)';}
    });
    setTimeout(()=>['green','yellow','red'].forEach(s=>{
      const b=document.getElementById(`wi-sig-${s}-${itemId}`);
      if(b&&document.getElementById(`wi-sig-active-${itemId}`)?.value!==s)b.style.boxShadow='none';
    }),1400);
    valid = false;
  }
  if (!comment) {
    if (reqEl) reqEl.style.display='inline';
    if (commentEl) { commentEl.style.borderColor='rgba(226,75,74,.5)'; if(valid) commentEl.focus(); }
    valid = false;
  } else {
    if (reqEl) reqEl.style.display='none';
    if (commentEl) commentEl.style.borderColor='rgba(0,210,255,.15)';
  }
  if (!valid) return;

  const pctEl     = document.getElementById(`wi-pct-${itemId}`);
  const statusEl  = document.getElementById(`wi-status-${itemId}`);
  const hrsEl     = document.getElementById(`wi-hrs-${itemId}`);
  const billEl    = document.getElementById(`wi-bill-${itemId}`);
  const saveBtn   = document.getElementById(`wi-save-progress-${itemId}`);
  const statusOut = document.getElementById(`wi-save-status-${itemId}`);
  const pct    = pctEl    ? parseInt(pctEl.value)       : null;
  const status = statusEl ? statusEl.value              : null;
  const hrs    = hrsEl    ? parseFloat(hrsEl.value||0)  : 0;
  const bill   = billEl   ? billEl.checked              : true;
  const sigOutcome = signal==='green'?'on_track':signal==='yellow'?'at_risk':'blocked';

  if (saveBtn) { saveBtn.textContent='…'; saveBtn.disabled=true; }
  const today = new Date().toLocaleDateString('en-CA');
  try {
    const ps = [];
    // Patch task pct + status
    if (pct !== null || status) {
      const patch = { updated_at: new Date().toISOString() };
      if (pct !== null) patch.pct_complete = pct;
      if (status)       patch.status       = status;
      ps.push(API.patch(`tasks?id=eq.${itemId}`, patch).catch(()=>{}));
    }
    // Log time entry with comment as notes
    if (hrs > 0 && _myResource?.id) {
      ps.push(API.post('time_entries', {
        id: crypto.randomUUID(),
        firm_id: window.FIRM_ID,
        resource_id: _myResource.id,
        user_id: _myResource.user_id || null,
        project_id: projectId || null,
        task_id: itemId,
        source_type: 'direct',
        date: today,
        hours: hrs,
        is_billable: bill,
        notes: comment
      }).catch(()=>{}));
    }
    // Write CoC progress event
    ps.push(window.CoC.write('task.progress_update', itemId, {
      entityType: 'task',
      stepName:   pct !== null ? `Progress: ${pct}%` : 'Progress update',
      notes:      comment,
      outcome:    sigOutcome,
      projectId:  projectId || null,
    }));
    // Also write to workflow_step_instances if a workflow instance exists (keeps PM/mgmt views working)
    const wfByTask = (window._wfInstances||[]).find(w=>w.task_id===itemId);
    const instId   = wfByTask?.id || null;
    if (instId) {
      ps.push(API.post('workflow_step_instances', {
        id:          crypto.randomUUID(),
        instance_id: instId,
        step_type:   'manual',
        event_type:  'step_completed',
        step_name:   pct !== null ? `Progress: ${pct}%` : 'Progress update',
        event_notes: comment,
        outcome:     sigOutcome,
        actor_name:  _myResource?.name || null,
        firm_id:     window.FIRM_ID
      }).catch(()=>{}));
    }
    // Optimistically update local CoC cache and refresh modal panel
    if (!window._myCocEvents) window._myCocEvents = [];
    window._myCocEvents.unshift(cocEvt);
    _negRefreshModalCoC(itemId);
    await Promise.all(ps);
    if (statusOut) { statusOut.textContent='✓ Saved'; statusOut.style.color='var(--compass-green)'; }
    if (saveBtn)   { saveBtn.textContent='Saved ✓'; saveBtn.disabled=false; }
    setTimeout(()=>{ _viewLoaded['user']=false; _mwLoadUserView(); }, 1200);
  } catch(e) {
    if (saveBtn)   { saveBtn.textContent='Save update →'; saveBtn.disabled=false; }
    if (statusOut) { statusOut.textContent='Failed — '+e.message; statusOut.style.color='var(--compass-amber)'; }
  }
}

// ── New Direct Time Entry ─────────────────────────────────
function openNewTimeEntry(taskId = null, projectId = null) {
  document.getElementById('te-edit-drawer')?.remove();
  document.getElementById('wi-drawer')?.remove();

  const drawer = document.createElement('div');
  drawer.id = 'te-edit-drawer';
  drawer.style.cssText = `
    position:fixed;top:0;right:0;bottom:0;width:320px;z-index:600;
    background:var(--bg1,#0c1628);
    border-left:1px solid var(--border,rgba(0,210,255,.12));
    box-shadow:-8px 0 32px rgba(0,0,0,.5);
    display:flex;flex-direction:column;
    animation:te-slide-in .2s ease;
  `;

  const today = new Date().toLocaleDateString('en-CA');

  drawer.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;
      padding:16px 16px 12px;border-bottom:1px solid var(--border);flex-shrink:0">
      <div>
        <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:.1em;
          text-transform:uppercase;color:var(--compass-cyan);margin-bottom:3px">Log time</div>
        <div style="font-family:var(--font-mono);font-size:13px;font-weight:500;color:var(--text0)">
          New time entry</div>
      </div>
      <button onclick="document.getElementById('te-edit-drawer').remove()"
        style="background:none;border:none;color:var(--text3);font-size:18px;
          cursor:pointer;padding:0;line-height:1"
        onmouseenter="this.style.color='var(--text0)'"
        onmouseleave="this.style.color='var(--text3)'">✕</button>
    </div>

    <div style="flex:1;overflow-y:auto;padding:16px">
      <div style="margin-bottom:14px">
        <label class="te-label">Date</label>
        <input id="te-new-date" class="te-input" type="date" value="${today}" />
      </div>
      <div style="margin-bottom:14px">
        <label class="te-label">Project</label>
        <select id="te-new-project" class="te-input" style="font-size:12px">
          <option value="">— Select project —</option>
          ${(_projects || []).filter(p => p.status === 'active').map(p =>
            `<option value="${p.id}" ${p.id === projectId ? 'selected' : ''}>${esc(p.name)}</option>`
          ).join('')}
        </select>
      </div>
      <div style="margin-bottom:14px">
        <label class="te-label">Hours</label>
        <input id="te-new-hours" class="te-input" type="number" min="0.25" max="24"
          step="0.25" placeholder="0.0" style="text-align:center;font-size:16px;font-weight:600;
          color:var(--compass-cyan)" />
      </div>
      <div style="margin-bottom:14px">
        <label class="te-label">Notes</label>
        <textarea id="te-new-notes" class="te-input" rows="3"
          style="resize:vertical;min-height:70px"
          placeholder="What did you work on?"></textarea>
      </div>
      <div style="margin-bottom:14px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input id="te-new-billable" type="checkbox" checked
            style="accent-color:var(--compass-cyan);width:14px;height:14px" />
          <span style="font-family:var(--font-mono);font-size:11px;color:var(--text3);
            letter-spacing:.08em;text-transform:uppercase">Billable</span>
        </label>
      </div>
      <span id="te-new-status" style="font-family:var(--font-mono);font-size:11px;
        color:var(--compass-amber);display:block;min-height:14px;margin-bottom:10px"></span>
    </div>

    <div style="padding:12px 16px;border-top:1px solid var(--border);
      display:flex;gap:8px;flex-shrink:0">
      <button onclick="document.getElementById('te-edit-drawer').remove()"
        style="font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;
          text-transform:uppercase;padding:7px 14px;background:none;
          border:1px solid var(--border);color:var(--text3);cursor:pointer">Cancel</button>
      <button onclick="saveNewTimeEntry('${taskId || ''}','${projectId || ''}')"
        style="flex:1;font-family:var(--font-mono);font-size:11px;font-weight:600;
          letter-spacing:.08em;text-transform:uppercase;padding:7px;
          background:var(--compass-cyan);color:#060a10;border:none;cursor:pointer"
        onmouseenter="this.style.opacity='.85'"
        onmouseleave="this.style.opacity='1'">Save entry →</button>
    </div>
  `;

  document.body.appendChild(drawer);
  setTimeout(() => {
    document.getElementById('te-new-hours')?.focus();
    document.addEventListener('mousedown', function closeTENew(ev) {
      if (!drawer.contains(ev.target)) {
        drawer.remove();
        document.removeEventListener('mousedown', closeTENew);
      }
    });
  }, 50);
}

async function saveNewTimeEntry(taskId, projectId) {
  const date     = document.getElementById('te-new-date')?.value;
  const projId   = document.getElementById('te-new-project')?.value || projectId || null;
  const hours    = parseFloat(document.getElementById('te-new-hours')?.value);
  const notes    = document.getElementById('te-new-notes')?.value?.trim() || null;
  const billable = document.getElementById('te-new-billable')?.checked ?? true;
  const statusEl = document.getElementById('te-new-status');

  if (!date)            { if(statusEl) statusEl.textContent = 'Date required'; return; }
  if (!hours || hours <= 0) { if(statusEl) statusEl.textContent = 'Hours required'; return; }
  if (!projId)          { if(statusEl) statusEl.textContent = 'Project required'; return; }

  try {
    await API.post('time_entries', {
      firm_id:     window.FIRM_ID,
      resource_id: _myResource?.id   || null,
      user_id:     _myResource?.user_id || null,
      project_id:  projId,
      task_id:     taskId || null,
      source_type: 'direct',
      date,
      hours,
      is_billable: billable,
      notes,
    });
    document.getElementById('te-edit-drawer')?.remove();
    compassToast('Time entry saved');
    _viewLoaded['user'] = false;
    _mwLoadUserView();
  } catch(e) {
    if(statusEl) statusEl.textContent = 'Failed — ' + e.message;
  }
}

// ── Timesheet Week Submit ─────────────────────────────────
async function submitTimesheetWeek(weekId, weekStart, weekHours) {
  const note = prompt(`Submit ${weekHours}h for week of ${weekStart} for approval?\n\nAdd a note (optional):`);
  if (note === null) return; // cancelled

  try {
    if (weekId) {
      // Week container exists — update status to submitted
      await API.patch(`timesheet_weeks?id=eq.${weekId}`, {
        status:       'submitted',
        submitted_at: new Date().toISOString(),
        resource_notes: note || null,
        updated_at:   new Date().toISOString(),
      });
    } else {
      // No week container yet — create it as submitted
      await API.post('timesheet_weeks', {
        firm_id:        window.FIRM_ID,
        resource_id:    _myResource?.id,
        week_start_date: weekStart,
        week_end_date:  new Date(new Date(weekStart+'T00:00:00').getTime() + 6*86400000).toLocaleDateString('en-CA'),
        total_hours:    parseFloat(weekHours),
        status:         'submitted',
        submitted_at:   new Date().toISOString(),
        resource_notes: note || null,
      });
    }
    compassToast('Timesheet submitted for approval');
    _viewLoaded['user'] = false;
    _mwLoadUserView();
  } catch(e) {
    compassToast('Submit failed — ' + e.message, 3000);
  }
}


// Expose refresh hook for compass.html
window._mwRefresh = function() { _viewLoaded['user'] = false; _mwLoadUserView(); };
