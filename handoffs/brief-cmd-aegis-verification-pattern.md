# Brief · Aegis verification pattern + Wait ForConsole verb · CMD-AEGIS-VERIFICATION-PATTERN

## §0 — Standing rules for fresh agent

Read before proceeding.

**Iron Rule 36, 37, 38, 39, 40** — base operating discipline.
**Iron Rule 51** — class-conditional treatments at construction time.
**Iron Rule 52 §4** — function-name and logical-concern collision check.
**Iron Rule 60** — first-caller hazard awareness for the `Wait ForConsole` verb addition.
**Iron Rule 64** — codebase-as-spec. **This rule is the entire reason this brief is the shape it is. The architect's prior framing of CMD-AEGIS-CMD-RUNNER assumed Aegis needed a substantial build to support runnable verification scripts. Survey of `cmd-center.js` revealed that Aegis already has 47 verbs, full pause-and-resume semantics, variable storage, multi-session dispatch, script storage, and failure handling. The brief was reframed entirely. Take this as a working example of why Rule 64 exists.**
**Iron Rule 65** — render-version dual-pin applies only to template body changes. **This CMD does NOT modify any render template body bytes; `RENDER_VERSION` does NOT need to move. Bump only `js/version.js`.**

This is a small CMD by line count but architecturally significant: it establishes a working-pattern shift for every future CMD's verification flow.

---

## §1 — Purpose

The pattern that has emerged across CMD-A7, CMD-A7-POLISH-1, CMD-MINUTES-PRINT-FLOW, CMD-PROJECTION-ENGINE-1, CMD-PROJECTION-ENGINE-2, and CMD-MINUTES-TEST-INFRA-1: agents ship verification flows as transcript-embedded prose. Operators execute the flows by scrolling chat history, copy-pasting code blocks, and tracking state across messages. Friction compounds with CMD frequency.

Aegis was built for exactly this workflow. The `cmd-center.js` codebase contains a complete verb registry covering every operation verification flows need: page/tab navigation, form interaction, click dispatch, wait conditions, variable storage with substitution, SQL queries, polling, assertions, pause-and-resume, multi-session orchestration, script storage, and transcript logging.

What's been missing is **convention** — agents have been authoring verification flows in prose because there's no established expectation that they author them as Aegis scripts. CMD-MINUTES-TEST-INFRA-1 just shipped the last operator-state-capture channel needed (structured console echo on meeting selection and humanized download filenames). The convention is now actionable.

After CMD-AEGIS-VERIFICATION-PATTERN ships:

1. **Agent verification flows ship as Aegis-runnable scripts** as a standard Iron Rule 36 hand-off artifact, alongside the existing prose hand-off
2. **A single agent-facing reference document** exists in the project file collection that catalogs Aegis's verb vocabulary in pattern terms (not implementation terms) so the agents have a stable spec to author against
3. **One new Aegis verb — `Wait ForConsole`** — fills the gap between the test-infra CMD's structured console echo and Aegis's existing capture mechanisms; without this verb, operators would still have to copy-paste meeting IDs from dev console into Aegis manually
4. **Two reference exemplar scripts** retrofit recent CMDs (CMD-PROJECTION-ENGINE-2 and CMD-MINUTES-TEST-INFRA-1) into Aegis-runnable form, demonstrating the convention against real verification flows the operator just lived through

This is **convention + documentation + one verb**, not "build a runner." The runner exists. The convention does not.

---

## §2 — Scope

### In scope

- Author `aegis-verification-pattern-v1.md` — agent-facing reference document in project files
- Add `Wait ForConsole` verb to `cmd-center.js` per §3.2
- Author two exemplar playbooks (NOT scripts; substrate-anchored per CMD-AEGIS-PLAYBOOK-FOUNDATION):
  - `cmd-projection-engine-2-verification` — retrofits the recent painful verification flow into a published playbook
  - `cmd-minutes-test-infra-1-verification` — retrofits the recent small verification flow into a published playbook
- Update `js/version.js` pin (front-end only; no `RENDER_VERSION` change)
- Behavioral verification per §5
- Hand-off per §8

### Out of scope

