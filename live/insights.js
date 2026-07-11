// ════════════════════════════════════════════════════════════════════════
// WeatherBlend — insights layer v2 (loads after timeline.js)
//   1. Headline: plain-language answer built from the same data path the
//      table uses (hourTileData → wBlendAt + observed actuals), always at
//      1-hour resolution regardless of the 1h/3h/8h view, so its numbers
//      agree with the table exactly. Follows the selected day:
//        today  → now-relative ("Dry until 2pm, then showers…")
//        future → day summary  ("Tuesday: showers from 11am…")
//        past   → observed recap ("Thursday: top of 13.2°, 4mm of rain")
//   2. Receipts: what the blend said the day before vs what BOM observed.
//      Re-fetches when the station changes; highlights the selected day.
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
function mmTxt(v){return (v<10?Math.round(v*2)/2:Math.round(v))+'mm';}
function weekday(dateStr,style){return new Date(dateStr+'T12:00:00').toLocaleDateString('en-AU',{weekday:style||'long'});}
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
function minMax(hours,dateOnly){
  let mn=null,mnIso=null,mx=null,mxIso=null;
  for(const h of hours){
    if(dateOnly&&h.iso.slice(0,10)!==dateOnly)continue;
    if(h.temp==null)continue;
    if(mx==null||h.temp>mx){mx=h.temp;mxIso=h.iso;}
    if(mn==null||h.temp<mn){mn=h.temp;mnIso=h.iso;}
  }
  return {mn,mnIso,mx,mxIso};
}

// ── headline: today (now-relative) ───────────────────────────────────────
function headlineToday(){
  const today=localTodayStr();
  const tomorrow=addDaysStr(today,1);
  const now=locNowDate();
  const hh=now.getHours();
  const evening=hh>=17;
  const nowIso=isoHour(today,hh);

  const winFrom=nowIso;
  const winTo  =evening?isoHour(tomorrow,12):isoHour(tomorrow,0);
  const hours=hoursIn(winFrom,winTo);
  if(!hours.length)return null;

  const rainConf=(typeof confDayMetric==='function')?confDayMetric(evening?tomorrow:today,'rain'):null;
  const segs=rainSegments(hours);
  const totalRain=segs.reduce((a,s)=>a+s.total,0);

  let s1;
  const periodWord=evening?'overnight and tomorrow morning':(hh<11?'today':'for the rest of the day');
  if(!segs.length){
    s1=(rainConf!=null&&rainConf<48)?`Probably dry ${periodWord}`:`Dry ${periodWord}`;
  }else{
    const seg=segs[0];
    const word=qualify(rainWord(seg),rainConf);
    const startsSoon=seg.start<=isoHour(today,Math.min(23,hh+1))||seg.start===nowIso;
    const endH=parseInt(seg.end.slice(11,13),10);
    const endsLate=seg.end.slice(0,10)!==today||endH>=21;
    const endPhrase=endsLate?(evening?'into the morning':'through the evening'):`until about ${fmtH(seg.end)}`;
    s1=startsSoon?`${cap(word)} ${endPhrase}`
                 :`Dry until ${fmtH(seg.start)}, then ${word} ${endPhrase}`;
    if(totalRain>=1)s1+=` — around ${mmTxt(totalRain)}`;
    if(segs.length>1)s1+=', with more later';
  }

  let s2='';
  if(evening){
    const night=hoursIn(isoHour(today,18),isoHour(tomorrow,9));
    const nm=minMax(night);
    const tmrw=hoursIn(isoHour(tomorrow,9),isoHour(addDaysStr(tomorrow,1),0));
    const tm=minMax(tmrw,tomorrow);
    if(nm.mn!=null){
      s2=`Down to ${degf(nm.mn)} overnight`;
      if(nm.mn<=2)s2+=', frost possible by morning';
      if(tm.mx!=null)s2+=`; ${degf(tm.mx)} tomorrow around ${fmtH(tm.mxIso)}`;
      s2+='.';
    }
  }else{
    const dm=minMax(hours,today);
    if(dm.mx!=null){
      const mxH=parseInt(dm.mxIso.slice(11,13),10);
      s2=(mxH<=hh)?`Top of ${degf(dm.mx)} — the warmest part of the day is now.`
                  :`Top of ${degf(dm.mx)} around ${fmtH(dm.mxIso)}.`;
    }
    const night=hoursIn(isoHour(today,18),isoHour(tomorrow,9));
    const nm=minMax(night);
    if(nm.mn!=null&&nm.mn<=2)s2+=` Cold night ahead — down to ${degf(nm.mn)}, frost possible.`;
  }

  let windBit='';
  let wMax=null;
  for(const h of hours){ if(h.wind!=null&&(wMax==null||h.wind>wMax))wMax=h.wind; }
  if(wMax!=null&&wMax>=30)windBit=`Windy — up to ${Math.round(wMax/5)*5} km/h.`;

  return {s1:s1+'.',s2:[s2,windBit].filter(Boolean).join(' '),conf:rainConf,confDay:evening?tomorrow:today};
}

