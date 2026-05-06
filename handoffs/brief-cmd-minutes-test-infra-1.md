# Brief · Test infrastructure prerequisites + END MEETING confirmation rename · CMD-MINUTES-TEST-INFRA-1

## §0 — Standing rules for fresh agent

Read before proceeding.

**Iron Rule 36** — hand-off terseness.
**Iron Rule 37** — work silently mid-execution.
**Iron Rule 38** — consumer enumeration in §10.
**Iron Rule 40** — halt on missing input.
**Iron Rule 51** — class-conditional treatments at construction time.
**Iron Rule 52 §4** — function-name and logical-concern collision check.
**Iron Rule 64** — codebase-as-spec; survey existing patterns before introducing new mechanisms.
**Iron Rule 65** — render-version dual-pin applies only to template body changes. **This CMD does NOT modify any render template body bytes; `RENDER_VERSION` does NOT need to move. Bump only `js/version.js`.**

This is a small focused CMD. Three loosely-related changes that share no dependencies but bundle naturally as test-infrastructure prerequisites. Total scope: ~1-2 hours.

---

## §1 — Purpose

Three small changes that improve operator workflow during testing and verification:

1. **Console echo of meeting metadata on selection** — when the operator clicks a meeting in the Minutes rail, the dev console echoes the meeting's title, ID, and selected sealed metadata. Future Aegis-runner verification scripts depend on this echo to capture meeting IDs without operator copy-paste from the database.

2. **Humanized download filenames** — rendered artifacts download with filenames like `10.4-risk-fixture-technical-briefing.html` instead of `8ac92d42-bc83-4f6d-bbf5-a22ae81481e9.html`. Operators cross-referencing files mid-test against meeting names instead of UUIDs.

3. **END MEETING confirmation button rename** — the END MEETING modal's confirm button currently reads "END MEETING" (same label as the trigger button), creating ambiguity. Rename to "CONFIRM" — clearer modal-action language; no code beyond a single string change.

After this CMD ships:

1. Operators see meeting names, not UUIDs, in dev console output during selection
2. Downloaded files carry self-describing names that map to meetings and templates
3. The END MEETING confirmation flow has unambiguous button labeling
4. The path is clear for CMD-AEGIS-CMD-RUNNER to depend on console echo as a state-capture channel

---

## §2 — Scope

### In scope

- Add console.log statement in `js/accord-minutes.js` `_selectMeeting()` (or equivalent meeting-selection handler) emitting structured object: `{ event: 'minutes.meeting.selected', meeting_id, title, sealed_at, render_count }`
- Modify the download filename generation in `js/accord-minutes.js` (the `_signedUrlFor()` call site that uses `download: filename` flag per Iron Rule 62) to compose filename from `<meeting_title_slug>-<template_id>.<ext>` pattern
- Modify `accord.html` meeting-end confirmation modal — change button label from "END MEETING" to "CONFIRM"
- Behavioral verification per §6
- Version pin bump to CMD-MINUTES-TEST-INFRA-1 (front-end only; no `RENDER_VERSION` change)
- Hand-off per §9

### Out of scope

- Any changes to the render template body or Edge Function (this is the discriminator from Iron Rule 65; the rule does not fire here)
- Any other UX-polish backlog items (those bundle into CMD-MINUTES-UX-POLISH-1, separate brief)
- Schema changes
- New CoC events
- Aegis runner changes (CMD-AEGIS-CMD-RUNNER, separate brief; this CMD is the prerequisite that lets that brief assume console echo is reliable)
- Surface-module restructuring beyond the targeted changes

---

## §3 — Implementation specification

### §3.1 Console echo on meeting selection

The Minutes rail (in `js/accord-minutes.js`) has a meeting-selection handler. It is invoked when the operator clicks a meeting card in the rail. Likely named `_selectMeeting()` or `_onMeetingSelected()` or similar — agent locates the function via codebase survey.

Add a `console.log` at the entry of the handler (or the appropriate location after meeting metadata is loaded):

```javascript
console.log('[accord-minutes] meeting selected:', {
  meeting_id: meeting.meeting_id,
  title: meeting.title,
  sealed_at: meeting.sealed_at,
  render_count: meeting.render_count || 0
});
```

The structured object format (NOT a string) is required — future Aegis scripts will parse the console output as structured data. Use a top-level key (`[accord-minutes]`) for grep-ability.

If `render_count` is not currently a field on the meeting object loaded into the rail, omit that field rather than adding a substrate query. The required fields are `meeting_id`, `title`, `sealed_at`. `render_count` is nice-to-have if cheap.

### §3.2 Humanized download filenames

