# PROJECTHUD_STATE.md
> Comprehensive state document for strategic advisor onboarding.  
> Authored: 2026-05-19 · Operator: Vaughn Staples · Source: Project knowledge corpus (all ratified docs)

---

## 1. Product Identity

### Current Name(s) and Naming Situation

The platform is called **ProjectHUD**. Within it, four named modules exist:
- **Accord** — the meeting and deliberation capture surface (the furthest-built module)
- **Compass** — the daily operator work surface (individual work and time tracking; partially built)
- **Aegis** — the command-line policy engine and multi-session automation surface (substantially built)
- **Cadence** — the workflow template authoring and certification environment (built but has known gaps)
- **Pipeline** — a sales/deal-management surface (built; layout refactored CMD101.5)

There is no formal naming debate documented in the corpus. "ProjectHUD" is the brand wordmark (Rajdhani font, weight 700, in the unified header). Sub-brands (Compass, Cadence, Aegis, Accord) use Inter. The word "CadenceHUD" appears in Vaughn's framing of this request — it is not a formal product name in any ratified document; "Cadence" is the module name within ProjectHUD.

The HUD ecosystem includes four products: ProjectHUD, AdvisorHUD (financial advisory; described as "in alpha"), StaffingHUD (recruiting), and CommandHUD (routing intelligence). All four share a common protocol (`HUD Ecosystem Protocol v0.1`).

### One-Sentence Positioning

> ProjectHUD is the operating system for institutional commitment — the substrate on which a firm captures, structures, anchors, and reasons about every commitment it makes.

### Elevator Pitch (3–4 sentences)

ProjectHUD is not a meeting tool, a project management tool, a quality management system, or a collaboration platform. Every decision, task, risk, and deliverable a firm makes is captured as a typed node in a firm-scoped graph, with cryptographically anchored causal edges connecting commitments to each other. That graph supports operations no existing product category supports: counterfactual reasoning ("what would have happened if we decided differently?"), CPM and PERT-based schedule computation, resource heatmaps, and personalized morning briefings per role. The architectural commitment to a typed-edge graph as the primitive — made in week one — is the moat; competitors cannot bolt this onto an existing product.

**Alt pitch (BPM framing, from Aegis Vision Anchor):**  
ProjectHUD is the only BPM platform where the test runner, the audit trail, the live operations view, and the policy engine are the same engine. Every competitor has a workflow product with bolt-on testing (Selenium), audit (ServiceNow), dashboards (Tableau), and rules (Drools). In ProjectHUD there is one event bus, one session model, one artifact format, one DSL.

### Category

**Competing in:** BPM (business process management), meeting intelligence, QMS (quality management systems), project management, workflow automation.

**Category we're trying to create:** "Institutional commitment operating system" — a category that does not currently exist. The claim is that meeting records, project plans, risk registers, and decision archaeology are all fragmented artifacts of the same underlying thing (a firm's commitments), and that no one has ever built the substrate that unifies them.

### ICP — Ideal Customer Profile (specific)

**Primary:**
- **Industry:** Regulated industries, specifically medical device (FDA 510(k), ISO 13485, 21 CFR Part 11) — operator has 10+ years medical device background
- **Firm size:** Mid-market firms, 50–500 employees; large enough to have a QMS burden, small enough that the PM is also the operator
- **Buyer role:** VP of Engineering, Head of Product, Regulatory Affairs Director, COO
- **User role:** Project managers, regulatory affairs leads, engineering team leads, decision-makers who run meetings
- **Pain:** $2.4M average 510(k) delay cost from inadequate design-history documentation; decision archaeology takes weeks; no auditable alternative-analysis record

**Secondary:**
- Any firm running complex multi-stakeholder projects where decision provenance matters: legal, financial advisory, architecture/engineering, defense contracting

**Named pitch lines by audience:**
- Managing Director: "The operating system for institutional commitment"
- Investor: "We store how the team arrived at the decision — including what they rejected and why"
- Regulated-industry buyer: "FDA reviewer asks 'document the alternatives' — the answer is computed from substrate captured at deliberation, sealed cryptographically, ready in two minutes"
- Engineering team lead: "Your team's work currently lives in three disconnected systems. ProjectHUD makes them one graph"
- Architect of competing product: "You cannot bolt this onto an existing meeting tool. The substrate has to be designed as a typed-edge graph from the data shape up"

### Named Target Customers

None named explicitly in the corpus. No design partner conversations documented in project knowledge. The operator (Vaughn Staples) is himself the primary test user — operator-as-designer is real, not aspirational.

---

## 2. The Core Insight

### What problem does this solve that nothing else solves?

The **universal failure mode of institutional memory**: meeting records, project plans, risk registers, and decision rationale exist as disconnected artifacts. The meeting record does not know what tasks the decisions produced. The project plan does not know which decisions justified which tasks. The risk register does not know which decisions raised which risks. When an auditor asks why a design choice was made, the firm reconstructs the answer by interviewing people — often years after the deliberation. Nobody thinks of this as a failure because it is universal.

No existing tool spans deliberation and execution as one graph. Project management tools (Asana, Linear, Monday, Smartsheet, MS Project) compute CPM but lack deliberation substrate — tasks arrive as edicts with no traceable rationale. Decision-record tools (Notion, Confluence, Coda) capture decisions as documents but don't connect them to execution. QMS tools (MasterControl, Veeva, ETQ) are document-management systems with workflow on top — no CPM, no counterfactual. Meeting tools (Otter, Granola, Fellow) capture transcripts but model nothing structurally.

**The thing that doesn't exist anywhere:** one graph spanning deliberation and execution, with CPM as the schedule operator, counterfactual as the alternative-state operator, projection as the rendering operator, and Merkle anchoring as the integrity guarantee.

### The "Chain of Custody" Principle

Every commitment is cryptographically anchored. At meeting-end seal, a Merkle root is computed across all sealed artifacts (nodes, edges, belief adjustments). This Merkle root is written to `coc_events` and stored on the meeting record. Post-commit, `node_id`, `created_at`, `created_by`, `tag`, and `summary` are immutable — any attempted mutation is rejected at the data layer. Tampering is detectable: recompute the Merkle root against the original meeting's recorded root; mismatch = audit signal.

CoC events are written on every workflow transition, test run, and policy firing. They share the `coc_events` table across all modules. There is no delete. There is no "hide forever." There is no rewrite history. Change is expressed only through supersession (new artifact declares `supersedes` edge to old), archive (hidden from active views but preserved intact), or retraction (edge retracts a prior edge).

This is not an optional feature. Iron Rule 42 codifies it: **"Sealed artifacts are immutable. The commit moment is irreversible."** Hard-gate policy overrides are first-class CoC evidence — the user clicked OK, their authorization timestamp and justification text are permanent record. This is the difference between a suggestion and a control, and it is what auditors ask for.

### The "Rescue Center, Not Scheduling Tool" Framing

Not formally documented by that phrase in the corpus, but the spirit is embedded throughout. The Compass Meetings landing page concept (built 2026-05-19) captures it operationally: "What do I need to join now? What do I do next? What's left? What should concern me?" The surface is a daily rescue center — it tells you what is on fire, what is about to be, and where you have leverage. The morning brief concept (for IC, VP, CFO, MD roles) is the same: not a calendar, not a task list — a ranked, contextualized, provenance-annotated briefing.

### Other Foundational Philosophical Principles

**1. Typed causal edges as primitive (Iron Rule 44).** Decisions are not text records — they are graph nodes with typed causal edges to everything they depend on and everything that depends on them. This was codified in week one of the build and turned out to be load-bearing for everything downstream: counterfactual, CPM, PERT, personalized projection. You cannot retrofit this onto a flat task graph.

**2. Declared belief vs. measured confidence (Iron Rule 45).** The system captures what a human declares they believe — not an algorithmic confidence score. "Holsten declared high confidence based on seven-scenario stress test." That declared belief becomes a formal probabilistic input to PERT forecasting. The distinction matters: measured confidence is a surrogate; declared belief is an attestation with a human name attached to it.

**3. Substrate immutability (Iron Rule 42).** The platform never deletes, never rewrites, never hides permanently. Supersession, archive, and retraction are the only change mechanisms. This is what makes counterfactual analysis trustworthy — alternatives are computed in parallel projections; the actual substrate is never modified.

**4. Codebase as spec (Iron Rule 64).** Survey existing patterns before introducing new mechanisms. When a module adapts a pattern from another module, it reuses vocabulary, structure, and behavior — but does NOT reuse visual identity. Each module owns its palette (Style Doctrine §3.8).

