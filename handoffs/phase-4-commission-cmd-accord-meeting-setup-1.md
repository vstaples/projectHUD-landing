# Phase 4 Commission · CMD-ACCORD-MEETING-SETUP-1

**Phase:** 4 — Briefing column + Agenda polish
**Authored:** 2026-05-09
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Predecessor:** CMD-ACCORD-NEWMEETING-ROUTING-FIX-1 (sealed); Phase 3 sealed
**Coding agent:** execute sequentially; halt-and-surface after §8

---

## §1 — Scope

**Primary:** Briefing column — mechanical default + operator override of `briefing_text`.

**Secondary (Agenda polish — Phase 3 UX feedback):** Visual separator between organizer-added and pulled agenda items; color-coded pulled-item badges by node type. Requires one small substrate sub-amendment (`pulled_from_tag` column).

NRA-shape inference: deferred (not Phase 4 scope).

---

## §2 — Locked decisions

| Decision | Lock |
|---|---|
| Briefing two-state model | **State A (briefing_text IS NULL):** mechanical default rendered read-only; "Edit briefing" affordance. **State B (briefing_text IS NOT NULL):** textarea with saved value; autosave; "Reset to default" clears to State A. |
| Mechanical default content | First meeting in workstream: fixed copy (see §5.2). Returning: "Meeting N in [workstream]. Last meeting: [title] ([date]). [X decisions, Y actions] captured." Two queries (prior meetings + last meeting node counts). |
| Override seed | Clicking "Edit briefing" opens textarea pre-populated with the mechanical default text as a starting point (operator can edit freely). |
| Reset | PATCH `briefing_text = null`. Trigger allows this (null IS NOT DISTINCT FROM null → no state/organizer check fires). Re-renders State A. |
| Agenda separator | Rendered at paint time: non-pulled items first (position-ordered), separator `<hr>`, pulled items second. No position re-numbering — pulled items keep sequential position numbers within their group. |
| Color-coded badges | `← DECISION` / `← ACTION` / `← [tag]` using Accord palette per tag. Requires `pulled_from_tag TEXT NULL` on `accord_agenda_items` (substrate sub-amendment). Populated at INSERT in `_pullNode`. |
| `briefing_text` in select | `accord-views.js::renderMeetingView` select query — add `briefing_text` to the column list. One-line fix. |

---

## §3 — Substrate sub-amendment (deploy before UI)

```sql
-- Migration: 2026-05-09_accord_agenda_items_pulled_from_tag.sql
-- CMD-ACCORD-MEETING-SETUP-1 Phase 4

ALTER TABLE accord_agenda_items
  ADD COLUMN pulled_from_tag TEXT NULL;

COMMENT ON COLUMN accord_agenda_items.pulled_from_tag IS
  'Tag value of the source accord_nodes row when this item was created via '
  'pull-as-thread. NULL for organizer-added items. Populated at INSERT from '
  'node.tag. CMD-ACCORD-MEETING-SETUP-1 Phase 4.';
```

**Verification:**
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'accord_agenda_items'
  AND column_name = 'pulled_from_tag';
```

---

## §4 — `accord-views.js` fix (one line)

Locate the `select=` string in `renderMeetingView`'s `accord_meetings` GET call. Add `briefing_text` to the column list.

**Before (approximate):**
```javascript
'accord_meetings?meeting_id=eq.' + meetingId +
'&select=meeting_id,title,workstream_id,scheduled_for,created_at,sealed_at,state,organizer_id'
```

**After:**
```javascript
'accord_meetings?meeting_id=eq.' + meetingId +
'&select=meeting_id,title,workstream_id,scheduled_for,created_at,sealed_at,state,organizer_id,briefing_text'
```

Verify by logging `meeting.briefing_text` at the top of `AccordMeetingSetup.render()` — should be `null` for new meetings, not `undefined`.

---

## §5 — Briefing column (`accord-meeting-setup.js` additions)

Phase 4 fills `.ac-setup-briefing-area`. Replace the Phase 2 `<textarea>` with a two-state render (§5.1). The autosave from Phase 2 is preserved; it now initializes with the actual `briefing_text` value.

### §5.1 — Entry point

Called from `render()` after shell HTML is written, in parallel with `_renderAgenda()`:

```javascript
function _renderBriefing(meeting, workstreamId) {
  var area = document.querySelector('.ac-setup-briefing-area');
  if (!area) return;
  if (meeting.briefing_text != null) {
    _paintBriefingEdit(area, meeting);
  } else {
    _paintBriefingDefault(area, meeting, workstreamId);
  }
}
```

### §5.2 — State A: mechanical default (`_paintBriefingDefault`)

Fetch prior meetings + last meeting node counts, then paint.

**Query 1 — prior meetings:**
```javascript
API.get(
  'accord_meetings?workstream_id=eq.' + workstreamId +
  '&meeting_id=neq.' + meeting.meeting_id +
  '&state=in.(closed,sealed)' +
  '&select=meeting_id,title,scheduled_for,sealed_at' +
  '&order=scheduled_for.desc.nullslast,created_at.desc'
)
```

If `workstreamId` is null (parking-lot meeting), skip both queries. Render:
```
"Standalone meeting — no workstream context."
```

If workstreamId non-null and no prior meetings:
```
"First meeting in this workstream. No prior context."
```

If prior meetings exist:

**Query 2 — last meeting node counts:**
```javascript
API.get(
  'accord_nodes?meeting_id=eq.' + priorMeetings[0].meeting_id +
  '&select=tag'
)
```
Count by tag client-side. Then render mechanical default text:
```
"Meeting [N+1] in [workstream name]. Last meeting: [prior.title] ([date]).
[X decisions, Y actions, Z risks] captured."
```
Where N = `priorMeetings.length`. Workstream name: use the name already resolved for the breadcrumb (pass through; do not re-fetch).

**State A HTML structure:**
```
.ac-setup-briefing-default
  .ac-setup-briefing-default-text   ← mechanical default copy (pre-formatted)
  .ac-setup-briefing-default-actions
    button.ac-setup-briefing-edit   ← "Edit briefing"
