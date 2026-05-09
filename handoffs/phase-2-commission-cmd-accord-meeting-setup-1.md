# Phase 2 Commission · CMD-ACCORD-MEETING-SETUP-1

**Phase:** 2 — Substrate amendment + Meeting Setup shell (chrome only)
**Authored:** 2026-05-09
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Predecessor:** Phase 1 Investigation (halt-and-surface, 2026-05-09)
**Coding agent:** execute sequentially; halt-and-surface after §7

---

## §1 — Locked decisions

These were resolved in Phase 1 and the operator-architect dialogue. Do not re-open.

| Decision | Lock |
|---|---|
| Render strategy | **Option β** — whole-surface swap on `state='idle'`; no 6th tab |
| Production state enum | `idle \| running \| closed` — `idle` is the draft-equivalent |
| Begin Meeting transition | Explicit re-render: `Accord.startMeeting()` → `AccordViews.renderMeetingView()` — no new CustomEvent |
| briefing_text RLS | Firm-wide readable; organizer-only writable (enforced by trigger, not additional RLS policy) |
| `organizer_id` column | Confirmed via live RLS policy. Use `organizer_id` throughout — NOT `organized_by_user_id` |
| `accord-transitions.js` | No changes this Phase |
| Phase scope | Chrome only. All pane content (Briefing logic, Agenda, Anticipation, Filmstrip, Prior actions) deferred to Phases 3–7 |

---

## §2 — Deliverables

1. Migration deployed: `briefing_text` column + state-gate trigger on `accord_meetings`
2. New file: `accord-meeting-setup.js` — Setup shell render + teardown + Begin Meeting wiring
3. New file: `accord-meeting-setup.css` — Setup shell layout + Accord palette only
4. Modified: `accord-views.js` — `renderMeetingView` state branch (idle → Setup shell; running/closed/sealed → existing 5-tab shell)
5. All 7 smoke tests pass
6. Phase 2 close-out document

---

## §3 — Migration (deploy first, before any UI work)

Run in Supabase SQL editor. Two statements; run together.

```sql
-- Migration: 2026-05-09_accord_meetings_briefing_text.sql
-- CMD-ACCORD-MEETING-SETUP-1 Phase 2

ALTER TABLE accord_meetings
  ADD COLUMN briefing_text TEXT NULL;

COMMENT ON COLUMN accord_meetings.briefing_text IS
  'Operator-authored prep briefing. Editable by organizer while state=''idle''; '
  'immutable once state transitions to running. Firm-wide readable. '
  'CMD-ACCORD-MEETING-SETUP-1.';
```

Then deploy the state-gate trigger:

```sql
CREATE OR REPLACE FUNCTION accord_meetings_briefing_text_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.briefing_text IS DISTINCT FROM OLD.briefing_text THEN

    IF OLD.state <> 'idle' THEN
      RAISE EXCEPTION 'briefing_text is immutable once meeting has started (state=%)',
        OLD.state USING ERRCODE = 'P0001';
    END IF;

    IF auth.uid() <> OLD.organizer_id THEN
      RAISE EXCEPTION 'briefing_text may only be edited by the meeting organizer'
        USING ERRCODE = 'P0001';
    END IF;

  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER accord_meetings_briefing_text_gate_trg
  BEFORE UPDATE ON accord_meetings
  FOR EACH ROW
  EXECUTE FUNCTION accord_meetings_briefing_text_gate();
```

**Verification after migration:**

```sql
-- Confirm column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'accord_meetings' AND column_name = 'briefing_text';

-- Confirm trigger exists
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'accord_meetings'
  AND trigger_name = 'accord_meetings_briefing_text_gate_trg';
```

Do not proceed to UI work until both rows return.

---

## §4 — `accord-views.js` change

**One change only.** Locate `renderMeetingView(host, meetingId, workstreamId)` (line 363 per Phase 1 survey). After the meeting row is fetched and before the tab bar is rendered, insert the state branch:

```javascript
// CMD-ACCORD-MEETING-SETUP-1 Phase 2: state-gated render swap.
// idle → Meeting Setup shell (accord-meeting-setup.js)
// running / closed / sealed → existing 5-tab shell (unchanged)
if (m.state === 'idle') {
  AccordMeetingSetup.render(host, m, workstreamId);
  return;
}
```

Place this immediately after the meeting fetch resolves and `m` is available, before any tab-bar HTML is written. The `return` exits `renderMeetingView`; the existing 5-tab render path below is untouched.

**No other changes to `accord-views.js`.**

---

## §5 — `accord-meeting-setup.js`

New file. Exposes `window.AccordMeetingSetup = { render, teardown }`.

### §5.1 — Module shape

