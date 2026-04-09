// cdn-form-editor.js — Cadence: Form Library tab
// VERSION: 20260401-230000
console.log('%c[cdn-form-editor] v20260407-SE90 8px;border-radius:3px');

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL FONT RULE — injected once, applies to all form editor UI
// Rule: Arial, 14px minimum. No exceptions. Monospace banned in form UI.
// ─────────────────────────────────────────────────────────────────────────────
(function _injectFormEditorFonts() {
  if (document.getElementById('form-editor-font-rules')) return;
  const s = document.createElement('style');
  s.id = 'form-editor-font-rules';
  s.textContent = `
    /* Form editor — uniform Arial font for UI chrome only */
    #form-col-fields *, #form-col-routing *, #form-col-matrix *, #form-lib-col *,
    #form-editor-main button { font-family: Arial, sans-serif !important; }

    /* Preview wraps — force visible, never let app CSS hide them */
    .form-preview-input-wrap {
      visibility: visible !important;
      opacity: 1 !important;
      display: block !important;
      pointer-events: auto;
    }
    /* Preview inputs — black text, white bg, no font-size override */
    .form-preview-input-wrap input,
    .form-preview-input-wrap textarea {
      font-family: Arial, sans-serif !important;
      color: #111 !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
    /* Signature — cursive, never overridden */
    .form-preview-input-wrap input[data-sig],
    .form-preview-sig-type {
      font-family: 'Dancing Script', cursive !important;
      color: #0a2280 !important;
    }
  `;
  document.head.appendChild(s);
})();



// ─────────────────────────────────────────────────────────────────────────────
// FORM CoC PANEL — CSS (injected once)
// ─────────────────────────────────────────────────────────────────────────────
(function _injectFormCoCStyles() {
  if (document.getElementById('form-coc-styles')) return;
  // Version tooltip styles
  if (!document.getElementById('form-ver-tooltip-styles')) {
    var vs = document.createElement('style');
    vs.id = 'form-ver-tooltip-styles';
    vs.textContent = [
      '.ver-tooltip-wrap{position:relative;display:inline-block;align-self:center}',
      '.ver-tooltip{display:none;position:absolute;bottom:calc(100% + 8px);right:0;',
      'width:380px;background:var(--bg2,#1a1f2e);border:1px solid var(--border2,rgba(255,255,255,.15));',
      'border-radius:8px;padding:14px 16px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,.5);',
      'font-family:Arial,sans-serif}',
      '.ver-tooltip table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px}',
      '.ver-tooltip th{text-align:left;padding:3px 6px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:600;font-size:10px;letter-spacing:.06em;text-transform:uppercase}',
      '.ver-tooltip td{padding:4px 6px;border-bottom:0.5px solid var(--border);color:var(--text2);font-size:11px;vertical-align:top}',
      '.ver-tooltip td:first-child{font-weight:700;color:var(--text);white-space:nowrap}',
      '.ver-tooltip td:nth-child(2){color:var(--cad);font-family:monospace;white-space:nowrap}',
      '.ver-tooltip .ver-note{font-size:11px;color:var(--text2);line-height:1.6;margin-bottom:8px}',
      '.ver-tooltip .ver-caveat{font-size:10px;color:var(--muted);border-top:0.5px solid var(--border);padding-top:8px;margin-top:4px}',
      '.ver-tooltip-wrap:hover .ver-tooltip{display:block}',
    ].join('');
    document.head.appendChild(vs);
  }
  const s = document.createElement('style');
  s.id = 'form-coc-styles';
  s.textContent = `
    .form-coc-panel {
      width: 0; min-width: 0; overflow: hidden; flex-shrink: 0;
      background: var(--bg1);
      border-left: 1px solid transparent;
      display: flex; flex-direction: column;
      transition: width .22s cubic-bezier(.4,0,.2,1), border-color .22s;
    }
    .form-coc-panel.open { width: 300px; min-width: 220px; border-left-color: var(--border); }
    .form-coc-resize {
      position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
      cursor: col-resize; background: transparent; transition: background .15s; z-index: 10;
    }
    .form-coc-resize:hover, .form-coc-resize.dragging { background: var(--cad-wire); }
    .form-coc-inner { display: flex; flex-direction: column; height: 100%; overflow: hidden; padding-left: 4px; }
    .form-coc-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0;
    }
    .form-coc-title {
      font-size: 12px; font-weight: 600; letter-spacing: .08em;
      text-transform: uppercase; color: var(--muted); font-family: Arial, sans-serif;
    }
    .form-coc-body { flex: 1; overflow-y: auto; padding: 10px 12px; }
    .form-coc-event {
      display: flex; gap: 8px; margin-bottom: 12px; position: relative;
    }
    .form-coc-event::before {
      content: ''; position: absolute; left: 5px; top: 16px; bottom: -12px;
      width: 1px; background: var(--border);
    }
    .form-coc-event:last-child::before { display: none; }
    .form-coc-dot {
      width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0;
      margin-top: 3px; border: 2px solid var(--bg1);
    }
    .form-coc-who { font-size: 11px; color: var(--muted); margin-top: 3px; font-family: Arial, sans-serif; }
  `;
  document.head.appendChild(s);
})();


// Renders the Forms tab: document list, form editor canvas, field list, routing panel
// LOAD ORDER: after cdn-core-state.js
// ─────────────────────────────────────────────────────────────────────────────
//
// STATE (all module-scoped)
//   _formDefs         — array of form definitions for this firm/template
//   _selectedForm     — the form definition currently open in the editor
//   _formFields       — working copy of fields for the open form
//   _formRouting      — { mode: 'serial'|'parallel', roles: [{role,label,order}] }
//   _formDragField    — field being dragged in the routing list
//   _formDragRole     — role row being dragged (serial reorder)
//   _pdfDoc           — PDF.js document handle for the loaded source
//   _pdfPage          — current page number (1-based)
//   _pdfTotalPages    — total page count
//   _pdfScale         — render scale (1.5 default)
//   _drawingRect      — { startX, startY, active } for manual field draw
//
// ─────────────────────────────────────────────────────────────────────────────

let _formDefs        = [];
let _selectedForm    = null;
let _formFields      = [];
let _formRouting     = { mode: 'serial', roles: [] };
var _formVisMatrix   = {};   // { fieldId: { role: 'E'|'R'|'H' } }
var _formMatrixRoles = [];   // ordered role keys active in the matrix
let _formDragField   = null;
let _formDragRole    = null;
let _pdfDoc          = null;
let _pdfPage         = 1;
let _pdfTotalPages   = 1;
let _pdfScale        = 1.5;
let _pdfStartPage    = 1;  // absolute page in _pdfDoc that editor page 1 maps to
let _drawingRect     = null;
let _formMode        = 'select'; // 'select' | 'draw' — controls cursor and interaction
let _selectedFieldIds = new Set(); // IDs currently selected (multi-select)
let _marqueeDrag      = null;      // { startX, startY, active } for marquee selection
let _lastFieldClick   = 0;
let _formDirty        = false; // true after first edit, cleared on save
let _formPreviewMode  = false; // true when preview panel is active
let _previewStage     = 1;     // current stage being previewed
let _previewResponses = {};    // fieldId → value (in-memory only, never saved)
let _sigDrawing       = {};    // fieldId → { canvas, ctx, drawing }         // timestamp of last field click (double-click detection)
let _lastFieldClickId = null;      // field id of last click

// ── Role vocabulary ──────────────────────────────────────────────────────────
// Maps field.role values to display labels and colours
const FORM_ROLES = {
  assignee: { label: 'Assignee',  color: '#4f8ef7', dim: 'rgba(79,142,247,.15)' },
  reviewer: { label: 'Reviewer',  color: '#c47d18', dim: 'rgba(196,125,24,.15)' },
  approver: { label: 'Approver',  color: '#2a9d40', dim: 'rgba(42,157,64,.15)'  },
  pm:       { label: 'PM',        color: '#7c4dff', dim: 'rgba(124,77,255,.15)' },
  external: { label: 'External',  color: '#8b91a5', dim: 'rgba(139,145,165,.15)'},
};

// ─────────────────────────────────────────────────────────────────────────────
// LEFT RAIL BUTTON STYLE HELPER
// ─────────────────────────────────────────────────────────────────────────────
function _railBtn(active = false) {
  return [
    'width:52px;height:52px;border-radius:6px;border:none;cursor:pointer',
    'display:flex;align-items:center;justify-content:center',
    'font-size:20px;font-family:Arial,sans-serif;transition:all .12s',
    active
      ? 'background:var(--cad);color:var(--bg)'
      : 'background:transparent;color:var(--text1)'
  ].join(';');
}

// Updates the active state of rail mode buttons (called from _formSetMode + _formTogglePreview)
function _formRefreshRailMode(mode) {
  var btnMap = { select:'form-mode-select', draw:'form-mode-draw', preview:'form-mode-preview' };
  Object.entries(btnMap).forEach(function([m, id]) {
    var btn = document.getElementById(id);
    if (!btn) return;
    var isActive = (m === mode);
    btn.style.background   = isActive ? 'var(--cad)' : 'transparent';
    btn.style.color        = isActive ? 'var(--bg)'  : 'var(--text1)';
    btn.style.borderColor  = isActive ? 'var(--cad)' : 'var(--border)';
  });
  var po = document.getElementById('form-popout-btn');
  if (po) po.style.display = (mode === 'preview') ? 'flex' : 'none';
}

function _formRelativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000), h = Math.floor(m/60), d = Math.floor(h/24);
  if (d > 30) return new Date(iso).toLocaleDateString();
  if (d > 0)  return d + 'd ago';
  if (h > 0)  return h + 'h ago';
  if (m > 0)  return m + 'm ago';
  return 'just now';
}

const FIELD_TYPES = ['text', 'date', 'number', 'checkbox', 'signature', 'textarea'];

// Extended type list including review (4-state) and doc_ref (paired number+rev)
const FIELD_TYPES_FULL = ['text', 'date', 'number', 'checkbox', 'signature', 'textarea', 'review', 'doc_ref', 'attendees'];

const FIELD_TYPE_META = {
  text:      { icon: 'T',  label: 'Text',      color: 'var(--text2)' },
  date:      { icon: '📅', label: 'Date',      color: 'var(--accent)' },
  number:    { icon: '#',  label: 'Number',    color: 'var(--text2)' },
  checkbox:  { icon: '☑', label: 'Checkbox',  color: 'var(--cad)' },
  signature: { icon: '✍', label: 'Signature', color: 'var(--amber)' },
  textarea:  { icon: '¶', label: 'Textarea',  color: 'var(--text2)' },
  review:    { icon: '◑', label: 'Review',    color: '#00b9c3' },
  doc_ref:   { icon: '⎘', label: 'Doc Ref',   color: 'var(--accent)' },
  attendees: { icon: '👥', label: 'Attendees', color: 'var(--green)' },
};

const REVIEW_VALUES  = ['', 'pass', 'fail', 'na'];
const REVIEW_DISPLAY = { '': '—', pass: '✓', fail: '✗', na: 'N/A' };
const REVIEW_COLORS  = { '': 'var(--muted)', pass: 'var(--green)', fail: 'var(--red)', na: 'var(--amber)' };

// ─────────────────────────────────────────────────────────────────────────────
// TAB ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// VERSION HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function _formInitVersion(fmt) {
  if (fmt === 'rev_letter') return 'Rev A';
  if (fmt === 'integer')    return 'v1';
  return '0.1.0';
}

function _formBumpVersion(ver, fmt, type='minor') {
  if (fmt === 'rev_letter') {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const cur = ver?.replace('Rev ','') || 'A';
    const idx = letters.indexOf(cur);
    return 'Rev ' + (letters[idx+1] || 'Z');
  }
  if (fmt === 'integer') {
    const n = parseInt(ver?.replace('v','') || '1');
    return 'v' + (n+1);
  }
  // semver
  const parts = (ver||'0.1.0').split('.').map(Number);
  if (type === 'major') { parts[0]++; parts[1]=0; parts[2]=0; }
  else if (type === 'minor') { parts[1]++; parts[2]=0; }
  else { parts[2]++; }
  return parts.join('.');
}

function _formStateLabel(state) {
  return { draft:'Draft', certified:'Certified', published:'Published', archived:'Archived',
           rejected_review:'Rejected — Review', rejected_approval:'Rejected — Approval', rejected_release:'Rejected — Release' }[state] || state;
}

function _formStateColor(state, bg) {
  var colors = {
    draft:      '#a8b4c8',
    certified:  '#60a5fa',
    published:  '#4ade80',
    archived:   '#a8b4c8',
  };
  var bgs = {
    draft:      'rgba(168,180,200,.12)',
    certified:  'rgba(96,165,250,.12)',
    published:  'rgba(74,222,128,.12)',
    archived:   'rgba(168,180,200,.1)',
  };
  if (bg) return bgs[state] || 'rgba(168,180,200,.12)';
  return colors[state] || '#a8b4c8';
}

