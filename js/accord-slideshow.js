// ============================================================
// ProjectHUD — accord-slideshow.js
// Constellation zone onboarding slideshow for new users.
// Shows when user has no visible workstreams.
// Dismissed permanently on first workstream creation.
// Version: v20260509-CMD-ACCORD-MEETING-SETUP-129p
// Modified: 2026-05-13
// Fix: expose dismiss in public API (IR67)
// ============================================================

(function() {
  'use strict';

  var STORAGE_KEY     = 'accord-slideshow-dismissed';
  var _slideIndex     = 0;
  var _slideTimer     = null;
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
    shouldShow: _shouldShow,
    mount:      _mount,
    dismount:   _dismount,
    dismiss:    _dismiss,
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
    el.id        = 'ac-slideshow';
    el.className = 'ac-slideshow';
    host.appendChild(el);

    _slideIndex = 0;
    _paintSlide(el);
    _startTimer(el);

    // Dismiss on first workstream creation — named, self-removing listener
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

    var dots = SLIDES.map(function(_, i) {
      return '<span class="ac-ss-dot' +
             (i === _slideIndex ? ' ac-ss-dot--active' : '') +
             '" data-action="ss-goto" data-index="' + i + '"></span>';
    }).join('');

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
          dots,
        '</div>',
        '<div class="ac-ss-nav">',
          '<button class="ac-ss-prev" data-action="ss-prev">&#8249;</button>',
          '<button class="ac-ss-next" data-action="ss-next">&#8250;</button>',
        '</div>',
      '</div>',
    ].join('');

    // Wire delegated click handler on the fresh innerHTML
    el.addEventListener('click', function _onClick(ev) {
      var target = ev.target;
      var actionEl = target.dataset && target.dataset.action
        ? target
        : (target.closest ? target.closest('[data-action]') : null);
      if (!actionEl) return;
      var action = actionEl.dataset.action;

      if (action === 'ss-new-workstream') {
        if (window.AccordWorkstreams && typeof window.AccordWorkstreams.openCreate === 'function') {
          window.AccordWorkstreams.openCreate();
        }
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
        var dotEl = actionEl.closest ? actionEl.closest('[data-index]') : actionEl;
        var idx = dotEl ? parseInt(dotEl.dataset.index, 10) : NaN;
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