// ════════════════════════════════════════════════════════════════════════
// WeatherBlend — forecast receipts (loads after timeline.js)
//   Lives inside ☰ → Forecast accuracy, at the top of the modal.
//   "What we said the day before vs what was observed", 7 days.
//   · The table is king: observed values come from the app's own actual
//     series (respecting the Actual-source setting — BOM / Open-Meteo /
//     Blend); the Worker's stored BOM daily rows only fill days outside
//     the client's past-data window.
//   · Everything is keyed to station + coordinates: changing location
//     always discards the old record and refetches — a receipt is never
//     rendered against data from a different place.
// ════════════════════════════════════════════════════════════════════════

(function(){
'use strict';

// ── small utils ──────────────────────────────────────────────────────────
function addDaysStr(dateStr,n){
  const d=new Date(dateStr+'T12:00:00'); d.setDate(d.getDate()+n);
  const p=x=>String(x).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function weekday(dateStr,style){return new Date(dateStr+'T12:00:00').toLocaleDateString('en-AU',{weekday:style||'long'});}
function dayName(dateStr){
  const today=localTodayStr();
  if(dateStr===addDaysStr(today,-1))return 'Yesterday';
  return weekday(dateStr,'short');
}
function curSelDate(){
  try{ if(typeof selDate!=='undefined'&&selDate)return selDate; }catch(e){}
  return localTodayStr();
}

// The table is king: force 1-hour resolution while sampling so wBlendAt
// (which aggregates by state.view) returns true per-hour values.
function at1h(fn){
  const v=state.view;
  if(v==='1h')return fn();
  state.view='1h';
  try{ return fn(); } finally{ state.view=v; }
}

// ── receipts state ───────────────────────────────────────────────────────
let _rcpt=null,_rcptRaw=null,_rcptState='idle',_rcptKey=null,_rcptTries=0;

function currentStation(){
  try{ return (typeof actualData!=='undefined')&&actualData&&actualData._bom&&actualData._bom.wmo||null; }
  catch(e){ return null; }
}
// One key for "which place is this record about". Station AND rounded
// coordinates — so moving to a new town always changes the key, even while
// the nearest-station lookup is still catching up or resolves to the same
// station.
function rcptLocKey(){
  const st=currentStation()||'-';
  const la=(state&&state.lat!=null)?(Math.round(state.lat*10)/10):'-';
  const lo=(state&&state.lon!=null)?(Math.round(state.lon*10)/10):'-';
  return st+'|'+la+'|'+lo;
}

// Same tag the table's ✓ Actual row shows for the current source setting.
function obsSrcTag(){
  try{ return ({bom:'BOM',om:'Open-Meteo',blend:'Blend'})[actualSource]||'BOM'; }catch(e){ return 'BOM'; }
}
// Observed daily stats from the app's own actual series — actualData.daily is
// exactly what the table's ✓ Actual row renders, so this follows the
// Actual-source setting by construction. Completed days only.
function clientObsDay(dateStr){
  try{
    if(dateStr>=localTodayStr())return null;
    const D=(typeof actualData!=='undefined')&&actualData&&actualData.daily;
    if(!D||!D.time)return null;
    const i=D.time.indexOf(dateStr); if(i<0)return null;
    const tmax=D.temperature_2m_max[i];
    if(tmax==null)return null;
    const tmin=D.temperature_2m_min[i], rain=D.precipitation_sum[i];
    return {tmax:+(+tmax).toFixed(1), tmin:tmin!=null?+(+tmin).toFixed(1):null, rain:rain!=null?+(+rain).toFixed(2):null};
  }catch(e){return null;}
}

// Pure blend daily aggregates from the app's own data — by construction the
// same numbers as the table's blend row / dashed forecast line for that day.
// Used to fill "we said" for days the app wasn't opened to archive a row.
function pureBlendDay(dateStr){
  try{
    const ref=(typeof refHourly==='function')?refHourly():null;
    if(!ref||!ref.time)return null;
    const hz=(typeof horizonOf==='function')?horizonOf(dateStr):0;
    let tmax=null,tmin=null,rain=0,hasR=false;
    for(let i=0;i<ref.time.length;i++){
      if(ref.time[i].slice(0,10)!==dateStr)continue;
      const t=wBlendAt('temperature_2m',i,hz);
      if(t!=null&&!isNaN(t)){tmax=tmax==null?t:Math.max(tmax,t);tmin=tmin==null?t:Math.min(tmin,t);}
      let r=wBlendAt('precipitation',i,hz);
      if(r!=null&&!isNaN(r)){if(typeof _rcell==='function')r=_rcell(r);rain+=r;hasR=true;}
    }
    if(tmax==null&&!hasR)return null;
    return {tmax:tmax!=null?+tmax.toFixed(1):null,tmin:tmin!=null?+tmin.toFixed(1):null,rain:hasR?+rain.toFixed(2):null};
  }catch(e){return null;}
}
function rcptSummary(rows){
  let ae=0,n=0,hit=0,rn=0;
  rows.forEach(r=>{
    if(r.f.tmax!=null&&r.a.tmax!=null){ae+=Math.abs(r.f.tmax-r.a.tmax);n++;}
    if(r.f.rain!=null&&r.a.rain!=null){rn++;if((r.f.rain>=1)===(r.a.rain>=1))hit++;}
  });
  return {n,tmaxMAE:n?+(ae/n).toFixed(2):null,rainHit:hit,rainN:rn};
}

// Merge endpoint data with client-side fill. Forecast side: the archived
// blend row (Worker), else a client-side pure-blend reconstruction (~).
// Observed side: the table is king — clientObsDay (the app's own actual
// series, per the Actual-source setting) wins wherever it covers the day;
// the Worker's stored BOM daily row is only the fallback beyond the
// client's past-data window. Handles old (rows+summary) and new
// (rows+actuals map) response shapes.
function buildRcptRows(j){
  if(!j)return null;
  const stored={},workerAct={};
  (j.rows||[]).forEach(r=>{
    if(!r||!r.target)return;
    if(r.f)stored[r.target]={f:r.f,src:r.src||'stored'};
    if(r.a)workerAct[r.target]=r.a;
  });
  Object.keys(j.actuals||{}).forEach(d=>{ if(!workerAct[d])workerAct[d]=j.actuals[d]; });
  const today=localTodayStr();
  const dset=new Set(Object.keys(workerAct));
  try{
    const D=(typeof actualData!=='undefined')&&actualData&&actualData.daily;
    if(D&&D.time)D.time.forEach(d=>{if(d<today)dset.add(d);});
  }catch(e){}
  const dates=[...dset].filter(d=>d<today).sort().reverse().slice(0,7);
  const rows=[];
  for(const d of dates){
    const co=clientObsDay(d), wa=workerAct[d]||null;
    const a=co||(wa?{tmax:wa.tmax!=null?wa.tmax:null,tmin:wa.tmin!=null?wa.tmin:null,rain:wa.rain!=null?wa.rain:null}:null);
    if(!a)continue;
    let f=null,src='client';
    if(stored[d]&&stored[d].f){f=stored[d].f;src=stored[d].src;}
    else{f=at1h(function(){return pureBlendDay(d);});}
    if(!f)continue;
    rows.push({target:d,src,f,a,aSrc:co?'client':'bom'});
  }
  return {rows,summary:rcptSummary(rows)};
}

async function loadReceipts(){
  if(typeof bomWorkerConfigured!=='function'||!bomWorkerConfigured())return;
  const key=rcptLocKey();
  // location changed (station or coordinates) → discard and refetch
  if(_rcptKey&&key!==_rcptKey){
    _rcpt=null;_rcptRaw=null;_rcptState='idle';_rcptTries=0;
    const el=document.querySelector('#acc-body .wxi-receipt');
    if(el)el.remove();
  }
  if(_rcptState==='loading')return;
  if(_rcptState==='done'&&key===_rcptKey)return;
  const station=currentStation();
  if(!station||state.lat==null){
    if(_rcptTries++<20)setTimeout(loadReceipts,3000);
    return;
  }
  _rcptState='loading';_rcptKey=key;
  try{
    const u=`${BOM_WORKER_URL}/track/receipts?station=${encodeURIComponent(station)}&lat=${state.lat}&lon=${state.lon}&days=7`;
    const r=await fetch(u,{signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw new Error('http '+r.status);
    const j=await r.json();
    if(rcptLocKey()!==key){ _rcptState='idle'; return; } // moved mid-flight — discard
    _rcptState='done';
    _rcptRaw=j;
    const built=buildRcptRows(j);
    if(built&&built.rows.length&&built.summary.n>0){
      _rcpt=built;renderReceipts();
      if(typeof dbg==='function')dbg(`receipts[${station}]: ${built.summary.n} verified days, tmax MAE ${built.summary.tmaxMAE}°`);
    }else{
      if(typeof dbg==='function')dbg(`receipts[${station}]: no verified days yet`);
    }
  }catch(e){
    if(rcptLocKey()===key)_rcptState='done';
    if(typeof dbg==='function')dbg('receipts unavailable: '+e.message);
  }
}

function renderReceipts(){
  const body=document.getElementById('acc-body'); if(!body)return;
  const fresh=_rcptKey===rcptLocKey();
  // rebuild from the raw payload so the observed side always reflects the
  // current Actual-source setting (and the freshest client actuals)
  if(_rcptRaw&&fresh){
    const b=buildRcptRows(_rcptRaw);
    if(b&&b.rows.length&&b.summary.n>0)_rcpt=b;
  }
  let el=body.querySelector('.wxi-receipt');
  if(!fresh||!_rcpt){ if(el)el.remove(); return; }
  if(!el){
    el=document.createElement('div');
    el.className='wxi-receipt open';
    el.addEventListener('click',()=>el.classList.toggle('open'));
    body.insertBefore(el,body.firstChild);
  }
  const s=_rcpt.summary;
  const sel=curSelDate();
  const y=_rcpt.rows[0];
  let line1='';
  if(y&&y.f.tmax!=null&&y.a.tmax!=null){
    const est=(y.src==='client'||y.src==='recon');
    const tag=y.aSrc==='client'?obsSrcTag():'BOM';
    const recWord=tag==='Blend'?'the blend recorded':`${tag} recorded`;
    line1=`<span class="wxi-tick">✓</span><span>${dayName(y.target)} we said <b>${est?'~':''}${y.f.tmax.toFixed(1)}°</b> — ${recWord} <b>${y.a.tmax.toFixed(1)}°</b>.</span>`;
  }else{
    line1=`<span class="wxi-tick">✓</span><span>Forecast record — verified against observations.</span>`;
  }
  const rainTxt=s.rainN?` · rain called right ${s.rainHit}/${s.rainN} days`:'';
  const line2=s.n?`Past ${s.n} days: within ${s.tmaxMAE.toFixed(1)}° on average${rainTxt}`:'';
  const rows=_rcpt.rows.map(r=>{
    const ft=r.f.tmax!=null?((r.src==='client'||r.src==='recon')?'~':'')+r.f.tmax.toFixed(1)+'°':'—';
    const at=r.a.tmax!=null?r.a.tmax.toFixed(1)+'°':'—';
    const fw=r.f.rain!=null&&r.f.rain>=1, aw=r.a.rain!=null&&r.a.rain>=1;
    const rainHit=(r.f.rain!=null&&r.a.rain!=null)?(fw===aw):null;
    const dot=rainHit==null?'<span class="wxi-dot dim">·</span>':(rainHit?'<span class="wxi-dot hit">●</span>':'<span class="wxi-dot miss">●</span>');
    const selCls=r.target===sel?' sel':'';
    return `<div class="wxi-r-row${selCls}"><span class="wxi-r-day">${dayName(r.target)}</span><span>said ${ft}</span><span>was ${at}</span><span class="wxi-r-rain">${dot} rain</span></div>`;
  }).join('');
  el.innerHTML=
    `<div class="wxi-r-line">${line1}</div>`+
    `<div class="wxi-r-sub">${line2}</div>`+
    `<div class="wxi-r-table"><div class="wxi-r-row wxi-r-hdr"><span></span><span>day max said</span><span>observed</span><span>rain call</span></div>${rows}</div>`;
}

// ── hooks ────────────────────────────────────────────────────────────────
// 1) every data re-render (load, refresh, model toggles, location change) —
//    keeps the record warm and catches location changes immediately.
if(typeof renderCurrentBar==='function'){
  const _o=renderCurrentBar;
  renderCurrentBar=function(){ _o.apply(this,arguments); try{loadReceipts();}catch(e){} };
}
// 2) the accuracy modal — the receipt renders at the top of it, so re-add it
//    after every panel render (open, and option changes while open).
if(typeof renderAccuracyPanel==='function'){
  const _o=renderAccuracyPanel;
  renderAccuracyPanel=function(){
    _o.apply(this,arguments);
    try{renderReceipts();}catch(e){}
    try{loadReceipts();}catch(e){}
  };
}

})();
