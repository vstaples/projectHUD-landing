// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
// MY WORK DIAGRAM ENGINE
// ══════════════════════════════════════════════════════════

// ── Deterministic project accent color from ID hash ────────
// ── Recommended daily sequence panel ─────────────────────
// Algorithm: (1) blocking others, (2) overdue, (3) critical path proxy (most dependents),
// (4) project health (SPI proxy via overdue ratio), (5) due date
// Shows 3-5 items. Immutable for the session once generated.
window._recSeqGenerated = false;


// ── Recommended Sequence tooltip ───────────────────────────────────
(function() {
  var _rTip = null;
  var _rTimer = null;

  var SCORE_FACTORS = [
    { key: 'blocking',    label: 'Blocking someone',     pts: 1000, color: '#E24B4A' },
    { key: 'unrated',     label: 'Unrated action item',  pts: 200,  color: 'var(--compass-amber)' },
    { key: 'overdue',     label: 'Overdue (+10/day)',    pts: 500,  color: '#E24B4A' },
    { key: 'due_soon',    label: 'Due within 2 days',    pts: 150,  color: 'var(--compass-amber)' },
    { key: 'blocked',     label: 'Blocked status',       pts: 400,  color: '#E24B4A' },
    { key: 'proj_risk',   label: 'Project at risk',      pts: 100,  color: 'var(--compass-amber)' },
    { key: 'due_today',   label: 'Due today',            pts: 300,  color: 'var(--compass-amber)' },
    { key: 'in_progress', label: 'Already in progress',  pts: 50,   color: 'var(--compass-cyan)' },
  ]; // grid reads L-R: col1=1000,500,400,300 | col2=200,150,100,50

  window.showRecSeqTooltip = function(e) {
    if (!e.ctrlKey) return;  // Ctrl required
    clearTimeout(_rTimer);
    if (_rTip) return;
    var eTarget = e.currentTarget;

    // Build on demand if not yet generated
    if (!window._recSeqItems && window._wiItems && window._wiItems.length) {
      buildRecommendedSequence(window._wiItems);
    }
    var items = window._recSeqItems;
    if (!items || !items.length) return;

    var esc = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };

    // Build factor-matching: map each item's _reasons back to known factors
    var factorColor = function(reason) {
      if (reason.includes('Blocking'))         return '#E24B4A';
      if (/^\d+d overdue$/.test(reason.trim())) return '#E24B4A';
      if (reason.includes('Blocked'))          return '#E24B4A';
      if (reason.includes('Due today'))        return 'var(--compass-amber)';
      if (reason.includes('Due in'))           return 'var(--compass-amber)';
      if (reason.includes('Unrated'))          return 'var(--compass-amber)';
      if (reason.includes('Project at risk'))  return 'var(--compass-amber)';
      return 'var(--compass-cyan)';
    };

    // Rows: rank | title | project | score | factors
    var maxScore = items[0]._score || 1;
    var rows = items.map(function(w, i) {
      var rankColor = i === 0 ? 'var(--compass-cyan)' : i === 1 ? 'rgba(0,210,255,.7)' : i === 2 ? 'rgba(0,210,255,.5)' : 'var(--text3)';
      var barW = Math.round((w._score / maxScore) * 100);
      // Build score breakdown: e.g. '500 + (5×10) + 200 = 750'
      var scoreBreakdown = (function() {
        var parts = [];
        var today2 = new Date().toLocaleDateString('en-CA');
        (w._reasons || []).forEach(function(r) {
          if (/^\d+d overdue$/.test(r.trim())) {
            var d = parseInt(r);
            parts.push(isNaN(d) ? '500' : '500+(' + d + '×10)');
          } else if (r.includes('Blocking'))         { parts.push('1000'); }
          else if (r.includes('Blocked'))            { parts.push('400'); }
          else if (r.includes('Due today'))          { parts.push('300'); }
          else if (r.includes('Unrated'))            { parts.push('200'); }
          else if (r.includes('Due in'))             { parts.push('150'); }
          else if (r.includes('Project at risk'))    { parts.push('100'); }
          else if (r.includes('In progress'))        { parts.push('50'); }
        });
        return parts.length ? parts.join(' + ') + ' = ' + w._score : w._score + '';
      })();
      var factors = (w._reasons || []).map(function(r) {
        var c = factorColor(r);
        return '<span style="font-size:13px;padding:1px 6px;border-radius:2px;background:' + c + '18;color:' + c + ';border:1px solid ' + c + '40;white-space:nowrap">' + esc(r) + '</span>';
      }).join(' ');
      return '<tr style="border-bottom:1px solid rgba(255,255,255,.05)">' +
        '<td style="padding:3px 8px 3px 0;text-align:center;vertical-align:top">' +
          '<span style="font-family:inherit;font-size:13px;font-weight:700;color:' + rankColor + '">' + (i+1) + '</span>' +
        '</td>' +
        '<td style="padding:3px 10px 3px 0;vertical-align:top;min-width:200px">' +
          '<div style="color:var(--text0);font-size:13px;font-weight:500">' + esc(w.title) + '</div>' +
          '<div style="color:var(--text3);font-size:13px;margin-top:1px">' + esc(w.project || '—') + ' · ' + esc(w.type || 'task') + '</div>' +
        '</td>' +
        '<td style="padding:3px 10px 3px 0;vertical-align:top;white-space:nowrap">' +
          '<div style="display:flex;gap:4px;flex-wrap:wrap;max-width:280px">' + (factors || '<span style="color:var(--text3);font-size:13px">no factors</span>') + '</div>' +
        '</td>' +
        '<td style="padding:3px 0;vertical-align:top;text-align:right;white-space:nowrap">' +
          '<div style="font-family:inherit;font-size:13px;font-weight:700;color:#00D2FF">' + scoreBreakdown + ' pts</div>' +
          '<div style="width:60px;height:3px;background:rgba(255,255,255,.08);border-radius:2px;margin-top:4px;margin-left:auto">' +
            '<div style="height:3px;background:var(--compass-cyan);width:' + barW + '%;border-radius:2px"></div>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');

    // Factor legend
    var legend = '<div style="margin-top:4px;padding-top:6px">' +
      '<div style="font-family:inherit;font-size:13px;font-weight:400;color:var(--text0,#F0F6FF);margin-bottom:8px">Scoring Factors</div>' +
      '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:5px 24px">' +
      SCORE_FACTORS.map(function(f) {
        return '<div style="font-family:inherit;font-size:13px;font-weight:400;color:var(--text0,#F0F6FF);white-space:nowrap;display:flex;gap:10px;align-items:center">' +
          '<span style="color:' + f.color + ';font-weight:700;min-width:42px;text-align:right">+' + f.pts + '</span>' +
          '<span style="color:var(--text0,#F0F6FF)">' + f.label + '</span></div>';
      }).join('') +
      '</div></div>';

    // Tooltip shows Scoring Factors only — table is now in the pane itself

        _rTip = document.createElement('div');
    _rTip.id = 'mw-recseq-tip';
    _rTip.style.cssText = [
      'position:fixed', 'z-index:9999', 'background:#0a1628',
      'border:1px solid rgba(0,210,255,.25)', 'border-left:3px solid var(--compass-cyan)',
      'border-radius:3px', 'padding:10px 14px',
      'font-family:inherit;', 'font-size:13px', 'font-weight:400',
      'color:var(--text0,#F0F6FF)', 'max-width:900px', 'min-width:680px',
      'box-shadow:0 12px 40px rgba(0,0,0,.8)', 'pointer-events:auto', 'line-height:1.3'
    ].join(';');

    _rTip.innerHTML =
      '<div style="font-size:13px;font-weight:700;letter-spacing:.08em;' +
      'text-transform:uppercase;color:#00D2FF;margin-bottom:10px;' +
      'border-bottom:1px solid rgba(0,210,255,.15);padding-bottom:6px">Scoring Factors</div>' +
      legend;
    // Smart position: prefer above the pane, fall back to below, never clip
    var r = eTarget.getBoundingClientRect();
    var tipW = 860;
    var left = r.left;
    if (left + tipW > window.innerWidth - 10) left = window.innerWidth - tipW - 10;
    if (left < 8) left = 8;
    _rTip.style.left = left + 'px';
    document.body.appendChild(_rTip);
    // Anchor bottom of tooltip to top of pane — content sizes itself naturally
    _rTip.style.bottom = (window.innerHeight - r.top + 6) + 'px';
    _rTip.style.top = 'auto';
    // Keep alive when mouse enters tip
    _rTip.addEventListener('mouseenter', function() { clearTimeout(_rTimer); });
    _rTip.addEventListener('mouseleave', function() { window.hideRecSeqTooltip(); });
  };

  window.hideRecSeqTooltip = function() {
    _rTimer = setTimeout(function() {
      if (_rTip) { _rTip.remove(); _rTip = null; }
    }, 200);
  };
})();

