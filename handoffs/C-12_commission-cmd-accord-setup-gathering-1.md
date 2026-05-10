# Commission · C-12 · CMD-ACCORD-SETUP-GATHERING-1

**Phase:** 2 of Wave 3 — Gathering mode + 5-minute warning
**Authored:** 2026-05-10
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Accord Meeting Setup Shell — Requirements Specification v1.1 §6.4
**Predecessor:** C-11 · CMD-ACCORD-SETUP-PERCOLATE-1 sealed
**Successor:** C-13 · CMD-ACCORD-SETUP-VERDICT-1
**Coding agent:** execute sequentially; halt-and-surface after §9

---

## §1 — Scope

Gathering mode auto-engages when the current time is within 15 minutes of `scheduled_for`. It collapses the right column to a focused roster-only view — conn-dots dominant, intelligence hidden — signaling that the meeting is imminent and the room is filling.

**Deliverables:**
1. Gathering mode auto-detection timer (polling `scheduled_for` every 30 seconds)
2. Right column visual transformation on entry: roster-only, conn-dots enlarged, badges/stakes/detail hidden, "GATHERING" label in column header
3. `Show prep view` toggle — operator can temporarily restore the full prep view; clearly marked private
4. 5-minute warning: footer pulse + brief overlay banner
5. Manual conn-dot state toggle (not-connected / on-time / late) — clickable during gathering
6. Gathering mode exit: auto-exits when meeting transitions to `state='running'`; also exits if `scheduled_for` recedes beyond 15 min window (operator rescheduled)

**What does NOT ship:**
- Conn-dot presence derived from real-time Supabase presence (CMD-ACCORD-MEETING-PRESENCE-1 scope) — v1 conn-dots are manually toggled by the operator
- Legend popover (`○ LEGEND` affordance) — deferred; label text is self-explanatory for alpha
- Gathering mode on mobile / narrow viewport — desktop only for alpha
- Any left or center column changes — gathering mode does not affect them per spec

---

## §2 — IR64 verification (before writing any code)

**V1 — `scheduled_for` on meeting object:**
```javascript
JSON.stringify({
  scheduledFor: window.Accord?.state?.meeting?.scheduled_for,
  meetingState: window.Accord?.state?.meeting?.state
});
```
Confirm `scheduled_for` is present and is a valid ISO timestamp on the current meeting object. If null, gathering mode cannot trigger — document as handled (null = no gathering mode).

**V2 — Right column header container:**
```javascript
document.querySelector('.ac-col-header[data-col="right"]')?.innerHTML?.slice(0, 150);
```
Need a stable container to inject the "GATHERING" label and `Show prep view` toggle. Confirm it exists and survives tab switches.

**V3 — Attendee card structure for conn-dot + badge targeting:**
```javascript
var card = document.querySelector('.ac-attendee-card');
JSON.stringify({
  hasConnDot:    !!card?.querySelector('.ac-conn-dot'),
  hasBadge:      !!card?.querySelector('.ac-attendee-badge'),
  hasOwed:       !!card?.querySelector('.ac-attendee-owed'),
  hasUrgency:    !!card?.querySelector('.ac-attendee-urgency'),
  hasExpandBtn:  !!card?.querySelector('[data-action="toggle-attendee-detail"]')
});
```
Gathering mode hides badges, owed lines, urgency lines, and expand controls. Need to confirm the class names used in the deployed cards match what C-04 and C-08 shipped.

Report V1–V3 in close-out.

---

## §3 — No substrate changes

Conn-dot state is in-memory only for v1. No migrations. No `pg_notify`.

---

## §4 — Module-level gathering state

```javascript
var _gatheringMode     = false;      // is gathering mode currently active
var _gatheringTimer    = null;       // setInterval handle for scheduled_for polling
var _gatheringPrepView = false;      // is "Show prep view" currently on
var _connDotStates     = {};         // { [attendee_id]: 'none' | 'on-time' | 'late' }
var _fiveMinWarned     = false;      // has 5-min warning fired this session
```

---

## §5 — Gathering mode detection

### §5.1 — Timer start/stop

```javascript
function _startGatheringTimer(meeting) {
  _stopGatheringTimer();
  if (!meeting.scheduled_for) return;

  _gatheringTimer = setInterval(function() {
    _checkGatheringCondition(meeting);
  }, 30000);  // poll every 30 seconds

  // Also check immediately on mount
  _checkGatheringCondition(meeting);
}

function _stopGatheringTimer() {
  if (_gatheringTimer) {
    clearInterval(_gatheringTimer);
    _gatheringTimer = null;
  }
}
```

