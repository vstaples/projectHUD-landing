# Commission · CMD-ACCORD-INVITATION-PIPELINE-1

**Phase:** Architecture — Full meeting invitation pipeline
**Authored:** 2026-05-12
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** EXPLORE-1 findings · operator direction 2026-05-12
**Predecessor:** CMD-ACCORD-MEETING-VISIBILITY-1 sealed · EXPLORE-1 closed
**Coding agent:** execute phases sequentially A → E.
Halt-and-surface after each phase smoke test before proceeding to next.

---

## §1 — Scope

End-to-end meeting invitation pipeline. When Vaughn adds an attendee in the
Setup shell and clicks "Save & invite," the invited person receives:
- **Internal ProjectHUD user:** Work Queue item in My Dashboard + in-app
- **External person:** Email with Accept/Decline buttons → `meeting-rsvp.html`

RSVP responses write back to `accord_meeting_attendees.rsvp_status`. Vaughn's
attendees panel in the Setup shell updates in real time to show who has accepted
(green), who has declined (rose), and who is pending (amber).

**Five phases:**
- **Phase A** — Substrate: `accord_invitation_tokens` table + RLS
- **Phase B** — `notify-meeting-invitation` Edge Function (email send)
- **Phase C** — `meeting-rsvp.html` + `respond-meeting-rsvp` Edge Function
- **Phase D** — Work Queue parallel render in `mw-core.js`
- **Phase E** — X-02 dispatch wiring in Setup shell + RSVP color badges

---

## Phase A — Substrate

### A1 — `accord_invitation_tokens` table

```sql
CREATE TABLE accord_invitation_tokens (
  token_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id         UUID        NOT NULL
                              REFERENCES firms(id),
  meeting_id      UUID        NOT NULL
                              REFERENCES accord_meetings(meeting_id)
                              ON DELETE CASCADE,
  attendee_id     UUID        NOT NULL
                              REFERENCES accord_meeting_attendees(attendee_id)
                              ON DELETE CASCADE,
  recipient_email TEXT        NOT NULL,
  recipient_name  TEXT,
  token           TEXT        NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  expires_at      TIMESTAMPTZ NOT NULL
                              DEFAULT (now() + interval '7 days'),
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at       TIMESTAMPTZ,
  used_at         TIMESTAMPTZ,
  outcome         TEXT        CHECK (outcome IN ('accepted','declined','tentative')),
  ip_at_open      TEXT,
  ip_at_submit    TEXT
);

COMMENT ON TABLE accord_invitation_tokens IS
  'Single-use tokens for meeting invitation email RSVP flow. '
  'Anon-readable by token value — no Supabase session required. '
  'CMD-ACCORD-INVITATION-PIPELINE-1 Phase A.';

CREATE INDEX accord_invitation_tokens_meeting_idx
  ON accord_invitation_tokens (meeting_id);

CREATE INDEX accord_invitation_tokens_token_idx
  ON accord_invitation_tokens (token);
```

### A2 — RLS

```sql
ALTER TABLE accord_invitation_tokens ENABLE ROW LEVEL SECURITY;

-- Anon can read a token record if they know the token value
-- (same auth model as external_step_tokens)
CREATE POLICY accord_invitation_tokens_select ON accord_invitation_tokens
  FOR SELECT USING (true);

-- Only authenticated firm members can insert (via Setup shell dispatch)
CREATE POLICY accord_invitation_tokens_insert ON accord_invitation_tokens
  FOR INSERT WITH CHECK (firm_id = my_firm_id());

-- Anon can update used_at / outcome on their own token
CREATE POLICY accord_invitation_tokens_update ON accord_invitation_tokens
  FOR UPDATE USING (true);
```

### A3 — Smoke test Phase A

