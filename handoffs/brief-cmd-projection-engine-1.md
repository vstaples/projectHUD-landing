# Brief · Projection Engine refactor + three initial templates · CMD-PROJECTION-ENGINE-1

## §0 — Standing rules for fresh agent

Read before proceeding.

**Iron Rule 36** — hand-off terseness.
**Iron Rule 37** — work silently mid-execution.
**Iron Rule 38** — consumer enumeration in §10.
**Iron Rule 39** — behavioral verification in §9.
**Iron Rule 40** — halt on missing input.
**Iron Rule 42** — substrate immutability holds. This CMD adds rendering capability over substrate; it does not modify substrate state.
**Iron Rule 44** — typed-edge graph as primitive. The projection engine reads edges as substrate; class-conditional treatments derive from edge presence.
**Iron Rule 45** — declared-belief vocabulary preserved across all three templates. No drift to "confidence" / "probability" / "likelihood" / etc.
**Iron Rule 51** — class-conditional treatments at construction time, not post-processing.
**Iron Rule 52 §4** — function-name and logical-concern collision check.
**Iron Rule 56** — multi-segment registered-key parsers; preserved across template additions.
**Iron Rule 60** — first-caller hazard awareness for any new mechanism.
**Iron Rule 64** — the codebase is the spec. The font-loading mechanism, the document register, the page-foot pattern, the editorial typography all follow the established `accord.html` and CMD-A7-POLISH-1 conventions. **Do not invent new mechanisms.**

This is the load-bearing architectural CMD that powers everything downstream. Take it seriously.

---

## §1 — Purpose

The current `render-minutes/index.ts` Edge Function hardcodes one template inside the function body. CMD-A7 shipped this; CMD-A7-POLISH-1 polished its visual register. The architecture works for one-template ProjectHUD but not for the projection engine that ProjectHUD becomes.

After this CMD ships, the Edge Function becomes a **projection engine**. The same function emits any of three (and eventually many more) rendered artifacts based on input parameters. The render template is no longer hardcoded; it is loaded from a template registry. Adding a new template becomes a configuration entry, not a code change.

After CMD-PROJECTION-ENGINE-1 ships:

1. The render-minutes Edge Function accepts a `template_id` parameter alongside the existing `meeting_id` parameter
2. Three template variants are registered and renderable:
   - **`technical-briefing`** — the mockup-aligned, full-pagination Minutes record. **Maps to `minutes-redesigned.html` (architect-provided; see §3.1)**
   - **`executive-briefing`** — one-page summary with KPI strip and four-named-angle executive summary
   - **`personal-digest`** — addressed-to-reader, personalized projection
3. The Minutes surface UI in `accord.html` adds a template-picker affordance; users select which template to render
4. All three templates render against existing substrate; no new fields required
5. The current rendering bug from the screenshots that prompted yesterday's redesign work is closed as a side-effect (the redesigned template lands as the default Technical Briefing)
6. Existing single-template behavior is preserved as a default; calling the Edge Function without `template_id` renders Technical Briefing

This CMD is **architecture refactor + three concrete templates**. The architecture is the harder half.

---

## §2 — Scope

### In scope

- Refactor `supabase/functions/render-minutes/index.ts` to support multiple templates
- Implement template registry pattern (see §4)
- Define and implement three templates per §3
- Update `js/accord-minutes.js` to add template-picker UI in the render-status card
- Update `accord.html` Minutes surface with the picker affordance (HTML-only adjustments; no surface module overhaul)
- Behavioral verification per §6
- Version pin bump to CMD-PROJECTION-ENGINE-1
- RENDER_VERSION constant bumped (per still-provisional R-RENDER-VERSION-DUAL-PIN candidate; F3 finding from CMD-MINUTES-PRINT-FLOW-1)
- Hand-off per §9

### Out of scope

- New substrate fields (counterfactual support is CMD-SUBSTRATE-COUNTERFACTUAL-MIN, separately briefed)
- Counterfactual rendering (CMD-COUNTERFACTUAL-POC, separately briefed after substrate enrichment lands)
- CPM-derived rendering (CMD-CPM-DERIVED, much later)
- Storage bucket changes
- RLS changes
- New CoC event types beyond preserving the existing `accord.minutes.rendered` and `accord.minutes.printed` events
- Changes to the print-flow path (CMD-MINUTES-PRINT-FLOW already shipped)
- Identity refactor (CMD-COC-IDENTITY-HARDENING is queued separately)
- New surface modules
- Mobile-specific template variants (deferred)
- Living Reference projection (CMD-LIVING-REFERENCE, much later)