```javascript
// ============================================================
// accord-meeting-setup.js — Meeting Setup surface
// CMD-ACCORD-MEETING-SETUP-1 Phase 2
//
// Renders the pre-meeting Setup shell for accord_meetings rows
// in state='idle'. Replaces the 5-tab shell for draft meetings.
// Phase 2 scope: chrome only (header, 3-column placeholders,
// filmstrip placeholder, footer with Begin Meeting wiring).
// Pane content (Briefing logic, Agenda, Anticipation, Filmstrip,
// Prior actions) ships in Phases 3-7.
//
// Exposes: window.AccordMeetingSetup = { render(host, meeting, workstreamId), teardown() }
// ============================================================
```

### §5.2 — `render(host, meeting, workstreamId)`

1. Calls `teardown()` first (idempotent — safe on re-render).
2. Sets `window._accordDetachSurfaceHost = () => AccordMeetingSetup.teardown()`.
3. Writes the Setup shell HTML into `host` (see §5.4 for structure).
4. Wires the Begin Meeting button (see §5.3).
5. Wires the briefing_text autosave (see §5.5).

### §5.3 — Begin Meeting wiring

Begin Meeting button `onclick`:

```javascript
async function _beginMeeting(meeting, workstreamId, btn) {
  btn.disabled = true;
  var orig = btn.textContent;
  btn.textContent = 'Starting…';
  try {
    await Accord.startMeeting(meeting.meeting_id);
    // Re-render the meeting view — transitions to 5-tab shell.
    // Fetch fresh meeting row first so state='running' is authoritative.
    var host = document.querySelector('.ac-view-host');
    if (host && window.AccordViews?.renderMeetingView) {
      await AccordViews.renderMeetingView(host, meeting.meeting_id, workstreamId);
    }
  } catch (e) {
    console.error('[AccordMeetingSetup] Begin Meeting failed', e);
    alert('Could not start meeting: ' + (e?.message || e));
    btn.disabled = false;
    btn.textContent = orig;
  }
}
```

IR71 note: `host` is re-queried after `startMeeting()` resolves, not captured before. The render call operates on the live DOM reference.

### §5.4 — Setup shell HTML structure

```
.ac-setup-shell
  .ac-setup-header
    .ac-setup-breadcrumb          ← workstream name → meeting title (text only, v1)
    .ac-setup-title               ← meeting.title (h2)
    .ac-setup-meta                ← scheduled_for formatted, state badge "Draft"
  .ac-setup-body
    .ac-setup-col.ac-setup-col--briefing
      .ac-setup-col-label         ← "Briefing"
      .ac-setup-briefing-area     ← Phase 4 content; v1: textarea for briefing_text
    .ac-setup-col.ac-setup-col--agenda
      .ac-setup-col-label         ← "Agenda"
      .ac-setup-agenda-area       ← Phase 3 content; v1: placeholder text
    .ac-setup-col.ac-setup-col--anticipation
      .ac-setup-col-label         ← "Anticipation"
      .ac-setup-anticipation-area ← Phase 5 content; v1: placeholder text
  .ac-setup-filmstrip             ← Phase 6 content; v1: placeholder text
  .ac-setup-footer
    .ac-setup-footer-left         ← Phase 7 content; v1: empty
    .ac-setup-footer-right
      button.btn.ac-setup-begin   ← "Begin Meeting →"
```

**v1 placeholder text (Agenda, Anticipation, Filmstrip):** `"(coming soon)"` — terse, not explanatory.

**Briefing textarea:** wire as a functional autosave against `briefing_text` (see §5.5). This is v1 scope — the mechanical-default Briefing logic ships in Phase 4.

**Workstream name for breadcrumb:** fetch from `accord_workstreams?workstream_id=eq.{workstreamId}&select=name&limit=1` if `workstreamId` is non-null. If null (parking-lot meeting), breadcrumb shows "Accord → [meeting title]". Do not block render on this fetch — render breadcrumb in two passes (placeholder → resolved name).

### §5.5 — briefing_text autosave

Debounced PATCH on textarea input. 800ms debounce. Uses `API.patch`:

```javascript
// PATCH accord_meetings?meeting_id=eq.<id>
// body: { briefing_text: <value> }
```

On PATCH failure: log to console; surface no alert (autosave is background). If trigger rejects (state no longer idle, or not organizer), the error is caught and logged — surface is read-only in that case anyway.

### §5.6 — `teardown()`

```javascript
function teardown() {
  // Clear the detach hook
  if (window._accordDetachSurfaceHost === _detachHandler) {
    window._accordDetachSurfaceHost = null;
  }
  // Cancel any pending debounce
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  // DOM cleared by caller (transitions.js or renderMeetingView)
}
```

### §5.7 — Parking-lot meeting handling (`workstream_id IS NULL`)

- Breadcrumb: "Accord → [meeting title]"
- Filmstrip placeholder: omit entirely (no prior meetings query to run)
- Anticipation placeholder: render same as workstream case
- Begin Meeting: same path (no workstreamId in re-render call)

