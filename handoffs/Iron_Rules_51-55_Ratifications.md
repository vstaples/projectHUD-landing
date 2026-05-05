# Iron Rule 51 — Ratification

**Status:** ratified 2026-05-05
**Authority:** operator + architect (see §0.1 of Style Doctrine)
**Scope:** every UI rendering function that derives styling
classes from data state, particularly edge-derived treatments
on chips, badges, rows, or any visual element

---

## Rule

**When a UI rendering function applies class-conditional
styling based on data state, the conditional decision is made
at element-construction time, in a single source-of-truth
expression — not by per-case post-processing or class-swap
patterns after construction.** A single function call decides
the element's styling class set; downstream code does not
mutate that class set based on additional conditions.

---

## Why this rule exists

CMD-A4 §9.4 surfaced the failure mode. The Living Document
surface rendered cross-thread reference chips with styling
that varied by edge type. The initial implementation attached
a `doc-cross-link` class only to `supersedes`-type chips
during one branch of a multi-branch render path. Other edge
types (`cites`, `answers`, `mitigates`) rendered the chip but
lacked the class, so click handlers attached to that class
silently failed for those types.

The fix was to build the chip's `linkAttrs` (including the
`doc-cross-link` class) with the correct class up-front based
on the `xthread` flag, eliminating the per-edge-type branching
in the post-render path. Single source of truth for the
chip-class decision.

CMD-A5 §9.3 reinforced the rule. The Decision Ledger's status
filter initially assigned each decision to a single status
class with priority ordering (`superseded > contradicted >
active`). This prevented users from filtering on a
contradicted-AND-superseded decision via the Contradicted chip
alone. The fix evaluated each status independently at
chip-construction time — a decision can simultaneously match
multiple status classes because its visual treatment can carry
multiple class-conditional badges.

The rule generalizes: **post-construction class manipulation
is a classic source of state/visual drift** in any rendering
system. A class added based on condition A and a class added
based on condition B can collide, override, or fail to
compose. Decisions about styling class membership belong at the
point of element construction where all relevant state is
visible at once.

---

## §1 — What the rule requires

When constructing any styled element from data state:

1. **All relevant state is read once into a single decision
   site** — typically the function or expression that
   constructs the element.
2. **The element's full class set is computed at construction
   time** based on all state that affects styling.
3. **No downstream code mutates the class set** based on
   conditions that were known at construction time.

Acceptable form (single decision site):

```javascript
const chipClass = [
  'chip',
  isActive && 'chip-active',
  isCrossThread && 'doc-cross-link',
  hasError && 'chip-error',
].filter(Boolean).join(' ');

return `<span class="${chipClass}">${label}</span>`;
```

Unacceptable form (post-processing):

```javascript
const chipClass = isActive ? 'chip chip-active' : 'chip';
const html = `<span class="${chipClass}">${label}</span>`;

// Later, somewhere else:
if (isCrossThread) {
  // class added by post-processing — collides with future
  // conditions, breaks single-source-of-truth
  html = html.replace('class="', 'class="doc-cross-link ');
}
```

---

## §2 — When the rule does NOT fire

- DOM mutations driven by **runtime user interaction** (a
  click handler that toggles a class on click) are user-state
  changes, not initial-render decisions. The rule applies to
  initial rendering, not to interaction-state updates.
- Styling that derives from CSS pseudo-classes (`:hover`,
  `:focus`, `:checked`) is browser-side and outside the rule's
  scope.
- Animation classes added/removed during transition are
  ephemeral and outside the rule's scope.

---

## §3 — Cross-module application

The rule applies to every coding agent rendering UI elements
across all ProjectHUD modules. Compass, Cadence, Aegis, Accord,
and any future module's rendering code follows the same
discipline.

If an existing render function violates the rule, the agent
surfaces the violation as a finding but does NOT
opportunistically refactor — that's a separate brief's scope.

---

*Iron Rule 51 ratified 2026-05-05.*

# Iron Rule 52 — Ratification

**Status:** ratified 2026-05-05
**Authority:** operator + architect
**Scope:** every brief-draft and every commissioned CMD that
introduces a new function or surface concern

---

## Rule

