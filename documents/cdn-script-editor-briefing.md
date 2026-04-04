# cdn-script-editor.js — Technical Briefing
**Module:** Visual Test Script Editor for CadenceHUD BIST  
**Version:** v20260404-SE2 (1,854 lines)  
**File:** `cdn-script-editor.js`

---

## Purpose

`cdn-script-editor.js` replaces the read-only Tests panel in the CadenceHUD Template Editor with a full visual editor for authoring, editing, and running BIST test scripts. It operates entirely inside the existing `tmpl-tests-body` DOM element — no new panels or routes are introduced.

It is a **pure frontend module** with no build step. All state is in-memory JavaScript variables. Persistence is via direct PostgREST calls to Supabase.

---

## Load Order & Dependencies

```html
<!-- cadence.html load order -->
<script src="/js/cdn-bist.js?v=20260404-BQ"></script>
<script src="/js/cdn-script-editor.js?v=20260404-SE1"></script>  ← here
<script src="/js/cdn-coc.js?v=20260403-S9"></script>
```

**Hard dependencies (must exist as globals at load time):**

| Global | Source | Used for |
|---|---|---|
| `runBistScript(scriptId, onProgress)` | `cdn-bist.js` | Running scripts |
| `_selectedTmpl` | `cdn-template-editor.js` | Template steps, version, id |
| `API.get/post/patch/del` | `api.js` | All DB access |
| `FIRM_ID_CAD` | `cadence.html` | `'aaaaaaaa-0001-0001-0001-000000000001'` |
| `cadToast(msg, type)` | `cadence.html` | Toast notifications |
| `loadTmplTests(templateId)` | `cdn-bist.js` | Monkey-patched at startup |
| `escHtml(s)` | `cadence.html` | HTML escaping in render functions |

**Soft dependencies (used if present):**
- `_resources_cad` — actor dropdown population
- `window._seOnCompleteStep` — form data write hook called by `cdn-bist.js`
- `window._seOnFormSection` — form section write hook called by `cdn-bist.js`
- `window._seHydrateFormState` — form state hydration hook called by `cdn-bist.js`

---

## Integration Hook

The module installs itself by monkey-patching `loadTmplTests` (defined in `cdn-bist.js`). This runs in a self-executing closure at module load, polling every 150ms for up to 8 seconds until `loadTmplTests` is available:

```javascript
(function _installSeHook() {
  function _tryHook() {
    if (typeof loadTmplTests !== 'function') {
      if (Date.now() < _deadline) setTimeout(_tryHook, 150);
      return;
    }
    var _origLoad = window.loadTmplTests;
    window.loadTmplTests = function(templateId) {
      var bodyEl = document.getElementById('tmpl-tests-body');
      if (bodyEl) return seOpenEditor(templateId);
      return _origLoad.apply(this, arguments);
    };
  }
  _tryHook();
})();
```

When the user opens the Tests panel for any template, `loadTmplTests(templateId)` is called by `cadence.html`. The hook intercepts it and calls `seOpenEditor(templateId)` instead, which renders the full visual editor inside `tmpl-tests-body`.

**Keyboard shortcut:** `Cmd/Ctrl+S` saves the current script when the Tests panel is open.

---

## Module State Variables

```javascript
var _seScripts        = [];    // bist_test_scripts rows for current template
var _seSelectedId     = null;  // currently selected script id
var _seSelectedStep   = null;  // currently selected step id in timeline
var _seDirty          = false; // unsaved changes flag
var _seRecentRuns     = [];    // bist_runs rows (last 40)
var _seDragAction     = null;  // action type being dragged from palette
var _seDragTmplSeq    = null;  // template step seq being dragged
var _seRunning        = false; // prevents concurrent runs
var _seFormFieldCache = {};    // step_id → {id, fields[], routing{}} — lazy loaded
var _seEditorEl       = null;  // root DOM element (tmpl-tests-body)
```

---

## Entry Point

```javascript
async function seOpenEditor(templateId)
```

Called on every Tests panel open. Does NOT assume persistent state — fully refreshes from DB each time.

**Sequence:**
1. Sets `_seEditorEl = document.getElementById('tmpl-tests-body')`
2. Parallel fetch: `bist_test_scripts` for this template + `bist_runs` (last 40)
3. Parses each script's `script` column (stored as JSON string) into `sc.spec`
4. Sets `_seSelectedId` to first script (or null)
5. Calls `seRenderEditor()`

**Script row shape after load:**
```javascript
{
  id:   'uuid',
  name: 'Full workflow — clean approval path',
  spec: {                          // parsed from script column (JSON string)
    name:             'Full workflow — clean approval path',
    template_version: '0.0.13',
    cleanup:          'delete',    // 'delete' | 'suspend' | 'keep'
    steps: [ /* see Step JSON Schema below */ ]
  },
  _raw: { /* raw DB row */ }
}
```