```sql
-- Insert test token
INSERT INTO accord_invitation_tokens (
  firm_id, meeting_id, attendee_id,
  recipient_email, recipient_name
) VALUES (
  'aaaaaaaa-0001-0001-0001-000000000001',
  '<any running meeting_id>',
  '<any attendee_id>',
  'test@example.com',
  'Test User'
) RETURNING token_id, token, expires_at;

-- Confirm anon select works (paste token value from above)
SELECT token_id, recipient_email, expires_at
FROM accord_invitation_tokens
WHERE token = '<paste token>';
```

Expected: row returned without auth. Seal Phase A before Phase B.

---

## Phase B — `notify-meeting-invitation` Edge Function

### B1 — Function contract

**File:** `supabase/functions/notify-meeting-invitation/index.ts`
**Deploy:** `supabase functions deploy notify-meeting-invitation --no-verify-jwt`
**Secrets required:** `RESEND_API_KEY`, `APP_URL`

**Request payload:**
```json
{
  "token_id":       "<accord_invitation_tokens.token_id>",
  "token":          "<accord_invitation_tokens.token>",
  "recipient_email": "angela@example.com",
  "recipient_name":  "Angela Kim",
  "meeting_title":   "17th Test Meeting Setup",
  "meeting_date":    "Friday, May 15 · 3:00 PM",
  "meeting_duration": "60 min",
  "meeting_location": "Video · Vaughn's room",
  "organizer_name":   "Vaughn Staples",
  "firm_name":        "Apex Consulting Group"
}
```

