# Iron Rule 56 — Ratification

**Status:** ratified 2026-05-05 evening
**Authority:** operator + architect
**Scope:** every parser, splitter, or string-manipulation
function that operates on registered keys with multi-segment
structure (e.g., dotted-namespace event types, slash-separated
URIs, colon-separated compound identifiers)

---

## Rule

**Parsers that decompose multi-segment registered keys must be
tested against the full registered key set, not against a
representative subset.** When a key registry contains entries
with varying segment counts (two-segment, three-segment,
four-segment), the parser's behavior on each cardinality must
be explicitly verified before the parser is considered
correct.

---

## Why this rule exists

CMD-A6 surfaced the canonical case in `coc.js`. The
`_resolveActor()` and event-write code path included:

```javascript
const [eventClass, eventType] = typeKey.split('.');
```

This works correctly for two-segment keys like `task.completed`
or `accord.meeting.ended` — wait, `accord.meeting.ended` is
three-segment. The split returned `['accord', 'meeting']`,
silently dropping the `.ended` suffix. The bug was latent
because all prior CoC writes happened to be from server-side
contexts where the parser path wasn't exercised, OR used
two-segment keys that happened to round-trip correctly.

CMD-A6 was the first client-side caller using a three-segment
key (`accord.digest.delivered`). The bug surfaced immediately:
the event row landed with `event_type = 'digest'` instead of
`'digest.delivered'`, the EVENT_META lookup failed, the visual
treatment defaulted to generic, and downstream code couldn't
distinguish `digest.delivered` from `digest.scheduled`.

The fix split on the first `.` only:

```javascript
const firstDot = typeKey.indexOf('.');
const eventClass = typeKey.slice(0, firstDot);
const eventType = typeKey.slice(firstDot + 1);
```

The deeper failure was that the parser was never tested
against the full EVENT_META registry. Of ~30 registered event
types, perhaps two-thirds are two-segment and one-third are
three-segment. The two-segment cases happened to be the only
ones exercised by prior callers.

---

## §1 — What the rule requires

When introducing or modifying a parser/splitter for
multi-segment registered keys:

1. **Identify the registry.** The set of legal keys (e.g.,
   `EVENT_META` keys, URI scheme registrations, message-type
   enums).
2. **Identify the cardinality distribution.** How many
   segments do registered keys have? Is the distribution
   uniform or varied?
3. **Test the parser against every registered key**, not
   against a subset. Verify the parser returns the expected
   decomposition for each cardinality present in the
   registry.
4. **Lock the parser's contract** — document whether it
   accepts variable cardinality (and how it handles each), or
   whether it requires a fixed cardinality (and rejects
   others).

For string-key parsers in particular, the test is trivial:
iterate the registry, run the parser, assert correctness. The
absence of this test is the rule's failure mode.

---

## §2 — When the rule does NOT fire

- Parsers that operate on free-form input (URLs, user-typed
  strings) where the registry is unbounded — these need
  different testing strategies (fuzz testing, edge-case
  enumeration).
- One-shot parsers used in a specific call site where the
  input is statically known — no registry exists to test
  against.

---

## §3 — Cross-module application

The rule applies to every coding agent across all ProjectHUD
modules. Multi-segment registered key parsing is a universal
pattern; the discipline is universal.

---

*Iron Rule 56 ratified 2026-05-05 evening.*

# Iron Rule 57 — Ratification

**Status:** ratified 2026-05-05 evening
**Authority:** operator + architect
**Scope:** every JavaScript module that declares a public API
intended for cross-module consumption

---

## Rule

**When a module declares a public API as a `const` or `let` at
module scope, the module also assigns the API to `window` (or
the appropriate global namespace) so that cross-module
defensive callers using `window.X` patterns work.** The
assignment is the public contract; the local `const` is
implementation. Both must exist for the API to be reliably
reachable.

---

## Why this rule exists

CMD-A6 surfaced the canonical case in `api.js`. The module
declared:

```javascript
const API = { /* ... methods ... */ };
```

But never assigned `window.API = API`. Internal code within
`api.js` could reference `API` directly; external callers
using the conventional `window.API.get(...)` pattern saw
`undefined`.

