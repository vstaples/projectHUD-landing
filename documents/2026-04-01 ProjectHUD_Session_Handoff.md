# ProjectHUD + CadenceHUD — Master Session Handoff
**Last updated:** 2026-04-01 | **Architecture Bible version:** 1.0
**Paste this entire file at the start of each Claude session.**

---

## WHAT THIS PRODUCT IS

A **unified operational intelligence platform for engineering-adjacent professional services firms.** Combines in one application what competitors require 5–8 tools to assemble:

| Layer | Product | Purpose |
|---|---|---|
| Daily operations | **Compass** | My Work, My Time, My Calendar, My Meetings, My Views, My Notes, My Requests |
| PM execution | **ProjectHUD** | CPM/PERT/EVM, Gantt, multi-project dashboard, labor tracking |
| Process control | **CadenceHUD** | Workflow templates, live instances, replay CoC, form engine |

**The moat:** All three layers share a single immutable, replay-capable audit trail. No competitor does this.

**Target market:** Medical device consultancies, aerospace engineering services, contract R&D, QMS consultancies.

**Go-to-market wedge:** My Requests + Document Review workflow. One flow, flawlessly, with full audit trail.

---

## STACK

| Item | Value |
|---|---|
| Supabase Project | dvbetgdzksatcgdfftbs |
| Firm ID | aaaaaaaa-0001-0001-0001-000000000001 |
| Production URL | projecthud.com |
| Storage Bucket | workflow-documents |
| Test form | 8667dcfc-c304-44c5-bde3-34efdbc32cd3 (PCB Design Review Checklist) |
| Vaughn Staples UUID | 57b93738-6a2a-4098-ba12-bfffd1f7dd07 |

---

## FILES

| File | Location |
|---|---|
| cadence.html | Vercel root |
| cdn-form-editor.js | /js/ — primary form module |
| cdn-form-settings.js | /js/ — v20260331-050000, unchanged |
| cdn-form-runtime.js | /js/ — 961 lines, not yet touched |
| vercel.json | Vercel root — no-store on all HTML + JS |

**Current deployed version:** v20260401-230000

---

## IRON RULES — NEVER VIOLATE

- **Version stamp:** `// VERSION: YYYYMMDD-HHMMSS` + orange console badge every build
- **Font:** Arial, sans-serif everywhere, minimum 14px — NO small fonts
- **Amber:** `#c47d18` = CadenceHUD accent. `#f0a030` = bright amber for UI
- **Buttons:** `border-radius:999px` pill, bright colors, `box-shadow` raised appearance
- **State transitions:** ALWAYS use `_formRefreshUI()` instead of `renderFormsTab(el)` — checks `_formPreviewMode` first, stays in preview if active
- **Preview mode:** PERSISTENT — user stays until clicking Exit Preview
- **CoC writes:** Write CoC event BEFORE calling `_formSave()` — add 50ms delay between them
- **My Work is primary inbox:** ALL workflow notifications surface in My Work. Email is secondary. Never build per-module notification silos.

---

## FORM LIFECYCLE STATES

```
draft → in_review → reviewed → approved → released
                                         ↓ Create Revision
                              unreleased (bumps version)

rejected_review    → draft
rejected_approval  → draft
rejected_release   → draft
```

- **Version:** Stays at 0.1.0 through ALL review/reject/revise cycles
- **Bumps ONLY** when editor clicks Create Revision on a Released form
- **Auto-transition on save:** when state is any `rejected_*`, `_formSave()` transitions to draft

---

## TOOLBAR BUTTONS BY STATE

| State | Buttons |
|---|---|
| draft | Save · Submit for Review → |
| unreleased | Save · ✕ Cancel Revision · Submit for Review → |
| rejected_* | Save · [rejection label] · Submit for Review → |
| in_review | ● In Review · ✓ Mark Reviewed · ✗ Reject |
| reviewed | ● Awaiting Approval · ✓ Approve · ✗ Reject |
| approved | ● Approved · ↑ Release |
| released | 🔒 Released · Create Revision · Archive |
| archived | Archived — read only |

---

## COC_EVENTS — actual column names

