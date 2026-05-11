# Commission · A-08 · CMD-ACCORD-CAPTURE-CHAT-1

**Phase:** Live Capture — Team Chat
**Authored:** 2026-05-11
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Accord prototype v3b-4 · meta pane chat panel; operator direction 2026-05-11
**Predecessor:** F-LIVE-1-4 sealed
**Successor:** A-09 · CMD-ACCORD-CAPTURE-FILMSTRIP-1
**Coding agent:** execute sequentially; halt-and-surface after §10

---

## §1 — Scope

Wire Team Chat in the live capture meta pane. Chat is ambient — separate from node
captures, not part of the Chain of Custody integrity record, but preserved as part of
the meeting artifact for context.

**Deliverables:**
1. `accord_chat_messages` substrate — new table with RLS
2. Supabase realtime subscription — new messages appear instantly without polling
3. Three meeting-state behaviors:
   - `idle` (gathering): chat open, input active, "Gathering…" placeholder
   - `running`: chat open, full input, SEND button enabled
   - `closed`: chat read-only, input hidden, archive label shown
4. Message rendering: left-aligned (others) / right-aligned amber bubble (you)
5. Author name + timestamp header per message group
6. New message flash animation on arrival
7. Auto-scroll to latest message on send and on incoming
8. Enter to send (Shift+Enter for newline)

**What does NOT ship:**
- Message reactions / emoji
- Message deletion or editing
- @mentions / attendee tagging
- Chat history search
- Chat export to minutes (future CMD)
- Read receipts

---

## §2 — IR64 verification (before writing any code)

**V1 — `accord_chat_messages` table absent:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name = 'accord_chat_messages';
```
Expected: zero rows. Halt if present.

**V2 — Chat panel current state in meta pane:**
```javascript
var chatPanel = document.querySelector('.chat-panel, .ac-chat-panel, #teamChat, #ac-team-chat');
console.log('chat panel:', chatPanel?.className || 'not found');
console.log('chat HTML:', chatPanel?.innerHTML?.slice(0, 200));
```
Confirm whether chat panel HTML is already stubbed (Track A shipped a stub) or absent.

**V3 — Supabase realtime channel pattern:**
```javascript
// Confirm existing realtime subscription pattern for reference
console.log(typeof window.Accord?.state?.supabase);
// Check accord-core.js for _subscribeMeetingChannel pattern
console.log(window.Accord._subscribeMeetingChannel?.toString?.()?.slice(0, 200) || 'not exposed');
```
Need to confirm the Supabase client instance name and channel subscription pattern used in accord-core.js.

**V4 — Current user resource_id for chat authorship:**
```javascript
// Chat messages are authored by resources (not raw auth.users)
// Confirm _currentResourceId is accessible from accord-capture.js scope
console.log(typeof _currentResourceId);
// If not accessible, check window.Accord.state
console.log(window.Accord?.state?.resourceId || window.Accord?.state?.resource?.id || 'not found');
```

Report V1–V4 in close-out.

---

## §3 — Substrate: `accord_chat_messages`

```sql
-- Migration: 2026-05-11_accord_chat_messages.sql
-- A-08 · CMD-ACCORD-CAPTURE-CHAT-1

