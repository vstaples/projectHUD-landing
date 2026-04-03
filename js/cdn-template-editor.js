// cdn-template-editor.js — Cadence: template editor, spine, step CRUD
console.log('%c[cdn-template-editor] v20260403-A','background:#c47d18;color:#000;font-weight:700;padding:2px 8px;border-radius:3px');
// Depends on: cdn-dag-viewer, cdn-assignee, cdn-outcomes, cdn-documents
// LOAD ORDER: 7th

function renderTemplatesTab(el) {
  el.innerHTML = `
    <div class="cad-list-col">
      <div class="list-col-header">
        <span class="list-col-title">Templates</span>
        <button class="btn btn-cad btn-sm" onclick="openNewTemplateModal()">+ New</button>
      </div>
      <div class="list-col-body" id="tmpl-list">
        ${renderTemplateList()}
      </div>
    </div>
    <div class="cad-editor-col" id="editor-col">
      ${_selectedTmpl ? '' : renderEditorEmpty()}
    </div>`;
  if (_selectedTmpl) renderEditor();
}

function renderTemplateList() {
  if (!_templates.length) {
    return `<div class="list-empty">
      <div class="icon">⬡</div>
      <div>No templates yet.</div>
      <div style="margin-top:8px"><button class="btn btn-cad btn-sm" onclick="openNewTemplateModal()">Create First Template</button></div>
    </div>`;
  }
  return _templates.map(t => {
    const ver = t.version || '0.0.0';
    const st  = t.status || 'draft';
    const locked = st === 'released';
    return `
    <div class="tmpl-item status-${st}${_selectedTmpl?.id===t.id?' active':''}" onclick="selectTemplate('${t.id}')">
      <div class="tmpl-item-name status-${st}" style="display:flex;align-items:center;gap:5px">
        ${escHtml(t.name)}
        ${locked ? '<span style="font-size:10px;opacity:.7" title="Released — read only">🔒</span>' : ''}
      </div>
      <div class="tmpl-item-meta">
        <span class="tmpl-status ${st}">${st.toUpperCase()}</span>
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--muted)">${escHtml(ver)}</span>
        <span>${t.trigger_type.replace(/_/g,' ')}</span>
      </div>
    </div>`;
  }).join('');
}

function renderEditorEmpty() {
  return `<div class="editor-empty">
    <div class="icon">⬡</div>
    <p>Select a template from the list, or create a new one to begin building.</p>
    <button class="btn btn-cad" onclick="openNewTemplateModal()">+ New Template</button>
  </div>`;
}

async function selectTemplate(id) {
  _dagPanX = 0; _dagPanY = 0; _dagScale = 1; _dagAutoFitted = false; // reset diagram view
  if (_dirtySteps) {
    if (!confirm('You have unsaved changes. Discard and switch templates?')) return;
    _dirtySteps = false;
  }
  _selectedTmpl = _templates.find(t => t.id === id) || null;
  if (!_selectedTmpl) return;

  // Load steps
  const steps = await API.get(
    `workflow_template_steps?template_id=eq.${id}&order=sequence_order.asc`
  ).catch(() => []);

  // Hydrate _attachedDocs from persisted attached_docs column
  (steps || []).forEach(s => {
    s.forward_input   = !!s.forward_input;
    s.reject_to       = s.reject_to || null;
    s._confirmItems   = Array.isArray(s.confirm_items) ? s.confirm_items : [];
    s._meetingAgenda  = Array.isArray(s.meeting_agenda) ? s.meeting_agenda : [];
    s.meeting_comments = s.meeting_comments || '';
    s.outcomes        = Array.isArray(s.outcomes) ? s.outcomes : [];
    s._attachedDocs = (s.attached_docs || []).map(d => ({
      name:    d.name,
      version: d.version,
      role:    d.role || 'reference',
      size:    d.size,
      path:    d.path || null,
      url:     d.url  || null,
    }));
    // assignee_resource_id — read from DB directly, fall back to _users_cad lookup
    if (!s.assignee_resource_id && s.assignee_user_id) {
      s.assignee_resource_id =
        _users_cad.find(u => u.id === s.assignee_user_id)?.resource_id || null;
    }
  });
  _selectedTmpl.steps = steps || [];
  _selectedStep = null;
  _lastSavedAt  = null;
  _structuralChange = false;
  _versionBumped    = false;
  _takeSnapshot();  // baseline for diff on next commit

  // Re-render list to update active state
  const listEl = document.getElementById('tmpl-list');
  if (listEl) listEl.innerHTML = renderTemplateList();
  renderEditor();
  startAutoSave(); // begin 30-second auto-save cycle
  // Show pending indicator if bin has uncommitted changes
  _updateVersionDisplay();
}

