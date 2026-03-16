// ============================================================
// ProjectHUD — hud-recorder.js  v4
// Thin orchestrator — all recording logic lives in
// recorder-window.html. This file handles:
//   • Opening the recorder window
//   • Red border on #app during recording
//   • Providing auth token to recorder window
//   • Saving clip metadata via API.post()
// ============================================================

const HUDRecorder = (() => {

  let _recWin  = null;
  let _channel = null;

  // ── Styles — recording border on main app ─────────────────
  function injectStyles() {
    if (document.getElementById('hud-rec-styles')) return;
    const s = document.createElement('style');
    s.id = 'hud-rec-styles';
    s.textContent = `
      body.hud-recording #app { box-shadow:inset 0 0 0 3px #ff4757; transition:box-shadow 0.2s; }
      body.hud-paused    #app { box-shadow:inset 0 0 0 3px #ffaa00; }
    `;
    document.head.appendChild(s);
  }

  // ── Channel ───────────────────────────────────────────────
  function initChannel() {
    if (_channel) return;
    _channel = new BroadcastChannel('hud-recorder');
    _channel.addEventListener('message', onMessage);
  }

  function broadcast(data) {
    _channel?.postMessage(data);
  }

  // ── Handle events FROM recorder window ───────────────────
  async function onMessage(e) {
    const { evt } = e.data;

    if (evt === 'RECORDING_STARTED') {
      injectStyles();
      document.body.classList.add('hud-recording');
      _updateRecBtn('recording');
    }
    else if (evt === 'PAUSED') {
      document.body.classList.remove('hud-recording');
      document.body.classList.add('hud-paused');
      _updateRecBtn('paused');
    }
    else if (evt === 'RESUMED') {
      document.body.classList.remove('hud-paused');
      document.body.classList.add('hud-recording');
      _updateRecBtn('recording');
    }
    else if (evt === 'STOPPED' || evt === 'DISCARDED') {
      document.body.classList.remove('hud-recording', 'hud-paused');
      _updateRecBtn('idle');
    }
    else if (evt === 'REQUEST_AUTH_TOKEN') {
      // Recorder window needs the user's JWT to upload to storage
      try {
        const session = await Auth.getSession?.();
        const token   = session?.access_token || null;
        broadcast({ evt: 'AUTH_TOKEN', token });
      } catch(e) {
        console.warn('[HUDRecorder] could not get auth token:', e.message);
        broadcast({ evt: 'AUTH_TOKEN', token: null });
      }
    }
    else if (evt === 'SAVE_CLIP') {
      // Recorder window finished uploading — save metadata via API
      try {
        const userId = await Auth.getCurrentUserId();
        let firmId = null;
        try {
          const users = await API.getUsers();
          firmId = users?.find(u => u.id === userId)?.firm_id || null;
        } catch(e) {}

        const projectId = window.STATE?.project?.id || null;

        await API.post('video_clips', {
          ...e.data.payload,
          author_id:  userId,
          firm_id:    firmId,
          project_id: projectId,
        });
        broadcast({ evt: 'SAVED' });
      } catch(err) {
        console.error('[HUDRecorder] metadata save error:', err);
        broadcast({ evt: 'SAVE_ERROR', message: err.message });
      }
    }
  }

  // ── Update the ⏺ button in the sidebar ───────────────────
  function _updateRecBtn(state) {
    const btn = document.querySelector('.op-btn[data-rec]');
    if (!btn) return;
    if (state === 'recording') {
      btn.style.color = '#ff4757';
      btn.style.textShadow = '0 0 8px rgba(255,71,87,0.6)';
    } else if (state === 'paused') {
      btn.style.color = '#ffaa00';
      btn.style.textShadow = '';
    } else {
      btn.style.color = '';
      btn.style.textShadow = '';
    }
  }

  // ── Open recorder window ──────────────────────────────────
  function toggle() {
    initChannel();
    if (_recWin && !_recWin.closed) {
      _recWin.focus();
      return;
    }
    const w = 360, h = 330;
    const left = window.screenLeft + Math.round((window.outerWidth - w) / 2);
    const top  = window.screenTop  + window.outerHeight - h - 60;
    _recWin = window.open(
      '/recorder-window.html', 'HUDRecorder',
      `width=${w},height=${h},left=${left},top=${top},` +
      `resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no`
    );
    if (!_recWin) {
      alert('Popup blocked — please allow popups for this site to use the recorder.');
    }
  }

  // Auto-init channel on every page load
  initChannel();

  return { toggle };

})();