Call `_startGatheringTimer(meeting)` from `render()` after shell paint.
Call `_stopGatheringTimer()` from `teardown()`.

### §5.2 — Condition check

```javascript
function _checkGatheringCondition(meeting) {
  if (meeting.state !== 'idle') {
    // Meeting started — exit gathering mode if active
    if (_gatheringMode) _exitGatheringMode();
    _stopGatheringTimer();
    return;
  }

  if (!meeting.scheduled_for) return;

  var now       = Date.now();
  var scheduled = new Date(meeting.scheduled_for).getTime();
  var minutesUntil = (scheduled - now) / 60000;

  if (minutesUntil <= 15 && minutesUntil > -5) {
    // Within window: engage or maintain gathering mode
    if (!_gatheringMode) _enterGatheringMode(meeting);

    // 5-minute warning
    if (minutesUntil <= 5 && minutesUntil > 0 && !_fiveMinWarned) {
      _fiveMinWarned = true;
      _showFiveMinWarning();
    }
  } else {
    // Outside window: exit if active (operator rescheduled)
    if (_gatheringMode) _exitGatheringMode();
  }
}
```

---

## §6 — Gathering mode enter/exit

### §6.1 — `_enterGatheringMode(meeting)`

```javascript
function _enterGatheringMode(meeting) {
  _gatheringMode = true;

  // Update right column header
  _paintGatheringHeader(true);

  // Transform attendee cards
  _applyGatheringToCards(true);

  // Add gathering class to right column rail
  var rightCol = document.querySelector('.ac-setup-col[data-col="right"]');
  if (rightCol) rightCol.classList.add('ac-gathering-active');
}
```

### §6.2 — `_exitGatheringMode()`

```javascript
function _exitGatheringMode() {
  _gatheringMode     = false;
  _gatheringPrepView = false;
  _fiveMinWarned     = false;

  _paintGatheringHeader(false);
  _applyGatheringToCards(false);

  var rightCol = document.querySelector('.ac-setup-col[data-col="right"]');
  if (rightCol) rightCol.classList.remove('ac-gathering-active');
}
```

---

## §7 — Right column header transformation

```javascript
function _paintGatheringHeader(active) {
  var header = document.querySelector('.ac-col-header[data-col="right"]');
  if (!header) return;

  // Remove any existing gathering chrome
  var existing = header.querySelector('.ac-gathering-label');
  if (existing) existing.remove();
  var existingToggle = header.querySelector('.ac-gathering-prep-toggle');
  if (existingToggle) existingToggle.remove();

  if (!active) return;

  // "GATHERING" label
  var label = document.createElement('span');
  label.className = 'ac-gathering-label';
  label.textContent = 'GATHERING';
  header.appendChild(label);

  // "Show prep view" toggle — operator-private affordance
  var toggle = document.createElement('button');
  toggle.className = 'ac-gathering-prep-toggle';
  toggle.dataset.action = 'gathering-prep-toggle';
  toggle.textContent = _gatheringPrepView ? 'PREP VIEW ✓' : 'SHOW PREP VIEW';
  toggle.title = 'Private — not visible to attendees';
  header.appendChild(toggle);

  toggle.addEventListener('click', function() {
    _gatheringPrepView = !_gatheringPrepView;
    toggle.textContent = _gatheringPrepView ? 'PREP VIEW ✓' : 'SHOW PREP VIEW';
    _applyGatheringToCards(_gatheringMode);
  });
}
```

---

## §8 — Attendee card transformation

### §8.1 — Apply/remove gathering state

```javascript
function _applyGatheringToCards(entering) {
  var block = document.getElementById('ac-attendees-block');
  if (!block) return;

  var showIntel = entering ? _gatheringPrepView : true;

  block.querySelectorAll('.ac-attendee-card').forEach(function(card) {
    // Conn-dot: enlarge in gathering mode
    var dot = card.querySelector('.ac-conn-dot');
    if (dot) {
      dot.classList.toggle('ac-conn-dot--gathering', entering);
    }

    // Intelligence elements: hide unless prep view is showing
    var hideEls = card.querySelectorAll(
      '.ac-attendee-badge, .ac-attendee-owed, .ac-attendee-urgency, ' +
      '[data-action="toggle-attendee-detail"], .ac-attendee-detail'
    );
    hideEls.forEach(function(el) {
      el.style.display = (entering && !showIntel) ? 'none' : '';
    });
  });
}
```

### §8.2 — Conn-dot initial render

Conn-dots are rendered as part of `_paintAttendees`. Each card needs a conn-dot injected if not already present. The spec says 12px normally, 16px in gathering mode.

