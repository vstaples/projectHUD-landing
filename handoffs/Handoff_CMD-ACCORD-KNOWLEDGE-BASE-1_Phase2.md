# HANDOFF — CMD-ACCORD-KNOWLEDGE-BASE-1 · Phase 2: Shell + Tab Wiring + Header

**Date:** 2026-05-19
**CMD:** K-01 · CMD-ACCORD-KNOWLEDGE-BASE-1
**Operator:** Vaughn Staples
**Phase:** 2 of 5 — KB tab appears. Header and stats render.

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-KNOWLEDGE-BASE-1.md` end-to-end before proceeding.
Read Phase 1 findings in full — carry forward entirely.
Session protocol: terse mode; Test Mode after each code update.
Iron Rules 36, 40 §1, 47, 64, 71, 72 apply.
`var` only. No `setTimeout` for sequencing. Deliver in §6 file order then §7. Stop.

---

## §1 — PHASE 1 CARRY-FORWARD

**Injection point:** gap between `</header>` (line 124) and
`<div class="ac-view-body">` (line 126) in `renderWorkstreamView`.

**Reactive wipe trap:** `_reactiveRerender()` listens for filing events and
calls `renderWorkstreamView()` → `host.innerHTML = html`, destroying the KB
canvas. Phase 2 must track active tab in a module-level variable
(`_activeTab = 'meetings' | 'kb'`) and re-mount the KB canvas if it was active
when a reactive re-render fires.

**`accord_nodes.status` values:** `fresh` and `committed` only — no `'deleted'`.
Filter query: `WHERE (n.status IS NULL OR n.status != 'deleted')` — safe no-op guard.

**`accord_meetings.state` for KB:** use `state IN ('closed', 'sealed')`.
Do NOT use `state != 'running'` — idle/draft meetings should not contribute.

**No resource resolution pattern in `accord-views.js`** — KB module must
implement its own `resources?id=in.(...)` query for author name resolution.
Defer author resolution to Phase 3 (entry rows). This phase only needs
workstream name (already in the view context) and meeting titles.

---

## §2 — INPUTS

| File | Purpose |
|------|---------|
| `accord-views.js` | Injection point at renderWorkstreamView lines 124–192 |

---

## §3 — DELIVERABLES

1. `accord-knowledge-base.js` — new module (shell + header + stats + status bar)
2. `accord-views.js` — tab bar injection + reactive re-render guard (diff only)

Operator review checkpoint before Phase 3.

---

## §4 — BUILD SPEC

### 4.1 — `accord-views.js` changes

**Tab bar injection** — in `renderWorkstreamView`, after the `</header>` string
and before `<div class="ac-view-body">`, insert:

```javascript
'<div class="ac-ws-tabs" id="ac-ws-tabs">' +
  '<div class="ac-ws-tab active" data-tab="meetings">Meetings</div>' +
  '<div class="ac-ws-tab" data-tab="kb">Knowledge Base</div>' +
