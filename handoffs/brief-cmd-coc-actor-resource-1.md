# Brief · CoC actor-resource resolution hardening · CMD-COC-ACTOR-RESOURCE-1

## §0 — Standing rules for fresh agent

Read before proceeding.

**Iron Rule 36, 37, 38, 39, 40** — base operating discipline.
**Iron Rule 42** — substrate immutability holds. The CoC chain integrity is non-negotiable.
**Iron Rule 51** — class-conditional treatments at construction time.
**Iron Rule 52 §4** — function-name and logical-concern collision check.
**Iron Rule 55** — architect-side canonical-source verification.
**Iron Rule 58** — application-code users.id → resources.id resolution at write-site. **This rule is being AMENDED by this CMD.** The amendment moves the resolution from call-site discipline to coc.js's internal resolution. The rule's intent (writes must use resource_id, not user_id, for actor identity) is preserved; the mechanism shifts from per-caller responsibility to centralized defensive layer.
**Iron Rule 60** — first-caller hazard awareness for the new internal-resolution path.
**Iron Rule 64** — codebase-as-spec strictly applies. The agent surveys every existing `CoC.write()` caller before specifying the resolution behavior; the existing callers are the canonical evidence base.
**Iron Rule 65** — render-version dual-pin applies only to template body changes. **This CMD does NOT modify any render template body bytes; `RENDER_VERSION` does NOT need to move. Bump only `js/version.js`.**

This is an architectural-correction CMD, not a routine bug-fix. It amends a ratified Iron Rule and changes a foundational substrate-write contract. Investigation pattern: survey first, surface findings, halt for architect confirmation, then apply.

---

## §1 — Purpose

Two incidents have demonstrated that IR58's call-site discipline (every caller of `CoC.write()` must resolve users.id → resources.id before writing) is hard to maintain at scale:

- **CMD-AEGIS-1 (original incident)** — surfaced the user_id-vs-resource_id confusion; ratified IR58 as call-site discipline
- **CMD-SURFACE-DEP-AUDIT-1 F12** — `mw-timesheet.js` line 214 passes `Auth.getCurrentUserId()` (user_id) where `actor_resource_id` is required. Pre-audit this was silently masked because the calling surface didn't load coc.js. Post-audit (canonical CoC loading) the FK error fires loudly.

The audit converted the failure mode from invisible-and-cumulative to visible-and-individual. The fix-at-call-sites approach (option 2) would address the immediate `mw-timesheet.js` bug but leaves the *class* of bug intact: the next caller introduced by any future CMD can repeat the mistake.

This CMD harden's `coc.js` with internal user_id → resource_id resolution (option 3). After this CMD ships:

1. `CoC.write()` accepts EITHER `actor_user_id` OR `actor_resource_id` in its payload
2. If `actor_resource_id` is provided, it's used directly (preserves correctly-coded callers)
3. If only `actor_user_id` is provided, `coc.js` internally resolves to resource_id via the established users.id → resources.id lookup
4. If neither is provided, OR resolution fails, the write throws with a clear diagnostic error
5. The `mw-timesheet.js` miscall (and any other latent miscall) starts working correctly without per-caller fixes
6. IR58 is amended: the rule's intent (writes use resource_id) is preserved; the mechanism shifts from call-site discipline to centralized defensive resolution

---

## §2 — Scope

### In scope

- Phase 1: survey every existing `CoC.write()` caller across the codebase. Document each caller's actor argument shape (what field/value they pass)
- Phase 1: identify the canonical resolution pattern (how does coc.js currently look up resources.id given a user.id? Is there an existing helper?)
- Phase 1 HALT: surface findings to architect; await confirmation
- Phase 2 (after confirmation): modify `coc.js` to accept either actor_user_id or actor_resource_id; resolve internally if needed
- Phase 2: clear, structured error messages when resolution fails
- Update IR58's canonical text to reflect the amendment
- Behavioral verification per §5
- Pin bump in `js/version.js` (no `RENDER_VERSION` change per Iron Rule 65)
- Hand-off per §8

### Out of scope

- Caller-site rewrites — the defensive layer means callers don't need fixing. If any caller has *additional* bugs surfaced during investigation (e.g., wrong event_class, malformed metadata), surface as findings; do not fix.
- Schema changes to `coc_events` table — the FK constraint stays; only the writer-side logic changes
- RLS policy changes
- New CoC event types
- Any changes to existing event flow, broadcasting, or substrate-rendering logic
- The original `mw-timesheet.js` line 214 specifically — the defensive layer makes this work without touching mw-timesheet.js. Confirm during verification but don't pre-emptively edit.
- Iron Rule renumbering — IR58 is amended in place; no new rule number assigned.

