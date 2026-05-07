# Brief · Accord Workstreams Substrate · CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1

## §0 — Standing rules for fresh agent

Read before proceeding.

**Iron Rule 36, 37, 38, 39, 40** — base operating discipline.
**Iron Rule 42** — substrate immutability holds. Workstream-related substrate additions are NEW rows referencing sealed substrate; the IR42 navigational-classification pattern (per F-P3-6 candidate observation) extends to workstream reassignment per §3.5.
**Iron Rule 45** — declarative-vocabulary-only floor strictly applies. Workstream UI must avoid "confidence", "probability", "certainty", "likelihood", "posterior", "prior", "meter", "gauge".
**Iron Rule 51** — class-conditional treatments at construction time.
**Iron Rule 52 §4** — function-name and logical-concern collision check.
**Iron Rule 55** — architect-side canonical-source verification through agent-side investigation halts.
**Iron Rule 58 (amended)** — CoC writes use actor_resource_id; defensive layer in coc.js handles user_id → resource_id resolution. New CoC events emitted by this CMD use the amended path.
**Iron Rule 60** — first-caller hazard awareness. Two new triggers (two-level nesting enforcement + archive cascade) are first-of-kind patterns within their domains.
**Iron Rule 64** — codebase-as-spec strictly applies. The agent surveys existing accord_meetings.project_id usage, EVENT_META patterns, meeting creation/detail flows, and existing chrome before introducing new structures.
**Iron Rule 65** — render-version dual-pin applies only to template body changes. **This CMD does NOT modify any render template body bytes; `RENDER_VERSION` does NOT need to move. Bump only `js/version.js`.**

This is the **first CMD in the 2-CMD Accord-constellation arc**. Substrate foundation; UI work follows in CMD-ACCORD-CONSTELLATION-ENTRY-1. Multi-phase work pattern with halt-and-surface points; multi-session probable; total estimate 10-14 hours.

**Established patterns from prior CMDs that apply here:**

- F-P3-7: All `CREATE TRIGGER` uses `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` pattern from start
- F-P3-2: SECURITY INVOKER for triggers reading substrate tables (RLS already scopes)
- F-P4-1: CoC writer normalizes `accord.` prefix at write time (stored event_type unprefixed; EVENT_META keys prefixed)
- F-P3-9: Same as F-P4-1; queries against coc_events use unprefixed event_type for accord.* events
- F-P3-6: Substrate additions referencing sealed rows are IR42-compatible (one data point); this CMD adds the second

---

## §1 — Purpose

Per the architectural deliberation captured in `scaffolding-cmd-accord-workstreams-substrate-1-v2.md`, Accord today lacks a workstream layer above meetings. The operator's mental model accumulates structure organically as Accord use grows: Day 1 has one meeting; T+1 month has 8-10 meetings with implicit groupings; T+3 months has 50+ meetings across 8+ workstreams with internal sub-structure.

A workstream is a bounded stream of work the operator considers a coherent unit of attention. Real PM operator examples at T+3 months:
- "Endoscope replacement project" (top-level + sub-workstreams for Engineering, Quality, Regulatory, Operations, Purchasing)
- "Camera CPU redesign" (top-level; possibly no sub-workstreams initially)
- "Packaging redesign" (top-level; small enough that Mechanical-only is the whole thing)
- "Fiber-optic network overhaul" (top-level + sub-workstreams per phase gate)
- "P&P initiatives" (top-level + sub-workstreams per individual initiative)
- "1:1s with manager" (top-level; no sub-structure)

Workstreams nest **two levels deep** (top-level → sub-workstream); deeper nesting deferred to future CMDs if operator practice demands it.

Critically: meetings can exist without immediate workstream assignment. They land in a per-operator **parking lot** of unfiled meetings. The operator drags-and-drops meetings onto workstreams when ready to organize. Click X on a placed meeting and it returns to the parking lot — not deleted, just unfiled.

After CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1 ships:

1. A `workstreams` substrate table exists with two-level nesting and active/archived lifecycle
2. `accord_meetings.workstream_id` is NULLABLE — NULL meetings live in the parking lot; non-NULL meetings are placed
3. Operators can create workstreams at any of the two levels; archive them; rename them; reorganize meetings via API affordances (drag-and-drop UX in next CMD)
4. RLS scoping mirrors accord_meetings (firm-scoped via `my_firm_id()`)
5. CoC events emit for workstream lifecycle AND meeting placement/unplacement (7 new events)
6. The substrate is ready for CMD-ACCORD-CONSTELLATION-ENTRY-1 to render the constellation visualization

