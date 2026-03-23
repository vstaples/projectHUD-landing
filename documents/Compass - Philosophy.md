# Compass — Product Philosophy & Vision
**Apex Consulting Group · Confidential**
*March 24, 2026 · Session 12*

---

## The Name

**Compass.**

A compass does not tell you what happened. It tells you where you are, where you are headed, and how to get there. That is the promise of this platform — not a better report, not a smarter dashboard, but genuine operational orientation for everyone in a project-based firm, from the individual contributor asking "what do I do next" to the executive asking "are we on course."

Every other tool in the market is built around recording the past. Compass is built around illuminating the present and anticipating the future.

---

## The Core Thesis

Every project-based firm produces two parallel records of its work.

**The Organizational Record** — what happened officially. Tasks completed. Forms submitted. Approvals granted. Milestones reached. Hours logged. Invoices issued. This is what every PM tool captures.

**The Human Record** — what happened humanly. The engineer who said *"Bet he's a pleasure to have around the house."* The approver who wrote *"Wait until I find that little mother fkr."* The PM who noted *"Damn it — wrong material for port seal."* The confidence signal that went Red two days before the rejection. The decision made at 2:30 PM on a Thursday that nobody wrote down anywhere.

Every other tool captures only the organizational record. Compass captures both — and reasons over the intersection of the two.

This is the structural foundation. You cannot add human record reasoning to a tool that was never built to capture it. You have to start over. We started over.

---

## The Two Records in Practice

When a Design Review step rejects for the 28th time, the organizational record says: *rejection count = 28.*

The human record says: *26 of those rejections were system testing artifacts. 2 were substantive. The 2 substantive rejections were caused by wrong dates on finalized documentation — a template error, not a human error. Ron White is frustrated but not disengaged. The approver and Ron have a dynamic that generates friction independent of the technical work. The confidence trajectory went G → G → Y → Y → R over five days, and that trajectory was visible three days before the red signal was posted.*

A briefing built on the organizational record says: *28 rejections at Approval.*

A briefing built on both records says: *Fix the template date field. Have a direct conversation with Ron before the next submission cycle. The technical issue is resolved. The human issue is not.*

That difference — between counting events and understanding them — is the entire product.

---

## The Chain of Custody

The Chain of Custody (CoC) is the spine of Compass. Every event — task activation, step completion, rejection, reset, comment, confidence signal, time entry, resource request, decision, intervention, escalation — is written as an immutable record with full context: actor, outcome, timestamp, notes.

The CoC is not a log. It is the ground truth.

When the AI generates a briefing, it reads the CoC. When the Rework History Layer computes heat, it reads the CoC. When the timeline scrubber reconstructs the portfolio at any point in history, it reads the CoC. When the morning brief identifies an emerging pattern, it reads the CoC. When the Confidence Predictor forecasts a rejection before it happens, it reads the CoC.

The CoC means Compass never loses information. A rejection that happened 28 iterations ago is as accessible as one that happened 28 seconds ago. The system has perfect memory. The PM has perfect memory. The executive has perfect memory.

The CoC is also the moat. After two years of operation, a firm using Compass has a dataset about their own processes that no other tool has ever captured for them. That data makes the briefings smarter, the predictions more accurate, and the institutional knowledge permanent. It cannot be replicated by a competitor, and leaving the platform means leaving it behind.

---

## The Platform Architecture

Compass is a unified operational intelligence platform comprising four integrated capabilities:

**Compass · Core** — project management foundation. Tasks, milestones, Gantt, EVM, CPM/PERT, resources, risks, documents, expenditures. The execution layer.

**Compass · Pipeline** — pre-project business development intelligence. Prospect management, stakeholder mapping, discovery findings, proposal estimation (WBS → Risk Register → SOW), meeting intelligence, and the conversion of approved proposals into active projects.

**Compass · Cadence** — workflow intelligence layer. The micro-flows that underlie each project task. DAG canvas with 12 information layers. Swimlane and rework history overlays. Confidence signals. AI Intelligence Briefings. Intervention records. The human record engine.

**Compass · Timesheet** — time and people intelligence. Unified time capture across all work objects. Role-based work surfaces. Weekly review and approval. Rework cost in labor hours. The financial bridge between operational reality and executive reporting.

These four capabilities share one data model, one Chain of Custody, one Supabase instance, and one AI intelligence layer. They are lenses on the same truth, not separate tools.

---

## The Five Role Views

Compass serves five distinct audiences. Same data. Five completely different surfaces. Each one designed around the primary emotion its user needs to feel.

**The Individual Contributor** needs to feel *capable*. Their view is a unified work surface: everything assigned to them across all work types — workflow steps, project tasks, action items — in one prioritized list. Completion is a single gesture that captures time, sentiment, and notes simultaneously. The timesheet fills itself as they work. The system gets out of their way and lets them do their job.

**The Project Manager** needs to feel *in command*. Their view is a triage surface organized around urgency, not completeness. Red flags escape project boundaries and pin at the top. The live feed shows the portfolio breathing in real time. The intervention record closes the loop between "here is a problem" and "here is what I did about it and whether it worked." The morning brief arrives before they need to ask for it.

