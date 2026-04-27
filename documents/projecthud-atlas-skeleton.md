# ProjectHUD Atlas

**Purpose:** System-level "what exists" overview of the entire
ProjectHUD platform. Reading this document gives an architect
the *shape* of the platform — what each domain does, where the
boundaries are, what the cross-cutting contracts are.

**Status:** SKELETON. Sections are defined but mostly empty.
Each section gets filled in by future sessions as they read the
relevant code and confirm understanding with the operator.

**Maintained by:** Architect (incremental, multi-session
build). Operator reviews for accuracy.

**Last revised:** 2026-04-23

---

## How to read this document

If you're a new architect or fresh session, read this AFTER
the Architect Onboarding Protocol but BEFORE diving into any
specific brief. The Atlas gives you the platform's overall
shape; the brief gives you the specific surface you're working
on.

If you're filling in a section, do so based on:
1. Direct code reading (with operator-uploaded files)
2. Operator confirmation of understanding
3. Cross-reference with existing handoff documentation

Don't fill in sections speculatively. Mark unknowns as `[TBD]`
rather than guessing.

---

## Part 1: The platform overview

### 1.1 What ProjectHUD is

[TBD — operator-authored framing. The "elevator pitch" version of
the platform.]

### 1.2 The four domains

ProjectHUD is composed of four distinct platforms that share a
Supabase backend:

- **Project Management Core** — [TBD: scope, primary surfaces,
  data model summary]
- **Compass** — [TBD: who uses it, what they do here]
- **Cadence** — [TBD: who uses it, what they do here]
- **Aegis** — [TBD: who uses it, what they do here]

### 1.3 Domain ownership

What each platform OWNS (its source of truth concerns) and what
it CONSUMES from other platforms.

[TBD per platform — table format showing owns vs consumes.]

### 1.4 Domain boundaries

What each platform MUST NOT DO (the forbidden cross-coupling).

[TBD — explicit list of architectural rules.]

---

## Part 2: Compass deep-dive

### 2.1 Purpose and scope

[TBD]

### 2.2 File structure

See `projecthud-file-inventory.md` "Compass platform" section
for canonical inventory. Quick summary here:

[TBD — narrative description of what each file owns]

### 2.3 Primary user flows

[TBD per flow:
- Submitter issues an Expense Report
- Approver approves a request
- Approver requests changes
- Submitter withdraws an active request
- Submitter recalls a completed request
- Submitter resumes a draft
- Operator browses BROWSE tab
- Admin investigates a blocked workflow]

### 2.4 Cross-platform integration points

[TBD:
- Where Compass calls into Cadence's form definitions
- Where Compass emits to Aegis's event bus
- Where Compass writes to shared DB tables]

### 2.5 Known architectural debt

[TBD — silent .catch sites, lazy-fetch deferred items, etc.]

---

## Part 3: Cadence deep-dive

### 3.1 Purpose and scope

[TBD]

### 3.2 File structure

See `projecthud-file-inventory.md` "Cadence platform" section.

[TBD — narrative description]

### 3.3 Primary user flows

[TBD per flow:
- Form Library editor: create new form template
- Form Library editor: edit existing form
- Simulator: define routing paths
- Simulator: run coverage tests
- Routing Proof Certificate: generate certification
- Instance lifecycle: monitor running workflow]

### 3.4 Cross-platform integration points

[TBD:
- Cadence writes to workflow_form_definitions consumed by Compass
- Cadence subscribes to Realtime for live CoC updates
- Cadence simulator may emit to Aegis bus]

### 3.5 Known architectural debt

[TBD]

---

## Part 4: Aegis deep-dive

### 4.1 Purpose and scope

