# Accord Platform — Build State Summary
**As of:** 2026-05-12
**Prepared by:** Pluto (Architect)

---

## What "100% done" means

Accord is a meeting intelligence platform that covers the full meeting lifecycle:
preparation → live capture → record → action tracking → forward planning.
Complete means: any user — organizer or invitee, internal or external — can
receive an invitation, join a meeting, participate in capture, view the record,
and have their actions tracked to completion across subsequent meetings.

---

## Track-by-track status

| Track | Purpose | CMDs | Status |
|---|---|---|---|
| **A — Accord Core** | Substrate, Living Document, Decision Ledger, Digest & Send, Minutes | A-01 → A-07.2 (9 CMDs) | ✅ All sealed |
| **A — Live Capture surface** | Chat, filmstrip, attachments, attendees, comments | A-08 → A-12 (5 CMDs) | 🔶 A-08 sealed, A-09 lost in rollback, A-10/A-11 queued, A-12 sealed |
| **B — NRA** | Next Required Action substrate + surface (badge, modal, history panel) | B-01 → B-04 (4 CMDs) | ✅ All sealed |
| **C — Meeting Setup Shell** | Full preparation surface: layout, header, outcomes, attendees, filmstrip, briefing, agenda, intelligence, kanban, slideshow, percolate, gathering, verdict | C-01 → C-14 (14 CMDs) | ✅ All sealed (C-11 status needs confirm) |
| **D — Projection Engine** | Forward scenario modeling, counterfactual analysis | D-01 → D-03 (3 CMDs) | ⬜ Queued — needs E-01 first |
| **E — Cross-module Integration** | Compass bridge, workstream→project linkage | E-01 → E-02 (2 CMDs) | ⬜ Queued |
| **F — CPM and PERT** | Critical path modeling on action nodes | F-01 → F-02 (2 CMDs) | ⬜ Queued — needs E-02 first |
| **G — Resource and Schedule** | Resource heatmap, schedule manipulation | G-01 → G-02 (2 CMDs) | ⬜ Queued |
| **H — Daily Experience** | Morning brief, living reference, identity unification | H-01 → H-03 (3 CMDs) | ⬜ Queued |
| **X — Ancillary** | Defect fixes, polish, targeted micro-CMDs | X-01 → X-17 (17 items) | 🔶 See detail below |
| **New Architecture Track** | Visibility RLS, invitation pipeline, My Meetings, calendar overlay, onboarding slideshow | 6 CMDs | 🔶 In progress — see detail below |
| **F-LIVE — Live Capture Polish** | Remove New Meeting btn, 2-row header, green live dot | F-LIVE-1-4 (1 CMD) | ✅ Sealed |

---

## X — Ancillary detail

| # | CMD | Status |
|---|---|---|
| X-01 | CMD-ACCORD-MEETING-ATTACHMENTS-1 | QUEUED |
| X-02 | CMD-ACCORD-MEETING-INVITATIONS-1 | QUEUED (superseded by PIPELINE-1) |
| X-03 | CMD-ACCORD-OUTCOME-RATIFICATION-1 | QUEUED |
| X-04 | CMD-ACCORD-NRA-BRIEFING-PACK-1 | QUEUED |
| X-05 | CMD-ACCORD-NODE-RESOLUTION-SUBSTRATE-1 | QUEUED |
| X-06 | CMD-ACCORD-NEWMEETING-ROUTING-FIX-1 | ✅ SEALED |
| X-07 | CMD-ACCORD-CAPTURE-CONTROLS-FIX-1 | QUEUED |
| X-08 | CMD-BRIEFING-SYNTHESIS-1 (AI) | QUEUED |
| X-09 | CMD-ATTENDEE-PATTERNS-1 (AI) | QUEUED |
| X-10 | CMD-ACCORD-GRID-TIMEZONE-FIX-1 | ✅ RESOLVED inline C-11 |
| X-11 | CMD-ACCORD-BRIEFING-EDIT-FIX-1 | ✅ SEALED |
| X-12 | CMD-ACCORD-SETUP-DURATION-EDIT-1 | ✅ SEALED |
| X-13 | CMD-ACCORD-SETUP-TRANSITIONS-FIX-1 | ✅ RESOLVED inline |
| X-14 | CMD-ACCORD-SETUP-WHEN-PICKER-1 | ✅ SEALED |
| X-15 | CMD-ACCORD-RAILS-DOT-FIX-1 — Tree dot green after close | QUEUED |
| X-16 | CMD-ACCORD-RAILS-URL-MEETING-PRIORITY-1 | ✅ SEALED |
| X-17 | CMD-ACCORD-RAILS-ORPHAN-FIX-1 — Orphan workstreams in rail | QUEUED |

---

