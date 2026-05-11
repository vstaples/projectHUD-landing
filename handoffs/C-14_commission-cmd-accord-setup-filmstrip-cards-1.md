# Commission · C-14 · CMD-ACCORD-SETUP-FILMSTRIP-CARDS-1

**Phase:** Wave 4 · 1 — Filmstrip card information density
**Authored:** 2026-05-11
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Accord Meeting Setup Shell — Requirements Specification v1.1 §4; operator direction 2026-05-11
**Predecessor:** Setup Shell polish phase complete (C-13, X-11–X-15 series)
**Successor:** C-15 (TBD)
**Coding agent:** execute sequentially; halt-and-surface after §8

---

## §1 — Scope

Enrich filmstrip cards with progressive information density. Cards currently show only
a date label and gradient thumb. This CMD adds:

1. **Dot indicators** — always visible along top edge of every card; one dot per tag
   type present in that meeting (cyan=decision, amber=action, rose=dissent, violet=risk)
2. **Seq ID tier** — appears when card height ≥ 90px; shows `DC-14 · AX-03` style labels
3. **Full summary tier** — appears when card height ≥ 140px; seq ID + truncated owner/summary

**Data approach:** batch-fetch node counts + top seq IDs for all visible frame meeting IDs
in one query after filmstrip renders. Enrich cards in place — no filmstrip re-render.

