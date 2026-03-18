// ═══════════════════════════════════════════════════════════
// PHASE 2 PATCH — Task Form: Complexity + Skill Requirements
// Loaded via <script src="/js/phase2.js"> in project-detail.html
// ═══════════════════════════════════════════════════════════

// Wait for page to be fully ready
document.addEventListener('DOMContentLoaded', function() {
  _injectPhase2Form();
  _patchTaskFormFunctions();
});

function _injectPhase2Form() {
  const body = document.getElementById('task-form-panel')?.querySelector('.journal-panel-body');
  if (!body) return;

  // Find the ACTUALS label div (child with amber color and "ACTUALS" text)
  let actualsDiv = null;
  for (const child of body.children) {
    if (child.textContent?.trim() === 'ACTUALS' && child.style?.color?.includes('amber') ||
        child.innerHTML?.includes('ACTUALS') && child.innerHTML?.includes('amber')) {
      actualsDiv = child;
      break;
    }
  }
  // Fallback: find by text content
  if (!actualsDiv) {
    for (const child of body.children) {
      if (child.textContent?.trim() === 'ACTUALS') { actualsDiv = child; break; }
    }
  }

  // Build complexity + skills HTML
  const complexityHTML = `<div id="tf-complexity-section" style="margin-bottom:12px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
      <label class="exp-label" style="margin-bottom:0;">COMPLEXITY RATING</label>
      <button id="tf-ai-btn" onclick="inferComplexity()"
        style="background:none;border:1px solid rgba(168,85,247,0.4);color:var(--purple);
        font-family:var(--font-mono);font-size:10px;padding:3px 10px;cursor:pointer;letter-spacing:0.1em;">
        ⚡ AI INFER</button>
    </div>
    <div style="display:flex;gap:5px;margin-bottom:5px;" id="tf-complexity-btns">
      <button onclick="setComplexity(1)" data-val="1" title="Trivial — simple, well-understood"
        style="flex:1;height:30px;background:var(--bg3);border:1px solid var(--border);color:var(--text2);font-family:var(--font-mono);font-size:12px;cursor:pointer;transition:all .15s;">1</button>
      <button onclick="setComplexity(2)" data-val="2" title="Low — straightforward"
        style="flex:1;height:30px;background:var(--bg3);border:1px solid var(--border);color:var(--text2);font-family:var(--font-mono);font-size:12px;cursor:pointer;transition:all .15s;">2</button>
      <button onclick="setComplexity(3)" data-val="3" title="Medium — cross-functional"
        style="flex:1;height:30px;background:var(--bg3);border:1px solid var(--border);color:var(--text2);font-family:var(--font-mono);font-size:12px;cursor:pointer;transition:all .15s;">3</button>
      <button onclick="setComplexity(4)" data-val="4" title="High — technical challenge"
        style="flex:1;height:30px;background:var(--bg3);border:1px solid var(--border);color:var(--text2);font-family:var(--font-mono);font-size:12px;cursor:pointer;transition:all .15s;">4</button>
      <button onclick="setComplexity(5)" data-val="5" title="Critical — novel/regulatory"
        style="flex:1;height:30px;background:var(--bg3);border:1px solid var(--border);color:var(--text2);font-family:var(--font-mono);font-size:12px;cursor:pointer;transition:all .15s;">5</button>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
      ${[
        ['1','Trivial','var(--green)'],['2','Low','var(--cyan)'],['3','Medium','var(--amber)'],
        ['4','High','#ff6b35'],['5','Critical','var(--red)']
      ].map(([n,l,c]) =>
        \`<span style="font-family:var(--font-mono);font-size:9px;color:\${c};opacity:0.6;">\${n}=\${l}</span>\`
      ).join('<span style="color:var(--text3);font-size:9px;"> · </span>')}
    </div>
    <div id="tf-complexity-reasoning"
      style="display:none;font-family:var(--font-mono);font-size:10px;color:var(--text3);
      background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.2);
      padding:6px 10px;line-height:1.5;margin-top:4px;"></div>
  </div>`;

  const skillsHTML = `<div id="tf-skills-section" style="margin-bottom:12px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
      <label class="exp-label" style="margin-bottom:0;">SKILL REQUIREMENTS</label>
      <span style="font-family:var(--font-mono);font-size:9px;color:var(--text3);">required to complete this task</span>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:6px;">
      <select id="tf-skill-pick" class="hud-select" style="flex:1;font-size:11px;">
        <option value="">— Add required skill —</option>
      </select>
      <button onclick="addTaskSkill()"
        style="background:none;border:1px solid rgba(0,210,255,0.3);color:var(--cyan);
        font-family:var(--font-mono);font-size:10px;padding:4px 12px;cursor:pointer;letter-spacing:0.08em;">
        + ADD</button>
    </div>
    <div id="tf-skill-chips" style="display:flex;flex-wrap:wrap;gap:5px;min-height:24px;">
      <span style="font-family:var(--font-mono);font-size:10px;color:var(--text3);">No skill requirements set</span>
    </div>
  </div>`;

  const wrapper = document.createElement('div');

  if (actualsDiv) {
    wrapper.innerHTML = complexityHTML;
    body.insertBefore(wrapper.firstElementChild, actualsDiv);
    wrapper.innerHTML = skillsHTML;
    body.insertBefore(wrapper.firstElementChild, actualsDiv);
  } else {
    // fallback — append before tf-deps-section
    const deps = document.getElementById('tf-deps-section');
    wrapper.innerHTML = complexityHTML + skillsHTML;
    if (deps) {
      body.insertBefore(wrapper.children[0], deps);
      body.insertBefore(wrapper.children[0], deps);
    }
  }
}

