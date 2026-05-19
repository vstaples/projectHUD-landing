# HANDOFF — CMD-ACCORD-KNOWLEDGE-BASE-1 · Phase 3: Discipline/Topic Hierarchy

**Date:** 2026-05-19
**CMD:** K-01 · CMD-ACCORD-KNOWLEDGE-BASE-1
**Operator:** Vaughn Staples
**Phase:** 3 of 5 — Full hierarchical canvas with live data.

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-KNOWLEDGE-BASE-1.md` end-to-end before proceeding.
Read Phase 1 and Phase 2 findings in full.
Session protocol: terse mode; Test Mode after each code update.
Iron Rules 36, 40 §1, 47, 64, 71 apply.
`var` only. No `setTimeout` for sequencing. Deliver §6 then §7. Stop.

---

## §1 — CARRY-FORWARD

**Phase 1 confirmed:**
- `accord_nodes.discipline` and `accord_nodes.topic` — TEXT, nullable
- `accord_nodes.status` values: `fresh` and `committed` only (no `'deleted'`)
- Filter: `state IN ('closed', 'sealed')` for meetings

**Phase 2 confirmed:**
- Live counts from 10 meetings: 15 decisions · 28 actions · 8 risks · 29 notes
- `_renderContent(shell, wsName, meetings, nodes)` is the render entry point
- Canvas currently shows placeholder — Phase 3 replaces it
- Meeting IDs are already loaded in `meetings` array
- Node `tag` and `status` are already loaded in `nodes` array for stats
- Phase 3 needs the FULL node payload (discipline, topic, summary, seq_id,
  created_by, created_at, meeting_id, due_date, body) — new query

---

## §2 — INPUTS

| File | Purpose |
|------|---------|
| `accord-knowledge-base.js` | Phase 2 output — extend canvas section |

---

## §3 — DELIVERABLES

1. `accord-knowledge-base.js` — canvas section replaced with live hierarchy

Operator review checkpoint before Phase 4.

---

## §4 — BUILD SPEC

### 4.1 — Full node load

Replace the Phase 2 stats-only node query with a full payload query.
Make one API call — do not query nodes separately from meetings.

```javascript
// After loading meetings, load full nodes for those meetings:
API.get(
  'accord_nodes' +
  '?meeting_id=in.(' + ids + ')' +
  '&select=node_id,seq_id,tag,summary,discipline,topic,' +
  'created_by,created_at,meeting_id,due_date,status,body' +
  '&order=created_at.asc'
)
```

Filter out deleted nodes: `nodes.filter(function(n){ return n.status !== 'deleted'; })`

After loading nodes, resolve author names:
```javascript
// Collect unique created_by values
// API.get('resources?id=in.([ids])&select=id,name')
// Build nameMap: { resource_id → name }
```

Note: `created_by` on `accord_nodes` is `auth.users(id)` NOT `resources.id`
(confirmed C-04). Use `resources?user_id=in.(...)` if a `user_id` column exists
on resources, otherwise fall back to displaying the raw ID truncated to 8 chars.
**IR47:** Confirm `resources.user_id` column exists before querying it.
If absent, skip name resolution and show truncated ID. Surface finding in delivery.

---

### 4.2 — Client-side grouping

Group nodes into a nested structure:

```javascript
// _groupNodes(nodes, meetings) → disciplineMap
// disciplineMap: {
//   [discipline || '__ungrouped__']: {
//     label: 'Electrical Engineering' | 'Ungrouped',
//     topics: {
//       [topic || '__ungrouped__']: {
//         label: 'Adapter Board Thermal Constraints' | 'Ungrouped',
//         entries: [node, ...]
//       }
//     }
//   }
// }
```

Sort disciplines: named disciplines alphabetically, `__ungrouped__` always last.
Sort topics within each discipline: same rule.
Sort entries within each topic: `created_at` ASC.

Build a `meetingTitleMap`: `{ meeting_id → title }` from the meetings array.

---

### 4.3 — Discipline block rendering

Replace the canvas placeholder with discipline blocks.

**Discipline left border colors:**
```javascript
var DISC_COLORS = {
  'Electrical Engineering': 'var(--dec)',
  'Mechanical Engineering': 'var(--act)',
  'Software Integration':   'var(--nt)',
  'Vendor Management':      'var(--dcn)',
  '__ungrouped__':          'var(--b2)'
};
// Any unrecognized discipline → 'var(--md)'
```

**Discipline block structure:**
```
[collapsed ▶ / expanded ▼ — 10px]  [Discipline name]
    [N topics chip]  [N entries chip]  [last: date chip]
