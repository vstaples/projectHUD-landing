# Commission · C-13 · CMD-ACCORD-SETUP-VERDICT-1

**Phase:** 3 of Wave 3 — Footer zone: verdict pill + budget bar + Begin Meeting wiring
**Authored:** 2026-05-11
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Accord Meeting Setup Shell — Requirements Specification v1.1 §11
**Predecessor:** C-12 · CMD-ACCORD-SETUP-GATHERING-1 sealed
**Successor:** Wave 3 closes. Setup Shell build complete.
**Coding agent:** execute sequentially; halt-and-surface after §10

---

## §1 — Scope

Wire the footer zone. Three deliverables plus one carry-forward from C-12.

**Deliverables:**
1. **Verdict pill (left)** — GO / GO WITH CAVEATS / NOT READY, substrate-derived, with hover popover readiness breakdown
2. **Budget bar (center)** — time budget consumption bar with warning pills
3. **Begin Meeting button (right)** — wires `Accord.startMeeting()`, transitions to running shell
4. **Countdown timer (F-C12-1 carry-forward)** — persistent countdown top-center during the 5-min gathering window, replacing the auto-dismissing banner

**What does NOT ship:**
- `Save & invite` button full implementation (CMD-ACCORD-MEETING-INVITATIONS-1 scope) — renders as disabled with tooltip "Invitations — coming soon"
- Warning pills derived from real-time attendance patterns (AI) — v1 warning pills are substrate-derived only (overdue actions, days-off-substrate from C-08 intel derivation)
- Verdict state persistence to substrate — verdict is derived on every render, never stored
- CPM critical-path action overdue check in verdict — Track F prerequisite; v1 verdict uses simple `due_date < now()` on all action nodes in workstream

---

## §2 — IR64 verification (before writing any code)

**V1 — Footer zone current state:**
```javascript
JSON.stringify({
  footer:    document.querySelector('.ac-setup-footer')?.innerHTML?.slice(0, 200),
  beginBtn:  !!document.querySelector('[data-action="begin-meeting"]'),
  saveBtn:   !!document.querySelector('[data-action="save-invite"]')
});
```
Confirm footer exists (from C-01 layout). Confirm whether Begin Meeting and Save & invite buttons are already stubbed or absent.

**V2 — `Accord.startMeeting` exists:**
```javascript
typeof window.Accord?.startMeeting;
```
Expected: `'function'`. If absent, halt — Begin Meeting cannot be wired without the core function.

**V3 — Agenda items with duration estimates:**
```javascript
API.get('accord_agenda_items?meeting_id=eq.' + window.Accord.state.meeting.meeting_id +
        '&select=duration_minutes_estimate&order=position.asc')
  .then(function(rows) {
    console.log('items with estimates:', (rows||[]).filter(function(r){
      return r.duration_minutes_estimate;
    }).length, 'of', (rows||[]).length);
  });
```
Need at least one item with a `duration_minutes_estimate` to verify budget bar render. If none, the bar will show the empty state — document and proceed.

**V4 — `_intelData` accessibility:**
```javascript
// Intel data is module-level in accord-meeting-setup.js
// Verdict + warning pills derive from same attendee intel as C-08
// Confirm _intelData is populated after Intelligence Mode has run once:
typeof _intelData;  // expected: 'object' (will fail if not in scope — run from module context)
```
If `_intelData` is not accessible from the footer render path, verdict derivation must re-fetch independently. Document in close-out.

Report V1–V4 in close-out.

---

## §3 — No substrate changes

Footer is entirely derived from existing substrate data. No migrations. No `pg_notify`.

---

## §4 — Verdict derivation

### §4.1 — Verdict shape

```javascript
// VerdictResult = {
//   state:   'go' | 'caveats' | 'not-ready',
//   label:   'GO' | 'GO WITH CAVEATS' | 'NOT READY',
//   color:   'green' | 'amber' | 'rose',
//   checks:  [{ label: string, passed: boolean, blocking: boolean }]
// }
```

