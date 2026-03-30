// ══════════════════════════════════════════════════════════
// VIEW: MANAGEMENT
// ══════════════════════════════════════════════════════════
async function loadManagementView() {
  const content = document.getElementById('mgmt-content');
  if (!content) return;

  content.innerHTML = `<div style="padding:20px;font-family:var(--font-mono);font-size:12px;color:var(--text3)">Loading management view…</div>`;

  try {
    const today = new Date().toLocaleDateString('en-CA');
    const todayDate = new Date(today+'T00:00:00');
    const dayOfWeek = todayDate.getDay();
    const isoOffset = dayOfWeek===0?6:dayOfWeek-1;
    const weekStart = new Date(todayDate); weekStart.setDate(todayDate.getDate()-isoOffset);
    const weekDays = Array.from({length:5},(_,i)=>{ const d=new Date(weekStart); d.setDate(weekStart.getDate()+i); return d.toLocaleDateString('en-CA'); });

    const [wfInstances, cocEvents, resourceReqs, confSignals, weekEntries, actionItems] = await Promise.all([
      API.get('workflow_instances?select=id,title,status,current_step_name,project_id,launched_at&status=eq.active&limit=50').catch(()=>[]),
      API.get('workflow_step_instances?select=id,instance_id,event_type,step_name,outcome,actor_name,event_notes,created_at&event_type=in.(step_completed,step_reset,step_activated,task_progress_update,management_decision)&order=created_at.desc&limit=300').catch(()=>[]),
      API.get('resource_requests?select=id,project_id,status,submitted_at&status=eq.pending&order=submitted_at.asc&limit=20').catch(()=>[]),
      API.get(`workflow_step_instances?select=id,instance_id,event_type,outcome,actor_name,created_at&event_type=eq.task_progress_update&created_at=gte.${weekDays[0]}T00:00:00&order=created_at.desc&limit=300`).catch(()=>[]),
      API.get(`time_entries?date=gte.${weekDays[0]}&date=lte.${weekDays[4]}&select=id,project_id,resource_id,date,hours,is_billable&limit=500`).catch(()=>[]),
      API.get('workflow_action_items?status=eq.open&order=due_date.asc&limit=50').catch(()=>[]),
    ]);

    const activeProjects = _projects.filter(p=>p.status==='active');
    const HOURLY_RATE = 8000, HRS_PER_REWORK = 2;
    const reworkEvents = cocEvents.filter(e=>e.event_type==='step_reset');
    const reworkCount  = reworkEvents.length;
    const reworkCost   = reworkCount * HRS_PER_REWORK * HOURLY_RATE;
    const formatYen = n => n>=1000000 ? '¥'+(n/1000000).toFixed(1)+'M' : '¥'+Math.round(n/1000)+'k';

    // Stat cards
    const escalations = (() => {
      const map = {};
      reworkEvents.forEach(e => {
        const k = e.instance_id;
        if (!map[k]) map[k] = 0;
        map[k]++;
      });
      return Object.values(map).filter(c=>c>=2).length;
    })();

    const orgConfidence = (() => {
      const total = confSignals.length;
      if (!total) return null;
      const green = confSignals.filter(e=>e.outcome==='on_track').length;
      return Math.round(green/total*100);
    })();

    const wfTemplates = (() => {
      const tmap = {};
      reworkEvents.forEach(e => {
        const inst = wfInstances.find(w=>w.id===e.instance_id);
        if (!inst) return;
        const key = inst.title||inst.id;
        if (!tmap[key]) tmap[key] = {name:key, resets:0, completions:0};
        tmap[key].resets++;
      });
      cocEvents.filter(e=>e.event_type==='step_completed').forEach(e=>{
        const inst = wfInstances.find(w=>w.id===e.instance_id);
        if (!inst) return;
        const key = inst.title||inst.id;
        if (tmap[key]) tmap[key].completions++;
      });
      return Object.values(tmap).map(t=>({
        ...t,
        failureRate: t.completions>0 ? Math.round(t.resets/(t.resets+t.completions)*100) : (t.resets>0?100:0)
      })).sort((a,b)=>b.failureRate-a.failureRate);
    })();

    const redesignCount = wfTemplates.filter(t=>t.failureRate>=60).length;

    // Per-person sentiment arcs
    const resSentiment = {};
    confSignals.forEach(e=>{
      if(!e.actor_name) return;
      const d = e.created_at.slice(0,10);
      if(!weekDays.includes(d)) return;
      if(!resSentiment[e.actor_name]) resSentiment[e.actor_name]={};
      const prev = resSentiment[e.actor_name][d];
      const rank = {on_track:1,at_risk:2,blocked:3};
      if(!prev||(rank[e.outcome]||0)>(rank[prev]||0)) resSentiment[e.actor_name][d]=e.outcome||'on_track';
    });

    // Build decision queue items
    const queueItems = [];
    // Escalations (instances with 2+ resets)
    const instResets = {};
    reworkEvents.forEach(e=>{ instResets[e.instance_id]=(instResets[e.instance_id]||0)+1; });
    Object.entries(instResets).filter(([,c])=>c>=2).forEach(([instId,count])=>{
      const inst = wfInstances.find(w=>w.id===instId);
      const proj = _projects.find(p=>p.id===inst?.project_id);
      queueItems.push({type:'escalation',priority:'red',title:`${esc(inst?.title||'Workflow')} — ${count} failed interventions`,meta:`${esc(proj?.name||'—')} · ${count} rework cycles without resolution`,rec:`${count} interventions have not resolved this. Requires authority beyond PM level.`,instId,projId:inst?.project_id});
    });
    // Resource requests
    resourceReqs.forEach(r=>{
      const proj = _projects.find(p=>p.id===r.project_id);
      const ageH = Math.round((Date.now()-new Date(r.submitted_at).getTime())/3600000);
      queueItems.push({type:'resource',priority:ageH>48?'red':'amber',title:`Resource request — ${esc(r.role||'Resource')} for ${esc(proj?.name||'—')}`,meta:`Submitted ${ageH}h ago`,rec:ageH>96?`Aging ${ageH}h — requires response`:`Request pending ${ageH}h`,reqId:r.id,projId:r.project_id,age:ageH});
    });

    // Health grid per project
    function dotColor(score) { return score>=0.85?'#1D9E75':score>=0.65?'#EF9F27':'#E24B4A'; }
    function projectHealthDots(p) {
      const projTasks    = _tasks.filter(t=>t.project_id===p.id);
      const overdue      = projTasks.filter(t=>t.due_date&&t.due_date<today&&!['complete','cancelled'].includes(t.status));
      const projInsts    = wfInstances.filter(w=>w.project_id===p.id);
      const projResets   = reworkEvents.filter(e=>projInsts.some(i=>i.id===e.instance_id));
      const projCompleted= cocEvents.filter(e=>e.event_type==='step_completed'&&projInsts.some(i=>i.id===e.instance_id)).length;
      const projEntries  = weekEntries.filter(e=>e.project_id===p.id);
      const projResIds   = new Set(projEntries.map(e=>e.resource_id));
      const taskAssigned = new Set(_tasks.filter(t=>t.project_id===p.id&&t.assigned_to).map(t=>t.assigned_to));
      const projSigs     = confSignals.filter(e=>projInsts.some(i=>i.id===e.instance_id)||projEntries.some(te=>te.resource_id===e.resource_id));
      const hasEsc       = Object.entries(instResets).some(([id,c])=>c>=2&&wfInstances.find(w=>w.id===id)?.project_id===p.id);

      // Honest scores: null = no data (grey), number = scored
      const schedScore = projTasks.length>0 ? 1-(overdue.length/Math.max(projTasks.length,1)) : null;
      const costScore  = p.cpi ? Math.min(parseFloat(p.cpi),1) : null;
      const confScore  = projSigs.length>0 ? projSigs.filter(e=>e.outcome==='on_track').length/projSigs.length : null;
      const reworkScore= projResets.length>0||projCompleted>0 ? (projCompleted>0 ? Math.max(0,1-projResets.length/Math.max(projCompleted,1)) : 0.2) : null;
      const tsScore    = taskAssigned.size>0 ? projResIds.size/taskAssigned.size : null;
      const escScore   = hasEsc ? 0.1 : null;

      function scoreColor(s) {
        if (s===null) return '#2A4060'; // grey = no data
        return s>=0.85?'#1D9E75':s>=0.65?'#EF9F27':'#E24B4A';
      }
      // Expose counts for expand row
      return [
        {label:'Schedule',   score:schedScore, color:scoreColor(schedScore),   overdue:overdue.length,   total:projTasks.length},
        {label:'Cost',       score:costScore,  color:scoreColor(costScore)},
        {label:'Confidence', score:confScore,  color:scoreColor(confScore),    sigCount:projSigs.length, greenSigs:projSigs.filter(e=>e.outcome==='on_track').length},
        {label:'Rework',     score:reworkScore,color:scoreColor(reworkScore),  resets:projResets.length, completions:projCompleted},
        {label:'Timesheets', score:tsScore,    color:scoreColor(tsScore),      logged:projResIds.size,   expected:taskAssigned.size},
        {label:'Escalations',score:escScore,   color:scoreColor(escScore),     hasEsc},
      ];
    }

    // ── Pairing intelligence — actor with highest rejection rate ──────
    const actorResets = {};
    reworkEvents.forEach(e=>{ if(e.actor_name){actorResets[e.actor_name]=(actorResets[e.actor_name]||0)+1;} });
    const topActor = Object.entries(actorResets).sort(([,a],[,b])=>b-a)[0];
    const topActorTotal = topActor ? (cocEvents.filter(e=>e.actor_name===topActor[0]&&(e.event_type==='step_completed'||e.event_type==='step_reset')).length||1) : 0;
    const topActorRate = topActor ? Math.round(topActor[1]/topActorTotal*100) : 0;
    const firmAvgRate  = reworkCount + cocEvents.filter(e=>e.event_type==='step_completed').length > 0
      ? Math.round(reworkCount/(reworkCount+cocEvents.filter(e=>e.event_type==='step_completed').length)*100) : 0;

    // ── Build management brief bullets ───────────────────
    const briefItems = [];
    if (escalations > 0) briefItems.push({color:'#E24B4A',text:`${escalations} escalation${escalations>1?'s':''} — workflow${escalations>1?'s':''} with ${escalations>1?'repeated':'2+'} failed intervention${escalations>1?'s':''}`,tab:'queue'});
    if (resourceReqs.length > 0) briefItems.push({color:'#E24B4A',text:`${resourceReqs.length} resource request${resourceReqs.length>1?'s':''} aging — oldest ${Math.round((Date.now()-new Date(resourceReqs[0].submitted_at).getTime())/3600000)}h`,tab:'queue'});
    if (redesignCount > 0) briefItems.push({color:'#EF9F27',text:`${redesignCount} workflow template${redesignCount>1?'s':''} at redesign threshold`,tab:'workflows'});
    if (topActor && topActorRate > firmAvgRate+20) briefItems.push({color:'#EF9F27',text:`${esc(topActor[0])} — ${topActorRate}% reset rate vs ${firmAvgRate}% firm avg — pairing issue`,tab:'people'});
    const greenProjs = activeProjects.filter(p=>{ const dots=projectHealthDots(p); return dots.every(d=>d.score>=0.8); });
    if (greenProjs.length) briefItems.push({color:'#1D9E75',text:`${greenProjs.map(p=>esc(p.name)).join(', ')} — all health dimensions green`,tab:'overview'});

    // Build mgProjStats for expand row closure (mirrors PM view projStats shape)
    const mgProjStats = activeProjects.map(p => {
      const projTasks    = _tasks.filter(t=>t.project_id===p.id);
      const overdueTasks = projTasks.filter(t=>t.due_date&&t.due_date<today&&!['complete','cancelled'].includes(t.status));
      const projInsts    = wfInstances.filter(w=>w.project_id===p.id);
      const projFlags    = Object.entries(instResets).filter(([id,c])=>c>=2&&wfInstances.find(w=>w.id===id)?.project_id===p.id);
      const projCoc      = cocEvents.filter(e=>projInsts.some(i=>i.id===e.instance_id)).slice(0,6);
      return { p, projTasks, overdueTasks, projInsts, projFlags, projCoc };
    });

    // ─────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────
    const s = document.createElement('style');
    s.id='mgmt-styles';
    s.textContent=`
      .mg-wrap{padding:0;background:#070c1a}
      .mg-sstrip{display:grid;grid-template-columns:repeat(5,1fr);border-bottom:1px solid rgba(0,210,255,.1);background:#060b18}
      .mg-sc{padding:10px 14px;border-right:1px solid rgba(0,210,255,.08)}
      .mg-sc:last-child{border-right:none}
      .mg-sc-lbl{font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.09em;color:#3A5C80;margin-bottom:3px;text-transform:uppercase}
      .mg-sc-val{font-family:var(--font-mono);font-size:24px;font-weight:700;line-height:1}
      .mg-sc-sub{font-family:var(--font-mono);font-size:11px;color:#3A5C80;margin-top:2px}
      .mg-tabs{display:flex;gap:2px;padding:8px 10px;background:#07101f;border-bottom:1px solid rgba(0,210,255,.12)}
      .mg-tab{font-family:var(--font-mono);font-size:13px;font-weight:700;letter-spacing:.04em;padding:6px 16px;cursor:pointer;color:#5A84A8;background:#0c1828;border:1px solid rgba(0,210,255,.1);display:flex;align-items:center;gap:6px;transition:all .12s}
      .mg-tab.on{color:#F0F6FF;background:#132035;border-color:rgba(0,210,255,.4)}
      .mg-tab:hover:not(.on){color:#90B8D8;background:#0e1e30}
      .mg-tbadge{font-size:11px;font-weight:700;padding:1px 6px;border-radius:2px}
      .mg-body{padding:10px 12px}
      .mg-panel{background:#0d1a2e;border:1px solid rgba(0,210,255,.1);margin-bottom:10px}
      .mg-panel-head{display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-bottom:1px solid rgba(0,210,255,.08);background:#07101e}
      .mg-panel-title{font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#3A5C80}
      .mg-overview{display:grid;grid-template-columns:1fr 280px;gap:10px}
      .mg-hgrid{width:100%;border-collapse:collapse}
      .mg-hgrid th{padding:5px 10px;font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.08em;color:#3A5C80;text-transform:uppercase;border-bottom:1px solid rgba(0,210,255,.08)}
      .mg-hgrid th:first-child{text-align:left;min-width:140px}
      .mg-hgrid td{padding:7px 10px;border-bottom:1px solid rgba(0,210,255,.06)}
      .mg-hgrid td:first-child{font-family:var(--font-body);font-size:12px;color:#C8DFF0}
      .mg-hgrid td:not(:first-child){text-align:center}
      .mg-dot{width:13px;height:13px;border-radius:50%;display:inline-block;cursor:pointer;transition:transform .12s}
      .mg-dot:hover{transform:scale(1.3)}
      .mg-brief-item{display:flex;align-items:flex-start;gap:7px;padding:6px 0;border-bottom:1px solid rgba(0,210,255,.07);cursor:pointer;font-family:var(--font-body);font-size:12px;color:#C8DFF0;line-height:1.5}
      .mg-brief-item:last-child{border-bottom:none}
      .mg-pair-box{background:#091522;border:1px solid rgba(0,210,255,.1);padding:10px 12px;margin:8px 12px}
      .mg-queue-item{display:flex;align-items:flex-start;gap:8px;padding:9px 12px;border-bottom:1px solid rgba(0,210,255,.07)}
      .mg-qpriority{width:3px;align-self:stretch;flex-shrink:0;border-radius:1px}
      .mg-qtype{font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#3A5C80;margin-bottom:2px}
      .mg-qtitle{font-family:var(--font-body);font-size:12px;font-weight:500;color:#F0F6FF;margin-bottom:2px}
      .mg-qmeta{font-family:var(--font-mono);font-size:11px;color:#4A6E90}
      .mg-qrec{font-family:var(--font-mono);font-size:11px;color:#00D2FF;margin-top:4px;padding:3px 7px;background:rgba(0,210,255,.06);border:1px solid rgba(0,210,255,.15)}
      .mg-qa{display:flex;gap:4px;margin-top:7px}
      .mg-btn{font-family:var(--font-mono);font-size:11px;font-weight:700;padding:4px 10px;cursor:pointer;border:1px solid;background:none;letter-spacing:.06em;transition:background .1s}
      .mg-btn-g{color:#1D9E75;border-color:rgba(29,158,117,.4)}.mg-btn-g:hover{background:rgba(29,158,117,.1)}
      .mg-btn-r{color:#E24B4A;border-color:rgba(226,75,74,.4)}.mg-btn-r:hover{background:rgba(226,75,74,.08)}
      .mg-btn-c{color:#00D2FF;border-color:rgba(0,210,255,.35)}.mg-btn-c:hover{background:rgba(0,210,255,.08)}
      .mg-pc{border:1px solid rgba(255,255,255,.08);padding:10px 12px;margin-bottom:6px;cursor:pointer;transition:border-color .12s;background:#0d1a2e}
      .mg-pc:hover{border-color:rgba(0,210,255,.2)}
      .mg-arc{display:flex;align-items:center;gap:3px;margin-top:6px}
      .mg-arc-dot{width:13px;height:13px;border-radius:50%;flex-shrink:0}
      .mg-arc-line{width:10px;height:1.5px;background:rgba(255,255,255,.15);flex-shrink:0}
      .mg-wf-row{display:flex;align-items:flex-start;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(0,210,255,.07);cursor:pointer;transition:background .1s}
      .mg-wf-row:hover{background:rgba(255,255,255,.02)}
      .mg-wf-bar{height:5px;background:rgba(255,255,255,.06);flex:1;border-radius:1px;overflow:hidden;margin-top:3px}
      .mg-wf-fill{height:100%;border-radius:1px}
      .mg-dl-row{display:flex;align-items:flex-start;gap:8px;padding:7px 12px;border-bottom:1px solid rgba(0,210,255,.07)}
      .mg-dl-badge{font-family:var(--font-mono);font-size:11px;font-weight:700;padding:2px 8px;border:1px solid;letter-spacing:.05em;flex-shrink:0;white-space:nowrap}
      .mg-dl-text{font-family:var(--font-body);font-size:12px;color:#C8DFF0;flex:1;line-height:1.5}
      .mg-dl-meta{font-family:var(--font-mono);font-size:11px;color:#3A5C80;margin-top:2px}
      .mg-tc{display:none}.mg-tc.on{display:block}
      .mg-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:300;display:none;align-items:center;justify-content:center}
      .mg-modal-overlay.on{display:flex}
      .mg-modal{background:#0f1e35;border:1px solid rgba(0,210,255,.25);width:500px;max-height:82vh;overflow-y:auto}
      .mg-modal-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(0,210,255,.12)}
      .mg-modal-title{font-family:var(--font-mono);font-size:16px;font-weight:700;color:#F0F6FF}
      .mg-modal-close{background:none;border:1px solid rgba(255,255,255,.15);color:#5A84A8;width:22px;height:22px;cursor:pointer;font-size:14px}
      .mg-modal-body{padding:14px;font-family:var(--font-body);font-size:12px;color:#C8DFF0;line-height:1.6}
      .mg-modal-section{font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#00D2FF;margin:10px 0 5px}
      .mg-modal-section:first-child{margin-top:0}
      .mg-modal-block{padding:8px 10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);font-size:12px;color:#C8DFF0;line-height:1.55;margin-bottom:6px}
      .mg-modal-ai{border-left:2px solid #EF9F27;background:rgba(239,159,39,.04)}
      .mg-modal-input{width:100%;padding:6px 9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#C8DFF0;font-family:var(--font-body);font-size:12px;outline:none;resize:none;margin-top:4px}
      .mg-modal-input:focus{border-color:rgba(0,210,255,.3)}
      .mg-modal-select{width:100%;padding:5px 8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#C8DFF0;font-family:var(--font-mono);font-size:12px;outline:none;cursor:pointer;margin-bottom:6px}
    `;
    if (!document.getElementById('mgmt-styles')) document.head.appendChild(s);

    // ─────────────────────────────────────────────────────
    // Module-level management event functions
    // ─────────────────────────────────────────────────────
    window.mgOpenWfModal = function(el) {
      const name  = el.dataset.wfName;
      const rate  = el.dataset.wfRate;
      const resets= el.dataset.wfResets;
      const comp  = el.dataset.wfComp;
      const narr  = el.dataset.aiNarr;
      const act   = el.dataset.actionHtml;
      mgOpenModal(name + ' — Cross-instance analysis',
        '<div class="mg-modal-section">Failure rate</div>' +
        '<div class="mg-modal-block">' + rate + '% own-failure rate · ' + resets + ' resets · ' + comp + ' completions</div>' +
        '<div class="mg-modal-section">AI narrative</div>' +
        '<div class="mg-modal-block mg-modal-ai">' + narr + '</div>' +
        (act ? act : '')
      );
    };
    window.mgOpenLogDecisionModal = function() {
      const body = '<div class="mg-modal-section">Decision type</div>' +
        '<select id="mg-dec-type" class="mg-modal-select"><option>Escalation</option><option>Resource</option><option>Process</option><option>Budget</option><option>People</option></select>' +
        '<div class="mg-modal-section">Decision &amp; reasoning</div>' +
        '<textarea id="mg-dec-text" class="mg-modal-input" rows="3" placeholder="Describe the decision and reasoning…"></textarea>' +
        '<div style="display:flex;gap:6px;margin-top:10px">' +
        '<button class="mg-btn mg-btn-c" onclick="mgLogDecision()">Log decision →</button>' +
        '<button class="mg-btn" style="border-color:rgba(255,255,255,.2);color:#5A84A8" onclick="mgCloseModal()">Cancel</button>' +
        '</div>';
      mgOpenModal('Log a management decision', body);
    };
    window.mgSwitchTab = function(el, name) {
      document.querySelectorAll('.mg-tab').forEach(t=>t.classList.remove('on'));
      document.querySelectorAll('.mg-tc').forEach(c=>c.classList.remove('on'));
      el.classList.add('on');
      const panel = document.getElementById('mg-tc-'+name);
      if (panel) panel.classList.add('on');
    };
    window.mgOpenModal = function(title, bodyHtml) {
      document.getElementById('mg-modal-title').textContent = title;
      document.getElementById('mg-modal-body').innerHTML = bodyHtml;
      document.getElementById('mg-modal-overlay').classList.add('on');
    };
    window.mgCloseModal = function() {
      document.getElementById('mg-modal-overlay').classList.remove('on');
    };

    // ── #5 Stat card tooltips ─────────────────────────────
    window.mgStatHover = function(el, content) {
      let tip = document.getElementById('mg-stat-tip');
      if (!tip) {
        tip = document.createElement('div');
        tip.id = 'mg-stat-tip';
        tip.style.cssText = 'position:fixed;z-index:400;background:#0d1e35;border:1px solid rgba(0,210,255,.3);padding:10px 13px;min-width:220px;max-width:340px;font-family:var(--font-mono);font-size:11px;color:#C8DFF0;line-height:1.7;box-shadow:0 8px 32px rgba(0,0,0,.7)';
        document.body.appendChild(tip);
      }
      const r = el.getBoundingClientRect();
      tip.innerHTML = content;
      tip.style.display = 'block';
      tip.style.left = r.left + 'px';
      tip.style.top  = (r.bottom + 6) + 'px';
    };
    window.mgStatLeave = function() {
      const tip = document.getElementById('mg-stat-tip');
      if (tip) tip.style.display = 'none';
    };

    // ── #1 Health grid row expand ──────────────────────────
    window.mgExpandRow = function(projId) {
      const allExp = document.querySelectorAll('.mg-row-expanded');
      const tr = document.getElementById('mg-tr-'+projId);
      const existing = document.getElementById('mg-exp-'+projId);
      allExp.forEach(e => { if (e.id !== 'mg-exp-'+projId) e.remove(); });
      document.querySelectorAll('.mg-hgrid tr.selected').forEach(r=>r.classList.remove('selected'));
      if (existing) { existing.remove(); tr.style.background=''; return; }
      const ps = mgProjStats.find(p=>p.p.id===projId);
      if (!ps || !tr) return;
      tr.classList.add('selected');
      tr.style.background = 'rgba(0,210,255,.06)';
      const dots = projectHealthDots(ps.p);
      const dimRows = dots.map(d => {
        let reason;
        if (d.score === null) {
          reason = 'No data this week';
        } else if (d.label==='Schedule') {
          reason = d.overdue>0 ? d.overdue+' overdue of '+d.total+' tasks · '+ps.overdueTasks.slice(0,3).map(t=>esc(t.name||'task')).join(', ')+(ps.overdueTasks.length>3?' +more':'') : 'All '+d.total+' tasks on schedule';
        } else if (d.label==='Cost') {
          reason = ps.p.cpi ? 'CPI '+parseFloat(ps.p.cpi).toFixed(2) : 'CPI not available';
        } else if (d.label==='Confidence') {
          reason = d.sigCount===0 ? 'No signals posted this week' : d.greenSigs+' green / '+d.sigCount+' total signals ('+Math.round(d.greenSigs/d.sigCount*100)+'%)';
        } else if (d.label==='Rework') {
          reason = d.resets===0&&d.completions===0 ? 'No workflow activity this week' : d.resets+' reset'+(d.resets!==1?'s':'')+' · '+d.completions+' completion'+(d.completions!==1?'s':'');
        } else if (d.label==='Timesheets') {
          reason = d.expected===0 ? 'No assigned resources found' : d.logged+' / '+d.expected+' assigned resources logged time this week';
        } else if (d.label==='Escalations') {
          reason = d.hasEsc ? 'Active escalation — 2+ failed interventions' : 'No escalations';
        }
        const col = d.color;
        return `<div style="display:flex;align-items:baseline;gap:10px;padding:4px 0;border-bottom:1px solid rgba(0,210,255,.06)">
          <div style="width:9px;height:9px;border-radius:50%;background:${col};flex-shrink:0;margin-top:2px"></div>
          <div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:#90B8D8;min-width:88px">${d.label}</div>
          <div style="font-family:var(--font-mono);font-size:11px;color:#C8DFF0;flex:1">${d.score===null?'No data':Math.round(d.score*100)+'%'} · ${reason}</div>
        </div>`;
      }).join('');
      const exp = document.createElement('tr');
      exp.id = 'mg-exp-'+projId;
      exp.className = 'mg-row-expanded';
      exp.innerHTML = `<td colspan="7" style="padding:10px 14px;background:#091522;border-left:3px solid rgba(0,210,255,.3)">
        <div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#3A5C80;margin-bottom:6px">${esc(ps.p.name)} — Health breakdown</div>
        ${dimRows}
        ${ps.projCoc.length>0?`<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#3A5C80;margin-top:8px;margin-bottom:4px">Recent CoC events</div>
          ${ps.projCoc.slice(0,3).map(e=>`<div style="font-family:var(--font-mono);font-size:11px;color:#C8DFF0;padding:3px 0">${e.event_type==='step_reset'?'↩':'✓'} ${esc(e.step_name||'—')} · ${_timeAgo(e.created_at)}${e.actor_name?' · '+esc(e.actor_name):''}</div>`).join('')}`:''}
      </td>`;
      tr.insertAdjacentElement('afterend', exp);
    };

    // ── #2 Queue item expand ───────────────────────────────
    window.mgExpandQueue = function(qi) {
      const existing = document.getElementById('mg-qexp-'+qi);
      const row = document.getElementById('mg-qi-'+qi);
      if (!row) return;
      if (existing) { existing.remove(); row.style.background=''; return; }
      document.querySelectorAll('.mg-qexp').forEach(e=>e.remove());
      document.querySelectorAll('.mg-queue-item').forEach(r=>r.style.background='');
      row.style.background = 'rgba(0,210,255,.04)';
      const q = queueItems[qi];
      if (!q) return;
      const exp = document.createElement('div');
      exp.id = 'mg-qexp-'+qi;
      exp.className = 'mg-qexp';
      exp.style.cssText = 'padding:10px 12px 12px 20px;background:#091522;border-left:3px solid rgba(0,210,255,.2);border-bottom:1px solid rgba(0,210,255,.1)';
      let html = '';
      if (q.type === 'escalation') {
        const projResets = (reworkEvents||[]).filter(e=>wfInstances.find(w=>w.id===e.instance_id)?.project_id===q.projId);
        html += `<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#E24B4A;margin-bottom:6px">Intervention history</div>`;
        if (projResets.length > 0) {
          const grouped = {};
          projResets.forEach(e=>{ grouped[e.instance_id]=(grouped[e.instance_id]||[]); grouped[e.instance_id].push(e); });
          Object.entries(grouped).forEach(([instId, evts]) => {
            const inst = wfInstances.find(w=>w.id===instId);
            html += `<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:#90B8D8;margin-bottom:3px">${esc(inst?.title||instId)}</div>`;
            evts.forEach(e=>{
              html += `<div style="display:flex;gap:8px;align-items:baseline;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)">
                <div style="width:7px;height:7px;border-radius:50%;background:#E24B4A;flex-shrink:0;margin-top:2px"></div>
                <div style="font-family:var(--font-mono);font-size:11px;color:#C8DFF0;flex:1">${esc(e.step_name||'Step reset')}${e.event_notes?' — '+esc(e.event_notes.slice(0,80)):''}</div>
                <div style="font-family:var(--font-data);font-size:11px;color:#3A5C80;flex-shrink:0">${_timeAgo(e.created_at)}</div>
              </div>`;
            });
          });
          html += `<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#EF9F27;margin:8px 0 4px">Assessment</div>
            <div style="font-family:var(--font-body);font-size:12px;color:#C8DFF0;line-height:1.55;padding:7px 9px;background:rgba(239,159,39,.05);border-left:2px solid #EF9F27">${instResets.length>=2 ? 'Two or more PM-level interventions have not resolved this issue. The blocking factor appears to require authority beyond PM level — likely direct client authority, an expedited sign-off channel, or a change in the approval architecture.' : 'Single reset on record. PM is managing. Monitor for recurrence before escalating.'}</div>`;
        } else {
          html += `<div style="font-family:var(--font-mono);font-size:12px;color:#3A5C80">No CoC intervention history found for this project.</div>`;
        }
      } else {
        const r = resourceReqs.find(req=>req.id===q.reqId);
        const ageH = r ? Math.round((Date.now()-new Date(r.submitted_at).getTime())/3600000) : q.age;
        html += `<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#EF9F27;margin-bottom:6px">Request detail</div>
          <div style="font-family:var(--font-mono);font-size:11px;color:#C8DFF0">Submitted ${ageH}h ago · Status: pending</div>
          <div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#EF9F27;margin:8px 0 4px">Assessment</div>
          <div style="font-family:var(--font-body);font-size:12px;color:#C8DFF0;line-height:1.55;padding:7px 9px;background:rgba(239,159,39,.05);border-left:2px solid #EF9F27">Request has been pending ${ageH}h. ${ageH>96?'Significantly overdue for response — resource planning impact increasing.':ageH>48?'Aging beyond healthy threshold. PM is blocked on staffing decision.':'Within normal response window.'}</div>`;
      }
      exp.innerHTML = html;
      row.insertAdjacentElement('afterend', exp);
    };

    // ── #3/#4 People — per-project billable breakdown ──────
    window.mgShowPerson = function(fullName, arcStr, weekHrs, taskCount) {
      const r = _resources.find(r=>(r.first_name+' '+r.last_name).trim()===fullName);
      const hasRed = arcStr.includes('R');
      const redIdx = arcStr.indexOf('R'), greenIdx = arcStr.indexOf('G');
      const narrative = hasRed
        ? (redIdx > greenIdx
            ? 'Degradation pattern detected. Review what changed on the day the arc shifted — upstream block or relationship friction is more likely than individual performance failure.'
            : 'Persistent issues this week. Consider direct check-in.')
        : 'Clean week. No pattern concerns.';
      // Per-project billable breakdown
      const projEntries = (weekEntries||[]).filter(e=>e.resource_id===r?.id);
      const byProj = {};
      projEntries.forEach(e => {
        const proj = _projects.find(p=>p.id===e.project_id);
        const k = proj?.name||e.project_id||'Unknown';
        if (!byProj[k]) byProj[k] = {bill:0, nonbill:0, days:{}};
        if (e.is_billable) byProj[k].bill += parseFloat(e.hours||0);
        else byProj[k].nonbill += parseFloat(e.hours||0);
        byProj[k].days[e.date] = (byProj[k].days[e.date]||0) + parseFloat(e.hours||0);
      });
      const dayLbls = ['M','T','W','Th','F'];
      const projBreakdownHtml = Object.entries(byProj).length > 0
        ? Object.entries(byProj).map(([pname, v]) => {
            const tot = v.bill + v.nonbill;
            const billPct = tot > 0 ? Math.round(v.bill/tot*100) : 0;
            const dayBar = weekDays.map((d,i) => {
              const h = v.days[d]||0;
              return `<div style="text-align:center">
                <div style="font-family:var(--font-mono);font-size:11px;color:#3A5C80">${dayLbls[i]}</div>
                <div style="height:22px;width:18px;background:rgba(255,255,255,.06);border-radius:1px;overflow:hidden;margin:2px auto 0;position:relative">
                  ${h>0?`<div style="position:absolute;bottom:0;left:0;right:0;height:${Math.min(100,h/8*100)}%;background:var(--compass-cyan);opacity:.8"></div>`:''}
                </div>
                <div style="font-family:var(--font-mono);font-size:11px;color:#C8DFF0;margin-top:2px">${h>0?h.toFixed(1):'—'}</div>
              </div>`;
            }).join('');
            return `<div style="background:#091522;border:1px solid rgba(0,210,255,.1);padding:8px 10px;margin-bottom:6px">
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
                <span style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:#90B8D8">${esc(pname)}</span>
                <span style="font-family:var(--font-mono);font-size:11px;color:#3A5C80">${tot.toFixed(1)}h · <span style="color:var(--compass-cyan)">${v.bill.toFixed(1)}h bill</span> / <span style="color:#8B5CF6">${v.nonbill.toFixed(1)}h non-bill</span></span>
              </div>
              <div style="height:3px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden;margin-bottom:6px">
                <div style="height:100%;width:${billPct}%;background:var(--compass-cyan);border-radius:2px"></div>
              </div>
              <div style="display:flex;gap:8px;justify-content:space-between">${dayBar}</div>
            </div>`;
          }).join('')
        : `<div style="font-family:var(--font-mono);font-size:12px;color:#3A5C80">No time entries this week</div>`;
      const body = `
        <div class="mg-modal-section">Week arc — ${arcStr}</div>
        <div style="display:flex;gap:10px;margin-bottom:10px">
          ${arcStr.split('→').map((s,i)=>{
            const c=s==='G'?'#1D9E75':s==='Y'?'#EF9F27':s==='R'?'#E24B4A':'rgba(255,255,255,.12)';
            return `<div style="text-align:center"><div style="width:14px;height:14px;border-radius:50%;background:${c};margin:0 auto"></div><div style="font-family:var(--font-mono);font-size:11px;color:#3A5C80;margin-top:3px">${['M','T','W','Th','F'][i]||''}</div></div>`;
          }).join('')}
          <div style="margin-left:auto;text-align:right">
            <div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--compass-cyan)">${weekHrs}h</div>
            <div style="font-family:var(--font-mono);font-size:11px;color:#3A5C80">${taskCount} open tasks</div>
          </div>
        </div>
        <div class="mg-modal-section">Billable vs non-billable by project</div>
        ${projBreakdownHtml}
        <div class="mg-modal-section">AI narrative</div>
        <div class="mg-modal-block mg-modal-ai">${narrative}</div>`;
      mgOpenModal(fullName + ' — Week summary', body);
    };

    // ── #7 Respond escalation — AI radio recommendations ──
    window.mgRespondEscalation = function(title, situationText) {
      const bodyHtml = `
        <div class="mg-modal-section">Situation</div>
        <div class="mg-modal-block">${situationText}</div>
        <div class="mg-modal-section">AI recommendations — select one</div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">
          <label style="display:flex;align-items:flex-start;gap:8px;padding:7px 9px;background:rgba(0,210,255,.04);border:1px solid rgba(0,210,255,.12);cursor:pointer">
            <input type="radio" name="mg-esc-action" value="direct" style="margin-top:2px;accent-color:var(--compass-cyan)">
            <div><div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:#F0F6FF">Handle directly</div><div style="font-family:var(--font-body);font-size:11px;color:#5A84A8">Contact the blocking authority yourself — escalates above PM and account manager level</div></div>
          </label>
          <label style="display:flex;align-items:flex-start;gap:8px;padding:7px 9px;background:rgba(0,210,255,.04);border:1px solid rgba(0,210,255,.12);cursor:pointer">
            <input type="radio" name="mg-esc-action" value="guide" style="margin-top:2px;accent-color:var(--compass-cyan)">
            <div><div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:#F0F6FF">Send guidance to PM</div><div style="font-family:var(--font-body);font-size:11px;color:#5A84A8">Provide PM with a specific escalation path or alternative approach to try</div></div>
          </label>
          <label style="display:flex;align-items:flex-start;gap:8px;padding:7px 9px;background:rgba(0,210,255,.04);border:1px solid rgba(0,210,255,.12);cursor:pointer">
            <input type="radio" name="mg-esc-action" value="executive" style="margin-top:2px;accent-color:var(--compass-cyan)">
            <div><div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:#F0F6FF">Escalate to executive</div><div style="font-family:var(--font-body);font-size:11px;color:#5A84A8">Assemble intervention record and brief executive tier — full chain of custody preserved</div></div>
          </label>
          <label style="display:flex;align-items:flex-start;gap:8px;padding:7px 9px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);cursor:pointer">
            <input type="radio" name="mg-esc-action" value="monitor" style="margin-top:2px;accent-color:var(--compass-cyan)">
            <div><div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:#F0F6FF">Continue monitoring</div><div style="font-family:var(--font-body);font-size:11px;color:#5A84A8">Log acknowledgement but allow PM to continue managing — set check-in window</div></div>
          </label>
        </div>
        <div class="mg-modal-section">Your response <span style="color:#E24B4A">*</span></div>
        <textarea id="mg-respond-text" class="mg-modal-input" rows="3" placeholder="Required — describe your response or intended action…"></textarea>
        <div id="mg-respond-req" style="font-family:var(--font-mono);font-size:11px;color:#E24B4A;margin-top:3px;display:none">Response is required</div>
        <div style="display:flex;gap:6px;margin-top:10px">
          <button class="mg-btn mg-btn-c" onclick="mgSendResponse()">Log response &amp; act →</button>
          <button class="mg-btn" style="border-color:rgba(255,255,255,.2);color:#5A84A8" onclick="mgCloseModal()">Cancel</button>
        </div>`;
      mgOpenModal(title, bodyHtml);
    };
    window.mgSendResponse = function() {
      const txt  = document.getElementById('mg-respond-text')?.value?.trim()||'';
      const act  = document.querySelector('input[name="mg-esc-action"]:checked')?.value||'acknowledge';
      const reqEl= document.getElementById('mg-respond-req');
      if (!txt) {
        if (reqEl) reqEl.style.display='block';
        document.getElementById('mg-respond-text')?.focus();
        return;
      }
      if (reqEl) reqEl.style.display='none';
      const actionLabels = {direct:'Handling directly',guide:'Guidance sent to PM',executive:'Escalated to executive',monitor:'Monitoring — acknowledged',acknowledge:'Acknowledged'};
      const note = '['+actionLabels[act]+'] '+txt;
      API.post('workflow_step_instances',{
        id:crypto.randomUUID(), instance_id:crypto.randomUUID(), step_type:'manual',
        event_type:'management_decision', step_name:'Escalation',
        event_notes: note, actor_name:_myResource?.name||null,
        created_at:new Date().toISOString(),
        firm_id:window.FIRM_ID
      }).catch(()=>{});
      mgCloseModal();
      compassToast('Response logged to CoC',2200);
      setTimeout(()=>{ _viewLoaded['management']=false; loadManagementView(); },600);
    };

    // ── #8 Approve/Reject with required comments ───────────
    window.mgApproveReq = function(el, reqId, queueTitle) {
      mgOpenModal('Approve request', `
        <div class="mg-modal-section">Request</div>
        <div class="mg-modal-block">${esc(queueTitle||reqId)}</div>
        <div class="mg-modal-section">Conditions / comments <span style="color:#E24B4A">*</span></div>
        <textarea id="mg-approve-note" class="mg-modal-input" rows="3" placeholder="Required — note any conditions, constraints, or context for this approval…"></textarea>
        <div id="mg-approve-req" style="font-family:var(--font-mono);font-size:11px;color:#E24B4A;margin-top:3px;display:none">Comment required</div>
        <div style="display:flex;gap:6px;margin-top:10px">
          <button class="mg-btn mg-btn-g" onclick="mgConfirmApprove('${reqId}')">Approve →</button>
          <button class="mg-btn" style="border-color:rgba(255,255,255,.2);color:#5A84A8" onclick="mgCloseModal()">Cancel</button>
        </div>`);
    };
    window.mgConfirmApprove = async function(reqId) {
      const txt = document.getElementById('mg-approve-note')?.value?.trim()||'';
      const reqEl = document.getElementById('mg-approve-req');
      if (!txt) { if(reqEl) reqEl.style.display='block'; return; }
      await Promise.all([
        API.patch('resource_requests?id=eq.'+reqId, {status:'approved'}).catch(()=>{}),
        API.post('workflow_step_instances',{
          id:crypto.randomUUID(), instance_id:crypto.randomUUID(), step_type:'manual',
          event_type:'management_decision', step_name:'Resource',
          event_notes:'[Approved] '+txt,
          actor_name:_myResource?.name||null, created_at:new Date().toISOString(),
          firm_id:window.FIRM_ID
        }).catch(()=>{})
      ]);
      mgCloseModal();
      compassToast('Approved · Decision logged to CoC',2200);
      setTimeout(()=>{ _viewLoaded['management']=false; loadManagementView(); },600);
    };
    window.mgRejectReq = function(reqId, queueTitle) {
      mgOpenModal('Reject request', `
        <div class="mg-modal-section">Request</div>
        <div class="mg-modal-block">${esc(queueTitle||reqId)}</div>
        <div class="mg-modal-section">Reason for rejection <span style="color:#E24B4A">*</span></div>
        <textarea id="mg-reject-note" class="mg-modal-input" rows="3" placeholder="Required — explain the rejection reason for the PM record…"></textarea>
        <div id="mg-reject-req" style="font-family:var(--font-mono);font-size:11px;color:#E24B4A;margin-top:3px;display:none">Reason required</div>
        <div style="display:flex;gap:6px;margin-top:10px">
          <button class="mg-btn mg-btn-r" onclick="mgConfirmReject('${reqId}')">Reject &amp; log →</button>
          <button class="mg-btn" style="border-color:rgba(255,255,255,.2);color:#5A84A8" onclick="mgCloseModal()">Cancel</button>
        </div>`);
    };
    window.mgConfirmReject = async function(reqId) {
      const txt = document.getElementById('mg-reject-note')?.value?.trim()||'';
      const reqEl = document.getElementById('mg-reject-req');
      if (!txt) { if(reqEl) reqEl.style.display='block'; return; }
      await Promise.all([
        API.patch('resource_requests?id=eq.'+reqId, {status:'rejected'}).catch(()=>{}),
        API.post('workflow_step_instances',{
          id:crypto.randomUUID(), instance_id:crypto.randomUUID(), step_type:'manual',
          event_type:'management_decision', step_name:'Resource',
          event_notes:'[Rejected] '+txt,
          actor_name:_myResource?.name||null, created_at:new Date().toISOString(),
          firm_id:window.FIRM_ID
        }).catch(()=>{})
      ]);
      mgCloseModal();
      compassToast('Rejection logged to CoC',2200);
      setTimeout(()=>{ _viewLoaded['management']=false; loadManagementView(); },600);
    };
    window.mgLogDecision = function() {
      const sel = document.getElementById('mg-dec-type')?.value||'';
      const txt = document.getElementById('mg-dec-text')?.value?.trim()||'';
      if (!txt) { document.getElementById('mg-dec-text').style.borderColor='rgba(226,75,74,.5)'; return; }
      API.post('workflow_step_instances',{id:crypto.randomUUID(),instance_id:crypto.randomUUID(), step_type:'manual',event_type:'management_decision',step_name:sel,event_notes:txt,created_at:new Date().toISOString(),firm_id:window.FIRM_ID,actor_name:_myResource?.name||null}).catch(()=>{});
      mgCloseModal();
      compassToast('Decision logged to CoC',2000);
      setTimeout(()=>{ _viewLoaded['management']=false; loadManagementView(); },600);
    };
    window.mgRespondEscalation = function(title, situationText) {
      const bodyHtml = `
        <div class="mg-modal-section">Situation</div>
        <div class="mg-modal-block">${situationText}</div>
        <div class="mg-modal-section">AI narrative</div>
        <div class="mg-modal-block mg-modal-ai">This issue requires authority beyond PM level. Recommended responses: (1) handle directly — contact the blocking authority yourself, (2) send guidance to PM with a specific escalation path, or (3) escalate to executive tier for awareness.</div>
        <div class="mg-modal-section">Your response</div>
        <textarea id="mg-respond-text" class="mg-modal-input" rows="3" placeholder="Describe your response or action taken…"></textarea>
        <div style="display:flex;gap:6px;margin-top:10px">
          <button class="mg-btn mg-btn-c" onclick="mgSendResponse()">Send response →</button>
          <button class="mg-btn" style="border-color:rgba(255,255,255,.2);color:#5A84A8" onclick="mgCloseModal()">Cancel</button>
        </div>`;
      mgOpenModal(title, bodyHtml);
    };
    window.mgSendResponse = function() {
      const txt = document.getElementById('mg-respond-text')?.value?.trim()||'';
      API.post('workflow_step_instances',{
        id:crypto.randomUUID(), instance_id:crypto.randomUUID(), step_type:'manual',
        event_type:'management_decision', step_name:'Escalation',
        event_notes: txt || 'Management response logged.',
        actor_name: _myResource?.name||null,
        created_at: new Date().toISOString(),
        firm_id:window.FIRM_ID
      }).catch(()=>{});
      mgCloseModal();
      compassToast('Response logged · PM notified', 2200);
    };
    // Health grid dot detail
    window.mgShowDot = function(projName, label, score) {
      const status = score >= 85 ? 'Healthy' : score >= 65 ? 'Watch' : 'Action required';
      const color  = score >= 85 ? '#1D9E75' : score >= 65 ? '#EF9F27' : '#E24B4A';
      const body = `<div class="mg-modal-section">Dimension</div>
        <div class="mg-modal-block">${label}</div>
        <div class="mg-modal-section">Score</div>
        <div class="mg-modal-block">
          <span style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:${color}">${score}%</span>
          <span style="font-family:var(--font-mono);font-size:11px;color:#3A5C80;margin-left:8px">${status}</span>
        </div>
        <div style="height:5px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden;margin:8px 0">
          <div style="height:100%;width:${score}%;background:${color};border-radius:2px"></div>
        </div>
        <div class="mg-modal-section">Interpretation</div>
        <div class="mg-modal-block mg-modal-ai">${
          label === 'Schedule'    ? 'Based on SPI and overdue task ratio. Green = SPI ≥ 0.9 and low overdue count.' :
          label === 'Cost'        ? 'Based on CPI. Green = CPI ≥ 0.9. Red = budget overrun risk.' :
          label === 'Confidence'  ? 'Ratio of green confidence signals vs all signals this week.' :
          label === 'Rework'      ? 'Ratio of step resets vs completions. High rework = process or quality issue.' :
          label === 'Timesheets'  ? 'Percentage of assigned resources who logged time this week.' :
          label === 'Escalations' ? 'Whether any workflow instance has 2+ unresolved rework cycles.' :
          'Health dimension score derived from live CoC data.'
        }</div>`;
      mgOpenModal(projName + ' — ' + label, body);
    };
    // mgShowPerson defined above with full per-project breakdown

    // Pre-compute reworkByProj for management view (separate from exec view's copy)
    const mgReworkByProj = {};
    reworkEvents.forEach(e => {
      const inst = wfInstances.find(w=>w.id===e.instance_id);
      if (!inst?.project_id) return;
      mgReworkByProj[inst.project_id] = (mgReworkByProj[inst.project_id]||0) + 1;
    });

    // Pre-compute tooltip strings — must be before content.innerHTML template
    const escTipHtml = Object.entries(instResets).filter(([,c])=>c>=2).map(([id,c])=>{
      const inst = wfInstances.find(w=>w.id===id);
      const proj = _projects.find(p=>p.id===inst?.project_id);
      return (proj?.name||'Unknown')+': '+c+' resets on '+((inst?.title||'').slice(0,40)||'workflow');
    }).join(' | ') || 'No active escalations';

    const rwTipLines = Object.entries(mgReworkByProj).sort(([,a],[,b])=>b-a).slice(0,5).map(([pid,c])=>{
      const p = _projects.find(p=>p.id===pid);
      return (p?.name||'?').slice(0,24)+': '+formatYen(c*HRS_PER_REWORK*HOURLY_RATE)+' ('+c+' cycles)';
    }).join(' | ') || 'No breakdown available';
    const rwTipFull = reworkCount+' resets x '+HRS_PER_REWORK+'h x ¥'+HOURLY_RATE.toLocaleString()+'/hr | '+rwTipLines;

    // ─────────────────────────────────────────────────────
    // Render HTML
    // ─────────────────────────────────────────────────────
    content.innerHTML = `
    <div class="mg-wrap">
      <div class="mg-sstrip">
        <div class="mg-sc">
          <div class="mg-sc-lbl">Decisions pending</div>
          <div class="mg-sc-val" style="color:${queueItems.length>0?'#E24B4A':'#3A5C80'}">${queueItems.length}</div>
          <div class="mg-sc-sub">requests + escalations</div>
        </div>
        <div class="mg-sc">
          <div class="mg-sc-lbl">Org confidence</div>
          <div class="mg-sc-val" style="color:${orgConfidence===null?'#3A5C80':orgConfidence>=70?'#1D9E75':orgConfidence>=50?'#EF9F27':'#E24B4A'}">${orgConfidence!==null?orgConfidence+'%':'—'}</div>
          <div class="mg-sc-sub">green signals today</div>
        </div>
        <div class="mg-sc" style="cursor:default" data-tip="${escTipHtml}"
          onmouseenter="if(event.ctrlKey)mgStatHover(this,this.dataset.tip)" onmouseleave="mgStatLeave()">
          <div class="mg-sc-lbl">Active escalations</div>
          <div class="mg-sc-val" style="color:${escalations>0?'#E24B4A':'#3A5C80'}">${escalations}</div>
          <div class="mg-sc-sub">${escalations>0?'hover for detail':'none pending'}</div>
        </div>
        <div class="mg-sc" style="cursor:default">
          <div class="mg-sc-lbl">Workflow alerts</div>
          <div class="mg-sc-val" style="color:${redesignCount>0?'#EF9F27':'#3A5C80'}">${redesignCount}</div>
          <div class="mg-sc-sub">redesign recommended</div>
        </div>
        <div class="mg-sc" style="cursor:default" data-tip="${rwTipFull}"
          onmouseenter="if(event.ctrlKey)mgStatHover(this,this.dataset.tip)" onmouseleave="mgStatLeave()">
          <div class="mg-sc-lbl">Rework cost — week</div>
          <div class="mg-sc-val" style="color:${reworkCost>500000?'#E24B4A':reworkCost>100000?'#EF9F27':'#3A5C80'}">${formatYen(reworkCost)}</div>
          <div class="mg-sc-sub">hover for breakdown</div>
        </div>
      </div>

      <div class="mg-tabs">
        <div class="mg-tab on" onclick="mgSwitchTab(this,'overview')">Overview</div>
        <div class="mg-tab" onclick="mgSwitchTab(this,'queue')">Approval queue ${queueItems.length>0?`<span class="mg-tbadge" style="background:rgba(226,75,74,.2);color:#E24B4A">${queueItems.length}</span>`:''}</div>
        <div class="mg-tab" onclick="mgSwitchTab(this,'people')">People</div>
        <div class="mg-tab" onclick="mgSwitchTab(this,'workflows')">Workflows</div>
        <div class="mg-tab" onclick="mgSwitchTab(this,'decisions')">Decision log</div>
      </div>

      <!-- OVERVIEW -->
      <div class="mg-tc on" id="mg-tc-overview">
        <div class="mg-body mg-overview">
          <div>
            <div class="mg-panel">
              <div class="mg-panel-head">
                <span class="mg-panel-title">Portfolio health grid</span>
                <span style="font-family:var(--font-mono);font-size:11px;color:#3A5C80">Schedule · Cost · Confidence · Rework · Timesheets · Escalations · Click dots for detail</span>
              </div>
              <table class="mg-hgrid">
                <thead><tr>
                  <th style="text-align:left">Project</th>
                  <th>Schedule</th><th>Cost</th><th>Confidence</th><th>Rework</th><th>Timesheets</th><th>Escalations</th>
                </tr></thead>
                <tbody>
                ${activeProjects.map(p=>{
                  const dots = projectHealthDots(p);
                  return `<tr id="mg-tr-${p.id}" style="cursor:pointer;transition:background .1s"
                    onclick="mgExpandRow('${p.id}')"
                    onmouseenter="this.style.background='rgba(0,210,255,.03)'"
                    onmouseleave="if(!document.getElementById('mg-exp-${p.id}'))this.style.background=''">
                    <td style="font-weight:600">${esc(p.name)}</td>
                    ${dots.map(d=>`<td onclick="event.stopPropagation();mgShowDot('${esc(p.name).replace(/'/g,'\\x27')}','${d.label}',${Math.round(d.score*100)})"><div class="mg-dot" style="background:${d.color}" title="${d.label}: ${Math.round(d.score*100)}%"></div></td>`).join('')}
                  </tr>`;
                }).join('')}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div class="mg-panel" style="margin-bottom:10px">
              <div class="mg-panel-head"><span class="mg-panel-title">Management brief — today</span></div>
              <div style="padding:8px 12px">
                ${briefItems.length ? briefItems.map(b=>`<div class="mg-brief-item" onclick="mgSwitchTab(document.querySelector('.mg-tab:nth-child(${['overview','queue','people','workflows','decisions'].indexOf(b.tab)+1})'), '${b.tab}')">
                  <div style="width:7px;height:7px;border-radius:50%;background:${b.color};flex-shrink:0;margin-top:4px"></div>
                  <span>${b.text}</span>
                </div>`).join('') : '<div style="font-family:var(--font-mono);font-size:12px;color:#3A5C80;padding:6px 0">No action items today</div>'}
              </div>
            </div>
            ${topActor && topActorRate > firmAvgRate+20 ? `
            <div class="mg-panel">
              <div class="mg-panel-head"><span class="mg-panel-title">Pairing intelligence</span></div>
              <div class="mg-pair-box">
                <div style="font-family:var(--font-mono);font-size:11px;color:#C8DFF0;line-height:1.7">${esc(topActor[0])}</div>
                <div style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:#E24B4A">${topActorRate}%</div>
                <div style="font-family:var(--font-mono);font-size:11px;color:#3A5C80">reset rate on first submission</div>
                <div style="font-family:var(--font-mono);font-size:11px;color:#3A5C80;margin-top:3px">vs firm avg <strong style="color:#1D9E75">${firmAvgRate}%</strong> — consider restructuring approval chain or direct conversation</div>
              </div>
            </div>` : ''}
          </div>
        </div>
      </div>

      <!-- APPROVAL QUEUE -->
      <div class="mg-tc" id="mg-tc-queue">
        <div class="mg-panel" style="margin:10px 12px">
          <div class="mg-panel-head"><span class="mg-panel-title">Approval queue — ${queueItems.length} pending decisions</span></div>
          ${queueItems.length===0
            ? '<div style="padding:16px 12px;font-family:var(--font-mono);font-size:12px;color:#3A5C80">No pending decisions</div>'
            : queueItems.map((q,qi)=>`
            <div class="mg-queue-item" id="mg-qi-${qi}" style="cursor:pointer"
              onclick="mgExpandQueue(${qi})"
              onmouseenter="this.style.background='rgba(0,210,255,.025)'"
              onmouseleave="if(!document.getElementById('mg-qexp-${qi}'))this.style.background=''">
              <div class="mg-qpriority" style="background:${q.priority==='red'?'#E24B4A':'#EF9F27'}"></div>
              <div style="flex:1;min-width:0">
                <div class="mg-qtype">${q.type==='escalation'?'Escalation — PM response required':'Resource request — '+q.age+'h aging'}</div>
                <div class="mg-qtitle">${q.title}</div>
                <div class="mg-qmeta">${q.meta}</div>
                <div class="mg-qrec">${q.rec}</div>
              </div>
              <div class="mg-qa" onclick="event.stopPropagation()">
                ${q.type==='escalation'
                  ? `<button class="mg-btn mg-btn-c" onclick="mgRespondEscalation('Respond to escalation','${q.title.replace(/'/g,'\\x27')}<br>${q.meta.replace(/'/g,'\\x27')}')">Respond →</button>`
                  : `<button class="mg-btn mg-btn-g" onclick="mgApproveReq(this,'${q.reqId}','${q.title.replace(/'/g,'\\x27')}')">Approve</button>
                     <button class="mg-btn mg-btn-r" onclick="mgRejectReq('${q.reqId}','${q.title.replace(/'/g,'\\x27')}')">Reject</button>`}
              </div>
            </div>`).join('')}
        </div>
      </div>

      <!-- PEOPLE -->
      <div class="mg-tc" id="mg-tc-people">
        <div class="mg-body" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${_resources.filter(r=>r.is_active).slice(0,8).map(r=>{
            const fullName = (r.first_name+' '+r.last_name).trim();
            const initials = ((r.first_name||'')[0]||'').toUpperCase()+((r.last_name||'')[0]||'').toUpperCase();
            const sentByDay = resSentiment[fullName]||{};
            const arcStr = weekDays.map(d=>{const s=sentByDay[d];return s==='on_track'?'G':s==='at_risk'?'Y':s==='blocked'?'R':'—';}).join('→');
            const hByDay = {};
            weekDays.forEach(d=>{hByDay[d]=(weekEntries||[]).filter(e=>e.resource_id===r.id&&e.date===d).reduce((s,e)=>s+parseFloat(e.hours||0),0);});
            const weekHrs = Object.values(hByDay).reduce((a,b)=>a+b,0);
            const arcColors = {'G':'#1D9E75','Y':'#EF9F27','R':'#E24B4A','—':'rgba(255,255,255,.12)'};
            const dots = weekDays.map((d,i)=>{
              const s = sentByDay[d];
              const stepStr = ['M','T','W','Th','F'][i];
              const col = s ? arcColors[s==='on_track'?'G':s==='at_risk'?'Y':'R'] : arcColors['—'];
              return `<div class="mg-arc-dot" style="background:${col}" title="${stepStr}"></div>${i<4?'<div class="mg-arc-line"></div>':''}`;
            }).join('');
            const taskCount = _tasks.filter(t=>t.assigned_to===r.user_id&&!['complete','cancelled'].includes(t.status)).length;
            return `<div class="mg-pc" onclick="mgShowPerson('${esc(fullName).replace(/'/g,'\\x27')}','${arcStr}',${weekHrs.toFixed(1)},${taskCount})">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <div style="width:28px;height:28px;border-radius:50%;background:#0f2040;border:1px solid rgba(0,210,255,.2);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:11px;font-weight:700;color:#00D2FF;flex-shrink:0">${initials}</div>
                <div>
                  <div style="font-family:var(--font-body);font-size:12px;font-weight:600;color:#F0F6FF">${esc(fullName)}</div>
                  <div style="font-family:var(--font-mono);font-size:11px;color:#4A6E90">${weekHrs.toFixed(1)}h · ${taskCount} tasks</div>
                </div>
              </div>
              <div class="mg-arc" style="flex-wrap:nowrap">${dots}</div>
              <div style="font-family:var(--font-mono);font-size:11px;color:#3A5C80;margin-top:5px">${arcStr}</div>
            </div>`;
          }).join('')}
        </div>
        <div style="padding:0 12px 6px;font-family:var(--font-mono);font-size:11px;color:#3A5C80">Click any person card for cross-project pattern analysis</div>
      </div>

      <!-- WORKFLOWS -->
      <div class="mg-tc" id="mg-tc-workflows">
        <div class="mg-panel" style="margin:10px 12px">
          <div class="mg-panel-head">
            <span class="mg-panel-title">Workflow intelligence — ${wfTemplates.length} template${wfTemplates.length!==1?'s':''} · ${redesignCount} redesign recommended</span>
          </div>
          ${wfTemplates.length===0
            ? '<div style="padding:16px 12px;font-family:var(--font-mono);font-size:12px;color:#3A5C80">No rework data yet</div>'
            : wfTemplates.map(t=>{
              const col = t.failureRate>=60?'#E24B4A':t.failureRate>=35?'#EF9F27':'#1D9E75';
              const lbl = t.failureRate>=60?'Redesign recommended':t.failureRate>=35?'Watch':'Healthy';
              const aiNarr = t.failureRate>=60
                ? 'Failure rate above redesign threshold (60%). Root cause: approval criteria ambiguity or upstream dependency issues. Recommend: explicit checklist at approval step and pre-submission review gate.'
                : t.failureRate>=35
                ? 'Failure rate rising — monitor for 2 more weeks. Not yet at redesign threshold.'
                : 'Template is healthy. No action required.';
              const actionHtml = t.failureRate>=60
                ? '<div style=\'font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#00D2FF;margin:10px 0 5px\'>Action</div><button class=\'mg-btn mg-btn-c\' style=\'margin-top:4px\' onclick=\'compassToast(&quot;Redesign authorized&quot;,2000);mgCloseModal()\'>Authorize redesign &rarr;</button>'
                : '';
              return `<div class="mg-wf-row" data-wf-name="${esc(t.name)}" data-wf-rate="${t.failureRate}" data-wf-resets="${t.resets}" data-wf-comp="${t.completions}" data-ai-narr="${esc(aiNarr)}" data-action-html="${esc(actionHtml)}"
                onclick="mgOpenWfModal(this)">
                <div style="font-family:var(--font-body);font-size:12px;color:#C8DFF0;min-width:160px;flex-shrink:0">${esc(t.name)}</div>
                <div style="flex:2;min-width:0">
                  <div class="mg-wf-bar"><div class="mg-wf-fill" style="width:${t.failureRate}%;background:${col}"></div></div>
                  <div style="font-family:var(--font-mono);font-size:11px;color:#3A5C80">${t.failureRate}% own-failure rate · ${t.resets} instances</div>
                </div>
                <span style="font-family:var(--font-mono);font-size:11px;font-weight:700;padding:2px 8px;border:1px solid;color:${col};border-color:${col}40;flex-shrink:0">${lbl}</span>
                ${t.failureRate>=60?`<button class="mg-btn mg-btn-c" onclick="event.stopPropagation();compassToast('Redesign authorized',2000)">Authorize &rarr;</button>`:''}
              </div>`;
            }).join('')}
        </div>
      </div>

      <!-- DECISION LOG -->
      <div class="mg-tc" id="mg-tc-decisions">
        <div class="mg-panel" style="margin:10px 12px">
          <div class="mg-panel-head">
            <span class="mg-panel-title">Management decision log — immutable · CoC-linked</span>
            <button class="mg-btn mg-btn-c" onclick="mgOpenLogDecisionModal()">+ Log decision</button>
          </div>
          ${cocEvents.filter(e=>e.event_type==='management_decision').slice(0,10).map(e=>{
            const typeColors = {Escalation:'#E24B4A',Resource:'#00D2FF',Process:'#8B5CF6',Budget:'#1D9E75',People:'#EF9F27'};
            const t = e.step_name||'Decision';
            const col = typeColors[t]||'#5A84A8';
            return `<div class="mg-dl-row">
              <span class="mg-dl-badge" style="color:${col};border-color:${col}40">${esc(t)}</span>
              <div style="flex:1">
                <div class="mg-dl-text">${esc(e.event_notes||'—')}</div>
                <div class="mg-dl-meta">${_timeAgo(e.created_at)} · ${esc(e.actor_name||'—')}</div>
              </div>
            </div>`;
          }).join('') || '<div style="padding:14px 12px;font-family:var(--font-mono);font-size:12px;color:#3A5C80">No decisions logged yet — use + Log decision to create the first entry.</div>'}
        </div>
      </div>

    </div>

    <!-- Modal -->
    <div class="mg-modal-overlay" id="mg-modal-overlay" onclick="mgCloseModal()">
      <div class="mg-modal" onclick="event.stopPropagation()">
        <div class="mg-modal-head">
          <div class="mg-modal-title" id="mg-modal-title"></div>
          <button class="mg-modal-close" onclick="mgCloseModal()">✕</button>
        </div>
        <div class="mg-modal-body" id="mg-modal-body"></div>
      </div>
    </div>`;

  } catch(e) {
    console.error('[Compass] loadManagementView error:', e);
    content.innerHTML = '<div style="padding:20px;font-family:var(--font-mono);font-size:12px;color:var(--compass-red)">Failed to load management view — check console</div>';
  }
}