---

## Script JSON Schema

Scripts are stored in `bist_test_scripts.script` as a **text-encoded JSON string** (jsonb column wrapping a text value). Always use `script #>> '{}'` to extract in SQL.

**Top-level spec:**
```json
{
  "name": "Script name",
  "template_version": "0.0.13",
  "cleanup": "delete",
  "steps": [ ... ]
}
```

**Step shape:**
```json
{
  "id":      "s1",
  "action":  "complete_step",
  "params":  { ... },
  "asserts": [ { "check": "step[1].state", "eq": "done" } ]
}
```

---

## Action Types

Defined in `SE_ACTIONS` constant:

| Action | Icon | Params shape |
|---|---|---|
| `launch_instance` | ▶ | `{ title, launched_by }` |
| `complete_step` | ✓ | `{ step_seq, actor, outcome, notes?, route_to_seq?, form_data? }` |
| `complete_form_section` | ◧ | `{ step_seq, section_id, actor, field_data? }` |
| `assert_only` | ≡ | `{}` — only asserts, no action |
| `wait` | ⏱ | `{ ms }` |

**Params detail for `complete_step`:**
- `step_seq` — template `sequence_order` (integer 1–N)
- `actor` — resource slug e.g. `'vaughn_staples'`
- `outcome` — outcome id e.g. `'submitted'`, `'approved'`, `'rejected'`
- `notes` — optional string (required by engine for `requiresReset` outcomes)
- `route_to_seq` — optional integer; if set, engine uses GOTO logic instead of L2 routing
- `form_data` — optional `{ field_id: value }` map; triggers `_seOnCompleteStep` hook

---

## Assertion System

### Operators (`SE_OPS`)
```
eq | not_eq | gte | lte | contains | exists | not_exists
```

### Assertion check paths (`SE_CHECK_WORKFLOW`)
```
instance.status          → 'in_progress' | 'completed' | 'overridden'
step[N].state            → 'active' | 'done' | 'waiting' | 'ready'
step[N].outcome          → outcome id string
step[N].loops            → integer (count of step_completed events in CoC)
step[N].route_to         → step id string
step[N].activated_at     → ISO timestamp string
```

### Form assertion paths (`SE_CHECK_FORM_BASE`)
```
step[N].form.required_fields_complete  → boolean
step[N].form.sections_complete         → integer
step[N].form.sections_total            → integer
step[N].form.route_count               → integer
```

### Dynamic form field paths
When a template step has a `workflow_form_definitions` row, the assertion builder also offers:
```
step[N].form.fields.{field_id}         → field value (text)
step[N].form.sections.stage_1.state    → 'complete' | 'pending'
```
These are built lazily via `seLoadFormDefForStep(stepId)` which queries `workflow_form_definitions?step_id=eq.{id}`.

### Assertion JSON shape
```json
{ "check": "step[2].state", "eq": "active" }
{ "check": "step[1].loops", "eq": 2 }
{ "check": "instance.status", "eq": "in_progress" }
```

Values are coerced by `seCoerceVal(v)`: numeric strings → numbers, `'true'`/`'false'` → booleans.

---

## UI Layout (3-column)

```
┌─────────────────┬──────────────────────────────┬───────────────────┐
│  LEFT (190px)   │  CENTER (flex:1)              │  RIGHT (220px)    │
│                 │                               │                   │
│  Script list    │  Script header bar            │  Suite stats      │
│  [+ New]        │  [Title input] [Save] [Run]   │  Pass/fail counts │
│                 │                               │                   │
│  Action palette │  Drop zone toolbar            │  Recent runs      │
│  (drag to add)  │  [Drop here] [+ Assert]       │  Last 40 runs     │
│                 │                               │                   │
│  Template steps │  Timeline (scrollable)        │  Property         │
│  (drag to       │  Step cards — one per script  │  inspector        │
│   insert)       │  step, in order               │  (click to edit)  │
│                 │                               │                   │
│                 │  Cleanup footer               │  Gate status      │
│                 │  [delete|suspend|keep]        │  pass/fail/never  │
└─────────────────┴──────────────────────────────┴───────────────────┘
```

### Left panel
- **Script list** — one row per `bist_test_scripts` row for this template. Click to select.
- **Action palette** — 5 draggable action blocks. Drag to center timeline drop zone.
- **Template steps palette** — one row per `workflow_template_steps` row. Drag to insert a pre-configured `complete_step` for that seq.

