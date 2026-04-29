# Brief — Mode A — MY VIEWS dialog overlay class repair (Brief 3.3) — CMD[NNN]

**Mode:** A (Architectural — small bounded repair, plus shared-module investigation)
**Surface:** my-views.html (lines 778 and 805 per agent diagnosis); share-dialog.js (read-only investigation)
**Doctrine version locked at brief authorship:** Style Doctrine v1.7
**Brief author:** Architect
**Date:** 2026-04-29
**Predecessor:** Brief 3.2 closed (inbox row dispatch routed correctly). Agent's smoke-test re-diagnosis surfaced a third layered defect: dialog overlays use MY NOTES class names that have no corresponding CSS in MY VIEWS, rendering invisibly off-screen.
**Arc context:** Brief 3.3 is the third emergency repair in Brief 3's blocking chain:
  - Brief 1, 1.5, 2, 2.5 — closed.
  - Brief 3 — in progress; halted at §3.1 setup.
  - Brief 3.1 — closed (ReferenceError fixed).
  - Brief 3.2 — closed (inbox row dispatch routed correctly).
  - **Brief 3.3 (this brief):** Repair the dialog overlay class names in the inline `view_removed` and `removed/declined` branches; investigate (don't fix) the shared module's `_notesShowViewInviteDialog` overlay class.
  - Brief 3.4 (anticipated): systematic sweep for remaining surface-fork token references — to be drafted after Brief 3.3 closes.

---

## §0 — Standing rules

- **Iron Rule 36** — terse hand-off (diff, smoke test, findings).
- **Iron Rule 37** — silent work-mode. **Recently reinforced and verified effective in Brief 1.5, 2.5, 3.1, 3.2.** Open hand-off with "Per Iron Rule 37 — silent work-mode acknowledged."
- **Iron Rule 39** — input enumeration, output specification.
- **Iron Rule 40** — halt-on-missing-input, terse transcript, test instructions, dev-console-first debugging.
- **Style Doctrine §0.1** — agents do not modify or extend doctrine.

**Brief 3.3 specific:**

- **Fix two known sites; investigate one related site.** Lines 778 and 805 in my-views.html are repaired. The shared module's overlay creation (in `_notesShowViewInviteDialog`) is investigated for the same class of bug but NOT repaired in this brief.
- **No CSS changes.** The corresponding `.views-invite-dialog-overlay` rule is reported by the agent as already existing at line 161; this brief does not add or modify CSS.
- **Visual smoke test.** Smoke test confirms operator SEES the dialog and can interact with it — not just that an overlay exists in DOM.

---

## §1 — Purpose

Brief 2's MY VIEWS fork copied MY NOTES' inline overlay-creation code verbatim, including the className string `'notes-invite-dialog-overlay'`. MY VIEWS' CSS defines `.views-invite-dialog-overlay` (line 161 per agent diagnosis), not `.notes-invite-dialog-overlay`. When the smart-routing handler creates an overlay with the wrong class name, no styles apply: `position: static` instead of `fixed`, no `z-index`, no full-screen positioning. The overlay element exists in DOM but renders below the viewport, invisible to the operator.

After Brief 3.3 ships:
1. Lines 778 and 805 in my-views.html emit `'views-invite-dialog-overlay'` (the class MY VIEWS' CSS actually defines).
2. The `view_removed` dialog raises visibly when Angela or Ron clicks a removal notification.
3. The `removed/declined` confirmation dialog raises visibly in the same flow.
4. Brief 3 §3.4 acceptance flow can run.

The shared module's `_notesShowViewInviteDialog` (in share-dialog.js) is investigated for the same class-name issue and reported as a finding. Repair to that module is OUT of this brief's scope.

---

## §2 — Architectural decisions locked

### §2.1 Option A — fix the consumers, not the CSS

Per architect adjudication: Option A wins over Option B. MY VIEWS code emits MY VIEWS class names. Adding co-class CSS rules to alias `.notes-*` selectors as MY VIEWS equivalents would solve the symptom but preserve the architectural smell. The class names should match the surface that emits them.

### §2.2 Two surgical edits at lines 778 and 805

Change `overlay.className = 'notes-invite-dialog-overlay'` to `overlay.className = 'views-invite-dialog-overlay'` at both sites. Preserve all other code in those branches verbatim.

### §2.3 Shared module — investigate, don't fix

The `view_invite` branch at line 773 delegates to `window._notesShowViewInviteDialog(note)` from share-dialog.js (Brief 2.5's shared module). This function presumably also creates an overlay with `notes-invite-dialog-overlay` class — making it broken when MY VIEWS calls it.

The agent investigates by:
- Confirming the function is defined in share-dialog.js
- Reporting the className it uses for its overlay
- Reporting the parent element / mount point

The agent does NOT modify share-dialog.js. Repair to the shared module is a separate scope decision because:
- Modifying it affects MY NOTES too (where the class name is correct)
- A proper fix likely parameterizes the class (caller passes which surface they're on) or generalizes the class name (`.invite-dialog-overlay` with no surface prefix)
- That decision belongs in a separate brief, not bundled with the inline-fix work here

The investigation result is a finding for follow-on adjudication.

### §2.4 No CSS additions or modifications

The agent confirms `.views-invite-dialog-overlay` exists in my-views.html at line 161 (per prior diagnosis). If it doesn't exist, agent halts and reports — adding the CSS rule would be Style Doctrine territory and outside this brief's scope.

---

## §3 — Required changes

### §3.1 Edit my-views.html line 778

Find the line within the `view_removed` branch where `overlay.className = 'notes-invite-dialog-overlay'` is assigned. Change to `'views-invite-dialog-overlay'`. Preserve everything else in the branch.

### §3.2 Edit my-views.html line 805

Same change at the `removed themselves / declined your invitation` branch. `'notes-invite-dialog-overlay'` → `'views-invite-dialog-overlay'`.

### §3.3 Verify CSS rule exists

Confirm `.views-invite-dialog-overlay` rule exists in my-views.html at or near line 161. Read enough of the rule to confirm it has `position: fixed` (or absolute) and a `z-index`. Report verification in hand-off.

If the rule is missing or the styling is incomplete, agent halts and reports.

### §3.4 Investigate share-dialog.js overlay creation

Read share-dialog.js. Locate `_notesShowViewInviteDialog`. Identify:
- The line where the overlay element is created
- The className it assigns
- The parent element it appends to

Report findings. Do NOT modify share-dialog.js.

### §3.5 Version bump

`js/version.js`: bump to `CMD[NNN]` (operator assigns at hand-off).

---

## §4 — Out of scope

- share-dialog.js modifications (investigation only — see §3.4)
- Any CSS additions or modifications anywhere
- Any change to the smart-routing handler's logic at line ~765
- Any change to overlay dismiss behavior, accept/decline button wiring, or dialog content
- Any change to MY NOTES code
- Any other class-name or token references in MY VIEWS (those will be addressed by anticipated Brief 3.4 systematic sweep)
- Any change to other dialog types (share dialog itself, etc.)

---

## §5 — Inputs

### §5.1 Files modified

- my-views.html (two surgical edits per §3.1, §3.2)
- js/version.js (CMD bump)

### §5.2 Files read for reference (not modified)

- my-views.html (post-Brief-3.2 state)
- share-dialog.js (post-Brief-2.5 state — for §3.4 investigation only)
- my-notes.html (post-Brief-2.5 state — for class name comparison if needed)

### §5.3 Files / code agent must NOT modify

- share-dialog.js
- my-notes.html
- compass.html, mw-tabs.js, mw-core.js, hud-shell.js
- Any CSS rule (existing or new)
- Any my-views.html code outside lines 778 and 805

### §5.4 Doctrine + reference

- Style Doctrine v1.7
- Iron Rules 36, 37, 39, 40 ratifications

### §5.5 Brief context

- Brief 2 hand-off (where the bug was introduced)
- Brief 2.5 hand-off (shared module extraction)
- Brief 3.1, 3.2 hand-offs (closed)
- Brief 3 (in progress)
- Agent's diagnostic transcript (this session)

---

## §6 — Definition of done

Brief 3.3 is complete when:

- my-views.html lines 778 and 805 emit `'views-invite-dialog-overlay'`
- `.views-invite-dialog-overlay` CSS rule confirmed at ~line 161
- share-dialog.js investigated; class name and mount point reported as findings
- Smoke test (§7) passes — operator visually confirms dialogs raise correctly
- `js/version.js` bumped
- No CSS changes
- No share-dialog.js changes
- No new doctrine, classes, color tokens, or font sizes introduced
- Hand-off conforms to §8

---

## §7 — Smoke test

Operator runs after deploy. **Smoke test is visual**, not DOM-inspection-only.

1. **Hard reset Compass on Browser 2 (Angela / User P1).** Console open.
2. **Click the `view_removed` notification in Angela's inbox** (the "Vaughn Staples removed you from view: Vaughn's Dashboard" row at row 0).
3. **Expected:** A visible dialog raises in the center of the viewport (or wherever the CSS positions it). Operator can SEE the dialog. NOT just an entry appearing in DOM somewhere off-screen.
4. **Operator clicks "OK" / "Acknowledge" / dismiss.** Dialog closes. Inbox row disappears (or marks as read per existing behavior).
5. **Repeat for the `view_invite` notification** at row 1 (the "Vaughn Staples invited you to view: Default" row).
6. **Expected:** A visible dialog raises. The dialog is from `_notesShowViewInviteDialog` — its visual presentation may differ from the inline `view_removed` dialog (different code path), but it must be visible and operational.
7. **If the `view_invite` dialog also renders invisibly off-screen**, the shared-module bug confirmed by §3.4 investigation is also blocking. Report as smoke test partial — but Brief 3.3 still closes on its literal scope (the two inline branches). The shared-module fix becomes a separate brief.
8. **MY NOTES regression on Browser 1**: Hard reset, click MY NOTES, click any inbox notification (if any). Verify dialog raises visibly (this exercises MY NOTES' `notes-invite-dialog-overlay` class which legitimately uses MY NOTES CSS).
9. **Console cleanliness**: No `Uncaught ReferenceError`, no 500s, no unexpected warnings.

If smoke test passes — both dialogs visible and operational, MY NOTES regression clean — Brief 3.3 closes. Brief 3.4 (systematic sweep) follows. Then Brief 3 protocol resumes.

If `view_invite` dialog still invisible (per step 7), Brief 3.3 closes anyway on its literal scope; the shared-module fix is sequenced separately.

---

## §8 — Hand-off format

Required output:

1. **Files modified** — one-liner per file.
2. **Diff** — unified diff for both edited lines.
3. **CSS verification** — confirm `.views-invite-dialog-overlay` rule exists; report its location, position property value, and z-index value.
4. **Shared module investigation result** — share-dialog.js's `_notesShowViewInviteDialog` overlay class name, mount point, and any relevant context. Recommendation for follow-on (parameterize / rename class / leave as-is for MY NOTES exclusivity).
5. **Smoke test result** — pass / partial-pass (per §7 step 7) / fail.
6. **Findings** — zero or more one-liners. Examples:
   - "share-dialog.js line N creates overlay with className `notes-invite-dialog-overlay` — same bug; recommend follow-on brief."
   - "`.views-invite-dialog-overlay` rule at line 161 has position:fixed, z-index:600 — verified."
7. **Test instructions** — verification steps for operator.

Per Iron Rule 37 — silent work-mode. Open hand-off with the standard acknowledgment line.

---

## §9 — Reference materials

**Files modified:**
- my-views.html
- js/version.js

**Files read for reference:**
- my-views.html (post-Brief-3.2)
- share-dialog.js (post-Brief-2.5)
- my-notes.html (post-Brief-2.5, not modified)

**Doctrine:**
- Style Doctrine v1.7
- iron-rule-36-ratification.md
- iron-rule-37-ratification.md
- iron-rule-39-ratification.md
- iron-rule-40-ratification.md
- work-mode-classification-doctrine.md (v1.0)

**Brief context:**
- Brief 2, 2.5, 3.1, 3.2 hand-offs
- Brief 3 (in progress)
- Agent's diagnostic transcript

---

## §10 — Narrative instruction block (paste-ready)

```
Apply brief-cmdNNN-myviews-overlay-class-repair.md (Brief 3.3
of the MY VIEWS persistence fork arc — third emergency repair
unblocking Brief 3).

Two surgical edits in my-views.html lines 778 and 805. Change
overlay.className = 'notes-invite-dialog-overlay' to
'views-invite-dialog-overlay'. The corresponding CSS rule
already exists in MY VIEWS at ~line 161; verify and report.

Investigate (do NOT modify) share-dialog.js's
_notesShowViewInviteDialog. Report the className it assigns,
mount point, and any related context.

Architectural decisions LOCKED in §2; do not re-litigate.
Option A (fix consumers, not CSS) won over Option B per
adjudication. The shared-module question is investigation-only;
modification is a separate scope decision.

§5.3 lists files you must NOT modify (share-dialog.js,
my-notes.html, CSS, etc.).

§7 has a 9-step smoke test. The smoke test is VISUAL — operator
must SEE the dialog raise, not just confirm an overlay exists
in DOM. Step 7 anticipates the view_invite dialog may still
fail (shared module bug confirmed by your §3.4 investigation);
that's an acceptable partial-pass on Brief 3.3's literal scope.

Per Iron Rule 37 — silent work-mode. Open hand-off with the
standard acknowledgment line.

Operator's user_id: 57b93738-6a2a-4098-ba12-bfffd1f7dd07.
Firm UUID: aaaaaaaa-0001-0001-0001-000000000001.

Operator will provide CMD number for version bump at hand-off.

Proceed.
```

---

*End of Brief — MY VIEWS dialog overlay class repair (Brief 3.3).*
