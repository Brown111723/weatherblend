// ════════════════════════════════════════════════════════════════════════
// WeatherBlend — forecast receipts (loads after timeline.js)
//   Lives inside ☰ → Forecast accuracy, at the top of the modal.
//   "The blend said X° — observed Y°", for each completed past day.
//   Everything is computed from data already in the app:
//     · observed  = actualData.daily (Open-Meteo's analysis of past hours —
//       exactly what the table's ✓ Actual row shows)
//     · the blend = pureBlendDay(): the same weighted blend the table's
//       rows and the chart's dashed line render for that day
//   No network, no server, no state — rebuilt fresh on every render, so
//   location changes can never show a stale record.
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

// Observed daily stats from the app's own actual series — actualData.daily
// is exactly what the ✓ Actual rows render. Completed days only.
function obsDay(dateStr){
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

// Blend daily aggregates from the app's own data — by construction the same
// numbers as the table's blend rows / the chart's dashed forecast line.
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

function buildRows(){
  const today=localTodayStr();
  const D=(typeof actualData!=='undefined')&&actualData&&actualData.daily;
  if(!D||!D.time)return null;
  const dates=D.time.filter(d=>d<today).sort().reverse().slice(0,7);
  if(!dates.length)return null;
  const rows=[];
  at1h(function(){
    for(const d of dates){
      const a=obsDay(d); if(!a)continue;
      const f=pureBlendDay(d); if(!f)continue;
      rows.push({target:d,f,a});
    }
  });
  if(!rows.length)return null;
  let ae=0,n=0,hit=0,rn=0;
  rows.forEach(r=>{
    if(r.f.tmax!=null&&r.a.tmax!=null){ae+=Math.abs(r.f.tmax-r.a.tmax);n++;}
    if(r.f.rain!=null&&r.a.rain!=null){rn++;if((r.f.rain>=1)===(r.a.rain>=1))hit++;}
  });
  return {rows,summary:{n,tmaxMAE:n?+(ae/n).toFixed(2):null,rainHit:hit,rainN:rn}};
}

function renderReceipts(){
  const body=document.getElementById('acc-body'); if(!body)return;
  const built=buildRows();
  let el=body.querySelector('.wxi-receipt');
  if(!built||!built.summary.n){ if(el)el.remove(); return; }
  if(!el){
    el=document.createElement('div');
    el.className='wxi-receipt open';
    el.addEventListener('click',()=>el.classList.toggle('open'));
    body.insertBefore(el,body.firstChild);
  }
  const s=built.summary;
  const sel=curSelDate();
  const y=built.rows[0];
  let line1;
  if(y&&y.f.tmax!=null&&y.a.tmax!=null){
    line1=`<span class="wxi-tick">✓</span><span>${dayName(y.target)} the blend said <b>${y.f.tmax.toFixed(1)}°</b> — observed <b>${y.a.tmax.toFixed(1)}°</b>.</span>`;
  }else{
    line1=`<span class="wxi-tick">✓</span><span>Blend record — verified against observations.</span>`;
  }
  const rainTxt=s.rainN?` · rain called right ${s.rainHit}/${s.rainN} days`:'';
  const line2=s.n?`Past ${s.n} days: within ${s.tmaxMAE.toFixed(1)}° on average${rainTxt}`:'';
  const rows=built.rows.map(r=>{
    const ft=r.f.tmax!=null?r.f.tmax.toFixed(1)+'°':'—';
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

// ── hook: the receipt renders at the top of the accuracy modal, so re-add
//    it after every panel render (open, and option changes while open).
if(typeof renderAccuracyPanel==='function'){
  const _o=renderAccuracyPanel;
  renderAccuracyPanel=function(){
    _o.apply(this,arguments);
    try{renderReceipts();}catch(e){}
  };
}

})();