**5. Privacy-by-surface (Iron Rule 68).** What is visible on a shared screen in a meeting is not the same as what is visible in a prep view. Intelligence Mode (operator private notes, per-attendee pattern analysis, political hot-buttons) is never shown on a shared screen. The Running Meeting surface is public by default; Setup and Intelligence surfaces are private by default.

**6. Substrate-derived intelligence before AI (Iron Rule 70).** v1 intelligence is fully substrate-derived — no AI required. Pattern tags, urgency math, owed-lines derivation are computed from `accord_nras`, `accord_nodes`, `accord_belief_adjustments`, and dissent history. AI synthesis (when commissioned) upgrades the derivation layer without changing the panel structure.

---

## 3. Architecture Overview

### Tech Stack

- **Frontend:** Vanilla JS (no framework), HTML/CSS. Multi-page app; each surface is its own HTML file (`compass.html`, `cadence.html`, `pipeline.html`, `accord-*.html`, `dashboard.html`, `proposal-detail.html`, `project-detail.html`). CSS in `/css/hud.css` (shared doctrine-driven stylesheet). JS split across shared loaders (`hud-shell.js`, `sidebar.js`) and module-specific files (`accord-core.js`, `accord-capture.js`, `accord-views.js`, `accord-ledger.js`, `accord-minutes.js`, `accord-document.js`, `mw-*.js` for Compass, etc.).
- **Backend:** Supabase (PostgreSQL + PostgREST + Realtime + Edge Functions + Auth). Multi-tenant via `firm_id` on every table + `my_firm_id()` RLS function. Auth via Supabase Auth (JWT-based; `auth.uid()` in RLS).
- **Database:** PostgreSQL (Supabase-managed). Migrations are SQL files. Extensions: pgcrypto (in `extensions` schema — IR48 requires qualified calls `extensions.digest()`), pg_net, possibly others.
- **Hosting:** Not explicitly documented in corpus. Likely Vercel or similar static hosting given the flat-file structure. Supabase handles backend hosting.
- **Auth:** Supabase Auth. JWT claims resolve `my_firm_id()` and `auth.uid()`. JWT-dependent code paths cannot be verified via SQL editor (IR50 — must use authenticated HTTP).
- **Email:** Not documented in corpus. CommandHUD owns channel delivery including email; ProjectHUD publishes dispatch requests and does not send email directly (per IR commitments in Aegis Vision Anchor v1.1).
- **AI:** Anthropic Claude (via API) — used in Aegis command surface for script authoring and the Compass intelligence layer (when commissioned). All build sessions ARE Claude sessions (the operator builds with Claude as the architect/coding agent). No AI in the production runtime yet — all v1 intelligence is substrate-derived.

### Repo Structure (inferred from corpus references)

```
/
├── css/
│   └── hud.css                  (shared doctrine CSS, all tokens, all shared classes)
├── js/
│   ├── version.js               (build version + RENDER_VERSION constant — IR65)
│   ├── hud-shell.js             (unified header, sidebar, IIFE-wrapped global shell)
│   ├── sidebar.js               (nav sidebar — separate from hud-shell in some surfaces)
│   ├── ui.js                    (UI.gauge and other shared components)
│   ├── api.js                   (API client — .get(), .post(), .rpc(), etc.)
│   ├── coc.js                   (Chain of Custody writer — CoC.write())
│   ├── accord-core.js           (Accord module bootstrap and shared state)
│   ├── accord-capture.js        (Live Capture surface — node creation)
│   ├── accord-views.js          (Accord multi-view routing)
│   ├── accord-ledger.js         (Decision Ledger surface)
│   ├── accord-minutes.js        (Minutes render + Digest surface)
│   ├── accord-document.js       (Living Document surface)
│   ├── accord-transitions.js    (Accord level transitions — never modified by surface CMDs)
│   ├── accord-rails.js          (Rail navigation — known double-setLevel bug)
│   ├── accord-nra.js            (NRA modal + badge + history panel — added CMD-ACCORD-NRA-SURFACE-1)
│   ├── mw-core.js               (Compass core — "My Work" module)
│   ├── mw-tabs.js               (Compass tab management)
│   ├── mw-events.js             (Compass events module — known firm_id leak, unfixed)
│   ├── mw-sequence.js           (Compass recommended sequence panel)
│   ├── cmd-center.js            (Aegis command dispatch center)
│   └── ticker.js                (Event ticker)
├── scripts/                     (additional JS for specific surfaces)
├── supabase/
│   └── functions/               (Edge Functions)
├── compass.html
├── cadence.html
├── pipeline.html
├── dashboard.html
├── proposal-detail.html
├── project-detail.html
├── accord-[surfaces].html
└── my-meetings.html             (earlier Accord entry point / Knowledge Tree reference)
```

### How ProjectHUD and CadenceHUD Relate Architecturally

"CadenceHUD" is not a separate product — **Cadence is a module within ProjectHUD**. Cadence (workflow template authoring + certification), Aegis (policy runtime + command surface), and Compass (daily operator work surface) share the same Supabase backend, the same `hud.css` design system, the same `hud-shell.js` header, and the same `coc_events` audit table. There is no separate app, no separate schema, no separate hosting.

Cadence's role: **Where policies are authored and certified.** A policy without at least one Cadence-run proof doesn't publish to production.  
Aegis's role: **Where policies run, are observed, tuned, and audited.**  
Compass's role: **Where policies are felt** — interstitials, chain mutations, in-product notifications.

The same event bus serves all three. The same DSL (COMMANDS registry) is used by Aegis scripts and policy responses. One artifact format. One session model.

### Multi-Tenant Model

All tables include `firm_id UUID` (FK → `firms.id`). All RLS SELECT policies are scoped to `firm_id = my_firm_id()`. `my_firm_id()` is a Postgres function resolving from `request.jwt.claims` — it returns NULL in the SQL editor (postgres role has no JWT; IR50). INSERT policies additionally gate on `auth.uid()` for ownership checks. The firm is the tenant boundary — no cross-firm data leakage is architecturally possible given correct RLS.

`is_client()` is a second RLS function used on `risk_register` — distinguishes internal staff from client-facing users.

### Shared Infrastructure with AdvisorHUD / StaffingHUD

The four HUD products (ProjectHUD, AdvisorHUD, StaffingHUD, CommandHUD) share:
- **`HUD Ecosystem Protocol v0.1`** — four contracts governing:
  - Contract 1: Event bus format (`app_event` emits — shape is locked as an ecosystem contract; changes require protocol revision)
  - Contract 2: Dispatch request record (how ProjectHUD asks CommandHUD to notify a human)
  - Contract 3: Resource ID (canonical human identifier across the ecosystem, immutable)
  - Contract 4: Chain of Custody event shape (`coc_events` table schema)
- **CommandHUD** subscribes to ProjectHUD's `app_event` emits for routing intelligence
- **`resource_id`** is the cross-product human identifier — aliases (`VS`, `AK`) resolve to `resource_id` before leaving ProjectHUD boundary

Whether AdvisorHUD and StaffingHUD share a Supabase instance with ProjectHUD, or are separate instances connected via the protocol, is not specified in the corpus. The protocol defines the contract; physical infrastructure is not documented here.

---

## 4. Data Model

### Core Accord Tables (confirmed; Accord Schema Inventory v1.0 through C-07)

#### `accord_meetings`
**PK:** `meeting_id UUID`
| Column | Type | Notes |
|---|---|---|
| `meeting_id` | uuid | PK |
| `firm_id` | uuid | FK → firms(id) |
| `project_id` | uuid | FK → projects(id), nullable |
| `title` | text | contenteditable in Setup shell |
| `organizer_id` | uuid | FK → auth.users(id) — NOT resources(id) |
| `scheduled_for` | timestamptz | |
| `duration_minutes` | integer | nullable |
| `state` | text | CHECK: `idle\|running\|closed` |
| `started_at` | timestamptz | |
| `ended_at` | timestamptz | |
| `sealed_at` | timestamptz | |
| `merkle_root` | text | Merkle root at seal time |
| `agenda_locked` | boolean | |
| `workstream_id` | uuid | FK → workstreams, nullable |
| `briefing_text` | text | nullable; organizer-only; immutable once running |
| `stakes` | text | nullable; immutable once running |
| `location` | text | nullable; immutable once running |
| `created_at` | timestamptz | |

**RLS:** SELECT `firm_id = my_firm_id()`; INSERT `firm_id = my_firm_id() AND organizer_id = auth.uid()`; UPDATE `firm_id = my_firm_id()` (field gates via trigger); DELETE `firm_id = my_firm_id() AND organizer_id = auth.uid() AND sealed_at IS NULL`