```

On "Edit briefing" click: call `_switchToEdit(area, meeting, mechanicalText)` where `mechanicalText` is the rendered string (pre-seed the textarea).

### §5.3 — State B: override textarea (`_paintBriefingEdit`)

```
.ac-setup-briefing-edit
  textarea.ac-setup-briefing-textarea   ← value = meeting.briefing_text OR mechanicalText seed
  .ac-setup-briefing-edit-actions
    button.ac-setup-briefing-reset      ← "Reset to default"
```

Autosave: debounced PATCH on textarea `input` event, 800ms, identical to Phase 2 implementation. On PATCH success: no visual feedback (background save). On PATCH failure: log only.

**"Reset to default" click:**
```javascript
API.patch('accord_meetings?meeting_id=eq.' + meeting.meeting_id, { briefing_text: null })
  .then(function() {
    meeting.briefing_text = null;
    _paintBriefingDefault(area, meeting, workstreamId);
  })
  .catch(function(e) {
    console.error('[AccordMeetingSetup] reset briefing failed', e);
  });
```

**`_switchToEdit(area, meeting, mechanicalText)`:**
1. Cancel any pending autosave debounce.
2. `_paintBriefingEdit(area, meeting)` — but with textarea pre-seeded: if `meeting.briefing_text` is null, set `textarea.value = mechanicalText`; otherwise use `meeting.briefing_text`.
3. Wire autosave on the new textarea.
4. Focus textarea.

IR71: `area` is passed as argument — not re-queried after paint. The paint function writes into `area` synchronously before any async operation touches it.

### §5.4 — Teardown addition

`teardown()` must cancel the briefing autosave debounce (separate from the Phase 2 debounce if a new timer variable is used). If the same `_saveTimer` variable covers both briefing and Phase 2 autosave, no change needed — confirm and document in close-out.

---

## §6 — Agenda polish (`accord-meeting-setup.js` + `accord-meeting-setup.css`)

### §6.1 — `pulled_from_tag` in INSERT

In `_pullNode()` (Phase 3), add `pulled_from_tag` to the INSERT body:

```javascript
API.post('accord_agenda_items', {
  firm_id:             meeting.firm_id,
  meeting_id:          meeting.meeting_id,
  title:               node.summary,
  position:            nextPosition,
  status:              '<default per Phase 3 V2 finding>',
  pulled_from_node_id: node.node_id,
  pulled_from_tag:     node.tag,        // ← Phase 4 addition
});
```

Existing pulled rows have `pulled_from_tag = NULL`. They render with a neutral `← pulled` badge (no color, no tag label). New pulls render with typed badge. No backfill.

### §6.2 — Separator in `_paintAgenda`

At paint time, split `items` into two arrays:
- `organizer_items`: `items.filter(i => !i.pulled_from_node_id)`
- `pulled_items`: `items.filter(i => !!i.pulled_from_node_id)`

Render organizer_items list, then — if both arrays are non-empty — `<hr class="ac-agenda-section-divider">`, then pulled_items list.

Position numbers continue sequentially across both groups (1, 2, 3… regardless of grouping). Reorder up/down buttons: up/down within each group only — an item at the top of the pulled group cannot be moved up into the organizer group via reorder (it was pulled; its group membership is permanent). Simplest enforcement: disable up on the first item of each group, disable down on the last item of each group.

### §6.3 — Color-coded badges

Replace the Phase 3 `← pulled` badge with a typed badge. In `_paintAgenda` item render:

```javascript
function _pulledBadge(item) {
  if (!item.pulled_from_node_id) return '';
  var tag = item.pulled_from_tag || '';
  var label = tag ? ('← ' + tag.toUpperCase()) : '← pulled';
  var cls = tag ? ('ac-agenda-pulled-badge ac-agenda-pulled-' + tag.toLowerCase()) : 'ac-agenda-pulled-badge';
  return '<span class="' + esc(cls) + '">' + esc(label) + '</span>';
}
```

CSS for typed badges (Accord palette — add to `accord-meeting-setup.css`):

```css
.ac-agenda-pulled-decision { color: var(--accord-decision, #6ba3d6); }
.ac-agenda-pulled-action   { color: var(--accord-action,   #d4a04a); }
.ac-agenda-pulled-risk     { color: var(--accord-risk,     #c97b7b); }
/* fallback for unknown tags: */
.ac-agenda-pulled-badge    { color: var(--text-muted, #888); font-size: 11px; }
```

Color values: use the existing Accord tag palette from accord-capture.js (Note/Decision/Action/Risk/Question are colored in the running-meeting UI — use the same values for consistency). Verify exact hex values from accord-capture.js or accord.css before finalizing; do not invent new values.

Also apply matching colors in the pull picker panel (`.ac-agenda-pull-tag` label per row) so the color is consistent between picker selection and the badge that appears post-insert.

---

## §7 — CSS additions (`accord-meeting-setup.css`)

Required rules beyond §6.3 badge colors:

- `.ac-setup-briefing-default` — padding; readable line-height; muted text color for the pre-formatted mechanical default text
- `.ac-setup-briefing-default-text` — `font-size: 13px`; `white-space: pre-wrap` (mechanical text may include line breaks)
- `.ac-setup-briefing-default-actions` — margin-top 12px
- `.ac-setup-briefing-edit` — flex column; gap 8px
- `.ac-setup-briefing-textarea` — min-height 120px; resize vertical; width 100%; standard Accord input style
- `.ac-setup-briefing-edit-actions` — margin-top 4px; text-align right
- `.ac-agenda-section-divider` — border-top: 1px solid `var(--surface-border, #2a2a2a)`; margin: 10px 0; no default hr border

---

## §8 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Open idle meeting with no `briefing_text` (new meeting) | Briefing column shows mechanical default text (State A). "Edit briefing" button present. |
| 2 | First meeting in workstream (no prior meetings) | Mechanical default: "First meeting in this workstream. No prior context." |
| 3 | Returning meeting (prior meetings exist) | Mechanical default shows meeting count, last meeting title + date, node counts. |
| 4 | Click "Edit briefing" | Textarea appears pre-seeded with mechanical default text. Autosave active. |
| 5 | Edit textarea + wait 800ms | PATCH fires. Reload page → textarea shows saved value (briefing_text persisted). State B on reload. |
| 6 | Click "Reset to default" | PATCH briefing_text = null. State A re-renders with mechanical default. |
| 7 | Pull a node via pull picker | Agenda item inserted; `← DECISION` / `← ACTION` badge renders in correct color. Verify `pulled_from_tag` in Supabase: `SELECT pulled_from_tag FROM accord_agenda_items WHERE meeting_id = '<id>' ORDER BY created_at DESC LIMIT 1;` |
| 8 | Mixed organizer + pulled items | Separator `<hr>` renders between groups. Reorder ▲ on top of pulled group is disabled. Reorder within each group works. |
| 9 | Parking-lot meeting (workstream_id IS NULL) | Briefing shows "Standalone meeting — no workstream context." "Edit briefing" still works. |
| 10 | `briefing_text` trigger (regression) | PATCH briefing_text on a running meeting → trigger rejects. |

---

## §9 — Files manifest

| File | Change |
|---|---|
| `accord_agenda_items` (Supabase) | `pulled_from_tag` column added |
| `accord-views.js` | `briefing_text` added to select query (1 line) |
| `accord-meeting-setup.js` | Briefing two-state render; `_pullNode` extended with `pulled_from_tag`; `_paintAgenda` separator + typed badge |
| `accord-meeting-setup.css` | Briefing styles; separator; typed badge colors |
| `version.js` | Operator-managed (IR65) |

---

## §10 — Discipline checklist

- `var` only
- IR71: `area` passed as argument to `_paintBriefingDefault` / `_paintBriefingEdit` — not re-queried after async operations
- Mechanical default queries run in parallel (`Promise.all`) — no shared-state mutation between them (read-only queries; safe for parallel fetch)
- Autosave debounce: confirm single `_saveTimer` covers all autosave paths or document separate timers; `teardown()` cancels all
- Tag colors verified against existing Accord palette from capture UI — no invented values
- `pulled_from_tag` null-safe everywhere: old pulled rows have null; badge degrades gracefully
- Style Doctrine v1.8 §3.8 — Accord palette only

---

## §11 — Phase 5 preview (not in scope)

Phase 5 = Anticipation column: firm-resources by role (Path 1 per Phase 1 §4.B disposition); prior actions live status with NRA badges (`AccordNRA.wireBadgesIn` reuse per Phase 1 §1.7). Phase 5 commission authored after Phase 4 seal.

---

**Halt-and-surface after §8. Present Phase 4 close-out before Phase 5 commission.**

---

*End Phase 4 Commission · CMD-ACCORD-MEETING-SETUP-1.*
