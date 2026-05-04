# Accord Roadmap — Feature Enumeration vs Mockup/Build Split

**Source:** scenario-walkthrough-meeting-minutes-collaborative.md (12 sections)
**Reference prototype:** accord-prototype-v3a.html
**Drafted:** 2026-05-04
**Revised:** 2026-05-04 (rev 2 — operator clarifications integrated)

> **Revision note (rev 2).** Two operator clarifications received after the initial
> roadmap, both incorporated below:
>
> 1. **Connection status mirrors Aegis.** Accord does not invent its own presence
>    tracker — it consumes Aegis's existing presence channel and inherits its
>    state vocabulary. Section 1 updated.
>
> 2. **Capture-in-flight is private.** The "type what's being said" textarea is
>    the scribe's private sandbox. Nothing propagates until the scribe tags
>    (Note / Decision / Action / Risk / Question). The tag IS the commit. This
>    extends across the entire module as the unifying architectural principle
>    documented immediately below: **private composers + structured commits**.
>    Section 3 updated; ramifications noted in Sections 4 and 8.

---

## Architectural principle — Private composers + structured commits

This is the unifying principle Accord operates by. Every text input affordance in the module is, by default, **private to its operator**. Nothing propagates from a composer to other attendees until the operator performs an explicit **commit gesture** that tags the input as a structured artifact.

**The composers and their commit gestures:**

| Composer | Commit gesture | Resulting structured event |
|---|---|---|
| Live Capture textarea | Click Note / Decision / Action / Risk / Question (or Ctrl-letter) | `meeting.entry_added` |
| Comment composer on an entry | Click Send | `meeting.comment_added` |
| Reply composer on a comment | Click Send | `meeting.comment_added` (with parent) |
| Team Chat input | Click Send (or Enter) | `meeting.chat_message_sent` |
| Action assignment composer | Click Confirm | `meeting.action_item_assigned` |
| Annotation tools on visuals (future) | Click Done / commit | `meeting.annotation_added` |

**Implications of this principle:**

- **No character-by-character broadcasting.** No live-typing indicators. No half-formed thoughts arriving on others' screens. No conflict resolution between simultaneous typists in the same composer (because every composer is private to its operator — there is no shared composer).
- **The propagation event is always atomic and structured.** The payload is a structured artifact (tag + body + metadata), never a partial keystroke stream. The real-time channel only moves committed events.
- **Composers are interchangeable per operator.** Each attendee has their own copy of every composer. Two scribes could both be typing simultaneously into their own Live Capture textareas; only their tagged commits would interleave on others' screens.
- **Edits and corrections happen privately.** A scribe can backspace, rephrase, restart a thought, or close their browser without anything having propagated. The thinking-and-writing process is private; only the result of that process is shared.
- **The textarea persists across composer switches.** If the scribe is mid-thought and clicks a different agenda thread to read context, their typed text remains in their private composer when they return.

**This principle deserves doctrine candidacy.** It applies cleanly across Accord and likely generalizes to other ProjectHUD modules where collaborative composition is involved. Worth ratifying as a named pattern.

---

This document enumerates every feature implied by the scenario walkthrough, organized by the same 12 numbered sections, and assigns each a **MOCKUP** or **BUILD** verdict. The verdict reflects whether the feature can be meaningfully demonstrated in the prototype (single-user, no real backend) or whether it requires production infrastructure to express truthfully.

**Verdict legend:**
- **DONE** — already in v3a prototype
- **MOCKUP** — should be added to the prototype before build commissioning
- **BUILD** — defer to production implementation; not faithfully mockable
- **HYBRID** — affordance can be shown in mockup; real behavior requires build

---

## 1 · Opening: presence cascade

