# Mode B Batch Brief Template v1.0

**Status:** ratified 2026-04-28
**Authority:** operator + architect
**Scope:** every Mode B (Surface batch) brief authored against
ProjectHUD

---

## How to use this template

This template is the standard shape for a Mode B brief — a
brief enumerating multiple known issues for a single surface,
each to be fixed by the agent in sequence within the same
work-cycle.

The template is more compact than a Mode A architectural brief
because the work is narrower (single surface, known scope) and
because per-issue scoping happens inside the batch rather than
as separate briefs.

Replace `[bracketed]` placeholders with surface-specific
content. Sections marked **(REQUIRED)** must appear; sections
marked **(OPTIONAL)** appear when relevant.

---

## Template

```markdown
# Brief — Mode B — [Surface name] [Pass description] — CMD[NNN]

**Mode:** B (Surface batch)
**Surface:** [Single surface — e.g., proposal-detail.html]
**Doctrine version locked at brief authorship:** Style Doctrine
v[X.Y]
**Brief author:** Architect
**Date:** [YYYY-MM-DD]

---

## §0 — Standing rules

The following Iron Rules apply throughout this work-cycle:

- **Iron Rule 36** (hand-off terseness) — terse diff, smoke
  test, findings only
- **Iron Rule 37** (silent work-mode) — no diagnostic
  narration; work silently
- **Iron Rule 39** (architect briefing discipline) — input
  enumeration, output specification (this brief satisfies §2
  and §3)
- **Iron Rule 40** (agent execution discipline) —
  halt-on-missing-input, terse transcript, test instructions
  in hand-off, dev-console-first debugging
- **Style Doctrine §0.1** — agents do not modify or extend
  doctrine. Halt and report on doctrine gaps.

**Mode B specifics:**

- Single-issue discipline applies WITHIN this batch. Work
  through items 1, 2, 3... in order. Do not bundle items into
  one mega-edit.
- Per-item hand-off status: each item gets PASS / NOT VERIFIED
  / FAIL with one-line explanation.
- New issues discovered during work are surfaced as findings.
  They do NOT get added to the batch mid-execution — operator
  decides whether to commission a follow-up brief.

---

## §1 — Purpose

[1-3 sentences describing the surface and the pass intent.
Examples:
- "Pipeline visual cleanup pass — five known visual issues
  surfaced during operator review post-CMD96 deploy."
- "Compass post-doctrine-v1.5 retrofit — apply elevation
  tiers, button affordances, panel-frame language to all
  panels."
- "proposal-detail KPI strip upgrade per v1.5 §4.4 +
  v1.6 focal/non-focal informational treatment."]

After this brief ships, [Surface name] [intended state].

---

## §2 — Enumerated issues (REQUIRED)

The following issues are in scope for this work-cycle. Items
are independent unless explicitly marked.

### Item 1 — [Short identifier]

**What:** [Specific defect or change]
**Where:** [File path + line number range or selector]
**Spec:** [Target state — visual treatment, behavior, value]
**Doctrine reference:** [Section of Style Doctrine governing
this fix, if applicable]

[Optional: one paragraph of additional context if the spec
needs explanation. Most items don't.]

### Item 2 — [Short identifier]

[Same shape.]

### Item N — [Short identifier]

[Same shape.]

---

## §3 — Out of scope (REQUIRED)

The following are explicitly NOT in scope for this work-cycle:

- [Item that might seem related but isn't being fixed here]
- [Item being deferred to a separate brief]
- [Cross-cutting concern that should not be triggered by this
  surface-localized work]
- [Any architectural change — those go to Mode A]

---

## §4 — Architectural decisions locked (OPTIONAL)

[Include this section only if the brief makes any decisions
the agent might re-litigate. Examples:
- "Item 3's spec uses --text-accent for the value because the
  metric is focal-informational per §4.4, not because of state
  semantics."
- "Item 5's elevation tier is --surface-content (tier 2), not
  --surface-interactive (tier 3), because the panel is not
  interactive."

If no decisions need locking, omit this section.]

---

## §5 — Definition of done (REQUIRED)

The work-cycle is complete when:

- All N items in §2 are addressed
- No items in §3 (out of scope) are touched
- No new CSS classes, color tokens, font sizes, or doctrine
  edits are introduced (per Style Doctrine §0.1)
- Test instructions per §7 are included in hand-off
- Per-item status is reported in hand-off

---

## §6 — Smoke test (REQUIRED)

Operator runs after deploy:

1. [Specific verification step for item 1]
2. [Specific verification step for item 2]
3. [...]

[Include any cross-cutting verification — e.g., "Verify no
regression on adjacent surfaces (Compass, Cadence) — open each,
confirm headers render."]

---

## §7 — Hand-off format (REQUIRED)

Required output from agent:

1. **Files modified** — one-liner per file
2. **Diff** — unified diff per file
3. **Per-item status** — for each item in §2, status of:
   - PASS — code change shipped, smoke test confirmed
     (operator-verifiable post-deploy)
   - NOT VERIFIED — code change shipped; smoke test deferred
     to operator
   - FAIL — could not complete; explanation
4. **Smoke test result** — overall pass / fail / not run
5. **Findings** — zero or more one-liners. Examples:
   - "Item 3 surfaced an adjacent issue: [description].
     Recommend Mode C follow-up: [directive]."
   - "Item 5 required halting per IR40 §1: [missing input].
     Operator provided [input]; resumed."
   - "No new CSS classes introduced."
   - "No doctrine edits."
6. **Test instructions** — per Iron Rule 40 §3:
   - For each completed item, what surfaces / actions /
     observations would let the operator verify

Do not transcribe reasoning. Do not echo brief content.

---

## §8 — Reference materials (REQUIRED)

Inputs the agent must have to execute this brief:

**Surface file (modified):**
- [Surface filename — e.g., proposal-detail.html]

**Shared infrastructure (referenced; modified only if explicit
in §2):**
- /css/hud.css
- /js/hud-shell.js
- /js/version.js (per CMD95.5 operating-practice — always
  enumerate when version bump is part of the work)

**Doctrine documents (read-only reference):**
- ProjectHUD Style Doctrine v[X.Y]
- iron-rule-36-ratification.md
- iron-rule-37-ratification.md
- iron-rule-39-ratification.md
- iron-rule-40-ratification.md
- work-mode-classification-doctrine.md

**Surface-specific reference:**
- [Inventory document for this surface, if applicable]
- [Prior brief + hand-off pair for this surface, if applicable]
- [Visual references / screenshots, if applicable]

---

## §9 — Narrative instruction block (paste-ready)

Per Iron Rule 39 §1, the operator copy-pastes the following
block to the coding agent:

```
Apply brief-cmd[NNN]-[surface]-[pass]-mode-b.md.

