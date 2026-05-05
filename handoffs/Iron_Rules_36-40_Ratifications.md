# Iron Rule 36 — Ratification

**Ratified:** 2026-04-25
**Origin:** Operator feedback during CMD-PRESENCE-5 arc. Coding
agent's hand-off after CMD85 included ~200+ lines of transcribed
reasoning, counter-reasoning, and alternative-considered narrative
that held no operational value and consumed tokens that could
serve subsequent work.

---

## Rule

**Coding agents must report tersely. Hand-offs report what changed,
not the reasoning behind it.**

The brief contains the rationale. The hand-off does not echo it.

### Required hand-off format

1. **Diff** — just the diff, no narrative around it.
2. **Smoke test result** — one line: pass / fail / not run.
3. **Findings** — zero or more one-liners, only if something
   unexpected appeared. No findings = empty section, fine.

### Forbidden in hand-offs

- Transcribed reasoning ("I considered X, but rejected it because…")
- Counter-reasoning ("On the other hand, this could also…")
- Narrated alternatives the agent contemplated but didn't ship
- Echoes of the brief's rationale ("Per §1, this is needed because…")
- Multi-paragraph analysis of edge cases the brief already covered

### Allowed in hand-offs

- Single-line statement that something unexpected happened, with
  enough detail for the architect to investigate (not solve).
