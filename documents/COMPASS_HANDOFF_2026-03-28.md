# Compass — Full Platform Handoff
**Date:** March 28, 2026
**For:** Coding agent — continuation of development
**App:** ProjectHUD / Compass — projecthud.com
**Stack:** Vercel → projecthud.com | Supabase (dvbetgdzksatcgdfftbs.supabase.co)
**FIRM_ID:** `aaaaaaaa-0001-0001-0001-000000000001`

---

## Test Users

| Name | Email | Supabase user_id | resource_id | Password |
|------|-------|-----------------|-------------|----------|
| Vaughn Staples | vstaples@projecthud.com | 57b93738-6a2a-4098-ba12-bfffd1f7dd07 | e1000001-0001-0001-0001-000000000001 | (session) |
| Ron White | rwhite@apexconsulting.com | f3947e77-73f2-4b39-80dc-b80323a1b723 | — | TestPass123! |
| Alan Smith | asmith@apexconsulting.com | a0c35fd5-51a8-48f2-bf57-7d29114fae6e | e1000001-0000-0000-0000-000000000003 | TestPass123! |

---

## File Architecture

| File | Lines | Purpose |
|------|-------|---------|
| `compass.html` | ~1,400 | Shell — auth, navigation, tab routing, sets `window._notesResource` |
| `my-work.html` | ~9,544 | MY WORK tab host — tasks, action items, workflows, time |
| `my-notes.html` | ~4,622 | MY NOTES module — injected into `#utc-concerns` |
| `sidebar.js` | — | Height: `calc(100vh - 32px)` — accounts for 32px ticker bar |

### my-notes.html Script Block Architecture
Four sequential `<script>` IIFEs in a single file:

| Block | Purpose |
|-------|---------|
| Block 1 | Core — state, rendering, workspace, D&D, views, templates |
| Block 2 | Collaboration — participants, presence, heartbeat, invite popover |
| Block 3 | Widget infrastructure — registry, mode switcher, picker, config form |
| Block 4 | Widget implementations — Phase 2 widgets |

**Critical scoping rule:** Functions in one block are not accessible by name in another. Always use `window.*` for cross-block calls. Block 1 exports via `window._notes*`. Block 2 exports via `window._notes*`. Block 3 exports `window.WIDGET_REGISTRY`, `window._getProjectsForPicker`, `window._notesShowResourcePicker`. Block 4 registers widgets via `window.WIDGET_REGISTRY.register(...)`.

---

## Database Schema

### Core Tables

```
notes                    — Note storage (content, title, hierarchy_path)
notes_workspace          — Per-user workspace state (JSON blob)
note_participants        — Collaboration membership + presence
resources                — Team member profiles (name, email, dept, title, avatar_url)
workflow_action_items    — Action items (owner_resource_id, status, due_date)
tasks                    — Tasks (assigned_to=user_id, status, due_date, budget_hours, loe_hours)
time_entries             — Time log (resource_id, date, hours, is_billable, week_start_date)
workflow_instances       — Active workflows (project_id, title, status)
v_meetings               — Meeting view (id, meeting_date, project_id, firm_id)
meeting_ratings          — Meeting health ratings (meeting_id, rating)
hud_skills               — Skill definitions
hud_skill_domains        — Domain experience definitions
resource_skills          — Per-resource skill assignments
resource_domain_experience — Per-resource domain assignments
task_resource_assignments — Task-resource links (for profile card allocation)
```

### Key Columns — `notes`
```
id, owner_user_id, firm_id, title, content
hierarchy_path   — e.g. 'Work', 'Work/NovaBio', 'Personal', 'Inbox'
is_inbox         — true = inbox notification, not a user note
entity_id        — for shared note invitations: points to the shared note
sort_order       — integer, for left-panel tree ordering
```

### Key Columns — `note_participants`
```
id, note_id, user_id, resource_id
role             — 'owner' | 'participant'
color            — hex color assigned at invite time
accepted_at      — NULL=pending, NOT NULL=accepted
last_seen_at     — updated by heartbeat every 5s
```

