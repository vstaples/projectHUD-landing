# ProjectHUD + CadenceHUD — Session Handoff
**Date:** 2026-04-02 | **Session:** My Requests — Slice 1 (Document Review)
**Paste this entire document at the start of the next session.**

---

## PLATFORM OVERVIEW

**ProjectHUD + CadenceHUD** — unified operational intelligence platform for engineering-adjacent professional services firms.

Three layers:
- **Compass** (daily ops): My Work, My Time, My Calendar, My Meetings, My Views, My Notes, My Requests
- **ProjectHUD** (PM execution): CPM/PERT/EVM, Gantt, multi-project dashboard
- **CadenceHUD** (process control): Workflow templates, live instances, replay CoC, Form Engine

**The moat:** All layers share a single immutable, replay-capable Chain of Custody audit trail.

---

## INFRASTRUCTURE

| Item | Value |
|---|---|
| Supabase project | `dvbetgdzksatcgdfftbs` |
| Firm ID | `aaaaaaaa-0001-0001-0001-000000000001` |
| Production URL | `projecthud.com` |
| Storage bucket | `workflow-documents` |
| Supabase anon key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2YmV0Z2R6a3NhdGNnZGZmdGJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDc2MTYsImV4cCI6MjA4OTEyMzYxNn0.1geeKhrLL3nhjW08ieKr7YZmE0AVX4xnom7i2j1W358` |

**Key users:**

| Name | Auth UUID | Resource UUID | Email | Notes |
|---|---|---|---|---|
| Vaughn Staples | `57b93738-6a2a-4098-ba12-bfffd1f7dd07` | `e1000001-0000-0000-0000-000000000001` | vstaples@projecthud.com | Internal, submitter |
| Alan Smith | `a0c35fd5-51a8-48f2-bf57-7d29114fae6e` | `e1000001-0000-0000-0000-000000000003` | asmith@apexconsulting.com | Internal, reviewer |
| Vaughn W. Staples | `0402921d-9e87-4a02-a6aa-c5f754a77023` (resource only) | `0402921d-9e87-4a02-a6aa-c5f754a77023` | vstaples64@gmail.com | **External**, approver |

---

## DEPLOYED FILE VERSIONS (as of session end)

| File | Version | Path |
|---|---|---|
| `mw-core.js` | v20260402-122000 | `/js/mw-core.js` |
| `mw-tabs.js` | v20260402-121700 | `/js/mw-tabs.js` |
| `mw-events.js` | v20260402-121400 | `/js/mw-events.js` |
| `mw-sequence.js` | patched | `/js/mw-sequence.js` |
| `cdn-form-editor.js` | v20260401-230000 | `/js/cdn-form-editor.js` |
| `coc.js` | patched | `/js/coc.js` |

**Iron rule:** Every file change must include version stamp bump and orange console badge:
```javascript
// VERSION: YYYYMMDD-HHMMSS
console.log('%c[filename] vYYYYMMDD-HHMMSS','background:#c47d18;color:#000;font-weight:700;padding:2px 8px;border-radius:3px');
```

---

## SCOPING RULES (CRITICAL)

All `mw-*.js` files are injected into `document.head` by `compass.html → my-work.html`. They share the compass.html global scope. **Scripts may be injected more than once** (page reload recovery). Therefore:

- **NEVER use `let` or `const` at the top level of any `mw-*.js` file** — use `var` with existence guard:
  ```javascript
  var _myVar = (typeof _myVar !== 'undefined') ? _myVar : defaultValue;
  ```
- `_myResource` — bare global `let` in compass.html. Use as `_myResource` NOT `window._myResource`
- `_resources` — bare global `let` in compass.html. Use as `_resources` NOT `window._resources`
- `API` — bare global from api.js. Use as `API` NOT `window.API`
- `FIRM_ID` — `const` in compass.html, may not be on `window`. Use `_mwFirmId()` helper
- `SUPA_URL` — `const` in config.js, may not be on `window`. Use `_mwSupaURL()` helper
- `SUPA_KEY` — `const` in config.js, may not be on `window`. Use `_mwSupaKey()` helper
- `Auth.getFreshToken().catch(() => Auth.getToken())` — correct token pattern

**Helpers defined at top of `mw-tabs.js`:**
```javascript
function _mwSupaURL()       { try { return SUPA_URL; } catch(_) { return window.SUPA_URL || 'https://dvbetgdzksatcgdfftbs.supabase.co'; } }
function _mwSupaKey()       { try { return SUPA_KEY; } catch(_) { return window.SUPA_KEY || '<anon_key>'; } }
function _mwStorageBucket() { try { return STORAGE_BUCKET; } catch(_) { return window.STORAGE_BUCKET || 'workflow-documents'; } }
function _mwFirmId()        { try { return FIRM_ID; } catch(_) { return window.FIRM_ID || 'aaaaaaaa-0001-0001-0001-000000000001'; } }
```

---

## DATABASE SCHEMA — KEY TABLES

### `workflow_instances` — confirmed columns
`id, firm_id, template_id (nullable), project_id, task_id, title, status, current_step_id, launched_by, launched_at, completed_at, cancelled_at, notes, created_at, updated_at, priority, stakes, pert_*, briefing_*, current_step_name, current_step_type, source_task_id, submitted_by_resource_id, submitted_by_name, workflow_type, attachments (JSONB)`

**Status CHECK constraint (exact values):**
`('pending', 'in_progress', 'complete', 'cancelled', 'overridden')`
- ⚠️ NOT `'completed'`, NOT `'withdrawn'`, NOT `'rejected'`, NOT `'active'`

**No `details` column** — reviewer/approver data stored in `coc_events.event_notes` JSON on `request.submitted` event.

### `workflow_action_items` — confirmed columns
`id, firm_id (NOT NULL), instance_id, title, body, status, owner_resource_id, owner_name, created_by_name, due_date, negotiation_state`

**Current usage for requests (BEING REPLACED — see next priority):**
- `"Review request: <title>"` → assigned to each reviewer
- `"Approve request: <title>"` → assigned to approver
- `"✓ Approved: <title>"` → notification to submitter on final approval

### `coc_events` — key fields
`id, firm_id, entity_id (=instance_id), entity_type, event_type, event_class, severity, event_notes (JSONB), actor_name, actor_resource_id, occurred_at, created_at`

**Event types used by My Requests:**
`request.submitted, request.approved, request.changes_requested, request.withdrawn`

**`request.submitted` event_notes shape:**
```json
{
  "workflow_type": "doc-review",
  "title": "...",
  "docs": [{"id","name","path","url","size","mime","source"}],
  "reviewers": [{"id","name","email","dept","title"}],
  "approver": {"id","name","email","dept","title"},
  "deadline": "YYYY-MM-DD",
  "instructions": "...",
  "doc_count": 1,
  "doc_names": "..."
}
```

### `notes_workspace` — My Views / My Notes shared table
**⚠️ My Views and My Notes share this table** — reads `state.viewsWorkspace` sub-key for Views, `state.views` for Notes. **This needs to be separated into `notes_workspace` and `views_workspace`** (next session work item).

### `external_step_tokens` — CadenceHUD external email responses
Used by CadenceHUD for approve.html token-based responses. My Requests does NOT yet use this.

---

## MY REQUESTS — CURRENT IMPLEMENTATION

### Flow: Document Review (3-step)
```
Submit → Review → Approve
```
- Any reviewer can **Request changes** → loops back, CoC records why, indefinitely
- Approver can **Reject** → loops back
- Workflow completes only when Approver explicitly approves → `status = 'complete'`
- Each cycle accrues CoC events — the audit trail IS the record of rounds

### Files involved
- **`mw-tabs.js`** — My Requests tab UI, submit form, PersonPicker integration, Active/History rendering
- **`mw-events.js`** — Review panel (`openRequestReviewPanel`, `_rrpSubmit`), action item routing
- **`mw-core.js`** — My Work queue rendering, polling, `_wiItems` population

### Key functions
| Function | File | Purpose |
|---|---|---|
| `loadUserRequests()` | mw-tabs.js | Fetch workflow_instances for current user |
| `myrSubmitWorkflow(wfId)` | mw-tabs.js | Submit doc-review form, create action items, write CoC |
| `myrWithdrawRequest(instanceId)` | mw-tabs.js | Cancel request, only resolve submitter's own items |
| `openRequestReviewPanel(item, isApprover)` | mw-events.js | Open review/approve panel for reviewers |
| `_rrpSubmit(actionItemId, instanceId, decision)` | mw-events.js | Process review decision, advance step, notify |
| `_myrNotify({...})` | mw-tabs.js | Send email via `/api/notify-step-activated` |

### Email notification triggers
1. **On submit** — fires to each reviewer and approver via `_myrNotify`
2. **On last reviewer approves** — fires to approver (checks if only "Approve request:" remains open)
3. **On review decision** — fires to submitter

### Step advancement logic (`_rrpSubmit`)
- Reviewer approves → `current_step_name = 'Approve'`, `status = 'in_progress'`
- Reviewer requests changes → `current_step_name = 'Review'`, `status = 'in_progress'`
- Approver approves → `status = 'complete'`, `current_step_name = 'Approve'`

### CoC integration
Step progress derived from `current_step_name` in DB (always available). CoC events load asynchronously and refine the view. Reviewer decisions + comments visible in step tooltip on hover.

### Attachment handling
- Upload goes to `workflow-documents` bucket: `requests/{uuid}/{filename}`
- Signed URL fetch: `POST /storage/v1/object/sign/workflow-documents/{path}` → returns `signedURL` (uppercase)
- Full URL: `${SUPA_URL}/storage/v1${signedURL}`

### Active tab polling
`mw-core.js` polls `workflow_action_items` every 15 seconds for new open items. Run `_pollNow()` in console to trigger manually. Logs `[Poll #N] X open items | Y new`.

---

## ⚠️ TOP PRIORITY FOR NEXT SESSION

### Create `workflow_requests` table — separate class from action items

**The problem:** Review/Approve requests are shoehorned into `workflow_action_items` which is designed for LOE-negotiated tasks. This causes constant filter, scoring, and rendering conflicts — every decision needs `title.startsWith('Review request:')` special-casing.

**The solution:** Dedicated `workflow_requests` table.

**Schema:**
```sql
CREATE TABLE workflow_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id           UUID NOT NULL REFERENCES firms(id),
  instance_id       UUID REFERENCES workflow_instances(id),
  role              TEXT NOT NULL CHECK (role IN ('reviewer','approver')),
  title             TEXT NOT NULL,
  body              TEXT,
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','resolved','cancelled')),
  owner_resource_id UUID NOT NULL,
  owner_name        TEXT,
  created_by_name   TEXT,
  due_date          DATE,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE workflow_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can access" ON workflow_requests
  FOR ALL USING (auth.role() = 'authenticated');
```

**Code changes required:**
1. `myrSubmitWorkflow` → POST to `workflow_requests` instead of `workflow_action_items`
2. `_rrpSubmit` → PATCH `workflow_requests` instead of `workflow_action_items`
3. `_mwLoadUserView` (mw-core.js) → add 4th parallel fetch: `workflow_requests?owner_resource_id=eq.${resId}&status=eq.open`
4. My Work queue → add "**PENDING REVIEWS**" section rendered separately, above action items, no date/type filters ever applied
5. Recommended Sequence → score `workflow_requests` at fixed 900pts, separate from action items
6. Polling → watch `workflow_requests` instead of `workflow_action_items`
7. Routing in `mw-events.js` → check `workflow_requests` table, not title prefix heuristic

**Migration for existing data:**
```sql
-- After creating table, migrate existing open review items
INSERT INTO workflow_requests (id, firm_id, instance_id, role, title, body, status,
  owner_resource_id, owner_name, created_by_name, due_date, created_at)
SELECT id, firm_id, instance_id,
  CASE WHEN title LIKE 'Review request:%' THEN 'reviewer' ELSE 'approver' END,
  title, body, status, owner_resource_id, owner_name, created_by_name, due_date, created_at
FROM workflow_action_items
WHERE title LIKE 'Review request:%' OR title LIKE 'Approve request:%';
```

---

## OTHER PENDING WORK

### My Views / My Notes separation
- Both use `notes_workspace` table, `state.viewsWorkspace` sub-key
- `my-views.html` has `const FIRM_ID` and `const WIDGET_REGISTRY` at top level — throws SyntaxError on re-injection
- **Fix:** Change to `var` with guard, OR separate into distinct script blocks
- **Longer fix:** Create `views_workspace` table, migrate data

### My Requests — remaining Slice 1 items
- [ ] Evidence PDF generation on form completion
- [ ] HUDNotif badge integration for pending reviews
- [ ] Email delivery verification (Vaughn W. Staples gmail not yet confirmed received)
- [ ] `approve.html` token-based external response (currently external approver must log in)

### Slice 2 — PTO Request
- [ ] My Requests → CadenceHUD live wiring
- [ ] PM approval in My Work
- [ ] My Calendar auto-block on approval
- [ ] Capacity recalculation in My Views

### Slice 3 — Timesheet Approval
- [ ] Approval via CadenceHUD flow
- [ ] Approved records locked/read-only

---

## KNOWN BUG PATTERNS

| Symptom | Root cause | Fix |
|---|---|---|
| `Identifier already declared` SyntaxError | `let`/`const` at top of mw file, re-injected | Change to `var` with `typeof` guard |
| `window._myResource` undefined | `_myResource` is `let` in compass scope, not on `window` | Use bare `_myResource` |
| `FIRM_ID is not defined` | `const` in config.js, block-scoped | Use `_mwFirmId()` helper |
| `SUPA_KEY is not defined` | Same as above | Use `_mwSupaKey()` helper |
| My Views shows empty widgets | `_widgetContext` undefined due to `const` collision on re-inject | `loadMyViewsView` detects and reloads once |
| Workflow status 400 | CHECK constraint: only `pending/in_progress/complete/cancelled/overridden` | Never use `completed/withdrawn/rejected/active` |
| Signed URL "invalid path" | Supabase returns `signedURL` (uppercase), path is `/object/sign/...` not full URL | Prepend `${SUPA_URL}/storage/v1${signedURL}` |
| Action items hidden in work queue | Date range filter excludes items due outside current week | Review/Approve requests now exempt from date filter |
| All steps green despite partial CoC | `status=complete` marked all steps done | Steps now derived from `cocDoneCount` + `current_step_name` |
| Review item not in work queue | `workflow_action_items` filtered by date range | **Root fix: create `workflow_requests` table** |

---

## WORKFLOW_INSTANCES STATUS REFERENCE
```
pending      → submitted, initial state (new: use in_progress instead)
in_progress  → actively under review/revision
complete     → fully approved by approver
cancelled    → withdrawn by submitter
overridden   → admin force-close
```

---

## ARCHITECTURE NOTES

### CadenceHUD Integration Points
- `cdn-form-editor.js` — Form engine, released forms usable as request attachments
- `/api/notify-step-activated` — Email dispatch endpoint (used by both CadenceHUD and My Requests)
- `external_step_tokens` table — Token-based external response (CadenceHUD only, My Requests TODO)
- Form preview mode shows: lifecycle DAG, approval chain panel, chronological activity feed, comments thread — **candidate for integration into My Requests Active card**

### What CadenceHUD Does Well That My Requests Needs
1. Chronological activity timeline with role badges (Editor/Reviewer/Approver)
2. Approval process panel — each person's status with avatar + date
3. Comments thread anchored to timeline
4. The form preview panel is already built and could be linked from My Requests when a CadenceHUD form is attached

### Real-time Push (Future)
Currently using 15-second polling. Target architecture:
- Supabase Realtime subscription on `workflow_requests` filtered by `owner_resource_id`
- Instant delivery without polling
- Foundation for future ProjectHUD server with WebSocket client registry

---

## SESSION SUMMARY — WHAT WAS BUILT TODAY

This session built the complete **My Requests → Document Review** flow from scratch:

1. **Submit form** — PersonPicker for reviewers/approver, file upload, CadenceHUD form picker, date picker for deadline
2. **Active tab** — Live request cards with step progress (Submit/Review/Approve), CoC panel, documents, Withdraw, Add context
3. **History tab** — Expandable cards with full CoC, step progress, attachments
4. **Review panel** — Triggered from My Work RATE button, Approve/Request changes with comments
5. **CoC integration** — Every action writes immutable audit events, comments included
6. **Step tooltip** — Hover shows each reviewer's name, decision status, timestamp, comments
7. **Email notifications** — Via `/api/notify-step-activated` to external approver on all-reviewers-complete
8. **Withdraw** — Professional modal, cancels instance, only resolves submitter's own items, badge updates
9. **Polling** — 15-second poll for new action items, `_pollNow()` manual trigger
10. **Work queue fixes** — Cancelled instance filtering, date range exemption for review items, WITHDRAWN tag with auto-resolve

**End-to-end flow tested:** Vaughn submits → Alan reviews → step advances → approver notified → History shows full audit trail.
