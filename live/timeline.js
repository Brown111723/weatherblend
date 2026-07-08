// ════════════════════════════════════════════════════════════════════════
// WeatherBlend — timeline.js  (continuous timeline UI)
// ════════════════════════════════════════════════════════════════════════
// Load order: engine.js → app.js → timeline.js.
// Replaces the cards UI: overrides renderCurrentBar() to draw one
// continuous 7-day stream — week overview and hourly detail are the SAME
// dataset at two zoom levels, linked by an animated lens.
// All values come from the engine: hourTileData() (observed past /
// bias-corrected blended forecast), confHourMetric()/confDayMetric()
// (model agreement) and getSunTimes(). Table + map views untouched.
// ════════════════════════════════════════════════════════════════════════

const TL_W=400, TL_LANE=82, TL_GAP=48, TL_TOP=42, TL_AXIS=34;
const TL_H=TL_TOP+4*TL_LANE+3*TL_GAP+TL_AXIS;      // 544
const TL_NOW='#f87171', TL_SUN='#fbbf24';

const TL={
  days:[], n:0, idx:[], temp:[], rain:[], wind:[], cloud:[],
  confH:{temp:[],rain:[],wind:[],cloud:[]}, dayConf:{},
  suns:[], streamT0:0, nowH:null, tMin:0, tMax:1, rMax:1, wMax:1,
  sel:0, win:{cur:0,from:0,to:0,t0:0,dur:650},
  raf:0, tBase:performance.now(),
  reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,
  sec:null, secKey:null, secOpen:false,
};

// ── helpers ─────────────────────────────────────────────────────────────
function tlLaneY(i){return TL_TOP+i*(TL_LANE+TL_GAP);}
function tlPath(pts){
  if(!pts.length)return'';
  let d='M '+pts[0][0].toFixed(1)+' '+pts[0][1].toFixed(1);
  for(let i=1;i<pts.length;i++){
    const x0=pts[i-1][0],y0=pts[i-1][1],x1=pts[i][0],y1=pts[i][1],mx=(x0+x1)/2;
    d+=' C '+mx.toFixed(1)+' '+y0.toFixed(1)+', '+mx.toFixed(1)+' '+y1.toFixed(1)+', '+x1.toFixed(1)+' '+y1.toFixed(1);
  }
  return d;
}
// Daylight luminance 0.30 (night) … 1 (day) at stream-hour h — the DATA
// carries day/night; the background stays stable.
function tlLum(h){
  const di=Math.max(0,Math.min(TL.days.length-1,Math.floor(h/24)));
  const s=getSunTimes(TL.days[di].date); if(!s)return 1;
  const rise=(s.riseMs-TL.streamT0)/3600000, set=(s.setMs-TL.streamT0)/3600000, R=1.4;
  const ss=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  return 0.30+0.70*Math.min(ss(rise-R,rise+R,h),1-ss(set-R,set+R,h));
}
function tlGust(h){ // variability proxy: local max over ±1h
  let g=TL.wind[h]??0;
  for(let k=-1;k<=1;k++){const v=TL.wind[h+k];if(v!=null&&v>g)g=v;}
  return g;
}
function tlVal(arr,h){const v=arr[Math.max(0,Math.min(TL.n-1,h))];return v==null?0:v;}
function tlEsc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');}

// ── build 7-day streams from engine state ───────────────────────────────
function tlBuild(){
  const ref=refHourly(); if(!ref||!ref.time)return false;
  const dates=carouselDates(); if(!dates.length)return false;
  const today=localTodayStr();
  if(!selDate||!dates.includes(selDate))selDate=dates.includes(today)?today:dates[0];
  let ti=dates.indexOf(today); if(ti<0)ti=0;
  const start=Math.max(0,Math.min(ti-1,dates.length-7));
  const days=dates.slice(start,start+7);
  const im={}; ref.time.forEach((t,i)=>{im[t]=i;});
  const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  TL.days=days.map(d=>({date:d,dow:DOW[new Date(d+'T12:00').getDay()],isToday:d===today,past:d<today}));
  TL.n=days.length*24;
  TL.idx=[];TL.temp=[];TL.rain=[];TL.wind=[];TL.cloud=[];
  ['temp','rain','wind','cloud'].forEach(k=>TL.confH[k]=[]);
  TL.dayConf={};
  days.forEach(d=>{
    TL.dayConf[d]={temp:confDayMetric(d,'temp'),rain:confDayMetric(d,'rain'),wind:confDayMetric(d,'wind'),cloud:confDayMetric(d,'cloud')};
    for(let h=0;h<24;h++){
      const iso=d+'T'+String(h).padStart(2,'0')+':00';
      const idx=im[iso]; TL.idx.push(idx!=null?idx:null);
      const td=idx!=null?hourTileData(iso):null;
      TL.temp.push(td&&td.temp!=null?td.temp:null);
      TL.rain.push(td&&td.rain!=null?_rcell(td.rain):null);
      TL.wind.push(td&&td.wind!=null?td.wind:null);
      TL.cloud.push(td&&td.cloud!=null?td.cloud:null);
      ['temp','rain','wind','cloud'].forEach(k=>TL.confH[k].push(idx!=null?confHourMetric(idx,k):null));
    }
  });
  TL.streamT0=new Date(days[0]+'T00:00').getTime();
  TL.nowH=(locNowMs()-TL.streamT0)/3600000;
  TL.suns=[];
  days.forEach(d=>{
    const s=getSunTimes(d); if(!s)return;
    TL.suns.push({h:(s.riseMs-TL.streamT0)/3600000,kind:'rise'},{h:(s.setMs-TL.streamT0)/3600000,kind:'set'});
  });
  const nn=a=>a.filter(v=>v!=null&&!isNaN(v));
  const tv=nn(TL.temp); TL.tMin=(tv.length?Math.min(...tv):0)-1; TL.tMax=(tv.length?Math.max(...tv):20)+1;
  const rv=nn(TL.rain); TL.rMax=Math.max(1.2,(rv.length?Math.max(...rv):0))*1.1;
  const wv=nn(TL.wind); TL.wMax=Math.max(10,(wv.length?Math.max(...wv):0))*1.15;
  let si=TL.days.findIndex(o=>o.date===selDate);
  if(si<0){si=Math.max(0,Math.min(TL.days.length-1,ti-start));selDate=TL.days[si].date;}
  TL.sel=si;
  return true;
}

