# Commission · C-11 · CMD-ACCORD-SETUP-PERCOLATE-1

**Phase:** 1 of Wave 3 — Click-to-percolate-by-person
**Authored:** 2026-05-10
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Accord Meeting Setup Shell — Requirements Specification v1.1 §9.4
**Predecessor:** C-10 · CMD-ACCORD-SETUP-SLIDESHOW-1 sealed · Wave 2 closed
**Successor:** C-12 · CMD-ACCORD-SETUP-GATHERING-1
**Coding agent:** execute sequentially; halt-and-surface after §8

---

## §1 — Scope

Wire click-to-percolate across all person references in the Setup shell. A single click on any person reference filters all visible panels to that person's items.

**Percolate triggers (all must work):**
- Attendee card in right column roster
- Owner chip on an agenda item (center column)
- Owner chip on an outcomes row (center column tabbody)
- Action card owner chip in right column Action Items kanban

**Percolate effect:**
- Person's items rise to top in each currently-visible panel
- All other items in each panel fade to `opacity: 0.35` (not hidden — they remain in DOM)
- `Filtered: [Name] · ✕` pill appears in the center column header area
- Clicking ✕ clears filter
- Clicking the same person again clears filter (toggle)
- Clicking a different person switches filter to that person

**Scope boundary:**
- Percolation applies to currently-visible panels only — not hidden tabs
- No substrate changes — this is a pure client-side filter layer
- No persistence — filter state lives in module memory, resets on navigation

**What does NOT ship:**
- Percolation in Intelligence Mode overlay (C-08) — private layer is separate
- Percolation in filmstrip scrub view — read-only; no filter affordance
- URL or localStorage persistence of filter state

---

## §2 — IR64 verification (before writing any code)

**V1 — Confirm owner chip selectors across panels:**
```javascript
JSON.stringify({
  agendaOwnerChips:   document.querySelectorAll('.ac-agenda-item [data-resource-id]').length,
  outcomeOwnerChips:  document.querySelectorAll('.ac-outcome-row [data-resource-id]').length,
  actionOwnerChips:   document.querySelectorAll('.ac-action-card [data-resource-id]').length,
  attendeeCards:      document.querySelectorAll('.ac-attendee-card[data-resource-id]').length
});
```
Confirm `data-resource-id` is present on all four element types. If absent on any, the percolate wiring cannot match by resource. Surface gap before writing code.

**V2 — Confirm center column header container:**
```javascript
document.querySelector('.ac-col-header[data-col="center"]')?.innerHTML?.slice(0, 100);
```
Need a stable container in the center column header to mount the filter pill. Confirm it exists and is not replaced on tab switches.

**V3 — Confirm `data-resource-id` on action cards:**
```javascript
document.querySelector('.ac-action-card')?.dataset?.resourceId;
```
Action cards were given `data-resource-id` in C-09. Confirm present in deployed code.

Report V1–V3 in close-out.

---

## §3 — No substrate changes

This CMD is pure client-side. No migrations. No `pg_notify`.

---

## §4 — Module-level percolate state

```javascript
var _percolateResourceId   = null;   // currently active filter; null = no filter
var _percolateResourceName = null;   // display name for the pill
```

These are module-level vars in `accord-meeting-setup.js`. They reset on `teardown()`.

---

## §5 — Core percolate functions

### §5.1 — `_setPercolate(resourceId, name)`

```javascript
function _setPercolate(resourceId, name) {
  // Toggle off if same person clicked again
  if (_percolateResourceId === resourceId) {
    _clearPercolate();
    return;
  }

  _percolateResourceId   = resourceId;
  _percolateResourceName = name;

  _applyPercolate();
  _renderPercolatePill();
}
```

### §5.2 — `_clearPercolate()`