### Center panel (Timeline)
Each script step renders as a **step card** (`seRenderStepCard`) containing:
- Color-coded header (action type color)
- Actor badge + step label
- Outcome chip (for `complete_step`)
- Route-back indicator (if `route_to_seq` set)
- Form data block (if `form_data` present)
- Assertion rows with pass/fail diff highlighting from last run
- Delete button

Cards are drop targets for inserting steps before/after.

### Right panel
- **Suite stats** — total scripts, pass rate, last run timestamp
- **Recent runs** — last 40 `bist_runs` rows with status dots and timestamps
- **Property inspector** — editable fields for the selected step (params + assertions)
- **Gate status** — Tier 0/1/2/3 readiness indicator matching the release gate logic

---

## Render Architecture

**Full re-render:** `seRenderEditor()` — rebuilds the entire editor HTML. Called on script select, new script, delete script.

**Partial re-renders (avoid full rebuilds):**
- `seRefreshTimeline()` — replaces `#se-timeline` innerHTML only
- `seRenderPropInspector(stepId)` — replaces `#se-prop-inspector` innerHTML
- `seRenderScriptList()` — replaces `#se-script-list` innerHTML

**Mutation pattern:** All inline `onclick` handlers call zero-arg or single-arg global functions (e.g. `seSelectStep('s3')`, `seUpdateParam('s3','outcome','approved')`). These mutate `_seScripts[...].spec` in memory and call a partial re-render. `_seDirty` is set true on any mutation.

---

## Key Functions Reference

### Script lifecycle
| Function | Action |
|---|---|
| `seNewScript()` | Prompt for name → POST bist_test_scripts → add to `_seScripts` |
| `seRenameScript(name)` | Updates spec.name in memory, sets dirty |
| `seDeleteScript()` | Confirm → DEL bist_test_scripts → re-render |
| `seSaveScript()` | PATCH bist_test_scripts with `JSON.stringify(spec)` |
| `seRunScript()` | Auto-save → `runBistScript(id, cb)` → refresh UI with result |

### Step mutations
| Function | Action |
|---|---|
| `seAppendActionStep(action, tmplSeq)` | Appends step to spec.steps with default params |
| `seDeleteStep(id)` | Removes step from spec.steps |
| `seUpdateParam(stepId, key, val)` | Sets `stp.params[key] = val` |
| `seUpdateRouteBack(stepId, val)` | Sets `route_to_seq` (coerced to int) |
| `seClearRoute(stepId)` | Deletes `route_to_seq` from params |
| `seAddAssert(stepId)` | Appends default assertion to step.asserts |
| `seDeleteAssert(stepId, idx)` | Removes assertion at index |
| `seAddFormData(stepId)` | Initializes `params.form_data = {}` |
| `seAddFormField(stepId)` | Appends a blank field to params.form_data |
| `seUpdateFormField(stepId, fieldId, val)` | Sets `params.form_data[fieldId] = val` |

### Drag and drop
| Function | Action |
|---|---|
| `sePalDragStart(event, action)` | Sets `_seDragAction` |
| `seTmplDragStart(event, seq, name, type)` | Sets `_seDragTmplSeq` |
| `sePalDragEnd(event)` | Clears drag state |
| `seDzOver(event, id)` | Highlights drop zone |
| `seDzLeave(id)` | Unhighlights drop zone |
| `seDzDrop(event)` | Calls `seAppendActionStep` or inserts before target step |

---

## Database Operations

All via PostgREST through the `API` global. No RPC, no joins.

| Table | Operation | When |
|---|---|---|
| `bist_test_scripts` | GET | `seOpenEditor` — fetch all scripts for template |
| `bist_test_scripts` | POST | `seNewScript` |
| `bist_test_scripts` | PATCH | `seSaveScript` |
| `bist_test_scripts` | DELETE | `seDeleteScript` |
| `bist_runs` | GET | `seOpenEditor` + after each `seRunScript` |
| `workflow_form_definitions` | GET | `seLoadFormDefForStep` (lazy, on demand) |
| `workflow_form_responses` | POST/PATCH | `_seOnCompleteStep`, `_seOnFormSection` hooks |

**Script column storage note:** `bist_test_scripts.script` is a `jsonb` column but stores a **text-encoded JSON string** (not a native jsonb object). On read: `JSON.parse(raw.script)` works because Supabase returns the string value. On write: `JSON.stringify(spec)` — PostgREST accepts it. On SQL manipulation: `script #>> '{}'` to extract text, `to_jsonb(...)` to re-wrap.

---

## Form Integration Hooks

These three functions are attached to `window` so `cdn-bist.js` can call them if they exist:

### `window._seOnCompleteStep(stp, instId, stepBySeq)`
Called by `cdn-bist.js` after writing `step_completed` CoC event, when `stp.params.form_data` is present.