// stream-hour y for a metric value
function tlY(m,v,lane){
  const y0=tlLaneY(lane);
  if(m==='temp')return y0+TL_LANE-((v-TL.tMin)/(TL.tMax-TL.tMin))*TL_LANE;
  if(m==='rain')return y0+TL_LANE-(v/TL.rMax)*TL_LANE;
  return y0+TL_LANE-(v/TL.wMax)*TL_LANE;
}

// ── WEEK overview (same visual language, zoomed out) ────────────────────
function tlWeekHTML(){
  const nd=TL.days.length, W=TL_W, dayW=W/nd;
  const yT=4,hT=30, yR=42,hR=20, yW=68,hW=24, yC=98,hC=12, H=114;
  const X=h=>((h+0.5)/TL.n)*W;
  // temp line (2h sample)
  const pts=[];
  for(let h=0;h<TL.n;h+=2){const v=TL.temp[h];if(v==null)continue;pts.push([X(h),yT+hT-((v-TL.tMin)/(TL.tMax-TL.tMin))*hT]);}
  const tempD=tlPath(pts);
  // rain 3h bins
  let bars='';
  const nb=TL.n/3;
  const binVals=[];
  for(let b=0;b<nb;b++){let v=0;for(let k=0;k<3;k++)v+=TL.rain[b*3+k]||0;binVals.push(v);}
  const binMax=Math.max(1.2,...binVals);
  binVals.forEach((v,b)=>{
    if(v<=0.05)return;
    const bh=Math.max(1.6,(v/binMax)*hR);
    bars+='<rect x="'+((b/nb)*W+1.2).toFixed(1)+'" y="'+(yR+hR-bh).toFixed(1)+'" width="3.4" height="'+bh.toFixed(1)+'" rx="1.7" fill="'+QT.rain+'" opacity="'+(0.45+Math.min(0.45,v/4)).toFixed(2)+'"/>';
  });
  // cloud opacity gradient (3h)
  let cloudStops='';
  for(let h=0;h<TL.n;h+=3){
    const c=TL.cloud[h]; if(c==null)continue;
    cloudStops+='<stop offset="'+((h/(TL.n-1))*100).toFixed(1)+'%" stop-color="'+QT.cloud+'" stop-opacity="'+(0.04+Math.pow(c/100,1.2)*0.8).toFixed(2)+'"/>';
  }
  // night-dim mask (2h)
  let lumStops='';
  for(let h=0;h<TL.n;h+=2){
    const l=0.5+0.5*((tlLum(h)-0.30)/0.70);
    lumStops+='<stop offset="'+((h/(TL.n-1))*100).toFixed(1)+'%" stop-color="#fff" stop-opacity="'+l.toFixed(2)+'"/>';
  }
  const wBase=yW+hW/2;
  const nowX=TL.nowH!=null&&TL.nowH>=0&&TL.nowH<=TL.n?(TL.nowH/TL.n)*W:null;
  let divs='';
  for(let i=1;i<nd;i++)divs+='<line x1="'+(i*dayW)+'" y1="0" x2="'+(i*dayW)+'" y2="'+H+'" stroke="var(--border,#1c2431)" stroke-width="1" opacity="0.55"/>';
  const labels=TL.days.map((d,i)=>
    '<span class="'+(i===TL.sel?'tl-sel ':'')+(d.isToday?'tl-today':'')+'" data-di="'+i+'">'+d.dow+(d.isToday?' <b>•</b>':'')+'</span>').join('');
  return '<div class="tl-week" id="tl-week">'
    +'<div class="tl-week-days" id="tl-week-days">'+labels+'</div>'
    +'<svg viewBox="0 0 '+W+' '+H+'" aria-label="7-day overview timeline">'
    +'<defs>'
    +'<linearGradient id="tlWkFade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.03" stop-color="#fff" stop-opacity="1"/><stop offset="0.97" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
    +'<linearGradient id="tlWkLum" x1="0" y1="0" x2="1" y2="0">'+lumStops+'</linearGradient>'
    +'<linearGradient id="tlWkCloud" x1="0" y1="0" x2="1" y2="0">'+cloudStops+'</linearGradient>'
    +'<mask id="tlWkMask"><rect width="'+W+'" height="'+H+'" fill="url(#tlWkFade)"/></mask>'
    +'<mask id="tlWkNight"><rect width="'+W+'" height="'+H+'" fill="url(#tlWkLum)"/></mask>'
    +'<filter id="tlWkGlow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="1.8"/></filter>'
    +'</defs>'
    +'<g id="tl-lens-rect" style="transition:transform .55s cubic-bezier(.4,0,.2,1);transform:translateX('+(TL.sel*dayW)+'px)">'
    +'<rect width="'+dayW+'" height="'+H+'" rx="5" fill="rgba(77,141,240,.07)" stroke="rgba(77,141,240,.30)"/></g>'
    +'<g mask="url(#tlWkMask)"><g mask="url(#tlWkNight)">'
    +'<path d="'+tempD+'" fill="none" stroke="'+QT.temp+'" stroke-width="4.5" opacity="0.16" filter="url(#tlWkGlow)"/>'
    +'<path d="'+tempD+'" fill="none" stroke="'+QT.temp+'" stroke-width="1.3" stroke-linecap="round" opacity="0.9"/>'
    +'<line x1="0" y1="'+(yR+hR)+'" x2="'+W+'" y2="'+(yR+hR)+'" stroke="var(--border,#1c2431)" opacity="0.7"/>'
    +bars
    +'<line x1="0" y1="'+wBase+'" x2="'+W+'" y2="'+wBase+'" stroke="var(--border,#1c2431)" stroke-dasharray="2 4" opacity="0.5"/>'
    +'<path id="tl-wk-wind" d="" fill="none" stroke="'+QT.wind+'" stroke-width="1.1" stroke-linecap="round" opacity="0.8"/>'
    +'<rect x="0" y="'+yC+'" width="'+W+'" height="'+hC+'" rx="'+(hC/2)+'" fill="url(#tlWkCloud)"/>'
    +'</g>'
    +(nowX!=null?'<rect x="0" y="0" width="'+nowX.toFixed(1)+'" height="'+H+'" fill="#000" opacity="0.45"/>':'')
    +'</g>'
    +divs
    +(nowX!=null?'<line x1="'+nowX.toFixed(1)+'" y1="-2" x2="'+nowX.toFixed(1)+'" y2="'+(H+2)+'" stroke="'+TL_NOW+'" stroke-width="1.2" opacity="0.8"/>':'')
    +'</svg></div>';
}
// static week wind fallback + animated update share this
function tlWkWindD(t){
  const W=TL_W, yW=68,hW=24, base=yW+hW/2;
  let d='';
  for(let px=0;px<=W;px+=3){
    const h=Math.min(TL.n-1,Math.floor((px/W)*TL.n));
    const amp=0.7+(tlVal(TL.wind,h)/TL.wMax)*5.2;
    const y=base+Math.sin(px*0.16+t*1.6)*amp*0.55+Math.sin(px*0.041-t*0.8)*amp*0.45;
    d+=(px?'L':'M')+px+' '+y.toFixed(1);
  }
  return d;
}

