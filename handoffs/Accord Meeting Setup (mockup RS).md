# Accord Meeting Setup Shell — Requirements Specification
## Version 1.0 · Authored 2026-05-09
### Operator: Vaughn Staples · Architect: Claude (Pluto)

---

## §0 — Document Purpose

This specification is the canonical design authority for the Accord Meeting Setup shell — the pre-meeting preparation surface shown for `accord_meetings` rows in `state='idle'`. It supersedes all prior phase commission documents for visual and interaction design. Future architects should treat this document as the product truth and commission individual CMDs against it.

This document covers: layout architecture, content model, interaction design, visual language, substrate requirements, and wave-by-wave implementation sequence. It does not contain implementation code — that lives in individual CMD commissions authored against this spec.

---

## §1 — Product Vision

The Accord Meeting Setup shell is an operator's pre-meeting command center. It serves three distinct temporal roles simultaneously:

1. **Preparation mode** — Operator alone, composing the meeting before attendees arrive. Full intelligence visible.
2. **Gathering mode** — Attendees joining (auto-engages 15 min before `scheduled_for`). Intelligence hidden; roster prominent.
3. **Imminent mode** — Final 5 minutes before `scheduled_for`. Visual urgency shift; surface tightens to essentials.

The shell transitions to the 5-tab running-meeting surface when the operator clicks Begin Meeting and `Accord.startMeeting()` fires.

### Design Philosophy
- **Every visible element earns its place.** The setup surface is not a dashboard of data — it is a briefing. Information that does not help the operator walk into the room more prepared does not belong.
- **Public/private layer distinction is inviolable.** Some information is for the operator's eyes only. The surface must architecturally separate what is safe to show in a shared-screen context from what is not.
- **Substrate is truth; surface is interpretation.** The public layer shows facts derived from substrate. The private layer (Intelligence Mode) shows interpretation. These are visually and architecturally distinct.
- **Time is the primary axis.** The meeting is approaching. Everything on the surface communicates that.

---

## §2 — Layout Architecture

### §2.1 — Grid model

The Setup shell occupies the **full page content area** below the global `hud-shell.js` chrome. It uses a CSS grid with 4 fixed rows:

```
grid-template-rows: auto 1fr 102px 54px
grid-template-areas:
  "header"
  "columns"
  "filmstrip"
  "footer"
```

No left rail. No shared host with workstreams sidebar. The Setup shell owns its full content area from edge to edge.

### §2.2 — Header zone (`auto` height)

Contains: meeting title (editable), Stakes field (editable), schedule metadata, FOLLOW-UP/FIRST-EVER toggle. Height grows with Stakes content; no fixed height.

### §2.3 — Columns zone (`1fr` — fills remaining space)

Three resizable columns. Default widths:
- **Left (Briefing):** 360px
- **Center (Agenda/Outcomes):** flex — fills remaining space
- **Right (Attendees):** 380px

Drag handles on left/right column borders. Dragging left border of center column resizes left+center. Dragging right border of center column resizes center+right. Min width per column: 260px. Max: 600px. Column widths persist per-user per-workstream in localStorage.

All three columns are independently vertically scrollable within the 1fr zone. No column scroll affects another.

### §2.4 — Filmstrip zone (102px default, draggable)

Full-width strip below the columns zone. Default height 102px. Drag handle on top border — operator pulls up to expand (max ~350px), pushes down to compress (min 48px). Height persists per-user. Content adapts to height (three density states — see §7).

### §2.5 — Footer zone (54px fixed)

Contains: verdict pill (left), time budget bar (center), action buttons (right). Fixed height. Never scrolls. Always visible.

---

## §3 — Header Zone Content

### §3.1 — Left side

**Meeting title:** large serif, contenteditable. PATCH `accord_meetings.title` on blur. 800ms debounce.

**Stakes field:** replaces "Intended Outcome" single-paragraph from original mockup v5.
- Label: `STAKES` in cyan mono uppercase
- Content: operator-authored italic serif text. Single contenteditable block.
- Substrate: `accord_meetings.stakes TEXT NULL` (new column — Wave 1 migration)
- Purpose: frames what is at risk in this meeting. Distinct from Outcomes (which are commitments). Stakes is why the meeting matters; Outcomes are what it will accomplish.
- PATCH on blur, 800ms debounce. State-gate trigger: immutable once `state='running'` (same pattern as `briefing_text` trigger from Phase 2).

