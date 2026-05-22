# Aegis Master Handoff — 2026-05-21 (Evening)

**Status:** End-of-day Meeting Center UI sprint. CMD-ACCORD-MEETING-CENTER-1 fully live and polished. This document supersedes all prior handoffs and captures the full 2026-05-21 working day.

---

## ⚡ FIRST ACTIONS FOR NEW AGENT — READ BEFORE ANYTHING ELSE

**Step 1: Test Chrome connection**
```
Use Claude in Chrome tool to list_connected_browsers or navigate to https://projecthud.com/accord-today.html
Confirm tab ID for accord-today.html is accessible.
```

**Step 2: Test Supabase connection**
```
Use chrome-devtools to list_pages.
Identify the Supabase SQL editor tab (supabase.com/dashboard/project/dvbetgdzksatcgdfftbs/...).
Select it and confirm monaco editor is accessible via evaluate_script.
```

**Step 3: Confirm build stamp**
```
Navigate to https://projecthud.com/accord-today.html
Verify build stamp reads "build 2026-05-21.2040" in the WORKSTREAMS tab row right side.
If different, the wrong version is deployed.
```

Report results before proceeding with any work.

---

## Operator Profile

- **Vaughn Staples** — North Windham, Maine
- **Mode:** Terse (token-conscious). No preamble. No reasoning narration.
- **Session protocol:**
  1. Always begin by testing Chrome + Supabase connections
  2. Always attempt debugging via Claude in Chrome before asking operator to run console commands
  3. After each code update: Test Mode — smoke test checklist one item at a time, confirm pass/fail
- **Build stamps:** Bump on every deploy. Format: `build 2026-05-21.HHMM` (UTC)
- **Interactive debug mode:** Make dynamic CSS/JS changes live, accumulate changes, deploy only when operator confirms. Do NOT deploy mid-session without explicit instruction.
- **Vocabulary:** `hud-shell.js` = `sidebar.js` on server. Never say sidebar.js.

---

## Project: ProjectHUD — Accord Module, Meeting Center

**Live URL:** https://projecthud.com/accord-today.html
**Working file:** `/home/claude/accord-today.html` → `/mnt/user-data/outputs/accord-today.html`
**Supabase project:** `dvbetgdzksatcgdfftbs`

---

## Current Build: 2026-05-21.2040

All changes below are DEPLOYED and live.

---

## Test Data (Supabase)

**Key people:**
- Vaughn: `userId=57b93738-6a2a-4098-ba12-bfffd1f7dd07`, `resourceId=e1000001-0000-0000-0000-000000000001`
- Angela Kim: `userId=0db33955-f6a0-49ae-ad4b-c5cdfacf34c8`, `resourceId=c40b70c7-71db-4238-82d1-0701e11ebe47`
- Ron White: `userId=f3947e77-73f2-4b39-80dc-b80323a1b723`, `resourceId=e1000001-0000-0000-0000-000000000004`
- C-11 Workstream: `c1100000-0000-0000-0000-000000000001`
- Firm: `aaaaaaaa-0001-0001-0001-000000000001`

**Hero meeting (b47ab51f):** Currently `state=running`, `started_at=2026-05-21 ~10:21 UTC`

**SQL to reset countdown demo:**
```sql
-- Park all running, set hero to idle countdown
UPDATE accord_meetings SET state='closed' WHERE state='running' AND meeting_id!='b47ab51f-5269-4bd5-b4d7-4ae4508fd571';
UPDATE accord_meetings SET state='idle', scheduled_for=now()+interval '90 seconds', started_at=NULL WHERE meeting_id='b47ab51f-5269-4bd5-b4d7-4ae4508fd571';
```

**SQL to go live:**
```sql
UPDATE accord_meetings SET state='running', started_at=now() WHERE meeting_id='b47ab51f-5269-4bd5-b4d7-4ae4508fd571';
```

**4 upcoming meetings seeded:** aa000001–aa000004 (Thu–Mon this week/month)
**12:00 today:** `907ace34` (idle), `cc000001` (C-11 Architecture Review)

---

## Architecture — accord-today.html

