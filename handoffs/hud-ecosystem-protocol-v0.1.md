# HUD Ecosystem Protocol

**Document type:** Cross-product contract · inherited by ProjectHUD, AdvisorHUD, StaffingHUD, and CommandHUD
**Version:** 0.1 · 2026-04-18
**Status:** Draft · pending review by both build tracks
**Supersedes:** n/a (initial document)

---

## Purpose

Four products are being built in parallel: ProjectHUD (delivery operations),
AdvisorHUD (financial advisory operations, in alpha), StaffingHUD (recruiting
operations), and CommandHUD (routing intelligence layer). They must work
together without requiring a weekly coordination meeting between build tracks.

This document defines the **shared contracts** that let those four products
interoperate: the event bus format, the dispatch request record, identity
resolution, and the Chain of Custody event shape.

If a contract is defined here, product-specific documents inherit it without
restating it. If a contract is absent here, product-specific documents are
free to decide locally — but any decision that could affect another product
in the ecosystem belongs in this document, not in a product-specific one.

The goal: **two independent coding sessions — one in ProjectHUD, one in
CommandHUD — can ship compatible code without reading each other's internals.**

---

## Reading order

Every Claude coding session working on any HUD product reads this document
before reading their product's Vision Anchor. The inheritance is:

```
HUD Ecosystem Protocol          ←  this document
  ↑
  ├── ProjectHUD Vision Anchor  ←  Aegis Policy System
  ├── AdvisorHUD Vision Anchor  ←  (parallel)
  ├── StaffingHUD Vision Anchor ←  (parallel)
  └── CommandHUD Vision Anchor  ←  Routing Intelligence Layer
        ↑
        └── Product-specific briefs
```

Briefs reference their Vision Anchor, which references this protocol. No
brief should reference this protocol directly — if a brief needs a contract
clarified, it either (a) the Vision Anchor is missing a reference, or (b)
this protocol needs a revision. Both are solvable; guessing is not.

---

## The four layers

The ecosystem has four functional tiers. Each product belongs to exactly
one tier. A product in tier N may consume from tier N-1 but must not
consume directly from tier N-2 or lower without going through tier N-1.

| Tier | Role | Products |
|------|------|----------|
| **Agent layer** | Generates work. Detects commitments, deadlines, invoices, action items. Produces dispatch requests. | External agents (Archivist, Sentinel, etc., per Proxy proposal). Future: in-HUD intelligence modules. |
| **Routing layer** | Decides how work reaches humans and which surface owns the response. Owns channel profiles, presence tracking, priority-weighted routing, escalation timers. | CommandHUD. |
| **Execution layer** | Where humans act on work. Owns domain workflows, approvals, state transitions. | ProjectHUD, AdvisorHUD, StaffingHUD. |
| **Channel layer** | The physical surfaces humans see. Teams cards, SMS, email, HUD web apps, voice. | External (Teams, Twilio, SendGrid, etc.) or native to the execution layer. |

Two rules govern inter-tier traffic:

1. **Agents do not bypass CommandHUD to reach a human.** If an agent wants
   a human decision, it publishes a dispatch request; it does not directly
   deliver to Teams or email.
2. **Execution-layer products do not hardcode channel delivery.** When a
   ProjectHUD policy or an AdvisorHUD workflow needs to notify a human,
   it publishes a dispatch request; it does not call Teams APIs directly.

The second rule is a commitment. It means ProjectHUD's "Notify" command,
AdvisorHUD's "Alert advisor" action, and StaffingHUD's "Ping recruiter"
button all resolve to the same primitive: publish a dispatch request.
CommandHUD does the rest.

---

## Contract 1 — The event bus

### Transport

All four products share a single Supabase project for v1. This eliminates
federation complexity and lets all products subscribe to the same realtime
channel. If multi-tenancy later requires per-firm isolation, we introduce
a federation bridge; until then, one project, one channel per firm.

Channel name: `hud:{firm_id}`

### Message envelope

Every message on the bus carries this envelope:

```json
{
  "protocol_version": 1,
  "event_type": "form.submitted",
  "event_id": "uuid-v4",
  "source_product": "projecthud",
  "source_session": "user-uuid-or-anon",
  "ts": 1713456789000,
  "firm_id": "uuid",
  "payload": { ... }
}
```

Field rules:

- **`protocol_version`** — integer. Current value `1`. Breaking changes bump
  this; consumers must branch on it. Never change it without revising this
  document.
- **`event_type`** — lowercase, dot-separated, namespace.verb
  (`form.submitted`, `workflow_request.created`, `dispatch.responded`).
  The namespace identifies the domain; the verb is past-tense.
- **`event_id`** — unique per event. Consumers use it to dedupe.
- **`source_product`** — one of `projecthud`, `advisorhud`, `staffinghud`,
  `commandhud`, `agent:{agent_name}`. Tells consumers which builder emitted
  it.
