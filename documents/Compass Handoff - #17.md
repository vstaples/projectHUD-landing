# Compass — Build Session Handoff Document
**Date:** March 26, 2026  
**Status:** My Work suite complete. My Time design locked. Ready to build `my-time.html`.

---

## 1. Project Overview

**Compass** is a decision intelligence app for professional services firms. It is a multi-view single-page application deployed to `https://projecthud.com` via Vercel, backed by Supabase.

**Competitive positioning:** Every other tool records what happened. Compass tells you what should have happened, what did happen, why they differ, and what to do about it next week.

---

## 2. Infrastructure

| Item | Value |
|---|---|
| Deployment | Vercel → `https://projecthud.com` |
| Backend | Supabase at `https://dvbetgdzksatcgdfftbs.supabase.co` |
| Firm ID | `aaaaaaaa-0001-0001-0001-000000000001` |
| Test user | Vaughn Staples |
| User ID | `57b93738-6a2a-4098-ba12-bfffd1f7dd07` |
| Resource ID | `e1000001-0000-0000-0000-000000000001` |
| External files | `/js/config.js`, `/js/api.js`, `/css/hud.css` (served by Vercel, not in these files) |

The `API` object (get, post, patch, delete) is defined in `/js/api.js` and available globally. Authentication is handled by Supabase JWT via `/js/auth.js` (loaded by `compass.html`).

---

## 3. File Architecture

### Current files (both must be deployed to Vercel root)

**`compass.html`** — 1,280 lines. Shell only.
- HTML nav, view divs, toast element
- Shared globals: `FIRM_ID`, `_projects`, `_tasks`, `_resources`, `_users`, `_myResource`, `_viewLoaded`, `_currentView`
- Shared functions: `loadBaseData()`, `switchView()`, `compassToast()`, `esc()`, `fmtDate()`, `fmtDateTime()`, `daysOverdue()`, `_timeAgo()`, `avatarHtml()`
- Dynamic loader: `loadUserView()` — fetches `my-work.html`, injects HTML, executes script, calls `window._mwLoadUserView()`
- `DOMContentLoaded` handler → `loadBaseData()` → `switchView(saved || 'pm')`
- Stub loaders for PM, Management, Executive, Client views (not yet modularized)

**`my-work.html`** — 9,490 lines. My Work / My Space suite.
- Exports: `window._mwLoadUserView`, `window._mwRefresh`
- All My Work state vars, functions, HTML templates
- Contains ALL view code including PM View, Management View, Executive View (not yet extracted — see Section 8)

### Boot sequence
```
compass.html loads → DOMContentLoaded → loadBaseData() resolves identity
→ switchView('pm') → user clicks User tab → loadUserView()
→ fetch('/my-work.html') → inject HTML → execute script
→ _mwLoadUserView() runs with _myResource already set
```

### Modularization pattern (established, use for all future views)
```javascript
// compass.html loader stub:
async function loadUserView() {
  if (window._myWorkLoaded) { window._mwRefresh && window._mwRefresh(); return; }
  const resp = await fetch('/my-work.html');
  const html = await resp.text();
  // parse, inject HTML, execute scripts
  window._myWorkLoaded = true;
  if (window._mwLoadUserView) await window._mwLoadUserView();
}
```
The loaded file must export `window._mwLoadUserView` and `window._mwRefresh`.

---

## 4. Top Navigation

| Nav Label | `viewId` | Status |
|---|---|---|
| User | `user` | Complete — loads `my-work.html` |
| Project Manager | `pm` | In `my-work.html`, not yet extracted |
| Management | `management` | In `my-work.html`, not yet extracted |
| Executive | `executive` | In `my-work.html`, not yet extracted |
| Client Portal | `client` | In `my-work.html`, not yet extracted |
| Morning Brief | button | In `my-work.html` |
| Simulate | button | In `my-work.html` |

**Note:** Top nav says "User" and "Project Manager" — these are the role labels. The suite tabs below (My Work, My Time, etc.) are the surface labels.

---

## 5. DB Schema — Key Tables

### Tables read/written by My Work

| Table | Key columns | Notes |
|---|---|---|
| `tasks` | `id, name, status, pct_complete, assigned_to (FK→users.id), project_id, due_date, budget_hours, effort_days` | `assigned_to` is users.id NOT resources.id |
| `workflow_action_items` | `id, title, body, status, due_date, owner_resource_id, owner_name, created_by_name, instance_id, negotiation_state (jsonb)` | `negotiation_state` column added this session |
| `time_entries` | `id, firm_id, resource_id, user_id, project_id, task_id, date, hours, is_billable, notes, source_type, week_start_date` | Written on task progress save and completion |
| `timesheet_weeks` | `id, firm_id, resource_id, week_start_date, week_end_date, total_hours, billable_hours, status, submitted_at, approved_at, approver_name, rejection_reason, resource_notes` | Submit flow writes here |
| `coc_events` | `id, firm_id, entity_id, entity_type, event_type, step_name, event_notes, actor_name, actor_resource_id, outcome, metadata (jsonb), created_at, updated_at` | Primary CoC table — no FK constraints |
| `workflow_step_instances` | `id, instance_id (FK→workflow_instances.id), step_type, event_type, step_name, event_notes, outcome, actor_name, firm_id` | CHECK constraint on event_type — see below |
| `concerns` | `id, firm_id, resource_id, title, body, status, created_at` | My Concerns tab |

