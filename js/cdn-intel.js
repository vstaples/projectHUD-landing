// cdn-intel.js — Cadence: intelligence briefing modal, AI narrative, PDF/email export
// LOAD ORDER: 14th

function showIntelBriefing(instId) {
  const inst  = _instances.find(i=>i.id===instId) || _selectedInstance;
  if (!inst) return;
  // If sibling instance hasn't had full data loaded yet, show loading modal then fetch
  if (!inst._stepInsts && inst.id !== _selectedInstance?.id) {
    // Show modal immediately with loading state
    _showBriefingLoadingModal(inst);
    const tmplId = inst.template_id;
    Promise.all([
      API.get(`workflow_step_instances?instance_id=eq.${inst.id}&order=created_at.asc,id.asc`).catch(()=>[]),
      inst._tmplSteps ? Promise.resolve(null) :
        API.get(`workflow_template_steps?template_id=eq.${tmplId}&order=sequence_order.asc`).catch(()=>[]),
      API.get(`step_comments?instance_id=eq.${inst.id}&is_deleted=eq.false`).catch(()=>[]),
      API.get(`workflow_action_items?instance_id=eq.${inst.id}`).catch(()=>[]),
    ]).then(([si, ts, sc, ai]) => {
      inst._stepInsts    = si || [];
      inst._stepComments = sc || [];
      inst._actionItems  = ai || [];
      if (ts) inst._tmplSteps = ts.map(s=>({...s,
        _attachedDocs: (s.attached_docs||[]).map(d=>({name:d.name,path:d.path||null,url:d.url||null})),
        _meetingAgenda: Array.isArray(s.meeting_agenda)?s.meeting_agenda:[],
      }));
      // Replace loading modal with full briefing
      document.getElementById('intel-briefing-overlay')?.remove();
      _showIntelBriefingModal(inst);
    }).catch(() => {
      document.getElementById('intel-briefing-overlay')?.remove();
      _showIntelBriefingModal(inst);
    });
    return;
  }
  _showIntelBriefingModal(inst);
}