### B2 — Function implementation

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const RESEND_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'accord@projecthud.com';
const APP_URL    = Deno.env.get('APP_URL')    || 'https://projecthud.com';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const {
      token,
      recipient_email,
      recipient_name,
      meeting_title,
      meeting_date,
      meeting_duration,
      meeting_location,
      organizer_name,
      firm_name,
    } = body;

    if (!token || !recipient_email) {
      return new Response(
        JSON.stringify({ error: 'token and recipient_email required' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    const rsvpUrl   = `${APP_URL}/meeting-rsvp.html?token=${token}`;
    const acceptUrl = `${APP_URL}/meeting-rsvp.html?token=${token}&outcome=accepted`;
    const declineUrl = `${APP_URL}/meeting-rsvp.html?token=${token}&outcome=declined`;

    const greeting = recipient_name
      ? `Hi ${recipient_name.split(' ')[0]},`
      : 'Hi,';

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Meeting Invitation</title></head>
<body style="margin:0;padding:0;background:#060a10;font-family:Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
  style="background:#060a10;min-height:100vh">
  <tr><td align="center" style="padding:40px 20px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
      style="max-width:560px;width:100%">

      <!-- Header -->
      <tr><td style="padding:0 0 24px;border-bottom:1px solid rgba(0,210,255,0.15)">
        <span style="font-size:22px;font-weight:700;color:#eef4ff">
          Project<span style="color:#00d2ff">HUD</span>
        </span>
        <span style="font-size:11px;color:#3a5a7a;margin-left:10px;
          letter-spacing:0.1em">ACCORD · MEETING INVITATION</span>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#0c1628;border:1px solid rgba(0,210,255,0.12);
        padding:28px;margin-top:24px">

        <p style="font-size:16px;color:#c8dff0;margin:0 0 6px">${greeting}</p>
        <p style="font-size:14px;color:#7a9bbf;margin:0 0 24px;line-height:1.6">
          <strong style="color:#eef4ff">${organizer_name}</strong> has invited you
          to a meeting${firm_name ? ' at ' + firm_name : ''}.
        </p>

        <!-- Meeting block -->
        <div style="border-left:3px solid #00d2ff;padding:14px 16px;
          background:rgba(0,0,0,0.2);margin:0 0 24px">
          <div style="font-size:11px;color:#00d2ff;letter-spacing:0.12em;
            text-transform:uppercase;margin-bottom:8px">MEETING DETAILS</div>
          <div style="font-size:20px;font-weight:700;color:#eef4ff;margin-bottom:12px">
            ${meeting_title}
          </div>
          <table style="font-size:13px;color:#7a9bbf;border-collapse:collapse;width:100%">
            ${meeting_date ? `<tr><td style="padding:3px 12px 3px 0;font-weight:600;
              color:#3a5a7a;width:90px">WHEN</td>
              <td style="padding:3px 0;color:#c8dff0">${meeting_date}
              ${meeting_duration ? '· ' + meeting_duration : ''}</td></tr>` : ''}
            ${meeting_location ? `<tr><td style="padding:3px 12px 3px 0;font-weight:600;
              color:#3a5a7a">WHERE</td>
              <td style="padding:3px 0;color:#c8dff0">${meeting_location}</td></tr>` : ''}
          </table>
        </div>

        <!-- RSVP buttons -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
          border="0" style="margin:0 0 24px">
          <tr>
            <td style="padding:0 6px 0 0">
              <a href="${acceptUrl}"
                style="display:block;text-align:center;padding:13px 0;
                  font-family:Arial,sans-serif;font-size:14px;font-weight:700;
                  letter-spacing:0.08em;text-transform:uppercase;
                  color:#00e5a0;text-decoration:none;
                  border:1px solid rgba(0,229,160,0.5);
                  background:rgba(0,229,160,0.1)">
                ✓ Accept
              </a>
            </td>
            <td style="padding:0 0 0 6px">
              <a href="${declineUrl}"
                style="display:block;text-align:center;padding:13px 0;
                  font-family:Arial,sans-serif;font-size:14px;font-weight:700;
                  letter-spacing:0.08em;text-transform:uppercase;
                  color:#ff6b6b;text-decoration:none;
                  border:1px solid rgba(255,107,107,0.5);
                  background:rgba(255,107,107,0.1)">
                ✕ Decline
              </a>
            </td>
          </tr>
        </table>

        <p style="font-size:12px;color:#3a5a7a;margin:0 0 8px">
          Or view full details and respond:
          <a href="${rsvpUrl}" style="color:#00d2ff">${rsvpUrl}</a>
        </p>

        <div style="height:1px;background:rgba(0,210,255,0.2);margin:16px 0"></div>

        <p style="font-size:11px;color:#3a5a7a;margin:0">
          This invitation link expires in 7 days and is single-use.
          If you received this in error, you can safely ignore it.
        </p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:20px 0 0;text-align:center">
        <p style="font-size:11px;color:#3a5a7a;letter-spacing:0.08em;margin:0">
          Accord · ProjectHUD · Do not forward this email
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

    if (!RESEND_KEY) {
      return new Response(
        JSON.stringify({ skipped: 'no_resend_key', to: recipient_email }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [recipient_email],
        subject: `Meeting Invitation: ${meeting_title}`,
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('[notify-meeting-invitation] Resend error:', data);
      return new Response(
        JSON.stringify({ error: data }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ sent: true, to: recipient_email, id: data.id }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );

  } catch (e) {
    console.error('[notify-meeting-invitation] error:', e);
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
```

### B3 — Smoke test Phase B

Test via curl or browser console after deploying:
```javascript
fetch('https://<project>.supabase.co/functions/v1/notify-meeting-invitation', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json',
             'Authorization': 'Bearer <anon_key>' },
  body: JSON.stringify({
    token:            '<token from Phase A test>',
    recipient_email:  '<your real email>',
    recipient_name:   'Test Recipient',
    meeting_title:    '17th Test Meeting Setup',
    meeting_date:     'Friday, May 15 · 3:00 PM',
    meeting_duration: '60 min',
    meeting_location: 'Video · Vaughn\'s room',
    organizer_name:   'Vaughn Staples',
    firm_name:        'Apex Consulting Group'
  })
}).then(r => r.json()).then(console.log);
```

Expected: email arrives within 2 seconds. Accept/Decline buttons present.
Seal Phase B before Phase C.

---

## Phase C — RSVP receipt

### C1 — `meeting-rsvp.html`

New standalone page. Token-consume pattern from `approve.html`.
No Supabase session required — anon key only.

**URL patterns:**
- `meeting-rsvp.html?token=<value>` — show meeting details + Accept/Decline buttons
- `meeting-rsvp.html?token=<value>&outcome=accepted` — pre-select Accept, confirm on load
- `meeting-rsvp.html?token=<value>&outcome=declined` — pre-select Decline, confirm on load

**Page behavior:**
1. On load: fetch `accord_invitation_tokens` WHERE `token = <param>`
2. If `used_at` is set → show "Already responded · [outcome]" state
3. If `expires_at` is past → show "Invitation expired" state
4. If `outcome` param present → auto-confirm that outcome (one-click from email button)
5. Show meeting details (title, date, location, organizer)
6. Accept / Decline / Tentative buttons
7. On confirm → call `respond-meeting-rsvp` Edge Function → show confirmation state

**Page is self-contained HTML** (~200 lines). Dark theme matching ProjectHUD.
No framework. Vanilla JS only.

Key sections:
```html
<!-- State: loading -->
<div id="state-loading">Loading invitation…</div>

<!-- State: valid -->
<div id="state-valid" style="display:none">
  <div class="meeting-block">…title, date, location, organizer…</div>
  <div class="rsvp-buttons">
    <button data-outcome="accepted">✓ Accept</button>
    <button data-outcome="tentative">~ Tentative</button>
    <button data-outcome="declined">✕ Decline</button>
  </div>
  <textarea id="rsvp-note" placeholder="Add a note (optional)…"></textarea>
  <button id="confirm-btn">Confirm response</button>
</div>

<!-- State: already used -->
<div id="state-used" style="display:none">
  You already responded: <span id="prior-outcome"></span>
</div>

<!-- State: expired -->
<div id="state-expired" style="display:none">
  This invitation has expired. Contact the organizer for a new link.
</div>

<!-- State: confirmed -->
<div id="state-confirmed" style="display:none">
  <span id="confirmed-outcome"></span>
  You can close this window.
</div>
```

**JavaScript flow:**
```javascript
async function init() {
  var params  = new URLSearchParams(location.search);
  var token   = params.get('token');
  var outcome = params.get('outcome'); // pre-selected from email button

  if (!token) { showState('expired'); return; }

  // Fetch token record (anon)
  var row = await fetch(SUPA_URL +
    '/rest/v1/accord_invitation_tokens?token=eq.' + token +
    '&select=*', { headers: { apikey: ANON_KEY } })
    .then(r => r.json())
    .then(rows => rows[0]);

  if (!row) { showState('expired'); return; }
  if (row.used_at) { showPriorResponse(row.outcome); return; }
  if (new Date(row.expires_at) < new Date()) { showState('expired'); return; }

  showMeetingDetails(row);

  // Auto-confirm if outcome in URL
  if (outcome && ['accepted','declined','tentative'].includes(outcome)) {
    await confirmRsvp(token, outcome, '');
    return;
  }

  showState('valid');
  wireButtons(token);
}

async function confirmRsvp(token, outcome, note) {
  await fetch(SUPA_URL + '/functions/v1/respond-meeting-rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ token, outcome, note })
  });
  showConfirmed(outcome);
}
```

### C2 — `respond-meeting-rsvp` Edge Function

**File:** `supabase/functions/respond-meeting-rsvp/index.ts`
**Deploy:** `supabase functions deploy respond-meeting-rsvp --no-verify-jwt`
**Secrets required:** `RESEND_API_KEY`, `APP_URL`

**Request payload:**
```json
{ "token": "<value>", "outcome": "accepted", "note": "Looking forward to it" }
```

**Function logic:**
1. Fetch `accord_invitation_tokens` by `token`
2. Validate: not used, not expired
3. Mark `used_at`, `outcome`, `ip_at_submit` on token
4. PATCH `accord_meeting_attendees` WHERE `attendee_id = tok.attendee_id`
   → set `rsvp_status = outcome`
5. Notify organizer via Resend:
   `"[Name] has [accepted/declined] your invitation to [Meeting Title]"`
6. Return `{ ok: true, outcome }`

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SUPA_URL    = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_KEY  = Deno.env.get('RESEND_API_KEY') || '';
const FROM_EMAIL  = Deno.env.get('FROM_EMAIL') || 'accord@projecthud.com';
const APP_URL     = Deno.env.get('APP_URL') || 'https://projecthud.com';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const db = (table: string) => `${SUPA_URL}/rest/v1/${table}`;
const hdr = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
              'Content-Type': 'application/json' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { token, outcome, note } = await req.json();
    if (!token || !outcome) return err('token and outcome required', 400);
    if (!['accepted','declined','tentative'].includes(outcome))
      return err('invalid outcome', 400);

    // 1. Fetch token
    const toks = await fetch(db('accord_invitation_tokens') +
      `?token=eq.${encodeURIComponent(token)}&select=*`, { headers: hdr })
      .then(r => r.json());

    const tok = toks?.[0];
    if (!tok) return err('invalid token', 404);
    if (tok.used_at) return err('already used', 409);
    if (new Date(tok.expires_at) < new Date()) return err('expired', 410);

    const now = new Date().toISOString();

    // 2. Mark token used
    await fetch(db('accord_invitation_tokens') +
      `?token=eq.${encodeURIComponent(token)}`, {
      method: 'PATCH', headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify({ used_at: now, outcome, ip_at_submit:
        req.headers.get('x-forwarded-for') || null }),
    });

    // 3. Update accord_meeting_attendees rsvp_status
    await fetch(db('accord_meeting_attendees') +
      `?attendee_id=eq.${tok.attendee_id}`, {
      method: 'PATCH', headers: { ...hdr, Prefer: 'return=minimal' },
      body: JSON.stringify({ rsvp_status: outcome }),
    });

    // 4. Fetch meeting + organizer for notification
    const meetings = await fetch(db('accord_meetings') +
      `?meeting_id=eq.${tok.meeting_id}&select=title,organizer_id`, { headers: hdr })
      .then(r => r.json());
    const meeting = meetings?.[0];

    if (meeting?.organizer_id && RESEND_KEY) {
      const users = await fetch(db('users') +
        `?id=eq.${meeting.organizer_id}&select=email,name`, { headers: hdr })
        .then(r => r.json());
      const organizer = users?.[0];

      if (organizer?.email) {
        const outcomeWord = outcome === 'accepted' ? 'accepted'
                          : outcome === 'declined' ? 'declined'
                          : 'marked as tentative';
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_KEY}`,
                     'Content-Type': 'application/json' },
          body: JSON.stringify({
            from:    FROM_EMAIL,
            to:      [organizer.email],
            subject: `[Accord] ${tok.recipient_name || 'Invitee'} ${outcomeWord} · ${meeting.title}`,
            text:    `${tok.recipient_name || tok.recipient_email} has ${outcomeWord} your invitation to "${meeting.title}".${note ? '\n\nNote: "' + note + '"' : ''}\n\nOpen Accord: ${APP_URL}/accord.html`,
          }),
        }).catch(console.error);
      }
    }

    return new Response(JSON.stringify({ ok: true, outcome }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error('[respond-meeting-rsvp]', e);
    return err(String(e), 500);
  }
});

