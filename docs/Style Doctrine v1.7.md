# ProjectHUD Style Doctrine v1.7

**Status:** ratified 2026-04-26 (v1.0); amended 2026-04-26 (v1.1);
amended 2026-04-26 (v1.2); amended 2026-04-27 (v1.3);
amended 2026-04-27 (v1.4); amended 2026-04-27 (v1.5);
amended 2026-04-28 (v1.6); amended 2026-04-28 (v1.6.1);
amended 2026-04-28 (v1.7)
**Authority:** operator (product) + architect (code) — see §0.1.
v1.7 ratified by operator and acting-architect (operator standing
in for architect role per 2026-04-28 session). Future revisions
require both signatures.
**Scope:** every visible text element, button, color, panel
frame, status indicator, avatar, layout chrome element, and
font on every ProjectHUD surface.

**v1.7 changelog:**
- **§6.2 amended** (compliance status): existing rule unchanged
  in substance. Added explicit "known violations" register
  documenting four pre-existing §6.2 violations on Compass
  surfaces (`mw-rec-seq` panel container, `#mw-delta-strip`,
  `#mw-coc`, `#mw-diag-tl-header`) that bypass the token system
  via inline-styled JS-rendered DOM. The rule has been correct
  since v1.2; the violations predate it. v1.7 names them so they
  enter the retrofit queue rather than continuing as silent debt.
- **§6.2 amended** (Compass-specific clarification): the rule
  applies equally to Compass JS surfaces (`mw-*.js`,
  `mw-sequence.js`, scripts loaded from `/scripts/`). Inline
  panel-tier backgrounds in JS-rendered DOM are §6.2 violations
  regardless of the rendering origin. No new rule; v1.7 closes
  the implicit-scope gap that left these surfaces unaudited.
- **§3.5 amended** (advisory-tier disposition): the
  `rgba(0, 210, 255, 0.03)` cyan-wash applied to system-generated
  surfaces (Recommended Sequence panel, Since-Last-Login strip)
  was never doctrine-sanctioned. v1.7 explicitly **rejects** the
  pattern. All panel-tier surfaces render at `--surface-panel`
  (= `--bg1`). Differentiation of advisory/system-generated
  surfaces relies on existing signals — left-border accent,
  header treatment, "System-generated" timestamp metadata. No
  new tier, no new modifier class, no new token.