**At brief-drafting time, when a brief enumerates files modified
by name, the architect verifies that no other file in the
codebase implements the same function or owns the same surface
concern.** Function-name collisions and surface-concern
duplications must be enumerated in the consumer list. The
duplication itself is flagged as a finding for follow-up.

At CMD-execution time, when a coding agent introduces a new
function name, the agent greps the loader-level files for
existing functions of the same name across all loaded JS
modules — not just the file being modified.

---

## Why this rule exists

CMD-A3 surfaced the canonical case. `hud-shell.js` and
`sidebar.js` both define `renderSidebar` with separate
`NAV_ITEMS` arrays. The CMD-A3 brief enumerated only
`sidebar.js` for the navigation entry addition, but `hud-shell.js`
is the active path on Compass. Initial patch hit only `sidebar.js`;
the Accord nav entry didn't appear on Compass. Both files had
to be patched to converge.

Iron Rule 38's existing function-duplication paragraph
(retroactively ratified at the Rule 38 ratification, partially
in anticipation of this exact failure mode) was correct in
spirit. CMD-A3 confirmed it in production. CMD-A5 reinforced
it by demonstrating that Iron Rule 38's collision-check
discipline applied successfully — `_renderAggregate` and
`_wireComposer` exist in multiple Accord modules but all
inside their own IIFE closures, so no global namespace
collision occurred.

Rule 52 promotes the brief-drafting half of the discipline to
its own ratified rule. Rule 38 covers consumer enumeration in
general; Rule 52 covers the specific case of function-name
collision detection at brief-draft time. Both apply.

---

## §1 — What the rule requires at brief-draft time

For each new function the brief introduces:

1. The architect greps the production codebase for existing
   functions with the same name.
2. If a collision exists, the brief enumerates both files in
   §10 (or equivalent consumer enumeration section).
3. The brief states the disposition: rename the new function,
   namespace-isolate it (e.g., `window.AccordLedger.*`), or
   accept the collision with documented rationale.
4. If the collision is across files that both implement the
   same surface concern (e.g., two `renderSidebar`
   implementations both rendering the sidebar), the brief
   flags the duplication as a finding for separate
   consolidation work — not opportunistically refactored
   inside the current CMD.

## §2 — What the rule requires at CMD-execution time

When the agent introduces a new function name not specified
explicitly in the brief:

1. The agent greps loader-level files for existing functions
   of the same name.
2. If a collision exists across files NOT enumerated in the
   brief, the agent halts and surfaces — this is brief-spec
   coverage gap, not a unilateral fix.
3. If the collision is contained within the agent's own new
   file (no cross-file collision), the agent proceeds; the
   in-file naming is the agent's editorial discretion.

---

## §3 — Cross-module application

The rule applies across all ProjectHUD modules. Compass,
Cadence, Aegis, Accord, and any future module's loader-level
files share the same global JavaScript namespace by default;
only IIFE-wrapping or explicit namespace prefixes provide
isolation.

The IIFE pattern established by `accord-document.js`,
`accord-ledger.js`, and similar modules is the recommended
default for new surface modules. Rule 52 still requires
collision-checking even in IIFE-wrapped modules because the
public exports (e.g., `window.AccordLedger.*`) can themselves
collide with other modules' public exports.

## §4 — Amendment (2026-05-05 evening, post-CMD-A6)

**Scope broadened from function-name collisions to
logical-concern collisions.**

CMD-A6 surfaced a third instance of the hardcoded firm A
fallback constant (`'aaaaaaaa-0001-0001-0001-000000000001'`)
in `coc.js` line 316 — joining the two prior instances in
`cmd-center.js` (fixed by CMD-AEGIS-1) and `mw-events.js`
(unfixed; surfaced as CMD-A6 finding 2). The pattern is
identical across files: `var FIRM_ID = window.FIRM_ID || '<hardcoded UUID>';`.

The original Rule 52 text covered function-name collisions.
The hardcoded-fallback pattern is a *constant*-name collision —
the same logical concern (firm identity resolution) replicated
across files via copy-paste, with each instance aging
independently and diverging in correctness. The rule's spirit
(don't let the same logical concern have multiple unaudited
implementations) covers the case; the rule's letter did not.

**Amended §1 (brief-draft time), additional clause:**

