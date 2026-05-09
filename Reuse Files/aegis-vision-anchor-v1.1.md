# Aegis Policy System — Vision Anchor

**Document type:** Canonical reference · inherited by all coding briefs
**Version:** 1.1 · 2026-04-18
**Supersedes:** v1.0 (adds ecosystem relationship; no conflicting changes)
**Inherits from:** `hud-ecosystem-protocol-v0.1.md`
**Companion:** `aegis-handoff-2026-04-17-milestone.md`

---

## Purpose of this document

This is the **constitutional reference** for the Aegis Policy System. Every
subsequent coding brief (B1, B2, …) inherits from this document. When a brief
says "per the Vision Anchor, policies compose additively," it is referring to
the principles stated here.

As of v1.1, this document inherits from the `HUD Ecosystem Protocol v0.1`.
That protocol defines contracts that cross all four HUD products — the event
bus format, the dispatch request record, identity resolution, and the Chain
of Custody event shape. This Vision Anchor specifies the policy system
itself, which is ProjectHUD-specific but participates in the ecosystem.

Three audiences read this document:

1. **Product stakeholders** — to understand what ProjectHUD is becoming and
   why it matters.
2. **Future Claude coding sessions** — to orient before executing a brief,
   without having to read the full vision conversation.
3. **The current operator (Vaughn)** — as a stable reference the project can
   be re-grounded against when decisions get fuzzy.

This document is **not a specification**. It does not describe file paths,
table schemas, or function signatures. It describes the *shape* of what is
being built and the *principles* that must hold. Specifications live in the
briefs.

---

## The product story, in one sentence

> **ProjectHUD is the only BPM platform where the test runner, the audit
> trail, the live operations view, and the policy engine are the same
> engine.**

Every competitor in this space has a workflow product and bolts on testing
(Selenium), audit (ServiceNow), dashboards (Tableau), and rules (Drools). Each
bolt-on has its own runtime, data model, and audit store. They drift from the
workflows they are supposed to govern.

In ProjectHUD, there is **one event bus, one session model, one artifact
format, one DSL**. Cadence certifies that workflow templates *can* run
correctly. Aegis drives them at run-time across real user sessions. Compass
is where the human actually works. Policies reactively enforce firm rules on
the same event stream Aegis uses to dispatch commands and Cadence uses to
verify coverage.

That unification is the product moat. Every new policy the firm authors
simultaneously receives realtime enforcement, automated test coverage, audit
provenance, and visual UI affordance — because all four are downstream of
the same event + artifact model.

---

## Relationship to the HUD ecosystem

ProjectHUD does not exist in isolation. It is one of four products in the HUD
ecosystem — alongside AdvisorHUD (financial advisory, in alpha), StaffingHUD
(recruiting), and CommandHUD (routing intelligence). The four products share
contracts defined in the `HUD Ecosystem Protocol`.

### Tier placement

ProjectHUD is an **execution-layer** product in the protocol's four-tier
model:

- Agents (tier 1) generate work.
- CommandHUD (tier 2) routes work to humans.
- **ProjectHUD (tier 3) is where humans execute delivery workflows.**
- Channels (tier 4) are the physical surfaces (Teams, SMS, email, the
  ProjectHUD web app itself).

ProjectHUD does not hardcode channel delivery. When a policy needs to notify
a human, ProjectHUD publishes a **dispatch request** (per protocol Contract
2) and lets CommandHUD decide how to deliver it. CommandHUD returns the
human's response through the bus; ProjectHUD acts on it.

This is a substantial change from what the v1.0 draft implied. In v1.0, a
policy "Notify" response was going to be implemented inside Aegis with
direct channel calls. That approach is now explicitly out of scope. Aegis's
`Notify` verb resolves to publishing a `dispatch.requested` event; it does
not construct Teams cards, send SMS, or format emails. That work belongs to
CommandHUD.

### Event bus as ecosystem contract

The seven `app_event` emits specified in Brief B1 are not just ProjectHUD's
internal plumbing. They are **ecosystem events** on the shared bus defined
by protocol Contract 1. CommandHUD will subscribe to them to feed its
routing intelligence. Future cross-product analytics will join them with
events from AdvisorHUD and StaffingHUD.