| # | Feature | Verdict | Note |
|---|---|---|---|
| 1.1 | Accord subscribes to Aegis's existing presence channel | BUILD | Integration with existing platform service; not new infrastructure |
| 1.2 | Three-state attendee dot consumes Aegis state vocabulary | DONE | v3a renders the states; production maps them to Aegis's vocabulary |
| 1.3 | Tooltips explaining each presence state on hover | DONE | v3a |
| 1.4 | "Presence ticker" notification on attendee join (~3s auto-dismiss) | MOCKUP | Easy seed: simulate with a delayed setTimeout in prototype |
| 1.5 | Organizer name displayed in meeting header | DONE | v3a |
| 1.6 | `meeting.attendee_joined` CoC event written on join | BUILD | Backend; CoC integration |

> **Aegis as presence source-of-truth.** Per operator clarification, Accord does not maintain its own presence-tracking infrastructure. It subscribes to whatever the Aegis presence layer publishes — meaning Accord automatically inherits any future state additions Aegis introduces (away, idle, do-not-disturb, etc.) without per-module rework. The dots in the right-pane attendees panel are a *projection of Aegis state*, not a separate state machine.

---

## 2 · The LIVE CONNECT subscription

| # | Feature | Verdict | Note |
|---|---|---|---|
| 2.1 | LIVE CONNECT control to the left of LIVE CAPTURE | DONE | v3a |
| 2.2 | Dropdown listing other connected attendees with presence dots | DONE | v3a |
| 2.3 | Disabled state on non-green attendees in dropdown | DONE | v3a |
| 2.4 | Connected-state styling (amber border + name suffix) | DONE | v3a |
| 2.5 | "× Disconnect" option in dropdown when subscribed | DONE | v3a |
| 2.6 | Actual mirroring of subscriber's view to driver's state | BUILD | Real-time state propagation; needs WebSocket channel |
| 2.7 | "Mirroring Ron's view" persistent indicator while subscribed | MOCKUP | Currently the button shows it; could add a more prominent mode badge |
| 2.8 | Subscription scope: agenda item, thread, scroll, attachments-pane state | BUILD | Real-time sync of view state |
| 2.9 | Subscription does NOT propagate: typing state, chat, local UI prefs | BUILD | Privacy-by-default architecture |
| 2.10 | `meeting.session_subscribed` CoC event on subscribe | BUILD | Backend |

---

## 3 · Capture in flight: private composer, structured commit

| # | Feature | Verdict | Note |
|---|---|---|---|
| 3.1 | "Type what's being said" textarea is private to the composing operator | DONE | Default browser behavior; nothing to wire — the textarea was already local-state |
| 3.2 | Tag click (Note/Decision/Action/Risk/Question) is the commit gesture | DONE | v3a |
| 3.3 | On commit, structured event propagates to all attendees as a single atomic message | BUILD | Real-time channel; payload is a structured entry, not keystrokes |
| 3.4 | No live-typing indicators, no half-formed-thought broadcasting | DONE | Architectural default per the "private composers" principle |
| 3.5 | Source badge on propagated capture (✋ human, ◆ AI, ⇤ import) | DONE | v3a vocabulary established |
| 3.6 | Author identity distinct from source class (initials chip on entry) | MOCKUP | Small extension: add author initials before body text |
| 3.7 | Composer text persists when operator switches threads to read context | MOCKUP | Easy retention: keep textarea value across thread-target changes |

> **Section 3 was meaningfully simplified by operator clarification.** Earlier framing implied that captures-in-flight required complex real-time semantics (privacy of half-typed text, sub-250ms broadcast, etc.). The clarified framing is much cleaner: the textarea is browser-local, and the only network event is an atomic structured commit on tag click. The complexity that earlier framing implied is now absent — there is no "live typing" channel to build.

---

## 4 · Comments propagate at meeting velocity

