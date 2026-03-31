// cdn-form-editor.js — Cadence: Form Library tab
// VERSION: 20260331-060927
console.log('[cdn-form-editor] LOADED v20260331-060927');

// ─────────────────────────────────────────────────────────────────────────────
// FORM CoC PANEL — CSS (injected once)
// ─────────────────────────────────────────────────────────────────────────────
(function _injectFormCoCStyles() {
  if (document.getElementById('form-coc-styles')) return;
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
let _formDirty        = false; // true after first edit, cleared on save         // timestamp of last field click (double-click detection)
let _lastFieldClickId = null;      // field id of last click

// ── Role vocabulary ──────────────────────────────────────────────────────────
// Maps field.role values to display labels and colours
const FORM_ROLES = {
  assignee: { label: 'Assignee',  color: '#4f8ef7', dim: 'rgba(79,142,247,.15)' },
  reviewer: { label: 'Reviewer',  color: '#c47d18', dim: 'rgba(196,125,24,.15)' },
  pm:       { label: 'PM',        color: '#2a9d40', dim: 'rgba(42,157,64,.15)'  },
  external: { label: 'External',  color: '#7c4dff', dim: 'rgba(124,77,255,.15)' },
};

const FIELD_TYPES = ['text', 'date', 'number', 'checkbox', 'signature', 'textarea'];

// Extended type list including review (4-state) and doc_ref (paired number+rev)
const FIELD_TYPES_FULL = ['text', 'date', 'number', 'checkbox', 'signature', 'textarea', 'review', 'doc_ref'];

const FIELD_TYPE_META = {
  text:      { icon: 'T',  label: 'Text',      color: 'var(--text2)' },
  date:      { icon: '📅', label: 'Date',      color: 'var(--accent)' },
  number:    { icon: '#',  label: 'Number',    color: 'var(--text2)' },
  checkbox:  { icon: '☑', label: 'Checkbox',  color: 'var(--cad)' },
  signature: { icon: '✍', label: 'Signature', color: 'var(--amber)' },
  textarea:  { icon: '¶', label: 'Textarea',  color: 'var(--text2)' },
  review:    { icon: '◑', label: 'Review',    color: '#00b9c3' },
  doc_ref:   { icon: '⎘', label: 'Doc Ref',   color: 'var(--accent)' },
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
  return { draft:'Draft', unreleased:'Unreleased', pending_review:'Pending Review',
           pending_approval:'Pending Approval', released:'Released', archived:'Archived' }[state] || state;
}

function _formStateColor(state) {
  return { draft:'var(--muted)', unreleased:'var(--amber)', pending_review:'var(--accent)',
           pending_approval:'var(--cad)', released:'var(--green)', archived:'var(--muted)' }[state] || 'var(--muted)';
}

function renderFormsTab(el) {
  el.innerHTML = `
    <div style="display:flex;width:100%;height:100%;overflow:hidden">

      <!-- ── Left column: form list ───────────────────────────────── -->
      <div style="width:220px;min-width:220px;border-right:1px solid var(--border);
                  display:flex;flex-direction:column;background:var(--bg1)">
        <div style="padding:10px 14px;border-bottom:1px solid var(--border);
                    display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <span style="font-size:12px;font-weight:600;letter-spacing:.14em;
                       text-transform:uppercase;color:var(--muted)">Form Library</span>
          <button class="btn btn-cad btn-sm" onclick="_formUploadClick()"
            style="font-size:12px;padding:3px 9px">↑ Import</button>
        </div>
        <div id="form-list" style="flex:1;overflow-y:auto;padding:6px 0">
          ${_renderFormList()}
        </div>
        <!-- Hidden file input -->
        <input type="file" id="form-file-input" accept=".pdf,.doc,.docx"
          style="display:none" onchange="_formFileChosen(event)"/>
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
    const fieldCount = (f.fields || []).length;
    return `
      <div onclick="_formSelect('${f.id}')"
        style="padding:9px 14px;cursor:pointer;border-left:2px solid ${sel ? 'var(--cad)' : 'transparent'};
               background:${sel ? 'var(--surf3)' : 'transparent'};transition:background .1s">
        <div style="font-size:12px;font-weight:500;color:${sel ? 'var(--text)' : 'var(--text1)'};
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${escHtml(f.source_name || 'Untitled form')}
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;display:flex;gap:8px">
          <span>${fieldCount} field${fieldCount !== 1 ? 's' : ''}</span>
          <span>${f.page_count || '?'} page${(f.page_count || 1) !== 1 ? 's' : ''}</span>
          ${_routingBadge(f)}
        </div>
      </div>`;
  }).join('');
}

function _routingBadge(form) {
  const mode = form.routing?.mode || 'serial';
  return `<span style="color:${mode === 'parallel' ? 'var(--accent)' : 'var(--amber)'};font-size:12px">
    ${mode === 'parallel' ? '⇉ parallel' : '↓ serial'}
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
        Import a PDF or Word document — CadenceHUD will detect fields automatically.
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

      <!-- ── Editor toolbar ─────────────────────────────────────────── -->
      <div style="display:flex;align-items:center;gap:10px;padding:8px 14px;
                  border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg2)">
        <!-- Name (editable) -->
        <input id="form-name-input" value="${escHtml(f.source_name || 'Untitled')}"
          style="font-size:13px;font-weight:500;color:var(--text);flex:1;min-width:80px;
                 background:transparent;border:none;border-bottom:1px solid transparent;
                 outline:none;font-family:Arial,sans-serif;padding:2px 4px;
                 transition:border-color .15s"
          onfocus="this.style.borderBottomColor='var(--cad)'"
          onblur="this.style.borderBottomColor='transparent';_formRenameCurrent(this.value)"
          oninput="_formMarkDirty()"
          onkeydown="if(event.key==='Enter')this.blur()"
          title="Click to rename — press Enter to confirm"/>
        <!-- State · Version · Category group -->
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
          <span style="font-size:11px;padding:2px 8px;border-radius:999px;
                       background:var(--surf2);border:1px solid var(--border);
                       color:${_formStateColor(f.state||'draft')};font-family:Arial,sans-serif">
            ${_formStateLabel(f.state||'draft')}
          </span>
          <span style="font-size:11px;padding:2px 8px;border-radius:999px;
                       background:var(--surf2);border:1px solid var(--border);
                       color:var(--muted);font-family:Arial,sans-serif">
            ${f.version||'0.1.0'}
          </span>
          ${(() => { const cat = window.FormSettings?.getCategoryById?.(f.category_id); return cat ? `<span style="font-size:11px;padding:2px 8px;border-radius:999px;background:var(--cad-dim);border:1px solid var(--cad-wire);color:var(--cad);font-family:Arial,sans-serif">${escHtml(cat.name)}</span>` : `<button onclick="_formPickCategory()" style="font-size:11px;padding:2px 8px;border-radius:999px;background:transparent;border:1px solid var(--border);color:var(--muted);cursor:pointer;font-family:Arial,sans-serif">+ Category</button>`; })()}
        </div>
        <!-- Page navigation -->
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <button id="form-page-prev" onclick="_formPrevPage()" class="btn btn-ghost btn-sm"
            style="padding:3px 8px">‹</button>
          <span id="form-page-indicator"
            style="font-size:12px;color:var(--muted);white-space:nowrap;font-family:Arial,sans-serif">
            ${_pdfPage} / ${_pdfTotalPages}
          </span>
          <button id="form-page-next" onclick="_formNextPage()" class="btn btn-ghost btn-sm"
            style="padding:3px 8px">›</button>
        </div>
        <div style="width:1px;height:18px;background:var(--border);flex-shrink:0"></div>
        <!-- Zoom -->
        <div style="display:flex;align-items:center;gap:2px;flex-shrink:0">
          <button onclick="_formZoomOut()" class="btn btn-ghost btn-sm"
            style="padding:3px 8px;font-size:14px" title="Zoom out (−)">−</button>
          <span id="form-zoom-label"
            style="font-size:12px;color:var(--muted);font-family:Arial,sans-serif;
                   min-width:38px;text-align:center;cursor:pointer"
            onclick="_formZoomReset()" title="Click to reset to 100%">
            ${Math.round(_pdfScale * 100 / 1.5)}%
          </span>
          <button onclick="_formZoomIn()" class="btn btn-ghost btn-sm"
            style="padding:3px 8px;font-size:14px" title="Zoom in (+)">+</button>
          <button onclick="_formZoomFit()" class="btn btn-ghost btn-sm"
            style="padding:3px 8px;font-size:11px" title="Fit to width">⊡</button>
        </div>
        <div style="width:1px;height:18px;background:var(--border);flex-shrink:0"></div>
        <!-- Mode toggle: Select vs Draw -->
        <div style="display:flex;gap:0;border:1px solid var(--border);border-radius:4px;overflow:hidden;flex-shrink:0">
          <button id="form-mode-select" onclick="_formSetMode('select')"
            title="Select & move fields (S)"
            style="padding:3px 10px;font-size:12px;border:none;cursor:pointer;
                   background:var(--cad);color:var(--bg0);transition:all .12s">⊹ Select</button>
          <button id="form-mode-draw" onclick="_formSetMode('draw')"
            title="Draw new field (D)"
            style="padding:3px 10px;font-size:12px;border:none;border-left:1px solid var(--border);
                   cursor:pointer;background:transparent;color:var(--muted);transition:all .12s">✎ Draw</button>
        </div>
        <!-- H/W size widget — shown when fields selected -->
        <div id="form-hw-widget" style="display:none;align-items:center;gap:4px;flex-shrink:0">
          <div style="width:1px;height:18px;background:var(--border)"></div>
          <div style="display:flex;flex-direction:column;gap:2px">
            <div style="display:flex;align-items:center;gap:3px">
              <span style="font-size:12px;color:var(--muted);width:10px">H</span>
              <input id="form-hw-h" type="number" step="0.01" min="0.05"
                style="width:58px;font-size:12px;padding:1px 4px;background:var(--bg);
                       border:1px solid var(--border);border-radius:3px;color:var(--text);
                       font-family:Arial,sans-serif"
                onchange="_formHWChange('h',parseFloat(this.value))"
                onclick="this.select()"/>
              <div style="display:flex;flex-direction:column;gap:0">
                <button onclick="_formHWStep('h',1)"  style="font-size:8px;line-height:1;padding:0 3px;background:var(--surf2);border:1px solid var(--border);border-radius:2px 2px 0 0;cursor:pointer;color:var(--text2)">▲</button>
                <button onclick="_formHWStep('h',-1)" style="font-size:8px;line-height:1;padding:0 3px;background:var(--surf2);border:1px solid var(--border);border-top:none;border-radius:0 0 2px 2px;cursor:pointer;color:var(--text2)">▼</button>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:3px">
              <span style="font-size:12px;color:var(--muted);width:10px">W</span>
              <input id="form-hw-w" type="number" step="0.01" min="0.05"
                style="width:58px;font-size:12px;padding:1px 4px;background:var(--bg);
                       border:1px solid var(--border);border-radius:3px;color:var(--text);
                       font-family:Arial,sans-serif"
                onchange="_formHWChange('w',parseFloat(this.value))"
                onclick="this.select()"/>
              <div style="display:flex;flex-direction:column;gap:0">
                <button onclick="_formHWStep('w',1)"  style="font-size:8px;line-height:1;padding:0 3px;background:var(--surf2);border:1px solid var(--border);border-radius:2px 2px 0 0;cursor:pointer;color:var(--text2)">▲</button>
                <button onclick="_formHWStep('w',-1)" style="font-size:8px;line-height:1;padding:0 3px;background:var(--surf2);border:1px solid var(--border);border-top:none;border-radius:0 0 2px 2px;cursor:pointer;color:var(--text2)">▼</button>
              </div>
            </div>
          </div>
        </div>
        ${_formLifecycleButtons(f)}
      </div>

      <!-- ── Three-column body + CoC panel ──────────────────────── -->
      <div style="flex:1;display:flex;overflow:hidden;min-height:0">

        <!-- Column 1: Document canvas -->
        <div style="flex:1;overflow:auto;background:var(--bg);position:relative;min-width:0;isolation:isolate"
          id="form-canvas-wrap">
          <div style="display:inline-flex;justify-content:center;padding:24px 40px;min-height:100%;min-width:100%;box-sizing:border-box">
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
            <!-- Interaction layer: transparent rect over SVG handles both select + draw -->
            <div id="form-draw-layer" style="position:absolute;top:0;left:0;
              width:100%;height:100%;cursor:crosshair;display:none">
            </div>
          </div>
          </div>
          <div style="padding:6px 20px 4px;font-size:12px;color:var(--muted);
                      display:flex;align-items:center;gap:8px;flex-shrink:0">
            <span>✎ Click and drag on the document to add a field</span>
          </div>
        </div>

        <!-- Column 2: Field list -->
        <div id="form-col-fields" style="width:240px;min-width:160px;max-width:480px;
                    border-left:1px solid var(--border);display:flex;flex-direction:column;
                    background:var(--bg1);position:relative;flex-shrink:0">
          <!-- Drag handle -->
          <div style="position:absolute;left:-3px;top:0;bottom:0;width:6px;cursor:col-resize;
                      z-index:10;background:transparent;transition:background .15s"
            onmouseover="this.style.background='rgba(196,125,24,.3)'"
            onmouseout="if(!window._formDragCol)this.style.background='transparent'"
            onmousedown="_formColDragStart(event,'form-col-fields','left')"></div>
          <div style="padding:8px 10px;border-bottom:1px solid var(--border);flex-shrink:0">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:12px;font-weight:600;letter-spacing:.08em;
                           text-transform:uppercase;color:var(--muted)">
                Fields <span style="font-weight:400;color:var(--text3)">(${totalFields})</span>
              </span>
              <div style="display:flex;align-items:center;gap:6px">
                <button onclick="_formAutoRename()" class="btn btn-ghost btn-sm"
                  style="font-size:11px;padding:2px 8px" title="Auto-rename all fields by type and sequence">
                  ⟳ Rename
                </button>
                <span id="form-sel-count" style="font-size:12px;font-weight:600;color:var(--cad);display:none">0 selected</span>
              </div>
            </div>
            <!-- Arrange toolbar — shown when 2+ fields selected -->
            <div id="form-arrange-bar" style="display:none;flex-direction:column;gap:4px">
              <div style="display:flex;gap:3px;flex-wrap:wrap">
                <button onclick="_formArrange('align-left')"   title="Align Left"          class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:12px">⬤←</button>
                <button onclick="_formArrange('align-right')"  title="Align Right"         class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:12px">→⬤</button>
                <button onclick="_formArrange('align-top')"    title="Align Top"           class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:12px">⬤↑</button>
                <button onclick="_formArrange('align-bottom')" title="Align Bottom"        class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:12px">↓⬤</button>
                <button onclick="_formArrange('center-h')"     title="Center Horizontal"   class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:12px">↔</button>
                <button onclick="_formArrange('center-v')"     title="Center Vertical"     class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:12px">↕</button>
                <button onclick="_formArrange('dist-h')"       title="Distribute Horizontally" class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:12px">⇹H</button>
                <button onclick="_formArrange('dist-v')"       title="Distribute Vertically"   class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:12px">⇹V</button>
              </div>
              <button onclick="_formClearSelection()" style="font-size:12px;background:none;border:none;color:var(--muted);cursor:pointer;text-align:left;padding:0">✕ Clear selection</button>
            </div>
          </div>
          <div id="form-field-list" style="flex:1;overflow-y:auto;padding:4px 0">
            ${_renderFieldList()}
          </div>
        </div>

        <!-- Column 3: Routing panel -->
        <div id="form-col-routing" style="width:220px;min-width:140px;max-width:400px;
                    border-left:1px solid var(--border);display:flex;flex-direction:column;
                    background:var(--bg1);position:relative;flex-shrink:0">
          <!-- Drag handle -->
          <div style="position:absolute;left:-3px;top:0;bottom:0;width:6px;cursor:col-resize;
                      z-index:10;background:transparent;transition:background .15s"
            onmouseover="this.style.background='rgba(196,125,24,.3)'"
            onmouseout="if(!window._formDragCol)this.style.background='transparent'"
            onmousedown="_formColDragStart(event,'form-col-routing','left')"></div>
          <div style="padding:10px 14px;border-bottom:1px solid var(--border);flex-shrink:0">
            <span style="font-size:12px;font-weight:600;letter-spacing:.14em;
                         text-transform:uppercase;color:var(--muted)">Fill Routing</span>
          </div>
          <div style="flex:1;overflow-y:auto;padding:14px">
            ${_renderRoutingPanel(roles)}
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
// ROUTING PANEL (Column 3) — the key UI you described
// ─────────────────────────────────────────────────────────────────────────────

function _renderRoutingPanel(roles) {
  const mode = _formRouting.mode || 'serial';
  const isSerial = mode === 'serial';

  if (!roles.length) {
    return `<div style="font-size:12px;color:var(--muted);line-height:1.8">
              Assign roles to fields to configure routing.
            </div>`;
  }

  return `
    <!-- Mode selector -->
    <div style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
                  color:var(--muted);margin-bottom:10px">Fill Order</div>

      <!-- Serial radio -->
      <label style="display:flex;align-items:flex-start;gap:9px;cursor:pointer;
                    padding:8px 10px;border-radius:5px;margin-bottom:6px;
                    border:1px solid ${isSerial ? 'var(--cad-wire)' : 'var(--border)'};
                    background:${isSerial ? 'var(--cad-dim)' : 'transparent'};
                    transition:all .15s">
        <input type="radio" name="form-routing-mode" value="serial"
          ${isSerial ? 'checked' : ''}
          onchange="_formSetRoutingMode('serial')"
          style="margin-top:2px;accent-color:var(--cad);flex-shrink:0"/>
        <div>
          <div style="font-size:12px;font-weight:600;color:${isSerial ? 'var(--text)' : 'var(--text2)'}">
            Serial
          </div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;line-height:1.5">
            Roles fill in sequence.<br/>Each is notified only after the prior role submits.
          </div>
        </div>
      </label>

      <!-- Parallel radio -->
      <label style="display:flex;align-items:flex-start;gap:9px;cursor:pointer;
                    padding:8px 10px;border-radius:5px;
                    border:1px solid ${!isSerial ? 'var(--accent)' : 'var(--border)'};
                    background:${!isSerial ? 'rgba(79,142,247,.08)' : 'transparent'};
                    transition:all .15s">
        <input type="radio" name="form-routing-mode" value="parallel"
          ${!isSerial ? 'checked' : ''}
          onchange="_formSetRoutingMode('parallel')"
          style="margin-top:2px;accent-color:var(--accent);flex-shrink:0"/>
        <div>
          <div style="font-size:12px;font-weight:600;color:${!isSerial ? 'var(--text)' : 'var(--text2)'}">
            Parallel
          </div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;line-height:1.5">
            All roles notified simultaneously. Any can fill in any order.
          </div>
        </div>
      </label>
    </div>

    <!-- Role sequence (shown always; drag handle only active in serial mode) -->
    <div>
      <div style="font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
                  color:var(--muted);margin-bottom:8px;display:flex;align-items:center;gap:6px">
        Roles in this form
        ${isSerial ? `<span style="font-weight:400;color:var(--text3)">— drag to reorder</span>` : ''}
      </div>
      <div id="form-role-list" style="display:flex;flex-direction:column;gap:4px">
        ${_renderRoleRows(roles, isSerial)}
      </div>
      ${isSerial ? `
      <div style="margin-top:10px;padding:8px 10px;border-radius:4px;
                  background:rgba(196,125,24,.06);border:1px solid var(--cad-wire)">
        <div style="font-size:12px;color:var(--amber);line-height:1.5">
          ↓ Top role receives the form first. Each subsequent role is notified only after the role above submits.
        </div>
      </div>` : `
      <div style="margin-top:10px;padding:8px 10px;border-radius:4px;
                  background:rgba(79,142,247,.06);border:1px solid rgba(79,142,247,.2)">
        <div style="font-size:12px;color:var(--accent);line-height:1.5">
          ⇉ All roles receive the form simultaneously. The form step completes when all have submitted.
        </div>
      </div>`}
    </div>`;
}

function _renderRoleRows(roles, isSerial) {
  // roles is sorted by _formRouting.roles[].order when serial
  const ordered = _formRoutingRolesOrdered(roles);

  return ordered.map((r, idx) => {
    const roleConf = FORM_ROLES[r.role] || { label: r.role, color: 'var(--muted)', dim: 'rgba(255,255,255,.05)' };
    const fieldCount = (_formFields || []).filter(f => f.role === r.role).length;

    return `
      <div id="role-row-${r.role}"
        draggable="${isSerial}"
        ondragstart="${isSerial ? `_formRoleDragStart(event,'${r.role}')` : ''}"
        ondragover="${isSerial ? `_formRoleDragOver(event,'${r.role}')` : ''}"
        ondragleave="${isSerial ? `_formRoleDragLeave(event)` : ''}"
        ondrop="${isSerial ? `_formRoleDrop(event,'${r.role}')` : ''}"
        ondragend="${isSerial ? `_formRoleDragEnd()` : ''}"
        style="display:flex;align-items:center;gap:8px;padding:7px 10px;
               border-radius:5px;border:1px solid var(--border);
               background:var(--surf2);
               ${isSerial ? 'cursor:grab' : 'cursor:default'};
               transition:border-color .15s">

        <!-- Order number (serial) or parallel indicator -->
        ${isSerial
          ? `<span style="font-size:12px;font-weight:700;color:var(--muted);
                         width:14px;text-align:center;flex-shrink:0">${idx + 1}</span>`
          : `<span style="font-size:12px;color:var(--accent);flex-shrink:0">⇉</span>`}

        <!-- Role colour dot + label -->
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:7px;height:7px;border-radius:50%;
                        background:${roleConf.color};flex-shrink:0"></div>
            <span style="font-size:12px;font-weight:600;color:${roleConf.color}">
              ${roleConf.label}
            </span>
          </div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">
            ${fieldCount} field${fieldCount !== 1 ? 's' : ''}
          </div>
        </div>

        <!-- Drag handle (serial only) -->
        ${isSerial
          ? `<span style="font-size:13px;color:var(--border2);flex-shrink:0;
                         user-select:none;line-height:1">⠿</span>`
          : ''}
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

  // Re-render the field list row and routing panel
  const listEl = document.getElementById('form-field-list');
  if (listEl) listEl.innerHTML = _renderFieldList();
  _reRenderRoutingPanel();
  _renderFieldOverlays();
}

function _formToggleRequired(fieldId) {
  const field = _formFields.find(f => f.id === fieldId);
  if (!field) return;
  field.required = !field.required;
  const toggle = document.getElementById('fedit-req-toggle');
  if (toggle) toggle.className = 'toggle-box' + (field.required ? ' on' : '');
  const listEl = document.getElementById('form-field-list');
  if (listEl) listEl.innerHTML = _renderFieldList();
}

function _formRemoveField(fieldId) {
  _undoPush();
  _formFields = _formFields.filter(f => f.id !== fieldId);
  const listEl = document.getElementById('form-field-list');
  if (listEl) listEl.innerHTML = _renderFieldList();
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
  const listEl = document.getElementById('form-field-list');
  if (listEl) listEl.innerHTML = _renderFieldList();
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
  const selBtn = document.getElementById('form-mode-select');
  const drwBtn = document.getElementById('form-mode-draw');

  if (mode === 'draw') {
    if (svg) svg.style.cursor = 'crosshair';
    if (selBtn) { selBtn.style.background = 'transparent'; selBtn.style.color = 'var(--muted)'; }
    if (drwBtn) { drwBtn.style.background = 'var(--cad)';  drwBtn.style.color  = 'var(--bg0)'; }
  } else {
    if (svg) svg.style.cursor = 'default';
    if (selBtn) { selBtn.style.background = 'var(--cad)';  selBtn.style.color  = 'var(--bg0)'; }
    if (drwBtn) { drwBtn.style.background = 'transparent'; drwBtn.style.color = 'var(--muted)'; }
  }
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
      const listEl = document.getElementById('form-field-list');
      if (listEl) listEl.innerHTML = _renderFieldList();
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
      const listEl = document.getElementById('form-field-list');
      if (listEl) listEl.innerHTML = _renderFieldList();
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
  if (_pdfPage <= 1) return;
  _pdfPage--;
  _updatePageIndicator();
  _renderPdfPage(_pdfStartPage + _pdfPage - 1);
}

function _formNextPage() {
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

function _formColDragStart(event, colId) {
  const col = document.getElementById(colId);
  if (!col) return;
  window._formDragCol    = colId;
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
  const delta  = window._formDragStartX - e.clientX;
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
          role:/sign|approv|authoriz|review/i.test(label)?'reviewer':'assignee',
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
      role:/sign|approv|authoriz/i.test(f.label)?'reviewer':/pm|manager/i.test(f.label)?'pm':'assignee',
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
  const listEl = document.getElementById('form-field-list');
  if (listEl) listEl.innerHTML = _renderFieldList();
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
  const stages = _formRouting.stages || _migrateToStages();
  return `
    <div>
      <div style="font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
                  color:var(--muted);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
        Fill Stages
        <button onclick="_formAddStage()" class="btn btn-ghost btn-sm" style="font-size:12px;padding:2px 8px">+ Stage</button>
      </div>
      <div id="form-stage-list" style="display:flex;flex-direction:column;gap:8px">
        ${stages.map((stage,si) => _renderStageRow(stage,si,stages.length)).join('')}
      </div>
      <div style="margin-top:12px;padding:8px 10px;border-radius:4px;background:rgba(196,125,24,.06);border:1px solid var(--cad-wire)">
        <div style="font-size:12px;color:var(--muted);line-height:1.5">Each stage activates only after the previous stage is fully complete.</div>

        <!-- CoC panel: flex sibling of columns — aligns with field headers -->
        <div class="form-coc-panel" id="form-coc-panel">
          <div class="form-coc-resize" id="form-coc-resize" title="Drag to resize"></div>
          <div class="form-coc-inner">
            <div class="form-coc-header">
              <span class="form-coc-title">Chain of Custody</span>
              <button onclick="_formToggleCoC()" style="background:none;border:none;
                color:var(--muted);cursor:pointer;font-size:14px;padding:0;line-height:1">✕</button>
            </div>
            <div class="form-coc-body" id="form-coc-body">
              <div style="font-size:12px;color:var(--muted);text-align:center;padding-top:24px;font-family:Arial,sans-serif">
                No history yet.
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>`;
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
  const defaultRole = nextNum===2?'reviewer':nextNum>=3?'pm':'assignee';
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
  const routingCol = document.querySelector('#form-col-routing');
  if (routingCol) {
    const inner = routingCol.querySelector('[style*="overflow-y:auto"]') ||
                  routingCol.querySelector('[style*="overflow-y: auto"]');
    if (inner) inner.innerHTML = _renderStageRoutingPanel();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENHANCED FIELD LIST (with confidence dots + stage badge)
// ─────────────────────────────────────────────────────────────────────────────

// _renderFieldList — sole authoritative definition
function _renderFieldList() {
  if (!_formFields.length) {
    return `<div style="padding:16px 14px;font-size:12px;color:var(--muted);line-height:1.8;text-align:center">
              No fields detected yet.<br/>Draw rectangles on the document<br/>to add fields manually.
            </div>`;
  }
  return _formFields.map((field) => {
    const roleConf   = FORM_ROLES[field.role] || FORM_ROLES.assignee;
    const typeMeta   = FIELD_TYPE_META[field.type] || FIELD_TYPE_META.text;
    const confColor  = _fieldConfidenceColor(field);
    const isSelected = _selectedFieldIds.has(field.id);
    return `
      <div id="frow-${field.id}"
        style="padding:7px 12px;border-bottom:1px solid var(--border);
               display:flex;align-items:flex-start;gap:8px;cursor:pointer;
               transition:background .1s;
               background:${isSelected?'var(--cad-dim)':'transparent'};
               border-left:2px solid ${isSelected?'var(--cad)':'transparent'}"
        onmouseenter="if(!_selectedFieldIds.has('${field.id}'))this.style.background='var(--surf2)'"
        onmouseleave="if(!_selectedFieldIds.has('${field.id}'))this.style.background=''"
        onclick="_formFieldListClick(event,'${field.id}')">
        <div style="width:6px;height:6px;border-radius:50%;background:${confColor};flex-shrink:0;margin-top:5px" title="Detection: ${field.detection||'unknown'}"></div>
        <div style="flex-shrink:0;width:20px;height:20px;border-radius:3px;background:rgba(255,255,255,.05);border:1px solid var(--border2);
                    display:flex;align-items:center;justify-content:center;font-size:12px;color:${typeMeta.color};margin-top:1px">${typeMeta.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:var(--text1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px">${escHtml(field.label||'Unlabelled')}</div>
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
            <span style="font-size:12px;padding:1px 5px;border-radius:3px;background:${roleConf.dim};color:${roleConf.color}">${roleConf.label}</span>
            <span style="font-size:12px;color:var(--muted)">${typeMeta.label}</span>
            ${field.required?`<span style="font-size:12px;color:var(--red)">req</span>`:''}
            ${field.stage?`<span style="font-size:12px;color:var(--muted)">S${field.stage}</span>`:''}
          </div>
        </div>
        <button onclick="event.stopPropagation();_formRemoveField('${field.id}')"
          style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:12px;padding:0;opacity:0;transition:opacity .15s;flex-shrink:0"
          onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0" title="Remove field">✕</button>
      </div>`;
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
      <span style="font-size:12px;color:${_fieldConfidenceColor(field)};font-weight:400">${isMulti?'multi':'${field.detection||""}'}</span>
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
  const svg = document.getElementById('form-field-overlay');
  if (!svg) return;
  if (_marqueeDrag?.active) return;

  const sel = _selectedFieldIds;
  if (sel.size > 0) {
    const firstId = [...sel][0];
    const firstField = _formFields.find(f => f.id === firstId);
    console.log('[overlay] sel ids:', [...sel].slice(0,3), '| first field.id:', firstField?.id, '| match:', firstField?.id === firstId);
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
  const selFields = [...sel].map(id => _formFields.find(f => f.id === id)).filter(Boolean);
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
  } else {
    console.warn('[formSelect] no source_path on form:', form.id);
    cadToast('No document stored for this form', 'info');
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

function _formLifecycleButtons(f) {
  const state = f.state || 'draft';
  const locked = ['pending_review','pending_approval','released','archived'].includes(state);
  const btns = [];

  // Separator then Remove
  btns.push(`<div style="width:1px;height:18px;background:var(--border);flex-shrink:0"></div>`);
  btns.push(`<button class="btn btn-ghost btn-sm" onclick="_formDeleteWithConfirm('${f.id}')"
    style="color:var(--red);font-size:12px">🗑 Remove</button>`);
  btns.push(`<button class="btn btn-ghost btn-sm" onclick="_formToggleCoC()" id="form-coc-btn"
    title="Chain of Custody history">CoC</button>`);

  if (state === 'draft' || state === 'unreleased') {
    btns.push(`<button id="form-save-btn" class="${_formDirty?'btn btn-solid btn-sm':'btn btn-ghost btn-sm'}" onclick="_formSave()" style="font-size:12px">Save</button>`);
    if (f.category_id) {
      btns.push(`<button class="btn btn-cad btn-sm" onclick="_formSubmitForReview()" style="font-size:12px">Submit for Review →</button>`);
    } else {
      // No category = no approval gate — can release directly
      btns.push(`<button onclick="_formReleaseDirectly()" style="font-size:12px;padding:3px 12px;border-radius:999px;background:var(--green);color:white;border:none;cursor:pointer;font-family:Arial,sans-serif">Release</button>`);
    }
  }

  if (state === 'pending_review') {
    btns.push(`<span style="font-size:12px;color:var(--accent);font-family:Arial,sans-serif">Awaiting review</span>`);
    btns.push(`<button class="btn btn-cad btn-sm" onclick="_formApproveReview()" style="font-size:12px">✓ Approve Review</button>`);
    btns.push(`<button class="btn btn-ghost btn-sm" onclick="_formRejectToUnreleased()" style="font-size:12px;color:var(--red)">✗ Reject</button>`);
  }

  if (state === 'pending_approval') {
    btns.push(`<span style="font-size:12px;color:var(--cad);font-family:Arial,sans-serif">Awaiting approval</span>`);
    btns.push(`<button onclick="_formApproveAndRelease()" style="font-size:12px;padding:3px 14px;border-radius:999px;background:var(--green);color:white;border:none;cursor:pointer;font-family:Arial,sans-serif">✓ Approve & Release</button>`);
    btns.push(`<button class="btn btn-ghost btn-sm" onclick="_formRejectToUnreleased()" style="font-size:12px;color:var(--red)">✗ Reject</button>`);
  }

  if (state === 'released') {
    btns.push(`<button class="btn btn-ghost btn-sm" onclick="_formCreateRevision()" style="font-size:12px">Create Revision</button>`);
    btns.push(`<button class="btn btn-ghost btn-sm" onclick="_formArchive()" style="font-size:12px;color:var(--muted)">Archive</button>`);
  }

  if (state === 'archived') {
    btns.push(`<span style="font-size:12px;color:var(--muted);font-family:Arial,sans-serif">[Archived — read only]</span>`);
  }

  return btns.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// REMOVE WITH DB CONFIRM
// ─────────────────────────────────────────────────────────────────────────────
async function _formDeleteWithConfirm(formId) {
  const form = _formDefs.find(f => f.id === formId);
  const name = form?.source_name || 'this form';
  const inDB = form && !form._unsaved;
  const msg = inDB
    ? `Remove "${name}" from the Form Library?\n\nThis will permanently delete the form definition from the database. The source PDF in Storage will be retained.`
    : `Remove "${name}" from the Form Library?`;
  if (!confirm(msg)) return;

  if (inDB) {
    try {
      // Use apikey-only delete (matches RLS public role pattern)
      const res = await fetch(`${SUPA_URL}/rest/v1/workflow_form_definitions?id=eq.${formId}`, {
        method:'DELETE',
        headers:{ 'apikey':SUPA_KEY, 'Authorization':'Bearer '+SUPA_KEY,
                  'Content-Type':'application/json', 'Prefer':'return=minimal' }
      });
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
      _formCoCWrite('form.archived', formId, { action:'deleted', name });
      cadToast(`"${name}" removed from library`, 'info');
    } catch(e) { cadToast('Delete failed: ' + e.message, 'error'); return; }
  }

  _formDefs = _formDefs.filter(f => f.id !== formId);
  if (_selectedForm?.id === formId) { _selectedForm = null; _formFields = []; _pdfDoc = null; }
  const el = document.getElementById('cad-content');
  if (el) renderFormsTab(el);
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY PICKER
// ─────────────────────────────────────────────────────────────────────────────
async function _formPickCategory() {
  const cats = window.FormSettings?.getCategories?.() || [];
  if (!cats.length) {
    cadToast('No categories configured — add them in Settings', 'info'); return;
  }
  // Simple inline picker modal
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:8px;
                padding:20px;min-width:300px;box-shadow:0 16px 48px rgba(0,0,0,.7)">
      <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:14px;font-family:Arial,sans-serif">
        Select Category
      </div>
      ${cats.map(c=>`
        <div onclick="_formSetCategory('${c.id}');document.getElementById('fs-cat-picker').remove()"
          style="padding:10px 12px;border-radius:5px;cursor:pointer;border:1px solid var(--border);
                 margin-bottom:6px;background:var(--surf2);transition:border-color .12s"
          onmouseover="this.style.borderColor='var(--cad)'" onmouseout="this.style.borderColor='var(--border)'">
          <div style="font-size:13px;font-weight:500;color:var(--text);font-family:Arial,sans-serif">${escHtml(c.name)}</div>
          <div style="font-size:11px;color:var(--muted);font-family:Arial,sans-serif">${escHtml(c.description||'')}</div>
        </div>`).join('')}
      <button onclick="document.getElementById('fs-cat-picker').remove()"
        style="margin-top:8px;width:100%;padding:6px;border-radius:999px;background:transparent;
               border:1px solid var(--border);color:var(--muted);cursor:pointer;font-family:Arial,sans-serif">
        Cancel
      </button>
    </div>`;
  overlay.id = 'fs-cat-picker';
  document.body.appendChild(overlay);
}

function _formSetCategory(catId) {
  if (!_selectedForm) return;
  _selectedForm.category_id = catId;
  const cat = window.FormSettings?.getCategoryById?.(catId);
  // Init version format from category
  if (cat && (!_selectedForm.version || _selectedForm.version === '0.1.0')) {
    _selectedForm.version = _formInitVersion(cat.version_format);
  }
  const el = document.getElementById('cad-content');
  if (el) renderFormsTab(el);
}

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE STATE TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────────
async function _formSubmitForReview() {
  if (!_selectedForm) return;
  const cat = window.FormSettings?.getCategoryById?.(_selectedForm.category_id);
  const baseReviewers = cat?.reviewer_ids || [];

  // Let author add more reviewers via PersonPicker
  const addMore = confirm('Submit for review? Click OK to proceed, or add more reviewers first.');
  if (!addMore) return;

  _selectedForm.state = 'pending_review';
  _selectedForm.pending_reviewer_ids = [...baseReviewers];
  _selectedForm.reviewed_by = [];
  await _formSave();
  _formCoCWrite('form.state_changed', _selectedForm.id, { from:'draft', to:'pending_review', note:'Submitted for review' });
  cadToast('Submitted for review', 'success');
  const el = document.getElementById('cad-content');
  if (el) renderFormsTab(el);
}

async function _formApproveReview() {
  if (!_selectedForm) return;
  const userId = window.CURRENT_USER?.id || 'current_user';
  _selectedForm.reviewed_by = [...(_selectedForm.reviewed_by||[]), userId];
  const allReviewed = (_selectedForm.pending_reviewer_ids||[]).every(id =>
    (_selectedForm.reviewed_by||[]).includes(id)
  ) || (_selectedForm.pending_reviewer_ids||[]).length === 0;

  if (allReviewed) {
    _selectedForm.state = 'pending_approval';
    _formCoCWrite('form.state_changed', _selectedForm.id, { from:'pending_review', to:'pending_approval', note:'All reviewers approved' });
    cadToast('Review complete — awaiting final approval', 'success');
  } else {
    _formCoCWrite('form.state_changed', _selectedForm.id, { from:'pending_review', to:'pending_review', note:`Reviewer ${userId} approved` });
    cadToast('Your review recorded', 'info');
  }
  await _formSave();
  const el = document.getElementById('cad-content');
  if (el) renderFormsTab(el);
}

async function _formApproveAndRelease() {
  if (!_selectedForm) return;
  const cat = window.FormSettings?.getCategoryById?.(_selectedForm.category_id);
  const fmt = cat?.version_format || 'semver';
  const newVer = _formBumpVersion(_selectedForm.version, fmt, 'minor');
  const note = prompt(`Release as version ${newVer}. Add a release note (optional):`)||'';

  // Mark prior released version as superseded
  const priorReleased = _formDefs.find(f =>
    f.id !== _selectedForm.id &&
    f.state === 'released' &&
    f.source_name === _selectedForm.source_name
  );

  _selectedForm.state       = 'released';
  _selectedForm.version     = newVer;
  _selectedForm.released_at = new Date().toISOString();
  _selectedForm.approved_by = window.CURRENT_USER?.id || null;
  _selectedForm.review_note = note;

  await _formSave();

  if (priorReleased) {
    priorReleased.superseded_by = _selectedForm.id;
    await API.patch(`workflow_form_definitions?id=eq.${priorReleased.id}`,
      { superseded_by: _selectedForm.id }).catch(()=>{});
  }

  _formCoCWrite('form.released', _selectedForm.id, { version:newVer, note, supersedes:priorReleased?.id });
  cadToast(`Released as ${newVer}`, 'success');
  const el = document.getElementById('cad-content');
  if (el) renderFormsTab(el);
}

async function _formReleaseDirectly() {
  if (!_selectedForm) return;
  const note = prompt('Release this form? Add a release note (optional):')||'';
  _selectedForm.state       = 'released';
  _selectedForm.released_at = new Date().toISOString();
  _selectedForm.review_note = note;
  await _formSave();
  _formCoCWrite('form.released', _selectedForm.id, { version:_selectedForm.version, note });
  cadToast(`Released ${_selectedForm.version}`, 'success');
  const el = document.getElementById('cad-content');
  if (el) renderFormsTab(el);
}

async function _formRejectToUnreleased() {
  if (!_selectedForm) return;
  const note = prompt('Reason for rejection (required):');
  if (!note?.trim()) { cadToast('Rejection note is required', 'error'); return; }
  const from = _selectedForm.state;
  _selectedForm.state = _selectedForm.version === _formInitVersion(
    window.FormSettings?.getCategoryById?.(_selectedForm.category_id)?.version_format||'semver'
  ) ? 'draft' : 'unreleased';
  _selectedForm.review_note = note;
  await _formSave();
  _formCoCWrite('form.state_changed', _selectedForm.id, { from, to:_selectedForm.state, note });
  cadToast('Returned for revision', 'info');
  const el = document.getElementById('cad-content');
  if (el) renderFormsTab(el);
}

async function _formCreateRevision() {
  if (!_selectedForm) return;
  if (!confirm(`Create a new revision of "${_selectedForm.source_name}"? The current Released version will remain active until the new revision is released.`)) return;
  _selectedForm.state = 'unreleased';
  await _formSave();
  _formCoCWrite('form.state_changed', _selectedForm.id, { from:'released', to:'unreleased', note:'Revision started' });
  cadToast('Revision opened for editing', 'info');
  const el = document.getElementById('cad-content');
  if (el) renderFormsTab(el);
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
  if (!window.CoC?.write) { return; } // CoC not yet wired — silent skip
  try {
    window.CoC.write({
      entity_type: 'workflow_form_definition',
      entity_id:   formId,
      event_type:  eventType,
      details:     { ...details, form_name: _selectedForm?.source_name },
      actor_id:    window.CURRENT_USER?.id || null,
    });
  } catch(e) { console.warn('[form-editor] CoC write failed:', e.message); }
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
      _formCoCWrite('form.saved', _selectedForm.id, { version:_selectedForm.version, state:_selectedForm.state });
      const listEl = document.getElementById('form-list');
      if (listEl) listEl.innerHTML = _renderFormList();
    } catch(e) { cadToast('Save failed: ' + e.message, 'error'); }
  } else {
    await API.patch(`workflow_form_definitions?id=eq.${_selectedForm.id}`, {
      fields:        _selectedForm.fields,
      routing:       _selectedForm.routing,
      state:         _selectedForm.state         || 'draft',
      version:       _selectedForm.version       || '0.1.0',
      category_id:   _selectedForm.category_id   || null,
      superseded_by: _selectedForm.superseded_by || null,
      review_note:   _selectedForm.review_note   || null,
      pending_reviewer_ids: _selectedForm.pending_reviewer_ids || [],
      reviewed_by:   _selectedForm.reviewed_by   || [],
      approved_by:   _selectedForm.approved_by   || null,
      released_at:   _selectedForm.released_at   || null,
      archived_at:   _selectedForm.archived_at   || null,
    }).catch(e => cadToast('Save failed: ' + e.message, 'error'));
    cadToast('Form saved', 'success');
    const listEl = document.getElementById('form-list');
    if (listEl) listEl.innerHTML = _renderFormList();
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
    _formRevealField(fieldId);
    _formSelectField(fieldId);
  }
}

function _formClearSelection() {
  console.trace('[formClearSelection] called');
  _selectedFieldIds.clear();
  _formUpdateSelectionUI();
  _renderFieldOverlays();
  const listEl = document.getElementById('form-field-list');
  if (listEl) listEl.innerHTML = _renderFieldList();
}

function _formUpdateSelectionUI() {
  const count = _selectedFieldIds.size;
  const cntEl = document.getElementById('form-sel-count');
  const barEl = document.getElementById('form-arrange-bar');
  if (cntEl) { cntEl.textContent = `${count} selected`; cntEl.style.display = count > 0 ? '' : 'none'; }
  if (barEl) barEl.style.display = count >= 2 ? 'flex' : 'none';
  const listEl = document.getElementById('form-field-list');
  if (listEl) listEl.innerHTML = _renderFieldList();
  _updateHWWidget();
}


function _formUpdateMulti(key, value) {
  _undoPush();
  [..._selectedFieldIds].forEach(id => {
    const f = _formFields.find(f => f.id === id);
    if (f) f[key] = value;
  });
  const listEl = document.getElementById('form-field-list');
  if (listEl) listEl.innerHTML = _renderFieldList();
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
  const listEl = document.getElementById('form-field-list');
  if (listEl) listEl.innerHTML = _renderFieldList();
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
  const listEl = document.getElementById('form-field-list');
  if (listEl) listEl.innerHTML = _renderFieldList();
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
  if (e.key==='s'||e.key==='S') _formSetMode('select');
  if (e.key==='d'||e.key==='D') _formSetMode('draw');
  if (e.key==='Escape') _formClearSelection();
  if ((e.key==='Delete'||e.key==='Backspace') && _selectedFieldIds.size>0) {
    if (!confirm(`Delete ${_selectedFieldIds.size} selected field(s)?`)) return;
    _undoPush();
    _selectedFieldIds.forEach(id => { _formFields = _formFields.filter(f=>f.id!==id); });
    _selectedFieldIds.clear(); _formUpdateSelectionUI(); _renderFieldOverlays();
    const listEl=document.getElementById('form-field-list'); if(listEl) listEl.innerHTML=_renderFieldList();
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

function _formToggleCoC() {
  const panel  = document.getElementById('form-coc-panel');
  const cocBtn = document.getElementById('form-coc-btn');
  if (!panel) return;
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

  bodyEl.innerHTML = rows.map(e => {
    const color = evtColor[e.event_type] || 'var(--cad)';
    const label = evtLabel[e.event_type] || e.event_type;
    const det   = e.details || {};
    const lines = [];

    if (det.version)   lines.push(`Version: ${det.version}`);
    if (det.state)     lines.push(`State: ${det.state}`);
    if (det.from && det.to) lines.push(`${det.from} → ${det.to}`);
    if (det.note)      lines.push(det.note);
    if (det.field_label && det.key) lines.push(`${det.field_label}: ${det.key} changed`);
    if (det.action)    lines.push(det.action);

    const noteHtml = lines.map(l =>
      `<div style="font-size:11px;color:var(--text2);line-height:1.7;font-family:Arial,sans-serif">
         · ${escHtml(String(l))}
       </div>`
    ).join('');

    const who = e.actor_name || e.actor_id || 'System';
    const ver = det.version ? `<div style="font-size:11px;color:var(--muted);font-family:Arial,sans-serif">${escHtml(det.version)}</div>` : '';

    return `
      <div class="form-coc-event">
        <div class="form-coc-dot" style="background:${color}"></div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <div style="color:${color};font-weight:700;font-size:11px;
              text-transform:uppercase;letter-spacing:.08em;font-family:Arial,sans-serif">${escHtml(label)}</div>
            ${ver}
          </div>
          ${noteHtml}
          <div class="form-coc-who">${escHtml(who)} · ${typeof fmtTs === 'function' ? fmtTs(e.created_at) : (e.created_at||'').slice(0,16).replace('T',' ')}</div>
        </div>
      </div>`;
  }).join('');
}

// Refresh CoC if panel is open (called after saves/state changes)
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