```

Block CSS:
```css
.ac-kb-disc-block {
  border: 1px solid var(--b0);
  border-radius: 7px;
  overflow: hidden;
  margin-bottom: 12px;
}
.ac-kb-disc-row {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 20px 11px 16px;
  background: var(--surface);
  cursor: pointer; user-select: none;
  border-bottom: 1px solid var(--b0);
  border-left: 4px solid [discipline color];
  transition: background .12s;
  position: sticky; top: 0; z-index: 5;
}
.ac-kb-disc-row:hover { background: var(--hover); }
.ac-kb-disc-name {
  font-size: 14px; font-weight: 600; color: var(--hi); flex: 1;
}
.ac-kb-disc-chip {
  font-size: 11px; padding: 2px 9px; border-radius: 10px;
  background: var(--raised); color: var(--lo);
  border: 1px solid var(--b0);
}
.ac-kb-disc-chevron {
  font-size: 10px; color: var(--md); flex-shrink: 0;
  transition: transform .2s;
}
.ac-kb-disc-chevron.collapsed { transform: rotate(-90deg); }
```

---

### 4.4 — Topic row rendering

Within each expanded discipline block:

```
[▶/▼ 9px]  [Topic name]    [N entries]  [last: date]  [N meetings]
```

```css
.ac-kb-topic-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 28px 8px 20px;
  cursor: pointer; user-select: none;
  border-left: 3px solid transparent;
  transition: background .12s, border-color .12s;
  border-bottom: 1px solid rgba(255,255,255,.04);
}
.ac-kb-topic-row:hover {
  background: var(--raised);
  border-left-color: var(--b2);
}
.ac-kb-topic-name {
  font-size: 13px; font-weight: 600; color: var(--hi); flex: 1;
}
.ac-kb-topic-meta {
  font-size: 11px; color: var(--lo);
}
.ac-kb-topic-chevron {
  font-size: 9px; color: var(--md);
  transition: transform .2s;
}
.ac-kb-topic-chevron.collapsed { transform: rotate(-90deg); }
```

---

### 4.5 — Entry list rendering

Within each expanded topic — the left bracket (§4.6) wraps these rows.

Each entry:
```
[date]  [badge]  [summary]
                 [author]  [meeting chip]
