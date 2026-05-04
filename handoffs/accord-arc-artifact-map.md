# Accord Arc Artifact Map

**Purpose:** Focused inventory of all artifacts produced across
the multi-session Accord architecture arc. This is a session-
arc map, distinct from the broader `projecthud-file-inventory-v2.md`
which catalogs the production codebase. Use this when picking up
the Accord arc; use the inventory v2 when researching production
code surfaces.

**Last updated:** 2026-05-04 afternoon (end of v3b-4 session)

---

## Sessions to date

| Date | Session label | Output character |
|---|---|---|
| 2026-04-29 | Compass closeout | Brief-driven defect remediation |
| 2026-05-04 morning | Module Emergence + naming | Vision-stage, prototype v3a |
| 2026-05-04 afternoon | v3 iteration + lifecycle | Vision-stage, prototype v3b → v3b-4 |

The arc began as a feature ("Meeting Minutes") and accreted
through Module Emergence into a full module ("Accord"). Future
sessions may continue the arc in vision-stage mode, or pivot to
architecture-brief drafting and build commissioning.

---

## §1 — Vision documents

These describe what Accord IS at the vision level. Read these
first when picking up the arc.

| File | Lines | Purpose |
|---|---|---|
| `scenario-walkthrough-meeting-minutes-collaborative.md` | ~431 | The master vision document. 12 numbered sections walking through a complete collaborative meeting from open to async publication. 21 explicit DECISION POINT markers. The architectural source of truth for what Accord is and how it behaves. Cast: Ron White (organizer), Angela Kim (scribe), Vaughn (CTO), three others. |
| `accord-roadmap-v3a.md` | ~296 (rev 2) | Feature enumeration mapped to the 12 walkthrough sections. Each feature carries a verdict: DONE / MOCKUP / BUILD / HYBRID. Top of document carries the "private composers + structured commits" doctrine candidate. Counts at session close: ~27 DONE, ~31 MOCKUP, ~40 BUILD. |

## §2 — Prototype iterations

The prototype is a single self-contained HTML file (~7600+ lines)
that has evolved across iterations. Each version supersedes the
prior; only the latest (v3b-4) is in current use.

| Version | Lines | Defining changes |
|---|---|---|
| `accord-prototype-v3a.html` | ~5300 | Initial Accord brand identity. Six chairs icon. Organizer in header. Three-state presence dots (gray/amber-pulsing/green). LIVE CONNECT control with subscribe dropdown. Broadcast-only chat panel adapted from Christopher Staples's DevChat in Proxy Advisory's App.jsx. Minutes archive tab. Action assignment composer. |
| `accord-prototype-v3b.html` | ~6000 | Agenda mutations + archive + reorder + filter+sort bundle. ACTIVE/ALL toggle in rail. CoC-aware archive vs hard-delete distinction (meeting-state dependent). Drag-and-drop reordering for threads + agenda items. Action items filter+sort row (§9 from roadmap). |
| `accord-prototype-v3b-2.html` | ~6100 | Refinements: pencil removed from rail rows (one pencil-location, in capture-target). Trashcan replaced by × glyph. "+ new agenda item" moved from rail bottom to compact "+ NEW" in rail header. |
| `accord-prototype-v3b-3.html` | ~6200 | Draggable rail-width handle. CSS variable `--rail-w`. 280-600px range. Double-click-to-reset. sessionStorage persistence. |
| `accord-prototype-v3b-4.html` | ~6500 | Meeting lifecycle wired. PAUSE removed. START MEETING ⇄ END MEETING toggle. Timer state machine (00:00:00 idle → ticks → ENDED · N MIN). Closed-meeting transformation: composer disabled, banner with two CTAs, async PDF notification ~6s post-END. **Current ship-ready prototype.** |

**Architectural lineage of the prototype itself.** Started as
`meeting-minutes-prototype.html` in the project, evolved through
v2-series iterations (v2g–v2n), then renamed to
`accord-prototype-*` at v3a as part of module promotion.

