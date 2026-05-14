# ProjectHUD — Accord Schema Inventory (Living Document)
## Last updated: 2026-05-10 · Through C-07 · CMD-ACCORD-SETUP-AGENDA-ENHANCED-1

This document is the authoritative schema reference for the Accord module substrate.
Updated after every CMD that touches the database. Future architects: read this before
querying `information_schema`. Do not guess column names — they are confirmed here.

---

## §1 — Confirmed tables and columns

### `accord_meetings`
**PK:** `meeting_id UUID`
**Canonical select list (as of C-07):**
`meeting_id, firm_id, title, workstream_id, scheduled_for, created_at, sealed_at, state, organizer_id, briefing_text, duration_minutes, stakes, location`

| Column | Type | Notes |
|---|---|---|
| `meeting_id` | uuid | PK |
| `firm_id` | uuid | FK → firms(id) |
| `project_id` | uuid | FK → projects(id) — nullable |
| `title` | text | contenteditable in Setup shell |
| `organizer_id` | uuid | FK → **auth.users(id)** NOT resources(id) — confirmed C-04 |
| `scheduled_for` | timestamptz | |
| `duration_minutes` | integer | nullable — added C-02 (MEETING-SETUP-1 Phase 7) |
| `state` | text | CHECK: `idle \| running \| closed` — confirmed C-02 |
| `started_at` | timestamptz | |
| `ended_at` | timestamptz | |
| `sealed_at` | timestamptz | |
| `merkle_root` | text | |
| `agenda_locked` | boolean | |
| `workstream_id` | uuid | FK → workstreams; nullable (parking-lot meetings) |
| `briefing_text` | text | nullable — added MEETING-SETUP-1 Phase 2 |
| `stakes` | text | nullable — added C-02 |
| `location` | text | nullable — added C-02 |
| `created_at` | timestamptz | |

**Triggers:**
- `accord_meetings_field_gate_trg` (BEFORE UPDATE) — gates `briefing_text`, `stakes`, `location`; immutable once `state <> 'idle'`; organizer-only for `briefing_text` and `stakes`

**RLS policies (confirmed C-02):**
- SELECT: `firm_id = my_firm_id()`
- INSERT: `firm_id = my_firm_id() AND organizer_id = auth.uid()`
- UPDATE: `firm_id = my_firm_id()` (permissive; field-level gates via trigger)
- DELETE: `firm_id = my_firm_id() AND organizer_id = auth.uid() AND sealed_at IS NULL`

---

### `accord_nodes`
**PK:** `node_id UUID`

| Column | Type | Notes |
|---|---|---|
| `node_id` | uuid | PK |
| `firm_id` | uuid | FK → firms |
| `thread_id` | uuid | |
| `meeting_id` | uuid | FK → accord_meetings |
| `agenda_item_id` | uuid | FK → accord_agenda_items; nullable |
| `tag` | text | `note \| decision \| action \| risk \| question \| dissent` — confirmed C-05 |
| `summary` | text | |
| `body` | text | |
| `attachments` | jsonb | |
| `created_at` | timestamptz | |
| `created_by` | uuid | FK → **auth.users(id)** NOT resources(id) — confirmed C-04 V5 |
| `sealed_at` | timestamptz | |
| `status` | text | |
| `declared_belief_at_commit` | integer | |
| `declared_need` | text | |
| `success_criteria` | text | |
| `validation_due` | date | |
| `declared_addresses_need` | integer | |
| `compass_action_ref` | text | |
| `prev_node_hash` | text | |
| `node_hash` | text | |
| `seq_class` | character | |
| `seq_number` | integer | |
| `seq_id` | text | e.g. DC-014, AX-091 |
| `dissented_by` | uuid | FK → auth.users(id); populated on dissent nodes |
| `dissent_rationale` | text | |
| `dissent_predicted_outcome` | text | |
| `dissent_recorded_at` | timestamptz | |
| `effective_date` | date | |
| `due_date` | date | populated on action nodes |