```javascript
function _clearPercolate() {
  _percolateResourceId   = null;
  _percolateResourceName = null;

  // Remove all opacity fades
  document.querySelectorAll('.ac-percolate-faded').forEach(function(el) {
    el.classList.remove('ac-percolate-faded');
  });
  // Remove all rise-to-top reordering
  document.querySelectorAll('.ac-percolate-raised').forEach(function(el) {
    el.classList.remove('ac-percolate-raised');
    // Remove injected order style
    el.style.order = '';
  });

  // Remove pill
  var pill = document.getElementById('ac-percolate-pill');
  if (pill) pill.remove();
}
```

### §5.3 — `_applyPercolate()`

Called on set and on any panel re-render while a filter is active.

```javascript
function _applyPercolate() {
  if (!_percolateResourceId) return;

  var rid = _percolateResourceId;

  // ── Center column: agenda items ──────────────────────
  var agendaList = document.getElementById('ac-agenda-list');
  if (agendaList) {
    var agendaItems = agendaList.querySelectorAll('.ac-agenda-item');
    var agendaOrder = 1;
    agendaItems.forEach(function(item) {
      // Agenda items owned by the person have data-resource-id on owner chip
      var chip = item.querySelector('[data-resource-id="' + rid + '"]');
      if (chip) {
        item.classList.add('ac-percolate-raised');
        item.classList.remove('ac-percolate-faded');
        item.style.order = String(agendaOrder++);
      } else {
        item.classList.add('ac-percolate-faded');
        item.classList.remove('ac-percolate-raised');
        item.style.order = '';
      }
    });
  }

  // ── Center column: outcomes rows ─────────────────────
  var outcomesContainer = document.getElementById('ac-outcomes-container');
  if (outcomesContainer) {
    var outcomeRows = outcomesContainer.querySelectorAll('.ac-outcome-row');
    outcomeRows.forEach(function(row) {
      var chip = row.querySelector('[data-resource-id="' + rid + '"]');
      if (chip) {
        row.classList.add('ac-percolate-raised');
        row.classList.remove('ac-percolate-faded');
      } else {
        row.classList.add('ac-percolate-faded');
        row.classList.remove('ac-percolate-raised');
      }
    });
  }

  // ── Right column: attendee cards ──────────────────────
  var attendeesBlock = document.getElementById('ac-attendees-block');
  if (attendeesBlock) {
    var attendeeCards = attendeesBlock.querySelectorAll('.ac-attendee-card');
    attendeeCards.forEach(function(card) {
      if (card.dataset.resourceId === rid) {
        card.classList.add('ac-percolate-raised');
        card.classList.remove('ac-percolate-faded');
      } else {
        card.classList.add('ac-percolate-faded');
        card.classList.remove('ac-percolate-raised');
      }
    });
  }

  // ── Right column: action cards (kanban) ───────────────
  var kanbanTrack = document.querySelector('.ac-kanban-track');
  if (kanbanTrack) {
    var actionCards = kanbanTrack.querySelectorAll('.ac-action-card');
    actionCards.forEach(function(card) {
      if (card.dataset.resourceId === rid) {
        card.classList.add('ac-percolate-raised');
        card.classList.remove('ac-percolate-faded');
      } else {
        card.classList.add('ac-percolate-faded');
        card.classList.remove('ac-percolate-raised');
      }
    });
  }
}
```

### §5.4 — `_renderPercolatePill()`

```javascript
function _renderPercolatePill() {
  // Remove existing pill first
  var existing = document.getElementById('ac-percolate-pill');
  if (existing) existing.remove();

  if (!_percolateResourceId || !_percolateResourceName) return;

  var header = document.querySelector('.ac-col-header[data-col="center"]');
  if (!header) return;

  var pill = document.createElement('div');
  pill.id = 'ac-percolate-pill';
  pill.className = 'ac-percolate-pill';
  pill.innerHTML = 'Filtered: <span class="ac-percolate-name">' +
                   esc(_percolateResourceName) + '</span>' +
                   ' <button class="ac-percolate-dismiss" ' +
                   'data-action="percolate-clear" title="Clear filter">✕</button>';

  header.appendChild(pill);

  pill.querySelector('[data-action="percolate-clear"]')
    .addEventListener('click', function(ev) {
      ev.stopPropagation();
      _clearPercolate();
    });
}
```

