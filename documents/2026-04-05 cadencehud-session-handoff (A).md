# CadenceHUD Session Handoff
*Generated April 5, 2026 — paste this into a new thread to continue*

---

## Platform Architecture

**ProjectHUD** — Project management operations. Task lists, KPIs, Gantt charts, user profiles.
**Compass** — Personal workspace. KPIs, timesheet, live team/project status views.
**CadenceHUD** — Workflow authoring, simulation, and certification. (Transformation discussion below.)

**Supabase project:** `dvbetgdzksatcgdfftbs`
**Firm ID:** `aaaaaaaa-0001-0001-0001-000000000001`
**User:** Vaughn Staples · `vstaples@projecthud.com`
**Prod URL:** `projecthud.com`

**Template under test:** Design Review Signoff
**Template ID:** `adb982b4-5c4e-4f91-bccd-f657ed589683`
**Version:** `0.0.13`

---

## Iron Rules (always enforce)

- `var` + existence guards in all JS, bare globals (`window._xxx`)
- Orange console badge on every version change
- Font: Arial, minimum 12px everywhere; monospace minimum 13px
- Inline `onclick` in JS-string HTML: always zero-arg global functions or `data-*` attributes
- Never use `form_submissions` table — use `workflow_form_definitions` + `workflow_form_responses`
- `script` column in `bist_test_scripts` is jsonb wrapping text — always use `script #>> '{}'` to extract, `to_jsonb(...)` to re-wrap
- `bist_runs` has no `template_id` column — always query by `script_id=in.(...)`
- Muted gray (`rgba(255,255,255,.3)` / `var(--se-mu)`) is BANNED for section titles/headers — use `#5fd4c8` (teal)
- Communication style: terse. Diagnosis + fix + file only.

---

## File Versions (end of session)

| File | Version | Notes |
|------|---------|-------|
| `cadence.html` | S9.54 | Cache-buster SE27 |
| `cdn-script-editor.js` | SE27 | Comprehensive generator, X close, assertion labels |
| `cdn-template-editor.js` | v20260403-D | Tests button removed from Library |
| `cdn-bist.js` | SE14 | script_snapshot captured on every run |

**Script tag cache-busters in cadence.html:**
```
cdn-script-editor.js?v=20260404-SE27
cdn-template-editor.js?v=20260403-S9
cdn-bist.js?v=20260404-BQ
```

---

## Schema Changes Made This Session

```sql
-- Run migration_bist_runs_snapshot.sql if not yet deployed:
ALTER TABLE bist_runs ADD COLUMN IF NOT EXISTS script_snapshot  jsonb;
ALTER TABLE bist_runs ADD COLUMN IF NOT EXISTS acknowledged_by  uuid;
ALTER TABLE bist_runs ADD COLUMN IF NOT EXISTS acknowledged_at  timestamptz;
```
**Status:** Confirmed deployed. All 3 columns verified present.

---

## Simulator Tab Architecture

### Layout
- **Sub-bar:** template `<select>` dropdown, gate indicator, Certificate + Run All Tests buttons
- **Left rail:** Test Scripts list (max-height 260px, scrollable), Workflow Steps palette, Release Readiness, Script Suite Health
- **Right panel:** context-aware — 4-phase animated wizard (no scripts), launch+history (scripts exist), script editor (script clicked)

### Key Functions in cadence.html
- `_s9OnTemplateSelect(id)` — calls `selectTemplate(id)` (Library function), then re-renders
- `_s9RenderSimPanel(el)` — full 3-panel layout
- `_s9LoadSimScripts(templateId, version)` — fetches scripts + runs, updates left rail + gate
- `_s9OpenScriptEditor(scriptId)` — opens seOpenEditor with scriptId pre-selected
- `_s9ShowCert()` — creates cert overlay at body level (position:fixed)
- `_s9BuildWizardDag()` / `_s9BuildWizardDagFromSteps(el, steps)` — real vertical DAG
- `_s9UpdateSuiteHealth(passing, failing, lastRunDate)` — suite health bar

### Gate Indicator Behavior
- **Not yet run:** amber, not clickable
- **All passing:** green, Certificate button shown
- **Failing:** red, clickable → opens first failing script; cert button hidden

---

## Script Editor (cdn-script-editor.js) Architecture

### Key Design Decisions
- **Left panel:** Action Blocks only (148px) — Scripts list and Template Steps removed (live in Simulator left rail)
- **Right panel:** This Script status + inline Run History (this script only) + Step Properties + Gate
- **`seOpenEditor(templateId, targetElId, preSelectScriptId)`** — target-agnostic, 3rd param pre-selects
- **`_seLastRunPerScript`** — O(1) index built after fetch; fixes crowding from high-frequency scripts
- **`_seSessionRuns`** — badge shows NOT RUN until run this session; PASSING/FAILING only after running
- **`_seDisplayPath(check)`** — display alias: `instance.status` → `workflow.status` (Option A, display only)

