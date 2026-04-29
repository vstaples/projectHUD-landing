# Mode C Operator-Direct Protocol v1.0

**Status:** ratified 2026-04-28
**Authority:** operator + architect
**Scope:** every Mode C (Direct) work-cycle — operator-authored
directive to coding agent without architect mediation

---

## §0 — Purpose

Mode C is the lightweight tier for trivial bounded fixes:
button-color tweaks, copy edits, padding adjustments,
single-line bug fixes. The operator authors the directive
directly to the agent without architect mediation.

This protocol exists because:

1. Architect-mediated briefs for trivial fixes consume
   disproportionate setup time (20-30 minutes for fixes that
   take 5 minutes to execute).
2. Doctrine documents (Style Doctrine, Iron Rules) provide
   sufficient guardrails for trivial work — the agent's
   freedom is bounded by "follow doctrine; the rest is fair
   game."
3. The operator IS the product authority and CAN authorize
   trivial visual/copy work without architect review.

But Mode C is also the most dangerous mode because it has the
least review. This protocol exists specifically to make Mode C
safe — to ensure operator efficiency without sacrificing
discipline.

---

## §1 — When to use Mode C

Per Work Mode Classification doctrine §1.3 — Mode C applies
when:

- A single trivial fix bounded by existing doctrine
- Visual tweaks: button color, padding, font weight on a
  specific element
- Copy edits, label corrections, typo fixes
- Cosmetic adjustments where doctrine constrains the agent
  and the fix's correctness is operator-verifiable at a
  glance
- Bug fixes obvious enough that explanation would exceed the
  fix's scope

Per Work Mode Classification doctrine §2.3 — when in doubt,
classify upward (Mode C → B → A). If the fix can't be
described in 1-3 sentences plus a doctrine reference, it's
probably not Mode C.

---

## §2 — The Mode C directive structure

Every Mode C directive contains four elements. The operator
delivers them in any natural order; what matters is that all
four are present.

### §2.1 What to change

Specific file, specific element, specific property.

Sufficient specificity:
- "On proposal-detail.html, the Save Template button
  (line 1247)"
- "In /css/hud.css, the .btn-primary hover rule"
- "The 'Mechanical design' label inside the discipline sidebar
  on proposal-detail"

Insufficient specificity:
- "The button on the page" — which button?
- "The font on the dashboard" — which element?
- "The thing that looks weird" — what specifically?

If the operator can't specify the change target precisely, the
work probably isn't Mode C — escalate to Mode B for context-
gathering or Mode A for architectural review.

### §2.2 What to change it to

Target value, target behavior, or target visual treatment.

Sufficient specificity:
- "Change background to var(--text-accent)"
- "Set padding from 8px to 12px"
- "Change label text from 'Workflwos' to 'Workflows'"
- "Match the visual treatment of the Save Template button on
  cadence.html line 845"

Insufficient specificity:
- "Make it look better"
- "Fix the spacing"
- "Make it more modern"

If the target state can't be specified concretely, the work
isn't Mode C.

### §2.3 Doctrine reference

The Mode C directive cites the doctrine section that governs
the change. This is the agent's guardrail.

Examples:
- "per Style Doctrine §5.2 button color variants"
- "per §3.6 — this is a state-color metric, must use --green"
- "per §4.4 — KPI cards top-bar treatment"
- "per §9.1 Title Case definition"

The doctrine reference serves three purposes:
1. Confirms the operator has thought about which doctrine
   rule applies
2. Lets the agent verify the directive is doctrine-conformant
   (the agent halts if the directive contradicts doctrine —
   per Style Doctrine §0.1)
3. Creates an audit trail — future architects reviewing past
   Mode C work can trace the rationale

If no doctrine section governs the change, that's a strong
signal the work shouldn't be Mode C — doctrine-uncovered
changes need architectural judgment (Mode A).

### §2.4 Verification expectation

How will the operator verify the work post-deploy?

Sufficient specificity:
- "I'll open proposal-detail and confirm the button is now
  cyan"
- "I'll search for 'Workflwos' in cadence.html and confirm
  zero matches"
- "I'll inspect the element and confirm padding is 12px"

This element ensures the agent's hand-off includes test
instructions appropriate to the operator's verification path
(per Iron Rule 40 §3).

---

## §3 — Mode C directive examples

### Example 1 — Simple visual fix

> Mode: C
>
> On proposal-detail.html, the Save Template button at line
> 1247 — change background from `var(--surface-interactive)`
> to `var(--text-accent)` per Style Doctrine §5.2 (this button
> is a primary CTA, should use the .btn-primary variant, not
> .btn neutral).
>
> I'll verify by opening proposal-detail and confirming the
> button renders in cyan.

### Example 2 — Copy edit

> Mode: C
>
> In cadence.html line 875, "Workflwos" → "Workflows" (typo).
>
> I'll search the file post-deploy and confirm zero matches
> for "Workflwos".

### Example 3 — Spacing adjustment

> Mode: C
>
> On dashboard.html, the Active Projects panel header padding
> — change from `padding: 8px 12px` to `padding: 12px 16px`
> per §4.5 panel-frame canonical (current spec is too tight
> against panel border).
>
> I'll inspect the rendered element and confirm the new
> padding values.

---

## §4 — Agent execution under Mode C

The agent executes Mode C work per Iron Rules 36, 37, 40
(see §5 below for which rules apply). Specifically:

### §4.1 Halt-on-missing-input still applies

If the operator's directive references a file or doctrine
section the agent doesn't have, the agent halts (per Iron
Rule 40 §1). The operator provides the missing input. Mode C's
lightweight nature does NOT relax the halt-on-missing-input
discipline.

### §4.2 Doctrine compliance still applies