This is **substrate work plus minimum operator-facing UI.** Constellation visualization, smooth transitions, parking-lot pane visualization, and drag-and-drop UX all ship in the next CMD.

---

## §2 — Scope

### In scope

- Phase 1: investigation per §3
- Phase 2: workstreams table + RLS + indexes + two-level nesting enforcement trigger + archive cascade trigger
- Phase 3: nullable workstream_id column on accord_meetings + partial indexes
- Phase 4: 7 EVENT_META entries + workstream-management surface (functional, not designed) + meeting-detail workstream display + change affordance
- Phase 5: behavioral verification per §5
- Pin bump in `js/version.js` (no `RENDER_VERSION` change per Iron Rule 65)
- Hand-off per §8

### Out of scope

- Constellation radial visualization (CMD-ACCORD-CONSTELLATION-ENTRY-1)
- Smooth dissolve transitions between hierarchy levels (next CMD)
- ESC-back-to-constellation behavior (next CMD)
- Parking-lot pane visible at every level (next CMD)
- Drag-and-drop interactions for workstream assignment (next CMD)
- X-button on placed meetings to unfile (next CMD)
- `+New Workstream` UI buttons embedded in constellation/sub-level views (next CMD)
- Activity-intensity computation for constellation glow (next CMD)
- Layout positioning logic (concentric rings, angular sectors, operator-draggable) (next CMD)
- Multi-organization workstream membership (deferred; not needed for first useful version)
- Workstream templates / archetypes (deferred)
- Workstream owner roles distinct from creator (deferred)
- Deeper nesting beyond two levels (future CMD-ACCORD-WORKSTREAMS-N-LEVEL-1 candidate if needed)
- Multi-select drag-and-drop (next CMD will ship single-meeting drag-drop only)
- Project_id refactoring or merging with workstream_id (defer to investigation; if merge needed, separate CMD)
- Compass-side workstream linkage (separate CMD if needed)
- Render template changes (Iron Rule 65 does not fire)
- Schema changes outside `workstreams` (new) and `accord_meetings` (workstream_id column)
- New seq_class additions (workstreams are not accord_nodes)

---

## §3 — Investigation requirements (Phase 1)

Before applying any migration, the agent surveys.

### §3.1 Existing project_id usage

Resolve Q-W4 (the load-bearing investigation question):

- What's the current shape of `accord_meetings.project_id`? Nullable? FK target? Constraint?
- Does a `projects` table exist? If yes, full column list, RLS policies, current row count for this firm
- How is project_id populated today? (Application code path; default; trigger?)
- Is project_id operationally equivalent to workstream, semantically distinct, or partially overlapping?

**Architect-side hypothesis: workstream and project are different concepts.**
- Projects are externally-defined work containers (likely have scope, budget, milestones, possibly imported from external PM tools)
- Workstreams are operator-defined organizing buckets ("1:1s with manager" is a workstream but not a project)
- Lean: workstream is the broader organizing concept; project_id remains as a separate optional dimension

If the agent's investigation surfaces that project_id IS operationally equivalent to workstream (no distinct concept; the field is a free-text categorization), then this CMD's substrate may extend `projects` rather than introduce `workstreams`. Surface for architect deliberation.

If project_id is genuinely distinct, this CMD adds workstream as orthogonal to project_id; both can be set on a meeting independently.

### §3.2 EVENT_META patterns

Document existing EVENT_META structure in `js/coc.js`:
- Insertion point for new accord.* events (the agent confirms via §3.7 to follow the established alphabetical or domain-grouped pattern)
- Format conventions: `{ glyph, stepName, severity, color }` per F-P4-1 confirmed pattern
- Whether EVENT_META keys remain prefixed (yes per F-P3-9/F-P4-1; confirm structurally)

### §3.3 Existing meeting creation flow

Document how meeting creation works today:
- Application code path (likely `js/accord-core.js` or `js/accord-capture.js`)
- Form structure
- Where workstream_id assignment would fit (architect-side default: NOT in creation flow; meetings default to NULL workstream_id; assignment happens later via drag-and-drop in next CMD)
- Confirm no changes needed in Phase 4 of this CMD (creation flow stays as-is)

### §3.4 Existing meeting detail flow