---

## §3 — Investigation requirements (Phase 1)

### §3.1 Survey existing CoC.write() callers

Locate every call to `CoC.write()` (and any wrapper functions like `_writeEvent`, `coc.emit`, etc.) across the codebase. Use grep:

```bash
grep -rn "CoC.write\|coc.write\|_writeEvent\|coc_events" js/ supabase/
```

For each caller, document:
- File path + line number
- Actor argument as currently passed (the value that lands in `actor_resource_id` field)
- Whether the value is a user_id (auth.uid()) or resource_id (from resources table lookup)
- The resolution logic used (if any) to translate user_id → resource_id at the call site

### §3.2 Identify the existing resolution mechanism

Per IR58 the call-site mandate exists; find where the resolution actually happens. Possibilities:

- A helper function in `auth.js` (e.g., `Auth.getCurrentResourceId()`)
- A helper function in `api.js`
- A direct query at each call site (`SELECT id FROM resources WHERE user_id = ...`)
- The `_myResource.id` global referenced in CMD-SURFACE-DEP-AUDIT-1 hand-off
- Some combination

The agent surveys to identify what the canonical resolution path actually is, since that pattern will be moved into coc.js's internal logic.

### §3.3 Identify the resources table lookup pattern

Determine:
- The exact relationship: `resources.user_id → users.id` (or some other shape)
- Whether multiple resources rows can exist per user (1:N), or if it's strictly 1:1
- Whether some users genuinely have no resource_id (and if so, what should the writer do?)
- RLS implications for the lookup (does coc.js have SELECT permission on resources?)

### §3.4 Document `_myResource` global

CMD-SURFACE-DEP-AUDIT-1 hand-off mentioned `window._myResource.id` is the correct resource_id. Document:
- Where is this global populated?
- What's the lifecycle (when does it become available)?
- Is it firm-scoped, user-scoped, or both?
- Could coc.js rely on this global, or does it need its own resolution logic?

### §3.5 Halt and surface findings

After Phase 1 completes, the agent halts and surfaces:

1. Inventory of all CoC.write() callers (file, line, actor-argument shape)
2. Findings table: callers passing user_id vs callers passing resource_id (the F12 mw-timesheet.js miscall should be one of N entries)
3. Canonical resolution pattern documentation
4. `_myResource` global mechanics
5. Recommended internal-resolution implementation for coc.js (using which mechanism: cached `_myResource.id` vs. live query vs. helper from auth.js)
6. Any architectural surprises

The agent waits for architect confirmation before proceeding to Phase 2.

---

## §4 — Fix specification (Phase 2, applies after architect confirmation)

The architect cannot fully specify the fix until §3 reveals the canonical resolution pattern. Phase 2 will be specified after Phase 1 surfaces findings.

Anticipated shape:

### §4.1 coc.js write() signature evolution

Current (presumed):
```javascript
CoC.write({
  event_class,
  event_type,
  entity_id,
  metadata,
  actor_resource_id,  // required; caller's responsibility
})
```

Proposed:
```javascript
CoC.write({
  event_class,
  event_type,
  entity_id,
  metadata,
  actor_resource_id,  // optional; if provided, used directly
  actor_user_id,      // optional; if provided & no resource_id, resolved internally
})
```

Resolution logic:
1. If `actor_resource_id` is provided and non-null, use it
2. Else if `actor_user_id` is provided, resolve via the canonical pattern from §3.2/§3.3 (likely `_myResource.id` if user_id matches `_mySession.userId`, else lookup query)
3. Else attempt to resolve from the current authenticated session (use `_myResource.id` if available)
4. If resolution fails, throw with diagnostic: `[CoC.write] Cannot resolve actor_resource_id for actor_user_id=<id>. The user may not have a resource row in this firm. Caller: <caller info if traceable>.`

### §4.2 Backward compatibility

Existing callers passing `actor_resource_id` correctly continue to work unchanged. Existing callers passing user_id where resource_id is required (the F12 class) start working correctly without per-caller fixes.

### §4.3 IR58 amendment

