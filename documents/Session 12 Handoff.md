# Compass — Session 12 Handoff
**Apex Consulting Group · Confidential**
*March 24, 2026*

---

## System Identity

| Property | Value |
|----------|-------|
| Platform name | **Compass** |
| App URL | https://project-hud-landing.vercel.app/cadence.html |
| Canonical domain | projecthud.com |
| Core workflow app | `cadence.html` — single-file, all HTML/CSS/JS |
| Supabase URL | `https://dvbetgdzksatcgdfftbs.supabase.co` |
| Firm ID | `aaaaaaaa-0001-0001-0001-000000000001` |
| Git repo | https://github.com/vstaples/projectHUD-landing.git |
| Deployment | GitHub push → Vercel auto-deploy |
| Edge Function | `ai-briefing` at `${SUPA_URL}/functions/v1/ai-briefing` |
| AI Model | `claude-sonnet-4-6` via Supabase Edge Function proxy |

---

## Key Personnel

| Name | Resource ID | Email |
|------|-------------|-------|
| Vaughn W. Staples (internal) | e1000001-0000-0000-0000-000000000001 | vstaples@projecthud.com |
| Vaughn W. Staples (external) | 0402921d-9e87-4a02-a6aa-c5f754a77023 | vstaples64@gmail.com |

---

## Platform Architecture

```
Compass · Pipeline     pipeline.html, prospect-detail.html,
                       proposal-detail.html, meeting-minutes.html

Compass · Core         dashboard.html, projects.html,
                       project-detail.html, users.html,
                       resources.html, resource-requests.html,
                       risk-register.html, cpm-pert.html

Compass · Cadence      cadence.html (554KB single file)

Compass · Timesheet    [to be built — Session 12+]

Shared infrastructure  config.js, auth.js, api.js, ui.js,
                       ticker.js, sidebar.js, project-drawer.js,
                       hud-recorder.js
```

---

## Session 12 Context — What Was Designed

Session 12 was a comprehensive design and architecture session. No new code was written. The following surfaces were fully designed and mockuped:

### Role-Based Views (all new)

**User View (Individual Contributor)**
- Unified work surface: workflow steps + project tasks + action items in one list
- M T W Th F day buttons with colored confidence dots per day
- Completion micro-panel: hours (pre-populated from elapsed time), signal (G/Y/R), note
- Skip option always available — skip rate is itself an intelligence signal
- Weekly bar chart with hover popup → editable time entries per day
- Amendment reason field for post-submission edits (audit trail)
- Done Today accumulation list — the endorphin layer
- Streak counter and weekly completion count

**PM View (Project Manager)**
- Portfolio landing page: urgency-ordered project cards with M T W Th F day buttons
- Red flag rail: escapes project boundary, pins until acknowledged
- Portfolio feed: live, color-tiered (red/amber/green/blue), every entry clickable
- Per-project expanded detail: Requires Action / Trending to Risk / Today's Activity
- Single project view tabs: Overview, People, Timesheet (4:30 PM view), Morning Briefs, Decision Log
- Intervention Record tab: corrective actions → measured outcomes → escalation threshold
- Escalation brief: auto-assembled from intervention record, three response options
- Brief archive: timeline scrubber, immutable snapshots, PM annotation layer
- Decision Log: typed decisions (Resource/Schedule/Priority/Risk/Escalation), immutable, CoC-linked

**Management View**
- Portfolio health grid: projects × dimensions (Schedule/Cost/Confidence/Rework/Timesheets/Escalation)
- Approval queue: resource requests + timesheet submissions unified, system recommendations
- People tab: firm-wide confidence arcs, allocation conflict detector, cross-project rework, pairing intelligence
- Workflows tab (renamed from Templates): aggregate own-failure rates, redesign recommendations, ROI analysis
- Decision log: management-tier decisions (Resource/Process/Budget/Escalation)
- Brief archive: management tier, weekly cadence
- Pairing intelligence: (assignee, approver) rejection rate cross-instance analysis