The bug was latent because most callers historically used
`API.get(...)` (relying on the `const` being globally visible
in older patterns) or were declared in script-load order such
that they could see `API` directly. CMD-A6 was the first
caller to use the defensive `window.API` pattern (in
`coc.js`'s `CoC.write()` path), and it failed silently.

The fix appended `window.API = API;` at the bottom of
`api.js`. The two-line addition closed the gap permanently.

The deeper failure mode is that JavaScript's module-scope
`const` and `window`-property are different namespaces. Old
ES5 code where `var API = ...` at script top-level
auto-promoted to `window.API` no longer applies — modern
`const` declarations don't auto-promote. The convention drift
across the codebase (some modules assign to `window`, some
don't) creates unpredictability for cross-module callers.

---

## §1 — What the rule requires

When introducing or modifying a JavaScript module's public
API:

1. **Declare the API locally** as `const Foo = { ... }` or
   equivalent.
2. **Explicitly assign to `window`** at the bottom of the
   module: `window.Foo = Foo;`.
3. **Document the assignment** with a one-line comment
   indicating it's the public contract surface.

For modules that already have a public API and a `window`
assignment, no action required. For modules with a `const`
declaration but no `window` assignment, the discipline says
add the assignment when next modifying the module — not
opportunistically refactored.

---

## §2 — When the rule does NOT fire

- Modules that are explicitly internal-only (no public API
  intended) — no `window` assignment needed. These should be
  IIFE-wrapped to enforce the privacy.
- Modules that use a different global-namespace convention
  (e.g., a custom `window.PHUD.foo` namespace) — assign to
  the convention's location, not to `window` directly.
- Module systems that don't share `window` (Web Workers,
  service workers, etc.) — the rule's spirit applies but the
  mechanics differ.

---

## §3 — Cross-module application

The rule applies to every coding agent across all ProjectHUD
modules. Cross-module API reachability is a universal
concern.

---

*Iron Rule 57 ratified 2026-05-05 evening.*

# Iron Rule 58 — Ratification

**Status:** ratified 2026-05-05 evening
**Authority:** operator + architect
**Scope:** every application code path that writes a CoC event
where the actor is identified user-side (via `auth.uid()`,
`window.CURRENT_USER.id`, or any equivalent users-table
identifier)

---

## Rule

**Application code writing CoC events from a user-identified
context must explicitly resolve `users.id` → `resources.id`
before the write.** The resolution uses the
`accord_user_to_resource()` helper (or any equivalent in
non-Accord modules) and the resolved `resources.id` is passed
to `CoC.write()` via the `actorResourceId` override. Reliance
on `coc.js`'s `_resolveActor()` chain is unreliable until the
chain itself is refactored to do the translation.

---

## Why this rule exists

CMD-A6 surfaced the canonical case. `coc.js`'s
`_resolveActor()` function reads `window.CURRENT_USER.id`
(line 251 of the production source) and assigns it directly
to `coc_events.actor_resource_id`. The column FKs to
`resources(id)`, but `CURRENT_USER.id` is a `users.id` value
(populated from `auth.uid()`).

For Accord-side writers, the FK insert failed with `23503`
(foreign key violation) because the `users.id` UUID does not
exist in `resources(id)`. The fix required two parts:

1. CMD-A6 shipped the `accord_user_to_resource()` SQL helper
   (per build brief §4.5).
2. The Accord-side write code resolves once via the helper,
   then passes the resolved `resources.id` to `CoC.write()`
   via a new `opts.actorResourceId` override.

Compass-side writes did not surface this bug because Compass
sets `_myResource` correctly before any CoC write, and the
`_resolveActor()` chain reads `_myResource` before falling
through to `CURRENT_USER`. Accord's identity flow doesn't
populate `_myResource` in the same way, so the chain falls
through and hits the broken branch.

The deeper failure: `coc.js`'s identity-resolution chain has a
structurally wrong branch. The CURRENT_USER fallback assigns
a users-id where a resources-id is required. Until the chain
itself is fixed (a separate refactor brief — likely in
CMD-FOUNDATION-REVIEW scope), every application-code CoC
writer must defensively resolve and override.

---

## §1 — What the rule requires

When application code calls `CoC.write()` from a context where
the actor's identity is `users.id`-shaped (e.g., a freshly
authenticated session, an `auth.uid()` value, a `users.id` FK):

1. **Resolve the user → resource translation** before the
   write. For Accord-side code:
   ```javascript
   const r = await API.rpc('accord_user_to_resource', { p_user_id: userId });
   ```
   For other modules, use the equivalent helper (which may
   need to be added per-module if not yet present).
2. **Pass the resolved resource ID** to `CoC.write()` via the
   `actorResourceId` override option:
   ```javascript
   await CoC.write('event.type', entityId, {
     actorResourceId: r,
     // ... other opts
   });
   ```
3. **Cache the resolution** at module-init time or
   per-session if the same user writes multiple events. The
   helper is `STABLE`, so the result is safe to cache for the
   session lifetime.

