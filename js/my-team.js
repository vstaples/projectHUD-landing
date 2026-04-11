// mw-team.js — My Team view for Compass
// v20260411-MT1
// Globals: _myResource, API
// Tab key: 'team' → panel: #utc-team
// Entry: window._mwTeamLoad()

(function() {

// ── CSS ───────────────────────────────────────────────────────────────────────
if (!document.getElementById('mw-team-styles')) {
  var style = document.createElement('style');
  style.id = 'mw-team-styles';
  style.textContent =
    '#utc-team{padding:24px 28px;max-width:900px}' +
    '.mt-section{margin-bottom:32px}' +
    '.mt-section-hdr{font-family:var(--font-mono);font-size:10px;letter-spacing:.16em;color:var(--cyan);' +
      'padding-bottom:8px;border-bottom:1px solid rgba(0,210,255,.15);margin-bottom:14px;' +
      'display:flex;align-items:center;gap:8px}' +
    '.mt-section-hdr em{color:var(--text3);font-style:normal;font-size:10px;letter-spacing:.06em}' +
    '.mt-card{display:flex;align-items:center;gap:16px;padding:14px 16px;' +
      'background:var(--bg2);border:1px solid var(--border);margin-bottom:8px;transition:border-color .15s}' +
    '.mt-card:hover{border-color:rgba(0,210,255,.25)}' +
    '.mt-card.mt-empty{opacity:.4;pointer-events:none}' +
    '.mt-avatar{width:44px;height:44px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;' +
      'justify-content:center;font-family:var(--font-hud);font-size:15px;font-weight:700;' +
      'color:var(--cyan);background:rgba(0,210,255,.1);border:1px solid rgba(0,210,255,.3);overflow:hidden}' +
    '.mt-avatar img{width:100%;height:100%;object-fit:cover;object-position:center}' +
    '.mt-info{flex:1;min-width:0}' +
    '.mt-role-label{font-family:var(--font-mono);font-size:9px;letter-spacing:.14em;color:var(--text3);margin-bottom:3px}' +
    '.mt-name{font-family:var(--font-ui);font-size:14px;font-weight:600;color:var(--text0);margin-bottom:2px}' +
    '.mt-title{font-family:var(--font-mono);font-size:10px;color:var(--text3);margin-bottom:6px}' +
    '.mt-contacts{display:flex;gap:16px;flex-wrap:wrap}' +
    '.mt-contact{display:flex;align-items:center;gap:5px;font-family:var(--font-mono);font-size:10px;color:var(--text2)}' +
    '.mt-contact a{color:var(--cyan);text-decoration:none}' +
    '.mt-contact a:hover{text-decoration:underline}' +
    '.mt-pm-projects{font-family:var(--font-mono);font-size:9px;color:var(--text3);margin-top:5px}' +
    '.mt-pm-projects b{color:rgba(0,210,255,.6);font-weight:400}' +
    '.mt-empty-name{font-family:var(--font-ui);font-size:13px;color:var(--text3);font-style:italic}' +
    '.mt-bio-btn{font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;padding:5px 14px;' +
      'background:none;border:1px solid rgba(0,210,255,.3);color:var(--cyan);cursor:pointer;' +
      'white-space:nowrap;transition:all .15s;flex-shrink:0}' +
    '.mt-bio-btn:hover{background:rgba(0,210,255,.08);border-color:rgba(0,210,255,.6)}' +
    '.mt-loading{font-family:var(--font-mono);font-size:11px;color:var(--text3);letter-spacing:.1em;' +
      'padding:40px;text-align:center;animation:pulse 1.4s ease-in-out infinite}' +
    '#mt-bio-overlay{position:fixed;inset:0;z-index:700;background:rgba(0,0,0,.5);display:none}' +
    '#mt-bio-overlay.open{display:block}' +
    '#mt-bio-drawer{position:fixed;top:0;right:-560px;width:540px;height:100vh;' +
      'background:var(--bg1);border-left:1px solid var(--border);z-index:701;' +
      'transition:right .25s cubic-bezier(.4,0,.2,1);overflow-y:auto;display:flex;flex-direction:column}' +
    '#mt-bio-drawer.open{right:0}' +
    '.mt-bio-hdr{display:flex;align-items:flex-start;justify-content:space-between;' +
      'padding:22px 24px 18px;border-bottom:1px solid var(--border);flex-shrink:0}' +
    '.mt-bio-hdr-left{display:flex;align-items:center;gap:14px}' +
    '.mt-bio-hdr-avatar{width:52px;height:52px;border-radius:50%;flex-shrink:0;display:flex;' +
      'align-items:center;justify-content:center;font-family:var(--font-hud);font-size:18px;' +
      'font-weight:700;color:var(--cyan);background:rgba(0,210,255,.1);' +
      'border:1px solid rgba(0,210,255,.3);overflow:hidden}' +
    '.mt-bio-hdr-avatar img{width:100%;height:100%;object-fit:cover}' +
    '.mt-bio-hdr-name{font-family:var(--font-hud);font-size:17px;font-weight:700;color:var(--text0);margin-bottom:2px}' +
    '.mt-bio-hdr-sub{font-family:var(--font-mono);font-size:10px;color:var(--text3)}' +
    '.mt-bio-close{background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer;padding:0 4px;line-height:1}' +
    '.mt-bio-close:hover{color:var(--text1)}' +
    '.mt-bio-body{padding:24px;flex:1}' +
    '.mt-bio-section{margin-bottom:24px}' +
    '.mt-bio-section-title{font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;color:var(--cyan);' +
      'margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid rgba(0,210,255,.1)}' +
    '.mt-bio-field{display:flex;justify-content:space-between;align-items:center;' +
      'padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)}' +
    '.mt-bio-field:last-child{border-bottom:none}' +
    '.mt-bio-field label{font-family:var(--font-mono);font-size:10px;color:var(--text3);letter-spacing:.08em}' +
    '.mt-bio-field span{font-family:var(--font-mono);font-size:11px;color:var(--text1)}' +
    '.mt-bio-field a{font-family:var(--font-mono);font-size:11px;color:var(--cyan);text-decoration:none}' +
    '.mt-bio-field a:hover{text-decoration:underline}';
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
  } catch(e) {
    panel.innerHTML = '<div class="mt-loading" style="color:var(--red)">Failed: ' + e.message + '</div>';
    console.error('[mwTeam]', e);
  }
};

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function _mtFetch() {
  var myId = _myResource && _myResource.id;
  if (!myId) throw new Error('_myResource not set');

  // My full resource row
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

  // Project allocations → PM IDs
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
  } catch(e) { console.warn('[mwTeam] allocs:', e.message); }

  // Resolve all IDs
  var byId = {};
  if (contactIds.length) {
    var uniq = contactIds.filter(function(v,i,a){ return a.indexOf(v)===i; });
    var resolved = await API.get(
      'resources?id=in.(' + uniq.join(',') + ')' +
      '&select=id,name,first_name,last_name,title,department,email,phone,avatar_url,location,level,is_active,is_external,start_date'
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

// ── Render ────────────────────────────────────────────────────────────────────
function _mtRender(panel) {
  var d = _data;
  var html = '';

  html += '<div class="mt-section"><div class="mt-section-hdr">MY CONTACTS</div>';
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
    html += '<div class="mt-card mt-empty"><div class="mt-avatar" style="opacity:.25">—</div>' +
      '<div class="mt-info"><div class="mt-empty-name">No project allocations found</div></div></div>';
  }
  html += '</div>';

  panel.innerHTML = html;
  _mtEnsureOverlay();
}

function _mtCard(r, label, projects) {
  if (!r) {
    return '<div class="mt-card mt-empty">' +
      '<div class="mt-avatar" style="opacity:.25">—</div>' +
      '<div class="mt-info"><div class="mt-role-label">' + e(label) + '</div>' +
      '<div class="mt-empty-name">Not assigned</div></div></div>';
  }
  var initials = ((r.first_name||r.name||'')[0]||'').toUpperCase() + ((r.last_name||'')[0]||'').toUpperCase();
  var avatar = r.avatar_url ? '<img src="'+e(r.avatar_url)+'" alt="">' : e(initials||'?');
  var contacts = '';
  if (r.email) contacts += '<div class="mt-contact">✉&nbsp;<a href="mailto:'+e(r.email)+'">'+e(r.email)+'</a></div>';
  if (r.phone) contacts += '<div class="mt-contact">✆&nbsp;<a href="tel:'+e(r.phone)+'">'+e(r.phone)+'</a></div>';
  var projHtml = projects && projects.length
    ? '<div class="mt-pm-projects">Projects: ' + projects.map(function(p){ return '<b>'+e(p)+'</b>'; }).join(' · ') + '</div>'
    : '';
  var name = r.name || ((r.first_name||'') + ' ' + (r.last_name||'')).trim();
  var sub  = [r.title, r.department].filter(Boolean).join(' · ');
  return '<div class="mt-card">' +
    '<div class="mt-avatar">' + avatar + '</div>' +
    '<div class="mt-info">' +
      '<div class="mt-role-label">' + e(label) + '</div>' +
      '<div class="mt-name">' + e(name) + '</div>' +
      '<div class="mt-title">' + e(sub) + '</div>' +
      (contacts ? '<div class="mt-contacts">' + contacts + '</div>' : '') +
      projHtml +
    '</div>' +
    '<button class="mt-bio-btn" onclick="_mtOpenBio(\''+e(r.id)+'\')">VIEW BIO</button>' +
  '</div>';
}

// ── Bio overlay ───────────────────────────────────────────────────────────────
function _mtEnsureOverlay() {
  if (document.getElementById('mt-bio-overlay')) return;
  var el = document.createElement('div');
  el.id = 'mt-bio-overlay';
  el.innerHTML =
    '<div id="mt-bio-drawer">' +
      '<div class="mt-bio-hdr">' +
        '<div class="mt-bio-hdr-left">' +
          '<div class="mt-bio-hdr-avatar" id="mt-bio-avatar"></div>' +
          '<div><div class="mt-bio-hdr-name" id="mt-bio-name"></div>' +
          '<div class="mt-bio-hdr-sub" id="mt-bio-sub"></div></div>' +
        '</div>' +
        '<button class="mt-bio-close" onclick="_mtCloseBio()">&#x2715;</button>' +
      '</div>' +
      '<div class="mt-bio-body" id="mt-bio-body"></div>' +
    '</div>';
  el.addEventListener('click', function(ev){ if (ev.target===el) _mtCloseBio(); });
  document.body.appendChild(el);
}

window._mtOpenBio = async function(id) {
  _mtEnsureOverlay();
  var overlay = document.getElementById('mt-bio-overlay');
  var drawer  = document.getElementById('mt-bio-drawer');
  overlay.classList.add('open');
  setTimeout(function(){ drawer.classList.add('open'); }, 10);
  document.getElementById('mt-bio-name').textContent = 'Loading\u2026';
  document.getElementById('mt-bio-sub').textContent  = '';
  document.getElementById('mt-bio-avatar').innerHTML = '';
  document.getElementById('mt-bio-body').innerHTML   = '';
  try {
    var rows = await API.get('resources?id=eq.' + id + '&select=*');
    var r = rows && rows[0];
    if (!r) throw new Error('Not found');
    _mtShowBio(r);
  } catch(ex) {
    document.getElementById('mt-bio-name').textContent = 'Error: ' + ex.message;
  }
};

function _mtShowBio(r) {
  var initials = ((r.first_name||r.name||'')[0]||'').toUpperCase() + ((r.last_name||'')[0]||'').toUpperCase();
  document.getElementById('mt-bio-avatar').innerHTML = r.avatar_url
    ? '<img src="'+e(r.avatar_url)+'" alt="">' : e(initials||'?');
  document.getElementById('mt-bio-name').textContent =
    r.name || ((r.first_name||'')+' '+(r.last_name||'')).trim();
  document.getElementById('mt-bio-sub').textContent =
    [r.title, r.department].filter(Boolean).join(' · ');

  var html =
    _mtBioSec('CONTACT INFORMATION', [
      ['Email',    r.email    ? '<a href="mailto:'+e(r.email)+'">'+e(r.email)+'</a>' : null],
      ['Phone',    r.phone    ? '<a href="tel:'+e(r.phone)+'">'+e(r.phone)+'</a>'   : null],
      ['Location', r.location || null],
    ]) +
    _mtBioSec('ROLE & PLACEMENT', [
      ['Title',      r.title      || null],
      ['Department', r.department || null],
      ['Level',      r.level      || null],
      ['Start Date', r.start_date || null],
      ['Type',       r.is_external ? 'External Contractor' : 'Internal Employee'],
      ['Status',     r.is_active  ? 'Active' : 'Inactive'],
    ]);
  document.getElementById('mt-bio-body').innerHTML = html;
}

function _mtBioSec(title, fields) {
  var rows = fields.filter(function(f){ return f[1]; })
    .map(function(f){
      return '<div class="mt-bio-field"><label>'+e(f[0])+'</label><span>'+f[1]+'</span></div>';
    }).join('');
  if (!rows) return '';
  return '<div class="mt-bio-section"><div class="mt-bio-section-title">'+e(title)+'</div>'+rows+'</div>';
}

window._mtCloseBio = function() {
  var drawer  = document.getElementById('mt-bio-drawer');
  var overlay = document.getElementById('mt-bio-overlay');
  if (drawer)  drawer.classList.remove('open');
  setTimeout(function(){ if (overlay) overlay.classList.remove('open'); }, 260);
};

// ── Utility ───────────────────────────────────────────────────────────────────
function e(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Self-install ──────────────────────────────────────────────────────────────
(function _install() {
  // 1. Add MY TEAM tab button
  var tabBar = document.getElementById('user-suite-tabs');
  if (tabBar && !document.querySelector('[data-tab="team"]')) {
    var btn = document.createElement('button');
    btn.className  = 'ust';
    btn.dataset.tab = 'team';
    btn.textContent = 'My Team';
    btn.onclick = function(){ uSwitchTab('team', btn); };
    tabBar.appendChild(btn);
  }

  // 2. Add utc-team panel alongside siblings
  var sibling = document.getElementById('utc-work');
  if (sibling && !document.getElementById('utc-team')) {
    var panel = document.createElement('div');
    panel.id        = 'utc-team';
    panel.className = 'utc';
    sibling.parentElement.appendChild(panel);
  }

  // 3. Patch uSwitchTab to trigger load
  if (typeof uSwitchTab === 'function' && !uSwitchTab._mtPatched) {
    var _orig = uSwitchTab;
    uSwitchTab = function(tab, btn) {
      _orig(tab, btn);
      if (tab === 'team') {
        window._mwTeamLoad && window._mwTeamLoad();
      }
    };
    uSwitchTab._mtPatched = true;
  }
})();

})();