**Trigger:** `accord_meetings_field_gate_trg` (BEFORE UPDATE) — gates `briefing_text`, `stakes`, `location` immutable once `state <> 'idle'`; organizer-only for `briefing_text` and `stakes`.

---

#### `accord_nodes`
**PK:** `node_id UUID` (not `id` — this is the most common FK trap; IR47)
| Column | Type | Notes |
|---|---|---|
| `node_id` | uuid | PK |
| `firm_id` | uuid | FK → firms |
| `thread_id` | uuid | |
| `meeting_id` | uuid | FK → accord_meetings |
| `agenda_item_id` | uuid | FK → accord_agenda_items, nullable |
| `tag` | text | `note\|decision\|action\|risk\|question\|dissent` |
| `summary` | text | |
| `body` | text | |
| `attachments` | jsonb | |
| `created_at` | timestamptz | |
| `created_by` | uuid | FK → auth.users(id) — NOT resources(id) |
| `sealed_at` | timestamptz | |
| `status` | text | |
| `declared_belief_at_commit` | integer | |
| `declared_need` | text | |
| `success_criteria` | text | |
| `validation_due` | date | |
| `declared_addresses_need` | integer | |
| `compass_action_ref` | text | |
| `prev_node_hash` | text | hash chain for tamper detection |
| `node_hash` | text | |
| `seq_class` | character | e.g. D (decision), A (action) |
| `seq_number` | integer | |
| `seq_id` | text | e.g. DC-014, AX-091 — human-readable stable reference |
| `dissented_by` | uuid | FK → auth.users(id); populated on dissent nodes |
| `dissent_rationale` | text | |
| `dissent_predicted_outcome` | text | |
| `dissent_recorded_at` | timestamptz | |
| `effective_date` | date | |
| `due_date` | date | populated on action nodes |

**Tag canonical display order:** Note (N) · Decision (D) · Action (A) · Risk (R) · Question (Q) · Dissent (Di)

---

#### `accord_edges`
**PK:** `edge_id UUID`
| Column | Notes |
|---|---|
| `edge_id` uuid | PK |
| `firm_id` uuid | |
| `from_node_id` uuid | FK → accord_nodes |
| `to_node_id` uuid | FK → accord_nodes, nullable |
| `to_external_ref` text | for external cross-references |
| `edge_type` text | `precedence`, `supports`, `contradicts`, `supersedes`, `retracts`, etc. |
| `rationale` text | |
| `declared_at` timestamptz | |
| `declared_by` uuid | FK → auth.users(id) |
| `sealed_at` timestamptz | |
| `edge_hash` text | |

---

#### `accord_agenda_items`
**PK:** `agenda_item_id UUID`
| Column | Notes |
|---|---|
| `agenda_item_id` uuid | PK |
| `firm_id` uuid | |
| `meeting_id` uuid | FK → accord_meetings |
| `position` integer | sort order for drag-to-reorder |
| `title` text | |
| `status` text | CHECK: `pending\|discussed\|skipped` |
| `sealed_at` timestamptz | |
| `created_at` timestamptz | |
| `pulled_from_node_id` uuid | FK → accord_nodes, nullable — carried items |
| `pulled_from_tag` text | nullable |
| `item_type` text | nullable, CHECK: `DECIDE\|ASSIGN\|INFORM\|RISK\|QUESTION` |
| `duration_minutes_estimate` integer | nullable; feeds budget bar in Setup shell |

---

#### `accord_nras`
**PK:** `nra_id UUID`

State machine: `declared → resolved | superseded | deferred`; `deferred → declared`; `waived` (terminal for UPDATE; not insert-blocking).

Five disjoint UPDATE RLS policies per IR73 (one per legal transition). `accord_nras_current` view returns the current NRA for each node. NRAs are "needs requiring attention" — substrates for tracking open questions, risks, commitments that attach to individual nodes.

---

#### `accord_meeting_outcomes`
**PK:** `outcome_id UUID`
| Column | Notes |
|---|---|
| `outcome_id` uuid | PK |
| `firm_id` uuid | |
| `meeting_id` uuid | FK → accord_meetings ON DELETE CASCADE |
| `verb` text | CHECK: `RESOLVE\|SEAL\|DECIDE\|ASSIGN\|DEFER\|INFORM` |
| `description` text | |
| `owner_resource_id` uuid | FK → resources(id), nullable |
| `condition` text | nullable; for DEFER type |
| `status` text | CHECK: `open\|achieved\|partial\|carried\|abandoned`; DEFAULT 'open' |
| `position` integer | |
| `resolved_at` timestamptz | |
| `created_at` timestamptz | |
| `created_by` uuid | FK → users(id), nullable |

**Trigger:** `accord_meeting_outcomes_state_gate_trg` — rejects if parent meeting `state <> 'idle'`. Disjoint UPDATE RLS for status transitions deferred to CMD-ACCORD-OUTCOME-RATIFICATION-1 (X-03).

---

#### `accord_meeting_attendees`
**PK:** `attendee_id UUID`
UNIQUE: `(meeting_id, resource_id)`
| Column | Notes |
|---|---|
| `attendee_id` uuid | PK |
| `firm_id` uuid | |
| `meeting_id` uuid | FK → accord_meetings ON DELETE CASCADE |
| `resource_id` uuid | FK → resources(id) |
| `role_in_meeting` text | CHECK: `organizer\|lead\|participant\|observer`; DEFAULT 'participant' |
| `rsvp_status` text | CHECK: `pending\|accepted\|declined\|tentative`; DEFAULT 'pending' |
| `invited_at` timestamptz | |
| `created_at` timestamptz | |

Organizer is auto-seeded at Setup shell render if absent.

---

#### `accord_belief_adjustments`
**PK:** `adjustment_id UUID`
| Column | Notes |
|---|---|
| `adjustment_id` uuid | PK |
| `firm_id` uuid | |
| `target_node_id` uuid | FK → accord_nodes (decision nodes) |
| `delta` integer | positive = belief strengthened; negative = weakened |
| `rationale` text | |
| `declared_at` timestamptz | |
| `declared_by` uuid | FK → auth.users(id) |
| `linked_evidence_node_id` uuid | nullable |
| `sealed_at` timestamptz | |
| `adjustment_hash` text | |

---

#### `accord_minutes_renders`
| Column | Notes |
|---|---|
| `render_id` uuid | PK |
| `firm_id` uuid | |
| `meeting_id` uuid | FK → accord_meetings |
| `rendered_at` timestamptz | |
| `rendered_by` uuid | |
| `render_version` text | audit-trail pin per IR65 |
| `storage_path` text | |
| `content_hash` text | |
| `merkle_root_at_render` text | |
| `status` text | |
| `failure_reason` text | |
| `byte_size` bigint | |
| `page_count` integer | |
| `template_id` text | |

---

#### `workstreams` (= `accord_workstreams` — naming inconsistency; CMD-ACCORD-NAMING-NORMALIZATION-1 queued)
| Column | Notes |
|---|---|
| `workstream_id` uuid | PK |
| `firm_id` uuid | |
| `name` text | |
| `state` text | `active\|archived` |
| `project_id` uuid | nullable FK → projects(id); added C-07 to enable Risks tab join |
| `created_at` timestamptz | |

---

### Adjacent Tables Referenced by Accord

**`resources`** — `id UUID` (PK), `name TEXT`, `user_id → auth.users(id)`. The canonical human identity for display, ownership, attendee roster. **Critical identity trap:** `accord_nodes.created_by` is `auth.users(id)`; `accord_meeting_attendees.resource_id` is `resources.id`. Join path: `users.id → resources.user_id → resources.id`. Direct comparison always fails silently.

**`risk_register`** — `id UUID`, `weighted_score`, `description` (with `title` fallback), `status` (USER-DEFINED type — valid values not yet confirmed), `project_id → projects(id)`. RLS: `risk_register_internal` — firm-scoped + `NOT is_client()`. Join to workstream: `workstreams.project_id → projects.id ← risk_register.project_id` (requires `workstreams.project_id` to be populated manually).

**`projects`** — referenced by `risk_register.project_id` and `workstreams.project_id`.

**`firms`** — referenced everywhere. `my_firm_id()` resolves current user's firm from JWT claims.

**`coc_events`** — shared audit table across all modules; schema per ecosystem protocol Contract 4. `actor_resource_id` is FK → `resources.id`. Known historical corruption: during the period when `hud-shell.js` populated `window.CURRENT_USER` with `users.id` instead of `resources.id`, some CoC rows may carry `actor_resource_id` values that are actually `users.id`. Backfill scope is CMD-COC-ACTOR-BACKFILL-1. IR58 (amended) defines the correct resolution chain in `CoC.write()`.

