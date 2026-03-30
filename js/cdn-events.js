// cdn-events.js — Cadence: external event detection, CoC polling, elapsed timer
// LOAD ORDER: 15th

function _startExternalEventDetection(instId) {
  _stopExternalEventDetection();
  if (!instId) return;

  _lastCoCCount = (_selectedInstance?._stepInsts || []).length;

  // ── Primary: Supabase Realtime subscription ───────────────────────────────
  try {
    // Supabase Realtime via REST-compatible approach using the JS client pattern
    const realtimeUrl = `${SUPA_URL}/realtime/v1/websocket?apikey=${SUPA_KEY}&vsn=1.0.0`;
    const ws = new WebSocket(realtimeUrl);
    let heartbeatInterval = null;
    let joined = false;

    ws.onopen = () => {
      // Join the channel for this instance's CoC events
      ws.send(JSON.stringify({
        topic:   `realtime:public:workflow_step_instances:instance_id=eq.${instId}`,
        event:   'phx_join',
        payload: {
          config: {
            broadcast:  { ack: false, self: false },
            presence:   { key: '' },
            postgres_changes: [{
              event:  'INSERT',
              schema: 'public',
              table:  'workflow_step_instances',
              filter: `instance_id=eq.${instId}`,
            }],
          },
        },
        ref: '1',
      }));
      // Heartbeat every 25s to keep connection alive
      heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null }));
        }
      }, 25000);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        // Realtime INSERT event on workflow_step_instances
        if (msg.event === 'postgres_changes' || msg.event === 'INSERT' ||
            (msg.payload?.data?.type === 'INSERT')) {
          console.log('[Realtime] CoC INSERT detected for instance', instId);
          _onExternalCoCEvent(instId);
        }
        // Also catch the phx_reply confirming join
        if (msg.event === 'phx_reply' && msg.payload?.status === 'ok') {
          joined = true;
          console.log('[Realtime] Subscribed to instance', instId);
        }
      } catch (_) {}
    };

    ws.onerror = (e) => {
      console.warn('[Realtime] WebSocket error — polling fallback active');
    };

    ws.onclose = () => {
      clearInterval(heartbeatInterval);
      console.log('[Realtime] WebSocket closed');
    };

    _realtimeChannel = ws;
  } catch (err) {
    console.warn('[Realtime] Setup failed:', err.message, '— polling fallback active');
  }

  // ── Fallback: 15-second polling ───────────────────────────────────────────
  _pollTimer = setInterval(() => _pollCoCForChanges(instId), 15000);
  console.log('[LiveSync] Started for instance', instId.slice(0,8));
}

function _stopExternalEventDetection() {
  // Stop realtime
  if (_realtimeChannel) {
    try { _realtimeChannel.close(); } catch (_) {}
    _realtimeChannel = null;
  }
  // Stop polling
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

async function _pollCoCForChanges(instId) {
  if (!_selectedInstance || _selectedInstance.id !== instId) return;
  if (_instScrubPos < 100) return; // don't disrupt manual scrubbing
  try {
    const fresh = await API.get(
      `workflow_step_instances?instance_id=eq.${instId}&select=id&order=created_at.asc`
    ).catch(() => null);
    if (!fresh) return;
    if (fresh.length !== _lastCoCCount) {
      console.log('[Poll] CoC changed:', _lastCoCCount, '->', fresh.length, '— reloading');
      _onExternalCoCEvent(instId);
    }
  } catch (_) {}
}

async function _onExternalCoCEvent(instId) {
  if (!_selectedInstance || _selectedInstance.id !== instId) return;
  if (_instScrubPos < 100) return; // don't disrupt manual scrubbing
  await _reloadInstance(instId).catch(() => {});
  _lastCoCCount = (_selectedInstance?._stepInsts || []).length;
  // Re-init scrubber with fresh events
  if (typeof _instInitScrubber === 'function') _instInitScrubber(_selectedInstance);
  cadToast('Workflow updated — external response received', 'info');
}

function _startElapsedTimer(inst) {
  if (_elapsedTimer) { clearInterval(_elapsedTimer); _elapsedTimer = null; }
  if (!inst || inst.status === 'cancelled' || inst.status === 'complete') return;
  _elapsedTimer = setInterval(() => {
    // Tick all live step timers
    document.querySelectorAll('[id^="timer-"][data-from]').forEach(el => {
      const ms = Date.now() - new Date(el.dataset.from);
      if (ms < 0) return;
      const m = Math.floor(ms/60000), h = Math.floor(m/60), d = Math.floor(h/24);
      el.textContent = `${String(d).padStart(2,'0')}:${String(h%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
    });
    // Tick instance header clock
    document.querySelectorAll('[id^="inst-clock-"][data-from]').forEach(el => {
      const ms = Date.now() - new Date(el.dataset.from);
      if (ms < 0) return;
      const m = Math.floor(ms/60000), h = Math.floor(m/60), d = Math.floor(h/24);
      el.textContent = `${String(d).padStart(2,'0')}:${String(h%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
    });
  }, 30000);
}

function _stopElapsedTimer() {
  if (_elapsedTimer) { clearInterval(_elapsedTimer); _elapsedTimer = null; }
}