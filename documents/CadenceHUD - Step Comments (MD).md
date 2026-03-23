# Step Comment Threads + Confidence Signals
## Architecture Document — CadenceHUD Session 9
**Apex Consulting Group · ProjectHUD · Confidential**
*March 23, 2026*

---

## 1. Purpose & Strategic Rationale

Step Comment Threads + Confidence Signals is the communication layer that lives
inside each workflow step. It captures three things in a single gesture:

1. **The human note** — free text, what the person is thinking right now
2. **The confidence signal** — Green (on track) / Yellow (uncertain) / Red (blocked)
3. **The hours logged** — optional time entry attached to the comment

This feature is deliberately sequenced before the AI Intelligence Briefing because
it dramatically enriches the data the AI can synthesize. Without step comments,
the AI sees rejection events and their notes. With step comments, the AI sees the
continuous human signal between events — uncertainty expressed hours before a
rejection, blockers identified before they become failures, confidence trajectories
that predict outcomes.

The gap between "drawing notes incorrect" (rejection reason) and "not sure about
Rev D spec — waiting on engineering" (comment three hours earlier) is the gap
between a symptom and a cause. The AI can only close that gap if the comment exists.

---

## 2. Feature Overview

### 2.1 Three Layers

**Layer 1 — Step Comment Thread**
Informal, exploratory, continuous. Like a Slack thread attached to a specific
workflow step. Resources post as they work. No structure required beyond the
optional confidence signal and hours. Threaded replies supported.

**Layer 2 — Action Items**
Formal, accountability-structured. Promoted from comments by the PM with one
click. Has an owner, a due date, a status (open / in_progress / resolved /
cancelled), and a priority. Has its own reply thread for accountability tracking.
The source comment travels with it — full context preserved.

**Layer 3 — Confidence Trend**
Derived automatically from the comment history. The system tracks the confidence
signal trajectory per step and per resource. Feeds the Intelligence Briefing and
Morning Brief as a first-class data source.

### 2.2 The Comment Input Gesture

A single input area with three optional modifiers inline:

```
[ Green  Yellow  Red ]   [ clock  hours ]   [ flag  flag-type ]
[                                                               ]
[   What's the status? Add a note...                           ]
[                                                    Post  ]
```

Posting a comment with Red confidence and a Blocker flag automatically surfaces
in the Morning Brief assembler and the AI Intelligence Briefing prompt.

### 2.3 Promote to Action Item

Every comment has a Promote button visible to PMs. One click opens a lightweight
inline form pre-filled from the comment body:

```
Title:  [ Confirm Rev D release date with engineering  ]
Owner:  [ dropdown — Vaughn W. Staples                ]
Due:    [ date picker                                  ]
        [ Create Action Item ]
```

The action item appears immediately below the comment that spawned it, visually
linked. The source comment body and author travel with it permanently.

---

## 3. Database Schema

### 3.1 step_comments

```sql
CREATE TABLE step_comments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id            UUID NOT NULL,
  instance_id        UUID REFERENCES workflow_instances(id) ON DELETE CASCADE,
  template_step_id   UUID NOT NULL,
  parent_comment_id  UUID REFERENCES step_comments(id),
  author_resource_id UUID,
  author_name        TEXT,
  body               TEXT NOT NULL,
  hours_logged       NUMERIC(5,2),
  confidence         TEXT CHECK (confidence IN ('green','yellow','red')),
  flag_type          TEXT CHECK (flag_type IN ('none','question','risk','blocker')),
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  is_deleted         BOOLEAN DEFAULT false
);
```

### 3.2 workflow_action_items

```sql
CREATE TABLE workflow_action_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id            UUID NOT NULL,
  instance_id        UUID REFERENCES workflow_instances(id) ON DELETE CASCADE,
  template_step_id   UUID,
  source_comment_id  UUID REFERENCES step_comments(id),
  title              TEXT NOT NULL,
  body               TEXT,
  owner_resource_id  UUID,
  owner_name         TEXT,
  due_date           DATE,
  status             TEXT DEFAULT 'open'
                     CHECK (status IN ('open','in_progress','resolved','cancelled')),
  priority           TEXT DEFAULT 'normal'
                     CHECK (priority IN ('low','normal','high','critical')),
  created_by_name    TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  resolved_at        TIMESTAMPTZ,
  resolution_note    TEXT
);
```