function buildRecommendedSequence(workItems) {
  const el = document.getElementById('mw-rec-seq');
  if (!el) return;
  if (!workItems || !workItems.length) { el.style.display = 'none'; return; }

  // Only regenerate once per session (immutable for the day)
  if (window._recSeqGenerated && window._recSeqItems) {
    renderRecSeq(window._recSeqItems);
    return;
  }

  const today = new Date().toLocaleDateString('en-CA');
  const open  = workItems.filter(w => w.status !== 'complete' && w.status !== 'resolved' && w.status !== 'done');
  if (!open.length) { el.style.display = 'none'; return; }

  // Score each item
  const scored = open.map(w => {
    let score = 0;
    const reasons = [];

    // 1. Blocking other people — action items assigned by someone else (you are the bottleneck)
    const isActionByOther = w.type === 'action' && w.createdBy && w.createdBy !== (_myResource?.name || '');
    if (isActionByOther) { score += 1000; reasons.push('Blocking ' + esc(w.createdBy)); }

    // 1b. Review/Approve requests always urgent — even if self-assigned as reviewer
    const isReviewItem = w.type === 'action' && (
      (w.title||'').startsWith('Review request:') || (w.title||'').startsWith('Approve request:')
    );
    if (isReviewItem && !isActionByOther) {
      score += 800;
      reasons.push('Pending review decision');
    }

    if (w.overdue) {
      const daysLate = w.due ? Math.floor((Date.now() - new Date(w.due+'T00:00:00').getTime()) / 86400000) : 1;
      score += 500 + daysLate * 10;
      reasons.push(daysLate + 'd overdue');
    }

    // 3. Due today
    if (w.due === today && !w.overdue) { score += 300; reasons.push('Due today'); }

    // 4. Blocked status — needs attention to unblock others
    if (w.status === 'blocked') { score += 400; reasons.push('Blocked — needs action'); }

    // 5. Unrated action item — needs rating before capacity can be assessed
    if (w.type === 'action') {
      const neg = negGetState(w.id);
      if (!neg || neg.state === 'unrated') { score += 200; reasons.push('Unrated — capacity unknown'); }
    }

    // 6. Project health proxy — if project has multiple overdue items, this project is at risk
    const projOverdue = open.filter(x => x.projectId && x.projectId === w.projectId && x.overdue).length;
    if (projOverdue >= 2) { score += 100; reasons.push('Project at risk'); }

    // 7. Due soon (within 2 days)
    if (w.due && !w.overdue && w.due !== today) {
      const daysOut = Math.floor((new Date(w.due+'T00:00:00').getTime() - Date.now()) / 86400000);
      if (daysOut <= 2) { score += 150 - daysOut * 30; reasons.push('Due in ' + daysOut + 'd'); }
    }

    // 8. In progress — finish what you started
    if (w.status === 'in_progress') { score += 50; reasons.push('In progress'); }

    return { ...w, _score: score, _reasons: reasons };
  });

  // Sort descending by score, take top 5
  scored.sort((a, b) => b._score - a._score);
  const top = scored.filter(w => w._score > 0).slice(0, 5);

  if (!top.length) { el.style.display = 'none'; return; }

  window._recSeqItems = top;
  window._recSeqGenerated = true;
  renderRecSeq(top);
}