function renderFormsTab(el) {
  window.renderFormsTab = renderFormsTab; // ensure global availability
  // Ensure categories are always current when Form Library is open.
  // _fsLoad is safe to call at any time — it just refreshes _fsCats in the background.
  if (window.FormSettings?.loadCategories) {
    window.FormSettings.loadCategories().catch(() => {});
  }
  el.innerHTML = `
    <div style="display:flex;width:100%;height:100%;overflow:hidden">

      <!-- ── Left column: form list ───────────────────────────────── -->
      <div id="form-lib-col" style="width:220px;min-width:160px;max-width:400px;
                  border-right:1px solid var(--border);display:flex;flex-direction:column;
                  background:var(--bg1);position:relative;flex-shrink:0">
        <!-- Drag handle on right edge -->
        <div style="position:absolute;right:-3px;top:0;bottom:0;width:6px;cursor:col-resize;
                    z-index:10;background:transparent;transition:background .15s"
          onmouseover="this.style.background='rgba(196,125,24,.3)'"
          onmouseout="if(!window._formDragCol)this.style.background='transparent'"
          onmousedown="_formColDragStart(event,'form-lib-col','right')"></div>
        <div style="padding:10px 14px;border-bottom:1px solid var(--border);
                    display:flex;flex-direction:column;gap:6px;flex-shrink:0">
          <span style="font-size:12px;font-weight:600;letter-spacing:.14em;
                       text-transform:uppercase;color:var(--muted)">Form Library</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-cad btn-sm" onclick="_formUploadClick()"
              style="font-size:11px;padding:3px 10px;border-radius:99px;font-family:Arial,sans-serif">↑ Import</button>
            <button class="btn btn-cad btn-sm" onclick="_formAiGenerate()"
              style="font-size:11px;padding:3px 10px;border-radius:99px;font-family:Arial,sans-serif">✦ Generate</button>
          </div>
        </div>
        <div id="form-list" style="flex:1;overflow-y:auto;padding:6px 0">
          ${_renderFormList()}
        </div>
        <!-- Hidden file input -->
        <input type="file" id="form-file-input" accept=".pdf,.doc,.docx"
          style="display:none" onchange="_formFileChosen(event)"/>
        <input type="file" id="form-replace-input" accept=".pdf"
          style="display:none" onchange="_formReplacePdfChosen(event)"/>
      </div>

      <!-- ── Main area: editor or empty state ─────────────────────── -->
      <div id="form-editor-main" style="flex:1;display:flex;overflow:hidden;min-width:0;position:relative">
        ${_selectedForm ? _renderFormEditor() : _renderFormEmpty()}
      </div>

    </div>`;

  if (_selectedForm && _pdfDoc) {
    requestAnimationFrame(() => _renderPdfPage(_pdfStartPage + _pdfPage - 1));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM LIST
// ─────────────────────────────────────────────────────────────────────────────

function _renderFormList() {
  if (!_formDefs.length) {
    return `<div style="padding:24px 14px;text-align:center;font-size:12px;
                        color:var(--muted);line-height:1.8">
              No forms yet.<br/>Import a PDF or Word document<br/>to create a fillable form.
            </div>`;
  }
  return _formDefs.map(f => {
    const sel = _selectedForm?.id === f.id;
    const st  = f.state || 'draft';
    const ver = f.version || '0.1.0';
    const locked = st === 'certified' || st === 'published';
    const stLabel = {released:'RELEASED',draft:'DRAFT',in_review:'IN REVIEW',approved:'APPROVED',archived:'ARCHIVED'}[st] || st.toUpperCase();
    return `
      <div class="tmpl-item status-${st}${sel?' active':''}" onclick="_formSelect('${f.id}')">
        <div class="tmpl-item-name status-${st}" style="display:flex;align-items:center;gap:5px">
          ${escHtml(f.source_name || 'Untitled form')}
          ${locked ? '<span style="font-size:10px;opacity:.7" title="Released">🔒</span>' : ''}
        </div>
        <div class="tmpl-item-meta">
          <span class="tmpl-status ${st}">${stLabel}</span>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--muted)">${escHtml(ver)}</span>
          ${_routingBadge(f)}
          ${f.updated_at ? `<span style="font-size:10px;color:var(--muted)">${_formRelativeTime(f.updated_at)}</span>` : ''}

        </div>
      </div>`;
  }).join('');
}

function _routingBadge(form) {
  const mode = form.routing?.mode || 'serial';
  return `<span style="color:${mode === 'parallel' ? 'var(--accent)' : 'var(--amber)'};font-size:10px;font-family:var(--font-mono)">
    ${mode === 'parallel' ? '⇉ Parallel' : '↓ Serial'}
  </span>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────────────────────────

function _renderFormEmpty() {
  return `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;
                align-items:center;justify-content:center;gap:14px;
                background:var(--bg);color:var(--muted)">
      <div style="font-size:48px;opacity:.12">📄</div>
      <div style="font-size:13px;font-weight:500;color:var(--text2)">No form selected</div>
      <div style="font-size:12px;max-width:280px;text-align:center;line-height:1.7;color:var(--muted)">
        Import a PDF or Word document — Cadence will detect fields automatically.
        You can then add, edit, and assign roles to each field.
      </div>
      <button class="btn btn-cad" onclick="_formUploadClick()"
        style="margin-top:4px">↑ Import Document</button>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM EDITOR — three-column layout
// ─────────────────────────────────────────────────────────────────────────────

function _renderFormEditor() {
  const f = _selectedForm;
  const totalFields = (_formFields || []).length;
  const roles = _deriveRoles(_formFields);

  return `
    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">

      <!-- ── SINGLE CONTROL BAR ───────────────────────────────────── -->
      <div id="form-top-toolbar"
           style="display:flex;align-items:center;gap:6px;padding:5px 14px;
                  border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg2);
                  font-family:Arial,sans-serif;font-size:13px">

        <!-- Editable name -->
        <input id="form-name-input" value="${escHtml(f.source_name || 'Untitled')}"
          style="font-size:13px;font-weight:600;color:var(--text);min-width:80px;max-width:220px;
                 background:transparent;border:none;border-bottom:1px solid transparent;
                 outline:none;font-family:Arial,sans-serif;padding:2px 4px;transition:border-color .15s"
          onfocus="this.style.borderBottomColor='var(--cad)'"
          onblur="this.style.borderBottomColor='transparent';_formRenameCurrent(this.value)"
          oninput="_formMarkDirty()"
          onkeydown="if(event.key==='Enter')this.blur()"
          title="Click to rename — press Enter to confirm"/>

        <div style="width:1px;height:16px;background:var(--border);flex-shrink:0"></div>

        <!-- Canvas mode buttons — from left rail -->
        <button id="form-mode-select" onclick="_formSetMode('select')" title="Select & move fields (S)"
          style="font-size:14px;background:var(--cad);color:var(--bg);border:none;border-radius:4px;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center">◈</button>
        <button id="form-mode-draw" onclick="_formSetMode('draw')" title="Draw new field (D)"
          style="font-size:14px;background:transparent;color:var(--text1);border:1px solid var(--border);border-radius:4px;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center">✎</button>
        <button id="form-mode-preview" onclick="_formTogglePreview()" title="Preview form (P)"
          style="font-size:14px;background:transparent;color:var(--text1);border:1px solid var(--border);border-radius:4px;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center">▶</button>
        <button id="form-popout-btn" onclick="_formPopOutPreview()" title="Pop-out preview"
          style="font-size:14px;background:transparent;color:var(--text1);border:1px solid var(--border);border-radius:4px;width:28px;height:28px;cursor:pointer;display:none;align-items:center;justify-content:center">⤢</button>

        <div style="width:1px;height:16px;background:var(--border);flex-shrink:0"></div>

        <!-- Page nav + zoom -->
        <button id="form-page-prev" onclick="_formPrevPage()" title="Previous page"
          style="font-size:14px;background:transparent;border:none;cursor:pointer;color:var(--text2);padding:0 2px;line-height:1">‹</button>
        <span id="form-page-indicator"
          style="font-size:12px;color:var(--muted);white-space:nowrap;min-width:28px;text-align:center;font-family:Arial,sans-serif">${_pdfPage}/${_pdfTotalPages}</span>
        <button id="form-page-next" onclick="_formNextPage()" title="Next page"
          style="font-size:14px;background:transparent;border:none;cursor:pointer;color:var(--text2);padding:0 2px;line-height:1">›</button>
        <div style="width:1px;height:16px;background:var(--border);flex-shrink:0;margin:0 2px"></div>
        <button onclick="_formZoomOut()" title="Zoom out"
          style="font-size:14px;background:transparent;border:none;cursor:pointer;color:var(--text2);padding:0 2px;line-height:1">−</button>
        <span id="form-zoom-label"
          style="font-size:12px;color:var(--muted);cursor:pointer;white-space:nowrap;min-width:34px;text-align:center;font-family:Arial,sans-serif"
          onclick="_formZoomReset()" title="Reset zoom">${Math.round(_pdfScale * 100 / 1.5)}%</span>
        <button onclick="_formZoomIn()" title="Zoom in"
          style="font-size:14px;background:transparent;border:none;cursor:pointer;color:var(--text2);padding:0 2px;line-height:1">+</button>
        <button onclick="_formZoomFit()" title="Fit to width"
          style="font-size:11px;background:transparent;border:1px solid var(--border);border-radius:3px;cursor:pointer;color:var(--text2);padding:2px 5px;font-family:Arial,sans-serif">⊡</button>
        <button onclick="_formZoomReset()" title="Reset to 100%"
          style="font-size:11px;background:transparent;border:1px solid var(--border);border-radius:3px;cursor:pointer;color:var(--text2);padding:2px 5px;font-family:Arial,sans-serif">1:1</button>

        <!-- H/W widget — shown when fields selected -->
        <div id="form-hw-widget" style="display:none;align-items:center;gap:4px;flex-shrink:0">
          <div style="width:1px;height:18px;background:var(--border)"></div>
          <div style="display:flex;flex-direction:column;gap:2px">
            <div style="display:flex;align-items:center;gap:3px">
              <span style="font-size:11px;color:var(--muted);width:12px;font-family:Arial,sans-serif">H</span>
              <input id="form-hw-h" type="number" step="0.01" min="0.05"
                style="width:52px;font-size:11px;padding:1px 4px;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-family:Arial,sans-serif"
                onchange="_formHWChange('h',parseFloat(this.value))" onclick="this.select()"/>
              <div style="display:flex;flex-direction:column">
                <button onclick="_formHWStep('h',1)"  style="font-size:7px;line-height:1;padding:0 3px;background:var(--surf2);border:1px solid var(--border);border-radius:2px 2px 0 0;cursor:pointer;color:var(--text2)">▲</button>
                <button onclick="_formHWStep('h',-1)" style="font-size:7px;line-height:1;padding:0 3px;background:var(--surf2);border:1px solid var(--border);border-top:none;border-radius:0 0 2px 2px;cursor:pointer;color:var(--text2)">▼</button>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:3px">
              <span style="font-size:11px;color:var(--muted);width:12px;font-family:Arial,sans-serif">W</span>
              <input id="form-hw-w" type="number" step="0.01" min="0.05"
                style="width:52px;font-size:11px;padding:1px 4px;background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--text);font-family:Arial,sans-serif"
                onchange="_formHWChange('w',parseFloat(this.value))" onclick="this.select()"/>
              <div style="display:flex;flex-direction:column">
                <button onclick="_formHWStep('w',1)"  style="font-size:7px;line-height:1;padding:0 3px;background:var(--surf2);border:1px solid var(--border);border-radius:2px 2px 0 0;cursor:pointer;color:var(--text2)">▲</button>
                <button onclick="_formHWStep('w',-1)" style="font-size:7px;line-height:1;padding:0 3px;background:var(--surf2);border:1px solid var(--border);border-top:none;border-radius:0 0 2px 2px;cursor:pointer;color:var(--text2)">▼</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Spacer -->
        <div style="flex:1"></div>

        <!-- Version · state · save -->
        <span id="form-version-display"
          style="font-family:var(--font-mono);font-size:12px;color:var(--muted);flex-shrink:0">
          ${f.version||'0.1.0'}${_formDirty?'*':''}
        </span>
        <span id="form-state-badge"
          style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;font-family:Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;background:${_formStateColor(f.state||'draft',true)};color:${_formStateColor(f.state||'draft')}">
          ${_formStateLabel(f.state||'draft')}
        </span>
        <span id="form-save-indicator"
          style="font-size:12px;color:${_formDirty?'var(--amber)':'var(--green)'};flex-shrink:0">
          ${_formDirty ? '● Unsaved' : '● Saved'}
        </span>

        <div style="width:1px;height:16px;background:var(--border);flex-shrink:0"></div>

        <!-- Launch · Edit Mode -->
        <button onclick="_formLaunchSimulate()" title="Launch simulator"
          style="font-family:Arial,sans-serif;font-size:12px;padding:4px 12px;border-radius:999px;border:1px solid var(--border2);background:transparent;color:var(--text2);cursor:pointer">
          ▶ Launch
        </button>
        <button id="form-edit-mode-btn" title="Toggle inline edit mode"
          style="font-family:Arial,sans-serif;font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid var(--border2);background:transparent;color:var(--text2);cursor:pointer">
          ✎
        </button>
        <button onclick="_formReplacePdf()" title="Replace PDF background" id="form-replace-btn"
          style="font-family:Arial,sans-serif;font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid var(--border2);background:transparent;color:var(--text2);cursor:pointer;${'draft'===(f.state||'draft')?'':'opacity:.3;pointer-events:none'}">
          ↺
        </button>

        <div style="width:1px;height:16px;background:var(--border);flex-shrink:0"></div>

        <!-- CoC + Delete — restored -->
        <button onclick="_formToggleCoC()" id="form-coc-btn" title="Chain of Custody"
          style="font-family:Arial,sans-serif;font-size:12px;padding:4px 12px;border-radius:999px;border:1px solid var(--border2);background:transparent;color:var(--text2);cursor:pointer">
          CoC
        </button>
        <button onclick="_formDeleteWithConfirm('${f.id}')" title="Delete form"
          style="font-family:Arial,sans-serif;font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid var(--border2);background:transparent;color:var(--muted);cursor:pointer">
          🗑
        </button>

        <div style="width:1px;height:16px;background:var(--border);flex-shrink:0"></div>

        <!-- Lifecycle: Save · Commit · Publish -->
        <div id="form-lifecycle-btns" style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          ${_formLifecycleButtons(f)}
        </div>
      </div>

      <!-- ── Body row: left-rail + canvas + fields + routing ────── -->
      <div style="flex:1;display:flex;overflow:hidden;min-height:0" id="form-body-row">

        <!-- ── Canvas column ────────────────────────────────────── -->
        <div style="flex:1;overflow:auto;background:var(--bg);position:relative;min-width:0"
          id="form-canvas-wrap">
          <div style="display:inline-flex;justify-content:center;padding:24px 40px;min-height:100%;min-width:100%;box-sizing:border-box;position:relative">
          <div style="display:inline-block;position:relative;flex-shrink:0">
            <canvas id="form-pdf-canvas" style="display:block;box-shadow:0 4px 24px rgba(0,0,0,.5)"></canvas>
            <!-- SVG overlay for field rectangles -->
            <svg id="form-field-overlay" style="position:absolute;top:0;left:0;
              pointer-events:all;overflow:hidden;cursor:crosshair"
              width="100%" height="100%"
              onmousedown="_formSvgMouseDownOverride(event)"
              onmousemove="_formSvgMouseMoveOverride(event)"
              onmouseup="_formSvgMouseUpOverride(event)">
            </svg>
            <!-- Interaction layer -->
            <div id="form-draw-layer" style="position:absolute;top:0;left:0;
              width:100%;height:100%;cursor:crosshair;display:none">
            </div>
          </div>
          </div>
          <div style="padding:6px 20px 4px;font-size:12px;color:var(--muted);
                      display:flex;align-items:center;flex-shrink:0">
            <span style="font-family:Arial,sans-serif;font-size:12px;color:var(--muted)">
              v${_selectedForm?.version||'0.1.0'}
            </span>
            <span style="flex:1;text-align:center;font-size:12px;color:var(--muted)">
              ✎ Click and drag to add a field
            </span>
            <span id="form-page-footer"
              style="font-family:Arial,sans-serif;font-size:12px;color:var(--muted)">
              ${_pdfPage} / ${_pdfTotalPages}
            </span>
          </div>
        </div>

        <!-- ── Visibility Matrix panel ───────────────────────────── -->
        <div id="form-col-matrix" style="width:560px;min-width:320px;max-width:900px;border-left:1px solid var(--border);display:flex;flex-direction:column;background:var(--bg1);position:relative;flex-shrink:0">
          <!-- Drag handle to resize matrix width -->
          <div style="position:absolute;left:-4px;top:0;bottom:0;width:8px;cursor:col-resize;z-index:10;background:transparent;transition:background .15s"
            onmouseover="this.style.background='rgba(0,201,201,.25)'"
            onmouseout="if(!window._formDragCol)this.style.background='transparent'"
            onmousedown="_formColDragStart(event,'form-col-matrix','left')"></div>
          <div style="padding:6px 10px;border-bottom:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;gap:8px">
            <span style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);flex:1">Visibility Matrix</span>
            <span id="form-fill-seq" style="font-size:12px;color:var(--text2)"></span>
            <button onclick="_formAddMatrixRole()" class="btn btn-ghost btn-sm" style="font-size:12px;padding:2px 8px">+ Role</button>
            <button onclick="_formAutoRename()" class="btn btn-ghost btn-sm" style="font-size:12px;padding:2px 8px" title="Auto-rename">⟳</button>
            <span id="form-sel-count" style="font-size:12px;font-weight:600;color:var(--cad);display:none">0 selected</span>
          </div>
          <div id="form-matrix-wrap" style="flex:1;overflow:auto">
            ${_renderMatrix()}
          </div>
        </div>

      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD LIST (Column 2)
// ─────────────────────────────────────────────────────────────────────────────

// [original _renderFieldList removed — enhanced version is sole definition]

// ─────────────────────────────────────────────────────────────────────────────
// VISIBILITY MATRIX (replaces Fields column + Routing Order column)  SE90
// ─────────────────────────────────────────────────────────────────────────────

var _VM_STATES  = ['E','R','H'];
var _VM_LABELS  = {E:'E', R:'R', H:'—'};
var _VM_CHIP_BG = {E:'rgba(42,157,64,.18)', R:'rgba(196,125,24,.18)', H:'rgba(255,255,255,.04)'};
var _VM_CHIP_CO = {E:'#4ade80',             R:'#e3b341',              H:'rgba(255,255,255,.25)'};

function _vmDefaultState(role) {
  // Submitter edits by default; others read-only; unknown roles hidden
  if (role === 'assignee') return 'E';
  if (role === 'reviewer' || role === 'approver' || role === 'pm') return 'R';
  return 'H';
}

function _vmGet(fieldId, role) {
  if (!_formVisMatrix[fieldId]) _formVisMatrix[fieldId] = {};
  if (_formVisMatrix[fieldId][role] === undefined)
    _formVisMatrix[fieldId][role] = _vmDefaultState(role);
  return _formVisMatrix[fieldId][role];
}

function _vmSet(fieldId, role, state) {
  if (!_formVisMatrix[fieldId]) _formVisMatrix[fieldId] = {};
  _formVisMatrix[fieldId][role] = state;
  _formMarkDirty();
}

function _vmCycleCell(fieldId, role) {
  var cur = _vmGet(fieldId, role);
  var idx = _VM_STATES.indexOf(cur);
  var next = _VM_STATES[(idx + 1) % _VM_STATES.length];
  _vmSet(fieldId, role, next);
  var cellEl = document.getElementById('vmc_' + fieldId + '_' + role);
  if (cellEl) {
    cellEl.style.background = _VM_CHIP_BG[next];
    cellEl.innerHTML = '<div style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:3px;font-size:10px;font-weight:700;color:'+_VM_CHIP_CO[next]+'">'+_VM_LABELS[next]+'</div>';
  }
  _vmUpdateFillSeq();
}

function _vmApplySection(secLabel, role, state) {
  // Apply state to all fields whose label starts with the section prefix
  (_formFields||[]).forEach(function(field) {
    _vmSet(field.id, role, state);
    var cellEl = document.getElementById('vmc_' + field.id + '_' + role);
    if (cellEl) {
      cellEl.style.background = _VM_CHIP_BG[state];
      cellEl.innerHTML = '<div style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:3px;font-size:10px;font-weight:700;color:'+_VM_CHIP_CO[state]+'">'+_VM_LABELS[state]+'</div>';
    }
  });
  _vmUpdateFillSeq();
}

function _vmEnsureRoles() {
  // Sync _formMatrixRoles from FORM_ROLES keys, preserving any existing order
  var known = Object.keys(FORM_ROLES);
  known.forEach(function(r) {
    if (_formMatrixRoles.indexOf(r) < 0) _formMatrixRoles.push(r);
  });
  if (!_formMatrixRoles.length) _formMatrixRoles = ['assignee','reviewer','approver','pm','external'];
}

function _formAddMatrixRole() {
  _vmEnsureRoles();
  var all = Object.keys(FORM_ROLES);
  var available = all.filter(function(r){ return _formMatrixRoles.indexOf(r) < 0; });
  if (!available.length) { cadToast('All roles already added', 'info'); return; }
  // Simple prompt-free: add first available
  var next = available[0];
  _formMatrixRoles.push(next);
  _reRenderMatrix();
}

function _vmUpdateFillSeq() {
  var seqEl = document.getElementById('form-fill-seq');
  if (!seqEl) return;
  _vmEnsureRoles();
  var hasEditable = _formMatrixRoles.filter(function(r) {
    return (_formFields||[]).some(function(f){ return _vmGet(f.id, r) === 'E'; });
  });
  if (!hasEditable.length) { seqEl.textContent = ''; return; }
  var roleLabels = hasEditable.map(function(r){
    return (FORM_ROLES[r]||{label:r}).label;
  });
  seqEl.textContent = 'Fill sequence: ' + roleLabels.join(' → ');
}

function _renderMatrix() {
  _vmEnsureRoles();
  var fields = _formFields || [];
  if (!fields.length) {
    return '<div style="padding:20px 14px;font-size:12px;color:var(--muted);text-align:center;font-family:Arial,sans-serif">Draw fields on the document to populate the matrix.</div>';
  }
  var roles = _formMatrixRoles;
  var out = [];
  var TH  = 'position:sticky;top:0;z-index:5;background:var(--bg2);border-bottom:1px solid var(--border);';
  var THL = TH + 'border-left:1px solid var(--border);';
  var BDR = 'border-bottom:1px solid var(--border);';
  var BDL = BDR + 'border-left:1px solid var(--border);';

  out.push('<table style="width:100%;border-collapse:collapse;font-size:11px;font-family:Arial,sans-serif"><thead><tr>');
  out.push('<th style="' + TH  + 'padding:5px 8px;text-align:left;font-size:12px;font-weight:500;color:var(--muted);min-width:160px">Field</th>');
  out.push('<th style="' + THL + 'padding:5px 6px;text-align:center;font-size:12px;font-weight:500;color:var(--muted);width:44px">Type</th>');
  out.push('<th style="' + THL + 'padding:5px 6px;text-align:center;font-size:12px;font-weight:500;color:var(--muted);width:36px">Req</th>');

  roles.forEach(function(r) {
    var conf = FORM_ROLES[r] || { label: r, color: 'var(--muted)' };
    out.push('<th style="' + THL + 'padding:5px 6px;text-align:center;font-size:10px;font-weight:500;color:' + conf.color + ';min-width:52px;white-space:nowrap">' +
      escHtml(conf.label) +
      '<span data-rmrole="' + r + '" style="margin-left:3px;opacity:.4;cursor:pointer;font-size:9px" title="Remove role">✕</span>' +
      '</th>');
  });
  out.push('</tr></thead><tbody>');

  var sections = _vmGroupSections(fields);
  sections.forEach(function(sec) {
    out.push('<tr><td colspan="' + (3 + roles.length) + '" style="background:var(--bg2);padding:4px 8px;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border);border-top:1px solid rgba(255,255,255,.1)">' +
      escHtml(sec.name) + ' <span style="font-weight:400;opacity:.5">(' + sec.fields.length + ')</span>');
    roles.forEach(function(r) {
      var lbl = escHtml((FORM_ROLES[r] || { label: r }).label);
      ['E','R','H'].forEach(function(st) {
        out.push('<span data-sec="' + sec.id + '" data-srole="' + r + '" data-sstate="' + st + '" ' +
          'style="cursor:pointer;font-size:9px;padding:1px 4px;border-radius:2px;border:1px solid rgba(255,255,255,.1);color:var(--muted);margin-left:2px" ' +
          'title="' + (st==='H'?'Hide':st==='R'?'Read-only':'Editable') + ' all ' + lbl + '">' + (st==='H'?'—':st) + '</span>');
      });
    });
    out.push('</td></tr>');

    sec.fields.forEach(function(field) {
      var typeOpts = (FIELD_TYPES_FULL || ['text','date','number','checkbox','signature','textarea']).map(function(t) {
        var m = (FIELD_TYPE_META && FIELD_TYPE_META[t]) || { label: t };
        return '<option value="' + t + '"' + (field.type === t ? ' selected' : '') + '>' + escHtml(m.label) + '</option>';
      }).join('');
      var isSelected = _selectedFieldIds && _selectedFieldIds.has(field.id);
      var rowBg = isSelected ? 'background:var(--cad-dim)' : '';

      out.push('<tr id="vmrow-' + field.id + '" data-fid="' + field.id + '" style="cursor:pointer;' + rowBg + '">');

      // Name cell
      out.push('<td style="padding:5px 8px;' + BDR + 'color:var(--text1);max-width:160px">' +
        '<div data-label-target="1" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
        escHtml(field.label || 'Unlabelled') + '</div></td>');

      // Type select
      out.push('<td style="padding:3px 4px;' + BDL + 'text-align:center">' +
        '<select data-fid="' + field.id + '" data-action="type" ' +
        'style="font-size:12px;background:var(--surf2);border:1px solid var(--border);border-radius:3px;color:var(--text2);padding:2px;cursor:pointer;width:100%;font-family:Arial,sans-serif;max-width:72px">' +
        typeOpts + '</select></td>');

      // Required toggle
      var reqOn = field.required;
      out.push('<td style="padding:3px 4px;' + BDL + 'text-align:center">' +
        '<div data-fid="' + field.id + '" data-action="req" style="cursor:pointer;display:flex;justify-content:center">' +
        '<div class="toggle-box' + (reqOn ? ' on' : '') + '" style="width:24px;height:13px;transform:scale(.85)"></div>' +
        '</div></td>');

      // Role cells
      roles.forEach(function(r) {
        var s = _vmGet(field.id, r);
        out.push('<td id="vmc_' + field.id + '_' + r + '" ' +
          'data-fid="' + field.id + '" data-role="' + r + '" data-action="cell" ' +
          'style="padding:3px 4px;' + BDL + 'text-align:center;cursor:pointer;background:' + _VM_CHIP_BG[s] + ';transition:filter .1s" ' +
          'title="Click to cycle E\u2192R\u2192\u2014">' +
          '<div style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:3px;font-size:10px;font-weight:700;color:' + _VM_CHIP_CO[s] + '">' +
          _VM_LABELS[s] + '</div></td>');
      });

      out.push('</tr>');
    });
  });

  out.push('</tbody></table>');
  setTimeout(_vmUpdateFillSeq, 0);
  return out.join('');
}

function _vmGroupSections(fields) {
  // Group fields by HTML section if form has source_html sections,
  // otherwise use a single "All Fields" group
  var groups = {};
  var order  = [];
  fields.forEach(function(field) {
    var sec = field.section || 'Fields';
    if (!groups[sec]) { groups[sec] = []; order.push(sec); }
    groups[sec].push(field);
  });
  return order.map(function(name) {
    return { id: name.replace(/\W/g,'_'), name: name, fields: groups[name] };
  });
}

function _vmApplySec(secId, role, state) {
  var fields = _formFields || [];
  fields.forEach(function(field) {
    var sec = (field.section || 'Fields').replace(/\W/g,'_');
    if (sec !== secId) return;
    _vmSet(field.id, role, state);
    var cellEl = document.getElementById('vmc_'+field.id+'_'+role);
    if (cellEl) {
      cellEl.style.background = _VM_CHIP_BG[state];
      cellEl.innerHTML = '<div style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:3px;font-size:10px;font-weight:700;color:'+_VM_CHIP_CO[state]+'">'+_VM_LABELS[state]+'</div>';
    }
  });
  _vmUpdateFillSeq();
}

function _vmRemoveRole(role) {
  _formMatrixRoles = _formMatrixRoles.filter(function(r){ return r !== role; });
  _reRenderMatrix();
}

function _reRenderMatrix() {
  var wrap = document.getElementById('form-matrix-wrap');
  if (wrap) wrap.innerHTML = _renderMatrix();
  _vmUpdateFillSeq();
}

// Shim — keep existing callers working
function _reRenderRoutingPanel() { _reRenderMatrix(); }

// Matrix drag handled by _formColDragStart — no custom function needed

// Delegated event handler for the entire matrix panel — avoids all inline onclick quoting issues
document.addEventListener('click', function(e) {
  var t = e.target;

  // Remove role column
  var rmRole = t.closest('[data-rmrole]');
  if (rmRole) { e.stopPropagation(); _vmRemoveRole(rmRole.dataset.rmrole); return; }

  // Quick-apply section chips
  if (t.dataset.sec && t.dataset.srole && t.dataset.sstate) {
    e.stopPropagation();
    _vmApplySec(t.dataset.sec, t.dataset.srole, t.dataset.sstate);
    return;
  }

  // Cell cycle
  var cell = t.closest('[data-action="cell"]');
  if (cell) { e.stopPropagation(); _vmCycleCell(cell.dataset.fid, cell.dataset.role); return; }

  // Type select (change event — handled separately below)

  // Required toggle
  var reqDiv = t.closest('[data-action="req"]');
  if (reqDiv) { e.stopPropagation(); _formToggleRequired(reqDiv.dataset.fid); return; }

  // Row click — select field + inline label edit
  var row = t.closest('[data-fid]');
  if (row && !t.closest('[data-action]') && !t.closest('select')) {
    _formFieldListClick(e, row.dataset.fid);
  }
});

document.addEventListener('change', function(e) {
  var t = e.target;
  if (t.dataset.action === 'type' && t.dataset.fid) {
    _formUpdateField(t.dataset.fid, 'type', t.value);
  }
});


// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// ROUTING PANEL (Column 3) — the key UI you described
// ─────────────────────────────────────────────────────────────────────────────

function _renderRoutingPanel(roles) {
  if (!roles.length) {
    return '<div style="font-size:12px;color:var(--muted);line-height:1.8;font-family:Arial,sans-serif">Assign roles to fields to build the approval sequence.</div>';
  }
  return `
    <div>
      <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
                  color:var(--muted);margin-bottom:8px;display:flex;align-items:center;gap:6px;
                  font-family:Arial,sans-serif">
        Required Approvals
        <span style="font-weight:400;opacity:.6">— drag to reorder</span>
      </div>
      <div id="form-role-list" style="display:flex;flex-direction:column;gap:6px">
        ${_renderRoleRows(roles)}
      </div>
    </div>`;
}

function _renderRoleRows(roles) {
  const ordered = _formRoutingRolesOrdered(roles);
  return ordered.map((r, idx) => {
    const roleConf = FORM_ROLES[r.role] || { label: r.role, color: 'var(--muted)' };
    const isParallel = r.parallel === true;
    return `
      <div id="role-row-${r.role}"
        draggable="true"
        ondragstart="_formRoleDragStart(event,'${r.role}')"
        ondragover="_formRoleDragOver(event,'${r.role}')"
        ondragleave="_formRoleDragLeave(event)"
        ondrop="_formRoleDrop(event,'${r.role}')"
        ondragend="_formRoleDragEnd()"
        style="border:1px solid var(--border);border-radius:6px;background:var(--surf2);overflow:hidden;cursor:grab">
        <div style="display:flex;align-items:center;gap:8px;padding:6px 10px">
          <span style="font-size:10px;font-weight:700;color:var(--muted);width:12px;text-align:center;flex-shrink:0;font-family:Arial,sans-serif">${idx + 1}</span>
          <div style="width:7px;height:7px;border-radius:50%;background:${roleConf.color};flex-shrink:0"></div>
          <span style="font-size:12px;font-weight:600;color:${roleConf.color};flex:1;font-family:Arial,sans-serif">${roleConf.label}</span>
          <span style="font-size:11px;color:var(--border2);flex-shrink:0;user-select:none">⠿</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;padding:4px 10px 6px;border-top:1px solid var(--border)">
          <div class="config-toggle" onclick="_formToggleRoleParallel('${r.role}')"
            style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <div class="toggle-box${isParallel?' on':''}"></div>
            <span style="font-size:11px;color:var(--muted);font-family:Arial,sans-serif">
              ${isParallel ? '⇉ Parallel' : '↓ Serial'}
            </span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTING LOGIC
// ─────────────────────────────────────────────────────────────────────────────

function _deriveRoles(fields) {
  // Extract unique roles from fields, maintaining insertion order
  const seen = new Set();
  const roles = [];
  (fields || []).forEach(f => {
    if (f.role && !seen.has(f.role)) {
      seen.add(f.role);
      roles.push({ role: f.role });
    }
  });
  return roles;
}

function _formRoutingRolesOrdered(roles) {
  const routingRoles = _formRouting.roles || [];
  // Merge: routing order for roles we know about, append any new roles at end
  const ordered = [];
  const rolesInRouting = routingRoles
    .filter(r => roles.find(dr => dr.role === r.role))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  rolesInRouting.forEach(r => ordered.push(r));

  // Append roles in fields not yet in routing config
  roles.forEach(r => {
    if (!ordered.find(o => o.role === r.role)) {
      ordered.push({ role: r.role, order: ordered.length + 1 });
    }
  });

  return ordered;
}

function _formSetRoutingMode(mode) {
  _formRouting = { ..._formRouting, mode };
  _reRenderRoutingPanel();
}

function _reRenderRoutingPanel() {
  const roles = _deriveRoles(_formFields);
  const panel = document.getElementById('form-role-list')?.closest('[style*="flex-direction:column"]');
  // Re-render just the routing panel content
  const routingCol = document.querySelector('#form-editor-main [style*="width:220px"]');
  if (routingCol) {
    const inner = routingCol.querySelector('[style*="flex:1"]');
    if (inner) inner.innerHTML = _renderRoutingPanel(roles);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLE DRAG-AND-DROP (serial reorder)
// ─────────────────────────────────────────────────────────────────────────────

function _formRoleDragStart(event, role) {
  _formDragRole = role;
  event.dataTransfer.effectAllowed = 'move';
  event.currentTarget.style.opacity = '0.4';
}

function _formRoleDragOver(event, role) {
  if (!_formDragRole || _formDragRole === role) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  event.currentTarget.style.borderColor = 'var(--cad-wire)';
  event.currentTarget.style.background = 'var(--surf3)';
}

function _formRoleDragLeave(event) {
  event.currentTarget.style.borderColor = 'var(--border)';
  event.currentTarget.style.background = 'var(--surf2)';
}

function _formRoleDrop(event, targetRole) {
  event.preventDefault();
  if (!_formDragRole || _formDragRole === targetRole) return;

  const roles = _deriveRoles(_formFields);
  const ordered = _formRoutingRolesOrdered(roles);

  const fromIdx = ordered.findIndex(r => r.role === _formDragRole);
  const toIdx   = ordered.findIndex(r => r.role === targetRole);
  if (fromIdx === -1 || toIdx === -1) return;

  // Reorder
  const moved = ordered.splice(fromIdx, 1)[0];
  ordered.splice(toIdx, 0, moved);

  // Write back with new order values
  _formRouting.roles = ordered.map((r, i) => ({ role: r.role, order: i + 1 }));

  // Clean up and re-render
  event.currentTarget.style.borderColor = 'var(--border)';
  event.currentTarget.style.background  = 'var(--surf2)';
  _reRenderRoutingPanel();
}

function _formToggleRoleParallel(role) {
  const r = (_formRouting.roles||[]).find(function(x){ return x.role === role; });
  if (r) { r.parallel = !r.parallel; _reRenderRoutingPanel(); _formMarkDirty(); }
}

function _formRoleDragEnd() {
  _formDragRole = null;
  document.querySelectorAll('[id^="role-row-"]').forEach(el => {
    el.style.opacity      = '';
    el.style.borderColor  = 'var(--border)';
    el.style.background   = 'var(--surf2)';
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD CLICK — inline edit popover
// ─────────────────────────────────────────────────────────────────────────────

// [original _formSelectField removed — enhanced version is sole definition]

function _formUpdateField(fieldId, key, value) {
  const field = _formFields.find(f => f.id === fieldId);
  if (!field) return;
  const oldVal = field[key];
  field[key] = value;
  _formMarkDirty();
  if (_selectedForm?.id) _formCoCWrite('form.field_modified', _selectedForm.id,
    { field_id:fieldId, field_label:field.label, key, old:oldVal, new:value });

  // When role is assigned, auto-add to Fill Stages if not already present
  if (key === 'role' && value && value !== 'assignee') {
    _formAutoAddStageForRole(value);
  }

  // Sync change to source_html if this is an HTML form
  if (_selectedForm?.source_html && (key === 'label' || key === 'required' || key === 'role')) {
    _formSyncFieldToHtml(fieldId, key, value, field);
  }

  // Re-render the field list row and routing panel
  _reRenderMatrix();
  _reRenderRoutingPanel();
  _renderFieldOverlays();
}

var _formEditModeActive = false;
window._formToggleEditMode = _formToggleEditMode;
window._formEditModeActive = false;

// Wire edit mode button — called after toolbar renders
function _formWireEditBtn() {
  var editBtn = document.getElementById('form-edit-mode-btn');
  if (!editBtn) return;
  // Remove existing overlay if any
  var existingOverlay = document.getElementById('form-edit-btn-overlay');
  if (existingOverlay) existingOverlay.remove();
  // Place a fixed overlay div on top of the button to capture clicks
  var r = editBtn.getBoundingClientRect();
  var overlay = document.createElement('div');
  overlay.id = 'form-edit-btn-overlay';
  overlay.style.cssText = 'position:fixed;z-index:9000;cursor:pointer;' +
    'left:' + r.left + 'px;top:' + r.top + 'px;' +
    'width:' + r.width + 'px;height:' + r.height + 'px;' +
    'background:transparent';
  overlay.addEventListener('mousedown', function(e) {
    e.preventDefault();
    _formToggleEditMode();
    if (_formEditModeActive) {
      editBtn.style.background = 'rgba(42,157,64,.15)';
      editBtn.style.color = '#4ade80';
      editBtn.style.borderColor = 'rgba(42,157,64,.4)';
      editBtn.textContent = '✓ Done';
    } else {
      editBtn.style.background = '';
      editBtn.style.color = '';
      editBtn.style.borderColor = '';
      editBtn.textContent = '✎';
    }
  });
  document.body.appendChild(overlay);
}

function _formToggleEditMode() {
  _formEditModeActive = !_formEditModeActive;
  var btn = document.getElementById('form-edit-mode-btn');
  var iframe = document.getElementById('form-html-preview');
  if (!iframe) { cadToast('Open an HTML form first', 'info'); _formEditModeActive = false; return; }
  var doc = iframe.contentDocument;
  if (!doc) return;

  if (_formEditModeActive) {
    // Enter edit mode — make text nodes editable
    if (btn) { btn.style.background = 'var(--cad-dim)'; btn.style.color = 'var(--cad)'; btn.style.borderColor = 'var(--cad)'; btn.textContent = '✎ Editing'; }
    
    // Inject edit mode styles into iframe
    var style = doc.createElement('style');
    style.id = '_cadEditStyles';
    style.textContent = [
      '[contenteditable]{outline:2px dashed rgba(0,201,201,.5)!important;border-radius:3px;cursor:text;min-width:20px;display:inline-block}',
      '[contenteditable]:hover{outline:2px dashed #00c9c9!important;background:rgba(0,201,201,.06)!important}',
      '[contenteditable]:focus{outline:2px solid #00c9c9!important;background:rgba(0,201,201,.08)!important}',
      '._cad-edit-hint{position:fixed;top:8px;left:50%;transform:translateX(-50%);background:#00c9c9;color:#003333;font-family:Arial,sans-serif;font-size:11px;font-weight:600;padding:4px 14px;border-radius:99px;z-index:9999;pointer-events:none}',
    ].join('');
    doc.head.appendChild(style);

    // Add hint banner
    var hint = doc.createElement('div');
    hint.className = '_cad-edit-hint';
    hint.textContent = 'Edit mode — click any text to edit · changes auto-save on blur';
    doc.body.appendChild(hint);

    // Make text elements contenteditable
    var editableSelectors = [
      '.htitle', '.hsub', '.sec-lbl', 'label', 'th', '.tot-cat', '.tot-title',
      'h1', 'h2', 'h3', 'h4', '[data-label]',
      '.ftr div', 'p'
    ];
    editableSelectors.forEach(function(sel) {
      doc.querySelectorAll(sel).forEach(function(el) {
        // Skip elements containing inputs/selects
        if (el.querySelector('input,select,textarea,button')) return;
        el.contentEditable = 'true';
        el.dataset.cadOriginal = el.innerHTML;
        el.addEventListener('blur', function() { _formEditModeCapture(); });
      });
    });

  } else {
    // Exit edit mode — capture and auto-save to DB
    _formEditModeCapture();
    var s = doc.getElementById('_cadEditStyles');
    if (s) s.remove();
    var h = doc.querySelector('._cad-edit-hint');
    if (h) h.remove();
    doc.querySelectorAll('[contenteditable]').forEach(function(el) {
      el.removeAttribute('contenteditable');
      delete el.dataset.cadOriginal;
    });
    if (btn) { btn.style.background = ''; btn.style.color = ''; btn.style.borderColor = ''; btn.textContent = '✎'; }
    // Auto-save source_html to DB
    if (_selectedForm?.id && _selectedForm.source_html) {
      API.patch('workflow_form_definitions?id=eq.' + _selectedForm.id, {
        source_html: _selectedForm.source_html,
        updated_at: new Date().toISOString()
      }).then(function() {
        cadToast('Edits saved', 'success');
      }).catch(function() {
        cadToast('Edit mode off — remember to Save', 'info');
      });
    } else {
      cadToast('Edit mode off — changes saved', 'success');
    }
  }
}

function _formEditModeCapture() {
  var iframe = document.getElementById('form-html-preview');
  if (!iframe || !iframe.contentDocument) return;
  var doc = iframe.contentDocument;
  // Remove edit UI before capturing
  var hint = doc.querySelector('._cad-edit-hint');
  if (hint) hint.style.display = 'none';
  // Capture full body HTML
  var newHtml = doc.body.innerHTML;
  // Remove edit artifacts
  newHtml = newHtml.replace(/ contenteditable="true"/g, '');
  newHtml = newHtml.replace(/ data-cad-original="[^"]*"/g, '');
  newHtml = newHtml.replace(/<style id="_cadEditStyles">[\s\S]*?<\/style>/g, '');
  newHtml = newHtml.replace(/<div class="_cad-edit-hint"[^>]*>[\s\S]*?<\/div>/g, '');
  if (hint) hint.style.display = '';
  // Update source_html
  if (_selectedForm) {
    _selectedForm.source_html = newHtml;
    _formMarkDirty();
  }
}

function _formSyncFieldToHtml(fieldId, key, value, field) {
  if (!_selectedForm?.source_html) return;
  var parser = new DOMParser();
  var doc = parser.parseFromString(_selectedForm.source_html, 'text/html');

  // Find the element by data-field-id
  var el = doc.querySelector('[data-field-id="' + fieldId + '"]');
  if (!el) return;

  if (key === 'label') {
    // Update data-label attribute
    el.setAttribute('data-label', value);
    // Find sibling or parent label element and update its text
    var wrapper = el.closest('.f, [style*="flex-direction:column"], [style*="flex-direction: column"]') || el.parentElement;
    if (wrapper) {
      var labelEl = wrapper.querySelector('label');
      if (labelEl) {
        // Preserve required asterisk if present
        var req = labelEl.querySelector('.req, [style*="color:#E24B4A"], [style*="color: #E24B4A"]');
        var reqHtml = req ? req.outerHTML : (field.required ? ' <span style="color:#E24B4A">*</span>' : '');
        labelEl.innerHTML = _escHtmlSync(value) + reqHtml;
      }
    }
  } else if (key === 'required') {
    el.setAttribute('data-required', value ? 'true' : 'false');
    // Toggle required asterisk in label
    var wrapper2 = el.closest('.f, [style*="flex-direction:column"], [style*="flex-direction: column"]') || el.parentElement;
    if (wrapper2) {
      var labelEl2 = wrapper2.querySelector('label');
      if (labelEl2) {
        var req2 = labelEl2.querySelector('.req, [style*="color:#E24B4A"]');
        if (value && !req2) {
          labelEl2.innerHTML += ' <span style="color:#E24B4A">*</span>';
        } else if (!value && req2) {
          req2.remove();
        }
      }
    }
  }

  // Serialize back to string (body innerHTML only — no html/head wrapper)
  _selectedForm.source_html = doc.body.innerHTML;

  // Refresh iframe
  var iframe = document.getElementById('form-html-preview');
  if (iframe) {
    var cssVars = _formGetCssVars();
    var blob = new Blob([cssVars + _selectedForm.source_html], { type: 'text/html' });
    iframe.src = URL.createObjectURL(blob);
  }
}

function _escHtmlSync(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _formGetCssVars() {
  return '<style>:root{' +
    '--color-background-primary:#ffffff;--color-background-secondary:#f7f8fa;' +
    '--color-background-tertiary:#f0f1f4;--color-background-info:#e8f0fe;' +
    '--color-text-primary:#1a1a2e;--color-text-secondary:#4a5068;' +
    '--color-text-tertiary:#8890a8;--color-text-info:#1a56db;' +
    '--color-border-tertiary:rgba(0,0,0,.1);--color-border-secondary:rgba(0,0,0,.18);' +
    '--color-border-info:#a4cafe;--font-mono:monospace' +
  '}</style>';
}

async function _formRefreshToolbar() {
  if (!_selectedForm) return;
  var f = _selectedForm;
  var lcDiv = document.getElementById('form-lifecycle-btns');
  if (lcDiv) lcDiv.innerHTML = _formLifecycleButtons(f);
  var badge = document.getElementById('form-state-badge');
  if (badge) { badge.textContent = _formStateLabel(f.state||'draft'); badge.style.color = _formStateColor(f.state||'draft'); }
  var verEl = document.getElementById('form-version-display');
  if (verEl) verEl.textContent = (f.version||'0.1.0') + (_formDirty?'*':'');
  var saveEl = document.getElementById('form-save-indicator');
  if (saveEl) { saveEl.textContent = _formDirty ? '● Unsaved' : '● Saved'; saveEl.style.color = _formDirty ? 'var(--amber)' : 'var(--green)'; }
  var catPill = document.getElementById('form-category-pill');
  if (catPill) catPill.innerHTML = _formCategoryPill(f);
  var listEl = document.getElementById('form-list');
  if (listEl) listEl.innerHTML = _renderFormList();
}

function _formAutoAddStageForRole(role) {
  if (!_formRouting) _formRouting = { mode: 'serial', roles: [], stages: [] };
  if (!_formRouting.stages) _formRouting.stages = [];
  if (!_formRouting.roles) _formRouting.roles = [];

  // Skip submitter/assignee — those are implicit
  const skipRoles = ['assignee', 'submitter'];
  if (skipRoles.includes(role)) return;

  // Already in stages?
  if (_formRouting.stages.find(function(s){ return s.role === role; })) return;

  // Add as new stage
  const maxStage = Math.max(0, ..._formRouting.stages.map(function(s){ return s.stage || 0; }));
  _formRouting.stages.push({ stage: maxStage + 1, role: role, parallel_within_stage: false, requires_all: true });

  // Also add to roles array for routing panel
  if (!_formRouting.roles.find(function(r){ return r.role === role; })) {
    const maxOrder = Math.max(0, ..._formRouting.roles.map(function(r){ return r.order || 0; }));
    _formRouting.roles.push({ role: role, order: maxOrder + 1 });
  }
  _formMarkDirty();
}

function _formToggleRequired(fieldId) {
  const field = _formFields.find(f => f.id === fieldId);
  if (!field) return;
  field.required = !field.required;
  const toggle = document.getElementById('fedit-req-toggle');
  if (toggle) toggle.className = 'toggle-box' + (field.required ? ' on' : '');
  _reRenderMatrix();
}

function _formRemoveField(fieldId) {
  _undoPush();
  _formFields = _formFields.filter(f => f.id !== fieldId);
  _reRenderMatrix();
  _reRenderRoutingPanel();
  _renderFieldOverlays();
  document.getElementById('field-edit-popover')?.remove();
}


// ─────────────────────────────────────────────────────────────────────────────
// UNDO STACK (in-memory, Ctrl-Z, max 50 snapshots)
// ─────────────────────────────────────────────────────────────────────────────

const _undoStack = [];   // array of JSON snapshots of _formFields
const UNDO_MAX   = 50;

function _undoPush() {
  _undoStack.push(JSON.stringify(_formFields));
  if (_undoStack.length > UNDO_MAX) _undoStack.shift();
}

function _undoPop() {
  if (!_undoStack.length) { cadToast('Nothing to undo', 'info'); return; }
  _formFields = JSON.parse(_undoStack.pop());
  _selectedFieldIds.clear();
  _formMarkDirty();
  _formUpdateSelectionUI();
  _renderFieldOverlays();
  _reRenderMatrix();
  _updateHWWidget();
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG OVERLAY — field rectangles on the canvas
// ─────────────────────────────────────────────────────────────────────────────

// [original _renderFieldOverlays removed — enhanced version below is the sole definition]

function _highlightFieldRect(fieldId) {
  // Selection highlight is now driven entirely by _renderFieldOverlays via _selectedFieldIds.
  // This function is retained for call-site compatibility but rendering is handled centrally.
  if (fieldId && !_selectedFieldIds.has(fieldId)) {
    _selectedFieldIds.add(fieldId);
    _renderFieldOverlays();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL DRAW — click-drag to add field rectangle
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// MODE TOGGLE
// ─────────────────────────────────────────────────────────────────────────────

function _formSetMode(mode) {
  _formMode = mode;
  const svg = document.getElementById('form-field-overlay');
  if (svg) svg.style.cursor = (mode === 'draw') ? 'crosshair' : 'default';
  _formRefreshRailMode(mode);
}

// Keyboard shortcut: S = select, D = draw
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (!document.getElementById('form-field-overlay')) return; // Forms tab not active
  if (e.key === 's' || e.key === 'S') _formSetMode('select');
  if (e.key === 'd' || e.key === 'D') _formSetMode('draw');
});

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED SVG INTERACTION — select / drag-to-move / draw
// ─────────────────────────────────────────────────────────────────────────────

let _svgDragField  = null; // field being moved
let _svgDragStartX = 0;
let _svgDragStartY = 0;
let _svgDragOrigX  = 0;
let _svgDragOrigY  = 0;

// ─────────────────────────────────────────────────────────────────────────────
// SVG INTERACTION — draw mode + select/drag/copy with modifier keys
//
// Modifier key behaviour during drag:
//   (none)         — move selected group
//   Shift          — constrain to horizontal OR vertical axis
//   Ctrl/Cmd       — copy selected fields to new position
//   Ctrl+Shift     — copy AND constrain to axis
// ─────────────────────────────────────────────────────────────────────────────

// Drag state
let _svgGroupDrag = null;
// {
//   fields:   [{field, origX, origY}],  — fields being dragged
//   startX, startY,                     — mouse position at drag start (SVG px)
//   isCopy:   bool,                     — Ctrl held at mousedown
//   axisLock: null | 'h' | 'v',         — determined on first move > threshold
//   threshold: 8,                       — px before axis is locked
// }

function _formSvgMouseDown(event) {
  const svg     = document.getElementById('form-field-overlay');
  if (!svg) return;
  const svgRect = svg.getBoundingClientRect();
  const mx = event.clientX - svgRect.left;
  const my = event.clientY - svgRect.top;

  // ── Draw mode ─────────────────────────────────────────────────────────────
  if (_formMode === 'draw') {
    _drawingRect = { active: true, startX: mx, startY: my };
    const preview = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    preview.id = 'form-draw-preview-rect';
    preview.setAttribute('x', mx); preview.setAttribute('y', my);
    preview.setAttribute('width', 0); preview.setAttribute('height', 0);
    preview.setAttribute('fill', 'var(--cad-dim)');
    preview.setAttribute('stroke', 'var(--cad)');
    preview.setAttribute('stroke-width', '1.5');
    preview.setAttribute('stroke-dasharray', '4 2');
    preview.setAttribute('rx', '2');
    preview.style.pointerEvents = 'none';
    svg.appendChild(preview);
    event.preventDefault();
    return;
  }

  // ── Select mode: hit-test field rects ────────────────────────────────────
  const group = event.target.closest('.field-rect-group');
  if (!group) return;

  const fieldId   = group.dataset.fieldId;
  const hitField  = _formFields.find(f => f.id === fieldId);
  if (!hitField) return;

  // Ctrl/Cmd = copy-drag; Shift = additive select; plain click = sole selection
  const isCopy     = event.ctrlKey || event.metaKey;
  const isAdditive = event.shiftKey;

  if (!_selectedFieldIds.has(fieldId)) {
    if (!isAdditive && !isCopy) _selectedFieldIds.clear();
    _selectedFieldIds.add(fieldId);
    _formUpdateSelectionUI();
  }

  // Build the drag group: all currently selected fields on this page
  const dragFields = [..._selectedFieldIds]
    .map(id => _formFields.find(f => f.id === id))
    .filter(f => f && (f.page || 1) === _pdfPage)
    .map(f => ({ field: f, origX: f.rect.x, origY: f.rect.y }));

  _svgGroupDrag = {
    fields:      dragFields,
    startX:      mx,
    startY:      my,
    isCopy:      isCopy,
    axisLock:    null,   // 'h' | 'v' — set once Shift held + dist > 8px
    axisChosen:  false,  // once chosen stays until mouseup even if Shift released
    hasMoved:    false,
  };

  svg.style.cursor = isCopy ? 'copy' : 'grabbing';
  // Attach drag tracking to document so cursor can leave SVG/canvas without losing drag
  document.addEventListener('mousemove', _formDragMouseMove);
  document.addEventListener('mouseup',   _formDragMouseUp, { once: true });
  event.preventDefault();
}

// Document-level drag move (tracks outside SVG bounds)
function _formDragMouseMove(event) {
  if (!_svgGroupDrag) return;
  const svg = document.getElementById('form-field-overlay');
  if (!svg) return;
  const svgRect = svg.getBoundingClientRect();
  const mx = event.clientX - svgRect.left;
  const my = event.clientY - svgRect.top;
  // Reuse original mousemove logic inline
  let dx = mx - _svgGroupDrag.startX;
  let dy = my - _svgGroupDrag.startY;
  const dist = Math.sqrt(dx*dx + dy*dy);
  _svgGroupDrag.hasMoved = dist > 3;
  if (_svgGroupDrag.hasMoved) _formMarkDirty();
  if (event.shiftKey) {
    if (!_svgGroupDrag.axisChosen && dist > 8) {
      _svgGroupDrag.axisLock   = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
      _svgGroupDrag.axisChosen = true;
    }
  } else {
    _svgGroupDrag.axisLock   = null;
    _svgGroupDrag.axisChosen = false;
  }
  if (_svgGroupDrag.axisLock === 'h') dy = 0;
  if (_svgGroupDrag.axisLock === 'v') dx = 0;
  _svgGroupDrag.fields.forEach(({ field, origX, origY }) => {
    field.rect.x = origX + dx / _pdfScale;
    field.rect.y = origY + dy / _pdfScale;
  });
  // Update isCopy live — Ctrl may be pressed/released after mousedown
  _svgGroupDrag.isCopy = event.ctrlKey || event.metaKey;
  svg.style.cursor = _svgGroupDrag.isCopy ? 'copy' : 'grabbing';
  _renderFieldOverlays();
}

// Document-level drag mouseup
function _formDragMouseUp(event) {
  document.removeEventListener('mousemove', _formDragMouseMove);
  if (_svgGroupDrag) {
    // Synthesise a mouseup on the SVG to run commit logic
    _formSvgMouseUp(event);
  }
}

function _formSvgMouseMove(event) {
  const svg = document.getElementById('form-field-overlay');
  if (!svg) return;
  const svgRect = svg.getBoundingClientRect();
  const mx = event.clientX - svgRect.left;
  const my = event.clientY - svgRect.top;

  // ── Draw preview ──────────────────────────────────────────────────────────
  if (_formMode === 'draw' && _drawingRect?.active) {
    const preview = document.getElementById('form-draw-preview-rect');
    if (!preview) return;
    const x = Math.min(mx, _drawingRect.startX);
    const y = Math.min(my, _drawingRect.startY);
    const w = Math.abs(mx - _drawingRect.startX);
    const h = Math.abs(my - _drawingRect.startY);
    preview.setAttribute('x', x); preview.setAttribute('y', y);
    preview.setAttribute('width', w); preview.setAttribute('height', h);
    return;
  }

  // ── Group drag ────────────────────────────────────────────────────────────
  if (!_svgGroupDrag) return;

  let dx = mx - _svgGroupDrag.startX;
  let dy = my - _svgGroupDrag.startY;
  const dist = Math.sqrt(dx*dx + dy*dy);

  _svgGroupDrag.hasMoved = dist > 3;

  // Axis lock: Shift held + dist > 8px locks axis; releasing Shift unlocks (freeform)
  if (event.shiftKey) {
    if (!_svgGroupDrag.axisChosen && dist > 8) {
      _svgGroupDrag.axisLock   = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
      _svgGroupDrag.axisChosen = true;
    }
  } else {
    // Shift released — drop lock so drag is freeform from current position
    _svgGroupDrag.axisLock   = null;
    _svgGroupDrag.axisChosen = false;
  }

  if (_svgGroupDrag.axisLock === 'h') dy = 0;
  if (_svgGroupDrag.axisLock === 'v') dx = 0;

  // Move all fields in group
  _svgGroupDrag.fields.forEach(({ field, origX, origY }) => {
    field.rect.x = origX + dx / _pdfScale;
    field.rect.y = origY + dy / _pdfScale;
  });

  // Update cursor to reflect current modifier state
  svg.style.cursor = (event.ctrlKey || event.metaKey) ? 'copy' : 'grabbing';

  _renderFieldOverlays();
}

function _formSvgMouseUp(event) {
  const svg = document.getElementById('form-field-overlay');
  if (!svg) return;
  // Use canvas-wrap offset for coordinate calc (SVG overflow:hidden can clip getBCR)
  const wrap = document.getElementById('form-canvas-wrap');
  const ref  = wrap || svg;
  const refRect = ref.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  const mx = event.clientX - svgRect.left;
  const my = event.clientY - svgRect.top;

  // ── Draw mode commit ──────────────────────────────────────────────────────
  if (_formMode === 'draw' && _drawingRect?.active) {
    document.getElementById('form-draw-preview-rect')?.remove();
    const w = Math.abs(mx - _drawingRect.startX);
    const h = Math.abs(my - _drawingRect.startY);

    if (w > 12 && h > 8) {
      const x       = Math.min(mx, _drawingRect.startX) / _pdfScale;
      const y       = Math.min(my, _drawingRect.startY) / _pdfScale;
      _undoPush(); _formMarkDirty();
      const fieldId = 'manual_' + Date.now();
      _formFields.push({
        id: fieldId, page: _pdfPage,
        rect: { x, y, w: w / _pdfScale, h: h / _pdfScale },
        label: '', type: 'text', role: 'assignee',
        required: false, detection: 'manual',
      });
      _renderFieldOverlays();
      _reRenderMatrix();
      _reRenderRoutingPanel();
      setTimeout(() => _formSelectField(fieldId), 50);
    }
    _drawingRect = null;
    return;
  }

  // ── Group drag commit ─────────────────────────────────────────────────────
  if (_svgGroupDrag) {
    const drag   = _svgGroupDrag;
    // isCopy is kept live in drag.isCopy by _formDragMouseMove
    const isCopy = drag.isCopy;
    svg.style.cursor = _formMode === 'draw' ? 'crosshair' : 'default';

    if (drag.hasMoved) {
      _undoPush(); // push before any mutation (move or copy)
      if (isCopy) {
        // COPY: snap originals back, create new fields at the dragged position
        const newIds = [];
        drag.fields.forEach(({ field, origX, origY }) => {
          // Capture dragged position BEFORE snapping original back
          const draggedX = field.rect.x;
          const draggedY = field.rect.y;
          // Snap original back to start
          field.rect.x = origX;
          field.rect.y = origY;
          // Deep-clone AFTER snap so copy gets the dragged position
          const newId = 'copy_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
          const copyField = JSON.parse(JSON.stringify(field));
          copyField.id        = newId;
          copyField.detection = 'manual';
          copyField.label     = field.label ? field.label + ' (copy)' : '';
          copyField.rect.x    = draggedX;
          copyField.rect.y    = draggedY;
          _formFields.push(copyField);
          newIds.push(newId);
        });
        _selectedFieldIds.clear();
        newIds.forEach(id => _selectedFieldIds.add(id));
        _formUpdateSelectionUI();
        cadToast(`Copied ${newIds.length} field(s)`, 'info');
      }
      // Move case: positions already updated live during mousemove — nothing extra needed

      _renderFieldOverlays();
      _reRenderMatrix();
    } else {
      // No movement — single click = select, double-click = open popover
      const group = event.target.closest('.field-rect-group');
      if (group) {
        const fid = group.dataset.fieldId;
        const now = Date.now();
        const isDouble = (now - (_lastFieldClick||0)) < 350 && _lastFieldClickId === fid;
        _lastFieldClick = now; _lastFieldClickId = fid;
        if (isDouble) {
          // Double-click: open edit popover
          _formSelectField(fid);
        } else {
          // Single click: toggle selection
          if (_svgGroupDrag?.isCopy || event.shiftKey) {
            _selectedFieldIds.has(fid) ? _selectedFieldIds.delete(fid) : _selectedFieldIds.add(fid);
          } else {
            _selectedFieldIds.clear();
            _selectedFieldIds.add(fid);
          }
          _formUpdateSelectionUI();
          _renderFieldOverlays();
        }
      }
    }

    _svgGroupDrag = null;
    return;
  }
}



// ─────────────────────────────────────────────────────────────────────────────
// FIELD RECT HIGHLIGHT
// ─────────────────────────────────────────────────────────────────────────────

// [original _highlightFieldRect removed — see updated version below]

// ─────────────────────────────────────────────────────────────────────────────
// PAGE NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

function _formPrevPage() {
  if (_formPreviewMode) { document.querySelectorAll('.form-preview-input-wrap').forEach(el=>el.remove()); document.getElementById('form-preview-stagebar')?.remove(); }
  if (_pdfPage <= 1) return;
  _pdfPage--;
  _updatePageIndicator();
  _renderPdfPage(_pdfStartPage + _pdfPage - 1);
}

function _formNextPage() {
  if (_formPreviewMode) { document.querySelectorAll('.form-preview-input-wrap').forEach(el=>el.remove()); }
  if (_pdfPage >= _pdfTotalPages) return;
  _pdfPage++;
  _updatePageIndicator();
  _renderPdfPage(_pdfStartPage + _pdfPage - 1);
}

function _updatePageIndicator() {
  const el   = document.getElementById('form-page-indicator');
  const prev = document.getElementById('form-page-prev');
  const next = document.getElementById('form-page-next');
  if (el)   el.textContent    = `${_pdfPage} / ${_pdfTotalPages}`;
  if (prev) prev.disabled     = (_pdfPage <= 1);
  if (next) next.disabled     = (_pdfPage >= _pdfTotalPages);
  if (prev) prev.style.opacity = (_pdfPage <= 1)              ? '0.3' : '';
  if (next) next.style.opacity = (_pdfPage >= _pdfTotalPages) ? '0.3' : '';
}

function _formZoomIn()    { _formSetZoom(Math.min(4.0, _pdfScale * 1.25)); }
function _formZoomOut()   { _formSetZoom(Math.max(0.3, _pdfScale * 0.8));  }
function _formZoomReset() { _formSetZoom(1.5); }

function _formZoomFit() {
  const wrap = document.getElementById('form-canvas-wrap');
  const canvas = document.getElementById('form-pdf-canvas');
  if (!wrap || !canvas) return;
  // Target: canvas fills wrap width minus padding
  const availW = wrap.clientWidth - 48;
  if (!_pdfDoc) return;
  _pdfDoc.getPage(_pdfStartPage + _pdfPage - 1).then(page => {
    const vp = page.getViewport({ scale: 1, rotation: (page.rotate||0) === 180 ? 0 : (page.rotate||0) });
    const fitScale = availW / vp.width;
    _formSetZoom(Math.max(0.3, Math.min(4.0, fitScale)));
  });
}

function _formSetZoom(newScale) {
  const wrap = document.getElementById('form-canvas-wrap');
  // Preserve relative scroll position through zoom
  let scrollRatioY = 0, scrollRatioX = 0;
  if (wrap) {
    scrollRatioY = wrap.scrollTop  / Math.max(1, wrap.scrollHeight);
    scrollRatioX = wrap.scrollLeft / Math.max(1, wrap.scrollWidth);
  }
  _pdfScale = newScale;
  _renderPdfPage(_pdfStartPage + _pdfPage - 1).then(() => {
    if (wrap) {
      wrap.scrollTop  = scrollRatioY * wrap.scrollHeight;
      wrap.scrollLeft = scrollRatioX * wrap.scrollWidth;
    }
  });
  // Update label
  const lbl = document.getElementById('form-zoom-label');
  if (lbl) lbl.textContent = Math.round(newScale / 1.5 * 100) + '%';
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF.js LOADER + PAGE RENDERER
// ─────────────────────────────────────────────────────────────────────────────

async function _ensurePdfJs() {
  if (window.pdfjsLib) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      res();
    };
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

async function _renderPdfPage(pageNum) {
  if (!_pdfDoc) return;
  try {
    const page = await _pdfDoc.getPage(pageNum);
    // Normalise rotation: 180° scans render right-way-up at 0°; honour 90/270 as-is
    const naturalRotation = page.rotate || 0;
    const rotation = (naturalRotation === 180) ? 0 : naturalRotation;
    const vp      = page.getViewport({ scale: _pdfScale, rotation });
    const canvas  = document.getElementById('form-pdf-canvas');
    const overlay = document.getElementById('form-field-overlay');
    if (!canvas) return;
    canvas.width  = vp.width;
    canvas.height = vp.height;
    canvas.style.width  = vp.width  + 'px';
    canvas.style.height = vp.height + 'px';
    if (overlay) {
      overlay.setAttribute('width',  vp.width  + 'px');
      overlay.setAttribute('height', vp.height + 'px');
      overlay.style.width  = vp.width  + 'px';
      overlay.style.height = vp.height + 'px';
    }
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    _renderFieldOverlays();
  } catch(e) {
    cadToast('Page render failed: ' + e.message, 'error');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COLUMN DRAG-TO-RESIZE
// ─────────────────────────────────────────────────────────────────────────────

function _formColDragStart(event, colId, direction) {
  const col = document.getElementById(colId);
  if (!col) return;
  window._formDragCol    = colId;
  window._formDragDir    = direction || 'left'; // 'left' = handle on left edge; 'right' = right edge
  window._formDragStartX = event.clientX;
  window._formDragStartW = col.offsetWidth;
  document.body.style.cursor     = 'col-resize';
  document.body.style.userSelect = 'none';
  event.preventDefault();
}

document.addEventListener('mousemove', e => {
  if (!window._formDragCol) return;
  const col = document.getElementById(window._formDragCol);
  if (!col) return;
  // 'left' handle: drag right → smaller; 'right' handle: drag right → wider
  const delta  = window._formDragDir === 'right'
    ? e.clientX - window._formDragStartX
    : window._formDragStartX - e.clientX;
  const minW   = parseInt(col.style.minWidth) || 140;
  const maxW   = parseInt(col.style.maxWidth) || 480;
  const newW   = Math.max(minW, Math.min(maxW, window._formDragStartW + delta));
  col.style.width      = newW + 'px';
  col.style.transition = 'none';
});

document.addEventListener('mouseup', () => {
  if (!window._formDragCol) return;
  const col = document.getElementById(window._formDragCol);
  if (col) col.style.transition = '';
  document.body.style.cursor     = '';
  document.body.style.userSelect = '';
  window._formDragCol = null;
});

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT PROGRESS UI
// ─────────────────────────────────────────────────────────────────────────────

function _importProgressShow(filename, totalPages) {
  const main = document.getElementById('form-editor-main');
  if (!main) return;
  main.innerHTML = `
    <div id="import-progress-wrap"
      style="flex:1;display:flex;flex-direction:column;align-items:center;
             justify-content:center;gap:20px;padding:48px;background:var(--bg1)">
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
        <div style="font-size:36px;opacity:.5">📄</div>
        <div style="font-size:13px;font-weight:500;color:var(--text);
                    max-width:360px;text-align:center;overflow:hidden;
                    text-overflow:ellipsis;white-space:nowrap">
          ${escHtml(filename)}
        </div>
        <div style="font-size:12px;color:var(--muted)">${totalPages} page${totalPages !== 1 ? 's' : ''}</div>
      </div>
      <div style="width:min(420px,80%);display:flex;flex-direction:column;gap:8px">
        <div style="height:4px;background:var(--surf3);border-radius:2px;overflow:hidden">
          <div id="import-progress-bar"
            style="height:100%;width:0%;background:var(--cad);border-radius:2px;
                   transition:width .35s cubic-bezier(.4,0,.2,1)"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div id="import-progress-stage" style="font-size:12px;color:var(--muted);font-family:Arial,sans-serif">Initialising…</div>
          <div id="import-progress-pct"   style="font-size:12px;color:var(--cad);font-family:Arial,sans-serif;font-weight:600">0%</div>
        </div>
      </div>
      <div id="import-page-dots" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:360px;min-height:20px">
        ${Array.from({length: totalPages}, (_, i) =>
          `<div id="import-dot-${i+1}" style="width:10px;height:10px;border-radius:50%;background:var(--surf3);transition:background .2s" title="Page ${i+1}"></div>`
        ).join('')}
      </div>
      <div id="import-progress-detail" style="font-size:12px;color:var(--muted);text-align:center;min-height:16px;font-family:Arial,sans-serif"></div>
    </div>`;
}

function _importProgressUpdate(pct, stage, detail) {
  const bar   = document.getElementById('import-progress-bar');
  const stEl  = document.getElementById('import-progress-stage');
  const pctEl = document.getElementById('import-progress-pct');
  const detEl = document.getElementById('import-progress-detail');
  if (bar)   bar.style.width   = Math.round(pct) + '%';
  if (stEl)  stEl.textContent  = stage  || '';
  if (pctEl) pctEl.textContent = Math.round(pct) + '%';
  if (detEl) detEl.textContent = detail || '';
}

function _importProgressDot(pageNum, state) {
  const dot = document.getElementById(`import-dot-${pageNum}`);
  if (!dot) return;
  const colors = { pending:'var(--surf3)', active:'var(--cad)', done:'var(--green)', ai:'var(--amber)' };
  dot.style.background = colors[state] || colors.pending;
  dot.style.boxShadow  = state === 'active' ? '0 0 0 2px var(--cad-dim)' : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD DETECTION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function _classifyFormArchetype(textItems) {
  let shortUnderscoreLines = 0, totalLines = 0, longUnderscoreLines = 0;
  textItems.forEach(item => {
    const s = (item.str || '').trim();
    if (!s) return;
    totalLines++;
    if (/^_{1,8}\s+\d+\./.test(s)) shortUnderscoreLines++;
    if (/_{6,}/.test(s)) longUnderscoreLines++;
  });
  if (totalLines === 0) return 'data_entry';
  return (shortUnderscoreLines / totalLines) > 0.15 ? 'checklist' : 'data_entry';
}

function _isDocControlRegion(item, pageHeight) {
  const [, , , , tx, ty] = item.transform;
  const y = pageHeight - ty;
  if (y > pageHeight * 0.18) return false;
  const s = (item.str || '').trim();
  return /^(type|document\s+number|title|prepared\s+by|original\s+date|revised\s+by|revision\s+date|revision|page)\s*:?$/i.test(s);
}

function _detectTextHeuristicsV2(textContent, page, pageNum, startIdx, archetype) {
  const found = [];
  const items = textContent.items;
  const vp    = page.getViewport({ scale: 1 });
  const h     = vp.height;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const s    = (item.str || '').trim();
    if (!s) continue;
    if (_isDocControlRegion(item, h)) continue;
    const [, , , , tx, ty] = item.transform;
    const x = tx, y = h - ty;

    if (archetype === 'checklist') {
      if (/^_{1,8}$/.test(s) || s === '') {
        const nextItem = items[i + 1];
        const nextStr  = (nextItem?.str || '').trim();
        if (/^\d+\./.test(nextStr) || /^[A-Z]\s+\w/.test(nextStr)) {
          const label = nextStr.replace(/^\d+\.\s*/, '').slice(0, 80);
          found.push({ id:`heur_${pageNum}_${startIdx+found.length}`, page:pageNum,
            rect:{x, y:y-12, w:32, h:14}, label, type:'review', role:'assignee',
            required:false, detection:'heuristic:checklist_item' });
        }
      }
    }

    if (archetype === 'data_entry') {
      const colonMatch = s.match(/^(.+?):\s*_{4,}/);
      if (colonMatch) {
        const label    = colonMatch[1].trim();
        const underLen = (s.match(/_{4,}/)?.[0] || '').length;
        found.push({ id:`heur_${pageNum}_${startIdx+found.length}`, page:pageNum,
          rect:{x:x+label.length*6, y:y-12, w:Math.max(80,underLen*5), h:16},
          label, type:/date|dated|as of/i.test(label)?'date':/quantity|qty|amount/i.test(label)?'number':'text',
          role:/approv|authoriz/i.test(label)?'approver':/sign|review/i.test(label)?'reviewer':'assignee',
          required:false, detection:'heuristic:colon_underscore' });
      }
      if (/^rev\.?\s*$/i.test(s)) {
        const prevLabel = items.slice(Math.max(0,i-3),i).map(it=>it.str).join(' ').trim();
        if (prevLabel) {
          found.push({ id:`heur_${pageNum}_${startIdx+found.length}`, page:pageNum,
            rect:{x:x+28, y:y-12, w:40, h:16}, label:prevLabel+' Rev', type:'text',
            role:'assignee', required:false, detection:'heuristic:rev_field', _isPaired:true });
        }
      }
    }

    if (/[☐☑□■◻◼▢]/.test(s)) {
      const nextStr = (items[i+1]?.str||'').trim().slice(0,60);
      found.push({ id:`heur_${pageNum}_${startIdx+found.length}`, page:pageNum,
        rect:{x, y:y-10, w:14, h:14}, label:nextStr||'Checkbox', type:'checkbox',
        role:'assignee', required:false, detection:'heuristic:checkbox_glyph' });
    }

    if (/^(signature|sign here|authorized by|approved by|reviewed by|built by)/i.test(s)) {
      found.push({ id:`heur_${pageNum}_${startIdx+found.length}`, page:pageNum,
        rect:{x, y:y+2, w:180, h:24}, label:s, type:'signature',
        role:/approv|authoriz/i.test(s)?'pm':/review/i.test(s)?'reviewer':'assignee',
        required:true, detection:'heuristic:signature_keyword' });
    }
  }
  return found.filter(f => f.type !== '_section_header');
}

async function _detectMultiInstance(pdfDoc) {
  if (pdfDoc.numPages < 2) return null;
  const fingerprints = [];
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p);
    const tc   = await page.getTextContent();
    const sig  = tc.items.map(i=>(i.str||'').trim()).filter(s=>s.length>3).sort().join('|').slice(0,300);
    fingerprints.push(sig);
  }
  function similarity(a,b) {
    if (!a||!b) return 0;
    const A=new Set(a.split('|')), B=new Set(b.split('|'));
    return [...A].filter(w=>B.has(w)).length / Math.max(A.size,B.size);
  }
  const first = fingerprints[0], duplicates = [];
  for (let i=1; i<fingerprints.length; i++) {
    if (similarity(first, fingerprints[i]) >= 0.7) duplicates.push(i+1);
  }
  if (!duplicates.length) return null;
  const templatePageCount = duplicates[0] - 1;
  return { detected:true, templatePageCount, instanceCount:Math.floor(pdfDoc.numPages/templatePageCount), instanceStartPages:[1,...duplicates] };
}

function _showMultiInstancePrompt(info) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '500';
  overlay.innerHTML = `
    <div class="modal" style="max-width:440px">
      <div class="modal-header"><div class="modal-title">📄 Multiple instances detected</div></div>
      <div class="modal-body" style="font-size:13px;line-height:1.7;color:var(--text2)">
        This PDF appears to contain the same <strong style="color:var(--text)">${info.templatePageCount}-page form</strong>
        completed <strong style="color:var(--text)">${info.instanceCount} times</strong>.
        <div style="margin-top:14px;font-size:12px;color:var(--muted)">How would you like to import it?</div>
      </div>
      <div class="modal-footer" style="flex-direction:column;gap:8px;align-items:stretch">
        <button class="btn btn-solid" onclick="_multiInstanceImport('template',${JSON.stringify(info).replace(/"/g,'&quot;')})" style="justify-content:center">
          Import blank template only (${info.templatePageCount} pages)
        </button>
        <button class="btn btn-ghost" onclick="_multiInstanceImport('template_and_history',${JSON.stringify(info).replace(/"/g,'&quot;')})" style="justify-content:center">
          Import template + ${info.instanceCount} historical instances
        </button>
        <button class="btn btn-ghost" style="color:var(--muted);justify-content:center"
          onclick="document.querySelector('.modal-overlay').remove();_proceedWithImport(1,_pdfTotalPages)">
          Import all ${info.instanceCount * info.templatePageCount} pages as one document
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function _multiInstanceImport(mode, info) {
  document.querySelector('.modal-overlay')?.remove();
  await _proceedWithImport(1, info.templatePageCount);
  if (mode === 'template_and_history') {
    cadToast(`Template imported (${info.templatePageCount} pages). Historical instance import coming in next release.`, 'info');
  }
}

async function _detectFieldsViaClaudeVision(pdfDoc, pageNum) {
  try {
    const page   = await pdfDoc.getPage(pageNum);
    const vp     = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext:canvas.getContext('2d'), viewport:vp }).promise;
    const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

    const prompt = `You are analyzing a scanned form document. Extract all form fields.
For each field identify:
- label: the text label
- type: one of: text, date, number, checkbox, signature, review, textarea
  (use "review" for checklist items with a blank/underscore for pass/fail/N/A)
- x_pct, y_pct: position as 0-100% of page width/height
- width_pct: width as % of page width
- is_section_header: true if bold section heading, not fillable

Do NOT include document control metadata. Return ONLY a JSON array, no explanation.`;

    const response = await fetch(`${SUPA_URL}/functions/v1/ai-form-vision`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${SUPA_KEY}`, 'apikey':SUPA_KEY },
      body: JSON.stringify({ base64, prompt, media_type:'image/jpeg' }),
    });

    if (!response.ok) {
      if (response.status === 401) { console.warn('[FormEditor] ai-form-vision 401 — redeploy with --no-verify-jwt'); return []; }
      if (response.status === 404) { console.warn('[FormEditor] ai-form-vision not deployed'); return []; }
      throw new Error(`Vision API ${response.status}`);
    }
    const data = await response.json();
    const raw  = data.text || data.content?.map(c=>c.text||'').join('') || '[]';
    const aiFields = JSON.parse(raw.replace(/```json|```/g,'').trim());
    if (!Array.isArray(aiFields)) return [];

    const pdfVp = page.getViewport({ scale:1 });
    return aiFields.filter(f=>!f.is_section_header).map((f,i) => ({
      id:`ai_${pageNum}_${i}`, page:pageNum,
      rect:{ x:(f.x_pct/100)*pdfVp.width, y:(f.y_pct/100)*pdfVp.height,
             w:(f.width_pct/100)*pdfVp.width||120, h:f.type==='signature'?28:f.type==='textarea'?40:16 },
      label:f.label||'Field', type:f.type||'text',
      role:/approv|authoriz/i.test(f.label)?'approver':/sign|review/i.test(f.label)?'reviewer':/pm|manager/i.test(f.label)?'pm':'assignee',
      required:f.type==='signature', detection:'claude_vision', confidence:'ai',
    }));
  } catch(e) {
    console.warn('[FormEditor] Claude vision pass failed:', e.message);
    return [];
  }
}

function _checkAndPromptSignature(fields) {
  if (fields.some(f => f.type === 'signature')) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;bottom:80px;right:24px;z-index:300;
    background:var(--bg2);border:1px solid var(--border2);border-radius:8px;
    padding:14px 16px;max-width:320px;box-shadow:0 8px 32px rgba(0,0,0,.6)`;
  overlay.innerHTML = `
    <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px">No approval signature detected</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:12px;line-height:1.6">
      This form has no formal sign-off field. Add an approval stage with a digital signature?
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-solid btn-sm" style="flex:1;font-size:12px"
        onclick="_addApprovalSignatureField();this.closest('[style]').remove()">Yes, add sign-off</button>
      <button class="btn btn-ghost btn-sm" style="flex:1;font-size:12px;color:var(--muted)"
        onclick="this.closest('[style]').remove()">No thanks</button>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 12000);
}

function _addApprovalSignatureField() {
  if (!_selectedForm) return;
  const sigField = { id:'sig_'+Date.now(), page:_pdfTotalPages,
    rect:{x:60,y:680,w:220,h:28}, label:'Authorized Signature', type:'signature',
    role:'reviewer', required:true, detection:'manual' };
  _formFields.push(sigField);
  if (!_formRouting.stages) _formRouting.stages = [];
  if (!_formRouting.stages.find(s=>s.role==='reviewer')) {
    const maxOrder = Math.max(0,...(_formRouting.stages||[]).map(s=>s.stage||0));
    _formRouting.stages.push({ stage:maxOrder+1, role:'reviewer', parallel_within_stage:true, requires_all:true });
  }
  _reRenderMatrix();
  _reRenderRoutingPanel();
  _renderFieldOverlays();
  cadToast('Approval signature field added', 'success');
}

function _fieldConfidenceColor(field) {
  switch (field.detection) {
    case 'acroform':                       return 'var(--green)';
    case 'claude_vision':                  return 'var(--cad)';
    case 'heuristic:checklist_item':
    case 'heuristic:colon_underscore':
    case 'heuristic:signature_keyword':    return 'var(--amber)';
    case 'manual':                         return 'var(--accent)';
    default:                               return 'var(--muted)';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE-BASED ROUTING PANEL
// ─────────────────────────────────────────────────────────────────────────────

function _renderStageRoutingPanel() {
  // Deprecated — replaced by _renderRoutingPanel. Kept as shim.
  const roles = _deriveRoles(_formFields);
  return _renderRoutingPanel(roles);
}

function _renderStageRow(stage, si, totalStages) {
  const roleConf  = FORM_ROLES[stage.role] || { label:stage.role, color:'var(--muted)', dim:'rgba(255,255,255,.05)' };
  const fieldCount = (_formFields||[]).filter(f=>(f.stage||1)===stage.stage).length;
  const isLast    = si === totalStages - 1;
  return `
    <div id="fstage-${stage.stage}" style="border:1px solid var(--border);border-radius:5px;background:var(--surf2);overflow:hidden">
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--border);background:var(--bg2)">
        <div style="width:18px;height:18px;border-radius:50%;background:${roleConf.dim};border:1px solid ${roleConf.color};
                    display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${roleConf.color};flex-shrink:0">${si+1}</div>
        <select class="config-select" style="flex:1;font-size:12px;padding:3px 6px" onchange="_formUpdateStageRole(${stage.stage},this.value)">
          ${Object.entries(FORM_ROLES).map(([key,conf])=>`<option value="${key}" ${stage.role===key?'selected':''}>${conf.label}</option>`).join('')}
        </select>
        ${totalStages>1?`<button onclick="_formRemoveStage(${stage.stage})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:12px;padding:0;flex-shrink:0">✕</button>`:''}
      </div>
      <div style="padding:8px 10px">
        <div class="config-toggle" onclick="_formToggleStageParallel(${stage.stage})" style="display:flex;align-items:center;gap:7px;cursor:pointer;margin-bottom:6px">
          <div class="toggle-box${stage.parallel_within_stage?' on':''}"></div>
          <span style="font-size:12px;color:var(--text2)">${stage.parallel_within_stage?'All notified at once':'Serial counter-sign'}</span>
        </div>
        <div style="font-size:12px;color:var(--muted)">${fieldCount} field${fieldCount!==1?'s':''} assigned${si>0?` · activates after Stage ${si}`:' · activates on step start'}</div>
      </div>
    </div>
    ${!isLast?`<div style="text-align:center;color:var(--muted);font-size:16px;line-height:1">↓</div>`:''}`;
}

function _migrateToStages() {
  const roles = _deriveRoles(_formFields);
  if (_formRouting.mode === 'parallel') {
    _formRouting.stages = [{ stage:1, role:roles[0]?.role||'assignee', parallel_within_stage:true, requires_all:true }];
  } else {
    const ordered = _formRoutingRolesOrdered(roles);
    _formRouting.stages = ordered.map((r,i) => ({ stage:i+1, role:r.role, parallel_within_stage:false, requires_all:true }));
  }
  return _formRouting.stages;
}

function _formAddStage() {
  const stages = _formRouting.stages || _migrateToStages();
  const nextNum = Math.max(0,...stages.map(s=>s.stage)) + 1;
  const defaultRole = nextNum===2?'reviewer':nextNum===3?'approver':nextNum>=4?'pm':'assignee';
  stages.push({ stage:nextNum, role:defaultRole, parallel_within_stage:true, requires_all:true });
  _formRouting.stages = stages;
  _reRenderRoutingPanel();
}

function _formRemoveStage(stageNum) {
  if (!_formRouting.stages) return;
  _formRouting.stages = _formRouting.stages.filter(s=>s.stage!==stageNum);
  _formRouting.stages.forEach((s,i) => { s.stage = i+1; });
  _reRenderRoutingPanel();
}

function _formUpdateStageRole(stageNum, role) {
  const stage = (_formRouting.stages||[]).find(s=>s.stage===stageNum);
  if (stage) { stage.role = role; _reRenderRoutingPanel(); }
}

function _formToggleStageParallel(stageNum) {
  const stage = (_formRouting.stages||[]).find(s=>s.stage===stageNum);
  if (stage) { stage.parallel_within_stage = !stage.parallel_within_stage; _reRenderRoutingPanel(); }
}

function _reRenderRoutingPanel() {
  _reRenderMatrix();
}

// ─────────────────────────────────────────────────────────────────────────────
// ENHANCED FIELD LIST (with confidence dots + stage badge)
// ─────────────────────────────────────────────────────────────────────────────

// _renderFieldList — sole authoritative definition (SE87: inline controls, no popover)
function _renderFieldList() {
  if (!_formFields.length) {
    return `<div style="padding:16px 14px;font-size:12px;color:var(--muted);line-height:1.8;text-align:center">
              No fields detected yet.<br/>Draw rectangles on the document<br/>to add fields manually.
            </div>`;
  }
  var typeOptions = (FIELD_TYPES_FULL||['text','date','number','checkbox','signature','textarea','review','doc_ref','attendees']).map(function(t){
    var meta = (FIELD_TYPE_META&&FIELD_TYPE_META[t])||{label:t};
    return '<option value="'+t+'">'+escHtml(meta.label||t)+'</option>';
  }).join('');

  var roleOptions = Object.entries(FORM_ROLES).map(function(entry){
    return '<option value="'+entry[0]+'">'+escHtml(entry[1].label)+'</option>';
  }).join('');

  return _formFields.map(function(field) {
    var roleConf  = FORM_ROLES[field.role] || FORM_ROLES.assignee;
    var typeMeta  = (FIELD_TYPE_META&&FIELD_TYPE_META[field.type]) || FIELD_TYPE_META.text;
    var confColor = _fieldConfidenceColor(field);
    var isSelected = _selectedFieldIds.has(field.id);

    var typeOpts = (FIELD_TYPES_FULL||['text','date','number','checkbox','signature','textarea','review','doc_ref','attendees']).map(function(t){
      var meta = (FIELD_TYPE_META&&FIELD_TYPE_META[t])||{label:t};
      return '<option value="'+t+'"'+(field.type===t?' selected':'')+'>'+escHtml(meta.label||t)+'</option>';
    }).join('');

    var roleOpts = Object.entries(FORM_ROLES).map(function(entry){
      return '<option value="'+entry[0]+'"'+(field.role===entry[0]?' selected':'')+'>'+escHtml(entry[1].label)+'</option>';
    }).join('');

    var reqOn = field.required ? ' on' : '';
    var reqColor = field.required ? 'var(--red)' : 'var(--muted)';

    return '<div id="frow-'+field.id+'"'+
      ' style="padding:7px 10px 8px;border-bottom:1px solid var(--border);'+
      'transition:background .1s;'+
      'background:'+(isSelected?'var(--cad-dim)':'transparent')+';'+
      'border-left:3px solid '+(isSelected?'var(--cad)':roleConf.color)+'"'+
      ' onmouseenter="if(!_selectedFieldIds.has(\''+field.id+'\'))this.style.background=\'var(--surf2)\'"'+
      ' onmouseleave="if(!_selectedFieldIds.has(\''+field.id+'\'))this.style.background=\'\'"'+
      ' data-fid="'+field.id+'" data-action="row">'+

      // Row 1: confidence dot + label + remove btn
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">'+
        '<div style="width:5px;height:5px;border-radius:50%;background:'+confColor+';flex-shrink:0" title="Detection: '+(field.detection||'unknown')+'"></div>'+
        '<div data-label-target="1" style="font-size:12px;color:var(--text1);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(field.label||'Unlabelled')+'</div>'+
        '<button data-fid="'+field.id+'" data-action="remove"'+
          ' style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;padding:0;opacity:0;transition:opacity .15s;flex-shrink:0;line-height:1"'+
          ' onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0" title="Remove">✕</button>'+
      '</div>'+

      // Row 2: Type select + Role select + Required toggle — all inline
      '<div style="display:flex;align-items:center;gap:5px" onclick="event.stopPropagation()">'+
        '<select style="font-size:11px;background:var(--surf2);border:1px solid var(--border2);border-radius:3px;color:var(--text2);padding:2px 4px;cursor:pointer;flex:1;min-width:0;font-family:Arial,sans-serif"'+
          ' onchange="_formUpdateField(\''+field.id+'\',\'type\',this.value)"'+
          ' title="Field type">'+typeOpts+'</select>'+
        '<select style="font-size:11px;background:'+roleConf.dim+';border:1px solid var(--border2);border-radius:3px;color:'+roleConf.color+';padding:2px 4px;cursor:pointer;flex:1;min-width:0;font-family:Arial,sans-serif"'+
          ' onchange="_formUpdateField(\''+field.id+'\',\'role\',this.value)"'+
          ' title="Fill role">'+roleOpts+'</select>'+
        '<div data-fid="'+field.id+'" data-action="req"'+
          ' title="Toggle required"'+
          ' style="display:flex;align-items:center;gap:3px;cursor:pointer;flex-shrink:0;padding:2px 4px;border-radius:3px;border:1px solid var(--border2)">'+
          '<div class="toggle-box'+reqOn+'" style="width:22px;height:12px;transform:scale(.9)"></div>'+
          '<span style="font-size:10px;color:'+reqColor+';line-height:1">req</span>'+
        '</div>'+
      '</div>'+

    '</div>';
  }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// ENHANCED FIELD EDIT POPOVER (with stage assignment + full type list)
// ─────────────────────────────────────────────────────────────────────────────

// _formSelectField — sole authoritative definition
function _formSelectField(fieldId) {
  const field = _formFields.find(f => f.id === fieldId);
  if (!field) return;
  document.getElementById('field-edit-popover')?.remove();
  const row = document.getElementById(`frow-${fieldId}`);
  if (!row) return;
  const popover = document.createElement('div');
  popover.id = 'field-edit-popover';
  popover.style.cssText = `position:fixed;z-index:200;background:var(--bg2);border:1px solid var(--border2);border-radius:6px;padding:14px;width:240px;box-shadow:0 8px 32px rgba(0,0,0,.6)`;
  const rect = row.getBoundingClientRect();
  let top = rect.top, left = rect.right + 8;
  if (left + 240 > window.innerWidth) left = rect.left - 248;
  if (top  + 280 > window.innerHeight) top  = window.innerHeight - 290;
  popover.style.top  = Math.max(8,top)  + 'px';
  popover.style.left = Math.max(8,left) + 'px';

  // Pull roles from ProjectHUD global if available, else use built-in FORM_ROLES
  const _liveRoles = (() => {
    const pr = window.FIRM_ROLES || window.projectRoles || window.PROJECT_ROLES;
    if (pr && typeof pr === 'object' && !Array.isArray(pr)) return pr;
    if (Array.isArray(pr)) return Object.fromEntries(pr.map(r => [r.key||r.id||r.name, { label: r.label||r.name||r.key }]));
    return FORM_ROLES;
  })();
  const roleOptions = Object.entries(_liveRoles).map(([key,conf])=>`<option value="${key}" ${field.role===key?'selected':''}>${conf.label||key}</option>`).join('');
  const typeOptions = (FIELD_TYPES_FULL||['text','date','number','checkbox','signature','textarea','review','doc_ref']).map(t=>{
    const meta = FIELD_TYPE_META?.[t]||{label:t};
    return `<option value="${t}" ${field.type===t?'selected':''}>${meta.label||t}</option>`;
  }).join('');
  const stages = _formRouting.stages || [];
  const stageOptions = stages.length > 1
    ? stages.map(s=>`<option value="${s.stage}" ${(field.stage||1)===s.stage?'selected':''}>Stage ${s.stage} — ${FORM_ROLES[s.role]?.label||s.role}</option>`).join('')
    : '';

  const isMulti = _selectedFieldIds.size > 1;
  const multiIds = isMulti ? JSON.stringify([..._selectedFieldIds]) : null;

  // For multi-select: role/type/required changes apply to ALL selected fields
  const onRoleChange  = isMulti
    ? `_formUpdateMulti('role',this.value)`
    : `_formUpdateField('${fieldId}','role',this.value)`;
  const onTypeChange  = isMulti
    ? `_formUpdateMulti('type',this.value)`
    : `_formUpdateField('${fieldId}','type',this.value)`;
  const onStageChange = isMulti
    ? `_formUpdateMulti('stage',parseInt(this.value))`
    : `_formUpdateField('${fieldId}','stage',parseInt(this.value))`;
  const onReqClick    = isMulti
    ? `_formToggleRequiredMulti()`
    : `_formToggleRequired('${fieldId}')`;

  popover.innerHTML = `
    <div style="font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
      ${isMulti ? `Edit ${_selectedFieldIds.size} Fields` : 'Edit Field'}
      <span style="font-size:12px;color:${_fieldConfidenceColor(field)};font-weight:400">${isMulti?'multi':(field.detection||'')}</span>
    </div>
    ${!isMulti?`<div style="margin-bottom:8px"><label class="config-label">Label</label>
      <input class="config-input" value="${escHtml(field.label||'')}" placeholder="Field label" style="font-size:12px" oninput="_formUpdateField('${fieldId}','label',this.value)"/></div>`:''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
      <div><label class="config-label">Type</label>
        <select class="config-select" style="font-size:12px" onchange="${onTypeChange}">${typeOptions}</select></div>
      <div><label class="config-label">Role</label>
        <select class="config-select" style="font-size:12px" onchange="${onRoleChange}">${roleOptions}</select></div>
    </div>
    ${stages.length>1?`<div style="margin-bottom:8px"><label class="config-label">Fill Stage</label>
      <select class="config-select" style="font-size:12px" onchange="${onStageChange}">${stageOptions}</select></div>`:''}
    <div style="margin-bottom:10px">
      <div class="config-toggle" onclick="${onReqClick}" style="display:flex;align-items:center;gap:7px;cursor:pointer">
        <div class="toggle-box${field.required?' on':''}" id="fedit-req-toggle"></div>
        <span style="font-size:12px">Required</span>
      </div>
    </div>
    <button onclick="document.getElementById('field-edit-popover')?.remove()" style="width:100%;font-size:12px;padding:6px 24px;border-radius:999px;background:var(--cad);color:var(--bg);border:none;cursor:pointer;font-family:Arial,sans-serif;font-weight:600">OK</button>`;

  document.body.appendChild(popover);
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!popover.contains(e.target) && !row.contains(e.target)) { popover.remove(); document.removeEventListener('click',close); }
    });
  }, 50);
  _highlightFieldRect(fieldId);
}

// ─────────────────────────────────────────────────────────────────────────────
// ENHANCED FIELD OVERLAYS (confidence-coded + selected state)
// ─────────────────────────────────────────────────────────────────────────────

// _renderFieldOverlays — single authoritative definition (original removed to prevent hoisting collision)
function _renderFieldOverlays() {
  if (document.getElementById('form-html-preview')) return; // HTML form — no overlay needed
  const svg = document.getElementById('form-field-overlay');
  if (!svg) return;
  if (_marqueeDrag?.active) return;
  if (_formPreviewMode) { _formRenderPreviewOverlay(); return; } // in preview — re-render preview not edit boxes

  const sel = _selectedFieldIds;
  if (sel.size > 0) {
    const firstId = [...sel][0];
    const firstField = _formFields.find(f => f.id === firstId);
  }

  const currentPageFields = _formFields.filter(f => (f.page||1) === _pdfPage);

  // ── Field rects ───────────────────────────────────────────────────────────
  let html = currentPageFields.map(field => {
    const roleConf   = FORM_ROLES[field.role] || FORM_ROLES.assignee;
    const confColor  = _fieldConfidenceColor(field);
    const isSelected = sel.has(field.id);
    const r = field.rect || { x:0, y:0, w:80, h:18 };
    const x = r.x * _pdfScale, y = r.y * _pdfScale;
    const w = r.w * _pdfScale, h = r.h * _pdfScale;
    const labelText = (field.label||'field').slice(0,16);
    const typeIcon  = FIELD_TYPE_META?.[field.type]?.icon || 'T';
    return `
      <g class="field-rect-group" data-field-id="${field.id}" style="cursor:pointer">
        <rect x="${x}" y="${y}" width="${w}" height="${h}"
          fill="${isSelected?'rgba(160,80,255,.22)':roleConf.dim}"
          stroke="${isSelected?'#a050ff':confColor}"
          stroke-width="${isSelected?'2.5':'1.5'}"
          stroke-dasharray="${isSelected?'7 3':'none'}"
          rx="2"/>
        <rect x="${x}" y="${y}" width="${Math.min(w,110)}" height="16" fill="${isSelected?'#a050ff':confColor}" rx="2" opacity="${isSelected?'1':'0.88'}"/>
        <text x="${x+4}" y="${y+11}" fill="white" font-size="10" font-family="Arial,sans-serif" style="pointer-events:none">
          ${typeIcon} ${escHtml(labelText)}
        </text>
        ${field.required?`<text x="${x+w-10}" y="${y+h-4}" fill="#c0404a" font-size="10" font-family="sans-serif" style="pointer-events:none">*</text>`:''}
      </g>`;
  }).join('');

  // ── Selection bounding box + T/B/L/R resize handles (inline in SVG string) ─
  const selFields = [...sel].map(id => _formFields.find(f => f.id === id)).filter(Boolean).filter(f => f.rect);
  if (selFields.length) {
    const minX = Math.min(...selFields.map(f => f.rect.x)) * _pdfScale;
    const minY = Math.min(...selFields.map(f => f.rect.y)) * _pdfScale;
    const maxX = Math.max(...selFields.map(f => f.rect.x + f.rect.w)) * _pdfScale;
    const maxY = Math.max(...selFields.map(f => f.rect.y + f.rect.h)) * _pdfScale;
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
    const HS = 7; // handle half-size px

    // Outer dashed bounding box
    html += `<rect class="sel-bbox" x="${minX}" y="${minY}" width="${maxX-minX}" height="${maxY-minY}"
      fill="none" stroke="#a050ff" stroke-width="1.5" stroke-dasharray="6 3" rx="2" style="pointer-events:none"/>`;

    // 4 midpoint resize handles — use data-edge so mousedown can identify
    const hDefs = [
      { edge:'t', cx:midX, cy:minY, cur:'ns-resize' },
      { edge:'b', cx:midX, cy:maxY, cur:'ns-resize' },
      { edge:'l', cx:minX, cy:midY, cur:'ew-resize' },
      { edge:'r', cx:maxX, cy:midY, cur:'ew-resize' },
    ];
    hDefs.forEach(({ edge, cx, cy, cur }) => {
      html += `<rect class="resize-handle" data-edge="${edge}"
        x="${cx-HS}" y="${cy-HS}" width="${HS*2}" height="${HS*2}"
        fill="white" stroke="#a050ff" stroke-width="2" rx="2"
        style="cursor:${cur}" />`;
    });
  }

  svg.innerHTML = html;

  // Wire resize handle mousedown after innerHTML set
  svg.querySelectorAll('.resize-handle').forEach(el => {
    el.addEventListener('mousedown', ev => _resizeHandleMouseDown(ev, el.dataset.edge));
  });

  _updateHWWidget();
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE IMPORT FLOW
// ─────────────────────────────────────────────────────────────────────────────

function _formUploadClick() {
  document.getElementById('form-file-input')?.click();
}

// ── AI Form Generator ─────────────────────────────────────────────────────────
function _formAiGenerate() {
  var existing = document.getElementById('form-ai-modal');
  if (existing) existing.remove();
  var modal = document.createElement('div');
  modal.id = 'form-ai-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center';
  var closeBtn = '<button data-dismiss="form-ai-modal" onclick="var m=document.getElementById(this.dataset.dismiss);if(m)m.remove();" style="background:none;border:none;color:rgba(255,255,255,.4);font-size:18px;cursor:pointer;line-height:1">&#x2715;</button>';
  var cancelBtn = '<button data-dismiss="form-ai-modal" onclick="var m=document.getElementById(this.dataset.dismiss);if(m)m.remove();" style="font-family:Arial,sans-serif;font-size:12px;padding:7px 16px;border-radius:4px;border:1px solid #1e2535;background:transparent;color:rgba(255,255,255,.5);cursor:pointer">Cancel</button>';
  modal.innerHTML =
    '<div style="width:560px;max-width:95vw;background:#0d1017;border:1px solid #1e2535;border-radius:8px;overflow:hidden">' +
      '<div style="padding:14px 18px;border-bottom:1px solid #1e2535;display:flex;align-items:center;justify-content:space-between">' +
        '<span style="font-family:Arial,sans-serif;font-size:14px;font-weight:600;color:#e2e8f0">&#x2726; Generate form with AI</span>' +
        closeBtn +
      '</div>' +
      '<div style="padding:16px 18px;display:flex;flex-direction:column;gap:12px">' +
        '<div style="font-family:Arial,sans-serif;font-size:12px;color:rgba(255,255,255,.5)">Describe the form you need — fields, sections, calculations, and who fills each part.</div>' +
        '<textarea id="form-ai-prompt" style="width:100%;height:120px;background:#0b0e17;border:1px solid #1e2535;border-radius:5px;color:#e2e8f0;font-family:Arial,sans-serif;font-size:13px;padding:10px;resize:vertical;outline:none" placeholder="Example: An expense report with employee info at top, a day-by-day expense table for meals/transport/hotel with auto-calculated totals, a miscellaneous items section, and a signature block. Manager approves totals, Finance reviews settlement."></textarea>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
          cancelBtn +
          '<button id="form-ai-submit" onclick="_formAiSubmit()" style="font-family:Arial,sans-serif;font-size:12px;font-weight:600;padding:7px 16px;border-radius:4px;border:none;background:#00c9c9;color:#003333;cursor:pointer">Generate &#x2726;</button>' +
        '</div>' +
        '<div id="form-ai-status" style="display:none;font-family:Arial,sans-serif">' +
          '<div style="font-size:11px;color:rgba(255,255,255,.5);margin-bottom:6px;text-align:center" id="form-ai-status-text">Claude is designing your form…</div>' +
          '<div style="background:rgba(255,255,255,.1);border-radius:99px;height:4px;overflow:hidden">' +
            '<div id="form-ai-progress-bar" style="height:100%;width:0%;background:#00c9c9;border-radius:99px;transition:width .4s ease"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  modal.addEventListener('click', function(e){ if(e.target===modal) modal.remove(); });
  document.body.appendChild(modal);
  setTimeout(function(){ document.getElementById('form-ai-prompt')?.focus(); }, 50);
}

async function _formAiSubmit() {
  var prompt = (document.getElementById('form-ai-prompt')?.value || '').trim();
  if (!prompt) return;
  var btn = document.getElementById('form-ai-submit');
  var status = document.getElementById('form-ai-status');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
  if (status) {
    status.style.display = 'block';
    // Animate progress bar over ~55 seconds
    var _aiProgress = 0;
    var _aiStatusMessages = [
      'Analyzing your form requirements…',
      'Designing layout and sections…',
      'Building field structure…',
      'Adding calculations and logic…',
      'Applying Cadence design standards…',
      'Finalizing form…',
    ];
    var _aiMsgIdx = 0;
    var _aiTimer = setInterval(function() {
      _aiProgress = Math.min(92, _aiProgress + (Math.random() * 2.5 + 0.8));
      var bar = document.getElementById('form-ai-progress-bar');
      if (bar) bar.style.width = _aiProgress + '%';
      // Cycle status messages
      var elapsed = Math.floor(_aiProgress / 16);
      if (elapsed !== _aiMsgIdx && elapsed < _aiStatusMessages.length) {
        _aiMsgIdx = elapsed;
        var txt = document.getElementById('form-ai-status-text');
        if (txt) txt.textContent = _aiStatusMessages[_aiMsgIdx];
      }
    }, 600);
    window._aiProgressTimer = _aiTimer;
  }

  try {
    var systemPrompt = 'You are a form designer for Cadence, a professional workflow management platform. Generate a complete, polished HTML form matching the design standards below.\n\nSTRICT OUTPUT RULES:\n- Return ONLY a JSON object, no markdown, no backticks, no preamble\n- JSON must have exactly two keys: html (string) and fields (array)\n\nDESIGN STANDARD:\n- Wrapper: max-width:960px, margin:0 auto, border-radius:12px, border:0.5px solid #2a2f3e, background:#fff, overflow:hidden, font-family:Arial,sans-serif\n- Header: background:#00c9c9, padding:14px 20px, display:flex, justify-content:space-between. Title: font-size:15px, font-weight:500, color:#003333. Subtitle: font-size:10px, color:#005555. Routing pills on right showing approval sequence (e.g. 1 Submitter, 2 Project Manager, 3 Finance): each pill style: background:rgba(0,0,0,.2), color:#003333, font-size:9px, font-weight:500, padding:2px 10px, border-radius:8px, with small arrows between them\n- Body: padding:16px 20px\n- Section label: font-size:9px, font-weight:500, letter-spacing:.08em, text-transform:uppercase, color:#6b7280, border-bottom:0.5px solid #e5e7eb, padding-bottom:4px, margin-bottom:8px, margin-top:16px\n- Field labels: font-size:11px, font-weight:500, color:#1a1a2e. Required asterisk: color:#E24B4A\n- All inputs/selects/textareas: font-family:Arial,sans-serif, font-size:12px, padding:5px 8px, border:0.5px solid #d1d5db, border-radius:5px, background:#f9fafb, color:#1a1a2e, width:100%, box-sizing:border-box\n- Readonly/calculated fields: background:#f3f4f6, color:#6b7280, cursor:default\n- 2-col grid: display:grid, grid-template-columns:1fr 1fr, gap:8px, margin-bottom:8px\n- 3-col grid: display:grid, grid-template-columns:1fr 1fr 1fr, gap:8px\n- Tables: border-collapse:collapse, width:100%; th: background:#f9fafb, padding:5px 8px, font-size:10px, font-weight:500, color:#6b7280, border:0.5px solid #e5e7eb; td: border:0.5px solid #e5e7eb, padding:2px 4px\n- Signature lines: border-bottom:1px solid #374151, height:28px, margin-top:8px\n- Certification block: background:#f9fafb, border:0.5px solid #e5e7eb, border-radius:6px, padding:10px 14px\n- Footer: padding:12px 20px, border-top:0.5px solid #e5e7eb, background:#f9fafb, display:flex, justify-content:space-between. Primary button: background:#00c9c9, color:#003333, border:none, border-radius:5px, padding:6px 16px, font-weight:500. Secondary: border:0.5px solid #d1d5db, background:transparent, border-radius:5px, padding:6px 12px\n\nDATA ATTRIBUTES on every field element: data-field-id=f01 (sequential), data-label=Field Name, data-required=true/false. Section wrappers: section element with data-section=section_name and margin-bottom:18px\n\nFUNCTIONALITY: Real-time calculations with oninput handlers. Conditional sections initially display:none, toggled by JS. Auto-populate today date and reference numbers on DOMContentLoaded.\n\nFields array each entry: id, label, type (text|date|number|select|signature|textarea), required (bool), section';

    var response = await fetch('/api/generate-form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: systemPrompt,
        prompt: prompt
      })
    });
    // Complete progress bar
    if (window._aiProgressTimer) { clearInterval(window._aiProgressTimer); window._aiProgressTimer = null; }
    var bar = document.getElementById('form-ai-progress-bar');
    if (bar) bar.style.width = '100%';
    var txt = document.getElementById('form-ai-status-text');
    if (txt) txt.textContent = 'Processing response…';
    var data = await response.json();
    var raw = (data.content || []).map(function(c){ return c.text || ''; }).join('');
    var clean = raw.replace(/```json|```/g, '').trim();
    var parsed = JSON.parse(clean);

    if (!parsed.html || !parsed.fields) throw new Error('Invalid response structure');

    // Save to DB as new form definition
    var firmId = (typeof FIRM_ID_CAD !== 'undefined') ? FIRM_ID_CAD : (window.CURRENT_FIRM?.id || null);
    var formName = prompt.split(' ').slice(0, 4).map(function(w){ return w.charAt(0).toUpperCase()+w.slice(1); }).join(' ');
    if (status) status.textContent = 'Saving form…';

    var rows = await API.post('workflow_form_definitions', {
      firm_id:     firmId,
      source_name: formName,
      source_html: parsed.html,
      fields:      parsed.fields,
      routing:     { stages: [] },
      archetype:   'data_entry',
      version:     '0.1.0',
      state:       'draft',
      page_count:  1,
      created_at:  new Date().toISOString(),
      updated_at:  new Date().toISOString()
    });

    if (!rows?.[0]?.id) throw new Error('Save failed');

    // Reload form list and select the new form
    _formDefs = await API.get('workflow_form_definitions?firm_id=eq.'+firmId+'&order=created_at.desc').catch(function(){ return []; }) || [];
    var listEl = document.getElementById('form-list');
    if (listEl) listEl.innerHTML = _renderFormList();
    document.getElementById('form-ai-modal')?.remove();
    await _formSelect(rows[0].id);
    cadToast('Form generated — review and refine in the editor', 'info');

  } catch(e) {
    console.error('[formAiGenerate] failed:', e);
    if (status) { status.textContent = 'Generation failed: ' + e.message; status.style.color = 'rgba(232,64,64,.9)'; }
    if (btn) { btn.disabled = false; btn.textContent = 'Generate ✦'; }
  }
}

async function _formFileChosen(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  event.target.value = '';
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    cadToast('PDF import supported — Word documents coming soon', 'info');
    return;
  }
  cadToast(`Analysing ${file.name}…`, 'info');
  try {
    await _ensurePdfJs();
    const arrayBuffer = await file.arrayBuffer();
    window._pendingImportName = file.name;
    window._pendingImportFile = file;  // preserve File ref for save upload
    _pdfDoc        = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    _pdfTotalPages = _pdfDoc.numPages;
    _pdfPage       = 1;
    _pdfScale      = 1.5;
    if (_pdfTotalPages > 1) {
      const multiInfo = await _detectMultiInstance(_pdfDoc);
      if (multiInfo?.detected) { _showMultiInstancePrompt(multiInfo); return; }
    }
    await _proceedWithImport(1, _pdfTotalPages);
  } catch(e) {
    cadToast('Import failed: ' + e.message, 'error');
  }
}

async function _proceedWithImport(startPage = 1, endPage = null) {
  if (!_pdfDoc) { cadToast('Import error: PDF not loaded. Please try again.', 'error'); return; }
  const pageLimit  = endPage || _pdfDoc.numPages;
  const totalPages = pageLimit - startPage + 1;
  const sourceName = window._pendingImportName || 'Imported form';

  const tabEl = document.getElementById('cad-content');
  if (tabEl) renderFormsTab(tabEl);
  _importProgressShow(sourceName, totalPages);

  const PAGE_BUDGET = 60 / totalPages;
  let pct = 0;

  _importProgressUpdate(pct, 'Classifying document type…', '');
  await new Promise(r => setTimeout(r, 0));
  const firstPage = await _pdfDoc.getPage(startPage);
  const firstText = await firstPage.getTextContent();
  const archetype = _classifyFormArchetype(firstText.items);
  pct = 5;
  _importProgressUpdate(pct, `Detected: ${archetype==='checklist'?'Checklist':'Data entry'} form`, '');
  await new Promise(r => setTimeout(r, 0));

  const detectedFields = [];
  for (let p = startPage; p <= pageLimit; p++) {
    const editorPage = p - startPage + 1;
    _importProgressDot(editorPage, 'active');
    _importProgressUpdate(pct, `Scanning page ${editorPage} of ${totalPages}…`, 'AcroForm fields + text heuristics');
    await new Promise(r => setTimeout(r, 0));

    const page        = await _pdfDoc.getPage(p);
    const annotations = await page.getAnnotations();
    const vp          = page.getViewport({ scale: 1 });
    for (const ann of annotations) {
      if (!ann.fieldType) continue;
      const [x1,y1,x2,y2] = ann.rect;
      const x = Math.min(x1,x2), y = vp.height - Math.max(y1,y2);
      const w = Math.abs(x2-x1), h = Math.abs(y2-y1);
      const typeMap = { Tx:'text', Btn:'checkbox', Ch:'text', Sig:'signature' };
      const nameL   = (ann.fieldName||'').toLowerCase();
      const role    = /sign|approv|review/.test(nameL)?'reviewer':/pm|manager/.test(nameL)?'pm':'assignee';
      detectedFields.push({ id:`acro_${p}_${detectedFields.length}`, page:editorPage, rect:{x,y,w,h},
        label:ann.fieldName||ann.alternativeText||`Field ${detectedFields.length+1}`,
        type:typeMap[ann.fieldType]||'text', role, required:!!(ann.fieldFlags&2), detection:'acroform' });
    }
    const textContent = await page.getTextContent();
    detectedFields.push(..._detectTextHeuristicsV2(textContent, page, editorPage, detectedFields.length, archetype));

    pct += PAGE_BUDGET;
    _importProgressDot(editorPage, 'done');
    _importProgressUpdate(pct, `Page ${editorPage} complete — ${detectedFields.length} fields so far`, '');
    await new Promise(r => setTimeout(r, 0));
  }

  let visionFields = [];
  const autoCount = detectedFields.filter(f=>f.detection!=='manual').length;
  if (autoCount < 3) {
    const visionBudget = 25 / Math.min(2, totalPages);
    _importProgressUpdate(pct, 'Sparse detection — running AI vision pass…', '');
    await new Promise(r => setTimeout(r, 0));
    for (let p = startPage; p <= Math.min(startPage+1, pageLimit); p++) {
      const editorPage = p - startPage + 1;
      _importProgressDot(editorPage, 'ai');
      _importProgressUpdate(pct, `AI vision: analysing page ${editorPage}…`, 'Sending to Claude — this takes a moment');
      await new Promise(r => setTimeout(r, 0));
      const vf = await _detectFieldsViaClaudeVision(_pdfDoc, p);
      visionFields.push(...vf.map(f => ({ ...f, page:editorPage })));
      pct += visionBudget;
      _importProgressDot(editorPage, 'done');
      _importProgressUpdate(pct, `AI vision complete — ${vf.length} fields found`, '');
      await new Promise(r => setTimeout(r, 0));
    }
  } else {
    pct = 90;
    _importProgressUpdate(pct, 'Field detection complete', '');
    await new Promise(r => setTimeout(r, 0));
  }

  const allFields = [...detectedFields, ...visionFields];
  _importProgressUpdate(92, 'Assembling form definition…', '');
  await new Promise(r => setTimeout(r, 0));

  const newForm = {
    id:'local_'+Date.now(), source_name:sourceName, page_count:totalPages, archetype,
    fields:allFields, routing:{ stages:[{ stage:1, role:'assignee', parallel_within_stage:false, requires_all:true }] },
    _unsaved:true,
    _file: window._pendingImportFile || null,  // File object for Storage upload on save
  };
  _formDefs.push(newForm);
  _formFields   = allFields;
  _formRouting  = newForm.routing;
  _selectedForm = newForm;
  _pdfTotalPages = totalPages;
  _pdfStartPage  = startPage;
  _pdfPage       = 1;

  _importProgressUpdate(96, 'Rendering document…', '');
  await new Promise(r => setTimeout(r, 0));
  if (tabEl) renderFormsTab(tabEl);
  await _renderPdfPage(startPage);
  _updatePageIndicator();

  const nExact    = allFields.filter(f=>f.detection==='acroform').length;
  const nInferred = allFields.filter(f=>(f.detection||'').startsWith('heuristic')).length;
  const nAI       = allFields.filter(f=>f.detection==='claude_vision').length;
  cadToast(`${allFields.length} fields · ${nExact} exact · ${nInferred} inferred · ${nAI} AI · ${totalPages} pages`, 'success');
  setTimeout(() => _checkAndPromptSignature(allFields), 1200);
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM SELECT / DELETE / SAVE
// ─────────────────────────────────────────────────────────────────────────────

async function _formSelect(formId) {
  const form = _formDefs.find(f => f.id === formId);
  if (!form) return;
  _selectedForm = form;
  _formFields   = JSON.parse(JSON.stringify(form.fields || []));
  _formRouting  = JSON.parse(JSON.stringify(form.routing || { stages:[] }));
  _pdfPage = 1; _pdfDoc = null;
  const el = document.getElementById('cad-content');
  if (el) renderFormsTab(el);
  if (form.source_path) {
    try {
      await _ensurePdfJs();

      let url;
      try {
        url = await _getSignedUrl(form.source_path);
        console.log('[formSelect] signed URL:', url?.slice(0,80));
      } catch(signErr) {
        console.warn('[formSelect] signed URL failed, trying public URL:', signErr.message);
        url = `${SUPA_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${form.source_path}`;
      }
      _pdfDoc = await pdfjsLib.getDocument(url).promise;
      _pdfTotalPages = _pdfDoc.numPages;
      _pdfStartPage  = 1;
      await _renderPdfPage(1);
      _updatePageIndicator();
    } catch(e) {
      console.error('[formSelect] PDF load failed:', e);
      cadToast('Could not load document: ' + e.message, 'error');
    }
  } else if (form.source_html) {
    // Rich HTML form — render in iframe preview
    console.log('[formSelect] rendering source_html form:', form.id);
    var existingIframe = document.getElementById('form-html-preview');
    if (existingIframe) existingIframe.remove();
    // Hide PDF canvas and overlay
    var canvas = document.getElementById('form-pdf-canvas');
    var overlay = document.getElementById('form-field-overlay');
    if (canvas) canvas.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
    // Target form-canvas-wrap — the flex:1 scroll container
    var canvasWrap = document.getElementById('form-canvas-wrap');
    // Hide all existing children so iframe sits at top
    if (canvasWrap) {
      Array.from(canvasWrap.children).forEach(function(c){ c.style.display = 'none'; });
      canvasWrap.style.padding = '0';
      canvasWrap.style.display = 'flex';
      canvasWrap.style.flexDirection = 'column';
    }
    var iframe = document.createElement('iframe');
    iframe.id = 'form-html-preview';
    iframe.style.cssText = 'flex:1;width:100%;min-height:700px;border:none;background:#fff';
    iframe.sandbox = 'allow-scripts allow-same-origin';
    // Inject CSS variable definitions so the form renders correctly outside Cadence's theme
    var cssVars = '<style>:root{' +
      '--color-background-primary:#ffffff;' +
      '--color-background-secondary:#f7f8fa;' +
      '--color-background-tertiary:#f0f1f4;' +
      '--color-background-info:#e8f0fe;' +
      '--color-text-primary:#1a1a2e;' +
      '--color-text-secondary:#4a5068;' +
      '--color-text-tertiary:#8890a8;' +
      '--color-text-info:#1a56db;' +
      '--color-border-tertiary:rgba(0,0,0,.1);' +
      '--color-border-secondary:rgba(0,0,0,.18);' +
      '--color-border-info:#a4cafe;' +
      '--font-mono:monospace' +
    '}</style>';
    var htmlWithVars = form.source_html.replace('<style>', cssVars + '<style>');
    var blob = new Blob([htmlWithVars], { type: 'text/html' });
    iframe.src = URL.createObjectURL(blob);
    if (canvasWrap) canvasWrap.appendChild(iframe);
    else if (canvas && canvas.parentElement) canvas.parentElement.appendChild(iframe);
    _pdfTotalPages = 1; _pdfPage = 1;
    if (typeof _updatePageIndicator === 'function') _updatePageIndicator();
    // Wire edit button overlay after render
    setTimeout(_formWireEditBtn, 300);
    // Reposition on resize
    window.addEventListener('resize', function(){ setTimeout(_formWireEditBtn, 100); });
  } else {
    // No PDF — render a blank A4 canvas so field-based forms display correctly
    console.warn('[formSelect] no source_path on form:', form.id, '— rendering blank canvas');
    const canvas  = document.getElementById('form-pdf-canvas');
    const overlay = document.getElementById('form-field-overlay');
    const W = Math.round(816 * (window._pdfScale || 1));  // 8.5in @ 96dpi
    const H = Math.round(1056 * (window._pdfScale || 1)); // 11in @ 96dpi
    if (canvas) {
      canvas.width  = W; canvas.height = H;
      canvas.style.width = W+'px'; canvas.style.height = H+'px';
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      // Subtle grid lines for visual reference
      ctx.strokeStyle = 'rgba(0,0,0,.04)';
      ctx.lineWidth = 1;
      for (var gx = 0; gx < W; gx += 48) { ctx.beginPath(); ctx.moveTo(gx,0); ctx.lineTo(gx,H); ctx.stroke(); }
      for (var gy = 0; gy < H; gy += 48) { ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(W,gy); ctx.stroke(); }
    }
    if (overlay) {
      overlay.setAttribute('width', W+'px'); overlay.setAttribute('height', H+'px');
      overlay.style.width = W+'px'; overlay.style.height = H+'px';
    }
    _pdfTotalPages = 1; _pdfPage = 1;
    // Auto-layout fields that have no meaningful position (all at 0,0)
    var MARGIN = 32, LABEL_H = 14, FIELD_H = 28, GAP = 12;
    var FIELD_W = Math.round((W / _pdfScale) - MARGIN * 2);
    var curY = MARGIN;
    (_formFields || []).forEach(function(field) {
      var r = field.rect || { x: 0, y: 0, w: 80, h: 18 };
      if (r.x === 0 && r.y === 0) {
        field.rect = { x: MARGIN, y: curY, w: FIELD_W, h: FIELD_H };
        curY += FIELD_H + GAP;
      }
    });
    if (typeof _renderFieldOverlays === 'function') _renderFieldOverlays();
    if (typeof _updatePageIndicator === 'function') _updatePageIndicator();
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE TOOLBAR BUTTONS
// ─────────────────────────────────────────────────────────────────────────────

function _formMarkDirty() {
  if (_formDirty) return;
  _formDirty = true;
  _formUpdateSaveBtn();
}

function _formUpdateSaveBtn() {
  const btn = document.getElementById('form-save-btn');
  if (!btn) return;
  btn.className = _formDirty ? 'btn btn-solid btn-sm' : 'btn btn-ghost btn-sm';
  btn.style.fontSize = '12px';
}

// Renders the category pill (clickable if assigned) or + Category button
function _formCategoryPill(f) {
  const cat = window.FormSettings?.getCategoryById?.(f.category_id);
  if (cat) {
    // Assigned — show amber pill, clicking reopens picker to change it
    return `<button onclick="_formPickCategory()"
      title="Click to change category"
      style="padding:4px 12px;border-radius:999px;font-size:14px;font-weight:600;font-family:Arial,sans-serif;line-height:1.4;box-shadow:0 2px 4px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.08);background:rgba(240,160,48,.12);border:1px solid rgba(240,160,48,.3);
             color:#f0a030;cursor:pointer">${escHtml(cat.name)}</button>`;
  }
  return `<button onclick="_formPickCategory()"
    style="padding:4px 12px;border-radius:999px;font-size:14px;font-weight:600;font-family:Arial,sans-serif;line-height:1.4;box-shadow:0 2px 4px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.08);background:transparent;
           border:1px solid rgba(255,255,255,.2);color:var(--text1);cursor:pointer">+ Category</button>`;
}

async function _formPickCategory() {
  document.getElementById('fs-cat-picker')?.remove();
  let cats = window.FormSettings?.getCategories?.() || [];
  if (!cats.length && window.FormSettings?.loadCategories) {
    await window.FormSettings.loadCategories().catch(() => {});
    cats = window.FormSettings?.getCategories?.() || [];
  }
  if (!cats.length) { cadToast('No categories configured — add them in Form Settings', 'info'); return; }
  const overlay = document.createElement('div');
  overlay.id = 'fs-cat-picker';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9400;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center';
  const rows = cats.map(c =>
    `<div onclick="_formSetCategory('${c.id}');document.getElementById('fs-cat-picker')?.remove()"
      style="padding:10px 12px;border-radius:5px;cursor:pointer;border:1px solid var(--border);margin-bottom:6px;background:var(--surf2)"
      onmouseover="this.style.borderColor='var(--cad)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="font-size:14px;font-weight:500;color:var(--text);font-family:Arial,sans-serif">${escHtml(c.name)}</div>
    </div>`
  ).join('');
  overlay.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:20px;min-width:320px;max-width:420px;box-shadow:0 16px 48px rgba(0,0,0,.7)">
    <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:14px;font-family:Arial,sans-serif">Assign Category</div>
    ${rows}
    <button onclick="document.getElementById('fs-cat-picker')?.remove()" style="margin-top:8px;width:100%;padding:7px;border-radius:999px;background:transparent;border:1px solid var(--border);color:var(--muted);cursor:pointer;font-family:Arial,sans-serif">Cancel</button>
  </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function _formSetCategory(catId) {
  if (!_selectedForm) return;
  _selectedForm.category_id = catId;
  _formMarkDirty();
  const catPill = document.getElementById('form-category-pill');
  if (catPill) catPill.innerHTML = _formCategoryPill(_selectedForm);
  const lcDiv = document.getElementById('form-lifecycle-btns');
  if (lcDiv) lcDiv.innerHTML = _formLifecycleButtons(_selectedForm);
}

function _formLifecycleButtons(f) {
  const state = f.state || 'draft';
  const btns  = [];

  // Save — only in draft
  if (state === 'draft') {
    btns.push(`<button id="form-save-btn"
      onclick="_formSave()"
      style="font-family:Arial,sans-serif;font-size:12px;padding:4px 12px;border-radius:999px;
             border:1px solid var(--border2);background:transparent;color:var(--text2);cursor:pointer">Save</button>`);
  }

  // Commit — only in draft, only for HTML forms
  if (state === 'draft' && _selectedForm?.source_html) {
    btns.push(`<button onclick="_formCommit()"
      style="font-family:Arial,sans-serif;font-size:12px;padding:4px 12px;border-radius:999px;
             border:1px solid var(--border2);background:transparent;color:var(--text2);cursor:pointer">
      Commit</button>`);
  }

  // Publish — only when certified
  if (state === 'certified') {
    btns.push(`<button onclick="_formPublish()"
      style="font-family:Arial,sans-serif;font-size:12px;padding:4px 14px;border-radius:999px;
             background:var(--green);color:#003333;border:none;cursor:pointer;font-weight:700">
      Publish</button>`);
  }

  // Published state actions
  if (state === 'published') {
    btns.push(`<button onclick="_formUnpublish()"
      style="font-family:Arial,sans-serif;font-size:12px;padding:4px 12px;border-radius:999px;
             border:1px solid var(--border2);background:transparent;color:var(--muted);cursor:pointer">
      Unpublish</button>`);
  }

  // Archived
  if (state === 'archived') {
    btns.push(`<span style="font-size:12px;color:var(--muted);font-family:Arial,sans-serif;
      padding:3px 8px;background:rgba(255,255,255,.04);border-radius:4px">Archived — read only</span>`);
  }

  return btns.join('\n');
}

async function _formPublish() {
  if (!_selectedForm) return;
  if (_selectedForm.state !== 'certified') { cadToast('Form must be certified before publishing', 'warn'); return; }
  await API.patch('workflow_form_definitions?id=eq.'+_selectedForm.id, {
    state: 'published', compass_visible: true, updated_at: new Date().toISOString()
  });
  _selectedForm.state = 'published';
  _selectedForm.compass_visible = true;
  _formRefreshToolbar();
  cadToast('Form published — now visible in Compass Browse', 'success');
}

async function _formUnpublish() {
  if (!_selectedForm) return;
  await API.patch('workflow_form_definitions?id=eq.'+_selectedForm.id, {
    state: 'certified', compass_visible: false, updated_at: new Date().toISOString()
  });
  _selectedForm.state = 'certified';
  _selectedForm.compass_visible = false;
  _formRefreshToolbar();
  cadToast('Form unpublished — removed from Compass Browse', 'info');
}

// ─────────────────────────────────────────────────────────────────────────────
// REMOVE WITH DB CONFIRM
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// REPLACE PDF — swap background document, keep all fields intact
// ─────────────────────────────────────────────────────────────────────────────
function _formReplacePdf() {
  let inp = document.getElementById('form-replace-input');
  if (!inp) {
    // Re-create input if missing from DOM (can happen after full re-render)
    inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.pdf'; inp.style.display = 'none';
    inp.id = 'form-replace-input';
    inp.addEventListener('change', _formReplacePdfChosen);
    document.body.appendChild(inp);
  }
  inp.click();
}

async function _formReplacePdfChosen(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  event.target.value = '';

  if (!file.name.toLowerCase().endsWith('.pdf')) {
    cadToast('Only PDF files supported for replacement', 'error'); return;
  }

  const confirmed = confirm(
    `Replace the background PDF with "${file.name}"?\n\n` +
    `All ${_formFields.length} field definitions will be kept exactly as-is.\n` +
    `Field positions are stored in PDF point coordinates and will re-align automatically ` +
    `if the new PDF has the same page dimensions.`
  );
  if (!confirmed) return;

  cadToast('Loading new PDF…', 'info');

  try {
    await _ensurePdfJs();
    const arrayBuffer = await file.arrayBuffer();

    // Store new file for save — do NOT set _unsaved (that triggers POST/duplicate)
    // The PATCH branch handles file upload when _file is set and _unsaved is false
    if (_selectedForm) {
      _selectedForm._file         = file;
      _selectedForm._unsaved      = false; // keep as PATCH — just re-upload file
      _selectedForm.source_name   = _selectedForm.source_name || file.name;
      window._pendingImportFile   = file;
    }

    // Load the new PDF into _pdfDoc
    const newPdfDoc     = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const oldPageCount  = _pdfTotalPages;
    _pdfDoc             = newPdfDoc;
    _pdfTotalPages      = newPdfDoc.numPages;
    _pdfPage            = 1;
    _pdfStartPage       = 1;

    // Update page count on the form
    if (_selectedForm) _selectedForm.page_count = _pdfTotalPages;

    await _renderPdfPage(1);
    _updatePageIndicator();
    _renderFieldOverlays();
    _formMarkDirty();

    const pageNote = _pdfTotalPages !== oldPageCount
      ? ` (page count changed: ${oldPageCount} → ${_pdfTotalPages})`
      : ' (same page count — fields aligned)';

    cadToast(`PDF replaced — ${_formFields.length} fields preserved${pageNote}`, 'success');
    cadToast('Remember to Save to store the new PDF', 'info');

  } catch(e) {
    cadToast('PDF replacement failed: ' + e.message, 'error');
  }
}

async function _formDeleteWithConfirm(formId) {
  const form = _formDefs.find(f => f.id === formId);
  const name = form?.source_name || 'this form';
  const inDB = form && !form._unsaved;
  const msg = inDB
    ? 'Remove "' + name + '" from the Form Library? This will permanently delete the form definition from the database.'
    : 'Remove "' + name + '" from the Form Library?';
  if (!confirm(msg)) return;
  if (inDB) {
    await API.del('workflow_form_definitions?id=eq.' + formId).catch(function(){});
    _formCoCWrite('form.archived', formId, { action:'deleted', name });
  }
  _formDefs = _formDefs.filter(function(f){ return f.id !== formId; });
  if (_selectedForm?.id === formId) {
    _selectedForm = null;
    _formFields = [];
    _formRouting = { mode: 'serial', roles: [], stages: [] };
    // Clear canvas
    var iframe = document.getElementById('form-html-preview');
    if (iframe) iframe.remove();
    var canvasWrap = document.getElementById('form-canvas-wrap');
    if (canvasWrap) {
      Array.from(canvasWrap.children).forEach(function(c){ c.style.display = ''; });
    }
    // Clear right panels
    var fieldsCol = document.getElementById('form-col-matrix');
    var routingCol = null;
    var toolbar = document.getElementById('form-top-toolbar');
    if (fieldsCol) fieldsCol.style.display = 'none';
    if (routingCol) routingCol.style.display = 'none';
    if (toolbar) toolbar.style.display = 'none';
  }
  const listEl = document.getElementById('form-list');
  if (listEl) listEl.innerHTML = _renderFormList();
  cadToast('Form removed', 'success');
}

async function _formCommit() {
  if (!_selectedForm?.id) return;
  if (!_selectedForm.source_html) { cadToast('Only HTML forms can be committed this way', 'error'); return; }

  var firmId = window.FIRM_ID || FIRM_ID_CAD;
  var formName = (_selectedForm.source_name || 'Untitled Form').trim();
  var roles = _formRoutingRolesOrdered(_formRouting.roles || []);

  if (!roles.length) { cadToast('Add at least one role in Routing Order before committing', 'error'); return; }

  // Safety check — verify form still exists in DB before any writes
  if (_selectedForm.id && !_selectedForm._unsaved) {
    var existing = await API.get('workflow_form_definitions?id=eq.'+_selectedForm.id+'&select=id').catch(function(){return[];});
    if (!existing || !existing.length) {
      cadToast('Form record not found in DB — please regenerate the form', 'error');
      return;
    }
  }

  var roleNames = roles.map(function(r){ return (FORM_ROLES[r.role]||{label:r.role}).label; }).join(' → ');
  var defaultVer = _calcNextVersion(_selectedForm.version || '0.1.0', 'minor');

  // Show commit modal with version override
  _formShowCommitModal(formName, roleNames, defaultVer, async function(targetVer, note) {
    try {
      cadToast('Committing form…', 'info');
      await _formSave();

      var existingTmpls = await API.get(
        'workflow_templates?firm_id=eq.' + firmId + '&name=eq.' + encodeURIComponent(formName) + '&form_driven=eq.true'
      ).catch(function(){ return []; }) || [];

      var tmplId;
      if (existingTmpls.length) {
        tmplId = existingTmpls[0].id;
      } else {
        var newTmpl = await API.post('workflow_templates', {
          firm_id: firmId, name: formName,
          description: 'Auto-generated from form: ' + formName,
          status: 'draft', version: targetVer,
          trigger_type: 'manual', form_driven: true,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        });
        tmplId = newTmpl?.[0]?.id;
        if (!tmplId) throw new Error('Failed to create companion workflow');
      }

      await API.del('workflow_template_steps?template_id=eq.' + tmplId).catch(function(){});
      var steps = [];
      steps.push(API.post('workflow_template_steps', {
        template_id: tmplId,
        name: 'Submit ' + formName,
        step_type: 'form',
        assignee_type: 'role',
        assignee_role: 'submitter',
        sequence_order: 1,
        due_type: 'after_prior',
        forward_input: true,
        branch_conditions: [],
        confirm_items: [],
        attached_docs: [],
        outcomes: [],
        created_at: new Date().toISOString()
      }));
      roles.forEach(function(r, idx) {
        steps.push(API.post('workflow_template_steps', {
          template_id: tmplId,
          name: (FORM_ROLES[r.role]||{label:r.role}).label + ' Approval',
          step_type: 'approval',
          assignee_type: 'role',
          assignee_role: r.role,
          sequence_order: idx + 2,
          parallel_required: r.parallel || false,
          due_type: 'after_prior',
          forward_input: true,
          branch_conditions: [],
          confirm_items: [],
          attached_docs: [],
          outcomes: [
            {id:'approved',label:'Approved',color:'#1D9E75',isDefault:true},
            {id:'rejected',label:'Rejected',color:'#E24B4A',isDefault:false,requiresReset:true}
          ],
          created_at: new Date().toISOString()
        }));
      });

      var stepResults = await Promise.all(steps);
      var submitterStepId = stepResults[0]?.[0]?.id;

      if (submitterStepId) {
        await API.patch('workflow_form_definitions?id=eq.' + _selectedForm.id,
          { step_id: submitterStepId, version: targetVer, updated_at: new Date().toISOString() });
        _selectedForm.step_id = submitterStepId;
        _selectedForm.version = targetVer;
      }

      _formCoCWrite('form.committed', _selectedForm.id, { version: targetVer, workflow_id: tmplId, roles: roleNames, note: note });
      // Also patch companion workflow version to match
      await API.patch('workflow_templates?id=eq.'+tmplId, { version: targetVer, updated_at: new Date().toISOString() }).catch(function(){});
      // Reload form defs so Library reflects new version
      await _formLoadDefs().catch(function(){});
      const listEl = document.getElementById('form-list');
      if (listEl) listEl.innerHTML = _renderFormList();
      _formRefreshToolbar();
      cadToast('Form committed at ' + targetVer, 'success');
    } catch(e) {
      console.error('[formCommit] failed:', e);
      cadToast('Commit failed: ' + e.message, 'error');
    }
  });
}

function _formShowCommitModal(formName, roleNames, defaultVer, onConfirm) {
  document.getElementById('form-commit-modal')?.remove();
  var overlay = document.createElement('div');
  overlay.id = 'form-commit-modal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif';
  overlay.innerHTML =
    '<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:10px;width:480px;max-width:calc(100vw - 32px);overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.7)">' +
      '<div style="padding:18px 22px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">' +
        '<div style="width:36px;height:36px;border-radius:8px;flex-shrink:0;background:rgba(0,201,201,.12);border:1px solid rgba(0,201,201,.3);display:flex;align-items:center;justify-content:center;font-size:18px">⬡</div>' +
        '<div style="flex:1">' +
          '<div style="font-size:16px;font-weight:700;color:var(--text)">Commit Form</div>' +
          '<div style="font-size:13px;color:var(--muted);margin-top:2px">' + escHtml(formName) + '</div>' +
        '</div>' +
        '<button data-dismiss="form-commit-modal" onclick="var m=document.getElementById(this.dataset.dismiss);if(m)m.remove()" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;padding:0">&#x2715;</button>' +
      '</div>' +
      '<div style="padding:20px 22px;display:flex;flex-direction:column;gap:14px">' +
        '<div style="padding:10px 12px;background:var(--surf2);border-radius:6px;border-left:3px solid var(--cad)">' +
          '<div style="font-size:12px;color:var(--text2);line-height:1.6">Workflow will be auto-generated: <strong style="color:var(--cad)">Submitter → ' + escHtml(roleNames) + '</strong></div>' +
        '</div>' +
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px;letter-spacing:.03em">Target Version</label>' +
          '<input id="form-commit-ver" value="' + escHtml(defaultVer) + '" style="width:100%;background:var(--bg);border:1.5px solid var(--border2);border-radius:6px;color:var(--text);font-family:monospace;font-size:14px;padding:8px 12px;outline:none;box-sizing:border-box">' +
          '<div style="font-size:11px;color:var(--muted);margin-top:4px">Default is next MINOR. Override if needed (e.g. 1.0.0).</div>' +
        '</div>' +
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px;letter-spacing:.03em">Commit Note <span style="font-weight:400;color:var(--muted)">(optional)</span></label>' +
          '<textarea id="form-commit-note" placeholder="What changed in this version…" style="width:100%;min-height:72px;resize:vertical;box-sizing:border-box;background:var(--bg);border:1.5px solid var(--border2);border-radius:6px;color:var(--text);font-family:Arial,sans-serif;font-size:13px;padding:8px 12px;outline:none" ></textarea>' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
          '<button data-dismiss="form-commit-modal" onclick="var m=document.getElementById(this.dataset.dismiss);if(m)m.remove()" style="font-family:Arial,sans-serif;font-size:13px;padding:8px 18px;border-radius:6px;border:1px solid var(--border2);background:transparent;color:var(--muted);cursor:pointer">Cancel</button>' +
          '<button id="form-commit-confirm" style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;padding:8px 20px;border-radius:6px;border:none;background:var(--cad);color:#003333;cursor:pointer">⬡ Commit</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });
  document.getElementById('form-commit-confirm').addEventListener('click', function() {
    var ver = (document.getElementById('form-commit-ver')?.value||'').trim() || defaultVer;
    var note = (document.getElementById('form-commit-note')?.value||'').trim();
    overlay.remove();
    onConfirm(ver, note);
  });
}

// ── Version helpers ───────────────────────────────────────────────────────────
function _verTooltipHtml() {
  var TS = 'style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px"';
  var THS = 'style="text-align:left;padding:3px 6px;border-bottom:1px solid rgba(255,255,255,.15);color:#8899aa;font-weight:600;font-size:11px;letter-spacing:.06em;text-transform:uppercase"';
  var TDS = 'style="padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.08);color:#c8d4e0;font-size:12px;vertical-align:top"';
  var TD1 = 'style="padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.08);color:#e2e8f0;font-weight:700;font-size:12px;white-space:nowrap;vertical-align:top"';
  var TD2 = 'style="padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.08);color:#00c9c9;font-family:monospace;font-size:12px;white-space:nowrap;vertical-align:top"';
  var rows = [
    ['Save',       '+PATCH',       '0.1.0 → 0.1.1', 'Work in progress'],
    ['Commit',     '+MINOR',       '0.1.1 → 0.2.0', 'Ready for test'],
    ['Release',    '+MAJOR',       '0.2.0 → 1.0.0', 'Locked, production-ready'],
    ['Revision',   '+MINOR draft', '1.0.0 → 1.1.0', 'Changes against live release'],
    ['Re-release', '+MAJOR',       '1.1.x → 2.0.0', 'Breaking change published'],
  ].map(function(r) {
    return '<tr><td '+TD1+'>'+r[0]+'</td><td '+TD2+'>'+r[1]+'</td><td '+TD2+'>'+r[2]+'</td><td '+TDS+'>'+r[3]+'</td></tr>';
  }).join('');
  return '<div>' +
    '<table '+TS+'>' +
      '<tr><th '+THS+'>Action</th><th '+THS+'>Effect</th><th '+THS+'>Example</th><th '+THS+'>Meaning</th></tr>' +
      rows +
    '</table>' +
    '<div style="font-size:12px;color:#c8d4e0;line-height:1.6;margin-bottom:8px">Releasing locks this document and assigns a permanent version. Once released it is read-only — use <strong>Create Revision</strong> to open a new draft at the next minor version.</div>' +
    '<div style="font-size:11px;color:#8899aa;border-top:1px solid rgba(255,255,255,.1);padding-top:8px">* The default version number may be overridden in the Commit and Release dialogs.</div>' +
  '</div>';
}

function _formShowVerTooltip(btn) {
  _formHideVerTooltip();
  var tip = document.createElement('div');
  tip.id = 'form-ver-tip';
  tip.style.cssText = 'position:fixed;z-index:99999;width:380px;background:#1a1f2e;' +
    'border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:14px 16px;' +
    'box-shadow:0 8px 32px rgba(0,0,0,.5);font-family:Arial,sans-serif;' +
    'font-size:12px;color:#e2e8f0;pointer-events:none;visibility:hidden';
  tip.innerHTML = (typeof _verTooltipHtml === 'function') ? _verTooltipHtml() : '';
  document.body.appendChild(tip);
  requestAnimationFrame(function() {
    var r = btn.getBoundingClientRect();
    var tipH = tip.offsetHeight;
    var spaceAbove = r.top;
    var spaceBelow = window.innerHeight - r.bottom;
    // Prefer above, fall back to below if not enough space
    var top = spaceAbove > tipH + 12
      ? r.top - tipH - 8
      : r.bottom + 8;
    tip.style.left = Math.max(8, Math.min(r.right - 380, window.innerWidth - 388)) + 'px';
    tip.style.top  = Math.max(8, top) + 'px';
    tip.style.visibility = 'visible';
  });
}

function _formHideVerTooltip() {
  var tip = document.getElementById('form-ver-tip');
  if (tip) tip.remove();
}

async function _formSyncCompanionVersion(version) {
  if (!_selectedForm?.id || !version) return;
  try {
    var rows = await API.get(
      'workflow_templates?firm_id=eq.'+FIRM_ID_CAD+'&form_driven=eq.true&select=id,version,name'
    ).catch(function(){return[];});
    for (var r of rows) {
      var fsteps = await API.get(
        'workflow_template_steps?template_id=eq.'+r.id+'&step_type=eq.form&select=id&limit=1'
      ).catch(function(){return[];});
      if (fsteps && fsteps.length && r.version !== version) {
        await API.patch('workflow_templates?id=eq.'+r.id, { version: version }).catch(function(){});
        console.log('[formSync] companion version synced to:', version);
        break;
      }
    }
  } catch(e) { /* silent */ }
}

function _calcNextVersion(current, bump) {
  var parts = (current || '0.1.0').split('.').map(Number);
  var major = parts[0]||0, minor = parts[1]||0, patch = parts[2]||0;
  if (bump === 'major') { return (major > 0 ? major+1 : 1)+'.0.0'; }
  if (bump === 'minor') return major+'.'+(minor+1)+'.0';
  return major+'.'+minor+'.'+(patch+1);
}

async function _formReleaseDirectly() {
  if (!_selectedForm) return;
  var defaultVer = _calcNextVersion(_selectedForm.version || '0.1.0', 'major');
  _formShowReleaseDirectModal(_selectedForm, defaultVer);
}

function _formShowReleaseDirectModal(form, defaultVer) {
  document.getElementById('form-release-direct-modal')?.remove();
  var overlay = document.createElement('div');
  overlay.id = 'form-release-direct-modal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif';
  overlay.innerHTML =
    '<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:10px;width:480px;max-width:calc(100vw - 32px);overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.7)">' +
      '<div style="padding:18px 22px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">' +
        '<div style="width:36px;height:36px;border-radius:8px;flex-shrink:0;background:rgba(42,157,64,.15);border:1px solid rgba(42,157,64,.3);display:flex;align-items:center;justify-content:center;font-size:18px">↑</div>' +
        '<div style="flex:1">' +
          '<div style="font-size:16px;font-weight:700;color:var(--text)">Release to Production</div>' +
          '<div style="font-size:13px;color:var(--muted);margin-top:2px">' + escHtml(form.source_name) + ' <strong style="color:var(--green)">' + escHtml(form.version||'') + '</strong></div>' +
        '</div>' +
        '<button data-dismiss="form-release-direct-modal" onclick="var m=document.getElementById(this.dataset.dismiss);if(m)m.remove()" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;padding:0">&#x2715;</button>' +
      '</div>' +
      '<div style="padding:20px 22px;display:flex;flex-direction:column;gap:14px">' +
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px;letter-spacing:.03em">Target Version</label>' +
          '<input id="form-rel-ver" value="' + escHtml(defaultVer) + '" style="width:100%;background:var(--bg);border:1.5px solid var(--border2);border-radius:6px;color:var(--text);font-family:monospace;font-size:14px;padding:8px 12px;outline:none;box-sizing:border-box">' +
          '<div style="font-size:11px;color:var(--muted);margin-top:4px">Default is next MAJOR. Override if needed (e.g. 1.1.0).</div>' +
        '</div>' +
        '<div>' +
          '<label style="display:block;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px;letter-spacing:.03em">Release Notes <span style="font-weight:400;color:var(--muted)">(optional)</span></label>' +
          '<textarea id="form-rel-note" placeholder="What is included in this release…" style="width:100%;min-height:80px;resize:vertical;box-sizing:border-box;background:var(--bg);border:1.5px solid var(--border2);border-radius:6px;color:var(--text);font-family:Arial,sans-serif;font-size:13px;padding:8px 12px;outline:none" ></textarea>' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
          '<button data-dismiss="form-release-direct-modal" onclick="var m=document.getElementById(this.dataset.dismiss);if(m)m.remove()" style="font-family:Arial,sans-serif;font-size:13px;padding:8px 18px;border-radius:6px;border:1px solid var(--border2);background:transparent;color:var(--muted);cursor:pointer">Cancel</button>' +
          '<button id="form-rel-confirm" style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;padding:8px 20px;border-radius:6px;border:none;background:var(--green);color:white;cursor:pointer">✓ Release</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });
  document.getElementById('form-rel-confirm').addEventListener('click', async function() {
    var ver = (document.getElementById('form-rel-ver')?.value||'').trim() || defaultVer;
    var note = (document.getElementById('form-rel-note')?.value||'').trim();
    overlay.remove();
    _selectedForm.state = 'released';
    _selectedForm.version = ver;
    _selectedForm.released_at = new Date().toISOString();
    _selectedForm.review_note = note;
    await _formSave();
    _formCoCWrite('form.released', _selectedForm.id, { version: ver, note });
    cadToast('Released ' + ver, 'success');
    await _formRefreshUI();
  });
}

// _formRejectForm — called from reviewer (in_review) or approver (reviewed) reject buttons
// rejectionStage: 'review' | 'approval'

// ─────────────────────────────────────────────────────────────────────────────
// REJECTION MODAL — professional alternative to browser prompt()
// onSubmit(note) called with trimmed text when user clicks Submit
// ─────────────────────────────────────────────────────────────────────────────
function _formShowRejectModal({ title, subtitle, role, onSubmit }) {
  document.getElementById('cad-reject-modal')?.remove();

  const roleColors = {
    reviewer: '#c47d18', approver: '#2a9d40', pm: '#7c4dff', external: '#8b91a5'
  };
  const accentColor = roleColors[role] || 'var(--red)';

  const overlay = document.createElement('div');
  overlay.id = 'cad-reject-modal';
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:1000',
    'background:rgba(0,0,0,.6)',
    'display:flex;align-items:center;justify-content:center',
    'font-family:Arial,sans-serif',
  ].join(';');

  overlay.innerHTML = `
    <div id="cad-reject-modal-box" style="
      background:var(--bg2,#1a1f2e);
      border:1px solid var(--border2,rgba(255,255,255,.12));
      border-radius:10px;
      width:480px;
      max-width:calc(100vw - 40px);
      box-shadow:0 24px 64px rgba(0,0,0,.7);
      overflow:hidden;
    ">
      <!-- Header -->
      <div style="
        padding:18px 22px 14px;
        border-bottom:1px solid var(--border,rgba(255,255,255,.08));
        display:flex;align-items:flex-start;gap:12px;
      ">
        <div style="
          width:36px;height:36px;border-radius:8px;flex-shrink:0;
          background:rgba(220,60,60,.15);border:1px solid rgba(220,60,60,.3);
          display:flex;align-items:center;justify-content:center;
          font-size:18px;
        ">✗</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:16px;font-weight:700;color:var(--text,#f0f0f0);margin-bottom:3px">
            ${title}
          </div>
          <div style="font-size:13px;color:var(--muted,#8b91a5);line-height:1.4">
            ${subtitle}
          </div>
        </div>
        <button id="cad-reject-close" style="
          background:none;border:none;color:var(--muted,#8b91a5);
          font-size:20px;cursor:pointer;padding:0;line-height:1;flex-shrink:0;
        ">✕</button>
      </div>

      <!-- Body -->
      <div style="padding:20px 22px">
        <label style="
          display:block;font-size:13px;font-weight:600;
          color:var(--text2,#c8ccd6);margin-bottom:8px;
          letter-spacing:.03em;
        ">
          Rejection Comments
          <span style="color:var(--red,#dc2626);margin-left:2px">*</span>
        </label>
        <textarea id="cad-reject-textarea"
          placeholder="Describe what needs to be corrected before this can be approved…"
          style="
            width:100%;min-height:120px;max-height:260px;
            resize:vertical;box-sizing:border-box;
            background:var(--bg,#111827);
            border:1.5px solid var(--border2,rgba(255,255,255,.15));
            border-radius:6px;
            color:var(--text,#f0f0f0);
            font-family:Arial,sans-serif;font-size:14px;line-height:1.6;
            padding:10px 12px;outline:none;
            transition:border-color .15s;
          "
          onfocus="this.style.borderColor='${accentColor}'"
          onblur="this.style.borderColor='var(--border2,rgba(255,255,255,.15))'"
        ></textarea>
        <div id="cad-reject-error" style="
          display:none;margin-top:6px;
          font-size:12px;color:var(--red,#dc2626);
          font-family:Arial,sans-serif;
        ">A rejection comment is required.</div>
      </div>

      <!-- Footer -->
      <div style="
        padding:14px 22px 18px;
        border-top:1px solid var(--border,rgba(255,255,255,.08));
        display:flex;justify-content:flex-end;gap:10px;
      ">
        <button id="cad-reject-cancel" style="
          padding:8px 22px;border-radius:6px;
          background:transparent;
          border:1px solid var(--border2,rgba(255,255,255,.15));
          color:var(--muted,#8b91a5);cursor:pointer;
          font-size:14px;font-family:Arial,sans-serif;
          transition:all .12s;
        "
        onmouseover="this.style.borderColor='var(--text,#f0f0f0)';this.style.color='var(--text,#f0f0f0)'"
        onmouseout="this.style.borderColor='var(--border2,rgba(255,255,255,.15))';this.style.color='var(--muted,#8b91a5)'"
        >Cancel</button>
        <button id="cad-reject-submit" style="
          padding:8px 26px;border-radius:6px;
          background:var(--red,#dc2626);
          border:none;color:white;cursor:pointer;
          font-size:14px;font-weight:600;font-family:Arial,sans-serif;
          transition:opacity .12s;
        "
        onmouseover="this.style.opacity='.85'"
        onmouseout="this.style.opacity='1'"
        >Submit Rejection</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Focus textarea
  const ta = document.getElementById('cad-reject-textarea');
  setTimeout(() => ta?.focus(), 50);

  // Wire close / cancel
  const close = () => overlay.remove();
  document.getElementById('cad-reject-close').onclick  = close;
  document.getElementById('cad-reject-cancel').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  // Wire submit
  document.getElementById('cad-reject-submit').onclick = () => {
    const note = ta.value.trim();
    const errEl = document.getElementById('cad-reject-error');
    if (!note) {
      errEl.style.display = 'block';
      ta.style.borderColor = 'var(--red,#dc2626)';
      ta.focus();
      return;
    }
    overlay.remove();
    onSubmit(note);
  };

  // Submit on Ctrl+Enter
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      document.getElementById('cad-reject-submit')?.click();
    }
  });
}

async function _formRejectForm(rejectionStage) {
  if (!_selectedForm) return;
  const roleLabel = rejectionStage === 'approval' ? 'Approver' : 'Reviewer';
  _formShowRejectModal({
    title:    `Reject — ${roleLabel} Review`,
    subtitle: `This form will be returned to the editor. Your comments will be recorded in the Chain of Custody and shown to the editor.`,
    role:     rejectionStage === 'approval' ? 'approver' : 'reviewer',
    onSubmit: async (note) => {
      const from = _selectedForm.state;
      const to   = rejectionStage === 'review' ? 'rejected_review' : 'rejected_approval';
      _selectedForm.state       = to;
      _selectedForm.review_note = note;
      // Write Rejected CoC BEFORE save (save auto-transitions and writes its own CoC)
      _formCoCWrite('form.rejected', _selectedForm.id, {
        from, to,
        stage:       rejectionStage,
        note,
        version:     _selectedForm.version,
        rejected_by: window.CURRENT_USER?.id || 'editor'
      });
      await _formSave();
      cadToast('Rejected — returned to editor for revision', 'info');
      await _formRefreshUI();
    }
  });
}

// _formReleaseFinal — called from 'approved' state to formally publish
async function _formReleaseFinal() {
  if (!_selectedForm) return;
  _formShowReleaseModal(_selectedForm);
}

function _formShowReleaseModal(form) {
  document.getElementById('cad-release-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'cad-release-modal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.65);' +
    'display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif';

  overlay.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:10px;
      width:480px;max-width:calc(100vw - 32px);box-shadow:0 24px 64px rgba(0,0,0,.7);overflow:hidden">

      <!-- Header -->
      <div style="padding:18px 22px 14px;border-bottom:1px solid var(--border);
        display:flex;align-items:flex-start;gap:12px">
        <div style="width:36px;height:36px;border-radius:8px;flex-shrink:0;
          background:rgba(42,157,64,.15);border:1px solid rgba(42,157,64,.3);
          display:flex;align-items:center;justify-content:center;font-size:18px">↑</div>
        <div style="flex:1">
          <div style="font-size:16px;font-weight:700;color:var(--text)">Release to Production</div>
          <div style="font-size:13px;color:var(--muted);margin-top:2px">
            ${escHtml(form.source_name)}
            <strong style="color:var(--green)">&nbsp;${escHtml(form.version)}</strong>
          </div>
        </div>
        <button onclick="document.getElementById('cad-release-modal')?.remove()"
          style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;padding:0">✕</button>
      </div>

      <!-- Body -->
      <div style="padding:20px 22px">
        <div style="padding:10px 12px;background:var(--surf2);border-radius:6px;
          border-left:3px solid var(--green);margin-bottom:16px">
          <div style="font-size:12px;color:var(--text2);line-height:1.6">
            This is your final check. Once committed, this form becomes
            <strong>live</strong> and available for assignment in workflows.
            If you spot anything that needs changing, enter a comment below
            and click <strong>Reject</strong> to return it for revision.
          </div>
        </div>
        <label style="display:block;font-size:13px;font-weight:600;color:var(--text2);
          margin-bottom:8px;letter-spacing:.03em">
          Comments
          <span id="cad-release-notes-req"
            style="font-size:12px;font-weight:400;color:var(--muted);margin-left:4px">(optional)</span>
        </label>
        <textarea id="cad-release-notes"
          placeholder="Any final notes about this release…"
          style="width:100%;min-height:90px;resize:vertical;box-sizing:border-box;
            background:var(--bg);border:1.5px solid var(--border2);border-radius:6px;
            color:var(--text);font-family:Arial,sans-serif;font-size:14px;
            line-height:1.6;padding:10px 12px;outline:none;transition:border-color .15s"
          onfocus="this.style.borderColor='var(--green)'"
          onblur="this.style.borderColor='var(--border2)'"
        ></textarea>
        <div id="cad-release-error"
          style="display:none;margin-top:6px;font-size:12px;
            color:var(--red);font-family:Arial,sans-serif">
          A comment is required when rejecting.
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:14px 22px 18px;border-top:1px solid var(--border);
        display:flex;gap:10px;align-items:center">
        <button id="cad-release-reject-btn"
          style="padding:8px 20px;border-radius:6px;background:transparent;
            border:1.5px solid var(--red);color:var(--red);cursor:pointer;
            font-size:14px;font-weight:600;font-family:Arial,sans-serif">
          ✗ Reject
        </button>
        <div style="flex:1"></div>
        <button onclick="document.getElementById('cad-release-modal')?.remove()"
          style="padding:8px 20px;border-radius:6px;background:transparent;
            border:1px solid var(--border);color:var(--muted);cursor:pointer;
            font-size:14px;font-family:Arial,sans-serif">Cancel</button>
        <button id="cad-release-commit-btn"
          style="padding:8px 26px;border-radius:6px;background:var(--green);
            border:none;color:white;cursor:pointer;font-size:14px;font-weight:700;
            font-family:Arial,sans-serif">
          ↑ Commit Release
        </button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('cad-release-notes')?.focus(), 50);

  // Reject — mandatory comment, no second modal
  document.getElementById('cad-release-reject-btn').onclick = async () => {
    const note    = document.getElementById('cad-release-notes')?.value?.trim() || '';
    const errEl   = document.getElementById('cad-release-error');
    const reqEl   = document.getElementById('cad-release-notes-req');
    const ta      = document.getElementById('cad-release-notes');
    if (!note) {
      errEl.style.display = 'block';
      ta.style.borderColor = 'var(--red)';
      reqEl.textContent = '(required for rejection)';
      reqEl.style.color = 'var(--red)';
      ta.focus();
      return;
    }
    overlay.remove();
    const from = _selectedForm.state;
    // 1. Write Rejected CoC first (correct chronological order)
    _selectedForm.state       = 'rejected_release';
    _selectedForm.review_note = note;
    _formCoCWrite('form.rejected', _selectedForm.id, {
      from, to: 'rejected_release', stage: 'release', note,
      version:     _selectedForm.version,
      rejected_by: window.CURRENT_USER?.id || null,
    });
    // 2. Save — this auto-transitions to draft and writes "Returned to Draft" CoC
    await _formSave();
    cadToast('Returned for revision', 'info');
    await _formRefreshUI();
  };

  // Commit → execute the release
  document.getElementById('cad-release-commit-btn').onclick = async () => {
    const note = document.getElementById('cad-release-notes')?.value?.trim() || '';
    overlay.remove();
    await _formDoReleaseFinal(note);
  };
}

async function _formDoReleaseFinal(note) {
  if (!_selectedForm) return;
  const priorReleased = _formDefs.find(f =>
    f.id !== _selectedForm.id &&
    f.state === 'released' &&
    f.source_name === _selectedForm.source_name
  );
  // Release at current version — no bump here (version bumps when revision is created)
  _selectedForm.state       = 'released';
  _selectedForm.released_at = new Date().toISOString();
  await _formSave();
  if (priorReleased) {
    priorReleased.superseded_by = _selectedForm.id;
    await API.patch(`workflow_form_definitions?id=eq.${priorReleased.id}`,
      { superseded_by: _selectedForm.id, state: 'archived' }).catch(()=>{});
  }
  _formCoCWrite('form.released', _selectedForm.id, {
    version:    _selectedForm.version,
    note:       note || `Version ${_selectedForm.version} released`,
    supersedes: priorReleased?.id
  });
  cadToast(`Released ${_selectedForm.version}`, 'success');
  await _formRefreshUI();
}


async function _formCancelRevision() {
  if (!_selectedForm) return;

  // Find the prior released version to restore to
  const priorVer = _formDefs.find(f =>
    f.id !== _selectedForm.id &&
    f.state === 'released' &&
    f.source_name === _selectedForm.source_name
  );

  // Compute what version we'd be returning to
  // Current form is unreleased at e.g. 0.2.0 — restore to 0.1.0
  const _cat    = window.FormSettings?.getCategoryById?.(_selectedForm.category_id);
  const _fmt    = _cat?.version_format || 'semver';
  const currentVer = _selectedForm.version;

  // Bump down = reverse the minor bump: parse and decrement minor
  const parts = currentVer.replace(/[^\d.]/g,'').split('.').map(Number);
  parts[1] = Math.max(0, parts[1] - 1);
  parts[2] = 0;
  const restoredVer = parts.join('.');

  // Professional modal — no browser confirm()
  const confirmed = await new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;
      display:flex;align-items:center;justify-content:center;`;
    overlay.innerHTML = `
      <div style="background:var(--bg1);border:1px solid var(--border);border-radius:12px;
                  padding:28px 32px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.5);
                  font-family:Arial,sans-serif;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
          <span style="width:36px;height:36px;border-radius:50%;background:rgba(248,113,113,.15);
                       display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">✕</span>
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--fg);">Cancel Revision</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">${_selectedForm.source_name}</div>
          </div>
        </div>
        <div style="font-size:13px;color:var(--fg);line-height:1.6;margin-bottom:20px;">
          <div style="margin-bottom:10px;">This will discard the current revision:</div>
          <div style="background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.25);
                      border-radius:6px;padding:10px 14px;margin-bottom:10px;">
            <span style="color:#f87171;font-weight:600;">Version ${currentVer}</span>
            <span style="color:var(--muted);"> — will be discarded</span>
          </div>
          <div style="background:rgba(79,142,247,.08);border:1px solid rgba(79,142,247,.25);
                      border-radius:6px;padding:10px 14px;">
            <span style="color:#4f8ef7;font-weight:600;">Version ${restoredVer}</span>
            <span style="color:var(--muted);"> — will be restored (Released)</span>
          </div>
          <div style="margin-top:12px;color:var(--muted);font-size:12px;">
            Any unsaved changes in this revision will be permanently lost.
          </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="_cancelRevKeepBtn" style="padding:8px 18px;border-radius:999px;border:1px solid var(--border);
            background:var(--bg2);color:var(--fg);font-family:Arial,sans-serif;font-size:13px;
            cursor:pointer;font-weight:600;box-shadow:0 2px 4px rgba(0,0,0,.3);">Keep Editing</button>
          <button id="_cancelRevConfirmBtn" style="padding:8px 18px;border-radius:999px;border:none;
            background:#f87171;color:#fff;font-family:Arial,sans-serif;font-size:13px;
            cursor:pointer;font-weight:700;box-shadow:0 2px 4px rgba(0,0,0,.4);">✕ Cancel Revision</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const cleanup = (result) => { overlay.remove(); resolve(result); };
    overlay.querySelector('#_cancelRevKeepBtn').onclick    = () => cleanup(false);
    overlay.querySelector('#_cancelRevConfirmBtn').onclick = () => cleanup(true);
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
  });
  if (!confirmed) return;

  _formCoCWrite('form.state_changed', _selectedForm.id, {
    from:    'unreleased',
    to:      'released',
    version: restoredVer,
    note:    `Revision cancelled — reverted to ${restoredVer}`,
  });

  await new Promise(r => setTimeout(r, 50));

  _selectedForm.state   = 'released';
  _selectedForm.version = restoredVer;
  _selectedForm.released_at = _selectedForm.released_at || new Date().toISOString();
  await _formSave();

  cadToast(`Revision cancelled — returned to Released ${restoredVer}`, 'info');
  await _formRefreshUI();
}

async function _formCreateRevision() {
  if (!_selectedForm) return;
  const _cat    = window.FormSettings?.getCategoryById?.(_selectedForm.category_id);
  const _fmt    = _cat?.version_format || 'semver';
  const _oldVer = _selectedForm.version;
  const _newVer = _formBumpVersion(_oldVer, _fmt, 'minor');
  if (!confirm(`Create a new revision of "${_selectedForm.source_name}"?\n\nVersion will advance from ${_oldVer} → ${_newVer}.\nThe current released version remains active until the new revision is published.`)) return;
  _selectedForm.state   = 'unreleased';
  _selectedForm.version = _newVer;
  // Write CoC BEFORE save so "Revision Started" timestamp precedes "In Draft"
  _formCoCWrite('form.state_changed', _selectedForm.id, {
    from: 'released', to: 'unreleased',
    version: _newVer,
    note: `Revision started — version ${_oldVer} → ${_newVer}`
  });
  await new Promise(r => setTimeout(r, 50));
  await _formSave();
  cadToast(`Revision ${_newVer} opened for editing`, 'info');
  await _formRefreshUI();
}

async function _formArchive() {
  if (!_selectedForm) return;
  if (!confirm(`Archive "${_selectedForm.source_name} ${_selectedForm.version}"? It will become read-only.`)) return;
  _selectedForm.state       = 'archived';
  _selectedForm.archived_at = new Date().toISOString();
  await _formSave();
  _formCoCWrite('form.archived', _selectedForm.id, { version:_selectedForm.version });
  cadToast('Form archived', 'info');
  const el = document.getElementById('cad-content');
  if (el) renderFormsTab(el);
}

// ─────────────────────────────────────────────────────────────────────────────
// COC WRITER
// ─────────────────────────────────────────────────────────────────────────────
function _formCoCWrite(eventType, formId, details) {
  const payload = {
    entity_type: 'workflow_form_definition',
    entity_id:   formId,
    event_type:  eventType,
    details:     { ...details, form_name: _selectedForm?.source_name },
    actor_id:    window.CURRENT_USER?.id || null,         // auth user UUID
    actor_name:  window.CURRENT_USER?.name || window.CURRENT_USER?.email || null,
    firm_id:     window.FIRM_ID || FIRM_ID_CAD,
    created_at:  new Date().toISOString(),
  };
  // Map to coc_events actual column names
  const cocRow = {
    firm_id:           payload.firm_id,
    entity_id:         payload.entity_id,
    entity_type:       payload.entity_type,
    event_type:        payload.event_type,
    event_notes:       typeof payload.details === 'object'
                         ? JSON.stringify(payload.details)
                         : (payload.details || ''),
    actor_name:        payload.actor_name || null,
    actor_resource_id: window.CURRENT_USER?.resource_id || payload.actor_id || null,
    event_class:       'form',
    severity:          'info',
    occurred_at:       payload.created_at || new Date().toISOString(),
    metadata:          payload.details || null,
  };

  // Try window.CoC.write first (platform CoC module)
  if (window.CoC?.write) {
    try { window.CoC.write(payload); } catch(e) { console.warn('[CoC] write failed:', e.message); }
  }

  API.post('coc_events', cocRow).catch(e =>
    console.warn('[form-editor] coc_events write failed:', e.message)
  );
}

function _formDelete(formId) {
  if (!confirm('Remove this form definition? The source document is not deleted.')) return;
  _formDefs = _formDefs.filter(f => f.id !== formId);
  if (_selectedForm?.id === formId) { _selectedForm = null; _formFields = []; _pdfDoc = null; }
  const el = document.getElementById('cad-content');
  if (el) renderFormsTab(el);
}

function _formRenameCurrent(newName) {
  const name = newName.trim();
  if (!name || !_selectedForm) return;
  if (_selectedForm.source_name === name) return;
  _selectedForm.source_name = name;
  _formMarkDirty();
  const listEl = document.getElementById('form-list');
  if (listEl) listEl.innerHTML = _renderFormList();
  // Sync companion workflow name if one exists
  _formSyncCompanionName(name);
}

async function _formSyncCompanionName(name) {
  if (!_selectedForm?.id) return;
  try {
    // Find companion workflow — form_driven=true with matching form step
    var steps = await API.get('workflow_template_steps?select=template_id&limit=1').catch(function(){return[];});
    // Look up by form def id via step link
    var rows = await API.get(
      'workflow_templates?firm_id=eq.'+FIRM_ID_CAD+'&form_driven=eq.true&select=id,name'
    ).catch(function(){return[];});
    // Match companion by finding one whose steps include our form def
    for (var r of rows) {
      var fsteps = await API.get(
        'workflow_template_steps?template_id=eq.'+r.id+'&step_type=eq.form&select=id&limit=1'
      ).catch(function(){return[];});
      if (fsteps && fsteps.length) {
        // Found companion — check if its name differs
        if (r.name !== name) {
          await API.patch('workflow_templates?id=eq.'+r.id, { name: name }).catch(function(){});
          console.log('[formRename] companion workflow renamed to:', name);
        }
        break;
      }
    }
  } catch(e) { /* silent */ }
}

async function _formToggleCompassVisible(checked) {
  if (!_selectedForm?.id) return;
  const chk    = document.getElementById('form-compass-visible-chk');
  const status = document.getElementById('form-compass-visible-status');
  if (chk) chk.disabled = true;
  try {
    await API.patch(`workflow_form_definitions?id=eq.${_selectedForm.id}`, {
      compass_visible: checked,
    });
    _selectedForm.compass_visible = checked;
    // Write CoC event
    _formCoCWrite(
      checked ? 'form.compass_published' : 'form.compass_unpublished',
      _selectedForm.id,
      {
        note:    checked ? 'Published to Compass Browse library' : 'Removed from Compass Browse library',
        version: _selectedForm.version || '0.1.0',
      }
    );
    if (status) {
      status.textContent = checked ? '● Live in Browse' : '○ Not in Browse';
      status.style.color = checked ? 'var(--green)' : 'var(--muted)';
    }
    cadToast(checked ? 'Published to Compass Browse' : 'Removed from Compass Browse', 'success');
  } catch(e) {
    cadToast('Failed: ' + e.message, 'error');
    if (chk) chk.checked = !checked;
  } finally {
    if (chk) chk.disabled = false;
  }
}

async function _formSave() {
  if (!_selectedForm) return;
  _selectedForm.fields  = JSON.parse(JSON.stringify(_formFields));
  _selectedForm.routing = JSON.parse(JSON.stringify(_formRouting));
  if (_selectedForm._unsaved || (!_selectedForm.source_path && _selectedForm._file)) {
    cadToast('Saving…', 'info');
    try {
      if (_selectedForm._file) {
        const safeName = (_selectedForm.source_name||'form').replace(/[^a-zA-Z0-9.\-_]/g,'_');
        const path     = `${FIRM_ID_CAD}/forms/${Date.now()}_${safeName}`;
        const token    = await Auth.getToken();
        const res = await fetch(`${SUPA_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
          method:'POST', headers:{ 'apikey':SUPA_KEY, 'Authorization':'Bearer '+token,
            'Content-Type':_selectedForm._file.type||'application/pdf', 'x-upsert':'true' },
          body:_selectedForm._file,
        });
        if (!res.ok) throw new Error('Storage upload failed');
        _selectedForm.source_path = path;
      }
      const rows = await API.post('workflow_form_definitions', {
        firm_id:window.FIRM_ID||FIRM_ID_CAD, source_path:_selectedForm.source_path||null,
        source_name:_selectedForm.source_name, page_count:_selectedForm.page_count,
        archetype:_selectedForm.archetype||'data_entry',
        fields:_selectedForm.fields, routing:_selectedForm.routing,
        state:_selectedForm.state||'draft', version:_selectedForm.version||'0.1.0',
        category_id:_selectedForm.category_id||null,
      });
      if (rows?.[0]?.id) { _selectedForm.id = rows[0].id; _selectedForm._unsaved = false; delete _selectedForm._file; }
      cadToast('Form saved', 'success');
      _formDirty = false; _formUpdateSaveBtn();
      _formRefreshCoCIfOpen();
      _formCoCWrite('form.created', _selectedForm.id, { version:_selectedForm.version, name:_selectedForm.source_name });
      _formCoCWrite('form.saved', _selectedForm.id, { version:_selectedForm.version, state:_selectedForm.state });
      const listEl = document.getElementById('form-list');
      if (listEl) listEl.innerHTML = _renderFormList();
    } catch(e) { cadToast('Save failed: ' + e.message, 'error'); }
  } else {
    // Auto-advance rejected states back to draft when editor saves
    const _rejectedStates = ['rejected_review','rejected_approval','rejected_release'];
    if (_rejectedStates.includes(_selectedForm.state)) {
      const _prevState = _selectedForm.state;
      _selectedForm.state = 'draft';
      // Small delay ensures "Returned to Draft" CoC timestamp is AFTER "Rejected"
      await new Promise(r => setTimeout(r, 50));
      _formCoCWrite('form.state_changed', _selectedForm.id, {
        from:    _prevState,
        to:      'draft',
        note:    'Returned to Draft',
        version: _selectedForm.version,  // version unchanged — only bumps on Release
      });
    }
    // Upload replacement PDF if one was selected via Replace PDF button
    if (_selectedForm._file && !_selectedForm._unsaved) {
      try {
        const path  = _selectedForm.source_path ||
          `${window.FIRM_ID||FIRM_ID_CAD}/${Date.now()}_${_selectedForm._file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
        const token = await Auth.getToken();
        const res   = await fetch(`${SUPA_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
          method:'POST', headers:{ 'apikey':SUPA_KEY, 'Authorization':'Bearer '+token,
            'Content-Type':_selectedForm._file.type||'application/pdf', 'x-upsert':'true' },
          body: _selectedForm._file,
        });
        if (res.ok) {
          _selectedForm.source_path = path;
          delete _selectedForm._file;
        }
      } catch(e) { console.warn('[formSave] PDF upload failed:', e.message); }
    }
    // Auto-publish to Compass on first release; preserve existing value thereafter
    const _wasReleased = _selectedForm._prevState === 'released';
    const _nowReleased = (_selectedForm.state || 'draft') === 'released';
    const _compassVal  = (_nowReleased && !_wasReleased)
      ? true
      : (_selectedForm.compass_visible || false);

    await API.patch(`workflow_form_definitions?id=eq.${_selectedForm.id}`, {
      source_name:     _selectedForm.source_name,
      fields:          _selectedForm.fields,
      routing:         _selectedForm.routing,
      state:           _selectedForm.state         || 'draft',
      version:         _selectedForm.version       || '0.1.0',
      category_id:     _selectedForm.category_id   || null,
      superseded_by:   _selectedForm.superseded_by || null,
      review_note:     _selectedForm.review_note   || null,
      pending_reviewer_ids: _selectedForm.pending_reviewer_ids || [],
      reviewed_by:     _selectedForm.reviewed_by   || [],
      approved_by:     _selectedForm.approved_by   || null,
      released_at:     _selectedForm.released_at   || null,
      archived_at:     _selectedForm.archived_at   || null,
      compass_visible: _compassVal,
    }).catch(e => { console.error('[formSave] PATCH failed:', e.message); cadToast('Save failed: ' + e.message, 'error'); });
    if (_nowReleased && !_wasReleased) _selectedForm.compass_visible = true;
    cadToast('Form saved', 'success');
    _formDirty = false; _formUpdateSaveBtn();
    _formRefreshCoCIfOpen();
    // Write form.saved CoC so activity panel can detect "In Draft" state
    _formCoCWrite('form.saved', _selectedForm.id, { version:_selectedForm.version, state:_selectedForm.state });
    const listEl = document.getElementById('form-list');
    if (listEl) listEl.innerHTML = _renderFormList();
    // Sync name + version to companion workflow
    _formSyncCompanionName(_selectedForm.source_name);
    _formSyncCompanionVersion(_selectedForm.version);
  }
}

