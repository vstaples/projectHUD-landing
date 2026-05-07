# Brief · Substrate Counterfactual Minimum · CMD-SUBSTRATE-COUNTERFACTUAL-MIN

## §0 — Standing rules for fresh agent

Read before proceeding.

**Iron Rule 36, 37, 38, 39, 40** — base operating discipline.
**Iron Rule 42** — substrate immutability holds. New fields added by this CMD become immutable upon node sealing per the same pattern.
**Iron Rule 45** — declarative-vocabulary-only floor strictly applies. Dissent UI especially must avoid "confidence", "probability", "certainty", "likelihood", "posterior", "prior", "meter", "gauge".
**Iron Rule 51** — class-conditional treatments at construction time.
**Iron Rule 52 §4** — function-name and logical-concern collision check.
**Iron Rule 55** — architect-side canonical-source verification through agent-side investigation halts.
**Iron Rule 58 (amended)** — CoC writes use actor_resource_id; defensive layer in coc.js handles user_id → resource_id resolution. New CoC events emitted by this CMD use the amended path.
**Iron Rule 60** — first-caller hazard awareness for novel substrate patterns.
**Iron Rule 64** — codebase-as-spec strictly applies. The agent surveys existing accord_nodes population paths, edge-type registration, EVENT_META patterns, and template-body conventions before introducing new mechanisms.
**Iron Rule 65** — render-version dual-pin **applies and fires affirmatively**. Technical Briefing template's `DC-?` tooltips become real seq_ids; that's a template body change. **Both `js/version.js` AND `RENDER_VERSION` constant in `supabase/functions/render-minutes/index.ts` MUST move together.** First affirmative IR65 firing since CMD-PROJECTION-ENGINE-2.

This is the **first strategic-roadmap CMD** — bedrock for counterfactual operator capability. Scope discipline matters: the "MIN" in the name is structural intent. Add only what unblocks CMD-COUNTERFACTUAL-POC; resist anticipating capabilities that belong in subsequent CMDs.

Five-phase work pattern with halt-and-surface points between phases. Multi-session probable; total estimate 8-15 hours.

---

## §1 — Purpose

Per `accord-vision-v1.md`, ProjectHUD becomes three architectural compounds:

1. **Projection engine** — every artifact configuration over substrate (shipped via CMD-PROJECTION-ENGINE-1/2)
2. **Counterfactual operator** — graph traversal computes alternatives ("what if DC-117 had been declined?")
3. **CPM linkage** — same graph computes slack, critical path, schedule manipulation

Compound 1 ships against existing substrate. Compounds 2 and 3 require substrate additions that don't yet exist.

CMD-SUBSTRATE-COUNTERFACTUAL-MIN delivers the minimum substrate changes that make compound 2 buildable. After this CMD ships:

1. Every accord_node has a stable, human-readable, per-firm sequential identifier (DC-01, AX-01, RK-01, OQ-01, BL-01, NT-01, DS-01)
2. Dissent is a first-class substrate primitive — registered against decisions via dissent nodes connected by `dissents_from` edges, with rationale, predicted outcome, and timestamp
3. Decisions, actions, and risks have `effective_date` and `due_date` fields distinguishing "when decided" from "when it takes effect" from "when work is due"
4. Operator-facing surfaces display seq_ids in addition to (eventually instead of) UUIDs
5. Technical Briefing template tooltips ("DC-?") become populated with actual seq_ids
6. CoC events emit for dissent registration, effective_date changes, due_date changes
7. The substrate is ready for CMD-COUNTERFACTUAL-POC to walk the graph and compute alternatives

---

## §2 — Scope

### In scope

