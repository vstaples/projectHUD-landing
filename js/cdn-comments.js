// cdn-comments.js — Cadence: comment threads, action item CRUD, file attachments
// LOAD ORDER: 13th

function _avatarHtml(name, size) {
  size = size || 22;
  const initials = (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0,2).toUpperCase();
  const colors   = ['#4F8EF7','#1D9E75','#e8a838','#E24B4A','#9b59b6','#00b8d4','#e67e22','#2ecc71'];
  const hue      = (name || '').split('').reduce((a,c) => a + c.charCodeAt(0), 0) % colors.length;
  const bg       = colors[hue];
  const fs       = Math.round(size * 0.42);
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};
    flex-shrink:0;display:flex;align-items:center;justify-content:center;
    font-size:${fs}px;font-weight:700;color:#fff;font-family:var(--font-hud);
    letter-spacing:.02em">${initials}</div>`;
}

function _validateCommentPost(stepId) {
  const bodyEl   = document.getElementById(`comment-body-${stepId}`);
  const hoursEl  = document.getElementById(`comment-hours-${stepId}`);
  const submitBtn = document.querySelector(`button[onclick="postStepComment('${stepId.replace(/'/g,"\\'")}','${stepId.replace(/'/g,"\\'")}')"]`);
  const statusEl = document.getElementById(`comment-status-${stepId}`);
  // Find the submit button more reliably
  const allBtns = document.querySelectorAll(`[onclick*="postStepComment"][onclick*="${stepId}"]`);
  const btn = allBtns[0];
  if (!btn) return;

  const body  = (bodyEl?.value || '').trim();
  const hours = hoursEl?.value ? parseFloat(hoursEl.value) : 0;
  const hasHours = hours > 0;
  const MIN_CHARS_WITH_HOURS = 20;

  if (hasHours && body.length < MIN_CHARS_WITH_HOURS) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    if (statusEl) statusEl.textContent = `Describe work completed to log hours (${body.length}/${MIN_CHARS_WITH_HOURS} chars)`;
  } else if (!body) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    if (statusEl) statusEl.textContent = '';
  } else {
    btn.disabled = false;
    btn.style.opacity = '1';
    if (statusEl && hasHours) {
      statusEl.textContent = `Logging ${hours}h`;
      statusEl.style.color = 'var(--amber)';
    } else if (statusEl) {
      statusEl.textContent = '';
    }
  }
}

function setCommentConf(stepId, conf) {
  const current = _commentConf[stepId];
  const next = current === conf ? null : conf;
  _commentConf[stepId] = next;
  const colors = { green: 'var(--green)', yellow: 'var(--amber)', red: 'var(--red)' };
  const labels = { green: 'On track', yellow: 'Uncertain', red: 'Blocked' };
  ['green','yellow','red'].forEach(c => {
    const btn = document.getElementById(`conf-${c}-${stepId}`);
    if (!btn) return;
    btn.style.background = (next === c) ? colors[c] : 'transparent';
  });
  const lbl = document.getElementById(`conf-label-${stepId}`);
  if (lbl) lbl.textContent = next ? labels[next] : '';
}

async function postStepComment(instId, stepId) {
  const bodyEl  = document.getElementById(`comment-body-${stepId}`);
  const hoursEl = document.getElementById(`comment-hours-${stepId}`);
  const statusEl = document.getElementById(`comment-status-${stepId}`);
  const body = (bodyEl?.value || '').trim();
  const hours = hoursEl?.value ? parseFloat(hoursEl.value) : null;

  if (!body) { if (statusEl) { statusEl.textContent = 'Note is empty.'; setTimeout(() => statusEl.textContent='', 2000); } return; }
  if (hours && hours > 0 && body.length < 20) {
    if (statusEl) { statusEl.textContent = 'Describe the work completed to log hours.'; setTimeout(() => statusEl.textContent='', 3000); }
    return;
  }
  const inst  = _selectedInstance;
  const conf  = _commentConf[stepId] || null;
  const authorName = inst?._pmName || 'Vaughn W. Staples';

  if (statusEl) statusEl.textContent = 'Posting…';

  const newCommentId = crypto.randomUUID();
  const row = {
    id:                newCommentId,
    firm_id:           FIRM_ID_CAD,
    instance_id:       instId,
    template_step_id:  stepId,
    author_name:       authorName,
    body,
    confidence:        conf,
    hours_logged:      hours,
    flag_type:         'none',
  };

  try {
    await API.post('step_comments', row);

    // ── Unified timesheet: write time_entries row when hours are logged ───
    // Non-fatal — silent failure if schema not yet migrated
    if (hours && hours > 0) {
      const step      = inst._tmplSteps?.find(s => s.id === stepId);
      const today     = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
      const projId    = inst.project_id || null;
      const teRow = {
        firm_id:                FIRM_ID_CAD,
        resource_id:            _myResourceId || null,
        user_id:                _myUserId     || null,
        project_id:             projId,
        instance_id:            instId,
        template_step_id:       stepId,
        step_name:              step?.name || null,
        source_type:            'step_comment',
        source_step_comment_id: newCommentId,
        date:                   today,
        hours,
        is_billable:            true,
        notes:                  body.slice(0, 200),
      };
      API.post('time_entries', teRow).catch(() => {});
    }

    // Append to local cache with the pre-generated ID
    if (!inst._stepComments) inst._stepComments = [];
    inst._stepComments.push({ ...row, created_at: new Date().toISOString() });

    // Reset input
    bodyEl.value = '';
    if (hoursEl) hoursEl.value = '';
    _commentConf[stepId] = null;
    setCommentConf(stepId, null);
    if (statusEl) statusEl.textContent = '';

    // Re-render thread
    _renderCommentThread(stepId);

  } catch(e) {
    if (statusEl) { statusEl.textContent = 'Failed — try again.'; setTimeout(() => statusEl.textContent='', 3000); }
  }
}