| # | Feature | Verdict | Note |
|---|---|---|---|
| 4.1 | Click entry to open comment composer (private to operator) | DONE | Pre-existing in prototype; composer is local-state per operator |
| 4.2 | Click Send commits the comment as a structured event | DONE | UI present in v3a |
| 4.3 | On send, structured event propagates atomically to all attendees | BUILD | Real-time channel; same pattern as §3.3 |
| 4.4 | Comment count badge increments on entries (e.g., "💬 2 comments") | DONE | Pre-existing in prototype |
| 4.5 | "New" pulse highlights newly-arrived comments for ~2s | MOCKUP | CSS animation; can demonstrate without real-time |
| 4.6 | Notification chip in brand bar when comment arrives off-screen | MOCKUP | Static demo notification can be rendered |
| 4.7 | Comment threading — reply to a comment (private composer per replier) | MOCKUP | Pure UI extension; same private-composer pattern |
| 4.8 | Two-level threading max (entry → comment → reply) | MOCKUP | Same; just a depth cap |
| 4.9 | Edit comment with edit-tracking | BUILD | CoC discipline; needs versioning |
| 4.10 | Withdraw comment (visible strike-through, not hard delete) | BUILD | CoC discipline; comments are evidentiary |
| 4.11 | `meeting.comment_added` CoC event | BUILD | Backend |

> **Same private-composer principle applies.** Each commenter has their own composer, private to them, until they hit Send. The Send click is the commit gesture. Replies follow the same pattern — the reply composer is private to the replier until they Send.

---

## 5 · Comment density management

| # | Feature | Verdict | Note |
|---|---|---|---|
| 5.1 | 0 comments → just "💬 add comment" affordance | DONE | Pre-existing |
| 5.2 | 1-2 comments → auto-expanded | DONE | Pre-existing |
| 5.3 | 3+ comments → auto-collapsed with summary | MOCKUP | Small extension to existing comment renderer |
| 5.4 | Click to expand collapsed thread | MOCKUP | Same |
| 5.5 | Expand/collapse state stays local (does not propagate) | BUILD | Real-time semantics |

---

## 6 · Control handoff

| # | Feature | Verdict | Note |
|---|---|---|---|
| 6.1 | "Request control" button visible when subscribed | MOCKUP | Static button in subscribed-mode UI |
| 6.2 | Driver receives non-modal "X is requesting control" notification | MOCKUP | Static notification chip can be rendered |
| 6.3 | Grant transfers driver-state to requester | BUILD | Real-time state ownership |
| 6.4 | Driving indicator visible to all attendees ("Driving: Vaughn S") | MOCKUP | Static badge in brand bar |
| 6.5 | Subscriptions auto-transfer to new driver | BUILD | Real-time orchestration |
| 6.6 | Driver pan/zoom on attached image propagates to subscribers | BUILD | Real-time state sync |
| 6.7 | Markup/annotations during control turn write to CoC | BUILD | Annotation event-sourcing |
| 6.8 | Annotations are permanent, not ephemeral | BUILD | CoC discipline |
| 6.9 | "Return control" reverts driver to original | BUILD | Real-time orchestration |
| 6.10 | `meeting.control_granted` and `meeting.control_returned` CoC events | BUILD | Backend |

---

## 7 · Contextual recall

| # | Feature | Verdict | Note |
|---|---|---|---|
| 7.1 | Click a Thread History entry | DONE | v2l/v3a |
| 7.2 | Clicking entry auto-pops linked visual in Image Canvas | MOCKUP | linkedVisual data structure already exists in entries; just wire the click |
| 7.3 | Visual carries its annotation overlays from the original capture moment | BUILD | Annotation slider; deeper architectural work |
| 7.4 | Empty-state if entry has no linked visual | MOCKUP | Trivial UI state |
| 7.5 | Multi-visual entries: "1 of 3" navigation | MOCKUP | Small extension |
| 7.6 | Retroactive visual attachment writes `meeting.entry_visual_linked` | BUILD | CoC discipline |

---

## 8 · Real-time action item creation