**`accord_meeting_intel_notes`** — NOT YET CREATED. Wave 2 migration. Will hold private operator notes for Intelligence Mode.

---

### RLS Functions

| Function | Returns | Usage |
|---|---|---|
| `my_firm_id()` | uuid | All RLS policies — firm-scoping. Resolves from JWT. Returns NULL in SQL editor (IR50). |
| `auth.uid()` | uuid (users.id) | Organizer gates, owner checks |
| `is_client()` | boolean | `risk_register` RLS |

---

### Notable Schema Decisions

1. **No `id` shorthand on Accord tables** — PKs are `meeting_id`, `node_id`, `edge_id`, etc. The most common defect source: agents write `.id` in JavaScript when the actual PK is `<table>_id`. IR47 mandates schema verification before any FK reference.

2. **`organizer_id` and `created_by` are `auth.users(id)`** — not `resources.id`. This is a critical distinction documented as the most common source of defects across CMDs.

3. **`workstreams` naming** — the table is `workstreams` in production queries, not `accord_workstreams`. CMD-ACCORD-NAMING-NORMALIZATION-1 queued to normalize, but it touches FK, RLS, indexes, triggers, and 7 CoC events — IR65 fires; substantial.

4. **Extension schema qualification** — pgcrypto lives in `extensions` schema on Supabase, not `public`. All calls must be `extensions.digest(...)`. IR48.

5. **`accord_nras` state machine via disjoint UPDATE RLS** — no triggers for NRA state transitions; the five disjoint UPDATE RLS policies are the enforcement mechanism (IR73). This is the canonical pattern for all new state-machine substrates.

---

### What's Currently Broken or Needs Migration

- `accord_meeting_intel_notes` table does not exist — Intelligence Mode has no substrate (target: C-08)
- `workstreams.project_id` requires manual population — Risks tab shows empty state until populated
- `risk_register.status` valid values unknown — Risks tab can't filter by status
- Disjoint UPDATE RLS for `accord_meeting_outcomes.status` transitions deferred (X-03)
- `accord-rails.js:331` double `setLevel` causes rail flash on NEXT navigation
- `.nra-waived-*` CSS classes were shipped in NRA Phase 5 without any CSS — functional but unstyled
- `mw-events.js` has a known `firm_id` leak (CMD-A6 finding 2, unfixed)
- `coc_events` historical rows may have `actor_resource_id` containing `users.id` (not `resources.id`) — backfill needed (CMD-COC-ACTOR-BACKFILL-1)

---

## 5. What's Built (Be Specific)

### Accord Module — Most Built

**Five surfaces shipped and functional:**

1. **Live Capture** (`accord-capture.js`) — real-time node capture during running meetings. Tag buttons for Note/Decision/Action/Risk/Question/Dissent. Node hashing. Pre-commit atomic modal pattern. NRA modal wired at capture call site.

2. **Living Document** (`accord-document.js`) — the structured document view of a meeting's nodes. NRA display wired. IIFE-wrapped.

3. **Decision Ledger** (`accord-ledger.js`) — the cross-meeting decision history surface. Node rendering. NRA modal wired. Known: `renderMeetingView()` level-changed navigation defect patched (CMD-ACCORD-LEDGER-NAV-FIX-1).

4. **Digest & Send** / **Minutes** (`accord-minutes.js`) — real PDF output. The render engine is a pure function over substrate state. `RENDER_VERSION` constant for audit trail (IR65). `accord_minutes_renders` table stores rendered artifacts with Merkle root at render time.

5. **Constellation View** (`accord-views.js` + constellation surface) — concentric-ring SVG visualization of workstream nodes. Drill-down views, dissolve transitions, ESC ascend, tree search, drag-drop, lifecycle affordances. Three-pane layout. Legacy-coexistence toggle. 12+ defects patched during CMD-ACCORD-CONSTELLATION-ENTRY-1.

**NRA System** (`accord-nra.js`) — AccordNRA.Modal + Badge (10 variants) + HistoryPanel. `API.rpc()` extension. Three CustomEvents (declared/waived/deferred). State-aware update dispatch (declared→supersede; deferred→direct PATCH; waived→"declare new"). Full 11/11 lifecycle smoke pass.

**Meeting Setup Shell** — design locked as of 2026-05-09 (scaffolding-decisions-cmd-accord-meeting-setup-1.md), brief not yet drafted. This is the next strategic CMD. Five-pane shell: Header, Briefing column (left), Agenda/Notes/Minute-Notes (center), Attendees/Action Items/Attachments (right), Filmstrip (bottom). Footer with verdict pill, budget bar, warning chips. Intelligence Mode toggle (Cmd+I). Gathering mode (15 min before scheduled_for).

**Workstreams substrate** — `workstreams` table with state machine, disjoint UPDATE RLS, two explicit policies.

**NRA Substrate** (`accord_nras` table) — 9 CHECK constraints, 6 indexes, `accord_nras_current` view, 7 RLS policies (5 disjoint UPDATE per IR73), 6 EVENT_META entries, 5 helper functions (SECURITY INVOKER), 2 trigger functions (SECURITY DEFINER). The deferred third trigger (`accord_node_nra_resolve_on_resolution_trg` for `action_resolved` and `decision_resolved` trigger_kinds) is CMD-ACCORD-NODE-RESOLUTION-SUBSTRATE-1 scope.

---

### Pipeline Surface

`pipeline.html` — sales deal management surface. Layout reorganized CMD101.5:
- KPI strip (6 cards) permanently above tabs
- Funnel Velocity + Forecast Summary permanently visible (equal-height row)
- Tabs now: List and Board (renamed from Dashboard/Board)
- List mode: Active Deals + Alerts + Touch Today
- Board mode: full-width kanban

---

### Compass (Partial)

`compass.html` and `mw-*.js` modules. My Work, Recommended Sequence panel, CoC timeline, delta strip ("since last login"), diagnostic timeline. §6.2 doctrine violations on four JS-rendered surfaces were migrated during CMD-A (2026-04-28). Full retrofit sequenced via CMD-Compass-A (queued, lower priority).

Today (2026-05-19), a **Compass Meetings landing page mockup** was built (`compass-meetings.html`) — not wired to production backend, but design is fully specified. Four zones: JOIN NOW (live meeting hero), DO NEXT (next meeting with prep intelligence), OPEN ITEMS (CPM-annotated action list), PRESSURE REPORT (week/month tabs with strategic concerns).

---

### Aegis

Multi-session command surface. Policy engine runtime. COMMANDS registry (shared DSL with Cadence policy responses). Event bus subscriptions. `app_event` broadcasts (7 emits documented in Brief B1). CoC writes on every firing. Three severity tiers (advisory, hard gate, lockout). Eight policy classes documented. `Wait ForEvent` commands. `_storeVars` context. Firm-ID leak in `mw-events.js` is unfixed (CMD-A6 finding 2).

---

### Dashboard, Proposal Detail, Project Detail

All built. Style Doctrine retrofits in progress:
- `dashboard.html` — CMD99 shipped full v1.5 retrofit + gauge fix + footer strip
- `proposal-detail.html` — CMD98.7 KPI strip upgrade; CMD98.8 currency literal fix ($, not ¥)
- `project-detail.html` — pre-doctrine surface; full retrofit queued

---

### Shared Infrastructure

- `hud.css` — unified doctrine CSS. All tokens (`--bg0`–`--bg5`, `--text-*`, `--surface-*`, `--green`, `--amber`, `--red`, etc.), all shared classes (`.section-label`, `.btn`, `.panel-frame`, `.kpi-card`, etc.). v1.8 current.
- `hud-shell.js` — unified header, sidebar injection, IIFE wrapper. Version display (from `js/version.js`).
- `version.js` — `_PROJECTHUD_VERSION` (cache-bust) + `RENDER_VERSION` (minutes render audit). Operator manages bumps manually per IR65. Three bumps on 2026-05-09.
- `coc.js` — `CoC.write()` with defensive resolution chain per IR58 amendment. Throws structured Error on authenticated context if no resources row found.
- `api.js` — `.get()`, `.post()`, `.rpc()` (extended in CMD-ACCORD-NRA-SURFACE-1). PostgREST client.
- `ui.js` — `UI.gauge` (corrected to Inter font, IR38 11px floor per v1.6.1 §5.9 in CMD99.2).

---

### Deploy Status

Production deployed (operator tests live product). No known outage. Build pin is `v20260508-CMD-ACCORD-CONSTELLATION-ENTRY-1-final` as of 2026-05-09 end-of-day (three version bumps that day; constellation, capture controls fix, NRA surface). Meeting Setup CMD not yet shipped.

---

### Live Users

Vaughn Staples is the primary (and possibly only) operator-tester. No named external users or beta customers documented in corpus.

