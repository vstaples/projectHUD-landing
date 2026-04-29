# Brief — Mode A — Share dialog extraction to shared module (Brief 2.5) — CMD[NNN]

**Mode:** A (Architectural — extraction of shared component)
**Surface:** my-notes.html (extract from) + my-views.html (consume from) + new shared module file + loader updates
**Doctrine version locked at brief authorship:** Style Doctrine v1.7
**Brief author:** Architect
**Date:** 2026-04-29
**Predecessor:** Brief 2 of arc — closed; agent's finding 11 documented the share-dialog dependency as deferred
**Arc context:** Brief 2.5 severs MY VIEWS' architectural dependency on MY NOTES at the share-dialog layer:
  - **Brief 1 (closed):** Schema fork.
  - **Brief 1.5 (closed):** RLS recursion fix.
  - **Brief 2 (closed):** Application code fork.
  - **Brief 2.5 (this brief):** Extract share-dialog code from my-notes.html into a shared module; both surfaces consume the module instead of MY VIEWS depending on MY NOTES.
  - **Brief 3 (anticipated):** Multi-session verification.

---

## §0 — Standing rules + arc orientation

### §0.1 Iron Rules in force

- **Iron Rule 36** — terse hand-off (diff, smoke test, findings).
- **Iron Rule 37** — silent work-mode. **Recently reinforced and verified effective in Brief 1.5.** No mid-cycle narration. No reconsidered-choices narration. Per-edit reasoning capped at one sentence. If you find yourself reconsidering an architectural choice, halt instead of narrating. The Brief 1.5 hand-off opening with "Per Iron Rule 37 — silent work-mode acknowledged" is the pattern; mirror it.
- **Iron Rule 39** — input enumeration, output specification.
- **Iron Rule 40** — halt-on-missing-input, terse transcript, test instructions, dev-console-first debugging.
- **Style Doctrine §0.1** — agents do not modify or extend doctrine.

### §0.2 Operating-practice lessons in force across this arc

1. **Operator-inspection gates require one step per round-trip.** Bundled deliverables that span gates violate the brief contract.
2. **Operator authorization solicitations require numbered options with concrete consequences**, not natural-language templates.
3. **Schema migrations have consumers beyond the surface being forked.** Always enumerate consumers when the schema underneath them changes. (Not directly applicable to Brief 2.5 — no schema work — but the broader principle "extractions have consumers beyond the surface being extracted from" applies.)

### §0.3 Architectural rationale (operator decision, locked)

The operator decided to sever MY VIEWS' dependency on MY NOTES at the share-dialog layer. Rationale: MY VIEWS and MY NOTES are conceptually separate surfaces; one should not have to load the other for its core features to work. The current state — MY VIEWS' Share button silently failing until MY NOTES is loaded once per session — is broken from the operator's perspective regardless of being pre-existing.

The architect's prior recommendation was proactive load (smaller change, faster ship). The operator overrode in favor of extraction (larger change, durable architectural cleanup). This brief executes the operator's decision.

---

## §1 — Purpose

After Brief 2.5 ships:

1. The share-dialog functions currently defined in `my-notes.html` (`_notesShowShareViewDialog`, `_notesShowResourcePicker`, `_notesShowViewInviteDialog`, supporting helpers like `_notesLoadViewParticipants`, `_notesViewHeartbeat`, `_resolveViewId`) live in a new shared module file.
2. `my-notes.html` no longer defines these functions; it imports/loads them from the shared module.
3. `my-views.html` no longer depends on MY NOTES being loaded for its Share button to work; it imports/loads the shared module directly.
4. The MY VIEWS Share button works on first MY VIEWS load, no MY NOTES navigation required.
5. MY NOTES' share functionality continues to work identically.
6. Both surfaces remain functionally unchanged from the operator's perspective.

---

## §2 — Architectural decisions locked

### §2.1 New shared module file

Create a new JavaScript file. Suggested name: `share-dialog.js`. Agent picks the actual filename to match codebase conventions (look at how other JS files in the project are named — e.g., the mw-* prefix pattern, or the more domain-named files like `meetings.js` and `mc-grid.js`). Place in the same directory as other shared JS modules.

The module exposes the share-dialog functions on `window.*` exactly as they're currently exposed from `my-notes.html`. No interface change. Both `my-notes.html` and `my-views.html` continue to call `window._notesShowShareViewDialog(...)` etc.; the only difference is where that function is defined.

### §2.2 Functions to extract

