# Design Brief — The Accord New Meeting Experience

**Output requested:** an interactive HTML mockup of the meeting setup / scheduling interface for Accord, a next-generation operating system for structured work conversations.

**Audience:** product managers, HR leads, line managers, purchasing agents, sales leaders, engineering leads, executives — anyone whose work runs on a continuous flow of meetings that produce decisions, actions, and commitments.

**Your charge:** rethink the most ubiquitous interaction in professional software — creating a meeting — from first principles. The dominant pattern (calendar event with title, time, attendees, optional description) is forty years old and has shaped the work it enables to be just as stale. We want to ship something that feels like the future arrived.

---

## What Accord is

Accord is a meeting operating system. Not a notes tool, not a calendar, not a transcription product — a substrate that turns conversations into committed, queryable, audit-rich outcomes.

Every meeting in Accord produces structured outputs: sealed decisions with sequence identifiers (DC-001, DC-117), assigned actions with owners and due dates (AX-091, AX-203), captured risks (RX-014), surfaced questions (QX-007), and recorded dissents (DS-005) — all linked through a chain-of-custody substrate that proves what was decided, by whom, when, and with what supporting context.

Once a meeting is sealed, its substrate is immutable. Decisions can't be quietly rewritten. Actions can't be deleted to make a quarter look better. The audit trail is real and complete.

This makes Accord different from every meeting tool that came before it. The meeting isn't a calendar event with attached notes. The meeting is the substrate event itself.

## What's revolutionary about how Accord thinks

**Workstreams over calendars.** Operators organize work by workstream — bounded streams of work they consider coherent units of attention. "Endoscope replacement project" is a workstream. "1:1s with my manager" is a workstream. "P&P initiative — IT change control" is a workstream. Meetings live within workstreams; workstreams contain ongoing substrate that accumulates and references prior meetings.

**Continuation over genesis.** Most meetings are not new — they're continuations. Last week's 1:1 produced four open actions; this week's 1:1 starts with those four already in scope. Last month's engineering review surfaced a risk that wasn't yet mitigated; this month's review picks it up automatically. The system knows what came before; the operator shouldn't have to manually carry it forward.

**Next Required Action discipline.** A foundational organizing principle: every meeting thread (every agenda item) must terminate in either a concrete owned action with a due date, OR an explicit "no action required" decision with rationale, OR a deliberate deferral to a future meeting. Threads that end ambiguously fail substrate validation. The meeting cannot seal until every thread has been resolved. Discussion-without-commitment is structurally eliminated. This was inspired by a progressive organization that ran biweekly "NRA — Next Required Action" meetings — every conversation, every topic, every issue, ended with a concrete owned next step. Accord weaves that discipline into the substrate itself.

**Substrate-aware everything.** When the operator opens a workstream, the system knows what's pending: open actions with overdue dates, decisions awaiting belief declarations from absent parties, dissents not yet acknowledged, questions unresolved. The meeting form doesn't ask "what's the agenda?" — it can answer that question itself, then let the operator confirm or amend.

**Outputs over outputs-attachments.** Other tools say "here's what was decided" as a notes section attached to a calendar event. Accord says "here's the decision (DC-117), declared by Sarah Chen on 2026-04-22 in the Phase 1 Engineering Review meeting under Endoscope Project workstream, currently with one dissent registered by Tom Liu, effective 2026-09-01, sealed and immutable in the chain of custody, included in the May 7 minutes rendered to PDF with merkle root abc123…" The output is the substrate; the substrate is the output.

## Where the New Meeting interface fits

This is the touchpoint that creates everything downstream.

Today, when someone schedules a meeting in Outlook, they fill out a form: title, attendees, time, location, description. The form has not changed in two decades. The person completing the form has no idea what the meeting will produce; the calendar event is just a placeholder for "we will be in a room together at 10am."

