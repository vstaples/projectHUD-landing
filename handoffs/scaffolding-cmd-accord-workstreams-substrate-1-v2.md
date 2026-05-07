# Architectural Scaffolding · CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1 (v2)

**Status:** conceptual sketch (not a brief). Substrate foundation for the constellation entry point.
**Revision:** v2 — incorporates parking-lot model, two-level nesting, drag-and-drop reorganization, X-to-unfile semantics. Supersedes v1.

**Architect:** Vaughn (operator) + Claude (architect)
**Date:** 2026-05-07
**Strategic context:** First CMD in the 2-CMD arc that introduces the constellation as Accord's top-level entry surface. Substrate-first per established pattern; UI work follows in CMD-ACCORD-CONSTELLATION-ENTRY-1.

---

## §1 — What this CMD is for

The operator's mental model accumulates structure organically as Accord use grows. Day 1: one meeting, no structure needed. Month 1: a smattergram of 8-10 meetings, implicit groupings forming. Month 3: 50+ meetings across 8+ workstreams with internal sub-structure.

The substrate today expresses meeting → thread → node correctly. What it lacks is **the workstream layer above meetings, with two-level nesting and parking-lot semantics for unfiled meetings.**

A workstream is a bounded stream of work the operator considers a coherent unit of attention. Examples from a real PM operator at T+3 months:

- "Endoscope replacement project" — top-level workstream; sub-workstreams for Engineering, Quality, Regulatory, Operations, Purchasing
- "Camera CPU redesign" — top-level workstream; possibly no sub-workstreams initially
- "Packaging redesign" — top-level workstream; small enough that Mechanical-only is the whole thing
- "Fiber-optic network overhaul" — top-level workstream; sub-workstreams per phase gate
- "P&P initiatives" — top-level workstream; sub-workstreams per individual initiative
- "1:1s with manager" — top-level workstream; no sub-structure (just the recurring meeting series)

Workstreams are persistent (continue across many meetings) and have their own lifecycle (active → archived). Workstreams nest **two levels deep** (top-level workstream → sub-workstream); deeper nesting is deferred to future CMDs if operator practice demands it.

Critically: **meetings can be created without immediate workstream assignment.** They land in a per-operator "parking lot" of unfiled meetings. The operator drags-and-drops meetings onto workstreams (or sub-workstreams) when they're ready to organize. Click X on a placed meeting and it returns to the parking lot — not deleted, just unfiled.

This is **library-shaped, not filing-cabinet-shaped.** Meetings flow through Accord; the operator shelves them when the right context emerges.

After CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1 ships:

1. A `workstreams` substrate table exists with two-level nesting and active/archived lifecycle
2. `accord_meetings.workstream_id` is NULLABLE — NULL meetings live in the parking lot; non-NULL meetings are placed
3. Operators can create workstreams at any level; archive them; rename them; reorganize meetings via drag-and-drop OR API
4. RLS scoping mirrors accord_meetings (firm-scoped via my_firm_id())
5. CoC events emit for workstream lifecycle AND meeting placement/unplacement
6. The substrate is ready for CMD-ACCORD-CONSTELLATION-ENTRY-1 to render the constellation visualization with parking-lot pane and drag-and-drop interactions

This is **substrate work plus minimum UI.** Constellation visualization, smooth transitions, and drag-and-drop UX ship in the next CMD. This CMD provides the substrate primitives + barebones API affordances + minimum management surface.

---

## §2 — Substrate additions

### §2.1 The `workstreams` table

```sql
CREATE TABLE workstreams (
  workstream_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id              uuid NOT NULL,
  parent_workstream_id uuid REFERENCES workstreams(workstream_id),  -- NULL = top-level
  name                 text NOT NULL,
  description          text,
  state                text NOT NULL DEFAULT 'active',
  created_by           uuid NOT NULL REFERENCES resources(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  archived_at          timestamptz,
  archived_by          uuid REFERENCES resources(id),

  CONSTRAINT workstreams_state_check CHECK (state IN ('active', 'archived')),
  CONSTRAINT workstreams_archived_consistency CHECK (
    (state = 'archived' AND archived_at IS NOT NULL AND archived_by IS NOT NULL)
    OR
    (state = 'active' AND archived_at IS NULL AND archived_by IS NULL)
  )
);

CREATE INDEX idx_workstreams_firm_state ON workstreams (firm_id, state);
CREATE INDEX idx_workstreams_parent ON workstreams (parent_workstream_id) WHERE parent_workstream_id IS NOT NULL;
CREATE UNIQUE INDEX idx_workstreams_firm_top_level_name 
  ON workstreams (firm_id, name) 
  WHERE state = 'active' AND parent_workstream_id IS NULL;
CREATE UNIQUE INDEX idx_workstreams_sub_name 
  ON workstreams (parent_workstream_id, name) 
  WHERE state = 'active' AND parent_workstream_id IS NOT NULL;
```