---

## §6 — Click wiring

### §6.1 — Attendee cards

Add delegation to the attendees block. Called from `_renderAttendees` after paint:

```javascript
function _wirePercolateOnAttendees(block) {
  block.addEventListener('click', function(ev) {
    var card = ev.target.closest('.ac-attendee-card[data-resource-id]');
    if (!card) return;
    // Don't intercept clicks on action buttons within the card
    if (ev.target.closest('button')) return;
    var rid  = card.dataset.resourceId;
    var name = card.querySelector('.ac-attendee-name')?.textContent?.trim() ||
               card.dataset.resourceId;
    _setPercolate(rid, name);
  });
}
```

Call: `_wirePercolateOnAttendees(block)` at end of `_paintAttendees`.

### §6.2 — Agenda item owner chips

Owner chips on agenda items already have `data-resource-id` from C-07. Add delegation to agenda container:

```javascript
function _wirePercolateOnAgenda(container) {
  container.addEventListener('click', function(ev) {
    var chip = ev.target.closest('.ac-action-owner-chip[data-resource-id]');
    if (!chip) return;
    ev.stopPropagation();
    var rid  = chip.dataset.resourceId;
    var name = chip.textContent.trim();
    _setPercolate(rid, name);
  });
}
```

Call: `_wirePercolateOnAgenda(agendaContainer)` at end of `_paintAgenda`.

**Note:** owner chips on agenda items were not explicitly in C-07 scope. V1 confirms whether they exist. If absent, the agenda percolation path triggers on `data-resource-id` anywhere within `.ac-agenda-item` (the broader selector used in `_applyPercolate` already handles this).

### §6.3 — Outcome row owner chips

Add delegation to outcomes container:

```javascript
function _wirePercolateOnOutcomes(container) {
  container.addEventListener('click', function(ev) {
    var chip = ev.target.closest('[data-resource-id]');
    if (!chip) return;
    if (!ev.target.closest('.ac-outcome-row')) return;
    ev.stopPropagation();
    var rid  = chip.dataset.resourceId;
    var name = chip.textContent.trim();
    _setPercolate(rid, name);
  });
}
```

Call: `_wirePercolateOnOutcomes(container)` at end of `_paintOutcomes`.

### §6.4 — Action card owner chips

Action cards have `data-resource-id` on the card itself (C-09). Add delegation to tabbody:

```javascript
function _wirePercolateOnActions(tabbody) {
  tabbody.addEventListener('click', function(ev) {
    var chip = ev.target.closest('.ac-action-owner[data-resource-id]');
    if (!chip) {
      // Fallback: owner name div inside the card
      var ownerDiv = ev.target.closest('.ac-action-owner');
      if (!ownerDiv) return;
      var card = ownerDiv.closest('.ac-action-card[data-resource-id]');
      if (!card) return;
      var rid  = card.dataset.resourceId;
      var name = ownerDiv.textContent.trim();
      if (!rid || !name) return;
      _setPercolate(rid, name);
      return;
    }
    ev.stopPropagation();
    _setPercolate(chip.dataset.resourceId, chip.textContent.trim());
  });
}
```

Call: `_wirePercolateOnActions(tabbody)` after `_paintActionItems`.

---

## §7 — Re-apply on panel re-render

Any panel that re-renders (tab switch, drag-drop re-paint, etc.) must re-apply the active filter after paint. Add this call at the end of each paint function, after DOM is written:

```javascript
// Re-apply percolate filter if active
if (_percolateResourceId) _applyPercolate();
```

Insert at end of:
- `_paintAgenda()`
- `_paintAttendees()` (the enrichment step)
- `_paintActionItems()` → `_renderKanban()`
- Outcomes paint function

---

## §8 — Teardown additions

