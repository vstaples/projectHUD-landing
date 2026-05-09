# Phase 3 Commission · CMD-ACCORD-MEETING-SETUP-1

**Phase:** 3 — Agenda column: render, add-item, reorder, pull-as-thread
**Authored:** 2026-05-09
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Predecessor:** Phase 2 sealed (all 7 smoke tests pass)
**Coding agent:** execute sequentially; halt-and-surface after §8

---

## §1 — Locked decisions (carry-forward + new)

| Decision | Lock |
|---|---|
| Agenda substrate | `accord_agenda_items` — confirmed in use by accord-capture.js (Live Capture). Phase 3 reads/writes this table; no schema conflict with running-meeting use. |
| Pull-as-thread substrate | **Path β (Phase 1 §4.G):** nullable FK `pulled_from_node_id` on `accord_agenda_items`. One column add; sub-amendment this Phase. |
| NRA-shape inference | **Deferred to Phase 4.** Phase 3 Agenda renders plain items only. No inference labels in v1 Agenda. |
| Reorder mechanism | Up/down chevron buttons per item (not drag-to-reorder). PATCH `position` on affected rows. Simpler; drag deferred. |
| Pull-as-thread affordance | Inline picker below add-item row (not a full modal). Lists recent action + decision nodes from prior sealed/closed meetings in same workstream. Hidden when `workstream_id IS NULL`. |
| Module boundary | Agenda logic extends `accord-meeting-setup.js`. No new file. |
| `accord-transitions.js` | No changes. |

---

## §2 — IR64 verification items (resolve before writing any agenda code)

These are unknowns from Phase 1 not yet confirmed. Verify in Supabase SQL editor before coding.

**V1 — `accord_agenda_items` PK name:**
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'accord_agenda_items'
ORDER BY ordinal_position;
```
Expected: PK is `agenda_item_id UUID DEFAULT gen_random_uuid()`. Confirm exact name — do not assume.

**V2 — `accord_agenda_items.status` values:**
From the same query above, note the `status` column type. Then:
```sql
SELECT DISTINCT status FROM accord_agenda_items LIMIT 20;
```
Need the valid values for INSERT default and any CHECK constraint. Likely `pending | discussed | skipped` or similar — do not guess.

**V3 — `accord_nodes` tag values for pull-as-thread source:**
```sql
SELECT DISTINCT tag FROM accord_nodes LIMIT 30;
```
Pull-as-thread surfaces action and dissent nodes. Confirm the exact tag values used for these in production (Phase 1 §1.5 references `accord_nodes.tag` but doesn't enumerate). The filter in the picker query depends on this.

**V4 — `accord_agenda_items` RLS posture:**
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'accord_agenda_items';
```
Need to confirm INSERT + UPDATE policies allow writes from the organizer (and ideally any firm member — agenda staging is collaborative). If RLS is missing or too restrictive, surface before Phase 3 UI wires up.

Report all four findings in the Phase 3 close-out. If V4 reveals a gap blocking writes, halt and surface before completing the agenda UI.

---

## §3 — Substrate sub-amendment (deploy before UI)

```sql
-- Migration: 2026-05-09_accord_agenda_items_pulled_from.sql
-- CMD-ACCORD-MEETING-SETUP-1 Phase 3

ALTER TABLE accord_agenda_items
  ADD COLUMN pulled_from_node_id UUID NULL
  REFERENCES accord_nodes(node_id) ON DELETE SET NULL;

COMMENT ON COLUMN accord_agenda_items.pulled_from_node_id IS
  'If this agenda item was pulled from a prior meeting node (pull-as-thread), '
  'references the source accord_nodes row. NULL for items created directly. '
  'CMD-ACCORD-MEETING-SETUP-1 Phase 3.';
```

**Verification:**
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'accord_agenda_items'
  AND column_name = 'pulled_from_node_id';
