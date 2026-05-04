# Scenario Walkthrough — Multi-Attendee Collaborative Meeting

**Module:** Meeting Minutes (alpha)
**Document type:** Scenario walkthrough — design brief input
**Drafted:** 2026-05-03
**Status:** Operator review pending; intended to drive next prototype iteration

---

## Purpose of this document

This is a sequenced narrative of one fully-collaborative meeting using the Meeting Minutes module, end to end. It is written from the operator's narrative voice (originally shared verbally in conversation) with explicit architectural annotations layered in. The annotations distinguish:

- **(NEW)** — capability not yet sketched or built
- **(EXTENDS)** — extension of capability already sketched in v2-series prototype
- **(SESSION)** — runtime session state (per-attendee, ephemeral)
- **(DOCUMENT)** — durable Meeting Minutes data (entries, threads, comments)
- **(COC)** — written through Chain of Custody; reconstructable historical state
- **(DERIVED)** — computed/published artifact (PDF, digest)
- **(DECISION POINT)** — design question requiring operator input before commitment

The walkthrough is intentionally specific enough to design from but not so specific that it locks in implementation choices the architecture brief should make. Decision points are marked rather than resolved.

---

## Cast and pre-meeting state

**The team:**
- **Ron White** — meeting organizer, Project Manager
- **Angela Kim** — scribe
- **Vaughn Staples (you)** — Chief Technical Officer
- **One Electrical lead** — TBD
- **One Mechanical lead** — TBD
- **One Quality lead** — TBD

**Setup:** All six are on a Zoom conference call for the audio bridge. Each has Meeting Minutes open on their own desktop, signed into ProjectHUD with their own credentials. The meeting is the 14th in the recurring "Electrical Design of Flexscope — Weekly Status" series; all six are listed as attendees on the meeting record.

**(SESSION)** Each attendee's ProjectHUD client establishes a presence channel on launch — a persistent connection that broadcasts "this resource is online" to other authorized observers. This is the Aegis-style presence layer the platform already implies; the Meeting Minutes module consumes it rather than inventing its own.

---

## 1 · Opening: presence cascade

**T-2 minutes. Ron joins ProjectHUD.** His attendee dot in the right pane of every other attendee's Meeting Minutes view turns from gray to green. **(NEW)** **(SESSION)**

The dot color encodes connection state:
- **Gray** — not currently signed in to ProjectHUD
- **Amber-pulsing** — signed in, but not currently viewing this meeting
- **Green** — signed in AND has this meeting's Live Capture surface active

**(DECISION POINT 1)** — Are these three states sufficient, or do we need a fourth state for "signed in, viewing the Living Document but not Live Capture"? My recommendation: keep to three states; "in the meeting room" is the only distinction that drives meeting workflow. If someone is in the Living Document tab, they are not "in the meeting" for our purposes.

**T-90 seconds.** Angela joins. Her dot turns green. **T-60 seconds.** Vaughn joins. **T-30 seconds.** Quality lead joins. **T-15 seconds.** Mechanical and Electrical leads join nearly simultaneously.

**(NEW)** A small "presence ticker" appears in the meeting header for ~3 seconds when each new attendee arrives: *"Mechanical lead joined."* The ticker is dismissed automatically; it is not a notification, just an ambient affordance.

**(NEW)** The meeting header now shows the **organizer's name** prominently. *"Organized by Ron White"* sits beneath the meeting title, adjacent to the existing meta line. This is a small display change but a meaningful semantic one — the organizer's identity is part of the meeting's evidentiary record.

**(COC)** Each attendee's join writes a `meeting.attendee_joined` event to CoC for this meeting record, with attendee identity and join timestamp.

---

## 2 · The LIVE CONNECT subscription

**T+0.** Meeting begins. Ron, as organizer, has the most up-to-date view of the meeting state — he is the one driving the agenda, navigating threads, opening attachments. The other five participants want to see what Ron is seeing without each independently having to navigate.

**(NEW)** A new control sits to the **left of LIVE CAPTURE** in the brand bar's tab strip: **LIVE CONNECT**. It defaults to disconnected.

Vaughn clicks LIVE CONNECT. A small modal lists the other connected attendees with green dots:
- ● Ron White — *organizer*
- ● Angela Kim
- ● Electrical lead
- ● Mechanical lead
- ● Quality lead

