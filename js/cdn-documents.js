// cdn-documents.js — Cadence: document attachment, upload, storage
// LOAD ORDER: 5th

function handleDocDrop(e, stepId) {
  e.preventDefault();
  document.getElementById('dropzone-' + stepId)?.classList.remove('drag-over');
  attachFilesToStep(stepId, [...(e.dataTransfer?.files || [])]);
}

function handleDocFileInput(e, stepId) {
  attachFilesToStep(stepId, [...(e.target?.files || [])]);
  e.target.value = '';
}

async function _uploadToStorage(file, stepId) {
  const safeName  = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path      = `${FIRM_ID_CAD}/${_selectedTmpl.id}/${stepId}/${Date.now()}_${safeName}`;
  const token     = await Auth.getToken();
  const res = await fetch(
    `${SUPA_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`,
    {
      method: 'POST',
      headers: {
        'apikey':        SUPA_KEY,
        'Authorization': 'Bearer ' + token,
        'Content-Type':  file.type || 'application/octet-stream',
        'x-upsert':      'true',
      },
      body: file,
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Storage upload failed: ${res.status}`);
  }
  // Store path only — URL generated on demand via _viewAttachment (Option C)
  // This ensures links never expire regardless of when the file is accessed.
  return { path, url: null };
}

async function _deleteFromStorage(path) {
  if (!path) return;
  const token = await Auth.getToken();
  await fetch(`${SUPA_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: 'DELETE',
    headers: {
      'apikey':        SUPA_KEY,
      'Authorization': 'Bearer ' + token,
    },
  }).catch(() => {}); // best-effort
}

async function _persistAttachedDocs(step) {
  const meta = (step._attachedDocs || []).map(d => ({
    name:    d.name,
    version: d.version,
    role:    d.role || 'reference',
    size:    d.size,
    path:    d.path  || null,
    url:     d.url   || null,
  }));
  await API.patch(
    `workflow_template_steps?id=eq.${step.id}`,
    { attached_docs: meta }
  );
}

async function attachFilesToStep(stepId, files) {
  if (!files.length) return;
  const step = _selectedTmpl?.steps?.find(s => s.id === stepId);
  if (!step) return;
  if (!step._attachedDocs) step._attachedDocs = [];

  for (const f of files) {
    if (step._attachedDocs.find(d => d.name === f.name)) continue;

    const kb = f.size < 1024        ? f.size + ' B'
             : f.size < 1048576     ? Math.round(f.size / 1024) + ' KB'
             : (f.size / 1048576).toFixed(1) + ' MB';

    const version = prompt(
      `Document version for "${f.name}"\n\n` +
      `Enter the released version number (e.g. Rev C, v2.1, 2026-03-21).\n` +
      `This must match the latest released copy on file.`,
      ''
    );
    if (version === null) continue; // cancelled

    cadToast(`Uploading ${f.name}…`, 'info');
    try {
      const { path, url } = await _uploadToStorage(f, stepId);
      step._attachedDocs.push({
        name:    f.name,
        version: version.trim() || 'No version specified',
        role:    'reference',
        size:    kb,
        path,
        url,
        file: f, // keep in-memory for immediate view without re-fetch
      });
      await _persistAttachedDocs(step);
      _dirtySteps = false; // docs persisted independently
      reRenderSpine();
      cadToast(`Attached: ${f.name}`, 'success');
    } catch(e) {
      cadToast(`Upload failed: ${e.message}`, 'error');
    }
  }
}

async function removeAttachedDoc(stepId, idx) {
  const step = _selectedTmpl?.steps?.find(s => s.id === stepId);
  if (!step?._attachedDocs) return;
  const doc = step._attachedDocs[idx];
  if (!confirm(`Remove "${doc.name}"? This will permanently delete the file.`)) return;

  // Delete from Storage
  if (doc.path) await _deleteFromStorage(doc.path);
  if (doc._blobUrl) URL.revokeObjectURL(doc._blobUrl);

  step._attachedDocs.splice(idx, 1);
  await _persistAttachedDocs(step).catch(() => {});
  reRenderSpine();
  cadToast(`Removed: ${doc.name}`, 'success');
}

async function setDocRole(stepId, idx, role) {
  const step = _selectedTmpl?.steps?.find(s => s.id === stepId);
  if (!step?._attachedDocs?.[idx]) return;
  step._attachedDocs[idx].role = role;
  await _persistAttachedDocs(step).catch(() => {});
  _dirtySteps = false;
  reRenderSpine();
}

function viewAttachedDoc(stepId, idx) {
  const step = _selectedTmpl?.steps?.find(s => s.id === stepId);
  const doc  = step?._attachedDocs?.[idx];
  if (!doc) return;

  const name   = doc.name.toLowerCase();
  const isPdf  = name.endsWith('.pdf');
  const isDocx = name.endsWith('.docx');

  // If we have an in-memory File object use it; otherwise use the stored URL
  if (doc.file) {
    if (isPdf) {
      if (!doc._blobUrl) doc._blobUrl = URL.createObjectURL(doc.file);
      window.open(doc._blobUrl, '_blank');
    } else if (isDocx) {
      _viewDocxFromFile(doc);
    } else {
      _downloadDoc(doc);
    }
  } else if (doc.path) {
    // Option C — generate fresh 1-hour signed URL on demand, never expires
    _viewAttachment(doc.path, doc.name);
  } else if (doc.url) {
    // Legacy — pre-existing docs with stored URLs (may eventually expire)
    if (isPdf || isDocx) {
      window.open(doc.url, '_blank');
    } else {
      const a = document.createElement('a');
      a.href = doc.url; a.target = '_blank'; a.download = doc.name; a.click();
    }
  } else {
    cadToast('File not available — try re-attaching', 'info');
  }
}

function _viewDocxFromFile(doc) {
  cadToast('Rendering document preview…', 'info');
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      if (typeof mammoth === 'undefined') {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      const result = await mammoth.convertToHtml({ arrayBuffer: e.target.result });
      const html = `<!DOCTYPE html><html><head>
        <meta charset="UTF-8"/>
        <title>${escHtml(doc.name)}</title>
        <style>
          body{font-family:Arial,sans-serif;font-size:14px;line-height:1.6;
               max-width:800px;margin:40px auto;padding:0 32px;color:#1a1a1a}
          table{border-collapse:collapse;width:100%;margin:12px 0}
          td,th{border:1px solid #ccc;padding:6px 10px}
          th{background:#f0f0f0;font-weight:600}
          .hdr{background:#f7f7f7;border-bottom:2px solid #00b0c8;padding:12px 0 10px;margin-bottom:24px}
          .hdr .t{font-size:13px;font-weight:700;color:#1a2a3a}
          .hdr .m{font-size:11px;color:#666;margin-top:3px}
        </style>
      </head><body>
        <div class="hdr">
          <div class="t">📄 ${escHtml(doc.name)}</div>
          <div class="m">Version: ${escHtml(doc.version||'—')} · ${escHtml(doc.size||'')} · Read-only preview</div>
        </div>
        ${result.value}
      </body></html>`;
      const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      window.open(blobUrl, '_blank');
    } catch(err) {
      cadToast('Preview failed — opening directly', 'error');
      if (doc.url) window.open(doc.url, '_blank');
    }
  };
  reader.readAsArrayBuffer(doc.file);
}

function _downloadDoc(doc) {
  const src = doc._blobUrl || (doc.file ? URL.createObjectURL(doc.file) : doc.url);
  if (!src) { cadToast('File not available', 'info'); return; }
  const a = document.createElement('a');
  a.href = src; a.download = doc.name; a.click();
}

async function _viewAttachment(path, name) {
  if (!path) { cadToast('Attachment path missing', 'error'); return; }
  try {
    const token   = await Auth.getToken();
    const signRes = await fetch(
      `${SUPA_URL}/storage/v1/object/sign/${STORAGE_BUCKET}/${path}`,
      {
        method:  'POST',
        headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + token,
                   'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 3600 }), // 1-hour token — fresh each view
      }
    );
    const data = await signRes.json();
    if (!data.signedURL) throw new Error(data.message || 'Could not generate link');
    const url = `${SUPA_URL}/storage/v1${data.signedURL}`;
    window.open(url, '_blank');
  } catch(e) {
    cadToast('Could not open attachment: ' + (e.message || 'unknown error'), 'error');
  }
}