CREATE TABLE accord_chat_messages (
  message_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id           UUID        NOT NULL REFERENCES firms(id),
  meeting_id        UUID        NOT NULL REFERENCES accord_meetings(meeting_id)
                                ON DELETE CASCADE,
  author_resource_id UUID       NOT NULL REFERENCES resources(id),
  body              TEXT        NOT NULL CHECK (length(trim(body)) > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE accord_chat_messages IS
  'Ambient meeting chat — not part of Chain of Custody integrity record. '
  'Preserved as meeting context artifact. '
  'A-08 CMD-ACCORD-CAPTURE-CHAT-1.';

CREATE INDEX accord_chat_messages_meeting_idx
  ON accord_chat_messages (meeting_id, created_at ASC);
```

### §3.1 — RLS policies

```sql
ALTER TABLE accord_chat_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: all firm members can read chat in meetings they attend
CREATE POLICY accord_chat_messages_select ON accord_chat_messages
  FOR SELECT USING (firm_id = my_firm_id());

-- INSERT: firm member; author_resource_id must match caller's resource
CREATE POLICY accord_chat_messages_insert ON accord_chat_messages
  FOR INSERT WITH CHECK (
    firm_id = my_firm_id()
    AND author_resource_id = (
      SELECT id FROM resources WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- UPDATE / DELETE: not permitted — chat messages are immutable
-- (no policies = default deny for UPDATE and DELETE)
```

**Post-migration:**
```sql
SELECT pg_notify('pgrst', 'reload schema');
```

---

## §4 — Chat state management

Module-level vars in `accord-capture.js`:

```javascript
var _chatMessages      = [];        // loaded messages array
var _chatSubscription  = null;      // Supabase realtime channel
var _chatResourceId    = null;      // current user's resource id
var _chatResourceName  = null;      // current user's display name
var _chatMeetingState  = 'idle';    // mirrors meeting.state
```

---

## §5 — Initialisation

Called from the capture surface render after meeting loads:

```javascript
function _initChat(meeting, resourceId, resourceName) {
  _chatResourceId   = resourceId;
  _chatResourceName = resourceName;
  _chatMeetingState = meeting.state;

  // Load recent history (last 50 messages)
  _loadChatHistory(meeting.meeting_id);

  // Subscribe to realtime
  _subscribeChatChannel(meeting.meeting_id);

  // Wire input events
  _wireChatInput(meeting);
}

function _teardownChat() {
  if (_chatSubscription) {
    _chatSubscription.unsubscribe();
    _chatSubscription = null;
  }
  _chatMessages    = [];
  _chatResourceId  = null;
  _chatResourceName = null;
}
```

---

## §6 — History load

```javascript
function _loadChatHistory(meetingId) {
  API.get(
    'accord_chat_messages?meeting_id=eq.' + meetingId +
    '&order=created_at.asc&limit=50' +
    '&select=message_id,body,created_at,author_resource_id'
  ).then(function(rows) {
    rows = rows || [];
    // Resolve author names
    if (!rows.length) { _renderChatStream([]); return; }
    var resourceIds = [];
    rows.forEach(function(r) {
      if (resourceIds.indexOf(r.author_resource_id) === -1)
        resourceIds.push(r.author_resource_id);
    });
    API.get('resources?id=in.(' + resourceIds.join(',') + ')&select=id,name')
      .then(function(resources) {
        var nameMap = {};
        (resources || []).forEach(function(r) { nameMap[r.id] = r.name; });
        rows.forEach(function(m) {
          m._author_name = nameMap[m.author_resource_id] || 'Unknown';
          m._is_me = m.author_resource_id === _chatResourceId;
        });
        _chatMessages = rows;
        _renderChatStream(_chatMessages);
        _scrollChatToBottom(false);
      });
  }).catch(function(e) {
    console.error('[AccordChat] history load failed', e);
  });
}
```

---

## §7 — Realtime subscription

```javascript
function _subscribeChatChannel(meetingId) {
  // Use the same Supabase client as accord-core
  var supabase = window.Accord.state.supabase;
  if (!supabase) {
    console.error('[AccordChat] Supabase client not available');
    return;
  }

  _chatSubscription = supabase
    .channel('accord-chat-' + meetingId)
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'accord_chat_messages',
      filter: 'meeting_id=eq.' + meetingId
    }, function(payload) {
      var msg = payload.new;
      if (!msg) return;

      // Resolve author name
      API.get('resources?id=eq.' + msg.author_resource_id + '&select=id,name&limit=1')
        .then(function(rows) {
          msg._author_name = (rows && rows[0]) ? rows[0].name : 'Unknown';
          msg._is_me       = msg.author_resource_id === _chatResourceId;
          _chatMessages.push(msg);
          _appendChatMessage(msg);
          _scrollChatToBottom(true);
        });
    })
    .subscribe();
}
```

---

## §8 — Render functions

### §8.1 — Full stream render (history load)

```javascript
function _renderChatStream(messages) {
  var stream = document.querySelector('.chat-stream');
  if (!stream) return;

  if (!messages.length) {
    stream.innerHTML = '';  // CSS :empty pseudo-class handles empty state
    return;
  }

  // Group consecutive messages from same author
  var html = '';
  var lastAuthorId = null;

  messages.forEach(function(msg) {
    var isMe = msg._is_me;
    var meClass = isMe ? ' me' : ' other';

    if (msg.author_resource_id !== lastAuthorId) {
      // New group — emit header
      var time = _fmtChatTime(msg.created_at);
      html += '<div class="chat-msg-group">';
      html += '<div class="chat-msg-header' + meClass + '">';
      html += '<span class="chat-msg-author">' + esc(msg._author_name || '') + '</span>';
      html += '<span class="chat-msg-time">' + esc(time) + '</span>';
      html += '</div>';
      lastAuthorId = msg.author_resource_id;
    }

    html += '<div class="chat-msg-row' + meClass + '">';
    html += '<div class="chat-msg-bubble" data-message-id="' +
            esc(msg.message_id) + '">' +
            esc(msg.body) + '</div>';
    html += '</div>';
  });

  stream.innerHTML = html;
}
```

### §8.2 — Append single new message (realtime)

```javascript
function _appendChatMessage(msg) {
  var stream = document.querySelector('.chat-stream');
  if (!stream) return;

  var isMe    = msg._is_me;
  var meClass = isMe ? ' me' : ' other';
  var time    = _fmtChatTime(msg.created_at);

  // Check if last group is same author — if so, skip header
  var lastGroup  = stream.querySelector('.chat-msg-group:last-child');
  var lastAuthor = lastGroup?.querySelector('.chat-msg-author')?.textContent;
  var sameAuthor = lastAuthor === (msg._author_name || '');

  var html = '';
  if (!lastGroup || !sameAuthor) {
    html += '<div class="chat-msg-group">';
    html += '<div class="chat-msg-header' + meClass + '">';
    html += '<span class="chat-msg-author">' + esc(msg._author_name || '') + '</span>';
    html += '<span class="chat-msg-time">' + esc(time) + '</span>';
    html += '</div>';
  } else {
    // Append to existing group
    html = '';  // will append row to existing group below
  }

  var rowHtml = '<div class="chat-msg-row' + meClass + '">' +
                '<div class="chat-msg-bubble new" data-message-id="' +
                esc(msg.message_id) + '">' +
                esc(msg.body) + '</div>' +
                '</div>';

  if (!lastGroup || !sameAuthor) {
    html += rowHtml + '</div>';
    stream.insertAdjacentHTML('beforeend', html);
  } else {
    lastGroup.insertAdjacentHTML('beforeend', rowHtml);
  }

  // Remove 'new' flash class after animation
  var newBubble = stream.querySelector('[data-message-id="' + msg.message_id + '"]');
  if (newBubble) {
    setTimeout(function() { newBubble.classList.remove('new'); }, 1200);
  }
}
```

### §8.3 — Time formatter

```javascript
function _fmtChatTime(isoString) {
  if (!isoString) return '';
  var d = new Date(isoString);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
```

### §8.4 — Auto-scroll

```javascript
function _scrollChatToBottom(smooth) {
  var stream = document.querySelector('.chat-stream');
  if (!stream) return;
  stream.scrollTo({ top: stream.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
}
```

---

## §9 — Input wiring + send

```javascript
function _wireChatInput(meeting) {
  var input   = document.querySelector('.chat-input');
  var sendBtn = document.querySelector('.chat-send');
  if (!input || !sendBtn) return;

  // State-based visibility
  _applyChatState(meeting.state);

  // Enable send button when input has content
  input.addEventListener('input', function() {
    sendBtn.disabled = input.value.trim().length === 0;
  });

  // Enter to send; Shift+Enter for newline
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      if (!sendBtn.disabled) _sendChatMessage(meeting, input, sendBtn);
    }
  });

  sendBtn.addEventListener('click', function() {
    if (!sendBtn.disabled) _sendChatMessage(meeting, input, sendBtn);
  });
}

function _sendChatMessage(meeting, input, sendBtn) {
  var body = input.value.trim();
  if (!body || !_chatResourceId) return;

  sendBtn.disabled = true;
  input.value = '';

  API.post('accord_chat_messages', {
    firm_id:           meeting.firm_id,
    meeting_id:        meeting.meeting_id,
    author_resource_id: _chatResourceId,
    body:              body
  }).catch(function(e) {
    console.error('[AccordChat] send failed', e);
    // Restore input on failure
    input.value = body;
    sendBtn.disabled = false;
  });
  // Note: message display handled by realtime subscription —
  // INSERT triggers _appendChatMessage automatically
}

function _applyChatState(meetingState) {
  var input    = document.querySelector('.chat-input');
  var sendBtn  = document.querySelector('.chat-send');
  var inputRow = document.querySelector('.chat-input-row');
  var stream   = document.querySelector('.chat-stream');

  if (!input) return;

  if (meetingState === 'idle') {
    // Gathering — open, but placeholder signals pre-meeting context
    input.placeholder = 'Message the meeting\u2026';
    input.disabled    = false;
    if (inputRow) inputRow.style.display = '';
  } else if (meetingState === 'running') {
    input.placeholder = 'Message the meeting\u2026';
    input.disabled    = false;
    if (inputRow) inputRow.style.display = '';
  } else if (meetingState === 'closed') {
    // Read-only — hide input row, show archive label
    if (inputRow) inputRow.style.display = 'none';
    var existing = document.querySelector('.chat-closed-label');
    if (!existing && stream) {
      stream.insertAdjacentHTML('afterend',
        '<div class="chat-closed-label">Chat archived · read-only</div>');
    }
  }
}
```

---

## §10 — CSS additions

```css
/* ── Chat panel ─────────────────────────────────────── */
.chat-panel {
  display: flex;
  flex-direction: column;
  background: var(--ac-bg-deep);
  border: 1px solid var(--ac-border-subtle);
  border-radius: 4px;
  overflow: hidden;
}

.chat-stream {
  height: 200px;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--ac-border-mid) transparent;
}

.chat-stream:empty::after {
  content: 'No messages yet.';
  display: block;
  font-family: var(--ac-font-mono);
  font-size: 10px;
  color: var(--ac-text-faint);
  font-style: italic;
  text-align: center;
  padding: 30px 0;
}

/* ── Message groups ─────────────────────────────────── */
.chat-msg-group { margin-top: 10px; }
.chat-msg-group:first-child { margin-top: 0; }

.chat-msg-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}
.chat-msg-header.me { flex-direction: row-reverse; }