Document existing meeting detail display:
- Where in the UI does meeting detail render? (Likely Decision Ledger detail panel + Living Document meeting context)
- What metadata is currently displayed? (Title, date, organizer, attendees, status, project_id if displayed)
- Where would workstream display + change affordance fit naturally?
- Is there an existing pattern for "click-to-edit" metadata fields?

### §3.5 Existing chrome for management surface

Document Accord's existing top-level chrome:
- Where are top-level navigation links / buttons / menus rendered?
- Is there an existing pattern for "settings" or "manage X" surfaces?
- Where can a small "Manage workstreams" link be added without disrupting existing UI?
- Architect-side default: small text link in the top-level chrome (consistent with similar links in other surfaces); functional management page (table of workstreams; create/rename/archive/restore actions); not visually polished

### §3.6 Trigger pattern verification

Confirm the codebase patterns for the two new triggers:
- Two-level nesting enforcement (`enforce_workstream_two_level_max`)
- Archive cascade (`cascade_workstream_archive`)

Both must use F-P3-7 (`DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`) and F-P3-2 (SECURITY INVOKER for substrate access). Confirm these patterns are correctly applied per existing migrations from CMD-SUBSTRATE-COUNTERFACTUAL-MIN.

### §3.7 Halt point — surface findings

After Phase 1 completes, the agent halts and surfaces:

1. project_id current state + architect-hypothesis verification (Q-W4 resolution)
2. EVENT_META insertion approach
3. Meeting creation flow confirmation (no Phase 4 changes needed)
4. Meeting detail display location for workstream affordance
5. Top-level chrome location for management surface link
6. Trigger pattern verification
7. Architectural surprises encountered during survey
8. Recommended Phase 2-5 implementation specifics

The agent waits for architect confirmation before proceeding to Phase 2.

---

## §4 — Substrate additions (applied across Phases 2-4)

### §4.1 The `workstreams` table (Phase 2)

```sql
CREATE TABLE workstreams (
  workstream_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id              uuid NOT NULL,
  parent_workstream_id uuid REFERENCES workstreams(workstream_id),
  name                 text NOT NULL,
  description          text,
  state                text NOT NULL DEFAULT 'active',
  created_by           uuid NOT NULL REFERENCES resources(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  archived_at          timestamptz,
  archived_by          uuid REFERENCES resources(id),

  CONSTRAINT workstreams_state_check 
    CHECK (state IN ('active', 'archived')),
  CONSTRAINT workstreams_archived_consistency CHECK (
    (state = 'archived' AND archived_at IS NOT NULL AND archived_by IS NOT NULL)
    OR
    (state = 'active' AND archived_at IS NULL AND archived_by IS NULL)
  )
);

CREATE INDEX idx_workstreams_firm_state 
  ON workstreams (firm_id, state);

CREATE INDEX idx_workstreams_parent 
  ON workstreams (parent_workstream_id) 
  WHERE parent_workstream_id IS NOT NULL;

CREATE UNIQUE INDEX idx_workstreams_firm_top_level_name 
  ON workstreams (firm_id, name) 
  WHERE state = 'active' AND parent_workstream_id IS NULL;

CREATE UNIQUE INDEX idx_workstreams_sub_name 
  ON workstreams (parent_workstream_id, name) 
  WHERE state = 'active' AND parent_workstream_id IS NOT NULL;
```

Per IR58 amended: `created_by` and `archived_by` reference `resources(id)`.

Two partial unique indexes ensure name uniqueness within scope:
- Top-level: workstream name unique per firm among top-level (parent IS NULL) active workstreams
- Sub-level: sub-workstream name unique within parent among active sub-workstreams

An operator can have two sub-workstreams both named "Phase 1" if they're under different parents (e.g., "Endoscope project / Phase 1" and "Camera CPU / Phase 1"). Names can be re-used across active vs archived (re-use is allowed if a previous workstream was archived).

### §4.2 Two-level nesting enforcement (Phase 2)