In `_attendeeCardHtml`, add the conn-dot before the avatar:

```javascript
// Add to _attendeeCardHtml, as first child of card:
html += '<span class="ac-conn-dot ac-conn-dot--none" ' +
        'data-action="conn-dot-toggle" ' +
        'data-attendee-id="' + esc(attendee.attendee_id) + '" ' +
        'title="Click to mark connection status"></span>';
```

### §8.3 — Conn-dot click handler

Add to attendees block delegation:

```javascript
if (action === 'conn-dot-toggle') {
  var dot2 = ev.target.closest('[data-action="conn-dot-toggle"]');
  if (!dot2) return;
  var aid = dot2.dataset.attendeeId;
  var states = ['none', 'on-time', 'late'];
  var current = _connDotStates[aid] || 'none';
  var next = states[(states.indexOf(current) + 1) % states.length];
  _connDotStates[aid] = next;
  dot2.className = 'ac-conn-dot ac-conn-dot--' + next +
                   (_gatheringMode ? ' ac-conn-dot--gathering' : '');
  return;
}
```

---

## §9 — 5-minute warning

```javascript
function _showFiveMinWarning() {
  // Footer pulse
  var footer = document.querySelector('.ac-setup-footer');
  if (footer) {
    footer.classList.add('ac-five-min-pulse');
    setTimeout(function() {
      footer.classList.remove('ac-five-min-pulse');
    }, 4000);
  }

  // Banner overlay — auto-dismisses after 8 seconds
  var shell = document.querySelector('.ac-setup-shell');
  if (!shell) return;

  var banner = document.createElement('div');
  banner.id = 'ac-five-min-banner';
  banner.className = 'ac-five-min-banner';
  banner.innerHTML = '<span class="ac-five-min-glyph">⏱</span>' +
                     '<span class="ac-five-min-text">5 minutes to start</span>' +
                     '<button class="ac-five-min-dismiss" ' +
                     'data-action="five-min-dismiss">✕</button>';
  shell.appendChild(banner);

  banner.querySelector('[data-action="five-min-dismiss"]')
    .addEventListener('click', function() { banner.remove(); });

  // Auto-dismiss
  setTimeout(function() {
    if (banner.parentNode) banner.remove();
  }, 8000);

  // Animate in
  requestAnimationFrame(function() {
    banner.classList.add('ac-five-min-banner--visible');
  });
}
```

---

## §10 — Teardown additions

```javascript
// In teardown():
_stopGatheringTimer();
_gatheringMode     = false;
_gatheringPrepView = false;
_fiveMinWarned     = false;
_connDotStates     = {};

// Clean up gathering DOM if present
var banner = document.getElementById('ac-five-min-banner');
if (banner) banner.remove();
_exitGatheringMode();  // removes gathering classes and header chrome
```

---

## §11 — CSS additions

```css
/* ── Conn-dot ───────────────────────────────────────── */
.ac-conn-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  cursor: pointer;
  transition: width 0.2s ease, height 0.2s ease, box-shadow 0.2s ease;
}
.ac-conn-dot--none {
  background: transparent;
  border: 2px solid var(--ac-border-mid);
  box-shadow: 0 0 0 0 transparent;
  /* Glowing outline — not connected */
  animation: ac-conn-glow 2s ease-in-out infinite;
}
.ac-conn-dot--on-time {
  background: var(--ac-green);
  border: none;
  animation: none;
}
.ac-conn-dot--late {
  background: var(--ac-amber);
  border: none;
  animation: none;
}
.ac-conn-dot--gathering {
  width: 16px;
  height: 16px;
}
@keyframes ac-conn-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(90,102,120,0.4); }
  50%       { box-shadow: 0 0 0 4px rgba(90,102,120,0); }
}

/* ── Gathering mode column ──────────────────────────── */
.ac-gathering-active .ac-attendee-card {
  padding: 10px 12px;
}

/* ── Gathering header chrome ────────────────────────── */
.ac-gathering-label {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.6px;
  color: var(--ac-cyan);
  text-transform: uppercase;
  margin-left: 8px;
}
.ac-gathering-prep-toggle {
  font-family: var(--ac-font-mono);
  font-size: 8px;
  letter-spacing: 0.8px;
  color: var(--ac-text-faint);
  background: none;
  border: 1px solid var(--ac-border-subtle);
  border-radius: 3px;
  padding: 2px 7px;
  cursor: pointer;
  margin-left: auto;
}
.ac-gathering-prep-toggle:hover { color: var(--ac-text-tertiary); }

/* ── 5-minute warning banner ────────────────────────── */
.ac-five-min-banner {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%) translateY(-12px);
  z-index: 8000;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--ac-bg-deep);
  border: 1px solid var(--ac-border-mid);
  border-top: 2px solid var(--ac-cyan);
  border-radius: 6px;
  padding: 10px 16px;
  opacity: 0;
  transition: opacity 0.22s ease, transform 0.22s ease;
  pointer-events: none;
}
.ac-five-min-banner--visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
  pointer-events: auto;
}
.ac-five-min-glyph { font-size: 14px; }
.ac-five-min-text {
  font-family: var(--ac-font-mono);
  font-size: 11px;
  color: var(--ac-text-primary);
  letter-spacing: 0.5px;
}
.ac-five-min-dismiss {
  font-size: 11px;
  color: var(--ac-text-faint);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 2px;
  margin-left: 4px;
}
.ac-five-min-dismiss:hover { color: var(--ac-text-secondary); }

/* ── Footer 5-min pulse ─────────────────────────────── */
@keyframes ac-footer-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(94,234,212,0.4); }
  50%  { box-shadow: 0 0 0 8px rgba(94,234,212,0); }
  100% { box-shadow: 0 0 0 0 rgba(94,234,212,0); }
}
.ac-five-min-pulse {
  animation: ac-footer-pulse 1s ease-out 3;
}
```