**Two-level nesting enforcement** via trigger:

```sql
CREATE OR REPLACE FUNCTION enforce_workstream_two_level_max()
RETURNS TRIGGER AS $$
DECLARE
  v_grandparent_id uuid;
BEGIN
  IF NEW.parent_workstream_id IS NULL THEN
    RETURN NEW;  -- top-level; no nesting violation possible
  END IF;
  
  -- Look up parent's parent
  SELECT parent_workstream_id INTO v_grandparent_id
  FROM workstreams
  WHERE workstream_id = NEW.parent_workstream_id;
  
  IF v_grandparent_id IS NOT NULL THEN
    RAISE EXCEPTION 'workstream nesting limit: parent_workstream_id % is itself a sub-workstream; max 2 levels (top + sub) supported',
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

Per F-P3-7 (DROP IF EXISTS pattern from start) and F-P3-2 (SECURITY INVOKER for substrate-table triggers).

**Architect deliberation:**
- Two-level nesting is the architect-confirmed scope (Q-W7). Future CMD-ACCORD-WORKSTREAMS-N-LEVEL-1 candidate filed if operator practice demands deeper nesting.
- Names unique within (firm, level): top-level names unique per firm; sub-workstream names unique within their parent. An operator can have two sub-workstreams both named "Phase 1" if they're under different parents (e.g., "Endoscope project / Phase 1" and "Camera CPU / Phase 1").

### §2.2 No default-Inbox workstream

**Per the parking-lot model, no auto-created default workstream.** NULL `workstream_id` on accord_meetings is a first-class state representing "unfiled / in the parking lot." Operators can use Accord without ever assigning workstreams (the constellation just shows an empty starfield with all meetings in the parking lot pane).

This reverses the v1 scaffolding's default-Inbox approach. The parking lot IS the staging area; no separate "Inbox" workstream needed.

### §2.3 Linking accord_meetings to workstreams

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

**Nullable, no backfill.** Existing meetings start in the parking lot. Operator drags them onto workstreams as they organize.

The two indexes serve two query shapes:
- **"Show meetings for workstream W"** — uses `idx_accord_meetings_workstream`
- **"Show parking-lot meetings for operator O in firm F"** — uses `idx_accord_meetings_parking_lot`

### §2.4 RLS policies

Workstreams are firm-scoped. Mirror accord_meetings RLS pattern:

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

UPDATE only on active workstreams. Archived workstreams are read-only (operators can `restore` them via state transition, but cannot rename or otherwise modify until restored).

### §2.5 IR42 interaction (load-bearing decision)

**Q-W2 ratified: post-seal workstream reassignment is allowed.**

Rationale: workstream_id on accord_meetings is **navigational classification**, not substantive content. The meeting's substrate (decisions, actions, etc.) is sealed and immutable per IR42. Reclassifying which workstream the meeting belongs to is a filing decision that operators routinely revise as their organizing practice matures. An operator who realizes their endoscope-meeting was misfiled three months later should be able to drag it to the right workstream without violating IR42.

This is the second data point for the candidate doctrinal observation from F-P3-6:

> *Navigational-classification mutations on sealed substrate are IR42-compatible because they don't modify the sealed row's substantive content.*

Two data points (late dissent registration + workstream reassignment); upgradeable to ratified doctrinal observation if pattern holds. Worth surfacing in this CMD's hand-off as candidate-doctrinal-promotion.

Mechanism: `accord_meetings.workstream_id` is mutable regardless of `sealed_at` state. CoC event `accord.meeting.workstream_assigned` (or similar; see §2.6) emits on every change, providing audit trail.

### §2.6 CoC events

Add to EVENT_META in `js/coc.js`:

| Event | Trigger |
|---|---|
| `accord.workstream.created` | New workstream INSERT |
| `accord.workstream.renamed` | UPDATE on workstream.name |
| `accord.workstream.archived` | state transition active → archived |
| `accord.workstream.restored` | state transition archived → active |
| `accord.meeting.placed` | accord_meetings.workstream_id NULL → non-NULL (parked → filed) |
| `accord.meeting.unplaced` | accord_meetings.workstream_id non-NULL → NULL (filed → parked, X-button click) |
| `accord.meeting.refiled` | accord_meetings.workstream_id non-NULL → different non-NULL (drag from one workstream to another) |

Per F-P4-1 (CoC writer normalizes `accord.` prefix), stored event_type is unprefixed (`workstream.created`, `meeting.placed`, etc.). EVENT_META keys remain prefixed.

The three meeting events (`placed`, `unplaced`, `refiled`) provide complete substrate-side traceability of the operator's organizing decisions over time. Useful for retrospective queries ("how often does the operator refile meetings?") and for the eventual constellation visualization's activity-intensity computation.

### §2.7 Workstream archive cascade behavior (Q-W10)

**Architect ratification: archiving a workstream returns its meetings to the parking lot.**

Mechanism: when a workstream transitions active → archived, a trigger NULLs the `workstream_id` on all meetings currently filed under it (and emits `accord.meeting.unplaced` events for each). The meetings remain accessible via the parking-lot pane.

Alternative considered: meetings stay attached to archived workstreams and become viewable only via "show archived" filter. Rejected because:
- Archive becomes a stronger destructive action (operator might archive a workstream forgetting it has meetings underneath)
- Parking-lot return preserves the meetings' visibility and gives the operator agency to refile

Sub-workstreams: when a top-level workstream is archived, its sub-workstreams cascade-archive (state → archived). Meetings under sub-workstreams cascade up to parking lot.

Restore behavior: restoring an archived workstream restores it to active state but does NOT auto-restore meetings that were under it (those went to parking lot and the operator may have refiled them elsewhere). Operator must drag meetings back to the restored workstream if desired.

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

Note: the cascade trigger fires AFTER UPDATE so the parent's archive completes first, then meetings update, then sub-workstreams cascade. CoC events for meeting-unplacement emitted by the writer-side, not the trigger.

---

## §3 — Operator-facing affordance (minimum)

This CMD includes minimum UI to make the substrate functional. The constellation, drag-and-drop, smooth transitions, and parking-lot pane visualization all ship in CMD-ACCORD-CONSTELLATION-ENTRY-1.

What ships in this CMD:

**Workstream management surface** (probably accessible via a small "Manage workstreams" link in Accord's existing chrome): list of operator's active workstreams (top-level + nested under each); create new at any level; rename; archive; restore archived. Functional, not designed.

**Meeting detail enhancement:** add a workstream display + change affordance. Operator can see "Filed under: Endoscope project / Engineering" (or "Unfiled") and click to change. Dropdown or modal-based; functional, not designed.

**Meeting creation flow:** unchanged from today. Meetings still create via existing flow; workstream_id defaults to NULL (parking lot). The drag-and-drop affordance to MOVE them out of the parking lot is the constellation CMD's job.

What does NOT ship in this CMD:
- Constellation visualization
- Smooth transitions / dissolve animations  
- ESC-back-to-constellation behavior
- Parking-lot pane (visible at every level)
- Drag-and-drop interactions
- X-button on placed meetings to unfile
- `+New Category` (workstream) buttons at constellation/sub-levels
- Workstream-level summary metrics (meeting counts, decision counts, activity intensity)
- Per-workstream drill-down surface

All of those are in the next CMD.

---

## §4 — Investigation requirements (Phase 1, halt-and-surface)

The agent surveys before applying. Required investigation:

1. **Resolve project_id vs workstream_id question (Q-W4).** What's `accord_meetings.project_id` today? Is there a `projects` table? If yes, what does it model? Is it operationally equivalent to workstream, semantically distinct, or partially overlapping? **Architect-side hypothesis: workstream and project are different concepts.** Projects are externally-defined work containers (with their own scope, budgets, milestones, possibly imported from external PM tools). Workstreams are operator-defined organizing buckets ("1:1s with manager" is a workstream but not a project). Lean: workstream is the broader organizing concept; project_id remains as a separate optional dimension. Confirm via investigation.

2. **Existing meeting creation flow.** How does meeting creation work today? Confirms no changes needed in Phase 4 of this CMD (workstream_id defaults to NULL).

3. **Existing meeting detail flow.** Where would the workstream display + change affordance fit? What's the existing surface's structure?

4. **Existing chrome for "Manage workstreams" surface.** Where can a small management-link be added without disrupting existing UI?

5. **CoC writer integration.** Confirm workstream-related CoC events fit the established EVENT_META pattern.

6. **Trigger pattern verification.** Confirm F-P3-7 (DROP IF EXISTS) and F-P3-2 (SECURITY INVOKER) patterns are applied correctly to both new triggers (two-level enforcement + archive cascade).

---

## §5 — Five-phase shape

**Phase 1 — Investigation:** survey existing project_id usage; meeting creation/detail flows; existing chrome; EVENT_META patterns. Halt and surface findings.

**Phase 2 — Workstreams substrate:** create workstreams table + RLS + indexes + two-level nesting trigger + archive cascade trigger. Halt for verification.

**Phase 3 — Meeting linkage substrate:** add nullable workstream_id to accord_meetings; partial indexes for filed and parking-lot queries. Halt for verification.

**Phase 4 — CoC events + minimum UI:** EVENT_META entries (7 new); meeting-detail workstream display + change affordance; workstream management surface (functional). Halt for verification.

**Phase 5 — Behavioral verification:** §5.X subtests covering substrate integrity, nesting limits, archive cascade, RLS scoping, CoC event emission, IR42 compatibility for post-seal workstream reassignment, parking-lot semantics, regression of existing CMD work.

Estimated effort: 10-14 hours, multi-session probable. (Slightly higher than v1's 8-12h due to nesting + archive cascade + parking-lot semantics.)

Iron Rule 65: **does not fire.** No template body changes. Single-pin bump (js/version.js only).

---

## §6 — Q-W decision status

| ID | Question | Status |
|---|---|---|
| Q-W1 | Default workstream name | **Resolved by parking-lot model** — no default workstream needed |
| Q-W2 | Post-seal workstream reassignment allowed | **Architect-ratified: yes** (per §2.5; second data point for IR42 navigational-classification pattern) |
| Q-W3 | Workstream description required or optional | **Optional** (architect default; description is nullable in §2.1) |
| Q-W4 | project_id vs workstream_id | **Defer to Phase 1 investigation** |
| Q-W5 | Where workstream-management surface lives | **Defer to Phase 1 investigation** (depends on existing chrome structure) |
| Q-W6 | Parking lot model | **Architect-ratified: yes** (incorporated throughout) |
| Q-W7 | Nesting depth | **Architect-ratified: two levels** (top-level + sub-workstream); deeper levels deferred |
| Q-W8 | Terminology | **Operator-confirmed: workstreams** |
| Q-W9 | Multi-select drag-and-drop | **Defer to constellation CMD** (single-meeting drag-drop is MVP) |
| Q-W10 | Workstream archive → meetings | **Architect-ratified: meetings return to parking lot** (per §2.7) |

All decisions resolved or appropriately deferred. Brief drafting can proceed when operator confirms commission.

---

## §7 — What this CMD enables (in CMD-ACCORD-CONSTELLATION-ENTRY-1)

The constellation visualization needs the substrate this CMD provides:

- List of top-level workstreams to render as constellation nodes
- Per-workstream and per-sub-workstream metrics (recent meetings, open decisions, days-since-last-touch — derived; this CMD provides substrate, constellation CMD computes derivatives)
- Workstream lifecycle states (active vs archived) for ring placement
- Parking-lot meeting query (workstream_id IS NULL, scoped to operator)
- Meeting-to-workstream linkage updates via API (drag-and-drop UX)
- Workstream creation API at any level

What the next CMD adds:

- Constellation radial visualization
- Smooth transitions (dissolve + scale) between levels
- ESC-back-to-constellation behavior
- Parking-lot pane (persistent right-rail at every level)
- Drag-and-drop interactions (parking-lot → workstream, workstream → workstream, X-to-parking-lot)
- `+New Workstream` buttons at constellation level and sub-level
- Workstream-level page (flat list of meetings within the workstream, ordered by date)
- Activity-intensity computation (real-time or cached)
- Layout positioning logic (concentric rings? angular sectors? operator-draggable positioning?)

---

## §8 — Architectural significance

This is small-but-load-bearing substrate. The workstream concept enables the operator's primary organizing principle. The parking-lot model + drag-and-drop reorganization is what makes Accord feel inhabit-able rather than impose-an-organization-or-suffer.

The "MIN" discipline applies: ship the smallest substrate change that unblocks the constellation visualization. Resist multi-organization workstream membership, workstream templates, workstream archetypes, workstream owner roles, deeper nesting, etc. Those are real concepts that may eventually matter; none is needed for the first useful version.

The IR42 navigational-classification pattern matures from one data point (F-P3-6 late dissent) to two (workstream reassignment). If a third recurrence emerges in future CMDs, the pattern becomes ratifiable as an Iron Rule extension.

---

## §9 — Pending operator confirmation

All Q-W decisions resolved per §6. Ready for brief drafting when operator confirms.

Brief estimate: 500-650 lines (comparable to CMD-SUBSTRATE-COUNTERFACTUAL-MIN's 620-line brief), multi-session implementation, doctrinal floor on §5.X verification subtests covering nesting + archive cascade + parking-lot + IR42 + RLS + CoC.

---

*End of architectural scaffolding (v2) — CMD-ACCORD-WORKSTREAMS-SUBSTRATE-1.*
