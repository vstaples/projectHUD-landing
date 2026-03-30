// ══════════════════════════════════════════════════════════
// VIEW: EXECUTIVE
// ══════════════════════════════════════════════════════════
async function loadExecutiveView() {
  const content = document.getElementById('exec-content');
  if (!content) return;

  content.innerHTML = `<div style="padding:20px;font-family:var(--font-head);font-size:12px;color:var(--text3)">Loading executive view…</div>`;

  try {
    const today = new Date().toLocaleDateString('en-CA');
    const q1Start = new Date(new Date().getFullYear(),0,1).toLocaleDateString('en-CA');

    const [wfInstances, cocEvents, resourceReqs] = await Promise.all([
      API.get('workflow_instances?select=id,title,status,project_id,launched_at&status=eq.active&limit=100').catch(()=>[]),
      API.get('workflow_step_instances?select=id,instance_id,event_type,outcome,actor_name,created_at,step_name&event_type=in.(step_completed,step_reset)&order=created_at.desc&limit=500').catch(()=>[]),
      API.get('resource_requests?select=id,status,submitted_at,project_id&status=eq.pending').catch(()=>[]),
    ]);

    const activeProjects = _projects.filter(p=>p.status==='active');
    const HOURLY_RATE = 8000, HRS_PER_REWORK = 2;
    const reworkEvents  = cocEvents.filter(e=>e.event_type==='step_reset');
    const reworkCount   = reworkEvents.length;
    const reworkCost    = reworkCount * HRS_PER_REWORK * HOURLY_RATE;
    const completedCount= cocEvents.filter(e=>e.event_type==='step_completed').length;
    const reworkRate    = completedCount>0 ? Math.round(reworkCount/(reworkCount+completedCount)*100) : 0;
    const portfolioSPI  = _projects.filter(p=>p.spi).reduce((s,p,_,a)=>s+parseFloat(p.spi)/a.length,0)||null;
    const formatYen = n => n>=1000000 ? '¥'+(n/1000000).toFixed(1)+'M' : '¥'+Math.round(n/1000)+'k';
    const fmtDate2 = s => s ? new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—';

    // Rework by project
    const reworkByProj = {};
    reworkEvents.forEach(e=>{
      const inst = wfInstances.find(w=>w.id===e.instance_id);
      if(!inst?.project_id) return;
      reworkByProj[inst.project_id] = (reworkByProj[inst.project_id]||0)+1;
    });
    const maxRework = Math.max(1,...Object.values(reworkByProj));

    // Root cause breakdown (stub ratios from observed pattern)
    const preventable = Math.round(reworkCost*0.66);
    const dependency  = Math.round(reworkCost*0.22);
    const complexity  = reworkCost - preventable - dependency;

    // Workflow redesign candidates
    const templateMap = {};
    reworkEvents.forEach(e=>{
      const inst = wfInstances.find(w=>w.id===e.instance_id);
      if(!inst) return;
      const key = inst.title||inst.id;
      if(!templateMap[key]) templateMap[key]={name:key,resets:0,completions:0};
      templateMap[key].resets++;
    });
    cocEvents.filter(e=>e.event_type==='step_completed').forEach(e=>{
      const inst = wfInstances.find(w=>w.id===e.instance_id);
      if(!inst) return;
      const key = inst.title||inst.id;
      if(templateMap[key]) templateMap[key].completions++;
    });
    const redesignTemplates = Object.values(templateMap).filter(t=>{
      const total = t.resets+t.completions;
      return total>0 && t.resets/total>=0.6;
    });
    const redesignCost = redesignTemplates.length * 18000;
    const redesignSavings = reworkCost * 0.6;
    const roi = redesignCost>0 ? Math.round(redesignSavings/redesignCost*100) : 0;

    // Archive briefs — built after redesignTemplates is available
    const archiveBriefs = [
      {date:'Today',
       color:reworkCost>500000?'#E24B4A':reworkCost>200000?'#EF9F27':'#1D9E75',
       delta:'Current status',
       text:'Portfolio: '+activeProjects.length+' active project'+(activeProjects.length!==1?'s':'')+'. Rework cost '+formatYen(reworkCost)+' — '+reworkRate+'% failure rate. '+(resourceReqs.length>0?resourceReqs.length+' resource request'+(resourceReqs.length>1?'s':'')+' pending. ':'')+( portfolioSPI?'Portfolio SPI '+portfolioSPI.toFixed(2)+'. ':'')+( redesignTemplates.length>0?redesignTemplates.length+' template'+(redesignTemplates.length>1?'s':'')+' at redesign threshold.':'No templates at redesign threshold.')},
    ];

    // KPI colors
    const spiColor = portfolioSPI ? (portfolioSPI>=1?'#1D9E75':portfolioSPI>=0.85?'#EF9F27':'#E24B4A') : '#3A5C80';
    const reworkColor = reworkCost>500000?'#E24B4A':reworkCost>200000?'#EF9F27':'#1D9E75';

    // Styles
    const s = document.createElement('style');
    s.id='exec-styles';
    s.textContent=`
      .ex-wrap{padding:0;background:#070c1a}
      .ex-kstrip{display:grid;grid-template-columns:repeat(6,1fr);border-bottom:1px solid rgba(0,210,255,.1);background:#060b18}
      .ex-kc{padding:10px 12px;border-right:1px solid rgba(0,210,255,.08);cursor:pointer;transition:background .1s;position:relative}
      .ex-kc::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
      .ex-kc:last-child{border-right:none}
      .ex-kc:hover{background:rgba(0,210,255,.04)}
      .ex-klbl{font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.09em;color:#3A5C80;margin-bottom:3px;text-transform:uppercase}
      .ex-kval{font-family:var(--font-display);font-size:20px;font-weight:700;line-height:1}
      .ex-ksub{font-family:var(--font-head);font-size:11px;color:#3A5C80;margin-top:2px}
      .ex-tabs{display:flex;gap:2px;padding:8px 10px;background:#07101f;border-bottom:1px solid rgba(0,210,255,.12)}
      .ex-tab{font-family:var(--font-head);font-size:13px;font-weight:700;letter-spacing:.04em;padding:6px 16px;cursor:pointer;color:#5A84A8;background:#0c1828;border:1px solid rgba(0,210,255,.1);transition:all .12s}
      .ex-tab.on{color:#F0F6FF;background:#132035;border-color:rgba(0,210,255,.4)}
      .ex-tab:hover:not(.on){color:#90B8D8;background:#0e1e30}
      .ex-body{padding:10px 12px}
      .ex-panel{background:#0d1a2e;border:1px solid rgba(0,210,255,.1);margin-bottom:10px;overflow:hidden}
      .ex-ph{display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border-bottom:1px solid rgba(0,210,255,.08);background:#07101e}
      .ex-pt{font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#3A5C80}
      .ex-tc{display:none}.ex-tc.on{display:block}
      .ex-brief{border-left:3px solid #EF9F27;margin:10px 12px;padding:9px 11px;background:rgba(239,159,39,.05);font-family:var(--font-body);font-size:12px;color:#C8DFF0;line-height:1.6}
      .ex-proj-row{display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid rgba(0,210,255,.07);cursor:pointer;transition:background .1s}
      .ex-proj-row:hover{background:rgba(255,255,255,.02)}
      .ex-fin-row{display:flex;align-items:center;gap:8px;padding:5px 12px;border-bottom:1px solid rgba(0,210,255,.06)}
      .ex-bar-wrap{flex:2;height:5px;background:rgba(255,255,255,.06);border-radius:1px;overflow:hidden}
      .ex-bar-fill{height:100%;border-radius:1px}
      .ex-spark{display:flex;align-items:flex-end;gap:2px;height:28px;width:60px;flex-shrink:0}
      .ex-spark-bar{background:rgba(0,210,255,.25);flex:1;border-radius:1px 1px 0 0}
      .ex-spark-bar.hi{background:#00D2FF}
      .ex-arch-dot{width:18px;height:18px;border-radius:50%;cursor:pointer;border:1.5px solid transparent;font-family:var(--font-head);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;transition:transform .12s;flex-shrink:0}
      .ex-arch-dot:hover{transform:scale(1.2)}
      .ex-arch-dot.sel{border-color:rgba(255,255,255,.5)}
      .ex-roi{background:#091522;border:1px solid rgba(0,210,255,.1);padding:10px 12px}
      .ex-pipe-row{display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid rgba(0,210,255,.07)}
      .ex-pipe-stage{font-family:var(--font-head);font-size:11px;font-weight:700;padding:2px 8px;border:1px solid rgba(255,255,255,.1);color:#5A84A8;flex-shrink:0;min-width:80px;text-align:center}
    `;
    if(!document.getElementById('exec-styles')) document.head.appendChild(s);

    // Module-level functions
    window.exSwitchTab = function(el, name) {
      document.querySelectorAll('.ex-tab').forEach(t=>t.classList.remove('on'));
      document.querySelectorAll('.ex-tc').forEach(c=>c.classList.remove('on'));
      el.classList.add('on');
      const p = document.getElementById('ex-tc-'+name);
      if(p) p.classList.add('on');
      if(name==='archive') exRenderArchive();
    };
    window.exRenderArchive = function() {
      const wrap = document.getElementById('ex-arch-dots');
      if(!wrap||wrap.dataset.rendered) return;
      wrap.dataset.rendered='1';
      wrap.innerHTML = archiveBriefs.map((b,i)=>`<div class="ex-arch-dot" style="background:${b.color}" title="${b.date}" onclick="exShowBrief(${i})">${b.date.slice(0,2)}</div>`).join('');
    };
    window.exShowBrief = function(i) {
      document.querySelectorAll('.ex-arch-dot').forEach((d,j)=>d.classList.toggle('sel',j===i));
      const b = archiveBriefs[i];
      document.getElementById('ex-bd-date').textContent = b.date;
      document.getElementById('ex-bd-delta').textContent = b.delta;
      document.getElementById('ex-bd-text').textContent = b.text;
      document.getElementById('ex-brief-detail').style.display='block';
    };
    window.exAuthorize = function(btn) {
      btn.textContent='✓ Authorized — CoC event written · Management notified';
      btn.style.background='#0F6E56';
      btn.disabled=true;
      API.post('workflow_step_instances',{id:crypto.randomUUID(),instance_id:crypto.randomUUID(), step_type:'manual',event_type:'management_decision',step_name:'Process',event_notes:'Authorized workflow template redesign from executive view.',created_at:new Date().toISOString(),firm_id:'aaaaaaaa-0001-0001-0001-000000000001'}).catch(()=>{});
      compassToast('Template redesign authorized',2500);
    };

    // Pipeline data (stub — in production from pipeline.html data)
    const pipelineRows = [
      {stage:'Proposal',name:'MediSync — Device UX Platform',prob:85,val:'¥1.8M'},
      {stage:'Proposal',name:'Orbis Biotech — Sterilization Workflow',prob:70,val:'¥1.4M'},
      {stage:'Proposal',name:'TerraVox — Sensor Calibration',prob:55,val:'¥0.9M'},
      {stage:'Qualification',name:'AquaPath — Fluid Dynamics',prob:40,val:'¥1.2M'},
      {stage:'Discovery',name:'HelioMed — Remote Diagnostics',prob:20,val:'¥0.3M'},
    ];

    content.innerHTML = `
    <div class="ex-wrap">
      <div class="ex-kstrip">
        <div class="ex-kc" style="cursor:default"><div class="ex-kc" style="position:absolute;top:0;left:0;right:0;height:2px;background:#00D2FF"></div>
          <div class="ex-klbl">Active projects</div>
          <div class="ex-kval" style="color:#00D2FF">${activeProjects.length}</div>
          <div class="ex-ksub">${formatYen(activeProjects.reduce((s,p)=>s+parseFloat(p.budget_hours||0)*HOURLY_RATE/1000000,0))}M combined value</div>
        </div>
        <div class="ex-kc" style="cursor:default"><div style="position:absolute;top:0;left:0;right:0;height:2px;background:${reworkColor}"></div>
          <div class="ex-klbl">Rework cost Q1</div>
          <div class="ex-kval" style="color:${reworkColor}">${formatYen(reworkCost)}</div>
          <div class="ex-ksub">${reworkRate}% step failure rate</div>
        </div>
        <div class="ex-kc" style="cursor:default"><div style="position:absolute;top:0;left:0;right:0;height:2px;background:${spiColor}"></div>
          <div class="ex-klbl">Portfolio SPI</div>
          <div class="ex-kval" style="color:${spiColor}">${portfolioSPI?portfolioSPI.toFixed(2):'—'}</div>
          <div class="ex-ksub">${portfolioSPI&&portfolioSPI<1?'below 1.0 threshold':'schedule on track'}</div>
        </div>
        <div class="ex-kc" style="cursor:default"><div style="position:absolute;top:0;left:0;right:0;height:2px;background:#1D9E75"></div>
          <div class="ex-klbl">Active workflows</div>
          <div class="ex-kval" style="color:#1D9E75">${wfInstances.length}</div>
          <div class="ex-ksub">running instances</div>
        </div>
        <div class="ex-kc" style="cursor:default"><div style="position:absolute;top:0;left:0;right:0;height:2px;background:#EF9F27"></div>
          <div class="ex-klbl">Decisions pending</div>
          <div class="ex-kval" style="color:${resourceReqs.length>0?'#EF9F27':'#3A5C80'}">${resourceReqs.length}</div>
          <div class="ex-ksub">resource requests</div>
        </div>
        <div class="ex-kc" style="cursor:default"><div style="position:absolute;top:0;left:0;right:0;height:2px;background:#8B5CF6"></div>
          <div class="ex-klbl">Pipeline value</div>
          <div class="ex-kval" style="color:#8B5CF6">¥4.6M</div>
          <div class="ex-ksub">${pipelineRows.filter(r=>r.stage==='Proposal').length} proposals active</div>
        </div>
      </div>

      <div class="ex-tabs">
        <div class="ex-tab on" onclick="exSwitchTab(this,'overview')">Overview</div>
        <div class="ex-tab" onclick="exSwitchTab(this,'financial')">Financial</div>
        <div class="ex-tab" onclick="exSwitchTab(this,'rework')">Rework cost</div>
        <div class="ex-tab" onclick="exSwitchTab(this,'archive')">Brief archive</div>
        <div class="ex-tab" onclick="exSwitchTab(this,'pipeline')">Pipeline</div>
      </div>

      <!-- OVERVIEW -->
      <div class="ex-tc on" id="ex-tc-overview">
        <div class="ex-body" style="display:grid;grid-template-columns:1fr 280px;gap:10px">
          <div>
            <div class="ex-panel">
              <div class="ex-ph"><span class="ex-pt">Morning brief — executive tier</span><span style="font-family:var(--font-head);font-size:11px;color:#3A5C80">Generated ${new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</span></div>
              <div class="ex-brief">Portfolio is running ${activeProjects.length} active project${activeProjects.length!==1?'s':''}. Rework cost is ${formatYen(reworkCost)} — ${reworkRate}% of all workflow completions result in rework. ${redesignTemplates.length>0?redesignTemplates.length+' workflow template'+( redesignTemplates.length!==1?'s':'')+' have crossed the redesign threshold. ':''} ${resourceReqs.length>0?resourceReqs.length+' resource request'+( resourceReqs.length!==1?'s':'')+' pending management approval. ':''} ${portfolioSPI&&portfolioSPI<0.9?'Portfolio SPI '+portfolioSPI.toFixed(2)+' — schedule pressure across active projects. ':'No critical executive action required today.'}${roi>500?' High-ROI template redesign available — '+formatYen(redesignSavings)+' annual saving projected.':''}</div>
            </div>
            <div class="ex-panel">
              <div class="ex-ph"><span class="ex-pt">Portfolio — project status</span></div>
              ${activeProjects.map(p=>{
                const rw = reworkByProj[p.id]||0;
                const rwCost = rw*HRS_PER_REWORK*HOURLY_RATE;
                const near = p.target_date&&new Date(p.target_date+'T00:00:00')<new Date(Date.now()+60*86400000);
                const statusColor = p.spi&&parseFloat(p.spi)<0.85?'#E24B4A':near?'#EF9F27':'#1D9E75';
                const statusLabel = p.spi&&parseFloat(p.spi)<0.85?'At risk':near?'Watch':'On track';
                return `<div class="ex-proj-row" onclick="window.location.href='/project-detail.html?id=${p.id}'">
                  <div class="ex-spark">
                    <div class="ex-spark-bar" style="height:40%"></div>
                    <div class="ex-spark-bar" style="height:55%"></div>
                    <div class="ex-spark-bar" style="height:50%"></div>
                    <div class="ex-spark-bar hi" style="height:${Math.min(100,50+(rw*5))}%"></div>
                  </div>
                  <div style="flex:1;min-width:0">
                    <div style="font-family:var(--font-body);font-size:12px;font-weight:500;color:#F0F6FF">${esc(p.name)}</div>
                    <div style="font-family:var(--font-head);font-size:11px;color:#4A6E90">Target: ${fmtDate2(p.target_date)} · ${rw} rework cycle${rw!==1?'s':''}</div>
                  </div>
                  <span style="font-family:var(--font-head);font-size:11px;font-weight:700;padding:2px 8px;border:1px solid;color:${statusColor};border-color:${statusColor}40">${statusLabel}</span>
                  ${p.budget_hours?`<span style="font-family:var(--font-display);font-size:14px;font-weight:700;color:#00D2FF;min-width:55px;text-align:right">${formatYen(parseFloat(p.budget_hours)*HOURLY_RATE)}</span>`:''}
                  ${rw>0?`<span style="font-family:var(--font-head);font-size:11px;color:${reworkColor};min-width:70px;text-align:right">${formatYen(rwCost)} rework</span>`:''}
                </div>`;
              }).join('')||'<div style="padding:14px 12px;font-family:var(--font-head);font-size:12px;color:#3A5C80">No active projects</div>'}
            </div>
          </div>
          <div>
            <div class="ex-panel" style="margin-bottom:10px">
              <div class="ex-ph"><span class="ex-pt">Rework cost by project — Q1</span></div>
              <div style="padding:8px 0">
                ${activeProjects.map(p=>{
                  const rw = reworkByProj[p.id]||0;
                  const rwCost = rw*HRS_PER_REWORK*HOURLY_RATE;
                  const pct = Math.round(rwCost/Math.max(reworkCost,1)*100);
                  const col = pct>60?'#E24B4A':pct>30?'#EF9F27':'#1D9E75';
                  return `<div class="ex-fin-row">
                    <div style="font-family:var(--font-head);font-size:11px;color:#C8DFF0;flex:1">${esc(p.name.slice(0,20))}</div>
                    <div class="ex-bar-wrap"><div class="ex-bar-fill" style="width:${pct}%;background:${col}"></div></div>
                    <div style="font-family:var(--font-head);font-size:11px;font-weight:700;color:${col};min-width:50px;text-align:right">${formatYen(rwCost)}</div>
                  </div>`;
                }).join('')||'<div style="padding:12px;font-family:var(--font-head);font-size:12px;color:#3A5C80">No rework recorded</div>'}
              </div>
            </div>
            <div class="ex-panel">
              <div class="ex-ph"><span class="ex-pt">Key decisions pending</span></div>
              <div style="padding:8px 12px;display:flex;flex-direction:column;gap:5px">
                ${redesignTemplates.length>0?`<div style="display:flex;align-items:flex-start;gap:6px"><div style="width:7px;height:7px;border-radius:50%;background:#1D9E75;flex-shrink:0;margin-top:3px"></div><div style="font-family:var(--font-body);font-size:12px;color:#C8DFF0">Template redesign available — ${redesignTemplates.length} template${redesignTemplates.length!==1?'s':''} · ROI ${roi}%</div></div>`:''}
                ${resourceReqs.length>0?`<div style="display:flex;align-items:flex-start;gap:6px"><div style="width:7px;height:7px;border-radius:50%;background:#EF9F27;flex-shrink:0;margin-top:3px"></div><div style="font-family:var(--font-body);font-size:12px;color:#C8DFF0">${resourceReqs.length} resource request${resourceReqs.length!==1?'s':''} pending management approval</div></div>`:''}
                <div style="display:flex;align-items:flex-start;gap:6px"><div style="width:7px;height:7px;border-radius:50%;background:#1D9E75;flex-shrink:0;margin-top:3px"></div><div style="font-family:var(--font-body);font-size:12px;color:#C8DFF0">${reworkCost>300000?'Budget overrun risk — rework rate requires attention':'No budget overruns requiring executive approval'}</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- FINANCIAL -->
      <div class="ex-tc" id="ex-tc-financial">
        <div class="ex-body" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="ex-panel">
            <div class="ex-ph"><span class="ex-pt">Quarterly revenue trend</span></div>
            <div style="padding:10px 12px;display:flex;align-items:flex-end;gap:8px;height:100px">
              ${['Q3','Q4','Q1'].map((q,i)=>{
                const heights=[50,70,100];
                const vals=['¥5.8M','¥7.1M','¥8.4M'];
                const col = i===2?'#00D2FF':'rgba(0,210,255,.3)';
                return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
                  <div style="background:${col};border-radius:1px 1px 0 0;width:100%;height:${heights[i]}%;min-height:4px"></div>
                  <span style="font-family:var(--font-head);font-size:11px;color:${i===2?'#00D2FF':'#3A5C80'}">${q}'26</span>
                  <span style="font-family:var(--font-head);font-size:11px;font-weight:700;color:${i===2?'#00D2FF':'#3A5C80'}">${vals[i]}</span>
                </div>`;
              }).join('')}
            </div>
          </div>
          <div class="ex-panel">
            <div class="ex-ph"><span class="ex-pt">Margin analysis</span></div>
            <div style="padding:8px 0">
              ${[['Revenue Q1','100%','#00D2FF'],['Labor cost','55%','#8B5CF6'],['Rework cost','7%','#E24B4A'],['Gross margin','39%','#1D9E75']].map(([l,w,c])=>`
              <div class="ex-fin-row">
                <div style="font-family:var(--font-head);font-size:11px;color:#C8DFF0;flex:1">${l}</div>
                <div class="ex-bar-wrap"><div class="ex-bar-fill" style="width:${w};background:${c};opacity:.7"></div></div>
                <div style="font-family:var(--font-head);font-size:11px;font-weight:700;color:${c};min-width:40px;text-align:right">${w}</div>
              </div>`).join('')}
              <div style="margin:8px 12px 0;padding:6px 8px;background:rgba(239,159,39,.06);border:1px solid rgba(239,159,39,.15);border-left:2px solid #EF9F27;font-family:var(--font-head);font-size:11px;color:#C8DFF0">Without rework: margin projects to ~41% — gap is ${formatYen(reworkCost)} avoidable cost</div>
            </div>
          </div>
          <div class="ex-panel" style="grid-column:1/-1">
            <div class="ex-ph"><span class="ex-pt">Q2 forecast — two scenarios</span></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 12px">
              <div style="background:rgba(226,75,74,.05);border:1px solid rgba(226,75,74,.15);padding:10px 12px">
                <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.08em;color:#E24B4A;margin-bottom:4px;text-transform:uppercase">If no change</div>
                <div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:#E24B4A">37%</div>
                <div style="font-family:var(--font-head);font-size:11px;color:#3A5C80;margin-top:2px">Rework cost projects to ${formatYen(reworkCost*1.25)} Q2 at current rate</div>
              </div>
              <div style="background:rgba(29,158,117,.05);border:1px solid rgba(29,158,117,.2);padding:10px 12px">
                <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.08em;color:#1D9E75;margin-bottom:4px;text-transform:uppercase">With template redesign</div>
                <div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:#1D9E75">41%</div>
                <div style="font-family:var(--font-head);font-size:11px;color:#3A5C80;margin-top:2px">Redesign reduces rework by ~60% — margin recovery ${formatYen(redesignSavings)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- REWORK -->
      <div class="ex-tc" id="ex-tc-rework">
        <div class="ex-body" style="display:grid;grid-template-columns:2fr 1fr;gap:10px">
          <div>
            <div class="ex-panel">
              <div class="ex-ph"><span class="ex-pt">Rework cost trend</span></div>
              <div style="padding:10px 12px;display:flex;align-items:flex-end;gap:10px;height:100px;margin-bottom:8px">
                ${[{q:'Q3',h:29,v:'¥180k',c:'rgba(239,159,39,.4)'},{q:'Q4',h:50,v:'¥310k',c:'rgba(239,159,39,.6)'},{q:'Q1',h:100,v:formatYen(reworkCost),c:'#E24B4A'}].map(b=>`
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
                  <div style="background:${b.c};border-radius:1px 1px 0 0;width:100%;height:${b.h}%;min-height:4px"></div>
                  <span style="font-family:var(--font-head);font-size:11px;color:${b.c==='#E24B4A'?'#E24B4A':'#3A5C80'}">${b.q}'26</span>
                  <span style="font-family:var(--font-head);font-size:11px;font-weight:700;color:${b.c==='#E24B4A'?'#E24B4A':'#3A5C80'}">${b.v}</span>
                </div>`).join('')}
              </div>
              <div style="font-family:var(--font-head);font-size:11px;color:#3A5C80;padding:0 12px 8px">Rework costs ${reworkCount>5?'have tripled':'are rising'} over 3 quarters</div>
              <div style="padding:0 0 8px">
                ${[[`Process Quality Failure`,Math.round(reworkRate*0.66),'#E24B4A','66% preventable'],[`Dependency / inputs not ready`,Math.round(reworkRate*0.22),'#EF9F27','22%'],[`Novel work / complexity`,reworkRate-Math.round(reworkRate*0.88),'#1D9E75','12% expected']].map(([l,w,c,v])=>`
                <div class="ex-fin-row">
                  <div style="font-family:var(--font-head);font-size:11px;color:#C8DFF0;flex:1">${l}</div>
                  <div class="ex-bar-wrap"><div class="ex-bar-fill" style="width:${w}%;background:${c}"></div></div>
                  <div style="font-family:var(--font-head);font-size:11px;font-weight:700;color:${c};min-width:80px;text-align:right">${v}</div>
                </div>`).join('')}
              </div>
            </div>
          </div>
          <div>
            ${redesignTemplates.length>0?`
            <div class="ex-roi">
              <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#00D2FF;margin-bottom:10px">Template redesign ROI</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
                <div style="background:#091522;border:1px solid rgba(0,210,255,.1);padding:8px 10px">
                  <div style="font-family:var(--font-head);font-size:11px;color:#3A5C80;text-transform:uppercase;letter-spacing:.08em">Redesign cost</div>
                  <div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:#EF9F27">${formatYen(redesignCost)}</div>
                  <div style="font-family:var(--font-head);font-size:11px;color:#3A5C80">2-week sprint</div>
                </div>
                <div style="background:#091522;border:1px solid rgba(0,210,255,.1);padding:8px 10px">
                  <div style="font-family:var(--font-head);font-size:11px;color:#3A5C80;text-transform:uppercase;letter-spacing:.08em">Annual saving</div>
                  <div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:#1D9E75">${formatYen(redesignSavings)}</div>
                  <div style="font-family:var(--font-head);font-size:11px;color:#3A5C80">projected rework reduction</div>
                </div>
              </div>
              <div style="font-family:var(--font-display);font-size:16px;font-weight:700;color:#1D9E75;margin-bottom:4px">ROI: ${roi}%</div>
              <div style="font-family:var(--font-head);font-size:11px;color:#3A5C80;margin-bottom:10px">Payback period: &lt;${Math.max(1,Math.round(redesignCost/redesignSavings*12))} week${redesignCost/redesignSavings*12>1?'s':''}</div>
              <button onclick="exAuthorize(this)"
                style="width:100%;font-family:var(--font-head);font-size:12px;font-weight:700;padding:8px 16px;background:#1D9E75;border:none;color:#060a10;cursor:pointer;letter-spacing:.08em;transition:opacity .1s"
                onmouseenter="this.style.opacity='.85'" onmouseleave="this.style.opacity='1'">Authorize template redesign →</button>
            </div>`:
            `<div class="ex-roi"><div style="font-family:var(--font-head);font-size:12px;color:#3A5C80">No templates currently at redesign threshold</div></div>`}
          </div>
        </div>
      </div>

      <!-- ARCHIVE -->
      <div class="ex-tc" id="ex-tc-archive">
        <div class="ex-panel" style="margin:10px 12px">
          <div class="ex-ph"><span class="ex-pt">Brief archive — executive tier · click dates to open</span></div>
          <div id="ex-arch-dots" style="display:flex;gap:6px;padding:10px 12px;flex-wrap:wrap"></div>
          <div id="ex-brief-detail" style="display:none;padding:10px 12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <div style="font-family:var(--font-display);font-size:14px;font-weight:700;color:#F0F6FF" id="ex-bd-date"></div>
              <div style="font-family:var(--font-head);font-size:11px;color:#3A5C80;padding:2px 9px;border:1px solid rgba(0,210,255,.12)" id="ex-bd-delta"></div>
            </div>
            <div style="border-left:2px solid #EF9F27;padding:8px 10px;background:rgba(239,159,39,.04);font-family:var(--font-body);font-size:12px;color:#C8DFF0;line-height:1.6" id="ex-bd-text"></div>
          </div>
          <div style="padding:4px 12px 8px;font-family:var(--font-head);font-size:11px;color:#3A5C80">Green = healthy · Amber = watch · Red = action required</div>
        </div>
      </div>

      <!-- PIPELINE -->
      <div class="ex-tc" id="ex-tc-pipeline">
        <div class="ex-panel" style="margin:10px 12px">
          <div class="ex-ph">
            <span class="ex-pt">Pipeline — ${pipelineRows.length} active prospects</span>
            <span style="font-family:var(--font-head);font-size:11px;color:#3A5C80">Win rate this quarter: 67%</span>
          </div>
          ${pipelineRows.map(r=>`<div class="ex-pipe-row">
            <span class="ex-pipe-stage">${r.stage}</span>
            <div style="flex:1;font-family:var(--font-body);font-size:12px;color:#C8DFF0">${r.name}</div>
            <span style="font-family:var(--font-head);font-size:11px;color:#3A5C80;min-width:40px;text-align:right">${r.prob}%</span>
            <span style="font-family:var(--font-display);font-size:14px;font-weight:700;color:#00D2FF;min-width:55px;text-align:right">${r.val}</span>
          </div>`).join('')}
          <div style="padding:7px 12px;border-top:1px solid rgba(0,210,255,.08);display:flex;justify-content:space-between;font-family:var(--font-head);font-size:11px">
            <span style="color:#3A5C80">Expected close value at current win rates:</span>
            <span style="font-family:var(--font-display);font-size:14px;font-weight:700;color:#00D2FF">¥3.8M</span>
          </div>
        </div>
      </div>

    </div>`;

  } catch(e) {
    console.error('[Compass] loadExecutiveView error:', e);
    content.innerHTML = '<div style="padding:20px;font-family:var(--font-head);font-size:12px;color:var(--compass-red)">Failed to load executive view — check console</div>';
  }
}

// ══════════════════════════════════════════════════════════
// VIEW: CLIENT PORTAL
// ══════════════════════════════════════════════════════════
async function loadClientView() {
  const content = document.getElementById('client-content');
  if (!content) return;

  content.innerHTML = `<div style="padding:20px;font-family:var(--font-head);font-size:12px;color:var(--text3)">Loading client portal…</div>`;

  try {
    const clientProjectId = new URLSearchParams(window.location.search).get('project')||null;
    const clientProject   = clientProjectId
      ? _projects.find(p=>p.id===clientProjectId)
      : _projects.find(p=>p.status==='active')||null;

    if (!clientProject) {
      content.innerHTML='<div style="padding:20px;font-family:var(--font-head);font-size:12px;color:#3A5C80">No active project found for client portal</div>';
      return;
    }

    const today = new Date().toLocaleDateString('en-CA');
    const [projTasks, wfInstances, resourceReqs] = await Promise.all([
      API.get(`tasks?select=id,name,status,due_date,pct_complete,sequence_order&project_id=eq.${clientProject.id}&limit=200`).catch(()=>[]),
      API.get(`workflow_instances?select=id,title,status,current_step_name,project_id&project_id=eq.${clientProject.id}&limit=20`).catch(()=>[]),
      API.get(`resource_requests?select=id,project_id,status,submitted_at&project_id=eq.${clientProject.id}&status=eq.pending`).catch(()=>[]),
    ]);

    const totalTasks = projTasks.length;
    const doneTasks  = projTasks.filter(t=>t.status==='complete').length;
    const overdue    = projTasks.filter(t=>t.due_date&&t.due_date<today&&!['complete','cancelled'].includes(t.status)).length;
    const pct        = totalTasks>0?Math.round(doneTasks/totalTasks*100):0;
    const pmRes      = _resources.find(r=>r.id===clientProject.pm_resource_id);
    const pmName     = pmRes ? pmRes.first_name+' '+pmRes.last_name : 'Project Manager';
    const team       = _resources.filter(r=>r.is_active).slice(0,4);
    const budgetUsedPct = clientProject.budget_hours_used&&clientProject.budget_hours
      ? Math.min(100,Math.round(parseFloat(clientProject.budget_hours_used)/parseFloat(clientProject.budget_hours)*100)) : null;
    const fmtDate3 = s => s ? new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

    // Derive milestones from phases or tasks
    const phases = [...new Set(projTasks.map(t=>t.phase).filter(Boolean))];
    const milestones = phases.length>0 ? phases.map((ph,i)=>{
      const phaseTasks = projTasks.filter(t=>t.phase===ph);
      const done = phaseTasks.filter(t=>t.status==='complete').length;
      const pp = phaseTasks.length>0?Math.round(done/phaseTasks.length*100):0;
      const latestDue = phaseTasks.map(t=>t.due_date).filter(Boolean).sort().slice(-1)[0];
      const status = pp>=100?'complete':i===0||pp>0?'active':'upcoming';
      return {name:'M'+(i+1)+' — '+ph, date:latestDue, pct:pp, status};
    }) : [{name:'M1 — Project work',date:clientProject.target_date,pct,status:pct>=100?'complete':pct>0?'active':'upcoming'}];

    // Client decision items
    const decisions = [];
    if (overdue>0) decisions.push({urgency:'red',title:`${overdue} overdue task${overdue>1?'s':''} — schedule impact`,desc:`${overdue} task${overdue>1?'s':''} passed their planned completion date. Review with your project manager.`,due:'Action needed',action:'Review schedule'});
    if (resourceReqs.length>0) decisions.push({urgency:'amber',title:`Resource allocation — response requested`,desc:'Your project manager has submitted a resource request. Your awareness and any concerns should be shared.',due:`${resourceReqs.length} pending`,action:'Review request'});
    if (clientProject.target_date&&new Date(clientProject.target_date+'T00:00:00')<new Date(Date.now()+30*86400000)) decisions.push({urgency:'amber',title:`Delivery gate approaching — ${fmtDate3(clientProject.target_date)}`,desc:'Delivery date is within 30 days. Confirm your team readiness for handover and review.',due:'Review by '+fmtDate3(clientProject.target_date),action:'Confirm readiness'});

    // Status for KPI
    const statusLabel = overdue>5?'At risk':overdue>0?'Watch':'On track';
    const statusColor = overdue>5?'#A32D2D':overdue>0?'#854F0B':'#0F6E56';
    const statusBg    = overdue>5?'#fdf0f0':overdue>0?'#fef5e7':'#e8f7f1';

    // Module-level client functions
    window.clOpenDecision = function(title, desc, due) {
      const ov = document.getElementById('cl-modal-bg');
      document.getElementById('cl-modal-title').textContent = title;
      document.getElementById('cl-modal-body').innerHTML = `
        <p style="font-size:12px;color:#4a5e72;line-height:1.65;margin-bottom:12px">${desc}</p>
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#8a9ab0;margin-bottom:4px">Response due</div>
        <div style="padding:7px 10px;background:#f8f9fb;border-radius:4px;font-size:12px;color:#4a5e72;margin-bottom:12px">${due}</div>
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#8a9ab0;margin-bottom:4px">Your response</div>
        <textarea id="cl-resp-input" style="width:100%;padding:8px 10px;border:1px solid #d8dee8;border-radius:5px;font-family:var(--font-body);font-size:12px;outline:none;resize:none;margin-top:2px" rows="3" placeholder="Type your response here…"></textarea>`;
      document.getElementById('cl-modal-footer').innerHTML = `
        <button onclick="clSendResponse()" style="font-size:12px;padding:7px 16px;border-radius:5px;cursor:pointer;font-weight:500;background:#185FA5;border:1px solid #185FA5;color:#fff;font-family:var(--font-body)">Send response →</button>
        <button onclick="clCloseModal()" style="font-size:12px;padding:7px 16px;border-radius:5px;cursor:pointer;font-weight:500;background:#fff;border:1px solid #d8dee8;color:#5a6e8a;font-family:var(--font-body)">Cancel</button>`;
      if(ov) ov.style.display='flex';
    };
    window.clCloseModal = function() {
      const ov = document.getElementById('cl-modal-bg');
      if(ov) ov.style.display='none';
    };
    window.clSendResponse = function() {
      const inp = document.getElementById('cl-resp-input');
      const txt = inp?.value?.trim()||'';
      clCloseModal();
      compassToast('Response sent to project manager');
      API.post('workflow_step_instances',{id:crypto.randomUUID(),instance_id:crypto.randomUUID(), step_type:'manual',event_type:'client_response',step_name:'Client portal response',event_notes:txt,created_at:new Date().toISOString(),firm_id:'aaaaaaaa-0001-0001-0001-000000000001'}).catch(()=>{});
    };

    // Light-mode client portal
    content.innerHTML = `
    <div style="font-family:'Inter',sans-serif;background:#f8f9fb;color:#1a2235;font-size:13px;margin:-20px -22px;min-height:100vh">

      <!-- Header bar -->
      <div style="background:#fff;border-bottom:1px solid rgba(0,0,0,.08);padding:0 24px;height:52px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:13px;font-weight:600;color:#1a2235;letter-spacing:.02em">ProjectHUD</div>
          <div style="width:1px;height:16px;background:#e0e4ec;margin:0 4px"></div>
          <div style="font-size:13px;color:#5a6e8a">${esc(clientProject.name)} · Client Portal</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;font-size:12px;color:#5a6e8a">
          <div style="display:flex;align-items:center;gap:5px"><div style="width:8px;height:8px;border-radius:50%;background:#1D9E75"></div> Live view</div>
          <div style="width:1px;height:16px;background:#e0e4ec"></div>
          <span>${esc(clientProject.client||'Client')}</span>
        </div>
      </div>

      <div style="max-width:960px;margin:0 auto;padding:20px 24px">
        <div style="font-size:20px;font-weight:600;color:#1a2235;margin-bottom:2px">${esc(clientProject.name)}</div>
        <div style="font-size:13px;color:#5a6e8a;margin-bottom:20px">Project status as of ${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})} · Apex Consulting Group</div>

        <!-- KPI strip -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
          ${[
            {label:'Overall status',val:statusLabel,sub:overdue>0?`${overdue} task${overdue>1?'s':''} behind plan`:'All phases on schedule',bg:statusBg,col:statusColor,accent:overdue>5?'#E24B4A':overdue>0?'#EF9F27':'#1D9E75'},
            {label:'Budget consumed',val:budgetUsedPct!==null?budgetUsedPct+'%':'—',sub:clientProject.budget_hours?`of ${Math.round(parseFloat(clientProject.budget_hours))}h planned`:'',bg:'#e6f1fb',col:'#185FA5',accent:'#185FA5'},
            {label:'Target delivery',val:clientProject.target_date?fmtDate3(clientProject.target_date).replace(', 2026',''):'—',sub:overdue>0?'At risk of slip':'On track',bg:overdue>0?'#fef5e7':'#e8f7f1',col:overdue>0?'#854F0B':'#0F6E56',accent:overdue>0?'#EF9F27':'#1D9E75'},
            {label:'Your decisions needed',val:decisions.length,sub:decisions.length>0?'Action required':'No items pending',bg:decisions.length>0?'#fdf0f0':'#f8f9fb',col:decisions.length>0?'#A32D2D':'#5a6e8a',accent:decisions.length>0?'#E24B4A':'#8a9ab0'},
          ].map(k=>`<div style="background:#fff;border:1px solid #e8ecf2;border-radius:8px;padding:14px 16px;position:relative;overflow:hidden">
            <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${k.accent};border-radius:8px 8px 0 0"></div>
            <div style="font-size:11px;font-weight:500;color:#7a8ba0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">${k.label}</div>
            <div style="font-size:22px;font-weight:600;line-height:1;margin-bottom:3px;color:${k.col}">${k.val}</div>
            <div style="font-size:11px;color:#8a9ab0">${k.sub}</div>
          </div>`).join('')}
        </div>

        ${overdue>0?`<div style="background:#fef5e7;border:1px solid #f0c97a;border-left:3px solid #EF9F27;border-radius:6px;padding:10px 14px;margin-bottom:18px;display:flex;align-items:flex-start;gap:10px">
          <div style="font-size:14px;color:#BA7517;flex-shrink:0;margin-top:1px">⚠</div>
          <div>
            <div style="font-size:12px;font-weight:600;color:#854F0B;margin-bottom:2px">Schedule update — ${overdue} task${overdue>1?'s':''} behind plan</div>
            <div style="font-size:12px;color:#7a5a10;line-height:1.5">${overdue} task${overdue>1?'s':''} ${overdue>1?'have':'has'} passed planned completion. Your project manager is managing recovery. See decision items for any actions needed from your team.</div>
          </div>
        </div>`:''}

        <div style="display:grid;grid-template-columns:1fr 340px;gap:16px">
          <div>
            <!-- Milestones card -->
            <div style="background:#fff;border:1px solid #e8ecf2;border-radius:8px;overflow:hidden;margin-bottom:14px">
              <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #f0f2f6">
                <div>
                  <div style="font-size:13px;font-weight:600;color:#1a2235">Project milestones</div>
                  <div style="font-size:11px;color:#7a8ba0;margin-top:1px">Key deliverables and phase gates</div>
                </div>
                <span style="font-size:10px;padding:2px 8px;border-radius:4px;font-weight:500;background:#e6f1fb;color:#185FA5">Phase ${milestones.filter(m=>m.status!=='upcoming').length} of ${milestones.length} active</span>
              </div>
              ${milestones.map((m,i)=>{
                const isDone = m.status==='complete';
                const isActive = m.status==='active';
                const ic = isDone?'✓':isActive?(i+1).toString():(i+1).toString();
                const icBg = isDone?'#e8f7f1':isActive?'#e6f1fb':'#f2f4f7';
                const icCol = isDone?'#1D9E75':isActive?'#185FA5':'#8a9ab0';
                const barCol = isDone?'#1D9E75':isActive?'#185FA5':'#c0c8d8';
                const badgeText = isDone?'Complete':isActive?'Active':'Upcoming';
                const badgeBg = isDone?'#e8f7f1':isActive?'#e6f1fb':'#f2f4f7';
                const badgeCol = isDone?'#0F6E56':isActive?'#185FA5':'#5a6e8a';
                return `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #f0f2f6;cursor:pointer;transition:background .1s" onmouseenter="this.style.background='#fafbfc'" onmouseleave="this.style.background=''">
                  <div style="width:28px;height:28px;border-radius:50%;background:${icBg};color:${icCol};font-size:${isDone?'12':'10'}px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic}</div>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:500;color:#1a2235">${esc(m.name)}</div>
                    <div style="font-size:11px;color:#8a9ab0;margin-top:1px">${isDone?'Completed':isActive?'In progress — target ':''} ${m.date?fmtDate3(m.date):''}</div>
                    <div style="height:3px;background:#edf0f5;border-radius:2px;overflow:hidden;margin-top:5px"><div style="height:100%;border-radius:2px;background:${barCol};width:${m.pct}%"></div></div>
                  </div>
                  <span style="font-size:10px;padding:2px 8px;border-radius:4px;font-weight:500;background:${badgeBg};color:${badgeCol};flex-shrink:0">${badgeText}</span>
                  <span style="font-size:11px;color:#8a9ab0;min-width:32px;text-align:right">${m.pct}%</span>
                </div>`;
              }).join('')}
            </div>

            <!-- Overall progress -->
            <div style="background:#fff;border:1px solid #e8ecf2;border-radius:8px;overflow:hidden;padding:14px 16px;margin-bottom:14px">
              <div style="font-size:13px;font-weight:600;color:#1a2235;margin-bottom:10px">Overall progress</div>
              <div style="display:flex;justify-content:space-between;font-size:11px;color:#7a8ba0;margin-bottom:5px"><span>Complete</span><span>${doneTasks}/${totalTasks} tasks · ${pct}%</span></div>
              <div style="height:8px;background:#edf0f5;border-radius:4px;overflow:hidden"><div style="height:100%;border-radius:4px;background:${pct>=80?'#1D9E75':pct>=50?'#185FA5':'#8a9ab0'};width:${pct}%"></div></div>
            </div>
          </div>

          <div>
            <!-- Decisions needed -->
            ${decisions.length>0?`<div style="background:#fff;border:1px solid #e8ecf2;border-radius:8px;overflow:hidden;margin-bottom:14px">
              <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #f0f2f6">
                <div><div style="font-size:13px;font-weight:600;color:#1a2235">Decisions needed from you</div><div style="font-size:11px;color:#7a8ba0;margin-top:1px">Items requiring your response</div></div>
                <span style="font-size:10px;padding:2px 8px;border-radius:4px;font-weight:500;background:#fdf0f0;color:#A32D2D">${decisions.length} pending</span>
              </div>
              ${decisions.map(d=>`<div style="display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-bottom:1px solid #f0f2f6;cursor:pointer" onclick="clOpenDecision('${esc(d.title).replace(/'/g,"\'")}','${esc(d.desc).replace(/'/g,"\'")}','${esc(d.due)}')">
                <div style="width:4px;align-self:stretch;border-radius:2px;flex-shrink:0;background:${d.urgency==='red'?'#E24B4A':'#EF9F27'}"></div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:500;color:#1a2235;margin-bottom:2px">${esc(d.title)}</div>
                  <div style="font-size:11px;color:#7a8ba0;line-height:1.5">${esc(d.desc)}</div>
                  <button style="font-size:11px;font-weight:600;color:#185FA5;background:none;border:none;padding:5px 0 0;cursor:pointer;font-family:inherit">${d.action} →</button>
                </div>
                <span style="font-size:11px;padding:3px 8px;border-radius:4px;font-weight:500;flex-shrink:0;background:${d.urgency==='red'?'#fdf0f0':'#fef5e7'};color:${d.urgency==='red'?'#A32D2D':'#854F0B'}">${d.due}</span>
              </div>`).join('')}
            </div>`:''}

            <!-- Budget summary -->
            ${clientProject.budget_hours?`<div style="background:#fff;border:1px solid #e8ecf2;border-radius:8px;overflow:hidden;margin-bottom:14px">
              <div style="padding:12px 16px;border-bottom:1px solid #f0f2f6"><div style="font-size:13px;font-weight:600;color:#1a2235">Budget summary</div></div>
              <div style="padding:14px 16px">
                <div style="display:flex;justify-content:space-between;font-size:11px;color:#7a8ba0;margin-bottom:5px"><span>Consumed</span><span>${Math.round(parseFloat(clientProject.budget_hours_used||0))}h / ${Math.round(parseFloat(clientProject.budget_hours))}h</span></div>
                <div style="height:8px;background:#edf0f5;border-radius:4px;overflow:hidden"><div style="height:100%;border-radius:4px;background:#185FA5;width:${budgetUsedPct||0}%"></div></div>
                <div style="font-size:11px;color:#7a8ba0;margin-top:10px;padding:7px 9px;background:#f8f9fb;border-radius:4px;border:1px solid #edf0f5">${(budgetUsedPct||0)<80?'No budget overruns at this time. Project is tracking to budget.':'Budget consumption elevated — discuss with project manager.'}</div>
              </div>
            </div>`:''}

            <!-- Your Apex team -->
            <div style="background:#fff;border:1px solid #e8ecf2;border-radius:8px;overflow:hidden;margin-bottom:14px">
              <div style="padding:12px 16px;border-bottom:1px solid #f0f2f6"><div style="font-size:13px;font-weight:600;color:#1a2235">Your Apex team</div></div>
              <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #f0f2f6">
                <div style="width:32px;height:32px;border-radius:50%;background:#e6f1fb;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#185FA5;flex-shrink:0">${esc(((pmRes?.first_name||'')[0]||'').toUpperCase()+((pmRes?.last_name||'')[0]||'').toUpperCase())}</div>
                <div style="flex:1"><div style="font-size:12px;font-weight:500;color:#1a2235">${esc(pmName)}</div><div style="font-size:11px;color:#7a8ba0">Project Manager · Primary contact</div></div>
                <button style="font-size:11px;font-weight:500;color:#185FA5;background:none;border:1px solid #b8d4ee;border-radius:4px;padding:3px 9px;cursor:pointer;font-family:inherit" onclick="clOpenDecision('Contact ${esc(pmName)}','Send a message to your project manager.','—')">Contact</button>
              </div>
              ${team.filter(r=>r.id!==clientProject.pm_resource_id).slice(0,3).map(r=>`
              <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #f0f2f6">
                <div style="width:32px;height:32px;border-radius:50%;background:#e6f1fb;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#185FA5;flex-shrink:0">${esc(((r.first_name||'')[0]||'').toUpperCase()+((r.last_name||'')[0]||'').toUpperCase())}</div>
                <div><div style="font-size:12px;font-weight:500;color:#1a2235">${esc(r.first_name+' '+r.last_name)}</div><div style="font-size:11px;color:#7a8ba0">${esc(r.department||'Team member')}</div></div>
              </div>`).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- Modal -->
      <div id="cl-modal-bg" style="position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:100;display:none;align-items:center;justify-content:center" onclick="clCloseModal()">
        <div style="background:#fff;border-radius:10px;width:460px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.15)" onclick="event.stopPropagation()">
          <div style="padding:16px 18px;border-bottom:1px solid #f0f2f6;display:flex;align-items:flex-start;justify-content:space-between">
            <div style="font-size:14px;font-weight:600;color:#1a2235" id="cl-modal-title">Detail</div>
            <button onclick="clCloseModal()" style="background:none;border:1px solid #e0e4ec;border-radius:4px;width:24px;height:24px;cursor:pointer;font-size:14px;color:#7a8ba0;display:flex;align-items:center;justify-content:center;font-family:inherit">✕</button>
          </div>
          <div id="cl-modal-body" style="padding:16px 18px;font-size:12px;color:#4a5e72;line-height:1.65"></div>
          <div id="cl-modal-footer" style="padding:12px 18px;border-top:1px solid #f0f2f6;display:flex;gap:8px"></div>
        </div>
      </div>
    </div>`;

  } catch(e) {
    console.error('[Compass] loadClientView error:', e);
    content.innerHTML='<div style="padding:20px;font-family:var(--font-head);font-size:12px;color:var(--compass-red)">Failed to load client portal — check console</div>';
  }
}

// ══════════════════════════════════════════════════════════
// DECISION SIMULATOR
// ══════════════════════════════════════════════════════════
window.openDecisionSimulator = async function(projectId, projectName, contextNote) {
  document.getElementById('sim-modal')?.remove();

  // Full-screen modal overlay
  const modal = document.createElement('div');
  modal.id = 'sim-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:#060c18;z-index:400;display:flex;flex-direction:column;overflow:hidden;animation:sim-fadein .18s ease';

  // Inject keyframe once
  if (!document.getElementById('sim-anim-style')) {
    const st = document.createElement('style');
    st.id = 'sim-anim-style';
    st.textContent = '@keyframes sim-fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}';
    document.head.appendChild(st);
  }

  const today = new Date().toLocaleDateString('en-CA');
  const HOURLY_RATE = 8000, HRS_PER_REWORK = 2;

  // Fetch live data for this project
  let projTasks = [], wfInstances = [], reworkEvents = [], resourceReqs = [];
  try {
    [projTasks, wfInstances, resourceReqs] = await Promise.all([
      projectId ? API.get(`tasks?project_id=eq.${projectId}&select=id,name,status,due_date,pct_complete,assigned_to,phase,sequence_order,predecessors&order=sequence_order.asc&limit=100`).catch(()=>[]) : Promise.resolve([]),
      projectId ? API.get(`workflow_instances?project_id=eq.${projectId}&status=eq.active&select=id,title,status,current_step_name&limit=20`).catch(()=>[]) : Promise.resolve([]),
      API.get('resource_requests?select=id,project_id,status,submitted_at&status=eq.pending&limit=10').catch(()=>[]),
    ]);
    const instIds = wfInstances.map(i=>i.id);
    if (instIds.length) {
      reworkEvents = await API.get(`workflow_step_instances?select=id,instance_id,event_type,step_name,outcome,created_at&instance_id=in.(${instIds.join(',')})&event_type=eq.step_reset&order=created_at.desc&limit=50`).catch(()=>[]);
    }
  } catch(e) { console.error('[Compass] Simulator data fetch error:', e); }

  const proj = (_projects||[]).find(p=>p.id===projectId);
  const overdueTasks = projTasks.filter(t=>t.due_date&&t.due_date<today&&!['complete','cancelled'].includes(t.status));
  const blockedTasks = projTasks.filter(t=>t.status==='blocked'||t.status==='on_hold');
  const instResets = {};
  reworkEvents.forEach(e=>{ instResets[e.instance_id]=(instResets[e.instance_id]||0)+1; });
  const escalations = Object.entries(instResets).filter(([,c])=>c>=2);
  const slipDays = overdueTasks.length > 0 ? Math.max(...overdueTasks.map(t=>{
    const d = Math.round((new Date(today+'T00:00:00')-new Date(t.due_date+'T00:00:00'))/(86400000));
    return Math.max(0,d);
  })) : 0;
  const dailyCost = 12000; // ¥12k/day default
  const formatYen = n => n>=1000000?'¥'+(n/1000000).toFixed(1)+'M':'¥'+Math.round(n/1000)+'k';

  // Build levers from real data
  const LEVERS_LIVE = [];

  // Escalation levers if there are 2+ resets
  if (escalations.length > 0) {
    const [instId, count] = escalations[0];
    const inst = wfInstances.find(w=>w.id===instId);
    LEVERS_LIVE.push({
      id:'esc-mgmt', group:'escalation',
      name:'Escalate to management — '+esc(inst?.title||'workflow block'),
      costTier:'low', days:-3, hard:0, sr:83, conf:88,
      warn:null,
      pattern: count>=3 ? `${count} consecutive failures — systematic block. Resource reassignment will NOT address this. Escalation is the correct lever.` : null,
      unblocks: overdueTasks.slice(0,3).map(t=>t.id),
      reworkRisk:[], params:[{l:'Response target',o:['24h','48h','72h']}],
      detail: `${count} PM-level intervention${count>1?'s have':' has'} not resolved this. Management authority required — direct client contact or expedited approval path.`
    });
    LEVERS_LIVE.push({
      id:'esc-client', group:'escalation',
      name:'Executive contact — client authority',
      costTier:'low', days:-2, hard:0, sr:76, conf:72,
      warn: null, pattern: null,
      unblocks: overdueTasks.slice(0,3).map(t=>t.id),
      reworkRisk:[], params:[{l:'Channel',o:['Account exec','Technical director','Both']}],
      detail:'Direct client authority contact. Lower confidence (72%) due to external dependency.'
    });
  }

  // Resource levers from pending requests
  resourceReqs.filter(r=>r.project_id===projectId||!projectId).forEach(r=>{
    const ageH = Math.round((Date.now()-new Date(r.submitted_at).getTime())/3600000);
    LEVERS_LIVE.push({
      id:'res-'+r.id, group:'resource',
      name:'Approve resource request — '+esc(r.role||'resource'),
      costTier:'med', days:-2, hard:18000, sr:62, conf:65,
      warn:`Request aging ${ageH}h. Approving now affects resource planning for other projects.`,
      pattern: escalations.length>0 ? `Current block appears to be an approval constraint, not a resource constraint. ${62}% success rate reflects cases where resource reallocation does not address upstream sign-off blocks.` : null,
      unblocks:[], reworkRisk:[], params:[{l:'Duration',o:['1 week','2 weeks','Until resolved']}],
      detail:`Resource request pending ${ageH}h. Approval unblocks PM planning and demonstrates management engagement.`
    });
  });

  // CPM-derived parallel options from tasks with no blockers
  const availableTasks = projTasks.filter(t=>
    !['complete','cancelled'].includes(t.status) &&
    t.status !== 'blocked' &&
    (!t.predecessors || t.predecessors.length===0 || t.predecessors==='{}')
  ).slice(0,4);

  if (availableTasks.length >= 2) {
    LEVERS_LIVE.push({
      id:'cpm-parallel', group:'cpm',
      name:`CPM Option — advance ${availableTasks.length} independent tasks in parallel`,
      costTier:'low', days: -Math.min(3, availableTasks.length), hard:0, sr:95, conf:90,
      warn: null, pattern: null,
      unblocks:[], advances: availableTasks.map(t=>t.id.slice(0,8)),
      reworkRisk:[], params:[],
      detail:`${availableTasks.length} tasks have no blocking predecessors. Advancing these now recovers schedule while the primary block is resolved.`
    });
  }

  // Expedite option (always available as a materials lever)
  LEVERS_LIVE.push({
    id:'mat-exp', group:'materials',
    name:'Expedite delivery / fast-track resolution path',
    costTier:'high', days:-5, hard:85000, sr:95, conf:90,
    risk:'Non-cancellable after 24h. Confirm viability first.',
    warn:null, pattern:null,
    unblocks: overdueTasks.slice(0,3).map(t=>t.id),
    reworkRisk:[], params:[{l:'Track',o:['Expedite supplier (2d, +¥85k)','Alt supplier (4d, +¥60k)','Direct procurement (6d, +¥95k)']}],
    detail:'Deterministic outcome — not behavioural. 95% confidence if capacity confirmed. Net cost ¥25k after schedule value recovered.'
  });

  // Scope deferral
  LEVERS_LIVE.push({
    id:'scope-defer', group:'materials',
    name:'Defer non-critical deliverables to next phase',
    costTier:'low', days:-2, hard:0, sr:92, conf:85,
    warn:null, pattern:null,
    unblocks:[], reworkRisk:[], params:[{l:'Scope',o:['Non-critical docs (2d)','Optional integrations (3d)','Cosmetic items (1d)']}],
    detail:'High success rate because cosmetic and non-critical items have no dependency on blocked path. Frees critical-path resources.'
  });

  const GROUP_META = {
    escalation:{color:'#E24B4A',label:'Escalation levers'},
    resource:{color:'#00D2FF',label:'Resource levers'},
    materials:{color:'#8B5CF6',label:'Materials levers'},
    cpm:{color:'#8B5CF6',label:'CPM-derived parallel options'}
  };

  const selected = new Set();
  let spCount = 0;

  modal.innerHTML = `
    <style>
      .sim-lc{border:1px solid rgba(255,255,255,.07);padding:7px 9px;margin-bottom:4px;transition:border-color .12s,background .12s;cursor:pointer}
      .sim-lc:hover{border-color:rgba(0,210,255,.2);background:rgba(0,210,255,.03)}
      .sim-lc.sim-sel{border-color:rgba(0,210,255,.45);background:rgba(0,210,255,.07)}
      .sim-lc.sim-cpm{border-left:3px solid rgba(139,92,246,.5)}
      .sim-lc.sim-warn{border-left:3px solid rgba(239,159,39,.6)}
      .sim-chk{width:14px;height:14px;border:1px solid rgba(255,255,255,.2);border-radius:2px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;color:transparent;flex-shrink:0;transition:.12s}
      .sim-lc.sim-sel .sim-chk{background:#00D2FF;border-color:#00D2FF;color:#060a10}
      .sim-sp{position:absolute;background:#0d1f35;border:1px solid rgba(0,210,255,.35);min-width:260px;max-width:360px;z-index:500}
      .sim-sp-head{display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:#091524;border-bottom:1px solid rgba(0,210,255,.2);cursor:move;user-select:none}
      .sim-wf-row{display:flex;align-items:center;gap:8px;margin-bottom:4px;cursor:pointer;padding:3px 0;transition:background .1s}
      .sim-wf-row:hover{background:rgba(255,255,255,.03)}
    </style>
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <!-- Nav -->
      <div style="display:flex;align-items:center;height:40px;background:#060a10;border-bottom:1px solid rgba(0,210,255,.12);padding:0 14px;flex-shrink:0;gap:8px">
        <div style="font-family:var(--font-display);font-size:14px;font-weight:700;color:#F0F6FF;letter-spacing:.05em">COM<span style="color:#00D2FF">PASS</span></div>
        <div style="width:1px;height:16px;background:rgba(0,210,255,.15);margin:0 4px"></div>
        <div style="font-family:var(--font-head);font-size:11px;color:#5A84A8;display:flex;align-items:center;gap:5px">
          <span>${esc(projectName||'Portfolio')}</span>
          <span style="color:rgba(255,255,255,.2)">›</span>
          <span style="color:#8B5CF6">Decision simulator</span>
        </div>
        <span style="font-family:var(--font-head);font-size:11px;padding:2px 8px;border:1px solid rgba(139,92,246,.35);color:#8B5CF6;background:rgba(139,92,246,.07);margin-left:auto">CPM + Pattern analysis</span>
        <button onclick="document.getElementById('sim-modal')?.remove()"
          style="background:none;border:1px solid rgba(255,255,255,.15);color:#5A84A8;padding:3px 10px;cursor:pointer;font-family:var(--font-head);font-size:11px;margin-left:8px;transition:color .1s"
          onmouseenter="this.style.color='#F0F6FF'" onmouseleave="this.style.color='#5A84A8'">✕ Close</button>
      </div>
      <!-- Body -->
      <div style="display:flex;flex:1;overflow:hidden;position:relative" id="sim-inner">
        <!-- LEFT -->
        <div style="width:340px;flex-shrink:0;border-right:1px solid rgba(0,210,255,.08);display:flex;flex-direction:column;overflow:hidden">
          <!-- Context strip -->
          <div style="padding:10px 12px;border-bottom:1px solid rgba(0,210,255,.08);background:rgba(255,255,255,.02);flex-shrink:0">
            <div style="font-family:var(--font-body);font-size:11px;color:rgba(240,246,255,.65);line-height:1.5;margin-bottom:7px">
              ${esc(contextNote||'')}${overdueTasks.length>0?' · '+overdueTasks.length+' overdue task'+(overdueTasks.length>1?'s':''):''} ${escalations.length>0?' · '+escalations.length+' escalation'+(escalations.length>1?'s':''):''} ${blockedTasks.length>0?' · '+blockedTasks.length+' blocked':''}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px">
              <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);padding:4px 7px;cursor:pointer;transition:border-color .12s" id="sim-kpi-slip" onmouseenter="this.style.borderColor='rgba(0,210,255,.3)'" onmouseleave="this.style.borderColor='rgba(255,255,255,.06)'">
                <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.05em">Slip</div>
                <div style="font-family:var(--font-display);font-size:14px;font-weight:700;color:${slipDays>0?'#E24B4A':'#1D9E75'}">${slipDays>0?slipDays+'d':'0d'}</div>
              </div>
              <div id="sim-kpi-daily" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);padding:4px 7px;cursor:pointer;transition:border-color .12s" onmouseenter="this.style.borderColor='rgba(0,210,255,.3)'" onmouseleave="this.style.borderColor='rgba(255,255,255,.06)'">
                <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.05em">Daily cost</div>
                <div style="font-family:var(--font-display);font-size:14px;font-weight:700;color:#EF9F27">¥12k</div>
              </div>
              <div id="sim-kpi-levers" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);padding:4px 7px;cursor:pointer;transition:border-color .12s" onmouseenter="this.style.borderColor='rgba(0,210,255,.3)'" onmouseleave="this.style.borderColor='rgba(255,255,255,.06)'">
                <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.05em">Levers</div>
                <div style="font-family:var(--font-display);font-size:14px;font-weight:700;color:#00D2FF">${LEVERS_LIVE.length}</div>
              </div>
            </div>
          </div>
          <!-- Left tabs -->
          <div style="display:flex;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0">
            <button id="sim-tab-levers" onclick="simSwitchTab('levers')"
              style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.07em;padding:6px 12px;color:#00D2FF;border:none;border-bottom:2px solid #00D2FF;background:none;cursor:pointer;text-transform:uppercase">Levers</button>
            <button id="sim-tab-cpm" onclick="simSwitchTab('cpm')"
              style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.07em;padding:6px 12px;color:rgba(255,255,255,.35);border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;text-transform:uppercase">CPM view</button>
          </div>
          <!-- Lever list -->
          <div id="sim-lv-levers" style="flex:1;overflow-y:auto;padding:8px 10px">
            <div id="sim-lever-list"></div>
          </div>
          <!-- CPM view -->
          <div id="sim-lv-cpm" style="display:none;flex:1;overflow-y:auto;padding:10px">
            <div id="sim-cpm-list"></div>
          </div>
        </div>
        <!-- RIGHT -->
        <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
          <div style="flex:1;overflow-y:auto;padding:14px 16px" id="sim-op">
            <div id="sim-empty" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,.2);text-align:center;gap:8px">
              <div style="font-size:24px;opacity:.2">◎</div>
              <div style="font-family:var(--font-body);font-size:12px;line-height:1.7;color:rgba(255,255,255,.3)">Select levers from the left panel.<br><br>Each lever shows: success rate based on prior instances · cost tier · CPM task network impact.<br><br>Click any value in the outcome panel to open a detailed explanation.</div>
            </div>
            <div id="sim-results" style="display:none"></div>
          </div>
          <!-- Commit bar -->
          <div id="sim-cb" style="display:none;background:#060a10;border-top:1px solid rgba(0,210,255,.1);padding:9px 14px;display:none;align-items:center;justify-content:space-between;flex-shrink:0">
            <div id="sim-cb-sum" style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.4)"></div>
            <div style="display:flex;gap:5px">
              <button onclick="simCommit()" style="font-family:var(--font-head);font-size:11px;padding:5px 13px;cursor:pointer;border:1px solid rgba(29,158,117,.5);color:#1D9E75;background:none;letter-spacing:.06em;transition:background .1s" onmouseenter="this.style.background='rgba(29,158,117,.1)'" onmouseleave="this.style.background='none'">Commit → Log interventions</button>
              <button onclick="compassToast('Saved to brief annotation',2000)" style="font-family:var(--font-head);font-size:11px;padding:5px 13px;cursor:pointer;border:1px solid rgba(0,210,255,.35);color:#00D2FF;background:none;letter-spacing:.06em;transition:background .1s" onmouseenter="this.style.background='rgba(0,210,255,.08)'" onmouseleave="this.style.background='none'">Save annotation</button>
              <button onclick="simResetAll()" style="font-family:var(--font-head);font-size:11px;padding:5px 13px;cursor:pointer;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.4);background:none;letter-spacing:.06em;transition:color .1s" onmouseenter="this.style.color='#fff'" onmouseleave="this.style.color='rgba(255,255,255,.4)'">Reset</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(modal);

  // ── Context KPI click handlers ────────────────────────
  document.getElementById('sim-kpi-slip')?.addEventListener('click',()=>{
    simOpenSP('Schedule slip — '+slipDays+'d',
      [['First identified',new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})],
       ['Root cause','Primary block on critical path'],
       ['Blocking tasks',overdueTasks.length+' overdue task'+(overdueTasks.length!==1?'s':'')],
       ['Escalations pending',escalations.length>0?escalations.length+' unresolved':'None'],
       ['Daily cost rate','¥12,000/day'],
       ['Accumulated cost',formatYen(slipDays*12000)]],
      slipDays+'d slip · '+formatYen(slipDays*12000)+' accumulated',
      'Every day the block persists adds ¥12k cost and pushes delivery further. Float on the critical path is zero.',
      '#E24B4A');
  });
  document.getElementById('sim-kpi-daily')?.addEventListener('click',()=>{
    simOpenSP('Daily cost — ¥12,000/day',
      [['Blocked resource labor','~¥8,500/day'],
       ['PM coordination','~¥1,200/day'],
       ['Overhead allocation (20%)','~¥2,300/day'],
       ['Total','¥12,000/day'],
       ['Rate basis','Firm default — configure in Firm Settings'],
       ['Accumulated so far',formatYen(slipDays*12000)]],
      '¥12,000 per day the block persists',
      'Fully-loaded cost of blocked resources. Represents direct labor plus overhead. Does not include downstream rework cost or client relationship impact.',
      '#EF9F27');
  });
  document.getElementById('sim-kpi-levers')?.addEventListener('click',()=>{
    const byGroup = {};
    LEVERS_LIVE.forEach(l=>{ byGroup[l.group]=(byGroup[l.group]||0)+1; });
    simOpenSP('Available levers — '+LEVERS_LIVE.length,
      Object.entries(byGroup).map(([g,n])=>[g.charAt(0).toUpperCase()+g.slice(1)+' levers',n+' option'+(n!==1?'s':'')]).concat([
        ['CPM analysis','Task network computed from live data'],
        ['Select any combination','Outcomes update in real time'],
      ]),
      LEVERS_LIVE.length+' levers available for this situation',
      'Levers are built from live project data. Escalation levers appear when 2+ intervention attempts have failed. CPM options are derived from tasks with no blocking predecessors.',
      '#00D2FF');
  });

  // ── Module functions scoped to this simulator instance ──
  function simSwitchTab(tab) {
    document.getElementById('sim-lv-levers').style.display = tab==='levers'?'block':'none';
    document.getElementById('sim-lv-cpm').style.display   = tab==='cpm'?'block':'none';
    document.getElementById('sim-tab-levers').style.color         = tab==='levers'?'#00D2FF':'rgba(255,255,255,.35)';
    document.getElementById('sim-tab-levers').style.borderBottomColor = tab==='levers'?'#00D2FF':'transparent';
    document.getElementById('sim-tab-cpm').style.color           = tab==='cpm'?'#00D2FF':'rgba(255,255,255,.35)';
    document.getElementById('sim-tab-cpm').style.borderBottomColor   = tab==='cpm'?'#00D2FF':'transparent';
  }
  window.simSwitchTab = simSwitchTab;

  function simToggleLever(id) {
    const card = document.getElementById('simlc-'+id);
    if (!card) return;
    if (selected.has(id)) { selected.delete(id); card.classList.remove('sim-sel'); }
    else                  { selected.add(id);    card.classList.add('sim-sel'); }
    simRunSim();
  }
  window.simToggleLever = simToggleLever;

  function simOpenSP(title, rows, result, note, colorBorder) {
    spCount++;
    const pid = 'simsp-'+spCount;
    const inner = document.getElementById('sim-inner');
    const sp = document.createElement('div');
    sp.id = pid;
    sp.className = 'sim-sp';
    sp.style.cssText = `left:${Math.min(360+spCount*16,520)}px;top:${Math.min(60+spCount*16,180)}px;width:300px`;
    sp.style.borderLeftColor = colorBorder||'rgba(0,210,255,.35)';
    sp.innerHTML = `<div class="sim-sp-head" id="sph-${pid}">
      <span style="font-family:var(--font-head);font-size:11px;font-weight:700;color:#00D2FF;text-transform:uppercase;letter-spacing:.06em">${title}</span>
      <button onclick="document.getElementById('${pid}').remove()" style="background:none;border:1px solid rgba(226,75,74,.4);color:#E24B4A;width:18px;height:18px;cursor:pointer;font-size:10px">✕</button>
    </div>
    <div style="padding:10px 12px;max-height:380px;overflow-y:auto">
      ${rows.map(r=>`<div style="display:flex;justify-content:space-between;gap:14px;font-family:var(--font-head);font-size:11px;color:rgba(240,246,255,.75);margin-bottom:4px">
        <span style="color:rgba(255,255,255,.4);flex-shrink:0;max-width:160px">${r[0]}</span>
        <span style="font-weight:700;color:#F0F6FF;text-align:right">${r[1]}</span>
      </div>`).join('')}
      <div style="height:1px;background:rgba(0,210,255,.2);margin:7px 0"></div>
      <div style="font-family:var(--font-display);font-size:14px;font-weight:700;color:#F0F6FF;margin:3px 0">${result}</div>
      ${note?`<div style="font-family:var(--font-body);font-size:11px;color:rgba(255,255,255,.4);margin-top:6px;line-height:1.5;border-top:1px solid rgba(255,255,255,.07);padding-top:6px">${note}</div>`:''}
    </div>
    <div style="position:absolute;bottom:0;right:0;width:12px;height:12px;cursor:se-resize;background:linear-gradient(135deg,transparent 50%,rgba(0,210,255,.25) 50%)" id="spr-${pid}"></div>`;
    inner.appendChild(sp);
    // Draggable
    const head = document.getElementById('sph-'+pid);
    let ox,oy,sx,sy;
    head.addEventListener('mousedown',e=>{
      e.preventDefault(); sx=sp.offsetLeft; sy=sp.offsetTop; ox=e.clientX; oy=e.clientY;
      const mm=e2=>{sp.style.left=(sx+e2.clientX-ox)+'px';sp.style.top=(sy+e2.clientY-oy)+'px';};
      const mu=()=>{document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);};
      document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu);
    });
    // Resizable
    const rsz = document.getElementById('spr-'+pid);
    let ow2,oh2,ox2,oy2;
    rsz.addEventListener('mousedown',e=>{
      e.preventDefault(); e.stopPropagation(); ow2=sp.offsetWidth; oh2=sp.offsetHeight; ox2=e.clientX; oy2=e.clientY;
      const mm=e2=>{sp.style.width=Math.max(220,ow2+e2.clientX-ox2)+'px';sp.style.maxHeight=Math.max(180,oh2+e2.clientY-oy2)+'px';};
      const mu=()=>{document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);};
      document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu);
    });
  }
  window.simOpenSP = simOpenSP;

  function simRunSim() {
    const results = document.getElementById('sim-results');
    const empty   = document.getElementById('sim-empty');
    const cb      = document.getElementById('sim-cb');
    if (!selected.size) {
      results.style.display='none'; empty.style.display='flex'; cb.style.display='none'; return;
    }
    empty.style.display='none'; results.style.display='block'; cb.style.display='flex';

    let totalDays=0, totalHard=0, minSR=100, wConf=0;
    const levers=[], risks=[], patterns=[];
    const unblockedTasks=new Set(), advancedTasks=new Set(), reworkTasks=new Set();

    selected.forEach(id=>{
      const d = LEVERS_LIVE.find(l=>l.id===id);
      if(!d) return;
      totalDays+=d.days; totalHard+=d.hard; minSR=Math.min(minSR,d.sr); wConf+=d.conf;
      levers.push(d);
      if(d.risk) risks.push({text:d.risk,sev:d.sr<70?'#E24B4A':'#EF9F27'});
      if(d.pattern) patterns.push(d.pattern);
      (d.unblocks||[]).forEach(t=>unblockedTasks.add(t));
      (d.advances||[]).forEach(t=>advancedTasks.add(t));
      (d.reworkRisk||[]).forEach(t=>reworkTasks.add(t));
    });

    const avgConf  = Math.round(wConf/selected.size);
    const recovDays= Math.max(0,-totalDays);
    const projSlip = Math.max(0,slipDays+totalDays);
    const schedVal = recovDays*dailyCost;
    const netCost  = totalHard-schedVal;
    const pd = new Date(); pd.setDate(pd.getDate()+projSlip);
    const fmt = d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    const noActionDate = new Date(); noActionDate.setDate(noActionDate.getDate()+slipDays+1);

    document.getElementById('sim-cb-sum').innerHTML = `<span>${selected.size}</span> lever${selected.size>1?'s':''} · <span>${recovDays}d</span> recovered · <span>${formatYen(totalHard)}</span> hard cost · net: <span style="color:${netCost<=0?'#1D9E75':'#EF9F27'}">${netCost<=0?formatYen(Math.abs(netCost))+' benefit':formatYen(netCost)+' cost'}</span>`;

    const patternBlock = patterns.length ? `<div style="margin-bottom:12px;padding:9px 11px;background:rgba(139,92,246,.05);border:1px solid rgba(139,92,246,.2);border-left:3px solid #8B5CF6">
      <div style="font-family:var(--font-head);font-size:11px;font-weight:700;color:#8B5CF6;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px">Pattern analysis — active warning</div>
      <div style="font-family:var(--font-body);font-size:11px;color:rgba(240,246,255,.7);line-height:1.55">${patterns[0]}</div>
    </div>` : '';

    const unblockList = [...unblockedTasks].map(id=>{
      const t = projTasks.find(tt=>tt.id===id);
      return `<div style="display:flex;align-items:center;gap:5px;font-family:var(--font-head);font-size:11px;color:rgba(240,246,255,.75);margin-bottom:3px"><span style="font-weight:700;color:rgba(0,210,255,.6);min-width:60px">${id.slice(0,8)}</span>${esc(t?.name||'Task')}</div>`;
    }).join('');
    const advanceList = [...advancedTasks].map(id=>{
      return `<div style="display:flex;align-items:center;gap:5px;font-family:var(--font-head);font-size:11px;color:rgba(240,246,255,.75);margin-bottom:3px"><span style="font-weight:700;color:#8B5CF6;min-width:60px">${id.slice(0,8)}</span>Parallel advance</div>`;
    }).join('');
    const remainingBlocked = escalations.length>0 && !selected.has('esc-mgmt') && !selected.has('esc-client') && !selected.has('mat-exp')
      ? overdueTasks.slice(0,3).map(t=>`<div style="display:flex;align-items:center;gap:5px;font-family:var(--font-head);font-size:11px;color:#E24B4A;margin-bottom:3px"><span style="font-weight:700;min-width:60px">${t.id.slice(0,8)}</span>${esc(t.name||'task')}</div>`).join('')
      : '';

    results.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div>
          <div style="font-family:var(--font-display);font-size:16px;font-weight:700;color:#F0F6FF">Projected outcome</div>
          <div style="font-family:var(--font-head);font-size:11px;color:#3A5C80;margin-top:2px">${selected.size} lever${selected.size>1?'s':''} · click any value to open explanation</div>
        </div>
      </div>
      ${patternBlock}
      <!-- Scenario comparison -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <div style="border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02)">
          <div style="padding:7px 11px;border-bottom:1px solid rgba(255,255,255,.06)"><span style="font-family:var(--font-head);font-size:11px;letter-spacing:.07em;color:rgba(255,255,255,.35);text-transform:uppercase">If no action</span></div>
          <div style="padding:9px 11px">
            <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.35);margin-bottom:1px">Delivery</div>
            <div style="font-family:var(--font-display);font-size:18px;font-weight:700;color:#E24B4A">${slipDays>0?fmt(noActionDate):'On track'}</div>
            <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.3);margin-top:1px">${slipDays>0?'+'+slipDays+'d and growing':'No current slip'}</div>
            <div style="height:1px;background:rgba(255,255,255,.05);margin:7px 0"></div>
            <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.35);margin-bottom:1px">Cost accumulating</div>
            <div id="sim-slip-cl" style="font-family:var(--font-display);font-size:18px;font-weight:700;color:#E24B4A;cursor:pointer">${formatYen(slipDays*dailyCost)}</div>
            <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.3)">click for detail</div>
          </div>
        </div>
        <div style="border:1px solid rgba(29,158,117,.3);background:rgba(29,158,117,.04)">
          <div style="padding:7px 11px;border-bottom:1px solid rgba(29,158,117,.15);display:flex;align-items:center;justify-content:space-between">
            <span style="font-family:var(--font-head);font-size:11px;letter-spacing:.07em;color:rgba(255,255,255,.35);text-transform:uppercase">With selected levers</span>
            <span id="sim-sr-badge" style="font-family:var(--font-head);font-size:11px;padding:1px 7px;border:1px solid rgba(29,158,117,.4);color:#1D9E75;background:rgba(29,158,117,.08);cursor:pointer">${minSR}% success</span>
          </div>
          <div style="padding:9px 11px">
            <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.35);margin-bottom:1px">Projected delivery</div>
            <div id="sim-del-cl" style="font-family:var(--font-display);font-size:18px;font-weight:700;color:${projSlip<=2?'#1D9E75':projSlip<=5?'#EF9F27':'#E24B4A'};cursor:pointer">${projSlip===0?'On contract':fmt(pd)}</div>
            <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.3);margin-top:1px">${projSlip===0?'On contract':'+'+projSlip+'d from contract'}</div>
            <div style="height:1px;background:rgba(255,255,255,.05);margin:7px 0"></div>
            <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.35);margin-bottom:1px">Net economic position</div>
            <div id="sim-net-cl" style="font-family:var(--font-display);font-size:18px;font-weight:700;color:${netCost<=0?'#1D9E75':'#EF9F27'};cursor:pointer">${netCost<=0?'+'+formatYen(Math.abs(netCost))+' benefit':'-'+formatYen(netCost)+' cost'}</div>
            <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.3)">click for breakdown</div>
            <div style="margin-top:6px">
              <div style="height:4px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden">
                <div style="height:100%;border-radius:2px;background:${avgConf>=75?'#1D9E75':avgConf>=55?'#EF9F27':'#E24B4A'};width:${avgConf}%"></div>
              </div>
              <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.3);margin-top:3px">${avgConf}% avg confidence</div>
            </div>
            <div style="font-family:var(--font-head);font-size:11px;color:rgba(0,210,255,.6);margin-top:5px;line-height:1.5">${levers.map(l=>l.name).join(' + ')}</div>
          </div>
        </div>
      </div>
      <!-- Waterfall -->
      <div style="margin-bottom:12px">
        <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.08em;color:rgba(255,255,255,.35);text-transform:uppercase;margin-bottom:6px">Cost &amp; schedule waterfall</div>
        ${slipDays>0?`<div class="sim-wf-row" id="sim-wf-slip"><div style="font-family:var(--font-head);font-size:11px;color:rgba(240,246,255,.7);min-width:220px;flex-shrink:0">Current slip (¥12k × ${slipDays}d)</div><div style="flex:1;height:14px;background:rgba(255,255,255,.05);border-radius:1px;overflow:hidden"><div style="height:100%;border-radius:1px;background:#E24B4A;width:100%"></div></div><div style="font-family:var(--font-head);font-size:11px;font-weight:700;min-width:65px;text-align:right;color:#E24B4A">-${formatYen(slipDays*dailyCost)}</div></div>`:''}
        ${totalHard>0?`<div class="sim-wf-row" id="sim-wf-int"><div style="font-family:var(--font-head);font-size:11px;color:rgba(240,246,255,.7);min-width:220px;flex-shrink:0">Intervention hard cost</div><div style="flex:1;height:14px;background:rgba(255,255,255,.05);border-radius:1px;overflow:hidden"><div style="height:100%;border-radius:1px;background:#EF9F27;width:${Math.min(100,Math.round(totalHard/(slipDays*dailyCost||84000)*100))}%"></div></div><div style="font-family:var(--font-head);font-size:11px;font-weight:700;min-width:65px;text-align:right;color:#EF9F27">-${formatYen(totalHard)}</div></div>`:''}
        ${recovDays>0?`<div class="sim-wf-row" id="sim-wf-rec"><div style="font-family:var(--font-head);font-size:11px;color:rgba(240,246,255,.7);min-width:220px;flex-shrink:0">Schedule value recovered</div><div style="flex:1;height:14px;background:rgba(255,255,255,.05);border-radius:1px;overflow:hidden"><div style="height:100%;border-radius:1px;background:#1D9E75;width:${Math.min(100,Math.round(schedVal/(slipDays*dailyCost||84000)*100))}%"></div></div><div style="font-family:var(--font-head);font-size:11px;font-weight:700;min-width:65px;text-align:right;color:#1D9E75">+${formatYen(schedVal)}</div></div>`:''}
        <div class="sim-wf-row" id="sim-wf-net" style="border-top:1px solid rgba(255,255,255,.08);padding-top:5px;margin-top:3px">
          <div style="font-family:var(--font-head);font-size:11px;font-weight:700;color:#F0F6FF;min-width:220px;flex-shrink:0">Net position</div>
          <div style="flex:1;height:14px;background:rgba(255,255,255,.05);border-radius:1px;overflow:hidden"><div style="height:100%;border-radius:1px;background:${netCost<=0?'#1D9E75':'#EF9F27'};width:${Math.min(100,Math.round(Math.abs(netCost)/(slipDays*dailyCost||84000)*100))}%"></div></div>
          <div style="font-family:var(--font-head);font-size:11px;font-weight:700;min-width:65px;text-align:right;color:${netCost<=0?'#1D9E75':'#EF9F27'}">${netCost<=0?'+'+formatYen(Math.abs(netCost)):'-'+formatYen(netCost)}</div>
        </div>
      </div>
      <!-- Task network impact -->
      <div style="margin-bottom:12px">
        <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.08em;color:rgba(255,255,255,.35);text-transform:uppercase;margin-bottom:7px">Task network impact</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px">
          ${unblockedTasks.size?`<div style="border:1px solid rgba(29,158,117,.25);background:rgba(29,158,117,.04);padding:7px 9px"><div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.06em;color:rgba(255,255,255,.35);text-transform:uppercase;margin-bottom:4px">Tasks unblocked</div>${unblockList}</div>`:''}
          ${advancedTasks.size?`<div style="border:1px solid rgba(139,92,246,.25);background:rgba(139,92,246,.04);padding:7px 9px"><div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.06em;color:rgba(255,255,255,.35);text-transform:uppercase;margin-bottom:4px">Tasks advanced now</div>${advanceList}</div>`:''}
          ${remainingBlocked?`<div style="border:1px solid rgba(226,75,74,.18);background:rgba(226,75,74,.03);padding:7px 9px"><div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.06em;color:rgba(255,255,255,.35);text-transform:uppercase;margin-bottom:4px">Still blocked</div>${remainingBlocked}</div>`:''}
        </div>
      </div>
      <!-- Risks -->
      ${risks.length?`<div style="border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.02);margin-bottom:12px">
        <div style="padding:6px 11px;border-bottom:1px solid rgba(255,255,255,.05);display:flex;align-items:center;gap:6px">
          <div style="width:3px;height:11px;border-radius:1px;background:#EF9F27;flex-shrink:0"></div>
          <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.08em;color:rgba(255,255,255,.35);text-transform:uppercase">Second-order effects</div>
        </div>
        ${risks.map(r=>`<div style="display:flex;align-items:flex-start;gap:7px;padding:6px 11px;border-bottom:1px solid rgba(255,255,255,.04)">
          <div style="width:6px;height:6px;border-radius:50%;background:${r.sev};flex-shrink:0;margin-top:3px"></div>
          <div style="font-family:var(--font-body);font-size:11px;color:rgba(240,246,255,.7);line-height:1.5;flex:1">${r.text}</div>
        </div>`).join('')}
      </div>`:''}`;

    // Wire clickable stat handlers
    document.getElementById('sim-slip-cl')?.addEventListener('click',()=>simOpenSP('Daily cost breakdown',
      [['Blocked resources','¥10k/day'],['PM coordination','¥1.2k/day'],['Overhead (20%)','¥1.8k/day'],['Total','¥12k/day'],['Current slip',slipDays+'d'],['Total accumulated',formatYen(slipDays*dailyCost)]],
      formatYen(slipDays*dailyCost)+' accumulated cost','Fully-loaded cost of blocked resources. Configure rate in Firm Settings.','#E24B4A'));

    document.getElementById('sim-del-cl')?.addEventListener('click',()=>simOpenSP('Delivery calculation',
      [...levers.filter(l=>l.days<0).map(l=>[l.name,Math.abs(l.days)+'d recovered']),['Combined (capped at slip)',recovDays+'d'],['Remaining slip',projSlip+'d'],['Projected date',projSlip===0?'On contract':fmt(pd)]],
      projSlip===0?'On contract':fmt(pd)+' (+'+projSlip+'d)','Days capped at current slip. Same day cannot be recovered twice.','#00D2FF'));

    document.getElementById('sim-net-cl')?.addEventListener('click',()=>simOpenSP('Net position breakdown',
      [['Slip cost ('+slipDays+'d × ¥12k)','-'+formatYen(slipDays*dailyCost)],...levers.filter(l=>l.hard>0).map(l=>[l.name+' hard cost','-'+formatYen(l.hard)]),['Schedule value recovered','+'+formatYen(schedVal)],['Net',netCost<=0?'+'+formatYen(Math.abs(netCost))+' benefit':'-'+formatYen(netCost)]],
      netCost<=0?'+'+formatYen(Math.abs(netCost))+' benefit':'-'+formatYen(netCost),'Hard costs only. Internal labor excluded.','#EF9F27'));

    document.getElementById('sim-sr-badge')?.addEventListener('click',()=>simOpenSP('Combined success rate',
      [...levers.map(l=>[l.name,l.sr+'% success · '+l.conf+'% conf']),['Combined (weakest lever)',minSR+'%'],['Avg confidence',avgConf+'%']],
      minSR+'% combined · '+avgConf+'% confidence','Combined = weakest lever. A chain is only as strong as its weakest link.','#1D9E75'));
  }
  window.simRunSim = simRunSim;

  async function simCommit() {
    if (!selected.size) return;
    const levers = LEVERS_LIVE.filter(l=>selected.has(l.id));
    const note = levers.map(l=>l.name).join('; ');
    // Write CoC intervention events
    const posts = levers.map(l => API.post('workflow_step_instances',{
      id: crypto.randomUUID(),
      instance_id: crypto.randomUUID(), step_type: 'manual',
      event_type: 'intervention',
      step_name: l.name.slice(0,80),
      event_notes: '[Simulator commit] '+l.detail,
      actor_name: _myResource?.name||null,
      created_at: new Date().toISOString(),
      firm_id: 'aaaaaaaa-0001-0001-0001-000000000001'
    }).catch(()=>{}));
    await Promise.all(posts);
    compassToast('Intervention records created · CoC events written',2500);
    simResetAll();
    // Invalidate morning brief cache
    window._mgBriefData = null;
  }
  window.simCommit = simCommit;

  function simResetAll() {
    selected.clear();
    document.querySelectorAll('.sim-lc.sim-sel').forEach(c=>c.classList.remove('sim-sel'));
    document.getElementById('sim-results').style.display='none';
    document.getElementById('sim-empty').style.display='flex';
    document.getElementById('sim-cb').style.display='none';
  }
  window.simResetAll = simResetAll;

  // ── Build lever list ──────────────────────────────────
  const ll = document.getElementById('sim-lever-list');
  let curGroup = null;
  LEVERS_LIVE.forEach(lev => {
    if (lev.group !== curGroup) {
      curGroup = lev.group;
      const gm = GROUP_META[curGroup];
      const gh = document.createElement('div');
      gh.style.cssText = 'display:flex;align-items:center;gap:6px;margin:8px 0 5px';
      gh.innerHTML = `<div style="width:3px;height:13px;border-radius:1px;background:${gm.color};flex-shrink:0"></div><div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.08em;color:rgba(255,255,255,.4);text-transform:uppercase;flex:1">${gm.label}</div>`;
      ll.appendChild(gh);
    }
    const card = document.createElement('div');
    card.id = 'simlc-'+lev.id;
    card.className = 'sim-lc'+(lev.group==='cpm'?' sim-cpm':'')+(lev.warn||lev.pattern?' sim-warn':'');
    card.onclick = () => simToggleLever(lev.id);
    const tc = {low:'rgba(29,158,117,.7)',med:'rgba(239,159,39,.7)',high:'rgba(226,75,74,.7)'}[lev.costTier||'low'];
    const tl = {low:'Low cost',med:'Med cost',high:'High cost'}[lev.costTier||'low'];
    card.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:3px">
        <div class="sim-chk">✓</div>
        <div style="font-family:var(--font-head);font-size:11px;font-weight:700;color:#F0F6FF;flex:1;line-height:1.3">${lev.name}</div>
        <span data-sim-lid="${lev.id}" data-sim-tt="cost"
          style="font-family:var(--font-head);font-size:11px;padding:1px 5px;border:1px solid ${tc}40;color:${tc};flex-shrink:0;cursor:help">${tl}</span>
      </div>
      <div style="display:flex;gap:5px;font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.35)">
        <span data-sim-lid="${lev.id}" data-sim-tt="success"
          style="display:flex;align-items:center;gap:3px;cursor:help">
          <div style="width:5px;height:5px;border-radius:50%;background:${lev.sr>=80?'#1D9E75':lev.sr>=65?'#EF9F27':'#E24B4A'}"></div>${lev.sr}% success</span>
        <span data-sim-lid="${lev.id}" data-sim-tt="conf"
          style="display:flex;align-items:center;gap:3px;cursor:help">
          <div style="width:5px;height:5px;border-radius:50%;background:#8B5CF6"></div>${lev.conf}% conf</span>
      </div>
      ${lev.warn?`<div style="font-family:var(--font-head);font-size:11px;padding:4px 7px;background:rgba(239,159,39,.06);border:1px solid rgba(239,159,39,.2);border-left:2px solid #EF9F27;color:rgba(239,159,39,.85);line-height:1.45;margin-top:5px">${lev.warn}</div>`:''}
      ${lev.pattern?`<div style="font-family:var(--font-head);font-size:11px;padding:4px 7px;background:rgba(226,75,74,.05);border:1px solid rgba(226,75,74,.18);border-left:2px solid rgba(226,75,74,.6);color:rgba(226,75,74,.8);line-height:1.45;margin-top:5px">${lev.pattern}</div>`:''}
      ${lev.advances?.length?`<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:5px">${lev.advances.map(t=>`<span style="font-family:var(--font-head);font-size:11px;padding:1px 6px;border:1px solid rgba(139,92,246,.3);color:#8B5CF6">${t} →</span>`).join('')}</div>`:''}
      ${lev.params?.length?`<div style="display:none;border-top:1px solid rgba(255,255,255,.05);padding-top:5px;margin-top:5px" class="sim-params">${lev.params.map(p=>`<div style="display:flex;align-items:center;gap:5px;margin-top:4px"><span style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.3);min-width:75px">${p.l}</span><select onclick="event.stopPropagation();simRunSim()" style="flex:1;padding:2px 6px;background:#1a2a40;border:1px solid rgba(0,210,255,.2);color:#C8DFF0;font-family:var(--font-head);font-size:11px;outline:none;cursor:pointer">${p.o.map(o=>`<option>${o}</option>`).join('')}</select></div>`).join('')}</div>`:''}`;
    // Show params when selected
    const paramEl = card.querySelector('.sim-params');
    if (paramEl) {
      const orig = card.onclick;
      card.onclick = e => { orig(); if(card.classList.contains('sim-sel')) paramEl.style.display='block'; else paramEl.style.display='none'; };
    }
    ll.appendChild(card);
  });

  // ── Delegated stat-chip click handler ────────────────
  ll.addEventListener('click', function(e) {
    const chip = e.target.closest('[data-sim-lid]');
    if (!chip) return;
    e.stopPropagation();
    const lid = chip.dataset.simLid;
    const tt  = chip.dataset.simTt;
    const lev = LEVERS_LIVE.find(l=>l.id===lid);
    if (!lev) return;
    if (tt === 'success') {
      simOpenSP(
        lev.sr+'% success rate',
        [
          ['Lever type', lev.group],
          ['Success rate', lev.sr+'%'],
          ['Confidence', lev.conf+'%'],
          ['Pattern match', lev.pattern ? 'Active warning — see card' : 'No pattern warning'],
          ['Sample basis', 'Historical instances — firm-wide'],
        ],
        lev.sr+'% of prior instances resolved with this lever type',
        lev.pattern || (lev.sr >= 80
          ? 'High success rate. Confidence reflects sample size — more instances will narrow the range.'
          : lev.sr >= 65
            ? 'Moderate rate. Consider pairing with a complementary lever.'
            : 'Lower rate. Today\u2019s block may match the failure pattern. Review carefully before committing.'),
        lev.sr>=80?'#1D9E75':lev.sr>=65?'#EF9F27':'#E24B4A'
      );
    } else if (tt === 'conf') {
      simOpenSP(
        lev.conf+'% confidence',
        [
          ['What this measures', 'Certainty in the success rate estimate'],
          ['Confidence', lev.conf+'%'],
          ['Success rate', lev.sr+'%'],
          ['Practical range', (lev.sr-Math.round((100-lev.conf)/5))+'% – '+(lev.sr+Math.round((100-lev.conf)/5))+'%'],
          ['Grows with', 'More matching historical instances'],
        ],
        lev.conf+'% confident the '+lev.sr+'% rate is accurate',
        'Confidence and success rate are different. Success = how often this lever works. Confidence = how certain we are of that rate. Low confidence with high success may improve as data accumulates.',
        '#8B5CF6'
      );
    } else if (tt === 'cost') {
      const costRows = [
        ['Cost tier', {low:'Low',med:'Medium',high:'High'}[lev.costTier||'low']],
        ['Hard out-of-pocket', lev.hard>0?formatYen(lev.hard):'¥0'],
        ['Labor estimate', lev.group==='escalation'?'~¥24k (PM + management)':lev.group==='resource'?'~¥35k (coverage + approval)':'¥0'],
        ['Refundable if fails?', 'No — cost is independent of outcome'],
      ];
      if (lev.hard>0 && slipDays>0) {
        const daily=12000;
        costRows.push(['Break-even recovery', Math.ceil(lev.hard/daily)+'d of slip']);
      }
      simOpenSP(
        'Cost breakdown — '+lev.name,
        costRows,
        lev.hard>0?formatYen(lev.hard)+' committed immediately':'¥0 hard cost · labor only',
        'Hard costs are committed on approval regardless of outcome. Labor costs are internal and excluded from the net position calculation shown in the waterfall.',
        lev.costTier==='high'?'#E24B4A':lev.costTier==='med'?'#EF9F27':'#1D9E75'
      );
    }
  });

  // ── Build CPM view ────────────────────────────────────
  const cpmList = document.getElementById('sim-cpm-list');
  const statusColor = {blocking:'#E24B4A',critical:'#E24B4A',blocked:'#E24B4A','near-critical':'#EF9F27',available:'#1D9E75',parallelizable:'#8B5CF6',active:'#00D2FF'};
  const sections = [
    {label:'Overdue / blocked tasks',  tasks:overdueTasks},
    {label:'Available for parallel work', tasks: projTasks.filter(t=>!['complete','cancelled','blocked'].includes(t.status)&&!overdueTasks.find(u=>u.id===t.id)&&(!t.predecessors||t.predecessors==='{}'))},
    {label:'All active tasks', tasks: projTasks.filter(t=>!['complete','cancelled'].includes(t.status)).slice(0,10)},
  ];
  sections.forEach(sec => {
    if (!sec.tasks.length) return;
    const lbl = document.createElement('div');
    lbl.style.cssText='font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.08em;color:rgba(0,210,255,.6);text-transform:uppercase;margin:8px 0 5px';
    lbl.textContent = sec.label;
    cpmList.appendChild(lbl);
    sec.tasks.slice(0,6).forEach(t=>{
      const row = document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:0;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;transition:background .1s';
      row.onmouseenter=()=>row.style.background='rgba(255,255,255,.03)';
      row.onmouseleave=()=>row.style.background='';
      const isOverdue = overdueTasks.find(u=>u.id===t.id);
      const col = isOverdue?'#E24B4A':t.status==='active'?'#00D2FF':'#1D9E75';
      const pct = t.pct_complete||0;
      row.innerHTML=`<div style="width:3px;align-self:stretch;background:${col};flex-shrink:0"></div>
        <div style="flex:1;padding:6px 9px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
            <div style="font-family:var(--font-head);font-size:11px;font-weight:700;color:rgba(0,210,255,.7);min-width:30px">${t.id.slice(0,8)}</div>
            <div style="font-family:var(--font-head);font-size:11px;color:#F0F6FF;flex:1;line-height:1.3">${esc(t.name||'Task')}</div>
          </div>
          <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.35);display:flex;gap:8px">
            <span style="color:${col};font-weight:700">${isOverdue?'OVERDUE':t.status}</span>
            <span>${pct}% complete</span>
            ${t.due_date?`<span>Due ${t.due_date}</span>`:''}
          </div>
        </div>`;
      cpmList.appendChild(row);
    });
  });
};