- **§12 sequencing**: CMD-A (Compass §6.2 violation cleanup)
  inserted as the doctrine-application kickoff for the Compass
  retrofit (entry 11). Compass-wide JS-surface audit and
  migration of all panel-tier inline backgrounds to token-driven
  classes. Specifically named offenders: `mw-sequence.js`
  Recommended Sequence outer container, `#mw-delta-strip` ("Since
  last login") in `mw-core.js`/`mw-events.js`, `#mw-coc` Chain
  of Custody container, `#mw-diag-tl-header` diagnostic timeline
  header. Audit also sweeps for additional Compass-rendered
  panel-tier surfaces with inline backgrounds beyond the four
  named.

**v1.6.1 changelog (preserved):**
- **§4.4 amended** (KPI value size correction): primary value
  spec changes from "28-36px (varies by surface density)" to
  "26px canonical." Reflects the operator-ratified value from
  CMD99.1 visual review and CMD98.7 application. Surface-density
  variants permitted but not the default.
- **§4.4 amended** (KPI strip elevation context): explicitly
  specifies that KPI strips sit on `--surface-page` (`--bg0`),
  with cards sitting at `--surface-content` (`--bg2`) — a
  two-tier-skip pattern. Prior wording omitted strip-wrapper
  elevation, which produced an implicit-contract gap during
  CMD98.7 implementation. The strip-wrapper's enclosing panel
  (when present) sits at `--surface-panel` (`--bg1`) per §3.5.2.
- **§3.5 amended** (`.panel` global rule clarification):
  explicit doctrine binding that `.panel` shared class uses
  `var(--surface-panel)` (= `--bg1`), not `--bg2`. Pre-doctrine
  `/css/hud.css` had `.panel { background: var(--bg2) }` which
  is incorrect per §3.5.2 tier mapping. CMD99.2 corrects this.
- **§5.x added** (UI.gauge canonical): the shared gauge component
  in `ui.js` is the canonical gauge implementation. Surfaces
  do not implement local gauge replacements. CMD99.2 retires
  dashboard's local gauge renderer (introduced in CMD99) in
  favor of doctrine-conformant `UI.gauge` typography
  (Inter, ≥11px). See §5.9.

**v1.6 changelog (preserved):**
- §4.4 amended (KPI top-bar treatment refinement): focal vs
  non-focal informational distinction.

**v1.5 changelog:**
- **§3.6 added** (State-color reservation rule): `--green`,
  `--amber`, `--red` reserved for state-health metrics.
  Domain-identity colors sanctioned as separate decorative
  category. Decorative palettes that include green/amber/red
  hues are fine because they don't reference the named tokens.
- **§3.7 added** (State-color saturation rule): state-color
  tokens render at full saturation by default. No surface-local
  dimming via opacity, alpha, or `--*-dim` variants.
- **§4.4 added** (KPI card canonical): consolidates v1.4 internal
  typography (proposal-detail-derived) with dashboard-derived
  container treatment. Top color-bar, elevated background,
  generous gap, optional right-side glyph.
- **§4.5 added** (Panel frame canonical): aqua corner brackets
  + aqua left-bar prefix + thin page frame lines form the
  unified panel-frame language for non-KPI surfaces.
- **§4.6 added** (Empty-state pattern): centered glyph in state
  color + state label in caps + sub-text. Reference: Key Action
  Items "ALL CLEAR".
- **§4.7 added** (Right-anchored row badges): vertical-center
  alignment of right-terminus badges across all panels.
- **§4.8 added** (Header count/badge sizing): in-header counts
  and badges that summarize panel body match body text size,
  not section-label size.
- **§4.9 added** (Page-frame lines): thin top + right frame
  lines apply platform-wide.
- **§5.8 added** (Avatar canonical): photo if present, initials
  fallback. Same treatment everywhere avatars appear.
- **§7.3 added** (Inline metadata strips vs card-strip KPIs):
  card-strip canonical for "show me the state of my world"
  surfaces; inline metadata pattern sanctioned for "tell me
  about this thing" detail-headers.
- **§10 amended**: differentiated accent colors deferred.
- **§12 sequencing**: CMD99 (dashboard) bundles three concerns
  per operator decision — full v1.5 doctrine retrofit, gauge
  arc proportionality fix, footer strip with version display.
  CMD98.x slot reserved for proposal-detail KPI container
  upgrade post-CMD99.

**v1.4 changelog (preserved):**
- §3.5 added (Surface elevation tiers): six-tier elevation
  system. Two-layer architecture per Philosophy C with
  `--surface-*` role aliases.
- §3.5 ladder retune: `--bg0..bg5` defined monotonic; defect
  corrected.
- §5.2 corrected: `.btn` background → `var(--surface-interactive)`.
- §5.7 added (Interactive element shadow).

**v1.3 changelog (preserved):**
- §5.5 split into §5.5a (foot-of-panel — keeps `.btn--dashed`,
  now with 2px border) and §5.5b (inline-with-header — plain
  `.btn`, no modifier).

**v1.2 changelog (preserved):**
- §0.1 added (Authority and amendment scope): explicit
  prohibition on coding agents modifying or extending doctrine.
- §5.6 added (`.btn--icon-only` modifier): formalized in
  doctrine.
- §3.3 corrected: removed the inaccurate "v1.1 doctrine pass"
  language.
- §12 sequencing: CMD98.1 / CMD98.2 split.

**v1.1 changelog (preserved):**
- §7.1 split into §7.1a (scaffolded) and §7.1b (no-scaffold)
  variants.
- §7.2 expanded: variant selection rule.
- §7.1a subtotal-value weight corrected from 700 to 600.
- §9.2 added: body-context suffix rule.
- §5.5 added: dashed-border affordance for add-to-list buttons.
- §6.2 amended: data-driven inline styles permitted as a narrow
  exception.

---

## §0 — Purpose and authority

This document is the canonical visual style reference for the
ProjectHUD platform. Every surface (Dashboard, Compass, Cadence,
Pipeline, User Management, Aegis, all detail views, all modals)
must conform to the rules below.

The doctrine exists because divergence in any single surface
multiplies the universe of bugs across all subsequent
cross-cutting work — see the journal lesson on convergence-as-
tax-on-prior-divergence. Visual style is one of those cross-
cutting concerns. Locking it once removes a class of future
retrofit cost.

This document does not prescribe layout, page structure, or
component composition. It prescribes **visual atoms** — fonts,
sizes, weights, colors, padding, case, hierarchy. Layout choices
remain per-surface.

When a surface needs a treatment this doctrine does not cover,
the surface does **not** invent a local solution. The architect
amends the doctrine; the surface adopts the amendment. Local
overrides are a doctrine violation regardless of how reasonable
they look in isolation.

### §0.1 — Authority and amendment scope (v1.2)

**Coding agents do not modify, extend, or amend this doctrine.**
This includes, without exception:

- Adding new CSS classes to `/css/hud.css` that are not
  explicitly enumerated in the brief authorizing the agent's
  work-cycle.
- Adding new CSS modifier classes (e.g., `.btn--something-new`,
  `.section-label--variant`) anywhere, even in surface-local
  stylesheets, when the modifier carries any visual or semantic
  meaning a future surface might want to reuse.
- Introducing new color values, font sizes, font weights, or
  spacing values that are not already in the doctrine's tables
  (§2, §3.2, §4.1, §5).
- Reinterpreting doctrine rules to fit edge cases the brief
  did not anticipate.
- Promoting any local pattern, ad-hoc class, or convenience
  helper into shared infrastructure.
- Editing this document or any file named `style-doctrine*.md`.

**Authority chain:**

| Role | What this role decides |
|---|---|
| Operator | Product intent, visual preferences, ratification of doctrine amendments |
| Architect | Doctrine wording, rule precision, brief scope, amendment proposals |
| Coding agent | Implementation of an amendment-bound brief |

Doctrine amendments flow **operator + architect → doctrine → brief
→ agent**. They do not flow agent → doctrine.

**When an agent encounters a gap during a work-cycle:**

The agent **halts, does not invent, and reports**. The hand-off
includes a `Findings` entry naming:

1. The doctrine section the gap surfaces under (e.g., "§5
   buttons — modal close button has no spec").
2. What the agent would have done if forced to ship (so the
   architect understands the proposed shape, not as authorization
   but as input).
3. What the agent did instead (typically: applied the closest
   existing class with no modifications, or left the element
   styled by surface-local fallback pending amendment).

The architect drafts a doctrine amendment with the operator. The
agent receives a follow-up brief (e.g., CMD98.X) that authorizes
the change. **The agent does not act on the gap before the
amendment ships.**

**Forbidden hand-off patterns:**

- "Introduced `.btn--whatever` ad-hoc to handle [case]; flagging
  for formalization later."
- "Doctrine §X was unclear so I interpreted it as [Y]."
- "Added `--text-something` token because the existing roles
  didn't fit; suggest reviewing."

These are doctrine violations regardless of how reasonable the
introduced pattern looks in isolation. The fix is to halt and
report, not to ship-and-flag.

**Why this rule exists:** ad-hoc agent additions to shared
infrastructure compound silently. The architect cannot review
every CSS class an agent introduces; the operator cannot detect
class additions during visual review. Without this rule, every
retrofit accumulates a small pile of agent-introduced
"deferred-formalization" work that the doctrine inherits as
back-pressure. Multiplied across 7+ retrofits, the doctrine
becomes a list of things the agent decided rather than a list
of things the operator and architect ratified.

This rule exists to keep the authority chain unidirectional.

---

## §1 — Iron rules (invariants)

These are not preferences. They are invariants the system depends
on to function.

### IR38 (candidate) — Minimum font-size: 11px

Every visible text element renders at **11px or larger**. No
exceptions for any reason — not for "fitting more in," not for
"it's just a tiny label," not for "the design comp shows 10px,"
not for any reason whatsoever.

Reassessment after the dashboard retrofit ships will determine
whether the floor needs to rise to 12px platform-wide.

Status: **ratification pending post-dashboard retrofit.** Treated
as binding immediately; formal iron-rule numbering deferred until
post-retrofit reassessment.

---

## §2 — Font families

### §2.1 The single UI face: Inter

**Inter is the sole UI font family** for the entire ProjectHUD
platform. Used for: page titles, section labels, body text, table
cells, buttons, badges, KPI values, KPI sub-text, datetime,
version strings, navigation, every visible text element.

Loaded from Google Fonts:

```
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
```

Token: `--font-ui: 'Inter', system-ui, sans-serif;`

**Weight scale:**

| Weight | Use |
|---|---|
| 400 | Body text, table cell content, item names in dense panels |
| 500 | UI emphasis, button labels, subtotal labels |
| 600 | Sub-titles, table header content, item values, grand-total labels |
| 700 | Page titles, section labels (D10), CTAs, primary numerics |

**Tabular figures** are required on all numeric elements via
`font-feature-settings: "tnum"`. Apply this anywhere digits need
to vertically align in columns or where numerics carry data weight
(KPI values, table numeric columns, currency values, datetime).

### §2.2 The single brand exception: Rajdhani

**`--font-display: 'Rajdhani', sans-serif;`** Used **exclusively**
for the platform wordmark "ProjectHUD" in the unified header.
Weight 700 only.

Rajdhani is not used for any other text element in the platform.
Sub-brand wordmarks (Compass, Cadence, Aegis) inherit Inter; they
are not subject to the Rajdhani exception.

### §2.3 Retired faces

These faces were used in pre-doctrine code and are removed during
retrofit:

- Share Tech Mono — replaced by Inter throughout
- DM Sans — was never loading; replaced by Inter
- Barlow — never used; removed from imports
- Barlow Condensed — replaced by Inter throughout (including
  Tier 1 / Tier 2 navigation)
- Arial (hardcoded in cadence pills) — replaced by Inter
- system-ui / sans-serif fallbacks where they appear without
  Inter as the primary — fixed to lead with Inter

### §2.4 Deferred face: JetBrains Mono

`--font-data: 'JetBrains Mono', monospace;` is **declared but not
used** in v1.0. May be reintroduced for specific data-heavy
surfaces (long financial tables, real-time logs) if Inter tabular
figures prove insufficient. Default position: not used. Decision
to enable for any specific surface requires architect amendment.

---

## §3 — Color tokens

### §3.1 Two-layer architecture

Color tokens are organized in two layers:

**Layer 1 — Physical color values (the ladder).** Define the
actual hex/rgba. Components do **not** reference these directly.

**Layer 2 — Semantic role aliases.** Components reference these.
Re-tuning Layer 1 updates every component automatically.

### §3.2 Text color roles

| Role token | Layer 1 value | Used for |
|---|---|---|
| `--text-primary` | `#e8f4ff` | Page titles, KPI values, actor names, grand-total labels — first thing the eye lands on |
| `--text-body` | `#c8dff0` | Default body text, table cells, paragraph text, subtotal labels, item values in dense panels, **item names in no-scaffold dense panels (§7.1b)** |
| `--text-muted` | `#a8c5e0` | Secondary metadata, sub-text, section labels (D10), **item names in scaffolded dense panels (§7.1a)** |
| `--text-faint` | `#6890b8` | Tertiary metadata, age stamps, separators, supplementary info |
| `--text-accent` | `#00d2ff` | Verb phrases, links, active states, brand emphasis, primary CTA fill, single most important number on a panel |

**Contrast floor:** every text role must achieve **≥ 4.5:1**
contrast against `--bg0` (the darkest background). The Layer 1
values above are tuned to meet this floor.

**Reserved usage of `--text-accent`:** in dense panels with
hierarchical totals (per D14), the accent color is reserved for
the **single most important number on the panel** — typically the
grand total. Do not splash accent across multiple lines; it loses
its function as a focal point.

### §3.3 Non-text color tokens

Backgrounds, borders, and state colors carry the same two-layer
architecture but are **not yet specified** — see §10 (Deferred
work). Surfaces continue to use the existing `--bg*`, `--border*`,
`--green/amber/red/purple` tokens directly. Refactoring those to
role-keyed aliases is a future doctrine pass with no committed
version.

### §3.4 Forbidden patterns

The following are doctrine violations regardless of context:

- Raw hex or rgba values for text colors anywhere a `--text-*`
  role token applies (including JS-generated markup — see §6.2)
- Inline `style=""` attributes setting color, font-family, or
  font-size on any element (see §6.2)
- Surface-local color tokens that duplicate or near-duplicate
  Layer 1 ladder values (e.g., `#00d2ff` declared as a brand
  variable when `--cyan` already exists)

### §3.5 Surface elevation tiers (v1.4)

The platform's visual hierarchy is governed by **six elevation
tiers**. Every visible surface in the platform sits at exactly
one tier, and any element placed on top of another surface must
sit at a strictly higher tier than its container.

This rule produces consistent visual hierarchy across surfaces:
the eye walks the elevation gradient and parses what's on top of
what without conscious effort. Buttons feel like buttons because
they're elevated above their containers. Panels feel like panels
because they're elevated above the page. Modals feel like
modals because they're elevated above everything.

#### §3.5.1 — Two-layer architecture (per Philosophy C)

**Layer 1 — Physical color values (the ladder).** Define the
actual hex values. Components do **not** reference these
directly.

```css
--bg0: #060a10;   /* tier 0 — page background */
--bg1: #0d1424;   /* tier 1 — primary panel surface */
--bg2: #141d33;   /* tier 2 — content/row within panel */
--bg3: #1d2a45;   /* tier 3 — interactive at rest */
--bg4: #2a3a5c;   /* tier 4 — interactive hover/active */
--bg5: #344770;   /* tier 5 — overlay/modal/popover */
```

The ladder ascends monotonically with approximately 5-7%
lightness gaps between adjacent tiers. **v1.4 corrects the
pre-doctrine ladder, which had `--bg3` (`#0a1525`) darker than
`--bg2` (`#0c1628`)** — a defect that v1.0 inherited without
detection.

**Layer 2 — Semantic role aliases.** Components reference these.
Re-tuning Layer 1 values updates every component automatically.

```css
--surface-page:               var(--bg0);
--surface-panel:              var(--bg1);
--surface-content:            var(--bg2);
--surface-interactive:        var(--bg3);
--surface-interactive-hover:  var(--bg4);
--surface-overlay:            var(--bg5);
```

#### §3.5.2 — Tier assignments

| Tier | Token | Used for |
|---|---|---|
| 0 | `--surface-page` | The outermost page background. The canvas everything else sits on. |
| 1 | `--surface-panel` | Primary panels, cards, sidebars, the unified header. The first level of "this is a thing on the page." |
| 2 | `--surface-content` | Sub-sections within panels: row stripes, internal panel sections, table headers, summary strips, panel content backgrounds that sit "inside" a panel. |
| 3 | `--surface-interactive` | Interactive elements at rest: buttons, dropdowns, inputs, selectable rows, tabs. The tier that signals "this element responds to interaction." |
| 4 | `--surface-interactive-hover` | Hover and active states for interactive elements. One tier brighter than rest, providing the feedback signal. |
| 5 | `--surface-overlay` | Modals, popovers, tooltips, dropdown menus that float above everything. The tier that signals "this is on top of the world." |

#### §3.5.3 — Elevation discipline rule

**Any element placed on top of another surface must sit at a
strictly higher tier than its container.**

A button inside a panel: panel is tier 1, button must be tier 3
(or 4 on hover). A modal opened from anywhere: modal is tier 5,
darkening overlay scrim sits between tier 4 and tier 5. A row
within a table: row tier 2 sits on table tier 1 panel.

Skipping tiers is acceptable (button at tier 3 inside panel at
tier 1 — skips tier 2). Reversing tiers is a doctrine violation
(button at tier 1 inside panel at tier 2). Adjacent same-tier
elements are acceptable for genuine peers (sibling cards on a
page background, all at tier 1) but not for parent-child
relationships.

#### §3.5.4 — Borders coexist with elevation

**v1.4 keeps borders as a separate visual mechanism.** Elevation
does not replace borders. The current border-heavy aesthetic of
the platform is preserved; elevation discipline is added as a
new structural axis on top of borders.

A future doctrine pass may revisit whether elevation alone can
carry separation work that borders currently do. v1.4 does not
make that change.

#### §3.5.5 — Pre-doctrine ladder retune (forward-only)

The Layer 1 ladder values in §3.5.1 represent the v1.4-ratified
spec. The pre-doctrine ladder (`--bg0..bg3` defined in
`/css/hud.css` before v1.4) is **retuned to match v1.4 values**
when v1.4 is applied to a surface. Surfaces not yet retrofitted
continue to render against pre-doctrine values until their
respective retrofit ships.

**`--bg4` and `--bg5` are new values added in v1.4.** They do
not exist in the pre-doctrine ladder.

#### §3.5.6 — `.panel` global rule binding (v1.6.1)

The shared `.panel` class in `/css/hud.css` MUST use
`var(--surface-panel)` as its background — i.e., `--bg1`,
the tier-1 panel surface per §3.5.2.

```css
.panel {
  background: var(--surface-panel);
}
```

The pre-doctrine `/css/hud.css` rule had
`.panel { background: var(--bg2) }`, which placed `.panel`
elements at the tier-2 (content) surface instead of tier-1
(panel). This produced reversed elevation when content
elements (KPI strips, sub-panels) at tier-0 or tier-2 sat
inside `.panel` containers, which violates §3.5.3.

The defect surfaced during CMD98.7 implementation, when
proposal-detail's KPI strip (intended to sit at `--bg0`)
landed inside `#panel-wbs.panel` (which rendered at `--bg2`
via the global rule), producing a strip darker than its
container. The CMD98.7 work-cycle introduced a surface-local
`#panel-wbs { background: var(--bg1) }` override as a
near-term fix.

CMD99.2 corrects the global rule. The surface-local
`#panel-wbs` override is retired in favor of the corrected
shared rule. All other surfaces using `.panel` (including
non-retrofitted surfaces) gain the corrected elevation
automatically.

#### §3.5.7 — Advisory-tint rejection (v1.7)

A pre-doctrine cyan-wash pattern (`rgba(0, 210, 255, 0.03)`) was
applied to two Compass surfaces — the Recommended Sequence panel
container in `mw-sequence.js` and the `#mw-delta-strip`
("Since last login") notification bar — apparently to mark them
as system-generated/advisory content distinct from neutral
operator-owned panels.

**v1.7 explicitly rejects this pattern.** All panel-tier surfaces
render at `--surface-panel` (= `--bg1`). Differentiation of
advisory or system-generated surfaces relies on existing signals:

- The cyan left-border accent (`border-left:3px solid #00D2FF`)
  already present on the Recommended Sequence panel.
- The "System-generated · {date}" timestamp in the panel header.
- Section-label treatment (color, weight, letter-spacing) per §4.2.
- Body content tone, dismiss affordances, and tooltip copy that
  describe the surface as system-generated.

The advisory tint is rejected on three grounds:

1. **It bypasses the elevation system.** Panel-tier surfaces
   render at the tier-1 surface (`--bg1`) per §3.5.2. A
   cyan-tinted alternate fill at the same tier creates an
   unnamed parallel-track surface invisible to the doctrine.
2. **It is invisible to operator review.** The 3% opacity is
   imperceptible to most viewers under most conditions; the
   visual "lift" it provides is illusory while the architectural
   cost (inline-styled panel chrome unreachable to token
   refactors) is real.
3. **It compounds.** Once a parallel-track tint exists for one
   "advisory" surface, future surfaces that feel similar acquire
   the same tint by copy-paste, multiplying §6.2 violations.
   v1.7 chooses to remove the pattern before it spreads further.

A future doctrine pass may revisit advisory-tier formalization
(named token, modifier class, sanctioned tier) if the pattern
recurs and operator review confirms the visual differentiation
is missed. v1.7 removes the existing pattern; v1.8+ may
reintroduce it under a doctrine-sanctioned form. The agent does
not invent the tier; the operator and architect ratify it.

### §3.6 State-color reservation (v1.5)

The state-color tokens `--green`, `--amber`, and `--red` are
**reserved for state-health metrics**. They communicate
condition (good / caution / bad) on values, badges, indicators,
and other elements that represent a measurable state.

**State-color tokens MUST be used for:**
- Status badges (At-Risk, Overdue, Blocked, On Track, Complete)
- KPI values that cross a state threshold (e.g., > 0 risks → red)
- KPI top color-bars when the metric represents a state
- State-health icons in panel rows
- Empty-state success indicators (e.g., "ALL CLEAR" green check)
- Schedule-Performance-Index, Cost-Performance-Index, and similar
  threshold-driven values

**State-color tokens MUST NOT be used for:**
- Decorative framing (panel borders, dividers, separators)
- Brand or domain identity (use the platform accent or a
  sanctioned domain-identity color)
- Categorical differentiation that is not state-related
- Hover affordance (hover states use elevation-tier change per
  §3.5, not state-color application)

**Domain-identity colors are sanctioned as a separate
decorative-color category.** When a KPI card or row represents
a domain (Workflows, Forms, Risks, Disciplines), the card may
adopt a domain-identity color in its top-bar or other decorative
slot. Domain-identity colors are platform-named (e.g., purple
for Workflows, green for Forms) and used consistently across
surfaces. Domain-identity colors are NOT the state-color tokens
even if they happen to fall in the same hue family — the
distinction is *what the color means in context*, not the hue.

**Decorative palettes for categorical differentiation** (e.g.,
the `DISC_COLORS` array assigning distinct colors to each
discipline so the user can tell them apart at a glance) are
free to use any hue including green/amber/red equivalents
because they do not reference the named state-color tokens.
The doctrine prohibition is on **token usage**, not hue family.

### §3.7 State-color saturation (v1.5)

State-color tokens render at **full saturation** by default.
Surfaces do not dim them via:
- `opacity` reduction
- `rgba()` alpha-channel modification
- `--*-dim` token variants

This rule exists because the visual function of state colors —
catching the eye pre-attentively to signal "this needs
attention" — is destroyed by dimming. A muted red reads as
"unimportant red" rather than "actual problem."

**Sanctioned exceptions:**
- Background fills that *contain* a state color (e.g., a red
  alert banner with `rgba(255,71,87,0.12)` background) are
  acceptable because the background is not the signaling
  element. The state color renders at full saturation in the
  text/icon foreground; the dimmed backdrop is decorative.
- Hover-state intensifications (slightly brighter on hover) are
  acceptable. Going *darker* on hover is not.

If a surface needs a "muted variant" of a state color, the
correct fix is to revisit whether state-color is the right
treatment at all — perhaps the element should use
`--text-muted` or another non-state token instead.

---

## §4 — Typographic scale and section labels

### §4.1 The size scale

| Size | Use |
|---|---|
| 11px | Floor (IR38). Sub-text, age stamps, separators, supplementary metadata. |
| 12px | Buttons, section labels (D10), table header content, descriptive labels, badges, panel item rows. |
| 13px | Body text, table cell content. |
| 16px | Surface page titles. |
| 22px (verify) | Wordmark in unified header — sized to match logo glyph cap-height per D2. |
| 32px+ | KPI values and headline numerics (size varies per surface; weight always 700). |

Sizes outside this scale are doctrine violations. If a surface
needs a size not listed, the architect amends the scale; the
surface does not pick a number.

### §4.2 D10 — Section label spec (unified)

A single CSS class `.section-label` covers KPI tile labels, panel
titles, section headings, and table column headers. Replaces all
prior surface-specific variants (`.sum-lbl`, `.cp-title`,
`.kpi-label`, `.panel-title`, `.hud-table th`, etc.).

```css
.section-label {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}
```

This class is the only sanctioned styling for "this is a label/
heading/title for the thing below or beside it." Surfaces do not
invent local label styles.

### §4.3 Page identity block (v1.5)

A surface that represents a top-level navigational destination
(e.g., the firm-wide Dashboard) may render a **page-identity
block** in its upper-left position, occupying the layout slot
that would otherwise be a KPI card.

The page-identity block contains:
- A primary identity word (e.g., "DASHBOARD") rendered at large
  size, weight 700, in `--text-primary`. **Font is Inter per
  §2.1**, not Rajdhani — Rajdhani is reserved for the platform
  wordmark only.
- A sub-identity line (e.g., "FIRM-WIDE OVERVIEW") rendered as
  `.section-label` per §4.2.

The page-identity block is **optional** and reserved for
top-level surfaces. Detail/working surfaces (proposal-detail,
project-detail, etc.) do not use this pattern — their identity
is conveyed by the surface header text in the unified header
plus the document title in the body.

### §4.4 KPI card canonical (v1.5)

A KPI card is a discrete visual unit displaying a single
metric. The canonical KPI card has the following structure:

**Container treatment** (dashboard-derived):
- Top color-bar — semantic state OR domain identity, full width
  of card, ~3px tall, rendered at top edge of card
- Internal background — `--bg2` (one elevation tier above strip
  container `--bg1`) per §3.5
- Generous horizontal gap between cards — typically 8-12px
- Optional right-side glyph — small icon (folder, eye, flag,
  check, etc.) rendered in `--text-faint` or matched to the
  top-bar state color when applicable
- Border-radius — 6-8px to match other panel surfaces

**Internal typography** (proposal-detail-derived):
- Label uses `.section-label` per §4.2 (12px, 700, uppercase,
  `--text-muted`, letter-spacing 0.08em)
- Primary value at **26px (v1.6.1 canonical)**, weight 700,
  color per state semantic or `--text-primary` if
  informational, `--text-accent` if focal-on-panel.
  Surface-density variants are permitted (e.g., 24px for
  exceptionally tight strips, 28-32px for prominent surfaces)
  but the canonical default is 26px.
- Sub-text at 11px, weight 400, `--text-muted`
- Numeric values use `font-feature-settings: "tnum"`

**Elevation context (v1.6.1):**

The KPI strip's full elevation contract:
- **Strip wrapper** sits at `--surface-page` (`--bg0`) — the
  page-background tier. This is a two-tier-skip pattern: the
  cards visually float against the page directly, with no
  intermediate panel-tier surface beneath them.
- **Cards** sit at `--surface-content` (`--bg2`) — one tier
  above the strip wrapper, two tiers above the page background.
- When the strip is enclosed by a panel (e.g., proposal-detail's
  WBS estimator panel), the enclosing panel sits at
  `--surface-panel` (`--bg1`) per §3.5.2, with the strip
  wrapper transparent or matching `--bg0` to preserve the
  intended elevation hierarchy.

**Top color-bar usage (v1.6 refined):**

| Treatment | Used for | Token |
|---|---|---|
| State-good | State-bearing metric in good condition | `--green` per §3.6 |
| State-caution | State-bearing metric in cautionary condition | `--amber` per §3.6 |
| State-bad | State-bearing metric in bad condition | `--red` per §3.6 |
| Domain-identity | Metric representing a domain (Workflows, Forms, etc.) | Sanctioned domain color |
| Focal-informational | The single most important informational metric on the strip — typically the outcome/total a strip builds toward | `--text-accent` (cyan) |
| Non-focal informational | Supporting informational metrics that contribute to the focal outcome | `--text-faint` (muted) |

**Focal vs non-focal distinction (v1.6):**

When a KPI strip contains multiple informational metrics, only
**one** card carries the focal-informational treatment — the
metric the strip exists to communicate (the outcome, total, or
final figure). Other informational metrics on the same strip
are non-focal (supporting calculations, intermediate values,
inputs that feed into the focal value).

This distinction prevents the "many identical cyan top-bars in
a row" problem on strips composed entirely of informational
metrics. The focal card stands out via brighter top-bar; the
non-focal cards visually subordinate to it.

State-bearing metrics on the same strip continue to use
state-color treatments per §3.6 — the focal/non-focal
distinction applies only among informational metrics.

**Reference implementations:**
- Dashboard KPI strip — mix of state-bearing and informational
  cards; focal-informational treatment may apply to "Active
  Projects" or "Tasks Complete" depending on surface intent
- proposal-detail summary strip — five-to-six informational
  cards; **TOTAL** card receives focal-informational treatment;
  all others (DURATION, LABOR DAYS, HOURS, LABOR COST,
  MATERIALS) receive non-focal informational treatment.
  Operator ratified 2026-04-28; KPI container upgrade
  scheduled as CMD98.7.

### §4.5 Panel frame canonical (v1.5)

Non-KPI panels (Active Projects, Alerts, Tasks Up Next, Team
Workload, EVM Summary, Key Action Items, etc.) render with a
unified panel-frame language consisting of three coordinated
elements:

**(1) Aqua corner brackets** at the panel's four corners.
Decorative L-shaped marks rendered in `--text-accent` at low
saturation (`--cyan-dim` or `rgba(0, 210, 255, 0.4)` — exact
value per implementation). Visually frames the panel without
heavy borders.

**(2) Aqua left-bar prefix** on the panel's `.section-label`
header. Small vertical bar (typically 2-3px wide, full height
of the section-label) rendered in `--text-accent` at full
saturation. Sits flush against the left edge of the
`.section-label` text. Provides a visual hook that the eye uses
to track section headers across the page.

**(3) Right-side controls** at the section-label's row
terminus. View-All links, count badges, primary CTAs, etc.
align right; titles and identity text align left.

This is the **canonical panel-frame language for non-KPI
surfaces**. Panels that lack any of these three elements (e.g.,
panels missing corner brackets) are non-conformant and require
retrofit.

### §4.6 Empty-state pattern (v1.5)

Panels that can render empty (Key Action Items when no actions
exist, Alerts when nothing is overdue, Tasks Up Next when the
queue is clear, etc.) use a canonical empty-state treatment:

**Layout:**
- Centered glyph (icon, checkmark, or other state indicator)
  rendered at 28-36px in the panel's available vertical space
- State label below glyph in caps, weight 700, 13-14px, in
  appropriate state color
- Sub-text below state label explaining what the empty state
  means, weight 400, 11-12px, `--text-muted`

**State colors:**
- "ALL CLEAR" / success empty states → `--green`
- "NO DATA" / informational empty states → `--text-muted`
- Error / blocked empty states → `--red`

**Reference implementation:** Key Action Items "ALL CLEAR" with
green checkmark and "No open action items" sub-text.

The empty-state pattern is **always rendered** when a panel has
no content. Panels do not collapse to zero height when empty,
do not show only the section-label header, and do not display
"loading…" indefinitely.

### §4.7 Right-anchored row badges (v1.5)

Badges that occupy the right terminus of any row in any panel
align to **vertical center** of their row, regardless of row
height.

This rule exists because panels with different row heights
(e.g., Active Projects rows are taller multi-line cards; Tasks
Up Next rows are single-line) currently display their badges
at different absolute Y positions when stacked in adjacent
columns. The eye reads adjacent-but-misaligned badges as a
visual defect.

Vertical-center alignment makes any two row-types in adjacent
panels read as parallel.

**Applies to:**
- Status badges (AT RISK, IN PROGRESS, OVERDUE, NOT STARTED, etc.)
- Count indicators (3 risks, 4 overdue, etc.)
- Action affordances ("Edit", "View", chevron arrows)

### §4.8 Header count/badge sizing (v1.5)

Counts and badges that appear in panel headers and **summarize
the panel body** (e.g., the "4" count next to "ALERTS — OVERDUE"
indicating four overdue items) match the **body text size**, not
the section-label size.

Reasoning: a count of `4` rendered smaller than the row text
below it reads as "annotation about the section name." A count
that matches the row text reads as "summary of what follows" —
the operator's eye correctly anchors the count to the rows that
embody it.

**Spec:**
- Header counts/badges: 13-14px (matching panel body row text)
- Section labels themselves: 12px per §4.2 (unchanged)
- Color: state-color per §3.6 if state-bearing; `--text-accent`
  if informational

This rule does NOT apply to:
- Counts in unified-header notifications (those are independent
  of any panel body)
- Counts that are the panel's only content (no rows below)

### §4.9 Page-frame lines (v1.5)

Every surface platform-wide renders a thin frame line at the
**top edge** (immediately below the unified header) and the
**right edge** (running the full height of the page body).
These lines provide subtle structural framing without competing
visually with content.

**Spec:**
- Color: `--border` (the standard border token)
- Weight: 1px
- Position: top edge of body content, right edge of body content
- No left-edge or bottom-edge frame line (top + right only)

The page-frame lines are **doctrine-mandated for every
surface** — surfaces do not opt out. They are rendered by the
shared layout chrome (typically `hud-shell.js` or a shared body
class), not by per-surface stylesheets.

---

## §5 — Buttons

### §5.1 Base spec (D11)

All buttons share base spec; variants differ only by **color
role**, not by size or padding. Visual prominence comes from
color, not from size.

```css
.btn {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  padding: 3px 12px;
  border-radius: 6px;
  border: 1px solid;
  cursor: pointer;
  transition: background .15s, border-color .15s, color .15s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
```

Resulting button height: ~22-24px.

### §5.2 Color variants (D11)

| Class | Use | Background | Border | Text |
|---|---|---|---|---|
| `.btn` | Neutral / secondary actions | `--surface-interactive` (tier 3 per §3.5) | `--border` | `--text-primary` |
| `.btn-positive` | Positive / convert / proceed actions | `#1a6b5a` | `#2a9d7a` | `#7af0c0` |
| `.btn-primary` | Primary CTA | `--text-accent` | `--text-accent` | `#fff` |

These three are the **only** sanctioned button color variants.
Surfaces do not invent local button colors.

**Hover state:** `.btn` neutral hover background is
`--surface-interactive-hover` (tier 4). The hover treatment
provides feedback that the element is interactive and
responding. This is the elevation-tier mechanic from §3.5
applied to button affordance.

```css
.btn:hover {
  background: var(--surface-interactive-hover);
}
```

`.btn-positive` and `.btn-primary` color variants have their
own hover treatments derived from their base colors (typically
+10% lightness on background); v1.4 does not lock these
specifically — they remain at the discretion of the retrofit
brief authoring.

### §5.3 Contextual buttons (D12)

Contextual actions (Load Template, + Add Discipline, + Add Task,
Open SOW Builder, Add to Estimate, etc.) **all use the `.btn`
family** per §5.1/§5.2. Surface-local button classes
(`.disc-add-btn`, `.add-task-btn`, `.cb-btn`,
`.template-bar button`, etc.) are retired during retrofit and
replaced with `.btn` variants.

**Dropdown selectors that function as buttons** (e.g., "Load
Template…") are styled to match button height, padding, border,
and font treatment — they look like buttons with a chevron, not
like form `<select>` elements.

### §5.4 State-toggle buttons (D11.1)

When a button represents a togglable state (filter pills, view
selectors, status filters), its **active** state adopts the
color identity of the domain it represents:

- Workflow-domain filter pill, active → purple-tinted background,
  purple border, light-purple text
- Form-domain filter pill, active → green-tinted background,
  green border, light-green text
- Status filter (AT-RISK, BLOCKED, etc.) inherits the
  corresponding state color

Inactive state: standard `.btn` neutral treatment.

State-toggle buttons share the `.btn` size and shape per §5.1 —
the domain-color treatment applies only to the active state's
background, border, and text colors.

### §5.5 Add-action button placement (D11.2, v1.1; split v1.3)

Buttons whose action is "add a new item to a list" appear in
two distinct placements, each with its own treatment:

#### §5.5a — Foot-of-panel add buttons

When an add-action button sits **at the foot of the list it
extends** (e.g., `+ Add Discipline` at the bottom of the
discipline sidebar; `+ Add Task to {discipline}` at the bottom
of the task table; `+ Add Material` at the bottom of the
materials list), the button uses `.btn--dashed`:

```css
.btn--dashed {
  border-style: dashed;
  border-width: 2px;
  border-color: var(--border-act);
  width: 100%;
  justify-content: center;
}
```

The dashed border + 2px weight + full-width layout produces a
visually distinct affordance — "this extends the list above"
— that does not compete with action buttons elsewhere on the
page.

This modifier is in addition to `.btn` and inherits all base
spec apart from `border-width` (which v1.3 raises to 2px from
the `.btn` base of 1px) and `border-style` (dashed instead of
solid).

#### §5.5b — Inline-with-header add buttons

When an add-action button sits **inline with a section header**
(e.g., the `+ Add Task` button in the right side of a discipline
panel header, sharing horizontal space with the discipline name
and risk-flag badges), the button uses **plain `.btn`** with
**no special modifier**.

The inline placement and the "+" glyph in the label communicate
the add-action affordance; no additional visual treatment is
needed. `.btn--dashed` is **not applied** to inline-with-header
add buttons — its full-width layout would force the header row
to wrap and visually flatten the section title.

#### Selection rule

If an add-action button **occupies a row of its own at the
bottom of a list or panel** → §5.5a (`.btn--dashed`).

If an add-action button **shares a row with other content
(typically a section title)** → §5.5b (plain `.btn`).

A surface does not mix variants for buttons in the same role
context; if a panel has both placements (a panel-head
"+ Add Task" and a per-discipline footer "+ Add Task to {name}"),
each follows its own placement rule independently.

### §5.6 Icon-only button modifier (v1.2)

Buttons containing **only an icon glyph** (no text label) — such
as modal close buttons, expand/collapse toggles, dismiss buttons —
use the `.btn--icon-only` modifier. The modifier reshapes the
button to a square aspect ratio with centered glyph.

```css
.btn--icon-only {
  width: 26px;
  height: 26px;
  padding: 0;
  justify-content: center;
}
```

The icon glyph itself renders at `font-size: 14px` for visibility
within the 26×26 button square. Icon glyphs use either Unicode
characters (`×`, `⌃`, `⌄`) or inline SVG; doctrine does not
prescribe icon system choice.

This modifier is in addition to `.btn` and inherits all base
spec (font-family, transition, border-radius, color variant via
`.btn` / `.btn-positive` / `.btn-primary`). Icon-only buttons
typically use the neutral `.btn` color variant.

**Reference use:** modal close button (introduced in CMD98
proposal-detail retrofit), formalized in v1.2.

### §5.7 Interactive element shadow (v1.4)

In addition to the elevation-tier color treatment from §3.5,
all `.btn` family elements carry a subtle drop shadow that
provides additional affordance signal. The shadow is calibrated
to register against the dark theme without producing muddy or
overwrought visual weight.

```css
.btn {
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.4),
              inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
.btn:hover {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5),
              inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
```

The shadow is two-part:
- **Outer drop shadow** (`0 1px 0` at rest, `0 2px 4px` on
  hover): grounds the button visually, separating it from the
  surface below.
- **Inner top highlight** (`inset 0 1px 0` with low-alpha
  white): catches the eye as if the button has a slight bevel,
  reinforcing the "this is a raised surface" cue.

The shadow scales with hover state (deeper drop, brighter inner
highlight), reinforcing the elevation-tier increase from §5.2.

**Note on dark-theme considerations:** drop shadows on dark
backgrounds are subtle by necessity — strong shadows produce
muddy halos. The values above are tuned for `--bg0` page
background; if the platform later introduces a light theme, the
shadow values revisit (possibly via a tokenized
`--shadow-button` reference that adapts to theme).

**Applies to:** all `.btn` family elements (`.btn`,
`.btn-positive`, `.btn-primary`, plus modifiers `.btn--dashed`,
`.btn--icon-only`). The shadow is on the base `.btn` rule;
modifiers inherit unless they explicitly override.

### §5.8 Avatar canonical (v1.5)

Avatar elements appear in multiple surfaces (unified header
operator block, panel rows showing project managers and
assignees, Team Workload roster, audit log entries, etc.). The
canonical avatar treatment applies platform-wide.

**Rendering rule:**
- If the user has a profile photo, render the photo
- If no photo is available, render the user's initials on a
  colored background (the user's name-derived color, or
  `--bg3`-equivalent neutral if no per-user color is assigned)

**Sizing:**
- Default: 28×28 pixels (slightly larger than the original
  hud-shell 24×24 to accommodate two-character initials cleanly)
- Header context: 32×32 pixels (more prominent for the operator's
  own avatar in the unified header)
- Dense list context: 24×24 pixels (e.g., audit log feeds where
  many avatars appear in close proximity)

**Shape:**
- Default: square with 4px border-radius (matches the slight
  radius treatment on `.btn` and panel surfaces, ties avatars
  visually into the platform's geometry)
- Round-avatar surfaces (e.g., the unified header operator
  block) may use full circle (`border-radius: 50%`) — this is
  a sanctioned variant for header use only

**Initials rendering** (when no photo):
- Two characters maximum (first letter of first name + first
  letter of last name; e.g., "RW" for Ron White)
- Font: Inter per §2.1, weight 600
- Size: scaled to fit the avatar dimensions (typically ~12-13px
  for 28×28 avatar)
- Color: `--text-primary` for high-contrast readability against
  the avatar background

**Photo rendering:**
- Cropped to the avatar's bounding box
- Object-fit: cover (so non-square photos don't distort)
- Same border-radius as the initials variant

**Reference implementations:**
- Unified header operator block — round 32×32 with photo or
  cyan-bg + initials
- Active Projects PM column — square 28×28 with photo or
  initials
- Tasks Up Next assignee — square 24×24 (dense list)
- Team Workload roster — square 28×28 with photo or initials

### §5.9 UI.gauge canonical (v1.6.1)

The shared gauge component `UI.gauge` in `/js/ui.js` is the
**canonical gauge implementation** for the platform. Every
surface that renders gauges (current and future) calls
`UI.gauge`. Surfaces do NOT implement local gauge replacements.

**Signature:**

```javascript
UI.gauge(value, max, color, label, displayText)
```

**Doctrine-conformant typography requirements:**
- Center-text font: Inter per §2.1 (NOT mono-family fonts;
  Share Tech Mono and similar are retired per D9)
- Center-text size: minimum 11px per IR38 floor; recommended
  13-14px for primary gauge values
- Sub-label below gauge: minimum 11px per IR38; uses
  `.section-label` per §4.2

**Color semantics:** the `color` parameter accepts state-color
tokens per §3.6 — `--green`, `--amber`, `--red` for state-bearing
metrics; `--text-accent` for informational metrics. Surfaces
compute the appropriate color per metric and pass it in.

**Proportionality contract:** `UI.gauge` renders an arc whose
length is proportional to `value / max`, clamped to `[0, 1]`.
Surfaces that need different scales pass different `max` values
(e.g., CPI/SPI typically use `max = 2` so a value of 1.0 renders
at 50% arc-closed). Surfaces do NOT post-process the rendered
arc; the proportionality is `UI.gauge`'s responsibility.

**Pre-CMD99.2 historical context:** dashboard.html (post-CMD99)
introduced a local `renderGauge()` function bypassing `UI.gauge`
because the shipped `UI.gauge` violated D9 (used `font-mono`)
and IR38 (label at 9px). CMD99.2 corrects `UI.gauge` typography
and retires the dashboard local replacement. From CMD99.2
forward, `UI.gauge` is the only sanctioned gauge implementation.

---

## §6 — Markup and styling discipline

### §6.1 D5 — Visual segmentation ceiling

Within a single semantic element (a ticker item, a card row, a
button, a panel row), the number of distinct visual treatments
is bounded.

**Practical guidance pending calibration:** keep distinct
treatments (color shifts + weight shifts combined) to **3 or
fewer per single semantic unit**. Excessive variation reads as
font-mixing even when the font family is constant.

The specific numeric ceiling will be revised after 2-3 more
violation examples calibrate the breakpoint precisely.

### §6.2 D4 — JS-generated markup uses CSS classes, not inline styles

Anywhere markup is generated in JavaScript (template literals,
`innerHTML`, DOM construction), styling **must reference CSS
classes**, not inline `style=""` attributes.

**Forbidden:**

```js
// Forbidden — inline color, font, size in JS-generated markup
element.innerHTML = `<span style="color:#00d2ff;font-size:10px;
  font-family:'Share Tech Mono',monospace">${text}</span>`;
```

**Correct:**

```js
// Correct — class reference, styles defined in stylesheet
element.innerHTML = `<span class="ticker-actor">${text}</span>`;
```

This rule is necessary because token refactors, size-floor sweeps,
and family changes do not reach inline-styled JS-generated markup.
Inline styling in JS strings is structurally identical to surface-
level `!important` overrides — both are surfaces refusing to
participate in the shared system.

**Permitted exceptions — data-driven inline styles only:**
inline `style=""` is acceptable solely for **data-driven values
that cannot be expressed as static classes** — per-record colors,
computed widths/percentages, computed positions. Examples:
`style="background:${discipline.color}"`,
`style="width:${percent}%"`. The forbidden patterns remain
forbidden even in JS-generated markup: inline color/font/size that
references a doctrine **role token** is a violation, because role
tokens are exactly what classes exist to encode.

**Applies to:** every JS file that generates DOM (`ticker.js`,
`hud-shell.js` injected fallbacks, `sidebar.js`, all `mw-*` files,
all `cdn-*` files, any future component built in JS).

**Known pre-existing violations (registered 2026-04-28, v1.7):**

The following Compass surfaces violate §6.2 with inline panel-tier
backgrounds in JS-rendered DOM. They predate v1.2's rule and were
unaudited until the v1.7 review. Migration sequenced via CMD-A
(see §12 entry 11a):

| Surface | Owner file | Inline background | Disposition |
|---|---|---|---|
| Recommended Sequence panel container | `mw-sequence.js` line 299 | `rgba(0,210,255,.03)` (advisory-tint, rejected per §3.5) | **Migrated CMD-A 2026-04-28** — class `.cmp-panel-recseq` in `/css/hud.css` consumes `var(--surface-panel)`. Cyan left-border preserved per §3.5.7 enumerated signals. |
| `#mw-delta-strip` ("Since last login") | `mw-core.js` line 776 | `rgba(0,210,255,.03)` (advisory-tint, rejected) | **Migrated CMD-A 2026-04-28** — ID-based selector `#mw-delta-strip` in `/css/hud.css` consumes `var(--surface-panel)`. Display/padding/border-bottom retained inline (display toggles data-driven). |
| `#mw-coc` Chain of Custody container | `mw-core.js` line 1219 | `rgb(6, 12, 24)` (hardcoded near-`--bg0`) | **Migrated CMD-A 2026-04-28** — ID-based selector `#mw-coc` in `/css/hud.css` consumes `var(--surface-panel)`. Audit-discovered: sticky inner header (line 1223) was hardcoded `#060a10`; migrated to `.cmp-panel-coc__header` consuming `var(--surface-content)` per §3.5.3 elevation discipline (sub-section sits one tier deeper). |
| `#mw-diag-tl-header` diagnostic timeline header | `mw-core.js` line 1076 | `rgb(6, 10, 16)` (hardcoded `--bg0`) | **Migrated CMD-A 2026-04-28** — class `.cmp-diag-tl-canvas-chrome` in `/css/hud.css` consumes `var(--surface-page)`. Per brief §5: header sits inside `#mw-diag-tl-wrap` canvas at `--bg0` (deliberate dot-grid spatial-context backdrop), so substance is canvas-tier (not panel-tier); §6.2 violation was form-only. Visual preserved. Sibling unnamed corner cell (line 1074, same hardcoded `#060a10`) migrated with the header per §6 audit-discovered offender clause. |

CMD-A also performs a Compass-wide sweep for panel-tier surfaces
not named here. Per-record/data-driven inline styles (badge fills,
status pills, computed widths, hover states on rows) remain
permitted under the §6.2 data-driven exception.

A temporary `var(--bg1)` patch was applied to the Recommended
Sequence panel during the v1.7 drafting session to unblock visual
parity with `dashboard.html`. The patch is doctrine-conformant in
substance but the architectural problem (panel chrome in a
behavior file) remains. CMD-A relocates the panel chrome to a
class-based definition in `/css/hud.css`, completing the
migration.

### §6.3 No `!important` overrides on shared classes

Surface-level stylesheets (inline `<style>` blocks in HTML files,
or surface-specific CSS) **do not override** shared-system
classes (`.btn`, `.section-label`, `.kpi-card`, etc.) with
`!important`. If a surface needs a different treatment, it gets a
**modifier class** (`.kpi-card--dense`, `.btn--icon-only`) that
lives in the shared stylesheet.

The override pattern is the divergence-tax in CSS form.

---

## §7 — Visual hierarchy in dense panels (D14)

When a panel contains text at three or more hierarchical levels
(item / subtotal / total, or item / category / total), the design
**must combine color and weight together**. Color alone or weight
alone is insufficient at three-plus levels.

**v1.1 expansion:** the original §7.1 reference table assumed
adjacent visual scaffolding (per-row color dots, percent bars,
indentation) was carrying part of the separation work. Panels
without that scaffolding need item names lifted one color tier
or they collapse into the section label above them. §7.1 is now
split into two variants; §7.2 selects between them.

### §7.1a — Scaffolded variant (reference: cost-summary panel)

Use this variant when **each item row carries adjacent visual
scaffolding**: a colored dot, a percent bar, an icon, a status
indicator, an indented hierarchy marker, or any other graphic
element that visually separates the row from its neighbors and
from the section label above it.

Pattern: section label → item rows (with bar/dot) → subtotal →
grand total.

| Category | Color (§3.2) | Weight |
|---|---|---|
| Section label (e.g., LIVE COST SUMMARY) | `--text-muted` | 700 |
| Item name (e.g., Mechanical design) | `--text-muted` | 400 |
| Item value (e.g., ¥6,856) | `--text-body` | 600 |
| Subtotal label (e.g., Labor subtotal) | `--text-body` | 500 |
| Subtotal value (e.g., ¥31,444) | `--text-primary` | 600 |
| Grand total label (e.g., Base estimate) | `--text-primary` | 600 |
| Grand total value (e.g., ¥66,444) | `--text-accent` | 700 |

The eye walks the panel top-to-bottom and the importance gradient
is unambiguous. Item-name color matches the section label because
the bar/dot adjacency carries the row separation.

**Note on subtotal-value weight (v1.1 correction):** weight 600
(not 700) for subtotal values, to widen the gap between subtotals
and the grand total. The v1.0 spec used 700 here; CMD98 testing
showed subtotals competing with the grand total for focal-point
status. Weight 600 preserves the "primary tier" color identity
while leaving 700 unique to the grand total.

### §7.1b — No-scaffold variant (reference: materials panel)

Use this variant when item rows are **plain text-only rows** with
no adjacent dots, bars, icons, or other graphic separators. The
item name must lift one color tier so the label-vs-item color
contrast does the row-separation work the scaffold would have
done.

Pattern: section label → item rows (text only) → subtotal →
grand total.

| Category | Color (§3.2) | Weight |
|---|---|---|
| Section label (e.g., MATERIALS) | `--text-muted` | 700 |
| Item name (e.g., Servo motors) | `--text-body` | 400 |
| Item value (e.g., ¥8,000) | `--text-body` | 600 |
| Subtotal label (e.g., Materials subtotal) | `--text-body` | 500 |
| Subtotal value (e.g., ¥35,000) | `--text-primary` | 600 |
| Grand total label (e.g., Base estimate) | `--text-primary` | 600 |
| Grand total value (e.g., ¥66,444) | `--text-accent` | 700 |

The only delta from §7.1a is the **item-name color**: lifted from
`--text-muted` to `--text-body`. Item-value color is unchanged
(`--text-body`/600). The contrast between section label
(`--text-muted`) and item rows (`--text-body`) carries the
separation work that the per-row scaffold carries in §7.1a.

### §7.2 — Variant selection rule

A panel uses §7.1a if **every item row** in the panel renders
with adjacent visual scaffolding (dot, bar, icon, indent marker,
status pill). A panel uses §7.1b if **any item row** lacks that
scaffolding.

A panel does not mix variants between rows. If some rows in the
same panel have scaffolding and others don't, the panel uses
§7.1b uniformly — the absence of scaffolding on any row
demotes the entire panel's contrast budget to the no-scaffold
mapping.

If a single surface contains **both** a scaffolded panel and a
no-scaffold panel (e.g., proposal-detail's Live Cost Summary and
Materials sit side-by-side in the same column), each panel
independently selects its variant. The two variants coexisting in
one viewport is intentional: each is internally consistent, and
their structural difference (scaffold present vs. absent) is what
justifies their slightly different item-name colors.

### §7.3 — Pattern-extension principle

D14 generalizes beyond financial panels. Any dense panel with
multiple hierarchical levels — workload panels, alerts panels,
metric breakdowns, status rollups — applies the same color-tier-
plus-weight discipline using §7.1a or §7.1b per §7.2.

When a new panel pattern doesn't fit either variant cleanly
(e.g., panels with four hierarchical levels, panels where the
"section label" is absent, panels where items have categorical
groupings), the architect amends §7 with the new mapping. The
surface does not invent it locally.

### §7.4 — KPI card-strip vs inline metadata strip (v1.5)

Two distinct patterns exist for "metric strips at the top of a
surface":

**Card-strip pattern (KPI cards per §4.4):**
- Used on **"show me the state of my world" surfaces** — the
  firm-wide Dashboard and other top-level overview surfaces
- Each metric is a discrete focal card with its own container
  treatment (top color-bar, elevated background, gap)
- Each metric is intended to be glanceable and individually
  important
- Operators scan card-by-card looking for the metric that
  needs attention

**Inline metadata strip pattern:**
- Used on **"tell me about this specific thing" surfaces** —
  detail-headers like project-detail, prospect-detail (and
  proposal-detail's summary strip is structurally closest to
  this category, though currently rendered as cards)
- Metrics are page-context metadata, not focal indicators —
  they describe what's-being-viewed, not summarize the world
- Layout: horizontal strip with label-then-value pairs,
  separated by thin dividers or generous padding rather than
  card containers
- Typography: label uses `.section-label`; value uses 13-15px
  weight 600; both render at one elevation tier (no internal
  card backgrounds, no top color-bars)
- State coloring on values still applies per §3.6

**Pattern selection rule:**
- Surface's primary purpose is "summarize the state of the
  firm/team/portfolio" → card-strip
- Surface's primary purpose is "summarize this specific entity
  for the operator" → inline metadata strip

A surface does not mix patterns within the same strip. If a
surface has multiple metric strips serving different purposes,
each strip independently selects the pattern that fits its
purpose.

**Reference implementations:**
- Dashboard KPI strip — card-strip canonical
- proposal-detail summary strip — card-strip per §4.4 (operator
  ratified 2026-04-27; KPI container upgrade scheduled as
  CMD98.7)
- project-detail entity-detail strip — inline metadata canonical
  (current rendering pre-doctrine; conforms to pattern intent)

---

## §8 — Glyph + text pairing (D1)

Wherever a glyph (logo, icon, avatar, indicator dot) sits adjacent
to text, the pair shares a **single optical horizontal axis**.
Specifically:

- Text **cap-height equals glyph height**, not bounding-box
  equals bounding-box.
- Default flexbox `align-items: center` is **insufficient** —
  text bounding boxes include descender space, so the optical
  center of caps-only text sits above the geometric center.
- Explicit alignment to the optical baseline is required, either
  via line-height matched to the glyph container's height (so
  cap-height self-centers) or via an explicit `transform:
  translateY()` nudge.

### §8.1 Reference implementation — platform wordmark (D2)

The platform wordmark "ProjectHUD" in the unified header:

- **Cap-height: 24px**, matched to the 24px logo glyph rendered
  by `hud-shell.js`.
- At Rajdhani 700's ~0.70 cap-to-em ratio, this resolves to
  **font-size approximately 32-34px**. Exact value confirmed
  empirically against the rendered logo at retrofit time.
- **Color-split per D3:** "Project" in `--text-accent`, "HUD" in
  `--text-primary`. Single direction; no inversion.

---

## §9 — Text case rules (D13)

| Text type | Case | Examples |
|---|---|---|
| Section / tile / panel labels (§4.2) | **ALL CAPS** | DURATION, LIVE COST SUMMARY, TASK |
| Buttons (§5) | **Title Case** | Save as Template, Add Task, Open SOW Builder |
| Descriptive labels and sub-text | **Title Case** | Calendar Days, Labor Subtotal, At Role Rates |
| Body prose, table cell content | Sentence case | "Develop test fixture", "Mechanical design subtotal" |
| Brand wordmark | As authored | ProjectHUD |

### §9.1 Title Case definition

Capitalize all words **except**: articles ("a", "an", "the"),
short prepositions ("of", "to", "in", "on", "at", "for", "by",
"with", "as"), and short conjunctions ("and", "or", "but",
"nor") — **unless** they are the first or last word of the label.

Examples:
- "Save as Template" (not "Save As Template")
- "Convert to Project" (not "Convert To Project")
- "Open SOW Builder" (capitalize SOW as the proper noun /
  acronym)

### §9.2 Body-context suffix rule (v1.1)

When a label is constructed by **suffixing a generic word** to
user-supplied content (e.g., a discipline name + "subtotal", a
project name + "review"), the suffix follows the **case of the
user content**, not Title Case rules. The suffix is being read as
a continuation of the body content, not as a standalone label.

Examples:
- User discipline "Mechanical design" + suffix "subtotal" →
  "Mechanical design subtotal" (lowercase "subtotal" because the
  user content is sentence case)
- User discipline "RF Hardware" + suffix "subtotal" → "RF
  Hardware subtotal" (suffix still lowercase; the user content's
  internal capitalization is preserved but doesn't promote the
  suffix)

This rule exists because mixed-case constructions
("Mechanical design Subtotal") read as typos to viewers who don't
know the case-source rule. The suffix takes the surrounding
content's register.

Standalone subtotal/total labels in panels (not suffixed to user
content) follow Title Case per the descriptive-labels row above:
"Labor Subtotal", "Materials Subtotal", "Base Estimate".

---

## §10 — Deferred work

Decisions logged but not specified in current doctrine. No
committed version for resolution; addressed when concrete need
surfaces.

- **Non-text color token role aliases (§3.3).** Backgrounds,
  borders, and state colors get the same Layer-1 + Layer-2
  treatment as text. Deferred to a later doctrine pass to avoid
  stacking scope.
- **D5 numeric calibration.** The "3 or fewer treatments per
  semantic unit" guidance is a placeholder; precise number set
  after 2-3 more violation examples accumulate.
- **§7 pattern extensions.** §7.1a and §7.1b cover scaffolded
  and no-scaffold item/subtotal/grand-total panels. Future
  patterns to add when encountered: four-tier hierarchies,
  panels without a section label, panels with categorical
  groupings (subheaders within a panel), panels with mixed
  numeric/categorical content.
- **Sub-brand wordmark treatment.** Compass / Cadence / Aegis
  inherit Inter per §2.1; whether they get any color-split or
  display-face treatment is TBD.
- **JetBrains Mono reactivation criteria (§2.4).** Specific
  thresholds for when Inter tabular figures are insufficient
  and JetBrains Mono should be enabled for a surface.
- **Layout, spacing, and component composition.** This doctrine
  prescribes visual atoms, not page structure. A separate layout
  doctrine may follow if patterns warrant it.

---

## §11 — Amendment procedure

This doctrine is amended by architect proposal + operator
ratification. Proposed amendments are versioned (v1.0 → v1.1
→ etc.). Surfaces continue to operate under the most recent
ratified version until retrofit.

When a surface retrofit is in flight and the doctrine is amended
mid-retrofit, the in-flight retrofit conforms to the version
locked at the start of its brief; the next surface picks up the
amended doctrine. This avoids mid-retrofit scope creep.

**v1.1/v1.2/v1.3/v1.4/v1.5/v1.6 retrofit-application note:**
proposal-detail.html (CMD98) shipped under v1.0. Subsequent
amendments affecting that surface are applied via discrete
follow-up briefs:

- **CMD98.1** — pure regression sweep for column-width fixes
  surfaced during visual review (no doctrine application).
- **CMD98.5** — `hud_role_name` schema bug fix (functional, not
  doctrine; shipped before CMD98.2 to unblock task creation
  required by CMD98.2's smoke test).
- **CMD98.2** — application of v1.1 amendments (§7.1a/b split,
  §7.1a subtotal-weight correction, §9.2 body-context suffix
  rule, §5.5 dashed add-action affordance) and v1.2 amendments
  (§5.6 icon-only button modifier).
- **CMD98.3** — application of v1.3 §5.5 split plus the
  template-bar layout regression plus the v1.4 §5.2/§5.7
  button-affordance correction.
- **CMD98.6** — full v1.4 elevation-tier retrofit on
  proposal-detail. Audits every panel, content section, nested
  surface, and modal/overlay against the §3.5 elevation
  discipline.
- **CMD98.7** (reserved) — proposal-detail KPI container upgrade
  to v1.5 §4.4 canonical with v1.6 focal/non-focal informational
  treatment. Adds top color-bars, internal background elevation,
  gaps, and optional right-side glyphs. Adds **MATERIALS** as a
  sixth KPI card. TOTAL receives focal-informational treatment;
  other five cards receive non-focal informational treatment.
  Brings proposal-detail KPIs in line with dashboard's canonical.

Briefs ship sequentially with operator verification between, per
the multi-issue post-deploy guidance.

**Note on CMD98.3 expanded scope (v1.3 + v1.4 partial):** CMD98.3
bundles three layout-related fixes that surfaced during CMD98.2
visual review. Bundling is justified because all three are
layout-only CSS fixes touching `/css/hud.css` `.btn`-family
rules and `proposal-detail.html` markup.

**Note on CMD99 expanded scope (v1.5 + functional):** CMD99
bundles three concerns per operator decision — full v1.5
doctrine retrofit, gauge arc proportionality fix (functional
defect), and footer strip with version display
(`hud-shell.js` change with cross-surface impact). Bundling is
justified because the gauge fix is intrinsic to the EVM panel
that v1.5 doctrine targets, and the footer strip is structural
chrome that v1.5's page-frame discipline (§4.9) covers
adjacently.

The original v1.0 retrofit's scope is **not** modified
retroactively; v1.1/v1.2/v1.3/v1.4/v1.5 are forward-only via
discrete briefs.

---

## §12 — Retrofit sequencing

Retrofit order is determined by the architect in coordination
with the operator. Current sequence (subject to change):

1. **proposal-detail.html (CMD98)** — first adopter under v1.0;
   shipped 2026-04-26.
2. **proposal-detail.html (CMD98.1) — regression sweep.**
   Column-width fixes and other post-deploy regressions
   surfaced during CMD98 visual review. **Pure bug-fix scope; no
   doctrine application.** Brief authorizes only the regression
   fixes named within it. Shipped 2026-04-27.
3. **proposal-detail.html (CMD98.5) — `hud_role_name` schema
   bug fix.** Pre-existing production bug discovered during
   CMD98.1 testing; ships before CMD98.2 because CMD98.2's
   smoke test requires a working Add Task. Functional, not
   doctrine. Shipped 2026-04-27.
4. **proposal-detail.html (CMD98.2) — v1.1/v1.2 doctrine
   application.** Applies §7.1a/b split, §7.1a subtotal-weight
   correction, §9.2 body-context suffix rule, §5.5 dashed
   add-action affordance, §5.6 icon-only button modifier. **Pure
   doctrine-application scope; no functional or layout changes.**
   Shipped 2026-04-27.
5. **proposal-detail.html (CMD98.3) — v1.3 §5.5 split +
   template-bar layout regression + v1.4 §5.2/§5.7 button
   affordance correction.** Reverts panel-head "+ Add Task" to
   plain `.btn` per §5.5b; bumps foot-of-panel `.btn--dashed`
   border to 2px per §5.5a; fixes the discipline-sidebar
   template-bar overflow regression; updates `.btn` neutral
   background to `--surface-interactive` (= `--bg3` per new
   v1.4 elevation system) and adds `--bg3`'s corrected value;
   adds v1.4 §5.7 button shadow. Bundled per the rationale in
   §11.
6. **proposal-detail.html (CMD98.6) — full v1.4 elevation-tier
   retrofit.** Audits every panel, content section, nested
   surface, and modal/overlay against the §3.5 elevation
   discipline. Adds the full `--surface-*` role aliases to
   `/css/hud.css`. Largest surface-elevation refactor of the
   proposal-detail arc.
7. **dashboard.html (CMD99)** — canonical reference page; most
   visible surface; highest scrutiny. **Bundles three concerns
   per operator decision:** (a) full v1.5 doctrine retrofit
   covering all twelve panels and the unified header chrome,
   (b) gauge arc proportionality fix in EVM Summary panel
   (functional defect — gauge arcs currently render at fixed
   proportions regardless of value), (c) footer strip with
   version display per §4.9 page-frame discipline
   (`hud-shell.js` change with cross-surface impact). Single
   work-cycle. Adopts v1.5 directly; serves as the canonical
   reference for all subsequent surface retrofits.
8. **proposal-detail.html (CMD98.7)** — KPI container upgrade
   to v1.5 §4.4 canonical with v1.6 focal/non-focal
   informational treatment refinement. Adds top color-bars,
   internal background elevation, generous gaps, and optional
   right-side glyphs to proposal-detail's currently-divergent
   KPI summary strip. Adds **MATERIALS** as a sixth KPI card
   (per operator request 2026-04-28; surfaces existing
   `getTotalMaterialCost()` data). Applies focal-informational
   treatment to TOTAL card; non-focal informational treatment
   to DURATION, LABOR DAYS, HOURS, LABOR COST, MATERIALS.
   Brings proposal-detail's KPIs in line with dashboard's
   canonical treatment. Sequenced after CMD99 so the canonical
   reference is locked before downstream conformance work.
9. **proposal-detail.html (CMD98.8) — currency literal fix.**
   The `fmtCost()` helper hardcodes `'¥'` as the currency symbol
   across proposal-detail (and likely other surfaces). Operator
   confirmed 2026-04-28 this is a defect, not a feature. CMD98.8
   audits and fixes the currency literal platform-wide,
   replacing `¥` with `$`. Cross-surface scope; operator runs
   browser smoke-test to verify no `¥` remains visible
   anywhere.
10. **Cross-surface infrastructure cleanup (CMD99.2).** Bundles
    three concerns intrinsically coupled to shared infrastructure:
    (a) `UI.gauge` typography correction in `/js/ui.js` per v1.6.1
    §5.9 — Inter font, IR38 11px floor compliance — and retirement
    of dashboard's local `renderGauge()` introduced in CMD99 in
    favor of the corrected canonical;
    (b) `.panel { background: var(--bg2) }` correction in
    `/css/hud.css` to `var(--surface-panel)` per v1.6.1 §3.5.6,
    and retirement of proposal-detail's surface-local
    `#panel-wbs { background: var(--bg1) }` override introduced
    in CMD98.7;
    (c) ratification work in surfaces that had local workarounds
    for these defects.
    Cross-surface scope. Bundle justified on grounds of intrinsic
    coupling between the three concerns (all are corrections of
    pre-doctrine artifacts that produced surface-local divergence
    workarounds), and shipping coherence.
11. **Compass** (compass.html and downstream views).

    11a. **Compass §6.2 violation cleanup (CMD-A).** Doctrine-
        application kickoff for the Compass retrofit. Audits all
        Compass-rendered JS surfaces (`mw-core.js`, `mw-tabs.js`,
        `mw-events.js`, `mw-sequence.js`, scripts loaded from
        `/scripts/`) for inline panel-tier backgrounds in violation
        of §6.2. Migrates the four surfaces named in the §6.2
        violations register (Recommended Sequence panel,
        `#mw-delta-strip`, `#mw-coc`, `#mw-diag-tl-header`) plus
        any additional offenders surfaced by the audit. Migration
        target: class-based panel definitions in `/css/hud.css`
        consuming `var(--surface-panel)` per §3.5.2. Retires the
        cyan-wash advisory tint per §3.5.7. Pure doctrine-
        application scope; no functional or layout changes.
        Sequenced before broader Compass retrofit work so the
        rest of CMD-Compass operates on token-driven surfaces.
12. **Cadence** (cadence.html — Library, Simulator, Instances).
13. **Pipeline** (pipeline.html — list view, plus
    prospect-detail.html).
14. **project-detail.html** — full doctrine retrofit. Pre-doctrine
    surface; uses inline metadata pattern per §7.4 for
    entity-detail header strip.
15. **User Management.**
16. **Aegis** (pending its own architecture review per CMD96
    hand-off).

Each retrofit ships as a discrete CMD with its own brief and
hand-off. Retrofits do not bundle. Bug-fix retrofits and
doctrine-application retrofits do not bundle even on the same
surface — this preserves the multi-issue post-deploy guidance
of one fix per work-cycle.

**Three exceptions to the no-bundle rule** are documented in §11:
CMD98.3 (v1.3 + v1.4 partial doctrine bundle), CMD99 (v1.5
doctrine + functional gauge fix + footer strip bundle), and
CMD99.2 (UI.gauge + .panel + ratification cleanup bundle). All
three exceptions are justified on grounds of intrinsic coupling
between the bundled concerns and shipping coherence.

---

*End of ProjectHUD Style Doctrine v1.7.*