The agent will be tempted to think ahead to counterfactual support, CPM context, and further template variants. Do not. **Architecture refactor + three working templates against existing substrate. That is the deliverable.**

---

## §3 — The three templates

### §3.1 Technical Briefing (the mockup-aligned, full-pagination Minutes)

**Source:** the architect provides `minutes-redesigned.html` as the canonical template body. The agent does NOT redesign this template; the agent imports it.

**Template body:** `minutes-redesigned.html` is a complete HTML document with embedded CSS, color tokens, typography, layout, page-break behavior, audit footer, and document footer. It was designed yesterday to fix the layout problems surfaced in operator screenshots (page footer bleeding into body, sections sized as if each deserves its own page, mis-sized §N overlines, position:fixed footer breaking continuous-scroll context).

**The agent's task with this template:**

1. Treat `minutes-redesigned.html` as the template body verbatim — preserve all CSS tokens, typography, layout structure, page-break rules, responsive breakpoints
2. Replace the hardcoded data values in the HTML (meeting title "10.5 path1 trigger", organizer "Vaughn Staples", Merkle root "4ead3d7f...", etc.) with template-variable substitutions tied to the substrate query results
3. Map every existing template variable from the current `render-minutes/index.ts` template into the equivalent position in `minutes-redesigned.html` — the variable substitutions in the new template land in the same semantic positions, not necessarily the same DOM positions
4. Verify the redesigned template's `@media print` branch still produces clean print output (the print test flow from CMD-MINUTES-PRINT-FLOW must continue to work)

**Selection rule:** `meeting_scope` for a single meeting (all sealed nodes/edges/declarations for a given `meeting_id`)

**Structural transformation:** chronological with sectional grouping (cover with mast/title/subtitle/meta/Merkle, body with §1 Agenda through §7 Belief Declarations, audit footer, document footer)

**Register:** editorial — slate background, bone foreground, amber accent, Fraunces / IBM Plex Sans / IBM Plex Mono via Google Fonts CDN per CMD-A7-POLISH-1 convention

**Audience:** design review board, engineering team, deep-read auditors, the canonical record

### §3.2 Executive Briefing (one-page summary)

**Source:** new construction by the agent, following the editorial register established by Technical Briefing.

**Distinguishing content:**

- Cover header identical in register to Technical Briefing (mast with brand + overline + amber rule)
- Title and subtitle (meeting title and the executive-summary headline if available; otherwise "Executive Briefing")
- 4-up KPI strip with large amber numerals: **N decisions / N actions / N risks / N questions** — counts derived from substrate
- Single pull-quote of the meeting's top-line outcome. Sourced from a meeting field if available; if not, derive from the highest-gravity decision's summary
- Four named angles, each a 2-3 sentence paragraph:
  - **What Was Decided** — narrative summary of decisions ratified
  - **What's Now in Motion** — narrative summary of action items spawned
  - **What We're Watching** — narrative summary of risks raised or modified
  - **What's Still Unanswered** — narrative summary of open questions

- Footer with attendees count, meeting metadata (organizer, date, sealed-at), and a "Read the full record →" link to the Technical Briefing rendered for the same meeting

**Architect-side data-mapping decision:** since substrate doesn't yet carry an `executive_summary` field (proposed in functional requirements), the agent derives the four angles **algorithmically** from substrate content for v0.1:

- **What Was Decided** = concatenation of decision summaries, prefixed with count
- **What's Now in Motion** = concatenation of action summaries with assignees if present, prefixed with count
- **What We're Watching** = concatenation of risk summaries with severity if present, prefixed with count
- **What's Still Unanswered** = concatenation of question summaries with assignees if present, prefixed with count

The narrative quality will be limited; users may eventually want to author summaries explicitly. That's a future CMD. For now: algorithmic generation is acceptable.

**Selection rule:** `meeting_scope` aggregated to single-page summary

**Structural transformation:** aggregated; KPI rollup; four-angle narrative

