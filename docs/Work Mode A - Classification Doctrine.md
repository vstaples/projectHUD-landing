# ProjectHUD Work Mode Classification Doctrine v1.0

**Status:** ratified 2026-04-28
**Authority:** operator + architect (per Style Doctrine §0.1)
**Scope:** every coding work-cycle initiated against ProjectHUD,
regardless of size, urgency, or surface

---

## §0 — Purpose

This doctrine establishes three tiers of coding work — Mode A
(Architectural), Mode B (Surface batch), Mode C (Direct) — each
with its own operating discipline. The doctrine exists because
the prior unified-discipline approach (every work-cycle goes
through architect-mediated brief authoring) imposed
disproportionate setup overhead on small fixes.

A 30-minute setup cost for a 5-minute fix wastes 25 minutes.
Multiplied across many small fixes, the discipline collapses
under its own weight. This doctrine introduces lightweight tiers
for work that doesn't require architect mediation.

The doctrine is also a guardrail: by classifying work explicitly,
the operator and architect avoid mode-confusion (treating
architectural work as a quick fix, or treating a quick fix as
architectural). Mode classification is the first decision in any
work-cycle.

---

## §1 — The three modes

### §1.1 Mode A — Architectural

**When to use:**
- New components, modules, or surfaces
- Refactors affecting multiple files or surfaces
- Architectural changes (data flow, state management,
  cross-cutting concerns)
- New feature development with non-trivial scope
- Changes that would alter doctrine or require doctrine
  amendment
- Any work where the architect's judgment on *how* to achieve
  intent is needed

**Discipline:**
- Full architect-authored brief
- All Iron Rules apply (36, 37, 39, 40, plus Style Doctrine
  governance)
- §0 standing rules in brief
- Single-fix discipline within the brief
- Operator hand-off via copy-paste narrative block
- Hand-off review by architect before next cycle

**Typical setup time:** 20-60 minutes architect work + 5-10
minutes operator hand-off
**Typical work-cycle:** 1-4 hours agent execution
**Examples:**
- "Retrofit Pipeline onto unified header"
- "Establish Aegis registry for CLI verb dispatch"
- "Migrate version cache-bust to single source of truth"

### §1.2 Mode B — Surface batch

**When to use:**
- Multiple known issues affecting a single surface
- Visual cleanup pass on a specific page
- Post-deploy regression sweep covering multiple defects
- Surface-localized improvements where individual issues are
  small but the collection is substantial
- Doctrine-driven retrofit of a specific surface

**Discipline:**
- Architect-authored batch brief enumerating all known issues
  for the surface
- Iron Rules apply (36, 37, 39, 40)
- Single-issue discipline applies *within the batch* — agent
  works through the list sequentially, not all at once
- Hand-off reports per-item status (item 1 PASS, item 2 PASS,
  item 3 NOT VERIFIED, etc.)
- New issues discovered during execution are surfaced in the
  hand-off as findings; they do NOT get added to the batch
  mid-execution
- Operator verifies the full batch post-deploy

**Typical setup time:** 15-30 minutes architect work
**Typical work-cycle:** 30-90 minutes agent execution
**Examples:**
- "Pipeline visual cleanup pass — five known issues" (CMD96.1)
- "Compass post-doctrine retrofit — eight items"
- "Dashboard regression sweep after CMD99 deploy" (CMD99.1)

### §1.3 Mode C — Direct

**When to use:**
- Single trivial fix bounded by existing doctrine
- Visual tweaks: button color, padding, font weight on a
  specific element
- Copy edits, label corrections, typo fixes
- Cosmetic adjustments where the doctrine constrains the
  agent's freedom and the fix's correctness is operator-
  verifiable at a glance
- Bug fixes obvious enough that explanation would exceed the
  fix's scope

**Discipline:**
- No architect brief required
- Operator authors a 1-3 sentence directive directly to the
  agent
- Doctrine references are the agent's guardrails
  (Style Doctrine, Iron Rules, onboarding protocol)
- Iron Rules 36, 37, 40 apply
- Iron Rule 39 does NOT apply (no architect brief means no
  briefing-discipline gates)
- Hand-off is one to three lines: what changed, smoke test,
  any findings
- Operator verifies immediately post-deploy

**Typical setup time:** 1-3 minutes operator
**Typical work-cycle:** 5-15 minutes agent execution
**Examples:**
- "Change Save button background to --text-accent on
  proposal-detail line 1247"
- "Fix typo in Cadence section label: 'Workflwos' → 'Workflows'"
- "Increase padding on Active Projects card header from 8px to
  12px"

---

## §2 — Mode classification protocol

When work is identified, the operator (or architect, when
either is asking the question) classifies it by working through
the following decision tree:

### §2.1 Decision tree

**Q1: Does the work require architectural judgment to decide
HOW to do it?**

- Yes → Mode A
- No → continue

**Q2: Does the work span multiple known issues on a single
surface?**

- Yes → Mode B
- No → continue

**Q3: Is the fix trivially bounded by existing doctrine and
verifiable at a glance?**

- Yes → Mode C
- No → escalate to Mode B with a single-item batch, OR
  re-evaluate the work scope (often work that fails Q3 is
  larger than initially estimated)

### §2.2 Defaulting upward

When in doubt, classify upward (Mode C → B → A). Over-classifying
wastes time but produces better-quality output. Under-classifying
ships subtle defects that require Mode B/A cleanup later.

