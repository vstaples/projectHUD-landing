# Iron Rule 58 — Amendment

**Status:** amendment proposed by CMD-COC-ACTOR-RESOURCE-1; pending architect ratification on hand-off
**Original ratification:** 2026-05-05 evening
**Amendment basis:** two miscall incidents (CMD-AEGIS-1 original; CMD-SURFACE-DEP-AUDIT-1 F12) plus the Phase 1 finding S1 — a longer-running silent-corruption pattern across every CoC.write() caller from a surface that loads hud-shell.js. Call-site discipline produced repeated miscalls; the mechanism is being shifted to a defensive layer in coc.js.
**Authority:** operator + architect
**Scope unchanged:** every application code path that writes a CoC event in an authenticated user context

---

## Rule (amended)

**The actor_resource_id field of every coc_events row written via `CoC.write()` is a `resources.id`, never a `users.id`.** The translation from `users.id` to `resources.id` is now performed inside `coc.js` via a centralized async resolution chain. Callers no longer carry the burden of explicitly translating before the write.

The intent of the original IR58 (substrate writes use resource-id for actor identity to maintain proper resource-attribution) is unchanged. The mechanism shifts from per-caller discipline to centralized defensive resolution.

---

## §1 — What the rule requires (amended)

Callers of `CoC.write()` provide actor identity in one of three ways, in priority order:

1. **Pass `opts.actorResourceId`** (a `resources.id`) — the explicit override path, used when the calling context has already resolved the resource id (e.g., from a cached row, an explicit lookup, or because the caller is operating on a resource directly). This bypasses internal resolution. Preserves the CMD-A6 path; preserves backward compatibility with all correctly-coded existing callers.

2. **Pass `opts.actorUserId`** (a `users.id` / `auth.uid()`) — when the caller has a user_id but not a resource_id. coc.js performs the lookup internally via `resources?user_id=eq.<id>&limit=1`, caches the result for the session, and writes the resolved `resources.id` into `actor_resource_id`. Throws a structured Error if no matching resource row exists in the firm.

3. **Pass nothing** — coc.js resolves from the authenticated session: `window._myResource.id` if present, else session cache, else live lookup against `Auth.getCurrentUserId()`. This is the most common path for Compass / Aegis / cmd-center surfaces that already populate `_myResource`. Throws a structured Error in an authenticated context if no matching resource row exists.

System events (no auth context) fall back to a System actor with null actor_resource_id — legitimate per the original rule for trigger-side writes that genuinely have no human actor.

## §2 — When the rule does NOT fire

- Server-side / trigger-side CoC writes that already have `resources.id` in scope — unchanged from the original rule.
- Genuine system events (no auth context, no `_myResource`, no `Auth.getCurrentUserId()`) — coc.js falls back to a System actor with null `actor_resource_id`, matching the original system-fallback behavior.
- Direct `API.post('coc_events', ...)` legacy paths — these bypass `CoC.write()` entirely and therefore bypass the defensive layer. Tracked separately as CMD-COC-DIRECT-WRITER-AUDIT-1; outside this rule's scope until those paths are refactored to flow through `CoC.write()`.

## §3 — Cross-module application

The rule applies uniformly to every coding agent across all ProjectHUD modules. Callers may continue to use `opts.actorResourceId` for surfaces that have their own resolution path (e.g., accord-minutes.js using its inline `_myResource → live lookup` chain — that chain is now redundant with the defensive layer but remains correct and is preserved). Callers that previously relied on `_resolveActor()` to "do the right thing" will now have it actually do the right thing without per-caller fixes.

## §4 — Failure mode (clarified by amendment)

When the resolution chain definitively fails in an authenticated context (no override, no `_myResource`, no cache, no lookup match), `CoC.write()` **throws a structured Error** rather than writing a row with a null or wrong-typed `actor_resource_id`. This converts silent corruption into a loud, debuggable failure — consistent with the spirit of the original rule (substrate integrity is non-negotiable). Callers that need to absorb the failure can catch.

For genuinely-unauthenticated system events, the System fallback (null actor_resource_id, name='System') is preserved.

## §5 — Pre-amendment legacy data

Historical `coc_events` rows written during the silent-corruption period (since hud-shell.js started populating `window.CURRENT_USER` with `users.id`) may carry `actor_resource_id` values that are actually `users.id` and FK-violate against `resources.id`. Those rows are forensically unreliable for actor attribution. Backfill scope is filed as CMD-COC-ACTOR-BACKFILL-1.

---

*Iron Rule 58 amended by CMD-COC-ACTOR-RESOURCE-1, 2026-05-06.*
*Original ratification text retained at §211-334 of `Iron_Rules_56-60_Ratifications.md`; this document supersedes §1-§3 of that text and adds §4-§5.*
