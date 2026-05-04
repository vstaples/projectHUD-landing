# Accord Arc Artifact Map — v2

**Purpose:** Focused inventory of all artifacts produced across
the multi-session Accord architecture arc. This is a session-arc
map, distinct from the broader `projecthud-file-inventory-v2.md`
which catalogs the production codebase. Use this when picking up
the Accord arc; use the inventory v2 when researching production
code surfaces.

**Last updated:** 2026-05-04 evening (end of v3b-4 session +
Decision Ledger extension + Evidence Layer brief + Iron Rules 41–46
ratification cycle)

**Supersedes:** v1 (`accord-arc-artifact-map.md`, 2026-05-04
afternoon). v1 predated the Decision Ledger extension, the Evidence
Layer brief, and the ratification cycle. It listed three doctrine
candidates as unratified that have since entered canon as Iron
Rules 41, 42, 43; and did not anticipate Iron Rules 44, 45, 46.

---

## Sessions to date

| Date | Session label | Output character |
|---|---|---|
| 2026-04-29 | Compass closeout | Brief-driven defect remediation |
| 2026-05-04 morning | Module Emergence + naming | Vision-stage, prototype v3a |
| 2026-05-04 afternoon | v3 iteration + lifecycle | Vision-stage, prototype v3b → v3b-4 |
| 2026-05-04 evening | Decision Ledger + substrate ratification | Vision-stage + doctrine ratification |

The arc began as a feature ("Meeting Minutes") and accreted
through Module Emergence into a full module ("Accord"). The
afternoon→evening transition was forced by a Claude usage-limit
window during which the operator continued the conversation with a
different AI. That conversation surfaced the Decision Ledger
surface and a closed-loop confidence framing. The current session
audited that work, accepted what was sound, rejected what wasn't,
drafted the substrate brief, and closed a six-rule ratification
cycle.

---

## §1 — Vision documents

These describe what Accord IS at the vision level. Read these
first when picking up the arc.

| File | Lines | Purpose |
|---|---|---|
| `scenario-walkthrough-meeting-minutes-collaborative.md` | ~431 | The master vision document. 12 numbered sections walking through a complete collaborative meeting from open to async publication. 21 explicit DECISION POINT markers. The architectural source of truth for what Accord is and how it behaves. Cast: Ron White (organizer), Angela Kim (scribe), Vaughn (CTO), three others. |
| `accord-roadmap-v3a.md` | ~296 (rev 2) | Feature enumeration mapped to the 12 walkthrough sections. Each feature carries a verdict: DONE / MOCKUP / BUILD / HYBRID. Top of document carries the "private composers + structured commits" doctrine candidate (now Iron Rule 41). Counts at session close: ~27 DONE, ~31 MOCKUP, ~40 BUILD. |

## §2 — Substrate documents

The substrate documents specify what Accord IS at the data level.
Read these after vision documents and before any build-side work.

| File | Lines | Purpose |
|---|---|---|
| `accord-evidence-layer-v0_1.md` (v0.1.1) | ~650 | The Evidence Layer architecture brief. Defines node taxonomy (4 tags + Evidence/Answer as edge-derived rendering), 9 ratified causal edge types, declared-belief schema with two-dimension action confidence, and cross-module canonical-state ownership protocol. Patched to v0.1.1 after Iron Rules 41–46 ratified. The substrate the Decision Ledger surface renders. |

The build-side architecture brief is **pending**. It will consume
the Evidence Layer brief and translate it into Postgres schema,
RLS policies, real-time channel topology, PDF pipeline, CMD
sequencing for the 140–205 hour build. Estimated 4–6 hours of
careful drafting when operator commissions it.

## §3 — Prototype iterations

The prototype is a single self-contained HTML file (~7600+ lines)
that has evolved across iterations. Each version supersedes the
prior; only the latest is in current use.

| Version | Lines | Defining changes |
|---|---|---|
| `accord-prototype-v3a.html` | ~5300 | Initial Accord brand identity. Six chairs icon. Organizer in header. Three-state presence dots. LIVE CONNECT control with subscribe dropdown. Broadcast-only chat panel adapted from Christopher Staples's DevChat. Minutes archive tab. Action assignment composer. |
| `accord-prototype-v3b.html` | ~6000 | Agenda mutations + archive + reorder + filter+sort bundle. ACTIVE/ALL toggle. CoC-aware archive vs hard-delete distinction. Drag-and-drop reordering for threads + agenda items. Action items filter+sort row. |
| `accord-prototype-v3b-2.html` | ~6100 | Refinements: pencil removed from rail rows, × replaces trashcan, "+ NEW" moved to compact rail header position. |
| `accord-prototype-v3b-3.html` | ~6200 | Draggable rail-width handle, 280-600px range, sessionStorage persistence, double-click-to-reset. |
| `accord-prototype-v3b-4.html` | ~6500 | Meeting lifecycle wired. PAUSE removed. START ⇄ END toggle. Timer state machine. Closed-meeting transformation. Async PDF notification. **Last operator-authored prototype.** |
| `preview.html` (Decision Ledger extension, ~8200 lines) | ~8200 | Adds fifth surface (Decision Ledger / Spine View) between Living Document and Digest. Three-column layout: thread rail / spine / inspector pane. Five node types rendered (Decision/Action/Answer/Question/Evidence as currently authored). Declared-belief metric with adjustment log. Cross-module reference chips. **Drafted by external AI during operator's Claude-usage-limit window. Audited and refined this session; surface kept, substrate framing rebuilt to match Iron Rule 45 (declared, not measured).** |

