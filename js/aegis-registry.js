// ────────────────────────────────────────────────────────────────────────────
// aegis-registry.js · CMD91
//
// DOM-attribute-driven tab registry for Aegis CLI verbs.
//
// Annotation contract (page authors):
//   <element data-cmd-tab="My Work">      — page-level tab
//   <element data-cmd-subtab="Stakeholders"> — in-page tab
//
// The attribute VALUE is the canonical label. Lookup is case-insensitive and
// whitespace-collapsed, so `Set Tab "PM VIEW"` matches `data-cmd-tab="PM View"`.
//
// The registry scans on DOMContentLoaded, then keeps itself current via a
// mutation observer so SPA route changes / lazy-rendered detail pages pick up
// new annotated tabs automatically. Pages do NOT call `register(...)`.
//
// Surface (window.AegisRegistry):
//   findTab(label)     → entry | null
//   findSubTab(label)  → entry | null
//   listTabs()         → entry[]    (visible only)
//   listSubTabs()      → entry[]    (visible only)
//   rescan()           → void       (force re-index; usually unnecessary)
//
// entry = { el, label, level: 'tab'|'subtab' }
// ────────────────────────────────────────────────────────────────────────────
(function(){
  'use strict';

  var TAB_ATTR    = 'data-cmd-tab';
  var SUBTAB_ATTR = 'data-cmd-subtab';

  var _tabs    = [];   // [{ el, label, level:'tab' }]
  var _subtabs = [];   // [{ el, label, level:'subtab' }]
  var _scanScheduled = false;

  function _norm(s) {
    return (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function _isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    var s = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (s && (s.display === 'none' || s.visibility === 'hidden')) return false;
    return true;
  }

  function _scan() {
    var tabs = [], subtabs = [];
    var tabEls    = document.querySelectorAll('[' + TAB_ATTR + ']');
    var subtabEls = document.querySelectorAll('[' + SUBTAB_ATTR + ']');
    for (var i = 0; i < tabEls.length; i++) {
      tabs.push({ el: tabEls[i], label: tabEls[i].getAttribute(TAB_ATTR) || '', level: 'tab' });
    }
    for (var j = 0; j < subtabEls.length; j++) {
      subtabs.push({ el: subtabEls[j], label: subtabEls[j].getAttribute(SUBTAB_ATTR) || '', level: 'subtab' });
    }
    _tabs = tabs;
    _subtabs = subtabs;
  }

  function _scheduleScan() {
    if (_scanScheduled) return;
    _scanScheduled = true;
    // Coalesce bursts of mutations into one rescan.
    (window.requestAnimationFrame || function(cb){ setTimeout(cb, 16); })(function(){
      _scanScheduled = false;
      _scan();
    });
  }

  function _findInList(list, label) {
    var want = _norm(label);
    if (!want) return null;
    // Pass 1: visible exact match.
    for (var i = 0; i < list.length; i++) {
      if (_norm(list[i].label) === want && _isVisible(list[i].el)) return list[i];
    }
    // Pass 2: any exact match (covers off-screen but mounted tabs).
    for (var k = 0; k < list.length; k++) {
      if (_norm(list[k].label) === want) return list[k];
    }
    return null;
  }

  function _listVisible(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (_isVisible(list[i].el)) out.push(list[i]);
    }
    return out;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  var AegisRegistry = {
    findTab:     function(label) { return _findInList(_tabs, label); },
    findSubTab:  function(label) { return _findInList(_subtabs, label); },
    listTabs:    function() { return _listVisible(_tabs); },
    listSubTabs: function() { return _listVisible(_subtabs); },
    rescan:      function() { _scan(); },
    // Constants exposed for diagnostics / tests.
    TAB_ATTR:    TAB_ATTR,
    SUBTAB_ATTR: SUBTAB_ATTR,
    VERSION:     'CMD91'
  };

  window.AegisRegistry = AegisRegistry;

  // ── Initial scan ──────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _scan, { once: true });
  } else {
    _scan();
  }

  // ── Mutation observer ─────────────────────────────────────────────────────
  // Watch for DOM changes that could add/remove annotated tabs. Filter on
  // attribute name to avoid rescanning on every text/style mutation.
  function _installObserver() {
    if (!window.MutationObserver || !document.body) {
      // Body not ready yet; retry once DOM is parsed.
      document.addEventListener('DOMContentLoaded', _installObserver, { once: true });
      return;
    }
    var mo = new MutationObserver(function(records) {
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === 'childList' && (r.addedNodes.length || r.removedNodes.length)) {
          _scheduleScan();
          return;
        }
        if (r.type === 'attributes' && (r.attributeName === TAB_ATTR || r.attributeName === SUBTAB_ATTR)) {
          _scheduleScan();
          return;
        }
      }
    });
    mo.observe(document.body, {
      childList: true,
      subtree:   true,
      attributes: true,
      attributeFilter: [TAB_ATTR, SUBTAB_ATTR]
    });
  }
  _installObserver();

})();