| # | Feature | Verdict | Note |
|---|---|---|---|
| 8.1 | Action tag opens assignment composer (assignee + due) — private to operator | DONE | v3a; composer is local-state per operator |
| 8.2 | Assignee dropdown populated from attendees + resource directory | DONE | v3a |
| 8.3 | Due-date defaults to "+1 week" with editable options | DONE | v3a |
| 8.4 | Confirm click is the commit gesture for the action item | DONE | v3a (mock; metadata in body suffix) |
| 8.5 | On Confirm, structured event propagates atomically | BUILD | Real-time channel; same pattern as §3.3 |
| 8.6 | Action item propagates to assignee's Compass calendar | BUILD | Cross-module integration |
| 8.7 | Action item appears on assignee's task list | BUILD | Cross-module integration |
| 8.8 | Stakes-aware notification routing on assignment | BUILD | Notification framework + stakes routing |
| 8.9 | Action reassignable mid-meeting (open composer on existing action entry) | MOCKUP | UI extension; private-composer principle still applies |
| 8.10 | Reassignment after meeting close requires new action with reference | BUILD | CoC discipline |
| 8.11 | `meeting.action_item_assigned` CoC event | BUILD | Backend |

> **Action assignment composer follows the same private-composer pattern.** The operator opens the composer, picks assignee + due locally, and only on Confirm does the structured action item propagate.

---

## 9 · Action items review pivot — *the section operator just flagged*

| # | Feature | Verdict | Note |
|---|---|---|---|
| 9.1 | Filter affordance in Live Capture stream tab row | MOCKUP | Filter-chip row beneath stream tabs |
| 9.2 | Filter by tag (note/decision/action/risk/question) | MOCKUP | All data already in entries |
| 9.3 | Filter by status (overdue / due-this-week / new-this-meeting / open / complete) | MOCKUP | Need to seed status into action-item entries |
| 9.4 | Filter by assignee (me / specific / anyone) | MOCKUP | Assignee data exists in v3a action items |
| 9.5 | Filter by stakes (any / med+ / high only) | MOCKUP | Stakes data exists in v3a |
| 9.6 | Sort actions by status (overdue first → due soon → just assigned) | MOCKUP | Pure JS sort over filtered list |
| 9.7 | Visual urgency cues (🔴 overdue / ⚠ due / ✏ new) | MOCKUP | CSS + status field |
| 9.8 | Filter selection propagates via LIVE CONNECT | BUILD | Real-time state sync |
| 9.9 | Filter+sort applies in both Capture-this-meeting and Thread-history tabs | MOCKUP | Same renderer pattern, applied to both streams |

---

## 10 · The detach-and-explore moment

| # | Feature | Verdict | Note |
|---|---|---|---|
| 10.1 | "× Disconnect" option in LIVE CONNECT dropdown when subscribed | DONE | v3a |
| 10.2 | Disconnection retains audio + presence + meeting context | BUILD | Session-state semantics |
| 10.3 | View lands at last shared frame on disconnect | BUILD | Real-time orchestration |
| 10.4 | Free navigation while still in meeting (Living Document, attachments) | BUILD | Already possible per surface; no special work |
| 10.5 | "Host — let others connect to you" option | MOCKUP | Add to LIVE CONNECT dropdown, mock target |
| 10.6 | Subscribers receive notification when someone offers host-mode | MOCKUP | Static notification chip |
| 10.7 | Switch / Ignore on host-mode offer | MOCKUP | Two-button notification |
| 10.8 | Host-mode release reverts subscribers (or prompts re-subscribe) | BUILD | Real-time orchestration |

---

## 11 · Departure cascade

| # | Feature | Verdict | Note |
|---|---|---|---|
| 11.1 | Attendee disconnect fades green dot to gray on others' views | BUILD | Real-time presence |
| 11.2 | END MEETING transitions meeting status to `completed` | BUILD | Backend state |
| 11.3 | Uncommitted captures/comments commit on END MEETING | BUILD | Uncommitted/Committed pattern; CoC |
| 11.4 | PDF generation pipeline begins on END MEETING | BUILD | Async pipeline |
| 11.5 | Post-meeting presence distinction (hollow ring vs filled dot) | MOCKUP | CSS state on attendee-status class |

---

## 12 · Async publication