**Tag canonical display order:** Note (N) · Decision (D) · Action (A) · Risk (R) · Question (Q) · Dissent (Di)
*Locked 2026-05-09 per MEETING-SETUP-1 Phase 6 close-out*

---

### `accord_agenda_items`
**PK:** `agenda_item_id UUID`

| Column | Type | Notes |
|---|---|---|
| `agenda_item_id` | uuid | PK |
| `firm_id` | uuid | FK → firms |
| `meeting_id` | uuid | FK → accord_meetings |
| `position` | integer | sort order |
| `title` | text | |
| `status` | text | CHECK: `pending \| discussed \| skipped` (confirmed C-03) |
| `sealed_at` | timestamptz | |
| `created_at` | timestamptz | |
| `pulled_from_node_id` | uuid | nullable — FK → accord_nodes; added MEETING-SETUP-1 Phase 3 |
| `pulled_from_tag` | text | nullable — added MEETING-SETUP-1 Phase 4 |
| `item_type` | text | nullable — CHECK: `DECIDE\|ASSIGN\|INFORM\|RISK\|QUESTION`; added C-07 |
| `duration_minutes_estimate` | integer | nullable — added C-07; feeds C-13 budget bar |

---

### `accord_nras`
**PK:** `nra_id UUID`

State machine: `declared → resolved \| superseded \| deferred`; `deferred → declared`; `waived` (terminal for UPDATE; not insert-blocking)

**UPDATE RLS:** disjoint per-transition policies per IR73 (5 policies — confirmed CMD-ACCORD-NRA-SUBSTRATE-1)

**Views:** `accord_nras_current` — returns the current NRA for each node (confirmed C-06 V5 carry-forward)

---

### `accord_meeting_outcomes`
**PK:** `outcome_id UUID`
*Added C-03 · CMD-ACCORD-SETUP-OUTCOMES-1*

| Column | Type | Notes |
|---|---|---|
| `outcome_id` | uuid | PK |
| `firm_id` | uuid | FK → firms |
| `meeting_id` | uuid | FK → accord_meetings ON DELETE CASCADE |
| `verb` | text | CHECK: `RESOLVE\|SEAL\|DECIDE\|ASSIGN\|DEFER\|INFORM` |
| `description` | text | |
| `owner_resource_id` | uuid | nullable FK → resources(id) |
| `condition` | text | nullable — for DEFER type |
| `status` | text | CHECK: `open\|achieved\|partial\|carried\|abandoned`; DEFAULT 'open' |
| `position` | integer | |
| `resolved_at` | timestamptz | nullable |
| `created_at` | timestamptz | |
| `created_by` | uuid | nullable FK → users(id) |

**Triggers:** `accord_meeting_outcomes_state_gate_trg` (BEFORE INSERT OR UPDATE) — rejects if parent meeting `state <> 'idle'`

**IR73 note:** UPDATE policy currently gates on `status='open'` only (pre-meeting prep phase). Disjoint per-transition UPDATE policies for ratification (open→achieved etc.) are deferred to X-03 (CMD-ACCORD-OUTCOME-RATIFICATION-1).

---

### `accord_meeting_attendees`
**PK:** `attendee_id UUID`
*Added C-04 · CMD-ACCORD-SETUP-ATTENDEES-1*

| Column | Type | Notes |
|---|---|---|
| `attendee_id` | uuid | PK |
| `firm_id` | uuid | FK → firms |
| `meeting_id` | uuid | FK → accord_meetings ON DELETE CASCADE |
| `resource_id` | uuid | FK → resources(id) |
| `role_in_meeting` | text | CHECK: `organizer\|lead\|participant\|observer`; DEFAULT 'participant' |
| `rsvp_status` | text | CHECK: `pending\|accepted\|declined\|tentative`; DEFAULT 'pending' |
| `invited_at` | timestamptz | DEFAULT now() |
| `created_at` | timestamptz | |