async function _getSignedUrl(path) {
  const token = await Auth.getToken();
  const res = await fetch(`${SUPA_URL}/storage/v1/object/sign/${STORAGE_BUCKET}/${path}`, {
    method:'POST', headers:{ 'apikey':SUPA_KEY, 'Authorization':'Bearer '+token, 'Content-Type':'application/json' },
    body: JSON.stringify({ expiresIn:3600 }),
  });
  const data = await res.json();
  if (!data.signedURL) throw new Error('Could not generate URL');
  return `${SUPA_URL}/storage/v1${data.signedURL}`;
}

async function _loadFormDefs() {
  try {
    _formDefs = await API.get(`workflow_form_definitions?firm_id=eq.${FIRM_ID_CAD}&order=created_at.desc`).catch(()=>[]) || [];
  } catch(e) { _formDefs = []; }
}

const _origSwitchTab = typeof switchTab === 'function' ? switchTab : null;
if (_origSwitchTab) {
  window.switchTab = function(tab) {
    if (tab === 'forms' && !_formDefs.length) {
      _loadFormDefs().then(() => { const el = document.getElementById('cad-content'); if (el) renderFormsTab(el); });
    }
    _origSwitchTab(tab);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-SELECT, MARQUEE, ARRANGE
// ─────────────────────────────────────────────────────────────────────────────

function _formFieldListClick(event, fieldId) {
  if (event.shiftKey || event.ctrlKey || event.metaKey) {
    _selectedFieldIds.has(fieldId) ? _selectedFieldIds.delete(fieldId) : _selectedFieldIds.add(fieldId);
    _formUpdateSelectionUI();
    _renderFieldOverlays();
  } else {
    _formClearSelection();
    _selectedFieldIds.add(fieldId);
    _formRevealField(fieldId);
    _formUpdateSelectionUI();
    _renderFieldOverlays();
    _formInlineLabelEdit(fieldId);
  }
}

// Inline label edit — click field label to rename in place
function _formInlineLabelEdit(fieldId) {
  var row = document.getElementById('frow-'+fieldId);
  if (!row) return;
  var field = _formFields.find(function(f){return f.id===fieldId;});
  if (!field) return;
  var labelDiv = row.querySelector('[data-label-target]');
  if (!labelDiv || labelDiv.querySelector('input')) return;
  var current = field.label || '';
  var inp = document.createElement('input');
  inp.value = current;
  inp.style.cssText = 'font-size:12px;background:transparent;border:none;border-bottom:1px solid var(--cad);color:var(--text1);width:100%;outline:none;font-family:Arial,sans-serif;padding:0';
  labelDiv.innerHTML = '';
  labelDiv.appendChild(inp);
  inp.focus(); inp.select();
  function commit() {
    var val = inp.value.trim() || current;
    _formUpdateField(fieldId, 'label', val);
  }
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', function(e){
    if (e.key==='Enter'){e.preventDefault();inp.blur();}
    if (e.key==='Escape'){inp.value=current;inp.blur();}
    e.stopPropagation();
  });
  inp.addEventListener('click', function(e){e.stopPropagation();});
}