### §4.2 — Derivation function

```javascript
var _verdictToken = 0;

function _deriveVerdict(meeting, workstreamId, callback) {
  var myToken = ++_verdictToken;

  Promise.all([
    // Outcomes
    API.get('accord_meeting_outcomes?meeting_id=eq.' + meeting.meeting_id +
            '&select=outcome_id,verb,owner_resource_id,status'),
    // Attendees
    API.get('accord_meeting_attendees?meeting_id=eq.' + meeting.meeting_id +
            '&select=attendee_id,resource_id,role_in_meeting,rsvp_status'),
    // Overdue actions in workstream
    workstreamId ? API.get(
      'accord_meetings?workstream_id=eq.' + workstreamId +
      '&state=in.(closed,sealed,running,idle)&select=meeting_id&limit=50'
    ).then(function(mtgs) {
      if (!mtgs || !mtgs.length) return [];
      var ids = mtgs.map(function(m) { return m.meeting_id; }).join(',');
      return API.get(
        'accord_nodes?meeting_id=in.(' + ids + ')&tag=eq.action' +
        '&select=node_id,due_date,sealed_at' +
        '&order=due_date.asc'
      ).then(function(nodes) { return nodes || []; });
    }) : Promise.resolve([])
  ]).then(function(results) {
    if (_verdictToken !== myToken) return;

    var outcomes  = results[0] || [];
    var attendees = results[1] || [];
    var actions   = results[2] || [];

    var now = Date.now();
    var overdueActions = actions.filter(function(a) {
      return !a.sealed_at && a.due_date &&
             new Date(a.due_date + 'T00:00:00').getTime() < now;
    });

    // Build checklist
    var checks = [];

    // Blocking checks (NOT READY if any fail)
    var hasOutcomes = outcomes.length > 0;
    checks.push({
      label:    'Outcomes defined',
      passed:   hasOutcomes,
      blocking: true
    });

    var declined = attendees.filter(function(a) {
      return a.rsvp_status === 'declined' &&
             (a.role_in_meeting === 'lead' || a.role_in_meeting === 'organizer');
    });
    checks.push({
      label:    'No required attendee declined',
      passed:   declined.length === 0,
      blocking: true
    });

    // Advisory checks (CAVEATS if any fail)
    var allOutcomesOwned = outcomes.every(function(o) { return o.owner_resource_id; });
    checks.push({
      label:    'All outcomes have owners',
      passed:   allOutcomesOwned,
      blocking: false
    });

    var hasDuration = !!meeting.duration_minutes;
    checks.push({
      label:    'Duration set',
      passed:   hasDuration,
      blocking: false
    });

    var pendingInvites = attendees.filter(function(a) {
      return a.rsvp_status === 'pending';
    });
    checks.push({
      label:    pendingInvites.length + ' attendee' +
                (pendingInvites.length !== 1 ? 's' : '') + ' pending RSVP',
      passed:   pendingInvites.length === 0,
      blocking: false
    });

    checks.push({
      label:    overdueActions.length + ' overdue action' +
                (overdueActions.length !== 1 ? 's' : '') + ' in workstream',
      passed:   overdueActions.length === 0,
      blocking: false
    });

    // Derive state
    var blockingFail  = checks.some(function(c) { return c.blocking && !c.passed; });
    var advisoryFail  = checks.some(function(c) { return !c.blocking && !c.passed; });

    var state, label, color;
    if (blockingFail) {
      state = 'not-ready'; label = 'NOT READY'; color = 'rose';
    } else if (advisoryFail) {
      state = 'caveats'; label = 'GO WITH CAVEATS'; color = 'amber';
    } else {
      state = 'go'; label = 'GO'; color = 'green';
    }

    callback({ state: state, label: label, color: color, checks: checks });
  }).catch(function(e) {
    console.error('[AccordMeetingSetup] verdict derivation failed', e);
    callback(null);
  });
}
```