### 3.3 action_item_comments

```sql
CREATE TABLE action_item_comments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id            UUID NOT NULL,
  action_item_id     UUID REFERENCES workflow_action_items(id) ON DELETE CASCADE,
  parent_comment_id  UUID REFERENCES action_item_comments(id),
  author_resource_id UUID,
  author_name        TEXT,
  body               TEXT NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT now()
);
```

### 3.4 Indexes and RLS

```sql
CREATE INDEX idx_step_comments_instance ON step_comments (firm_id, instance_id);
CREATE INDEX idx_step_comments_step     ON step_comments (template_step_id, created_at);
CREATE INDEX idx_action_items_instance  ON workflow_action_items (firm_id, instance_id);
CREATE INDEX idx_action_item_comments   ON action_item_comments (action_item_id);

ALTER TABLE step_comments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_item_comments  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firm_isolation" ON step_comments
  USING (firm_id = 'aaaaaaaa-0001-0001-0001-000000000001');
CREATE POLICY "firm_isolation" ON workflow_action_items
  USING (firm_id = 'aaaaaaaa-0001-0001-0001-000000000001');
CREATE POLICY "firm_isolation" ON action_item_comments
  USING (firm_id = 'aaaaaaaa-0001-0001-0001-000000000001');
```

---

## 4. UI Placement

### 4.1 List View — Expanded Step Panel
The comment thread lives inside the expanded step panel, below the outcome
selection area and above the Complete Step submit button. It is always visible
when the step is expanded, regardless of whether the step is active.

### 4.2 Diagram View
When a DAG node is clicked to expand, the CoC side panel gains a second tab:
Chain of Custody | Comments. The comment thread and action items render in the
Comments tab. The confidence trend indicator appears on the node itself as a
small colored dot in the bottom-left corner.

### 4.3 Confidence Signal on DAG Node
Each node that has comment activity shows a small confidence dot derived from
the most recent confidence signal posted by any resource on that step:
- Green dot — last signal was green
- Yellow dot — last signal was yellow
- Red dot — last signal was red
- No dot — no confidence signals posted

---

## 5. Chain of Custody Integration

Every comment post writes a CoC event of type `step_comment` with:
- `actor_name` — the commenter
- `event_notes` — the comment body
- `confidence` — the signal if set (stored in a new column)
- `hours_logged` — if set

Every action item creation writes a CoC event of type `action_item_created`.
Every action item resolution writes `action_item_resolved` with the resolution note.

This means the entire comment and action item history is preserved in the
chronological CoC record and appears in the hover history tooltip.

---

## 6. Competitive Analysis

| Tool         | Comment Threads        | Confidence Signal         | Time Entry           | Promotes to Action Item      |
|--------------|------------------------|---------------------------|----------------------|------------------------------|
| Jira         | Issue comments — flat, not step-scoped | None     | Via Tempo (separate) | Manual — copy to new ticket  |
| Monday.com   | Item updates — flat    | Status column (separate)  | Time column (separate)| Manual — create new item    |
| Asana        | Task comments          | None                      | Via Harvest (separate)| Manual — create subtask     |
| Smartsheet   | Row comments           | None                      | None native          | None                         |
| MS Project   | None                   | None                      | Timesheet (separate) | None                         |
| Notion       | Page comments          | None                      | None                 | None                         |
| CadenceHUD   | Step-scoped threaded, confidence + hours in single gesture | Green/Yellow/Red inline, feeds AI | Embedded in comment | One click, context travels  |

The key differentiator is integration. Every competitor stores these things in
separate places: comments here, status there, time tracking in a third tool,
action items somewhere else. CadenceHUD makes them a single gesture on a single
step, and feeds all of it to the intelligence layer automatically.