### `workflow_step_instances.event_type` CHECK constraint
**Only these values are valid:**
`instance_launched, step_activated, step_completed, step_reset, step_reassigned, step_reassignment_removed, step_assignee_override, rejected, instance_suspended, instance_cancelled, instance_completed, meeting_created, escalation_triggered, override`

**Never use:** `task_progress_update`, `completion_skip`, `daily_timesheet_complete` — these were previously attempted and caused 400 errors.

### CoC write pattern (current)
All new CoC events go to `coc_events` (no FK constraints). Dual-write to `workflow_step_instances` only when a valid `instance_id` FK exists, using `step_completed` as the event_type.

```javascript
// Always write to coc_events first
await API.post('coc_events', {
  id: crypto.randomUUID(),
  firm_id: 'aaaaaaaa-0001-0001-0001-000000000001',
  entity_id: itemId,           // task id, action item id, etc.
  entity_type: 'task',         // 'task' | 'action_item'
  event_type: 'progress_update', // 'progress_update' | 'completed' | 'loe_negotiation'
  step_name: 'Progress update',
  event_notes: comment,
  actor_name: _myResource?.name || null,
  actor_resource_id: _myResource?.id || null,
  outcome: 'on_track',         // 'on_track' | 'at_risk' | 'blocked'
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
```

### Negotiation state persistence
`workflow_action_items.negotiation_state` (jsonb) — stores full state object:
```javascript
{
  state: 'unrated' | 'pending' | 'negotiating' | 'agreed' | 'escalated',
  loe: '2 days',
  proposedDue: '2026-03-30',
  submittedAt: ISO string,
  agreedLoe: '2 days',
  agreedDue: '2026-03-30',
  lockedAt: ISO string,
  assignerName: 'PM Name',
  thread: [{ role: 'assignee'|'assigner'|'system', name, ts, text, loe, proposedDue, comment }]
}
```
`workflow_action_items` has NO `updated_at` column — do not include in PATCH calls.

---

## 6. My Work Suite — Completed Features

### Suite tabs (in `my-work.html`)
`My Work` | `My Time` (placeholder) | `My Calendar` | `My Meetings` | `My Concerns` | `My Requests`

### My Work tab features
- **Stat strip** — 8 cards: Waiting, In Progress, Blocked, Done Today, Hrs Week, Hrs Today, Open Items, Active WF
- **Since-last-login delta strip** — colored chips above tabs, tappable, hidden when nothing changed
- **Recommended daily sequence panel** — 3–5 items scored by: blocking others (+1000), overdue (+500), blocked (+400), unrated action (+200), project at risk (+100), due today (+300), due in 2d (+150), in-progress (+50). Session-immutable. Toggle via ⚡ Seq button (right-anchored in panel header). Dismissable with ×, reopens from cache.
- **Work list** — filterable by Type / Status / Date range / Project. Columns: circle · badge · title+subtitle · progress bar · due date · action button. Left border color encodes negotiation state for action items.
- **LIST/DIAGRAM toggle** — LIST shows work list rows. DIAGRAM shows swimlane timeline with capacity bar.
- **Capacity bar** — second row in diagram timeline header. Per-day: green (<70%) / amber (>70%) / red (overloaded). Today shows "Xh left" or "Xh over". Unrated action items excluded from calculation.
- **Work item modal** — opens on row click. Shows progress inputs, sentiment signal, CoC panel (right side). Saves to `time_entries` + `coc_events`. Mark complete → completion panel.
- **Done Today panel** — right side, logs completed items with signal dot and hours.
- **Time log** — below done today, shows recent `time_entries`, filterable by day.

### Action Item Negotiation Protocol
4 states with distinct visual treatment:
- **Unrated** — dashed border, form to submit LOE estimate + proposed due date + comment (min 20 chars)
- **Pending agreement** — amber dashed border, 24h countdown clock, textarea for follow-up comments, "Add to thread →" / "Escalate to PM" / "Revise my rating" buttons
- **Under negotiation** — purple solid border, response textarea, "Accept counter" / "Submit new counter" / "Escalate to PM"
- **Agreed · locked** — green solid border, agreed LOE + due date displayed, thread locked

