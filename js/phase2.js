// PHASE 2 — Task Form: Complexity Rating + Skill Requirements
// Place in /js/phase2.js

document.addEventListener('DOMContentLoaded', function() {
  _injectPhase2Form();
  _patchTaskFormFunctions();
});

function _injectPhase2Form() {
  const body = document.getElementById('task-form-panel')?.querySelector('.journal-panel-body');
  if (!body) return;

  // Find ACTUALS divider by text content
  let actualsDiv = null;
  for (const child of body.children) {
    if (child.textContent?.trim() === 'ACTUALS') { actualsDiv = child; break; }
  }
  // Fallback: find tf-deps-section
  const fallback = document.getElementById('tf-deps-section');

  const insertBefore = actualsDiv || fallback;
  if (!insertBefore) return;

  // ── COMPLEXITY SECTION ───────────────────────────────────
  const cxDiv = document.createElement('div');
  cxDiv.id = 'tf-complexity-section';
  cxDiv.style.cssText = 'margin-bottom:12px;';
  cxDiv.innerHTML = [
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">',
      '<label class="exp-label" style="margin-bottom:0;">COMPLEXITY RATING</label>',
      '<button id="tf-ai-btn" onclick="inferComplexity()"',
        'style="background:none;border:1px solid rgba(168,85,247,0.4);color:var(--purple);',
        'font-family:var(--font-mono);font-size:10px;padding:3px 10px;cursor:pointer;letter-spacing:0.1em;">',
        '&#9889; AI INFER</button>',
    '</div>',
    '<div style="display:flex;gap:5px;margin-bottom:5px;" id="tf-complexity-btns">',
      [1,2,3,4,5].map(function(n) {
        var titles = {1:'Trivial',2:'Low',3:'Medium',4:'High',5:'Critical'};
        return '<button onclick="setComplexity(' + n + ')" data-val="' + n + '" title="' + n + ' - ' + titles[n] + '"' +
          ' style="flex:1;height:30px;background:var(--bg3);border:1px solid var(--border);' +
          'color:var(--text2);font-family:var(--font-mono);font-size:12px;cursor:pointer;transition:all .15s;">' +
          n + '</button>';
      }).join(''),
    '</div>',
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px;">',
      [[1,'Trivial','var(--green)'],[2,'Low','var(--cyan)'],[3,'Medium','var(--amber)'],[4,'High','#ff6b35'],[5,'Critical','var(--red)']].map(function(x) {
        return '<span style="font-family:var(--font-mono);font-size:9px;color:' + x[2] + ';opacity:0.7;">' + x[0] + '=' + x[1] + '</span>';
      }).join('<span style="color:var(--text3);font-size:9px;"> · </span>'),
    '</div>',
    '<div id="tf-complexity-reasoning"',
      'style="display:none;font-family:var(--font-mono);font-size:10px;color:var(--text3);',
      'background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.2);',
      'padding:6px 10px;line-height:1.5;margin-top:4px;"></div>',
  ].join('');
  body.insertBefore(cxDiv, insertBefore);

  // ── SKILL REQUIREMENTS SECTION ───────────────────────────
  const skDiv = document.createElement('div');
  skDiv.id = 'tf-skills-section';
  skDiv.style.cssText = 'margin-bottom:12px;';
  skDiv.innerHTML = [
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">',
      '<label class="exp-label" style="margin-bottom:0;">SKILL REQUIREMENTS</label>',
      '<span style="font-family:var(--font-mono);font-size:9px;color:var(--text3);">required for this task</span>',
    '</div>',
    '<div style="display:flex;gap:6px;margin-bottom:6px;">',
      '<select id="tf-skill-pick" class="hud-select" style="flex:1;font-size:11px;">',
        '<option value="">— Add required skill —</option>',
      '</select>',
      '<button onclick="addTaskSkill()"',
        'style="background:none;border:1px solid rgba(0,210,255,0.3);color:var(--cyan);',
        'font-family:var(--font-mono);font-size:10px;padding:4px 12px;cursor:pointer;letter-spacing:0.08em;">',
        '+ ADD</button>',
    '</div>',
    '<div id="tf-skill-chips" style="display:flex;flex-wrap:wrap;gap:5px;min-height:24px;">',
      '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text3);">No skill requirements set</span>',
    '</div>',
  ].join('');
  body.insertBefore(skDiv, insertBefore);
}

