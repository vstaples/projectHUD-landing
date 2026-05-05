# Brief · Aegis cross-firm presence leak fix · CMD-AEGIS-1

## §0 — Standing rules for fresh agent

Read before proceeding.

**Iron Rule 36 — hand-off terseness.** Diff, smoke test result,
findings as one-liners. No narration in the hand-off.

**Iron Rule 37 — work silently mid-execution.** No diagnostic
narration. The only permitted mid-work communication is genuine
clarification questions when scope is ambiguous. Do the looking,
ship the answer.

**Iron Rule 38 — schema-migration consumer enumeration.**
Function-duplication awareness applies. This brief enumerates
consumers in §10. Verify on the way through.

**Iron Rule 39 — RLS behavioral verification.** This brief
prescribes behavioral tests that prove cross-firm presence
isolation holds.

**Iron Rule 40 — agent execution discipline.** Halt on missing
input. Terse transcript. Test instructions in handoff. Dev-
console-first debugging.

**Iron Rule 47 (amended) — schema-existence verification.** The
amendment broadened scope to all layers including JS. Apply when
reading `resources` columns in this fix.

**Iron Rule 50 — HTTP-based behavioral verification.**
Cross-firm presence verification requires two browser sessions
in two different firms; SQL editor cannot reproduce the
condition.

---

## §1 — Purpose

Fix the cross-firm presence leak in `cmd-center.js` surfaced by
CMD-A3 §10.5. After CMD-AEGIS-1 ships:

1. Aegis presence channels are correctly firm-scoped per
   authenticated identity. A user in firm 1 sees presence
   indicators only for users in their own firm.
2. The hardcoded firm A UUID fallback in `cmd-center.js` is
   removed. Sessions that cannot resolve a real `firm_id` halt
   identity-dependent operations rather than silently defaulting.
3. Identity resolution fetches `firm_id` from the `resources`
   row at session-resolve time.
4. Behavioral verification with two browser sessions in two
   different firms confirms isolation holds.

This is a focused fix, not a refactor. Scope is limited to the
identity / presence-channel-naming code path.

---

## §2 — Scope

### In scope

- Modify `cmd-center.js` identity resolution to fetch `firm_id`
  from `resources` row.
- Modify `cmd-center.js` channel-naming to use the
  authenticated firm_id, not a fallback constant.
- Remove or repurpose the hardcoded firm A UUID fallback. The
  agent's choice between hard-removal and fatal-error-on-missing
  is acceptable; either eliminates the leak.
- Audit all other channel-name derivations in `cmd-center.js`
  (and any other JS module that subscribes to firm-scoped
  channels) for similar hardcoded assumptions. Surface findings
  even if no immediate fix needed.
- Behavioral test verifying cross-firm presence isolation with
  two browser sessions in two different firms.
- Version pin bump to CMD-AEGIS-1.

### Out of scope

- Realtime channel-level RLS adoption (separate future brief —
  this CMD addresses the application-layer leak; Realtime-RLS
  would add Supabase-layer enforcement)
- Refactor of the broader `cmd-center.js` identity flow
- Changes to Accord-side channels (already correctly
  firm-isolated per CMD-A3 §10.4)
- Changes to surface code (Compass, Accord, etc.) that consume
  presence — they continue to subscribe through `cmd-center.js`'s
  API; only the channel name changes
- Migration of existing localStorage `phud:presence:*` /
  `phud:cmd:*` keys (these are session-scoped; old keys age out
  naturally)
- Changes to `coc.js` or any CoC event writes

---

## §3 — Root-cause inspection (architect-side analysis)

For agent context. The agent verifies these against the actual
production source before fixing.

**Layer 1 — Module-load-time fallback.** `cmd-center.js` line
67–68:

```javascript
var FIRM_ID = (typeof PHUD !== 'undefined' && PHUD.FIRM_ID) ||
              'aaaaaaaa-0001-0001-0001-000000000001';
```

`window.PHUD.FIRM_ID` is never assigned anywhere in production
code. Every session falls through to the hardcoded fallback.

**Layer 2 — Session resolution doesn't fetch firm.** Line 155
(`_resolveSession()`) and line 5319 (the `_myResource`
identity-resolve fetch) do not SELECT `firm_id` from the
`resources` row. The `resources` table has a `firm_id` column
(verifiable via `schema_fk_audit('resources')` per Iron Rule 47);
the existing code just doesn't ask for it.

