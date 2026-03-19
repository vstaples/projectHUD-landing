// ── HUD Platform · attachments.js ───────────────────────────────────────────
// Shared attachment module — handles upload, retrieval, display, and deletion
// of file attachments across all entity types.
//
// Storage path convention:
//   {prospectOrProjectId}/{entityType}-{entityId}/{timestamp}_{filename}
//
// Activity log tagging convention:
//   [ai-attach:ID]       — action item attachment
//   [finding-attach:ID]  — finding attachment
//   [meeting:ID]         — meeting attachment
//
// Depends on: config.js, auth.js, api.js, ui.js
// ────────────────────────────────────────────────────────────────────────────

(function() {

// ── State ─────────────────────────────────────────────────────────────────────
// Shared attachment cache keyed by entity: { [entityKey]: [{name, size, type, url, path}] }
// entityKey examples: 'ai-123', 'finding-456', 'meeting-789'
const _cache = {};

// ── Cache management ──────────────────────────────────────────────────────────

function get(entityKey) {
  return _cache[entityKey] || [];
}

function set(entityKey, files) {
  _cache[entityKey] = files;
}

function add(entityKey, file) {
  if (!_cache[entityKey]) _cache[entityKey] = [];
  _cache[entityKey].push(file);
}

function hasAttachments(entityKey, description = '') {
  return (_cache[entityKey]?.length > 0)
    || (description && description.includes('[attachments:'));
}

// ── Load from activity log ────────────────────────────────────────────────────
// Parses tagged activity notes to reconstruct attachment metadata.
// Call this during page load after fetching activities.

function loadFromActivities(activities, tagPattern) {
  // tagPattern: { tag: '[ai-attach:', prefix: 'ai-' }
  //             { tag: '[finding-attach:', prefix: 'finding-' }
  const { tag, prefix } = tagPattern;
  (activities || [])
    .filter(a => a.type === 'note' && a.summary?.includes(tag))
    .forEach(a => {
      const match = a.summary.match(new RegExp(`\\${tag.slice(0, -1)}:([^\\]]+)\\]`));
      if (!match) return;
      const entityId = match[1];
      const raw      = a.summary.replace(new RegExp(`\\${tag.slice(0, -1)}:[^\\]]+\\]`), '').trim();
      if (!raw) return;
      const key = prefix + entityId;
      _cache[key] = raw.split('|').map(entry => {
        const parts = entry.split('::');
        return parts.length > 1
          ? { name: parts[1].trim(), path: parts[0].trim(), size: 0, url: null, type: '' }
          : { name: entry.trim(), path: null, size: 0, url: null, type: '' };
      });
    });
}

// ── Persist to activity log ───────────────────────────────────────────────────
// Writes/updates attachment metadata as a tagged activity note.

async function persist(entityId, entityKey, prospectId, tag, activities) {
  const uploads = (_cache[entityKey] || []).filter(f => f.path);
  if (!uploads.length) return;
  const encoded = uploads.map(f => f.path + '::' + f.name).join('|');
  const tagStr  = tag + entityId + ']';
  try {
    const existing = (activities || []).find(a => a.summary?.includes(tagStr));
    if (existing) {
      await API.patch(`prospect_activities?id=eq.${existing.id}`,
        { summary: encoded + ' ' + tagStr });
    } else {
      await API.post('prospect_activities', {
        prospect_id: prospectId,
        type:        'note',
        date:        new Date().toISOString(),
        summary:     encoded + ' ' + tagStr,
      });
    }
  } catch(e) {
    console.error('attachments.persist failed:', e);
  }
}

// ── Show popup ────────────────────────────────────────────────────────────────

async function show(entityKey, title = 'Attachments') {
  const files = _cache[entityKey] || [];
  await window.showAttachmentsPopup(files, title);
}

// ── Upload ─────────────────────────────────────────────────────────────────────

async function upload(file, storagePath, entityKey) {
  const result = await window.uploadFile(file, storagePath);
  if (result?.url) {
    add(entityKey, {
      name: file.name, size: file.size, type: file.type,
      url: result.url, path: result.path,
    });
  }
  return result;
}

// ── Delete from storage ───────────────────────────────────────────────────────

async function remove(path, entityKey) {
  try {
    const token = await Auth.getFreshToken().catch(() => Auth.getToken());
    await fetch(
      `${PHUD.SUPABASE_URL}/storage/v1/object/attachments/${path}`,
      {
        method:  'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': PHUD.SUPABASE_KEY },
      }
    );
    if (entityKey) {
      _cache[entityKey] = (_cache[entityKey] || []).filter(f => f.path !== path);
    }
  } catch(e) {
    console.error('attachments.remove failed:', e);
  }
}

// ── Count helper ──────────────────────────────────────────────────────────────

function count(entityKey) {
  return _cache[entityKey]?.length || 0;
}

// ── Public API ────────────────────────────────────────────────────────────────

window.HUD = window.HUD || {};
window.HUD.Attachments = {
  get, set, add, hasAttachments,
  loadFromActivities,
  persist,
  show,
  upload,
  remove,
  count,
  cache: _cache,  // direct access for legacy compatibility
};

// Backward compat: existing pages call showAttachments(aiId) directly
window.showAttachments = (aiId) => show('ai-' + aiId, 'Attachments');

})();