The current download flow in `js/accord-minutes.js` calls `_signedUrlFor()` with the storage path. Per Iron Rule 62, the `download: filename` flag forces attachment Content-Disposition. The current filename is the render_id with file extension.

Change the filename construction to:

```javascript
function _composeFilename(meeting, templateId, fileExt) {
  const slug = meeting.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')      // non-alphanumeric → dash
    .replace(/^-+|-+$/g, '')           // trim leading/trailing dashes
    .substring(0, 60);                 // bound length
  return `${slug}-${templateId}.${fileExt}`;
}
```

Edge cases:

- If `meeting.title` is empty or null → fall back to `meeting-${meeting.meeting_id.substring(0, 8)}-${templateId}.${fileExt}`
- If the slug is empty after sanitization → same fallback
- File extension comes from the existing storage_path (`.html` for HTML fallback renders; future `.pdf` for real PDFs when CMD-PDF-LIB-REFACTOR ships)

The filename is passed to `_signedUrlFor()` as the `download:` flag value:

```javascript
const filename = _composeFilename(meeting, render.template_id, fileExt);
const signedUrl = await _signedUrlFor(render.storage_path, { download: filename });
```

This change applies to BOTH download paths:

1. The "Download" button in the render-status card (current render)
2. The "download this version" links in the render-history panel

If both paths share a helper, the helper update propagates to both. If they have separate code paths, both update.

### §3.3 END MEETING confirmation button rename

In `accord.html`, locate the modal markup for the END MEETING confirmation flow. The modal opens when the operator clicks the END MEETING trigger button in the Live Capture surface. The modal currently has two buttons: a Cancel button and a Confirm button. The Confirm button currently reads "END MEETING" (likely styled as a primary destructive action).

Change the button text from "END MEETING" to "CONFIRM". Preserve the destructive/primary styling (the button is still the action button; the relabeling is purely textual).

If the button label is set programmatically in `js/accord-core.js` rather than statically in HTML, change it there.

Before-after:

```html
<!-- Before -->
<button class="btn-end-meeting-confirm">END MEETING</button>

<!-- After -->
<button class="btn-end-meeting-confirm">CONFIRM</button>
```

If the button has an aria-label or other accessibility attribute echoing the text, update that too.

---

## §4 — Codebase survey requirements (Iron Rule 64)

Before making changes, the agent surveys the existing patterns:

1. **For console echo** — search the codebase for existing `console.log` patterns in surface modules. Match the conventional format (`[module-name] event-description:` prefix). Do not invent a new logging convention if one exists.

2. **For filename composition** — search for any existing slug-generation utility. If `_slugify()` or similar exists, use it. If not, the inline implementation in §3.2 is acceptable; no need to extract into a separate utility for this CMD.

3. **For the modal button** — search for the END MEETING confirmation flow's current implementation. Verify whether the button text is HTML-static or JS-set. Apply the change in the correct location.

If any survey reveals a divergent pattern from §3 specifications, halt and surface — the brief defers to established conventions per Iron Rule 64.

---

## §5 — Behavioral verification

### §5.1 Sentinel — code identity

1. Hard-refresh accord.html. Console banner shows CMD-MINUTES-TEST-INFRA-1.
2. **PASS** = post-CMD code is loaded.

### §5.2 Console echo on meeting selection

1. Open dev console.
2. Navigate to Minutes surface.
3. Click any sealed meeting in the rail.
4. Verify console output appears with the structured format from §3.1.
5. Verify the output contains `meeting_id`, `title`, `sealed_at` (and `render_count` if implemented).
6. Click a different meeting; verify the echo fires again with the new meeting's metadata.
7. **PASS** = console echo functional and structurally consistent.

### §5.3 Humanized download filename — current render

1. Select a meeting with a successful render of any template.
2. Click the "Download" button on the current render.
3. Verify the saved file's name follows the pattern `<title-slug>-<template_id>.<ext>`.
4. Example: meeting "10.4 Risk Fixture" with technical-briefing template should download as `10-4-risk-fixture-technical-briefing.html`.
5. **PASS** = filename humanization works for current render.

### §5.4 Humanized download filename — history panel

1. With the same meeting, locate a previous render in the history panel.
2. Click "download this version" on the previous render.
3. Verify the saved file's name follows the same pattern, with the correct template_id for that historical render.
4. **PASS** = filename humanization works for history downloads.

### §5.5 Filename edge cases

1. Find or create a meeting with an empty/null title (or use a meeting whose title contains only special characters).
2. Trigger a render and download.
3. Verify the fallback filename pattern `meeting-<id-prefix>-<template_id>.<ext>` is used.
4. **PASS** = edge case handling works.

