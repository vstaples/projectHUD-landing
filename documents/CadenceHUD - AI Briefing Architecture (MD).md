# AI Intelligence Briefing
## Architecture Document — CadenceHUD Session 10
**Apex Consulting Group · ProjectHUD · Confidential**
*March 23, 2026*

---

## 1. Purpose & Strategic Rationale

The AI Intelligence Briefing transforms CadenceHUD from a workflow tracker into an
intelligence platform. Where the deterministic briefing assembles facts, the AI briefing
produces judgment — a conclusion-first narrative that tells the PM what the situation
means, what caused it, and what to do about it.

This feature is sequenced after Step Comment Threads because those threads supply four
data sources the AI needs that no competitor has:

1. **Pre-rejection confidence trajectory** — the resource's Green/Yellow/Red signal
   in the hours before a rejection, revealing whether the failure was predictable or sudden
2. **Hours actuals with narrative** — time logged with substantive commentary, enabling
   distinction between execution work and discovery work
3. **Action item status** — unresolved items, their age, and their owner's current
   workflow load
4. **Tone of rejection notes** — emotional content that signals process gaps vs.
   relationship breakdowns requiring direct PM intervention

Without Step Comments, the AI sees events. With Step Comments, the AI sees intent.

---

## 2. Technical Architecture

### 2.1 What Gets Built

**New section in the briefing modal** — `✦ AI Narrative` — inserted between the stat
tiles and the Workflow Timeline. The reader gets the conclusion first, then the supporting
data below it.

**Streaming display** — the narrative streams token by token into the briefing panel
using the Anthropic API's streaming response. A blinking cursor indicates generation
in progress.

**Regenerate button** — appears after first generation. Produces a fresh narrative.
Clicking it clears the cached version and re-runs the prompt.

**DB caching** — `briefing_narrative` and `briefing_generated_at` columns on
`workflow_instances`. On re-open, shows cached narrative with timestamp and a
"Regenerate" button. Fresh generation overwrites the cache.

**Graceful fallback** — if the API call fails, the section does not render. The
rest of the deterministic briefing is unaffected.

**Model** — `claude-sonnet-4-20250514` via the existing `/api/ai-draft` endpoint
pattern already established in cadence.html.

### 2.2 DB Migration

```sql
ALTER TABLE workflow_instances
  ADD COLUMN IF NOT EXISTS briefing_narrative    TEXT,
  ADD COLUMN IF NOT EXISTS briefing_generated_at TIMESTAMPTZ;
```

### 2.3 The Prompt Assembler

The prompt is constructed from all data already available in `_selectedInstance`:

```
You are a project intelligence analyst embedded in a workflow management system.
Analyze this workflow instance and produce a concise professional briefing.

WORKFLOW: {template_name}
STATUS: {status} — Step {current_step} of {total_steps} active
PRIORITY: {priority}
STAKES: {stakes_text}
ELAPSED: {elapsed_time} of {pert_likely}d estimated

PERT ESTIMATE:
  Optimistic: {pert_opt}d  Likely: {pert_likely}d  Pessimistic: {pert_pess}d
  Variance: ±{sigma}d — {variance_assessment}

REWORK ANALYSIS:
{for each step with rework_count > 0}
  - {step_name}: {rework_count}x rework
    Most recent rejection note: "{last_rejection_note}"
{end}

CONFIDENCE TRAJECTORY (pre-rejection signals):
{for each step with confidence comments}
  - {step_name}: {confidence_trajectory} over {hours}h before rejection
    Resource comment: "{last_comment_before_rejection}"
{end}

HOURS ACTUALS:
{for each step with hours logged}
  - {step_name}: {total_hours}h logged across {comment_count} entries
    Work pattern: {execution|discovery} (confidence {stable|degrading})
{end}

OPEN ACTION ITEMS ({count} total):
{for each open action item}
  - "{title}" — Owner: {owner_name}, Age: {days_open}d, Step: {step_name}
    Instructions: {instructions}
{end}

HUMAN NOTES (chronological, rejection moments):
{for each step_completed|rejected event with notes}
  [{timestamp}] {actor_name} — {step_name}:
  "{event_notes}"
{end}

STEP COMMENTS (confidence + work log):
{for each comment with confidence signal}
  [{timestamp}] {author_name} on {step_name} [{confidence}]:
  "{body}" {hours_logged ? — {hours}h logged : ''}
{end}

Produce a briefing with exactly these four sections:

1. SITUATION — What is this workflow, where is it now, what is the immediate context.
   2-3 sentences. Conclusion-first.

2. REWORK ANALYSIS — What the rejection pattern means. Classify as one of:
   Process Quality Failure / Dependency Failure / Human Performance Issue /
   Novel Work. Cite specific notes as evidence. 2-3 sentences.

3. RISK ASSESSMENT — What could go wrong from here. Reference PERT variance,
   open action items, and confidence signals. 2 sentences.

4. RECOMMENDED ACTION — What the PM should do right now. Specific and direct.
   No corporate filler. 1-2 sentences.

Tone: Direct. Conclusion-first. Proportional to stakes — Critical workflows
warrant urgency; Routine workflows warrant calm efficiency. No bullet points.
Prose only. No preamble.
```