Writes one `workflow_form_responses` row per field in `form_data`:
```javascript
// For each field_id in params.form_data:
API.post('workflow_form_responses', {
  instance_id, step_id, form_def_id,
  stage,       // resolved from form definition field.stage
  field_id,    // key from form_data
  value,       // String(form_data[fieldId])
  filled_by,   // resource id resolved from actor slug
  filled_at,
})
```
Falls back to PATCH on unique constraint violation `(instance_id, step_id, stage, field_id)`.

### `window._seOnFormSection(stp, instId, stepBySeq)`
Called by `cdn-bist.js` for `complete_form_section` action type.

1. Writes `section_completed` CoC sub-event to `workflow_step_instances`
2. Resolves stage number from `section_id` (convention: `'stage_N'`) or routing role match
3. Writes `workflow_form_responses` rows for each field in `params.field_data`

### `window._seHydrateFormState(state, instId, tmplSteps)`
Called by `cdn-bist.js` inside `reloadState()` after `_bistBuildState`.

Queries `workflow_form_responses?instance_id=eq.{instId}`, groups by `step_id`, builds:
```javascript
state.steps[N].form = {
  fields:                   { field_id: value, ... },
  sections_complete:        N,
  sections_total:           N,
  route_count:              N,
  required_fields_complete: boolean,
  sections:                 { 'stage_1': { state, role, field_values, ... } }
}
```

### `seLoadFormDefForStep(stepId)`
Async. Queries `workflow_form_definitions?step_id=eq.{stepId}&select=id,fields,routing`.  
Caches result under `_seFormFieldCache['def_'+stepId]`.  
Called before rendering assertion builder for form steps.

---

## Assertion Diff Panel

`seRenderStepCard` accepts a `result` object (from the last `bist_runs` row). When a step has failed assertions, each assertion row shows:

- ✓ green — passed
- ✕ red — failed, with `expected: X | actual: Y` diff
- `seGenerateDiffHint(assert, actual, expected)` — provides a contextual fix suggestion (e.g. "Try `eq: 2` — loops counter includes all visits")

The `result` object is derived from matching the step's assertion failures against `bist_runs.failure_assertion` (jsonb).

---

## Gate Status Panel

`seRenderGateStatus()` computes a Tier value for the current template version:

| Tier | Condition | Color |
|---|---|---|
| 0 | No scripts exist | Red — "No test coverage" |
| 1 | Scripts exist, none run against current version | Orange — "Not run" |
| 2 | Run exists but some failing | Red — "Failing" |
| 3 | All scripts passing against current version | Green — "All passing" |

This mirrors the release gate logic in `_bistLaunchCockpit`.

---

## Coding Rules (Iron Rules — always enforce)

1. **`var` declarations only** — no `let`/`const` in this file (ES5 style throughout)
2. **Bare globals** — all public functions are on `window` implicitly or explicitly
3. **Zero-arg inline onclick** — `onclick="seSelectStep('s3')"` not closures
4. **No `display:none`** with duplicate attributes
5. **Font: Arial, minimum 10px** in all rendered HTML
6. **Orange console badge** on every version change:
   ```javascript
   console.log('%c[cdn-script-editor] v20260404-SE2',
     'background:#c47d18;color:#000;font-weight:700;padding:2px 8px;border-radius:3px');
   ```
7. **`escHtml(s)` and `escAttr(s)`** for all user-supplied strings in HTML
8. **`seCoerceVal(v)`** for all assertion values (coerces numeric strings to numbers)
9. **No `form_submissions` table** — use `workflow_form_definitions` + `workflow_form_responses`

---

## Known Issues / Future Work

### Not yet implemented
- **Drag-to-reorder** — steps can be added and deleted but not reordered by drag. Workaround: delete and re-add.
- **Inline step editing in timeline** — step params are edited in the right-panel property inspector, not directly in the card.
- **Multi-script run** — `seRunScript()` runs one script at a time. Running all scripts in the suite routes through `_bistLaunchCockpit` (the full cockpit), not the inline editor runner.

### Integration notes
- The editor runs inside `tmpl-tests-body` which is also used by the read-only test viewer. The monkey-patch of `loadTmplTests` means the visual editor takes over whenever `tmpl-tests-body` exists in the DOM.
- `_selectedTmpl` must be set before `seOpenEditor` is called. This is guaranteed by the existing template editor flow in `cdn-template-editor.js`.
- The `seRunScript()` function calls `runBistScript` directly (not via the cockpit). Progress events are logged to console only — the cockpit DAG and CoC panel are NOT shown. For full visual simulation, users should use the Simulator tab.
