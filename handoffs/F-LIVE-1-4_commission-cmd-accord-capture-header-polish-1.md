# Commission · F-LIVE-1-4 · CMD-ACCORD-CAPTURE-HEADER-POLISH-1

**Phase:** Live Capture surface polish — combined micro-CMD
**Authored:** 2026-05-11
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Predecessor:** Setup Shell polish phase complete
**Coding agent:** execute sequentially; halt-and-surface after §6

---

## §1 — Scope

Four targeted fixes to the live capture surface header and footer.
No substrate changes. No new tables.

| ID | Finding | Fix |
|---|---|---|
| F-LIVE-1 | `+ NEW MEETING` visible during running meeting | Remove button; `END MEETING` only |
| F-LIVE-2 | Live capture header is 4 rows — wastes vertical space | Consolidate to 2-row grid layout |
| F-LIVE-3 | `FILED UNDER` not visible in consolidated header | Move to row 2 right-justified |
| F-LIVE-4 | Live state dot is muted amber — not signaling "live" | Pulsing green glow; gray when closed |

---

## §2 — IR64 verification (before writing any code)

**V1 — Confirm live capture header selectors:**
```javascript
var header = document.querySelector('.capture-header');
console.log('header HTML:', header?.innerHTML?.slice(0, 600));
// Also check for accord-specific wrapper
var acHeader = document.querySelector('.ac-capture-header, .accord-capture-header');
console.log('ac-header:', acHeader?.className || 'not found');
```

**V2 — Confirm footer / controls area selectors:**
```javascript
// Find + NEW MEETING button
var newBtn = document.querySelector('[data-action="new-meeting"], .btn-new-meeting, #newMeetingBtn');
console.log('new meeting btn:', newBtn?.className, newBtn?.textContent?.trim());
// Find END MEETING button
var endBtn = document.querySelector('[data-action="end-meeting"], .btn-end-meeting, #endMeetingBtn, #meetingToggleBtn');
console.log('end meeting btn:', endBtn?.className, endBtn?.textContent?.trim());
```

**V3 — Confirm live-pulse dot selector:**
```javascript
var dot = document.querySelector('.live-pulse, .ac-live-dot, .meeting-state-dot');
console.log('dot class:', dot?.className);
console.log('dot computed bg:', window.getComputedStyle(dot)?.backgroundColor);
```

**V4 — Confirm filed-under / workstream display selector:**
```javascript
var filed = document.querySelector('.filed-under, .ac-filed-under, #cap-filed, [id*="filed"]');
console.log('filed-under:', filed?.className, filed?.innerHTML?.slice(0, 100));
// Also check capture-header-main children
var main = document.querySelector('.capture-header-main');
console.log('header-main children:', Array.from(main?.children||[]).map(function(c){return c.className+':'+c.id}).join(' | '));
```

Report V1–V4 in close-out. Agent must halt if selectors don't match — do not guess.

---

## §3 — F-LIVE-1: Remove `+ NEW MEETING` button

**In the render function that builds the capture footer/controls:**

Find the block that renders `+ NEW MEETING` (likely a button with `data-action="new-meeting"` or class `btn-new-meeting`). Delete it entirely from the HTML template. Do not add a condition — the button should never appear on the live capture surface regardless of meeting state.

`END MEETING` button remains unchanged.

If `+ NEW MEETING` is rendered by JS conditionally, find the condition and remove the entire branch. If it is in static HTML, remove the element from the template.

---

## §4 — F-LIVE-2 + F-LIVE-3: Consolidate header to 2 rows

**Current structure (4 rows):**
```
Row 1: [Meeting title]
Row 2: [Organized by Name]
Row 3: [● date · state · location]
Row 4: [FILED UNDER: Workstream / Project [change]]
```

**Target structure (2 rows):**
```
Row 1: [Meeting title]                    [● date · state]
Row 2: [Organized by Name]     [FILED UNDER: Workstream [change]]
```

**CSS change on `.capture-header-main`:**

