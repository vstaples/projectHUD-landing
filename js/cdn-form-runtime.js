// cdn-form-runtime.js
console.log('[cdn-form-runtime] v20260407-FRT3');
// Renders the fillable form inside the instance step panel.
// Handles response persistence, gate check, and evidence PDF generation.
//
// Depends on: cdn-core-state.js, cdn-instances.js
// LOAD ORDER: after cdn-instances.js (16th)
// ─────────────────────────────────────────────────────────────────────────────
//
// Entry points (called from cdn-instances.js):
//   renderFormFillPanel(inst, step)   — renders fill UI into #cad-form-{stepId}
//   _formGateCheck(instId, stepId)    — called from submitComplete gate
//
// Internal state (module-scoped, keyed by stepId):
//   _formRuntimeDefs    { [stepId]: formDefinition }
//   _formRuntimeResps   { [stepId]: { [fieldId]: {value, note} } }
//   _formRuntimeSaving  { [stepId]: boolean }
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const _formRuntimeDefs   = {};   // form definitions loaded per step
const _formRuntimeResps  = {};   // working responses per step
const _formRuntimeSaving = {};   // debounce save state per step

// REVIEW field cycle
const _RT_REVIEW_CYCLE   = ['', 'pass', 'fail', 'na'];
const _RT_REVIEW_DISPLAY = { '': '—', pass: '✓', fail: '✗', na: 'N/A' };
const _RT_REVIEW_COLOR   = { '': 'var(--muted)', pass: 'var(--green)', fail: 'var(--red)', na: 'var(--amber)' };

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT — called after instance step panel renders
// ─────────────────────────────────────────────────────────────────────────────

async function renderFormFillPanel(inst, step) {
  const el = document.getElementById(`cad-form-${step.id}`);
  if (!el) return;

  el.innerHTML = `<div style="font-size:11px;color:var(--muted);padding:8px 0">Loading form…</div>`;

  try {
    const formDef = await _loadFormDef(step.id);
    if (!formDef) {
      el.innerHTML = `<div style="font-size:11px;color:var(--muted);padding:8px 0">
        No form attached to this step.
        <a href="#" onclick="switchTab('forms');return false"
          style="color:var(--cad);text-decoration:none"> Import one in Form Library ›</a>
      </div>`;
      return;
    }

    const existing = await _loadFormResponses(inst.id, step.id);
    _formRuntimeDefs[step.id]  = formDef;
    _formRuntimeResps[step.id] = existing;

    // HTML form — render in iframe with submit overlay
    if (formDef.source_html) {
      _renderHtmlFormFillPanel(el, formDef, step, inst, existing);
      return;
    }

    // Generic field renderer
    const activeStage = _resolveActiveStage(formDef, inst, step);
    el.innerHTML = _renderFormFill(formDef, step, inst, activeStage);
    _attachFormFillEvents(step.id, formDef, inst, activeStage);

  } catch(e) {
    el.innerHTML = `<div style="font-size:11px;color:var(--red);padding:8px 0">
      Form load failed: ${escHtml(e.message)}
    </div>`;
  }
}