### Assertion Row Layout (3 columns)
```
[Plain-English label 150px] [step[N].property in teal 140px] [eq value]
```
Labels derived from context:
- `step[N].state` where N === cardSeq → "This task end state:"
- `step[N].outcome` where N === cardSeq → "This task action:"
- `step[N].state` where N === cardSeq+1 → "Next task state:"
- `step[N].loops` → "This task loop count:" / "Step N loops:"
- `instance.status` → "Workflow status:" (displayed as `workflow.status`)

### Card Behavior
- Instance Launch (Step 0): always expanded, not deletable (🔒), default asserts locked
- All other cards: collapsed by default, expand on click
- Step labels: "Step 0" (Launch), "Step 1–N" (workflow steps)

### Comprehensive Generator (`seShowComprehensiveGenerator()`)
- Reads `_seTmplSteps`, enumerates all routing paths (happy + each rejection variant)
- Modal shows each proposed script with: type badge, name, step sequence, engineer note field, checkbox
- Cancel = no action. Create = saves all checked scripts to DB, reloads editor
- Actors set to `[placeholder — assign actor for step N]`

### Run History (inline in right panel)
- This script's runs only, newest first
- Each entry: date/time · version · duration (formatted as Xm Ys)
- Failed runs: which step failed, assertion checked, expected vs actual
- Failing→passing transitions: shows script diff + "✓ Acknowledge review" button
- Acknowledge writes `acknowledged_by` + `acknowledged_at` to `bist_runs`
- "full history" link → `seShowRunHistory()` modal (full table)

---

## UI Conventions Established

- **Section headers:** `#5fd4c8` teal, `font-size:12px`, `font-weight:700`, `letter-spacing:.1em`, `text-transform:uppercase`
- **Muted gray:** only for secondary metadata (dates, step counts) — never titles
- **Backgrounds:** `#0a0c10` unified across Simulator panels (no visible dividers)
- **Confirmations header:** replaces "ASSERTIONS" — reads "CONFIRMATIONS — that run when step completes"
- **Action blocks:** solid-border buttons in toolbar, with multi-line hover tooltips
- **Add-step buttons in toolbar:** `Add: [+ Step] [+ Assert] [+ Wait]` — not at bottom of timeline

---

## What Was Removed From Library Tab

- **Tests button** from Library toolbar (cdn-template-editor.js)
- **`tmpl-tests-panel`** DOM element hidden (`display:none`)
- **`loadTmplTests` hook** removed from cdn-script-editor.js
- Rationale: Library = template authoring only. Simulation belongs entirely in Simulator tab.

---

## Pending / Known Items

### DB Cleanup Done
- Ghost scripts removed. Template `adb982b4` now has exactly 4 scripts:
  - `b6b7c9fc` — Full workflow — clean approval path
  - `979fc7c2` — Meeting reset — design change routes back to step 1
  - `85fd5ffb` — Rejection loop — approval rejects then passes
  - `f3f3d4da` — Sign-off decline — routes back to approval

### T3 DB Fix (from prior session — verify still needed)
```sql
SELECT script #>> '{}' FROM bist_test_scripts
WHERE id = '85fd5ffb-79dd-4570-9cca-6439a9405faf';
-- If route_to_seq:1 still present on s4, remove it
```

### Not Yet Built
- Inline tooltips on assertion fields (agreed, deferred)
- Continuous health monitoring / scheduled test runs
- Production signal integration (instances → simulation correlation)
- Release governance gate (Compass queries CadenceHUD cert status)
- Coverage score KPI (% of routing paths with scripts)
- Flakiness index (intermittent pass/fail detection)

---

## Strategic Direction Discussed

CadenceHUD's transformation from workflow authoring tool → **Workflow Certification & Health Platform**:

1. **Continuous Health Monitoring** — scheduled test suite runs, failure alerts before real users hit them, trend dashboards per workflow
2. **Production Signal Integration** — correlate simulation results against live instance behavior; surface divergence
3. **Release Governance** — Routing Proof Certificate becomes a hard gate; Compass/ProjectHUD query CadenceHUD cert status before allowing workflow launch; certificates expire on modification or time
4. **KPI Layer:** Suite pass rate, mean time to detect, mean time to certify, coverage score, flakiness index, certification age

Identity: *"ProjectHUD manages what gets done. Compass manages who does it. CadenceHUD ensures your processes can be trusted."*