'</div>' +
```

After `host.innerHTML = html`, wire tab clicks:

```javascript
var _wsTabMeetings = host.querySelector('[data-tab="meetings"]');
var _wsTabKb       = host.querySelector('[data-tab="kb"]');
var _wsViewBody    = host.querySelector('.ac-view-body');
if (_wsTabMeetings && _wsTabKb) {
  _wsTabMeetings.addEventListener('click', function() {
    _wsTabMeetings.classList.add('active');
    _wsTabKb.classList.remove('active');
    _wsViewBody.style.display = '';
    AccordKnowledgeBase.destroy();
    AccordKnowledgeBase._activeTab = 'meetings';
  });
  _wsTabKb.addEventListener('click', function() {
    _wsTabKb.classList.add('active');
    _wsTabMeetings.classList.remove('active');
    _wsViewBody.style.display = 'none';
    AccordKnowledgeBase.render(workstreamId, host);
    AccordKnowledgeBase._activeTab = 'kb';
  });
}
```

**Reactive re-render guard** — in `_reactiveRerender()`, after
`renderWorkstreamView(host, ...)` is called, add:

```javascript
// Restore KB tab if it was active before re-render
if (AccordKnowledgeBase && AccordKnowledgeBase._activeTab === 'kb') {
  var kbTab = host.querySelector('[data-tab="kb"]');
  var mtgTab = host.querySelector('[data-tab="meetings"]');
  var vb = host.querySelector('.ac-view-body');
  if (kbTab) kbTab.classList.add('active');
  if (mtgTab) mtgTab.classList.remove('active');
  if (vb) vb.style.display = 'none';
  AccordKnowledgeBase.render(workstreamId, host);
}
```

**Tab CSS** (inject into `<head>` once, or add to accord-views inline styles):
```css
.ac-ws-tabs {
  display: flex; align-items: stretch;
  background: var(--surface, #10131e);
  border-bottom: 2px solid var(--b0, #1e2438);
  padding: 0 22px; flex-shrink: 0;
}
.ac-ws-tab {
  font-size: 13px; font-weight: 600; padding: 10px 18px;
  cursor: pointer; color: var(--md, #8899b2);
  border-bottom: 2px solid transparent; margin-bottom: -2px;
  transition: all .13s; user-select: none;
}
.ac-ws-tab:hover { color: var(--hi, #dce6f5); }
.ac-ws-tab.active { color: var(--hi, #dce6f5);
  border-bottom-color: var(--dec, #4a8cf5); }
```

---

### 4.2 — `accord-knowledge-base.js` module

`var` only. Public API:
- `AccordKnowledgeBase.render(workstreamId, host)` — mounts KB canvas into `host`
- `AccordKnowledgeBase.destroy()` — removes KB canvas
- `AccordKnowledgeBase._activeTab` — `'meetings'` (default) or `'kb'`

**On render:**
1. Create `#ac-kb-shell` div, append to `host` below `#ac-ws-tabs`
2. Load meetings for workstream (stats + date range + chips)
3. Load node counts by tag (stats row)
4. Render workspace header
5. Render filter pills (All active; others non-functional this phase)
6. Render status bar (meeting chips)
7. Canvas placeholder: "Loading knowledge base…" until Phase 3

**On destroy:**
Remove `#ac-kb-shell` from DOM.

---

### 4.3 — Workspace header

```
[Workstream name — 20px/600/--hi]
[Knowledge accumulated across N meetings · [earliest date] – [latest date]]

[3 Decisions]  [4 Actions open]  [1 Risk/Dissent]  [9 Notes]
```

**Load meetings:**
```javascript
// SELECT meeting_id, title, scheduled_for, state, sealed_at
// FROM accord_meetings
// WHERE workstream_id = [workstream_id]
//   AND state IN ('closed', 'sealed')
// ORDER BY scheduled_for ASC
```

Meeting count: `rows.length`
Date range: earliest `scheduled_for` → latest `scheduled_for`
Format: `Mar 15 – May 17, 2026`

**Load node counts:**
```javascript
// SELECT tag, COUNT(*) as cnt
// FROM accord_nodes n
// JOIN accord_meetings m ON n.meeting_id = m.meeting_id
// WHERE m.workstream_id = [workstream_id]
//   AND m.state IN ('closed', 'sealed')
//   AND (n.status IS NULL OR n.status != 'deleted')
// GROUP BY tag
```

Map counts to display:
- Decisions: `tag = 'decision'`
- Actions open: `tag = 'action'` AND `n.status != 'committed'` (open = not committed)
- Risk/Dissent: `tag IN ('risk', 'dissent')`
- Notes: `tag = 'note'`

---

### 4.4 — Filter pills

```
[SHOW label]  [All ●]  [Decisions]  [Action Items]  [Risks]  [Notes]
                                                              [All meetings ▾]
```

CSS: pill with bottom border underline on active (not background fill).
Active pill color matches type:
- All: `--dec`
- Decisions: `--dcn`
- Action Items: `--act`
- Risks: `--rsk`
- Notes: `--nt`

Non-functional this phase — clicking pills does nothing. Phase 4 wires them.

---

### 4.5 — Status bar (meeting chips)

```
[MEETINGS label]  [chip] [chip] [chip] ...
```

Use meeting rows from 4.3 load. Most recent meeting chip: highlighted
(`border-color: var(--dec-bd); color: var(--dec); background: var(--dec-bg)`).
Others: dim (`background: var(--raised); border: 1px solid var(--b0); color: var(--md)`).
Scrollable horizontally if overflow.

---

### 4.6 — CSS palette

Scoped to `.ac-kb-shell`. Same vars as Live Capture:
```css
.ac-kb-shell {
  --void:#0b0d14; --surface:#10131e; --raised:#171c2e; --hover:#1d2338;
  --b0:#1e2438; --b1:#252d44; --b2:#313d5e;
  --hi:#dce6f5; --md:#8899b2; --lo:#7a8a9a;
  --dec:#4a8cf5; --dec-bg:rgba(74,140,245,.09); --dec-bd:rgba(74,140,245,.24);
  --dcn:#8b6ef5; --dcn-bg:rgba(139,110,245,.09); --dcn-bd:rgba(139,110,245,.24);
  --act:#e89430; --act-bg:rgba(232,148,48,.08); --act-bd:rgba(232,148,48,.24);
  --rsk:#e05252; --rsk-bg:rgba(224,82,82,.09); --rsk-bd:rgba(224,82,82,.24);
  --nt:#48aa88; --nt-bg:rgba(72,170,136,.08); --nt-bd:rgba(72,170,136,.22);
  font-family: 'Outfit', system-ui, sans-serif;
  display: flex; flex-direction: column;
  flex: 1; overflow: hidden; min-height: 0;
}
```

---

## §5 — IRON RULE REMINDERS

**IR47:** Both queries confirmed clean — `discipline`/`topic` exist,
`status` values are `fresh`/`committed`. No `'deleted'` in production.

**Reactive wipe:** `AccordKnowledgeBase._activeTab` must be a module-level
variable set at init to `'meetings'`. Not a DOM state — survives re-renders.

**`var` only** — no `let`/`const`.

---

## §6 — FILE ORDER

1. `accord-knowledge-base.js` — full file
2. `accord-views.js` — diff showing tab injection + reactive guard only

Then: operator review note.
Then: §7 checklist verbatim. Stop.

---

## §7 — PHASE 2 CHECKLIST

- [ ] Knowledge Base tab appears on Workstream Detail page
- [ ] Meetings tab active by default, KB tab inactive
- [ ] Clicking KB tab: meeting list hidden, KB canvas renders
- [ ] Clicking Meetings tab: KB destroyed, meeting list restored
- [ ] Reactive re-render (file a meeting): KB canvas restored if was active
- [ ] `AccordKnowledgeBase._activeTab` persists across re-renders
- [ ] Workspace header: workstream name, meeting count, date range
- [ ] Stats row: correct counts per tag type
- [ ] Filter pills render (All active; others non-functional)
- [ ] Status bar: meeting chips render, most recent highlighted
- [ ] Canvas shows "Loading knowledge base…" placeholder
- [ ] `accord.html` script tag for `accord-knowledge-base.js` added
- [ ] Outfit font renders in KB canvas
- [ ] Running/idle meetings unaffected — no regression
- [ ] `var` only — no `let`/`const`

---

**Ship it.**
