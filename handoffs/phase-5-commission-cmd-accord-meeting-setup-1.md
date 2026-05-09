# Phase 5 Commission · CMD-ACCORD-MEETING-SETUP-1

**Phase:** 5 — Anticipation column: attendees/resources + prior actions with NRA badges
**Authored:** 2026-05-09
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Predecessor:** Phase 4 sealed (all 10 smoke tests pass)
**Coding agent:** execute sequentially; halt-and-surface after §8

---

## §1 — Scope

**Primary:** Fill `.ac-setup-anticipation-area` with two sections:
1. **Attendees / Firm resources by role** — who is expected at this meeting
2. **Prior actions** — open action nodes from prior workstream meetings, with live NRA badges

**Out of scope this Phase:**
- Footer connected-status (Phase 7)
- Carried References (CMD-ACCORD-MEETING-ATTACHMENTS-1)
- Any write operations on attendees (read-only display in v1)

---

## §2 — Locked decisions

| Decision | Lock |
|---|---|
| Attendee source | **Path 1 (Phase 1 §4.B):** `firm_resources` table filtered by role. Read-only display. No RSVP / invite mechanic in v1. |
| Prior actions source | `accord_nodes` where `tag = '<action tag per Phase 3 V3 finding>'` from prior closed/sealed meetings in same workstream. Limit 20, ordered most-recent-meeting first. |
| NRA badge rendering | `AccordNRA.wireBadgesIn(container, lookup)` — reuse Phase 4 sealed pattern exactly. Fetch badge data via `AccordNRA.fetchBadgeData(nodeIds)`. |
| Parking-lot meeting | Both sections: "No workstream context" placeholder. No queries run. |
| Attendee display | Name + role label. No avatar. No online-status dot (that's CMD connected-status, deferred). |
| Prior actions empty state | "No prior actions in this workstream." |

---

## §3 — IR64 verification (before writing any code)

**V1 — `firm_resources` table structure:**
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'firm_resources'
ORDER BY ordinal_position;
```
Need: PK column name, name column, role column, any `is_active` or `status` filter column. Do not assume column names.

**V2 — `firm_resources` RLS posture:**
```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'firm_resources';
```
Confirm firm_resources is firm-wide readable (expected). If not, surface before proceeding.

**V3 — Action tag value (carry-forward from Phase 3 V3 finding):**
Retrieve from Phase 3 close-out. Do not re-query — use the confirmed value. If Phase 3 close-out does not document it, re-run:
```sql
SELECT DISTINCT tag FROM accord_nodes LIMIT 30;
```
and document the action tag value in this Phase's close-out.

**V4 — `AccordNRA` public API surface:**
Confirm `AccordNRA.wireBadgesIn`, `AccordNRA.fetchBadgeData`, and `AccordNRA.fetchOneBadgeData` are available on `window.AccordNRA` as shipped in CMD-ACCORD-NRA-SURFACE-1. Check `accord-nra.js` exports at the bottom of the file. Do not call internal functions.

Report all four in Phase 5 close-out.

---

## §4 — No substrate changes this Phase

No migration. No new columns. No new RLS policies. All queries use existing tables.

---

## §5 — `accord-meeting-setup.js` additions

Phase 5 fills `.ac-setup-anticipation-area`. All additions inside `accord-meeting-setup.js`.

### §5.1 — Entry point

Called from `render()` alongside `_renderAgenda()` and `_renderBriefing()`:

```javascript
function _renderAnticipation(meeting, workstreamId) {
  var area = document.querySelector('.ac-setup-anticipation-area');
  if (!area) return;
  area.innerHTML = '<div class="ac-anticipation-loading">Loading…</div>';

  if (!workstreamId) {
    area.innerHTML = '<div class="ac-anticipation-empty">No workstream context.</div>';
    return;
  }

  Promise.all([
    _fetchResources(),
    _fetchPriorActions(meeting.meeting_id, workstreamId)
  ]).then(function(results) {
    _paintAnticipation(area, results[0], results[1], meeting);
  }).catch(function(e) {
    console.error('[AccordMeetingSetup] anticipation fetch failed', e);
    area.innerHTML = '<div class="ac-anticipation-error">Could not load anticipation data.</div>';
  });
}
```

`Promise.all` is safe here: both are independent read-only queries with no shared mutation.

Abort flag: `_anticipationFetchAborted` — same pattern as `_agendaFetchAborted` from Phase 3. Set to `false` at top of `_renderAnticipation`, check immediately before `_paintAnticipation` call, set to `true` in `teardown()`.

### §5.2 — Fetch: firm resources

```javascript
function _fetchResources() {
  // Column names per V1 finding — do not hardcode until confirmed
  return API.get(
    'firm_resources?select=<pk>,<name_col>,<role_col>' +
    '&<active_filter>'   // e.g. &is_active=eq.true — use V1 finding
    + '&order=<role_col>.asc,<name_col>.asc'
  ).then(function(rows) { return rows || []; });
}
```

**Substitute actual column names from V1 finding.** Do not ship with placeholder column names.

### §5.3 — Fetch: prior actions

```javascript
function _fetchPriorActions(currentMeetingId, workstreamId) {
  return API.get(
    'accord_meetings?workstream_id=eq.' + workstreamId +
    '&meeting_id=neq.' + currentMeetingId +
    '&state=in.(closed,sealed)' +
    '&select=meeting_id' +
    '&order=scheduled_for.desc.nullslast,created_at.desc' +
    '&limit=10'
  ).then(function(meetings) {
    if (!meetings || !meetings.length) return [];
    var ids = meetings.map(function(m) { return m.meeting_id; }).join(',');
    return API.get(
      'accord_nodes?meeting_id=in.(' + ids + ')' +
      '&tag=eq.<action_tag_per_V3>' +
      '&select=node_id,summary,meeting_id,created_at' +
      '&order=created_at.desc' +
      '&limit=20'
    ).then(function(nodes) { return nodes || []; });
  });
}
```

### §5.4 — Paint

`_paintAnticipation(area, resources, actionNodes, meeting)`:

**Structure:**
```
.ac-anticipation-host
  .ac-anticipation-section
    .ac-anticipation-section-label   ← "Expected Attendees"
    .ac-anticipation-resources-list
      .ac-anticipation-resource      ← one per firm_resource row
        .ac-anticipation-resource-name   ← resource name
        .ac-anticipation-resource-role   ← role label
  .ac-anticipation-section
    .ac-anticipation-section-label   ← "Prior Actions"
    .ac-anticipation-actions-list    ← id="ac-prior-actions-list"
      .ac-anticipation-action        ← one per action node; data-node-id attr
        .ac-anticipation-action-summary  ← node.summary (truncate at 100 chars)
        .ac-nra-badge-slot               ← badge slot per AccordNRA pattern
```

**NRA badge wiring (§5.5)** fires after paint.

Empty states:
- Resources empty: `<div class="ac-anticipation-empty">No attendees on record.</div>`
- Actions empty: `<div class="ac-anticipation-empty">No prior actions in this workstream.</div>`

### §5.5 — NRA badge wiring

After `_paintAnticipation` writes the DOM:

```javascript
if (actionNodes.length && window.AccordNRA) {
  var nodeIds = actionNodes.map(function(n) { return n.node_id; });
  AccordNRA.fetchBadgeData(nodeIds).then(function(lookup) {
    var list = area.querySelector('#ac-prior-actions-list');
    if (list && !_anticipationFetchAborted) {
      AccordNRA.wireBadgesIn(list, lookup);
    }
  }).catch(function(e) {
    console.error('[AccordMeetingSetup] NRA badge fetch failed', e);
  });
}
```

IR71: `list` is re-queried from `area` after `fetchBadgeData` resolves — not captured before the async call. `_anticipationFetchAborted` guard prevents badge paint into a torn-down shell.

The `.ac-nra-badge-slot` class on each action row triggers `wireBadgesIn`'s slot-injection logic exactly as it does in accord-capture.js and accord-document.js. No new badge logic written — the sealed Phase 4 infrastructure handles it.

### §5.6 — CustomEvent listener

`accord-nra.js` dispatches `accord:nra-declared`, `accord:nra-superseded`, `accord:nra-resolved`, etc. on state changes. The prior-actions list should refresh badges on these events (an action's NRA status may change while the Setup shell is open).

Register in `render()`:

```javascript
function _onNraEvent() {
  var area = document.querySelector('.ac-setup-anticipation-area');
  var list = area && area.querySelector('#ac-prior-actions-list');
  if (!list || !window.AccordNRA) return;
  var nodeIds = Array.from(list.querySelectorAll('[data-node-id]'))
    .map(function(el) { return el.dataset.nodeId; });
  if (!nodeIds.length) return;
  AccordNRA.fetchBadgeData(nodeIds).then(function(lookup) {
    AccordNRA.wireBadgesIn(list, lookup);
  }).catch(function() {});
}

var NRA_EVENTS = [
  'accord:nra-declared','accord:nra-superseded',
  'accord:nra-resolved','accord:nra-deferred','accord:nra-waived'
];
NRA_EVENTS.forEach(function(evt) {
  window.addEventListener(evt, _onNraEvent);
});
```

Remove listeners in `teardown()`:
```javascript
NRA_EVENTS.forEach(function(evt) {
  window.removeEventListener(evt, _onNraEvent);
});
```

Store `NRA_EVENTS` as a module-level `var` so `teardown()` can reference it.

---

## §6 — CSS additions (`accord-meeting-setup.css`)

- `.ac-anticipation-host` — flex column; gap 20px
- `.ac-anticipation-section` — flex column; gap 8px
- `.ac-anticipation-section-label` — same style as `.ac-setup-col-label` (reuse class or duplicate rule with `/* same as col-label */` comment)
- `.ac-anticipation-resource` — flex row; justify-content space-between; align-items center; padding 4px 0
- `.ac-anticipation-resource-name` — `font-size: 13px`
- `.ac-anticipation-resource-role` — `font-size: 11px`; muted; `text-transform: uppercase`
- `.ac-anticipation-action` — flex row; align-items flex-start; gap 8px; padding 6px 0; border-bottom: 1px solid `var(--surface-border, #2a2a2a)`
- `.ac-anticipation-action-summary` — `font-size: 12px`; flex-grow 1
- `.ac-anticipation-empty` — `font-size: 12px`; muted; `font-style: italic`
- `.ac-anticipation-loading`, `.ac-anticipation-error` — `font-size: 12px`; muted

NRA badge slot renders via existing `.ac-nra-badge-slot` rules from `accord-nra.css` — no new badge styles needed.

---

## §7 — Teardown additions

`teardown()` must:
1. Set `_anticipationFetchAborted = true`
2. Remove all NRA event listeners (§5.6)
3. (Existing) cancel `_saveTimer`, clear `_agendaFetchAborted`, clear detach hook

Document in close-out whether a single `teardown()` call handles all of these atomically.

---

## §8 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Open idle meeting in workstream with firm resources | Anticipation column: "Expected Attendees" section lists resources by role. "Prior Actions" section renders (may be empty if no prior meetings). |
| 2 | Open idle meeting in workstream with prior action nodes | Prior actions list renders with summaries. NRA badge slots present on each row. Badges populate (declared / grandfathered / etc.) per live NRA state. |
| 3 | Declare NRA on a prior action node (in another surface) | `accord:nra-declared` fires → Setup shell's prior-actions list badge refreshes without page reload. |
| 4 | Parking-lot meeting (workstream_id IS NULL) | Anticipation column: "No workstream context." No resource or action queries run (confirm via DevTools Network: no `firm_resources` or `accord_nodes` fetch). |
| 5 | Resources empty (no firm_resources rows in firm) | "No attendees on record." placeholder. No JS error. |
| 6 | Prior actions empty (no prior closed/sealed meetings) | "No prior actions in this workstream." placeholder. No JS error. |
| 7 | Ascend to constellation while Anticipation is loading | `_anticipationFetchAborted = true` in teardown. Fetch resolves but `_paintAnticipation` returns without writing. No console error. No stale DOM. |
| 8 | AccordNRA not yet loaded (race: Setup renders before accord-nra.js initializes) | `window.AccordNRA` check in §5.5 guards gracefully — no badge wiring attempted; no error. Badges render as empty slots. |

---

## §9 — Files manifest

| File | Change |
|---|---|
| `accord-meeting-setup.js` | Anticipation render/fetch/paint; NRA badge wiring; event listeners; teardown extensions |
| `accord-meeting-setup.css` | Anticipation section + resource + action styles |
| `accord-views.js` | No changes |
| `accord-transitions.js` | No changes |
| `version.js` | Operator-managed (IR65) |

---

## §10 — Discipline checklist

- `var` only
- IR71: `list` re-queried after `fetchBadgeData` resolves (§5.5); `area` re-queried in `_onNraEvent` (§5.6) — no stale references
- `Promise.all` safe: both fetches in §5.1 are independent reads — explicitly documented
- `_anticipationFetchAborted` flag: set false at top of `_renderAnticipation`, true in `teardown()`, checked before `_paintAnticipation` and before `wireBadgesIn` in badge callback
- NRA event listeners registered in `render()`, removed in `teardown()` — no listener leak across mount/unmount cycles
- V1 column names used verbatim — no assumed names in `_fetchResources` query
- V3 action tag value used verbatim — confirmed from Phase 3 close-out or re-queried
- `AccordNRA.wireBadgesIn` and `AccordNRA.fetchBadgeData` called via `window.AccordNRA` — not internal import
- Style Doctrine v1.8 §3.8 — Accord palette only

---

## §11 — Doctrine note for close-out

The null-guard pattern on `_enableComposerForState` / `_refreshTimer` / `_setMeetingHeader` (Phase 4 agent item 3) is now at **4 data points** on the lifecycle-ordering/mount-before-fire doctrine candidate. Include in Phase 5 close-out as an IR ratification candidate with the following candidate text:

*"Functions that access DOM elements by ID or selector must null-guard the element reference before any read or write. Functions that fire on lifecycle events (level-changed, tab-switched, heartbeat) may be called before the target surface is mounted. A missing null-guard on an element that may not yet exist is a silent-failure footgun. Pattern: `var el = document.getElementById('x'); if (!el) return;` at the top of any such function."*

Flag for Operator ratification as a candidate Iron Rule. Cross-CMD survival beyond MEETING-SETUP chain required before promotion to canon.

---

## §12 — Phase 6 preview (not in scope)

Phase 6 = Filmstrip column: prior meeting thumbnails (title, date, node-count summary) as a horizontal scrollable strip. Read-only. Substrate: existing `accord_meetings`. No new columns. Phase 6 commission authored after Phase 5 seal.

---

**Halt-and-surface after §8. Include IR64 V1–V4 findings and doctrine note (§11) in Phase 5 close-out.**

---

*End Phase 5 Commission · CMD-ACCORD-MEETING-SETUP-1.*