function _formClearSelection() {
  console.trace('[formClearSelection] called');
  _selectedFieldIds.clear();
  _formUpdateSelectionUI();
  _renderFieldOverlays();
  _reRenderMatrix();
}

function _formUpdateSelectionUI() {
  const count = _selectedFieldIds.size;
  const cntEl = document.getElementById('form-sel-count');
  const barEl = document.getElementById('form-arrange-bar');
  if (cntEl) { cntEl.textContent = `${count} selected`; cntEl.style.display = count > 0 ? '' : 'none'; }
  if (barEl) barEl.style.display = count >= 2 ? 'flex' : 'none';
  _reRenderMatrix();
  _updateHWWidget();
}


function _formUpdateMulti(key, value) {
  _undoPush();
  [..._selectedFieldIds].forEach(id => {
    const f = _formFields.find(f => f.id === id);
    if (f) f[key] = value;
  });
  _reRenderMatrix();
  _reRenderRoutingPanel();
  _renderFieldOverlays();
}

function _formToggleRequiredMulti() {
  _undoPush();
  // Toggle to majority-opposite: if most are required, set all to not-required
  const sel = [..._selectedFieldIds].map(id => _formFields.find(f => f.id === id)).filter(Boolean);
  const reqCount = sel.filter(f => f.required).length;
  const newVal = reqCount < sel.length / 2;
  sel.forEach(f => f.required = newVal);
  const toggle = document.getElementById('fedit-req-toggle');
  if (toggle) toggle.className = 'toggle-box' + (newVal ? ' on' : '');
  _reRenderMatrix();
  _renderFieldOverlays();
}