// ── zoom lens connector ─────────────────────────────────────────────────
function tlLensHTML(){
  return '<svg id="tl-lens-svg" viewBox="0 0 '+TL_W+' 16" style="display:block" aria-hidden="true">'
    +'<polygon id="tl-lens-poly" points="" fill="rgba(77,141,240,.05)"/>'
    +'<line id="tl-lens-l" stroke="rgba(77,141,240,.30)"/><line id="tl-lens-r" stroke="rgba(77,141,240,.30)"/></svg>';
}
function tlLensUpdate(){
  const nd=TL.days.length, dayW=TL_W/nd, p=TL.win.cur/24;
  const x1=p*dayW, x2=(p+1)*dayW, H=16;
  const poly=document.getElementById('tl-lens-poly'); if(!poly)return;
  poly.setAttribute('points',x1.toFixed(1)+',0 '+x2.toFixed(1)+',0 '+TL_W+','+H+' 0,'+H);
  const l=document.getElementById('tl-lens-l'), r=document.getElementById('tl-lens-r');
  l.setAttribute('x1',x1.toFixed(1));l.setAttribute('y1','0');l.setAttribute('x2','0');l.setAttribute('y2',H);
  r.setAttribute('x1',x2.toFixed(1));r.setAttribute('y1','0');r.setAttribute('x2',TL_W);r.setAttribute('y2',H);
}