- **Phase 1:** investigation per §3
- **Phase 2:** sequence ID substrate (`seq_class`, `seq_number`, `seq_id` columns + allocation trigger + `node_class_seq_prefixes` registry table + backfill)
- **Phase 3:** dissent substrate (new `dissent` node class + `dissents_from` edge type + dissent metadata fields + minimum operator-facing affordance for registering dissent + new CoC events)
- **Phase 4:** date-field substrate (`effective_date`, `due_date`, `effective_date_basis` columns + CoC events for date changes)
- **Phase 5:** behavioral verification per §5
- Operator-facing changes per §3-§4 (Decision Ledger displays seq_id; URL routing accepts seq_id; Technical Briefing template tooltip update; minimal dissent UI)
- Technical Briefing template body update (DC-? tooltips populated; IR65 fires)
- Pin bumps in BOTH `js/version.js` AND `RENDER_VERSION` constant per IR65
- Hand-off per §8

### Out of scope

- Any counterfactual UI or query surface — that's CMD-COUNTERFACTUAL-POC
- CPM logic — that's CMD-CPM-SUBSTRATE-1 / CMD-CPM-DERIVED-1
- PERT distributions — multiple CMDs out
- Retrospective accuracy queries — substrate-only this CMD; queries land later
- Comprehensive dissent UI — only minimum visibility (small affordance to register dissent + count badge); full retrospective surface is its own CMD
- Backfill of historical "implicit dissent" — existing decisions stay as-is; future decisions can register dissent
- Compass-side sequence ID linkage — that's CMD-COMPASS-BRIDGE
- New node classes beyond what's specified
- Changes to existing edge types
- Schema changes outside accord_nodes, accord_edges, and the new `node_class_seq_prefixes` registry
- Any changes to Edge Functions other than the IR65-required RENDER_VERSION update + Technical Briefing template body
- Changes to authentication, authorization, or RLS beyond what new substrate requires

---

## §3 — Investigation requirements (Phase 1)

Before applying any migration, the agent surveys.

### §3.1 Existing accord_nodes schema and class field

Document:
- Full column list of `accord_nodes` (data types, nullability, defaults, constraints)
- The existing "node class" / "node type" field (likely `node_class` or `kind`); what values currently exist
- Whether class values match the proposed prefix-mapping (decision/action/risk/open_question/belief/note); flag any mismatches
- How node class is currently set on INSERT (application code, default, trigger?)

### §3.2 Existing edge type registry

Document:
- Full column list of `accord_edges`
- The `edge_type` (or equivalent) field; what values currently exist
- Whether new edge types require schema changes or registration (e.g., a `_edge_types` enum or table)
- How edges are currently created (application code path)
- RLS policies on accord_edges — verify the new `dissents_from` edge inherits firm-scoped isolation

### §3.3 EVENT_META patterns in coc.js

Document:
- Existing EVENT_META entries; the established pattern for new event types
- Where new entries should be added in the file (alphabetical? grouped by domain?)
- Verify the IR58-amended write path supports the new events without modification

### §3.4 Technical Briefing template current state

Document:
- Current text of the DC-? / AX-? / RK-? / OQ-? tooltips in `supabase/functions/render-minutes/index.ts`
- Current `RENDER_VERSION` value
- The exact change required to populate tooltips with real seq_ids (the projection engine reads seq_id from substrate; template renders it inline)
- Confirm IR65 fires: this is a template body change → both pins must move

### §3.5 _myResource and IR58 amendment integration