**Register:** editorial; tightened spacing for single-page fit

**Audience:** board members, CEO, time-constrained readers

**Reading time target:** 90 seconds

### §3.3 Personal Digest (addressed-to-reader)

**Source:** new construction by the agent.

**Distinguishing content:**

- Cover header identical in register to Technical Briefing
- Title: "Your record from [meeting title]"
- Subtitle: addressed paragraph — "Dear [reader name] — here's what changed in your accountability landscape from the [meeting title] session on [date]."
- Sections, in this order:
  - **Decisions you participated in** — decisions where reader is mover, seconder, or declared belief on. If empty, hide section.
  - **Actions assigned to you** — actions where `assigned_to_user_id` matches reader. If empty, hide section.
  - **Risks you own** — risks where `owner_user_id` matches reader. If empty, hide section. Falls back to risks where `originator_user_id` matches if no owner field is yet in substrate.
  - **Questions awaiting your answer** — questions where `assigned_to_user_id` matches reader. If empty, hide section.
  - **Belief declarations you made** — belief adjustments where `declared_by` matches reader. If empty, hide section.
- Footer with link to full Technical Briefing for the same meeting

**Important:** the substrate may not yet have all the assignment fields populated for older meetings. The Personal Digest must degrade gracefully:

- If a section's filter returns zero results, hide the section entirely (don't render an empty header)
- If ALL sections return zero results for a given reader, render a friendly fallback: "You weren't directly involved in any decisions, actions, risks, or questions in this meeting. Read the full record for context."
- Do NOT fabricate involvement; missing data renders as empty, not as guesses

**Reader context:** the Personal Digest is rendered per-reader. The Edge Function accepts a `reader_user_id` parameter; the template renders with that user's perspective. If `reader_user_id` is omitted, the digest defaults to rendering for the user invoking the Edge Function (their auth context).