---

## §12 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Meeting with `scheduled_for` 14 min from now | Gathering mode auto-engages within 30s. Right column shows "GATHERING" label. Conn-dots enlarge to 16px. Status badges, owed lines, urgency lines hidden. "SHOW PREP VIEW" toggle visible. Left + center columns unchanged. |
| 2 | `Show prep view` toggle | Click toggle → badges, owed lines, urgency lines restore. Label changes to "PREP VIEW ✓". Click again → intelligence re-hides. |
| 3 | Conn-dot cycle | Click a conn-dot: none → on-time (green) → late (amber) → none. State persists in `_connDotStates` across attendee re-renders. |
| 4 | 5-minute warning | Simulate by setting `scheduled_for` to 4 min from now. Banner slides down from top-center. Footer pulses cyan. Banner auto-dismisses after 8s. ✕ also dismisses. |
| 5 | Gathering mode exit on Begin Meeting | Click Begin Meeting while in gathering mode. Meeting transitions to running. `_exitGatheringMode()` fires. 5-tab shell renders cleanly — no gathering chrome visible. |
| 6 | Outside window — no gathering | Meeting with `scheduled_for` 20 min from now. Gathering mode does not engage. |
| 7 | `scheduled_for` is null | No gathering mode, no timer. No errors. |
| 8 | Teardown while gathering active | Navigate away while in gathering mode. Gathering classes removed. Timer cleared. Return to meeting — full prep view (no residual gathering state). |

---

## §13 — Files manifest

| File | Change |
|---|---|
| `accord-meeting-setup.js` | Gathering state vars; `_startGatheringTimer`, `_stopGatheringTimer`, `_checkGatheringCondition`, `_enterGatheringMode`, `_exitGatheringMode`, `_paintGatheringHeader`, `_applyGatheringToCards`, `_showFiveMinWarning`; conn-dot in `_attendeeCardHtml`; conn-dot click in attendees delegation; teardown additions |
| `accord-meeting-setup.css` | Conn-dot styles + gathering animation; gathering column + header chrome; 5-min banner + footer pulse |
| `version.js` | Operator-managed (IR65) |

---

## §14 — Discipline checklist

- `var` only
- `data-action="conn-dot-toggle"` and `data-action="gathering-prep-toggle"` and `data-action="five-min-dismiss"` — no anonymous onclicks
- `setInterval` handle stored in `_gatheringTimer`; cleared in `_stopGatheringTimer()` and `teardown()`
- `_fiveMinWarned` prevents repeated banner fires within one session
- `_connDotStates` re-applied after attendee re-render (add call to `_applyGatheringToCards` at end of `_paintAttendees` when `_gatheringMode` is true)
- Left and center columns untouched — spec §6.4 explicit
- `scheduled_for` null-guarded throughout
- `--ac-*` token prefix throughout; no new tokens invented

---

**Halt-and-surface after §12. Close-out must include V1–V3 IR64 findings, conn-dot cycle confirmed (smoke test 3), and gathering mode exit on Begin Meeting confirmed (smoke test 5).**

**After seal: C-13 · CMD-ACCORD-SETUP-VERDICT-1 is unblocked. C-13 closes Wave 3 and the Setup Shell build.**

---

*End Commission · C-12 · CMD-ACCORD-SETUP-GATHERING-1.*