```

```css
.ac-kb-entry-list {
  padding: 0 28px 10px 50px;
  border-left: 3px solid [discipline color at .40 opacity];
  margin-left: 24px;
  border-radius: 6px 0 0 6px;
}
.ac-kb-entry {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid rgba(255,255,255,.04);
}
.ac-kb-entry:last-child { border-bottom: none; }
.ac-kb-entry-date {
  font-size: 12px; color: var(--md); flex-shrink: 0;
  min-width: 48px; padding-top: 2px; white-space: nowrap;
}
.ac-kb-entry-badge {
  font-size: 10px; font-weight: 700;
  padding: 0 5px; border-radius: 2px;
  border: 1px solid; white-space: nowrap;
  margin-top: 2px; line-height: 1.4; flex-shrink: 0;
}
.ac-kb-entry-body { flex: 1; min-width: 0; }
.ac-kb-entry-text {
  font-size: 13px; color: var(--hi); line-height: 1.5;
}
.ac-kb-entry-meta {
  display: flex; align-items: center; gap: 8px; margin-top: 3px;
}
.ac-kb-entry-author { font-size: 11px; color: var(--lo); }
.ac-kb-entry-mtg {
  font-size: 11px; color: var(--lo);
  padding: 1px 7px; border-radius: 10px;
  background: rgba(255,255,255,.04);
  border: 1px solid var(--b0);
}
```

**Badge colors by tag:**
```javascript
var TAG_COLORS = {
  decision: { color:'var(--dcn)', bg:'var(--dcn-bg)', bd:'var(--dcn-bd)' },
  note:     { color:'var(--nt)',  bg:'var(--nt-bg)',  bd:'var(--nt-bd)'  },
  action:   { color:'var(--act)', bg:'var(--act-bg)', bd:'var(--act-bd)' },
  risk:     { color:'var(--rsk)', bg:'var(--rsk-bg)', bd:'var(--rsk-bd)' },
  dissent:  { color:'var(--rsk)', bg:'var(--rsk-bg)', bd:'var(--rsk-bd)' },
  question: { color:'var(--dcn)', bg:'var(--dcn-bg)', bd:'var(--dcn-bd)' }
};
```

Entry date: format as `May 17` (month + day only, no year unless different year).

---

### 4.6 — Entry list left bracket

The entry list uses a left border that curves at top-left and bottom-left corners,
matching the mockup bracket style:

```css
.ac-kb-entry-list {
  border-left: 3px solid [discipline color at .40 opacity];
  border-radius: 6px 0 0 6px;
  /* No top or bottom border — left only */
}
```

Discipline color opacity mapping:
```javascript
var DISC_BORDER_COLORS = {
  'Electrical Engineering': 'rgba(74,140,245,.40)',
  'Mechanical Engineering': 'rgba(232,148,48,.40)',
  'Software Integration':   'rgba(72,170,136,.40)',
  'Vendor Management':      'rgba(139,110,245,.40)',
  '__ungrouped__':          'rgba(255,255,255,.12)'
};
```

---

### 4.7 — Collapse/expand wiring

Each discipline block and topic row toggles independently.
Store collapsed state in a plain object keyed by discipline/topic name:
```javascript
var _discCollapsed  = {};  // { disciplineName: true|false }
var _topicCollapsed = {};  // { 'disciplineName::topicName': true|false }
```

Default: all disciplines **expanded**, all topics **expanded**.

On click of `.ac-kb-disc-row`: toggle `_discCollapsed[disc]`, re-render that block.
On click of `.ac-kb-topic-row`: toggle `_topicCollapsed[key]`, re-render that topic.

Use event delegation on the canvas element — one listener, check `closest()`.

---

### 4.8 — Workstream name resolution

Phase 2 reads workstream name from `host.querySelector('.ac-view-title')`.
This is fragile — if the title element changes class, it breaks.
Keep this approach for Phase 3 (it worked in Phase 2). Flag as tech debt.

---

## §5 — IRON RULE REMINDERS

**IR47:** Confirm `resources.user_id` column before querying.
If absent, show truncated `created_by` ID. Surface explicitly in delivery.

**IR71:** No DOM mutation before API call confirms. Collapse state is
client-side only — no server round-trip needed.

**`var` only** — no `let`/`const`.

---

## §6 — FILE ORDER

1. `accord-knowledge-base.js` — full file with hierarchy canvas

Then: operator review note.
Then: §7 checklist verbatim. Stop.

---

## §7 — PHASE 3 CHECKLIST

- [ ] IR47: `resources.user_id` column confirmed or absent — surfaced in delivery
- [ ] Full node payload loaded (seq_id, discipline, topic, summary, created_by, etc.)
- [ ] Nodes grouped client-side by discipline → topic
- [ ] Unnamed discipline nodes appear in Ungrouped block at bottom
- [ ] Discipline blocks render with correct colored left border (4px)
- [ ] Discipline block collapses/expands with 10px chevron
- [ ] Topic rows render within each discipline
- [ ] Topic rows collapse/expand with 9px chevron
- [ ] Entry rows: date · badge · summary · author · meeting chip
- [ ] Badge colors correct per tag type
- [ ] Entry list left bracket: 3px, .40 opacity, discipline color, border-radius
- [ ] Meeting chip shows meeting title (truncated if long)
- [ ] Author name resolves or falls back to truncated ID
- [ ] Collapse state persists across re-renders within session
- [ ] Canvas scrolls correctly with sticky discipline headers
- [ ] Phase 2 header, stats, filter pills, status bar unchanged
- [ ] `var` only — no `let`/`const`

---

**Ship it.**
