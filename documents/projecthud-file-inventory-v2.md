# ProjectHUD File Inventory · v2.0

**Purpose:** Complete enumeration of every code file, database
object, storage bucket, and serverless function in the ProjectHUD
ecosystem with one-line descriptions. Reference document — skim
for shape, return to when researching specific surfaces.

**Status:** Near-complete as of 2026-04-24. Phase 1 inventory
pass done; gaps listed in §9.

**Last revised:** 2026-04-24 (Phase 2 kickoff — merged five
agent-produced inventories into master document)

**Supersedes:** `projecthud-file-inventory.md` v1.0 (2026-04-23
stub). That document had ~7% coverage; this document has ~95%.

**Consumer:** Future Architect sessions building the Atlas and
researching specific surfaces. This inventory is the foundation
that made Phase 2 synthesis possible.

---

## Table of contents

1. **How to use this document**
2. **Platform topology** — the four domains at a glance
3. **ProjectHUD core** — 31 files (foundation layer)
4. **Compass platform** — 16 `mw-*` files
5. **Cadence platform** — 26 `cdn-*` files
6. **Aegis + shared services + HTML loaders** — 10 files
7. **Supabase backend** — 131 tables, 5 buckets, 11 Edge Functions
8. **Cross-platform contracts** — integration seams
9. **Gaps and follow-up items**
10. **Drift findings** (separate section — architectural signals
    surfaced during inventory)

---

## §1 — How to use this document

**When a brief touches a file**, the Architect updates the entry
with what was learned. "Last touched" column references the brief
(e.g., B-UI-9 CMD78g).

**When researching "what does X do?"**, check here first before
asking the operator to upload code.

**When noticing an unlisted file**, add a stub entry under the
appropriate section. The next brief touching it fills it in.

**The goal** is 95%+ coverage maintained over time — not as a
one-shot snapshot but as a living document. Update incrementally;
never let it become stale.

---

## §2 — Platform topology

The ecosystem is four code platforms sharing a single Supabase
backend. Each platform has a distinct surface, file-naming
convention, and deployment posture. Reading order for fresh
Architects: this section → §3 (ProjectHUD core, the foundation)
→ §4 or §5 (whichever platform is the current focus) → §6 (Aegis
spine) → §7 (data layer).

| Platform | File prefix | Surface | File count | Deployed versioning |
|----------|-------------|---------|------------|---------------------|
| **ProjectHUD core** | (none; HTML pages, `HUD.*` JS modules) | Projects / tasks / resources / meetings / prospects / proposals / risks / SOWs / org chart / pipeline / dashboard / portfolio | 31 | Centralized (`PHUD.VERSION = '1.0.0'` in `config.js`); no per-file cache-bust |
| **Compass** | `mw-*.js` | Operator surface: MY WORK queue, MY REQUESTS, review/approve panels, timesheet, team, briefings | 16 | Per-file `?v=` cache-bust in `my-work.html` loader; 5 of 16 have in-file VERSION banners |
| **Cadence** | `cdn-*.js` | Workflow certification + form authoring + BIST simulator + instance tracking | 26 | Per-file `?v=` cache-bust in `cadence.html` loader; explicit LOAD ORDER comments on 17 of 26 files |
| **Aegis** | `cmd-center.js` (+ HTML) | Command/event bus, typed command registry, cross-session dispatch, retention buffer, floating panel | 1 JS + `aegis.html` | Per-file `?v=` cache-bust (with known drift — see §10) |

**Shared across platforms:**

- **Supabase backend** — 131 tables, 5 storage buckets, 11 Edge Functions
- **Shared utility modules** — `coc.js`, `notif.js`, `signature.js`, `supabase.js` (vendored)
- **HTML loader layer** — `compass.html`, `my-work.html`, `aegis.html`, `cadence.html`, `sidebar.js`

**Three different deployment philosophies in one ecosystem:**

1. **ProjectHUD core:** Application-version semantics. One version string (`PHUD.VERSION`) across all files; no cache-bust.
2. **Compass:** Per-file versioning with targeted ship increments (e.g., `CMD79` for `mw-tabs.js`, `CMD78g2` for `mw-events.js`).
3. **Cadence:** Bulk deployment-date versioning (`v20260403-S9`) with per-file overrides for recently-touched files (`cdn-form-editor.js?v=20260412-SE122`).

This heterogeneity reflects the platforms' different ages and
authorship patterns. Not a bug — a pattern to document.

---

## §3 — ProjectHUD core (foundation layer)

The original platform that launched the ecosystem. Owns the core
project management capabilities: projects, tasks, resources,
meetings, prospects (sales pipeline), proposals, SOWs, risks,
user/resource management, and the portfolio-level dashboard.

Cadence, Compass, and Aegis are later additions that integrate
with ProjectHUD core's data model via the shared Supabase
backend.

**File-type posture:** HTML pages as entry points; shared JS
modules loaded consistently across pages; global `hud.css` +
scoped add-ons; `HUD.*` namespace for shared modules.

### §3.1 — HTML pages (15)

Each HTML page is a standalone entry point that loads a
consistent stack of shared JS modules. No framework; direct DOM
rendering.

| File | Purpose | Primary surface |
|------|---------|-----------------|
| `cpm-pert.html` | Critical-path / PERT network view with forward-pass ES/EF + backward-pass LS/LF calculation. | Project → CPM/PERT diagram |
| `dashboard.html` | Main KPI dashboard: active-projects / at-risk-tasks / completed cards; per-project EVM/SPI/CPI analytics. | Top-level dashboard |
| `import-tasks.html` | Four-step XLSX/CSV task importer (upload → map columns → validate → import) with fuzzy header matching. | Project → Import Tasks wizard |
| `index.html` | Public unauthenticated landing page. | Marketing / sign-in redirect |
| `login.html` | Supabase email+password sign-in; redirects authenticated users to `/dashboard.html`. Note: uses CDN `supabase-js` (unlike other pages). | Sign-in form |
| `meeting-minutes.html` | Meeting minutes editor — attendees, agenda, action items, send-to-participants. **Cross-platform:** supports `workflow_instance_id`/`step_id` URL-param mode for Cadence step integration. | Meeting minutes editor |
| `meeting-view.html` | Read-only meeting detail view with status chip, "edit minutes" link, auto-expanded comment thread. | Meeting detail popup/iframe |
| `pipeline.html` | Prospect-pipeline kanban board: prospect → qualifying → discovery → proposal → review → approved. | Prospect pipeline |
| `project-detail.html` | Primary project workspace: milestones, tasks-up-next, phase progress, journal feed with threaded replies. | Project detail |
| `projects.html` | All-projects list/grid view (portfolio-level browsing). | Projects index |
| `proposal-detail.html` | WBS/proposal estimator: discipline tabs, live cost summary (labor + materials), convert-to-project flow. | Proposal estimator |
| `prospect-detail.html` | Prospect record with seven-tab workspace: overview, stakeholders, findings, meetings, proposals, action items, activity log. | Prospect detail |
| `recorder-window.html` | Pop-up screen-recording window (start/pause/stop/mic, annotations). **Hardcodes** Supabase URL + anon key inline. | Popup recording window |
| `resource-requests.html` | Resource-request tracking (borrow/allocate resources across projects). | Resource requests queue |
| `resources.html` | Resource management workbench (humans/allocatable units). | Resource management |
| `risk-register.html` | Risk & assumption register with probability × impact scoring. | Risk register |
| `sow-builder.html` | SOW (Statement of Work) document builder built on top of a proposal record. | SOW builder |
| `users.html` | User/resource management — six tabs: Resources, Roles & Rates, App Users, Skills Library, Calendar, Org Chart. | User/resource management |