.chat-msg-author {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ac-text-secondary);
}
.chat-msg-time {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-faint);
}

/* ── Message bubbles ────────────────────────────────── */
.chat-msg-row {
  display: flex;
  margin-top: 2px;
}
.chat-msg-row.me    { justify-content: flex-end; }
.chat-msg-row.other { justify-content: flex-start; }

.chat-msg-bubble {
  max-width: 82%;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--ac-text-primary);
  line-height: 1.45;
  word-break: break-word;
  border: 1px solid var(--ac-border-subtle);
  border-radius: 4px;
  background: var(--ac-bg-tile);
  transition: background 0.6s ease, border-color 0.6s ease, box-shadow 0.6s ease;
}

/* Your messages — amber tint */
.chat-msg-row.me .chat-msg-bubble {
  background: var(--ac-amber-dim);
  border-color: rgba(251,191,119,0.25);
  color: var(--ac-text-primary);
}

/* New message flash — fades to normal */
.chat-msg-bubble.new {
  background: rgba(74, 222, 128, 0.1);
  border-color: rgba(74, 222, 128, 0.3);
  box-shadow: 0 0 10px rgba(74, 222, 128, 0.2);
}

/* ── Input row ──────────────────────────────────────── */
.chat-input-row {
  display: flex;
  gap: 4px;
  padding: 8px;
  border-top: 1px solid var(--ac-border-subtle);
  background: var(--ac-bg-pane);
}
.chat-input {
  flex: 1;
  min-width: 0;
  background: var(--ac-bg-deep);
  border: 1px solid var(--ac-border-subtle);
  color: var(--ac-text-primary);
  font-family: var(--ac-font-sans);
  font-size: 11px;
  padding: 5px 8px;
  outline: none;
  border-radius: 3px;
  transition: border-color 0.15s;
}
.chat-input:focus { border-color: var(--ac-border-active); }
.chat-input::placeholder { color: var(--ac-text-faint); }

