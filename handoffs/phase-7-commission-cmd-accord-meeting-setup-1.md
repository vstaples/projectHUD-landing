# Phase 7 Commission · CMD-ACCORD-MEETING-SETUP-1

**Phase:** 7 — Footer: duration widget + CMD seal
**Authored:** 2026-05-09
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Predecessor:** Phase 6 sealed (all 7 smoke tests pass)
**Coding agent:** execute sequentially; halt-and-surface after §7
**Note:** This is the CMD closer. Phase 7 seal = CMD-ACCORD-MEETING-SETUP-1 seal.

---

## §1 — Scope

**Primary:** Fill `.ac-setup-footer-left` with a duration widget. The time-budget gauge (elapsed vs. planned) belongs in the running-meeting surface, not the Setup shell — the meeting hasn't started yet. Phase 7 is the correct place to set planned duration while the meeting is still idle.

**Also this Phase:**
- Full Setup shell smoke regression (all surfaces, all columns)
- IR67 8-archetype walkthrough on shipped product
- Version pin bump (operator-managed)
- CMD seal close-out document

---

## §2 — Locked decisions

| Decision | Lock |
|---|---|
| Duration widget placement | `.ac-setup-footer-left` |
| Duration source | `accord_meetings.duration_minutes` (nullable integer) |
| Edit scope | Any firm member may set duration (existing permissive UPDATE RLS; no organizer gate needed for duration — scheduling is collaborative) |
| Null state | "Set duration" affordance — inline input, submit on Enter or blur |
| Set state | "Xm" display with pencil/edit affordance; click → inline edit |
| PATCH target | `accord_meetings?meeting_id=eq.<id>` body `{ duration_minutes: <int> }` |
| No trigger needed | Existing RLS UPDATE policy allows duration PATCH; `briefing_text` trigger only gates `briefing_text` column — no impact |
| Clear/unset | Optional: "×" alongside the set value to clear (`duration_minutes: null`). Include in v1. |
| Running-meeting gauge | Out of scope this CMD. Deferred to follow-on CMD (running-meeting surface enhancement). |

---

## §3 — No substrate changes

No migration. `duration_minutes` column confirmed present. No new columns, no new RLS policies, no new triggers.

---

## §4 — `accord-meeting-setup.js` additions

### §4.1 — Entry point

Called from `render()` after shell HTML is written:

```javascript
function _renderFooterDuration(meeting) {
  var footerLeft = document.querySelector('.ac-setup-footer-left');
  if (!footerLeft) return;
  _paintDuration(footerLeft, meeting);
}
```

### §4.2 — Paint

Two states based on `meeting.duration_minutes`:

**Null state:**
```
.ac-footer-duration
  button.ac-footer-duration-set   ← "Set duration"
```

**Set state:**
```
.ac-footer-duration
  span.ac-footer-duration-value   ← "45m" (formatted)
  button.ac-footer-duration-edit  ← "Edit" (or pencil glyph "✎")
  button.ac-footer-duration-clear ← "×"
```

```javascript
function _paintDuration(footerLeft, meeting) {
  var d = meeting.duration_minutes;
  if (d == null) {
    footerLeft.innerHTML =
      '<div class="ac-footer-duration">' +
      '<button class="btn btn-ghost ac-footer-duration-set">Set duration</button>' +
      '</div>';
    footerLeft.querySelector('.ac-footer-duration-set')
      .addEventListener('click', function() { _openDurationInput(footerLeft, meeting, null); });
  } else {
    footerLeft.innerHTML =
      '<div class="ac-footer-duration">' +
      '<span class="ac-footer-duration-value">' + esc(d + 'm') + '</span>' +
      '<button class="btn btn-ghost ac-footer-duration-edit">✎</button>' +
      '<button class="btn btn-ghost ac-footer-duration-clear">×</button>' +
      '</div>';
    footerLeft.querySelector('.ac-footer-duration-edit')
      .addEventListener('click', function() { _openDurationInput(footerLeft, meeting, d); });
    footerLeft.querySelector('.ac-footer-duration-clear')
      .addEventListener('click', function() { _saveDuration(footerLeft, meeting, null); });
  }
}
```

IR71: `footerLeft` is the post-paint reference passed as argument. No re-query needed — listeners are bound synchronously to freshly written elements, before any async operation.

### §4.3 — Inline input

