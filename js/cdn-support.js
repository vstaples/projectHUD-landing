// cdn-support.js — Platform Support Ticket System
// ProjectHUD / Compass / CadenceHUD
// v20260405-SUP1
// Load after cdn-core-state.js
// Iron rules: var + existence guards, Arial min 12px, monospace min 13px,
//             zero-arg globals or data-* for inline onclick,
//             no form_submissions table

console.log('%c[cdn-support] v20260405-SUP1 — Platform support ticket system','background:#5090f0;color:#fff;font-weight:700;padding:2px 8px;border-radius:3px');

// ── Module constants ──────────────────────────────────────────────────────────
var _SUP_VERSION = 'v20260405-SUP1';

var _SUP_SEVERITY = {
  low:      { label:'LOW',      color:'#60a5fa', glow:'rgba(96,165,250,.14)',  icon:'◌' },
  medium:   { label:'MEDIUM',   color:'#f0a030', glow:'rgba(240,160,48,.14)',  icon:'◈' },
  high:     { label:'HIGH',     color:'#f97316', glow:'rgba(249,115,22,.14)',  icon:'⚑' },
  critical: { label:'CRITICAL', color:'#e84040', glow:'rgba(232,64,64,.14)',   icon:'⚠' },
};

var _SUP_STATUS = {
  open:        { label:'Open',        color:'#60a5fa', bg:'rgba(96,165,250,.10)'  },
  in_progress: { label:'In Progress', color:'#f0a030', bg:'rgba(240,160,48,.10)'  },
  resolved:    { label:'Resolved',    color:'#3de08a', bg:'rgba(61,224,138,.10)'  },
  closed:      { label:'Closed',      color:'#4a5568', bg:'rgba(74,85,104,.10)'   },
};

var _SUP_MODULES = [
  'projecthud','compass','cadencehud',
  'pipeline','library','simulator','instances','general'
];

var _SUP_MODULE_LABELS = {
  projecthud: 'ProjectHUD',
  compass:    'Compass',
  cadencehud: 'CadenceHUD',
  pipeline:   'Pipeline',
  library:    'Library',
  simulator:  'Simulator',
  instances:  'Instances',
  general:    'General',
};

// Severity keyword auto-detection (ported from AdvisorHUD)
var _SUP_SEV_KEYWORDS = {
  critical: ['crash','lost','deleted','missing data','can\'t login','data loss','gone','disappeared','corrupt','broke everything'],
  high:     ['broken','can\'t','cannot','doesn\'t work','won\'t','fails','error','blank','frozen','stuck','not loading','wrong data'],
  medium:   ['slow','weird','incorrect','unexpected','strange','not showing','missing','off','glitch'],
  low:      ['suggestion','would be nice','could','maybe','minor','cosmetic','typo','slight'],
};

var _SUP_ENHANCE_PHRASES = [
  'would be nice','would be great','feature request','please add',
  'could we add','can we add','enhancement request','new feature',
  'it would help','suggestion:','requesting a'
];

// ── Breadcrumb buffer ─────────────────────────────────────────────────────────
window._supBreadcrumbs = window._supBreadcrumbs || [];

function supPushBreadcrumb(action, detail) {
  if (!action) return;
  window._supBreadcrumbs.push({
    time:   new Date().toLocaleTimeString('en-US', {hour12:false}),
    action: action,
    detail: (detail || '').slice(0, 60),
  });
  if (window._supBreadcrumbs.length > 8) window._supBreadcrumbs.shift();
}

// ── Auto-detection helpers ────────────────────────────────────────────────────
function _supDetectSeverity(text) {
  var lower = (text || '').toLowerCase();
  var sevs = ['critical','high','medium','low'];
  for (var i = 0; i < sevs.length; i++) {
    var words = _SUP_SEV_KEYWORDS[sevs[i]];
    for (var j = 0; j < words.length; j++) {
      if (lower.indexOf(words[j]) !== -1) return sevs[i];
    }
  }
  return null;
}

function _supDetectType(text) {
  var lower = (text || '').toLowerCase();
  for (var i = 0; i < _SUP_ENHANCE_PHRASES.length; i++) {
    if (lower.indexOf(_SUP_ENHANCE_PHRASES[i]) !== -1) return 'enhancement';
  }
  return null;
}

// ── State ─────────────────────────────────────────────────────────────────────
var _supModalOpen    = false;
var _supContext      = {};   // { module, entity_type, entity_id, entity_label }
var _supTicketCache  = null; // cached tickets for duplicate detection
var _supQueueFilters = { module:'all', type:'all', status:'open', severity:'all' };