> When a brief introduces or modifies code that handles a
> logical concern (identity resolution, channel naming, firm
> isolation, error handling, etc.), the architect greps the
> production codebase for other implementations of the same
> logical concern — not just other implementations of the same
> function name. The grep target may be a constant name, a
> string literal pattern, a comment marker, or any
> identifiable signature of the logical concern.

**Amended §2 (CMD-execution time), additional clause:**

> When the agent introduces or modifies code that handles a
> logical concern, the agent greps the codebase for other
> implementations of the same concern. If duplicates are
> found that the brief did not enumerate, the agent halts and
> surfaces — even if the agent's own work would not directly
> conflict.

**Provenance.** CMD-A6 finding 2 (mw-events.js leak) and
finding 5 (coc.js line 316 leak) demonstrated the gap.
CMD-AEGIS-1.1 is the dedicated codebase-wide audit-and-fix
brief that closes all instances. This amendment ensures the
same gap doesn't recur in future CMDs.

The amendment is logged in §4 rather than embedded in §1/§2
so that the original rule statement preserves the
shipping-confirmation history. Future Rule 52 readers see the
original ratification + the post-CMD-A6 broadening.

---

*Iron Rule 52 ratified 2026-05-05; §4 amended 2026-05-05
evening.*

# Iron Rule 53 — Ratification

**Status:** ratified 2026-05-05
**Authority:** operator + architect
**Scope:** every brief specifying behavioral verification of
JavaScript code that runs at module load, identity resolution,
or any pre-interaction execution path

---

## Rule

**Verification scripts and probes that test JavaScript behavior
must exercise the actually-deployed code, not stale copies, not
pre-deploy snapshots, and not reasoned approximations of what
the code does.** Sentinel testing — running a probe that
demonstrates the deployed code is the code expected to be
running — is a required prerequisite for any behavioral
verification of JavaScript that depends on module-load-time or
init-time state.

---

## Why this rule exists

CMD-AEGIS-1 §10.3 surfaced the failure mode. The agent
attempted to verify the cross-firm presence isolation fix by
running a verification probe that depended on
`window._myResource.firm_id` being populated. The probe ran
against a session where the post-CMD-AEGIS-1 code had not yet
loaded — the browser was running stale `cmd-center.js` with
the hardcoded firm A fallback still in place. The probe
returned the (correct, fresh) `firm_id` from the resource row
fetch, but the channel-naming code had already used the old
fallback constant at module-load time. The probe appeared to
pass while the leak persisted.

The fix required a hard refresh and a console probe that
explicitly asserted code identity:

```javascript
// Sentinel: verify the post-CMD-AEGIS-1 code is loaded
console.log(typeof Auth.ensureFirmId);  // 'function' = post-AEGIS-1; 'undefined' = stale
console.log(window._phudFirmIdReady);   // Promise instance = post-AEGIS-1; undefined = stale
```

Only after the sentinel confirmed the deployed code was the
expected version did the behavioral verification proceed.

The rule generalizes: **JavaScript behavioral verification
without sentinel testing is unreliable.** Browser cache, CDN
edge nodes, service workers, and stale tab states can all
cause a probe to test a different code version than the
verifier believes is running. The fix is to make the deployed
version itself observable — a function name, a constant, a
sentinel value — and verify that observable before running the
behavioral probe.

---

## §1 — What the rule requires

For each behavioral verification step that exercises
JavaScript code:

1. **The brief identifies a sentinel** — a function name, an
   exported constant, a window-property value, or any other
   observable that distinguishes the post-CMD code from
   pre-CMD code.
2. **The verification step runs the sentinel check first** —
   typically a one-line `console.log` or `typeof` check that
   confirms the expected observable is present.
3. **Only after sentinel passes does the behavioral probe
   run.** If the sentinel fails (the expected observable is
   absent), the verification step halts and surfaces with
   "deployed code does not match expected version" rather
   than running the behavioral probe and reporting a
   misleading result.

For surface CMDs that bump the `js/version.js` pin, the pin
itself can serve as a sentinel: `window._PROJECTHUD_VERSION`
should match the expected value. The brand-meta auto-update
mechanism shipped in CMD-A5 makes this even more robust — the
visible chrome label is itself a sentinel.

