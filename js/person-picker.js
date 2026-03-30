// ══════════════════════════════════════════════════════════════════════════
// person-picker.js — Compass shared PersonPicker component
// ══════════════════════════════════════════════════════════════════════════
//
// PURPOSE
//   Single source of truth for any UI that lets a user select a person.
//   Provides a grouped, color-coded, searchable dropdown that shows:
//     • Color-coded initials avatar
//     • Full name (with "(you)" marker for the logged-in user)
//     • Title / role subtitle
//     • Grouped by department, External last
//
// USAGE
//   window.PersonPicker.show(anchorEl, onSelect, options)
//
//   anchorEl  — Element to position the picker below
//   onSelect  — function(resource) called when user picks someone
//               resource = { id, user_id, name, department, title, is_external }
//   options   — optional object:
//     resources   Array   override list (defaults to window._inviteResources)
//     selected    String  resource_id to pre-highlight
//     includeAll  Boolean prepend an "All / Everyone" option (default false)
//     allLabel    String  label for the all option (default "Everyone")
//
// RULE
//   Any UI that selects a person MUST use window.PersonPicker.show().
//   Do NOT implement a custom resource picker inline. If you need a picker
//   that isn't covered by the options above, extend this file — never
//   duplicate the pattern. This file is the only place avatar colors,
//   grouping, search, and layout are defined.
//
// COLOR ASSIGNMENT
//   Uses window.PARTICIPANT_COLORS[] cycling by alphabetical index within
//   each group, matching the invite picker color assignment exactly.
//
// DEPENDENCIES
//   window._inviteResources  — cached resource list (populated by _loadResources)
//   window._notesResource    — logged-in user resource (for "(you)" marker)
//   window.PARTICIPANT_COLORS — color palette array
//   window._esc or local _esc — HTML escape helper
// ══════════════════════════════════════════════════════════════════════════

