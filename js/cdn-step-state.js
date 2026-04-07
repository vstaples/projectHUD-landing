// ══════════════════════════════════════════════════════════════════════════════
// cdn-step-state.js  ·  v20260407-SS2
// Shared step-state manager — consumed by both the cockpit (cdn-bist.js)
// and the coverage inline runner (cdn-coverage.js).
//
// Provides a single source of truth for:
//   - Step state transitions: idle → active → done | failed | reset
//   - DAG node coloring via registered adapters
//   - Progress event routing to registered listeners
//
// Architecture:
//   1. Call CadenceStepState.createRunner(scriptId, adapter) to get a runner
//   2. The runner wraps runBistScript, routes events to the adapter
//   3. Adapters implement: setActive(seq), setDone(seq, outcome),
//      setFailed(seq, reason), setReset(fromSeq, toSeq), setIdle()
//
// Built-in adapters:
//   CadenceStepState.coverageAdapter(pathIdx) — colors coverage DAG nodes
//   CadenceStepState.cockpitAdapter()         — (stub) routes to cockpit fn
// ══════════════════════════════════════════════════════════════════════════════

console.log('%c[cdn-step-state] v20260407-SS2 — shared step state model','background:#1a4a2a;color:#3de08a;font-weight:700;padding:2px 8px;border-radius:3px');

