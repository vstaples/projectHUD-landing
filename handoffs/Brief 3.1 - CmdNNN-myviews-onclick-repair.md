# Brief — Mode A — MY VIEWS inbox/tray onclick repair (Brief 3.1) — CMD[NNN]

**Mode:** A (Architectural — small bounded repair)
**Surface:** my-views.html (lines 745 and 1255 per agent diagnosis)
**Doctrine version locked at brief authorship:** Style Doctrine v1.7
**Brief author:** Architect
**Date:** 2026-04-29
**Predecessor:** Brief 3 §3.1 setup surfaced an Uncaught ReferenceError blocking Brief 3 protocol execution
**Arc context:** Brief 3.1 is an emergency repair brief intercalated into Brief 3:
  - Brief 1, 1.5, 2, 2.5 — closed.
  - Brief 3 — in progress; halted at §3.1 setup when ReferenceError surfaced in Browser 2.
  - **Brief 3.1 (this brief):** Repair the MY VIEWS inbox/tray onclick handlers that emit `_notesOpenNote(...)` (undefined in MY VIEWS scope) instead of `_viewsOpenNote(...)` (the scoped local).
  - Brief 3 resumes immediately after Brief 3.1 ships.

---

## §0 — Standing rules

- **Iron Rule 36** — terse hand-off (diff, smoke test, findings).
- **Iron Rule 37** — silent work-mode. **Recently reinforced and verified effective in Brief 1.5 and Brief 2.5.** No mid-cycle narration. No reconsidered-choices narration. Per-edit reasoning capped at one sentence. Open hand-off with "Per Iron Rule 37 — silent work-mode acknowledged" as Brief 1.5 / 2.5 agents did.
- **Iron Rule 39** — input enumeration, output specification.
- **Iron Rule 40** — halt-on-missing-input, terse transcript, test instructions, dev-console-first debugging.
- **Style Doctrine §0.1** — agents do not modify or extend doctrine.

**Brief 3.1 specific:**

- **Smallest possible scope.** Two-line edit per agent's prior diagnosis. Do not expand scope.
- **No new architecture.** Both `_notesOpenNote` (MY NOTES) and `_viewsOpenNote` (MY VIEWS) already exist; this brief routes MY VIEWS' onclick markup to call the right one.
- **No symmetry sweep beyond the diagnosed sites.** If grep surfaces additional `_notesOpenNote` references in MY VIEWS, agent surfaces as findings; agent does NOT auto-fix beyond the two diagnosed lines without architect adjudication.

---

## §1 — Purpose

Brief 2's MY VIEWS fork preserved MY NOTES' inline `onclick="_notesOpenNote(...)"` strings when emitting MY VIEWS' inbox items (line 745 per agent) and tray chips (line 1255 per agent). Inline onclick handlers resolve against `window`. MY VIEWS deliberately scopes `_notesOpenNote` locally (per the "do NOT overwrite MY NOTES" comment) and exposes it as `window._viewsOpenNote` instead. The onclick markup never updated.

When User P1 (or any user receiving an invitation) opens MY VIEWS, the inbox panel renders with broken onclick markup. Clicking an invite throws `Uncaught ReferenceError: _notesOpenNote is not defined`. The acknowledgement form never raises.

After Brief 3.1 ships:
1. MY VIEWS inbox onclick handlers invoke `_viewsOpenNote(...)`, the scoped global.
2. MY VIEWS tray chip onclick handlers invoke `_viewsOpenNote(...)`.
3. Click on any invite in MY VIEWS inbox opens the acknowledgement form correctly.
4. MY NOTES' onclick handlers (using `_notesOpenNote`) are unaffected.
5. Brief 3 §3.4 acceptance flow can run.

---

## §2 — Architectural decisions locked

### §2.1 Scope is two known lines

Per agent diagnosis: my-views.html lines 745 (inbox items) and 1255 (tray chips). Agent confirms exact lines pre-edit (line numbers may shift if the file changed since diagnosis).

### §2.2 Symmetry sweep — surface findings, do not auto-fix