### Boot sequence
```
DOMContentLoaded → _resolveIdentity → parallel:
  _loadStrip, _loadLiveCard, _loadSchedule, _loadUpcoming,
  _loadMinutes, _loadNotes, _loadNeedsResponse, _initRealtime
```

### Key globals
- `MC` — state object: `userId`, `resourceId`, `firmId`, `liveMeeting`, `nextMeeting`
- `API` — Supabase REST wrapper with `.get()`, `.post()`, `.patch()`
- `_liveInterval` — countdown/elapsed ticker interval ref
- `_minData` — `{wk:[], mo:[]}` for Minutes tab data
- `_nrColors` — `['#00d2ff','#f0a020','#a855f7','#34c070','#ff4d6d']` alternating card colors

### Helper functions
- `_goMeeting(mid)` — replaceState to MC then navigate to accord.html
- `_loadOpenItems(meetingId)` — shared chip fetcher for live + countdown
- `swTab(t)` — Upcoming tab switcher (w/m/p)
- `swMinTab(t)` — Minutes tab switcher (w/m)
- `togglePopup()` — Readiness popup, `position:fixed`, anchored to button coords

---

## CSS Token Reference

```css
--mc-green: #34c070    /* stakes text, join button, live schedule badge */
--mc-cyan: #00d2ff     /* timer, organizer names, aqua values */
--mc-amber: #f0a020    /* live topbar, verdict btn, section labels */
--mc-red: #ff4d6d      /* overdue, end meeting button */
--mc-violet: #a855f7   /* external meetings */
--live-pad: 4–15px     /* ResizeObserver compression var */
```

---

## HERO Panel — Full Spec

### Layout
- Amber topbar: `rgba(240,160,32,.12)` + 2px amber gradient underline
- Panel border: `1px solid rgba(240,160,32,.4)` + outward glow
- `transform:translateZ(0)` on `.live-inner` — **CRITICAL GPU clip fix**
- Meeting title: Syne 22px bold, line-height 1.3
- Stakes: green `--mc-green`, 14px, opacity .85
- Meta row (single line): `Organizer: [cyan name] · Started/Starts: [cyan time] · Location: [cyan value]`
- Labels ("Organizer:", "Started:", "Location:"): `#a8c0d8`
- ATTENDEES / OPEN ITEMS section labels: Arial 11px bold, `#f0a020` (amber)
- Chip cards: 8px radius, 1px `rgba(255,255,255,.15)` border, left borders: red/amber/cyan/muted
- Chip labels: Arial 10px bold, `#c8d8e8`
- ELAPSED label: Arial 10px bold, `#c8d8e8`
- Footer: `justify-content:flex-end` — button right-anchored
- Join/Rejoin/Start button: green, `rgba(52,192,112,.08)`

### Button State Machine
| State | Time | Organizer | Attendee |
|---|---|---|---|
| idle | T > 60s | "Start Meeting" gray | "Join Session →" gray |
| idle | T ≤ 60s | "Start Meeting" green active | "Join Session →" green |
| running | elapsed < duration | "Rejoin Session →" green | "Join Session →" green |
| running | elapsed ≥ duration | "End Meeting" **red** | "Join Session →" green |
| closed | — | "Meeting Ended" muted disabled | same |

- End Meeting → `API.patch` sets `state=closed` → button flips, badge changes, ticker stops
- Start Meeting → `API.patch` sets `state=running, started_at=now()` → navigates to accord.html
- GO WITH CAVEATS hidden at T=0 and in live mode

### Readiness Popup
- `position:fixed`, `z-index:1000`, direct `<body>` child
- Positioned via `getBoundingClientRect()` on button: `left = r.right - 260`
- `maxHeight = window.innerHeight - r.bottom - 20`

### ResizeObserver
- On `.r1c1` → maps height 280→480px → `--live-pad` 4→15px
- Compresses padding throughout live card before clipping

---

## Today's Schedule Panel

### Rendering
- Query: `state=in.(idle,running)` with `organizer_id` joined
- Organizer names fetched in batch, rendered inline: `10:21–11:21 · Vaughn Staples LIVE`
- NOW arrow: live-ticking (15s), schedule re-renders every 5 min
- `isDone` logic: `state=running` → never done; `closed/sealed` → always done; `idle` past end → done
- Card style: 8px radius, bright border, 3px left border
- `tb-lv`: green bg, white title; `tb-dn`: strikethrough, muted