- Any other Aegis verb additions or modifications
- Modifying any other surface module (Accord, Compass, Cadence)
- Modifying any Edge Function (no template body changes; Iron Rule 65 does not fire)
- Schema changes
- New CoC events
- Updating the Iron Rule 36 hand-off doctrine itself (the convention is established by demonstration; if a future ratification cycle wants to formalize it as doctrine, that's a separate decision)
- Retrofitting older CMD verifications beyond the two exemplars (CMD-A7, CMD-MINUTES-PRINT-FLOW, etc.) — those become regression tests *if and when* a future need arises; not in scope now
- Authoring scripts for CMD-MINUTES-UX-POLISH-1 or any other yet-to-ship CMD

---

## §3 — Implementation specification

### §3.1 The agent-facing reference document

File: `aegis-verification-pattern-v1.md`. Lives in the project file collection. Length target: ~400-600 lines.

Structure:

**§A — Purpose and audience.** This document is consumed by future coding agents drafting verification flows for ProjectHUD CMDs. It describes Aegis's verb vocabulary in pattern terms (e.g., "to capture a meeting_id into a script variable, use…") rather than implementation terms (e.g., "the `Wait ForConsole` function in `cmd-center.js` line N…"). The agents needing this doc are not Aegis maintainers; they are CMD-shipping agents who need to know how to author verification scripts.

**§B — Verb catalog by purpose.** Organize Aegis's 48 verbs (47 existing + 1 new from this CMD) by what verification scenario they serve, NOT by alphabetical name. Categories:

- **Navigation** — `Set Page`, `Set Tab`, `Set SubTab`, `Set View`, `Reload`
- **Form interaction** — `Form Open`, `Form Insert`, `Form Submit`, `Form Select`, `Form Attach`, `Form Slide`, `Form Add`, `Form AddRow`, `Form Save`, `Form Close`, `Form Scroll`
- **Click dispatch** — `Click`, `Click ForInstance`
- **Wait conditions** — `Wait`, `Wait ForLocation`, `Wait ForInstance`, `Wait ForRoute`, `Wait ForForm`, `Wait ForQueueRow`, `Wait ForModal`, `Wait ForConsole` (new)
- **Variables and capture** — `Store`, `Get`, `Wait ForConsole` (capture variant)
- **Database** — `DB Get`, `DB Poll`
- **Assertions** — `Assert`
- **Operator interaction** — `Pause`
- **Logging and narration** — `Log`, `Narrate`, `Spotlight`
- **Multi-session** — alias-prefix dispatch (`AK: Set Page Compass`), `Set NarrateTarget`
- **Playbook control** — `Run` (substrate-aware per CMD-AEGIS-PLAYBOOK-FOUNDATION; resolves name to current published version)
- **Note on `Register`** — survey confirmed `Register` is a navigation primitive (page router), NOT a playbook-storage verb. Do not document it as playbook control. Per CMD-AEGIS-PLAYBOOK-FOUNDATION F1.
- **Domain-specific** — `Open Prospect`, `Edit Prospect`, `Move Prospect`, `Delete Prospect`, `Toggle Active`, `Remove Stakeholder`, `Continue Draft`, `Open Review`, `Switch View`, `DOFile`

Each verb gets a short paragraph: signature, what it does in plain language, when an agent would use it in a verification flow, one example. Not exhaustive documentation — *enough for an agent to know which verb to reach for*.

**§C — Script-header conventions.** The `# Version:`, `# Requires:`, and other comment-line conventions Aegis recognizes. Worked example showing a script header with multi-session preflight requirements.

**§D — Variable substitution patterns.** How `$variable` substitution works at parse time. The `→ $varname` capture syntax for `DB Poll` and `Get`. The `Wait ForConsole … → $varname` syntax (new this CMD). The `_lastResult` magic variable.

**§E — Structuring a verification flow as a script.** The pattern that works:

1. Header with `# Version:` and `# Requires:` if multi-session
2. Pre-deploy section as Aegis comments (operator runs migrations/deploys outside Aegis; the script picks up after deploy)
3. Sentinel check using `Get _PROJECTHUD_VERSION` and `Assert`
4. Main verification body, structured as numbered subtests with `Log "§5.2 — Console echo on meeting selection"` separators
5. Operator-judgment steps using `Pause "Verify X visually; press Enter to continue."`
6. Operator-input steps using `Pause "Click meeting in rail. Press Enter."` followed by `Wait ForConsole "[Accord-minutes] meeting selected:" → $meeting_id`
7. Assertion-based subtests using `DB Poll`, `DB Get`, `Get`, then `Assert`
8. Final summary line via `Log "All §5 subtests PASS"`

**§F — When to use prose hand-off vs. Aegis script.** Both still ship per Iron Rule 36. The script is the runnable artifact; the prose is the human-readable explanation. Each CMD's hand-off ships both. The script contains pure execution; the prose explains intent, captures findings, and documents diff.

**§G — Reference exemplars.** Pointers to the two published playbooks `cmd-projection-engine-2-verification` and `cmd-minutes-test-infra-1-verification` in the Aegis playbook library. The reference playbook pair is the canonical demonstration of the convention.

### §3.2 The `Wait ForConsole` verb

A new verb in the COMMANDS registry of `cmd-center.js`. Signature:

```
Wait ForConsole "<prefix>" → $varname [timeout=<ms>]
```

Behavior:

- On invocation, hook the global `console.log` function (if not already hooked by Aegis on prior `Wait ForConsole` calls in this script run; idempotent)
- Watch each `console.log` call's first string argument
- When a call's first argument starts with `<prefix>`, capture the second argument (the structured object) into `_storeVars[varname]`
- If the second argument is an object, store it as a JSON-serialized string (Aegis's existing variable storage is string-typed)
- If `timeout` is reached without a matching prefix, throw — Aegis surfaces this as a transcript error
- After capture (or timeout), restore `console.log` to its prior implementation
- Concurrent `Wait ForConsole` calls are not supported in v1 (one wait at a time per script run); subsequent calls during a wait throw

The prefix-based matching, not regex, is deliberate — agents author scripts against the prefix the surface module emits (e.g., `[Accord-minutes] meeting selected:`), not against a regex. Iron Rule 64 codebase-as-spec applies: the surface module's prefix conventions become the script's matching conventions.

Implementation hint (the agent verifies the actual `cmd-center.js` patterns before applying):

```javascript
'Wait ForConsole': async function(args) {
  // Parse args: prefix string, then → $varname, optional timeout=N
  var prefix = args[0];  // already string-quoted by parser
  var storeAs = null;
  var timeoutMs = 30000;
  for (var pi = 1; pi < args.length; pi++) {
    if ((args[pi] === '→' || args[pi] === '->') && args[pi+1]) {
      storeAs = args[pi+1].replace(/^\$/, ''); pi++;
    } else if (args[pi].startsWith('timeout=')) {
      timeoutMs = parseInt(args[pi].split('=')[1]) || timeoutMs;
    }
  }
  if (!prefix) throw new Error('Wait ForConsole requires a prefix string');
  if (!storeAs) throw new Error('Wait ForConsole requires → $varname');

  // Hook console.log; restore on capture or timeout
  var originalLog = console.log;
  var captured = null;
  console.log = function(/* args */) {
    var a = arguments;
    if (a.length >= 1 && typeof a[0] === 'string' && a[0].indexOf(prefix) === 0) {
      captured = a.length >= 2 ? a[1] : null;
    }
    return originalLog.apply(console, a);
  };

  var deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      if (_scriptAborted) return 'aborted';
      if (captured !== null) break;
      await new Promise(function(r){ setTimeout(r, 100); });
    }
  } finally {
    console.log = originalLog;
  }

  if (captured === null) {
    throw new Error('Wait ForConsole timeout: no console.log starting with "' + prefix + '" within ' + (timeoutMs/1000) + 's');
  }

  // Store (JSON-serialize objects)
  var storedValue = (typeof captured === 'object' && captured !== null)
    ? JSON.stringify(captured)
    : String(captured);
  _storeVars[storeAs] = storedValue;
  _appendLine('SYS', 'result', '→ stored $' + storeAs + ' = ' + storedValue.substring(0, 80));
  return storedValue.substring(0, 80);
}
```

Code is a hint, not a spec — the agent surveys existing `Wait For*` patterns in `cmd-center.js` (line numbers ~2625 onward) and matches the style. Iron Rule 64.

**Critical:** the agent must NOT name the verb `Wait For Console` (with space) — Aegis's parser treats multi-word verbs with specific conventions per `_parseLine()` at `cmd-center.js` line 3320. Survey that function before naming. Likely `Wait ForConsole` (no space, matching `Wait ForLocation`, `Wait ForInstance`, etc., which is Aegis's established convention).

### §3.3 The two exemplar playbooks

Both exemplars are authored as substrate-anchored playbooks per CMD-AEGIS-PLAYBOOK-FOUNDATION. They are NOT `.txt` files committed to the repo; they are rows in the `aegis_playbooks` table with `state='published'`, `kind='verification'`, appropriate tags, and `origin_cmd` populated.

The agent creates both via INSERT statements in a small data-seeding migration (or via a one-shot UI authoring step the agent walks through; agent decides based on Iron Rule 64 survey of how seed data lands elsewhere in the project).

#### Playbook 1: `cmd-projection-engine-2-verification`

- `name`: `cmd-projection-engine-2-verification`
- `kind`: `verification`
- `state`: `published`
- `version`: 1
- `origin_cmd`: `CMD-PROJECTION-ENGINE-2`
- `tags`: `['reference-exemplar', 'cmd-projection-engine-2', 'minutes', 'projection-engine']`
- `description`: `Reference exemplar — verification flow for CMD-PROJECTION-ENGINE-2 (template rename + new mockup-aligned Technical Briefing). Demonstrates: pre-deploy gate, sentinel, multi-section structure with Log separators, console capture via Wait ForConsole, DB assertions, operator-judgment pauses, multi-template iteration.`
- `body`: Aegis-runnable playbook retrofitting the verification flow from CMD-PROJECTION-ENGINE-2's testing instructions. Captures all ten subtests from that CMD's §6 verification. Target body length: ~150-250 lines including header comments and Log separators.

#### Playbook 2: `cmd-minutes-test-infra-1-verification`

- `name`: `cmd-minutes-test-infra-1-verification`
- `kind`: `verification`
- `state`: `published`
- `version`: 1
- `origin_cmd`: `CMD-MINUTES-TEST-INFRA-1`
- `tags`: `['reference-exemplar', 'cmd-minutes-test-infra-1', 'minutes', 'test-infrastructure']`
- `description`: `Reference exemplar — verification flow for CMD-MINUTES-TEST-INFRA-1 (console echo + humanized filenames + END MEETING confirm rename). Demonstrates: small-CMD playbook structure, three-state diagnostic verification, console capture and humanized-filename validation.`
- `body`: Aegis-runnable playbook retrofitting CMD-MINUTES-TEST-INFRA-1's verification. Demonstrates that small CMDs produce small playbooks. Target body length: ~50-80 lines.

Both bodies include header comments noting reference-exemplar status and pointing to `aegis-verification-pattern-v1.md`. Both are authored AFTER the agent's `Wait ForConsole` verb is added and tested (so the bodies can use it).

Per CMD-AEGIS-PLAYBOOK-FOUNDATION's immutability triggers: once these playbooks are inserted with `state='published'`, their `body`, `description`, `kind`, `tags`, `version` cannot be modified. Future revisions require Edit→Draft→Publish flow that produces v2 with a `supersedes_id` pointer.

---

## §4 — Codebase survey requirements (Iron Rule 64)

Before authoring the new verb or the exemplar scripts, the agent surveys:

1. **`cmd-center.js` `_parseLine()` function** at approximately line 3320 — to understand exactly how multi-word verbs are tokenized; ensures the new verb's arg-parsing matches Aegis's conventions
2. **Existing `Wait For*` verbs** at lines ~2625-2778 — to understand the timeout-arg pattern, the `→ $varname` parsing, the throw-on-timeout convention
3. **Existing `DB Poll` and `Get` verbs** at lines ~2778-3000 — for the `→ $varname` storage pattern
4. **Existing `Pause` verb** at line ~2987 — for the operator-input convention
5. **The existing scripts in the codebase** (if any, search for `_scripts` registration patterns) — to see how real Aegis scripts are structured

If any survey reveals a divergent pattern from §3 specifications, halt and surface — the brief defers to established conventions per Iron Rule 64.

---

## §5 — Behavioral verification

### §5.1 Sentinel — code identity

1. Hard-refresh the application. Console banner shows CMD-AEGIS-VERIFICATION-PATTERN.
2. **PASS** = post-CMD code is loaded.

### §5.2 The new verb is registered and callable

1. Open Aegis (cmd-center panel).
2. In the command bar, type: `Wait ForConsole "[test]" → $captured timeout=2000`
3. Within 2 seconds, in dev console, run: `console.log('[test] hello', { foo: 'bar' });`
4. Verify Aegis transcript shows: `→ stored $captured = {"foo":"bar"}` (or similar JSON serialization)
5. Verify subsequent `Get $captured` (or use `$captured` in a later command) returns the stored value
6. **PASS** = verb captures and stores correctly.

### §5.3 Verb timeout behavior

1. In Aegis, type: `Wait ForConsole "[nope]" → $captured timeout=1000`
2. Don't trigger any matching console.log.
3. Verify Aegis transcript shows the timeout error after ~1 second.
4. Verify `console.log` works normally afterward (the hook was cleaned up).
5. **PASS** = timeout and cleanup correct.

### §5.4 Reference exemplar playbooks run end-to-end

1. Open Aegis Library; verify both exemplar playbooks (`cmd-projection-engine-2-verification` and `cmd-minutes-test-infra-1-verification`) appear with `state='published'`, `kind='verification'`, correct tags.
2. Run `cmd-minutes-test-infra-1-verification` from the Library (small one first). Verify it executes through all subtests, prompts operator at appropriate `Pause` points, captures meeting metadata via `Wait ForConsole`, asserts against substrate via `DB Get`/`DB Poll`, reports clean PASS at end. Verify `aegis_playbook_runs` row written with `status='pass'`.
3. Run `cmd-projection-engine-2-verification`. Verify same execution discipline; captures all ten subtest equivalents; reports clean PASS.
4. Verify both runs trigger `aegis.playbook.run_started` and `aegis.playbook.run_completed` CoC events per CMD-AEGIS-PLAYBOOK-FOUNDATION.
5. Verify supersedes-chain: attempt to modify either playbook directly (e.g., via SQL UPDATE on `body`); verify the immutability trigger rejects (per CMD-AEGIS-PLAYBOOK-FOUNDATION F4).
6. **PASS** = both reference playbooks run cleanly against current substrate state and immutability holds.

The verification of §5.4 is operator-judged for workflow quality. If the playbooks run but the operator finds the flow awkward in any way, those notes feed back into a follow-up CMD that refines the verification pattern document.

### §5.5 Pattern document is consumable

Operator reads `aegis-verification-pattern-v1.md` end-to-end. Operator marks PASS if the document is structured for the agent audience: organized by purpose-not-name, includes worked examples, explains the script-header conventions, points clearly to the reference exemplars.

If the document is too implementation-detailed, too sparse, or organized confusingly, operator surfaces specific feedback for revision before marking PASS.

### §5.6 Existing CMD regression

1. Live Capture, Living Document, Decision Ledger, Digest & Send, Minutes — all surfaces load without errors.
2. Aegis's existing verb set continues to function (spot-check `Set Page`, `Click`, `DB Get`, `Pause`).
3. Existing scripts (if any registered) continue to run.
4. **PASS** = no regression.

---

## §6 — Consumer enumeration (Iron Rule 38)

| File | Effect |
|---|---|
| `aegis-verification-pattern-v1.md` | New file in project file collection — agent-facing reference document |
| `aegis-cmd-projection-engine-2.test.txt` | New file — reference exemplar script |
| `aegis-cmd-minutes-test-infra-1.test.txt` | New file — reference exemplar script |
| `js/cmd-center.js` | New `Wait ForConsole` verb added to COMMANDS registry; module-loaded banner bumped to CMD-AEGIS-VERIFICATION-PATTERN |
| `js/version.js` | Pin bump to CMD-AEGIS-VERIFICATION-PATTERN |

**No changes to:**
- Edge Function `render-minutes/index.ts` (Iron Rule 65: template body unchanged)
- Schema (no migrations)
- RLS policies
- CoC events
- Surface modules (Accord, Compass, Cadence)
- Any other Aegis verbs beyond the addition

---

## §7 — Smoke test

Operator runs after deploy:

1. Hard-refresh the application. Console banner shows CMD-AEGIS-VERIFICATION-PATTERN.
2. Open Aegis. Verify command bar accepts `Wait ForConsole` as a recognized verb (auto-complete or trial invocation).
3. Run the small reference exemplar (`aegis-cmd-minutes-test-infra-1.test.txt`) end-to-end on a test meeting. Confirm the operator experience: pause-and-resume works, console capture works, DB assertions work, transcript is readable.
4. Read the pattern document. Confirm it is consumable and accurate.

---

## §8 — Hand-off format

Required output:

1. Files created — one-liner per file with size in lines.
2. Diff — the new verb addition in `cmd-center.js` as a unified diff; full content of the three new files.
3. Smoke test result.
4. Behavioral verification results — per §5 subtest.
5. Findings — zero or more one-liners. Particularly:
   - Whether the existing `Wait For*` patterns matched the new verb's intended shape
   - Whether the verb name (`Wait ForConsole` no space) matches Aegis's parser conventions
   - Operator notes from running the reference exemplars (subjective workflow observations)
   - Any architectural questions surfaced for future CMDs

---

## §9 — Reference materials

Required inputs (halt per Iron Rule 40 §1.1 if any are missing):

- This brief
- Current `js/cmd-center.js` (post-CMD-MINUTES-TEST-INFRA-1)
- Current `aegis.html` (for understanding the panel UI; not modified)
- `accord-vision-v1.md` (read for context only; not architecturally relevant to this CMD)
- `projecthud-functional-requirements-v1.md` (read for context only; not architecturally relevant to this CMD)
- All recent CMD hand-offs from CMD-PROJECTION-ENGINE-1, CMD-PROJECTION-ENGINE-2, CMD-MINUTES-TEST-INFRA-1 (the source material from which the reference exemplars are derived)
- All Iron Rules ratifications 36-65

---

## §10 — Agent narrative instruction block

```
Apply brief-cmd-aegis-verification-pattern.md.

Surprising scope reframing: the architect's prior framing of this
CMD assumed a substantial Aegis runner build. Survey of cmd-center.js
revealed Aegis already has 47 verbs, full pause-and-resume,
variable storage, multi-session dispatch, and script storage. The
runner exists. What's missing is convention.

This CMD ships:

1. An agent-facing reference document
   (`aegis-verification-pattern-v1.md`) cataloging Aegis verbs by
   purpose for future CMD-shipping agents to consult when authoring
   verification flows.

2. One new Aegis verb — `Wait ForConsole "<prefix>" → $varname
   [timeout=N]` — that hooks console.log, captures the first
   matching prefix's structured object, stores it as JSON. This
   is the only verb gap in the existing vocabulary.

3. Two reference exemplar scripts that retrofit recent CMD
   verifications (CMD-PROJECTION-ENGINE-2 and CMD-MINUTES-TEST-
   INFRA-1) into Aegis-runnable form. These become the canonical
   demonstrations of the convention.

Iron Rule 64 strictly applies: survey cmd-center.js's existing
patterns before adding the verb (parser conventions, Wait For*
shape, → $varname pattern, timeout=N pattern). Do not invent
mechanisms; match the codebase.

Iron Rule 65 does NOT fire: no template body changes. Bump
js/version.js only; RENDER_VERSION constant unchanged.

§5 specifies six behavioral verification subtests. §5.2 and §5.4
are the doctrinal-floor checks (the new verb works; the reference
scripts run end-to-end).

Hand-off format per §8. Halt on missing input. Halt if §5.2 or
§5.4 fails.

Proceed.
```

---

## §11 — A note on the strategic shift this CMD enables

After this CMD ships, the CMD-shipping pattern across ProjectHUD changes in a small but compounding way: every future CMD's verification flow ships as both prose hand-off AND Aegis-runnable script. Operators stop scrolling chat history. State capture becomes structured (via `Wait ForConsole` and `Store` and `DB Poll`). Failure recovery becomes named (the script aborts on assertion failure; the operator hands the failure back; the agent fixes; the operator re-runs from the failed step using Aegis's pause-and-step semantics).

The substrate enrichment, projection engine, counterfactual operator, CPM linkage, schedule manipulation, and morning brief CMDs ahead — totaling ~140-195 hours per the strategic vision — all benefit. Each one's verification cycle becomes faster and more rigorous.

The architectural investment is small (one verb + one document + two exemplars). The compounding return is large.

---

*End of Brief — Aegis verification pattern + Wait ForConsole verb (CMD-AEGIS-VERIFICATION-PATTERN).*
