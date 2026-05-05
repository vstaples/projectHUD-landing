// ============================================================
// ProjectHUD — accord-minutes.js
// CMD-PROJECTION-ENGINE-2 · Minutes surface
//
// Read-only surface over sealed meetings + accord_minutes_renders.
// Drives template-dispatched rendering via the render-minutes
// Edge Function (projection engine).
//
// Four templates available (CMD-PROJECTION-ENGINE-2):
//   - technical-briefing  (NEW; formal-governance Minutes,
//                          mockup-aligned full record)
//   - working-session     (renamed from CMD-1's
//                          'technical-briefing'; lightweight
//                          Minutes for informal sessions)
//   - executive-briefing  (one-page summary; KPI strip; angles)
//   - personal-digest     (addressed-to-reader; per-recipient)
//
// Doctrinal commitments preserved:
//   - IR42 sealed-only render (substrate read filter)
//   - IR45 declared belief; never confidence/probability
//   - IR47 explicit accord_* PK names (render_id, meeting_id)
//   - IR51 chip/badge/picker classes decided at construction
//   - IR52 IIFE-wrapped, public surface namespaced
//   - IR54 SELECT-after-mutation in render polling
//   - IR64 codebase-as-spec
// ============================================================

(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  // ── Template registry (UI-side; mirrors Edge Function) ───────
  // Order matters: this is the order shown in the picker.
  const TEMPLATES = [
    { id: 'technical-briefing', label: 'Technical Briefing', short: 'Technical' },
    { id: 'working-session',    label: 'Working Session',    short: 'Working'   },
    { id: 'executive-briefing', label: 'Executive Briefing', short: 'Executive' },
    { id: 'personal-digest',    label: 'Personal Digest',    short: 'Personal'  },
  ];
  // Default omitted-template behavior matches the Edge Function:
  // 'working-session' (the renamed CMD-1 template). The new
  // formal-governance Technical Briefing is opt-in via picker.
  const DEFAULT_TEMPLATE = 'working-session';
  // Pre-CMD-2 legacy rows lacking template_id were written
  // under CMD-1's 'technical-briefing' label. Those rows have
  // been migrated to 'working-session' by the SQL migration,
  // but if any race-window legacy row still surfaces with no
  // template_id at all, we treat it as Working Session.
  const LEGACY_FALLBACK_TEMPLATE = 'working-session';
  function _templateLabel(id) {
    const t = TEMPLATES.find(t => t.id === id);
    return t ? t.label : (id || 'Working Session');
  }
  function _templateShort(id) {
    const t = TEMPLATES.find(t => t.id === id);
    return t ? t.short : (id || 'Working');
  }

  // ── Local state ──────────────────────────────────────────────
  const local = {
    initialized:      false,
    meetings:         [],       // sealed meetings
    renders:          {},       // { meeting_id: [render_row, ...] }
    activeMeeting:    null,
    activeFilter:     'all',    // 'all' | 'rendered' | 'not_yet' | 'failed'
    activeTemplate:   DEFAULT_TEMPLATE,
    inProgress:       new Set(),// meeting_ids currently rendering (optimistic UI)
  };

  const esc = s => Accord._esc ? Accord._esc(s) : String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ── Surface activation ───────────────────────────────────────
  window.addEventListener('accord:surface-changed', async (ev) => {
    if (ev.detail?.surface !== 'minutes') return;
    if (!local.initialized) {
      _wireUI();
      local.initialized = true;
    }
    await _refresh();
  });

  // ── Top-level refresh ────────────────────────────────────────
  async function _refresh() {
    await _loadMeetings();
    await _loadRenders();
    _renderRail();
    _renderAggregate();
    if (local.activeMeeting && local.meetings.find(m => m.meeting_id === local.activeMeeting)) {
      _renderStatus();
      _renderHistory();
    } else {
      _renderEmptyStatus();
    }
  }

  // ── Loaders ──────────────────────────────────────────────────
  async function _loadMeetings() {
    try {
      const rows = await API.get(
        'accord_meetings?sealed_at=not.is.null&select=*&order=sealed_at.desc'
      );
      local.meetings = rows || [];
    } catch (e) {
      console.error('[Accord-minutes] loadMeetings failed', e);
      local.meetings = [];
    }
  }

  async function _loadRenders() {
    if (!local.meetings.length) {
      local.renders = {};
      return;
    }
    const meetingIds = local.meetings.map(m => m.meeting_id);
    try {
      const rows = await API.get(
        `accord_minutes_renders?meeting_id=in.(${meetingIds.join(',')})` +
        `&select=*&order=rendered_at.desc&limit=500`
      );
      local.renders = {};
      (rows || []).forEach(r => {
        if (!local.renders[r.meeting_id]) local.renders[r.meeting_id] = [];
        local.renders[r.meeting_id].push(r);
      });
    } catch (e) {
      console.error('[Accord-minutes] loadRenders failed', e);
      local.renders = {};
    }
  }

  // ── Per-meeting status derivation ────────────────────────────
  // Status is per meeting (any successful render of any template
  // counts as "rendered"). The picker drives which template the
  // next Generate/Re-render call uses.
  function _latestRender(meetingId) {
    const arr = local.renders[meetingId] || [];
    return arr[0] || null; // already sorted desc
  }
  function _latestSuccess(meetingId) {
    const arr = local.renders[meetingId] || [];
    return arr.find(r => r.status === 'success') || null;
  }
  // Latest successful render for a SPECIFIC template — used by
  // the status card's Download/Print buttons so they target the
  // currently-selected template.
  function _latestSuccessForTemplate(meetingId, templateId) {
    const arr = local.renders[meetingId] || [];
    return arr.find(r => r.status === 'success' && (r.template_id || DEFAULT_TEMPLATE) === templateId) || null;
  }
  function _statusFor(meetingId) {
    if (local.inProgress.has(meetingId)) return 'rendering';
    const latest = _latestRender(meetingId);
    if (!latest) return 'not_yet';
    if (latest.status === 'success')   return 'rendered';
    if (latest.status === 'failed')    return 'failed';
    if (latest.status === 'rendering') return 'rendering';
    return 'not_yet';
  }

  // ── Rail render ──────────────────────────────────────────────
  function _renderRail() {
    const el = $('minutesMeetingList');
    if (!local.meetings.length) {
      el.innerHTML = '<div style="color:var(--ink-faint);font-size:12px;padding:16px 4px;font-style:italic">No sealed meetings yet.</div>';
      return;
    }
    const f = local.activeFilter;
    const visible = local.meetings.filter(m => {
      if (f === 'all') return true;
      const s = _statusFor(m.meeting_id);
      if (f === 'rendered' && s === 'rendered') return true;
      if (f === 'not_yet'  && s === 'not_yet')  return true;
      if (f === 'failed'   && s === 'failed')   return true;
      return false;
    });
    if (!visible.length) {
      el.innerHTML = '<div style="color:var(--ink-faint);font-size:12px;padding:16px 4px;font-style:italic">No meetings match filter.</div>';
      return;
    }
    el.innerHTML = visible.map(m => {
      const status = _statusFor(m.meeting_id);
      // IR51: pill class chosen at construction time
      const pillClass = [
        'render-pill',
        status === 'rendered'  && 'pill-rendered',
        status === 'rendering' && 'pill-rendering',
        status === 'failed'    && 'pill-failed',
        status === 'not_yet'   && 'pill-not-yet',
      ].filter(Boolean).join(' ');
      const sealedFmt = m.sealed_at
        ? new Date(m.sealed_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
        : '';
      const cls = ['minutes-meeting-row'];
      if (m.meeting_id === local.activeMeeting) cls.push('active');
      const pillText =
        status === 'rendered'  ? 'rendered' :
        status === 'rendering' ? 'rendering' :
        status === 'failed'    ? 'failed' :
                                 'not yet';
      return `
        <div class="${cls.join(' ')}" data-meeting-id="${m.meeting_id}">
          <div class="meeting-title">${esc(m.title || 'Untitled')}</div>
          <div class="meeting-meta">${esc(sealedFmt)}</div>
          <span class="${pillClass}">${esc(pillText)}</span>
        </div>`;
    }).join('');
    el.querySelectorAll('.minutes-meeting-row').forEach(node => {
      node.addEventListener('click', () => _selectMeeting(node.dataset.meetingId));
    });
  }

  function _renderAggregate() {
    const total = local.meetings.length;
    let rendered = 0, notYet = 0, failed = 0, rendering = 0;
    local.meetings.forEach(m => {
      const s = _statusFor(m.meeting_id);
      if (s === 'rendered')  rendered++;
      else if (s === 'not_yet') notYet++;
      else if (s === 'failed')  failed++;
      else if (s === 'rendering') rendering++;
    });
    const lines = [];
    lines.push(`<span class="agg-line total">${total} sealed meeting${total === 1 ? '' : 's'}</span>`);
    if (rendered)  lines.push(`<span class="agg-line">${rendered} rendered</span>`);
    if (rendering) lines.push(`<span class="agg-line">${rendering} rendering</span>`);
    if (notYet)    lines.push(`<span class="agg-line">${notYet} not yet</span>`);
    if (failed)    lines.push(`<span class="agg-line">${failed} failed</span>`);
    $('minutesAggregate').innerHTML = lines.join('');
  }

  async function _selectMeeting(meetingId) {
    local.activeMeeting = meetingId;
    document.querySelectorAll('#minutesMeetingList .minutes-meeting-row').forEach(r => {
      r.classList.toggle('active', r.dataset.meetingId === meetingId);
    });
    _renderStatus();
    document.querySelector('#accord-app .minutes-body')?.classList.add('history-open');
    _renderHistory();
  }

  // ── Status render (center column) ────────────────────────────
  function _renderEmptyStatus() {
    $('minutesStatus').innerHTML =
      '<div class="minutes-empty-cta">' +
      '<div><h3 style="font-family:Fraunces,serif;font-weight:600;font-size:18px;color:var(--ink-muted);margin-bottom:6px">Select a sealed meeting from the rail.</h3>' +
      '<p style="font-size:12px;color:var(--ink-faint);max-width:380px;line-height:1.55">Minutes renders the sealed Chain of Custody record as a citable, cryptographically-anchored PDF. Four templates are available: Technical Briefing, Working Session, Executive Briefing, and Personal Digest.</p></div></div>';
    document.querySelector('#accord-app .minutes-body')?.classList.remove('history-open');
  }

  function _renderStatus() {
    const m = local.meetings.find(x => x.meeting_id === local.activeMeeting);
    const el = $('minutesStatus');
    if (!m) { _renderEmptyStatus(); return; }

    const status = _statusFor(m.meeting_id);
    // CTA buttons target the currently selected template; if no
    // success exists for that template yet, show Generate (even
    // when other templates have been rendered).
    const tplSuccess = _latestSuccessForTemplate(m.meeting_id, local.activeTemplate);
    const anySuccess = _latestSuccess(m.meeting_id);
    const latest     = _latestRender(m.meeting_id);

    const sealedFmt = m.sealed_at
      ? new Date(m.sealed_at).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })
      : '';

    // Template picker (IR51: classes/labels decided at construction)
    const pickerHtml = `
      <div class="minutes-template-picker">
        <div class="picker-label">Template</div>
        <div class="picker-row" id="minutesTemplatePicker">
          ${TEMPLATES.map(t => {
            const active = t.id === local.activeTemplate;
            const cls = ['picker-chip'];
            if (active) cls.push('active');
            return `<button class="${cls.join(' ')}" data-template-id="${t.id}">${esc(t.label)}</button>`;
          }).join('')}
        </div>
      </div>`;

    // CTA construction (IR51: classes/labels decided here)
    let ctaHtml = '';
    if (status === 'rendering') {
      ctaHtml = `<button class="minutes-action-btn" disabled>Rendering…</button>
                 <span class="muted" style="font-size:12px;color:var(--ink-faint);font-family:'IBM Plex Mono',monospace">PDF generation in progress</span>`;
    } else if (tplSuccess) {
      // This template has a successful render — show download / print / re-render
      const dlBtnHtml = tplSuccess.storage_path
        ? `<a class="minutes-action-btn" id="minutesDownloadBtn" target="_blank" rel="noopener">Download PDF</a>`
        : '<button class="minutes-action-btn" disabled>Download unavailable</button>';
      const printBtnHtml = tplSuccess.storage_path
        ? `<button class="minutes-action-btn" id="minutesPrintBtn" title="Open in new window and trigger your browser's Save as PDF dialog"><span aria-hidden="true" style="margin-right:6px">🖨</span>Print / Save as PDF</button>`
        : '';
      ctaHtml = `${dlBtnHtml}
                 ${printBtnHtml}
                 <button class="minutes-action-btn btn-ghost" id="minutesRerenderBtn">Re-render</button>`;
    } else if (status === 'failed' && (latest?.template_id || DEFAULT_TEMPLATE) === local.activeTemplate) {
      const reason = latest?.failure_reason || 'unknown error';
      ctaHtml = `<button class="minutes-action-btn" id="minutesGenerateBtn">Retry ${esc(_templateShort(local.activeTemplate))}</button>
                 <span class="muted" style="font-size:12px;color:var(--tag-risk);font-family:'IBM Plex Mono',monospace">Last render failed: ${esc(reason.slice(0, 100))}</span>`;
    } else {
      // No success yet for this template
      const otherSuccessNote = anySuccess
        ? `<span class="muted" style="font-size:12px;color:var(--ink-faint);font-family:'IBM Plex Mono',monospace">Other templates already rendered for this meeting</span>`
        : `<span class="muted" style="font-size:12px;color:var(--ink-faint);font-family:'IBM Plex Mono',monospace">Renders the sealed substrate as a PDF</span>`;
      ctaHtml = `<button class="minutes-action-btn" id="minutesGenerateBtn">Generate ${esc(_templateShort(local.activeTemplate))}</button>
                 ${otherSuccessNote}`;
    }

    // Fingerprint shows the merkle root of the latest success of
    // this template (or fall back to any successful render, or to
    // the meeting's own merkle root if nothing has rendered yet).
    const fpSource = tplSuccess || anySuccess;
    const fingerprint = (fpSource?.merkle_root_at_render || m.merkle_root || '').slice(0, 64);
    const fingerprintHtml = fingerprint
      ? `<div style="margin-top:14px">
           <div class="label" style="font:500 12px 'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:0.08em;color:var(--ink-faint);margin-bottom:4px">Merkle root at render</div>
           <div class="minutes-current-fingerprint">${esc(fingerprint)}</div>
         </div>`
      : '';

    el.innerHTML = `
      <div class="minutes-status-card">
        <h2>${esc(m.title || 'Untitled')}</h2>
        <div class="minutes-status-meta">
          <span class="meta-pill">Sealed ${esc(sealedFmt)}</span>
          ${tplSuccess
            ? `<span class="meta-pill">Last rendered ${esc(new Date(tplSuccess.rendered_at).toLocaleString())}</span>
               <span class="meta-pill">${esc(tplSuccess.render_version || '')}</span>`
            : ''}
        </div>
        ${pickerHtml}
        <div class="minutes-cta-row">${ctaHtml}</div>
        ${fingerprintHtml}
      </div>
    `;

    // Wire picker
    const pickerEl = $('minutesTemplatePicker');
    if (pickerEl) {
      pickerEl.querySelectorAll('.picker-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          const newTemplate = btn.dataset.templateId;
          if (!newTemplate || newTemplate === local.activeTemplate) return;
          local.activeTemplate = newTemplate;
          _renderStatus();
        });
      });
    }

    // Wire CTAs
    $('minutesGenerateBtn')?.addEventListener('click', () => _generate(m.meeting_id, false));
    $('minutesRerenderBtn')?.addEventListener('click', () => _openRerenderModal(m));
    const dlBtn = $('minutesDownloadBtn');
    if (dlBtn && tplSuccess) {
      dlBtn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const url = await _signedUrlFor(tplSuccess);
        if (url) window.open(url, '_blank', 'noopener');
      });
    }
    const prBtn = $('minutesPrintBtn');
    if (prBtn && tplSuccess) {
      prBtn.addEventListener('click', () => _printToPdf(tplSuccess));
    }
  }

  // ── History panel (right column) ─────────────────────────────
  // Grouped by template_id per brief §7 / §6.6.
  function _renderHistory() {
    const m = local.meetings.find(x => x.meeting_id === local.activeMeeting);
    const body = $('minutesHistoryBody');
    if (!m) { body.innerHTML = ''; return; }
    const arr = local.renders[m.meeting_id] || [];

    // Group by template_id; missing template_id (legacy rows) → DEFAULT_TEMPLATE
    const byTemplate = {};
    TEMPLATES.forEach(t => { byTemplate[t.id] = []; });
    arr.forEach(r => {
      const tid = r.template_id || DEFAULT_TEMPLATE;
      if (!byTemplate[tid]) byTemplate[tid] = [];
      byTemplate[tid].push(r);
    });

    let inner = '';
    if (!arr.length) {
      inner = `<div class="minutes-history-section-label">Render history</div>
               <div style="font-size:13px;color:var(--ink-faint);font-style:italic">No renders yet.</div>`;
    } else {
      TEMPLATES.forEach(t => {
        const rows = byTemplate[t.id] || [];
        if (!rows.length) return;
        const latestSuccess = rows.find(r => r.status === 'success');
        inner += `<div class="minutes-history-section-label" style="margin-top:18px">${esc(t.label)} (${rows.length})</div>`;
        inner += rows.map(r => _renderHistoryRow(r, r.render_id === latestSuccess?.render_id)).join('');
      });
      // Surface any leftover rows under unknown template_id (defensive)
      Object.keys(byTemplate).forEach(tid => {
        if (TEMPLATES.find(t => t.id === tid)) return;
        const rows = byTemplate[tid];
        if (!rows.length) return;
        inner += `<div class="minutes-history-section-label" style="margin-top:18px">${esc(tid)} (${rows.length})</div>`;
        inner += rows.map(r => _renderHistoryRow(r, false)).join('');
      });
    }
    body.innerHTML = inner;

    // Wire per-row download links
    body.querySelectorAll('a[data-render-id]').forEach(a => {
      a.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const rid = a.getAttribute('data-render-id');
        const r = arr.find(x => x.render_id === rid);
        if (!r) return;
        const url = await _signedUrlFor(r);
        if (url) window.open(url, '_blank', 'noopener');
      });
    });
  }

  function _renderHistoryRow(r, isCurrent) {
    const cls = ['minutes-history-row'];
    if (isCurrent) cls.push('current');
    const when = r.rendered_at ? new Date(r.rendered_at).toLocaleString() : '';
    const versionLine = r.render_version ? `<div class="hist-line">${esc(r.render_version)}</div>` : '';
    const hashLine    = r.content_hash
      ? `<div class="hist-line">hash: ${esc(r.content_hash.slice(0, 16))}…</div>` : '';
    const statusLine  = `<div class="hist-line">status: ${esc(r.status)}${r.failure_reason ? ' — ' + esc(r.failure_reason.slice(0, 60)) : ''}</div>`;
    const dlLink      = (r.status === 'success' && r.storage_path)
      ? `<div class="hist-line"><a data-render-id="${esc(r.render_id)}">download this version</a></div>`
      : '';
    return `
      <div class="${cls.join(' ')}">
        <div class="hist-when">${esc(when)}${isCurrent ? ' · current' : ''}</div>
        ${versionLine}
        ${hashLine}
        ${statusLine}
        ${dlLink}
      </div>`;
  }

  // ── Signed URL resolution ────────────────────────────────────
  // Build a one-shot supabase-js client with the user's JWT and use it to
  // mint a signed URL. window.supabase is the supabase-js factory (with
  // createClient method), not a client instance — accord-core.js line 347
  // uses the same pattern.
  let _signClient = null;
  async function _signClientGet() {
    if (_signClient) return _signClient;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      // Wait for supabase-js to load (mirrors accord-core's polling pattern)
      let waits = 0;
      while ((!window.supabase || typeof window.supabase.createClient !== 'function') && waits < 40) {
        await new Promise(r => setTimeout(r, 50));
        waits++;
      }
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.warn('[Accord-minutes] supabase-js factory unavailable for signed URL');
      return null;
    }
    const url = (window.PHUD && window.PHUD.SUPABASE_URL) || null;
    const key = (window.PHUD && window.PHUD.SUPABASE_KEY) || null;
    if (!url || !key) {
      console.warn('[Accord-minutes] PHUD.SUPABASE_URL/KEY missing');
      return null;
    }
    _signClient = window.supabase.createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // Inject current JWT so storage RLS sees the authenticated user
    try {
      const token = await Auth.getFreshToken().catch(() => Auth.getToken());
      if (token && _signClient.auth?.setSession) {
        await _signClient.auth.setSession({ access_token: token, refresh_token: token });
      } else if (token && _signClient.realtime?.setAuth) {
        _signClient.realtime.setAuth(token);
      }
    } catch (e) {
      console.warn('[Accord-minutes] auth injection failed (storage RLS may reject)', e);
    }
    return _signClient;
  }

  async function _signedUrlFor(renderRow) {
    if (!renderRow?.storage_path) return null;
    try {
      const sb = await _signClientGet();
      if (!sb) return null;
      // Refresh the JWT each call so the RLS check runs against current identity
      try {
        const token = await Auth.getFreshToken().catch(() => Auth.getToken());
        if (token && sb.auth?.setSession) {
          await sb.auth.setSession({ access_token: token, refresh_token: token });
        }
      } catch (_) { /* fall through */ }
      const filename = renderRow.storage_path.split('/').pop() || 'minutes';
      const { data, error } = await sb.storage
        .from('accord-minutes')
        .createSignedUrl(renderRow.storage_path, 3600, { download: filename });
      if (error) {
        console.warn('[Accord-minutes] signed URL error:', error.message);
        return null;
      }
      return data?.signedUrl || null;
    } catch (e) {
      console.warn('[Accord-minutes] signed URL failed', e);
      return null;
    }
  }

  // ── Print / Save as PDF (CMD-MINUTES-PRINT-FLOW) ─────────────
  // Mirrors Cadence's _s9ExportCertPdf() pattern (Iron Rule 64 —
  // codebase-as-spec). The Edge Function's render is the single
  // source of truth (Option A per brief §4.1): we fetch the same
  // signed-URL HTML the auditor downloads, write it into a new
  // window with an autoprint shim, and let the OS native print
  // dialog handle the Save-as-PDF.
  async function _printToPdf(renderRow) {
    if (!renderRow?.storage_path) {
      _toast('No render available to print.', null, true);
      return;
    }

    // 1. Resolve signed URL via the same helper the download button uses.
    const signedUrl = await _signedUrlFor(renderRow);
    if (!signedUrl) {
      _toast('Could not fetch render for printing.', null, true);
      return;
    }

    // 2. Fetch the rendered HTML.
    let html;
    try {
      const response = await fetch(signedUrl);
      if (!response.ok) {
        _toast('Could not fetch render for printing.', null, true);
        return;
      }
      html = await response.text();
    } catch (e) {
      console.warn('[Accord-minutes] print fetch failed', e);
      _toast('Could not fetch render for printing.', null, true);
      return;
    }

    // 3. Open the print window before any further awaits to avoid
    //    popup-blocker false positives.
    const printWindow = window.open('', '_blank', 'width=850,height=1100');
    if (!printWindow) {
      _toast('Print window blocked. Allow popups to print.', null, true);
      return;
    }

    // 4. Inject the rendered HTML with a tiny autoprint shim.
    const autoprint =
      '<script>window.addEventListener("load",function(){' +
      'setTimeout(function(){try{window.focus();window.print();}catch(e){}},250);' +
      '});<\/script>';
    let augmented;
    if (html.indexOf('</body>') !== -1) {
      augmented = html.replace('</body>', autoprint + '</body>');
    } else {
      augmented = html + autoprint;
    }
    printWindow.document.open();
    printWindow.document.write(augmented);
    printWindow.document.close();

    // 5. Audit-trail CoC write. Three-segment EVENT_META key
    //    parsed by post-CMD-A6c parser (Rule 56). Resolve
    //    actor_resource_id via window._myResource.
    try {
      let actorResourceId =
        (window._myResource && window._myResource.id) || null;
      if (!actorResourceId && window.CURRENT_USER?.id) {
        try {
          const rows = await API.get(
            `resources?user_id=eq.${window.CURRENT_USER.id}&select=id&limit=1`
          ).catch(() => []);
          actorResourceId = rows?.[0]?.id || null;
        } catch (_) { /* swallow */ }
      }
      if (!actorResourceId) {
        console.warn('[Accord-minutes] no actor_resource_id resolvable; skipping CoC write for print');
      } else {
        await window.CoC.write('accord.minutes.printed', renderRow.meeting_id, {
          entityType: 'accord_meeting',
          actorResourceId: actorResourceId,
          notes: `Minutes printed (${renderRow.template_id || DEFAULT_TEMPLATE}, render ${(renderRow.render_id || '').slice(0, 8)})`,
          meta: {
            render_id:      renderRow.render_id,
            template_id:    renderRow.template_id || DEFAULT_TEMPLATE,
            render_version: renderRow.render_version || null,
            content_hash:   renderRow.content_hash   || null,
          },
        });
      }
    } catch (err) {
      console.warn('[Accord-minutes] CoC write for print failed (non-blocking):', err);
    }
  }

  // ── Generate / Re-render flow ────────────────────────────────
  async function _generate(meetingId, isRerender) {
    if (!meetingId) return;
    local.inProgress.add(meetingId);
    _renderRail();
    _renderAggregate();
    _renderStatus();
    try {
      // Pass the active template_id; Edge Function defaults to
      // working-session if omitted (CMD-2 default; auto-render-on-END
      // and any other legacy caller continue under the renamed key).
      const result = await API.invokeEdgeFunction('render-minutes', {
        meeting_id:  meetingId,
        template_id: local.activeTemplate,
      });
      // Edge Function broadcasts via realtime; we also poll renders
      // (IR54: SELECT-after-mutation) to ensure UI catches up.
      await _pollUntilTerminal(meetingId, 30000); // 30s timeout
      const tplLabel = _templateLabel(local.activeTemplate);
      _toast(isRerender
        ? `${tplLabel} re-rendered${result?.used_fallback ? ' (HTML fallback)' : ''}.`
        : `${tplLabel} rendered${result?.used_fallback ? ' (HTML fallback)' : ''}.`,
        result?.download_url || null);
    } catch (e) {
      console.error('[Accord-minutes] generate failed', e);
      _toast('Render failed: ' + (e?.message || e), null, true);
    } finally {
      local.inProgress.delete(meetingId);
      await _loadRenders();
      _renderRail();
      _renderAggregate();
      _renderStatus();
      _renderHistory();
    }
  }

  // Poll until the latest render row reaches a terminal status or timeout.
  async function _pollUntilTerminal(meetingId, timeoutMs) {
    const start = Date.now();
    const interval = 2000;
    while (Date.now() - start < timeoutMs) {
      const rows = await API.get(
        `accord_minutes_renders?meeting_id=eq.${meetingId}` +
        `&select=*&order=rendered_at.desc&limit=1`
      ).catch(() => []);
      const r = rows?.[0];
      if (r && (r.status === 'success' || r.status === 'failed')) return r;
      await new Promise(res => setTimeout(res, interval));
    }
    return null;
  }

  function _openRerenderModal(meeting) {
    const tplLabel = _templateLabel(local.activeTemplate);
    $('rerenderModalSummary').textContent =
      `Re-render ${tplLabel} for "${meeting.title || 'Untitled'}"? The previous render is preserved in render history; the new render becomes the canonical one for this template.`;
    $('rerenderConfirmModal').classList.add('visible');
  }

  function _closeRerenderModal() {
    $('rerenderConfirmModal').classList.remove('visible');
  }

  // ── Toast (reuses pdfToast surface) ──────────────────────────
  function _toast(msg, downloadUrl, isError) {
    const t = $('pdfToast');
    if (!t) return;
    const m = t.querySelector('.toast-msg');
    if (m) m.innerHTML = `<strong>${esc(msg)}</strong>`;
    const dl = $('toastDownload');
    if (dl) {
      if (downloadUrl) {
        dl.href = downloadUrl;
        dl.style.display = '';
      } else {
        dl.removeAttribute('href');
        dl.style.display = 'none';
      }
    }
    t.classList.toggle('error', !!isError);
    t.classList.add('visible');
    setTimeout(() => t.classList.remove('visible'), isError ? 6000 : 5000);
  }

  // ── Wire UI (one-time) ───────────────────────────────────────
  function _wireUI() {
    $('minutesRail').addEventListener('click', (ev) => {
      const btn = ev.target.closest('.filter-chip');
      if (!btn) return;
      local.activeFilter = btn.dataset.filterValue;
      // Single-select: deactivate siblings
      btn.parentElement.querySelectorAll('.filter-chip').forEach(b => {
        b.classList.toggle('active', b === btn);
      });
      _renderRail();
    });
    $('minutesRefreshBtn').addEventListener('click', () => _refresh());
    $('minutesHistoryClose').addEventListener('click', () => {
      document.querySelector('#accord-app .minutes-body')?.classList.remove('history-open');
    });
    $('rerenderCancel').addEventListener('click', () => _closeRerenderModal());
    $('rerenderConfirm').addEventListener('click', async () => {
      _closeRerenderModal();
      if (local.activeMeeting) {
        await _generate(local.activeMeeting, true);
      }
    });

    // Listen for real-time minutes-render broadcasts to refresh state
    window.addEventListener('accord:minutes-rendered', () => _refresh());
    window.addEventListener('accord:minutes-render_failed', () => _refresh());
  }

  // Public surface
  window.AccordMinutes = {
    _state:         local,
    _renderRail:    _renderRail,
    _selectMeeting: _selectMeeting,
    _generate:      _generate,
    _refresh:       _refresh,
    _printToPdf:    _printToPdf,
    TEMPLATES:      TEMPLATES,
  };

  console.log('[Accord] minutes surface module loaded (CMD-PROJECTION-ENGINE-2)');
})();