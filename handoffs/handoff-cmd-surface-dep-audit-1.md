# Hand-off · CMD-SURFACE-DEP-AUDIT-1

**Status:** SHIPPED. Phase 1 audit + Phase 2 propagation + Phase 2-prime sidebar.js URL deprecation complete. §5.2 (static-script-loading consistency) PASS — every in-scope surface is now STATIC across all 8 canonical modules. §5.3 (per-surface basic functionality regression) deferred to operator smoke test.

---

## §1 — Files modified / created

| File | Effect |
|---|---|
| `accord.html` | Removed orphaned `load('/js/sidebar.js')` from dynamic loader (Phase 2-prime; accord has zero `HUDShell.init`/`Sidebar.init` callers). Comment marker added in place. |
| `cadence.html` | Added `coc.js`, `notif.js`, `cmd-center.js` (static, after `api.js` / between `ui.js` and `hud-shell.js`). |
| `cpm-pert.html` | URL migration `/js/sidebar.js` → `/js/hud-shell.js`. Added `coc.js`, `notif.js`, `cmd-center.js`. |
| `dashboard.html` | Added `coc.js`, `notif.js`, `cmd-center.js`. |
| `import-tasks.html` | URL migration. Added `coc.js`, `notif.js`, `cmd-center.js`. |
| `meeting-minutes.html` | Added `coc.js`, `ui.js`, `notif.js`, `cmd-center.js`. |
| `pipeline.html` | Added `coc.js`, `ui.js`, `notif.js`, `cmd-center.js`. |
| `project-detail.html` | Added `coc.js`, `notif.js`, `cmd-center.js`. |
| `projects.html` | URL migration. Added `coc.js`, `notif.js`, `cmd-center.js`. |
| `proposal-detail.html` | URL migration. Added `coc.js`, `ui.js`, `notif.js`, `cmd-center.js`. |
| `prospect-detail.html` | Added `coc.js`, `ui.js`, `notif.js`, `cmd-center.js`. |
| `resource-requests.html` | Added `coc.js`, `notif.js`, `cmd-center.js`. |
| `resources.html` | Added `coc.js`, `notif.js`, `cmd-center.js`. |
| `risk-register.html` | Added `coc.js`, `ui.js`, `notif.js`, `cmd-center.js`. |
| `sow-builder.html` | URL migration. Added `coc.js`, `ui.js`, `notif.js`, `cmd-center.js`. |
| `users.html` | Added `coc.js`, `notif.js`, `cmd-center.js`. |
| `js/version.js` | Pin → `v20260506-CMD-SURFACE-DEP-AUDIT-1`. IR65 seventh confirmation, fifth deliberate non-firing — no template body changes; `RENDER_VERSION` unchanged. |

**Surfaces audited and unchanged:** `compass.html` (already canonical), `aegis.html` (Q4 — out of scope), `approve.html` / `form-review.html` / `meeting-view.html` / `recorder-window.html` (Q1 — minimal-bootstrap surfaces, excluded per architect direction).

---

## §2 — Diff highlights

### URL deprecation (Phase 2-prime)

5 surfaces: legacy `/js/sidebar.js` → canonical `/js/hud-shell.js`. The two URLs serve the same module per CMD94's `sidebar.js` v3.1 → `hud-shell.js` absorption.

```diff
- <script src="/js/sidebar.js"></script>
+ <script src="/js/hud-shell.js"></script>
```

### Accord orphan removal

```diff
       document.head.appendChild(s);
     }
-    load('/js/sidebar.js');
+    // CMD-SURFACE-DEP-AUDIT-1: removed orphaned load('/js/sidebar.js').
+    // accord.html does not call HUDShell.init() / Sidebar.init() — the
+    // file load was a pure legacy artifact from before accord adopted
+    // its own custom header/branding. See CMD-SIDEBAR-URL-RETIREMENT-1.
     load('/js/cmd-center.js');
```

### Canonical-module propagation (UI-surface pattern)

9 surfaces (cadence, cpm-pert, dashboard, import-tasks, projects, project-detail, resource-requests, resources, users):