---

## §2 — When the rule does NOT fire

- SQL-only verification scripts that don't exercise JavaScript
  are outside the rule's scope.
- Verification of static HTML or CSS rendering without
  JavaScript execution is outside scope.
- Tests run against a deliberately-isolated environment (e.g.,
  a Playwright runner with explicit page-load control) where
  code identity is structurally guaranteed are outside scope.

---

## §3 — Cross-module application

The rule applies to every CMD's behavioral verification across
all ProjectHUD modules. Browser-cached stale code is a
universal failure mode; the discipline is a universal
defensive practice.

---

*Iron Rule 53 ratified 2026-05-05.*

# Iron Rule 54 — Ratification

**Status:** ratified 2026-05-05
**Authority:** operator + architect
**Scope:** every behavioral verification step that asserts a UI
consequence depending on a SQL mutation having landed

---

## Rule

**When a verification step asserts a UI consequence that
depends on a SQL mutation (INSERT, UPDATE, DELETE) having
succeeded, the verification confirms the mutation landed via
SELECT before asserting the UI consequence.** Silent SQL
failures — uncommitted transactions, RLS rejections, deferred
trigger errors, network drops — must not be misattributed as
UI bugs.

---

## Why this rule exists

CMD-A5 §9.2 surfaced the failure mode. The verification step
called for inserting a `contradicts` edge via SQL, then
refreshing the Decision Ledger and asserting the contradicted
ribbon appeared. The first SQL insert silently failed (cause
unknown — uncommitted transaction or SQL editor session
issue). The agent refreshed the UI and observed no ribbon —
which would have been reported as a CMD-A5 surface bug had
the agent not retried the insert and noticed the second
attempt succeeded.

CMD-A1.6 §7.4 reinforced the rule by exercising it
prophylactically. The Merkle root recomputation explicitly
SELECTs the sealed adjustment hashes after the trigger fire
before recomputing the expected Merkle root. The discipline
turned a potential silent-failure attribution problem into a
clean integrity verification.

The rule generalizes: **the gap between "SQL appeared to
succeed" and "SQL actually committed" is the dominant source
of misattributed UI bugs in verification work.** A single
SELECT-after-mutation step costs trivial effort and prevents
hours of misdirected debugging.

---

## §1 — What the rule requires

For each verification step that exercises a SQL mutation:

1. The mutation runs (INSERT, UPDATE, DELETE, etc.).
2. **Immediately after, a SELECT confirms the mutation landed**
   — either by reading back the affected row(s) or by counting
   the change. The SELECT runs in the same transactional
   context as the mutation if possible; otherwise as a fresh
   read.
3. **Only after the SELECT confirms the expected state does the
   UI assertion run.**
4. If the SELECT shows the mutation did NOT land as expected,
   the agent surfaces the SQL-side failure as a finding —
   independently of the UI assertion's eventual outcome.

For verification scripts (`*_verification.sql`,
`*_isolation_verification.sql`, etc.), the SELECT-after-mutation
step is built into the script. For UI-side verification (browser
console probes, manual interaction tests), the SELECT can be
run in the SQL editor or via `API.get(...)`.

---

## §2 — When the rule does NOT fire

- Read-only verification (no mutations involved) is outside
  scope.