**UNIQUE constraint:** `(meeting_id, resource_id)` — one row per attendee per meeting

**Organizer auto-seeded** at Setup shell render if absent.

---

### `accord_meeting_intel_notes`
**PK:** `note_id UUID`
*Added C-08 · CMD-ACCORD-SETUP-INTELLIGENCE-1*

| Column | Type | Notes |
|---|---|---|
| `note_id` | uuid | PK |
| `firm_id` | uuid | FK → firms |
| `meeting_id` | uuid | FK → accord_meetings ON DELETE CASCADE |
| `author_resource_id` | uuid | FK → resources(id) |
| `body` | text | DEFAULT '' |
| `is_private` | boolean | DEFAULT TRUE — never surfaced in minutes or shared records |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**RLS:** author-only SELECT/INSERT/UPDATE/DELETE. Policy uses `resources.user_id = auth.uid()` subquery.
**Index:** `(meeting_id, author_resource_id)`

---

### `accord_edges`
**PK:** `edge_id UUID`

| Column | Type | Notes |
|---|---|---|
| `edge_id` | uuid | PK |
| `firm_id` | uuid | FK → firms |
| `from_node_id` | uuid | FK → accord_nodes |
| `to_node_id` | uuid | FK → accord_nodes; nullable |
| `to_external_ref` | text | nullable — for external cross-references |
| `edge_type` | text | e.g. `precedence`, `supports`, `contradicts` |
| `rationale` | text | |
| `declared_at` | timestamptz | |
| `declared_by` | uuid | FK → auth.users(id) |
| `sealed_at` | timestamptz | |
| `edge_hash` | text | |

*Confirmed C-07 V6 — 2026-05-10*

---

### `accord_belief_adjustments`
**PK:** `adjustment_id UUID`

| Column | Type | Notes |
|---|---|---|
| `adjustment_id` | uuid | PK |
| `firm_id` | uuid | |
| `target_node_id` | uuid | FK → accord_nodes (decision nodes) — confirmed C-06 V3 |
| `delta` | integer | positive = belief strengthened; negative = weakened |
| `rationale` | text | |
| `declared_at` | timestamptz | |
| `declared_by` | uuid | FK → **auth.users(id)** — confirmed C-06 V3 |
| `linked_evidence_node_id` | uuid | nullable |
| `sealed_at` | timestamptz | |
| `adjustment_hash` | text | |

---

### `accord_workstreams` (= `workstreams`)
**Note:** table is named `workstreams` in queries, not `accord_workstreams`
**Confirmed from:** accord-views.js line 47 `workstreams?state=eq.active`

| Column | Type | Notes |
|---|---|---|
| `workstream_id` | uuid | PK |
| `firm_id` | uuid | |
| `name` | text | |
| `state` | text | `active \| archived` |
| `project_id` | uuid | nullable FK → projects(id) — **added C-07**; enables Risks tab |
| `created_at` | timestamptz | |

---

### `accord_minutes_renders`
| Column | Type | Notes |
|---|---|---|
| `render_id` | uuid | PK |
| `firm_id` | uuid | |
| `meeting_id` | uuid | FK → accord_meetings |
| `rendered_at` | timestamptz | |
| `rendered_by` | uuid | |
| `render_version` | text | |
| `storage_path` | text | |
| `content_hash` | text | |
| `merkle_root_at_render` | text | |
| `status` | text | |
| `failure_reason` | text | |
| `byte_size` | bigint | |
| `page_count` | integer | |
| `template_id` | text | |

---

## §2 — Adjacent tables (non-Accord, referenced by Accord surface)

### `resources`
**PK:** `resources.id UUID` *(confirmed C-03 V1)*
**Name column:** `resources.name` *(confirmed C-03 V1)*
**User link:** `resources.user_id` → auth.users(id) *(confirmed C-04 V4)*

Used for: attendee display names, action ownership, outcome owner chips, organizer seed.