- **`source_session`** — the session userId if known, or `system` for
  non-session events (agent emissions, policy firings).
- **`ts`** — `Date.now()` milliseconds. Never an ISO string. Never a
  `Date` object. Consumers format for display.
- **`firm_id`** — redundant with channel name, but included so messages
  are self-describing when archived out of channel context.
- **`payload`** — event-type-specific. See the event catalog below.

### Event catalog

This is the **authoritative list** of event types across all products.
Adding an event type requires revising this document. Renaming payload
fields requires revising this document.

Namespaces reserved as of v0.1:

| Namespace | Owner | Purpose |
|-----------|-------|---------|
| `form.*` | Execution layer | Form/submission lifecycle |
| `workflow_request.*` | Execution layer | Routing and approvals |
| `instance.*` | Execution layer | Workflow instance lifecycle |
| `location.*` | Execution layer | UI location ready events |
| `dispatch.*` | Routing layer | CommandHUD routing decisions |
| `policy.*` | Execution layer | Policy evaluator firings |
| `agent.*` | Agent layer | Agent-detected signals |
| `coc.*` | All | Chain of Custody audit events |

Product-specific briefs specify the exact payload for events in their
namespace. See `Appendix A` for the currently-specified events.

### Self-echo and filtering

When a session publishes an event, the existing listeners on that session
resolve immediately (via the local-resolve pattern in `_cmdEmit`). Remote
sessions receive the broadcast and filter based on their own rules. The
specifics of self-echo are product-specific (see ProjectHUD Vision Anchor,
Iron Rule 15), but all products honor one invariant: **a session never
processes its own broadcast twice** (once locally on publish, once
remotely via echo).

---

## Contract 2 — The dispatch request

This is the most consequential contract in the ecosystem. It is how agents
and execution-layer products ask CommandHUD to put something in front of a
human.

### When to publish a dispatch request

Any of these situations produce a dispatch request:

- An agent (Archivist, Sentinel, Overseer, etc.) has detected something
  that needs human judgment.
- A workflow step in an execution-layer product needs an approval,
  acknowledgment, or decision from a human who is not currently on that
  product's surface.
- A policy response (per ProjectHUD Vision Anchor) needs to notify,
  escalate, or gate on a human.

### What a dispatch request is

A dispatch request is a **durable record** (Supabase table) and a
**broadcast event** (bus message). Publication writes both in one
transaction.

Table: `dispatch_requests`

```
id                 uuid            primary key
protocol_version   int             = 1
firm_id            uuid            multi-tenant isolation
source_product     text            who published it
source_ref         text            producer's internal id (policy_id, agent run id, workflow step id)
created_at         timestamptz
audience           jsonb           see Audience schema below
urgency            text            critical | high | medium | low
subject            text            one-line human summary
body               text            rich text or markdown, the thing they need to read
reply_schema       jsonb           see Reply schema below
deadline           timestamptz     optional — "respond by"
escalation_path    jsonb           optional — see Escalation schema below
status             text            pending | routed | delivered | acknowledged | responded | expired | cancelled
routed_channel     text            the channel CommandHUD selected (teams | sms | email | advisorhud | projecthud | ...)
routed_at          timestamptz
responded_at       timestamptz
response           jsonb           the answer, per reply_schema
```

### Event counterparts

A dispatch request publishes these events on the bus during its lifetime:

- `dispatch.requested` — published by the producer. Contains the full
  request payload.
- `dispatch.routed` — published by CommandHUD after it selects a channel.
  Contains the chosen channel and the delivery attempt id.
- `dispatch.delivered` — published by CommandHUD after the channel
  confirms delivery (Teams card rendered, SMS sent, email landed).
- `dispatch.responded` — published by CommandHUD after a human responds
  through any channel. Contains the response payload.
- `dispatch.expired` — published by CommandHUD if deadline lapses with
  no response, after the escalation path is exhausted.
- `dispatch.cancelled` — published by any party that wants to retract.

Producers subscribe to `dispatch.responded` and `dispatch.expired` on the
specific `id` of requests they published, and act accordingly. The
producer does not care which channel the human used; the response
arrives through the same protocol regardless.

### Audience schema

```json
{
  "kind": "individual" | "role" | "any_of" | "all_of",
  "ids": ["resource-uuid", ...],         // individual
  "role": "pm" | "cfo" | "compliance",   // role
  "members": [ <audience>, <audience> ]  // any_of / all_of
}
```

`individual` targets specific people. `role` defers identity resolution
to CommandHUD (it has the org chart). `any_of` routes to whoever
responds first; `all_of` requires every addressee to respond before
resolving. Start with `individual` and `role`; `any_of`/`all_of` land in
a later phase.

### Reply schema

