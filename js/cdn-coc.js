// cdn-coc.js — Cadence: Chain of Custody panel, timeline, timestamp formatters
// fmtTs / fmtTsShort are shared formatters — import from here, don't duplicate
// LOAD ORDER: 9th

function toggleTmplCoC() {
  const panel  = document.getElementById('tmpl-coc-panel');
  const cocBtn = document.getElementById('coc-btn');
  if (!panel) return;
  const opening = !panel.classList.contains('open');
  panel.classList.toggle('open');
  if (cocBtn) {
    cocBtn.style.color       = opening ? 'var(--cad)'      : '';
    cocBtn.style.borderColor = opening ? 'var(--cad-wire)' : '';
    cocBtn.style.background  = opening ? 'var(--cad-dim)'  : '';
  }
  if (opening && _selectedTmpl) loadTmplCoC(_selectedTmpl.id);
}

async function loadTmplCoC(templateId) {
  const bodyEl = document.getElementById('tmpl-coc-body');
  if (!bodyEl) return;
  bodyEl.innerHTML = '<div style="font-size:11px;color:var(--muted);text-align:center;padding-top:24px">Loading…</div>';
  try {
    const rows = await API.get(
      `workflow_template_coc?template_id=eq.${templateId}&order=created_at.desc&limit=100`
    ).catch(() => []);
    _cocCommittedRows = rows || [];
    renderTmplCoC(_cocCommittedRows);
  } catch(e) {
    bodyEl.innerHTML = '<div style="font-size:11px;color:var(--red);padding:12px">Failed to load history.</div>';
  }
}