Document:
- For new CoC events emitted by this CMD, confirm they use the IR58-amended writer (no per-call user_id → resource_id resolution required)
- Verify dissent registration writes via CoC.write() rather than direct API.post (avoid CMD-COC-DIRECT-WRITER-AUDIT-1's bypass pattern)

### §3.6 Architectural design question verification

The architect has provided leans for §4 design questions Q1-Q6 in the scaffolding document. For each, the agent verifies the lean against actual codebase patterns:

- **Q1 (seq_id allocation)** — architect-leans Option B (trigger + advisory lock). Survey: are there existing PostgreSQL sequences in the schema? Are there existing trigger-based allocation patterns? If existing patterns favor sequences, surface for re-deliberation.
- **Q2 (dissent representation)** — architect-leans Option A (edge in accord_edges). Survey: do existing 1:1 relationships use edges or FK columns? If FK columns are the canonical pattern, surface.
- **Q3 (dissent seq prefix)** — architect-confirmed DS prefix. No survey required.
- **Q4 (effective_date default)** — architect-leans NULL. No survey required (operator decision).
- **Q5 (late dissent allowed)** — architect-leans Option B (allowed with timestamp). Survey: how do existing post-seal substrate additions work? (None should exist per IR42; if any exist, document.)
- **Q6 (seq_id immutability)** — architect-confirmed immutable upon allocation. No survey required.

### §3.7 Halt point — surface findings

After Phase 1 completes, the agent halts and surfaces:

1. The accord_nodes schema baseline + node class enumeration
2. The accord_edges schema baseline + edge type registration mechanism
3. EVENT_META patterns + recommended insertion points for new events
4. Technical Briefing template current state + RENDER_VERSION value
5. Verification of IR58-amended writer integration
6. For each Q1-Q6, the codebase pattern observed; flag any divergences from architect-leans
7. Architectural surprises noticed during investigation
8. Recommended Phase 2-5 implementation specifics based on findings

The agent waits for architect confirmation before proceeding to Phase 2.

---

## §4 — Substrate additions (applied across Phases 2-4)

### §4.1 Sequence IDs (Phase 2)

#### Schema additions

```sql
-- Registry table for per-class prefixes (extensible)
CREATE TABLE node_class_seq_prefixes (
  node_class text PRIMARY KEY,
  prefix     char(2) NOT NULL UNIQUE,
  added_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO node_class_seq_prefixes (node_class, prefix) VALUES
  ('decision',       'DC'),
  ('action',         'AX'),
  ('risk',           'RK'),
  ('open_question',  'OQ'),
  ('belief',         'BL'),
  ('note',           'NT'),
  ('dissent',        'DS');
-- Exact node_class values per Phase 1 §3.1 survey; the values shown match the proposed Phase 3 dissent class.

-- Sequence-ID columns on accord_nodes
ALTER TABLE accord_nodes
  ADD COLUMN seq_class  text,
  ADD COLUMN seq_number integer,
  ADD COLUMN seq_id     text GENERATED ALWAYS AS (
    seq_class || '-' || lpad(seq_number::text, 3, '0')
  ) STORED;

CREATE UNIQUE INDEX idx_accord_nodes_firm_seq_id ON accord_nodes (firm_id, seq_id);
CREATE INDEX idx_accord_nodes_seq_id ON accord_nodes (seq_id);
```

#### Allocation trigger

Per Q1 architect-lean (Option B):

```sql
CREATE OR REPLACE FUNCTION allocate_node_seq()
RETURNS TRIGGER AS $$
DECLARE
  v_prefix char(2);
  v_next   integer;
BEGIN
  -- Look up prefix from registry
  SELECT prefix INTO v_prefix
  FROM node_class_seq_prefixes
  WHERE node_class = NEW.node_class;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'No seq_prefix registered for node_class=%', NEW.node_class;
  END IF;

  -- Acquire advisory lock keyed by (firm_id, prefix); race-safe per-firm allocation
  PERFORM pg_advisory_xact_lock(
    hashtext(NEW.firm_id::text || ':' || v_prefix)
  );

  -- Find next number
  SELECT COALESCE(MAX(seq_number), 0) + 1 INTO v_next
  FROM accord_nodes
  WHERE firm_id = NEW.firm_id
    AND seq_class = v_prefix;

  NEW.seq_class := v_prefix;
  NEW.seq_number := v_next;
  -- seq_id is generated; populated automatically by GENERATED column

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accord_nodes_seq_alloc
  BEFORE INSERT ON accord_nodes
  FOR EACH ROW
  WHEN (NEW.seq_number IS NULL)
  EXECUTE FUNCTION allocate_node_seq();
```

#### Backfill

Existing rows lack seq_class/seq_number. Backfill in chronological order grouped by (firm_id, node_class), allocating sequential numbers:

```sql
-- Within a single transaction
WITH numbered AS (
  SELECT 
    n.id,
    p.prefix AS new_seq_class,
    ROW_NUMBER() OVER (
      PARTITION BY n.firm_id, n.node_class 
      ORDER BY n.created_at, n.id
    ) AS new_seq_number
  FROM accord_nodes n
  JOIN node_class_seq_prefixes p ON p.node_class = n.node_class
  WHERE n.seq_class IS NULL
)
UPDATE accord_nodes n
SET seq_class = numbered.new_seq_class,
    seq_number = numbered.new_seq_number
FROM numbered
WHERE n.id = numbered.id;
```

#### IR42 immutability

Once a node is sealed (sealed_at IS NOT NULL), seq_class and seq_number cannot change. Per Q6 ratified, seq_id is also immutable upon allocation regardless of sealed status. Add a BEFORE UPDATE trigger or check predicate ensuring this.

#### Operator-facing changes

- Decision Ledger row format: `DC-117 · Modeled across seven quarters` (seq_id prepended; existing title preserved)
- URL pattern: `/accord/decision-record/DC-117` resolves via lookup; existing UUID URLs continue to work via redirect
- CoC events include `seq_id` in their human-readable description: `"V. Staples sealed DC-117 · 12 nodes, 4 edges"` instead of UUID
- Living Document inline references use `seq_id`

The agent surveys existing UI code paths for decision-record display and URL routing. Iron Rule 64 — the existing patterns are the spec.

### §4.2 Dissent substrate (Phase 3)

#### Schema additions

Add `dissent` to the existing node_class enumeration (or whatever mechanism the codebase uses per §3.1). Add `dissents_from` to the edge type registry per §3.2.

Dissent-specific metadata fields on accord_nodes (architect-decide whether these are JSONB on existing metadata column or net-new columns; agent surveys for canonical pattern):

- `dissented_by` — UUID, the dissenter (resource_id per IR58 amended)
- `dissent_rationale` — text
- `dissent_predicted_outcome` — text, nullable
- `dissent_recorded_at` — timestamptz, defaults to now()

#### Edge constraint enforcement

Per Q2 architect-lean (Option A / edge representation), the 1:1 cardinality (each dissent dissents from exactly one decision) is enforced via trigger or check constraint:

```sql
-- A dissent node must have exactly one outgoing dissents_from edge
-- to a decision node. Enforced via trigger.
CREATE OR REPLACE FUNCTION enforce_dissent_cardinality()
RETURNS TRIGGER AS $$
DECLARE
  v_count integer;
BEGIN
  -- After insert/update on accord_edges, if it's a dissents_from edge, verify cardinality
  IF NEW.edge_type = 'dissents_from' THEN
    SELECT COUNT(*) INTO v_count
    FROM accord_edges
    WHERE source_node_id = NEW.source_node_id
      AND edge_type = 'dissents_from';

    IF v_count > 1 THEN
      RAISE EXCEPTION 'Dissent node % already has a dissents_from edge', NEW.source_node_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Also: the source node must be of class `dissent` and the target must be of class `decision`. Enforce via trigger or partial unique constraint.

#### Late dissent (Q5 ratified)

Per Q5 architect-lean (Option B), dissent CAN be registered against an already-sealed decision. The substrate captures `dissent_recorded_at` distinct from the parent decision's `sealed_at`; queries can distinguish prospective vs retrospective dissent.

Mechanism: dissent nodes don't trigger the parent decision's IR42 immutability (the decision row itself doesn't change; only its dissent count derived view changes). Add an `accord_decisions_dissent_count` derived view or function for query convenience.

#### CoC events

Add to EVENT_META in `js/coc.js`:

- `accord.dissent.recorded` — fires when a dissent node is created with rationale recorded
- `accord.dissent.archived` — fires when a dissent is archived (does NOT delete; substrate immutability holds)

#### Minimum operator-facing affordance

Decision Record UI gets:
- A small "Register dissent" button visible to all firm members for any decision (sealed or unsealed)
- Modal opens with: dissenter (auto-set to current user, editable to record dissent on behalf of someone else with operator-judged ux), rationale (text), predicted outcome (optional text)
- On submit: writes dissent node + dissents_from edge + emits CoC event

Living Document gets:
- A small dissent-count badge next to dissented decisions: `DC-117 · ⚑ 2 dissents`
- Clicking the badge opens the Decision Record's dissent panel

Both UI surfaces are minimum-viable. Full retrospective surface (showing dissent timeline, predicted-vs-actual comparison, calibration metrics) is a future CMD.

### §4.3 effective_date / due_date / effective_date_basis (Phase 4)

#### Schema additions

```sql
ALTER TABLE accord_nodes
  ADD COLUMN effective_date       date,
  ADD COLUMN due_date              date,
  ADD COLUMN effective_date_basis  text;
```

All three nullable. Per Q4 architect-confirmed, no default values — operators affirm intent.

Field semantics by node class (documented in code comments and operator-facing tooltips):

| Class | effective_date | due_date |
|---|---|---|
| Decision (DC) | When decision takes effect | typically null |
| Action (AX) | When action begins | When action must complete |
| Risk (RK) | When risk window opens | When risk window closes (mitigation deadline) |
| Open question (OQ) | typically null | When answer is required |
| Belief (BL) | typically null | typically null |
| Note (NT) | typically null | typically null |
| Dissent (DS) | When dissent recorded | typically null |

#### IR42 mutability rules

Per IR42, once `sealed_at` is set, both date fields become immutable. Pre-seal, they're mutable; date changes emit CoC events for traceability:

- `accord.node.effective_date_changed`
- `accord.node.due_date_changed`

Add to EVENT_META.

#### Operator-facing changes

Decision Record / Action card UIs gain optional date pickers for effective_date and due_date with helper text per node class. Living Document displays dates inline where present.

Technical Briefing template (and other render templates as appropriate) reference these fields where the projection makes sense — e.g., a decisions-by-effective-date sort, an actions-due-this-quarter section, etc. Initial template body changes: minimal, just enough to demonstrate the substrate is wired.

### §4.4 Technical Briefing template tooltip population (IR65 fires)

The current Technical Briefing template has placeholder tooltips like `DC-?`, `AX-?`, `RK-?`, `OQ-?` that read "land in CMD-SUBSTRATE-COUNTERFACTUAL-MIN." This CMD populates them with real seq_ids.

Template body changes:
- Replace `DC-?` placeholders with `${node.seq_id}` (template variable; projection engine populates from substrate)
- Same for AX-?, RK-?, OQ-?
- Update tooltip text from "land in CMD-SUBSTRATE-COUNTERFACTUAL-MIN" to operator-meaningful descriptive text

**Iron Rule 65 fires.** Both pins move:
- `js/version.js` → `v20260507-CMD-SUBSTRATE-COUNTERFACTUAL-MIN` (or similar with date appropriate to deploy)
- `RENDER_VERSION` constant in `supabase/functions/render-minutes/index.ts` → matching pin value

The agent surveys the existing template body to confirm exact placeholder syntax before applying changes.

---

## §5 — Behavioral verification

### §5.1 Sentinel — code identity

1. Hard-refresh accord.html. Console banner shows CMD-SUBSTRATE-COUNTERFACTUAL-MIN.
2. Verify `_PROJECTHUD_VERSION` matches.
3. **PASS** = post-CMD code is loaded.

### §5.2 Sequence ID allocation (DOCTRINAL FLOOR)

1. Create a new decision node via existing UI. Verify `seq_id` is allocated correctly (DC-N where N is one greater than the firm's prior maximum DC).
2. Repeat for action, risk, open question. Verify each gets correct prefix and monotonic numbering within firm.
3. Create two decisions in rapid succession (concurrent if possible). Verify no seq_id collision; both get distinct numbers.
4. Verify backfilled rows have correct seq_class/seq_number per their node_class and chronological order.
5. Attempt to update seq_class or seq_number on an existing row. Verify rejection per IR42 immutability.
6. Verify `(firm_id, seq_id)` uniqueness constraint enforced (cross-firm collisions allowed; intra-firm rejected).
7. **PASS** = allocation correct, race-safe, backfill correct, immutability holds.

### §5.3 Operator-facing seq_id surfacing

1. Decision Ledger displays seq_id alongside title.
2. URL `/accord/decision-record/DC-117` resolves to the correct decision (assumes DC-117 exists in test data).
3. CoC event human-readable descriptions include seq_id.
4. Technical Briefing template renders real seq_ids (not "DC-?").
5. Living Document inline references use seq_ids.
6. **PASS** = seq_ids visible across all surfaces specified.

### §5.4 Dissent substrate (DOCTRINAL FLOOR)

1. Register a dissent against an unsealed decision via the Decision Record UI. Verify dissent node + dissents_from edge created; CoC event `accord.dissent.recorded` written.
2. Verify the dissent has correct seq_id (DS-N).
3. Attempt to register a second dissents_from edge from the same dissent node to a different decision. Verify rejection (1:1 cardinality enforced).
4. Register dissent against a sealed decision. Verify success (Q5 ratified — late dissent allowed).
5. Verify Living Document displays dissent count badge next to dissented decisions.
6. Verify dissent metadata (rationale, predicted_outcome, recorded_at) persists correctly.
7. Attempt to modify a registered dissent's rationale. Verify rejection per IR42 (or appropriate behavior; agent surveys existing patterns).
8. Verify dissent CoC events write correctly via IR58-amended actor resolution path.
9. **PASS** = dissent substrate complete; cardinality enforced; late dissent works; immutability holds.

### §5.5 Date fields

1. Create a decision with `effective_date = 2026-07-01`. Verify the date persists.
2. Update the effective_date pre-seal. Verify CoC event `accord.node.effective_date_changed` fires.
3. Seal the decision. Attempt to update effective_date post-seal. Verify rejection per IR42.
4. Create an action with `due_date = 2026-08-15`. Verify persistence and CoC event flow.
5. Create a node with no dates specified. Verify nullable fields accept null.
6. **PASS** = date fields work; CoC events fire on changes; immutability holds post-seal.

### §5.6 Cross-firm isolation regression

1. Verify firm A's seq_ids start from 1 within firm A; firm B's start from 1 within firm B.
2. Verify firm A user cannot read firm B's nodes via seq_id lookup (RLS holds).
3. Verify dissent registration in firm A doesn't appear in firm B context.
4. **PASS** = cross-firm isolation preserved.

### §5.7 IR65 dual-pin verification

1. Verify `js/version.js` pin matches CMD-SUBSTRATE-COUNTERFACTUAL-MIN.
2. Verify `RENDER_VERSION` in `supabase/functions/render-minutes/index.ts` matches.
3. Render a Technical Briefing for a meeting with at least one decision. Verify the rendered output contains real seq_ids (DC-N, etc.) not placeholders (DC-?).
4. **PASS** = dual-pin consistent; template body changes deployed.

### §5.8 Existing CMD regression

1. Live Capture, Living Document, Decision Ledger, Digest & Send, Minutes — all surfaces load and operate.
2. End a meeting; verify auto-render fires; minutes render correctly with seq_ids populated.
3. Aegis Library + playbook execution unaffected.
4. CoC integrity intact (no FK errors per CMD-COC-ACTOR-RESOURCE-1 amended path).
5. CMD-AEGIS-1 cross-firm isolation preserved.
6. **PASS** = no regression of prior CMD work.

### §5.9 IR45 vocabulary preservation

1. Grep all new substrate-related text (operator UI, tooltips, error messages) for: confidence, probability, certainty, likelihood, posterior, prior, meter, gauge.
2. **PASS** = zero matches in user-facing text.

---

## §6 — Consumer enumeration (Iron Rule 38)

Cannot fully specify until §3 investigation completes. Likely files:

| File | Effect |
|---|---|
| `supabase/migrations/202605XX000001_node_class_seq_prefixes.sql` | NEW — registry table |
| `supabase/migrations/202605XX000002_accord_nodes_seq_id.sql` | NEW — seq columns + trigger + backfill + immutability |
| `supabase/migrations/202605XX000003_dissent_substrate.sql` | NEW — dissent class + edge type + cardinality enforcement + metadata |
| `supabase/migrations/202605XX000004_accord_nodes_dates.sql` | NEW — effective_date, due_date, effective_date_basis columns |
| `js/coc.js` | MODIFIED — EVENT_META entries: `accord.dissent.recorded`, `accord.dissent.archived`, `accord.node.effective_date_changed`, `accord.node.due_date_changed` |
| `js/accord-core.js` (or equivalent) | MODIFIED — Decision Record UI gains "Register dissent" affordance; Living Document gains dissent count badge; Decision Ledger displays seq_id |
| Other surface modules | MODIFIED — seq_id display in inline references; date pickers on appropriate node creation flows |
| `supabase/functions/render-minutes/index.ts` | MODIFIED — Technical Briefing template body: tooltip population; RENDER_VERSION pin moves (IR65 fires) |
| `js/version.js` | MODIFIED — pin moves (IR65 fires; both pins together) |

**No changes to:**
- Existing accord_nodes columns beyond additions
- Existing accord_edges columns beyond new edge type entries
- RLS policies (new tables/columns inherit existing firm-scoped patterns)
- Other Edge Functions
- Auth/api modules

---

## §7 — Smoke test

After Phase 5 deploy:

1. Hard-refresh accord.html. Console banner shows CMD-SUBSTRATE-COUNTERFACTUAL-MIN.
2. Verify both pins moved (`js/version.js` and `RENDER_VERSION`).
3. Create a decision. Verify it gets a seq_id.
4. Register a dissent against it. Verify dissent shows in UI; CoC event fires.
5. Set an effective_date. Verify persistence; CoC event fires on change.
6. Render Technical Briefing. Verify seq_ids populated.
7. Verify cross-firm isolation: log in as different-firm user; verify no leakage.

---

## §8 — Hand-off format

Required output:

1. Files modified — one-liner per file.
2. **§3 investigation findings as a separate section** — schema baselines, design-question verifications, architectural surprises. Surfaced BEFORE phase 2-4 migrations apply.
3. Migration diffs — full SQL text for each migration file.
4. Application code diffs — unified diff for js/coc.js, surface modules, Edge Function.
5. Smoke test result.
6. Behavioral verification results — per §5 subtest with explicit PASS/FAIL.
7. Findings — particularly:
   - Whether seq allocation strategy held against actual concurrency patterns
   - Whether dissent edge approach matched existing 1:1 patterns or required adaptation
   - Backfill outcome statistics (rows backfilled per firm per class)
   - CoC event integration with IR58-amended writer
   - IR65 dual-pin verification
   - Any architectural surprises encountered during phase application

If §5.2 (seq ID allocation) or §5.4 (dissent substrate) fails, halt and surface — those are doctrinal-floor checks.

---

## §9 — Reference materials

Required inputs (halt per Iron Rule 40 §1.1 if any are missing):

- This brief
- Current `js/coc.js` (post-CMD-COC-ACTOR-RESOURCE-1)
- Current `js/accord-core.js` (or equivalent surface module)
- Current `supabase/functions/render-minutes/index.ts` (post-CMD-PROJECTION-ENGINE-2)
- Current accord_nodes and accord_edges schemas
- `accord-vision-v1.md` (strategic context)
- `projecthud-functional-requirements-v1.md` (downstream capability requirements)
- `scaffolding-cmd-substrate-counterfactual-min.md` (architectural conceptual sketch)
- All Iron Rules ratifications 36-65 + IR58 amendment

---

## §10 — Agent narrative instruction block

```
Apply brief-cmd-substrate-counterfactual-min.md.

First strategic-roadmap CMD. Bedrock for counterfactual operator
capability. The "MIN" in the name is structural intent —
minimum substrate changes that unblock CMD-COUNTERFACTUAL-POC,
not comprehensive substrate redesign.

Five-phase work pattern with halt-and-surface points:
- Phase 1: investigation per §3 (HALT, surface findings)
- Phase 2: sequence ID substrate (after architect confirmation)
- Phase 3: dissent substrate (after Phase 2 verification)
- Phase 4: date fields substrate (after Phase 3 verification)
- Phase 5: behavioral verification per §5

Multi-session probable. Total estimate 8-15 hours.

Architect decisions ratified going into this CMD:
- Q1: seq_id allocation via trigger + advisory lock (Option B)
- Q2: dissent representation via accord_edges (Option A)
- Q3: dissent gets DS seq prefix
- Q4: effective_date defaults to NULL (operator must affirm)
- Q5: late dissent allowed against sealed decisions (Option B)
- Q6: seq_id immutable upon allocation regardless of sealed
- Sequence prefix mapping: DC, AX, RK, OQ, BL, NT, DS
- 5-phase split correct
- Minimum dissent UI in scope (Phase 3)
- Technical Briefing template tooltip update folded in (IR65 fires)

Iron Rule 65 fires affirmatively. Both pins move:
- js/version.js
- RENDER_VERSION constant in render-minutes/index.ts

Iron Rule 64 strictly applies: survey existing patterns
(node class enum, edge type registry, EVENT_META, template
body) before introducing new mechanisms. Phase 1 §3.6
verifies architect-leans against actual codebase patterns;
flag divergences.

Iron Rule 58 (amended): all new CoC events use the defensive-
layer writer. No per-call user_id → resource_id resolution
required.

§5.2 (seq ID allocation) and §5.4 (dissent substrate) are
doctrinal-floor checks. Halt on either failure.

Hand-off format per §8.

Halt on missing input. Halt after Phase 1 investigation. Halt
between phases for verification. Halt if §5.2 or §5.4 fails.

Proceed.
```

---

## §11 — Architectural significance

This CMD opens three doors that subsequent CMDs walk through:

1. **Sequence IDs** make the substrate addressable in human-readable form. Counterfactual queries become operator-pronounceable. Cross-references in briefs, CoC events, and Living Documents become memorable.

2. **Dissent nodes** make the substrate's representation of "the path not taken" first-class. Without dissent, ProjectHUD captures only ratified outcomes; with dissent, it captures the deliberation around them. This is the substrate base for organizational decision quality metrics — the substrate now records both the outcome and the rejected alternative-with-rationale, making retrospective accuracy measurable.

3. **effective_date and due_date** make time a queryable substrate dimension. "What if this had been effective three months earlier?" becomes a substrate query, not a hypothetical. Critical-path computation becomes possible.

The "MIN" in the name is honest discipline. Each substrate addition justifies itself by enabling exactly one downstream capability. Resist the temptation to anticipate more.

---

*End of Brief — Substrate Counterfactual Minimum (CMD-SUBSTRATE-COUNTERFACTUAL-MIN).*