The agent enumerates from `my-notes.html` post-Brief-2 state and extracts:

- `_notesShowShareViewDialog`
- `_notesShowResourcePicker`
- `_notesShowViewInviteDialog`
- `_notesLoadViewParticipants` (helper used by the dialog and elsewhere)
- `_notesViewHeartbeat` (per Brief 2 fix; tightly coupled to participant tracking)
- `_resolveViewId` (helper added in Brief 2)
- Any other helpers the dialog functions transitively depend on

Some of these helpers may be called from MY NOTES code outside the share-dialog context (e.g., `_notesViewHeartbeat` is invoked from `_notesLoadView`). That's fine — MY NOTES still calls them, just from the shared module instead of from local definitions.

The agent enumerates the call graph during investigation (§3.1) and decides what's extracted. Function names that start with `_notes*` and only serve share-dialog purposes can be renamed if the agent thinks renaming improves clarity (e.g., `_notesShowShareViewDialog` → `_showShareViewDialog`), but renaming is OPTIONAL and the agent may choose to preserve names verbatim to minimize diff size. **Default: preserve names** unless renaming is necessary for some technical reason.

### §2.3 No behavioral changes

Brief 2.5 is a refactor, not a feature change. The extracted functions behave identically post-extraction. The agent does NOT:

- Fix bugs in the extracted code (even known ones — e.g., the FK-violation-on-non-account-user issue I mentioned in chat is OUT of scope)
- Add new functionality
- Change the Share dialog's UI
- Change the Share dialog's data flow
- Modify the `compass_views` / `view_participants` / `notes` table interactions

If the agent encounters a bug in the extracted code, they DOCUMENT it as a finding (per Iron Rule 36 hand-off) but DO NOT fix it.

### §2.4 Loader updates

Both `my-notes.html` and `my-views.html` must load the new shared module BEFORE any code that depends on it runs. The agent identifies the right insertion point in each surface — typically a `<script src=>` tag in the head or before the surface's main initialization script.