// ── CSS injection ─────────────────────────────────────────────────────────────
(function _supInjectStyles() {
  if (document.getElementById('sup-styles')) return;
  var s = document.createElement('style');
  s.id = 'sup-styles';
  s.textContent = [
    '#sup-fab{position:fixed;bottom:20px;right:20px;z-index:9990;',
      'width:40px;height:40px;border-radius:50%;',
      'background:#5090f0;border:none;color:#fff;cursor:pointer;',
      'font-size:16px;display:flex;align-items:center;justify-content:center;',
      'box-shadow:0 4px 16px rgba(80,144,240,.4);transition:transform .15s,background .15s;}',
    '#sup-fab:hover{transform:scale(1.1);background:#6ba3f5;}',
    '#sup-fab .sup-badge{position:absolute;top:-4px;right:-4px;',
      'width:16px;height:16px;border-radius:50%;background:#e84040;',
      'font-size:9px;font-weight:700;color:#fff;display:flex;align-items:center;justify-content:center;',
      'font-family:Arial,sans-serif;line-height:1;}',
    '#sup-modal{position:fixed;right:0;bottom:0;width:480px;height:92vh;z-index:9995;',
      'background:#0c0f18;border:1px solid rgba(255,255,255,.1);border-bottom:none;',
      'display:flex;flex-direction:column;',
      'animation:supSlideUp .2s ease-out;}',
    '@keyframes supSlideUp{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}',
    '#sup-modal.sup-dragged{animation:none;}',
    '.sup-input{background:#1a1f2e;border:1px solid rgba(255,255,255,.1);',
      'color:rgba(255,255,255,.9);padding:7px 10px;font-size:12px;',
      'font-family:Arial,sans-serif;outline:none;width:100%;box-sizing:border-box;',
      'border-radius:2px;}',
    '.sup-input:focus{border-color:#5fd4c8;}',
    '.sup-label{font-size:10px;font-weight:700;letter-spacing:.12em;',
      'color:rgba(255,255,255,.35);font-family:Arial,sans-serif;',
      'text-transform:uppercase;margin-bottom:5px;display:block;}',
    '.sup-btn{padding:5px 14px;border-radius:3px;font-size:11px;font-weight:700;',
      'letter-spacing:.05em;cursor:pointer;border:1px solid;font-family:Arial,sans-serif;',
      'text-transform:uppercase;transition:all .12s;}',
    '.sup-sev-btn{flex:1;padding:8px 4px;border:none;cursor:pointer;',
      'font-size:10px;font-family:Arial,sans-serif;font-weight:700;',
      'letter-spacing:.08em;transition:all .15s;background:transparent;',
      'color:rgba(255,255,255,.3);}',
    '.sup-type-btn{flex:1;padding:7px;border:none;cursor:pointer;',
      'font-size:10px;font-family:Arial,sans-serif;font-weight:700;',
      'letter-spacing:.08em;transition:all .1s;}',
    '.sup-queue-row{display:flex;align-items:center;gap:0;',
      'padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.05);',
      'cursor:pointer;transition:background .1s;font-family:Arial,sans-serif;}',
    '.sup-queue-row:hover{background:rgba(255,255,255,.04);}',
    '.sup-pill{display:inline-flex;align-items:center;gap:3px;padding:1px 7px;',
      'border-radius:3px;font-size:9px;font-weight:700;letter-spacing:.05em;',
      'text-transform:uppercase;font-family:Arial,sans-serif;}',
    '::-webkit-scrollbar{width:4px;height:4px;}',
    '::-webkit-scrollbar-track{background:transparent;}',
    '::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px;}',
  ].join('');
  document.head.appendChild(s);
})();

// ── FAB (floating action button) ──────────────────────────────────────────────
function supInitFab() {
  if (document.getElementById('sup-fab')) return;
  var fab = document.createElement('button');
  fab.id = 'sup-fab';
  fab.title = 'Report a bug or request an enhancement';
  fab.innerHTML = '⚑<span class="sup-badge" id="sup-fab-badge" style="display:none">0</span>';
  fab.onclick = function() { supOpenModal(); };
  document.body.appendChild(fab);
}

function supUpdateFabBadge(count) {
  var b = document.getElementById('sup-fab-badge');
  if (!b) return;
  if (count > 0) {
    b.textContent = count > 9 ? '9+' : String(count);
    b.style.display = 'flex';
  } else {
    b.style.display = 'none';
  }
}

// ── Modal open/close ──────────────────────────────────────────────────────────
function supOpenModal(context) {
  if (_supModalOpen) { supCloseModal(); return; }
  _supContext = context || {};
  _supModalOpen = true;
  _supRenderModal();
}