```sql
CREATE OR REPLACE FUNCTION enforce_workstream_two_level_max()
RETURNS TRIGGER AS $$
DECLARE
  v_grandparent_id uuid;
BEGIN
  -- Top-level workstream: no nesting violation possible
  IF NEW.parent_workstream_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Sub-workstream: verify parent is itself top-level
  SELECT parent_workstream_id INTO v_grandparent_id
  FROM workstreams
  WHERE workstream_id = NEW.parent_workstream_id;
  
  IF v_grandparent_id IS NOT NULL THEN
    RAISE EXCEPTION 
      'workstream nesting limit: parent_workstream_id % is itself a sub-workstream; max 2 levels (top-level + sub-workstream) supported',
      NEW.parent_workstream_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

DROP TRIGGER IF EXISTS workstreams_two_level_max ON workstreams;
CREATE TRIGGER workstreams_two_level_max
  BEFORE INSERT OR UPDATE ON workstreams
  FOR EACH ROW EXECUTE FUNCTION enforce_workstream_two_level_max();
```

Per F-P3-2: SECURITY INVOKER (substrate-table access). Per F-P3-7: DROP IF EXISTS pattern.

The trigger fires BEFORE INSERT OR UPDATE — protects against operator attempts to either create a 3-deep workstream OR re-parent a top-level workstream as a sub-workstream of another sub-workstream.

### §4.3 Archive cascade (Phase 2)

```sql
CREATE OR REPLACE FUNCTION cascade_workstream_archive()
RETURNS TRIGGER AS $$
BEGIN
  -- Only on archive transition
  IF NEW.state = 'archived' AND OLD.state = 'active' THEN
    -- Return meetings to parking lot
    UPDATE accord_meetings
       SET workstream_id = NULL
     WHERE workstream_id = NEW.workstream_id;
    
    -- Cascade to sub-workstreams
    UPDATE workstreams
       SET state = 'archived',
           archived_at = NEW.archived_at,
           archived_by = NEW.archived_by
     WHERE parent_workstream_id = NEW.workstream_id
       AND state = 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

DROP TRIGGER IF EXISTS workstreams_archive_cascade ON workstreams;
CREATE TRIGGER workstreams_archive_cascade
  AFTER UPDATE ON workstreams
  FOR EACH ROW EXECUTE FUNCTION cascade_workstream_archive();
```

The trigger fires AFTER UPDATE so the parent's state change completes before cascading. Recursive cascade: archiving a top-level workstream archives its sub-workstreams in a single trigger fire (because the UPDATE on sub-workstreams in the trigger body itself fires the trigger again on those sub-workstreams; their meetings then null out via the same path).

CoC events for meeting `unplaced` (per §4.5) emit from the writer-side, not the trigger. The trigger is pure substrate manipulation; the writer-side emits CoC.

**Important architect note for verification:** the cascade trigger and the meeting `unplaced` CoC event must coordinate. When cascade fires, multiple meetings null out. The CoC writer should emit one `accord.meeting.unplaced` event per meeting affected. The agent confirms how CoC writes are typically batched vs per-row in the existing codebase, and applies the same pattern.

### §4.4 RLS policies (Phase 2)

```sql
ALTER TABLE workstreams ENABLE ROW LEVEL SECURITY;

CREATE POLICY workstreams_select ON workstreams
  FOR SELECT USING (firm_id = my_firm_id());

CREATE POLICY workstreams_insert ON workstreams
  FOR INSERT WITH CHECK (firm_id = my_firm_id());

CREATE POLICY workstreams_update ON workstreams
  FOR UPDATE USING (firm_id = my_firm_id() AND state = 'active');

-- No DELETE policy: workstreams archive, not delete
```

UPDATE policy restricts to `state = 'active'` — archived workstreams are read-only; operators must restore (state transition) before they can rename or otherwise modify.

The state transition active → archived itself is permitted via UPDATE because the predicate evaluates against the OLD row (active), not NEW. The archived row becomes read-only after the transition completes.

Restore (archived → active) is BLOCKED by the UPDATE policy because OLD row is archived. Two options:
- **Option A (architect lean):** add a separate UPDATE policy for restore: `FOR UPDATE USING (firm_id = my_firm_id() AND state = 'archived' AND NEW.state = 'active' AND name = OLD.name AND parent_workstream_id IS NOT DISTINCT FROM OLD.parent_workstream_id)`. Restore is a state-only transition; everything else stays the same.
- **Option B:** stored procedure / RPC for restore that runs SECURITY DEFINER. More machinery for a small operation.

Architect recommends Option A. Agent confirms via Phase 1 §3.6 whether existing codebase has analogous restore-via-RLS-policy patterns.

### §4.5 Linking accord_meetings to workstreams (Phase 3)

