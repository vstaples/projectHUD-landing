# Brief · Aegis Playbook Foundation · CMD-AEGIS-PLAYBOOK-FOUNDATION

## §0 — Standing rules for fresh agent

Read before proceeding.

**Iron Rule 36** — hand-off terseness.
**Iron Rule 37** — work silently mid-execution.
**Iron Rule 38** — consumer enumeration in §10.
**Iron Rule 39** — behavioral verification in §9.
**Iron Rule 40** — halt on missing input.
**Iron Rule 42** — substrate immutability holds. Published playbooks are immutable; drafts are mutable; supersession produces new substrate rows, not in-place modifications.
**Iron Rule 44** — typed-edge graph as primitive. Playbook supersession is captured via a typed `supersedes` edge.
**Iron Rule 51** — class-conditional treatments at construction time.
**Iron Rule 52 §4** — function-name and logical-concern collision check.
**Iron Rule 53** — sentinel testing for JS verification.
**Iron Rule 55** — architect-side canonical-source verification. The agent surveys current `cmd-center.js` script-handling logic before refactoring.
**Iron Rule 56** — multi-segment registered-key parsers are preserved across new event types.
**Iron Rule 57** — public API window assignment for any new global surfaces (`window.AegisPlaybooks` if exposed).
**Iron Rule 58** — application-code users.id → resources.id resolution at write-site (preserve through any new CoC writers introduced).
**Iron Rule 60** — first-caller hazard awareness for any new mechanism (Supabase migration of localStorage data; multi-state lifecycle on substrate rows; library UI surfaces).
**Iron Rule 61** — cache-bust query strings derive from global `_PROJECTHUD_VERSION` (no hardcoded module pins).
**Iron Rule 62** — Supabase Storage `contentType` is metadata, not serving directive (does not fire here; no Storage objects involved).
**Iron Rule 63** — Edge Function library compatibility (does not fire here; no Edge Functions involved).
**Iron Rule 64** — codebase-as-spec. **Strictly applies.** The agent surveys `cmd-center.js`'s existing script-handling patterns, the `coc_events` table convention, the `accord_meetings`/`accord_nodes` substrate patterns, and the existing surface conventions before introducing any new mechanism. Match established patterns; do not invent.
**Iron Rule 65** — render-version dual-pin applies only to template body changes. **This CMD does NOT modify any render template body bytes; `RENDER_VERSION` does NOT need to move. Bump only `js/version.js`.**

This is the largest CMD since the original Accord build arc. The architectural decisions baked into this CMD constrain every future Aegis-runnable artifact and the entire regression-testing infrastructure that follows. Take it seriously.

---

## §1 — Purpose

Aegis currently stores executable artifacts ("scripts") in browser localStorage under `phud:scripts:{name}`. This is per-browser, per-domain, lost on cache clear, not shared across sessions or users. Suitable for early-Aegis personal scripts; insufficient for institutional artifacts that:

- Capture verification flows for every shipping CMD (per CMD-AEGIS-VERIFICATION-PATTERN convention; lands the convention into substrate)
- Become the basis for routine regression testing across the firm
- Need cross-user accessibility (one team member authors; another team member runs)
- Carry audit-trail provenance (when was this playbook last run; what was the result; what version of this playbook ran)
- Support lifecycle management (draft → published → superseded → archived)
- Require categorization and tagging at scale (~25 today; ~200+ within six months)

This CMD reframes "scripts" as **playbooks** — first-class substrate-anchored artifacts that participate in Chain of Custody when published, support lifecycle states, carry typed metadata, and live in a proper firm-scoped Library surface in Aegis.

After CMD-AEGIS-PLAYBOOK-FOUNDATION ships:

1. **Playbooks live in Supabase substrate** (firm-scoped via RLS), not localStorage
2. **Each playbook has lifecycle state**: `draft | published | superseded | archived`
3. **Published playbooks are immutable** (Iron Rule 42); modification produces a new version with `supersedes` pointer
4. **Each playbook carries typed metadata**: `kind` enum, free-form tags, owner, last-run state
5. **The Aegis SCRIPTS rail is replaced** with a proper Library surface (multi-column, search, filter, detail pane)
6. **Existing localStorage scripts migrate** into Supabase as drafts on first load (one-time migration)
7. **Run history is captured per playbook** (CoC-anchored events: `aegis.playbook.run_started`, `aegis.playbook.run_completed`, `aegis.playbook.run_failed`)
8. **The naming convention shifts firm-wide**: "scripts" → "playbooks" in UI, in code, in conversation, in future briefs

---

## §2 — Scope

### In scope

