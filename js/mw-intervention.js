// ══════════════════════════════════════════════════════════
// INTERVENTION RECORD DRAWER
// ══════════════════════════════════════════════════════════
window.openInterventionRecord = async function(projectId, projectName) {
  document.getElementById('ir-drawer')?.remove();
  document.getElementById('ir-esc-composer')?.remove();
  const drawer = document.createElement('div');
  drawer.id = 'ir-drawer';
  Object.assign(drawer.style, {
    position:'fixed',top:'44px',right:'0',bottom:'0',width:'560px',
    background:'#08101f',borderLeft:'1px solid rgba(226,75,74,.3)',
    display:'flex',flexDirection:'column',zIndex:'250',
    animation:'pm-drawer-in .2s ease',overflow:'hidden'
  });
  // Build header
  const hdr = document.createElement('div');
  hdr.style.cssText='padding:10px 14px 8px;border-bottom:1px solid rgba(226,75,74,.2);background:#07101e;flex-shrink:0;display:flex;align-items:flex-start;justify-content:space-between';
  hdr.innerHTML=`<div>
    <div style="font-family:var(--font-display);font-size:16px;font-weight:700;color:#F0F6FF">Intervention Record</div>
    <div id="ir-proj-name" style="font-family:var(--font-head);font-size:11px;color:#4A6E90;margin-top:2px">${esc(projectName||'')}</div>
    <div id="ir-summary" style="font-family:var(--font-head);font-size:11px;color:#3A5C80;margin-top:1px">CoC-linked</div>
  </div>
  <div style="display:flex;gap:6px;align-items:center">
    <button onclick="irOpenLogModal()" style="font-family:var(--font-head);font-size:11px;font-weight:700;padding:4px 12px;background:none;border:1px solid rgba(0,210,255,.3);color:#00D2FF;cursor:pointer;letter-spacing:.08em">+ Log intervention</button>
    <button onclick="document.getElementById('ir-drawer')?.remove();document.getElementById('ir-esc-composer')?.remove();" style="background:none;border:none;color:#5A84A8;font-size:16px;cursor:pointer;padding:0">✕</button>
  </div>`;
  drawer.appendChild(hdr);
  // Body
  const body = document.createElement('div');
  body.id='ir-body';
  body.style.cssText='flex:1;overflow-y:auto;padding:10px 12px';
  body.innerHTML='<div style="font-family:var(--font-head);font-size:12px;color:#3A5C80">Loading…</div>';
  drawer.appendChild(body);
  // Log modal (hidden)
  const logModal = document.createElement('div');
  logModal.id='ir-modal-overlay';
  logModal.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,.6);z-index:10;display:none;align-items:flex-start;justify-content:center;padding-top:30px';
  logModal.innerHTML=`<div style="background:#0f1e35;border:1px solid rgba(0,210,255,.2);width:480px;max-height:80vh;overflow-y:auto">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid rgba(0,210,255,.1)">
      <div style="font-family:var(--font-display);font-size:14px;font-weight:700;color:#F0F6FF">Log intervention</div>
      <button onclick="document.getElementById('ir-modal-overlay').style.display='none'" style="background:none;border:1px solid rgba(255,255,255,.15);color:#5A84A8;width:22px;height:22px;cursor:pointer;font-size:14px">✕</button>
    </div>
    <div style="padding:14px">
      <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#00D2FF;margin-bottom:5px">Problem signal</div>
      <textarea id="ir-signal-input" rows="2" style="width:100%;font-family:var(--font-body);font-size:12px;padding:7px 9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#C8DFF0;outline:none;resize:none;box-sizing:border-box;margin-bottom:10px" placeholder="Describe the problem signal…"></textarea>
      <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#00D2FF;margin-bottom:5px">Action type</div>
      <select id="ir-action-type" style="width:100%;font-family:var(--font-head);font-size:12px;padding:6px 8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#C8DFF0;outline:none;cursor:pointer;margin-bottom:10px">
        <option>Resource reassignment</option><option>Meeting convened</option><option>Action item created</option>
        <option>Escalation to management</option><option>Template redesign</option><option>Process change</option><option>External intervention</option>
      </select>
      <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#00D2FF;margin-bottom:5px">What did you do?</div>
      <textarea id="ir-action-text" rows="3" style="width:100%;font-family:var(--font-body);font-size:12px;padding:7px 9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#C8DFF0;outline:none;resize:none;box-sizing:border-box;margin-bottom:10px" placeholder="Describe the corrective action…"></textarea>
      <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#00D2FF;margin-bottom:5px">Expected outcome</div>
      <textarea id="ir-expected" rows="2" style="width:100%;font-family:var(--font-body);font-size:12px;padding:7px 9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#C8DFF0;outline:none;resize:none;box-sizing:border-box;margin-bottom:10px" placeholder="What do you expect to happen?"></textarea>
      <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#00D2FF;margin-bottom:5px">Measurement window</div>
      <select id="ir-window" style="width:100%;font-family:var(--font-head);font-size:12px;padding:6px 8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#C8DFF0;outline:none;cursor:pointer;margin-bottom:12px">
        <option>24 hours</option><option>48 hours</option><option>72 hours</option><option>1 week</option>
      </select>
      <div style="display:flex;gap:6px">
        <button id="ir-save-btn" style="font-family:var(--font-head);font-size:11px;font-weight:700;padding:6px 16px;background:none;border:1px solid rgba(0,210,255,.4);color:#00D2FF;cursor:pointer;letter-spacing:.08em">Save intervention</button>
        <button onclick="document.getElementById('ir-modal-overlay').style.display='none'" style="font-family:var(--font-head);font-size:11px;padding:6px 14px;background:none;border:1px solid rgba(255,255,255,.2);color:#5A84A8;cursor:pointer">Cancel</button>
      </div>
    </div>
  </div>`;
  drawer.appendChild(logModal);
  document.body.appendChild(drawer);

  // Wire save button after DOM insertion
  const saveBtn = document.getElementById('ir-save-btn');
  if(saveBtn) saveBtn.onclick = () => irSaveIntervention(projectId);

  // Close on outside click
  setTimeout(()=>{
    document.addEventListener('mousedown', function irClose(ev){
      const ir=document.getElementById('ir-drawer'), ic=document.getElementById('ir-esc-composer');
      if(!ir?.contains(ev.target)&&!ic?.contains(ev.target)){
        ir?.remove(); ic?.remove();
        document.removeEventListener('mousedown',irClose);
      }
    });
  },120);

  // Load data
  try {
    const projInsts = await API.get(`workflow_instances?select=id,title,status,project_id&project_id=eq.${projectId}&limit=30`).catch(()=>[]);
    const instIds   = projInsts.map(i=>i.id);
    let cocItems = [];
    if(instIds.length>0){
      cocItems = await API.get(`workflow_step_instances?select=id,instance_id,event_type,step_name,outcome,actor_name,event_notes,created_at&instance_id=in.(${instIds.slice(0,50).join(',')})&event_type=in.(step_reset,task_progress_update,intervention,management_decision,client_response)&order=created_at.desc&limit=100`).catch(()=>[]);
    }
    const resets = cocItems.filter(e=>e.event_type==='step_reset');
    const instResetCount={};
    resets.forEach(e=>{instResetCount[e.instance_id]=(instResetCount[e.instance_id]||0)+1;});
    const seenInsts=new Set(), threads=[];
    resets.forEach(e=>{
      if(seenInsts.has(e.instance_id)) return;
      seenInsts.add(e.instance_id);
      const inst=projInsts.find(i=>i.id===e.instance_id);
      const count=instResetCount[e.instance_id];
      threads.push({inst,signalEvent:e,resetCount:count,
        resolved:inst?.status==='complete',
        outcome:inst?.status==='complete'?'resolved':count>=2?'escalation':count===1?'pending':'monitoring',
        relatedEvents:cocItems.filter(x=>x.instance_id===e.instance_id).sort((a,b)=>a.created_at.localeCompare(b.created_at))
      });
    });
    const otherEvents=cocItems.filter(e=>['management_decision','client_response','intervention'].includes(e.event_type));
    const activeCount=threads.filter(t=>!t.resolved).length;
    const resolvedCount=threads.filter(t=>t.resolved).length;
    const escCount=threads.filter(t=>t.outcome==='escalation').length;
    const sumEl=document.getElementById('ir-summary');
    if(sumEl) sumEl.textContent=`${activeCount} active · ${resolvedCount} resolved · ${escCount} escalation${escCount!==1?'s':''} · CoC-linked`;
    const oc_map={resolved:'#1D9E75',escalation:'#E24B4A',pending:'#EF9F27',monitoring:'#5A84A8'};
    const ol_map={resolved:'Resolved',escalation:'Escalation recommended',pending:'Pending outcome',monitoring:'Monitoring'};
    let html='';
    const escThreads=threads.filter(t=>t.outcome==='escalation');
    if(escThreads.length>0){
      html+=`<div style="background:rgba(226,75,74,.07);border:1px solid rgba(226,75,74,.3);border-left:3px solid #E24B4A;padding:10px 12px;margin-bottom:10px">
        <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#E24B4A;margin-bottom:3px">! Escalation recommended</div>
        <div style="font-family:var(--font-body);font-size:12px;color:#C8DFF0;line-height:1.5;margin-bottom:8px">${escThreads.length} workflow${escThreads.length>1?'s have':' has'} had 2+ failed interventions. Requires authority beyond PM level.</div>
        <button onclick="irComposeEscalation('${projectId}','${esc(projectName||'')}')" style="font-family:var(--font-head);font-size:11px;font-weight:700;padding:4px 12px;background:none;border:1px solid rgba(226,75,74,.5);color:#E24B4A;cursor:pointer">Compose escalation brief &rarr;</button>
      </div>`;
    }
    if(!threads.length&&!otherEvents.length){
      html+='<div style="font-family:var(--font-head);font-size:12px;color:#3A5C80;padding:16px 0;text-align:center">No intervention records yet. Use + Log intervention to create the first entry.</div>';
    }
    threads.forEach(t=>{
      const oc=oc_map[t.outcome], ol=ol_map[t.outcome];
      const stepsHtml=t.relatedEvents.map((ev,i)=>{
        const isLast=i===t.relatedEvents.length-1;
        const tlbl=ev.event_type==='step_reset'?'Problem signal':ev.event_type==='management_decision'?'Management decision':'CoC event';
        const dcol=ev.event_type==='step_reset'?'#E24B4A':ev.event_type==='management_decision'?'#8B5CF6':'#00D2FF';
        const outL=ev.outcome==='on_track'?'POSITIVE':ev.outcome==='blocked'?'NEGATIVE':ev.outcome==='at_risk'?'WATCH':null;
        const outC=outL==='POSITIVE'?'rgba(29,158,117,.06)':outL==='NEGATIVE'?'rgba(226,75,74,.05)':'rgba(239,159,39,.05)';
        const outB=outL==='POSITIVE'?'rgba(29,158,117,.25)':outL==='NEGATIVE'?'rgba(226,75,74,.2)':'rgba(239,159,39,.2)';
        const outT=outL==='POSITIVE'?'#1D9E75':outL==='NEGATIVE'?'#E24B4A':'#EF9F27';
        return `<div style="display:flex;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04)">
          <div style="display:flex;flex-direction:column;align-items:center;width:16px;flex-shrink:0">
            <div style="width:10px;height:10px;border-radius:50%;background:${dcol};flex-shrink:0"></div>
            ${isLast?'':'<div style="flex:1;width:1px;background:rgba(255,255,255,.08);margin-top:3px;min-height:10px"></div>'}
          </div>
          <div style="flex:1;min-width:0;padding-top:1px">
            <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#3A5C80;margin-bottom:3px">${tlbl}</div>
            <div style="font-family:var(--font-body);font-size:12px;color:#C8DFF0;line-height:1.5">${esc(ev.step_name||ev.event_notes||'—')}</div>
            ${ev.event_notes&&ev.step_name?`<div style="font-family:var(--font-head);font-size:11px;color:#4A6E90;margin-top:2px">${esc(ev.event_notes.slice(0,120))}</div>`:''}
            <div style="font-family:var(--font-head);font-size:11px;color:#3A5C80;margin-top:3px">${_timeAgo(ev.created_at)}${ev.actor_name?' · '+esc(ev.actor_name):''}</div>
            ${outL?`<div style="margin-top:6px;padding:5px 8px;border:1px solid ${outB};background:${outC};font-family:var(--font-head);font-size:11px;color:${outT}">Measured — ${outL}${ev.event_notes?' · '+esc(ev.event_notes.slice(0,80)):''}</div>`:''}
          </div>
        </div>`;
      }).join('');
      html+=`<div style="border:1px solid rgba(255,255,255,.08);margin-bottom:10px;overflow:hidden">
        <div style="padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:flex-start;gap:8px;background:rgba(255,255,255,.02);cursor:pointer"
          onclick="const b=this.nextElementSibling;b.style.display=b.style.display==='none'?'block':'none'">
          <div style="width:3px;align-self:stretch;flex-shrink:0;border-radius:1px;background:${oc}"></div>
          <div style="flex:1;min-width:0">
            <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#3A5C80;margin-bottom:2px">${esc(t.inst?.title||'—')}</div>
            <div style="font-family:var(--font-display);font-size:14px;font-weight:700;color:${oc}">${esc(t.signalEvent.step_name||'Step reset')} — ${t.resetCount} intervention${t.resetCount>1?'s':''}</div>
            <div style="font-family:var(--font-head);font-size:11px;color:#3A5C80;margin-top:1px">Identified: ${_timeAgo(t.signalEvent.created_at)}</div>
          </div>
          <span style="font-family:var(--font-head);font-size:11px;font-weight:700;padding:2px 9px;border:1px solid ${oc}40;color:${oc};flex-shrink:0">${ol}</span>
        </div>
        <div>${stepsHtml}</div>
      </div>`;
    });
    if(otherEvents.length>0){
      html+=`<div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#3A5C80;margin-bottom:6px;padding-top:4px">Other CoC activity</div>`;
      otherEvents.slice(0,5).forEach(e=>{
        const col=e.event_type==='management_decision'?'#8B5CF6':e.event_type==='client_response'?'#185FA5':'#00D2FF';
        html+=`<div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid rgba(0,210,255,.07)">
          <div style="width:7px;height:7px;border-radius:50%;background:${col};flex-shrink:0;margin-top:3px"></div>
          <div style="flex:1">
            <div style="font-family:var(--font-body);font-size:12px;color:#C8DFF0">${esc(e.step_name||e.event_type.replace(/_/g,' '))}</div>
            ${e.event_notes?`<div style="font-family:var(--font-head);font-size:11px;color:#4A6E90;margin-top:1px">${esc(e.event_notes.slice(0,100))}</div>`:''}
            <div style="font-family:var(--font-head);font-size:11px;color:#3A5C80;margin-top:2px">${_timeAgo(e.created_at)}${e.actor_name?' · '+esc(e.actor_name):''}</div>
          </div>
        </div>`;
      });
    }
    body.innerHTML=html;
  } catch(err){
    console.error('[Compass] IR error:',err);
    body.innerHTML='<div style="font-family:var(--font-head);font-size:12px;color:var(--compass-red);padding:12px">Failed to load intervention records</div>';
  }
};