**State persistence:** `window._negStateCache` (in-memory) seeded from `workflow_action_items.negotiation_state` on page load. `negSaveState()` writes to cache immediately and PATCHes Supabase async.

**Thread layout:** State flow pills → clock → action zone (always visible at top) → thread below (newest first). This ensures action inputs are always visible without scrolling.

**Row badge:** Action item rows show negotiation state badge inline in subtitle when state ≠ unrated.

**Key functions:** `negGetState(itemId)`, `negSaveState(itemId, data)`, `negWriteCoCEvent(itemId, notes, actor)`, `renderNegPanel(itemId, assignerName)`, `negSubmitRating`, `negEscalate`, `negReviseRating`, `negAcceptCounter`, `negSubmitCounter`, `negAddThreadUpdate`, `negPostCounter`, `_negRefreshRow`, `_negRefreshModalCoC`

### CoC panel in work item modal
- Reads from `window._myCocEvents` (fetched from `coc_events` at load time by entity_id)
- Optimistic updates: new events pushed to cache immediately, modal re-renders
- `data-coc-col`, `data-coc-count`, `data-coc-body` attributes for live refresh

### Timesheet / time entry
- `openFullWeeklyTimesheet()` — weekly drawer with day accordions, Sun–Sat, inline editing
- `openTimeEntryEdit()` — edit individual time entries
- `saveNewTimeEntry()` — direct time entry without task context
- `submitTimesheetWeek()` — writes to `timesheet_weeks`, compassToast confirmation
- Week navigation via `_weekOffset` state variable

---

## 7. My Time — Design Locked (Next Build)

### Architecture
Build as `my-time.html`, loaded dynamically by `compass.html` using the same pattern as `my-work.html`. The `utc-timesheet` div in `my-work.html` currently contains a placeholder — replace with a call to load `my-time.html` when the tab is clicked.

### Three-panel layout
The My Time tab renders three side-by-side panels:

**Left — Story panel** (what happened this week)
- Summary strip: Total logged / Billable % / Blocked hours / Plan deviation
- Legend: Billable (blue) / Non-billable planned (purple) / Unplanned redirect (amber) / Blocked/waiting (red)
- Day blocks Mon–Fri, each collapsible, default Mon/Tue open
- Day header: name · hours logged · segmented bar (billable/non-bill/unplanned/blocked proportions) · badge chips · chevron
- Alert row at top of each expanded day (warning or danger) when deviation or block occurred
- Event grid inside each day: 4 columns — Time (90px) | Bar (3px colored) | Activity (1fr) | Type pill + Hours
- Type pills right-justified in their own column, hours flush right
- Weekly narrative box at bottom: auto-generated from CoC events, editable before submit
- "Submit for PM approval" button writes to `timesheet_weeks`

**Center — Weekly timesheet** (the authoritative record)
- Cloned from existing `openFullWeeklyTimesheet()` logic, promoted to full panel
- Project-level rows (bold, shaded) with task rows indented below
- Columns: Project/Task (1fr) | M | T | W | T | F (32px each) | Total (36px)
- Billable indicator bars below daily totals
- Narrative box + Submit button at bottom of center (this is the submit anchor)

**Right — Next week plan** (projected from assignments)
- Week navigation (page forward/back one week at a time)
- Capacity warning bar if scheduled > available
- Days Mon–Fri, each collapsible, default Mon/Tue open
- Day header: name · scheduled vs available hours · capacity fill bar · chevron
- Each day contains:
  - Calendar events (meetings, PTO) from My Calendar — blue dot for meeting, purple dot for PTO — shown first, fixed/non-negotiable
  - Assigned tasks for that day — white dot, title, project badge, due date, projected hours
  - Carry-forward items from this week — amber dot, "Carry-forward" badge
  - Per-day flag input: `<input placeholder="Flag a concern for PM...">` — PM sees on Monday
- Summary strip at bottom: Total scheduled / Available (after meetings+PTO) / Carry-forward / Projected billability
- "Submit plan to PM" button

### Key design decisions
- **Week boundary:** Sun–Sat
- **Approval flow:** PM approval (not direct to finance)
- **Granularity:** Task level
- **Narrative submit:** User writes one sentence; rest is auto-generated from CoC events for the week
- **Blocked time:** Visually distinct from productive time — red segment in day bar, red event bar color
- **Unplanned work:** Flagged automatically when hours logged against a task on a day it wasn't scheduled
- **Signature chain latency:** Tracked as a metric — when user routed for signature vs when last signature landed. Surfaced inline as "43h chain latency · Manager avg this qtr: 38h"
- **Carry-forward:** Next week's plan auto-populates with incomplete tasks from this week
- **No time-blocking in right panel** — tasks listed under their day without hour-level scheduling