Accord's New Meeting interface is the moment a piece of work begins committing to substrate. It needs to feel different. It needs to honor what makes Accord different. It needs to be the first interaction that tells a new operator "this isn't another tool you're learning — this is a different way of doing the work."

## What we want the mockup to embody

We want you to design as if every assumption from calendar tools, project tools, and meeting-notes tools is up for grabs. Don't replicate Outlook with Accord branding. Don't paste an agenda field next to a date picker. Push hard.

Things worth exploring (not a checklist — pick what inspires you):

**The operator's intent.** Three modes seem to recur in practice:
- *Quick capture* — "I need to record this conversation right now"
- *Cadence* — "I have a recurring meeting with this workstream"  
- *Formal* — "I'm scheduling a structured session with multiple parties about defined topics"

How does the interface accommodate all three without forcing a mode picker that adds friction at the entry point? Can the system infer intent from context (am I descended into a workstream? do I have a meeting starting in 10 minutes?) and adjust the form accordingly?

**Continuation as default.** When the operator creates a meeting within a workstream that already has history, the system should pull forward what's relevant: open actions from prior meetings, decisions awaiting review, deferred NRA items, unresolved questions. The operator confirms or amends; they don't start blank. How does this carry-forward feel? A panel? A timeline? A pre-populated agenda the operator can reorder?

**Agenda-first, not title-first.** Title is what other tools ask for first. Title is also the least valuable field — it's a label. What if the meeting form asked "what needs to be decided, accomplished, or surfaced?" first, and derived a sensible title from those agenda items? Or asked nothing about title at all, defaulting to "[Workstream Name] — [Date]"?

**NRA as visible structure.** Each agenda item is a thread that will need a Next Required Action by end of meeting. The form could explicitly invite the operator to articulate what kind of NRA they expect — "decision needed," "action to assign," "risk to surface," "question to resolve" — priming the meeting's substrate before it starts.

**The empty state matters.** A new operator with no workstreams, no prior meetings, no carried-forward context — what does their first meeting creation look like? Is it the same form with everything blank, or is there an onboarding-aware variant that walks them through Accord's commitments while they create?

**Time and place are secondary, not primary.** When does this meeting happen? Today, this week, immediately? Where? Video, conference room, in-person? These matter, but they're not what makes the meeting useful. They might be a quietly-collapsed section the operator opens only when they need to schedule (vs. start now). Or they might be inferred from defaults (most meetings happen now, in the operator's default video link).

**Attendees are relationships, not email addresses.** Accord knows the operator's resources (people they've worked with). Attendees should auto-suggest from the workstream's prior participants. External attendees (customers, suppliers, contractors) might warrant their own treatment — those relationships matter too.

**The "Start Meeting" moment.** When the operator commits to creating the meeting, what happens? In other tools, an invite gets sent. In Accord, the substrate is created and the operator dissolves into the meeting workspace. The transition itself can be meaningful — a sense of beginning, of commitment, of substrate being instantiated.

## What we want the mockup to feel like

**Inspired and crafted.** The visual treatment should reward attention. Smooth transitions. Considered typography. Thoughtful use of motion. We have a precedent: another part of Accord (the Aegis Cockpit) uses a constellation visualization with smooth dissolve transitions between hierarchical levels — the operator clicks a node and dissolves into that node's context; ESC ascends. The transitions feel alive. We want this same quality of attention in the New Meeting experience.

**Confident in its own opinions.** Accord has commitments — about workstreams, NRA discipline, substrate immutability, continuation. The form should reflect those commitments. Don't apologize for them. An operator who wants a "quick blank meeting with no structure" can have it, but the interface's defaults should reward those who lean into Accord's way of working.

**Reductive about friction.** Every field that doesn't add value is a tax on the operator. Defaults should be aggressive. Most meetings don't need an explicit title. Most meetings don't need an explicit time slot (they're starting now). Most meetings inherit attendees from prior meetings. Show the operator only what they need to confirm, not everything they could theoretically specify.

