// ════════════════════════════════════════════════════════════════════════════
// signature.js  ·  v20260412-SIG1
// CadenceHUD — Shared Signature Module
//
// Provides interactive cursive signature fields for any Cadence HTML form,
// whether rendered in:
//   - Cadence Form Editor preview (pdf/HTML overlay)
//   - Compass review panel (iframe via myrOpenAttachment)
//   - Standalone form iframe (Compass MY REQUESTS)
//
// Pattern targeted:
//   <div data-field-id="fXX" data-label="Role Signature"
//        data-sig-role="submitter|manager|finance|..."
//        style="border-bottom:...height:32px..."></div>
//   <input type="date" data-field-id="fXXd" data-label="Role Signature Date"
//          data-sig-role="submitter|manager|finance|...">
//
// API:
//   CadenceSignature.activate(doc, options)
//     Finds all signature divs in `doc`, converts them to cursive inputs.
//     options:
//       activeRole   {string}  — only this role's field is editable; others locked
//       signerName   {string}  — pre-fill the active field with the signer's name
//       onSign       {fn}      — callback(role, name, date) when a field is signed
//       readOnly     {bool}    — lock all fields (review view with no pending sig)
//
//   CadenceSignature.loadFont(doc)
//     Injects Dancing Script from Google Fonts into `doc`. Returns Promise.
//     Safe to call multiple times — idempotent.
//
//   CadenceSignature.serialize(doc)
//     Returns { [data-label]: value } for all signature + date fields.
//     For use in saveDraft / submitForApproval serialization.
//
// Dependencies: none — fully self-contained.
// ════════════════════════════════════════════════════════════════════════════

console.log('%c[signature] v20260412-SIG1 — shared cursive signature module',
  'background:#1a3a5a;color:#7dd3fc;font-weight:700;padding:2px 8px;border-radius:3px');