---

## §5 — Budget bar derivation

```javascript
function _deriveBudget(meeting, meetingId, callback) {
  API.get(
    'accord_agenda_items?meeting_id=eq.' + meetingId +
    '&select=duration_minutes_estimate&order=position.asc'
  ).then(function(items) {
    items = items || [];
    var used  = items.reduce(function(s, i) {
      return s + (i.duration_minutes_estimate || 0);
    }, 0);
    var total = meeting.duration_minutes || 0;
    var slack = total - used;
    callback({ used: used, total: total, slack: slack });
  }).catch(function() { callback({ used: 0, total: 0, slack: 0 }); });
}
```

---

## §6 — Warning pills derivation

Warning pills are substrate-derived. Use `_intelData` if available (populated by C-08 `_deriveIntelData`). If not available, derive inline.

```javascript
function _deriveWarningPills(meeting, workstreamId, intelData) {
  var pills = [];

  if (!intelData || !intelData.attendees) return pills;

  intelData.attendees.forEach(function(a) {
    // Unconnected conn-dot + late pattern
    if (a.status_tag === 'QUIET · RE-ONBOARD') {
      pills.push({ text: esc(a.name) + ' off-substrate ' +
                   (a.days_off_substrate ? a.days_off_substrate + 'd' : ''), severity: 'mid' });
    }
    // Overdue pressure
    if (a.status_tag === 'OVERDUE · PRESSURE') {
      pills.push({ text: esc(a.name) + ' · ' + a.overdue_actions + ' overdue', severity: 'high' });
    }
  });

  return pills.slice(0, 2);  // max 2 warning pills
}
```

---

## §7 — Footer render

### §7.1 — Entry point

Called from `render()` after shell paint. Also re-called after any panel change that could affect verdict (outcomes add/remove, attendee add/remove).

```javascript
function _renderFooter(meeting, workstreamId) {
  var footer = document.querySelector('.ac-setup-footer');
  if (!footer) return;

  // Show loading state immediately
  footer.innerHTML = _footerLoadingHtml();

  Promise.all([
    new Promise(function(resolve) {
      _deriveVerdict(meeting, workstreamId, resolve);
    }),
    new Promise(function(resolve) {
      _deriveBudget(meeting, meeting.meeting_id, resolve);
    })
  ]).then(function(results) {
    if (!footer.isConnected) return;
    var verdict = results[0];
    var budget  = results[1];
    var warningPills = _deriveWarningPills(meeting, workstreamId, _intelData);
    footer.innerHTML = _footerHtml(meeting, verdict, budget, warningPills);
    _wireFooterEvents(footer, meeting, verdict);
  });
}

function _footerLoadingHtml() {
  return '<div class="ac-footer-loading">Evaluating readiness…</div>';
}
```

### §7.2 — Footer HTML

