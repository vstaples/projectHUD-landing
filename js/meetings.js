/**
 * meetings.js — Canonical meeting card component for ProjectHUD
 *
 * Single source of truth for rendering meeting detail: attendees, agenda,
 * action items, minutes, and threaded comments.
 *
 * Used by:
 *   prospect-detail.html  — inside the Meetings tab expand
 *   cadence.html          — inside workflow instance meeting step expand
 *
 * Public API:
 *   MeetingCard.render(meetingId, containerEl, options)
 *   MeetingCard.renderPreLaunch(step, containerEl, onStart)
 *   MeetingCard.bust(meetingId)
 *
 * Options:
 *   editMinutesHref  — URL for the "✎ Edit minutes" link (default: /meeting-minutes.html?meeting_id=ID)
 *   prospectId       — if set, scopes "✎ Minutes" link with &prospect_id=
 *   firmId           — defaults to window.PHUD?.FIRM_ID
 *   myResourceId     — current user's resource id for comment authorship
 *   onActionAdd      — callback(meetingId) when + Add action item is clicked;
 *                      if omitted, a simple prompt() is used
 */

const MeetingCard = (() => {

  // ── Internal cache ──────────────────────────────────────────────────────────
  const _cache   = {};   // meetingId → { meeting, agenda, attendees, actionItems, minutes }
  const _replies = {};   // meetingId → [comment rows]

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function _esc(s) {
    return (s || '').toString()
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _cap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  function _ini(name) {
    return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function _fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  }

  function _fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function _firmId() {
    return window.PHUD?.FIRM_ID || 'aaaaaaaa-0001-0001-0001-000000000001';
  }

  // Parse discussion_notes — may be plain text or JSON blob from agenda editor
  function _parseDiscussionNotes(raw) {
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      if (obj.__agenda || obj.__freeform !== undefined) {
        // Flatten agenda notes into readable text
        const parts = [];
        if (obj.__agenda) {
          Object.values(obj.__agenda).forEach(v => { if (v?.trim()) parts.push(v.trim()); });
        }
        if (obj.__freeform?.trim()) parts.push(obj.__freeform.trim());
        return parts.join('\n\n') || null;
      }
    } catch(e) { /* plain text */ }
    return raw;
  }

  // ── CSS injection (once) ────────────────────────────────────────────────────
  let _cssInjected = false;
  function _injectCSS() {
    if (_cssInjected) return;
    _cssInjected = true;
    const style = document.createElement('style');
    style.id = 'meeting-card-styles';
    style.textContent = `
      .mc-minutes-block {
        background: var(--surf2); border-radius: 7px;
        padding: 10px 12px; margin-top: 8px;
      }
      .mc-section { margin-bottom: 8px; }
      .mc-section-lbl {
        font-size: 10px; font-weight: 700; color: var(--muted);
        text-transform: uppercase; letter-spacing: .05em; margin-bottom: 3px;
      }
      .mc-section-text {
        font-size: 12px; color: var(--text); line-height: 1.65;
        white-space: pre-wrap;
      }
      .mc-label {
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        letter-spacing: .06em; color: var(--muted); margin-bottom: 6px;
      }
      .mc-agenda-item {
        display: flex; align-items: flex-start; gap: 8px;
        padding: 5px 0; border-bottom: 1px solid var(--border); font-size: 12px;
      }
      .mc-agenda-item:last-child { border-bottom: none; }
      .mc-agenda-num {
        font-size: 10px; font-weight: 700; color: var(--muted);
        width: 16px; text-align: right; flex-shrink: 0; margin-top: 1px;
      }
      .mc-ai-row {
        display: flex; align-items: flex-start; gap: 8px;
        padding: 7px 8px; border-radius: 5px;
        background: var(--surf2); border: 1px solid var(--border);
        font-size: 12px; margin-bottom: 4px;
      }
      .mc-ai-check {
        width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0; margin-top: 1px;
        display: flex; align-items: center; justify-content: center; font-size: 8px; color: #fff;
      }
      /* ── reply thread ── */
      .mc-reply-btn {
        background: none; border: none; cursor: pointer;
        color: var(--muted); font-size: 11px; padding: 0;
        display: flex; align-items: center; gap: 4px; transition: color .15s;
      }
      .mc-reply-btn:hover { color: var(--accent); }
      .mc-reply-thread {
        margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border);
      }
      .mc-reply-entry { display: flex; gap: 8px; margin-bottom: 10px; }
      .mc-reply-av {
        width: 22px; height: 22px; border-radius: 50%;
        background: rgba(79,142,247,.15); color: var(--accent);
        font-size: 8px; font-weight: 700; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center; margin-top: 1px;
      }
      .mc-reply-bubble {
        flex: 1; background: var(--surf3);
        border: 1px solid var(--border); border-radius: 0 8px 8px 8px; padding: 8px 10px;
      }
      .mc-reply-meta {
        font-size: 10px; color: var(--muted); margin-bottom: 4px;
        display: flex; justify-content: space-between; align-items: center;
      }
      .mc-reply-text { font-size: 12px; color: var(--text); line-height: 1.5; }
      .mc-reply-compose { display: flex; gap: 8px; margin-top: 8px; align-items: flex-end; }
      .mc-reply-compose textarea {
        flex: 1; padding: 7px 10px; border-radius: 6px;
        border: 1px solid var(--border2); background: var(--surf2);
        color: var(--text); font-size: 12px; font-family: inherit;
        outline: none; resize: none; min-height: 36px; max-height: 100px;
        transition: border-color .15s; line-height: 1.5;
      }
      .mc-reply-compose textarea:focus { border-color: var(--accent); }
      .mc-reply-send {
        padding: 7px 12px; border-radius: 6px;
        border: 1px solid var(--accent); background: var(--accent);
        color: #fff; font-size: 12px; font-weight: 600;
        cursor: pointer; flex-shrink: 0; transition: opacity .15s;
      }
      .mc-reply-send:hover { opacity: .85; }
      .mc-sub-compose { display: none; margin: 6px 0 0 30px; }
      .mc-sub-compose.open { display: block; }
    `;
    document.head.appendChild(style);
  }

  // ── Data fetch ──────────────────────────────────────────────────────────────
  async function _load(meetingId) {
    if (_cache[meetingId]) return _cache[meetingId];

    const [meetRows, agendaRows, attendeeRows, aiRows, minsRows] = await Promise.all([
      API.get(`meetings?id=eq.${meetingId}&limit=1`).catch(() => []),
      API.get(`meeting_agenda_items?meeting_id=eq.${meetingId}&order=sequence_order`).catch(() => []),
      API.get(`meeting_attendees?meeting_id=eq.${meetingId}&select=*,users(name,email)`).catch(() => []),
      API.get(`meeting_action_items?meeting_id=eq.${meetingId}&order=created_at`).catch(() => []),
      API.get(`meeting_minutes?meeting_id=eq.${meetingId}&limit=1`).catch(() => []),
    ]);

    _cache[meetingId] = {
      meeting:     meetRows?.[0]     || null,
      agenda:      agendaRows        || [],
      attendees:   attendeeRows      || [],
      actionItems: aiRows            || [],
      minutes:     minsRows?.[0]     || null,
    };
    return _cache[meetingId];
  }

  async function _loadComments(meetingId) {
    const rows = await API.get(
      `meeting_comments?meeting_id=eq.${meetingId}&order=created_at.asc`
    ).catch(() => []);
    // Build threaded tree
    const tops = (rows || []).filter(r => !r.parent_id);
    tops.forEach(c => { c.replies = rows.filter(r => r.parent_id === c.id); });
    _replies[meetingId] = tops;
    return tops;
  }

  // ── Render helpers ──────────────────────────────────────────────────────────
  function _renderAttendees(attendees) {
    if (!attendees.length) {
      return '<div style="font-size:11px;color:var(--muted)">No attendees recorded.</div>';
    }
    return '<div style="display:flex;flex-wrap:wrap;gap:5px">' +
      attendees.map(a => {
        const name   = a.users?.name || 'Attendee';
        const status = a.attendance_status || 'invited';
        const sc     = status === 'attended' ? '#7af0c0'
                     : status === 'accepted' ? 'var(--accent)'
                     : status === 'declined' ? '#f07a7a' : 'var(--muted)';
        return `<div style="display:flex;align-items:center;gap:5px;padding:3px 8px;
            border-radius:5px;border:1px solid var(--border);font-size:11px">
          <div style="width:18px;height:18px;border-radius:50%;background:${sc}22;
            color:${sc};font-size:8px;font-weight:700;display:flex;
            align-items:center;justify-content:center">${_ini(name)}</div>
          <span style="color:var(--text)">${_esc(name)}</span>
          <span style="color:${sc};font-size:10px">${status}</span>
        </div>`;
      }).join('') + '</div>';
  }

  function _renderAgenda(agenda) {
    if (!agenda.length) {
      return '<div style="font-size:11px;color:var(--muted)">No agenda items recorded.</div>';
    }
    return agenda.map(a => `
      <div class="mc-agenda-item">
        <span class="mc-agenda-num">${a.sequence_order}.</span>
        <span style="color:var(--text);flex:1">${_esc(a.title)}</span>
        ${a.notes_captured ? `<span style="color:var(--muted);font-size:11px">${_esc(a.notes_captured)}</span>` : ''}
      </div>`).join('');
  }

  function _renderActionItems(actionItems, meetingId, opts) {
    const today = new Date().toLocaleDateString('en-CA');
    if (!actionItems.length) {
      return '<div style="font-size:11px;color:var(--muted)">No action items.</div>';
    }
    return actionItems.map(ai => {
      const done    = ai.status === 'complete';
      const overdue = !done && ai.due_date && ai.due_date < today;
      // Name resolution — callers can provide a resMap via opts
      const aName   = opts.resMap?.[ai.assigned_to_resource] || '—';
      return `<div class="mc-ai-row">
        <div class="mc-ai-check" style="border:1px solid ${done?'var(--green)':'var(--border2)'};
          background:${done?'var(--green)':'transparent'}">${done ? '✓' : ''}</div>
        <div style="flex:1">
          <div style="${done?'text-decoration:line-through;color:var(--muted)':'color:var(--text)'};line-height:1.4">
            ${_esc(ai.description)}
          </div>
          <div style="font-size:10px;color:var(--muted);display:flex;gap:8px;margin-top:2px">
            <span>${_esc(aName)}</span>
            ${ai.due_date ? `<span style="color:${overdue?'#f07a7a':'var(--muted)'}">
              ${overdue ? '⚠ Overdue · ' : 'Due '}${_fmtDate(ai.due_date)}
            </span>` : ''}
            <span style="color:${done?'#7af0a0':'var(--amber)'}">${ai.status || 'open'}</span>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  function _renderMinutes(mins, meetingId) {
    if (!mins) {
      return '<div style="font-size:11px;color:var(--muted);font-style:italic">No minutes on file.</div>';
    }
    const discussion = _parseDiscussionNotes(mins.discussion_notes);
    return `
      <div class="mc-minutes-block" id="mc-mblock-${meetingId}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;
            letter-spacing:.06em;color:var(--muted)">Meeting minutes</div>
          <button class="mc-reply-btn"
            onclick="event.stopPropagation();MeetingCard._openThread('${meetingId}')">
            ↩ Reply
          </button>
        </div>
        ${mins.summary ? `
        <div class="mc-section">
          <div class="mc-section-lbl">Summary</div>
          <div class="mc-section-text">${_esc(mins.summary)}</div>
        </div>` : ''}
        ${discussion ? `
        <div class="mc-section">
          <div class="mc-section-lbl">Discussion notes</div>
          <div class="mc-section-text">${_esc(discussion)}</div>
        </div>` : ''}
        ${mins.decisions_made ? `
        <div class="mc-section">
          <div class="mc-section-lbl">Decisions &amp; next steps</div>
          <div class="mc-section-text">${_esc(mins.decisions_made)}</div>
        </div>` : ''}
        <div style="font-size:10px;color:var(--muted);margin-top:8px;padding-top:6px;
          border-top:1px solid var(--border)">
          Status: ${_cap(mins.status || '')}
          ${mins.submitted_at ? ' · Submitted ' + _fmtDate(mins.submitted_at) : ''}
        </div>
        <!-- reply thread injected here -->
        <div class="mc-reply-thread" id="mc-thread-${meetingId}" style="display:none"
          onclick="event.stopPropagation()">
          <div id="mc-thread-entries-${meetingId}"></div>
        </div>
      </div>`;
  }

  function _renderComments(meetingId) {
    const el = document.getElementById('mc-thread-entries-' + meetingId);
    if (!el) return;
    const tops = _replies[meetingId] || [];

    // Always render the main compose box at the bottom
    const composeHtml = `
      <div class="mc-reply-compose" style="margin-top:${tops.length ? '8px' : '0'}">
        <textarea id="mc-compose-${meetingId}"
          placeholder="Add a comment… (Ctrl+Enter to send)"
          onkeydown="if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();MeetingCard._post('${meetingId}',null)}"
          onclick="event.stopPropagation()"></textarea>
        <button class="mc-reply-send"
          onclick="event.stopPropagation();MeetingCard._post('${meetingId}',null)">Send</button>
      </div>`;

    if (!tops.length) {
      el.innerHTML = composeHtml;
      return;
    }

    el.innerHTML = tops.map(c => {
      const subHtml = (c.replies || []).map(r => `
        <div class="mc-reply-entry" style="margin-top:6px;margin-left:30px">
          <div class="mc-reply-av" style="width:18px;height:18px;font-size:7px">${_ini(r.author_name)}</div>
          <div class="mc-reply-bubble" style="border-radius:0 6px 6px 6px">
            <div class="mc-reply-meta">
              <span style="font-weight:600;color:var(--text)">${_esc(r.author_name)}</span>
              <span>${_fmtDateTime(r.created_at)}</span>
            </div>
            <div class="mc-reply-text">${_esc(r.body)}</div>
          </div>
        </div>`).join('');

      return `
        <div class="mc-reply-entry" id="mc-comment-${c.id}">
          <div class="mc-reply-av">${_ini(c.author_name)}</div>
          <div class="mc-reply-bubble" style="flex:1">
            <div class="mc-reply-meta">
              <span style="font-weight:600;color:var(--text)">${_esc(c.author_name)}</span>
              <span style="display:flex;align-items:center;gap:8px">
                ${_fmtDateTime(c.created_at)}
                <button style="background:none;border:none;color:var(--muted);font-size:10px;
                  cursor:pointer;padding:0"
                  onclick="event.stopPropagation();MeetingCard._toggleSub('${meetingId}','${c.id}')">
                  ↩ Reply
                </button>
              </span>
            </div>
            <div class="mc-reply-text">${_esc(c.body)}</div>
            ${subHtml}
            <div class="mc-sub-compose" id="mc-sub-${meetingId}-${c.id}">
              <div class="mc-reply-compose">
                <textarea id="mc-sub-input-${meetingId}-${c.id}"
                  placeholder="Reply…"
                  onkeydown="if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();MeetingCard._post('${meetingId}','${c.id}')}"
                  onclick="event.stopPropagation()"></textarea>
                <button class="mc-reply-send"
                  onclick="event.stopPropagation();MeetingCard._post('${meetingId}','${c.id}')">Reply</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('') + composeHtml;

    // Auto-show thread if there are existing comments
    const thread = document.getElementById('mc-thread-' + meetingId);
    if (thread && tops.length) thread.style.display = 'block';
  }

  // ── Public: render full meeting card into containerEl ───────────────────────
  async function render(meetingId, containerEl, opts = {}) {
    _injectCSS();
    containerEl.innerHTML = '<div style="font-size:11px;color:var(--muted)">Loading…</div>';

    try {
      const data = await _load(meetingId);
      const { meeting, agenda, attendees, actionItems, minutes } = data;

      // Build resource name map for action items
      const resIds = [...new Set(actionItems.map(a => a.assigned_to_resource).filter(Boolean))];
      let resMap = opts.resMap || {};
      if (resIds.length && !Object.keys(resMap).length) {
        const rows = await API.get(
          `resources?id=in.(${resIds.join(',')})&select=id,first_name,last_name`
        ).catch(() => []);
        (rows || []).forEach(r => { resMap[r.id] = r.first_name + ' ' + r.last_name; });
      }

      const statusColors = {
        scheduled:   ['rgba(79,142,247,.15)',  'var(--accent)'],
        in_progress: ['rgba(212,144,31,.15)',  'var(--amber)'],
        completed:   ['rgba(255,255,255,.07)', 'var(--muted)'],
        cancelled:   ['rgba(192,64,74,.12)',   'var(--red)'],
      };
      const [scBg, scFg] = statusColors[meeting?.status] || statusColors.scheduled;

      const editHref = opts.editMinutesHref
        || `/meeting-minutes.html?meeting_id=${meetingId}${opts.prospectId ? '&prospect_id=' + opts.prospectId : ''}`;

      // next meeting date (pulled from minutes if available)
      const nextMeetText = minutes?.next_meeting_date
        ? `<span style="color:var(--text);font-weight:600">${_fmtDate(minutes.next_meeting_date)}</span>`
        : 'None';

      containerEl.innerHTML = `
        <!-- header -->
        <div style="display:flex;align-items:center;justify-content:space-between;
          margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:2px">
              ${_esc(meeting?.title || 'Meeting')}
            </div>
            <div style="font-size:10px;color:var(--muted)">
              ${meeting?.scheduled_date ? _fmtDateTime(meeting.scheduled_date) : 'Date TBD'}
              ${meeting?.scheduled_duration_minutes ? ' · ' + meeting.scheduled_duration_minutes + ' min' : ''}
              ${meeting?.location ? ' · 📍 ' + _esc(meeting.location) : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:10px;padding:2px 8px;border-radius:5px;
              background:${scBg};color:${scFg}">
              ${_cap(meeting?.status || 'scheduled')}
            </span>
            <a href="${editHref}" target="_blank"
              style="font-size:10px;padding:3px 8px;border-radius:5px;
                border:1px solid var(--border2);background:var(--surf2);
                color:var(--text2);text-decoration:none;white-space:nowrap">
              ✎ Edit minutes
            </a>
          </div>
        </div>

        <!-- next meeting -->
        <div class="mc-label">Next meeting</div>
        <div style="font-size:11px;margin-bottom:10px">${nextMeetText}</div>

        <!-- attendees -->
        <div class="mc-label">Attendees</div>
        <div style="margin-bottom:12px">${_renderAttendees(attendees)}</div>

        <!-- agenda -->
        <div class="mc-label">Agenda</div>
        <div style="margin-bottom:12px">${_renderAgenda(agenda)}</div>

        <!-- action items -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div class="mc-label" style="margin-bottom:0">Action items</div>
          <button onclick="event.stopPropagation();MeetingCard._addAction('${meetingId}',this)"
            data-meeting-id="${meetingId}"
            style="font-size:10px;padding:2px 8px;border-radius:4px;
              border:1px solid var(--border2);background:transparent;
              color:var(--muted);cursor:pointer">+ Add</button>
        </div>
        <div id="mc-ai-list-${meetingId}" style="margin-bottom:12px">
          ${_renderActionItems(actionItems, meetingId, { resMap })}
        </div>

        <!-- meeting minutes -->
        ${meeting?.status !== 'scheduled' ? `
        <div class="mc-label" style="margin-top:4px">Meeting minutes</div>
        <div id="mc-minutes-${meetingId}">
          ${_renderMinutes(minutes, meetingId)}
        </div>` : ''}
      `;

      // Load and render comments if minutes exist
      if (minutes) {
        await _loadComments(meetingId);
        _renderComments(meetingId);
      }

    } catch(e) {
      containerEl.innerHTML =
        `<div style="font-size:11px;color:var(--red)">Failed to load meeting: ${_esc(e.message)}</div>`;
    }
  }

  // ── Public: render pre-launch card (no meeting record yet) ──────────────────
  function renderPreLaunch(step, containerEl, onStart) {
    _injectCSS();
    const agenda = step._meetingAgenda || step.meeting_agenda || [];
    containerEl.innerHTML = `
      ${agenda.length ? `
      <div style="margin-bottom:10px">
        <div class="mc-label">Agenda</div>
        ${agenda.map((item, i) => `
          <div style="display:flex;gap:8px;font-size:11px;color:var(--text2);
            padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)">
            <span style="color:#4fc88c;flex-shrink:0;font-weight:600">${i + 1}.</span>
            <span>${_esc(item)}</span>
          </div>`).join('')}
      </div>` : ''}
      ${step.meeting_comments ? `
      <div style="font-size:11px;color:var(--muted);font-style:italic;margin-bottom:10px;
        padding:8px 10px;background:rgba(255,255,255,.03);border-radius:4px;
        border-left:2px solid var(--border2)">
        ${_esc(step.meeting_comments)}
      </div>` : ''}
      <button id="mc-start-btn-${step.id}"
        style="width:100%;padding:10px;background:rgba(79,200,140,.1);
          border:1px solid rgba(79,200,140,.35);color:#4fc88c;
          font-size:13px;font-weight:600;cursor:pointer;border-radius:5px">
        ◉ Start Meeting
      </button>`;

    document.getElementById('mc-start-btn-' + step.id)
      ?.addEventListener('click', onStart);
  }

  // ── Public: bust cache for a meeting ───────────────────────────────────────
  function bust(meetingId) {
    delete _cache[meetingId];
    delete _replies[meetingId];
  }

  // ── Internal: open/toggle reply thread ─────────────────────────────────────
  function _openThread(meetingId) {
    const el = document.getElementById('mc-thread-' + meetingId);
    if (!el) return;
    el.style.display = 'block';
    setTimeout(() => document.getElementById('mc-compose-' + meetingId)?.focus(), 50);
  }

  function _toggleSub(meetingId, commentId) {
    const el = document.getElementById('mc-sub-' + meetingId + '-' + commentId);
    if (!el) return;
    el.classList.toggle('open');
    if (el.classList.contains('open')) {
      setTimeout(() => document.getElementById('mc-sub-input-' + meetingId + '-' + commentId)?.focus(), 50);
    }
  }

  // ── Internal: post a comment ────────────────────────────────────────────────
  async function _post(meetingId, parentId) {
    const inpId  = parentId
      ? 'mc-sub-input-' + meetingId + '-' + parentId
      : 'mc-compose-' + meetingId;
    const inp  = document.getElementById(inpId);
    const body = inp?.value?.trim();
    if (!body) return;

    const myResourceId = window._myResourceId || window.PHUD?.myResourceId || null;
    const authorName   = myResourceId
      ? await API.get(`resources?id=eq.${myResourceId}&select=first_name,last_name&limit=1`)
          .then(r => r?.[0] ? r[0].first_name + ' ' + r[0].last_name : 'Team Member')
          .catch(() => 'Team Member')
      : 'Team Member';

    try {
      await API.post('meeting_comments', {
        firm_id:            _firmId(),
        meeting_id:         meetingId,
        parent_id:          parentId || null,
        author_resource_id: myResourceId || null,
        author_name:        authorName,
        body,
        created_at:         new Date().toISOString(),
      });
      if (inp) inp.value = '';
      if (parentId) {
        document.getElementById('mc-sub-' + meetingId + '-' + parentId)?.classList.remove('open');
      }
      await _loadComments(meetingId);
      _renderComments(meetingId);
      // Ensure thread is visible
      const thread = document.getElementById('mc-thread-' + meetingId);
      if (thread) thread.style.display = 'block';
    } catch(e) {
      console.error('Meeting comment failed:', e);
      if (typeof cadToast === 'function') cadToast('Comment failed: ' + e.message, 'error');
    }
  }

  // ── Internal: add action item ───────────────────────────────────────────────
  async function _addAction(meetingId, btn) {
    // If the host page registered a custom handler, use it
    if (typeof window._mcActionHandler === 'function') {
      window._mcActionHandler(meetingId);
      return;
    }
    // Default: simple prompt
    const desc = prompt('Action item description:');
    if (!desc?.trim()) return;
    const myResourceId = window._myResourceId || null;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    try {
      await API.post('meeting_action_items', {
        meeting_id:           meetingId,
        description:          desc.trim(),
        assigned_to_resource: myResourceId,
        due_date:             dueDate.toLocaleDateString('en-CA'),
        status:               'open',
      });
      bust(meetingId);
      // Re-render just the action items list
      const data = await _load(meetingId);
      const resIds = [...new Set(data.actionItems.map(a => a.assigned_to_resource).filter(Boolean))];
      let resMap = {};
      if (resIds.length) {
        const rows = await API.get(
          `resources?id=in.(${resIds.join(',')})&select=id,first_name,last_name`
        ).catch(() => []);
        (rows || []).forEach(r => { resMap[r.id] = r.first_name + ' ' + r.last_name; });
      }
      const listEl = document.getElementById('mc-ai-list-' + meetingId);
      if (listEl) listEl.innerHTML = _renderActionItems(data.actionItems, meetingId, { resMap });
    } catch(e) {
      console.error('Add action item failed:', e);
    }
  }

  // ── Expose internals needed by inline onclick handlers ──────────────────────
  return {
    render,
    renderPreLaunch,
    bust,
    _openThread,
    _toggleSub,
    _post,
    _addAction,
  };

})();