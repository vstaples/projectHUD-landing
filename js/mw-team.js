// mw-team.js — My Team view for Compass
// v20260412-MT4
// Globals: _myResource, API
// Tab key: 'team' → panel: #utc-team

(function() {

// ── CSS ───────────────────────────────────────────────────────────────────────
if (!document.getElementById('mw-team-styles')) {
  var style = document.createElement('style');
  style.id = 'mw-team-styles';
  style.textContent =
    '#utc-team{padding:24px 28px;max-width:900px}' +
    '.mt-section{margin-bottom:20px}' +
    '.mt-section-hdr{font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.14em;' +
      'color:var(--cyan);padding-bottom:6px;border-bottom:1px solid rgba(0,210,255,.15);' +
      'margin-bottom:8px;display:flex;align-items:center;gap:8px}' +
    '.mt-section-hdr em{color:var(--text3);font-style:normal;font-size:10px;font-weight:400;letter-spacing:.06em}' +
    '.mt-card{display:flex;align-items:center;gap:14px;padding:8px 12px;' +
      'background:var(--bg2);border:1px solid var(--border);margin-bottom:6px;transition:border-color .15s}' +
    '.mt-card:hover{border-color:rgba(0,210,255,.25)}' +
    '.mt-card.mt-empty{opacity:.4;pointer-events:none;padding:6px 12px}' +
    '.mt-avatar{width:34px;height:34px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;' +
      'justify-content:center;font-family:var(--font-hud);font-size:12px;font-weight:700;' +
      'color:var(--cyan);background:rgba(0,210,255,.1);border:1px solid rgba(0,210,255,.3);overflow:hidden}' +
    '.mt-avatar img{width:100%;height:100%;object-fit:cover;object-position:center}' +
    '.mt-info{flex:1;min-width:0}' +
    '.mt-role-label{font-family:var(--font-mono);font-size:11px;letter-spacing:.12em;color:var(--text3);margin-bottom:1px}' +
    '.mt-name-row{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}' +
    '.mt-name{font-family:var(--font-ui);font-size:14px;font-weight:600;color:var(--text0)}' +
    '.mt-title{font-family:var(--font-mono);font-size:11px;color:var(--text3)}' +
    '.mt-contacts{display:flex;gap:14px;flex-wrap:wrap;margin-top:3px}' +
    '.mt-contact{display:flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:11px;color:var(--text2)}' +
    '.mt-contact a{color:var(--cyan);text-decoration:none}' +
    '.mt-contact a:hover{text-decoration:underline}' +
    '.mt-pm-projects{font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-top:3px}' +
    '.mt-pm-projects b{color:rgba(0,210,255,.7);font-weight:400}' +
    '.mt-empty-name{font-family:var(--font-ui);font-size:11px;color:var(--text3);font-style:italic}' +
    '.mt-bio-btn{font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;padding:5px 14px;' +
      'background:none;border:1px solid rgba(0,210,255,.3);color:var(--cyan);cursor:pointer;' +
      'white-space:nowrap;transition:all .15s;flex-shrink:0}' +
    '.mt-bio-btn:hover{background:rgba(0,210,255,.08);border-color:rgba(0,210,255,.6)}' +
    '.mt-loading{font-family:var(--font-mono);font-size:11px;color:var(--text3);letter-spacing:.1em;' +
      'padding:40px;text-align:center;animation:pulse 1.4s ease-in-out infinite}' +

    /* Bio overlay */
    '#mt-bio-overlay{position:fixed;inset:0;z-index:700;background:rgba(0,0,0,.5);display:none}' +
    '#mt-bio-overlay.open{display:block}' +
    '#mt-bio-drawer{position:fixed;top:0;right:-600px;width:560px;height:100vh;' +
      'background:var(--bg1);border-left:1px solid var(--border);z-index:701;' +
      'transition:right .25s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;overflow:hidden}' +
    '#mt-bio-drawer.open{right:0}' +

    /* Bio header */
    '.mt-bio-hdr{display:flex;align-items:flex-start;justify-content:space-between;' +
      'padding:18px 22px 14px;border-bottom:1px solid var(--border);flex-shrink:0;' +
      'background:var(--bg2)}' +
    '.mt-bio-hdr-left{display:flex;align-items:center;gap:14px}' +
    '.mt-bio-hdr-avatar{width:48px;height:48px;border-radius:50%;flex-shrink:0;display:flex;' +
      'align-items:center;justify-content:center;font-family:var(--font-hud);font-size:16px;' +
      'font-weight:700;color:var(--cyan);background:rgba(0,210,255,.1);' +
      'border:1px solid rgba(0,210,255,.3);overflow:hidden}' +
    '.mt-bio-hdr-avatar img{width:100%;height:100%;object-fit:cover}' +
    '.mt-bio-hdr-name{font-family:var(--font-hud);font-size:16px;font-weight:700;color:var(--text0);margin-bottom:2px}' +
    '.mt-bio-hdr-sub{font-family:var(--font-mono);font-size:11px;color:var(--text3)}' +
    '.mt-bio-close{background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer;padding:0 4px}' +
    '.mt-bio-close:hover{color:var(--text1)}' +

    /* Bio contact strip */
    '.mt-bio-strip{display:flex;gap:20px;padding:8px 22px;border-bottom:1px solid var(--border);' +
      'background:var(--bg1);flex-shrink:0;flex-wrap:wrap}' +
    '.mt-bio-strip-item{display:flex;align-items:center;gap:5px;font-family:var(--font-mono);font-size:11px;color:var(--text2)}' +
    '.mt-bio-strip-item a{color:var(--cyan);text-decoration:none}' +
    '.mt-bio-strip-item a:hover{text-decoration:underline}' +

    /* Bio tabs */
    '.mt-bio-tabs{display:flex;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg1)}' +
    '.mt-bio-tab{font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;color:var(--text3);' +
      'padding:8px 16px;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s}' +
    '.mt-bio-tab:hover{color:var(--text1)}' +
    '.mt-bio-tab.active{color:var(--cyan);border-bottom-color:var(--cyan)}' +

    /* Bio panels */
    '.mt-bio-panels{flex:1;overflow-y:auto}' +
    '.mt-bio-panel{display:none;padding:20px 22px}' +
    '.mt-bio-panel.active{display:block}' +

    /* Bio field rows */
    '.mt-bio-divider{font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;color:var(--cyan);' +
      'padding:8px 0 6px;border-bottom:1px solid rgba(0,210,255,.12);margin-bottom:12px;margin-top:16px}' +
    '.mt-bio-divider:first-child{margin-top:0}' +
    '.mt-bio-row{display:flex;justify-content:space-between;align-items:center;' +
      'padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:11px}' +
    '.mt-bio-row:last-child{border-bottom:none}' +
    '.mt-bio-row label{font-family:var(--font-mono);font-size:11px;color:var(--text3);letter-spacing:.06em}' +
    '.mt-bio-row span{font-family:var(--font-mono);font-size:11px;color:var(--text1);text-align:right;max-width:60%}' +
    '.mt-bio-row a{font-family:var(--font-mono);font-size:11px;color:var(--cyan);text-decoration:none}' +
    '.mt-bio-row a:hover{text-decoration:underline}' +

    /* Skill chips */
    '.mt-bio-chips{display:flex;flex-wrap:wrap;gap:5px;padding:8px 0}' +
    '.mt-bio-chip{font-family:var(--font-mono);font-size:10px;padding:3px 9px;border:1px solid var(--border);color:var(--text3)}' +
    '.mt-bio-chip.aware{border-color:rgba(100,140,180,.3);color:var(--text2)}' +
    '.mt-bio-chip.practitioner{border-color:rgba(0,210,255,.3);color:var(--cyan);background:rgba(0,210,255,.04)}' +
    '.mt-bio-chip.expert{border-color:rgba(255,170,0,.3);color:var(--amber);background:rgba(255,170,0,.04)}' +
    '.mt-bio-chip.authority{border-color:rgba(168,85,247,.35);color:var(--purple);background:rgba(168,85,247,.04)}' +

    /* Profile lists */
    '.mt-bio-list-item{font-family:var(--font-mono);font-size:11px;color:var(--text1);' +
      'padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)}' +
    '.mt-bio-list-item:last-child{border-bottom:none}' +
    '.mt-bio-empty{font-family:var(--font-mono);font-size:11px;color:var(--text3);font-style:italic;padding:6px 0}' +

    /* Domain rows */
    '.mt-bio-domain-row{padding:8px 10px;background:var(--bg2);border:1px solid var(--border);margin-bottom:6px}' +
    '.mt-bio-domain-name{font-family:var(--font-hud);font-size:12px;font-weight:700;color:var(--text0)}' +
    '.mt-bio-domain-sub{font-family:var(--font-mono);font-size:10px;color:var(--text3);margin-top:2px}';
  document.head.appendChild(style);
}

// ── State ─────────────────────────────────────────────────────────────────────
var _loaded = false;
var _data   = null;

// ── Entry point ───────────────────────────────────────────────────────────────
window._mwTeamLoad = async function() {
  var panel = document.getElementById('utc-team');
  if (!panel) return;
  if (_loaded && _data) { _mtRender(panel); return; }
  panel.innerHTML = '<div class="mt-loading">LOADING MY TEAM\u2026</div>';
  try {
    await _mtFetch();
    _loaded = true;
    _mtRender(panel);
  } catch(ex) {
    panel.innerHTML = '<div class="mt-loading" style="color:var(--red)">Failed: ' + ex.message + '</div>';
    console.error('[mwTeam]', ex);
  }
};

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function _mtFetch() {
  var myId = _myResource && _myResource.id;
  if (!myId) throw new Error('_myResource not set');

  var meRows = await API.get(
    'resources?id=eq.' + myId +
    '&select=id,name,first_name,last_name,title,department,email,phone,avatar_url,' +
    'manager_id,advisor_id,hr_contact_id,it_contact_id,finance_contact_id,legal_contact_id,safety_contact_id'
  );
  var me = meRows && meRows[0];
  if (!me) throw new Error('Resource row not found');

  var contactIds = [
    me.manager_id, me.advisor_id, me.hr_contact_id,
    me.it_contact_id, me.finance_contact_id,
    me.legal_contact_id, me.safety_contact_id
  ].filter(Boolean);

  var pmMap = {};
  try {
    var allocs = await API.get('resource_allocations?resource_id=eq.' + myId + '&select=project_id');
    if (allocs && allocs.length) {
      var projIds = allocs.map(function(a){ return a.project_id; })
        .filter(function(v,i,a){ return a.indexOf(v)===i; });
      var projs = await API.get('projects?id=in.(' + projIds.join(',') + ')&select=id,name,pm_resource_id');
      projs.forEach(function(p) {
        if (!p.pm_resource_id || p.pm_resource_id === myId) return;
        if (!pmMap[p.pm_resource_id]) { pmMap[p.pm_resource_id] = []; contactIds.push(p.pm_resource_id); }
        pmMap[p.pm_resource_id].push(p.name);
      });
    }
  } catch(ex) { console.warn('[mwTeam] allocs:', ex.message); }

  var byId = {};
  if (contactIds.length) {
    var uniq = contactIds.filter(function(v,i,a){ return a.indexOf(v)===i; });
    var resolved = await API.get(
      'resources?id=in.(' + uniq.join(',') + ')' +
      '&select=id,name,first_name,last_name,title,department,email,phone,avatar_url,location,level,is_active,is_external'
    );
    resolved.forEach(function(r){ byId[r.id] = r; });
  }

  _data = {
    me:      me,
    manager: byId[me.manager_id]         || null,
    advisor: byId[me.advisor_id]         || null,
    hr:      byId[me.hr_contact_id]      || null,
    it:      byId[me.it_contact_id]      || null,
    finance: byId[me.finance_contact_id] || null,
    legal:   byId[me.legal_contact_id]   || null,
    safety:  byId[me.safety_contact_id]  || null,
    pms: Object.keys(pmMap).map(function(id){
      return { r: byId[id]||null, projects: pmMap[id] };
    })
  };
}

// ── Render team list ──────────────────────────────────────────────────────────
function _mtRender(panel) {
  var d = _data;
  var html = '<div class="mt-section"><div class="mt-section-hdr">MY CONTACTS</div>';
  [
    { label:'MY MANAGER',        r:d.manager },
    { label:'MY ADVISOR',        r:d.advisor },
    { label:'HR REPRESENTATIVE', r:d.hr },
    { label:'IT CONTACT',        r:d.it },
    { label:'FINANCE CONTACT',   r:d.finance },
    { label:'LEGAL CONTACT',     r:d.legal },
    { label:'SAFETY OFFICER',    r:d.safety },
  ].forEach(function(s){ html += _mtCard(s.r, s.label, null); });
  html += '</div>';

  html += '<div class="mt-section"><div class="mt-section-hdr">PROJECT MANAGERS <em>from my allocations</em></div>';
  if (d.pms.length) {
    d.pms.forEach(function(pm){ html += _mtCard(pm.r, 'PROJECT MANAGER', pm.projects); });
  } else {
    html += '<div class="mt-card mt-empty"><div class="mt-info"><div class="mt-empty-name">No project allocations found</div></div></div>';
  }
  html += '</div>';

  panel.innerHTML = html;
  _mtEnsureOverlay();
}

function _mtCard(r, label, projects) {
  if (!r) {
    return '<div class="mt-card mt-empty">' +
      '<div class="mt-avatar" style="opacity:.25">-</div>' +
      '<div class="mt-info">' +
        '<div class="mt-role-label">' + _e(label) + '</div>' +
        '<div class="mt-empty-name">Not assigned</div>' +
      '</div></div>';
  }
  var initials = ((r.first_name||r.name||'')[0]||'').toUpperCase() + ((r.last_name||'')[0]||'').toUpperCase();
  var avatar = r.avatar_url ? '<img src="' + _e(r.avatar_url) + '" alt="">' : _e(initials||'?');
  var contacts = '';
  if (r.email) contacts += '<div class="mt-contact">&#9993;&nbsp;<a href="mailto:' + _e(r.email) + '">' + _e(r.email) + '</a></div>';
  if (r.phone) contacts += '<div class="mt-contact">&#9990;&nbsp;<a href="tel:' + _e(r.phone) + '">' + _e(r.phone) + '</a></div>';
  var proj = projects && projects.length
    ? '<div class="mt-pm-projects">Projects: ' + projects.map(function(p){ return '<b>' + _e(p) + '</b>'; }).join(' &middot; ') + '</div>'
    : '';
  var name = r.name || ((r.first_name||'') + ' ' + (r.last_name||'')).trim();
  var sub  = [r.title, r.department].filter(Boolean).join(' &middot; ');
  return '<div class="mt-card">' +
    '<div class="mt-avatar">' + avatar + '</div>' +
    '<div class="mt-info">' +
      '<div class="mt-role-label">' + _e(label) + '</div>' +
      '<div class="mt-name-row">' +
        '<div class="mt-name">' + _e(name) + '</div>' +
        '<div class="mt-title">' + sub + '</div>' +
      '</div>' +
      (contacts ? '<div class="mt-contacts">' + contacts + '</div>' : '') +
      proj +
    '</div>' +
    '<button class="mt-bio-btn" onclick="_mtOpenBio(\'' + _e(r.id) + '\')">VIEW BIO</button>' +
  '</div>';
}

// ── Bio overlay ───────────────────────────────────────────────────────────────
function _mtEnsureOverlay() {
  if (document.getElementById('mt-bio-overlay')) return;
  var el = document.createElement('div');
  el.id = 'mt-bio-overlay';
  el.innerHTML =
    '<div id="mt-bio-drawer">' +
      // Header: avatar + name + close
      '<div class="mt-bio-hdr">' +
        '<div class="mt-bio-hdr-left">' +
          '<div class="mt-bio-hdr-avatar" id="mt-bio-avatar"></div>' +
          '<div>' +
            '<div class="mt-bio-hdr-name" id="mt-bio-name"></div>' +
            '<div class="mt-bio-hdr-sub" id="mt-bio-sub"></div>' +
          '</div>' +
        '</div>' +
        '<button class="mt-bio-close" onclick="_mtCloseBio()">&#x2715;</button>' +
      '</div>' +
      // Contact strip: email + phone
      '<div class="mt-bio-strip" id="mt-bio-strip"></div>' +
      // Tabs
      '<div class="mt-bio-tabs">' +
        '<div class="mt-bio-tab active" data-biotab="info"    onclick="_mtBioTab(\'info\')">INFO</div>' +
        '<div class="mt-bio-tab"        data-biotab="skills"  onclick="_mtBioTab(\'skills\')">SKILLS</div>' +
        '<div class="mt-bio-tab"        data-biotab="profile" onclick="_mtBioTab(\'profile\')">PROFILE</div>' +
        '<div class="mt-bio-tab"        data-biotab="domain"  onclick="_mtBioTab(\'domain\')">DOMAINS</div>' +
      '</div>' +
      // Panels
      '<div class="mt-bio-panels">' +
        '<div class="mt-bio-panel active" id="mt-bpanel-info"></div>' +
        '<div class="mt-bio-panel"        id="mt-bpanel-skills"></div>' +
        '<div class="mt-bio-panel"        id="mt-bpanel-profile"></div>' +
        '<div class="mt-bio-panel"        id="mt-bpanel-domain"></div>' +
      '</div>' +
    '</div>';
  el.addEventListener('click', function(ev){ if (ev.target === el) _mtCloseBio(); });
  document.body.appendChild(el);
}

window._mtBioTab = function(tab) {
  document.querySelectorAll('.mt-bio-tab').forEach(function(t){
    t.classList.toggle('active', t.dataset.biotab === tab);
  });
  document.querySelectorAll('.mt-bio-panel').forEach(function(p){
    p.classList.toggle('active', p.id === 'mt-bpanel-' + tab);
  });
};

window._mtOpenBio = async function(id) {
  _mtEnsureOverlay();
  var overlay = document.getElementById('mt-bio-overlay');
  var drawer  = document.getElementById('mt-bio-drawer');
  overlay.classList.add('open');
  setTimeout(function(){ drawer.classList.add('open'); }, 10);

  // Reset to INFO tab
  _mtBioTab('info');

  // Loading state
  document.getElementById('mt-bio-name').textContent   = 'Loading\u2026';
  document.getElementById('mt-bio-sub').textContent    = '';
  document.getElementById('mt-bio-avatar').innerHTML   = '';
  document.getElementById('mt-bio-strip').innerHTML    = '';
  document.getElementById('mt-bpanel-info').innerHTML    = '<div class="mt-loading">Loading\u2026</div>';
  document.getElementById('mt-bpanel-skills').innerHTML  = '';
  document.getElementById('mt-bpanel-profile').innerHTML = '';
  document.getElementById('mt-bpanel-domain').innerHTML  = '';

  try {
    // Fetch all data in parallel
    var results = await Promise.all([
      API.get('resources?id=eq.' + id + '&select=*'),
      API.get('resource_skills?resource_id=eq.' + id).catch(function(){ return []; }),
      API.get('hud_skills?select=id,name,category_id').catch(function(){ return []; }),
      API.get('hud_skill_categories?select=id,name').catch(function(){ return []; }),
      API.get('resource_profiles?resource_id=eq.' + id + '&limit=1').catch(function(){ return []; }),
      API.get('resource_domain_experience?resource_id=eq.' + id).catch(function(){ return []; }),
      API.get('hud_skill_domains?select=id,name').catch(function(){ return []; }),
    ]);

    var r        = results[0] && results[0][0];
    var rSkills  = results[1] || [];
    var hudSkills = results[2] || [];
    var skillCats = results[3] || [];
    var profile  = (results[4] && results[4][0]) || {};
    var domains  = results[5] || [];
    var hudDomains = results[6] || [];

    if (!r) throw new Error('Resource not found');

    // Build lookup maps
    var skillById = {};
    hudSkills.forEach(function(s){ skillById[s.id] = s; });
    var catById = {};
    skillCats.forEach(function(c){ catById[c.id] = c; });
    var domainById = {};
    hudDomains.forEach(function(d){ domainById[d.id] = d; });

    _mtPopulateBio(r, rSkills, skillById, catById, profile, domains, domainById);
  } catch(ex) {
    document.getElementById('mt-bio-name').textContent = 'Error: ' + ex.message;
    document.getElementById('mt-bpanel-info').innerHTML = '';
    console.error('[mwTeam bio]', ex);
  }
};

function _mtPopulateBio(r, rSkills, skillById, catById, profile, domains, domainById) {
  var initials = ((r.first_name||r.name||'')[0]||'').toUpperCase() + ((r.last_name||'')[0]||'').toUpperCase();

  // Header
  document.getElementById('mt-bio-avatar').innerHTML = r.avatar_url
    ? '<img src="' + _e(r.avatar_url) + '" alt="">'
    : _e(initials || '?');
  document.getElementById('mt-bio-name').textContent =
    r.name || ((r.first_name||'') + ' ' + (r.last_name||'')).trim();
  document.getElementById('mt-bio-sub').textContent =
    [r.title, r.department].filter(Boolean).join(' · ');

  // Contact strip
  var strip = '';
  if (r.email) strip += '<div class="mt-bio-strip-item">&#9993;&nbsp;<a href="mailto:' + _e(r.email) + '">' + _e(r.email) + '</a></div>';
  if (r.phone) strip += '<div class="mt-bio-strip-item">&#9990;&nbsp;<a href="tel:' + _e(r.phone) + '">' + _e(r.phone) + '</a></div>';
  if (r.location) strip += '<div class="mt-bio-strip-item">&#9679;&nbsp;' + _e(r.location) + '</div>';
  document.getElementById('mt-bio-strip').innerHTML = strip;

  // ── INFO tab ────────────────────────────────────────────
  var infoHtml =
    '<div class="mt-bio-divider">ROLE & PLACEMENT</div>' +
    _bioRow('Title',      r.title) +
    _bioRow('Department', r.department) +
    _bioRow('Level',      r.level) +
    _bioRow('Type',       r.is_external ? 'External Contractor' : 'Internal Employee') +
    _bioRow('Status',     r.is_active ? 'Active' : 'Inactive') +
    _bioRow('Availability', r.availability_pct != null ? r.availability_pct + '%' : null);
  if (r.notes) {
    infoHtml += '<div class="mt-bio-divider">NOTES</div>' +
      '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text2);line-height:1.6">' + _e(r.notes) + '</div>';
  }
  document.getElementById('mt-bpanel-info').innerHTML = infoHtml;

  // ── SKILLS tab ──────────────────────────────────────────
  var skillsHtml = '';
  if (rSkills.length) {
    // Group by category
    var byCat = {};
    var catOrder = [];
    rSkills.forEach(function(rs) {
      var sk = skillById[rs.skill_id];
      if (!sk) return;
      var cat = catById[sk.category_id];
      var catName = cat ? cat.name : 'Other';
      if (!byCat[catName]) { byCat[catName] = []; catOrder.push(catName); }
      byCat[catName].push({ name: sk.name, proficiency: rs.proficiency });
    });
    catOrder.forEach(function(catName) {
      skillsHtml += '<div class="mt-bio-divider">' + _e(catName) + '</div>';
      skillsHtml += '<div class="mt-bio-chips">';
      byCat[catName].forEach(function(s) {
        var prof = s.proficiency || 'aware';
        skillsHtml += '<div class="mt-bio-chip ' + _e(prof) + '">' + _e(s.name) +
          ' <span style="opacity:.6;font-size:9px">' + _e(prof) + '</span></div>';
      });
      skillsHtml += '</div>';
    });
  } else {
    skillsHtml = '<div class="mt-bio-empty">No skills assigned</div>';
  }
  document.getElementById('mt-bpanel-skills').innerHTML = skillsHtml;

  // ── PROFILE tab ─────────────────────────────────────────
  var profileHtml = '';

  profileHtml += '<div class="mt-bio-divider">EDUCATION</div>';
  profileHtml += _bioList(profile.education);

  profileHtml += '<div class="mt-bio-divider">CERTIFICATIONS</div>';
  profileHtml += _bioList(profile.certifications);

  profileHtml += '<div class="mt-bio-divider">PRIOR COMPANIES</div>';
  profileHtml += _bioList(profile.prior_companies);

  profileHtml += '<div class="mt-bio-divider">NOTABLE PROJECTS</div>';
  profileHtml += _bioList(profile.notable_projects);

  if (profile.specialty_summary) {
    profileHtml += '<div class="mt-bio-divider">SPECIALTY SUMMARY</div>';
    profileHtml += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text2);line-height:1.7">' +
      _e(profile.specialty_summary) + '</div>';
  }
  if (profile.linkedin_url) {
    profileHtml += '<div class="mt-bio-divider">LINKEDIN</div>';
    profileHtml += '<div><a href="' + _e(profile.linkedin_url) + '" target="_blank" ' +
      'style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">' +
      _e(profile.linkedin_url) + '</a></div>';
  }
  document.getElementById('mt-bpanel-profile').innerHTML = profileHtml;

  // ── DOMAIN tab ──────────────────────────────────────────
  var domainHtml = '';
  if (domains.length) {
    domains.forEach(function(d) {
      var domainName = (domainById[d.domain_id] && domainById[d.domain_id].name) || d.domain_id || '—';
      domainHtml += '<div class="mt-bio-domain-row">' +
        '<div class="mt-bio-domain-name">' + _e(domainName) + '</div>' +
        '<div class="mt-bio-domain-sub">' +
          (d.subsystem ? _e(d.subsystem) + ' &middot; ' : '') +
          (d.years_experience != null ? d.years_experience + ' yrs' : '') +
          (d.regulatory_class && d.regulatory_class !== 'N/A' ? ' &middot; ' + _e(d.regulatory_class) : '') +
        '</div>' +
      '</div>';
    });
  } else {
    domainHtml = '<div class="mt-bio-empty">No domain experience recorded</div>';
  }
  document.getElementById('mt-bpanel-domain').innerHTML = domainHtml;
}

// ── Bio helpers ───────────────────────────────────────────────────────────────
function _bioRow(label, value) {
  if (!value) return '';
  return '<div class="mt-bio-row"><label>' + _e(label) + '</label><span>' + _e(value) + '</span></div>';
}

function _bioList(arr) {
  if (!arr || !arr.length) return '<div class="mt-bio-empty">None recorded</div>';
  return arr.map(function(item){
    return '<div class="mt-bio-list-item">' + _e(item) + '</div>';
  }).join('');
}

window._mtCloseBio = function() {
  var drawer  = document.getElementById('mt-bio-drawer');
  var overlay = document.getElementById('mt-bio-overlay');
  if (drawer)  drawer.classList.remove('open');
  setTimeout(function(){ if (overlay) overlay.classList.remove('open'); }, 260);
};

// ── Utility ───────────────────────────────────────────────────────────────────
function _e(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Self-install ──────────────────────────────────────────────────────────────
(function _install() {
  function tryInstall() {
    var tabBar = document.getElementById('user-suite-tabs');
    if (tabBar && !document.querySelector('[data-tab="team"]')) {
      var btn = document.createElement('button');
      btn.className   = 'ust';
      btn.dataset.tab = 'team';
      btn.textContent = 'My Team';
      btn.onclick = function(){ uSwitchTab('team', btn); };
      tabBar.appendChild(btn);
    }
    var sibling = document.getElementById('utc-work');
    if (sibling && !document.getElementById('utc-team')) {
      var panel = document.createElement('div');
      panel.id        = 'utc-team';
      panel.className = 'utc';
      sibling.parentElement.appendChild(panel);
    }
    if (typeof uSwitchTab === 'function' && !uSwitchTab._mtPatched) {
      var _orig = uSwitchTab;
      uSwitchTab = function(tab, btn) {
        _orig(tab, btn);
        if (tab === 'team') window._mwTeamLoad && window._mwTeamLoad();
      };
      uSwitchTab._mtPatched = true;
    }
  }
  tryInstall();
  setTimeout(tryInstall, 500);
  setTimeout(tryInstall, 1500);
  setTimeout(tryInstall, 3000);
  setTimeout(tryInstall, 5000);
})();

})();