function _renderHtmlFormFillPanel(el, formDef, step, inst, existing) {
  var cssVars = '<style>:root{' +
    '--color-background-primary:#ffffff;--color-background-secondary:#f7f8fa;' +
    '--color-background-tertiary:#f0f1f4;--color-background-info:#e8f0fe;' +
    '--color-text-primary:#1a1a2e;--color-text-secondary:#4a5068;' +
    '--color-text-tertiary:#8890a8;--color-border-tertiary:rgba(0,0,0,.1);' +
    '--color-border-secondary:rgba(0,0,0,.18);--font-mono:monospace' +
  '}</style>';

  // Pre-fill existing responses into HTML
  var html = formDef.source_html;
  // Always parse html to inject runtime-controlled values
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  // Inject template version into data-runtime="template_version" elements
  var verEls = doc.querySelectorAll('[data-runtime="template_version"]');
  if (verEls.length && formDef.version) {
    verEls.forEach(function(el2) {
      el2.textContent = 'v' + formDef.version + ' · Cadence / Compass';
    });
  }
  // Restore existing field values
  if (existing && Object.keys(existing).length) {
    Object.keys(existing).forEach(function(fieldId) {
      var el2 = doc.querySelector('[data-field-id="'+fieldId+'"]');
      if (el2 && existing[fieldId].value) {
        if (el2.tagName === 'SELECT') {
          el2.value = existing[fieldId].value;
        } else if (el2.tagName === 'TEXTAREA') {
          el2.textContent = existing[fieldId].value;
        } else if (el2.tagName === 'INPUT') {
          el2.value = existing[fieldId].value;
        }
      }
    });
  }
  html = doc.body.innerHTML;

  var blob = new Blob([cssVars + html], { type: 'text/html' });
  var iframeId = 'frt-iframe-' + step.id;

  el.innerHTML =
    '<div style="position:relative;width:100%;border:1px solid var(--border);border-radius:8px;overflow:hidden">' +
      '<iframe id="' + iframeId + '" sandbox="allow-scripts allow-same-origin"' +
        ' style="width:100%;min-height:600px;border:none;display:block"></iframe>' +
      '<div style="padding:10px 14px;border-top:1px solid var(--border);background:var(--bg2);' +
              'display:flex;justify-content:space-between;align-items:center">' +
        '<span id="frt-status-' + step.id + '" style="font-size:12px;color:var(--muted);font-family:Arial,sans-serif"></span>' +
        '<button id="frt-submit-' + step.id + '"' +
          ' style="font-family:Arial,sans-serif;font-size:13px;font-weight:600;padding:7px 20px;' +
          'border-radius:5px;border:none;background:#00c9c9;color:#003333;cursor:pointer">' +
          'Submit →' +
        '</button>' +
      '</div>' +
    '</div>';

  // Load iframe
  var iframe = document.getElementById(iframeId);
  iframe.src = URL.createObjectURL(blob);

  // Wire submit button
  var submitBtn = document.getElementById('frt-submit-' + step.id);
  var statusEl  = document.getElementById('frt-status-' + step.id);
  submitBtn.addEventListener('click', async function() {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';
    try {
      // Collect field values from iframe
      var iframeDoc = iframe.contentDocument;
      var responses = [];
      if (iframeDoc) {
        iframeDoc.querySelectorAll('[data-field-id]').forEach(function(inp) {
          var fieldId = inp.getAttribute('data-field-id');
          var label   = inp.getAttribute('data-label') || fieldId;
          var val = '';
          if (inp.tagName === 'SELECT') val = inp.value;
          else if (inp.tagName === 'TEXTAREA') val = inp.value;
          else if (inp.tagName === 'INPUT') val = inp.value;
          else val = inp.textContent;
          if (fieldId) responses.push({ fieldId: fieldId, label: label, value: val });
        });
      }

      // Write to workflow_form_responses
      var firmId = window.FIRM_ID || window.FIRM_ID_CAD;
      await Promise.all(responses.map(function(r) {
        return API.post('workflow_form_responses', {
          instance_id: inst.id,
          step_id:     step.id,
          form_def_id: formDef.id,
          stage:       1,
          field_id:    r.fieldId,
          value:       r.value,
          filled_at:   new Date().toISOString()
        }).catch(function(){});
      }));

      if (statusEl) statusEl.textContent = responses.length + ' fields saved ✓';
      submitBtn.textContent = 'Submitted ✓';
      submitBtn.style.background = 'var(--green)';

      // Trigger step completion if available
      if (typeof _handleFormStepSubmit === 'function') {
        await _handleFormStepSubmit(inst, step, formDef);
      }

    } catch(e) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit →';
      if (statusEl) statusEl.textContent = 'Error: ' + e.message;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA LOADING
// ─────────────────────────────────────────────────────────────────────────────

async function _loadFormDef(stepId) {
  if (_formRuntimeDefs[stepId]) return _formRuntimeDefs[stepId];
  const rows = await API.get(
    `workflow_form_definitions?step_id=eq.${stepId}&limit=1`
  ).catch(() => []);
  return rows?.[0] || null;
}

async function _loadFormResponses(instanceId, stepId) {
  const rows = await API.get(
    `workflow_form_responses?instance_id=eq.${instanceId}&step_id=eq.${stepId}`
  ).catch(() => []);
  // Reduce to { fieldId: {value, note} }
  const map = {};
  (rows || []).forEach(r => {
    map[r.field_id] = { value: r.value || '', note: r.note || '' };
  });
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE RESOLUTION
// Determine which stage the current user is filling.
// Returns stage number (1-based) or 1 as default.
// ─────────────────────────────────────────────────────────────────────────────

function _resolveActiveStage(formDef, inst, step) {
  const stages = formDef.routing?.stages || [{ stage: 1 }];
  const coc    = inst._stepInsts || [];

  for (const stage of stages) {
    // Check if all fields in this stage have been submitted
    const stageFields = (formDef.fields || []).filter(f => (f.stage || 1) === stage.stage);
    if (!stageFields.length) continue;

    const allFilled = stageFields
      .filter(f => f.required)
      .every(f => {
        const resp = (_formRuntimeResps[step.id] || {})[f.id];
        return resp?.value != null && resp.value !== '';
      });

    // Look for a stage_submitted CoC event for this stage
    const stageSubmitted = coc.some(e =>
      e.event_type === 'form.stage_submitted' &&
      e.template_step_id === step.id &&
      e.metadata?.stage === stage.stage
    );

    if (!stageSubmitted) return stage.stage;
  }

  return stages[stages.length - 1]?.stage || 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER — form fill UI
// ─────────────────────────────────────────────────────────────────────────────

function _renderFormFill(formDef, step, inst, activeStage) {
  const fields   = formDef.fields || [];
  const stages   = formDef.routing?.stages || [{ stage: 1, role: 'assignee' }];
  const resps    = _formRuntimeResps[step.id] || {};
  const archetype = formDef.archetype || 'data_entry';

  // Group fields by stage
  const fieldsByStage = {};
  fields.forEach(f => {
    const s = f.stage || 1;
    if (!fieldsByStage[s]) fieldsByStage[s] = [];
    fieldsByStage[s].push(f);
  });

  // Progress summary
  const totalRequired = fields.filter(f => f.required).length;
  const filled = fields.filter(f => {
    if (!f.required) return false;
    const r = resps[f.id];
    return r?.value != null && r.value !== '';
  }).length;
  const pct = totalRequired ? Math.round(100 * filled / totalRequired) : 100;

  return `
    <div style="margin-bottom:4px">

      <!-- Form header -->
      <div style="display:flex;align-items:center;justify-content:space-between;
                  margin-bottom:10px">
        <div style="font-size:11px;font-weight:600;color:var(--text)">
          ${escHtml(formDef.source_name || 'Form')}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <!-- Progress bar -->
          <div style="width:80px;height:4px;background:var(--surf3);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${pct===100?'var(--green)':'var(--cad)'};
                        transition:width .3s;border-radius:2px"></div>
          </div>
          <span style="font-size:10px;color:var(--muted);font-family:var(--font-mono)">
            ${filled}/${totalRequired}
          </span>
        </div>
      </div>

      <!-- Stage tabs (only if multi-stage) -->
      ${stages.length > 1 ? `
      <div style="display:flex;gap:4px;margin-bottom:10px;flex-wrap:wrap">
        ${stages.map(st => {
          const stageFields = fieldsByStage[st.stage] || [];
          const stageFilled = stageFields.filter(f => f.required && resps[f.id]?.value).length;
          const stageTotal  = stageFields.filter(f => f.required).length;
          const stageDone   = stageTotal > 0 && stageFilled === stageTotal;
          const isActive    = st.stage === activeStage;
          return `<div style="padding:4px 10px;border-radius:12px;font-size:10px;font-weight:600;
                             border:1px solid ${isActive?'var(--cad-wire)':stageDone?'var(--green)':'var(--border)'};
                             background:${isActive?'var(--cad-dim)':stageDone?'rgba(42,157,64,.08)':'transparent'};
                             color:${isActive?'var(--cad)':stageDone?'var(--green)':'var(--muted)'};
                             display:flex;align-items:center;gap:5px">
            ${stageDone?'✓ ':isActive?'● ':'○ '}Stage ${st.stage}
          </div>`;
        }).join('')}
      </div>` : ''}

      <!-- Fields for active stage -->
      <div id="form-fill-fields-${step.id}">
        ${archetype === 'checklist'
          ? _renderChecklistFields(fields, activeStage, resps)
          : _renderDataEntryFields(fields, activeStage, resps, formDef)
        }
      </div>

      <!-- Stage submit button -->
      <div style="margin-top:12px;display:flex;align-items:center;gap:8px">
        <button id="form-stage-submit-${step.id}"
          onclick="_formSubmitStage('${inst.id}','${step.id}',${activeStage})"
          class="btn btn-solid btn-sm" style="font-size:11px">
          ${stages.length > 1 && activeStage < stages.length
            ? `Submit Stage ${activeStage} →`
            : 'Save Responses'}
        </button>
        <span id="form-save-status-${step.id}"
          style="font-size:10px;color:var(--muted)"></span>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECKLIST RENDER — REVIEW field type with section grouping
// ─────────────────────────────────────────────────────────────────────────────

function _renderChecklistFields(fields, activeStage, resps) {
  const stageFields = fields.filter(f => (f.stage || 1) === activeStage);
  if (!stageFields.length) return '<div style="font-size:11px;color:var(--muted)">No fields in this stage.</div>';

  // Group by section (use _section from field metadata if available)
  let currentSection = null;
  let html = '';

  stageFields.forEach((field, idx) => {
    const resp  = resps[field.id] || { value: '', note: '' };
    const value = resp.value || '';
    const note  = resp.note  || '';

    // Section header break
    if (field._section && field._section !== currentSection) {
      currentSection = field._section;
      html += `
        <div style="display:flex;align-items:center;justify-content:space-between;
                    padding:6px 0 4px;margin-top:${idx > 0 ? '12px' : '0'};
                    border-bottom:1px solid var(--border)">
          <span style="font-size:10px;font-weight:700;letter-spacing:.08em;
                       text-transform:uppercase;color:var(--text2)">${escHtml(currentSection)}</span>
          <div style="display:flex;gap:6px">
            <button onclick="_formPassAll('${field._section}',true)"
              style="background:none;border:1px solid rgba(42,157,64,.3);border-radius:3px;
                     padding:2px 7px;font-size:9px;color:var(--green);cursor:pointer">✓ All</button>
            <button onclick="_formPassAll('${field._section}',false)"
              style="background:none;border:1px solid var(--border);border-radius:3px;
                     padding:2px 7px;font-size:9px;color:var(--muted);cursor:pointer">Clear</button>
          </div>
        </div>`;
    }

    const displayVal = _RT_REVIEW_DISPLAY[value] || '—';
    const color      = _RT_REVIEW_COLOR[value]   || 'var(--muted)';

    html += `
      <div class="form-review-row" data-field-id="${field.id}" data-section="${escHtml(field._section || '')}"
        style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;
               border-bottom:1px solid rgba(255,255,255,.04)">

        <!-- Status toggle -->
        <button id="rt-toggle-${field.id}"
          onclick="_formCycleReview('${field.id}')"
          style="min-width:36px;height:22px;border-radius:4px;font-size:11px;
                 font-weight:700;font-family:var(--font-mono);
                 background:${color}18;border:1px solid ${color}55;
                 color:${color};cursor:pointer;flex-shrink:0;
                 transition:all .12s;padding:0 4px">
          ${displayVal}
        </button>

        <!-- Item text -->
        <span style="flex:1;font-size:11px;color:var(--text2);line-height:1.5;
                     padding-top:2px;min-width:0">
          ${escHtml(field.label || '')}
        </span>

        <!-- Note toggle -->
        <button onclick="_formToggleNote('${field.id}')"
          style="background:none;border:none;font-size:13px;cursor:pointer;
                 color:${note ? 'var(--amber)' : 'var(--muted)'};
                 flex-shrink:0;padding:0 2px;margin-top:1px;opacity:${note?1:.4};
                 transition:opacity .15s"
          onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=${note?1:.4}"
          title="${note ? 'Edit note' : 'Add note'}">📝</button>
      </div>

      <!-- Note input (hidden by default) -->
      <div id="rt-note-${field.id}"
        style="display:${note ? 'block' : 'none'};padding:2px 0 6px 44px">
        <input class="config-input" style="font-size:11px;width:100%"
          value="${escHtml(note)}"
          placeholder="Note for this item…"
          oninput="_formUpdateNote('${field.id}',this.value)"/>
      </div>`;
  });

  return html;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA ENTRY RENDER — text/date/number/textarea/signature/checkbox fields
// ─────────────────────────────────────────────────────────────────────────────

function _renderDataEntryFields(fields, activeStage, resps, formDef) {
  const stageFields = fields.filter(f => (f.stage || 1) === activeStage);
  if (!stageFields.length) return '<div style="font-size:11px;color:var(--muted)">No fields in this stage.</div>';

  // Group into rows: fields on the same approximate y position are on the same row
  // For simplicity here, render as a responsive grid, preserving pairing for doc_ref
  let html = '<div style="display:flex;flex-direction:column;gap:8px">';

  let i = 0;
  while (i < stageFields.length) {
    const field = stageFields[i];
    const resp  = resps[field.id] || { value: '', note: '' };

    // doc_ref paired field — rendered as a single row
    if (field.type === 'doc_ref') {
      let docVal = '{}', revVal = '';
      try { const parsed = JSON.parse(resp.value || '{}'); docVal = parsed.number || ''; revVal = parsed.rev || ''; } catch(e) {}
      html += `
        <div>
          <label class="config-label" style="display:flex;align-items:center;gap:4px">
            ${escHtml(field.label)}
            ${field.required ? '<span style="color:var(--red)">*</span>' : ''}
          </label>
          <div style="display:grid;grid-template-columns:1fr 72px;gap:6px;margin-top:3px">
            <input class="config-input" style="font-size:11px"
              value="${escHtml(docVal)}" placeholder="Document number"
              oninput="_formUpdateDocRef('${field.id}','number',this.value)"/>
            <div>
              <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:2px">Rev.</label>
              <input class="config-input" style="font-size:11px"
                value="${escHtml(revVal)}" placeholder="Rev"
                oninput="_formUpdateDocRef('${field.id}','rev',this.value)"/>
            </div>
          </div>
        </div>`;
      i++; continue;
    }

    // Signature field
    if (field.type === 'signature') {
      const hasSig = resp.value && resp.value.startsWith('data:');
      html += `
        <div>
          <label class="config-label" style="display:flex;align-items:center;gap:4px">
            ${escHtml(field.label)}
            ${field.required ? '<span style="color:var(--red)">*</span>' : ''}
          </label>
          <div id="sig-wrap-${field.id}" style="margin-top:4px">
            ${hasSig
              ? `<div style="position:relative;display:inline-block">
                   <img src="${escHtml(resp.value)}" style="max-height:48px;border:1px solid var(--border);
                     border-radius:4px;background:#fff;padding:2px"/>
                   <button onclick="_formClearSignature('${field.id}')"
                     style="position:absolute;top:-6px;right:-6px;background:var(--red);border:none;
                     border-radius:50%;width:16px;height:16px;cursor:pointer;color:#fff;
                     font-size:9px;display:flex;align-items:center;justify-content:center">✕</button>
                 </div>`
              : `<button onclick="_formOpenSignaturePad('${field.id}')"
                   style="padding:6px 14px;border:1px dashed var(--border2);border-radius:4px;
                          background:transparent;color:var(--muted);cursor:pointer;font-size:11px;
                          display:flex;align-items:center;gap:6px;transition:all .15s"
                   onmouseover="this.style.borderColor='var(--cad-wire)';this.style.color='var(--text2)'"
                   onmouseout="this.style.borderColor='var(--border2)';this.style.color='var(--muted)'">
                   ✍ Click to sign
                 </button>`}
          </div>
        </div>`;
      i++; continue;
    }

    // Checkbox
    if (field.type === 'checkbox') {
      const checked = resp.value === 'true';
      html += `
        <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
          <input type="checkbox" id="cb-${field.id}" ${checked ? 'checked' : ''}
            onchange="_formUpdateValue('${field.id}',this.checked?'true':'false')"
            style="width:14px;height:14px;accent-color:var(--cad);cursor:pointer"/>
          <label for="cb-${field.id}" style="font-size:11px;color:var(--text2);cursor:pointer">
            ${escHtml(field.label)}
            ${field.required ? '<span style="color:var(--red)"> *</span>' : ''}
          </label>
        </div>`;
      i++; continue;
    }

    // system — read-only auto-populated
    if (field.system) {
      var sysVal = resp.value || field.hint || '(auto)';
      html += '<div>' +
        '<label class="config-label" style="display:flex;align-items:center;gap:4px">' +
          escHtml(field.label) +
          '<span style="font-size:9px;color:var(--muted);background:var(--surf2);border:1px solid var(--border);border-radius:3px;padding:1px 5px;margin-left:4px">auto</span>' +
        '</label>' +
        '<input class="config-input" type="text" style="font-size:11px;margin-top:3px;color:var(--muted);cursor:default" ' +
          'value="' + escHtml(sysVal) + '" readonly/>' +
      '</div>';
      i++; continue;
    }

    // dropdown
    if (field.type === 'dropdown') {
      var opts = (field.options || []);
      var selVal = resp.value || '';
      var optHtml = '<option value="">— Select —</option>';
      opts.forEach(function(o) { optHtml += '<option value="' + escHtml(o) + '"' + (o === selVal ? ' selected' : '') + '>' + escHtml(o) + '</option>'; });
      html += '<div>' +
        '<label class="config-label" style="display:flex;align-items:center;gap:4px">' +
          escHtml(field.label) + (field.required ? '<span style="color:var(--red)">*</span>' : '') +
        '</label>' +
        '<select class="config-input" style="font-size:11px;margin-top:3px;cursor:pointer" ' +
          'data-fid="' + field.id + '" ' +
          'onchange="_formUpdateValue(\'' + field.id + '\',this.value);_frtCheckConditionals()">' +
          optHtml +
        '</select>' +
      '</div>';
      i++; continue;
    }

    // currency
    if (field.type === 'currency') {
      html += '<div>' +
        '<label class="config-label" style="display:flex;align-items:center;gap:4px">' +
          escHtml(field.label) + (field.required ? '<span style="color:var(--red)">*</span>' : '') +
        '</label>' +
        '<div style="display:flex;align-items:center;gap:4px;margin-top:3px">' +
          '<span style="font-size:12px;color:var(--muted);font-family:var(--font-mono)">$</span>' +
          '<input class="config-input" type="number" step="0.01" min="0" ' +
            'style="font-size:13px;font-family:var(--font-mono);margin-top:0" ' +
            'value="' + escHtml(resp.value || '') + '" placeholder="0.00" ' +
            'oninput="_formUpdateValue(\'" + field.id + "\',this.value)"/>' +
        '</div>' +
      '</div>';
      i++; continue;
    }

    // expense_grid
    if (field.type === 'expense_grid') {
      var gridVal = {};
      try { gridVal = JSON.parse(resp.value || '{}'); } catch(e2) {}
      var cats = field.categories || [];
      var gridDates = [];
      var gd = new Date(); gd.setHours(0,0,0,0);
      for (var gi=0;gi<7;gi++) { gridDates.push(new Date(gd)); gd.setDate(gd.getDate()+1); }
      var dayNms=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      var monNms=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      var catGrps={meals:['Breakfast','Lunch','Dinner','Entertainment'],travel:['Airfare','Lodging','Car Rental','Mileage (mi)','Parking / Tolls','Taxi / Rideshare'],other:['Phone / Internet','Corporate Card']};
      var grpLabels={meals:'Meals & Entertainment',travel:'Transportation & Lodging',other:'Other'};
      var thRow = '<th style="text-align:left;min-width:140px;position:sticky;left:0;background:var(--surf2);padding:5px 8px;font-size:9px;font-weight:600;color:var(--muted);border:0.5px solid var(--border)">Category</th>';
      gridDates.forEach(function(d) {
        var dn = dayNms[d.getDay()]+' '+monNms[d.getMonth()]+' '+d.getDate();
        thRow += '<th style="padding:5px 6px;font-size:10px;font-weight:500;color:var(--muted);border:0.5px solid var(--border);text-align:center;min-width:72px;white-space:nowrap">'+dn+'</th>';
      });
      thRow += '<th style="padding:5px 6px;font-size:10px;font-weight:500;color:var(--text);border:0.5px solid var(--border);position:sticky;right:0;background:var(--surf3)">Total</th>';
      var tbRows = '';
      var lastGrp2 = '';
      cats.forEach(function(cat) {
        var grp2 = 'other';
        Object.keys(catGrps).forEach(function(g) { if (catGrps[g].indexOf(cat)!==-1) grp2=g; });
        if (grp2 !== lastGrp2) {
          lastGrp2 = grp2;
          tbRows += '<tr><td colspan="'+(gridDates.length+2)+'" style="padding:3px 8px;font-size:9px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);background:var(--surf3);border:0.5px solid var(--border)">'+(grpLabels[grp2]||grp2)+'</td></tr>';
        }
        var catKey = cat.toLowerCase().replace(/[^a-z0-9]/g,'_');
        tbRows += '<tr><td style="text-align:left;padding:3px 8px;font-size:12px;color:var(--text);position:sticky;left:0;background:var(--surf1);border:0.5px solid var(--border);white-space:nowrap">'+escHtml(cat)+'</td>';
        gridDates.forEach(function(d) {
          var dk = d.toISOString().slice(0,10);
          var cellKey = catKey+'|'+dk;
          var cv = gridVal[cellKey] || '';
          tbRows += '<td style="border:0.5px solid var(--border);padding:0"><input type="number" step="0.01" min="0" placeholder="0.00" style="width:68px;border:none;background:transparent;color:var(--text);text-align:right;font-family:var(--font-mono);font-size:12px;padding:4px;outline:none" value="'+escHtml(String(cv))+'" data-grid="'+field.id+'" data-cat="'+catKey+'" data-dk="'+dk+'" oninput="_frtGridUpdate(\''+field.id+'\')"></td>';
        });
        tbRows += '<td class="frt-eg-row-'+field.id+'-'+catKey+'" style="text-align:right;padding:4px 8px;font-family:var(--font-mono);font-size:12px;font-weight:500;position:sticky;right:0;background:var(--surf2);border:0.5px solid var(--border)">—</td></tr>';
      });
      tbRows += '<tr><td style="text-align:left;padding:5px 8px;font-size:12px;font-weight:600;color:var(--text);position:sticky;left:0;background:var(--surf2);border:0.5px solid var(--border)">Grand Total</td>';
      gridDates.forEach(function(d){ var dk=d.toISOString().slice(0,10); tbRows+='<td id="frt-eg-col-'+field.id+'-'+dk+'" style="text-align:right;padding:4px 6px;font-family:var(--font-mono);font-size:12px;font-weight:500;background:var(--surf2);border:0.5px solid var(--border)">—</td>'; });
      tbRows += '<td id="frt-eg-grand-'+field.id+'" style="text-align:right;padding:4px 8px;font-family:var(--font-mono);font-size:13px;font-weight:600;color:var(--green);position:sticky;right:0;background:var(--surf2);border:0.5px solid var(--border)">$0.00</td></tr>';
      html += '<div style="margin-bottom:4px"><label class="config-label" style="margin-bottom:4px">'+escHtml(field.label)+'</label>'+(field.hint?'<div style="font-size:10px;color:var(--muted);margin-bottom:4px">'+escHtml(field.hint)+'</div>':'')+'<div style="overflow-x:auto;border:0.5px solid var(--border);border-radius:5px"><table style="border-collapse:collapse;min-width:100%"><thead><tr>'+thRow+'</tr></thead><tbody>'+tbRows+'</tbody></table></div></div>';
      i++; continue;
    }

    // line_items
    if (field.type === 'line_items') {
      var liRows2 = [];
      try { liRows2 = JSON.parse(resp.value || '[]'); } catch(e3) {}
      if (!liRows2.length) liRows2 = [{}];
      var liCols2 = field.columns || ['Description','Date','Amount'];
      var payOpts2 = field.payment_type_options || [];
      var hasPay2 = payOpts2.length > 0;
      var liId2 = 'frtli-'+field.id;
      var thCols2 = liCols2.map(function(c){ return '<th style="padding:4px 7px;font-size:10px;font-weight:500;color:var(--muted);border:0.5px solid var(--border);text-align:left;background:var(--surf2);white-space:nowrap">'+escHtml(c)+'</th>'; }).join('');
      if (hasPay2) thCols2 += '<th style="padding:4px 7px;font-size:10px;font-weight:500;color:var(--muted);border:0.5px solid var(--border);background:var(--surf2)">Payment Type</th>';
      thCols2 += '<th style="padding:4px;border:0.5px solid var(--border);background:var(--surf2);width:24px"></th>';
      var tdRows2 = liRows2.map(function(row2, ri2) {
        var cells2 = liCols2.map(function(c2) {
          var ck2 = c2.toLowerCase().replace(/[^a-z0-9]/g,'_');
          var v2 = row2[ck2] || '';
          var isDate2 = c2.toLowerCase()==='date';
          var isAmt2  = c2.toLowerCase()==='amount';
          var isRec2  = c2.toLowerCase()==='receipt';
          if (isRec2) return '<td style="border:0.5px solid var(--border);padding:2px 4px"><input type="file" accept="image/*,.pdf" style="font-size:10px;width:100%" data-li="'+field.id+'" data-row="'+ri2+'" data-col="'+ck2+'"></td>';
          return '<td style="border:0.5px solid var(--border);padding:0"><input type="'+(isDate2?'date':isAmt2?'number':'text')+'" '+(isAmt2?'step="0.01" min="0" ':'')+'placeholder="'+escHtml(c2)+'" value="'+escHtml(String(v2))+'" style="width:100%;border:none;background:transparent;color:var(--text);padding:4px 6px;font-family:'+(isAmt2?'var(--font-mono)':'inherit')+';font-size:12px;outline:none;'+(isAmt2?'text-align:right':'')+'" data-li="'+field.id+'" data-row="'+ri2+'" data-col="'+ck2+'" oninput="_frtLineItemUpdate(\''+field.id+'\')"></td>';
        }).join('');
        var paySel2 = '';
        if (hasPay2) {
          var payVal2 = row2['payment_type'] || '';
          var payOptH2 = payOpts2.map(function(o2){ return '<option value="'+escHtml(o2)+'"'+(o2===payVal2?' selected':'')+'>'+escHtml(o2)+'</option>'; }).join('');
          paySel2 = '<td style="border:0.5px solid var(--border);padding:0"><select style="width:100%;border:none;background:transparent;color:var(--text);padding:4px 5px;font-size:11px;cursor:pointer" data-li="'+field.id+'" data-row="'+ri2+'" data-col="payment_type" onchange="_frtLineItemUpdate(\''+field.id+'\')"><option value="">— Type —</option>'+payOptH2+'</select></td>';
        }
        return '<tr id="'+liId2+'-row-'+ri2+'">'+cells2+paySel2+'<td style="border:0.5px solid var(--border);padding:2px;text-align:center"><button style="font-size:10px;color:var(--muted);background:none;border:none;cursor:pointer;padding:2px 5px" onclick="_frtLineItemDel(\''+field.id+'\','+ri2+')">✕</button></td></tr>';
      }).join('');
      html += '<div style="margin-bottom:4px"><label class="config-label" style="margin-bottom:4px">'+escHtml(field.label)+'</label>'+(field.hint?'<div style="font-size:10px;color:var(--muted);margin-bottom:4px">'+escHtml(field.hint)+'</div>':'')+'<div style="overflow-x:auto;border:0.5px solid var(--border);border-radius:5px"><table id="'+liId2+'-table" style="border-collapse:collapse;width:100%"><thead><tr>'+thCols2+'</tr></thead><tbody id="'+liId2+'-body">'+tdRows2+'</tbody></table></div><button style="margin-top:5px;font-size:11px;padding:3px 9px;border-radius:4px;border:0.5px solid var(--border2);background:transparent;color:var(--muted);cursor:pointer" onclick="_frtLineItemAdd(\''+field.id+'\')">+ Add row</button></div>';
      i++; continue;
    }

    // settlement_summary — computed read-only block
    if (field.type === 'settlement_summary') {
      html += '<div id="frt-settlement-'+field.id+'" style="background:var(--surf2);border:0.5px solid var(--border);border-radius:6px;padding:10px 12px"><div style="font-size:9px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Settlement Summary</div>'+(field.line_items||[]).map(function(li2){ var clr=li2.highlight==='green'?'var(--green)':li2.highlight==='amber'?'var(--amber)':'var(--text)'; return '<div id="frt-sli-'+field.id+'-'+li2.id+'" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:0.5px solid var(--border)"><span style="font-size:12px;color:var(--text2)">'+escHtml(li2.label)+'</span><span style="font-family:var(--font-mono);font-size:13px;font-weight:500;color:'+clr+'">$0.00</span></div>'; }).join('')+'</div>';
      i++; continue;
    }

    // textarea
    if (field.type === 'textarea') {
      html += `
        <div>
          <label class="config-label" style="display:flex;align-items:center;gap:4px">
            ${escHtml(field.label)}
            ${field.required ? '<span style="color:var(--red)">*</span>' : ''}
          </label>
          <textarea class="config-textarea" style="font-size:11px;min-height:56px;margin-top:3px"
            placeholder="${escHtml(field.label)}…"
            oninput="_formUpdateValue('${field.id}',this.value)">${escHtml(resp.value || '')}</textarea>
        </div>`;
      i++; continue;
    }

    // text / date / number
    const inputType = field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text';
    html += `
      <div>
        <label class="config-label" style="display:flex;align-items:center;gap:4px">
          ${escHtml(field.label)}
          ${field.required ? '<span style="color:var(--red)">*</span>' : ''}
        </label>
        <input class="config-input" type="${inputType}" style="font-size:11px;margin-top:3px"
          value="${escHtml(resp.value || '')}"
          placeholder="${escHtml(field.label)}…"
          oninput="_formUpdateValue('${field.id}',this.value)"/>
      </div>`;
    i++;
  }

  html += '</div>';
  return html;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD INTERACTION HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

function _formUpdateValue(fieldId, value) {
  // Find which step this field belongs to
  const stepId = _findStepIdForField(fieldId);
  if (!stepId) return;
  if (!_formRuntimeResps[stepId]) _formRuntimeResps[stepId] = {};
  _formRuntimeResps[stepId][fieldId] = {
    ..._formRuntimeResps[stepId][fieldId],
    value,
  };
  _formDebounceSave(stepId);
  _updateFormProgress(stepId);
}

function _formUpdateNote(fieldId, note) {
  const stepId = _findStepIdForField(fieldId);
  if (!stepId) return;
  if (!_formRuntimeResps[stepId]) _formRuntimeResps[stepId] = {};
  _formRuntimeResps[stepId][fieldId] = {
    ..._formRuntimeResps[stepId][fieldId],
    note,
  };
  _formDebounceSave(stepId);
}

function _formCycleReview(fieldId) {
  const stepId = _findStepIdForField(fieldId);
  if (!stepId) return;
  const current = _formRuntimeResps[stepId]?.[fieldId]?.value || '';
  const idx      = _RT_REVIEW_CYCLE.indexOf(current);
  const next     = _RT_REVIEW_CYCLE[(idx + 1) % _RT_REVIEW_CYCLE.length];

  _formUpdateValue(fieldId, next);

  // Update button appearance immediately without full re-render
  const btn = document.getElementById(`rt-toggle-${fieldId}`);
  if (btn) {
    const color = _RT_REVIEW_COLOR[next] || 'var(--muted)';
    btn.textContent  = _RT_REVIEW_DISPLAY[next] || '—';
    btn.style.color  = color;
    btn.style.background = `${color}18`;
    btn.style.borderColor = `${color}55`;
  }
}

function _formToggleNote(fieldId) {
  const noteEl = document.getElementById(`rt-note-${fieldId}`);
  if (!noteEl) return;
  const isVisible = noteEl.style.display !== 'none';
  noteEl.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) noteEl.querySelector('input')?.focus();
}

function _formUpdateDocRef(fieldId, subField, val) {
  const stepId = _findStepIdForField(fieldId);
  if (!stepId) return;
  const current = (() => {
    try { return JSON.parse(_formRuntimeResps[stepId]?.[fieldId]?.value || '{}'); } catch(e) { return {}; }
  })();
  current[subField] = val;
  _formUpdateValue(fieldId, JSON.stringify(current));
}

function _formClearSignature(fieldId) {
  _formUpdateValue(fieldId, '');
  const stepId = _findStepIdForField(fieldId);
  if (stepId) {
    const wrap = document.getElementById(`sig-wrap-${fieldId}`);
    const formDef = _formRuntimeDefs[stepId];
    const field   = (formDef?.fields || []).find(f => f.id === fieldId);
    if (wrap && field) {
      wrap.innerHTML = `<button onclick="_formOpenSignaturePad('${fieldId}')"
        style="padding:6px 14px;border:1px dashed var(--border2);border-radius:4px;
               background:transparent;color:var(--muted);cursor:pointer;font-size:11px;
               display:flex;align-items:center;gap:6px">✍ Click to sign</button>`;
    }
  }
}

// PASS ALL / CLEAR ALL for a checklist section
function _formPassAll(section, pass) {
  document.querySelectorAll('.form-review-row').forEach(row => {
    if (section && row.dataset.section !== section) return;
    const fieldId = row.dataset.fieldId;
    if (!fieldId) return;
    _formUpdateValue(fieldId, pass ? 'pass' : '');
    const btn = document.getElementById(`rt-toggle-${fieldId}`);
    if (btn) {
      const val   = pass ? 'pass' : '';
      const color = _RT_REVIEW_COLOR[val];
      btn.textContent   = _RT_REVIEW_DISPLAY[val];
      btn.style.color   = color;
      btn.style.background   = `${color}18`;
      btn.style.borderColor  = `${color}55`;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNATURE PAD — canvas-based draw pad
// ─────────────────────────────────────────────────────────────────────────────

function _formOpenSignaturePad(fieldId) {
  document.getElementById('sig-pad-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'sig-pad-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.7);
    display:flex;align-items:center;justify-content:center;
    backdrop-filter:blur(2px)
  `;
  overlay.innerHTML = `
    <div style="background:var(--bg1);border:1px solid var(--border2);border-radius:8px;
                padding:20px;width:420px;box-shadow:0 24px 64px rgba(0,0,0,.6)">
      <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px">Draw Signature</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:12px">Sign in the box below</div>
      <canvas id="sig-pad-canvas" width="380" height="120"
        style="background:#fff;border:1px solid var(--border);border-radius:4px;
               display:block;cursor:crosshair;touch-action:none"></canvas>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button onclick="_sigPadAccept('${fieldId}')" class="btn btn-solid" style="flex:1;font-size:12px">
          ✓ Accept
        </button>
        <button onclick="document.getElementById('sig-pad-canvas').getContext('2d').clearRect(0,0,380,120)"
          class="btn btn-ghost" style="font-size:12px">Clear</button>
        <button onclick="document.getElementById('sig-pad-overlay').remove()"
          class="btn btn-ghost" style="font-size:12px;color:var(--muted)">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Wire up drawing
  const canvas = document.getElementById('sig-pad-canvas');
  const ctx    = canvas.getContext('2d');
  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth   = 2;
  ctx.lineCap     = 'round';
  let drawing = false;

  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }

  canvas.onmousedown = canvas.ontouchstart = e => {
    e.preventDefault(); drawing = true;
    const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  canvas.onmousemove = canvas.ontouchmove = e => {
    e.preventDefault(); if (!drawing) return;
    const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  canvas.onmouseup = canvas.ontouchend = () => { drawing = false; };
}

function _sigPadAccept(fieldId) {
  const canvas = document.getElementById('sig-pad-canvas');
  if (!canvas) return;

  // Check if anything was drawn (not blank)
  const ctx  = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const blank = data.every((v, i) => i % 4 === 3 ? v === 0 : true);
  if (blank) { cadToast('Please draw your signature first', 'error'); return; }

  const dataUrl = canvas.toDataURL('image/png');
  _formUpdateValue(fieldId, dataUrl);

  // Update the sig wrap UI
  const stepId = _findStepIdForField(fieldId);
  if (stepId) {
    const wrap = document.getElementById(`sig-wrap-${fieldId}`);
    if (wrap) {
      wrap.innerHTML = `<div style="position:relative;display:inline-block">
        <img src="${dataUrl}" style="max-height:48px;border:1px solid var(--border);
          border-radius:4px;background:#fff;padding:2px"/>
        <button onclick="_formClearSignature('${fieldId}')"
          style="position:absolute;top:-6px;right:-6px;background:var(--red);border:none;
          border-radius:50%;width:16px;height:16px;cursor:pointer;color:#fff;
          font-size:9px;display:flex;align-items:center;justify-content:center">✕</button>
      </div>`;
    }
  }

  document.getElementById('sig-pad-overlay')?.remove();
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS UPDATE — update progress bar without full re-render
// ─────────────────────────────────────────────────────────────────────────────

function _updateFormProgress(stepId) {
  const formDef = _formRuntimeDefs[stepId];
  if (!formDef) return;
  const resps = _formRuntimeResps[stepId] || {};
  const fields = formDef.fields || [];
  const total  = fields.filter(f => f.required).length;
  const filled = fields.filter(f => f.required && resps[f.id]?.value).length;
  const pct    = total ? Math.round(100 * filled / total) : 100;

  const bar = document.querySelector(`#cad-form-${stepId} [style*="transition:width"]`);
  if (bar) {
    bar.style.width = pct + '%';
    bar.style.background = pct === 100 ? 'var(--green)' : 'var(--cad)';
  }
  const label = document.querySelector(`#cad-form-${stepId} [style*="font-mono"]`);
  if (label) label.textContent = `${filled}/${total}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE — debounced auto-save of responses
// ─────────────────────────────────────────────────────────────────────────────

function _formDebounceSave(stepId) {
  if (_formRuntimeSaving[stepId]) clearTimeout(_formRuntimeSaving[stepId]);
  _formRuntimeSaving[stepId] = setTimeout(() => _formPersistResponses(stepId), 800);
}

async function _formPersistResponses(stepId) {
  const formDef = _formRuntimeDefs[stepId];
  const resps   = _formRuntimeResps[stepId];
  if (!formDef || !resps) return;

  // Find the instance_id from the active instance
  const inst = _instances.find(i => {
    return i._tmplSteps?.some(s => s.id === stepId);
  }) || _selectedInstance;
  if (!inst) return;

  const statusEl = document.getElementById(`form-save-status-${stepId}`);
  if (statusEl) { statusEl.textContent = 'Saving…'; statusEl.style.color = 'var(--muted)'; }

  try {
    const rows = Object.entries(resps).map(([fieldId, resp]) => ({
      instance_id:  inst.id,
      step_id:      stepId,
      form_def_id:  formDef.id,
      stage:        (formDef.fields?.find(f => f.id === fieldId)?.stage) || 1,
      field_id:     fieldId,
      value:        resp.value ?? null,
      note:         resp.note  || null,
      filled_by:    _myResourceId || null,
    }));

    if (!rows.length) return;

    // Bulk upsert — single request, PostgREST merge-duplicates on the
    // UNIQUE INDEX (instance_id, step_id, stage, field_id).
    // Replaces the previous serial POST-per-field loop that generated
    // one 409 console error per field on every auto-save after first write.
    const token = await Auth.getToken();
    const res = await fetch(
      `${SUPA_URL}/rest/v1/workflow_form_responses`,
      {
        method:  'POST',
        headers: {
          'apikey':        SUPA_KEY,
          'Authorization': 'Bearer ' + token,
          'Content-Type':  'application/json',
          'Prefer':        'resolution=merge-duplicates',
        },
        body: JSON.stringify(rows),
      }
    );
    if (!res.ok) throw new Error(`Upsert failed: ${res.status}`);

    if (statusEl) {
      statusEl.textContent = 'Saved';
      statusEl.style.color = 'var(--green)';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
    }
  } catch(e) {
    if (statusEl) { statusEl.textContent = 'Save failed'; statusEl.style.color = 'var(--red)'; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE SUBMIT — persist + write CoC event + advance to next stage
// ─────────────────────────────────────────────────────────────────────────────

async function _formSubmitStage(instId, stepId, stageNum) {
  const formDef = _formRuntimeDefs[stepId];
  const resps   = _formRuntimeResps[stepId] || {};
  if (!formDef) return;

  // Validate required fields in this stage
  const stageFields = (formDef.fields || []).filter(f => (f.stage || 1) === stageNum);
  const unfilled    = stageFields.filter(f => f.required && !(resps[f.id]?.value));
  if (unfilled.length) {
    cadToast(`${unfilled.length} required field${unfilled.length!==1?'s':''} still empty`, 'error');
    return;
  }

  const btn = document.getElementById(`form-stage-submit-${stepId}`);
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  try {
    // Force save all current responses
    await _formPersistResponses(stepId);

    // Write CoC stage_submitted event
    const authorName = _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member';
    await API.post('workflow_step_instances', {
      instance_id:      instId,
      firm_id:          FIRM_ID_CAD,
      event_type:       'form.stage_submitted',
      template_step_id: stepId,
      step_type:        'form',
      step_name:        `Form Stage ${stageNum} submitted`,
      actor_name:       authorName,
      event_notes:      `Stage ${stageNum} of ${formDef.routing?.stages?.length || 1} submitted`,
      metadata:         JSON.stringify({ stage: stageNum, field_count: stageFields.length }),
      created_at:       new Date().toISOString(),
    }).catch(() => {});

    const totalStages = formDef.routing?.stages?.length || 1;
    if (stageNum < totalStages) {
      cadToast(`Stage ${stageNum} submitted — Stage ${stageNum + 1} is now active`, 'success');
      // Re-render panel for next stage
      const inst = _selectedInstance || _instances.find(i => i._tmplSteps?.some(s => s.id === stepId));
      const step = inst?._tmplSteps?.find(s => s.id === stepId);
      if (inst && step) await renderFormFillPanel(inst, step);
    } else {
      cadToast('All form stages complete — you can now submit this step', 'success');
      if (btn) { btn.textContent = '✓ Form complete'; btn.style.background = 'var(--green)'; }
    }
  } catch(e) {
    cadToast('Submit failed: ' + e.message, 'error');
    if (btn) { btn.textContent = 'Save Responses'; btn.disabled = false; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GATE CHECK — called from submitComplete in cdn-instances.js
// Returns { passed: bool, missing: number }
// ─────────────────────────────────────────────────────────────────────────────

async function _formGateCheck(instId, stepId) {
  // Load form def if not already cached
  const formDef = _formRuntimeDefs[stepId] || await _loadFormDef(stepId);
  if (!formDef) return { passed: true, missing: 0 }; // no form attached — pass

  // Load responses fresh from DB
  const resps = await _loadFormResponses(instId, stepId);
  const fields = formDef.fields || [];
  const required = fields.filter(f => f.required);
  const missing  = required.filter(f => !resps[f.id]?.value).length;

  return { passed: missing === 0, missing };
}

// ─────────────────────────────────────────────────────────────────────────────
// EVIDENCE PDF GENERATION
// Merges form responses back onto the original document and stores as Evidence.
// Called after the form step is completed (from submitComplete routing block).
// ─────────────────────────────────────────────────────────────────────────────

async function generateFormEvidencePdf(instId, stepId) {
  const formDef = _formRuntimeDefs[stepId] || await _loadFormDef(stepId);
  if (!formDef?.source_path) return null;

  try {
    await _ensurePdfJs();

    // Load the original PDF
    const url   = await _getSignedUrl(formDef.source_path);
    const pdfDoc = await pdfjsLib.getDocument(url).promise;

    // Load responses
    const resps = await _loadFormResponses(instId, stepId);
    const fields = formDef.fields || [];

    // Render each page to canvas, overlay field values, collect as images
    const pageImages = [];
    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const page = await pdfDoc.getPage(p);
      const vp   = page.getViewport({ scale: 2 }); // 2× for quality
      const canvas = document.createElement('canvas');
      canvas.width  = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d');

      // Render base page
      await page.render({ canvasContext: ctx, viewport: vp }).promise;

      // Overlay field values
      const pageFields = fields.filter(f => (f.page || 1) === p);
      const scale = 2; // matches the vp scale

      for (const field of pageFields) {
        const resp = resps[field.id];
        if (!resp?.value) continue;
        const { x, y, w, h } = field.rect;
        const px = x * scale, py = y * scale;
        const pw = w * scale, ph = h * scale;

        if (field.type === 'review') {
          // Draw REVIEW value (✓ / ✗ / N/A)
          ctx.font = `bold ${Math.round(ph * 0.75)}px Arial`;
          ctx.fillStyle = _RT_REVIEW_COLOR[resp.value] || '#333';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(_RT_REVIEW_DISPLAY[resp.value] || '', px + pw / 2, py + ph / 2);
        } else if (field.type === 'signature' && resp.value.startsWith('data:')) {
          // Draw signature image
          await new Promise(res => {
            const img = new Image();
            img.onload = () => {
              ctx.drawImage(img, px, py, pw, ph);
              res();
            };
            img.src = resp.value;
          });
        } else if (field.type === 'checkbox') {
          ctx.font = `bold ${Math.round(ph * 0.8)}px Arial`;
          ctx.fillStyle = '#333';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(resp.value === 'true' ? '✓' : '☐', px + pw / 2, py + ph / 2);
        } else {
          // Text / date / number / textarea / doc_ref
          let displayVal = resp.value;
          if (field.type === 'doc_ref') {
            try { const d = JSON.parse(resp.value); displayVal = d.number + (d.rev ? ' Rev. ' + d.rev : ''); } catch(e) {}
          }
          ctx.font = `${Math.round(Math.min(ph * 0.65, 13) * scale / scale)}px Arial`;
          ctx.fillStyle = '#1a1a2e';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          // Clip to field width
          ctx.save();
          ctx.rect(px, py, pw, ph);
          ctx.clip();
          ctx.fillText(displayVal, px + 2, py + ph / 2);
          ctx.restore();
        }
      }

      pageImages.push(canvas.toDataURL('image/jpeg', 0.92));
    }

    // Build a simple multi-page PDF using HTML + window.print-style rendering
    // In production this would use pdf-lib (server-side edge function).
    // Here we store a multi-image blob and return a data URL for preview.
    const evidenceBlob = await _imagesToPdfBlob(pageImages, formDef.source_name);
    return evidenceBlob;
  } catch(e) {
    console.warn('[FormRuntime] Evidence PDF generation failed:', e.message);
    return null;
  }
}

async function _imagesToPdfBlob(images, title) {
  // Lightweight approach: encode as a single-page HTML blob that prints correctly.
  // For true PDF output, route through the Supabase edge function with pdf-lib.
  const html = `<!DOCTYPE html><html><head>
    <meta charset="UTF-8"/>
    <title>${escHtml(title || 'Completed Form')}</title>
    <style>
      body { margin: 0; padding: 0; }
      .page { page-break-after: always; width: 100%; }
      .page img { width: 100%; display: block; }
    </style>
  </head><body>
    ${images.map(src => `<div class="page"><img src="${src}"/></div>`).join('')}
  </body></html>`;
  return new Blob([html], { type: 'text/html' });
}

// Upload evidence and attach to step CoC
async function _uploadFormEvidence(instId, stepId, blob, fileName) {
  if (!blob) return;
  try {
    const path  = `${FIRM_ID_CAD}/evidence/${instId}/${stepId}_${Date.now()}_${fileName}.html`;
    const token = await Auth.getToken();
    await fetch(`${SUPA_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
      method:  'POST',
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + token,
                 'Content-Type': 'text/html', 'x-upsert': 'true' },
      body: blob,
    });
    cadToast('Completed form saved as evidence document', 'success');
  } catch(e) {
    console.warn('[FormRuntime] Evidence upload failed:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY — find stepId given a fieldId (search loaded runtime defs)
// ─────────────────────────────────────────────────────────────────────────────

function _findStepIdForField(fieldId) {
  for (const [stepId, formDef] of Object.entries(_formRuntimeDefs)) {
    if ((formDef.fields || []).some(f => f.id === fieldId)) return stepId;
  }
  return null;
}

function _attachFormFillEvents(stepId, formDef, inst, activeStage) {
  // nothing extra needed — all handlers are inline onclick
  // future: keyboard navigation / tab order
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK INTO submitComplete — generate evidence PDF when form step completes
// Patched onto the existing flow: after step_completed CoC is written,
// if step_type === 'form', generate and upload evidence.
// ─────────────────────────────────────────────────────────────────────────────

// Store reference to original submitComplete
// ── New field type helpers ────────────────────────────────────────────────────

function _frtGridUpdate(fieldId) {
  var inputs = document.querySelectorAll('[data-grid="'+fieldId+'"]');
  var catTots = {}, colTots = {}, grand = 0;
  inputs.forEach(function(inp) {
    var v = parseFloat(inp.value) || 0;
    var cat = inp.dataset.cat, dk = inp.dataset.dk;
    catTots[cat] = (catTots[cat] || 0) + v;
    colTots[dk]  = (colTots[dk]  || 0) + v;
    grand += v;
  });
  Object.keys(catTots).forEach(function(cat) {
    var el = document.querySelector('.frt-eg-row-'+fieldId+'-'+cat);
    if (el) el.textContent = catTots[cat] ? '$'+catTots[cat].toFixed(2) : '—';
  });
  Object.keys(colTots).forEach(function(dk) {
    var el = document.getElementById('frt-eg-col-'+fieldId+'-'+dk);
    if (el) el.textContent = colTots[dk] ? '$'+colTots[dk].toFixed(2) : '—';
  });
  var gel = document.getElementById('frt-eg-grand-'+fieldId);
  if (gel) gel.textContent = '$'+grand.toFixed(2);
  // Serialize grid to response
  var gridVal = {};
  inputs.forEach(function(inp) {
    var v = parseFloat(inp.value) || 0;
    if (v) gridVal[inp.dataset.cat+'|'+inp.dataset.dk] = v;
  });
  _formUpdateValue(fieldId, JSON.stringify(gridVal));
  _frtUpdateSettlement();
}

function _frtLineItemUpdate(fieldId) {
  var tbody = document.getElementById('frtli-'+fieldId+'-body');
  if (!tbody) return;
  var rows = tbody.querySelectorAll('tr');
  var data = [];
  rows.forEach(function(tr) {
    var obj = {};
    tr.querySelectorAll('[data-col]').forEach(function(el) {
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT') obj[el.dataset.col] = el.value;
    });
    if (Object.values(obj).some(function(v){return v;})) data.push(obj);
  });
  _formUpdateValue(fieldId, JSON.stringify(data));
  _frtUpdateSettlement();
}

function _frtLineItemAdd(fieldId) {
  var tbody = document.getElementById('frtli-'+fieldId+'-body');
  if (!tbody) return;
  var ri = tbody.querySelectorAll('tr').length;
  var tr = document.createElement('tr');
  tr.id = 'frtli-'+fieldId+'-row-'+ri;
  // Clone structure from first row but clear values
  var first = tbody.querySelector('tr');
  if (first) {
    tr.innerHTML = first.innerHTML.replace(/value="[^"]*"/g,'value=""').replace(/selected/g,'');
  } else {
    tr.innerHTML = '<td colspan="4" style="padding:6px;font-size:11px;color:var(--muted)">New row</td>';
  }
  // Update row index on data attrs
  tr.querySelectorAll('[data-row]').forEach(function(el){ el.dataset.row = ri; });
  // Re-wire delete button
  var delBtn = tr.querySelector('button');
  if (delBtn) delBtn.setAttribute('onclick', '_frtLineItemDel(\'' + fieldId + '\',' + ri + ')');
  tbody.appendChild(tr);
}

function _frtLineItemDel(fieldId, rowIdx) {
  var tr = document.getElementById('frtli-'+fieldId+'-row-'+rowIdx);
  var tbody = document.getElementById('frtli-'+fieldId+'-body');
  if (!tbody || tbody.querySelectorAll('tr').length <= 1) return;
  if (tr) tr.remove();
  _frtLineItemUpdate(fieldId);
}

function _frtCheckConditionals() {
  // Re-render conditional fields by toggling their wrapper visibility
  document.querySelectorAll('[data-fid]').forEach(function(sel) {
    var fid = sel.dataset.fid;
    var val = sel.value;
    // Find all elements with data-cond-field matching fid
    document.querySelectorAll('[data-cond-field="'+fid+'"]').forEach(function(wrapper) {
      var vals = (wrapper.dataset.condVals || '').split('|');
      wrapper.style.display = vals.indexOf(val) !== -1 ? '' : 'none';
    });
  });
}

function _frtUpdateSettlement() {
  // Sum all grid + line item values and update settlement_summary display
  var totals = { total:0, out_of_pocket:0, company_paid:0, billable:0 };

  // Grid totals
  document.querySelectorAll('[data-grid]').forEach(function(inp) {
    totals.total += parseFloat(inp.value) || 0;
  });

  // Line item totals — parse payment_type per row
  document.querySelectorAll('[data-col="payment_type"]').forEach(function(sel) {
    var tr = sel.closest('tr');
    var amtInp = tr ? tr.querySelector('[data-col="amount"]') : null;
    var amt = amtInp ? parseFloat(amtInp.value) || 0 : 0;
    totals.total += amt;
    var pt = sel.value;
    if (pt === 'Out of Pocket')      totals.out_of_pocket += amt;
    if (pt === 'Company Card')       totals.company_paid  += amt;
    if (pt === 'Billable — Client')   totals.billable      += amt;
  });

  var net = totals.total - totals.company_paid;

  var map = {
    total_expenses:    totals.total,
    out_of_pocket:     totals.out_of_pocket,
    company_paid:      totals.company_paid,
    net_due_employee:  Math.max(0, net),
    billable_to_client:totals.billable
  };

  Object.keys(map).forEach(function(key) {
    document.querySelectorAll('[id^="frt-sli-"]').forEach(function(el) {
      if (el.id.endsWith('-'+key)) {
        var span = el.querySelector('span:last-child');
        if (span) span.textContent = '$'+map[key].toFixed(2);
      }
    });
  });
}

window._frtGridUpdate       = _frtGridUpdate;
window._frtLineItemUpdate   = _frtLineItemUpdate;
window._frtLineItemAdd      = _frtLineItemAdd;
window._frtLineItemDel      = _frtLineItemDel;
window._frtCheckConditionals= _frtCheckConditionals;
window._frtUpdateSettlement = _frtUpdateSettlement;


const _origSubmitComplete = typeof submitComplete === 'function' ? submitComplete : null;
if (_origSubmitComplete) {
  window.submitComplete = async function(instId, stepId) {
    await _origSubmitComplete(instId, stepId);
    // After submit, check if this was a form step and generate evidence
    const inst = _instances?.find(i => i.id === instId);
    const step = inst?._tmplSteps?.find(s => s.id === stepId);
    if (step?.step_type === 'form') {
      const formDef = _formRuntimeDefs[stepId] || await _loadFormDef(stepId);
      if (formDef) {
        const blob = await generateFormEvidencePdf(instId, stepId);
        if (blob) await _uploadFormEvidence(instId, stepId, blob, formDef.source_name || 'form');
      }
    }
  };
}