### §3.2 — Right side

Mono font metadata grid:
- `WHEN` — `scheduled_for` formatted + duration if set (`14:00 — 15:00`)
- `WHERE` — `location TEXT NULL` on `accord_meetings` (new column — Wave 1 migration). Operator-editable inline.
- `WORKSTREAM` — meeting count in workstream + days since last meeting (derived)
- `STARTS IN` — countdown, amber pulse dot, shown only when `scheduled_for` is within 24h

**FOLLOW-UP / FIRST-EVER toggle:** top-right corner. Derived from prior meeting count in workstream (non-editable display; operator cannot override). FOLLOW-UP when prior closed/sealed meetings exist in workstream; FIRST-EVER when none. Toggle is read-only; it communicates context, not a setting.

---

## §4 — Left Column: Briefing

### §4.1 — Tab structure

Three tabs, auto-rotation enabled (see §9.2):
- **Briefing** (default, pinned — rotation opt-in only for this column)
- **Decisions**
- **Risks**

### §4.2 — Briefing tab

**Synthesis block:** operator-authored or AI-derived. In v1: populated from `accord_meetings.briefing_text`. Cyan left-border card, serif italic, 14px minimum. Label: "WHAT CAME BEFORE".

**Last meeting block:** most recent prior closed/sealed meeting in workstream.
- Meta: meeting ID, state, node counts (sealed · dec · act · dis · risks)
- Summary: `accord_meetings` has no summary column currently — this is the last meeting's `briefing_text` if present, otherwise mechanical default derived from node counts
- "Read full minutes ↗" link — opens that meeting's Minutes surface
- Font: 13px minimum

**Prior actions — live status:**
- All open action nodes (`tag='action'`) from prior workstream meetings
- Grouped by status: complete (✓), in-progress (→), overdue (!), pending (○)
- Default: compressed to aggregate counts ("6 tracked · 1 overdue · 2 due-this-week")
- Click aggregate row to expand full kanban inline within the panel
- See §8 for full Action Items kanban spec
- Vertical scroll within panel when expanded; no height cap

**Prior decisions block:**
- Decision nodes from prior workstream meetings with NRA/belief state
- Shows: seq_id (DC-xxx), state badge (Sealed / Awaiting belief N of M / Dissent DS-xxx), decision text
- Font: 12px minimum

**Annotations block:**
- `accord_belief_adjustments` rows linked to prior decisions in this workstream
- Shows author, date, rationale excerpt
- "View decision chain ↗" link

### §4.3 — Decisions tab

Full-screen within left column. All decisions from this workstream, sorted by state priority (awaiting/dissented first). Filters: All / Sealed / Awaiting / Dissented. Click decision → center column shows node detail.

### §4.4 — Risks tab

Risk Register scoped to this workstream's project. Risk items with weighted score, mitigation status, owner. CPM surface if critical-path data is available: "N actions on critical path are owned by attendees in this meeting." Float warnings for overdue critical-path actions.

This tab is the natural home for Risk Register integration and CPM/PERT consumption. It reads from existing `risk_register` table and future CPM substrate. It does not own CPM computation — it displays CPM-derived signals.

---

## §5 — Center Column: Agenda + Outcomes

### §5.1 — Tab structure

