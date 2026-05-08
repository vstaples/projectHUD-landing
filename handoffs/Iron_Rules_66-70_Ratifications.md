# Iron Rule 66 — Ratification

**Status:** ratified 2026-05-08 morning
**Authority:** operator + architect
**Scope:** every default-state customer-facing surface in Accord
(and other ProjectHUD modules with multi-archetype operator bases)

---

## Rule

**Default-state customer-facing surfaces in Accord must serve all
meeting archetypes (or all workstream shapes, or all
whatever-the-surface-is-organizing) by design. Specialization to
a single shape is permitted only as opt-in views layered on top
of the universal default.**

---

## Why this rule exists

The 8-mockup design charette of 2026-05-07 surfaced the canonical
case. The architect's v4 mockup ("Magic Wand") committed five
paradigm-breaking moves at once: canvas-primary substrate,
filmstrip temporal navigation, session-view agenda grid, spatial
attendee map, and ambient sound design. The render landed visually
but failed when pressure-tested: the operator's diagnosis was that
"75% of the content has no reasonable connection to what we've
discussed, and expects a rich set of pictures & attachments that
may not be present."

The failure was not execution. It was that v4's canvas-primary
default privileged engineering-project meetings (with rich visual
artifacts like PCB layouts, thermal sims, BOM tables) and crowded
out 1:1s, retrospectives, kickoffs, status syncs, regulatory
reviews, board updates, and decision reviews. Seven of eight
meeting archetypes were poorly served by the default state. v4
served one archetype well.

The lesson: when designing a surface that operators of many kinds
will use, the default cannot privilege one operator's shape. v3.5
was rebuilt with this discipline; every integrated keeper had to
pass an explicit 8-archetype walkthrough or be demoted to opt-in.

The rule generalizes: default-state surfaces are universal; opt-in
views are specialized.

---

## §1 — What the rule requires at design time

For each design move (panel, affordance, behavior, layout
element):

1. **The architect identifies the substrate-shape the move
   privileges**, if any. A canvas-primary layout privileges
   visual-artifact substrate; a session-grid composition surface
   privileges pacing-heavy meetings; a spatial attendee map
   privileges multi-attendee adversarial sessions.
2. **The architect walks the move through the operator's
   archetype set** (for Accord meetings, the eight archetypes per
   Iron Rule 67). If the move serves all archetypes, it qualifies
   as default. If it serves a subset, it gets demoted to opt-in.
3. **The default state is what every operator sees first**, with
   no configuration. It must produce a coherent experience for
   the operator with the simplest possible substrate (e.g., a 1:1
   workstream with one meeting and three threads).
4. **Opt-in views layer atop the default** as toggleable modes,
   accessible from the default surface but not active by default.

---

## §2 — Diagnostic question

When tempted to ship a non-universal default, ask:

> *Does this design's default state work for an operator whose
> substrate is shaped completely differently than the example I
> built it from?*

If the honest answer is "no, but their case is unusual," the
default is wrong. Their case is the case the surface must serve.

---

## §3 — Failure mode the rule prevents

Building beautiful single-scenario surfaces that look like
products and serve like demos. The temptation is real because
single-scenario designs photograph well, demo cleanly, and feel
ambitious. They also fail in production the moment a real
operator with a different substrate shape opens them.

---

## §4 — Cross-module application

Applies to every default-state customer-facing surface in
ProjectHUD where multiple operator archetypes exist. Cadence,
Compass, and Aegis surfaces inherit the discipline if they
serve multi-archetype operator bases. Module-specific archetype
sets may differ from Accord's eight (Iron Rule 67); the
substrate-shape-agnosticism principle is universal.

---

*Iron Rule 66 ratified 2026-05-08 morning.*

# Iron Rule 67 — Ratification

**Status:** ratified 2026-05-08 morning
**Authority:** operator + architect
**Scope:** every meeting-related design CMD in Accord

---

## Rule

**Meeting-related designs in Accord must be validated against
eight explicit meeting archetypes before being adopted as
canonical. The eight archetypes are: 1:1 with direct report,
status sync, project review, retrospective, decision review,
kickoff, regulatory review, and board update. Each design move
gets walked through all eight; anything serving a subset is
demoted to opt-in or cut.**

