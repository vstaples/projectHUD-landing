// ============================================================
// ProjectHUD — accord-display-tuning.js
// Shared display tuning panel — used by accord-today.html and
// accord.html. Extracted from accord-today.html so all Accord
// surfaces share the same full-featured tuning popup.
//
// Public API:
//   mcOpenTuning()       — open/focus the tuning popup window
//   _mcApplyTune(t)      — apply a tune object to CSS vars
//   _mcLoadTune()        — load persisted tune from localStorage
// ============================================================

var _MC_TUNE_KEY='accord-mc-display-tuning';
var _MC_DEFAULTS={brightness:1,contrast:1,saturate:1,colGap:6,zoneGap:10,radius:8,borderWidth:1,panelOpacity:1,heroBg:'#0d1520',heroBorderOpacity:.22,panelBg:'#0d1520',stripBg:'#0a1119',amber:'#f0a020',cyan:'#00d2ff',red:'#ff4d6d',violet:'#a855f7',green:'#34c070',row1Flex:1,row2Flex:1,textPrimary:'#e8f0f8',textMuted:'#7a9abf',textMeta:'#5a7a9a'};
var _MC_PRESETS={dark:{brightness:1,contrast:1,saturate:1,heroBg:'#0d1520'},medium:{brightness:1.1,contrast:.95,saturate:1.1,heroBg:'#111c2a'},bright:{brightness:1.25,contrast:.9,saturate:1.2,heroBg:'#162030'}};
var _mcTuneWin=null;

