# Brief · Auth init race — cmd-center.js / auth.js startup sequencing · CMD-AUTH-INIT-RACE

## §0 — Standing rules for fresh agent

Read before proceeding.

**Iron Rule 36, 37, 38, 39, 40** — base operating discipline.
**Iron Rule 51** — class-conditional treatments at construction time.
**Iron Rule 52 §4** — function-name and logical-concern collision check.
**Iron Rule 55** — architect-side canonical-source verification.
**Iron Rule 60** — first-caller hazard awareness.
**Iron Rule 64** — codebase-as-spec; survey existing patterns before introducing new mechanisms.
**Iron Rule 65** — render-version dual-pin applies only to template body changes. **This CMD does NOT modify any render template body bytes; `RENDER_VERSION` does NOT need to move. Bump only `js/version.js`.**

**Critical context:** this CMD fixes a pre-existing bug that has been deferred through three previous CMDs (surfaced as F4 in CMD-MINUTES-TEST-INFRA-1; pre-existing per CMD-AEGIS-1 §6). It is now on the critical path because it blocks CMD-AEGIS-VERIFICATION-PATTERN, which itself is the prerequisite for the verification-script convention that all subsequent CMDs depend on.

The original CMD-AEGIS-1 fix was correct and must be preserved: cross-firm presence isolation was a real security issue; removing the hardcoded firm A fallback was the right call. This CMD does NOT regress that fix. It addresses the *separate* bug that the fix exposed.

---

## §1 — Purpose

cmd-center.js fails to initialize on cold page load with the error:

```
[cmd-center] auth.js did not populate window.PHUD.FIRM_ID;
cmd-center.js cannot initialize; presence and command features
unavailable. (See brief CMD-AEGIS-1 §6.)
```

Reproducible on first page load. Subsequent loads (after hard-refresh) recover cleanly. The bug is an initialization race: cmd-center.js's `_init()` checks `window.PHUD.FIRM_ID` before auth.js has finished populating it.

Per `cmd-center.js` lines 68-74:

```
// CMD-AEGIS-1: hardcoded firm A fallback removed. Was previously:
//   var FIRM_ID = (PHUD.FIRM_ID) || 'aaaaaaaa-0001-0001-0001-000000000001';
// That fallback caused every session — regardless of authenticated
// firm — to subscribe to firm A's hud: channel, leaking presence
// across firms (CMD-A3 §10.5). _init() now awaits
// window._phudFirmIdReady (populated by auth.js) and fails fast if
// FIRM_ID still cannot be established. See brief CMD-AEGIS-1 §3.
```

The intent is correct: await `_phudFirmIdReady` before initializing. The implementation has a race. The agent identifies and fixes the race.

After CMD-AUTH-INIT-RACE ships:

1. cmd-center.js loads cleanly on cold page load (first load after navigation, after browser cache clear, after hard-refresh — all paths)
2. The fail-fast behavior on missing FIRM_ID is preserved as a defense-in-depth check (still catches genuine misconfigurations)
3. Cross-firm presence isolation (the CMD-AEGIS-1 security fix) is preserved
4. Aegis is reliably available for use, including for running verification scripts

---

## §2 — Scope

### In scope

- Survey current `_init()` await pattern in `cmd-center.js`
- Survey current `_phudFirmIdReady` populate logic in `auth.js`
- Identify the race condition: is the readiness signal not being set, set late, set on a different page-load path, or being set but the await is consuming a stale promise?
- Apply the fix to whichever side is broken (auth.js, cmd-center.js, or both)
- Verify the fix across cold load, hard-refresh, soft-refresh, and tab-restore scenarios
- Verify CMD-AEGIS-1's cross-firm isolation is preserved (defense-in-depth fail-fast still fires when FIRM_ID is genuinely unset)
- Behavioral verification per §5
- Pin bump in `js/version.js` (no `RENDER_VERSION` change per Iron Rule 65)
- Hand-off per §8

### Out of scope