function supCloseModal() {
  _supModalOpen = false;
  var m = document.getElementById('sup-modal');
  if (m) m.remove();
}

// ── Modal render ──────────────────────────────────────────────────────────────
function _supRenderModal() {
  var existing = document.getElementById('sup-modal');
  if (existing) existing.remove();

  var FA = 'font-family:Arial,sans-serif;';
  var modal = document.createElement('div');
  modal.id = 'sup-modal';

  // Detect current module from context or page
  var curModule = _supContext.module || _supDetectCurrentModule();

  modal.innerHTML =
    // Header
    '<div id="sup-modal-header" style="padding:14px 18px 12px;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0;cursor:grab;user-select:none">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-size:16px;color:#5090f0">⚑</span>' +
          '<span style="' + FA + 'font-size:13px;font-weight:700;color:rgba(255,255,255,.9);' +
            'letter-spacing:.06em;font-family:Arial,sans-serif">REPORT AN ISSUE</span>' +
          '<span style="' + FA + 'font-size:10px;color:rgba(255,255,255,.25);font-family:monospace">⠿ DRAG</span>' +
        '</div>' +
        '<button onclick="supCloseModal()" style="background:none;border:none;color:rgba(255,255,255,.4);' +
          'cursor:pointer;font-size:18px;line-height:1;padding:0 4px">✕</button>' +
      '</div>' +
      // Type toggle
      '<div style="display:flex;border:1px solid rgba(255,255,255,.1);overflow:hidden;border-radius:3px">' +
        '<button class="sup-type-btn" id="sup-type-bug" onclick="_supSetType(\'bug\')" ' +
          'style="background:rgba(232,64,64,.12);color:#e84040;border-right:1px solid rgba(255,255,255,.08)">⚠ BUG REPORT</button>' +
        '<button class="sup-type-btn" id="sup-type-enh" onclick="_supSetType(\'enhancement\')" ' +
          'style="background:transparent;color:rgba(255,255,255,.3)">◈ ENHANCEMENT</button>' +
      '</div>' +
    '</div>' +

    // Body
    '<div id="sup-modal-body" style="flex:1;overflow-y:auto;padding:14px 18px;display:flex;flex-direction:column;gap:12px">' +

      // Flash banner (hidden initially)
      '<div id="sup-flash" style="display:none;background:rgba(61,224,138,.1);' +
        'border:1px solid rgba(61,224,138,.3);padding:10px 14px;border-radius:3px">' +
        '<div style="' + FA + 'font-size:11px;font-weight:700;color:#3de08a">◈ SUBMITTED — form cleared for next report</div>' +
      '</div>' +

      // Screenshot status
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<span id="sup-ss-dot" style="color:rgba(255,255,255,.3);font-size:12px">○</span>' +
        '<span id="sup-ss-label" style="' + FA + 'font-size:11px;color:rgba(255,255,255,.35)">Capturing screenshot…</span>' +
      '</div>' +

      // Title
      '<div>' +
        '<label class="sup-label">TITLE *</label>' +
        '<input id="sup-title" class="sup-input" placeholder="Briefly describe what\'s broken…" ' +
          'oninput="_supOnTitleChange(this.value)" autocomplete="off"/>' +
      '</div>' +

      // Duplicate warning
      '<div id="sup-dupe-warn" style="display:none;background:rgba(240,160,48,.08);' +
        'border:1px solid rgba(240,160,48,.3);padding:8px 10px;border-radius:3px">' +
        '<div style="' + FA + 'font-size:10px;font-weight:700;color:#f0a030;margin-bottom:4px">' +
          '⚠ SIMILAR REPORTS EXIST — IS THIS A DUPLICATE?</div>' +
        '<div id="sup-dupe-list"></div>' +
      '</div>' +

      // Severity
      '<div>' +
        '<div style="' + FA + 'font-size:10px;font-weight:700;letter-spacing:.12em;' +
          'color:rgba(255,255,255,.35);text-transform:uppercase;margin-bottom:6px">' +
          'SEVERITY <span id="sup-sev-auto" style="display:none;color:#f0a030;font-size:10px">— AUTO-DETECTED</span>' +
        '</div>' +
        '<div style="display:flex;border:1px solid rgba(255,255,255,.1);overflow:hidden;border-radius:3px">' +
          ['low','medium','high','critical'].map(function(s) {
            var m = _SUP_SEVERITY[s];
            var isAct = s === 'medium';
            return '<button class="sup-sev-btn" id="sup-sev-' + s + '" onclick="_supSetSeverity(\'' + s + '\')" ' +
              'style="border-right:1px solid rgba(255,255,255,.08);' +
              (isAct ? 'background:' + m.glow + ';color:' + m.color + ';' : '') + '">' +
              '<div style="font-size:12px;margin-bottom:2px">' + m.icon + '</div>' + m.label +
            '</button>';
          }).join('') +
        '</div>' +
      '</div>' +

      // Module
      '<div>' +
        '<label class="sup-label">AFFECTED AREA</label>' +
        '<select id="sup-module" class="sup-input" style="cursor:pointer">' +
          _SUP_MODULES.map(function(mod) {
            var sel = mod === curModule ? ' selected' : '';
            return '<option value="' + mod + '"' + sel + '>' + _SUP_MODULE_LABELS[mod] + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +

      // Description
      '<div>' +
        '<label class="sup-label">DESCRIPTION</label>' +
        '<textarea id="sup-desc" class="sup-input" rows="3" ' +
          'placeholder="What were you doing? What happened vs. what you expected?" ' +
          'style="resize:vertical;line-height:1.5"></textarea>' +
      '</div>' +

      // Steps to repro (bug only)
      '<div id="sup-steps-wrap">' +
        '<label class="sup-label">STEPS TO REPRODUCE <span style="font-weight:400;color:rgba(255,255,255,.25)">— optional</span></label>' +
        '<textarea id="sup-steps" class="sup-input" rows="3" ' +
          'placeholder="1. Go to Simulator&#10;2. Click Coverage tab&#10;3. Observe…" ' +
          'style="resize:vertical;line-height:1.5;font-family:monospace;font-size:13px"></textarea>' +
      '</div>' +

      // Auto-context (collapsible)
      '<div style="background:#111520;border:1px solid rgba(255,255,255,.07);border-radius:3px">' +
        '<button onclick="_supToggleContext()" ' +
          'style="width:100%;display:flex;align-items:center;justify-content:space-between;' +
          'padding:8px 10px;background:none;border:none;cursor:pointer;text-align:left">' +
          '<div style="display:flex;align-items:center;gap:7px">' +
            '<span style="color:#3de08a;font-size:11px">◈</span>' +
            '<span style="' + FA + 'font-size:10px;font-weight:700;color:rgba(255,255,255,.4);' +
              'letter-spacing:.10em;text-transform:uppercase">AUTO-CONTEXT ATTACHED</span>' +
            '<span style="' + FA + 'font-size:10px;color:rgba(255,255,255,.2)">— browser · view · navigation</span>' +
          '</div>' +
          '<span id="sup-ctx-toggle" style="' + FA + 'font-size:10px;color:rgba(255,255,255,.3)">▼ SHOW</span>' +
        '</button>' +
        '<div id="sup-ctx-body" style="display:none;padding:0 10px 10px;' +
          'font-size:12px;font-family:monospace;color:rgba(255,255,255,.4);line-height:1.7">' +
          _supBuildContextHtml() +
        '</div>' +
      '</div>' +

    '</div>' +

    // Footer
    '<div style="padding:12px 18px;border-top:1px solid rgba(255,255,255,.08);flex-shrink:0;' +
      'display:flex;align-items:center;gap:8px">' +
      '<button class="sup-btn" onclick="_supSubmit()" id="sup-submit-btn" ' +
        'style="background:#5090f0;border-color:#5090f0;color:#fff;flex:1">Submit Report</button>' +
      '<button class="sup-btn" onclick="supCloseModal()" ' +
        'style="background:transparent;border-color:rgba(255,255,255,.1);color:rgba(255,255,255,.4)">Cancel</button>' +
    '</div>';

  document.body.appendChild(modal);

  // State
  modal._supType     = 'bug';
  modal._supSeverity = 'medium';
  modal._supAutoSev  = false;
  modal._supUserType = false;

  // Focus title
  setTimeout(function() {
    var t = document.getElementById('sup-title');
    if (t) t.focus();
  }, 100);

  // Auto-screenshot
  _supCaptureScreenshot();

  // Drag support
  _supInitDrag(document.getElementById('sup-modal-header'), modal);
}

// ── Modal state setters ───────────────────────────────────────────────────────
function _supSetType(type) {
  var modal = document.getElementById('sup-modal');
  if (!modal) return;
  modal._supType = type;
  modal._supUserType = true;

  var bugBtn = document.getElementById('sup-type-bug');
  var enhBtn = document.getElementById('sup-type-enh');
  var stepsWrap = document.getElementById('sup-steps-wrap');
  var titleEl = document.getElementById('sup-title');

  if (type === 'bug') {
    if (bugBtn) { bugBtn.style.background = 'rgba(232,64,64,.12)'; bugBtn.style.color = '#e84040'; }
    if (enhBtn) { enhBtn.style.background = 'transparent'; enhBtn.style.color = 'rgba(255,255,255,.3)'; }
    if (stepsWrap) stepsWrap.style.display = 'block';
    if (titleEl) titleEl.placeholder = 'Briefly describe what\'s broken…';
  } else {
    if (enhBtn) { enhBtn.style.background = 'rgba(80,144,240,.14)'; enhBtn.style.color = '#5090f0'; }
    if (bugBtn) { bugBtn.style.background = 'transparent'; bugBtn.style.color = 'rgba(255,255,255,.3)'; }
    if (stepsWrap) stepsWrap.style.display = 'none';
    if (titleEl) titleEl.placeholder = 'Describe the enhancement…';
  }
}

function _supSetSeverity(sev) {
  var modal = document.getElementById('sup-modal');
  if (!modal) return;
  modal._supSeverity = sev;
  modal._supAutoSev  = false;

  ['low','medium','high','critical'].forEach(function(s) {
    var btn = document.getElementById('sup-sev-' + s);
    if (!btn) return;
    var m = _SUP_SEVERITY[s];
    if (s === sev) {
      btn.style.background = m.glow;
      btn.style.color = m.color;
    } else {
      btn.style.background = 'transparent';
      btn.style.color = 'rgba(255,255,255,.3)';
    }
  });

  var autoEl = document.getElementById('sup-sev-auto');
  if (autoEl) autoEl.style.display = 'none';
}

function _supSetSeverityAuto(sev) {
  var modal = document.getElementById('sup-modal');
  if (!modal || modal._supAutoSev === false && modal._supSeverity !== 'medium') return;
  _supSetSeverity(sev);
  modal._supAutoSev = true;
  var autoEl = document.getElementById('sup-sev-auto');
  if (autoEl) autoEl.style.display = 'inline';
}

// Debounce timer for title change
var _supTitleTimer = null;
function _supOnTitleChange(val) {
  // Auto-detect type and severity
  var modal = document.getElementById('sup-modal');
  if (!modal) return;
  var desc = (document.getElementById('sup-desc') || {}).value || '';
  var text = val + ' ' + desc;

  if (text.trim().length >= 8) {
    var detSev = _supDetectSeverity(text);
    if (detSev && modal._supAutoSev !== false) _supSetSeverityAuto(detSev);

    if (!modal._supUserType) {
      var detType = _supDetectType(text);
      if (detType && detType !== modal._supType) _supSetType(detType);
    }
  }

  // Duplicate detection — debounced 800ms
  clearTimeout(_supTitleTimer);
  if (val.length >= 20) {
    _supTitleTimer = setTimeout(function() { _supCheckDuplicates(val); }, 800);
  } else {
    var dw = document.getElementById('sup-dupe-warn');
    if (dw) dw.style.display = 'none';
  }
}

function _supCheckDuplicates(title) {
  if (!_supTicketCache) return;
  var words = title.toLowerCase().split(/\s+/).filter(function(w) { return w.length > 4; });
  if (words.length < 2) return;
  var matches = _supTicketCache.filter(function(t) {
    if (t.status === 'resolved' || t.status === 'closed') return false;
    var matchCount = words.filter(function(w) {
      return (t.title || '').toLowerCase().indexOf(w) !== -1;
    }).length;
    return matchCount >= 2;
  }).slice(0, 3);

  var dw = document.getElementById('sup-dupe-warn');
  var dl = document.getElementById('sup-dupe-list');
  if (!dw || !dl) return;
  if (!matches.length) { dw.style.display = 'none'; return; }

  dw.style.display = 'block';
  dl.innerHTML = matches.map(function(t) {
    var st = _SUP_STATUS[t.status] || _SUP_STATUS.open;
    return '<div style="display:flex;gap:6px;align-items:center;margin-bottom:3px">' +
      '<span style="font-size:9px;font-weight:700;color:' + st.color + ';font-family:Arial,sans-serif">' + st.label.toUpperCase() + '</span>' +
      '<span style="font-size:11px;color:rgba(255,255,255,.6);font-family:Arial,sans-serif">' + _supEsc(t.title) + '</span>' +
    '</div>';
  }).join('');
}

function _supToggleContext() {
  var body = document.getElementById('sup-ctx-body');
  var tog  = document.getElementById('sup-ctx-toggle');
  if (!body) return;
  var isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (tog) tog.textContent = isOpen ? '▼ SHOW' : '▲ HIDE';
}

function _supBuildContextHtml() {
  var lines = [];
  lines.push('Browser: ' + (navigator.userAgent.split(')')[0].split('(')[1] || navigator.userAgent).slice(0, 60));
  lines.push('Viewport: ' + window.innerWidth + 'x' + window.innerHeight);
  lines.push('Page: ' + window.location.pathname);
  lines.push('Time: ' + new Date().toLocaleString());
  if (window._supBreadcrumbs && window._supBreadcrumbs.length) {
    lines.push('Recent actions:');
    window._supBreadcrumbs.slice(-5).forEach(function(b) {
      lines.push('  ' + b.time + ' — ' + b.action + (b.detail ? ': ' + b.detail : ''));
    });
  }
  return lines.join('<br>');
}

// ── Screenshot capture ────────────────────────────────────────────────────────
var _supScreenshotBlob = null;

function _supCaptureScreenshot() {
  var dotEl   = document.getElementById('sup-ss-dot');
  var labelEl = document.getElementById('sup-ss-label');
  _supScreenshotBlob = null;

  // html2canvas is optional — gracefully skip if unavailable
  var script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  script.onload = function() {
    try {
      var modal = document.getElementById('sup-modal');
      if (modal) modal.style.visibility = 'hidden';
      setTimeout(function() {
        window.html2canvas(document.body, {
          scale: 0.6, useCORS: true, logging: false,
          backgroundColor: '#080a10',
        }).then(function(canvas) {
          canvas.toBlob(function(blob) {
            _supScreenshotBlob = blob;
            if (dotEl) { dotEl.textContent = '◉'; dotEl.style.color = '#3de08a'; }
            if (labelEl) { labelEl.textContent = 'Screenshot captured — attached automatically'; labelEl.style.color = '#3de08a'; }
          }, 'image/png', 0.8);
        }).catch(function() {
          if (dotEl) { dotEl.textContent = '○'; dotEl.style.color = 'rgba(255,255,255,.25)'; }
          if (labelEl) { labelEl.textContent = 'Screenshot unavailable'; }
        }).finally(function() {
          if (modal) modal.style.visibility = '';
        });
      }, 80);
    } catch(e) {
      if (modal) modal.style.visibility = '';
    }
  };
  script.onerror = function() {
    if (dotEl) { dotEl.textContent = '○'; dotEl.style.color = 'rgba(255,255,255,.25)'; }
    if (labelEl) { labelEl.textContent = 'Screenshot unavailable'; }
  };
  // Only inject once
  if (!window._html2canvasLoaded) {
    window._html2canvasLoaded = true;
    document.head.appendChild(script);
  } else if (window.html2canvas) {
    script.onload();
  }
}

// ── Submit ────────────────────────────────────────────────────────────────────
async function _supSubmit() {
  var modal = document.getElementById('sup-modal');
  if (!modal) return;

  var titleEl = document.getElementById('sup-title');
  var title   = (titleEl && titleEl.value || '').trim();
  if (!title) {
    if (titleEl) { titleEl.style.borderColor = '#e84040'; titleEl.focus(); }
    return;
  }

  var btn = document.getElementById('sup-submit-btn');
  if (btn) { btn.textContent = 'Submitting…'; btn.disabled = true; }

  try {
    var firmId = typeof FIRM_ID_CAD !== 'undefined' ? FIRM_ID_CAD
               : typeof FIRM_ID !== 'undefined' ? FIRM_ID
               : null;

    var userId = null;
    if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) userId = CURRENT_USER.id;
    if (!userId && typeof _currentUser !== 'undefined' && _currentUser) userId = _currentUser.id;

    var descEl  = document.getElementById('sup-desc');
    var stepsEl = document.getElementById('sup-steps');
    var modEl   = document.getElementById('sup-module');

    var payload = {
      firm_id:        firmId,
      ticket_type:    modal._supType || 'bug',
      severity:       modal._supSeverity || 'medium',
      module:         (modEl && modEl.value) || _supContext.module || 'general',
      entity_type:    _supContext.entity_type || null,
      entity_id:      _supContext.entity_id   || null,
      entity_label:   _supContext.entity_label || null,
      title:          title,
      description:    (descEl && descEl.value.trim()) || null,
      steps_to_repro: (stepsEl && stepsEl.value.trim()) || null,
      submitted_by:   userId,
      status:         'open',
      context_json: {
        page:       window.location.pathname,
        viewport:   window.innerWidth + 'x' + window.innerHeight,
        browser:    (navigator.userAgent.split(')')[0].split('(')[1] || '').slice(0, 80),
        breadcrumbs: window._supBreadcrumbs || [],
        timestamp:  new Date().toISOString(),
      },
    };

    var result = await API.post('support_tickets', payload);
    var ticket = Array.isArray(result) ? result[0] : result;

    // Success — flash and reset
    _supFlashSuccess();
    _supTicketCache = null; // invalidate cache

    // Update FAB badge
    _supLoadOpenCount();

  } catch(e) {
    if (btn) { btn.textContent = 'Submit Report'; btn.disabled = false; }
    alert('Submission failed: ' + (e && e.message ? e.message : String(e)));
  }
}

function _supFlashSuccess() {
  var flash = document.getElementById('sup-flash');
  if (flash) { flash.style.display = 'block'; setTimeout(function() { if (flash) flash.style.display = 'none'; }, 3000); }

  // Reset form
  var fields = ['sup-title','sup-desc','sup-steps'];
  fields.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });

  var modal = document.getElementById('sup-modal');
  if (modal) { modal._supType = 'bug'; modal._supSeverity = 'medium'; modal._supAutoSev = false; modal._supUserType = false; }
  _supSetType('bug');
  _supSetSeverity('medium');

  var dw = document.getElementById('sup-dupe-warn');
  if (dw) dw.style.display = 'none';

  var btn = document.getElementById('sup-submit-btn');
  if (btn) { btn.textContent = 'Submit Report'; btn.disabled = false; }
}