.chat-send {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  background: transparent;
  border: 1px solid var(--ac-border-subtle);
  color: var(--ac-text-faint);
  padding: 5px 8px;
  cursor: not-allowed;
  border-radius: 3px;
  transition: all 0.15s;
  flex-shrink: 0;
}
.chat-send:not(:disabled) {
  background: var(--ac-cyan-dim);
  border-color: rgba(94,234,212,0.3);
  color: var(--ac-cyan);
  cursor: pointer;
}
.chat-send:not(:disabled):hover {
  background: var(--ac-cyan);
  color: var(--ac-bg-deep);
}

/* ── Closed state ───────────────────────────────────── */
.chat-closed-label {
  font-family: var(--ac-font-mono);
  font-size: 9px;
  color: var(--ac-text-faint);
  text-align: center;
  padding: 6px;
  border-top: 1px solid var(--ac-border-subtle);
  letter-spacing: 0.6px;
}
```

---

## §11 — Teardown

```javascript
// In accord-capture.js teardown():
_teardownChat();
```

---

## §12 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Chat renders in meta pane | Chat panel visible below attendees. Empty state: "No messages yet." Input and SEND button present. SEND disabled until text entered. |
| 2 | Send a message | Type text → Enter or click SEND. Message appears right-aligned in amber bubble. Input clears. Realtime INSERT fires. |
| 3 | Receive a message | Open same meeting in second browser tab. Send from tab 2. Message appears in tab 1 within 1–2 seconds, left-aligned with green flash. |
| 4 | Message grouping | Two consecutive messages from same author — only one header row shown. New author gets fresh header. |
| 5 | Auto-scroll | New messages scroll the stream to bottom automatically. |
| 6 | Idle state (gathering) | Meeting in `idle` state. Chat input active, placeholder "Message the meeting…". Chat open before Begin Meeting fires. |
| 7 | Closed state | After END MEETING, input row hidden. "Chat archived · read-only" label shows. Prior messages readable. |
| 8 | History loads on mount | Navigate away and back to same meeting. Prior messages load in correct order. Author names resolve. |
| 9 | RLS — author enforcement | Attempt INSERT with wrong `author_resource_id`. PostgREST returns 403. |
| 10 | Teardown | Navigate away. Supabase channel unsubscribed. No console errors. |

---

## §13 — Files manifest

| File | Change |
|---|---|
| `accord_chat_messages` (Supabase) | New table + RLS + index |
| `accord-capture.js` | `_initChat`, `_teardownChat`, `_loadChatHistory`, `_subscribeChatChannel`, `_renderChatStream`, `_appendChatMessage`, `_sendChatMessage`, `_wireChatInput`, `_applyChatState`, `_fmtChatTime`, `_scrollChatToBottom`; teardown call |
| `accord-capture.css` | Chat panel, stream, bubble, input row, closed label styles |
| `version.js` | Operator-managed (IR65) |

---

## §14 — Discipline checklist

- `var` only
- `_chatSubscription` stored and unsubscribed in `_teardownChat`
- Realtime INSERT handler resolves author name before appending — no anonymous bubbles
- SEND button disabled by default — only enabled when input has content
- Send fires POST then clears input — message display handled by realtime, not by optimistic DOM insert
- `meeting.firm_id` on INSERT — confirmed pattern from C-08
- `author_resource_id` matches caller via RLS — not operator-settable
- `_chatResourceId` null-guarded in `_sendChatMessage`
- Chat closed state hides input row — does not delete it
- `--ac-*` token prefix throughout

---

**Halt-and-surface after §12. Close-out must confirm: V3 (Supabase client accessible), smoke test 3 (realtime cross-tab delivery), smoke test 7 (closed state read-only).**

**After seal: A-09 · CMD-ACCORD-CAPTURE-FILMSTRIP-1 is unblocked.**

---

*End Commission · A-08 · CMD-ACCORD-CAPTURE-CHAT-1.*