(function() {
'use strict';

var COLORS = null;
function _colors() {
  if (COLORS) return COLORS;
  COLORS = (window.PARTICIPANT_COLORS && window.PARTICIPANT_COLORS.length)
    ? window.PARTICIPANT_COLORS
    : ['#00D2FF','#8B5CF6','#1D9E75','#EF9F27','#E24B4A','#58a6ff',
       '#f0883e','#3fb950','#d2a8ff','#ffa657'];
  return COLORS;
}

function _esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _initials(name) {
  return (name||'').split(' ')
    .map(function(w){ return w[0]||''; })
    .join('').slice(0,2).toUpperCase();
}

function _groupResources(resources) {
  var groups = {};
  (resources||[]).forEach(function(r) {
    var grp = r.is_external ? 'External' : (r.department || 'Other');
    if (!groups[grp]) groups[grp] = [];
    groups[grp].push(r);
  });
  return Object.keys(groups).sort(function(a, b) {
    if (a === 'External') return 1;
    if (b === 'External') return -1;
    return a.localeCompare(b);
  }).map(function(key) {
    return { label: key, items: groups[key] };
  });
}

function _avatarHtml(initials, color, size) {
  size = size || 28;
  return '<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;flex-shrink:0;' +
    'display:flex;align-items:center;justify-content:center;' +
    'font-size:'+(size<=20?9:size<=24?10:11)+'px;font-weight:700;' +
    'font-family:var(--font-mono,monospace);' +
    'background:'+color+'22;color:'+color+';border:1.5px solid '+color+'55;">' +
    initials + '</div>';
}

function _buildRows(resources, selectedId, includeAll, allLabel) {
  var myResId  = window._notesResource && window._notesResource.id;
  var cols     = _colors();
  var html     = '';
  var colorIdx = 0;

  if (includeAll) {
    html += '<div class="pp-row" data-rid="" data-uid="" data-name="' + _esc(allLabel||'Everyone') + '" ' +
      'style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;">' +
      _avatarHtml('ALL', '#6A94B8', 28) +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-family:var(--font-mono,monospace);font-size:13px;color:var(--text0,#F0F6FF)">' +
          _esc(allLabel||'Everyone') + '</div>' +
      '</div></div>';
  }

  _groupResources(resources).forEach(function(group) {
    html += '<div style="padding:4px 12px 2px;font-family:var(--font-mono,monospace);font-size:9px;' +
      'color:var(--text3,#6A94B8);letter-spacing:.1em;text-transform:uppercase;' +
      'border-top:1px solid rgba(0,210,255,.07);margin-top:2px">' +
      _esc(group.label) + '</div>';

    group.items.forEach(function(r) {
      var color    = cols[colorIdx % cols.length];
      var initials = _initials(r.name);
      var isMe     = r.id === myResId;
      var isSelected = r.id === selectedId;
      colorIdx++;

      html += '<div class="pp-row' + (isSelected ? ' pp-selected' : '') + '" ' +
        'data-rid="' + _esc(r.id) + '" ' +
        'data-uid="' + _esc(r.user_id||'') + '" ' +
        'data-name="' + _esc(r.name) + '" ' +
        'style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;' +
          (isSelected ? 'background:rgba(0,210,255,.09);' : '') + '">' +
        _avatarHtml(initials, color, 28) +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-family:var(--font-mono,monospace);font-size:13px;' +
            'color:var(--text0,#F0F6FF);display:flex;align-items:center;gap:5px">' +
            _esc(r.name) +
            (isMe ? '<span style="font-family:var(--font-mono,monospace);font-size:9px;' +
              'color:var(--text3,#6A94B8)">(you)</span>' : '') +
          '</div>' +
          (r.title ? '<div style="font-family:var(--font-mono,monospace);font-size:10px;' +
            'color:var(--text3,#6A94B8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
            _esc(r.title) + '</div>' : '') +
        '</div></div>';
    });
  });

  return html || '<div style="padding:12px;font-family:var(--font-mono,monospace);' +
    'font-size:11px;color:var(--text3,#6A94B8)">No people found</div>';
}

window.PersonPicker = {

  show: function(anchorEl, onSelect, options) {
    options = options || {};

    // Close any existing picker
    document.querySelectorAll('.pp-overlay').forEach(function(el){ el.remove(); });

    var resources = options.resources || window._inviteResources || [];

    function render(list) {
      var pop = document.createElement('div');
      pop.className = 'pp-overlay';
      pop.style.cssText =
        'position:fixed;z-index:9999;background:var(--bg1,#0c1628);' +
        'border:1px solid rgba(0,210,255,.25);' +
        'box-shadow:0 8px 40px rgba(0,0,0,.65);' +
        'width:280px;max-height:340px;display:flex;flex-direction:column;' +
        'overflow:hidden;border-radius:4px;';

      // Search bar
      var search = document.createElement('input');
      search.type = 'text';
      search.placeholder = 'Search by name or department…';
      search.autocomplete = 'off';
      search.style.cssText =
        'padding:8px 12px;background:var(--bg0,#060a10);border:none;' +
        'border-bottom:1px solid rgba(0,210,255,.12);' +
        'color:var(--text0,#F0F6FF);font-family:var(--font-mono,monospace);' +
        'font-size:12px;outline:none;flex-shrink:0;';
      pop.appendChild(search);

      // Scrollable list
      var listEl = document.createElement('div');
      listEl.style.cssText = 'overflow-y:auto;flex:1;';
      pop.appendChild(listEl);

      function renderList(filter) {
        var filtered = list;
        if (filter) {
          var lower = filter.toLowerCase();
          filtered = list.filter(function(r) {
            return r.name.toLowerCase().includes(lower) ||
              (r.department||'').toLowerCase().includes(lower) ||
              (r.title||'').toLowerCase().includes(lower);
          });
        }
        listEl.innerHTML = _buildRows(filtered, options.selected,
                                      filter ? false : options.includeAll,
                                      options.allLabel);

        // Wire hover + click
        listEl.querySelectorAll('.pp-row').forEach(function(row) {
          row.addEventListener('mouseenter', function() {
            if (!this.classList.contains('pp-selected'))
              this.style.background = 'rgba(0,210,255,.05)';
          });
          row.addEventListener('mouseleave', function() {
            if (!this.classList.contains('pp-selected'))
              this.style.background = '';
          });
          row.addEventListener('click', function() {
            var rid  = this.dataset.rid;
            var uid  = this.dataset.uid;
            var name = this.dataset.name;
            pop.remove();
            onSelect({ id: rid, user_id: uid, name: name });
          });
        });
      }

      search.addEventListener('input', function() { renderList(this.value); });
      renderList('');

      // Position below anchor
      document.body.appendChild(pop);
      var rect = anchorEl.getBoundingClientRect();
      var left = Math.min(rect.left, window.innerWidth - 290);
      var top  = rect.bottom + 4;
      if (top + 340 > window.innerHeight) top = rect.top - 344;
      pop.style.left = left + 'px';
      pop.style.top  = top  + 'px';

      // Close on outside click
      setTimeout(function() {
        document.addEventListener('mousedown', function _close(e) {
          if (!pop.contains(e.target) && e.target !== anchorEl) {
            pop.remove();
            document.removeEventListener('mousedown', _close);
          }
        });
      }, 0);

      search.focus();
    }

    if (resources.length > 0) {
      render(resources);
    } else if (window._loadResources) {
      // _loadResources defined in my-views.html Block 2 — fetch and retry
      window._loadResources().then(function(list) { render(list); });
    } else {
      // Fallback: fetch directly
      var api  = (typeof API !== 'undefined' && API) || null;
      var FIRM = window.FIRM_ID || 'aaaaaaaa-0001-0001-0001-000000000001';
      if (!api) return;
      api.get('resources?firm_id=eq.' + FIRM +
        '&select=id,first_name,last_name,user_id,department,is_external,title' +
        '&order=first_name.asc&limit=200')
        .then(function(rows) {
          var list = (Array.isArray(rows) ? rows : []).map(function(r) {
            return {
              id:          r.id,
              user_id:     r.user_id,
              name:        ((r.first_name||'')+' '+(r.last_name||'')).trim(),
              department:  r.department  || null,
              is_external: r.is_external || false,
              title:       r.title       || null,
            };
          });
          window._inviteResources = list;
          render(list);
        }).catch(function(){});
    }
  }

};

// ── Backward-compatible aliases ────────────────────────────────────────────
// Any code using the old _notesShowResourcePicker pattern automatically gets
// the proper grouped picker through these aliases.
window._notesShowResourcePicker = function(anchorEl, onSelect) {
  window.PersonPicker.show(anchorEl, onSelect);
};

// Also expose _loadResources at window level so callers outside MY VIEWS can trigger it
if (typeof _loadResources === 'function' && !window._loadResources) {
  window._loadResources = _loadResources;
}

})();