```

Do not proceed to UI until this returns one row.

---

## §4 — `accord-views.js` — no changes this Phase

The state branch added in Phase 2 covers Phase 3 without modification. Phase 3 work is entirely inside `accord-meeting-setup.js` and the Agenda column placeholder.

---

## §5 — `accord-meeting-setup.js` additions

Phase 3 fills the `.ac-setup-agenda-area` placeholder. All additions are inside `accord-meeting-setup.js`. No new files.

### §5.1 — Agenda render entry point

Called from `render()` after the shell HTML is written:

```javascript
function _renderAgenda(meeting, workstreamId) {
  var area = document.querySelector('.ac-setup-agenda-area');
  if (!area) return;
  area.innerHTML = '<div class="ac-agenda-loading">Loading…</div>';
  _fetchAgendaItems(meeting.meeting_id)
    .then(function(items) {
      _paintAgenda(area, items, meeting, workstreamId);
    })
    .catch(function(e) {
      console.error('[AccordMeetingSetup] agenda fetch failed', e);
      area.innerHTML = '<div class="ac-agenda-error">Could not load agenda.</div>';
    });
}
```

### §5.2 — Fetch

```javascript
function _fetchAgendaItems(meetingId) {
  return API.get(
    'accord_agenda_items?meeting_id=eq.' + meetingId +
    '&order=position.asc,created_at.asc' +
    '&select=*'
  ).then(function(rows) { return rows || []; });
}
```

### §5.3 — Paint

`_paintAgenda(area, items, meeting, workstreamId)`:

1. Renders the item list (see §5.4).
2. Renders the add-item row below the list (see §5.5).
3. Renders the pull-as-thread affordance below add-item, if `workstreamId` is non-null (see §5.6).
4. Wires all event handlers via event delegation on `area`.

### §5.4 — Item list

Each item row:

```
.ac-agenda-item[data-item-id="<agenda_item_id>"]
  .ac-agenda-item-pos        ← position number (1, 2, 3…)
  .ac-agenda-item-title      ← item.title (text node; editable inline — see §5.4.1)
  .ac-agenda-item-controls
    button.ac-agenda-up      ← ▲ (data-action="up")
    button.ac-agenda-down    ← ▼ (data-action="down")
    .ac-agenda-pulled-badge  ← "← pulled" label, only if item.pulled_from_node_id IS NOT NULL
```

First item: up button disabled. Last item: down button disabled.

**§5.4.1 — Inline title edit:** clicking the title text makes it a contenteditable span. On blur or Enter key: PATCH `accord_agenda_items?agenda_item_id=eq.<id>` with `{ title: <new value> }`. On Escape: revert. Empty title on blur: revert to previous value (do not PATCH empty string).

**§5.4.2 — Reorder:** up/down buttons fire `_reorderItem(itemId, direction, items, meeting, workstreamId)`.

Reorder logic: swap `position` values of the target item and its neighbor. Two PATCHes:
```javascript
API.patch('accord_agenda_items?agenda_item_id=eq.' + idA, { position: posB });
API.patch('accord_agenda_items?agenda_item_id=eq.' + idB, { position: posA });
```
After both resolve (sequential, not `Promise.all` — avoid shared-state race per IR antipattern), re-fetch and re-paint. If either PATCH fails, log error and re-fetch to restore consistent state.

### §5.5 — Add-item row

Below the item list:

```
.ac-agenda-add-row
  input.ac-agenda-add-input[type="text"][placeholder="Add agenda item…"]
  button.ac-agenda-add-btn   ← "+"
```

On submit (button click OR Enter in input):
1. Read `input.value.trim()`. If empty, no-op.
2. Compute `position`: `items.length + 1` (append).
3. INSERT:
   ```javascript
   API.post('accord_agenda_items', {
     firm_id:   meeting.firm_id,
     meeting_id: meeting.meeting_id,
     title:     title,
     position:  nextPosition,
     status:    '<default per V2 finding>',
   });
   ```
4. Clear input. Re-fetch and re-paint.

`firm_id` source: `meeting.firm_id`. If not present on the meeting object fetched by Phase 2's `select=*`, add `firm_id` to the select. Verify meeting object has `firm_id` before coding the INSERT.

### §5.6 — Pull-as-thread affordance

Shown only when `workstreamId IS NOT NULL`.

```
.ac-agenda-pull-row
  button.ac-agenda-pull-btn  ← "← Pull from prior meeting"