// ─────────────────────────────────────────────────────────────────────────────
// AUTO-RENAME — strips (copy) chains, assigns Type+N labels
// ─────────────────────────────────────────────────────────────────────────────
function _formAutoRename() {
  if (!_formFields.length) return;
  _undoPush();
  // Count per type per page
  const counters = {};
  // Sort by page then top-to-bottom, left-to-right
  const sorted = [..._formFields].sort((a, b) => {
    if ((a.page||1) !== (b.page||1)) return (a.page||1) - (b.page||1);
    if (Math.abs((a.rect?.y||0) - (b.rect?.y||0)) > 8) return (a.rect?.y||0) - (b.rect?.y||0);
    return (a.rect?.x||0) - (b.rect?.x||0);
  });
  sorted.forEach(field => {
    const type = field.type || 'text';
    const label = {
      text:'Text', date:'Date', number:'Number', checkbox:'Checkbox',
      signature:'Signature', textarea:'Textarea', review:'Review', doc_ref:'DocRef'
    }[type] || type.charAt(0).toUpperCase() + type.slice(1);
    counters[type] = (counters[type] || 0) + 1;
    // Update in _formFields (sorted is a copy of refs, same objects)
    field.label = `${label} ${counters[type]}`;
  });
  _formMarkDirty();
  _renderFieldOverlays();
  _reRenderMatrix();
  cadToast(`Renamed ${_formFields.length} fields`, 'info');
}

