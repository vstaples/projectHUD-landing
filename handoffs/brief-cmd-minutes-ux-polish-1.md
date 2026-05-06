# Brief · Minutes UX Polish · CMD-MINUTES-UX-POLISH-1

## §0 — Standing rules for fresh agent

Read before proceeding.

**Iron Rule 36, 37, 38, 39, 40** — base operating discipline.
**Iron Rule 51** — class-conditional treatments at construction time.
**Iron Rule 52 §4** — function-name and logical-concern collision check.
**Iron Rule 64** — codebase-as-spec; survey existing patterns before introducing new mechanisms.
**Iron Rule 65** — render-version dual-pin applies only to template body changes. **This CMD does NOT modify any render template body bytes; `RENDER_VERSION` does NOT need to move. Bump only `js/version.js`.**

This is a small focused CMD bundling five UX polish items from the Minutes-surface backlog accumulated during prior CMD testing cycles (CMD-PROJECTION-ENGINE-2, CMD-MINUTES-TEST-INFRA-1). No substrate, no doctrine, no architectural concerns. Estimated effort: 3-4 hours.

---

## §1 — Purpose

Five UX polish items have accumulated from operator feedback during prior CMD testing. Each is small individually; bundled together they materially improve the Minutes surface's daily usability.

After CMD-MINUTES-UX-POLISH-1 ships:

1. The `.pill-rendered` chip uses a brighter green (currently reads gray)
2. The "PRINT / SAVE AS PDF" button is renamed to "PRINT" (Download PDF already covers Save-as-PDF)
3. A new "VIEW PDF" button opens a right-side slide-in panel for inline PDF preview
4. The right-side history panel gets a "History" label at the top
5. Rail cards display a short meeting_id prefix for cross-reference during testing

The five items have no inter-dependencies. They can be applied in any order; verification subtests are independent.

---

## §2 — Scope

### In scope

- Five UX changes per §3
- Behavioral verification per §5
- Pin bump in `js/version.js` (no `RENDER_VERSION` change per Iron Rule 65)
- Hand-off per §7

### Out of scope

- Any changes to the render template body or Edge Function (Iron Rule 65 does not fire)
- Any substrate changes
- Any other Minutes-surface features beyond the five named items
- Other surface modules (Live Capture, Living Document, Decision Ledger, Digest & Send) beyond regression checks
- Any new CoC events
- Schema or RLS changes

---

## §3 — Implementation specification

### §3.1 Brighter green for `.pill-rendered` chip

**Current state:** the `.pill-rendered` chip in the render-status card or rail-card area renders in a gray or muted color, not visually distinct from "in progress" or other states.

**Change:** update the CSS for `.pill-rendered` to use a brighter green that clearly communicates "render complete / success." Match the green token established in `accord.html`'s render-status patterns (or compass.html's success-pill convention if more recent).

**Codebase survey requirement:** locate the existing green token used elsewhere in the project for success states (e.g., `LIVE` pill, `ratified` badge, run-status `pass` indicator). Use that token. Do NOT introduce a new green hex value.

**File:** likely `accord.html` or a CSS-styling section within `js/accord-minutes.js`.

### §3.2 Rename "PRINT / SAVE AS PDF" → "PRINT"

**Current state:** the button reads "PRINT / SAVE AS PDF" — confusing because the existing "Download PDF" button already covers Save-as-PDF semantically.

**Change:** rename the button to simply "PRINT". The button's behavior is unchanged (opens print preview / browser print dialog). Pure text change.

**File:** likely `accord.html` (if statically declared) or `js/accord-minutes.js` (if programmatically set).

**Check:** if there's an aria-label or other accessibility attribute echoing the button text, update it to match.

### §3.3 Add "VIEW PDF" button with right-side slide-in panel

**Current state:** to view a rendered PDF, the operator must click "Download PDF" and open the file from their downloads folder. Friction during testing and review.

**Change:** add a new "VIEW PDF" button alongside the existing Download/Print buttons. Clicking it opens a right-side slide-in panel that displays the PDF inline (using `<iframe>` or `<embed>` against the signed URL).