[1-2 sentence work scope summary.]

This is a Mode B (Surface batch) brief — N enumerated items
on [Surface name]. Work through them in order. Single-issue
discipline applies WITHIN the batch.

§0 standing rules apply: Iron Rules 36, 37, 39, 40, plus
Style Doctrine §0.1.

§3 lists out-of-scope items — do not touch.

Per-item status required in hand-off (§7). Test instructions
required (§7 + IR40 §3).

[Any specific constraint worth highlighting from the brief.]

Proceed.
```

---

*End of Mode B Batch Brief Template v1.0.*
```

---

## Notes on using this template

### Calibrating batch size

A Mode B batch with 1-3 items is fine — it's still more
efficient than 1-3 separate Mode C directives because it
amortizes the brief-setup overhead. A Mode B batch with 15+
items risks hand-off fatigue (each item gets less per-item
scrutiny). Provisional ceiling: 8-12 items per batch.

### When to split a batch

If during brief-authoring the architect realizes items
naturally cluster (e.g., 4 typography fixes + 4 layout fixes),
splitting into two batches is acceptable but only if the
clusters are independent. If they share dependencies, keep
them in one batch.

### When NOT to use Mode B

- Items affect multiple surfaces — that's Mode A territory
  (architecture decision: shared component, surface-by-surface
  rollout, etc.)
- Any item requires architectural judgment — escalate the
  whole batch to Mode A, OR carve that item out and ship it
  separately
- The operator is uncertain whether items are bounded — Mode A
  brief-authoring forces precision that surfaces these
  concerns

### Per-item status discipline

The PASS / NOT VERIFIED / FAIL classification mirrors the
verification-tier rule from CMD99.1 (currently candidate for
formal iron-rule graduation). When the verification-tier rule
graduates, this template's per-item status will adopt the
formal (C) / (R) tier markers from that rule.

---

*Mode B Batch Brief Template v1.0 — end of document.*
