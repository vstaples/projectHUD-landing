# Journal Entry — 2026-05-03

## Meeting Minutes Architectural Exploration — design vision through CoC recalibration

### What was built

A high-fidelity interactive prototype of the Meeting Minutes
subsystem (Pipeline / Compass / Cadence shared core), shipped
incrementally across one Mode-C session as v1 → v2h. The
prototype is a doctrine-free design exploration commissioned
explicitly to "shine and present a stunning, next-generation
capability" — UI direction is editorial-technical (Fraunces +
IBM Plex Sans + IBM Plex Mono, warm-slate canvas, single amber
signal color used sparingly), structurally distinct from
existing ProjectHUD surfaces. The prototype is a mockup; CoC
integration was deferred to build phase per operator decision.

**Three-surface architecture.** Live Capture (during meeting),
Living Document (the persistent home of the meeting series with
agenda → thread → entry hierarchy and per-entry comment
threads), Digest & Send (cream-paper email artifact rendered
from this-meeting deltas only, full series history reachable by
link). The Living Document is the hero surface — designed as a
navigable longitudinal document accreting dated entries across
recurring meetings, modeled directly on the operator's
reference image (a Word document with three-level bullet
hierarchy showing dated entries under persistent
sub-discussions under recurring agenda items).

**Tag-and-file capture flow.** Captures are typed into a single
textarea, then committed to the active thread by tagging
(Note / Decision / Action / Risk / Question) via button click
or Ctrl+letter hotkey. Captures stream into a "Captured this
meeting" list below. The agenda rail shows persistent threads
with entry-count badges — clicking a thread changes the
"Capturing under" target. No floating freeform notes — every
captured thought lands semantically anchored.

**Two scenarios pre-seeded.** OrthoMotion / Endoscopic Platform
(Pipeline discovery) and Electrical Design of Flexscope
(Cadence weekly status). Both scenarios populate full agenda /
thread / entry / comment hierarchies, with timeline rails,
attendee rosters, and meeting metadata. The scenario switcher
re-skins the entire app.