Three tabs, center column does NOT auto-rotate (Agenda is the active workspace):
- **Agenda** (default, permanent)
- **Minute Notes** (activated when a filmstrip frame is clicked — shows that prior meeting's captured notes)
- **Comments** (operator and attendee notes scoped to this meeting)

Stepper (`< · · >`) anchored right of column title, left of thread/count metadata. Manual navigation only; no auto-rotation in center column.

### §5.2 — Outcomes block (above Agenda list)

**This is a new structural element replacing the single-paragraph Intended Outcome from mockup v5.**

Each outcome is a discrete commitment row:
```
[verb chip] [object text] [owner chip]    [status]
RESOLVE     DS-005 dissent on supplier    Tom       ◯
SEAL        DC-117 belief                 Sarah     ◯
DEFER       FDA timing                    Amara     ◇ conditional
```

Substrate: `accord_meeting_outcomes` table (new — Wave 1 migration):
- `outcome_id UUID PK`
- `firm_id UUID`
- `meeting_id UUID FK → accord_meetings`
- `verb TEXT` (RESOLVE / SEAL / DECIDE / ASSIGN / DEFER / INFORM)
- `description TEXT`
- `owner_resource_id UUID NULL FK → resources`
- `condition TEXT NULL` (for DEFER type)
- `status TEXT DEFAULT 'open'` CHECK (open / achieved / partial / carried / abandoned)
- `resolved_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ`
- `position INTEGER`

Operator can add/edit/reorder/delete outcomes during prep. Outcomes become immutable during running state (same trigger pattern as `briefing_text`). At meeting close (seal flow), operator walks outcomes and marks each status — this is the outcome ratification step.

**Owner chips link to attendee cards:** clicking "Tom" chip in an outcome row percolates Tom across all panels (§9.4).

### §5.3 — Prep prompt (full-width, above outcomes)

Amber callout block. One prompt at a time. Derived from substrate:
- Attendee with an unresolved dissent who is on the invite list
- Decision awaiting belief from an attendee who has historically responded within 24h of being asked
- Action overdue by an attendee in this meeting

Format: `⚡ [prompt text] · [action affordance right-aligned]`

Example: "You haven't queried Tom's dissent on DS-005. He'll be in the room. · PULL AS THREAD →"

This is the highest-intelligence element on the public surface. It surfaces in the center column because it's agenda-relevant. Cycles if multiple prompts exist (operator can dismiss individual prompts). Must be derivable from existing substrate without AI — behavioral pattern derivation only.

### §5.4 — Agenda list

Each agenda item:
```
[handle] [text]                              [type pill]  [▸]
         └ [meta: carried · refs · time-est · owner]
```

- **Handle:** drag-to-reorder (replaces current up/down chevrons — proper drag is the right UX here)
- **Type pill:** DECIDE / ASSIGN / INFORM / RISK / QUESTION — stored as `item_type TEXT NULL` on `accord_agenda_items` (new column — Wave 1 migration)
- **Time estimate:** `duration_minutes_estimate INT NULL` on `accord_agenda_items` (new column — Wave 1 migration). Inline editable. Feeds footer budget bar.
- **Expand [▸]:** collapses/expands item meta row
- **Carried indicator:** `border-left: 3px solid cyan` if `pulled_from_node_id IS NOT NULL`
- **Ref chips:** cross-references to decisions/actions (derived from `accord_edges` where `from_node_id` in item's pulled_from_node_id lineage)

**Add item row:** dashed border input at bottom. Operator types and hits Enter. Item type inferred from text (if possible) or defaults to null. "Accord will infer the NRA shape" placeholder text.

**Carried References strip:** at bottom of Agenda tab. File attachments associated with the meeting or carried from prior. `+ attach` affordance. (CMD-ACCORD-MEETING-ATTACHMENTS-1 scope.)

---

## §6 — Right Column: Attendees

### §6.1 — Column rename

"Anticipation" → **"Attendees"**. The intelligence that was in the Anticipation column is relocated to Intelligence Mode (§10). The right column is safe to show in a shared-screen context at all times.

### §6.2 — Roster display (top section, always visible)

Per attendee:
```
[conn-dot] [avatar] [Name]          [YOU]
           [initials] [Role]        [status badge]
           [Stakes: what they're owed / need from this meeting]
           [▸ expand for detail]
```

- **Conn-dot:** 12px circle. not-connected (glowing outline) / on-time (green) / late (yellow). Clickable to manually toggle state during gathering. Legend accessible via `○ LEGEND` affordance.
- **Status badge:** derived, not stored. ENGAGED·STEADY / DISSENT·SIMMERING / OVERDUE·PRESSURE / QUIET·RE-ONBOARD — computed from NRA state, dissent history, action overdue counts, days-off-substrate. These are public-safe labels (descriptive, not analytical).
- **Stakes line:** "Owes belief on DC-117 (12d). Owns 5/12 actions in this workstream." Derived from `accord_nodes`, `accord_belief_adjustments`, action ownership. Public-safe — factual derivation only.
- **Expand [▸]:** shows additional substrate-derived detail (actions list, cross-workstream involvement, risk surface). Collapsed by default.

Substrate: `accord_meeting_attendees` table (new — Wave 1 migration):
- `attendee_id UUID PK`
- `firm_id UUID`
- `meeting_id UUID FK → accord_meetings`
- `resource_id UUID FK → resources`
- `role_in_meeting TEXT NULL` (ORGANIZER / LEAD / PARTICIPANT / OBSERVER)
- `invited_at TIMESTAMPTZ`
- `rsvp_status TEXT DEFAULT 'pending'` CHECK (pending / accepted / declined / tentative)
- `created_at TIMESTAMPTZ`

### §6.3 — Tab structure (bottom section)

Three tabs, full auto-rotation enabled:
- **Attendees** (default — shows roster above)
- **Action Items** (see §8 for full kanban spec)
- **Attachments** (file references; CMD-ACCORD-MEETING-ATTACHMENTS-1 scope)

### §6.4 — Gathering mode (auto-engages 15 min before `scheduled_for`)

Right column collapses to roster only. All derived intelligence (status badges, stakes lines, expand detail) hidden. Conn-dots become the dominant visual element (16px). "Gathering mode" label in column header. `Show prep view` toggle available to operator — clearly marked as private.

Gathering mode does not affect left or center columns.

---

## §7 — Filmstrip Zone

### §7.1 — Default state (102px)

Full-width horizontal scroll strip. Each frame: 88px wide.
- Date label, meeting label
- Colored gradient background (density-signal: high-activity meetings get warmer gradient)
- Marker dot: rose (dissent meeting) / cyan (decision-heavy) / none
- Current meeting: cyan border + glow
- Future meetings: dashed border, transparent background

Header row: `WORKSTREAM TIMELINE · N prior meetings · click any frame to scrub`
Controls (right-aligned): `⏮ first · ▶ play history · ⊙ today · ⏭ next`

### §7.2 — Medium state (~200px, drag-expanded)

All of default state plus:
- Per-frame node-count sparkline (3 mini-bars: decisions height, actions height, dissent height)
- Bars are proportional to counts; no labels; color-coded by type
- At-a-glance rhythm of the workstream's health over time

### §7.3 — Expanded state (~350px, further drag-expanded)

All of medium state plus:
- Per-frame: last summary excerpt (italic, 2-line clamp)
- Attendee avatar strip (first 4, +N overflow)
- Key decision or action label from that meeting

### §7.4 — Click behavior

Clicking any prior meeting frame: loads that meeting's captured content into center column's **Minute Notes** tab. Filmstrip frame gets active border. Center column stepper shows `< meeting N of M >`. Operator navigates prior meetings without leaving the Setup shell.

---

## §8 — Action Items Panel (within Right Column tab)

### §8.1 — Time-anchored kanban

Columns (fixed structure):
- **Past Due** (left bookend — never hidden, always pressing)
- **Mon / Tue / Wed / Thu / Fri** (current week)
- **Next Week** (right bookend)

Cards: action node summary, owner chip, substrate ID (AX-xxx), slack indicator (days of float: red 0-1 / amber 2-5 / green 6+), critical-path spine (thin amber border on card edge if action is on critical path).

Drag horizontally to reschedule (PATCH `due_date` on `accord_nodes`). Drag within column to reprioritize (cosmetic order only).

### §8.2 — Calendar view (alternate tab within Action Items)

Grid view: days as columns, hourly rows. Action items positioned by `due_date`. Same drag-to-reschedule mechanic. Toggle: `KANBAN / GRID` (per Compass MY CALENDAR pattern).

### §8.3 — Cross-substrate highlight

Clicking an action card: the agenda item it was pulled from (if `pulled_from_node_id` traces back to this meeting's agenda) gets a glow in the center column. The owner's attendee card gets a brief pulse in the right column roster. Same mechanic as click-to-percolate (§9.4) but anchored on action, not on person.

---

## §9 — Interaction Layer

### §9.1 — Drag-resize columns

CSS grid with JS column-width management. Drag handles (4px wide, hover-highlights) on column borders. `mousedown` on handle → `mousemove` updates grid-template-columns → `mouseup` persists to localStorage. Min width: 260px, max: 600px. Center column gets whatever remains between left and right.

### §9.2 — Slideshow tabs (auto-rotation)

**Left column:** Briefing pinned by default. Rotation opt-in only (toggle in column header: `AUTO · MANUAL`). Rotation visits Decisions and Risks at 15s intervals when enabled.

**Right column:** full auto-rotation by default. Visits Attendees → Action Items → Attachments at 15s intervals. Cursor enters panel → pause. Cursor leaves → 3s grace → resume. Manual click on a tab → 60s pause before resuming.

**Center column:** no auto-rotation. Agenda is permanent. Minute Notes / Comments accessed via filmstrip click or tab click only.

**Progress indicator:** 1px line at bottom of column header, draining left-to-right over the rotation interval. Resets on rotation or manual interaction.

**Stepper:** `< [dot][dot][dot] >` anchored right of column title. Current tab dot is filled. Click dot to jump. Click `<` / `>` to step.

### §9.3 — 5-minute warning

Auto-triggers when `now() > scheduled_for - 5min`.

Changes:
- Header amber pulse dot intensifies (faster pulse, larger)
- Footer verdict pill brightens
- Briefing column: all blocks except synthesis + last meeting accordion-closed
- `STARTS IN` countdown turns rose when < 2 min
- Subtle amber glow on the overall header border-bottom

No operator action required. Reverts if operator postpones meeting.

### §9.4 — Click-to-percolate-by-person

Clicking any person reference (attendee card, owner chip on agenda item, owner chip on outcome row, action card owner):
- Person's items rise to top in each visible panel (agenda items they own, actions they own, outcomes they're named on)
- All other items in each panel fade to 0.35 opacity (not hidden)
- `Filtered: [Name] · ✕` pill appears in the center column header row
- Clicking ✕ or clicking the same person again clears filter
- Percolation applies to currently-visible panel in each column only (not hidden tabs)

### §9.5 — Filmstrip scrub (click a prior meeting frame)

- Center column transitions to Minute Notes tab
- Loaded content: that meeting's captured `accord_nodes` rendered as a read-only note stream
- Stepper in center column header shows `< Meeting N of M >`
- Clicking `< >` steps through workstream meetings chronologically
- Clicking "Agenda" tab or any other affordance returns to current-meeting context

---

## §10 — Intelligence Mode (Private Layer)

### §10.1 — Trigger

`Cmd+I` (Mac) / `Ctrl+I` (Windows/Linux). Toggle: same keystroke closes. `Esc` also closes.

### §10.2 — Visual behavior

- Entire setup shell dims to ~10% opacity with backdrop blur (24px)
- Intelligence panel slides up from bottom center, width ~75% of viewport, max-height ~80vh
- Panel background: deep dark (`#0a0e14`), distinct from shell background
- `PRIVATE VIEW` watermark in bottom-right corner (subtle, mono, 11px, 0.15 opacity)
- `Esc or Cmd+I to close` hint in top-right corner of panel

### §10.3 — Panel content (sections)

**Per-attendee intelligence:** full pattern data from the Anticipation column of mockup v5 — pattern tags, urgency math, owed lines, behavioral derivations. Organized as attendee cards identical to mockup v5's `.ant-attendee` design. This is the information moved out of the public right column.

**Hot-button items:** agenda items and open decisions flagged as politically charged. Derived from: `tag='dissent'` nodes in lineage, `dissent_recorded_at` within 30 days, unresolved `accord_nras` on attending-owned decisions.

**Operator private notes:** `accord_meeting_intel_notes` table (new — Wave 2 migration):
- `note_id UUID PK`
- `firm_id UUID`
- `meeting_id UUID FK → accord_meetings`
- `author_resource_id UUID FK → resources`
- `body TEXT`
- `is_private BOOLEAN DEFAULT TRUE`
- `created_at TIMESTAMPTZ`

Private notes visible only to the author. Never appear in meeting minutes, never shared, never logged in the public record. Operator types inline within the intelligence panel. Autosave on input (debounced 800ms).

**Risk surface:** `RX-xxx` items surfaced in context of this meeting's agenda items. "FDA 510(k) window: 23 days. RX-014 unmitigated."

### §10.4 — Intelligence derivation (v1 — no AI required)

All intelligence in v1 is substrate-derived, not AI-inferred:
- Pattern tags (ENGAGED/DISSENT SIMMERING/etc.): computed from NRA history, dissent frequency, action overdue rate, days-off-substrate
- Urgency math: NRA days-since-declared, dissent `dissent_recorded_at` age, action overdue duration
- Owed lines: open `accord_belief_adjustments`, actions by owner, unresolved dissents
- Hot-button: dissent nodes in workstream lineage, NRAs on decisions owned by attendees

AI synthesis (when commissioned in a future CMD) upgrades the derivation layer without changing the panel structure or the Cmd+I mechanic.

---

## §11 — Footer Zone

### §11.1 — Verdict pill (left)

Three states:
- **GO** (green): all outcomes have owners, all attendees invited, duration set, no overdue critical-path actions
- **GO WITH CAVEATS** (amber): minor readiness gaps (attendee not yet responded, no duration set, minor overdue)
- **NOT READY** (rose): blocking gaps (no outcomes defined, required attendee declined)

Hover/click: popover with readiness breakdown (checklist of what's contributing to the verdict).

### §11.2 — Budget bar (center)

`TIME BUDGET` label + `[██████████░░░] 47m used · 13m slack`

Computed: sum of `accord_agenda_items.duration_minutes_estimate` vs `accord_meetings.duration_minutes`. Fill color: cyan → amber → rose as utilization increases. When no item estimates are set, bar shows only `duration_minutes` as an unmarked block.

Warning pills to the right of bar: "Tom unconnected · pattern says he runs late" / "Amara off-substrate 14d". Derived from attendee status + substrate data.

### §11.3 — Action buttons (right)

- `Save & invite` — saves current state, dispatches invitations (CMD-ACCORD-MEETING-INVITATIONS-1 scope)
- `Begin Meeting →` — `Accord.startMeeting()` → transitions to 5-tab running-meeting shell

---

## §12 — Visual Language

### §12.1 — Token reference (from mockup v5)

```css
--bg-deep:       #0a0e14
--bg-pane:       #11161e
--bg-elevated:   #161c26
--bg-tile:       #1a212c
--border-subtle: rgba(255,255,255,0.06)
--border-mid:    rgba(255,255,255,0.12)
--border-active: rgba(94,234,212,0.4)
--text-primary:  #e8edf2
--text-secondary:#8a95a5
--text-tertiary: #5a6678
--text-faint:    #3a4456
--accent-cyan:   #5eead4
--accent-amber:  #fbbf77
--accent-rose:   #fb7185
--accent-violet: #a78bfa
--accent-green:  #4ade80
--accent-yellow: #facc15
--font-sans:     system-ui / Inter
--font-mono:     SF Mono / JetBrains Mono / Fira Code
--font-serif:    Lora / Charter / Georgia
```

### §12.2 — Typography rules

- Meeting title: serif 25px, weight 500
- Column titles: serif 16px, weight 500
- Section labels: mono 9px, uppercase, letter-spacing 1.4px
- Body text: sans 12-13px, line-height 1.5
- Synthesis/briefing serif italic: 14px minimum, line-height 1.6
- Meta / substrate IDs: mono 9.5-11px
- All text in any rendered surface: minimum 11px (IR38 floor)

### §12.3 — Accord vs. mockup v5 token reconciliation

The mockup v5 uses a distinct color palette (cyan-dominant) vs. the current Accord production palette (amber/signal-dominant). **Wave 1 ships the mockup v5 palette for the Setup shell specifically.** This is the Meeting Setup visual language. The running-meeting 5-tab shell retains the production Accord palette. The two surfaces have distinct visual identities — Setup is preparatory (cooler, more structured), Running is live (warmer, more reactive). This distinction is intentional.

---

## §13 — Substrate Requirements

### §13.1 — Wave 1 migrations (required before any surface work)

| Table | Change | Purpose |
|---|---|---|
| `accord_meetings` | `ADD COLUMN stakes TEXT NULL` | Header Stakes field |
| `accord_meetings` | `ADD COLUMN location TEXT NULL` | Header WHERE metadata |
| `accord_agenda_items` | `ADD COLUMN item_type TEXT NULL` | NRA-shape pill (DECIDE/ASSIGN/INFORM/RISK/QUESTION) |
| `accord_agenda_items` | `ADD COLUMN duration_minutes_estimate INT NULL` | Per-item time estimate for budget bar |
| NEW `accord_meeting_outcomes` | Full table (see §5.2 schema) | Outcomes-as-list |
| NEW `accord_meeting_attendees` | Full table (see §6.2 schema) | Curated attendee list |

### §13.2 — Wave 2 migrations

| Table | Change | Purpose |
|---|---|---|
| NEW `accord_meeting_intel_notes` | Full table (see §10.3 schema) | Operator private notes in Intelligence Mode |

### §13.3 — Existing substrate confirmed sufficient for

- Briefing synthesis (via `briefing_text`, existing)
- Prior actions (via `accord_nodes` tag='action', existing)
- Prior decisions (via `accord_nodes` tag='decision', existing)
- Dissent tracking (via `accord_nodes.dissented_by`, existing)
- NRA badges (via `accord_nras` + `accord_nras_current`, existing)
- Filmstrip (via `accord_meetings` + `accord_nodes`, existing)
- Action item kanban (via `accord_nodes` tag='action' + `due_date`, existing)
- Cross-references (via `accord_edges`, existing)
- Belief adjustments (via `accord_belief_adjustments`, existing)

---

## §14 — Implementation Wave Plan

### Wave 1 — Foundation wiring (~5 CMDs, 2-3 weeks)

**Goal:** Setup shell looks like mockup v5. Structurally correct. Operator recognizes it immediately.

| CMD | Scope |
|---|---|
| `CMD-ACCORD-SETUP-LAYOUT-1` | 5-zone CSS grid; full-page host; drag-resize columns; mockup v5 token palette; no content yet |
| `CMD-ACCORD-SETUP-HEADER-1` | Meeting title, Stakes, location, schedule meta, FOLLOW-UP/FIRST-EVER toggle; `stakes` + `location` migration |
| `CMD-ACCORD-SETUP-OUTCOMES-1` | `accord_meeting_outcomes` substrate + center column outcomes block above agenda |
| `CMD-ACCORD-SETUP-ATTENDEES-1` | `accord_meeting_attendees` substrate + right column roster (public-safe cards only) |
| `CMD-ACCORD-SETUP-FILMSTRIP-2` | Full-width filmstrip zone with drag-resize, 3 density states, scrub-to-Minute-Notes |

### Wave 2 — Intelligence and depth (~5 CMDs, 3-4 weeks)

**Goal:** Setup shell behaves like mockup v5. All panels populated. Intelligence Mode operational.

| CMD | Scope |
|---|---|
| `CMD-ACCORD-SETUP-BRIEFING-TABS-1` | Left column tabs (Briefing/Decisions/Risks); enhanced briefing content; Risk Register consumption |
| `CMD-ACCORD-SETUP-AGENDA-ENHANCED-1` | Agenda item types; time estimates; prep prompt; drag-to-reorder; `item_type` + `duration_minutes_estimate` migration |
| `CMD-ACCORD-SETUP-INTELLIGENCE-1` | Cmd+I overlay; private layer; `accord_meeting_intel_notes` substrate; substrate-derived pattern data |
| `CMD-ACCORD-SETUP-ACTION-KANBAN-1` | Action Items time-anchored kanban + calendar view in right column tab |
| `CMD-ACCORD-SETUP-SLIDESHOW-1` | Auto-rotation; stepper; freeze-on-hover; progress indicator; asymmetric column policies |

### Wave 3 — Refinement and close (~3 CMDs, 1-2 weeks)

**Goal:** Full interaction layer. Every element alive. Product matches + exceeds mockup.

| CMD | Scope |
|---|---|
| `CMD-ACCORD-SETUP-PERCOLATE-1` | Click-to-percolate-by-person across all panels |
| `CMD-ACCORD-SETUP-GATHERING-1` | Gathering mode auto-engage; 5-min warning; temporal state transitions |
| `CMD-ACCORD-SETUP-VERDICT-1` | Footer verdict pill with readiness computation; budget bar with item estimates; warning pills |

### Post-Wave 3 (future CMDs, not yet sequenced)

- `CMD-ACCORD-MEETING-ATTACHMENTS-1` — Carried References, file attachments
- `CMD-ACCORD-MEETING-INVITATIONS-1` — Save & invite flow
- `CMD-ACCORD-OUTCOME-RATIFICATION-1` — Post-meeting outcome marking; workstream achievement rate metrics
- `CMD-ACCORD-BRIEFING-SYNTHESIS-1` — AI-powered briefing synthesis via Anthropic API (upgrades the `briefing_text` derivation layer)
- `CMD-ACCORD-ATTENDEE-PATTERNS-1` — AI-powered per-attendee pattern inference (upgrades the Intelligence Mode derivation layer)
- CPM/PERT consumption in Risks tab (pending ProjectHUD CPM substrate)
- Sentiment integration (behavioral pattern expression only; no raw sentiment scores)

---

## §15 — Architectural Constraints

All CMD implementations against this spec must respect:

- **`var` only** — no `let`/`const` in any surface JavaScript
- **Iron Rules 36-73** — in full force; current canon as of 2026-05-09
- **IR73** — state-machine substrates (including `accord_meeting_outcomes.status`) ship UPDATE RLS as disjoint per-transition policies
- **IR72** — Phase 1 of any CMD touching shared conventions includes cross-module survey
- **IR71** — no state mutation before invalidation; DOM references re-queried after async operations
- **Style Doctrine v1.8 §3.8** — module palette: mockup v5 tokens for Setup shell; Accord amber/signal palette for running-meeting shell
- **IR65** — version pin bump on every surface-touching CMD; operator-managed
- **Arial/system-ui ≥12pt / mono ≥14pt** — overridden by §12.2 minimums which are higher
- **Null-guard doctrine candidate** (4 data points, MEETING-SETUP chain, awaiting cross-CMD ratification) — all DOM element access guarded before mount
- **Sequential PATCHes** for any multi-row state mutation; `Promise.all` only for independent read-only fetches
- **`accord-transitions.js`** — never modified by Setup shell CMDs; all navigation routes through `Accord.setLevel()` or `accord:level-changed` dispatch

---

## §16 — Open Questions (to resolve before or during Wave 1)

1. **`accord_meeting_outcomes` RLS posture** — firm-wide readable + organizer-only writable? Or any-attendee writable? To be resolved in CMD-ACCORD-SETUP-OUTCOMES-1 Phase 1.
2. **`accord_meeting_attendees` population** — manual (organizer adds per meeting) or auto-populated from workstream member history? Both modes may be needed. Phase 1 investigation item.
3. **Agenda drag-to-reorder substrate** — current `position` column is sufficient; drag implementation replaces up/down chevrons. No schema change required.
4. **Filmstrip Minute Notes tab** — `accord_nodes` rendered as read-only stream. Node rendering reuses `accord-capture.js` pattern or is a standalone minimal renderer? To be determined in CMD-ACCORD-SETUP-FILMSTRIP-2.
5. **Stakes vs. Briefing trigger** — `stakes` column needs same state-gate trigger as `briefing_text` (immutable once `state='running'`). Should both be covered by one trigger or separate? Recommend one combined trigger that checks either column change.

---

## §17 — Document Maintenance

This specification should be updated when:
- A Wave CMD seals with findings that revise a design decision
- Operator dispositions an open question (§16)
- A new Iron Rule is ratified that affects the Setup shell
- A substrate schema changes from what is specified in §13

**Version history:**
- v1.0 — 2026-05-09 — Initial specification. Authored post CMD-ACCORD-MEETING-SETUP-1 seal.

---

*End of Accord Meeting Setup Shell — Requirements Specification v1.0*
*Operator: Vaughn Staples · Architect: Claude (Pluto) · 2026-05-09*