function _renderCommentThread(stepId) {
  const inst = _selectedInstance;
  if (!inst) return;
  const threadEl = document.getElementById(`comment-thread-${stepId}`);
  const countEl  = document.getElementById(`comment-count-${stepId}`);
  if (!threadEl) return;

  // ── Rejection context cards ───────────────────────────────────────────────
  // Find all step_reset events that landed on this step, then walk back through
  // the CoC to find the step_completed (requiresReset) event that caused each one,
  // and surface its event_notes as a pinned read-only context card.
  const coc = (inst._stepInsts || [])
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const steps = inst._tmplSteps || [];

  // Collect all (rejection → this step) pairs, deduplicating by note text
  // so repeated rework loops don't flood the thread — show only the most
  // recent rejection from each source step.
  const rejectionMap = {}; // key: rejecting step_id → most recent rejection event

  coc.forEach((evt, idx) => {
    if (evt.event_type !== 'step_completed') return;
    const srcStep = steps.find(s => s.id === evt.template_step_id);
    if (!srcStep) return;
    const oDef = _getOutcomes(srcStep).find(o => o.id === evt.outcome);
    if (!oDef?.requiresReset) return;
    if (!evt.event_notes?.trim()) return;

    // Find the step_activated event immediately after this rejection
    const afterMs = new Date(evt.created_at).getTime();
    const nextActivation = coc.slice(idx + 1).find(e =>
      e.event_type === 'step_activated'
    );
    if (!nextActivation) return;
    if (nextActivation.template_step_id !== stepId) return;

    // This rejection sent flow back to our step — record it
    rejectionMap[srcStep.id] = {
      note:       evt.event_notes.trim(),
      actor:      evt.actor_name && evt.actor_name !== 'System' ? evt.actor_name : null,
      stepName:   srcStep.name || srcStep.step_type,
      outcomeLabel: oDef.label || oDef.id,
      createdAt:  evt.created_at,
    };
  });

  const rejections = Object.values(rejectionMap)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // most recent first

  // Build rejection context HTML
  const rejectionHtml = rejections.map(r => {
    const ts = r.createdAt
      ? new Date(r.createdAt).toLocaleString('en-US', {
          month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit'
        })
      : '';
    return `
      <div style="display:flex;gap:8px;padding:9px 10px;margin-bottom:6px;
        background:rgba(226,75,74,.07);
        border:1px solid rgba(226,75,74,.25);
        border-left:3px solid var(--red);">
        <div style="color:var(--red);font-size:14px;flex-shrink:0;line-height:1.2">&#8617;</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;
            color:var(--red);margin-bottom:4px">
            Returned from ${escHtml(r.stepName)}
            <span style="font-weight:400;letter-spacing:0;text-transform:none;
              color:rgba(226,75,74,.7)"> — ${escHtml(r.outcomeLabel)}</span>
          </div>
          <div style="font-size:11px;color:var(--text);line-height:1.5;font-style:italic">
            "${escHtml(r.note)}"
          </div>
          <div style="font-size:10px;color:var(--muted);margin-top:4px">
            ${r.actor ? escHtml(r.actor) + ' · ' : ''}${ts}
            <span style="margin-left:6px;font-style:italic;color:rgba(226,75,74,.6)">
              Read-only context — from Chain of Custody
            </span>
          </div>
        </div>
      </div>`;
  }).join('');

  // ── Comment thread ────────────────────────────────────────────────────────
  // Separate top-level comments from replies
  const allComments = (inst._stepComments || [])
    .filter(c => c.template_step_id === stepId && !c.is_deleted)
    .sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

  const topLevel = allComments.filter(c => !c.parent_comment_id);
  const replies  = allComments.filter(c => !!c.parent_comment_id);

  const total = allComments.length;
  if (countEl) countEl.textContent = total ? `(${total})` : '';

  if (!topLevel.length) {
    threadEl.innerHTML = rejectionHtml +
      (rejections.length
        ? ''
        : '<div style="font-size:10px;color:var(--muted);padding:4px 0 6px;font-style:italic">No comments yet.</div>');
    return;
  }

  const confColor = { green:'var(--green)', yellow:'var(--amber)', red:'var(--red)' };
  const confLabel = { green:'On track', yellow:'Uncertain', red:'Blocked' };
  const canPromote = inst.status === 'in_progress';

  const renderComment = (c, isReply) => {
    const ts = c.created_at ? new Date(c.created_at).toLocaleString('en-US',
      {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'}) : '';
    const conf = c.confidence;
    const confBadge = conf
      ? `<span style="font-size:9px;color:${confColor[conf]};padding:1px 6px;
           border:1px solid ${confColor[conf]}44;border-radius:10px;background:${confColor[conf]}11">
           &#9679; ${confLabel[conf]}
         </span>`
      : '';
    const hoursBadge = c.hours_logged
      ? `<span style="font-size:9px;color:var(--amber);font-family:var(--font-mono);
           padding:1px 6px;border:1px solid rgba(232,168,56,.3);border-radius:10px;
           background:rgba(232,168,56,.08)">
           &#9201; ${c.hours_logged}h
         </span>`
      : '';
    const replyCount = replies.filter(r => r.parent_comment_id === c.id).length;
    const threadReplies = replies.filter(r => r.parent_comment_id === c.id)
      .map(r => renderComment(r, true)).join('');

    return `
      <div id="comment-row-${c.id}"
        style="${isReply
          ? 'margin-left:16px;padding:6px 0 6px 10px;border-left:2px solid var(--border)'
          : 'padding:8px 0'}">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">
          ${_avatarHtml(c.author_name, 20)}
          <span style="font-size:10px;font-weight:700;color:var(--text)">${escHtml(c.author_name||'Unknown')}</span>
          <span style="font-size:9px;color:var(--muted)">${ts}</span>
          ${confBadge}${hoursBadge}
          <div style="flex:1"></div>
          ${!isReply && canPromote ? (c.is_promoted
            ? `<span style="font-size:9px;color:var(--muted);font-style:italic">&#128274; Promoted</span>`
            : `<button onclick="promoteToActionItem('${c.id}','${stepId}')"
                style="font-size:9px;color:var(--accent);background:none;border:none;
                  cursor:pointer;padding:0;opacity:.7"
                onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='.7'">
                &#8679; Promote
              </button>`) : ''}
          <button onclick="showReplyInput('${c.id}','${stepId}')"
            style="font-size:9px;color:var(--muted);background:none;border:none;
              cursor:pointer;padding:0;opacity:.7"
            onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='.7'">
            &#8617; Reply${replyCount ? ' ('+replyCount+')' : ''}
          </button>
        </div>
        <div style="font-size:11px;color:var(--text);line-height:1.5">
          ${escHtml(c.body)}
        </div>
        ${threadReplies}
      </div>
      ${!isReply ? '<div style="height:1px;background:var(--border);margin:2px 0"></div>' : ''}`;
  };

  threadEl.innerHTML = rejectionHtml + topLevel.map(c => renderComment(c, false)).join('');
}

function _renderActionItems(stepId) {
  const inst = _selectedInstance;
  if (!inst) return;
  const el = document.getElementById(`action-items-${stepId}`);
  if (!el) return;

  const items = (inst._actionItems || [])
    .filter(a => a.template_step_id === stepId)
    .sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

  if (!items.length) { el.innerHTML = ''; return; }

  const statusColor = { open:'var(--accent)', in_progress:'var(--amber)', resolved:'var(--green)', cancelled:'var(--muted)' };
  const statusLabel = { open:'Open', in_progress:'In Progress', resolved:'Resolved', cancelled:'Cancelled' };

  el.innerHTML = `
    <div style="font-size:9px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
      color:var(--muted);margin:10px 0 6px;display:flex;align-items:center;gap:6px">
      &#9654; Action Items
    </div>` +
    items.map(a => {
      const sc  = statusColor[a.status] || 'var(--muted)';
      const sl  = statusLabel[a.status] || a.status;
      const due = a.due_date ? new Date(a.due_date + 'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
      const resolved = a.status === 'resolved' || a.status === 'cancelled';
      const attachments = Array.isArray(a.attachments) ? a.attachments : [];

      return `
        <div id="action-item-card-${a.id}"
          style="border:1px solid var(--border);border-radius:5px;
            background:var(--bg2);margin-bottom:6px;overflow:hidden">
          <!-- Header row -->
          <div style="padding:8px 10px;display:flex;align-items:flex-start;gap:8px">
            <div style="width:8px;height:8px;border-radius:50%;background:${sc};
              flex-shrink:0;margin-top:4px"></div>
            <div style="flex:1;min-width:0">
              <div style="font-size:11px;font-weight:700;color:var(--text);
                ${resolved ? 'text-decoration:line-through;opacity:.6;' : ''}">
                ${escHtml(a.title)}
              </div>
              <div style="display:flex;gap:8px;margin-top:3px;flex-wrap:wrap;align-items:center">
                <span style="font-size:9px;color:${sc}">${sl}</span>
                ${a.owner_name ? `<span style="display:inline-flex;align-items:center;gap:4px">${_avatarHtml(a.owner_name,16)}<span style="font-size:9px;color:var(--text2)">${escHtml(a.owner_name)}</span></span>` : '<span style="font-size:9px;color:var(--muted)">Unassigned</span>'}
                ${due ? `<span style="font-size:9px;color:var(--muted)">&#128197; ${due}</span>` : ''}
                ${attachments.length ? `<span style="font-size:9px;color:var(--muted)">&#128206; ${attachments.length} file${attachments.length>1?'s':''}</span>` : ''}
              </div>
            </div>
            <div style="display:flex;gap:5px;flex-shrink:0">
              ${!resolved ? `
              <button onclick="editActionItem('${a.id}','${stepId}')"
                style="font-size:9px;color:var(--muted);background:none;
                  border:1px solid var(--border);border-radius:3px;
                  padding:2px 8px;cursor:pointer;white-space:nowrap"
                onmouseenter="this.style.borderColor='var(--cad)';this.style.color='var(--cad)'"
                onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">
                &#9998; Edit
              </button>
              <button onclick="resolveActionItem('${a.id}','${stepId}')"
                style="font-size:9px;color:var(--green);background:none;
                  border:1px solid rgba(29,158,117,.3);border-radius:3px;
                  padding:2px 8px;cursor:pointer;white-space:nowrap"
                onmouseenter="this.style.background='rgba(29,158,117,.1)'"
                onmouseleave="this.style.background='none'">
                &#10003; Resolve
              </button>` : ''}
            </div>
          </div>
          <!-- Instructions -->
          ${a.instructions ? `
          <div style="padding:0 10px 8px 26px;font-size:10px;color:var(--text2);
            line-height:1.5;border-top:1px solid var(--border);padding-top:6px">
            <span style="font-size:8px;text-transform:uppercase;letter-spacing:.1em;
              color:var(--muted);display:block;margin-bottom:3px">Instructions</span>
            ${escHtml(a.instructions)}
          </div>` : ''}
          <!-- Attachments -->
          ${attachments.length ? `
          <div style="padding:0 10px 8px 26px;border-top:1px solid var(--border)">
            <span style="font-size:8px;text-transform:uppercase;letter-spacing:.1em;
              color:var(--muted);display:block;margin:6px 0 4px">Attachments</span>
            ${attachments.map(f => `
              <button onclick="_viewAttachment('${escHtml(f.path)}','${escHtml(f.name)}')"
                style="display:inline-flex;align-items:center;gap:5px;font-size:10px;
                  color:var(--accent);background:none;border:none;cursor:pointer;
                  text-decoration:underline;margin-right:8px;margin-bottom:3px;padding:0">
                &#128206; ${escHtml(f.name)}
              </button>`).join('')}
          </div>` : ''}
          <!-- Resolution note -->
          ${a.resolution_note ? `
          <div style="padding:5px 10px 8px 26px;border-top:1px solid var(--border)">
            <span style="font-size:8px;text-transform:uppercase;letter-spacing:.1em;
              color:var(--green);display:block;margin-bottom:3px">Resolution</span>
            <div style="font-size:10px;color:var(--green);line-height:1.5">
              ${escHtml(a.resolution_note)}
            </div>
          </div>` : ''}
        </div>`;
    }).join('');
}

function promoteToActionItem(commentId, stepId) {
  const inst = _selectedInstance;
  if (!inst) return;
  const comment = (inst._stepComments || []).find(c => c.id === commentId);
  if (!comment) return;
  if (document.getElementById(`promote-form-${commentId}`)) return;

  const ownerOpts = renderResourceOptions('', '— Unassigned —');
  const threadEl  = document.getElementById(`comment-thread-${stepId}`);
  if (!threadEl) return;

  const formHtml = `
    <div id="promote-form-${commentId}"
      style="margin:6px 0 8px;padding:10px 12px;border:1px solid rgba(79,142,247,.3);
        border-radius:5px;background:rgba(79,142,247,.06)">
      <div style="font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;
        color:var(--accent);margin-bottom:8px">&#9650; Create Action Item</div>

      <!-- Source comment — read-only -->
      <div style="margin-bottom:8px;padding:7px 10px;background:var(--bg1);border-radius:4px;
        border-left:3px solid var(--border)">
        <div style="font-size:8px;text-transform:uppercase;letter-spacing:.1em;
          color:var(--muted);margin-bottom:3px">From comment</div>
        <div style="font-size:10px;color:var(--text2);line-height:1.4;font-style:italic">
          ${escHtml(comment.body)}
        </div>
      </div>

      <!-- Title -->
      <div style="margin-bottom:6px">
        <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:3px">
          Title <span style="color:var(--red)">*</span>
        </label>
        <input id="ai-title-${commentId}" value="${escHtml(comment.body.slice(0,80))}"
          oninput="_validateActionItemForm('${commentId}')"
          style="width:100%;box-sizing:border-box;font-size:11px;padding:5px 8px;
            background:var(--bg1);border:1px solid var(--border);border-radius:3px;
            color:var(--text);font-family:var(--font-body)" />
      </div>

      <!-- Instructions — required -->
      <div style="margin-bottom:6px">
        <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:3px">
          Instructions <span style="color:var(--red)">*</span>
          <span style="font-weight:400;font-style:italic;color:var(--muted)"> — describe what needs to be done</span>
        </label>
        <textarea id="ai-instructions-${commentId}"
          oninput="_validateActionItemForm('${commentId}')"
          placeholder="Describe the specific actions required to complete this item…"
          style="width:100%;box-sizing:border-box;font-size:11px;padding:5px 8px;
            min-height:64px;resize:vertical;background:var(--bg1);
            border:1px solid var(--border);border-radius:3px;
            color:var(--text);font-family:var(--font-body)"></textarea>
      </div>

      <!-- Owner / Due Date (left) + Attachments (right) — two columns -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px;align-items:start">
        <!-- Left: Owner + Due Date stacked -->
        <div style="display:flex;flex-direction:column;gap:6px">
          <div>
            <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:3px">Owner</label>
            <select id="ai-owner-${commentId}" class="config-select" style="font-size:11px;width:100%">
              ${ownerOpts}
            </select>
          </div>
          <div>
            <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:3px">Due Date</label>
            <input id="ai-due-${commentId}" type="date"
              style="width:100%;font-size:11px;padding:5px 8px;
                background:var(--bg1);border:1px solid var(--border);border-radius:3px;
                color:var(--text);color-scheme:dark" />
          </div>
        </div>
        <!-- Right: Attachments DnD -->
        <div style="display:flex;flex-direction:column;gap:3px">
          <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:3px">
            Attachments <span style="font-weight:400;color:var(--muted)">(optional)</span>
          </label>
          <div class="doc-drop-zone" id="ai-dropzone-${commentId}"
            ondragover="event.preventDefault();this.classList.add('drag-over')"
            ondragleave="this.classList.remove('drag-over')"
            ondrop="_handleActionItemDrop(event,'${commentId}')"
            onclick="document.getElementById('ai-files-${commentId}').click()"
            style="padding:10px;margin:0;height:100%;min-height:72px;
              display:flex;flex-direction:column;align-items:center;justify-content:center">
            <div class="doc-drop-zone-icon">📂</div>
            <div class="doc-drop-zone-text"><strong>Drop files here</strong><br>or click to browse</div>
            <input type="file" id="ai-files-${commentId}" style="display:none" multiple
              onchange="_previewActionItemFiles('${commentId}')" />
          </div>
          <div id="ai-file-preview-${commentId}" style="margin-top:2px"></div>
        </div>
      </div>

      <!-- Buttons -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
        <span id="ai-form-status-${commentId}" style="font-size:10px;color:var(--red)">
          Instructions required
        </span>
        <div style="display:flex;gap:6px">
          <button onclick="document.getElementById('promote-form-${commentId}').remove()"
            style="font-size:10px;padding:4px 12px;background:none;border:1px solid var(--border);
              border-radius:4px;color:var(--muted);cursor:pointer">Cancel</button>
          <button id="ai-create-btn-${commentId}" onclick="createActionItem('${commentId}','${stepId}')"
            disabled style="font-size:10px;font-weight:600;padding:4px 14px;background:var(--accent);
              color:#fff;border:none;border-radius:4px;cursor:pointer;opacity:.4">
            Create Action Item
          </button>
        </div>
      </div>
    </div>`;

  const commentRow = document.getElementById(`comment-row-${commentId}`);
  if (commentRow) commentRow.insertAdjacentHTML('afterend', formHtml);
  else threadEl.insertAdjacentHTML('beforeend', formHtml);
}

function openDirectActionItem(stepId) {
  const inst = _selectedInstance;
  if (!inst) return;

  const formKey = `direct-${stepId}`;
  if (document.getElementById(`promote-form-${formKey}`)) {
    document.getElementById(`promote-form-${formKey}`).remove();
    return;
  }

  const ownerOpts = renderResourceOptions('', '— Unassigned —');
  const aiEl = document.getElementById(`action-items-${stepId}`);
  if (!aiEl) return;

  const formHtml = `
    <div id="promote-form-${formKey}"
      style="margin:0 0 8px;padding:10px 12px;border:1px solid rgba(79,142,247,.3);
        border-radius:5px;background:rgba(79,142,247,.06)">
      <div style="font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;
        color:var(--accent);margin-bottom:8px">&#43; New Action Item</div>

      <!-- Title -->
      <div style="margin-bottom:6px">
        <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:3px">
          Title <span style="color:var(--red)">*</span>
        </label>
        <input id="ai-title-${formKey}" placeholder="What needs to be done?"
          oninput="_validateDirectActionItemForm('${formKey}')"
          style="width:100%;box-sizing:border-box;font-size:11px;padding:5px 8px;
            background:var(--bg1);border:1px solid var(--border);border-radius:3px;
            color:var(--text);font-family:var(--font-body)" />
      </div>

      <!-- Instructions -->
      <div style="margin-bottom:6px">
        <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:3px">
          Instructions
          <span style="font-weight:400;font-style:italic;color:var(--muted)"> — optional detail</span>
        </label>
        <textarea id="ai-instructions-${formKey}"
          placeholder="Describe the specific actions required…"
          style="width:100%;box-sizing:border-box;font-size:11px;padding:5px 8px;
            min-height:52px;resize:vertical;background:var(--bg1);
            border:1px solid var(--border);border-radius:3px;
            color:var(--text);font-family:var(--font-body)"></textarea>
      </div>

      <!-- Owner + Due Date -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">
        <div>
          <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:3px">Owner</label>
          <select id="ai-owner-${formKey}" class="config-select" style="font-size:11px;width:100%">
            ${ownerOpts}
          </select>
        </div>
        <div>
          <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:3px">Due Date</label>
          <input id="ai-due-${formKey}" type="date"
            style="width:100%;font-size:11px;padding:5px 8px;
              background:var(--bg1);border:1px solid var(--border);border-radius:3px;
              color:var(--text);color-scheme:dark" />
        </div>
      </div>

      <!-- Buttons -->
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px">
        <button onclick="document.getElementById('promote-form-${formKey}').remove()"
          style="font-size:10px;padding:4px 12px;background:none;border:1px solid var(--border);
            border-radius:4px;color:var(--muted);cursor:pointer">Cancel</button>
        <button id="ai-create-btn-${formKey}"
          onclick="createDirectActionItem('${formKey}','${stepId}')"
          disabled
          style="font-size:10px;font-weight:600;padding:4px 14px;background:var(--accent);
            color:#fff;border:none;border-radius:4px;cursor:pointer;opacity:.4">
          Create Action Item
        </button>
      </div>
    </div>`;

  aiEl.insertAdjacentHTML('beforebegin', formHtml);
  document.getElementById(`ai-title-${formKey}`)?.focus();
}

function _validateDirectActionItemForm(formKey) {
  const titleEl = document.getElementById(`ai-title-${formKey}`);
  const btn     = document.getElementById(`ai-create-btn-${formKey}`);
  const hasTitle = (titleEl?.value || '').trim().length > 0;
  if (btn) {
    btn.disabled = !hasTitle;
    btn.style.opacity = hasTitle ? '1' : '.4';
  }
}

async function createDirectActionItem(formKey, stepId) {
  const inst     = _selectedInstance;
  if (!inst) return;
  const titleEl  = document.getElementById(`ai-title-${formKey}`);
  const instrEl  = document.getElementById(`ai-instructions-${formKey}`);
  const ownerEl  = document.getElementById(`ai-owner-${formKey}`);
  const dueEl    = document.getElementById(`ai-due-${formKey}`);
  const btn      = document.getElementById(`ai-create-btn-${formKey}`);

  const title        = titleEl?.value.trim();
  const instructions = instrEl?.value.trim() || '';
  if (!title) { cadToast('Title is required', 'error'); return; }

  const ownerResId = ownerEl?.value || null;
  const ownerName  = ownerResId ? (_resources_cad.find(r => r.id === ownerResId)?.name || '') : '';
  const dueDate    = dueEl?.value || null;

  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

  const newId = crypto.randomUUID();
  const row = {
    id:                newId,
    firm_id:           FIRM_ID_CAD,
    instance_id:       inst.id,
    template_step_id:  stepId,
    source_comment_id: null,
    title,
    instructions,
    attachments:       [],
    priority:          'normal',
    created_by_name:   _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member',
  };
  if (ownerResId) row.owner_resource_id = ownerResId;
  if (ownerName)  row.owner_name        = ownerName;
  if (dueDate)    row.due_date          = dueDate;

  try {
    await API.post('workflow_action_items', row);
    if (!inst._actionItems) inst._actionItems = [];
    inst._actionItems.push({ ...row, status: 'open', created_at: new Date().toISOString() });
    document.getElementById(`promote-form-${formKey}`)?.remove();
    _renderActionItems(stepId);
    cadToast('Action item created', 'info');
  } catch(e) {
    cadToast('Failed to create action item: ' + (e.message || 'unknown error'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Create Action Item'; }
  }
}

function _validateActionItemForm(commentId) {
  const titleEl = document.getElementById(`ai-title-${commentId}`);
  const instrEl = document.getElementById(`ai-instructions-${commentId}`);
  const btn     = document.getElementById(`ai-create-btn-${commentId}`);
  const status  = document.getElementById(`ai-form-status-${commentId}`);
  const hasTitle = (titleEl?.value || '').trim().length > 0;
  const hasInstr = (instrEl?.value || '').trim().length > 0;
  if (btn) {
    btn.disabled = !(hasTitle && hasInstr);
    btn.style.opacity = (hasTitle && hasInstr) ? '1' : '.4';
  }
  if (status) {
    status.textContent = !hasTitle ? 'Title required'
      : !hasInstr ? 'Instructions required' : '';
  }
}

function _handleActionItemDrop(event, commentId) {
  event.preventDefault();
  document.getElementById(`ai-dropzone-${commentId}`)?.classList.remove('drag-over');
  const input = document.getElementById(`ai-files-${commentId}`);
  if (!input) return;
  const dt = new DataTransfer();
  Array.from(input.files || []).forEach(f => dt.items.add(f));
  Array.from(event.dataTransfer?.files || []).forEach(f => dt.items.add(f));
  input.files = dt.files;
  _previewActionItemFiles(commentId);
}

function _handleEditDrop(event, actionItemId) {
  event.preventDefault();
  document.getElementById(`edit-dropzone-${actionItemId}`)?.classList.remove('drag-over');
  const input = document.getElementById(`edit-files-${actionItemId}`);
  if (!input) return;
  const dt = new DataTransfer();
  Array.from(input.files || []).forEach(f => dt.items.add(f));
  Array.from(event.dataTransfer?.files || []).forEach(f => dt.items.add(f));
  input.files = dt.files;
  _previewEditFiles(actionItemId);
}

function _previewActionItemFiles(commentId) {
  const input   = document.getElementById(`ai-files-${commentId}`);
  const preview = document.getElementById(`ai-file-preview-${commentId}`);
  const zone    = document.getElementById(`ai-dropzone-${commentId}`);
  if (!input || !preview) return;
  const files = Array.from(input.files || []);
  preview.innerHTML = files.map(f =>
    `<div style="font-size:10px;color:var(--text2);padding:2px 0;display:flex;align-items:center;gap:5px">
      <span style="color:var(--cad)">&#128206;</span>
      <span>${escHtml(f.name)}</span>
      <span style="color:var(--muted)">(${(f.size/1024).toFixed(1)} KB)</span>
    </div>`
  ).join('');
  if (zone && files.length) {
    const zt = zone.querySelector('.doc-drop-zone-text');
    if (zt) zt.innerHTML = `<strong style="color:var(--green)">${files.length} file${files.length>1?'s':''} ready</strong> — drop more or click to add`;
  }
}

async function _uploadActionItemFiles(commentId, actionItemId) {
  const input = document.getElementById(`ai-files-${commentId}`);
  if (!input?.files?.length) return [];
  const files = Array.from(input.files);
  const uploaded = [];
  for (const file of files) {
    try {
      const token    = await Auth.getToken();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path     = `action-items/${actionItemId}/${Date.now()}_${safeName}`;
      const res = await fetch(`${SUPA_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
        method:  'POST',
        headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + token,
                   'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
        body: file,
      });
      if (!res.ok) { console.warn('Upload failed:', file.name, res.status); continue; }
      // Store path only — URL generated on demand via _viewAttachment (Option C)
      uploaded.push({ name: file.name, path, size: file.size });
    } catch(e) { console.warn('File upload failed:', file.name, e); }
  }
  return uploaded;
}