```javascript
function _footerHtml(meeting, verdict, budget, warningPills) {
  var html = '';

  // ── Verdict pill (left) ──────────────────────────────
  if (verdict) {
    var vcls = 'ac-verdict-pill ac-verdict-pill--' + verdict.color;
    html += '<div class="ac-footer-left">';
    html += '<button class="' + vcls + '" data-action="verdict-popover">';
    html += esc(verdict.label);
    html += '</button>';
    html += '</div>';
  } else {
    html += '<div class="ac-footer-left"></div>';
  }

  // ── Budget bar (center) ──────────────────────────────
  html += '<div class="ac-footer-center">';
  if (budget.total > 0) {
    var pct   = Math.min(100, Math.round((budget.used / budget.total) * 100));
    var barCls = pct >= 100 ? 'ac-budget-bar--over'
               : pct >= 80  ? 'ac-budget-bar--warn'
               : 'ac-budget-bar--ok';

    html += '<span class="ac-budget-label">TIME BUDGET</span>';
    html += '<div class="ac-budget-track">';
    html += '<div class="ac-budget-fill ' + barCls + '" style="width:' + pct + '%"></div>';
    html += '</div>';
    html += '<span class="ac-budget-stats">';
    if (budget.used) html += budget.used + 'm used';
    if (budget.slack > 0) html += ' · ' + budget.slack + 'm slack';
    if (budget.slack < 0) html += ' · ' + Math.abs(budget.slack) + 'm over';
    html += '</span>';

    // Warning pills
    warningPills.forEach(function(p) {
      html += '<span class="ac-budget-warning ac-budget-warning--' +
              p.severity + '">' + p.text + '</span>';
    });
  } else {
    // No duration set — show empty budget state
    html += '<span class="ac-budget-label">TIME BUDGET</span>';
    html += '<span class="ac-budget-empty ac-muted">Set duration in header to track time</span>';
  }
  html += '</div>';

  // ── Action buttons (right) ───────────────────────────
  html += '<div class="ac-footer-right">';
  html += '<button class="ac-btn-secondary" data-action="save-invite" disabled ' +
          'title="Invitations — coming soon">Save &amp; invite</button>';
  html += '<button class="ac-btn-primary" data-action="begin-meeting">Begin Meeting →</button>';
  html += '</div>';

  return html;
}
```

### §7.3 — Footer event wiring

```javascript
function _wireFooterEvents(footer, meeting, verdict) {
  footer.addEventListener('click', function(ev) {
    var action = ev.target.dataset.action ||
                 ev.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'verdict-popover') {
      var btn = ev.target.closest('[data-action="verdict-popover"]');
      if (!btn) return;
      _toggleVerdictPopover(btn, verdict);
      return;
    }

    if (action === 'begin-meeting') {
      _onBeginMeeting(meeting);
      return;
    }
  });
}
```

---

## §8 — Verdict popover

```javascript
var _verdictPopoverOpen = false;

function _toggleVerdictPopover(anchor, verdict) {
  var existing = document.getElementById('ac-verdict-popover');
  if (existing) {
    existing.remove();
    _verdictPopoverOpen = false;
    return;
  }

  if (!verdict) return;
  _verdictPopoverOpen = true;

  var popover = document.createElement('div');
  popover.id = 'ac-verdict-popover';
  popover.className = 'ac-verdict-popover';

  var checksHtml = verdict.checks.map(function(c) {
    var icon = c.passed ? '✓' : (c.blocking ? '✗' : '△');
    var cls  = c.passed ? 'ac-check--pass' : (c.blocking ? 'ac-check--fail' : 'ac-check--warn');
    return '<div class="ac-check-row ' + cls + '">' +
           '<span class="ac-check-icon">' + icon + '</span>' +
           '<span class="ac-check-label">' + esc(c.label) + '</span>' +
           '</div>';
  }).join('');

  popover.innerHTML = '<div class="ac-popover-title">Readiness</div>' + checksHtml;

  // Position above the pill
  document.body.appendChild(popover);
  var rect = anchor.getBoundingClientRect();
  popover.style.left = rect.left + 'px';
  popover.style.bottom = (window.innerHeight - rect.top + 8) + 'px';

  // Click outside to close
  setTimeout(function() {
    document.addEventListener('click', function _closePopover(ev) {
      if (!popover.contains(ev.target) && ev.target !== anchor) {
        popover.remove();
        _verdictPopoverOpen = false;
        document.removeEventListener('click', _closePopover);
      }
    });
  }, 0);
}
```

---

## §9 — Begin Meeting

```javascript
function _onBeginMeeting(meeting) {
  var btn = document.querySelector('[data-action="begin-meeting"]');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Starting…';
  }

  if (typeof window.Accord.startMeeting !== 'function') {
    console.error('[AccordMeetingSetup] Accord.startMeeting not available');
    if (btn) { btn.disabled = false; btn.textContent = 'Begin Meeting →'; }
    return;
  }

  window.Accord.startMeeting(meeting.meeting_id)
    .catch(function(e) {
      console.error('[AccordMeetingSetup] startMeeting failed', e);
      if (btn && btn.isConnected) {
        btn.disabled = false;
        btn.textContent = 'Begin Meeting →';
      }
    });
  // Success: accord-core transitions surface to running shell; teardown fires automatically
}
```

