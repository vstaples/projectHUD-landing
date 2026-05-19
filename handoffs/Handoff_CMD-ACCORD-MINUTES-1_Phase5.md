# HANDOFF — CMD-ACCORD-MINUTES-1 · Phase 5: Route + Send Flow

**Date:** 2026-05-19
**CMD:** M-01 · CMD-ACCORD-MINUTES-1
**Operator:** Vaughn Staples
**Phase:** 5 of 6 — Full send flow wired end-to-end.

---

## §0 — PRE-FLIGHT

Read `Brief_CMD-ACCORD-MINUTES-1.md` end-to-end before proceeding.
Read all prior phase findings — all carry forward.
Session protocol: terse mode; test Chrome connection first; Test Mode after
each code update — one checklist item at a time.
Iron Rules 36, 40 §1, 47, 64, 71, 72, 73 apply.
`var` only — no `let`/`const`.
Deliver in §6 file order, then operator review note, then §7 checklist. Stop.

---

## §1 — CARRY-FORWARD

**Phase 1 — `accord_minutes_renders` INSERT approach:**
Read existing render record by `meeting_id` first. If found, use it.
If not found (Edge Function failed or didn't run), INSERT stub:
```javascript
{
  firm_id:        Accord.state.firm.id,
  meeting_id:     _meeting.meeting_id,
  rendered_by:    Accord.state.resource.id,
  rendered_at:    new Date().toISOString(),
  render_version: 'v1',
  storage_path:   'pending',
  status:         'pending',
  template_id:    'default'
}
```
`render_id` from either path is required before inserting recipients.

**Phase 1 — `accord_minutes_recipients` schema:**
`recipient_id (PK) | firm_id | render_id (FK) | resource_id (nullable) | external_email (nullable)`
Constraint: exactly one of `resource_id` or `external_email` must be non-null.
RLS: INSERT firm-scoped, SELECT firm-scoped. Append-only (no UPDATE/DELETE).

**Phase 4 — Minutes is read-only:**
No contenteditable, no node PATCHes. Only × soft-delete and + Add remain.

**`_excludedNodeIds` Set:** built across Phases 3 and 4. Pass to send flow.

---

## §2 — INPUTS

| File | Purpose |
|------|---------|
| `accord-minutes.js` | Phase 4 output — extend with Route + Send flow |

---

## §3 — DELIVERABLES

1. `accord-minutes.js` — extended with full Route + Send flow
2. Operator review checkpoint before Phase 6

---

## §4 — BUILD SPEC

### 4.1 — Route + Send button

Already rendered in Phase 2, disabled until all 6 checklist items checked.
Wire click handler this phase. On click → open send modal.

### 4.2 — Send modal

Centered modal. Backdrop `rgba(0,0,0,.7)` + `backdrop-filter:blur(3px)`.
Modal: `background:var(--raised); border:1px solid var(--b2); border-radius:10px; padding:24px; width:460px`
Animation: `opacity:0 + scale(.95) + translateY(6px)` → normal, 130ms ease-out.

**Modal structure:**
```
Route + Send Minutes
C-11 Percolate Smoke Test Meeting · [formatted date]

SENDING TO
[recipient list]

ADD EXTERNAL RECIPIENTS
[email input]

[note about excluded entries]

[Cancel]    [Send Minutes ↑]
```

**Recipient list:**
Pre-populate from `_attendees` (loaded in Phase 2).
Each row: avatar chip + name + role label + toggle checkbox.
Role label: "Organizer" if `organizer_id` matches; "Attended" if rsvp accepted;
"Invited · absent" otherwise.
Toggle: checked by default. Unchecked = excluded from send.

**External recipients input:**
`placeholder: "email@example.com — separate multiple with commas"`
Validate on send: split by comma, trim, basic `/.+@.+\..+/` check per address.
Invalid addresses → show inline error, block send.

**Excluded entries note:**
`font-size:12px; color:var(--lo); font-style:italic; border-left:2px solid var(--b2); padding-left:8px`
Text: "Recipients receive a clean formatted minutes document. Excluded entries
will not appear."
If `_excludedNodeIds.size > 0`: append `· [N] entries excluded.`

**Cancel:** closes modal, no state change.
**Send Minutes ↑:** fires `_doSend()`.

### 4.3 — `_doSend()` function

```javascript
function _doSend() {
  // 1. Disable Send button immediately — prevent double-fire
  var btn = document.getElementById('ac-min-send-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  // 2. Collect checked internal recipients
  var internalIds = [];
  document.querySelectorAll('.ac-min-recip-toggle:checked').forEach(function(cb) {
    internalIds.push(cb.dataset.resourceId);
  });

  // 3. Collect + validate external emails
  var extInput = document.getElementById('ac-min-ext-email');
  var externalEmails = [];
  if (extInput && extInput.value.trim()) {
    var raw = extInput.value.split(',');
    for (var i = 0; i < raw.length; i++) {
      var addr = raw[i].trim();
      if (addr && !/.+@.+\..+/.test(addr)) {
        // Show inline error, re-enable button, abort
        _showSendError('Invalid email: ' + addr);
        btn.disabled = false; btn.textContent = 'Send Minutes ↑';
        return;
      }
      if (addr) externalEmails.push(addr);
    }
  }

  // 4. Get or create render record
  _getOrCreateRender().then(function(renderId) {

    // 5. Build recipient INSERT array
    var rows = [];
    internalIds.forEach(function(rid) {
      rows.push({ firm_id: Accord.state.firm.id, render_id: renderId,
                  resource_id: rid, external_email: null });
    });
    externalEmails.forEach(function(email) {
      rows.push({ firm_id: Accord.state.firm.id, render_id: renderId,
                  resource_id: null, external_email: email });
    });

    if (rows.length === 0) {
      _showSendError('No recipients selected.');
      btn.disabled = false; btn.textContent = 'Send Minutes ↑';
      return;
    }

    // 6. INSERT recipients (append-only)
    return API.post('accord_minutes_recipients', rows);

  }).then(function() {

    // 7. Success state
    _closeSendModal();
    _setSentState();

  }).catch(function(err) {
    console.error('[AccordMinutes] _doSend failed', err);
    _showSendError('Send failed. Please try again.');
    if (btn) { btn.disabled = false; btn.textContent = 'Send Minutes ↑'; }
  });
}
```

### 4.4 — `_getOrCreateRender()` helper

Returns a Promise that resolves to a `render_id`.

```javascript
function _getOrCreateRender() {
  // Try to read existing render record
  return API.get('accord_minutes_renders?meeting_id=eq.' + _meeting.meeting_id
    + '&order=rendered_at.desc&limit=1')
  .then(function(rows) {
    if (rows && rows.length > 0) {
      return rows[0].render_id;
    }
    // No render record — INSERT stub
    return API.post('accord_minutes_renders', {
      firm_id:        Accord.state.firm.id,
      meeting_id:     _meeting.meeting_id,
      rendered_by:    Accord.state.resource.id,
      rendered_at:    new Date().toISOString(),
      render_version: 'v1',
      storage_path:   'pending',
      status:         'pending',
      template_id:    'default'
    }).then(function(row) {
      return row.render_id;
    });
  });
}
```

**IR47:** Confirm `API.post()` returns the inserted row (requires
`Prefer: return=representation` header). If not, fetch the render record
after INSERT to get `render_id`. Surface finding in delivery.

### 4.5 — `_setSentState()`

After successful send:
1. State badge → `"Sent · [formatted time]"` (blue: `var(--dec-bg)/var(--dec)/var(--dec-bd)`)
2. Route + Send button → `"Sent ✓"`, `opacity:.5`, `pointer-events:none`
3. Checklist items remain checked (do not reset)

### 4.6 — Modal helpers

```javascript
function _openSendModal()  { document.getElementById('ac-min-modal').style.display = 'flex'; }
function _closeSendModal() { document.getElementById('ac-min-modal').style.display = 'none'; }
function _showSendError(msg) {
  var el = document.getElementById('ac-min-send-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
```

Click backdrop to close (if not mid-send). ESC key closes modal.

---

## §5 — IRON RULE REMINDERS

**IR47:**
1. Confirm `API.post()` returns inserted row before relying on `render_id`
   from INSERT response. Surface finding explicitly.
2. Confirm `accord_minutes_renders` INSERT does not violate any trigger
   (check for `accord_minutes_renders_*_trg` triggers before INSERT).

**IR71:** Send button disabled immediately on click — prevents double-fire.
Re-enabled only on error. Never re-enabled on success.

**IR73:** `_getOrCreateRender` reads with `meeting_id=eq.[id]` filter —
correct scope, no cross-meeting contamination.

---

## §6 — FILE ORDER

1. `accord-minutes.js` — full file with Route + Send flow added

Then: operator review note.
Then: §7 checklist verbatim. Stop.

---

## §7 — PHASE 5 CHECKLIST

- [ ] IR47: API.post() return=representation confirmed and surfaced
- [ ] IR47: accord_minutes_renders triggers checked before INSERT
- [ ] Route + Send button click opens modal
- [ ] Modal renders: title, date, recipient list, external input, note, buttons
- [ ] Recipient list pre-populated from _attendees with role labels
- [ ] Recipients checked by default; toggle unchecks correctly
- [ ] External email input accepts comma-separated addresses
- [ ] Invalid email format shows inline error, blocks send
- [ ] Cancel closes modal, no state change
- [ ] Send button disabled immediately on click (IR71)
- [ ] _getOrCreateRender reads existing render record if present
- [ ] _getOrCreateRender inserts stub if no render record exists
- [ ] render_id resolved correctly from either path
- [ ] accord_minutes_recipients INSERT fires per recipient
- [ ] Internal recipients: resource_id set, external_email null
- [ ] External recipients: external_email set, resource_id null
- [ ] Zero recipients selected → inline error, button re-enables
- [ ] Send failure → inline error, button re-enables
- [ ] On success: modal closes, badge → "Sent · [time]", button → "Sent ✓" disabled
- [ ] _excludedNodeIds.size shown in modal note when > 0
- [ ] Backdrop click closes modal (when not mid-send)
- [ ] `var` only — no `let`/`const`

---

**Ship it.**
