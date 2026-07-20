// ════════════════════════════════════════════════════════════════════════
// WeatherBlend — engine.js  (data, blending, accuracy · Phase 1)
// ════════════════════════════════════════════════════════════════════════
// Load order: engine.js FIRST, then app.js. This file owns:
//   • all shared mutable state (prefs, weights, actuals, caches)
//   • model fetching (Open-Meteo, forecast + past days)
//   • the blend: per-metric accuracy weights
//   • live accuracy scoring (recency / per-day) with shrinkage,
//     verified against Open-Meteo's analysis of past hours
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
  { key:'gfs_seamless',      ep:'/v1/forecast', label:'GFS',   short:'G', color:'#2563eb', desc:'NOAA · USA'      },
  { key:'ecmwf_ifs025',      ep:'/v1/ecmwf',    label:'ECMWF', short:'E', color:'#059669', desc:'ECMWF · 0.25°'   },
  { key:'icon_seamless',     ep:'/v1/forecast', label:'ICON',  short:'I', color:'#16a34a', desc:'DWD · Germany'   },
  { key:'gem_seamless',      ep:'/v1/forecast', label:'GEM',   short:'C', color:'#7c3aed', desc:'Env. Canada'     },
  { key:'ukmo_seamless',     ep:'/v1/forecast', label:'UKMO',  short:'U', color:'#dc2626', desc:'Met Office · UK' },
  { key:'cma_grapes_global', ep:'/v1/forecast', label:'CMA',   short:'X', color:'#d97706', desc:'CMA · China'     },
  { key:'jma_seamless',      ep:'/v1/forecast', label:'JMA',   short:'J', color:'#6366f1', desc:'JMA · Japan'     }
];
const enabled    = new Set(MODELS.map(m=>m.key));
const autoHidden = new Set();

// ── Shared state (single home for every cross-file global) ─────────────
// UI prefs (rendered by app.js, persisted in prefs)
let showDetail = false;
// ── Secondary metrics (table sections, off by default) ─────────────────
// Same treatment as the main four: blended head row, per-model source rows
// and a ✓ Actual row. Weighting piggybacks on the nearest main metric's
// skill scores (snow→rain, gusts→wind, humidity→cloud); pressure and UV
// fall back to the overall model weights.
const XMET = [
  { key:'snow',  field:'snowfall',             label:'Snow',     unit:'cm',   color:'#BFE8FF' },
  { key:'gust',  field:'wind_gusts_10m',       label:'Gusts',    unit:'km/h', color:'#FFB86B' },
  { key:'humid', field:'relative_humidity_2m', label:'Humidity', unit:'%',    color:'#4ED6B8' },
  { key:'press', field:'surface_pressure',     label:'Pressure', unit:'hPa',  color:'#F09AD0' },
  { key:'uv',    field:'uv_index',             label:'UV',       unit:'',     color:'#FFD75E' }
];
const secVisible = { temp:true, wind:true, rain:true, cloud:true, snow:false, gust:false, humid:false, press:false, uv:false };
const secDetail  = { temp:false, rain:false, wind:false, cloud:false, snow:false, gust:false, humid:false, press:false, uv:false };
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
let actualSources = null;
let learnDays = 14;                 // past days fetched per model (scores accuracy)
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
// Client-computed accuracy artefacts (for the Forecast accuracy panel)
let accuracyStats=null, accuracyMeta=null;

// ── Weighting constants ─────────────────────────────────────────────────
const SHRINK_K = 60;    // sample count before learned skill outranks equal
const W_FLOOR  = 0.03;  // no model fully silenced
const W_CAP    = 0.40;  // no model dominates

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
    map(j.hourly,'wind_gusts_10m','windgusts_10m');
    map(j.hourly,'surface_pressure','surface_pressure_hpa');
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
  const isSum=(field==='precipitation'||field==='snowfall');
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