// ── HOURLY streams: one wide SVG, viewBox = the zoom window ─────────────
function tlHourlyHTML(){
  const PX=TL_W/24, TW=TL.days.length*TL_W;
  const X=h=>(h+0.5)*PX;
  // temp core across whole stream
  const pts=[];
  for(let h=0;h<TL.n;h++){const v=TL.temp[h];if(v==null)continue;pts.push([X(h),tlY('temp',v,0)]);}
  const tempD=tlPath(pts);
  // per-day uncertainty ribbon (width = model disagreement)
  let ribbons='';
  TL.days.forEach((d,di)=>{
    const conf=TL.dayConf[d.date].temp!=null?TL.dayConf[d.date].temp:75;
    const seg=[];
    for(let h=di*24;h<Math.min(TL.n,di*24+25);h++){const v=TL.temp[h];if(v==null)continue;seg.push([X(h),tlY('temp',v,0)]);}
    if(!seg.length)return;
    const wRib=(3+(1-conf/100)*16).toFixed(1), wGlow=(10+(1-conf/100)*26).toFixed(1);
    ribbons+='<path d="'+tlPath(seg)+'" fill="none" stroke="'+QT.temp+'" stroke-width="'+wGlow+'" stroke-linecap="round" class="tl-glow" opacity="0.10" filter="url(#tlSoft)"/>'
      +'<path d="'+tlPath(seg)+'" fill="none" stroke="'+QT.temp+'" stroke-width="'+wRib+'" stroke-linecap="round" opacity="0.15"/>';
  });
  // per-day hi/lo markers on the line itself
  let hilo='';
  TL.days.forEach((d,di)=>{
    let hiH=-1,loH=-1;
    for(let h=di*24;h<di*24+24;h++){
      const v=TL.temp[h];if(v==null)continue;
      if(hiH<0||v>TL.temp[hiH])hiH=h;
      if(loH<0||v<TL.temp[loH])loH=h;
    }
    [[hiH,-9],[loH,16]].forEach(([h,dy])=>{
      if(h<0)return;
      const x=X(h),y=tlY('temp',TL.temp[h],0);
      hilo+='<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="3" fill="#000" stroke="'+QT.temp+'" stroke-width="1.6"/>'
        +'<text x="'+x.toFixed(1)+'" y="'+(y+dy).toFixed(1)+'" text-anchor="middle" fill="var(--text-muted,#93a1b8)" font-size="10.5" font-weight="700">'+tempDisp(Math.round(TL.temp[h]))+'°</text>';
    });
  });
  // rain bars (+ uncertainty echo when models disagree)
  const y0r=tlLaneY(1), barW=PX*0.42;
  let rainEcho='', rainBars='';
  for(let h=0;h<TL.n;h++){
    const v=TL.rain[h]; if(v==null||v<0.05)continue;
    const bh=Math.max(2.5,(v/TL.rMax)*TL_LANE), x=X(h);
    const conf=TL.confH.rain[h]!=null?TL.confH.rain[h]:70;
    if(conf<65)rainEcho+='<rect x="'+(x-barW/2-1.5).toFixed(1)+'" y="'+(y0r+TL_LANE-bh-1.5).toFixed(1)+'" width="'+(barW+3).toFixed(1)+'" height="'+(bh+1.5).toFixed(1)+'" rx="'+(barW/2).toFixed(1)+'" fill="'+QT.rain+'" opacity="'+((1-conf/100)*0.5).toFixed(2)+'" filter="url(#tlEcho)"/>';
    rainBars+='<rect x="'+(x-barW/2).toFixed(1)+'" y="'+(y0r+TL_LANE-bh).toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="'+(barW/2).toFixed(1)+'" fill="'+QT.rain+'" opacity="'+(0.35+(conf/100)*0.45+Math.min(0.2,v/4)).toFixed(2)+'"/>';
  }
  // cloud opacity ribbon (per-hour stops)
  const y0c=tlLaneY(3);
  let cloudStops='';
  for(let h=0;h<TL.n;h+=1){
    const c=TL.cloud[h]; if(c==null)continue;
    cloudStops+='<stop offset="'+((X(h)/TW)*100).toFixed(2)+'%" stop-color="'+QT.cloud+'" stop-opacity="'+(0.03+Math.pow(c/100,1.15)*0.85).toFixed(2)+'"/>';
  }
  // night-dim luminance mask
  let lumStops='';
  for(let h=0;h<TL.n;h+=2)lumStops+='<stop offset="'+((h/(TL.n-1))*100).toFixed(2)+'%" stop-color="#fff" stop-opacity="'+tlLum(h).toFixed(2)+'"/>';
  // shared axis: 6a/12p/6p per day, dow at boundaries
  let axis='';
  const axY=TL_H-10;
  TL.days.forEach((d,di)=>{
    [[6,'6am'],[12,'12pm'],[18,'6pm']].forEach(([hh,lb])=>{
      axis+='<text x="'+(di*TL_W+hh*PX).toFixed(1)+'" y="'+axY+'" text-anchor="middle" fill="var(--text-dim,#5c6a80)" font-size="10" font-weight="600">'+lb+'</text>';
    });
    if(di>0)axis+='<text x="'+(di*TL_W).toFixed(1)+'" y="'+axY+'" text-anchor="middle" fill="var(--text-muted,#93a1b8)" font-size="10" font-weight="700">'+d.dow.toUpperCase()+'</text>';
  });
  // sunrise/sunset markers — subtle icons, no time labels
  let suns='';
  TL.suns.forEach(s=>{
    const x=s.h*PX, y=TL_H-TL_AXIS+6;
    if(x<2||x>TW-2)return;
    const tri=s.kind==='rise'
      ?'M '+(x-2.4)+' '+(y-3)+' L '+x+' '+(y-5.6)+' L '+(x+2.4)+' '+(y-3)
      :'M '+(x-2.4)+' '+(y-5.6)+' L '+x+' '+(y-3)+' L '+(x+2.4)+' '+(y-5.6);
    suns+='<g stroke="'+TL_SUN+'" stroke-width="1.3" stroke-linecap="round" fill="none" opacity="0.5">'
      +'<circle cx="'+x.toFixed(1)+'" cy="'+(y+3)+'" r="2.4"/>'
      +'<line x1="'+(x-5).toFixed(1)+'" y1="'+(y+7)+'" x2="'+(x+5).toFixed(1)+'" y2="'+(y+7)+'"/>'
      +'<path d="'+tri+'"/></g>';
  });
  // lane baselines
  const wBase=tlLaneY(2)+TL_LANE*0.5;
  const nowX=TL.nowH!=null&&TL.nowH>=0&&TL.nowH<=TL.n?TL.nowH*PX:null;
  // headers (HTML overlays)
  const NAME={temp:'Temp',rain:'Rain',wind:'Wind',cloud:'Cloud'};
  const IC={temp:MI_TEMP,rain:MI_RAIN,wind:MI_WIND,cloud:MI_CLOUD};
  const heads=['temp','rain','wind','cloud'].map((m,i)=>
    '<div class="tl-head" id="tl-head-'+m+'" style="top:'+(((tlLaneY(i)-34)/TL_H)*100).toFixed(2)+'%">'
    +'<span class="tl-ic" style="color:'+QT[m]+'">'+IC[m]+'</span>'
    +'<span class="tl-name" style="color:'+QT[m]+'">'+NAME[m]+'</span>'
    +'<span class="tl-big" id="tl-big-'+m+'"></span>'
    +'<span class="tl-sub" id="tl-sub-'+m+'"></span>'
    +'<span class="tl-right" id="tl-right-'+m+'"></span></div>').join('');

  return '<div class="tl-hourly">'+heads
    +'<svg id="tl-hourly-svg" viewBox="'+(TL.sel*TL_W)+' 0 '+TL_W+' '+TL_H+'" aria-label="Hourly forecast streams">'
    +'<defs>'
    +'<linearGradient id="tlStCloud" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="'+TW+'" y2="0">'+cloudStops+'</linearGradient>'
    +'<linearGradient id="tlStLum" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="'+TW+'" y2="0">'+lumStops+'</linearGradient>'
    +'<mask id="tlStNight"><rect width="'+TW+'" height="'+TL_H+'" fill="url(#tlStLum)"/></mask>'
    +'<filter id="tlSoft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3"/></filter>'
    +'<filter id="tlEcho" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.6"/></filter>'
    +'<filter id="tlNowGlow" x="-300%" y="-5%" width="700%" height="110%"><feGaussianBlur stdDeviation="2.4"/></filter>'
    +'</defs>'
    +'<g mask="url(#tlStNight)">'
    +ribbons
    +'<path d="'+tempD+'" fill="none" stroke="'+QT.temp+'" stroke-width="2" stroke-linecap="round" opacity="0.95"/>'
    +hilo
    +'<line x1="0" y1="'+(y0r+TL_LANE)+'" x2="'+TW+'" y2="'+(y0r+TL_LANE)+'" stroke="var(--border,#1c2431)"/>'
    +rainEcho+rainBars
    +'<line x1="0" y1="'+wBase+'" x2="'+TW+'" y2="'+wBase+'" stroke="var(--border,#1c2431)" stroke-dasharray="2 4" opacity="0.6"/>'
    +'<path id="tl-wind-glow" d="" fill="none" stroke="'+QT.wind+'" opacity="0.10" filter="url(#tlEcho)"/>'
    +'<path id="tl-wind-b" d="" fill="none" stroke="'+QT.wind+'" opacity="0.25"/>'
    +'<path id="tl-wind-a" d="" fill="none" stroke="'+QT.wind+'" stroke-linecap="round" opacity="0.85"/>'
    +'<rect x="0" y="'+(y0c+TL_LANE*0.30)+'" width="'+TW+'" height="'+(TL_LANE*0.40)+'" rx="'+(TL_LANE*0.20)+'" fill="url(#tlStCloud)"/>'
    +(nowX!=null?'<rect x="0" y="0" width="'+nowX.toFixed(1)+'" height="'+(TL_H-TL_AXIS)+'" fill="#000" opacity="0.35"/>':'')
    +'</g>'
    +axis+suns
    +(nowX!=null?
      '<g><line class="tl-now-glow" x1="'+nowX.toFixed(1)+'" y1="6" x2="'+nowX.toFixed(1)+'" y2="'+(TL_H-TL_AXIS+10)+'" stroke="'+TL_NOW+'" stroke-width="5" opacity="0.3" filter="url(#tlNowGlow)"/>'
      +'<line x1="'+nowX.toFixed(1)+'" y1="6" x2="'+nowX.toFixed(1)+'" y2="'+(TL_H-TL_AXIS+10)+'" stroke="'+TL_NOW+'" stroke-width="1.3" opacity="0.9"/>'
      +'<text x="'+nowX.toFixed(1)+'" y="1" text-anchor="middle" dominant-baseline="hanging" fill="'+TL_NOW+'" font-size="8.5" font-weight="800" letter-spacing="1">NOW</text></g>':'')
    +'</svg></div>';
}
// animated wind ripple across the (visible part of the) stream
function tlWindD(off,t){
  const PX=TL_W/24, TW=TL.days.length*TL_W, base=tlLaneY(2)+TL_LANE*0.5;
  const vb=TL.win.cur/24*TL_W;
  const lo=Math.max(0,vb-60), hi=Math.min(TW,vb+TL_W+60);
  let d='';
  for(let px=lo;px<=hi;px+=4){
    const h=Math.max(0,Math.min(TL.n-1,Math.floor(px/PX)));
    const sp=tlVal(TL.wind,h), gu=tlGust(h);
    const amp=1.4+(sp/TL.wMax)*14+((gu-sp)/TL.wMax)*10;
    const y=base+Math.sin(px*0.10+t*2.3+off)*amp*0.55+Math.sin(px*0.026-t*1.2+off*2.1)*amp*0.45;
    d+=(d?'L':'M')+px.toFixed(0)+' '+y.toFixed(1);
  }
  return d;
}