// ── Drag support ──────────────────────────────────────────────────────────────
function _supInitDrag(handle, modal) {
  if (!handle || !modal) return;
  var drag = { active: false, startX: 0, startY: 0, origLeft: 0, origTop: 0 };

  handle.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    var rect = modal.getBoundingClientRect();
    drag = { active: true, startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top };

    function onMove(e) {
      if (!drag.active) return;
      var dx = e.clientX - drag.startX;
      var dy = e.clientY - drag.startY;
      modal.style.right  = 'auto';
      modal.style.bottom = 'auto';
      modal.style.left   = (drag.origLeft + dx) + 'px';
      modal.style.top    = (drag.origTop  + dy) + 'px';
      modal.classList.add('sup-dragged');
    }
    function onUp() {
      drag.active = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    e.preventDefault();
  });
}

// ── Open ticket count for FAB badge ──────────────────────────────────────────
async function _supLoadOpenCount() {
  try {
    var firmId = typeof FIRM_ID_CAD !== 'undefined' ? FIRM_ID_CAD
               : typeof FIRM_ID !== 'undefined' ? FIRM_ID
               : null;
    if (!firmId) return;
    var tickets = await API.get(
      'support_tickets?firm_id=eq.' + firmId +
      '&status=in.(open,in_progress)&deleted_at=is.null&select=id'
    ).catch(function() { return []; });
    supUpdateFabBadge(Array.isArray(tickets) ? tickets.length : 0);
  } catch(e) {}
}