Style Doctrine §0.1 (no agent doctrine modifications) applies
in Mode C as in every mode. If the directive would require
introducing a new CSS class, color token, or font size, the
agent halts and reports — does not invent.

### §4.3 Hand-off discipline still applies

The hand-off is shorter than Mode A or Mode B (one to three
lines) but is still required. The agent does not silently
ship — every Mode C work-cycle ends with a written hand-off.

### §4.4 Mode escalation mid-cycle

If during execution the agent realizes the work is not Mode C
(touches more files than the directive named, surfaces
architectural concerns, requires doctrine extension), the
agent halts and reports per Work Mode Classification doctrine
§2.3:

> "This Mode C task surfaced complexity beyond doctrine scope.
> Recommend escalation to Mode A or B."

The operator and architect re-classify. The agent does NOT
silently expand scope.

---

## §5 — Iron Rule applicability in Mode C

| Rule | Applies in Mode C? | Notes |
|---|---|---|
| Iron Rule 36 (terse hand-off) | YES | Hand-off is shorter than Mode A/B but still terse and structured |
| Iron Rule 37 (silent work-mode) | YES | No diagnostic narration in any mode |
| Iron Rule 39 (architect briefing) | NO | Mode C bypasses architect; operator authors directive directly |
| Iron Rule 40 §1 (halt on missing input) | YES | Halt discipline applies in every mode |
| Iron Rule 40 §2 (terse transcript) | YES | Terse transcript in every mode |
| Iron Rule 40 §3 (test instructions) | YES, scaled | Test instruction may be a single sentence in Mode C |
| Iron Rule 40 §4 (dev-console-first debug) | YES | Debug discipline in every mode |
| Style Doctrine §0.1 (no doctrine mods) | YES | Doctrine compliance is mode-independent |

The only Iron Rule that does NOT apply in Mode C is Iron Rule
39 (architect briefing discipline) — because there is no
architect brief in Mode C.

---

## §6 — Mode C hand-off format

The agent's Mode C hand-off contains:

1. **What changed** — one-liner naming the file and the
   specific change
2. **Smoke test** — one-liner: pass / fail / not run, with
   one-sentence explanation if not run
3. **Findings** — zero or more one-liners (most Mode C cycles
   produce zero findings; if the agent has more than one or
   two findings, the work probably wasn't Mode C)
4. **Test instructions** — one to two sentences naming what
   the operator should check post-deploy

### Example hand-off

> **Files modified:** proposal-detail.html line 1247
> **Diff:** `class="btn"` → `class="btn-primary"`
> **Smoke test:** Pass — verified button class change in DOM
> via DevTools.
> **Findings:** None.
> **Test instructions:** Open proposal-detail, observe Save
> Template button now renders with cyan background per
> .btn-primary spec.

That's it. Three to five lines total. No reasoning, no
narrative, no apology for being terse — Mode C is meant to
be terse.

---

## §7 — Operator verification cadence

Per Work Mode Classification doctrine §7 (open questions
deferred), the provisional cadence is:

**Verify each Mode C ship before commissioning the next.**

This prevents Mode C errors from compounding. If a Mode C
ship turns out to be wrong, the operator catches it before
issuing additional Mode C directives that might be affected
by the error.

If Mode C velocity is high enough that per-ship verification
slows the operator down, batch-verification is acceptable —
but only across non-overlapping fixes. If two Mode C
directives touch related elements, verify the first before
commissioning the second.

---

## §8 — When Mode C goes wrong

Failure modes specific to Mode C:

### §8.1 Ambiguous directive

The operator's directive lacked specificity in §2.1 or §2.2.
The agent ships something different than the operator
intended.

**Recovery:** treat as a Mode C reversal — operator authors a
new Mode C directive reverting the change OR completing it
correctly.

**Prevention:** apply the §2 four-element checklist before
sending the directive. If any element is unclear, escalate
to Mode B or rewrite the directive.

### §8.2 Doctrine gap not noticed

The directive directs a change that turns out to require
doctrine extension. The agent halts (per §4.2) — good
behavior.

**Recovery:** escalate to Mode A — architect drafts the
doctrine amendment + brief in normal Mode A flow.

**Prevention:** when authoring directives, confirm the
referenced doctrine section actually governs the change.

### §8.3 Cross-surface impact not noticed

The directive affects a single surface but introduces an
inconsistency with adjacent surfaces (e.g., changing button
color on Compass when Cadence has the same button at the old
color).

**Recovery:** escalate to Mode B — batch brief covering all
affected surfaces.

**Prevention:** before authoring a Mode C directive, ask "is
this change isolated to one surface, or does it imply
adjacent surfaces should match?" If the latter, it's Mode B.

---

## §9 — Audit trail

Mode C work-cycles are journaled but not in the same depth as
Mode A or Mode B. Suggested journal cadence:

- Daily: one-liner per Mode C cycle in the day's journal
  entry, naming the surface and the change
- When a Mode C escalates mid-cycle: full journal entry
  capturing the escalation, the lesson learned, any doctrine
  refinement triggered

This keeps the audit trail visible without making Mode C as
ceremonial as Mode A.

---

## §10 — Future refinement

The following Mode C operating practices are deferred until
practice produces examples:

- **Mode C velocity ceiling.** How many Mode C cycles per day
  before the operator should batch them as Mode B for
  efficiency? Provisional: no ceiling; let practice
  determine.
- **Operator-authored Mode B briefs.** Could the operator
  author a Mode B batch brief for a set of well-bounded fixes
  without architect review? Deferred.
- **Mode C across coding agents.** This protocol assumes
  one agent per cycle. If multiple agents work in parallel
  Mode C, coordination protocol may be needed. Deferred until
  parallel Mode C surfaces.

---

*Mode C Operator-Direct Protocol v1.0 ratified.*