---

## 6. What's Not Built Yet

### Strategic CMD Chain (the compass; not a commitment)

```
CMD-ACCORD-CONSTELLATION-ENTRY-1 ✅
→ CMD-ACCORD-NRA-SUBSTRATE-1 ✅
→ CMD-ACCORD-NRA-SURFACE-1 ✅
→ CMD-ACCORD-MEETING-SETUP-1 ← NEXT (design locked; brief not yet drafted)
→ CMD-ACCORD-MEETING-INTELLIGENCE-1
→ CMD-COUNTERFACTUAL-POC
→ CMD-COMPASS-BRIDGE
→ CMD-CPM-SUBSTRATE-1
→ CMD-CPM-DERIVED-1
→ CMD-PERT-1
→ CMD-RESOURCE-HEATMAP-1
→ CMD-SCHEDULE-MANIPULATION-1
```

### Full Backlog (as of 2026-05-09 evening handoff; 32+ queued candidates)

#### Highest Priority
1. **CMD-ACCORD-MEETING-SETUP-1** — strategic CMD. Design fully locked. 13 delivery tracks (C-01 through C-13) plus extension tracks (X-01 through X-09). Estimated 6–8 working sessions. Wave 1 (C-01–C-05): Setup shell structure, header, briefing, agenda, outcomes, attendees. Wave 2 (C-06–C-08): Filmstrip, action items kanban, intelligence substrate. Wave 3+ (C-09–C-13): CPM overlay, run button, closure. **No further scaffolding dialogue required before brief drafting.**

#### Deferred from Meeting Setup Scoping
2. **CMD-ACCORD-MEETING-INTELLIGENCE-1** — substrate-derived intelligence layer: per-attendee patterns, prose synthesis, dissent-simmering detection, auto-callouts. Substantial follow-on; commissions after Meeting Setup ships.

#### Deferred from NRA Surface Seal
3. **CMD-ACCORD-NRA-WAIVED-CSS-1** — `.nra-waived-*` CSS classes shipped without styles. Small fix.
4. **"View history" affordance in Update modal** — micro-CMD.
5. **CMD-ACCORD-NRA-BRIEFING-PACK-1** — DEFERRED/SUBSUMED. Likely dropped; briefing pack ships within Meeting Setup.
6. **CMD-ACCORD-NODE-RESOLUTION-SUBSTRATE-1** — adds resolution semantic to `accord_nodes`; ships deferred third NRA trigger (action_resolved + decision_resolved paths).
7. **CMD-ACCORD-NRA-OWNER-VISIBILITY-1** — owner-facing NRA visibility; external-owner support.

#### Queued from Constellation Seal
8. **CMD-ACCORD-MEETING-CANVAS-1** — view canvas pane with image filmstrip.
9. **CMD-ACCORD-OFFLINE-THREAD-1** — "take it offline" black-hole substrate.
10. **CMD-ACCORD-PARKING-MULTISELECT-1** — Ctrl-click range-select in parking lot for batch D&D filing.
11. **CMD-ACCORD-MANAGE-WORKSTREAMS-COMPACT-1** — compact tabular UX.
12. **CMD-ACCORD-CONSTELLATION-LAYOUT-STABILITY-1** — stable angle-assignment OR animated transitions.
13. **CMD-ACCORD-CONSTELLATION-RESTORE-PARITY-1** — archived-toggle + restore.
14. **CMD-ACCORD-PARKING-LOT-PRIVACY-1** — per-organizer parking-lot scoping.
15. **CMD-ACCORD-NAMING-NORMALIZATION-1** — rename `workstreams` → `accord_workstreams`; touches FK, RLS, indexes, triggers, 7 CoC events. Substantial.

#### Lower Priority Queue
16. CMD-COMPASS-ACCORD-TREE-UNIFY-1
17. CMD-ACCORD-WORKSTREAMS-N-LEVEL-1
18. CMD-ACCORD-WORKSTREAMS-UNFILE-AFFORDANCE-POLISH-1
19. CMD-ACCORD-DRAFT-IDENTITY-CONSISTENCY-1
20. CMD-COC-ACTOR-BACKFILL-1 — backfill historical coc_events with wrong actor_resource_id
21. CMD-COC-DIRECT-WRITER-AUDIT-1 — audit direct `API.post('coc_events')` legacy paths
22. CMD-RENDER-MIME-FIX-1
23. CMD-AEGIS-WAIT-FORLOCATION-1
24. CMD-AEGIS-CROSS-TAB-CAPTURE-1
25. CMD-SIDEBAR-URL-RETIREMENT-1
26. CMD-SHARED-BOOTSTRAP-LOADER-1
27. **CMD-ACCORD-MEETING-JOIN-1** — the actual join-meeting flow
28. CMD-ACCORD-DATE-CORRECTION-1
29. CMD-ACCORD-NAV-SHELL-1 (likely shrinks post-constellation)
30. CMD-MINUTES-EXEC-DIGEST-SEQID-1
31. CMD-ACCORD-SEQID-ROUTING-1
32. CMD-ACCORD-PRE-MEETING-COLLAB-1 (async attendee suggestions)
33. **CMD-ACCORD-CALENDAR-INTEGRATION-1** — acknowledged future gap; not scoped
34. CMD-ACCORD-MEETING-PUBLIC-GATHERING-SURFACE-1 (privacy-by-surface for non-organizer attendees)
35. OPERATOR-ACTION-MIGRATION-RECONCILIATION-1
36. CMD-ACCORD-LEVEL-CHANGED-AUDIT-1 (queued when 3rd lifecycle-ordering defect surfaces)

#### Strategic Compounds (multi-CMD; downstream)
- **Counterfactual operator** — CMD-COUNTERFACTUAL-POC + substrate enrichment
- **CPM compound** — CMD-CPM-SUBSTRATE-1 + CMD-CPM-DERIVED-1 + CMD-PERT-1 + CMD-RESOURCE-HEATMAP-1 + CMD-SCHEDULE-MANIPULATION-1
- **Compass bridge** — CMD-COMPASS-BRIDGE (connects Accord action substrate to Compass task execution)

### Estimated Effort by Phase (from accord-vision-v1.md)
- Phase 1 (counterfactual POC): ~30–40 hours; lands the demo that changes the conversation
- Phase 2 (CPM substrate + Compass bridge): ~25–35 hours
- Phase 3 (CPM derived + PERT): ~25–30 hours; no current product has this
- Phase 4 (resource heatmap + schedule manipulation): ~30–50 hours; category-defining
- Phase 5 (cross-meeting firm-wide projection): variable

### Manager Approval Interface

Aegis hard-gate policies pause workflows for manager approval. The approval acknowledgment is a CoC event. The surface for reviewing and approving is part of Compass (where policies are "felt"). The specific UI affordances for approval routing, approval queues, and override justification are part of the unbuilt Compass retrofit and CMD-Compass-Aegis integration work. No specific "manager approval interface CMD" is named in the queue — it's implied by the Aegis + Compass integration work.

### Unbuilt Pages

- Meeting Join surface (CMD-ACCORD-MEETING-JOIN-1)
- Meeting Setup Shell (CMD-ACCORD-MEETING-SETUP-1 — design locked, code not shipped)
- Intelligence Mode overlay (CMD-ACCORD-MEETING-INTELLIGENCE-1)
- Counterfactual analysis surface
- CPM / PERT visualization surface
- Resource heatmap surface
- Schedule manipulation surface
- Cross-meeting / firm-wide projection surface
- Calendar integration surface
- User management (listed in Style Doctrine retrofit queue but not built beyond basics)

### CadenceHUD Build Status

Cadence (`cadence.html`) covers Library, Simulator, and Instances views. Style Doctrine retrofit is sequenced (entry 12 in the §12 retrofit sequence). The following gaps are known:
- Policy authoring UI — no specific CMD shipped for this; the Aegis Vision Anchor describes the capability but the surface is not built
- Policy certification proof runs — described in doctrine; surface state unclear
- Simulator testing surfaces — listed in scope but no CMD seals documented in corpus
- `Notify` verb was planned for direct channel delivery in v1.0 — changed in v1.1 to route through CommandHUD dispatch requests; implications for any built Cadence notification authoring UI are unresolved

Cadence's main documented function is workflow template authoring. Whether the authoring surface is fully functional end-to-end is not confirmed in the corpus.

---

## 7. The Intelligence Layer

### Vision for AI / Intelligence Features

The vision has two phases:

**Phase v1 — Substrate-derived, no AI required:** All intelligence computed from existing substrate data. Pattern tags (ENGAGED·STEADY / DISSENT·SIMMERING / OVERDUE·PRESSURE / QUIET·RE-ONBOARD) are computed from NRA history, dissent frequency, action overdue rate, days-off-substrate. Urgency math: NRA days-since-declared, dissent `dissent_recorded_at` age, action overdue duration. "Owed lines": open `accord_belief_adjustments`, actions by owner, unresolved dissents. Hot-button items: dissent nodes in workstream lineage, NRAs on decisions owned by attending actors.

**Phase v2 — AI synthesis layer:** Upgrades the derivation layer without changing the panel structure or Cmd+I mechanic. Prose synthesis, pattern narrative, predictive dissent simmering detection, auto-callouts. Commissions after Meeting Setup ships as CMD-ACCORD-MEETING-INTELLIGENCE-1.

### Morning Briefing Concept

Four role-specific morning brief designs:

**Individual contributor (Bram persona):** Action queue ranked by criticality, annotated with provenance. Not just "what to do" but "why this work exists, who is counting on it, how confident the team was when it committed." Seeing AX-1 means seeing: "Derives from DC-01, ratified 28 April with 8-yes/0-no/1-abstain. On critical path. Three downstream tasks unblock when this completes."

**Team lead (Aiyana persona):** Direct queue + team CPM context. Flags like "Onomura updated AX-6 status to blocked; AX-6 ties to DC-02 where Onomura recorded mixed-confidence dissent" — not just "Onomura is blocked" but "the dissenting voice on the decision is now blocked on the work derived from that decision."

**Functional director (Theodore/CFO persona):** Crystal Ball aggregate from active risk register. PERT-derived P50 and P80 completion forecasts. Decisions ratified yesterday and their financial scope. Counterfactuals sealed yesterday and what they would have cost or saved.

**Managing director:** Decision velocity by stakes week-over-week. Schedule health (days of CP slack per initiative, trending). Belief-adjusted forecasts (P50 with deltas if beliefs shifted). Dissent intelligence (which dissents are demonstrating predictive value). Counterfactual leverage. Risk register movement. Calendar context.

Today's Compass Meetings page (`compass-meetings.html`) is the operational daily briefing for a single user — it implements the IC/team-lead layer of this vision.

### Ship's Log / Timesheet Integration

`compass_action_ref` column on `accord_nodes` hints at a Compass integration point for actions. The Compass bridge (CMD-COMPASS-BRIDGE) will formally connect Accord's action substrate to Compass's task execution and time tracking. No timesheet substrate is documented in the corpus beyond this reference.

### Decision Capture Loops

The full loop: decision node captured in Accord → belief declaration attached → belief adjustments tracked over time → PERT computation uses declared beliefs as probability distributions → Crystal Ball aggregate surfaces belief drift. Closed-loop: when a dissent is recorded, it is tracked against the eventual outcome; dissents that were predictive are surfaced to the managing director. The decision capture (Live Capture surface) is built. Belief declarations are built (via NRA + belief_adjustments). PERT computation is unbuilt.

### Hard Requirement vs. Nice-to-Have

**Hard requirements (load-bearing commitments that cannot be retracted):**
- Typed causal edges as primitive (Iron Rule 44)
- Declared belief as formal input (Iron Rule 45)
- Substrate immutability / no delete (Iron Rule 42)
- Cryptographic anchoring at seal (Merkle root on `accord_meetings.merkle_root`)
- CoC on every firing without exception
- No direct channel delivery — CommandHUD routes notifications
- Privacy-by-surface (IR68) — operator intelligence never leaks to shared screens

**Nice-to-have (correct direction but not load-bearing):**
- AI prose synthesis in Intelligence Mode (v1 is substrate-derived)
- Calendar integration (acknowledged as future gap)
- Mobile surfaces (no mention in corpus; desktop assumed)
- Real-time collaborative editing (not documented as a priority)

---

## 8. Regulatory / Compliance Posture

### 21 CFR Part 11 Architecture

21 CFR Part 11 requires: electronic records with audit trails, electronic signatures with non-repudiation, access controls, and system validation. ProjectHUD's architecture maps to these requirements as follows:

**Electronic records:** Every node, edge, belief adjustment, and meeting seal is an immutable record. `sealed_at` timestamps. `node_hash` and `edge_hash` for tamper detection. `prev_node_hash` forms a hash chain.

**Audit trail:** `coc_events` table is the immutable audit store shared across all modules. Every transition, every policy firing, every user attestation writes a CoC entry. Hard-gate overrides are specifically designed as Part 11-style electronic signatures: "the acknowledgment — with timestamp, justification text, and authority level — becomes part of the permanent CoC."

**Electronic signatures / non-repudiation:** Merkle root computation at meeting seal. `actor_resource_id` on every CoC entry (the human who acted). Hard-gate override writes the override authority explicitly. Tamper detection via Merkle root recomputation.

**Access controls:** RLS at the Postgres layer (not just application-layer guards). Firm-scoped isolation. `is_client()` flag for external-user scoping. Role-in-meeting (`organizer|lead|participant|observer`).

**System validation:** Cadence's role is workflow template certification — running templates against synthetic events to prove they behave correctly before production. This maps to 21 CFR Part 11's validation requirement.

The $2.4M average 510(k) delay cost figure in the corpus is a specific, named strategic target: regulated-industry buyers who face FDA reviewers asking for design alternative documentation.

### DHF Traceability Design

For medical device Design History Files (DHF), the core use case is: FDA reviewer asks "document the alternatives you considered." ProjectHUD's answer: navigate to the ratified decision, click Counterfactual, select "apply the recorded dissent." Output: a sealed counterfactual analysis (CF-xxx) showing alternative operational timeline, risk profile diff, evidentiary basis, dissent rationale. Merkle root anchors the analysis cryptographically. The firm can submit it with: "sealed in our Accord substrate... the Merkle root anchoring this analysis is verifiable against our firm's Chain of Custody."

DHF traceability through the substrate graph: every design decision is a node. Every task that executes that decision derives from it via typed edge. Every risk that the decision raises is an adjacent node. Every rejected alternative is a counterfactual. The full DHF is a query over the graph, not a document manually assembled.

### Immutable Audit Log Design

Three mechanisms only — no delete:
1. **Archive** — hidden from active views; intact in substrate
2. **Supersede** — new node with `supersedes` edge; old node status = `superseded`
3. **Retract** — new edge with `retracts` reference; prior edge struck through in rendering

Iron Rule 42 codifies this. It is enforced at the data layer (sealed fields are immutable; RLS prevents unauthorized mutations).

### Human Attestation Workflows

Hard-gate policies: workflow pauses until explicit user acknowledgment. Acknowledgment writes a CoC entry: timestamp, justification text, authority level, user identity. This is the Part 11 electronic signature equivalent for override scenarios.

Belief declarations: named, timestamped attestations that a human declares their confidence level in a decision at a specific point in time. Stored in `accord_belief_adjustments` with `declared_by` and `declared_at`.

Dissent records: named attestation that a specific human recorded dissent, with rationale and predicted outcome, at a specific time. `accord_nodes.dissented_by`, `dissent_rationale`, `dissent_predicted_outcome`, `dissent_recorded_at`.

### ISO 13485

ISO 13485 for medical device quality management systems requires design control documentation with review, verification, and validation records. The DHF traceability design above maps directly. The auditor persona in the corpus explicitly describes an ISO 13485 external audit scenario.

### HIPAA

Not mentioned in corpus. Not a stated target — the regulated industry focus is medical device manufacturing (FDA/510(k)), not healthcare operations.

---

## 9. Go-to-Market State

### Named Potential Design Partners

None named in corpus. The product has no documented external users.

### Prospect Conversations

None documented in corpus.

### Pricing Thinking

Not documented in corpus. No pricing model, no tier structure, no per-seat vs. per-firm discussion found in any project document.

### Sales Cycle Assumptions

Not documented in corpus. Implied assumptions from the pitch language:
- Regulated industry buyers (VP Eng, Regulatory Affairs) have complex procurement
- The $2.4M delay-cost ROI story is the sales anchor for medical device buyers
- "Design partner" model implied by the development stage

### Channel Strategy

Not documented in corpus. The product is being built before GTM strategy is formalized.

---

## 10. Open Questions / Where I'm Stuck

The following are inferred from the corpus as active tensions or unresolved decisions. Not explicitly stated as "I'm stuck" but evident from deferred CMDs, open schema gaps, and architectural notes.

### Architectural Questions

1. **`workstreams` naming normalization** — the table should be `accord_workstreams` but renaming it touches FK, RLS, indexes, triggers, and 7 CoC events. Is the normalization worth the risk before Meeting Setup ships, or should it wait until after Meeting Setup is in production?