// ── Queue renderer ────────────────────────────────────────────────────────────
// Call: supRenderQueue(containerEl, { module:'cadencehud', status:'open' })
async function supRenderQueue(container, filters) {
  if (!container) return;
  var FA = 'font-family:Arial,sans-serif;';
  var F11 = FA + 'font-size:11px;';
  var F10 = FA + 'font-size:10px;';

  container.innerHTML = '<div style="' + F11 + 'color:rgba(255,255,255,.3);padding:20px;text-align:center">Loading queue…</div>';

  try {
    var firmId = typeof FIRM_ID_CAD !== 'undefined' ? FIRM_ID_CAD
               : typeof FIRM_ID !== 'undefined' ? FIRM_ID
               : null;
    if (!firmId) { container.innerHTML = '<div style="' + F11 + 'color:rgba(255,255,255,.3);padding:20px;text-align:center">Auth not ready</div>'; return; }

    var query = 'support_tickets?firm_id=eq.' + firmId + '&deleted_at=is.null&order=created_at.desc' +
      '&select=*,support_ticket_comments(id)';

    var tickets = await API.get(query).catch(function() { return []; });
    if (!Array.isArray(tickets)) tickets = [];

    // Cache for duplicate detection
    _supTicketCache = tickets;

    // Apply filters
    var f = filters || {};
    var filtered = tickets.filter(function(t) {
      if (f.module && f.module !== 'all' && t.module !== f.module) return false;
      if (f.type   && f.type   !== 'all' && t.ticket_type !== f.type) return false;
      if (f.status && f.status !== 'all' && t.status !== f.status) return false;
      if (f.severity && f.severity !== 'all' && t.severity !== f.severity) return false;
      return true;
    });

    if (!filtered.length) {
      container.innerHTML = '<div style="' + F11 + 'color:rgba(255,255,255,.25);padding:20px;text-align:center;font-style:italic">' +
        (tickets.length ? 'No tickets match current filters' : 'No tickets yet — the queue is clear') +
      '</div>';
      return;
    }

    container.innerHTML = filtered.map(function(t) {
      var sev  = _SUP_SEVERITY[t.severity] || _SUP_SEVERITY.medium;
      var stat = _SUP_STATUS[t.status]     || _SUP_STATUS.open;
      var isBug = t.ticket_type === 'bug';
      var typeColor = isBug ? '#e84040' : '#5090f0';
      var typeLabel = isBug ? '⚠ BUG' : '◈ ENHANCEMENT';
      var age = Math.floor((Date.now() - new Date(t.created_at).getTime()) / 86400000);
      var ageStr = age === 0 ? 'Today' : age === 1 ? 'Yesterday' : age + 'd ago';
      var commentCount = Array.isArray(t.support_ticket_comments) ? t.support_ticket_comments.length : 0;

      return '<div class="sup-queue-row" onclick="_supOpenTicket(\'' + t.id + '\')" ' +
        'style="border-left:3px solid ' + (isBug ? sev.color : '#5090f044') + '">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
            '<span style="' + F10 + 'font-weight:700;color:' + typeColor + '">' + typeLabel + '</span>' +
            (isBug ? '<span style="' + F10 + 'font-weight:700;color:' + sev.color + '">' + sev.icon + ' ' + sev.label + '</span>' : '') +
            '<span class="sup-pill" style="background:' + stat.bg + ';color:' + stat.color + ';border:1px solid ' + stat.color + '44">' + stat.label + '</span>' +
          '</div>' +
          '<div style="' + F11 + 'color:rgba(255,255,255,.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px">' + _supEsc(t.title) + '</div>' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            '<span style="' + F10 + 'color:rgba(255,255,255,.3)">' + ageStr + '</span>' +
            (t.assigned_to
              ? '<span style="' + F10 + 'color:rgba(255,255,255,.35)">Assigned</span>'
              : '<span style="' + F10 + 'color:#f0a030">⚠ Unassigned</span>') +
            (commentCount ? '<span style="' + F10 + 'color:rgba(255,255,255,.3)">💬 ' + commentCount + '</span>' : '') +
            '<span style="' + F10 + 'color:rgba(255,255,255,.25);text-transform:uppercase;letter-spacing:.06em">' + (_SUP_MODULE_LABELS[t.module] || t.module) + '</span>' +
          '</div>' +
        '</div>' +
        '<div style="' + F10 + 'color:rgba(255,255,255,.2);margin-left:10px;flex-shrink:0">→</div>' +
      '</div>';
    }).join('');

  } catch(e) {
    container.innerHTML = '<div style="font-family:Arial,sans-serif;font-size:11px;color:#e84040;padding:20px;text-align:center">Error loading queue: ' + _supEsc(e.message || String(e)) + '</div>';
  }
}