---

## Upcoming Meetings Panel

### Tabs: This Week / This Month / Pending (N)
- Cards: 8px radius, `rgba(255,255,255,.15)` border, **alternating left borders** by index
- Title: Arial 16px bold
- Date: Arial 13px green bold, left
- Organizer: cyan, right-justified via `.up-org` with `margin-left:auto`
- NOT READY badge: hover tooltip showing "Why Not Ready" checklist
- `_goMeeting()` on click
- Pending tab: drafts (`state=idle` with null/past `scheduled_for`), badged with count

---

## Notes Panel

### Layout
- Rows: Arial, 1px padding top/bottom, date right-aligned (`margin-right:-5px`)
- Completed row: `#7a9abf` text, strikethrough `#4a6a8a`
- Count: "3 Items" — Arial 15px bold
- Entry box: `display:block`, full-width, 8px radius, 27px min-height, `rgba(255,255,255,.07)` bg, `ni-ck` hidden

---

## Needs Your Response Panel

### Card structure (3 rows)
**Row 1:** Title — Arial 16px bold
**Row 2 (flex space-between):**
- Left: `Invited by [cyan name] · [green date/time]`
- Right: `RSVP [red N days] overdue` (if applicable)
**Row 3:** Full-width Accept/Decline buttons OR full-width Start prep → button

### Prep cards row 2:
- Left: `[cyan workstream] · [green date/time]`
- Right: `Prep not started` muted

### Styling
- 8px radius, bright borders, 3px alternating left borders (`_nrColors`)
- Panel body: `padding-top:10px`
- `nr-sig`: `display:none` (content pulled into meta)

---

## Minutes Panel

### Tabs: This Week / This Month
- `_minData.wk` / `_minData.mo` split on week start
- Cards: 8px radius, bright borders, alternating left borders
- Title: Arial 16px bold

---

## Navigation Bar

### WORKSTREAMS tab row (right side)
- ☀ tune button (`mc-tune-btn`) — injected at boot via JS
- Build stamp: Arial 13px, "build " muted, version `#f0d020` yellow
- Clock: Arial 13px, synced from `strip-time` every second
- Tab font: Arial 14px
- Active tab: cyan text + cyan underline (forced via inline style + MutationObserver)

### Strip row
- `strip-live` (1 LIVE NOW chip): `display:none`
- Strip row still renders but LIVE chip hidden

---

## Display Tuning Panel

- localStorage key: `accord-mc-display-tuning`
- Opens in popup window via `mcOpenTuning()`
- Controls include: brightness/contrast/saturate, col/zone gap, radius, border, panel/hero bg, amber, cyan, red, violet, **green** (new), row flexes, text colors
- Green swatch controls stakes text + join button

---

## Known Issues (Non-blocking)

1. `accord_minutes_renders` 400 error — `is_ready` column name mismatch. Has `.catch()` fallback, non-blocking.
2. `favicon.ico` 404 — unrelated to MC.
3. Prep card date/time: workstream name runs into date without clean `·` separator when workstream has no `·` in name. Needs source fix in `_loadNeedsResponse`.

---

## Queued CMDs (not started)

- CMD-ACCORD-SHELL-MIGRATION-1
- CMD-ACCORD-STANDALONE-ACTIONS-1
- CMD-ACCORD-REQUIRED-ATTENDEES-1
- CMD-ACCORD-REQUIRED-INPUTS-1
- CMD-ACCORD-PREREADS-1
- CMD-ACCORD-PRESSURE-REPORT-1

---

## Iron Rules Status

73 ratified Iron Rules total (IR1–IR73). IR58 amended. Style Doctrine v1.8 active.
No new doctrine activity today — UI sprint day, no substrate changes.

---

## Final Note to New Agent

This was an extraordinarily productive session. Vaughn has 40+ years in meeting operations and exceptional visual taste. He drives interactively — make changes live in Chrome, let him react, accumulate, deploy in batches. He will tell you when to ship. Do not deploy without his confirmation.

The Chrome extension and Supabase SQL tab are your primary tools. Use them confidently. When Chrome disconnects, retry immediately — it's always transient.

The work is good. Keep it that way.