function _patchTaskFormFunctions() {

  // ── COMPLEXITY ────────────────────────────────────────────
  window.setComplexity = function(val) {
    window._tfComplexity = val;
    var colors = {1:'var(--green)',2:'var(--cyan)',3:'var(--amber)',4:'#ff6b35',5:'var(--red)'};
    document.querySelectorAll('#tf-complexity-btns button').forEach(function(btn) {
      var n = parseInt(btn.dataset.val);
      var active = n === val;
      btn.style.background  = active ? colors[val]+'22' : 'var(--bg3)';
      btn.style.borderColor = active ? colors[val] : 'var(--border)';
      btn.style.color       = active ? colors[val] : 'var(--text2)';
      btn.style.fontWeight  = active ? '700' : '400';
    });
  };

  window._resetComplexity = function() {
    window._tfComplexity = null;
    window._tfComplexityAI = false;
    window._tfComplexityReasoning = '';
    document.querySelectorAll('#tf-complexity-btns button').forEach(function(btn) {
      btn.style.background = 'var(--bg3)';
      btn.style.borderColor = 'var(--border)';
      btn.style.color = 'var(--text2)';
      btn.style.fontWeight = '400';
    });
    var r = document.getElementById('tf-complexity-reasoning');
    if (r) r.style.display = 'none';
  };

  window.inferComplexity = async function() {
    var name  = document.getElementById('tf-name')?.value?.trim() || '';
    var phase = document.getElementById('tf-phase')?.value?.trim() || '';
    var skills = (window._tfTaskSkills||[]).map(function(s){ return s.skill_name; }).join(', ');
    var roles = (window._tfAssignments||[]).map(function(a) {
      var role = STATE.hudRoles?.find(function(r){ return r.id === a.hud_role_id; });
      return role ? role.name : '';
    }).filter(Boolean).join(', ');
    if (!name) { alert('Enter a task name first'); return; }
    var btn = document.getElementById('tf-ai-btn');
    var reasoning = document.getElementById('tf-complexity-reasoning');
    btn.textContent = 'INFERRING...'; btn.disabled = true;
    reasoning.style.display = 'none';
    try {
      var prompt = 'You are a PMI-certified project manager for medical device / engineering firms.\n\n' +
        'Task: "' + name + '"\n' +
        'Phase: "' + (phase||'Unknown') + '"\n' +
        'Assigned roles: ' + (roles||'none') + '\n' +
        'Required skills: ' + (skills||'none') + '\n\n' +
        'Rate complexity 1-5:\n' +
        '1=Trivial (simple, no dependencies)\n' +
        '2=Low (clear path, minor coordination)\n' +
        '3=Medium (cross-functional, some ambiguity)\n' +
        '4=High (significant technical or regulatory challenge)\n' +
        '5=Critical (novel problem, Class III, multi-system dependencies)\n\n' +
        'Respond ONLY with JSON, no markdown:\n' +
        '{"rating":<1-5>,"reasoning":"<max 110 chars>"}';

      var res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          model:'claude-sonnet-4-20250514', max_tokens:150,
          messages:[{role:'user',content:prompt}]
        })
      });
      var data = await res.json();
      var text = data.content?.[0]?.text || '';
      var parsed = JSON.parse(text.replace(/```json|```/g,'').trim());
      setComplexity(parsed.rating);
      reasoning.textContent = 'AI: ' + parsed.reasoning;
      reasoning.style.display = 'block';
      window._tfComplexityAI = true;
      window._tfComplexityReasoning = parsed.reasoning;
    } catch(e) {
      reasoning.textContent = 'AI inference failed — please rate manually';
      reasoning.style.display = 'block';
      console.error('inferComplexity:', e);
    } finally {
      btn.textContent = '\u26A1 AI INFER'; btn.disabled = false;
    }
  };

  // ── SKILLS ────────────────────────────────────────────────
  window._tfTaskSkills = [];

  window._populateSkillPicker = function() {
    var sel = document.getElementById('tf-skill-pick');
    if (!sel) return;
    var catMap = {};
    (STATE.hudSkills||[]).forEach(function(s) {
      var cat = (STATE.hudSkillCats||[]).find(function(c){ return c.id === s.category_id; });
      var key = cat ? cat.name : 'Other';
      if (!catMap[key]) catMap[key] = [];
      catMap[key].push(s);
    });
    sel.innerHTML = '<option value="">— Add required skill —</option>';
    Object.keys(catMap).sort().forEach(function(cat) {
      var og = document.createElement('optgroup');
      og.label = cat;
      catMap[cat].sort(function(a,b){ return a.name.localeCompare(b.name); }).forEach(function(s) {
        var o = document.createElement('option');
        o.value = s.id; o.textContent = s.name;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
  };

  window._renderTaskSkillChips = function() {
    var el = document.getElementById('tf-skill-chips');
    if (!el) return;
    if (!window._tfTaskSkills.length) {
      el.innerHTML = '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text3);">No skill requirements set</span>';
      return;
    }
    el.innerHTML = window._tfTaskSkills.map(function(s, i) {
      return '<span style="display:inline-flex;align-items:center;gap:5px;font-family:var(--font-mono);' +
        'font-size:10px;padding:3px 8px;border:1px solid rgba(0,210,255,0.3);color:var(--cyan);' +
        'background:rgba(0,210,255,0.06);">' +
        s.skill_name +
        '<button onclick="removeTaskSkill(' + i + ')" style="background:none;border:none;color:var(--text3);' +
        'cursor:pointer;font-size:11px;padding:0;line-height:1;">\u2715</button></span>';
    }).join('');
  };

  window.addTaskSkill = function() {
    var sel = document.getElementById('tf-skill-pick');
    var id   = sel ? sel.value : '';
    var name = sel ? sel.options[sel.selectedIndex]?.text : '';
    if (!id) return;
    if (window._tfTaskSkills.find(function(s){ return s.skill_id === id; })) return;
    window._tfTaskSkills.push({ skill_id: id, skill_name: name });
    sel.value = '';
    _renderTaskSkillChips();
  };

  window.removeTaskSkill = function(idx) {
    window._tfTaskSkills.splice(idx, 1);
    _renderTaskSkillChips();
  };

  window._ensureSkillsLoaded = function() {
    if (STATE.hudSkills?.length) { _populateSkillPicker(); return; }
    Promise.all([
      API.get('hud_skills?select=id,name,category_id&is_active=eq.true').catch(function(){ return []; }),
      API.get('hud_skill_categories?select=id,name').catch(function(){ return []; }),
    ]).then(function(res) {
      STATE.hudSkills    = res[0] || [];
      STATE.hudSkillCats = res[1] || [];
      _populateSkillPicker();
    });
  };

  // ── PATCH openAddTaskPanel ────────────────────────────────
  var _origAdd = window.openAddTaskPanel;
  window.openAddTaskPanel = function(phase) {
    _origAdd(phase);
    _resetComplexity();
    window._tfTaskSkills = [];
    _renderTaskSkillChips();
    _ensureSkillsLoaded();
  };

  // ── PATCH openEditTaskPanel ────────────────────────────────
  var _origEdit = window.openEditTaskPanel;
  window.openEditTaskPanel = async function(taskId) {
    _origEdit(taskId);
    var t = STATE.tasks?.find(function(x){ return x.id === taskId; });
    // Restore complexity
    _resetComplexity();
    if (t && t.complexity_rating) {
      setComplexity(t.complexity_rating);
      window._tfComplexityAI = t.complexity_ai_inferred || false;
      window._tfComplexityReasoning = t.complexity_reasoning || '';
      var r = document.getElementById('tf-complexity-reasoning');
      if (r && t.complexity_reasoning) {
        r.textContent = (t.complexity_ai_inferred ? 'AI: ' : 'Manual: ') + t.complexity_reasoning;
        r.style.display = 'block';
      }
    }
    // Load skill requirements
    window._tfTaskSkills = [];
    _renderTaskSkillChips();
    _ensureSkillsLoaded();
    try {
      var reqs = await API.get(
        'task_skill_requirements?select=skill_id,hud_skills(id,name)&task_id=eq.' + taskId
      ).catch(function(){ return []; });
      window._tfTaskSkills = (reqs||[]).map(function(r) {
        return { skill_id: r.skill_id, skill_name: r.hud_skills?.name || '?' };
      });
      _renderTaskSkillChips();
    } catch(e) { console.warn('skill req load:', e); }
  };

  // ── PATCH saveTaskForm ────────────────────────────────────
  var _origSave = window.saveTaskForm;
  window.saveTaskForm = async function() {
    await _origSave();
    var taskId = window._editingTaskId || STATE.tasks?.[STATE.tasks.length-1]?.id;
    if (!taskId) return;
    try {
      // Save complexity
      if (window._tfComplexity) {
        var cpx = {
          complexity_rating:      window._tfComplexity,
          complexity_ai_inferred: window._tfComplexityAI || false,
          complexity_reasoning:   window._tfComplexityReasoning || null,
        };
        await API.patch('tasks?id=eq.' + taskId, cpx).catch(function(){});
        var t = STATE.tasks?.find(function(x){ return x.id === taskId; });
        if (t) Object.assign(t, cpx);
      }
      // Save skill requirements
      await API.del('task_skill_requirements?task_id=eq.' + taskId).catch(function(){});
      for (var i = 0; i < window._tfTaskSkills.length; i++) {
        var s = window._tfTaskSkills[i];
        await API.post('task_skill_requirements', {
          task_id: taskId, skill_id: s.skill_id,
          is_required: true, proficiency_needed: 'practitioner'
        }).catch(function(e){ console.warn('skill save:', e); });
      }
    } catch(e) { console.warn('Phase2 save err:', e); }
    if (typeof renderTasksTable === 'function') renderTasksTable();
  };

  console.log('[Phase2] patches applied');
}