function renderEditor() {
  const col = document.getElementById('editor-col');
  if (!col || !_selectedTmpl) return;

  const t = _selectedTmpl;
  const ver = t.version || '0.0.0';

  // Ensure CoC + Tests panel wrappers exist in editor-col
  if (!document.getElementById('tmpl-coc-panel')) {
    col.innerHTML = `
      <div class="cad-editor-inner" id="editor-inner"></div>
      <div class="tmpl-coc-panel" id="tmpl-coc-panel">
        <div class="tmpl-coc-resize" id="tmpl-coc-resize" title="Drag to resize"></div>
        <div class="tmpl-coc-inner">
          <div class="tmpl-coc-header">
            <span class="tmpl-coc-title">Chain of Custody</span>
            <button onclick="toggleTmplCoC()" style="background:none;border:none;
              color:var(--muted);cursor:pointer;font-size:14px;padding:0;line-height:1">✕</button>
          </div>
          <div class="tmpl-coc-body" id="tmpl-coc-body">
            <div style="font-size:11px;color:var(--muted);text-align:center;padding-top:24px">
              Loading…
            </div>
          </div>
        </div>
      </div>
      <div class="tmpl-coc-panel" id="tmpl-tests-panel">
        <div class="tmpl-coc-resize" id="tmpl-tests-resize" title="Drag to resize"></div>
        <div class="tmpl-coc-inner">
          <div class="tmpl-coc-header">
            <span class="tmpl-coc-title">Tests</span>
            <button onclick="toggleTmplTests()" style="background:none;border:none;
              color:var(--muted);cursor:pointer;font-size:14px;padding:0;line-height:1">✕</button>
          </div>
          <div class="tmpl-coc-body" id="tmpl-tests-body">
            <div style="font-size:11px;color:var(--muted);text-align:center;padding-top:24px">
              Loading…
            </div>
          </div>
        </div>
      </div>`;
  }

  const inner = document.getElementById('editor-inner');
  if (!inner) return;

  const isReleased = t.status === 'released';

  inner.innerHTML = `
    <!-- Toolbar -->
    <div class="editor-toolbar">
      <input class="editor-title-input" id="tmpl-name-input"
        value="${escHtml(t.name)}" placeholder="Template name..."
        oninput="markDirty()" ${isReleased ? 'disabled' : ''} />
      <span style="font-family:var(--font-mono);font-size:11px;color:var(--muted);
        flex-shrink:0;padding:0 4px" title="Version">${escHtml(ver)}</span>
      <select class="config-select" style="width:auto;font-size:11px" id="tmpl-status-sel"
        onchange="onStatusChange()">
        <option value="draft"${t.status==='draft'?' selected':''}>Draft</option>
        <option value="released"${t.status==='released'?' selected':''}>Released</option>
        <option value="archived"${t.status==='archived'?' selected':''}>Archived</option>
      </select>
      <!-- Auto-save status indicator -->
      <span id="autosave-indicator"
        style="font-size:10px;font-family:var(--font-mono);color:var(--muted);
        display:flex;align-items:center;gap:5px;flex-shrink:0;margin-left:4px">
        <span id="autosave-dot" style="width:6px;height:6px;border-radius:50%;
          background:var(--muted);flex-shrink:0;transition:background .3s"></span>
        <span id="autosave-text">Auto-save on</span>
      </span>
      <div style="display:flex;gap:6px;margin-left:8px">
        <button class="btn btn-ghost btn-sm" onclick="launchInstance()">▶ Launch</button>
        <button class="btn btn-ghost btn-sm" onclick="toggleTmplCoC()" id="coc-btn"
          title="Change history">CoC</button>
        ${!isReleased ? `
        <button class="btn btn-ghost btn-sm" onclick="toggleTmplTests()" id="tests-btn"
          title="Built-in self tests">Tests</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="deleteTemplate()">🗑</button>
        ${!isReleased ? `
        <button class="btn btn-ghost btn-sm" id="save-btn" onclick="saveTemplate(false)"
          title="Save without version bump">Save</button>
        <button class="btn btn-solid btn-sm" id="commit-btn" onclick="commitTemplate()">Commit</button>
        ` : `
        <span style="font-size:11px;color:var(--muted);padding:0 4px;
          display:flex;align-items:center;gap:4px">🔒 Read only — set to Draft to edit</span>
        `}
      </div>
    </div>

    ${isReleased ? `
    <div style="background:rgba(42,157,64,.07);border-bottom:1px solid rgba(42,157,64,.2);
      padding:6px 16px;font-size:11px;color:#7af0a0;display:flex;align-items:center;gap:8px;
      flex-shrink:0">
      🔒 Released — template is read only. Change status to <strong>Draft</strong> to resume editing.
    </div>` : ''}

    <!-- Template props bar -->
    <div class="tmpl-props-bar">
      <span class="tmpl-props-label">Trigger</span>
      <select class="config-select" style="width:auto;font-size:11px;padding:4px 8px" id="tmpl-trigger-sel"
        onchange="markDirty()" ${isReleased ? 'disabled' : ''}>
        <option value="manual"${t.trigger_type==='manual'?' selected':''}>Manual Launch</option>
        <option value="missed_milestone"${t.trigger_type==='missed_milestone'?' selected':''}>Missed Milestone</option>
        <option value="resource_denied"${t.trigger_type==='resource_denied'?' selected':''}>Resource Request Denied</option>
        <option value="meeting_close"${t.trigger_type==='meeting_close'?' selected':''}>Meeting Conclusion</option>
        <option value="material_request"${t.trigger_type==='material_request'?' selected':''}>Material Request</option>
        <option value="exception_resolved"${t.trigger_type==='exception_resolved'?' selected':''}>Exception Resolved</option>
      </select>
      <span class="tmpl-props-label" style="margin-left:8px">Description</span>
      <input class="config-input" style="flex:1;font-size:11px;padding:4px 8px" id="tmpl-desc-input"
        value="${escHtml(t.description||'')}" placeholder="What is this workflow for?"
        oninput="markDirty()" ${isReleased ? 'disabled' : ''} />
    </div>

    <!-- Editor body — tabbed: Steps | Diagram -->
    <div class="editor-body">
      <!-- View tab bar — pill toggle style -->
      <div style="display:flex;align-items:center;gap:0;border-bottom:1px solid var(--border);
        flex-shrink:0;background:var(--bg1);padding:0 16px">
        <span style="font-size:11px;font-weight:500;color:var(--muted);
          margin-right:10px;white-space:nowrap">Edit Mode:</span>
        <div style="display:flex;align-items:center;gap:0;border:1px solid var(--border);border-radius:5px;overflow:hidden">
          <button id="view-tab-steps" onclick="switchEditorView('steps')"
            style="padding:5px 14px;font-size:11px;font-weight:600;letter-spacing:.06em;
              background:var(--cad);color:var(--bg0);
              border:none;cursor:pointer;transition:all .12s;text-transform:uppercase">STEPS</button>
          <button id="view-tab-diagram" onclick="switchEditorView('diagram')"
            style="padding:5px 14px;font-size:11px;font-weight:600;letter-spacing:.06em;
              background:transparent;color:var(--muted);
              border:none;border-left:1px solid var(--border);cursor:pointer;transition:all .12s;text-transform:uppercase">DIAGRAM</button>
        </div>
        ${!isReleased ? `
        <button id="tab-add-step-btn" onclick="tabAddStep(event)"
          style="margin-left:auto;padding:5px 14px;font-size:11px;font-weight:600;background:none;
            border:1px solid var(--cad-wire);border-radius:3px;color:var(--cad);
            cursor:pointer;letter-spacing:.06em;text-transform:uppercase">+ ADD STEP</button>` : ''}
      </div>

      <!-- Steps view — no bottom Add step button needed; it's in the tab bar now -->
      <div id="editor-view-steps" class="spine-area">
        ${!isReleased ? renderAIBanner() : ''}
        <div id="spine-wrap" class="spine-wrap">
          ${renderSpine()}
        </div>
      </div>

      <!-- Diagram view -->
      <div id="editor-view-diagram" style="display:none;flex:1;flex-direction:column;overflow:hidden;min-height:0;position:relative">
        <!-- Controls bar -->
        <div style="display:flex;gap:6px;padding:6px 12px;border-bottom:1px solid var(--border);flex-shrink:0;align-items:center;background:var(--bg1)">
          <button onclick="dagZoomIn()" style="padding:4px 12px;font-size:12px;background:none;border:1px solid var(--border);border-radius:3px;color:var(--text2);cursor:pointer">+ Zoom</button>
          <button onclick="dagZoomOut()" style="padding:4px 12px;font-size:12px;background:none;border:1px solid var(--border);border-radius:3px;color:var(--text2);cursor:pointer">− Zoom</button>
          <button onclick="dagResetView()" style="padding:4px 12px;font-size:12px;background:none;border:1px solid var(--border);border-radius:3px;color:var(--text2);cursor:pointer">⟲ Reset</button>
          <span style="font-size:11px;color:var(--muted);margin-left:4px">Drag · Ctrl+scroll · Click node or ◁ to edit</span>
          <span id="dag-zoom-label" style="margin-left:auto;font-size:11px;color:var(--muted);font-family:var(--font-mono)">100%</span>
        </div>
        <!-- Canvas row -->
        <div style="flex:1;min-height:0;position:relative;display:flex;overflow:hidden">
          <div id="dag-canvas-wrap" style="flex:1;position:relative;overflow:hidden;cursor:grab">
            <canvas id="dag-canvas" style="display:block;position:absolute;top:0;left:0"></canvas>
          </div>
        </div>
        <!-- Decision outcome cards -->
        <div id="dag-cards" style="display:none;flex-wrap:wrap;gap:10px;padding:10px 12px;border-top:1px solid var(--border);flex-shrink:0;background:var(--bg1);max-height:160px;overflow-y:auto"></div>
        <!-- Slide-in panel — positioned relative to outer diagram div, covers canvas AND cards -->
        <div id="dag-slide-panel" style="position:absolute;top:0;right:0;bottom:0;width:380px;background:var(--bg1);border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;transform:translateX(100%);transition:transform .22s cubic-bezier(.4,0,.2,1);z-index:40;box-shadow:-4px 0 24px rgba(0,0,0,.6)">
          <!-- Drag-to-resize handle on left edge -->
          <div id="dag-panel-resize" style="position:absolute;left:0;top:0;bottom:0;width:6px;cursor:ew-resize;z-index:10;background:transparent;transition:background .15s"
            onmouseover="this.style.background='rgba(0,185,195,.3)'"
            onmouseout="if(!_dagResizing)this.style.background='transparent'"></div>
          <div id="dag-panel-header" style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg2)">
            <span id="dag-panel-icon" style="font-size:13px"></span>
            <span id="dag-panel-title" style="font-size:12px;font-weight:500;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
            ${!isReleased ? `<button onclick="dagPanelDeleteStep()" style="background:none;border:1px solid transparent;color:var(--muted);cursor:pointer;font-size:12px;padding:2px 6px;border-radius:4px;flex-shrink:0;transition:all .15s" onmouseover="this.style.borderColor='rgba(192,64,74,.4)';this.style.color='var(--red)'" onmouseout="this.style.borderColor='transparent';this.style.color='var(--muted)'" title="Delete step">🗑</button>` : ''}
            <button onclick="dagClosePanel()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px;padding:0 2px;line-height:1;flex-shrink:0" title="Close (Esc)">×</button>
          </div>
          <div id="dag-panel-body" style="flex:1;overflow-y:auto;padding:14px 14px 20px"></div>
        </div>
      </div>
    </div>`;
}

function switchEditorView(view) {
  _editorView = view;
  const stepsEl   = document.getElementById('editor-view-steps');
  const diagEl    = document.getElementById('editor-view-diagram');
  const stepsTab  = document.getElementById('view-tab-steps');
  const diagTab   = document.getElementById('view-tab-diagram');
  if (!stepsEl || !diagEl) return;

  if (view === 'diagram') {
    stepsEl.style.display = 'none';
    diagEl.style.display        = 'flex';
    diagEl.style.flexDirection  = 'column';
    diagEl.style.flex           = '1';
    diagEl.style.minHeight      = '0';
    stepsTab.style.background   = 'transparent';
    stepsTab.style.color        = 'var(--muted)';
    diagTab.style.background    = 'var(--cad)';
    diagTab.style.color         = 'var(--bg0)';
    _dagAutoFitted = false;
    setTimeout(() => { _initDagEvents(); renderDAG(); }, 50);
  } else {
    diagEl.style.display        = 'none';
    stepsEl.style.display       = 'flex';
    stepsTab.style.background   = 'var(--cad)';
    stepsTab.style.color        = 'var(--bg0)';
    diagTab.style.background    = 'transparent';
    diagTab.style.color         = 'var(--muted)';
  }
}

function renderAIBanner() {
  if (_selectedTmpl?.steps?.length) return ''; // hide once steps exist
  return `
    <div class="ai-banner" id="ai-banner">
      <div class="ai-banner-icon">✦</div>
      <div class="ai-banner-body">
        <div class="ai-banner-title">AI-Assisted Template Authoring</div>
        <div class="ai-banner-text">Describe your process in plain language and CadenceHUD will draft the step structure for you to review and adjust.</div>
        <textarea class="ai-draft-textarea" id="ai-draft-input"
          placeholder="e.g. Engineering submits a design spec. Two internal reviewers must approve. If either requests changes, it goes back to engineering. Once approved, the client signs off via email link..."></textarea>
        <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
          <button class="btn btn-cad btn-sm" onclick="runAIDraft()" id="ai-draft-btn">✦ Draft Template</button>
          <span id="ai-draft-status" style="font-size:11px;color:var(--muted)"></span>
        </div>
      </div>
    </div>`;
}

function renderSpine() {
  const steps = _selectedTmpl?.steps || [];
  if (!steps.length) {
    return `<div style="padding:20px 0;font-size:12px;color:var(--muted);text-align:center">
      No steps yet — add your first step below, or use AI draft above.
    </div>`;
  }

  const trigger = {
    id: '__trigger__',
    step_type: 'trigger',
    name: 'Trigger: ' + (_selectedTmpl.trigger_type||'manual').replace(/_/g,' '),
    sequence_order: 0,
    _virtual: true,
  };

  return [trigger, ...steps].map((step, idx) => {
    const meta   = STEP_META[step.step_type] || STEP_META.action;
    const isLast = idx === steps.length;
    const sel    = _selectedStep?.id === step.id;
    const assigneeLine = step.assignee_name || step.assignee_email ||
      (step.assignee_type === 'pm' ? 'Project Manager' :
       step.assignee_type === 'role' ? step.assignee_role : '—');

    return `
      <div class="spine-step" id="sstep-${step.id}"
        ${!step._virtual ? `draggable="true"
          ondragstart="stepDragStart(event,'${step.id}')"
          ondragover="stepDragOver(event,'${step.id}')"
          ondragleave="stepDragLeave(event,'${step.id}')"
          ondrop="stepDrop(event,'${step.id}')"
          ondragend="stepDragEnd(event)"` : ''}>
        <div class="spine-track">
          ${!step._virtual ? `<div class="spine-drag-handle" title="Drag to reorder">⠿</div>` : ''}
          <div class="spine-node ${meta.nodeClass}${sel?' selected':''}"
            onclick="selectStep('${step.id}')"
            title="${meta.label}">${meta.icon}</div>
          ${!isLast ? '<div class="spine-line"></div>' : ''}
        </div>
        <div class="spine-content">
          <!-- Card header — always visible -->
          <div class="spine-card${sel?' selected':''}" style="border-radius:${sel?'6px 6px 0 0':'6px'}"
            onclick="selectStep('${step.id}')">
            <div class="spine-card-row">
              <div style="flex:1;min-width:0">
                <div class="spine-card-name">${escHtml(step.name || meta.label)}</div>
                <div class="spine-card-meta">
                  ${assigneeLine !== '—' ? `<span>👤 ${escHtml(assigneeLine)}</span>` : ''}
                  ${step.due_days != null ? `<span>⏱ ${step.due_type==='before_completion' ? step.due_days+'d before target' : '+'+step.due_days+'d'}</span>` : ''}
                  ${step.escalate_after_days ? `<span style="color:var(--amber)">↑ escalate d${step.escalate_after_days}</span>` : ''}
                  ${(step._attachedDocs||[]).length ? (() => {
                    const auth  = (step._attachedDocs||[]).filter(d=>d.role==='authorization').length;
                    const evid  = (step._attachedDocs||[]).filter(d=>d.role==='evidence').length;
                    const ref   = (step._attachedDocs||[]).filter(d=>!d.role||d.role==='reference').length;
                    const parts = [];
                    if (auth)  parts.push(`<span style="color:var(--amber)">⬆ ${auth} auth</span>`);
                    if (evid)  parts.push(`<span style="color:var(--green)">📝 ${evid} evidence</span>`);
                    if (ref)   parts.push(`<span style="color:var(--accent)">📋 ${ref} ref</span>`);
                    return parts.join('');
                  })() : ''}
                  ${step.input_from_step ? `<span style="color:var(--green)">⬇ input wired</span>` : ''}
                  ${step.forward_input ? `<span style="color:var(--amber)">⬆ forwards</span>` : ''}
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                <span class="spine-card-badge"
                  style="background:${meta.badgeColor};color:${meta.badgeText};border-color:${meta.badgeText}40">
                  ${meta.label.toUpperCase()}
                </span>
                ${!step._virtual && _selectedTmpl?.status !== 'released' ? `<button class="spine-delete-inline"
                  onclick="event.stopPropagation();removeStep('${step.id}')"
                  title="Delete step">🗑</button>` : ''}
                <span style="font-size:10px;color:var(--muted);transition:transform .15s;
                  transform:rotate(${sel?'180':'0'}deg)">▼</span>
              </div>
            </div>
            ${step.step_type === 'branch' && step.branch_conditions?.length ? renderBranchConditions(step) : ''}
            ${!step._virtual && step.step_type !== 'trigger' ? (() => {
              const outs = _getOutcomes(step);
              return `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;padding-top:5px;border-top:1px solid var(--border)">
                ${outs.map(o => `<span style="font-size:9px;padding:1px 7px;border-radius:9px;font-weight:500;letter-spacing:.03em;
                  background:${o.color}22;color:${o.color};border:1px solid ${o.color}44">${escHtml(o.label)}</span>`).join('')}
              </div>`;
            })() : ''}
          </div>

          <!-- Inline config — expands below card when selected -->
          <div class="step-inline-cfg${sel?' open':''}" id="icfg-${step.id}">
            ${sel && !step._virtual ? renderInlineStepConfig(step) : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

function reRenderSpine() {
  // If dag panel is open, refresh panel body instead of spine
  if (_dagPanelOpen && _selectedStep) {
    const body = document.getElementById('dag-panel-body');
    if (body) { body.innerHTML = renderInlineStepConfig(_selectedStep); return; }
  }
  const spineEl = document.getElementById('spine-wrap');
  if (spineEl) spineEl.innerHTML = renderSpine();
  if (_editorView === 'diagram') requestAnimationFrame(() => renderDAG());
}

function renderBranchConditions(step) {
  const conds = step.branch_conditions || [];
  return `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:4px">
    ${conds.map(c => `
      <div style="font-size:11px;display:flex;gap:6px;align-items:center">
        <span style="font-family:var(--font-mono);color:var(--muted)">IF</span>
        <span style="color:var(--text2)">${escHtml(c.condition||'—')}</span>
        <span style="font-family:var(--font-mono);color:var(--muted)">→</span>
        <span style="color:var(--cad)">${escHtml(c.label||'next step')}</span>
      </div>`).join('')}
  </div>`;
}

function renderInlineStepConfig(step) {
  const meta = STEP_META[step.step_type] || STEP_META.action;
  const docs = step._attachedDocs || [];
  const ro   = _selectedTmpl?.status === 'released'; // read-only mode
  const dis  = ro ? 'disabled' : '';                 // shorthand for input attribute

  return `
    <div style="${ro ? 'pointer-events:none;user-select:none' : ''}">
    ${ro ? `<div style="font-size:10px;color:var(--muted);padding:4px 0 8px;
      font-style:italic;pointer-events:none">🔒 Read only — set template to Draft to edit</div>` : ''}
    <div style="${ro ? 'opacity:.55' : ''}">
    <!-- Config fields in a 2-column grid -->
    <div class="cfg-grid">

      <!-- Step Name — full width -->
      <div class="config-section cfg-full" style="padding-bottom:6px">
        <label class="config-label">Step Name</label>
        <input class="config-input" id="scfg-name-${step.id}" value="${escHtml(step.name||'')}"
          placeholder="${meta.label}..."
          oninput="updateStepField('name',this.value)" ${dis} />
      </div>

      <!-- Assignee Type -->
      <div class="config-section">
        <label class="config-label">Assignee Type</label>
        <select class="config-select" id="scfg-atype-${step.id}"
          onchange="updateStepField('assignee_type',this.value);reRenderSpine()">
          <option value="user"${step.assignee_type==='user'?' selected':''}>Specific User</option>
          <option value="role"${step.assignee_type==='role'?' selected':''}>Role</option>
          <option value="external"${step.assignee_type==='external'?' selected':''}>External (no login)</option>
          <option value="pm"${step.assignee_type==='pm'?' selected':''}>Project Manager</option>
        </select>
      </div>

      <!-- Assignee detail — depends on type -->
      ${step.assignee_type === 'user' ? `
      <div class="config-section">
        <label class="config-label">Assignee</label>
        <select class="config-select" id="scfg-user-${step.id}"
          onchange="autoFillAssignee('${step.id}',this.value)">
          ${renderResourceOptions(
            step.assignee_resource_id ||
            _users_cad.find(u => u.id === step.assignee_user_id)?.resource_id || '',
            '— Select resource —'
          )}
        </select>
      </div>` : ''}

      ${step.assignee_type === 'role' ? `
      <div class="config-section">
        <label class="config-label">Role / Job Title</label>
        <select class="config-select" id="scfg-role-${step.id}"
          onchange="updateStepField('assignee_role',this.value)">
          <option value="">— Select role —</option>
          ${[...new Set(_resources_cad.filter(r=>r.title).map(r=>r.title))].sort()
            .map(t=>`<option value="${escHtml(t)}"${step.assignee_role===t?' selected':''}>${escHtml(t)}</option>`)
            .join('')}
        </select>
      </div>` : ''}

      ${step.assignee_type === 'external' ? `
      <div class="config-section">
        <label class="config-label">External Recipient</label>
        <select class="config-select" id="scfg-ext-${step.id}"
          onchange="selectExternalAssignee('${step.id}',this.value)">
          <option value="">— Select external resource —</option>
          ${_resources_cad.filter(r=>r.is_external).map(r=>
            `<option value="${r.id}"
              data-name="${escHtml(r.name)}"
              data-email="${escHtml(r.email||'')}"
              data-org="${escHtml(r.department||'')}"
              ${step.assignee_name===r.name?' selected':''}>
              ${escHtml(r.name)}${r.title?' — '+escHtml(r.title):''}
            </option>`).join('')}
        </select>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px">
          <div>
            <label class="config-label" style="font-size:9px">Name</label>
            <input class="config-input" id="scfg-extname-${step.id}" style="font-size:11px"
              value="${escHtml(step.assignee_name||'')}" placeholder="Full name"
              oninput="updateStepField('assignee_name',this.value)" />
          </div>
          <div>
            <label class="config-label" style="font-size:9px">Email</label>
            <input class="config-input" id="scfg-extemail-${step.id}" type="email" style="font-size:11px"
              value="${escHtml(step.assignee_email||'')}" placeholder="email@client.com"
              oninput="updateStepField('assignee_email',this.value)" />
          </div>
          <div>
            <label class="config-label" style="font-size:9px">Organisation</label>
            <input class="config-input" id="scfg-extorg-${step.id}" style="font-size:11px"
              value="${escHtml(step.assignee_org||'')}" placeholder="e.g. OrthoMotion Dynamics"
              oninput="updateStepField('assignee_org',this.value)" />
          </div>
        </div>
      </div>` : ''}

      ${step.assignee_type === 'pm' ? `<div class="config-section"></div>` : ''}

      <!-- Due date — type + value, full width -->
      <div class="config-section cfg-full">
        <label class="config-label">Due Date</label>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <select class="config-select" style="flex:0 0 auto;min-width:220px"
            onchange="updateStepField('due_type',this.value);reRenderSpine()">
            <option value="after_prior"${(step.due_type||'after_prior')==='after_prior'?' selected':''}>
              Within X days after prior step completes
            </option>
            <option value="before_completion"${step.due_type==='before_completion'?' selected':''}>
              X days before workflow completion date
            </option>
          </select>
          <input class="config-input" type="number" min="0" style="width:70px;flex-shrink:0"
            value="${step.due_days!=null?step.due_days:''}" placeholder="days"
            oninput="updateStepField('due_days',this.value===''?null:parseInt(this.value))" />
          <span style="font-size:11px;color:var(--muted)">
            ${(step.due_type||'after_prior')==='after_prior'
              ? 'business days'
              : 'business days before target completion'}
          </span>
        </div>
      </div>

      <!-- Escalate after -->
      <div class="config-section">
        <label class="config-label">Escalate After (Days)</label>
        <div style="display:flex;gap:5px">
          <input class="config-input" type="number" min="1" style="flex:1"
            value="${step.escalate_after_days||''}" placeholder="e.g. 2"
            oninput="updateStepField('escalate_after_days',parseInt(this.value)||null)" />
          <select class="config-select" style="flex:1"
            onchange="updateStepField('escalate_to',this.value)">
            <option value="pm"${step.escalate_to==='pm'?' selected':''}>→ PM</option>
            <option value="manager"${step.escalate_to==='manager'?' selected':''}>→ Manager</option>
          </select>
        </div>
      </div>

      <!-- Parallel toggle (approval/external/signoff/confirmation only) -->
      ${step.step_type === 'approval' || step.step_type === 'external' ||
        step.step_type === 'signoff' || step.step_type === 'confirmation' ? `
      <div class="config-section">
        <label class="config-label">Multi-Reviewer Rule</label>
        <div class="config-toggle"
          onclick="updateStepField('parallel_required',!${!!step.parallel_required});reRenderSpine()">
          <div class="toggle-box${step.parallel_required?' on':''}"></div>
          <span style="font-size:11px">${step.parallel_required ? 'All must sign off' : 'First response advances'}</span>
        </div>
      </div>` : '<div></div>'}

      <!-- Reject-to field (approval/review/signoff/confirmation steps) -->
      ${step.step_type === 'approval' || step.step_type === 'review' ||
        step.step_type === 'signoff' || step.step_type === 'confirmation' ? `
      <div class="config-section cfg-full">
        <label class="config-label">On Rejection — Return to Step</label>
        <select class="config-select"
          onchange="updateStepField('reject_to',this.value||null)">
          <option value="">— Prior step (default) —</option>
          ${(_selectedTmpl?.steps||[])
            .filter(s => s.sequence_order < step.sequence_order)
            .sort((a,b) => a.sequence_order - b.sequence_order)
            .map(s => `<option value="${s.id}" ${step.reject_to===s.id?' selected':''}>
              Step ${s.sequence_order}: ${escHtml(s.name||STEP_META[s.step_type]?.label||'Step')}
            </option>`).join('')}
        </select>
        <div style="margin-top:4px;font-size:10px;color:var(--muted)">
          When rejected, the puck returns here and that step's assignee is notified to remediate.
          A CoC rejection event is written with reason and timestamp.
        </div>
      </div>` : '<div></div>'}

      <!-- Confirmation step: attestation items checklist -->
      ${step.step_type === 'confirmation' ? `
      <div class="config-section cfg-full">
        <label class="config-label" style="margin-bottom:6px">Attestation Items</label>
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px">
          At runtime, the assignee must check each item before confirming. Leave blank for a
          simple "I confirm all activities are complete" attestation.
        </div>
        <div id="confirm-items-${step.id}">
          ${(step._confirmItems||[]).map((item,i) => `
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
              <span style="color:var(--step-confirm-c);flex-shrink:0">✓</span>
              <input class="config-input" style="flex:1" value="${escHtml(item)}"
                placeholder="e.g. All action items closed"
                oninput="updateConfirmItem('${step.id}',${i},this.value)" />
              <button class="attached-doc-remove"
                onclick="removeConfirmItem('${step.id}',${i})">✕</button>
            </div>`).join('')}
        </div>
        <button class="btn btn-ghost btn-sm" style="margin-top:4px;font-size:11px"
          onclick="addConfirmItem('${step.id}')">+ Add item</button>
      </div>` : ''}

      <!-- Meeting step: agenda items, action items placeholder, instructions, comments -->
      ${step.step_type === 'meeting' ? `
      <div class="config-section cfg-full">
        <label class="config-label" style="margin-bottom:6px">Meeting Agenda Items</label>
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px">
          Pre-populate the agenda. Items may also be defined or edited after the instance is launched.
        </div>
        <div id="meeting-agenda-${step.id}">
          ${(step._meetingAgenda||[]).map((item,i) => `
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px">
              <span style="color:#4fc88c;flex-shrink:0;font-size:11px">${i+1}.</span>
              <input class="config-input" style="flex:1" value="${escHtml(item)}"
                placeholder="e.g. Review design drawings"
                oninput="updateMeetingAgendaItem('${step.id}',${i},this.value)" />
              <button class="attached-doc-remove"
                onclick="removeMeetingAgendaItem('${step.id}',${i})">✕</button>
            </div>`).join('')}
        </div>
        <button class="btn btn-ghost btn-sm" style="margin-top:4px;font-size:11px;
          color:#4fc88c;border-color:rgba(79,200,140,.35)"
          onclick="addMeetingAgendaItem('${step.id}')">+ Add agenda item</button>
        <div style="margin-top:10px;font-size:11px;color:var(--muted)">
          Duration, location, and attendees are configured when the instance is launched.
        </div>
      </div>

      <!-- Meeting: Action Items placeholder -->
      <div class="config-section cfg-full">
        <label class="config-label" style="margin-bottom:4px">Action Items</label>
        <div style="font-size:11px;color:var(--muted);padding:8px 10px;
          border:1px dashed var(--border2);border-radius:4px;
          background:rgba(79,200,140,.03)">
          ◉ Action items will be created and assigned during the meeting itself.
          They are tracked within the meeting editor and appear in the Chain of Custody.
        </div>
      </div>` : ''}

      <!-- Instructions — full width (always shown; for meeting steps shown after action items) -->
      <div class="config-section cfg-full">
        <label class="config-label">Instructions to Assignee</label>
        <textarea class="config-textarea" style="min-height:52px"
          placeholder="Optional context shown to the assignee..."
          oninput="updateStepField('instructions',this.value)">${escHtml(step.instructions||'')}</textarea>
      </div>



    </div><!-- /cfg-grid -->

      <!-- Authorization input — chain-aware resolver for approval-type steps -->
      ${step.step_type === 'approval' || step.step_type === 'review' ||
        step.step_type === 'signoff' || step.step_type === 'external' ? `
      <div style="border:1px solid rgba(212,144,31,.4);border-radius:5px;
        margin:8px 14px 4px;background:rgba(212,144,31,.05);padding:10px 12px">

        <label class="config-label" style="color:var(--amber);margin-bottom:8px">
          ⬇ Authorization Input — document(s) arriving at this step
        </label>

        ${(() => {
          // Walk backwards through the step chain to find the nearest auth source.
          // A step is an auth source if it has Authorization-role docs attached,
          // OR if it has forward_input:true (it's passing along what it received).
          const allSteps = (_selectedTmpl?.steps || [])
            .filter(s => s.sequence_order < step.sequence_order)
            .sort((a,b) => b.sequence_order - a.sequence_order);

          // Trace the chain: find what arrives at this step
          // Walk forward through prior steps accumulating forwarded docs
          const priorAsc = [...allSteps].reverse(); // ascending order
          let chainDocs = []; // docs being passed along the chain
          let sourceStep = null;

          for (const s of priorAsc) {
            const authOnStep = (s._attachedDocs||[]).filter(d => d.role === 'authorization');
            if (authOnStep.length) {
              // This step has auth docs — they start the chain here
              chainDocs = authOnStep;
              sourceStep = s;
            } else if (s.forward_input && chainDocs.length) {
              // This step forwards whatever is in the chain — pass through
              sourceStep = s;
            } else if (!s.forward_input) {
              // Chain broken — this step doesn't forward
              chainDocs = [];
              sourceStep = null;
            }
          }

          if (!chainDocs.length) {
            const nearestPrior = allSteps[0];
            return `<div style="font-size:11px;color:var(--muted)">
              No Authorization document is routed to this step yet.<br/>
              ${nearestPrior
                ? `Either attach an ⬆ Authorization document to a prior step,
                   or enable <em>Forward on Approval</em> on an intermediate step.`
                : `This appears to be the first step.`}
            </div>`;
          }

          return `
            <div style="font-size:11px;color:var(--muted);margin-bottom:6px">
              Arriving via <strong style="color:var(--text)">
                Step ${sourceStep.sequence_order}: ${escHtml(sourceStep.name||'Prior step')}
              </strong>:
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px">
              ${chainDocs.map(d => `
                <div class="attached-doc" style="border-color:rgba(212,144,31,.35);gap:6px">
                  <span style="color:var(--amber);flex-shrink:0">⬆</span>
                  <span class="attached-doc-name" style="flex:1;min-width:0">${escHtml(d.name)}</span>
                  <span style="font-size:10px;color:var(--cad);font-family:var(--font-mono);flex-shrink:0;white-space:nowrap">${escHtml(d.version||'—')}</span>
                  ${d.url ? `<button class="attached-doc-remove" style="color:var(--accent)"
                    onclick="window.open('${d.url}','_blank')" title="Preview">⤢</button>` : ''}
                </div>`).join('')}
            </div>
            <div style="font-size:11px;color:var(--green);display:flex;gap:5px;align-items:flex-start">
              <span>✓</span>
              <span>These document(s) will be presented to this step's assignee at runtime.</span>
            </div>`;
        })()}

        <!-- Forward on Approval toggle — pass received docs downstream -->
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(212,144,31,.2)">
          <label class="config-label" style="margin-bottom:6px">Forward on Approval</label>
          <div class="config-toggle"
            onclick="updateStepField('forward_input',!${!!step.forward_input});reRenderSpine()">
            <div class="toggle-box${step.forward_input?' on':''}"></div>
            <span style="font-size:11px">${step.forward_input
              ? 'Received Authorization document(s) will be passed to the next step when approved'
              : 'Document chain stops here — not passed downstream'}</span>
          </div>
          ${step.forward_input ? `
          <div style="margin-top:5px;font-size:11px;color:var(--amber);display:flex;gap:5px">
            <span>⬆</span>
            <span>The document(s) arriving at this step will be forwarded to the next step
            in the chain when this approval is granted.</span>
          </div>` : ''}
        </div>

      </div>` : ''}

      <!-- forward_input toggle for non-approval steps that receive auth docs -->
      ${step.step_type === 'action' || step.step_type === 'form' ? (() => {
        const allSteps = (_selectedTmpl?.steps || [])
          .filter(s => s.sequence_order < step.sequence_order)
          .sort((a,b) => b.sequence_order - a.sequence_order);
        const priorAsc = [...allSteps].reverse();
        let chainDocs = [], sourceStep = null;
        for (const s of priorAsc) {
          const authOnStep = (s._attachedDocs||[]).filter(d => d.role === 'authorization');
          if (authOnStep.length) { chainDocs = authOnStep; sourceStep = s; }
          else if (s.forward_input && chainDocs.length) { sourceStep = s; }
          else if (!s.forward_input) { chainDocs = []; sourceStep = null; }
        }
        if (!chainDocs.length) return '';
        return `
        <div style="border:1px solid rgba(212,144,31,.3);border-radius:5px;
          margin:8px 14px 4px;background:rgba(212,144,31,.03);padding:10px 12px">
          <label class="config-label" style="color:var(--amber);margin-bottom:6px">
            ⬇ Authorization Document in Chain
          </label>
          <div style="font-size:11px;color:var(--muted);margin-bottom:8px">
            This step receives the Authorization document from
            <strong style="color:var(--text)">Step ${sourceStep.sequence_order}: ${escHtml(sourceStep.name||'')}</strong>.
          </div>
          <label class="config-label" style="margin-bottom:6px">Forward Downstream</label>
          <div class="config-toggle"
            onclick="updateStepField('forward_input',!${!!step.forward_input});reRenderSpine()">
            <div class="toggle-box${step.forward_input?' on':''}"></div>
            <span style="font-size:11px">${step.forward_input
              ? 'Pass Authorization document(s) to the next step'
              : 'Document chain stops here'}</span>
          </div>
        </div>`;
      })() : ''}


    <!-- Outcomes section — named exits for this step -->
    ${step.step_type !== 'trigger' && step.step_type !== 'branch' ? `
    <div style="padding:10px 14px 8px;border-top:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <label class="config-label" style="margin-bottom:0">Outcomes</label>
        <span style="font-size:10px;color:var(--muted)">Named exits — drive routing in Layer 2</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px" id="outcomes-list-${step.id}">
        ${_getOutcomes(step).map((o, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;
          background:var(--bg2);border:1px solid var(--border);border-radius:5px">
          <div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${escHtml(o.color||'#888')}"></div>
          <input class="config-input" style="flex:1;font-size:11px;padding:3px 6px"
            value="${escHtml(o.label)}" placeholder="Outcome name"
            oninput="updateOutcomeField('${step.id}',${i},'label',this.value)" />
          <select class="config-select" style="font-size:10px;padding:3px 6px;width:auto"
            onchange="updateOutcomeField('${step.id}',${i},'color',this.value)">
            <option value="#1D9E75"${o.color==='#1D9E75'?' selected':''}>Green</option>
            <option value="#BA7517"${o.color==='#BA7517'?' selected':''}>Amber</option>
            <option value="#E24B4A"${o.color==='#E24B4A'?' selected':''}>Red</option>
            <option value="#4f8ef7"${o.color==='#4f8ef7'?' selected':''}>Blue</option>
            <option value="#888"${(o.color||'#888')==='#888'?' selected':''}>Gray</option>
          </select>
          ${!o.isDefault ? `
          <button onclick="removeOutcome('${step.id}',${i})"
            style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:12px;
              padding:0 2px;line-height:1;flex-shrink:0" title="Remove outcome">✕</button>
          ` : `<span style="font-size:9px;color:var(--muted);flex-shrink:0;padding:0 4px"
            title="Default — advances to next step">→</span>`}
        </div>`).join('')}
      </div>
      <button onclick="addOutcome('${step.id}')"
        style="margin-top:5px;width:100%;padding:5px;background:none;
          border:1px dashed var(--border2);border-radius:5px;cursor:pointer;
          font-size:11px;color:var(--muted)">+ Add outcome</button>
    </div>` : ''}

    <!-- Documents section — per-document role assignment -->
    <div style="padding:0 14px 6px;display:flex;align-items:center;justify-content:space-between">
      <label class="config-label" style="margin-bottom:0">Documents</label>
      <span style="font-size:10px;color:var(--muted)">Assign a role to each document</span>
    </div>

    <!-- Document role legend — single row, no wrap -->
    <div style="padding:0 14px 8px;display:flex;gap:20px;align-items:center;flex-wrap:nowrap;white-space:nowrap">
      <span style="font-size:10px;color:var(--muted)"><span style="color:var(--accent)">📋 Reference</span> — blank form, visible to assignee</span>
      <span style="font-size:10px;color:var(--muted)"><span style="color:var(--green)">📝 Evidence</span> — completed by assignee, stored on step</span>
      <span style="font-size:10px;color:var(--muted)"><span style="color:var(--amber)">⬆ Authorization</span> — <strong style="color:var(--amber)">gates step · routed to next step</strong></span>
    </div>

    <!-- Attached docs — 2-column grid, tiles left-right, new row every 2 docs -->
    <div id="attached-docs-${step.id}"
      style="display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:0 14px 6px">
      ${docs.map((d,i) => {
        const roleColor = d.role==='authorization' ? 'var(--amber)'
                        : d.role==='evidence'      ? 'var(--green)'
                        : 'var(--accent)';
        const roleIcon  = d.role==='authorization' ? '⬆'
                        : d.role==='evidence'      ? '📝'
                        : '📋';
        return `
        <div class="attached-doc" style="padding:5px 8px;gap:6px;flex-wrap:nowrap;align-items:center;margin:0">
          <span style="color:${roleColor};flex-shrink:0;font-size:12px">${roleIcon}</span>
          <span class="attached-doc-name" style="flex:1;min-width:0;font-size:11px">${escHtml(d.name)}</span>
          <span style="font-size:10px;color:var(--cad);font-family:var(--font-mono);flex-shrink:0;white-space:nowrap">${escHtml(d.version||'—')}</span>
          <span style="font-size:10px;color:var(--muted);flex-shrink:0;white-space:nowrap">${escHtml(d.size||'')}</span>
          <select style="font-size:10px;font-family:var(--font-mono);background:var(--surf3);
            border:1px solid var(--border2);border-radius:3px;padding:2px 4px;
            color:${roleColor};cursor:pointer;flex-shrink:0"
            onchange="setDocRole('${step.id}',${i},this.value)">
            <option value="reference"${(d.role||'reference')==='reference'?' selected':''}>📋 Ref</option>
            <option value="evidence"${d.role==='evidence'?' selected':''}>📝 Evidence</option>
            <option value="authorization"${d.role==='authorization'?' selected':''}>⬆ Auth</option>
          </select>
          <button class="attached-doc-remove" style="color:var(--accent);flex-shrink:0"
            onclick="viewAttachedDoc('${step.id}',${i})" title="View">⤢</button>
          <button class="attached-doc-remove" style="flex-shrink:0"
            onclick="removeAttachedDoc('${step.id}',${i})" title="Remove">✕</button>
        </div>`;
      }).join('')}
    </div>

    <!-- Drop zone + output zone — side by side when both present -->
    <div style="display:flex;gap:8px;padding:0 14px 10px;align-items:stretch">

      <!-- Drop zone — always shown -->
      <div class="doc-drop-zone" id="dropzone-${step.id}" style="flex:1;margin:0"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="handleDocDrop(event,'${step.id}')"
        onclick="document.getElementById('file-input-${step.id}').click()">
        <div class="doc-drop-zone-icon">📂</div>
        <div class="doc-drop-zone-text">
          <strong>Drop a document here</strong> or click to browse
        </div>
        <input type="file" id="file-input-${step.id}" style="display:none"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
          multiple onchange="handleDocFileInput(event,'${step.id}')" />
      </div>

      <!-- Output zone — shown alongside when an Authorization doc exists -->
      ${docs.some(d => d.role === 'authorization') ? `
      <div class="doc-drop-zone" style="flex:1;margin:0;border-color:rgba(212,144,31,.35);
          background:rgba(212,144,31,.04);cursor:default;pointer-events:none">
        <div class="doc-drop-zone-icon" style="opacity:.4">📤</div>
        <div class="doc-drop-zone-text">
          <strong style="color:var(--amber)">Authorization output zone active</strong><br/>
          At runtime, assignee uploads the completed copy here. Step cannot advance until filled.
        </div>
      </div>` : ''}

    </div>

    </div></div>`; 
}

function tabAddStep(e) {
  e.stopPropagation();
  if (_editorView === 'diagram') {
    _dagShowInsertPicker(e);
  } else {
    // In list mode — ensure we're passing a proper event with currentTarget
    // so toggleStepPicker can position the picker relative to the button
    const btn = document.getElementById('tab-add-step-btn');
    if (btn) toggleStepPicker({ currentTarget: btn, stopPropagation: ()=>{} });
  }
}

function _dagShowInsertPicker(e) {
  e.stopPropagation();
  if (!_selectedTmpl) return;
  const steps = (_selectedTmpl.steps || [])
    .filter(s => s.step_type !== 'trigger')
    .sort((a, b) => a.sequence_order - b.sequence_order);

  // Build a small dropdown overlay
  let existing = document.getElementById('dag-insert-picker');
  if (existing) { existing.remove(); return; }

  const btn  = e.currentTarget;
  const rect = btn.getBoundingClientRect();

  const picker = document.createElement('div');
  picker.id = 'dag-insert-picker';

  // Right-align picker to button's right edge, clamped to viewport
  const pickerW = 240;
  const leftPos = Math.max(8, rect.right - pickerW);

  picker.style.cssText = `position:fixed;z-index:300;background:var(--bg2);
    border:1px solid var(--border2);border-radius:6px;padding:8px 0;
    box-shadow:0 8px 24px rgba(0,0,0,.5);width:${pickerW}px;
    top:${rect.bottom + 6}px;left:${leftPos}px;font-family:var(--font-ui)`;

  picker.innerHTML = `
    <div style="font-size:9px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;
      padding:4px 12px 6px;font-weight:600">Insert position</div>
    <div onclick="_dagInsertAt(-1,event)"
      style="padding:7px 12px;font-size:11px;color:var(--text2);cursor:pointer;
        display:flex;align-items:center;gap:8px"
      onmouseover="this.style.background='var(--surf2)'"
      onmouseout="this.style.background=''">
      <span style="color:var(--cad)">⊕</span> At the beginning
    </div>
    ${steps.map((s, i) => `
    <div onclick="_dagInsertAt(${i},event)"
      style="padding:7px 12px;font-size:11px;color:var(--text2);cursor:pointer;
        display:flex;align-items:center;gap:8px"
      onmouseover="this.style.background='var(--surf2)'"
      onmouseout="this.style.background=''">
      <span style="color:var(--muted);font-size:9px;font-family:var(--font-mono);
        min-width:16px">${s.sequence_order}</span>
      After: ${escHtml(s.name || STEP_META[s.step_type]?.label || 'Step')}
    </div>`).join('')}`;

  document.body.appendChild(picker);
  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function _close() {
      document.getElementById('dag-insert-picker')?.remove();
      document.removeEventListener('click', _close);
    });
  }, 0);
}