- Schema migration creating `aegis_playbooks` table, `aegis_playbook_runs` table, RLS policies, and supersedes edge mechanism
- Refactor `cmd-center.js` to read playbooks from Supabase instead of localStorage
- Migration logic: on first run after deploy, migrate existing localStorage `phud:scripts:*` entries into `aegis_playbooks` as drafts owned by the current user
- Replace SCRIPTS rail in Aegis with a Library surface (multi-column layout per §5)
- Authoring affordances: metadata fields (kind, tags, description, owner), lifecycle transitions (publish, supersede, archive)
- Run-history capture: every playbook execution writes CoC events
- Library health indicators: last-run timestamp, last-run status, stale flag (no run in N days, configurable)
- New Aegis verbs (if needed) for lifecycle transitions; investigate before specifying
- Behavioral verification per §9
- Pin bump to `js/version.js` (no `RENDER_VERSION` change per Iron Rule 65)
- Hand-off per §11

### Out of scope

- **Scheduled re-runs / automated regression** — explicitly deferred to a future CMD (CMD-AEGIS-REGRESSION-SCHEDULER or similar). The substrate this CMD lays down (playbook library + run history) is what scheduled re-runs will eventually consume; the scheduler itself is a separate concern.
- **Structured authoring UX** (verb autocomplete, parameter prompting, dry-run mode) — deferred. Authoring stays in the existing Editor tab with metadata-field additions only.
- **Cross-firm playbook sharing** — playbooks are firm-scoped per RLS; cross-firm sharing is a separate architectural concern.
- **Playbook templates / parameterization** — playbooks remain text-with-variables as today; richer templating is a future CMD.
- **Playbook authoring permissions** (RBAC for who can publish vs. who can edit drafts) — for v1, every firm-member can author/publish; granular permissions are a future CMD.
- **Aegis runner enhancements beyond what's required to load from substrate** — e.g., the existing `Run`, `Register`, `Wait ForConsole`, `Pause`, etc. verbs are not modified beyond plumbing changes for substrate reads.
- **Existing CMD-AEGIS-VERIFICATION-PATTERN follow-up** (the convention CMD that authored two reference exemplar scripts) — those scripts will be migrated to playbook-substrate as part of this CMD's migration step, but no new exemplars are authored here.
- **Render template changes** — Iron Rule 65 does not fire.

---

## §3 — Substrate architecture

### §3.1 The `aegis_playbooks` table

```sql
CREATE TABLE aegis_playbooks (
  playbook_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id            uuid NOT NULL REFERENCES firms(firm_id),
  name               text NOT NULL,
  body               text NOT NULL,                    -- the script text (Aegis verb sequence)
  description        text,                              -- one-paragraph human description
  kind               text NOT NULL CHECK (kind IN
                       ('verification', 'runbook', 'demonstration', 'fixture', 'exploration')),
  tags               text[] DEFAULT '{}',               -- free-form tags
  state              text NOT NULL DEFAULT 'draft' CHECK (state IN
                       ('draft', 'published', 'superseded', 'archived')),
  version            integer NOT NULL DEFAULT 1,        -- monotonic per name within firm
  supersedes_id      uuid REFERENCES aegis_playbooks(playbook_id),
                                                        -- points at the prior version this one supersedes
  origin_cmd         text,                              -- e.g., 'CMD-PROJECTION-ENGINE-2'; optional
                                                        -- captures which CMD originated/owns this playbook
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid NOT NULL REFERENCES users(id),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  published_at       timestamptz,                       -- set when state transitions to 'published'
  archived_at        timestamptz,                       -- set when state transitions to 'archived'
  last_run_at        timestamptz,                       -- updated by run-completion CoC writes
  last_run_status    text CHECK (last_run_status IN
                       ('pass', 'fail', 'aborted', 'error')),
                                                        -- last run outcome; null if never run
  playbook_hash      text,                              -- SHA-256 of body+metadata at publish time
                                                        -- null while in draft state
  prev_hash          text,                              -- chain pointer to prior CoC event (set at publish)

  UNIQUE (firm_id, name, version)
);

CREATE INDEX aegis_playbooks_firm_state_idx ON aegis_playbooks (firm_id, state);
CREATE INDEX aegis_playbooks_firm_kind_idx ON aegis_playbooks (firm_id, kind);
CREATE INDEX aegis_playbooks_firm_name_idx ON aegis_playbooks (firm_id, name);
CREATE INDEX aegis_playbooks_supersedes_idx ON aegis_playbooks (supersedes_id) WHERE supersedes_id IS NOT NULL;
```

Critical invariants:

1. **Drafts are mutable**: `body`, `description`, `kind`, `tags`, `name` can change; `updated_at` advances.
2. **Published playbooks are immutable**: triggers reject UPDATE on rows where `state = 'published'` (except for `last_run_at`, `last_run_status`, and `state` transitions to 'superseded' or 'archived' — these are the only allowed mutations).
3. **Version monotonicity**: within `(firm_id, name)`, versions are strictly increasing. Publishing a draft of an existing-name playbook auto-increments version to `MAX(version)+1` and sets `supersedes_id` to the prior published version.
4. **Hash anchoring at publish**: when state transitions draft→published, compute `playbook_hash = sha256(body || description || kind || tags_canonical || version || created_by)` and write `prev_hash` to chain into the firm's CoC.

