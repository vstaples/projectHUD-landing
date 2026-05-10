// ============================================================
// ProjectHUD — accord-transitions.js
// CMD-ACCORD-CONSTELLATION-ENTRY-1 · Phase 4a
//
// Dissolve transition orchestrator. Reacts to accord:level-changed
// (dispatched by accord-core's setLevel) and swaps the center pane
// content with an opacity + transform-scale composite per Phase 1
// D5 reference (Accord Meeting Mockup v5 lines 273-278).
//
// Ascend (e.g. workstream → constellation): outgoing fades out,
// incoming fades in. Anchor-point math used for descent only.
//
// Descent (constellation → workstream / workstream → meeting):
// outgoing pane fades; incoming pane scales-in from the source
// element's bounding rect. Source element is detected at the
// listener boundary via accord:level-changed.detail OR via the
// last-clicked element captured by accord-rails / accord-core.
//
// Reduced-motion: transitions become instant swaps (single rAF
// frame between dispose + mount).
//
// IR64: anchor math reads getBoundingClientRect() on the actual
// rendered DOM node at click time, not assumed coordinates. If
// no source element is identifiable (e.g. ESC ascend, programmatic
// setLevel), falls back to centered fade.
// ============================================================

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  const TIMING = {
    OUT_MS:     180,
    IN_MS:      280,
    EASE:       'cubic-bezier(0.34, 1.56, 0.64, 1)',  // matches v5 mockup
    EASE_OUT:   'cubic-bezier(0.4, 0, 0.2, 1)',
  };

  const state = {
    centerHost:        null,    // .ac-center
    constellationHost: null,    // #ac-constellation-host
    viewHost:          null,    // dynamically-created sibling for views
    inFlight:          false,
    lastSourceRect:    null,    // optional bbox for anchored descent
  };

  function _ensureChrome() {
    if (state.centerHost) return;
    state.centerHost        = document.querySelector('.ac-center');
    state.constellationHost = $('ac-constellation-host');
    if (!state.centerHost) return;

    // View host (sibling of constellation host inside .ac-center)
    state.viewHost = document.createElement('div');
    state.viewHost.className = 'ac-view-host';
    state.viewHost.style.display = 'none';
    state.centerHost.appendChild(state.viewHost);
  }

  function _prefersReducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { return false; }
  }

  // Capture last-click source bounding rect — used as the descent anchor.
  // Multiple sources contribute: constellation node click, tree row click,
  // workstream-view list-row click. All bubble through document; we capture
  // before accord:level-changed fires.
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest(
      '#accord-app .ac-node, ' +                       // constellation node
      '#accord-app .ac-tree-row, ' +                   // left rail tree row
      '#accord-app .ac-list-row, ' +                   // workstream-view list row
      '#accord-app .ac-parking-row'                    // parking-lot row
    );
    if (el) {
      try { state.lastSourceRect = el.getBoundingClientRect(); }
      catch (e) { state.lastSourceRect = null; }
    } else {
      state.lastSourceRect = null;
    }
  }, true);  // capture phase — runs before listeners that call setLevel

  // ── Main transition handler ─────────────────────────────────
  async function _onLevelChanged(ev) {
    _ensureChrome();
    if (!state.centerHost) return;

    const { level, context } = ev.detail || {};
    if (state.inFlight) {
      // Coalesce rapid changes — finish the current and re-fire after
      setTimeout(() => _onLevelChanged(ev), TIMING.OUT_MS + TIMING.IN_MS + 16);
      return;
    }
    state.inFlight = true;

    try {
      if (level === 'constellation') {
        await _transitionToConstellation();
      } else if (level === 'workstream') {
        await _transitionToWorkstreamView(context?.workstreamId);
      } else if (level === 'meeting') {
        await _transitionToMeetingView(context?.meetingId, context?.workstreamId, context?.meetingState);
      }
    } catch (e) {
      console.error('[Accord-transitions] failed', e);
    } finally {
      state.inFlight = false;
    }
  }

  async function _transitionToConstellation() {
    if (!state.viewHost || !state.constellationHost) return;
    const reduced = _prefersReducedMotion();

    // Phase 5: detach surface host before unmounting view so meeting
    // tab content doesn't disappear into a destroyed parent.
    if (typeof window._accordDetachSurfaceHost === 'function') {
      window._accordDetachSurfaceHost();
    }

    // Fade out current view, fade in constellation
    if (state.viewHost.style.display !== 'none') {
      if (reduced) {
        state.viewHost.style.display = 'none';
        state.viewHost.innerHTML = '';
      } else {
        await _fadeOut(state.viewHost);
        state.viewHost.style.display = 'none';
        state.viewHost.innerHTML = '';
      }
    }
    state.constellationHost.style.display = '';
    if (!reduced) await _fadeIn(state.constellationHost);

    // Refresh the constellation in case substrate changed during descent
    if (window.AccordConstellation?.refresh) {
      try { await window.AccordConstellation.refresh(); } catch (e) {}
    }
  }

  async function _transitionToWorkstreamView(workstreamId) {
    if (!workstreamId || !state.viewHost) return;
    const reduced = _prefersReducedMotion();
    const sourceRect = state.lastSourceRect;

    // Render into the view host first (off-stage)
    if (window.AccordViews?.renderWorkstreamView) {
      await window.AccordViews.renderWorkstreamView(state.viewHost, workstreamId);
    }

    if (state.constellationHost?.style.display !== 'none') {
      if (reduced) {
        state.constellationHost.style.display = 'none';
        state.viewHost.style.display = '';
      } else {
        await _fadeOut(state.constellationHost);
        state.constellationHost.style.display = 'none';
        state.viewHost.style.display = '';
        await _scaleIn(state.viewHost, sourceRect);
      }
    } else {
      // workstream → workstream pivot (sub navigation): cross-fade only
      const swap = state.viewHost.cloneNode(true);
      // Simpler path: immediate replace + fade-in
      state.viewHost.style.display = '';
      if (!reduced) await _fadeIn(state.viewHost);
    }
  }

  async function _transitionToMeetingView(meetingId, workstreamId, meetingState) {
    if (!meetingId || !state.viewHost) return;
    const reduced = _prefersReducedMotion();
    const sourceRect = state.lastSourceRect;

    // Pre-apply fullpage classes before animation starts when the incoming
    // meeting is idle (Setup shell). This prevents the rails from flashing
    // into view during the transition. The classes are applied here rather
    // than waiting for AccordMeetingSetup.render() so the rails are already
    // hidden when the fade-out of the current surface begins.
    // Approach: meetingState passed via setLevel context payload — no extra
    // fetch required. Callers that know the meeting state (e.g. filmstrip
    // NEXT handler) set context.meetingState = 'idle'.
    if (meetingState === 'idle') {
      const appEl = document.getElementById('accord-app');
      if (appEl) appEl.classList.add('accord-setup-fullpage');
      document.body.classList.add('accord-setup-fullpage');
      // Preserve flag: tells _detachHandler not to remove fullpage classes
      // during the renderMeetingView call below (idle→idle navigation).
      window._setupPreserveFullpage = true;
    }

    if (window.AccordViews?.renderMeetingView) {
      await window.AccordViews.renderMeetingView(state.viewHost, meetingId, workstreamId);
    }

    // Clear preserve flag after render completes
    window._setupPreserveFullpage = false;

    if (state.constellationHost?.style.display !== 'none') {
      // Direct constellation → meeting (rare path; e.g. clicking a parking-lot
      // row from constellation level)
      if (reduced) {
        state.constellationHost.style.display = 'none';
        state.viewHost.style.display = '';
      } else {
        await _fadeOut(state.constellationHost);
        state.constellationHost.style.display = 'none';
        state.viewHost.style.display = '';
        await _scaleIn(state.viewHost, sourceRect);
      }
    } else {
      // workstream → meeting: subtle scale-in on the new content, no
      // constellation involvement
      if (!reduced) await _scaleIn(state.viewHost, sourceRect);
    }
  }

  // ── Animation primitives ────────────────────────────────────
  function _fadeOut(el) {
    return new Promise(resolve => {
      el.style.transition = `opacity ${TIMING.OUT_MS}ms ${TIMING.EASE_OUT}`;
      el.style.opacity = '0';
      const done = () => {
        el.removeEventListener('transitionend', done);
        clearTimeout(t);
        resolve();
      };
      el.addEventListener('transitionend', done, { once: true });
      const t = setTimeout(done, TIMING.OUT_MS + 50);
    });
  }

  function _fadeIn(el) {
    return new Promise(resolve => {
      el.style.opacity = '0';
      el.style.transition = `opacity ${TIMING.IN_MS}ms ${TIMING.EASE_OUT}`;
      // Force a layout flush so the transition fires
      void el.offsetWidth;
      el.style.opacity = '1';
      const done = () => {
        el.removeEventListener('transitionend', done);
        clearTimeout(t);
        el.style.transition = '';
        resolve();
      };
      el.addEventListener('transitionend', done, { once: true });
      const t = setTimeout(done, TIMING.IN_MS + 50);
    });
  }

  function _scaleIn(el, sourceRect) {
    return new Promise(resolve => {
      // If we have a source rect, anchor the transform-origin to it.
      // Otherwise, default centered scale-in.
      const hostRect = state.centerHost.getBoundingClientRect();
      let originX = 50, originY = 50;
      if (sourceRect && hostRect.width && hostRect.height) {
        const cx = sourceRect.left + sourceRect.width / 2 - hostRect.left;
        const cy = sourceRect.top  + sourceRect.height / 2 - hostRect.top;
        originX = Math.max(0, Math.min(100, (cx / hostRect.width)  * 100));
        originY = Math.max(0, Math.min(100, (cy / hostRect.height) * 100));
      }

      el.style.transformOrigin = `${originX}% ${originY}%`;
      el.style.opacity = '0';
      el.style.transform = 'scale(0.94)';
      el.style.transition = `opacity ${TIMING.IN_MS}ms ${TIMING.EASE_OUT}, transform ${TIMING.IN_MS}ms ${TIMING.EASE}`;
      void el.offsetWidth;
      el.style.opacity = '1';
      el.style.transform = 'scale(1)';

      const done = () => {
        el.removeEventListener('transitionend', done);
        clearTimeout(t);
        el.style.transition = '';
        el.style.transform  = '';
        el.style.transformOrigin = '';
        resolve();
      };
      el.addEventListener('transitionend', done, { once: true });
      const t = setTimeout(done, TIMING.IN_MS + 80);
    });
  }

  // ── Boot ────────────────────────────────────────────────────
  function _init() {
    _ensureChrome();
    window.addEventListener('accord:level-changed', _onLevelChanged);

    // First paint: respect persisted level. accord-core fires no event for
    // initial state, so we synthesize one if we boot non-constellation.
    const lvl = window.Accord?.state?.level || 'constellation';
    const ctx = window.Accord?.state?.levelContext || {};
    if (lvl !== 'constellation') {
      _onLevelChanged({ detail: { level: lvl, context: ctx } });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  window.AccordTransitions = {
    timing: TIMING,
    isInFlight() { return state.inFlight; },
  };
})();