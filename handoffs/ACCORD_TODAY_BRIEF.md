# ACCORD_TODAY_BRIEF.md
> Strategic design brief for the Accord · Today landing page redesign
> Assembled: 2026-05-19
> Sources: PROJECTHUD_STATE.md (2026-05-19), prior conversation archaeology (Accord meetings management module review, CMD-ACCORD-MEETING-SETUP sessions, Architect sessions through 2026-05-16), Compass Meetings landing page (compass-meetings.html, built today)

---

## Prefatory note on prior session context

One prior session (fcb99ea7) contains the most directly relevant design dialogue. In it, the primary architect asked Vaughn:

> "Who is the primary user of this landing page? … And what is the ONE thing a first-time user should feel when they see this page?"

Vaughn responded: "Let me answer in stages … please don't comment until I am through. Thank you, you are asking the right questions."

**The stages themselves are not captured in the retrieved conversation fragment.** This is the most significant gap in this brief — Vaughn's own answer to the primary persona question was given but not recoverable from the session history available to this search. What IS captured is that:

1. Every prior version of the landing page received negative feedback
2. The failure mode was consistent: too dense, too small, no visual priority, rewards expertise instead of guiding the uninitiated
3. The one design principle that emerged and held was: **answer one question in under 3 seconds — "what should I do right now?" Everything else is secondary**
4. The stated design target moment, explicitly cited: **"between meetings (3-minute scan) — the moment Chris and I have been designing for"**

Everything below is grounded in that foundation plus the full PROJECTHUD_STATE.md context.

---

## Q1. Primary User Persona for Accord · Today

### Recommendation: The Operator/Organizer — with adaptive depth for participants

**Primary target:** The operator/host who organizes and runs meetings. This is Vaughn's archetype. This person:
- Is accountable for outcomes, not just attendance
- Organizes workstreams, not just one-off meetings
- Has to know what needs their hand today across multiple active workstreams
- Is the person who built the Accord substrate — so their surface should feel like a return on that investment

**Why this persona v1, not adaptive:**
The prior conversation established that previous attempts at "dashboard for all users" failed. Optimizing for one persona first and then expanding is the right sequencing. The organizer is the person who got Accord populated with decisions, actions, and workstream history — they're the natural first beneficiary of the intelligence those produce.

Also: Vaughn Staples IS this persona. He's the only confirmed live user. You build v1 for the person testing it.

**What changes for participants (v2 path):**
When the page is viewed by a participant (not organizer), the following shift:
- LIVE NOW and NEXT MEETING cards stay identical (same urgency)
- WORKSTREAM HEALTH becomes "MY INVOLVEMENT" — shows only workstreams where the user has open actions, is an attendee, or owns a decision
- OPEN ACTIONS scopes to their own items only, not the team's
- PRESSURE REPORT becomes "WHAT I OWE" — aging dissents I haven't addressed, actions I'm blocking, belief declarations overdue
- The tone shifts from "command center" (organizer) to "what do I need to bring to the room" (participant)

**What changes for team leads (Aiyana) v2:**
- Gets personal view PLUS a team digest: who on my team is blocked, which of my team's CP actions are overdue
- Same page, one additional expandable panel below the personal zone

