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
    <div style="display:flex;height:100%;overflow:hidden">

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
      <div id="form-editor-main" style="flex:1;display:flex;overflow:hidden;min-width:0;width:100%;height:100%">
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
    <div style="width:100%;height:100%;display:flex;flex-direction:column;
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
          <div style="display:inline-block;position:relative;margin:20px">
            <canvas id="form-pdf-canvas" style="display:block;box-shadow:0 4px 24px rgba(0,0,0,.5)"></canvas>
            <!-- SVG overlay for field rectangles -->
            <svg id="form-field-overlay" style="position:absolute;top:0;left:0;
              pointer-events:none;overflow:visible"
              width="100%" height="100%">
            </svg>
            <!-- Draw interaction layer -->
            <div id="form-draw-layer" style="position:absolute;top:0;left:0;
              width:100%;height:100%;cursor:crosshair"
              onmousedown="_formDrawStart(event)"
              onmousemove="_formDrawMove(event)"
              onmouseup="_formDrawEnd(event)">
            </div>
          </div>
          <div style="padding:6px 20px 4px;font-size:10px;color:var(--muted);
                      display:flex;align-items:center;gap:8px;flex-shrink:0">
            <span>✎ Click and drag on the document to add a field</span>
          </div>
        </div>

        <!-- Column 2: Field list -->
        <div style="width:240px;min-width:240px;border-left:1px solid var(--border);
                    display:flex;flex-direction:column;background:var(--bg1)">
          <div style="padding:10px 14px;border-bottom:1px solid var(--border);
                      display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
            <span style="font-size:10px;font-weight:600;letter-spacing:.14em;
                         text-transform:uppercase;color:var(--muted)">
              Fields <span style="font-weight:400;color:var(--text3)">(${totalFields})</span>
            </span>
          </div>
          <div id="form-field-list" style="flex:1;overflow-y:auto;padding:4px 0">
            ${_renderFieldList()}
          </div>
        </div>

        <!-- Column 3: Routing panel -->
        <div style="width:220px;min-width:220px;border-left:1px solid var(--border);
                    display:flex;flex-direction:column;background:var(--bg1)">
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
          onchange="_formSetMode('serial')"
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
          onchange="_formSetMode('parallel')"
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

function _formSetMode(mode) {
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
          fill="white" font-size="8" font-family="monospace"
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

function _formDrawStart(event) {
  const layer = document.getElementById('form-draw-layer');
  if (!layer) return;
  const layerRect = layer.getBoundingClientRect();
  _drawingRect = {
    active: true,
    startX: event.clientX - layerRect.left,
    startY: event.clientY - layerRect.top,
  };
  // Create preview rect
  const preview = document.getElementById('form-draw-preview');
  if (preview) preview.remove();
  const p = document.createElement('div');
  p.id = 'form-draw-preview';
  p.style.cssText = `
    position:absolute;border:2px dashed var(--cad);background:var(--cad-dim);
    pointer-events:none;border-radius:2px;
    left:${_drawingRect.startX}px;top:${_drawingRect.startY}px;width:0;height:0
  `;
  layer.appendChild(p);
}

function _formDrawMove(event) {
  if (!_drawingRect?.active) return;
  const layer = document.getElementById('form-draw-layer');
  const preview = document.getElementById('form-draw-preview');
  if (!layer || !preview) return;
  const layerRect = layer.getBoundingClientRect();
  const curX = event.clientX - layerRect.left;
  const curY = event.clientY - layerRect.top;
  const x = Math.min(curX, _drawingRect.startX);
  const y = Math.min(curY, _drawingRect.startY);
  const w = Math.abs(curX - _drawingRect.startX);
  const h = Math.abs(curY - _drawingRect.startY);
  preview.style.left   = x + 'px';
  preview.style.top    = y + 'px';
  preview.style.width  = w + 'px';
  preview.style.height = h + 'px';
}

function _formDrawEnd(event) {
  if (!_drawingRect?.active) return;
  const layer = document.getElementById('form-draw-layer');
  const preview = document.getElementById('form-draw-preview');
  if (preview) preview.remove();
  if (!layer) { _drawingRect = null; return; }

  const layerRect = layer.getBoundingClientRect();
  const curX = event.clientX - layerRect.left;
  const curY = event.clientY - layerRect.top;
  const w = Math.abs(curX - _drawingRect.startX);
  const h = Math.abs(curY - _drawingRect.startY);

  if (w > 12 && h > 8) {
    // Convert canvas coords back to PDF points
    const x = Math.min(curX, _drawingRect.startX) / _pdfScale;
    const y = Math.min(curY, _drawingRect.startY) / _pdfScale;
    const fieldId = 'manual_' + Date.now();
    _formFields.push({
      id: fieldId,
      page: _pdfPage,
      rect: { x, y, w: w / _pdfScale, h: h / _pdfScale },
      label: '',
      type: 'text',
      role: 'assignee',
      required: false,
      detection: 'manual',
    });
    _renderFieldOverlays();
    const listEl = document.getElementById('form-field-list');
    if (listEl) listEl.innerHTML = _renderFieldList();
    _reRenderRoutingPanel();
    // Open the edit popover immediately for the new field
    setTimeout(() => _formSelectField(fieldId), 50);
  }

  _drawingRect = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF RENDERING (PDF.js)
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
    const page    = await _pdfDoc.getPage(pageNum);
    const vp      = page.getViewport({ scale: _pdfScale });
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
  if (prev) prev.style.opacity = (_pdfPage <= 1)             ? '0.3' : '';
  if (next) next.style.opacity = (_pdfPage >= _pdfTotalPages) ? '0.3' : '';
}

function _formZoomIn()  { _pdfScale = Math.min(3, _pdfScale * 1.25); _renderPdfPage(_pdfStartPage + _pdfPage - 1); }
function _formZoomOut() { _pdfScale = Math.max(0.5, _pdfScale * 0.8); _renderPdfPage(_pdfStartPage + _pdfPage - 1); }

// ─────────────────────────────────────────────────────────────────────────────
// FILE IMPORT — upload, detect fields, open editor
// ─────────────────────────────────────────────────────────────────────────────

function _formUploadClick() {
  document.getElementById('form-file-input')?.click();
}

// _formFileChosen (original stub removed — definitive version below)

async function _detectAcroFormFields(pdfDoc) {
  const fields = [];
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const annotations = await page.getAnnotations();

    for (const ann of annotations) {
      if (!ann.fieldType) continue; // not a form field
      const [x1, y1, x2, y2] = ann.rect;
      const vp = page.getViewport({ scale: 1 });
      // PDF coords are bottom-left origin; convert to top-left
      const x = Math.min(x1, x2);
      const y = vp.height - Math.max(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);

      const typeMap = { Tx: 'text', Btn: 'checkbox', Ch: 'text', Sig: 'signature' };

      // Infer role from field name heuristics
      const nameL = (ann.fieldName || '').toLowerCase();
      const role = nameL.includes('sign') || nameL.includes('approv') || nameL.includes('review')
        ? 'reviewer'
        : nameL.includes('pm') || nameL.includes('manager') || nameL.includes('authoriz')
          ? 'pm'
          : 'assignee';

      fields.push({
        id: 'acro_' + pageNum + '_' + fields.length,
        page: pageNum,
        rect: { x, y, w, h },
        label: ann.fieldName || ann.alternativeText || 'Field ' + (fields.length + 1),
        type: typeMap[ann.fieldType] || 'text',
        role,
        required: !!(ann.fieldFlags & 2),
        detection: 'acroform',
      });
    }

    // Also run text heuristics for non-AcroForm content
    const textContent = await page.getTextContent();
    const heuristicFields = _detectTextHeuristics(textContent, page, pageNum, fields.length);
    fields.push(...heuristicFields);
  }
  return fields;
}