**The Manager** needs to feel *confident*. Their view is a people and process surface. The portfolio health grid shows where the organization is healthy and where it isn't — in fifteen seconds, without opening a single project. The approval queue unifies resource requests and timesheet submissions with system recommendations. The workflow intelligence tab surfaces templates with structural problems and computes the ROI of fixing them. Escalation briefs arrive pre-assembled, requiring a response, not a summary.

**The Executive** needs to feel *oriented*. Their view is a financial and strategic surface. Revenue, margin, rework cost, utilization, on-time delivery, pipeline value — all live, all trending, all connected back to the operational decisions that produced them. The morning brief synthesizes across the entire firm and delivers one specific finding: what requires executive awareness today, and what decision — if made — would produce the highest financial return. Most days the answer is: nothing requires your direct action. That signal — the all-clear — is as valuable as the alert.

**The External Stakeholder** (future) needs to feel *included*. Their view is a minimal, mobile-optimized portal. Their project's milestone status. Their pending approvals. The information their client relationship requires, without the operational detail that would overwhelm or confuse.

---

## Intelligence as a First-Class Feature

The AI Intelligence Briefing is not a nice-to-have. It is the product's primary value proposition in its most distilled form.

When a PM opens a briefing, they receive:

- **SITUATION** — where the instance is, how long it has been running, what the current state is. Conclusion first. No background.
- **REWORK ANALYSIS** — not counts, but root cause. Classification as exactly one of: Process Quality Failure / Dependency Failure / Human Performance Issue / Novel Work. Specific evidence from the human record.
- **RISK ASSESSMENT** — trajectory. The confidence signals showed Yellow → Red before three of the last five rejections. This is a predictor, not a surprise.
- **RECOMMENDED ACTION** — specific, not generic. "Convene Ron White and the approver before the next submission. The technical issue is resolved — the human issue is not."

The briefing is ruthlessly succinct. It respects the PM's time. It does not summarize — it synthesizes. There is a difference.

The same intelligence engine powers the three-tier Morning Brief:

**PM Brief (Tactical):** What is blocking today? Which instances need attention in the next 4 hours? What action items are overdue?

**Manager Brief (Strategic):** Which resources are saturated? Which workflow templates have structural bottlenecks? What decisions need management authority?

**Executive Brief (Financial):** What is the rework cost in labor hours this quarter? Which projects are trending over budget? What is the portfolio's aggregate confidence trajectory? What is the one decision that would produce the highest financial return?

Same data. Three lenses. Three audiences. Three completely different documents, delivered every morning without anyone asking for them.

---

## The Intervention Record

The intervention record is the feature that closes the most important loop in project management: the loop between "here is a problem" and "what did we do about it, and did it work?"

Every corrective action a PM takes — reassigning a resource, convening a meeting, creating an action item, changing a process — is linked to the specific signal that motivated it, timestamped, given an expected effect, and measured automatically by the system against the CoC.

When two consecutive interventions fail to resolve a signal, the system surfaces a specific recommendation: escalate. Not because the PM failed, but because the problem requires a different kind of authority. The system assembles the escalation brief automatically from the intervention record — the original signal, both interventions with outcomes, the current state, the AI's recommended management action. The PM reviews and sends. The manager receives a complete picture without a single meeting.

This is accountability without surveillance. The PM who uses the intervention record walks into every management conversation with evidence, not explanations.

---

## The Scrubber — Time Travel Through the CoC

The timeline scrubber is the proof that the CoC was the right architectural decision.

Every other feature in Compass produces intelligence from the CoC. The scrubber lets you inhabit it.

At the workflow instance level: drag to any point in time and the DAG reconstructs itself. Every step in its state at that moment. Every confidence signal. Every rework loop. The history of a single process made navigable.

At the person level: drag through a team member's week and watch their work state evolve. The moment the first yellow signal appeared. The moment the third rejection came back. The moment frustration in their comments shifted from professional to personal.

At the project level: drag back to Monday morning and watch the portfolio deteriorate across the week. The exact moment the 13th task crossed the overdue threshold. The exact moment the resource request went unanswered past 48 hours.

At the executive level: drag through the brief archive and watch the portfolio's financial health evolve week by week. The week the rework trend first appeared. The week it was first flagged. The week it crossed the threshold that should have triggered action.

The scrubber at the executive level answers the accountability question that every serious organization eventually asks: "When did we first know this was a problem, and what did we do about it?" The answer is in the system, archived, immutable, complete.

---

## Materials Intelligence

Projects generate two types of cost: labor and materials. Labor costs accrue continuously and predictably. Materials costs are lumpy, event-driven, and carry procurement lead times that labor does not.

Compass captures both.

The materials intelligence layer connects the WBS estimator's material line items to procurement status, delivery timelines, invoice actuals, and rework cost (when materials must be reordered due to design changes). It surfaces procurement dependencies before they become task blockers — "this workflow step requires PCB Layout Rev B, which is in transit with ETA March 28" — enabling proactive management rather than reactive unblocking.