function _patchTaskFormFunctions() {

  // ── COMPLEXITY ─────────────────────────────────────────────
  window.setComplexity = function(val) {
    window._tfComplexity = val;
    const colors = {1:'var(--green)',2:'var(--cyan)',3:'var(--amber)',4:'#ff6b35',5:'var(--red)'};
    document.querySelectorAll('#tf-complexity-btns button').forEach(btn => {
      const n = parseInt(btn.dataset.val);
      const active = n === val;
      btn.style.background  = active ? colors[val]+'22' : 'var(--bg3)';
      btn.style.borderColor = active ? colors[val] : 'var(--border)';
      btn.style.color       = active ? colors[val] : 'var(--text2)';
      btn.style.fontWeight  = active ? '700' : '400';
    });
  };

  window.inferComplexity = async function() {
    const name   = document.getElementById('tf-name')?.value?.trim() || '';
    const phase  = document.getElementById('tf-phase')?.value?.trim() || '';
    const skills = window._tfTaskSkills?.map(s => s.skill_name).join(', ') || '';
    const roles  = (window._tfAssignments||[]).map(a => {
      const role = STATE.hudRoles?.find(r => r.id === a.hud_role_id);
      return role?.name || '';
    }).filter(Boolean).join(', ');
    if (!name) { alert('Enter a task name first'); return; }
    const btn = document.getElementById('tf-ai-btn');
    const reasoning = document.getElementById('tf-complexity-reasoning');
    btn.textContent = '⏳ INFERRING...'; btn.disabled = true;
    reasoning.style.display = 'none';
    try {
      const prompt = `You are a PMI-certified project manager for engineering/medical device firms.

Task: "${name}"
Phase: "${phase || 'Unknown'}"
Required roles: ${roles || 'not assigned'}
Required skills: ${skills || 'not specified'}
Context: Medical device / regulatory compliance engineering

Rate complexity 1-5:
1=Trivial (simple, well-understood, no dependencies)
2=Low (clear path, minor coordination)
3=Medium (cross-functional, some ambiguity)
4=High (significant technical challenge or regulatory risk)
5=Critical (novel problem, Class III device, multi-system dependencies)

Respond ONLY with JSON, no markdown:
{"rating":<1-5>,"reasoning":"<max 110 chars>"}`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          model:'claude-sonnet-4-20250514', max_tokens:120,
          messages:[{role:'user',content:prompt}]
        })
      });
      const data = await res.json();
      const parsed = JSON.parse(data.content?.[0]?.text?.replace(/```json|```/g,'').trim());
      setComplexity(parsed.rating);
      reasoning.textContent = '⚡ AI: ' + parsed.reasoning;
      reasoning.style.display = 'block';
      window._tfComplexityAI = true;
      window._tfComplexityReasoning = parsed.reasoning;
    } catch(e) {
      reasoning.textContent = 'AI inference failed — please rate manually';
      reasoning.style.display = 'block';
    } finally { btn.textContent = '⚡ AI INFER'; btn.disabled = false; }
  };

  // ── SKILL PICKER ───────────────────────────────────────────
  window._tfTaskSkills = [];

  window._populateSkillPicker = function() {
    const sel = document.getElementById('tf-skill-pick');
    if (!sel) return;
    const catMap = {};
    (STATE.hudSkills||[]).forEach(s => {
      const cat = (STATE.hudSkillCats||[]).find(c => c.id === s.category_id);
      const key = cat?.name || 'Other';
      if (!catMap[key]) catMap[key] = [];
      catMap[key].push(s);
    });
    sel.innerHTML = '<option value="">— Add required skill —</option>';
    Object.entries(catMap).sort(([a],[b]) => a.localeCompare(b)).forEach(([cat, skills]) => {
      const og = document.createElement('optgroup');
      og.label = cat;
      skills.sort((a,b) => a.name.localeCompare(b.name)).forEach(s => {
        const o = document.createElement('option');
        o.value = s.id; o.textContent = s.name;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
  };

  window._renderTaskSkillChips = function() {
    const el = document.getElementById('tf-skill-chips');
    if (!el) return;
    if (!window._tfTaskSkills.length) {
      el.innerHTML = '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text3);">No skill requirements set</span>';
      return;
    }
    el.innerHTML = window._tfTaskSkills.map((s,i) =>
      `<span style="display:inline-flex;align-items:center;gap:5px;font-family:var(--font-mono);
        font-size:10px;padding:3px 8px;border:1px solid rgba(0,210,255,0.3);color:var(--cyan);
        background:rgba(0,210,255,0.06);">
        ${s.skill_name}
        <button onclick="removeTaskSkill(${i})" style="background:none;border:none;color:var(--text3);
          cursor:pointer;font-size:11px;padding:0;line-height:1;">✕</button>
      </span>`
    ).join('');
  };

  window.addTaskSkill = function() {
    const sel = document.getElementById('tf-skill-pick');
    const id  = sel?.value;
    const name= sel?.options[sel.selectedIndex]?.text;
    if (!id) return;
    if (window._tfTaskSkills.find(s => s.skill_id === id)) return;
    window._tfTaskSkills.push({ skill_id: id, skill_name: name });
    sel.value = '';
    _renderTaskSkillChips();
  };

  window.removeTaskSkill = function(idx) {
    window._tfTaskSkills.splice(idx, 1);
    _renderTaskSkillChips();
  };

  // ── PATCH openAddTaskPanel ─────────────────────────────────
  const _origAdd = window.openAddTaskPanel;
  window.openAddTaskPanel = function(phase) {
    _origAdd(phase);
    window._tfComplexity = null;
    window._tfComplexityAI = false;
    window._tfComplexityReasoning = '';
    window._tfTaskSkills = [];
    // Reset complexity buttons
    document.querySelectorAll('#tf-complexity-btns button').forEach(btn => {
      btn.style.background = 'var(--bg3)';
      btn.style.borderColor = 'var(--border)';
      btn.style.color = 'var(--text2)';
      btn.style.fontWeight = '400';
    });
    const r = document.getElementById('tf-complexity-reasoning');
    if (r) r.style.display = 'none';
    _renderTaskSkillChips();
    // Load skills if not yet loaded
    if (!STATE.hudSkills?.length) {
      Promise.all([
        API.get('hud_skills?select=id,name,category_id&is_active=eq.true').catch(()=>[]),
        API.get('hud_skill_categories?select=id,name').catch(()=>[]),
      ]).then(([skills, cats]) => {
        STATE.hudSkills    = skills || [];
        STATE.hudSkillCats = cats  || [];
        _populateSkillPicker();
      });
    } else {
      _populateSkillPicker();
    }
  };

  // ── PATCH openEditTaskPanel ────────────────────────────────
  const _origEdit = window.openEditTaskPanel;
  window.openEditTaskPanel = async function(taskId) {
    _origEdit(taskId);
    const t = STATE.tasks?.find(x => x.id === taskId);
    // Set complexity
    window._tfComplexity = t?.complexity_rating || null;
    window._tfComplexityReasoning = t?.complexity_reasoning || '';
    window._tfComplexityAI = t?.complexity_ai_inferred || false;
    if (t?.complexity_rating) {
      setComplexity(t.complexity_rating);
      const r = document.getElementById('tf-complexity-reasoning');
      if (r && t.complexity_reasoning) {
        r.textContent = (t.complexity_ai_inferred ? '⚡ AI: ' : '📝 ') + t.complexity_reasoning;
        r.style.display = 'block';
      }
    } else {
      document.querySelectorAll('#tf-complexity-btns button').forEach(btn => {
        btn.style.background = 'var(--bg3)'; btn.style.borderColor = 'var(--border)';
        btn.style.color = 'var(--text2)'; btn.style.fontWeight = '400';
      });
      const r = document.getElementById('tf-complexity-reasoning');
      if (r) r.style.display = 'none';
    }
    // Load skill requirements
    window._tfTaskSkills = [];
    _renderTaskSkillChips();
    if (!STATE.hudSkills?.length) {
      const [skills, cats] = await Promise.all([
        API.get('hud_skills?select=id,name,category_id&is_active=eq.true').catch(()=>[]),
        API.get('hud_skill_categories?select=id,name').catch(()=>[]),
      ]);
      STATE.hudSkills    = skills || [];
      STATE.hudSkillCats = cats  || [];
    }
    _populateSkillPicker();
    // Load existing skill requirements for this task
    try {
      const reqs = await API.get(
        `task_skill_requirements?select=*,hud_skills(id,name)&task_id=eq.${taskId}`
      ).catch(()=>[]);
      window._tfTaskSkills = (reqs||[]).map(r => ({
        skill_id: r.skill_id, skill_name: r.hud_skills?.name || '?', _dbId: r.id
      }));
      _renderTaskSkillChips();
    } catch(e) { console.warn('skill req load err:', e); }
  };

  // ── PATCH saveTaskForm ─────────────────────────────────────
  const _origSave = window.saveTaskForm;
  window.saveTaskForm = async function() {
    // Inject complexity into payload before original save runs
    // by temporarily overriding the payload construction
    window._phase2ComplexityPayload = {
      complexity_rating:       window._tfComplexity || null,
      complexity_ai_inferred:  window._tfComplexityAI || false,
      complexity_reasoning:    window._tfComplexityReasoning || null,
    };
    await _origSave();
    // Post-save: persist complexity + skills
    const taskId = window._editingTaskId || STATE.tasks?.[STATE.tasks.length-1]?.id;
    if (!taskId) return;
    try {
      // Save complexity to task
      if (window._tfComplexity) {
        await API.patch(`tasks?id=eq.${taskId}`, window._phase2ComplexityPayload).catch(()=>{});
        const t = STATE.tasks?.find(x => x.id === taskId);
        if (t) Object.assign(t, window._phase2ComplexityPayload);
      }
      // Save skill requirements — delete + re-insert
      await API.del(`task_skill_requirements?task_id=eq.${taskId}`).catch(()=>{});
      for (const s of window._tfTaskSkills) {
        await API.post('task_skill_requirements', {
          task_id: taskId, skill_id: s.skill_id,
          is_required: true, proficiency_needed: 'practitioner'
        }).catch(e => console.warn('skill req save:', e));
      }
    } catch(e) { console.warn('Phase2 save err:', e); }
    renderTasksTable();
  };

  console.log('[Phase2] Task form patches applied');
}