### Workspace State JSON Structure
```json
{
  "activeView": "Default",
  "views": {
    "Default": {
      "rows": [
        { "id": "row0", "columns": 2, "height": "medium" },
        { "id": "row1", "columns": 4, "height": "small" }
      ],
      "tiles": [
        { "row": "row0", "slot": 0, "noteId": "uuid", "chatOpen": false,
          "canvasMode": "widget", "widgetId": "capacity_gauge",
          "widgetConfig": { "targetResourceId": "" } }
      ],
      "tray": ["uuid"],
      "clonedFrom": "Onboarding Template",
      "parameters": { "newHireName": "Alex Rivera" }
    }
  },
  "library": {
    "Onboarding Template": {
      "isTemplate": true,
      "category": "Onboarding",
      "description": "Standard new hire onboarding flow",
      "parameters": ["newHireName", "startDate", "advisorName"],
      "rows": [...],
      "tiles": [...]
    }
  }
}
```

---

## MY NOTES — Completed Features

### Core Workspace
- Two-panel layout — resizable left panel (180–520px, persisted per view) + grid workspace
- Named views — unlimited, dropdown switcher, double-click or ✎ button to rename, styled dialog (no browser prompt)
- Row-based grid layout — each row has independent column count (1–8), height (Small/Medium/Large/Auto), drag-to-reorder via grip handle with cyan insertion indicator
- Row editor bar — above grid, one segment per row with − / + steppers, height dropdown, ⠿ grip, × delete
- Tray — chip bar below grid for notes not in a slot
- Workspace persisted to `notes_workspace` Supabase table — immediate save on structural changes, 800ms debounce on text

### Knowledge Tree (Left Panel)
- Hierarchy — branches/sub-branches, collapsible with SVG chevrons
- Branch management — + Add branch, + sub-branch, rename inline (contenteditable), delete with styled confirm dialog
- Note items — title, relative age, ✕ delete (styled confirm, not browser prompt)
- Inbox section — separate from tree, count badge
- Search — filters tree in real time
- D&D reordering — mouse-event based (avoids Chrome overflow:auto dragover bug). Cyan insert-line above/below target.

### Grid Tiles
- Ghost header on empty slots — "New note…" italic title + ghosted controls at full opacity, click anywhere to create
- Occupied tiles — editable title (contenteditable), textarea canvas, presence row, controls
- Tile controls — minimize (—), maximize (◻/⧉), close (✕), chat toggle, invite (+), mode switcher pill
- Content swap — drag occupied tile onto occupied tile swaps `{row, slot}` values, no DB writes

### Note Creation
- Click empty slot header or body → creates note in that exact row/slot
- + New note button → opens in first available slot
- D&D from tree → drops into target slot (HTML5 drag, document-level handlers bypass Chrome overflow:auto bug)

### Chat Panel
- Per-note message thread, toggleable
- Compose with Ctrl+Enter to send
- Always editable regardless of canvas mode

### Named View Management (styled dialogs, no browser prompts)
- + View — dialog with name field, Enter to confirm, duplicate name validation
- Rename — ✎ button or double-click dropdown, pre-filled dialog
- Delete view — styled confirm dialog, switches to first remaining view, blocks delete of last view
- Clear — removes all tiles from current view

---

## MY NOTES — Collaboration System

### Invite Flow
1. Click + in tile header → fixed-position invite popover (70vh max, scrollable)
2. Resources fetched from `resources` table, grouped by department
3. Avatar colors from `PARTICIPANT_COLORS` array — consistent across all pickers
4. Clicking resource → creates `note_participants` row + sends inbox notification

### Avatar State Machine (3 states)
| State | Visual | Condition |
|-------|--------|-----------|
| Pending | Outlined, 60% opacity | `accepted_at IS NULL` |
| Accepted/offline | Filled | `accepted_at NOT NULL`, not seen within 15s |
| Accepted/active | Filled + green dot | `accepted_at NOT NULL` + `last_seen_at` within 15s |