function _showBriefingLoadingModal(inst) {
  const existing = document.getElementById('intel-briefing-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'intel-briefing-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)';
  overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div style="width:min(860px,92vw);background:var(--bg1);border:1px solid var(--border2);
      border-radius:8px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.6)">
      <div style="display:flex;align-items:center;gap:12px;padding:16px 20px;
        border-bottom:1px solid var(--border);background:var(--bg2)">
        <span style="font-size:16px">◎</span>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:600;color:var(--text)">${escHtml(inst.title||'Intelligence Briefing')}</div>
          <div style="font-size:11px;color:var(--muted)">Loading briefing data…</div>
        </div>
        <button onclick="document.getElementById('intel-briefing-overlay').remove()"
          style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:20px;padding:0 4px;line-height:1">×</button>
      </div>
      <div style="padding:40px;text-align:center;color:var(--muted);font-size:13px">
        <div style="font-size:24px;margin-bottom:12px;opacity:.5">◎</div>
        Fetching workflow data…
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function _showIntelBriefingModal(inst) {
  const tmpl  = _templates.find(t=>t.id===inst.template_id);
  const steps = (inst._tmplSteps||[]).filter(s=>s.step_type!=='trigger').sort((a,b)=>a.sequence_order-b.sequence_order);
  const coc   = (inst._stepInsts||[]).slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));

  // ── Derive state ──────────────────────────────────────────────────────────
  const latestEvt = {};
  coc.forEach(e=>{ if(e.template_step_id) latestEvt[e.template_step_id]=e; });
  const completedIds = new Set(Object.entries(latestEvt).filter(([,e])=>e.event_type==='step_completed').map(([id])=>id));
  const fmt = ts => ts ? new Date(ts).toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}) : '—';
  const fmtShort = ts => ts ? new Date(ts).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '—';
  const elapsed = ms => { const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000); return h>0?`${h}h ${m}m`:`${m}m`; };

  // Current active step
  const activeStep = steps.find(s=>{ const e=latestEvt[s.id]; return e?.event_type==='step_activated'; });
  const completedSteps = steps.filter(s=>completedIds.has(s.id));
  const remainingSteps = steps.filter(s=>{ const e=latestEvt[s.id]; return !e||e.event_type==='step_reset'; });

  // Rejection analysis
  const rejectionEvents = coc.filter(e=>{
    if(e.event_type!=='step_completed'||!e.template_step_id) return false;
    const step=steps.find(s=>s.id===e.template_step_id);
    if(!step) return false;
    const oDef=_getOutcomes(step).find(o=>o.id===e.outcome);
    return oDef?.requiresReset;
  });

  // Time calculations
  const launchedAt = inst.launched_at ? new Date(inst.launched_at) : null;
  const totalMs = launchedAt ? Date.now()-launchedAt : 0;

  // Time in rework (reset-to-reactivation gaps)
  let reworkMs = 0;
  steps.forEach(s=>{
    const resets = coc.filter(e=>e.event_type==='step_reset'&&e.template_step_id===s.id);
    const acts   = coc.filter(e=>e.event_type==='step_activated'&&e.template_step_id===s.id);
    resets.forEach(r=>{
      const next=acts.find(a=>new Date(a.created_at)>new Date(r.created_at));
      if(next) reworkMs += new Date(next.created_at)-new Date(r.created_at);
    });
  });
  const reworkPct = totalMs>0 ? Math.round(reworkMs/totalMs*100) : 0;

  // Per-step summaries
  const stepSummaries = steps.map(s=>{
    const evts   = coc.filter(e=>e.template_step_id===s.id);
    const firstAct = evts.find(e=>e.event_type==='step_activated');
    const lastComp = [...evts].reverse().find(e=>e.event_type==='step_completed');
    const resets = evts.filter(e=>e.event_type==='step_reset').length;
    const notes  = coc.filter(e=>e.template_step_id===s.id&&(e.event_notes||e.notes));
    const state  = !evts.length ? 'pending'
      : latestEvt[s.id]?.event_type==='step_completed' ? 'complete'
      : latestEvt[s.id]?.event_type==='step_activated' ? 'active' : 'reset';
    const durationMs = firstAct&&lastComp ? new Date(lastComp.created_at)-new Date(firstAct.created_at) : null;
    return { step:s, state, firstAct, lastComp, resets, notes, durationMs };
  });

  // Build all timestamped note events across the entire workflow
  // Only include HUMAN notes — exclude automated system events:
  // - step_reset events (always system-generated "Reset by X" messages)
  // - instance_launched events (system boilerplate)
  // - Any note starting with "Reset by" or "Launched from template" or "Meeting created"
  const isSystemNote = e => {
    if (e.event_type === 'step_reset') return true;
    if (e.event_type === 'instance_launched') return true;
    if (e.event_type === 'meeting_created') return true;
    const txt = (e.event_notes||e.notes||'').trim();
    if (txt.startsWith('Reset by ')) return true;
    if (txt.startsWith('Launched from template')) return true;
    if (txt.startsWith('Meeting created')) return true;
    return false;
  };

  const noteEvents = coc.filter(e=>(e.event_notes||e.notes) && !isSystemNote(e)).map(e=>{
    const step = steps.find(s=>s.id===e.template_step_id);
    const oDef = step ? _getOutcomes(step).find(o=>o.id===e.outcome) : null;
    const isRejection = oDef?.requiresReset;
    const actor = (e.actor_name&&e.actor_name!=='System') ? e.actor_name
      : (step?.assignee_name||step?.assignee_email||'Team Member');
    return { ts:e.created_at, actor, note:e.event_notes||e.notes, step, isRejection,
      evtType:e.event_type, outcome:e.outcome };
  }).sort((a,b)=>new Date(a.ts)-new Date(b.ts));

  // ── Build HTML ────────────────────────────────────────────────────────────
  const statusColor = { in_progress:'var(--cad)', complete:'var(--green)', cancelled:'var(--red)', pending:'var(--muted)' };
  const stCol = statusColor[inst.status]||'var(--muted)';

  const overlay = document.createElement('div');
  overlay.id = 'intel-briefing-overlay';
  overlay.style.cssText = `position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.7);
    display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)`;
  overlay.onclick = e=>{ if(e.target===overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div style="width:min(860px,92vw);max-height:88vh;background:var(--bg1);border:1px solid var(--border2);
      border-radius:8px;display:flex;flex-direction:column;overflow:hidden;
      box-shadow:0 24px 64px rgba(0,0,0,.6);min-height:0">

      <!-- Modal header -->
      <div style="display:flex;align-items:center;gap:12px;padding:16px 20px;
        border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg2)">
        <span style="font-size:16px">◎</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:600;color:var(--text)">Intelligence Briefing</div>
          <div style="font-size:11px;color:var(--muted)">${escHtml(inst.title||tmpl?.name||'Untitled')} · Generated ${fmtShort(new Date().toISOString())}</div>
        </div>
        <span style="font-size:9px;font-weight:700;letter-spacing:.1em;padding:3px 8px;
          border:1px solid ${stCol};color:${stCol};border-radius:3px">
          ${(inst.status||'').replace('_',' ').toUpperCase()}
        </span>
        <button onclick="document.getElementById('intel-briefing-overlay').remove()"
          style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:20px;
            padding:0 4px;line-height:1;flex-shrink:0">×</button>
      </div>

      ${/* Stakes banner — shown when priority or stakes are set */ (inst.priority&&inst.priority!=='routine')||inst.stakes ? `
      <div style="padding:10px 20px;flex-shrink:0;
        background:${inst.priority==='critical'?'rgba(226,75,74,.1)':inst.priority==='important'?'rgba(232,168,56,.08)':'var(--surf2)'};
        border-bottom:1px solid ${inst.priority==='critical'?'rgba(226,75,74,.3)':inst.priority==='important'?'rgba(232,168,56,.3)':'var(--border)'};
        display:flex;align-items:center;gap:10px">
        <span style="font-size:18px">${{critical:'🔴',important:'🟡',routine:'⚪'}[inst.priority||'routine']}</span>
        <div>
          <span style="font-size:12px;font-weight:700;
            color:${inst.priority==='critical'?'var(--red)':inst.priority==='important'?'var(--amber)':'var(--text2)'};
            text-transform:uppercase;letter-spacing:.06em">
            ${(inst.priority||'routine').toUpperCase()} PRIORITY
          </span>
          ${inst.stakes?`<span style="font-size:13px;color:var(--text);margin-left:10px;font-weight:500">${escHtml(inst.stakes)}</span>`:''}
          ${inst.pert_likely||inst.pert_pessimistic?`
          <span style="font-size:11px;color:var(--muted);margin-left:12px">
            Expected: ${(((inst.pert_optimistic||0)+4*(inst.pert_likely||0)+(inst.pert_pessimistic||0))/6).toFixed(1)}d
            ${_instPertVariance(inst)>10?'<span style="color:var(--red);font-weight:600"> · ⚠ High variance</span>':''}
          </span>`:''}
        </div>
      </div>` : ''}

      <!-- ── AI Narrative section — collapsible ───────────────────────────── -->
      <div id="briefing-ai-section" style="flex-shrink:0;border-bottom:1px solid var(--border)">

        <!-- Toggle header — always visible -->
        <div onclick="_toggleAINarrative()"
          style="padding:12px 20px;display:flex;align-items:center;gap:10px;
            cursor:pointer;user-select:none"
          onmouseenter="this.style.background='var(--surf2)'"
          onmouseleave="this.style.background='transparent'">
          <span id="briefing-ai-chevron"
            style="font-size:10px;color:#FFD700;transition:transform .2s;display:inline-block">
            &#9654;
          </span>
          <span style="font-size:13px;font-weight:700;letter-spacing:.12em;
            color:#FFD700;text-transform:uppercase">&#10022; AI Narrative</span>
          ${inst.briefing_generated_at ? `
          <span style="font-size:11px;color:var(--muted)">
            Generated ${new Date(inst.briefing_generated_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
          </span>` : `
          <span style="font-size:11px;color:var(--muted);font-style:italic">
            AI-generated situation analysis &amp; recommended action
          </span>`}
          ${inst.briefing_narrative ? `
          <button onclick="event.stopPropagation();_regenerateAIBriefing('${inst.id}')"
            style="margin-left:auto;font-size:10px;color:var(--muted);background:none;
              border:1px solid var(--border);border-radius:3px;padding:3px 10px;cursor:pointer"
            onmouseenter="this.style.borderColor='var(--cad)';this.style.color='var(--cad)'"
            onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">
            &#8635; Regenerate
          </button>` : `
          <button onclick="event.stopPropagation();_generateAIBriefing('${inst.id}')"
            style="margin-left:auto;font-size:10px;font-weight:600;padding:4px 14px;
              background:var(--cad);color:var(--bg0);border:none;
              border-radius:4px;cursor:pointer;letter-spacing:.04em">
            &#9654; Generate
          </button>`}
        </div>

        <!-- Collapsible body — collapsed by default -->
        <div id="briefing-ai-body" style="display:none;overflow-y:auto;max-height:40vh;
          padding:0 20px 16px">
          <div id="briefing-ai-narrative"
            style="font-size:13px;color:var(--text);line-height:1.7;font-family:var(--font-body)">
            ${inst.briefing_narrative ? _formatBriefingNarrative(inst.briefing_narrative) : ''}
          </div>
        </div>
      </div>

      <!-- Modal body -->
      <div style="flex:1;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:20px">

        <!-- ① Situation summary -->
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:.12em;color:#FFD700;
            text-transform:uppercase;margin-bottom:10px">Current Status</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
            ${[
              ['Elapsed Time', totalMs>0?elapsed(totalMs):'—', 'var(--cad)'],
              ['Steps Complete', `${completedSteps.length} of ${steps.length}`, 'var(--green)'],
              ['Rejections', `${rejectionEvents.length}×`, rejectionEvents.length?'var(--red)':'var(--muted)'],
              ['Time in Rework', reworkMs>0?`${elapsed(reworkMs)} (${reworkPct}%)`:'None', reworkMs>0?'var(--red)':'var(--green)'],
            ].map(([lbl,val,col])=>`
            <div style="background:var(--bg2);border:1px solid var(--border);border-radius:5px;padding:10px 12px">
              <div style="font-size:10px;color:var(--muted);margin-bottom:3px">${lbl}</div>
              <div style="font-size:16px;font-weight:700;color:${col}">${val}</div>
            </div>`).join('')}
          </div>
          ${activeStep ? `
          <div style="margin-top:10px;padding:10px 14px;background:rgba(232,168,56,.08);
            border:1px solid rgba(232,168,56,.3);border-radius:5px;
            display:flex;align-items:center;gap:10px">
            <div style="width:8px;height:8px;border-radius:50%;background:#e8a838;flex-shrink:0"></div>
            <div>
              <span style="font-size:12px;font-weight:600;color:#e8a838">Currently active: </span>
              <span style="font-size:12px;color:var(--text)">${escHtml(activeStep.name||'—')}</span>
              <span style="font-size:11px;color:var(--muted);margin-left:8px">
                Assigned to ${escHtml(activeStep.assignee_name||activeStep.assignee_email||'—')}
                ${latestEvt[activeStep.id]?.created_at ? ' · Active since '+fmtShort(latestEvt[activeStep.id].created_at) : ''}
              </span>
            </div>
          </div>` : ''}
        </div>

        <!-- ② Step-by-step timeline -->
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:.12em;color:#FFD700;
            text-transform:uppercase;margin-bottom:10px">Workflow Timeline</div>
          <div style="display:flex;flex-direction:column;gap:0">
            ${stepSummaries.map(({step,state,firstAct,lastComp,resets,durationMs},si)=>{
              const stateCol = state==='complete'?'#1D9E75':state==='active'?'#e8a838':state==='reset'?'#E24B4A':'rgba(255,255,255,.2)';
              const stateIcon = state==='complete'?'✓':state==='active'?'●':state==='reset'?'✕':'○';
              const bg = state==='active'?'rgba(232,168,56,.06)':state==='complete'?'rgba(29,158,117,.04)':'transparent';
              return `
              <div style="display:flex;gap:14px;padding:10px 0;
                ${si<stepSummaries.length-1?'border-bottom:1px solid var(--border)':''}">
                <!-- Step indicator -->
                <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:24px">
                  <div style="width:20px;height:20px;border-radius:50%;border:1.5px solid ${stateCol};
                    background:${stateCol}22;display:flex;align-items:center;justify-content:center;
                    font-size:9px;color:${stateCol};font-weight:700">${stateIcon}</div>
                  ${si<stepSummaries.length-1?`<div style="width:1px;flex:1;background:var(--border);margin-top:4px;min-height:12px"></div>`:''}
                </div>
                <!-- Step detail -->
                <div style="flex:1;min-width:0;background:${bg};border-radius:4px;padding:2px 8px">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <span style="font-size:12px;font-weight:600;color:var(--text)">${escHtml(step.name||'Step')}</span>
                    <span style="font-size:10px;color:var(--muted)">${escHtml(STEP_META[step.step_type]?.label||step.step_type)}</span>
                    ${resets?`<span style="font-size:10px;color:var(--red);font-weight:600">↩ ${resets}× rework</span>`:''}
                    ${durationMs!==null?`<span style="font-size:10px;color:var(--muted);margin-left:auto">${elapsed(durationMs)}</span>`:''}
                  </div>
                  ${firstAct?`<div style="font-size:10px;color:var(--muted);margin-top:2px">
                    Activated: ${fmt(firstAct.created_at)}
                    ${lastComp?` · Completed: ${fmt(lastComp.created_at)}`:''}
                  </div>`:''}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- ③ Human narrative — all notes in chronological order -->
        <div>
          <!-- Collapsible header — matches AI Narrative style -->
          <div onclick="_toggleBriefingSection('briefing-notes-body','briefing-notes-chev')"
            style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer"
            onmouseenter="this.style.opacity='.8'"
            onmouseleave="this.style.opacity='1'">
            <span id="briefing-notes-chev"
              style="font-size:10px;color:#FFD700;transition:transform .2s;display:inline-block">
              &#9654;
            </span>
            <span style="font-size:11px;font-weight:700;letter-spacing:.12em;
              color:#FFD700;text-transform:uppercase">Notes &amp; Comments</span>
            <span style="font-weight:400;color:var(--muted);font-size:11px;margin-left:4px">
              ${noteEvents.length} recorded
            </span>
          </div>
          <!-- Collapsible body — collapsed by default -->
          <div id="briefing-notes-body" style="display:none">
          ${!noteEvents.length
            ? `<div style="color:var(--muted);font-size:12px;font-style:italic;padding:4px 0">
                No notes were recorded during this workflow.
               </div>`
            : `<div style="display:flex;flex-direction:column;gap:10px">
              ${noteEvents.map(ev=>`
              <div style="display:flex;gap:12px">
                <div style="flex-shrink:0;padding-top:2px">
                  <div style="width:8px;height:8px;border-radius:50%;
                    background:${ev.isRejection?'#E24B4A':'#1D9E75'};margin-top:3px"></div>
                </div>
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
                    <span style="font-size:11px;font-weight:600;
                      color:${ev.isRejection?'var(--red)':'var(--green)'};white-space:nowrap">
                      ${ev.isRejection?'↩ Rejected':'✓ Completed'}
                    </span>
                    ${ev.step?`<span style="font-size:11px;color:var(--text2)">${escHtml(ev.step.name||'')}</span>`:''}
                    ${ev.outcome?`<span style="font-size:10px;color:var(--muted)">· ${escHtml(ev.outcome)}</span>`:''}
                    <span style="font-size:10px;color:var(--muted);margin-left:auto;white-space:nowrap">
                      👤 ${escHtml(ev.actor)} · ${fmt(ev.ts)}
                    </span>
                  </div>
                  <div style="padding:8px 12px;background:${ev.isRejection?'rgba(226,75,74,.07)':'var(--surf2)'};
                    border-left:3px solid ${ev.isRejection?'#E24B4A':'#1D9E75'};
                    border-radius:0 4px 4px 0;font-size:12px;color:var(--text);line-height:1.6">
                    ${escHtml(ev.note)}
                  </div>
                </div>
              </div>`).join('')}
            </div>`}
          </div>
        </div>

        <!-- ④ What's next -->
        ${remainingSteps.length ? `
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:.12em;color:#FFD700;
            text-transform:uppercase;margin-bottom:10px">Remaining Steps</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${remainingSteps.map((s,i)=>`
            <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;
              background:var(--bg2);border-radius:4px;border:1px solid var(--border)">
              <span style="font-size:11px;color:var(--muted);font-family:var(--font-mono);
                min-width:18px">${s.sequence_order}</span>
              <span style="font-size:12px;color:var(--text2)">${escHtml(s.name||'—')}</span>
              <span style="font-size:10px;color:var(--muted);margin-left:auto">
                ${escHtml(s.assignee_name||s.assignee_email||'—')}
              </span>
              ${s.due_days?`<span style="font-size:10px;color:var(--amber)">+${s.due_days}d</span>`:''}
            </div>`).join('')}
          </div>
        </div>` : `
        <div style="padding:12px 14px;background:rgba(29,158,117,.08);border:1px solid rgba(29,158,117,.3);
          border-radius:5px;font-size:12px;color:var(--green);font-weight:600">
          ✓ All steps complete — workflow finished
        </div>`}

      </div>

      <!-- Footer -->
      <div style="padding:12px 20px;border-top:1px solid var(--border);flex-shrink:0;
        background:var(--bg2);display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:10px;color:var(--muted)">
          Instance ${inst.id.substring(0,8)}… · Template: ${escHtml(tmpl?.name||'—')}
          · Launched by ${escHtml(_users_cad.find(u=>u.id===inst.launched_by)?.name||'—')}
          · ${fmt(inst.launched_at)}
        </span>
        <div style="display:flex;gap:8px">
          <button onclick="_briefingEmail('${inst.id}')"
            style="padding:5px 14px;font-size:11px;font-weight:600;background:none;
              border:1px solid var(--border2);border-radius:3px;color:var(--text2);cursor:pointer">
            ✉ Email PM
          </button>
          <button onclick="_briefingPDF('${inst.id}')"
            style="padding:5px 14px;font-size:11px;font-weight:600;background:none;
              border:1px solid var(--border2);border-radius:3px;color:var(--text2);cursor:pointer">
            ⬇ Save PDF
          </button>
          <button onclick="document.getElementById('intel-briefing-overlay').remove()"
            style="padding:5px 16px;font-size:11px;font-weight:600;background:var(--cad);
              border:none;border-radius:3px;color:var(--bg0);cursor:pointer">Close</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
}

function _briefingPDF(instId) {
  const overlay = document.getElementById('intel-briefing-overlay');
  if (!overlay) return;
  const printWin = window.open('', '_blank', 'width=900,height=700');
  const inst  = _instances.find(i=>i.id===instId) || _selectedInstance;
  const tmpl  = _templates.find(t=>t.id===inst?.template_id);
  const fmt   = ts => ts ? new Date(ts).toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}) : '—';

  // Clone the modal body content as clean print HTML
  const modal = overlay.querySelector('[style*="min(860px"]');
  const bodyEl = modal?.querySelector('[style*="overflow-y:auto"]');
  const bodyHTML = bodyEl ? bodyEl.innerHTML : '';

  printWin.document.write(`<!DOCTYPE html><html><head>
    <title>Intelligence Briefing — ${escHtml(inst?.title||tmpl?.name||'Instance')}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;color:#111;background:#fff;padding:32px;max-width:800px;margin:0 auto}
      h1{font-size:18px;font-weight:700;margin-bottom:6px}
      .subtitle{font-size:11px;color:#666;margin-bottom:24px;padding-bottom:12px;border-bottom:2px solid #111}
      /* strip all inline styles — let print CSS take over */
      [style]{all:revert}
      /* re-apply essentials */
      div{display:block}
      .stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}
      .stat-box{border:1px solid #ddd;border-radius:4px;padding:8px 10px}
      .stat-lbl{font-size:10px;color:#888;margin-bottom:2px;text-transform:uppercase;letter-spacing:.06em}
      .stat-val{font-size:15px;font-weight:700}
      .section-title{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#444;margin:20px 0 8px;padding-bottom:4px;border-bottom:1px solid #ddd}
      .timeline-row{padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:11px}
      .note-card{margin-bottom:12px;padding:8px 12px;border-left:3px solid #1D9E75;background:#f6fdf9;border-radius:0 4px 4px 0}
      .note-card.rejection{border-left-color:#E24B4A;background:#fff5f5}
      .note-header{font-size:10px;color:#666;margin-bottom:4px}
      .note-body{font-size:12px;line-height:1.6;color:#111}
      .remaining-row{padding:6px 8px;border:1px solid #eee;border-radius:3px;margin-bottom:4px;font-size:11px}
      @media print{body{padding:16px}@page{margin:16mm}}
    </style>
  </head><body>
    <h1>Intelligence Briefing</h1>
    <div class="subtitle">
      ${escHtml(inst?.title||tmpl?.name||'Workflow Instance')} &nbsp;·&nbsp;
      Generated ${fmt(new Date().toISOString())} &nbsp;·&nbsp;
      Status: ${(inst?.status||'').replace('_',' ').toUpperCase()}
    </div>
    ${bodyHTML}
    <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`);
  printWin.document.close();
}

