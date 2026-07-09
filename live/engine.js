// ════════════════════════════════════════════════════════════════════════
// WeatherBlend — engine.js  (data, blending, accuracy · Phase 1)
// ════════════════════════════════════════════════════════════════════════
// Load order: engine.js FIRST, then app.js. This file owns:
//   • all shared mutable state (prefs, weights, actuals, caches)
//   • model fetching (Open-Meteo) + BOM observations via the Worker
//   • the blend: per-metric per-horizon weights + bias correction
//   • live accuracy scoring (recency / per-day) with shrinkage
//   • server accuracy sync (/track/sync, /track/weights)
// It calls these app.js functions at runtime (UI layer):
//   renderCurrentBar, renderTable, buildSourcesPanel, renderSkeleton,
//   setStatus, updatePills, showErr, scheduleAutoRefresh,
//   renderAccuracyPanel, hourTileData, deriveDailyCode
// ════════════════════════════════════════════════════════════════════════

// ── On-page debug logger ────────────────────────────────────────────────
let _dbgBuffer=[];
function dbg(msg){
  try{
    const t=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const line='['+t+'] '+msg;
    console.log(line);
    _dbgBuffer.push(line);
    const el=document.getElementById('debug-lines');
    if(el){ el.textContent=_dbgBuffer.join('\n'); el.scrollTop=el.scrollHeight; }
  }catch(e){}
}
window.addEventListener('error', ev=>{
  dbg('❌ JS ERROR: '+(ev.message||'')+' @ '+((ev.filename||'').split('/').pop())+':'+ev.lineno);
});
window.addEventListener('unhandledrejection', ev=>{
  dbg('❌ PROMISE REJECTION: '+(ev.reason&&ev.reason.message?ev.reason.message:ev.reason));
});
dbg('engine.js loaded');

// ── Models ──────────────────────────────────────────────────────────────
const MODELS = [
  { key:'gfs_seamless',      ep:'/v1/forecast', label:'GFS',   short:'G', color:'#232019', desc:'NOAA · USA'      },
  { key:'ecmwf_ifs025',      ep:'/v1/ecmwf',    label:'ECMWF', short:'E', color:'#332f28', desc:'ECMWF · 0.25°'   },
  { key:'icon_seamless',     ep:'/v1/forecast', label:'ICON',  short:'I', color:'#413c33', desc:'DWD · Germany'   },
  { key:'gem_seamless',      ep:'/v1/forecast', label:'GEM',   short:'C', color:'#4f4a40', desc:'Env. Canada'     },
  { key:'ukmo_seamless',     ep:'/v1/forecast', label:'UKMO',  short:'U', color:'#5c584e', desc:'Met Office · UK' },
  { key:'cma_grapes_global', ep:'/v1/forecast', label:'CMA',   short:'X', color:'#69645a', desc:'CMA · China'     },
  { key:'jma_seamless',      ep:'/v1/forecast', label:'JMA',   short:'J', color:'#767065', desc:'JMA · Japan'     }
];
const enabled    = new Set(MODELS.map(m=>m.key));
const autoHidden = new Set();

// ── Shared state (single home for every cross-file global) ─────────────
// UI prefs (rendered by app.js, persisted in prefs)
let showDetail = false;
const secVisible = { temp:true, wind:true, rain:true, cloud:true };
const secDetail  = { temp:false, rain:false, wind:false, cloud:false };
let useWeightedAvg = true;
let verticalLayout = false;
let showDebug = false;
let showActuals = true;
let showPredLine = false;
let confVisible = {temp:false,rain:true,wind:false,cloud:false};
let sectionsVisible = {cards:true,table:false,map:false};
// Engine state
let cachedCurrent = null;
let firstRenderDone = false;
let cachedForecastRain = null;
let cachedHiLo = null;
let modelWeights = {};
let metricWeights = {temp:{},rain:{},wind:{},cloud:{}};
let metricWeightsByH = {};
let actualSources = null;
let actualSource = 'bom';
let learnDays = 60;                 // Phase 1: default window 35 → 60 days
let weightMethod = 'current';
let weightDays = 3;
let actualData = null;
let manualLocationOverride = false;
let locationOffsetSec = null;
let selDate = null;
let _lastCoordsKey = null;
let state = { lat:null, lon:null, data:{}, status:{}, view:'1h', ss:{} };
let autoRefreshTimer=null, nextRefreshAt=null;
const AUTO_MS = 60*60*1000;
// Learned (server) accuracy artefacts
let historicalWeights=null, historicalWeightsByH=null;
let historicalBiases=null,  historicalBiasesByH=null;    // Phase 1
let activeBiases=null,      activeBiasesByH=null;        // what blending uses
let accuracyStats=null, accuracyMeta=null, _trackStation=null;
let _horizonCache={}, _horizonMetric='temp';

// ── Phase-1 weighting constants (mirrors the Worker) ───────────────────
const SHRINK_K = 60;    // sample count before learned skill outranks equal
const W_FLOOR  = 0.03;  // no model fully silenced
const W_CAP    = 0.40;  // no model dominates
// Fields eligible for bias correction. Wind DIRECTION and weather codes are
// deliberately absent; rain is deliberately absent (subtracting a rain bias
// can invent or erase precipitation).
const BIAS_FIELDS = {
  temperature_2m:'temp', temperature_2m_max:'temp', temperature_2m_min:'temp',
  windspeed_10m:'wind',  windspeed_10m_max:'wind',
  cloudcover:'cloud'
};

// Inverse-SQUARED-error skill, shrunk toward equal by n/(n+SHRINK_K),
// clamped to [W_FLOOR, W_CAP], renormalised. errMap: key->err (lower better,
// may be missing); nMap: key->sample count; keys: all active model keys.
function _shrinkClampNorm(errMap, nMap, keys){
  const M=keys.length||1;
  const raw={}; let rsum=0;
  keys.forEach(k=>{
    const e=errMap[k];
    if(e!=null&&isFinite(e)){ raw[k]=1/Math.pow(Math.max(0.05,e),2); rsum+=raw[k]; }
  });
  const w={};
  keys.forEach(k=>{
    const prov=(rsum>0&&raw[k]!=null)?raw[k]/rsum:1/M;
    const n=nMap[k]||0, lam=n/(n+SHRINK_K);
    w[k]=lam*prov+(1-lam)*(1/M);
  });
  keys.forEach(k=>{ w[k]=Math.min(W_CAP,Math.max(W_FLOOR,w[k])); });
  const sum=keys.reduce((a,k)=>a+w[k],0)||1;
  keys.forEach(k=>w[k]/=sum);
  return w;
}

// Learned bias for one model at a lead time (°C / km/h / cloud-%).
// bias = forecast − observed, so blending subtracts it.
function biasOf(sec,key,horizon){
  let src=null;
  if(horizon!=null&&activeBiasesByH){
    const eff=Math.min(7,Math.max(1,horizon));
    const set=activeBiasesByH[eff];
    if(set&&set[sec])src=set[sec];
  }
  if(!src&&activeBiases)src=activeBiases[sec];
  const b=src?src[key]:null;
  return (b!=null&&isFinite(b))?b:0;
}