```javascript
function _openDurationInput(footerLeft, meeting, currentVal) {
  footerLeft.innerHTML =
    '<div class="ac-footer-duration ac-footer-duration--editing">' +
    '<input class="ac-footer-duration-input" type="number" min="1" max="480" ' +
    'placeholder="minutes" value="' + esc(currentVal != null ? String(currentVal) : '') + '">' +
    '<button class="btn btn-signal ac-footer-duration-save">Set</button>' +
    '<button class="btn btn-ghost ac-footer-duration-cancel">Cancel</button>' +
    '</div>';

  var input  = footerLeft.querySelector('.ac-footer-duration-input');
  var saveBtn = footerLeft.querySelector('.ac-footer-duration-save');
  var cancelBtn = footerLeft.querySelector('.ac-footer-duration-cancel');

  input.focus();
  input.select();

  function _doSave() {
    var val = parseInt(input.value, 10);
    if (!val || val < 1) { _paintDuration(footerLeft, meeting); return; }
    _saveDuration(footerLeft, meeting, val);
  }

  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); _doSave(); }
    if (ev.key === 'Escape') { _paintDuration(footerLeft, meeting); }
  });
  saveBtn.addEventListener('click', _doSave);
  cancelBtn.addEventListener('click', function() { _paintDuration(footerLeft, meeting); });
}
```

### §4.4 — Save

```javascript
function _saveDuration(footerLeft, meeting, val) {
  API.patch(
    'accord_meetings?meeting_id=eq.' + meeting.meeting_id,
    { duration_minutes: val }
  ).then(function() {
    meeting.duration_minutes = val;   // update local reference
    _paintDuration(footerLeft, meeting);
  }).catch(function(e) {
    console.error('[AccordMeetingSetup] duration save failed', e);
    _paintDuration(footerLeft, meeting);  // revert to previous state
  });
}
```

`meeting.duration_minutes` is updated on the local object so re-renders within the same session reflect the new value without a re-fetch.

### §4.5 — `duration_minutes` in `renderMeetingView` select

Confirm `duration_minutes` is in the `accord_meetings` select query in `accord-views.js` (added in Phase 4 for `briefing_text`; check whether `select=*` or explicit column list). If explicit list, add `duration_minutes`. If `select=*`, no change needed. Document in close-out.

---

## §5 — CSS additions (`accord-meeting-setup.css`)

```css
.ac-footer-duration {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ac-footer-duration-value {
  font-size: 13px;
  color: var(--text-primary, #e0e0e0);
}
.ac-footer-duration-edit,
.ac-footer-duration-clear,
.ac-footer-duration-set {
  font-size: 12px;
  padding: 2px 6px;
}
.ac-footer-duration-input {
  width: 72px;
  font-size: 13px;
  /* standard Accord input style per existing form conventions */
}
.ac-footer-duration--editing .ac-footer-duration-save {
  font-size: 12px;
  padding: 2px 8px;
}
```

---

## §6 — Full regression + IR67 walkthrough

**Before smoke tests:** verify all prior phase columns still render correctly in a single idle meeting open. Briefing (Phase 4), Agenda (Phase 3), Anticipation (Phase 5), Filmstrip (Phase 6), Footer (Phase 7). No column should be blank or errored.

**IR67 — 8-archetype walkthrough.** Run the Setup shell against all 8 meeting archetypes. For each, confirm the Setup shell serves the archetype's pre-meeting needs:

| Archetype | Setup shell check |
|---|---|
| 1:1 | Duration widget useful (short meeting — 30m). Briefing: minimal. Agenda: 1–2 items typical. |
| Status sync | Agenda: recurring items. Filmstrip: prior status syncs visible. |
| Project review | Anticipation: prior actions list populated. Filmstrip: prior reviews. |
| Retrospective | Agenda: structured retro format. Briefing: context from last retro. |
| Decision review | Anticipation: prior decisions with NRA badges. Dissent (Di) visible in filmstrip summary if applicable. |
| Kickoff | Filmstrip: empty (first meeting). Briefing: "First meeting in this workstream." |
| Regulatory | Duration widget critical (compliance meetings time-boxed). Anticipation: resources visible. |
| Board update | Briefing: context-heavy. Filmstrip: prior board updates for continuity. |

Document any archetype where the Setup shell is materially insufficient. These become follow-on CMD candidates.