### `risk_register`
**PK:** `risk_register.id UUID` *(confirmed C-06 V1)*
**Score column:** `weighted_score` *(confirmed C-06 V1)*
**Description columns:** `description` with `title` as fallback *(confirmed C-06 V1)*
**Status column:** `status` (USER-DEFINED type — valid values TBD) *(C-06 V1)*
**FK:** `project_id` → projects(id) *(confirmed C-06 V1)*
**RLS:** `risk_register_internal` — ALL cmd, firm-scoped + `NOT is_client()` *(confirmed C-06 V2)*

**Join path to workstream:** `workstreams.project_id → projects.id ← risk_register.project_id`
*This join path was missing until C-07 added `workstreams.project_id`. Now active once populated.*

### `projects`
Referenced by `risk_register.project_id` and `workstreams.project_id`.

### `firms`
**Referenced everywhere.** `my_firm_id()` is a Supabase function returning the current user's firm.

---

## §3 — Critical identity resolution pattern

**This is the most common source of defects across CMDs. Read carefully.**

| Field | Type | Table |
|---|---|---|
| `auth.uid()` | users.id | auth.users |
| `accord_meetings.organizer_id` | users.id | auth.users |
| `accord_nodes.created_by` | users.id | auth.users |
| `accord_nodes.dissented_by` | users.id | auth.users |
| `accord_belief_adjustments.declared_by` | users.id | auth.users |
| `accord_edges.declared_by` | users.id | auth.users |
| `accord_meeting_attendees.resource_id` | resources.id | resources |
| `accord_meeting_outcomes.owner_resource_id` | resources.id | resources |

**Join pattern:** `users.id → resources.user_id → resources.id`

When matching node ownership to attendees, you must traverse this join. Direct comparison of `created_by` (users.id) to `resource_id` (resources.id) will always fail silently.

*Confirmed C-04 V4, C-05 V5*

---

## §4 — RLS function reference

| Function | Returns | Used in |
|---|---|---|
| `my_firm_id()` | uuid | All RLS policies — firm-scoping |
| `auth.uid()` | uuid (users.id) | Organizer gates, owner checks |
| `is_client()` | boolean | risk_register RLS |

---

## §5 — Trigger inventory

| Table | Trigger name | Event | Function | Purpose |
|---|---|---|---|---|
| `accord_meetings` | `accord_meetings_field_gate_trg` | BEFORE UPDATE | `accord_meetings_field_gate()` | Gates `briefing_text`, `stakes`, `location` — immutable once `state <> 'idle'` |
| `accord_meeting_outcomes` | `accord_meeting_outcomes_state_gate_trg` | BEFORE INSERT OR UPDATE | `accord_meeting_outcomes_state_gate()` | Rejects if parent meeting `state <> 'idle'` |
| `accord_nras` | (5 RLS policies, no triggers) | — | — | State-machine via disjoint UPDATE RLS per IR73 |

**Note:** `accord_meetings_briefing_text_gate_trg` was the original trigger name — **it was dropped and replaced by `accord_meetings_field_gate_trg` in C-02**. If you see the old name in any document, it is stale.

---

## §6 — Open substrate gaps

| Gap | Impact | Target CMD |
|---|---|---|
| `workstreams.project_id` requires manual population | Risks tab shows empty state until populated | Operator-managed; no CMD needed |
| `risk_register.status` valid values unknown | Risks tab cannot filter by status | C-08 or follow-on |
| `accord_meeting_intel_notes` table not yet created | Intelligence Mode has no private notes substrate | C-08 |
| Disjoint UPDATE RLS for `accord_meeting_outcomes.status` transitions | Outcome ratification cannot update status | X-03 |
| No `accord_meetings.summary` column | Last meeting block in Briefing tab uses `briefing_text` as fallback | Future CMD if needed |
| Double `setLevel` from `accord-rails.js:331` | Rail flash on NEXT navigation | Pre-C-13 micro-fix |

---

## §8 — C-07 additional findings