// ── Weighted blending ───────────────────────────────────────────────────
function fieldSec(field){
  if(/temperature/.test(field))return'temp';
  if(/precipitation/.test(field))return'rain';
  if(/snowfall/.test(field))return'rain';
  if(/wind/.test(field))return'wind';
  if(/cloud/.test(field))return'cloud';
  if(/humidity/.test(field))return'cloud';
  return null;
}
// Lead time (whole days) of a date from today: today=0, tomorrow=1, …
function horizonOf(dateStr){
  if(!dateStr)return null;
  return Math.round((new Date(dateStr+'T12:00:00')-new Date(localTodayStr()+'T12:00:00'))/86400000);
}
// The blend: accuracy-weighted mean of the enabled models' values.
// `horizon` and `field` are accepted for call-site stability.
function weightedAvgOf(modelValPairs,sec,horizon,field){
  const pairs=modelValPairs.filter(p=>p.val!=null&&!isNaN(p.val));
  if(!pairs.length)return null;
  const Wmap=sec&&metricWeights[sec]&&Object.keys(metricWeights[sec]).length?metricWeights[sec]:null;
  const W=Wmap||modelWeights;
  let res;
  if(!useWeightedAvg||!Object.keys(W).length){
    res=pairs.reduce((s,p)=>s+p.val,0)/pairs.length;
  }else{
    const totalW=pairs.reduce((s,p)=>s+(W[p.key]||0),0);
    res= totalW===0
      ? pairs.reduce((s,p)=>s+p.val,0)/pairs.length
      : pairs.reduce((s,p)=>s+p.val*(W[p.key]||0),0)/totalW;
  }
  const s=sec;
  if(s==='wind')res=Math.max(0,res);
  else if(s==='cloud')res=Math.max(0,Math.min(100,res));
  return res;
}
// Horizon-aware blended value at a ref index, window-aggregated to the view.
function wBlendAt(field,i,horizon){
  const step=state.view==='3h'?3:state.view==='8h'?8:1;
  const a=activeEnabled(); if(!a.length)return null;
  const isFirst=(field==='winddirection_10m'||field==='weathercode');
  const isSum=(field==='precipitation'||field==='snowfall');
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
    const baseH='precipitation,wind_speed_10m,wind_direction_10m,temperature_2m,weather_code,cloud_cover,relative_humidity_2m';
    const extraH=',apparent_temperature,snowfall,wind_gusts_10m,surface_pressure,uv_index';
    const buildUrl=h=>`https://api.open-meteo.com${m.ep}`
      +`?latitude=${state.lat}&longitude=${state.lon}`
      +`&hourly=${h}`
      +`&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,`
      +`wind_speed_10m_max,wind_direction_10m_dominant,sunrise,sunset,uv_index_max`
      +`&models=${m.key}&past_days=${Math.max(7,Math.min(31,learnDays))}&forecast_days=10&timezone=auto&wind_speed_unit=kmh`;
    const tryFetch=async h=>{
      const res=await fetch(buildUrl(h),{signal:AbortSignal.timeout(20000)});if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const json=await res.json();if(json.error)throw new Error(json.reason||'API error');
      normalizeOM(json);
      if(!json.hourly?.temperature_2m?.some(v=>v!=null))throw new Error('No data');
      return json;
    };
    try{
      let json;
      try{ json=await tryFetch(baseH+extraH); }
      catch(e1){ dbg(m.key+': extras failed ('+e1.message+') — retrying base fields'); json=await tryFetch(baseH); }
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

  // Actuals + weights derive from the model data just fetched — no extra wait.
  try{ buildForecastRainCache(); buildHiLoCache(); buildSourcesPanel(); scheduleAutoRefresh(); }catch(e){ dbg('prep error: '+e.message); }
  try{
    computeActualsAndWeights();
    dbg('actuals/weights ready'+(actualData?' — Open-Meteo analysis':' — no actuals'));
  }catch(e){ dbg('❌ actuals/weights error: '+e.message); }
  setStatus('ok',`${ok}/${MODELS.length} models · ${t}${failed.length?' · unavail: '+failed.join(', '):''}`);
  const _ck=`${state.lat!=null?state.lat.toFixed(3):'x'},${state.lon!=null?state.lon.toFixed(3):'x'}`;
  if(_ck!==_lastCoordsKey){ selDate=localTodayStr(); _lastCoordsKey=_ck; }
  try{ renderCurrentBar(); renderTable(); firstRenderDone=true; dbg('✓ rendered (weighted, with actuals)'); }
  catch(e){ dbg('❌ render error: '+e.message); }
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
  // Feels-like from the same current-hour data as everything else (Open-Meteo
  // analysis for past hours where available, blended forecast otherwise).
  let feels=wAt('apparent_temperature',nowIdx);
  if(actualData?.hourly?.time){
    const ai=actualData.hourly.time.indexOf(curIso);
    if(ai>=0){const av=actualData.hourly.apparent_temperature?.[ai];if(av!=null)feels=av;}
  }

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

  return {temp,feels,wind,windDir,wcode,hi,lo,rainToday,rainRemainToday:rainRemain,cloud,windHi,windLo,cloudHi,cloudLo,actualRainToday,rainNow,
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

// ── Actuals series (Open-Meteo analysis of past hours) ──────────────────
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
// Open-Meteo's own past-hours data (each model's analysis of hours already
// gone, equal-weight mean) is the observation series everything verifies
// against: the ✓ Actual rows, the accuracy weights, and the receipts.
function buildActualData(){
  const ref=refHourly();
  if(!ref?.time){ actualSources=null; actualData=null; return null; }
  const now=Date.now();
  const FS=['temperature_2m','precipitation','cloudcover','windspeed_10m','apparent_temperature','snowfall','wind_gusts_10m','surface_pressure','uv_index','relative_humidity_2m'];
  const O={time:[]}; FS.forEach(f=>O[f]=[]);
  ref.time.forEach((t,i)=>{
    if(new Date(t).getTime()>now) return;
    O.time.push(t);
    FS.forEach(f=>{
      let omV=meanAt(f,i); if(omV==null||isNaN(omV))omV=null;
      O[f].push(omV);
    });
  });
  actualSources={ om:{hourly:O,daily:_dailyFromHourly(O)}, stationName:'Open-Meteo' };
  return selectActual();
}
function selectActual(){
  if(!actualSources){actualData=null;return null;}
  const src=actualSources.om;
  actualData={hourly:src.hourly, daily:src.daily, stationName:actualSources.stationName, source:'om'};
  return actualData;
}
function selectedTruth(){
  return actualSources?.om?.hourly||null;
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
  const truth=selectedTruth();
  if(weightMethod==='daily'){
    _setMetricWeights(computeMetricWeightsDaily(truth, weightDays));
    dbg('weights: daily/'+weightDays+'d');
  }else if(weightMethod==='blend'){
    computeMetricWeights(truth);
    const cur={temp:{...metricWeights.temp},rain:{...metricWeights.rain},wind:{...metricWeights.wind},cloud:{...metricWeights.cloud}};
    const daily=computeMetricWeightsDaily(truth, weightDays);
    const am=activeEnabled(), mix={temp:{},rain:{},wind:{},cloud:{}};
    ['temp','rain','wind','cloud'].forEach(s=>am.forEach(m=>mix[s][m.key]=((cur[s][m.key]||0)+(daily[s][m.key]||0))/2));
    _setMetricWeights(mix);
    dbg('weights: blend(current+daily/'+weightDays+'d)');
  }else{
    computeMetricWeights(truth);
  }
  try{ computeAccuracyStats(); }catch(e){}
}
function computeActualsAndWeights(){
  try{
    buildActualData();
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

// ── Accuracy stats for the panel (per model, vs Open-Meteo analysis) ─────
// Hourly RMSE per metric over completed past hours, plus how often the
// model called wet/dry days wrong (occurrence error, threshold 1mm/day).
function computeAccuracyStats(){
  const truth=selectedTruth();
  const am=activeAll();
  if(!truth?.time?.length||!am.length){ accuracyStats=null; accuracyMeta=null; return; }
  const tMap={}; truth.time.forEach((t,i)=>{tMap[t]=i;});
  const today=localTodayStr();
  const METS=[['temp','temperature_2m'],['rain','precipitation'],['wind','windspeed_10m'],['cloud','cloudcover']];
  const days=new Set(); let pairs=0;
  const stats=am.map(m=>{
    const mh=state.data[m.key]?.hourly;
    const acc={temp:{se:0,n:0},rain:{se:0,n:0},wind:{se:0,n:0},cloud:{se:0,n:0}};
    const dayR={};   // per-day rain sums: model vs observed
    if(mh?.time)mh.time.forEach((t,i)=>{
      const d=t.slice(0,10); if(d>=today)return;
      const bi=tMap[t]; if(bi===undefined)return;
      METS.forEach(([s,field])=>{
        const mv=mh[field]?.[i], av=truth[field]?.[bi];
        if(mv==null||av==null||isNaN(mv)||isNaN(av))return;
        acc[s].se+=(mv-av)**2; acc[s].n++;
        if(s==='temp'){days.add(d);pairs++;}
        if(s==='rain'){const o=dayR[d]||(dayR[d]={f:0,a:0});o.f+=mv;o.a+=av;}
      });
    });
    const r={model:m.key};
    METS.forEach(([s])=>{ r[s]=acc[s].n>=12?+Math.sqrt(acc[s].se/acc[s].n).toFixed(2):null; });
    const dr=Object.values(dayR);
    r.occErr=dr.length?+(dr.filter(o=>(o.f>=1)!==(o.a>=1)).length/dr.length).toFixed(2):null;
    return r;
  }).filter(r=>r.temp!=null||r.rain!=null);
  accuracyStats=stats.length?stats:null;
  accuracyMeta=stats.length?{days:days.size,pairs,window:Math.max(7,Math.min(31,learnDays)),source:'om'}:null;
}