The canonical text of Iron Rule 58 is amended to reflect:
- Original intent preserved: CoC writes use resource_id for actor identity
- Mechanism shift: from call-site discipline to coc.js internal resolution
- Defensive layer in coc.js handles user_id → resource_id translation
- Call-sites MAY pass user_id (resolved internally) or resource_id (used directly)
- Rule's name and number unchanged (IR58); the canonical text gets a v2 marker noting the amendment

The agent produces an updated `Iron_Rule_58_Ratification.md` (if such a file exists in project files) or surfaces the proposed amendment text for architect to incorporate into doctrine.

---

## §5 — Behavioral verification

### §5.1 Sentinel — code identity

1. Hard-refresh the application. Console banner shows CMD-COC-ACTOR-RESOURCE-1.
2. **PASS** = post-CMD code is loaded.

### §5.2 The mw-timesheet.js latent bug self-resolves (DOCTRINAL FLOOR)

1. Trigger the surface action that produced the F12 FK error in CMD-SURFACE-DEP-AUDIT-1 (whatever exercises mw-timesheet.js line 214 — likely Compass timesheet save).
2. Verify the action completes without error.
3. Verify a `coc_events` row is written with the correct `actor_resource_id` (NOT a user_id; NOT null).
4. Verify the row's actor_resource_id matches `_myResource.id` for the current operator.
5. **PASS** = defensive layer correctly resolves user_id → resource_id; previously-broken caller now writes successfully.

### §5.3 Correctly-coded callers continue working (DOCTRINAL FLOOR)

For at least three known correctly-coded callers (callers from Phase 1 survey that already pass resource_id correctly):

1. Trigger each caller.
2. Verify the CoC.write succeeds.
3. Verify the actor_resource_id in the resulting row matches what the caller passed (no double-resolution; no overriding).
4. **PASS** = backward compatibility preserved.

### §5.4 Diagnostic error on resolution failure

1. Construct a synthetic test case where neither actor_resource_id nor actor_user_id can resolve (e.g., authenticated user has no resource row).
2. Verify CoC.write() throws with the structured diagnostic message from §4.1.
3. Verify the error is logged to console and surfaced to the calling code (not silently swallowed).
4. **PASS** = resolution failure produces clear, debuggable error.

### §5.5 Cross-firm isolation regression

1. Two-firm test (if Ron is in firm B per the deferred §9.7): verify a user in firm A writing CoC events does NOT have their writes attributed to a firm B resource_id (and vice versa).
2. **PASS** = cross-firm isolation holds; resolution doesn't leak across firms.

### §5.6 Existing CMD regression

1. Live Capture, Living Document, Decision Ledger, Digest & Send, Minutes — all surfaces load and write CoC events correctly.
2. End a meeting; verify auto-render fires; CoC events for the seal write correctly.
3. Run an Aegis playbook from Library; verify run_started and run_completed events write correctly.
4. **PASS** = no regression of prior CMD work.

---

## §6 — Consumer enumeration (Iron Rule 38)

Cannot fully specify until §3 investigation completes. Likely files:

| File | Likely effect |
|---|---|
| `js/coc.js` | Modified — write() signature accepts both actor_user_id and actor_resource_id; internal resolution logic added |
| `js/version.js` | Pin bump to CMD-COC-ACTOR-RESOURCE-1 |
| `Iron_Rule_58_Ratification.md` (if in project files) | Amended to reflect the mechanism shift |

**Files audited but probably not modified (per scope):**

| File | Audit purpose |
|---|---|
| `js/auth.js` | Verify `_myResource` population logic; potentially relied on by new resolution path |
| `js/api.js` | Verify any existing user_id → resource_id helpers |
| `js/mw-timesheet.js` | Verify the F12 caller works post-fix without per-caller modification |
| Various surface modules | Verify CoC.write callers from Phase 1 inventory continue working |

**No changes to:**
- `coc_events` schema
- RLS policies
- Edge Functions
- Render templates
- CoC event types or registration
- IR58's number; only its canonical text is amended

---

## §7 — Smoke test

After Phase 2 deploy:

1. Hard-refresh the application. Console banner shows CMD-COC-ACTOR-RESOURCE-1.
2. Exercise mw-timesheet.js flow (Compass timesheet save). Verify no FK error; verify substrate row written correctly.
3. Exercise 2-3 known-correctly-coded callers; verify continued correct operation.
4. Spot-check sibling surfaces (Live Capture, Aegis, etc.) load and write CoC events correctly.