**Layer 3 — Channel naming uses module-scoped FIRM_ID.** Lines
302–303:

```javascript
var TARGET_CHANNEL_NAME = 'hud:' + FIRM_ID;
var LEGACY_CHANNEL_NAME = 'cmd-center-' + FIRM_ID;
```

These read the module-scoped `FIRM_ID` (the hardcoded fallback),
not the authenticated user's actual firm_id.

**Compounding effect.** Even when `CURRENT_USER` correctly
resolves Vaughn → firm A and Jim → firm B, both subscribe to
`hud:aaaaaaaa-0001-0001-0001-000000000001` because that's the
fallback, and both sessions converge on the same Aegis presence
channel.

The fix must address all three layers; fixing only one leaves the
leak intact.

---

## §4 — Fix specification

### §4.1 Layer 2 fix — fetch firm_id at identity resolution

Modify the `_myResource` identity-resolve fetch (currently at
~line 5319) to include `firm_id` in the SELECT:

```javascript
// Before:
var rr = await fetch(
  SUPA_URL + '/rest/v1/resources?user_id=eq.' + au.id +
  '&select=id,first_name,last_name,user_id,email&limit=1',
  { headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + tok } }
);

// After:
var rr = await fetch(
  SUPA_URL + '/rest/v1/resources?user_id=eq.' + au.id +
  '&select=id,first_name,last_name,user_id,email,firm_id&limit=1',
  { headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + tok } }
);
```

Apply the same `firm_id` addition to the email-fallback fetch
in the line below, and to any other `resources` SELECT in
`cmd-center.js`. The `_myResource` global must carry `firm_id`
when set:

```javascript
window._myResource = {
  name: fn,
  user_id: rx.user_id || au.id,
  id: rx.id,
  firm_id: rx.firm_id    // NEW
};
```

The agent verifies `resources.firm_id` exists in production via
`information_schema.columns` query before relying on it (Iron
Rule 47).

### §4.2 Layer 1 fix — eliminate the hardcoded fallback

Replace the module-load-time fallback with a deferred resolution
pattern. Two acceptable forms:

**Form A — Fatal error on missing firm:**

```javascript
// At top of file, replace the FIRM_ID constant declaration:
var FIRM_ID = null;  // resolved during init from _myResource.firm_id

// Helper to read it later:
function _resolveFirmId() {
  if (FIRM_ID) return FIRM_ID;
  if (window._myResource && window._myResource.firm_id) {
    FIRM_ID = window._myResource.firm_id;
    return FIRM_ID;
  }
  if (typeof PHUD !== 'undefined' && PHUD.FIRM_ID) {
    FIRM_ID = PHUD.FIRM_ID;
    return FIRM_ID;
  }
  throw new Error('[cmd-center] Cannot resolve firm_id; identity not yet established');
}
```

**Form B — Promise-gated readiness:**

The init flow already has an identity-resolution polling pattern
(line 5358–5360 area). Extend that pattern to also wait for
`firm_id` resolution before any channel subscription. The
hardcoded fallback is removed; any code path that needs
`FIRM_ID` before identity is resolved either waits or throws.

**Architect's preference: Form A.** It's smaller, more explicit,
and the existing init flow already defers connection until
identity resolves (line 5356–5360 comment confirms this).
`_resolveFirmId()` called inside the channel subscription block
will work correctly because subscription happens post-identity-
resolution. Agent free to choose Form B if Form A creates
ordering problems the agent discovers during implementation.

### §4.3 Layer 3 fix — channel naming uses resolved firm_id

Replace the module-scoped FIRM_ID reads in channel-naming with
calls to `_resolveFirmId()` (or the resolved `_mySession.firmId`,
provided that field is correctly populated per §4.4):

```javascript
// Before (lines 302–303):
var TARGET_CHANNEL_NAME = 'hud:' + FIRM_ID;
var LEGACY_CHANNEL_NAME = 'cmd-center-' + FIRM_ID;

// After:
var firmId = _resolveFirmId();  // throws if unresolved
var TARGET_CHANNEL_NAME = 'hud:' + firmId;
var LEGACY_CHANNEL_NAME = 'cmd-center-' + firmId;
```

The agent audits the rest of the file for any other use of
`FIRM_ID` and replaces with the resolution call. Likely
candidates: line 165 (`_mySession.firmId` initialization), line
1354 (event envelope `firm_id` field), and any others surfaced
by grep.