### §3.2 The `aegis_playbook_runs` table

```sql
CREATE TABLE aegis_playbook_runs (
  run_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id            uuid NOT NULL REFERENCES firms(firm_id),
  playbook_id        uuid NOT NULL REFERENCES aegis_playbooks(playbook_id),
  started_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  started_by         uuid NOT NULL REFERENCES users(id),
  status             text NOT NULL DEFAULT 'running' CHECK (status IN
                       ('running', 'pass', 'fail', 'aborted', 'error')),
  abort_reason       text,                              -- populated on aborted/error
  transcript_summary text,                              -- last N lines of transcript; bounded
  command_count      integer,                           -- number of commands executed
  duration_ms        integer,                           -- computed at completion
  playbook_version   integer NOT NULL,                  -- the version that ran (for historical reproducibility)
  playbook_hash      text                               -- the playbook_hash at run time (for tamper-detection)
);

CREATE INDEX aegis_playbook_runs_firm_playbook_idx ON aegis_playbook_runs (firm_id, playbook_id, started_at DESC);
CREATE INDEX aegis_playbook_runs_firm_status_idx ON aegis_playbook_runs (firm_id, status);
```

Each run is its own row. Once written, runs are immutable (no UPDATE). Status transitions from 'running' → 'pass'/'fail'/'aborted'/'error' happen via a new INSERT with same `run_id` overwritten — no, that's wrong. Correct mechanism: the `started_at` row is created with `status='running'`; on completion, the SAME row's `status`, `completed_at`, `transcript_summary`, `command_count`, `duration_ms` are updated. This is the one allowed mutation; the substrate trigger permits it.

Run rows trigger CoC events (see §3.4).

### §3.3 RLS policies

```sql
ALTER TABLE aegis_playbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY aegis_playbooks_firm_select ON aegis_playbooks
  FOR SELECT USING (firm_id = my_firm_id());

CREATE POLICY aegis_playbooks_firm_insert ON aegis_playbooks
  FOR INSERT WITH CHECK (firm_id = my_firm_id());

CREATE POLICY aegis_playbooks_firm_update ON aegis_playbooks
  FOR UPDATE USING (firm_id = my_firm_id())
  WITH CHECK (firm_id = my_firm_id());

CREATE POLICY aegis_playbooks_firm_delete ON aegis_playbooks
  FOR DELETE USING (firm_id = my_firm_id() AND state = 'draft');
  -- Only drafts can be hard-deleted; published/superseded/archived
  -- are kept forever (Iron Rule 42 immutability).

ALTER TABLE aegis_playbook_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY aegis_playbook_runs_firm_select ON aegis_playbook_runs
  FOR SELECT USING (firm_id = my_firm_id());

CREATE POLICY aegis_playbook_runs_firm_insert ON aegis_playbook_runs
  FOR INSERT WITH CHECK (firm_id = my_firm_id());

CREATE POLICY aegis_playbook_runs_firm_update ON aegis_playbook_runs
  FOR UPDATE USING (firm_id = my_firm_id())
  WITH CHECK (firm_id = my_firm_id() AND status = 'running');
  -- Only running rows can transition to terminal status.

CREATE POLICY aegis_playbook_runs_no_delete ON aegis_playbook_runs
  FOR DELETE USING (false);
```

Per Iron Rule 42, runs are append-only. Per Iron Rule 64, the policy structure mirrors `accord_meetings` / `accord_nodes` conventions.

### §3.4 CoC event types

Three new event types (three-segment per Iron Rule 56):

| Event class | Event type | When |
|---|---|---|
| `aegis` | `playbook.published` | When a draft transitions to published |
| `aegis` | `playbook.run_started` | When a run row is INSERTed |
| `aegis` | `playbook.run_completed` | When a run row's status transitions to terminal |

Each event fires via the existing `coc_events` table mechanism, with `actor_resource_id` resolved per Iron Rule 58 from the user's session. Metadata payload includes `playbook_id`, `playbook_name`, `playbook_version`, `playbook_kind`. For run events, also includes `run_id`, `status`, `duration_ms` (where applicable).

The `EVENT_META` registry in `js/coc.js` gains three entries; agent surveys the existing pattern (CMD-AEGIS-1.1 conventions; CMD-A6 three-segment parser per Iron Rule 56) before adding.

### §3.5 The supersedes mechanism

When a draft of an existing-name playbook is published:

1. Locate the prior published version: `SELECT playbook_id, version FROM aegis_playbooks WHERE firm_id = X AND name = Y AND state = 'published' ORDER BY version DESC LIMIT 1`
2. Set the new playbook's `supersedes_id = prior.playbook_id` and `version = prior.version + 1`
3. UPDATE the prior playbook's `state` from 'published' to 'superseded'
4. The new playbook transitions from 'draft' to 'published' atomically (one transaction)
5. Compute and store `playbook_hash` and `prev_hash` on the new published row
6. Fire `aegis.playbook.published` CoC event with metadata indicating the supersession chain

The library UI shows the current published version by default; version history (the supersedes chain) is accessible via a "version history" affordance on the detail pane. Superseded versions remain runnable (the `Run` verb still accepts them) but the library marks them clearly as superseded.

---

## §4 — Migration from localStorage

On first load after deploy, `cmd-center.js`'s init detects existing `phud:scripts:*` entries in localStorage and migrates them to substrate.

Migration logic:

1. Enumerate all localStorage keys matching `phud:scripts:*`
2. For each, extract the script body
3. Check substrate: does a playbook with `(firm_id = current, name = script_name)` already exist? If yes, skip (no duplicate; user already has a substrate playbook for this name)
4. If no, INSERT into `aegis_playbooks` with:
   - `name = script_name`
   - `body = localStorage.getItem(key)`
   - `kind = 'exploration'` (the catch-all default; user can refine later)
   - `tags = ['migrated-from-localstorage']`
   - `state = 'draft'`
   - `description = 'Migrated from localStorage; original purpose to be classified.'`
   - `created_by = current user`
   - `origin_cmd = null`
5. After successful migration, the localStorage entry is **NOT deleted** in v1 (defensive — preserves the source-of-truth on the local browser if anything goes wrong). A future cleanup CMD removes localStorage entries once migration is verified at scale.
6. Migration runs once per browser session per user; subsequent loads skip migration if `localStorage.getItem('phud:playbooks-migrated') === 'true'`.
7. Migration completion sets the flag and logs a summary to console: `[Aegis] Migrated N playbooks from localStorage to substrate.`

Edge cases the agent handles:

- localStorage has an entry but substrate insert fails (e.g., network) → log error; do NOT mark migration complete; retry on next load
- localStorage has many entries (hundreds) → migration runs in batches; UI shows progress
- localStorage entry is empty or malformed → skip with a warning log
- User runs migration in a logged-out state → skip migration entirely; flag remains unset; retry once authenticated

### §4.1 Reference exemplars from CMD-AEGIS-VERIFICATION-PATTERN

The two reference exemplar scripts authored in CMD-AEGIS-VERIFICATION-PATTERN (`aegis-cmd-projection-engine-2.test.txt` and `aegis-cmd-minutes-test-infra-1.test.txt`) are migrated specifically with metadata reflecting their authored intent:

- `kind = 'verification'`
- `tags = ['cmd-projection-engine-2', 'reference-exemplar']` and `['cmd-minutes-test-infra-1', 'reference-exemplar']` respectively
- `origin_cmd = 'CMD-PROJECTION-ENGINE-2'` and `'CMD-MINUTES-TEST-INFRA-1'`
- `state = 'published'` (these are canonical reference patterns; not drafts)
- `description = 'Reference exemplar for CMD-X verification flow per CMD-AEGIS-VERIFICATION-PATTERN convention.'`

This is a special-case migration step the agent handles explicitly (not part of the general localStorage migration).

---

## §5 — Library UI

### §5.1 Surface structure

Replace the current SCRIPTS rail (left side of Aegis Command sub-module) with a Library surface. The Library surface is a panel that occupies the same footprint as the current SCRIPTS rail but supports richer interaction.

Layout:

```
┌─ PLAYBOOKS ─────────────────────────────────┐
│ [ search...                ] [ + new ▼ ]    │
│ ─────────────────────────────────────────── │
│ Filter:  ALL | Verification | Runbook |     │
│          Demonstration | Fixture | Other    │
│ State:   [Active ▼] (Active|Draft|All)      │
│ Sort:    [Recent ▼] (Recent|Name|Last-run)  │
│ ─────────────────────────────────────────── │
│ ▸ Pipeline_Demo                             │
│   demonstration · last run 2h ago · pass    │
│ ▸ aegis_demo_primitives_probe               │
│   verification · last run 18d ago · pass    │
│ ▸ b1_event_emit_probe                       │
│   verification · last run 21d ago · STALE   │
│ ▸ wait-for-route-probe                      │
│   verification · never run                  │
│ ...                                         │
└─────────────────────────────────────────────┘
```

Each playbook row shows: name, kind badge (color-coded), last-run-status badge, and stale-flag if applicable. Click a row to load it into the Editor tab and select it as the run target.

A drag handle on the right edge of the Library panel allows resizing (operator-requested).

### §5.2 Detail pane

When a playbook is selected, the Editor tab shows:

