# External Response Endpoint — Complete Architecture
## CadenceHUD · ProjectHUD · Confidential
**Document Version:** 1.0  
**Date:** March 23, 2026  
**Session:** CadenceHUD Session 8  
**Status:** Approved for Build  

---

## 1. Executive Summary

The External Response Endpoint enables workflow step assignees — including external
participants who have no CadenceHUD account — to approve, reject, or request changes
on a workflow step directly from an email notification. A single click routes them to a
minimal, branded response page. Their action writes a full Chain of Custody (CoC) event,
advances the routing engine, and notifies the PM — all without login.

This capability transforms the existing email notification system from a passive alert
into an active decision surface. For external clients, vendors, and regulatory contacts,
it eliminates the account barrier entirely. For internal assignees, it provides a
friction-free path for simple approvals that don't require opening the full application.

---

## 2. What Currently Exists

The `_notifyStepActivated` function fires when a workflow step is assigned. It calls the
`notify-step-activated` Supabase Edge Function with a payload containing:

- `instance_id`, `instance_title`, `template_name`
- `step_id`, `step_name`, `step_type`
- `assignee_name`, `assignee_email`
- `due_days`, `due_type`
- `launched_by`

The Edge Function sends a notification email via Resend. The email contains step context
but **no action capability** — the recipient must log into CadenceHUD to respond.

The `submitComplete` function in cadence.html is the workflow routing engine — a ~150-line
function that writes `step_completed` CoC events, evaluates outcome definitions
(`requiresReset`, `requiresSuspend`), triggers `step_reset` and `step_activated` events,
and calls `_notifyStepActivated` for the next step. This engine currently lives entirely
in the authenticated browser session.

**The gap:** There is no path for an email recipient to trigger this engine without
logging in.

---

## 3. Competitive Analysis

| Tool | External Response Capability | Critical Gap |
|------|------------------------------|--------------|
| **DocuSign** | One-click sign via tokenized link — industry gold standard | Single action only. No outcome branching, no workflow routing, no CoC beyond signature. |
| **Adobe Sign** | Same model as DocuSign | Same limitations. |
| **Process Street** | Guest link to full checklist — no login required | No outcome branching. Guest sees entire checklist. No CoC audit trail. |
| **Jira Service Management** | Email reply can transition tickets | Fragile — parses email body text. No structured outcome selection. Breaks on forwarding. |
| **ServiceNow** | Approval emails with Approve/Reject buttons — closest competitor | Enterprise-only. Requires approver in ServiceNow identity model. No truly external participant path. |
| **Asana** | Email notifications only | No response action from email whatsoever. |
| **Monday.com** | Approval automations — in-app only | External approvers must have guest accounts. No zero-login token model. |
| **TasksLink** | No-login external checklist completion | No outcome branching, no CoC, no routing engine behind it. |

**The industry ceiling:** ServiceNow's approval email buttons are the most complete
implementation in enterprise software today — but require the approver to exist in the
ServiceNow identity model. No current tool combines: zero-login access + outcome
branching + compliance-grade CoC + workflow routing engine awareness.

**CadenceHUD's position:** The first workflow platform to offer a tokenized, outcome-aware,
notes-enforcing external response that writes to a compliance-grade audit trail and
advances a full routing engine.

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Component 1: Token Generator                            │
│  Location: cadence.html — inside _notifyStepActivated   │
│  Action: Generates signed token, writes to              │
│          external_step_tokens table                     │
│  Passes: tokenized approve/reject URLs to Edge Function  │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Component 2: Email Template Upgrade                     │
│  Location: notify-step-activated Edge Function           │
│  Action: Adds HTML Approve / Reject / Change Request    │
│          buttons to email body                          │
│  Logic: Buttons rendered only for approval, signoff,    │
│         review step types                               │
└───────────────────────┬─────────────────────────────────┘
                        │ (recipient clicks button)
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Component 3: approve.html                               │
│  Location: New Vercel static page — zero auth required   │
│  Action: Reads token from URL param                     │
│  Calls: GET /functions/v1/get-step-context?token=xxx    │
│  Renders: Step name, instructions, outcome buttons,     │
│           notes field                                   │
│  Posts to: /functions/v1/respond-step                   │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Component 4: respond-step Edge Function                 │
│  Action: Validates token (exists, unused, unexpired,    │
│          HMAC valid, firm_id matches)                   │
│          Marks token consumed                           │
│          Writes step_completed CoC event                │
│          Runs routing engine (reset/activate next step) │
│          Sends PM notification email                    │
│          Returns confirmation to approve.html           │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Token Security Architecture