### §4.4 `_mySession.firmId` correctness

Line 165 currently writes the module-scoped FIRM_ID into
`_mySession.firmId`:

```javascript
_mySession = {
  ...
  firmId: FIRM_ID,
};
```

Replace with the resolved firm_id from `_myResource`:

```javascript
_mySession = {
  ...
  firmId: (window._myResource && window._myResource.firm_id) || _resolveFirmId(),
};
```

This ensures `_mySession.firmId` carries the user's actual firm,
not the fallback constant. Any consumer of `_mySession.firmId`
(including the popout-state save/restore path at line 5345)
inherits the correct value.

### §4.5 Audit other channel-name derivations

The agent greps `cmd-center.js` (and any other JS module that
imports or duplicates this pattern — see Iron Rule 38) for
channel-naming patterns:

- Searches like `'hud:' +`, `'cmd-center-' +`, `'phud:' +`,
  `channel(` should be inspected.
- Any channel name that incorporates a firm identifier must
  derive it from authenticated identity, not from a constant.
- Any channel name that does NOT incorporate a firm identifier
  should be flagged — channel names without firm scoping are a
  cross-tenant exposure surface.

The agent surfaces audit findings even if no immediate fix is
needed. The audit's purpose is documenting what's there; not
every finding requires action in this CMD.

---

## §5 — What `resources.firm_id` exposure implies for security model