// ── headers for the selected day ────────────────────────────────────────
function tlRefHour(){
  const d=TL.days[TL.sel];
  if(d&&d.isToday&&TL.nowH!=null)return Math.max(TL.sel*24,Math.min(TL.sel*24+23,Math.floor(TL.nowH)));
  return TL.sel*24+13;
}
function tlHeads(){
  const d=TL.days[TL.sel]; if(!d)return;
  const h=tlRefHour(), s=TL.sel*24;
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.innerHTML=v;};
  // temp: current + feels-like together, above the line
  const t=TL.temp[h];
  let feels=null;
  if(d.isToday&&cachedCurrent&&cachedCurrent.c&&cachedCurrent.c.apparent_temperature!=null)feels=cachedCurrent.c.apparent_temperature;
  else if(t!=null&&TL.wind[h]!=null)feels=t-TL.wind[h]*0.11;
  set('tl-big-temp',t!=null?tempDisp(Math.round(t))+'°':'—');
  set('tl-sub-temp',feels!=null?'feels '+tempDisp(Math.round(feels))+'°':'');
  set('tl-right-temp','');
  // rain: total, remaining (today), agreement
  let tot=0,toCome=0;
  for(let k=s;k<s+24;k++){const v=TL.rain[k]||0;tot+=v;if(TL.nowH!=null&&k>=TL.nowH)toCome+=v;}
  const rc=TL.dayConf[d.date].rain;
  set('tl-big-rain',tot.toFixed(1)+' mm');
  set('tl-sub-rain',d.isToday?toCome.toFixed(1)+' mm to come':(d.past?'observed':'expected'));
  set('tl-right-rain',rc!=null?rc+'% agree':'');
  // wind: speed + direction, hi/lo subtle
  const w=TL.wind[h];
  let dir='';
  if(TL.idx[h]!=null){const dv=wBlendAt('winddirection_10m',TL.idx[h],horizonOf(d.date));if(dv!=null)dir=dirFull(dv);}
  let wHi=null,wLo=null;
  for(let k=s;k<s+24;k++){const v=TL.wind[k];if(v==null)continue;wHi=wHi==null?v:Math.max(wHi,v);wLo=wLo==null?v:Math.min(wLo,v);}
  set('tl-big-wind',w!=null?Math.round(w)+' km/h':'—');
  set('tl-sub-wind',dir);
  set('tl-right-wind',wHi!=null?'&#8593;'+Math.round(wHi)+' &#8595;'+Math.round(wLo):'');
  // cloud: % + hi/lo
  const c=TL.cloud[h];
  let cHi=null,cLo=null;
  for(let k=s;k<s+24;k++){const v=TL.cloud[k];if(v==null)continue;cHi=cHi==null?v:Math.max(cHi,v);cLo=cLo==null?v:Math.min(cLo,v);}
  set('tl-big-cloud',c!=null?Math.round(c)+'%':'—');
  set('tl-sub-cloud','cover');
  set('tl-right-cloud',cHi!=null?'&#8593;'+Math.round(cHi)+' &#8595;'+Math.round(cLo):'');
}