```sql
ALTER TABLE accord_meetings
  ADD COLUMN workstream_id uuid REFERENCES workstreams(workstream_id);

CREATE INDEX idx_accord_meetings_workstream 
  ON accord_meetings (workstream_id) 
  WHERE workstream_id IS NOT NULL;

CREATE INDEX idx_accord_meetings_parking_lot 
  ON accord_meetings (firm_id, organizer_id) 
  WHERE workstream_id IS NULL;
```

Nullable; no backfill. Existing meetings start in the parking lot.

The two partial indexes serve two query shapes:
- **"Show meetings filed under workstream W"** — `idx_accord_meetings_workstream`
- **"Show parking-lot meetings for operator O in firm F"** — `idx_accord_meetings_parking_lot`

### §4.6 IR42 interaction — post-seal workstream reassignment (Phase 3)

Per §3.5 architect ratification: workstream_id on accord_meetings is mutable regardless of `sealed_at` state. This is **navigational classification**, not substantive content. The meeting's substrate (decisions, actions, etc.) is sealed and immutable per IR42; reclassifying which workstream the meeting belongs to is a filing decision.

This is the **second data point** for the candidate doctrinal observation from F-P3-6:

> *Navigational-classification mutations on sealed substrate are IR42-compatible because they don't modify the sealed row's substantive content.*

If a third recurrence emerges in future CMDs, the pattern becomes ratifiable as Iron Rule extension. This CMD's hand-off should explicitly call out the second-data-point status.

Mechanism: no trigger blocks workstream_id changes on sealed meetings. CoC event `accord.meeting.placed` / `accord.meeting.unplaced` / `accord.meeting.refiled` emits per §4.7 for full audit trail.

### §4.7 CoC events (Phase 4)

Add to EVENT_META in `js/coc.js`:

| Event Key | Trigger | Severity |
|---|---|---|
| `accord.workstream.created` | Workstream INSERT | info |
| `accord.workstream.renamed` | UPDATE on workstream.name | info |
| `accord.workstream.archived` | state transition active → archived | info |
| `accord.workstream.restored` | state transition archived → active | info |
| `accord.meeting.placed` | accord_meetings.workstream_id NULL → non-NULL | info |
| `accord.meeting.unplaced` | accord_meetings.workstream_id non-NULL → NULL | info |
| `accord.meeting.refiled` | accord_meetings.workstream_id non-NULL → different non-NULL | info |

Per F-P4-1 (CoC writer normalizes `accord.` prefix at write time): stored event_type values are unprefixed (`workstream.created`, `meeting.placed`, etc.). EVENT_META keys remain prefixed.

Per IR58 amended: all writes use the defensive-layer writer; no per-call user_id → resource_id resolution required.

The three meeting events (`placed`, `unplaced`, `refiled`) provide complete substrate-side traceability of the operator's organizing decisions over time.

### §4.8 Minimum operator-facing UI (Phase 4)

#### Workstream management surface

Functional, not designed. Accessible via a small "Manage workstreams" link in Accord's top-level chrome (location confirmed by Phase 1 §3.5).

Surface contents:
- Table of operator's active workstreams: name | level (top-level / sub-level) | parent name (for sub-workstreams) | created_at | meetings filed count
- Per-row actions: rename, archive, view sub-workstreams (if top-level)
- "Show archived" toggle that includes archived workstreams (with restore action)
- "+ New workstream" button: opens modal with name field, optional description field, optional parent selector (defaults to top-level)

CRUD operations dispatch through the standard API path; CoC events emit per §4.7.

**Visual: minimal styling. Functional table + buttons. The constellation visualization in CMD-ACCORD-CONSTELLATION-ENTRY-1 will eventually replace this surface for most operations, but the management surface remains as the fallback for advanced operations.**

#### Meeting detail enhancement

Current meeting detail rendering (location confirmed by Phase 1 §3.4) gets an additional metadata row:

```
Filed under: [workstream name] [change]
        — OR —
Filed under: Unfiled  [file]
```

Click "[change]" or "[file]" → modal with workstream selector (top-level workstreams in main list; expandable to sub-workstreams). Selecting a workstream calls API; CoC event emits; UI updates inline.

Modal includes "Move to parking lot" option for currently-filed meetings (calls API to set workstream_id = NULL).

### §4.9 No render template changes

Iron Rule 65 does NOT fire. Render templates do not reference workstreams in this CMD. Future CMDs may surface workstream context in rendered minutes; that's not in this CMD's scope.

Pin only `js/version.js`. `RENDER_VERSION` constant unchanged.

---

