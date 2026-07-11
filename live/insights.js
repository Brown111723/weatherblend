// ════════════════════════════════════════════════════════════════════════
// WeatherBlend — insights layer (loads after timeline.js)
//   1. Headline: plain-language answer built from the blended forecast.
//      Rule-based, client-side, confidence-aware. No extra network calls.
//   2. Receipts: what the blend said yesterday vs what BOM observed,
//      plus a 7-day verified record from GET /track/receipts.
// Renders into #wx-insight at the top of #carousels-section (self-creates
// the container if index.html doesn't have it).
// ════════════════════════════════════════════════════════════════════════

(function(){
'use strict';

// ── container ────────────────────────────────────────────────────────────
function insightRoot(){
  let el=document.getElementById('wx-insight');
  if(!el){
    const sec=document.getElementById('carousels-section');
    if(!sec)return null;
    el=document.createElement('div');
    el.id='wx-insight';
    sec.insertBefore(el, document.getElementById('timeline-root')||sec.firstChild);
  }
  return el;
}

// ── small utils ──────────────────────────────────────────────────────────
function fmtH(iso){
  const h=parseInt(iso.slice(11,13),10);
  if(h===0)return 'midnight';
  if(h===12)return 'noon';
  return (h%12)+(h<12?'am':'pm');
}
function addDaysStr(dateStr,n){
  const d=new Date(dateStr+'T12:00:00'); d.setDate(d.getDate()+n);
  const p=x=>String(x).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function isoHour(dateStr,h){return dateStr+'T'+String(h).padStart(2,'0')+':00';}
function cap(s){return s?s.charAt(0).toUpperCase()+s.slice(1):s;}
function degf(v){return Math.round(v)+'°';}

// Collect hourTileData for every ref hour in [fromIso, toIso)
function hoursIn(fromIso,toIso){
  const ref=(typeof refHourly==='function')?refHourly():null;
  if(!ref||!ref.time)return [];
  const out=[];
  for(let i=0;i<ref.time.length;i++){
    const t=ref.time[i];
    if(t>=fromIso&&t<toIso){
      const d=hourTileData(t);
      if(d)out.push(d);
    }
  }
  return out;
}

// ── rain segmentation ────────────────────────────────────────────────────
const RAIN_ON=0.15;          // mm/h considered "raining"
function rainSegments(hours){
  const segs=[]; let cur=null;
  for(const h of hours){
    const r=h.rain==null?0:h.rain;
    if(r>=RAIN_ON){
      if(!cur)cur={start:h.iso,end:h.iso,total:0,peak:0};
      cur.end=h.iso; cur.total+=r; cur.peak=Math.max(cur.peak,r);
    }else if(cur){segs.push(cur);cur=null;}
  }
  if(cur)segs.push(cur);
  return segs.filter(s=>s.total>=0.3);
}
function rainWord(seg){
  if(seg.peak<0.5)return 'light showers';
  if(seg.peak<1.5)return 'showers';
  if(seg.peak<4)return 'rain';
  return 'heavy rain';
}
// confidence → phrasing. hi: declarative. med: "likely". low: "a chance of".
function qualify(word,conf){
  if(conf==null||conf>=72)return word;
  if(conf>=48)return word+' likely';
  return 'a chance of '+word;
}

// ── headline builder ─────────────────────────────────────────────────────
function buildHeadline(){
  const today=localTodayStr();
  const tomorrow=addDaysStr(today,1);
  const now=locNowDate();
  const hh=now.getHours();
  const evening=hh>=17;
  const nowIso=isoHour(today,hh);

  // primary window: rest of today, or tonight → tomorrow noon
  const winFrom=nowIso;
  const winTo  =evening?isoHour(tomorrow,12):isoHour(tomorrow,0);
  const hours=hoursIn(winFrom,winTo);
  if(!hours.length)return null;

  const rainConf=(typeof confDayMetric==='function')?confDayMetric(evening?tomorrow:today,'rain'):null;
  const segs=rainSegments(hours);
  const totalRain=segs.reduce((a,s)=>a+s.total,0);

  // ---- sentence 1: precipitation story ----
  let s1;
  const periodWord=evening?'overnight and tomorrow morning':(hh<11?'today':'for the rest of the day');
  if(!segs.length){
    s1=(rainConf!=null&&rainConf<48)?`Probably dry ${periodWord}`:`Dry ${periodWord}`;
  }else{
    const seg=segs[0];
    const word=qualify(rainWord(seg),rainConf);
    const startsSoon=seg.start<=isoHour(today,hh+1)||seg.start===nowIso;
    const endH=parseInt(seg.end.slice(11,13),10);
    const endsLate=seg.end.slice(0,10)!==today||endH>=21;
    const endPhrase=endsLate?(evening?'into the morning':'through the evening'):`until about ${fmtH(seg.end)}`;
    if(startsSoon){
      s1=`${cap(word)} ${endPhrase}`;
    }else{
      s1=`Dry until ${fmtH(seg.start)}, then ${word} ${endPhrase}`;
    }
    if(totalRain>=1)s1+=` — around ${totalRain<10?Math.round(totalRain*2)/2:Math.round(totalRain)}mm`;
    if(segs.length>1)s1+=', with more later';
  }

  // ---- sentence 2: temperature story ----
  let s2='';
  if(evening){
    // overnight minimum: tonight 18:00 → tomorrow 09:00
    const night=hoursIn(isoHour(today,18),isoHour(tomorrow,9));
    let mn=null,mnIso=null;
    for(const h of night){ if(h.temp!=null&&(mn==null||h.temp<mn)){mn=h.temp;mnIso=h.iso;} }
    // tomorrow's top
    const tmrw=hoursIn(isoHour(tomorrow,9),isoHour(tomorrow,24));
    let mx=null,mxIso=null;
    for(const h of tmrw){ if(h.temp!=null&&(mx==null||h.temp>mx)){mx=h.temp;mxIso=h.iso;} }
    if(mn!=null){
      s2=`Down to ${degf(mn)} overnight`;
      if(mn<=2)s2+=', frost possible by morning';
      if(mx!=null)s2+=`; ${degf(mx)} tomorrow around ${fmtH(mxIso)}`;
      s2+='.';
    }
  }else{
    let mx=null,mxIso=null;
    for(const h of hours){
      if(h.iso.slice(0,10)!==today)continue;
      if(h.temp!=null&&(mx==null||h.temp>mx)){mx=h.temp;mxIso=h.iso;}
    }
    if(mx!=null){
      const mxH=parseInt(mxIso.slice(11,13),10);
      s2=(mxH<=hh)?`Top of ${degf(mx)} — the warmest part of the day is now.`
                  :`Top of ${degf(mx)} around ${fmtH(mxIso)}.`;
    }
    // frost look-ahead for cold evenings (winter-friendly)
    const night=hoursIn(isoHour(today,18),isoHour(tomorrow,9));
    let mn=null;
    for(const h of night){ if(h.temp!=null&&(mn==null||h.temp<mn))mn=h.temp; }
    if(mn!=null&&mn<=2)s2+=` Cold night ahead — down to ${degf(mn)}, frost possible.`;
  }

  // ---- wind, only when it matters ----
  let windBit='';
  let wMax=null;
  for(const h of hours){ if(h.wind!=null&&(wMax==null||h.wind>wMax))wMax=h.wind; }
  if(wMax!=null&&wMax>=30)windBit=`Windy — up to ${Math.round(wMax/5)*5} km/h.`;

  // ---- meta line ----
  const models=(typeof activeEnabled==='function')?activeEnabled().length:0;
  const confTxt=rainConf==null?'':` · rain confidence ${typeof confLabel==='function'?confLabel(rainConf):rainConf+'%'}`;
  const meta=`Blend of ${models} models${confTxt}`;

  return {s1:s1+'.',s2:[s2,windBit].filter(Boolean).join(' '),meta};
}

function renderHeadline(){
  const root=insightRoot(); if(!root)return;
  let el=root.querySelector('.wxi-head-wrap');
  if(!el){el=document.createElement('div');el.className='wxi-head-wrap';root.prepend(el);}
  const h=buildHeadline();
  if(!h){el.innerHTML='';return;}
  el.innerHTML=
    `<div class="wxi-head">${h.s1}</div>`+
    (h.s2?`<div class="wxi-sub">${h.s2}</div>`:'')+
    `<div class="wxi-meta">${h.meta}</div>`;
}

// ── receipts ─────────────────────────────────────────────────────────────
let _rcpt=null,_rcptState='idle',_rcptTries=0;

function dayName(dateStr){
  const today=localTodayStr();
  if(dateStr===addDaysStr(today,-1))return 'Yesterday';
  return new Date(dateStr+'T12:00:00').toLocaleDateString('en-AU',{weekday:'short'});
}

async function loadReceipts(){
  if(_rcptState==='loading'||_rcptState==='done')return;
  if(typeof bomWorkerConfigured!=='function'||!bomWorkerConfigured())return;
  const station=(typeof actualData!=='undefined')&&actualData&&actualData._bom&&actualData._bom.wmo;
  if(!station||state.lat==null){
    if(_rcptTries++<20)setTimeout(loadReceipts,3000);
    return;
  }
  _rcptState='loading';
  try{
    const u=`${BOM_WORKER_URL}/track/receipts?station=${encodeURIComponent(station)}&lat=${state.lat}&lon=${state.lon}&days=7`;
    const r=await fetch(u,{signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw new Error('http '+r.status);
    const j=await r.json();
    if(j&&Array.isArray(j.rows)&&j.rows.length&&j.summary&&j.summary.n>0){
      _rcpt=j;_rcptState='done';renderReceipts();
      if(typeof dbg==='function')dbg(`receipts: ${j.summary.n} verified days, tmax MAE ${j.summary.tmaxMAE}°`);
    }else{
      _rcptState='done'; // nothing to show yet — stay hidden
    }
  }catch(e){
    _rcptState='done'; // endpoint absent / failed — hide silently
    if(typeof dbg==='function')dbg('receipts unavailable: '+e.message);
  }
}

function renderReceipts(){
  const root=insightRoot(); if(!root||!_rcpt)return;
  let el=root.querySelector('.wxi-receipt');
  if(!el){
    el=document.createElement('div');
    el.className='wxi-receipt';
    el.addEventListener('click',()=>el.classList.toggle('open'));
    root.appendChild(el);
  }
  const s=_rcpt.summary;
  const y=_rcpt.rows[0]; // most recent first
  let line1='';
  if(y&&y.f.tmax!=null&&y.a.tmax!=null){
    const isYest=y.target===addDaysStr(localTodayStr(),-1);
    line1=`<span class="wxi-tick">✓</span><span>${isYest?'Yesterday':dayName(y.target)} we said <b>${y.f.tmax.toFixed(1)}°</b> — BOM recorded <b>${y.a.tmax.toFixed(1)}°</b>.</span>`;
  }else{
    line1=`<span class="wxi-tick">✓</span><span>Forecast record — verified against BOM observations.</span>`;
  }
  const rainTxt=s.rainN?` · rain called right ${s.rainHit}/${s.rainN} days`:'';
  const line2=`Past ${s.n} days: within ${s.tmaxMAE.toFixed(1)}° on average${rainTxt} · tap for the record`;
  const rows=_rcpt.rows.map(r=>{
    const ft=r.f.tmax!=null?r.f.tmax.toFixed(1)+'°':'—';
    const at=r.a.tmax!=null?r.a.tmax.toFixed(1)+'°':'—';
    const fw=r.f.rain!=null&&r.f.rain>=1, aw=r.a.rain!=null&&r.a.rain>=1;
    const rainHit=(r.f.rain!=null&&r.a.rain!=null)?(fw===aw):null;
    const dot=rainHit==null?'<span class="wxi-dot dim">·</span>':(rainHit?'<span class="wxi-dot hit">●</span>':'<span class="wxi-dot miss">●</span>');
    return `<div class="wxi-r-row"><span class="wxi-r-day">${dayName(r.target)}</span><span>said ${ft}</span><span>was ${at}</span><span class="wxi-r-rain">${dot} rain</span></div>`;
  }).join('');
  el.innerHTML=
    `<div class="wxi-r-line">${line1}</div>`+
    `<div class="wxi-r-sub">${line2}</div>`+
    `<div class="wxi-r-table"><div class="wxi-r-row wxi-r-hdr"><span></span><span>day max said</span><span>observed</span><span>rain call</span></div>${rows}</div>`;
}

// ── hooks ────────────────────────────────────────────────────────────────
// Wrap renderCurrentBar (after timeline.js's own wrapper) so the headline
// tracks every re-render; also refresh on a slow timer for clock drift.
if(typeof renderCurrentBar==='function'){
  const _insOrig=renderCurrentBar;
  renderCurrentBar=function(){
    _insOrig.apply(this,arguments);
    try{renderHeadline();}catch(e){}
    try{loadReceipts();}catch(e){}
  };
}
setInterval(function(){try{renderHeadline();}catch(e){}},10*60*1000);

})();