For agent context. The `resources.firm_id` column is RLS-
protected on read — a user can only SELECT their own firm's
resources. So the fetch in §4.1 will succeed (returning the
user's own row, including their own firm_id) regardless of which
firm they belong to. The fix doesn't introduce a new exposure;
it just reads a field the user is already authorized to see.

The `firm_id` value, once in `window._myResource.firm_id`, is
client-side and could be tampered with by a hostile user. **But
this doesn't matter** — the channel subscription is itself
RLS-bounded at the broadcast level, and the `presence` records
broadcast carry only fields the user has authorized exposure for
(name, alias, location). A user spoofing `_myResource.firm_id`
would subscribe to a channel they don't belong to but would not
gain access to data they couldn't already access via other
authenticated paths. The defense-in-depth layer that prevents
spoofing-based escalation is RLS on the underlying `resources`
SELECT, which is what we're already relying on.

The architectural commitment to lock channel-level access by
firm at the Supabase Realtime layer (Realtime RLS) is queued as
a future brief. CMD-AEGIS-1 closes the application-layer leak
without claiming to be a complete cross-tenant security review.

---

## §6 — Behavioral verification (Iron Rules 39, 50)

The agent runs these tests and reports results in the hand-off.

### §6.1 Cross-firm presence isolation

Two browser sessions, two users in **different firms**.

1. Session A (Vaughn, firm 1) loaded into Compass or Accord.
2. Session B (a user in firm 2 — use existing test user if
   available; if no firm-2 user exists, see §6.4 fallback).
3. Verify Session A's presence panel shows ONLY firm 1 users.
   Session B's user is NOT visible. **PASS.**
4. Verify Session B's presence panel shows ONLY firm 2 users.
   Session A's user is NOT visible. **PASS.**
5. Verify in browser console for Session A:
   ```javascript
   console.log(window._myResource.firm_id);
   // Should print firm 1's UUID, not the hardcoded fallback.
   ```
6. Repeat for Session B; should print firm 2's UUID.

### §6.2 Same-firm presence still works

Two browser sessions, two users in the **same firm**.

1. Session A and Session B both in firm 1.
2. Verify Session A's presence panel shows Session B's user
   (and vice versa). **PASS.** Same-firm presence not broken
   by the fix.

### §6.3 Identity-resolution failure mode

1. Browser session with no authenticated user (logged-out
   state).
2. Navigate to a page that loads `cmd-center.js`.
3. Verify the surface degrades gracefully — either:
   - The presence panel shows "no identity" or equivalent, OR
   - The console shows the expected error from `_resolveFirmId()`,
   - The page does NOT crash with an uncaught exception.
4. **PASS** = degradation is graceful; **FAIL** = uncaught
   exception or page break.

### §6.4 Fallback if no firm-2 user available

If the operator does not have credentials for a second-firm user
to run §6.1, the agent halts and surfaces. Two options:

- **Option A:** Operator seeds a test user in firm 2 (e.g.,
  Nicole J. in firm B if she's not already there); agent runs
  §6.1 against the seeded user.
- **Option B:** §6.1 deferred with hand-off reporting "not run
  — credentials unavailable." Per Iron Rule 50, this is
  acceptable as a "not run" finding rather than a doctrinal
  pass.

Architect prefers A. The fix's primary doctrinal verification is
§6.1; deferring it would leave the leak's closure unproven at
the surface level.

---

## §7 — Realtime channel access caveat (documented, not fixed)

Per inventory v2.2 §7.6.7. Supabase Broadcast channels are
publicly subscribable by name. Even after CMD-AEGIS-1, a hostile
actor who knows another firm's UUID could subscribe to that
firm's `hud:{firm_id}` channel and receive presence broadcasts.

The defense-in-depth layers that prevent this from being a
practical exploit:

1. The presence records broadcast carry only fields the user
   has authorized exposure for (name, alias, location); no
   sensitive data is in the broadcast payload itself.
2. Firm UUIDs are not trivially guessable.
3. Even with a known firm UUID, the hostile session's
   underlying RLS-protected reads (anything beyond presence
   broadcast payloads) remain inaccessible.

A future Realtime-RLS adoption brief will lock channel-level
access by firm at the Supabase layer. Lower priority than this
CMD because that's a cross-cutting infrastructure change; this
CMD is a focused application-layer fix.

---

## §8 — Style doctrine compliance

No surface changes in this CMD. Style Doctrine v1.7 doesn't
apply. The fix is JavaScript identity / channel-naming logic only.

---

## §9 — What must work after this ships

1. `cmd-center.js` no longer contains the hardcoded firm A UUID
   fallback (or it's been repurposed to throw on missing firm).
2. `_myResource.firm_id` is populated correctly per session.
3. `_mySession.firmId` carries the user's actual firm_id.
4. The Aegis presence channel name (`hud:{firm_id}`) is firm-
   correct per session.
5. Two-browser-session cross-firm test passes (§6.1).
6. Two-browser-session same-firm test still works (§6.2).
7. Graceful degradation in logged-out state (§6.3).
8. No regression in Compass or Accord — both pages load
   cleanly, both subscribe to their correct firm's channel.
9. Console banner shows CMD-AEGIS-1.

---

## §10 — Consumer enumeration (Iron Rule 38)

Files affected by this CMD:

| File | Effect |
|---|---|
| `cmd-center.js` | Identity resolution + channel naming + audit findings |
| `js/version.js` | Pin bump |

Files audited but not modified (unless audit surfaces issues):

| File | Audit purpose |
|---|---|
| `auth.js` | Verify identity resolution upstream of `cmd-center.js` |
| `api.js` | Verify no other `resources` SELECTs that miss `firm_id` |
| `compass.html` | Verify no inline `FIRM_ID` references |
| `accord.html` | Verify no inline `FIRM_ID` references |
| `hud-shell.js` | Verify no duplicate channel-naming logic (function-duplication awareness per Rule 38 §2) |
| `sidebar.js` | Same as above |

The agent enumerates audit findings in the hand-off as
one-liners. If any audited file contains a similar leak pattern,
the agent halts and surfaces before fixing — that may warrant
a separate brief.

Tables read by this CMD:

| Table | Effect |
|---|---|
| `resources` | SELECT extended to include `firm_id` column (read-only) |

No tables modified. No CoC events written. No schema changes. No
RLS policy changes.

---

## §11 — Smoke test

Operator runs after deploy:

1. Hard-refresh `compass.html`. Compass loads cleanly. Open
   browser console:
   ```javascript
   console.log(window._myResource);
   ```
   Expect `firm_id` present and matching the operator's actual
   firm.
2. Hard-refresh `accord.html`. Accord loads cleanly. Same
   console check; same expected result.
3. From a second browser session (different firm user; see §6.4
   if unavailable), repeat the console check. Expect a
   different `firm_id`.
4. With both sessions logged in, open the Aegis presence panel
   in each. Verify cross-firm isolation per §6.1.
5. Spot-check: `coc.js` events still write correctly (capture a
   node in Accord, verify `coc_events` row created with correct
   `firm_id`). No regression in CoC writes.
6. Console banner shows CMD-AEGIS-1.

If smoke test cannot be run live: agent runs cURL / single-browser
checks against staging; operator runs the multi-browser cross-firm
test post-deploy.

---

## §12 — Hand-off format (Iron Rule 36)

Required output:

1. **Files modified / created** — one-liner per file.
2. **Diff** — unified diff for `cmd-center.js`, `js/version.js`.
3. **Smoke test result** — pass / fail / not run.
4. **Behavioral verification results** — per §6 subtest:
   - §6.1 Cross-firm isolation: PASS / FAIL / not run
   - §6.2 Same-firm presence: PASS / FAIL / not run
   - §6.3 Logged-out degradation: PASS / FAIL
5. **Audit findings** — one-liner per file from §10's audit
   table. Even "no issues found" is a useful finding.
6. **Other findings** — zero or more one-liners.

Do not transcribe reasoning. Do not echo brief content.

If §6.1 fails or surfaces unexpected behavior, halt and surface
as finding before pushing further changes (Iron Rule 40 §1.1).

---

## §13 — Reference materials

- This brief (`brief-cmd-aegis-1-presence-leak-fix.md`)
- `Iron_Rules_36-40_Ratifications.md` (Rule 38 amended)
- `Iron_Rules_47-50_Ratifications.md` (Rule 47 amended; Rule 50)
- `projecthud-file-inventory-v2_2.md` (§7.6.7 documents this
  leak)
- `aegis-shared-loaders-inventory-v1.md` — Aegis architecture
  context
- CMD-A3 hand-off (the §10.5 finding that surfaced this)
- Production source files: `cmd-center.js`, `auth.js`,
  `api.js`, `compass.html`, `accord.html`, `hud-shell.js`,
  `sidebar.js`, `js/version.js`
- Access to a Supabase environment with at minimum:
  - The `resources` table accessible via PostgREST
  - Two test users in different firms (or operator-side
    seeding of a second-firm user — see §6.4)

If any input is missing, halt per Iron Rule 40 §1.1.

---

## §14 — Agent narrative instruction block

Per Iron Rule 39 §1, the operator copy-pastes the block below
into the agent's conversation as the first input.

```
Apply brief-cmd-aegis-1-presence-leak-fix.md.

This is the first Aegis-side brief from the Accord build arc —
a focused fix to close the cross-firm presence leak that CMD-A3
§10.5 surfaced in cmd-center.js. The leak is three-layered (see
brief §3); the fix addresses all three layers.

Standing rules: Iron Rules 36, 37, 38, 39, 40, 47 (amended), 50
apply per §0. The fix is read-only against `resources` (extends
the SELECT to include `firm_id`); no schema changes; no CoC
events written.

§6 specifies three behavioral verification tests. §6.1 is the
primary doctrinal verification (cross-firm isolation). If
operator credentials for a second-firm user are unavailable, see
§6.4 for the fallback protocol.

Hand-off format per §12: files, diff, smoke test, §6 results,
audit findings, other findings. No narration.

Halt on missing input. If §6.1 fails or audit surfaces a similar
leak in another file, halt and surface as finding.

Proceed.
```

---

## §15 — Enumerated inputs (Iron Rule 39 §2)

The agent needs:

- This brief
- `Iron_Rules_36-40_Ratifications.md` (with Rule 38 amendment)
- `Iron_Rules_41-46_Ratifications.md`
- `Iron_Rules_47-50_Ratifications.md` (with Rule 47 amendment)
- `projecthud-file-inventory-v2_2.md`
- `aegis-shared-loaders-inventory-v1.md`
- `cmd-center.js` (production source — primary file to modify)
- `auth.js`, `api.js`, `compass.html`, `accord.html`,
  `hud-shell.js`, `sidebar.js` (production sources for audit)
- `js/version.js`
- CMD-A3 hand-off (the §10.5 finding context)
- Access to a Supabase environment per §13

If any input is missing, halt per Iron Rule 40 §1.1.

---

## §16 — Enumerated outputs (Iron Rule 39 §3)

The agent produces:

1. Modified `cmd-center.js` — identity resolution + channel
   naming fixed; hardcoded fallback removed/repurposed
2. Modified `js/version.js` — CMD-AEGIS-1 pin
3. Hand-off document with: files, diff, smoke test, §6
   verification results, audit findings, other findings — per
   §12 / Iron Rule 36

No additional artifacts.

---

*End of Brief — Aegis cross-firm presence leak fix
(CMD-AEGIS-1).*