## §5 — Behavioral verification

### §5.1 Sentinel — code identity

1. Hard-refresh accord.html. Console banner shows CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1.
2. Verify `_PROJECTHUD_VERSION` matches.
3. **PASS** = post-CMD code is loaded.

### §5.2 Workstream substrate (DOCTRINAL FLOOR)

1. Create a top-level workstream via UI ("Manage workstreams" → "+ New workstream"); verify INSERT succeeds; verify `accord.workstream.created` CoC event written with `actor_resource_id` populated by IR58-amended writer.
2. Create a sub-workstream under the new top-level workstream; verify INSERT succeeds; verify nesting valid.
3. Attempt to create a sub-sub-workstream (sub-workstream under a sub-workstream). Verify the two-level nesting trigger raises with diagnostic: `workstream nesting limit: parent_workstream_id ... is itself a sub-workstream; max 2 levels supported`.
4. Verify uniqueness: try to create a second top-level workstream with the same name in same firm; verify rejection (unique index).
5. Verify uniqueness scope: create two sub-workstreams with the same name under different parents; verify both succeed (uniqueness scoped to parent).
6. Cross-firm isolation: a workstream in firm A is invisible from firm B context (RLS).
7. **PASS** = workstream substrate primitives work correctly with nesting + uniqueness + RLS.

### §5.3 Meeting linkage substrate

1. Create a new meeting via existing flow; verify `workstream_id` = NULL (parking lot).
2. Update a meeting to assign a workstream (API call); verify UPDATE succeeds; verify `accord.meeting.placed` CoC event with metadata `{from: null, to: <workstream_id>}`.
3. Update a meeting to change workstream from one to another; verify `accord.meeting.refiled` CoC event with metadata `{from: <old>, to: <new>}`.
4. Update a meeting to set workstream_id = NULL (back to parking lot); verify `accord.meeting.unplaced` CoC event.
5. Verify the parking-lot index works: query meetings WHERE workstream_id IS NULL AND firm_id = X AND organizer_id = Y; verify EXPLAIN uses the partial index.
6. Verify the workstream-meeting index works: query meetings WHERE workstream_id = W; verify EXPLAIN uses the partial index.
7. **PASS** = meeting linkage works with full CoC trail and index utilization.

### §5.4 Archive cascade (DOCTRINAL FLOOR)

1. Create a top-level workstream "Test Project"; create two sub-workstreams under it; assign 3 meetings — one to top-level, one to sub-workstream A, one to sub-workstream B.
2. Archive the top-level workstream "Test Project".
3. Verify the top-level workstream state = 'archived'; archived_at populated; archived_by = current operator's resource_id.
4. Verify both sub-workstreams cascaded to state = 'archived' with same archived_at + archived_by.
5. Verify all 3 meetings now have workstream_id = NULL (returned to parking lot).
6. Verify 3 `accord.meeting.unplaced` CoC events emitted (one per meeting).
7. Verify `accord.workstream.archived` event for the top-level workstream and 2 more for the cascaded sub-workstreams.
8. Restore the top-level workstream (state archived → active). Verify the top-level workstream restores, sub-workstreams remain archived (no cascade-restore), meetings remain in parking lot (operator must manually re-file).
9. **PASS** = archive cascade works correctly; restore is non-cascading.

### §5.5 IR42 post-seal workstream reassignment

1. Find a sealed meeting (`sealed_at IS NOT NULL`); attempt to update its workstream_id from NULL to a workstream; verify UPDATE succeeds.
2. Verify CoC event `accord.meeting.placed` emits with seal-state metadata indicating the meeting was sealed at time of reassignment.
3. Attempt to update the same sealed meeting's substrate (e.g., a decision row); verify rejection per IR42 immutability.
4. **PASS** = workstream reassignment works on sealed meetings (navigational-classification IR42-compatible per §4.6); substrate-of-decisions remains immutable.

### §5.6 RLS policies

1. As firm A operator: SELECT from workstreams; verify only firm A workstreams visible.
2. As firm A operator: INSERT a workstream with firm_id = firm_B (attempt to spoof); verify rejection by RLS WITH CHECK.
3. As firm A operator: UPDATE an active workstream's name; verify success.
4. As firm A operator: UPDATE an archived workstream's name; verify rejection (UPDATE policy restricts to state='active').
5. Attempt to restore an archived workstream (state archived → active); verify the restore-via-policy-or-RPC mechanism works per §4.4 implementation choice.
6. **PASS** = RLS scoping works correctly; archive read-only enforcement holds; restore mechanism functions.