---

## 7. AI Intelligence Briefing Integration

Step comments transform the AI briefing prompt in three ways:

### 7.1 Pre-Rejection Signal
The AI can now identify whether a resource signaled uncertainty before a
rejection. A 🔴 posted two hours before a step_completed|rejected event is
a qualitatively different situation than a 🟢 followed immediately by rejection.
The former suggests the resource knew something was wrong. The latter suggests
a surprise failure.

### 7.2 Blocker Classification
When a comment carries a `blocker` flag, the AI briefing automatically
classifies the rejection type as Dependency Failure rather than Process Quality
Failure — because the resource explicitly named an external dependency as the
cause. This changes the recommended action.

### 7.3 Hours Actuals
Hours logged via comments feed an actuals-vs-PERT comparison. After sufficient
instances, the briefing can say: "Your team consistently logs 2x the PERT
optimistic estimate for this step type."

---

## 8. Next-Generation Capabilities

### 8.1 Confidence Trend Visualization on Scrubber
The timeline scrubber replay gains a second data layer — confidence dots below
the event dots. The resource's Green-Yellow-Red trajectory becomes visible in
the days before a rejection. The rejection becomes predictable in retrospect.
Over time the system learns which confidence trajectories predict rejections.

### 8.2 The Ship's Log
Every comment thread across every step of every instance becomes a permanent
organizational record. Not just what happened — but what people were thinking
while it happened. This is the Ship's Log: the continuous narrative of a project,
captured automatically without anyone writing a report.

### 8.3 Portfolio Confidence Dashboard
The Morning Brief gains a new signal: current confidence state across all active
steps, all active instances, all active projects. The Manager Brief becomes
genuinely predictive:

  "4 resources have active Red signals on critical-path steps. Historically,
  Red signals on approval steps resolve within 2 hours 60% of the time and
  escalate to rejection 40% of the time. Recommend PM check-in on:
  Approval: Design Review (red for 3 hours)."

### 8.4 Hours Actuals vs PERT Self-Correction
Every hour logged feeds the PERT calibration engine. After 10 instances the
system tells you: "Your PERT optimistic estimate for this step type is 40% too
low." The estimates self-correct over time based on actuals.

### 8.5 Promoted Action Item as Lessons Learned
When a PM resolves an action item, the resolution note travels back to the
Intelligence Briefing for that instance. After a project completes, every
action item and its resolution is a structured lessons-learned record —
automatically generated, not manually written.

### 8.6 The Confidence Cascade
When a resource posts Red on a step that has downstream dependencies, the system
traces the dependency graph and flags the PM: "This blocker may affect 3
downstream steps. Consider suspending the instance." This is not possible in
any existing PM tool because no existing tool connects micro-workflow step
signals to the project dependency graph.

---

## 9. Implementation Sequence

1. Run SQL migration — create 3 tables, indexes, RLS policies
2. Load comments on instance select — fetch step_comments for instance
3. Render comment thread in expanded step panel (list view)
4. Post comment — write step_comments row + CoC event
5. Render action item promote form
6. Create action item — write workflow_action_items row + CoC event
7. Render action item list per step
8. Resolve action item — update status + write CoC event
9. Add confidence dot to DAG nodes
10. Wire comment data into AI Intelligence Briefing prompt assembler

---

## 10. The Deepest Point

Every PM tool ever built captures what happened. CadenceHUD with Step Comments
captures what people thought was happening while it was happening — which is
completely different and vastly more valuable.

The gap between "drawing notes incorrect" (the rejection reason) and "not sure
about Rev D spec — waiting on engineering" (the comment three hours earlier) is
the gap between a symptom and a cause. The AI Intelligence Briefing can only
close that gap if the comment exists.

That is why this feature is sequenced before the AI briefing.

---

*CadenceHUD · ProjectHUD · Confidential*
*Apex Consulting Group · Session 9 · March 23, 2026*