---

## §10 — Countdown timer (F-C12-1 carry-forward)

Replaces the auto-dismissing 8s banner from C-12. Persistent countdown in top-center during the full 5-min gathering window.

### §10.1 — Timer mount/update

```javascript
var _countdownInterval = null;

function _startCountdown(scheduledFor) {
  _stopCountdown();

  var target = new Date(scheduledFor).getTime();

  function _tick() {
    var remaining = Math.max(0, target - Date.now());
    var mins = Math.floor(remaining / 60000);
    var secs = Math.floor((remaining % 60000) / 1000);
    var display = mins + ':' + (secs < 10 ? '0' : '') + secs;

    var el = document.getElementById('ac-countdown-timer');
    if (!el) {
      _stopCountdown();
      return;
    }
    el.textContent = display;
    if (remaining === 0) _stopCountdown();
  }

  // Mount the timer element in the setup shell header area
  var shell = document.querySelector('.ac-setup-shell');
  if (!shell) return;

  var existing = document.getElementById('ac-countdown-timer');
  if (!existing) {
    var timer = document.createElement('div');
    timer.id = 'ac-countdown-timer';
    timer.className = 'ac-countdown-timer';
    shell.appendChild(timer);
  }

  _tick();  // immediate first tick
  _countdownInterval = setInterval(_tick, 1000);
}

function _stopCountdown() {
  if (_countdownInterval) {
    clearInterval(_countdownInterval);
    _countdownInterval = null;
  }
  var el = document.getElementById('ac-countdown-timer');
  if (el) el.remove();
}
```

### §10.2 — Integration with `_enterGatheringMode` / `_showFiveMinWarning`

In C-12's `_enterGatheringMode`, add:
```javascript
// Start countdown when gathering mode engages AND within 5-min window
// _checkGatheringCondition already tracks minutesUntil
if (minutesUntil <= 5 && meeting.scheduled_for) {
  _startCountdown(meeting.scheduled_for);
}
```

In C-12's `_exitGatheringMode`, add:
```javascript
_stopCountdown();
```

Replace C-12's `_showFiveMinWarning` call in `_checkGatheringCondition` with:
```javascript
if (minutesUntil <= 5 && minutesUntil > 0 && !_fiveMinWarned) {
  _fiveMinWarned = true;
  _startCountdown(meeting.scheduled_for);  // persistent timer replaces banner
}
```

Also add `_stopCountdown()` to `teardown()`.

---

## §11 — Re-render triggers

Footer re-renders when any of the following change:
- An outcome is added or removed (call `_renderFooter` at end of `_addOutcome` / `_deleteOutcome`)
- An attendee is added or removed (call `_renderFooter` at end of `_addAttendee` / `_removeAttendee`)
- Duration field is updated (debounced — call `_renderFooter` 1200ms after `accord_meetings.duration_minutes` PATCH resolves)

---

## §12 — Teardown additions

```javascript
// In teardown():
_stopCountdown();
_verdictToken = 0;   // auto-invalidates in-flight derives
_verdictPopoverOpen = false;
var popover = document.getElementById('ac-verdict-popover');
if (popover) popover.remove();
```

---

## §13 — CSS additions