---

## §7 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Open idle meeting with `duration_minutes = null` | Footer-left shows "Set duration" button. |
| 2 | Click "Set duration" → enter 45 → Enter | Input accepted; PATCH fires; footer shows "45m ✎ ×". Verify in Supabase: `SELECT duration_minutes FROM accord_meetings WHERE meeting_id = '<id>';` → 45. |
| 3 | Click ✎ → change to 60 → Set | PATCH fires; footer shows "60m ✎ ×". |
| 4 | Click × (clear) | PATCH `duration_minutes = null`; footer reverts to "Set duration". |
| 5 | Enter invalid value (0, negative, non-numeric) | No PATCH; reverts to previous paint state. |
| 6 | Cancel during edit | No PATCH; previous state restored. |
| 7 | Reload page after setting duration | Footer shows saved value on re-render (duration_minutes in select query). |
| 8 | Full column regression: all 5 columns render in single idle meeting open | Briefing ✓, Agenda ✓, Anticipation ✓, Filmstrip ✓, Footer duration ✓. No blank or errored columns. |
| 9 | Begin Meeting after setting duration | `startMeeting()` fires; transitions to 5-tab shell. Duration value persists on meeting row (no overwrite). |
| 10 | IR67 8-archetype walkthrough | All 8 archetypes documented. Any material gaps flagged as follow-on CMD candidates. |

---

## §8 — Files manifest

| File | Change |
|---|---|
| `accord-meeting-setup.js` | Duration widget render/paint/edit/save; `_renderFooterDuration` called from `render()` |
| `accord-meeting-setup.css` | Duration widget styles |
| `accord-views.js` | `duration_minutes` added to select if not already present (§4.5) |
| `version.js` | **Operator-managed** (IR65) |

---

## §9 — Discipline checklist

- `var` only
- IR71: `footerLeft` passed as argument through all paint/edit/save functions — no re-query after async operations
- `parseInt(input.value, 10)` — explicit radix; falsy/NaN guard before PATCH
- No abort flag needed — duration widget has no async fetch at render time; save is a PATCH with synchronous revert on failure
- `duration_minutes` in select query verified (§4.5) — close-out documents whether `select=*` or explicit list
- Style Doctrine v1.8 §3.8 — Accord palette only

---

## §10 — CMD seal deliverables checklist

Phase 7 close-out doubles as the CMD-ACCORD-MEETING-SETUP-1 seal document. Include all of the following:

- [ ] All Phase 7 smoke tests (1–10) pass
- [ ] IR67 8-archetype walkthrough documented with findings
- [ ] Version pin bump confirmed (operator-managed)
- [ ] `accord-views.js` select query confirmed (§4.5 — `select=*` or explicit list with `duration_minutes`)
- [ ] Null-guard doctrine candidate carried: 4+ data points, MEETING-SETUP chain, awaiting cross-CMD instance
- [ ] Canonical tag order confirmed: N, D, A, R, Q, Di
- [ ] Open items queue for successor CMDs (see §11)
- [ ] CMD-ACCORD-MEETING-SETUP-1 declared sealed

---

## §11 — Open items queue for successor CMDs

Document these in the CMD seal close-out:

| Item | Type | Target |
|---|---|---|
| Time-budget gauge (elapsed vs. planned) | Enhancement | Running-meeting surface CMD |
| Header font inconsistency Draft vs. Live surfaces | Style debt | Follow-on style CMD |
| Empty view glitch on rapid back-navigation | Visual defect | Follow-on micro-CMD |
| "View history" affordance in NRA Update modal | UX | CMD-ACCORD-NRA-BRIEFING-PACK-1 |
| Waived-region CSS | Style | CMD-ACCORD-NRA-BRIEFING-PACK-1 or standalone |
| Carried References | Feature | CMD-ACCORD-MEETING-ATTACHMENTS-1 |
| Footer connected-status | Feature | Future meeting-surface CMD |
| Pull picker: filter already-pulled nodes | UX | Can absorb into CMD-ACCORD-MEETING-SETUP-1 follow-on or BRIEFING-PACK |

---

**Halt-and-surface after §7. Phase 7 close-out = CMD-ACCORD-MEETING-SETUP-1 seal document. File both together.**

---

*End Phase 7 Commission · CMD-ACCORD-MEETING-SETUP-1.*
