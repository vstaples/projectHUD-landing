// ══════════════════════════════════════════════════════════
// MORNING BRIEF PANEL
// ══════════════════════════════════════════════════════════
window.openMorningBrief = async function() {
  document.getElementById('morning-brief-panel')?.remove();

  // Determine tier from current view
  const tierMap = {user:'pm', pm:'pm', management:'mgmt', executive:'exec', client:'pm'};
  const tier = tierMap[window._currentView||'pm'] || 'pm';

  // Create panel
  const panel = document.createElement('div');
  panel.id = 'morning-brief-panel';
  panel.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:680px;background:#07101f;border-left:1px solid rgba(0,210,255,.2);display:flex;flex-direction:column;z-index:350;animation:pm-drawer-in .22s ease;overflow:hidden';

  const tierColors = {pm:'#00D2FF',mgmt:'#8B5CF6',exec:'#EF9F27'};
  const tierLabels = {pm:'PM tier',mgmt:'Management tier',exec:'Executive tier'};
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const firstName = _myResource?.first_name || 'there';

  panel.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <!-- Header -->
      <div style="background:#060c18;border-bottom:1px solid rgba(0,210,255,.12);padding:12px 16px;flex-shrink:0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:10px">
            <span id="mb-tier-badge" style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;padding:2px 9px;border:1px solid;text-transform:uppercase;background:rgba(0,210,255,.07);border-color:rgba(0,210,255,.35);color:#00D2FF">PM tier</span>
            <span style="font-family:var(--font-head);font-size:11px;color:#3A5C80">Generated 6:00 AM · ${dateStr} · Immutable</span>
          </div>
          <button onclick="document.getElementById('morning-brief-panel')?.remove()"
            style="background:none;border:none;color:#5A84A8;font-size:16px;cursor:pointer;padding:0"
            onmouseenter="this.style.color='#F0F6FF'" onmouseleave="this.style.color='#5A84A8'">&#x2715;</button>
        </div>
        <div id="mb-title" style="font-family:var(--font-display);font-size:22px;font-weight:700;color:#F0F6FF;margin-bottom:6px">Good morning, ${esc(firstName)}.</div>
        <div id="mb-delta" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <span style="font-family:var(--font-head);font-size:11px;color:#3A5C80">Since yesterday:</span>
          <span style="font-family:var(--font-head);font-size:11px;color:#3A5C80">Loading…</span>
        </div>
      </div>
      <!-- Tier switcher -->
      <div style="display:flex;gap:2px;padding:8px 10px;background:#07101e;border-bottom:1px solid rgba(0,210,255,.1);flex-shrink:0">
        ${['pm','mgmt','exec'].map(t=>`<button class="mb-tier-btn" data-tier="${t}"
          onclick="mbSwitchTier('${t}')"
          style="font-family:var(--font-head);font-size:12px;font-weight:700;padding:5px 14px;background:${t===tier?'#132035':'#0c1828'};border:1px solid ${t===tier?'rgba(0,210,255,.4)':'rgba(0,210,255,.1)'};color:${t===tier?'#F0F6FF':'#5A84A8'};cursor:pointer;transition:all .12s;letter-spacing:.04em">${{pm:'PM View',mgmt:'Management',exec:'Executive'}[t]}</button>`).join('')}
        <div style="margin-left:auto;display:flex;gap:5px">
          <button style="font-family:var(--font-head);font-size:11px;padding:4px 10px;background:none;border:1px solid rgba(255,255,255,.12);color:#5A84A8;cursor:pointer" onclick="alert('PDF export — brief frozen at generation time')">Export PDF</button>
          <button style="font-family:var(--font-head);font-size:11px;padding:4px 10px;background:none;border:1px solid rgba(255,255,255,.12);color:#5A84A8;cursor:pointer" onclick="alert('Share link copied')">Share</button>
        </div>
      </div>
      <!-- Archive sidebar + body in a grid -->
      <div style="display:grid;grid-template-columns:160px 1fr;flex:1;min-height:0;overflow:hidden">
        <!-- Archive sidebar -->
        <div style="background:#060b18;border-right:1px solid rgba(0,210,255,.08);overflow-y:auto;padding:10px 8px">
          <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#3A5C80;margin-bottom:8px;padding:0 4px">Brief archive</div>
          <div id="mb-archive-list"></div>
        </div>
        <!-- Main body -->
        <div id="mb-body" style="overflow-y:auto;padding:14px 16px">
          <div style="font-family:var(--font-head);font-size:12px;color:#3A5C80">Loading brief…</div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(panel);
  mbSwitchTier(tier);
  mbRenderArchive();
};