```css
/* ── Footer layout ──────────────────────────────────── */
.ac-setup-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 52px;
  border-top: 1px solid var(--ac-border-subtle);
  background: var(--ac-bg-deep);
  flex-shrink: 0;
  gap: 16px;
}
.ac-footer-left  { flex: 0 0 auto; }
.ac-footer-center {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.ac-footer-right  { flex: 0 0 auto; display: flex; gap: 8px; align-items: center; }
.ac-footer-loading {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-faint);
  letter-spacing: 0.8px;
  width: 100%;
  text-align: center;
}

/* ── Verdict pill ───────────────────────────────────── */
.ac-verdict-pill {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.2px;
  padding: 5px 14px;
  border-radius: 20px;
  border: none;
  cursor: pointer;
  white-space: nowrap;
}
.ac-verdict-pill--green {
  background: var(--ac-green-dim);
  color: var(--ac-green);
  border: 1px solid rgba(74,222,128,0.3);
}
.ac-verdict-pill--amber {
  background: var(--ac-amber-dim);
  color: var(--ac-amber);
  border: 1px solid rgba(251,191,119,0.3);
}
.ac-verdict-pill--rose {
  background: var(--ac-rose-dim);
  color: var(--ac-rose);
  border: 1px solid rgba(251,113,133,0.3);
}

/* ── Verdict popover ────────────────────────────────── */
.ac-verdict-popover {
  position: fixed;
  z-index: 9500;
  background: var(--ac-bg-deep);
  border: 1px solid var(--ac-border-mid);
  border-radius: 6px;
  padding: 12px 14px;
  min-width: 240px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
}
.ac-popover-title {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-tertiary);
  letter-spacing: 1.2px;
  text-transform: uppercase;
  margin-bottom: 10px;
}
.ac-check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}
.ac-check-icon { font-size: 11px; flex-shrink: 0; width: 14px; text-align: center; }
.ac-check--pass { color: var(--ac-green); }
.ac-check--fail { color: var(--ac-rose); }
.ac-check--warn { color: var(--ac-amber); }
.ac-check--pass .ac-check-label { color: var(--ac-text-secondary); }

/* ── Budget bar ─────────────────────────────────────── */
.ac-budget-label {
  font-family: var(--ac-font-mono);
  font-size: 8.5px;
  color: var(--ac-text-tertiary);
  letter-spacing: 1px;
  white-space: nowrap;
  flex-shrink: 0;
}
.ac-budget-track {
  flex: 1;
  height: 6px;
  background: var(--ac-bg-tile);
  border-radius: 3px;
  overflow: hidden;
  min-width: 60px;
  max-width: 200px;
}
.ac-budget-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s ease;
}
.ac-budget-fill--ok   { background: var(--ac-cyan); }
.ac-budget-fill--warn { background: var(--ac-amber); }
.ac-budget-fill--over { background: var(--ac-rose); }
.ac-budget-stats {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-tertiary);
  white-space: nowrap;
  flex-shrink: 0;
}
.ac-budget-empty {
  font-size: 11px;
  font-style: italic;
}
.ac-budget-warning {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  padding: 2px 8px;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
}
.ac-budget-warning--high {
  background: var(--ac-rose-dim);
  color: var(--ac-rose);
}
.ac-budget-warning--mid {
  background: var(--ac-amber-dim);
  color: var(--ac-amber);
}

/* ── Action buttons ─────────────────────────────────── */
.ac-btn-primary {
  font-family: var(--ac-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
  padding: 8px 18px;
  background: var(--ac-cyan);
  color: var(--ac-bg-deep);
  border: none;
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s;
}
.ac-btn-primary:hover   { opacity: 0.88; }
.ac-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.ac-btn-secondary {
  font-family: var(--ac-font-mono);
  font-size: 10px;
  letter-spacing: 0.8px;
  padding: 8px 14px;
  background: none;
  color: var(--ac-text-tertiary);
  border: 1px solid var(--ac-border-subtle);
  border-radius: 5px;
  cursor: not-allowed;
  white-space: nowrap;
  opacity: 0.5;
}

/* ── Countdown timer ────────────────────────────────── */
.ac-countdown-timer {
  position: fixed;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 7500;
  font-family: var(--ac-font-mono);
  font-size: 22px;
  font-weight: 700;
  color: var(--ac-cyan);
  background: var(--ac-bg-deep);
  border: 1px solid var(--ac-border-mid);
  border-radius: 6px;
  padding: 4px 18px;
  letter-spacing: 2px;
  box-shadow: 0 0 0 1px rgba(94,234,212,0.15);
  pointer-events: none;
}
```