**`accord_nras_current` columns confirmed (C-08 V2):** `node_id`, `state`, `deferred_at` present. `declared_at` absent — use `created_at` for age derivation.

**`accord_nodes.status` for action nodes:** value `committed` only. Overdue detection must use `due_date < now()` exclusively — status-based detection not applicable.

**Intelligence derivation thresholds (C-08, configurable constants):**
- DISSENT·SIMMERING: dissent age ≥ 14 days
- OVERDUE·PRESSURE: 2+ overdue actions (due_date < now())
- QUIET·RE-ONBOARD: zero nodes authored, zero actions
- ENGAGED·STEADY: default
- Urgency "move now" suffix: dissent age ≥ 20 days

**Position collision on INSERT:** `accord_agenda_items.position` must use `max(position) + 1` at insert time, not `items.length`. Items may have non-contiguous positions after reorders. *Fixed C-07.*

**Drag-to-reorder position swap:** requires three-step swap via temp position `-1` to avoid UNIQUE constraint collision when two rows swap values. Sequential PATCHes: set A→-1, set B→A's old value, set A→B's old value. *Fixed C-07.*

**`accord_edges` ref chips:** `from_node_id`, `to_node_id`, `edge_type` confirmed. Ref chips on agenda items deferred to follow-on CMD — low priority in v1.

**`accord_agenda_items.status` valid values:** `pending | discussed | skipped` *(confirmed C-03, carry-forward)*

---



### `accord_chat_messages`
**PK:** `message_id UUID`
*Added A-08 · CMD-ACCORD-CAPTURE-CHAT-1*

| Column | Type | Notes |
|---|---|---|
| `message_id` | uuid | PK |
| `firm_id` | uuid | FK → firms |
| `meeting_id` | uuid | FK → accord_meetings ON DELETE CASCADE |
| `author_resource_id` | uuid | FK → resources(id) |
| `body` | text | CHECK length(trim(body)) > 0 |
| `created_at` | timestamptz | DEFAULT now() |

**RLS:** SELECT: all firm members. INSERT: author_resource_id must match caller. UPDATE/DELETE: not permitted — messages are immutable.
**Index:** `(meeting_id, created_at ASC)`
**Realtime:** REPLICA IDENTITY FULL + added to supabase_realtime publication — required for filtered channel subscriptions.

---






## §14 — Session 2026-05-13 evening — rail restructure + policy fix

### `workstreams` RLS — `workstreams_select` amended

Agent amended `workstreams_select` to include `created_by = my_resource_id()`
alongside the existing meeting-visibility EXISTS clause.

**Confirmed:** `workstreams.created_by` stores resource UUIDs (not user UUIDs).
`my_resource_id()` correctly resolves for Vaughn. INSERT confirmed working via
both API and UI modal — no regression.

**Current SELECT policy qual:**
```sql
firm_id = my_firm_id()
AND (
  created_by = my_resource_id()
  OR EXISTS (
    SELECT 1 FROM accord_meetings m
    WHERE m.workstream_id = workstreams.workstream_id
      AND m.firm_id = my_firm_id()
      AND (
        m.organizer_id = auth.uid()
        OR m.meeting_id IN (
          SELECT meeting_id FROM accord_meeting_attendees
          WHERE resource_id = my_resource_id()
            AND firm_id = my_firm_id()
        )
      )
  )
)
```

### `accord_meeting_attendees` — `attendee_can_update_own_rsvp` policy
Already documented in §13. Confirmed working for inline RSVP in My Meetings.

### New files deployed this session

| File | Purpose |
|---|---|
| `accord-my-meetings.js` | Personal meeting dashboard module — LIVE NOW, PENDING, UPCOMING |
| `accord-slideshow.js` | Constellation onboarding slideshow — 5 slides, auto-advance, localStorage dismiss |

### Open items from this session

**O1 — My Meetings behavioral rework:** Full-page overlay pattern replaced
by tabbed rail pattern. `accord-my-meetings.js` render functions will be
reworked to produce narrow rail-width cards. Tab switching lives in
`accord-rails.js`. Brief pending — CMD-ACCORD-MY-MEETINGS-2.