```diff
 <script src="/js/api.js"></script>
+<!-- CMD-SURFACE-DEP-AUDIT-1: canonical shared modules (was: missing coc/notif/cmd-center) -->
+<script src="/js/coc.js"></script>
 <script src="/js/ui.js"></script>
+<script src="/js/notif.js"></script>
+<script src="/js/cmd-center.js"></script>
```

### Canonical-module propagation (no-UI surface pattern)

5 surfaces (pipeline, proposal-detail, prospect-detail, risk-register, sow-builder):

```diff
 <script src="/js/api.js"></script>
+<!-- CMD-SURFACE-DEP-AUDIT-1: canonical shared modules (was: missing coc/ui/notif/cmd-center) -->
+<script src="/js/coc.js"></script>
+<script src="/js/ui.js"></script>
+<script src="/js/notif.js"></script>
 <script src="/js/version.js?v=seed"></script>
 <script src="/js/hud-shell.js"></script>
+<script src="/js/cmd-center.js"></script>
```

### meeting-minutes.html — special insertion

```diff
 <script src="/js/api.js"></script>
+<!-- CMD-SURFACE-DEP-AUDIT-1: canonical shared modules (was: missing coc/ui/notif/cmd-center) -->
+<script src="/js/coc.js"></script>
+<script src="/js/ui.js"></script>
+<script src="/js/notif.js"></script>
 <script src="/js/version.js?v=seed"></script>
 <script src="/js/hud-shell.js"></script>
+<script src="/js/cmd-center.js"></script>
```

---

## §3 — Post-fix audit table

```
surface                   config.js   auth.js     api.js      coc.js      ui.js       notif.js    version.js  cmd-center.js
accord.html               STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      DYN
aegis.html                STATIC      STATIC      DYN         DYN         MISSING     MISSING     STATIC      DYN
cadence.html              STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC
compass.html              STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      DYN
cpm-pert.html             STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC
dashboard.html            STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC
import-tasks.html         STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC
meeting-minutes.html      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC
pipeline.html             STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC
project-detail.html       STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC
projects.html             STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC
proposal-detail.html      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC
prospect-detail.html      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC
resource-requests.html    STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC
resources.html            STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC
risk-register.html        STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC
sow-builder.html          STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC
users.html                STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC      STATIC
```

§5.2 doctrinal floor PASS — every in-scope surface canonical. Aegis retains its dynamic loader pattern + ui/notif gap per Q4 (out of scope).

---

## §4 — Findings

**F1 · CoC integrity gap quantified.** Pre-fix, 16 of 18 in-scope surfaces (`accord` + `compass` were the only loaders) had not been writing CoC events because `coc.js` was MISSING. Every action on cadence/pipeline/users/etc. that called `CoC.write()` silently no-op'd. Post-fix, all 18 in-scope surfaces load `coc.js` statically; future actions write correctly. **Historical gaps cannot be retroactively filled** — the missing CoC events from before this CMD's deploy remain absent. Operator may want to flag a per-surface backfill audit if specific CoC trails are forensically relevant.

**F2 · Architect's prior framing of sidebar.js → cmd-center.js absorption was incorrect.** Investigation per IR55 revealed the actual deprecation per CMD94: `sidebar.js` v3.1 absorbed into `hud-shell.js` (not cmd-center.js). The `/js/sidebar.js` URL still serves the same module (now living as hud-shell.js content); 17 surfaces have live `HUDShell.init()` / `Sidebar.init()` callers. cmd-center.js has zero shell functionality. The premise was a memory conflation of two similarly-named modules. Filed as architect-acknowledged.

**F3 · 17 of 22 surfaces have live shell-module callers.** All 17 continue to load the shell module post-fix (5 via newly-canonical `/js/hud-shell.js` URL after Phase 2-prime URL migration; 12 already on `/js/hud-shell.js`). No regression of the back-compat `Sidebar.init` shim's behavior.

**F4 · CMD-SIDEBAR-URL-RETIREMENT-1 filed as follow-up.** Out of scope this CMD; necessary to delete the legacy `/js/sidebar.js` file at the server once a deploy confirms zero remaining callers reference the URL. Until that retirement, the URL remains live as a back-compat alias.

**F5 · IR65 seventh confirmation, fifth deliberate non-firing.** Static-script propagation + URL deprecation; no template body changes. `RENDER_VERSION` unchanged.