```css
.capture-header-main {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  column-gap: 20px;
  row-gap: 3px;
  align-items: baseline;
}

/* Title spans full width — row 1 left */
.meeting-title {
  grid-column: 1;
  grid-row: 1;
}

/* Date/state — row 1 right */
.meeting-meta {
  grid-column: 2;
  grid-row: 1;
  text-align: right;
  white-space: nowrap;
  justify-self: end;
  align-self: baseline;
}

/* Organizer — row 2 left */
.meeting-organizer {
  grid-column: 1;
  grid-row: 2;
  margin-top: 0;  /* override existing margin-top: 4px */
}

/* Filed under — row 2 right */
.meeting-filed-under, .filed-under, .ac-filed-under {
  grid-column: 2;
  grid-row: 2;
  text-align: right;
  white-space: nowrap;
  justify-self: end;
  font-family: var(--ac-font-mono);
  font-size: 10px;
  color: var(--ac-text-tertiary);
}
```

**If `FILED UNDER` is currently rendered outside `.capture-header-main`** (e.g. in a separate row or banner), move it inside `.capture-header-main` as a sibling of `.meeting-organizer`. The grid placement handles positioning.

---

## §5 — F-LIVE-4: Live state dot — pulsing green glow

**Replace existing `.live-pulse` styles with:**

```css
.live-pulse {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ac-border-mid);  /* gray default — not running */
  flex-shrink: 0;
  margin-right: 8px;
  transition: background 0.3s ease, box-shadow 0.3s ease;
}

/* Running state — bright green pulsing glow */
.live-pulse.running {
  background: #22c55e;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25),
              0 0 8px rgba(34, 197, 94, 0.5);
  animation: ac-live-glow 2s ease-in-out infinite;
}

/* Closed state — gray, no animation */
.live-pulse.closed,
.live-pulse.ended {
  background: var(--ac-border-mid);
  box-shadow: none;
  animation: none;
}

@keyframes ac-live-glow {
  0%, 100% {
    box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25),
                0 0 8px rgba(34, 197, 94, 0.5);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.1),
                0 0 16px rgba(34, 197, 94, 0.35);
  }
}
```

**JS — ensure `.running` class is applied when meeting state is running:**

Find where the meeting state is applied to the live-pulse element. Confirm it adds class `running` when `meeting.state === 'running'` and removes it (adds `closed`) when `meeting.state === 'closed'`. If the class application is missing, add it to the meeting state change handler.

---

## §6 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Load live capture surface | `+ NEW MEETING` button absent. `END MEETING` button visible. No other meeting action buttons. |
| 2 | Header row count | Header shows exactly 2 rows: title + meta on row 1; organizer + filed-under on row 2. No 3rd or 4th row. |
| 3 | Header right-alignment | Date/state right-aligned in row 1. FILED UNDER right-aligned in row 2. Both flush to right edge of header. |
| 4 | Live dot — running | Dot is bright green with pulsing glow animation while `state='running'`. |
| 5 | Live dot — closed | After END MEETING, dot stops animating and turns gray. |
| 6 | Header at narrow viewport | Title truncates gracefully. Meta row wraps without breaking layout. |

---

## §7 — Files manifest

| File | Change |
|---|---|
| `accord-capture.js` | Remove `+ NEW MEETING` button from render; move FILED UNDER into header-main if needed; apply `running`/`closed` class to live-pulse on state change |
| `accord-capture.css` (or inline styles) | `.capture-header-main` grid layout; `.live-pulse` green glow styles |
| `version.js` | Operator-managed (IR65) |

---

## §8 — Discipline checklist

- `var` only
- No new `data-action` values needed — removing a button, not adding
- V1–V4 selectors must be confirmed before any changes — do not assume class names match commission
- `.live-pulse.running` class must be set by JS state handler — not hardcoded in HTML
- CSS grid on `.capture-header-main` only — do not touch `.capture-header` flex layout
- `--ac-*` token prefix for any new CSS variable references

---

**Halt-and-surface after §6. Close-out must confirm V1–V4 selector findings and smoke test 1 (NEW MEETING absent).**

**After seal: A-08 · CMD-ACCORD-CAPTURE-CHAT-1 is unblocked.**

---

*End Commission · F-LIVE-1-4 · CMD-ACCORD-CAPTURE-HEADER-POLISH-1.*