**O2 — `accord.html` rail restructure pending deploy:**
`.ac-rail-personal` / `.ac-rail-divider` / `.ac-rail-workstreams` HTML
wrappers specified but not yet deployed by operator.

**O3 — Slideshow zero-workstream path not confirmed with Angela:**
Smoke tests 1–10 passed against force-mounted slideshow. Natural trigger
(Angela with no organized workstreams) not yet tested.

**O4 — `cmd-center.js` heartbeat payload warnings:** Pre-existing, out of
Accord scope. Flag for Chris (CommandHUD).

---

## §13 — CMD-ACCORD-MY-MEETINGS-1 (2026-05-13)

### `accord_meeting_attendees` — new RLS policy

**Policy name:** `attendee_can_update_own_rsvp`
**Command:** UPDATE
**Role:** authenticated
**USING / WITH CHECK:**
```sql
resource_id = (SELECT id FROM resources WHERE user_id = auth.uid() LIMIT 1)
```
**Purpose:** Allows an invited attendee to update their own `rsvp_status` via
authenticated session (inline RSVP in MY MEETINGS dashboard). Previously only
the organizer could UPDATE attendee rows. Required for inline Accept/Decline
without token-based flow.

### New files added

| File | Purpose |
|---|---|
| `accord-my-meetings.js` | New module — full personal meeting dashboard (LIVE NOW, PENDING, UPCOMING) |

### Files amended

| File | Change |
|---|---|
| `accord-rails.js` | Rail item injection for MY MEETINGS nav + keyboard parity |
| `accord-views.css` | `.ac-mm-*` styles + Back button contrast fix |

---

## §12 — A-09 findings (2026-05-13)

### `accord.html` `:root` token block added

All `--ac-*` CSS custom properties now defined globally in `accord.html` `:root`.
Values sourced verbatim from `accord-meeting-setup.css` — authoritative source per IR66.

**Critical finding:** `accord-meeting-setup.css` loads AFTER `accord-views.css` in
`accord.html`. Same-named CSS rules in the Setup shell file override `accord-views.css`
rules by source order. Use `!important` on any `accord-views.css` rule that must
override a same-named rule in `accord-meeting-setup.css`.

**Cache-bust note:** `accord-views.css` link in `accord.html` requires a `?v=` param
to bust Vercel CDN cache on deploy. Update param on every CSS-only deploy.

### IR66 — Token value doctrine
Token values must always be sourced from deployed CSS files, never from architect
memory or spec documents. Deployed CSS wins over any architect specification.

### IR67 — File header version discipline
Every modified file must have version string + modification date in header comment
before deployment. Version must match version.js pin (IR65).

---

## §11 — CMD-ACCORD-INVITATION-PIPELINE-1 (2026-05-13)

### `accord_invitation_tokens`
**PK:** `token_id UUID`
*Added PIPELINE-1 Phase A*

| Column | Type | Notes |
|---|---|---|
| `token_id` | uuid | PK |
| `firm_id` | uuid | FK → firms |
| `meeting_id` | uuid | FK → accord_meetings ON DELETE CASCADE |
| `attendee_id` | uuid | FK → accord_meeting_attendees ON DELETE CASCADE |
| `recipient_email` | text | NOT NULL |
| `recipient_name` | text | nullable |
| `token` | text | UNIQUE, DEFAULT gen_random_uuid()::text |
| `expires_at` | timestamptz | DEFAULT now() + interval '7 days' |
| `issued_at` | timestamptz | DEFAULT now() |
| `opened_at` | timestamptz | nullable |
| `used_at` | timestamptz | nullable |
| `outcome` | text | CHECK IN ('accepted','declined','tentative') |
| `ip_at_open` | text | nullable |
| `ip_at_submit` | text | nullable |

**RLS:** SELECT: `true` (anon by token knowledge). INSERT: firm-gated.
UPDATE: `true` (RSVP writeback by Edge Function with service role key).