function _mcLoadTune(){
  try{return JSON.parse(localStorage.getItem(_MC_TUNE_KEY)||'null')||Object.assign({},_MC_DEFAULTS);}
  catch(e){return Object.assign({},_MC_DEFAULTS);}
}
function _mcApplyTune(t){
  var r=document.documentElement.style;
  r.setProperty('--mc-brightness',t.brightness);r.setProperty('--mc-contrast',t.contrast);r.setProperty('--mc-saturate',t.saturate);
  // Apply filter directly to html so it affects all pages regardless of CSS structure
  r.filter = 'brightness('+t.brightness+') contrast('+t.contrast+') saturate('+t.saturate+')';
  r.setProperty('--mc-col-gap',t.colGap+'px');r.setProperty('--mc-zone-gap',t.zoneGap+'px');r.setProperty('--mc-radius',t.radius+'px');
  r.setProperty('--mc-border-width',(t.borderWidth||1)+'px');r.setProperty('--mc-panel-opacity',t.panelOpacity||1);
  r.setProperty('--mc-hero-bg',t.heroBg);r.setProperty('--mc-hero-border-opacity',t.heroBorderOpacity);
  r.setProperty('--mc-panel-bg',t.panelBg);r.setProperty('--mc-strip-bg',t.stripBg);
  r.setProperty('--mc-amber',t.amber);r.setProperty('--mc-cyan',t.cyan);r.setProperty('--mc-red',t.red);r.setProperty('--mc-violet',t.violet);r.setProperty('--mc-green',t.green||'#34c070');
  r.setProperty('--amber',t.amber);r.setProperty('--cyan',t.cyan);r.setProperty('--red',t.red);r.setProperty('--violet',t.violet);
  r.setProperty('--mc-row1-flex',t.row1Flex);r.setProperty('--mc-row2-flex',t.row2Flex);
  r.setProperty('--mc-text-primary',t.textPrimary);r.setProperty('--mc-text-muted',t.textMuted);r.setProperty('--mc-text-meta',t.textMeta);
  r.setProperty('--tp',t.textPrimary);r.setProperty('--ts',t.textPrimary);r.setProperty('--tm',t.textMuted);r.setProperty('--tf',t.textMeta);r.setProperty('--tff',t.textMeta);
}
function mcOpenTuning(){
  if(_mcTuneWin&&!_mcTuneWin.closed){_mcTuneWin.focus();return;}
  var w=520,h=760,l=Math.max(0,screen.width-w-20),tp=Math.max(0,(screen.height-h)/2);
  _mcTuneWin=window.open('','mc-display-tuning','width='+w+',height='+h+',left='+l+',top='+tp+',resizable=yes,scrollbars=yes');
  if(!_mcTuneWin)return;
  var t=_mcLoadTune();
  _mcTuneWin.document.open();
  _mcTuneWin.document.write(_mcTuneHTML(t));
  _mcTuneWin.document.close();
}
window.addEventListener('message',function(e){
  if(e.source===_mcTuneWin&&e.data&&e.data.type==='mc-tune-apply'){
    _mcApplyTune(e.data.tune);
  }
});
window.addEventListener('storage',function(e){
  if(e.key===_MC_TUNE_KEY&&e.newValue){try{_mcApplyTune(JSON.parse(e.newValue));}catch(ex){}}
});
function _mcTuneHTML(t){
  var s=JSON.stringify;
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>MC Display Tuning</title>'
  +'<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0a1119;color:#c8d8e8;font-family:"JetBrains Mono",monospace;font-size:12px;padding:16px;height:100vh;overflow-y:auto}'
  +'.ttl{font-size:14px;font-weight:700;color:#e8f0f8;margin-bottom:14px;letter-spacing:.04em}'
  +'.sec{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#4a6a88;margin:16px 0 8px;border-bottom:1px solid rgba(255,255,255,.06);padding-bottom:5px}'
  +'.row{display:flex;align-items:center;gap:10px;margin-bottom:9px}'
  +'.lbl{flex:1;color:#8aaac8;font-size:11px}'
  +'.val{width:36px;text-align:right;color:#c8d8e8;font-size:11px}'
  +'input[type=range]{flex:1.4;accent-color:#f0a020;height:3px}'
  +'input[type=color]{width:32px;height:22px;border:1px solid rgba(255,255,255,.15);border-radius:3px;background:none;cursor:pointer;padding:1px}'
  +'.preset-row{display:flex;gap:8px;margin-bottom:12px}'
  +'.preset{flex:1;padding:7px;border-radius:5px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#c8d8e8;cursor:pointer;font-family:inherit;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;transition:background .15s}'
  +'.preset:hover{background:rgba(240,160,32,.15);border-color:rgba(240,160,32,.4);color:#f0a020}'
  +'.btn-row{display:flex;gap:8px;margin-top:16px}'
  +'.btn{flex:1;padding:8px;border-radius:5px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#c8d8e8;cursor:pointer;font-family:inherit;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}'
  +'.btn-amber{border-color:rgba(240,160,32,.4);background:rgba(240,160,32,.12);color:#f0a020}'
  +'.btn:hover{background:rgba(255,255,255,.1)}.btn-amber:hover{background:rgba(240,160,32,.22)}'
  +'#ratio-lbl{color:#f0a020;font-size:11px;text-align:center;margin-bottom:6px}'
  +'</style></head><body>'
  +'<div class="ttl">&#9728; MC Display Tuning</div>'
  +'<div class="sec">Presets</div>'
  +'<div class="preset-row"><button class="preset" onclick="applyPreset(\'dark\')">Dark</button><button class="preset" onclick="applyPreset(\'medium\')">Medium</button><button class="preset" onclick="applyPreset(\'bright\')">Bright</button></div>'
  +'<div class="sec">Global</div>'
  +'<div class="row"><span class="lbl">Brightness</span><input type="range" id="brightness" min=".7" max="1.5" step=".01" value="'+t.brightness+'" oninput="sync()"><span class="val" id="v-brightness">'+t.brightness+'</span></div>'
  +'<div class="row"><span class="lbl">Contrast</span><input type="range" id="contrast" min=".7" max="1.4" step=".01" value="'+t.contrast+'" oninput="sync()"><span class="val" id="v-contrast">'+t.contrast+'</span></div>'
  +'<div class="row"><span class="lbl">Saturation</span><input type="range" id="saturate" min=".3" max="2" step=".01" value="'+t.saturate+'" oninput="sync()"><span class="val" id="v-saturate">'+t.saturate+'</span></div>'
  +'<div class="sec">Spacing &amp; Shape</div>'
  +'<div class="row"><span class="lbl">Column gap</span><input type="range" id="colGap" min="0" max="20" step="1" value="'+t.colGap+'" oninput="sync()"><span class="val" id="v-colGap">'+t.colGap+'px</span></div>'
  +'<div class="row"><span class="lbl">Zone gap</span><input type="range" id="zoneGap" min="0" max="20" step="1" value="'+t.zoneGap+'" oninput="sync()"><span class="val" id="v-zoneGap">'+t.zoneGap+'px</span></div>'
  +'<div class="row"><span class="lbl">Corner radius</span><input type="range" id="radius" min="0" max="24" step="1" value="'+t.radius+'" oninput="sync()"><span class="val" id="v-radius">'+t.radius+'px</span></div>'
  +'<div class="row"><span class="lbl">Border thickness</span><input type="range" id="borderWidth" min="0" max="4" step=".5" value="'+(t.borderWidth||1)+'" oninput="sync()"><span class="val" id="v-borderWidth">'+(t.borderWidth||1)+'px</span></div>'
  +'<div class="row"><span class="lbl">Panel opacity</span><input type="range" id="panelOpacity" min=".2" max="1" step=".01" value="'+(t.panelOpacity||1)+'" oninput="sync()"><span class="val" id="v-panelOpacity">'+(t.panelOpacity||1)+'</span></div>'
  +'<div class="sec">Row Height Ratio</div>'
  +'<div id="ratio-lbl">Row 1: 50% · Row 2: 50%</div>'
  +'<input type="range" id="rowRatio" min="35" max="65" step="1" value="50" style="width:100%;margin-bottom:4px;accent-color:#f0a020" oninput="syncRatio()">'
  +'<div class="sec">Backgrounds</div>'
  +'<div class="row"><span class="lbl">Hero card</span><input type="color" id="heroBg" value="'+t.heroBg+'" oninput="sync()"></div>'
  +'<div class="row"><span class="lbl">Hero border intensity</span><input type="range" id="heroBorderOpacity" min="0" max=".6" step=".01" value="'+t.heroBorderOpacity+'" oninput="sync()"><span class="val" id="v-heroBorderOpacity">'+t.heroBorderOpacity+'</span></div>'
  +'<div class="row"><span class="lbl">Panels</span><input type="color" id="panelBg" value="'+t.panelBg+'" oninput="sync()"></div>'
  +'<div class="row"><span class="lbl">Situation strip</span><input type="color" id="stripBg" value="'+t.stripBg+'" oninput="sync()"></div>'
  +'<div class="sec">Accent Colors</div>'
  +'<div class="row"><span class="lbl">Amber</span><input type="color" id="amber" value="'+t.amber+'" oninput="sync()"></div>'
  +'<div class="row"><span class="lbl">Cyan</span><input type="color" id="cyan" value="'+t.cyan+'" oninput="sync()"></div>'
  +'<div class="row"><span class="lbl">Red</span><input type="color" id="red" value="'+t.red+'" oninput="sync()"></div>'
  +'<div class="row"><span class="lbl">Violet</span><input type="color" id="violet" value="'+t.violet+'" oninput="sync()"></div>'
  +'<div class="row"><span class="lbl">Green (live)</span><input type="color" id="green" value="'+(t.green||'#34c070')+'" oninput="sync()"></div>'
  +'<div class="sec">Text</div>'
  +'<div class="row"><span class="lbl">Primary</span><input type="color" id="textPrimary" value="'+t.textPrimary+'" oninput="sync()"></div>'
  +'<div class="row"><span class="lbl">Muted</span><input type="color" id="textMuted" value="'+t.textMuted+'" oninput="sync()"></div>'
  +'<div class="row"><span class="lbl">Meta / mono</span><input type="color" id="textMeta" value="'+t.textMeta+'" oninput="sync()"></div>'
  +'<div class="btn-row"><button class="btn btn-amber" onclick="save()">Save</button><button class="btn" onclick="exportTune()">Export</button><button class="btn" onclick="resetTune()">Reset</button></div>'
  +'<script>'
  +'var DEFAULTS='+s(_MC_DEFAULTS)+';'
  +'var PRESETS='+s(_MC_PRESETS)+';'
  +'var KEY="'+_MC_TUNE_KEY+'";'
  +'function g(id){return document.getElementById(id);}'
  +'function getTune(){'
  +'  var ratio=parseInt(g("rowRatio").value);'
  +'  var r1=parseFloat((ratio/50).toFixed(3)),r2=parseFloat(((100-ratio)/50).toFixed(3));'
  +'  return{brightness:parseFloat(g("brightness").value),contrast:parseFloat(g("contrast").value),'
  +'    saturate:parseFloat(g("saturate").value),colGap:parseInt(g("colGap").value),zoneGap:parseInt(g("zoneGap").value),'
  +'    radius:parseInt(g("radius").value),borderWidth:parseFloat(g("borderWidth").value),panelOpacity:parseFloat(g("panelOpacity").value),heroBg:g("heroBg").value,heroBorderOpacity:parseFloat(g("heroBorderOpacity").value),'
  +'    panelBg:g("panelBg").value,stripBg:g("stripBg").value,amber:g("amber").value,cyan:g("cyan").value,'
  +'    red:g("red").value,violet:g("violet").value,green:g("green").value,row1Flex:r1,row2Flex:r2,'
  +'    textPrimary:g("textPrimary").value,textMuted:g("textMuted").value,textMeta:g("textMeta").value};}'
  +'function updVal(id,suffix){var el=g("v-"+id);if(el)el.textContent=g(id).value+(suffix||"");}'
  +'function syncRatio(){'
  +'  var v=parseInt(g("rowRatio").value);'
  +'  g("ratio-lbl").textContent="Row 1: "+v+"% · Row 2: "+(100-v)+"%";'
  +'  sync();}'
  +'function sync(){'
  +'  updVal("brightness");updVal("contrast");updVal("saturate");'
  +'  updVal("colGap","px");updVal("zoneGap","px");updVal("radius","px");updVal("heroBorderOpacity");updVal("borderWidth","px");updVal("panelOpacity");'
  +'  var t=getTune();window.opener&&window.opener.postMessage({type:"mc-tune-apply",tune:t},"*");}'
  +'function save(){var t=getTune();localStorage.setItem(KEY,JSON.stringify(t));window.opener&&window.opener.postMessage({type:"mc-tune-apply",tune:t},"*");}'
  +'function exportTune(){window.opener&&window.opener.console.log("[MC] display-tuning export:",JSON.stringify(getTune(),null,2));}'
  +'function resetTune(){'
  +'  localStorage.removeItem(KEY);'
  +'  var d=DEFAULTS;'
  +'  g("brightness").value=d.brightness;g("contrast").value=d.contrast;g("saturate").value=d.saturate;'
  +'  g("colGap").value=d.colGap;g("zoneGap").value=d.zoneGap;g("radius").value=d.radius;g("borderWidth").value=d.borderWidth;g("panelOpacity").value=d.panelOpacity;'
  +'  g("heroBg").value=d.heroBg;g("heroBorderOpacity").value=d.heroBorderOpacity;'
  +'  g("panelBg").value=d.panelBg;g("stripBg").value=d.stripBg;'
  +'  g("amber").value=d.amber;g("cyan").value=d.cyan;g("red").value=d.red;g("violet").value=d.violet;g("green").value=d.green;'
  +'  g("textPrimary").value=d.textPrimary;g("textMuted").value=d.textMuted;g("textMeta").value=d.textMeta;'
  +'  g("rowRatio").value=50;syncRatio();sync();}'
  +'function applyPreset(name){'
  +'  var p=PRESETS[name];if(!p)return;'
  +'  g("brightness").value=p.brightness;g("contrast").value=p.contrast;g("saturate").value=p.saturate;'
  +'  g("heroBg").value=p.heroBg;sync();}'
  +'(function(){'
  +'  var stored=null;try{stored=JSON.parse(localStorage.getItem(KEY)||"null");}catch(e){}'
  +'  if(stored&&stored.row1Flex&&stored.row2Flex){'
  +'    var r1=stored.row1Flex,r2=stored.row2Flex,ratio=Math.round((r1/(r1+r2))*100);'
  +'    g("rowRatio").value=ratio;}'
  +'  syncRatio();'
  +'})();'
  +'<\/script></body></html>';
}

// Apply persisted tuning on load
(function(){var t=_mcLoadTune();_mcApplyTune(t);})();