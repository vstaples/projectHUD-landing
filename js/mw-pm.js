// ══════════════════════════════════════════════════════════
// VIEW: PM PORTFOLIO — Feature #2 · Session 16
// ══════════════════════════════════════════════════════════
async function loadPMView() {
  const content = document.getElementById('pm-content');

  // ── Inject PM-specific styles once ──────────────────────
  if (!document.getElementById('pm-style')) {
    const s = document.createElement('style'); s.id = 'pm-style';
    s.textContent = `
      .pm-wrap{display:flex;flex-direction:column;gap:0;margin:-20px -22px}
      /* Alert rail */
      .pm-alertrail{background:rgba(226,75,74,.08);border-bottom:2px solid rgba(226,75,74,.4)}
      .pm-alert{display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid rgba(226,75,74,.12)}
      .pm-alert:last-child{border-bottom:none}
      .pm-alert-type{font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;color:#E24B4A;white-space:nowrap;min-width:110px}
      .pm-alert-type.warn{color:#EF9F27}
      .pm-alert-proj{font-family:var(--font-head);font-size:11px;font-weight:700;color:#00D2FF;white-space:nowrap;margin-right:2px}
      .pm-alert-msg{font-family:var(--font-body);font-size:11px;color:#C8DFF0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pm-alert-age{font-family:var(--font-data);font-size:11px;color:#5A84A8;white-space:nowrap;margin:0 12px}
      .pm-btn{font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.06em;padding:5px 13px;border:1px solid;cursor:pointer;white-space:nowrap;background:none;transition:background .1s}
      .pm-btn-red{color:#E24B4A;border-color:rgba(226,75,74,.5)}.pm-btn-red:hover{background:rgba(226,75,74,.15)}
      .pm-btn-cyan{color:#00D2FF;border-color:rgba(0,210,255,.4)}.pm-btn-cyan:hover{background:rgba(0,210,255,.1)}
      /* Stat strip */
      .pm-sstrip{display:grid;grid-template-columns:repeat(5,1fr);border-bottom:1px solid rgba(0,210,255,.12);background:#060d1c}
      .pm-sc{padding:10px 16px;border-right:1px solid rgba(0,210,255,.08)}
      .pm-sc:last-child{border-right:none}
      .pm-sc-lbl{font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.09em;color:#3A5C80;margin-bottom:3px;text-transform:uppercase}
      .pm-sc-val{font-family:var(--font-display);font-size:24px;font-weight:700;line-height:1}
      .pm-sc-sub{font-family:var(--font-head);font-size:11px;color:#3A5C80;margin-top:2px}
      /* Body */
      .pm-body{display:grid;grid-template-columns:1fr 280px;gap:0}
      .pm-left{border-right:1px solid rgba(0,210,255,.1);display:flex;flex-direction:column}
      .pm-right{display:flex;flex-direction:column;background:#060b18}
      /* Tabs — large readable buttons like mockup */
      .pm-tabs{display:flex;gap:2px;padding:10px 12px;background:#07101f;border-bottom:1px solid rgba(0,210,255,.12)}
      .pm-tab{font-family:var(--font-head);font-size:14px;font-weight:700;letter-spacing:.04em;padding:7px 18px;cursor:pointer;color:#5A84A8;background:#0c1828;border:1px solid rgba(0,210,255,.1);display:flex;align-items:center;gap:7px;transition:all .12s}
      .pm-tab.on{color:#F0F6FF;background:#132035;border-color:rgba(0,210,255,.4)}
      .pm-tab:hover:not(.on){color:#90B8D8;background:#0e1e30}
      .pm-tbadge{font-size:11px;font-weight:700;padding:2px 7px;border-radius:3px}
      /* Section header */
      .pm-sec-hdr{font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.12em;color:#3A5C80;padding:6px 14px;background:#06101e;border-bottom:1px solid rgba(0,210,255,.08);display:flex;align-items:center;gap:7px;text-transform:uppercase}
      /* Cards */
      .pm-pcards{overflow-y:auto;background:#07101f;padding:8px}
      .pm-pcard{border-left:4px solid;padding:14px 14px 12px;cursor:pointer;transition:background .12s,border-color .12s;background:#0d1a2e;margin-bottom:6px;border-top:1px solid rgba(255,255,255,.05);border-right:1px solid rgba(0,210,255,.1);border-bottom:1px solid rgba(0,210,255,.1)}
      .pm-pcard:hover{background:#112030;border-right-color:rgba(0,210,255,.25)}
      .pm-pcard.open{background:rgba(0,210,255,.08)!important;border-right-color:rgba(0,210,255,.45)!important}
      .pm-pn{font-family:var(--font-display);font-size:18px;font-weight:700;color:#F0F6FF;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pm-pmeta{font-family:var(--font-head);font-size:11px;color:#4A6E90;margin:3px 0 8px}
      /* Day grid — each day in its own box like mockup */
      .pm-dgrid{display:flex;gap:6px;margin:8px 0}
      .pm-dcell{background:#0a1828;border:1px solid rgba(0,210,255,.12);padding:6px 8px;text-align:center;min-width:52px}
      .pm-dlbl{font-family:var(--font-head);font-size:12px;font-weight:700;color:#4A6E90;margin-bottom:4px}
      .pm-dot{width:8px;height:8px;border-radius:50%;margin:0 auto 4px}
      .pm-dhrs{font-family:var(--font-head);font-size:12px;font-weight:700}
      /* Progress bar */
      .pm-pbar{height:5px;background:rgba(255,255,255,.07);margin:8px 0 4px;border-radius:2px;position:relative;overflow:hidden}
      .pm-pbar-fill{height:100%;position:absolute;left:0;top:0;border-radius:2px}
      /* EVM row — big numbers separated clearly */
      .pm-evmrow{display:flex;gap:0;margin:8px 0 4px;border:1px solid rgba(0,210,255,.1);background:#091522}
      .pm-evm-cell{padding:7px 14px;border-right:1px solid rgba(0,210,255,.08);flex:1}
      .pm-evm-cell:last-child{border-right:none}
      .pm-evm-lbl{font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.08em;color:#4A6E90;text-transform:uppercase}
      .pm-evm-val{font-family:var(--font-display);font-size:20px;font-weight:700;line-height:1.1;margin-top:1px}
      /* Chips */
      .pm-chiprow{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;align-items:center}
      .pm-chip{font-family:var(--font-head);font-size:11px;font-weight:700;padding:2px 8px}
      .pm-chip-r{color:#E24B4A;border:1px solid rgba(226,75,74,.4);background:rgba(226,75,74,.08)}
      .pm-chip-a{color:#EF9F27;border:1px solid rgba(239,159,39,.4);background:rgba(239,159,39,.08)}
      .pm-chip-c{color:#00D2FF;border:1px solid rgba(0,210,255,.35);background:rgba(0,210,255,.07)}
      .pm-chip-g{color:#1D9E75;border:1px solid rgba(29,158,117,.35);background:rgba(29,158,117,.07)}
      /* Feed */
      .pm-feed-hdr{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid rgba(0,210,255,.12);background:#06101e;flex-shrink:0}
      .pm-frow{display:flex;gap:0;border-bottom:1px solid rgba(0,210,255,.08);cursor:pointer;transition:background .1s;overflow:hidden}
      .pm-frow:hover{background:rgba(255,255,255,.025)}
      .pm-fstrip{width:4px;flex-shrink:0}
      .pm-ftag-col{display:flex;flex-direction:column;justify-content:center;padding:8px 9px 8px 8px;width:82px;flex-shrink:0;border-right:1px solid rgba(0,210,255,.08)}
      .pm-ftag{font-family:var(--font-head);font-size:12px;font-weight:700;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pm-ftag-inst{font-family:var(--font-head);font-size:11px;color:#3A5C80;margin-top:2px}
      .pm-fbody{flex:1;min-width:0;padding:8px 9px}
      .pm-ftitle{font-family:var(--font-body);font-size:12px;color:#C8DFF0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pm-fsub{font-family:var(--font-body);font-size:11px;margin-top:2px}
      .pm-fage{font-family:var(--font-data);font-size:11px;color:#3A5C80;flex-shrink:0;align-self:center;padding-right:10px;white-space:nowrap}
      /* Drawer */
      .pm-drawer{position:fixed;top:44px;right:0;bottom:0;width:540px;background:#08101f;border-left:1px solid rgba(0,210,255,.2);display:flex;flex-direction:column;z-index:200;box-shadow:-16px 0 48px rgba(0,0,0,.8);animation:pm-drawer-in .22s ease}
      @keyframes pm-drawer-in{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
      .pm-drhdr{padding:12px 15px 10px;border-bottom:1px solid rgba(0,210,255,.12);flex-shrink:0;background:#07101e}
      .pm-drname{font-family:var(--font-display);font-size:20px;font-weight:700;color:#F0F6FF;line-height:1.1}
      .pm-drdesc{font-family:var(--font-head);font-size:11px;color:#4A6E90;margin:3px 0 6px}
      .pm-drstrip{display:grid;grid-template-columns:repeat(6,1fr);border-bottom:1px solid rgba(0,210,255,.1);flex-shrink:0;background:#07101e}
      .pm-drc{padding:8px;border-right:1px solid rgba(0,210,255,.08);text-align:center}
      .pm-drc:last-child{border-right:none}
      .pm-drc-lbl{font-family:var(--font-head);font-size:10px;font-weight:700;letter-spacing:.07em;color:#3A5C80;text-transform:uppercase}
      .pm-drc-val{font-family:var(--font-display);font-size:18px;font-weight:700;line-height:1;margin-top:2px}
      .pm-drc-sub{font-family:var(--font-head);font-size:10px;color:#3A5C80;margin-top:1px}
      .pm-drtabs{display:flex;border-bottom:1px solid rgba(0,210,255,.1);background:#060c18;flex-shrink:0;overflow-x:auto}
      .pm-drtab{font-family:var(--font-head);font-size:12px;font-weight:700;letter-spacing:.06em;padding:8px 14px;cursor:pointer;color:#4A6E90;border-bottom:2px solid transparent;white-space:nowrap;transition:color .1s}
      .pm-drtab.on{color:#F0F6FF;border-bottom-color:#00D2FF}
      .pm-drtab:hover:not(.on){color:#90B8D8}
      .pm-drbody{flex:1;overflow-y:auto;display:grid;grid-template-columns:1fr 1fr;gap:0}
      .pm-drcol{border-right:1px solid rgba(0,210,255,.08)}
      .pm-drcol:last-child{border-right:none}
      .pm-dcsec{font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;color:#3A5C80;padding:7px 12px 4px;text-transform:uppercase;border-bottom:1px solid rgba(0,210,255,.07);background:#070d1c;display:flex;align-items:center;gap:6px}
      .pm-rfcard{margin:8px 10px;background:rgba(226,75,74,.07);border:1px solid rgba(226,75,74,.3);border-left:3px solid #E24B4A;padding:10px 11px}
      .pm-rf-tag{font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.08em;color:#E24B4A;margin-bottom:5px}
      .pm-rf-who{font-family:var(--font-body);font-size:12px;font-weight:600;color:#F0F6FF;margin-bottom:3px}
      .pm-rf-quote{font-family:var(--font-body);font-size:11px;color:#C8DFF0;font-style:italic;margin-bottom:8px;line-height:1.5;border-left:2px solid rgba(226,75,74,.4);padding-left:8px}
      .pm-rf-ctx{font-family:var(--font-head);font-size:11px;color:#4A6E90;margin-bottom:9px}
      .pm-aicard{margin:8px 10px;background:rgba(239,159,39,.05);border:1px solid rgba(239,159,39,.18);border-left:3px solid #EF9F27;padding:9px 11px}
      .pm-ai-lbl{font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.08em;color:#EF9F27;margin-bottom:5px}
      .pm-ai-item{font-family:var(--font-body);font-size:11px;color:#C8DFF0;margin-bottom:4px;padding-left:12px;position:relative;line-height:1.5}
      .pm-ai-item::before{content:'·';position:absolute;left:2px;color:#EF9F27;font-weight:700}
      .pm-decrow{padding:7px 12px;border-bottom:1px solid rgba(0,210,255,.07);display:flex;gap:7px;align-items:flex-start}
      .pm-dec-chip{font-family:var(--font-head);font-size:11px;font-weight:700;padding:2px 7px;white-space:nowrap;flex-shrink:0}
      .pm-dec-text{font-family:var(--font-body);font-size:11px;color:#C8DFF0;line-height:1.5;flex:1}
      .pm-dec-date{font-family:var(--font-data);font-size:11px;color:#4A6E90;white-space:nowrap;margin-top:1px}
      .pm-brief-row{display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid rgba(0,210,255,.07);cursor:pointer;transition:background .1s}
      .pm-brief-row:hover{background:rgba(255,255,255,.02)}
      .pm-bdate{font-family:var(--font-head);font-size:11px;font-weight:600;color:#C8DFF0;min-width:90px}
      .pm-bflag{font-family:var(--font-head);font-size:11px;flex:1}
      .pm-feed-row{display:flex;gap:7px;padding:7px 12px;border-bottom:1px solid rgba(0,210,255,.07);transition:background .1s}
      .pm-feed-row:hover{background:rgba(255,255,255,.02)}
      .pm-live-dot{width:7px;height:7px;border-radius:50%;background:#1D9E75;display:inline-block;flex-shrink:0}
      /* Exceptions / Team / Action items tab panels */
      .pm-tabpanel{display:none;overflow-y:auto;flex:1;padding:12px}
      .pm-tabpanel.on{display:block}
      /* Tooltip */
      .pm-tooltip{position:fixed;z-index:9999;background:#0d1e35;border:1px solid rgba(0,210,255,.3);
        box-shadow:0 8px 32px rgba(0,0,0,.7);padding:10px 13px;min-width:200px;max-width:320px;
        pointer-events:none;opacity:0;transition:opacity .12s}
      .pm-tooltip.show{opacity:1}
      .pm-tt-hdr{font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;
        text-transform:uppercase;color:#3A5C80;margin-bottom:6px}
      .pm-tt-row{display:flex;justify-content:space-between;gap:12px;font-family:var(--font-head);
        font-size:11px;color:#C8DFF0;margin-bottom:3px}
      .pm-tt-row span:last-child{font-family:var(--font-display);font-weight:700}
      .pm-tt-bar{height:3px;background:rgba(255,255,255,.08);margin:5px 0 7px;border-radius:2px;overflow:hidden}
      .pm-tt-bar-fill{height:100%;background:var(--compass-cyan);border-radius:2px}
      .pm-tt-person{display:flex;justify-content:space-between;gap:8px;font-family:var(--font-head);
        font-size:11px;padding:3px 0;border-bottom:1px solid rgba(0,210,255,.06)}
      .pm-tt-person:last-child{border-bottom:none}
    `;
    document.head.appendChild(s);
  }

  try {
    const today = new Date().toLocaleDateString('en-CA');
    const todayDate = new Date(today+'T00:00:00');
    const dayOfWeek = todayDate.getDay();
    const isoOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(todayDate); weekStart.setDate(todayDate.getDate() - isoOffset);
    const weekDays = Array.from({length:5}, (_,i)=>{ const d=new Date(weekStart); d.setDate(weekStart.getDate()+i); return d.toLocaleDateString('en-CA'); });
    const dayLabels = ['M','T','W','Th','F'];

    const [wfInstances, actionItems, cocEvents, resourceReqs, weekEntries, confSignals] = await Promise.all([
      API.get('workflow_instances?select=id,title,status,current_step_name,project_id,launched_at,priority,stakes&status=eq.active&order=launched_at.desc&limit=50').catch(() => []),
      API.get('workflow_action_items?status=eq.open&order=due_date.asc&limit=100').catch(() => []),
      API.get('workflow_step_instances?select=id,instance_id,event_type,step_name,outcome,actor_name,event_notes,created_at&event_type=in.(step_completed,step_reset,step_activated,task_progress_update)&order=created_at.desc&limit=300').catch(() => []),
      API.get('resource_requests?select=id,project_id,status,submitted_at&status=eq.pending&order=submitted_at.asc&limit=20').catch(() => []),
      API.get(`time_entries?date=gte.${weekDays[0]}&date=lte.${weekDays[4]}&select=id,project_id,resource_id,date,hours,is_billable&limit=500`).catch(() => []),
      API.get(`workflow_step_instances?select=id,instance_id,event_type,outcome,actor_name,created_at&event_type=eq.task_progress_update&created_at=gte.${weekDays[0]}T00:00:00&order=created_at.desc&limit=300`).catch(() => []),
    ]);

    const activeProjects = _projects.filter(p => p.status === 'active');

    // ── Red flags (step_reset in last 48h) ────────────────
    const cutoff48h = new Date(Date.now() - 48*3600000).toISOString();
    const flagMap = {};
    cocEvents.filter(e => e.event_type==='step_reset' && e.created_at > cutoff48h).forEach(e => {
      const inst = wfInstances.find(w=>w.id===e.instance_id);
      const key = e.instance_id;
      if (!flagMap[key] || e.created_at > flagMap[key].created_at)
        flagMap[key] = { ...e, instTitle:inst?.title||'—', projId:inst?.project_id, projName:_projects.find(p=>p.id===inst?.project_id)?.name||'—', count:1 };
      else flagMap[key].count++;
    });
    const redFlags = Object.values(flagMap).sort((a,b)=>b.created_at.localeCompare(a.created_at));

    // ── Per-project stats ─────────────────────────────────
    const projStats = activeProjects.map(p => {
      const projTasks   = _tasks.filter(t => t.project_id === p.id);
      const totalTasks  = projTasks.length;
      const doneTasks   = projTasks.filter(t => t.status==='complete').length;
      const overdueTasks= projTasks.filter(t => t.due_date && t.due_date < today && !['complete','cancelled'].includes(t.status));
      const projInsts   = wfInstances.filter(w => w.project_id === p.id);
      const projAIs     = actionItems.filter(a => projInsts.some(i=>i.id===a.instance_id));
      const projFlags   = redFlags.filter(f => f.projId === p.id);
      const projReqs    = resourceReqs.filter(r => r.project_id === p.id);
      const projCoc     = cocEvents.filter(e => projInsts.some(i=>i.id===e.instance_id)).slice(0,6);
      // Hours by day for this project
      const hoursByDay  = {};
      weekDays.forEach(d => { hoursByDay[d] = (weekEntries||[]).filter(e=>e.project_id===p.id&&e.date===d).reduce((s,e)=>s+parseFloat(e.hours||0),0); });
      // EVM stub — real data would come from project fields
      const pct = totalTasks>0 ? Math.round(doneTasks/totalTasks*100) : 0;
      const urgency = projFlags.length*5 + overdueTasks.length*3 + projAIs.filter(a=>a.due_date&&a.due_date<today).length*2 + projInsts.length + projReqs.length;
      return { p, projTasks, totalTasks, doneTasks, pct, overdueTasks, projInsts, projAIs, projFlags, projReqs, projCoc, hoursByDay, urgency };
    }).sort((a,b) => b.urgency - a.urgency);

    // Portfolio-level EVM aggregates (stub — real CPI/SPI needs EV/AC/PV from DB)
    const totalOverdue   = projStats.reduce((s,ps)=>s+ps.overdueTasks.length, 0);
    const totalFlags     = redFlags.length;
    const totalReqs      = resourceReqs.length;
    const totalInstances = wfInstances.length;
    const weekHours      = (weekEntries||[]).reduce((s,e)=>s+parseFloat(e.hours||0),0);

    // ── Timesheet compliance — % of active resources who logged today ──
    const activeResIds   = new Set(_resources.filter(r=>r.is_active).map(r=>r.id));
    const loggedToday    = new Set((weekEntries||[]).filter(e=>e.date===today).map(e=>e.resource_id));
    const tsCompliance   = activeResIds.size > 0 ? Math.round(loggedToday.size / activeResIds.size * 100) : null;

    // ── Red signals NOW — team members with red signal today ──────────
    const redSignalsNow  = new Set(
      (confSignals||[]).filter(e=>e.outcome==='blocked'&&e.created_at>=today+'T00:00:00').map(e=>e.actor_name)
    ).size;

    // ── Per-resource daily sentiment arc from progress updates ────────
    // Build: resId → { date → dominant signal (green/yellow/red) }
    const resSentiment = {};
    (confSignals||[]).forEach(e => {
      if (!e.actor_name) return;
      const d = e.created_at.slice(0,10);
      if (!weekDays.includes(d)) return;
      if (!resSentiment[e.actor_name]) resSentiment[e.actor_name] = {};
      // Red beats yellow beats green
      const prev = resSentiment[e.actor_name][d];
      const rank = {on_track:1, at_risk:2, blocked:3};
      if (!prev || (rank[e.outcome]||0) > (rank[prev]||0))
        resSentiment[e.actor_name][d] = e.outcome||'on_track';
    });
    // Also derive from time entries: no entry on a working day = grey
    // Signal color helper
    function sigColor(sig) {
      if (sig==='blocked') return '#E24B4A';
      if (sig==='at_risk')  return '#EF9F27';
      if (sig==='on_track') return '#1D9E75';
      return null; // no data
    }
    function sigLabel(sig) {
      if (sig==='blocked') return 'Blocked';
      if (sig==='at_risk')  return 'At risk';
      if (sig==='on_track') return 'On track';
      return '—';
    }

    // ── 5-segment health bar scores per project ───────────────────────
    // Schedule: SPI if available, else task overdue ratio
    // Cost: CPI if available, else budget consumed ratio
    // Confidence: ratio of green signals vs all signals from team this week
    // Rework: ratio of step_reset events vs step_completed
    // Timesheets: % of expected resources logging time
    function projectHealthSegments(ps) {
      const {p, overdueTasks, projTasks, projCoc, projInsts} = ps;
      const projEntries = (weekEntries||[]).filter(e=>e.project_id===p.id);
      // Schedule
      let schedScore = 1;
      if (p.spi) schedScore = parseFloat(p.spi);
      else if (projTasks.length > 0) schedScore = 1 - (overdueTasks.length / Math.max(projTasks.length,1));
      // Cost
      let costScore = 1;
      if (p.cpi) costScore = parseFloat(p.cpi);
      else if (p.budget_hours && p.budget_hours_used)
        costScore = 1 - Math.max(0, (parseFloat(p.budget_hours_used)/parseFloat(p.budget_hours)) - 1);
      // Confidence: from confSignals matching proj instances this week
      const projInstIds = new Set(projInsts.map(i=>i.id));
      const projSigs = (confSignals||[]).filter(e=>projInstIds.has(e.instance_id)||projEntries.some(te=>te.resource_id===e.resource_id));
      const greenSigs = projSigs.filter(e=>e.outcome==='on_track').length;
      const confScore = projSigs.length > 0 ? greenSigs / projSigs.length : 0.5;
      // Rework: step_resets vs step_completed
      const resets    = projCoc.filter(e=>e.event_type==='step_reset').length;
      const completed = projCoc.filter(e=>e.event_type==='step_completed').length;
      const reworkScore = completed > 0 ? Math.max(0, 1 - resets/Math.max(completed,1)) : (resets > 0 ? 0 : 0.8);
      // Timesheets: resources who logged time this week for this proj
      const projResIds  = new Set(projEntries.map(e=>e.resource_id));
      const taskAssigned = new Set(_tasks.filter(t=>t.project_id===p.id&&t.assigned_to).map(t=>t.assigned_to));
      const tsScore = taskAssigned.size > 0 ? projResIds.size / Math.max(taskAssigned.size,1) : (projResIds.size > 0 ? 1 : 0.5);
      function score2color(s) {
        if (s >= 0.9) return '#1D9E75';
        if (s >= 0.7) return '#EF9F27';
        return '#E24B4A';
      }
      return [
        {label:'Schedule',  color:score2color(Math.min(schedScore,1)), score:schedScore},
        {label:'Cost',      color:score2color(Math.min(costScore,1)),  score:costScore},
        {label:'Confidence',color:score2color(confScore),              score:confScore},
        {label:'Rework',    color:score2color(reworkScore),            score:reworkScore},
        {label:'Timesheets',color:score2color(Math.min(tsScore,1)),    score:tsScore},
      ];
    }

    // ── Live feed events ──────────────────────────────────
    const feedEvents = cocEvents.slice(0,20).map(e => {
      const inst  = wfInstances.find(w=>w.id===e.instance_id);
      const proj  = _projects.find(p=>p.id===inst?.project_id);
      const isRej = e.event_type==='step_reset';
      const isDone= e.event_type==='step_completed';
      return { e, inst, proj, isRej, isDone,
        color: isRej?'var(--compass-red)':isDone?'var(--compass-green)':'var(--compass-amber)',
        icon: isRej?'↩':isDone?'✓':'●', age: _timeAgo(e.created_at) };
    });

    // ── Status color helper ───────────────────────────────
    function projStatusColor(ps) {
      if (ps.projFlags.length>0) return 'var(--compass-red)';
      if (ps.overdueTasks.length>3) return '#E24B4A';
      if (ps.overdueTasks.length>0) return 'var(--compass-amber)';
      if (ps.projInsts.length>0) return 'var(--compass-cyan)';
      return 'var(--compass-green)';
    }
    function projStatusLabel(ps) {
      if (ps.projFlags.length>0) return `<span class="pm-chip pm-chip-r">At risk</span>`;
      if (ps.overdueTasks.length>3) return `<span class="pm-chip pm-chip-r">At risk</span>`;
      if (ps.overdueTasks.length>0) return `<span class="pm-chip pm-chip-a">Watch</span>`;
      return `<span class="pm-chip pm-chip-g">On track</span>`;
    }

    // ── Day grid HTML ────────────────────────────────────
    function dayGridHtml(hoursByDay, projId) {
      return dayLabels.map((lbl,i)=>{
        const d = weekDays[i];
        const hrs = hoursByDay[d]||0;
        const isToday = d===today;
        const dayEntries = (weekEntries||[]).filter(e=>e.project_id===projId&&e.date===d);
        const bill = dayEntries.filter(e=>e.is_billable).reduce((s,e)=>s+parseFloat(e.hours||0),0);
        const nonbill = hrs - bill;
        const billPct = hrs>0 ? Math.round(bill/hrs*100) : 0;
        const dotColor = hrs>8?'#E24B4A':hrs>0?'#1D9E75':isToday?'#00D2FF':'#2A4060';
        const hrsColor = hrs>8?'var(--compass-red)':hrs>0?'var(--compass-green)':isToday?'var(--compass-cyan)':'#2A4060';
        // Build per-person tooltip data
        const byResource = {};
        dayEntries.forEach(e=>{
          if(!byResource[e.resource_id]) byResource[e.resource_id]={bill:0,nonbill:0};
          if(e.is_billable) byResource[e.resource_id].bill+=parseFloat(e.hours||0);
          else byResource[e.resource_id].nonbill+=parseFloat(e.hours||0);
        });
        const personRows = Object.entries(byResource).map(([rid,v])=>{
          const res=_resources.find(r=>r.id===rid);
          const name=res?res.first_name+' '+res.last_name:'Unknown';
          const tot=(v.bill+v.nonbill).toFixed(1);
          return name+'|'+tot+'|'+v.bill.toFixed(1)+'|'+v.nonbill.toFixed(1);
        }).join(';');
        const ttData = JSON.stringify({d,hrs:hrs.toFixed(1),bill:bill.toFixed(1),nonbill:nonbill.toFixed(1),billPct,persons:personRows});
        return `<div class="pm-dcell" data-tt='${ttData.replace(/'/g,"&#39;")}' data-date="${d}"
          onmouseenter="pmShowDayTip(event,this)"
          onmouseleave="pmHideTip()">
          <div class="pm-dlbl">${lbl}</div>
          <div class="pm-dot" style="background:${dotColor}"></div>
          <div class="pm-dhrs" style="color:${hrsColor}">${hrs>0?hrs.toFixed(1)+'h':'—'}</div>
          ${hrs>0?`<div style="height:3px;background:rgba(255,255,255,.08);margin-top:3px;border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${billPct}%;background:var(--compass-cyan);border-radius:2px"></div>
          </div>`:'<div style="height:3px;margin-top:3px"></div>'}
        </div>`;
      }).join('');
    }

    function evmColor(v) {
      if (!v) return 'var(--text3)';
      const n = parseFloat(v);
      return n >= 1 ? 'var(--compass-green)' : n >= 0.9 ? 'var(--compass-amber)' : 'var(--compass-red)';
    }
    // ── Project card HTML ────────────────────────────────
    function projCardHtml(ps, idx) {
      const {p,pct,doneTasks,totalTasks,overdueTasks,projInsts,projFlags,projReqs,projCoc,hoursByDay} = ps;
      const bcolor   = projStatusColor(ps);
      const slabel   = projStatusLabel(ps);
      const barColor = projFlags.length>0||overdueTasks.length>3?'#E24B4A':overdueTasks.length>0?'#EF9F27':'#1D9E75';
      const pmName   = _resources.find(r=>r.id===p.pm_resource_id);
      const pmLabel  = pmName ? `${pmName.first_name} ${pmName.last_name}` : '—';
      // CoC recent events inline
      const cocHtml = projCoc.slice(0,2).map(e=>{
        const isRej=e.event_type==='step_reset', isDone=e.event_type==='step_completed';
        const c=isRej?'var(--compass-red)':isDone?'var(--compass-green)':'var(--compass-amber)';
        return `<div style="display:flex;gap:6px;align-items:baseline;margin-top:3px;font-family:var(--font-head);font-size:11px">
          <span style="color:${c};flex-shrink:0">${isRej?'↩':isDone?'✓':'●'}</span>
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2)">${esc(e.step_name||'—')}${e.event_notes?' — <span style="color:'+c+'">'+esc(e.event_notes.slice(0,50))+'</span>':''}</span>
          <span style="color:#3A5C80;flex-shrink:0">${_timeAgo(e.created_at)}</span>
        </div>`;
      }).join('');

      return `<div class="pm-pcard" id="pm-card-${p.id}" data-proj-id="${p.id}" style="border-left-color:${bcolor}"
        onclick="pmOpenDrawer('${p.id}')">
        <!-- Header row: name + status badges -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:3px">
          <div class="pm-pn">${esc(p.name)}</div>
          <div style="display:flex;gap:4px;flex-shrink:0;align-items:center;padding-top:2px">
            ${slabel}
            ${projFlags.length>0?`<span class="pm-chip pm-chip-r">${projFlags.length} flag${projFlags.length>1?'s':''}</span>`:''}
            ${projReqs.length>0?`<span class="pm-chip pm-chip-a">${projReqs.length} req</span>`:''}
          </div>
        </div>
        <div class="pm-pmeta">${esc(p.client||'—')} · PM ${pmLabel} · Due ${p.target_date?fmtDate(p.target_date):'—'}</div>

        <!-- 5-segment health bar -->
        ${(()=>{
          const segs = projectHealthSegments(ps);
          const labels = segs.map(s=>`<span style="font-family:var(--font-head);font-size:11px;color:${s.color};opacity:.8">${s.label}</span>`).join('<span style="color:#2A4060;margin:0 3px">·</span>');
          return `<div style="margin:6px 0 4px">
            <div style="display:flex;gap:2px;height:5px;margin-bottom:4px">
              ${segs.map(s=>`<div style="flex:1;height:5px;background:${s.color};opacity:.85;border-radius:1px" title="${s.label}: ${Math.round(s.score*100)}%"></div>`).join('')}
            </div>
            <div style="display:flex;gap:0;justify-content:space-between;font-family:var(--font-head);font-size:11px;flex-wrap:nowrap">${labels}</div>
          </div>`;
        })()}

        <!-- Day grid: individual boxed cells like mockup -->
        <div class="pm-dgrid">
          ${dayGridHtml(hoursByDay, p.id)}
        </div>

        <!-- Progress bar — full width, colored -->
        <div class="pm-pbar">
          <div class="pm-pbar-fill" style="width:${Math.min(pct,100)}%;background:${barColor}"></div>
        </div>

        <!-- EVM metrics row -->
        <div class="pm-evmrow">
          <div class="pm-evm-cell">
            <div class="pm-evm-lbl">CPI</div>
            <div class="pm-evm-val" style="color:${evmColor(p.cpi)}">${p.cpi?parseFloat(p.cpi).toFixed(2):'—'}</div>
          </div>
          <div class="pm-evm-cell">
            <div class="pm-evm-lbl">SPI</div>
            <div class="pm-evm-val" style="color:${evmColor(p.spi)}">${p.spi?parseFloat(p.spi).toFixed(2):'—'}</div>
          </div>
          <div class="pm-evm-cell">
            <div class="pm-evm-lbl">TCPI</div>
            <div class="pm-evm-val" style="color:${evmColor(p.tcpi)}">${p.tcpi?parseFloat(p.tcpi).toFixed(2):'—'}</div>
          </div>
          <div class="pm-evm-cell" style="border-right:none">
            <div class="pm-evm-lbl">FORECAST SLIP</div>
            <div class="pm-evm-val" style="color:${barColor};font-size:14px">${p.forecast_slip||'On track'}</div>
          </div>
        </div>

        <!-- Stats line + budget -->
        <div style="display:flex;justify-content:space-between;align-items:baseline;font-family:var(--font-head);font-size:11px;color:#4A6E90;margin-top:4px">
          <span>${pct}% complete · ${doneTasks}/${totalTasks} tasks</span>
          ${p.budget_hours?`<span>${p.budget_hours_used?Math.round(p.budget_hours_used):'0'}h of ${Math.round(p.budget_hours)}h budget</span>`:''}
        </div>

        <!-- Chip row: overdue + requests + red signal + P50 right-aligned -->
        <div class="pm-chiprow">
          ${overdueTasks.length>0?`<span class="pm-chip pm-chip-r" style="cursor:pointer"
            data-tt='${JSON.stringify({type:"overdue",items:overdueTasks.slice(0,8).map(t=>({n:(t.name||t.title||'—').slice(0,40),d:t.due_date||''}))}).replace(/'/g,"&#39;")}'
            onmouseenter="pmShowOverdueTip(event,this)" onmouseleave="pmHideTip()">${overdueTasks.length} overdue</span>`:''}
          ${projReqs.length>0?`<span class="pm-chip pm-chip-a" style="cursor:pointer"
            data-tt='${JSON.stringify({type:"reqs",items:projReqs.slice(0,6).map(r=>({d:r.submitted_at||'',p:(_projects.find(x=>x.id===r.project_id)?.name||'—').slice(0,30)}))}).replace(/'/g,"&#39;")}'
            onmouseenter="pmShowReqsTip(event,this)" onmouseleave="pmHideTip()">${projReqs.length} request${projReqs.length>1?'s':''}</span>`:''}
          ${projFlags.length>0?`<span class="pm-chip pm-chip-r">${projFlags.length} red signal${projFlags.length>1?'s':''}</span>`:''}
          <span style="margin-left:auto;font-family:var(--font-head);font-size:11px;color:#4A6E90">
            P50 <strong style="color:${barColor}">${p.target_date?fmtDate(p.target_date):'—'}</strong>
            ${p.target_date?` · target ${fmtDate(p.target_date)}`:''}
          </span>
        </div>

        <!-- Recent CoC events -->
        ${cocHtml?`<div style="border-top:1px solid rgba(0,210,255,.08);margin-top:8px;padding-top:6px">${cocHtml}</div>`:''}
      </div>`;
    }

    // ── Build alert rail (unacknowledged flags + aged requests) ─
    const alertHtml = (() => {
      const alerts = [];
      redFlags.forEach(f => {
        const e = cocEvents.find(ev=>ev.instance_id===f.instance_id&&ev.event_type==='step_reset'&&ev.created_at===f.created_at);
        const actorLabel = f.actor_name ? esc(f.actor_name) + ' — ' : '';
        const noteLabel  = f.event_notes ? '"' + esc(f.event_notes.slice(0,80)) + '"' : esc(f.instTitle);
        alerts.push(`<div class="pm-alert">
          <span class="pm-alert-type">■ RED SIGNAL</span>
          <span class="pm-alert-proj">${esc(f.projName)}</span>
          <span class="pm-alert-msg">${actorLabel}${noteLabel}</span>
          <span class="pm-alert-age">${_timeAgo(f.created_at)}</span>
          <button class="pm-btn pm-btn-red" onclick="pmAcknowledge('${f.instance_id}',null,this)">Acknowledge</button>
          <button class="pm-btn pm-btn-cyan" onclick="event.stopPropagation();pmOpenDrawer('${f.projId}')">Open instance →</button>
        </div>`);
      });
      resourceReqs.filter(r=>{
        const hrs=(Date.now()-new Date(r.submitted_at).getTime())/3600000;
        return hrs>48;
      }).forEach(r => {
        const hrs=Math.round((Date.now()-new Date(r.submitted_at).getTime())/3600000);
        const proj=_projects.find(p=>p.id===r.project_id);
        alerts.push(`<div class="pm-alert">
          <span class="pm-alert-type warn">● REQUEST ${hrs}H</span>
          <span class="pm-alert-proj">${esc(proj?.name||'—')}</span>
          <span class="pm-alert-msg">Resource request — pending ${hrs}h with no response</span>
          <span class="pm-alert-age">${_timeAgo(r.submitted_at)}</span>
          <button class="pm-btn pm-btn-red" onclick="pmAcknowledge(null,'${r.id}',this)">Acknowledge</button>
          <button class="pm-btn pm-btn-cyan" onclick="window.location.href='/resource-requests.html'">Open request →</button>
        </div>`);
      });
      return alerts.length ? `<div class="pm-alertrail">${alerts.join('')}</div>` : '';
    })();

    // ── Assemble page ─────────────────────────────────────
    content.innerHTML = `<div class="pm-wrap">
      ${alertHtml}
      <div class="pm-sstrip">
        <div class="pm-sc">
          <div class="pm-sc-lbl">Active projects</div>
          <div class="pm-sc-val" style="color:var(--compass-cyan)">${activeProjects.length}</div>
          <div class="pm-sc-sub">${totalInstances} workflow${totalInstances!==1?'s':''} running</div>
        </div>
        <div class="pm-sc">
          <div class="pm-sc-lbl">Red flags</div>
          <div class="pm-sc-val" style="color:${totalFlags>0?'var(--compass-red)':'var(--text3)'}">${totalFlags}</div>
          <div class="pm-sc-sub">unacknowledged</div>
        </div>
        <div class="pm-sc">
          <div class="pm-sc-lbl">Red signals now</div>
          <div class="pm-sc-val" style="color:${redSignalsNow>0?'var(--compass-red)':'var(--text3)'}">${redSignalsNow}</div>
          <div class="pm-sc-sub">team members today</div>
        </div>
        <div class="pm-sc">
          <div class="pm-sc-lbl">Timesheet compliance</div>
          <div class="pm-sc-val" style="color:${tsCompliance===null?'var(--text3)':tsCompliance>=80?'var(--compass-green)':tsCompliance>=50?'var(--compass-amber)':'var(--compass-red)'}">${tsCompliance!==null?tsCompliance+'%':'—'}</div>
          <div class="pm-sc-sub">today · ${loggedToday.size}/${activeResIds.size} logged</div>
        </div>
        <div class="pm-sc">
          <div class="pm-sc-lbl">Open requests</div>
          <div class="pm-sc-val" style="color:${totalReqs>0?'var(--compass-amber)':'var(--text3)'}">${totalReqs}</div>
          <div class="pm-sc-sub">resource requests pending</div>
        </div>
      </div>

      <div class="pm-body">
        <div class="pm-left">
          <div class="pm-tabs">
            <div class="pm-tab on" onclick="pmSwitchTab(this,'pm-tab-portfolio')">Portfolio</div>
            <div class="pm-tab" onclick="pmSwitchTab(this,'pm-tab-exceptions')">Exceptions ${(totalFlags+totalOverdue)>0?`<span class="pm-tbadge" style="background:rgba(226,75,74,.25);color:#E24B4A">${totalFlags+totalOverdue}</span>`:''}</div>
            <div class="pm-tab" onclick="pmSwitchTab(this,'pm-tab-team')">Team</div>
            <div class="pm-tab" onclick="pmSwitchTab(this,'pm-tab-actions')">Action items ${actionItems.length>0?`<span class="pm-tbadge" style="background:rgba(239,159,39,.25);color:#EF9F27">${actionItems.length}</span>`:''}</div>
          </div>

          <!-- Portfolio tab -->
          <div id="pm-tab-portfolio" class="pm-tabpanel on" style="padding:0">
            <div class="pm-sec-hdr">
              <span style="width:7px;height:7px;border-radius:50%;background:#E24B4A;display:inline-block;flex-shrink:0"></span>
              ACTIVE — URGENCY ORDERED
              <span style="margin-left:auto;font-family:var(--font-head);font-size:11px;color:#3A5C80">${activeProjects.length} projects</span>
            </div>
            <div class="pm-pcards" style="overflow-y:auto;flex:1">
              ${projStats.length>0
                ? projStats.map((ps,i)=>projCardHtml(ps,i)).join('')
                : `<div style="padding:20px 13px;text-align:center;font-family:var(--font-head);font-size:12px;color:var(--text3)">No active projects</div>`}
            </div>
          </div>

          <!-- Exceptions tab -->
          <div id="pm-tab-exceptions" class="pm-tabpanel">
            ${(function(){
              let html = '';
              // ── Red flags ─────────────────────────────────────
              if (redFlags.length > 0) {
                html += `<div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;color:#E24B4A;margin-bottom:8px;text-transform:uppercase">■ Red flags (${redFlags.length})</div>`;
                redFlags.forEach(f => {
                  html += `<div style="background:rgba(226,75,74,.07);border:1px solid rgba(226,75,74,.28);border-left:3px solid #E24B4A;padding:10px 12px;margin-bottom:7px">
                    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px">
                      <span style="font-family:var(--font-body);font-size:12px;font-weight:600;color:#F0F6FF">${esc(f.projName)} — ${esc(f.instTitle)}</span>
                      <span style="font-family:var(--font-data);font-size:11px;color:#5A84A8">${_timeAgo(f.created_at)}</span>
                    </div>
                    ${f.actor_name?`<div style="font-family:var(--font-head);font-size:11px;color:#5A84A8;margin-bottom:4px">${esc(f.actor_name)}</div>`:''}
                    ${f.event_notes?`<div style="font-family:var(--font-body);font-size:11px;color:#C8DFF0;font-style:italic;border-left:2px solid rgba(226,75,74,.4);padding-left:8px;margin-bottom:8px">"${esc(f.event_notes.slice(0,120))}"</div>`:''}
                    <div style="display:flex;gap:6px;margin-top:8px">
                      <button class="pm-btn pm-btn-red" style="flex:1" onclick="pmAcknowledge('${f.instance_id}',null,this)">Acknowledge</button>
                      <button class="pm-btn pm-btn-cyan" style="flex:1" onclick="event.stopPropagation();pmOpenDrawer('${f.projId}')">Open instance →</button>
                    </div>
                  </div>`;
                });
              }
              // ── Overdue tasks — flat list, ALL of them ─────────
              if (totalOverdue > 0) {
                html += `<div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;color:#EF9F27;margin:10px 0 8px;text-transform:uppercase">● Overdue tasks (${totalOverdue})</div>`;
                projStats.filter(ps=>ps.overdueTasks.length>0).forEach(ps => {
                  html += `<div style="font-family:var(--font-head);font-size:11px;font-weight:700;color:#90B8D8;padding:5px 0 3px;letter-spacing:.04em">${esc(ps.p.name)}</div>`;
                  ps.overdueTasks.forEach(t => {
                    const assignee = _resources.find(r=>r.user_id===t.assigned_to);
                    const name = assignee ? assignee.first_name+' '+assignee.last_name : null;
                    html += `<div style="display:flex;align-items:baseline;gap:8px;padding:5px 8px;border-bottom:1px solid rgba(0,210,255,.07)">
                      <span style="color:#E24B4A;flex-shrink:0">!</span>
                      <span style="font-family:var(--font-body);font-size:12px;color:#C8DFF0;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name||t.title||'—')}</span>
                      ${name?`<span style="font-family:var(--font-head);font-size:11px;color:#4A6E90;flex-shrink:0">${esc(name)}</span>`:''}
                      <span style="font-family:var(--font-head);font-size:11px;font-weight:700;color:#E24B4A;flex-shrink:0">${daysOverdue(t.due_date)}d</span>
                    </div>`;
                  });
                });
              }
              if (!html) html = '<div style="font-family:var(--font-head);font-size:12px;color:var(--text3);text-align:center;padding:24px">No exceptions — all projects on track</div>';
              return html;
            })()}
          </div>

          <!-- Team tab -->
          <div id="pm-tab-team" class="pm-tabpanel">
            ${(function(){
              // Build resource map (same logic as before)
              const resMap = {};
              _resources.forEach(r => { resMap[r.id] = { ...r, source:'roster', taskCount:0, projIds:new Set(), weekHrs:0, billHrs:0 }; });
              const rosterUserIds = new Set(_resources.map(r=>r.user_id).filter(Boolean));
              _tasks.filter(t=>t.assigned_to&&!rosterUserIds.has(t.assigned_to)).forEach(t => {
                const synId = 'synthetic_'+t.assigned_to;
                if (!resMap[synId]) {
                  const u = (_users||[]).find(u=>u.id===t.assigned_to);
                  const nm = u?.name||u?.email||('User '+t.assigned_to.slice(0,8));
                  const parts = nm.split(' ');
                  resMap[synId] = { id:synId, first_name:parts[0]||nm, last_name:parts.slice(1).join(' ')||'', user_id:t.assigned_to, department:'External', is_active:true, source:'task', taskCount:0, projIds:new Set(), weekHrs:0, billHrs:0 };
                }
              });
              (weekEntries||[]).forEach(e => {
                if (resMap[e.resource_id]) {
                  resMap[e.resource_id].weekHrs += parseFloat(e.hours||0);
                  if (e.is_billable) resMap[e.resource_id].billHrs += parseFloat(e.hours||0);
                  if (e.project_id) resMap[e.resource_id].projIds.add(e.project_id);
                }
              });
              _tasks.filter(t=>t.assigned_to&&!['complete','cancelled'].includes(t.status)).forEach(t => {
                const r = Object.values(resMap).find(r=>r.user_id===t.assigned_to);
                if (r) { r.taskCount++; if(t.project_id) r.projIds.add(t.project_id); }
              });
              const allRes = Object.values(resMap).filter(r=>r.is_active!==false);
              const depts = {};
              allRes.forEach(r => { const dept=r.department||'Unassigned'; if(!depts[dept])depts[dept]=[]; depts[dept].push(r); });
              const deptNames = Object.keys(depts).sort();
              if (!allRes.length) return '<div style="font-family:var(--font-head);font-size:12px;color:var(--text3);text-align:center;padding:24px">No team members found</div>';

              // ── Department filter bar ──────────────────────────
              let html = `<div id="pm-team-filter" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;padding:8px 0 6px;border-bottom:1px solid rgba(0,210,255,.08)">
                <button class="pm-team-filter-btn on" data-dept="all"
                  style="font-family:var(--font-head);font-size:11px;font-weight:700;padding:3px 10px;background:#132035;border:1px solid rgba(0,210,255,.4);color:#F0F6FF;cursor:pointer"
                  onclick="pmTeamFilter(this,'all')">All (${allRes.length})</button>
                ${deptNames.map(d=>`<button class="pm-team-filter-btn" data-dept="${esc(d)}"
                  style="font-family:var(--font-head);font-size:11px;font-weight:700;padding:3px 10px;background:#0c1828;border:1px solid rgba(0,210,255,.12);color:#5A84A8;cursor:pointer"
                  onclick="pmTeamFilter(this,'${esc(d)}')">${esc(d)} (${depts[d].length})</button>`).join('')}
              </div>`;

              // ── Per-resource rows with sentiment dot arc ───────
              deptNames.forEach(dept => {
                html += `<div class="pm-team-group" data-dept="${esc(dept)}">
                  <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#3A5C80;padding:6px 0 3px;border-bottom:1px solid rgba(0,210,255,.08);margin-bottom:3px">${esc(dept)}</div>`;

                depts[dept].sort((a,b)=>(a.last_name||'').localeCompare(b.last_name||'')).forEach(r => {
                  const initials   = ((r.first_name||'')[0]||'').toUpperCase() + ((r.last_name||'')[0]||'').toUpperCase();
                  const fullName   = (r.first_name+' '+r.last_name).trim();
                  const billPct    = r.weekHrs>0 ? Math.round(r.billHrs/r.weekHrs*100) : 0;
                  const projList   = [...r.projIds].map(pid=>_projects.find(p=>p.id===pid)?.name).filter(Boolean).slice(0,2);

                  // Sentiment arc: M–F dots from resSentiment keyed by name
                  const nameKey    = fullName;
                  const sentByDay  = resSentiment[nameKey] || {};
                  // Also check time entries — day with hours but no signal = logged, no signal
                  const hByDay     = {};
                  weekDays.forEach(d => { hByDay[d] = (weekEntries||[]).filter(e=>e.resource_id===r.id&&e.date===d).reduce((s,e)=>s+parseFloat(e.hours||0),0); });

                  const dayDotLabels = ['M','T','W','Th','F'];
                  const dotHtml = weekDays.map((d,i) => {
                    const sig  = sentByDay[d];
                    const hrs  = hByDay[d]||0;
                    const isToday = d === today;
                    let dotColor, dotTitle;
                    if (sig) {
                      dotColor = sigColor(sig);
                      dotTitle = `${dayDotLabels[i]}: ${sigLabel(sig)} · ${hrs.toFixed(1)}h`;
                    } else if (hrs > 0) {
                      dotColor = '#4A74A0'; // logged time, no signal
                      dotTitle = `${dayDotLabels[i]}: ${hrs.toFixed(1)}h logged, no signal`;
                    } else if (d > today) {
                      dotColor = 'rgba(255,255,255,.08)';
                      dotTitle = `${dayDotLabels[i]}: future`;
                    } else {
                      dotColor = 'rgba(255,255,255,.15)';
                      dotTitle = `${dayDotLabels[i]}: no activity`;
                    }
                    return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer"
                      title="${dotTitle}"
                      onclick="pmPersonDayBrief('${esc(fullName)}','${d}','${dayDotLabels[i]}','${esc(fullName+': '+dotTitle)}')">
                      <span style="font-family:var(--font-head);font-size:11px;font-weight:700;color:#3A5C80">${dayDotLabels[i]}</span>
                      <div style="width:11px;height:11px;border-radius:50%;background:${dotColor};transition:transform .1s"
                        onmouseenter="this.style.transform='scale(1.3)'" onmouseleave="this.style.transform='scale(1)'"></div>
                    </div>`;
                  }).join('');

                  // Week arc string e.g. G→Y→R→—→—
                  const arcStr = weekDays.map(d=>{
                    const sig = sentByDay[d];
                    if (!sig) return (hByDay[d]>0)?'L':'—';
                    return sig==='on_track'?'G':sig==='at_risk'?'Y':'R';
                  }).join('→');

                  // Hours vs expected (assume 8h/day × 5 = 40h expected)
                  const expected = 40;
                  const hrsColor = r.weekHrs >= expected*0.9 ? 'var(--compass-green)' : r.weekHrs >= expected*0.5 ? 'var(--compass-amber)' : 'var(--compass-red)';

                  html += `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(0,210,255,.06)">
                    <div style="width:32px;height:32px;border-radius:50%;background:#0f2040;border:1px solid rgba(0,210,255,.2);display:flex;align-items:center;justify-content:center;font-family:var(--font-head);font-size:12px;font-weight:700;color:#00D2FF;flex-shrink:0">${esc(initials)}</div>
                    <div style="flex:1;min-width:0">
                      <div style="font-family:var(--font-body);font-size:12px;font-weight:500;color:#F0F6FF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(fullName)}</div>
                      <div style="font-family:var(--font-head);font-size:11px;color:#4A6E90;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${projList.length?projList.map(n=>`<span style="color:#90B8D8">${esc(n)}</span>`).join(', '):'No active projects'}</div>
                    </div>
                    <!-- Day sentiment dots -->
                    <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">${dotHtml}</div>
                    <!-- Hours + week summary -->
                    <div style="text-align:right;flex-shrink:0;min-width:52px">
                      <div style="font-family:var(--font-display);font-size:14px;font-weight:700;color:${hrsColor};line-height:1">${r.weekHrs.toFixed(1)}h</div>
                      <div style="font-family:var(--font-head);font-size:11px;color:#3A5C80">${billPct}% bill</div>
                    </div>
                    <button onclick="pmPersonWeekBrief('${esc(fullName)}','${arcStr}',${r.weekHrs.toFixed(1)},${expected})"
                      style="font-family:var(--font-head);font-size:11px;font-weight:700;color:#00D2FF;background:none;border:1px solid rgba(0,210,255,.2);padding:3px 7px;cursor:pointer;flex-shrink:0;transition:background .1s"
                      onmouseenter="this.style.background='rgba(0,210,255,.08)'"
                      onmouseleave="this.style.background='none'">wk →</button>
                  </div>`;
                });
                html += '</div>';
              });
              return html;
            })()}
          </div>

          <!-- Action items tab -->
          <div id="pm-tab-actions" class="pm-tabpanel">
            ${(function(){
              if (!actionItems.length) return '<div style="font-family:var(--font-head);font-size:12px;color:var(--text3);text-align:center;padding:24px">No open action items</div>';
              const overdueAIs = actionItems.filter(a=>a.due_date&&a.due_date<today);
              const currentAIs = actionItems.filter(a=>!a.due_date||a.due_date>=today);
              let html = '';
              if (overdueAIs.length) {
                html += `<div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;color:#E24B4A;margin-bottom:6px;text-transform:uppercase">● Overdue (${overdueAIs.length})</div>`;
                overdueAIs.forEach(a => {
                  const inst=wfInstances.find(w=>w.id===a.instance_id);
                  const proj=_projects.find(p=>p.id===inst?.project_id);
                  html += `<div style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid rgba(226,75,74,.1)">
                    <div style="width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:3px;background:var(--compass-red)"></div>
                    <div style="flex:1;min-width:0">
                      <div style="font-family:var(--font-body);font-size:12px;font-weight:500;color:#F0F6FF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.title||'—')}</div>
                      <div style="font-family:var(--font-head);font-size:11px;color:#4A6E90;margin-top:1px">${proj?esc(proj.name)+' · ':''}${a.owner_name?esc(a.owner_name)+' · ':''}Due ${fmtDate(a.due_date)}</div>
                    </div>
                    <span class="pm-chip pm-chip-r" style="flex-shrink:0">${daysOverdue(a.due_date)}d late</span>
                  </div>`;
                });
              }
              if (currentAIs.length) {
                html += `<div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;color:#EF9F27;margin:${overdueAIs.length?'12px':0} 0 6px;text-transform:uppercase">● Open (${currentAIs.length})</div>`;
                currentAIs.forEach(a => {
                  const inst=wfInstances.find(w=>w.id===a.instance_id);
                  const proj=_projects.find(p=>p.id===inst?.project_id);
                  html += `<div style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid rgba(0,210,255,.07)">
                    <div style="width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:3px;background:var(--compass-amber)"></div>
                    <div style="flex:1;min-width:0">
                      <div style="font-family:var(--font-body);font-size:12px;font-weight:500;color:#F0F6FF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.title||'—')}</div>
                      <div style="font-family:var(--font-head);font-size:11px;color:#4A6E90;margin-top:1px">${proj?esc(proj.name)+' · ':''}${a.owner_name?esc(a.owner_name)+' · ':''}${a.due_date?'Due '+fmtDate(a.due_date):'No due date'}</div>
                    </div>
                    ${a.due_date?`<span style="font-family:var(--font-head);font-size:11px;color:#4A6E90;flex-shrink:0">${fmtDate(a.due_date)}</span>`:''}
                  </div>`;
                });
              }
              return html;
            })()}
          </div>
        </div>

        <div class="pm-right">
          <div class="pm-feed-hdr">
            <span style="font-family:var(--font-head);font-size:13px;font-weight:700;color:var(--text1)">Portfolio feed</span>
            <div style="display:flex;align-items:center;gap:5px">
              <span class="pm-live-dot"></span>
              <span style="font-family:var(--font-data);font-size:11px;color:var(--compass-green)">live · click to open</span>
            </div>
          </div>
          <div id="pm-live-feed" style="overflow-y:auto;flex:1">
            ${feedEvents.length===0
              ? `<div style="padding:14px 12px;font-family:var(--font-head);font-size:12px;color:var(--text3)">No recent activity</div>`
              : feedEvents.map(({e,proj,isRej,isDone,color,icon,age})=>`
              <div class="pm-frow" onclick="pmOpenDrawer('${proj?.id||''}')">
                <div class="pm-fstrip" style="background:${color}"></div>
                <div class="pm-ftag-col">
                  <div class="pm-ftag" style="color:${color}" title="${esc(proj?.name||'—')}">${esc(proj?.name?.slice(0,9)||'—')}</div>
                  <div class="pm-ftag-inst">${isRej?'↩ reset':isDone?'✓ done':'● active'}</div>
                </div>
                <div class="pm-fbody" style="padding:6px 8px;min-width:0;flex:1">
                  <div class="pm-ftitle">${esc(e.step_name||'—')}${e.actor_name?' <span style="color:#5A84A8">— '+esc(e.actor_name)+'</span>':''}</div>
                  ${e.event_notes&&isRej?`<div class="pm-fsub" style="color:var(--compass-red);font-style:italic;margin-top:1px">"${esc(e.event_notes.slice(0,55))}"</div>`:''  }
                </div>
                <div class="pm-fage" style="padding:6px 10px 6px 0;align-self:center">${age}</div>
              </div>`).join('')}
          </div>
          <div style="border-top:1px solid rgba(0,210,255,.1);padding:8px 12px">
            <button class="pm-btn pm-btn-cyan" style="width:100%;padding:6px;text-align:center" onclick="pmSimulateLiveEvent()">+ SIMULATE LIVE EVENT</button>
          </div>
        </div>
      </div>
    </div>`;

    // ── Tooltip engine ───────────────────────────────────
    (function() {
      let tip = null;
      function getTip() {
        if (!tip) {
          tip = document.createElement('div');
          tip.className = 'pm-tooltip';
          document.body.appendChild(tip);
        }
        return tip;
      }
      function pos(ev) {
        const t=getTip(), W=window.innerWidth, H=window.innerHeight;
        const x = ev.clientX + 14, y = ev.clientY - 10;
        t.style.left = (x + t.offsetWidth > W-16 ? ev.clientX - t.offsetWidth - 14 : x) + 'px';
        t.style.top  = (y + t.offsetHeight > H-16 ? ev.clientY - t.offsetHeight - 6 : y) + 'px';
      }
      window.pmHideTip = function() {
        const t = getTip(); t.classList.remove('show'); t.innerHTML = '';
      };
      window.pmShowDayTip = function(ev, el) {
        if (!ev.ctrlKey) return;  // Ctrl required
        try {
          const d = JSON.parse(el.dataset.tt.replace(/&#39;/g,"'"));
          const t = getTip();
          const dateLabel = new Date(d.d+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
          let html = `<div class="pm-tt-hdr">${dateLabel}</div>`;
          if (parseFloat(d.hrs) > 0) {
            html += `<div class="pm-tt-row"><span>Total</span><span style="color:var(--compass-cyan)">${d.hrs}h</span></div>`;
            html += `<div class="pm-tt-bar"><div class="pm-tt-bar-fill" style="width:${d.billPct}%"></div></div>`;
            html += `<div class="pm-tt-row"><span style="color:var(--compass-cyan)">Billable</span><span style="color:var(--compass-cyan)">${d.bill}h (${d.billPct}%)</span></div>`;
            html += `<div class="pm-tt-row"><span style="color:#8B5CF6">Non-bill</span><span style="color:#8B5CF6">${d.nonbill}h (${100-d.billPct}%)</span></div>`;
            if (d.persons) {
              html += `<div style="margin-top:8px;border-top:1px solid rgba(0,210,255,.12);padding-top:6px">`;
              html += `<div class="pm-tt-hdr" style="margin-bottom:4px">Per person</div>`;
              d.persons.split(';').filter(Boolean).forEach(row => {
                const [name,tot,bill,nb] = row.split('|');
                const bp = tot>0?Math.round(bill/tot*100):0;
                html += `<div class="pm-tt-person">
                  <span style="color:#C8DFF0">${name}</span>
                  <span style="color:var(--compass-cyan)">${tot}h</span>
                  <span style="color:#3A5C80">${bp}% bill</span>
                </div>`;
              });
              html += '</div>';
            }
          } else {
            html += `<div style="font-family:var(--font-head);font-size:11px;color:#3A5C80">No time logged</div>`;
          }
          t.innerHTML = html;
          t.classList.add('show');
          pos(ev);
        } catch(e) {}
      };
      window.pmShowOverdueTip = function(ev, el) {
        if (!ev.ctrlKey) return;  // Ctrl required
        try {
          const d = JSON.parse(el.dataset.tt.replace(/&#39;/g,"'"));
          const t = getTip();
          let html = `<div class="pm-tt-hdr">Overdue tasks (${d.items.length}${d.items.length===8?'+':''})</div>`;
          d.items.forEach(item => {
            const days = item.d ? Math.floor((Date.now()-new Date(item.d+'T00:00:00').getTime())/86400000) : null;
            html += `<div class="pm-tt-person">
              <span style="color:#C8DFF0;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.n}</span>
              ${days!==null?`<span style="color:#E24B4A;flex-shrink:0;margin-left:8px">${days}d ago</span>`:''}
            </div>`;
          });
          t.innerHTML = html; t.classList.add('show'); pos(ev);
        } catch(e) {}
      };
      window.pmShowReqsTip = function(ev, el) {
        if (!ev.ctrlKey) return;  // Ctrl required
        try {
          const d = JSON.parse(el.dataset.tt.replace(/&#39;/g,"'"));
          const t = getTip();
          let html = `<div class="pm-tt-hdr">Pending requests (${d.items.length})</div>`;
          d.items.forEach(item => {
            const age = item.d ? Math.floor((Date.now()-new Date(item.d).getTime())/3600000) : null;
            html += `<div class="pm-tt-person">
              <span style="color:#C8DFF0">${item.p}</span>
              ${age!==null?`<span style="color:${age>48?'#E24B4A':'#EF9F27'};flex-shrink:0">${age}h ago</span>`:''}
            </div>`;
          });
          t.innerHTML = html; t.classList.add('show'); pos(ev);
        } catch(e) {}
      };
      document.addEventListener('mousemove', function(ev) {
        const t = getTip(); if (!t.classList.contains('show')) return;
        pos(ev);
      });
    })();

    // ── Acknowledge handler ───────────────────────────────
    window.pmAcknowledge = function(instanceId, reqId, el) {
      const row = el.closest('.pm-alert');
      row.style.transition = 'opacity .3s';
      row.style.opacity = '0.3';
      if (instanceId) {
        API.post('workflow_step_instances', {
          event_type: 'step_completed',
          instance_id: instanceId,
          created_at: new Date().toISOString(),
          firm_id: 'aaaaaaaa-0001-0001-0001-000000000001'
        }).catch(()=>{});
      }
      setTimeout(() => {
        row.style.maxHeight = row.offsetHeight + 'px';
        row.style.overflow = 'hidden';
        row.style.transition = 'max-height .25s ease, padding .25s ease, opacity .1s';
        row.style.maxHeight = '0';
        row.style.padding = '0';
        setTimeout(() => row.remove(), 280);
      }, 200);
    };

    // ── Tab switcher ─────────────────────────────────────
    // ── Person day brief ─────────────────────────────────
    window.pmPersonDayBrief = function(name, date, dayLabel, summary) {
      const hrsOnDay = (weekEntries||[]).filter(e=>{
        const r = Object.values({}).find(r=>r); // we'll derive from name
        return e.date===date;
      }).reduce((s,e)=>s+parseFloat(e.hours||0),0);
      const dateLabel = new Date(date+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
      pmOpenDayBriefingPanel(name+' · '+dayLabel, dateLabel, summary, null);
    };
    // ── Person week brief ─────────────────────────────────
    window.pmPersonWeekBrief = function(name, arcStr, hrs, expected) {
      const redCount   = (arcStr.match(/R/g)||[]).length;
      const yellowCount= (arcStr.match(/Y/g)||[]).length;
      const noActivity = (arcStr.match(/—/g)||[]).length;
      let narrative = `${name} — week arc: ${arcStr}. ${hrs}h logged of ~${expected}h expected (${Math.round(hrs/expected*100)}%).`;
      if (redCount >= 3)     narrative += ` Multiple red signals (${redCount} days) — sustained distress. Recommend direct conversation.`;
      else if (redCount === 2) narrative += ` Two red signal days — emerging pattern. Monitor closely.`;
      else if (noActivity >= 2) narrative += ` ${noActivity} days with no logged activity — possible disengagement or block. Recommend check-in.`;
      else if (arcStr.includes('G→G→Y→Y→R') || arcStr.includes('G→Y→Y→R')) narrative += ' Consistent degradation over the week. Review what changed on the day the arc shifted.';
      else if (!arcStr.includes('R') && !arcStr.includes('Y')) narrative += ' Clean week — consistent performance throughout.';
      else narrative += ' Mixed signals — review individual day briefs for context.';
      pmOpenDayBriefingPanel(name+' · Week summary', arcStr, narrative, {hrs, expected, arc:arcStr});
    };
    // ── Day briefing panel (shared by project days + person days) ─────
    function pmOpenDayBriefingPanel(title, subtitle, narrative, extra) {
      document.getElementById('pm-brief-overlay')?.remove();
      document.getElementById('pm-brief-panel')?.remove();
      const overlay = document.createElement('div');
      overlay.id='pm-brief-overlay';
      overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:190';
      overlay.onclick=()=>{overlay.remove();document.getElementById('pm-brief-panel')?.remove();};
      document.body.appendChild(overlay);
      const panel = document.createElement('div');
      panel.id='pm-brief-panel';
      panel.style.cssText='position:fixed;top:44px;right:0;bottom:0;width:360px;background:#08101f;border-left:1px solid rgba(0,210,255,.2);display:flex;flex-direction:column;z-index:200;animation:pm-drawer-in .2s ease';
      const arcHtml = extra?.arc ? (() => {
        const steps = extra.arc.split('→');
        const colors = {G:'#1D9E75',Y:'#EF9F27',R:'#E24B4A','L':'#4A74A0','—':'rgba(255,255,255,.12)'};
        const labels = ['M','T','W','Th','F'];
        return `<div style="display:flex;gap:8px;align-items:flex-end;margin:10px 0 8px;padding:10px 12px;background:#091522;border:1px solid rgba(0,210,255,.1)">
          ${steps.map((s,i)=>`<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
            <span style="font-family:var(--font-head);font-size:11px;font-weight:700;color:${colors[s]||'#3A5C80'}">${s}</span>
            <div style="width:14px;height:14px;border-radius:50%;background:${colors[s]||'rgba(255,255,255,.08)'}"></div>
            <span style="font-family:var(--font-head);font-size:11px;color:#3A5C80">${labels[i]||''}</span>
          </div>`).join('<span style="color:#2A4060;align-self:center;font-size:11px;padding-bottom:14px">→</span>')}
          <div style="margin-left:auto;text-align:right;border-left:1px solid rgba(0,210,255,.08);padding-left:10px">
            <div style="font-family:var(--font-display);font-size:18px;font-weight:700;color:${extra.hrs>=extra.expected*0.9?'var(--compass-green)':extra.hrs>=extra.expected*0.5?'var(--compass-amber)':'var(--compass-red)'};">${extra.hrs}h</div>
            <div style="font-family:var(--font-head);font-size:11px;color:#3A5C80">of ${extra.expected}h</div>
          </div>
        </div>`;
      })() : '';
      panel.innerHTML = `
        <div style="padding:12px 14px 10px;border-bottom:1px solid rgba(0,210,255,.1);background:#07101e;flex-shrink:0;display:flex;align-items:flex-start;justify-content:space-between">
          <div>
            <div style="font-family:var(--font-display);font-size:16px;font-weight:700;color:#F0F6FF">${title}</div>
            <div style="font-family:var(--font-head);font-size:11px;color:#4A6E90;margin-top:2px">${subtitle}</div>
          </div>
          <button onclick="document.getElementById('pm-brief-overlay')?.remove();document.getElementById('pm-brief-panel')?.remove()"
            style="background:none;border:none;color:#5A84A8;font-size:16px;cursor:pointer;padding:0"
            onmouseenter="this.style.color='#F0F6FF'" onmouseleave="this.style.color='#5A84A8'">✕</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:14px">
          ${arcHtml}
          <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;color:#EF9F27;text-transform:uppercase;margin-bottom:6px">AI NARRATIVE</div>
          <div style="background:rgba(239,159,39,.05);border:1px solid rgba(239,159,39,.18);border-left:3px solid #EF9F27;padding:10px 12px;font-family:var(--font-body);font-size:12px;color:#C8DFF0;line-height:1.6">${narrative}</div>
          <div style="margin-top:14px">
            <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.08em;color:#3A5C80;text-transform:uppercase;margin-bottom:5px">PM ANNOTATION</div>
            <textarea placeholder="Add context for this brief…"
              style="width:100%;font-family:var(--font-body);font-size:12px;padding:8px 10px;background:#0a1525;border:1px solid rgba(0,210,255,.15);color:#C8DFF0;outline:none;resize:none;box-sizing:border-box;line-height:1.5" rows="3"></textarea>
          </div>
        </div>`;
      document.body.appendChild(panel);
    }

    // ── Simulate live event ───────────────────────────────
    const _pmLiveEvents = [
      {color:'#E24B4A',proj:'Flexscope',text:'Margaret Mills — no time logged today',meta:'Compliance alert',isFlag:true},
      {color:'#EF9F27',proj:'Flexscope',text:'Design Review Signoff — step dwell 4h+',meta:'Approaching pessimistic estimate',isFlag:false},
      {color:'#1D9E75',proj:'NovaBio',text:'Sandra Okafor — Section 4.2 review complete',meta:'Phase milestone hit',isFlag:false},
      {color:'#E24B4A',proj:'Flexscope',text:'Build #1 now 6d overdue — escalation threshold',meta:'Auto-escalation triggered',isFlag:true},
      {color:'#EF9F27',proj:'Flexscope',text:'Resource request aging 72h — no response',meta:'Staffing escalation',isFlag:false},
    ];
    let _pmSimIdx = 0;
    window.pmSimulateLiveEvent = function() {
      const ev = _pmLiveEvents[_pmSimIdx % _pmLiveEvents.length]; _pmSimIdx++;
      const feed = document.getElementById('pm-live-feed');
      if (!feed) return;
      const row = document.createElement('div');
      row.className='pm-frow';
      row.style.background='rgba(0,210,255,.06)';
      row.innerHTML=`<div class="pm-fstrip" style="background:${ev.color}"></div>
        <div class="pm-ftag-col"><div class="pm-ftag" style="color:${ev.color}">${esc(ev.proj)}</div><div class="pm-ftag-inst">● live</div></div>
        <div class="pm-fbody" style="padding:6px 8px"><div class="pm-ftitle">${ev.text}</div><div class="pm-fsub" style="color:#4A6E90">${ev.meta}</div></div>
        <div class="pm-fage" style="padding:6px 10px 6px 0">just now</div>`;
      feed.insertBefore(row, feed.firstChild);
      setTimeout(()=>row.style.background='', 600);
      if (ev.isFlag) {
        compassToast(`⚑ New flag: ${ev.text.slice(0,50)}`, 3000);
      }
    };

    window.pmSwitchTab = function(el, panelId) {
      el.closest('.pm-left').querySelectorAll('.pm-tab').forEach(t=>t.classList.remove('on'));
      el.classList.add('on');
      el.closest('.pm-left').querySelectorAll('.pm-tabpanel').forEach(p=>p.classList.remove('on'));
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.add('on');
    };
    window.pmTeamFilter = function(btn, dept) {
      document.querySelectorAll('.pm-team-filter-btn').forEach(b => {
        const on = b.dataset.dept === dept;
        b.style.background = on ? '#132035' : '#0c1828';
        b.style.borderColor = on ? 'rgba(0,210,255,.4)' : 'rgba(0,210,255,.12)';
        b.style.color = on ? '#F0F6FF' : '#5A84A8';
      });
      document.querySelectorAll('.pm-team-group').forEach(g => {
        g.style.display = (dept==='all' || g.dataset.dept===dept) ? 'block' : 'none';
      });
    };

    // ── Drawer open / close ───────────────────────────────
    window.pmOpenDrawer = function(projId) {
      if (!projId) return;
      // Highlight selected card
      document.querySelectorAll('.pm-pcard').forEach(c => c.classList.toggle('open', c.dataset.projId===projId));
      document.getElementById('pm-drawer')?.remove();
      const ps = projStats.find(ps=>ps.p.id===projId);
      if (!ps) return;
      const {p,pct,doneTasks,totalTasks,overdueTasks,projInsts,projFlags,projReqs,projCoc,hoursByDay} = ps;
      const todayHrs = Object.values(hoursByDay).reduce((s,h)=>s+h,0);
      const projFeedEvents = cocEvents.filter(e=>projInsts.some(i=>i.id===e.instance_id)).slice(0,12);
      const pmName = _resources.find(r=>r.id===p.pm_resource_id);
      const bcolor = projStatusColor(ps);
      const slabel = projStatusLabel(ps);
      const drawer = document.createElement('div');
      drawer.id = 'pm-drawer';
      drawer.className = 'pm-drawer';
      const flagsHtml = projFlags.length>0 ? projFlags.map(f=>{
        const flagCoc = cocEvents.find(e=>e.instance_id===f.instance_id&&e.event_type==='step_reset'&&e.created_at===f.created_at);
        return `<div class="pm-rfcard">
          <div class="pm-rf-tag">■ RED SIGNAL · ${_timeAgo(f.created_at)}</div>
          <div class="pm-rf-who">${esc(f.actor_name||'Team member')} posted a red confidence signal on <strong>${esc(f.instTitle)}</strong></div>
          <div class="pm-rf-quote">"${esc(f.event_notes||'No note provided')}"</div>
          <div class="pm-rf-ctx">${esc(f.instTitle)} · ${f.count>1?f.count+'× rejections on this step':''}</div>
          <div style="display:flex;gap:6px">
            <button class="pm-btn pm-btn-red" style="flex:1">Acknowledge →</button>
            <button class="pm-btn pm-btn-cyan" style="flex:1" onclick="window.location.href='/cadence.html?instance=${f.instance_id}'">Open instance →</button>
          </div>
        </div>`;
      }).join('') : `<div style="padding:10px 11px;font-family:var(--font-head);font-size:12px;color:var(--text3)">No unacknowledged flags</div>`;
      // CoC-derived AI brief (pattern analysis)
      const rejCount = projCoc.filter(e=>e.event_type==='step_reset').length;
      const overdueCount = overdueTasks.length;
      const aiBriefHtml = `<div class="pm-aicard">
        <div class="pm-ai-lbl">■ REQUIRES ACTION</div>
        ${projFlags.length>0?`<div class="pm-ai-item">${esc(projFlags[0].instTitle)} — ${rejCount} rejection${rejCount!==1?'s':''} on this step${projFlags[0].event_notes?', "'+esc(projFlags[0].event_notes.slice(0,60))+'"':''}</div>`:''}
        ${projReqs.length>0?`<div class="pm-ai-item">${projReqs.length} resource request${projReqs.length>1?'s':''} aging — no response</div>`:''}
        ${projFlags.length===0&&projReqs.length===0?`<div class="pm-ai-item">No immediate actions required</div>`:''}
        ${overdueCount>0?`<div style="margin-top:6px"><div class="pm-ai-lbl">● TRENDING TO RISK</div><div class="pm-ai-item">${overdueCount} task${overdueCount!==1?'s':''} overdue — review assignments</div></div>`:''}
        <div style="margin-top:7px;padding-top:6px;border-top:1px solid rgba(239,159,39,.15);display:flex;justify-content:space-between;align-items:center">
          <span style="font-family:var(--font-head);font-size:11px;color:#5A84A8">AI morning brief</span>
          <button class="pm-btn pm-btn-cyan" style="padding:3px 10px;font-size:11px">Full brief →</button>
        </div>
      </div>`;
      // Brief archive (last 6 CoC days)
      const briefDays = (() => {
        const days = {};
        projCoc.forEach(e => { const d=e.created_at.slice(0,10); if(!days[d]) days[d]={date:d,flags:0,risk:0}; if(e.event_type==='step_reset') days[d].flags++; else if(e.event_type==='step_activated') days[d].risk++; });
        return Object.values(days).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
      })();
      const archiveHtml = briefDays.length>0 ? briefDays.map(b=>{
        const isToday=b.date===today;
        const dotColor=b.flags>0?'#E24B4A':b.risk>0?'#EF9F27':'#1D9E75';
        const label=b.flags>0?`<span style="color:#E24B4A">${b.flags} flag${b.flags>1?'s':''}</span>`:b.risk>0?`<span style="color:#EF9F27">${b.risk} activated</span>`:`<span style="color:#5A84A8">all clear</span>`;
        const dLabel=new Date(b.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',weekday:'short'});
        return `<div class="pm-brief-row">
          <span style="width:6px;height:6px;border-radius:50%;background:${dotColor};flex-shrink:0;margin-top:2px"></span>
          <div class="pm-bdate">${dLabel}${isToday?' · Today':''}</div>
          <div class="pm-bflag">${label}</div>
        </div>`;
      }).join('') : `<div style="padding:8px 11px;font-family:var(--font-head);font-size:12px;color:var(--text3)">No activity this week</div>`;
      drawer.innerHTML = `
        <div class="pm-drhdr">
          <div style="display:flex;align-items:flex-start;justify-content:space-between">
            <div>
              <div class="pm-drname">${esc(p.name)}</div>
              <div class="pm-drdesc">${esc(p.description||p.client||'—')} · Target: ${p.target_date?fmtDate(p.target_date):'—'}</div>
              <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
                ${slabel}
                <span class="pm-chip pm-chip-g">Active</span>
                <span style="display:flex;align-items:center;gap:4px;font-family:var(--font-data);font-size:11px;color:var(--compass-green)">
                  <span class="pm-live-dot"></span>Live
                </span>
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;margin-left:12px">
              <div style="font-family:var(--font-head);font-size:11px;color:#5A84A8">PM / Owner</div>
              <div style="font-family:var(--font-head);font-size:13px;font-weight:700;color:#F0F6FF">${pmName?esc(pmName.first_name+' '+pmName.last_name):'—'}</div>
              <div style="font-family:var(--font-data);font-size:11px;color:#5A84A8;margin-top:2px">${new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</div>
              <button onclick="document.getElementById('pm-drawer').remove();document.querySelectorAll('.pm-pcard').forEach(c=>c.classList.remove('open'))"
                style="background:none;border:none;color:#5A84A8;font-size:16px;cursor:pointer;margin-top:3px;padding:0;line-height:1"
                onmouseenter="this.style.color='#F0F6FF'" onmouseleave="this.style.color='#5A84A8'">✕</button>
            </div>
          </div>
        </div>
        <div class="pm-drstrip">
          <div class="pm-drc"><div class="pm-drc-lbl">Tasks</div><div class="pm-drc-val" style="color:var(--text0)"><span style="color:var(--compass-green)">${doneTasks}</span>/${totalTasks}</div><div class="pm-drc-sub">complete</div></div>
          <div class="pm-drc"><div class="pm-drc-lbl">Overdue</div><div class="pm-drc-val" style="color:${overdueTasks.length>0?'var(--compass-red)':'var(--text3)'}">${overdueTasks.length}</div><div class="pm-drc-sub">tasks</div></div>
          <div class="pm-drc"><div class="pm-drc-lbl">Workflows</div><div class="pm-drc-val" style="color:var(--compass-cyan)">${projInsts.length}</div><div class="pm-drc-sub">in progress</div></div>
          <div class="pm-drc"><div class="pm-drc-lbl">Red flags</div><div class="pm-drc-val" style="color:${projFlags.length>0?'var(--compass-red)':'var(--text3)'}">${projFlags.length}</div><div class="pm-drc-sub">unacknowledged</div></div>
          <div class="pm-drc"><div class="pm-drc-lbl">Hours today</div><div class="pm-drc-val" style="color:var(--compass-cyan)">${todayHrs.toFixed(1)}h</div><div class="pm-drc-sub">across team</div></div>
          <div class="pm-drc"><div class="pm-drc-lbl">Requests</div><div class="pm-drc-val" style="color:${projReqs.length>0?'var(--compass-amber)':'var(--text3)'}">${projReqs.length}</div><div class="pm-drc-sub">pending</div></div>
        </div>
        <div class="pm-drtabs">
          <div class="pm-drtab on">Overview</div>
          <div class="pm-drtab">People</div>
          <div class="pm-drtab">Timesheet</div>
          <div class="pm-drtab">Morning briefs</div>
          <div class="pm-drtab">Decision log</div>
        </div>
        <div class="pm-drbody">
          <div class="pm-drcol">
            <div class="pm-dcsec" style="color:${projFlags.length>0?'#E24B4A':'#5A84A8'}">
              RED FLAGS — PINNED
              ${projFlags.length>0?`<span style="background:rgba(226,75,74,.2);color:#E24B4A;padding:1px 6px;font-size:10px;font-weight:700;margin-left:4px">${projFlags.length} unacknowledged</span>`:''}
            </div>
            ${flagsHtml}
            <div class="pm-dcsec" style="color:#EF9F27;margin-top:4px">AI NARRATIVE · TODAY</div>
            ${aiBriefHtml}
          </div>
          <div class="pm-drcol">
            <div class="pm-dcsec">LIVE FEED <span class="pm-live-dot" style="margin-left:4px"></span></div>
            ${projFeedEvents.length>0
              ? projFeedEvents.map(e=>{
                  const isRej=e.event_type==='step_reset',isDone=e.event_type==='step_completed';
                  const c=isRej?'var(--compass-red)':isDone?'var(--compass-green)':'var(--compass-amber)';
                  return `<div class="pm-feed-row">
                    <span style="color:${c};font-size:12px;flex-shrink:0">${isRej?'↩':isDone?'✓':'●'}</span>
                    <div style="flex:1;min-width:0">
                      <div style="font-family:var(--font-body);font-size:11px;color:var(--text1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.step_name||'—')}${e.actor_name?' — '+esc(e.actor_name):''}</div>
                      ${e.event_notes&&isRej?`<div style="font-family:var(--font-head);font-size:11px;color:var(--compass-red);font-style:italic">"${esc(e.event_notes.slice(0,50))}"</div>`:''}
                    </div>
                    <div style="font-family:var(--font-data);font-size:11px;color:#5A84A8;flex-shrink:0">${_timeAgo(e.created_at)}</div>
                  </div>`;
                }).join('')
              : `<div style="padding:10px 11px;font-family:var(--font-head);font-size:12px;color:var(--text3)">No activity for this project</div>`}
            <div class="pm-dcsec" style="margin-top:4px">BRIEF ARCHIVE</div>
            ${archiveHtml}
          </div>
        </div>`;
      document.body.appendChild(drawer);
      // Close on outside click
      setTimeout(()=>{
        document.addEventListener('mousedown', function closeDr(ev){
          if(!drawer.contains(ev.target)&&!ev.target.closest('.pm-pcard')){
            drawer.remove();
            document.querySelectorAll('.pm-pcard').forEach(c=>c.classList.remove('open'));
            document.removeEventListener('mousedown',closeDr);
          }
        });
      },50);
    };

  } catch(e) {
    console.error('[Compass] loadPMView error:', e);
    content.innerHTML = '<div style="padding:20px;font-family:var(--font-head);font-size:11px;color:var(--compass-red)">Failed to load PM view — check console</div>';
  }
}