- Top metadata strip: name, kind dropdown, state badge, version number, owner
- Tag editor: chip-style tag inputs (free-form, type-and-enter)
- Description field: one-line text input
- Body editor: the script text (existing editor; verb syntax)
- Below body: lifecycle action buttons depending on current state:
  - State=draft: [Save Draft] [Publish ▶]
  - State=published: [Run ▶] [Edit (creates new draft)] [Archive]
  - State=superseded: [Run ▶] (read-only) [View current version →]
  - State=archived: [Run ▶] (read-only) [Restore (un-archives)]
- Bottom: Run History panel (collapsible) showing last 10 runs of this playbook with timestamp, status, duration

### §5.3 New playbook flow

[+ new ▼] dropdown:

- "Blank playbook" → opens Editor with empty body; default kind='exploration'; user fills in name/description/kind/tags/body
- "From template" (deferred to future CMD; placeholder UI element)
- "From CMD origin" → prompts for CMD identifier; pre-fills `origin_cmd` and adds tag

### §5.4 Search and filter

- Search box: matches name, description, tags (substring, case-insensitive)
- Kind filter: chips for each kind (multi-select); default ALL
- State filter: dropdown; default Active (Active = draft + published, hides superseded and archived)
- Sort: Recent (last_run_at DESC nulls last), Name (alpha), Last-run (last_run_status DESC)

### §5.5 Stale flag

A playbook is "stale" if:
- `state = 'published'` AND
- `last_run_at` is null OR `last_run_at < (now() - interval '14 days')`

Stale indicator is a small amber dot or "STALE" badge on the row. Configurable threshold is a future enhancement; v1 hardcodes 14 days.

### §5.6 Resize handle

Per operator request: the right edge of the Library panel has a drag handle that allows resizing the panel from its default ~25% width to up to ~50% of the Aegis Command sub-module width. Persisted in localStorage as `phud:playbook-library-width` (this is UI preference, not substrate data; localStorage is appropriate).

---

## §6 — Code refactor in `cmd-center.js`

The agent surveys `cmd-center.js`'s existing `_scripts` map, `_runScript`, `Register`, `Run`, and the various script-handling UI helpers (`_loadScripts`, the SCRIPTS rail render, the editor wiring at line ~4519) before refactoring. Iron Rule 64 strictly applies.

Key refactor points (the agent confirms each via codebase survey):

1. **`_scripts` map** at line 89 — was `{ name: scriptText }` from localStorage. Becomes a map keyed by `playbook_id` with values that include the full row metadata (name, body, kind, tags, state, version, etc.).

2. **`_loadScripts`** function — currently reads localStorage. Becomes a Supabase query: `SELECT * FROM aegis_playbooks WHERE state IN ('draft', 'published') ORDER BY name, version DESC`. Loads on init and on demand (e.g., after a publish action). The function may need to maintain a small in-memory cache keyed by `playbook_id` for fast UI updates.

3. **`Register` verb** at line 1616 — currently accepts a script name and registers it. Becomes either deprecated (in favor of UI-driven playbook creation) or refactored to create a draft playbook in substrate. **Architect's preference: keep the verb working but redirect to substrate-create-draft semantics.** Existing scripts using `Register` continue to work; the new substrate row is created with `state='draft'`, `kind='exploration'`, default tags.

4. **`Run` verb** at line 2897 — currently looks up `_scripts[scriptName]` (string-keyed lookup). Becomes a substrate-aware lookup: `SELECT body FROM aegis_playbooks WHERE name = X AND state IN ('published', 'superseded', 'draft') ORDER BY (state='published' DESC, state='draft' DESC, version DESC) LIMIT 1`. This means `Run "name"` runs the published version if one exists, else the most recent draft. Backward compatibility preserved.

5. **`_runScript` and `_runScriptLines`** — currently take `(scriptText, scriptName)`. Need to additionally accept the playbook_id for run-history capture. Refactor signature; preserve internal logic.

6. **Run-history capture** — at `_runScript` start, INSERT into `aegis_playbook_runs` with `status='running'`, capture `run_id`. At `_runScript` end (success or failure), UPDATE the same row with terminal status. Fire CoC events (`aegis.playbook.run_started`, `aegis.playbook.run_completed`).

7. **SCRIPTS rail rendering** at line ~4792 — replaced wholesale with the Library UI rendering. The agent refactors this section significantly; the existing code is the survey baseline, not the kept implementation.

8. **Editor tab wiring** at line ~4519 — currently runs the editor's text content via `_runScript(text, name)`. Updated to look up the loaded playbook_id and call `_runScript(text, name, playbook_id)`. If the editor's text differs from the loaded playbook's body, the agent surfaces a "modified" indicator and confirms before running.

### §6.1 New verbs (if any)

Investigate before specifying. Candidate new verbs:

- `Publish "<name>"` — transitions a draft to published. Could also be a UI button only; agent decides.
- `Archive "<name>"` — transitions a published or superseded playbook to archived. Could also be UI-only.
- `Run Version "<name>" <version>"` — runs a specific version (default Run resolves current published or latest draft).

**Architect lean: UI-only for publish and archive; new verb `Run Version` if and only if the agent confirms during implementation that backward compatibility for running superseded versions requires it.** Otherwise stick with `Run "<name>"` resolving to current published.

The agent surfaces the verb decision as a finding.

---

## §7 — Naming convention shift

The codebase, UI, conversation, and future briefs shift from "scripts" to "playbooks" terminology. Specifically:

- `cmd-center.js`: comments, variable names where reasonable (e.g., `_loadScripts` → `_loadPlaybooks`), UI strings in the panel
- localStorage key for resize preference: `phud:playbook-library-width` (NOT `phud:scripts-rail-width`)
- localStorage key for migration flag: `phud:playbooks-migrated`
- HTML structure in aegis.html and the panel-build code: `#scripts-rail` → `#playbook-library` etc. (agent surveys; matches actual element ids)
- Console logging prefixes: `[Aegis Scripts]` → `[Aegis Playbooks]`

The migration is mechanical but pervasive. Agent uses grep to find every occurrence of `script` in the relevant scope and decides per-occurrence whether it's a "playbook" reference or a generic JS script reference (the latter unchanged).

**Critical: existing script BODIES that contain commands like `Run "scriptname"` are unchanged.** The script body is data; it references playbook names, not the word "script." Migration leaves bodies untouched.

---

## §8 — Aegis registry / UI surface (`aegis.html`)

Survey `aegis.html` for any references to "scripts" in user-facing strings, navigation labels, panel titles, etc. Update to "playbooks" terminology.

The Mission Control and Forge surfaces (visible in operator screenshots but explicitly out of scope for this CMD per operator decision) are not modified beyond any incidental terminology updates if they reference "scripts" anywhere.

---

## §9 — Behavioral verification

### §9.1 Sentinel — code identity

1. Hard-refresh Aegis. Console banner shows CMD-AEGIS-PLAYBOOK-FOUNDATION.
2. Verify `_PROJECTHUD_VERSION` matches.
3. **PASS** = post-CMD code is loaded.

### §9.2 Migration — first load (DOCTRINAL FLOOR)

1. Pre-deploy: confirm operator's localStorage has N existing scripts (capture N for verification).
2. Apply migration. Deploy.
3. First post-deploy load of Aegis. Verify console shows `[Aegis] Migrated N playbooks from localStorage to substrate.`
4. Query substrate: `SELECT count(*) FROM aegis_playbooks WHERE firm_id = current AND tags @> ARRAY['migrated-from-localstorage']`. Expect = N.
5. Verify each migrated playbook is queryable by name, has `state='draft'`, has `kind='exploration'`.
6. Verify localStorage `phud:scripts:*` entries STILL EXIST (not deleted in v1).
7. Verify `localStorage.getItem('phud:playbooks-migrated') === 'true'`.
8. Subsequent loads do NOT re-migrate (no console message; no duplicate substrate rows).
9. **PASS** = migration is one-shot, idempotent, lossless.

### §9.3 Reference exemplar special-case migration

1. Verify the two CMD-AEGIS-VERIFICATION-PATTERN reference exemplars are migrated with `state='published'` (NOT 'draft'), correct `kind='verification'`, correct `origin_cmd`, correct tags.
2. Run each from the Library; verify both execute and produce expected outcomes per CMD-AEGIS-VERIFICATION-PATTERN's hand-off.
3. **PASS** = special-case migration correct.

### §9.4 Library UI — basic interaction

1. Open Aegis. Verify Library panel replaces SCRIPTS rail.
2. Verify search box filters list by name/description/tags.
3. Verify Kind filter chips work.
4. Verify State filter dropdown works (Active default; Draft and All options).
5. Verify Sort dropdown works.
6. Verify resize drag handle works; persist verified by reload.
7. Click a playbook; Editor tab loads the body; metadata strip populates.
8. **PASS** = basic Library interaction works.

### §9.5 Lifecycle transitions (DOCTRINAL FLOOR)

1. Create a new playbook from "+ new" → "Blank playbook." Fill in name="Test1", kind="verification", body="Log 'hello world'".
2. Save as draft. Verify substrate row exists with `state='draft'`.
3. Click Publish. Confirm dialog. Verify state transitions to 'published'; `playbook_hash` populated; `published_at` set; CoC event `aegis.playbook.published` written.
4. Edit the published playbook (creates new draft). Modify body to "Log 'hello world v2'". Save draft. Verify a new substrate row exists with `state='draft'` and same name.
5. Publish v2. Verify atomic transition: new row state→'published', supersedes_id→old row's playbook_id, version=2; old row state→'superseded'.
6. Verify Library shows v2 by default; old version accessible via version history.
7. Run v2; verify run completes; CoC events fire; run row created.
8. Archive v2. Verify state='archived'; archived_at set; v2 still runnable but library marks as archived.
9. Restore v2. Verify state→'published' (or 'draft' depending on architect decision; agent surfaces).
10. **PASS** = full lifecycle works.