Each token is designed to be:

**Single-use** — consumed on first response, permanently invalidated. Replaying the token
after use returns a "already submitted" state with the confirmation details, not an error.

**Expiring** — configurable TTL (default 30 days). Hard-expired after use or timeout.

**Step-scoped** — cryptographically bound to a specific `(firm_id, instance_id, step_id)`
tuple using a HMAC signature. A token from one step cannot be replayed against another.

**Firm-scoped** — RLS-aware. Cross-firm token replay returns 403 with no data leakage.

**Generated with:** `crypto.randomUUID()` + HMAC binding to the step context tuple.
Tampering with the token or its URL parameters is detectable and rejected.

### Token Lifecycle States

| State | User Experience |
|-------|----------------|
| **Valid** | Response page renders normally |
| **Already used** | "This link has already been used. Your response: [outcome] was recorded on [date]." |
| **Expired** | "This link has expired. Please contact [PM name] to request a new one." |
| **Invalid / tampered** | "This link is not valid." — No information leakage about what was attempted. |

---

## 6. Response Page Design — approve.html

`approve.html` is not a CadenceHUD page. It is a **client-facing artifact**. It should
feel like receiving a DocuSign — clean, focused, professional. The external participant
sees only what they need to make their decision.

### What the recipient sees:
- Firm name and logo
- Step name and instructions
- Workflow context (instance title, template name — sanitized, no internal notes)
- Outcome buttons (mirroring the step's configured outcomes, not hardcoded Approve/Reject)
- Notes field (required on rejection, optional on approval)
- "Submit Response" button

### What the recipient does NOT see:
- Internal CoC history
- Other workflow steps
- Rejection counts or rework analysis
- PERT estimates or stakes text
- Any other firm operational data

### Three interaction modes:

**Mode 1 — Direct approval from email button**
Recipient clicked Approve in email → lands on approve.html in confirmation state.
Shows: *"You are approving [step name]. Add an optional note:"* Notes optional.
Submit button reads "Confirm Approval."

**Mode 2 — Rejection / Change Request from email button**
Recipient clicked rejection button in email → lands on approve.html with outcome
pre-selected. Notes field is prominent, labeled: *"Please describe what needs to change
(required):"* Cannot submit without notes. This enforces the same rule as submitComplete
internally: `if (outcomeDef?.requiresReset && !notes) { return; }`

**Mode 3 — Full response via "View Details" link**
Recipient clicked the details link → full context visible, all outcomes available, notes
present for all outcomes. For participants who want to review context before deciding, or
who want to leave detailed notes even on an approval.

### Confirmation Screen (post-submission):
> *"Your response has been recorded."*
> *"Approved · March 23, 2026 · 9:47 AM"*
> *"Reference: [token ID truncated]"*

If the link is clicked again after submission:
> *"This response has already been submitted."*
> *"Your response: Approved was recorded on March 23, 2026 at 9:47 AM."*

---

## 7. Email Template Design

The upgraded `notify-step-activated` email includes HTML action buttons that render
correctly in Gmail, Outlook, and Apple Mail:

```
┌─────────────────────────────────────────┐
│  You have been assigned a step          │
│  Design Review Signoff · Flexscope      │
│                                         │
│  Instructions: Review attached drawing  │
│  and confirm all notes are addressed.   │
│                                         │
│  Due: March 26, 2026 (3 days)           │
│                                         │
│  ┌──────────────┐  ┌──────────────────┐  │
│  │  ✓ APPROVE   │  │  ✗ REQUEST CHANGES│ │
│  └──────────────┘  └──────────────────┘  │
│                                         │
│  Or view full details →                 │
└─────────────────────────────────────────┘
```

**Button behavior:**
- **Approve** → direct one-click submission (no notes required)
- **Request Changes / Reject** → routes to approve.html with outcome pre-selected,
  notes field required before submission
- **View full details** → routes to approve.html in full context mode

**Conditional rendering:** Action buttons appear only for step types where external
response is meaningful: `approval`, `signoff`, `review`. Action and form steps render
the notification email only.

---

## 8. CoC Record — What Gets Written

The external response writes to two places simultaneously:

### external_step_tokens table (response metadata):
```
token_generated_at    — when the token was minted
token_sent_at         — when the email was dispatched
opened_at             — first GET to approve.html
used_at               — when the POST was received
outcome               — what they chose
response_notes        — what they wrote
ip_address            — where the response came from
user_agent            — browser/client signature
```

### workflow_step_instances (CoC event):
Identical structure to an internal completion — the CoC cannot distinguish external
from internal except by the additional metadata fields.

Actor attribution: *"Carlos Reyes · c.reyes@apex.com · Rejected · Mar 23, 9:47 AM"*

The `event_notes` field carries the participant's explanation verbatim — available to
the Intelligence Briefing, the Morning Brief, and the AI narrative generator.

---

## 9. PM Notification on External Response

The moment `respond-step` processes a response, the PM receives an email:

> *"[External Response] Carlos Reyes approved 'Client Sign-Off: Leak Seal Mitigation'
> — Mar 23, 9:47 AM. The workflow has advanced to step 4: Final Review."*

On rejection:
> *"[External Response] Carlos Reyes requested changes on 'Client Sign-Off: Leak Seal
> Mitigation' — Mar 23, 9:47 AM.*
>
> *Their note: 'The drawing references Rev C of the flange specification but our
> engineering team has superseded that with Rev D following the torque testing failure
> last month. All downstream documents must reference Rev D.'"*

---

## 10. Database Schema

```sql
CREATE TABLE IF NOT EXISTS external_step_tokens (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id               UUID NOT NULL,
  instance_id           UUID REFERENCES workflow_instances(id) ON DELETE CASCADE,
  template_step_id      UUID NOT NULL,
  token                 TEXT UNIQUE NOT NULL,
  token_hmac            TEXT NOT NULL,
  assignee_email        TEXT NOT NULL,
  assignee_name         TEXT,
  outcomes_json         JSONB NOT NULL,  -- snapshot of step outcomes at token generation
  step_name             TEXT,
  step_instructions     TEXT,
  instance_title        TEXT,
  template_name         TEXT,
  pm_email              TEXT,
  pm_name               TEXT,
  expires_at            TIMESTAMPTZ NOT NULL,
  generated_at          TIMESTAMPTZ DEFAULT now(),
  sent_at               TIMESTAMPTZ,
  opened_at             TIMESTAMPTZ,
  used_at               TIMESTAMPTZ,
  outcome               TEXT,
  response_notes        TEXT,
  ip_address            TEXT,
  user_agent            TEXT
);

CREATE INDEX IF NOT EXISTS idx_external_step_tokens_token
  ON external_step_tokens (token);

CREATE INDEX IF NOT EXISTS idx_external_step_tokens_instance
  ON external_step_tokens (firm_id, instance_id);
```

**RLS Policy:**
```sql
-- Tokens are read/written only by service role (Edge Functions)
-- No direct client access — all token operations go through Edge Functions
ALTER TABLE external_step_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only"
  ON external_step_tokens
  USING (false)  -- blocks all direct client access
  WITH CHECK (false);
```

---

## 11. Build Sequence

| Step | Component | Location | Dependency |
|------|-----------|----------|------------|
| 1 | DB migration — `external_step_tokens` table | Supabase SQL Editor | None |
| 2 | Token generator | cadence.html — inside `_notifyStepActivated` | Step 1 |
| 3 | Email template upgrade | `notify-step-activated` Edge Function | Step 2 |
| 4 | `get-step-context` Edge Function | Supabase Edge Functions | Step 1 |
| 5 | `approve.html` | Vercel — new static page | Step 4 |
| 6 | `respond-step` Edge Function | Supabase Edge Functions | Steps 1, 4, 5 |

---

## 12. Routing Engine Parity

The `respond-step` Edge Function must replicate the routing logic of `submitComplete`
server-side:

```
IF outcome.requiresSuspend → suspend instance
ELSE IF routeTargetId → explicit route: reset intervening steps, activate target
ELSE IF outcome.requiresReset → implicit reset: reset all steps to first, activate first
ELSE → advance to next step in sequence_order
   IF no next step → mark instance complete
```

This ensures the external response is a first-class workflow event — indistinguishable
from an internal completion from the perspective of the CoC and the routing engine.

---

## 13. Compliance Record

For regulated industries — FDA submissions, ISO audits, contract disputes — the
`external_step_tokens` table provides an evidentiary record that goes beyond what any
current PM tool offers:

- **Cryptographic binding** of the token to the specific step and firm
- **Timestamp chain:** token generated → email sent → link opened → response submitted
- **IP address and user agent** of the responding device
- **Immutability:** tokens are append-only; no UPDATE path on `used_at`, `outcome`, or
  `response_notes` once written
- **Verbatim preservation** of the participant's notes — no paraphrasing, no summarization

The difference between *"we believe Carlos approved this"* and *"here is the
cryptographically timestamped record of the approval including the IP address of the
device used"* is the difference between an assertion and evidence.

---

## 14. Future Enhancements

**File attachment on rejection** — Allow the external participant to attach a marked-up
document when requesting changes. File stored in Supabase Storage, linked to the CoC event.

**Multi-step external sequences** — A series of steps all assigned to the same external
participant, presented as a sequential flow within a single approve.html session.

**E-signature capture** — For regulatory contexts requiring formal signature, integrate
a canvas-based signature field. Signature image stored with the CoC record.

**Audit export** — A PM-triggered export of all external response records for a given
workflow instance, formatted as a compliance-ready PDF.

**Reminder cadence** — Configurable automated reminder emails (default: 3 days, then 7
days, then escalate to PM) if the external step is not completed. Reminder count tracked
in `external_step_tokens`.

---

*CadenceHUD · ProjectHUD · Confidential · Session 8 · March 23, 2026*
*Apex Consulting Group*

---

## 15. Rework Intelligence — Technical & Strategic Addendum

*Added Session 8 · March 23, 2026*

### Technical Architecture of the Replay Scrubber

The scrubber is not a video playback. It is a **bitemporal state machine** — at any scrubber position, `instScrubChange(val)` snapshots all CoC events up to that timestamp, recomputes complete node state (complete/active/rejected/reset/pending) from scratch, re-renders the canvas, and surfaces the human note for that exact event.

This works because CadenceHUD stores every state transition as an immutable append-only log — never mutating current state, only appending new events. The system can answer "what did this workflow look like at 9:47 PM on March 22?" with complete accuracy. This is the same architectural principle that makes financial ledgers auditable.

The rejection arc sources from `step_completed` events with `requiresReset: true` — not from `step_reset` events. This means the arc represents a human decision (the rejection), not the mechanical consequence (the reset). The arc is causal, not procedural.

### Competitive Gap

| Tool | Rework Visibility | Replay | Human Notes in Context |
|------|-------------------|--------|----------------------|
| Jira | Flat activity log | None | Comments scattered, no workflow context |
| Monday.com | Activity feed | None | Updates on items, no CoC |
| Asana | Task history | None | Comments on tasks only |
| ServiceNow | Tabular audit trail | None | Approval notes on records |
| Process Street | Step completion log | None | Notes per step, no visual synthesis |
| MS Project | Baseline vs actual | None | No notes concept |
| **CadenceHUD** | **Visual DAG + weighted rejection arcs** | **Full bitemporal scrubber** | **Synchronized note at each event** |

The gap is categorical, not incremental. Every competitor shows a log. CadenceHUD shows a story.

### Planned Enhancements

**Velocity encoding on scrubber track** — dots spaced proportionally to calendar time between events. See at a glance where the workflow stalled.

**Arc animation on scrub** — when the scrubber reaches the moment a rejection arc first appears, it draws itself from source to target over ~600ms. The user watches the rework happen.

**Counterfactual path overlay** — "What would have happened if this rejection hadn't occurred?" Ghost overlay shows the hypothetical fast path with quantified schedule impact.

**Cross-instance pattern layer** — after N instances of a template, each arc gets a benchmark: "This step has a 67% rejection rate across all instances." Individual rework becomes a process quality signal, not a performance judgment.

**Confidence signal integration** — once step-level comments with confidence signals exist (🟢/🟡/🔴), the scrubber shows a second dot layer: the resource's confidence trend in the days before a rejection. The rejection becomes predictable in retrospect.

**Organizational Memory Export** — PM reviews rejection notes post-completion, annotates root causes, exports as a structured lessons-learned document. Feeds back into template step instructions.

**Time-lapse export** — the scrubber replay exported as a short video for post-mortem meetings.

---

*CadenceHUD · ProjectHUD · Confidential · Session 8 · March 23, 2026*
*Apex Consulting Group*