// ── secondary metrics (expandable, quiet sparklines) ────────────────────
async function tlSecFetch(){
  if(state.lat==null||state.lon==null)return;
  const key=state.lat.toFixed(3)+','+state.lon.toFixed(3);
  if(TL.secKey===key)return;
  TL.secKey=key; TL.sec=null;
  try{
    const u='https://api.open-meteo.com/v1/forecast?latitude='+state.lat+'&longitude='+state.lon
      +'&hourly=uv_index,relative_humidity_2m,surface_pressure,visibility,dew_point_2m&past_days=7&forecast_days=10&timezone=auto';
    const r=await fetch(u,{signal:AbortSignal.timeout(15000)});
    const j=await r.json();
    if(j&&j.hourly&&j.hourly.time){
      const im={}; j.hourly.time.forEach((t,i)=>{im[t]=i;});
      TL.sec={im,uv:j.hourly.uv_index,hum:j.hourly.relative_humidity_2m,pres:j.hourly.surface_pressure,vis:j.hourly.visibility,dew:j.hourly.dew_point_2m,aqi:null,aqiIm:null};
      tlSecRender();
    }
  }catch(e){dbg('timeline: secondary fetch failed: '+(e.message||e.name));}
  try{
    const u2='https://air-quality-api.open-meteo.com/v1/air-quality?latitude='+state.lat+'&longitude='+state.lon
      +'&hourly=us_aqi&past_days=7&forecast_days=5&timezone=auto';
    const r2=await fetch(u2,{signal:AbortSignal.timeout(15000)});
    const j2=await r2.json();
    if(TL.sec&&j2&&j2.hourly&&j2.hourly.time){
      const im2={}; j2.hourly.time.forEach((t,i)=>{im2[t]=i;});
      TL.sec.aqi=j2.hourly.us_aqi; TL.sec.aqiIm=im2;
      tlSecRender();
    }
  }catch(e){}
}
function tlSpark(vals){
  const W=170,H=26;
  const good=vals.filter(v=>v!=null&&!isNaN(v));
  if(good.length<2)return'<svg viewBox="0 0 '+W+' '+H+'" height="'+H+'"></svg>';
  const mn=Math.min(...good),mx=Math.max(...good),rng=(mx-mn)||1;
  const pts=[];
  vals.forEach((v,i)=>{if(v==null||isNaN(v))return;pts.push([(i/(vals.length-1))*W,H-3-((v-mn)/rng)*(H-6)]);});
  const d=tlPath(pts);
  return '<svg viewBox="0 0 '+W+' '+H+'" height="'+H+'" preserveAspectRatio="none">'
    +'<path d="'+d+'" fill="none" stroke="var(--text-muted,#93a1b8)" stroke-width="3.5" opacity="0.12"/>'
    +'<path d="'+d+'" fill="none" stroke="var(--text-muted,#93a1b8)" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/></svg>';
}
function tlAqiWord(v){return v==null?'':v<=50?'good':v<=100?'moderate':v<=150?'poor':'bad';}
function tlSecRender(){
  const body=document.getElementById('tl-sec-body'); if(!body)return;
  if(!TL.sec){body.innerHTML='';return;}
  const d=TL.days[TL.sel]; if(!d)return;
  const refH=tlRefHour()-TL.sel*24;
  const dayVals=(arr,im)=>{
    const out=[];
    for(let h=0;h<24;h++){
      const iso=d.date+'T'+String(h).padStart(2,'0')+':00';
      const i=im[iso]; out.push(i!=null&&arr&&arr[i]!=null?arr[i]:null);
    }
    return out;
  };
  const S=TL.sec;
  const rows=[
    ['UV index',dayVals(S.uv,S.im),v=>v.toFixed(0)],
    ['Humidity',dayVals(S.hum,S.im),v=>Math.round(v)+'%'],
    ['Pressure',dayVals(S.pres,S.im),v=>Math.round(v)+' hPa'],
    ['Visibility',dayVals(S.vis,S.im).map(v=>v!=null?v/1000:null),v=>v.toFixed(0)+' km'],
    ['Dew point',dayVals(S.dew,S.im),v=>tempDisp(Math.round(v))+'°'],
  ];
  if(S.aqi&&S.aqiIm)rows.push(['Air quality',dayVals(S.aqi,S.aqiIm),v=>Math.round(v)+' '+tlAqiWord(v)]);
  body.innerHTML='<div class="tl-sec-grid">'+rows.map(([name,vals,fmt])=>{
    const v=vals[refH];
    return '<div class="tl-sec-item"><div class="tl-sec-row"><span class="tl-sec-name">'+name+'</span>'
      +'<span class="tl-sec-val">'+(v!=null?fmt(v):'—')+'</span></div>'+tlSpark(vals)+'</div>';
  }).join('')+'</div>';
}
function tlSecHTML(){
  return '<button class="tl-sec-btn'+(TL.secOpen?' open':'')+'" id="tl-sec-btn" type="button">'
    +'<span class="tl-sec-label">Secondary metrics</span>'
    +'<span class="tl-sec-chev"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg></span></button>'
    +'<div class="tl-sec-body'+(TL.secOpen?' open':'')+'" id="tl-sec-body"></div>';
}