---

## §14 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Verdict — NOT READY | Meeting with no outcomes defined. Pill renders rose "NOT READY". Click pill → popover shows "Outcomes defined ✗" as blocking fail. |
| 2 | Verdict — GO WITH CAVEATS | Meeting with outcomes but no duration set. Pill renders amber "GO WITH CAVEATS". Popover shows "Duration set △". |
| 3 | Verdict — GO | Meeting with outcomes + owners + duration + all RSVPs accepted + no overdue actions. Pill renders green "GO". All popover checks show ✓. |
| 4 | Budget bar — partial | Two agenda items with estimates totaling less than `duration_minutes`. Bar shows partial cyan fill, correct used/slack stats. |
| 5 | Budget bar — over | Agenda items total exceeds `duration_minutes`. Bar shows full rose fill, "Xm over" label. |
| 6 | Budget bar — no estimates | No `duration_minutes_estimate` on any agenda item. Bar shows empty state: "Set duration in header to track time". |
| 7 | Begin Meeting | Click "Begin Meeting →". Button shows "Starting…" disabled state. `Accord.startMeeting()` fires. Surface transitions to running shell. |
| 8 | Countdown timer | Set `scheduled_for` to 3 min from now. Simulate gathering mode entry. Countdown appears top-center, ticks down in real time. No auto-dismiss. Exits when gathering mode exits. |
| 9 | Verdict re-render | With footer visible, add a new outcome. Verdict re-derives and re-renders (NOT READY → GO WITH CAVEATS or better). |
| 10 | Teardown | Navigate away. Popover removed, countdown stopped, verdict token invalidated. No residual DOM. |

---

## §15 — Files manifest

| File | Change |
|---|---|
| `accord-meeting-setup.js` | `_deriveVerdict`, `_deriveBudget`, `_deriveWarningPills`, `_renderFooter`, `_footerHtml`, `_wireFooterEvents`, `_toggleVerdictPopover`, `_onBeginMeeting`; countdown `_startCountdown`/`_stopCountdown`; `_checkGatheringCondition` amendment (replace banner with countdown trigger); `_exitGatheringMode` amendment (add `_stopCountdown`); re-render trigger calls in outcome/attendee CRUD; teardown additions |
| `accord-meeting-setup.css` | Footer layout, verdict pill + popover, budget bar, action buttons, countdown timer |
| `version.js` | Operator-managed (IR65) |

---

## §16 — Discipline checklist

- `var` only
- Token pattern: `_verdictToken` on `_deriveVerdict`; `isConnected` before paint
- `Promise.all` for verdict + budget derives — independent reads
- `data-action` on all interactive elements
- `_verdictPopoverOpen` guards double-open; outside-click handler self-removes via named function
- `Begin Meeting` button disabled on click — prevents double-fire
- `Accord.startMeeting` null-guarded
- `Save & invite` renders disabled with tooltip — never wired (X-02 scope)
- Budget bar `pct` clamped to 100 — bar never overflows its track visually
- Countdown uses `setInterval` at 1s; handle stored in `_countdownInterval`; cleared in `_stopCountdown` and `teardown()`
- Re-render triggers placed at end of CRUD functions after PATCH resolves — not before
- CPM critical-path deferral documented: overdue check uses all action nodes, not critical-path only (Track F prerequisite)
- `--ac-*` token prefix throughout

---

**Halt-and-surface after §14. Close-out must include V1–V4 IR64 findings, Begin Meeting transition confirmed (smoke test 7), and countdown timer confirmed (smoke test 8).**

**After seal: Wave 3 is closed. The Accord Meeting Setup Shell build is complete. Advance to C-14 planning or Track D/E/F as operator directs.**

---

*End Commission · C-13 · CMD-ACCORD-SETUP-VERDICT-1.*