// ── Time helpers (location-local wall clock) ────────────────────────────
function locNowDate(){
  const off=(typeof locationOffsetSec==='number'?locationOffsetSec:-new Date().getTimezoneOffset()*60);
  const d=new Date(Date.now()+off*1000);
  return new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds());
}
function locNowMs(){ return locNowDate().getTime(); }
function locNowLabel(){ return locNowDate().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}); }
function localTodayStr(){const n=locNowDate();const p=x=>String(x).padStart(2,'0');return `${n.getFullYear()}-${p(n.getMonth()+1)}-${p(n.getDate())}`;}

function carouselDates(){
  const onlyEnabled=activeEnabled();if(!onlyEnabled.length)return [];
  const ref=state.data[onlyEnabled[0].key]?.hourly;if(!ref?.time)return [];
  return [...new Set(ref.time.map(t=>t.slice(0,10)))].sort();
}

// ── Small helpers ───────────────────────────────────────────────────────
function avgOf(arr){const v=arr.filter(x=>x!=null&&!isNaN(x));return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;}
// A rain cell is 0 when <0.05mm, else rounded to 0.1mm (tables & cards agree)
function _rcell(v){ return (v==null||v<0.05)?0:Math.round(v*10)/10; }
function activeEnabled(){return MODELS.filter(m=>state.data[m.key]&&enabled.has(m.key)&&!autoHidden.has(m.key));}
function activeAll(){return MODELS.filter(m=>state.data[m.key]);}
function refHourly(){const a=activeEnabled();return a.length?state.data[a[0].key]?.hourly:null;}
function refDaily(){const a=activeEnabled();return a.length?state.data[a[0].key]?.daily:null;}

// Open-Meteo renamed fields (cloud_cover, wind_speed_10m, …) — map back to
// the legacy keys the rest of the code reads.
function normalizeOM(j){
  const map=(o,oldK,newK)=>{ if(o && o[oldK]==null && o[newK]!=null) o[oldK]=o[newK]; };
  if(j && j.hourly){
    map(j.hourly,'cloudcover','cloud_cover');
    map(j.hourly,'windspeed_10m','wind_speed_10m');
    map(j.hourly,'winddirection_10m','wind_direction_10m');
    map(j.hourly,'weathercode','weather_code');
  }
  if(j && j.daily){
    map(j.daily,'windspeed_10m_max','wind_speed_10m_max');
    map(j.daily,'winddirection_10m_dominant','wind_direction_10m_dominant');
    map(j.daily,'weathercode','weather_code');
  }
}

// Equal-weight blend at a ref index (used for the Open-Meteo fallback actuals)
function meanAt(field,idx){
  const a=activeEnabled();
  const vals=a.map(m=>state.data[m.key]?.hourly?.[field]?.[idx]).filter(v=>v!=null&&!isNaN(v));
  return vals.length?vals.reduce((s,v)=>s+v,0)/vals.length:null;
}

// Per-model window values for the table (sum rain, avg others, first for dir/code)
function hVals(key,field,indices){
  const d=state.data[key];if(!d)return indices.map(()=>null);
  const arr=d.hourly[field];if(!arr)return indices.map(()=>null);
  const step=state.view==='3h'?3:state.view==='8h'?8:1;
  if(step===1)return indices.map(i=>arr[i]??null);
  const isSum=(field==='precipitation');
  const isFirst=(field==='weathercode'||field==='winddirection_10m');
  if(isFirst)return indices.map(i=>arr[i]??null);
  return indices.map(i=>{
    let sum=0,cnt=0;
    for(let k=0;k<step;k++){
      const v=arr[i+k];
      if(v!=null&&!isNaN(v)){sum+=v;cnt++;}
    }
    if(cnt===0)return null;
    return isSum?sum:sum/cnt;
  });
}

// ── Weighted, bias-corrected blending ───────────────────────────────────
function fieldSec(field){
  if(/temperature/.test(field))return'temp';
  if(/precipitation/.test(field))return'rain';
  if(/wind/.test(field))return'wind';
  if(/cloud/.test(field))return'cloud';
  return null;
}
// Lead time (whole days) of a date from today: today=0, tomorrow=1, …
function horizonOf(dateStr){
  if(!dateStr)return null;
  return Math.round((new Date(dateStr+'T12:00:00')-new Date(localTodayStr()+'T12:00:00'))/86400000);
}
// Weight map for a metric at a lead time; learned per-horizon sets take
// precedence, else pooled.
function weightsForH(sec,horizon){
  if(horizon!=null && metricWeightsByH && Object.keys(metricWeightsByH).length){
    const eff=Math.min(7,Math.max(1,horizon));
    const set=metricWeightsByH[eff];
    if(set && set[sec] && Object.keys(set[sec]).length)return set[sec];
  }
  return (metricWeights[sec]&&Object.keys(metricWeights[sec]).length)?metricWeights[sec]:null;
}
// The blend. `field` (optional) enables per-model bias correction for
// temp / wind speed / cloud only — see BIAS_FIELDS.
function weightedAvgOf(modelValPairs,sec,horizon,field){
  let pairs=modelValPairs.filter(p=>p.val!=null&&!isNaN(p.val));
  if(!pairs.length)return null;
  const bsec=field?BIAS_FIELDS[field]:null;
  if(bsec&&(activeBiases||activeBiasesByH)){
    pairs=pairs.map(p=>({key:p.key,val:p.val-biasOf(bsec,p.key,horizon)}));
  }
  const Wmap=sec?weightsForH(sec,horizon):null;
  const W=(Wmap&&Object.keys(Wmap).length)?Wmap:modelWeights;
  let res;
  if(!useWeightedAvg||!Object.keys(W).length){
    res=pairs.reduce((s,p)=>s+p.val,0)/pairs.length;
  }else{
    const totalW=pairs.reduce((s,p)=>s+(W[p.key]||0),0);
    res= totalW===0
      ? pairs.reduce((s,p)=>s+p.val,0)/pairs.length
      : pairs.reduce((s,p)=>s+p.val*(W[p.key]||0),0)/totalW;
  }
  if(bsec==='wind')res=Math.max(0,res);
  else if(bsec==='cloud')res=Math.max(0,Math.min(100,res));
  return res;
}
// Horizon-aware blended value at a ref index, window-aggregated to the view.
function wBlendAt(field,i,horizon){
  const step=state.view==='3h'?3:state.view==='8h'?8:1;
  const a=activeEnabled(); if(!a.length)return null;
  const isFirst=(field==='winddirection_10m'||field==='weathercode');
  const isSum=(field==='precipitation');
  const pairs=a.map(m=>{
    const arr=state.data[m.key]?.hourly?.[field];
    if(!arr)return {key:m.key,val:null};
    if(step===1||isFirst)return {key:m.key,val:arr[i]??null};
    let sum=0,cnt=0;
    for(let k=0;k<step;k++){const v=arr[i+k];if(v!=null&&!isNaN(v)){sum+=v;cnt++;}}
    if(!cnt)return {key:m.key,val:null};
    return {key:m.key,val:isSum?sum:sum/cnt};
  });
  return weightedAvgOf(pairs,fieldSec(field),horizon,field);
}
// Observed value over the same window, index-aligned to the ref grid
function actWindowAt(field,idx,step){
  if(!actualData||!actualData.hourly||!actualData.hourly.time)return null;
  const arr=actualData.hourly[field]; if(!arr)return null;
  const isSum=(field==='precipitation');
  let sum=0,cnt=0;
  for(let k=0;k<step;k++){const v=arr[idx+k];if(v!=null&&!isNaN(v)){sum+=v;cnt++;}}
  if(!cnt)return null;
  return isSum?sum:sum/cnt;
}