function _detectTextHeuristics(textContent, page, pageNum, startIdx) {
  const found = [];
  const items = textContent.items;
  const vp = page.getViewport({ scale: 1 });

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const str  = item.str || '';
    const [, , , , tx, ty] = item.transform; // x, y in PDF coords
    const x = tx;
    const y = vp.height - ty;

    // Underscore run: Name: ____________
    if (/_{4,}/.test(str)) {
      const label = items.slice(Math.max(0, i - 2), i)
        .map(it => it.str).join(' ').replace(/:?\s*$/, '').trim();
      const underLen = (str.match(/_{4,}/)?.[0] || '').length;
      found.push({
        id: `heur_${pageNum}_${startIdx + found.length}`,
        page: pageNum,
        rect: { x: x, y: y - 4, w: underLen * 5, h: 14 },
        label: label || 'Text field',
        type: /date|dated|as of/i.test(label) ? 'date' : 'text',
        role: /sign|approv|authoriz|review/i.test(label) ? 'reviewer' : 'assignee',
        required: false,
        detection: 'heuristic:underscore',
      });
    }

    // Signature keyword
    if (/^(signature|sign here|authorized by|approved by|reviewed by)/i.test(str.trim())) {
      found.push({
        id: `heur_${pageNum}_${startIdx + found.length}`,
        page: pageNum,
        rect: { x, y: y + 2, w: 160, h: 22 },
        label: str.trim(),
        type: 'signature',
        role: /approv|authoriz/i.test(str) ? 'pm' : 'reviewer',
        required: true,
        detection: 'heuristic:signature_keyword',
      });
    }
  }

  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM SELECT / DELETE / SAVE
// ─────────────────────────────────────────────────────────────────────────────

async function _formSelect(formId) {
  const form = _formDefs.find(f => f.id === formId);
  if (!form) return;
  _selectedForm = form;
  _formFields   = JSON.parse(JSON.stringify(form.fields || []));
  _formRouting  = JSON.parse(JSON.stringify(form.routing || { mode: 'serial', roles: [] }));
  _pdfPage      = 1;
  _pdfDoc       = null; // will re-load

  const el = document.getElementById('cad-content');
  if (el) renderFormsTab(el);

  // If form has a stored path, load the PDF from storage
  if (form.source_path) {
    try {
      await _ensurePdfJs();
      const url = await _getSignedUrl(form.source_path);
      _pdfDoc = await pdfjsLib.getDocument(url).promise;
      _pdfTotalPages = _pdfDoc.numPages;
      await _renderPdfPage(1);
    } catch(e) {
      cadToast('Could not load document: ' + e.message, 'error');
    }
  }
}

function _formDelete(formId) {
  if (!confirm('Remove this form definition? The source document is not deleted.')) return;
  _formDefs = _formDefs.filter(f => f.id !== formId);
  if (_selectedForm?.id === formId) {
    _selectedForm = null;
    _formFields   = [];
    _pdfDoc       = null;
  }
  const el = document.getElementById('cad-content');
  if (el) renderFormsTab(el);
}

