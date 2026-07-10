// ════════════════════════════════════════════════════════════════════════
// WeatherBlend — app.js  (UI, rendering, interaction · Phase 2)
// ════════════════════════════════════════════════════════════════════════
// Load order: engine.js FIRST, then app.js. Shared state lives in engine.js.
// Phase 2: quatrefoil palette everywhere · hero sparklines (44px, hour axis,
// scrub time bubble) · fingerprint day selector (replaces hourly strip) ·
// SVG icon set unified across cards, tables and the config panel.
// ════════════════════════════════════════════════════════════════════════

// ── Quatrefoil palette: the single source of metric identity ────────────
const QT={temp:'#1f8a5b',rain:'#2a6fdb',wind:'#6f8f1f',cloud:'#7c5cc4'};
const MET_COLOR=QT;

// ── App-local state ─────────────────────────────────────────────────────
let _typeTmr=null, _lastTypeId=0;
let _suppressTableSync=0, _suppressCarousel=0;
let _tblTmr;
let _glyphRange=null;
let _sgid=0;
let _scrub=null;

// ── Icon set (line icons, currentColor) ─────────────────────────────────
const MI_TEMP='<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/></svg>';
const MI_RAIN='<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none"><path d="M12 2.7c2.9 4 5.3 7 5.3 10A5.3 5.3 0 0 1 12 18a5.3 5.3 0 0 1-5.3-5.3c0-3 2.4-6 5.3-10z"/></svg>';
const MI_WIND='<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10.5a2.5 2.5 0 1 0-2.4-3.2"/><path d="M3 16h7.5a2.5 2.5 0 1 1-2.4 3.2"/><path d="M3 12h15a2.5 2.5 0 1 0-2.4-3.2"/></svg>';
const MI_CLOUD='<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none"><path d="M7 18h10a3.8 3.8 0 0 0 .5-7.6 5.3 5.3 0 0 0-10.2-1.1A3.6 3.6 0 0 0 7 18z"/></svg>';
const MI_SUNUP='<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 18a5 5 0 0 0-10 0"/><line x1="3.5" y1="18" x2="20.5" y2="18"/><line x1="12" y1="3" x2="12" y2="6.5"/><polyline points="9.3 5.3 12 3 14.7 5.3"/></svg>';
const MI_SUNDOWN='<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 18a5 5 0 0 0-10 0"/><line x1="3.5" y1="18" x2="20.5" y2="18"/><line x1="12" y1="6.5" x2="12" y2="3"/><polyline points="9.3 4.2 12 6.5 14.7 4.2"/></svg>';
const MI_EYE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>';
const MI_SCALE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3.5" x2="12" y2="20.5"/><line x1="8.5" y1="20.5" x2="15.5" y2="20.5"/><line x1="5" y1="7" x2="19" y2="7"/><path d="M5 7 2.6 12.4a2.7 2.7 0 0 0 4.8 0z"/><path d="M19 7l-2.4 5.4a2.7 2.7 0 0 0 4.8 0z"/></svg>';
const MI_VERT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="4.5" x2="8" y2="19.5"/><polyline points="5 16.5 8 19.5 11 16.5"/><line x1="16" y1="19.5" x2="16" y2="4.5"/><polyline points="13 7.5 16 4.5 19 7.5"/></svg>';
const MI_CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6.5 9.5 17 4 11.5"/></svg>';
const MI_TREND='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 14.5 21 6.5"/><polyline points="15.5 6.5 21 6.5 21 12"/></svg>';
const MI_BUG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="7" width="8" height="11" rx="4"/><path d="M9.5 7a2.5 2.5 0 0 1 5 0"/><line x1="12" y1="11" x2="12" y2="18"/><line x1="8" y1="11" x2="3.5" y2="9"/><line x1="8" y1="15" x2="4" y2="17"/><line x1="16" y1="11" x2="20.5" y2="9"/><line x1="16" y1="15" x2="20" y2="17"/></svg>';

// ── Boot ────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded',()=>{
  dbg('app.js boot (phase 2)');
  loadPrefs();
  applyDebugVisibility();
  applySectionVisibility();
  initCarouselScroll();
  buildSourcesPanel();
  updateDetailBtn();
  getLocation();
  document.addEventListener('click',(ev)=>{
    const panel=document.getElementById('model-panel');
    if(!panel||!panel.classList.contains('open'))return;
    const drawer=document.getElementById('drawer-overlay');
    if(panel.contains(ev.target))return;
    if(drawer&&drawer.contains(ev.target))return;
    panel.classList.remove('open');
  });
});

// ── Sources / config panel (SVG icons, quatrefoil accents) ──────────────
function buildSourcesPanel(){
  const e=(v)=>v?"enabled":"disabled";
  const ti=(id,cls,icon,fn,lbl,qcls)=>
    `<div class="tog-item">`+
    `<div class="tog-btn ${cls}${qcls?' '+qcls:''}" id="${id}" onclick="${fn}">${icon}</div>`+
    `<span class="tog-label" onclick="${fn}">${lbl}</span></div>`;
  document.getElementById("model-panel").innerHTML=
    `<button class="modal-x panel-x" onclick="toggleSourcesPanel()" aria-label="Close">✕</button>`+
    `<div class="config-row">`+
    `<div class="config-row-label">Show</div>`+
    `<div class="config-icons-row">`+
    ti("tog-temp",e(secVisible.temp),MI_TEMP,"toggleSection('temp',document.getElementById('tog-temp'))","Temp","qt-temp")+
    ti("tog-rain",e(secVisible.rain),MI_RAIN,"toggleSection('rain',document.getElementById('tog-rain'))","Rain","qt-rain")+
    ti("tog-wind",e(secVisible.wind),MI_WIND,"toggleSection('wind',document.getElementById('tog-wind'))","Wind","qt-wind")+
    ti("tog-cloud",e(secVisible.cloud),MI_CLOUD,"toggleSection('cloud',document.getElementById('tog-cloud'))","Cloud","qt-cloud")+
    ti("detail-in-panel",e(showDetail),MI_EYE,"toggleDetail()","Sources")+
    `</div></div>`+
    `<div class="config-row">`+
    `<div class="config-row-label">Options</div>`+
    `<div class="config-icons-row">`+
    ti("tog-weighted",e(useWeightedAvg),MI_SCALE,"toggleWeighting(document.getElementById('tog-weighted'))","Weighted")+
    ti("tog-vert",e(verticalLayout),MI_VERT,"toggleVertical(document.getElementById('tog-vert'))","Vertical")+
    ti("tog-actual",e(showActuals),MI_CHECK,"toggleActuals(document.getElementById('tog-actual'))","Actual")+
    ti("tog-pred",e(showPredLine),MI_TREND,"togglePredLine(document.getElementById('tog-pred'))","Predicted line")+
    ti("tog-debug",e(showDebug),MI_BUG,"toggleDebug(document.getElementById('tog-debug'))","Debug")+
    `</div></div>`+
    `<div class="config-row">`+
    `<div class="config-row-label">Confidence</div>`+
    `<div class="config-icons-row">`+
    ti("conf-temp",e(confVisible.temp),MI_TEMP,"toggleConf('temp')","Temp","qt-temp")+
    ti("conf-rain",e(confVisible.rain),MI_RAIN,"toggleConf('rain')","Rain","qt-rain")+
    ti("conf-wind",e(confVisible.wind),MI_WIND,"toggleConf('wind')","Wind","qt-wind")+
    ti("conf-cloud",e(confVisible.cloud),MI_CLOUD,"toggleConf('cloud')","Cloud","qt-cloud")+
    `</div></div>`+
    `<div class="config-row">`+
    `<div class="config-row-label">Learning window</div>`+
    `<div class="learn-row">`+
    `<select class="learn-select" onchange="setLearnDays(this.value)">`+
    [14,21,35,60,90].map(d=>`<option value="${d}"${learnDays===d?' selected':''}>${d} days</option>`).join('')+
    `</select>`+
    `<span class="learn-hint">Days of history used to score model accuracy (60+ recommended)</span>`+
    `</div></div>`+
    `<div class="config-row">`+
    `<div class="config-row-label">Actual source</div>`+
    `<div class="seg" id="asrc-seg">`+
    [['bom','BOM'],['om','Open-Meteo'],['blend','Blend']].map(([k,l])=>
      `<button class="seg-btn${actualSource===k?' on':''}" data-src="${k}" onclick="setActualSource('${k}')">${l}</button>`).join('')+
    `</div>`+
    `<span class="learn-hint">Which observations feed the Actual rows &amp; the blend weights</span>`+
    `</div>`+
    `<div class="config-row">`+
    `<div class="config-row-label">Weight method</div>`+
    `<div class="seg" id="wmethod-seg">`+
    [['current','Recency'],['daily','Per-day'],['blend','Blend']].map(([k,l])=>
      `<button class="seg-btn${weightMethod===k?' on':''}" data-wm="${k}" onclick="setWeightMethod('${k}')">${l}</button>`).join('')+
    `</div>`+
    `<span class="learn-hint">How model accuracy is scored to set blend weights</span>`+
    `<div class="learn-row" id="wdays-row" style="margin-top:8px">`+
    `<select class="learn-select" onchange="setWeightDays(this.value)">`+
    [1,2,3,4,5,6,7].map(d=>`<option value="${d}"${weightDays===d?' selected':''}>${d} day${d>1?'s':''}</option>`).join('')+
    `</select>`+
    `<span class="learn-hint">Days scored for Per-day / Blend methods (max 7)</span>`+
    `</div>`+
    `</div>`+
    `<div class="config-row">`+
    `<div class="config-row-label">Sources</div>`+
    `<div class="config-icons-row">`+
    MODELS.map(m=>
      `<div class="tog-item">`+
      `<div class="tog-btn enabled" id="toggle-${m.key}" onclick="toggleModel('${m.key}')" title="${m.desc}">`+
      `<span class="mdot" style="background:${m.color}">${m.short}</span></div>`+
      `<span class="tog-label" onclick="toggleModel('${m.key}')">${m.label}</span></div>`
    ).join("")+
    `</div></div>`;
}

function toggleSourcesPanel(){
  document.getElementById('model-panel').classList.toggle('open');
}
function openConfig(){ document.getElementById('model-panel').classList.add('open'); }
function toggleDrawer(){
  const o=document.getElementById('drawer-overlay'), d=document.getElementById('drawer');
  const opening=o.classList.contains('hidden');
  o.classList.toggle('hidden'); requestAnimationFrame(()=>d.classList.toggle('open',opening));
}
function closeDrawer(){
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawer-overlay').classList.add('hidden');
}
function stepDay(delta){
  const dates=carouselDates(); if(!dates.length)return;
  let i=dates.indexOf(selDate); if(i<0)i=dates.indexOf(localTodayStr()); if(i<0)i=0;
  const ni=Math.max(0,Math.min(dates.length-1,i+delta));
  if(dates[ni]!==selDate) setSelectedDay(dates[ni],{behavior:'smooth'});
}
function toggleModel(key){
  if(autoHidden.has(key))return;
  const el=document.getElementById('toggle-'+key);
  if(enabled.has(key)){enabled.delete(key);if(el){el.classList.remove('enabled');el.classList.add('disabled');}}
  else{enabled.add(key);if(el){el.classList.remove('disabled');el.classList.add('enabled');}}
  savePrefs(); _recalcAndRender();
}
function toggleDetail(){
  showDetail=!showDetail; updateDetailBtn();
  ['temp','rain','wind','cloud'].forEach(s=>secDetail[s]=showDetail);
  savePrefs();
  document.querySelectorAll('.src-row').forEach(r=>{
    if(!r.classList.contains('perm-hidden'))r.classList.toggle('src-hidden',!showDetail);
  });
  positionNowOverlay();
}
function updateDetailBtn(){
  const panelBtn=document.getElementById('detail-in-panel');
  if(panelBtn){panelBtn.classList.toggle('enabled',showDetail);panelBtn.classList.toggle('disabled',!showDetail);}
}
function toggleVertical(btn){
  verticalLayout=!verticalLayout;
  if(btn){btn.classList.toggle('enabled',verticalLayout);btn.classList.toggle('disabled',!verticalLayout);}
  savePrefs(); _recalcAndRender();
}
function toggleWeighting(btn){
  useWeightedAvg=!useWeightedAvg;
  if(btn){btn.classList.toggle('enabled',useWeightedAvg);btn.classList.toggle('disabled',!useWeightedAvg);}
  savePrefs(); _recalcAndRender();
}
function toggleActuals(btn){
  showActuals=!showActuals;
  if(btn){btn.classList.toggle('enabled',showActuals);btn.classList.toggle('disabled',!showActuals);}
  savePrefs(); _recalcAndRender();
}
function setActualSource(s){
  if(s!=='bom'&&s!=='om'&&s!=='blend')return;
  if(actualSource===s)return;
  actualSource=s; savePrefs();
  document.querySelectorAll('#asrc-seg .seg-btn').forEach(b=>b.classList.toggle('on',b.dataset.src===s));
  if(actualSources){
    selectActual();
    _recalcAndRender();
  }
}
// Full weight recompute + consistent re-render of every surface.
function _recalcAndRender(){
  if(!Object.keys(state.data).length)return;
  _glyphRange=null;
  applyWeights();
  try{ buildForecastRainCache(); buildHiLoCache(); }catch(e){}
  renderCurrentBar(); renderTable();
  try{ buildSourcesPanel(); }catch(e){}
  try{ if(!document.getElementById('acc-overlay').classList.contains('hidden')) renderAccuracyPanel(); }catch(e){}
}
function setWeightMethod(m){
  if(m!=='current'&&m!=='daily'&&m!=='blend')return;
  if(weightMethod===m)return;
  weightMethod=m; savePrefs();
  document.querySelectorAll('#wmethod-seg .seg-btn').forEach(b=>b.classList.toggle('on',b.dataset.wm===m));
  _recalcAndRender();
}
function setWeightDays(v){
  const d=parseInt(v,10); if(isNaN(d))return;
  weightDays=Math.max(1,Math.min(7,d)); savePrefs();
  if(weightMethod!=='current')_recalcAndRender();
}
function setLearnDays(v){
  const d=parseInt(v,10); if(isNaN(d))return;
  learnDays=Math.max(14,Math.min(90,d));
  savePrefs();
  historicalWeights=null; historicalWeightsByH=null; historicalBiases=null; historicalBiasesByH=null;
  accuracyMeta=null; accuracyStats=null; _horizonCache={};
  dbg('learning window → '+learnDays+' days; refetching weights…');
  syncAndLoadAccuracy().then(()=>{ try{ renderCurrentBar(); renderTable(); }catch(e){} }).catch(e=>dbg('relearn error: '+e.message));
}
function applyDebugVisibility(){
  const p=document.getElementById('debug-panel');
  if(p)p.style.display=showDebug?'flex':'none';
}
function togglePredLine(btn){
  showPredLine=!showPredLine;
  if(btn){btn.classList.toggle('enabled',showPredLine);btn.classList.toggle('disabled',!showPredLine);}
  savePrefs(); _recalcAndRender();
}
function toggleConf(key){
  confVisible[key]=!confVisible[key];
  const btn=document.getElementById('conf-'+key);
  if(btn){btn.classList.toggle('enabled',confVisible[key]);btn.classList.toggle('disabled',!confVisible[key]);}
  savePrefs(); _recalcAndRender();
}
function toggleDebug(btn){
  showDebug=!showDebug;
  if(btn){btn.classList.toggle('enabled',showDebug);btn.classList.toggle('disabled',!showDebug);}
  applyDebugVisibility();
  savePrefs();
}
function toggleSection(sec,btn){
  secVisible[sec]=!secVisible[sec];
  if(btn){
    btn.classList.toggle('enabled', secVisible[sec]);
    btn.classList.toggle('disabled',!secVisible[sec]);
  }
  savePrefs(); _recalcAndRender();
}

// ── Auto-refresh ────────────────────────────────────────────────────────
function scheduleAutoRefresh(){
  if(autoRefreshTimer)clearTimeout(autoRefreshTimer);
  nextRefreshAt=Date.now()+AUTO_MS;
  autoRefreshTimer=setTimeout(refreshWithLocation,AUTO_MS);
}