**Distinctive in its visual language.** This is product-quality work. It will be the first touchpoint a new customer has with Accord. It needs to make them lean forward, not nod politely. Look at calendar tools and design specifically NOT to look like them.

## What's outside scope for this mockup

- The meeting itself (what happens during Live Capture) — out of scope
- The constellation entry surface above the meeting (workstream visualization) — out of scope; you can assume the operator arrived at this surface from somewhere
- Backend substrate APIs, database schema, authentication — out of scope
- Mobile / tablet — desktop-first; ignore touch
- Internationalization, accessibility audit — sketch level only

## Constraints

- Single HTML file (inline CSS + JS as needed)
- No external libraries beyond what's hosted on common CDNs
- Should run in a modern browser without build tools
- Make it interactive enough to demonstrate the flow — clicking through stages, hovering, transitioning between states
- Visual fidelity: high. This isn't a wireframe. We want product-quality design.
- Use placeholder content that feels real (not "Lorem ipsum"; use plausible workstream names, agenda items, attendee names)

## What you have to work with — context to use

Some operator scenarios you can use to ground your design:

**Scenario 1 — PM creating a meeting within an existing workstream.** Vaughn is descended into the "Endoscope Replacement Project" workstream. The workstream has 12 prior meetings, 8 open actions, 3 decisions awaiting belief declarations, 1 unresolved dissent. Vaughn clicks "+ New Meeting." What does Vaughn see?

**Scenario 2 — Manager creating a recurring 1:1.** Sarah has a weekly 1:1 with her direct report Marcus. The "1:1s with Marcus" workstream has 8 prior weekly meetings. This week's meeting is about to happen. Sarah clicks "+ New Meeting." What's the experience? How does last week's substrate carry forward?

**Scenario 3 — New operator's first meeting ever.** Tom just got Accord. He has no workstreams. He has no prior meetings. He's about to start his first meeting in five minutes — a kickoff with the design team about a packaging redesign. He clicks "+ New Meeting." How does Accord introduce itself in that moment?

**Scenario 4 — Quick capture mid-day.** Vaughn just had a hallway conversation with the QA director about regulatory submission timing. Vaughn realizes this needs to be a meeting (decisions made, actions implied). He's not in any workstream context — he's at the constellation. He clicks "+ New Meeting." It's already happening; he just needs substrate to capture it.

You don't have to address all four. Pick the ones that inspire you. But your mockup should make clear which scenario(s) it addresses and how the interaction handles them.

## What we're hoping you'll surprise us with

We'll know it when we see it. But here are the kinds of surprises we'd find delightful:

- An interaction model nobody's tried in this space
- A way of representing time that makes "when does this meeting happen" feel different
- A way of representing people that honors them as collaborators, not email addresses
- A continuation pattern that makes prior substrate feel alive and present, not buried in archives
- A visual language that makes Accord feel inevitable, not derivative
- An empty state that makes a new user excited rather than confused
- A way of acknowledging NRA discipline that makes it feel empowering rather than restrictive
- A use of motion that makes the moment of meeting creation feel like the beginning of something

## What we're not looking for

- Minor variations on calendar.google.com or outlook.live.com
- A form with twelve fields and a "create" button
- A wireframe with gray boxes and Lorem ipsum
- Aesthetic borrowed from any specific existing product
- Heavy gamification, pointless animation, or visual noise that doesn't carry meaning
- "Here's a Kanban board" as an answer to anything in this brief

---

## Deliverable

Single self-contained HTML file. Open it in a browser; click through the flow; see the New Meeting experience as you designed it.

Include a short README section at the top of the HTML (in a comment block or in a hidden documentation section) explaining:
- Which scenario(s) you addressed
- The two or three design moves you're most proud of
- What you'd do next if you had another week

Surprise us. Push hard. This is the first thing that customers will touch in Accord. Make it the moment they decide this product is different.

---

*End of design brief — Accord New Meeting Experience.*