// ── Fetch: the 7 global models ──────────────────────────────────────────
async function fetchAllModels(){
  dbg(`=== fetchAllModels: lat=${state.lat}, lon=${state.lon} ===`);
  state.data={};state.status={};state.ss={};
  autoHidden.clear();
  MODELS.forEach(m=>enabled.add(m.key));
  cachedCurrent=null;cachedForecastRain=null;
  MODELS.forEach(m=>{state.status[m.key]='load';});
  setStatus('spin',`Fetching ${MODELS.length} models…`);
  buildSourcesPanel();
  updatePills();renderSkeleton();
  fetchCurrentConditions();

  locationOffsetSec=null;

  await Promise.all(MODELS.map(async m=>{
    try{
      const url=`https://api.open-meteo.com${m.ep}`
        +`?latitude=${state.lat}&longitude=${state.lon}`
        +`&hourly=precipitation,wind_speed_10m,wind_direction_10m,temperature_2m,weather_code,cloud_cover,relative_humidity_2m`
        +`&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,`
        +`wind_speed_10m_max,wind_direction_10m_dominant,sunrise,sunset,uv_index_max`
        +`&models=${m.key}&past_days=7&forecast_days=10&timezone=auto&wind_speed_unit=kmh`;
      const res=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const json=await res.json();if(json.error)throw new Error(json.reason||'API error');
      normalizeOM(json);
      if(!json.hourly?.temperature_2m?.some(v=>v!=null))throw new Error('No data');
      state.data[m.key]=json;state.status[m.key]='ok';
      if(locationOffsetSec==null&&typeof json.utc_offset_seconds==='number')locationOffsetSec=json.utc_offset_seconds;
      if(!state.ss.loaded&&json.daily?.sunrise){
        state.ss.rise=json.daily.sunrise;state.ss.set=json.daily.sunset;
        state.ss.dates=json.daily.time;state.ss.loaded=true;
      }
    }catch(e){console.warn(m.key,e.message);state.status[m.key]='fail';autoHidden.add(m.key);}
    updatePills();
  }));

  if(locationOffsetSec==null)locationOffsetSec=-new Date().getTimezoneOffset()*60;

  MODELS.forEach(m=>{
    const el=document.getElementById('toggle-'+m.key);if(!el)return;
    if(autoHidden.has(m.key)){
      el.className='model-toggle unavail';
      el.innerHTML=`<span class="mdot" style="background:${m.color};opacity:.5">${m.short}</span><span class="mname">${m.label}</span><span class="munavail">unavailable</span>`;
    }
  });

  const ok=MODELS.filter(m=>state.status[m.key]==='ok').length;
  dbg(`models loaded: ${ok}/${MODELS.length} ok`);
  if(!ok){showErr('All models failed.');setStatus('err','No data');dbg('❌ all models failed — aborting');return;}
  document.getElementById('err-area').innerHTML='';
  const failed=MODELS.filter(m=>state.status[m.key]==='fail').map(m=>m.label);
  const t=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  setStatus('ok',`${ok}/${MODELS.length} models · ${t}${failed.length?' · unavail: '+failed.join(', '):''}`);

  // First paint waits for actuals + weights so it's internally consistent.
  try{ buildForecastRainCache(); buildHiLoCache(); buildSourcesPanel(); scheduleAutoRefresh(); }catch(e){ dbg('prep error: '+e.message); }
  setStatus('spin','Finalising forecast…');
  dbg('fetching BOM actuals + weights before first paint…');
  try{
    await Promise.race([ fetchActualsAndComputeWeights(), new Promise(r=>setTimeout(r,6000)) ]);
    dbg('actuals/weights ready'+(actualData?(' — '+actualData.source+' '+(actualData.stationName||'')):' — no actuals'));
  }catch(e){ dbg('❌ actuals/weights error: '+e.message); }
  setStatus('ok',`${ok}/${MODELS.length} models · ${t}${failed.length?' · unavail: '+failed.join(', '):''}`);
  const _ck=`${state.lat!=null?state.lat.toFixed(3):'x'},${state.lon!=null?state.lon.toFixed(3):'x'}`;
  if(_ck!==_lastCoordsKey){ selDate=localTodayStr(); _lastCoordsKey=_ck; }
  try{ renderCurrentBar(); renderTable(); firstRenderDone=true; dbg('✓ rendered (weighted, with actuals)'); }
  catch(e){ dbg('❌ render error: '+e.message); }

  syncAndLoadAccuracy().catch(e=>dbg('accuracy sync error: '+e.message));
}

// ── Current conditions endpoint (live now-card values) ──────────────────
async function fetchCurrentConditions(){
  try{
    const url=`https://api.open-meteo.com/v1/forecast`
      +`?latitude=${state.lat}&longitude=${state.lon}`
      +`&current=temperature_2m,apparent_temperature,precipitation,weather_code,`
      +`wind_speed_10m,wind_direction_10m,is_day,relative_humidity_2m`
      +`&hourly=precipitation&past_hours=24&forecast_hours=1`
      +`&daily=temperature_2m_max,temperature_2m_min`
      +`&forecast_days=1&timezone=auto&wind_speed_unit=kmh`;
    const res=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!res.ok)return;
    const d=await res.json();if(d.error)return;
    if(d.current){const c=d.current;
      if(c.weathercode==null&&c.weather_code!=null)c.weathercode=c.weather_code;
      if(c.windspeed_10m==null&&c.wind_speed_10m!=null)c.windspeed_10m=c.wind_speed_10m;
      if(c.winddirection_10m==null&&c.wind_direction_10m!=null)c.winddirection_10m=c.wind_direction_10m;
    }
    cachedCurrent={c:d.current,precipHourly:d.hourly?.precipitation||[],daily:d.daily};
    if(firstRenderDone)renderCurrentBar();
  }catch(e){console.warn('Current:',e.message);}
}

// ── Caches ──────────────────────────────────────────────────────────────
function buildForecastRainCache(){
  const onlyEnabled=activeEnabled();if(!onlyEnabled.length)return;
  const ref=state.data[onlyEnabled[0].key].hourly;
  const now=locNowDate();
  let si=ref.time.findIndex(t=>new Date(t)>=now);if(si<0)si=0;
  cachedForecastRain=Array.from({length:25},(_,i)=>{
    const idx=si+i;
    return weightedAvgOf(onlyEnabled.map(m=>({key:m.key,val:state.data[m.key]?.hourly?.precipitation?.[idx]??null})),'rain',0,'precipitation');
  });
}
function buildHiLoCache(){
  const onlyEnabled=activeEnabled();if(!onlyEnabled.length)return;
  const _n=locNowDate();const todayStr=`${_n.getFullYear()}-${String(_n.getMonth()+1).padStart(2,"0")}-${String(_n.getDate()).padStart(2,"0")}`;
  const hiVals=onlyEnabled.map(m=>{
    const d=state.data[m.key]?.daily;if(!d)return null;
    const di=d.time.findIndex(t=>t===todayStr);if(di<0)return null;
    return d.temperature_2m_max?.[di]??null;
  }).filter(v=>v!=null);
  const loVals=onlyEnabled.map(m=>{
    const d=state.data[m.key]?.daily;if(!d)return null;
    const di=d.time.findIndex(t=>t===todayStr);if(di<0)return null;
    return d.temperature_2m_min?.[di]??null;
  }).filter(v=>v!=null);
  const avg=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;
  cachedHiLo={hi:avg(hiVals),lo:avg(loVals)};
}

