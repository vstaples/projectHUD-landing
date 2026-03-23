# CadenceHUD — Session 8 Handoff Document
**Session 8 · March 23, 2026 · Prepared for new chat context**

---

## 1. System Overview

CadenceHUD is a workflow intelligence engine built as a single-file web application
(cadence.html) deployed on Vercel at project-hud-landing.vercel.app (also projecthud.com).
Backed by Supabase for data persistence.

**Production URL:** https://projecthud.com/cadence.html  
**Supabase Project:** dvbetgdzksatcgdfftbs.supabase.co · Firm ID: aaaaaaaa-0001-0001-0001-000000000001  
**Git Repository:** https://github.com/vstaples/projectHUD-landing.git  
**Deployment:** GitHub push → Vercel auto-deploy  

---

## 2. Session 8 Accomplishments

### 2.1 External Response Endpoint — COMPLETE ✅

The most significant feature of Session 8. Allows workflow step assignees —
including external participants with no CadenceHUD account — to approve, reject,
or request changes directly from an email notification. One click. No login.
Full Chain of Custody recorded.

**Four components built and deployed:**

**cadence.html — Token Generator (inside _notifyStepActivated)**
- Triggers for step types: approval, signoff, review, external, confirmation
- Generates crypto.randomUUID() token + SHA-256 HMAC binding to (firm_id:instance_id:step_id)
- Snapshots step outcomes at generation time
- Writes to external_step_tokens table
- Passes approve_url, reject_url, has_action_buttons, outcomes to Edge Function payload
- approve.html URL hardcoded to https://projecthud.com/approve.html
- Token failure is non-fatal — email still sends without buttons

**approve.html — External Response Page (deployed to projecthud.com)**
- Reads ?token= from URL, fetches context from external_step_tokens
- Four states: Loading → Valid form / Already used / Expired / Invalid
- Renders step's actual configured outcomes (not hardcoded Approve/Reject)
- Notes enforced as required for requiresReset outcomes
- Pre-selects outcome if ?outcome=reject in URL
- Records opened_at on first load
- Calls respond-step Edge Function on submit
- Falls back to direct CoC insert if Edge Function unavailable
- Confirmation screen with reference ID, outcome color, timestamp

**notify-step-activated Edge Function (upgraded)**
- Renders HTML Approve / Changes Requested / Reject buttons for eligible step types
- Approve button: direct submit (no notes required)
- Reject/Change buttons: route to approve.html with outcome pre-selected, notes required
- Uses APP_URL secret (not APP_BASE_URL)
- No TypeScript annotations — plain JS only (Deno runtime compatibility)
- No Unicode characters in source (caused silent boot crashes)

**respond-step Edge Function (new)**
- Validates token (exists, not used, not expired)
- Marks token consumed
- Fetches instance + template steps
- Writes step_completed CoC event
- Runs full Layer 2 routing engine (mirrors submitComplete exactly)
- Sends PM notification email via Resend
- Uses SUPABASE_SERVICE_ROLE_KEY (auto-injected) || SERVICE_ROLE_KEY (custom)
- No TypeScript annotations — plain JS only
- No Unicode characters in source

**DB Migration — external_step_tokens table**
```sql
-- Table exists with these key columns:
-- id, firm_id, instance_id, template_step_id, token, token_hmac,
-- token_hash (legacy), recipient_email (legacy), assignee_email, assignee_name,
-- outcomes_json, step_name, step_instructions, instance_title, template_name,
-- pm_email, pm_name, expires_at, generated_at, issued_at, opened_at,
-- used_at, submitted_at, outcome, outcome_notes, response_notes,
-- ip_at_open, ip_at_submit, user_agent_at_open, user_agent_at_submit

-- RLS grants required (already applied):
GRANT SELECT ON external_step_tokens TO anon;
GRANT UPDATE ON external_step_tokens TO anon;
GRANT INSERT ON workflow_step_instances TO anon;
```

**Key bugs fixed along the way:**
- step_instance_id NOT NULL constraint → ALTER COLUMN DROP NOT NULL
- assignee_user_id stored as empty string '' not null → guard updated to use .trim()
- Unicode characters (·, —, ──) in Edge Functions caused silent Deno boot crashes
- TypeScript type annotations caused silent Deno boot crashes
- SUPABASE_ prefix reserved — renamed to SERVICE_ROLE_KEY
- window.location.origin used for approve.html URL → hardcoded to projecthud.com
- anon role lacked GRANT SELECT on external_step_tokens → added explicit GRANT
- Vercel CDN cache serving stale approve.html → forced via GitHub commit