### CoC event types to capture for Story panel
- `progress_update` — hours logged on a task
- `completed` — task/action item marked done
- `loe_negotiation` — negotiation milestone
- `blocked` — item marked blocked
- `meeting_no_consensus` — meeting that didn't close (derive from CoC notes)
- `signature_received` — when routing is completed (derive from workflow step events)

### Data sources for My Time
- `time_entries` — actual logged hours (already fetched in `_mwLoadUserView`)
- `coc_events` — context/narrative for each hour block
- `timesheet_weeks` — week submission status
- `workflow_action_items` + `tasks` — assignments for next week projection
- Calendar data (from `calendar_events` table or similar) — meetings/PTO for right panel

---

## 8. Build Queue (Priority Order)

### Immediate next: My Time
Build `my-time.html` as a standalone module. Wire into `compass.html` loader. Replace the placeholder in `utc-timesheet` with a dynamic load call.

### Then: PM View extraction → `pm-view.html`
`loadPMView()` starts at line 1157 in `my-work.html`. Extract it and all PM-specific functions (through ~line 2330) into `pm-view.html`. Wire loader in `compass.html`. This is the same surgery performed on My Work — extract, rename entry point to `_pmLoadView`, expose `window._pmLoadView` and `window._pmRefresh`.

### Then: Management, Executive, Client Portal (same pattern)
- `loadManagementView()` — line 2331 in `my-work.html`
- `loadExecutiveView()` — line 3242
- `loadClientView()` — line 3651

### Then: Morning Brief full build
Three-tier surface (PM / Management / Executive). Generated once per morning, immutable for the day. Each card a portal into a live surface. The `openMorningBrief()` function is at line 4556 in `my-work.html`.

### Modularization threshold
Currently: `compass.html` 1,280 lines + `my-work.html` 9,490 lines = 10,770 combined. Flag at 12,000. Extracting PM View will bring `my-work.html` to ~7,000 lines.

---

## 9. Architecture Rules (Non-Negotiable)

- All event listeners delegated at module level — never inside `_mwLoadUserView()`
- `tasks.assigned_to` = FK → `users.id` (NOT `resources.id`)
- Minimum font size 11px
- No `position:fixed` anywhere in view files (compass.html shell may use it for nav)
- Pure functions for layout engines
- JS validated with `node --check` after every edit
- Build in passes: static shell first, live data second
- `workflow_step_instances` writes: only valid event_types from CHECK constraint; always include `id` (uuid) and valid `instance_id` FK
- New CoC events → `coc_events` table only (no FK constraints, flexible entity_type)
- `workflow_action_items` has no `updated_at` column — never include in PATCH
- Negotiation state reads from `_negStateCache` (seeded from DB on load), writes to cache + Supabase async
- Each new view file exports `window._[view]LoadView` and `window._[view]Refresh`

---

## 10. Shared Globals Available to All View Files

These are set by `compass.html` before any view loads:

```javascript
window.FIRM_ID          // 'aaaaaaaa-0001-0001-0001-000000000001'
window._myResource      // { id, name, user_id, firm_id, department, ... }
window._projects        // array of project objects
window._tasks           // array of task objects  
window._resources       // array of resource objects
window._users           // array of user objects
window._viewLoaded      // { user: bool, pm: bool, management: bool, ... }
window.API              // { get, post, patch, delete, getProjects, getTasks, getUsers }
window.compassToast(msg, duration)
window.esc(str)         // HTML escape
window.fmtDate(iso)     // 'Mar 26'
window.fmtDateTime(iso) // 'Mar 26, 9:18 PM'
window.daysOverdue(dateStr)
window.avatarHtml(name, size, cls)
window.switchView(viewId)
```

---

## 11. Key CSS Variables (from hud.css)

```css
--compass-cyan: #00D2FF
--compass-green: #1D9E75
--compass-amber: #EF9F27
--compass-red: #E24B4A
--font-head: /* monospace heading font */
--font-body: /* body font */
--font-display: /* numeric display font */
--font-mono: /* monospace */
--bg0, --bg1, --bg2: /* dark backgrounds */
--text0, --text1, --text2, --text3: /* text hierarchy */
--border: /* default border color */
--muted: /* muted text */
```

---

## 12. Starting a New Session

1. Attach `compass.html` (1,280 lines) and `my-work.html` (9,490 lines)
2. Tell Claude: "We are building the Compass decision intelligence app. Read the handoff doc context above, then read both attached files before touching anything."
3. First task: build `my-time.html` as a standalone module following the three-panel design in Section 7.
4. Before writing any code, Claude should run `wc -l` on both files and `node --check` on each to confirm they match expectations.
5. Every code change: validate with `node --check` before writing to outputs.

---

*Handoff document generated March 26, 2026. Covers sessions 16–19 plus current session.*