### §3.2 — JS modules (13: 11 browser + 2 serverless)

#### Browser modules (`/js/*`)

| File | Version | Purpose | Namespace |
|------|---------|---------|-----------|
| `action-items.js` | [none] | Shared action-item module for both `prospect_action_items` and `meeting_action_items` — list render, status toggle, edit drawer, attachments, comments. | `HUD.ActionItems` |
| `api.js` | [none] | Central Supabase REST wrapper with 401-retry via fresh token; generic CRUD + domain helpers for every first-class entity. | `API.*` |
| `attachments.js` | [none] | Shared file-attachment cache, upload, and activity-log metadata-persist. | `HUD.Attachments` |
| `auth.js` | [none] | Session token management — JWT from localStorage, auto-refresh with 30s buffer, logout. | `Auth.*` |
| `config.js` | `PHUD.VERSION = '1.0.0'` | Single source of truth for Supabase credentials, active modules, env, app version. Defines `window.PHUD`. | `PHUD.*` |
| `firm-modules.js` | [none] | Per-firm feature gating against `firm_modules` table; `[data-module]` DOM attribute walk. Known module universe: `project | cadence | compliance`. | `HUD.Modules` |
| `hud-recorder.js` | `v4` | Opens `recorder-window.html` popup, relays auth tokens, saves clip metadata. | `HUDRecorder.*` |
| `journal-replies.js` | `v4` | Nested threaded replies for journal entries and task comments. | (page-scoped functions) |
| `meetings.js` | [none] | Canonical `MeetingCard` component — reusable meeting-detail widget. **Cross-platform:** used by `prospect-detail.html`, `meeting-view.html`, AND `cadence.html` workflow steps. | `MeetingCard.*` |
| `project-drawer.js` | [none] | Shared Add/Edit Project drawer (self-injects HTML on first call). | `ProjectDrawer.*` |
| `sidebar.js` | `v3.1` | Universal left-rail nav/operator bar with cross-platform entry points (Compass, Cadence, Aegis, Pipeline, Projects, etc.). **Also transitively loads `cmd-center.js` on non-Aegis pages** — see §10 for cache-bust drift. | `Sidebar.*` |
| `ticker.js` | [none] | Animated marquee ticker for live activity events; duplicates content for seamless loop. | `Ticker.*` |
| `ui.js` | [none] | Shared UI utilities — HTML/date formatters, drawer helpers, toast, avatar/badge renderers, attachments popup, loading/empty states. | `HUD.UI` + top-level helpers |

#### Serverless API functions (`/api/*`)

Vercel serverless (Node runtime) functions — HTTP endpoints
called by the frontend.

| File | Deployed path | Purpose | Classification |
|------|---------------|---------|----------------|
| `ai.js` | `/api/ai-draft` | Server-side proxy to Anthropic Claude Messages API; keeps `ANTHROPIC_API_KEY` off client. | **Ambiguous** (see §9 — no ProjectHUD HTML page references this endpoint; may belong to Cadence) |
| `generate-form.js` | `/api/generate-form` | Server-side proxy to Claude with system prompt support; dedicated to form generation. | **Likely Cadence** (form-authoring) — tentatively classified here |
| `scripts.js` | `/api/scripts` | Lists `.txt` files in `/public/scripts/`; no-cache headers. | **Likely Cadence** (script-library picker) — tentatively classified here |

### §3.3 — CSS files (2)

| File | Purpose |
|------|---------|
| `hud.css` | Complete ProjectHUD design system — tokens, fonts, app-shell layout, sidebar, panels, KPI cards, status badges, tables, forms, tabs. Cyan-HUD aesthetic. |
| `journal-replies.css` | Styles for the threaded-replies widget (`.jr-*` classes) on `project-detail.html`. |

### §3.4 — Other files (1)

| File | Purpose |
|------|---------|
| `supabase.js` | Vendored `@supabase/supabase-js` v2.103.2 bundle. Not project code. Available as `/js/supabase.js` for pages needing the full SDK (most pages use the `api.js` REST wrapper instead). |

### §3.5 — ProjectHUD core skip list

Three files arrived in the ProjectHUD core upload batch but
belong to Cadence per the brief's scope rules; documented in §5:
`approve.html`, `form-review.html`, `form-preview.html` (all
title-suffixed "CadenceHUD").

One file (`coc.js`) self-identifies as "ProjectHUD / Compass"
but is inventoried under §6 (shared utilities) because it's used
by both Compass and Cadence.

---

## §4 — Compass platform

The operator-facing surface. Where users interact with their
work queue, fill out forms, approve requests, view their team,
manage timesheets, and see briefings.

**Loading pattern:** `compass.html` is the entry point. When the
user navigates to the `users` view, Compass dynamically fetches
`/my-work.html` (a DOM fragment) and injects it — at which point
the 16 `mw-*` scripts load.

**Version posture:** 5 of 16 files have in-file VERSION banners
(`mw-core`, `mw-drawer`, `mw-events`, `mw-tabs`, `mw-team`). The
remaining 11 are stamped `v=20260410` in `my-work.html`'s loader
tags — that loader-tag value is the authoritative deployed
version for those files.