---

## Why this rule exists

The v4 magic-wand mockup's failure (see Iron Rule 66 rationale)
was diagnosed by walking the eight archetypes explicitly.
Canvas-primary served engineering project review; it failed for
the other seven. Session-view 4×3 grid served pacing-heavy
meetings; it served two archetypes well, the rest poorly.
Spatial attendee map served high-stakes multi-attendee sessions;
it failed for 1:1s.

The walkthrough produced clarity that abstract reasoning had
not. Each archetype has its own substrate density, attendee
count, time pressure, and operator activity profile. A design
move that "feels universal" may quietly privilege one or two
archetypes; explicit walkthrough surfaces the privilege.

The eight archetypes themselves emerged from the operator's 40+
years of meeting facilitation experience across many industries.
They are not an exhaustive taxonomy of meetings — they are the
canonical set against which Accord's design must validate.

---

## §1 — What the rule requires

For each design move in a meeting-related CMD:

1. **The architect walks the move through all eight archetypes
   explicitly.** Each archetype gets one or two sentences:
   "For a 1:1 with a direct report, this affordance does X..."
2. **If the move serves all eight (or seven with one minor
   degradation), it qualifies as default.** The bar is high
   intentionally.
3. **If the move serves a subset (≤6 archetypes meaningfully),
   the move is demoted to opt-in or cut.** Opt-in means
   accessible from a mode toggle, not present by default.
4. **The walkthrough is documented** in the brief or scaffolding
   — not just performed in the architect's head. The coding
   agent reads the walkthrough and the operator can audit it.

---

## §2 — The eight archetypes

| Archetype | Defining characteristics |
|---|---|
| 1:1 with direct report | 2 attendees; recurring; high relational continuity; light substrate |
| Status sync | 3-8 attendees; brief; informational; minimal NRA action |
| Project review | 3-8 attendees; periodic; rich substrate; multi-NRA |
| Retrospective | 3-12 attendees; episodic; reflective; sentiment-heavy |
| Decision review | 3-8 attendees; punctuated; high-NRA-density; belief-resolution focus |
| Kickoff | 3-15 attendees; one-time; scope-and-stakeholder-heavy; light prior substrate |
| Regulatory review | 3-8 attendees; slow tempo; document-heavy; compliance-focused |
| Board update | 5-15 attendees; periodic; status + decision blend; political stakes |

The list is canonical for Accord's design discipline. As operator
practice surfaces meeting types not covered by the eight, the
list may extend — but the discipline of explicit archetype
walkthrough remains.

---

## §3 — When the rule does NOT fire

- Substrate-only CMDs (no surface design changes) — the rule
  applies to design moves, not substrate.
- Internal architect tooling (logs, debug surfaces) where the
  audience is a single archetype (the architect or operator)
  by definition.
- Configuration surfaces where the user is explicitly choosing
  among archetype-specific options.

---

## §4 — Cross-module application

The rule applies to Accord directly. Other ProjectHUD modules
(Cadence, Compass, Aegis) may have their own archetype sets if
they serve multi-archetype operator bases. The discipline of
explicit-archetype-walkthrough is universal; the specific
archetypes are module-local.