If the user has no resource row (system users, removed
staff, etc.), the helper returns `NULL`. Application code
decides whether to:
- Write the event with `actorResourceId: null` (anonymous
  attribution, accepted by `coc_events.actor_resource_id`'s
  nullable column)
- Reject the write with a clear error
- Surface the missing resource as a finding

---

## §2 — When the rule does NOT fire

- Server-side / trigger-side CoC writes that already have
  `resources.id` in scope — the seal trigger pattern is
  correct.
- Code paths in modules that populate `_myResource` correctly
  before any CoC write — the existing `_resolveActor()` chain
  branches to `_myResource` first and gets correct values.
  But "correctly" is hard to verify, so when in doubt, apply
  the rule.
- Future state: when `coc.js`'s `_resolveActor()` chain is
  refactored to do the translation internally (a foundation-
  review scope item), this rule's call-site override
  requirement may become optional. Until then, mandatory.

---

## §3 — Cross-module application

The rule applies to every coding agent across all ProjectHUD
modules that write CoC events from user-identified contexts.
The Accord-side helper (`accord_user_to_resource()`) is the
shipped reference; other modules adopt the same pattern as
needed.

---

*Iron Rule 58 ratified 2026-05-05 evening.*

# Iron Rule 59 — Ratification

**Status:** ratified 2026-05-05 evening
**Authority:** operator + architect
**Scope:** every behavioral verification script that creates
test fixtures (meetings, threads, nodes, decisions, etc.) and
references those fixtures in subsequent assertions

---

## Rule

**Verification scripts that depend on test fixtures bind to
the fixture's UUID (or other primary identifier) at fixture
creation time, not to the fixture's title or other mutable
attribute.** Subsequent SQL queries, UI assertions, and
cleanup steps reference the fixture by its identifier
captured at creation, not by re-resolving via title-string
lookup.

---

## Why this rule exists

CMD-A6 §10.7 surfaced the canonical case. Verification
required two test fixture meetings; the operator named them
"10.4 risk fixture" and "10.4 risk fixture2". Subsequent SQL
queries used `WHERE title LIKE '10.4 risk%'` patterns that
matched both fixtures, causing data to bind to the wrong
meeting and producing confusing test results.

The fix discipline: capture the `meeting_id` (or equivalent
UUID) at the moment the fixture is created. Use that UUID in
every subsequent reference. Title strings are documentation,
not selector targets.

The deeper failure mode: humans naming fixtures with
sequential or descriptive titles produce title-collisions
under load. Title-based selection is a brittleness multiplier
when verification contains multiple test cycles or iterative
debugging.

---

## §1 — What the rule requires

For verification scripts:

1. **Capture the UUID at creation time.** Insert returns
   the new row's PK; bind it to a script variable.
2. **All subsequent queries use the UUID.** No `WHERE title
   = '...'` lookups for fixtures the script created itself.
3. **Cleanup uses the UUID.** Delete by UUID, not by title.

For interactive verification (browser console probes,
operator-run UI checks):

1. **Capture the UUID via `RETURNING` or post-INSERT SELECT.**
   ```sql
   INSERT INTO accord_meetings (...) VALUES (...) RETURNING meeting_id;
   ```
   Or:
   ```javascript
   const m = await API.post('accord_meetings', {...});
   const meetingId = m.meeting_id;
   ```
2. **Reference the captured ID in subsequent steps.** The
   verification document or hand-off records the UUID
   alongside any title-based description.

For automated verification scripts (`*_verification.sql`,
`*_isolation_verification.sql`):

1. **Use CTEs or DECLARE blocks** to capture and reference
   UUIDs:
   ```sql
   DO $$
   DECLARE
     v_meeting_id uuid;
   BEGIN
     INSERT INTO accord_meetings (...) VALUES (...)
     RETURNING meeting_id INTO v_meeting_id;
     -- subsequent queries use v_meeting_id
   END $$;
   ```

---

## §2 — When the rule does NOT fire

- Tests against fixtures that pre-exist and have known stable
  UUIDs (e.g., the firm B fixtures seeded by CMD-A6 §9 with
  documented UUIDs in the hand-off) — title-based lookup is
  unnecessary because the UUID is already known.
- Production data audits that need to find rows matching
  title patterns — title-based queries are valid when the
  intent IS title-pattern matching, not fixture
  identification.
- Schema-level tests (constraint checks, RLS policy
  verification) that don't reference specific row data.

---

## §3 — Cross-module application

The rule applies to every coding agent and every operator-run
verification across all ProjectHUD modules. Fixture brittleness
is module-agnostic.