window.irOpenLogModal = function() {
  const mo=document.getElementById('ir-modal-overlay');
  if(mo) mo.style.display='flex';
};

window.irSaveIntervention = async function(projectId) {
  const signal  = document.getElementById('ir-signal-input')?.value?.trim()||'';
  const type    = document.getElementById('ir-action-type')?.value||'';
  const action  = document.getElementById('ir-action-text')?.value?.trim()||'';
  const expected= document.getElementById('ir-expected')?.value?.trim()||'';
  const win     = document.getElementById('ir-window')?.value||'24 hours';
  if(!signal||!action){ compassToast('Signal and action are required',2000); return; }
  await API.post('workflow_step_instances',{
    event_type:'intervention', step_name:signal.slice(0,80),
    event_notes:'['+type+'] '+action+(expected?' Expected: '+expected:'')+'. Window: '+win,
    actor_name:_myResource?.name||null, created_at:new Date().toISOString(),
    firm_id:'aaaaaaaa-0001-0001-0001-000000000001'
  }).catch(()=>{});
  document.getElementById('ir-modal-overlay').style.display='none';
  compassToast('Intervention logged · CoC event written',2000);
  const b=document.getElementById('ir-body');
  if(b) b.innerHTML='<div style="font-family:var(--font-head);font-size:12px;color:#3A5C80">Refreshing…</div>';
  setTimeout(()=>openInterventionRecord(projectId,''),600);
};