// ── selection / tween / animation loop ──────────────────────────────────
function tlSelect(i,animate){
  i=Math.max(0,Math.min(TL.days.length-1,i));
  TL.sel=i;
  const w=TL.win;
  w.from=w.cur; w.to=i*24; w.t0=performance.now();
  if(!animate||TL.reduced){w.cur=w.to;
    const svg=document.getElementById('tl-hourly-svg');
    if(svg)svg.setAttribute('viewBox',(w.cur/24*TL_W).toFixed(2)+' 0 '+TL_W+' '+TL_H);
    tlLensUpdate();
  }
  const lens=document.getElementById('tl-lens-rect');
  if(lens)lens.style.transform='translateX('+(i*(TL_W/TL.days.length))+'px)';
  const wd=document.getElementById('tl-week-days');
  if(wd)[...wd.children].forEach((el,k)=>el.classList.toggle('tl-sel',k===i));
  tlHeads(); tlSecRender();
  tlEnsureLoop();
}
function tlLoop(now){
  TL.raf=requestAnimationFrame(tlLoop);
  const t=(now-TL.tBase)/1000;
  const w=TL.win;
  let tweening=false;
  if(Math.abs(w.cur-w.to)>0.001){
    tweening=true;    const p=Math.min(1,(now-w.t0)/w.dur);
    const e=p<0.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
    w.cur=p>=1?w.to:w.from+(w.to-w.from)*e;
    const svg=document.getElementById('tl-hourly-svg');
    if(svg)svg.setAttribute('viewBox',(w.cur/24*TL_W).toFixed(2)+' 0 '+TL_W+' '+TL_H);
    tlLensUpdate();
  }
  if(!TL.reduced){
    const meanW=(()=>{const s=TL.sel*24;let a=0,n=0;for(let k=s;k<s+24;k++){const v=TL.wind[k];if(v!=null){a+=v;n++;}}return n?a/n:0;})();
    const core=1.2+(meanW/TL.wMax)*3.2;
    const a=document.getElementById('tl-wind-a'), b=document.getElementById('tl-wind-b'), g=document.getElementById('tl-wind-glow');
    if(a){a.setAttribute('d',tlWindD(0,t));a.setAttribute('stroke-width',core.toFixed(2));}
    if(b){b.setAttribute('d',tlWindD(1.7,t));b.setAttribute('stroke-width',(core*0.5).toFixed(2));}
    if(g){g.setAttribute('d',a?a.getAttribute('d'):'');g.setAttribute('stroke-width',(core*2.6).toFixed(2));}
    const wk=document.getElementById('tl-wk-wind');
    if(wk)wk.setAttribute('d',tlWkWindD(t));
  }
  if(TL.reduced&&!tweening){cancelAnimationFrame(TL.raf);TL.raf=0;}
}
// draw one static wind frame synchronously (so lanes are never empty even
// if rAF is throttled/paused), then keep the loop alive.
function tlWindFrame(t){
  const a=document.getElementById('tl-wind-a'), b=document.getElementById('tl-wind-b'), g=document.getElementById('tl-wind-glow');
  const wk=document.getElementById('tl-wk-wind');
  const s=TL.sel*24; let sum=0,n=0;
  for(let k=s;k<s+24;k++){const v=TL.wind[k];if(v!=null){sum+=v;n++;}}
  const core=1.2+((n?sum/n:0)/TL.wMax)*3.2;
  if(a){a.setAttribute('d',tlWindD(0,t));a.setAttribute('stroke-width',core.toFixed(2));}
  if(b){b.setAttribute('d',tlWindD(1.7,t));b.setAttribute('stroke-width',(core*0.5).toFixed(2));}
  if(g&&a){g.setAttribute('d',a.getAttribute('d'));g.setAttribute('stroke-width',(core*2.6).toFixed(2));}
  if(wk)wk.setAttribute('d',tlWkWindD(t));
}
function tlEnsureLoop(){
  if(TL.raf)cancelAnimationFrame(TL.raf);
  TL.raf=0;
  tlWindFrame(TL.reduced?0:(performance.now()-TL.tBase)/1000);
  TL.raf=requestAnimationFrame(tlLoop);
}
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&document.getElementById('tl-hourly-svg'))tlEnsureLoop();
});