---

## §6 — `accord-meeting-setup.css`

New file. Accord palette tokens only (Style Doctrine v1.8 §3.8).

### Layout requirements

- `.ac-setup-shell`: full height of `.ac-view-host`; flex column
- `.ac-setup-body`: flex row; three equal columns with gap; flex-grow 1; overflow-y auto per column
- `.ac-setup-filmstrip`: fixed height strip (height: ~72px); horizontal scroll; flex-shrink 0
- `.ac-setup-footer`: flex row; align-items center; justify-content space-between; border-top; flex-shrink 0; padding 12px 16px
- `.ac-setup-col-label`: small uppercase label style; margin-bottom 8px

### Token reference

Use existing Accord CSS variable names. If a variable isn't defined in `accord.css`, do not invent one — use a literal value and add a `/* TODO: tokenize */` comment.

### Begin Meeting button

Use `.btn.btn-signal` from existing button conventions. No new button styles.

---

## §7 — Smoke tests

Run against deployed code. All 7 must pass before Phase 2 close-out.

| # | Test | Expected |
|---|---|---|
| 1 | Open a meeting with `state='idle'` | Setup shell renders. No tab bar. Header shows meeting title + "Draft" badge. Three column labels visible. Begin Meeting button present. |
| 2 | Open a meeting with `state='running'` | Existing 5-tab shell renders (Live Capture default tab). No Setup shell. Unchanged from pre-CMD behavior. |
| 3 | Begin Meeting (as organizer) | PATCH fires → `state='running'` → surface re-renders to 5-tab shell → Live Capture tab active. No Setup shell visible. |
| 4 | Ascend to constellation while Setup is open | `_accordDetachSurfaceHost` fires; Setup teardown runs; constellation renders cleanly. No console errors. Descend back to the meeting → Setup re-renders correctly. |
| 5 | `briefing_text` trigger — state gate | In SQL editor: `UPDATE accord_meetings SET briefing_text = 'test' WHERE meeting_id = '<a running meeting id>'`. Expected: `ERROR: briefing_text is immutable once meeting has started`. |
| 6 | `briefing_text` trigger — organizer gate | In SQL editor (as a different auth.uid or simulate): `UPDATE accord_meetings SET briefing_text = 'test' WHERE meeting_id = '<idle meeting where auth.uid() ≠ organizer_id>'`. Expected: `ERROR: briefing_text may only be edited by the meeting organizer`. |
| 7 | Parking-lot meeting (`workstream_id IS NULL`) | Setup shell renders. Breadcrumb shows "Accord → [title]". Filmstrip placeholder absent or empty. Begin Meeting works. |

**Trigger tests (5, 6):** these require SQL editor access as a test user. Note the meeting_id and organizer_id used. Post-test SELECT to confirm `briefing_text` was not written.

---

## §8 — Files manifest (anticipated)

| File | Change | Notes |
|---|---|---|
| `accord-meetings` (Supabase) | `briefing_text` column + trigger | Deploy before UI |
| `accord-meeting-setup.js` | **NEW** | Phase 2 surface module |
| `accord-meeting-setup.css` | **NEW** | Phase 2 styles |
| `accord-views.js` | State branch in `renderMeetingView` | ~5 lines added |
| `accord.html` | Script + CSS loader additions | Add after existing accord-* loaders |
| `version.js` | **Operator-managed** (IR65) | Surface code touches new paths |

---

## §9 — Discipline checklist

- `var` only — no `let`/`const`
- Zero-arg onclick / data-tid pattern for any interactive elements beyond the Begin Meeting button
- Arial ≥12pt / mono ≥14pt in all rendered text
- Orange console badge on version bump (operator-managed)
- IR64: verify column name is `organizer_id` (confirmed via RLS policy; do not assume `organized_by_user_id`)
- IR65: version pin bump — operator-managed this Phase
- IR68: briefing_text is operator-prep context; rendered only inside Setup shell (idle-state only); not exposed in any running/closed/sealed surface
- IR71: Begin Meeting re-render re-queries `.ac-view-host` after `startMeeting()` resolves — no stale reference
- Style Doctrine v1.8 §3.8: Accord palette only in `accord-meeting-setup.css`
- `accord-transitions.js`: do not modify

---

## §10 — Phase 3 preview (not in scope; for agent awareness)

Phase 3 = Agenda column: `accord_agenda_items` read + render, add-item affordance, pull-as-thread affordance (with `pulled_from_node_id` substrate sub-amendment on `accord_agenda_items`). Phase 3 commission authored after Phase 2 seal.

---

**Halt-and-surface after §7. Present Phase 2 close-out before Phase 3 commission.**

---

*End Phase 2 Commission · CMD-ACCORD-MEETING-SETUP-1.*