The producer declares what a valid response looks like. CommandHUD uses
this to render the right UI on whichever channel it chose.

```json
{
  "kind": "ack" | "yes_no" | "choice" | "free_text" | "structured",
  "choices": ["approve", "reject", "request_changes"],       // choice
  "fields": [{ "name": "reason", "type": "text", ... }]      // structured
}
```

`ack` means "just confirm you saw this" — single-button card. `yes_no`
is the most common approval case. `choice` presents N options. `free_text`
and `structured` are for cases where the response needs prose or
multiple fields.

### Escalation schema

```json
{
  "steps": [
    { "after_seconds": 900, "channel_override": "sms" },
    { "after_seconds": 2700, "audience_override": { "kind": "role", "role": "manager_of:$original" } }
  ]
}
```

CommandHUD runs these timers. Each step can escalate the channel, the
audience, or both. Producers rarely specify the full path — they trust
CommandHUD's default escalation policy for the declared urgency tier.

### Urgency tiers — authoritative mapping

The urgency value on a dispatch request has precise semantics, because
it determines CommandHUD's routing behavior and the human-side UX tier.
**These tiers are shared across products**, so a `high` from AdvisorHUD
and a `high` from ProjectHUD mean the same thing to CommandHUD.

| Tier | Meaning | Default CommandHUD behavior |
|------|---------|------------------------------|
| `critical` | Safety, regulatory deadline, financial integrity at risk | Deliver to all channels simultaneously. Escalate every 5 min until acknowledged. |
| `high` | Time-sensitive decision; workflow is blocked | Deliver to primary channel. Escalate to secondary in 30 min. |
| `medium` | Action needed but not blocking | Deliver to primary channel during working hours. |
| `low` | Informational, batchable | Queue for daily digest. |

Producers pick the tier; CommandHUD picks the delivery. If a producer
needs behavior outside these defaults, it specifies `escalation_path`
and/or declares a `deadline`.

### Alignment with ProjectHUD policy severity tiers

ProjectHUD policies have three severity tiers: **advisory**, **hard gate**,
**lockout**. These map to dispatch urgency as follows:

- `advisory` → dispatch urgency `low` or `medium` depending on context
- `hard gate` → dispatch urgency `high`; the workflow pauses pending
  response
- `lockout` → dispatch urgency `critical`; the workflow is refused and a
  blocking instance is created

This mapping is the **translation layer** between ProjectHUD's internal
severity model and the ecosystem's dispatch model. StaffingHUD and
AdvisorHUD will have their own internal severity models (likely
similar), which translate the same way. The mapping is defined in each
product's Vision Anchor, not here — this document only guarantees that
the four urgency tiers themselves have consistent meaning across
products.

---

## Contract 3 — Identity resolution

A human being appears in multiple products. Bryan is a user in AdvisorHUD,
a resource in ProjectHUD, a recipient to CommandHUD, and an email address
in Outlook. The ecosystem must consistently identify him across all of
those surfaces without requiring a rebuild of the user model.

### The canonical identifier

**`resource_id`** (UUID) is the canonical identifier for a human across
all products. It is assigned once per firm and never reassigned.

Every product maintains a local `resources` table that includes
`resource_id` as an immutable key. Local tables may add product-specific
fields (AdvisorHUD adds `advisor_credentials`; StaffingHUD adds
`recruiter_region`) but the identifier is shared.

### Secondary identifiers

These resolve to `resource_id` through `resources`:

- `user_id` (auth UUID — per product, may differ across products)
- `email`
- `teams_id`
- `sms_phone`
- `alias` (the short code like `VS`, `AK` used in Aegis scripts)

Any product can resolve any secondary identifier to a `resource_id` by
querying `resources`. When a dispatch request targets a human, the
`audience.ids` field contains `resource_id` values, never emails or
auth UUIDs.

### CommandHUD's role in identity

CommandHUD owns the **channel profile** per `resource_id`:

```
channel_profiles
  resource_id           uuid
  primary_channel       text
  secondary_channel     text
  working_hours_start   time
  working_hours_end     time
  timezone              text
  preferences           jsonb    channel-specific preferences
```

When a dispatch request targets `resource_id = xyz`, CommandHUD joins
against `channel_profiles` to pick the channel. If no profile exists,
CommandHUD falls back to Teams by default and logs an "unprofiled
recipient" event so an admin can complete the profile.

Execution-layer products do not maintain channel profiles. They do not
need to know whether Bryan is currently in a meeting; that's CommandHUD's
job.

---

## Contract 4 — Chain of Custody

Every product writes audit events to a shared CoC store. One table, one
schema, one query surface. This is what makes "show me everything that
touched instance X across the ecosystem" a single query rather than a
federation problem.

Table: `coc_events`