Vaughn clicks Ron. The modal closes. The LIVE CONNECT button now reads **LIVE CONNECT — Ron W** with a small amber broadcast indicator. Vaughn's view is now mirroring Ron's view. **(SESSION)**

**(DECISION POINT 2)** — What does "mirroring" actively encompass? The clearest scope is:
- Active agenda item and active thread (Ron's "Capturing under" target becomes Vaughn's)
- Scroll position in the captures stream and the Living Document (debounced — not every pixel, but every meaningful re-anchoring)
- Active attachment in the Image Canvas
- Open/closed state of the attachments sidebar
- Filter selections on the Living Document

What does it NOT mirror:
- Vaughn's own typing state in the textarea (Vaughn keeps his local input)
- Vaughn's own private chat conversations
- Vaughn's local UI preferences (theme, density)

The principle: **mirror the meeting frame, not the local instrument.** Ron drives where everyone is looking; Vaughn retains how he interacts with what he is looking at.

**(SESSION)** When Vaughn subscribes, his client opens a presence-protocol subscription to Ron's session; future state changes Ron makes are pushed to Vaughn (and any other subscribers) via the platform's real-time channel — likely Supabase Realtime or equivalent WebSocket-style subscription.

**(COC)** Subscription writes a `meeting.session_subscribed` event with subscriber identity, target identity, timestamp.

By the time the meeting is fully ramped up, all five participants (excluding Ron himself) are LIVE CONNECTed to Ron. The meeting now has **one shared visual experience driven by Ron, with five mirrors.**

---

## 3 · Capture in flight: Angela scribes, everyone sees

**T+8 minutes.** Discussion is on Agenda 01 — Electrical Design of Flexscope, thread "Prototype PCBs expected to arrive at Lighthouse on 5/15." Ben (Electrical lead) reports that Lighthouse confirmed shipment for 5/15 and the build package was received Friday.

Angela, as scribe, is typing into her own capture textarea. **(SESSION)** Her local typing state is private — Vaughn does not see Angela's half-typed text. This is the conventional answer for collaborative scribing: half-formed thoughts should not propagate.

Angela finishes the thought, clicks **Note**, and the capture commits. **(DOCUMENT)** **(COC)**