---

## §8 — Hand-off format

Required output:

1. Files modified — one-liner per file.
2. **§3 investigation findings as a separate hand-off section** — full caller inventory, canonical resolution pattern, `_myResource` mechanics, recommended implementation. Surface BEFORE applying fix; await architect confirmation.
3. Diff — unified diff for `coc.js` changes; full content for the IR58 amendment.
4. Smoke test result.
5. Behavioral verification results — per §5 subtest.
6. Findings — particularly:
   - Number of callers surveyed; how many pass user_id vs resource_id; how many were correctly coded
   - Any callers found that have OTHER bugs (wrong event_class, malformed metadata, etc.) — surface but do NOT fix in this CMD
   - Whether the defensive resolution path uses `_myResource.id` cache, live query, or auth.js helper
   - Performance implications (does resolution add a query per write? Cached?)
   - Architectural questions about long-term CoC writer ergonomics

If §5.2 (mw-timesheet self-resolves) or §5.3 (correctly-coded callers regression-free) fails, halt and surface — those are the doctrinal-floor checks.

---

## §9 — Reference materials

Required inputs (halt per Iron Rule 40 §1.1 if any are missing):

- This brief
- Current `js/coc.js`
- Current `js/auth.js`
- Current `js/mw-timesheet.js` (the F12 caller; reference, not modified)
- The CMD-SURFACE-DEP-AUDIT-1 hand-off (the F12 finding source)
- Brief CMD-AEGIS-1 (the original IR58 ratification incident)
- `Iron_Rule_58_Ratification.md` if in project files
- All Iron Rules ratifications 36-65

---

## §10 — Agent narrative instruction block

```
Apply brief-cmd-coc-actor-resource-1.md.

Architectural-correction CMD: amends IR58. Two incidents 
(CMD-AEGIS-1 original and CMD-SURFACE-DEP-AUDIT-1 F12) 
demonstrate that call-site discipline is hard to maintain at 
scale. This CMD moves user_id → resource_id resolution from 
per-caller responsibility to coc.js's internal defensive layer.

Phase 1 — Investigation:
- Survey every CoC.write() caller across the codebase
- Document each caller's actor argument shape (user_id vs 
  resource_id)
- Identify canonical resolution pattern (auth.js helper? 
  _myResource global? live query?)
- Document _myResource population mechanics
- HALT. Surface findings. Wait for architect confirmation.

Phase 2 — Fix (after confirmation):
- coc.js accepts both actor_user_id and actor_resource_id
- Internal resolution if only user_id provided
- Clear diagnostic error on resolution failure
- IR58 canonical text amended to reflect mechanism shift
- Backward compatibility for correctly-coded callers preserved

Iron Rule 64 strictly applies: the existing callers ARE the 
canonical evidence base for what resolution patterns work. 
Survey before specifying.

Iron Rule 65 does NOT fire: no template body changes. Bump 
js/version.js only.

§5.2 (mw-timesheet self-resolves) and §5.3 (correctly-coded 
callers regression-free) are doctrinal-floor checks. Halt on 
either failure.

Hand-off format per §8. Surface §3 findings as a separate 
section before fix is applied.

Halt on missing input. Halt after §3 investigation. Halt if 
§5.2 or §5.3 fails.

Proceed.
```

---

## §11 — A note on IR58's amendment

IR58 was ratified after the CMD-AEGIS-1 incident as call-site discipline: every caller of CoC.write() must resolve user_id → resource_id at the write site. The rule was correct in intent (substrate writes must use resource_id for actor identity to maintain proper resource-attribution) but the mechanism placed the burden on every caller across an evolving codebase.

Two miscall incidents demonstrate the discipline is hard to maintain at scale. Moving the resolution into coc.js converts a discipline-dependent rule into a structural guarantee. The rule's intent is preserved; the mechanism shifts.

This is the first amendment to a ratified Iron Rule in the build arc. The pattern is worth marking for future doctrine: **rules ratified as call-site discipline that produce repeated miscall incidents are candidates for amendment to defensive-layer enforcement.** Not a new rule yet (one amendment is one data point), but a pattern worth tracking if it recurs.

The amended IR58 text is produced by the agent; the architect ratifies the amendment when this CMD's hand-off lands.

---

*End of Brief — CoC actor-resource resolution hardening (CMD-COC-ACTOR-RESOURCE-1).*