### 2.2 Realtime + Polling Auto-Refresh — COMPLETE ✅

CadenceHUD previously had no mechanism to detect external state changes.
When respond-step wrote CoC events from outside the browser, the UI stayed stale.

**Solution: dual-layer detection in cadence.html**

**Primary: Supabase Realtime WebSocket**
- Opens WebSocket to Supabase Realtime on instance selection
- Subscribes to INSERT events on workflow_step_instances filtered to active instance
- Fires _onExternalCoCEvent() immediately when respond-step writes events
- Heartbeat every 25s to keep connection alive

**Fallback: 15-second polling**
- Every 15s, fetches CoC event count
- If count changed, reloads instance and re-renders
- Only fires when scrubber is at live position (doesn't disrupt manual replay)

**Behavior on detection:**
- Calls _reloadInstance() — fresh CoC + instance state from DB
- Re-renders DAG and timeline
- Shows toast: "Workflow updated — external response received"
- Stops automatically when leaving the Instances tab

**New state variables:**
- _realtimeChannel — WebSocket reference
- _pollTimer — setInterval handle
- _lastCoCCount — CoC event count for diff detection

**LIVE button upgraded:** Now reloads from DB before re-rendering
(previously only moved scrubber to position 100)

### 2.3 CadenceHUD Marketing Flyer — COMPLETE ✅

7-page HTML/PDF marketing flyer built in ProjectHUD visual language.
Files: CadenceHUD_Flyer.html, CadenceHUD_Flyer.pdf

### 2.4 Architecture Document — COMPLETE ✅

Full architecture specification for External Response Endpoint.
Files: external-response-endpoint-architecture.md, .pdf
Includes Section 15: Rework Intelligence addendum with competitive analysis
and planned enhancements.

---

## 3. Pending Items — Carry Forward to Session 9

### 3.1 List View Rework Visibility ← SESSION 9 FIRST TASK
The diagram view shows rejection counts vividly (9×, 27× rejected badges,
weighted arcs). The list view shows nothing — a step just says "Active" or
"Rejected" with no rework history visible.

Fix: Add inline rejection count badge to each step row in list view.
Data is already in the CoC — just needs to be surfaced in renderInstanceDetail.

### 3.2 AI-Generated Intelligence Briefing
Replace deterministic narrative with Claude API prose generation.
- New "✦ AI Narrative" section above Workflow Timeline
- Streaming display, regenerate button
- Stakes-weighted tone (Critical vs Routine different register)
- Rejection pattern classification (process failure / dependency / human error / novel work)
- Graceful fallback to deterministic content on API failure
- DB migration: briefing_narrative + briefing_generated_at columns on workflow_instances
- Uses /api/ai-draft endpoint (already established in codebase)

### 3.3 Step Comment Threads + Confidence Signals
Resource communication layer on workflow steps.
- Threaded comments on each step (mirrors proposal-detail.html pattern)
- Optional: hours_logged, confidence signal (green/yellow/red), flag_type
- PM can promote any comment to tracked action item (one click)
- Action items themselves are threaded
- Feeds Intelligence Briefing and Morning Brief

**DB schema needed:**
```sql
CREATE TABLE step_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL,
  step_instance_id UUID,
  parent_comment_id UUID REFERENCES step_comments(id),
  author_resource_id UUID,
  body TEXT NOT NULL,
  hours_logged NUMERIC,
  confidence TEXT CHECK (confidence IN ('green','yellow','red')),
  flag_type TEXT CHECK (flag_type IN ('none','question','risk','blocker')),
  created_at TIMESTAMPTZ DEFAULT now(),
  is_deleted BOOLEAN DEFAULT false
);

CREATE TABLE workflow_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL,
  instance_id UUID REFERENCES workflow_instances(id),
  step_instance_id UUID,
  source_comment_id UUID REFERENCES step_comments(id),
  title TEXT NOT NULL,
  owner_resource_id UUID,
  due_date DATE,
  status TEXT DEFAULT 'open',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT
);

CREATE TABLE action_item_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL,
  action_item_id UUID REFERENCES workflow_action_items(id),
  parent_comment_id UUID REFERENCES action_item_comments(id),
  author_resource_id UUID,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.4 Multi-Instance Swimlane
Dot clusters on DAG canvas nodes showing count of instances at each step.
Click dot cluster → filter instances list.

### 3.5 Layer 3 Analytics Dashboard
New sub-nav tab. Heatmap of step dwell times. Rejection rates per step.
Bottleneck identification. Historical PERT accuracy.

### 3.6 Morning Brief (three-tier)
AI-generated daily briefing. Separate file, location TBD.
Three tiers: PM (tactical), Manager (strategic operational), Executive (financial).
Conclusion-first narrative, not a dashboard.
Feeds from: step comments, confidence signals, CoC, EVM, PERT, rejection patterns.

### 3.7 Project Plan Integration Bridge
- DB migration: projects, project_phases, project_tasks tables (schema in instructions.md)
- New cadence-bridge file for integration layer
- Drill-down: task → live instance detail
- Bidirectional sync: task status driven by instance completion

---

## 4. Critical Architecture Notes for Session 9

### Edge Function Rules (learned the hard way)
1. **No TypeScript type annotations** — Deno runtime crashes silently on boot
2. **No Unicode characters** — ·, —, ──, → all cause silent crashes
3. **No ?? operator in some contexts** — use || instead
4. **SUPABASE_ prefix is reserved** — use SERVICE_ROLE_KEY not SUPABASE_SERVICE_KEY
5. **SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected** — don't set them manually
6. **APP_URL** is the secret name used (not APP_BASE_URL)
7. **Always test with diagnostic console.log at every step** — boot/shutdown loops = crash

### Supabase Permission Rules (learned the hard way)
1. RLS policies with USING(true) do NOT automatically grant anon access
2. Must explicitly: GRANT SELECT ON table TO anon;
3. External-facing tables need: GRANT SELECT, UPDATE ON external_step_tokens TO anon;
4. CoC writes from external sources need: GRANT INSERT ON workflow_step_instances TO anon;

### Vercel Deployment Rules
1. Always deploy via GitHub push — dashboard uploads don't persist through redeployments
2. Vercel CDN caches aggressively — a file change in GitHub triggers rebuild correctly
3. Check Network tab file size to confirm correct version is serving

### cadence.html Working Rules (from instructions.md)
1. Never make changes without reading the relevant code first
2. Always run brace-balance check after every JS edit
3. Mirror working patterns exactly
4. State variables declared before functions that reference them
5. Deploy only after validation passes

---

## 5. Key Functions Added Session 8

| Function | Purpose |
|----------|---------|
| _startExternalEventDetection(instId) | Opens Realtime WS + starts poll timer |
| _stopExternalEventDetection() | Closes WS + clears poll timer |
| _pollCoCForChanges(instId) | 15s poll — checks CoC count diff |
| _onExternalCoCEvent(instId) | Reloads instance + shows toast |
| instScrubLive() | Now async — reloads from DB before re-rendering |

---

## 6. Files Produced Session 8

| File | Location | Status |
|------|----------|--------|
| cadence.html | Vercel / GitHub | Deploy pending (list view fix) |
| approve.html | Vercel / GitHub | Deployed ✅ |
| edge-functions/notify-step-activated/index.ts | Supabase | Deployed ✅ |
| edge-functions/respond-step/index.ts | Supabase | Deployed ✅ |
| external-response-endpoint-architecture.md | Archive | Complete |
| external-response-endpoint-architecture.pdf | Archive | Complete |
| CadenceHUD_Flyer.html | Archive | Complete |
| CadenceHUD_Flyer.pdf | Archive | Complete |

---

## 7. Feature Status (updated)

| Feature | Status | Notes |
|---------|--------|-------|
| Template editor | ✅ Complete | |
| Instance launch + CoC engine | ✅ Complete | |
| Layer 2 routing engine | ✅ Complete | |
| Email notifications (Resend) | ✅ Complete | |
| Instance DAG diagram mode | ✅ Complete | |
| Rework Intelligence (arcs, scrubber, notes) | ✅ Complete | |
| Intelligence Briefing (deterministic) | ✅ Complete | |
| Stakes Layer (Priority, Stakes, PERT) | ✅ Complete | |
| My Workflows Bin (filter, search, thermal) | ✅ Complete | |
| External Response Endpoint | ✅ Complete | Session 8 |
| Realtime + Polling Auto-Refresh | ✅ Complete | Session 8 |
| List View Rework Visibility | 🔴 Next | Session 9 first task |
| AI Intelligence Briefing | 🟡 Pending | |
| Step Comment Threads + Confidence | 🟡 Pending | |
| Multi-Instance Swimlane | 🟡 Pending | |
| Layer 3 Analytics Dashboard | 🟡 Pending | |
| Morning Brief (3-tier) | 🟡 Pending | |
| Project Plan Integration Bridge | 🟡 Pending | |

---

*CadenceHUD · ProjectHUD · Confidential · Session 8 · March 23, 2026*
*Apex Consulting Group*