function _formRevealField(fieldId) {
  const field = _formFields.find(f => f.id === fieldId);
  if (!field) return;
  const fieldPage = field.page || 1;
  if (fieldPage !== _pdfPage) {
    _pdfPage = fieldPage;
    _updatePageIndicator();
    _renderPdfPage(_pdfStartPage + _pdfPage - 1).then(() => _highlightAndScrollToField(fieldId, field));
  } else {
    _highlightAndScrollToField(fieldId, field);
  }
}

function _highlightAndScrollToField(fieldId, field) {
  _highlightFieldRect(fieldId);
  const wrap = document.getElementById('form-canvas-wrap');
  if (!wrap || !field?.rect) return;
  const rectY = field.rect.y * _pdfScale;
  const rectX = field.rect.x * _pdfScale;
  wrap.scrollTo({ top: Math.max(0, 24 + rectY - wrap.clientHeight/2), left: Math.max(0, rectX - wrap.clientWidth/2), behavior:'smooth' });
}

// Marquee + outer SVG overrides
// NOTE: _orig* must be captured BEFORE the overrides are defined.
// We use const arrow functions (not `function` declarations) for the overrides
// because `function` declarations are hoisted — meaning by the time the `const`
// capture lines execute, a hoisted `function _formSvgMouseMove` would already
// have replaced the original, making _origSvgMouseMove === the new override and
// causing infinite recursion (RangeError: Maximum call stack size exceeded).
const _origSvgMouseDown = _formSvgMouseDown;
const _origSvgMouseMove = _formSvgMouseMove;
const _origSvgMouseUp   = _formSvgMouseUp;

// Override: adds marquee-select on empty-canvas mousedown (select mode only)
const _formSvgMouseDownOverride = (event) => {
  if (_formMode === 'select') {
    const group = event.target.closest('.field-rect-group');
    if (group && event.shiftKey && !event.ctrlKey && !event.metaKey) {
      // Shift+click on field = additive toggle selection only (no drag intent yet)
      // Fall through to _origSvgMouseDown so drag can still be initiated
      const fid = group.dataset.fieldId;
      _selectedFieldIds.has(fid) ? _selectedFieldIds.delete(fid) : _selectedFieldIds.add(fid);
      _formUpdateSelectionUI(); _renderFieldOverlays();
      // DO NOT return — fall through so _origSvgMouseDown sets up _svgGroupDrag
    }
    if (!group) {
      const svg = document.getElementById('form-field-overlay');
      const svgRect = svg?.getBoundingClientRect();
      if (!svgRect) return;
      const mx = event.clientX - svgRect.left, my = event.clientY - svgRect.top;
      // Do NOT clear here — clear only on mouseup if no drag occurred (prevents wiping marquee result)
      _marqueeDrag = { startX:mx, startY:my, active:true, shiftKey:event.shiftKey, svg, svgRect };
      const mr = document.createElementNS('http://www.w3.org/2000/svg','rect');
      mr.id='form-marquee-rect';
      mr.setAttribute('x',mx); mr.setAttribute('y',my); mr.setAttribute('width',0); mr.setAttribute('height',0);
      mr.setAttribute('fill','rgba(79,142,247,.10)'); mr.setAttribute('stroke','rgba(79,142,247,.9)');
      mr.setAttribute('stroke-width','1.5'); mr.setAttribute('stroke-dasharray','4 3');
      mr.style.pointerEvents='none'; svg.appendChild(mr);
      // Attach to document so fast mouse movement outside SVG bounds still tracks
      document.addEventListener('mousemove', _marqueeMouseMove);
      document.addEventListener('mouseup',   _marqueeMouseUp, { once: true });
      event.preventDefault(); return;
    }
  }
  _origSvgMouseDown(event);
};

// Standalone document-level marquee move handler (tracks outside SVG bounds)
function _marqueeMouseMove(event) {
  if (!_marqueeDrag?.active) return;
  const svgRect = _marqueeDrag.svgRect || _marqueeDrag.svg?.getBoundingClientRect();
  if (!svgRect) return;
  const mx = event.clientX - svgRect.left, my = event.clientY - svgRect.top;
  const mr = document.getElementById('form-marquee-rect');
  if (mr) {
    const x=Math.min(mx,_marqueeDrag.startX), y=Math.min(my,_marqueeDrag.startY);
    const mw=Math.abs(mx-_marqueeDrag.startX), mh=Math.abs(my-_marqueeDrag.startY);
    mr.setAttribute('x',x); mr.setAttribute('y',y);
    mr.setAttribute('width',mw); mr.setAttribute('height',mh);

    // Live highlight: update _selectedFieldIds as marquee moves
    const sx=x/_pdfScale, sy=y/_pdfScale, ex=(x+mw)/_pdfScale, ey=(y+mh)/_pdfScale;
    if (!_marqueeDrag.shiftKey) _selectedFieldIds.clear();
    _formFields.filter(f=>(f.page||1)===_pdfPage).forEach(f => {
      const r=f.rect;
      if (r.x<ex && r.x+r.w>sx && r.y<ey && r.y+r.h>sy) _selectedFieldIds.add(f.id);
      else if (!_marqueeDrag.shiftKey) _selectedFieldIds.delete(f.id);
    });
    _renderFieldOverlays();
    // Re-append marquee rect (renderFieldOverlays wipes SVG)
    const svg = _marqueeDrag.svg || document.getElementById('form-field-overlay');
    const freshMr = document.getElementById('form-marquee-rect');
    if (!freshMr && svg) {
      const nr = document.createElementNS('http://www.w3.org/2000/svg','rect');
      nr.id='form-marquee-rect';
      nr.setAttribute('x',x); nr.setAttribute('y',y);
      nr.setAttribute('width',mw); nr.setAttribute('height',mh);
      nr.setAttribute('fill','rgba(79,142,247,.10)'); nr.setAttribute('stroke','rgba(79,142,247,.9)');
      nr.setAttribute('stroke-width','1.5'); nr.setAttribute('stroke-dasharray','4 3');
      nr.style.pointerEvents='none'; svg.appendChild(nr);
    }
  }
}

// Override: SVG mousemove — delegates to standalone handler or original
const _formSvgMouseMoveOverride = (event) => {
  if (_marqueeDrag?.active) { _marqueeMouseMove(event); return; }
  _origSvgMouseMove(event);
};

// Standalone document-level marquee commit (fires even if cursor left SVG)
function _marqueeMouseUp(event) {
  if (!_marqueeDrag?.active) return;
  document.removeEventListener('mousemove', _marqueeMouseMove);
  const svgRect = _marqueeDrag.svgRect || _marqueeDrag.svg?.getBoundingClientRect();
  document.getElementById('form-marquee-rect')?.remove();
  if (svgRect) {
    const mx=event.clientX-svgRect.left, my=event.clientY-svgRect.top;
    const sx=Math.min(mx,_marqueeDrag.startX)/_pdfScale, sy=Math.min(my,_marqueeDrag.startY)/_pdfScale;
    const ex=Math.max(mx,_marqueeDrag.startX)/_pdfScale, ey=Math.max(my,_marqueeDrag.startY)/_pdfScale;
    if ((ex-sx)>8/_pdfScale && (ey-sy)>8/_pdfScale) {
      if (!_marqueeDrag.shiftKey) _selectedFieldIds.clear();
      _formFields.filter(f=>(f.page||1)===_pdfPage).forEach(f => {
        const r=f.rect;
        if (r.x<ex && r.x+r.w>sx && r.y<ey && r.y+r.h>sy) _selectedFieldIds.add(f.id);
      });
    } else {
      if (!_marqueeDrag.shiftKey) _selectedFieldIds.clear();
    }
  }
  _marqueeDrag = null;
  _formUpdateSelectionUI();
  _renderFieldOverlays();
}

// Override: SVG mouseup — delegates to standalone handler or original
const _formSvgMouseUpOverride = (event) => {
  if (_marqueeDrag?.active) { _marqueeMouseUp(event); return; }
  _origSvgMouseUp(event);
};

// Expose overrides globally so SVG onmousedown/move/up="..." attributes resolve them.
window._formSvgMouseDownOverride = _formSvgMouseDownOverride;
window._formSvgMouseMoveOverride = _formSvgMouseMoveOverride;
window._formSvgMouseUpOverride   = _formSvgMouseUpOverride;

function _formArrange(op) {
  _undoPush();
  const fields = [..._selectedFieldIds].map(id=>_formFields.find(f=>f.id===id)).filter(Boolean);
  if (fields.length < 2) return;
  const rects = fields.map(f => ({ f, r:f.rect }));
  switch(op) {
    case 'align-left':   { const v=Math.min(...rects.map(({r})=>r.x));         rects.forEach(({f})=>{f.rect.x=v;}); break; }
    case 'align-right':  { const v=Math.max(...rects.map(({r})=>r.x+r.w));     rects.forEach(({f,r})=>{f.rect.x=v-r.w;}); break; }
    case 'align-top':    { const v=Math.min(...rects.map(({r})=>r.y));         rects.forEach(({f})=>{f.rect.y=v;}); break; }
    case 'align-bottom': { const v=Math.max(...rects.map(({r})=>r.y+r.h));     rects.forEach(({f,r})=>{f.rect.y=v-r.h;}); break; }
    case 'center-h': { const minX=Math.min(...rects.map(({r})=>r.x)), maxX=Math.max(...rects.map(({r})=>r.x+r.w)), mid=(minX+maxX)/2; rects.forEach(({f,r})=>{f.rect.x=mid-r.w/2;}); break; }
    case 'center-v': { const minY=Math.min(...rects.map(({r})=>r.y)), maxY=Math.max(...rects.map(({r})=>r.y+r.h)), mid=(minY+maxY)/2; rects.forEach(({f,r})=>{f.rect.y=mid-r.h/2;}); break; }
    case 'dist-h': {
      rects.sort((a,b)=>a.r.x-b.r.x);
      const totalW=rects.reduce((s,{r})=>s+r.w,0), span=rects.at(-1).r.x+rects.at(-1).r.w-rects[0].r.x, gap=(span-totalW)/(rects.length-1);
      let cur=rects[0].r.x+rects[0].r.w;
      for(let i=1;i<rects.length-1;i++){ rects[i].f.rect.x=cur+gap; cur=rects[i].f.rect.x+rects[i].r.w; } break;
    }
    case 'dist-v': {
      rects.sort((a,b)=>a.r.y-b.r.y);
      const totalH=rects.reduce((s,{r})=>s+r.h,0), span=rects.at(-1).r.y+rects.at(-1).r.h-rects[0].r.y, gap=(span-totalH)/(rects.length-1);
      let cur=rects[0].r.y+rects[0].r.h;
      for(let i=1;i<rects.length-1;i++){ rects[i].f.rect.y=cur+gap; cur=rects[i].f.rect.y+rects[i].r.h; } break;
    }
  }
  _renderFieldOverlays();
  cadToast(`Arranged: ${op.replace('-',' ')}`, 'info');
}