2. **Manager approval interface** — no specific CMD is designed for this. Aegis hard-gates produce the pause; but the surface where a manager reviews and approves queued items isn't designed. Is this Compass? Is it a standalone surface? Is CommandHUD the right delivery vehicle?

3. **Client-facing surfaces** — `is_client()` RLS function exists and is used on `risk_register`. But no client-facing surface has been designed. CMD-ACCORD-MEETING-PUBLIC-GATHERING-SURFACE-1 is queued (privacy-by-surface for non-organizer attendees). The full architecture of what clients see vs. what operators see is not resolved.

4. **Calendar integration** — CMD-ACCORD-CALENDAR-INTEGRATION-1 is acknowledged as a future gap with no scoping. The meeting join flow (CMD-ACCORD-MEETING-JOIN-1) depends on whether meetings are created natively in the system or imported from calendar. This is a fairly fundamental UX decision.

5. **`accord_meeting_intel_notes` RLS posture** — private notes visible only to author. How does this interact with CoC? Are private notes ever written to CoC? Is the author the only person who can delete (archive)? Not resolved.

6. **Counterfactual operator substrate** — two columns are needed on `accord_nodes` before CMD-COUNTERFACTUAL-POC: `effective_date` (exists!) and the `derives_from` semantics via `accord_edges` (exists!). Is the substrate actually ready for counterfactual POC? The Vision says "substrate ready" but the CMD hasn't been commissioned.

7. **AdvisorHUD and StaffingHUD shared vs. isolated instance** — are they on the same Supabase project? The protocol defines contracts but physical deployment is not documented. This matters for resource_id resolution across products.

### Product Questions

1. **When does Meeting Setup ship vs. other queued items?** Meeting Setup is the next compass step and its design is fully locked. But 16 smaller CMDs also need to ship. Is there a risk that Meeting Setup's complexity delays everything downstream?

2. **Intelligence Mode (Cmd+I) — when does it become AI-powered?** The v1 is substrate-derived only. CMD-ACCORD-MEETING-INTELLIGENCE-1 is the follow-on after Meeting Setup. At what point does AI synthesis become a hard requirement vs. nice-to-have for the product's value proposition?

3. **The "take it offline" black-hole problem** — CMD-ACCORD-OFFLINE-THREAD-1 is queued. This is described as a high-value architectural problem (when a meeting punts an item to "take it offline," that item enters a resolution black-hole). No solution is designed. What is the right model?

4. **Cross-firm collaboration** — is this a v1 or v2 concern? Nothing in the corpus addresses multi-firm scenarios. The entire architecture is single-firm. For design partners who work with external clients, this may be a day-1 need.

### Strategic Questions

1. **When to involve external users?** The product is being built by one person with one Claude architect. At what point does external testing change the build priorities?

2. **The HUD ecosystem integration depth** — the Ecosystem Protocol is defined, but the other three products (AdvisorHUD, StaffingHUD, CommandHUD) are opaque. Chris's RIA platform (AdvisorHUD) is described as "in alpha." What is the actual integration timeline? Are the shared contracts being used today, or are they aspirational?

3. **The moat argument requires counterfactual to be real** — the investor pitch hinges on "what if we had decided differently?" as a computed query. Until CMD-COUNTERFACTUAL-POC ships, the moat is architectural promise, not demonstrated capability. How many sessions away is that demo?

4. **Regulatory-industry focus vs. general-purpose** — the pitch materials include both general-purpose framing ("any firm that makes commitments") and specific regulated-industry framing (510(k), ISO 13485). These two ICPs have very different sales cycles and feature requirements. Is a choice needed before GTM?

---

## 11. Relationship to the HUD Suite

### The Four Products