// ── Location ────────────────────────────────────────────────────────────
async function getLocation(){
  setStatus('spin','Detecting location…');
  const inIframe = (() => { try { return window.self !== window.top; } catch(e){ return true; } })();
  if(inIframe){
    dbg('in iframe — GPS blocked, using saved/manual');
    return fallbackLocation();
  }
  if(!navigator.geolocation){
    dbg('geolocation API unavailable — using saved/manual');
    return fallbackLocation();
  }
  if(navigator.permissions){
    try{
      const perm = await navigator.permissions.query({name:'geolocation'});
      if(perm.state==='denied'){
        dbg('GPS permission denied — using saved/manual');
        return fallbackLocation();
      }
    }catch{}
  }
  dbg('requesting GPS position…');
  navigator.geolocation.getCurrentPosition(
    pos=>{
      state.lat=pos.coords.latitude; state.lon=pos.coords.longitude;
      dbg(`GPS ok: ${state.lat.toFixed(3)}, ${state.lon.toFixed(3)}`);
      reverseGeocode(state.lat,state.lon);
      fetchAllModels();
    },
    err=>{
      dbg('GPS failed ('+(err.message||err.code)+') — using saved/manual');
      fallbackLocation();
    },
    {timeout:10000, maximumAge:600000, enableHighAccuracy:false}
  );
}
function fallbackLocation(){
  const saved = loadSavedLocation();
  if(saved){
    state.lat=saved.lat; state.lon=saved.lon;
    setLocName(saved.name);
    dbg('using saved location: '+saved.name);
    fetchAllModels();
  } else {
    dbg('no saved location — prompting for city');
    showCityPrompt('Enter your city name to get started:');
  }
}
function refreshWithLocation(){
  dbg('--- hourly refresh ---');
  if(manualLocationOverride){ dbg('manual city set this session — skipping GPS re-check'); fetchAllModels(); return; }
  const inIframe = (() => { try { return window.self !== window.top; } catch(e){ return true; } })();
  if(inIframe || !navigator.geolocation){ fetchAllModels(); return; }
  navigator.geolocation.getCurrentPosition(
    pos=>{
      const moved = state.lat==null || Math.abs(pos.coords.latitude-state.lat)>0.02 || Math.abs(pos.coords.longitude-state.lon)>0.02;
      state.lat=pos.coords.latitude; state.lon=pos.coords.longitude;
      if(moved){ dbg('location changed on refresh — updating'); reverseGeocode(state.lat,state.lon); }
      fetchAllModels();
    },
    err=>{ dbg('refresh GPS failed — keeping current location'); fetchAllModels(); },
    {timeout:10000, maximumAge:300000, enableHighAccuracy:false}
  );
}
function loadSavedLocation(){
  try{
    const s=localStorage.getItem('wb_location');
    return s?JSON.parse(s):null;
  }catch{return null;}
}
function savePrefs(){
  try{
    localStorage.setItem('wb_prefs',JSON.stringify({
      showDetail,useWeightedAvg,verticalLayout,showDebug,showActuals,actualSource,learnDays,weightMethod,weightDays,showPredLine,confVisible:{...confVisible},
      secVisible:{...secVisible},
      secDetail:{...secDetail},
      enabled:[...enabled],
      view:state.view,
      sectionsVisible:{...sectionsVisible}
    }));
  }catch(e){}
}
function loadPrefs(){
  try{
    const p=JSON.parse(localStorage.getItem('wb_prefs')||'{}');
    if(p.showDetail!==undefined)showDetail=p.showDetail;
    if(p.useWeightedAvg!==undefined)useWeightedAvg=p.useWeightedAvg;
    if(p.verticalLayout!==undefined)verticalLayout=p.verticalLayout;
    if(p.showDebug!==undefined)showDebug=p.showDebug;
    if(p.showActuals!==undefined)showActuals=p.showActuals;
    if(p.actualSource==='bom'||p.actualSource==='om'||p.actualSource==='blend')actualSource=p.actualSource;
    if(p.weightMethod==='current'||p.weightMethod==='daily'||p.weightMethod==='blend')weightMethod=p.weightMethod;
    if(p.weightDays!==undefined&&p.weightDays>=1&&p.weightDays<=7)weightDays=p.weightDays;
    if(p.learnDays!==undefined&&p.learnDays>=14&&p.learnDays<=90)learnDays=p.learnDays;
    if(p.showPredLine!==undefined)showPredLine=p.showPredLine;
    if(p.confVisible&&typeof p.confVisible==='object')Object.assign(confVisible,p.confVisible);
    else if(p.showConfidence===false)confVisible={temp:false,rain:false,wind:false,cloud:false};
    if(p.secVisible)Object.assign(secVisible,p.secVisible);
    if(p.secDetail)Object.assign(secDetail,p.secDetail);
    if(p.enabled){enabled.clear();p.enabled.forEach(k=>{if(MODELS.find(m=>m.key===k))enabled.add(k);});}
    state.view='1h';
    if(p.sectionsVisible)Object.assign(sectionsVisible,p.sectionsVisible);
  }catch(e){}
}
function saveLocation(lat,lon,name){
  try{localStorage.setItem('wb_location',JSON.stringify({lat,lon,name}));}catch{}
}
function setLocName(full){
  const parts=(full||'').split(',').map(s=>s.trim()).filter(Boolean);
  const city=parts[0]||(full||'');
  const detail=parts.slice(1).join(', ');
  const el=document.getElementById('loc-name'); if(el)el.textContent=city;
  const de=document.getElementById('loc-detail'); if(de)de.textContent=detail;
}
function clearSavedLocation(){
  try{localStorage.removeItem('wb_location');}catch{}
}
async function reverseGeocode(lat,lon){
  try{
    const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
    const d=await r.json();
    const city=d.address?.city||d.address?.town||d.address?.village||d.address?.suburb||'Your Location';
    const cc=d.address?.country_code?.toUpperCase()||'';
    const name=cc?`${city}, ${cc}`:city;
    setLocName(name);
    saveLocation(lat,lon,name);
  }catch{
    const name=`${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
    setLocName(name);
    saveLocation(lat,lon,name);
  }
}
function promptLocation(){
  clearSavedLocation();
  showCityPrompt('Enter city name, or leave blank and allow location access:');
}
function splitCityQuery(v){
  const parts=String(v||'').split(',').map(s=>s.trim()).filter(Boolean);
  return { city: parts[0]||'', region:(parts.slice(1).join(' ')||'').toLowerCase() };
}
const _AU_STATE={nsw:'new south wales',vic:'victoria',qld:'queensland',wa:'western australia',sa:'south australia',tas:'tasmania',act:'australian capital territory',nt:'northern territory'};

function cityTypeahead(v){
  clearTimeout(_typeTmr);
  const box=document.getElementById('city-results');
  const {city,region}=splitCityQuery(v);
  if(city.length<2){ if(box)box.innerHTML=''; return; }
  _typeTmr=setTimeout(async()=>{
    const myId=++_lastTypeId;
    try{
      const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=25&language=en&format=json`,{signal:AbortSignal.timeout(8000)});
      const d=await r.json();
      if(myId!==_lastTypeId)return;
      renderCityResults(d.results||[], region);
    }catch(e){ /* ignore transient */ }
  },220);
}
function _haversine(la1,lo1,la2,lo2){
  const R=6371,d=x=>x*Math.PI/180;
  const a=Math.sin(d(la2-la1)/2)**2+Math.cos(d(la1))*Math.cos(d(la2))*Math.sin(d(lo2-lo1)/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function renderCityResults(results, region){
  const box=document.getElementById('city-results'); if(!box)return;
  if(!results.length){ box.innerHTML='<div class="city-empty">No matches — try a different spelling.</div>'; return; }
  const want = _AU_STATE[region] || region;
  const haveLoc = state.lat!=null && state.lon!=null;
  const dist=r=> haveLoc ? _haversine(state.lat,state.lon,r.latitude,r.longitude) : 0;
  const regionMatch=r=>{ if(!want)return 0; const a=(r.admin1||'').toLowerCase(), cc=(r.country_code||'').toLowerCase();
    return (a===want||a.includes(want)||want.includes(a)||cc===want) ? 0 : 1; };
  const sorted=results.slice().sort((a,b)=> (regionMatch(a)-regionMatch(b)) || (dist(a)-dist(b)));
  box.innerHTML=sorted.map(r=>{
    const km=haveLoc?_haversine(state.lat,state.lon,r.latitude,r.longitude):null;
    const far=km!=null?(km<100?Math.round(km)+' km':Math.round(km/10)*10+' km'):'';
    const bits=[r.admin1,r.country].filter(Boolean).join(', ');
    const nm=(r.name||'').replace(/"/g,'&quot;');
    return `<button class="city-opt" onclick="pickCity(${r.latitude},${r.longitude},'${nm.replace(/'/g,"\\'")}','${(r.admin1||'').replace(/'/g,"\\'")}','${(r.country_code||'')}')">
      <span class="city-opt-name">${r.name}</span><span class="city-opt-sub">${bits}${far?' · '+far:''}</span></button>`;
  }).join('');
}
function pickCity(lat,lon,name,admin1,cc){
  state.lat=lat; state.lon=lon;
  const parts=[name]; if(admin1)parts.push(admin1); if(cc)parts.push(cc);
  const locName=parts.join(', ');
  setLocName(locName);
  saveLocation(lat,lon,locName);
  manualLocationOverride=true;
  hideCityPrompt();
  dbg('city picked: '+locName);
  fetchAllModels();
}
async function geocodeCity(name){
  setStatus('spin',`Searching "${name}"…`);
  const {city,region}=splitCityQuery(name);
  try{
    const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city||name)}&count=25&language=en&format=json`);
    const d=await r.json();
    if(!d.results||!d.results.length){showCityPrompt('City not found. Try typing just the town name:');return;}
    const want=_AU_STATE[region]||region;
    let result=d.results[0];
    if(want){ const hit=d.results.find(x=>{const a=(x.admin1||'').toLowerCase(),cc=(x.country_code||'').toLowerCase();return a===want||a.includes(want)||want.includes(a)||cc===want;}); if(hit)result=hit; }
    pickCity(result.latitude,result.longitude,result.name,result.admin1,result.country_code);
  }catch(e){
    console.warn('Geocode failed:',e);
    showCityPrompt('Search failed. Check connection and try again:');
  }
}

// ── Words, synopses, compass ────────────────────────────────────────────
function tempWord(t){if(t==null)return'';return t<0?'Freezing':t<8?'Cold':t<16?'Cool':t<24?'Mild':t<30?'Warm':'Hot';}
function tempDaySynopsis(hi,lo){
  if(hi==null)return '';
  const day=tempWord(hi);
  let s=`${day} day`;
  if(lo!=null){const night=tempWord(lo).toLowerCase();if(night!==day.toLowerCase())s+=`, ${night} overnight`;}
  return s;
}
function rainSynopsis(expected,actual){
  if(expected<0.2)return'Dry day expected';
  if(expected<2)return'Slight chance of rain';
  if(expected<8)return'Light rain likely';
  if(expected<20)return'Showers expected';
  return'Heavy rain expected';
}
function cloudSynopsis(c){
  if(c==null)return'';
  if(c<12)return'Clear skies';
  if(c<40)return'Mostly clear';
  if(c<70)return'Partly cloudy';
  if(c<90)return'Cloudy';
  return'Overcast';
}
function dirArrow16(deg){
  const arrows=['↑','↗','↗','→','→','↘','↘','↓','↓','↙','↙','←','←','↖','↖','↑'];
  return arrows[Math.round(((deg%360)+360)%360/22.5)%16];
}
function dirFull(deg){
  const d=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return d[Math.round(((deg%360)+360)%360/22.5)%16];
}
function windWord(v){if(!v||v<10)return'Calm';if(v<20)return'Light';if(v<35)return'Moderate';if(v<55)return'Strong';if(v<75)return'Very strong';return'Storm';}
function wxDesc(c,isDay){
  if(c==null)return'Unknown';if(c===0)return isDay?'Clear sky':'Clear night';
  if(c<=2)return'Partly cloudy';if(c<=3)return'Overcast';if(c<=10)return'Haze';
  if(c<=20)return'Fog';if(c<=29)return'Drizzle';if(c<=39)return'Freezing drizzle';
  if(c<=55)return'Drizzle';if(c<=65)return'Rain';if(c<=67)return'Freezing rain';
  if(c<=77)return'Snow';if(c<=82)return'Rain showers';if(c<=86)return'Snow showers';
  if(c<=99)return'Thunderstorm';return'Unknown';
}

// ── Sunrise / sunset ────────────────────────────────────────────────────
function getSunTimes(dateStr){
  const s=state.ss;if(!s.loaded||!s.dates)return null;
  const di=s.dates.indexOf(dateStr);if(di<0)return null;
  return{riseMs:new Date(s.rise[di]).getTime(),setMs:new Date(s.set[di]).getTime()};
}
function isDay(tsMs,dateStr){
  const s=getSunTimes(dateStr);if(!s)return true;
  return tsMs>=s.riseMs&&tsMs<s.setMs;
}
function isDayStart(iso,prevIso){return prevIso&&iso.slice(0,10)!==prevIso.slice(0,10);}
function isNightAt(iso){ return !isDay(new Date(iso).getTime(), iso.slice(0,10)); }
function sunPhaseAt(iso){
  const t=new Date(iso).getTime();
  const s=getSunTimes(iso.slice(0,10));
  if(!s)return isNightAt(iso)?'night':'day';
  const HR=3600000;
  if(s.riseMs>=t && s.riseMs<t+HR)return 'dawn';
  if(s.setMs>=t && s.setMs<t+HR)return 'dusk';
  return (t>=s.riseMs && t<s.setMs)?'day':'night';
}

// ── The WeatherBlend glyph ──────────────────────────────────────────────
function tempColor(t){
  if(t==null)return 'var(--text-primary)';
  if(t<6)return '#a29e93'; if(t<13)return '#847f73'; if(t<20)return '#4d4a43';
  if(t<27)return '#2e2b25'; if(t<33)return '#1c1a15'; return '#141311';
}
function _clamp01(x){return Math.max(0,Math.min(1,x));}
function glyphRange(){
  if(_glyphRange)return _glyphRange;
  const models=activeEnabled();
  let tlo=Infinity,thi=-Infinity,whi=-Infinity,rmax=0;
  models.forEach(m=>{
    const D=state.data[m.key]?.daily;
    if(D){
      (D.temperature_2m_max||[]).forEach(v=>{if(v!=null&&!isNaN(v))thi=Math.max(thi,v);});
      (D.temperature_2m_min||[]).forEach(v=>{if(v!=null&&!isNaN(v))tlo=Math.min(tlo,v);});
      (D.windspeed_10m_max||[]).forEach(v=>{if(v!=null&&!isNaN(v))whi=Math.max(whi,v);});
    }
    const H=state.data[m.key]?.hourly;
    if(H&&H.precipitation)H.precipitation.forEach(v=>{if(v!=null&&!isNaN(v))rmax=Math.max(rmax,v);});
  });
  if(!isFinite(thi))thi=30; if(!isFinite(tlo))tlo=0;
  if(thi-tlo<6)thi=tlo+6;
  if(!isFinite(whi)||whi<10)whi=40;
  rmax=Math.max(4,rmax);
  _glyphRange={tlo,thi,wlo:0,whi,rmax};
  return _glyphRange;
}
function weatherGlyph(temp,rain,wind,cloud){
  const rg=glyphRange();
  const nm=(v,lo,hi)=>(v==null||hi<=lo)?0:_clamp01((v-lo)/(hi-lo));
  const tS=nm(temp,rg.tlo,rg.thi), wS=nm(wind,rg.wlo,rg.whi);
  const rS=_clamp01(Math.log1p(Math.max(0,rain||0))/Math.log1p(rg.rmax));
  const cS=_clamp01((cloud||0)/100);
  const vis={temp:true, rain:(rain||0)>=0.05, wind:(wind||0)>=10, cloud:(cloud||0)>=10};
  const str={temp:tS,rain:rS,wind:wS,cloud:cS};
  let strong=null,sv=0.6; Object.keys(str).forEach(k=>{ if(vis[k]&&str[k]>sv){sv=str[k];strong=k;} });
  const R=s=>(7+s*6).toFixed(1), O=s=>(0.34+s*0.6).toFixed(2);
  const COL=QT;
  const POS={temp:[32,20],rain:[44,32],wind:[20,32],cloud:[32,44]};
  const DLY={temp:0,rain:.55,wind:1.1,cloud:1.65};
  const glow=k=> strong===k?`filter:drop-shadow(0 0 3px ${COL[k]});`:'';
  const C=k=> vis[k]
    ? `<circle class="wbc" style="animation-delay:${DLY[k]}s;${glow(k)}" cx="${POS[k][0]}" cy="${POS[k][1]}" r="${R(str[k])}" fill="${COL[k]}" opacity="${O(str[k])}"/>`
    : '';
  const svg=`<svg class="wb-orb" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><g class="wbo">${C('wind')}${C('temp')}${C('rain')}${C('cloud')}</g></svg>`;
  return `<div class="cc-now-icon cc-orb-glyph">${svg}</div>`;
}

// ── Cards ───────────────────────────────────────────────────────────────
const _ccBox=(cls,title,color,body)=>
  `<div class="cc-box ${cls}"><div class="cc-title" style="color:${color}">${title}</div>${body}</div>`;
function _confInline(dateStr,key){ if(!confVisible[key]||!dateStr)return ''; const c=confDayMetric(dateStr,key); return c==null?'':`<span class="cc-mc" style="color:${MET_COLOR[key]}">${c}%</span>`; }
const _T=(v,suf='°')=>v!=null?tempDisp(v)+suf:'—';

function buildTodayBoxes(){
  const comp=computeCurrentFromHourly();
  const c=cachedCurrent?.c;
  const temp=comp?.temp??c?.temperature_2m, feels=c?.apparent_temperature;
  const wind=comp?.wind??c?.windspeed_10m, windDir=comp?.windDir??c?.winddirection_10m;
  const wcode=comp?.wcode??c?.weathercode;
  const hi=comp?.hi??cachedHiLo?.hi, lo=comp?.lo??cachedHiLo?.lo;
  const rainToday=comp?.rainToday??0, actualRain=comp?.actualRainToday;
  const cloud=comp?.cloud, windHi=comp?.windHi, windLo=comp?.windLo, cloudHi=comp?.cloudHi, cloudLo=comp?.cloudLo;
  const _p=x=>String(x).padStart(2,'0');const _now=locNowDate();
  const curIso=`${_now.getFullYear()}-${_p(_now.getMonth()+1)}-${_p(_now.getDate())}T${_p(_now.getHours())}:00`;
  const phase=sunPhaseAt(curIso);
  const night=getSunTimes(curIso.slice(0,10))?(phase==='night'):(c?(c.is_day===0):isNightAt(curIso));
  const arrow=dirArrow16(windDir??0), dir=dirFull(windDir??0);

  const cond=condCard({today:true, dateStr:localTodayStr(), icon:wxIcon(wcode,night,phase), condWord:wxDesc(wcode,!night),
    temp, feels, hi, lo, rain:rainToday, restOfDay:comp?.rainRemainToday, actualRain, wind, dir, cloud, code:wcode, night});
  const dot=on=>on?'<span class="obs-dot" title="BOM observation">●</span>':'';
  const _cdt=localTodayStr();
  const t=_ccBox('cc-mt','Temp',QT.temp,`<div class="cc-main">${_T(temp)}${dot(comp?.obsTemp)}${_confInline(_cdt,'temp')}</div><div class="cc-sub">Feels ${_T(feels)}</div><div class="cc-sub">↑ ${_T(hi)}　↓ ${_T(lo)}</div>`);
  const rainRemain=comp?.rainRemainToday??Math.max(0,rainToday-(actualRain||0));
  let rainBody;
  if(actualRain!=null){
    const totDisp=(actualRain+(rainRemain||0)).toFixed(1), aDisp=actualRain.toFixed(1);
    const restDisp=Math.max(0,parseFloat(totDisp)-parseFloat(aDisp)).toFixed(1);
    rainBody=`<div class="cc-main">${totDisp} mm${_confInline(_cdt,'rain')}</div><div class="cc-sub">Actual ${aDisp} mm</div><div class="cc-sub">Rest of day ${restDisp} mm</div>`;
  }else{
    rainBody=`<div class="cc-main">${rainToday.toFixed(1)} mm${_confInline(_cdt,'rain')}</div><div class="cc-sub">Day total</div><div class="cc-sub">${rainToday<0.2?'Dry day expected':'Expected today'}</div>`;
  }
  const r=_ccBox('cc-mr','Rain',QT.rain,rainBody);
  const w=_ccBox('cc-mw','Wind',QT.wind,`<div class="cc-main">${wind!=null?Math.round(wind)+' km/h':'—'}${dot(comp?.obsWind)}${_confInline(_cdt,'wind')}</div><div class="cc-sub">${arrow} ${dir}</div><div class="cc-sub">↑ ${windHi!=null?Math.round(windHi):'—'}　↓ ${windLo!=null?Math.round(windLo):'—'} km/h</div>`);
  const cl=_ccBox('cc-mc2','Cloud',QT.cloud,`<div class="cc-main">${cloud!=null?Math.round(cloud)+'%':'—'}${dot(comp?.obsCloud)}${_confInline(_cdt,'cloud')}</div><div class="cc-sub">↑ ${cloudHi!=null?Math.round(cloudHi):'—'}%　↓ ${cloudLo!=null?Math.round(cloudLo):'—'}%</div><div class="cc-sub">${cloudSynopsis(cloud)}</div>`);
  return cond+(secVisible.temp?t:'')+(secVisible.rain?r:'')+(secVisible.wind?w:'')+(secVisible.cloud?cl:'');
}

function buildDayBoxes(dateStr){
  const s=computeDaySummary(dateStr);
  if(!s)return '';
  const past=s.isPast;
  const arrow=s.windDir!=null?dirArrow16(s.windDir):'', dir=s.windDir!=null?dirFull(s.windDir):'';
  const cond=condCard({today:false, dateStr, icon:wxIcon(s.dayCode,false), condWord:wxDesc(s.dayCode,true),
    hi:s.hi, lo:s.lo, aHi:s.aTHi, aLo:s.aTLo, aHasT:s.aHasT, rain:s.rain, actualRain:s.actualRain,
    windHi:s.windHi, windLo:s.windLo, aWHi:s.aWHi, aWLo:s.aWLo, aHasW:s.aHasW, dir,
    cloudHi:s.cloudHi, cloudLo:s.cloudLo, aCHi:s.aCHi, aCLo:s.aCLo, aHasC:s.aHasC,
    cloud:s.cloudMean, code:s.dayCode, past});

  const HL2=(hi,lo,u)=>`<span class="cc-hlw"><span class="cc-ar">↑</span>${hi!=null?Math.round(hi)+u:'—'}<span class="cc-ar cc-ar2">↓</span>${lo!=null?Math.round(lo)+u:'—'}</span>`;

  const tActual = past && s.aHasT;
  const tBody = past
    ? `<div class="cc-main">${HL2(tActual?s.aTHi:s.hi, tActual?s.aTLo:s.lo,'°')}</div>`+
      `<div class="cc-sub">${tActual?'Forecast '+HL2(s.hi,s.lo,'°'):tempDaySynopsis(s.hi,s.lo)}</div>`
    : `<div class="cc-main">${HL2(s.hi,s.lo,'°')}${_confInline(dateStr,'temp')}</div>`+
      `<div class="cc-sub">${tempDaySynopsis(s.hi,s.lo)}</div>`;
  const t=_ccBox('cc-mt','Temp',QT.temp,tBody);

  const rActual = past && s.actualRain!=null;
  const rBody = past
    ? `<div class="cc-main">${(rActual?s.actualRain:s.rain).toFixed(1)} mm</div>`+
      `<div class="cc-sub">${rActual?'Forecast '+s.rain.toFixed(1)+' mm':rainSynopsis(s.rain,null)}</div>`
    : `<div class="cc-main">${s.rain.toFixed(1)} mm${_confInline(dateStr,'rain')}</div>`+
      `<div class="cc-sub">${rainSynopsis(s.rain,null)}</div>`;
  const r=_ccBox('cc-mr','Rain',QT.rain,rBody);

  const wActual = past && s.aHasW;
  const wBody = past
    ? `<div class="cc-main">${HL2(wActual?s.aWHi:s.windHi, wActual?s.aWLo:s.windLo,'')}<span class="cc-unit">km/h</span></div>`+
      `<div class="cc-sub">${wActual?'Forecast '+HL2(s.windHi,s.windLo,'')+' km/h':(dir?dir+' · ':'')+windWord(s.windHi||0)}</div>`
    : `<div class="cc-main">${HL2(s.windHi,s.windLo,'')}<span class="cc-unit">km/h</span>${_confInline(dateStr,'wind')}</div>`+
      `<div class="cc-sub">${(arrow?arrow+' ':'')}${dir||'—'} · ${windWord(s.windHi||0)}</div>`;
  const w=_ccBox('cc-mw','Wind',QT.wind,wBody);

  const cActual = past && s.aHasC;
  const cBody = past
    ? `<div class="cc-main">${HL2(cActual?s.aCHi:s.cloudHi, cActual?s.aCLo:s.cloudLo,'%')}</div>`+
      `<div class="cc-sub">${cActual?'Forecast '+HL2(s.cloudHi,s.cloudLo,'%'):cloudSynopsis(s.cloudMean)}</div>`
    : `<div class="cc-main">${HL2(s.cloudHi,s.cloudLo,'%')}${_confInline(dateStr,'cloud')}</div>`+
      `<div class="cc-sub">${cloudSynopsis(s.cloudMean)}</div>`;
  const cl=_ccBox('cc-mc2','Cloud',QT.cloud,cBody);

  return cond+(secVisible.temp?t:'')+(secVisible.rain?r:'')+(secVisible.wind?w:'')+(secVisible.cloud?cl:'');
}

function condCard(o){
  const isT=o.today, past=!isT&&o.past;
  let big='', sub2='';
  if(isT){
    big=`<div class="cc-now-big" style="color:${tempColor(o.temp)}">${o.temp!=null?tempDisp(o.temp)+'°':'—'}</div>`;
    sub2=o.feels!=null?`Feels like ${tempDisp(o.feels)}°`:'';
  }else{
    const useAct=past&&o.aHasT;
    const hi=useAct?o.aHi:o.hi, lo=useAct?o.aLo:o.lo;
    big=`<div class="cc-now-big" style="color:${tempColor(hi)}">${hi!=null?Math.round(hi)+'°':'—'}${lo!=null?`<span class="cc-now-lo">${Math.round(lo)}°</span>`:''}</div>`;
  }
  const HLs=(hi,lo,u)=>`<span class="cc-ar">↑</span>${hi!=null?Math.round(hi)+u:'—'}<span class="cc-ar cc-ar2">↓</span>${lo!=null?Math.round(lo)+u:'—'}`;
  const rainV=isT?o.rain:((past&&o.actualRain!=null)?o.actualRain:o.rain);
  const wHi=(past&&o.aHasW)?o.aWHi:o.windHi, wLo=(past&&o.aHasW)?o.aWLo:o.windLo;
  const cHi=(past&&o.aHasC)?o.aCHi:o.cloudHi, cLo=(past&&o.aHasC)?o.aCLo:o.cloudLo;
  const sideRows=[];
  const _confSub=(key,col)=>{ if(!confVisible[key]||!o.dateStr)return ''; const c=confDayMetric(o.dateStr,key); return c==null?'':`<div class="cc-now-confsub" style="color:${col}">${c}% confidence</div>`; };
  if(secVisible.rain){
    sideRows.push(`<div class="cc-now-sub cc-now-rainfig" style="color:${QT.rain}"><span class="cns-i">${MI_RAIN}</span>${rainV!=null?rainV.toFixed(1)+' mm':'—'}</div>${_confSub('rain',QT.rain)}`);
  }
  if(secVisible.wind){
    const w=isT?`${o.wind!=null?Math.round(o.wind)+' km/h':'—'}${o.dir?' '+o.dir:''}`:`${HLs(wHi,wLo,'')}<span class="cns-u"> km/h</span>`;
    sideRows.push(`<div class="cc-now-sub" style="color:${QT.wind}"><span class="cns-i">${MI_WIND}</span>${w}</div>${_confSub('wind',QT.wind)}`);
  }
  if(secVisible.cloud){
    const c=isT?`${o.cloud!=null?Math.round(o.cloud)+'%':'—'}`:`${HLs(cHi,cLo,'%')}`;
    sideRows.push(`<div class="cc-now-sub" style="color:${QT.cloud}"><span class="cns-i">${MI_CLOUD}</span>${c}</div>${_confSub('cloud',QT.cloud)}`);
  }
  const side=sideRows.length?`<div class="cc-now-side">${sideRows.join('')}</div>`:'';
  const tempBlock=secVisible.temp?`<div class="cc-now-temp">${big}${sub2?`<div class="cc-now-feels">${sub2}</div>`:''}${_confSub('temp',QT.temp)}</div>`:'';
  const gT=isT?o.temp:((o.hi!=null&&o.lo!=null)?(o.hi+o.lo)/2:o.hi);
  const gWind=isT?o.wind:o.windHi;
  const iconHTML=weatherGlyph(gT, o.rain, gWind, o.cloud);
  let dateHead='';
  if(o.dateStr){
    const _dd=new Date(o.dateStr+'T12:00:00');
    const _wk=_dd.toLocaleDateString('en-AU',{weekday:'long'});
    const _mo=_dd.toLocaleDateString('en-AU',{month:'long'});
    const _rel=relDayLabel(o.dateStr,localTodayStr());
    const _chev=(d,lbl,pts)=>`<button class="cdh-nav" onclick="stepDay(${d})" aria-label="${lbl}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="${pts}"/></svg></button>`;
    dateHead=`<div class="cc-datehead">
      ${_chev(-1,'Previous day','15 5 8 12 15 19')}
      <button class="cdh-when" onclick="goToToday()" title="Jump to today">
        <span class="cdh-rel">${_rel}</span>
        <span class="cdh-date">${_wk} ${_dd.getDate()} ${_mo}</span>
      </button>
      ${_chev(1,'Next day','9 5 16 12 9 19')}
    </div>`;
  }
  return `<div class="cc-box cc-cond cc-now${isT?'':' not-today'}">
    ${dateHead}
    <div class="cc-now-main">
      ${iconHTML}
      ${tempBlock}
      ${side}
    </div>
    ${o.dateStr?nowChartHTML(o.dateStr):''}
  </div>`;
}

// ── HERO sparklines ─────────────────────────────────────────────────────
function _rampTemp(v){return v<5?'#a29e93':v<12?'#847f73':v<22?'#5c584f':v<30?'#332f28':'#141311';}
function _rampRain(v){return v<0.05?'#c8c3b6':v<0.2?'#a29e93':v<0.5?'#847f73':v<1?'#5c584f':v<2?'#332f28':'#141311';}
function _rampWind(v){return v<10?'#a29e93':v<20?'#847f73':v<35?'#5c584f':v<55?'#332f28':'#141311';}
function _rampCloud(v){return v<12?'#c8c3b6':v<40?'#a29e93':v<70?'#77736a':'#4d4a43';}
function _scaleOf(vals,zeroBase){
  const v=vals.filter(x=>x!=null&&!isNaN(x));
  if(!v.length)return {mn:0,mx:1};
  let mn=Math.min(...v),mx=Math.max(...v);
  if(zeroBase)mn=0;
  if(mn===mx){ if(zeroBase)mx=mn+1; else {mn-=1;mx+=1;} }
  return {mn,mx};
}
function _dayHourPoints(dateStr){
  const ref=refHourly(); if(!ref||!ref.time)return null;
  const idxs=[]; ref.time.forEach((t,i)=>{ if(t.slice(0,10)===dateStr) idxs.push(i); });
  if(idxs.length<2)return null;
  const hz=horizonOf(dateStr), now=locNowMs();
  const fval=(field,i)=>wBlendAt(field,i,hz);
  const val=(field,i)=>{
    const t=ref.time[i];
    if(new Date(t).getTime()<=now && actualData && actualData.hourly && actualData.hourly.time){
      const ai=actualData.hourly.time.indexOf(t);
      if(ai>=0){ const av=actualData.hourly[field]?.[ai]; if(av!=null) return av; }
    }
    return fval(field,i);
  };
  const temp =idxs.map(i=>val('temperature_2m',i)),  tempF =idxs.map(i=>fval('temperature_2m',i));
  const rain =idxs.map(i=>_rcell(val('precipitation',i))), rainF=idxs.map(i=>_rcell(fval('precipitation',i)));
  const wind =idxs.map(i=>val('windspeed_10m',i)),   windF =idxs.map(i=>fval('windspeed_10m',i));
  const cloud=idxs.map(i=>val('cloudcover',i)),       cloudF=idxs.map(i=>fval('cloudcover',i));
  const times=idxs.map(i=>ref.time[i]);
  const N=times.length-1;
  const ticks=[];
  const _day0=new Date(times[0]).getTime(), _dayN=new Date(times[N]).getTime(), _span=_dayN-_day0;
  const st=getSunTimes(dateStr);
  const _hm=ms=>{const d=new Date(ms);let h=d.getHours(),m=d.getMinutes();const ap=h<12?'a':'p';h=h%12||12;return `${h}:${String(m).padStart(2,'0')}${ap}`;};
  if(st && _span>0){
    const rf=(st.riseMs-_day0)/_span, sf=(st.setMs-_day0)/_span;
    if(rf>=0&&rf<=1) ticks.push({frac:rf,kind:'rise',time:_hm(st.riseMs)});
    if(sf>=0&&sf<=1) ticks.push({frac:sf,kind:'set', time:_hm(st.setMs)});
  }
  let nowFrac=null;
  if(dateStr===localTodayStr()){
    let last=-1;
    times.forEach((t,k)=>{ if(new Date(t).getTime()<=now) last=k; });
    if(last<0) nowFrac=0;
    else if(last>=times.length-1) nowFrac=1;
    else{ const a=new Date(times[last]).getTime(), b=new Date(times[last+1]).getTime();
      nowFrac=(last+Math.min(1,Math.max(0,(now-a)/(b-a))))/N; }
  }
  return {temp,tempF,rain,rainF,wind,windF,cloud,cloudF,times,ticks,nowFrac,n:idxs.length};
}
function _sparkline(vals,o){
  const W=240,H=44,padX=2,padT=6,padB=5,n=vals.length;
  const av=vals.filter(v=>v!=null&&!isNaN(v));
  if(!av.length)return '<div class="spark"></div>';
  const sc=o.scale||_scaleOf(vals,o.zeroBase); let mn=sc.mn,mx=sc.mx;
  const X=i=> padX + (n>1? i*(W-2*padX)/(n-1):0);
  const Y=v=> v==null?null : (H-padB) - (Math.max(mn,Math.min(mx,v))-mn)/(mx-mn)*(H-padT-padB);
  const pts=vals.map((v,i)=> v==null?null:[X(i),Y(v)]);
  const path=arr=>{let d='',on=false;arr.forEach(p=>{if(!p){on=false;return;}d+=(on?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)+' ';on=true;});return d.trim();};
  const cut=(o.split==null?1:o.split)*(W-2*padX)+padX;
  const solid=pts.map(p=> p&&p[0]<=cut+0.6?p:null);
  const dash =(o.split!=null&&o.split<1)?pts.map(p=> p&&p[0]>=cut-0.6?p:null):null;
  const firstX=pts.find(p=>p)[0], area=path(pts)+` L ${X(n-1).toFixed(1)} ${H-padB} L ${firstX.toFixed(1)} ${H-padB} Z`;
  const stops=vals.map((v,i)=> v==null?null:`<stop offset="${(n>1?i/(n-1):0)*100}%" stop-color="${o.ramp(v)}" stop-opacity="0.45"/>`).filter(Boolean).join('');
  const grid=(o.ticks||[]).map(t=>{const gx=(t.frac*(W-2*padX)+padX).toFixed(1);return `<line x1="${gx}" y1="${padT-2}" x2="${gx}" y2="${H-padB+1}" stroke="#141311" stroke-width="1" opacity="0.18" stroke-dasharray="1.5 2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;}).join('');
  let predLine='';
  if(o.showPred && o.fc && o.fc.length===n){
    const fcPts=o.fc.map((v,i)=> (v==null||X(i)>cut+0.6)?null:[X(i),Y(v)]);
    const dpred=path(fcPts);
    if(dpred) predLine=`<path d="${dpred}" fill="none" stroke="${o.color}" stroke-width="1.2" stroke-dasharray="1.5 2.5" opacity="0.6" vector-effect="non-scaling-stroke"/>`;
  }
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" height="${H}">
    <defs><linearGradient id="${o.gid}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs>
    ${grid}
    <path d="${area}" fill="url(#${o.gid})"/>
    ${predLine}
    ${path(solid)?`<path d="${path(solid)}" fill="none" stroke="${o.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`:''}
    ${dash&&path(dash)?`<path d="${path(dash)}" fill="none" stroke="${o.color}" stroke-width="2" stroke-dasharray="3 3" stroke-linejoin="round" stroke-linecap="round" opacity="0.85" vector-effect="non-scaling-stroke"/>`:''}
  </svg>`;
}
function nowChartHTML(dateStr){
  const p=_dayHourPoints(dateStr); if(!p)return '';
  const today=localTodayStr(), isToday=dateStr===today, isPast=dateStr<today;
  const split=isToday?(p.nowFrac??1):(isPast?1:0);
  const now=isToday?p.nowFrac:null;
  const g=_sgid++;
  const rows=[
    {k:'temp', ic:MI_TEMP,c:QT.temp,vals:p.temp,fc:p.tempF,ramp:_rampTemp,gid:'sgT'+g,fmt:v=>Math.round(v)+'°'},
    {k:'rain', ic:MI_RAIN,c:QT.rain,vals:p.rain,fc:p.rainF,ramp:_rampRain,gid:'sgR'+g,zero:true,fmt:v=>(v>=10?Math.round(v):v.toFixed(1))},
    {k:'wind', ic:MI_WIND,c:QT.wind,vals:p.wind,fc:p.windF,ramp:_rampWind,gid:'sgW'+g,zero:true,fmt:v=>Math.round(v)},
    {k:'cloud',ic:MI_CLOUD,c:QT.cloud,vals:p.cloud,fc:p.cloudF,ramp:_rampCloud,gid:'sgC'+g,fmt:v=>Math.round(v)+'%'}
  ].filter(r=>secVisible[r.k]);
  if(!rows.length)return '';
  const body=rows.map(r=>{
    const sc=_scaleOf(showPredLine&&r.fc?r.vals.concat(r.fc):r.vals,r.zero);
    const spark=_sparkline(r.vals,{color:r.c,ramp:r.ramp,zeroBase:r.zero,scale:sc,ticks:p.ticks,split,gid:r.gid,fc:r.fc,showPred:showPredLine});
    return `<div class="nc-row"><span class="nc-ico" style="color:${r.c}">${r.ic}</span><div class="nc-spark">${spark}</div><div class="nc-hl"><span>${r.fmt(sc.mx)}</span><span>${r.fmt(sc.mn)}</span></div></div>`;
  }).join('');
  // Axis: sunrise/sunset markers + fixed hour labels (skipping any that would
  // collide with a sun marker)
  const N=p.times.length-1;
  const hourTicks=[6,12,18].map(h=>{
    const idx=p.times.findIndex(t=>new Date(t).getHours()===h);
    if(idx<0)return null;
    return {frac:idx/N,label:h===12?'12pm':(h<12?h+'am':(h-12)+'pm')};
  }).filter(Boolean).filter(ht=>!(p.ticks||[]).some(st=>Math.abs(st.frac-ht.frac)<0.1));
  const axisLabels=(p.ticks||[]).map(t=>{
    const al=t.frac<0.06?'left:0;transform:none':t.frac>0.94?'right:0;left:auto;transform:none':`left:${(t.frac*100).toFixed(1)}%;transform:translateX(-50%)`;
    const ic=t.kind==='set'?MI_SUNDOWN:MI_SUNUP;
    return `<span class="nc-sun" style="${al}">${ic}<span>${t.time}</span></span>`;
  }).join('')+hourTicks.map(ht=>`<span class="nc-hr" style="left:${(ht.frac*100).toFixed(1)}%">${ht.label}</span>`).join('');
  const axis=`<div class="nc-axis"><span class="nc-ico"></span><div class="nc-axis-track">${axisLabels}</div><span class="nc-hl"></span></div>`;
  const legend=`<div class="nc-legend"><span><i class="ncl-line"></i>Observed</span><span><i class="ncl-dash"></i>Forecast</span>${showPredLine?`<span><i class="ncl-pred"></i>Predicted</span>`:''}</div>`;
  let cursor='';
  if(isToday && now!=null){
    cursor=`<div class="nc-cursor" style="left:${_curFrac(now)}"><span class="nc-cursor-time">${locNowLabel()}</span></div>`;
  }
  const scrubAttr=isToday?` data-scrub="1" data-date="${dateStr}"`:'';
  return `<div class="now-chart"><div class="nc-rows${isToday?' nc-scrubbable':''}"${scrubAttr}>${body}${cursor}</div>${axis}${legend}</div>`;
}
function _curFrac(frac){ const cf=(2+frac*236)/240; return `calc(28px + (100% - 68px) * ${cf})`; }

// ── Scrubbing (today) — now with the time bubble live ───────────────────
function _scrubIcon(p,idx){
  return weatherGlyph(p.temp[idx],p.rain[idx],p.wind[idx],p.cloud[idx]);
}
function _scrubMainHTML(d){
  const big=`<div class="cc-now-big" style="color:${tempColor(d.temp)}">${d.temp!=null?tempDisp(d.temp)+'°':'—'}</div>`;
  const tempBlock=secVisible.temp?`<div class="cc-now-temp">${big}<div class="cc-now-feels">${d.timeLabel}</div></div>`:'';
  const rws=[];
  if(secVisible.rain) rws.push(`<div class="cc-now-sub cc-now-rainfig" style="color:${QT.rain}"><span class="cns-i">${MI_RAIN}</span>${d.rain!=null?d.rain.toFixed(1)+' mm':'—'}</div>`);
  if(secVisible.wind) rws.push(`<div class="cc-now-sub" style="color:${QT.wind}"><span class="cns-i">${MI_WIND}</span>${d.wind!=null?Math.round(d.wind)+' km/h':'—'}</div>`);
  if(secVisible.cloud) rws.push(`<div class="cc-now-sub" style="color:${QT.cloud}"><span class="cns-i">${MI_CLOUD}</span>${d.cloud!=null?Math.round(d.cloud)+'%':'—'}</div>`);
  const side=rws.length?`<div class="cc-now-side">${rws.join('')}</div>`:'';
  return `${d.icon}${tempBlock}${side}`;
}
function _scrubFrac(clientX,rows){
  const r=rows.getBoundingClientRect(); const left=r.left+28, right=r.right-40, w=Math.max(1,right-left);
  return Math.max(0,Math.min(1,(clientX-left)/w));
}
function _scrubAt(idx){
  const p=_scrub.p, n=p.n;
  const d={temp:p.temp[idx],rain:p.rain[idx],wind:p.wind[idx],cloud:p.cloud[idx],icon:_scrubIcon(p,idx),timeLabel:fmtAmPm(new Date(p.times[idx]))};
  _scrub.mainEl.innerHTML=_scrubMainHTML(d);
  _scrub.cursor.style.left=_curFrac(n>1?idx/(n-1):0);
  _scrub.cursor.classList.add('scrub-on');
  const te=_scrub.cursor.querySelector('.nc-cursor-time'); if(te)te.textContent=d.timeLabel;
}
function _scrubMove(e){
  if(!_scrub)return;
  if(!_scrub.active){
    const dx=Math.abs(e.clientX-_scrub.sx), dy=Math.abs(e.clientY-_scrub.sy);
    if(dx<4&&dy<4)return;
    if(dy>dx){ _scrubEnd(); return; }
    _scrub.active=true; _scrub.rows.classList.add('scrubbing');
  }
  _scrubAt(Math.round(_scrubFrac(e.clientX,_scrub.rows)*(_scrub.p.n-1)));
  e.preventDefault();
}
function _scrubEnd(){
  if(!_scrub)return;
  if(_scrub.active){
    _scrub.mainEl.innerHTML=_scrub.orig;
    _scrub.cursor.style.left=_curFrac(_scrub.p.nowFrac??1);
    _scrub.cursor.classList.remove('scrub-on');
    const te=_scrub.cursor.querySelector('.nc-cursor-time'); if(te)te.textContent=locNowLabel();
    _scrub.rows.classList.remove('scrubbing');
  }
  document.removeEventListener('pointermove',_scrubMove);
  document.removeEventListener('pointerup',_scrubEnd);
  document.removeEventListener('pointercancel',_scrubEnd);
  _scrub=null;
}
function _scrubStart(e){
  if(_scrub)return;
  const rows=e.target.closest('.nc-rows[data-scrub]'); if(!rows)return;
  if(rows.getAttribute('data-date')!==localTodayStr())return;
  const p=_dayHourPoints(rows.getAttribute('data-date')); if(!p||p.nowFrac==null)return;
  const card=rows.closest('.cc-now'); const mainEl=card&&card.querySelector('.cc-now-main'); const cursor=rows.querySelector('.nc-cursor');
  if(!mainEl||!cursor)return;
  _scrub={rows,p,mainEl,orig:mainEl.innerHTML,cursor,sx:e.clientX,sy:e.clientY,active:false};
  document.addEventListener('pointermove',_scrubMove,{passive:false});
  document.addEventListener('pointerup',_scrubEnd);
  document.addEventListener('pointercancel',_scrubEnd);
}
document.addEventListener('pointerdown',_scrubStart);

// ── Confidence (model agreement) ────────────────────────────────────────
const CONF_FIELDS={temp:['temperature_2m',6,0.38],rain:['precipitation',4,0.30],wind:['windspeed_10m',16,0.15],cloud:['cloudcover',38,0.17]};
function confColor(p){return p==null?'var(--text-dim)':p>=72?'#141311':p>=48?'var(--text-muted)':'var(--text-dim)';}
function confLabel(p){return p>=72?'High':p>=48?'Medium':'Low';}
function _spreadConf(vals,scale){
  if(!vals||vals.length<2)return null;
  const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
  const sd=Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length);
  return Math.max(0,Math.min(1,1-sd/scale));
}
function confHourMetric(idx,key){
  const f=CONF_FIELDS[key]; if(!f)return null;
  const models=activeEnabled();
  const vals=models.map(m=>state.data[m.key]?.hourly?.[f[0]]?.[idx]).filter(v=>v!=null&&!isNaN(v));
  const c=_spreadConf(vals,f[1]); return c==null?null:Math.round(c*100);
}
function confDayMetric(dateStr,key){
  const f=CONF_FIELDS[key]; if(!f)return null;
  const ref=refHourly(); if(!ref?.time)return null;
  const models=activeEnabled(); let sum=0,n=0;
  ref.time.forEach((t,i)=>{ if(t.slice(0,10)!==dateStr)return; const vals=models.map(m=>state.data[m.key]?.hourly?.[f[0]]?.[i]).filter(v=>v!=null&&!isNaN(v)); const c=_spreadConf(vals,f[1]); if(c!=null){sum+=c;n++;} });
  if(!n)return null;
  let conf=sum/n;
  const d=Math.round((new Date(dateStr+'T12:00')-new Date(localTodayStr()+'T12:00'))/86400000);
  if(d>0)conf*=Math.max(0.55,1-d*0.06);
  return Math.round(conf*100);
}

// ── Carousel / date UI ──────────────────────────────────────────────────
function relDayLabel(dateStr,today){
  const diff=Math.round((new Date(dateStr+'T12:00:00')-new Date(today+'T12:00:00'))/86400000);
  return diff===0?'Today':diff===1?'Tomorrow':diff===-1?'Yesterday':(diff>0?`In ${diff} days`:`${-diff} days ago`);
}
function pageGridHTML(date){return date===localTodayStr()?buildTodayBoxes():buildDayBoxes(date);}
function updateDateUI(){
  const tb=document.getElementById('today-btn');
  if(tb)tb.classList.toggle('dim',selDate===localTodayStr());
}
function renderCurrentBar(){
  const bar=document.getElementById('curr-bar');
  if(!bar)return;
  const dates=carouselDates();
  if(!dates.length)return;
  const today=localTodayStr();
  if(!selDate||!dates.includes(selDate))selDate=dates.includes(today)?today:dates[0];
  bar._dates=dates;
  bar.innerHTML=dates.map(d=>`<div class="cc-page" data-date="${d}"><div class="cc-grid">${pageGridHTML(d)}</div></div>`).join('');
  bar.classList.add('loaded');
  requestAnimationFrame(()=>centerCarousel('auto'));
  if(!bar._resizeBound){ bar._resizeBound=true; window.addEventListener('resize',()=>centerCarousel('auto')); }
  updateDateUI();
  renderDayBar();
}
function centerCarousel(behavior='auto'){
  const bar=document.getElementById('curr-bar');if(!bar)return;
  const pg=bar.querySelector('.cc-page[data-date="'+selDate+'"]');if(!pg)return;
  _suppressCarousel=Date.now()+500;
  bar.scrollTo({left:pg.offsetLeft,behavior});
}
function scrollTableToSelected(behavior='auto'){
  const wrap=document.querySelector('.table-wrap');if(!wrap)return;
  const today=localTodayStr();
  _suppressTableSync=Date.now()+700;
  if(verticalLayout){
    let row=wrap.querySelector('tr[data-date="'+selDate+'"]');
    if(selDate===today)row=wrap.querySelector('#now-row')||row;
    if(row)wrap.scrollTo({top:Math.max(0,row.offsetTop-44),behavior});
    return;
  }
  let th=null;
  if(selDate===today)th=wrap.querySelector('.hour-header th.now-col');
  if(!th)th=wrap.querySelector('.hour-header th[data-date="'+selDate+'"]');
  if(!th)return;
  wrap.scrollTo({left:Math.max(0,th.offsetLeft-98),behavior});
}
function carouselToDate(date,behavior='smooth'){
  const bar=document.getElementById('curr-bar');if(!bar)return;
  const pg=bar.querySelector('.cc-page[data-date="'+date+'"]');if(!pg)return;
  _suppressCarousel=Date.now()+700;
  bar.scrollTo({left:pg.offsetLeft,behavior});
}
function setSelectedDay(date,opts){
  opts=opts||{};
  if(!date)return;
  selDate=date;
  updateDateUI();
  if(!opts.fromCarousel) carouselToDate(date, opts.behavior||'smooth');
  if(!opts.fromTable)    scrollTableToSelected(opts.behavior||'smooth');
  updateDayBarSel();
}
function goToToday(){ setSelectedDay(localTodayStr(),{behavior:'smooth'}); }
function onTableScroll(){
  positionNowOverlay();
  if(Date.now()<_suppressTableSync)return;
  clearTimeout(_tblTmr);
  _tblTmr=setTimeout(()=>{
    const wrap=document.getElementById('table-wrap');if(!wrap)return;
    let date=null;
    if(verticalLayout){
      const edge=wrap.scrollTop+56;let best=-1;
      wrap.querySelectorAll('tr[data-date]').forEach(r=>{ if(r.offsetTop<=edge && r.offsetTop>best){best=r.offsetTop;date=r.getAttribute('data-date');} });
    } else {
      const edge=wrap.scrollLeft+102;let best=-1;
      wrap.querySelectorAll('.hour-header th[data-date]').forEach(th=>{ if(th.offsetLeft<=edge && th.offsetLeft>best){best=th.offsetLeft;date=th.getAttribute('data-date');} });
    }
    if(date && date!==selDate) setSelectedDay(date,{fromTable:true,behavior:'smooth'});
  },110);
}
function initCarouselScroll(){
  const bar=document.getElementById('curr-bar');if(!bar||bar._scrollInit)return;
  bar._scrollInit=true;
  let tmr;
  bar.addEventListener('scroll',()=>{
    if(Date.now()<_suppressCarousel)return;
    clearTimeout(tmr);
    tmr=setTimeout(()=>{
      const dates=bar._dates||[];if(!dates.length||!bar.clientWidth)return;
      const idx=Math.max(0,Math.min(dates.length-1,Math.round(bar.scrollLeft/bar.clientWidth)));
      const d=dates[idx];
      if(d&&d!==selDate) setSelectedDay(d,{fromCarousel:true,behavior:'smooth'});
    },100);
  },{passive:true});
}

// ── Canonical hourly values (observed past / bias-corrected forecast) ───
// Kept from the old strip: the engine's current-conditions card AND the
// fingerprint tiles both feed off this.
function hourTileData(iso){
  const ref=refHourly(); if(!ref?.time)return null;
  const idx=ref.time.indexOf(iso); if(idx<0)return null;
  const hz=horizonOf(iso.slice(0,10));
  let temp=wBlendAt('temperature_2m',idx,hz), rain=wBlendAt('precipitation',idx,hz),
      wind=wBlendAt('windspeed_10m',idx,hz), cloud=wBlendAt('cloudcover',idx,hz);
  const past=new Date(iso).getTime()<locNowMs();
  let isAct=false;
  if(past && actualData?.hourly?.time){
    const ai=actualData.hourly.time.indexOf(iso);
    if(ai>=0){
      const at=actualData.hourly.temperature_2m?.[ai], ar=actualData.hourly.precipitation?.[ai],
            aw=actualData.hourly.windspeed_10m?.[ai], ac=actualData.hourly.cloudcover?.[ai];
      if(at!=null){temp=at;isAct=true;}
      if(ar!=null)rain=ar;
      if(aw!=null)wind=aw;
      if(ac!=null)cloud=ac;
    }
  }
  const rawCode=state.data[activeEnabled()[0]?.key]?.hourly?.weathercode?.[idx]??null;
  const phase=sunPhaseAt(iso);
  const code=deriveCondCode(rain,cloud,rawCode);
  return {iso,temp,rain,wind,cloud,code,isAct,past,phase,night:phase==='night'};
}

// ── Fingerprint day selector ────────────────────────────────────────────
// Each day rendered as its own miniature chart: temp curve (shared y-scale
// across all days, so shapes compare) + rain bars + hi/lo + rain total.
function _miniSpark(temps,rainBars,gmn,gmx){
  const W=62,H=28,tTop=2,tBot=16;
  const n=temps.length;
  const X=i=> n>1? 1+i*(W-2)/(n-1) : W/2;
  const rng=Math.max(1,gmx-gmn);
  const Y=v=> tBot-((Math.max(gmn,Math.min(gmx,v))-gmn)/rng)*(tBot-tTop);
  let d='',on=false, area='';
  temps.forEach((v,i)=>{
    if(v==null||isNaN(v)){on=false;return;}
    d+=(on?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1)+' ';
    on=true;
  });
  if(d){
    const firstI=temps.findIndex(v=>v!=null&&!isNaN(v));
    let lastI=-1; temps.forEach((v,i)=>{if(v!=null&&!isNaN(v))lastI=i;});
    if(firstI>=0&&lastI>=0) area=d+`L ${X(lastI).toFixed(1)} ${tBot+1} L ${X(firstI).toFixed(1)} ${tBot+1} Z`;
  }
  const bars=rainBars.map((v,b)=>{
    if(v==null||v<0.1)return '';
    const h=Math.max(2,Math.log1p(v)/Math.log1p(10)*9);
    const bw=(W-2)/rainBars.length;
    return `<rect x="${(1+b*bw+bw*0.15).toFixed(1)}" y="${(H-1-h).toFixed(1)}" width="${(bw*0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${QT.rain}" opacity="0.85"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    ${area?`<path d="${area}" fill="rgba(126,232,165,0.13)"/>`:''}
    ${d?`<path d="${d.trim()}" fill="none" stroke="${QT.temp}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`:''}
    ${bars}
  </svg>`;
}
function renderDayBar(){
  const bar=document.getElementById('day-bar'); if(!bar)return;
  const dates=carouselDates();
  if(!dates.length){ bar.innerHTML=''; return; }
  const ref=refHourly(); if(!ref?.time){ bar.innerHTML=''; return; }
  const today=localTodayStr();
  const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  // Gather per-day series once (observed past + bias-corrected forecast)
  const perDay={}; let gmn=Infinity,gmx=-Infinity;
  dates.forEach(d=>{
    const temps=[],rains=[];
    ref.time.forEach(t=>{
      if(t.slice(0,10)!==d)return;
      const ht=hourTileData(t)||{};
      temps.push(ht.temp!=null?ht.temp:null);
      rains.push(_rcell(ht.rain));
    });
    let hi=null,lo=null,rt=0;
    temps.forEach(v=>{ if(v!=null){hi=hi==null?v:Math.max(hi,v);lo=lo==null?v:Math.min(lo,v); gmn=Math.min(gmn,v);gmx=Math.max(gmx,v);} });
    rains.forEach(v=>{ if(v)rt+=v; });
    // downsample: temp every 2nd hour, rain into 3h buckets
    const tS=temps.filter((_,i)=>i%2===0);
    const rB=[]; for(let b=0;b<8;b++){ let s=0; for(let k=0;k<3;k++){const v=rains[b*3+k]; if(v)s+=v;} rB.push(s); }
    perDay[d]={tS,rB,hi,lo,rt};
  });
  if(!isFinite(gmn)){gmn=0;gmx=1;}
  bar.innerHTML=dates.map(d=>{
    const o=perDay[d];
    const dd=new Date(d+'T12:00:00');
    const isPast=d<today, isToday=d===today;
    const rainTxt=o.rt>=0.1?`${o.rt>=10?Math.round(o.rt):o.rt.toFixed(1)}mm`:'dry';
    return `<div class="db-tile${isPast?' db-past':''}${isToday?' db-today':''}${d===selDate?' sel':''}" data-date="${d}" onclick="setSelectedDay('${d}',{behavior:'smooth'})">
      <div class="db-dow">${DAYS[dd.getDay()]} ${dd.getDate()}</div>
      <div class="db-spark">${_miniSpark(o.tS,o.rB,gmn,gmx)}</div>
      <div class="db-hl"><b>${o.hi!=null?Math.round(o.hi)+'°':'—'}</b><span>${o.lo!=null?Math.round(o.lo)+'°':'—'}</span></div>
      <div class="db-rain${o.rt>=0.1?'':' dry'}">${rainTxt}</div>
    </div>`;
  }).join('');
  updateDayBarSel('auto');
}
function updateDayBarSel(behavior='smooth'){
  const bar=document.getElementById('day-bar'); if(!bar)return;
  let selTile=null;
  bar.querySelectorAll('.db-tile').forEach(t=>{
    const on=t.getAttribute('data-date')===selDate;
    t.classList.toggle('sel',on);
    if(on)selTile=t;
  });
  if(selTile)bar.scrollTo({left:Math.max(0,selTile.offsetLeft-(bar.clientWidth-selTile.offsetWidth)/2),behavior});
}

// ── Section visibility (Cards / Table / Map) ────────────────────────────
const _SECTION_EL={cards:'carousels-section',table:'table-section',map:'map-section'};
function applySectionVisibility(){
  Object.keys(_SECTION_EL).forEach(sec=>{
    const el=document.getElementById(_SECTION_EL[sec]);
    if(el)el.style.display = sectionsVisible[sec] ? '' : 'none';
    const btn=document.querySelector('.bnav-btn[data-sec="'+sec+'"]');
    if(btn)btn.classList.toggle('active', !!sectionsVisible[sec]);
  });
}
function toggleView(sec){
  sectionsVisible[sec]=!sectionsVisible[sec];
  applySectionVisibility();
  savePrefs();
  if(sec==='cards' && sectionsVisible.cards){ requestAnimationFrame(()=>{ centerCarousel('auto'); updateDayBarSel('auto'); }); }
  if(sec==='table' && sectionsVisible.table){ if(Object.keys(state.data).length){ renderTable(); requestAnimationFrame(()=>{ scrollTableToSelected('auto'); positionNowOverlay(); }); } }
}

// ── Formatting / colour classes ─────────────────────────────────────────
function fmt(v,dp=1){return v==null?'<span class="empty">—</span>':v.toFixed(dp);}
function tempDisp(v){return v==null?'—':(Number.isInteger(v)?String(v):v.toFixed(1));}
function rainCls(v){if(!v||v<0.05)return'r0';if(v<0.2)return'r1';if(v<0.5)return'r2';if(v<1)return'r3';if(v<2)return'r4';if(v<5)return'r5';return'r6';}
function windCls(v){if(!v||v<10)return'wc';if(v<20)return'wl';if(v<35)return'wm';if(v<55)return'wh';return'wx';}
function cloudCls(v){if(v==null)return"";if(v<=12)return"cl0";if(v<=25)return"cl1";if(v<=50)return"cl2";if(v<=75)return"cl3";if(v<=87)return"cl4";return"cl5";}
function tempCls(v){if(v==null)return'';if(v<5)return'tc';if(v<12)return'tk';if(v<22)return'tm';if(v<30)return'tw';return'th';}

// ── SVG weather icons ───────────────────────────────────────────────────
const _sun='<circle cx="12" cy="12" r="4.6" fill="#232019"/><g stroke="#232019" stroke-width="1.7" stroke-linecap="round"><line x1="12" y1="1.6" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.4"/><line x1="1.6" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.4" y2="12"/><line x1="4.5" y1="4.5" x2="6.2" y2="6.2"/><line x1="17.8" y1="17.8" x2="19.5" y2="19.5"/><line x1="19.5" y1="4.5" x2="17.8" y2="6.2"/><line x1="6.2" y1="17.8" x2="4.5" y2="19.5"/></g>';
const _moon='<path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5 6.7 6.7 0 0 0 20.5 14.2z" fill="#5c584f"/>';
const _sunSm='<circle cx="8.2" cy="7.6" r="3.1" fill="#232019"/><g stroke="#232019" stroke-width="1.3" stroke-linecap="round"><line x1="8.2" y1="1.8" x2="8.2" y2="3.2"/><line x1="2.4" y1="7.6" x2="3.8" y2="7.6"/><line x1="4.1" y1="3.5" x2="5.1" y2="4.5"/><line x1="12.3" y1="3.5" x2="11.3" y2="4.5"/></g>';
const _moonSm='<path d="M13.2 7.7A4.5 4.5 0 1 1 7.8 3.1 3.5 3.5 0 0 0 13.2 7.7z" fill="#5c584f"/>';
function _cloud(c){return `<path d="M7 18.5h9.4a3.6 3.6 0 0 0 .42-7.16 5.3 5.3 0 0 0-10.2-1.2A4 4 0 0 0 7 18.5z" fill="${c}"/>`;}
function _rain(n){const x=[8.5,12,15.5];let s='<g stroke="#232019" stroke-width="1.8" stroke-linecap="round">';for(let i=0;i<n;i++)s+=`<line x1="${x[i]}" y1="19.8" x2="${x[i]-1}" y2="22.6"/>`;return s+'</g>';}
const _snow='<g fill="#5c584f"><circle cx="8.5" cy="20.9" r="1.15"/><circle cx="12" cy="22.1" r="1.15"/><circle cx="15.5" cy="20.9" r="1.15"/></g>';
const _bolt='<polygon points="12.6,18.4 9.6,22.4 11.7,22.4 10.7,23.8 14,19.7 11.9,19.7 13.4,18.4" fill="#141311"/>';
const _fog='<g stroke="#847f73" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="8" x2="20" y2="8"/><line x1="5.5" y1="12" x2="18.5" y2="12"/><line x1="4" y1="16" x2="17" y2="16"/><line x1="7" y1="20" x2="20" y2="20"/></g>';
function _horizonSun(col,dir){
  const ray=`<g stroke="${col}" stroke-width="1.4" stroke-linecap="round"><line x1="12" y1="3.5" x2="12" y2="5.6"/><line x1="4.6" y1="9.4" x2="6.1" y2="10.9"/><line x1="19.4" y1="9.4" x2="17.9" y2="10.9"/><line x1="2.4" y1="16" x2="4.2" y2="16"/><line x1="19.8" y1="16" x2="21.6" y2="16"/></g>`;
  const halfSun=`<path d="M6.6 16a5.4 5.4 0 0 1 10.8 0z" fill="${col}"/>`;
  const horizon=`<line x1="2" y1="16" x2="22" y2="16" stroke="${col}" stroke-width="1.7" stroke-linecap="round"/>`;
  const arr=dir==='up'
    ?`<path d="M10 21.4l2-2 2 2" fill="none" stroke="${col}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
    :`<path d="M10 19.4l2 2 2-2" fill="none" stroke="${col}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  return ray+halfSun+horizon+arr;
}
function wxIcon(c,night,phase){
  if(c==null)return'<span class="wx-dash">–</span>';
  const n=!!night, GRAY='#8d897e', DARK='#57544c';
  if((phase==='dawn'||phase==='dusk') && c<=2){
    const inner=_horizonSun('#232019', phase==='dawn'?'up':'down');
    return `<svg class="wxi" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  }
  let inner;
  if(c===0)                 inner=n?_moon:_sun;
  else if(c===1||c===2)     inner=(n?_moonSm:_sunSm)+_cloud(GRAY);
  else if(c===3)            inner=_cloud(DARK);
  else if(c===45||c===48)   inner=_fog;
  else if(c>=51&&c<=57)     inner=(n?'':_sunSm)+_cloud(GRAY)+_rain(2);
  else if(c>=61&&c<=65)     inner=_cloud(GRAY)+_rain(3);
  else if(c===66||c===67)   inner=_cloud(GRAY)+_rain(2);
  else if(c>=71&&c<=77)     inner=_cloud(GRAY)+_snow;
  else if(c>=80&&c<=82)     inner=(n?'':_sunSm)+_cloud(GRAY)+_rain(3);
  else if(c===85||c===86)   inner=(n?'':_sunSm)+_cloud(GRAY)+_snow;
  else if(c>=95)            inner=_cloud(DARK)+_bolt;
  else                      inner=_cloud(GRAY);
  return `<svg class="wxi" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}
function deriveCondCode(precip,cloud,rawCode){
  if(precip!=null&&precip>=0.15){
    if(rawCode>=71&&rawCode<=77)return 73;
    if(rawCode===85||rawCode===86)return 85;
    if(rawCode>=95)return 95;
    if(precip>=2.5)return 65;
    return 61;
  }
  if(rawCode===45||rawCode===48)return 45;
  if(cloud==null)return rawCode;
  if(cloud<=15)return 0;
  if(cloud<=45)return 1;
  if(cloud<=75)return 2;
  return 3;
}
function deriveDailyCode(rainSum,cloud,rawCode){
  if(rainSum!=null&&rainSum>=1){
    if(rawCode>=71&&rawCode<=77)return 73;
    if(rawCode>=95)return 95;
    if(rainSum>=10)return 65;
    return 61;
  }
  if(rawCode===45||rawCode===48)return 45;
  if(cloud==null)return rawCode;
  if(cloud<=15)return 0; if(cloud<=45)return 1; if(cloud<=75)return 2; return 3;
}
function dirArrow(deg){const a=['↑','↗','→','↘','↓','↙','←','↖'],d=['N','NE','E','SE','S','SW','W','NW'];const i=Math.round(((deg%360)+360)%360/45)%8;return`${a[i]} ${d[i]}`;}

// ── Table plumbing ──────────────────────────────────────────────────────
function wBadge(sec,key){
  const w=(metricWeights[sec]||{})[key];
  if(w==null||!isFinite(w))return '';
  const pct=Math.round(w*100);
  const cls=pct>=20?'high':pct>=10?'mid':'low';
  return '<span style="font-size:10px;color:var(--text-muted)"><span class="weight-badge '+cls+'">'+pct+'%</span></span>';
}
function srcRowClass(m,sec){
  const isOn=enabled.has(m.key)&&!autoHidden.has(m.key);
  const open=sec?secDetail[sec]:showDetail;
  return`data-row src-row${sec?' src-'+sec:''}${(!isOn||!open)?' src-hidden':''}${!isOn?' perm-hidden':''}`;
}
function secHeadLabel(sec,content){
  const ic={temp:MI_TEMP,rain:MI_RAIN,wind:MI_WIND,cloud:MI_CLOUD}[sec]||'';
  return`<td class="row-label sec-toggle" onclick="toggleSecDetail('${sec}')">${ic?`<span class="shl-ic" style="color:var(--q-${sec})">${ic}</span>`:''}${content}</td>`;
}
function toggleSecDetail(sec){
  secDetail[sec]=!secDetail[sec];
  document.querySelectorAll('.src-'+sec).forEach(r=>{
    if(!r.classList.contains('perm-hidden'))r.classList.toggle('src-hidden',!secDetail[sec]);
  });
  savePrefs();
  positionNowOverlay();
}
function fmtAmPm(d){
  const h=d.getHours();const ampm=h<12?'am':'pm';const h12=h%12||12;
  return`${h12}${ampm}`;
}
function colDayCls(isoTime,prevIsoTime){
  const ts=new Date(isoTime).getTime();
  const dayCls=isDay(ts,isoTime.slice(0,10))?'day-col':'';
  const startCls=isDayStart(isoTime,prevIsoTime)?'day-start':'';
  return[dayCls,startCls].filter(Boolean).join(' ');
}
function injectColCls(tdHtml,extraCls){
  if(!extraCls)return tdHtml;
  return tdHtml.replace(/^<td([^>]*)>/,(_,attrs)=>{
    const existing=(attrs.match(/class="([^"]*)"/)||['',''])[1];
    const merged=[existing,extraCls].filter(Boolean).join(' ');
    return`<td${attrs.replace(/class="[^"]*"/,'')} class="${merged}">`;
  });
}
function secGroup(sec,html){
  return`<tbody class="section-group${!secVisible[sec]?' sec-off':''}" data-sec="${sec}">${html}</tbody>`;
}

// ── Cloud section builder (horizontal table) ────────────────────────────
function buildCloudSection(indices,ndCls,pastCls,nowCi,C,allActive,onlyEnabled,ref,actMap,confRow){
  const avg=indices.map(i=>wBlendAt('cloudcover',i,horizonOf(ref.time[i].slice(0,10))));
  const avgCells=avg.map((v,ci)=>{const cls=cloudCls(v);const nc=ci===nowCi?"now-col":"";const txt=v!=null?Math.round(v)+"%":"—";return injectColCls(`<td class="${[cls,nc].filter(Boolean).join(" ")}">${txt}</td>`,(ndCls[ci]+" "+pastCls[ci]).trim());}).join("");
  const srcRows=allActive.map(m=>{const v=hVals(m.key,"cloudcover",indices);const cells=v.map((x,ci)=>{const cls=cloudCls(x);const nc=ci===nowCi?"now-col":"";return injectColCls(`<td class="${[cls,nc].filter(Boolean).join(" ")}">${x!=null?Math.round(x)+"%":"—"}</td>`,(ndCls[ci]+" "+pastCls[ci]).trim());}).join("");return`<tr class="${srcRowClass(m,'cloud')}"><td class="row-label"><span class="model-badge"><span class="mdot" style="background:${m.color}">${m.short}</span>${wBadge('cloud',m.key)}</span></td>${cells}</tr>`;}).join("");
  const nowMs=locNowMs();
  let actRow='';
  if(actualData&&showActuals){
    const sh=actualData.hourly, map={}; (sh.time||[]).forEach((t,ai)=>{map[t]=ai;});
    const cells=indices.map((hourIdx,ci)=>{
      if(new Date(ref.time[hourIdx]).getTime()>=nowMs)return'<td class="empty">–</td>';
      const ai=map[ref.time[hourIdx]];
      if(ai===undefined)return'<td class="empty">–</td>';
      const v=sh.cloudcover?.[ai];
      if(v==null)return'<td class="empty">–</td>';
      const cls=cloudCls(v);const nc=ci===nowCi?"now-col":"";
      return injectColCls(`<td class="${[cls,nc].filter(Boolean).join(" ")}">${Math.round(v)}%</td>`,(ndCls[ci]+" "+pastCls[ci]).trim());
    }).join("");
    const tag=({bom:'BOM',om:'Open-Meteo',blend:'Blend'})[actualSource]||'';
    actRow=`<tr class="actual-row"><td class="row-label" style="color:${QT.cloud}">✓ Actual<span class="act-src">${tag}</span></td>${cells}</tr>`;
  }
  return`<tr class="sec-head-temp">${secHeadLabel('cloud','Cloud')}${avgCells}</tr>${typeof confRow==='function'?confRow('cloud'):''}${srcRows}`+actRow;
}

// ── Vertical layout ─────────────────────────────────────────────────────
function renderVertical(){
  if(state.view==='daily') renderVerticalDaily();
  else renderVerticalHourly();
}
function _vh(icon,q){return `<span style="color:var(--q-${q})">${icon}</span>`;}
function renderVertical_buildColDef(){
  const nowMs=Date.now();
  const actMap={};
  if(actualData)actualData.hourly.time.forEach((t,i)=>{actMap[t]=i;});
  const cols=[];
  if(secVisible.temp){
    cols.push({id:'temp',   hdr:_vh(MI_TEMP,'temp'), hdrCls:'sec-head-temp'});
    if(actualData&&showActuals) cols.push({id:'act_t', hdr:'✓'+_vh(MI_TEMP,'temp'), hdrCls:'sec-head-temp'});
  }
  if(secVisible.rain){
    cols.push({id:'rain',   hdr:_vh(MI_RAIN,'rain'), hdrCls:'sec-head-rain'});
    if(actualData&&showActuals) cols.push({id:'act_r', hdr:'✓'+_vh(MI_RAIN,'rain'), hdrCls:'sec-head-rain'});
  }
  if(secVisible.wind){
    cols.push({id:'wind',   hdr:_vh(MI_WIND,'wind'), hdrCls:'sec-head-wind'});
  }
  if(secVisible.cloud){
    cols.push({id:'cloud',  hdr:_vh(MI_CLOUD,'cloud'), hdrCls:''});
    if(actualData&&showActuals) cols.push({id:'act_cl', hdr:'✓'+_vh(MI_CLOUD,'cloud'), hdrCls:''});
  }
  return{cols,actMap,nowMs};
}
function renderVertical_cellVal(colId,i,onlyEnabled,actMap,nowMs,ref){
  const isPast=new Date(ref.time[i]).getTime()<nowMs;
  const hz=horizonOf(ref.time[i].slice(0,10));
  switch(colId){
    case'temp':{
      const v=weightedAvgOf(onlyEnabled.map(m=>({key:m.key,val:state.data[m.key]?.hourly?.temperature_2m?.[i]??null})),'temp',hz,'temperature_2m');
      return`<td class="${tempCls(v)}">${v!=null?tempDisp(v)+'°':'—'}</td>`;
    }
    case'rain':{
      const v=weightedAvgOf(onlyEnabled.map(m=>({key:m.key,val:state.data[m.key]?.hourly?.precipitation?.[i]??null})),'rain',hz,'precipitation');
      return`<td class="${rainCls(v)}">${v!=null?(v<0.05?'<span class="empty">0</span>':v.toFixed(1)):'—'}</td>`;
    }
    case'wind':{
      const v=weightedAvgOf(onlyEnabled.map(m=>({key:m.key,val:state.data[m.key]?.hourly?.windspeed_10m?.[i]??null})),'wind',hz,'windspeed_10m');
      return`<td class="${windCls(v)}">${v!=null?v.toFixed(0):'—'}</td>`;
    }
    case'act_t':{
      if(!isPast)return'<td class="empty">–</td>';
      const ai=actMap[ref.time[i]];
      const v=ai!==undefined?actualData.hourly.temperature_2m?.[ai]:null;
      return`<td class="${v!=null?tempCls(v):''}">${v!=null?tempDisp(v)+'°':'–'}</td>`;
    }
    case'act_r':{
      if(!isPast)return'<td class="empty">–</td>';
      const ai=actMap[ref.time[i]];
      const v=ai!==undefined?actualData.hourly.precipitation?.[ai]:null;
      return`<td class="${v!=null?rainCls(v):''}">${v!=null?(v<0.05?'<span class="empty">0</span>':v.toFixed(1)):'–'}</td>`;
    }
    case'cloud':{
      const v=weightedAvgOf(onlyEnabled.map(m=>({key:m.key,val:state.data[m.key]?.hourly?.cloudcover?.[i]??null})),'cloud',hz,'cloudcover');
      return`<td class="${cloudCls(v)}">${v!=null?Math.round(v)+'%':'—'}</td>`;
    }
    case'act_cl':{
      if(new Date(ref.time[i]).getTime()>=nowMs)return'<td class="empty">–</td>';
      const ai=actMap[ref.time[i]];
      const v=ai!==undefined?actualData.hourly.cloudcover?.[ai]:null;
      return`<td class="${v!=null?cloudCls(v):''}">${v!=null?Math.round(v)+'%':'–'}</td>`;
    }
    default:return'<td>–</td>';
  }
}
function renderVerticalHourly(){
  document.getElementById('table-wrap')?.classList.add('vertical-mode');
  const firstKey=MODELS.find(m=>state.data[m.key])?.key;if(!firstKey)return;
  const ref=state.data[firstKey].hourly;
  const now=locNowDate();
  const step=state.view==='1h'?1:state.view==='3h'?3:8;
  const tenDaysAgo=new Date(now.getTime()-10*24*3600*1000);
  let si=ref.time.findIndex(t=>new Date(t)>=tenDaysAgo);if(si<0)si=0;
  const nowIdx=(()=>{let idx=0;for(let k=0;k<ref.time.length;k++){if(new Date(ref.time[k])<=now)idx=k;else break;}return idx;})();
  const raw=[];
  for(let i=si;i<ref.time.length&&i<si+20*24;i+=step)raw.push(i);
  const indices=raw.slice(0,state.view==='1h'?20*24:Math.ceil(20*24/step));
  const onlyEnabled=activeEnabled();
  const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const {cols,actMap,nowMs}=renderVertical_buildColDef();

  const hdr=`<tr class="hour-header">
    <th class="row-label">Time</th>
    ${cols.map(c=>`<th class="${c.hdrCls}" style="min-width:64px;text-align:center">${c.hdr}</th>`).join('')}
  </tr>`;

  const rows=indices.map(i=>{
    const d=new Date(ref.time[i]);
    const isNow=nowIdx>=0&&i===nowIdx;
    const ndCls=colDayCls(ref.time[i],i>0?ref.time[i-1]:null);
    const isDayStart=i>0&&ref.time[i].slice(0,10)!==ref.time[i-1].slice(0,10);
    const rowStyle=isDayStart?'border-top:2px solid var(--day-line)':'';
    const cells=cols.map(c=>renderVertical_cellVal(c.id,i,onlyEnabled,actMap,nowMs,ref)).join('');
    const labelStyle=`font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;white-space:nowrap;${isNow?'color:var(--now);font-weight:700':''}`;
    return`<tr class="data-row ${ndCls}${isNow?' now-row':''}${isDayStart?' vday-start':''}" data-date="${ref.time[i].slice(0,10)}" data-iso="${ref.time[i]}" ${isNow?'id="now-row"':''} style="${rowStyle}">
      <td class="row-label ${ndCls}" style="${labelStyle}">${DAYS[d.getDay()]} ${d.getDate()} <span style="opacity:.7">${fmtAmPm(d)}</span></td>
      ${cells}
    </tr>`;
  }).join('');

  document.querySelector('.ftable').innerHTML=`<tbody>${hdr}${rows}</tbody>`;
  requestAnimationFrame(()=>scrollTableToSelected());
  positionNowOverlay();
}
function renderVerticalDaily(){
  document.getElementById('table-wrap')?.classList.add('vertical-mode');
  const allActive=activeAll();if(!allActive.length)return;
  const onlyEnabled=activeEnabled();
  const firstKey=onlyEnabled[0]?.key||allActive[0].key;
  const ref=state.data[firstKey].daily;
  const now=locNowDate();
  const todayStr=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  let si=ref.time.findIndex(t=>t>=todayStr);if(si<0)si=0;
  const pastSi=Math.max(0,si-7);
  const indices=Array.from({length:Math.min(17,ref.time.length-pastSi)},(_,i)=>pastSi+i);
  const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const actDailyMap={};
  if(actualData?.daily?.time){
    actualData.daily.time.forEach((t,i)=>{actDailyMap[t]=i;});
  }

  const cols=[];
  if(secVisible.temp){
    cols.push({id:'temp_hl', hdr:_vh(MI_TEMP,'temp'), hdrCls:'sec-head-temp'});
    if(actualData?.daily) cols.push({id:'act_t', hdr:'✓'+_vh(MI_TEMP,'temp'), hdrCls:'sec-head-temp'});
  }
  if(secVisible.rain){
    cols.push({id:'rain_sum', hdr:_vh(MI_RAIN,'rain'), hdrCls:'sec-head-rain'});
    if(actualData?.daily) cols.push({id:'act_r', hdr:'✓'+_vh(MI_RAIN,'rain'), hdrCls:'sec-head-rain'});
  }
  if(secVisible.wind){
    cols.push({id:'wind_max', hdr:_vh(MI_WIND,'wind'), hdrCls:'sec-head-wind'});
  }

  const hdr=`<tr class="hour-header">
    <th class="row-label">Date</th>
    ${cols.map(c=>`<th class="${c.hdrCls}" style="min-width:72px;text-align:center">${c.hdr}</th>`).join('')}
  </tr>`;

  const rows=indices.map(i=>{
    const dateStr=ref.time[i];
    const d=new Date(dateStr+'T12:00:00');
    const isToday=dateStr===todayStr;
    const isPast=dateStr<todayStr;
    const hz=horizonOf(dateStr);
    const labelStyle=`font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;white-space:nowrap;${isToday?'color:var(--now);font-weight:700':isPast?'opacity:.65':''}`;
    const ai=actDailyMap[dateStr];
    const cells=cols.map(c=>{
      switch(c.id){
        case'temp_hl':{
          const hi=weightedAvgOf(onlyEnabled.map(m=>({key:m.key,val:state.data[m.key]?.daily?.temperature_2m_max?.[i]??null})),'temp',hz,'temperature_2m_max');
          const lo=weightedAvgOf(onlyEnabled.map(m=>({key:m.key,val:state.data[m.key]?.daily?.temperature_2m_min?.[i]??null})),'temp',hz,'temperature_2m_min');
          const cls=hi!=null?tempCls(hi):'', loCls=lo!=null?tempCls(lo):'';
          return (hi==null&&lo==null)?`<td class="${cls}"><span class="empty">—</span></td>`:`<td class="${cls}">↑${hi!=null?tempDisp(hi)+'°':'—'} <span class="${loCls}" style="font-size:11px">↓${lo!=null?tempDisp(lo)+'°':'—'}</span></td>`;
        }
        case'act_t':{
          if(!isPast||ai===undefined)return'<td class="empty">–</td>';
          const hi=actualData.daily.temperature_2m_max?.[ai];
          const lo=actualData.daily.temperature_2m_min?.[ai];
          const cls=hi!=null?tempCls(hi):'', loCls=lo!=null?tempCls(lo):'';
          return (hi==null&&lo==null)?`<td class="${cls}"><span class="empty">—</span></td>`:`<td class="${cls}">↑${hi!=null?tempDisp(hi)+'°':'–'} <span class="${loCls}" style="font-size:11px">↓${lo!=null?tempDisp(lo)+'°':'–'}</span></td>`;
        }
        case'rain_sum':{
          const v=weightedAvgOf(onlyEnabled.map(m=>({key:m.key,val:state.data[m.key]?.daily?.precipitation_sum?.[i]??null})),'rain',hz);
          return`<td class="${rainCls(v)}">${v!=null?(v<0.1?'<span class="empty">0</span>':v.toFixed(1)):'—'}</td>`;
        }
        case'act_r':{
          if(!isPast||ai===undefined)return'<td class="empty">–</td>';
          const v=actualData.daily.precipitation_sum?.[ai];
          return`<td class="${rainCls(v)}">${v!=null?(v<0.1?'<span class="empty">0</span>':v.toFixed(1)):'–'}</td>`;
        }
        case'wind_max':{
          const v=weightedAvgOf(onlyEnabled.map(m=>({key:m.key,val:state.data[m.key]?.daily?.windspeed_10m_max?.[i]??null})),'wind',hz,'windspeed_10m_max');
          return`<td class="${windCls(v)}">${v!=null?v.toFixed(0):'—'}</td>`;
        }
        default:return'<td>–</td>';
      }
    }).join('');
    return`<tr class="data-row vday-start${isToday?' now-row':''}" data-date="${dateStr}" ${isToday?'id="now-row"':''}>
      <td class="row-label" style="${labelStyle}">${DAYS[d.getDay()]} ${d.getDate()} ${d.toLocaleDateString('en-AU',{month:'short'})}</td>
      ${cells}
    </tr>`;
  }).join('');

  document.querySelector('.ftable').innerHTML=`<tbody>${hdr}${rows}</tbody>`;
  requestAnimationFrame(()=>scrollTableToSelected());
}

// ── Overlays / skeleton / dispatch ──────────────────────────────────────
function positionNowOverlay(){
  requestAnimationFrame(()=>{
    const wrap=document.getElementById('table-wrap');
    if(!wrap)return;
    const ovV   =document.getElementById('now-overlay');
    const ovH   =document.getElementById('now-overlay-h');
    const pastV =document.getElementById('past-overlay');
    const pastH =document.getElementById('past-overlay-h');

    wrap.querySelectorAll('.day-sep').forEach(e=>e.remove());

    if(!verticalLayout){
      const tbl=wrap.querySelector('.ftable');
      const fullH=tbl?tbl.offsetHeight:wrap.scrollHeight;
      const nowTh=wrap.querySelector('.hour-header th.now-col');
      if(nowTh&&ovV){
        const leftEdge=nowTh.offsetLeft;
        ovV.style.left=leftEdge+'px';
        ovV.style.top='0';
        ovV.style.height=fullH+'px';
        ovV.style.display='block';
        const labelW=98;
        pastV.style.left=labelW+'px';
        pastV.style.top='0';
        pastV.style.width=Math.max(0,leftEdge-labelW)+'px';
        pastV.style.height=fullH+'px';
        pastV.style.display='block';
      } else {
        if(ovV)ovV.style.display='none';
        if(pastV)pastV.style.display='none';
      }
      wrap.querySelectorAll('.hour-header th.day-start').forEach(th=>{
        const ln=document.createElement('div');
        ln.className='day-sep';
        ln.style.left=th.offsetLeft+'px';
        ln.style.top='0';
        ln.style.height=fullH+'px';
        wrap.appendChild(ln);
      });
      if(ovH)ovH.style.display='none';
      if(pastH)pastH.style.display='none';
    } else {
      const nowRow=document.getElementById('now-row');
      if(nowRow&&ovH){
        const topEdge=nowRow.offsetTop;
        ovH.style.top=topEdge+'px';
        ovH.style.left='0';
        ovH.style.width='100%';
        ovH.style.display='block';
        pastH.style.top='0';
        pastH.style.left='0';
        pastH.style.width='100%';
        pastH.style.height=Math.max(0,topEdge)+'px';
        pastH.style.display='block';
      } else {
        if(ovH)ovH.style.display='none';
        if(pastH)pastH.style.display='none';
      }
      if(ovV)ovV.style.display='none';
      if(pastV)pastV.style.display='none';
    }
  });
}
function renderSkeleton(){
  const sk='<span class="sk"></span>';const C=12;
  document.querySelector('.ftable').innerHTML=
    `<tbody><tr class="hour-header"><th class="row-label"></th>${Array(C).fill(`<th>${sk}</th>`).join('')}</tr>`+
    Array(8).fill(`<tr class="data-row"><td class="row-label">${sk}</td>${Array(C).fill(`<td>${sk}</td>`).join('')}</tr>`).join('')+
    `</tbody>`;
}
function renderTable(){
  const okModels=MODELS.filter(m=>state.data[m.key]).length;
  dbg(`renderTable: view=${state.view}, vertical=${verticalLayout}, models-with-data=${okModels}`);
  if(verticalLayout)renderVertical();
  else if(state.view==='daily')renderDaily();
  else renderHourly();
}
// ── Horizontal hourly table ─────────────────────────────────────────────
function renderHourly(){
  document.getElementById('table-wrap')?.classList.remove('vertical-mode');
  const firstKey=MODELS.find(m=>state.data[m.key])?.key;if(!firstKey)return;
  const ref=state.data[firstKey].hourly;
  const now=locNowDate();
  const step=state.view==='1h'?1:state.view==='3h'?3:8;
  const sevenDaysAgo=new Date(now.getTime()-10*24*3600*1000);
  let si=ref.time.findIndex(t=>new Date(t)>=sevenDaysAgo);if(si<0)si=0;
  if(step>1){ while(si>0 && new Date(ref.time[si]).getHours()%step!==0) si--; }
  const nowIdx=(()=>{let idx=0;for(let k=0;k<ref.time.length;k++){if(new Date(ref.time[k])<=now)idx=k;else break;}return idx;})();
  const raw=[];
  for(let i=si;i<ref.time.length&&i<si+20*24;i+=step)raw.push(i);
  const indices=raw.slice(0,state.view==='1h'?20*24:state.view==='3h'?Math.ceil(20*24/3):Math.ceil(20*24/8));

  const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const ndCls=indices.map((i,ci)=>colDayCls(ref.time[i],ci>0?ref.time[indices[ci-1]]:null));
  const actMap={};
  if(actualData){actualData.hourly.time.forEach((t,ai)=>{actMap[t]=ai;});}
  let nowCi=-1;
  for(let ci=0;ci<indices.length;ci++){ if(indices[ci]<=nowIdx) nowCi=ci; else break; }
  const pastCls=indices.map((i,ci)=>(nowCi>=0&&ci<nowCi)?'past-col':'');

  const hdrCells=indices.map((i,ci)=>{
    const d=new Date(ref.time[i]);
    const timeStr=fmtAmPm(d);
    const isNow=ci===nowCi;
    const isPastCol=nowCi>=0&&ci<nowCi;
    const cls=[isNow?'now-col':'',ndCls[ci],isPastCol?'past-col':''].filter(Boolean).join(' ');
    const dayLabel=DAYS[d.getDay()]+' '+d.getDate();
    return`<th class="${cls}" data-date="${ref.time[i].slice(0,10)}" data-iso="${ref.time[i]}"><span class="col-day">${dayLabel}</span><span class="col-time">${timeStr}</span></th>`;
  }).join('');

  const allActive=activeAll();const onlyEnabled=activeEnabled();
  const C=indices.length+1;
  const hzAt=ci=>horizonOf(ref.time[indices[ci]].slice(0,10));

  // ── TEMP ──
  const tempModelRows=allActive.map(m=>{
    const v=hVals(m.key,'temperature_2m',indices);
    const cells=v.map((x,ci)=>{const nc=ci===nowCi?'now-col':'';return injectColCls(`<td class="${[x!=null?tempCls(x):'',nc].filter(Boolean).join(' ')}">${x!=null?tempDisp(x)+'°':'—'}</td>`,ndCls[ci]);}).join('');
    return`<tr class="${srcRowClass(m,'temp')}"><td class="row-label"><span class="model-badge"><span class="mdot" style="background:${m.color}">${m.short}</span>${wBadge('temp',m.key)}</span></td>${cells}</tr>`;
  }).join('');
  const avgTemp=indices.map(i=>wBlendAt('temperature_2m',i,horizonOf(ref.time[i].slice(0,10))));
  const avgTempCells=avgTemp.map((v,ci)=>{
    const cls=v!=null?tempCls(v):'';
    const nc=ci===nowCi?'now-col':''; return injectColCls(`<td class="${[cls,nc].filter(Boolean).join(' ')}">${v!=null?tempDisp(v)+'°':'<span class="empty">—</span>'}</td>`,(ndCls[ci]+' '+pastCls[ci]).trim());
  }).join('');

  // ── WIND ──
  const avgWind=indices.map(i=>wBlendAt('windspeed_10m',i,horizonOf(ref.time[i].slice(0,10))));
  const avgWindCells=avgWind.map((v,ci)=>{const nc=ci===nowCi?'now-col':'';return injectColCls(`<td class="${[v!=null?windCls(v):'',pastCls[ci]||'',nc].filter(Boolean).join(' ')}">${fmt(v,0)}</td>`,ndCls[ci]);}).join('');
  const avgDir=indices.map(i=>wBlendAt('winddirection_10m',i,horizonOf(ref.time[i].slice(0,10))));
  const avgDirCells=avgDir.map((v,ci)=>{const nc=ci===nowCi?'now-col':'';return injectColCls(`<td class="${['dir-cell',pastCls[ci]||'',nc].filter(Boolean).join(' ')}">${v!=null?dirArrow(v):'—'}</td>`,ndCls[ci]);}).join('');
  const windModelRows=allActive.map(m=>{
    const v=hVals(m.key,'windspeed_10m',indices);
    const cells=v.map((x,ci)=>{const nc=ci===nowCi?'now-col':'';return injectColCls(`<td class="${[x!=null?windCls(x):'',nc].filter(Boolean).join(' ')}">${fmt(x,0)}</td>`,ndCls[ci]);}).join('');
    return`<tr class="${srcRowClass(m,'wind')}"><td class="row-label"><span class="model-badge"><span class="mdot" style="background:${m.color}">${m.short}</span>${wBadge('wind',m.key)}</span></td>${cells}</tr>`;
  }).join('');

  // ── RAIN ──
  const rainModelRows=allActive.map(m=>{
    const v=hVals(m.key,'precipitation',indices);
    const cells=v.map((x,ci)=>{const cls=rainCls(x);const txt=x==null?'—':x<0.05?'<span class="empty">0</span>':x.toFixed(1);return injectColCls(`<td class="${cls}">${txt}</td>`,ndCls[ci]);}).join('');
    return`<tr class="${srcRowClass(m,'rain')}"><td class="row-label"><span class="model-badge"><span class="mdot" style="background:${m.color}">${m.short}</span>${wBadge('rain',m.key)}</span></td>${cells}</tr>`;
  }).join('');
  const avgRain=indices.map(i=>wBlendAt('precipitation',i,horizonOf(ref.time[i].slice(0,10))));
  const avgRainCells=avgRain.map((v,ci)=>{const cls=rainCls(v);const txt=v==null?'—':v<0.05?'<span class="empty">0</span>':v.toFixed(1);
    return injectColCls(`<td class="${cls}">${txt}</td>`,ndCls[ci]);
  }).join('');
  const confCellsFor=(key)=>indices.map((i,ci)=>{
    const c=confVisible[key]?confHourMetric(i,key):null; const nc=ci===nowCi?'now-col':'';
    const txt=c==null?'<span class="empty">–</span>':c+'%';
    const op=c==null?0.5:(0.4+c/100*0.6);
    return injectColCls(`<td class="${nc}" style="color:${MET_COLOR[key]};opacity:${op.toFixed(2)};font-weight:600">${txt}</td>`,ndCls[ci]);
  }).join('');
  const confRow=(key)=> confVisible[key]?`<tr class="data-row conf-row"><td class="row-label" style="font-size:12px;color:${MET_COLOR[key]};opacity:.85">Confidence</td>${confCellsFor(key)}</tr>`:'';

  const iconKey=onlyEnabled[0]?.key||allActive[0]?.key;
  const _cloudArrs=onlyEnabled.map(m=>({key:m.key,arr:hVals(m.key,'cloudcover',indices)}));
  const _rainArrs=onlyEnabled.map(m=>({key:m.key,arr:hVals(m.key,'precipitation',indices)}));
  const _rawCodes=hVals(iconKey,'weathercode',indices);
  const iconCells=indices.map((_,ci)=>{
    const cloud=weightedAvgOf(_cloudArrs.map(o=>({key:o.key,val:o.arr[ci]})),'cloud',hzAt(ci),'cloudcover');
    const rain=weightedAvgOf(_rainArrs.map(o=>({key:o.key,val:o.arr[ci]})),'rain',hzAt(ci));
    const code=deriveCondCode(rain,cloud,_rawCodes[ci]);
    const nc=ci===nowCi?'now-col':'';
    const t=ref.time[indices[ci]];
    const _ph=sunPhaseAt(t);
    return injectColCls(`<td class="${[pastCls[ci]||'',nc].filter(Boolean).join(' ')}">${wxIcon(code,_ph==='night',_ph)}</td>`,ndCls[ci]);
  }).join('');

  function buildActualCells(seriesH, field, indices, fmtFn, clsFn, nowCiRef){
    if(!seriesH)return indices.map(()=>'<td class="empty">–</td>').join('');
    const actTimes=seriesH.time||[];
    const actVals=seriesH[field]||[];
    const actMap={};actTimes.forEach((t,ai)=>{actMap[t]=ai;});
    const nowMs=locNowMs();
    return indices.map((hourIdx,ci)=>{
      const t=ref.time[hourIdx];
      if(new Date(t).getTime()>=nowMs)return '<td class="empty">–</td>';
      const ai=actMap[t];
      if(ai===undefined)return '<td class="empty">–</td>';
      const v=actVals[ai];
      if(v==null)return '<td class="empty">–</td>';
      const cls=clsFn?clsFn(v):''; const nc=(nowCiRef!==undefined&&ci===nowCiRef)?'now-col':'';
      return injectColCls(`<td class="${[cls,nc].filter(Boolean).join(' ')}">${fmtFn(v)}</td>`,ndCls[ci]);
    }).join('');
  }
  const _srcTag=({bom:'BOM',om:'Open-Meteo',blend:'Blend'})[actualSource]||'';
  function actualRow1(field, fmtFn, clsFn, color){
    if(!actualData||!showActuals)return '';
    const cells=buildActualCells(actualData.hourly,field,indices,fmtFn,clsFn,nowCi);
    return `<tr class="actual-row"><td class="row-label" style="color:${color}">✓ Actual<span class="act-src">${_srcTag}</span></td>${cells}</tr>`;
  }
  document.querySelector('.ftable').innerHTML=`
    <tbody>
      <tr class="hour-header"><th class="row-label corner-cell"></th>${hdrCells}</tr>
      <tr class="spacer"><td colspan="${C}"></td></tr>
      <tr class="icon-row"><td class="row-label" style="font-size:12px;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px">Cond.</td>${iconCells}</tr>
      <tr class="spacer"><td colspan="${C}"></td></tr>
    </tbody>
    ${secGroup('temp',`
      <tr class="sec-head-temp">${secHeadLabel('temp','Temp')}${avgTempCells}</tr>
      ${confRow('temp')}
      ${tempModelRows}
      ${actualRow1('temperature_2m',v=>tempDisp(v)+'°',tempCls,QT.temp)}
      <tr class="spacer"><td colspan="${C}"></td></tr>
    `)}
    ${secGroup('rain',`
      <tr class="sec-head-rain">${secHeadLabel('rain','Rain')}${avgRainCells}</tr>
      ${confRow('rain')}
      ${rainModelRows}
      ${actualRow1('precipitation',v=>v<0.05?'<span class="empty">0</span>':v.toFixed(1),rainCls,QT.rain)}
      <tr class="spacer"><td colspan="${C}"></td></tr>
    `)}
    ${secGroup('wind',`
      <tr class="sec-head-wind">${secHeadLabel('wind','Wind')}${avgWindCells}</tr>
      <tr class="data-row src-row src-wind${secDetail.wind?'':' src-hidden'}"><td class="row-label" style="font-size:13px;color:var(--text-dim)">Direction</td>${avgDirCells}</tr>
      ${confRow('wind')}
      ${windModelRows}
      ${actualRow1('windspeed_10m',v=>Math.round(v)+'',windCls,QT.wind)}
      <tr class="spacer"><td colspan="${C}"></td></tr>
    `)}
    ${secGroup("cloud",buildCloudSection(indices,ndCls,pastCls,nowCi,C,allActive,onlyEnabled,ref,actMap,confRow))}`;
  requestAnimationFrame(()=>scrollTableToSelected());
  positionNowOverlay();
}

// ── Horizontal daily table ──────────────────────────────────────────────
function renderDaily(){
  document.getElementById('table-wrap')?.classList.remove('vertical-mode');
  const allActive=activeAll();if(!allActive.length){renderHourly();return;}
  const onlyEnabled=activeEnabled();
  const firstKey=onlyEnabled[0]?.key||allActive[0].key;
  const ref=state.data[firstKey].daily;
  const now=locNowDate();
  const todayStr=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  let todaySi=ref.time.findIndex(t=>t>=todayStr);if(todaySi<0)todaySi=ref.time.length-1;
  const pastSi=Math.max(0,todaySi-7);
  const indices=Array.from({length:Math.min(17,ref.time.length-pastSi)},(_,i)=>pastSi+i);

  const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const hzAt=ci=>horizonOf(ref.time[indices[ci]]);
  const dayHdrs=indices.map(i=>{
    const d=new Date(ref.time[i]+'T12:00:00');
    const isToday=ref.time[i]===todayStr;
    const isPast=ref.time[i]<todayStr;
    return`<th class="${isToday?'now-col':''}${isPast?' past-col':''}" data-date="${ref.time[i]}" style="min-width:72px"><span class="col-day">${DAYS[d.getDay()]} ${d.getDate()}</span><span class="col-time">${d.toLocaleDateString('en-AU',{month:'short'})}</span></th>`;
  }).join('');

  function dVals(key,field){const d=state.data[key]?.daily;if(!d)return indices.map(()=>null);return indices.map(i=>d[field]?.[i]??null);}
  function dCloud(key,ci){
    const h=state.data[key]?.hourly;if(!h?.time)return null;
    const dateStr=ref.time[indices[ci]];let s=0,n=0;
    for(let k=0;k<h.time.length;k++){if(h.time[k].slice(0,10)===dateStr){const v=h.cloudcover?.[k];if(v!=null&&!isNaN(v)){s+=v;n++;}}}
    return n?s/n:null;
  }

  const _dRaw=dVals(firstKey,'weathercode');
  const iconCells=indices.map((_,ci)=>{
    const cloud=weightedAvgOf(onlyEnabled.map(m=>({key:m.key,val:dCloud(m.key,ci)})),'cloud',hzAt(ci),'cloudcover');
    const rainSum=weightedAvgOf(onlyEnabled.map(m=>({key:m.key,val:dVals(m.key,'precipitation_sum')[ci]})),'rain',hzAt(ci));
    return `<td>${wxIcon(deriveDailyCode(rainSum,cloud,_dRaw[ci]))}</td>`;
  }).join('');
  const C=indices.length+1;

  // ── TEMP ──
  const tempModelRows=allActive.map(m=>{
    const mx=dVals(m.key,'temperature_2m_max'),mn=dVals(m.key,'temperature_2m_min');
    const cells=mx.map((hi,ci)=>{
      const lo=mn[ci],cls=hi!=null?tempCls(hi):'',loCls=lo!=null?tempCls(lo):'';
      return (hi==null&&lo==null)?`<td class="${cls}"><span class="empty">—</span></td>`:`<td class="${cls}">↑${hi!=null?tempDisp(hi)+'°':'—'} <span class="${loCls}" style="font-size:13px">↓${lo!=null?tempDisp(lo)+'°':'—'}</span></td>`;
    }).join('');
    return`<tr class="${srcRowClass(m,'temp')}"><td class="row-label"><span class="model-badge"><span class="mdot" style="background:${m.color}">${m.short}</span>${wBadge('temp',m.key)}</span></td>${cells}</tr>`;
  }).join('');
  const avgMax=indices.map((_,ci)=>weightedAvgOf(onlyEnabled.map(m=>({key:m.key,val:dVals(m.key,'temperature_2m_max')[ci]})),'temp',hzAt(ci),'temperature_2m_max'));
  const avgMin=indices.map((_,ci)=>weightedAvgOf(onlyEnabled.map(m=>({key:m.key,val:dVals(m.key,'temperature_2m_min')[ci]})),'temp',hzAt(ci),'temperature_2m_min'));
  const avgTempCells=avgMax.map((hi,ci)=>{
    const lo=avgMin[ci],cls=hi!=null?tempCls(hi):'';
    const loCls=lo!=null?tempCls(lo):'';
    return (hi==null&&lo==null)?`<td class="${cls}"><span class="empty">—</span></td>`:`<td class="${cls}">↑${hi!=null?tempDisp(hi)+'°':'—'} <span class="${loCls}" style="font-size:13px">↓${lo!=null?tempDisp(lo)+'°':'—'}</span></td>`;
  }).join('');
  const actualTempCells=indices.map(i=>{
    const dateStr=ref.time[i];
    if(dateStr>=todayStr)return'<td class="empty">–</td>';
    if(!actualData?.daily)return'<td class="empty">–</td>';
    const ai=actualData.daily.time?.findIndex(t=>t===dateStr)??-1;
    if(ai<0)return'<td class="empty">–</td>';
    const hi=actualData.daily.temperature_2m_max?.[ai];
    const lo=actualData.daily.temperature_2m_min?.[ai];
    const cls=hi!=null?tempCls(hi):'',loCls=lo!=null?tempCls(lo):'';
    return (hi==null&&lo==null)?`<td class="${cls}"><span class="empty">—</span></td>`:`<td class="${cls}">↑${hi!=null?tempDisp(hi)+'°':'–'} <span class="${loCls}" style="font-size:13px">↓${lo!=null?tempDisp(lo)+'°':'–'}</span></td>`;
  }).join('');

  // ── WIND ──
  const avgWind=indices.map((_,ci)=>weightedAvgOf(onlyEnabled.map(m=>({key:m.key,val:dVals(m.key,'windspeed_10m_max')[ci]})),'wind',hzAt(ci),'windspeed_10m_max'));
  const avgWindCells=avgWind.map(v=>`<td class="${v!=null?windCls(v):''}">${fmt(v,0)}</td>`).join('');
  const windModelRows=allActive.map(m=>{
    const v=dVals(m.key,'windspeed_10m_max');
    const cells=v.map(x=>`<td class="${x!=null?windCls(x):''}">${fmt(x,0)}</td>`).join('');
    return`<tr class="${srcRowClass(m,'wind')}"><td class="row-label"><span class="model-badge"><span class="mdot" style="background:${m.color}">${m.short}</span>${wBadge('wind',m.key)}</span></td>${cells}</tr>`;
  }).join('');

  // ── RAIN ──
  const rainModelRows=allActive.map(m=>{
    const v=dVals(m.key,'precipitation_sum');
    const cells=v.map(x=>{const cls=rainCls(x),txt=x==null?'—':x<0.1?'<span class="empty">0</span>':x.toFixed(1);return`<td class="${cls}">${txt}</td>`;}).join('');
    return`<tr class="${srcRowClass(m,'rain')}"><td class="row-label"><span class="model-badge"><span class="mdot" style="background:${m.color}">${m.short}</span>${wBadge('rain',m.key)}</span></td>${cells}</tr>`;
  }).join('');
  const avgRain=indices.map((_,ci)=>weightedAvgOf(onlyEnabled.map(m=>({key:m.key,val:dVals(m.key,'precipitation_sum')[ci]})),'rain',hzAt(ci)));
  const avgRainCells=avgRain.map(v=>{const cls=rainCls(v),txt=v==null?'—':v<0.1?'<span class="empty">0</span>':v.toFixed(1);return`<td class="${cls}">${txt}</td>`;}).join('');

  // ── CLOUD ──
  const avgCloud=indices.map((_,ci)=>weightedAvgOf(onlyEnabled.map(m=>({key:m.key,val:dCloud(m.key,ci)})),'cloud',hzAt(ci),'cloudcover'));
  const avgCloudCells=avgCloud.map(v=>{const cls=cloudCls(v);return`<td class="${cls}">${v!=null?Math.round(v)+'%':'—'}</td>`;}).join('');
  const cloudModelRows=allActive.map(m=>{
    const cells=indices.map((_,ci)=>{const x=dCloud(m.key,ci);const cls=cloudCls(x);return`<td class="${cls}">${x!=null?Math.round(x)+'%':'—'}</td>`;}).join('');
    return`<tr class="${srcRowClass(m,'cloud')}"><td class="row-label"><span class="model-badge"><span class="mdot" style="background:${m.color}">${m.short}</span>${wBadge('cloud',m.key)}</span></td>${cells}</tr>`;
  }).join('');

  const actualRainCells=indices.map(i=>{
    const dateStr=ref.time[i];
    if(dateStr>=todayStr)return'<td class="empty">–</td>';
    if(!actualData?.daily)return'<td class="empty">–</td>';
    const ai=actualData.daily.time?.findIndex(t=>t===dateStr)??-1;
    if(ai<0)return'<td class="empty">–</td>';
    const v=actualData.daily.precipitation_sum?.[ai];
    const cls=rainCls(v);
    return`<td class="${cls}">${v!=null?(v<0.1?'<span class="empty">0</span>':v.toFixed(1)):'–'}</td>`;
  }).join('');

  document.querySelector('.ftable').innerHTML=`
    <tbody>
      <tr class="hour-header"><th class="row-label corner-cell"></th>${dayHdrs}</tr>
      <tr class="spacer"><td colspan="${C}"></td></tr>
      <tr class="icon-row"><td class="row-label" style="font-size:12px;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px">Cond.</td>${iconCells}</tr>
      <tr class="spacer"><td colspan="${C}"></td></tr>
    </tbody>
    ${secGroup('temp',`
      <tr class="sec-head-temp">${secHeadLabel('temp','Temp')}${avgTempCells}</tr>
      ${tempModelRows}
      ${actualData&&showActuals?`<tr class="actual-row"><td class="row-label" style="color:${QT.temp}">✓ Actual</td>${actualTempCells}</tr>`:''}
      <tr class="spacer"><td colspan="${C}"></td></tr>
    `)}
    ${secGroup('rain',`
      <tr class="sec-head-rain">${secHeadLabel('rain','Rain')}${avgRainCells}</tr>
      ${rainModelRows}
      ${actualData&&showActuals?`<tr class="actual-row"><td class="row-label" style="color:${QT.rain}">✓ Actual</td>${actualRainCells}</tr>`:''}
      <tr class="spacer"><td colspan="${C}"></td></tr>
    `)}
    ${secGroup('wind',`
      <tr class="sec-head-wind">${secHeadLabel('wind','Wind')}${avgWindCells}</tr>
      ${windModelRows}
      <tr class="spacer"><td colspan="${C}"></td></tr>
    `)}
    ${secGroup('cloud',`
      <tr class="sec-head-temp">${secHeadLabel('cloud','Cloud')}${avgCloudCells}</tr>
      ${cloudModelRows}
    `)}`;

  requestAnimationFrame(()=>scrollTableToSelected());
  positionNowOverlay();
}

// ── Status / errors / modals ────────────────────────────────────────────
function setStatus(type,msg){
  document.getElementById('status-dot').className='dot'+(type==='spin'?' spin':type==='err'?' err':'');
  document.getElementById('status-text').textContent=msg;
}
function updatePills(){
  document.getElementById('model-pills').innerHTML=MODELS.map(m=>{
    const s=state.status[m.key]||'load';
    return`<span class="mpill ${s==='ok'?'ok':s==='fail'?'fail':'load'}">${s==='ok'?'✓':s==='fail'?'✗':'…'} ${m.label}</span>`;
  }).join(' ');
}
function showErr(msg){document.getElementById('err-area').innerHTML=`<div class="err-banner">⚠️ ${msg}</div>`;}
function showCityPrompt(msg){
  document.getElementById('city-prompt-msg').textContent=msg||'Start typing a town or city.';
  document.getElementById('city-input').value='';
  const box=document.getElementById('city-results'); if(box)box.innerHTML='';
  document.getElementById('city-overlay').classList.remove('hidden');
  setTimeout(()=>document.getElementById('city-input').focus(),100);
}
function hideCityPrompt(){
  document.getElementById('city-overlay').classList.add('hidden');
}
function submitCity(){
  const v=document.getElementById('city-input').value.trim();
  if(!v)return;
  hideCityPrompt();
  geocodeCity(v);
}
function tryGPS(){
  hideCityPrompt();
  clearSavedLocation();
  if(!navigator.geolocation){showCityPrompt('GPS not available. Enter your city:');return;}
  navigator.geolocation.getCurrentPosition(
    pos=>{
      state.lat=pos.coords.latitude;state.lon=pos.coords.longitude;
      reverseGeocode(state.lat,state.lon);fetchAllModels();
    },
    ()=>showCityPrompt('GPS denied. Please enter your city:'),
    {timeout:10000,maximumAge:0,enableHighAccuracy:false}
  );
}
function showHelp(){document.getElementById('help-overlay').classList.remove('hidden');}
function hideHelp(e){if(!e||e.target===document.getElementById('help-overlay'))document.getElementById('help-overlay').classList.add('hidden');}
function showAccuracy(){ renderAccuracyPanel(); document.getElementById('acc-overlay').classList.remove('hidden'); }
function hideAccuracy(e){ if(!e||e.target===document.getElementById('acc-overlay'))document.getElementById('acc-overlay').classList.add('hidden'); }

// ── Accuracy panel ──────────────────────────────────────────────────────
const _MET_LABEL={temp:'Temp °',rain:'Rain mm',wind:'Wind',cloud:'Cloud %'};
function renderAccuracyPanel(){
  const sub=document.getElementById('acc-sub'), body=document.getElementById('acc-body');
  if(!body)return;
  const j=accuracyMeta;
  if(!bomWorkerConfigured()){
    sub.textContent='';
    body.innerHTML='<div class="acc-status none">The accuracy tracker needs the BOM Worker configured (set BOM_WORKER_URL). Once forecasts and BOM observations are recorded, learned per-model accuracy appears here.</div>';
    return;
  }
  if(!j||j.error||(!j.stats||!j.stats.length)){
    sub.textContent='';
    const d=j&&j.days||0, need=j&&j.matureAt||14;
    body.innerHTML=`<div class="acc-status none">No verified forecasts yet for this station${_trackStation?` (WMO ${_trackStation})`:''}. The tracker records today's forecasts now and verifies them against BOM observations once those days pass — check back after a few days. ${d?`(${d}/${need} days collected)`:''}</div>`;
    return;
  }
  const mature=!!j.mature;
  sub.textContent=`Station WMO ${j.station} · ${j.pairs} forecast–observation pairs over the last ${j.window} days`;
  const statusCls=mature?'learned':'live';
  const statusTxt=mature
    ? `✓ Blend is using learned weights and bias corrections from ${j.days} days of verified forecasts.`
    : `Learning — ${j.days}/${j.matureAt} verified days collected. Using live weighting until mature.`;
  const METS=['temp','rain','wind','cloud'];
  const _modelKeys=new Set(MODELS.map(m=>m.key));
  j.stats=(j.stats||[]).filter(s=>_modelKeys.has(s.model));
  if(!j.stats.length){ body.innerHTML='<div class="acc-status none">No verified forecasts yet for this station. Check back after a few days.</div>'; return; }
  const best={}; METS.forEach(m=>{ let bv=Infinity,bk=null; j.stats.forEach(s=>{ if(s[m]!=null&&s[m]<bv){bv=s[m];bk=s.model;} }); best[m]=bk; });
  const wmap=(j&&j.weights)||{};
  const bmap=(j&&j.biases)||{};
  const colorOf=k=>(MODELS.find(m=>m.key===k)||{}).color||'#8d897e';
  const shortOf=k=>(MODELS.find(m=>m.key===k)||{}).short||'?';
  const labelOf=k=>(MODELS.find(m=>m.key===k)||{}).label||k;
  const fmt=(v,m)=>v==null?'<span class="acc-na">–</span>':(m==='cloud'||m==='wind'?Math.round(v):v.toFixed(1));
  const biasCell=(s,m)=>{
    const bm={temp:bmap.temp,wind:bmap.wind,cloud:bmap.cloud}[m];
    const b=bm?bm[s.model]:null;
    if(b==null||!isFinite(b)||b===0)return '';
    const big=Math.abs(b)>=(m==='temp'?0.3:m==='wind'?2:5);
    const v=m==='cloud'?Math.round(b):(+b).toFixed(1);
    return `<div class="acc-w"${big?' style="color:var(--text-primary);font-weight:700"':''}>${b>0?'+':''}${v} bias</div>`;
  };
  const rainCell=s=> s.occErr!=null?`<div class="acc-w">occ ${Math.round(s.occErr*100)}% off</div>`:'';
  const rows=j.stats.slice().sort((a,b)=>(a.temp??99)-(b.temp??99)).map(s=>{
    const cells=METS.map(m=>{
      const w=(wmap[m]||{})[s.model];
      const wTxt=w!=null?`<div class="acc-w">${Math.round(w*100)}%</div>`:'';
      const extra=m==='rain'?rainCell(s):biasCell(s,m);
      const cls='acc-err'+(best[m]===s.model?' acc-best':'');
      return `<td><span class="${cls}">${fmt(s[m],m)}</span>${wTxt}${extra}</td>`;
    }).join('');
    return `<tr><td><span class="acc-mdot" style="background:${colorOf(s.model)}">${shortOf(s.model)}</span>${labelOf(s.model)}</td>${cells}</tr>`;
  }).join('');
  body.innerHTML=`
    <div class="acc-status ${statusCls}">${statusTxt}</div>
    <table class="acc-table">
      <thead><tr><th>Model</th>${METS.map(m=>`<th>${_MET_LABEL[m]}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="acc-note">Figures are average error (RMSE) vs BOM observations — lower is better; the greenest value leads each column. Under each: that model's blend weight, then its learned <em>bias</em> (forecast − observed) which the blend now subtracts before averaging. Rain shows how often the model called wet/dry days wrong ("occ"); rain weights use occurrence + wet-day error, not RMSE. Only BOM-observed days are scored.</div>
    <div class="acc-h-head"><span>Error by lead time</span>
      <span class="acc-h-tabs">
        ${METS.map(m=>`<button class="acc-h-tab${m===_horizonMetric?' active':''}" data-m="${m}" onclick="loadHorizon('${m}')">${m[0].toUpperCase()+m.slice(1)}</button>`).join('')}
      </span>
    </div>
    <div id="acc-horizon"><div class="acc-na" style="padding:8px 2px">Loading…</div></div>`;
  loadHorizon(_horizonMetric);
}

const _HBUCKETS=[[1,1,'1d'],[2,2,'2d'],[3,3,'3d'],[4,5,'4–5d'],[6,7,'6–7d']];
async function loadHorizon(metric){
  _horizonMetric=metric;
  document.querySelectorAll('.acc-h-tab').forEach(b=>b.classList.toggle('active',b.dataset.m===metric));
  const host=document.getElementById('acc-horizon'); if(!host)return;
  if(!_trackStation){host.innerHTML='<div class="acc-na" style="padding:8px 2px">No station yet.</div>';return;}
  let j=_horizonCache[metric];
  if(!j){
    host.innerHTML='<div class="acc-na" style="padding:8px 2px">Loading…</div>';
    try{ const ll=`&lat=${state.lat}&lon=${state.lon}`; const r=await fetch(`${BOM_WORKER_URL}/track/horizon?station=${encodeURIComponent(_trackStation)}${ll}&days=${learnDays}&metric=${metric}`,{signal:AbortSignal.timeout(30000)}); j=await r.json(); _horizonCache[metric]=j; }
    catch(e){ host.innerHTML='<div class="acc-na" style="padding:8px 2px">Could not load lead-time data.</div>'; return; }
  }
  host.innerHTML=horizonMatrixHTML(j,metric);
}
function horizonMatrixHTML(j,metric){
  const rows=(j&&j.rows)||[];
  if(!rows.length) return '<div class="acc-na" style="padding:8px 2px">Not enough verified forecasts yet to break this down by lead time.</div>';
  const byModel={};
  rows.forEach(r=>{ (byModel[r.model]||(byModel[r.model]={}))[r.h]={rmse:r.rmse,n:r.n}; });
  const fmt=v=>v==null?'–':((metric==='cloud'||metric==='wind')?Math.round(v):v.toFixed(1));
  const colorOf=k=>(MODELS.find(m=>m.key===k)||{}).color||'#8d897e';
  const shortOf=k=>(MODELS.find(m=>m.key===k)||{}).short||'?';
  const models=Object.keys(byModel).sort((a,b)=>MODELS.findIndex(m=>m.key===a)-MODELS.findIndex(m=>m.key===b));
  const cell={};
  models.forEach(mk=>{ cell[mk]=_HBUCKETS.map(([lo,hi])=>{
    let sw=0,sn=0; for(let h=lo;h<=hi;h++){const c=byModel[mk][h]; if(c&&c.rmse!=null&&c.n){sw+=c.rmse*c.rmse*c.n; sn+=c.n;}}
    return sn?Math.sqrt(sw/sn):null;
  });});
  const best=_HBUCKETS.map((_,bi)=>{ let bv=Infinity,bk=null; models.forEach(mk=>{const v=cell[mk][bi]; if(v!=null&&v<bv){bv=v;bk=mk;}}); return bk; });
  const head=`<tr><th>Model</th>${_HBUCKETS.map(b=>`<th>${b[2]}</th>`).join('')}</tr>`;
  const tb=models.map(mk=>`<tr><td><span class="acc-mdot" style="background:${colorOf(mk)}">${shortOf(mk)}</span></td>${cell[mk].map((v,bi)=>`<td><span class="acc-err${best[bi]===mk?' acc-best':''}">${fmt(v)}</span></td>`).join('')}</tr>`).join('');
  return `<table class="acc-table acc-h-table"><thead>${head}</thead><tbody>${tb}</tbody></table>
          <div class="acc-note">Same RMSE-vs-BOM measure, split by how many days ahead the forecast was made. Watch the error grow with lead time — and see which model holds up best at long range.</div>`;
}
// ═══ end app.js (phase 2) 
