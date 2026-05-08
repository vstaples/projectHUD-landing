// ============================================================
// ProjectHUD — accord-views.js
// CMD-ACCORD-CONSTELLATION-ENTRY-1 · Phase 4a
//
// Center-pane view rendering for two non-constellation levels:
//   • workstream-level — STRICT NAVIGATIONAL per IR70 boundary
//     (commission §2). Breadcrumb, sub-workstreams list, meetings
//     list, +New Workstream (sub), +New Meeting. No activity
//     intelligence, aggregated badges, or substrate prompts.
//   • meeting-level — scaffolding only. Breadcrumb, meeting-scoped
//     tab bar (Live Capture / Living Document / Decision Ledger /
//     Digest & Send / Minutes). Each tab DOES NOT re-render the
//     full surface; instead it loads the active meeting via
//     Accord.loadMeeting() and switches to the legacy section
//     embedded inside the meeting-view frame.
//
// Mount/unmount are coordinated by accord-transitions.js. This
// module exposes pure render functions; transitions own the DOM
// swap timing.
//
// Listens for: accord:level-changed, accord:meeting-filed/-unfiled/
// -refiled, accord:workstream-renamed/-archived/-restored.
// ============================================================

(function () {
  'use strict';

  const API = window.API;
  const $   = id => document.getElementById(id);

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Cache for derived view data (cleared on substrate events) ──
  const cache = {
    workstreams: null,    // active rows
    filedMtgs:   null,    // meetings with workstream_id NOT NULL
  };

  async function _loadIfNeeded() {
    if (cache.workstreams && cache.filedMtgs) return;
    try {
      const [ws, mtgs] = await Promise.all([
        API.get('workstreams?state=eq.active&select=workstream_id,parent_workstream_id,name,created_at&order=name.asc'),
        API.get('accord_meetings?workstream_id=not.is.null&select=meeting_id,title,workstream_id,scheduled_for,created_at,sealed_at,state&order=scheduled_for.desc.nullslast,created_at.desc'),
      ]);
      cache.workstreams = Array.isArray(ws) ? ws : [];
      cache.filedMtgs   = Array.isArray(mtgs) ? mtgs : [];
    } catch (e) {
      console.error('[Accord-views] data load failed', e);
      cache.workstreams = cache.workstreams || [];
      cache.filedMtgs   = cache.filedMtgs   || [];
    }
  }

  function _invalidate() {
    cache.workstreams = null;
    cache.filedMtgs   = null;
  }

  // ────────────────────────────────────────────────────────────
  // WORKSTREAM-LEVEL VIEW
  // ────────────────────────────────────────────────────────────
  async function renderWorkstreamView(host, workstreamId) {
    if (!host) return;
    await _loadIfNeeded();

    const ws = cache.workstreams.find(w => w.workstream_id === workstreamId);
    if (!ws) {
      host.innerHTML = `
        <div class="ac-view-empty">
          <h3>Workstream not found</h3>
          <p>It may have been archived. <a href="#" data-ascend>Return to constellation.</a></p>
        </div>`;
      host.querySelector('[data-ascend]')?.addEventListener('click', (ev) => {
        ev.preventDefault();
        window.Accord?.setLevel?.('constellation', {});
      });
      return;
    }

    const isSub = !!ws.parent_workstream_id;
    const parent = isSub
      ? cache.workstreams.find(w => w.workstream_id === ws.parent_workstream_id)
      : null;

    const subs = cache.workstreams.filter(w => w.parent_workstream_id === workstreamId);
    const directMeetings = cache.filedMtgs.filter(m => m.workstream_id === workstreamId);

    let html = `
      <div class="ac-view ac-view-workstream" data-ws-id="${esc(workstreamId)}">
        <header class="ac-view-header">
          <nav class="ac-breadcrumb" aria-label="Breadcrumb">
            <a href="#" class="ac-bc-crumb" data-ascend-to="constellation">Constellation</a>
            <span class="ac-bc-sep" aria-hidden="true">›</span>`;
    if (isSub && parent) {
      html += `
            <a href="#" class="ac-bc-crumb" data-ascend-to="workstream" data-ws-id="${esc(parent.workstream_id)}">${esc(parent.name)}</a>
            <span class="ac-bc-sep" aria-hidden="true">›</span>`;
    }
    html += `
            <span class="ac-bc-current">${esc(ws.name)}</span>
          </nav>
          <h1 class="ac-view-title">${esc(ws.name)}</h1>
          ${ws.description ? `<p class="ac-view-desc">${esc(ws.description)}</p>` : ''}
        </header>

        <div class="ac-view-body">`;

    // Sub-workstreams section (only at top-level)
    if (!isSub) {
      html += `
        <section class="ac-view-section">
          <header class="ac-section-head">
            <h2>Sub-workstreams</h2>
            <button type="button" class="ac-btn-secondary" data-action="new-sub" data-ws-id="${esc(workstreamId)}">+ New sub-workstream</button>
          </header>`;
      if (!subs.length) {
        html += `<div class="ac-list-empty">No sub-workstreams.</div>`;
      } else {
        html += `<ul class="ac-list ac-sub-list">`;
        subs.forEach(s => {
          const subMtgCount = cache.filedMtgs.filter(m => m.workstream_id === s.workstream_id).length;
          html += `
            <li class="ac-list-row" data-ws-id="${esc(s.workstream_id)}" tabindex="0" role="button">
              <span class="ac-list-row-label">${esc(s.name)}</span>
              <span class="ac-list-row-meta">${subMtgCount} meeting${subMtgCount === 1 ? '' : 's'}</span>
            </li>`;
        });
        html += `</ul>`;
      }
      html += `</section>`;
    }

    // Meetings section
    html += `
      <section class="ac-view-section">
        <header class="ac-section-head">
          <h2>${isSub ? 'Meetings' : 'Direct meetings'}</h2>
          <button type="button" class="ac-btn-primary" data-action="new-meeting" data-ws-id="${esc(workstreamId)}">+ New meeting</button>
        </header>`;
    if (!directMeetings.length) {
      html += `<div class="ac-list-empty">${isSub ? 'No meetings filed yet.' : 'No meetings filed directly under this workstream.'}</div>`;
    } else {
      html += `<ul class="ac-list ac-meeting-list">`;
      directMeetings.forEach(m => {
        const dot =
          m.sealed_at         ? 'sealed'   :
          m.state === 'running' ? 'running'  :
          m.state === 'closed'  ? 'closed'   :
                                  'draft';
        const dateStr = m.scheduled_for
          ? new Date(m.scheduled_for).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
          : '—';
        html += `
          <li class="ac-list-row ac-meeting-row" data-mtg-id="${esc(m.meeting_id)}" tabindex="0" role="button">
            <span class="ac-list-dot ac-list-dot-${dot}" aria-hidden="true"></span>
            <span class="ac-list-row-label">${esc(m.title || '(untitled)')}</span>
            <span class="ac-list-row-meta">${esc(dateStr)}</span>
          </li>`;
      });
      html += `</ul>`;
    }
    html += `</section>`;

    html += `
        </div>
      </div>`;

    host.innerHTML = html;
    _wireWorkstreamView(host, workstreamId);
  }

  function _wireWorkstreamView(host, workstreamId) {
    // Breadcrumb crumbs
    host.querySelectorAll('[data-ascend-to]').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        const to = el.dataset.ascendTo;
        if (to === 'constellation') {
          window.Accord?.setLevel?.('constellation', {});
        } else if (to === 'workstream') {
          window.Accord?.setLevel?.('workstream', { workstreamId: el.dataset.wsId });
        }
      });
    });

    // Sub-workstream click → descend
    host.querySelectorAll('.ac-sub-list .ac-list-row[data-ws-id]').forEach(row => {
      const handler = () => window.Accord?.setLevel?.('workstream', { workstreamId: row.dataset.wsId });
      row.addEventListener('click', handler);
      row.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); handler(); }
      });
    });

    // Meeting click → descend to meeting level
    host.querySelectorAll('.ac-meeting-list .ac-meeting-row[data-mtg-id]').forEach(row => {
      const handler = () => window.Accord?.setLevel?.('meeting', {
        meetingId: row.dataset.mtgId,
        workstreamId,
      });
      row.addEventListener('click', handler);
      row.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); handler(); }
      });
    });

    // + New sub-workstream — opens existing create modal with parent preset
    host.querySelector('[data-action="new-sub"]')?.addEventListener('click', () => {
      // The existing AccordWorkstreams.openCreate doesn't take a parent
      // hint; in this Phase 4a, opening the modal lets the operator pick.
      // Phase 4b or a follow-on may pass through an explicit parent preset.
      window.AccordWorkstreams?.openCreate?.();
    });

    // + New meeting — defers to the legacy create-meeting flow.
    // Accord.createMeeting (accord-core export) creates a meeting in the
    // operator's firm without a workstream binding; we follow up with a
    // PATCH to set workstream_id, then descend.
    host.querySelector('[data-action="new-meeting"]')?.addEventListener('click', async () => {
      try {
        const m = await window.Accord?.createMeeting?.();
        if (!m?.meeting_id) return;
        await API.patch(`accord_meetings?meeting_id=eq.${m.meeting_id}`, {
          workstream_id: workstreamId,
        });
        // Emit filed event so rails refresh
        window.dispatchEvent(new CustomEvent('accord:meeting-filed', {
          detail: {
            meeting_id: m.meeting_id,
            from_workstream_id: null,
            to_workstream_id: workstreamId,
          },
        }));
        window.Accord?.setLevel?.('meeting', { meetingId: m.meeting_id, workstreamId });
      } catch (e) {
        console.error('[Accord-views] new meeting flow failed', e);
        alert('Could not create meeting: ' + (e?.message || e));
      }
    });
  }

  // ────────────────────────────────────────────────────────────
  // MEETING-LEVEL VIEW (scaffolding)
  // ────────────────────────────────────────────────────────────
  async function renderMeetingView(host, meetingId, workstreamId) {
    if (!host) return;

    // Fetch meeting basics
    let meeting = null;
    try {
      const rows = await API.get(`accord_meetings?meeting_id=eq.${meetingId}&select=meeting_id,title,workstream_id,scheduled_for,created_at,sealed_at,state,organizer_id`);
      meeting = rows?.[0] || null;
    } catch (e) {
      console.warn('[Accord-views] meeting load failed', e);
    }

    if (!meeting) {
      host.innerHTML = `
        <div class="ac-view-empty">
          <h3>Meeting not found</h3>
          <p><a href="#" data-ascend>Return to constellation.</a></p>
        </div>`;
      host.querySelector('[data-ascend]')?.addEventListener('click', (ev) => {
        ev.preventDefault();
        window.Accord?.setLevel?.('constellation', {});
      });
      return;
    }

    await _loadIfNeeded();
    const owningWsId = workstreamId || meeting.workstream_id;
    const ws = owningWsId ? cache.workstreams.find(w => w.workstream_id === owningWsId) : null;
    const parent = ws && ws.parent_workstream_id
      ? cache.workstreams.find(w => w.workstream_id === ws.parent_workstream_id)
      : null;

    const dot =
      meeting.sealed_at        ? 'sealed'  :
      meeting.state === 'running' ? 'running' :
      meeting.state === 'closed'  ? 'closed'  :
                                    'draft';

    let html = `
      <div class="ac-view ac-view-meeting" data-mtg-id="${esc(meetingId)}">
        <header class="ac-view-header">
          <nav class="ac-breadcrumb" aria-label="Breadcrumb">
            <a href="#" class="ac-bc-crumb" data-ascend-to="constellation">Constellation</a>`;
    if (parent) {
      html += `
            <span class="ac-bc-sep" aria-hidden="true">›</span>
            <a href="#" class="ac-bc-crumb" data-ascend-to="workstream" data-ws-id="${esc(parent.workstream_id)}">${esc(parent.name)}</a>`;
    }
    if (ws) {
      html += `
            <span class="ac-bc-sep" aria-hidden="true">›</span>
            <a href="#" class="ac-bc-crumb" data-ascend-to="workstream" data-ws-id="${esc(ws.workstream_id)}">${esc(ws.name)}</a>`;
    }
    html += `
            <span class="ac-bc-sep" aria-hidden="true">›</span>
            <span class="ac-bc-current">
              <span class="ac-list-dot ac-list-dot-${dot}" aria-hidden="true"></span>
              ${esc(meeting.title || '(untitled)')}
            </span>
          </nav>
          <h1 class="ac-view-title">${esc(meeting.title || '(untitled)')}</h1>
        </header>

        <div class="ac-view-body ac-meeting-tabs-shell">
          <div class="ac-meeting-tabs" role="tablist">
            <button type="button" class="ac-mtg-tab active" data-mtg-tab="capture"  role="tab">Live Capture</button>
            <button type="button" class="ac-mtg-tab"        data-mtg-tab="document" role="tab">Living Document</button>
            <button type="button" class="ac-mtg-tab"        data-mtg-tab="ledger"   role="tab">Decision Ledger</button>
            <button type="button" class="ac-mtg-tab"        data-mtg-tab="digest"   role="tab">Digest &amp; Send</button>
            <button type="button" class="ac-mtg-tab"        data-mtg-tab="minutes"  role="tab">Minutes</button>
          </div>
          <div class="ac-meeting-tab-body" id="ac-meeting-tab-body">
            <div class="ac-meeting-tab-stub">
              <p>Meeting-level surfaces inherit the existing legacy renderings. Switch to <strong>Legacy view</strong> from the topnav for full Live Capture, Living Document, Ledger, Digest, or Minutes interaction. Phase 5 inlines those renderings here.</p>
              <button type="button" class="ac-btn-secondary" data-action="open-legacy">Open in Legacy view</button>
            </div>
          </div>
        </div>
      </div>`;

    host.innerHTML = html;
    _wireMeetingView(host, meeting);

    // Load the meeting into accord-core state so legacy surfaces can
    // render it when the operator switches modes
    if (window.Accord?.loadMeeting && meeting.meeting_id) {
      try { await window.Accord.loadMeeting(meeting.meeting_id); }
      catch (e) { console.warn('[Accord-views] loadMeeting best-effort failure', e); }
    }
  }

  function _wireMeetingView(host, meeting) {
    host.querySelectorAll('[data-ascend-to]').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        const to = el.dataset.ascendTo;
        if (to === 'constellation') {
          window.Accord?.setLevel?.('constellation', {});
        } else if (to === 'workstream') {
          window.Accord?.setLevel?.('workstream', { workstreamId: el.dataset.wsId });
        }
      });
    });

    // Tab buttons — Phase 4a stub. Each tab body shows the same stub copy
    // until Phase 5 inlines per-surface renderings.
    host.querySelectorAll('.ac-mtg-tab[data-mtg-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        host.querySelectorAll('.ac-mtg-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Body content unchanged this phase — Phase 5 swaps per-tab content
      });
    });

    host.querySelector('[data-action="open-legacy"]')?.addEventListener('click', () => {
      // Switch to legacy view, then activate the matching surface
      const activeTab = host.querySelector('.ac-mtg-tab.active')?.dataset.mtgTab || 'capture';
      window.Accord?.setViewMode?.('legacy');
      setTimeout(() => {
        window.Accord?.switchSurface?.(activeTab);
      }, 50);
    });
  }

  // ── Substrate event invalidation ────────────────────────────
  ['accord:meeting-filed', 'accord:meeting-unfiled', 'accord:meeting-refiled',
   'accord:workstream-created', 'accord:workstream-renamed',
   'accord:workstream-archived', 'accord:workstream-restored'].forEach(name => {
    window.addEventListener(name, _invalidate);
  });

  // ── Expose ──────────────────────────────────────────────────
  window.AccordViews = {
    renderWorkstreamView,
    renderMeetingView,
    invalidate: _invalidate,
  };
})();