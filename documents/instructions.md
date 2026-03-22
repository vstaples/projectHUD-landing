# CadenceHUD — Master Development Instructions

> Last updated: Session 7 · March 23, 2026
> These instructions are the authoritative reference for every new chat session.
> Copy this file in full as the opening prompt of each new session.

---

## SYSTEM IDENTITY

**CadenceHUD** is a workflow engine deployed at `https://project-hud-landing.vercel.app/cadence.html`
- Single file: `cadence.html` — contains all HTML, CSS, and JavaScript
- Backend: Supabase at `dvbetgdzksatcgdfftbs.supabase.co`
- Firm ID: `aaaaaaaa-0001-0001-0001-000000000001`
- Git repo: `https://github.com/vstaples/projectHUD-landing.git`
- Deployment: Manual — upload `cadence.html` to Vercel after each session

---

## KEY PERSONNEL

| Name | Resource ID | Email |
|------|-------------|-------|
| Vaughn W. Staples (internal) | e1000001-0000-0000-0000-000000000001 | vstaples@projecthud.com |
| Vaughn W. Staples (external) | 0402921d-9e87-4a02-a6aa-c5f754a77023 | vstaples64@gmail.com |
| Chris Staples | e1000001-0000-0000-0000-000000000002 | cstaples@projecthud.com |
| Carlos Reyes | d7c410ef-c9e5-44fd-bd2d-9b4fcaf61e2c | c.reyes@apex.com |

---

## WORKING RULES — NON-NEGOTIABLE

1. **Never make changes without reading the relevant code first.** Always use the view tool to read exact lines before any str_replace. Never guess at content.

2. **Always validate after every change.** Run the brace-balance check after every JavaScript edit:
   ```
   node --input-type=module -e "import {readFileSync} from 'fs'; const h=readFileSync('/home/claude/cadence.html','utf8'); const s=h.substring(h.indexOf('<script>'),h.lastIndexOf('</script>')); let d=0; for(const c of s){if(c==='{')d++;if(c==='}')d--;} console.log(d===0?'✓ OK':'✗ '+d);"
   ```

3. **Mirror working patterns exactly.** When building a new feature that resembles an existing one, study the working version first and mirror its exact structure. Do not invent new patterns when a working one exists.

4. **CSS classes over inline styles for flex chains.** Height/overflow constraints that need to propagate through the DOM must use CSS classes defined in `<style>`, not inline styles set via innerHTML.

5. **Never use getBoundingClientRect for canvas sizing.** Always use `offsetWidth` / `offsetHeight`.

6. **State variables declared before functions that reference them.** `let` declarations are not hoisted — declaring them after the function causes silent temporal dead zone failures.

7. **Deploy only after validation passes.**
   ```
   cp /home/claude/cadence.html /mnt/user-data/outputs/cadence.html
   ```

8. **No debug buttons or test artifacts** left in production code.

9. **When a fix has been attempted 3+ times without success**, stop and ask the user for DevTools console output before attempting again.

10. **When the user says something works in feature X but not feature Y**, read feature X's implementation first and copy its exact approach.

---

## CRITICAL ARCHITECTURAL PATTERNS

### Flex height chain — always use CSS class, never inline
```css
.inst-dag-col { flex:1; overflow:hidden; display:flex; flex-direction:column; min-height:0; }
```
Applied to: `instance-detail`, root wrapper div in renderInstanceDetail, body container, `inst-dag-wrap`.
`cad-content` must be `overflow:hidden` (not `overflow-y:auto`) to prevent sub-pixel clipping.

### Canvas sizing
Use `offsetWidth` / `offsetHeight`, never `getBoundingClientRect`.
Auto-fit scale cap: `Math.min(1.5, ...)`. Always `setTimeout(..., 50)` before rendering.
`NODE_Y = 50 + OWNER_H` — matches template DAG exactly.

### Temporal dead zone
`let` state variables (`_instDagFitted`, `_instDagPanX`, etc.) MUST be declared before the function that references them in the file. JavaScript `let` is not hoisted.

### Rejection arc routing
Arcs originate from `step_completed` events with `requiresReset:true` outcome.
Arc target = the next `step_activated` event after the rejection timestamp.
**Never** source arcs from `step_reset` events.

### System note filtering
Exclude from Intelligence Briefing and any human-facing note display:
- Event types: `step_reset`, `instance_launched`, `meeting_created`
- Notes starting with: "Reset by", "Launched from template", "Meeting created"
Only genuine human-written notes from `step_completed` and `step_activated` events should surface.

### Actor name resolution
When `actor_name` is "System" or empty, resolve from `_tmplSteps` assignee_name or assignee_email for that step.