### §5.7 Existing CMD regression

1. Live Capture, Living Document, Decision Ledger, Digest & Send, Minutes — all surfaces load and operate.
2. End a meeting; verify auto-render fires; minutes render correctly with seq_ids populated (CMD-SUBSTRATE-COUNTERFACTUAL-MIN preserved).
3. Aegis Library + playbook execution unaffected.
4. CoC integrity intact (no FK errors per CMD-COC-ACTOR-RESOURCE-1 amended path).
5. Cross-firm isolation preserved (CMD-AEGIS-1).
6. Dissent flow intact (Phase 3 of CMD-SUBSTRATE-COUNTERFACTUAL-MIN preserved).
7. Date-field substrate intact (Phase 4 of CMD-SUBSTRATE-COUNTERFACTUAL-MIN preserved).
8. **PASS** = no regression of prior CMD work.

### §5.8 IR45 vocabulary preservation

1. Grep all new substrate-related text (workstream UI labels, error messages, CoC event glyphs) for: confidence, probability, certainty, likelihood, posterior, prior, meter, gauge.
2. **PASS** = zero matches in user-facing text.

---

## §6 — Consumer enumeration (Iron Rule 38)

Cannot fully specify until §3 investigation completes. Likely files:

| File | Likely effect |
|---|---|
| `supabase/migrations/202605XX000001_workstreams_table.sql` | NEW — workstreams table + RLS + indexes + nesting trigger + archive cascade trigger |
| `supabase/migrations/202605XX000002_accord_meetings_workstream_id.sql` | NEW — workstream_id column on accord_meetings + partial indexes |
| `js/coc.js` | MODIFIED — 7 new EVENT_META entries |
| `js/accord-core.js` (or equivalent) | MODIFIED — workstream management surface + meeting-detail workstream display + change affordance |
| `accord.html` | MODIFIED — markup for management surface link in chrome + modal for workstream selection + management table layout |
| `js/version.js` | MODIFIED — pin moves to CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1 |

**No changes to:**
- Render templates / Edge Functions (IR65 does NOT fire)
- Other surface modules (Compass, Cadence, Aegis)
- Existing accord_nodes, accord_edges, accord_belief_adjustments, etc.
- RLS policies on existing tables
- Auth / api modules

---

## §7 — Smoke test

After Phase 5 deploy:

1. Hard-refresh accord.html. Console banner shows CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1.
2. Open "Manage workstreams"; create a top-level workstream "Test"; verify CoC event written.
3. Create a sub-workstream under "Test"; verify creation.
4. Attempt to nest a third level; verify rejection with clear error.
5. Open a meeting detail; verify "Filed under: Unfiled" displays; click "[file]"; select "Test"; verify state updates.
6. Archive "Test"; verify cascade — sub-workstream archives; meeting returns to parking lot; CoC events emit.
7. Restore "Test"; verify state but no cascade-restore.
8. Verify cross-firm isolation: if a second firm exists, log in as firm B operator; verify firm A's workstreams invisible.

---

## §8 — Hand-off format

Required output:

1. Files modified — one-liner per file.
2. **§3 investigation findings as a separate section** — project_id resolution (Q-W4), EVENT_META insertion approach, meeting flow confirmations, chrome location, trigger pattern verification, architectural surprises. Surface BEFORE Phase 2 migrations apply.
3. Migration diffs — full SQL text for each migration file.
4. Application code diffs — unified diff for js/coc.js, accord-core.js (or equivalent surface module), accord.html.
5. Smoke test result.
6. Behavioral verification results — per §5 subtest with explicit PASS/FAIL.
7. Findings — particularly:
   - Q-W4 outcome (project_id distinct or merged)
   - Whether trigger patterns matched established codebase conventions
   - F-P3-6 second data point status (post-seal workstream reassignment as IR42-compatible navigational classification — explicitly call out for candidate doctrinal observation upgrade)
   - Any architectural surprises encountered during phase application
   - Whether RLS restore-via-policy mechanism (Option A) worked vs needing RPC fallback (Option B)

If §5.2 (workstream substrate) or §5.4 (archive cascade) fails, halt and surface — those are the doctrinal-floor checks.

---

## §9 — Reference materials

Required inputs (halt per Iron Rule 40 §1.1 if any are missing):