// ── headline: a future day ───────────────────────────────────────────────
function headlineFuture(sel){
  const today=localTodayStr();
  const hours=hoursIn(isoHour(sel,0),isoHour(addDaysStr(sel,1),0));
  if(!hours.length)return null;
  const label=sel===addDaysStr(today,1)?'Tomorrow':weekday(sel);
  const rainConf=(typeof confDayMetric==='function')?confDayMetric(sel,'rain'):null;
  const segs=rainSegments(hours);
  const totalRain=segs.reduce((a,s)=>a+s.total,0);

  let s1;
  if(!segs.length){
    s1=(rainConf!=null&&rainConf<48)?`${label}: probably dry`:`${label}: dry all day`;
  }else{
    const seg=segs[0];
    const word=qualify(rainWord(seg),rainConf);
    const startH=parseInt(seg.start.slice(11,13),10);
    const endH=parseInt(seg.end.slice(11,13),10);
    const startPhrase=startH<6?`${word} early`:`${word} from ${fmtH(seg.start)}`;
    const endPhrase=endH>=21?'into the night':`until about ${fmtH(seg.end)}`;
    s1=`${label}: ${startPhrase}${startH<6?', ':' '}${endPhrase}`;
    if(totalRain>=1)s1+=` — around ${mmTxt(totalRain)}`;
    if(segs.length>1)s1+=', with more later';
  }

  const dm=minMax(hours,sel);
  const morn=hoursIn(isoHour(sel,0),isoHour(sel,9));
  const mm2=minMax(morn);
  let s2='';
  if(dm.mx!=null)s2=`Top of ${degf(dm.mx)} around ${fmtH(dm.mxIso)}`;
  if(mm2.mn!=null){
    s2+=(s2?'; ':'')+`morning low ${degf(mm2.mn)}`;
    if(mm2.mn<=2)s2+=', frost possible';
  }
  if(s2)s2+='.';

  let wMax=null;
  for(const h of hours){ if(h.wind!=null&&(wMax==null||h.wind>wMax))wMax=h.wind; }
  if(wMax!=null&&wMax>=30)s2+=` Windy — up to ${Math.round(wMax/5)*5} km/h.`;

  return {s1:s1+'.',s2,conf:rainConf,confDay:sel};
}

// ── headline: a past day (observed recap) ────────────────────────────────
function headlinePast(sel){
  const hours=hoursIn(isoHour(sel,0),isoHour(addDaysStr(sel,1),0));
  if(!hours.length)return null;
  const today=localTodayStr();
  const label=sel===addDaysStr(today,-1)?'Yesterday':weekday(sel);
  const dm=minMax(hours,sel);
  let rain=0,hasR=false,anyAct=false;
  for(const h of hours){ if(h.rain!=null){rain+=h.rain;hasR=true;} if(h.isAct)anyAct=true; }
  let s1=`${label}: `;
  const bits=[];
  if(dm.mx!=null)bits.push(`top of ${dm.mx.toFixed(1)}°`);
  if(dm.mn!=null)bits.push(`low of ${dm.mn.toFixed(1)}°`);
  if(hasR)bits.push(rain>=0.3?`${mmTxt(rain)} of rain`:'no rain');
  s1+=bits.join(', ')||'no data';
  return {s1:s1+'.',s2:'',conf:null,confDay:null,past:true,anyAct};
}

// ── render ───────────────────────────────────────────────────────────────
function buildHeadline(){
  const today=localTodayStr();
  const sel=curSelDate();
  if(sel===today)return headlineToday();
  if(sel>today)return headlineFuture(sel);
  return headlinePast(sel);
}

function renderHeadline(){
  const root=insightRoot(); if(!root)return;
  let el=root.querySelector('.wxi-head-wrap');
  if(!el){el=document.createElement('div');el.className='wxi-head-wrap';root.prepend(el);}
  const h=at1h(buildHeadline);
  if(!h){el.innerHTML='';return;}
  const models=(typeof activeEnabled==='function')?activeEnabled().length:0;
  let meta;
  if(h.past){
    meta=h.anyAct?'Observed (BOM) where available':'Model hindcast — no observations stored';
  }else{
    const confTxt=h.conf==null?'':` · rain confidence ${typeof confLabel==='function'?confLabel(h.conf):h.conf+'%'}`;
    meta=`Blend of ${models} models${confTxt}`;
  }
  el.innerHTML=
    `<div class="wxi-head">${h.s1}</div>`+
    (h.s2?`<div class="wxi-sub">${h.s2}</div>`:'')+
    `<div class="wxi-meta">${meta}</div>`;
}