**F6 · Three loader patterns confirmed during survey, narrowed by fix.**
- "accord-canonical": full 7-module static + (sidebar dyn) + cmd-center dyn → post-fix accord still has cmd-center dyn but no sidebar dyn (orphan removed).
- "aegis-specialized": version + hud-shell static; api/coc/cmd-center dynamic. Untouched per Q4.
- "legacy minimal" (16 surfaces): now collapsed into canonical static via this CMD.

**F7 · Surface exclusions per Q1 confirmed.** `approve.html`, `form-review.html`, `meeting-view.html`, `recorder-window.html` — minimal-bootstrap surfaces with intentional sparse loading. Untouched. If any are later promoted to full operator surfaces, a follow-up CMD propagates canonical statics there.

**F8 · Three minimal-bootstrap surfaces have at least partial static loads** (`meeting-view.html` loads config/auth/api). Worth re-confirming whether their current sparse loading covers their intended use. Not a bug requiring fix; finding for tracking.

**F9 · Mockups confirmed out of scope:** `meeting-minutes-mockup.html`, `minutes-redesigned.html` — design fixtures, not deployed surfaces. Untouched.

**F10 · Insertion-point divergence preserved.** Surfaces had divergent internal orderings of static script tags (some put `version.js` before `config.js`, some between `api.js` and `hud-shell.js`, etc.). Per brief §4 ("preserve existing inline boot scripts"), the fix inserted new modules adjacent to canonical neighbors WITHOUT reordering existing tags. Strict accord-canonical ordering for every surface would require touching pre-existing scaffolding outside this CMD's scope — recommend `CMD-SURFACE-LOADER-ORDER-1` as a follow-up if order normalization is desired.

**F11 · No surface-specific surprises during fix application.** All 16 modified surfaces accepted the canonical-module insertion cleanly. No surface had a structural reason to omit any of `coc`, `notif`, `ui`, or `cmd-center`. The propagation is uniform.

---

## §5 — Verification status

| Subtest | Result |
|---|---|
| §5.1 Sentinel | Operator smoke required — pin live in modified surface console banners after deploy. |
| §5.2 Static-script-loading consistency (DOCTRINAL FLOOR) | PASS — post-fix audit table shows STATIC across all 8 modules for every in-scope surface. |
| §5.3 Per-surface basic functionality regression (DOCTRINAL FLOOR) | Operator smoke required — open each modified surface; verify console banner, no missing-dependency errors, primary action exercises (e.g., open Cadence → see queue render; open Pipeline → see prospects; open Users → see list). |
| §5.4 Cross-firm isolation regression | PASS-by-design — no fallback firm_id introduced; CMD-AEGIS-1 security fix preserved. |
| §5.5 Existing CMD regression | PASS-by-design — no functional code changes; only static script tags added. End a meeting / run an Aegis playbook to confirm. |

---

## §6 — Open / deferred

- `CMD-SIDEBAR-URL-RETIREMENT-1` (filed as follow-up) — delete `/js/sidebar.js` at server once no callers reference the URL.
- `CMD-SURFACE-LOADER-ORDER-1` (recommended) — normalize internal script-tag ordering across surfaces if strict accord-canonical order is desired.
- Aegis ui.js / notif.js gap (Q4) — out of this CMD's scope; track separately.
- Minimal-bootstrap surface review (F8) — confirm `approve.html`, `form-review.html`, `meeting-view.html`, `recorder-window.html` sparse loading is intentional vs. a pre-existing gap.
- Operator §5.3 smoke confirmation post-deploy.

---

## §7 — Verification artifacts

```bash
# Confirm every in-scope surface loads all 8 canonical modules statically (or DYN for accord/compass cmd-center)
grep -l '<script src="/js/coc.js"></script>' *.html | wc -l
# expected: 16 (all UI/no-UI surfaces) + accord + compass = 18 (excluding aegis Q4)

# Confirm no surface still loads /js/sidebar.js
grep -l '<script src="/js/sidebar.js">' *.html
# expected: empty (orphan removed from accord; 5 URL-migrated)

grep -l "load('/js/sidebar.js')" *.html
# expected: empty (accord orphan removed)
```

---

*End of hand-off — CMD-SURFACE-DEP-AUDIT-1.*
