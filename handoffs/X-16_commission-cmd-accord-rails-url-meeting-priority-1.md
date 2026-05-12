# Commission · X-16 · CMD-ACCORD-RAILS-URL-MEETING-PRIORITY-1

**Phase:** Ancillary — URL meeting ID persistence on navigation
**Authored:** 2026-05-12
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Predecessor:** A-08 in final debug — blocked on this fix
**Coding agent:** execute sequentially; halt-and-surface after §5

---

## §1 — Scope

When a user navigates into a meeting from the constellation or workstream view,
`accord.html` URL does not update to include `?meeting=<id>`. This causes:

1. Hard refresh drops the user back to constellation — loses meeting context
2. Multi-user sessions show different meeting chat because each user's `_initChat`
   has no URL anchor to determine the correct meeting
3. Page sharing / bookmarking impossible

**Fix:** When `setLevel('meeting', ctx)` is called in `accord-core.js`, use
`history.replaceState` to update the URL to `accord.html?meeting=<meeting_id>`.
On page load, if `?meeting=` is present in the URL, honour it over persisted level.

**What does NOT ship:**
- Browser back/forward navigation between meetings (future)
- Deep-link routing for workstream or constellation levels

---

## §2 — IR64 verification (before writing any code)

**V1 — Confirm `setLevel` location and current URL behavior:**
```javascript
console.log('setLevel source:', window.Accord.setLevel.toString().slice(0, 200));
console.log('current URL:', location.href);
console.log('persisted level:', localStorage.getItem('accord-level'));
console.log('persisted context:', localStorage.getItem('accord-level-context'));
```

**V2 — Confirm `_transitionToMeetingView` location:**
```javascript
// Check accord-transitions.js for the meeting transition function
// Find where loadMeeting is called and accord:meeting-loaded is dispatched
console.log('accord-transitions loaded:', typeof window._transitionToMeetingView);
```

**V3 — Confirm `accord:level-changed` dispatch chain:**
```javascript
// When a meeting is clicked in the rail, what fires?
// The chain should be: rail click → setLevel → level-changed event →
// accord-transitions._onLevelChanged → renderMeetingView → loadMeeting
// → accord:meeting-loaded
// Confirm by checking the event listener
```

Report V1–V3 in close-out.

---

## §3 — URL update on meeting navigation

### §3.1 — In `accord-core.js`, amend `setLevel`:

**Find:**
```javascript
function setLevel(nextLevel, ctx) {
  if (nextLevel !== 'constellation' && nextLevel !== 'workstream' && nextLevel !== 'meeting') return;
  state.level        = nextLevel;
  state.levelContext = ctx || {};
  _persistWrite('accord-level', state.level);
  _persistWrite('accord-level-context', JSON.stringify(state.levelContext));
  window.dispatchEvent(new CustomEvent('accord:level-changed', {
    detail: { level: state.level, context: state.levelContext },
  }));
}
```

**Replace with:**
```javascript
function setLevel(nextLevel, ctx) {
  if (nextLevel !== 'constellation' && nextLevel !== 'workstream' && nextLevel !== 'meeting') return;
  state.level        = nextLevel;
  state.levelContext = ctx || {};
  _persistWrite('accord-level', state.level);
  _persistWrite('accord-level-context', JSON.stringify(state.levelContext));

  // X-16: update URL to reflect current meeting
  // This enables hard refresh, bookmarking, and multi-user session sync
  if (nextLevel === 'meeting' && ctx && ctx.meetingId) {
    var newUrl = location.pathname + '?meeting=' + ctx.meetingId;
    history.replaceState({ level: nextLevel, meetingId: ctx.meetingId }, '', newUrl);
  } else if (nextLevel === 'constellation' || nextLevel === 'workstream') {
    // Clear meeting param when ascending
    history.replaceState({ level: nextLevel }, '', location.pathname);
  }

  window.dispatchEvent(new CustomEvent('accord:level-changed', {
    detail: { level: state.level, context: state.levelContext },
  }));
}
```

### §3.2 — On page load, honour URL meeting param

In `accord-core.js` `_init` function, add URL param check **before** reading
persisted level:

**Find the init function — look for where persisted level is read:**
```javascript
// Pattern to find (approximate — exact code may differ):
const persistedLevel = _persistRead('accord-level');
const persistedCtx   = JSON.parse(_persistRead('accord-level-context') || '{}');
```

**Add before it:**
```javascript
// X-16: if URL contains ?meeting=<id>, honour it over persisted level
var _urlMtgId = new URLSearchParams(location.search).get('meeting');
if (_urlMtgId) {
  // Override persisted level — navigate directly to the URL meeting
  state.level        = 'meeting';
  state.levelContext = { meetingId: _urlMtgId };
  _persistWrite('accord-level', 'meeting');
  _persistWrite('accord-level-context', JSON.stringify({ meetingId: _urlMtgId }));
}
```

---

## §4 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Navigate into a meeting | URL updates to `accord.html?meeting=<uuid>` immediately. No page reload. |
| 2 | Hard refresh on meeting URL | Page reloads directly into the meeting — not constellation. |
| 3 | Navigate back to constellation | URL returns to `accord.html` (no meeting param). |
| 4 | Two users navigate to same meeting | Both URLs show same `?meeting=<uuid>`. Chat initializes against same meeting_id. |
| 5 | Share meeting URL with another user | Recipient navigates directly to the meeting on load. |
| 6 | Existing deep-link URL (`?meeting=<id>`) | On load, meeting opens correctly — same as current direct-link behavior. |

---

## §5 — Files manifest

| File | Change |
|---|---|
| `accord-core.js` | Amend `setLevel` to call `history.replaceState` on meeting navigation; amend `_init` to honour `?meeting=` URL param |
| `version.js` | Operator-managed (IR65) |

---

## §6 — Discipline checklist

- `history.replaceState` not `pushState` — avoids polluting browser history with every level change
- URL param check in `_init` runs before persisted level read — URL always wins
- `ctx.meetingId` null-guarded — no URL update if meetingId absent
- Ascending to constellation/workstream clears the `?meeting=` param — clean URL at every level
- No changes to `accord-rails.js`, `accord-transitions.js`, or `accord-capture.js`

---

**Halt-and-surface after §4. Close-out must confirm smoke test 2 (hard refresh lands on meeting) and smoke test 4 (two users same meeting ID in URL).**

**After seal: A-08 multi-user acceptance test can proceed with both users on same `?meeting=` URL.**

---

*End Commission · X-16 · CMD-ACCORD-RAILS-URL-MEETING-PRIORITY-1.*