document.addEventListener('keydown', e => {
  if (e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
  if (!document.getElementById('form-field-overlay')) return;
  if ((e.key==='z'||e.key==='Z') && (e.ctrlKey||e.metaKey)) { e.preventDefault(); _undoPop(); return; }
  if (e.key==='p'||e.key==='P') { _formTogglePreview(); return; }
  if (e.key==='s'||e.key==='S') _formSetMode('select');
  if (e.key==='d'||e.key==='D') _formSetMode('draw');
  if (e.key==='Escape') _formClearSelection();
  if ((e.key==='Delete'||e.key==='Backspace') && _selectedFieldIds.size>0) {
    if (!confirm(`Delete ${_selectedFieldIds.size} selected field(s)?`)) return;
    _undoPush();
    _selectedFieldIds.forEach(id => { _formFields = _formFields.filter(f=>f.id!==id); });
    _selectedFieldIds.clear(); _formUpdateSelectionUI(); _renderFieldOverlays();
    _reRenderMatrix();
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// H/W SIZE WIDGET
// ─────────────────────────────────────────────────────────────────────────────

const HW_STEP_IN = 0.1; // inches equivalent in PDF pts (72pt = 1in; we use pts directly)

function _updateHWWidget() {
  const widget = document.getElementById('form-hw-widget');
  const hEl    = document.getElementById('form-hw-h');
  const wEl    = document.getElementById('form-hw-w');
  if (!widget || !hEl || !wEl) return;
  const sel = [..._selectedFieldIds].map(id => _formFields.find(f => f.id === id)).filter(Boolean);
  if (!sel.length) { widget.style.display = 'none'; return; }
  widget.style.display = 'flex';
  // Show bounding box of selection in inches (PDF pts / 72)
  const minX = Math.min(...sel.map(f => f.rect.x));
  const minY = Math.min(...sel.map(f => f.rect.y));
  const maxX = Math.max(...sel.map(f => f.rect.x + f.rect.w));
  const maxY = Math.max(...sel.map(f => f.rect.y + f.rect.h));
  hEl.value = ((maxY - minY) / 72).toFixed(2);
  wEl.value = ((maxX - minX) / 72).toFixed(2);
}

function _formHWChange(dim, valIn) {
  if (!isFinite(valIn) || valIn <= 0) return;
  _undoPush();
  const valPt = valIn * 72;
  const sel = [..._selectedFieldIds].map(id => _formFields.find(f => f.id === id)).filter(Boolean);
  if (!sel.length) return;
  if (sel.length === 1) {
    // Single field: set exact dimension
    if (dim === 'h') sel[0].rect.h = valPt;
    else             sel[0].rect.w = valPt;
  } else {
    // Multi: scale all proportionally to fit new bounding box
    const minX = Math.min(...sel.map(f => f.rect.x));
    const minY = Math.min(...sel.map(f => f.rect.y));
    const maxX = Math.max(...sel.map(f => f.rect.x + f.rect.w));
    const maxY = Math.max(...sel.map(f => f.rect.y + f.rect.h));
    const oldPt = dim === 'h' ? (maxY - minY) : (maxX - minX);
    if (oldPt <= 0) return;
    const scale = valPt / oldPt;
    sel.forEach(f => {
      if (dim === 'h') { f.rect.y = minY + (f.rect.y - minY) * scale; f.rect.h *= scale; }
      else             { f.rect.x = minX + (f.rect.x - minX) * scale; f.rect.w *= scale; }
    });
  }
  _renderFieldOverlays();
  _updateHWWidget();
}

function _formHWStep(dim, dir) {
  const el = document.getElementById(dim === 'h' ? 'form-hw-h' : 'form-hw-w');
  if (!el) return;
  const cur = parseFloat(el.value) || 0;
  _formHWChange(dim, Math.max(0.05, cur + dir * HW_STEP_IN));
  _updateHWWidget();
}

// ─────────────────────────────────────────────────────────────────────────────
// RESIZE HANDLES — 4-point (T/B/L/R) on selection bounding box
// ─────────────────────────────────────────────────────────────────────────────

let _resizeDrag = null;
// { edge: 't'|'b'|'l'|'r', startMouse, startBound, fields: [{field,origRect}] }

// _renderResizeHandles — now inlined inside _renderFieldOverlays SVG string
function _renderResizeHandles() { /* no-op: handles rendered inline in _renderFieldOverlays */ }

function _resizeHandleMouseDown(event, edge) {
  event.stopPropagation(); event.preventDefault();
  const svg     = document.getElementById('form-field-overlay');
  const svgRect = svg.getBoundingClientRect();
  const sel = [..._selectedFieldIds].map(id => _formFields.find(f => f.id === id)).filter(Boolean);
  if (!sel.length) return;
  _undoPush();
  _resizeDrag = {
    edge,
    startMouse: edge === 't' || edge === 'b'
      ? event.clientY - svgRect.top
      : event.clientX - svgRect.left,
    startBound: {
      minX: Math.min(...sel.map(f => f.rect.x)),
      minY: Math.min(...sel.map(f => f.rect.y)),
      maxX: Math.max(...sel.map(f => f.rect.x + f.rect.w)),
      maxY: Math.max(...sel.map(f => f.rect.y + f.rect.h)),
    },
    fields: sel.map(f => ({ field: f, origRect: { ...f.rect } })),
  };
  document.addEventListener('mousemove', _resizeMouseMove);
  document.addEventListener('mouseup',   _resizeMouseUp, { once: true });
}

function _resizeMouseMove(event) {
  if (!_resizeDrag) return;
  const svg     = document.getElementById('form-field-overlay');
  const svgRect = svg?.getBoundingClientRect(); if (!svgRect) return;
  const { edge, startMouse, startBound, fields } = _resizeDrag;
  const isV = edge === 't' || edge === 'b';
  const cur = isV ? event.clientY - svgRect.top : event.clientX - svgRect.left;
  const delta = (cur - startMouse) / _pdfScale; // convert px → PDF pts

  const bW = startBound.maxX - startBound.minX;
  const bH = startBound.maxY - startBound.minY;

  fields.forEach(({ field, origRect }) => {
    const r = field.rect;
    // Fractional position within original bounding box
    const relX = bW > 0 ? (origRect.x - startBound.minX) / bW : 0;
    const relY = bH > 0 ? (origRect.y - startBound.minY) / bH : 0;
    const relW = bW > 0 ? origRect.w / bW : 1;
    const relH = bH > 0 ? origRect.h / bH : 1;

    if (edge === 'b') {
      const newH = Math.max(5, bH + delta);
      const scale = newH / Math.max(bH, 0.001);
      r.y = startBound.minY + relY * bH * scale;
      r.h = Math.max(4, origRect.h * scale);
    } else if (edge === 't') {
      const newH = Math.max(5, bH - delta);
      const scale = newH / Math.max(bH, 0.001);
      const newMinY = startBound.maxY - newH;
      r.y = newMinY + relY * bH * scale;
      r.h = Math.max(4, origRect.h * scale);
    } else if (edge === 'r') {
      const newW = Math.max(5, bW + delta);
      const scale = newW / Math.max(bW, 0.001);
      r.x = startBound.minX + relX * bW * scale;
      r.w = Math.max(4, origRect.w * scale);
    } else if (edge === 'l') {
      const newW = Math.max(5, bW - delta);
      const scale = newW / Math.max(bW, 0.001);
      const newMinX = startBound.maxX - newW;
      r.x = newMinX + relX * bW * scale;
      r.w = Math.max(4, origRect.w * scale);
    }
  });

  _renderFieldOverlays();
  _updateHWWidget();
}

function _resizeMouseUp() {
  _resizeDrag = null;
  document.removeEventListener('mousemove', _resizeMouseMove);
  _renderFieldOverlays();
  _updateHWWidget();
}


// ─────────────────────────────────────────────────────────────────────────────
// FORM CoC PANEL — toggle, load, render
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// DEV TOOL: Clear History
// Deletes all coc_events for this form and replaces with a single clean entry.
// Useful for iterating through lifecycle during development.
// ─────────────────────────────────────────────────────────────────────────────
async function _formClearHistory(formId) {
  if (!formId) return;
  const form = _selectedForm;
  if (!form) return;

  const confirmed = confirm(
    `[DEV] Clear all history for "${form.source_name}"?\n\n` +
    `This will:\n` +
    `• Delete all CoC / activity events\n` +
    `• Reset state to "draft" and version to "0.1.0"\n` +
    `• Add a single "Form import complete" entry\n\n` +
    `This cannot be undone.`
  );
  if (!confirmed) return;

  cadToast('Clearing history…', 'info');

  try {
    // 1. Delete all coc_events for this form
    const token = await Auth.getToken();
    await fetch(
      `${SUPA_URL}/rest/v1/coc_events?entity_id=eq.${formId}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        }
      }
    );

    // 2. Reset form fields — bypass _formSave to avoid triggering CoC auto-writes
    form.state                = 'draft';
    form.version              = '0.1.0';
    form.reviewed_by          = [];
    form.pending_reviewer_ids = [];
    form.approved_by          = null;
    form.review_note          = null;
    form.released_at          = null;
    form.archived_at          = null;

    // Patch DB directly — don't go through _formSave (avoids auto-transition CoC writes)
    await API.patch(`workflow_form_definitions?id=eq.${formId}`, {
      state:                'draft',
      version:              '0.1.0',
      reviewed_by:          [],
      pending_reviewer_ids: [],
      approved_by:          null,
      review_note:          null,
      released_at:          null,
      archived_at:          null,
    }).catch(e => console.warn('[devTool] PATCH failed:', e.message));

    // 3. Write single clean baseline entry directly to DB
    await API.post('coc_events', {
      firm_id:           window.FIRM_ID || FIRM_ID_CAD,
      entity_id:         formId,
      entity_type:       'workflow_form_definition',
      event_type:        'form.state_changed',
      event_notes:       JSON.stringify({ from:'import', to:'draft', version:'0.1.0', note:'Form import complete' }),
      actor_name:        window.CURRENT_USER?.name || 'System',
      actor_resource_id: window.CURRENT_USER?.resource_id || null,
      event_class:       'form',
      severity:          'info',
      occurred_at:       new Date().toISOString(),
      metadata:          { from:'import', to:'draft', version:'0.1.0', note:'Form import complete' },
    }).catch(e => console.warn('[devTool] baseline CoC write failed:', e.message));

    cadToast('[DEV] History cleared — reset to draft 0.1.0', 'success');

    // Update local state and refresh UI
    _formDirty = false;
    _formUpdateSaveBtn();
    const el = document.getElementById('cad-content');
    if (el) renderFormsTab(el);

  } catch(e) {
    cadToast('[DEV] Clear failed: ' + e.message, 'error');
    console.error('[devTool] clear history failed:', e);
  }
}

function _formToggleCoC() {
  const panel  = document.getElementById('form-coc-panel');
  const cocBtn = document.getElementById('form-coc-btn');

  // HTML form — panel not in DOM, use floating overlay instead
  if (!panel) {
    var existing = document.getElementById('form-coc-float');
    if (existing) { existing.remove(); if (cocBtn) { cocBtn.style.color=''; cocBtn.style.background=''; } return; }
    var float = document.createElement('div');
    float.id = 'form-coc-float';
    float.style.cssText = 'position:fixed;top:80px;right:20px;width:520px;max-height:70vh;' +
      'background:var(--bg,#0d1017);border:1px solid var(--border,#1e2535);border-radius:8px;' +
      'z-index:8000;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.5)';
    float.innerHTML =
      '<div style="padding:10px 14px;border-bottom:1px solid var(--border,#1e2535);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">' +
        '<span style="font-family:Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--cad,#00c9c9)">Form History</span>' +
        '<button onclick="_formCoCFloatClose()" ' +
          'style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;line-height:1;padding:0">&#x2715;</button>' +
      '</div>' +
      '<div id="form-coc-float-body" style="flex:1;overflow-y:auto;padding:10px 14px">' +
        '<div style="font-size:12px;color:var(--muted);text-align:center;padding:16px;font-family:Arial,sans-serif">Loading…</div>' +
      '</div>';
    document.body.appendChild(float);
    if (cocBtn) { cocBtn.style.color='var(--cad)'; cocBtn.style.background='var(--cad-dim,rgba(0,201,201,.1))'; }
    // Load unified history: form CoC events + BIST runs + certs
    if (_selectedForm?.id) {
      (async function() {
        var bodyEl = document.getElementById('form-coc-float-body');
        try {
          var firmId = (typeof FIRM_ID_CAD !== 'undefined') ? FIRM_ID_CAD : null;
          // 1. Form CoC events
          var cocRows = await API.get('coc_events?entity_id=eq.'+_selectedForm.id+'&order=occurred_at.desc&limit=100').catch(function(){return[];});
          // 2. Resolve companion template via step_id
          var tmplId = null;
          if (_selectedForm.step_id) {
            var stepRows = await API.get('workflow_template_steps?id=eq.'+_selectedForm.step_id+'&select=template_id').catch(function(){return[];});
            tmplId = stepRows?.[0]?.template_id || null;
          }
          var bistRows = [];
          if (tmplId && firmId) {
            // 3. Certs
            var certRows = await API.get('bist_certificates?firm_id=eq.'+firmId+'&template_id=eq.'+tmplId+'&order=issued_at.desc&select=id,certificate_number,status,issued_at').catch(function(){return[];});
            // 4. Scripts → runs
            var scriptRows = await API.get('bist_test_scripts?firm_id=eq.'+firmId+'&template_id=eq.'+tmplId+'&select=id,name').catch(function(){return[];});
            if (scriptRows.length) {
              var sids = scriptRows.map(function(s){return s.id;}).join(',');
              var scriptMap = {};
              scriptRows.forEach(function(s){scriptMap[s.id]=s.name;});
              var runRows = await API.get('bist_runs?firm_id=eq.'+firmId+'&script_id=in.('+sids+')&order=run_at.desc&limit=50&select=id,status,run_at,script_id,steps_passed,steps_failed').catch(function(){return[];});
              var tmplVer = (_selectedForm?.version)||'';
              runRows.forEach(function(r){
                bistRows.push({ ts: r.run_at, type:'run', version:tmplVer, status:r.status, label:(r.status==='passed'?'Test passed':'Test failed')+' — '+(scriptMap[r.script_id]||'Script'), who:'BIST Engine' });
              });
            }
            certRows.forEach(function(c){
              bistRows.push({ ts: c.issued_at, type:'cert', status:c.status, version:'', label: c.status==='valid'?'Certified':'Cert invalidated', who: c.certificate_number });
            });
          }
          // Merge and sort all rows chronologically ascending
          var evtLabel = {'form.created':'Created','form.saved':'Saved','form.released':'Released','form.archived':'Archived','form.state_changed':'State Changed'};
          var evtColor = {'form.created':'var(--cad)','form.saved':'rgba(0,201,201,.6)','form.released':'var(--green)','form.archived':'var(--muted)','form.state_changed':'var(--accent)'};
          var allRows = [];
          (cocRows||[]).forEach(function(e){
            var meta = e.metadata || {};
            allRows.push({ ts: e.occurred_at||e.created_at, version: meta.version||'', label: evtLabel[e.event_type]||e.event_type.replace('form.','').replace(/_/g,' '), who: e.actor_name||'System', color: evtColor[e.event_type]||'var(--cad)' });
          });
          bistRows.forEach(function(r){
            allRows.push({ ts: r.ts, version: r.version||'', label: r.label, who: r.who, color: r.type==='cert'?(r.status==='valid'?'var(--green)':'var(--muted)'):'var(--amber)' });
          });
          allRows.sort(function(a,b){ return a.ts < b.ts ? -1 : 1; });
          if (!allRows.length) {
            bodyEl.innerHTML = '<div style="font-size:12px;color:var(--muted);text-align:center;padding:16px;font-family:Arial,sans-serif">No history yet.</div>';
            return;
          }
          bodyEl.innerHTML =
            '<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px">' +
            '<thead><tr>' +
              '<th style="text-align:left;padding:4px 6px;border-bottom:1px solid var(--border,#1e2535);color:var(--muted);font-weight:500;font-size:10px;letter-spacing:.06em;text-transform:uppercase">Version</th>' +
              '<th style="text-align:left;padding:4px 6px;border-bottom:1px solid var(--border,#1e2535);color:var(--muted);font-weight:500;font-size:10px;letter-spacing:.06em;text-transform:uppercase">Event</th>' +
              '<th style="text-align:left;padding:4px 6px;border-bottom:1px solid var(--border,#1e2535);color:var(--muted);font-weight:500;font-size:10px;letter-spacing:.06em;text-transform:uppercase">User / Reference</th>' +
              '<th style="text-align:left;padding:4px 6px;border-bottom:1px solid var(--border,#1e2535);color:var(--muted);font-weight:500;font-size:10px;letter-spacing:.06em;text-transform:uppercase">Date / Time</th>' +
            '</tr></thead><tbody>' +
            allRows.map(function(r) {
              var ts = (r.ts||'').slice(0,16).replace('T',' ');
              return '<tr style="border-bottom:0.5px solid var(--border,#1e2535)">' +
                '<td style="padding:5px 6px;color:var(--muted);font-family:monospace;font-size:10px;white-space:nowrap">'+escHtml(r.version||'—')+'</td>' +
                '<td style="padding:5px 6px;color:'+r.color+';font-weight:600;white-space:nowrap">'+escHtml(r.label)+'</td>' +
                '<td style="padding:5px 6px;color:var(--text2);white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis">'+escHtml(r.who)+'</td>' +
                '<td style="padding:5px 6px;color:var(--muted);font-family:monospace;font-size:10px;white-space:nowrap">'+escHtml(ts)+'</td>' +
              '</tr>';
            }).join('') +
            '</tbody></table>';
        } catch(e) {
          if (bodyEl) bodyEl.innerHTML = '<div style="font-size:12px;color:var(--red);padding:12px;font-family:Arial,sans-serif">Failed to load history.</div>';
        }
      })();
    }
    return;
  }

  const opening = !panel.classList.contains('open');
  panel.classList.toggle('open');
  if (cocBtn) {
    cocBtn.style.color       = opening ? 'var(--cad)'      : '';
    cocBtn.style.borderColor = opening ? 'var(--cad-wire)' : '';
    cocBtn.style.background  = opening ? 'var(--cad-dim)'  : '';
  }
  if (opening && _selectedForm?.id) _formLoadCoC(_selectedForm.id);

  // Wire resize drag on first open
  if (opening) _formCoCWireResize();
}

async function _formLoadCoC(formId) {
  const bodyEl = document.getElementById('form-coc-body');
  if (!bodyEl) return;
  bodyEl.innerHTML = '<div style="font-size:12px;color:var(--muted);text-align:center;padding-top:24px;font-family:Arial,sans-serif">Loading…</div>';
  try {
    const rows = await API.get(
      `coc_events?entity_id=eq.${formId}&order=created_at.desc&limit=100`
    ).catch(() => []) || [];
    _formCoCRender(rows);
  } catch(e) {
    bodyEl.innerHTML = '<div style="font-size:12px;color:var(--red);padding:12px;font-family:Arial,sans-serif">Failed to load history.</div>';
  }
}

function _formCoCRender(rows) {
  const bodyEl = document.getElementById('form-coc-body');
  if (!bodyEl) return;

  if (!rows.length) {
    bodyEl.innerHTML = '<div style="font-size:12px;color:var(--muted);text-align:center;padding-top:24px;font-family:Arial,sans-serif">No history yet.</div>';
    return;
  }

  const evtColor = {
    'form.released':       'var(--green)',
    'form.archived':       'var(--muted)',
    'form.state_changed':  'var(--accent)',
    'form.saved':          'var(--cad)',
    'form.field_modified': 'var(--text2)',
  };
  const evtLabel = {
    'form.released':       'Released',
    'form.archived':       'Archived',
    'form.state_changed':  'State Changed',
    'form.saved':          'Saved',
    'form.field_modified': 'Field Modified',
  };

  // Table view: Event · User · Date/Time
  var evtColorMap = evtColor;
  var evtLabelMap = evtLabel;
  bodyEl.innerHTML =
    '<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px">' +
    '<thead><tr>' +
      '<th style="text-align:left;padding:4px 6px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:500;font-size:10px;letter-spacing:.06em;text-transform:uppercase">Event</th>' +
      '<th style="text-align:left;padding:4px 6px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:500;font-size:10px;letter-spacing:.06em;text-transform:uppercase">User</th>' +
      '<th style="text-align:left;padding:4px 6px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:500;font-size:10px;letter-spacing:.06em;text-transform:uppercase">Date / Time</th>' +
    '</tr></thead><tbody>' +
    rows.map(function(e) {
      var color = evtColorMap[e.event_type] || 'var(--cad)';
      var label = evtLabelMap[e.event_type] || e.event_type.replace('form.','').replace(/_/g,' ');
      var who   = escHtml(e.actor_name || 'System');
      var ts    = (e.occurred_at || e.created_at || '').slice(0,16).replace('T',' ');
      return '<tr style="border-bottom:0.5px solid var(--border)">' +
        '<td style="padding:5px 6px;color:'+color+';font-weight:600;white-space:nowrap">'+escHtml(label)+'</td>' +
        '<td style="padding:5px 6px;color:var(--text2);white-space:nowrap">'+who+'</td>' +
        '<td style="padding:5px 6px;color:var(--muted);font-family:monospace;font-size:10px;white-space:nowrap">'+escHtml(ts)+'</td>' +
      '</tr>';
    }).join('') +
    '</tbody></table>';
}

// Refresh CoC if panel is open (called after saves/state changes)
function _formCoCFloatClose() {
  var e = document.getElementById('form-coc-float');
  if (e) e.remove();
  var b = document.getElementById('form-coc-btn');
  if (b) { b.style.color = ''; b.style.background = ''; }
}

function _formRefreshCoCIfOpen() {
  if (document.getElementById('form-coc-panel')?.classList.contains('open') && _selectedForm?.id) {
    _formLoadCoC(_selectedForm.id);
  }
}

// Resize drag for CoC panel
function _formCoCWireResize() {
  const handle = document.getElementById('form-coc-resize');
  const panel  = document.getElementById('form-coc-panel');
  if (!handle || !panel || handle._wired) return;
  handle._wired = true;
  handle.addEventListener('mousedown', ev => {
    ev.preventDefault();
    handle.classList.add('dragging');
    const startX = ev.clientX, startW = panel.offsetWidth;
    const onMove = e => { panel.style.width = Math.max(220, Math.min(600, startW + startX - e.clientX)) + 'px'; };
    const onUp   = () => { handle.classList.remove('dragging'); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// CANVAS SCROLL-WHEEL ZOOM (Ctrl+scroll, canvas only)
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('wheel', function _formWheelZoom(e) {
  const wrap = document.getElementById('form-canvas-wrap');
  if (!wrap || !wrap.contains(e.target)) return;
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.8 : 1.25;
  _formSetZoom(Math.max(0.3, Math.min(4.0, _pdfScale * delta)));
}, { passive: false });


// ─────────────────────────────────────────────────────────────────────────────
// FORM PREVIEW — inline fill mode, no DB writes
// ─────────────────────────────────────────────────────────────────────────────

function _formTogglePreview() {
  _formPreviewMode = !_formPreviewMode;
  _previewResponses = {};

  // Set active stage based on current form state so correct signature fields are active
  if (_formPreviewMode) {
    const state  = _selectedForm?.state || 'draft';
    const stages = _formGetStages();
    // Find the stage index matching the current actor role
    const roleForState = {
      'in_review':          'reviewer',
      'reviewed':           'approver',
      'approved':           'approver',
    }[state] || 'assignee';
    const matchedStage = stages.find(s => s.role === roleForState);
    _previewStage = matchedStage?.stage || 1;
  } else {
    _previewStage = 1;
  }

  const hwWgt   = document.getElementById('form-hw-widget');
  const colFlds = null;
  const colRout = null;

  if (_formPreviewMode) {
    // Enter preview — highlight preview button in rail
    _formRefreshRailMode('preview');
    if (hwWgt) hwWgt.style.display = 'none';
    // Left rail removed SE90 — no-op
    // Collapse side columns + CoC
    if (colFlds) { colFlds.style.display = 'none'; }
    if (colRout) { colRout.style.display = 'none'; }
    const cocPanel = document.getElementById('form-coc-panel');
    if (cocPanel?.classList.contains('open')) cocPanel.classList.remove('open');
    // Inject workflow/history panel then role panel
    _formShowPreviewHistoryPanel();
    _formShowRolePanel();
    _formRenderPreviewOverlay();
    // Scroll to top so the full form is visible from the beginning.
    const outerWrap = document.getElementById('form-canvas-wrap');
    if (outerWrap) outerWrap.scrollTo({ top: 0, behavior: 'instant' });
  } else {
    // ── Exit preview — clean up ALL preview DOM artifacts ────────────────────
    // 1. Remove all input overlays
    document.querySelectorAll('.form-preview-input-wrap').forEach(el => el.remove());
    document.getElementById('form-preview-container')?.remove();
    // 2. Remove stage bar, history panel, and role panel
    document.getElementById('form-preview-stagebar')?.remove();
    document.getElementById('form-preview-history-panel')?.remove();
    document.getElementById('form-preview-role-panel')?.remove();
    // 3. Remove done overlays
    document.querySelectorAll('[id^="form-preview-done"]').forEach(el => el.remove());
    const cw = document.getElementById('form-canvas-wrap');
    if (cw) cw.querySelectorAll('div[style*="position:absolute"][style*="inset:0"]').forEach(el => el.remove());
    // 4. Reset button states — handled by _formSetMode('select') below
    // 5. Restore side columns (left rail removed SE90)
    if (colFlds) { colFlds.style.display = ''; }
    if (colRout) { colRout.style.display = ''; }
    if (cw) { const firstChild = cw.firstElementChild; if (firstChild?.id === 'form-preview-stagebar') firstChild.remove(); }
    // 6. Return to select mode
    _formSetMode('select');
    _renderFieldOverlays();
  }
}

function _formGetStages() {
  // PREVIEW = Reviewer & Approver validation only. Assignee is runtime, not preview.
  const reviewOrder = ['reviewer','approver','pm','external'];
  const fromFields  = _formFields.map(f => f.role||'assignee').filter(r => r !== 'assignee');
  const fromRouting = (_formRouting?.stages||[]).map(s => s.role).filter(r => r && r !== 'assignee');
  const roles = [...new Set([...fromFields, ...fromRouting])]
    .sort((a,b) => {
      const ai = reviewOrder.indexOf(a), bi = reviewOrder.indexOf(b);
      return (ai<0?99:ai) - (bi<0?99:bi);
    });
  // If no reviewer/approver fields configured, default to a single reviewer stage
  return roles.length ? roles.map((role,i)=>({stage:i+1,role})) : [{stage:1,role:'reviewer'}];
}

function _formFieldsForStage(stageNum) {
  const stages = _formGetStages();
  const stage  = stages.find(s => s.stage === stageNum);
  if (!stage) return [];
  const pageFields = _formFields.filter(f => (f.page||1) === _pdfPage);
  // Match by explicit stage assignment first, then fall back to role
  const byStage = pageFields.filter(f => (f.stage||1) === stageNum && f.role !== 'assignee');
  if (byStage.length) return byStage;
  return pageFields.filter(f => f.role === stage.role);
}

function _formAllFieldsForStage(stageNum) {
  // All fields for this stage across ALL pages (used by Sign button)
  const stages = _formGetStages();
  const stage  = stages.find(s => s.stage === stageNum);
  if (!stage) return [];
  const byStage = _formFields.filter(f => (f.stage||1) === stageNum && f.role !== 'assignee');
  if (byStage.length) return byStage;
  return _formFields.filter(f => f.role === stage.role);
}

function _formRenderPreviewOverlay() {
  const svg = document.getElementById('form-field-overlay');
  if (!svg) return;
  // Clear SVG field boxes — preview uses HTML inputs positioned over canvas
  svg.innerHTML = '';

  // Remove old preview inputs
  document.querySelectorAll('.form-preview-input-wrap').forEach(el => el.remove());

  const maxStage = _formGetStages().length || 1;

  // ── Render field inputs over PDF canvas ──────────────────────────────────
  const canvas = document.getElementById('form-pdf-canvas');
  if (!canvas) return;

  // Overlay strategy: insert previewContainer as the NEXT SIBLING of the canvas
  // inside canvas.parentElement (the inline-block div). Since it shares the same
  // parent, top:0/left:0 aligns it exactly with the canvas with no offset math needed.
  // We force position:relative on the parent so absolute children resolve correctly.
  let previewContainer = document.getElementById('form-preview-container');
  const canvasParent = canvas.parentElement;
  canvasParent.style.position = 'relative';   // ensure it resolves as offsetParent
  const cssW = canvas.offsetWidth;
  const cssH = canvas.offsetHeight;
  if (!previewContainer) {
    previewContainer = document.createElement('div');
    previewContainer.id = 'form-preview-container';
    // Insert immediately after the canvas (before SVG overlay) so z-index works
    canvasParent.insertBefore(previewContainer, canvas.nextSibling);
  }
  previewContainer.style.cssText = [
    'position:absolute',
    'top:0',
    'left:0',
    `width:${cssW}px`,
    `height:${cssH}px`,
    'pointer-events:none',
    'overflow:visible',
    'z-index:5',
  ].join(';');

  const activeFields = _formFieldsForStage(_previewStage);
  const activeIds    = new Set(activeFields.map(f => f.id));

  _formFields.filter(f => (f.page||1) === _pdfPage).forEach(field => {
    const r = field.rect || { x:0, y:0, w:80, h:18 };
    const x = r.x * _pdfScale, y = r.y * _pdfScale;
    const w = r.w * _pdfScale, h = r.h * _pdfScale;
    const active = activeIds.has(field.id);
    const val = _previewResponses[field.id] || '';

    // Determine stage membership — assignee fields are always background (never locked)
    const isAssigneeField = field.role === 'assignee' || !field.role;
    const fieldStage = isAssigneeField ? null : _formGetStages().find(s => {
      const byStage = _formFields.filter(f => (f.stage||1) === s.stage && f.role !== 'assignee');
      if (byStage.length) return (field.stage||1) === s.stage;
      return field.role === s.role;
    });
    const fieldStageNum = fieldStage?.stage || _previewStage;
    const isCompleted   = !isAssigneeField && fieldStageNum < _previewStage;
    const isFuture      = !isAssigneeField && fieldStageNum > _previewStage;

    const fs = Math.max(8, h * 0.82);
    const BASE_STYLE = [
      'width:100%;height:100%;box-sizing:border-box',
      'background:rgba(255,255,255,.92)',
      isAssigneeField ? 'border:1.5px solid #94a3b8' : isFuture ? 'border:1.5px solid #b0bec5' : 'border:1.5px solid #3b82f6',
      'border-radius:2px',
      'color:#111',
      'font-family:Arial,sans-serif',
      `font-size:${fs}px`,
      'padding:0 4px',
      'outline:none',
    ].join(';');

    const wrap = document.createElement('div');
    wrap.className = 'form-preview-input-wrap';
    wrap.style.position  = 'absolute';
    wrap.style.left      = x + 'px';
    wrap.style.top       = y + 'px';
    wrap.style.width     = w + 'px';
    wrap.style.height    = h + 'px';
    wrap.style.boxSizing = 'border-box';
    wrap.style.overflow  = 'hidden';

    if (isCompleted) {
      // Prior stage already submitted — green tint, read-only
      wrap.style.background    = 'rgba(240,255,240,.7)';
      wrap.style.border        = '1px solid #86efac';
      wrap.style.borderRadius  = '2px';
      wrap.style.pointerEvents = 'none';
      wrap.style.display       = 'flex';
      wrap.style.alignItems    = 'center';
      wrap.style.fontSize      = fs + 'px';
      wrap.style.fontFamily    = 'Arial,sans-serif';
      wrap.style.color         = '#111';
      wrap.style.padding       = '0 4px';
      wrap.textContent         = val || '';

    } else if (field.type === 'checkbox') {
      // Checkboxes: size the wrap to match the rect height, center a small
      // checkbox inside it both horizontally and vertically so it aligns
      // with the center of each checklist line on the PDF.
      const sz = Math.max(10, Math.min(h * 0.75, 16));  // checkbox size: 10–16px
      // Vertically center within the full rect height
      const topOffset  = y + (h - sz) / 2;
      const leftOffset = x + (w - sz) / 2;
      wrap.style.top             = topOffset + 'px';
      wrap.style.left            = leftOffset + 'px';
      wrap.style.width           = sz + 'px';
      wrap.style.height          = sz + 'px';
      wrap.style.display         = 'flex';
      wrap.style.alignItems      = 'center';
      wrap.style.justifyContent  = 'center';
      wrap.style.background      = 'transparent';
      wrap.style.border          = 'none';
      wrap.style.overflow        = 'visible';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = val === 'true';
      cb.style.width         = sz + 'px';
      cb.style.height        = sz + 'px';
      cb.style.cursor        = 'pointer';
      cb.style.margin        = '0';
      cb.style.flexShrink    = '0';
      cb.style.accentColor   = '#3b82f6';
      cb.style.pointerEvents = 'auto';
      cb.addEventListener('change', () => { _previewResponses[field.id] = String(cb.checked); });
      wrap.appendChild(cb);

    } else if (field.type === 'signature') {
      wrap.style.overflow   = 'visible';
      wrap.style.zIndex     = '15';
      wrap.style.visibility = 'visible';
      _formPreviewSignatureField(wrap, field, val, w, h);

    } else if (field.type === 'review') {
      const opts   = ['','pass','fail','na'];
      const labels = {'':'— Review','pass':'✓ Pass','fail':'✗ Fail','na':'N/A'};
      const colors = {'':'#888','pass':'#16a34a','fail':'#dc2626','na':'#d97706'};
      let cur = val || '';
      wrap.style.background      = 'rgba(255,255,255,.9)';
      wrap.style.border          = '1.5px solid #3b82f6';
      wrap.style.borderRadius    = '2px';
      wrap.style.cursor          = 'pointer';
      wrap.style.display         = 'flex';
      wrap.style.alignItems      = 'center';
      wrap.style.justifyContent  = 'center';
      wrap.style.fontSize        = fs + 'px';
      wrap.style.fontFamily      = 'Arial,sans-serif';
      wrap.style.fontWeight      = '700';
      wrap.style.color           = colors[cur];
      wrap.textContent           = labels[cur];
      wrap.addEventListener('click', () => {
        cur = opts[(opts.indexOf(cur)+1) % opts.length];
        _previewResponses[field.id] = cur;
        wrap.textContent = labels[cur];
        wrap.style.color = colors[cur];
      });

    } else if (field.type === 'textarea') {
      const ta = document.createElement('textarea');
      ta.value = val;
      ta.style.cssText = `width:100%;height:100%;box-sizing:border-box;resize:none;
        background:rgba(255,255,255,.9);border:1.5px solid #3b82f6;border-radius:2px;
        color:#111;font-family:Arial,sans-serif;font-size:${fs}px;line-height:1.2;
        padding:2px 4px;outline:none;`;
      ta.addEventListener('input', () => { _previewResponses[field.id] = ta.value; });
      wrap.appendChild(ta);

    } else if (field.type === 'attendees') {
      wrap.style.setProperty('overflow', 'visible', 'important');
      wrap.style.zIndex     = '20';
      wrap.style.visibility = 'visible';
      _formPreviewAttendeesField(wrap, field, val, h, fs);

    } else if (field.type === 'date') {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.placeholder = 'MM/DD/YYYY';
      inp.maxLength = 10;
      inp.value = val;
      // Clamp date font — small date boxes next to signatures should stay readable not huge
      const dateStyle = BASE_STYLE.replace(`font-size:${fs}px`, `font-size:${Math.min(fs,16)}px`);
      inp.style.cssText = dateStyle;
      inp.addEventListener('input', () => {
        // Reformat: strip non-digits, insert slashes at positions 2 and 4
        const cursor = inp.selectionStart;
        const digits = inp.value.replace(/\D/g, '').slice(0, 8);
        let formatted = digits;
        if (digits.length > 4) formatted = digits.slice(0,2) + '/' + digits.slice(2,4) + '/' + digits.slice(4);
        else if (digits.length > 2) formatted = digits.slice(0,2) + '/' + digits.slice(2);
        inp.value = formatted;
        _previewResponses[field.id] = formatted;
      });
      wrap.appendChild(inp);

    } else {
      // text / number
      const inp = document.createElement('input');
      inp.type = field.type === 'number' ? 'number' : 'text';
      inp.addEventListener('input', () => { _previewResponses[field.id] = inp.value; });
      inp.value = val;
      inp.setAttribute('style', BASE_STYLE);
      wrap.appendChild(inp);
    }

    wrap.style.pointerEvents = 'auto';
    previewContainer.appendChild(wrap);
  });
}

function _formPreviewSignatureField(wrap, field, val, w, h) {
  let mode = 'type';
  const fs = Math.min(Math.max(12, h * 0.85), 48); // fill the field height
  wrap.style.background    = 'rgba(255,255,255,.9)';
  wrap.style.border        = '1.5px solid #3b82f6';
  wrap.style.borderRadius  = '3px';
  wrap.style.display       = 'flex';
  wrap.style.alignItems    = 'center';
  // NOTE: do NOT set position:relative here — wrap is already position:absolute
  // set by _formRenderPreviewOverlay. Overriding it breaks placement.
  // Keep overflow:visible (set by caller) so full-height cursive renders

  const renderSig = () => {
    wrap.innerHTML = '';
    if (mode === 'type') {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = val || (_previewResponses[field.id] || '');
      inp.placeholder = field.label || 'Sign here…';
      // setAttribute bypasses the global !important font rule
      inp.setAttribute('style',
        `width:100%;height:${h}px;background:transparent;border:none;outline:none;` +
        `font-family:'Dancing Script',cursive;font-size:${Math.min(fs, h*0.82)}px;` +
        `color:#0a2280;padding:0 6px;font-weight:600;`
      );
      inp.addEventListener('input', () => {
        _previewResponses[field.id] = inp.value;
        if (inp.value.trim().length > 1) _formPreviewAutoDate(field);
      });
      wrap.appendChild(inp);
      // Small draw toggle in the corner — doesn't take height
      const drawIcon = document.createElement('span');
      drawIcon.title = 'Switch to draw mode';
      drawIcon.textContent = '✏';
      drawIcon.style.cssText = 'position:absolute;right:3px;bottom:2px;font-size:10px;' +
        'color:#94a3b8;cursor:pointer;';
      drawIcon.addEventListener('click', () => { mode='draw'; renderSig(); });
      wrap.appendChild(drawIcon);

    } else {
      // Draw mode
      const cv = document.createElement('canvas');
      cv.width = Math.round(w); cv.height = Math.round(h - 16);
      cv.style.cssText = 'display:block;cursor:crosshair;flex:1;';
      const ctx = cv.getContext('2d');
      ctx.strokeStyle = '#4f8ef7'; ctx.lineWidth = 2;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // Restore previous drawing if any
      if (_previewResponses[field.id + '_img']) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0);
        img.src = _previewResponses[field.id + '_img'];
      }
      let drawing = false, lx = 0, ly = 0;
      cv.addEventListener('mousedown', e => {
        drawing = true;
        const r = cv.getBoundingClientRect();
        lx = e.clientX - r.left; ly = e.clientY - r.top;
        ctx.beginPath(); ctx.moveTo(lx, ly);
      });
      cv.addEventListener('mousemove', e => {
        if (!drawing) return;
        const r = cv.getBoundingClientRect();
        const cx = e.clientX - r.left, cy = e.clientY - r.top;
        ctx.lineTo(cx, cy); ctx.stroke();
        lx = cx; ly = cy;
      });
      const stopDraw = () => {
        if (drawing) {
          drawing = false;
          _previewResponses[field.id + '_img'] = cv.toDataURL();
          _previewResponses[field.id] = '[signature]';
          _formPreviewAutoDate(field);
        }
      };
      cv.addEventListener('mouseup', stopDraw);
      cv.addEventListener('mouseleave', stopDraw);

      wrap.appendChild(cv);

      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:4px;padding:1px 4px;background:rgba(0,0,0,.2);flex-shrink:0;';
      btns.innerHTML = `<span style="font-size:10px;color:var(--muted);cursor:pointer;font-family:Arial,sans-serif">Clear</span>`
        + `<span style="flex:1"></span>`
        + `<span style="font-size:10px;color:var(--muted);cursor:pointer;font-family:Arial,sans-serif">Aa Type instead</span>`;
      btns.lastElementChild.addEventListener('click', () => { mode='type'; renderSig(); });
      btns.firstElementChild.addEventListener('click', () => {
        ctx.clearRect(0,0,cv.width,cv.height);
        delete _previewResponses[field.id];
        delete _previewResponses[field.id+'_img'];
      });
      wrap.appendChild(btns);
    }
  };

  // Ensure Dancing Script is loaded — inject link synchronously and await font
  if (!document.getElementById('dancing-script-font')) {
    const link = document.createElement('link');
    link.id = 'dancing-script-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap';
    document.head.appendChild(link);
  }
  // Also add @font-face override so the !important style rule works
  if (!document.getElementById('sig-font-override')) {
    const s = document.createElement('style');
    s.id = 'sig-font-override';
    s.textContent = `.form-preview-sig-type, input[data-sig='1'] { font-family:'Dancing Script',cursive !important; }`;
    document.head.appendChild(s);
  }

  renderSig();
}


function _formPreviewReject() {
  const stages  = _formGetStages();
  const stage   = stages.find(s => s.stage === _previewStage);
  const roleLbl = { reviewer:'Reviewer', approver:'Approver', pm:'PM', external:'External' }[stage?.role] || 'Reviewer';

  _formShowRejectModal({
    title:    `Reject as ${roleLbl}`,
    subtitle: `Your rejection reason will be recorded in the Chain of Custody. The form will reset to Stage 1 for revision.`,
    role:     stage?.role || 'reviewer',
    onSubmit: (comment) => {
      if (_selectedForm) {
        _formCoCWrite('form.preview_rejected', _selectedForm.id, {
          role: stage?.role || 'reviewer',
          stage: _previewStage,
          comment,
          note: `Preview rejection by ${roleLbl}: "${comment}"`,
        });
      }
      cadToast(`Rejected as ${roleLbl} — recorded in CoC`, 'info');
      _previewStage = 1;
      document.querySelectorAll('.form-preview-input-wrap').forEach(el => el.remove());
      _previewResponses = {};
      _formRenderPreviewOverlay();
      _formRefreshRolePanel();
    }
  });
}

function _formPreviewSubmitStage() {
  const stages   = _formGetStages();
  const maxStage = stages.length || 1;

  // Validate required fields for current stage
  const required = _formFieldsForStage(_previewStage).filter(f => f.required);
  const missing  = required.filter(f => !_previewResponses[f.id]);
  if (missing.length) {
    cadToast(`${missing.length} required field${missing.length>1?'s':''} not filled`, 'error');
    // Highlight missing
    missing.forEach(f => {
      const wraps = document.querySelectorAll('.form-preview-input-wrap');
      const canvas = document.getElementById('form-pdf-canvas');
      if (!canvas) return;
      const r = f.rect; const x = r.x*_pdfScale, y = r.y*_pdfScale;
      wraps.forEach(w => {
        if (Math.abs(parseInt(w.style.left)-x)<2 && Math.abs(parseInt(w.style.top)-y)<2) {
          w.style.border = '2px solid var(--red)';
          setTimeout(() => w.style.border = '', 2000);
        }
      });
    });
    return;
  }

  if (_previewStage < maxStage) {
    _previewStage++;
    document.querySelectorAll('.form-preview-input-wrap').forEach(el => el.remove());
    _formRenderPreviewOverlay();
    _formRefreshRolePanel();
    cadToast(`Stage ${_previewStage-1} submitted — now simulating Stage ${_previewStage}`, 'info');
    // Scroll to new stage fields
    requestAnimationFrame(() => {
      const stages = _formGetStages();
      const stage  = stages.find(s => s.stage === _previewStage);
      const roleFields = _formFields.filter(f => f.role === (stage?.role||'reviewer'));
      if (roleFields.length) {
        const topField = roleFields.reduce((a,b) => (a.rect?.y||0) < (b.rect?.y||0) ? a : b);
        const outerWrap = document.getElementById('form-canvas-wrap');
        if (outerWrap) outerWrap.scrollTo({ top: Math.max(0, topField.rect.y * _pdfScale - 100), behavior:'smooth' });
      }
    });
  } else {
    // All stages done — stay in preview, let user exit manually
    const total = Object.keys(_previewResponses).filter(k => !k.endsWith('_img') && _previewResponses[k]).length;
    cadToast(`All stages filled — ${total} fields completed. Click Exit Preview when done.`, 'success');
  }
}

function _formPopOutPreview() {
  if (!_selectedForm) return;
  // Encode form data into URL params for the standalone preview page
  const params = new URLSearchParams({
    form_id:   _selectedForm.id,
    form_name: _selectedForm.source_name || 'Form Preview',
    preview:   '1',
  });
  window.open(`/form-preview.html?${params}`, '_blank',
    'width=1100,height=800,resizable=yes,scrollbars=yes');
}

// Keyboard shortcut P = toggle preview
// (wired into existing keydown listener)


// ─────────────────────────────────────────────────────────────────────────────
// AUTO-DATE — fill nearest matching date field when signature is given
// Matching: date field whose label shares a keyword with the sig field label
//   e.g. sig "Reviewer Signature" → date "Reviewer Date"
// ─────────────────────────────────────────────────────────────────────────────
function _formPreviewAutoDate(sigField) {
  const d = new Date();
  // Store as MM/DD/YYYY (matches our text date input format)
  const today = `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
  // Extract keyword from sig label (first word that isn't "Signature"/"Sign"/"Auth")
  const stopWords = new Set(['signature','sign','authorized','approval','approver','by','date','field']);
  const sigWords  = (sigField.label||'').toLowerCase().split(/\s+/).filter(w => !stopWords.has(w) && w.length > 2);

  // Find best matching date field on same page
  const dateFields = _formFields.filter(f =>
    f.type === 'date' && (f.page||1) === (sigField.page||1) && f.id !== sigField.id
  );
  if (!dateFields.length) return;

  let best = null, bestScore = 0;
  dateFields.forEach(df => {
    const dWords = (df.label||'').toLowerCase().split(/\s+/);
    // Score = number of shared keywords
    const score = sigWords.filter(w => dWords.some(dw => dw.includes(w) || w.includes(dw))).length;
    // Fallback: same role
    const roleBonus = df.role === sigField.role ? 0.5 : 0;
    // Proximity bonus: closer vertically = better
    const dist = Math.abs((df.rect?.y||0) - (sigField.rect?.y||0));
    const proxBonus = dist < 50 ? 0.3 : 0;
    const total = score + roleBonus + proxBonus;
    if (total > bestScore) { bestScore = total; best = df; }
  });

  if (!best) return;
  // Auto-fill the date response
  _previewResponses[best.id] = today;
  // Update the input DOM element if visible
  const wrap = document.getElementById('canvas-wrap') ||
               document.getElementById('form-pdf-canvas')?.parentElement;
  if (!wrap) return;
  const allWraps = wrap.querySelectorAll('.form-preview-input-wrap');
  // Find by position
  const bx = best.rect.x * _pdfScale, by = best.rect.y * _pdfScale;
  allWraps.forEach(w => {
    if (Math.abs(parseInt(w.style.left)-bx) < 3 && Math.abs(parseInt(w.style.top)-by) < 3) {
      const inp = w.querySelector('input[type="date"]');
      if (inp) { inp.value = today; inp.style.borderColor = 'var(--green)'; }
    }
  });
}


function _formPreviewAttendeesField(wrap, field, existingVal, h, fs) {
  // Parse stored value — may be JSON array or legacy comma string
  let attendees = [];
  try {
    const parsed = JSON.parse(existingVal || '[]');
    attendees = Array.isArray(parsed) ? parsed : [];
  } catch(e) {
    // Legacy comma-separated string — convert to objects
    attendees = existingVal
      ? existingVal.split(',').map(s => ({ id: s.trim(), name: s.trim() })).filter(a => a.name)
      : [];
  }

  // NOTE: do NOT set position:relative — wrap is position:absolute from caller
  wrap.style.background   = 'rgba(255,255,255,.88)';
  wrap.style.border       = '1.5px solid #3b82f6';
  wrap.style.borderRadius = '3px';
  wrap.style.cursor       = 'pointer';
  wrap.style.display      = 'flex';
  wrap.style.alignItems   = 'center';
  wrap.style.flexWrap     = 'wrap';
  wrap.style.gap          = '3px';
  wrap.style.padding      = '2px 4px';
  wrap.style.zIndex       = '10';
  wrap.style.setProperty('overflow', 'visible', 'important');

  const chipFs  = Math.max(10, Math.min(fs * 0.75, 13));  // pill font size
  const chipH   = Math.max(16, Math.min(h * 0.7, 22));    // pill height

  const renderCell = () => {
    wrap.innerHTML = '';
    wrap.style.setProperty('overflow', 'visible', 'important');

    // Render each attendee as a pill chip
    attendees.forEach(a => {
      const pill = document.createElement('span');
      const initials = (a.name || '?').split(' ').map(w => w[0] || '').join('').slice(0,2).toUpperCase();
      pill.style.cssText = [
        'display:inline-flex;align-items:center;gap:4px',
        `height:${chipH}px`,
        'padding:0 7px 0 4px',
        'border-radius:999px',
        'background:#1e3a8a',
        'color:white',
        `font-size:${chipFs}px`,
        'font-family:Arial,sans-serif',
        'font-weight:500',
        'white-space:nowrap',
        'flex-shrink:0',
      ].join(';');

      // Avatar circle
      const avatar = document.createElement('span');
      avatar.style.cssText = [
        `width:${chipH - 4}px`,
        `height:${chipH - 4}px`,
        'border-radius:50%',
        'background:rgba(255,255,255,.25)',
        'display:flex;align-items:center;justify-content:center',
        `font-size:${chipFs - 2}px`,
        'font-weight:700',
        'flex-shrink:0',
      ].join(';');
      avatar.textContent = initials;

      const nameSpan = document.createElement('span');
      nameSpan.textContent = a.name || a.id;

      pill.appendChild(avatar);
      pill.appendChild(nameSpan);
      wrap.appendChild(pill);
    });

    // + Add button
    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add';
    addBtn.style.cssText = [
      `font-size:${chipFs}px`,
      `height:${chipH}px`,
      'padding:0 8px',
      'background:#3b82f6',
      'border:none',
      'border-radius:999px',
      'cursor:pointer',
      'color:white',
      'font-family:Arial,sans-serif',
      'font-weight:600',
      'flex-shrink:0',
    ].join(';');
    addBtn.onclick = (e) => {
      e.stopPropagation();
      if (window.PersonPicker?.show) {
        window.PersonPicker.show(addBtn, function(person) {
          if (!person?.id) return;
          if (!attendees.find(a => a.id === person.id)) {
            attendees.push({ id: person.id, name: person.name });
            _previewResponses[field.id] = JSON.stringify(attendees);
            renderCell();
          }
        });
      }
    };
    wrap.appendChild(addBtn);

    // Click pill to open remove popover
    if (attendees.length) {
      wrap.onclick = (e) => {
        if (e.target === addBtn || addBtn.contains(e.target)) return;
        e.stopPropagation();
        renderPopover();
      };
    }
  };

  const renderPopover = () => {
    document.getElementById('att-popover-'+field.id)?.remove();
    const pop = document.createElement('div');
    pop.id = 'att-popover-' + field.id;
    pop.style.cssText = 'position:absolute;bottom:calc(100% + 4px);left:0;z-index:200;' +
      'background:white;border:1.5px solid #3b82f6;border-radius:6px;padding:8px;' +
      'min-width:200px;max-width:300px;box-shadow:0 4px 20px rgba(0,0,0,.25);';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:12px;font-weight:700;color:#1e3a8a;margin-bottom:6px;font-family:Arial,sans-serif;';
    title.textContent = 'Attendees';
    pop.appendChild(title);

    attendees.forEach((a, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 0;';
      const name = document.createElement('span');
      name.style.cssText = 'flex:1;font-size:13px;color:#111;font-family:Arial,sans-serif;';
      name.textContent = a.name || a;
      const rm = document.createElement('button');
      rm.textContent = '✕';
      rm.style.cssText = 'background:none;border:none;cursor:pointer;color:#dc2626;font-size:13px;padding:0;font-weight:700;';
      rm.onclick = () => {
        attendees.splice(i,1);
        _previewResponses[field.id] = JSON.stringify(attendees);
        pop.remove(); renderCell(); if (attendees.length) renderPopover();
      };
      row.appendChild(name); row.appendChild(rm);
      pop.appendChild(row);
    });

    const closeBtn = document.createElement('div');
    closeBtn.style.cssText = 'margin-top:6px;font-size:11px;color:#6b7280;cursor:pointer;text-align:right;font-family:Arial,sans-serif;';
    closeBtn.textContent = '✕ Close';
    closeBtn.onclick = () => pop.remove();
    pop.appendChild(closeBtn);

    wrap.appendChild(pop);
    setTimeout(() => document.addEventListener('click', function _c(e) {
      if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click',_c); }
    }), 50);
  };

  renderCell();
}


// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW ROLE SWITCHER PANEL
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW HISTORY PANEL
// Shows: lifecycle workflow DAG  |  activity table  |  comments
// Inserted as a flex sibling between the canvas and SIMULATE panel.
// ─────────────────────────────────────────────────────────────────────────────

async function _formShowPreviewHistoryPanel() {
  document.getElementById('form-preview-history-panel')?.remove();
  const bodyRow = document.getElementById('form-body-row');
  if (!bodyRow) return;

  const panel = document.createElement('div');
  panel.id = 'form-preview-history-panel';
  // nodeW=72, colGap=10, 5 nodes → 72*5 + 10*4 = 400px content + 2*16px padding = 432px min
  const _fphMinW = 560;
  panel.style.cssText = [
    `width:${_fphMinW}px;min-width:${_fphMinW}px;flex-shrink:0`,
    'background:var(--bg1)',
    'border-left:1px solid var(--border)',
    'display:flex;flex-direction:column',
    'font-family:Arial,sans-serif',
    'overflow-y:auto',
    'overflow-x:hidden',
    'position:relative',   // needed for drag handle positioning
  ].join(';');

  // Insert BEFORE the SIMULATE panel (append adds it after canvas, before any existing panels)
  const simulate = document.getElementById('form-preview-role-panel');
  bodyRow.insertBefore(panel, simulate || null);

  const state = _selectedForm?.state || 'draft';

  // ── Section header helper ──────────────────────────────────────────────────
  const sectionHdr = (title) =>
    `<div style="padding:9px 16px 8px;
       background:var(--bg);
       border-top:1px solid var(--border2);border-bottom:1px solid var(--border2);
       font-size:13px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;
       color:var(--text);font-family:Arial,sans-serif;flex-shrink:0">${title}</div>`;

  // ── Build all content HTML first, then set once (avoids innerHTML += destroying appended nodes)
  // Activity starts at 220px, Comments gets the rest — both resizable via drag
  panel.innerHTML =
    sectionHdr('Lifecycle') + `<div id="fph-dag" style="padding:16px 16px 8px;flex-shrink:0"></div>` +
    `<div style="height:1px;background:var(--border);flex-shrink:0"></div>` +
    `<div id="fph-activity" style="padding:0;flex-shrink:0;overflow:hidden">
       <div style="padding:12px 14px;font-size:12px;color:var(--muted);font-family:Arial,sans-serif">Loading…</div>
     </div>` +
    `<div id="fph-comments-drag-handle"
       style="height:8px;flex-shrink:0;cursor:row-resize;background:var(--border);
              display:flex;align-items:center;justify-content:center;
              transition:background .15s;user-select:none;position:relative"
       title="Drag to resize">
       <div style="width:32px;height:2px;border-radius:1px;background:var(--muted);pointer-events:none"></div>
     </div>` +
    `<div id="fph-comments-hdr"
       style="padding:10px 16px 8px;border-bottom:1px solid var(--border);
              font-size:13px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;
              color:var(--text);font-family:Arial,sans-serif;flex-shrink:0;
              cursor:row-resize;user-select:none;display:flex;align-items:center;gap:8px">
       <span>Comments</span>
       <span style="font-size:10px;color:var(--muted);font-weight:400;text-transform:none;
         letter-spacing:0;margin-left:auto">⠿ drag</span>
     </div>` +
    `<div id="fph-comments" style="padding:0;flex:1;overflow-y:auto;min-height:60px">
       <div style="padding:12px 14px;font-size:12px;color:var(--muted);font-family:Arial,sans-serif">Loading…</div>
     </div>`;

  // ── Left edge drag handle (horizontal resize of whole panel) ───────────────
  const dragHandle = document.createElement('div');
  dragHandle.style.cssText = [
    'position:absolute;left:0;top:0;bottom:0;width:6px',
    'cursor:col-resize;z-index:10;background:transparent;transition:background .15s',
  ].join(';');
  dragHandle.addEventListener('mouseover',  () => { dragHandle.style.background = 'rgba(196,125,24,.3)'; });
  dragHandle.addEventListener('mouseout',   () => { if (!window._formDragCol) dragHandle.style.background = 'transparent'; });
  dragHandle.addEventListener('mousedown',  (e) => _formColDragStart(e, 'form-preview-history-panel', 'left'));
  panel.appendChild(dragHandle);

  // ── Vertical drag handle between Activity and Comments ────────────────────
  const vDragHandle = panel.querySelector('#fph-comments-drag-handle');
  const vDragHdr    = panel.querySelector('#fph-comments-hdr');
  const _wireVDrag  = (el) => {
    if (!el) return;
    el.addEventListener('mouseover', () => {
      vDragHandle.style.background = 'rgba(196,125,24,.35)';
    });
    el.addEventListener('mouseout', () => {
      if (!window._fphVDragging) vDragHandle.style.background = 'var(--border)';
    });
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      window._fphVDragging  = true;
      const activityEl  = document.getElementById('fph-activity');
      const startY      = e.clientY;
      const startH      = activityEl?.offsetHeight || 220;

      const onMove = (me) => {
        const delta  = me.clientY - startY;
        const newH   = Math.max(60, Math.min(500, startH + delta));
        if (activityEl) activityEl.style.height = newH + 'px';
      };
      const onUp = () => {
        window._fphVDragging = false;
        if (vDragHandle) vDragHandle.style.background = 'var(--border)';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  };
  _wireVDrag(vDragHandle);
  _wireVDrag(vDragHdr);

  // Set initial activity height
  const actEl = panel.querySelector('#fph-activity');
  if (actEl) actEl.style.height = '220px';

  // Render DAG without history flag first (immediate, no async)
  _fphRenderDag(
    state,
    _selectedForm?.reviewed_by          || [],
    _selectedForm?.pending_reviewer_ids || [],
    false  // hasHistory — will re-render after CoC loads
  );

  // Load CoC data for activity + comments + re-render DAG with history flag
  if (_selectedForm?.id) {
    try {
      const rows = await API.get(
        `coc_events?entity_id=eq.${_selectedForm.id}&order=created_at.asc&limit=200`
      ).catch(() => []) || [];
      // Re-render DAG now that we know if form has prior review history
      const _hasHistory = rows.some(r => {
        try { const p = JSON.parse(r.event_notes||'{}'); return p.from && p.to; } catch(e) { return false; }
      });
      const _hasDraftSave = rows.some(r => {
        if (r.event_type !== 'form.saved') return false;
        try { const p = JSON.parse(r.event_notes||'{}'); return p.state === 'draft'; } catch(e) { return false; }
      });
      _fphRenderDag(
        state,
        _selectedForm?.reviewed_by          || [],
        _selectedForm?.pending_reviewer_ids || [],
        _hasHistory,
        _hasDraftSave
      );
      _fphRenderActivity(rows);
      _fphRenderComments(rows);
    } catch(e) {
      ['fph-activity','fph-comments'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div style="padding:12px 14px;font-size:12px;color:var(--red)">Failed to load.</div>';
      });
    }
  } else {
    ['fph-activity','fph-comments'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<div style="padding:12px 14px;font-size:12px;color:var(--muted)">No history yet.</div>';
    });
  }
}