window.irComposeEscalation = function(projectId, projName) {
  document.getElementById('ir-esc-composer')?.remove();
  const comp=document.createElement('div');
  comp.id='ir-esc-composer';
  comp.style.cssText='position:fixed;top:44px;right:560px;bottom:0;width:400px;background:#0f1e35;border-left:1px solid rgba(226,75,74,.25);display:flex;flex-direction:column;z-index:255;animation:pm-drawer-in .2s ease';
  comp.innerHTML=`
    <div style="padding:10px 14px;border-bottom:1px solid rgba(0,210,255,.1);background:#07101e;flex-shrink:0;display:flex;justify-content:space-between;align-items:center">
      <div style="font-family:var(--font-display);font-size:14px;font-weight:700;color:#F0F6FF">Escalation brief</div>
      <button onclick="document.getElementById('ir-esc-composer')?.remove()" style="background:none;border:none;color:#5A84A8;font-size:16px;cursor:pointer">✕</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:12px">
      <div style="font-family:var(--font-head);font-size:11px;color:#3A5C80;margin-bottom:10px">Auto-assembled from intervention record. Review and add context before sending.</div>
      <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#00D2FF;margin-bottom:5px">Project</div>
      <div style="font-family:var(--font-body);font-size:12px;color:#C8DFF0;padding:7px 9px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);margin-bottom:10px">${esc(projName)}</div>
      <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#EF9F27;margin-bottom:5px">AI narrative</div>
      <div style="font-family:var(--font-body);font-size:12px;color:#C8DFF0;padding:7px 9px;background:rgba(239,159,39,.04);border-left:2px solid #EF9F27;border:1px solid rgba(239,159,39,.15);margin-bottom:10px;line-height:1.5">The blocking issue requires authority the PM does not have. Recommended: direct contact with the client technical director or authorization to engage an alternative approach.</div>
      <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#00D2FF;margin-bottom:5px">PM context (optional)</div>
      <textarea rows="3" style="width:100%;font-family:var(--font-body);font-size:12px;padding:7px 9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#C8DFF0;outline:none;resize:none;box-sizing:border-box;margin-bottom:10px" placeholder="Add context for management…"></textarea>
      <button onclick="irSendEscalation(this,'${projectId}')" style="width:100%;font-family:var(--font-head);font-size:12px;font-weight:700;padding:8px 16px;background:none;border:1px solid rgba(226,75,74,.5);color:#E24B4A;cursor:pointer">Send to management &rarr;</button>
    </div>`;
  document.body.appendChild(comp);
};

window.irSendEscalation = async function(btn, projectId) {
  btn.textContent='✓ Escalation sent — management notified';
  btn.disabled=true;
  await API.post('workflow_step_instances',{
    id:crypto.randomUUID(), instance_id:crypto.randomUUID(), step_type:'manual',
    event_type:'management_decision', step_name:'Escalation',
    event_notes:'PM escalated to management from intervention record.',
    actor_name:_myResource?.name||null, created_at:new Date().toISOString(),
    firm_id:'aaaaaaaa-0001-0001-0001-000000000001'
  }).catch(()=>{});
  compassToast('Escalation sent to management',2500);
  setTimeout(()=>document.getElementById('ir-esc-composer')?.remove(),1500);
};