The rework cost calculation includes both labor and materials rework. A design change that required a second PCB fabrication run is a material rework cost that flows into the executive's margin analysis alongside the labor rework cost from the associated workflow loops.

---

## The Estimation Intelligence Layer

After N instances of a workflow template, Compass knows how long that process actually takes compared to how long it was estimated to take. It knows the rework coefficient — how much longer the process runs on average due to rework cycles. It knows which roles were over-utilized and which were under-utilized.

The estimation intelligence layer feeds this historical data back into the WBS estimator when new proposals are created for similar scope. "Based on 14 prior Design Review instances across 3 clients, we estimate Design Review at 45 days with a 35% rework coefficient, giving a PERT range of 38-61 days at the 80th percentile."

That estimate is grounded in the firm's actual experience, not a PM's educated guess. Systematic estimation errors — which directly drive margin erosion — are corrected automatically over time.

---

## The Competitive Position

Compass is not a better project management tool. It is a different category entirely: **operational intelligence for project-based professional services firms.**

The tools it displaces — Jira, Monday, Asana, Smartsheet — track tasks. They answer "what happened" and "what is the current state." They apply AI to the organizational record only. They have never captured the human record and cannot retrofit it.

The tools adjacent to it — process mining platforms like Celonis — analyze historical event logs from ERP systems. Sophisticated, expensive, consultant-deployed, and backward-looking. Compass does what process mining does, but in real time, with human record enrichment, for firms that don't have ERP event log infrastructure.

The tools at the executive level — SAP, Oracle — capture financial outcomes without explaining them. They tell a CFO that margin is 38%. Compass tells them margin is 38% because one workflow template has a 73% own-failure rate at its approval step, that this pattern has been accumulating for four quarters, that the fix costs ¥18k and recovers ¥380k annually, and that the first morning brief where this pattern appeared was 21 days ago.

**The structural moat is threefold:**

*The data moat:* Every CoC event that accumulates is data a competitor cannot replicate. Moving to a competitor means leaving that dataset behind.

*The intelligence moat:* The AI briefings, the confidence predictor, the estimation intelligence — all get better as data accumulates. Year 2 briefings are more accurate than Year 1. Year 3 estimation intelligence is more precise. The tool compounds in value over time.

*The behavioral moat:* Workflows, approval processes, estimation templates, and escalation patterns are encoded in the system. These aren't just data — they're organizational behavior. Changing tools means rebuilding the behavioral architecture of the firm.

---

## Design Principles

**1. The diagram is an instrument, not a decoration.**
Every visual element encodes actionable meaning. If it doesn't tell someone something they can act on, it shouldn't be there.

**2. Hover before you click.**
The most important information is accessible without modal opens or page transitions. Hover reveals. Click confirms.

**3. Dwell is consent.**
1.5 seconds of sustained attention is an intentional act. Intelligence briefings and context-heavy overlays require dwell.

**4. The human record is as important as the organizational record.**
Rejection notes, confidence signals, and comment text are not noise. They are the signal. The AI that ignores them produces summaries. The AI that reads them produces judgment.

**5. Every read surface is also a write surface.**
The hover popup is an editor. The intelligence briefing is a work surface. The user never navigates away to act on what they're reading.

**6. Layers, not modes.**
Swimlane and History are overlays on the same canvas, not separate views. The PM sees more information, not different information.

**7. Ruthless succinctness.**
In briefings, in badges, in tooltips — say the essential thing. Do not pad. The PM's attention is finite. Every word that doesn't earn its place obscures something that does.

**8. Color encodes meaning, not sequence.**
Amber is active. Red is rejection/concern. Green is complete/confident. Cyan is current position. Purple is historical pressure. These colors are consistent throughout the application.

**9. Perfect memory, zero friction.**
The system never forgets. The scrubber can replay any workflow to any point in time. The PM should never need to scroll back through history to understand context.

**10. The system serves the user first.**
When the system serves the individual contributor, the organization gets richer data as a byproduct. Adoption follows value. Value follows the user's daily experience. Design the user's experience first; the organizational benefit follows automatically.

---

## The Morning Brief Vision

The three-tier Morning Brief represents Compass's ultimate expression of operational intelligence:

**PM Brief (Tactical):** What is blocking today? Which instances need attention in the next 4 hours? What action items are overdue? Which red flags are unacknowledged?

**Manager Brief (Strategic):** Which workflows have structural bottlenecks requiring process changes? Which resources are saturated? Which template has the highest ROI for redesign? What escalations require a response?

**Executive Brief (Financial):** What is the rework cost in labor hours this quarter? Which projects are trending over budget? What is the portfolio's aggregate confidence trajectory? What is the one decision available today that would produce the highest financial return?

Same data. Three lenses. Three audiences. Three completely different AI-generated documents, delivered every morning without anyone asking for them. Archived permanently. Searchable. The institutional memory of a firm, built automatically, one brief at a time.

This is the endpoint: an operational intelligence platform that tells you what you need to know before you know you need to know it.

---

*Compass · Apex Consulting Group · Confidential · March 24, 2026*