- The broader CMD-IDENTITY-UNIFICATION work (unifying session-identity globals into `window.PHUD.identity`) — that's a separate multi-CMD architectural cycle
- The CMD-AUTH-EXPIRY-HANDLING work (silent anon-key fallback on session expiry) — separate Bucket B finding
- Any changes to the substrate, schema, RLS, render templates, Edge Functions
- Any changes to surface modules beyond auth.js and cmd-center.js if needed
- Any new Aegis verbs or commands (CMD-AEGIS-VERIFICATION-PATTERN, deferred until this CMD ships)

---

## §3 — Investigation requirements (Iron Rule 55)

Before specifying the fix, the agent verifies the actual current state of the code. The architect's understanding from comments and reported behavior may be incomplete. Specifically:

### §3.1 What does cmd-center.js currently do?

Read the actual `_init()` function in `cmd-center.js` around the `FIRM_ID` resolution. Identify:

- Where is `window.PHUD.FIRM_ID` first read?
- Is there an `await` on `window._phudFirmIdReady`?
- Is `_phudFirmIdReady` a Promise, an event, a callback registry, or some other primitive?
- What's the timing relationship between cmd-center.js's `_init()` invocation and the page's other initialization?

### §3.2 What does auth.js currently do?

Read the auth.js module. Identify:

- Where is `window.PHUD.FIRM_ID` set?
- Is `_phudFirmIdReady` set/resolved/emitted at the same point, or before, or after?
- What's the auth.js initialization trigger — DOMContentLoaded, deferred script, manual call, Supabase auth state change?
- Is there a path where auth.js completes successfully but doesn't populate either `FIRM_ID` or `_phudFirmIdReady`?

### §3.3 What does the page load sequence look like?

Read `aegis.html`'s `<script>` tag ordering. Identify:

- Order of script loads: auth.js, cmd-center.js, version.js, others
- `defer`, `async`, or default loading attributes
- Any `DOMContentLoaded` or `load` handlers that orchestrate init order
- Whether cmd-center.js init is triggered by script-end execution or by an event handler

### §3.4 Diagnose the race

Based on the survey, identify the specific race mechanism. Possibilities:

- **Promise creation timing.** If `_phudFirmIdReady` is created in auth.js and cmd-center.js awaits `window._phudFirmIdReady`, the await may resolve to `undefined` (and `await undefined` resolves immediately to `undefined`) if cmd-center.js executes before auth.js has assigned the property.
- **Promise resolution timing.** If both modules access an existing Promise but one resolves before the other awaits, the await still works correctly. But if auth.js *creates and resolves* the promise inline before cmd-center.js can hold a reference, cmd-center.js may miss the resolution window.
- **Event dispatch timing.** If `_phudFirmIdReady` is an event, cmd-center.js must register the listener *before* auth.js dispatches; otherwise the event fires into the void.
- **Auth state callback timing.** If FIRM_ID resolution depends on Supabase auth state (which is async, often not ready until after page load), then a synchronous check in cmd-center.js's init will always race the auth listener.

The agent identifies which mechanism is in play. **Halt and surface findings before applying any fix** so the architect can confirm the diagnosis.

---

## §4 — Fix specification

Cannot specify the fix until §3 investigation completes. The brief defers to the agent's diagnosis.

The agent halts after §3 and surfaces:

1. The current `_init()` await pattern in cmd-center.js (verbatim quote)
2. The current `_phudFirmIdReady` populate logic in auth.js (verbatim quote)
3. The diagnosed race mechanism
4. The proposed fix
5. The expected impact on cross-firm isolation (CMD-AEGIS-1's protection must be preserved)

After architect confirmation of the diagnosis and proposed fix, the agent applies the fix and proceeds to §5 verification.

**Constraints on the fix:**

- The fail-fast behavior must be preserved as defense-in-depth — if FIRM_ID is genuinely unavailable (e.g., user not authenticated, auth.js failed entirely), cmd-center.js should still refuse to initialize rather than fall back to a default.
- The fix should not introduce a polling loop without bound. If the agent's diagnosis suggests polling is the right approach, the polling has a maximum duration (e.g., 10 seconds) and surfaces a clear error if the deadline passes.
- The fix should be defensive about repeated access — if cmd-center.js can be re-initialized (e.g., via SPA navigation), the await pattern handles that gracefully.

---

## §5 — Behavioral verification

### §5.1 Sentinel — code identity

1. Hard-refresh the application. Console banner shows CMD-AUTH-INIT-RACE.
2. Verify `window._PROJECTHUD_VERSION` matches.
3. **PASS** = post-CMD code is loaded.

### §5.2 Cold-load reliability

1. Close all browser tabs for the application.
2. Clear browser cache (or use a fresh incognito/private window).
3. Open the application URL.
4. Verify dev console shows NO `auth.js did not populate window.PHUD.FIRM_ID` error.
5. Open Aegis (cmd-center panel). Verify it loads with sessions panel visible, command bar functional.
6. Repeat 3 times to verify consistency.
7. **PASS** = cold load succeeds reliably.

### §5.3 Hard-refresh reliability

1. With application loaded, perform hard-refresh (Cmd-Shift-R / Ctrl-Shift-R).
2. Verify Aegis loads cleanly without the FIRM_ID error.
3. Repeat 3 times.
4. **PASS** = hard-refresh succeeds reliably.

### §5.4 Tab-restore behavior

1. With application loaded and Aegis functional, close the tab.
2. Restore the tab via browser's reopen-closed-tab affordance.
3. Verify Aegis loads cleanly.
4. **PASS** = tab restore succeeds.

### §5.5 Cross-firm isolation regression

1. Log in as a user belonging to firm A.
2. Verify Aegis presence channel subscribes to firm A's `hud:` channel ONLY (check `_channel.topic` or equivalent in console).
3. Open a second browser session, log in as a user belonging to firm B.
4. Verify firm B's Aegis subscribes to firm B's `hud:` channel ONLY.
5. Verify firm A's session does not see firm B's presence updates and vice versa.
6. **PASS** = CMD-AEGIS-1's security fix is preserved.

### §5.6 Defense-in-depth fail-fast

1. Simulate a genuine FIRM_ID failure (e.g., temporarily override auth.js to not populate FIRM_ID, or test with an unauthenticated session).
2. Verify cmd-center.js fails fast with a clear error message rather than initializing with a stale or default FIRM_ID.
3. Restore auth.js.
4. **PASS** = fail-fast behavior preserved for genuine misconfigurations.

### §5.7 Aegis script execution

1. Open Aegis with FIRM_ID resolved.
2. Run any simple command (e.g., `Set Page Minutes`, or a stored script).
3. Verify the command executes and produces transcript output.
4. **PASS** = downstream Aegis functionality is unblocked.

### §5.8 Existing CMD regression

1. Live Capture, Living Document, Decision Ledger, Digest & Send, Minutes — all surfaces load without errors.
2. End a meeting; verify auto-render fires correctly.
3. Existing renders downloadable.
4. Picker UI on Minutes surface intact.
5. **PASS** = no regression.

---

## §6 — Consumer enumeration (Iron Rule 38)

Cannot fully specify until §3 investigation completes. Likely files:

| File | Likely effect |
|---|---|
| `js/auth.js` | Possibly modified — may need to set `_phudFirmIdReady` differently, or set it earlier, or expose it as an event |
| `js/cmd-center.js` | Possibly modified — may need to await differently, or register an event listener instead of awaiting a Promise, or poll with bound |
| `accord.html` (or root HTML) | Possibly modified — script loading order or attributes |
| `js/version.js` | Pin bump to CMD-AUTH-INIT-RACE |

**No changes to:**
- Edge Function `render-minutes/index.ts` (Iron Rule 65: no template body changes)
- Schema (no migrations)
- RLS policies
- CoC events
- Surface modules beyond auth.js and cmd-center.js
- Aegis verb registry (no new verbs; CMD-AEGIS-VERIFICATION-PATTERN is the next CMD after this one)

---

## §7 — Smoke test

Operator runs after deploy:

1. Close all tabs. Clear cache. Open application in fresh window.
2. Verify dev console shows no FIRM_ID error.
3. Open Aegis. Verify it loads with sessions panel, command bar, and version banner showing CMD-AUTH-INIT-RACE.
4. Run a simple Aegis command (e.g., `Set Page Minutes`). Verify it executes.
5. Hard-refresh; repeat steps 2-4.
6. Spot-check sibling surfaces (Live Capture, Living Document, Decision Ledger, Digest & Send) load cleanly.

---

## §8 — Hand-off format

Required output:

1. Files modified — one-liner per file.
2. **§3 investigation findings as a separate hand-off section** — the diagnostic results from §3.1 through §3.4 with verbatim quotes from the current code, the diagnosed race mechanism, and the proposed fix. This section is presented BEFORE the fix is applied so the architect can confirm.
3. Diff — unified diff for each modified file.
4. Smoke test result.
5. Behavioral verification results — per §5 subtest, with explicit attention to §5.5 (cross-firm isolation regression check).
6. Findings — particularly:
   - Whether the race was on the auth.js side, the cmd-center.js side, or both
   - Whether `_phudFirmIdReady` is a Promise, event, or other primitive (this matters for future CMDs that may interact with auth state)
   - Whether the fix introduces any new initialization-ordering dependency
   - Any architectural questions about the broader auth-init pattern that surface during the work

If the fix surfaces additional bugs (other init races, other auth-related issues), surface them as findings — do not bundle fixes; one issue per CMD per Iron Rule 36 spirit.

---

## §9 — Reference materials

Required inputs (halt per Iron Rule 40 §1.1 if any are missing):

- This brief
- Current `js/cmd-center.js` (post-CMD-MINUTES-TEST-INFRA-1)
- Current `js/auth.js`
- Current `accord.html` (script loading order)
- Current `aegis.html` (script loading order)
- Brief CMD-AEGIS-1 (the original cross-firm-isolation fix; the rationale for the fail-fast behavior must be preserved)
- All Iron Rules ratifications 36-65

---

## §10 — Agent narrative instruction block

```
Apply brief-cmd-auth-init-race.md.

Pre-existing bug surfaced as F4 in CMD-MINUTES-TEST-INFRA-1; pre-
existing per CMD-AEGIS-1 §6. Now on critical path — blocks
CMD-AEGIS-VERIFICATION-PATTERN.

Two-phase work:

Phase 1 — Investigation (§3). Survey cmd-center.js's _init()
await pattern, auth.js's _phudFirmIdReady populate logic, and
the page's script loading sequence. Diagnose the specific race
mechanism. HALT after investigation. Surface findings to
architect for confirmation before applying fix.

Phase 2 — Fix (§4, §5). After architect confirmation, apply the
fix. Run §5 verification with explicit attention to §5.5 (cross-
firm isolation regression — CMD-AEGIS-1's security fix MUST be
preserved).

Constraints on the fix:
- Fail-fast behavior preserved for genuine misconfigurations
- No unbounded polling loops
- Re-initialization handled gracefully
- No regression of CMD-AEGIS-1's cross-firm isolation

Iron Rule 65 does NOT fire: no template body changes. Bump
js/version.js only; RENDER_VERSION constant unchanged.

Iron Rule 64 strictly applies: investigate the codebase before
proposing the fix. The architect's understanding from comments
and reported behavior may be incomplete.

§5 specifies eight behavioral verification subtests. §5.2 (cold-
load reliability) and §5.5 (cross-firm isolation preservation)
are the doctrinal-floor checks.

Hand-off format per §8. The §3 investigation findings are
surfaced as a SEPARATE section before the fix is applied — wait
for architect confirmation.

Halt on missing input. Halt after §3 investigation. Halt if §5.2
or §5.5 fails.

Proceed.
```

---

*End of Brief — Auth init race fix (CMD-AUTH-INIT-RACE).*