**Architectural lineage of the prototype itself.** Started as
`meeting-minutes-prototype.html`, evolved through v2-series
iterations (v2g–v2n), renamed to `accord-prototype-*` at v3a as
part of module promotion, extended to `preview.html` for the
Decision Ledger surface this session.

**Surface alignment task pending.** The Decision Ledger surface
in `preview.html` predates Iron Rules 44–45 ratification. Aligning
it would mean: relabel "confidence" → "declared belief" throughout,
strip the prescriptive "Recommended next step" box (or partition
under a separately-labeled reasoning-engine layer), demote
"Evidence" from a node-type styling to an edge-derived rendering
treatment, surface attribution on each adjustment row. Estimated
~90 minutes if pursued. Would land as v3c.

## §4 — Doctrine artifacts

Doctrine governs the arc going forward. Ratified rules are
binding; candidates are advisory until ratified.

| File | Status | Authority |
|---|---|---|
| `Iron_Rules_36-40_Ratifications.md` | Ratified (in project) | Rules 36–40 canonical phrasing |
| `Iron_Rules_41-46_Ratifications.md` | Ratified 2026-05-04 evening | Rules 41–46 canonical phrasing |
| `Iron_Rules_41-46_Ratification_Request.md` | Closed (Option A selected) | Operator-facing request artifact, retained for arc record |
| `Ratification_Record_Iron_Rules_41-46.md` | Canonical event marker | External supplement to the journal entry recording the ratification cycle |

The doctrine queue is currently **empty**. No unratified
candidates remain from the Accord arc. Future candidates surfaced
by future sessions enter the queue fresh.

The six rules ratified this session, in summary:

| # | Title |
|---|---|
| 41 | Private composers + structured commits |
| 42 | CoC inviolability + meeting boundary as commit point |
| 43 | Module Emergence Pattern |
| 44 | Typed causal edges as primitive |
| 45 | Declared belief, not measured confidence |
| 46 | Canonical-state ownership across modules |

## §5 — Journal entries

Narrative records of architectural reasoning. Format established
by `journal-entry-2026-04-29-compass-arc.md`. **Once written,
immutable** per §8.

| File | Coverage |
|---|---|
| `journal-entry-2026-04-29-compass-arc.md` | Compass My Work cascade closeout. Establishes Iron Rules 37–40 ratifications and project working dynamics. |
| `journal-entry-2026-05-03-meeting-minutes-exploration.md` | Initial Meeting Minutes architectural exploration. Names the Module Emergence Pattern. |
| `journal-entry-2026-05-04-accord-arc.md` | Afternoon session. v3b → v3b-4 iteration. Three doctrine candidates surfaced (subsequently ratified as Iron Rules 41–43). |

A journal entry for the evening session (Decision Ledger audit +
Evidence Layer brief + ratification cycle) would be appropriate.
Not yet written — operator's call whether to commission one or to
let the four artifacts produced this session stand as their own
record.

## §6 — Handoff documents

Concise onboarding artifacts for incoming agents.

| File | Purpose |
|---|---|
| `handoff-accord-v3b-4.md` | Afternoon-session handoff. Read-first orientation, project conventions, architectural commitments, pending work, doctrine candidates (now ratified). |

A v3b-4-evening handoff is **pending**. The afternoon handoff
predates the Decision Ledger surface, the Evidence Layer brief,
and the ratification cycle. An incoming agent reading only the
afternoon handoff will miss six ratified rules and the substrate
specification. Recommend drafting before next session pickup.

The CMD-prefixed handoffs in project files (`handoff-cmd92`
through `handoff-cmd97`) are codebase-shipment handoffs from the
prior Compass arc — different format, different purpose.

## §7 — Source-of-truth references

Files in project that govern this arc and should not drift:

| File | Authority |
|---|---|
| `Iron_Rules_36-40_Ratifications.md` | Iron Rules 36–40 canonical phrasing |
| `Iron_Rules_41-46_Ratifications.md` | Iron Rules 41–46 canonical phrasing |
| `Style_Doctrine_v1_7.md` | Visual style governance (Fraunces / Plex Sans / Plex Mono, signal accent, editorial grade) |
| `Work_Mode_C_-_Operator_Direct_Protocol.md` | Mode C operating rhythm |
| `hud-ecosystem-protocol-v0_1.md` | Cross-module integration protocol baseline |
| `accord-evidence-layer-v0_1.md` (v0.1.1) | Accord substrate specification |

## §8 — Cross-references to broader project

**Production codebase inventory:** `projecthud-file-inventory-v2.md`
catalogs the existing ProjectHUD codebase (Compass, Cadence,
Aegis, core HUD layer, Supabase backend). Accord does not yet
have production code — it lives entirely in the prototype + the
Evidence Layer brief.

**Atlas:** `projecthud-atlas-skeleton.md` is the architectural
scaffold being built up. Accord may eventually have an Atlas
section once construction begins.

**Christopher Staples's source material:** The team chat
implementation in v3a was adapted from `App.jsx` (Proxy
Advisory's RIA application, Christopher's authorship). Pattern
borrowed, not source code lifted directly. See journal entries
for full attribution.

**Cross-module dependencies (per Iron Rule 46):** Accord
canonical-references Compass actions via `compass://action/{id}`
URIs and Aegis presence via existing presence channel
subscription. Compass canonical-references Accord reasoning via
`accord://node/{id}` back-references. Neither dual-writes the
other's state.

## §9 — Files NOT to modify

These are reference artifacts — read-only when working in the
Accord arc:

- All `journal-entry-*.md` files. Once written, immutable.
- The scenario walkthrough. Treat as canonical vision.
- Iron Rules ratifications (36–40, 41–46). Ratified means stable.
- Ratification record (`Ratification_Record_Iron_Rules_41-46.md`).
  Event markers are immutable.
- Style doctrine. Operator-curated.
- Prior prototype versions (v3a, v3b, v3b-2, v3b-3). Only iterate
  forward — newer versions, not in-place edits.

The artifact map itself (this document) is **regenerable**, not
immutable. When its accuracy slips, regenerate as v3 rather than
editing in place.

## §10 — Pending work (end of session)

**Mockable items remaining from roadmap rev 2** (in priority order):

1. §7.2 visual-recall on entry click (~1-2h)
2. §4.6/4.7 two-level comment threading (~1.5h)
3. §5.3/5.4 comment density auto-collapse (~1h)
4. §10.5 host-mode option in LIVE CONNECT (~30m)
5. §1.4 presence ticker on join (~30m)
6. §3.6 author initials chip (~30m)
7. §8.8 reassign action mid-meeting (~1h)

Total: ~6-8h. Could bundle as v3c (visual-recall + comment
threading) and v3d (smaller affordances).

**Surface alignment with Iron Rules 44–45:** the Decision Ledger
surface in `preview.html` should be aligned to the ratified
doctrine. ~90 minutes. Would land as v3c if pursued ahead of the
mockable items above.

**Vision-stage items:**

- Sub-topic tag (operator-nurtured, not declared lapsed)
- Outcome node type schema (Evidence Layer v0.2)
- Decision subtypes (design/process/risk-acceptance, v0.2)
- Comment layer schema (separate brief)
- Daily Merkle-root external anchoring (v0.2)
- Confidence calibration math (v0.2 or later, deferred per Rule 45)

**Major artifacts pending:**

- **Build-side architecture brief** (~4-6 hours). Translates
  Evidence Layer v0.1.1 + Iron Rules 36–46 into shippable
  specification. Should land before any CMD is commissioned.
- **Multi-CMD plan** (~140-205 hours total Accord build,
  sequenced into 5-8 CMDs). Builds on the architecture brief.
- **v3b-4-evening handoff document.** Recommended before next
  session pickup.

## §11 — How this map evolves

When new arc artifacts are produced, add them under the
appropriate section. When sessions close, update §1 and add the
session's primary artifact references. Treat this map as a
session-spanning index, regenerated when its accuracy slips.

The codebase inventory v2 evolves on a different cadence,
brief-by-brief. This map evolves session-by-session.

A future v3 of this map will be appropriate when: (a) the
build-side architecture brief lands, or (b) a new doctrine cycle
ratifies further rules, or (c) significant prototype work
supersedes the current Decision Ledger framing, or (d) the arc
ends and a closeout summary is more useful than a working index.

---

*End of Accord arc artifact map v2 · 2026-05-04 evening · six
rules ratified · substrate specified · build brief pending.*