### Edge Functions added

| Function | Purpose |
|---|---|
| `notify-meeting-invitation` | Sends invitation email via Resend. Called from Setup shell on Save & invite. |
| `respond-meeting-rsvp` | Consumes token, writes `rsvp_status` to `accord_meeting_attendees`, emails organizer. |

### `accord_meeting_attendees` realtime

```sql
ALTER TABLE accord_meeting_attendees REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE accord_meeting_attendees;
```

### `APP_URL` environment note

`APP_URL` in Edge Function secrets resolves to
`https://project-hud-landing.vercel.app` — not `projecthud.com`.
`meeting-rsvp.html` is deployed to `project-hud-landing.vercel.app`.

### Open items from PIPELINE-1

**F1 — Resend domain verification (HIGH):**
Currently in sandbox mode — sends limited to verified personal email.
Verify `projecthud.com` or `project-hud-landing.vercel.app` in Resend Domains
before inviting real external attendees.

**F2 — Resend click tracking SSL:** Resolves when F1 completes.

**F3 — Behavioral badges drop on RSVP poll re-render:** `_loadAttendees`
re-render in accord-meeting-setup.js drops intel behavioral tags. Pre-existing
issue made visible by 10s poll. Follow-on required.

**F4 — `attendee_id` internal RSVP path:** `meeting-rsvp.html?attendee_id=<id>`
shows placeholder. Full authenticated writeback for internal users deferred.

---

## §10 — CMD-ACCORD-MEETING-VISIBILITY-1 findings (2026-05-12)

### `my_resource_id()` — canonical substrate helper

```sql
CREATE OR REPLACE FUNCTION my_resource_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM resources
  WHERE user_id = auth.uid() AND firm_id = my_firm_id()
  LIMIT 1;
$$;
```

Returns the `resources.id` for the authenticated user within their firm.
Returns NULL if no resource row is linked (cross-firm resource, unlinked user).
**Cannot be tested from Supabase SQL editor** — `auth.uid()` returns NULL outside
authenticated PostgREST context. Verify via authenticated RPC from browser console.

### `accord_meetings` SELECT policy (amended)

```sql
CREATE POLICY accord_meetings_select ON accord_meetings
  FOR SELECT USING (
    firm_id = my_firm_id()
    AND (
      organizer_id = auth.uid()
      OR meeting_id IN (
        SELECT meeting_id FROM accord_meeting_attendees
        WHERE resource_id = my_resource_id() AND firm_id = my_firm_id()
      )
    )
  );
```

### `workstreams` SELECT policy (amended)

**Note:** table is `workstreams` not `accord_workstreams`.

```sql
CREATE POLICY workstreams_select ON workstreams
  FOR SELECT USING (
    firm_id = my_firm_id()
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM accord_meetings m
        WHERE m.workstream_id = workstreams.workstream_id
          AND m.firm_id = my_firm_id()
          AND (
            m.organizer_id = auth.uid()
            OR m.meeting_id IN (
              SELECT meeting_id FROM accord_meeting_attendees
              WHERE resource_id = my_resource_id() AND firm_id = my_firm_id()
            )
          )
      )
    )
  );
```

### Key findings from visibility implementation

**F1 — Rail orphan workstreams:** Child workstreams whose parent is invisible
to the user are dropped by the rail tree-builder. Substrate returns correct rows.
UI fix queued as X-17 · CMD-ACCORD-RAILS-ORPHAN-FIX-1 (Option A: promote to root).

**F2 — Cross-firm resource invitations:** Resources with `firm_id` ≠ `users.firm_id`
resolve to NULL via `my_resource_id()`. Invitations to such resources are silently
inert — the invitee cannot see the meeting. Setup shell validation warning planned
for CMD-ACCORD-INVITATION-PIPELINE-1.

**F3 — `_mwSupaURL`/`_mwSupaKey` helpers:** Absent on some authenticated sessions.
Timing/playbook dependency suspected. Low priority — note here, investigate when
it blocks a diagnostic.