// ── receipts ─────────────────────────────────────────────────────────────
let _rcpt=null,_rcptState='idle',_rcptStation=null,_rcptTries=0;

function dayName(dateStr){
  const today=localTodayStr();
  if(dateStr===addDaysStr(today,-1))return 'Yesterday';
  return weekday(dateStr,'short');
}
function currentStation(){
  try{ return (typeof actualData!=='undefined')&&actualData&&actualData._bom&&actualData._bom.wmo||null; }
  catch(e){ return null; }
}

async function loadReceipts(){
  if(typeof bomWorkerConfigured!=='function'||!bomWorkerConfigured())return;
  const station=currentStation();
  // station changed (new location) → clear and refetch
  if(station&&_rcptStation&&station!==_rcptStation){
    _rcpt=null;_rcptState='idle';_rcptTries=0;
    const root=insightRoot();
    const el=root&&root.querySelector('.wxi-receipt');
    if(el)el.remove();
  }
  if(_rcptState==='loading')return;
  if(_rcptState==='done'&&station===_rcptStation)return;
  if(!station||state.lat==null){
    if(_rcptTries++<20)setTimeout(loadReceipts,3000);
    return;
  }
  _rcptState='loading';_rcptStation=station;
  try{
    const u=`${BOM_WORKER_URL}/track/receipts?station=${encodeURIComponent(station)}&lat=${state.lat}&lon=${state.lon}&days=7`;
    const r=await fetch(u,{signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw new Error('http '+r.status);
    const j=await r.json();
    _rcptState='done';
    if(j&&Array.isArray(j.rows)&&j.rows.length&&j.summary&&j.summary.n>0){
      _rcpt=j;renderReceipts();
      if(typeof dbg==='function')dbg(`receipts[${station}]: ${j.summary.n} verified days, tmax MAE ${j.summary.tmaxMAE}°`);
    }else{
      if(typeof dbg==='function')dbg(`receipts[${station}]: no verified days yet`);
    }
  }catch(e){
    _rcptState='done';
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
  const sel=curSelDate();
  // lead with the selected day if it's in the record, else the most recent
  const selRow=_rcpt.rows.find(r=>r.target===sel);
  const y=selRow||_rcpt.rows[0];
  let line1='';
  if(y&&y.f.tmax!=null&&y.a.tmax!=null){
    const isYest=y.target===addDaysStr(localTodayStr(),-1);
    const when=isYest?'Yesterday':(selRow?`On ${weekday(y.target)}`:dayName(y.target));
    line1=`<span class="wxi-tick">✓</span><span>${when} we said <b>${y.f.tmax.toFixed(1)}°</b> — BOM recorded <b>${y.a.tmax.toFixed(1)}°</b>.</span>`;
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
    const selCls=r.target===sel?' sel':'';
    return `<div class="wxi-r-row${selCls}"><span class="wxi-r-day">${dayName(r.target)}</span><span>said ${ft}</span><span>was ${at}</span><span class="wxi-r-rain">${dot} rain</span></div>`;
  }).join('');
  el.innerHTML=
    `<div class="wxi-r-line">${line1}</div>`+
    `<div class="wxi-r-sub">${line2}</div>`+
    `<div class="wxi-r-table"><div class="wxi-r-row wxi-r-hdr"><span></span><span>day max said</span><span>observed</span><span>rain call</span></div>${rows}</div>`;
}

// ── hooks ────────────────────────────────────────────────────────────────
function refreshAll(){
  try{renderHeadline();}catch(e){}
  try{renderReceipts();}catch(e){}
  try{loadReceipts();}catch(e){}
}
// 1) every data re-render (load, refresh, model toggles, location change)
if(typeof renderCurrentBar==='function'){
  const _o=renderCurrentBar;
  renderCurrentBar=function(){ _o.apply(this,arguments); refreshAll(); };
}
// 2) day selection — the timeline changes days via tlSelect / setSelectedDay,
//    which do NOT go through renderCurrentBar, so wrap both.
if(typeof tlSelect==='function'){
  const _o=tlSelect;
  tlSelect=function(){ _o.apply(this,arguments); refreshAll(); };
}
if(typeof setSelectedDay==='function'){
  const _o=setSelectedDay;
  setSelectedDay=function(){ _o.apply(this,arguments); refreshAll(); };
}
// 3) slow timer for clock drift
setInterval(function(){try{renderHeadline();}catch(e){}},10*60*1000);

})();
