// cdn-form-editor.js — Cadence: Form Library tab
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

function renderFormsTab(el) {
  el.innerHTML = `
    <div style="display:flex;width:100%;height:100%;overflow:hidden">

      <!-- ── Left column: form list ───────────────────────────────── -->
      <div style="width:220px;min-width:220px;border-right:1px solid var(--border);
                  display:flex;flex-direction:column;background:var(--bg1)">
        <div style="padding:10px 14px;border-bottom:1px solid var(--border);
                    display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <span style="font-size:10px;font-weight:600;letter-spacing:.14em;
                       text-transform:uppercase;color:var(--muted)">Form Library</span>
          <button class="btn btn-cad btn-sm" onclick="_formUploadClick()"
            style="font-size:10px;padding:3px 9px">↑ Import</button>
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
    return `<div style="padding:24px 14px;text-align:center;font-size:11px;
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
        <div style="font-size:10px;color:var(--muted);margin-top:2px;display:flex;gap:8px">
          <span>${fieldCount} field${fieldCount !== 1 ? 's' : ''}</span>
          <span>${f.page_count || '?'} page${(f.page_count || 1) !== 1 ? 's' : ''}</span>
          ${_routingBadge(f)}
        </div>
      </div>`;
  }).join('');
}

function _routingBadge(form) {
  const mode = form.routing?.mode || 'serial';
  return `<span style="color:${mode === 'parallel' ? 'var(--accent)' : 'var(--amber)'};font-size:10px">
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
      <div style="font-size:11px;max-width:280px;text-align:center;line-height:1.7;color:var(--muted)">
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
        <span style="font-size:13px;font-weight:500;color:var(--text);
                     flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${escHtml(f.source_name || 'Untitled')}
        </span>
        <!-- Page navigation -->
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <button id="form-page-prev" onclick="_formPrevPage()" class="btn btn-ghost btn-sm"
            style="padding:3px 8px">‹</button>
          <span id="form-page-indicator"
            style="font-size:10px;color:var(--muted);white-space:nowrap;font-family:var(--font-mono)">
            ${_pdfPage} / ${_pdfTotalPages}
          </span>
          <button id="form-page-next" onclick="_formNextPage()" class="btn btn-ghost btn-sm"
            style="padding:3px 8px">›</button>
        </div>
        <div style="width:1px;height:18px;background:var(--border);flex-shrink:0"></div>
        <!-- Zoom -->
        <button onclick="_formZoomOut()" class="btn btn-ghost btn-sm"
          style="padding:3px 8px">−</button>
        <button onclick="_formZoomIn()"  class="btn btn-ghost btn-sm"
          style="padding:3px 8px">+</button>
        <div style="width:1px;height:18px;background:var(--border);flex-shrink:0"></div>
        <div style="width:1px;height:18px;background:var(--border);flex-shrink:0"></div>
        <!-- Mode toggle: Select vs Draw -->
        <div style="display:flex;gap:0;border:1px solid var(--border);border-radius:4px;overflow:hidden;flex-shrink:0">
          <button id="form-mode-select" onclick="_formSetMode('select')"
            title="Select & move fields (S)"
            style="padding:3px 10px;font-size:10px;border:none;cursor:pointer;
                   background:var(--cad);color:var(--bg0);transition:all .12s">⊹ Select</button>
          <button id="form-mode-draw" onclick="_formSetMode('draw')"
            title="Draw new field (D)"
            style="padding:3px 10px;font-size:10px;border:none;border-left:1px solid var(--border);
                   cursor:pointer;background:transparent;color:var(--muted);transition:all .12s">✎ Draw</button>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="_formDelete('${f.id}')"
          style="color:var(--red);font-size:10px">🗑 Remove</button>
        <button class="btn btn-solid btn-sm" onclick="_formSave()"
          style="font-size:10px">Save</button>
      </div>

      <!-- ── Three-column body ────────────────────────────────────── -->
      <div style="flex:1;display:flex;overflow:hidden;min-height:0">

        <!-- Column 1: Document canvas -->
        <div style="flex:1;overflow:auto;background:var(--bg);position:relative;min-width:0"
          id="form-canvas-wrap">
          <div style="display:flex;justify-content:center;padding:24px 20px;min-height:100%">
          <div style="display:inline-block;position:relative;flex-shrink:0">
            <canvas id="form-pdf-canvas" style="display:block;box-shadow:0 4px 24px rgba(0,0,0,.5)"></canvas>
            <!-- SVG overlay for field rectangles -->
            <svg id="form-field-overlay" style="position:absolute;top:0;left:0;
              pointer-events:all;overflow:visible;cursor:crosshair"
              width="100%" height="100%"
              onmousedown="_formSvgMouseDown(event)"
              onmousemove="_formSvgMouseMove(event)"
              onmouseup="_formSvgMouseUp(event)">
            </svg>
            <!-- Interaction layer: transparent rect over SVG handles both select + draw -->
            <div id="form-draw-layer" style="position:absolute;top:0;left:0;
              width:100%;height:100%;cursor:crosshair;display:none">
            </div>
          </div>
          </div>
          <div style="padding:6px 20px 4px;font-size:10px;color:var(--muted);
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
              <span style="font-size:10px;font-weight:600;letter-spacing:.14em;
                           text-transform:uppercase;color:var(--muted)">
                Fields <span style="font-weight:400;color:var(--text3)">(${totalFields})</span>
              </span>
              <span id="form-sel-count" style="font-size:10px;color:var(--cad);display:none">0 selected</span>
            </div>
            <!-- Arrange toolbar — shown when 2+ fields selected -->
            <div id="form-arrange-bar" style="display:none;flex-direction:column;gap:4px">
              <div style="display:flex;gap:3px;flex-wrap:wrap">
                <button onclick="_formArrange('align-left')"   title="Align Left"          class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:10px">⬤←</button>
                <button onclick="_formArrange('align-right')"  title="Align Right"         class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:10px">→⬤</button>
                <button onclick="_formArrange('align-top')"    title="Align Top"           class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:10px">⬤↑</button>
                <button onclick="_formArrange('align-bottom')" title="Align Bottom"        class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:10px">↓⬤</button>
                <button onclick="_formArrange('center-h')"     title="Center Horizontal"   class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:10px">↔</button>
                <button onclick="_formArrange('center-v')"     title="Center Vertical"     class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:10px">↕</button>
                <button onclick="_formArrange('dist-h')"       title="Distribute Horizontally" class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:10px">⇹H</button>
                <button onclick="_formArrange('dist-v')"       title="Distribute Vertically"   class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:10px">⇹V</button>
              </div>
              <button onclick="_formClearSelection()" style="font-size:10px;background:none;border:none;color:var(--muted);cursor:pointer;text-align:left;padding:0">✕ Clear selection</button>
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
            <span style="font-size:10px;font-weight:600;letter-spacing:.14em;
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

function _renderFieldList() {
  if (!_formFields.length) {
    return `<div style="padding:16px 14px;font-size:11px;color:var(--muted);line-height:1.8;text-align:center">
              No fields detected yet.<br/>Draw rectangles on the document<br/>to add fields manually.
            </div>`;
  }

  return _formFields.map((field, idx) => {
    const roleConf = FORM_ROLES[field.role] || FORM_ROLES.assignee;
    const typeIcon = { text:'T', date:'📅', number:'#', checkbox:'☑', signature:'✍', textarea:'¶' }[field.type] || 'T';

    return `
      <div id="frow-${field.id}"
        style="padding:7px 12px;border-bottom:1px solid var(--border);
               display:flex;align-items:flex-start;gap:8px;cursor:pointer;
               transition:background .1s"
        onmouseenter="this.style.background='var(--surf2)'"
        onmouseleave="this.style.background=''"
        onclick="_formSelectField('${field.id}')">

        <!-- Type badge -->
        <div style="flex-shrink:0;width:20px;height:20px;border-radius:3px;
                    background:rgba(255,255,255,.05);border:1px solid var(--border2);
                    display:flex;align-items:center;justify-content:center;
                    font-size:10px;color:var(--text2);margin-top:1px">
          ${typeIcon}
        </div>

        <!-- Label + meta -->
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;color:var(--text1);white-space:nowrap;
                      overflow:hidden;text-overflow:ellipsis;margin-bottom:2px">
            ${escHtml(field.label || 'Unlabelled')}
          </div>
          <div style="display:flex;align-items:center;gap:5px">
            <span style="font-size:10px;padding:1px 5px;border-radius:3px;
                         background:${roleConf.dim};color:${roleConf.color}">
              ${roleConf.label}
            </span>
            ${field.required ? `<span style="font-size:10px;color:var(--red)">required</span>` : ''}
            <span style="font-size:10px;color:var(--muted)">p${field.page || 1}</span>
          </div>
        </div>

        <!-- Delete -->
        <button onclick="event.stopPropagation();_formRemoveField('${field.id}')"
          style="background:none;border:none;color:var(--muted);cursor:pointer;
                 font-size:11px;padding:0;opacity:0;transition:opacity .15s;flex-shrink:0"
          onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0"
          title="Remove field">✕</button>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTING PANEL (Column 3) — the key UI you described
// ─────────────────────────────────────────────────────────────────────────────

function _renderRoutingPanel(roles) {
  const mode = _formRouting.mode || 'serial';
  const isSerial = mode === 'serial';

  if (!roles.length) {
    return `<div style="font-size:11px;color:var(--muted);line-height:1.8">
              Assign roles to fields to configure routing.
            </div>`;
  }

  return `
    <!-- Mode selector -->
    <div style="margin-bottom:16px">
      <div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
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
          <div style="font-size:11px;font-weight:600;color:${isSerial ? 'var(--text)' : 'var(--text2)'}">
            Serial
          </div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px;line-height:1.5">
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
          <div style="font-size:11px;font-weight:600;color:${!isSerial ? 'var(--text)' : 'var(--text2)'}">
            Parallel
          </div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px;line-height:1.5">
            All roles notified simultaneously. Any can fill in any order.
          </div>
        </div>
      </label>
    </div>

    <!-- Role sequence (shown always; drag handle only active in serial mode) -->
    <div>
      <div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
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
        <div style="font-size:10px;color:var(--amber);line-height:1.5">
          ↓ Top role receives the form first. Each subsequent role is notified only after the role above submits.
        </div>
      </div>` : `
      <div style="margin-top:10px;padding:8px 10px;border-radius:4px;
                  background:rgba(79,142,247,.06);border:1px solid rgba(79,142,247,.2)">
        <div style="font-size:10px;color:var(--accent);line-height:1.5">
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
          ? `<span style="font-size:10px;font-weight:700;color:var(--muted);
                         width:14px;text-align:center;flex-shrink:0">${idx + 1}</span>`
          : `<span style="font-size:12px;color:var(--accent);flex-shrink:0">⇉</span>`}

        <!-- Role colour dot + label -->
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:7px;height:7px;border-radius:50%;
                        background:${roleConf.color};flex-shrink:0"></div>
            <span style="font-size:11px;font-weight:600;color:${roleConf.color}">
              ${roleConf.label}
            </span>
          </div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">
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

function _formSelectField(fieldId) {
  const field = _formFields.find(f => f.id === fieldId);
  if (!field) return;

  // Remove any existing popover
  document.getElementById('field-edit-popover')?.remove();

  const row = document.getElementById(`frow-${fieldId}`);
  if (!row) return;

  const popover = document.createElement('div');
  popover.id = 'field-edit-popover';
  popover.style.cssText = `
    position:fixed;z-index:200;background:var(--bg2);
    border:1px solid var(--border2);border-radius:6px;
    padding:14px;width:220px;
    box-shadow:0 8px 32px rgba(0,0,0,.6);
  `;

  // Position relative to the row
  const rect = row.getBoundingClientRect();
  popover.style.top  = rect.top + 'px';
  popover.style.left = (rect.right + 8) + 'px';

  const roleOptions = Object.entries(FORM_ROLES).map(([key, conf]) =>
    `<option value="${key}" ${field.role === key ? 'selected' : ''}>${conf.label}</option>`
  ).join('');

  const typeOptions = FIELD_TYPES.map(t =>
    `<option value="${t}" ${field.type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
  ).join('');

  popover.innerHTML = `
    <div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
                color:var(--muted);margin-bottom:10px">Edit Field</div>

    <div style="margin-bottom:8px">
      <label class="config-label">Label</label>
      <input class="config-input" id="fedit-label" value="${escHtml(field.label || '')}"
        placeholder="Field label" style="font-size:11px"
        oninput="_formUpdateField('${fieldId}','label',this.value)"/>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
      <div>
        <label class="config-label">Type</label>
        <select class="config-select" style="font-size:11px"
          onchange="_formUpdateField('${fieldId}','type',this.value)">
          ${typeOptions}
        </select>
      </div>
      <div>
        <label class="config-label">Role</label>
        <select class="config-select" style="font-size:11px"
          onchange="_formUpdateField('${fieldId}','role',this.value)">
          ${roleOptions}
        </select>
      </div>
    </div>

    <div style="margin-bottom:10px">
      <label class="config-toggle">
        <div class="toggle-box${field.required ? ' on' : ''}" id="fedit-req-toggle"
          onclick="_formToggleRequired('${fieldId}')"></div>
        <span style="font-size:11px">Required</span>
      </label>
    </div>

    <button onclick="document.getElementById('field-edit-popover')?.remove()"
      class="btn btn-ghost btn-sm" style="width:100%;font-size:11px">Done</button>
  `;

  document.body.appendChild(popover);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!popover.contains(e.target) && !row.contains(e.target)) {
        popover.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 50);

  // Highlight corresponding SVG rect on canvas
  _highlightFieldRect(fieldId);
}

function _formUpdateField(fieldId, key, value) {
  const field = _formFields.find(f => f.id === fieldId);
  if (!field) return;
  field[key] = value;

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
  _formFields = _formFields.filter(f => f.id !== fieldId);
  const listEl = document.getElementById('form-field-list');
  if (listEl) listEl.innerHTML = _renderFieldList();
  _reRenderRoutingPanel();
  _renderFieldOverlays();
  document.getElementById('field-edit-popover')?.remove();
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG OVERLAY — field rectangles on the canvas
// ─────────────────────────────────────────────────────────────────────────────

function _renderFieldOverlays() {
  const svg = document.getElementById('form-field-overlay');
  if (!svg) return;

  const currentPageFields = _formFields.filter(f => (f.page || 1) === _pdfPage);

  svg.innerHTML = currentPageFields.map(field => {
    const roleConf = FORM_ROLES[field.role] || FORM_ROLES.assignee;
    const r = field.rect || { x: 0, y: 0, w: 80, h: 18 };
    const x = r.x * _pdfScale, y = r.y * _pdfScale;
    const w = r.w * _pdfScale, h = r.h * _pdfScale;

    return `
      <g class="field-rect-group" data-field-id="${field.id}"
        style="cursor:pointer" onclick="_formSelectField('${field.id}')">
        <rect x="${x}" y="${y}" width="${w}" height="${h}"
          fill="${roleConf.dim}" stroke="${roleConf.color}" stroke-width="1.5"
          rx="2" opacity="0.85"/>
        <rect x="${x}" y="${y - 16}" width="${Math.min(w, 90)}" height="14"
          fill="${roleConf.color}" rx="2" opacity="0.9"/>
        <text x="${x + 4}" y="${y - 5}"
          fill="white" font-size="10" font-family="monospace"
          style="pointer-events:none">
          ${escHtml((field.label || 'field').slice(0, 14))}
        </text>
      </g>`;
  }).join('');
}

function _highlightFieldRect(fieldId) {
  document.querySelectorAll('.field-rect-group rect:first-child').forEach(r => {
    r.style.strokeWidth = '1.5';
    r.style.filter = '';
  });
  const group = document.querySelector(`.field-rect-group[data-field-id="${fieldId}"]`);
  if (group) {
    const rect = group.querySelector('rect');
    if (rect) {
      rect.style.strokeWidth = '2.5';
      rect.style.filter = 'drop-shadow(0 0 4px currentColor)';
    }
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
  event.preventDefault();
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
    const isCopy = drag.isCopy || event.ctrlKey || event.metaKey;
    svg.style.cursor = _formMode === 'draw' ? 'crosshair' : 'default';

    if (drag.hasMoved) {
      if (isCopy) {
        // COPY: create duplicates at the new positions, return originals to start
        const newIds = [];
        drag.fields.forEach(({ field, origX, origY }) => {
          const newId  = 'copy_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
          const copyField = {
            ...JSON.parse(JSON.stringify(field)), // deep clone
            id:        newId,
            detection: 'manual',
            label:     field.label ? field.label + ' (copy)' : '',
          };
          // Copy lands at the dragged position; original snaps back
          copyField.rect.x = field.rect.x;
          copyField.rect.y = field.rect.y;
          field.rect.x = origX;
          field.rect.y = origY;
          _formFields.push(copyField);
          newIds.push(newId);
        });
        // Select the copies
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
      // No movement — it was a click; open edit popover for the hit field
      const group = event.target.closest('.field-rect-group');
      if (group) _formSelectField(group.dataset.fieldId);
    }

    _svgGroupDrag = null;
    return;
  }
}



// ─────────────────────────────────────────────────────────────────────────────
// FIELD RECT HIGHLIGHT
// ─────────────────────────────────────────────────────────────────────────────

function _highlightFieldRect(fieldId) {
  document.querySelectorAll('.field-rect-group rect:first-child').forEach(r => {
    r.style.strokeWidth = '1.5';
    r.style.filter = '';
  });
  const group = document.querySelector(`.field-rect-group[data-field-id="${fieldId}"]`);
  if (group) {
    const rect = group.querySelector('rect');
    if (rect) {
      rect.style.strokeWidth = '2.5';
      rect.style.filter = 'drop-shadow(0 0 4px currentColor)';
    }
  }
}

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

function _formZoomIn()  { _pdfScale = Math.min(3, _pdfScale * 1.25); _renderPdfPage(_pdfStartPage + _pdfPage - 1); }
function _formZoomOut() { _pdfScale = Math.max(0.5, _pdfScale * 0.8); _renderPdfPage(_pdfStartPage + _pdfPage - 1); }

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
        <div style="font-size:11px;color:var(--muted)">${totalPages} page${totalPages !== 1 ? 's' : ''}</div>
      </div>
      <div style="width:min(420px,80%);display:flex;flex-direction:column;gap:8px">
        <div style="height:4px;background:var(--surf3);border-radius:2px;overflow:hidden">
          <div id="import-progress-bar"
            style="height:100%;width:0%;background:var(--cad);border-radius:2px;
                   transition:width .35s cubic-bezier(.4,0,.2,1)"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div id="import-progress-stage" style="font-size:11px;color:var(--muted);font-family:var(--font-mono)">Initialising…</div>
          <div id="import-progress-pct"   style="font-size:11px;color:var(--cad);font-family:var(--font-mono);font-weight:600">0%</div>
        </div>
      </div>
      <div id="import-page-dots" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:360px;min-height:20px">
        ${Array.from({length: totalPages}, (_, i) =>
          `<div id="import-dot-${i+1}" style="width:10px;height:10px;border-radius:50%;background:var(--surf3);transition:background .2s" title="Page ${i+1}"></div>`
        ).join('')}
      </div>
      <div id="import-progress-detail" style="font-size:10px;color:var(--muted);text-align:center;min-height:16px;font-family:var(--font-mono)"></div>
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
    <div style="font-size:11px;color:var(--muted);margin-bottom:12px;line-height:1.6">
      This form has no formal sign-off field. Add an approval stage with a digital signature?
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-solid btn-sm" style="flex:1;font-size:11px"
        onclick="_addApprovalSignatureField();this.closest('[style]').remove()">Yes, add sign-off</button>
      <button class="btn btn-ghost btn-sm" style="flex:1;font-size:11px;color:var(--muted)"
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
      <div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
                  color:var(--muted);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
        Fill Stages
        <button onclick="_formAddStage()" class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 8px">+ Stage</button>
      </div>
      <div id="form-stage-list" style="display:flex;flex-direction:column;gap:8px">
        ${stages.map((stage,si) => _renderStageRow(stage,si,stages.length)).join('')}
      </div>
      <div style="margin-top:12px;padding:8px 10px;border-radius:4px;background:rgba(196,125,24,.06);border:1px solid var(--cad-wire)">
        <div style="font-size:10px;color:var(--muted);line-height:1.5">Each stage activates only after the previous stage is fully complete.</div>
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
                    display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${roleConf.color};flex-shrink:0">${si+1}</div>
        <select class="config-select" style="flex:1;font-size:11px;padding:3px 6px" onchange="_formUpdateStageRole(${stage.stage},this.value)">
          ${Object.entries(FORM_ROLES).map(([key,conf])=>`<option value="${key}" ${stage.role===key?'selected':''}>${conf.label}</option>`).join('')}
        </select>
        ${totalStages>1?`<button onclick="_formRemoveStage(${stage.stage})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;padding:0;flex-shrink:0">✕</button>`:''}
      </div>
      <div style="padding:8px 10px">
        <div class="config-toggle" onclick="_formToggleStageParallel(${stage.stage})" style="display:flex;align-items:center;gap:7px;cursor:pointer;margin-bottom:6px">
          <div class="toggle-box${stage.parallel_within_stage?' on':''}"></div>
          <span style="font-size:10px;color:var(--text2)">${stage.parallel_within_stage?'All notified at once':'Serial counter-sign'}</span>
        </div>
        <div style="font-size:10px;color:var(--muted)">${fieldCount} field${fieldCount!==1?'s':''} assigned${si>0?` · activates after Stage ${si}`:' · activates on step start'}</div>
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

const _renderFieldListBase = _renderFieldList;
function _renderFieldList() {
  if (!_formFields.length) {
    return `<div style="padding:16px 14px;font-size:11px;color:var(--muted);line-height:1.8;text-align:center">
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
                    display:flex;align-items:center;justify-content:center;font-size:10px;color:${typeMeta.color};margin-top:1px">${typeMeta.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;color:var(--text1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px">${escHtml(field.label||'Unlabelled')}</div>
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
            <span style="font-size:10px;padding:1px 5px;border-radius:3px;background:${roleConf.dim};color:${roleConf.color}">${roleConf.label}</span>
            <span style="font-size:10px;color:var(--muted)">${typeMeta.label}</span>
            ${field.required?`<span style="font-size:10px;color:var(--red)">req</span>`:''}
            ${field.stage?`<span style="font-size:10px;color:var(--muted)">S${field.stage}</span>`:''}
          </div>
        </div>
        <button onclick="event.stopPropagation();_formRemoveField('${field.id}')"
          style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;padding:0;opacity:0;transition:opacity .15s;flex-shrink:0"
          onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0" title="Remove field">✕</button>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// ENHANCED FIELD EDIT POPOVER (with stage assignment + full type list)
// ─────────────────────────────────────────────────────────────────────────────

const _formSelectFieldBase = _formSelectField;
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

  const roleOptions = Object.entries(FORM_ROLES).map(([key,conf])=>`<option value="${key}" ${field.role===key?'selected':''}>${conf.label}</option>`).join('');
  const typeOptions = (FIELD_TYPES_FULL||['text','date','number','checkbox','signature','textarea','review','doc_ref']).map(t=>{
    const meta = FIELD_TYPE_META?.[t]||{label:t};
    return `<option value="${t}" ${field.type===t?'selected':''}>${meta.label||t}</option>`;
  }).join('');
  const stages = _formRouting.stages || [];
  const stageOptions = stages.length > 1
    ? stages.map(s=>`<option value="${s.stage}" ${(field.stage||1)===s.stage?'selected':''}>Stage ${s.stage} — ${FORM_ROLES[s.role]?.label||s.role}</option>`).join('')
    : '';

  popover.innerHTML = `
    <div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
      Edit Field <span style="font-size:10px;color:${_fieldConfidenceColor(field)};font-weight:400">${field.detection||''}</span>
    </div>
    <div style="margin-bottom:8px"><label class="config-label">Label</label>
      <input class="config-input" value="${escHtml(field.label||'')}" placeholder="Field label" style="font-size:11px" oninput="_formUpdateField('${fieldId}','label',this.value)"/></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
      <div><label class="config-label">Type</label>
        <select class="config-select" style="font-size:11px" onchange="_formUpdateField('${fieldId}','type',this.value)">${typeOptions}</select></div>
      <div><label class="config-label">Role</label>
        <select class="config-select" style="font-size:11px" onchange="_formUpdateField('${fieldId}','role',this.value)">${roleOptions}</select></div>
    </div>
    ${stages.length>1?`<div style="margin-bottom:8px"><label class="config-label">Fill Stage</label>
      <select class="config-select" style="font-size:11px" onchange="_formUpdateField('${fieldId}','stage',parseInt(this.value))">${stageOptions}</select></div>`:''}
    <div style="margin-bottom:10px">
      <div class="config-toggle" onclick="_formToggleRequired('${fieldId}')" style="display:flex;align-items:center;gap:7px;cursor:pointer">
        <div class="toggle-box${field.required?' on':''}" id="fedit-req-toggle"></div>
        <span style="font-size:11px">Required</span>
      </div>
    </div>
    <button onclick="document.getElementById('field-edit-popover')?.remove()" class="btn btn-ghost btn-sm" style="width:100%;font-size:11px">Done</button>`;

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

const _renderFieldOverlaysBase = _renderFieldOverlays;
function _renderFieldOverlays() {
  const svg = document.getElementById('form-field-overlay');
  if (!svg) return;
  const currentPageFields = _formFields.filter(f => (f.page||1) === _pdfPage);
  svg.innerHTML = currentPageFields.map(field => {
    const roleConf  = FORM_ROLES[field.role] || FORM_ROLES.assignee;
    const confColor = _fieldConfidenceColor(field);
    const isSelected = _selectedFieldIds.has(field.id);
    const r = field.rect || { x:0, y:0, w:80, h:18 };
    const x = r.x * _pdfScale, y = r.y * _pdfScale;
    const w = r.w * _pdfScale, h = r.h * _pdfScale;
    const labelText = (field.label||'field').slice(0,16);
    const typeIcon  = FIELD_TYPE_META?.[field.type]?.icon || 'T';
    return `
      <g class="field-rect-group" data-field-id="${field.id}" style="cursor:pointer">
        <rect x="${x}" y="${y}" width="${w}" height="${h}"
          fill="${isSelected?roleConf.color.replace(')',',0.2)').replace('rgb','rgba'):roleConf.dim}"
          stroke="${isSelected?'var(--cad)':confColor}"
          stroke-width="${isSelected?'2.5':'1.5'}" rx="2" opacity="0.9"/>
        <rect x="${x}" y="${y}" width="${Math.min(w,110)}" height="16" fill="${confColor}" rx="2" opacity="0.88"/>
        <text x="${x+4}" y="${y+11}" fill="white" font-size="10" font-family="monospace" style="pointer-events:none">
          ${typeIcon} ${escHtml(labelText)}
        </text>
        ${field.required?`<text x="${x+w-10}" y="${y+h-4}" fill="var(--red)" font-size="10" font-family="sans-serif" style="pointer-events:none">*</text>`:''}
      </g>`;
  }).join('');
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
      const url = await _getSignedUrl(form.source_path);
      _pdfDoc = await pdfjsLib.getDocument(url).promise;
      _pdfTotalPages = _pdfDoc.numPages;
      await _renderPdfPage(1);
      _updatePageIndicator();
    } catch(e) { cadToast('Could not load document: ' + e.message, 'error'); }
  }
}

function _formDelete(formId) {
  if (!confirm('Remove this form definition? The source document is not deleted.')) return;
  _formDefs = _formDefs.filter(f => f.id !== formId);
  if (_selectedForm?.id === formId) { _selectedForm = null; _formFields = []; _pdfDoc = null; }
  const el = document.getElementById('cad-content');
  if (el) renderFormsTab(el);
}

async function _formSave() {
  if (!_selectedForm) return;
  _selectedForm.fields  = JSON.parse(JSON.stringify(_formFields));
  _selectedForm.routing = JSON.parse(JSON.stringify(_formRouting));
  if (_selectedForm._unsaved) {
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
      });
      if (rows?.[0]?.id) { _selectedForm.id = rows[0].id; _selectedForm._unsaved = false; delete _selectedForm._file; }
      cadToast('Form saved', 'success');
      const listEl = document.getElementById('form-list');
      if (listEl) listEl.innerHTML = _renderFormList();
    } catch(e) { cadToast('Save failed: ' + e.message, 'error'); }
  } else {
    await API.patch(`workflow_form_definitions?id=eq.${_selectedForm.id}`, {
      fields:_selectedForm.fields, routing:_selectedForm.routing,
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
    if (!group) {
      const svg = document.getElementById('form-field-overlay');
      const svgRect = svg?.getBoundingClientRect();
      if (!svgRect) return;
      const mx = event.clientX - svgRect.left, my = event.clientY - svgRect.top;
      _marqueeDrag = { startX:mx, startY:my, active:true };
      const mr = document.createElementNS('http://www.w3.org/2000/svg','rect');
      mr.id='form-marquee-rect';
      mr.setAttribute('x',mx); mr.setAttribute('y',my); mr.setAttribute('width',0); mr.setAttribute('height',0);
      mr.setAttribute('fill','rgba(79,142,247,.10)'); mr.setAttribute('stroke','rgba(79,142,247,.9)');
      mr.setAttribute('stroke-width','1.5'); mr.setAttribute('stroke-dasharray','none');
      mr.style.pointerEvents='none'; svg.appendChild(mr);
      if (!event.shiftKey) _formClearSelection();
      event.preventDefault(); return;
    }
  }
  _origSvgMouseDown(event);
};

// Override: rubber-band marquee rect update during drag
const _formSvgMouseMoveOverride = (event) => {
  if (_marqueeDrag?.active) {
    const svg = document.getElementById('form-field-overlay');
    const svgRect = svg?.getBoundingClientRect(); if (!svgRect) return;
    const mx = event.clientX-svgRect.left, my = event.clientY-svgRect.top;
    const mr = document.getElementById('form-marquee-rect');
    if (mr) {
      const x=Math.min(mx,_marqueeDrag.startX), y=Math.min(my,_marqueeDrag.startY);
      mr.setAttribute('x',x); mr.setAttribute('y',y);
      mr.setAttribute('width',Math.abs(mx-_marqueeDrag.startX));
      mr.setAttribute('height',Math.abs(my-_marqueeDrag.startY));
    }
    return;
  }
  _origSvgMouseMove(event);
};

// Override: commit marquee selection on mouseup
const _formSvgMouseUpOverride = (event) => {
  if (_marqueeDrag?.active) {
    const svg = document.getElementById('form-field-overlay');
    const svgRect = svg?.getBoundingClientRect();
    document.getElementById('form-marquee-rect')?.remove();
    if (svgRect) {
      const mx=event.clientX-svgRect.left, my=event.clientY-svgRect.top;
      const sx=Math.min(mx,_marqueeDrag.startX)/_pdfScale, sy=Math.min(my,_marqueeDrag.startY)/_pdfScale;
      const ex=Math.max(mx,_marqueeDrag.startX)/_pdfScale, ey=Math.max(my,_marqueeDrag.startY)/_pdfScale;
      if ((ex-sx)>8/_pdfScale && (ey-sy)>8/_pdfScale) {
        _formFields.filter(f=>(f.page||1)===_pdfPage).forEach(f => {
          const r=f.rect;
          if (r.x<ex && r.x+r.w>sx && r.y<ey && r.y+r.h>sy) _selectedFieldIds.add(f.id);
        });
        _formUpdateSelectionUI(); _renderFieldOverlays();
      }
    }
    _marqueeDrag = null; return;
  }
  _origSvgMouseUp(event);
};

// Patch the SVG element's inline handlers to use the override functions.
// The SVG uses onmousedown/move/up="..." string attributes, so we need to
// expose the overrides on window and update the attributes after render.
window._formSvgMouseDown = _formSvgMouseDownOverride;
window._formSvgMouseMove = _formSvgMouseMoveOverride;
window._formSvgMouseUp   = _formSvgMouseUpOverride;

function _formArrange(op) {
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
  if (e.key==='s'||e.key==='S') _formSetMode('select');
  if (e.key==='d'||e.key==='D') _formSetMode('draw');
  if (e.key==='Escape') _formClearSelection();
  if ((e.key==='Delete'||e.key==='Backspace') && _selectedFieldIds.size>0) {
    if (!confirm(`Delete ${_selectedFieldIds.size} selected field(s)?`)) return;
    _selectedFieldIds.forEach(id => { _formFields = _formFields.filter(f=>f.id!==id); });
    _selectedFieldIds.clear(); _formUpdateSelectionUI(); _renderFieldOverlays();
    const listEl=document.getElementById('form-field-list'); if(listEl) listEl.innerHTML=_renderFieldList();
  }
});

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