async function _formSave() {
  if (!_selectedForm) return;

  // Merge working state back
  _selectedForm.fields  = JSON.parse(JSON.stringify(_formFields));
  _selectedForm.routing = JSON.parse(JSON.stringify(_formRouting));

  // If local (just uploaded), persist to DB and storage
  if (_selectedForm._unsaved) {
    cadToast('Saving…', 'info');
    try {
      // Upload PDF to storage if we have the file
      if (_selectedForm._file) {
        const safeName = _selectedForm._file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const path     = `${FIRM_ID_CAD}/forms/${Date.now()}_${safeName}`;
        const token    = await Auth.getToken();
        const res = await fetch(`${SUPA_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
          method: 'POST',
          headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + token,
                     'Content-Type': _selectedForm._file.type || 'application/pdf',
                     'x-upsert': 'true' },
          body: _selectedForm._file,
        });
        if (!res.ok) throw new Error('Storage upload failed');
        _selectedForm.source_path = path;
      }

      // Insert DB row
      const rows = await API.post('workflow_form_definitions', {
        firm_id:     FIRM_ID_CAD,
        source_path: _selectedForm.source_path || null,
        source_name: _selectedForm.source_name,
        page_count:  _selectedForm.page_count,
        fields:      _selectedForm.fields,
        routing:     _selectedForm.routing,
      });

      if (rows?.[0]?.id) {
        _selectedForm.id       = rows[0].id;
        _selectedForm._unsaved = false;
        delete _selectedForm._file;
      }

      cadToast('Form saved', 'success');

      // Re-render list
      const listEl = document.getElementById('form-list');
      if (listEl) listEl.innerHTML = _renderFormList();
    } catch(e) {
      cadToast('Save failed: ' + e.message, 'error');
    }
  } else {
    // Update existing
    await API.patch(`workflow_form_definitions?id=eq.${_selectedForm.id}`, {
      fields:  _selectedForm.fields,
      routing: _selectedForm.routing,
    }).catch(e => cadToast('Save failed: ' + e.message, 'error'));
    cadToast('Form saved', 'success');
    const listEl = document.getElementById('form-list');
    if (listEl) listEl.innerHTML = _renderFormList();
  }
}

async function _getSignedUrl(path) {
  const token = await Auth.getToken();
  const res = await fetch(`${SUPA_URL}/storage/v1/object/sign/${STORAGE_BUCKET}/${path}`, {
    method: 'POST',
    headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + token,
               'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  const data = await res.json();
  if (!data.signedURL) throw new Error('Could not generate URL');
  return `${SUPA_URL}/storage/v1${data.signedURL}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD FORMS FROM DB ON TAB OPEN
// ─────────────────────────────────────────────────────────────────────────────

async function _loadFormDefs() {
  try {
    const rows = await API.get(
      `workflow_form_definitions?firm_id=eq.${FIRM_ID_CAD}&order=created_at.desc`
    ).catch(() => []);
    _formDefs = rows || [];
  } catch(e) { _formDefs = []; }
}

// Patch switchTab to load form defs when Forms tab is opened
const _origSwitchTab = typeof switchTab === 'function' ? switchTab : null;
if (_origSwitchTab) {
  window.switchTab = function(tab) {
    if (tab === 'forms' && !_formDefs.length) {
      _loadFormDefs().then(() => {
        const el = document.getElementById('cad-content');
        if (el) renderFormsTab(el);
      });
    }
    _origSwitchTab(tab);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD TYPES — extended to include REVIEW and doc_ref
// ─────────────────────────────────────────────────────────────────────────────

// Overwrite the base FIELD_TYPES with the full set
const FIELD_TYPES_FULL = ['text', 'date', 'number', 'checkbox', 'signature', 'textarea', 'review', 'doc_ref'];

const FIELD_TYPE_META = {
  text:      { icon: 'T',  label: 'Text',        color: 'var(--text2)' },
  date:      { icon: '📅', label: 'Date',        color: 'var(--accent)' },
  number:    { icon: '#',  label: 'Number',      color: 'var(--text2)' },
  checkbox:  { icon: '☑', label: 'Checkbox',    color: 'var(--cad)' },
  signature: { icon: '✍', label: 'Signature',   color: 'var(--amber)' },
  textarea:  { icon: '¶',  label: 'Textarea',    color: 'var(--text2)' },
  review:    { icon: '◑',  label: 'Review',      color: '#00b9c3' },   // pass/fail/na/blank
  doc_ref:   { icon: '⎘',  label: 'Doc Ref',     color: 'var(--accent)' },
};

// REVIEW field value cycle: blank → pass → fail → na → blank
const REVIEW_VALUES  = ['', 'pass', 'fail', 'na'];
const REVIEW_DISPLAY = { '': '—', pass: '✓', fail: '✗', na: 'N/A' };
const REVIEW_COLORS  = { '': 'var(--muted)', pass: 'var(--green)', fail: 'var(--red)', na: 'var(--amber)' };

// ─────────────────────────────────────────────────────────────────────────────
// FORM ARCHETYPE CLASSIFICATION
// Detects whether an uploaded document is a 'checklist' or 'data_entry' form.
// Called after PDF text extraction — sets default field types.
// ─────────────────────────────────────────────────────────────────────────────

function _classifyFormArchetype(textItems) {
  // Heuristics:
  //  - If > 30% of lines start with a short underscore (<= 8 chars) followed by a numbered item → checklist
  //  - If field labels followed by long underscores dominate → data_entry
  let shortUnderscoreLines = 0;
  let totalLines = 0;
  let longUnderscoreLines = 0;

  textItems.forEach(item => {
    const s = (item.str || '').trim();
    if (!s) return;
    totalLines++;
    if (/^_{1,8}\s+\d+\./.test(s)) shortUnderscoreLines++;  // "___ 1. Item text"
    if (/_{6,}/.test(s)) longUnderscoreLines++;              // "Name: ___________"
  });

  if (totalLines === 0) return 'data_entry';
  const shortRatio = shortUnderscoreLines / totalLines;
  return shortRatio > 0.15 ? 'checklist' : 'data_entry';
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT CONTROL HEADER DETECTION
// The top-right metadata block (Type/Level III, Doc Number, etc.) should be
// treated as read-only identity, not as fillable fields.
// ─────────────────────────────────────────────────────────────────────────────

function _isDocControlRegion(item, pageHeight) {
  // Document control blocks typically appear in the top 15% of the page
  // and consist of Label: FixedValue pairs
  const [, , , , tx, ty] = item.transform;
  const y = pageHeight - ty; // convert to top-left origin
  if (y > pageHeight * 0.18) return false;

  const s = (item.str || '').trim();
  // Typical patterns: "Type:", "Document Number:", "Revision:", "Page:"
  return /^(type|document\s+number|title|prepared\s+by|original\s+date|revised\s+by|revision\s+date|revision|page)\s*:?$/i.test(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// ENHANCED TEXT HEURISTICS — replaces _detectTextHeuristics
// Now includes:
//   - Short underscore (checklist item status lines)
//   - Colon + whitespace label detection
//   - Checkbox glyphs (☐ □ etc.)
//   - Signature keywords
//   - Date keywords
//   - Doc control header exclusion
// ─────────────────────────────────────────────────────────────────────────────

function _detectTextHeuristicsV2(textContent, page, pageNum, startIdx, archetype) {
  const found = [];
  const items = textContent.items;
  const vp = page.getViewport({ scale: 1 });
  const h = vp.height;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const s    = (item.str || '').trim();
    if (!s) continue;

    // Skip document control header region
    if (_isDocControlRegion(item, h)) continue;

    const [, , , , tx, ty] = item.transform;
    const x = tx;
    const y = h - ty; // top-left origin

    // ── CHECKLIST archetype: short status line before numbered item ─────────
    if (archetype === 'checklist') {
      // Pattern: item has short underscore content (1-8 underscores or just short blank)
      // followed by a numbered item text on the same line or next item
      if (/^_{1,8}$/.test(s) || s === '') {
        const nextItem = items[i + 1];
        const nextStr  = (nextItem?.str || '').trim();
        if (/^\d+\./.test(nextStr) || /^[A-Z]\s+\w/.test(nextStr)) {
          // Extract item number and text as the label
          const label = nextStr.replace(/^\d+\.\s*/, '').slice(0, 80);
          found.push({
            id: `heur_${pageNum}_${startIdx + found.length}`,
            page: pageNum,
            rect: { x: x, y: y - 12, w: 32, h: 14 },
            label,
            type:  'review',
            role:  'assignee',
            required: false,
            detection: 'heuristic:checklist_item',
          });
        }
      }

      // Section header detection: bold text without a number prefix
      if (item.fontName?.includes('Bold') || item.fontName?.includes('bold')) {
        if (s.length > 3 && !/^\d/.test(s) && !/_{2,}/.test(s)) {
          found.push({
            id: `section_${pageNum}_${startIdx + found.length}`,
            page: pageNum,
            rect: { x, y: y - 14, w: 200, h: 16 },
            label: s,
            type:  '_section_header',   // special non-field marker
            role:  null,
            required: false,
            detection: 'heuristic:section_header',
          });
        }
      }
    }

    // ── DATA ENTRY archetype: colon + trailing whitespace / underscore ──────
    if (archetype === 'data_entry') {
      // "Label: ______" pattern
      const colonMatch = s.match(/^(.+?):\s*_{4,}/);
      if (colonMatch) {
        const label     = colonMatch[1].trim();
        const underLen  = (s.match(/_{4,}/)?.[0] || '').length;
        const isDateField = /date|dated|as of/i.test(label);
        const isNumField  = /quantity|qty|number|#|amount/i.test(label);
        found.push({
          id: `heur_${pageNum}_${startIdx + found.length}`,
          page: pageNum,
          rect: { x: x + label.length * 6, y: y - 12, w: Math.max(80, underLen * 5), h: 16 },
          label,
          type: isDateField ? 'date' : isNumField ? 'number' : 'text',
          role: /sign|approv|authoriz|review/i.test(label) ? 'reviewer' : 'assignee',
          required: false,
          detection: 'heuristic:colon_underscore',
        });
      }

      // "Rev." short field pattern — paired with preceding label
      if (/^rev\.?\s*$/i.test(s)) {
        const prevLabel = items.slice(Math.max(0, i - 3), i)
          .map(it => it.str).join(' ').trim();
        if (prevLabel) {
          found.push({
            id: `heur_${pageNum}_${startIdx + found.length}`,
            page: pageNum,
            rect: { x: x + 28, y: y - 12, w: 40, h: 16 },
            label: prevLabel + ' Rev',
            type:  'text',
            role:  'assignee',
            required: false,
            detection: 'heuristic:rev_field',
            _isPaired: true,
          });
        }
      }
    }

    // ── Universal: checkbox glyphs ──────────────────────────────────────────
    if (/[☐☑□■◻◼▢]/.test(s)) {
      const nextStr = (items[i + 1]?.str || '').trim().slice(0, 60);
      found.push({
        id: `heur_${pageNum}_${startIdx + found.length}`,
        page: pageNum,
        rect: { x, y: y - 10, w: 14, h: 14 },
        label: nextStr || 'Checkbox',
        type:  'checkbox',
        role:  'assignee',
        required: false,
        detection: 'heuristic:checkbox_glyph',
      });
    }

    // ── Universal: signature keywords ───────────────────────────────────────
    if (/^(signature|sign here|authorized by|approved by|reviewed by|built by)/i.test(s)) {
      found.push({
        id: `heur_${pageNum}_${startIdx + found.length}`,
        page: pageNum,
        rect: { x, y: y + 2, w: 180, h: 24 },
        label: s,
        type:  'signature',
        role:  /approv|authoriz/i.test(s) ? 'pm' : /review/i.test(s) ? 'reviewer' : 'assignee',
        required: true,
        detection: 'heuristic:signature_keyword',
      });
    }
  }

  // Filter out _section_header markers from the fields array
  // They are stored separately for UI grouping
  return found.filter(f => f.type !== '_section_header');
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-INSTANCE DETECTION
// Checks if a PDF contains the same template used multiple times.
// Uses structural fingerprinting: page text signature similarity.
// ─────────────────────────────────────────────────────────────────────────────

async function _detectMultiInstance(pdfDoc) {
  if (pdfDoc.numPages < 2) return null;

  // Fingerprint each page: sorted unique text strings, truncated to 200 chars
  const fingerprints = [];
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p);
    const tc   = await page.getTextContent();
    const sig  = tc.items
      .map(i => (i.str || '').trim())
      .filter(s => s.length > 3)
      .sort()
      .join('|')
      .slice(0, 300);
    fingerprints.push(sig);
  }

  // Look for groups of pages with very similar fingerprints
  const SIMILARITY_THRESHOLD = 0.7;
  function similarity(a, b) {
    if (!a || !b) return 0;
    const wordsA = new Set(a.split('|'));
    const wordsB = new Set(b.split('|'));
    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
    return intersection / Math.max(wordsA.size, wordsB.size);
  }

  // Compare first page against all others
  const first = fingerprints[0];
  const duplicates = [];
  for (let i = 1; i < fingerprints.length; i++) {
    if (similarity(first, fingerprints[i]) >= SIMILARITY_THRESHOLD) {
      duplicates.push(i + 1); // 1-based page number
    }
  }

  if (!duplicates.length) return null;

  // Determine template length (page count per instance)
  const templatePageCount = duplicates[0] - 1;
  const instanceCount = Math.floor(pdfDoc.numPages / templatePageCount);

  return {
    detected:          true,
    templatePageCount,
    instanceCount,
    instanceStartPages: [1, ...duplicates],
  };
}

// Show the multi-instance prompt dialog
function _showMultiInstancePrompt(info) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '500';
  overlay.innerHTML = `
    <div class="modal" style="max-width:440px">
      <div class="modal-header">
        <div class="modal-title">📄 Multiple instances detected</div>
      </div>
      <div class="modal-body" style="font-size:13px;line-height:1.7;color:var(--text2)">
        This PDF appears to contain the same
        <strong style="color:var(--text)">${info.templatePageCount}-page form</strong>
        completed <strong style="color:var(--text)">${info.instanceCount} times</strong>.
        <div style="margin-top:14px;font-size:12px;color:var(--muted)">
          How would you like to import it?
        </div>
      </div>
      <div class="modal-footer" style="flex-direction:column;gap:8px;align-items:stretch">
        <button class="btn btn-solid"
          onclick="_multiInstanceImport('template',${JSON.stringify(info).replace(/"/g,'&quot;')})"
          style="justify-content:center">
          Import blank template only (${info.templatePageCount} pages)
        </button>
        <button class="btn btn-ghost"
          onclick="_multiInstanceImport('template_and_history',${JSON.stringify(info).replace(/"/g,'&quot;')})"
          style="justify-content:center">
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

  // _pdfDoc is already loaded — call _proceedWithImport directly,
  // no File object needed, no second arrayBuffer() call.
  await _proceedWithImport(1, info.templatePageCount);

  if (mode === 'template_and_history') {
    cadToast(
      `Template imported (${info.templatePageCount} pages). ` +
      `Historical instance import coming in next release.`,
      'info'
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE VISION PASS — AI field detection for scanned/complex documents
// Sends a base64 page image to Claude and gets back structured field JSON.
// Only runs when AcroForm + heuristics yield < 3 fields.
// ─────────────────────────────────────────────────────────────────────────────

async function _detectFieldsViaClaudeVision(pdfDoc, pageNum) {
  try {
    const page   = await pdfDoc.getPage(pageNum);
    // Scale 1.0 not 1.5 — smaller image = fewer tokens spent on pixels.
    const vp     = page.getViewport({ scale: 1.0 });
    const canvas = document.createElement('canvas');
    canvas.width  = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    // JPEG 0.75 — reduces payload, labels remain legible
    const base64 = canvas.toDataURL('image/jpeg', 0.75).split(',')[1];

    // Compact output format — abbreviated keys mean more fields fit in 4096 tokens
    const prompt = `Analyze this form image. List every fillable field and section header.

Field types: text, date, number, checkbox, signature, review (checklist pass/fail/NA line), textarea
Skip: fixed document control metadata in top corner (Type, Document Number, Revision, Page, etc.)

Return ONLY a JSON array. Use compact short keys:
[{"l":"label","t":"type","x":10,"y":20,"w":40},...]
x/y/w are 0-100 percentages of page dimensions.
Add "s":true only for bold section headers. Omit "s" otherwise.
Labels max 50 chars. No markdown, no explanation.`;

    const response = await fetch(`${SUPA_URL}/functions/v1/ai-form-vision`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPA_KEY}`,
        'apikey':        SUPA_KEY,
      },
      body: JSON.stringify({ base64, prompt, media_type: 'image/jpeg' }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      if (response.status === 401) {
        console.warn('[FormEditor] ai-form-vision 401 — redeploy with: supabase functions deploy ai-form-vision --no-verify-jwt');
        return [];
      }
      if (response.status === 404) {
        console.warn('[FormEditor] ai-form-vision not deployed — skipping vision pass');
        return [];
      }
      throw new Error(`Vision API ${response.status}: ${errBody.error || 'unknown'}`);
    }

    const data  = await response.json();
    const raw   = data.text || data.content?.map(c => c.text || '').join('') || '[]';
    const clean = raw.replace(/```json|```/g, '').trim();

    // Truncation-safe parser — if response was cut mid-array, recover complete objects
    let aiFields;
    try {
      aiFields = JSON.parse(clean);
    } catch (parseErr) {
      console.warn('[FormEditor] Vision JSON truncated — recovering partial response');
      const lastBrace = clean.lastIndexOf('}');
      if (lastBrace === -1) { console.warn('[FormEditor] No complete objects in vision response'); return []; }
      const partial   = clean.slice(0, lastBrace + 1);
      const recovered = partial.startsWith('[') ? partial + ']' : '[' + partial + ']';
      try {
        aiFields = JSON.parse(recovered);
        console.log(`[FormEditor] Recovered ${aiFields.length} fields from truncated response`);
      } catch { console.warn('[FormEditor] Could not recover truncated vision JSON'); return []; }
    }

    if (!Array.isArray(aiFields)) return [];

    // Support both compact (l/t/x/y/w) and verbose (label/type/x_pct) key formats
    const pdfVp = page.getViewport({ scale: 1 });
    return aiFields
      .filter(f => !f.s)
      .map((f, i) => {
        const label = f.l || f.label || 'Field';
        const type  = f.t || f.type  || 'text';
        const xPct  = f.x ?? f.x_pct ?? 5;
        const yPct  = f.y ?? f.y_pct ?? 50;
        const wPct  = f.w ?? f.width_pct ?? 30;
        return {
          id:        `ai_${pageNum}_${i}`,
          page:      pageNum,
          rect: {
            x: (xPct / 100) * pdfVp.width,
            y: (yPct / 100) * pdfVp.height,
            w: (wPct / 100) * pdfVp.width || 120,
            h: type === 'signature' ? 28 : type === 'textarea' ? 40 : 16,
          },
          label,
          type,
          role:      /sign|approv|authoriz/i.test(label) ? 'reviewer'
                   : /pm|manager/i.test(label) ? 'pm' : 'assignee',
          required:  type === 'signature',
          detection: 'claude_vision',
          confidence: 'ai',
        };
      });
  } catch(e) {
    console.warn('[FormEditor] Claude vision pass failed:', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MISSING SIGNATURE PROMPT
// After extraction, if no signature field was found, offer to add approval routing.
// ─────────────────────────────────────────────────────────────────────────────

function _checkAndPromptSignature(fields) {
  const hasSignature = fields.some(f => f.type === 'signature');
  if (hasSignature) return;

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;bottom:80px;right:24px;z-index:300;
    background:var(--bg2);border:1px solid var(--border2);border-radius:8px;
    padding:14px 16px;max-width:320px;
    box-shadow:0 8px 32px rgba(0,0,0,.6);
  `;
  overlay.innerHTML = `
    <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px">
      No approval signature detected
    </div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:12px;line-height:1.6">
      This form has no formal sign-off field. Add an approval stage with a digital signature?
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-solid btn-sm" style="flex:1;font-size:11px"
        onclick="_addApprovalSignatureField();this.closest('[style]').remove()">
        Yes, add sign-off
      </button>
      <button class="btn btn-ghost btn-sm" style="flex:1;font-size:11px;color:var(--muted)"
        onclick="this.closest('[style]').remove()">
        No thanks
      </button>
    </div>`;
  document.body.appendChild(overlay);
  // Auto-dismiss after 12s
  setTimeout(() => overlay.remove(), 12000);
}

function _addApprovalSignatureField() {
  if (!_selectedForm) return;
  const sigField = {
    id:        'sig_' + Date.now(),
    page:      _pdfTotalPages,
    rect:      { x: 60, y: 680, w: 220, h: 28 },
    label:     'Authorized Signature',
    type:      'signature',
    role:      'reviewer',
    required:  true,
    detection: 'manual',
  };
  _formFields.push(sigField);

  // Add reviewer to routing
  if (!_formRouting.roles.find(r => r.role === 'reviewer')) {
    const maxOrder = Math.max(0, ..._formRouting.roles.map(r => r.order || 0));
    _formRouting.roles.push({ role: 'reviewer', order: maxOrder + 1 });
  }
  _formRouting.mode = 'serial'; // approval after assignee = serial by definition

  const listEl = document.getElementById('form-field-list');
  if (listEl) listEl.innerHTML = _renderFieldList();
  _reRenderRoutingPanel();
  _renderFieldOverlays();
  cadToast('Approval signature field added — assign to Reviewer in the routing panel', 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIDENCE COLOUR CODING
// Fields get a confidence level from their detection method.
// Displayed as a subtle indicator in the SVG overlay and field list.
// ─────────────────────────────────────────────────────────────────────────────

function _fieldConfidenceColor(field) {
  switch (field.detection) {
    case 'acroform':            return 'var(--green)';    // exact — no doubt
    case 'claude_vision':       return 'var(--cad)';      // AI — high confidence
    case 'heuristic:checklist_item':
    case 'heuristic:colon_underscore':
    case 'heuristic:signature_keyword': return 'var(--amber)';  // heuristic — review recommended
    case 'manual':              return 'var(--accent)';   // user-drawn — exact
    default:                    return 'var(--muted)';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE-BASED ROUTING PANEL (replaces simple serial/parallel)
// Stages: ordered groups of roles. Stages fire sequentially.
// Within a stage: parallel_within_stage controls simultaneous vs sequential.
// ─────────────────────────────────────────────────────────────────────────────

function _renderStageRoutingPanel() {
  const stages = _formRouting.stages || _migrateToStages();

  return `
    <div>
      <div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
                  color:var(--muted);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
        Fill Stages
        <button onclick="_formAddStage()" class="btn btn-ghost btn-sm"
          style="font-size:10px;padding:2px 8px;letter-spacing:.04em">+ Stage</button>
      </div>

      <div id="form-stage-list" style="display:flex;flex-direction:column;gap:8px">
        ${stages.map((stage, si) => _renderStageRow(stage, si, stages.length)).join('')}
      </div>

      <div style="margin-top:12px;padding:8px 10px;border-radius:4px;
                  background:rgba(196,125,24,.06);border:1px solid var(--cad-wire)">
        <div style="font-size:10px;color:var(--muted);line-height:1.5">
          Each stage activates only after the previous stage is fully complete.
          The form step is complete when all stages are done.
        </div>
      </div>
    </div>`;
}

function _renderStageRow(stage, si, totalStages) {
  const roleConf  = FORM_ROLES[stage.role] || { label: stage.role, color: 'var(--muted)', dim: 'rgba(255,255,255,.05)' };
  const fieldCount = (_formFields || []).filter(f => (f.stage || 1) === stage.stage).length;
  const isLast    = si === totalStages - 1;

  return `
    <div id="fstage-${stage.stage}"
      style="border:1px solid var(--border);border-radius:5px;background:var(--surf2);overflow:hidden">

      <!-- Stage header -->\
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;
                  border-bottom:1px solid var(--border);background:var(--bg2)">
        <div style="width:18px;height:18px;border-radius:50%;
                    background:${roleConf.dim};border:1px solid ${roleConf.color};
                    display:flex;align-items:center;justify-content:center;
                    font-size:10px;font-weight:700;color:${roleConf.color};flex-shrink:0">
          ${si + 1}
        </div>
        <select class="config-select" style="flex:1;font-size:11px;padding:3px 6px"
          onchange="_formUpdateStageRole(${stage.stage}, this.value)">
          ${Object.entries(FORM_ROLES).map(([key, conf]) =>
            `<option value="${key}" ${stage.role === key ? 'selected' : ''}>${conf.label}</option>`
          ).join('')}
        </select>
        ${totalStages > 1 ? `
        <button onclick="_formRemoveStage(${stage.stage})"
          style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;padding:0;flex-shrink:0"
          title="Remove stage">✕</button>` : ''}
      </div>

      <!-- Stage body -->\
      <div style="padding:8px 10px">
        <!-- Parallel within stage toggle -->
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <div class="config-toggle" onclick="_formToggleStageParallel(${stage.stage})"
            style="display:flex;align-items:center;gap:7px;cursor:pointer">
            <div class="toggle-box${stage.parallel_within_stage ? ' on' : ''}"></div>
            <span style="font-size:10px;color:var(--text2)">
              ${stage.parallel_within_stage
                ? 'All notified at once'
                : 'Serial counter-sign'}
            </span>
          </div>
        </div>

        <!-- Field count + activation note -->
        <div style="font-size:10px;color:var(--muted);margin-top:4px">
          ${fieldCount} field${fieldCount !== 1 ? 's' : ''} assigned
          ${si > 0 ? ` · activates after Stage ${si}` : ' · activates on step start'}
        </div>
      </div>
    </div>

    ${!isLast ? `
    <div style="text-align:center;color:var(--muted);font-size:16px;line-height:1">↓</div>
    ` : ''}`;
}

function _migrateToStages() {
  // Convert old serial/parallel routing to stages format
  const roles = _deriveRoles(_formFields);
  if (_formRouting.mode === 'parallel') {
    // All roles in one parallel stage
    const stage = {
      stage: 1, role: roles[0]?.role || 'assignee',
      parallel_within_stage: true, requires_all: true
    };
    _formRouting.stages = [stage];
  } else {
    // Each role gets its own sequential stage
    const ordered = _formRoutingRolesOrdered(roles);
    _formRouting.stages = ordered.map((r, i) => ({
      stage: i + 1, role: r.role,
      parallel_within_stage: false, requires_all: true
    }));
  }
  return _formRouting.stages;
}

function _formAddStage() {
  const stages = _formRouting.stages || _migrateToStages();
  const nextNum = Math.max(0, ...stages.map(s => s.stage)) + 1;
  // Default to reviewer for second stage, pm for third
  const defaultRole = nextNum === 2 ? 'reviewer' : nextNum >= 3 ? 'pm' : 'assignee';
  stages.push({ stage: nextNum, role: defaultRole, parallel_within_stage: true, requires_all: true });
  _formRouting.stages = stages;
  _reRenderRoutingPanel();
}

function _formRemoveStage(stageNum) {
  if (!_formRouting.stages) return;
  _formRouting.stages = _formRouting.stages.filter(s => s.stage !== stageNum);
  // Renumber
  _formRouting.stages.forEach((s, i) => { s.stage = i + 1; });
  _reRenderRoutingPanel();
}

function _formUpdateStageRole(stageNum, role) {
  const stage = (_formRouting.stages || []).find(s => s.stage === stageNum);
  if (stage) { stage.role = role; _reRenderRoutingPanel(); }
}

function _formToggleStageParallel(stageNum) {
  const stage = (_formRouting.stages || []).find(s => s.stage === stageNum);
  if (stage) {
    stage.parallel_within_stage = !stage.parallel_within_stage;
    _reRenderRoutingPanel();
  }
}

// Override _reRenderRoutingPanel to use stage-based panel
function _reRenderRoutingPanel() {
  const routingCol = document.querySelector('#form-editor-main > div > div:last-child');
  if (routingCol) {
    const inner = routingCol.querySelector('[style*="overflow-y:auto"]') ||
                  routingCol.querySelector('[style*="overflow-y: auto"]');
    if (inner) inner.innerHTML = _renderStageRoutingPanel();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENHANCED _renderFieldList — with confidence indicator + REVIEW type support
// ─────────────────────────────────────────────────────────────────────────────

// Override _renderFieldList to use enhanced metadata
const _renderFieldListBase = _renderFieldList;
function _renderFieldList() {
  if (!_formFields.length) {
    return `<div style="padding:16px 14px;font-size:11px;color:var(--muted);line-height:1.8;text-align:center">
              No fields detected yet.<br/>Draw rectangles on the document<br/>to add fields manually.
            </div>`;
  }

  return _formFields.map((field, idx) => {
    const roleConf  = FORM_ROLES[field.role] || FORM_ROLES.assignee;
    const typeMeta  = FIELD_TYPE_META[field.type] || FIELD_TYPE_META.text;
    const confColor = _fieldConfidenceColor(field);

    return `
      <div id="frow-${field.id}"
        style="padding:7px 12px;border-bottom:1px solid var(--border);
               display:flex;align-items:flex-start;gap:8px;cursor:pointer;
               transition:background .1s"
        onmouseenter="this.style.background='var(--surf2)'"
        onmouseleave="this.style.background=''"
        onclick="_formSelectField('${field.id}')">

        <!-- Confidence dot -->
        <div style="width:6px;height:6px;border-radius:50%;background:${confColor};
                    flex-shrink:0;margin-top:5px" title="Detection: ${field.detection || 'unknown'}"></div>

        <!-- Type badge -->
        <div style="flex-shrink:0;width:20px;height:20px;border-radius:3px;
                    background:rgba(255,255,255,.05);border:1px solid var(--border2);
                    display:flex;align-items:center;justify-content:center;
                    font-size:10px;color:${typeMeta.color};margin-top:1px">
          ${typeMeta.icon}
        </div>

        <!-- Label + meta -->
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;color:var(--text1);white-space:nowrap;
                      overflow:hidden;text-overflow:ellipsis;margin-bottom:2px">
            ${escHtml(field.label || 'Unlabelled')}
          </div>
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
            <span style="font-size:10px;padding:1px 5px;border-radius:3px;
                         background:${roleConf.dim};color:${roleConf.color}">
              ${roleConf.label}
            </span>
            <span style="font-size:10px;color:var(--muted)">${typeMeta.label}</span>
            ${field.required ? `<span style="font-size:10px;color:var(--red)">req</span>` : ''}
            ${field.stage    ? `<span style="font-size:10px;color:var(--muted)">S${field.stage}</span>` : ''}
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
// ENHANCED FIELD EDIT POPOVER — adds REVIEW / doc_ref types + stage assignment
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
  popover.style.cssText = `
    position:fixed;z-index:200;background:var(--bg2);
    border:1px solid var(--border2);border-radius:6px;
    padding:14px;width:240px;
    box-shadow:0 8px 32px rgba(0,0,0,.6);
  `;

  const rect = row.getBoundingClientRect();
  let top  = rect.top;
  let left = rect.right + 8;
  // Keep within viewport
  if (left + 240 > window.innerWidth) left = rect.left - 248;
  if (top  + 280 > window.innerHeight) top  = window.innerHeight - 290;
  popover.style.top  = Math.max(8, top)  + 'px';
  popover.style.left = Math.max(8, left) + 'px';

  const roleOptions = Object.entries(FORM_ROLES).map(([key, conf]) =>
    `<option value="${key}" ${field.role === key ? 'selected' : ''}>${conf.label}</option>`
  ).join('');

  const typeOptions = FIELD_TYPES_FULL.map(t => {
    const meta = FIELD_TYPE_META[t] || { label: t };
    return `<option value="${t}" ${field.type === t ? 'selected' : ''}>${meta.label}</option>`;
  }).join('');

  const stages     = _formRouting.stages || [];
  const stageOptions = stages.length > 1
    ? stages.map(s => `<option value="${s.stage}" ${(field.stage || 1) === s.stage ? 'selected' : ''}>
        Stage ${s.stage} — ${FORM_ROLES[s.role]?.label || s.role}
      </option>`).join('')
    : '';

  popover.innerHTML = `
    <div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
                color:var(--muted);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
      Edit Field
      <span style="font-size:10px;color:${_fieldConfidenceColor(field)};font-weight:400">
        ${field.detection || ''}
      </span>
    </div>

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

    ${stages.length > 1 ? `
    <div style="margin-bottom:8px">
      <label class="config-label">Fill Stage</label>
      <select class="config-select" style="font-size:11px"
        onchange="_formUpdateField('${fieldId}','stage',parseInt(this.value))">
        ${stageOptions}
      </select>
    </div>` : ''}

    <div style="margin-bottom:10px">
      <div class="config-toggle" onclick="_formToggleRequired('${fieldId}')"
        style="display:flex;align-items:center;gap:7px;cursor:pointer">
        <div class="toggle-box${field.required ? ' on' : ''}" id="fedit-req-toggle"></div>
        <span style="font-size:11px">Required — blocks step completion</span>
      </div>
    </div>

    <button onclick="document.getElementById('field-edit-popover')?.remove()"
      class="btn btn-ghost btn-sm" style="width:100%;font-size:11px">Done</button>
  `;

  document.body.appendChild(popover);

  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!popover.contains(e.target) && !row.contains(e.target)) {
        popover.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 50);

  _highlightFieldRect(fieldId);
}

// ─────────────────────────────────────────────────────────────────────────────
// ENHANCED FIELD OVERLAYS — confidence-coded stroke colour
// ─────────────────────────────────────────────────────────────────────────────

const _renderFieldOverlaysBase = _renderFieldOverlays;
function _renderFieldOverlays() {
  const svg = document.getElementById('form-field-overlay');
  if (!svg) return;

  const currentPageFields = _formFields.filter(f => (f.page || 1) === _pdfPage);

  svg.innerHTML = currentPageFields.map(field => {
    const roleConf  = FORM_ROLES[field.role] || FORM_ROLES.assignee;
    const confColor = _fieldConfidenceColor(field);
    const r = field.rect || { x: 0, y: 0, w: 80, h: 18 };
    const x = r.x * _pdfScale, y = r.y * _pdfScale;
    const w = r.w * _pdfScale, h = r.h * _pdfScale;
    const labelText = (field.label || 'field').slice(0, 16);
    const typeIcon  = FIELD_TYPE_META[field.type]?.icon || 'T';

    return `
      <g class="field-rect-group" data-field-id="${field.id}"
        style="cursor:pointer" onclick="_formSelectField('${field.id}')">
        <!-- Main field rectangle -->
        <rect x="${x}" y="${y}" width="${w}" height="${h}"
          fill="${roleConf.dim}" stroke="${confColor}" stroke-width="1.5"
          rx="2" opacity="0.85"/>
        <!-- Label pill -->
        <rect x="${x}" y="${y - 17}" width="${Math.min(w, 110)}" height="15"
          fill="${confColor}" rx="3" opacity="0.92"/>
        <text x="${x + 4}" y="${y - 6}"
          fill="white" font-size="8" font-family="monospace"
          style="pointer-events:none">
          ${typeIcon} ${escHtml(labelText)}
        </text>
        <!-- Required asterisk -->
        ${field.required ? `
        <text x="${x + w - 10}" y="${y + h - 4}"
          fill="var(--red)" font-size="10" font-family="sans-serif"
          style="pointer-events:none">*</text>` : ''}
      </g>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// REVISED IMPORT FLOW — orchestrates all detection passes
// ─────────────────────────────────────────────────────────────────────────────

async function _formFileChosen(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  event.target.value = ''; // reset immediately so same file can be re-selected

  if (!file.name.toLowerCase().endsWith('.pdf')) {
    cadToast('PDF import supported — Word documents coming soon', 'info');
    return;
  }

  cadToast(`Analysing ${file.name}…`, 'info');

  try {
    await _ensurePdfJs();

    // Read the buffer ONCE and pass it directly to PDF.js.
    // PDF.js transfers (neuters) ArrayBuffers — storing the File object
    // and calling .arrayBuffer() a second time returns a zeroed buffer.
    // Keeping _pdfDoc as the single source of truth avoids this entirely.
    const arrayBuffer = await file.arrayBuffer();
    _pdfDoc        = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    _pdfTotalPages = _pdfDoc.numPages;
    _pdfPage       = 1;
    _pdfScale      = 1.5;
    window._pendingImportName = file.name;

    // Multi-instance detection
    if (_pdfTotalPages > 1) {
      const multiInfo = await _detectMultiInstance(_pdfDoc);
      if (multiInfo?.detected) {
        _showMultiInstancePrompt(multiInfo); // no file arg — uses _pdfDoc
        return;
      }
    }

    await _proceedWithImport(1, _pdfTotalPages);
  } catch(e) {
    cadToast('Import failed: ' + e.message, 'error');
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// IMPORT PROGRESS UI
// Renders a progress overlay in the Form Library main area (#form-editor-main).
// Shows stage name, animated bar, and per-page status during import.
// ─────────────────────────────────────────────────────────────────────────────

function _importProgressShow(filename, totalPages) {
  const main = document.getElementById('form-editor-main');
  if (!main) return;

  main.innerHTML = `
    <div id="import-progress-wrap"
      style="flex:1;display:flex;flex-direction:column;align-items:center;
             justify-content:center;gap:20px;padding:48px;background:var(--bg1)">

      <!-- File icon + name -->
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
        <div style="font-size:36px;opacity:.5">📄</div>
        <div style="font-size:13px;font-weight:500;color:var(--text);
                    max-width:360px;text-align:center;overflow:hidden;
                    text-overflow:ellipsis;white-space:nowrap">
          ${escHtml(filename)}
        </div>
        <div style="font-size:11px;color:var(--muted)">${totalPages} page${totalPages !== 1 ? 's' : ''}</div>
      </div>

      <!-- Progress bar track -->
      <div style="width:min(420px,80%);display:flex;flex-direction:column;gap:8px">
        <div style="height:4px;background:var(--surf3);border-radius:2px;overflow:hidden">
          <div id="import-progress-bar"
            style="height:100%;width:0%;background:var(--cad);border-radius:2px;
                   transition:width .35s cubic-bezier(.4,0,.2,1)"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div id="import-progress-stage"
            style="font-size:11px;color:var(--muted);font-family:var(--font-mono)">
            Initialising…
          </div>
          <div id="import-progress-pct"
            style="font-size:11px;color:var(--cad);font-family:var(--font-mono);font-weight:600">
            0%
          </div>
        </div>
      </div>

      <!-- Per-page dot grid (shown once we know page count) -->
      <div id="import-page-dots"
        style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;
               max-width:360px;min-height:20px">
        ${Array.from({length: totalPages}, (_, i) => `
          <div id="import-dot-${i+1}"
            style="width:10px;height:10px;border-radius:50%;
                   background:var(--surf3);transition:background .2s"
            title="Page ${i+1}"></div>
        `).join('')}
      </div>

      <!-- Detail line -->
      <div id="import-progress-detail"
        style="font-size:10px;color:var(--muted);text-align:center;min-height:16px;
               font-family:var(--font-mono)"></div>

    </div>`;
}

function _importProgressUpdate(pct, stage, detail) {
  const bar   = document.getElementById('import-progress-bar');
  const stEl  = document.getElementById('import-progress-stage');
  const pctEl = document.getElementById('import-progress-pct');
  const detEl = document.getElementById('import-progress-detail');
  if (bar)   bar.style.width  = Math.round(pct) + '%';
  if (stEl)  stEl.textContent = stage  || '';
  if (pctEl) pctEl.textContent = Math.round(pct) + '%';
  if (detEl) detEl.textContent = detail || '';
}

function _importProgressDot(pageNum, state) {
  // state: 'pending' | 'active' | 'done' | 'ai'
  const dot = document.getElementById(`import-dot-${pageNum}`);
  if (!dot) return;
  const colors = {
    pending: 'var(--surf3)',
    active:  'var(--cad)',
    done:    'var(--green)',
    ai:      'var(--amber)',
  };
  dot.style.background = colors[state] || colors.pending;
  if (state === 'active') {
    dot.style.boxShadow = '0 0 0 2px var(--cad-dim)';
  } else {
    dot.style.boxShadow = '';
  }
}

async function _proceedWithImport(startPage = 1, endPage = null) {
  // _pdfDoc MUST already be loaded by _formFileChosen before this is called.
  if (!_pdfDoc) {
    cadToast('Import error: PDF not loaded. Please try again.', 'error');
    return;
  }

  const pageLimit  = endPage || _pdfDoc.numPages;
  const totalPages = pageLimit - startPage + 1;
  const sourceName = window._pendingImportName || 'Imported form';

  // ── Show progress UI in the main area ────────────────────────────────
  // Render the tab shell first so #form-editor-main exists
  const tabEl = document.getElementById('cad-content');
  if (tabEl) renderFormsTab(tabEl);
  _importProgressShow(sourceName, totalPages);

  // Progress budget (percentages):
  //   5%  — archetype classification
  //   60% — AcroForm + heuristics (split evenly across pages)
  //   25% — Claude vision pass (only if triggered; else skipped quickly)
  //   10% — final assembly + render

  const PAGE_BUDGET  = 60 / totalPages; // pct per page in main loop
  let   pct          = 0;

  // ── Stage 1: Classify archetype (5%) ─────────────────────────────────
  _importProgressUpdate(pct, 'Classifying document type…', '');
  await new Promise(r => setTimeout(r, 0)); // yield to browser to paint

  const firstPage = await _pdfDoc.getPage(startPage);
  const firstText = await firstPage.getTextContent();
  const archetype = _classifyFormArchetype(firstText.items);
  pct = 5;
  _importProgressUpdate(pct, `Detected: ${archetype === 'checklist' ? 'Checklist' : 'Data entry'} form`, '');
  await new Promise(r => setTimeout(r, 0));

  // ── Stage 2: AcroForm + heuristics (5% → 65%, per page) ──────────────
  const detectedFields = [];

  for (let p = startPage; p <= pageLimit; p++) {
    const editorPage = p - startPage + 1;
    _importProgressDot(editorPage, 'active');
    _importProgressUpdate(
      pct,
      `Scanning page ${editorPage} of ${totalPages}…`,
      `AcroForm fields + text heuristics`
    );
    await new Promise(r => setTimeout(r, 0));

    const page        = await _pdfDoc.getPage(p);
    const annotations = await page.getAnnotations();
    const vp          = page.getViewport({ scale: 1 });

    for (const ann of annotations) {
      if (!ann.fieldType) continue;
      const [x1, y1, x2, y2] = ann.rect;
      const x = Math.min(x1, x2);
      const y = vp.height - Math.max(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      const typeMap = { Tx: 'text', Btn: 'checkbox', Ch: 'text', Sig: 'signature' };
      const nameL   = (ann.fieldName || '').toLowerCase();
      const role    = /sign|approv|review/.test(nameL) ? 'reviewer'
                    : /pm|manager/.test(nameL) ? 'pm' : 'assignee';
      detectedFields.push({
        id:        `acro_${p}_${detectedFields.length}`,
        page:      editorPage,
        rect:      { x, y, w, h },
        label:     ann.fieldName || ann.alternativeText || `Field ${detectedFields.length + 1}`,
        type:      typeMap[ann.fieldType] || 'text',
        role,
        required:  !!(ann.fieldFlags & 2),
        detection: 'acroform',
      });
    }

    const textContent = await page.getTextContent();
    const heuristic   = _detectTextHeuristicsV2(
      textContent, page, editorPage, detectedFields.length, archetype
    );
    detectedFields.push(...heuristic);

    pct += PAGE_BUDGET;
    _importProgressDot(editorPage, 'done');
    _importProgressUpdate(
      pct,
      `Page ${editorPage} complete — ${detectedFields.length} fields so far`,
      ''
    );
    await new Promise(r => setTimeout(r, 0));
  }

  // ── Stage 3: Claude vision pass (65% → 90%, only if sparse) ──────────
  let visionFields = [];
  const autoCount  = detectedFields.filter(f => f.detection !== 'manual').length;

  if (autoCount < 3) {
    const visionPages = Math.min(2, totalPages);
    const visionBudget = 25 / visionPages;
    _importProgressUpdate(pct, 'Sparse detection — running AI vision pass…', '');
    await new Promise(r => setTimeout(r, 0));

    for (let p = startPage; p <= Math.min(startPage + 1, pageLimit); p++) {
      const editorPage = p - startPage + 1;
      _importProgressDot(editorPage, 'ai');
      _importProgressUpdate(
        pct,
        `AI vision: analysing page ${editorPage}…`,
        'Sending to Claude — this takes a moment'
      );
      await new Promise(r => setTimeout(r, 0));

      const vf = await _detectFieldsViaClaudeVision(_pdfDoc, p);
      visionFields.push(...vf.map(f => ({ ...f, page: editorPage })));

      pct += visionBudget;
      _importProgressDot(editorPage, 'done');
      _importProgressUpdate(pct, `AI vision complete — ${vf.length} fields found`, '');
      await new Promise(r => setTimeout(r, 0));
    }
  } else {
    // No vision pass needed — jump to 90%
    pct = 90;
    _importProgressUpdate(pct, 'Field detection complete', '');
    await new Promise(r => setTimeout(r, 0));
  }

  const allFields = [...detectedFields, ...visionFields];

  // ── Stage 4: Assembly + render (90% → 100%) ───────────────────────────
  _importProgressUpdate(92, 'Assembling form definition…', '');
  await new Promise(r => setTimeout(r, 0));

  const newForm = {
    id:          'local_' + Date.now(),
    source_name: sourceName,
    page_count:  totalPages,
    archetype,
    fields:      allFields,
    routing: {
      stages: [
        { stage: 1, role: 'assignee', parallel_within_stage: false, requires_all: true }
      ]
    },
    _unsaved: true,
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

  // Re-render tab (replaces progress UI with the editor)
  if (tabEl) renderFormsTab(tabEl);
  await _renderPdfPage(startPage);
  _updatePageIndicator(); // sync button states after import

  _importProgressUpdate(100, 'Done', '');

  const nExact    = allFields.filter(f => f.detection === 'acroform').length;
  const nInferred = allFields.filter(f => (f.detection||'').startsWith('heuristic')).length;
  const nAI       = allFields.filter(f => f.detection === 'claude_vision').length;
  cadToast(
    `${allFields.length} fields · ${nExact} exact · ${nInferred} inferred · ${nAI} AI · ${totalPages} pages`,
    'success'
  );

  setTimeout(() => _checkAndPromptSignature(allFields), 1200);
}

// ─────────────────────────────────────────────────────────────────────────────
// DB MIGRATION HELPER — outputs the SQL needed for the new tables
// Called from browser console: _formShowMigrationSQL()
// ─────────────────────────────────────────────────────────────────────────────

function _formShowMigrationSQL() {
  console.log(`-- Run in Supabase SQL editor
CREATE TABLE IF NOT EXISTS workflow_form_definitions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id      UUID REFERENCES workflow_template_steps(id) ON DELETE CASCADE,
  firm_id      UUID NOT NULL,
  source_path  TEXT,
  source_name  TEXT,
  page_count   INTEGER DEFAULT 1,
  archetype    TEXT DEFAULT 'data_entry',  -- 'checklist' | 'data_entry'
  fields       JSONB  DEFAULT '[]'::jsonb,
  routing      JSONB  DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_form_responses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id  UUID REFERENCES workflow_instances(id)  ON DELETE CASCADE,
  step_id      UUID,
  form_def_id  UUID REFERENCES workflow_form_definitions(id) ON DELETE CASCADE,
  field_id     TEXT NOT NULL,
  value        TEXT,
  filled_by    UUID,
  filled_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_responses_instance_step
  ON workflow_form_responses(instance_id, step_id);

CREATE INDEX IF NOT EXISTS idx_form_definitions_firm
  ON workflow_form_definitions(firm_id);
  `);
}