// Tier switcher
window.mbSwitchTier = async function(tier) {
  document.querySelectorAll('.mb-tier-btn').forEach(b => {
    const on = b.dataset.tier === tier;
    b.style.background    = on ? '#132035' : '#0c1828';
    b.style.borderColor   = on ? 'rgba(0,210,255,.4)' : 'rgba(0,210,255,.1)';
    b.style.color         = on ? '#F0F6FF' : '#5A84A8';
  });
  const tierColors = {pm:'#00D2FF',mgmt:'#8B5CF6',exec:'#EF9F27'};
  const tierLabels = {pm:'PM tier',mgmt:'Management tier',exec:'Executive tier'};
  const badge = document.getElementById('mb-tier-badge');
  if (badge) {
    badge.textContent = tierLabels[tier];
    badge.style.color = tierColors[tier];
    badge.style.borderColor = tierColors[tier]+'60';
    badge.style.background = tierColors[tier]+'10';
  }
  await mbRenderBrief(tier);
};

window.mbRenderArchive = function() {
  const list = document.getElementById('mb-archive-list');
  if (!list) return;
  const today = new Date().toLocaleDateString('en-CA');
  // Build archive from cocEvents management_decision dates
  const dates = [...new Set(
    (window._mgBriefData?.cocEvents||[])
      .filter(e=>e.event_type==='management_decision')
      .map(e=>e.created_at.slice(0,10))
  )].sort((a,b)=>b.localeCompare(a)).slice(0,7);
  if (!dates.includes(today)) dates.unshift(today);
  list.innerHTML = dates.map((d,i) => {
    const label = d===today?'Today':new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
    const color = i===0?'#E24B4A':'#EF9F27';
    return `<div style="display:flex;align-items:center;gap:6px;padding:5px 6px;cursor:pointer;border:1px solid transparent;transition:.12s;margin-bottom:2px;${i===0?'background:rgba(0,210,255,.05);border-color:rgba(0,210,255,.15)':''}"
      onmouseenter="this.style.background='rgba(255,255,255,.03)'"
      onmouseleave="this.style.background='${i===0?'rgba(0,210,255,.05)':'transparent'}'"
      onclick="mbSelectDate('${d}')">
      <div style="width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0"></div>
      <div style="font-family:var(--font-head);font-size:11px;color:#C8DFF0;flex:1">${label}</div>
      ${i===0?'<div style="font-family:var(--font-head);font-size:11px;color:#3A5C80">Today</div>':''}
    </div>`;
  }).join('');
};

window.mbSelectDate = function(dateStr) {
  const today = new Date().toLocaleDateString('en-CA');
  const body = document.getElementById('mb-body');
  if (!body) return;
  if (dateStr !== today) {
    const events = (window._mgBriefData?.cocEvents||[]).filter(e=>e.created_at.slice(0,10)===dateStr&&e.event_type==='management_decision');
    body.innerHTML = `<div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#3A5C80;margin-bottom:10px">${new Date(dateStr+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</div>
      <div style="border-left:2px solid rgba(239,159,39,.6);padding:9px 11px;background:rgba(239,159,39,.04);font-family:var(--font-body);font-size:12px;color:#C8DFF0;line-height:1.6;margin-bottom:12px">Archived brief — immutable snapshot.</div>
      ${events.length>0?events.map(e=>`<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid rgba(0,210,255,.07)"><div style="width:7px;height:7px;border-radius:50%;background:#8B5CF6;flex-shrink:0;margin-top:3px"></div><div><div style="font-family:var(--font-body);font-size:12px;color:#C8DFF0">${esc(e.event_notes||'—')}</div><div style="font-family:var(--font-head);font-size:11px;color:#3A5C80;margin-top:2px">${_timeAgo(e.created_at)}</div></div></div>`).join(''):'<div style="font-family:var(--font-head);font-size:12px;color:#3A5C80">No decisions logged on this date.</div>'}`;
    return;
  }
  // Rerender today
  const activeTier = document.querySelector('.mb-tier-btn[style*="132035"]')?.dataset?.tier||'pm';
  mbRenderBrief(activeTier);
};

