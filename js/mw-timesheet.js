// ══════════════════════════════════════════════════════════
// COMPONENT 1.F — Full Weekly Timesheet Drawer (640px)
// ══════════════════════════════════════════════════════════
function openFullWeeklyTimesheet({ expandDay=null }={}) {
  document.getElementById('full-weekly-drawer')?.remove();
  const today=new Date().toLocaleDateString('en-CA');
  const todayDt=new Date(today+'T00:00:00');
  const isoOff=todayDt.getDay()===0?6:todayDt.getDay()-1;
  const wkStart=new Date(todayDt); wkStart.setDate(todayDt.getDate()-isoOff);
  const weekStartStr=wkStart.toLocaleDateString('en-CA');
  const weekDays=Array.from({length:5},(_,i)=>{const d=new Date(wkStart);d.setDate(wkStart.getDate()+i);return d.toLocaleDateString('en-CA');});
  const dayNames=['Mon','Tue','Wed','Thu','Fri'];
  const expandTarget=expandDay||today;

  const weekEntries=_teEntries.filter(e=>weekDays.includes(e.date));
  const weekTotal=weekEntries.reduce((s,e)=>s+parseFloat(e.hours||0),0);
  const weekBillable=weekEntries.filter(e=>e.is_billable).reduce((s,e)=>s+parseFloat(e.hours||0),0);
  const dayTotals={};
  weekDays.forEach(d=>{dayTotals[d]=weekEntries.filter(e=>e.date===d).reduce((s,e)=>s+parseFloat(e.hours||0),0);});

  // Project × Day grid
  const projIds=[...new Set(weekEntries.map(e=>e.project_id).filter(Boolean))];
  const gridProjects=projIds.map(pid=>_projects.find(p=>p.id===pid)).filter(Boolean);

  function cellHtml(hrs,d){
    const isPast=d<today,isToday=d===today,isFut=d>today;
    if(isFut) return `<span style="font-family:var(--font-head);font-size:11px;color:var(--text3)">—</span>`;
    if(hrs>0){ const c=isToday?'var(--compass-cyan)':'var(--compass-green)'; return `<span style="font-family:var(--font-head);font-size:12px;font-weight:700;color:${c}">${hrs.toFixed(1)}h ${isToday?'■':'✓'}</span>`; }
    if(isPast) return `<span style="font-family:var(--font-head);font-size:12px;font-weight:700;color:var(--compass-red)">0h !</span>`;
    return `<span style="font-family:var(--font-head);font-size:11px;color:var(--text3)">—</span>`;
  }

  const gridHtml=`<div style="overflow-x:auto;margin-bottom:0">
    <table style="width:100%;border-collapse:collapse;font-family:var(--font-head);font-size:12px">
      <thead><tr style="border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:6px 13px;font-weight:700;color:var(--text3);font-size:11px;letter-spacing:.07em">PROJECT</th>
        ${weekDays.map((d,i)=>`<th style="text-align:center;padding:6px 8px;font-weight:700;color:${d===today?'var(--compass-cyan)':d<today?'var(--text2)':'var(--text3)'};font-size:11px">${dayNames[i]}</th>`).join('')}
        <th style="text-align:right;padding:6px 13px 6px 0;font-weight:700;color:var(--text3);font-size:11px">TOTAL</th>
      </tr></thead>
      <tbody>
        ${gridProjects.map(proj=>{
          const rowE=weekEntries.filter(e=>e.project_id===proj.id);
          const rTotal=rowE.reduce((s,e)=>s+parseFloat(e.hours||0),0);
          return `<tr style="border-bottom:1px solid rgba(0,210,255,.06)">
            <td style="padding:7px 13px;color:var(--text1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${esc(proj.name)}</td>
            ${weekDays.map(d=>`<td style="text-align:center;padding:7px 8px">${cellHtml(rowE.filter(e=>e.date===d).reduce((s,e)=>s+parseFloat(e.hours||0),0),d)}</td>`).join('')}
            <td style="text-align:right;padding:7px 13px 7px 0;font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--compass-cyan)">${rTotal.toFixed(1)}h</td>
          </tr>`;
        }).join('')}
        ${gridProjects.length===0?`<tr><td colspan="${weekDays.length+2}" style="padding:12px 13px;color:var(--text3);font-family:var(--font-head);font-size:12px">No time entries this week</td></tr>`:''}
      </tbody>
      <tfoot><tr style="border-top:1px solid var(--border)">
        <td style="padding:7px 13px;font-weight:700;color:var(--text2);font-size:11px;font-family:var(--font-head)">DAILY TOTAL</td>
        ${weekDays.map(d=>`<td style="text-align:center;padding:7px 8px">${cellHtml(dayTotals[d],d)}</td>`).join('')}
        <td style="text-align:right;padding:7px 13px 7px 0;font-family:var(--font-display);font-size:14px;font-weight:700;color:var(--compass-cyan)">${weekTotal.toFixed(1)}h</td>
      </tr></tfoot>
    </table>
    <div style="padding:4px 13px 6px;font-family:var(--font-head);font-size:11px;color:var(--text3)">✓ Complete · ■ Today · ! No entries</div>
  </div>`;

  // Day accordions
  function dayAccordion(d,label){
    const isToday=d===today,isPast=d<today,isFut=d>today;
    const hrs=dayTotals[d]||0,dayE=weekEntries.filter(e=>e.date===d),isExp=d===expandTarget;
    let borderColor='var(--border)';
    if(isToday)borderColor='var(--compass-cyan)';
    else if(isPast&&hrs>0)borderColor='var(--compass-green)';
    else if(isPast&&hrs===0)borderColor='var(--compass-red)';
    const entryRows=dayE.map(e=>{
      const proj=_projects.find(p=>p.id===e.project_id);
      const isDirect=e.source_type==='direct';
      return `<div style="display:grid;grid-template-columns:20px 1fr auto auto auto;gap:8px;align-items:center;padding:6px 13px;border-bottom:1px solid rgba(0,210,255,.04)">
        <span style="color:${e.source_type==='step_comment'?'var(--compass-amber)':'var(--text3)'};font-size:12px">${e.source_type==='step_comment'?'■':'●'}</span>
        <div>
          <div style="font-family:var(--font-body);font-size:12px;font-weight:500;color:var(--text0)">${esc(e.step_name||proj?.name||'—')}</div>
          <div style="font-family:var(--font-head);font-size:11px;color:var(--text3)">${esc(proj?.name||'—')} · ${e.is_billable?'Billable':'Non-bill'}</div>
        </div>
        <div style="width:8px;height:8px;border-radius:50%;background:${e.is_billable?'var(--compass-cyan)':'#8B5CF6'}"></div>
        <div style="font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--compass-cyan);min-width:36px;text-align:right">${parseFloat(e.hours).toFixed(1)}h</div>
        ${isDirect?`<button data-te-del="${e.id}" style="background:none;border:none;color:rgba(226,75,74,.4);cursor:pointer;font-size:12px;padding:0;line-height:1" onmouseenter="this.style.color='var(--compass-red)'" onmouseleave="this.style.color='rgba(226,75,74,.4)'">✕</button>`:'<div></div>'}
      </div>`;
    }).join('');
    const progressBar=isToday?`<div style="padding:6px 13px 4px">
      <div style="display:flex;justify-content:space-between;font-family:var(--font-head);font-size:11px;color:var(--text3);margin-bottom:4px">
        <span>Today's progress</span><span style="color:var(--compass-cyan)">${hrs.toFixed(1)}h / 8h</span></div>
      <div style="height:3px;background:rgba(255,255,255,.06);border-radius:2px">
        <div style="height:100%;width:${Math.min(hrs/8*100,100).toFixed(0)}%;background:var(--compass-cyan);border-radius:2px"></div></div></div>`:'';
    const addForm=!isFut?`<div style="padding:10px 13px;border-top:1px solid var(--border);background:rgba(0,0,0,.15)">
      <div style="font-family:var(--font-head);font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.07em;margin-bottom:6px">ADD TIME</div>
      <div style="display:grid;grid-template-columns:1fr 70px;gap:8px;margin-bottom:6px">
        <input class="acc-desc-inp" data-day="${d}" placeholder="Description…"
          style="font-family:var(--font-body);font-size:12px;padding:6px 8px;background:var(--bg2);border:1px solid var(--border);color:var(--text1);outline:none"/>
        <input class="acc-hrs-inp" data-day="${d}" type="number" min="0.25" max="24" step="0.25" placeholder="0.0"
          style="font-family:var(--font-display);font-size:14px;font-weight:700;padding:6px;background:var(--bg2);border:1px solid rgba(0,210,255,.3);color:var(--compass-cyan);outline:none;text-align:center"/>
      </div>
      <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center">
        <select class="acc-proj-sel" data-day="${d}" style="font-family:var(--font-head);font-size:11px;font-weight:600;padding:6px 8px;background:var(--bg2);border:1px solid var(--border);color:var(--text1);cursor:pointer">
          <option value="">— Project —</option>
          ${(_projects||[]).filter(p=>p.status==='active').map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}
        </select>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;white-space:nowrap">
          <input class="acc-bill-chk" data-day="${d}" type="checkbox" checked style="accent-color:var(--compass-cyan)"/>
          <span style="font-family:var(--font-head);font-size:11px;color:var(--text3)">Billable</span>
        </label>
        <button class="acc-add-btn" data-day="${d}"
          style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.06em;padding:6px 14px;background:var(--compass-cyan);color:#060a10;border:none;cursor:pointer;white-space:nowrap"
          onmouseenter="this.style.opacity='.85'" onmouseleave="this.style.opacity='1'">Add →</button>
      </div></div>`:'';
    const markBtn=isToday?`<div style="padding:8px 13px;border-top:1px solid var(--border)">
      <button class="mark-today-complete-btn"
        style="width:100%;font-family:var(--font-head);font-size:12px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;padding:8px;
          background:rgba(29,158,117,.12);color:var(--compass-green);border:1px solid rgba(29,158,117,.3);cursor:pointer"
        onmouseenter="this.style.background='rgba(29,158,117,.2)'" onmouseleave="this.style.background='rgba(29,158,117,.12)'">
        ✓ Mark today complete — ${hrs.toFixed(1)}h logged</button></div>`:'';
    return `<div class="day-accordion" data-day="${d}" style="border-left:3px solid ${borderColor};margin-bottom:4px">
      <div class="day-acc-header" data-day="${d}"
        style="display:flex;align-items:center;gap:10px;padding:9px 13px;cursor:pointer;user-select:none;background:var(--bg2);border-bottom:1px solid var(--border)"
        onclick="const b=this.parentElement.querySelector('.day-acc-body');const show=b.style.display==='none';b.style.display=show?'block':'none';this.querySelector('.acc-chevron').style.transform=show?'rotate(90deg)':'rotate(0deg)'">
        <span class="acc-chevron" style="color:var(--text3);font-size:11px;transition:transform .15s;transform:${isExp?'rotate(90deg)':'rotate(0deg)'}">▶</span>
        <span style="font-family:var(--font-head);font-size:13px;font-weight:700;color:${isToday?'var(--compass-cyan)':isPast&&hrs>0?'var(--compass-green)':isPast?'var(--compass-red)':'var(--text2)'};min-width:60px">${label}</span>
        <span style="font-family:var(--font-display);font-size:16px;font-weight:700;color:${isToday?'var(--compass-cyan)':hrs>0?'var(--compass-green)':'var(--text3)'}">${hrs.toFixed(1)}h</span>
        <span style="margin-left:auto;font-family:var(--font-head);font-size:11px;color:var(--text3)">${dayE.length} ${dayE.length===1?'entry':'entries'}</span>
      </div>
      <div class="day-acc-body" style="display:${isExp?'block':'none'}">
        ${progressBar}${entryRows||`<div style="padding:10px 13px;font-family:var(--font-head);font-size:12px;color:var(--text3)">No entries for this day</div>`}
        ${addForm}${markBtn}
      </div>
    </div>`;
  }

  const accordionHtml=weekDays.map((d,i)=>dayAccordion(d,new Date(d+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}))).join('');

  if (!document.getElementById('wts-style')) {
    const s=document.createElement('style');s.id='wts-style';
    s.textContent='@keyframes wts-slide{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}';
    document.head.appendChild(s);
  }

  const drawer=document.createElement('div');
  drawer.id='full-weekly-drawer';
  drawer.style.cssText='position:fixed;top:0;right:0;bottom:0;width:640px;z-index:600;background:var(--bg0,#060a10);border-left:1px solid var(--border);box-shadow:-12px 0 40px rgba(0,0,0,.6);display:flex;flex-direction:column;animation:wts-slide .22s ease';

  drawer.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px 10px;border-bottom:1px solid var(--border);flex-shrink:0">
      <div>
        <div style="font-family:var(--font-head);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--compass-cyan);margin-bottom:2px">Weekly Timesheet</div>
        <div style="font-family:var(--font-display);font-size:16px;font-weight:700;color:var(--text0)">${new Date(weekDays[0]+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${new Date(weekDays[4]+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
      </div>
      <button onclick="document.getElementById('full-weekly-drawer').remove()"
        style="background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer;padding:0;line-height:1"
        onmouseenter="this.style.color='var(--text0)'" onmouseleave="this.style.color='var(--text3)'">✕</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:14px 0">
      <div style="padding:0 0 14px;border-bottom:1px solid var(--border);margin-bottom:14px">
        <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);padding:0 13px 6px">Project Overview</div>
        ${gridHtml}
      </div>
      <div style="padding:0 0 20px">
        <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);padding:0 13px 8px">Daily Breakdown</div>
        ${accordionHtml}
      </div>
    </div>
    <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <div style="font-family:var(--font-head);font-size:13px;font-weight:700;color:var(--text1)">
        Week total: <span style="color:var(--compass-cyan)">${weekTotal.toFixed(1)}h</span>
        <span style="color:var(--text3);font-size:11px;margin-left:8px">${weekBillable.toFixed(1)}h billable · ${(weekTotal-weekBillable).toFixed(1)}h non-bill</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="te-new-btn"
          style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.06em;
            color:var(--compass-cyan);background:none;border:1px solid rgba(0,210,255,.3);padding:7px 14px;cursor:pointer"
          onmouseenter="this.style.background='rgba(0,210,255,.08)'" onmouseleave="this.style.background='none'">+ Log time</button>
        <button class="ts-submit-wts-btn"
          style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.06em;
            padding:7px 16px;background:var(--compass-cyan);color:#060a10;border:none;cursor:pointer"
          onmouseenter="this.style.opacity='.85'" onmouseleave="this.style.opacity='1'">Submit week →</button>
      </div>
    </div>`;

  document.body.appendChild(drawer);

  drawer.addEventListener('click', async ev => {
    const addBtn=ev.target.closest('.acc-add-btn');
    if (addBtn) {
      const d=addBtn.dataset.day;
      const desc=drawer.querySelector(`.acc-desc-inp[data-day="${d}"]`)?.value?.trim()||'';
      const hrs=parseFloat(drawer.querySelector(`.acc-hrs-inp[data-day="${d}"]`)?.value||0);
      const proj=drawer.querySelector(`.acc-proj-sel[data-day="${d}"]`)?.value||'';
      const bill=drawer.querySelector(`.acc-bill-chk[data-day="${d}"]`)?.checked??true;
      if(!hrs||hrs<=0){compassToast('Hours required',2000);return;}
      if(!proj){compassToast('Project required',2000);return;}
      addBtn.textContent='…';addBtn.disabled=true;
      try {
        const id=crypto.randomUUID();
        await API.post('time_entries',{id,firm_id:'aaaaaaaa-0001-0001-0001-000000000001',
          resource_id:_myResource?.id,user_id:_myResource?.user_id||null,
          project_id:proj,source_type:'direct',date:d,hours:hrs,is_billable:bill,notes:desc||null});
        compassToast('Entry added');drawer.remove();
        _viewLoaded['user']=false;_mwLoadUserView();
        setTimeout(()=>openFullWeeklyTimesheet({expandDay:d}),400);
      } catch(e){addBtn.textContent='Add →';addBtn.disabled=false;compassToast('Failed — '+e.message,2500);}
    }
    const delBtn=ev.target.closest('[data-te-del]');
    if (delBtn){
      if(!confirm('Delete this entry?'))return;
      try{
        await API.del('time_entries?id=eq.'+delBtn.dataset.teDel);
        compassToast('Deleted');drawer.remove();_viewLoaded['user']=false;_mwLoadUserView();
        setTimeout(()=>openFullWeeklyTimesheet({expandDay:expandTarget}),400);
      }catch(e){compassToast('Failed',2000);}
    }
    if(ev.target.closest('.mark-today-complete-btn')){
      const todayHrs=dayTotals[today]||0;
      await window.CoC.write('timesheet.submitted', _myResource?.id || 'unknown', {
        entityType: 'timesheet',
        stepName:   'Daily timesheet complete',
        notes:      todayHrs.toFixed(1) + 'h logged today',
        outcome:    'on_track',
      });
      compassToast('Today marked complete ✓');drawer.remove();_viewLoaded['user']=false;_mwLoadUserView();
    }
    if(ev.target.closest('.ts-submit-wts-btn')){
      drawer.remove();submitTimesheetWeek('',weekStartStr,weekTotal.toFixed(1));
    }
  });

  setTimeout(()=>{
    document.addEventListener('mousedown',function closeWTS(ev){
      if(!drawer.contains(ev.target)){drawer.remove();document.removeEventListener('mousedown',closeWTS);}
    });
  },50);
}

// ══════════════════════════════════════════════════════════
// COMPONENT 1.G — Day Intelligence Briefing (420px)
// ══════════════════════════════════════════════════════════
function openDayBriefing(dateStr) {
  document.getElementById('day-briefing-drawer')?.remove();
  _renderDayBriefing(dateStr, null);
}

function _renderDayBriefing(dateStr, expandEntryId) {
  document.getElementById('day-briefing-drawer')?.remove();

  const today      = new Date().toLocaleDateString('en-CA');
  const dayEntries = _teEntries.filter(e => e.date === dateStr);
  const totalHrs   = dayEntries.reduce((s,e)=>s+parseFloat(e.hours||0),0);
  const billHrs    = dayEntries.filter(e=>e.is_billable).reduce((s,e)=>s+parseFloat(e.hours||0),0);
  const nonBillHrs = totalHrs - billHrs;
  const dayLabel   = new Date(dateStr+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});

  // Project distribution
  const projDist = {};
  dayEntries.forEach(e=>{const pid=e.project_id||'__none__';projDist[pid]=(projDist[pid]||0)+parseFloat(e.hours||0);});
  const distColors = ['var(--compass-cyan)','var(--compass-amber)','var(--compass-green)','var(--compass-purple)','var(--compass-red)'];
  const projDistArr = Object.entries(projDist).map(([pid,hrs])=>{
    const proj=_projects.find(p=>p.id===pid);
    return{pid,name:proj?.name||'Unassigned',hrs,pct:totalHrs>0?Math.round(hrs/totalHrs*100):0};
  }).sort((a,b)=>b.hrs-a.hrs);

  const distBarHtml = totalHrs>0 ? `
    <div style="display:flex;height:7px;border-radius:4px;overflow:hidden;margin-bottom:8px">
      ${projDistArr.map((p,i)=>`<div style="width:${p.pct}%;background:${distColors[i%distColors.length]};min-width:${p.pct>0?2:0}px" title="${p.name}: ${p.pct}%"></div>`).join('')}
    </div>
    <div style="display:flex;flex-direction:column;gap:3px">
      ${projDistArr.map((p,i)=>`<div style="display:flex;align-items:center;gap:8px">
        <div style="width:8px;height:8px;border-radius:50%;background:${distColors[i%distColors.length]};flex-shrink:0"></div>
        <span style="font-family:var(--font-body);font-size:12px;color:var(--text1);flex:1">${esc(p.name)}</span>
        <span style="font-family:var(--font-head);font-size:11px;font-weight:700;color:${distColors[i%distColors.length]}">${p.pct}% (${p.hrs.toFixed(1)}h)</span>
      </div>`).join('')}
    </div>` : '<div style="font-family:var(--font-head);font-size:12px;color:var(--text3)">No entries for this day</div>';

  const billBarHtml = totalHrs>0 ? `
    <div style="display:flex;height:5px;border-radius:3px;overflow:hidden;margin:8px 0 4px">
      <div style="width:${(billHrs/totalHrs*100).toFixed(1)}%;background:var(--compass-cyan)"></div>
      <div style="width:${(nonBillHrs/totalHrs*100).toFixed(1)}%;background:#8B5CF6"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-family:var(--font-head);font-size:11px;font-weight:700">
      <span style="color:var(--compass-cyan)">Billable ${billHrs.toFixed(1)}h (${Math.round(billHrs/totalHrs*100)}%)</span>
      <span style="color:#8B5CF6">Non-bill ${nonBillHrs.toFixed(1)}h (${Math.round(nonBillHrs/totalHrs*100)}%)</span>
    </div>` : '';

  // ── Entry rows — clickable, expand inline for direct edits ──────
  function entryRowHtml(e) {
    const proj     = _projects.find(p=>p.id===e.project_id);
    const isDirect = e.source_type === 'direct';
    const isExp    = e.id === expandEntryId;
    const pctOfDay = totalHrs>0 ? Math.round(parseFloat(e.hours)/totalHrs*100) : 0;
    const entryHrs = parseFloat(e.hours||0);
    const billDot  = `<div style="width:8px;height:8px;border-radius:50%;background:${e.is_billable?'var(--compass-cyan)':'#8B5CF6'};flex-shrink:0"></div>`;

    const expandForm = isDirect ? `
      <div class="db-entry-edit" data-entry-id="${e.id}" style="padding:10px 12px 12px;border-top:1px solid rgba(0,210,255,.15);background:rgba(0,210,255,.03)">
        <div style="display:grid;grid-template-columns:80px 1fr;gap:10px;margin-bottom:8px;align-items:end">
          <div>
            <div style="font-family:var(--font-head);font-size:11px;color:var(--text3);letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px">Hours</div>
            <input class="db-edit-hrs" data-entry-id="${e.id}" type="number" min="0.25" max="24" step="0.25"
              value="${entryHrs.toFixed(2)}"
              style="width:100%;font-family:var(--font-display);font-size:18px;font-weight:700;padding:6px 8px;
                background:var(--bg2);border:1px solid var(--compass-cyan);color:var(--compass-cyan);
                outline:none;text-align:center;box-sizing:border-box"/>
          </div>
          <div>
            <div style="font-family:var(--font-head);font-size:11px;color:var(--text3);letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px">Project</div>
            <select class="db-edit-proj" data-entry-id="${e.id}"
              style="width:100%;font-family:var(--font-head);font-size:12px;font-weight:600;padding:7px 8px;
                background:var(--bg2);border:1px solid var(--border);color:var(--text1);cursor:pointer;box-sizing:border-box">
              ${(_projects||[]).filter(p=>p.status==='active').map(p=>`<option value="${p.id}" ${p.id===e.project_id?'selected':''}>${esc(p.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <input class="db-edit-desc" data-entry-id="${e.id}" type="text"
            value="${esc(e.notes||e.step_name||'')}" placeholder="Notes…"
            style="flex:1;font-family:var(--font-body);font-size:12px;padding:6px 8px;
              background:var(--bg2);border:1px solid var(--border);color:var(--text1);outline:none"/>
          <div class="db-edit-bill" data-entry-id="${e.id}" data-bill="${e.is_billable?'1':'0'}"
            style="padding:6px 10px;border:1px solid ${e.is_billable?'rgba(0,210,255,.4)':'rgba(139,92,246,.4)'};
              background:${e.is_billable?'rgba(0,210,255,.12)':'rgba(139,92,246,.12)'};
              color:${e.is_billable?'var(--compass-cyan)':'#8B5CF6'};
              font-family:var(--font-head);font-size:11px;font-weight:700;cursor:pointer;
              white-space:nowrap;border-radius:2px;user-select:none"
            onclick="const t=this;const v=t.dataset.bill==='1'?'0':'1';t.dataset.bill=v;
              t.style.borderColor=v==='1'?'rgba(0,210,255,.4)':'rgba(139,92,246,.4)';
              t.style.background=v==='1'?'rgba(0,210,255,.12)':'rgba(139,92,246,.12)';
              t.style.color=v==='1'?'var(--compass-cyan)':'#8B5CF6';
              t.textContent=v==='1'?'Billable':'Non-bill'">
            ${e.is_billable?'Billable':'Non-bill'}
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="db-edit-status" data-entry-id="${e.id}"
            style="font-family:var(--font-head);font-size:11px;color:var(--compass-amber);min-height:14px"></span>
          <div style="display:flex;gap:8px">
            <button class="db-edit-delete" data-entry-id="${e.id}"
              style="font-family:var(--font-head);font-size:11px;font-weight:600;letter-spacing:.06em;
                padding:5px 10px;background:none;border:1px solid rgba(226,75,74,.3);
                color:rgba(226,75,74,.7);cursor:pointer"
              onmouseenter="this.style.borderColor='var(--compass-red)';this.style.color='var(--compass-red)'"
              onmouseleave="this.style.borderColor='rgba(226,75,74,.3)';this.style.color='rgba(226,75,74,.7)'">Delete</button>
            <button class="db-edit-save" data-entry-id="${e.id}"
              style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.06em;
                padding:5px 14px;background:var(--compass-cyan);color:#060a10;border:none;cursor:pointer"
              onmouseenter="this.style.opacity='.85'" onmouseleave="this.style.opacity='1'">Save →</button>
          </div>
        </div>
      </div>` : `
      <div style="padding:6px 12px 8px;border-top:1px solid var(--border);background:rgba(239,159,39,.05)">
        <span style="font-family:var(--font-head);font-size:11px;color:var(--compass-amber)">■ Via Cadence — read only</span>
        <a href="/cadence.html" style="font-family:var(--font-head);font-size:11px;color:var(--compass-amber);margin-left:12px;text-decoration:none;border:1px solid rgba(239,159,39,.4);padding:2px 8px">Open →</a>
      </div>`;

    return `<div class="db-entry-row" data-entry-id="${e.id}" data-direct="${isDirect}"
      style="border:1px solid ${isExp?'rgba(0,210,255,.4)':'var(--border)'};
        border-radius:3px;margin-bottom:6px;overflow:hidden;
        transition:border-color .12s">
      <div class="db-entry-header" data-entry-id="${e.id}"
        style="display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:${isDirect?'pointer':'default'}"
        ${isDirect?`onmouseenter="this.parentElement.style.borderColor='rgba(0,210,255,.35)'"
          onmouseleave="this.parentElement.style.borderColor='${isExp?'rgba(0,210,255,.4)':'var(--border)'}'"`:''}>
        <span style="color:${e.source_type==='step_comment'?'var(--compass-amber)':'var(--text3)'};font-size:12px;flex-shrink:0">
          ${e.source_type==='step_comment'?'■':'●'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-family:var(--font-body);font-size:12px;font-weight:500;color:var(--text0);
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${esc(e.step_name||proj?.name||'—')}</div>
          <div style="font-family:var(--font-head);font-size:11px;color:var(--text3)">
            ${esc(proj?.name||'—')} · ${pctOfDay}% of day
            ${isDirect?'<span style="color:rgba(0,210,255,.4);margin-left:6px">click to edit</span>':''}</div>
        </div>
        ${billDot}
        <div style="font-family:var(--font-display);font-size:14px;font-weight:700;
          color:${e.is_billable?'var(--compass-cyan)':'#8B5CF6'};min-width:40px;text-align:right">
          ${entryHrs.toFixed(1)}h</div>
        ${isDirect?`<span style="color:var(--text3);font-size:10px;margin-left:2px;transition:transform .15s;
          transform:${isExp?'rotate(90deg)':'rotate(0deg)'};display:inline-block">▶</span>`:''}
      </div>
      <div class="db-entry-body" style="display:${isExp?'block':'none'}">
        ${expandForm}
      </div>
    </div>`;
  }

  const entriesHtml = dayEntries.length>0
    ? dayEntries.map(entryRowHtml).join('')
    : '<div style="font-family:var(--font-head);font-size:12px;color:var(--text3);padding:4px 0">No entries for this day</div>';

  if (!document.getElementById('db-style')) {
    const s=document.createElement('style');s.id='db-style';
    s.textContent='@keyframes db-slide{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}';
    document.head.appendChild(s);
  }

  const drawer = document.createElement('div');
  drawer.id = 'day-briefing-drawer';
  drawer.style.cssText = 'position:fixed;top:44px;right:0;bottom:0;width:420px;z-index:150;background:var(--bg1,#0c1628);border-left:1px solid var(--border);box-shadow:-10px 0 32px rgba(0,0,0,.5);display:flex;flex-direction:column;animation:db-slide .22s ease';

  drawer.innerHTML = `
    <div style="flex-shrink:0;padding:12px 16px 10px;border-bottom:1px solid var(--border)">
      <div style="font-family:var(--font-head);font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--compass-cyan);margin-bottom:2px">Day Intelligence Briefing</div>
      <div style="display:flex;align-items:baseline;justify-content:space-between">
        <div style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text0)">${dayLabel}</div>
        <button onclick="document.getElementById('day-briefing-drawer').remove()"
          style="background:none;border:none;color:var(--text3);font-size:18px;cursor:pointer;padding:0"
          onmouseenter="this.style.color='var(--text0)'" onmouseleave="this.style.color='var(--text3)'">✕</button>
      </div>
      <div style="font-family:var(--font-head);font-size:12px;color:var(--text3);margin-top:2px">${totalHrs.toFixed(1)}h logged</div>
    </div>
    <div id="db-scroll" style="flex:1;overflow-y:auto;padding:14px 16px">
      <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin-bottom:8px">Where Your Time Went</div>
      ${distBarHtml}
      ${totalHrs>0?`<div style="margin-top:14px">
        <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin-bottom:4px">Billable vs Non-Billable</div>
        ${billBarHtml}</div>`:''}
      <div style="margin-top:16px">
        <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin-bottom:8px">
          Time Entries
          ${dayEntries.length>0?`<span style="font-weight:400;color:var(--muted);font-size:11px;text-transform:none;letter-spacing:0;margin-left:6px">— click direct entries to edit</span>`:''}
        </div>
        <div id="db-entries-list">${entriesHtml}</div>
      </div>
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
        <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin-bottom:8px">Add Entry</div>
        <div style="display:grid;grid-template-columns:1fr 80px;gap:8px;margin-bottom:6px">
          <input id="db-desc" placeholder="Description…"
            style="font-family:var(--font-body);font-size:12px;padding:7px 8px;background:var(--bg2);border:1px solid var(--border);color:var(--text1);outline:none"/>
          <input id="db-hrs" type="number" min="0.25" max="24" step="0.25" placeholder="0.0"
            style="font-family:var(--font-display);font-size:14px;font-weight:700;padding:6px;background:var(--bg2);border:1px solid rgba(0,210,255,.3);color:var(--compass-cyan);outline:none;text-align:center"/>
        </div>
        <div style="display:grid;grid-template-columns:1fr auto;gap:8px;margin-bottom:6px">
          <select id="db-proj" style="font-family:var(--font-head);font-size:11px;font-weight:600;padding:7px 8px;background:var(--bg2);border:1px solid var(--border);color:var(--text1);cursor:pointer">
            <option value="">— Project —</option>
            ${(_projects||[]).filter(p=>p.status==='active').map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}
          </select>
          <div id="db-bill-toggle" data-bill="1"
            onclick="this.dataset.bill=this.dataset.bill==='1'?'0':'1';this.style.background=this.dataset.bill==='1'?'rgba(0,210,255,.15)':'rgba(139,92,246,.15)';this.style.color=this.dataset.bill==='1'?'var(--compass-cyan)':'#8B5CF6';this.style.borderColor=this.dataset.bill==='1'?'rgba(0,210,255,.4)':'rgba(139,92,246,.4)';this.textContent=this.dataset.bill==='1'?'Billable':'Non-bill'"
            style="padding:7px 12px;border:1px solid rgba(0,210,255,.4);background:rgba(0,210,255,.15);color:var(--compass-cyan);font-family:var(--font-head);font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;border-radius:2px">Billable</div>
        </div>
        <button id="db-add-btn"
          style="width:100%;font-family:var(--font-head);font-size:12px;font-weight:700;letter-spacing:.07em;padding:8px;background:var(--compass-cyan);color:#060a10;border:none;cursor:pointer"
          onmouseenter="this.style.opacity='.85'" onmouseleave="this.style.opacity='1'">Add Entry →</button>
        <span id="db-status" style="font-family:var(--font-head);font-size:11px;color:var(--compass-amber);display:block;min-height:14px;margin-top:4px"></span>
      </div>
    </div>
    <div id="db-footer" style="flex-shrink:0;padding:10px 16px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <div>
        <span style="font-family:var(--font-head);font-size:12px;font-weight:700;color:var(--text2)">
          Total: <span id="db-total-hrs" style="color:var(--compass-cyan)">${totalHrs.toFixed(1)}h</span>
        </span>
        <span style="font-family:var(--font-head);font-size:11px;color:var(--text3);margin-left:8px">
          <span id="db-bill-summary" style="color:var(--compass-cyan)">${billHrs.toFixed(1)}h</span> bill ·
          <span id="db-nonbill-summary" style="color:#8B5CF6">${nonBillHrs.toFixed(1)}h</span> non-bill
        </span>
      </div>
      <button onclick="document.getElementById('day-briefing-drawer').remove();openFullWeeklyTimesheet({expandDay:'${dateStr}'})"
        style="font-family:var(--font-head);font-size:11px;color:var(--compass-cyan);background:none;border:none;cursor:pointer;text-decoration:underline;text-underline-offset:2px">Full week →</button>
    </div>`;

  document.body.appendChild(drawer);

  // ── Toggle expand/collapse on entry header click ────────────────
  drawer.addEventListener('click', async ev => {
    // Toggle entry expand
    const header = ev.target.closest('.db-entry-header');
    if (header && !ev.target.closest('.db-edit-save,.db-edit-delete,.db-edit-bill')) {
      const entryId = header.dataset.entryId;
      const row     = header.closest('.db-entry-row');
      if (!row || row.dataset.direct !== 'true') return;
      const body    = row.querySelector('.db-entry-body');
      const chevron = row.querySelector('span[style*="rotate"]');
      const isOpen  = body.style.display !== 'none';
      // Close all others first
      drawer.querySelectorAll('.db-entry-body').forEach(b => { b.style.display='none'; });
      drawer.querySelectorAll('span[style*="rotate"]').forEach(ch => { ch.style.transform='rotate(0deg)'; });
      drawer.querySelectorAll('.db-entry-row').forEach(r => { r.style.borderColor='var(--border)'; });
      if (!isOpen) {
        body.style.display = 'block';
        if (chevron) chevron.style.transform = 'rotate(90deg)';
        row.style.borderColor = 'rgba(0,210,255,.4)';
        row.querySelector('.db-edit-hrs')?.focus();
      }
      return;
    }

    // Save entry edit
    const saveBtn = ev.target.closest('.db-edit-save');
    if (saveBtn) {
      const entryId  = saveBtn.dataset.entryId;
      const row      = saveBtn.closest('.db-entry-row');
      const hrsInput = row.querySelector('.db-edit-hrs');
      const projSel  = row.querySelector('.db-edit-proj');
      const descInp  = row.querySelector('.db-edit-desc');
      const billTog  = row.querySelector('.db-edit-bill');
      const statusEl = row.querySelector('.db-edit-status');
      const hrs      = parseFloat(hrsInput?.value||0);
      const projId   = projSel?.value||null;
      const desc     = descInp?.value?.trim()||null;
      const isBill   = billTog?.dataset?.bill === '1';
      if (!hrs || hrs<=0) { if(statusEl) statusEl.textContent='Hours required'; return; }
      saveBtn.textContent='…'; saveBtn.disabled=true; if(statusEl) statusEl.textContent='';
      try {
        await API.patch(`time_entries?id=eq.${entryId}`, {
          hours:hrs, project_id:projId, notes:desc, is_billable:isBill,
          updated_at: new Date().toISOString()
        });
        // Update in-memory cache immediately
        const cached = _teEntries.find(e=>e.id===entryId);
        if (cached) { cached.hours=hrs; cached.project_id=projId; cached.notes=desc; cached.is_billable=isBill; }
        compassToast('Entry saved');
        // Re-render briefing with same entry expanded (so user sees the updated values)
        _renderDayBriefing(dateStr, null);
        // Refresh main view in background (updates gauges + billable summary)
        _viewLoaded['user']=false; _mwLoadUserView();
      } catch(e) {
        saveBtn.textContent='Save →'; saveBtn.disabled=false;
        if(statusEl) statusEl.textContent='Failed — '+e.message;
      }
      return;
    }

    // Delete entry
    const delBtn = ev.target.closest('.db-edit-delete');
    if (delBtn) {
      if (!confirm('Delete this time entry?')) return;
      const entryId = delBtn.dataset.entryId;
      try {
        await API.del(`time_entries?id=eq.${entryId}`);
        _teEntries = _teEntries.filter(e=>e.id!==entryId);
        compassToast('Entry deleted');
        _renderDayBriefing(dateStr, null);
        _viewLoaded['user']=false; _mwLoadUserView();
      } catch(e) { compassToast('Delete failed',2000); }
      return;
    }

    // Add new entry
    if (ev.target.closest('#db-add-btn')) {
      const desc=drawer.querySelector('#db-desc')?.value?.trim()||'';
      const hrs=parseFloat(drawer.querySelector('#db-hrs')?.value||0);
      const proj=drawer.querySelector('#db-proj')?.value||'';
      const bill=drawer.querySelector('#db-bill-toggle')?.dataset?.bill==='1';
      const statusEl=drawer.querySelector('#db-status');
      const btn=drawer.querySelector('#db-add-btn');
      if(!hrs||hrs<=0){if(statusEl)statusEl.textContent='Hours required';return;}
      if(!proj){if(statusEl)statusEl.textContent='Project required';return;}
      btn.textContent='…';btn.disabled=true;if(statusEl)statusEl.textContent='';
      try{
        const id=crypto.randomUUID();
        const newEntry={id,firm_id:'aaaaaaaa-0001-0001-0001-000000000001',
          resource_id:_myResource?.id,user_id:_myResource?.user_id||null,
          project_id:proj,source_type:'direct',date:dateStr,hours:hrs,is_billable:bill,notes:desc||null};
        await API.post('time_entries', newEntry);
        _teEntries.unshift({...newEntry});
        compassToast('Entry added');
        _renderDayBriefing(dateStr, null);
        _viewLoaded['user']=false; _mwLoadUserView();
      }catch(e){btn.textContent='Add Entry →';btn.disabled=false;if(statusEl)statusEl.textContent='Failed — '+e.message;}
      return;
    }
  });
}


// ── Time entry edit drawer ────────────────────────────────
function openTimeEntryEdit(entry, taskId = null, projectId = null) {
  if (!entry) { openNewTimeEntry(taskId, projectId); return; }
  document.getElementById('te-edit-drawer')?.remove();

  _teSelected = entry.id;
  document.querySelectorAll('.te-row').forEach(r => {
    const isSel = r.dataset.teId === entry.id;
    r.style.borderLeft = isSel ? '2px solid var(--compass-cyan)' : '2px solid transparent';
    r.style.background = isSel ? 'rgba(0,210,255,.04)' : '';
    r.onmouseleave = () => { r.style.background = isSel ? 'rgba(0,210,255,.04)' : ''; };
  });

  const isDirect = entry.source_type === 'direct';
  const proj     = _projects.find(p => p.id === entry.project_id);
  const title    = esc(entry.step_name || proj?.name || '—');
  const roAttr   = isDirect ? '' : 'readonly';
  const roStyle  = isDirect ? '' : 'opacity:.5;cursor:not-allowed';
  const disAttr  = isDirect ? '' : 'disabled';
  const billChk  = entry.is_billable ? 'checked' : '';
  const weekEntries = _teEntries.filter(e =>
    entry.week_start_date ? e.week_start_date === entry.week_start_date
      : e.date?.slice(0,7) === entry.date?.slice(0,7)
  );
  const weekTotal = weekEntries.reduce((s,e) => s + parseFloat(e.hours||0), 0);

  if (!document.getElementById('te-style')) {
    const s = document.createElement('style');
    s.id = 'te-style';
    s.textContent = '@keyframes te-slide-in{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}';
    document.head.appendChild(s);
  }

  const drawer = document.createElement('div');
  drawer.id = 'te-edit-drawer';
  drawer.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:360px;z-index:600;background:var(--bg1,#0c1628);border-left:1px solid var(--border,rgba(0,210,255,.12));box-shadow:-8px 0 32px rgba(0,0,0,.5);display:flex;flex-direction:column;animation:te-slide-in .2s ease;';

  drawer.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;
      padding:14px 16px 10px;border-bottom:1px solid var(--border);flex-shrink:0">
      <div>
        <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:.1em;
          text-transform:uppercase;color:var(--compass-cyan);margin-bottom:3px">
          ${isDirect ? 'Edit entry' : 'Entry detail'}</div>
        <div style="font-family:var(--font-ui);font-size:13px;font-weight:500;color:var(--text0)">${title}</div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-top:3px">
          ${new Date(entry.date+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
          · ${entry.is_billable ? 'Billable' : 'Non-billable'}
          · ${entry.source_type === 'step_comment' ? 'via Cadence' : 'Direct'}
        </div>
      </div>
      <button onclick="document.getElementById('te-edit-drawer').remove();_teSelected=null;"
        style="background:none;border:none;color:var(--text3);font-size:18px;cursor:pointer;padding:0;line-height:1"
        onmouseenter="this.style.color='var(--text0)'" onmouseleave="this.style.color='var(--text3)'">✕</button>
    </div>

    <div style="flex:1;overflow-y:auto;padding:16px">
      ${!isDirect ? `
      <div style="background:rgba(239,159,39,.06);border:1px solid rgba(239,159,39,.25);
        padding:9px 12px;margin-bottom:14px;font-family:var(--font-mono);font-size:11px;
        color:var(--compass-amber);line-height:1.6">
        Created via ${entry.source_type === 'step_comment' ? 'Cadence' : 'import'} — edit in source system.
      </div>` : ''}
      <div style="display:grid;grid-template-columns:80px 1fr;gap:10px;margin-bottom:14px">
        <div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);
            letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px">Hours</div>
          <input id="te-hours" type="number" min="0.25" max="24" step="0.25"
            value="${parseFloat(entry.hours).toFixed(2)}" ${roAttr}
            style="width:100%;font-family:var(--font-mono);font-size:16px;font-weight:600;
              padding:7px 8px;background:var(--bg2);text-align:center;
              border:1px solid rgba(0,210,255,.3);color:var(--compass-cyan);
              outline:none;box-sizing:border-box;${roStyle}" />
        </div>
        <div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);
            letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px">Notes</div>
          <textarea id="te-notes" rows="3" ${roAttr}
            style="width:100%;font-family:var(--font-ui);font-size:12px;padding:7px 8px;
              background:var(--bg2);border:1px solid rgba(0,210,255,.15);color:var(--text1);
              outline:none;resize:vertical;min-height:60px;box-sizing:border-box;${roStyle}"
            placeholder="What did you work on?">${esc(entry.notes || '')}</textarea>
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;cursor:${isDirect ? 'pointer' : 'default'};margin-bottom:14px">
        <input id="te-billable" type="checkbox" ${billChk} ${disAttr}
          style="accent-color:var(--compass-cyan);width:14px;height:14px" />
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--text3);
          letter-spacing:.08em;text-transform:uppercase">Billable</span>
      </label>
    </div>

    <div style="padding:10px 16px;border-top:1px solid var(--border);
      display:flex;gap:8px;align-items:center;flex-shrink:0">
      ${isDirect ? `
      <button id="te-del-btn"
        style="font-family:var(--font-mono);font-size:11px;padding:6px 12px;background:none;
          border:1px solid rgba(226,75,74,.35);color:var(--compass-red);cursor:pointer"
        onmouseenter="this.style.background='rgba(226,75,74,.1)'"
        onmouseleave="this.style.background='none'">Delete</button>` : ''}
      <div style="flex:1"></div>
      <div class="te-week-link" style="font-family:var(--font-mono);font-size:11px;
        color:var(--compass-cyan);cursor:pointer;text-decoration:underline;
        text-underline-offset:2px">
        ↗ Week (${weekTotal.toFixed(1)}h)
      </div>
      ${isDirect ? `
      <button id="te-save-btn"
        style="font-family:var(--font-mono);font-size:11px;font-weight:600;padding:6px 18px;
          background:var(--compass-cyan);color:#060a10;border:none;cursor:pointer"
        onmouseenter="this.style.opacity='.85'" onmouseleave="this.style.opacity='1'">Save →</button>` :
      `<button onclick="document.getElementById('te-edit-drawer').remove();_teSelected=null;"
        style="font-family:var(--font-mono);font-size:11px;padding:6px 16px;background:none;
          border:1px solid var(--border);color:var(--text3);cursor:pointer">Close</button>`}
    </div>
  `;

  document.body.appendChild(drawer);

  drawer.querySelector('#te-save-btn')?.addEventListener('click', async () => {
    const hours = parseFloat(drawer.querySelector('#te-hours')?.value);
    const notes = drawer.querySelector('#te-notes')?.value?.trim() || null;
    const bill  = drawer.querySelector('#te-billable')?.checked ?? true;
    if (!hours || hours <= 0) { compassToast('Hours must be > 0', 2000); return; }
    const btn = drawer.querySelector('#te-save-btn');
    btn.textContent = '…'; btn.disabled = true;
    try {
      await API.patch('time_entries?id=eq.'+entry.id, { hours, notes, is_billable: bill, updated_at: new Date().toISOString() });
      compassToast('Saved'); drawer.remove(); _teSelected = null;
      _viewLoaded['user'] = false; _mwLoadUserView();
    } catch(e) { btn.textContent = 'Save →'; btn.disabled = false; compassToast('Failed', 2000); }
  });

  drawer.querySelector('#te-del-btn')?.addEventListener('click', async () => {
    if (!confirm('Delete this entry?')) return;
    try {
      await API.del('time_entries?id=eq.'+entry.id);
      compassToast('Deleted'); drawer.remove(); _teSelected = null;
      _viewLoaded['user'] = false; _mwLoadUserView();
    } catch(e) { compassToast('Failed', 2000); }
  });

  drawer.querySelector('.te-week-link')?.addEventListener('click', () => {
    drawer.remove(); _teSelected = null;
    openWeeklyTimesheet(entry);
  });

  setTimeout(() => {
    document.addEventListener('mousedown', function closeTES(ev) {
      if (!drawer.contains(ev.target)) {
        drawer.remove(); _teSelected = null;
        document.querySelectorAll('.te-row').forEach(r => { r.style.borderLeft='2px solid transparent'; r.style.background=''; });
        document.removeEventListener('mousedown', closeTES);
      }
    });
  }, 50);
}

function openWeeklyTimesheet(entry) {
  document.getElementById('te-edit-drawer')?.remove();

  const weekEntries = _teEntries.filter(e =>
    entry.week_start_date ? e.week_start_date === entry.week_start_date
      : e.date?.slice(0,7) === entry.date?.slice(0,7)
  ).sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const weekTotal = weekEntries.reduce((s,e) => s + parseFloat(e.hours||0), 0);
  const weekLabel = (() => {
    if (!entry.week_start_date) return fmtDate(entry.date);
    const ws = new Date(entry.week_start_date+'T00:00:00');
    return ws.toLocaleDateString('en-US',{month:'short',day:'numeric'})
      + ' – ' + new Date(ws.getTime()+6*86400000).toLocaleDateString('en-US',{month:'short',day:'numeric'});
  })();

  const drawer = document.createElement('div');
  drawer.id = 'te-edit-drawer';
  drawer.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:460px;z-index:600;background:var(--bg1,#0c1628);border-left:1px solid var(--border,rgba(0,210,255,.12));box-shadow:-8px 0 32px rgba(0,0,0,.5);display:flex;flex-direction:column;animation:te-slide-in .2s ease;';

  const rowHtml = weekEntries.map(e => {
    const proj    = _projects.find(p => p.id === e.project_id);
    const isDirect = e.source_type === 'direct';
    const srcIcon  = e.source_type === 'step_comment' ? '◈' : '●';
    const srcColor = e.source_type === 'step_comment' ? 'var(--compass-cyan)' : 'var(--text3)';
    const dayName  = new Date(e.date+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',day:'numeric',month:'short'});
    return `<div style="border-bottom:1px solid var(--border);padding:9px 16px">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:6px">
        <span style="font-size:11px;color:${srcColor};flex-shrink:0">${srcIcon}</span>
        <span style="font-family:var(--font-mono);font-size:11px;font-weight:600;color:var(--text0);flex-shrink:0">${dayName}</span>
        <span style="font-family:var(--font-ui);font-size:11px;color:var(--text2);
          flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${esc(e.step_name || proj?.name || '—')}</span>
        ${isDirect ? `<button data-del="${e.id}"
          style="background:none;border:none;color:rgba(226,75,74,.4);font-size:12px;
            cursor:pointer;padding:0;line-height:1;flex-shrink:0"
          onmouseenter="this.style.color='var(--compass-red)'"
          onmouseleave="this.style.color='rgba(226,75,74,.4)'">✕</button>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:68px 1fr 24px 48px;gap:6px;align-items:center">
        <input type="number" min="0.25" max="24" step="0.25"
          value="${parseFloat(e.hours).toFixed(2)}" ${!isDirect ? 'readonly' : ''}
          data-id="${e.id}" data-f="hours"
          style="font-family:var(--font-mono);font-size:13px;font-weight:600;padding:5px 6px;
            background:var(--bg2);text-align:center;
            border:1px solid var(--border);color:${e.is_billable ? 'var(--compass-cyan)' : 'var(--text2)'};
            outline:none;width:100%;box-sizing:border-box;${!isDirect ? 'opacity:.5;cursor:not-allowed' : ''}"/>
        <input type="text" value="${esc(e.notes||'')}" ${!isDirect ? 'readonly' : ''}
          data-id="${e.id}" data-f="notes" placeholder="${isDirect ? 'Notes…' : '—'}"
          style="font-family:var(--font-ui);font-size:11px;padding:5px 7px;
            background:var(--bg2);border:1px solid var(--border);color:var(--text1);
            outline:none;width:100%;box-sizing:border-box;${!isDirect ? 'opacity:.5;cursor:not-allowed' : ''}"/>
        <label style="display:flex;justify-content:center;cursor:${isDirect ? 'pointer' : 'default'}">
          <input type="checkbox" ${e.is_billable ? 'checked' : ''} ${!isDirect ? 'disabled' : ''}
            data-id="${e.id}" data-f="billable"
            style="accent-color:var(--compass-cyan);width:13px;height:13px"/>
        </label>
        ${isDirect
          ? `<button data-save="${e.id}"
              style="font-family:var(--font-mono);font-size:11px;font-weight:600;padding:5px 0;
                background:var(--compass-cyan);color:#060a10;border:none;cursor:pointer;width:100%"
              onmouseenter="this.style.opacity='.85'" onmouseleave="this.style.opacity='1'">Save</button>`
          : `<span style="font-family:var(--font-mono);font-size:11px;color:var(--text3);text-align:center">${srcIcon}</span>`}
      </div>
    </div>`;
  }).join('');

  drawer.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;
      padding:14px 16px 10px;border-bottom:1px solid var(--border);flex-shrink:0">
      <div>
        <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:.1em;
          text-transform:uppercase;color:var(--compass-cyan);margin-bottom:2px">Timesheet</div>
        <div style="font-family:var(--font-ui);font-size:13px;font-weight:500;color:var(--text0)">
          Week of ${weekLabel}</div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-top:2px">
          ${weekEntries.length} ${weekEntries.length === 1 ? 'entry' : 'entries'} ·
          <span style="color:var(--compass-cyan);font-weight:600">${weekTotal.toFixed(1)}h</span>
        </div>
      </div>
      <button onclick="document.getElementById('te-edit-drawer').remove()"
        style="background:none;border:none;color:var(--text3);font-size:18px;cursor:pointer;padding:0;line-height:1"
        onmouseenter="this.style.color='var(--text0)'" onmouseleave="this.style.color='var(--text3)'">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:68px 1fr 24px 48px;gap:6px;
      padding:5px 16px;border-bottom:1px solid var(--border);flex-shrink:0;
      font-family:var(--font-mono);font-size:11px;color:var(--text3);
      letter-spacing:.07em;text-transform:uppercase">
      <span>Hours</span><span>Notes</span>
      <span style="text-align:center">Bill</span><span></span>
    </div>
    <div style="flex:1;overflow-y:auto">
      ${rowHtml || '<div style="padding:20px 16px;font-family:var(--font-mono);font-size:11px;color:var(--text3)">No entries this week</div>'}
    </div>
    <div style="padding:10px 16px;border-top:1px solid var(--border);
      display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <button class="te-new-btn"
        style="font-family:var(--font-mono);font-size:11px;font-weight:600;letter-spacing:.06em;
          color:var(--compass-cyan);background:none;border:1px solid rgba(0,210,255,.25);
          padding:5px 12px;cursor:pointer"
        onmouseenter="this.style.background='rgba(0,210,255,.08)'"
        onmouseleave="this.style.background='none'">+ Log time</button>
      <button onclick="document.getElementById('te-edit-drawer').remove()"
        style="font-family:var(--font-mono);font-size:11px;padding:5px 14px;background:none;
          border:1px solid var(--border);color:var(--text3);cursor:pointer">Close</button>
    </div>`;

  document.body.appendChild(drawer);

  drawer.addEventListener('click', async ev => {
    const saveBtn = ev.target.closest('[data-save]');
    if (saveBtn) {
      const id    = saveBtn.dataset.save;
      const hours = parseFloat(drawer.querySelector('[data-id="'+id+'"][data-f="hours"]')?.value);
      const notes = drawer.querySelector('[data-id="'+id+'"][data-f="notes"]')?.value?.trim() || null;
      const bill  = drawer.querySelector('[data-id="'+id+'"][data-f="billable"]')?.checked ?? true;
      if (!hours || hours <= 0) { compassToast('Hours must be > 0', 2000); return; }
      saveBtn.textContent = '…'; saveBtn.disabled = true;
      try {
        await API.patch('time_entries?id=eq.'+id, { hours, notes, is_billable: bill, updated_at: new Date().toISOString() });
        compassToast('Saved'); _viewLoaded['user'] = false; drawer.remove(); _mwLoadUserView();
      } catch(e) { saveBtn.textContent = 'Save'; saveBtn.disabled = false; compassToast('Failed', 2000); }
    }
    const delBtn = ev.target.closest('[data-del]');
    if (delBtn) {
      if (!confirm('Delete this entry?')) return;
      try {
        await API.del('time_entries?id=eq.'+delBtn.dataset.del);
        compassToast('Deleted'); _viewLoaded['user'] = false; drawer.remove(); _mwLoadUserView();
      } catch(e) { compassToast('Failed', 2000); }
    }
  });

  setTimeout(() => {
    document.addEventListener('mousedown', function closeTEW(ev) {
      if (!drawer.contains(ev.target)) { drawer.remove(); document.removeEventListener('mousedown', closeTEW); }
    });
  }, 50);
}

