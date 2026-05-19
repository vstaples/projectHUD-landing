# HANDOFF — CMD-ACCORD-MINUTES-1 v2 · Phase 2: Preview Modal

**Date:** 2026-05-19
**CMD:** M-01 · CMD-ACCORD-MINUTES-1 v2
**Operator:** Vaughn Staples
**Phase:** 2 of 4 — Preview button renders clean outbound document.

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-MINUTES-1_v2.md` end-to-end before proceeding.
Session protocol: terse mode; test Chrome connection first; Test Mode after
each code update — one checklist item at a time.
Iron Rules 36, 40 §1, 47, 64, 71 apply.
`var` only — no `let`/`const`.
No `setTimeout` for sequencing.
Deliver in §6 file order, then operator review note, then §7 checklist. Stop.

---

## §1 — CARRY-FORWARD

**Phase 1 deviation noted:** END MEETING button is hidden (not disabled).
Acceptable — no regression.

**`_excludedNodeIds` Set:** established in Live Capture Phase 3.
Excluded nodes must be omitted from the Preview document.

**Outcome status display mapping:**
`achieved` → ✓ Met · `partial` → Partial · `abandoned` → Unmet ·
`open` → Open · `carried` → Carried

**No INSERT into `accord_meeting_outcomes`** — trigger blocks on closed meetings.

---

## §2 — INPUTS

| File | Purpose |
|------|---------|
| `accord-live-capture.js` | Phase 1 output — add Preview modal |

---

## §3 — DELIVERABLES

1. `accord-live-capture.js` — Preview modal added
2. Operator review checkpoint before Phase 3

---

## §4 — BUILD SPEC

### 4.1 — Preview modal

Full-screen overlay modal. Not a separate page — renders over the review
mode shell. ESC or × closes it.

**Structure:**
```
[× Close]                    Preview — C-11 Percolate Smoke Test Meeting
─────────────────────────────────────────────────────────────────────────
[scrollable clean document]
```

Modal CSS:
```css
.ac-lc-preview-overlay {
  position:fixed; inset:0; z-index:200;
  background:var(--void); display:none;
  flex-direction:column; overflow:hidden;
}
.ac-lc-preview-overlay.open { display:flex; }
.ac-lc-preview-topbar {
  height:50px; flex-shrink:0; display:flex; align-items:center;
  gap:12px; padding:0 24px; background:var(--surface);
  border-bottom:1px solid var(--b0);
}
.ac-lc-preview-close {
  font-size:18px; color:var(--md); cursor:pointer; flex-shrink:0;
  transition:color .12s;
}
.ac-lc-preview-close:hover { color:var(--hi); }
.ac-lc-preview-title {
  font-size:13px; font-weight:500; color:var(--md);
}
.ac-lc-preview-doc {
  flex:1; overflow-y:auto; padding:40px;
  max-width:860px; margin:0 auto; width:100%;
}
```

### 4.2 — `_openPreview()` function

```javascript
function _openPreview() {
  var overlay = document.getElementById('ac-lc-preview-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ac-lc-preview-overlay';
    overlay.className = 'ac-lc-preview-overlay';
    overlay.innerHTML =
      '<div class="ac-lc-preview-topbar">' +
        '<span class="ac-lc-preview-close" onclick="AccordLiveCapture._closePreview()">✕</span>' +
        '<span class="ac-lc-preview-title">Preview — ' + _meeting.title + '</span>' +
      '</div>' +
      '<div class="ac-lc-preview-doc" id="ac-lc-preview-doc"></div>';
    document.body.appendChild(overlay);

    // ESC closes
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') AccordLiveCapture._closePreview();
    });
  }

  document.getElementById('ac-lc-preview-doc').innerHTML = _buildPreviewDocument();
  overlay.classList.add('open');
}

AccordLiveCapture._closePreview = function() {
  var overlay = document.getElementById('ac-lc-preview-overlay');
  if (overlay) overlay.classList.remove('open');
};
```

### 4.3 — `_buildPreviewDocument()` function

Renders the clean outbound document from in-memory data.
No review chrome — no checklist, no exclude buttons, no × deletes, no + Add.
Excluded nodes (`_excludedNodeIds`) are omitted entirely.

**Document structure:**

```
[Meeting title — 26px / 600]
[Stakes — italic, left border]

MEETING DETAILS
  Date · Duration · Organizer · Workstream
  Attended chips · Absent chips

INTENDED OUTCOMES
  [status flag] [description] [owner]
  — if none: "No outcomes recorded."

AGENDA & CAPTURES
  Per item: [N] [title]
    Entries (excluding _excludedNodeIds):
    [badge] [summary] [author] [time]
  — if item has no non-excluded entries: omit item entries block

DECISIONS
  [DC-NNN] [summary] [author · time]
  — if none: "No decisions recorded."

ACTION ITEMS
  [AX-NNN] [summary] [owner] [due]
  — if none: "No action items recorded."

RISKS & DISSENTS
  [RK/DS-NNN] [summary] [author]
  — if none: "No risks recorded."