**Slide-in panel specification:**
- Slides in from the right edge over the existing surface content
- Default width ~50% of viewport (operator can resize via drag handle on left edge if scope permits)
- Has a clear "Close" affordance (X button top-right, ESC keyboard shortcut, or click outside)
- Loads the rendered HTML or PDF artifact via signed URL (the same URL used by Download)
- Closes cleanly without affecting the underlying Minutes surface state

**Codebase survey requirement:** check whether other surfaces use a similar slide-in pattern (Cadence reviewer panel, Compass detail panes, etc.). If a canonical slide-in component exists, use it. If not, implement a minimal slide-in following established CSS conventions in the codebase.

**Behavioral subtlety:** if the rendered file is HTML (not PDF), the iframe still works — the slide-in displays whatever the signed URL serves. The button label stays "VIEW PDF" for operator clarity even when the actual artifact is HTML; the file-extension distinction is not user-facing.

**File:** likely `accord.html` (markup) + `js/accord-minutes.js` (slide-in logic).

### §3.4 Add "History" label at top of right-side history panel

**Current state:** the right-side panel showing prior renders has no label. Operators may not realize what they're looking at, especially first-time users.

**Change:** add a simple "History" label at the top of the panel. Match the typography of other surface labels in the Minutes UI (likely a small-caps amber overline or similar; the agent surveys for the canonical pattern).

**File:** likely `accord.html` (markup) or `js/accord-minutes.js` (if dynamically rendered).

### §3.5 Short meeting_id prefix on rail cards

**Current state:** rail cards in the Minutes meeting list display only the meeting title. During testing it's hard to cross-reference a specific meeting by ID without opening it.

**Change:** display a short prefix of the `meeting_id` (first 8 characters) below the title in muted typography. Format suggestion: `8ac92d42 · 2 renders` (combining short ID with the existing render count if shown).

**Codebase survey requirement:** match the typography convention for secondary metadata on rail cards (font size, color, spacing).

**File:** `js/accord-minutes.js` (rail card rendering logic).

---

## §4 — Codebase survey requirements (Iron Rule 64)

Before applying changes, the agent surveys:

1. **For green token (§3.1)** — search the codebase for canonical success-state green hex values; identify the established token to reuse
2. **For button label location (§3.2)** — confirm whether "PRINT / SAVE AS PDF" is HTML-static or JS-set
3. **For slide-in pattern (§3.3)** — search for existing slide-in / drawer / panel implementations across surfaces; identify whether a reusable pattern exists
4. **For panel-label typography (§3.4)** — survey existing surface labels; identify the canonical pattern (overline, header tag, font size)
5. **For rail-card metadata typography (§3.5)** — survey existing rail-card secondary-metadata patterns

If any survey reveals a divergent pattern from §3 specifications, halt and surface — the brief defers to established conventions per Iron Rule 64.

---

## §5 — Behavioral verification

### §5.1 Sentinel — code identity

1. Hard-refresh `accord.html`. Console banner shows CMD-MINUTES-UX-POLISH-1.
2. Verify `_PROJECTHUD_VERSION` matches.
3. **PASS** = post-CMD code is loaded.

### §5.2 Brighter green `.pill-rendered`

1. Navigate to Minutes surface; select a meeting with a successful render.
2. Verify the `.pill-rendered` chip displays in the canonical success-green token (not gray).
3. Compare side-by-side with another success-state indicator elsewhere in the UI; verify visual consistency.
4. **PASS** = chip renders in brighter green matching canonical success-state token.

### §5.3 PRINT button rename

1. Locate the formerly-"PRINT / SAVE AS PDF" button on the Minutes surface.
2. Verify the button text now reads "PRINT".
3. Click it; verify the print preview / browser print dialog opens (existing behavior preserved).
4. **PASS** = rename applied and functional.

### §5.4 VIEW PDF slide-in

1. Locate the new "VIEW PDF" button on the Minutes surface.
2. Click it; verify the right-side slide-in panel opens.
3. Verify the PDF (or HTML) renders inline within the slide-in.
4. Verify the close affordance works (X button, ESC, or click outside).
5. Verify the slide-in does not disturb the underlying Minutes surface state (the meeting selection, scroll position, etc. are preserved).
6. Test with multiple template renders for the same meeting (Working Session, Technical Briefing, Executive Briefing, Personal Digest); verify each renders correctly in the slide-in.
7. **PASS** = slide-in opens, renders artifact, closes cleanly.