---

## SUPABASE MIGRATIONS — RUN BEFORE TESTING

### Stakes Layer (added Session 7 — run if not already applied)
```sql
ALTER TABLE workflow_instances
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'routine'
    CHECK (priority IN ('routine','important','critical')),
  ADD COLUMN IF NOT EXISTS stakes TEXT,
  ADD COLUMN IF NOT EXISTS pert_optimistic NUMERIC,
  ADD COLUMN IF NOT EXISTS pert_likely NUMERIC,
  ADD COLUMN IF NOT EXISTS pert_pessimistic NUMERIC;

CREATE INDEX IF NOT EXISTS idx_workflow_instances_priority
  ON workflow_instances (firm_id, priority, status);

UPDATE workflow_instances SET priority = 'routine' WHERE priority IS NULL;
```

### Project Plan Layer (Session 8 — design first, then migrate)
```sql
-- Run after designing the project plan view in session
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  owner_resource_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sequence_order INTEGER NOT NULL,
  color TEXT
);

CREATE TABLE IF NOT EXISTS project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES project_phases(id),
  firm_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  assignee_resource_id UUID,
  due_date DATE,
  duration_days NUMERIC,
  pert_optimistic NUMERIC,
  pert_likely NUMERIC,
  pert_pessimistic NUMERIC,
  linked_template_id UUID REFERENCES workflow_templates(id),
  dependencies JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  epistemic_score NUMERIC,
  sequence_order INTEGER
);

CREATE TABLE IF NOT EXISTS project_task_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES project_tasks(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES workflow_instances(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## FEATURE STATUS

| Feature | Status | Notes |
|---------|--------|-------|
| Template editor (steps, DAG, outcomes) | ✅ Complete | |
| Instance launch + CoC engine | ✅ Complete | |
| Layer 2 routing engine | ✅ Complete | |
| Email notifications (Resend) | ✅ Complete | |
| Instance DAG diagram mode | ✅ Complete | |
| Rework Intelligence (arcs, scrubber, notes) | ✅ Complete | 235px panel |
| Intelligence Briefing | ✅ Complete | Email + PDF export |
| Stakes Layer (Priority, Stakes, PERT) | ✅ Complete | Needs DB migration |
| My Workflows Bin (filter tabs, search, thermal) | ✅ Complete | |
| Project Plan Integration | 🔴 Next | Session 8 primary focus |
| External response endpoint | 🟡 Pending | Edge Function needed |
| Multi-instance swimlane | 🟡 Pending | |
| AI-generated Intelligence Briefing | 🟡 Pending | API pattern established |
| Layer 3 analytics dashboard | 🟡 Pending | |

---

## PENDING ITEMS — PRIORITY ORDER

### 1. Project Plan Integration ← SESSION 8 PRIMARY FOCUS

The core insight: in every PM tool ever built, you cannot click on a task and descend into the micro-workflow beneath. CadenceHUD changes this.

**The four-level hierarchy:**
```
Portfolio
  └── Project
        └── Phase
              └── Task                    ← the flat plan (MS Project / Excel)
                    └── Workflow Instance ← CadenceHUD owns this layer
                          └── Steps / CoC / Rework Intelligence / Briefing
