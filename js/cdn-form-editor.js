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

  // If hit field is not in current selection, make it the sole selection
  // (unless shift/ctrl is held for additive selection — handled by _formFieldListClick)
  if (!_selectedFieldIds.has(fieldId)) {
    _selectedFieldIds.clear();
    _selectedFieldIds.add(fieldId);
    _formUpdateSelectionUI();
  }

  // Build the drag group: all currently selected fields on this page
  const dragFields = [..._selectedFieldIds]
    .map(id => _formFields.find(f => f.id === id))
    .filter(f => f && (f.page || 1) === _pdfPage)
    .map(f => ({ field: f, origX: f.rect.x, origY: f.rect.y }));

  _svgGroupDrag = {
    fields:    dragFields,
    startX:    mx,
    startY:    my,
    isCopy:    event.ctrlKey || event.metaKey,
    axisLock:  null,           // determined during move
    hasMoved:  false,
  };

  svg.style.cursor = (event.ctrlKey || event.metaKey) ? 'copy' : 'grabbing';
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

  // Axis lock: determined once movement exceeds 8px, stays locked for drag
  if (event.shiftKey && dist > 8) {
    if (!_svgGroupDrag.axisLock) {
      _svgGroupDrag.axisLock = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }
  } else if (!event.shiftKey) {
    _svgGroupDrag.axisLock = null; // shift released mid-drag — free again
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