This doctrine errs toward Mode A by design. Mode C is a
deliberate efficiency tier, not a permission to skip discipline.

### §2.3 Mode escalation mid-cycle

Sometimes a Mode C cycle uncovers complexity that escalates the
work. When this happens:

1. The agent halts (per Iron Rule 40 §1)
2. The agent reports: "This Mode C task surfaced complexity
   beyond doctrine scope. Recommend escalation to Mode A or B."
3. The operator and architect re-classify and re-engage with
   appropriate discipline

The agent does NOT silently expand scope. Doing so violates
both Iron Rule 36 (terse hand-off) and Iron Rule 40 (halt on
missing inputs — in this case, missing architectural decisions).

---

## §3 — Mode-specific protocols

### §3.1 Mode A — Architectural protocol

(Existing operating model; documented here for completeness.)

1. Operator describes the work to the architect
2. Architect drafts the brief (per Iron Rule 39 — narrative
   block, input enumeration, output specification)
3. Operator pastes narrative to agent + uploads inputs
4. Agent executes per Iron Rules 36, 37, 40
5. Agent ships hand-off
6. Operator verifies + relays to architect
7. Architect updates journal, doctrine, etc. as needed

### §3.2 Mode B — Surface batch protocol

1. Operator describes the surface and the known issues
2. Architect drafts a batch brief that enumerates all known
   issues with per-issue scope
3. Operator pastes narrative to agent + uploads inputs
4. Agent executes each enumerated item per Iron Rules 36, 37,
   40, with single-issue discipline within the batch
5. Agent's hand-off reports per-item status
6. Operator verifies each item
7. New issues discovered during agent's work are listed as
   findings; they become input for a follow-up Mode B brief
   if substantial, or Mode C directives if trivial

### §3.3 Mode C — Direct protocol

1. Operator identifies a trivial bounded fix
2. Operator authors a 1-3 sentence directive to the agent.
   The directive includes:
   - **What to change** (specific file, specific element,
     specific property)
   - **What to change it to** (target value or behavior)
   - **Doctrine reference** (e.g., "per Style Doctrine §5.2")
3. Operator delivers directive to agent + attaches the file(s)
4. Agent executes per Iron Rules 36, 37, 40
5. Agent's hand-off is one to three lines:
   - **What changed** (one-line diff summary)
   - **Smoke test** (one-line result)
   - **Findings** (zero or more one-liners; usually zero)
6. Operator verifies post-deploy

---

## §4 — Mode boundary disputes

When a work-cycle is mis-classified, observed mid-stream:

### §4.1 Mode A misclassified as Mode B

**Symptom:** the batch brief enumerates issues but the agent
reaches one that requires architectural judgment to resolve.

**Resolution:** agent halts on that item per Iron Rule 40 §1.
Operator escalates that item to Mode A. Other items in the
batch may proceed if they're independent.

### §4.2 Mode B misclassified as Mode C

**Symptom:** the operator-direct fix is finished, but post-
verification reveals it interacted with adjacent issues that
should have been bundled.

**Resolution:** subsequent issues become a Mode B batch brief.
The completed Mode C work stands; the missed coupling becomes
a finding in the new brief.

### §4.3 Mode C misclassified as Mode A

**Symptom:** the architect drafts a 200-line brief for a
button-color change.

**Resolution:** architect drops the brief and reroutes as Mode
C. Architect-time wasted, but no work output is wasted.

---

## §5 — Cross-mode discipline

Some disciplines apply to all three modes:

- **Iron Rule 37** (silent work-mode) applies in every mode
- **Iron Rule 40 §1** (halt on missing input) applies in every
  mode — the agent halts in Mode C as readily as in Mode A
  when input is missing
- **Iron Rule 40 §3** (test instructions in hand-off) applies
  in every mode, scaled to the work — Mode C test instruction
  may be a single sentence
- **Iron Rule 40 §4** (dev-console-first debugging) applies in
  every mode

Doctrine compliance is mode-independent. A Mode C cycle that
introduces a new CSS class violates Style Doctrine §0.1 just as
much as a Mode A cycle would.

---

## §6 — Logging mode classification

Every brief and every Mode C directive includes its mode
classification at the top:

- Mode A briefs: "Mode: A (Architectural)"
- Mode B briefs: "Mode: B (Surface batch)"
- Mode C directives: "Mode: C (Direct)"

This makes the operator's classification decision auditable. If
the work expands beyond its declared mode mid-cycle, the mode
mismatch is visible in retrospect and the lesson is capturable.

---

## §7 — Open questions deferred

- **Mode B batch maximums.** How many issues can a single batch
  brief contain before it warrants splitting? Provisional
  guidance: 8-12 items per batch. Re-evaluate after 2-3 batch
  briefs ship.
- **Mode C verification cadence.** Should the operator verify
  every Mode C ship before commissioning the next, or batch-
  verify several Mode C ships at intervals? Provisional
  guidance: verify each before commissioning the next; revisit
  if Mode C velocity warrants relaxation.
- **Authority for Mode B brief authoring.** Currently architect-
  authored. Could the operator author Mode B batch briefs
  directly when the issues are well-bounded by doctrine?
  Deferred until operating practice produces examples.

---

*Work Mode Classification Doctrine v1.0 ratified.*