**(NEW)** Within ~250ms (the platform real-time channel's typical latency), the new capture appears in everyone's "CAPTURED THIS MEETING" tab. Vaughn (LIVE CONNECTed) sees it; Mechanical lead (LIVE CONNECTed) sees it; Quality lead (LIVE CONNECTed) sees it. Even attendees not LIVE CONNECTed but who happen to have Live Capture open — none in this scenario, but architecturally important — would also see it because the capture is meeting-document state, not session state. **(SESSION VS DOCUMENT distinction is critical here.)**

The capture renders identically on all screens: same time stamp, same NOTE tag, same source badge (✋ for Angela, who authored it), same body text, same target thread.

**(DECISION POINT 3)** — Does the source badge on a propagated capture indicate the *author* (Angela, the human who typed it) or the *source* (still ✋ human-authored, distinct from AI-summarized)? My recommendation: the badge indicates source-class (human / AI / import), and the author identity is encoded elsewhere — perhaps in a tooltip or in a small initials chip preceding the body. The two are distinct dimensions and should not be conflated.

---

## 4 · Comments propagate at meeting velocity

**T+12 minutes.** Angela has just tagged a Decision: *"Build package received last Friday; Lighthouse to fab by 5/15."*

Vaughn wants to add detail he heard from Lighthouse last week — the schedule has a buffer day for re-spin if first article fails. He clicks the new Decision entry, and a comment composer appears beneath it. **(EXTENDS)** — comments already exist in the prototype as a per-entry affordance; this scenario extends them with real-time propagation.

Vaughn types: *"Lighthouse confirmed they have a 1-day buffer for re-spin if first article doesn't pass smoke test. Worth noting in build package release."* Hits **Send**.

**(NEW)** Comment commits atomically. Within ~250ms, the comment appears beneath the Decision entry on every connected attendee's view. **(DOCUMENT)** **(COC)** A `meeting.comment_added` event is written with author, target entry id, timestamp, body.

Three things happen simultaneously on other attendees' screens:
- The comment appears in the comment thread beneath the Decision (auto-expanded if not already)
- The comment count badge on that entry increments (e.g., "💬 2 comments")
- A small "new" pulse highlights the comment for ~2 seconds before settling to normal styling

**(DECISION POINT 4)** — Is there a notification when a comment is added to an entry the participant is *not* currently looking at? My recommendation: yes, but lightweight — a small notification chip in the brand bar, dismissible. It catches the participant's attention if they're heads-down on something else (a separate thread, the Living Document, etc.) without forcing a context switch.

Mechanical lead reads Vaughn's comment and types a reply: *"Confirms what their build manager told me last Wednesday."* Send.

**(NEW)** Reply attaches to Vaughn's comment, not to the parent Decision entry. **Comments are threaded.** The thread renders with mild indentation under Vaughn's comment.

**(DECISION POINT 5)** — How deep can comments nest? My strong recommendation: **two levels maximum**. Comment-on-entry, reply-on-comment. Anything deeper becomes hard to follow visually and is better expressed as a new comment-on-entry referencing the prior one. Most collaboration tools that allow deeper nesting (Slack threads, Hacker News) discover the same lesson — depth is conversational debt that someone eventually has to read through.

**(DECISION POINT 6)** — Can comments be edited or deleted after posting? My recommendation: edit yes (with edit-tracking via CoC), delete no — comments are evidentiary; once posted they are part of the meeting record. A "withdraw" gesture that visibly strikes through and adds a withdrawal note is acceptable. Hard delete is not, even by the comment author.

---

## 5 · Comment density management

**T+18 minutes.** A particularly contentious thread has accumulated 8 comments. The Live Capture stream is starting to feel cluttered.

**(NEW)** Each entry's comment thread has expand/collapse controls. By default:
- **0 comments** — just the "💬 add comment" affordance
- **1-2 comments** — auto-expanded
- **3+ comments** — auto-collapsed, summary visible *("💬 8 comments · last from Mechanical lead 2 min ago")*; click to expand

Vaughn collapses the noisy thread. His local collapse state does not propagate — comment density is a local UI preference, not a meeting state change. **(SESSION)** Other participants can keep theirs expanded if they want.

**(DECISION POINT 7)** — When a participant LIVE CONNECTs to another, do they inherit that participant's expand/collapse state? My recommendation: no. Comment expand/collapse is local UI preference, parallel to scroll position. The mirror reflects what Ron is *looking at* (which thread, which agenda item) but not how Ron has decided to manage local density.

---

## 6 · Control handoff: Vaughn requests, Ron grants, Vaughn drives

**T+24 minutes.** Discussion turns to the PCB layout. Vaughn wants to demonstrate a specific pad-spacing issue on a thumbnail in the attachments sidebar — pan, zoom, and circle a specific via.

He cannot do this from his mirrored view. He is a passenger, not a driver. Ron currently holds control of the shared frame.

**(NEW)** A small "Request control" button sits in the Live Capture surface near the LIVE CONNECT indicator when Vaughn is in subscribed-mode. Vaughn clicks it.

**(NEW)** Ron's screen shows a small notification: *"Vaughn Staples is requesting control. [Grant] [Ignore]"*. The notification is non-modal — it does not interrupt Ron's flow, but it is visible.

Ron clicks Grant.

**(SESSION)** Several things happen:
- Ron's local session is now in subscribed-mode TO Vaughn (his "Capturing under" target follows what Vaughn does)
- Vaughn's local session is now driving the shared frame
- All other participants who were subscribed to Ron are now subscribed to Vaughn (the platform automatically transfers subscriptions; participants do not need to manually re-subscribe)
- The "control holder" indicator updates everywhere: the brand bar of all six attendees shows *"Driving: Vaughn Staples"* in a discreet but visible chip

**(DECISION POINT 8)** — When control is granted, do all subscribers automatically re-target to the new driver, or do they stay subscribed to the original (who is now subscribed to the new driver, so they see the same thing transitively)? My recommendation: automatic re-target. The subscription should be conceptually "follow the meeting's current driver" rather than "follow this specific participant." This is simpler and matches user expectation; the alternative produces a confusing transitive-subscription chain that breaks if the original participant disconnects.

Vaughn now drives. He opens the attachments sidebar **(EXTENDS)** which propagates open-state to all subscribers. He selects the third PCB layout image **(EXTENDS)** which propagates active-image to all subscribers. He pans and zooms. **(NEW)** Pan/zoom state propagates to all subscribers in real-time — the panel zooms and pans in lockstep on all screens.

**(DECISION POINT 9)** — Does pan/zoom propagation include sub-pixel smoothness, or is it discretized (e.g., zoom-level + center-coordinate snapshots every 100ms)? My recommendation: discretized at ~30Hz with smooth interpolation on the receiving end. Sub-pixel smoothness over a real-time channel is bandwidth-expensive and visually unnecessary; 30Hz with interpolation looks identical to the human eye.

Vaughn draws a circle around the via in question. **(NEW)** Annotation events are written to CoC for the image (per the annotation slider design captured in the journal entry). Annotation overlays propagate to all subscribers. The annotation is now part of the image's permanent annotation event log; it is **not ephemeral**.

**(DECISION POINT 10)** — When Vaughn explains his point and is done, is the annotation kept as part of the image's record forever, or is it ephemeral (appears during the meeting, fades after)? My strong recommendation per the operator's prior framing: **annotations are permanent**. The annotation slider lets future readers see what the image looked like during this discussion. Ephemeral annotations would defeat that whole pattern.

Vaughn clicks **Return control**. Control reverts to Ron. The driving indicator updates back to *"Driving: Ron White"* on all six screens.

---

## 7 · Contextual recall: the visual that came back

**T+34 minutes.** Quality lead asks: *"Didn't we discuss this exact pad-spacing issue three weeks ago when we were reviewing the schematic? I think there was a thermal calculation that resolved it."*

Ron, who is driving, switches to the Thread History tab on the active thread **(EXTENDS)** — already implemented in v2l. He scrolls to the entry from Apr 15.

The entry shows a typed note from Ben Roy: *"Mike Rucker 50% through PCB layout; expects to complete by 4/17."*

Ron clicks the entry. **(NEW)** Two things happen simultaneously:
- The captures stream highlights the clicked entry briefly (the same "new" pulse used for newly-arriving captures)
- The Image Canvas in the attachments sidebar **auto-pops to the image that was associated with that entry** when it was originally captured

**(DOCUMENT)** This works because the entry, when originally captured back on Apr 15, had a `linkedVisual` reference written into its data — the prototype's existing visual-association mechanism, just queryable now from history-recall context.

**(DECISION POINT 11)** — What happens if the entry has no linked visual? My recommendation: the attachments sidebar opens (if not already), shows the empty-state message *"This entry has no linked visual"* with an option to attach one retroactively. The retroactive attachment is itself a CoC-written event (`meeting.entry_visual_linked`) so the historical record reflects the late-binding clearly.

**(DECISION POINT 12)** — What happens if the entry has multiple linked visuals (an entry that referenced several images)? My recommendation: the first one in chronological order auto-pops, with a small "1 of 3" indicator and arrows to navigate among them.

The PCB layout image from Apr 15 appears. The Quality lead has the visual context she needs. The thermal calculation she remembered turns out to have been documented in a comment on a different entry from Apr 22 — Ron clicks that next, and the relevant thermal-sim image pops on screen.

The team has just navigated three weeks of meeting history in under 90 seconds, with the original visuals reconstructed in their original context. **This is the "memorialize the basis for decisions" framing made operational.**

---

## 8 · Real-time action item creation

**T+47 minutes.** Discussion has produced a clear new commitment: Chris Staples needs to confirm the FDA 510(k) predicate device with Sandra Ng by next Tuesday.

Angela types into her local capture textarea: *"Confirm FDA 510(k) predicate device with Sandra Ng."* Clicks **Action**.

**(EXTENDS)** Action tag — already in the prototype's tag vocabulary.

**(NEW)** When Action is clicked, a small assignment composer slides in (similar to the stakes selector for Decision/Risk):

```
Action · assigned to [▾ Chris Staples] · due [▾ Tue May 12] · [✓ Confirm]
```

The assignee dropdown is populated from the meeting's attendee roster plus the resource directory; Chris Staples is not currently in the meeting but is selectable from the broader roster. The due-date dropdown defaults to "in 1 week" and is editable.

Angela picks Chris Staples, accepts the default May 12 due date, clicks Confirm.

**(DOCUMENT)** **(COC)** Three writes happen:
- `meeting.entry_added` for the action item itself
- `meeting.action_item_assigned` with assignee=Chris, due=May 12
- A corresponding entry in the action items table that the calendar consumes

**(NEW)** Within seconds, the action item appears on Chris's calendar (he is not in the meeting, but his Compass My Calendar view will show it next time he looks; if he is currently in Compass, his Kanban view updates in real-time) AND in his personal task list.

**(DECISION POINT 13)** — Does Chris get a notification when an action is assigned to him in real-time? My recommendation: yes, with the participant's stated urgency / stakes determining whether it's a soft notification (in-app badge) or a hard notification (email or push). Stakes-aware confidence routing applied to assignment events.

**(DECISION POINT 14)** — Can someone in the meeting reassign the action *during* the meeting (e.g., Chris-the-actual-person walks in late and says "actually I'd prefer this to go to David")? My recommendation: yes, the assignment is editable until the meeting closes. After meeting close, reassignment requires a new action (with reference to the original) to preserve the audit trail.

---

## 9 · The action items review pivot

**T+52 minutes.** Meeting is approaching its scheduled end. Ron pivots: *"Let's do action items review for the last 8 minutes."*

Ron, who is driving the shared frame, clicks the **filter** affordance in the Live Capture stream's tab row. **(NEW)**

The filter affordance is a small button next to "THREAD HISTORY" tab — perhaps an icon (≡ or ⇣) that opens a filter chip row. Available filters:
- **Tag** — all / decision / action / risk / question / note
- **Status** (for actions specifically) — overdue / due this week / open / complete
- **Assignee** — me / specific person / anyone
- **Stakes** — any / med+ / high only

Ron filters: **Tag = action**, **Status = overdue + due this week + new this meeting**, sorted by **status (overdue first)**.

**(DECISION POINT 15)** — Does the filter selection propagate to subscribers? My strong recommendation: **yes**, because the filter selection is part of "what Ron is looking at" — the central premise of LIVE CONNECT. If a subscriber wants to see something else, they disconnect from the LIVE CONNECT and apply their own filter (covered in the next section).

**(SESSION)** All five subscribers' views update to show the same filtered list:

```
🔴 OVERDUE  Confirm FDA 510(k) predicate device     David N · due Mar 21
⚠ DUE      Research single-use COTS suppliers       Sandra O · due Mar 25
✏ NEW       Confirm FDA 510(k) predicate device     Chris S · due May 12
```

The team walks through each item, in order. The lingering ones get explicit attention. The new one gets context. Ron uses the shared filtered view as the conversation's anchor.

---

## 10 · The detach-and-explore moment

**T+57 minutes.** While the team discusses the overdue COTS suppliers item, Vaughn realizes he wants to look at notes from a meeting two months ago — he remembers something relevant about a supplier evaluation he wants to verify.

He clicks LIVE CONNECT, which is currently labeled *"LIVE CONNECT — Ron W"*. The dropdown appears. He clicks **Disconnect** at the top of the list.

**(SESSION)** His client is now no longer mirroring Ron's session. He retains:
- Audio (still on Zoom)
- Presence (still green dot for everyone)
- Meeting context (still in the same Live Capture surface; the meeting is still happening around him)

What he loses:
- Ron's scroll position no longer drives his
- Ron's filter selection no longer applies to him
- Ron's active thread no longer auto-targets his "Capturing under"

**(DECISION POINT 16)** — When Vaughn disconnects, where does his view land? Three options:
- **A: Stay where he was at moment of disconnect** — his view is exactly what it was at the last shared frame
- **B: Snap back to his last personal navigation** — wherever he was before he subscribed
- **C: Snap to the meeting's "now" — the most recent capture, the most recent shared agenda item**

My recommendation: **A** — stay where you are. This is least disruptive. Vaughn can immediately navigate from there to wherever he wants to go.

Vaughn navigates to the Living Document tab, finds the meeting from two months ago, scrolls to the relevant thread, finds his note, clicks an entry that has a linked image, opens the image in the attachments sidebar, confirms what he was looking for.

He pivots back. He wants to share what he found. He clicks LIVE CONNECT, and the dropdown shows him an additional option:

**Host — let others connect to you**

**(NEW)** Vaughn clicks Host. His client's session becomes available as a connection target for other attendees.

**(DECISION POINT 17)** — Does host-mode require explicit opt-in from receivers, or do they auto-receive a notification offering to switch their LIVE CONNECT to Vaughn? My recommendation: auto-notification, not auto-switch. Each receiver gets a small chip in their brand bar: *"Vaughn Staples is sharing his session. [Switch] [Ignore]"*. Switching disconnects them from Ron and connects them to Vaughn. Ignoring keeps them where they are.

Five seconds later, three of the four other subscribers have clicked Switch. Quality lead and Mechanical lead are now subscribed to Vaughn; Ron and Electrical lead are still on their own (Ron because he is driving the meeting; Electrical lead because they want to keep watching the action items list).

Vaughn explains what he found. The relevant context propagates to the two who chose to follow him. After ~90 seconds, he says: *"Okay, switching back."* He clicks Disconnect on his host-mode. **(SESSION)** His session is no longer available as a target.

He clicks LIVE CONNECT → Ron W. He is back in Ron's frame. The two attendees who had subscribed to him also automatically re-subscribe to Ron (or, more accurately, they get a notification suggesting they re-subscribe to Ron, since the transition is from-private-back-to-organizer-default).

**(DECISION POINT 18)** — When a temporary host releases their session, do their subscribers auto-re-route to the meeting's primary driver (Ron), or stay disconnected? My recommendation: the simpler model is to disconnect them and let them re-subscribe explicitly. The more sophisticated model is to remember "the previous subscription target" per-subscriber and offer auto-restore. I lean toward the simpler model for v1.

---

## 11 · Departure cascade

**T+60 minutes.** Meeting concludes. Ron says *"thanks all"* on the audio bridge. Each attendee starts disconnecting in their own time:

- Mechanical lead closes ProjectHUD first. **(SESSION)** His green dot fades to gray on everyone's view.
- Quality lead and Electrical lead leave within 30 seconds. Their dots fade.
- Ron clicks the END MEETING button **(EXTENDS)** — already in the prototype.
- Angela and Vaughn linger for a few minutes finishing their notes.

**(NEW)** When Ron clicks END MEETING, three things happen:
- The meeting's status changes from `in_progress` to `completed` **(DOCUMENT)** **(COC)**
- All currently-uncommitted captures and comments are committed as the meeting's version increment **(DOCUMENT)** **(COC)** — adoption of Cadence's Uncommitted/Committed pattern
- The async PDF generation pipeline begins **(DERIVED)**

The presence dots that remain green (Angela, Vaughn) are now in the *post-meeting* state — they are still in the surface, just for cleanup, not for active scribing. **(DECISION POINT 19)** — Should there be a visual distinction between in-meeting and post-meeting presence? My recommendation: subtle yes — perhaps the green dot becomes a hollow ring (●→○) once the meeting is closed but the participant is still on the surface. Indicates "they are here, but the meeting is over."

---

## 12 · Async publication

**T+1 hour 5 minutes.** Vaughn is back at his desk after a coffee break.

A notification chip appears in his ProjectHUD brand bar: *"Meeting minutes ready — Electrical Design of Flexscope (May 4)."*

He clicks the chip. ProjectHUD opens to the **Minutes tab** — a new tab in the Meeting Minutes module's top navigation.

**(NEW)** The Minutes tab shows the series-level archive:

```
ELECTRICAL DESIGN OF FLEXSCOPE — Weekly Status

May 4, 2026 — Meeting 14    [PDF · 3.2 MB · just now]   ⊞ View · ↓ Download
Apr 27, 2026 — Meeting 13   [PDF · 2.8 MB]              ⊞ View · ↓ Download
Apr 20, 2026 — Meeting 12   [PDF · 3.1 MB]              ⊞ View · ↓ Download
Apr 13, 2026 — Meeting 11   [PDF · 2.6 MB]              ⊞ View · ↓ Download
...
```

Reverse chronological — most recent at top.

Vaughn clicks **View** on the May 4 PDF. The PDF renders in an inline lightbox or a new tab.

**(DERIVED)** The PDF contains:
- Cover page with meeting title, date, attendees, duration, organizer
- Agenda items, threads under each, entries under each thread (in chronological order *within* the thread, since the PDF is the canonical record)
- Decisions and Risks called out with stakes badges
- Action items summary section with assignees, due dates, status as of meeting close
- Embedded visuals — annotated where relevant
- Comments inline beneath their parent entries
- Footer on each page: meeting reference, page number, content hash for tamper-detection

**(DECISION POINT 20)** — Is the PDF generated once and stored, or generated on-demand? My recommendation: **generated once, stored** as part of the meeting's record. Regeneration requires explicit operator action and produces a new version with a new hash (so the original PDF as committed at meeting close is preserved as the canonical evidentiary artifact).

**(DECISION POINT 21)** — What triggers PDF generation? Three options:
- **A: Automatic on END MEETING** — generates immediately
- **B: Automatic with delay** — 30 minutes after END MEETING, allowing time for last-minute corrections
- **C: Explicit by organizer** — Ron clicks "Publish minutes" when he is satisfied

My recommendation: **B with override**. Default 30-minute delay (so corrections can land), with the organizer able to publish-now at any time during the delay. This balances speed-to-publish against the realistic likelihood of post-meeting corrections.

---

## Summary — what this scenario establishes

The narrative compresses, but doesn't oversimplify, the operator's original. Each capability has been touched:

✓ Per-attendee presence with three-state dot
✓ Organizer's name in the meeting header
✓ LIVE CONNECT with subscription dropdown
✓ Real-time capture and comment propagation
✓ Comment threading two levels deep
✓ Comment density management with expand/collapse
✓ Control handoff with grant/return semantics
✓ Pan/zoom/markup during control-holder turn
✓ Annotations as permanent CoC writes
✓ Contextual recall — entry click auto-pops linked visual
✓ Real-time action item creation with assignee + due
✓ Calendar/task list propagation on assignment
✓ Filter pivots that propagate via LIVE CONNECT
✓ Detach-and-explore (disconnect while still in meeting)
✓ Brief host-handoff for ad-hoc demonstration
✓ Disconnection cascade with status transitions
✓ Async PDF publication with notification, in a Minutes tab

## Scope of decision points

Twenty-one decision points are flagged through the document. Roughly:

- **Mostly UX granularity** (DP 1, 4, 7, 11, 12, 16, 19) — small, can be settled in iteration
- **Mostly architecture** (DP 2, 3, 8, 9, 10, 13, 14, 17, 18, 20, 21) — must be settled in the architecture brief before build commences
- **Mostly doctrine** (DP 5, 6, 15) — affect how the module behaves under all circumstances; should land as ratified rules

## What this document does NOT cover

Honest list of what is deferred to other artifacts:

- **Architecture brief content**: the schema additions, CoC vocabulary additions, real-time channel architecture, control-token semantics — all deferred to the architecture brief that is downstream of this walkthrough.
- **Build sequencing**: which CMD ships which capability — deferred to the multi-CMD plan that is downstream of the architecture brief.
- **Doctrine conformance staging**: which prototype elements stay aesthetic-as-built, which retrofit, which establish new doctrine — deferred to the conformance plan.
- **Counterfactual analysis**: explicitly binned per operator decision earlier in the arc.
- **AI-synthesized rolling synthesis** (Notetaker-equivalent): identified as future direction in the journal entry but not part of this scenario.
- **Watermarking spectrum** (cryptographic content hash, OpenTimestamps): identified in the journal entry; the PDF footer's content hash is one element of this, but the full spectrum is build-phase concern.
- **Cross-domain ramifications**: how this module's promotion affects Pipeline, Compass, Cadence, Aegis — touched but not enumerated here.

## Standing by

This document is intended to drive operator review and reaction. The decision points are framed as architect's recommendations with rationale; operator may accept, modify, or reject any of them. Each rejection or modification is itself useful input that sharpens the next artifact (the architecture brief).

Once the operator has reacted, the next artifacts are:

1. **Architecture brief** translating this scenario plus the prior journal-entry decisions into an enumerable specification
2. **Multi-CMD plan** sequencing the build into 5-8 CMDs with rough hour estimates
3. **Doctrine conformance plan** for the prototype's transition from vision artifact to alpha-of-module
4. **Next prototype iteration** incorporating selected mock-ups of the collaborative capabilities (per operator's selection of which to lead with)

— End of scenario walkthrough —
