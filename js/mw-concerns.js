function updateConcernBadge() {
  const unread = (window._userConcerns||[]).filter(c=>c.status==='unread'||c.status==='not_yet_read').length;
  const badge = document.getElementById('ust-concerns-badge');
  if (badge) {
    if (unread > 0) {
      badge.textContent = unread+' unread';
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  }
  // Nav bar concern badge (if visible from other views)
  const navBadge = document.getElementById('concern-nav-badge');
  if (navBadge && unread > 0) { navBadge.textContent = unread; navBadge.style.display='flex'; }
}

function renderUserConcerns() {
  const el = document.getElementById('user-concerns-content');
  if (!el) return;
  const f = window._concernFilter;
  const today = new Date().toLocaleDateString('en-CA');

  const filtered = (window._userConcerns||[]).filter(c => {
    if (f==='all')        return true;
    if (f==='unread')     return c.status==='unread'||c.status==='not_yet_read';
    if (f==='open')       return ['unread','not_yet_read','acknowledged'].includes(c.status);
    if (f==='inprogress') return c.status==='in_progress';
    if (f==='resolved')   return c.status==='resolved';
    if (f==='rejected')   return c.status==='rejected';
    return true;
  });

  const statusColors = {
    'unread':'#E24B4A','not_yet_read':'#E24B4A',
    'acknowledged':'#EF9F27',
    'in_progress':'#00D2FF',
    'resolved':'#1D9E75',
    'rejected':'rgba(255,255,255,.2)'
  };
  const statusLabels = {
    'unread':'Not yet read','not_yet_read':'Not yet read',
    'acknowledged':'Acknowledged',
    'in_progress':'In progress',
    'resolved':'Resolved',
    'rejected':'Rejected'
  };
  const barColors = {
    'unread':'#E24B4A','not_yet_read':'#E24B4A',
    'acknowledged':'#EF9F27',
    'in_progress':'#00D2FF',
    'resolved':'#1D9E75',
    'rejected':'rgba(255,255,255,.2)'
  };

  const quickCapture = `<div style="display:flex;gap:8px;margin-bottom:12px;padding:8px 10px;background:rgba(0,210,255,.04);border:1px solid rgba(0,210,255,.15)">
    <textarea id="concern-new-text" style="flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#C8DFF0;font-family:var(--font-body);font-size:12px;padding:5px 8px;outline:none;resize:none;box-sizing:border-box" rows="2" placeholder="Describe your concern — logged with timestamp and routed to your PM…"></textarea>
    <div style="display:flex;flex-direction:column;gap:4px">
      <select id="concern-new-priority" style="font-family:var(--font-head);font-size:11px;padding:3px 6px;background:#1a2a40;border:1px solid rgba(0,210,255,.2);color:#C8DFF0;outline:none;cursor:pointer">
        <option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option><option value="low">Low</option>
      </select>
      <select id="concern-new-visibility" style="font-family:var(--font-head);font-size:11px;padding:3px 6px;background:#1a2a40;border:1px solid rgba(0,210,255,.2);color:#C8DFF0;outline:none;cursor:pointer">
        <option value="pm">PM only</option><option value="management">Management</option><option value="all">All</option>
      </select>
      <button onclick="uRaiseConcern()" style="font-family:var(--font-head);font-size:11px;padding:4px 10px;background:none;border:1px solid rgba(0,210,255,.35);color:#00D2FF;cursor:pointer;white-space:nowrap;letter-spacing:.06em;transition:background .1s" onmouseenter="this.style.background='rgba(0,210,255,.08)'" onmouseleave="this.style.background='none'">+ Raise concern</button>
    </div>
  </div>`;

  const filterBar = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap">
    <span style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.35);letter-spacing:.06em;text-transform:uppercase">Status</span>
    ${[['all','All'],['unread','Unread'],['open','Open'],['inprogress','In progress'],['resolved','Resolved'],['rejected','Rejected']].map(([v,l])=>`<button onclick="window._concernFilter='${v}';renderUserConcerns()"
      style="font-family:var(--font-head);font-size:11px;padding:2px 9px;background:${window._concernFilter===v?'rgba(0,210,255,.06)':'none'};border:1px solid ${window._concernFilter===v?'rgba(0,210,255,.4)':'rgba(255,255,255,.1)'};color:${window._concernFilter===v?'#00D2FF':'rgba(255,255,255,.5)'};cursor:pointer;transition:.12s">${l}</button>`).join('')}
  </div>`;

  if (!filtered.length && !(window._userConcerns||[]).length) {
    el.innerHTML = quickCapture + filterBar + '<div style="font-family:var(--font-head);font-size:12px;color:#3A5C80;padding:24px 0;text-align:center">No concerns raised yet.<br>Use the form above to log your first concern.</div>';
    return;
  }
  if (!filtered.length) {
    el.innerHTML = quickCapture + filterBar + '<div style="font-family:var(--font-head);font-size:12px;color:#3A5C80;padding:16px 0;text-align:center">No concerns match this filter.</div>';
    return;
  }

  const rows = filtered.map(c => {
    const barCol    = barColors[c.status]||'rgba(255,255,255,.2)';
    const statCol   = statusColors[c.status]||'rgba(255,255,255,.4)';
    const statLabel = statusLabels[c.status]||c.status;
    const expandId  = 'uconcern-exp-'+c.id;
    const metaParts = [c.cid, c.raisedAt?_timeAgo(c.raisedAt):'', c.project, c.phase].filter(Boolean);
    // Thread entries — top-level only (replies nested below their parent)
    const topThread = (c.thread||[]).filter(e=>!e.parent_id);
    const threadHtml = topThread.length > 0
      ? topThread.map((e,i,arr) => {
          const replies = (c.thread||[]).filter(r=>r.parent_id===e.id);
          const dotColor = e.type==='resolution'?'#1D9E75':e.type==='escalation'?'#E24B4A':e.type==='acknowledgement'?'#EF9F27':'rgba(0,210,255,.6)';
          const replyHtml = replies.map(r=>`<div style="display:flex;gap:8px;margin:4px 0 0 24px">
            <div style="width:6px;height:6px;border-radius:50%;background:rgba(0,210,255,.4);flex-shrink:0;margin-top:3px"></div>
            <div style="flex:1">
              <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.35);margin-bottom:1px">${esc(r.who||'You')} · ${r.when?_timeAgo(r.when):''}</div>
              <div style="font-family:var(--font-body);font-size:11px;color:rgba(240,246,255,.65);line-height:1.5">${esc(r.text||'')}</div>
            </div>
          </div>`).join('');
          return `<div style="display:flex;gap:8px;margin-bottom:0">
            <div style="display:flex;flex-direction:column;align-items:center;width:16px;flex-shrink:0">
              <div style="width:8px;height:8px;border-radius:50%;background:${dotColor}"></div>
              ${i<arr.length-1?'<div style="flex:1;width:1px;background:rgba(255,255,255,.08);margin:2px auto 0;min-height:8px"></div>':''}
            </div>
            <div style="flex:1;padding-bottom:8px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
                <span style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.35);flex:1">${esc(e.who||'You')} · ${e.when?_timeAgo(e.when):''}</span>
                <button onclick="uToggleConcernReply('${c.id}','${e.id}')"
                  style="background:none;border:none;font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.3);cursor:pointer;padding:0;transition:color .1s"
                  onmouseenter="this.style.color='#00D2FF'" onmouseleave="this.style.color='rgba(255,255,255,.3)'">↩ Reply</button>
              </div>
              <div style="font-family:var(--font-body);font-size:11px;color:rgba(240,246,255,.7);line-height:1.5">${esc(e.text||'')}</div>
              ${replyHtml}
              <div id="ucr-reply-${c.id}-${e.id}" style="display:none;margin-top:5px">
                <div style="display:flex;gap:5px">
                  <textarea id="ucr-reply-ta-${c.id}-${e.id}" placeholder="Reply…"
                    style="flex:1;padding:5px 8px;font-family:var(--font-body);font-size:11px;background:rgba(255,255,255,.04);border:1px solid rgba(0,210,255,.2);color:#C8DFF0;resize:none;min-height:40px;outline:none;box-sizing:border-box"
                    onkeydown="if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();uSubmitConcernReply('${c.id}','${e.id}')}"></textarea>
                  <button onclick="uSubmitConcernReply('${c.id}','${e.id}')"
                    style="font-family:var(--font-head);font-size:11px;padding:0 12px;background:#00D2FF;border:none;color:#060a10;cursor:pointer;font-weight:700;white-space:nowrap;align-self:flex-end;height:30px">Reply</button>
                </div>
              </div>
            </div>
          </div>`;
        }).join('')
      : `<div style="font-family:var(--font-head);font-size:11px;color:#3A5C80">Awaiting acknowledgement from PM.</div>`;

    return `<div style="display:flex;align-items:flex-start;gap:0;border:1px solid rgba(255,255,255,.07);margin-bottom:6px;cursor:pointer;transition:border-color .1s" onmouseenter="this.style.borderColor='rgba(0,210,255,.2)'" onmouseleave="this.style.borderColor='rgba(255,255,255,.07)'">
      <div style="width:4px;align-self:stretch;background:${barCol};flex-shrink:0"></div>
      <div style="flex:1;padding:9px 12px">
        <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:4px">
          <div style="font-family:var(--font-head);font-size:12px;font-weight:700;color:#F0F6FF;flex:1;line-height:1.3">${esc(c.title)}</div>
          <span style="font-family:var(--font-head);font-size:11px;padding:2px 8px;border:1px solid ${statCol}40;color:${statCol};background:${statCol}12;flex-shrink:0;white-space:nowrap">${statLabel}</span>
        </div>
        <div style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.4);margin-bottom:4px;display:flex;gap:10px;flex-wrap:wrap">${metaParts.map(p=>`<span>${p}</span>`).join('')}</div>
        ${c.description?`<div style="font-family:var(--font-body);font-size:11px;color:rgba(240,246,255,.65);line-height:1.55">${esc(c.description.slice(0,180))}${c.description.length>180?'…':''}</div>`:''}
        <div id="${expandId}" style="display:none;margin-top:8px">
          <div style="font-family:var(--font-head);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:6px">CoC history</div>
          <div style="border-left:1px solid rgba(0,210,255,.15);padding-left:8px;margin-bottom:8px">${threadHtml}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">
            ${['in_progress','resolved'].includes(c.status)?'':`<span style="font-family:var(--font-head);font-size:11px;color:rgba(255,255,255,.35)">Escalate to</span>
            <select onchange="" style="font-family:var(--font-head);font-size:11px;padding:2px 8px;background:#1a2a40;border:1px solid rgba(0,210,255,.2);color:#C8DFF0;outline:none;cursor:pointer">
              <option>PM</option><option>Management</option><option>Executive</option>
            </select>
            <button onclick="uEscalateConcern('${c.id}')" style="font-family:var(--font-head);font-size:11px;padding:3px 10px;background:rgba(0,210,255,.08);border:1px solid rgba(0,210,255,.3);color:#00D2FF;cursor:pointer;letter-spacing:.06em">Escalate →</button>`}
            <button onclick="uToggleConcernCompose('${c.id}')"
              style="font-family:var(--font-head);font-size:11px;padding:3px 10px;background:none;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.4);cursor:pointer;transition:color .1s"
              onmouseenter="this.style.color='#F0F6FF'" onmouseleave="this.style.color='rgba(255,255,255,.4)'">+ Add comment</button>
            ${c.status==='in_progress'?`<button onclick="uResolveConcern('${c.id}')" style="font-family:var(--font-head);font-size:11px;padding:3px 10px;background:none;border:1px solid rgba(29,158,117,.35);color:#1D9E75;cursor:pointer">Mark resolved</button>`:''}
          </div>
          <!-- Inline comment compose (toggled) -->
          <div id="uconcern-compose-${c.id}" style="display:none;margin-top:8px;border-top:1px solid rgba(255,255,255,.06);padding-top:8px">
            <div style="display:flex;gap:5px">
              <textarea id="uconcern-compose-ta-${c.id}" placeholder="Add a comment… (Ctrl+Enter to send)"
                style="flex:1;padding:6px 8px;font-family:var(--font-body);font-size:12px;background:rgba(255,255,255,.04);border:1px solid rgba(0,210,255,.2);color:#C8DFF0;resize:none;min-height:48px;outline:none;box-sizing:border-box"
                onkeydown="if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();uSubmitConcernComment('${c.id}')}"></textarea>
              <button onclick="uSubmitConcernComment('${c.id}')"
                style="font-family:var(--font-head);font-size:11px;padding:0 14px;background:#00D2FF;border:none;color:#060a10;cursor:pointer;font-weight:700;align-self:flex-end;height:32px">Send</button>
            </div>
          </div>
        </div>
      </div>
      <div style="padding:9px 10px;flex-shrink:0">
        <button onclick="event.stopPropagation();uToggleConcernExpand('${expandId}')"
          style="font-family:var(--font-head);font-size:11px;padding:3px 10px;background:none;border:1px solid ${c.status==='unread'||c.status==='not_yet_read'?'rgba(0,210,255,.35)':'rgba(255,255,255,.15)'};color:${c.status==='unread'||c.status==='not_yet_read'?'#00D2FF':'rgba(255,255,255,.4)'};cursor:pointer;letter-spacing:.06em">Open</button>
      </div>
    </div>`;
  });

  el.innerHTML = quickCapture + filterBar + rows.join('');
}

window.uToggleConcernExpand = function(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = el.style.display==='none' ? 'block' : 'none';
};

window.uRaiseConcern = async function() {
  const txt        = document.getElementById('concern-new-text')?.value?.trim()||'';
  const priority   = document.getElementById('concern-new-priority')?.value||'medium';
  const visibility = document.getElementById('concern-new-visibility')?.value||'pm';
  if (!txt) { compassToast('Enter a concern description',2000); return; }
  const resId = _myResource?.id;
  const newId = crypto.randomUUID();
  const now   = new Date().toISOString();
  try {
    await API.post('concerns',{
      id: newId,
      firm_id: 'aaaaaaaa-0001-0001-0001-000000000001',
      raiser_resource_id: resId||null,
      raiser_name: _myResource?.name||null,
      title: txt.slice(0,100),
      description: txt,
      status: 'unread',
      priority,
      visibility,
      raised_at: now,
    });
    // First comment = the original concern text
    await API.post('concern_comments',{
      concern_id:          newId,
      firm_id:             'aaaaaaaa-0001-0001-0001-000000000001',
      author_resource_id:  resId||null,
      author_name:         _myResource?.name||'You',
      body:                txt,
      event_type:          'comment',
      created_at:          now,
    }).catch(()=>{});
    document.getElementById('concern-new-text').value = '';
    compassToast('Concern logged · C-### assigned',2200);
    window._concernsLoaded = false;
    loadUserConcerns();
  } catch(e) {
    console.error('[Compass] concern post error:',e);
    compassToast('Failed to log concern — '+e.message,3000);
  }
};

window.uEscalateConcern = async function(concernId) {
  try {
    await API.patch(`concerns?id=eq.${concernId}`,{status:'in_progress'});
    await API.post('concern_comments',{
      concern_id: concernId,
      firm_id:    'aaaaaaaa-0001-0001-0001-000000000001',
      author_resource_id: _myResource?.id||null,
      author_name: _myResource?.name||'You',
      body: 'Concern escalated.',
      event_type: 'escalation',
      created_at: new Date().toISOString(),
    });
    compassToast('Escalated · status → In progress',2200);
    window._concernsLoaded = false;
    loadUserConcerns();
  } catch(e) { compassToast('Failed: '+e.message,2500); }
};

window.uToggleConcernCompose = function(concernId) {
  const el = document.getElementById('uconcern-compose-'+concernId);
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  if (!open) setTimeout(()=>document.getElementById('uconcern-compose-ta-'+concernId)?.focus(), 50);
};

window.uSubmitConcernComment = async function(concernId, parentId) {
  const taId = parentId ? 'ucr-reply-ta-'+concernId+'-'+parentId : 'uconcern-compose-ta-'+concernId;
  const ta   = document.getElementById(taId);
  const txt  = ta?.value?.trim()||'';
  if (!txt) { compassToast('Enter a comment',1500); return; }
  try {
    await API.post('concern_comments',{
      concern_id:          concernId,
      firm_id:             'aaaaaaaa-0001-0001-0001-000000000001',
      parent_id:           parentId||null,
      author_resource_id:  _myResource?.id||null,
      author_name:         _myResource?.name||'You',
      body:                txt,
      event_type:          'comment',
      created_at:          new Date().toISOString(),
    });
    if (ta) ta.value = '';
    // Hide compose / reply area
    if (parentId) {
      const replyEl = document.getElementById('ucr-reply-'+concernId+'-'+parentId);
      if (replyEl) replyEl.style.display = 'none';
    } else {
      const composeEl = document.getElementById('uconcern-compose-'+concernId);
      if (composeEl) composeEl.style.display = 'none';
    }
    compassToast('Comment added',2000);
    window._concernsLoaded = false;
    loadUserConcerns();
  } catch(e) { compassToast('Failed: '+e.message,2500); }
};

window.uAddConcernComment = function(concernId) {
  // Legacy alias — now delegates to inline compose toggle
  window.uToggleConcernCompose(concernId);
};

window.uToggleConcernReply = function(concernId, commentId) {
  const el = document.getElementById('ucr-reply-'+concernId+'-'+commentId);
  if (!el) return;
  const open = el.style.display !== 'none';
  // Close all other reply boxes on this concern first
  document.querySelectorAll('[id^="ucr-reply-'+concernId+'-"]').forEach(e => e.style.display='none');
  if (!open) {
    el.style.display = 'block';
    setTimeout(()=>document.getElementById('ucr-reply-ta-'+concernId+'-'+commentId)?.focus(), 50);
  }
};

window.uSubmitConcernReply = function(concernId, parentId) {
  window.uSubmitConcernComment(concernId, parentId);
};

window.uResolveConcern = async function(concernId) {
  try {
    const now = new Date().toISOString();
    await API.patch(`concerns?id=eq.${concernId}`,{
      status: 'resolved',
      resolved_at: now,
      resolved_by: _myResource?.name||null,
    });
    await API.post('concern_comments',{
      concern_id: concernId,
      firm_id:    'aaaaaaaa-0001-0001-0001-000000000001',
      author_resource_id: _myResource?.id||null,
      author_name: _myResource?.name||'You',
      body: 'Marked resolved.',
      event_type: 'resolution',
      created_at: now,
    });
    compassToast('Resolved · CoC updated',2000);
    window._concernsLoaded = false;
    loadUserConcerns();
  } catch(e) { compassToast('Failed: '+e.message,2500); }
};

// Auto-load concerns count for badge on view init
document.addEventListener('compass-identity-ready', () => {
  if (_myResource?.id) {
    // Badge count from concerns table
    API.get(`concerns?raiser_resource_id=eq.${_myResource.id}&status=eq.unread&select=id&limit=20`).then(rows=>{
      const unread=(rows||[]).length;
      const badge=document.getElementById('ust-concerns-badge');
      if(badge&&unread>0){badge.textContent=unread+' unread';badge.className='ust-badge ust-badge-red';badge.style.display='inline';}
    }).catch(()=>{});
  }
});