function _briefingEmail(instId) {
  const inst  = _instances.find(i=>i.id===instId) || _selectedInstance;
  if (!inst) return;
  const tmpl  = _templates.find(t=>t.id===inst.template_id);
  const steps = (inst._tmplSteps||[]).filter(s=>s.step_type!=='trigger').sort((a,b)=>a.sequence_order-b.sequence_order);
  const coc   = (inst._stepInsts||[]).slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  const fmt   = ts => ts ? new Date(ts).toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}) : '—';
  const elapsed = ms => { const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000); return h>0?`${h}h ${m}m`:`${m}m`; };

  const isSystemNote = e => {
    if (['step_reset','instance_launched','meeting_created'].includes(e.event_type)) return true;
    const txt = (e.event_notes||e.notes||'').trim();
    return txt.startsWith('Reset by ') || txt.startsWith('Launched from template') || txt.startsWith('Meeting created');
  };

  const rejections = coc.filter(e=>{
    if(e.event_type!=='step_completed') return false;
    const step=steps.find(s=>s.id===e.template_step_id);
    return step ? _getOutcomes(step).find(o=>o.id===e.outcome)?.requiresReset : false;
  }).length;

  const humanNotes = coc.filter(e=>(e.event_notes||e.notes)&&!isSystemNote(e));
  const totalMs = inst.launched_at ? Date.now()-new Date(inst.launched_at) : 0;

  let body = `INTELLIGENCE BRIEFING\n${'='.repeat(50)}\n`;
  body += `${inst.title||tmpl?.name||'Workflow Instance'}\n`;
  body += `Generated: ${fmt(new Date().toISOString())}\n`;
  body += `Status: ${(inst.status||'').replace('_',' ').toUpperCase()}  |  `;
  body += `Elapsed: ${totalMs>0?elapsed(totalMs):'—'}  |  Rejections: ${rejections}×\n\n`;

  if (humanNotes.length) {
    body += `NOTES & COMMENTS (${humanNotes.length} recorded)\n${'-'.repeat(50)}\n\n`;
    humanNotes.forEach(e => {
      const step  = steps.find(s=>s.id===e.template_step_id);
      const actor = (e.actor_name&&e.actor_name!=='System') ? e.actor_name : (step?.assignee_name||'Team Member');
      const oDef  = step ? _getOutcomes(step).find(o=>o.id===e.outcome) : null;
      const type  = oDef?.requiresReset ? '[ REJECTED ]' : '[ COMPLETED ]';
      body += `${type} ${step?.name||''}\n`;
      body += `${actor}  ·  ${fmt(e.created_at)}\n`;
      body += `  "${(e.event_notes||e.notes||'').trim()}"\n\n`;
    });
  } else {
    body += `No human notes were recorded during this workflow.\n\n`;
  }

  body += `${'='.repeat(50)}\nProjectHUD · CadenceHUD Workflow Engine\n`;

  const subject = encodeURIComponent(`[Briefing] ${inst.title||tmpl?.name||'Workflow'} — ${rejections} rejection${rejections!==1?'s':''}`);
  window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(body)}`;
}

function _toggleBriefingSection(bodyId, chevId) {
  const body  = document.getElementById(bodyId);
  const chev  = document.getElementById(chevId);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chev) chev.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
}

function _toggleAINarrative() {
  const body    = document.getElementById('briefing-ai-body');
  const chevron = document.getElementById('briefing-ai-chevron');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display    = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
}

function _formatBriefingNarrative(text) {
  if (!text) return '';
  const sectionStyle = 'font-size:11px;font-weight:700;letter-spacing:.12em;' +
    'color:#FFD700;text-transform:uppercase;margin:14px 0 6px;display:block;' +
    'padding-left:0';
  const bulletStyle = 'margin:4px 0;padding-left:14px;text-indent:-14px;' +
    'font-size:13px;color:var(--text);line-height:1.7';

  const lines = text.split('\n');
  let html = '';
  const sectionLabels = ['SITUATION', 'REWORK ANALYSIS', 'RISK ASSESSMENT', 'RECOMMENDED ACTION'];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Section label
    if (sectionLabels.some(s => trimmed.toUpperCase().startsWith(s))) {
      const label = sectionLabels.find(s => trimmed.toUpperCase().startsWith(s));
      if (i > 0) html += '<div style="height:4px"></div>';
      html += `<span style="${sectionStyle}">${label}</span>`;
      return;
    }

    // Bullet line
    if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
      const bulletText = trimmed.replace(/^[-•]\s*/, '');
      html += `<div style="${bulletStyle}">– ${escHtml(bulletText)}</div>`;
      return;
    }

    // Plain text fallback
    html += `<div style="font-size:13px;color:var(--text);line-height:1.7;margin:4px 0">${escHtml(trimmed)}</div>`;
  });

  return html;
}

function _assembleBriefingPrompt(inst) {
  const tmpl   = _templates.find(t => t.id === inst.template_id);
  const steps  = (inst._tmplSteps  || []).filter(s => s.step_type !== 'trigger')
                  .sort((a,b) => a.sequence_order - b.sequence_order);
  const coc    = (inst._stepInsts  || []).slice().sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  const comments = (inst._stepComments || []).filter(c => !c.is_deleted)
                    .sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  const actions  = (inst._actionItems  || []);

  const latestEvt = {};
  coc.forEach(e => { if (e.template_step_id) latestEvt[e.template_step_id] = e; });
  const activeStep = steps.find(s => latestEvt[s.id]?.event_type === 'step_activated');

  // Elapsed
  const launchedMs = inst.launched_at ? new Date(inst.launched_at) : null;
  const elapsedMs  = launchedMs ? Date.now() - launchedMs : 0;
  const elapsedStr = elapsedMs > 0
    ? `${Math.floor(elapsedMs/86400000)}d ${Math.floor((elapsedMs%86400000)/3600000)}h`
    : 'unknown';

  // PERT
  const pert = (inst.pert_optimistic || inst.pert_likely || inst.pert_pessimistic)
    ? `Optimistic: ${inst.pert_optimistic||'?'}d  Likely: ${inst.pert_likely||'?'}d  Pessimistic: ${inst.pert_pessimistic||'?'}d`
    : 'Not estimated';

  // Rework per step
  const reworkByStep = {};
  coc.forEach(e => {
    if (e.event_type === 'step_reset' && e.template_step_id)
      reworkByStep[e.template_step_id] = (reworkByStep[e.template_step_id] || 0) + 1;
    if (e.event_type === 'step_completed' && e.outcome && e.template_step_id) {
      const step = steps.find(s => s.id === e.template_step_id);
      const oDef = step ? _getOutcomes(step).find(o => o.id === e.outcome) : null;
      if (oDef?.requiresReset)
        reworkByStep[e.template_step_id] = (reworkByStep[e.template_step_id] || 0) + 1;
    }
  });

  const reworkLines = steps
    .filter(s => reworkByStep[s.id])
    .map(s => {
      const lastRej = coc.slice().reverse().find(e =>
        e.event_type === 'step_completed' && e.template_step_id === s.id && e.event_notes);
      return `  - ${s.name||s.step_type}: ${reworkByStep[s.id]}x rework${lastRej?.event_notes ? `\n    Last rejection note: "${lastRej.event_notes.slice(0,120)}"` : ''}`;
    }).join('\n') || '  None';

  // Confidence trajectory
  const confLines = steps.map(s => {
    const sc = comments.filter(c => c.template_step_id === s.id && c.confidence);
    if (!sc.length) return null;
    const traj = sc.map(c => c.confidence === 'green' ? 'G' : c.confidence === 'yellow' ? 'Y' : 'R').join('→');
    const last = sc[sc.length - 1];
    return `  - ${s.name||s.step_type}: ${traj}\n    Last signal: "${last.body?.slice(0,100)||''}" [${last.confidence}]`;
  }).filter(Boolean).join('\n') || '  No confidence signals recorded';

  // Hours actuals
  const hoursLines = steps.map(s => {
    const hc = comments.filter(c => c.template_step_id === s.id && c.hours_logged > 0);
    if (!hc.length) return null;
    const total = hc.reduce((sum, c) => sum + (c.hours_logged || 0), 0);
    // Detect degrading confidence = discovery work
    const hasRed  = hc.some(c => c.confidence === 'red');
    const pattern = hasRed ? 'discovery (degrading confidence)' : 'execution';
    return `  - ${s.name||s.step_type}: ${total.toFixed(1)}h across ${hc.length} entries — pattern: ${pattern}`;
  }).filter(Boolean).join('\n') || '  No hours logged';

  // Open action items
  const openItems = actions.filter(a => a.status === 'open' || a.status === 'in_progress');
  const actionLines = openItems.map(a => {
    const step = steps.find(s => s.id === a.template_step_id);
    const created = a.created_at ? new Date(a.created_at) : null;
    const daysOpen = created ? Math.floor((Date.now() - created) / 86400000) : '?';
    return `  - "${a.title}" — Owner: ${a.owner_name||'Unassigned'}, Age: ${daysOpen}d, Step: ${step?.name||'?'}\n    Instructions: ${(a.instructions||'').slice(0,100)}`;
  }).join('\n') || '  None';

  // Human rejection notes
  const noteLines = coc
    .filter(e => e.event_type === 'step_completed' && e.event_notes)
    .slice(-12)
    .map(e => {
      const step = steps.find(s => s.id === e.template_step_id);
      const ts   = e.created_at ? new Date(e.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '';
      return `  [${ts}] ${e.actor_name||'Unknown'} on ${step?.name||'?'}:\n  "${e.event_notes.slice(0,150)}"`;
    }).join('\n') || '  No notes recorded';

  // Step comments (non-confidence)
  const commentLines = comments
    .filter(c => c.body && !c.parent_comment_id)
    .slice(-10)
    .map(c => {
      const step = steps.find(s => s.id === c.template_step_id);
      const ts   = c.created_at ? new Date(c.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '';
      const conf = c.confidence ? ` [${c.confidence.toUpperCase()}]` : '';
      const hrs  = c.hours_logged ? ` — ${c.hours_logged}h logged` : '';
      return `  [${ts}] ${c.author_name||'Unknown'} on ${step?.name||'?'}${conf}${hrs}:\n  "${c.body.slice(0,120)}"`;
    }).join('\n') || '  None';

  const stakesTone = {
    critical:  'CRITICAL — Use urgent register. Escalation is assumed if action is not taken.',
    important: 'HIGH — Alert register. Clear recommendations. Time-sensitivity noted.',
    routine:   'ROUTINE — Calm efficiency register. Observations rather than warnings.',
  }[inst.priority] || 'NORMAL — Professional register. Measured recommendations.';

  return `You are a project intelligence analyst embedded in a workflow management system.