```
id, firm_id, entity_id, entity_type, event_type,
event_notes (text — JSON stringified),
actor_name, actor_resource_id,
metadata (jsonb), created_at, event_class, severity, occurred_at
```

**RLS policy required:**
```sql
CREATE POLICY "auth_delete" ON coc_events FOR DELETE TO authenticated USING (true);
```

**Always include version in every CoC write** — activity table uses event-time version.

---

## ACTIVITY TABLE — deriveRoleAction() mapping

| from→to | Role | Action |
|---|---|---|
| draft → in_review | Editor | Draft Complete |
| in_review → in_review | Reviewer | Review Approved |
| in_review → reviewed | Reviewer | Review Complete |
| reviewed → approved | Approver | Approved |
| * → rejected_review | Reviewer | Review Rejected |
| * → rejected_approval | Approver | Approval Rejected |
| * → rejected_release | Editor | Rejected |
| approved → released | Editor | Released |
| rejected_* → draft | Editor | Returned to Draft |
| released → unreleased | Editor | Revision Started |
| import → draft | Editor | Form Import Complete |

`form.saved` → shows as "In Draft" (last consecutive only, others suppressed)
`form.archived` → suppressed

---

## CURRENT_USER BOOTSTRAP (in cadence.html before </body>)

Decodes JWT → looks up resources table by user_id → sets:
```javascript
window.CURRENT_USER = {
  id, resource_id, user_id, email, name,
  first_name, last_name, department, title, is_external
}
```

---

## PLATFORM STATUS SNAPSHOT

| Module | Status | Gap |
|---|---|---|
| Compass — My Work | PARTIAL | AI recommendation engine — confirm runs on real data |
| Compass — My Time | PARTIAL | PM approval must use CadenceHUD flow, not standalone |
| Compass — My Calendar | LIVE | Confirm capacity numbers are live |
| Compass — My Meetings | LIVE | Knowledge tree search TBD |
| Compass — My Views | PARTIAL | Widget library needs admin extensibility path |
| Compass — My Notes | PARTIAL | Notes not yet linked to project/meeting/task data model |
| Compass — My Requests | STUB | UI catalog exists. Must wire to real CadenceHUD templates. |
| ProjectHUD — Tasks/EVM | LIVE | Integration contract to CadenceHUD not yet defined |
| CadenceHUD — Templates | PARTIAL | One workflow. Need 3+ to prove the model. |
| CadenceHUD — Instances | PARTIAL | External user access (non-admin) not yet built |
| Form Engine | PARTIAL | Runtime fill, released locking, evidence PDF missing |
| Form — Reviewer Token Flow | STUB | form-review.html is a stub |
| Form — Evidence PDF | PLANNED | Not yet built |
| Form — Released Locking | PLANNED | Must be at _formSave() layer, not just UI |

---

## THREE VERTICAL SLICES — CURRENT PRIORITY

### Slice 1: Document Review (PRIORITY 1)
`My Requests → "Document Review & Sign-off" → CadenceHUD workflow → Form lifecycle → Reviewer token link → Approve/Reject → Evidence PDF → CoC in My Work history`

**Missing:**
- [ ] External reviewer token flow (form-review.html)
- [ ] Released form hard-locking at `_formSave()` layer
- [ ] Evidence PDF generation
- [ ] My Requests wired to real CadenceHUD template
- [ ] Completion surfaces in submitter's My Work

### Slice 2: PTO / Leave Request (PRIORITY 2)
`My Requests → PTO workflow → PM approval in My Work → Calendar auto-block → Capacity update in My Views`

**Missing:**
- [ ] My Requests → CadenceHUD live wiring
- [ ] PM approval in My Work (not separate inbox)
- [ ] My Calendar integration on approval
- [ ] Capacity recalculation in My Views

### Slice 3: Timesheet Approval (PRIORITY 3)
`My Time → submit week → PM approval in My Work → Approved timesheets locked`

**Missing:**
- [ ] Approval must use CadenceHUD flow (not standalone)
- [ ] PM action in My Work
- [ ] Approved records become locked/read-only

---

## INTEGRATION CONTRACTS (not yet formally defined)