### Accept/Decline/Remove Flows
- **Accept** → sets `accepted_at`, opens floating shared note window
- **Decline** → deletes invitation from inbox, deletes participant row, notifies owner via styled dialog
- **Owner removes participant** → deletes row, patches invitee workspace to remove tile
- **Participant removes self** → confirmation dialog, deletes row, stops heartbeat, notifies owner

### Presence & Heartbeat
- `_notesStartPresence(noteId)` — 5s interval patching `note_participants.last_seen_at`
- Runs for: grid tiles, tray notes, open floating windows
- Content sync — fetches remote content every 5s, updates textarea if different, skips if user typed within 3s

### Notification Types (inbox notes, `is_inbox=true`)
| Title pattern | Click behavior |
|--------------|----------------|
| `"X invited you to: Y"` | Accept/decline dialog (or reopen float if accepted) |
| `"X declined your invitation to: Y"` | OK dismiss dialog, deletes notification |
| `"X removed themselves from: Y"` | OK dismiss dialog, deletes notification |
| `"X invited you to view: Y"` | (template launch) Informational, dismiss |

---

## MY NOTES — Row-Based Layout Engine

### State Model
Old: `{ gridSize: "2x2", tiles: [{slot: 0, noteId}] }`
New: `{ rows: [{id, columns, height}], tiles: [{row, slot, noteId}] }`

### Migration
`_notesMigrateView(view)` — runs on load if `gridSize` exists and `rows` doesn't. Converts and saves back immediately. Transparent to user. Run automatically for all views on every load.

### D&D Systems (two separate, must not interfere)
1. **Mouse-event D&D** (left panel reordering) — `_leftDragActive` flag, ghost element, insert-line indicators
2. **HTML5 D&D** (tree→grid, tile→tile, tray→grid) — `dragstart`/`dragover`/`drop` on document level

`_html5DragActive` flag prevents mouse-event system from interfering during HTML5 drag. `noteId` stored in `dataTransfer` as `application/noteid` fallback in case `_dragNoteId` is cleared by `mouseup` before `drop` fires.

**dataset convention:** Always `dataset.rowid` (lowercase) — camelCase `dataset.rowId` sets `data-row-id` which is a different attribute.

---

## MY NOTES — Template System

### Save as Template
- ⊞ Save Template button in toolbar
- Dialog — name (pre-filled from view name), category (Project/Onboarding/QMS/Custom), parameters (comma-separated variable names), description (required)
- Saved to `_workspace.library[templateName]`
- Library section in left panel (above Inbox) — collapsible, shows name + category badge

### Launch Instance
- Launch button on library entry → dialog with 3 sections:
  1. View name (editable)
  2. Parameter fields (one per defined parameter)
  3. Invite section — same resource picker as note sharing, multi-select with color chips
- On confirm: clones rows+tiles, switches to new view, sends inbox notification to each invitee with `user_id`

### Edit Template
- ✎ Edit Template button appears in toolbar when active view was launched from a template
- Edits category, parameters, description — saves back to library
- Description bar below toolbar shows `▦ TemplateName — description` for template-launched views

---

## Widget System — Phase 1 Infrastructure

### Architecture
Widgets are a **rendering mode within a normal tile** — the canvas renders in `note`, `widget`, or `entity_card` mode. Switching mode is non-destructive: the note content persists in DB.

### WIDGET_REGISTRY
```javascript
window.WIDGET_REGISTRY.register({
  id, label, category, description, icon,
  configSchema: [{ key, label, type, default, required, templatePlaceholder }],
  refreshInterval,  // ms, 0 = manual only
  minTileHeight,
  dataFn: async (config, context) => { ... return data; },
  renderFn: (data, container, config) => { /* SVG/HTML into container */ }
});
```

### Config Field Types
| Type | Renders as |
|------|-----------|
| `text` | Text input |
| `number` | Number input |
| `select` | Dropdown with defined options |
| `boolean` | Checkbox |
| `resource_picker` | Opens same invite popover (grouped, avatars, search, consistent colors) |
| `project_picker` | Role-aware dropdown — PM sees all active, user sees only their projects |