Analyze this workflow instance and produce a concise professional briefing.

WORKFLOW: ${escHtml(tmpl?.name || inst.title || 'Untitled')}
STATUS: ${inst.status || 'unknown'} — ${activeStep ? `"${activeStep.name}" active` : 'no active step'}
STEPS: ${steps.filter(s => latestEvt[s.id]?.event_type === 'step_completed').length} of ${steps.length} complete
PRIORITY / STAKES TONE: ${stakesTone}
ELAPSED: ${elapsedStr}
PERT ESTIMATE: ${pert}

REWORK ANALYSIS:
${reworkLines}

CONFIDENCE TRAJECTORY (pre-rejection signals):
${confLines}

HOURS ACTUALS:
${hoursLines}

OPEN ACTION ITEMS (${openItems.length} total):
${actionLines}

HUMAN REJECTION NOTES (most recent first):
${noteLines}

STEP COMMENTS:
${commentLines}

OUTPUT FORMAT — follow exactly, no deviation:

SITUATION
- [bullet]
- [bullet]

REWORK ANALYSIS
- [bullet]
- [bullet]

RISK
- [bullet]

RECOMMENDED ACTION
- [bullet]

RULES — violations will be penalised:
1. Each bullet is 12 words or fewer. Count the words. Cut ruthlessly.
2. Start with the conclusion. Never start with context or background. Bad: "This workflow has been running for 14 days and has encountered..." Good: "Design Review is the rework bottleneck — 3 of 4 rejections trace here."
3. Do NOT restate metrics visible on screen: step count, elapsed time, PERT numbers, status. The reader already sees those. Only add what they cannot see.
4. REWORK ANALYSIS must state a classification on its first bullet: exactly one of — Process Quality Failure / Dependency Failure / Human Performance Issue / Novel Work. No other classifications.
5. RISK: 1 bullet only. The single most credible risk right now.
6. RECOMMENDED ACTION: 1 bullet only. One specific action. Include owner and deadline if known.
7. No bold, no markdown, no sub-bullets. Dashes only. Section labels in ALL CAPS with no colon.
8. No preamble. Output starts with SITUATION on the first line. Nothing before it.