function _dagInsertAt(afterIdx, e) {
  e?.stopPropagation();
  document.getElementById('dag-insert-picker')?.remove();
  _dagInsertAfterIdx = afterIdx;
  // Now open the step type picker anchored to the Add step button
  const btn = document.getElementById('tab-add-step-btn');
  if (btn) toggleStepPicker({ currentTarget: btn, stopPropagation: ()=>{} });
}

function toggleStepPicker(e) {
  const picker = document.getElementById('step-type-picker');
  if (!picker) return;

  const isOpen = picker.classList.contains('open');
  if (isOpen) { picker.classList.remove('open'); return; }

  const btn  = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const vh   = window.innerHeight;

  // Temporarily show off-screen to measure real height
  picker.style.visibility = 'hidden';
  picker.style.top  = '-9999px';
  picker.style.left = '-9999px';
  picker.style.position = 'fixed';
  picker.classList.add('open');

  const ph = picker.offsetHeight;  // real height now measurable
  const pw = picker.offsetWidth;

  // Prefer opening above the button; fall back to below if not enough room
  const spaceAbove = rect.top;
  const spaceBelow = vh - rect.bottom;
  let top;
  if (spaceAbove >= ph + 8) {
    top = rect.top - ph - 8;         // above
  } else if (spaceBelow >= ph + 8) {
    top = rect.bottom + 8;           // below
  } else {
    // Neither fits fully — align to top of viewport with scroll
    top = Math.max(8, vh - ph - 8);
  }

  // Horizontal: right-align picker to button's right edge, clamp to viewport
  let left = rect.right - pw;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (left < 8) left = 8;

  picker.style.top  = top  + 'px';
  picker.style.left = left + 'px';
  picker.style.visibility = '';
}