### §5.5 History label

1. Navigate to a meeting with multiple renders in history.
2. Verify the right-side history panel displays a "History" label at the top.
3. Verify the label's typography matches the canonical surface-label convention (operator-judged).
4. **PASS** = label present and visually consistent.

### §5.6 Rail card ID prefix

1. Open the Minutes surface meeting list rail.
2. Verify each rail card displays a short meeting_id prefix below the title.
3. Verify the prefix matches the actual `meeting_id` (first 8 characters).
4. Verify the typography is muted/secondary (not visually competing with the title).
5. **PASS** = ID prefix displayed correctly across rail cards.

### §5.7 Existing CMD regression

1. Live Capture, Living Document, Decision Ledger, Digest & Send — all surfaces load without errors.
2. End a meeting; verify auto-render fires correctly with the renamed PRINT button preserved.
3. Existing renders downloadable (Download PDF still works).
4. Picker UI on Minutes surface (Working Session / Technical Briefing / Executive Briefing / Personal Digest) intact.
5. Aegis Library + playbook execution unaffected.
6. **PASS** = no regression.

### §5.8 IR45 vocabulary preserved

1. Grep all new/modified UI strings for: confidence | probability | certainty | likelihood | posterior | prior | meter | gauge.
2. **PASS** = zero matches in user-facing text.

---

## §6 — Consumer enumeration (Iron Rule 38)

| File | Effect |
|---|---|
| `accord.html` | Modified — button rename (§3.2 if HTML-static); VIEW PDF button markup (§3.3); History label markup (§3.4); CSS adjustments for `.pill-rendered` (§3.1) and slide-in panel |
| `js/accord-minutes.js` | Modified — VIEW PDF slide-in logic; rail card ID prefix rendering; possibly button text if JS-set |
| `js/version.js` | Pin bump to CMD-MINUTES-UX-POLISH-1 |

**No changes to:**
- Edge Function `render-minutes/index.ts` (Iron Rule 65: no template body changes)
- Schema (no migrations)
- RLS policies
- CoC events
- Other surface modules

---

## §7 — Hand-off format

Required output:

1. Files modified — one-liner per file.
2. Diff — unified diff for each modified file.
3. Smoke test result.
4. Behavioral verification results — per §5 subtest, with explicit PASS/FAIL.
5. Findings — particularly:
   - Whether canonical green token was reused or required adaptation
   - Whether button text was statically declared or programmatically set
   - Whether existing slide-in pattern was reused or required new implementation
   - Any architectural questions surfaced during the codebase survey

---

## §8 — Reference materials

Required inputs (halt per Iron Rule 40 §1.1 if any are missing):

- This brief
- Current `accord.html` (post-CMD-COC-ACTOR-RESOURCE-1)
- Current `js/accord-minutes.js`
- Current `js/version.js`
- All Iron Rules ratifications 36-65 + IR58 amendment

---

## §9 — Agent narrative instruction block

```
Apply brief-cmd-minutes-ux-polish-1.md.

Five UX polish items bundled as a small focused CMD. Estimated 
effort: 3-4 hours. Single-focus discipline applies despite 
multiple items because they share the Minutes surface scope.

Items:
1. Brighter green for .pill-rendered chip (§3.1)
2. Rename "PRINT / SAVE AS PDF" → "PRINT" (§3.2)
3. Add "VIEW PDF" button + right-side slide-in panel (§3.3)
4. Add "History" label to right-side history panel (§3.4)
5. Short meeting_id prefix on rail cards (§3.5)

Iron Rule 64 strictly applies: survey codebase for canonical 
green token, button-label location, existing slide-in pattern, 
label typography, rail-card metadata typography. Match 
established conventions; do not invent.

Iron Rule 65 does NOT fire: no template body changes. Bump 
js/version.js only; RENDER_VERSION constant in render-minutes/
index.ts unchanged.

§5 specifies eight behavioral verification subtests. §5.4 
(VIEW PDF slide-in) is the most complex; verify across all 
four template variants.

Hand-off format per §7: files, diff, smoke test, §5 results, 
findings.

Halt on missing input. Halt if any §5 subtest fails.

Proceed.
```

---

*End of Brief — Minutes UX Polish (CMD-MINUTES-UX-POLISH-1).*