### §5.6 END MEETING confirmation rename

1. In Live Capture, start a meeting (or open an in-progress meeting).
2. Click the END MEETING trigger button.
3. Verify the confirmation modal opens.
4. Verify the confirm button reads "CONFIRM" (NOT "END MEETING").
5. Verify the button still functions (clicking it ends the meeting, triggers seal, fires auto-render).
6. **PASS** = rename applied and functional.

### §5.7 Existing CMD regression

1. Live Capture, Living Document, Decision Ledger, Digest & Send, Minutes — all surfaces load without errors.
2. End a meeting; verify auto-render fires correctly with the renamed confirm button.
3. Existing renders downloadable (history panel intact).
4. Picker UI on Minutes surface intact.
5. **PASS** = no regression.

---

## §6 — Consumer enumeration (Iron Rule 38)

| File | Effect |
|---|---|
| `js/accord-minutes.js` | Console echo added to meeting-selection handler; download filename composition logic added (or modified if existing helper); applied to both current-render and history-panel download paths |
| `accord.html` | Confirm button label changed in END MEETING modal markup (if statically declared); also any aria-label updated |
| `js/accord-core.js` | If button label is set programmatically (not in HTML), updated here; otherwise audited only |
| `js/version.js` | Pin bump to CMD-MINUTES-TEST-INFRA-1 |

**No changes to:**
- Edge Function `render-minutes/index.ts` (Iron Rule 65: template body unchanged)
- Schema (no migrations)
- RLS policies
- CoC events
- Surface modules beyond the targeted changes

---

## §7 — Smoke test

Operator runs after deploy:

1. Hard-refresh accord.html. Console banner shows CMD-MINUTES-TEST-INFRA-1.
2. Open dev console. Click a meeting in the Minutes rail. Verify structured echo.
3. Download a render. Verify filename is humanized.
4. End a meeting. Verify confirmation modal button reads "CONFIRM."
5. Spot-check sibling surfaces (Live Capture, Living Document, Decision Ledger, Digest & Send) load cleanly.

---

## §8 — Hand-off format

Required output:

1. Files modified — one-liner per file.
2. Diff — unified diff for each modified file.
3. Smoke test result.
4. Behavioral verification results — per §5 subtest.
5. Findings — zero or more one-liners. Particularly:
   - Whether `_selectMeeting()` was the actual handler name or required adaptation
   - Whether a slug-generation utility existed in the codebase or required inline implementation
   - Whether the END MEETING button label was statically declared or programmatically set
   - Any discovered patterns worth surfacing for future test-infrastructure CMDs

---

## §9 — Reference materials

Required inputs (halt per Iron Rule 40 §1.1 if any are missing):

- This brief
- The current `js/accord-minutes.js` source (post-CMD-PROJECTION-ENGINE-2)
- The current `accord.html` source
- The current `js/accord-core.js` source
- `js/version.js`
- All Iron Rules ratifications 36-65
- `accord-vision-v1.md` (read for understanding only; not architecturally relevant to this CMD)
- `projecthud-functional-requirements-v1.md` (read for understanding only; not architecturally relevant to this CMD)

---

## §10 — Agent narrative instruction block

```
Apply brief-cmd-minutes-test-infra-1.md.

Three small changes bundled as test-infrastructure prerequisites
for the upcoming CMD-AEGIS-CMD-RUNNER. Estimated effort: ~1-2
hours. Single-focus CMD discipline applies (Iron Rule 36).

1. Console echo on meeting selection — structured object format
   per §3.1; future Aegis scripts depend on this as a state-
   capture channel.

2. Humanized download filenames — pattern <title-slug>-<template_id>
   .<ext> with edge-case fallback per §3.2.

3. END MEETING confirmation modal button rename "END MEETING" →
   "CONFIRM" per §3.3.

Iron Rule 65 specifically does NOT fire on this CMD: render
template body is unchanged. Bump js/version.js only;
RENDER_VERSION constant in render-minutes/index.ts does NOT need
to move.

Iron Rule 64 applies: survey existing console-log patterns,
existing slug-generation utilities, existing button-label
declaration patterns in the codebase before introducing new
mechanisms. Match conventions where they exist.

§5 specifies seven behavioral verification subtests. §5.2 (console
echo), §5.3 + §5.4 (filename humanization), §5.6 (button rename)
are the doctrinal-floor checks.

Hand-off format per §8: files, diff, smoke test, §5 results,
findings.

Halt on missing input. Halt if any §5 doctrinal-floor check fails.

Proceed.
```

---

*End of Brief — Test infrastructure prerequisites + END MEETING confirmation rename (CMD-MINUTES-TEST-INFRA-1).*