[TBD — operator's vision anchor likely covers this.]

### 4.2 File structure

[TBD — primarily cmd-center.js + integration in mw-* and cdn-*
files. Document the integration surfaces.]

### 4.3 Primary surfaces

[TBD:
- Command registry (typed commands)
- Event bus (_cmdEmit, recv log)
- Retention buffer
- Session prefix routing
- Presence sync
- CommandHUD UI]

### 4.4 Cross-platform integration

[TBD:
- How Aegis discovers Compass and Cadence sessions
- How session prefixes route commands
- How emits propagate via Realtime broadcast]

### 4.5 Known architectural debt

[TBD — Aegis 401 Realtime broadcast issue, etc.]

---

## Part 5: Project Management Core

### 5.1 Purpose and scope

[TBD]

### 5.2 Key data model

[TBD per table:
- workflow_instances
- workflow_requests
- workflow_action_items
- workflow_form_definitions
- workflow_templates
- workflow_template_steps
- workflow_step_instances
- coc_events
- form_drafts
- resources
- users
- projects
- tasks]

For each: purpose, key fields, lifecycle states, FKs, RLS posture.

### 5.3 RLS architecture

[TBD — how RLS gates visibility per actor role. Specifically:
- Who can SELECT workflow_instances under what conditions
- How approver visibility shifts as their workflow_requests row
  resolves
- Admin override semantics
- Cross-firm isolation]

### 5.4 Storage and assets

[TBD — form-assets bucket structure, signed URL flow, CORS
configuration.]

### 5.5 Realtime subscriptions

[TBD — what tables have Realtime enabled, what subscribers
listen.]

---

## Part 6: Cross-cutting contracts

### 6.1 The event bus

[TBD — full inventory of emits across the platform:
- Per-emit name, payload shape, fire-after semantics, Rule 35
  posture
- Subscriber map: who listens to each emit and what they do]

### 6.2 The command registry

[TBD — full inventory of typed commands:
- Per-command name, args, behavior, dispatcher locality
- Wait commands and what they consume]

### 6.3 The postMessage protocol

[TBD — Compass ↔ form iframe communication:
- compass_form_ready
- compass_form_save_draft
- compass_form_submit
- compass_form_error
- cmd:form_action
- Origin validation rules]

### 6.4 The CMD version chain

[TBD — how versioning works across files:
- Per-file VERSION header convention
- Loader-tag cache-bust requirement
- Reconciliation discipline (Rule 28)]

### 6.5 The session prefix routing

[TBD — VS:, AK:, RW:, FA: prefixes:
- How dispatcher routes commands by prefix
- How Wait commands are local per Rule 26
- Self-echo exemption per Rule 15]

---

## Part 7: Operational concerns

### 7.1 Cache busting and deployment

[TBD — how loader-tag cache busts propagate to user browsers,
why CMD reconciliation matters, hard-reload protocol.]

### 7.2 Test infrastructure

[TBD — dual_session_test setup, probe scripts, Cadence simulator
integration.]

### 7.3 Debugging conventions

[TBD — DIAG instrumentation, console banner format, runtime
evidence discipline (Rule 32).]

### 7.4 Observability and audit

[TBD — coc_events trail, admin notification pathway, future
Phase 2 observability infrastructure.]

---

## Part 8: Architectural patterns and rules

### 8.1 Iron Rules summary

The 35 Iron Rules with one-line summaries. Full derivations
live in the master handoff.

[TBD — copy from master handoff, condensed.]

### 8.2 Pattern library

[TBD — recurring patterns across the platform:
- The discovery → implementation → version bump → verification
  brief shape
- The reactive subscriber + render pattern
- The optimistic-UI + rollback pattern
- The CoC event + admin notify pattern
- The compass_form_ready handshake pattern (post-B-UI-10)]

### 8.3 Anti-patterns observed

[TBD:
- Silent .catch on emit-adjacent writes
- Optimistic emit before write confirmation
- Schema drift between code and DB constraints
- Cache-population filters that exclude needed rows
- DOM-anchor races on compound matches]

---

## Part 9: Roadmap context

### 9.1 Phase 1 — what shipped

[TBD — high-level summary of Phase 1 by brief category. Detailed
brief history lives in master handoff.]

### 9.2 Phase 2 — what's planned

[TBD — B6 predicate engine + accumulated Phase 2 backlog.]

### 9.3 Phases 3+ — known intent

[TBD if known. Operator may have rough roadmap intent worth
capturing.]

---

## Appendices

### A. File inventory

See `projecthud-file-inventory.md`.

### B. Glossary

See `projecthud-glossary.md` (TO BE WRITTEN).

### C. Iron Rules ratifications

See per-rule ratification documents and master handoff
ratification sections.

### D. Vision anchors

See `aegis-vision-anchor-v1.1.md`,
`hud-ecosystem-protocol-v0.1.md`, and forthcoming
`compass-vision-anchor.md`, `cadence-vision-anchor.md`.

---

## Build progress tracker

This document is built incrementally over multiple sessions.
Track progress here so successive sessions know what's been
completed.

| Section | Status | Last updated by | Notes |
|---------|--------|-----------------|-------|
| Part 1.1-1.4 | TBD | — | Operator framing needed |
| Part 2 (Compass) | TBD | — | Architect can draft from existing knowledge of mw-* files |
| Part 3 (Cadence) | TBD | — | Needs cdn-* file uploads first |
| Part 4 (Aegis) | TBD | — | Architect can draft from cmd-center.js knowledge |
| Part 5 (PM Core) | TBD | — | Needs Supabase schema dump |
| Part 6 (Contracts) | TBD | — | Architect can draft incrementally |
| Part 7 (Operational) | TBD | — | Pull from master handoff |
| Part 8 (Patterns) | TBD | — | Architect synthesis pass |
| Part 9 (Roadmap) | TBD | — | Operator-authored |

---

*End of Atlas Skeleton. This is a multi-session build. Update
the build progress tracker as sections are filled in. No
single session needs to fill everything; each session that
contributes leaves the document better than it found it.*