If a module ships without an explicit archetype set, design CMDs
for that module default to a single-archetype assumption (the
module's primary use case) and the rule's spirit applies via Iron
Rule 66 (substrate-shape-agnosticism) rather than this rule.

---

*Iron Rule 67 ratified 2026-05-08 morning.*

# Iron Rule 68 — Ratification

**Status:** ratified 2026-05-08 morning
**Authority:** operator + architect
**Scope:** every customer-facing surface in Accord that displays
substrate-derived intelligence about people

---

## Rule

**Surfaces in Accord are categorized by audience at design time,
not retrofitted with permissions. Three categories are canonical:
operator-private surfaces, public surfaces, and substrate-derived
items (where sealed substrate is public to participants but
intelligence derived from substrate is operator-private). Surface
design integrates this categorization from the first scaffolding
sketch; RLS policies enforce it at substrate.**

---

## Why this rule exists

The v3.5 design arc surfaced the canonical case at the moment of
locking. The Meeting Setup briefing pack design integrated rich
substrate-derived intelligence per attendee: temperature badges
("Dissent simmering"), pattern attribution ("2 slips per 30d on
cost-analysis tasks"), urgency math ("mean silence-before-public-
dissent: 14d, currently 22d, move now"). The design was reviewed
and locked.

Then the operator asked: "Is this the view as people are
gathering for the meeting? Once all in attendance the Begin
Meeting button is clicked? If so, we need to be careful what is
meeting owner view-only vs. public view."

The question exposed a critical conflation. Showing Tom that the
system flagged him as "Dissent simmering · mean silence-before-
public-dissent: 14d, currently 22d" would feel surveillance-state.
Showing Marcus that the system tracks his "2 slips per 30d"
pattern is a workplace HR landmine. The intelligence that makes
the briefing pack valuable for the operator is precisely the
intelligence that must NOT be visible to the subjects of that
intelligence.

The resolution: the briefing pack is the operator's prep
surface, audience = operator only. Attendees see a separate
public/joining surface — title, intended outcome (if shared),
agenda, references, connection-state dots. No briefing column
synthesis. No expectations column intelligence. Two distinct
surfaces, not one surface with permissions retrofitted.

The rule formalizes this discipline: privacy is a design-time
category, not a permission layer applied later.

---

## §1 — What the rule requires at design time

For each customer-facing surface:

1. **The architect identifies the surface's audience explicitly**
   at scaffolding draft time. Three categories are canonical:
   - **Operator-private surfaces**: seen only by the operator
     (briefing pack, prep workspaces, strategic intelligence
     about attendees, urgency math, pattern attribution,
     temperature reads, prep prompts)
   - **Public surfaces**: seen by all meeting participants
     (agenda, references, sealed minutes, decision artifacts,
     connection-state dots, intended outcome if shared)
   - **Substrate-derived hybrid items**: sealed substrate is
     public to those involved; intelligence derived from
     substrate is operator-private (a sealed decision is
     public; the urgency-math interpretation of the decision
     is operator-private)
2. **Audience is documented in the scaffolding** — visible to the
   coding agent and auditable by the operator.
3. **RLS policies enforce the audience boundaries at substrate.**
   Surface-level filtering is insufficient; audience
   categorization at substrate prevents leakage when surfaces
   evolve.
4. **Before any design move integrates substrate-derived
   intelligence, the diagnostic question fires:** "If this is
   shown to the subject, is it surveillance?" If yes, the
   affordance belongs in an operator-private surface only.

---

## §2 — Surface separation pattern

The canonical resolution for v3.5: **don't try to make one
surface serve two audiences.** Instead:

- One surface for the operator (rich, intelligence-laden,
  operator-private)
- One surface for the participants (clean, agenda-focused,
  participant-public)
- Both surfaces consume the same substrate; what they render is
  filtered by audience-category at design time

This is simpler architecturally than permission-gated single
surfaces and more honest about the privacy expectations of each
audience. The operator's prep is private prep; the participants'
gathering is shared gathering.

---

## §3 — Diagnostic question

When designing a surface element that displays anything about
attendees, ask:

> *If this is shown to the subject of the intelligence, is it
> surveillance?*

If yes, the affordance is operator-private. If no, it can be
public or hybrid per scaffolding decision.

Examples:
- "Sarah owes belief on DC-117 (12d)" → public (sealed
  substrate; Sarah knows she owes it)
- "Sarah declares belief within 24h of being asked directly" →
  operator-private (pattern attribution; surveillance if shown
  to Sarah)
- "Tom's dissent unacknowledged 22 days" → public (sealed
  substrate; Tom knows about his dissent)
- "Tom's mean silence-before-public-dissent is 14d, currently
  22d, move now" → operator-private (urgency math; surveillance
  if shown to Tom)

---

## §4 — Failure mode the rule prevents

Building intelligence affordances that work against the
operator's relationship with attendees the moment they're seen.
Pattern attribution and urgency math are valuable to the
operator and corrosive if exposed to the subject. The rule
prevents the conflation that produces an operator tool the
operator can't actually use because the wrong audience can see
it.

---

## §5 — Cross-module application

Applies to every customer-facing surface in ProjectHUD that
displays substrate-derived intelligence about people. Compass,
Cadence, and Aegis surfaces inherit the discipline. The
operator-private vs public-shared categorization is universal;
specific intelligence types vary by module.

The rule pairs with Iron Rule 70 (substrate-derived intelligence
> information presentation): Rule 70 makes the surface
*coach* the operator with intelligence; Rule 68 ensures that
coaching never becomes surveillance of the subjects.

---

*Iron Rule 68 ratified 2026-05-08 morning.*

# Iron Rule 69 — Ratification

**Status:** ratified 2026-05-08 morning
**Authority:** operator + architect
**Scope:** every customer-facing surface in Accord that has
both a "general operator" use case and a "power user" use case

---

## Rule

**When a surface has both a "general operator" use case and a
"power user" use case, the general default must work for the
general operator. Power-user affordances (canvas modes,
session-grid composition, spatial graphs, dense visualizations,
keyboard-cycle through nodes) are opt-in layers, never the
default render.**

---

## Why this rule exists

The v4 magic-wand mockup's failure (see Iron Rule 66 rationale)
was overdetermined. One axis of failure was substrate-shape
specificity; another axis was power-user privilege. v4 attempted
five power-user moves as the default render: canvas-primary,
filmstrip, session-grid, spatial-map, sound-design. Each move
served the operator who wanted high information density and
unconventional interaction. The general operator opening the
surface for the first time was overwhelmed.

The fix in v3.5 was discipline: every move had to answer "is
this useful to the operator who opens this for the first time?"
Filmstrip survived (every operator with any meeting history
benefits from temporal navigation). The other four power-user
moves were demoted to optional view, mode toggle, or cut.

The rule formalizes the discipline: power-user affordances are
opt-in, not default. The general operator's first encounter with
the surface must succeed; sophistication is layered atop
success, not substituted for it.

---

## §1 — What the rule requires at design time

For each design move:

1. **The architect asks: "Is this useful to the operator who
   opens this for the first time?"** If the honest answer is
   "yes, immediately, with no explanation needed," the move is
   default-eligible.
2. **If the answer is "yes, after the operator has used the
   product for some time" or "yes, for operators with specific
   workflows,"** the move is power-user. It does not appear in
   the default render.
3. **Power-user affordances are opt-in via:**
   - Mode toggles (operator clicks a control to enter
     power-user mode)
   - Settings (operator preferences enable specific affordances)
   - Keyboard shortcuts (discoverable but not default-visible)
   - Context menus (right-click reveals advanced actions)
4. **The default render must produce a coherent experience for
   the new operator** with no configuration. Coherent means: the
   surface accomplishes its primary purpose; the operator
   understands what they're looking at; no overwhelming density.

---

## §2 — Pairing with Iron Rule 66

Iron Rule 66 (substrate-shape-agnosticism) governs whether the
default works for all archetypes. Iron Rule 69 (universal-default
power-user-views-layered) governs whether the default works for
the general operator within each archetype. The two rules pair:

- IR66: the default must serve all archetypes
- IR69: the default must serve the general operator (within each
  archetype)

A move that fails IR66 is demoted to archetype-specific opt-in.
A move that fails IR69 is demoted to power-user opt-in. The
demotion mechanism is the same (opt-in toggle); the reasoning
differs.

---

## §3 — Examples from v3.5

| Move | IR66 status | IR69 status | Disposition |
|---|---|---|---|
| Briefing column substrate panels | Universal | General | Default ✓ |
| Filmstrip workstream timeline | Universal | General (with history) | Default ✓ |
| Connection-state dots | Universal | General | Default ✓ |
| Temperature badges per attendee | Universal | General | Default ✓ |
| Substrate synthesis prose | Universal | General | Default ✓ |
| Canvas mode (with rich visual artifacts) | Engineering-only | Power-user | Opt-in (cut from v3.5; future view) |
| Session-grid composition (4×3 time × NRA) | Pacing-heavy only | Power-user | Opt-in (cut from v3.5; future view) |
| Spatial attendee map (force-directed graph) | Multi-attendee adversarial | Power-user | Opt-in (cut from v3.5; future view) |
| Alpha-sort toggle (parking lot) | Universal | Power-user | Opt-in default-disabled |
| Animation-reduction setting | Universal | General (accessibility) | Opt-in default-disabled |

The pattern: passing both IR66 and IR69 → default. Failing either
→ opt-in, with the failure mode determining the opt-in mechanism.

---

## §4 — Failure mode the rule prevents

Optimizing for the power user at the expense of the general
operator. The temptation is real because power-user affordances
demo well to other power users (architects, designers, early
adopters) but produce attrition among the general operator base
who finds the default overwhelming.

The rule prevents the architect's natural bias toward density.
Architects design density well; general operators reject density
without specific motivation. Default for the operator first;
density for the architect later.

---

## §5 — Cross-module application

Applies to every customer-facing surface in ProjectHUD with
multiple sophistication tiers in its operator base. Cadence,
Compass, and Aegis surfaces inherit the discipline. The
universal-default discipline is module-agnostic; specific
power-user affordances vary by module.

---

*Iron Rule 69 ratified 2026-05-08 morning.*

# Iron Rule 70 — Ratification

**Status:** ratified 2026-05-08 morning
**Authority:** operator + architect
**Scope:** every customer-facing surface in Accord that displays
substrate to the operator

---

## Rule

**Customer-facing surfaces in Accord should coach the operator
— surfacing prep prompts, urgency math, pattern attribution,
predictive conflicts, behavioral intelligence — not merely
present substrate as data. When substrate intelligence is
available, it should be applied actively (e.g., "You haven't
queried Tom's dissent. Pattern says his silence breaks at day
14; he's at day 22") rather than passively rendered (e.g.,
"Tom: dissent open, 22 days").**

---

## Why this rule exists

The four external-agent mockups in the design charette varied
in how active their substrate use was. Mockup #2 ("Building the
Case") featured "You haven't queried T. Liu's dissent on DS-014.
He'll be in the room. Pull it?" — coaching, not display. Mockup
#3 ("Rehearsal") featured "Per substrate history, Tom raises
this within 7 min of supplier topics — typically takes 4-6 min
to address" — pattern-derived timing prediction, not display.
Mockup #4 ("The Round") featured "mean silence-before-public-
dissent: 14d, currently 22d, move now" — urgency math with
inflection-point analysis, not display.

The architect-drafted v3 mockup was dense with substrate but
mostly presented it (counts, statuses, badges, lists). v3 was
ratified as canonical, but felt thinner than the external
agents' best moves. The reason: v3 *showed* what the substrate
contained; the external agents *did things with* what the
substrate contained.

The integration in v3.5 promoted active substrate-coaching to
first-class. Synthesis prose at top of Briefing column
("Substrate momentum is positive but Tom's silence is
structural — if you don't close DS-005 this session, his pattern
says public dissent inside two weeks"). Prep-prompt banner in
Composition column. Pattern attribution per attendee. Urgency
math per attendee where applicable. The surface coaches the
operator; it doesn't merely present.

The rule formalizes the discipline: substrate is most valuable
when it actively shapes operator behavior, not when it's
displayed for the operator to interpret.

---

## §1 — What the rule requires at design time

For any substrate displayed on a customer-facing surface:

1. **The architect asks: "What does the operator do with this?
   Can the surface help them act on it?"** If the answer is
   "the operator interprets it themselves," look for a coaching
   affordance.
2. **Coaching affordances include:**
   - **Prep prompts** ("You haven't queried X; consider pulling
     it as a thread")
   - **Urgency math** (statistical inflection points with
     "move now" or "defer until" recommendations)
   - **Pattern attribution** ("This person typically does X
     within Y timeframe")
   - **Predictive conflicts** ("If you assign this to Sarah,
     she's already at 5 open actions; Marcus has capacity")
   - **Behavioral intelligence** (temperature reads, momentum
     metrics, friction predictions)
3. **The architect verifies coaching affordances comply with
   Iron Rule 68** (privacy-by-surface). Coaching that's valuable
   to the operator may be surveillance of the subject; rule 68
   constrains where coaching can render.
4. **Passive presentation is acceptable when active coaching
   would be premature** (e.g., the substrate hasn't accumulated
   enough history to support pattern attribution). Mark such
   passive displays as "candidate for future coaching" so
   downstream CMDs can promote them.

---

## §2 — Three classes of substrate-derived intelligence

| Class | Example | Substrate requirement |
|---|---|---|
| **Coaching prompts** | "You haven't queried X; consider Y" | Cross-thread substrate query at render time |
| **Urgency math** | "Mean silence-before-dissent: 14d; currently 22d" | Historical aggregation across many prior instances |
| **Pattern attribution** | "Declares belief within 24h of being asked directly" | Per-actor historical aggregation |

Each class has different substrate requirements. Coaching prompts
work with current-state substrate. Urgency math and pattern
attribution require historical aggregation across many instances
— which means they ripen as the substrate accumulates, and may
be unavailable in early operator usage.

---

## §3 — Distinction from passive display

Passive display: "Tom: dissent open, 22 days." The operator reads
this and decides what to do.

Active coaching: "Tom hasn't been queried about his dissent in 22
days. His pattern says silence breaks at day 14. Move now." The
surface decides what the operator should consider doing and tells
them.

Both are valid surface elements. The rule's claim is not that
all substrate must be coaching — passive display has its place.
The claim is that **when coaching is available, it should be
preferred**. Surfaces that exclusively passively-present are
underdelivering.

---

## §4 — Pairing with Iron Rule 68

Iron Rule 70 (substrate-derived intelligence > information
presentation) makes the surface coach. Iron Rule 68 (privacy-by-
surface) ensures that coaching never becomes surveillance of
the subjects. The two rules pair:

- IR70 says: prefer coaching to presentation
- IR68 says: coaching about people goes only on operator-private
  surfaces

A coaching affordance that violates IR68 (e.g., showing Tom his
own pattern attribution) is wrong even though it satisfies IR70.
A passive display that respects IR68 (e.g., showing Tom that he
has a dissent open) is acceptable even though it underdelivers
on IR70.

---

## §5 — Failure mode the rule prevents

Building surfaces that show data well but coach poorly. Beautiful
information-density without operator-actionability. Surfaces
that are aesthetically considered but functionally inert; the
operator looks at them, nods, and proceeds to do their prep
elsewhere because the surface didn't actually help them prep.

The rule prevents the failure mode where a surface is admired
and unused.

---

## §6 — Scope boundary clarification

This rule applies to surfaces displaying substrate. It does NOT
require navigation surfaces (constellation entry, workstream
list, meeting list) to coach. Navigation surfaces have their own
discipline — they make movement through the substrate efficient.
Coaching belongs in surfaces below navigation, where the
operator engages with specific substrate items.

The boundary is articulated in CMD-ACCORD-CONSTELLATION-ENTRY-1's
scaffolding §3.3 commentary on activity-weight glow: navigation
surfaces operate at the resolution of "this workstream warrants
attention," not "Tom's silence breaks at day 14." Both are
valid surface activities; they belong on different surfaces.

---

## §7 — Cross-module application

Applies to every customer-facing surface in ProjectHUD that
displays substrate to operators. Cadence, Compass, and Aegis
surfaces inherit the discipline. The substrate-coaching
preference is module-agnostic; specific coaching affordances
vary by module.

The rule's full power emerges as substrate accumulates. Early
operators receive less coaching (less historical data); mature
operators receive more. The architect designs for the mature
case and accepts graceful degradation in early operator usage.

---

*Iron Rule 70 ratified 2026-05-08 morning.*

---

# Ratification record

**Ratified by operator Vaughn Staples, 2026-05-08 morning, with
explicit ratification statement: "Ratified."**

Iron Rules 66, 67, 68, 69, and 70 enter the doctrine canon.
Total ratified Iron Rules: 36 (Iron Rules 36-65 + Iron Rule 58
amendment + Iron Rules 66-70).

These five rules constrain all future Accord customer-facing
design CMDs. They emerged from the v3.5 design arc of
2026-05-07 and are first applied in CMD-ACCORD-CONSTELLATION-
ENTRY-1 (commissioned 2026-05-08).