**Executive View**
- Six KPI cards: Revenue, Gross Margin, Rework Cost, Utilization, On-time Delivery, Pipeline Value
- All cards clickable for drill-down modal with AI narrative
- Tabs: Overview, Financial, Delivery, Rework Cost, Pipeline, Brief Archive
- Rework cost by project + root cause classification (Process Quality/Dependency/Novel Work)
- Four-quarter rework trend chart
- Template redesign ROI calculator with authorize button
- Brief archive: weekly cadence, immutable, searchable
- "When did we first know?" pattern — archive proves system identified issues before they became crises

### New Capabilities Designed

**Intervention Record**
```
Data model: interventions table
  id, firm_id, project_id, instance_id (optional)
  trigger_signal_type, trigger_signal_ref
  action_type: resource_reassignment | meeting_convened |
               action_item_created | template_redesign |
               escalation | process_change | external_intervention
  action_description, expected_effect
  measurement_window_hours
  outcome: pending | positive | negative
  outcome_measured_at, outcome_notes
  created_at, created_by
  escalation_recommended (bool, system-set after 2 negative outcomes)
```

**Escalation Brief**
- Auto-assembled from intervention record
- Three manager response options: Handle directly / Send guidance to PM / Escalate further
- Each response writes a management-tier intervention record
- Full chain: PM signal → PM interventions → escalation brief → management response → CoC

**Materials Intelligence Layer (designed, not built)**
```
New tables needed:
  material_line_items: id, project_id, proposal_id, name, budgeted_cost,
                       actual_cost, supplier, ordered_at, eta, received_at,
                       status: planned|ordered|in_transit|received|approved
  material_rework_events: id, material_line_id, reason, original_cost,
                          reorder_cost, created_at
```
- Procurement status tracker per material line item
- Proactive blocking signal: "Step X requires Material Y — status: ordered, ETA Mar 28"
- Material rework cost flows into executive rework cost calculation
- Materials budget vs actuals timeline overlay

**Scrubber Extensions (designed, not built)**
- Management level: portfolio health grid becomes time-aware, week scrubber animates the grid
- Cross-person comparison at same point in time
- Executive level: weekly scrubber, KPI cards update per week, financial timeline overlay
- Delta display at every scrubber position: what changed between two points

**Three-Tier Morning Brief (designed, not built)**
```
New table: morning_briefs
  id, firm_id, resource_id, role_tier: pm|manager|executive
  brief_date, content_json, generated_at, is_archived
  delta_from_prior (json: resolved/new/escalated items)
```
- PM tier: tactical — blocks, red flags, overdue action items
- Manager tier: strategic — pattern detection, approval queue, escalation responses needed
- Executive tier: financial — rework cost, margin analysis, one recommended decision
- All tiers: archived permanently, immutable, PM/manager/executive annotation layer
- Delta summary at top of each brief: what changed since prior brief

**Estimation Intelligence Layer (designed, not built)**
- Post-instance analysis: planned vs actual hours per role per template
- Rework coefficient per template: actual duration / planned duration ratio
- Feeds WBS estimator with historical actuals when creating new proposals
- Systematic estimation error correction over time

---

## Session 12 Priority List

