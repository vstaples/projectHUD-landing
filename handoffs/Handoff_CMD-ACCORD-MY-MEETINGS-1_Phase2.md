# HANDOFF — CMD-ACCORD-MY-MEETINGS-1 · Phase 2: Card Enhancements

**Date:** 2026-05-19
**CMD:** MM-01 · CMD-ACCORD-MY-MEETINGS-1
**Operator:** Vaughn Staples
**Phase:** 2 of 4 — Closed meetings, stakes lines, state badges added to existing module.

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-MY-MEETINGS-1.md` end-to-end before proceeding.
Read Phase 1 findings in full.
Session protocol: terse mode; Test Mode after each code update.
Iron Rules 36, 40 §1, 47 apply.
`var` only. Deliver §6 then §7. Stop.

---

## §1 — PHASE 1 CARRY-FORWARD

**Tab wiring is already complete** — `accord-rails.js` (lines 690–773) implements
`_ensureRailTabs()` and `_switchRailTab()`. The WORKSTREAMS / MY MEETINGS tab bar,
panel containers, and `renderInRail` call are all wired. No changes needed to
`accord.html`, `accord-rails.js`, or `sidebar.js`.

**Existing module (`v20260513`):** handles LIVE NOW, PENDING, UPCOMING.
Missing: Closed meetings zone, stakes line on cards, state badges.

**`organizer_id`** = `auth.users.id` — compared with `me.id`.
**`resource_id`** = `resources.id` — compared with `me.resource_id`.
**`stakes`** = TEXT, nullable — confirmed on `accord_meetings`.

---

## §2 — INPUTS

| File | Purpose |
|------|---------|
| `accord-my-meetings.js` | Extend with closed meetings, stakes, state badges |

---

## §3 — DELIVERABLES

1. `accord-my-meetings.js` — extended module

Operator review checkpoint before Phase 3.

---

## §4 — BUILD SPEC

### 4.1 — Extend fetch queries to include closed/sealed + stakes

**Q1 — organized meetings:**
Change `state=in.(running,idle)` → `state=in.(running,idle,closed,sealed)`
Add `stakes` to select:
```javascript
'&select=meeting_id,title,state,scheduled_for,duration_minutes,' +
'workstream_id,started_at,stakes,workstreams(name)'
```

**Q2 — invited meetings:**
Add `stakes` to inner select:
```javascript
'accord_meetings!inner(meeting_id,title,state,scheduled_for,' +
'duration_minutes,workstream_id,organizer_id,started_at,stakes,' +
'workstreams(name),users(name))'
```

**Add `stakes` to `meetingMap` entries** in both organized and invite paths:
```javascript
stakes: m.stakes || null,
```

---

### 4.2 — Add CLOSED zone filter

After the existing `upcoming` filter, add:
```javascript
var closed = meetings.filter(function(m) {
  return m.state === 'closed' || m.state === 'sealed';
}).sort(function(a, b) {
  return new Date(b.scheduled_for) - new Date(a.scheduled_for);
}).slice(0, 10);
```

Pass `closed` into `_myMeetingsHtml`.

---

### 4.3 — State badges

Add a state badge as the first element of every card, before the title:

```javascript
var STATE_BADGES = {
  running: '<span class="ac-mm-state ac-mm-state--live">&#9679; LIVE</span>',
  idle:    '<span class="ac-mm-state ac-mm-state--preparing">Preparing</span>',
  closed:  '<span class="ac-mm-state ac-mm-state--closed">Closed</span>',
  sealed:  '<span class="ac-mm-state ac-mm-state--closed">Sealed</span>'
};
// Usage: html += (STATE_BADGES[m.state] || '');
```

CSS (add to existing inline styles or injected style block):
```css
.ac-mm-state {
  display: inline-block; font-size: 10px; font-weight: 700;
  padding: 1px 7px; border-radius: 3px; margin-bottom: 5px;
  letter-spacing: .06em;
}
.ac-mm-state--live {
  background: rgba(72,170,136,.12); color: #48aa88;
  border: 1px solid rgba(72,170,136,.25);
}
.ac-mm-state--preparing {
  background: rgba(232,148,48,.08); color: #e89430;
  border: 1px solid rgba(232,148,48,.22);
}
.ac-mm-state--closed {
  background: rgba(255,255,255,.04); color: #7a8a9a;
  border: 1px solid rgba(255,255,255,.08);
}
```

---

### 4.4 — Stakes line

Add stakes line to ALL card types immediately after the title (before meta):
```javascript
if (m.stakes) {
  html += '<div class="ac-mm-stakes">' + esc(m.stakes) + '</div>';
}
```

CSS:
```css
.ac-mm-stakes {
  font-size: 12px; color: var(--lo, #7a8a9a); font-style: italic;
  border-left: 2px solid rgba(255,255,255,.12);
  padding-left: 7px; margin: 4px 0 6px; line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical; overflow: hidden;
}
.ac-mm-card--live     .ac-mm-stakes { border-left-color: rgba(72,170,136,.4); }
.ac-mm-card--pending  .ac-mm-stakes { border-left-color: rgba(224,82,82,.4); }
.ac-mm-card--upcoming .ac-mm-stakes { border-left-color: rgba(232,148,48,.4); }
.ac-mm-card--closed   .ac-mm-stakes { border-left-color: rgba(255,255,255,.1); }
```

---

### 4.5 — CLOSED zone rendering

Add after UPCOMING in `_myMeetingsHtml`:
```javascript
if (closed.length) {
  html += '<div class="ac-mm-zone">';
  html += '<div class="ac-mm-zone-label">CLOSED</div>';
  closed.forEach(function(m) {
    html += '<div class="ac-mm-card ac-mm-card--closed" ' +
            'data-action="mm-open-meeting" ' +
            'data-meeting-id="' + esc(m.meeting_id) + '" ' +
            'data-workstream-id="' + esc(m.workstream_id || '') + '">';
    html += STATE_BADGES.closed || '';
    html += '<div class="ac-mm-card-title">' + esc(m.title || 'Untitled') + '</div>';
    if (m.stakes) {
      html += '<div class="ac-mm-stakes">' + esc(m.stakes) + '</div>';
    }
    var meta = [];
    if (m.scheduled_for) meta.push(_fmtDate(m.scheduled_for));
    if (m.workstream_name) meta.push(esc(m.workstream_name));
    if (meta.length) {
      html += '<div class="ac-mm-card-meta">' + meta.join(' &middot; ') + '</div>';
    }
    html += '<div class="ac-mm-card-role">' +
            (m.role === 'organizer' ? 'Organizer' : 'Attended') + '</div>';
    html += '</div>';
  });
  html += '</div>';
}
```

Card CSS:
```css
.ac-mm-card--closed {
  border-left: 3px solid rgba(255,255,255,.10);
  opacity: .75;
  cursor: pointer;
}
.ac-mm-card--closed:hover { opacity: 1; }
```

---

## §5 — IRON RULE REMINDERS

**`var` only** — no `let`/`const`.
**No new API patterns** — reuse the existing `API.get` call structure.

---

## §6 — FILE ORDER

1. `accord-my-meetings.js` — full updated file

Then: operator review note.
Then: §7 checklist verbatim. Stop.

---

## §7 — PHASE 2 CHECKLIST

- [ ] Clicking MY MEETINGS tab shows the panel (already wired — verify it works)
- [ ] LIVE NOW zone renders for running meetings
- [ ] PENDING zone renders with RSVP buttons
- [ ] UPCOMING zone renders
- [ ] CLOSED zone renders — most recent 10 closed/sealed meetings
- [ ] State badge appears on every card (LIVE, Preparing, Closed, Sealed)
- [ ] Stakes line appears on cards where stakes is non-null
- [ ] Stakes line truncates at 2 lines
- [ ] Closed cards are clickable → open meeting in review mode
- [ ] Workstreams tab still works — no regression
- [ ] `var` only — no `let`/`const`

---

**Ship it.**