async function createActionItem(commentId, stepId) {
  const inst     = _selectedInstance;
  if (!inst) return;
  const comment  = (inst._stepComments || []).find(c => c.id === commentId);
  const titleEl  = document.getElementById(`ai-title-${commentId}`);
  const instrEl  = document.getElementById(`ai-instructions-${commentId}`);
  const ownerEl  = document.getElementById(`ai-owner-${commentId}`);
  const dueEl    = document.getElementById(`ai-due-${commentId}`);
  const btn      = document.getElementById(`ai-create-btn-${commentId}`);

  const title        = titleEl?.value.trim();
  const instructions = instrEl?.value.trim();
  if (!title || !instructions) { cadToast('Title and instructions are required', 'error'); return; }

  const ownerResId = ownerEl?.value || null;
  const ownerName  = ownerResId ? (_resources_cad.find(r => r.id === ownerResId)?.name || '') : '';
  const dueDate    = dueEl?.value || null;

  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

  const newId = crypto.randomUUID();

  // Upload files first if any
  const attachments = await _uploadActionItemFiles(commentId, newId);

  const row = {
    firm_id:           FIRM_ID_CAD,
    instance_id:       inst.id,
    template_step_id:  stepId,
    source_comment_id: commentId,
    title,
    instructions,
    attachments:       attachments.length ? attachments : [],
    priority:          'normal',
    created_by_name:   _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member',
  };
  if (ownerResId) row.owner_resource_id = ownerResId;
  if (ownerName)  row.owner_name        = ownerName;
  if (dueDate)    row.due_date          = dueDate;

  try {
    await API.post('workflow_action_items', row);

    // Mark source comment as promoted (read-only)
    if (comment) {
      comment.is_promoted = true;
      await API.patch(`step_comments?id=eq.${commentId}`, { is_promoted: true }).catch(() => {});
    }

    if (!inst._actionItems) inst._actionItems = [];
    inst._actionItems.push({ ...row, id: newId, status: 'open', created_at: new Date().toISOString() });

    document.getElementById(`promote-form-${commentId}`)?.remove();
    _renderCommentThread(stepId);
    _renderActionItems(stepId);
    cadToast('Action item created', 'info');
  } catch(e) {
    cadToast('Failed to create action item: ' + (e.message || 'unknown error'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Create Action Item'; }
  }
}

function editActionItem(actionItemId, stepId) {
  if (document.getElementById(`edit-form-${actionItemId}`)) return;
  const inst = _selectedInstance;
  if (!inst) return;
  const a = (inst._actionItems || []).find(i => i.id === actionItemId);
  if (!a) return;

  const ownerOpts = renderResourceOptions(a.owner_resource_id || '', '— Unassigned —');
  const card      = document.getElementById(`action-item-card-${actionItemId}`);
  if (!card) return;

  const formHtml = `
    <div id="edit-form-${actionItemId}"
      style="border:1px solid var(--cad-wire);border-radius:5px;
        background:var(--bg1);padding:10px 12px;margin-bottom:6px">
      <div style="font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;
        color:var(--cad);margin-bottom:8px">&#9998; Edit Action Item</div>

      <div style="margin-bottom:6px">
        <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:3px">Title</label>
        <input id="edit-title-${actionItemId}" value="${escHtml(a.title)}"
          style="width:100%;box-sizing:border-box;font-size:11px;padding:5px 8px;
            background:var(--bg2);border:1px solid var(--border);border-radius:3px;
            color:var(--text);font-family:var(--font-body)" />
      </div>

      <div style="margin-bottom:6px">
        <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:3px">
          Instructions <span style="color:var(--red)">*</span>
        </label>
        <textarea id="edit-instructions-${actionItemId}"
          style="width:100%;box-sizing:border-box;font-size:11px;padding:5px 8px;
            min-height:64px;resize:vertical;background:var(--bg2);
            border:1px solid var(--border);border-radius:3px;
            color:var(--text);font-family:var(--font-body)">${escHtml(a.instructions || '')}</textarea>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
        <div>
          <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:3px">Owner</label>
          <select id="edit-owner-${actionItemId}" class="config-select" style="font-size:11px;width:100%">
            ${ownerOpts}
          </select>
        </div>
        <div>
          <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:3px">Due Date</label>
          <input id="edit-due-${actionItemId}" type="date" value="${a.due_date || ''}"
            style="width:100%;font-size:11px;padding:5px 8px;
              background:var(--bg2);border:1px solid var(--border);border-radius:3px;
              color:var(--text);color-scheme:dark" />
        </div>
      </div>

      <!-- Add more attachments — DnD dropzone -->
      <div style="margin-bottom:8px">
        <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:3px">
          Add Attachments
        </label>
        <div class="doc-drop-zone" id="edit-dropzone-${actionItemId}"
          ondragover="event.preventDefault();this.classList.add('drag-over')"
          ondragleave="this.classList.remove('drag-over')"
          ondrop="_handleEditDrop(event,'${actionItemId}')"
          onclick="document.getElementById('edit-files-${actionItemId}').click()"
          style="padding:10px;margin:0">
          <div class="doc-drop-zone-icon">📂</div>
          <div class="doc-drop-zone-text"><strong>Drop files here</strong> or click to browse</div>
          <input type="file" id="edit-files-${actionItemId}" style="display:none" multiple
            onchange="_previewEditFiles('${actionItemId}')" />
        </div>
        <div id="edit-file-preview-${actionItemId}" style="margin-top:4px"></div>
      </div>

      <!-- Existing attachments -->
      ${(Array.isArray(a.attachments) && a.attachments.length) ? `
      <div style="margin-bottom:8px">
        <div style="font-size:8px;text-transform:uppercase;letter-spacing:.1em;
          color:var(--muted);margin-bottom:4px">Existing Attachments</div>
        ${a.attachments.map((f,i) => `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <button onclick="_viewAttachment('${escHtml(f.path)}','${escHtml(f.name)}')"
              style="font-size:10px;color:var(--accent);background:none;border:none;
                cursor:pointer;text-decoration:underline;flex:1;text-align:left;padding:0">
              &#128206; ${escHtml(f.name)}
            </button>
            <button onclick="_removeEditAttachment('${actionItemId}',${i})"
              style="font-size:9px;color:var(--red);background:none;border:none;cursor:pointer">
              &#10005;
            </button>
          </div>`).join('')}
      </div>` : ''}

      <div style="display:flex;justify-content:flex-end;gap:6px">
        <button onclick="document.getElementById('edit-form-${actionItemId}').remove()"
          style="font-size:10px;padding:4px 12px;background:none;border:1px solid var(--border);
            border-radius:4px;color:var(--muted);cursor:pointer">Cancel</button>
        <button onclick="saveActionItemEdit('${actionItemId}','${stepId}')"
          style="font-size:10px;font-weight:600;padding:4px 14px;background:var(--cad);
            color:#fff;border:none;border-radius:4px;cursor:pointer">Save Changes</button>
      </div>
    </div>`;

  card.insertAdjacentHTML('afterend', formHtml);
  card.style.display = 'none';
}

function _previewEditFiles(actionItemId) {
  const input   = document.getElementById(`edit-files-${actionItemId}`);
  const preview = document.getElementById(`edit-file-preview-${actionItemId}`);
  const zone    = document.getElementById(`edit-dropzone-${actionItemId}`);
  if (!input || !preview) return;
  const files = Array.from(input.files || []);
  preview.innerHTML = files.map(f =>
    `<div style="font-size:10px;color:var(--text2);padding:2px 0;display:flex;align-items:center;gap:5px">
      <span style="color:var(--cad)">&#128206;</span>
      <span>${escHtml(f.name)}</span>
      <span style="color:var(--muted)">(${(f.size/1024).toFixed(1)} KB)</span>
    </div>`).join('');
  if (zone && files.length) {
    const zt = zone.querySelector('.doc-drop-zone-text');
    if (zt) zt.innerHTML = `<strong style="color:var(--green)">${files.length} file${files.length>1?'s':''} ready</strong> — drop more or click to add`;
  }
}

function _removeEditAttachment(actionItemId, idx) {
  const inst = _selectedInstance;
  const a    = (inst?._actionItems || []).find(i => i.id === actionItemId);
  if (!a || !Array.isArray(a.attachments)) return;
  a.attachments.splice(idx, 1);
  // Re-open edit form to reflect change
  document.getElementById(`edit-form-${actionItemId}`)?.remove();
  document.getElementById(`action-item-card-${actionItemId}`)?.remove();
  editActionItem(actionItemId, a.template_step_id);
}

async function saveActionItemEdit(actionItemId, stepId) {
  const inst   = _selectedInstance;
  const a      = (inst?._actionItems || []).find(i => i.id === actionItemId);
  if (!inst || !a) return;

  const title        = document.getElementById(`edit-title-${actionItemId}`)?.value.trim();
  const instructions = document.getElementById(`edit-instructions-${actionItemId}`)?.value.trim();
  const ownerResId   = document.getElementById(`edit-owner-${actionItemId}`)?.value || null;
  const ownerName    = ownerResId ? (_resources_cad.find(r => r.id === ownerResId)?.name || '') : '';
  const dueDate      = document.getElementById(`edit-due-${actionItemId}`)?.value || null;

  if (!instructions) { cadToast('Instructions are required', 'error'); return; }

  // Upload any new files
  const newFiles  = await _uploadEditFiles(actionItemId);
  const existing  = Array.isArray(a.attachments) ? a.attachments : [];
  const attachments = [...existing, ...newFiles];

  const updates = {
    title:        title || a.title,
    instructions,
    attachments,
    owner_resource_id: ownerResId || null,
    owner_name:        ownerName  || null,
    due_date:          dueDate    || null,
  };

  try {
    await API.patch(`workflow_action_items?id=eq.${actionItemId}`, updates);
    Object.assign(a, updates);
    document.getElementById(`edit-form-${actionItemId}`)?.remove();
    document.getElementById(`action-item-card-${actionItemId}`)?.remove();
    _renderActionItems(stepId);
    cadToast('Action item updated', 'info');
  } catch(e) {
    cadToast('Failed to save: ' + (e.message || 'unknown error'), 'error');
  }
}

async function _uploadEditFiles(actionItemId) {
  const input = document.getElementById(`edit-files-${actionItemId}`);
  if (!input?.files?.length) return [];
  const files = Array.from(input.files);
  const uploaded = [];
  for (const file of files) {
    try {
      const token    = await Auth.getToken();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path     = `action-items/${actionItemId}/${Date.now()}_${safeName}`;
      const res = await fetch(`${SUPA_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
        method:  'POST',
        headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + token,
                   'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
        body: file,
      });
      if (!res.ok) { console.warn('Upload failed:', file.name, res.status); continue; }
      // Store path only — URL generated on demand via _viewAttachment (Option C)
      uploaded.push({ name: file.name, path, size: file.size });
    } catch(e) { console.warn('Upload failed:', file.name, e); }
  }
  return uploaded;
}

async function resolveActionItem(actionItemId, stepId) {
  const inst = _selectedInstance;
  if (!inst) return;
  const note = prompt('Resolution note (optional):') ?? '';
  try {
    await API.patch(`workflow_action_items?id=eq.${actionItemId}`, {
      status: 'resolved', resolved_at: new Date().toISOString(), resolution_note: note || null,
    });
    const item = (inst._actionItems || []).find(a => a.id === actionItemId);
    if (item) { item.status = 'resolved'; item.resolved_at = new Date().toISOString(); item.resolution_note = note || null; }
    _renderActionItems(stepId);
  } catch(e) {
    cadToast('Failed to resolve: ' + (e.message || 'unknown error'), 'error');
  }
}

function showReplyInput(commentId, stepId) {
  if (document.getElementById(`reply-input-${commentId}`)) {
    document.getElementById(`reply-input-${commentId}`).remove();
    return;
  }
  const commentEl = document.getElementById(`comment-row-${commentId}`);
  if (!commentEl) return;
  const replyHtml = `
    <div id="reply-input-${commentId}"
      style="margin:4px 0 4px 18px;padding:8px 10px;
        border:1px solid var(--border);border-radius:4px;background:var(--bg2)">
      <textarea id="reply-body-${commentId}"
        placeholder="Write a reply…"
        style="width:100%;box-sizing:border-box;font-size:11px;padding:4px 6px;
          min-height:44px;resize:vertical;background:transparent;border:none;
          color:var(--text);font-family:var(--font-body);outline:none"></textarea>
      <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:4px">
        <button onclick="document.getElementById('reply-input-${commentId}').remove()"
          style="font-size:10px;padding:3px 10px;background:none;border:1px solid var(--border);
            border-radius:3px;color:var(--muted);cursor:pointer">Cancel</button>
        <button onclick="postReply('${commentId}','${stepId}')"
          style="font-size:10px;font-weight:600;padding:3px 12px;background:var(--cad);
            color:#fff;border:none;border-radius:3px;cursor:pointer">Reply</button>
      </div>
    </div>`;
  commentEl.insertAdjacentHTML('afterend', replyHtml);
  document.getElementById(`reply-body-${commentId}`)?.focus();
}

async function postReply(parentCommentId, stepId) {
  const bodyEl = document.getElementById(`reply-body-${parentCommentId}`);
  const body   = (bodyEl?.value || '').trim();
  if (!body) return;

  const inst       = _selectedInstance;
  const authorName = _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member';

  const newReplyId = crypto.randomUUID();
  const row = {
    id:                newReplyId,
    firm_id:           FIRM_ID_CAD,
    instance_id:       inst.id,
    template_step_id:  stepId,
    parent_comment_id: parentCommentId,
    author_name:       authorName,
    body,
    flag_type:         'none',
    confidence:        null,
  };

  try {
    await API.post('step_comments', row);
    if (!inst._stepComments) inst._stepComments = [];
    inst._stepComments.push({ ...row, created_at: new Date().toISOString() });
    document.getElementById(`reply-input-${parentCommentId}`)?.remove();
    _renderCommentThread(stepId);
  } catch(e) {
    cadToast('Failed to post reply', 'error');
  }
}

function _populateAllCommentThreads() {
  const inst = _selectedInstance;
  if (!inst || !inst._selectedStep) return;
  const stepId = inst._selectedStep;
  _renderCommentThread(stepId);
  _renderActionItems(stepId);
}