| # | Feature | Type | Notes |
|---|---------|------|-------|
| 1 | **Rejection Context Threading** | Cadence feature | Rejection note travels to destination step as pinned read-only context card |
| 2 | **Briefing Prompt Tightening** | AI refinement | Hard bullet length caps, no KPI tile restatement, conclusion-first enforcement |
| 3 | **Direct Action Item from Step** | Cadence feature | `+ Add Action Item` without requiring a comment first |
| 4 | **Workflow-to-Task Formal Binding** | Architecture | Task status driven by workflow instance status; launch from task row |
| 5 | **TimesheetHUD — Unified time_entries** | New table | Normalize hours across step_comments, task actuals, action items |
| 6 | **User Home Screen** | New page | My Work list, week bar chart, Done Today, completion micro-panel |
| 7 | **Completion Micro-Panel** | UI component | Unified hours/signal/note capture on all work object completions |
| 8 | **PM Portfolio View** | Enhancement | M-T-W-Th-F day buttons, red flag rail, portfolio feed with clickable entries |
| 9 | **Intervention Record** | New feature | Full data model + UI per design above |
| 10 | **Morning Brief — PM Tier** | New feature | AI-generated, auto-delivered, archived |
| 11 | **Materials Intelligence** | New feature | Procurement status, blocking signals, material rework cost |
| 12 | **Management View** | New page | Health grid, approval queue, people intelligence, workflows tab |
| 13 | **Morning Brief — Manager Tier** | New feature | Pattern detection, escalation queue, strategic synthesis |
| 14 | **Executive View** | New page | Financial lens, rework ROI, four-quarter trends |
| 15 | **Morning Brief — Executive Tier** | New feature | Financial synthesis, one recommended decision |
| 16 | **Scrubber Extensions** | Enhancement | Management and executive level timeline navigation |
| 17 | **Estimation Intelligence** | New feature | Historical actuals feeding WBS estimator |
| 18 | **Confidence Predictor** | AI feature | N-instance pattern → rejection probability forecast |
| 19 | **External Stakeholder Portal** | New product | Mobile-optimized response surface for non-system users |
| 20 | **Knowledge Base** | New feature | Firm-wide synthesis of institutional learning across CoC |

---

## Cadence.html — Current State (End of Session 11)

### Key State Variables

```javascript
// Swimlane
let _swimlaneActive    = false;
let _swimlanePopup     = null;
let _swimlaneHideTimer = null;
let _swimlaneDwellTimer = null;
let _swimlaneDwellRow  = null;
let _swimlaneClusters  = [];

// Rework History
let _historyActive     = false;
let _historyClusters   = [];
let _historyPopup      = null;
let _historyHideTimer  = null;
let _hxHighlightStep   = null;
let _hxHighlightTimer  = null;
let _hxCardDwellTimer  = null;

// Confidence dots
let _confDots          = [];
let _confTooltipEl     = null;
let _confTooltipTimer  = null;
```

### Canvas Layer Order (renderInstanceDAG)

All drawn inside `ctx.save()` / `ctx.restore()` with translate+scale:

1. Connector lines
2. Rejection arcs (dashed red, `arcDepth = 50 + i*12`)
3. Instance pills
4. Node shadows
5. Node bodies + text + state indicators
6. Sequence numbers
7. Confidence dots (bottom-left corner, stored in `_confDots[]`)
8. Rework badges (inside node, bottom-right)
9. Active step pulse ring
10. History highlight ring (`_hxHighlightStep`)
11. Swimlane dot clusters (top-right corner)
12. History heat badges (outside lower-left, `bx = p.x`, `by = p.y + NH + 6`)

### DAG Layout Constants

```javascript
const NW = 152;     // node width
const NH = 68;      // node height
const HGAP = 72;    // horizontal gap
const PAD_L = 56;   // left padding
const PAD_R = 56;   // right padding
const OWNER_H = 22; // owner strip height
const NODE_Y = 50 + OWNER_H;
```

### Heat Colors

```javascript
const HEAT_COLORS = {
  low:      { fill:'rgba(95,120,200,.2)',  stroke:'#5f78c8', text:'#9aaeee' },
  moderate: { fill:'rgba(140,80,200,.2)',  stroke:'#8c50c8', text:'#c490f0' },
  high:     { fill:'rgba(180,50,220,.25)', stroke:'#b432dc', text:'#d86ef5' },
};
```

### Step Types and Default Outcomes

Step types: `trigger`, `approval`, `review`, `signoff`, `action`, `external`, `form`, `branch`, `wait`, `confirmation`, `meeting`