If a surface-level loader (e.g., `mw-tabs.js`'s `loadMyViewsView`) is responsible for hydrating the surface, the agent updates that loader to ensure the shared module is fetched before the surface initializes.

### §2.5 The `notes_workspace.state` write paths in extracted functions stay forbidden

`_notesViewHeartbeat` and possibly other extracted functions read or write `notes_workspace.state` for MY NOTES-specific purposes. Brief 2 §5.3 marked this as forbidden territory. The extraction itself is allowed — the code moves to a new file — but the agent does NOT modify the `notes_workspace` interactions during the move. Cut-paste-as-is for those code paths.

If the agent thinks `notes_workspace` interactions in the extracted code SHOULD be refactored, that's a finding for a future brief, not Brief 2.5 work.

---

## §3 — Investigative discipline

### §3.1 Enumerate the call graph before extracting

The agent identifies, in writing (as part of hand-off):

- Which functions in `my-notes.html` are part of the share-dialog domain
- Which other functions in `my-notes.html` call those (callers)
- Which functions in `my-views.html` already call those (existing dependencies)
- Any global state, DOM elements, or other dependencies the extracted code touches

This call-graph enumeration is the basis for deciding what gets extracted vs. what stays. Don't skip it. Per Iron Rule 37, do this investigation silently and report findings in the hand-off, not in chat.

### §3.2 Confirm both surfaces can load the shared module independently

After extraction, verify (statically or in live test if available) that:

- Loading `my-views.html` loads the shared module without needing `my-notes.html`
- Loading `my-notes.html` loads the shared module and continues to work
- Both surfaces continue to expose the share-dialog globals on `window.*` after their respective loads

### §3.3 Halt-on-missing-input

If the agent identifies an input file they need that wasn't provided in §5, they halt per Iron Rule 40 §1.

---

## §4 — Required changes

### §4.1 Create new shared module

Create the new file (suggested: `share-dialog.js`, agent confirms name). Move the functions enumerated in §2.2 from `my-notes.html` into the new file. Preserve function bodies verbatim (cut-paste); do NOT refactor logic during the extraction.

### §4.2 Remove extracted code from `my-notes.html`

Delete the function definitions from `my-notes.html`. Leave the call sites (where `my-notes.html` invokes these functions) intact — they continue to call `window._notesShowShareViewDialog(...)` etc.; they just resolve to the new module's definitions.

### §4.3 Add module load to `my-notes.html`

Add a `<script src="share-dialog.js">` (or equivalent loader) early enough that the functions are defined before any code calls them.

### §4.4 Add module load to `my-views.html`

Add the same `<script src=>` to `my-views.html`. MY VIEWS now loads the share-dialog module directly instead of relying on MY NOTES' load to bring it in.

### §4.5 Update surface loader if needed

If `mw-tabs.js` or some other loader is responsible for hydrating these surfaces, update the loader to fetch the shared module before the surface initializes. (May not be needed if the `<script src=>` in the HTML is sufficient.)

### §4.6 Verify no orphaned references

Grep both `my-notes.html` and `my-views.html` post-extraction for any remaining definitions of the extracted functions (there should be none) and any references that fail to resolve (there should be none).

### §4.7 Version bump

`js/version.js`: bump to `CMD[NNN]` (operator assigns).

---

## §5 — Inputs

### §5.1 Files modified / created

- **Created:** new shared module file (suggested name `share-dialog.js`)
- **Modified:** `my-notes.html` (remove extracted definitions; add module load)
- **Modified:** `my-views.html` (add module load)
- **Possibly modified:** `mw-tabs.js` (if loader-level changes are needed)
- **Modified:** `js/version.js` (CMD bump)

### §5.2 Files read for reference

- `my-notes.html` (post-Brief-2 state — for extraction source)
- `my-views.html` (post-Brief-2 state — for verifying call sites and load order)
- `mw-tabs.js` (post-CMD100 state — for loader pattern reference)
- `compass.html` (post-CMD100 state — for Tier 2 dispatch contract reference; not modified)
- `hud-shell.js` v1.2+CMD100 (for shell-level load order reference; not modified)
- Brief 2 hand-off (for finding 11 context)
- Other JS files in the project (for naming convention reference)

### §5.3 Files / code agent must NOT modify

- Any other `my-notes.html` code outside the share-dialog extraction (notes-tree, block editor, chat, `notes_workspace.state` interactions outside the extracted heartbeat function)
- Any other `my-views.html` code outside the module load addition
- The shared chrome (panel-geometry, inbox, header buttons other than Share)
- `compass.html` Tier 2 dispatch
- `mw-core.js` canonical dispatch
- `hud-shell.js`
- Any database-touching logic (no schema changes, no RLS changes, no new query patterns)

### §5.4 Doctrine + reference

- Style Doctrine v1.7
- Iron Rules 36, 37, 39, 40 ratifications
- Work Mode Classification doctrine v1.0

### §5.5 Brief context

- Brief 1, Brief 1.5, Brief 2 hand-offs (for arc context)
- Brief 2's finding 11 (the deferred dependency this brief addresses)
- This brief

---

## §6 — Definition of done

Brief 2.5 is complete when:

- The new shared module file exists with all extracted functions
- `my-notes.html` no longer defines the extracted functions
- `my-notes.html` loads the shared module before any code calls the extracted functions
- `my-views.html` loads the shared module before any code calls the extracted functions
- MY VIEWS' Share button works on first MY VIEWS load (no MY NOTES navigation required) — verified by smoke test
- MY NOTES' share functionality is unchanged — verified by smoke test
- Both surfaces' other functionality is unchanged — verified by smoke test
- `js/version.js` is bumped
- No new CSS classes, color tokens, font sizes, or doctrine edits introduced
- No bugs in the extracted code were fixed during extraction (per §2.3 — bugs found are findings, not fixes)
- Hand-off conforms to §8

---

## §7 — Smoke test

Operator runs after deploy:

### §7.1 MY VIEWS first-load Share test (the headline fix)

1. Hard reset Compass. New CMD number in console.
2. Open Compass. Click MY VIEWS in Tier 2 left rail. Default dashboard loads.
3. **Without visiting MY NOTES**, click the Share button.
4. **Expected:** Share modal opens immediately. Resource picker dropdown is functional.
5. Select a user with a ProjectHUD account. Verify they appear in PEOPLE WITH ACCESS pre-Save.
6. Click Save Changes. Verify `view_participants` row created in Supabase.

### §7.2 MY NOTES regression test

1. Click MY NOTES. Notes tree loads. Existing notes visible.
2. Click a note. Note loads in workspace.
3. Edit the note, save. Verify save persists (refresh; note content intact).
4. On a note, click Share. Verify Share modal opens (same modal as MY VIEWS, now from shared module). Add a participant. Save.
5. Verify the note's `view_participants` interactions work as they did pre-Brief-2.5.

### §7.3 Cross-surface navigation regression test

1. From MY VIEWS Share modal (still open from §7.1), click Close.
2. Switch to MY NOTES. Switch back to MY VIEWS. Confirm both surfaces still functional.
3. Click MY VIEWS Share button again. Confirm it still opens (the second-time-and-onward case wasn't broken before, but verify no regression).

### §7.4 Console cleanliness

Throughout §7.1–§7.3, the DevTools console should show no new errors related to the extracted module. Pre-existing console output (background heartbeats, etc.) is unchanged.

If smoke test cannot be run live: agent reports static analysis instead, operator runs §7 post-deploy.

---

## §8 — Hand-off format

Required output:

1. **Files modified / created** — one-liner per file
2. **Diff** — unified diff for modified files; full content for created file (the new shared module)
3. **Diagnosis summary** — one paragraph (3-5 sentences): confirm call-graph enumeration (§3.1) was completed; report extracted functions and their callers; report any unexpected couplings encountered.
4. **Smoke test result** — pass / fail / not run, with one-sentence explanation if not run.
5. **Findings** — zero or more one-liners. Examples:
   - "Extracted N functions from my-notes.html (N lines). All call sites continue to resolve via window.*."
   - "_notesViewHeartbeat extracted as-is including its notes_workspace.state read; not refactored per §2.5."
   - "Found pre-existing FK-validation gap in dropdown picker (non-account users cause silent INSERT failure). NOT FIXED per §2.3 — out of scope; flagged for post-demo cleanup."
   - "Module loaded via new <script src=> in both surfaces; no mw-tabs.js modifications needed."
   - "All inputs enumerated in brief §5 were received."
6. **Test instructions** — explicit verification steps the operator runs post-deploy.

Per Iron Rule 37 — work silently. Open the hand-off with "Per Iron Rule 37 — silent work-mode acknowledged" as Brief 1.5's agent did. Do not narrate mid-cycle.

---

## §9 — Reference materials

**Files modified / created:**
- New shared module file (suggested `share-dialog.js`)
- my-notes.html (post-Brief-2 state)
- my-views.html (post-Brief-2 state)
- Possibly mw-tabs.js
- js/version.js

**Files read for reference:**
- compass.html (post-CMD100)
- hud-shell.js (v1.2 + CMD100)
- Other JS modules in the project for naming convention
- Brief 2 hand-off

**Doctrine + operating-discipline:**
- ProjectHUD Style Doctrine v1.7
- iron-rule-36-ratification.md
- iron-rule-37-ratification.md (recently reinforced; verified effective in Brief 1.5)
- iron-rule-39-ratification.md
- iron-rule-40-ratification.md
- work-mode-classification-doctrine.md (v1.0)

**Brief context:**
- Brief 1 hand-off (closed)
- Brief 1.5 hand-off (closed)
- Brief 2 hand-off (closed; finding 11 is the predecessor for this brief)
- This brief

---

## §10 — Narrative instruction block (paste-ready)

```
Apply brief-cmdNNN-share-dialog-extraction.md (Brief 2.5
of the MY VIEWS persistence fork arc).

This is an EXTRACTION brief. You move existing code from
my-notes.html into a new shared module file; both
my-notes.html and my-views.html consume the new module.
You do NOT change behavior. You do NOT fix bugs in the
extracted code. You do NOT touch database interactions.

Architectural decisions LOCKED in §2:
- New shared module file (suggested share-dialog.js,
  agent confirms naming convention)
- Functions extracted enumerated in §2.2; preserve names
  by default
- No behavioral changes (§2.3) — refactor, not feature work
- notes_workspace.state interactions inside extracted code
  stay as-is (§2.5)

§3.1 requires call-graph enumeration before extraction.
Per Iron Rule 37 — recently reinforced and verified
effective in Brief 1.5 — do this investigation silently
and report in hand-off, not in chat. Open your hand-off
with "Per Iron Rule 37 — silent work-mode acknowledged"
as Brief 1.5's agent did.

§5.3 lists files / code you must NOT modify.

§7 has three test sections — MY VIEWS first-load test
(the headline fix), MY NOTES regression test, cross-surface
navigation regression test.

Per Iron Rule 40 §1, halt on missing inputs.

Operator's user_id is 57b93738-6a2a-4098-ba12-bfffd1f7dd07.
Firm UUID is aaaaaaaa-0001-0001-0001-000000000001.

Operator will provide CMD number for version bump at hand-off
time.

Proceed.
```

---

*End of Brief — Share dialog extraction to shared module (Brief 2.5).*