function addStep(type) {
  document.getElementById('step-type-picker')?.classList.remove('open');
  if (!_selectedTmpl) return;

  const meta = STEP_META[type] || STEP_META.action;
  const newStep = {
    id: 'new_' + Date.now(),
    template_id: _selectedTmpl.id,
    step_type: type,
    name: meta.label,
    sequence_order: (_selectedTmpl.steps?.length || 0) + 1,
    assignee_type: type === 'external' ? 'external' : 'user',
    due_days: 3,
    escalate_after_days: null,
    escalate_to: 'pm',
    parallel_required: false,
    forward_input: false,
    reject_to: null,
    _confirmItems: [],
    _attachedDocs: [],
    branch_conditions: type === 'branch' ? [
      { condition: 'Prior step result is Approved', label: 'Approved path', next_step_id: null },
      { condition: 'Prior step result is Changes Requested', label: 'Revision path', next_step_id: null },
    ] : [],
    _new: true,
  };

  if (!_selectedTmpl.steps) _selectedTmpl.steps = [];
  _selectedTmpl.steps.push(newStep);

  // If called from diagram mode with a specific insert position, reorder now
  if (_dagInsertAfterIdx !== null) {
    const nonTrigger = _selectedTmpl.steps
      .filter(s => s.step_type !== 'trigger')
      .sort((a, b) => a.sequence_order - b.sequence_order);
    // Remove newStep from end of nonTrigger, insert at target position
    const withoutNew = nonTrigger.filter(s => s.id !== newStep.id);
    const insertIdx  = _dagInsertAfterIdx + 1; // -1+1=0 (beginning), 0+1=1 (after first), etc.
    withoutNew.splice(insertIdx, 0, newStep);
    withoutNew.forEach((s, i) => s.sequence_order = i + 1);
    const trigger = _selectedTmpl.steps.find(s => s.step_type === 'trigger');
    _selectedTmpl.steps = [...(trigger ? [trigger] : []), ...withoutNew];
    _dagInsertAfterIdx = null;
  }

  _selectedStep = newStep;
  _dirtySteps = true;
  _structuralChange = true;
  if (_selectedTmpl.id) _binAppend(_selectedTmpl.id, {
    type: 'step_added', stepName: newStep.name || type,
    changedBy: _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member',
    ts: new Date().toISOString(),
  });
  _refreshCoCIfOpen();

  reRenderSpine();
  document.getElementById('ai-banner')?.remove();

  // In diagram mode, open the new step in the slide panel
  if (_editorView === 'diagram') {
    requestAnimationFrame(() => _dagJumpToStep(newStep.id, false));
  } else {
    // In list mode, scroll to the new step
    requestAnimationFrame(() => {
      document.getElementById(`sstep-${newStep.id}`)?.scrollIntoView({ behavior:'smooth', block:'center' });
    });
  }
}