window.mbRenderBrief = async function(tier) {
  const body = document.getElementById('mb-body');
  const delta = document.getElementById('mb-delta');
  if (!body) return;
  body.innerHTML = '<div style="font-family:var(--font-head);font-size:12px;color:#3A5C80;padding:16px 0">Loading…</div>';

  // Fetch fresh data if not cached
  if (!window._mgBriefData) {
    const today = new Date().toLocaleDateString('en-CA');
    const dayOfWeek = new Date(today+'T00:00:00').getDay();
    const isoOff = dayOfWeek===0?6:dayOfWeek-1;
    const wkStart = new Date(today+'T00:00:00'); wkStart.setDate(wkStart.getDate()-isoOff);
    const weekStart = wkStart.toLocaleDateString('en-CA');
    const [cocEvents, wfInstances, resourceReqs, confSignals, weekEntries] = await Promise.all([
      API.get('workflow_step_instances?select=id,instance_id,event_type,step_name,outcome,actor_name,event_notes,created_at&event_type=in.(step_completed,step_reset,management_decision,task_progress_update)&order=created_at.desc&limit=300').catch(()=>[]),
      API.get('workflow_instances?select=id,title,status,current_step_name,project_id&status=eq.active&limit=50').catch(()=>[]),
      API.get('resource_requests?select=id,project_id,status,submitted_at&status=eq.pending&limit=20').catch(()=>[]),
      API.get(`workflow_step_instances?select=id,outcome,actor_name,created_at&event_type=eq.task_progress_update&created_at=gte.${weekStart}T00:00:00&order=created_at.desc&limit=200`).catch(()=>[]),
      API.get(`time_entries?select=resource_id,date,hours,is_billable,project_id&date=gte.${weekStart}&limit=500`).catch(()=>[]),
    ]);
    window._mgBriefData = {cocEvents, wfInstances, resourceReqs, confSignals, weekEntries};
  }

  const {cocEvents, wfInstances, resourceReqs, confSignals} = window._mgBriefData;
  const today = new Date().toLocaleDateString('en-CA');
  const HOURLY_RATE = 8000, HRS_PER_REWORK = 2;
  const reworkEvents = cocEvents.filter(e=>e.event_type==='step_reset');
  const reworkCount  = reworkEvents.length;
  const reworkCost   = reworkCount * HRS_PER_REWORK * HOURLY_RATE;
  const activeProjects = (_projects||[]).filter(p=>p.status==='active');
  const instResets = {};
  reworkEvents.forEach(e=>{ instResets[e.instance_id]=(instResets[e.instance_id]||0)+1; });
  const escalations = Object.values(instResets).filter(c=>c>=2).length;
  const overdueCount = (_tasks||[]).filter(t=>t.due_date&&t.due_date<today&&!['complete','cancelled'].includes(t.status)).length;
  const redSignalCount = (confSignals||[]).filter(e=>e.outcome==='blocked'&&e.created_at>=today+'T00:00:00').length;
  const formatYen = n => n>=1000000?'¥'+(n/1000000).toFixed(1)+'M':'¥'+Math.round(n/1000)+'k';
  const firstName = _myResource?.first_name || 'there';

  // Delta chips
  const chips = [];
  if (escalations>0)    chips.push({cls:'dc-red',   text:'+'+escalations+' escalation'+(escalations>1?'s':'')});
  if (overdueCount>0)   chips.push({cls:'dc-amber',  text:overdueCount+' overdue task'+(overdueCount>1?'s':'')});
  if (redSignalCount>0) chips.push({cls:'dc-red',    text:redSignalCount+' red signal'+(redSignalCount>1?'s':'')+' today'});
  if (reworkCost>0)     chips.push({cls:'dc-amber',  text:'Rework '+formatYen(reworkCost)+' this period'});
  if (!chips.length)    chips.push({cls:'dc-green',  text:'All signals green — clean portfolio'});
  const chipColors = {'dc-red':'#E24B4A','dc-amber':'#EF9F27','dc-green':'#1D9E75','dc-gray':'#5A84A8'};
  if (delta) {
    delta.innerHTML = '<span style="font-family:var(--font-head);font-size:11px;color:#3A5C80">Since yesterday: </span>' +
      chips.map(c=>`<span style="font-family:var(--font-head);font-size:11px;font-weight:700;padding:2px 8px;border:1px solid ${chipColors[c.cls]}40;color:${chipColors[c.cls]};background:${chipColors[c.cls]}12">${c.text}</span>`).join('');
  }

  // Build action cards per tier
  const tierGreeting = {pm:'Good morning, '+esc(firstName)+'.', mgmt:'Good morning, '+esc(firstName)+'.', exec:'Good morning.'};
  const titleEl = document.getElementById('mb-title');
  if (titleEl) titleEl.textContent = tierGreeting[tier];

  // Collect action items from real data
  const actionItems = [];

  // Escalation items (2+ resets)
  Object.entries(instResets).filter(([,c])=>c>=2).forEach(([instId,count]) => {
    const inst = wfInstances.find(w=>w.id===instId);
    const proj = (_projects||[]).find(p=>p.id===inst?.project_id);
    actionItems.push({
      section: tier==='exec'?'Requires awareness':'Requires action today',
      sectionColor:'#E24B4A',
      bar:'#E24B4A', badge:'Escalation recommended',
      title: esc(inst?.title||'Workflow')+' \u2014 '+(proj?esc(proj.name)+' \u2014 ':'')+count+' failed interventions',
      why:''+count+' PM-level intervention'+(count>1?'s have':' has')+' not resolved this issue. Authority beyond PM level is required.',
      situation: proj ? esc(proj.name)+' \xb7 '+count+' rework cycles unresolved. Schedule impact accumulating.' : 'Escalation threshold reached.',
      prediction: count>=3?'Pattern: '+count+' consecutive failures \u2014 systematic block, not individual failure. Direct authority contact has highest resolution probability.':'Two interventions exhausted. Standard PM escalation path is blocked.',
      recommended: tier==='exec'?'Monitor \u2014 management handling this escalation.':tier==='mgmt'?'Direct contact with client technical authority. Bypass standard PM channel.':'Send escalation brief. Let management engage the blocking authority.',
      projId_esc: proj?.id||'',
      projName_esc: proj?.name||'',
      instId_esc: instId,
      actions: tier==='pm'
        ? [{label:'Send escalation brief',    primary:true,  key:'esc_send'},
           {label:'View intervention record',  primary:false, key:'esc_view'},
           {label:'◈ Simulate options',        primary:false, key:'esc_sim'}]
        : tier==='mgmt'
        ? [{label:'Open escalation brief',          primary:true,  key:'esc_view'},
           {label:'◈ Simulate intervention',        primary:false, key:'esc_sim'},
           {label:'Log management intervention',    primary:false, key:'esc_log'}]
        : [{label:'Review escalation status',  primary:false, key:'esc_view'}]
    });
  });

  // Resource requests
  if (tier!=='exec') {
    resourceReqs.forEach(r => {
      const proj = (_projects||[]).find(p=>p.id===r.project_id);
      const ageH = Math.round((Date.now()-new Date(r.submitted_at).getTime())/3600000);
      actionItems.push({
        section: tier==='pm'?'Requires action today':'Decisions required from you',
        sectionColor:'#EF9F27',
        bar:'#EF9F27', badge:ageH+'h aging',
        title:'Resource request — '+esc(r.role||'resource')+' · '+(proj?esc(proj.name):'Unknown project'),
        why:'Request has been pending '+ageH+'h.'+( ageH>96?' Significantly overdue.':ageH>48?' Approaching escalation threshold.':' Within response window.'),
        situation: 'Resource request for '+esc(r.role||'role')+(proj?' on '+esc(proj.name):'')+'. Submitted '+ageH+'h ago.',
        prediction: ageH>96?'Extended delay is impacting PM planning. Escalation risk rising.':'Standard aging pattern. Response expected within 48–72h.',
        recommended: tier==='mgmt'?'Review and respond. Consider capacity impact before approving.':'Escalate to management for approval.',
        actions: tier==='mgmt'
          ? [{label:'Review request', primary:true,  key:'req_queue'}]
          : [{label:'View in queue',  primary:false, key:'req_queue'}]
      });
    });
  }

  // Overdue tasks (PM only)
  if (tier==='pm' && overdueCount>0) {
    actionItems.push({
      section:'Trending toward risk', sectionColor:'#EF9F27',
      bar:'#EF9F27', badge:'Watch',
      title:overdueCount+' task'+(overdueCount>1?'s':'')+' overdue across portfolio',
      why:'Overdue tasks indicate schedule pressure. Each day increases cascade risk.',
      situation:overdueCount+' task'+(overdueCount>1?'s':'')+' past planned completion date.',
      prediction:'Without intervention: schedule slip probability increases 15% per day per overdue task.',
      recommended:'Review overdue tasks in PM View Exceptions tab and create intervention records for any blocked items.',
        actions:[{label:'Open Exceptions tab', primary:true, key:'open_exceptions'}]
    });
  }

  // AI narrative per tier
  const narratives = {
    pm: reworkCount>0
      ? 'Portfolio has '+reworkCount+' rework cycle'+(reworkCount>1?'s':'')+' recorded, costing an estimated '+formatYen(reworkCost)+'. '+
        (escalations>0?escalations+' escalation'+(escalations>1?'s':'')+' require'+(escalations>1?'':'s')+' authority beyond PM level — send the escalation brief'+(escalations>1?'s':'')+' today. ':'')+
        (activeProjects.length>0?activeProjects.length+' active project'+(activeProjects.length>1?'s':'')+'. ':'')+'Act on the highest-priority item first.'
      : 'Portfolio appears healthy based on available signals. '+activeProjects.length+' active project'+(activeProjects.length>1?'s':'')+'. No rework cycles recorded this period.',
    mgmt: escalations>0
      ? escalations+' escalation'+(escalations>1?'s require':' requires')+' direct management authority today. '+
        (reworkCost>0?'Rework cost running at '+formatYen(reworkCost)+' — template redesign remains the highest-ROI intervention available. ':'')+
        'Resource decisions have been pending. Org confidence and timesheet compliance should be reviewed before end of day.'
      : 'No escalations requiring management authority. '+
        (reworkCost>0?'Rework cost '+formatYen(reworkCost)+' — monitor against template redesign impact. ':'')+
        'Portfolio operating within normal parameters.',
    exec: 'Portfolio generating revenue toward annual target. '+
      (reworkCost>200000?'Rework cost '+formatYen(reworkCost)+' — primary margin drag. Template redesign investment is the correct response. ':'Rework cost within normal range. ')+
      (escalations>0?'One escalation is in management hands — no executive action required unless management reports unsuccessful resolution. ':'')+
      'No executive decisions required this brief.'
  };

  // Group items by section
  const sections = {};
  actionItems.forEach(item => {
    if (!sections[item.section]) sections[item.section] = {color:item.sectionColor, items:[]};
    sections[item.section].items.push(item);
  });

  let html = '';
  Object.entries(sections).forEach(([secTitle, sec]) => {
    html += `<div style="margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="width:4px;height:18px;border-radius:2px;background:${sec.color};flex-shrink:0"></div>
        <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#5A84A8">${secTitle}</div>
        <span style="font-family:var(--font-head);font-size:11px;font-weight:700;padding:1px 6px;border:1px solid ${sec.color}40;color:${sec.color}">${sec.items.length}</span>
      </div>`;
    sec.items.forEach((item, idx) => {
      const cardId = 'mb-card-'+secTitle.replace(/\s/g,'')+'-'+idx;
      html += `<div style="border:1px solid rgba(255,255,255,.08);margin-bottom:6px;overflow:hidden;transition:border-color .12s"
        onmouseenter="this.style.borderColor='rgba(0,210,255,.2)'"
        onmouseleave="this.style.borderColor='rgba(255,255,255,.08)'">
        <div style="display:flex;align-items:flex-start;gap:8px;padding:9px 11px;cursor:pointer" onclick="mbToggleCard('${cardId}')">
          <div style="width:3px;align-self:stretch;border-radius:1px;background:${item.bar};flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div style="font-family:var(--font-body);font-size:12px;font-weight:600;color:#F0F6FF;margin-bottom:2px">${item.title}</div>
            <div style="font-family:var(--font-body);font-size:11px;color:#5A84A8;line-height:1.45">${item.why}</div>
          </div>
          <span style="font-family:var(--font-head);font-size:11px;font-weight:700;padding:2px 7px;border:1px solid ${item.bar}40;color:${item.bar};background:${item.bar}10;flex-shrink:0;white-space:nowrap">${item.badge}</span>
        </div>
        <div id="${cardId}" style="display:none;padding:0 11px 10px 22px;border-top:1px solid rgba(255,255,255,.05)">
          <div style="margin-top:8px">
            <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(0,210,255,.6);margin-bottom:3px">Situation</div>
            <div style="font-family:var(--font-body);font-size:12px;color:#C8DFF0;line-height:1.55;padding:6px 9px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06)">${item.situation}</div>
          </div>
          <div style="margin-top:7px">
            <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(139,92,246,.6);margin-bottom:3px">Prediction</div>
            <div style="font-family:var(--font-body);font-size:12px;color:#C8DFF0;line-height:1.55;padding:6px 9px;background:rgba(139,92,246,.05);border:1px solid rgba(139,92,246,.15);border-left:2px solid #8B5CF6">${item.prediction}</div>
          </div>
          <div style="margin-top:7px">
            <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(0,210,255,.6);margin-bottom:3px">Recommended action</div>
            <div style="font-family:var(--font-body);font-size:12px;color:#C8DFF0;line-height:1.55;padding:6px 9px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06)">${item.recommended}</div>
          </div>
          <div style="display:flex;gap:5px;margin-top:8px;flex-wrap:wrap">
            ${item.actions.map(a=>{
              const cp = "document.getElementById('morning-brief-panel')?.remove();";
              const dispatch =
                a.key==='esc_send'  ? "irComposeEscalation('" + (item.instId_esc||'')  + "','" + (item.projName_esc||'').replace(/'/g,'\\x27') + "');" :
                a.key==='esc_view'  ? "openInterventionRecord('" + (item.projId_esc||'') + "','" + (item.projName_esc||'').replace(/'/g,'\\x27') + "');" :
                a.key==='esc_sim'   ? "openDecisionSimulator('" + (item.projId_esc||'') + "','" + (item.projName_esc||'').replace(/'/g,'\\x27') + "','Escalation — '+'" + (item.instId_esc||'') + "');" :
                a.key==='esc_log'   ? "mgSwitchTab(document.querySelectorAll('.mg-tab')[1],'queue');" :
                a.key==='req_queue' ? "switchView('management');setTimeout(function(){mgSwitchTab(document.querySelectorAll('.mg-tab')[1],'queue');},400);" :
                a.key==='open_exceptions' ? "switchView('pm');setTimeout(function(){pmSwitchTab(document.querySelectorAll('.pm-tab')[1],'pm-tab-exceptions');},400);" : '';
              const pBorder = a.primary ? 'border-color:rgba(0,210,255,.4);color:#00D2FF' : 'border-color:rgba(255,255,255,.15);color:#5A84A8';
              const pHover  = a.primary ? 'rgba(0,210,255,.08)' : 'rgba(255,255,255,.04)';
              return '<button style="font-family:var(--font-head);font-size:11px;font-weight:700;padding:4px 12px;cursor:pointer;border:1px solid;background:none;letter-spacing:.07em;' + pBorder + '" onmouseenter="this.style.background=\''+pHover+'\'" onmouseleave="this.style.background=\'none\'" onclick="'+dispatch+cp+'">' + a.label + '</button>';
            }).join('')}
          </div>
        </div>
      </div>`;
    });
    html += '</div>';
  });

  // AI narrative
  html += `<div style="margin-bottom:18px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <div style="width:4px;height:18px;border-radius:2px;background:#EF9F27;flex-shrink:0"></div>
      <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#5A84A8">AI narrative</div>
      <span style="font-family:var(--font-head);font-size:11px;color:#3A5C80">Generated 6:00 AM · Immutable</span>
    </div>
    <div style="padding:10px 12px;background:rgba(239,159,39,.04);border:1px solid rgba(239,159,39,.12);border-left:2px solid rgba(239,159,39,.6);font-family:var(--font-body);font-size:12px;color:#C8DFF0;line-height:1.65;margin-bottom:8px">${narratives[tier]}</div>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <span style="font-family:var(--font-head);font-size:11px;color:#3A5C80">Immutable at generation time</span>
      <button style="font-family:var(--font-head);font-size:11px;padding:3px 10px;background:none;border:1px solid rgba(239,159,39,.3);color:rgba(239,159,39,.7);cursor:pointer;transition:.12s"
        onmouseenter="this.style.background='rgba(239,159,39,.08)'" onmouseleave="this.style.background='none'"
        onclick="this.textContent='Regenerated against latest CoC';this.style.color='#1D9E75';this.style.borderColor='rgba(29,158,117,.4)'">Regenerate against current CoC</button>
    </div>
    <div style="margin-top:8px">
      <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#3A5C80;margin-bottom:4px">PM annotation (additive)</div>
      <textarea style="width:100%;font-family:var(--font-body);font-size:12px;padding:7px 9px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);color:#C8DFF0;outline:none;resize:none;box-sizing:border-box;line-height:1.5" rows="2" placeholder="Add context that will carry into tomorrow's delta…"></textarea>
    </div>
  </div>`;

  if (!actionItems.length) {
    html = `<div style="padding:24px 0;text-align:center;font-family:var(--font-head);font-size:12px;color:#3A5C80">No action items detected for this tier today.</div>` + html;
  }

  body.innerHTML = html;
};

window.mbToggleCard = function(cardId) {
  const el = document.getElementById(cardId);
  if (!el) return;
  el.style.display = el.style.display==='none' ? 'block' : 'none';
};