function renderRecSeq(items) {
  const el = document.getElementById('mw-rec-seq');
  if (!el) return;
  const today = new Date().toLocaleDateString('en-CA');

  // Column header row
  const hdr = `<div style="display:grid;grid-template-columns:24px 1fr 280px 200px;gap:0;padding:5px 12px 5px 12px;border-bottom:1px solid rgba(0,210,255,.12)">
    <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6A94B8">#</div>
    <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6A94B8">Item</div>
    <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6A94B8">Decision Factors</div>
    <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6A94B8;text-align:right">Score</div>
  </div>`;

  const rows = items.map((w, i) => {
    const rankColor = i === 0 ? '#00D2FF' : i === 1 ? 'rgba(0,210,255,.7)' : 'rgba(0,210,255,.45)';
    const typeLabel = (w.type === 'action' ? 'Action item' : 'Task');
    const subLabel  = [w.project, typeLabel].filter(Boolean).join(' · ');

    // Factor badges — full set, colour-coded
    const factorColor = r => {
      if (r.includes('Blocking'))        return '#E24B4A';
      if (/^\d+d overdue$/.test(r.trim())) return '#E24B4A';
      if (r.includes('Blocked'))         return '#E24B4A';
      if (r.includes('Due today'))       return '#EF9F27';
      if (r.includes('Due in'))          return '#EF9F27';
      if (r.includes('Unrated'))         return '#EF9F27';
      if (r.includes('Project at risk')) return '#EF9F27';
      return '#00D2FF';
    };
    const factorHtml = (w._reasons || []).map(r => {
      const c = factorColor(r);
      return `<span style="font-size:11px;padding:1px 6px;border-radius:2px;background:${c}18;color:${c};border:1px solid ${c}40;white-space:nowrap">${esc(r)}</span>`;
    }).join(' ');

    // Score breakdown
    const scoreBreakdown = (() => {
      const parts = [];
      (w._reasons || []).forEach(r => {
        if (/^\d+d overdue$/.test(r.trim())) { const d=parseInt(r); parts.push(isNaN(d)?'500':'500+('+ d +'×10)'); }
        else if (r.includes('Blocking'))        parts.push('1000');
        else if (r.includes('Blocked'))         parts.push('400');
        else if (r.includes('Due today'))        parts.push('300');
        else if (r.includes('Unrated'))          parts.push('200');
        else if (r.includes('Due in'))           parts.push('150');
        else if (r.includes('Project at risk'))  parts.push('100');
        else if (r.includes('In progress'))      parts.push('50');
      });
      return parts.length ? parts.join(' + ') + ' = ' + w._score : String(w._score);
    })();

    return `<div style="display:grid;grid-template-columns:24px 1fr 280px 200px;gap:0;padding:6px 12px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;align-items:start"
      data-wi-id="${w.id}" data-wi-type="${w.type}" data-action="diag-open-task"
      onmouseenter="this.style.background='rgba(0,210,255,.03)'" onmouseleave="this.style.background=''">
      <div style="font-size:15px;font-weight:700;color:${rankColor};padding-top:1px">${i+1}</div>
      <div style="min-width:0;padding-right:8px">
        <div style="font-size:12px;font-weight:600;color:#F0F6FF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(w.title)}</div>
        <div style="font-size:11px;color:#6A94B8;margin-top:2px">${esc(subLabel)}</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:3px;align-items:flex-start">${factorHtml}</div>
      <div style="text-align:right;font-size:12px;font-weight:700;color:#00D2FF;white-space:nowrap">${scoreBreakdown} pts</div>
    </div>`;
  }).join('');

  el.style.display = 'block';
  el.innerHTML = `
    <div style="background:var(--bg1);border:1px solid rgba(0,210,255,.15);border-left:3px solid #00D2FF" onmouseenter="showRecSeqTooltip(event)" onmouseleave="if(!this.contains(event.relatedTarget))hideRecSeqTooltip()">
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(0,210,255,.1)">
        <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#00D2FF;cursor:help" id="mw-recseq-hdr">Recommended sequence for today</div>
        <div style="font-size:11px;color:rgba(255,255,255,.25);margin-left:auto">System-generated · ${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
        <button onclick="document.getElementById('mw-rec-seq').style.display='none'" style="background:none;border:none;color:rgba(255,255,255,.25);cursor:pointer;font-size:14px;padding:0 0 0 6px;line-height:1" title="Dismiss">×</button>
      </div>
      ${hdr}
      ${rows}
    </div>`;
}