### Mode Switcher
Small pill button in tile header — "Note" or widget label. Click to open dropdown:
- ✎ Note canvas
- ▦ Add widget → opens widget picker

⚙ gear button also appears in header when in widget mode — click to reconfigure.

### Widget Picker
Modal dialog — grouped by category, search filter, widget cards with icon/name/description.

### Refresh
Per-tile `setInterval` starts when tile renders in widget mode. Clears on close or minimize. Never refreshes minimized/tray tiles.

### Context Object
```javascript
{ firmId, userId, resourceId, role, api }
```

---

## Widget System — Phase 2 Widgets

All widgets live under **Personal** or **Project** category in the picker.

### 1. Capacity Gauge (`capacity_gauge`)
- SVG arc dial — load % with color (green→amber→red)
- **Hours mode** when `budget_hours` or `loe_hours` populated — shows `4.5h` center, `8h cap` stat
- **Count mode** fallback — shows `73%` load, `Open` count
- Stat row: Open / Overdue / Today / Upcoming
- Sources: `workflow_action_items` (by resource_id) + `tasks` (by user_id)
- Config: Person (resource picker), Daily capacity (hours)
- Refresh: 2 minutes

### 2. Action Item Counter (`action_item_counter`)
- Large number, color-coded by urgency (red=overdue, amber=today, cyan=clear)
- Breakdown row: overdue / today / upcoming
- Source: `workflow_action_items` only, by `owner_resource_id`
- Config: Person (resource picker)
- Refresh: 60 seconds

### 3. Task Counter (`task_counter`)
- Same layout as action item counter
- Shows hours (`4.5h`) if `budget_hours`/`loe_hours` populated, count otherwise
- Source: `tasks` only, by `assigned_to` (user_id)
- Config: Person (resource picker)
- Refresh: 2 minutes

### 4. Meeting Health Sparkline (`meeting_health_sparkline`)
- 7-bar SVG sparkline, bars colored green/amber/red by rating
- Footer: avg score / 5, trend arrow (↑/↓/→), meeting count
- Source: `v_meetings` → `meeting_ratings`
- Config: Project (role-aware project picker)
- Refresh: 5 minutes

### 5. Billable vs Non-Bill (`billability_bars`)
- Header label + two large numbers (billable cyan, non-bill muted)
- Full-width percentage bar (cyan fill)
- Percentage labels below, total footer
- Source: `time_entries` by `resource_id` and `week_start_date` (current week)
- Config: Person (resource picker)
- Refresh: 5 minutes

### Role-Aware Project Picker
`window._getProjectsForPicker()` — PM/manager/director: all active `workflow_instances`. User: only projects where they have assigned tasks or action items. Same UI, different query.

---

## Pending Work — MY NOTES

### Steps 5 & 6 (Template System Completion)
- **Step 5 — View-level permissions** — `view_participants` table, presence strip above workspace, read-only canvas enforcement, lock icon on restricted tiles, auto-create `note_participants` rows at launch time
- **Step 6 — Template default invitees** — `defaultInvitees` array in template, required vs. `ownerDecides` flags, resolve firm roles to actual people at launch

### `view_participants` Table (Step 5 SQL needed)
```sql
CREATE TABLE view_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL,
  workspace_owner_user_id uuid NOT NULL,
  view_name text NOT NULL,
  user_id uuid,
  resource_id uuid,
  view_role text CHECK (view_role IN ('owner','editor','viewer')) DEFAULT 'viewer',
  tile_edit_overrides jsonb DEFAULT '[]',
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  last_seen_at timestamptz
);
```

### Widget Library — Phase 3 (Personal & Project Intelligence)
From the handoff spec, build in order:
1. `contribution_sparkline` — 8-week bar chart from `meeting_ratings`
2. `project_health_bars` — 5 horizontal bars per project
3. `my_week_summary` — 5-day capacity strip
4. `open_items_heatmap` — team members vs. days grid
5. `workflow_status_strip` — horizontal step diagram for a workflow