function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }),
    { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
```

### C3 — Smoke test Phase C

1. Open `meeting-rsvp.html?token=<Phase A test token>` in browser
2. Meeting details render correctly
3. Click Accept → confirmation state shown
4. Verify in DB: `accord_meeting_attendees.rsvp_status = 'accepted'`
5. Verify organizer notification email arrives

Seal Phase C before Phase D.

---

## Phase D — Work Queue parallel render

### D1 — New fetch in `mw-core.js`

Add a parallel fetch for pending Accord invitations alongside the existing
`workflow_requests` fetch. Called from the same polling cycle (10s interval).

**Add to `_doPoll` alongside existing `workflow_requests` fetch:**

```javascript
// Accord meeting invitations — parallel to workflow_requests
var accordInvites = [];
if (window._myResource && window._myResource.id) {
  accordInvites = await API.get(
    'accord_meeting_attendees?resource_id=eq.' + window._myResource.id +
    '&rsvp_status=eq.pending' +
    '&select=attendee_id,meeting_id,role_in_meeting,' +
    'accord_meetings!inner(title,scheduled_for,duration_minutes,organizer_id)'
  ).catch(function() { return []; });
}
window._accordInvites = accordInvites || [];
```

### D2 — Render path in Work Queue

Find where `_myRequests` is rendered into the Work Queue list (around line 847).
Add a section above or below for Accord invitations:

```javascript
function _renderAccordInvites(invites) {
  if (!invites || !invites.length) return '';
  return invites.map(function(inv) {
    var mtg      = inv.accord_meetings;
    var title    = mtg ? mtg.title : 'Meeting invitation';
    var dateStr  = mtg && mtg.scheduled_for
      ? new Date(mtg.scheduled_for).toLocaleDateString(undefined,
          { weekday:'short', month:'short', day:'numeric',
            hour:'2-digit', minute:'2-digit' })
      : '';
    var rsvpUrl  = '/accord.html?meeting=' + inv.meeting_id;

    return '<div class="wq-row wq-row--accord-invite" ' +
           'data-attendee-id="' + inv.attendee_id + '">' +
           '<div class="wq-row-type" style="color:var(--compass-cyan)">● Accord</div>' +
           '<div class="wq-row-title">' + esc(title) + '</div>' +
           '<div class="wq-row-meta">' + esc(dateStr) + '</div>' +
           '<div class="wq-row-actions">' +
             '<a class="wq-btn wq-btn--accept" ' +
             'href="/meeting-rsvp.html?outcome=accepted&attendee_id=' +
             inv.attendee_id + '">Accept</a>' +
             '<a class="wq-btn wq-btn--decline" ' +
             'href="/meeting-rsvp.html?outcome=declined&attendee_id=' +
             inv.attendee_id + '">Decline</a>' +
           '</div>' +
           '</div>';
  }).join('');
}
```

**Note:** Internal user RSVP via Work Queue does not need a token — it uses
the authenticated session. The `meeting-rsvp.html` page should also accept
`?attendee_id=<id>` as an alternative to `?token=<value>` for authenticated users.
Add this branch to Phase C's `init()` function.

### D3 — Smoke test Phase D

1. Add Angela as `rsvp_status='pending'` attendee on a meeting she's not yet responded to
2. Log in as Angela
3. Open My Dashboard → Work Queue → should show the meeting invitation row
4. Click Accept → `rsvp_status` updates to `accepted`
5. Row disappears from Work Queue on next poll (10s)

Seal Phase D before Phase E.

---

## Phase E — Setup shell dispatch + RSVP color badges

### E1 — X-02: "Save & invite" button dispatch

In `accord-meeting-setup.js`, wire the `save-invite` button (currently disabled,
tooltip "Invitations — coming soon") to dispatch invitations.

**On click:**
1. Fetch all `accord_meeting_attendees` for the meeting WHERE `rsvp_status='pending'`
2. For each pending attendee:
   a. Resolve `resource_id` → `resources.email` + `resources.name`
   b. Insert row into `accord_invitation_tokens` (firm_id, meeting_id, attendee_id, recipient_email, recipient_name)
   c. Call `notify-meeting-invitation` Edge Function with token + meeting details
3. Show brief success confirmation: "Invitations sent to [N] attendees"
4. Update button state: enabled, tooltip "Resend invitations"

**Guard:** if attendee has `resources.user_id` (internal ProjectHUD user) — the
Work Queue item from Phase D handles their notification. Email is optional for
internal users — send it anyway as a backup (they can always use the Work Queue).

### E2 — RSVP color badges in Setup shell attendees panel

In `accord-meeting-setup.js` `_paintAttendees`, update the conn-dot or add a
status badge reflecting `rsvp_status`:

```javascript
var rsvpColor = a.rsvp_status === 'accepted'  ? 'var(--ac-green)'
             : a.rsvp_status === 'declined'   ? 'var(--ac-rose)'
             : a.rsvp_status === 'tentative'  ? 'var(--ac-amber)'
             : 'var(--ac-border-mid)';  // pending = gray

// Apply to attendee card conn-dot or add inline badge
```

Add a Supabase realtime subscription on `accord_meeting_attendees` for the
current meeting — so when Angela accepts from her email, Vaughn's Setup shell
attendees panel updates within 2 seconds without a page refresh.

```javascript
// In _initRealtimeAttendees(meetingId):
supabase.channel('accord-attendees-' + meetingId)
  .on('postgres_changes', {
    event: 'UPDATE', schema: 'public',
    table: 'accord_meeting_attendees',
    filter: 'meeting_id=eq.' + meetingId
  }, function(payload) {
    // Re-render the affected attendee card with new rsvp_status
    _updateAttendeeRsvp(payload.new.attendee_id, payload.new.rsvp_status);
  })
  .subscribe();
```

Ensure `accord_meeting_attendees` has:
```sql
ALTER TABLE accord_meeting_attendees REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE accord_meeting_attendees;
```

### E3 — Smoke test Phase E

1. Open Setup shell on a meeting with Angela as pending attendee
2. Click "Save & invite" — button activates (no longer disabled)
3. Angela receives invitation email within 2 seconds
4. Angela clicks Accept in email → `meeting-rsvp.html` confirms
5. Vaughn's Setup shell attendees panel updates Angela's badge to green within 2 seconds — no refresh
6. Vaughn receives email notification "Angela Kim accepted · 17th Test Meeting"

---

## §2 — Files manifest

| File | Phase | Change |
|---|---|---|
| Supabase SQL | A | `accord_invitation_tokens` table + RLS |
| `supabase/functions/notify-meeting-invitation/index.ts` | B | New Edge Function |
| `meeting-rsvp.html` | C | New standalone RSVP page |
| `supabase/functions/respond-meeting-rsvp/index.ts` | C | New Edge Function |
| `mw-core.js` | D | Parallel Accord invites fetch + render |
| `accord-meeting-setup.js` | E | Save & invite dispatch + RSVP realtime + color badges |
| Supabase SQL | E | `accord_meeting_attendees` REPLICA IDENTITY FULL + realtime publication |
| `version.js` | E | Operator-managed (IR65) |

---

## §3 — Discipline checklist

- `var` only in JS files (accord-meeting-setup.js, mw-core.js)
- TypeScript permitted in Edge Functions (matching existing pattern)
- Token is single-use — `used_at` checked before any writeback
- `outcome` validated against allowed values before DB write
- Organizer email notification is non-blocking — `.catch(console.error)` pattern
- Phase A sealed before Phase B coded
- Phase B sealed before Phase C coded — and so on sequentially
- `accord_meeting_attendees` realtime: REPLICA IDENTITY FULL confirmed before subscription test
- Internal user RSVP via Work Queue uses authenticated session — no token required
- `--ac-*` token prefix in Setup shell CSS additions

---

**Halt-and-surface after each phase smoke test. Do not proceed to next phase
until current phase is sealed.**

**After Phase E seals: CMD-ACCORD-INVITATION-PIPELINE-1 is complete.
The full invitation loop — dispatch → delivery → RSVP → feedback — is live.**

---

*End Commission · CMD-ACCORD-INVITATION-PIPELINE-1.*