- Verification of trigger behavior where the trigger's effect
  IS the SELECT target (e.g., "the trigger should write a
  CoC event row — verify the row exists") implicitly satisfies
  the rule.
- Tests against transactional fixture frameworks (e.g.,
  pytest-postgres, testcontainers) that guarantee mutation
  visibility are outside scope.

---

## §3 — Cross-module application

The rule applies to every coding agent across all ProjectHUD
modules. Verification discipline is module-agnostic.

---

*Iron Rule 54 ratified 2026-05-05.*

# Iron Rule 55 — Ratification

**Status:** ratified 2026-05-05
**Authority:** operator + architect
**Scope:** every architect-drafted brief that asserts behavior
of an existing trigger, function, RLS policy, or schema element

---

## Rule

**Before a brief asserts the behavior of an existing trigger,
function, RLS policy, or any schema element the brief depends
on, the architect verifies the actual behavior by reading the
canonical source — not by extrapolating from prior briefs,
prior hand-offs, or working memory.** Brief-spec assertions
about substrate behavior are themselves subject to the
verification discipline of Iron Rule 47.

---

## Why this rule exists

CMD-A5 §9.5 surfaced the failure mode. The architect drafted
the verification step assuming "any meeting END seals any
pending belief adjustments firm-wide" without re-reading the
CMD-A1 seal trigger source. The actual trigger logic at the
time scoped the belief-adjustment seal CTE to "adjustments
whose target node belongs to the closing meeting." The
mismatch surfaced only at agent-execution time, requiring a
substrate patch (CMD-A1.6) to close the gap the brief had
incorrectly assumed didn't exist.

The architect's failure mode was the same as Iron Rule 47 §2
§6 prohibits at the agent layer: writing application-code (or
in this case, brief-spec) references to schema/trigger
behavior without verifying the actual behavior. Iron Rule 47's
amendment broadened scope from SQL DDL to JS column
references; Rule 55 broadens further to brief-spec assertions
about substrate behavior.

The rule names the architect-side discipline explicitly so
future briefs cannot offload verification responsibility onto
the agent's halt-on-mismatch behavior. The agent's halt is the
backstop, not the primary check. Briefs that pass verification
because the agent halted on mismatch are briefs that wasted
agent time and CMD scope.

---

## §1 — What the rule requires at brief-draft time

For each brief assertion about substrate behavior:

1. **The architect identifies the canonical source** — the
   migration file, the function definition, the RLS policy
   declaration, or any other authoritative artifact.
2. **The architect reads the canonical source directly** —
   not the brief that introduced it, not the hand-off that
   shipped it, not the inventory document that summarizes it.
3. **The brief assertion is written from the canonical
   source.** If the assertion contradicts what prior documents
   claimed, the architect surfaces the contradiction (the
   prior documents may need correction).

For trigger functions specifically, "the canonical source" is
the most recent migration that `CREATE OR REPLACE`d the
function. Multiple patch migrations against the same function
mean the canonical source is the cumulative effect — the
architect reads each patch in sequence to understand the
post-final-patch behavior.

---

## §2 — What the rule does NOT require

- Re-verification when the brief's assertion is about behavior
  the architect just specified in a sibling brief that has
  shipped and passed verification — recent prior architect
  work is trusted within the same arc.
- Verification of well-established Postgres behavior (e.g.,
  "RLS policies block unauthorized SELECTs," "triggers fire
  on UPDATE") that doesn't depend on project-specific
  configuration.
- Re-verification across architect sessions if the canonical
  source has not changed and the prior verification was
  recent.

The rule's spirit is to eliminate the failure mode where
"trigger behavior I think I remember" diverges from "trigger
behavior actually deployed." Routine behaviors that don't
depend on memory don't trigger the rule.

---

## §3 — When this rule's enforcement reveals a brief-spec
problem

If the canonical-source read reveals that a planned brief
assertion is wrong:

1. **If the canonical-source behavior is wrong** (i.e., the
   substrate has a bug or design gap), the architect drafts a
   substrate patch brief separate from the dependent surface
   brief. CMD-A1.6 was this case — CMD-A5 §9.5 revealed the
   substrate gap, CMD-A1.6 patched it, the canonical-source
   read for future Decision Ledger work now reflects the
   broadened seal scope.
2. **If the canonical-source behavior is right and the brief's
   intended assertion is wrong** (i.e., the architect's
   working model was incorrect), the brief is revised to match
   reality before commissioning.
3. **If the canonical-source behavior and the brief's intended
   assertion both reflect different valid choices** (i.e.,
   there's an architectural decision lurking), the architect
   surfaces the decision explicitly rather than picking one
   implicitly.

---

## §4 — Cross-module application

The rule applies to every architect-drafted brief across all
ProjectHUD modules. Substrate-behavior assertions in briefs
are universally subject to canonical-source verification.

The rule does NOT impose a "verify everything" burden — only
brief assertions that depend on specific substrate behavior
require the verification. Briefs that introduce new substrate
elements verify the new element's spec against the production
codebase's existing patterns, not against itself (the new
element is the spec).

---

*Iron Rule 55 ratified 2026-05-05.*