**What does NOT ship:**
- Inline editing from filmstrip cards
- Click-to-expand card detail (that's scrub — already C-05)
- Node content from sealed meetings redacted for non-organizers (privacy — future CMD)
- More than 4 seq ID lines per card regardless of height

---

## §2 — IR64 verification (before writing any code)

**V1 — Confirm frame dataset and card HTML structure:**
```javascript
var frame = document.querySelector('.ac-film-frame');
console.log('innerHTML:', frame?.innerHTML);
console.log('dataset:', JSON.stringify(frame?.dataset));
console.log('computed height:', window.getComputedStyle(frame)?.height);
```
Expected: `meetingId` in dataset, `ac-film-thumb` + `ac-film-meta` in innerHTML,
height varies with filmstrip zone size. Confirm no existing dot or node elements.

**V2 — `accord_nodes` tag values confirmed:**
From schema inventory: `note | decision | action | risk | question | dissent`
Dot types: `decision` (cyan), `action` (amber), `dissent` (rose), `risk` (rose)
Note and question nodes do not get dots — they are process noise in this context.
Document as carry-forward.

**V3 — Batch query feasibility:**
```javascript
// Confirm all frame meeting IDs are accessible
var ids = Array.from(document.querySelectorAll('.ac-film-frame'))
  .map(function(f) { return f.dataset.meetingId; })
  .filter(Boolean);
console.log('meeting IDs:', ids);
console.log('count:', ids.length);
```
Expected: 1–10 IDs. Batch query uses `meeting_id=in.(id1,id2,...)`.

Report V1–V3 in close-out.

---

## §3 — No substrate changes

All data is in `accord_nodes`. No new columns. No migrations.

---

## §4 — Data fetch

Called once after `_paintFilmstrip()` completes. Enriches all visible cards.

```javascript
var _filmCardToken = 0;

function _enrichFilmCards() {
  var myToken = ++_filmCardToken;

  var frames = document.querySelectorAll('.ac-film-frame[data-meeting-id]');
  if (!frames.length) return;

  var ids = Array.from(frames).map(function(f) {
    return f.dataset.meetingId;
  }).filter(Boolean);

  if (!ids.length) return;

  // Fetch top nodes per meeting — decisions + actions + dissents + risks
  // Limit 6 per meeting (enough for full tier); order by tag priority then seq_number
  API.get(
    'accord_nodes?meeting_id=in.(' + ids.join(',') + ')' +
    '&tag=in.(decision,action,dissent,risk)' +
    '&sealed_at=not.is.null' +   // sealed meetings only — content is committed
    '&select=meeting_id,tag,seq_id,summary,created_by' +
    '&order=meeting_id.asc,seq_number.asc' +
    '&limit=60'   // 6 nodes × max 10 frames
  ).then(function(nodes) {
    if (_filmCardToken !== myToken) return;
    nodes = nodes || [];

    // Group by meeting_id
    var byMeeting = {};
    nodes.forEach(function(n) {
      if (!byMeeting[n.meeting_id]) byMeeting[n.meeting_id] = [];
      byMeeting[n.meeting_id].push(n);
    });

    // Enrich each frame
    frames.forEach(function(frame) {
      var mid = frame.dataset.meetingId;
      if (!mid) return;
      var meetingNodes = byMeeting[mid] || [];
      _paintFilmCardContent(frame, meetingNodes);
    });
  }).catch(function(e) {
    console.error('[AccordMeetingSetup] filmcard enrich failed', e);
  });
}
```

---

## §5 — Card content paint

```javascript
function _paintFilmCardContent(frame, nodes) {
  // Remove any existing enrichment
  var existing = frame.querySelector('.ac-film-dots');
  if (existing) existing.remove();
  var existingNodes = frame.querySelector('.ac-film-nodes');
  if (existingNodes) existingNodes.remove();

  if (!nodes.length) return;

  // ── Dot strip (always rendered) ──────────────────────
  var tagTypes = {};
  nodes.forEach(function(n) { tagTypes[n.tag] = true; });

  var dotHtml = '<div class="ac-film-dots">';
  if (tagTypes.decision) dotHtml += '<span class="ac-film-dot ac-film-dot--decision"></span>';
  if (tagTypes.action)   dotHtml += '<span class="ac-film-dot ac-film-dot--action"></span>';
  if (tagTypes.dissent)  dotHtml += '<span class="ac-film-dot ac-film-dot--dissent"></span>';
  if (tagTypes.risk)     dotHtml += '<span class="ac-film-dot ac-film-dot--risk"></span>';
  dotHtml += '</div>';

  // Insert dot strip as first child of frame (above thumb)
  frame.insertAdjacentHTML('afterbegin', dotHtml);

  // ── Node lines (rendered but visibility CSS-controlled) ──
  // Priority order: decisions first, then actions, then dissents, then risks
  var tagOrder = ['decision', 'action', 'dissent', 'risk'];
  var sorted = nodes.slice().sort(function(a, b) {
    return tagOrder.indexOf(a.tag) - tagOrder.indexOf(b.tag);
  });

  var nodesHtml = '<div class="ac-film-nodes">';
  sorted.slice(0, 4).forEach(function(n) {
    var tagCls = 'ac-film-node--' + n.tag;
    nodesHtml += '<div class="ac-film-node ' + tagCls + '">';
    // Seq ID (always shown when nodes visible)
    nodesHtml += '<span class="ac-film-node-seq">' + esc(n.seq_id || '') + '</span>';
    // Summary (shown only at full tier)
    if (n.summary) {
      nodesHtml += '<span class="ac-film-node-summary">' +
                   esc(n.summary.slice(0, 40)) + '</span>';
    }
    nodesHtml += '</div>';
  });
  nodesHtml += '</div>';

  frame.insertAdjacentHTML('beforeend', nodesHtml);
}
```

---

## §6 — Progressive reveal via CSS container queries

Use CSS container queries to show/hide content tiers based on card height.
The filmstrip card is the container.

```css
/* ── Dots — always visible ──────────────────────────── */
.ac-film-dots {
  position: absolute;
  top: 4px;
  left: 4px;
  display: flex;
  gap: 3px;
  z-index: 2;
}
.ac-film-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ac-film-dot--decision { background: var(--ac-cyan); }
.ac-film-dot--action   { background: var(--ac-amber); }
.ac-film-dot--dissent  { background: var(--ac-rose); }
.ac-film-dot--risk     { background: var(--ac-rose); opacity: 0.7; }

/* ── Card must be position:relative for dot absolute positioning ── */
.ac-film-frame { position: relative; }

/* ── Node lines container ────────────────────────────── */
.ac-film-nodes {
  position: absolute;
  bottom: 20px;   /* above date label */
  left: 0;
  right: 0;
  padding: 0 5px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
  /* Hidden by default — revealed by height classes below */
  display: none;
}

.ac-film-node {
  display: flex;
  align-items: baseline;
  gap: 4px;
  line-height: 1.2;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ac-film-node-seq {
  font-family: var(--ac-font-mono);
  font-size: 7px;
  font-weight: 700;
  flex-shrink: 0;
}
.ac-film-node-summary {
  font-size: 7px;
  color: var(--ac-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* Hidden at compact tier — shown only at full tier */
  display: none;
}

/* Tag colors for seq IDs */
.ac-film-node--decision .ac-film-node-seq { color: var(--ac-cyan); }
.ac-film-node--action   .ac-film-node-seq { color: var(--ac-amber); }
.ac-film-node--dissent  .ac-film-node-seq { color: var(--ac-rose); }
.ac-film-node--risk     .ac-film-node-seq { color: var(--ac-rose); opacity: 0.7; }

/* ── Tier activation via height classes ──────────────── */
/* Applied by JS ResizeObserver on each frame */

/* Compact tier: ≥ 90px — show seq IDs */
.ac-film-frame--compact .ac-film-nodes {
  display: flex;
}

/* Full tier: ≥ 140px — show seq ID + summary */
.ac-film-frame--full .ac-film-nodes {
  display: flex;
}
.ac-film-frame--full .ac-film-node-summary {
  display: inline;
}
```

---

## §7 — ResizeObserver for tier classes

Applied once after `_enrichFilmCards` completes. Watches each frame and applies tier class based on rendered height.

```javascript
var _filmResizeObserver = null;

function _initFilmCardTiers() {
  if (typeof ResizeObserver === 'undefined') return;

  _filmResizeObserver = new ResizeObserver(function(entries) {
    entries.forEach(function(entry) {
      var frame  = entry.target;
      var height = entry.contentRect.height;
      frame.classList.remove('ac-film-frame--compact', 'ac-film-frame--full');
      if (height >= 140) {
        frame.classList.add('ac-film-frame--full');
      } else if (height >= 90) {
        frame.classList.add('ac-film-frame--compact');
      }
    });
  });

  document.querySelectorAll('.ac-film-frame').forEach(function(frame) {
    _filmResizeObserver.observe(frame);
  });
}

function _stopFilmCardTiers() {
  if (_filmResizeObserver) {
    _filmResizeObserver.disconnect();
    _filmResizeObserver = null;
  }
}
```

Call `_initFilmCardTiers()` after `_enrichFilmCards()` resolves.
Call `_stopFilmCardTiers()` from `teardown()`.

---

## §8 — Integration points

**After `_paintFilmstrip()` completes** — add at the end of the filmstrip paint callback:

```javascript
// Enrich cards with node data after frames are in DOM
_enrichFilmCards();
// Start tier observer after enrichment
setTimeout(function() {
  _initFilmCardTiers();
}, 50);  // brief delay to allow enrichment paint to settle
```

**In `teardown()`:**
```javascript
_stopFilmCardTiers();
_filmCardToken = 0;
```

---

## §9 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Cards render dots | After filmstrip loads, each card with decisions shows cyan dot top-left. Action = amber dot. Dissent = rose dot. Cards with no qualifying nodes show no dots. |
| 2 | Dots present at minimum card size | At default small card size (< 90px), only dots and date label visible. No node text. |
| 3 | Compact tier at 90px+ | Expand filmstrip zone height until cards reach 90px. Seq IDs appear: `DC-14`, `AX-03`. No summary text. |
| 4 | Full tier at 140px+ | Expand further to 140px+. Summary text appears beside seq IDs: `AX-03 Ben Roy must confirm…` truncated. |
| 5 | Tier responds to resize | Shrink filmstrip zone. Cards drop from full → compact → minimal as height decreases. Classes update via ResizeObserver. |
| 6 | Cards with no nodes | Meeting with zero qualifying nodes shows no dots, no node lines at any size. Date only. |
| 7 | Scrub still works | Click any card. Scrub overlay fires correctly (C-05 behavior). Node content in card doesn't interfere with click handler. |
| 8 | Teardown | Navigate away. ResizeObserver disconnected. No memory leak. |

---

## §10 — Files manifest

| File | Change |
|---|---|
| `accord-meeting-setup.js` | `_enrichFilmCards()`, `_paintFilmCardContent()`, `_initFilmCardTiers()`, `_stopFilmCardTiers()`; call from filmstrip paint callback; teardown additions |
| `accord-meeting-setup.css` | Dot strip, node lines, tier classes, ResizeObserver class targets |
| `version.js` | Operator-managed (IR65) |

---

## §11 — Discipline checklist

- `var` only
- Token pattern: `_filmCardToken` on `_enrichFilmCards`
- Batch query: one API call for all frame meeting IDs — not one call per frame
- `sealed_at=not.is.null` filter — only committed node content in cards
- Max 4 nodes per card regardless of tier
- `position: relative` on `.ac-film-frame` — required for dot absolute positioning; confirm C-05 didn't set `position` to something else
- ResizeObserver handle stored in `_filmResizeObserver`; disconnected in `_stopFilmCardTiers` and `teardown()`
- `setTimeout(50)` before `_initFilmCardTiers` — allows enrichment innerHTML to settle before observer fires first measurement
- No substrate changes
- `--ac-*` token prefix throughout

---

**Halt-and-surface after §9. Close-out must confirm: V1 dot positioning (absolute, not interfering with scrub), smoke test 5 (ResizeObserver tier transitions), smoke test 7 (scrub unaffected).**

**After seal: C-14 closes. Wave 4 opens.**

---

*End Commission · C-14 · CMD-ACCORD-SETUP-FILMSTRIP-CARDS-1.*