### §9.6 Run-history capture

1. Run any published playbook.
2. Verify a row exists in `aegis_playbook_runs` with `status='running'` initially, then 'pass'/'fail'/'aborted'/'error' on completion.
3. Verify `playbook_version` and `playbook_hash` captured for tamper-detection.
4. Verify CoC events fire: `aegis.playbook.run_started` at start, `aegis.playbook.run_completed` at terminal.
5. Verify Library row updates: last_run_at, last_run_status.
6. Verify Run History panel in detail pane shows the run.
7. **PASS** = run history captured correctly.

### §9.7 Stale flag

1. Find or create a published playbook with `last_run_at` older than 14 days (use SQL: UPDATE last_run_at to now() - interval '15 days' for test setup).
2. Verify Library row shows STALE badge.
3. Verify a published playbook with `last_run_at` within 14 days does NOT show STALE.
4. Verify a draft playbook never shows STALE (only published do).
5. **PASS** = stale flag behavior correct.

### §9.8 Cross-firm isolation

1. As firm A user, create and publish a playbook.
2. As firm B user, query substrate: verify firm A's playbook is NOT visible.
3. As firm B user, attempt to fetch firm A's playbook by playbook_id (URL manipulation). Verify RLS rejects.
4. As firm B user, run a playbook of their own; verify firm A doesn't see firm B's runs.
5. **PASS** = firm isolation holds.

### §9.9 Backward compatibility — `Run` verb

1. From Aegis command bar, type `Run "Test1"` (assuming Test1 exists).
2. Verify `Run` resolves to the current published version.
3. Verify backward compatibility: existing scripts using `Run "name"` continue to work.
4. **PASS** = `Run` verb backward compatible.

### §9.10 Backward compatibility — `Register` verb

1. From command bar, run `Register "TestRegister"` followed by paste of script body (or other current Register usage).
2. Verify a draft playbook is created in substrate with name='TestRegister', kind='exploration'.
3. Verify subsequent `Run "TestRegister"` works.
4. **PASS** = `Register` verb backward compatible (now creates substrate drafts).

### §9.11 Existing CMD regression

1. Live Capture, Living Document, Decision Ledger, Digest & Send, Minutes — all surfaces load without errors.
2. End a meeting; verify auto-render fires.
3. Existing CoC events flow correctly.
4. cmd-center.js still initializes cleanly (CMD-AUTH-INIT-RACE preserved).
5. **PASS** = no regression.

### §9.12 IR45 vocabulary preserved

1. Grep all new UI strings, all new error messages, all new metadata field labels for: confidence | probability | certainty | likelihood | posterior | prior | meter | gauge.
2. **PASS** = zero matches in user-facing text.

---

## §10 — Consumer enumeration (Iron Rule 38)

| File | Effect |
|---|---|
| `supabase/migrations/202605XX000001_aegis_playbooks.sql` | NEW — creates `aegis_playbooks` table, `aegis_playbook_runs` table, RLS policies, immutability triggers |
| `supabase/migrations/202605XX000002_aegis_playbook_eventmeta.sql` | NEW — registers three new EVENT_META rows (`aegis.playbook.published`, `aegis.playbook.run_started`, `aegis.playbook.run_completed`) per CMD-A6 three-segment convention |
| `js/cmd-center.js` | MODIFIED — `_scripts` map refactored to substrate-backed cache; `_loadScripts` rewritten as Supabase query; `_runScript` adds run-history capture; SCRIPTS rail rendering replaced with Library UI; localStorage migration logic added; `Register` verb redirects to substrate-create-draft; new lifecycle UI affordances; resize handle |
| `js/coc.js` | MODIFIED — three new EVENT_META client-side entries matching server-side migration |
| `aegis.html` | MODIFIED — terminology updates (scripts → playbooks); panel structure adjustments for Library UI; resize drag handle CSS |
| `js/version.js` | MODIFIED — pin bump to CMD-AEGIS-PLAYBOOK-FOUNDATION |

**Files audited but not modified (Iron Rule 64 codebase survey):**

| File | Audit purpose |
|---|---|
| `js/auth.js` | Verify auth-init-race fix preserved; verify FIRM_ID resolution unchanged |
| `js/api.js` | Verify generic Supabase query helpers compatible with new playbook reads/writes |
| `js/accord-core.js` and other accord-*.js | Verify no accidental coupling to `_scripts` map or SCRIPTS rail |
| Edge Function `render-minutes/index.ts` | Verify untouched; Iron Rule 65 holds |