var CadenceStepState = (function() {

  // ── Coverage DAG adapter ────────────────────────────────────────────────────
  // Colors nodes in the coverage tab's DAG swim lanes.
  // Nodes are .cv-dag-box elements inside #cv-dag-row-{pathIdx}.
  // Ordered by path node sequence — handles repeated seqs in reset paths.

  function coverageAdapter(pathIdx) {
    var dagRow = null;
    var nodeSeqList = [];   // ordered seq for each non-trigger box
    var callCount = {};     // tracks occurrence index per seq

    function init() {
      dagRow = document.getElementById('cv-dag-row-' + pathIdx);
      var pd = window._cvLastPathData && window._cvLastPathData[pathIdx];
      nodeSeqList = pd && pd.path ? pd.path.map(function(n) { return n.seq; }) : [];
      callCount = {};
    }

    function getBox(seq) {
      if (!dagRow) return null;
      var allBoxes = dagRow.querySelectorAll('.cv-dag-box:not(.trigger-node)');
      var occ = callCount[seq] || 0;
      var found = 0;
      for (var i = 0; i < nodeSeqList.length; i++) {
        if (nodeSeqList[i] === seq) {
          if (found === occ) return allBoxes[i] || null;
          found++;
        }
      }
      return null;
    }

    function setClass(seq, cls) {
      var box = getBox(seq);
      if (!box) return;
      box.className = box.className
        .replace(/\bscripted\b|\bcovered\b|\buncovered\b|\bstale\b|\bactive-step\b/g, '')
        .trim() + ' ' + cls;
      // Force synchronous reflow so browser paints this frame before next event
      box.getBoundingClientRect();
    }

    return {
      init: init,

      setActive: function(seq) {
        setClass(seq, 'stale'); // amber/yellow = in progress
      },

      setDone: function(seq, outcome) {
        setClass(seq, 'covered'); // green = passed
        callCount[seq] = (callCount[seq] || 0) + 1;
        // If this was the last node in the path, color the END box green too
        if (dagRow && nodeSeqList.length && nodeSeqList[nodeSeqList.length-1] === seq) {
          var allBoxes = dagRow.querySelectorAll('.cv-dag-box:not(.trigger-node)');
          var endBox = allBoxes[allBoxes.length-1];
          if (endBox && (endBox.className.includes('scripted') || endBox.className.includes('stale'))) {
            endBox.className = endBox.className.replace(/scripted|stale/g,'').trim()+' covered';
          }
        }
      },

      setFailed: function(seq, reason) {
        setClass(seq, 'uncovered'); // red = failed
        callCount[seq] = (callCount[seq] || 0) + 1;
      },

      setReset: function(fromSeq, toSeq) {
        // Reset nodes from toSeq up to (not including) fromSeq back to scripted
        if (!dagRow) return;
        var allBoxes = dagRow.querySelectorAll('.cv-dag-box:not(.trigger-node)');
        var inRange = false;
        for (var i = 0; i < nodeSeqList.length; i++) {
          if (nodeSeqList[i] === toSeq) inRange = true;
          if (nodeSeqList[i] === fromSeq && inRange) break;
          if (inRange && allBoxes[i]) {
            allBoxes[i].className = allBoxes[i].className
              .replace(/\bscripted\b|\bcovered\b|\buncovered\b|\bstale\b/g, '')
              .trim() + ' scripted';
          }
        }
        // Reset occurrence counters for affected seqs
        for (var seq = toSeq; seq < fromSeq; seq++) {
          delete callCount[seq];
        }
      },

      setIdle: function() {
        // Reset all non-trigger nodes to scripted
        if (!dagRow) return;
        dagRow.querySelectorAll('.cv-dag-box:not(.trigger-node)').forEach(function(b) {
          b.className = b.className
            .replace(/\bscripted\b|\bcovered\b|\buncovered\b|\bstale\b/g, '')
            .trim() + ' scripted';
        });
        callCount = {};
      },

      finalizeAll: function(passed) {
        if (!dagRow) return;
        var cls = passed ? 'covered' : 'uncovered';
        dagRow.querySelectorAll('.cv-dag-box:not(.trigger-node)').forEach(function(b) {
          if (b.className.indexOf('scripted') >= 0 || b.className.indexOf('stale') >= 0) {
            b.className = b.className.replace(/\\bscripted\\b|\\bstale\\b/g, '').trim() + ' ' + cls;
          }
        });
      }
    };
  }

  // ── Runner factory ──────────────────────────────────────────────────────────
  // Wraps runBistScript with standardised event routing to the adapter.

  function createRunner(scriptId, adapter) {
    return {
      run: function(onLog, onComplete) {
        if (typeof adapter.init === 'function') adapter.init();

        if (typeof runBistScript !== 'function') {
          if (onLog) onLog('error', 'runBistScript not available — reload page');
          return Promise.resolve({ status: 'error' });
        }

        window._cvRunActive = true;

        return runBistScript(scriptId, function(ev) {
          var type = ev.type;

          if (type === 'step_start') {
            var lbl = ev.action === 'launch_instance'
              ? 'Launching instance...'
              : 'Step ' + (ev.stepSeq || ev.stepIdx) + ': running...';
            if (onLog) onLog('info', lbl);
            if (ev.stepSeq) adapter.setActive(ev.stepSeq);
          }

          else if (type === 'step_pass') {
            if (ev.action === 'launch_instance') {
              if (onLog) onLog('pass', '\u2713 Instance launched');
            } else {
              var passLbl = '\u2713 Step ' + (ev.stepSeq || ev.stepIdx) + ' passed';
              if (ev.outcome) passLbl += ' (' + ev.outcome + ')';
              if (onLog) onLog('pass', passLbl);
              if (ev.stepSeq && !ev.willRouteBack) adapter.setDone(ev.stepSeq, ev.outcome);
            }
          }

          else if (type === 'step_fail') {
            var failLbl = '\u2717 Step ' + (ev.stepSeq || ev.stepIdx || '?') + ' failed';
            if (ev.reason) failLbl += ': ' + ev.reason;
            if (onLog) onLog('fail', failLbl);
            if (ev.stepSeq) adapter.setFailed(ev.stepSeq, ev.reason);
          }

          else if (type === 'step_route_back') {
            if (onLog) onLog('info', '\u21a9 Reset to step ' + ev.toStepSeq);
            if (ev.fromStepSeq != null && ev.toStepSeq != null) {
              adapter.setReset(ev.fromStepSeq, ev.toStepSeq);
            }
          }

        }).then(function(result) {
          window._cvRunActive = false;
          var passed = result && result.status === 'passed';
          if (onLog) onLog(passed ? 'pass' : 'fail',
            passed ? '\u2713 All steps passed' : '\u2717 Script failed');
          if (typeof adapter.finalizeAll === 'function') adapter.finalizeAll(passed);
          if (onComplete) onComplete(passed, result);
          return result;
        }).catch(function(err) {
          window._cvRunActive = false;
          if (onLog) onLog('fail', 'Error: ' + (err && err.message ? err.message : String(err)));
          if (onComplete) onComplete(false, null);
        });
      }
    };
  }

  return {
    coverageAdapter: coverageAdapter,
    createRunner:    createRunner
  };

}());