### Widget Library — Phase 4 (Financial & Industry — requires new tables)
Tables needed first: `invoices`, `program_deliverables`, `capa_records`, `ncmr_records`, `iqc_results`, `suppliers`

6. `invoice_feed` — invoice rows colored by status
7. `revenue_dial` — month revenue vs. target arc
8. `capa_counter` — open CAPAs by severity
9. `ncmr_disposition` — open NCMRs by disposition
10. `iqc_pass_rate` — pass rate trend sparkline
11. `supplier_status_grid` — qualification status indicators
12. `phase_gate_readiness` — function area completeness row

### Widget Library — Phase 5 (AI-generated, requires 6+ months data)
13. `ai_sentiment_feed` — reads from `project_sentiment` table (pre-generated by 6am job)
14. `onboarding_progress` — arc dial for new hire overall completion

### Other MY NOTES Enhancements
- **Link Entity button** — attach a task, meeting, or action item card to a note tile (`entity_card` canvas mode, already in state schema)
- **Staff beehive view** — 4×4 grid, one tile per team member showing their status
- **Named view thumbnail previews** — visual snapshot of grid layout in dropdown
- **Block-level collaborative attribution** — contenteditable blocks replacing textarea, per-block author color highlights
- **Medical device verticals** — CAPA, NCMR, IQC, Supplier grid, 8D canvas note types

---

## Broader Compass Platform — Pending Work

### MY MEETINGS
- Meeting minutes integration with `meeting-minutes.html`
- Health rating persistence to `meeting_ratings`
- Action item creation directly from meeting notes

### MY CALENDAR
- Grid + Kanban views built
- Event linking to tasks and workflows pending

### MY TIME
- Timesheet submission and approval flow
- Week navigation and copy-forward

### PM VIEW
- Portfolio dashboard
- Cross-project capacity view
- Phase gate readiness (links to widget Phase 4)

### MANAGEMENT VIEW
- Team capacity overview
- Escalation inbox
- Approval queue

---

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Mouse-event D&D for left panel | Chrome suppresses `dragover` inside `overflow:auto` |
| HTML5 D&D on document level | Same reason — bypasses container suppression |
| `dataset.rowid` (lowercase) everywhere | camelCase `rowId` sets `data-row-id`, not `data-rowid` |
| `_html5DragActive` flag | Prevents mouse-event system from interfering with HTML5 drag |
| Four IIFEs in one file | Separation of concerns; can be split to separate files later |
| Polling not WebSockets | Sufficient for small team; Supabase Realtime is upgrade path |
| Widgets as canvas modes | Avoids special tile types, new DB columns, new state management |
| `dataTransfer` noteId backup | `mouseup` clears `_dragNoteId` before `drop` fires in some browsers |
| No browser prompts anywhere | All confirms/inputs use styled `ntd-overlay` dialogs |
| `_notesShowResourcePicker` shared | Single invite popover reused everywhere — consistent colors and grouping |

---

## Shared UI Components (reusable across modules)

### `ntd-overlay` / `ntd-dialog` Pattern
Dark modal dialog — used for: new view, rename view, delete confirm, save template, launch template, widget config, branch delete, note delete. All accept Enter to confirm, Escape to cancel.

### `_notesConfirmDialog(title, subject, body, actionLabel, borderColor, color, bg)`
Returns a Promise<boolean>. Used everywhere instead of `confirm()`.

### `window._notesShowResourcePicker(anchorEl, onSelect)`
Opens the invite-style popover anchored to any element. Calls `onSelect({id, user_id, name})` on pick. Used in template launch invitee section and widget config resource fields.

### `window._getProjectsForPicker()`
Returns role-aware project list. Used in widget config project fields and template launch.

---

*Compass — Decision intelligence for professional services*
*Full platform handoff · March 28, 2026*
*Covers: MY NOTES complete · Widget Library Phase 1–2 · Template system · Collaboration · Pending roadmap*