Tone: ${stakesTone.split(' — ')[1] || 'Professional'}`;
}

async function _generateAIBriefing(instId) {
  const inst = _instances.find(i => i.id === instId) || _selectedInstance;
  if (!inst) return;

  const section = document.getElementById('briefing-ai-section');
  if (!section) return;

  // Expand the body and show generating state
  const body    = document.getElementById('briefing-ai-body');
  const chevron = document.getElementById('briefing-ai-chevron');
  if (body) {
    body.style.display = 'block';
    body.innerHTML = `<div id="briefing-ai-narrative"
      style="font-size:13px;color:var(--text);line-height:1.7;font-family:var(--font-body);min-height:48px">
      <span style="color:var(--muted);font-style:italic;font-size:12px">Generating…</span>
      <span class="briefing-cursor" style="display:inline-block;width:2px;height:14px;
        background:var(--cad);animation:briefingBlink 1s infinite;vertical-align:text-bottom"></span>
    </div>`;
  }
  if (chevron) chevron.style.transform = 'rotate(90deg)';

  // Add blink keyframes if not already present
  if (!document.getElementById('briefing-blink-style')) {
    const style = document.createElement('style');
    style.id = 'briefing-blink-style';
    style.textContent = '@keyframes briefingBlink{0%,100%{opacity:1}50%{opacity:0}}';
    document.head.appendChild(style);
  }

  const narrativeEl = document.getElementById('briefing-ai-narrative');
  const prompt = _assembleBriefingPrompt(inst);
  let full = '';

  try {
    const response = await fetch('/api/ai-briefing', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'content_block_delta' && data.delta?.text) {
            full += data.delta.text;
            narrativeEl.innerHTML = _formatBriefingNarrative(full) +
              '<span class="briefing-cursor" style="display:inline-block;width:2px;height:14px;' +
              'background:var(--cad);animation:briefingBlink 1s infinite;vertical-align:text-bottom"></span>';
          }
        } catch(e) {}
      }
    }

    // Final render — no cursor
    narrativeEl.innerHTML = _formatBriefingNarrative(full);

    // Update body with formatted narrative — keep collapsible structure
    const narrativeBody = document.getElementById('briefing-ai-body');
    if (narrativeBody) {
      narrativeBody.innerHTML = `<div id="briefing-ai-narrative"
        style="font-size:13px;color:var(--text);line-height:1.7;font-family:var(--font-body)">
        ${_formatBriefingNarrative(full)}
      </div>`;
    }
    // Update the timestamp in the header toggle row
    const tsEl = section.querySelector('span[style*="var(--muted)"]');
    if (tsEl) tsEl.textContent = 'Generated ' + new Date().toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});

    // Cache to DB
    inst.briefing_narrative    = full;
    inst.briefing_generated_at = new Date().toISOString();
    API.patch(`workflow_instances?id=eq.${instId}`, {
      briefing_narrative:    full,
      briefing_generated_at: inst.briefing_generated_at,
    }).catch(e => console.warn('Briefing cache failed:', e));

  } catch(e) {
    section.innerHTML = `
      <div style="padding:14px 20px;display:flex;align-items:center;gap:12px">
        <div style="flex:1">
          <div style="font-size:9px;font-weight:700;letter-spacing:.12em;color:var(--cad);
            text-transform:uppercase;margin-bottom:3px">&#10022; AI Narrative</div>
          <div style="font-size:10px;color:var(--red)">
            Generation failed: ${escHtml(e.message || 'unknown error')} — 
            <button onclick="_generateAIBriefing('${inst.id}')"
              style="color:var(--accent);background:none;border:none;cursor:pointer;
                font-size:10px;text-decoration:underline;padding:0">retry</button>
          </div>
        </div>
      </div>`;
  }
}

function _regenerateAIBriefing(instId) {
  const inst = _instances.find(i => i.id === instId) || _selectedInstance;
  if (!inst) return;
  // Clear cache locally — the generate fn will overwrite DB on completion
  inst.briefing_narrative    = null;
  inst.briefing_generated_at = null;
  _generateAIBriefing(instId);
}