## §3 — Journal entries

Narrative records of architectural reasoning. Format established
by `journal-entry-2026-04-29-compass-arc.md` in project files.

| File | Coverage |
|---|---|
| `journal-entry-2026-04-29-compass-arc.md` (in project files) | Compass My Work cascade closeout. Establishes Iron Rules 37–40 ratifications, doctrine candidates, agent dynamics. Reference for project working dynamics. |
| `journal-entry-2026-05-03-meeting-minutes-exploration.md` (in project files) | Initial Meeting Minutes architectural exploration. Captures the design vision through module promotion. Names the Module Emergence Pattern. |
| `journal-entry-2026-05-04-accord-arc.md` | This afternoon session's narrative. v3b → v3b-4 iteration with private-composer doctrine and meeting lifecycle. Explicitly contextualizes within multi-session arc. |

## §4 — Handoff documents

Concise onboarding artifacts for incoming agents.

| File | Purpose |
|---|---|
| `handoff-accord-v3b-4.md` | This session's handoff. Read-first orientation, project conventions, architectural commitments, pending work, doctrine candidates. |

The CMD-prefixed handoffs in project files (`handoff-cmd92`
through `handoff-cmd97`) are codebase-shipment handoffs from the
prior Compass arc — different format, different purpose.

## §5 — Doctrine candidates surfaced

These have been named and described but not yet ratified into
the canonical Iron Rules. A future doctrine cycle will determine
which become formal rules.

1. **Module Emergence Pattern** — When a feature operates across
   substrate / synthesis / workflow / publishing / integration
   levels, it has emerged as a module.

2. **Private composers + structured commits** — Every text
   input is private to its operator until a commit gesture
   tags it as a structured artifact. Six composers in Accord
   follow this pattern.

3. **CoC inviolability + meeting boundary as commit point** —
   Pre-END: structurally mutable. Post-END: structurally
   immutable. END is the atomic commit moment.

## §6 — Source-of-truth references

Files in project that govern this arc and should not drift:

| File | Authority |
|---|---|
| `Iron_Rules_36-40_Ratifications.md` | Iron Rules 36–40 canonical phrasing |
| `Style_Doctrine_v1_7.md` | Visual style governance (Fraunces / Plex Sans / Plex Mono, signal accent, editorial grade) |
| `Work_Mode_C_-_Operator_Direct_Protocol.md` | Mode C operating rhythm |
| `hud-ecosystem-protocol-v0_1.md` | Cross-module integration protocol baseline |

## §7 — Cross-references to broader project

**Production codebase inventory:** `projecthud-file-inventory-v2.md`
catalogs the existing ProjectHUD codebase (Compass, Cadence,
Aegis, core HUD layer, Supabase backend). Accord does not yet
have production code — it lives entirely in the prototype.

**Atlas:** `projecthud-atlas-skeleton.md` is the architectural
scaffold being built up. Accord may eventually have an Atlas
section once construction begins.

**Christopher Staples's source material:** The team chat
implementation in v3a was adapted from `App.jsx` (Proxy
Advisory's RIA application, Christopher's authorship). Pattern
borrowed, not source code lifted directly. See journal entries
for full attribution.

## §8 — Files NOT to modify

These are reference artifacts — read-only when working in the
Accord arc:

- All `journal-entry-*.md` files. Once written, immutable.
- The scenario walkthrough. Treat as canonical vision.
- Iron Rules ratifications. Ratified means stable.
- Style doctrine. Operator-curated.
- Prior prototype versions (v3a, v3b, v3b-2, v3b-3). Only
  iterate forward — newer versions, not in-place edits.

## §9 — How this map evolves

When new arc artifacts are produced, add them under the
appropriate section. When sessions close, update §1 and add the
session's primary artifact references. Treat this map as a
session-spanning index, regenerated when its accuracy slips.

The codebase inventory v2 evolves on a different cadence,
brief-by-brief. This map evolves session-by-session.

---

*End of Accord arc artifact map · 2026-05-04 afternoon.*