```javascript
// In teardown():
_clearPercolate();  // removes DOM classes, pill, resets state vars
// _percolateResourceId and _percolateResourceName reset by _clearPercolate()
```

---

## §9 — CSS additions

```css
/* ── Percolate fade ─────────────────────────────────── */
.ac-percolate-faded {
  opacity: 0.35;
  transition: opacity 0.18s ease;
  pointer-events: none;   /* prevent clicking faded items to avoid accidental percolate switch */
}

/* Faded attendee cards retain their border — just opacity drop */
.ac-attendee-card.ac-percolate-faded { pointer-events: none; }

/* Raised items: explicit order for flex parents (agenda, outcomes).
   Non-flex parents (kanban columns) rely on opacity alone — no reorder. */
.ac-percolate-raised {
  opacity: 1;
  transition: opacity 0.18s ease;
}

/* ── Filter pill ────────────────────────────────────── */
.ac-percolate-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-cyan);
  background: var(--ac-cyan-dim);
  border: 1px solid rgba(34,211,238,0.25);
  border-radius: 20px;
  padding: 3px 10px 3px 10px;
  margin-left: 10px;
  white-space: nowrap;
  vertical-align: middle;
}
.ac-percolate-name { font-weight: 600; }
.ac-percolate-dismiss {
  font-size: 10px;
  color: var(--ac-cyan);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  opacity: 0.7;
}
.ac-percolate-dismiss:hover { opacity: 1; }
```

---

## §10 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Click attendee card | Card stays full opacity. All other attendee cards fade to 0.35. Agenda items owned by this person rise to top; others fade. Action cards owned by this person stay full opacity; others fade. Pill appears in center column header: "Filtered: [Name] · ✕". |
| 2 | Click same attendee again | Filter clears. All items restore to full opacity. Pill disappears. |
| 3 | Click different attendee | Filter switches. New person's items highlighted. Pill updates to new name. |
| 4 | Click ✕ on pill | Filter clears. All items restore. Pill disappears. |
| 5 | Click action card owner | Same filter behavior. Relevant attendee card highlighted. Pill appears. |
| 6 | Drag action card to new column while filter active | Filter re-applies after repaint. New column position shows card at full opacity; others faded. |
| 7 | Switch to Action Items tab while filter active | Kanban renders with filter already applied. |
| 8 | Navigate away (ascend to constellation) | Teardown clears filter. On return, no filter is active. |

---

## §11 — Files manifest

| File | Change |
|---|---|
| `accord-meeting-setup.js` | `_percolateResourceId`/`_percolateResourceName` vars; `_setPercolate`, `_clearPercolate`, `_applyPercolate`, `_renderPercolatePill`; wire calls in `_paintAttendees`, `_paintAgenda`, `_paintOutcomes`, `_paintActionItems`; re-apply calls at end of each paint; teardown addition |
| `accord-meeting-setup.css` | `.ac-percolate-faded`, `.ac-percolate-raised`, `.ac-percolate-pill` styles |
| `version.js` | Operator-managed (IR65) |

---

## §12 — Discipline checklist

- `var` only
- `data-action="percolate-clear"` on dismiss button — no anonymous onclick
- `_clearPercolate()` resets both vars and DOM state atomically
- `pointer-events: none` on faded items prevents accidental second-click on a faded card triggering a new filter
- Re-apply pattern: every paint function checks `_percolateResourceId` and re-applies after innerHTML write
- `ev.stopPropagation()` on chip clicks prevents parent card click handlers from also firing
- No substrate changes — no migrations, no `pg_notify`
- `--ac-*` token prefix throughout

---

**Halt-and-surface after §10. Close-out must include V1–V3 IR64 findings and confirmation that re-apply fires correctly after drag-drop repaint (smoke test 6).**

**After seal: C-12 · CMD-ACCORD-SETUP-GATHERING-1 is unblocked.**

---

*End Commission · C-11 · CMD-ACCORD-SETUP-PERCOLATE-1.*