PARKING LOT
  [●] [summary] [source item]
  — if none: "No parking lot items."
```

**Data source:** use already-loaded in-memory arrays from the live capture
session. Do not re-query Supabase for the preview render.
- Agenda items: from `_agendaItems` (or equivalent state var)
- Nodes per agenda item: from loaded node arrays
- Decisions/Actions/Risks/Parking: from loaded section arrays
- Attendees: from `_attendees`
- Meeting details: from `_meeting`

If any array is empty or not yet loaded, show the "None recorded" fallback.

**Preview document CSS** (scoped to `.ac-lc-preview-doc`):
```css
.ac-lc-preview-doc .pv-title {
  font-size:26px; font-weight:600; color:var(--hi); margin-bottom:8px; }
.ac-lc-preview-doc .pv-stakes {
  font-size:13px; color:var(--md); font-style:italic;
  border-left:3px solid var(--b2); padding-left:10px;
  margin-bottom:24px; line-height:1.5; }
.ac-lc-preview-doc .pv-sec-hdr {
  font-size:12px; font-weight:700; letter-spacing:.09em;
  text-transform:uppercase; color:var(--hi);
  border-bottom:1px solid var(--b1); padding-bottom:6px;
  margin:24px 0 12px; display:flex; align-items:center; gap:8px; }
.ac-lc-preview-doc .pv-sec-bar {
  width:4px; height:14px; border-radius:2px; flex-shrink:0; }
.ac-lc-preview-doc .pv-meta-grid {
  display:grid; grid-template-columns:auto 1fr;
  gap:4px 16px; margin-bottom:14px; }
.ac-lc-preview-doc .pv-meta-lbl {
  font-size:12px; color:var(--lo); font-weight:600; }
.ac-lc-preview-doc .pv-meta-val {
  font-size:13px; color:var(--hi); }
.ac-lc-preview-doc .pv-row {
  display:flex; align-items:flex-start; gap:10px;
  padding:7px 0; border-bottom:1px solid rgba(255,255,255,.04); }
.ac-lc-preview-doc .pv-row:last-child { border-bottom:none; }
.ac-lc-preview-doc .pv-badge {
  font-size:10px; font-weight:700; padding:0 5px; border-radius:2px;
  border:1px solid; white-space:nowrap; margin-top:2px; line-height:1.5;
  flex-shrink:0; }
.ac-lc-preview-doc .pv-text {
  font-size:13px; color:var(--hi); flex:1; line-height:1.5; }
.ac-lc-preview-doc .pv-meta-sm {
  font-size:11px; color:var(--lo); flex-shrink:0; }
.ac-lc-preview-doc .pv-empty {
  font-size:13px; color:var(--lo); font-style:italic; padding:6px 0; }
.ac-lc-preview-doc .pv-agenda-item {
  margin-bottom:16px; }
.ac-lc-preview-doc .pv-agenda-title {
  font-size:14px; font-weight:500; color:var(--hi);
  margin-bottom:6px; display:flex; align-items:center; gap:8px; }
.ac-lc-preview-doc .pv-agenda-num {
  width:22px; height:22px; border-radius:50%;
  background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.13);
  font-size:11px; font-weight:600; color:var(--hi);
  display:flex; align-items:center; justify-content:center; flex-shrink:0; }
```

---

## §5 — IRON RULE REMINDERS

**IR71:** Preview renders from in-memory data only. No Supabase queries
during preview render.

**`_excludedNodeIds`:** must be checked for every node rendered in preview.
If `_excludedNodeIds.has(node.node_id)` → skip that node entirely.

---

## §6 — FILE ORDER

1. `accord-live-capture.js` — full file with Preview modal added

Then: operator review note.
Then: §7 checklist verbatim. Stop.

---

## §7 — PHASE 2 CHECKLIST

- [ ] Preview → button click opens full-screen overlay
- [ ] Overlay topbar: × close button + "Preview — [meeting title]"
- [ ] ESC key closes overlay
- [ ] × button closes overlay
- [ ] Preview document renders: meeting title (26px/600), stakes line
- [ ] Meeting Details: date, duration, organizer, workstream, attended, absent
- [ ] Intended Outcomes: status flags + description + owner; "No outcomes recorded." if empty
- [ ] Agenda & Captures: per-item title + non-excluded entries only
- [ ] Excluded nodes absent from preview (checked via _excludedNodeIds)
- [ ] Decisions: badge + summary + author/time; "No decisions recorded." if empty
- [ ] Action Items: badge + summary + owner + due; "No action items recorded." if empty
- [ ] Risks & Dissents: badge + summary; "No risks recorded." if empty
- [ ] Parking Lot: dot + summary + source; "No parking lot items." if empty
- [ ] No review chrome in preview (no ×, no Exclude, no + Add, no checklist)
- [ ] Renders from in-memory data — no Supabase queries
- [ ] Review mode canvas unaffected after closing preview
- [ ] `var` only — no `let`/`const`

---

**Ship it.**
