// ============================================================
// ProjectHUD — hud-recorder.js
// In-browser screen recording with annotations + save to
// Supabase Storage. Include after config.js and api.js.
// ============================================================

const HUDRecorder = (() => {

  // ── State ────────────────────────────────────────────────
  let _state        = 'idle';   // idle | recording | paused | saving
  let _stream       = null;
  let _recorder     = null;
  let _chunks       = [];
  let _startTime    = 0;
  let _pausedMs     = 0;
  let _pauseStart   = 0;
  let _timerInterval= null;
  let _annotations  = [];       // [{time_seconds, type, label, data}]
  let _hudEl        = null;
  let _annotBarEl   = null;
  let _micEnabled   = false;
  let _micStream    = null;

  // ── CSS injection ────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('hud-recorder-styles')) return;
    const s = document.createElement('style');
    s.id = 'hud-recorder-styles';
    s.textContent = `
      /* ── Record border on #app ──────────────────────── */
      body.hud-recording #app {
        box-shadow: inset 0 0 0 3px #ff4757;
        transition: box-shadow 0.2s;
      }
      body.hud-paused #app {
        box-shadow: inset 0 0 0 3px #ffaa00;
      }

      /* ── Floating recorder HUD ──────────────────────── */
      #hud-rec-hud {
        position: fixed;
        bottom: 28px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(6,10,16,0.96);
        border: 1px solid rgba(255,71,87,0.50);
        display: flex;
        align-items: center;
        gap: 0;
        z-index: 9999;
        box-shadow: 0 8px 32px rgba(0,0,0,0.7);
        user-select: none;
        min-width: 340px;
      }
      #hud-rec-hud.paused {
        border-color: rgba(255,170,0,0.50);
      }

      .rec-hud-section {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        border-right: 1px solid rgba(255,255,255,0.06);
      }
      .rec-hud-section:last-child { border-right: none; }

      /* Pulsing red dot */
      .rec-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #ff4757;
        flex-shrink: 0;
      }
      body.hud-recording .rec-dot {
        animation: rec-pulse 1.2s ease-in-out infinite;
      }
      @keyframes rec-pulse {
        0%,100% { opacity: 1; transform: scale(1); }
        50%      { opacity: 0.4; transform: scale(0.8); }
      }

      .rec-timer {
        font-family: 'Share Tech Mono', monospace;
        font-size: 15px;
        color: #ff4757;
        font-weight: 700;
        letter-spacing: 0.08em;
        min-width: 60px;
      }
      body.hud-paused .rec-timer { color: #ffaa00; }

      .rec-btn {
        background: none;
        border: none;
        cursor: pointer;
        font-family: 'Barlow Condensed', sans-serif;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.12em;
        padding: 5px 12px;
        transition: color 0.15s, background 0.15s;
        display: flex;
        align-items: center;
        gap: 5px;
        border-radius: 2px;
      }
      .rec-btn-pause  { color: rgba(255,170,0,0.8); }
      .rec-btn-pause:hover  { background: rgba(255,170,0,0.10); color: #ffaa00; }
      .rec-btn-resume { color: rgba(0,210,255,0.8); }
      .rec-btn-resume:hover { background: rgba(0,210,255,0.10); color: #00d2ff; }
      .rec-btn-stop   { color: rgba(255,71,87,0.8); }
      .rec-btn-stop:hover   { background: rgba(255,71,87,0.10); color: #ff4757; }
      .rec-btn-mic    { color: rgba(180,200,220,0.45); }
      .rec-btn-mic.active { color: #00d2ff; }
      .rec-btn-mic:hover  { color: rgba(180,200,220,0.8); }
      .rec-btn-annot  { color: rgba(155,89,182,0.8); }
      .rec-btn-annot:hover  { background: rgba(155,89,182,0.10); color: #9b59b6; }

      /* ── Annotation bar ──────────────────────────────── */
      #hud-annot-bar {
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(6,10,16,0.96);
        border: 1px solid rgba(155,89,182,0.40);
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        z-index: 9999;
        min-width: 480px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6);
      }
      #hud-annot-bar input, #hud-annot-bar select {
        background: rgba(0,0,0,0.4);
        border: 1px solid rgba(155,89,182,0.30);
        color: rgba(210,230,245,0.9);
        font-family: 'Barlow Condensed', sans-serif;
        font-size: 12px;
        padding: 5px 8px;
        outline: none;
      }
      #hud-annot-bar input { flex: 1; }
      #hud-annot-bar select { width: 120px; }
      .annot-add-btn {
        background: rgba(155,89,182,0.15);
        border: 1px solid rgba(155,89,182,0.40);
        color: #9b59b6;
        font-family: 'Barlow Condensed', sans-serif;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.1em;
        padding: 5px 14px;
        cursor: pointer;
        transition: background 0.15s;
      }
      .annot-add-btn:hover { background: rgba(155,89,182,0.28); }
      .annot-close-btn {
        background: none;
        border: none;
        color: rgba(200,220,240,0.4);
        cursor: pointer;
        font-size: 14px;
        padding: 2px 6px;
        transition: color 0.15s;
      }
      .annot-close-btn:hover { color: #ff4757; }

      /* ── Annotation markers on timeline ─────────────── */
      .annot-marker {
        position: absolute;
        top: -4px;
        width: 2px;
        background: #9b59b6;
        height: 12px;
        cursor: pointer;
      }
      .annot-marker::after {
        content: attr(data-label);
        position: absolute;
        top: -20px;
        left: 50%;
        transform: translateX(-50%);
        background: #9b59b6;
        color: white;
        font-size: 9px;
        padding: 1px 4px;
        white-space: nowrap;
        pointer-events: none;
      }

      /* ── Save dialog ─────────────────────────────────── */
      #hud-save-dialog {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.7);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #hud-save-dialog .save-panel {
        background: var(--bg1, #0a1628);
        border: 1px solid rgba(0,210,255,0.25);
        width: 520px;
        max-width: 94vw;
        box-shadow: 0 24px 60px rgba(0,0,0,0.7);
      }
      #hud-save-dialog .save-header {
        padding: 14px 18px;
        border-bottom: 1px solid rgba(0,210,255,0.12);
        font-family: 'Share Tech Mono', monospace;
        font-size: 12px;
        color: #00d2ff;
        letter-spacing: 0.14em;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      #hud-save-dialog .save-body {
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      #hud-save-dialog label {
        font-family: 'Share Tech Mono', monospace;
        font-size: 10px;
        color: rgba(180,200,220,0.5);
        letter-spacing: 0.14em;
        display: block;
        margin-bottom: 4px;
      }
      #hud-save-dialog input,
      #hud-save-dialog textarea,
      #hud-save-dialog select {
        width: 100%;
        box-sizing: border-box;
        background: rgba(0,0,0,0.35);
        border: 1px solid rgba(0,210,255,0.20);
        color: rgba(210,230,245,0.9);
        font-family: 'Barlow', sans-serif;
        font-size: 13px;
        padding: 8px 10px;
        outline: none;
        transition: border-color 0.15s;
      }
      #hud-save-dialog input:focus,
      #hud-save-dialog textarea:focus,
      #hud-save-dialog select:focus {
        border-color: rgba(0,210,255,0.50);
      }
      #hud-save-dialog textarea { resize: vertical; min-height: 60px; }
      #hud-save-dialog .save-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      #hud-save-dialog .save-actions {
        display: flex;
        gap: 10px;
        padding: 14px 18px;
        border-top: 1px solid rgba(0,210,255,0.10);
      }
      .save-btn-primary {
        flex: 1;
        background: rgba(0,210,255,0.12);
        border: 1px solid rgba(0,210,255,0.40);
        color: #00d2ff;
        font-family: 'Barlow Condensed', sans-serif;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.1em;
        padding: 9px 0;
        cursor: pointer;
        transition: background 0.15s;
      }
      .save-btn-primary:hover { background: rgba(0,210,255,0.22); }
      .save-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .save-btn-discard {
        background: none;
        border: 1px solid rgba(255,71,87,0.25);
        color: rgba(255,71,87,0.6);
        font-family: 'Barlow Condensed', sans-serif;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.1em;
        padding: 9px 20px;
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s;
      }
      .save-btn-discard:hover { color: #ff4757; border-color: rgba(255,71,87,0.5); }

      .save-annot-list {
        max-height: 100px;
        overflow-y: auto;
        background: rgba(0,0,0,0.2);
        border: 1px solid rgba(155,89,182,0.15);
        padding: 6px 8px;
      }
      .save-annot-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: 'Share Tech Mono', monospace;
        font-size: 10px;
        color: rgba(180,200,220,0.6);
        padding: 3px 0;
        border-bottom: 1px solid rgba(255,255,255,0.04);
      }
      .save-annot-item:last-child { border-bottom: none; }
      .save-annot-time { color: #9b59b6; min-width: 44px; }
      .save-annot-type {
        color: rgba(0,210,255,0.6);
        min-width: 60px;
        text-transform: uppercase;
        font-size: 9px;
      }
      .save-progress {
        font-family: 'Share Tech Mono', monospace;
        font-size: 11px;
        color: #00d2ff;
        text-align: center;
        padding: 6px 0;
        letter-spacing: 0.1em;
      }
    `;
    document.head.appendChild(s);
  }

  // ── Helpers ──────────────────────────────────────────────
  function elapsed() {
    if (_state === 'idle' || _state === 'saving') return 0;
    const now = _state === 'paused' ? _pauseStart : Date.now();
    return Math.floor((now - _startTime - _pausedMs) / 1000);
  }

  function fmtTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function updateTimer() {
    const el = document.getElementById('rec-timer-display');
    if (el) el.textContent = fmtTime(elapsed());
  }

  function updateRecBtn() {
    const btn = document.querySelector('.op-btn[data-rec]');
    if (!btn) return;
    if (_state === 'recording') {
      btn.style.color = '#ff4757';
      btn.title = 'Recording — click to stop';
    } else if (_state === 'paused') {
      btn.style.color = '#ffaa00';
      btn.title = 'Paused — click to stop';
    } else {
      btn.style.color = '';
      btn.title = 'Start Recording';
    }
  }

  // ── Build floating HUD ────────────────────────────────────
  function buildHUD() {
    document.getElementById('hud-rec-hud')?.remove();
    const hud = document.createElement('div');
    hud.id = 'hud-rec-hud';
    hud.innerHTML = `
      <div class="rec-hud-section">
        <div class="rec-dot"></div>
        <span class="rec-timer" id="rec-timer-display">00:00</span>
      </div>
      <div class="rec-hud-section">
        <button class="rec-btn rec-btn-pause" id="rec-pause-btn" title="Pause">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><rect x="1" y="1" width="3.5" height="10"/><rect x="7.5" y="1" width="3.5" height="10"/></svg>
          PAUSE
        </button>
        <button class="rec-btn rec-btn-stop" id="rec-stop-btn" title="Stop and save">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><rect x="1" y="1" width="10" height="10"/></svg>
          STOP
        </button>
      </div>
      <div class="rec-hud-section">
        <button class="rec-btn rec-btn-annot" id="rec-annot-btn" title="Add annotation">
          ◆ MARK
        </button>
        <button class="rec-btn rec-btn-mic ${_micEnabled ? 'active' : ''}" id="rec-mic-btn" title="Toggle microphone">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>
          MIC
        </button>
      </div>
    `;

    hud.querySelector('#rec-pause-btn').addEventListener('click', togglePause);
    hud.querySelector('#rec-stop-btn').addEventListener('click', stop);
    hud.querySelector('#rec-annot-btn').addEventListener('click', toggleAnnotBar);
    hud.querySelector('#rec-mic-btn').addEventListener('click', toggleMic);

    document.body.appendChild(hud);
    _hudEl = hud;
  }

  function removeHUD() {
    document.getElementById('hud-rec-hud')?.remove();
    document.getElementById('hud-annot-bar')?.remove();
    _hudEl = null;
    _annotBarEl = null;
  }

  // ── Annotation bar ────────────────────────────────────────
  function toggleAnnotBar() {
    if (document.getElementById('hud-annot-bar')) {
      document.getElementById('hud-annot-bar').remove();
      return;
    }
    const bar = document.createElement('div');
    bar.id = 'hud-annot-bar';
    bar.innerHTML = `
      <select id="annot-type-sel">
        <option value="chapter">Chapter</option>
        <option value="callout">Callout</option>
        <option value="zoom">Zoom</option>
        <option value="note">Note</option>
      </select>
      <input id="annot-label-inp" type="text" placeholder="Annotation label…" />
      <button class="annot-add-btn" id="annot-add-btn">+ ADD</button>
      <button class="annot-close-btn" id="annot-close-btn">✕</button>
    `;
    bar.querySelector('#annot-add-btn').addEventListener('click', addAnnotation);
    bar.querySelector('#annot-close-btn').addEventListener('click', () => bar.remove());
    bar.querySelector('#annot-label-inp').addEventListener('keydown', e => {
      if (e.key === 'Enter') addAnnotation();
    });
    document.body.appendChild(bar);
    bar.querySelector('#annot-label-inp').focus();
    _annotBarEl = bar;
  }

  function addAnnotation() {
    const typeEl  = document.getElementById('annot-type-sel');
    const labelEl = document.getElementById('annot-label-inp');
    const label   = labelEl?.value.trim();
    if (!label) return;

    const ann = {
      time_seconds: elapsed(),
      type:  typeEl?.value || 'note',
      label: label,
      data:  {},
    };
    _annotations.push(ann);
    labelEl.value = '';

    // Flash confirmation
    const btn = document.getElementById('annot-add-btn');
    const orig = btn.textContent;
    btn.textContent = '✓ MARKED';
    btn.style.color = '#00e5a0';
    setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1000);
  }

  // ── Mic toggle ────────────────────────────────────────────
  async function toggleMic() {
    if (_micEnabled) {
      _micStream?.getTracks().forEach(t => t.stop());
      _micStream    = null;
      _micEnabled   = false;
      document.getElementById('rec-mic-btn')?.classList.remove('active');
    } else {
      try {
        _micStream  = await navigator.mediaDevices.getUserMedia({ audio: true });
        _micEnabled = true;
        document.getElementById('rec-mic-btn')?.classList.add('active');
      } catch(e) {
        console.warn('[Recorder] mic denied:', e.message);
      }
    }
  }

  // ── Start ──────────────────────────────────────────────────
  async function start() {
    if (_state !== 'idle') return;
    injectStyles();

    try {
      const videoStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, cursor: 'always' },
        audio: false,
      });

      // Combine with mic if enabled
      const tracks = [...videoStream.getTracks()];
      if (_micEnabled && _micStream) {
        tracks.push(..._micStream.getTracks());
      }
      _stream = new MediaStream(tracks);

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
      _recorder.onstop = () => _onRecorderStop();
      _recorder.start(1000); // collect chunk every 1s

      // If user closes the share dialog / stops sharing externally
      videoStream.getVideoTracks()[0].addEventListener('ended', () => {
        if (_state === 'recording' || _state === 'paused') stop();
      });

      // UI
      document.body.classList.add('hud-recording');
      buildHUD();
      _timerInterval = setInterval(updateTimer, 500);
      updateRecBtn();

    } catch(e) {
      console.warn('[Recorder] start failed:', e.message);
      _state = 'idle';
    }
  }

  // ── Pause / Resume ────────────────────────────────────────
  function togglePause() {
    if (_state === 'recording') {
      _recorder.pause();
      _pauseStart = Date.now();
      _state = 'paused';
      document.body.classList.remove('hud-recording');
      document.body.classList.add('hud-paused');
      _hudEl?.classList.add('paused');
      const btn = document.getElementById('rec-pause-btn');
      if (btn) {
        btn.className = 'rec-btn rec-btn-resume';
        btn.id = 'rec-pause-btn';
        btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><polygon points="1,1 11,6 1,11"/></svg> RESUME`;
      }
    } else if (_state === 'paused') {
      _pausedMs += Date.now() - _pauseStart;
      _recorder.resume();
      _state = 'recording';
      document.body.classList.remove('hud-paused');
      document.body.classList.add('hud-recording');
      _hudEl?.classList.remove('paused');
      const btn = document.getElementById('rec-pause-btn');
      if (btn) {
        btn.className = 'rec-btn rec-btn-pause';
        btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><rect x="1" y="1" width="3.5" height="10"/><rect x="7.5" y="1" width="3.5" height="10"/></svg> PAUSE`;
      }
    }
    updateRecBtn();
  }

  // ── Stop ──────────────────────────────────────────────────
  function stop() {
    if (_state !== 'recording' && _state !== 'paused') return;
    clearInterval(_timerInterval);
    const duration = elapsed();
    _state = 'saving';

    _stream?.getTracks().forEach(t => t.stop());
    _recorder.stop(); // triggers _onRecorderStop via onstop

    document.body.classList.remove('hud-recording', 'hud-paused');
    removeHUD();
    updateRecBtn();

    // Store duration for save dialog
    _pendingDuration = duration;
  }

  let _pendingDuration = 0;

  function _onRecorderStop() {
    const blob = new Blob(_chunks, { type: 'video/webm' });
    showSaveDialog(blob, _pendingDuration);
  }

  // ── Save dialog ────────────────────────────────────────────
  function showSaveDialog(blob, duration) {
    document.getElementById('hud-save-dialog')?.remove();

    // Build project options from STATE if available
    let projectOptions = '<option value="">— No project —</option>';
    try {
      const projects = window.STATE?.project
        ? [window.STATE.project]
        : (window.STATE?.projects || []);
      projects.forEach(p => {
        projectOptions += `<option value="${p.id}">${p.name}</option>`;
      });
    } catch(e) {}

    const annotHTML = _annotations.length > 0
      ? `<div>
          <label>ANNOTATIONS (${_annotations.length})</label>
          <div class="save-annot-list">
            ${_annotations.map(a => `
              <div class="save-annot-item">
                <span class="save-annot-time">${fmtTime(a.time_seconds)}</span>
                <span class="save-annot-type">${a.type}</span>
                <span>${a.label}</span>
              </div>`).join('')}
          </div>
        </div>`
      : '';

    const dlg = document.createElement('div');
    dlg.id = 'hud-save-dialog';
    dlg.innerHTML = `
      <div class="save-panel">
        <div class="save-header">
          <span>◈ SAVE RECORDING</span>
          <span style="color:rgba(0,210,255,0.5);font-size:11px;">
            ${fmtTime(duration)} · ${(blob.size/1024/1024).toFixed(1)} MB
          </span>
        </div>
        <div class="save-body">
          <div>
            <label>TITLE *</label>
            <input id="sv-title" type="text" placeholder="e.g. EVM Dashboard Walkthrough" />
          </div>
          <div>
            <label>DESCRIPTION</label>
            <textarea id="sv-desc" placeholder="What does this clip demonstrate?"></textarea>
          </div>
          <div class="save-row">
            <div>
              <label>PROJECT</label>
              <select id="sv-project">${projectOptions}</select>
            </div>
            <div>
              <label>CATEGORY</label>
              <select id="sv-category">
                <option value="internal">Internal</option>
                <option value="training">Training</option>
                <option value="marketing">Marketing</option>
              </select>
            </div>
          </div>
          <div>
            <label>TAGS (comma separated)</label>
            <input id="sv-tags" type="text" placeholder="e.g. evm, dashboard, onboarding" />
          </div>
          ${annotHTML}
          <div id="sv-progress" class="save-progress" style="display:none;"></div>
        </div>
        <div class="save-actions">
          <button class="save-btn-primary" id="sv-save-btn">↑ SAVE TO LIBRARY</button>
          <button class="save-btn-discard" id="sv-discard-btn">DISCARD</button>
        </div>
      </div>
    `;

    dlg.querySelector('#sv-save-btn').addEventListener('click', () => saveClip(blob, duration, dlg));
    dlg.querySelector('#sv-discard-btn').addEventListener('click', () => {
      if (confirm('Discard this recording? It cannot be recovered.')) {
        dlg.remove();
        _state = 'idle';
      }
    });

    document.body.appendChild(dlg);
    dlg.querySelector('#sv-title').focus();
  }

  // ── Upload to Supabase ─────────────────────────────────────
  async function saveClip(blob, duration, dialogEl) {
    const title = dialogEl.querySelector('#sv-title').value.trim();
    if (!title) {
      dialogEl.querySelector('#sv-title').focus();
      return;
    }

    const btn = dialogEl.querySelector('#sv-save-btn');
    const prog = dialogEl.querySelector('#sv-progress');
    btn.disabled = true;
    prog.style.display = 'block';
    prog.textContent = 'UPLOADING…';

    try {
      // Get current user
      const userId = await Auth.getCurrentUserId();

      // Generate filename
      const ts       = new Date().toISOString().replace(/[:.]/g,'-');
      const filename = `${userId}/${ts}.webm`;

      // Upload to Supabase Storage
      prog.textContent = 'UPLOADING TO STORAGE…';
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('video-library')
        .upload(filename, blob, { contentType: 'video/webm', upsert: false });

      if (uploadErr) throw new Error(uploadErr.message);

      prog.textContent = 'SAVING METADATA…';

      // Get project_id and firm_id
      const projectId = dialogEl.querySelector('#sv-project').value || null;
      const category  = dialogEl.querySelector('#sv-category').value;
      const tagsRaw   = dialogEl.querySelector('#sv-tags').value;
      const tags      = tagsRaw.split(',').map(t=>t.trim()).filter(Boolean);

      // Get firm_id from current user
      let firmId = null;
      try {
        const users = await API.getUsers();
        firmId = users?.find(u => u.id === userId)?.firm_id || null;
      } catch(e) {}

      // Insert metadata
      await API.post('video_clips', {
        title,
        description: dialogEl.querySelector('#sv-desc').value.trim() || null,
        project_id:  projectId,
        author_id:   userId,
        firm_id:     firmId,
        duration_seconds: duration,
        file_path:   uploadData.path,
        file_size_bytes: blob.size,
        category,
        tags,
        annotations: _annotations,
        is_public:   category === 'marketing',
      });

      prog.textContent = '✓ SAVED TO VIDEO LIBRARY';
      prog.style.color = '#00e5a0';
      setTimeout(() => {
        dialogEl.remove();
        _state = 'idle';
        _chunks = [];
        _annotations = [];
      }, 1500);

    } catch(e) {
      console.error('[Recorder] save failed:', e);
      prog.textContent = '✗ SAVE FAILED: ' + e.message;
      prog.style.color = '#ff4757';
      btn.disabled = false;
    }
  }

  // ── Public API ─────────────────────────────────────────────
  function toggle() {
    if (_state === 'idle') {
      start();
    } else if (_state === 'recording' || _state === 'paused') {
      stop();
    }
  }

  return { start, stop, toggle, togglePause, addAnnotation, getState: () => _state };

})();