**Selection rule:** `meeting_scope` intersected with `personal_scope` (the reader's user_id)

**Structural transformation:** addressed-to-reader; reader's nodes prioritized

**Register:** editorial; email-friendly variant (single-column 600px max-width when rendered for email; full-width when rendered in browser)

**Audience:** the named recipient

**Future use:** Phase 2 will auto-fan Personal Digests to each attendee via the Digest & Send surface. This CMD only needs to render the digest correctly; auto-fanning is deferred.

---

## §4 — Template registry architecture

### §4.1 Registry pattern (PROPOSED, AWAITING ARCHITECT REVIEW DURING CMD)

The agent implements a template registry inside `render-minutes/index.ts`:

```typescript
type TemplateId = 'technical-briefing' | 'executive-briefing' | 'personal-digest';

interface TemplateContext {
  meeting: MeetingRow;
  substrate: SubstrateBundle; // nodes, edges, beliefs for the meeting
  reader_user_id: string | null;
  reader_resource_id: string | null;
  rendered_at: string;
  render_version: string;
}

interface Template {
  id: TemplateId;
  render: (ctx: TemplateContext) => string; // returns HTML
}

const TEMPLATE_REGISTRY: Record<TemplateId, Template> = {
  'technical-briefing': { id: 'technical-briefing', render: renderTechnicalBriefing },
  'executive-briefing': { id: 'executive-briefing', render: renderExecutiveBriefing },
  'personal-digest':    { id: 'personal-digest',    render: renderPersonalDigest },
};
```

Each template is a function `(ctx) => string`. The function reads from the context bundle and returns rendered HTML. The function does not have side effects.

The Edge Function entry point becomes:

```typescript
// 1. Auth + load substrate (existing logic)
// 2. Resolve template_id from request (default 'technical-briefing')
// 3. Build TemplateContext from substrate query results
// 4. const html = TEMPLATE_REGISTRY[template_id].render(ctx);
// 5. Compute content_hash, upload to Storage, mint signed URL, write CoC, broadcast (existing logic preserved)
```

### §4.2 Template variable conventions

Each template function reads from `ctx` using consistent accessor patterns. For Technical Briefing, the agent maps the existing template variables (currently inline string interpolation) into a structured access pattern:

```typescript
// Current (CMD-A7-POLISH-1):
const html = `... <h1>${meeting.title}</h1> ...`;

// New (CMD-PROJECTION-ENGINE-1):
function renderTechnicalBriefing(ctx: TemplateContext): string {
  const { meeting, substrate, rendered_at, render_version } = ctx;
  // ... render logic operating on these inputs
}
```

The agent extracts the substrate query into a shared loader function used by all three templates. Each template then operates on the same `SubstrateBundle` shape; only their selection and rendering differs.

### §4.3 What this CMD does NOT do

The registry pattern is deliberately minimal. It is NOT:

- A plugin architecture (templates cannot be added without redeploying the Edge Function)
- A dynamic template loader (templates are not loaded from database or Storage)
- A theming system (color tokens and typography are template-internal)
- A user-authored templating system (no DSL, no template authoring UI)

These are future capabilities. The minimal registry is sufficient for v1.0 and lets the projection engine evolve from a simple foundation.

---

## §5 — Edge Function request/response contract

### §5.1 Request

The Edge Function continues to accept POST requests with a JSON body. New optional fields:

```typescript
{
  meeting_id: string;          // existing; required
  template_id?: TemplateId;    // new; optional; default 'technical-briefing'
  reader_user_id?: string;     // new; optional; defaults to auth.uid() for personal-digest
}
```

Backward compatibility: existing calls without `template_id` continue to work and render Technical Briefing. The current Minutes surface code that calls the Edge Function does not need to change for backward compatibility.

### §5.2 Response

Unchanged. The function returns the same response shape as CMD-A7e — render row data, signed URL, success/failure indicators.

### §5.3 Storage path

Storage paths gain a template_id segment:

```
{firm_id}/{meeting_id}/{template_id}/{render_id}.{ext}
```

For backward compatibility, renders without a template_id (legacy renders) continue to live at `{firm_id}/{meeting_id}/{render_id}.{ext}`. The Edge Function accepts both path conventions when generating signed URLs for existing renders.

---

## §6 — Behavioral verification

### §6.1 Sentinel — code identity

1. Hard-refresh accord.html. Console banner shows CMD-PROJECTION-ENGINE-1.
2. Verify `_PROJECTHUD_VERSION` matches.
3. Verify Edge Function `RENDER_VERSION` constant matches (curl the function or check via the rendered HTML's footer).
4. **PASS** = post-CMD code is loaded.

### §6.2 Backward compatibility

1. Trigger a render via the existing Minutes surface (no template_id passed).
2. Verify the render completes successfully.
3. Verify the rendered HTML matches Technical Briefing layout (the redesigned template).
4. Verify the existing download link works.
5. Verify the existing print flow works.
6. **PASS** = backward compatibility holds; existing users see better-looking Minutes with no UI changes.

### §6.3 Technical Briefing render

1. Trigger a render with `template_id = 'technical-briefing'` (or no template_id, which defaults).
2. Verify rendered HTML uses the redesigned template (cover with proper layout, sections with integrated §N markers, audit footer with italic Fraunces serif numerals as procedure step counters, document footer inline at end not position:fixed).
3. Verify all substrate data renders correctly: meeting title, organizer, attendees, sealed date, Merkle root, all sections populated.
4. Verify the layout problems from the original screenshots are resolved (no page-footer bleed-through, no giant empty zones, proper §N overline integration).
5. **PASS** = Technical Briefing renders correctly.

### §6.4 Executive Briefing render

1. Trigger a render with `template_id = 'executive-briefing'`.
2. Verify the rendered HTML fits visually in approximately one letter page (when print-rendered).
3. Verify the KPI strip displays correct counts (decisions, actions, risks, questions) for the meeting.
4. Verify the four named angles populate with substrate-derived narrative.
5. Verify the editorial register matches Technical Briefing (same fonts, same color tokens, same overall typography).
6. **PASS** = Executive Briefing renders correctly.

### §6.5 Personal Digest render

1. Trigger a render with `template_id = 'personal-digest'` (reader_user_id implicit from auth).
2. Verify the digest is addressed to the reader by name.
3. Verify only sections relevant to the reader appear; empty sections are hidden.
4. Verify if no sections apply, the friendly fallback message renders.
5. Test with a reader who has decisions/actions/risks/questions in the meeting — verify each populated section appears with correct items.
6. Test with a reader who has nothing in the meeting — verify the fallback message appears.
7. **PASS** = Personal Digest renders correctly with graceful empty-state handling.

### §6.6 Template-picker UI

1. Navigate to Minutes surface, select a meeting with successful render.
2. Verify a template-picker affordance is visible (dropdown, buttons, or similar) showing three options.
3. Pick Executive Briefing; verify it renders (new render row created with template_id).
4. Pick Personal Digest; verify it renders.
5. Pick Technical Briefing; verify it renders.
6. Verify the render-history panel shows all three render variants for the meeting.
7. Verify each can be downloaded and printed independently.
8. **PASS** = users can select among all three templates from the UI.

### §6.7 Determinism preserved

1. Render Technical Briefing twice in succession.
2. Verify content_hashes match (modulo render-timestamp footer line).
3. Render Executive Briefing twice; verify content_hash determinism.
4. Render Personal Digest twice for the same reader; verify determinism.
5. **PASS** = PASS-weak determinism preserved across all three templates.

### §6.8 Doctrinal vocabulary preserved (Iron Rule 45)

1. For each of three rendered templates, grep the HTML for: `confidence` | `probability` | `certainty` | `likelihood` | `posterior` | `prior` | `meter` | `gauge`.
2. **PASS** = zero matches across all three templates (excluding code-styled identifiers like `accord_belief_adjustments`).

### §6.9 Cross-firm Storage isolation

1. As firm A user, render any template for any firm A meeting.
2. As firm B user, attempt to access firm A's render via signed URL or Storage path manipulation.
3. **PASS** = firm isolation holds; rejection at Storage RLS or Edge Function auth.

### §6.10 Three-segment EVENT_META preserved

1. Verify `accord.minutes.rendered` and `accord.minutes.printed` events still fire correctly across all three templates.
2. Verify event_class / event_type parse correctly per Iron Rule 56.
3. **PASS** = no regression in CoC event emission.

### §6.11 Existing CMD regression

1. Verify Live Capture, Living Document, Decision Ledger, Digest & Send all load and operate cleanly.
2. End a meeting; verify auto-render fires with default template (Technical Briefing).
3. Existing pre-CMD-PROJECTION-ENGINE-1 renders remain downloadable from history panel.
4. **PASS** = no regression.

---

## §7 — Consumer enumeration (Iron Rule 38)

| File | Effect |
|---|---|
| `supabase/functions/render-minutes/index.ts` | Major refactor: template registry pattern; three render functions; Edge Function entry routes to registry; Storage path adds template_id segment with backward compat |
| `js/accord-minutes.js` | Template-picker UI added to render-status card; click handler invokes Edge Function with template_id; render history panel groups by template |
| `accord.html` | Minor HTML adjustments to the Minutes surface render-status card to accommodate template-picker affordance |
| `js/version.js` | Pin bump to CMD-PROJECTION-ENGINE-1 |
| `supabase/functions/render-minutes/index.ts` (RENDER_VERSION) | Pin bump (per F3 dual-pin reinforcement) |

Files audited but not modified:

| File | Audit purpose |
|---|---|
| `js/accord-core.js` | Verify auto-render-on-END uses default template; no other coupling |
| `js/coc.js` | Verify EVENT_META entries unchanged; three-segment parser holds |
| `js/api.js` | Verify `invokeEdgeFunction()` helper accepts new template_id field cleanly |
| `accord_minutes_renders` table | Verify schema accommodates template_id (may need migration if not) — see §8 |

---

## §8 — Schema considerations

The `accord_minutes_renders` table (CMD-A7) was designed for one-template-per-meeting. With three templates, multiple renders per meeting per template are possible.

**Architect's call:** add a `template_id` column to the table.

```sql
ALTER TABLE accord_minutes_renders 
ADD COLUMN template_id text NOT NULL DEFAULT 'technical-briefing';
```

The default value preserves the meaning of existing rows (they were Technical Briefing renders before this CMD). The Edge Function populates `template_id` on new renders. The Minutes surface render history can group by template_id when displaying history.

This is a tiny migration. The agent creates it as `supabase/migrations/202605XX000001_render_template_id.sql`. No data backfill required (default value handles it).

---

## §9 — Hand-off format

Required output:

1. Files modified / created — one-liner per file.
2. Diff — full content of the new render functions; unified diff for surface module changes; full content for the migration.
3. Smoke test result.
4. Behavioral verification results — per §6 subtest, with explicit PASS/FAIL/PASS-weak.
5. Findings — zero or more one-liners. Particularly:
   - Whether Technical Briefing template was imported verbatim from `minutes-redesigned.html` or required adaptation; document any adaptation.
   - Personal Digest fallback behavior in practice (how often did test runs hit the empty-state fallback?)
   - Any architectural questions that surfaced during the registry pattern implementation worth flagging for future CMDs.
6. R-RENDER-VERSION-DUAL-PIN observation: confirm whether template body changes triggered the dual-pin requirement (they should have — both `js/version.js` and `RENDER_VERSION` constant both moved in this CMD).

If §6.3, §6.4, or §6.5 (the three render verifications) fail, halt and surface — those are the CMD's primary deliverables.

---

## §10 — Reference materials

Required inputs (halt per Iron Rule 40 §1.1 if any are missing):

- This brief
- `minutes-redesigned.html` — architect-provided redesigned template (canonical Technical Briefing template body)
- The current `supabase/functions/render-minutes/index.ts` source (post-CMD-A7-POLISH-1 + CMD-MINUTES-PRINT-FLOW)
- The current `js/accord-minutes.js` source (post-CMD-MINUTES-PRINT-FLOW-1)
- `accord.html` Minutes surface markup (post-CMD-A7)
- `js/coc.js` (post-CMD-AEGIS-1.1)
- `js/version.js`
- `accord_minutes_renders` schema (the existing table definition)
- `Style_Doctrine_v1_7.md`
- All Iron Rules ratifications 36-64
- `accord-vision-v1.md` — strategic narrative for context (read for understanding; do not architect against)
- `projecthud-functional-requirements-v1.md` — functional requirements compendium (read for context on §3 template specifications)

---

## §11 — Agent narrative instruction block

```
Apply brief-cmd-projection-engine-1.md.

This is the load-bearing architectural CMD that powers everything 
downstream. Take it seriously. The projection engine becomes the 
foundation for counterfactual rendering, CPM-derived rendering, 
morning briefs, personal digests, and every future projection 
ProjectHUD produces.

Three templates ship in this CMD: Technical Briefing (the 
mockup-aligned full-pagination Minutes), Executive Briefing 
(one-page summary with KPI strip and four named angles), and 
Personal Digest (addressed-to-reader, personalized projection).

Critical: the architect provides `minutes-redesigned.html` as the 
canonical Technical Briefing template body. Import this verbatim; 
do not redesign it. Map the existing template variables into the 
new template's positions; preserve all CSS tokens, typography, 
layout, page-break rules, and responsive breakpoints.

Executive Briefing and Personal Digest are new constructions by 
the agent, following the same editorial register established by 
Technical Briefing. §3.2 and §3.3 specify their content and 
behavior. Personal Digest must degrade gracefully when reader 
data is sparse.

Iron Rule 64 strictly applies: do not invent new mechanisms for 
font loading, document register, page-foot patterns, or editorial 
typography. Follow established codebase conventions per 
`accord.html` and CMD-A7-POLISH-1.

§6 specifies eleven behavioral verification subtests. §6.3, §6.4, 
§6.5 are the doctrinal-floor checks (the three templates 
rendering correctly).

Hand-off format per §9: files, diff, smoke test, §6 results, 
findings.

Halt on missing input per §10. Halt if §6.3, §6.4, or §6.5 fail. 
Halt if `minutes-redesigned.html` is unavailable.

Proceed.
```

---

## §12 — Enumerated inputs

Per §10. Critical: `minutes-redesigned.html` is required, not optional. Halt if absent.

---

## §13 — Enumerated outputs

The agent produces:

1. Refactored `supabase/functions/render-minutes/index.ts` with template registry and three render functions
2. New migration `supabase/migrations/202605XX000001_render_template_id.sql`
3. Modified `js/accord-minutes.js` with template-picker UI
4. Modified `accord.html` with template-picker affordance markup
5. Modified `js/version.js` with CMD-PROJECTION-ENGINE-1 pin
6. Hand-off document per §9

No new files beyond the migration. No new tables. No RLS changes. No new buckets.

---

*End of Brief — Projection Engine refactor + three initial templates 
(CMD-PROJECTION-ENGINE-1).*