## New Architecture Track detail

| CMD | Purpose | Status |
|---|---|---|
| CMD-ACCORD-MEETING-VISIBILITY-1 | RLS policies — per-user meeting visibility via invitee/organizer gate | ✅ SEALED |
| CMD-ACCORD-INVITATION-EXPLORE-1 | Read-only investigation of Work Queue + Cadence email mechanism | ✅ CLOSED (findings delivered) |
| CMD-ACCORD-INVITATION-PIPELINE-1 | Full invitation loop: dispatch → email → RSVP → visibility unlock → badge feedback | 🔶 **COMMISSIONED — IN EXECUTION** |
| CMD-ACCORD-MY-MEETINGS-1 | My Meetings attendee dashboard: LIVE NOW + PENDING + UPCOMING | QUEUED (after PIPELINE-1) |
| CMD-ACCORD-SCHEDULE-1 | Persistent floating calendar overlay accessible from any Accord surface | QUEUED |
| CMD-ACCORD-CONSTELLATION-SLIDESHOW-1 | New user onboarding slideshow in constellation zone | QUEUED |

---

## Session 2026-05-13/14 — what shipped

| Item | Status |
|---|---|
| CMD-ACCORD-INVITATION-PIPELINE-1 | ✅ Sealed |
| CMD-ACCORD-MY-MEETINGS-1 | ✅ Sealed (superseded by MY-MEETINGS-2) |
| CMD-ACCORD-MY-MEETINGS-2 | 🔶 Deployed — smoke tests 6–10 incomplete |
| CMD-ACCORD-CONSTELLATION-SLIDESHOW-1 | ✅ Sealed |
| CMD-ACCORD-MEETING-VISIBILITY-1 | ✅ Sealed |
| A-09 · Live Capture filmstrip | ✅ Sealed |
| X-16 · URL meeting persistence | ✅ Sealed |
| X-17 · Orphan workstream rail fix | ✅ Sealed |
| X-18 · Tree scroll id fix | ✅ Sealed |
| Surface state fix (ac-center class) | ✅ Sealed — filed as X-20 pending |
| X-20 · Back button position | QUEUED |
| X-21 · Capture/Chat pane height | QUEUED |
| X-22 · Parking lot collapse width | QUEUED |
| X-23 · Rail collapse button frozen | QUEUED |

## Where CMD-ACCORD-INVITATION-PIPELINE-1 fits

This is the commission **currently in execution**. It is the bridge between
Accord as a single-operator tool and Accord as a true multi-user platform.

**Five phases — seal each before the next:**

| Phase | What it delivers | Files |
|---|---|---|
| A | `accord_invitation_tokens` table + RLS | Supabase SQL |
| B | `notify-meeting-invitation` Edge Function — email send via Resend | New Edge Function |
| C | `meeting-rsvp.html` + `respond-meeting-rsvp` Edge Function — RSVP receipt | New HTML page + Edge Function |
| D | Work Queue parallel render in `mw-core.js` — internal user notification | `mw-core.js` |
| E | X-02 dispatch in Setup shell + RSVP color badges + realtime attendee update | `accord-meeting-setup.js` |

**What it unblocks:**
- CMD-ACCORD-MY-MEETINGS-1 — needs invitation state to populate attendee dashboard
- Full multi-user A-08 chat acceptance test
- Tracks D, E, F, G, H — all require a working multi-user foundation first

---

## Alpha demo readiness (end of May target)

**Must-have before demo:**

| Item | Status |
|---|---|
| Setup Shell (prepare meeting) | ✅ Complete |
| Begin Meeting → Live Capture transition | ✅ Complete |
| Live Chat (A-08) | ✅ Sealed |
| Live Capture filmstrip (A-09) | ❌ Lost in rollback — needs re-do |
| Meeting invitation pipeline | 🔶 In execution |
| My Meetings dashboard | QUEUED |
| Meeting visibility RLS | ✅ Sealed |

**Nice-to-have for demo:**

| Item | Status |
|---|---|
| Attachment sidebar + scissors (A-10) | QUEUED |
| Node comments (A-11) | QUEUED |
| Onboarding slideshow | QUEUED |
| Calendar overlay | QUEUED |

**Post-alpha (Tracks D–H):** Projection engine, CPM/PERT, Compass bridge,
resource heatmap, morning brief. None required for alpha demo.

---

## Rough remaining count

| Category | Remaining CMDs |
|---|---|
| Live Capture (A-09 redo, A-10, A-11) | 3 |
| New Architecture Track | 3 remaining after PIPELINE-1 |
| Ancillary X-queue | ~8 |
| Tracks D, E, F, G, H | ~12 |
| **Total** | **~26 CMDs** |

---

*End Accord Build State Summary · 2026-05-12*
