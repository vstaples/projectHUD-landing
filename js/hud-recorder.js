// ============================================================
// ProjectHUD — hud-recorder.js  v2
// Opens a detached recorder window (movable to any screen).
// Communicates via BroadcastChannel('hud-recorder').
// ============================================================

const HUDRecorder = (() => {

  // ── State ────────────────────────────────────────────────
  let _state      = 'idle';
  let _stream     = null;
  let _recorder   = null;
  let _chunks     = [];
  let _startTime  = 0;
  let _pausedMs   = 0;
  let _pauseStart = 0;
  let _annotations = [];
  let _recWin     = null;   // the detached recorder window
  let _channel    = null;   // BroadcastChannel

  // ── CSS (record border on main app only) ─────────────────
  function injectStyles() {
    if (document.getElementById('hud-rec-styles')) return;
    const s = document.createElement('style');
    s.id = 'hud-rec-styles';
    s.textContent = `
      body.hud-recording #app {
        box-shadow: inset 0 0 0 3px #ff4757;
        transition: box-shadow 0.2s;
      }
      body.hud-paused #app {
        box-shadow: inset 0 0 0 3px #ffaa00;
      }

      /* ── Save dialog ───────────────────────────────────── */
      #hud-save-overlay {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.72);
        z-index: 10000;
        display: flex; align-items: center; justify-content: center;
      }
      .hud-save-panel {
        background: #0a1628;
        border: 1px solid rgba(0,210,255,0.25);
        width: 520px; max-width: 94vw;
        box-shadow: 0 24px 64px rgba(0,0,0,0.8);
      }
      .hud-save-hdr {
        padding: 13px 18px;
        border-bottom: 1px solid rgba(0,210,255,0.12);
        display: flex; align-items: center; justify-content: space-between;
        font-family: 'Share Tech Mono', monospace;
        font-size: 11px; letter-spacing: 0.16em; color: #00d2ff;
      }
      .hud-save-body {
        padding: 16px 18px;
        display: flex; flex-direction: column; gap: 12px;
      }
      .hud-save-label {
        font-family: 'Share Tech Mono', monospace;
        font-size: 10px; color: rgba(160,190,220,0.45);
        letter-spacing: 0.14em; display: block; margin-bottom: 4px;
      }
      .hud-save-body input,
      .hud-save-body textarea,
      .hud-save-body select {
        width: 100%; box-sizing: border-box;
        background: rgba(0,0,0,0.35);
        border: 1px solid rgba(0,210,255,0.18);
        color: rgba(215,232,248,0.9);
        font-family: 'Barlow', sans-serif; font-size: 13px;
        padding: 7px 10px; outline: none;
        transition: border-color 0.15s;
      }
      .hud-save-body input:focus,
      .hud-save-body textarea:focus,
      .hud-save-body select:focus { border-color: rgba(0,210,255,0.45); }
      .hud-save-body textarea { resize: vertical; min-height: 56px; }
      .hud-save-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .hud-save-footer {
        display: flex; gap: 8px;
        padding: 13px 18px;
        border-top: 1px solid rgba(0,210,255,0.10);
      }
      .hud-save-submit {
        flex: 1; padding: 9px;
        background: rgba(0,210,255,0.10);
        border: 1px solid rgba(0,210,255,0.38);
        color: #00d2ff;
        font-family: 'Barlow Condensed', sans-serif;
        font-size: 12px; font-weight: 600; letter-spacing: 0.1em;
        cursor: pointer; transition: background 0.15s;
      }
      .hud-save-submit:hover { background: rgba(0,210,255,0.20); }
      .hud-save-submit:disabled { opacity: 0.45; cursor: not-allowed; }
      .hud-save-discard {
        padding: 9px 18px;
        background: none;
        border: 1px solid rgba(255,71,87,0.22);
        color: rgba(255,71,87,0.55);
        font-family: 'Barlow Condensed', sans-serif;
        font-size: 12px; font-weight: 600; letter-spacing: 0.1em;
        cursor: pointer; transition: color 0.15s, border-color 0.15s;
      }
      .hud-save-discard:hover { color: #ff4757; border-color: rgba(255,71,87,0.45); }
      .hud-save-progress {
        font-family: 'Share Tech Mono', monospace;
        font-size: 11px; color: #00d2ff;
        text-align: center; padding: 5px 0; letter-spacing: 0.1em;
      }
      .hud-save-annots {
        max-height: 88px; overflow-y: auto;
        background: rgba(0,0,0,0.2);
        border: 1px solid rgba(155,89,182,0.14);
        padding: 5px 8px;
      }
      .hud-save-annot-row {
        display: flex; gap: 8px; align-items: center;
        font-family: 'Share Tech Mono', monospace;
        font-size: 10px; color: rgba(175,200,225,0.55);
        padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.03);
      }
      .hud-save-annot-row:last-child { border-bottom: none; }
      .hsa-time  { color: #9b59b6; min-width: 38px; }
      .hsa-type  { color: rgba(0,210,255,0.5); min-width: 52px; font-size: 9px; text-transform: uppercase; }
    `;
    document.head.appendChild(s);
  }

  // ── Open recorder window ──────────────────────────────────
  function openWindow() {
    // If already open, focus it
    if (_recWin && !_recWin.closed) {
      _recWin.focus();
      return;
    }

    // Position bottom-center of current screen
    const w = 360, h = 310;
    const left = window.screenLeft + Math.round((window.outerWidth - w) / 2);
    const top  = window.screenTop  + window.outerHeight - h - 60;

    _recWin = window.open(
      '/recorder-window.html',
      'HUDRecorder',
      `width=${w},height=${h},left=${left},top=${top},` +
      `resizable=yes,scrollbars=no,toolbar=no,menubar=no,` +
      `location=no,status=no,titlebar=no`
    );

    if (!_recWin) {
      alert('Popup blocked — please allow popups for this site to use the recorder.');
      return;
    }
  }

  // ── BroadcastChannel setup ────────────────────────────────
  function initChannel() {
    if (_channel) return;
    _channel = new BroadcastChannel('hud-recorder');
    _channel.addEventListener('message', onMessage);
  }

  function broadcast(data) {
    _channel?.postMessage(data);
  }

  // ── Handle commands from recorder window ──────────────────
  async function onMessage(e) {
    const { cmd } = e.data;

    if (cmd === 'PANEL_READY') {
      // Window loaded — nothing needed, user clicks START
    }
    else if (cmd === 'START')      { await startRecording(); }
    else if (cmd === 'PAUSE')      { pauseRecording(); }
    else if (cmd === 'RESUME')     { resumeRecording(); }
    else if (cmd === 'STOP')       { stopRecording(); }
    else if (cmd === 'ANNOTATION') { _annotations.push(e.data.annotation); }
  }

  // ── Helpers ───────────────────────────────────────────────
  function elapsed() {
    if (_state === 'idle') return 0;
    const now = _state === 'paused' ? _pauseStart : Date.now();
    return Math.floor((now - _startTime - _pausedMs) / 1000);
  }
  function fmtTime(s) {
    const m = Math.floor(s/60), sec = s%60;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  function updateRecBtn() {
    const btn = document.querySelector('.op-btn[data-rec]');
    if (!btn) return;
    if (_state === 'recording') {
      btn.style.color = '#ff4757';
      btn.style.textShadow = '0 0 8px rgba(255,71,87,0.6)';
    } else if (_state === 'paused') {
      btn.style.color = '#ffaa00';
      btn.style.textShadow = '';
    } else {
      btn.style.color = '';
      btn.style.textShadow = '';
    }
  }

  // ── Start ─────────────────────────────────────────────────
  async function startRecording() {
    if (_state !== 'idle') return;
    injectStyles();

    try {
      _stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, cursor: 'always' },
        audio: false,
      });
    } catch(e) {
      console.warn('[HUDRecorder] getDisplayMedia cancelled:', e.message);
      broadcast({ evt: 'ERROR', message: 'Screen share cancelled' });
      return;
    }

    _chunks      = [];
    _annotations = [];
    _pausedMs    = 0;
    _startTime   = Date.now();
    _state       = 'recording';

    _recorder = new MediaRecorder(_stream, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9' : 'video/webm',
    });
    _recorder.ondataavailable = e => { if (e.data.size > 0) _chunks.push(e.data); };
    _recorder.onstop = _onRecorderStop;
    _recorder.start(1000);

    // If user closes the share via browser UI
    _stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (_state !== 'idle') stopRecording();
    });

    document.body.classList.add('hud-recording');
    updateRecBtn();

    broadcast({ evt: 'RECORDING_STARTED', startTime: _startTime });
  }

  // ── Pause ─────────────────────────────────────────────────
  function pauseRecording() {
    if (_state !== 'recording') return;
    _recorder.pause();
    _pauseStart = Date.now();
    _state = 'paused';
    document.body.classList.remove('hud-recording');
    document.body.classList.add('hud-paused');
    updateRecBtn();
    broadcast({ evt: 'PAUSED', pauseStart: _pauseStart });
  }

  // ── Resume ────────────────────────────────────────────────
  function resumeRecording() {
    if (_state !== 'paused') return;
    _pausedMs += Date.now() - _pauseStart;
    _recorder.resume();
    _state = 'recording';
    document.body.classList.remove('hud-paused');
    document.body.classList.add('hud-recording');
    updateRecBtn();
    broadcast({ evt: 'RESUMED', pausedMs: _pausedMs });
  }

  // ── Stop ──────────────────────────────────────────────────
  function stopRecording() {
    if (_state === 'idle') return;
    _state = 'idle';
    document.body.classList.remove('hud-recording', 'hud-paused');
    updateRecBtn();
    _stream?.getTracks().forEach(t => t.stop());
    _recorder?.stop();  // triggers _onRecorderStop
    broadcast({ evt: 'STOPPED', duration: elapsed() });
  }

  // ── After recorder finishes collecting chunks ─────────────
  function _onRecorderStop() {
    const blob     = new Blob(_chunks, { type: 'video/webm' });
    const duration = elapsed();
    showSaveDialog(blob, duration);
  }

  // ── Save dialog ───────────────────────────────────────────
  function showSaveDialog(blob, duration) {
    document.getElementById('hud-save-overlay')?.remove();

    // Project options
    let projOpts = '<option value="">— No project —</option>';
    try {
      const proj = window.STATE?.project ? [window.STATE.project] : (window.STATE?.projects || []);
      proj.forEach(p => { projOpts += `<option value="${p.id}">${p.name}</option>`; });
    } catch(e) {}

    const annotHTML = _annotations.length
      ? `<div>
          <label class="hud-save-label">ANNOTATIONS (${_annotations.length})</label>
          <div class="hud-save-annots">
            ${_annotations.map(a=>`
              <div class="hud-save-annot-row">
                <span class="hsa-time">${fmtTime(a.time_seconds)}</span>
                <span class="hsa-type">${a.type}</span>
                <span>${a.label}</span>
              </div>`).join('')}
          </div>
        </div>` : '';

    const overlay = document.createElement('div');
    overlay.id = 'hud-save-overlay';
    overlay.innerHTML = `
      <div class="hud-save-panel">
        <div class="hud-save-hdr">
          <span>⏺ SAVE RECORDING</span>
          <span style="color:rgba(0,210,255,0.45);font-size:10px;">
            ${fmtTime(duration)} · ${(blob.size/1024/1024).toFixed(1)} MB
          </span>
        </div>
        <div class="hud-save-body">
          <div>
            <label class="hud-save-label">TITLE *</label>
            <input id="hsr-title" type="text" placeholder="e.g. EVM Dashboard Walkthrough" />
          </div>
          <div>
            <label class="hud-save-label">DESCRIPTION</label>
            <textarea id="hsr-desc" placeholder="What does this clip demonstrate?"></textarea>
          </div>
          <div class="hud-save-2col">
            <div>
              <label class="hud-save-label">PROJECT</label>
              <select id="hsr-project">${projOpts}</select>
            </div>
            <div>
              <label class="hud-save-label">CATEGORY</label>
              <select id="hsr-category">
                <option value="internal">Internal</option>
                <option value="training">Training</option>
                <option value="marketing">Marketing</option>
              </select>
            </div>
          </div>
          <div>
            <label class="hud-save-label">TAGS (comma separated)</label>
            <input id="hsr-tags" type="text" placeholder="e.g. evm, onboarding, demo" />
          </div>
          ${annotHTML}
          <div id="hsr-progress" class="hud-save-progress" style="display:none;"></div>
        </div>
        <div class="hud-save-footer">
          <button class="hud-save-submit" id="hsr-save">↑ SAVE TO LIBRARY</button>
          <button class="hud-save-discard" id="hsr-discard">DISCARD</button>
        </div>
      </div>
    `;

    overlay.querySelector('#hsr-save').addEventListener('click', () => _doSave(blob, duration, overlay));
    overlay.querySelector('#hsr-discard').addEventListener('click', () => {
      if (confirm('Discard this recording?')) {
        overlay.remove();
        broadcast({ evt: 'DISCARDED' });
      }
    });

    document.body.appendChild(overlay);
    overlay.querySelector('#hsr-title').focus();
  }

  // ── Upload ────────────────────────────────────────────────
  async function _doSave(blob, duration, overlay) {
    const title = overlay.querySelector('#hsr-title').value.trim();
    if (!title) { overlay.querySelector('#hsr-title').focus(); return; }

    const btn  = overlay.querySelector('#hsr-save');
    const prog = overlay.querySelector('#hsr-progress');
    btn.disabled = true;
    prog.style.display = 'block';
    prog.textContent = 'UPLOADING…';

    try {
      const userId = await Auth.getCurrentUserId();
      const ts     = new Date().toISOString().replace(/[:.]/g,'-');
      const path   = `${userId}/${ts}.webm`;

      prog.textContent = 'UPLOADING TO STORAGE…';
      const { data: up, error: upErr } = await supabase.storage
        .from('video-library')
        .upload(path, blob, { contentType: 'video/webm', upsert: false });
      if (upErr) throw new Error(upErr.message);

      prog.textContent = 'SAVING METADATA…';

      const projectId = overlay.querySelector('#hsr-project').value || null;
      const category  = overlay.querySelector('#hsr-category').value;
      const tags      = overlay.querySelector('#hsr-tags').value
        .split(',').map(t=>t.trim()).filter(Boolean);

      let firmId = null;
      try {
        const users = await API.getUsers();
        firmId = users?.find(u => u.id === userId)?.firm_id || null;
      } catch(e) {}

      await API.post('video_clips', {
        title,
        description:      overlay.querySelector('#hsr-desc').value.trim() || null,
        project_id:       projectId,
        author_id:        userId,
        firm_id:          firmId,
        duration_seconds: duration,
        file_path:        up.path,
        file_size_bytes:  blob.size,
        category,
        tags,
        annotations:      _annotations,
        is_public:        category === 'marketing',
      });

      prog.textContent = '✓ SAVED';
      prog.style.color = '#00e5a0';
      broadcast({ evt: 'SAVED' });
      setTimeout(() => { overlay.remove(); _chunks = []; _annotations = []; }, 1200);

    } catch(err) {
      console.error('[HUDRecorder] save error:', err);
      prog.textContent = '✗ ' + err.message;
      prog.style.color = '#ff4757';
      btn.disabled = false;
    }
  }

  // ── Public APIs ────────────────────────────────────────────
  function toggle() {
    initChannel();
    if (_recWin && !_recWin.closed) {
      _recWin.focus();
    } else {
      openWindow();
    }
  }

  return { toggle, getState: () => _state };

})();