### 2.4 The Four Rework Classifications

The prompt instructs the AI to classify the rework pattern into one of four types.
Each has a distinct recommended action:

**Process Quality Failure** — Same step rejected repeatedly. Notes reference
technical errors, missing information, incorrect specs. Multiple submitters,
same rejections. Root cause: insufficient step instructions. Action: update the
template before next instance.

**Dependency Failure** — Step completed correctly but reset by an upstream event.
Notes reference waiting on external input, missing prerequisite, unreleased spec.
Root cause: unmodeled dependency. Action: suspend the instance, capture the
external dependency explicitly, reactivate when resolved.

**Human Performance Issue** — One assignee, repeated rejections, escalating
approver frustration in notes. Other instances with different assignees do not
show the pattern. Root cause: capability or attention gap. Action: reassign,
have a direct conversation, do not let the workflow absorb a management issue.

**Novel Work / High Epistemic Risk** — Wide PERT variance, first or second run
of the template, diverse rejection reasons (not the same error each time), notes
show genuine uncertainty and discovery. Root cause: the work is genuinely hard
and the process is being discovered in real time. Action: extend the timeline
estimate, do not optimize the template yet — wait for three instances.

### 2.5 Stakes-Weighted Tone

The briefing tone adjusts based on the instance stakes level:

- **Critical** — Urgent register. Direct language. Escalation is assumed if
  action is not taken.
- **High** — Alert register. Clear recommendations. Time-sensitivity noted.
- **Normal** — Professional register. Measured recommendations.
- **Routine** — Calm efficiency register. Observations rather than warnings.

This prevents the AI from crying wolf on routine workflows while ensuring
critical workflows receive language proportional to the stakes.

### 2.6 Streaming Implementation

```javascript
async function generateAIBriefing(instId) {
  const inst   = _instances.find(i => i.id === instId);
  const prompt = _assembleBriefingPrompt(inst);
  const el     = document.getElementById('briefing-ai-narrative');

  el.innerHTML = '<span class="briefing-cursor">|</span>';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1000,
      stream:     true,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  let full = '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    // Parse SSE delta events
    const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
    for (const line of lines) {
      const data = JSON.parse(line.slice(6));
      if (data.type === 'content_block_delta') {
        full += data.delta.text;
        el.innerHTML = full.replace(/\n/g, '<br>') +
          '<span class="briefing-cursor">|</span>';
      }
    }
  }

  // Cache to DB
  await API.patch(`workflow_instances?id=eq.${instId}`, {
    briefing_narrative:    full,
    briefing_generated_at: new Date().toISOString(),
  });
}
```

---

## 3. Competitive Analysis

### 3.1 Current Landscape

Every major PM tool has added AI in the past 18 months. Without exception, they
have made the same mistake: they summarize the status data that is already visible
on screen. That is not intelligence — it is noise with better formatting.

| Capability | Jira | Monday | Asana | Smartsheet | MS Project Copilot | CadenceHUD |
|---|---|---|---|---|---|---|
| Summarizes status data | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Analyzes rejection patterns | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Synthesizes human notes at rejection | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Pre-rejection confidence trajectory | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Classifies root cause (4 types) | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Hours actuals narrative | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Action item status in briefing | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Recommended action (not summary) | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Stakes-weighted tone | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

### 3.2 Why the Gap Is Structural, Not Incremental

Jira, Monday, and Asana can add rework analysis. They cannot add confidence
trajectory analysis because they do not have confidence signals. They cannot
add hours-actuals narrative because their time tracking lives in a separate tool
(Tempo, Harvest) with no semantic connection to workflow state. They cannot
synthesize rejection notes because their comment systems are flat and not
step-scoped.

CadenceHUD's advantage is not the AI model. Both use Claude or GPT-4. The
advantage is the data model — a single system where workflow events, human
signals, time actuals, and action items all exist in one place, semantically
connected, ready for the AI to reason over.

The competitors would need to rebuild their data models to close this gap.
That is a 2-3 year project, not a feature sprint.

---

## 4. Next-Generation Capabilities

### 4.1 Original Six (from Session 8 Architecture)

The following capabilities were identified in the original External Response
Endpoint architecture document and remain valid:

1. **Cross-Instance Pattern Memory** — after N instances, briefing gains
   historical context about template-level rejection patterns
2. **Predictive Completion** — probability-weighted completion date from
   current trajectory and historical data
3. **Stakeholder-Tuned Voice** — PM / Manager / Executive tiers (Morning Brief)
4. **Automatic Lessons Learned** — structured post-completion record
5. **Anomaly Detection** — statistical flags when step dwell time is unusual
6. **The Briefing as Institutional Memory** — searchable corpus of past briefings

### 4.2 Six Additional Capabilities (unlocked by Step Comments)

**7. The Confidence-to-Rejection Predictor**

After sufficient instances, the AI learns the statistical signature of an
impending rejection from confidence trajectory alone — before it happens.
A resource going Green → Yellow → Red over 48 hours on an approval step,
combined with no hours logged in 24 hours, becomes a predictive pattern:

"Resource confidence on Approval: Design Review has degraded over 48 hours
with no progress logged. Historical pattern on this template suggests 73%
probability of rejection within 24 hours. Recommend PM check-in before
the next submission."

This is the difference between a rearview mirror and a windshield. CadenceHUD
becomes the first PM tool that tells you what is about to happen.

**8. Action Item Backlog Intelligence**

The briefing reasons about unresolved action items — not just their existence,
but their age, owner accountability, and relationship to the current blocker:

"4 open action items on this instance. Two are assigned to the same resource
currently blocking the Approval step. The oldest is 6 days unresolved. This
suggests the blocker may be systemic — the resource may be overallocated."

**9. Hours Actuals Narrative**

The AI distinguishes execution work from discovery work based on the
hours-logged comment pattern:

Execution work: hours logged steadily, confidence stable, notes routine.
Discovery work: hours logged with degrading confidence, notes increasingly
detailed and questioning. The work pattern suggests the step was launched
prematurely — the preconditions were not yet met.

**10. Cross-Instance Resource Intelligence**

When the same resource appears across multiple active instances:

"Vaughn W. Staples is the active assignee on 4 instances simultaneously.
Confidence signals: 2 green, 1 yellow, 1 red. The red signal is on the
highest-stakes instance. This resource may be at capacity — consider
reassignment on lower-priority instances."

Portfolio-level resource intelligence generated from micro-level signals.

**11. Tone Calibration from Rejection Notes**

Measured and specific rejection notes suggest a process quality issue.
Frustrated or escalating notes suggest a relationship breakdown requiring
direct PM intervention. The AI detects this and adjusts the recommendation:

"The rejection notes on this step show an escalating pattern of frustration
over 6 cycles. This may indicate a communication gap between the submitter
and the approver beyond the technical issue. Consider a direct conversation
before the next submission cycle."

No PM tool has ever read the emotional content of rejection notes and
translated it into a management recommendation.

**12. The Briefing as Institutional Memory**

After a workflow instance completes, its briefing becomes a permanent,
searchable record. Over hundreds of instances:

"The last three times this template ran with a new engineering resource,
the Approval step averaged 14 rejections. Root cause in all three cases:
drawing standard unfamiliarity. Recommend: add a drawing standards
checklist to the step instructions."

The system learns from its own history. Each completed briefing informs
the next recommendation.

---

## 5. The Revised North Star Statement

The original north star: *"The briefing isn't a summary. It's a recommendation."*

That remains true. Step Comments allow a more precise formulation:

**The AI Intelligence Briefing is the first PM tool that reasons over both
the organizational record (what happened) and the human record (what people
thought was happening while it was happening) — and produces a recommendation
that accounts for both.**

The organizational record is the Chain of Custody.
The human record is the step comment thread.
The AI holds both simultaneously and produces judgment that neither alone
could support.

No competitor has the human record. Several have the organizational record.
CadenceHUD is the only platform where both exist in a single data model,
in a form the AI can reason over directly.

---

## 6. Implementation Sequence

| Step | Task |
|------|------|
| 1 | SQL migration — add briefing_narrative + briefing_generated_at to workflow_instances |
| 2 | Build _assembleBriefingPrompt() — constructs prompt from all instance data |
| 3 | Add AI Narrative section to briefing modal UI (above Workflow Timeline) |
| 4 | Implement generateAIBriefing() with streaming display |
| 5 | Wire Generate button + loading state |
| 6 | Cache narrative to DB on completion |
| 7 | Wire Regenerate button — clears cache, re-runs |
| 8 | Show cached narrative on re-open with timestamp |
| 9 | Graceful fallback if API unavailable |
| 10 | Stakes-weighted tone enforcement in prompt |

---

*CadenceHUD · ProjectHUD · Confidential*
*Apex Consulting Group · Session 10 · March 23, 2026*