// ── render root + wiring ────────────────────────────────────────────────
function tlRenderAll(root){
  TL.win.cur=TL.win.to=TL.sel*24;
  root.innerHTML=tlWeekHTML()+tlLensHTML()+tlHourlyHTML()+tlSecHTML()
    +'<div class="tl-note">One continuous stream: the week above and the hours below are the same data at two zoom levels — tap a day to glide along it. Glow softness, ribbon width and bar haze show how much the models disagree; lines dim where it is night.</div>';
  // wind stroke widths + first frame
  const week=document.getElementById('tl-week');
  if(week)week.addEventListener('click',ev=>{
    const r=week.getBoundingClientRect();
    const i=Math.max(0,Math.min(TL.days.length-1,Math.floor(((ev.clientX-r.left)/r.width)*TL.days.length)));
    setSelectedDay(TL.days[i].date,{behavior:'smooth'});
  });
  const btn=document.getElementById('tl-sec-btn');
  if(btn)btn.addEventListener('click',()=>{
    TL.secOpen=!TL.secOpen;
    btn.classList.toggle('open',TL.secOpen);
    document.getElementById('tl-sec-body').classList.toggle('open',TL.secOpen);
    if(TL.secOpen)tlSecRender();
  });
  tlLensUpdate(); tlHeads(); tlSecRender();
  tlEnsureLoop();
}

// ── override the cards renderer + hook day selection ────────────────────
const _tlOrigRenderCurrentBar=renderCurrentBar;
renderCurrentBar=function(){
  const root=document.getElementById('timeline-root');
  if(!root){_tlOrigRenderCurrentBar();return;}
  if(!tlBuild()){root.innerHTML='';return;}
  tlSecFetch();
  tlRenderAll(root);
  updateDateUI();
};
const _tlOrigSetSelectedDay=setSelectedDay;
setSelectedDay=function(date,opts){
  _tlOrigSetSelectedDay(date,opts);
  const i=TL.days.findIndex(o=>o.date===date);
  if(i>=0&&document.getElementById('tl-hourly-svg'))tlSelect(i,true);
};
dbg('timeline.js loaded — continuous timeline UI active');