**Contract 1: ProjectHUD Task → CadenceHUD Workflow**
- Task declares associated CadenceHUD template
- Task completion optionally gates on workflow completion
- Workflow launch: automatic (on task activation) or manual
- Workflow completion updates task status + logs to task CoC

**Contract 2: CadenceHUD Workflow → My Requests**
- My Requests submission creates real CadenceHUD instance
- Status in My Requests reflects live instance state
- Completion/rejection surfaces in submitter's My Work history

**Contract 3: Notification / Inbox Model**
- My Work is the primary notification surface for ALL workflow types
- Email is secondary only
- Identical model for form reviews, PTO, timesheets, change requests

---

## KNOWN BUGS

| Symptom | Root cause | Fix |
|---|---|---|
| `_formRefreshUI()` self-call | When `_formPreviewMode` is false, calls itself recursively | Add explicit `renderFormsTab(el)` guard |
| Dev ⌫ button exposed | ClearHistory exposed in production | Gate behind `window.CADENCE_DEV === true` |
| Remaining `confirm()` calls | `_formCreateRevision`, `_formArchiveForm`, `_formDeleteWithConfirm` | Replace with modals matching Cancel Revision pattern |
| Old code despite new deploy | Vercel CDN immutable cache | vercel.json no-store on /js/:file* |
| "rows is not defined" | Used rows before async CoC fetch | Render DAG immediately, re-render after fetch |
| Duplicate form on PDF replace | `_unsaved=true` triggered POST | Keep `_unsaved=false`, handle upload in PATCH |
| CoC events out of order | `_formSave` writes `form.saved` internally | Write CoC BEFORE `_formSave` + 50ms delay |
| Preview exits after every action | State transitions called `renderFormsTab` | `_formRefreshUI()` helper |
| "stages is not defined" | Template literal used stages not in scope | `const stages = _formGetStages()` before footer |
| `renderFormsTab` not defined | cdn-core-state loads before cdn-form-editor | Expose on window + stub in cadence.html |
| Clear History didn't work | API.del doesn't exist | Direct fetch() DELETE + RLS policy |

---

## NEXT SESSIONS WORK QUEUE

**Immediate (form engine):**
1. Released form locking — read-only canvas + `_formSave()` hard-reject when state=released. Banner: "🔒 Released — Create Revision to edit"
2. form-review.html — external reviewer token flow. Currently stub. Mark reviewer approved, advance state, notify approver.
3. In-app notifications — badge/alert for pending reviews when reviewer logs in
4. Email delivery test — confirm notify-form-review edge function sends to Gmail

**Polish (form engine):**
5. Section header backgrounds — LIFECYCLE/ACTIVITY/COMMENTS headers need distinct bg color
6. Button raised relief — `box-shadow: 0 2px 4px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.08)`
7. Rework count badge on active DAG node
8. Remaining `confirm()` → modal replacements

**Platform integration:**
9. Define and document Task→Workflow integration contract formally
10. Wire My Requests → first real CadenceHUD template
11. Standardize notification model across My Work

---

## SQL MIGRATIONS APPLIED

```
005_form_lifecycle_v2.sql
006_add_rejected_release_state.sql
Plus RLS fix for coc_events DELETE (see above).
```

---

## ARCHITECTURAL DECISIONS — DO NOT REVISIT

| Decision | Rationale |
|---|---|
| State machine granularity (`rejected_*` substates) | Regulated clients require this. DB-constrained. Do not simplify. |
| CoC write-before-save + 50ms delay | Load-bearing ordering. Changing it causes out-of-sequence activity display. |
| Version pinning to 0.1.0 pre-release | Semantically correct for document control. Non-negotiable. |
| My Work as primary notification surface | Prevents per-module notification silos. Must be enforced across all workflow types. |
| Forward-only My Calendar | Strong opinionated design choice. No rear-view mirror = reduced cognitive load. |
| Field types: review, doc_ref, attendees | Domain-specific differentiators. Keep them. |
| Replay-capable CoC with rework cost | Only possible because hours data lives in the same system. Protect this capability. |

---

*Architecture Bible (Word): ProjectHUD_Architecture_Bible.docx — strategic layer, share with stakeholders*
*This file: tactical session state — update at end of every session*