// ── Current / day summaries (canonical figures for cards & tiles) ───────
function computeCurrentFromHourly(){
  const onlyEnabled=activeEnabled();if(!onlyEnabled.length)return null;
  const ref=state.data[onlyEnabled[0].key]?.hourly;if(!ref)return null;
  const now=locNowDate();
  const pad=n=>String(n).padStart(2,'0');
  const todayStr=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  let nowIdx=0;
  for(let k=0;k<ref.time.length;k++){if(new Date(ref.time[k])<=now)nowIdx=k;else break;}

  const wAt=(field,idx)=>weightedAvgOf(onlyEnabled.map(m=>({key:m.key,val:state.data[m.key]?.hourly?.[field]?.[idx]??null})),fieldSec(field),0,field);

  const curIso=ref.time[nowIdx];
  const cur=hourTileData(curIso)||{};
  const temp = cur.temp!=null?cur.temp:wAt('temperature_2m',nowIdx);
  const wind = cur.wind!=null?cur.wind:wAt('windspeed_10m',nowIdx);
  const windDir=wAt('winddirection_10m',nowIdx);
  const wcode = cur.code!=null?cur.code:(state.data[onlyEnabled[0].key]?.hourly?.weathercode?.[nowIdx]??null);
  const cloud = cur.cloud!=null?cur.cloud:wAt('cloudcover',nowIdx);
  const rainNow=_rcell(cur.rain!=null?cur.rain:wAt('precipitation',nowIdx));

  let tHi=null,tLo=null,rainTot=0,rainRemain=0,windHi=null,windLo=null,cloudHi=null,cloudLo=null;
  ref.time.forEach((t,i)=>{
    if(t.slice(0,10)!==todayStr)return;
    const future=new Date(t)>now;
    const ht=hourTileData(t)||{};
    const tv=ht.temp; if(tv!=null){tHi=tHi==null?tv:Math.max(tHi,tv);tLo=tLo==null?tv:Math.min(tLo,tv);}
    const pr=_rcell(ht.rain); rainTot+=pr; if(future)rainRemain+=pr;
    const wv=ht.wind; if(wv!=null){windHi=windHi==null?wv:Math.max(windHi,wv);windLo=windLo==null?wv:Math.min(windLo,wv);}
    const cv=ht.cloud; if(cv!=null){cloudHi=cloudHi==null?cv:Math.max(cloudHi,cv);cloudLo=cloudLo==null?cv:Math.min(cloudLo,cv);}
  });
  const hi=tHi, lo=tLo;

  let actualRainToday=null;
  if(actualData?.hourly?.time){
    actualRainToday=0;
    actualData.hourly.time.forEach((t,i)=>{
      if(t.slice(0,10)===todayStr && new Date(t)<=now){
        const v=actualData.hourly.precipitation?.[i];if(v!=null)actualRainToday+=v;
      }
    });
  }
  const rainToday=rainTot;

  return {temp,wind,windDir,wcode,hi,lo,rainToday,rainRemainToday:rainRemain,cloud,windHi,windLo,cloudHi,cloudLo,actualRainToday,rainNow,
          obsTemp:!!cur.isAct,obsWind:!!cur.isAct,obsCloud:!!cur.isAct,obsTime:null,obsHumid:null};
}

function computeDaySummary(dateStr){
  const onlyEnabled=activeEnabled();if(!onlyEnabled.length)return null;
  const ref=state.data[onlyEnabled[0].key]?.hourly;if(!ref?.time)return null;
  const today=localTodayStr();
  const isToday=dateStr===today, isFuture=dateStr>today, isPast=dateStr<today;
  const now=locNowDate();
  const hz=horizonOf(dateStr);
  const wAt=(f,i)=>weightedAvgOf(onlyEnabled.map(m=>({key:m.key,val:state.data[m.key]?.hourly?.[f]?.[i]??null})),fieldSec(f),hz,f);

  let hi=null,lo=null,rain=0,windHi=null,windLo=null,cloudHi=null,cloudLo=null,cloudSum=0,cloudN=0,noonIdx=-1,noonDiff=99;
  ref.time.forEach((t,i)=>{
    if(t.slice(0,10)!==dateStr)return;
    const tv=wAt('temperature_2m',i);if(tv!=null){hi=hi==null?tv:Math.max(hi,tv);lo=lo==null?tv:Math.min(lo,tv);}
    const pr=_rcell(wAt('precipitation',i));if(pr)rain+=pr;
    const wv=wAt('windspeed_10m',i);if(wv!=null){windHi=windHi==null?wv:Math.max(windHi,wv);windLo=windLo==null?wv:Math.min(windLo,wv);}
    const cv=wAt('cloudcover',i);if(cv!=null){cloudHi=cloudHi==null?cv:Math.max(cloudHi,cv);cloudLo=cloudLo==null?cv:Math.min(cloudLo,cv);cloudSum+=cv;cloudN++;}
    const dd=Math.abs(new Date(t).getHours()-12);if(dd<noonDiff){noonDiff=dd;noonIdx=i;}
  });
  const cloudMean=cloudN?cloudSum/cloudN:null;
  const noonCode=noonIdx>=0?(state.data[onlyEnabled[0].key]?.hourly?.weathercode?.[noonIdx]??null):null;
  const dayCode=deriveDailyCode(rain,cloudMean,noonCode);
  const windDir=noonIdx>=0?wAt('winddirection_10m',noonIdx):null;
  const windNoon=noonIdx>=0?wAt('windspeed_10m',noonIdx):null;

  let actualRain=null, aTHi=null,aTLo=null,aWHi=null,aWLo=null,aCHi=null,aCLo=null, aHasT=false,aHasW=false,aHasC=false;
  if(!isFuture && actualData?.hourly?.time){
    actualRain=0;
    actualData.hourly.time.forEach((t,i)=>{
      if(t.slice(0,10)!==dateStr)return;
      if(isToday && new Date(t)>now)return;
      const pr=actualData.hourly.precipitation?.[i];if(pr!=null)actualRain+=pr;
      const tv=actualData.hourly.temperature_2m?.[i];if(tv!=null){aTHi=aTHi==null?tv:Math.max(aTHi,tv);aTLo=aTLo==null?tv:Math.min(aTLo,tv);aHasT=true;}
      const wv=actualData.hourly.windspeed_10m?.[i];if(wv!=null){aWHi=aWHi==null?wv:Math.max(aWHi,wv);aWLo=aWLo==null?wv:Math.min(aWLo,wv);aHasW=true;}
      const cv=actualData.hourly.cloudcover?.[i];if(cv!=null){aCHi=aCHi==null?cv:Math.max(aCHi,cv);aCLo=aCLo==null?cv:Math.min(aCLo,cv);aHasC=true;}
    });
  }
  return {dateStr,isToday,isFuture,isPast,hi,lo,rain,windHi,windLo,windNoon,windDir,cloudHi,cloudLo,cloudMean,dayCode,actualRain,
          aTHi,aTLo,aWHi,aWLo,aCHi,aCLo,aHasT,aHasW,aHasC};
}