// ── Workflow DAG renderer ──────────────────────────────────────────────────
function _fphRenderDag(currentState, reviewedBy, pendingReviewerIds, hasHistory, hasDraftSave) {
  const el = document.getElementById('fph-dag');
  if (!el) return;

  // ── 4-node lifecycle ──────────────────────────────────────────────────────
  // DB states map to 4 visual nodes: Draft, Review, Approve, Release
  // Each node has dynamic label + color based on current state

  const pendingCount  = (pendingReviewerIds || []).length;
  const approvedCount = (reviewedBy || []).filter(id =>
    /^[0-9a-f-]{36}$/i.test(id)).length;

  // Compute per-node display: { label, lines, color, status }
  // status: 'ready'|'active'|'done'|'rejected'|'pending'
  const nodeSpec = (id) => {
    switch(id) {
      case 'draft': {
        if (['in_review','reviewed','approved','released'].includes(currentState))
          return { lines:['Draft','Complete'], color:'#2a9d40', status:'done' };
        if (currentState === 'draft') {
          // Amber 'In Draft' only when editor has actually saved edits in draft
          // (hasDraftSave distinguishes "just returned" from "actively editing")
          if (hasHistory && hasDraftSave)
            return { lines:['In Draft'], color:'#f0a030', status:'active' };
          // Blue 'Draft' = ready to edit (fresh return from rejection, no edits yet)
          return { lines:['Draft'], color:'#4f8ef7', status:'ready' };
        }
        if (currentState === 'unreleased')
          return { lines:['Draft'], color:'#4f8ef7', status:'ready' };
        if (['rejected_review','rejected_approval','rejected_release'].includes(currentState))
          return { lines:['Draft'], color:'#4f8ef7', status:'ready' };
        return { lines:['Draft'], color:'#4f8ef7', status:'ready' };
      }
      case 'review': {
        // Green if form made it past review (approved, released, rejected at a later stage)
        if (['approved','released','rejected_approval','rejected_release'].includes(currentState))
          return { lines:['Review','Complete'], color:'#2a9d40', status:'done' };
        if (currentState === 'reviewed')
          return { lines:['Review','Complete'], color:'#2a9d40', status:'done' };
        if (currentState === 'rejected_review')
          return { lines:['Review','Rejected'], color:'#f87171', status:'rejected' };
        if (currentState === 'in_review') {
          if (approvedCount === 0)
            return { lines:['Review'], color:'#4f8ef7', status:'active' };
          if (pendingCount > 1 && approvedCount < pendingCount)
            return { lines:['In','Review'], color:'#f0a030', status:'active' };
          return { lines:['Review'], color:'#f0a030', status:'active' };
        }
        return { lines:['Review'], color:'#3a3f52', status:'pending' };
      }
      case 'approve': {
        // Green if form made it past approval (released, or rejected at release gate)
        if (['released','rejected_release'].includes(currentState))
          return { lines:['Approved'], color:'#2a9d40', status:'done' };
        if (currentState === 'approved')
          return { lines:['Approved'], color:'#2a9d40', status:'done' };
        if (currentState === 'rejected_approval')
          return { lines:['Rejected'], color:'#f87171', status:'rejected' };
        if (currentState === 'reviewed')
          return { lines:['Approve'], color:'#4f8ef7', status:'active' };
        return { lines:['Approve'], color:'#3a3f52', status:'pending' };
      }
      case 'release': {
        if (currentState === 'released')
          return { lines:['Released'], color:'#2a9d40', status:'done' };
        if (currentState === 'rejected_release')
          return { lines:['Rejected'], color:'#f87171', status:'rejected' };
        if (currentState === 'approved')
          return { lines:['Release'], color:'#4f8ef7', status:'active' };
        return { lines:['Release'], color:'#3a3f52', status:'pending' };
      }
    }
  };

  const NODES = ['draft','review','approve','release'].map(id => ({
    id, ...nodeSpec(id)
  }));

  const isRejected   = ['rejected_review','rejected_approval','rejected_release'].includes(currentState);
  const isUnreleased = currentState === 'unreleased';
  const activeNode   = NODES.find(n => n.status === 'active' || n.status === 'ready' && ['draft','unreleased'].includes(currentState));

  // ── Dimensions ─────────────────────────────────────────────────────────────
  const panelEl = document.getElementById('form-preview-history-panel');
  const panelW  = Math.max(440, (panelEl?.clientWidth || 560) - 24);
  const colGap  = 12;
  const nodeW   = Math.floor((panelW - 3 * colGap) / 4);
  const nodeH   = 64, nodeR = 8;
  const totalW  = 4 * nodeW + 3 * colGap;
  const startX  = (panelW - totalW) / 2;
  const nodeY   = isUnreleased ? 72 : isRejected ? 40 : 40;
  const svgH    = isRejected ? 200 : isUnreleased ? 180 : 140;

  // ── SVG open + defs ─────────────────────────────────────────────────────────
  let svg = `<svg viewBox="0 0 ${panelW} ${svgH}" width="${panelW}" height="${svgH}"
    style="display:block;overflow:visible;max-width:100%" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @keyframes dagGlow {
        0%,100% { opacity:.5; r:${nodeH/2 + 5}; }
        50%      { opacity:.85; r:${nodeH/2 + 10}; }
      }
      .dag-pulse { animation: dagGlow 1.8s ease-in-out infinite; }
    </style>
    <marker id="arrG" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" fill="#2a9d40"/>
    </marker>
    <marker id="arrB" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" fill="#4f8ef7"/>
    </marker>
    <marker id="arrD" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" fill="#3a3f52"/>
    </marker>
    <marker id="arrR" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" fill="#f87171"/>
    </marker>
    <marker id="arrA" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" fill="#f0a030"/>
    </marker>
  </defs>`;

  // ── Connector lines ─────────────────────────────────────────────────────────
  NODES.forEach((n, i) => {
    if (i === NODES.length - 1) return;
    const x1 = startX + i * (nodeW + colGap) + nodeW;
    const x2 = startX + (i + 1) * (nodeW + colGap);
    const cy  = nodeY + nodeH / 2;
    const nxt = NODES[i + 1];
    const col = n.status === 'done' ? '#2a9d40' : '#3a3f52';
    const mk  = n.status === 'done' ? 'G' : 'D';
    svg += `<line x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}"
      stroke="${col}" stroke-width="${n.status === 'done' ? 2 : 1}"
      marker-end="url(#arr${mk})"/>`;
  });

  // ── Node cards ──────────────────────────────────────────────────────────────
  NODES.forEach((n, i) => {
    const x   = startX + i * (nodeW + colGap);
    const cx  = x + nodeW / 2;
    const cy  = nodeY + nodeH / 2;

    const isActive   = n.status === 'active' || (n.status === 'ready' && n.id === 'draft');
    const isDone     = n.status === 'done';
    const isRej      = n.status === 'rejected';
    const isPending  = n.status === 'pending';

    const accent   = n.color;
    const fillCol  = isDone    ? 'rgba(42,157,64,.12)'
                   : isRej    ? 'rgba(248,113,113,.12)'
                   : isActive  ? `${accent}28`
                   : '#1a1f2e';
    const textCol  = isPending ? '#555' : '#f0f0f0';
    const sw       = isPending ? 1 : 2;

    // Glow ring on active/ready node
    if (isActive) {
      svg += `<circle cx="${cx}" cy="${cy}" r="${nodeH/2 + 5}"
        fill="none" stroke="${accent}" stroke-width="2" opacity="0.5"
        class="dag-pulse"/>`;
    }

    // Node rect
    svg += `<rect x="${x}" y="${nodeY}" width="${nodeW}" height="${nodeH}"
      rx="${nodeR}" fill="${fillCol}" stroke="${accent}" stroke-width="${sw}"/>`;

    // Status dot
    svg += `<circle cx="${x + 12}" cy="${cy}" r="4" fill="${isPending ? '#3a3f52' : accent}"/>`;

    // Label lines
    const lines  = n.lines;
    const lineH  = 16;
    const startTY = cy - ((lines.length - 1) * lineH) / 2;
    lines.forEach((line, li) => {
      svg += `<text x="${cx + 6}" y="${startTY + li * lineH}"
        text-anchor="middle" dominant-baseline="middle"
        font-size="13" font-weight="${isActive || isDone ? '700' : '500'}"
        fill="${textCol}" font-family="Arial,sans-serif">${line}</text>`;
    });

    // ✓ done badge
    if (isDone) {
      svg += `<text x="${x + nodeW - 10}" y="${nodeY + 14}"
        text-anchor="middle" font-size="12" fill="#2a9d40" font-family="Arial,sans-serif">✓</text>`;
    }

    // ✗ rejected badge + ▼ return triangle
    if (isRej) {
      svg += `<text x="${x + nodeW - 10}" y="${nodeY + 14}"
        text-anchor="middle" font-size="12" fill="#f87171" font-family="Arial,sans-serif">✗</text>`;
      svg += `<polygon points="${cx - 7},${nodeY + nodeH - 14} ${cx + 7},${nodeY + nodeH - 14} ${cx},${nodeY + nodeH - 2}"
        fill="#f87171" opacity="0.9"/>`;
    }

    // Draft node: ▼ return target triangle when rejected (tip points DOWN)
    if (n.id === 'draft' && isRejected) {
      svg += `<polygon points="${cx - 7},${nodeY + nodeH - 14} ${cx + 7},${nodeY + nodeH - 14} ${cx},${nodeY + nodeH - 2}"
        fill="#4f8ef7" opacity="0.9"/>`;
    }
  });

  // ── Rejection arc (BELOW) ───────────────────────────────────────────────────
  if (isRejected) {
    const arcY   = nodeY + nodeH + 32;
    const rejIdx = currentState === 'rejected_review'   ? 1
                 : currentState === 'rejected_approval' ? 2
                 : 3; // rejected_release
    const srcX   = startX + rejIdx * (nodeW + colGap) + nodeW / 2;
    const dstX   = startX + nodeW / 2;
    const midX   = (srcX + dstX) / 2;
    const label  = currentState === 'rejected_review'   ? 'Review Rejected'
                 : currentState === 'rejected_approval' ? 'Approval Rejected'
                 : 'Release Rejected';
    svg += `<path d="M${srcX},${nodeY + nodeH} C${srcX},${arcY} ${dstX},${arcY} ${dstX},${nodeY + nodeH}"
      fill="none" stroke="#f87171" stroke-width="2" stroke-dasharray="6,3"
      marker-end="url(#arrR)"/>`;
    svg += `<text x="${midX}" y="${arcY + 18}" text-anchor="middle"
      font-size="13" font-weight="600" fill="#f87171" font-family="Arial,sans-serif">${label}</text>`;
  }

  // ── Unrelease arc (ABOVE) ───────────────────────────────────────────────────
  if (isUnreleased) {
    const arcYTop = nodeY - 36;
    const srcX    = startX + 3 * (nodeW + colGap) + nodeW / 2;
    const dstX    = startX + nodeW / 2;
    const midX    = (srcX + dstX) / 2;
    svg += `<path d="M${srcX},${nodeY} C${srcX},${arcYTop} ${dstX},${arcYTop} ${dstX},${nodeY}"
      fill="none" stroke="#f0a030" stroke-width="2" stroke-dasharray="6,3"
      marker-end="url(#arrA)"/>`;
    svg += `<text x="${midX}" y="${arcYTop - 10}" text-anchor="middle"
      font-size="13" font-weight="600" fill="#f0a030" font-family="Arial,sans-serif">Unrelease</text>`;
  }

  // ── State label (only for non-rejected, non-unreleased) ─────────────────────
  if (!isRejected && !isUnreleased && !['draft','in_review'].includes(currentState)) {
    const stateLabel = _formStateLabel(currentState);
    const stateColor = _formStateColor(currentState);
    svg += `<text x="${panelW/2}" y="${nodeY + nodeH + 20}"
      text-anchor="middle" font-size="13" font-weight="700"
      fill="${stateColor}" font-family="Arial,sans-serif">${stateLabel}</text>`;
  }

  svg += '</svg>';
  el.innerHTML = svg;
}

function _fphRenderActivity(rows) {
  const el = document.getElementById('fph-activity');
  if (!el) return;

  if (!rows.length) {
    el.innerHTML = '<div style="padding:12px 14px;font-size:12px;color:var(--muted);font-family:Arial,sans-serif">No activity yet.</div>';
    return;
  }

  // For state_changed events, derive a human label from the from/to in event_notes
  const stateChangedLabel = (r) => {
    try {
      const p = JSON.parse(r.event_notes || '{}');
      const from = p.from, to = p.to;
      if (to === 'in_review')          return 'Submitted for Review';
      if (to === 'reviewed')           return 'All Reviewers Approved';
      if (to === 'approved')           return 'Approved';
      if (to === 'released')           return 'Released';
      if (to === 'unreleased')         return 'Revision Started';
      if (to === 'rejected_review')    return 'Rejected at Review';
      if (to === 'rejected_approval')  return 'Rejected at Approval';
      if (to === 'rejected_release')   return 'Rejected at Release';
      if (to === 'draft' || !to)       return 'Form Completed';
    } catch(e) {}
    return 'State Changed';
  };

  const evtLabel = {
    'form.saved':              'Saved',
    'form.state_changed':      null,   // resolved dynamically via stateChangedLabel()
    'form.released':           'Released',
    'form.approved':           'Approved',
    'form.rejected':           'Rejected',
    'form.all_reviewed':       'All Reviewed',
    'form.review_approved':    'Reviewer Approved',
    'form.approval_approved':  'Approver Approved',
    'form.archived':           'Archived',
    'form.content_rejected':   'Content Rejected',
    'form.content_approved':   'Content Approved',
    'form.action_item_created':'Action Item Created',
    'form.preview_rejected':   'Preview Rejected',
  };
  const evtColor = {
    'form.released':           '#2a9d40',
    'form.approved':           '#2a9d40',
    'form.approval_approved':  '#2a9d40',
    'form.all_reviewed':       '#c47d18',
    'form.review_approved':    '#c47d18',
    'form.rejected':           '#dc2626',
    'form.content_rejected':   '#dc2626',
  };

  const fmt = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  };

  // ── Role + Action derivation from event_notes JSON ────────────────────────
  const parseNotes = (r) => {
    try { return JSON.parse(r.event_notes || '{}'); } catch(e) { return {}; }
  };

  // Current user name as fallback for events with null actor_name
  const _actorFallback = window.CURRENT_USER?.name || window.CURRENT_USER?.email || null;
  // Form version — shown on every row to identify the version being acted on
  const _formVersion   = _selectedForm?.version || null;

  const deriveRoleAction = (r) => {
    // event_notes may be JSON string or plain text; metadata is jsonb
    const notes  = parseNotes(r);
    // Also check metadata which may carry the from/to for older events
    const meta   = r.metadata || {};
    const from   = notes.from || meta.from || '';
    const to     = notes.to   || meta.to   || '';
    const stage  = notes.stage || meta.stage || '';
    const who    = r.actor_name || _actorFallback;
    const evType = r.event_type || '';

    // Suppress if absolutely nothing to show
    if (!who && !from && !to && !evType) return null;

    // ── from→to state transition mapping (checked before event_type) ─────────
    // Helper: version from event notes (written at time of event) — never use live _formVersion
    const v = notes.version || meta.version || null;

    if (from === 'draft' && to === 'in_review')
      return { role:'Editor',   action:'Draft Complete',    who, version: v };
    if (from === 'in_review' && to === 'in_review')
      return { role:'Reviewer', action:'Review Approved',   who, version: v };
    if (from === 'in_review' && to === 'reviewed')
      return { role:'Reviewer', action:'Review Complete',   who, version: v };
    if (from === 'reviewed'  && to === 'approved')
      return { role:'Approver', action:'Approved',          who, version: v };
    if (to === 'rejected_review')
      return { role:'Reviewer', action:'Review Rejected',   who, version: v };
    if (to === 'rejected_approval')
      return { role:'Approver', action:'Approval Rejected', who, version: v };
    if (to === 'rejected_release' || (stage === 'release' && evType === 'form.rejected') ||
        (to === 'unreleased' && stage === 'release'))
      return { role:'Editor',   action:'Rejected',          who, version: v };
    if (from === 'approved' && to === 'released')
      return { role:'Editor',   action:'Released',          who, version: v };
    if (from && from.startsWith('rejected') && to === 'draft')
      return { role:'Editor',   action:'Returned to Draft', who, version: v };
    if (from === 'import' && to === 'draft')
      return { role:'Editor',   action:'Form Import Complete', who, version: v };
    if (to === 'unreleased')
      return { role:'Editor',   action:'Revision Started',  who, version: v };

    // ── event_type fallback ───────────────────────────────────────────────────
    if (evType === 'form.released')
      return { role:'Editor',   action:'Released',          who, version: notes.version || meta.version };
    if (evType === 'form.approved')
      return { role:'Approver', action:'Approved',          who, version: _formVersion };
    if (evType === 'form.rejected') {
      // Determine role from stage if available
      const rejRole = stage === 'release' ? 'Editor'
                    : stage === 'approval' ? 'Approver' : 'Reviewer';
      return { role: rejRole, action:'Rejected', who, version: v };
    }
    if (evType === 'form.state_changed' && !from && !to) return null;
    if (evType === 'form.saved') {
      // Show as "In Draft" when editor is actively working (has a known actor)
      // Pure system saves with no actor are suppressed
      if (!who) return null;
      const savedState = notes.state || '';
      if (['draft','unreleased'].includes(savedState))
        return { role:'Editor', action:'In Draft', who, version: notes.version || meta.version || null };
      return null; // suppress saves during other states
    }
    if (evType === 'form.archived') return null;  // suppress archive/delete events
    if (!who) return null;
    return { role:'Editor', action: notes.note || evType.replace('form.',''), who };
  };

  const roleColor = (role) => ({
    'Editor':   '#60a5fa',
    'Reviewer': '#f0a030',
    'Approver': '#4ade80',
  })[role] || 'var(--muted)';

  const th = (label) =>
    `<th style="padding:6px 8px;font-size:12px;color:var(--text);font-family:Arial,sans-serif;
      text-align:left;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
      border-bottom:1px solid var(--border);white-space:nowrap">${label}</th>`;

  const td = (content, color='var(--text1)', extra='') =>
    `<td style="padding:6px 8px;font-size:13px;color:${color};font-family:Arial,sans-serif;
      border-bottom:1px solid var(--border);${extra}">${content}</td>`;

  // Deduplicate: for consecutive form.saved events, keep only the last one
  const deduped = rows.filter((r, i) => {
    if (r.event_type !== 'form.saved') return true;
    // Keep this saved event only if the next event is NOT also a form.saved
    const next = rows[i + 1];
    return !next || next.event_type !== 'form.saved';
  });

  const tableRows = deduped.map(r => {
    const derived = deriveRoleAction(r);
    if (!derived) return '';
    const { role, action, who } = derived;
    const rColor = roleColor(role);
    const aColor = action.toLowerCase().includes('reject') ? '#f87171'
                 : ['Approved','Review Complete','Released','Review Approved'].includes(action) ? '#4ade80'
                 : action === 'Submitted for Review' || action === 'Draft Complete' ? '#60a5fa'
                 : action === 'In Draft' ? '#f0a030'
                 : action === 'Returned to Draft' ? '#60a5fa'
                 : 'var(--text1)';
    return `<tr>
      ${td(fmt(r.created_at), 'var(--muted)', 'white-space:nowrap')}
      ${td(escHtml(who || '—'), 'var(--text1)', 'max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}
      ${td(`<span style="padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;
        background:${rColor}18;border:1px solid ${rColor}44;color:${rColor}">${role}</span>`, 'inherit')}
      ${td(`<span style="font-weight:600;color:${aColor}">${escHtml(action)}</span>`, 'inherit')}
      ${td(derived.version ? `<span style="font-size:12px;font-family:monospace;color:var(--muted)">${escHtml(derived.version)}</span>` : '', 'inherit')}
    </tr>`;
  }).filter(Boolean).join('');

  el.innerHTML = `<div style="overflow-x:auto;height:100%;overflow-y:auto">
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:var(--bg2);position:sticky;top:0">
          ${th('Date/Time')}${th('Person')}${th('Role')}${th('Action')}${th('Version')}
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>`;
}

// ── Comments renderer ───────────────────────────────────────────────────────
function _fphRenderComments(rows) {
  const el = document.getElementById('fph-comments');
  if (!el) return;

  // Comments = rejection notes + any note-bearing events, newest first
  // Comments: events with notes, newest first
  // event_notes is the column name; metadata.note/comment also checked
  // Only show events that have a human-readable note worth displaying
  const commentEvents = rows.filter(r => {
    const notes = r.event_notes || '';
    if (!notes && !r.metadata?.note && !r.metadata?.comment) return false;
    // Skip pure state-change events with no additional note
    try {
      const p = JSON.parse(notes);
      const note = p.note || p.comment || '';
      // Exclude auto-generated notes that are just state transitions with no human text
      if (!note || note.startsWith('Reviewer current_user')) return false;
      return true;
    } catch(e) { return !!notes; }
  }).reverse();

  if (!commentEvents.length) {
    el.innerHTML = '<div style="padding:12px 14px;font-size:12px;color:var(--muted);font-family:Arial,sans-serif;font-style:italic">No comments recorded.</div>';
    return;
  }

  const isReject = (type) => !!(type?.includes('reject') || type?.includes('rejected'));
  const fmt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  };

  el.innerHTML = commentEvents.map(r => {
    const who     = r.actor_name || r.actor_id || 'System';
    // event_notes is stored as JSON string — parse and extract the human note
    let text = '';
    const rawNotes = r.event_notes || '';
    try {
      const parsed = JSON.parse(rawNotes);
      // Extract the most human-readable field
      text = parsed.note || parsed.comment || parsed.message ||
             (parsed.from && parsed.to ? `${parsed.from} → ${parsed.to}` : '') ||
             rawNotes;
    } catch(e) {
      text = rawNotes; // not JSON — use as-is
    }
    if (!text && r.metadata) {
      text = r.metadata?.note || r.metadata?.comment || '';
    }
    const color   = isReject(r.event_type) ? '#dc2626' : 'var(--cad)';
    const badge   = isReject(r.event_type) ? '✗ Rejected' : '● Note';
    const ini     = who.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();

    return `<div style="padding:10px 14px;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
        <div style="width:24px;height:24px;border-radius:50%;background:var(--surf3);
          display:flex;align-items:center;justify-content:center;
          font-size:13px;font-weight:700;color:var(--text);flex-shrink:0">${escHtml(ini)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:600;color:var(--text);font-family:Arial,sans-serif">${escHtml(who)}</div>
          <div style="font-size:13px;color:var(--muted);font-family:Arial,sans-serif">${fmt(r.created_at)}</div>
        </div>
        <span style="font-size:13px;font-weight:700;color:${color};
          font-family:Arial,sans-serif;flex-shrink:0">${badge}</span>
      </div>
      <div style="font-size:14px;color:var(--text1);line-height:1.6;font-family:Arial,sans-serif;
        padding:8px 10px;background:var(--surf2);border-radius:4px;
        border-left:3px solid ${color}">
        ${escHtml(text)}
      </div>
    </div>`;
  }).join('');
}

async function _formShowRolePanel() {
  document.getElementById('form-preview-role-panel')?.remove();
  const bodyRow = document.getElementById('form-body-row');
  if (!bodyRow) return;

  const panel = document.createElement('div');
  panel.id = 'form-preview-role-panel';
  panel.style.cssText = [
    'width:200px;min-width:180px;flex-shrink:0',
    'background:var(--bg1)',
    'border-left:1px solid var(--border)',
    'display:flex;flex-direction:column',
    'font-family:Arial,sans-serif',
    'overflow:hidden',
  ].join(';');
  bodyRow.appendChild(panel);

  // Load real people from category
  const cat         = window.FormSettings?.getCategoryById?.(_selectedForm?.category_id);
  const reviewerIds = cat?.reviewer_ids || [];
  const approverId  = cat?.approver_id  || null;
  let   people      = {};

  const allIds = [...new Set([...reviewerIds, ...(approverId ? [approverId] : [])])];
  if (allIds.length) {
    const rows = await API.get(
      `resources?id=in.(${allIds.join(',')})&select=id,user_id,first_name,last_name,email`
    ).catch(() => []) || [];
    rows.forEach(r => {
      people[r.id] = {
        name:    ((r.first_name||'')+' '+(r.last_name||'')).trim(),
        email:   r.email || '',
        user_id: r.user_id,
      };
    });
  }

  window._fprPeople      = people;
  window._fprReviewerIds = reviewerIds;
  window._fprApproverId  = approverId;
  _formRefreshRolePanel();
}

function _formRefreshRolePanel() {
  const panel = document.getElementById('form-preview-role-panel');
  if (!panel) return;

  const state       = _selectedForm?.state || 'draft';
  const people      = window._fprPeople      || {};
  const reviewerIds = window._fprReviewerIds || [];
  const approverId  = window._fprApproverId  || null;
  const reviewedBy  = _selectedForm?.reviewed_by || [];

  const isInReview     = state === 'in_review';
  const isReviewed     = state === 'reviewed';
  const isApproved     = state === 'approved';
  const isReleased     = state === 'released';
  const isEditorActive = ['draft','unreleased','rejected_review','rejected_approval','rejected_release'].includes(state);

  const editorName = window.CURRENT_USER?.name || window.CURRENT_USER?.email || 'Editor';
  const editorIni  = editorName.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();

  const personRow = ({ ini, name, role, roleColor, statusLabel, statusColor, isActive }) => `
    <div style="padding:12px 14px;
      background:${isActive ? 'var(--surf2)' : 'transparent'};
      border-left:3px solid ${isActive ? roleColor : 'transparent'}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div style="width:36px;height:36px;border-radius:50%;flex-shrink:0;
          background:${roleColor}22;border:2px solid ${roleColor};
          display:flex;align-items:center;justify-content:center;
          font-size:13px;font-weight:700;color:${roleColor}">${ini}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:${isActive?'700':'500'};
            color:${isActive?'var(--text)':'var(--text1)'};
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(name)}</div>
          <div style="font-size:13px;color:var(--muted);font-family:Arial,sans-serif">${escHtml(role)}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;padding-left:46px">
        <div style="width:8px;height:8px;border-radius:50%;background:${statusColor};flex-shrink:0"></div>
        <span style="font-size:14px;color:${statusColor};font-weight:600;font-family:Arial,sans-serif">${statusLabel}</span>
      </div>
    </div>`;

  const divider = `<div style="height:1px;background:var(--border);margin:2px 0"></div>`;

  const editorDot = isEditorActive ? '#60a5fa' : '#4ade80';
  const editorLbl = !isEditorActive
    ? (isReleased ? 'Released' : 'Complete')
    : state === 'draft'             ? 'Drafting'
    : state === 'rejected_release'  ? 'Revising — Release Rejected'
    : state === 'rejected_review'   ? 'Revising — Review Rejected'
    : state === 'rejected_approval' ? 'Revising — Approval Rejected'
    : 'Revising';

  let html = `
    <div style="padding:10px 12px;border-bottom:1px solid var(--border);flex-shrink:0">
      <div style="font-size:14px;font-weight:700;color:var(--text);letter-spacing:.06em;
        text-transform:uppercase;font-family:Arial,sans-serif">Approval Process</div>
    </div>
    <div style="flex:1;overflow-y:auto">`;

  html += personRow({ ini:editorIni, name:editorName, role:'Editor',
    roleColor:'var(--accent)', isActive:isEditorActive,
    statusLabel:editorLbl, statusColor:editorDot });

  if (reviewerIds.length) {
    html += divider;
    reviewerIds.forEach(rid => {
      const p   = people[rid] || { name:rid, email:'' };
      const ini = p.name.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
      // hasReviewed: true if their id is in reviewed_by OR state has moved past in_review
      const hasReviewed = reviewedBy.includes(rid)
        || ['reviewed','approved','released'].includes(state);
      const isActiveReviewer = isInReview && !reviewedBy.includes(rid);
      const lbl = hasReviewed ? 'Approved'
        : isActiveReviewer ? 'Reviewing'
        : state === 'rejected_review' ? 'Rejected'
        : 'Pending';
      const col = hasReviewed ? 'var(--green)'
        : isActiveReviewer ? 'var(--cad)'
        : state === 'rejected_review' ? 'var(--red)'
        : 'var(--muted)';
      html += personRow({ ini, name:p.name, role:'Reviewer',
        roleColor:'var(--cad)', isActive:isActiveReviewer,
        statusLabel:lbl, statusColor:col });
    });
  }

  if (approverId) {
    html += divider;
    const p   = people[approverId] || { name:approverId, email:'' };
    const ini = p.name.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
    const lbl = (isApproved||isReleased) ? 'Approved'
      : isReviewed ? 'Awaiting Approval'
      : state === 'rejected_approval' ? 'Rejected'
      : 'Pending';
    const col = (isApproved||isReleased) ? 'var(--green)'
      : isReviewed ? 'var(--cad)'
      : state === 'rejected_approval' ? 'var(--red)'
      : 'var(--muted)';
    html += personRow({ ini, name:p.name, role:'Approver',
      roleColor:'var(--green)', isActive:isReviewed,
      statusLabel:lbl, statusColor:col });
  }

  const stages = _formGetStages();
  html += `</div>
    <div style="padding:10px 12px;border-top:1px solid var(--border);flex-shrink:0">
      ${stages.length > 1 ? `
      <div style="display:flex;gap:4px;margin-bottom:8px">
        ${stages.map(s => {
          const LABELS = { assignee:'Assignee', reviewer:'Reviewer', approver:'Approver', pm:'PM', external:'External' };
          const COLORS = { reviewer:'var(--cad)', approver:'var(--green)', assignee:'var(--accent)' };
          const isActive = s.stage === _previewStage;
          const col = COLORS[s.role] || 'var(--muted)';
          return `<button onclick="_formSwitchPreviewStage(${s.stage})"
            style="flex:1;font-size:11px;padding:4px 4px;border-radius:6px;cursor:pointer;
              font-family:Arial,sans-serif;font-weight:600;transition:all .12s;
              background:${isActive ? col+'22' : 'transparent'};
              border:1px solid ${isActive ? col : 'var(--border)'};
              color:${isActive ? col : 'var(--muted)'}">${LABELS[s.role]||s.role}</button>`;
        }).join('')}
      </div>` : ''}
      <button onclick="_formTogglePreview()"
        style="font-size:14px;padding:8px 16px;border-radius:999px;
               background:rgba(255,255,255,.07);
               border:1px solid rgba(255,255,255,.3);
               color:var(--text);cursor:pointer;font-weight:600;
               font-family:Arial,sans-serif;width:100%;
               transition:all .15s"
        onmouseover="this.style.background='rgba(255,255,255,.14)'"
        onmouseout="this.style.background='rgba(255,255,255,.07)'">
        ✕ Exit Preview
      </button>
    </div>`;

  panel.innerHTML = html;
}

function _formSwitchPreviewStage(stage) {
  // Allow jumping to any stage (forward preview)
  _previewStage = stage;
  document.querySelectorAll('.form-preview-input-wrap').forEach(el => el.remove());
  _formRenderPreviewOverlay();
  _formRefreshRolePanel();
}

function _formPreviewQuickSign() {
  const name = prompt('Sign as (enter your name):');
  if (!name?.trim()) return;

  // Sign ALL signature fields for this stage across all pages
  const allSigFields = _formAllFieldsForStage(_previewStage).filter(f => f.type === 'signature');
  if (!allSigFields.length) {
    cadToast('No signature fields found for this stage', 'info'); return;
  }

  allSigFields.forEach(f => {
    _previewResponses[f.id] = name.trim();
    _formPreviewAutoDate(f);
  });

  // If sig fields are on a different page, navigate there
  const sigPages = [...new Set(allSigFields.map(f => f.page||1))];
  const currentPageSigs = allSigFields.filter(f => (f.page||1) === _pdfPage);

  const refresh = () => {
    document.querySelectorAll('.form-preview-input-wrap').forEach(el => el.remove());
    _formRenderPreviewOverlay();
    _formRefreshRolePanel();
  };

  if (!currentPageSigs.length && sigPages.length) {
    // Navigate to the page with the signature
    _pdfPage = sigPages[0];
    _updatePageIndicator();
    _renderPdfPage(_pdfStartPage + _pdfPage - 1).then(refresh);
  } else {
    refresh();
  }
  cadToast(`Signed as "${name.trim()}" on ${allSigFields.length} field(s)`, 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
// DB MIGRATION SQL (run in browser console: _formShowMigrationSQL())
// ─────────────────────────────────────────────────────────────────────────────

function _formShowMigrationSQL() {
  console.log(`-- Run in Supabase SQL editor
CREATE TABLE IF NOT EXISTS workflow_form_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID REFERENCES workflow_template_steps(id) ON DELETE CASCADE,
  firm_id UUID NOT NULL,
  source_path TEXT, source_name TEXT, page_count INTEGER DEFAULT 1,
  archetype TEXT DEFAULT 'data_entry' CHECK (archetype IN ('checklist','data_entry')),
  fields JSONB NOT NULL DEFAULT '[]', routing JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS workflow_form_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_id UUID, form_def_id UUID NOT NULL REFERENCES workflow_form_definitions(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL DEFAULT 1, field_id TEXT NOT NULL, value TEXT, note TEXT,
  filled_by UUID, filled_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_form_responses_unique_field ON workflow_form_responses(instance_id,step_id,stage,field_id);
  `);
}