# HANDOFF — CMD-ACCORD-MINUTES-1 · Phase 2: Shell + Topbar + Sidebar

**Date:** 2026-05-19
**CMD:** M-01 · CMD-ACCORD-MINUTES-1
**Operator:** Vaughn Staples
**Phase:** 2 of 6 — Minutes shell registers. Topbar and sidebar wired to live data.

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-MINUTES-1.md` end-to-end before proceeding.
Read Phase 1 findings in full — they carry forward entirely.
Session protocol: terse mode; test Chrome connection first; Test Mode after
each code update.
Iron Rules 36, 40 §1, 47, 64, 71, 72, 73 apply.
Deliver in §6 file order, then §7 checklist verbatim. Stop.

---

## §1 — PHASE 1 CARRY-FORWARD

**Swap point:** `accord-views.js:451` — insert `if (meeting.state === 'closed')`
branch immediately after running branch returns at line 450.
Branch must: call `_detachSurfaceHost()`, stamp `.meeting-closed` on
`#ac-meeting-surface-host` and `.ac-center`, call `AccordMinutes.render()`,
and return. Identical shape to running branch.

**Suppression required on mount (inject style tags):**
- `#closedBanner { display: none !important }` — suppress accord-core.js banner
- `.ac-meeting-tabs-shell { display: none !important }` — suppress 5-tab shell
Remove both style tags in `AccordMinutes.destroy()`.

**Outcome status mapping (Phase 3 scope — document now):**
Surface label → DB value: Met → `achieved` · Partial → `partial` · Unmet → `abandoned`

**`accord_meeting_outcomes.status` valid values:**
`open | achieved | partial | carried | abandoned`

**`accord_meeting_attendees` name resolution:**
Two-query pattern: fetch attendees, then `resources?id=in.(...)` for names.

**IR72 contracts to honor:**
- `accord:level-changed` — do not dispatch; only listen
- `accord:meeting-sealed` — do not dispatch
- `accord.minutes.rendered` / `accord.minutes.render_failed` — toast is
  independent; do not interfere

---

## §2 — INPUTS

| File | Purpose |
|------|---------|
| `accord-views.js` | Swap point at line 451 |
| `accord-core.js` | _detachSurfaceHost(), _renderClosedBanner() patterns |
| `accord-live-capture.js` | Reference — shell pattern, inject/remove style tag pattern |

---

## §3 — DELIVERABLES

1. `accord-minutes.js` — new shell module (full file)
2. `accord-views.js` — branch addition only (diff)

Operator review checkpoint before Phase 3.

---

## §4 — BUILD SPEC

### 4.1 — Shell registration in `accord-views.js`

At line 451 (after running branch `return`), insert:

```javascript
if (meeting.state === 'closed') {
    _detachSurfaceHost();
    if (_sfCenter1) {
        _sfCenter1.classList.remove('meeting-idle', 'meeting-running', 'meeting-closed');
        _sfCenter1.classList.add('meeting-closed');
    }
    AccordMinutes.render(meeting);
    return;
}
```

### 4.2 — New module: `accord-minutes.js`

Module pattern consistent with `AccordLiveCapture`. `var` only.

**Public API:**
- `AccordMinutes.render(meeting)` — mounts shell
- `AccordMinutes.destroy()` — teardown

**On render:**
1. Inject suppression style tags (closedBanner + tabs shell)
2. Build shell DOM into `#ac-meeting-surface-host`
3. Load meeting attendees → resolve names → populate recipients sidebar
4. Wire checklist toggle handlers
5. Wire sections nav (scroll-to; canvas sections empty this phase — anchors only)
6. Bind `accord:level-changed` listener → `AccordMinutes.destroy()`

**On destroy:**
1. Remove suppression style tags
2. Remove shell DOM from `#ac-meeting-surface-host`
3. Remove event listeners

### 4.3 — Topbar

```
[accord.] [state badge] [meeting title · Minutes]    [Preview →] [Route + Send ↑] [user chip]
```

| Element | Source | Notes |
|---------|--------|-------|
| Logo | Static | `accord.` with cyan dot |
| State badge | Client state | "Under Review" (amber) → "Ready to Send" (green) → "Sent · [time]" (blue) |
| Meeting title | `meeting.title + ' · Minutes'` | Truncated |
| Preview → | Static | Disabled (`opacity:.35; pointer-events:none`) — deferred |
| Route + Send ↑ | Checklist gate | Disabled until all 6 checked; enabled = green; click → modal (Phase 5) |
| User chip | `Accord.state.resource` | Avatar initials + name |

### 4.4 — Sidebar

Fixed width 240px. No resize handle (Minutes is a review surface, not a
live working surface).

All three section labels identical: `11px / font-weight:700 / color:var(--hi) / letter-spacing:.10em / text-transform:uppercase`

**Review Checklist:**
Label: `REVIEW CHECKLIST`
6 items — each a row with circular toggle + label:
1. Meeting header
2. Attendance confirmed
3. Outcomes reviewed
4. Agenda entries checked
5. Decisions verified
6. Actions confirmed

Toggle behavior:
- Unchecked: `border:1px solid var(--b2)`, no fill
- Checked: `background:var(--nt); border-color:var(--nt)` + white ✓
- On toggle: recount checked items → if all 6, enable Route + Send button
  + update state badge to "Ready to Send"

