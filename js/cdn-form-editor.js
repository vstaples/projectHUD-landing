(function() {
  var _dragging = false, _startX = 0, _startW = 0, _startCW = 0;
  document.addEventListener('mousedown', function(e) {
    if (!e.target || e.target.id !== 'form-matrix-resize') return;
    var panel = document.getElementById('form-col-matrix');
    var canvas = document.getElementById('form-canvas-wrap');
    var iframe = document.getElementById('form-html-preview');
    if (!panel || !canvas) return;
    _dragging = true;
    _startX = e.clientX;
    _startW = panel.offsetWidth;
    _startCW = canvas.offsetWidth;
    if (iframe) iframe.style.pointerEvents = 'none';
    e.target.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    console.log('START panelW='+_startW+' canvasW='+_startCW);
  }, true);
  document.addEventListener('mousemove', function(e) {
    if (!_dragging) return;
    var panel = document.getElementById('form-col-matrix');
    var canvas = document.getElementById('form-canvas-wrap');
    if (!panel || !canvas) return;
    var delta = _startX - e.clientX;
    panel.style.width = Math.max(220, Math.min(900, _startW + delta)) + 'px';
    panel.style.transition = 'none';
    canvas.style.width = Math.max(200, _startCW - delta) + 'px';
    canvas.style.flex = 'none';
    canvas.style.transition = 'none';
  });
  document.addEventListener('mouseup', function() {
    if (!_dragging) return;
    _dragging = false;
    var h = document.getElementById('form-matrix-resize');
    if (h) h.classList.remove('dragging');
    var iframe = document.getElementById('form-html-preview');
    if (iframe) iframe.style.pointerEvents = '';
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
  console.log('Wired.');
})();