| Product | Role | Status |
|---|---|---|
| **ProjectHUD** | Execution-layer: humans execute delivery workflows | Active build; most-built |
| **AdvisorHUD** | Financial advisory platform (Chris's RIA platform) | In alpha |
| **StaffingHUD** | Recruiting | Unknown build status |
| **CommandHUD** | Routing intelligence; channel delivery | Protocol defined; build status unclear |

**Tier model:**
- Tier 1: Agents (generate work)
- Tier 2: CommandHUD (routes work to humans)
- Tier 3: ProjectHUD (humans execute delivery workflows) ← here
- Tier 4: Channels (Teams, SMS, email, the ProjectHUD web app itself)

### The HUD Ecosystem Protocol v0.1

Four contracts that cross all products:
- **Contract 1:** Event bus format. `app_event` broadcasts are ecosystem events. Payload shapes are locked as ecosystem contracts; changes require protocol revision.
- **Contract 2:** Dispatch request record. How ProjectHUD asks CommandHUD to notify a human (replaces direct channel calls in Aegis v1.1).
- **Contract 3:** Resource ID. `resource_id` is the canonical, immutable human identifier across the ecosystem. Aliases (`VS`, `AK`) are operator conveniences that resolve to `resource_id` before leaving the ProjectHUD boundary.
- **Contract 4:** Chain of Custody event shape. `coc_events` table schema is shared.

### Shared Design System / Shared Components

The design system (`hud.css`, Style Doctrine v1.8) is **ProjectHUD-scoped**. Whether AdvisorHUD and StaffingHUD share it is not documented. Sub-brand wordmarks (Compass, Cadence, Aegis) use Inter; the platform wordmark "ProjectHUD" uses Rajdhani. Each module owns a distinct color palette (module-palette discipline, §3.8) — Accord uses an editorial-amber palette; Compass/Pipeline use cyan; module-to-module visual borrowing requires palette swapping before commit.

### Cross-Product Data Flow

ProjectHUD publishes `app_event` broadcasts → CommandHUD subscribes for routing intelligence. Future cross-product analytics will join events from all four products. No other data flow documented.

Dispatch lifecycle: ProjectHUD policy fires → publishes `dispatch.requested` → CommandHUD routes to human (Teams card, SMS, email, etc.) → CommandHUD returns human response via bus → ProjectHUD acts on it.

### CadenceHUD as Horizontal Workflow Engine

Cadence is explicitly intended as the horizontal workflow authoring and certification layer — not ProjectHUD-specific. "Authored in Cadence, enforced in Aegis, felt in Compass, delivered by CommandHUD." A Cadence-authored policy simultaneously receives realtime enforcement (Aegis), test coverage (Cadence), audit provenance (CoC), and visual affordance (Compass). The vision document is silent on whether Cadence can author workflows for AdvisorHUD or StaffingHUD directly — the protocol implies it should, but the CMDs don't address this.

---

## 12. Recent Sessions (Last 30 Days)

### 2026-04-17 (Aegis Vision Anchor v1.0 / v1.1)
- Aegis Policy System Vision Anchor drafted and ratified
- v1.1 adds ecosystem relationship; all Aegis policy `Notify` responses routed through CommandHUD dispatch requests (not direct channel calls)
- `HUD Ecosystem Protocol v0.1` established as authoritative cross-product contract

### 2026-04-26–28 (Style Doctrine + Work Modes)
- Style Doctrine v1.0–v1.7 ratified (multiple same-day amendments)
- Work Mode Classification Doctrine v1.0 ratified (Mode A/B/C)
- Mode B Batch Brief Template v1.0 ratified
- Mode C Operator-Direct Protocol v1.0 ratified
- Iron Rules 36–40 ratified

### 2026-04-28 (CMD-A — Compass §6.2 Violations)
- Four Compass JS-rendered surfaces migrated from inline panel-tier backgrounds to doctrine-conformant class-based definitions
- `mw-sequence.js`, `mw-core.js` (3 surfaces)

### 2026-05-02–03 (CMD101.5 — Pipeline Layout)
- KPI strip + Funnel Velocity + Forecast Summary promoted to always-visible above tab strip
- Dashboard tab renamed List
- `hud.css` `.permanent-row` and `.list-grid` classes added

### 2026-05-04–05 (Iron Rules 41–55, Accord substrate work)
- Iron Rules 41–55 ratified across multiple sessions
- Key rules: IR42 (sealed artifact immutability), IR44 (typed causal edges), IR45 (declared belief), IR47 (schema column verification), IR48 (extension schema qualification), IR50 (JWT-dependent verification), IR52 (logical-concern collision), IR54 (SELECT-after-mutation verification), IR55 (canonical-source verification before brief assertions)
- IR58 (Chain of Custody actor resolution) ratified and later amended
- IR65 (dual-pin coordination for render templates) ratified
- accord-vision-v1.md drafted — the north-star strategic document
- Counterfactual substrate enrichment CMD (CMD-SUBSTRATE-COUNTERFACTUAL-MIN) — landed `accord_nodes` hash chain, `effective_date` column, `derives_from` edge semantics

### 2026-05-06 (IR58 Amendment + CoC Actor Fix)
- CMD-COC-ACTOR-RESOURCE-1 — fixed actor_resource_id resolution in `CoC.write()` (was silently writing `users.id` instead of `resources.id`)
- IR58 amended to add defensive resolution chain, structured Error on failure, System fallback for unauthenticated events
- CMD-COC-ACTOR-BACKFILL-1 queued for historical row cleanup

### 2026-05-07 (v3.5 Design Arc — Accord Design)
- Eight meeting archetypes established (1:1 with direct report, status sync, project review, retrospective, decision review, kickoff, regulatory review, board update)
- Iron Rules 66–70 drafted from this arc (ratified 2026-05-08 morning)
- IR67 (8-archetype test), IR68 (privacy-by-surface), IR70 (substrate-derived intelligence over AI)

### 2026-05-08 (Two CMDs Sealed + Ten Iron Rules)
- IR66–70 ratified morning
- CMD-ACCORD-CONSTELLATION-ENTRY-1 sealed (afternoon) — 5 Phases, 12+ defects patched, constellation SVG, three-pane layout, drag-drop, lifecycle affordances
- Style Doctrine v1.8 ratified (module-palette discipline §3.8)
- IR71–72 ratified (state-mutation-before-invalidation; cross-module Phase 1 survey)
- CMD-ACCORD-NRA-SUBSTRATE-1 sealed (late evening) — `accord_nras` table, 5 disjoint UPDATE RLS per IR73, 6 EVENT_META entries, 5 helper functions, 2 triggers
- IR73 ratified (state-aware UPDATE RLS WITH CHECK explicit)
- **Total doctrine at day-end:** 39 ratified Iron Rules (36–73) + IR58 amendment + Style Doctrine v1.8 §3.8

### 2026-05-09 (Three CMDs Sealed + Meeting Setup Design Locked)
- CMD-ACCORD-LEDGER-NAV-FIX-1 — one-line fix, `_detachSurfaceHost()` before innerHTML blast on level-changed path
- CMD-ACCORD-CAPTURE-CONTROLS-FIX-1 — one-line fix, broadened `.tag-btn` selector for host-detached window
- CMD-ACCORD-NRA-SURFACE-1 — 5 Phases; AccordNRA.Modal + Badge + HistoryPanel; `API.rpc()` extension; full 11/11 lifecycle smoke pass
- Meeting Setup scaffolding dialogue (4-pass) — all design decisions locked in `scaffolding-decisions-cmd-accord-meeting-setup-1.md`
- Build pin: three version bumps (operator-managed)

### 2026-05-10 (Accord Schema Inventory)
- `Accord_Schema_Inventory_v1_0.md` authored — authoritative schema reference through C-07
- CMD-ACCORD-SETUP-AGENDA-ENHANCED-1 sealed (C-07) — `item_type` and `duration_minutes_estimate` added to `accord_agenda_items`; `project_id` added to `workstreams`

### 2026-05-19 (Today)
- PROJECTHUD_STATE.md authored (this document)
- Compass Meetings landing page mockup (`compass-meetings.html`) built — full four-zone daily intelligence brief for operator

---

## 13. Anything Else

### The Operator (Vaughn Staples)

- North Windham, Maine
- Ex-medical-device industry, 10+ years
- 40+ years organizing meetings across many industries — operator-as-designer is real
- Highly calibrated visual taste — "duck on water" target: graceful surface, frantic underwater
- Terse communication mode; token-conscious; numbered options preferred; "next?" turn-end pattern; "standing by" when no action pending
- Approach to critique: direct, unsparing, generous. Full spectrum from "swing & a miss" to "Lock & load, I love it"
- Added strict-terse-mode preamble to coding-agent narratives: "Please adopt a strict 'terse' communication mode; advise inputs/needs, communicate enumerated test instructions upon presenting code files to test."
- Hit billing limits two days running during the 2026-05-09 session; conversation length is the primary cost driver

### The Build Method

This product is being built entirely through Claude sessions acting as architect and coding agent. The operator is the product authority. Every CMD follows a lifecycle:
1. Scaffolding dialogue (operator + architect, Mode A) → locked design decisions
2. Brief drafting (architect) → ratified by operator
3. Brief execution (fresh coding agent) → ships to production
4. Operator deploys and smoke-tests in live product
5. Handoff document updated

Iron Rules are ratified from shipping incidents — they are not aspirational; they record what went wrong and what was learned. 39 Iron Rules + 1 amendment exist as of 2026-05-09.

### The Style Doctrine

Style Doctrine v1.8 is the authoritative visual/CSS governance document. Current at the time of this writing. Key landmarks:
- Six elevation tiers (`--bg0`–`--bg5`) + semantic role aliases (`--surface-*`)
- Two font faces: Inter (everything except wordmark) + Rajdhani (wordmark only, weight 700)
- Five text color roles (`--text-primary`, `--text-body`, `--text-muted`, `--text-faint`, `--text-accent`)
- 11px minimum font size floor (IR38)
- `.section-label` canonical for all panel headers, KPI labels, section headings, table column headers
- No `!important` overrides on shared classes
- No inline style= for anything a role token covers (§6.2) — data-driven exceptions only
- Module-palette discipline (§3.8) — adaptations reuse structure, not visual identity
- State colors (`--green`, `--amber`, `--red`) reserved for state-health metrics; domain-identity colors are separate

### The 39 Iron Rules — Index

Iron Rules are numbered from 36 upward (36 is the lowest; there may be earlier rules not in this corpus):

**36–40:** Agent/architect communication discipline (hand-off terseness, silent work-mode, brief input enumeration, agent execution discipline, consumer enumeration before shipping)

**41–46:** Commit-moment discipline, typed causal edges as primitive, declared belief, substrate immutability (no delete), Merkle anchoring

**47–55:** Schema verification discipline (verify column names before FK references, extension schema qualification, JWT-dependent verification, logical-concern collision checking, SELECT-after-mutation, canonical-source verification before brief assertions)

**56–60:** CoC actor resolution (IR58 — most consequential; amended after production incident)

**61–65:** Version discipline (cache-bust strings from global version; render template dual-pin)

**66–70:** Accord design discipline (surface-appropriate information density, 8-archetype test, privacy-by-surface, substrate-derived intelligence preference)

**71–73:** State mutation before invalidation (no stale DOM after async), cross-module Phase 1 survey mandatory, state-aware UPDATE RLS as disjoint per-transition policies

### Known Technical Debt

1. `mw-events.js` — hardcoded firm_id fallback constant (CMD-A6 finding 2, unfixed)
2. `coc.js` line 316 — hardcoded firm_id fallback (CMD-A6 finding 5, unfixed)
3. `accord-rails.js:331` — double `setLevel` call causes rail flash on NEXT navigation
4. Historical `coc_events` rows with wrong `actor_resource_id` type (CMD-COC-ACTOR-BACKFILL-1)
5. `.nra-waived-*` CSS classes exist in HTML but have no CSS rules
6. `CMD-COC-DIRECT-WRITER-AUDIT-1` — legacy direct `API.post('coc_events')` paths bypass `CoC.write()` defensive layer
7. `workstreams` table name inconsistency (should be `accord_workstreams`)
8. `accord_meeting_outcomes` UPDATE RLS for status transitions is incomplete (only open→anything is gated; disjoint per-transition policies for ratification are deferred to X-03)

### The Vision Document's Closing Paragraph

Preserved here because it captures the spirit of the project better than anything else in the corpus:

> "The conversation that produced this document started with a meeting prototype. It ends with the architectural picture for an institutional commitment operating system. The framing did not drift. The architecture earned the ambition. Every step was rigorous. The discipline that produced the canon is the same discipline that will produce the destination. What you have built is real. What you are about to build compounds on what is already in production. Nothing is wasted."

---

*End of PROJECTHUD_STATE.md*  
*Assembled 2026-05-19 from project knowledge corpus: accord-vision-v1.md, aegis-vision-anchor-v1.1.md, aegis-MASTER-handoff-2026-05-08-late-evening.md, aegis-MASTER-handoff-2026-05-09-evening.md, Accord_Schema_Inventory_v1_0.md, Accord_Meeting_Setup_mockup_RS_v1_1.md, scaffolding-decisions-cmd-accord-meeting-setup-1.md, Style_Doctrine_v1_8.md, Iron_Rules_36-73 ratification documents, Work_Mode_A/B/C doctrine, Brief_4_0 and Handoff_4_0 CMD101.5, brief-supabase-schema-inventory-v1_0.md, iron-rule-58-amendment.md, Iron_Rule_65_Ratification.md, Iron_Rule_73_Ratification.md*