**Sections nav:**
Label: `SECTIONS`
Links (each with colored dot + label + count badge):
- Meeting Header (gray dot)
- Intended Outcomes (blue dot) · count from `accord_meeting_outcomes`
- Agenda & Captures (gray dot) · count from `accord_agenda_items`
- Decisions (purple dot) · count from DC nodes
- Action Items (amber dot) · count from AX nodes
- Risks & Dissents (red dot) · count from RK+DS nodes
- Parking Lot (purple #9478e0 dot) · count from question nodes

Click → `element.scrollIntoView({ behavior:'smooth', block:'start' })`.
Active state: nearest section header to canvas top viewport.
Counts: load after shell renders (non-blocking). Show "—" until loaded.

**Recipients:**
Label: `RECIPIENTS`
Load from `accord_meeting_attendees WHERE meeting_id = [current]`.
Resolve names via `resources?id=in.(...)`.
Each row: avatar (initials) + name + checkbox (checked by default).
`+ Add external recipient…` link — opens email input field inline.

### 4.5 — Canvas (this phase)

Canvas container renders with correct layout and scroll behavior.
Section anchor `id` attributes placed for nav:
`sec-header`, `sec-outcomes`, `sec-agenda`, `sec-decisions`,
`sec-actions`, `sec-risks`, `sec-parking`

Each section placeholder renders as: colored left bar + uppercase label +
collapse chevron. No content yet — content wired in Phases 3 and 4.

**Section headers (all phases reference this spec):**
```
[4px colored bar] [SECTION TITLE]    [+ Add btn]    [▾ chevron 20px]
```
- Click header: toggle section body; chevron rotates 90°
- + Add button: blue (`var(--dec)`) for section-level; amber for agenda sub-items
- Chevron: `font-size:20px`, `color:var(--md)`, rotates `-90deg` on collapse

### 4.6 — Style

CSS scoped to `.ac-minutes-shell`.
Reuse Accord palette vars from `accord-live-capture.js` — same token set.
Outfit font: inject `<link>` if not already present in `<head>`.
Slim scrollbars (same as Live Capture).

```css
.ac-minutes-shell {
  --void:#0b0d14; --surface:#10131e; --raised:#171c2e; --hover:#1d2338;
  --b0:#1e2438; --b1:#252d44; --b2:#313d5e;
  --hi:#dce6f5; --md:#8899b2; --lo:#7a8a9a;
  --dec:#4a8cf5; --dec-bg:rgba(74,140,245,.09); --dec-bd:rgba(74,140,245,.24);
  --dcn:#8b6ef5; --dcn-bg:rgba(139,110,245,.09); --dcn-bd:rgba(139,110,245,.24);
  --act:#e89430; --act-bg:rgba(232,148,48,.08); --act-bd:rgba(232,148,48,.24);
  --rsk:#e05252; --rsk-bg:rgba(224,82,82,.09); --rsk-bd:rgba(224,82,82,.24);
  --nt:#48aa88; --nt-bg:rgba(72,170,136,.08); --nt-bd:rgba(72,170,136,.22);
  font-family:'Outfit',system-ui,sans-serif;
}
```

### 4.7 — Suppression style tags

```javascript
function _injectSuppressionStyles() {
  if (document.getElementById('ac-minutes-suppress')) return;
  var s = document.createElement('style');
  s.id = 'ac-minutes-suppress';
  s.textContent = '#closedBanner{display:none!important}'
    + '.ac-meeting-tabs-shell{display:none!important}';
  document.head.appendChild(s);
}
function _removeSuppressionStyles() {
  var s = document.getElementById('ac-minutes-suppress');
  if (s) s.parentNode.removeChild(s);
}
```

---

## §5 — IRON RULE REMINDERS

**IR47:** Name resolution query `resources?id=in.(...)` — confirm `resources.name`
column exists before querying (confirmed C-03 V1 in schema inventory).

**IR72:** `accord:level-changed` listener must call `AccordMinutes.destroy()`
to clean up suppression styles and DOM. Failure leaves #closedBanner
permanently hidden.

**`var` only** — no `let`/`const`.

---

## §6 — FILE ORDER

1. `accord-minutes.js` — full file
2. `accord-views.js` — diff showing branch addition only

Then: operator review note.
Then: §7 checklist verbatim. Stop.

---

## §7 — PHASE 2 CHECKLIST

- [ ] Closed meeting routes to Minutes surface — not 5-tab shell
- [ ] Running/idle meetings unaffected — no regression
- [ ] `#closedBanner` suppressed on mount, restored on destroy
- [ ] `.ac-meeting-tabs-shell` suppressed on mount, restored on destroy
- [ ] Topbar renders: logo, state badge (Under Review), title, Preview
      (disabled), Route + Send (disabled), user chip
- [ ] Checklist: all 6 items render and toggle correctly
- [ ] All 6 checked → Route + Send enables, badge → "Ready to Send"
- [ ] Unchecking any item → Route + Send disables, badge → "Under Review"
- [ ] Sections nav renders all 7 links with colored dots
- [ ] Section counts show "—" then load asynchronously
- [ ] Scroll-to works for each nav link
- [ ] Recipients loaded from `accord_meeting_attendees` with resolved names
- [ ] Recipients default to checked
- [ ] + Add external recipient link renders
- [ ] Canvas section anchors present (sec-header through sec-parking)
- [ ] Section collapse/expand toggles with 20px chevron
- [ ] `AccordMinutes.destroy()` fires on `accord:level-changed` — styles
      removed, DOM cleaned
- [ ] Outfit font rendering confirmed
- [ ] `var` only — no `let`/`const`

---

**Ship it.**