After the two known edits, agent runs `grep -n "_notesOpenNote" my-views.html` to find any additional references. If found, agent reports as a finding. The agent does NOT auto-fix additional references; architect adjudicates whether to expand scope or carve to follow-on.

Rationale: the bug pattern (MY VIEWS emitting MY NOTES' onclick names) may have other instances. But auto-fixing without architect review risks miscategorizing — some references might legitimately call MY NOTES' function (cross-surface link). Adjudication keeps scope bounded.

### §2.3 No regression on MY NOTES

`_notesOpenNote` continues to exist in `my-notes.html` (or in the shared module from Brief 2.5; agent confirms current home) and is exposed on `window.*` for MY NOTES' onclick handlers. This brief does NOT touch MY NOTES code, the shared module, or `_notesOpenNote`'s definition or exposure.

---

## §3 — Required changes

### §3.1 Edit my-views.html line 745

The inline `onclick="_notesOpenNote(...)"` becomes `onclick="_viewsOpenNote(...)"`. Preserve the rest of the onclick string verbatim (arguments, closing quote, etc.).

### §3.2 Edit my-views.html line 1255

Same change pattern. `_notesOpenNote` → `_viewsOpenNote`. Preserve everything else.

### §3.3 Symmetry sweep

```bash
grep -n "_notesOpenNote" my-views.html
```

Report any additional matches as findings. Do NOT modify them in this brief.

### §3.4 Verify `_viewsOpenNote` exists and is exposed

Confirm `my-views.html` line 3342 (per agent diagnosis) still contains `window._viewsOpenNote = _notesOpenNote` or equivalent exposure. If the line has changed and `_viewsOpenNote` is no longer exposed on `window.*`, the fix doesn't work — halt and report.

### §3.5 Version bump

`js/version.js`: bump to `CMD[NNN]` (operator assigns at hand-off).

---

## §4 — Out of scope

- Any additional `_notes*` reference repairs surfaced by symmetry sweep (findings only)
- Any change to MY NOTES code
- Any change to the shared module from Brief 2.5
- Any change to `_notesOpenNote` definition or its `window.*` exposure
- Any change to inbox or tray rendering logic beyond the onclick string
- Any change to acknowledgement form behavior (verifying it raises is the smoke test, not a fix target)

---

## §5 — Inputs

### §5.1 Files modified

- my-views.html (two surgical edits per §3.1, §3.2)
- js/version.js (CMD bump)

### §5.2 Files read for reference

- my-views.html (post-Brief-2.5 state)
- The shared module from Brief 2.5 (to confirm `_notesOpenNote` exposure for MY NOTES)
- my-notes.html (post-Brief-2.5 state, for symmetry reference; not modified)

### §5.3 Files / code agent must NOT modify

- my-notes.html
- The shared module from Brief 2.5
- compass.html
- mw-tabs.js, mw-core.js, hud-shell.js
- Any other onclick handler beyond the two diagnosed lines

### §5.4 Doctrine + reference

- Style Doctrine v1.7
- Iron Rules 36, 37, 39, 40 ratifications

### §5.5 Brief context

- Brief 2 hand-off (where the bug was introduced)
- Brief 2.5 hand-off (closed; not the bug source per agent diagnosis)
- Brief 3 (in progress; resumes after this brief ships)
- Agent's diagnosis transcript (paste-attached as input)

---

## §6 — Definition of done

Brief 3.1 is complete when:

- my-views.html lines 745 and 1255 (or wherever they currently are post any drift) emit `onclick="_viewsOpenNote(...)"` instead of `onclick="_notesOpenNote(...)"`
- Symmetry sweep run; any additional matches reported as findings, not auto-fixed
- `_viewsOpenNote` confirmed still exposed on `window.*`
- Smoke test (§7) passes
- `js/version.js` bumped
- No new CSS classes, color tokens, font sizes, or doctrine edits introduced
- No changes outside my-views.html and js/version.js
- Hand-off conforms to §8

---

## §7 — Smoke test

Operator runs after deploy:

1. **Hard reset Compass on Browser 2 (User P1, Angela Kim).**
2. **Open DevTools console**, filtered to errors.
3. **Click on the existing invitation in Angela's inbox** (the one already sitting there from Brief 3 §3.1 setup).
4. **Expected:** Acknowledgement / accept dialog opens. NO `Uncaught ReferenceError` in console.
5. **Repeat on Browser 3 (User P2, Ron White)** with Ron's pending invitation.
6. **Expected:** Same as above.
7. **MY NOTES regression test on Browser 1:** Hard reset Compass, click MY NOTES, click any note in the tree. Verify note opens (this exercises MY NOTES' `_notesOpenNote`, which must remain functional).

If smoke test passes, Brief 3.1 closes and Brief 3 resumes from §3.1 setup verification.

---

## §8 — Hand-off format

Required output:

1. **Files modified** — one-liner per file.
2. **Diff** — unified diff for both edited lines.
3. **Symmetry sweep result** — output of `grep -n "_notesOpenNote" my-views.html`. Any non-fixed matches enumerated.
4. **`_viewsOpenNote` exposure verification** — confirm the `window._viewsOpenNote = ...` line still exists at line 3342 (or wherever it currently resides).
5. **Smoke test result** — pass / fail / not run.
6. **Findings** — zero or more one-liners. Examples:
   - "Symmetry sweep surfaced N additional `_notesOpenNote` references at lines X, Y, Z. Not modified per §2.2; recommend follow-on brief if these are also bugs."
   - "Line numbers shifted: 745 → 7N, 1255 → 12M (post-Brief-2.5 drift)."
7. **Test instructions** — verification steps for operator.

Per Iron Rule 37 — work silently. Open hand-off with "Per Iron Rule 37 — silent work-mode acknowledged."

---

## §9 — Reference materials

**Files modified:**
- my-views.html
- js/version.js

**Files read for reference:**
- my-views.html (post-Brief-2.5 state)
- The shared module from Brief 2.5
- my-notes.html (post-Brief-2.5 state, not modified)

**Doctrine:**
- Style Doctrine v1.7
- iron-rule-36-ratification.md
- iron-rule-37-ratification.md
- iron-rule-39-ratification.md
- iron-rule-40-ratification.md
- work-mode-classification-doctrine.md (v1.0)

**Brief context:**
- Brief 2 hand-off
- Brief 2.5 hand-off
- Brief 3 (in progress)
- Agent's diagnosis (this session)

---

## §10 — Narrative instruction block (paste-ready)

```
Apply brief-cmdNNN-myviews-onclick-repair.md (Brief 3.1 of
the MY VIEWS persistence fork arc — emergency repair to
unblock Brief 3).

Two surgical edits in my-views.html: lines 745 and 1255
(per your prior diagnosis; confirm exact lines pre-edit).
Change `onclick="_notesOpenNote(...)"` to
`onclick="_viewsOpenNote(...)"`. Preserve the rest of each
onclick string verbatim.

Run symmetry sweep: grep -n "_notesOpenNote" my-views.html.
Surface any additional matches as findings. Do NOT auto-fix
beyond the two diagnosed lines.

Verify `_viewsOpenNote` is still exposed on window.* (line
3342 per diagnosis).

Architectural decisions LOCKED in §2; do not re-litigate.

§5.3 lists files you must NOT modify (my-notes.html, shared
module, compass.html, mw-tabs.js, etc.).

§7 has a 7-step smoke test the operator runs:
1-2. Console-clean check on Browser 2 (Angela).
3-4. Click invitation in Angela's inbox; acknowledgement
     form raises; no ReferenceError.
5-6. Same on Browser 3 (Ron).
7. MY NOTES regression — note opens correctly (tests
   _notesOpenNote in MY NOTES context).

Per Iron Rule 37 — silent work-mode. Open hand-off with
"Per Iron Rule 37 — silent work-mode acknowledged."

Operator's user_id: 57b93738-6a2a-4098-ba12-bfffd1f7dd07.
Firm UUID: aaaaaaaa-0001-0001-0001-000000000001.

Operator will provide CMD number for version bump at
hand-off time.

Proceed.
```

---

*End of Brief — MY VIEWS inbox/tray onclick repair (Brief 3.1).*