**Rollback SQL preserved in close-out document.**

---

## §9 — C-13 and X-series findings


**Supabase realtime table pattern (A-08, canonical):**
Any table requiring realtime INSERT/UPDATE/DELETE events must:
1. `ALTER TABLE <table> REPLICA IDENTITY FULL;`
2. `ALTER PUBLICATION supabase_realtime ADD TABLE <table>;`
Both steps required — omitting either causes silent subscription failure.
Filter pattern: `meeting_id=eq.<uuid>` on the channel subscription.

**`accord_meetings.duration_minutes` edit path (X-12):** No UI path existed to set
`duration_minutes` from the Setup shell prior to X-12. The column exists and is confirmed
in the canonical select list. X-12 adds inline edit via the WHEN row in the header.
Column confirmed nullable — `null` means no duration set; budget bar shows empty state.

**`accord_meeting_seal_fn()` — action node exclusion (C-09, confirmed C-13):**
The seal trigger now excludes `tag = 'action'` from both the node-seal loop and the
Merkle root computation. Action nodes have `sealed_at = NULL` permanently. The UPDATE
RLS on `accord_nodes` gates on `sealed_at IS NULL` — this is intentional and correct
for action nodes. Any future CMD touching the seal trigger must preserve this exclusion.

**`accord_meetings.state` transition confirmed live (X-13):**
`startMeeting()` PATCHes `state` from `idle` → `running` and sets `started_at`.
The surface transition is triggered by dispatching `accord:level-changed` on `window`
after the PATCH resolves — not by `loadMeeting()` or `switchSurface()`.
accord-rails listens for `accord:level-changed` and re-routes accordingly.

**`accord_nodes.status` for action nodes:** Value `committed` is set by the seal trigger
for non-action nodes. Action nodes retain `committed` from their original capture but
`sealed_at` is now null. Do not use `status` to determine seal state for action nodes —
use `sealed_at IS NULL` exclusively.

---

## §7 — Version history

| Version | Date | Changes |
|---|---|---|
| v1.0 | 2026-05-10 | Initial inventory. Consolidates IR64 findings from C-01 through C-07. |
| v1.9 | 2026-05-13 | Added §14: workstreams_select policy fix, new files accord-my-meetings.js + accord-slideshow.js, open items O1-O4. |
| v1.8 | 2026-05-13 | Added §13: accord_meeting_attendees attendee_can_update_own_rsvp RLS policy; accord-my-meetings.js new module; accord-rails.js + accord-views.css amendments. |
| v1.7 | 2026-05-13 | Added §12: A-09 findings — :root token block, CSS load order, cache-bust pattern, IR66/IR67 doctrine. |
| v1.6 | 2026-05-13 | Added §11: accord_invitation_tokens, notify-meeting-invitation + respond-meeting-rsvp Edge Functions, accord_meeting_attendees realtime, PIPELINE-1 open items F1–F4. |
| v1.5 | 2026-05-12 | Added §10: my_resource_id() helper, amended RLS policies on accord_meetings + workstreams, F1/F2/F3 findings from VISIBILITY-1. |
| v1.4 | 2026-05-11 | Added accord_chat_messages (A-08); Supabase realtime pattern documented. |
| v1.3 | 2026-05-11 | Added §9: C-13/X-series findings — duration_minutes edit path, seal trigger action exclusion confirmed, startMeeting transition mechanism, action node status clarification. |
| v1.2 | 2026-05-10 | Added accord_meeting_intel_notes table (C-08); accord_nras_current columns; action node status value; intelligence derivation thresholds. |
| v1.1 | 2026-05-10 | Added §8 C-07 findings: position collision pattern, drag swap three-step, edges confirmation, agenda item status values. |

---

*Maintained by: Architect (Pluto) · Operator: Vaughn Staples*
*File in project knowledge. Update after every CMD that touches substrate.*