```
id                 uuid
protocol_version   int             = 1
firm_id            uuid
ts                 timestamptz
source_product     text
actor              text            resource_id | 'system' | 'agent:name' | 'policy:id'
event_type         text            same namespacing as bus events
subject_type       text            instance | dispatch | form | policy | resource | ...
subject_id         uuid
summary            text            one-line human-readable
before_state       jsonb           optional — for reversible mutations
after_state        jsonb           optional
evidence           jsonb           optional — signatures, screenshots, transcripts
```

### When to write a CoC event

Every product writes CoC events for at least these cases:

- A workflow instance transitions between states.
- A human approves, rejects, or overrides anything.
- A policy fires (any severity).
- A dispatch request resolves (ack, response, or expiry).
- An agent takes an auto-executed action.

The ProjectHUD Vision Anchor commits to "CoC on every firing, without
exception" for policies. That commitment generalizes: every product
writes CoC for every operationally material event. "Material" means
anything an auditor or an incident investigation might ask about.

### What CoC is not for

CoC is not a logging framework. Application logs, console output, error
traces — those live elsewhere. CoC is the **decision record**: what
happened, who or what caused it, and what the state was before and
after. Noise diminishes its value.

---

## Versioning and evolution

This document is versioned. Changes come in three flavors:

- **Patch** (v0.1 → v0.1.1) — clarifications, typo fixes, examples
  added. Safe to adopt without coordination.
- **Minor** (v0.1 → v0.2) — new event types, new optional fields, new
  urgency meanings clarified. Consumers may adopt on their own schedule;
  old code keeps working.
- **Major** (v0.x → v1.0, v1 → v2) — breaking changes to envelope shape
  or required fields. Requires coordinated rollout across all products.
  `protocol_version` field bumps.

Minor and major revisions update the "Decision log" at the bottom of
this document. Every build track (ProjectHUD, AdvisorHUD, StaffingHUD,
CommandHUD) has one person empowered to propose revisions; revisions
are adopted when all four tracks sign off.

Until v1.0, the protocol is **draft status**. v1.0 is declared when all
four products have implemented at least one end-to-end flow (agent →
CommandHUD → HUD → response → CoC) successfully.

---

## Open questions for v0.2

These are known gaps that the current draft deliberately does not
resolve. Each will be addressed in a future revision.

1. **Multi-firm isolation.** How a single CommandHUD instance serves
   multiple firms with no cross-firm leakage. Likely: partition by
   `firm_id` at every table + row-level security in Supabase.
2. **Agent identity.** Agents don't have `resource_id` values today.
   Proposal: reserve a namespace (`agent:{name}:{firm_id}`) that acts
   as a pseudo-`resource_id` for audit purposes without appearing in
   channel profiles.
3. **Response latency SLOs per urgency tier.** CommandHUD's default
   escalation policies are defined above, but measurable SLOs ("95% of
   `high` dispatches acknowledged within 30 min") belong here once
   there's real production data.
4. **Channel cost signals.** SMS costs money per message; email
   doesn't. Should the dispatch request influence routing based on
   cost? Probably yes for `low` urgency; probably no for `critical`.
   Deferred until a pattern emerges.
5. **Response re-routing.** If Bryan starts a response on Teams and
   abandons it, does the same dispatch re-attempt on SMS? Initial
   position: no, one delivery per escalation step; but worth revisiting.

---

## Appendix A — Event types specified as of v0.1

Inherited from ProjectHUD Brief B1 (event bus wiring):

- `location.ready` — a UI view has finished loading
- `form.submitted` — a form submission has landed in storage
- `workflow_request.created` — a new task has been routed to an assignee
- `workflow_request.resolved` — an assignee has made a decision
- `instance.launched` — a workflow instance has started
- `instance.completed` — a workflow instance has finished
- `instance.blocked` — a workflow instance cannot advance

Introduced in this document:

- `dispatch.requested`
- `dispatch.routed`
- `dispatch.delivered`
- `dispatch.responded`
- `dispatch.expired`
- `dispatch.cancelled`
- `policy.fired`
- `coc.written`

Reserved for later specification:

- `agent.detected_commitment`
- `agent.detected_deadline`
- `agent.detected_action_item`
- `agent.summary_generated`
- Product-specific namespaces as each product's Vision Anchor declares
  them

Each event's payload schema is specified in the relevant product's brief
(for execution-layer events) or in CommandHUD's Vision Anchor (for
routing events). When an event type's payload is specified anywhere, it
becomes authoritative ecosystem-wide.

---

## Decision log

- *2026-04-18 · v0.1 · initial draft.* Seven execution-layer events
  inherited from ProjectHUD Brief B1. Six dispatch lifecycle events
  introduced. Four urgency tiers mapped against ProjectHUD policy
  severity. Identity resolution centered on `resource_id`. CoC table
  shape defined.

---

*Revisions append to the decision log. Do not edit prior sections
without bumping the version.*