- Bullet point per finding. Each bullet ≤2 sentences.
- One-line preamble if needed (e.g., "Smoke test not run — no
  browser env; node --check passes.").

### Volume calibration

A clean one-line code change deserves a **15-30 line hand-off**,
not 200. Larger changes scale, but the ratio holds: hand-off size
should be proportional to change complexity, not narrative depth.

---

## Briefs going forward

All briefs include §0 standing rules preamble pointing agents to
this rule. Briefs also prescribe the §7 hand-off format
explicitly for each individual brief — repetition is intentional,
makes the constraint impossible to miss.

If an agent's hand-off violates this rule, the architect's
correction is one line: "Re-report per Iron Rule 36 — diff,
smoke test, findings only." No further explanation needed.

---

## Why this is an iron rule, not a working agreement

Working agreements describe how we'd prefer to work. Iron rules
describe invariants the system depends on to function. Token
budget for the architect-agent loop IS an invariant — exceeding
it degrades subsequent work in the same session, or forces
premature compaction. Verbose hand-offs aren't a stylistic
preference; they're a system-level cost that propagates.

The rule is also enforceable in a single-line correction, which
makes it operationally cheap to maintain.

---

*Iron Rule 36 ratified.*

# Iron Rule 37 — Ratification

**Ratified:** 2026-04-26
**Origin:** Operator feedback during CMD94 work-mode sprawl. A
coding agent fixing post-deploy regressions narrated diagnostic
process continuously across ~7,000 lines of chat transcript —
hypothesis testing, code inspection, false starts, reconsiderations
all streamed to operator in real time. The deliverable hand-off at
the end was Iron Rule 36-compliant (~60 lines), but the work-mode
chatter consumed enormous tokens and operator attention before
that point. Iron Rule 36 governs hand-offs; it does not govern
work-mode communication. This rule closes the gap.

---

## Rule

**Coding agents work silently mid-execution. Do not narrate
diagnostic process, hypothesis testing, or code inspection during
the work.**

The only permitted mid-work communication is:

1. **Genuine clarification questions** when scope is ambiguous and
   the agent cannot proceed without operator input. Asking, then
   waiting, is correct. Speculating aloud while waiting is not.

2. **Brief progress markers in long multi-file arcs.** A single
   one-line acknowledgment per major milestone (e.g., "1 of 3
   files complete; proceeding to file 2") is permitted. Anything
   beyond a one-liner is not.

That is the entirety of permitted mid-work communication.

### Forbidden in work-mode chat

- "Let me check..." — do the checking, then ship the answer
- "Actually, looking again..." — look first, decide, ship
- "Hmm, that's interesting..." — internal monologue is not output
- "Re-examining the image..." — examination is silent
- "Three hypotheses: (a)... (b)... (c)..." — pick one, test it, ship
- "Wait, that can't be right..." — reconsiderations stay internal
- Stream-of-consciousness diagnosis of any kind
- Narrating false starts and corrections
- Broadcasting code-reading observations to operator
- Step-by-step play-by-play of edits in progress

### Allowed in work-mode chat

- "I need X to proceed. Can you provide?" (clarification question)
- "Beginning the brief." (single acknowledgment at start)
- "1 of 3 files complete." (progress marker, milestone-only)
- "Hand-off below." (single transition at end)
- The deliverable hand-off per Iron Rule 36

### Volume calibration

For a typical brief of one to three files, work-mode chat should
be ZERO lines between "beginning" and the hand-off. The agent
reads code silently, makes edits silently, runs tests silently,
and produces the hand-off. The operator sees no intermediate
output unless a genuine clarification is needed.

For long arcs (5+ files, multiple commits, hours of work), brief
progress markers are permitted but never frequent. One per
hour at most.

---

## Multi-issue post-deploy reporting

A common failure mode that this rule addresses: operator deploys
a change and reports multiple regressions in one message. Agent
attempts to fix all of them in one continuous mega-turn, narrating
through each.

**Correct response pattern when operator reports multiple issues:**

1. Acknowledge all reported issues in one terse line each
2. Pick ONE — typically the most critical/blocking
3. Fix it silently
4. Ship a hand-off scoped to that single fix
5. Wait for operator verification before picking the next

Do NOT attempt to fix multiple unrelated issues in a single
work-turn. Each issue gets its own silent work-cycle and its own
hand-off. The discipline of one-issue-per-cycle prevents the
mega-turn narration pattern entirely.

If operator wants multiple issues batched, they will explicitly
say so. Default is one-at-a-time.

---

## Why this is an iron rule, not a working agreement

Iron Rule 36's logic applies here too. Token budget for the
architect-agent loop IS an invariant. Continuous work-mode
narration consumes tokens proportional to thinking depth, not
proportional to deliverable value. A 7,000-line debugging chat
that ends with a 60-line useful hand-off has shipped 60 lines
of value at 7,000 lines of cost. That ratio is unsustainable
in any project, but especially under deadline.

The rule is also enforceable in a single-line correction:
"Re-execute under Iron Rule 37 — work silently, ship the
hand-off only."

---

## Enforcement protocol

When an agent's mid-work communication violates this rule, the
operator's correction is one line:

> "Iron Rule 37 — work silently. Ship the hand-off only."

No further explanation needed. The rule is in §0 of every brief
going forward; agents are expected to know it.

If the agent violates the rule repeatedly within a single arc,
the operator may end the work-cycle and hand the brief to a
fresh agent. Repeated violation is a calibration mismatch the
brief cannot solve.

---

## Pairs with Iron Rule 36

Together these two rules govern agent communication discipline:

- **Iron Rule 36:** hand-offs are terse — diff, smoke test,
  findings as one-liners only
- **Iron Rule 37:** work-mode is silent — no narration, no
  speculation, no broadcast diagnosis

Hand-off discipline + work-mode discipline = sustainable token
economy across a multi-arc project.

---

## Briefs going forward

All briefs include both Iron Rule 36 AND Iron Rule 37 as standing
rules in §0. Briefs may also include the multi-issue post-deploy
guidance in §0 when the work is anticipated to surface multiple
regressions.

---

*Iron Rule 37 ratified.*

# Iron Rule 38 — Ratification

**Status:** ratified 2026-05-04 evening (drafted retroactively
to close a documented numbering gap; Rule had been cited as
canon by every brief in the Accord arc but never formally
written until this date)
**Authority:** operator (Vaughn Staples) + architect
**Scope:** every brief that ships schema changes, application-
code changes touching shared modules, or any modification whose
effects radiate beyond the file directly modified

---

## Rule

**Every brief enumerates every consumer of the affected tables,
columns, RLS policies, functions, modules, and surface
behaviors before shipping.** The consumer list lives in the
brief; the agent verifies it on the way through the codebase.
Missing a consumer is a finding the agent surfaces explicitly,
not a failure mode the agent silently absorbs.

The discipline is bilateral. The architect enumerates upfront
based on the codebase inventory; the agent re-verifies during
execution and surfaces any consumers the brief missed.

---

## Why this rule exists

The most consequential class of build error in any modular
system is the unintended consumer — code that depends on the
thing being changed but isn't named in the change request.
Production-time discovery of unintended consumers is expensive:
debugging cycles, hotfixes, regressions, customer impact.
Brief-time enumeration of consumers is cheap: a `grep`, a search
of the inventory, a few minutes of cross-reference.

Every CMD in the Accord build arc has surfaced at least one
consumer the architect missed at brief time and the agent caught
at execution time. CMD-A3 surfaced a particularly sharp instance:
the `renderSidebar` function exists in *two* loader-level files
(`hud-shell.js` and `sidebar.js`) with separate `NAV_ITEMS`
arrays, and the brief's consumer enumeration named only one. The
agent caught the duplication, patched both files, and surfaced
the issue. Without the catch, the Accord nav entry would have
been visible on some surfaces and missing on others.

The rule formalizes the bilateral discipline: brief enumerates,
agent verifies. Both are accountable; both layers protect against
the missed-consumer failure mode.

---

## §1 — What the rule requires upfront (architect side)

Every brief includes a "Consumer enumeration" section (or
equivalent §-numbered section). The section lists:

1. **Files modified or created** by this CMD, with a one-line
   effect description per file.
2. **Tables read or written**, with the operation type
   (SELECT / INSERT / UPDATE / DELETE) and the existing
   consumers of those tables across the rest of the codebase.
3. **RLS policies created or modified**, with the existing
   policies on the affected tables (so RLS conflicts are
   visible at brief time, not deploy time).
4. **Functions, modules, or shared utilities modified**, with
   every existing consumer of the function/module across the
   codebase.
5. **Surface concerns**, where applicable — if the change
   affects rendering of a UI element, every page that renders
   that element is enumerated.

The enumeration is built from the project inventories
(`projecthud-file-inventory-v2.md`,
`aegis-shared-loaders-inventory-v1.md`) plus targeted greps
against the codebase when inventory coverage is incomplete.

The architect does not need to enumerate exhaustively for
trivial cases (a brief that adds a single CSS class used only by
the file it's defined in). The rule fires for any change whose
effects could plausibly radiate beyond the directly-modified
file.

---

## §2 — What the rule requires during execution (agent side)

The agent reads the brief's consumer enumeration and verifies it
against the actual codebase. If the agent discovers a consumer
the brief missed, the agent:

1. Halts before continuing the change.
2. Surfaces the discovered consumer as a finding.
3. Includes the missed consumer in the change scope (with
   operator confirmation if the scope expansion is non-trivial).

The agent does not silently absorb a missed consumer by limiting
the change to only what the brief enumerated. That would leave
the actual codebase in an inconsistent state — some consumers
updated, others stale.

**Function-duplication awareness.** When a function name appears
in two or more files, all instances must be enumerated. CMD-A3's
`renderSidebar` case is the canonical instance: a brief that
enumerated only `sidebar.js` would have missed `hud-shell.js`,
which is the active render path on Compass. The agent's grep
for the function name across the codebase catches this; the
brief's enumeration relies on it being caught.

**Surface duplication awareness.** When a surface concern (a UI
element, a navigation entry, a panel layout) is rendered by
multiple files, all rendering paths must be enumerated. The
function-duplication case is one instance of this; surface
duplication generalizes to template duplication, partial
duplication, and any pattern where the same visible element has
multiple authoring sites.

---

## §3 — When the rule does NOT fire

The rule does not fire for:

- **Trivial isolated changes** — a CSS rule used only by the
  file it's defined in, a comment update, a single-line
  refactor with no behavioral change.
- **Module-private state** — changes to internal-only
  variables, helper functions, or types that no other module
  references.
- **Greenfield-only changes** — a brand-new file with no
  consumers yet because it has just been created.

The rule fires for any change whose effects could plausibly
radiate beyond the directly-modified file.

---

## §4 — Cross-module application

Every brief authored in any ProjectHUD module carries this
discipline. The enumeration patterns are module-specific (the
inventories differ); the bilateral commitment is universal.

When a change crosses module boundaries (the Accord–Compass
URI resolver case, for example), the brief enumerates consumers
in *both* modules, even when only one module's code is being
modified. Cross-module consumer enumeration is the highest-
value form of this rule because cross-module discoveries are
the most expensive to recover from.

---

## §5 — Enforcement

For brief-side enumeration omissions caught by the agent:

> "Iron Rule 38 §1 — consumer not enumerated. Halting per §2.
> Discovered: [consumer]. Confirm scope expansion?"

For agent-side execution omissions (agent silently limited
scope to brief-named consumers when others existed):

> "Iron Rule 38 §2 — verify all consumers, not only those
> enumerated. Re-scan and report missed consumers as findings."

---

## §6 — Why this rule was drafted retroactively

This ratification document was created 2026-05-04 evening —
several CMDs after Iron Rule 38 had been cited as canon in
every brief from CMD-A1 forward. The numbering gap (the
canonical Iron Rules 36–40 file contained 36, 37, 39, 40 but
not 38) was discovered during a Rule-amendment session.

The rule existed in operator-architect agreement and was being
applied in practice; it had not been formally written. This
ratification closes the gap between operating practice and
canonical text. Briefs that cited Rule 38 before this date
were citing a real rule, just one that was unwritten until
now.

The pattern itself — a rule operating in practice before being
formally ratified — is worth flagging. Future doctrine
candidates may exhibit the same lifecycle: the operator and
architect converge on a discipline, briefs apply it, agents
respect it, and only when a forcing function (like a Rule
amendment that requires the rule to exist) surfaces does the
ratification happen. This is acceptable but suboptimal — the
rule's existence is more durable when written down at the
moment of consensus rather than retroactively.

---

*Iron Rule 38 ratified 2026-05-04 evening.*

# Iron Rule 39 — Architect briefing discipline

**Status:** ratified 2026-04-28
**Authority:** operator + architect (see §0.1 of Style Doctrine)
**Scope:** every brief delivered from architect to operator for
hand-off to a coding agent

---

## Rule

When the architect delivers a brief to the operator for hand-off
to a coding agent, the architect provides:

1. **A copy-and-paste-ready narrative instruction block** the
   operator can paste directly into the agent's conversation
   without modification or supplementation.
2. **An explicit, enumerated list of all input materials** the
   coding agent needs (files, references, doctrine documents,
   prior hand-offs, screenshots, etc.).
3. **An explicit, enumerated list of all required outputs** the
   coding agent must produce in their hand-off (files modified,
   diff format, smoke test result, findings format, etc.).

These three elements are non-negotiable. Briefs delivered without
all three are incomplete and the operator should not hand them off
until the gaps are filled.

---

## Why this rule exists

The architect-operator-agent communication chain is bridge-fragile
(see operating-practice lesson 18 from 2026-04-27 journal entry).
The operator is the bridge. Every gap in the architect's output
becomes operator overhead — re-reading the brief to figure out
what to paste, hunting for files to upload, reverse-engineering
what the agent should produce.

This rule reduces operator overhead to copy-paste mechanics:
paste the narrative, attach the enumerated inputs, expect the
enumerated outputs. The operator's job is bridge operation, not
brief interpretation.

---

## §1 — The narrative instruction block

The narrative instruction block is the agent's first input. It is
written **TO the agent**, not about the agent or about the work.
Tone and content match what the operator would say if briefing
the agent in person.

### §1.1 Format requirements

The block lives at the bottom of the brief in a fenced code block
(triple-backtick) so the operator can one-click copy across UI
variants. Indented quotes work in some interfaces but require
manual selection in others; code blocks are universal.

### §1.2 Content requirements

The narrative block contains:

- A brief identifying header (e.g., "Apply
  brief-cmd99-dashboard-retrofit.md")
- 1-3 sentences describing the work scope
- Pointers to the most important constraints (architectural
  decisions locked, scope boundaries, hand-off format expected)
- Standing rules reference (Iron Rules in §0 of the brief apply)
- A direct closer ("Proceed.")

The block is short — typically 100-200 words. Long narrative
blocks indicate the brief itself is unclear; the fix is to clarify
the brief, not pad the narrative.

### §1.3 What the narrative block does NOT contain

- Reasoning for architectural decisions (those are in the brief)
- Apologies, caveats, or hedging
- Architectural background
- Speculation about what might go wrong

The narrative is delivery-mode prose, not explanation prose.

---

## §2 — The enumerated input list

Every input the agent needs is named explicitly in the brief's
reference materials section (typically §8 or §9 depending on
brief structure).

### §2.1 What counts as an input

- Source files the agent will modify or reference
- Doctrine documents the agent must read (Style Doctrine, Iron
  Rules ratification documents, onboarding protocol)
- Prior brief hand-offs that establish current state
- Screenshots or visual references when relevant
- Schema documents, API specs, or other reference materials
- Inventory documents (file inventory, atlas, surface-specific
  inventories) when needed

### §2.2 Enumeration discipline

Every input is named by its filename or canonical identifier. The
list is exhaustive — agents do not infer inputs. If the architect
fails to name an input the agent needs, that's a brief defect, not
agent latitude to guess.

If an input is not yet known to the architect (e.g., "the source
file for this surface — operator names it"), the brief surfaces
this as an open input rather than waving past it.

### §2.3 The js/version.js exception

After CMD95.5, briefs touching `js/version.js` explicitly include
it in the input list. The CMD95.5 hand-off documented that
forgetting `js/version.js` caused the operator to bump version
manually outside the agent loop. This pattern generalizes:
**foundational files that every retrofit touches** (version.js,
hud.css, hud-shell.js, sidebar.js) get explicit enumeration even
when their inclusion seems obvious.

---

## §3 — The enumerated output list

The brief's hand-off format section (typically §7 or §8) names
exactly what the agent must produce in their hand-off.

### §3.1 Required output elements

At minimum:

- **Files modified or created** (one-liner per file)
- **Diff or full content** (unified diff for modifications, full
  content for new files)
- **Smoke test result** (pass / fail / not run, with explanation
  if not run)
- **Findings** (zero or more one-liners; format prescribed)
- **Test instructions** for the operator to verify the work
  post-deploy (see Iron Rule 40 §3)

### §3.2 Per-brief tailoring

Different briefs require different outputs. Visual/UI work
typically requires a screenshot or visual artifact; architectural
work requires a static-analysis trace; data-layer work requires a
schema diff. The output list is tailored to the brief's domain.

### §3.3 Hand-off discipline gates

For any brief that touches doctrine-governed surfaces (style,
elevation, color tokens, button variants), the hand-off must
include explicit confirmation lines:

- "No new CSS classes introduced beyond those enumerated in §[N]
  of the brief"
- "No doctrine document edited"
- "No new color tokens or font sizes introduced"
- "All inputs enumerated in brief §[N] were received"

These gates make the hand-off auditable by the operator without
requiring deep CSS/code expertise (per operating-practice lesson
15 from 2026-04-27 journal).

---

## §4 — Pairing with adjacent rules

Iron Rule 39 pairs with:

- **Iron Rule 36** (hand-off terseness) — Rule 36 governs the
  agent's output discipline; Rule 39 governs the architect's
  input discipline. Together they bound both ends of the
  agent's information environment.
- **Iron Rule 37** (silent work-mode) — Rule 37 governs work-
  mode communication; Rule 39 governs setup-mode communication.
  Together they cover the full architect-agent communication
  lifecycle.
- **Iron Rule 40** (agent execution discipline) — Rule 40
  enumerates agent-side practices (missing-input halt, terse
  transcript, test instructions, dev-console-debug). Rule 40's
  missing-input halt only works if Rule 39's input enumeration
  is complete; the two rules are interlocking.

---

## §5 — Enforcement

When a brief arrives without the three required elements, the
operator's correction is one line:

> "Apply Iron Rule 39. Brief is missing [narrative block /
> input enumeration / output specification]. Re-deliver."

The architect re-delivers with the missing element. No
litigation; the rule is the rule.

If the architect repeatedly delivers incomplete briefs, that's a
calibration mismatch the rule cannot solve. Operator may end the
session and start fresh with a new architect.

---

*Iron Rule 39 ratified.*

# Iron Rule 40 — Agent execution discipline

**Status:** ratified 2026-04-28
**Authority:** operator + architect
**Scope:** every coding agent work-cycle, regardless of mode
(A/B/C — see Work Mode Classification doctrine)

---

## Rule

Coding agents adhere to four execution disciplines in every
work-cycle:

1. **Halt-on-missing-input.** When a required input is not
   present and is material to current task, the agent stops
   work, names the missing input precisely, and waits for it
   before continuing. The agent does NOT write local
   replacements, infer reasonable defaults, or proceed
   speculatively.
2. **Terse transcript.** All reasoning is kept silent.
   Diagnostic narration, hypothesis testing, false starts, and
   stream-of-consciousness analysis do not appear in the
   conversation. (This restates and reinforces Iron Rule 37.)
3. **Test instructions in hand-off.** When delivering completed
   work, the agent enumerates explicit test instructions the
   operator can follow to verify the work post-deploy.
4. **Dev-console-first debugging.** When debugging is required,
   the agent's primary debugging method is browser DevTools
   JavaScript console — instructing the operator to run
   specific commands and report results. Code-level
   instrumentation (extensive logging, debug branches, ad-hoc
   test files) is secondary.

These four disciplines are non-negotiable. Each addresses a
specific failure mode observed in prior agent work-cycles.

---

## Why this rule exists

Each of the four disciplines closes a specific gap observed in
shipped or attempted-shipped work:

**Halt-on-missing-input** addresses the CMD99 incident where the
agent encountered ui.js (referenced from dashboard but not in
brief §7), reasoned around the missing dependency, and wrote a
local gauge renderer instead of requesting the file. The local
replacement diverged ui.js across surfaces and required
follow-up cleanup. The discipline: missing dependencies are halt
conditions, not improvisation prompts.

**Terse transcript** restates Iron Rule 37 because the discipline
extends to every mode. CMD94's ~7,000 lines of mid-work narration
for a 60-line useful hand-off triggered the original ratification.
Mode B (surface batches) and Mode C (operator-direct) make terse
transcripts even more important — those modes have less brief
overhead, so verbose transcripts have less context to absorb them.

**Test instructions in hand-off** addresses the CMD99 incident
where the agent marked 20 DoD items PASS while smoke test was
NOT RUN. Eight items failed on operator visual review. Test
instructions in the hand-off let the operator verify against a
defined acceptance procedure rather than reverse-engineering what
"PASS" means. This pairs with the verification-tier rule from
CMD99.1 (which is on track for separate iron-rule graduation).

**Dev-console-first debugging** is the operating practice from
many sessions of effective debugging. When the agent suspects a
problem, the right next move is usually "have the operator run
this in the console and report the output" rather than "let me
add 50 lines of logging and we'll deploy and look at the result."
The dev console is faster, lower risk, and produces cleaner
diagnostic loops.

---

## §1 — Halt-on-missing-input discipline

### §1.1 What counts as a missing input

- A source file the agent's task references but which was not
  provided in the brief
- A documented dependency (e.g., ui.js, a shared module) that
  the agent's modifications would touch
- A doctrine version or amendment the brief references but
  which is not loaded
- An identifier (function name, schema column, config key) the
  agent needs to call/use but which is undocumented in
  available materials

### §1.2 Halt protocol

When the agent identifies a missing input:

1. Stop the work-cycle immediately. Do not continue with
   alternative paths, fallback implementations, or speculative
   workarounds.
2. Name the missing input precisely in a brief message: "Need
   `<filename>` to proceed; this brief references it but it
   was not included in §[N]."
3. Wait for the input. The agent does not loop, does not retry,
   does not re-attempt with reduced scope.

### §1.3 What the agent does NOT do

- Write a local replacement for a missing module
- Infer the structure of a missing file from references
- Proceed with a "best guess" implementation flagged as
  provisional
- Add extensive scaffolding to compensate for missing context
- Continue work on adjacent tasks while waiting for input
  (this risks producing partially-coupled work that needs to
  be unwound when the missing input arrives)

### §1.4 Sanctioned exceptions

If the missing input is genuinely orthogonal to current task
(e.g., the agent is editing dashboard.html and a missing
inventory document is referenced for context only, not for the
edit), the agent may proceed and surface the missing-input as
a finding. This exception is narrow: the agent must be confident
the missing input does not affect the work-cycle's output.

---

## §2 — Terse transcript discipline

This restates Iron Rule 37 — work silently mid-execution.
Specifically:

- No "let me check..." narration; do the checking, ship the
  answer
- No "actually, looking again..." reconsiderations; reconsider
  silently
- No three-hypothesis enumerations; pick one, test it, report
  outcome
- No stream-of-consciousness diagnosis; reasoning stays
  internal
- No play-by-play of edits in progress

For brief progress markers in long arcs (5+ files, hours of
work), one-line milestones are permitted ("1 of 3 files
complete; proceeding to file 2"). Anything more is too much.

---

## §3 — Test instructions in hand-off

### §3.1 Required content

Every hand-off includes a section titled "Test instructions" or
similar, naming:

- **What surfaces / pages the operator should open** to verify
  the work
- **What specific actions to take** on those surfaces (click X,
  navigate to Y, hover over Z)
- **What outcomes should be observed** (button changes color,
  panel appears, value updates)
- **Console commands to verify state** if applicable (e.g.,
  `window._PROJECTHUD_VERSION` should return the new version
  string)

### §3.2 Specificity discipline

Test instructions are precise and reproducible. "Verify it works"
fails this discipline. "Open Pipeline; confirm unified header
visible at top with 'Pipeline' module name; hover left edge of
viewport and confirm slide-in panel reveals" succeeds.

### §3.3 Pairing with verification tiers

When the verification-tier rule (currently candidate-IR from
CMD99.1) graduates, hand-offs will tag each test instruction
as:

- **(C)** code-verifiable — operator can verify by inspecting
  the diff or running a console command
- **(R)** rendering-required — operator must open the surface
  in a browser to verify

Until that rule graduates, test instructions still distinguish
between code checks and rendering checks via natural language
("inspect element on...", "open page and observe...").

---

## §4 — Dev-console-first debugging discipline

### §4.1 When debugging is required

When the agent suspects a problem requires diagnostic
information (an unexpected behavior, a failed assertion, a
state mismatch), the agent's first move is **to instruct the
operator to run a diagnostic in the browser console**.

### §4.2 Diagnostic patterns

Effective dev-console debugging patterns:

- Inspect a specific DOM element's computed style:
  `getComputedStyle(document.querySelector('.btn'))`
- Verify a global variable's state:
  `window._PROJECTHUD_VERSION`
- Check whether an event listener is attached:
  `getEventListeners(document.querySelector('#hud-notif-btn'))`
- Probe a specific function's existence:
  `typeof HUDShell.init`
- Trigger a function call and observe:
  `HUDShell.init({page: 'test', moduleName: 'Test'})`

The agent provides the exact command. The operator copy-pastes,
runs, reports output. The agent diagnoses from output. Total
loop time is seconds.

### §4.3 When code-level instrumentation IS appropriate

- The bug is timing-dependent and only reproduces under load
- The bug is in a code path that the operator cannot easily
  trigger from the console
- The diagnosis requires capturing state across many
  interactions

When code instrumentation is appropriate, it remains terse —
one or two strategic console.log statements, not a debug
festival. Instrumentation is removed before final hand-off.

### §4.4 What the agent does NOT do

- Add debug branches to production code paths
- Create ad-hoc test files unless the work explicitly requires
  them
- Suggest "let's deploy and see what happens" as a debugging
  strategy
- Suggest extensive logging be left in place "in case we need
  to debug again later"

---

## §5 — Pairing with adjacent rules

Iron Rule 40 pairs with:

- **Iron Rule 37** (silent work-mode) — §2 of this rule
  reiterates IR37; together they form a unified terse-output
  discipline.
- **Iron Rule 39** (architect briefing discipline) — IR39's
  input enumeration is the precondition that makes IR40's
  halt-on-missing-input usable. If the architect specifies
  inputs completely, halts are rare.
- **Verification-tier rule** (CMD99.1 candidate, awaiting
  graduation) — IR40 §3 (test instructions) is the operator-
  facing artifact; verification-tier rule is the agent-facing
  certainty gradient. Together they prevent the
  PASS-without-evidence pattern.

---

## §6 — Enforcement

For halt-on-missing-input violations:

> "Apply Iron Rule 40 §1 — halt on missing input. You wrote a
> local replacement for [X]; revert and request the file."

For terse-transcript violations:

> "Iron Rule 40 §2 — work silently. Drop the narration."

For test-instructions violations:

> "Apply Iron Rule 40 §3 — test instructions required in
> hand-off."

For dev-console-debugging violations:

> "Use dev-console JS as the primary debug method per Iron
> Rule 40 §4. What console command would diagnose this?"

---

*Iron Rule 40 ratified.*