**Files NOT modified:**

- Edge Functions (no template body changes)
- Other surface modules beyond cmd-center.js / coc.js / aegis.html / version.js
- Existing accord_* tables, Compass tables, Cadence tables
- Mission Control or Forge surfaces (out of scope per operator decision)

---

## §11 — Hand-off format

Required output:

1. Files modified / created — one-liner per file.
2. Diff — full content for new SQL migrations; unified diff for cmd-center.js changes (likely substantial); unified diff for other modified files.
3. Smoke test result.
4. Behavioral verification results — per §9 subtest, with explicit PASS/FAIL.
5. Findings — particularly:
   - Codebase survey results: how many places in cmd-center.js referenced `_scripts` or "script" terminology, and the agent's mapping of which were changed vs. which were left
   - The `Register` verb refactor decision: continued, deprecated, or replaced
   - The `Run Version` verb decision: added or not (per §6.1 architect lean)
   - Restore-from-archived semantics: state→'published' or state→'draft' (architect to confirm)
   - Migration outcome: number of localStorage scripts migrated, any that failed
   - Reference-exemplar special-case migration outcome
   - Any architectural questions surfaced for future CMDs

If §9.2 (migration) or §9.5 (lifecycle transitions) fails, halt and surface — those are the primary deliverables.

---

## §12 — Reference materials

Required inputs (halt per Iron Rule 40 §1.1 if any are missing):

- This brief
- Current `js/cmd-center.js` (post-CMD-AUTH-INIT-RACE)
- Current `js/coc.js`
- Current `js/auth.js` (post-CMD-AUTH-INIT-RACE)
- Current `aegis.html` (post-CMD-AUTH-INIT-RACE)
- `js/version.js`
- The two reference exemplar scripts from CMD-AEGIS-VERIFICATION-PATTERN (`aegis-cmd-projection-engine-2.test.txt` and `aegis-cmd-minutes-test-infra-1.test.txt`)
- All Iron Rules ratifications 36-65
- `accord-vision-v1.md` (read for context only; not architecturally relevant to this CMD)
- `projecthud-functional-requirements-v1.md` (read for context only; not architecturally relevant to this CMD)

---

## §13 — Agent narrative instruction block

```
Apply brief-cmd-aegis-playbook-foundation.md.

Largest CMD since the original Accord build arc. The architectural
decisions here constrain every future Aegis-runnable artifact and
the entire regression-testing infrastructure that follows.

This CMD reframes "scripts" as "playbooks" — first-class substrate-
anchored artifacts with lifecycle states, typed metadata, run
history, and a proper Library UI replacing the existing SCRIPTS
rail.

Iron Rule 64 strictly applies: survey cmd-center.js's existing
script-handling extensively before refactoring. The refactor is
substantial (most of cmd-center.js's SCRIPTS-related code is
touched) but every change should match established codebase
conventions.

Iron Rule 42 strictly applies: published playbooks are immutable.
Modifications produce new versions with supersedes pointers.
Triggers in the substrate enforce this.

Iron Rule 65 does NOT fire: no template body changes. Bump
js/version.js only.

Migration is one-shot, idempotent, lossless. Do NOT delete
localStorage entries in v1.

Reference exemplars from CMD-AEGIS-VERIFICATION-PATTERN are a
special-case migration with `state='published'`, `kind='verification'`,
correct `origin_cmd`, correct tags. Handle explicitly.

§9 specifies twelve behavioral verification subtests. §9.2
(migration) and §9.5 (lifecycle transitions) are the doctrinal-
floor checks.

Hand-off format per §11.

Halt on missing input. Halt if §9.2 or §9.5 fails.

Proceed.
```

---

## §14 — A note on what this CMD enables

After this CMD ships, every future CMD's verification flow lives in substrate as a published playbook. The CMD-AEGIS-VERIFICATION-PATTERN convention (verification flows ship as Aegis-runnable artifacts) compounds with substrate persistence (playbooks are firm-scoped CoC-anchored library entries) to produce a regression-testing foundation: the firm accumulates a library of verification playbooks across every CMD, and any operator can re-run any past CMD's verification at any time to confirm the current substrate state still satisfies the verification.

Future CMDs in the build sequence (CMD-AEGIS-REGRESSION-SCHEDULER for nightly re-runs, CMD-PLAYBOOK-AUTHORING-UX for verb autocomplete and dry-run, eventually CMD-PLAYBOOK-EXPORT-IMPORT for cross-firm sharing) all build on top of this foundation.

The regression-testing baseline becomes a first-class organizational asset. Every CMD shipped contributes to it. The firm can prove, at any moment, that prior commitments still hold.

---

*End of Brief — Aegis Playbook Foundation (CMD-AEGIS-PLAYBOOK-FOUNDATION).*