Outcome flags: `requiresReset`, `requiresSuspend`, `holdsForActions`, `isPartial`, `isDefault`

---

## Database Schema — Key Tables

```sql
-- workflow_instances
id, firm_id, template_id, title, status, launched_at,
briefing_narrative, briefing_generated_at,
current_step_id, current_step_name, current_step_type

-- workflow_step_instances (Chain of Custody)
id, instance_id, template_step_id, event_type, outcome,
event_notes, created_at, author_id, author_name,
hours_logged, confidence, step_name

-- step_comments
id, instance_id, template_step_id, body, confidence,
author_name, created_at, is_deleted, parent_id

-- workflow_action_items
id, instance_id, template_step_id, title, owner_id,
due_date, status, attachments (jsonb)

-- New tables needed (Session 12+):
-- interventions (see above)
-- morning_briefs (see above)
-- material_line_items (see above)
-- material_rework_events (see above)
-- time_entries (unified timesheet)
-- timesheet_weeks (submission container)
```

---

## Naming Convention — The HUD Family

| Product | Full Name | Purpose |
|---------|-----------|---------|
| **Compass** | Compass | Platform brand — the whole system |
| **Cadence** | Compass · Cadence | Workflow intelligence (cadence.html) |
| **Pipeline** | Compass · Pipeline | Business development intelligence |
| **Timesheet** | Compass · Timesheet | Time and people intelligence |
| **Core** | Compass · Core | Project management foundation |

The individual HUD names (CadenceHUD, PipelineHUD) may be retained in internal technical documentation but external marketing uses the Compass · [Capability] convention.

---

## Working Rules (Non-Negotiable)

1. Never make changes without reading relevant code first
2. Always validate after every JS edit: `node --input-type=module`
3. Mirror working patterns exactly — check how similar features are implemented before writing new ones
4. Deploy: `cp /home/claude/cadence.html /mnt/user-data/outputs/cadence.html`
5. After 3+ failed attempts: stop and ask for DevTools console output
6. Architecture discussions → generate `.md` + `.pdf` before implementation
7. `API` object in `/js/api.js` — methods: `.get()`, `.post()`, `.patch()`, `.del()`
8. `API.post()` return value unreliable — always pre-generate UUID with `crypto.randomUUID()`
9. `showIntelBriefing(instId)` delegates to `_showIntelBriefingModal(inst)` after data fetch
10. `_swimlaneClusters`, `_historyClusters`, `_confDots` reset each render frame
11. `_viewMode` on instance not set until `setInstViewMode()` called
12. Canvas coordinate system: always draw inside `ctx.save()/translate/scale ... ctx.restore()`
13. Swimlane and History are mutually exclusive
14. `startStep` patches `current_step_id` on every activation
15. Widget rendering: if a mockup exceeds ~400 lines of HTML/JS, split into two widgets to prevent iframe timeout
16. Role views are additive — never remove PM/admin capability when building user views
17. The CoC is immutable — never delete or modify existing events, only append
18. Morning briefs are immutable once generated — PM/manager/executive annotations are additive only

---

## Transcript References

| Session | File |
|---------|------|
| Session 8a (design) | `/mnt/transcripts/2026-03-23-04-17-30-cadencehud-session8-dev.txt` |
| Session 8b (build) | `/mnt/transcripts/2026-03-23-05-56-31-cadencehud-session8-dev.txt` |
| Session 9 | `/mnt/transcripts/2026-03-23-11-44-16-cadencehud-session9-dev.txt` |
| Session 10 | `/mnt/transcripts/2026-03-23-14-12-27-cadencehud-session10-dev.txt` |
| Session 11 | (transcript written at end of session 11) |
| Session 12 | (this session — transcript to be written at close) |
| Journal | `/mnt/transcripts/journal.txt` |

---

*Compass · Apex Consulting Group · Confidential · Session 12 · March 24, 2026*