| # | Feature | Verdict | Note |
|---|---|---|---|
| 12.1 | Notification chip when minutes ready | MOCKUP | Static notification rendered in brand bar |
| 12.2 | Click chip opens Minutes tab | DONE | v3a (Minutes tab exists; chip routing trivial) |
| 12.3 | Minutes tab shows series-level archive, newest first | DONE | v3a |
| 12.4 | Per-row: date · weekday · meeting # · pages · size · hash · actions | DONE | v3a |
| 12.5 | "Just published" marker + amber-tinted background on freshest row | DONE | v3a |
| 12.6 | View opens PDF in lightbox or new tab | MOCKUP | Trivial: stub button to open about:blank or static placeholder |
| 12.7 | Hash-integrity verification (continuous) | BUILD | Backend; CoC alert on drift |
| 12.8 | PDF generation 30-min after END MEETING with override | BUILD | Async pipeline |
| 12.9 | PDF content: cover, agenda, decisions/risks with stakes, action items, embedded annotated visuals, footer hash | BUILD | PDF template engine |
| 12.10 | Regeneration produces new versioned hash; original preserved | BUILD | CoC versioning discipline |

---

## Summary at a glance

**By verdict (rev 2 counts):**

| Verdict | Count | What it means |
|---|---|---|
| **DONE** | ~27 features | Already in v3a prototype |
| **MOCKUP** | ~31 features | Should be added to prototype before build commissioning |
| **BUILD** | ~40 features | Defer to production implementation |

> Counts shifted modestly between rev 1 and rev 2: the private-composer principle reframed several previously-BUILD items as DONE-by-default (the composer being browser-local is not work to be done, it's the existing default). Section 3 in particular dropped one BUILD item.

**Mockable next-iteration candidates (from the MOCKUP column above), ranked by leverage:**

1. **§9 filter + sort affordance** — operator-flagged; demonstrates the action-items-review-pivot meaningfully; touches data already in the prototype (~2-3 hours)
2. **§7.2 visual-recall on entry click** — demonstrates contextual recall, the most evocative single behavior in the walkthrough; data structure exists (~1-2 hours)
3. **§4.6/4.7 two-level comment threading** — small UI extension that demonstrates dialogic depth (~1.5 hours)
4. **§5.3/5.4 comment density auto-collapse** — pairs with #3; shows the dense-discussion management pattern (~1 hour)
5. **§10.5 Host-mode option in LIVE CONNECT dropdown** — single new menu item; demonstrates the temporary-host-handoff pattern (~30 min)
6. **§1.4 Presence ticker on join** — demoable with a setTimeout for visual demonstration (~30 min)
7. **§3.4 Author initials chip on captures** — visual signal that propagated captures have distinct authorship (~30 min)
8. **§8.8 Reassign action mid-meeting** — open the composer on an existing action entry (~1 hour)
9. **§12.1 / §12.6 Minutes notification + View action** — two small UX completions on the Minutes flow (~1 hour)

Total mockable next-iteration work: **roughly 9-12 hours** spread across 9 small features. Could be sequenced as one or two more prototype iterations (v3b, v3c).

**Build-only complexity hotspots** (where the BUILD count clusters):

- **§6 Control handoff** — 8 of 10 features are BUILD (real-time state ownership + sync)
- **§11 Departure cascade** — 4 of 5 features are BUILD (real-time presence + Uncommitted/Committed commit)
- **§12 Async publication** — 6 of 10 features are BUILD (async pipeline + PDF engine)
- **§8 Action items** — 5 of 10 features are BUILD (cross-module integration)

These are the sections where build sequencing should pay closest attention to dependency ordering. A reasonable build-phase pre-question per section: *"what's the shortest path to making this section of the walkthrough work end-to-end on real data?"*

---

## How I'd recommend reading this

The MOCKUP column tells you the **shortest path to a vision-complete prototype** — what's left to make the prototype faithful to the scenario walkthrough. Roughly 9-12 hours of work to clear that column entirely.

The BUILD column tells you the **shape of the architecture brief that comes next** — every BUILD row is something the brief needs to specify. Most cluster around a few themes: real-time channel architecture, CoC event vocabulary, Uncommitted/Committed pattern adoption, cross-module integration contracts, async pipelines.

The DONE column is the prototype's accumulated coverage — substantial, but not the whole vision.

— End of roadmap —