**What changes for managing director:**
- Workstream health becomes a firm-level portfolio view
- Pressure report surfaces decisions with degrading CP slack, dissent at escalation threshold
- Personal action zone either collapses or disappears (MDs don't own leaf actions)

**v1 decision: single persona, operator/organizer, no adaptive logic.** The substrate for adaptive views requires user role resolution that isn't fully built. Don't complicate v1.

---

## Q2. Use Moments

### Ranked by frequency (organizer persona):

**1. Between meetings — the 3-minute scan (PRIMARY)**
Explicitly named by Vaughn and the other architect as "the moment we're designing for." User has just ended a call or has 5 minutes before the next one. Wants to know: is anything on fire? What's my next meeting? Do I need to do anything right now? Screen time: 30 seconds to 3 minutes. No deep reading. Scanning.

**2. First thing in the morning — planning the day**
Slightly less frequent than #1 because this is more deliberate. The user wants a narrative arc. "What does today look like? Which workstreams are live? What am I responsible for?" Screen time: 3-7 minutes. Still scanning, but slower. Will actually read a sentence.

**3. After a meeting ends — clearing the outflow**
Specific and action-oriented. "The meeting just sealed. My minutes are rendering. I have 4 new action items assigned. Who do I chase?" This moment is currently served by the Minutes surface and the Setup shell's "post-meeting" state — but the Today page can surface the residue: sealed meetings awaiting minutes distribution, new actions that landed, lingering open questions.

**4. When a notification pings them**
Lowest friction entry. "Something fired — let me check." This is a landing spot, not a destination. The page should surface what triggered the ping prominently.

**5. End of day — closing the loop**
Least frequent as a distinct behavior. In practice this moment blurs into #3 (post-meeting) or #1 (last between-meeting scan). Most organizers don't have a formal "end of day" ritual in tools. Design for it only if the page has a natural "all clear" state.

**6. First time ever (new user onboarding)**
Special case. Currently: constellation slideshow + empty state. This is handled separately and shouldn't be mixed with the returning-user design.

### Primary design target: #1, the between-meetings 3-minute scan

**Should the page adapt to the moment?** TBD — but lean toward NO for v1.

**The argument for adapting:** A morning view could be warmer and more narrative ("here's your day"); a between-meetings scan could be stark and red-green ("here's what's on fire"); an end-of-day view could be more settled ("here's what you cleared"). This would be genuinely excellent.

**The argument against adapting v1:** Time detection adds complexity and can be wrong. You're late to your 10am but it's technically still morning. Adapt by content rather than by detected time — let the substrate signal what moment it is. If there's a LIVE NOW meeting: the page is in between-meetings mode. If there are no meetings today: the page is a planning surface by nature. The substrate already knows what moment it is.

**Lean toward:** Content-driven adaptation, not time-of-day adaptation. The LIVE NOW card dominates when there's a live meeting. The NEXT MEETING card dominates when the next meeting is close. Nothing about the layout changes — the relative weight of cards changes based on what's live.

---

## Q3. Accord · Today vs. Compass · Meetings — Division of Labor

This is the most strategically important question in the brief. The risk is confusion between two surfaces that both claim "daily meeting experience."

### What Compass · Meetings owns

The Compass Meetings page (built today, compass-meetings.html) is about **execution-layer state**:
- What action items are due today, CPM-annotated
- What is on the critical path and at risk of slipping
- The Pressure Report (week/month tabs) surfaces structural concerns: dissents approaching escalation thresholds, blocked resources, belief drift
- The JOIN NOW hero is Compass-flavored: it surfaces the meeting but annotates it with CPM context (Tom's dissent on DS-005, AX-6 blocked, etc.)

**Compass Meetings is the answer to: "What do I need to do today to keep my work moving?"** It reads the meeting calendar through a project-execution lens.

### What Accord · Today owns

Accord Today is about **meeting substrate state**:
- What is the state of my workstreams? Which are healthy, which are stalling?
- What decisions are aging? Which have unresolved dissents or belief gaps?
- What prep do I need for upcoming meetings?
- What came out of recent meetings that still needs handling (minutes to distribute, open questions, outstanding RSVPs)?
- Where in the deliberation lifecycle are my active workstreams?

**Accord Today is the answer to: "What is the state of my meeting world, and what requires my attention to keep decisions alive?"** It reads the workstream/meeting substrate through a deliberation lens.

### The line

| | **Accord · Today** | **Compass · Meetings** |
|---|---|---|
| Primary lens | Deliberation + decision substrate | Execution + action substrate |
| "Live now" card | Meeting state, attendee conn-dots, agenda health | Same meeting, CPM urgency signals |
| Action items | Open actions from meetings (per-workstream) | CPM-ranked actions with critical path context |
| Pressure | Dissent aging, belief drift, unresolved NRAs | CP exposure, blocked resources, schedule float |
| Prep | Per-workstream meeting readiness | Per-action due-date urgency |
| Temporal frame | Workstream health (days/weeks) | Task urgency (today/this week) |

### Is one of them redundant?

No — they are different projections of the same substrate, designed for different questions. A user who runs a workstream needs both questions answered:
- "Is my deliberation world healthy?" (Accord Today)
- "Am I going to hit my deadlines?" (Compass Meetings)

Separating them is correct. Conflating them produces the dense, small-text, everything-at-once failure that killed every previous Accord Today attempt.

### Which one is the "front door" of ProjectHUD on a given morning?

**Accord · Today is the front door of Accord. Compass · Meetings is the front door of Compass.**

Neither is the front door of ProjectHUD. ProjectHUD's front door is the nav rail — the user navigates to the module they're starting their day in.

**However:** For a user who primarily lives in Accord (organizers who structure their work through meetings and workstreams), Accord Today is effectively their morning portal. For a user who primarily lives in Compass (ICs executing tasks), Compass Meetings is theirs.

**The front door question has a more important sub-question:** When a user logs into `accord.html` cold, what should they see? Today they see the constellation rail + the My Meetings surface. The Today landing page would replace or supplement that first-view experience. That redesign decision isn't fully settled — it should be.

**Lean toward:** Accord · Today is the center panel of `accord.html` when no specific meeting is selected. It's not a new route — it's the resting state of the Accord surface.

---

## Q4. The Page's Primary Job — Ranked 1–5

### 1. Surface what will blow up if I don't act today

This is the primary job. It's the only job that justifies a user opening this page instead of just navigating straight to a specific workstream or meeting. The between-meetings scan exists specifically because something might need your hand right now, and you need to find out fast.

Prior conversation confirmed this: the page is an "accountability engine." Not a meeting calendar with briefing cards.

**What this means for visual hierarchy:** The first thing the user sees — above the fold, impossible to miss — must be the highest-severity item demanding their attention. If Tom's dissent on DS-005 is 19 days old and he's walking into your 11am meeting, that is the hero. Not a timeline. Not a workstream list.

### 2. Show me the next meeting and how prepared I am

Directly adjacent to #1. The user wants to know: what's coming up, and am I ready? The Setup shell already answers "how prepared am I" for a specific meeting. The Today page should surface the NEXT meeting with a prep-readiness signal — not a full briefing, just a verdict: READY / GO WITH CAVEATS / NOT READY (borrowing the footer verdict pill from the Setup shell).

### 3. Surface what will blow up this week/this month

This is the "Pressure Report" function — slightly slower timescale than #1, but still genuinely urgent. Decisions approaching escalation thresholds, critical path exposure, belief drift. This belongs on the page but below the fold or in a secondary panel.

### 4. Help me prep for upcoming meetings (queue)

Less urgent, more planning-oriented. A queue of upcoming meetings with their prep status gives the organizer a "what's on my plate" overview. Valuable, but not the reason someone opens this page mid-day. It belongs on the page but at lower visual weight.

### 5. Give me the day's narrative arc (calm overview)

The least urgent job and the least defensible use of hero space. The user doesn't come to this page for a digest — they come because something needs attention. If there's nothing urgent, a calm state can surface the narrative arc. But it should not be the default visual hierarchy.

**What this ranking means for design:** Kill "calendar with briefing cards" as a frame. The visual hierarchy is: urgent signal → next meeting readiness → upcoming prep queue → calm overview. The first two should fill most of the screen.

---

## Q5. Calm State vs. Busy State

### What should a calm Tuesday feel like?

**Recommendation: Full layout, quiet visual register, explicit "all clear" signal.**

Not empty/clean (that's cold and unhelpful — if the user doesn't know what empty means, they'll think the page is broken). Not a replaced view (that adds complexity and a separate design). Full layout with calm colors and an explicit green indicator.

The Setup shell's verdict pill (GO / GO WITH CAVEATS / NOT READY) is the right model. Apply it to the Today page level: a single computed signal at the top of the page reads "TODAY: ALL CLEAR" in green when there's nothing urgent. The rest of the page shows upcoming meetings and workstream health in their quietest state.

**What "all clear" actually means computationally:**
- No dissents ≥ 14 days old
- No critical path actions overdue
- No NRAs in declared state for more than 7 days
- No upcoming meeting in the next 4 hours without a verdict of READY
- No open questions assigned to the user past their due date

If all five conditions pass: the page is calm. The hero card is green. The pressure section shows nothing or is hidden.

**How often is a user actually in a calm state?**

Honest answer: **rarely, for a meaningful Accord user.** The nature of the substrate — decisions accumulating, dissents aging, actions overdue, NRAs piling up — means the page will almost always have something to surface. A user who has been running Accord for 3+ months across multiple workstreams will have a quiet day maybe once a week if they're disciplined. A less disciplined user: almost never.

**This is actually a feature.** Accord is designed to surface the hidden friction that other meeting tools let slip under the rug. If the page is always amber, that's information. The design should not hide that.

**What it means for design:** Design the busy state first. Design the calm state as a reward. Don't let the calm state influence the busy state's layout — that would be designing for the wrong frequency.

---

## Q6. What Competes With This Page

### Where does the organizer/host currently get this information?

**Their calendar (Outlook / Google Calendar):**
Shows what meetings exist and when. Does not show prep status, attendee connection state, dissent history, decision health, NRA aging, or any of the substrate-derived intelligence Accord surfaces. **Replaces the calendar as the "what's happening today" surface** — but only if the page is clear enough that the user doesn't feel they need to open the calendar alongside it.

**Their own brain / notes:**
For the meeting-heavy organizer, this is the primary current source of "what will blow up if I don't act today." They know Tom's dissent is simmering. They know the proposal draft is late. They know the 11am is underprepared. Accord Today replaces this mental model with a computed version of the same awareness. **This is the most important competitor to beat.** If the page is faster and more accurate than the user's own memory, they'll adopt it. If it's slower or noisier, they won't.

**A PM tool (Asana, Linear, Monday):**
Some organizers use these for action tracking. Accord Today's action zone (open actions from workstream meetings) competes with these tools' task views. The Accord advantage: every action has provenance (derives from DC-xxx, ratified with this vote tally, on this critical path). The PM tool's action has none of that. **Supplementing these tools, not replacing them.** At least in v1.

**A meeting tool (Otter, Granola, Fireflies):**
Competitors on the minutes/transcript side. Don't surface decision health, dissent aging, workstream state, or any of the substrate. **Accord Today renders them structurally irrelevant** — the question they answer ("what happened in this meeting?") is much smaller than the question Accord Today answers ("what's the state of my deliberation world?"). This is not a day-to-day competitor for this page.

### Is Accord Today replacing, supplementing, or creating?

**Primarily replacing the user's mental model** — the organizer who currently holds all of this in their head. That is the most important displacement. The calendar is supplemented, not replaced (Accord doesn't own scheduling). The PM tool is supplemented v1, with replacement possible once CPM and the Compass bridge are live.

**Also creating a new behavior:** "Daily substrate check-in." No current tool asks "what's the state of my decision world today?" Accord Today invents that use case. This is both the opportunity and the risk — new behaviors require the page to be rewarding enough to build the habit. The between-meetings scan is the habit seed: open it between every call for 2 weeks and it becomes the first thing you do when you sit back down.

### The strategic implication for design

The primary competition is the user's own brain. Beat it by being faster (under 3 seconds to the most urgent thing), more accurate (substrate-computed, not memory-reconstructed), and more provenance-rich (every item traces back to a decision, with names and dates and vote tallies). If the page takes 7 seconds to scan and produces 3 false alarms, the user goes back to their brain. The design budget for v1 is therefore: one hero that is always right, one or two secondary cards that earn their keep, and nothing else.

---

## Synthesis: What This Brief Points To

These six answers converge on a specific design direction that should govern the redesign:

**One hero, always right.** The most urgent substrate signal, computed and surfaced above everything else. Not "today's meetings" — that's the calendar. The single item most likely to blow up if the user doesn't look at it. If there's nothing urgent: explicit green ALL CLEAR.

**Next meeting with a verdict.** Below the hero, one card: what's coming up next, with a single computed readiness verdict (GO / CAVEATS / NOT READY) and one action. Not a full briefing — that's what the Setup shell is for.

**Workstream health strip.** Three or four numbers per workstream: open decisions, aging dissents, overdue actions. Horizontal strip, not a list. Click goes into the workstream. This replaces the old "workstream health bar" idea from the prior conversation.

**Upcoming meetings queue.** Below the fold. Compact. Prep status per meeting. This is where the "help me prep" use case lives.

**Nothing else in v1.** The prior conversation diagnosed the problem precisely: too many zones, too small text, too equal weight. The design must have one dominant focal point, one secondary focal point, and supporting elements that don't compete for attention.

**Text must be readable without lean-in.** This was an explicit critique from Vaughn. Every important number is 24px+. Every label is 13px+. The page communicates in 3 seconds or it fails.

---

## Open Questions for the Designer

These are genuine TBDs that need answers before the mockup:

1. **What does Vaughn's actual staged answer say?** He was about to answer the persona question in stages. If that conversation can be recovered or he can be asked again, his answer governs over everything in Q1 above.

2. **Is the Today page a new route or the resting state of accord.html?** Right now when no meeting is selected, the user sees the constellation/MY MEETINGS view. Does Today replace that, or is it a new URL?

3. **Does the hero card react to the time of day?** Morning (no live meeting): hero is next meeting + prep. Afternoon (between meetings): hero is LIVE NOW if one exists, or most urgent item otherwise. This is the strongest argument for time-aware adaptation.

4. **What is the Accord palette for the Today surface?** The Setup shell uses `#161c26` columns on `#0a0e14` canvas with Accord amber accent. The Today page could use the same language or could be softer/lighter for the briefing register. Vaughn has a display tuning panel — test both.

5. **Where does this page live in the Accord nav rail?** The rail currently shows workstreams and MY MEETINGS. Does "Today" get a permanent rail entry at the top? Does it replace MY MEETINGS? Does it become the default landing when accord.html loads?

---

*End of ACCORD_TODAY_BRIEF.md*
*Authored 2026-05-19 from: conversation archaeology (fcb99ea7, 8b7a85b0, 3c4ace7a, 395f37fa, and others), PROJECTHUD_STATE.md, compass-meetings.html design session*