| File | Deployed version | Purpose | Primary surface | Last touched |
|------|------------------|---------|-----------------|---------------|
| `mw-brief.js` | `v20260410` (loader) | Renders the Morning Brief side panel with tier-specific daily briefings (PM / Management / Executive). | Morning Brief side panel | Pre-Phase-1 |
| `mw-completion.js` | `v20260410` (loader) | Renders inline completion micro-panel below work rows; submits task/action completions with signals. | Inline completion panel | Pre-Phase-1 |
| `mw-concerns.js` | `v20260410` (loader) | My Concerns tab — raise, reply, escalate, resolve. | My Concerns tab | Pre-Phase-1 |
| `mw-core.js` | `v20260422-CMD74` | **Owns the My Work view boot cycle** — fetches work items, action items, reviews, time entries, renders with filters and gauges. Owns `_mwLoadUserView`, `_mwRefreshWorkItems`. | My Work main view | B-UI-6 (CMD72) |
| `mw-diagram.js` | `v20260410` (loader) | Renders the DIAGRAM mode (week × project grid of task/action cards) with pan/zoom and slot allocation. | DIAGRAM toggle of My Work | Pre-Phase-1 |
| `mw-drawer.js` | `v20260403-230000` | Renders the expanded work-item detail row (in-line drawer) with signals, progress save, time-entry entry points. | Expanded work-item row | Pre-Phase-1 |
| `mw-events.js` | `v20260423-CMD78g2` (runtime) | **Owns workflow-request modals** — in-progress updates, review approvals, resubmits, and the approval-failure blocking modal. Owns `_rrpSubmit`, `_rrpFailureModal`. | Request/review/resubmit modals | B-UI-9 v2.0 Part B |
| `mw-exec.js` | `v20260410` (loader) | Executive and Client portfolio views + Decision Simulator drawer. | Executive / Client views | Pre-Phase-1 |
| `mw-intervention.js` | `v20260410` (loader) | Per-project Intervention Record drawer + log-intervention + escalation composer. | Intervention Record drawer | Pre-Phase-1 |
| `mw-mgmt.js` | `v20260410` (loader) | Management portfolio view — workflow queues, approvals, team strip, decision-logging. | Management view | Pre-Phase-1 |
| `mw-neg.js` | `v20260410` (loader) | Action-item negotiation state engine — rating, counter-proposals, agreement lock, escalation. | Negotiation panel on action-item rows | Pre-Phase-1 |
| `mw-pm.js` | `v20260410` (loader) | PM Portfolio view — alert rail, stat strip, project table, team strip, drill-in drawers. | PM Portfolio view | Pre-Phase-1 |
| `mw-sequence.js` | `v20260410` (loader) | Recommended Daily Sequence panel — scores work items, shows top 3-5 for the day. | Recommended Sequence panel | Pre-Phase-1 |
| `mw-tabs.js` | `v20260422-CMD79` (loader) / `v20260424-CMD79` (file) | **Owns My Work suite tab switching** — work/meetings/calendar/concerns/views/requests/timesheet. Hosts `_myrOpenHtmlFormOverlay` (Compass's form renderer), `_mwExtractAmount`, `_myrNotify`. Largest Compass file. **Drift:** file self-declares 2 days newer than loader pin — see §10. | My Work suite tab bar + sub-view loaders | B-UI-10 (CMD79) |
| `mw-team.js` | `v20260412-MT6` | My Team tab — teammate cards, roles, bio/skills/domains overlay. 30s cache. | My Team tab + bio overlay | Pre-Phase-1 |
| `mw-timesheet.js` | `v20260410` (loader) | Full Weekly Timesheet drawer, Day Briefing panel, time-entry edit form. | Weekly timesheet drawer | Pre-Phase-1 |

**Summary:** 16 of 16 documented. `mw-tabs.js` and `mw-events.js`
are the two structurally central files of Compass — `mw-tabs.js`
owns the tab suite and hosts the form renderer; `mw-events.js`
owns every workflow-request modal. Phase 1 work touched both
extensively.

---

## §5 — Cadence platform

Workflow certification + form authoring + BIST simulator + live
instance tracking. Cadence is a **peer application** to Compass,
not a subsystem of it. Templates and forms authored in Cadence
are published to shared tables (`workflow_form_definitions`,
`workflow_templates`) which Compass consumes at runtime.

**Loading pattern:** `cadence.html` is the entry point and loads
all 26 `cdn-*` modules directly at page load (not deferred like
Compass). Most scripts use bulk `?v=20260403-S9` cache-bust with
per-file overrides for recently-touched files.

**Load order discipline:** Cadence relies on global-scope
initialization sequence. 17 of 26 files have explicit
`// LOAD ORDER: Nth` comments. The 9 without are marked
`[UNKNOWN LOAD ORDER]` — some have soft-ordering notes ("after
cdn-core-state.js") but no numeric slot.

### §5.1 — Cadence tabs / surfaces

The 26 files map onto these Cadence tabs/surfaces:

- **Dashboard** — KPI strip, heatmap, trend chart, run log, template health
- **Library** — Templates tab, Coverage sub-tab, Script Editor, Form Library (+ Settings sub-tab)
- **Simulator / BIST Cockpit** — script runner, gate checks, release cockpit
- **Instances** — running-instance list, live DAG, scrubber, history cluster, swim-lane peers
- **Cross-cutting** — CoC panel, support-ticket FAB, utilities, tooltips

### §5.2 — Cadence file table

| File | Version | Load order | Purpose | Primary surface |
|------|---------|------------|---------|-----------------|
| `cdn-assignee.js` | [none] | 3rd | Person-selection for Cadence steps — resource picker, reassignment, template-default override. | Template Editor + Instances reassign panel |
| `cdn-bist.js` | `v20260407-BQ7` | 8th | BIST (Built-In Self-Test) engine — script runner, gate checks, release cockpit, cert issuance. | Library (gate dialog) + Simulator / BIST Cockpit |
| `cdn-coc.js` | [none] | 9th | Template-side Chain of Custody panel — committed history + uncommitted diffs. | Template Editor (CoC side panel) |
| `cdn-comments.js` | [none] | 13th | Step-level comment threads, replies, hours logging, action-item CRUD with attachments. | Instances (step detail — comments/action-items tab) |
| `cdn-conformance.js` | `v20260406-CF2` | [unknown] | Auto-scans completed step outcomes against certified test scripts; writes exceptions + MRB escalations. Background scanner (10 min). | Dashboard (conformance widgets) |
| `cdn-core-state.js` | [none] | **1st** | **Owns global state**, constants, step metadata, pending-change localStorage bin for all other `cdn-*` modules. | Foundational — all Cadence surfaces |
| `cdn-coverage.js` | `v20260411-CV30` | [unknown] | Coverage tab — enumerates DAG paths, matches to scripts, shows score ring, swim lanes, path list, matrix. | Library (Coverage sub-tab) |
| `cdn-dag-viewer.js` | [none] | 6th | Template-side SVG DAG with pan/zoom, step cards, branch cards, click-to-edit. | Template Editor (DAG view) |
| `cdn-dashboard.js` | `v20260411-CD58` | [unknown] | Composite dashboard — KPI strip, 365-day run heatmap, trend chart, run log, template health monitor. | Dashboard tab |
| `cdn-documents.js` | [none] | 5th | Document attachment for template steps — upload to Supabase Storage, view, delete, role assignment, docx preview. | Template Editor (step config — attached documents) |
| `cdn-events.js` | [none] | 15th | Live-sync for running instances — Supabase Realtime subscription, 15s CoC polling fallback, elapsed-timer tick. **Realtime subscription silently no-op** — see §10. | Instances tab (live detail) |
| `cdn-form-editor.js` | `v20260412-SE122` | [unknown] | **Owns Form Library tab** — PDF/docx absorb, field authoring, visibility matrix, routing, preview. ~7,254 lines (largest Cadence file). | Form Library tab |
| `cdn-form-runtime.js` | `v20260407-FRT3` | 16th | Renders fillable forms inside Cadence instance step panels; persists responses, runs gate checks, generates evidence PDFs. **Distinct from Compass's form renderer** (which is `_myrOpenHtmlFormOverlay` in `mw-tabs.js`). | Instances tab (step detail — form-fill UI) |
| `cdn-form-settings.js` | `v20260331-050000` | [unknown] | Form Library Settings sub-tab — categories CRUD, version-format choice, lifecycle reviewer/approver assignment. | Form Library (Settings sub-tab) |
| `cdn-instance-dag.js` | [none] | 16th | Live-instance DAG visualizer — node state from CoC events, rework heat map, history cluster, swim-lane peers. | Instances tab (DAG view) |
| `cdn-instances.js` | `v20260403-S9` | **17th (last)** | **Owns Instances tab** — list rendering, launch modal, detail panel, step lifecycle (start/complete/suspend/cancel). | Instances tab |
| `cdn-intel.js` | [none] | 14th | Intelligence-briefing modal for running instances — AI narrative assembly, PDF export, email export. | Instances tab (briefing modal) |
| `cdn-meeting.js` | [none] | 10th | Renders meeting-type steps in running instances; handles meeting-record creation with agenda seeding. | Instances tab (meeting-step UI) |
| `cdn-outcomes.js` | [none] | 4th | CRUD for step outcomes, confirm-items, meeting agenda entries in template editor (writes to pending bin). | Template Editor (step config) |
| `cdn-script-editor.js` | `v20260407-SE32` | [unknown] | Visual BIST script editor — drag-drop action blocks (Launch, Complete Step, Form Section, Assert, Wait), property inspector, undo/redo. | Library (Script Editor sub-surface) |
| `cdn-script-generator.js` | `v20260406-SG1` | [unknown] | DAG path enumerator — generates one BIST test script per unique routing path through a template, dedupes by path signature. | Library (invoked from Coverage tab) |
| `cdn-scrubber.js` | [none] | 11th | Timeline scrubber for running instances — replay CoC events, dot track, rework-cost panel, urgency/PERT scoring. | Instances tab (scrubber strip above DAG) |
| `cdn-step-state.js` | `v20260407-SS2` | [unknown] | Shared step-state model used by both BIST cockpit and coverage inline runner — adapter pattern over `runBistScript`. | Library (Coverage) + Simulator (BIST cockpit) |
| `cdn-support.js` | `v20260405-SUP1` | [unknown] | Platform-wide support-ticket system — FAB widget, submit modal with auto-severity, duplicate detection, queue view. | Cross-cutting — FAB visible on every Cadence tab |
| `cdn-template-editor.js` | `v20260406-D3` | 7th | **Owns Library Templates tab** — template list, spine, step CRUD, drag-drop reordering, inline config. | Library (Templates tab) |
| `cdn-tooltips.js` | [none] | 12th | Hover/dwell popups — step tooltip, instance history cluster, swim-lane sibling cluster. | Instances tab (overlays) |
| `cdn-utils.js` | [none] | **2nd** | Cross-cutting utility helpers — `escHtml`, `cadToast`, linked-task navigation, placeholder tab renderers. | Cross-cutting (all Cadence surfaces) |

### §5.3 — Cadence HTML surfaces (3, classified here per agent scope)

These were uploaded with the ProjectHUD core batch but belong to
Cadence (title-suffixed "CadenceHUD"):

| File | Purpose |
|------|---------|
| `approve.html` | Action-required page for external approval decisions via `external_step_tokens`. |
| `form-review.html` | Form review surface for reviewers via `form_review_tokens`. |
| `form-preview.html` | Form preview rendering. |

**Not fully inventoried** — these were agent-classified but not
read per the ProjectHUD-core brief scope. Future brief can fill
these in.

**Summary:** 26 `cdn-*.js` files + 3 Cadence HTML pages documented.
Operator's "around 20 `cdn-*` files" estimate was low — actual is
26. Several files (`cdn-form-editor`, `cdn-instances`,
`cdn-core-state`, `cdn-template-editor`) are structurally central.


---

## §6 — Aegis + shared services + HTML loaders

Three small categories documented together. Aegis is the
command/event-bus layer. Shared services are cross-platform
utilities. HTML loaders are the entry points that bring platforms
to life.

### §6.1 — Aegis (1 file)

| File | Version | Purpose |
|------|---------|---------|
| `cmd-center.js` | `v20260423-CMD74` | **The Aegis core.** Command registry (`Form Open`, `Wait For*`, etc.), event bus (`_cmdEmit`), Realtime-backed cross-session dispatch (Broadcast channel, not `postgres_changes`), retention buffer (30s), presence sync, session prefix routing, floating operator panel. Exposes `window.CMDCenter` public API. |

**Key exports from `cmd-center.js`:**

- `window.CMDCenter` — public API (`toggle`, `run`, `runLine`, `saveScript`, `getScripts`, `sessions()`, `aliasMap()`, `myAlias()`, `setAlias`, `resolveAlias`, `onAppEvent(cb)`, `recentEvents(n)`)
- `window._cmdEmit(eventName, data)` — emits a protocol-v0.1 envelope on broadcast channel
- `window._sendToSession(alias, cmd)` — alias-routed command dispatch
- `window._aegisSessions()` — console dump of presence-synced session table
- `COMMANDS` registry (~30 verbs) — navigation, forms, interaction, waits, script state
- Realtime channels: `hud:{firm_id}` (canonical) + `cmd-center-{firm_id}` (legacy, dual-subscribed during CMD62 cutover)
- Script storage: `localStorage` under `phud:scripts:{name}`
- Keyboard: `Ctrl+Shift+\`` toggles floating panel

### §6.2 — Shared services (4 files)

Used by Compass, Cadence, and ProjectHUD core. All load as
dependencies before the platform-specific code.

| File | Version | Purpose | Consumer scope |
|------|---------|---------|----------------|
| `coc.js` | [none] | **Chain of Custody service** — single unified audit write/read/render layer over the `coc_events` table. Replaces four legacy mechanisms (`exception_annotations`, `audit_log`, `task_journal`, `resource_request_events`). **Iron rule:** all CoC writes MUST go through `CoC.write()`; direct `API.post('coc_events', ...)` is forbidden. | Compass + Cadence |
| `notif.js` | `v1.0` | Universal notification singleton — badge management, 10s polling, toast display, inline panel, cross-user notification writes. Polls `notifications` table; falls back to RPC `create_notification` (security-definer, bypasses RLS). | All platforms |
| `signature.js` | `v20260412-SIG1` | Shared cursive signature module — converts `data-sig-role` divs into active/disabled Dancing Script inputs with auto-dated partner fields. Zero external dependencies. | Cadence Form Editor + Compass review panel + standalone form iframe |
| `supabase.js` | vendor `v2.103.2` | **Vendored `@supabase/supabase-js`** — NOT project code. REST (PostgREST), Auth (GoTrue), Realtime (Phoenix channels + Presence + Broadcast), Storage, Edge Functions client. | All platforms (via `api.js`, `auth.js`, `cmd-center.js`) |

### §6.3 — HTML loaders (5 files)

The entry points and the router/view-switcher.

| File | Purpose | Notable |
|------|---------|---------|
| `aegis.html` | Aegis operator surface — renders M1 Command / M2 Mission Control / M3 Forge modules. Loads `cmd-center.js` as sole external dependency. Sets `window._aegisMode = true`. | Aegis is a **read-only observer** of the event bus; does not dispatch commands. M4 Intel + M5 Audit stubbed as coming-soon. |
| `cadence.html` | Cadence entry point. Loads shared infra + all 27 `cdn-*` scripts + bootstrap IIFE for `window.CURRENT_USER`. Page title: `S9.10`. | `cmd-center.js` loaded transitively via `sidebar.js`, not explicitly here. |
| `compass.html` | Compass entry point. Loads shared infra + `cmd-center.js` explicitly, then dynamically fetches `/my-work.html` on first user-view activation. | Unlike Cadence, Compass loads `cmd-center.js` up-front. `mw-*` scripts deferred until user-view is requested. |
| `my-work.html` | **Dynamic view fragment** (not a full HTML document) — injected by `compass.html` into `#view-users`. Loads all 16 `mw-*` scripts with versioned `?v=` cache-bust tags. | Authoritative deployed version for each `mw-*` file is in this file's script tags. |
| `sidebar.js` | Universal sidebar renderer and router. Every ProjectHUD surface mounts this into `#sidebar`. Transitively loads `cmd-center.js` on non-Aegis pages (via dynamic script injection) so every session is visible to Aegis. | **Malformed cache-bust:** line 285 uses `?v=v2026041974` (missing hyphen) — see §10. |

**Summary:** 10 files documented. The Aegis event bus + shared
services + HTML loader layer is the **connective tissue** that
lets the four platforms coexist and interoperate.

---

## §7 — Supabase backend

The shared data layer all four platforms use. One Supabase
project; one `public` schema; 131 base tables + 13 views;
5 storage buckets; 11 Edge Functions; Realtime publication
**empty** (no tables broadcasting row changes).

**Full schema detail:** 2,844-line inventory at
`/mnt/user-data/uploads/projecthud-supabase-schema-inventory.md`.
This section summarizes by domain cluster and surfaces the key
architectural findings. For per-column, per-policy, per-FK
detail, consult the full schema inventory.

### §7.1 — RLS posture categories

Each table's RLS posture falls into one of four categories:

| Category | Meaning | Behavior |
|----------|---------|----------|
| **Firm-isolated (real)** | RLS enabled; policies use `my_firm_id()` or `current_firm_id()` helper functions. | Real multi-tenant enforcement. |
| **Hardcoded single-firm** | RLS enabled; policies use the literal firm UUID `aaaaaaaa-0001-0001-0001-000000000001`. | Effectively single-tenant. No multi-tenant safety. |
| **Open (authenticated)** | RLS enabled; policies use `USING (true)` or `auth.role() = 'authenticated'`. | Any authenticated user can access any row. |
| **RLS disabled** | `rowsecurity = false`. Any defined policies are inactive. | Access governed only by Postgres role grants — typically full access to any authenticated user. |

**35 tables have RLS disabled with policies defined.** See §10
for the list and architectural implication.

### §7.2 — Table domain clusters

The 131 tables group into these domain clusters. Counts are
approximate; some tables span multiple domains.

| Cluster | Count | Representative tables | Owning platform(s) |
|---------|-------|----------------------|--------------------|
| **Workflow / instances** | 11 | `workflow_instances`, `workflow_requests`, `workflow_step_instances`, `workflow_templates`, `workflow_template_steps`, `workflow_template_coc`, `workflow_action_items`, `workflow_form_definitions`, `workflow_form_responses`, `workflow_step_meeting_data`, `workflow_step_meeting_action_items` | Compass + Cadence (shared) |
| **Forms** | 6 | `form_templates`, `form_categories`, `form_drafts`, `form_instance_records`, `form_annotations`, `form_review_tokens` | Cadence primary |
| **BIST (Built-In Self-Test)** | 6 | `bist_runs`, `bist_suites`, `bist_test_scripts`, `bist_certificates`, `bist_coverage_paths`, `bist_fixtures` | Cadence |
| **Conformance / MRB** | 3 | `conformance_exceptions`, `mrb_cases`, `ncmrs` | Cadence |
| **Projects / tasks** | ~12 | `projects`, `project_daily_snapshots`, `tasks`, `task_assignees`, `task_assignments`, `task_resource_assignments`, `task_dependencies`, `task_deliverables`, `task_deliverable_events`, `task_performance_log`, `task_skill_requirements`, `milestones`, `health_scores` | ProjectHUD core |
| **WBS (Work Breakdown Structure)** | 7 | `wbs`, `wbs_tasks`, `wbs_disciplines`, `wbs_materials`, `wbs_templates`, `wbs_template_tasks`, `wbs_template_disciplines` | ProjectHUD core (proposal estimator) |
| **SOW (Statement of Work)** | 5 | `sow_documents`, `sow_sections`, `sow_approvals`, `sow_comments`, `sow_history` | ProjectHUD core |
| **Sales pipeline** | 8 | `prospects`, `prospect_activities`, `prospect_action_items`, `prospect_contact_links`, `prospect_findings`, `proposals`, `companies`, `stakeholders` | ProjectHUD core |
| **Contacts / external** | 4 | `contacts`, `external_contacts`, `external_response_tokens`, `external_step_tokens` | Shared |
| **Meetings** | 8 | `meetings`, `meeting_attendees`, `meeting_agenda_items`, `meeting_action_items`, `meeting_minutes`, `meeting_comments`, `meeting_decisions`, `meeting_ratings` | ProjectHUD core + Cadence (cross-platform — `workflow_step_meeting_data`) |
| **Resources / people** | 11 | `resources`, `resource_profiles`, `resource_skills`, `resource_allocations`, `resource_calendars`, `resource_domain_experience`, `resource_scorecards`, `resource_requests`, `resource_request_notifications`, `users`, `departments` | ProjectHUD core |
| **HUD Skills / roles** | 7 | `hud_roles`, `hud_role_categories`, `hud_role_levels`, `hud_skills`, `hud_skill_categories`, `hud_skill_domains`, `classifications` | ProjectHUD core (user management) |
| **Risk / concerns / action items** | ~6 | `risk_items`, `risk_register`, `concerns`, `concern_comments`, `action_items`, `action_item_comments` | ProjectHUD core |
| **Chain of Custody + audit** | 4 | `coc_events`, `workflow_template_coc`, `change_log`, `notes` | Shared (via `coc.js` service) |
| **AI / briefings** | 3 | `ai_org_briefings`, `morning_briefs` (inferred), `compass_awards` | ProjectHUD core / Compass |
| **Tenant config** | 4 | `firms`, `firm_modules`, `tenant_settings` (inferred), `approval_thresholds` | Shared |
| **Supporting** | ~15 | `notifications`, `calendar_events`, `discussion_threads`, `discussion_topics`, `documents`, `expenditures`, `invoices`, `invoice_line_items`, `journal_replies`, `notes_workspace`, `video_clips`, `user_project_access`, `activity_participants`, `health_scores` | Various |

### §7.3 — Storage buckets (5)

| Bucket | Access | Size limit | Purpose |
|--------|--------|------------|---------|
| `attachments` | Private (anon+auth SELECT/INSERT; auth UPDATE/DELETE) | 20 MB | General file attachments — messages, forms, issue reports, step comments |
| `avatars` | **Public** SELECT; auth INSERT/UPDATE | 50 MB (default) | User/firm avatars and logos |
| `thumbnails` | Private (auth only) | 50 MB (default) | Auto-generated thumbnails from source files |
| `video-library` | Private (auth SELECT/INSERT only; **no UPDATE/DELETE**) | 50 MB (default) | Video clip storage (`video_clips` table) — append-only from user perspective |
| `workflow-documents` | Private (auth full CRUD; **no firm-scoping**) | 50 MB (default) | Documents attached to workflow instances, evidence PDFs |

**CORS configuration:** [NOT KNOWN] — not captured in inventory
pass. Visible in Supabase Dashboard → Project Settings → API.

### §7.4 — Edge Functions (11)

| Function | Auth | Purpose |
|----------|------|---------|
| `ai-briefing` | Anonymous-callable | Streaming LLM proxy to Anthropic API for `ai_org_briefings` and `morning_briefs` generation |
| `ai-form-vision` | **`--no-verify-jwt`** | Vision-model proxy for form field extraction / OCR |
| `create-user` | Service-role | Admin creation of Supabase Auth users + `public.users` row |
| `update-user` | Service-role | Admin updates user email/password (min 8 chars) |
| `delete-user` | Service-role | Admin deletion of auth user + `public.users` row; self-deletion guard |
| `notify-form-review` | **`--no-verify-jwt`** | Mints `form_review_tokens`, sends Resend email with tokenized review link |
| `notify-step-activated` | [depends on deploy] | Sends workflow-step assignment email via Resend when step activates |
| `process-form-decision` | **`--no-verify-jwt`** | Companion to `notify-form-review` — processes approve/reject decisions. **Writes to non-existent tables** (`chain_of_custody`, `workflow_instance_steps`) — see §10 |
| `respond-step` | Token-based | External respondent endpoint — validates `external_step_tokens`, records completion, runs routing engine |
| `dynamic-function` | [default] | **Unimplemented** — Hello World template despite 10 deployments. See §10 |
| `hyper-task` | [default] | **Unimplemented** — Hello World template despite 7 deployments. See §10 |

### §7.5 — Realtime

**No tables published to Realtime.** `pg_publication_tables` for
`supabase_realtime` returns empty.

**Implication:** Any frontend code subscribing to `postgres_changes`
is silently no-op. Agent flagged `cdn-events.js` as the likely
site — it opens a WebSocket "for live sync" but the 15s polling
fallback (`_pollCoCForChanges`) is doing all the actual work.

**This is intentional architecturally.** Aegis uses Supabase
Realtime's **Broadcast channel** feature (`hud:{firm_id}`) —
different mechanism from `postgres_changes`. Broadcast carries
user-intent events (approvals, submissions, withdrawals) with
rich payloads; `postgres_changes` would only convey raw row diffs.
For the command/audit bus, Broadcast is the right choice. See
Iron Rule 35 ratification for why emit-based eventing is the
architecture.

**Cleanup candidate:** `cdn-events.js`'s no-op `postgres_changes`
subscription should either be enabled at the DB level (if
intended) or removed (if dead). This is Phase 2 backlog, not
blocking.


---

## §8 — Cross-platform contracts

Specific integration seams between the four platforms. These are
the places where platforms touch each other — the contracts that
let the ecosystem function as a whole.

### §8.1 — Meeting integration (ProjectHUD core ↔ Cadence)

- **`meetings.js`** (`MeetingCard` component) is used by both `prospect-detail.html` (ProjectHUD core) and `cadence.html` workflow steps. Header comment confirms cross-platform use.
- **`meeting-minutes.html`** has a workflow-mode activated by `workflow_instance_id` + `step_id` URL params. When in that mode, it calls `Sidebar.init('cadence')` instead of `'pipeline'`.
- **`cdn-meeting.js`** renders meeting-type steps in running instances and creates `meetings` rows with agenda seeding from the Cadence side.
- **Shared tables:** `meetings`, `meeting_attendees`, `meeting_agenda_items`, `meeting_action_items`, `workflow_step_meeting_data`, `workflow_step_meeting_action_items`.

### §8.2 — Form integration (Cadence → Compass)

- Forms are authored in **Cadence Form Library** (`cdn-form-editor.js`) and published to `workflow_form_definitions.source_html`.
- Compass reads `source_html` at runtime via **`_myrOpenHtmlFormOverlay`** in `mw-tabs.js`, wraps in a blob URL, injects into an iframe.
- **B-UI-10 (CMD79)** added `compass_form_ready` bootstrap injection at the Compass render time, preserving Cadence-Compass clean separation.
- **Two distinct form renderers exist:**
  - Cadence's own: `cdn-form-runtime.js` (Instances tab step detail)
  - Compass's: `_myrOpenHtmlFormOverlay` in `mw-tabs.js` (MY REQUESTS overlay)
- `signature.js` shared module works in both render paths plus standalone overlays.

### §8.3 — Workflow template authoring (Cadence) → runtime execution (Compass)

- Templates authored in Cadence `cdn-template-editor.js` (Library Templates tab).
- Published to `workflow_templates` + `workflow_template_steps` + `workflow_template_coc`.
- Compass reads these at instance launch via form submission (`mw-tabs.js` → `workflow_instances.INSERT`).
- Step advancement flows through `_rrpSubmit` in `mw-events.js` (writing `workflow_requests` + emitting events).
- Instance.completed emits from terminal PATCH on `workflow_instances`.

### §8.4 — Event bus (Aegis) — spans all platforms

- `cmd-center.js` loaded on every ProjectHUD surface (explicitly in `compass.html` and `aegis.html`; transitively via `sidebar.js` on all other pages).
- **Event envelope (protocol v0.1):** `{event_id, event_type, source_product, source_session, ts, firm_id, payload}` on broadcast channel `hud:{firm_id}`.
- **~30 command verbs** in the registry — navigation, forms, interaction, typed waits, script state.
- **Retention buffer** (30 seconds in memory) — accessible via `CMDCenter.recentEvents(n)`.
- **Presence sync** lists all active sessions across the firm.
- Aegis is a **read-only observer**; does not dispatch commands.

### §8.5 — Chain of Custody (shared)

- `coc.js` is the single write-path to the `coc_events` table.
- **Iron rule** (from `coc.js` header): "all CoC writes MUST go through `CoC.write()`; direct `API.post('coc_events', ...)` is forbidden."
- Event class taxonomy: `exception`, `audit`, `progress`, `request`, `workflow`, `task`, `calendar`, `timesheet`.
- Replaces four legacy mechanisms: `exception_annotations`, `audit_log`, `task_journal`, `resource_request_events`.
- `cdn-coc.js` (template-side CoC panel) reads `workflow_template_coc` for template history.

### §8.6 — Module gating (firm-level feature flags)

- **`firm-modules.js`** + `firm_modules` table control which platforms a given firm sees.
- Module universe: `project` (ProjectHUD core), `cadence` (Cadence platform), `compliance` (placeholder).
- Gating mechanism: DOM elements marked `[data-module]` get walked and toggled per `HUD.Modules.has(moduleName)`.
- Sidebar nav items for Cadence show/hide based on module gating.
- `PHUD.MODULES` in `config.js` is the static default; `firm_modules` is the runtime override.

### §8.7 — Authentication and identity (shared)

- `auth.js` owns JWT management (localStorage `sb-*-auth-token`, 30s refresh buffer).
- `api.js` wraps all Supabase REST calls with 401-retry via fresh token.
- Every authenticated page runs the identity-resolution bootstrap: `Auth.getSession()` → decode JWT → lookup `resources` row by `user_id` → set `window.CURRENT_USER` (Cadence) or `_myResource` (Compass).
- Hardcoded Supabase URL + anon key in: `config.js` (primary), `auth.js` (fallback), `login.html` (inline), `recorder-window.html` (inline). **Four locations** — see §10.

---

## §9 — Gaps and follow-up items

What this inventory does NOT cover, and what needs subsequent
passes. Listed by priority.

### §9.1 — Files/pages referenced but not uploaded

ProjectHUD core sidebar nav references 7 HTML pages that were
not included in the inventory upload:

- `/meetings.html`
- `/documents.html`
- `/risks.html` (may be an alias for `/risk-register.html`)
- `/stakeholders.html`
- `/action-items.html` (distinct from the `action-items.js` module)
- `/audit-log.html`
- `/video-library.html` (renders `video_clips` table data)
- `/favicon.svg` (asset)

**Action:** Operator uploads these in a follow-up pass; an
inventory agent fills in stubs for each.

### §9.2 — Ambiguous `/api/*` classification

Three serverless files (`ai.js`, `generate-form.js`, `scripts.js`)
are currently classified under ProjectHUD core but may belong to
Cadence. No uploaded ProjectHUD HTML page references these
endpoints. Likely callers:

- `/api/ai-draft` (ai.js): unknown caller — may be Cadence AI features or unused
- `/api/generate-form` (generate-form.js): likely Cadence form authoring (AI-generated form schemas)
- `/api/scripts` (scripts.js): likely Cadence script-library picker

**Action:** Operator confirms caller identity; reclassify if
Cadence-owned.

### §9.3 — Schema details not captured

1. **RLS helper function definitions.** Policies use `my_firm_id()`, `current_firm_id()`, `my_project_ids()`, `is_client()`, `is_admin()` pervasively. Source SQL not captured.
2. **Postgres enum type values.** Columns typed `USER-DEFINED` are enum-backed; enums without matching CHECK constraints have unknown valid values. Affected tables include `action_items.status`, `action_items.priority`, `change_log.status`, `change_log.change_type`, `invoices.status`, `tasks.status`, `meetings.status`, `meetings.meeting_type`, and ~15 others.
3. **CORS configuration** for storage buckets (Supabase Dashboard → Project Settings → API).
4. **Supabase Auth configuration** — which providers, JWT claims, etc.

**Action:** Follow-up SQL queries provided in the full schema
inventory's §Gaps section.

### §9.4 — Cadence HTML surfaces not deeply inventoried

Three HTML files (`approve.html`, `form-review.html`,
`form-preview.html`) were classified as Cadence but not
inventoried beyond file name + title. These represent the
external-respondent and reviewer surfaces.

**Action:** A Cadence-HTML-surfaces follow-up brief (estimated
30 min) could complete these stubs.

### §9.5 — Other inventory gaps

- `bist_fixtures.storage_path` points into a storage bucket, but no bucket among the five inventoried is obviously dedicated to fixtures. Possibilities: stored in `attachments`, stored in a bucket not listed.
- **Two parallel external-token systems** coexist: `external_response_tokens` and `external_step_tokens`. Only the latter is used by `respond-step` — the former may be legacy.
- **Three parallel task-assignment tables** coexist: `task_assignments`, `task_assignees`, `task_resource_assignments`. Which is canonical is unclear.

---

## §10 — Drift findings

Architectural signals surfaced during inventory. These are
**observations only** — they don't block Atlas synthesis. They
document state of the codebase as of 2026-04-24 and may inform
future briefs.

Listed by severity.

### §10.1 — P1: `cmd-center.js` three-doors cache-bust

`cmd-center.js` is loaded from **three different sources with
three different cache-bust tags**, each producing a potentially
different cached copy:

| Load site | Cache-bust tag | Notes |
|-----------|----------------|-------|
| `compass.html` (explicit script tag) | `?v=v20260423-CMD74` | Matches the uploaded file banner. |
| `aegis.html` (explicit script tag) | `?v=v20260419-CMD74` | 4 days behind the file banner. |
| `sidebar.js` (line 285, transitive injection for non-Aegis pages) | `?v=v2026041974` | **Malformed** — missing hyphen, runs date and CMD suffix together. |

**Cadence (among other pages) gets the sidebar-transitive load**
since `cadence.html` has no explicit `cmd-center.js` script tag.
Effect: the same session runs potentially-three different cached
copies of `cmd-center.js` depending on which page loaded it.

**Reconcile before Atlas §7.1 deployment section is written.**

### §10.2 — P2: RLS disabled on 35 tables with policies defined

The single most significant architectural finding from the schema
inventory. Tables with `rowsecurity = false` but defined policies
— the policies are inactive.

**Affected (partial list):** `meetings` and the full meeting
family; `prospects` and the full prospect family; `proposals`;
`sow_documents` and all SOW tables; `wbs_tasks` and all WBS
tables; `workflow_instances`, `workflow_templates`; `companies`,
`contacts`, `resources`, `users`, `firms`; `notes` family;
`milestones`, `risk_items`, `health_scores`, `coc_events`;
`mrb_cases`, `ncmrs`; all six `bist_*` analytics tables.

On each, any policies visible in `pg_policies` are inactive.
Whether this is intentional (server-side gating doing the work)
or a security gap is for the Architect / operator to judge;
inventory documents state, not judgment.

### §10.3 — P2: `mw-tabs.js` banner vs loader drift

| Source | Version |
|--------|---------|
| `mw-tabs.js` in-file banner (line 5) | `v20260424-CMD79` |
| `my-work.html` loader pin | `v20260422-CMD79` |

File self-declares 2 days newer than what's deployed. This is
Forge dev-bench's known surface — worth confirming whether the
in-file banner was updated locally but the loader ship hasn't
happened, or vice versa.

### §10.4 — P3: Realtime publishes no tables

`pg_publication_tables` for `supabase_realtime` returns empty.
Frontend code subscribing to `postgres_changes` is silently no-op.

**Likely affected code:** `cdn-events.js` opens a WebSocket for
live sync on running instances; the 15s polling fallback
(`_pollCoCForChanges`) is doing all the actual work.

**Not a bug in the architecture** — Aegis uses Broadcast channels
(not postgres_changes), which is the right choice for a
command/audit bus. But dead subscription code in `cdn-events.js`
should either be enabled at the DB level or removed.

### §10.5 — P3: Hardcoded single-firm RLS

~12 tables use the literal firm UUID
`aaaaaaaa-0001-0001-0001-000000000001` in their RLS policies
(rather than calling `my_firm_id()`). These tables effectively
have no multi-tenant enforcement.

Likely intentional for a single-tenant deployment
(`tenant_settings.deployment_mode = 'internal_only'`). Worth
confirming vs. being a mis-migration from a single-tenant
prototype.

### §10.6 — P3: `process-form-decision` writes to non-existent tables

Writes to `chain_of_custody` (schema has `coc_events` and
`workflow_template_coc`, not this name) and
`workflow_instance_steps` (schema has `workflow_step_instances`,
not this name). Both writes use `.catch(() => {})` — fail
silently.

Either the table names are wrong, the migration was reverted, or
these are planned tables never created.

### §10.7 — P3: `dynamic-function` and `hyper-task` Edge Functions unimplemented

Both are Supabase Hello World templates despite `dynamic-function`
having 10 deployments and `hyper-task` having 7 deployments.
Either unimplemented, placeholders, or reverted implementations.

### §10.8 — P3: Overly broad DELETE policies

`action_items` and `tasks` both have policies
(`allow authenticated delete action_items`, `auth_delete_tasks`)
granting DELETE to any authenticated user with `USING (true)` —
bypassing firm scoping. Likely unintentional.

### §10.9 — P4: Hardcoded Supabase credentials in 4 locations

Same Supabase URL + anon key hardcoded in:

- `config.js` (primary — intentional centralization)
- `auth.js` (duplicated as fallback inside `getFreshToken()`)
- `login.html` (inline `<script>`)
- `recorder-window.html` (inline)

Observation only — the anon key is not a secret, but having four
sources of truth for it is a coordination risk if it ever needs
to rotate.

### §10.10 — P4: Cadence load order partial discipline

17 of 26 Cadence files have explicit `// LOAD ORDER: Nth`
comments. 9 don't — some with soft-ordering notes ("after
cdn-core-state.js") but no numeric slot. Files without explicit
load-order: `cdn-conformance`, `cdn-coverage`, `cdn-dashboard`,
`cdn-form-editor`, `cdn-form-settings`, `cdn-script-editor`,
`cdn-script-generator`, `cdn-step-state`, `cdn-support`.

Not a bug (the platform loads correctly) but a consistency gap.

### §10.11 — P4: `cdn_utils.js` (underscore) vs `cdn-utils.js` (hyphen)

Duplicate upload. Underscore version is an older copy still
containing a stub `renderFormsTab` since migrated into
`cdn-form-editor.js`. The canonical file is `cdn-utils.js` (hyphen).

### §10.12 — P4: ProjectHUD core has no cache-bust

Unlike Compass and Cadence, no `?v=` cache-bust on any ProjectHUD
core script tag. Version is centralized as `PHUD.VERSION` in
`config.js`. Three JS modules have banner versions
(`hud-recorder.js v4`, `journal-replies.js v4`, `sidebar.js v3.1`).

Not a defect — a different deployment philosophy. Documented here
so Atlas §7.1 reflects it accurately.

---

## §11 — Metadata

- **Total files inventoried:** 83 (31 ProjectHUD core + 16 Compass + 26 Cadence + 10 Aegis/shared/loaders)
- **Total schema objects inventoried:** 131 tables + 13 views + 5 storage buckets + 11 Edge Functions = 160 backend objects
- **Coverage estimate:** 95%+ of known code; 100% of known schema (as of 2026-04-24)
- **Remaining gaps:** 7 HTML pages (§9.1), 3 Cadence HTML surfaces (§9.4), enum values + RLS helper definitions + CORS (§9.3)

**Source documents (all under `/mnt/user-data/uploads/`):**

- `projecthud-core-inventory.md` (31 files)
- `compass-inventory-v1_0.md` (16 files)
- `cadence-inventory.md` (26 files)
- `aegis-shared-loaders-inventory-v1.md` (10 files)
- `projecthud-supabase-schema-inventory.md` (2,844 lines — keep as reference for per-table detail)

**Briefs that drove the five inventory passes (all under
`/mnt/user-data/outputs/`):**

- `brief-projecthud-core-inventory-v1_0.md`
- `brief-compass-inventory-v1_0.md`
- `brief-cadence-inventory-v1_0.md`
- `brief-aegis-shared-loaders-inventory-v1_0.md`
- `brief-supabase-schema-inventory-v1_0.md`
- `kickoffs-inventory-briefs.md` (all five kickoffs)

---

## §12 — Update protocol

**When architect touches a file in a brief:**

1. Find the entry in the relevant section
2. Update "Last touched" with the brief reference (e.g., "B-UI-9
   v2.0 Part B (CMD78g)")
3. Update the deployed version if it changed
4. Expand or correct the one-line description if more is now known

**When operator notices an unlisted file:**

1. Add a stub entry under the appropriate platform section with
   as much detail as is known
2. Note in the handoff for the next session

**When a file's purpose changes:**

1. Architect updates the description in the next brief that
   touches it
2. Note the change in the brief's handoff append

**When a gap is closed (file uploaded, enum value discovered,
etc.):**

1. Remove the item from §9 or §10
2. Add the new content to the appropriate section
3. If material, note in the handoff

**When Atlas synthesis uncovers an inventory error:**

1. Fix in place
2. Increment the Last revised date
3. Note in the Atlas session's handoff

---

*End of File Inventory v2.0. Living document — update
incrementally; never let it become stale. Goal: maintain 95%+
coverage as the ecosystem evolves.*