function renderTmplCoC(rows) {
  const bodyEl = document.getElementById('tmpl-coc-body');
  if (!bodyEl) return;

  const pending = _selectedTmpl ? _binLoad(_selectedTmpl.id) : [];

  if (!rows.length && !pending.length) {
    bodyEl.innerHTML = '<div style="font-size:11px;color:var(--muted);text-align:center;padding-top:24px">No history yet.</div>';
    return;
  }

  const evtColor = {
    released:       '#7af0a0',
    archived:       'var(--muted)',
    status_changed: 'var(--accent)',
    step_modified:  'var(--cad)',
    field_changed:  'var(--text2)',
    bist_override:  'var(--amber)',
    bist_run:            'var(--cad)',
    instance_completed:  'var(--green)',
    instance_suspended:  'var(--amber)',
  };
  const evtLabel = {
    released:            'Released',
    archived:            'Archived',
    status_changed:      'Status Changed',
    step_modified:       'Step Modified',
    field_changed:       'Step Modified',
    bist_override:       'Release Override',
    bist_run:            'Tests Run',
    instance_completed:  'Instance Completed',
    instance_suspended:  'Instance Suspended',
  };

  function fmtTs(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
      + ' · ' + d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  }

  // ── Pending (uncommitted) bin at top ────────────────────────────────────────
  let pendingHtml = '';
  if (pending.length) {
    // Build diff from snapshot against current state
    const liveDiffs = _diffSteps(_stepSnapshot, _selectedTmpl?.steps || []);
    // Merge with bin structural events not already in liveDiffs
    const binLines = pending
      .filter(e => ['step_added','step_deleted','step_reordered'].includes(e.type))
      .map(e =>
        e.type === 'step_added'     ? `Step added: "${e.stepName}"` :
        e.type === 'step_deleted'   ? `Step deleted: "${e.stepName}"` :
        `Step reordered: "${e.stepName}"`)
      .filter(l => !liveDiffs.includes(l));

    const allPending = [...liveDiffs, ...binLines];

    // Build bullet list with per-entry author + timestamp from bin where available
    function fmtTsShort(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      return d.toLocaleDateString('en-US', { month:'short', day:'numeric' })
        + ' · ' + d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
    }

    // Map diff strings back to bin entries for attribution
    const bulletHtml = allPending.length
      ? allPending.map(diffLine => {
          // Find the most recent bin entry that corresponds to this diff line
          const match = pending.slice().reverse().find(e => {
            if (e.type === 'step_added'     && diffLine.startsWith('Step added:'))     return true;
            if (e.type === 'step_deleted'   && diffLine.startsWith('Step deleted:'))   return true;
            if (e.type === 'step_reordered' && diffLine.startsWith('Step reordered:')) return true;
            if (e.type === 'field_changed'  && diffLine.includes(e.stepName || ''))    return true;
            return false;
          });
          const who = match?.changedBy || '';
          const when = match?.ts ? fmtTsShort(match.ts) : '';
          const meta = (who || when)
            ? `<span style="color:var(--muted);margin-left:8px">${escHtml(who)}${who&&when?' · ':''}${escHtml(when)}</span>`
            : '';
          return `<div style="font-size:10px;color:var(--text2);line-height:1.9;
            display:flex;align-items:baseline;gap:4px">
            <span>· ${escHtml(diffLine)}</span>${meta}
          </div>`;
        }).join('')
      : `<div style="font-size:10px;color:var(--muted)">Changes pending — no diff yet</div>`;

    const nextVer = (() => {
      let maj = _selectedTmpl?.version_major || 0;
      let min = _selectedTmpl?.version_minor || 0;
      let pat = _selectedTmpl?.version_patch || 0;
      if (_structuralChange) { min += 1; pat = 0; }
      else { pat += 1; }
      return `${maj}.${min}.${pat}`;
    })();

    pendingHtml = `
      <div style="border:1px solid rgba(212,144,31,.3);border-radius:5px;
        background:rgba(212,144,31,.05);padding:8px 10px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
          <div style="color:var(--amber);font-weight:700;font-size:10px;
            text-transform:uppercase;letter-spacing:.08em">Uncommitted</div>
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--amber)">
            → ${escHtml(nextVer)}*
          </div>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:5px">
          ${pending.length} pending change${pending.length !== 1 ? 's' : ''} — commit to lock version
        </div>
        ${bulletHtml}
      </div>
      <div style="border-top:1px solid var(--border);margin:0 0 10px"></div>`;
  }

  // ── Committed entries ────────────────────────────────────────────────────────
  const committedHtml = rows.map(e => {
    const color = evtColor[e.event_type] || 'var(--cad)';
    const label = evtLabel[e.event_type] || 'Step Modified';

    // Step name line (field_name stores the step name summary)
    const stepLine = e.field_name
      ? `<div style="font-size:11px;color:var(--text);margin-top:2px;font-weight:500">
           Step: ${escHtml(e.field_name)}
         </div>`
      : '';

    // Bullet diff lines
    const noteParts = (e.note || '').split('\n').filter(l => l.trim());
    const noteHtml = noteParts.map(l =>
      `<div style="font-size:10px;color:var(--text2);line-height:1.7">
         ${escHtml(l.startsWith('•') ? l : '· ' + l)}
       </div>`
    ).join('');

    return `
      <div class="tmpl-coc-event">
        <div class="tmpl-coc-dot" style="background:${color}"></div>
        <div class="tmpl-coc-body-text" style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <div style="color:${color};font-weight:700;font-size:10px;
              text-transform:uppercase;letter-spacing:.08em">${label}</div>
            ${e.version_at
              ? `<div style="font-family:var(--font-mono);font-size:10px;color:var(--muted)">
                   v${escHtml(e.version_at)}
                 </div>`
              : ''}
          </div>
          ${stepLine}
          ${noteHtml}
          <div class="tmpl-coc-who" style="margin-top:3px">
            ${escHtml(e.changed_by_name || 'System')} · ${fmtTs(e.created_at)}
          </div>
        </div>
      </div>`;
  }).join('');

  bodyEl.innerHTML = pendingHtml + committedHtml;
}