**Attachments sidebar — slide-in from right edge.** Final
architecture after explicit operator direction (Alt-3): the
attachments area extracted from the center column into a
slide-in sidebar. Hot-zone trigger on rightmost 12px of the
viewport. Mouse-leave dismisses with 300ms grace. Pin button
locks open. Click-active-image also pin-toggles; double-click
opens lightbox. Left-edge resize handle (380-1280px range);
capture-pane flexes narrower in lockstep via CSS grid template
with reserved sidebar column. Persistent edge handle ("ATTACH
N") shows total attachment count when sidebar closed.

**Attachments tabs — Image Canvas + Documents.** Image Canvas
shows active image at full size with prev/next nav, filmstrip
of thumbnails below with vertical resize handle (thumbs scale
proportionally with filmstrip height). Documents tab shows
typed icons (PDF/CAD/DOCX/XLSX/etc.) with file names, sizes,
relative timestamps. Both tabs accept drag-drop with amber drop
zones.

**WeChat-style scissors capture.** Auto-snap on hover (cursor
moving over DOM regions snaps to logical structures via
className matching), free-draw on click-drag, freeze with
inline confirmation toolbar (✕ cancel / ✓ accept), 8 resize
handles after freeze. html2canvas captures the frozen region as
a real bitmap; result lands on the Image Canvas as a new
visual. Browser screen-capture API path documented as Path B
for cross-monitor production capture (one permission grant per
meeting, sustained stream); prototype demonstrates UX via
DOM-internal capture.

**Visual-association mechanism.** Captures filed while an image
has been on the canvas for >30 seconds get a small thumbnail
chip linking back to that visual. Click chip to open visual in
lightbox; click × to unlink. Six weeks later, a reader of the
Living Document can recover the visual context that was on
screen when each entry was made.

**Friendly relative timestamps.** All attachments display
addedAt as Date objects internally, formatted at render via
`formatAttachmentTime()`: "Just now" / "X min ago" / "Today
HH:MM" / "Yesterday HH:MM" / "Mon DD, HH:MM" / "Mon DD YYYY,
HH:MM" depending on recency.

**Color and contrast pass.** Mid-arc operator feedback
identified panel labels (AGENDA, COVERAGE, CAPTURING UNDER,
etc.) as illegible at original `--ink-faint` (`#6b6354`,
contrast ~2.4:1). Tokens lifted: `--ink-faint` → `#908572`
(~6.0:1, WCAG AA), `--ink-muted` → `#b3a78f` (~8.5:1, WCAG AAA),
`--ink-ghost` proportional. Single-source change at
`:root`-token level, propagated to all 40 usages without
per-rule edits.

**Engineering rigor.** Every layout fix verified via Playwright
in headless Chromium — bounding-box assertions on all flex
chains, tab-switching behavior, sidebar slide-in/out states,
filmstrip resize-and-rescale, pin/unpin lifecycle. Two real
bugs caught only because of automated render testing: an SVG
data-URL intrinsic-dimension issue (images rendering at 0×0
because seed SVGs lacked `width`/`height` attributes), and a
CSS specificity collision (`.drop-target` overrode
`.workspace-content` because of source-order). Both invisible
to JavaScript syntax check; both required actual rendered DOM
inspection to surface.

Final artifact: `meeting-minutes-prototype-v2h.html` (~120KB,
single file, html2canvas as the only external runtime
dependency beyond fonts).

### What was learned

#### Architect-level mistakes I own

1. **Designed in ignorance of CoC for the entire arc.** Across
   eight prototype iterations I built up to designs that
   re-implemented things the platform already has. The
   annotation event log, the Living Document audit trail, the
   version snapshotting pattern, the watermark hashing for
   tamper detection — these aren't separate subsystems to
   design; they're CoC writes with appropriate event types and
   metadata. I should have asked "show me CoC" on day one. I
   didn't, and I sketched a parallel evidentiary substrate from
   first principles before the operator surfaced what already
   exists. **Lesson: when commissioned to design new
   functionality on a mature platform, the architect's first
   question is "what cross-cutting platform contracts exist
   that this work will consume from?" — not "what does this
   feature need to do?".** The Vision Anchor inheritance chain
   (HUD Ecosystem Protocol → ProjectHUD Vision Anchor →
   feature briefs) is supposed to prevent this; I read the HUD
   Ecosystem Protocol on day one but did not internalize §4
   (Chain of Custody) as the foundational substrate it is.

2. **Proposed event-sourcing as a hypothetical when it was
   already platform reality.** Two turns before the operator
   surfaced CoC, I posed "shouldn't entries themselves be
   time-travelable?" as an open architectural question with
   three options (A: stay CRUD, B: event-source meeting
   subsystem only, C: event-source ProjectHUD broadly).
   ProjectHUD already chose Option C in substance — `coc_events`
   is the unified append-only log for all observable actions
   across all entities. The question I posed was already
   answered before I was commissioned. **Lesson: open-question
   framing is appropriate for genuinely-undecided
   architectural choices, not for choices the platform has
   already made and documented.** A diligent re-read of the
   ecosystem protocol, with attention to §4 specifically,
   would have prevented the framing.

3. **Sidebar architecture invented in parallel to existing
   pattern.** The Cadence Chain of Custody panel
   (`tmpl-coc-panel` in `cadence.html`) is a right-edge
   slide-in panel with a left-edge col-resize handle, default
   width, transition timing, header-with-title-and-close. I
   built the Meeting Minutes attachments sidebar with the same
   structural pattern from scratch, using different class
   names (`attach-sidebar`, `attach-resize-handle`) and
   subtly different transition timings. This is not a defect
   in the prototype (it's a doctrine-free mockup), but it is a
   missed opportunity to align on a platform-wide
   slide-in-panel pattern. **Lesson: even in doctrine-free
   prototyping, recurring UI patterns deserve a quick "is
   there an existing pattern in the codebase I should mirror?"
   check before invention.** The check is cheap when the
   answer is "no"; when the answer is "yes," the savings are
   substantial.

4. **Underestimated then overstated annotation LOE.** Initial
   estimate 8-16 hours for production-grade annotation
   feature. After "memorialize the basis for decisions"
   framing emerged, revised to 14-18 hours including watermark
   and content hashing. After time-travel-slider concept
   emerged, revised to 35-50 hours including event-sourced
   data model. Then after CoC reframing, revised back down to
   18-25 hours because most of the event-sourcing
   infrastructure already exists. The estimate swung in both
   directions because I was building on an assumed-greenfield
   platform model. **Lesson: LOE estimates compound across
   architectural assumptions. When the assumed substrate is
   wrong, every estimate built on it inherits the error.**
   Future LOE estimates should explicitly call out the
   assumed substrate ("estimate assumes feature builds on
   CoC; if CoC unavailable, add ~12 hours") so the operator
   can challenge the assumption.

#### Operator-architect dynamics worth journaling

5. **Operator's "let's pause" rhythm protected the design from
   premature commitment.** Across the arc, the operator paused
   the conversation seven times — to reconsider scope, to
   surface CoC, to introduce the time-travel slider concept, to
   correct a misunderstanding. Each pause shifted the design
   meaningfully. The pause discipline is itself an
   architectural practice: it creates space for the operator to
   think laterally rather than answer the architect's narrowing
   questions. **Captured as a positive pattern: long-form
   architectural exploration benefits from operator-initiated
   pauses every 2-4 turns to allow the question to broaden
   before it narrows.**

6. **Operator's "ignore doctrine" framing for the prototype was
   correct.** The operator explicitly directed "ignore
   doctrine, this is your opportunity to shine." The result is
   a UI that diverges meaningfully from existing ProjectHUD
   surfaces (warm-slate canvas vs cool-cyan; Fraunces serif
   for hierarchy vs sans-only; single amber signal vs
   multi-color signal palette). This divergence is the
   prototype's value — it presents a credible alternative
   aesthetic the operator can compare against the existing
   doctrine. Had I tried to conform to existing doctrine, the
   prototype would have been a smaller delta from the status
   quo and a less useful comparison artifact. **Captured as a
   positive pattern: design-vision prototypes benefit from
   explicit doctrine-suspension; doctrine alignment is a
   later pass once the vision is selected.**

7. **Real-time bug discovery via Playwright caught defects
   syntax checking missed.** The SVG intrinsic-dimension issue
   and the CSS specificity collision were both invisible to
   `node --check` of the JavaScript and to balanced-tag HTML
   validation. Only rendered DOM inspection caught them. This
   is the engineering equivalent of "RLS behavioral
   verification" from the 2026-04-29 Compass arc journal: the
   structural smoke test (does the file parse?) is not a
   substitute for behavioral verification (does the file
   render correctly?). **Captured as a candidate for cross-
   architecture pattern: any UI prototype iteration that
   modifies layout-affecting CSS warrants a render-test pass,
   not only a syntax-check pass, before delivery.**

### What was decided (architecturally)

- **Meeting Minutes is a CoC consumer, not an evidentiary
  subsystem of its own.** The annotation event log, the entry
  edit history, the thread-status change log, the action-item
  reassignment trail, the meeting version snapshots — all of
  these are CoC writes through `window.CoC.write()` against
  appropriate event types in the `EVENT_META` vocabulary. The
  `coc_events` table is the append-only log; the meeting
  subsystem reads its history via `CoC.read('meeting',
  meetingId)` or scoped variants.

- **Meeting subsystem event vocabulary additions required.**
  Some events already exist in `EVENT_META`
  (`meeting.started`, `meeting.completed`, `meeting.outcome_set`,
  `meeting.no_consensus`, `workflow.meeting_created`). New
  events to register at build time:
  `meeting.entry_added`, `meeting.entry_edited`,
  `meeting.entry_deleted`, `meeting.thread_opened`,
  `meeting.thread_resolved`, `meeting.thread_archived`,
  `annotation.added`, `annotation.cleared_one`,
  `annotation.cleared_all`, `attachment.added`,
  `attachment.removed`. Each event's `metadata` JSONB carries
  type-specific fields (geometry for annotations, before/after
  for edits, related-entry-id for cross-references).

- **Adopt Cadence's Uncommitted/Committed pattern for the
  Living Document.** During the meeting, entry adds/edits
  accumulate as uncommitted events. At meeting end (or on
  explicit commit), the cluster commits as version N+1 of the
  meeting. CoC events get a `version_at` field; the Living
  Document gets a `version` cursor; viewing a past version
  replays events through its commit point. Versions are the
  evidentiary anchor; cryptographic hashing is a separate
  optional concern for strictly-regulated cases (e.g.,
  OrthoMotion's FDA-touching engagements).

- **Annotation slider is a CoC reader.** Each annotation event
  on an image becomes a CoC write. The slider scrubs a
  timeline of these events and projects the visible
  annotation state at each timestamp. No new tables, no new
  event log, no new persistence layer. Estimated build LOE
  for annotation slider feature: ~18-25 hours over 2-3 CMDs,
  most of which is annotation drawing primitives and slider
  UX, not event-sourcing infrastructure.

- **Watermarking strategy is a separate concern from
  event-sourcing.** For most use cases, version-as-anchor is
  sufficient evidentiary integrity. For regulated-industry
  prospects (medical device, aerospace), an additional
  cryptographic content hash layer at commit time provides
  tamper-detection. OpenTimestamps integration for
  free-of-charge timestamp authority is a viable post-MVP
  addition. Visible authorship caption can be composited into
  any flattened-image deliverable (e.g., digest email image
  exports).

- **Permanent images, mutable annotations.** Per operator
  framing: an image attached to a thread is permanent; its
  annotation layer is a temporal accretion. Image bytes never
  modified after upload. Annotation events accumulate
  immutably. "Clear all annotations" is itself an event, not
  a deletion. The current visible state is a projection of
  events; the historical state is always reachable by sliding
  to a past timestamp.

- **Prototype is doctrine-free; production conformance is a
  build-phase concern.** The prototype's editorial-technical
  aesthetic (warm-slate canvas, Fraunces typography, amber
  signal) is intentionally distinct from existing ProjectHUD
  surfaces. Whether to adopt the prototype's aesthetic
  platform-wide, retrofit the prototype into existing
  doctrine, or treat Meeting Minutes as a doctrinally-distinct
  surface is an operator decision deferred to build phase.

- **Prototype mock-data lifecycle remains in-memory only.**
  No CoC writes wired in the prototype. No persistence.
  Refresh resets all captured content. This is correct for a
  design-vision prototype; CoC integration happens during the
  CMD-arc that converts the mockup to production code.

### Session extension — calendar integration and external context

The arc continued past the initial CoC reframing. Three additional
contexts entered the conversation: the operator surfaced the existing
Compass My Calendar implementation (`my-calendar.html`, `mc-grid.js`,
`mc-kanban.js`), introduced counterfactual analysis as a deferred
capability, and shared an external project plan from a related firm
(Proxy Advisory Group's PNGN AI Operations Phase 1). Each shifted
some architectural framing.

**Calendar integration as Reading 1 (calendar's relationship to
Meeting Minutes specifically).** The operator's working framing
admits multiple readings; this entry's scope is the Meeting Minutes
relationship, with broader four-domain and CommandHUD-routing
readings deferred. Three user-facing moments were identified:
*scheduling* (future), *attending* (present), and *referencing*
(past). The calendar today is mature on attending (focus blocks,
PTO, time entries) and underdeveloped on scheduling. The Meeting
Minutes prototype's scheduling form is similarly underdeveloped.
Three options were enumerated for where the scheduling gesture
should reside: (A) calendar owns scheduling, Meeting Minutes
consumes; (B) Meeting Minutes owns scheduling, calendar reflects;
(C) shared scheduling primitive invoked by both surfaces. Architect
instinct toward Option C; operator response: "still working out the
question."

**Calendar's existing maturity is greater than initial assumption.**
Reading the Compass calendar implementation (`mc-grid.js`,
`mc-kanban.js`) revealed a substantially-built workflow surface,
not a display surface. Capacity-aware drag-drop with hour splitting,
past-due negotiation panel with three resolution paths (move-back /
ask-Compass-to-find-slot / submit-for-PM-approval), explicit CoC
writes via `window.CoC.write('calendar.reposition', ...)`,
delete-with-required-reason logged to CoC and propagated to PM,
ownership locks on cards belonging to other resources. The
"ask Compass to find a slot" affordance is currently a placeholder
toast — but it is precisely the seam where a shared scheduling
primitive could live.

**Calendar already consumes `_wiItems`-shape data.** Tasks with due
dates surface on the Kanban automatically. This means action items
captured by Meeting Minutes that land in the same data shape will
appear on assignees' calendars without additional integration work.
This is a meaningful architectural lever: Meeting Minutes' action
item schema should align with the existing work-item shape rather
than invent its own.

**Counterfactual analysis as a future capability.** Operator surfaced
the term *counterfactual* as the precise framing for an introspection
capability discussed in a prior session — the ability to assess
"what would have happened if we had chosen step A instead of step B."
CoC's append-only event log architecturally supports this: replay
the timeline up to a chosen point, branch by substituting an
alternative event, project forward, diff the two projections.
Distinction matters: factual replay (the annotation slider this arc
sketched) walks actual history. Counterfactual replay branches
history. Counterfactual capability would require explicit dependency
edges in CoC events (which event depends on which, queryable as a
graph), and a snapshot mechanism capturing decision-dependency
closures. Operator decision: counterfactual is binned for now;
factual annotation slider proceeds as the v1 capability when
commissioned. Counterfactual reserved for future architectural
exploration.

**External context from Proxy Advisory Group's PNGN AI Operations
Phase 1 plan.** Operator shared a separate firm's project plan
(prepared by Christopher Staples, April 2026) describing a
seven-agent AI deployment in an RIA context. Three direct
applications to ProjectHUD identified, plus several indirect
discipline patterns worth absorbing.

Direct applications to ProjectHUD architecture:

- **Notetaker as the meeting-synthesis layer ProjectHUD doesn't
  yet have.** PNGN's Notetaker pattern produces per-meeting summary,
  rolling client synthesis, relationship narrative, embeddings — all
  AI-generated. The Meeting Minutes prototype today captures
  human-authored structured artifacts (entries, tags, comments,
  threads). The two are complementary, not redundant. A mature
  meeting subsystem in three years probably has both: human-authored
  structured artifacts AND AI-synthesized rolling artifacts. Adopting
  PNGN's three-layer architecture (source preserved indefinitely,
  rolling synthesis generated incrementally, vector embeddings for
  semantic recall) is the right shape if/when ProjectHUD wants
  AI-generated narrative across meeting series. Not Phase 1 of
  Meeting Minutes; that would be premature. Captured as a future
  architectural direction.

- **"Holistic synthesis wins over local synthesis" as a design
  principle.** PNGN's cockpit reads rolling holistic client
  synthesis, not individual meeting summaries. Meeting summaries are
  intermediate artifacts. For ProjectHUD's Living Document, this
  maps cleanly: per-meeting entries are intermediate; series-level
  rolling synthesis is the primary read path for a returning user.
  The "Since last meeting" panel in the prototype is the most
  primitive form of this; a real synthesis layer would be
  substantially richer.

- **Stakes-aware confidence routing as the right framing for
  evidentiary artifacts.** PNGN's design treats every AI output as
  carrying both *confidence* and *stakes*. Low-stakes
  high-confidence proceeds silently; high-stakes uncertainty
  escalates regardless of confidence. For Meeting Minutes
  annotations, this is the sharper framing of the watermark spectrum
  earlier in this entry. An ambient annotation ("circle this") is
  low-stakes. An annotation that is the visible justification for a
  $260K budget approval is high-stakes. Stakes is a property of the
  artifact itself, not a configuration setting. The annotation
  feature, when commissioned, should adopt this framing: each
  annotation event in CoC carries a stakes attribute alongside its
  geometry.

Indirect discipline patterns to absorb:

- **Idempotency by source hash** (PNGN: every transcript identified
  by SHA-256, re-processing produces no duplicates). For ProjectHUD,
  CoC events carrying source content hashes would make event-stream
  imports/replays safe to retry. Captured as a CoC-level discipline
  candidate.

- **Multi-model abstraction as forward-looking AI policy.** PNGN's
  framing: "prompts and schemas are durable assets; specific models
  are commodities behind a uniform API. Model upgrades are config
  changes, not refactors." ProjectHUD has no AI integration today;
  this is the right discipline to lock in *before* AI integration
  starts, not after.

- **Three-tier action discipline** (synthesis writes silent;
  operational writes silent above confidence threshold;
  client-facing or evidentiary writes always require human approval).
  The right policy for ProjectHUD's eventual AI integrations.

- **Operational record vs regulatory archive distinction.** PNGN
  preserves AI outputs for operational needs; the broker-dealer
  (Cambridge) remains the regulatory archive of record. ProjectHUD's
  evidentiary character could be read as positioning ProjectHUD as
  a regulatory archive. PNGN's framing is sharper: be the
  operational record, let regulator-of-record systems (FDA's eCTD,
  ISO audit trails, etc.) be the archive. This actually *lowers*
  ProjectHUD's compliance burden — produce reconstructable records
  on inquiry, don't be the system regulators directly inspect. A
  meaningful architectural simplification.

- **Pre-decided scope reduction triggers.** PNGN's plan names six
  specific scope reductions in advance, in calm, ordered
  lightest-first. *"Tight timelines fail when scope-reduction
  decisions are made under stress in the final weeks."* When the
  annotation feature CMD arc is commissioned, it should adopt this
  pattern — decide what gets cut from the 18-25 hour estimate
  before the build starts feeling tight.

- **Continuity Document as living artifact.** PNGN's bus-factor
  mitigation: a single document drafted in week 1, updated every
  Friday. By any week N, the document reflects current state.
  ProjectHUD's `journal-entry-*` files reach for this discipline;
  PNGN's framing is more disciplined (every Friday is non-optional).
  Worth adopting as ProjectHUD's continuity discipline if/when the
  bus-factor problem becomes acute.

- **Architecture brief as inquiry-readiness, not inquiry-approval.**
  PNGN's Cambridge-readiness posture: document the architecture so
  the answer is prepared when the regulator asks, but don't block
  the build on regulator review. Same posture applies to
  ProjectHUD's customer-audit and prospect-due-diligence dynamics.

- **Decision card taxonomy at scale.** PNGN's cockpit shows decision
  cards from seven agents; the design challenge is sort-by-stakes-
  and-urgency, not sort-by-source. The Meeting Minutes Live Capture
  stream is analogous — captures from multiple sources flow into one
  chronological stream. As future sources are added (AI synthesis,
  external integrations), the same problem will surface. Worth
  reserving the principle now.

What's NOT lifted from PNGN (called out explicitly): specific dollar
savings estimates (different domain, different cost structure);
specific agent personas (Bookkeeper/Concierge/Marketer have no
analog); the 90-day shipping framing (no comparable forcing
function); the recruiting-demo-as-weapon angle (different dynamic).

### What's pending

**Near-term (this exploration arc):**

- **Operator review of v2h.** Final prototype iteration ready
  for operator inspection. Outstanding architectural
  questions noted in v2h delivery: workspace vertical-space
  rebalancing (deferred when operator chose sidebar
  architecture), filmstrip default height (currently 76px),
  scissors-capture browser-API path UX polish.

- **Optional iteration commission.** Three identified next
  iterations (annotation tooling, time-travel slider,
  evidentiary watermarking) all collapse onto CoC consumption
  per architectural decisions above. Operator may commission
  any subset.

**Identified post-prototype build work:**

- **Architecture brief for "Meeting subsystem on CoC".**
  Defines the event vocabulary additions, the rendering
  integration (likely `CoC.render('meeting_thread', threadId,
  panelEl)` for the per-thread audit panel), the
  Uncommitted/Committed adoption for the Living Document, and
  the migration path from prototype-mock-data to CoC-backed
  production data.

- **CMD arc — annotation feature.** Multi-CMD sequencing:
  schema extensions to image storage; annotation drawing
  primitives (toolbar, geometry capture, color/stroke);
  annotation slider UX; annotation events registered in
  `EVENT_META`; comment-attachment-per-annotation primitive.

- **CMD arc — Living Document version commit.** Adoption of
  the Uncommitted/Committed pattern for meeting minutes.
  CoC events versioned via `version_at`; meeting record
  carries `current_version`; version-bump UX inherits from
  Cadence's existing template-version-commit affordances.

- **Cross-platform parity verification.** Meeting Minutes is
  shared across Pipeline (per the prospect-card meeting tab),
  Compass (per workflow steps that reference meetings), and
  Cadence (per the cdn-coc.js CoC panel pattern). All three
  consumers of the meeting subsystem must work against the
  same CoC vocabulary and the same schema. Compatibility
  verification is a brief-scoped concern, not a journal-entry
  concern.

- **Atlas Part 5.2 contribution.** When the Meeting Minutes
  build commences, the resulting schema additions
  (`meeting_series`, `meeting_threads`, `meeting_entries`,
  `meeting_attachments`, etc.) belong in Atlas Part 5.2 (Key
  data model). Each table's purpose, key fields, lifecycle
  states, FKs, and RLS posture documented at build-time, not
  retroactively. Atlas Part 8.2 (Pattern library) gains
  "Uncommitted/Committed pattern for evidentiary subsystems"
  if generalized beyond Cadence.

- **Calendar / Meeting Minutes integration architecture brief.**
  Defines: where the scheduling gesture resides (Option A/B/C
  decision); the shared data model at the boundary
  (`meeting_record`, `meeting_series` as cross-product entities;
  calendar-private and Minutes-private extensions stay separate);
  six concrete integration touchpoints (calendar event → Living
  Document link, pre-meeting prep affordance, action item due
  dates as calendar events, series recurrence as single source of
  truth, conflict detection at scheduling, shared CoC stream); the
  shared scheduling primitive that fills the "ask Compass to find
  a slot" placeholder. Cross-references the journal entry's
  Reading 1 framing.

- **Future synthesis layer (Notetaker-equivalent) for Meeting
  Minutes.** Not commissioned, but architectural shape captured for
  future reference. Three-layer pattern (source preserved, rolling
  synthesis generated, embeddings for semantic recall) per PNGN's
  Notetaker. Per-meeting summary, per-series synthesis,
  cross-engagement narrative. Holistic synthesis as primary read
  path; per-meeting summaries as intermediate artifacts. Reserved
  for Phase 2 or later of Meeting Minutes; Phase 1 ships
  human-authored structured artifacts only.

- **Counterfactual analysis as future capability.** Architectural
  shape captured for reference. CoC event log architecturally
  supports counterfactual replay; surface UI does not. Adding it
  would require explicit dependency edges in CoC events
  (queryable as a graph) and a snapshot mechanism for
  decision-dependency closures. Reserved for future architectural
  exploration; not bundled with annotation v1, which is factual
  replay only.

**Doctrine candidates for ratification:**

- **New iron rule (or amendment): "Architect's first question
  on a new feature is platform-substrate inventory, not
  feature requirements."** Phrased operationally: before
  designing a feature on an existing platform, the architect
  must enumerate what cross-cutting contracts (event bus,
  CoC, dispatch requests, identity resolution, etc.) the
  feature will consume from. Failing to do so produces
  designs that re-implement existing infrastructure. The
  Meeting Minutes / CoC discovery in this arc is the
  reference case.

- **New iron rule (or amendment): "Doctrine-suspension
  framing is legitimate for design-vision prototypes."**
  Operator may explicitly suspend doctrine for vision
  exploration. Prototype outputs are not subject to doctrine
  conformance; the conformance pass is a build-phase
  concern. This protects the operator's optionality in
  comparing alternative aesthetic and structural directions.

- **New iron rule (or amendment): "Layout-affecting CSS
  changes require render verification, not only syntax
  verification."** Headless-browser testing (Playwright
  with Chromium) catches CSS specificity collisions, SVG
  intrinsic-dimension issues, and flex-chain collapse
  defects that JavaScript syntax check and HTML balanced-
  tag validation miss. This is the prototype-iteration
  analog of Iron Rule (TBD — RLS behavioral verification)
  from the 2026-04-29 Compass arc.

- **Pattern candidate for Atlas Part 8.2: the
  Uncommitted/Committed pattern.** Currently observable in
  Cadence (`tmpl-coc-panel` with pending-changes header
  block above committed version history). Generalized
  pattern: "any evidentiary subsystem with editable-while-
  in-progress, immutable-after-commit semantics adopts the
  Uncommitted/Committed UI pattern with version
  increments at commit." Meeting Minutes is the second
  candidate. Aegis policy ratifications may be a third.

- **CoC discipline candidate: idempotency by source content
  hash.** PNGN architecture commitment: every source artifact
  identified by SHA-256, re-processing produces no duplicates.
  ProjectHUD CoC-level analog: events that wrap external
  artifacts (uploaded images, scissors captures, imported
  transcripts) carry a stable content hash. Re-import of an
  already-recorded event with the same hash is a no-op, not a
  duplicate. Captured for future CoC platform discipline; not
  blocking any current work.

- **AI integration policy candidate: multi-model abstraction
  with versioned prompts.** When ProjectHUD eventually
  integrates LLM-driven features, the right discipline is:
  prompts and schemas are durable assets, model choice is a
  config parameter, model upgrades are config changes not
  refactors. PNGN articulation: "specific models are
  commodities behind a uniform API." Worth locking in *before*
  AI integration begins, not after. Reserved as a doctrine
  candidate for the future ProjectHUD AI policy document.

- **Three-tier action discipline candidate: silent / silent-above-
  confidence / always-human-approved.** PNGN articulation, applies
  directly to ProjectHUD's eventual AI integrations. Synthesis
  writes silent. Operational writes silent above a confidence
  threshold. Client-facing or evidentiary writes always require
  human approval. The right policy framework for any future
  AI-output discipline; not relevant today (no AI integration in
  scope) but reserved.

- **Operational-record-vs-regulatory-archive positioning
  candidate.** PNGN's framing: be the operational record, let
  the regulator-of-record (FDA eCTD, ISO audit systems, etc.) be
  the archive. ProjectHUD's evidentiary character could be misread
  as positioning ProjectHUD as a regulatory archive; PNGN's framing
  is sharper and lowers compliance burden. Worth incorporating into
  ProjectHUD's eventual customer-facing positioning materials.

Doctrine work is queued for after the Meeting Minutes
exploration arc closes. Operator commissions or defers
each candidate at their discretion.

### Notes on session dynamics

This arc was a single Mode-C exploration session, ~30 turns,
spanning architectural diagnosis through prototype iteration
through CoC reframing. Key dynamics:

- **Operator-architect alignment progressively deepened
  through the arc.** Early turns (1-8) were architectural
  diagnosis with operator providing successive context layers
  (Pipeline overview → prospect cards → meeting minutes
  surface → existing implementation pain points). Mid-turns
  (9-20) were prototype iteration with operator providing
  feedback every 2-3 turns. Late turns (21-30) were
  conceptual deepening — annotation tooling, watermarking,
  time-travel, CoC discovery. The arc demonstrated that
  Mode-C exploration benefits from sustained engagement; a
  shorter session would have stopped at the prototype-feature
  level and not surfaced the substrate-substrate (CoC) layer.

- **Prototype iterations versioned visibly (v1, v2, v2b, v2c,
  v2d, v2e, v2f, v2g, v2h).** Visible version stamps
  (`v2H · 2026-05-03 16:30` in the prototype's brand area)
  enabled the operator to verify which version they were
  running and bypass browser-cache confusion on at least one
  occasion. **Captured as a recurring practice for
  prototype delivery: every prototype carries a visible
  version stamp; cache-bypass guidance is part of delivery
  language.**

- **Architect honestly flagged ignorance when surfaced.**
  When CoC was introduced, the architect immediately and
  explicitly recalibrated: "I should have asked 'show me
  CoC' on day one." This is the discipline the existing
  journal-entry doctrine privileges (see 2026-04-29 entry's
  "Architect-level mistakes I own" section). Continued in
  this entry's analogous section.

---

*End of journal entry — 2026-05-03 — Meeting Minutes
exploration arc, design vision through CoC recalibration.*