function removeStep(id) {
  if (!_selectedTmpl?.steps) return;
  if (!confirm('Remove this step?')) return;
  const removed = _selectedTmpl.steps.find(s => s.id === id);
  _selectedTmpl.steps = _selectedTmpl.steps.filter(s => s.id !== id);
  _selectedTmpl.steps.forEach((s, i) => s.sequence_order = i + 1);
  if (_selectedStep?.id === id) _selectedStep = null;
  _dirtySteps = true;
  _structuralChange = true;
  if (_selectedTmpl.id) _binAppend(_selectedTmpl.id, {
    type: 'step_deleted', stepName: removed?.name || 'Step',
    changedBy: _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member',
    ts: new Date().toISOString(),
  });
  _refreshCoCIfOpen();
  reRenderSpine();
}

function stepDragStart(event, stepId) {
  _dragStepId = stepId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', stepId);
  // Slight delay so the drag image renders before opacity drops
  setTimeout(() => {
    document.getElementById('sstep-' + stepId)?.classList.add('dragging');
  }, 0);
}

function stepDragOver(event, stepId) {
  if (!_dragStepId || _dragStepId === stepId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  // Show indicator above or below based on mouse position
  const el   = document.getElementById('sstep-' + stepId);
  const rect = el?.getBoundingClientRect();
  if (!el || !rect) return;
  const midY = rect.top + rect.height / 2;
  el.classList.remove('drag-over-top', 'drag-over-bottom');
  el.classList.add(event.clientY < midY ? 'drag-over-top' : 'drag-over-bottom');
}

function stepDragLeave(event, stepId) {
  const el = document.getElementById('sstep-' + stepId);
  el?.classList.remove('drag-over-top', 'drag-over-bottom');
}

function stepDrop(event, targetStepId) {
  event.preventDefault();
  const el = document.getElementById('sstep-' + targetStepId);
  const isTop = el?.classList.contains('drag-over-top');
  el?.classList.remove('drag-over-top', 'drag-over-bottom');

  if (!_dragStepId || !_selectedTmpl?.steps) return;
  if (_dragStepId === targetStepId) return;

  const steps     = _selectedTmpl.steps;
  const fromIdx   = steps.findIndex(s => s.id === _dragStepId);
  const toIdx     = steps.findIndex(s => s.id === targetStepId);
  if (fromIdx < 0 || toIdx < 0) return;

  // Remove dragged step and insert before/after target
  const [moved] = steps.splice(fromIdx, 1);
  const insertAt = steps.findIndex(s => s.id === targetStepId);
  steps.splice(isTop ? insertAt : insertAt + 1, 0, moved);

  // Renumber sequence_order
  steps.forEach((s, i) => s.sequence_order = i + 1);
  _dirtySteps = true;
  if (_selectedTmpl?.id) _binAppend(_selectedTmpl.id, {
    type: 'step_reordered', stepName: moved?.name || 'Step',
    changedBy: _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member',
    ts: new Date().toISOString(),
  });
  _refreshCoCIfOpen();
  reRenderSpine();
}

function stepDragEnd(event) {
  // Clean up any leftover indicators
  document.querySelectorAll('.spine-step').forEach(el => {
    el.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom');
  });
  _dragStepId = null;
}

function selectStep(id) {
  // Toggle — clicking selected step collapses it
  if (_selectedStep?.id === id) {
    _selectedStep = null;
  } else {
    _selectedStep = id === '__trigger__'
      ? { id: '__trigger__' }
      : (_selectedTmpl?.steps?.find(s => s.id === id) || null);
  }
  reRenderSpine();
  // Comments on meeting steps are instance-only — not applicable in template editor
}

function refreshConfigPanel() { reRenderSpine(); } // backwards compat shim


function updateStepField(field, value) {
  if (!_selectedStep || _selectedStep.id === '__trigger__') return;
  const prev = _selectedStep[field];
  _selectedStep[field] = value;
  _dirtySteps = true;
  _updateVersionDisplay();
  document.getElementById('save-btn')?.classList.add('dirty');

  // Append to pending bin for CoC diff (skip noisy real-time fields)
  const skipBin = ['instructions']; // instructions tracked by diff, not bin
  if (_selectedTmpl?.id && !skipBin.includes(field) && prev !== value) {
    const authorName = _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member';
    _binAppend(_selectedTmpl.id, {
      type:      'field_changed',
      stepName:  _selectedStep.name || _selectedStep.step_type || 'Step',
      field,
      from:      prev,
      to:        value,
      changedBy: authorName,
      ts:        new Date().toISOString(),
    });
    // Refresh CoC panel live if it's open
    _refreshCoCIfOpen();
  }

  // Surgically update card header for name field
  if (field === 'name') {
    const cardEl = document.querySelector(`#sstep-${_selectedStep.id} .spine-card-name`);
    if (cardEl) cardEl.textContent = value || (STEP_META[_selectedStep.step_type]?.label || '');
  } else if (['assignee_name','assignee_email','assignee_role',
              'due_days','due_type','escalate_after_days','parallel_required',
              'input_from_step','forward_input','reject_to'].includes(field)) {
    reRenderSpine();
  }
}

async function saveTemplate(silent = false) {
  if (!_selectedTmpl) return;

  const btn = silent ? null : document.getElementById('save-btn');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  try {
    const nameEl    = document.getElementById('tmpl-name-input');
    const statusEl  = document.getElementById('tmpl-status-sel');
    const triggerEl = document.getElementById('tmpl-trigger-sel');
    const descEl    = document.getElementById('tmpl-desc-input');

    // Persist current state — no version bump, no CoC entry
    const patch = {
      name:         nameEl?.value?.trim()  || _selectedTmpl.name,
      status:       statusEl?.value        || _selectedTmpl.status,
      trigger_type: triggerEl?.value       || _selectedTmpl.trigger_type,
      description:  descEl?.value?.trim()  || null,
      version:      _selectedTmpl.version  || '0.0.0',
      version_major: _selectedTmpl.version_major || 0,
      version_minor: _selectedTmpl.version_minor || 0,
      version_patch: _selectedTmpl.version_patch || 0,
      updated_at:   new Date().toISOString(),
    };

    await API.patch(`workflow_templates?id=eq.${_selectedTmpl.id}`, patch);
    Object.assign(_selectedTmpl, patch);

    await _saveSteps();

    const idx = _templates.findIndex(t => t.id === _selectedTmpl.id);
    if (idx >= 0) _templates[idx] = { ..._templates[idx], ...patch };

    _dirtySteps = false;
    _lastSavedAt = new Date();
    _updateAutoSaveIndicator('saved');
    _updateVersionDisplay(); // keep asterisk — uncommitted changes still pending
    updateBadges();
    document.getElementById('save-btn')?.classList.remove('dirty');

    const listEl = document.getElementById('tmpl-list');
    if (listEl) listEl.innerHTML = renderTemplateList();

    if (!silent) cadToast('Saved', 'success');

  } catch(e) {
    _updateAutoSaveIndicator('error');
    cadToast((silent ? 'Auto-save' : 'Save') + ' failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.textContent = 'Save'; btn.disabled = false; }
  }
}

async function _toggleCompassVisible(checked) {
  if (!_selectedTmpl) return;
  const chk    = document.getElementById('compass-visible-chk');
  const status = document.getElementById('compass-visible-status');
  if (chk) chk.disabled = true;
  try {
    await API.patch(`workflow_templates?id=eq.${_selectedTmpl.id}`, {
      compass_visible: checked,
      updated_at:      new Date().toISOString(),
    });
    _selectedTmpl.compass_visible = checked;
    // Write CoC event
    const authorName = _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member';
    await API.post('workflow_template_coc', {
      firm_id:         FIRM_ID_CAD,
      template_id:     _selectedTmpl.id,
      event_type:      checked ? 'compass_published' : 'compass_unpublished',
      changed_by:      _myResourceId || null,
      changed_by_name: authorName,
      field_name:      'compass_visible',
      old_value:       checked ? 'false' : 'true',
      new_value:       checked ? 'true'  : 'false',
      note:            checked ? 'Published to Compass Browse library' : 'Removed from Compass Browse library',
      version_at:      _selectedTmpl.version || '0.0.0',
      created_at:      new Date().toISOString(),
    }).catch(() => {});
    if (status) {
      status.textContent = checked ? '● Live in Browse' : '○ Not in Browse';
      status.style.color = checked ? 'var(--green)' : 'var(--muted)';
    }
    cadToast(checked ? 'Published to Compass Browse' : 'Removed from Compass Browse', 'success');
  } catch(e) {
    cadToast('Failed: ' + e.message, 'error');
    // Revert checkbox
    if (chk) chk.checked = !checked;
  } finally {
    if (chk) chk.disabled = false;
  }
}

async function commitTemplate() {
  if (!_selectedTmpl) return;

  const btn = document.getElementById('commit-btn');
  if (btn) { btn.textContent = 'Committing…'; btn.disabled = true; }

  try {
    const nameEl    = document.getElementById('tmpl-name-input');
    const statusEl  = document.getElementById('tmpl-status-sel');
    const triggerEl = document.getElementById('tmpl-trigger-sel');
    const descEl    = document.getElementById('tmpl-desc-input');

    const newStatus = statusEl?.value || _selectedTmpl.status;
    const oldStatus = _selectedTmpl.status;

    let maj = _selectedTmpl.version_major || 0;
    let min = _selectedTmpl.version_minor || 0;
    let pat = _selectedTmpl.version_patch || 0;

    if (newStatus === 'released' && oldStatus !== 'released') {
      maj += 1; min = 0; pat = 0;
    } else if (_structuralChange) {
      min += 1; pat = 0;
    } else if (_dirtySteps || _binCount(_selectedTmpl.id) > 0) {
      pat += 1;
    }

    const newVersion = `${maj}.${min}.${pat}`;

    // ── Build diff from snapshot + pending bin ────────────────────────────────
    const diffs = _diffSteps(_stepSnapshot, _selectedTmpl.steps || []);

    // Also add any binned structural events not captured by diff
    const bin = _binLoad(_selectedTmpl.id);

    // ── CoC note construction ─────────────────────────────────────────────────
    let cocEventType = 'step_modified';
    let cocStepName  = '';

    if (newStatus === 'released' && oldStatus !== 'released') {
      cocEventType = 'released';
    } else if (newStatus === 'archived' && oldStatus !== 'archived') {
      cocEventType = 'archived';
    } else if (newStatus === 'draft' && oldStatus !== 'draft') {
      cocEventType = 'status_changed';
    }

    // Step name for CoC header line
    const changedStepIds = new Set([
      ...diffs.map(() => ''),
      ...(bin.filter(e => e.stepName).map(e => e.stepName))
    ]);
    const uniqueStepNames = [...new Set(
      [...diffs, ...bin.map(e => e.stepName || '')].map(d => {
        const m = (typeof d === 'string' ? d : '').match(/"([^"]+)"/);
        return m ? m[1] : '';
      }).filter(Boolean)
    )];
    cocStepName = uniqueStepNames.length === 1
      ? uniqueStepNames[0]
      : uniqueStepNames.length > 1
        ? `${uniqueStepNames.length} steps`
        : (_selectedTmpl.name || 'Template');

    // Build note: all diff lines + any structural bin events not already captured
    const structuralBinLines = bin
      .filter(e => ['step_added','step_deleted','step_reordered'].includes(e.type))
      .map(e =>
        e.type === 'step_added'     ? `Step added: "${e.stepName}"` :
        e.type === 'step_deleted'   ? `Step deleted: "${e.stepName}"` :
        `Step reordered: "${e.stepName}"`)
      .filter(l => !diffs.includes(l)); // avoid duplicates with _diffSteps output

    const allDiffs = [...diffs, ...structuralBinLines];

    const cocNote = allDiffs.length
      ? allDiffs.map(d => `• ${d}`).join('\n')
      : cocEventType === 'released' ? `Released as ${newVersion}`
      : cocEventType === 'archived' ? 'Template archived'
      : cocEventType === 'status_changed' ? `Returned to draft (was ${oldStatus})`
      : 'Template updated';

    // Auto-publish to Compass when first released; preserve existing value on re-commit
    const compassVisible = (newStatus === 'released' && oldStatus !== 'released')
      ? true  // first release → auto-publish
      : (_selectedTmpl.compass_visible || false);  // preserve existing

    const patch = {
      name:            nameEl?.value?.trim()  || _selectedTmpl.name,
      status:          newStatus,
      trigger_type:    triggerEl?.value       || _selectedTmpl.trigger_type,
      description:     descEl?.value?.trim()  || null,
      version:         newVersion,
      version_major:   maj,
      version_minor:   min,
      version_patch:   pat,
      compass_visible: compassVisible,
      updated_at:      new Date().toISOString(),
    };

    // 1. Persist template header
    await API.patch(`workflow_templates?id=eq.${_selectedTmpl.id}`, patch);
    Object.assign(_selectedTmpl, patch);

    // 2. Persist steps
    await _saveSteps();

    // 3. Write CoC entry
    const authorName = _resources_cad.find(r => r.id === _myResourceId)?.name || 'Team Member';
    await API.post('workflow_template_coc', {
      firm_id:         FIRM_ID_CAD,
      template_id:     _selectedTmpl.id,
      event_type:      cocEventType,
      changed_by:      _myResourceId || null,
      changed_by_name: authorName,
      field_name:      cocStepName || null,
      old_value:       oldStatus !== newStatus ? oldStatus : null,
      new_value:       oldStatus !== newStatus ? newStatus : null,
      note:            cocNote,
      version_at:      newVersion,
      created_at:      new Date().toISOString(),
    }).catch(() => {});

    // 4. Clear bin, reset flags, take new snapshot
    _binClear(_selectedTmpl.id);
    _cocCommittedRows = []; // force reload on next CoC open
    _takeSnapshot();
    _dirtySteps       = false;
    _structuralChange = false;
    _versionBumped    = false;
    _lastSavedAt      = new Date();
    _updateAutoSaveIndicator('saved');
    document.getElementById('save-btn')?.classList.remove('dirty');

    // 5. Update UI
    const idx = _templates.findIndex(t => t.id === _selectedTmpl.id);
    if (idx >= 0) _templates[idx] = { ..._templates[idx], ...patch };
    updateBadges();

    const verEl = document.querySelector('.editor-toolbar [title="Version"]');
    if (verEl) verEl.textContent = newVersion; // no asterisk after commit

    const listEl = document.getElementById('tmpl-list');
    if (listEl) listEl.innerHTML = renderTemplateList();

    if (document.getElementById('tmpl-coc-panel')?.classList.contains('open')) {
      loadTmplCoC(_selectedTmpl.id);
    }

    cadToast(`Committed → v${newVersion}`, 'success');

  } catch(e) {
    _updateAutoSaveIndicator('error');
    cadToast('Commit failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.textContent = 'Commit'; btn.disabled = false; }
  }
}

async function _saveSteps() {
  const steps = _selectedTmpl.steps || [];
  const templateId = _selectedTmpl.id;

  const buildStepPayload = (step) => ({
    template_id:         templateId,
    sequence_order:      step.sequence_order,
    step_type:           step.step_type,
    name:                step.name || null,
    assignee_type:       step.assignee_type || null,
    assignee_user_id:    step.assignee_user_id || null,
    assignee_resource_id: step.assignee_resource_id || null,
    assignee_role:       step.assignee_role || null,
    assignee_email:      step.assignee_email || null,
    assignee_name:       step.assignee_name || null,
    assignee_org:        step.assignee_org || null,
    due_days:            step.due_days || null,
    due_type:            step.due_type || 'after_prior',
    escalate_after_days: step.escalate_after_days || null,
    escalate_to:         step.escalate_to || 'pm',
    parallel_required:   !!step.parallel_required,
    branch_conditions:   step.branch_conditions || [],
    instructions:        step.instructions || null,
    input_from_step:     step.input_from_step || null,
    forward_input:       !!step.forward_input,
    reject_to:           step.reject_to || null,
    confirm_items:       step._confirmItems || [],
    meeting_agenda:      step._meetingAgenda || [],
    meeting_comments:    step.meeting_comments || null,
    outcomes:            step.outcomes || null,
    attached_docs:       (step._attachedDocs || []).map(d => ({
      name: d.name, version: d.version, role: d.role || 'reference',
      size: d.size, path: d.path || null, url: d.url || null,
    })),
  });

  // Pass A: INSERT new steps (with temp high sequence_order to avoid conflicts)
  const newSteps = steps.filter(s => s._new);
  for (const step of newSteps) {
    const payload = { ...buildStepPayload(step), sequence_order: step.sequence_order + 50000 };
    const res = await API.post('workflow_template_steps', payload);
    if (res?.[0]?.id) { step.id = res[0].id; delete step._new; }
  }

  // Pass A2: DELETE any steps in DB that are no longer in our in-memory list
  // This prevents stale rows from causing unique constraint violations on sequence_order
  const currentIds = steps.filter(s => !s._new && s.id).map(s => s.id);
  const dbSteps = await API.get(
    `workflow_template_steps?template_id=eq.${templateId}&select=id`
  ).catch(() => []);
  const dbIds = (dbSteps || []).map(s => s.id);
  const orphanIds = dbIds.filter(id => !currentIds.includes(id));
  for (const id of orphanIds) {
    await API.del(`workflow_template_steps?id=eq.${id}`).catch(() => {});
  }

  // Pass B: shift remaining steps to temp range to free up sequence_order space
  for (const step of steps) {
    if (!step._new && step.id) {
      await API.patch(`workflow_template_steps?id=eq.${step.id}`,
        { sequence_order: step.sequence_order + 10000 });
    }
  }

  // Pass C: set real sequence_order values
  for (const step of steps) {
    if (!step._new && step.id) {
      await API.patch(`workflow_template_steps?id=eq.${step.id}`, buildStepPayload(step));
    }
  }
}

function openNewTemplateModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">New Workflow Template</div>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:12px">
          <label class="config-label">Template Name *</label>
          <input class="config-input" id="new-tmpl-name" placeholder="e.g. Design Review Sign-off" autofocus />
        </div>
        <div style="margin-bottom:12px">
          <label class="config-label">Trigger Type</label>
          <select class="config-select" id="new-tmpl-trigger">
            <option value="manual">Manual Launch</option>
            <option value="missed_milestone">Missed Milestone</option>
            <option value="resource_denied">Resource Request Denied</option>
            <option value="meeting_close">Meeting Conclusion</option>
            <option value="material_request">Material Request</option>
            <option value="exception_resolved">Exception Resolved</option>
          </select>
        </div>
        <div>
          <label class="config-label">Description</label>
          <textarea class="config-textarea" id="new-tmpl-desc" placeholder="What is this workflow for?"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn btn-solid" onclick="createTemplate()">Create Template →</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('new-tmpl-name')?.focus(), 50);
}

async function createTemplate() {
  const name    = document.getElementById('new-tmpl-name')?.value?.trim();
  const trigger = document.getElementById('new-tmpl-trigger')?.value;
  const desc    = document.getElementById('new-tmpl-desc')?.value?.trim();

  if (!name) { cadToast('Template name is required', 'error'); return; }

  try {
    const res = await API.post('workflow_templates', {
      firm_id:      FIRM_ID_CAD,
      name,
      trigger_type: trigger || 'manual',
      description:  desc || null,
      status:       'draft',
      created_by:   _users_cad[0]?.id || null,
    });
    if (res?.[0]) {
      const newTmpl = { ...res[0], steps: [] };
      _templates.unshift(newTmpl);
      _selectedTmpl = newTmpl;
      _selectedStep = null;
      updateBadges();
      document.querySelector('.modal-overlay')?.remove();
      renderTab('templates');
      startAutoSave();
      cadToast('Template created', 'success');
    }
  } catch(e) {
    cadToast('Create failed: ' + e.message, 'error');
  }
}

async function deleteTemplate() {
  if (!_selectedTmpl) return;
  if (!confirm(`Delete template "${_selectedTmpl.name}"? This cannot be undone.`)) return;
  try {
    await API.del(`workflow_templates?id=eq.${_selectedTmpl.id}`);
    stopAutoSave();
    _templates = _templates.filter(t => t.id !== _selectedTmpl.id);
    _selectedTmpl = null;
    _selectedStep = null;
    updateBadges();
    renderTab('templates');
    cadToast('Template deleted', 'success');
  } catch(e) {
    cadToast('Delete failed: ' + e.message, 'error');
  }
}

async function runAIDraft() {
  const input = document.getElementById('ai-draft-input')?.value?.trim();
  if (!input) { cadToast('Describe your process first', 'info'); return; }

  const btn    = document.getElementById('ai-draft-btn');
  const status = document.getElementById('ai-draft-status');
  if (btn)    { btn.disabled = true; btn.textContent = '✦ Drafting...'; }
  if (status) status.textContent = 'Calling Claude...';

  try {
    const prompt = `You are building a workflow template for a project management system.
The user described their process as:
"${input}"

Return ONLY a JSON array of workflow steps (no markdown, no explanation). Each step:
{
  "step_type": "approval|review|signoff|action|external|form|branch|wait",
  "name": "descriptive step name",
  "assignee_type": "user|role|external|pm",
  "assignee_role": "role name if assignee_type is role, else null",
  "assignee_email": "email if external, else null",
  "assignee_name": "name if external, else null",
  "due_days": number or null,
  "escalate_after_days": number or null,
  "escalate_to": "pm|manager",
  "parallel_required": true or false,
  "instructions": "brief instructions for assignee or null",
  "branch_conditions": [] or [{condition, label}] for branch steps
}

Use only the step types listed. For branches, add 2-3 conditions. Keep it to 3-6 steps maximum.`;

    const response = await fetch('/api/ai-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, max_tokens: 1000 }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `API error ${response.status}`);
    const raw  = data.content?.map(c => c.text || '').join('');
    const clean = raw.replace(/```json|```/g, '').trim();
    const draftSteps = JSON.parse(clean);

    if (!Array.isArray(draftSteps)) throw new Error('Unexpected response shape');

    // Apply draft steps
    _selectedTmpl.steps = draftSteps.map((s, i) => ({
      ...s,
      id: 'new_' + Date.now() + '_' + i,
      template_id: _selectedTmpl.id,
      sequence_order: i + 1,
      branch_conditions: s.branch_conditions || [],
      _new: true,
    }));
    _dirtySteps = true;

    document.getElementById('ai-banner')?.remove();

    const spineEl = document.getElementById('spine-wrap');
    if (spineEl) spineEl.innerHTML = renderSpine();

    cadToast(`✦ Drafted ${draftSteps.length} steps — review and save`, 'info');
  } catch(e) {
    cadToast('AI draft failed: ' + e.message, 'error');
    if (status) status.textContent = 'Failed — try again';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✦ Draft Template'; }
    if (status) status.textContent = '';
  }
}