The rule pairs with Iron Rule 54 (SELECT-after-mutation): both
are verification-discipline rules that prevent
misattribution of test failures to surface bugs.

---

*Iron Rule 59 ratified 2026-05-05 evening.*

# Iron Rule 60 — Ratification

**Status:** ratified 2026-05-05 evening
**Authority:** operator + architect
**Scope:** every brief that introduces a new caller of an
existing public API, helper function, or shared service that
has not previously been called from the call shape the brief
introduces

---

## Rule

**When a brief introduces a new caller of an existing public
API or shared service, the architect verifies that the API
has been previously exercised from the same call shape — same
identity context, same threading model, same transactional
context, same error-handling model.** If no prior caller has
exercised the API from that shape, the brief surfaces this as
a "first-caller hazard" and includes specific verification
steps to confirm the API behaves correctly under the new call
shape.

---

## Why this rule exists

CMD-A6 surfaced three structural problems in `coc.js` and
`api.js` because CMD-A6 was the first client-side caller of
`CoC.write()` from an Accord-side identity context:

1. The dotted-suffix split bug in `coc.js` (Rule 56's case)
2. The `window.API` exposure gap in `api.js` (Rule 57's case)
3. The `_resolveActor()` chain identity-resolution gap in
   `coc.js` (Rule 58's case)

All three bugs had been present in the foundation modules for
some time but had never surfaced because no prior caller had
exercised the same code path. Compass-side writes worked
because Compass populates `_myResource` and uses two-segment
event types. Accord-side writes hit every gap because Accord
does neither.

The architect's brief draft assumed `CoC.write()` "just
works." It works for the call shapes it had been exercised
from. The brief's failure was not anticipating that
introducing a new call shape would surface latent issues in
the existing API.

The pattern is general: **APIs are correct only for the call
shapes they've been tested against.** A function that's been
in production for two years is not necessarily correct for a
caller that exercises it differently than every prior caller.

---

## §1 — What the rule requires at brief-draft time

When a brief introduces a new caller of an existing API:

1. **Identify the API surface and its call shape signature.**
   What identity context does the new caller use? What
   transactional context? What error-handling model? What
   payload shape?
2. **Survey prior callers of the API.** Grep the codebase
   for existing call sites; characterize their call shapes.
3. **Compare.** Does any prior caller exercise the API from
   the same shape the new caller will?
4. **If yes**, the brief proceeds normally — the API is
   verified for the call shape.
5. **If no**, the brief surfaces this as a "first-caller
   hazard" and includes:
   - Explicit verification steps that exercise the API and
     verify behavior
   - Patch-readiness — anticipating that latent bugs may
     surface and need mid-CMD patches (mid-cycle pin bumps
     are acceptable)
   - A finding requirement — any latent bug found is a
     surfacing-finding, not just a patch-without-doctrine

The brief does NOT require the architect to fix the API
proactively. The hazard surfacing is a warning, not a
mandate. Sometimes the right answer is "ship the new caller
and patch the foundation as latent bugs surface."

---

## §2 — What the rule requires at CMD-execution time

When the agent introduces a call site for a public API:

1. **Run a quick smoke probe** against the API before
   building substantial code on top of it. Verify the call
   shape works as expected.
2. **If the smoke probe surfaces a bug in the existing API**,
   halt and surface — the bug fix may belong in this CMD or
   in a separate CMD; the architect decides.
3. **Document patches to the foundation** as separate
   findings in the hand-off, not buried in implementation
   detail. Each foundation patch is its own provisional rule
   candidate (per Rules 56-58).

---

## §3 — When this rule does NOT fire

- New callers that exercise an API from a call shape that
  multiple prior callers have already exercised — the API is
  battle-tested for that shape.
- New callers in CMDs whose explicit purpose is to refactor
  or replace the API itself — the rule's hazard mitigation
  is built into the refactor scope.
- Internal-module calls (within the same file or IIFE) where
  the API is colocated with its only caller — first-caller
  hazards don't apply within scope.

---

## §4 — Cross-module application

The rule applies to every architect-drafted brief and every
coding agent across all ProjectHUD modules. First-caller
hazards are universal — any API has them whenever a caller
introduces a new shape.

This rule's spirit is closely related to Rule 55 (architect-
side canonical-source verification). Rule 55 covers
substrate-behavior assertions; Rule 60 covers API-behavior
assertions. Both require the architect to verify before
asserting; the difference is the verification target
(substrate code vs. API surface code).

---

*Iron Rule 60 ratified 2026-05-05 evening.*