// ── BOM observations (via Worker) ───────────────────────────────────────
const BOM_WORKER_URL = 'https://weatherblend-bom.brown111723.workers.dev';
function bomWorkerConfigured(){
  return BOM_WORKER_URL && !/YOUR-SUBDOMAIN/.test(BOM_WORKER_URL);
}
function haversineKm(lat1, lon1, lat2, lon2){
  const R=6371, toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function parseBomRain(val){
  if(val==null||val==='-'||val==='')return 0;
  if(typeof val==='number')return val;
  const s=String(val).trim();
  if(s.toLowerCase()==='trace')return 0.1;
  const n=parseFloat(s);
  return isNaN(n)?0:n;
}
async function bomWorkerObs(wmo, stateAbbr){
  const u=`${BOM_WORKER_URL}?station=${encodeURIComponent(wmo)}&state=${encodeURIComponent(stateAbbr||'')}`;
  const r=await fetch(u, {signal:AbortSignal.timeout(15000)});
  if(!r.ok){
    let why=''; try{ const j=await r.json(); why=j.error?(' ('+j.error+(j.tried?' tried '+j.tried.join(','):'')+')'):''; }catch{}
    throw new Error('worker HTTP '+r.status+why);
  }
  const j=await r.json();
  return j.data || j;
}
async function bomWorkerStations(){
  const r=await fetch(`${BOM_WORKER_URL}?stations=1`, {signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw new Error('worker stations HTTP '+r.status);
  return await r.text();
}

let bomStationsCache=null;
async function loadBomStations(){
  if(bomStationsCache)return bomStationsCache;
  let text=null;
  try{
    const r=await fetch('stations.txt', {signal:AbortSignal.timeout(8000)});
    if(r.ok){text=await r.text();dbg('stations.txt: loaded local file ('+text.length+' chars)');}
  }catch(e){ dbg('stations.txt: local file not available ('+(e.message||e.name)+')'); }
  if(!text){
    if(bomWorkerConfigured()){
      dbg('stations.txt: no local file — fetching via Worker…');
      try{ text=await bomWorkerStations(); dbg('stations.txt: Worker loaded ('+text.length+' chars)'); }
      catch(e){ dbg('❌ stations.txt via Worker failed: '+(e.message||e.name)); return []; }
    } else {
      dbg('❌ stations.txt: no local file and Worker URL not set');
      return [];
    }
  }
  const lines=text.split(/\r?\n/);
  let sepIdx=-1;
  for(let i=0;i<lines.length;i++){
    if(/-{3,}/.test(lines[i]) && /^[\s-]+$/.test(lines[i])){ sepIdx=i; break; }
  }
  if(sepIdx<1){ dbg('❌ stations.txt: dashed separator line not found — unexpected format'); return []; }
  const header=lines[sepIdx-1];
  const cols=[]; let mm; const re=/-+/g;
  while((mm=re.exec(lines[sepIdx]))!==null){ cols.push([mm.index, mm.index+mm[0].length]); }
  const slice=(line,idx)=> (idx>=0 && idx<cols.length) ? line.slice(cols[idx][0], cols[idx][1]).trim() : '';
  const label=idx=> slice(header,idx).toLowerCase();
  let cLat=-1,cLon=-1,cSta=-1,cWmo=-1,cName=-1;
  for(let i=0;i<cols.length;i++){
    const l=label(i);
    if(l==='lat')cLat=i;
    else if(l==='lon'||l==='long'||l==='lng')cLon=i;
    else if(l==='sta'||l==='state')cSta=i;
    else if(l==='wmo')cWmo=i;
    else if(l.includes('site name')||l==='name')cName=i;
  }
  dbg(`stations.txt: ${cols.length} cols; header="${header.trim().slice(0,60)}"; Lat=${cLat} Lon=${cLon} STA=${cSta} WMO=${cWmo} Name=${cName}`);
  if(cLat<0||cLon<0||cWmo<0){ dbg('❌ stations.txt: could not map Lat/Lon/WMO columns from header'); return []; }
  const out=[];
  for(let i=sepIdx+1;i<lines.length;i++){
    const ln=lines[i]; if(!ln||!ln.trim())continue;
    const wmoStr=slice(ln,cWmo);
    if(!/^\d{4,6}$/.test(wmoStr))continue;
    const lat=parseFloat(slice(ln,cLat)), lon=parseFloat(slice(ln,cLon));
    if(isNaN(lat)||isNaN(lon))continue;
    out.push({ wmo:wmoStr, state:slice(ln,cSta).toUpperCase(), lat, lon, name:slice(ln,cName) });
  }
  dbg(`stations.txt: parsed ${out.length} WMO stations`);
  bomStationsCache=out;
  return out;
}

// BOM FWO observations JSON -> {hourly,daily} actuals
function parseBomObs(json, stn){
  const obs=json?.observations?.data;
  if(!Array.isArray(obs)||!obs.length)return null;
  obs.sort((a,b)=>(a.local_date_time_full||'').localeCompare(b.local_date_time_full||''));
  const byHour={};
  let latest=null;
  for(const o of obs){
    const raw=o.local_date_time_full;
    if(!raw||raw.length<12)continue;
    const yr=raw.slice(0,4),mo=raw.slice(4,6),dy=raw.slice(6,8),hr=raw.slice(8,10),min=parseInt(raw.slice(10,12),10);
    const hourKey=`${yr}-${mo}-${dy}T${hr}:00`;
    const t=parseFloat(o.air_temp);
    const okt=(o.cloud_oktas==null||o.cloud_oktas==='')?null:parseFloat(o.cloud_oktas);
    const cloudPct=(okt!=null&&!isNaN(okt))?Math.max(0,Math.min(100,okt/8*100)):null;
    const wspd=(o.wind_spd_kmh==null||o.wind_spd_kmh==='')?null:parseFloat(o.wind_spd_kmh);
    const rh=(o.rel_hum==null||o.rel_hum==='')?null:parseFloat(o.rel_hum);
    const tempV=(!isNaN(t)&&String(o.air_temp).trim()!=='')?t:null;
    const windV=(wspd!=null&&!isNaN(wspd))?wspd:null;
    const rec={ temp:tempV, traceCum:parseBomRain(o.rain_trace), cloud:cloudPct, wind:windV };
    if(min===0 || !(hourKey in byHour)) byHour[hourKey]=rec;
    const u=o.aifstime_utc;
    let ts=null;
    if(u&&u.length>=12)ts=Date.UTC(+u.slice(0,4),+u.slice(4,6)-1,+u.slice(6,8),+u.slice(8,10),+u.slice(10,12),0);
    const h12=((+hr)%12)||12, ap=(+hr)<12?'am':'pm';
    if(ts!=null&&(latest==null||ts>=latest.ts)){
      latest={ ts, label:`${h12}:${raw.slice(10,12)} ${ap}`, temp:tempV, wind:windV, cloud:cloudPct, humid:(rh!=null&&!isNaN(rh))?rh:null, traceCum:parseBomRain(o.rain_trace) };
    }
  }
  try{
    const n=locNowDate(), pp=x=>String(x).padStart(2,'0');
    const nowKey=`${n.getFullYear()}-${pp(n.getMonth()+1)}-${pp(n.getDate())}T${pp(n.getHours())}:00`;
    if(latest && !(nowKey in byHour) && (Date.now()-latest.ts)<=75*60*1000){
      byHour[nowKey]={ temp:latest.temp, traceCum:latest.traceCum, cloud:latest.cloud, wind:latest.wind, _carried:true };
      dbg(`BOM: ${nowKey} not posted yet — carried ${latest.label} reading into current hour`);
    }
  }catch(e){}
  const keys=Object.keys(byHour).sort();
  const hourly={time:[],temperature_2m:[],precipitation:[],cloudcover:[],windspeed_10m:[]};
  let prevCum=null;
  for(const k of keys){
    const r=byHour[k];
    let inc;
    if(r.traceCum==null) inc=0;
    else if(prevCum==null) inc=0;
    else if(r.traceCum<prevCum) inc=r.traceCum;
    else inc=r.traceCum-prevCum;
    if(r.traceCum!=null) prevCum=r.traceCum;
    hourly.time.push(k);
    hourly.temperature_2m.push(r.temp);
    hourly.precipitation.push(Math.max(0,inc));
    hourly.cloudcover.push(r.cloud!=null?r.cloud:null);
    hourly.windspeed_10m.push(r.wind!=null?r.wind:null);
  }
  const byDate={};
  hourly.time.forEach((k,i)=>{
    const d=k.slice(0,10);
    if(!byDate[d])byDate[d]={temps:[],precip:0};
    if(hourly.temperature_2m[i]!=null)byDate[d].temps.push(hourly.temperature_2m[i]);
    byDate[d].precip+=hourly.precipitation[i]||0;
  });
  const daily={time:[],temperature_2m_max:[],temperature_2m_min:[],precipitation_sum:[]};
  for(const d of Object.keys(byDate).sort()){
    daily.time.push(d);
    const ts=byDate[d].temps;
    daily.temperature_2m_max.push(ts.length?Math.max(...ts):null);
    daily.temperature_2m_min.push(ts.length?Math.min(...ts):null);
    daily.precipitation_sum.push(byDate[d].precip);
  }
  return { hourly, daily, latest, source:'BOM', stationName:stn.name||('WMO '+stn.wmo), wmo:stn.wmo, state:stn.state, lat:stn.lat, lon:stn.lon };
}

async function fetchBOMActuals(){
  try{
    if(!bomWorkerConfigured()){
      dbg('❌ BOM: Worker URL not set — edit BOM_WORKER_URL in engine.js. Skipping actuals.');
      return null;
    }
    const lat=state.lat, lon=state.lon;
    if(lat==null||lon==null){dbg('BOM: no coordinates');return null;}
    const stations=await loadBomStations();
    if(!stations.length){dbg('BOM: station list empty — cannot locate a station');return null;}
    const ranked=stations
      .map(s=>({...s, dist:haversineKm(lat,lon,s.lat,s.lon)}))
      .sort((a,b)=>a.dist-b.dist);
    if(!ranked.length){dbg('BOM: no stations found');return null;}
    dbg(`BOM: nearest = ${ranked[0].name} (${ranked[0].state} WMO ${ranked[0].wmo}, ${ranked[0].dist.toFixed(0)}km)`);
    for(const stn of ranked.slice(0,6)){
      if(stn.dist>250){dbg('BOM: remaining stations >250km away, stopping');break;}
      dbg(`BOM: trying WMO ${stn.wmo} (${stn.name}, ${stn.state}) via Worker`);
      try{
        setStatus('spin', `BOM: ${stn.name||stn.wmo}…`);
        const j=await bomWorkerObs(stn.wmo, stn.state);
        const parsed=parseBomObs(j, stn);
        if(parsed && parsed.hourly.time.length){
          dbg(`BOM: ✓ ${stn.name} — ${parsed.hourly.time.length} hourly obs, last ${parsed.hourly.time[parsed.hourly.time.length-1]}`);
          return parsed;
        }
        dbg('BOM: no usable observations, trying next');
      }catch(e){ dbg('BOM: '+(e.message||e.name)+' — trying next'); }
    }
    dbg('❌ BOM: no nearby station returned observations');
    return null;
  }catch(e){
    dbg('❌ BOM actuals error: '+(e.message||e.name));
    return null;
  }
}

// ── Actuals series (BOM / Open-Meteo / Blend) ───────────────────────────
function _dailyFromHourly(H){
  const byDay={};
  H.time.forEach((t,i)=>{
    const d=t.slice(0,10);
    const o=byDay[d]||(byDay[d]={tmax:null,tmin:null,psum:0,cmax:null,cmin:null,wmax:null,wmin:null,hasP:false});
    const tv=H.temperature_2m[i];if(tv!=null){o.tmax=o.tmax==null?tv:Math.max(o.tmax,tv);o.tmin=o.tmin==null?tv:Math.min(o.tmin,tv);}
    const pv=H.precipitation[i];if(pv!=null){o.psum+=pv;o.hasP=true;}
    const cv=H.cloudcover[i];if(cv!=null){o.cmax=o.cmax==null?cv:Math.max(o.cmax,cv);o.cmin=o.cmin==null?cv:Math.min(o.cmin,cv);}
    const wv=H.windspeed_10m[i];if(wv!=null){o.wmax=o.wmax==null?wv:Math.max(o.wmax,wv);o.wmin=o.wmin==null?wv:Math.min(o.wmin,wv);}
  });
  const D={time:[],temperature_2m_max:[],temperature_2m_min:[],precipitation_sum:[],cloudcover_max:[],cloudcover_min:[],windspeed_10m_max:[],windspeed_10m_min:[]};
  Object.keys(byDay).sort().forEach(d=>{const o=byDay[d];D.time.push(d);D.temperature_2m_max.push(o.tmax);D.temperature_2m_min.push(o.tmin);D.precipitation_sum.push(o.hasP?o.psum:null);D.cloudcover_max.push(o.cmax);D.cloudcover_min.push(o.cmin);D.windspeed_10m_max.push(o.wmax);D.windspeed_10m_min.push(o.wmin);});
  return D;
}
function buildActualData(bom){
  const ref=refHourly();
  if(!ref?.time){ actualSources=null; return bom; }
  const now=Date.now();
  const bomMap={};
  if(bom?.hourly?.time) bom.hourly.time.forEach((t,i)=>{bomMap[t]=i;});
  const mk=()=>({time:[],temperature_2m:[],precipitation:[],cloudcover:[],windspeed_10m:[]});
  const B=mk(), O=mk(), L=mk();
  const FS=['temperature_2m','precipitation','cloudcover','windspeed_10m'];
  ref.time.forEach((t,i)=>{
    if(new Date(t).getTime()>now) return;
    const bi=bomMap[t];
    B.time.push(t);O.time.push(t);L.time.push(t);
    FS.forEach(f=>{
      let bomV=(bi!==undefined)?bom.hourly[f]?.[bi]:null; if(bomV==null||isNaN(bomV))bomV=null;
      let omV=meanAt(f,i); if(omV==null||isNaN(omV))omV=null;
      const bInf=(bomV!=null)?bomV:omV;
      const bl=(bomV!=null&&omV!=null)?(bomV+omV)/2:(bInf!=null?bInf:omV);
      B[f].push(bInf); O[f].push(omV); L[f].push(bl);
    });
  });
  actualSources={
    bom:{hourly:B,daily:_dailyFromHourly(B)},
    om:{hourly:O,daily:_dailyFromHourly(O)},
    blend:{hourly:L,daily:_dailyFromHourly(L)},
    _bom:bom, stationName: bom?.stationName || 'Open-Meteo (est.)'
  };
  return selectActual();
}
function selectActual(){
  if(!actualSources){actualData=null;return null;}
  const src=actualSources[actualSource]||actualSources.bom;
  actualData={hourly:src.hourly, daily:src.daily, _bom:actualSources._bom, stationName:actualSources.stationName, source:actualSource};
  return actualData;
}
function selectedTruth(){
  if(!actualSources)return null;
  if(actualSource==='om')   return actualSources.om.hourly;
  if(actualSource==='blend')return actualSources.blend.hourly;
  return actualSources._bom?.hourly||null;
}

// ── Live accuracy scoring (Phase 1: shrinkage + inverse-square) ─────────
// Recency-decayed RMSE vs the chosen truth, then _shrinkClampNorm — the same
// philosophy as the server's learned weights, so switching sources never
// produces a wildly different-shaped blend.
function computeMetricWeights(truth){
  const am=activeEnabled();
  metricWeights={temp:{},rain:{},wind:{},cloud:{}};
  modelWeights={};
  const METS=[['temp','temperature_2m'],['rain','precipitation'],['wind','windspeed_10m'],['cloud','cloudcover']];
  if(!am.length)return;
  const keys=am.map(m=>m.key);
  const haveTruth = truth?.time?.length>0;
  if(!haveTruth){
    am.forEach(m=>{METS.forEach(([s])=>metricWeights[s][m.key]=1/am.length);modelWeights[m.key]=1/am.length;});
    return;
  }
  const bMap={}; truth.time.forEach((t,i)=>{bMap[t]=i;});
  const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-1); cutoff.setHours(23,0,0,0);
  const DECAY=Math.log(2)/48;
  const err={}; am.forEach(m=>{err[m.key]={};METS.forEach(([s])=>err[m.key][s]={se:0,wn:0});});
  am.forEach(m=>{
    const mh=state.data[m.key]?.hourly; if(!mh?.time)return;
    mh.time.forEach((t,i)=>{
      const bi=bMap[t]; if(bi===undefined)return;
      const rowMs=new Date(t).getTime(); if(rowMs>cutoff.getTime())return;
      const rw=Math.exp(-DECAY*Math.max(0,(cutoff.getTime()-rowMs)/3600000));
      METS.forEach(([s,field])=>{
        const mv=mh[field]?.[i], av=truth[field]?.[bi];
        if(mv==null||av==null||isNaN(mv)||isNaN(av))return;
        err[m.key][s].se+=rw*(mv-av)**2;
        err[m.key][s].wn+=rw;
      });
    });
  });
  METS.forEach(([s])=>{
    const errMap={}, nMap={};
    am.forEach(m=>{
      const o=err[m.key][s];
      if(o.wn>=1)errMap[m.key]=Math.sqrt(o.se/o.wn);
      nMap[m.key]=o.wn;
    });
    metricWeights[s]=_shrinkClampNorm(errMap,nMap,keys);
  });
  am.forEach(m=>{ modelWeights[m.key]=(metricWeights.temp[m.key]+metricWeights.rain[m.key]+metricWeights.wind[m.key]+metricWeights.cloud[m.key])/4; });
  ['temp','rain','wind','cloud'].forEach(s=>{
    dbg('w·'+s+': '+am.map(m=>m.short+' '+Math.round((metricWeights[s][m.key]||0)*100)+'%').join(' '));
  });
}
// Per-previous-day scoring over the last X days (each day counts equally),
// mean of daily RMSEs -> _shrinkClampNorm (median fallback removed; the
// shrinkage handles under-sampled models smoothly).
function computeMetricWeightsDaily(truth, daysX){
  const am=activeEnabled();
  const out={temp:{},rain:{},wind:{},cloud:{}};
  const METS=[['temp','temperature_2m'],['rain','precipitation'],['wind','windspeed_10m'],['cloud','cloudcover']];
  if(!am.length)return out;
  const keys=am.map(m=>m.key);
  if(!(truth?.time?.length)){ am.forEach(m=>METS.forEach(([s])=>out[s][m.key]=1/am.length)); return out; }
  const X=Math.max(1,Math.min(7,daysX||7));
  const nowMs=locNowMs(), startMs=nowMs - X*24*3600*1000;
  const tMap={}; truth.time.forEach((t,i)=>tMap[t]=i);
  const acc={}; am.forEach(m=>{acc[m.key]={temp:{},rain:{},wind:{},cloud:{}};});
  am.forEach(m=>{
    const mh=state.data[m.key]?.hourly; if(!mh?.time)return;
    mh.time.forEach((t,i)=>{
      const ms=new Date(t).getTime(); if(ms<startMs||ms>nowMs)return;
      const bi=tMap[t]; if(bi===undefined)return;
      const day=t.slice(0,10);
      METS.forEach(([s,field])=>{
        const mv=mh[field]?.[i], av=truth[field]?.[bi];
        if(mv==null||av==null||isNaN(mv)||isNaN(av))return;
        const b=acc[m.key][s][day]||(acc[m.key][s][day]={se:0,n:0});
        b.se+=(mv-av)**2; b.n++;
      });
    });
  });
  METS.forEach(([s])=>{
    const errMap={}, nMap={};
    am.forEach(m=>{
      const days=Object.values(acc[m.key][s]).filter(b=>b.n>0);
      if(days.length)errMap[m.key]=days.reduce((a,b)=>a+Math.sqrt(b.se/b.n),0)/days.length;
      nMap[m.key]=days.reduce((a,b)=>a+b.n,0);
    });
    out[s]=_shrinkClampNorm(errMap,nMap,keys);
  });
  return out;
}
function _setMetricWeights(w){
  const am=activeEnabled();
  metricWeights={temp:{},rain:{},wind:{},cloud:{}};
  ['temp','rain','wind','cloud'].forEach(s=>{
    const sum=am.reduce((a,m)=>a+(w[s]?.[m.key]||0),0)||1;
    am.forEach(m=>metricWeights[s][m.key]=(w[s]?.[m.key]||0)/sum);
  });
  modelWeights={}; am.forEach(m=>modelWeights[m.key]=(metricWeights.temp[m.key]+metricWeights.rain[m.key]+metricWeights.wind[m.key]+metricWeights.cloud[m.key])/4);
}
// Dispatch the active weighting method onto the global metricWeights.
function applyWeights(){
  activeBiases=null; activeBiasesByH=null;    // re-set below when applicable
  const truth=selectedTruth();
  if(weightMethod==='daily'){
    _setMetricWeights(computeMetricWeightsDaily(truth, weightDays));
    dbg('weights: daily/'+weightDays+'d · source='+actualSource);
  }else if(weightMethod==='blend'){
    computeMetricWeights(truth);
    const cur={temp:{...metricWeights.temp},rain:{...metricWeights.rain},wind:{...metricWeights.wind},cloud:{...metricWeights.cloud}};
    const daily=computeMetricWeightsDaily(truth, weightDays);
    const am=activeEnabled(), mix={temp:{},rain:{},wind:{},cloud:{}};
    ['temp','rain','wind','cloud'].forEach(s=>am.forEach(m=>mix[s][m.key]=((cur[s][m.key]||0)+(daily[s][m.key]||0))/2));
    _setMetricWeights(mix);
    dbg('weights: blend(current+daily/'+weightDays+'d) · source='+actualSource);
  }else{
    computeMetricWeights(truth);
    applyHistoricalWeights();
  }
}
// Learned (server) weights + biases replace the live ones — only for the
// Recency method scored against pure BOM truth.
function applyHistoricalWeights(){
  activeBiases=null; activeBiasesByH=null;
  if(weightMethod!=='current')return;
  if(actualSource!=='bom')return;
  // Biases apply whenever learned artefacts exist (already shrunk server-side)
  activeBiases=historicalBiases||null;
  activeBiasesByH=historicalBiasesByH||null;
  if(!historicalWeights)return;
  const am=activeEnabled();
  const normInto=(target,src)=>{
    ['temp','rain','wind','cloud'].forEach(s=>{
      const sw=src[s]||{}; const w={}; let any=false;
      am.forEach(m=>{ if(sw[m.key]!=null){w[m.key]=sw[m.key];any=true;} });
      if(any){ const sum=am.reduce((a,m)=>a+(w[m.key]||0),0)||1; target[s]={}; am.forEach(m=>target[s][m.key]=(w[m.key]||0)/sum); }
    });
  };
  normInto(metricWeights, historicalWeights);
  modelWeights={}; am.forEach(m=>modelWeights[m.key]=((metricWeights.temp[m.key]||0)+(metricWeights.rain[m.key]||0)+(metricWeights.wind[m.key]||0)+(metricWeights.cloud[m.key]||0))/4);
  metricWeightsByH={};
  if(historicalWeightsByH){
    Object.keys(historicalWeightsByH).forEach(N=>{
      const tgt={temp:{},rain:{},wind:{},cloud:{}};
      normInto(tgt, historicalWeightsByH[N]||{});
      metricWeightsByH[N]=tgt;
    });
  }
}

async function fetchActualsAndComputeWeights(){
  try{
    let bom=null;
    if(state.lat&&state.lon) bom=await fetchBOMActuals();
    actualData=buildActualData(bom);
    if(bom) dbg('actuals: BOM '+(bom.stationName||'')+' + Open-Meteo · source='+actualSource);
    else dbg('actuals: Open-Meteo past (no BOM) · source='+actualSource);
    applyWeights();
  }catch(e){
    console.warn('Actuals/weights failed:',e.message);
    actualData=null;
    const am=activeEnabled();
    metricWeights={temp:{},rain:{},wind:{},cloud:{}};
    modelWeights={};
    am.forEach(m=>{['temp','rain','wind','cloud'].forEach(s=>metricWeights[s][m.key]=1/am.length);modelWeights[m.key]=1/am.length;});
  }
}

// ── Server accuracy sync ────────────────────────────────────────────────
// BOM-only completed-day actuals (never Open-Meteo — would be circular)
function bomDailyActuals(){
  const bom=actualSources?._bom; if(!bom?.hourly?.time)return [];
  const today=localTodayStr();
  const byDay={};
  bom.hourly.time.forEach((t,i)=>{
    const d=t.slice(0,10); if(d>=today)return;
    const o=byDay[d]||(byDay[d]={tmax:null,tmin:null,rain:0,wind:null,cs:0,cn:0,hasR:false,hasT:false});
    const tv=bom.hourly.temperature_2m?.[i]; if(tv!=null){o.tmax=o.tmax==null?tv:Math.max(o.tmax,tv);o.tmin=o.tmin==null?tv:Math.min(o.tmin,tv);o.hasT=true;}
    const pv=bom.hourly.precipitation?.[i]; if(pv!=null){o.rain+=pv;o.hasR=true;}
    const wv=bom.hourly.windspeed_10m?.[i]; if(wv!=null)o.wind=o.wind==null?wv:Math.max(o.wind,wv);
    const cv=bom.hourly.cloudcover?.[i]; if(cv!=null){o.cs+=cv;o.cn++;}
  });
  return Object.keys(byDay).map(d=>{const o=byDay[d];return{target:d,tmax:o.hasT?o.tmax:null,tmin:o.hasT?o.tmin:null,rain:o.hasR?o.rain:null,wind:o.wind,cloud:o.cn?o.cs/o.cn:null,source:'bom'};}).filter(a=>a.tmax!=null||a.rain!=null);
}
// Phase 1: raw hourly BOM observations for the server archive (feeds
// hour-of-day weighting once a few weeks accumulate).
function bomHourlyPayload(){
  const bom=actualSources?._bom; if(!bom?.hourly?.time)return [];
  const h=bom.hourly, out=[];
  h.time.forEach((t,i)=>{
    const temp=h.temperature_2m?.[i], rain=h.precipitation?.[i], wind=h.windspeed_10m?.[i], cloud=h.cloudcover?.[i];
    if(temp==null&&rain==null&&wind==null&&cloud==null)return;
    out.push({ts:t,temp,rain,wind,cloud});
  });
  return out.slice(-96);
}

async function syncAndLoadAccuracy(){
  if(!bomWorkerConfigured())return;
  const station=actualData?._bom?.wmo;
  if(!station){ dbg('accuracy: no BOM station yet — skipping (needs observations)'); renderAccuracyPanel(); return; }
  _trackStation=station;
  const today=localTodayStr();
  const actuals=bomDailyActuals();
  const hourly=bomHourlyPayload();
  const b=actualData?._bom||{};
  const meta={lat:b.lat??state.lat, lon:b.lon??state.lon, state:b.state||'', name:b.stationName||''};

  try{
    await fetch(`${BOM_WORKER_URL}/track/sync`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({station,issued:today,actuals,hourly,meta})});
    dbg(`accuracy: synced ${actuals.length} daily + ${hourly.length} hourly actuals`);
  }catch(e){ dbg('accuracy sync POST failed: '+e.message); }

  try{
    const ll=`&lat=${state.lat}&lon=${state.lon}`;
    const r=await fetch(`${BOM_WORKER_URL}/track/weights?station=${encodeURIComponent(station)}${ll}&days=${learnDays}`,{signal:AbortSignal.timeout(30000)});
    const j=await r.json();
    accuracyMeta=j; accuracyStats=j&&j.stats||null; _horizonCache={};
    if(j&&j.diag){ dbg(`accuracy diag: models OK [${(j.diag.modelsOK||[]).join(', ')||'none'}], failed [${(j.diag.modelsFailed||[]).join(', ')||'none'}], ERA5 ${j.diag.eraDays}d, BOM-obs ${j.diag.bomActualDays}d`); }
    if(j&&j.weights&&j.mature){
      historicalWeights=j.weights; historicalWeightsByH=j.weightsByHorizon||null;
      historicalBiases=j.biases||null; historicalBiasesByH=j.biasesByHorizon||null;
      applyHistoricalWeights();
      const nH=historicalWeightsByH?Object.keys(historicalWeightsByH).length:0;
      const nB=historicalBiases?Object.keys(historicalBiases.temp||{}).length:0;
      dbg(`accuracy: USING learned weights — ${j.days} days, ${j.pairs} pairs, ${nH} lead-times, biases for ${nB} models (${j.engine||j.source||'?'}${j.cached?', cached':''})`);
      if(Object.keys(state.data).length){ renderCurrentBar(); buildSourcesPanel(); renderTable(); }
    }else{
      historicalWeights=null; historicalWeightsByH=null; metricWeightsByH={};
      historicalBiases=null; historicalBiasesByH=null; activeBiases=null; activeBiasesByH=null;
      dbg(`accuracy: learning ${j&&j.days||0}/${j&&j.matureAt||14} days — live weighting for now`);
    }
  }catch(e){ dbg('accuracy weights GET failed: '+e.message); }
  renderAccuracyPanel();
      }