The emits' payload shapes are locked as ecosystem contracts. Changes to
those shapes require a protocol revision, not just a ProjectHUD brief.

### Policy severity ↔ dispatch urgency

ProjectHUD's three policy severity tiers (advisory, hard gate, lockout)
translate to the ecosystem's four urgency tiers (low, medium, high,
critical) per this mapping:

- **advisory** → dispatch `low` (informational, batchable) or `medium`
  (action needed but not blocking), at the policy author's discretion
- **hard gate** → dispatch `high`; the workflow pauses pending response
- **lockout** → dispatch `critical`; the workflow is refused and a
  blocking instance is created

The severity tier is a ProjectHUD-internal concept (it governs in-product
UX — the interstitial, the pause semantics). The urgency tier is the
ecosystem-external concept (it governs CommandHUD's routing and escalation).
Both exist; a policy author picks severity, and the system derives urgency.

### Identity

ProjectHUD resources are identified by `resource_id` per protocol Contract
3. When a policy targets a human — to inject as an approver, to notify, to
require acknowledgment from — the target is always a `resource_id`, never
an alias or email. Aliases (`VS`, `AK`) are operator conveniences for
scripts and UI; they resolve to `resource_id` before leaving the
ProjectHUD boundary.

---

## The mental model — three layers

Every policy is a tuple of **(Predicate, Severity, Response)** bound to an
**(Event, Context)**:

```
Event  →  Predicate engine  →  Severity tier  →  Response fan-out
```

1. An **event** fires on the ecosystem event bus (`form.submitted`,
   `workflow_request.created`, `instance.blocked`, etc.). Note these are
   not "ProjectHUD events" — they are ecosystem events per protocol
   Contract 1, which ProjectHUD happens to emit.
2. A **predicate** evaluates the event's payload plus any required joined
   context (authorization limits, velocity counters, template metadata).
   Matches continue; non-matches stop.
3. A **severity tier** is declared by the policy:
   - **Advisory** — log it, notify, show a badge. Never blocks work. ~70% of
     policies live here.
   - **Hard gate** — workflow pauses until explicit acknowledgment is
     signed into Chain of Custody. The user may proceed, but the override is
     permanent evidence.
   - **Lockout** — the action is refused. Aegis creates a blocking instance
     that must be resolved before anything proceeds. Reserved for
     regulatory, safety, and financial-integrity violations.
4. A **response** executes — injecting an approver, patching a field,
   publishing a dispatch request to CommandHUD for notification or
   acknowledgment, writing CoC, running a canned Aegis script for
   remediation.

Crucially: **policies and Aegis scripts share the same infrastructure.** A
script is imperative orchestration. A policy is a declarative reaction. Both
consume app-events, both emit actions through the command channel, both
write CoC. The existing parser, the dispatch loop, `_storeVars` context —
all reused. A policy response is, literally, a short Aegis script invoked by
the policy engine rather than by the operator.

---

## The relationship between Aegis, Cadence, and Compass

Within ProjectHUD, three modules are three views into the same engine:

| Module | Role | With respect to policies |
|--------|------|--------------------------|
| **Cadence** | Workflow template authoring + certification | Where policies are **authored** and certified. A policy without at least one Cadence-run proof ("fires on X, produces Y") does not publish to production. |
| **Aegis** | Multi-session command surface + policy runtime | Where policies **run**, where their firings are **observed** (M2), **tuned** (M4 Intelligence), and **audited** (M5). |
| **Compass** | Daily operator work surface | Where policies are **felt** — interstitials, chain mutations, in-product notifications, ticker events. |

A policy's full lifecycle crosses all three: authored in Cadence, certified
against synthetic events, published to Aegis, felt by users in Compass,
observed in M2, audited in M5.

Important scope clarification: when a policy response needs to reach a
human who is *not currently in Compass*, that delivery happens via
CommandHUD per the ecosystem protocol. Compass surfaces policy firings
for its own users in-session; CommandHUD handles everything else.

---

## The eight policy classes

Each class is a pattern of predicate + response. One class generates many
concrete policies.

### Class 1 — Threshold policies
Watches a numeric or categorical field and fires when it crosses a boundary.
*Example: Expense Report ≥ $5,000 injects CFO into the approval chain.*

### Class 2 — Velocity & pacing policies
Watches rates over a sliding window.
*Example: An approver receiving ≥5 requests in 24h triggers overload
advisory.*

### Class 3 — Composition & combinatorial policies
Fires on combinations across multiple events or entities.
*Example: Same resource appears as both submitter and approver on the same
instance — separation-of-duties violation, hard gate.*

### Class 4 — Temporal & deadline policies
Fires on elapsed time or approaching deadlines, not on an action.
*Example: Instance stalled at step N for >48h auto-escalates to next
approver in the chain.*

### Class 5 — Provenance & precondition policies
Checks external state before allowing an action.
*Example: A medical-device Project Change Order requires a DHF review
younger than 90 days before the submission is accepted.*

### Class 6 — Disparity & drift policies
Fires when reality drifts from a declared plan.
*Example: CPI drops below 0.85 auto-creates a Concern note tagged as risk.*

### Class 7 — Access & routing policies
Governs who can do what and where the work goes.
*Example: A confidential request never routes to external contractors;
lockout with CoC entry.*

### Class 8 — Composite & cascade policies
Meta-policies that watch other policies firing.
*Example: A hard-gate policy overridden more than X% of the time
auto-suggests demotion to advisory for author review.*

**Implementation progression:** Classes 1 and 7 land first (no state store
needed). Classes 4 and 5 add tick sources and external-state checks.
Classes 2 and 3 add counters and cross-event correlation. Classes 6 and 8
are latest-phase because they depend on the rest.

---

## The three design principles

These principles govern all policy implementation. Any brief, any code
review, any design conversation can be checked against them.

### Principle 1 — Policies compose, never conflict

If two policies fire on the same event, their responses must be **additive**,
not contradictory.

- "Inject CFO" plus "Inject Legal" equals both appended to the chain, in
  deterministic order by policy priority.
- "Hard gate" plus "Advisory" from two different policies equals strongest
  severity wins, but **both** CoC entries are written.

Ordering is **explicit in the policy definition**. Two policies at the same
priority firing on the same event is a deployment-time error, not a runtime
surprise. Cadence must refuse to publish a policy whose priority collides
with an existing one without explicit operator resolution.

### Principle 2 — Every policy is reversible and auditable

Every policy firing writes a CoC entry (per protocol Contract 4) capturing
what it changed. Every mutation — approver injection, field patch, route
change, dispatch request sent — stores the pre-state so it can be undone.
A policy that silently changes state is a debugging nightmare and a
compliance one.

Cost: roughly 200 bytes per firing in Supabase. Value: total traceability
from instance back through every rule that touched it.

### Principle 3 — Hard-gate overrides are first-class evidence

When a user acknowledges a hard-gate policy to proceed, their acknowledgment
— with timestamp, justification text, and authority level — becomes part of
the permanent CoC. Most systems treat "user clicked OK" as equivalent to
"policy didn't fire." ProjectHUD treats it as "policy fired, authority X
explicitly overrode, here is why."

That is the difference between a suggestion and a control. It is also the
artifact regulators ask for when they audit a firm's control environment.

When the acknowledgment happens through a CommandHUD-delivered channel
(Teams card, SMS reply, email link), the CoC entry records the channel
and the routing decision, inherited from the `dispatch.responded` event.
The provenance is complete regardless of surface.

---

## Shared infrastructure — what policies inherit from Aegis

Policies do not require new infrastructure. They run on what exists:

- **Event bus** — the Supabase realtime `app_event` channel (protocol
  Contract 1), broadcast via `window._cmdEmit()`. The policy evaluator is
  an additional subscriber alongside `Wait ForEvent` listeners and
  CommandHUD's router.
- **Command vocabulary** — the `COMMANDS` registry in `cmd-center.js`. New
  verbs (`Inject Approver`, `Require Acknowledgment`, `Gate`, `CoC Write`,
  and the dispatch-request-publishing `Notify`) are added to the same
  registry scripts already use.
- **Context storage** — `_storeVars` and its planned successor, the shared
  `RunContext`. A policy's predicate reads from it; a policy's response
  writes to it.
- **Dispatch channel** — `phud:cmd:{uid}` broadcasts are how internal
  responses land on target sessions within ProjectHUD. For
  out-of-product delivery (SMS, email, other HUDs), responses go through
  CommandHUD via dispatch requests.
- **CoC writer** — a single CoC emit function handles workflow,
  test-run, and policy-generated events, writing to the shared
  `coc_events` table per protocol Contract 4.

The evaluator itself runs on the session where the triggering event
originated, for most classes. Only velocity (Class 2), temporal (Class 4),
and composite (Class 8) policies need a centralized Supabase edge function
for counter state and tick emission.

---

## Runtime flow — policy cascade from user action

When a user submits a form in Compass:

1. The form writes the instance row to Supabase.
2. `mw-tabs.js` emits `form.submitted` on the event bus (per Brief B1)
   with the full payload.
3. The policy evaluator (subscribed to that event class) pulls matching
   policies from `aegis_policies`, indexed on event type.
4. Each policy's predicate runs against the event payload plus joined
   context.
5. Matches enter a response queue, ordered by severity: lockouts run first
   (and can short-circuit), then hard gates, then advisories.
6. Each response executes through the command dispatch path — the same
   machinery that handles Aegis script commands. In-product mutations
   happen immediately; out-of-product notifications become dispatch
   requests published to CommandHUD.
7. A `policy.fired` CoC entry is always written, regardless of severity,
   with full before/after state.
8. The originating session receives confirmation broadcasts and updates UI
   accordingly.

Typical latency, end-to-end within ProjectHUD: **under 250 ms** for
advisory and hard-gate policies. Lockouts land synchronously — the
submission is rejected before the client repaints.

Out-of-product notifications have their own latency profile owned by
CommandHUD, which is governed by the urgency tier (see protocol Contract
2). Policies should not assume a specific notification SLA within their
own logic; they fire the dispatch request and move on.

---

## What policies are not

Bounding what this system is *not* is as important as defining what it is.

- **Policies are not workflow steps.** A workflow step is an intentional
  stop designed into the template. A policy is a reactive rule that may
  modify a workflow, but is authored and versioned independently.
- **Policies are not user preferences.** They are firm-level controls. A
  user cannot disable a policy; only an authorized policy author can, and
  that change is itself a CoC event.
- **Policies are not a rules engine for arbitrary business logic.** They
  specifically mediate the interaction between events, workflows, and
  audit. Logic that belongs inside a form, a workflow step, or a validation
  rule stays there. Policies are the firm-level safety and governance
  layer.
- **Policies are not silent.** Every firing is visible somewhere — in the
  M2 feed at minimum, and often in the user's own Compass UI.
  Invisible enforcement is not allowed.
- **Policies do not do their own delivery.** Per the ecosystem protocol,
  any human-facing notification from a policy goes through CommandHUD.
  Aegis does not send SMS, construct Teams cards, or hit an email API
  directly. It declares intent; CommandHUD delivers.

---

## Glossary

**Advisory** — A severity tier. The policy fires, logs, and may notify,
but does not block the workflow. Maps to ecosystem urgency `low` or
`medium`.

**Aegis script** — An imperative, operator-written sequence of commands
executed across one or more sessions. See the CMD53 handoff doc.

**app_event** — A realtime broadcast on the Supabase channel, distinct
from command dispatch. Represents something that *happened*, not an
instruction. Carries no return value. Synonymous with "ecosystem event"
in protocol Contract 1.

**Chain of Custody (CoC)** — The immutable audit trail. Every workflow
transition, test run, and policy firing writes at least one CoC entry
to the shared `coc_events` table per protocol Contract 4.

**Command dispatch** — The `cmd` broadcast on the realtime channel,
addressed to a specific target session within ProjectHUD, expected to
ack via `result`. Distinct from a dispatch request, which goes through
CommandHUD.

**CommandHUD** — The routing intelligence layer of the HUD ecosystem.
Owns channel profiles, presence, priority-weighted routing. Tier 2 in
the protocol's four-tier model.

**Compass** — The operator-facing work surface within ProjectHUD
(distinct from Aegis, the operations command surface).

**Context** — The data an evaluating predicate can reach beyond the
triggering event payload. Includes joined DB rows, counter state, and
`_storeVars`.

**Dispatch request** — A typed request for CommandHUD to deliver
something to a human. Defined in protocol Contract 2. Replaces
direct-channel notifications in v1.1.

**Event bus** — The `app_event` broadcast channel. Policies,
`Wait ForEvent` commands, and CommandHUD all subscribe.

**Hard gate** — A severity tier. The workflow pauses until the user
explicitly acknowledges. The acknowledgment is itself a CoC entry.
Maps to ecosystem urgency `high`.

**Lockout** — A severity tier. The workflow is refused and a blocking
instance is created. Resolution requires authorized override. Maps to
ecosystem urgency `critical`.

**Policy** — A named, versioned rule of the form (Event, Predicate,
Severity, Response), registered in `aegis_policies`.

**Predicate** — The matching condition of a policy, evaluated against
the event payload and context. Must be pure and side-effect-free.

**Resource ID** — The canonical identifier for a human across the HUD
ecosystem. Immutable. See protocol Contract 3.

**Response** — The action taken when a predicate matches. Implemented
as a command (or short sequence of commands) from the `COMMANDS`
registry. Responses may target in-product state directly or publish
dispatch requests for out-of-product delivery.

**Severity tier** — Advisory, hard gate, or lockout. Declared by the
policy; determines ordering and UI treatment within ProjectHUD. Maps
to ecosystem urgency.

**Urgency tier** — `critical`, `high`, `medium`, `low`. The
ecosystem-level equivalent of severity, governing CommandHUD's routing
behavior. See protocol Contract 2.

---

## Commitments this document makes to the future

These are not negotiable without explicit revision of this document:

1. **One event bus.** Policy events, test events, and ecosystem events
   are the same stream (per protocol Contract 1).
2. **One DSL family.** Policy responses use the same command vocabulary as
   Aegis scripts. A new command is useful to both.
3. **One audit store.** CoC entries from workflows, tests, policies, and
   dispatch lifecycle share the `coc_events` table and schema (per
   protocol Contract 4).
4. **One severity model.** Three tiers — advisory, hard gate, lockout —
   no more, no fewer. Map to the ecosystem urgency model but remain
   distinct.
5. **Authored in Cadence, enforced in Aegis, felt in Compass, delivered by
   CommandHUD.** The four modules/products keep their roles; we do not
   grow a fifth surface for policies.
6. **Reversibility is non-optional.** Every mutation stores its pre-state.
7. **CoC on every firing, without exception.** Not configurable, not
   skippable.
8. **No direct channel delivery from policies.** Out-of-product
   notification goes through CommandHUD dispatch requests, always.
   (New in v1.1.)

---

## Reading order for a Claude coding session

When a new session is briefed with a specific task:

1. Read `hud-ecosystem-protocol-v0.1.md` first (~15 min).
2. Read this document (~15 min).
3. Read `aegis-handoff-2026-04-17-milestone.md` for the current platform
   state and iron rules (~15 min).
4. Read the specific brief (`aegis-brief-Bxx-*.md`) for the task at hand
   (~10 min).
5. Read only the source files the brief lists in its Context section.
6. Do not read the broader codebase speculatively. The protocol + anchor
   + handoff + brief tell you what you need.

When a brief is complete, the definition of done always includes updating
the handoff document with new iron rules and version numbers. This
document is updated only when one of the commitments above changes, or
when its relationship to the ecosystem protocol shifts.

---

## Decision log

- *2026-04-18 · v1.0 · Vaughn Staples · initial document.*
- *2026-04-18 · v1.1 · Vaughn Staples · adds Relationship to the HUD
  ecosystem section; updates response semantics to route out-of-product
  notifications through CommandHUD dispatch requests; adds commitment
  #8; inherits from HUD Ecosystem Protocol v0.1. No conflicting changes
  — v1.0 policies remain valid; v1.1 constrains how their Response
  implementations are realized. Briefs authored against v1.0 need review
  for "Notify" and escalation semantics.*