(function(global) {

  // ── Font loader ────────────────────────────────────────────────────────────
  function loadFont(doc) {
    doc = doc || document;
    if (doc.getElementById('cad-sig-font')) return Promise.resolve();
    return new Promise(function(resolve) {
      var link = doc.createElement('link');
      link.id   = 'cad-sig-font';
      link.rel  = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap';
      link.onload = resolve;
      link.onerror = resolve; // fail gracefully — cursive will fall back to system font
      (doc.head || doc.body).appendChild(link);

      // Also inject the style rule that forces Dancing Script on sig inputs
      if (!doc.getElementById('cad-sig-style')) {
        var style = doc.createElement('style');
        style.id = 'cad-sig-style';
        style.textContent = [
          '[data-cad-sig-input] {',
          '  font-family: "Dancing Script", cursive !important;',
          '  font-size: 20px !important;',
          '  font-weight: 600 !important;',
          '  color: #0a2280 !important;',
          '  border: none !important;',
          '  background: transparent !important;',
          '  outline: none !important;',
          '  width: 100% !important;',
          '  height: 100% !important;',
          '  padding: 0 6px !important;',
          '  box-sizing: border-box !important;',
          '  cursor: text !important;',
          '}',
          '[data-cad-sig-input]:disabled {',
          '  cursor: not-allowed !important;',
          '  color: #9ca3af !important;',
          '}',
          '[data-cad-sig-wrap] {',
          '  position: relative;',
          '  display: flex;',
          '  align-items: center;',
          '  background: rgba(0,0,0,.02);',
          '  border-radius: 3px;',
          '  transition: background .15s;',
          '}',
          '[data-cad-sig-wrap].active {',
          '  background: rgba(59,130,246,.06);',
          '  outline: 1px solid rgba(59,130,246,.3);',
          '}',
          '[data-cad-sig-wrap].signed {',
          '  background: rgba(29,158,117,.05);',
          '  outline: 1px solid rgba(29,158,117,.25);',
          '}',
        ].join('\n');
        (doc.head || doc.body).appendChild(style);
      }
    });
  }

  // ── Activate ───────────────────────────────────────────────────────────────
  function activate(doc, opts) {
    doc  = doc  || document;
    opts = opts || {};
    var activeRole  = opts.activeRole  || null;  // role whose field is editable
    var signerName  = opts.signerName  || '';    // pre-fill name for active role
    var onSign      = opts.onSign      || null;  // callback(role, name, date)
    var readOnly    = opts.readOnly    || false;  // lock all fields

    // Find all signature divs — they have data-sig-role and no children yet
    var sigDivs = doc.querySelectorAll('[data-sig-role][data-field-id]');
    if (!sigDivs.length) return;

    loadFont(doc).then(function() {
      sigDivs.forEach(function(div) {
        // Only target the <div> signature lines, not the date <input> fields
        if (div.tagName !== 'DIV') return;

        var role     = div.dataset.sigRole;
        var fieldId  = div.dataset.fieldId;
        var label    = div.dataset.label || 'Signature';
        var isActive = !readOnly && (activeRole === null || role === activeRole);
        var isSigned = false;

        // ── Build the interactive wrapper ──────────────────────────────────
        var wrap = doc.createElement('div');
        wrap.setAttribute('data-cad-sig-wrap', '1');
        wrap.style.cssText = div.style.cssText;  // inherit the border-bottom etc.
        wrap.style.height  = '34px';

        var inp = doc.createElement('input');
        inp.type = 'text';
        inp.setAttribute('data-cad-sig-input', '1');
        inp.setAttribute('data-field-id', fieldId);
        inp.setAttribute('data-label', label);
        inp.setAttribute('data-sig-role', role);
        inp.placeholder = isActive ? 'Type to sign…' : '';
        inp.disabled    = !isActive;

        // Pre-fill if signer name provided for this role
        if (isActive && signerName) {
          inp.value = signerName;
          isSigned  = true;
          wrap.classList.add('signed');
          _autoDate(doc, role, isSigned);
          if (onSign) onSign(role, signerName, _todayStr());
        }

        // Sign-on-type
        if (isActive) {
          wrap.classList.add('active');
          inp.addEventListener('input', function() {
            var signed = inp.value.trim().length > 1;
            if (signed && !isSigned) {
              isSigned = true;
              wrap.classList.remove('active');
              wrap.classList.add('signed');
              _autoDate(doc, role, true);
              if (onSign) onSign(role, inp.value.trim(), _todayStr());
            } else if (!signed && isSigned) {
              isSigned = false;
              wrap.classList.remove('signed');
              wrap.classList.add('active');
              _autoDate(doc, role, false);
            }
          });
        }

        wrap.appendChild(inp);

        // Signed check icon (hidden until signed)
        var tick = doc.createElement('span');
        tick.style.cssText = 'position:absolute;right:6px;font-size:12px;color:#1D9E75;' +
          'opacity:0;transition:opacity .2s;pointer-events:none';
        tick.textContent = '✓';
        wrap.appendChild(tick);

        if (isActive) {
          inp.addEventListener('input', function() {
            tick.style.opacity = inp.value.trim().length > 1 ? '1' : '0';
          });
        }

        // Replace the static div with the interactive wrap
        div.parentNode.replaceChild(wrap, div);
      });
    });
  }

  // ── Auto-date helper ───────────────────────────────────────────────────────
  // Finds the date input paired with the same sig-role and fills it
  function _autoDate(doc, role, fill) {
    var today   = _todayStr();
    var dateInp = doc.querySelector(
      'input[type="date"][data-sig-role="' + role + '"]'
    );
    if (!dateInp) {
      // Fallback: find by label proximity — any date input whose label contains
      // the role keyword and "date"
      var allDates = doc.querySelectorAll('input[type="date"]');
      allDates.forEach(function(d) {
        var lbl = (d.dataset.label || '').toLowerCase();
        if (lbl.includes('date') && lbl.includes(role.slice(0, 4))) {
          dateInp = d;
        }
      });
    }
    if (!dateInp) return;
    dateInp.value = fill ? today : '';
    // Flash green on fill
    if (fill) {
      dateInp.style.borderColor = '#1D9E75';
      setTimeout(function() { dateInp.style.borderColor = ''; }, 1500);
    }
  }

  // ── Serialize ──────────────────────────────────────────────────────────────
  // Returns { [data-label]: value } for all activated signature inputs + dates
  function serialize(doc) {
    doc = doc || document;
    var out = {};
    // Activated signature inputs
    doc.querySelectorAll('[data-cad-sig-input]').forEach(function(inp) {
      if (inp.dataset.label && inp.value) {
        out[inp.dataset.label] = inp.value;
      }
    });
    // Paired date inputs
    doc.querySelectorAll('input[type="date"][data-sig-role]').forEach(function(inp) {
      if (inp.dataset.label && inp.value) {
        out[inp.dataset.label] = inp.value;
      }
    });
    return out;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _todayStr() {
    var d = new Date();
    return (d.getMonth() + 1).toString().padStart(2, '0') + '/' +
           d.getDate().toString().padStart(2, '0') + '/' +
           d.getFullYear();
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  global.CadenceSignature = {
    activate:  activate,
    loadFont:  loadFont,
    serialize: serialize,
  };

}(window));