```

On click: `_openPullPicker(meeting, workstreamId, area)`.

**`_openPullPicker`:**

1. Fetch prior meetings in workstream:
   ```javascript
   API.get(
     'accord_meetings?workstream_id=eq.' + workstreamId +
     '&meeting_id=neq.' + meeting.meeting_id +
     '&state=in.(closed,sealed)' +
     '&select=meeting_id,title,sealed_at,scheduled_for' +
     '&order=scheduled_for.desc.nullslast,created_at.desc' +
     '&limit=8'
   )
   ```

2. If no prior meetings: replace picker area with `"No prior meetings in this workstream."` for 2s, then restore button.

3. If prior meetings: fetch action + decision nodes from those meetings (use the tag values confirmed in V3):
   ```javascript
   API.get(
     'accord_nodes?meeting_id=in.(' + priorIds.join(',') + ')' +
     '&tag=in.(<V3 values>)' +
     '&select=node_id,summary,tag,meeting_id,created_at' +
     '&order=created_at.desc' +
     '&limit=30'
   )
   ```

4. Render inline picker panel `.ac-agenda-pull-panel` replacing the pull-row:
   ```
   .ac-agenda-pull-panel
     .ac-agenda-pull-header  ← "Pull from prior meeting" + [✕ close]
     .ac-agenda-pull-list
       .ac-agenda-pull-node[data-node-id="…"][data-summary="…"]
         .ac-agenda-pull-tag   ← tag label (ACTION / DECISION)
         .ac-agenda-pull-text  ← node.summary (truncated at 120 chars)
         .ac-agenda-pull-meta  ← meeting title + date
   ```

5. On node row click: `_pullNode(node, meeting, workstreamId)`.

6. On ✕ close: restore pull-row button.

**`_pullNode(node, meeting, workstreamId)`:**

```javascript
API.post('accord_agenda_items', {
  firm_id:             meeting.firm_id,
  meeting_id:          meeting.meeting_id,
  title:               node.summary,       // pre-populated from node summary
  position:            nextPosition,        // append
  status:              '<default per V2>',
  pulled_from_node_id: node.node_id,
});
```

On success: close picker, re-fetch and re-paint agenda. The inserted row renders with the `← pulled` badge.

---

## §6 — CSS additions (`accord-meeting-setup.css`)

Extend the existing file. Accord palette only.

Required rules (minimum):

- `.ac-agenda-item` — flex row; align-items center; gap 8px; padding 6px 0; border-bottom: 1px solid `var(--surface-border, #2a2a2a)`
- `.ac-agenda-item-title` — flex-grow 1; font-size 13px; cursor text
- `.ac-agenda-item-title[contenteditable="true"]` — outline + background indicating edit mode
- `.ac-agenda-item-controls` — flex row; gap 4px; flex-shrink 0
- `.ac-agenda-up`, `.ac-agenda-down` — small icon buttons; `:disabled` opacity 0.3
- `.ac-agenda-pulled-badge` — small inline label; muted text; `font-size: 11px`
- `.ac-agenda-add-row` — flex row; gap 8px; margin-top 12px
- `.ac-agenda-add-input` — flex-grow 1; standard input style per existing Accord form conventions
- `.ac-agenda-pull-row` — margin-top 8px
- `.ac-agenda-pull-panel` — border; padding 8px; background `var(--surface-raised, #1e1e1e)`; max-height 240px; overflow-y auto
- `.ac-agenda-pull-node` — flex column; padding 6px 8px; cursor pointer; `:hover` background highlight
- `.ac-agenda-pull-tag` — uppercase; `font-size: 10px`; muted
- `.ac-agenda-pull-text` — `font-size: 12px`
- `.ac-agenda-pull-meta` — `font-size: 11px`; muted

---

## §7 — `accord-meeting-setup.css` — teardown addition

`teardown()` already cancels the debounce timer. Add agenda teardown: null out any in-flight fetch reference so a slow fetch resolving after teardown doesn't paint into a dead container:

```javascript
// In teardown():
_agendaFetchAborted = true;
```

Set `_agendaFetchAborted = false` at the top of `_renderAgenda`. Check `if (_agendaFetchAborted) return;` immediately before `_paintAgenda` is called. This is a module-level flag (not a closure), so it works across re-renders.

---

## §8 — Smoke tests

All 8 must pass. Tests 1–7 from Phase 2 implicitly still pass (no regression check needed unless Begin Meeting or shell layout appears broken).

| # | Test | Expected |
|---|---|---|
| 1 | Open idle meeting — Agenda column loads | Item list renders (may be empty). Add-item row visible. Pull-from affordance visible (workstream meeting) or hidden (parking-lot). |
| 2 | Add agenda item via input + Enter | Item appears in list at bottom; position number correct; input cleared. |
| 3 | Add agenda item via "+" button | Same as Test 2. |
| 4 | Reorder via ▲ / ▼ | Items swap positions in UI; PATCH fires; re-fetched order matches. First item has ▲ disabled; last item has ▼ disabled. |
| 5 | Inline title edit — blur saves | PATCH fires with new title; item re-renders with saved value. |
| 6 | Inline title edit — Escape reverts | No PATCH; original title restored. |
| 7 | Pull picker opens — lists prior nodes | Picker panel renders with action/decision nodes from prior workstream meetings. Each row shows tag, summary, meeting provenance. |
| 8 | Select a node from picker | Agenda item inserted with `pulled_from_node_id` populated; `← pulled` badge renders; picker closes. Verify in Supabase: `SELECT pulled_from_node_id FROM accord_agenda_items WHERE meeting_id = '<id>' ORDER BY position DESC LIMIT 1;` — should return the node_id selected. |

**Test 8 substrate verification:** after selecting a node, confirm `pulled_from_node_id IS NOT NULL` in the inserted row.

---

## §9 — Files manifest (anticipated)

| File | Change |
|---|---|
| `accord_agenda_items` (Supabase) | `pulled_from_node_id` column added |
| `accord-meeting-setup.js` | Agenda render/fetch/paint/add/reorder/pull logic added |
| `accord-meeting-setup.css` | Agenda item + picker + add-row styles added |
| `accord-views.js` | No changes |
| `accord-transitions.js` | No changes |
| `version.js` | Operator-managed (IR65) |

---

## §10 — Discipline checklist

- `var` only — no `let`/`const`
- Sequential PATCHes for reorder — not `Promise.all` (shared-state race antipattern; IR doctrine candidate)
- Abort flag pattern (`_agendaFetchAborted`) for teardown safety
- `pulled_from_node_id` populated from `node.node_id` exactly — do not coerce
- Tag filter in picker query populated from **V3 finding** — do not hardcode until confirmed
- `status` default in INSERT populated from **V2 finding** — do not hardcode until confirmed
- `firm_id` on INSERT populated from `meeting.firm_id` — verify this field is present on the meeting object; if not, add to select query
- Style Doctrine v1.8 §3.8 — Accord palette only; no new tokens invented
- IR71: re-fetch + re-paint is the mutation pattern; no in-place DOM mutation after PATCHes
- IR64 V1–V4 findings documented in close-out

---

## §11 — Phase 4 preview (not in scope)

Phase 4 = Briefing column: mechanical default text (meeting count, last outcome, prior overdue actions) + `briefing_text` write path. Also: `briefing_text` addition to `renderMeetingView` select query (Phase 2 close-out open item). Phase 4 commission authored after Phase 3 seal.

---

**Halt-and-surface after §8. Present IR64 findings (V1–V4) + smoke results in Phase 3 close-out before Phase 4 commission.**

---

*End Phase 3 Commission · CMD-ACCORD-MEETING-SETUP-1.*
