# Commission · CMD-ACCORD-CONSTELLATION-SLIDESHOW-1

**Phase:** New Architecture Track — New user onboarding slideshow
**Authored:** 2026-05-13
**Operator:** Vaughn Staples
**Architect:** Claude (Pluto)
**Spec authority:** Operator direction 2026-05-12
**Predecessor:** CMD-ACCORD-MY-MEETINGS-1 sealed · X-17/X-18 sealed
**Successor:** CMD-ACCORD-SCHEDULE-1
**IR66 in effect:** Diagnose via console before any file change
**IR67 in effect:** Version + date in every modified file header
**IR68 in effect:** One diagnostic at a time
**IR69 in effect:** Test instructions proactively, one step at a time
**Coding agent:** execute sequentially; halt-and-surface after §7

---

## §1 — Scope

When a user has no visible workstreams (new employee, external invitee who
hasn't organized anything), the constellation zone shows an empty dark canvas.
This CMD replaces that empty state with a five-slide auto-advancing slideshow
that introduces Accord's capabilities.

**Trigger:** `local.workstreams.length === 0` in `accord-rails.js` `_renderTree()`
**Dismissal:** Permanently hidden once the user creates their first workstream.
  State stored in `localStorage` key `accord-slideshow-dismissed`.
  Also dismissed if the user already has workstreams on any future load.

**Slideshow lives in:** `#ac-constellation-host` — the center pane element
that `AccordConstellation.init()` normally populates.

**Five slides:**
1. What Accord is — "Accord is where your meetings become institutional memory."
2. The meeting lifecycle — SETUP → CAPTURE → RECORD
3. Decisions and actions — sealed decisions, tracked actions
4. Your team in real time — attendees, presence, live chat
5. Ready to start — "Create your first workstream to organize your meetings."

**`+ NEW WORKSTREAM` button** present on every slide — always visible,
never requires waiting for slide 5. On slide 5 the button pulses gently.

**What does NOT ship:**
- Slide content editing from the UI
- More than 5 slides
- Video or animated graphics — text + ambient SVG only
- Mobile/narrow viewport optimization

---

## §2 — IR64 verification (before writing any code)

**V1 — Constellation host and empty state:**
```javascript
var host = document.getElementById('ac-constellation-host');
console.log('constellation host:', host?.id, host?.className);
console.log('host dimensions:', host?.offsetWidth, 'x', host?.offsetHeight);

// Check localStorage dismissed state
console.log('slideshow-dismissed:',
  localStorage.getItem('accord-slideshow-dismissed'));

// Check current workstream count
console.log('workstreams:', window.Accord?.state ?
  'check local in accord-rails' : 'not accessible');
```

**V2 — New workstream button selector:**
```javascript
// Find the existing + NEW WORKSTREAM button in the rail
var newWsBtn = document.querySelector(
  '[data-action="create-workstream"], .ac-new-workstream-btn, #newWorkstreamBtn'
);
console.log('new workstream btn:', newWsBtn?.className, newWsBtn?.dataset.action);
console.log('btn text:', newWsBtn?.textContent?.trim());
```

**V3 — Confirm `accord:workstream-created` event fires on new workstream:**
```javascript
// Wire a one-time listener to confirm the event name
window.addEventListener('accord:workstream-created', function(ev) {
  console.log('[TEST] accord:workstream-created fired:', JSON.stringify(ev.detail));
}, { once: true });
console.log('listener armed — create a workstream to confirm event name');
```
Note: V3 is informational only — do not create a workstream just for this test.
Confirm event name from `accord-rails.js` source (already uploaded).

Report V1–V3 in close-out.

---

## §3 — No substrate changes

Slideshow state stored in `localStorage` only.
No new tables. No migrations.

---

## §4 — Slideshow module

New file: `accord-slideshow.js`

```javascript
// ============================================================
// ProjectHUD — accord-slideshow.js
// Constellation zone onboarding slideshow for new users.
// Shows when user has no visible workstreams.
// Dismissed permanently on first workstream creation.
// Version: [IR67 — set to current version on deploy]
// Modified: [IR67 — set to deploy date]
// ============================================================

(function() {
  'use strict';

  var STORAGE_KEY    = 'accord-slideshow-dismissed';
  var _slideIndex    = 0;
  var _slideTimer    = null;
  var _SLIDE_DURATION = 7000;  // ms per slide

  var SLIDES = [
    {
      label:    '01',
      headline: 'Your meetings,\npreserved.',
      body:     'Accord is where decisions are dated, attributed, and sealed. Every meeting becomes institutional memory.',
      accent:   'var(--ac-cyan)',
    },
    {
      label:    '02',
      headline: 'Three moments.\nOne record.',
      body:     'Prepare before. Capture during. Reference after. The Setup shell, Live Capture, and record surfaces work together seamlessly.',
      accent:   'var(--ac-amber)',
    },
    {
      label:    '03',
      headline: 'Decisions sealed.\nActions tracked.',
      body:     'Every decision is cryptographically sealed and immutable. Every action is owned, dated, and followed to completion.',
      accent:   'var(--ac-cyan)',
    },
    {
      label:    '04',
      headline: 'Your team,\nin real time.',
      body:     'See who is in the room. Follow the thread. Chat with attendees. RSVP from your inbox. Accord keeps everyone aligned.',
      accent:   'var(--ac-amber)',
    },
    {
      label:    '05',
      headline: 'Ready\nwhen you are.',
      body:     'Create your first workstream to organize your meetings. Each workstream is a thread of meetings with shared context and history.',
      accent:   'var(--ac-cyan)',
      cta:      true,  // pulse the + NEW WORKSTREAM button on this slide
    },
  ];

  // ── Public API ──────────────────────────────────────────────
  window.AccordSlideshow = {
    shouldShow:  _shouldShow,
    mount:       _mount,
    dismount:    _dismount,
    dismiss:     _dismiss,
  };

  function _shouldShow() {
    return !localStorage.getItem(STORAGE_KEY);
  }

  function _dismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    _dismount();
  }

  function _dismount() {
    _stopTimer();
    var el = document.getElementById('ac-slideshow');
    if (el) el.remove();
  }

  // ── Mount ───────────────────────────────────────────────────
  function _mount(host) {
    if (!host) return;
    if (document.getElementById('ac-slideshow')) return;  // idempotent

    var el = document.createElement('div');
    el.id = 'ac-slideshow';
    el.className = 'ac-slideshow';
    host.appendChild(el);

    _slideIndex = 0;
    _paintSlide(el);
    _startTimer(el);

    // Dismiss on first workstream creation
    window.addEventListener('accord:workstream-created', function _onWsCreated() {
      _dismiss();
      window.removeEventListener('accord:workstream-created', _onWsCreated);
    });
  }

  // ── Timer ───────────────────────────────────────────────────
  function _startTimer(el) {
    _stopTimer();
    _slideTimer = setInterval(function() {
      _slideIndex = (_slideIndex + 1) % SLIDES.length;
      _paintSlide(el);
    }, _SLIDE_DURATION);
  }

  function _stopTimer() {
    if (_slideTimer) { clearInterval(_slideTimer); _slideTimer = null; }
  }

  // ── Paint ───────────────────────────────────────────────────
  function _paintSlide(el) {
    var slide = SLIDES[_slideIndex];
    var isCta = !!slide.cta;

    el.innerHTML = [
      '<div class="ac-ss-inner">',
        '<div class="ac-ss-ambient"></div>',
        '<div class="ac-ss-content">',
          '<div class="ac-ss-label" style="color:' + slide.accent + '">' +
            _esc(slide.label) + '</div>',
          '<h2 class="ac-ss-headline">' +
            _esc(slide.headline).replace(/\n/g, '<br>') + '</h2>',
          '<p class="ac-ss-body">' + _esc(slide.body) + '</p>',
          '<button class="ac-ss-cta' + (isCta ? ' ac-ss-cta--pulse' : '') + '" ' +
            'data-action="ss-new-workstream">+ NEW WORKSTREAM</button>',
        '</div>',
        '<div class="ac-ss-dots">',
          SLIDES.map(function(_, i) {
            return '<span class="ac-ss-dot' +
                   (i === _slideIndex ? ' ac-ss-dot--active' : '') + '" ' +
                   'data-action="ss-goto" data-index="' + i + '"></span>';
          }).join(''),
        '</div>',
        '<div class="ac-ss-nav">',
          '<button class="ac-ss-prev" data-action="ss-prev">‹</button>',
          '<button class="ac-ss-next" data-action="ss-next">›</button>',
        '</div>',
      '</div>',
    ].join('');

    // Wire events
    el.addEventListener('click', function _onClick(ev) {
      var action = ev.target.dataset.action ||
                   ev.target.closest('[data-action]')?.dataset.action;
      if (!action) return;

      if (action === 'ss-new-workstream') {
        window.AccordWorkstreams?.openCreate?.();
        return;
      }
      if (action === 'ss-prev') {
        _stopTimer();
        _slideIndex = (_slideIndex - 1 + SLIDES.length) % SLIDES.length;
        _paintSlide(el);
        _startTimer(el);
        return;
      }
      if (action === 'ss-next') {
        _stopTimer();
        _slideIndex = (_slideIndex + 1) % SLIDES.length;
        _paintSlide(el);
        _startTimer(el);
        return;
      }
      if (action === 'ss-goto') {
        var idx = parseInt(ev.target.closest('[data-index]')?.dataset.index, 10);
        if (!isNaN(idx)) {
          _stopTimer();
          _slideIndex = idx;
          _paintSlide(el);
          _startTimer(el);
        }
        return;
      }
    });
  }

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
```

---

## §5 — Integration in `accord-rails.js`

### §5.1 — In `_renderTree()`, replace the empty state:

**Find (line 172–175):**
```javascript
if (!local.workstreams.length) {
  body.innerHTML = '<div class="ac-tree-empty">No workstreams yet.<br>Create one to organize meetings.</div>';
  return;
}
```

**Replace with:**
```javascript
if (!local.workstreams.length) {
  body.innerHTML = '<div class="ac-tree-empty">No workstreams yet.<br>Use + NEW WORKSTREAM to begin.</div>';
  // Mount slideshow in constellation host if not already dismissed
  if (window.AccordSlideshow && window.AccordSlideshow.shouldShow()) {
    var ssHost = document.getElementById('ac-constellation-host');
    if (ssHost) window.AccordSlideshow.mount(ssHost);
  }
  return;
}
// If workstreams exist — dismiss slideshow if somehow still showing
if (window.AccordSlideshow) window.AccordSlideshow.dismiss();
```

### §5.2 — Load `accord-slideshow.js` in `accord.html`

Add script tag after existing Accord script tags:
```html
<script src="/js/accord-slideshow.js?v=<current-version>"></script>
```

---

## §6 — CSS in `accord-views.css`

```css
/* ── Constellation onboarding slideshow ─────────────── */
.ac-slideshow {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--ac-bg-deep);
}

.ac-ss-inner {
  position: relative;
  width: 100%;
  max-width: 560px;
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 20px;
}

/* Ambient background glow */
.ac-ss-ambient {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 500px;
  height: 500px;
  background: radial-gradient(
    circle at center,
    rgba(94,234,212,0.04) 0%,
    transparent 70%
  );
  pointer-events: none;
  z-index: 0;
}

.ac-ss-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.ac-ss-label {
  font-family: var(--ac-font-mono);
  font-size: 10px;
  letter-spacing: 2px;
  font-weight: 700;
  opacity: 0.7;
}

.ac-ss-headline {
  font-size: 36px;
  font-weight: 700;
  color: var(--ac-text-primary);
  line-height: 1.2;
  margin: 0;
  letter-spacing: -0.5px;
}

.ac-ss-body {
  font-size: 14px;
  color: var(--ac-text-tertiary);
  line-height: 1.7;
  max-width: 400px;
  margin: 0;
}

/* ── CTA button ─────────────────────────────────────── */
.ac-ss-cta {
  font-family: var(--ac-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  padding: 10px 24px;
  background: transparent;
  color: var(--ac-cyan);
  border: 1px solid rgba(94,234,212,0.4);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  margin-top: 8px;
}
.ac-ss-cta:hover {
  background: rgba(94,234,212,0.08);
  border-color: rgba(94,234,212,0.7);
}
.ac-ss-cta--pulse {
  animation: ac-ss-pulse 2.5s ease-in-out infinite;
}
@keyframes ac-ss-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(94,234,212,0.3); }
  50%       { box-shadow: 0 0 0 8px rgba(94,234,212,0); }
}

/* ── Dot indicators ─────────────────────────────────── */
.ac-ss-dots {
  display: flex;
  gap: 8px;
  position: relative;
  z-index: 1;
}
.ac-ss-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ac-border-mid);
  cursor: pointer;
  transition: background 0.2s, transform 0.2s;
}
.ac-ss-dot--active {
  background: var(--ac-cyan);
  transform: scale(1.3);
}
.ac-ss-dot:hover { background: var(--ac-text-tertiary); }

/* ── Prev / Next nav ────────────────────────────────── */
.ac-ss-nav {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  display: flex;
  justify-content: space-between;
  padding: 0 12px;
  pointer-events: none;
  z-index: 2;
}
.ac-ss-prev, .ac-ss-next {
  font-size: 20px;
  color: var(--ac-text-faint);
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  pointer-events: auto;
  transition: color 0.15s;
  line-height: 1;
}
.ac-ss-prev:hover, .ac-ss-next:hover { color: var(--ac-text-secondary); }
```

---

## §7 — Smoke tests

| # | Test | Expected |
|---|---|---|
| 1 | Load Accord as Angela (no workstreams she organized) | Slideshow appears in constellation zone. Slide 1 headline: "Your meetings, preserved." |
| 2 | Auto-advance | Slide advances to slide 2 after 7 seconds without interaction. |
| 3 | Manual dot navigation | Click dot 3 → jumps to slide 3 immediately. Timer resets. |
| 4 | Prev / Next arrows | ‹ and › navigate slides. Timer resets on each click. |
| 5 | Slide 5 CTA pulse | Navigate to slide 5. "+ NEW WORKSTREAM" button pulses gently. |
| 6 | + NEW WORKSTREAM click | Opens create workstream modal (AccordWorkstreams.openCreate). |
| 7 | Workstream created → dismiss | Create a workstream. Slideshow disappears. Constellation orbs render. `localStorage.getItem('accord-slideshow-dismissed')` returns `'1'`. |
| 8 | Dismissed state persists | Hard refresh. Slideshow does not reappear. Constellation renders normally. |
| 9 | Vaughn (has workstreams) | Slideshow never appears. Constellation renders as normal. |
| 10 | Reset for re-test | Run `localStorage.removeItem('accord-slideshow-dismissed')` + hard refresh → slideshow reappears. |

---

## §8 — Files manifest

| File | Change |
|---|---|
| `accord-slideshow.js` | NEW — standalone slideshow module |
| `accord-rails.js` | `_renderTree` empty-state amendment — mount slideshow + dismiss on first workstream |
| `accord-views.css` | `.ac-ss-*` styles appended |
| `accord.html` | Script tag for `accord-slideshow.js` |
| `version.js` | Operator-managed (IR65) |

---

## §9 — Discipline checklist

- `var` only in all JS
- IR66: console diagnosis before any file change
- IR67: version + date in `accord-slideshow.js` header
- IR68: one diagnostic at a time
- IR69: test instructions proactively, one step at a time
- `data-action` on all interactive elements — no anonymous onclicks
- `_stopTimer()` called before any `_startTimer()` — no stacked intervals
- `accord:workstream-created` listener is named and self-removing
- Slideshow mounts idempotently — `getElementById('ac-slideshow')` guard
- `dismiss()` also calls `dismount()` — no orphaned DOM
- `--ac-*` token values sourced from deployed `accord-meeting-setup.css` per IR66

---

**Halt-and-surface after §7. Close-out must confirm V1 (host dimensions),
smoke test 7 (dismiss on workstream creation), and smoke test 8 (persists
across hard refresh).**

**After seal: CMD-ACCORD-SCHEDULE-1 is unblocked.**

---

*End Commission · CMD-ACCORD-CONSTELLATION-SLIDESHOW-1.*