- This brief
- `scaffolding-cmd-accord-workstreams-substrate-1-v2.md` (architectural conceptual sketch this brief operationalizes)
- Current `js/coc.js` (post-CMD-SUBSTRATE-COUNTERFACTUAL-MIN)
- Current `js/accord-core.js` (or equivalent)
- Current `accord.html`
- Current accord_nodes and accord_edges and accord_meetings schemas
- All Iron Rules ratifications 36-65 + IR58 amendment
- Phase 4 hand-off of CMD-SUBSTRATE-COUNTERFACTUAL-MIN (for F-P3-2, F-P3-7, F-P3-9, F-P4-1 reference)

---

## §10 — Agent narrative instruction block

```
Apply brief-cmd-accord-workstreams-substrate-1.md.

First CMD in the 2-CMD Accord-constellation arc. Substrate
foundation; the constellation visualization itself ships in
CMD-ACCORD-CONSTELLATION-ENTRY-1.

Five-phase work pattern with halt-and-surface points:
- Phase 1: investigation per §3 (HALT, surface findings; 
  particularly Q-W4 project_id resolution)
- Phase 2: workstreams substrate (after architect confirmation)
- Phase 3: meeting linkage substrate (after Phase 2 verification)
- Phase 4: CoC events + minimum UI (after Phase 3 verification)
- Phase 5: behavioral verification per §5

Multi-session probable. Total estimate 10-14 hours.

Architect decisions ratified going into this CMD:
- Q-W1: no default workstream needed (parking-lot model)
- Q-W2: post-seal workstream reassignment allowed (second 
  data point for F-P3-6 navigational-classification pattern)
- Q-W3: workstream description optional
- Q-W4: defer to Phase 1 investigation
- Q-W5: defer to Phase 1 investigation
- Q-W6: parking-lot model ratified
- Q-W7: two-level nesting (top-level + sub-workstream)
- Q-W8: terminology = "workstreams"
- Q-W9: single-meeting drag-drop only (multi-select deferred 
  to constellation CMD)
- Q-W10: archive cascade returns meetings to parking lot

Iron Rule 65 does NOT fire. Single-pin bump in js/version.js.
RENDER_VERSION constant unchanged.

Iron Rule 64 strictly applies: survey project_id usage, EVENT_META
patterns, meeting creation/detail flows, top-level chrome
structure before introducing new mechanisms. Phase 1 §3
verifies.

Established F-pattern applications:
- F-P3-7 (DROP IF EXISTS) on both new triggers
- F-P3-2 (SECURITY INVOKER) on both new triggers
- F-P4-1 (accord.* prefix normalization) on all 7 new CoC events
- F-P3-6 (navigational-classification IR42 pattern) explicitly
  invoked for post-seal workstream reassignment — second data
  point; call out in hand-off

§5.2 (workstream substrate) and §5.4 (archive cascade) are 
doctrinal-floor checks. Halt on either failure.

Hand-off format per §8.

Halt on missing input. Halt after Phase 1 investigation. Halt 
between phases for verification. Halt if §5.2 or §5.4 fails.

Proceed.
```

---

## §11 — Architectural significance

This CMD lays the substrate foundation for Accord's transformation from "flat list of substrate primitives" to "operator-organized hierarchical workspace with parking-lot semantics."

Three architectural commitments worth marking:

**1. Operator-discovered structure over operator-imposed structure.** The parking-lot model means operators don't have to organize before they capture. Categorization happens when the right cognitive context exists, not at the moment of meeting creation. The substrate accommodates the operator's actual workflow rather than forcing premature structure.

**2. Navigational classification is mutable; substrate-of-decisions is immutable.** Iron Rule 42 protects the substantive content of decisions, actions, and the audit trail of dialogue. It does NOT need to protect "which folder this meeting is filed under" — that's an organizing dimension orthogonal to the substrate's commitment-record purpose. This CMD is the second data point for the candidate doctrinal observation; if a third recurrence emerges, the pattern becomes ratifiable.

**3. The "MIN" discipline holds.** This CMD ships the smallest substrate change that unblocks the constellation visualization. Resist multi-organization workstream membership, templates, archetypes, owner roles, deeper nesting, etc. Those are real concepts that may eventually matter; none is needed for the first useful version.

This is the substrate that lets Accord stop feeling like another to-do list and start feeling like a tool the operator wants to inhabit.

---

*End of Brief — Accord Workstreams Substrate (CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1).*