// ── Ticket detail (stub — opens in right panel or modal) ──────────────────────
function _supOpenTicket(ticketId) {
  // Dispatch a custom event — host page can listen and render detail view
  var ev = new CustomEvent('sup:open-ticket', { detail: { ticketId: ticketId } });
  document.dispatchEvent(ev);
}

// ── Module detection ──────────────────────────────────────────────────────────
function _supDetectCurrentModule() {
  var path = window.location.pathname.toLowerCase();
  if (path.indexOf('cadence') !== -1) return 'cadencehud';
  if (path.indexOf('compass') !== -1) return 'compass';
  if (path.indexOf('pipeline') !== -1) return 'pipeline';
  return 'general';
}

// ── Utility ───────────────────────────────────────────────────────────────────
function _supEsc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
(function supInit() {
  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      supInitFab();
      _supLoadOpenCount();
    });
  } else {
    supInitFab();
    _supLoadOpenCount();
  }
})();

// ── Public API ────────────────────────────────────────────────────────────────
window.supOpenModal    = supOpenModal;
window.supCloseModal   = supCloseModal;
window.supRenderQueue  = supRenderQueue;
window.supPushBreadcrumb = supPushBreadcrumb;
window._supSetType     = _supSetType;
window._supSetSeverity = _supSetSeverity;
window._supOnTitleChange = _supOnTitleChange;
window._supToggleContext = _supToggleContext;
window._supSubmit      = _supSubmit;
window._supOpenTicket  = _supOpenTicket;