```

**Session 8 should begin by:**
1. Uploading cadence.html from the repository
2. Uploading any Excel project plan files from the repository
3. Reviewing existing project plan structure before designing anything
4. Designing the project plan view (native Gantt vs phase/task list) before writing code
5. Building the project → phase → task → workflow instance binding layer

**Key design decisions to resolve in Session 8:**
- Native project plan view built into CadenceHUD, or import from Excel first?
- Gantt chart view or phase/task hierarchy list?
- Auto-launch workflow when task is activated, or manual launch with binding?
- Bidirectional status sync: does task completion require workflow completion?
- Epistemic score: calculated automatically from PERT variance + downstream count, or manually set?

### 2. External Response Endpoint
Approve/reject workflow steps from email without logging in.
- Supabase Edge Function for signed URL token generation
- Response landing page (approve.html)
- Token generated at step activation notification time
- Resend email template updated with action buttons

### 3. Multi-Instance Swimlane
Dots on each diagram node showing count of instances currently at that step.
Click dot cluster to filter to those instances.

### 4. AI-Generated Intelligence Briefing
Replace deterministic template with Anthropic API prose generation.
Feed CoC events with human notes as context. API call pattern already established in codebase.
Prompt should produce narrative like: "This Design Review Signoff has experienced 4 rejections over 8 hours, consuming 87% of elapsed time in rework loops. Vaughn Staples rejected the submission citing missing signature blocks..."

### 5. Layer 3 Analytics Dashboard
Heat map of step dwell times across all instances of a template.
Average time per step, rejection rates per step, bottleneck identification.
Historical PERT accuracy: compare estimated vs actual duration across all completed instances.
Feeds into automated epistemic criticality scoring.

---

## PHILOSOPHY FOUNDATION

CadenceHUD is built on one core belief:

> **The queue should make the cost of inaction visible without anyone having to say a word.**

### The Flat Page Problem
Traditional project plans are flat. Every task row exists on the same plane regardless of importance, uncertainty, or complexity. There is no depth beneath the task row. Lift the page — nothing underneath.

CadenceHUD provides the depth. The project plan task is the **surface**. CadenceHUD is what lives **beneath it**.

### Three Types of Criticality
1. **Schedule criticality** — what CPM measures. Zero float. Well understood, well tooled.
2. **Dependency criticality** — not on the critical path, but 15 tasks are waiting on it. Often invisible.
3. **Epistemic criticality** — the R&D nugget. A task whose *outcome* determines whether everything downstream has value at all. High uncertainty, high consequence, often small in scope. **Completely invisible in every existing PM tool.**

### Epistemic Criticality Formula
`High downstream weight × Wide PERT variance × Low reversibility = Epistemic criticality`

PERT variance is the mathematical fingerprint: O=1d, M=5d, P=20d means "we have never done this before." CadenceHUD is the first PM tool to surface this automatically.

### The Stakes Layer Rationale
Stakes are captured at launch because that is the one moment when the PM — the person who knows the context — is present in the system. Two fields, thirty seconds. Those stakes then travel with every task derived from the workflow, surfacing in the queue of every person who touches any step. The junior technician never needs to understand why the contract approval outranks their onboarding form. The system shows it.

### Rework Intelligence Rationale
The replay scrubber answers a question no PM tool has ever answered: not just where the workflow is now, but **what it cost to get here**. The rejection arc is visual proof of rework — a red dashed loop, weighted by frequency. The human notes surfaced at each event are the organizational memory of what went wrong and why. CadenceHUD makes the invisible visible.

---

## KEY FUNCTIONS REFERENCE (Session 7 additions)

| Function | Purpose |
|----------|---------|
| `renderInstanceDAG(inst)` | Canvas renderer for instance state overlay |
| `_instInitScrubber(inst)` | Initializes REPLAY with sorted CoC events |
| `instScrubChange(val)` | Slider input → snapshot CoC → re-render diagram + note card |
| `_instRenderDots(events, activeIdx)` | SVG dot track — circles for normal, diamonds for resets |
| `_instRenderScrubNote(evt)` | Synchronized note card for current scrubber position |
| `_instRenderReworkCost(inst)` | Rework cost summary — loops, time, per-step breakdown |
| `showIntelBriefing(instId)` | Intelligence Briefing modal — 4 sections + stakes banner |
| `_briefingEmail(instId)` | Pre-composed mailto with human notes |
| `_briefingPDF(instId)` | Print-optimized window + auto-print trigger |
| `_launchPrioritySelect(val)` | Priority button toggle state in Launch dialog |
| `_launchPertUpdate()` | Live PERT calculation + epistemic risk warning |
| `_instUrgencyScore(inst)` | Priority multiplier × elapsed hours × rework penalty |
| `_instThermalColor(inst)` | Thermal border color based on priority + elapsed days |
| `_setInstFilter(f)` | Sets instance list filter tab and re-renders |
| `_setInstSearch(q)` | Sets search query and re-renders |

---

## SESSION STARTUP CHECKLIST

Every new session must begin with these steps in order:

- [ ] Run Supabase migrations if not already applied (Stakes Layer)
- [ ] Upload `cadence.html` from repository
- [ ] Upload any supporting files (Excel plans, CSVs, etc.)
- [ ] Tell Claude: *"This is CadenceHUD Session N. Read these instructions and cadence.html before making any changes."*
- [ ] Agree on session goals before writing any code
- [ ] Confirm current deployment is working at production URL

---

## TRANSCRIPT ARCHIVE

Previous session transcripts are stored at `/mnt/transcripts/` with a catalog in `journal.txt`.
Key transcripts:
- Session 6: `2026-03-22-12-36-16-projecthud-cadencehud-dev-session6.txt`
- Session 7: `2026-03-22-19-38-30-cadencehud-instance-dag-session7.txt`

---

*CadenceHUD · ProjectHUD · Confidential · Updated Session 7 · March 23, 2026*
