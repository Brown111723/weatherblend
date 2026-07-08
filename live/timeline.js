// ════════════════════════════════════════════════════════════════════════
// WeatherBlend — timeline.js  (continuous timeline UI)
// ════════════════════════════════════════════════════════════════════════
// Load order: engine.js → app.js → timeline.js.
// Replaces the cards UI: overrides renderCurrentBar() to draw one
// continuous 7-day stream — week overview and hourly detail are the SAME
// dataset at two zoom levels, linked by an animated lens.
// Honors config toggles: Show temp/rain/wind/cloud hides lanes,
// Confidence toggles the "% agree" figures, model/weighting changes
// rebuild via _recalcAndRender(). Drag horizontally on the hourly view
// to scrub any hour (headers follow).
// ════════════════════════════════════════════════════════════════════════

const TL_W=400, TL_GAP=44, TL_TOP=42, TL_AXIS=26, TL_SUNROW=30;
const TL_LANE_H={temp:104,rain:56,wind:56,cloud:36}; // temp is the king
const TL_NOW='#f87171', TL_SUN='#fbbf24';

const TL={
  days:[], n:0, idx:[], temp:[], rain:[], wind:[], cloud:[],
  confH:{temp:[],rain:[],wind:[],cloud:[]}, dayConf:{},
  lanes:[], laneY:{}, H:0,
  suns:[], streamT0:0, nowH:null, tMin:0, tMax:1, rMax:1, wMax:1,
  sel:0, win:{cur:0,from:0,to:0,t0:0,dur:650},
  scrub:null, startOff:0, _canPrev:false, _canNext:false,
  raf:0, tBase:performance.now(),
  reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,
  sec:null, secKey:null, secOpen:false,
};

// ── helpers ─────────────────────────────────────────────────────────────
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
function tlClock(ms){const d=new Date(ms);let h=d.getHours();const m=d.getMinutes();const ap=h<12?'am':'pm';h=h%12||12;return h+':'+String(m).padStart(2,'0')+ap;}
function tlHourLabel(h){const hh=((Math.round(h)%24)+24)%24;return hh===0?'12am':hh<12?hh+'am':hh===12?'12pm':(hh-12)+'pm';}

// ── build 7-day streams from engine state ───────────────────────────────
function tlBuild(){
  const ref=refHourly(); if(!ref||!ref.time)return false;
  const dates=carouselDates(); if(!dates.length)return false;
  const today=localTodayStr();
  if(!selDate||!dates.includes(selDate))selDate=dates.includes(today)?today:dates[0];
  let ti=dates.indexOf(today); if(ti<0)ti=0;
  const maxStart=Math.max(0,dates.length-7);
  const start=Math.max(0,Math.min(ti-1+(TL.startOff||0),maxStart));
  TL.startOff=start-(ti-1); TL._canPrev=start>0; TL._canNext=start<maxStart;
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
    TL.suns.push({h:(s.riseMs-TL.streamT0)/3600000,kind:'rise',ms:s.riseMs},{h:(s.setMs-TL.streamT0)/3600000,kind:'set',ms:s.setMs});
  });
  const nn=a=>a.filter(v=>v!=null&&!isNaN(v));
  const tv=nn(TL.temp); TL.tMin=(tv.length?Math.min(...tv):0)-1; TL.tMax=(tv.length?Math.max(...tv):20)+1;
  const rv=nn(TL.rain); TL.rMax=Math.max(1.2,(rv.length?Math.max(...rv):0))*1.1;
  const wv=nn(TL.wind); TL.wMax=Math.max(10,(wv.length?Math.max(...wv):0))*1.15;
  // lane layout honors the config panel's "Show" toggles
  let lanes=['temp','rain','wind','cloud'].filter(m=>secVisible[m]);
  if(!lanes.length)lanes=['temp','rain','wind','cloud'];
  TL.lanes=lanes; TL.laneY={};
  let yy=TL_TOP;
  lanes.forEach(m=>{
    TL.laneY[m]=yy;
    yy+=TL_LANE_H[m]+(m==='temp'?TL_SUNROW:0)+TL_GAP;
  });
  TL.H=yy-TL_GAP+TL_AXIS;
  let si=TL.days.findIndex(o=>o.date===selDate);
  if(si<0){si=Math.max(0,Math.min(TL.days.length-1,ti-start));selDate=TL.days[si].date;}
  TL.sel=si;
  return true;
}

function tlY(m,v){
  const y0=TL.laneY[m], LH=TL_LANE_H[m];
  if(m==='temp')return y0+LH-((v-TL.tMin)/(TL.tMax-TL.tMin))*LH;
  if(m==='rain')return y0+LH-(v/TL.rMax)*LH;
  return y0+LH-(v/TL.wMax)*LH;
}

// ── WEEK overview (same visual language, zoomed out, compact) ───────────
// lane heights (compact): temp 22, rain 14, wind 18, cloud 9, gaps 6
const TL_WK_H={temp:22,rain:14,wind:18,cloud:9};
function tlWkLanes(){
  let y=3; const out={};
  TL.lanes.forEach(m=>{out[m]=[y,TL_WK_H[m]];y+=TL_WK_H[m]+6;});
  return {lanes:out,H:y+2};
}
function tlWeekHTML(){
  const nd=TL.days.length, W=TL_W, dayW=W/nd;
  const {lanes,H}=tlWkLanes();
  const X=h=>((h+0.5)/TL.n)*W;
  let inner='';
  if(lanes.temp){
    const [yT,hT]=lanes.temp;
    const pts=[];
    for(let h=0;h<TL.n;h+=2){const v=TL.temp[h];if(v==null)continue;pts.push([X(h),yT+hT-((v-TL.tMin)/(TL.tMax-TL.tMin))*hT]);}
    const tempD=tlPath(pts);
    inner+='<path d="'+tempD+'" fill="none" stroke="'+QT.temp+'" stroke-width="4.5" opacity="0.16" filter="url(#tlWkGlow)"/>'
      +'<path d="'+tempD+'" fill="none" stroke="'+QT.temp+'" stroke-width="1.3" stroke-linecap="round" opacity="0.9"/>';
  }
  if(lanes.rain){
    const [yR,hR]=lanes.rain;
    const nb=TL.n/3, binVals=[];
    for(let b=0;b<nb;b++){let v=0;for(let k=0;k<3;k++)v+=TL.rain[b*3+k]||0;binVals.push(v);}
    const binMax=Math.max(1.2,...binVals);
    inner+='<line x1="0" y1="'+(yR+hR)+'" x2="'+W+'" y2="'+(yR+hR)+'" stroke="var(--border,#1c2431)" opacity="0.7"/>';
    binVals.forEach((v,b)=>{
      if(v<=0.05)return;
      const bh=Math.max(1.6,(v/binMax)*hR);
      inner+='<rect x="'+((b/nb)*W+1.2).toFixed(1)+'" y="'+(yR+hR-bh).toFixed(1)+'" width="3.4" height="'+bh.toFixed(1)+'" rx="1.7" fill="'+QT.rain+'" opacity="'+(0.45+Math.min(0.45,v/4)).toFixed(2)+'"/>';
    });
  }
  if(lanes.wind){
    const [yW,hW]=lanes.wind, wBase=yW+hW/2;
    inner+='<line x1="0" y1="'+wBase+'" x2="'+W+'" y2="'+wBase+'" stroke="var(--border,#1c2431)" stroke-dasharray="2 4" opacity="0.5"/>'
      +'<path id="tl-wk-wind" d="" fill="none" stroke="'+QT.wind+'" stroke-width="1.1" stroke-linecap="round" opacity="0.8"/>';
  }
  if(lanes.cloud){
    const [yC,hC]=lanes.cloud;
    inner+='<rect x="0" y="'+yC+'" width="'+W+'" height="'+hC+'" rx="'+(hC/2)+'" fill="url(#tlWkCloud)"/>';
  }
  let cloudStops='';
  for(let h=0;h<TL.n;h+=3){
    const c=TL.cloud[h]; if(c==null)continue;
    cloudStops+='<stop offset="'+((h/(TL.n-1))*100).toFixed(1)+'%" stop-color="'+QT.cloud+'" stop-opacity="'+(0.04+Math.pow(c/100,1.2)*0.8).toFixed(2)+'"/>';
  }
  let lumStops='';
  for(let h=0;h<TL.n;h+=2){
    const l=0.5+0.5*((tlLum(h)-0.30)/0.70);
    lumStops+='<stop offset="'+((h/(TL.n-1))*100).toFixed(1)+'%" stop-color="#fff" stop-opacity="'+l.toFixed(2)+'"/>';
  }
  const nowX=TL.nowH!=null&&TL.nowH>=0&&TL.nowH<=TL.n?(TL.nowH/TL.n)*W:null;
  let divs='';
  for(let i=1;i<nd;i++)divs+='<line x1="'+(i*dayW)+'" y1="0" x2="'+(i*dayW)+'" y2="'+H+'" stroke="var(--border,#1c2431)" stroke-width="1" opacity="0.55"/>';
  const labels=TL.days.map((d,i)=>
    '<span class="'+(i===TL.sel?'tl-sel ':'')+(d.isToday?'tl-today':'')+'" data-di="'+i+'">'+d.dow+(d.isToday?' <b>•</b>':'')+'</span>').join('');
  return '<div class="tl-week" id="tl-week">'
    +'<button type="button" class="tl-wk-nav" id="tl-wk-prev"'+(TL._canPrev?'':' disabled')+' aria-label="Earlier days">&#8249;</button>'
    +'<button type="button" class="tl-wk-nav tl-wk-next" id="tl-wk-next"'+(TL._canNext?'':' disabled')+' aria-label="Later days">&#8250;</button>'
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
    +'<g mask="url(#tlWkMask)"><g mask="url(#tlWkNight)">'+inner+'</g>'
    +(nowX!=null?'<rect x="0" y="0" width="'+nowX.toFixed(1)+'" height="'+H+'" fill="#000" opacity="0.45"/>':'')
    +'</g>'
    +divs
    +(nowX!=null?'<line x1="'+nowX.toFixed(1)+'" y1="-2" x2="'+nowX.toFixed(1)+'" y2="'+(H+2)+'" stroke="'+TL_NOW+'" stroke-width="1.2" opacity="0.8"/>':'')
    +'</svg></div>';
}
function tlWkWindD(t){
  if(!TL.lanes.includes('wind'))return'';
  const {lanes}=tlWkLanes();
  const [yW,hW]=lanes.wind, base=yW+hW/2, W=TL_W;
  let d='';
  for(let px=0;px<=W;px+=3){
    const h=Math.min(TL.n-1,Math.floor((px/W)*TL.n));
    const amp=0.6+Math.pow(tlVal(TL.wind,h)/TL.wMax,1.25)*6;
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
  let body='';
  // lane separators (thin line centred in each gap)
  TL.lanes.forEach((m,i)=>{
    if(!i)return;
    const y=TL.laneY[m]-TL_GAP/2-4;
    body+='<line x1="0" y1="'+y+'" x2="'+TW+'" y2="'+y+'" stroke="var(--border,#1c2431)" stroke-width="1" opacity="0.5"/>';
  });
  let masked='';
  if(TL.lanes.includes('temp')){
    const pts=[];
    for(let h=0;h<TL.n;h++){const v=TL.temp[h];if(v==null)continue;pts.push([X(h),tlY('temp',v)]);}
    const tempD=tlPath(pts);
    let ribbons='';
    TL.days.forEach((d,di)=>{
      const conf=TL.dayConf[d.date].temp!=null?TL.dayConf[d.date].temp:75;
      const seg=[];
      for(let h=di*24;h<Math.min(TL.n,di*24+25);h++){const v=TL.temp[h];if(v==null)continue;seg.push([X(h),tlY('temp',v)]);}
      if(!seg.length)return;
      const wRib=(3+(1-conf/100)*16).toFixed(1), wGlow=(10+(1-conf/100)*26).toFixed(1);
      ribbons+='<path d="'+tlPath(seg)+'" fill="none" stroke="'+QT.temp+'" stroke-width="'+wGlow+'" stroke-linecap="round" class="tl-glow" opacity="0.10" filter="url(#tlSoft)"/>'
        +'<path d="'+tlPath(seg)+'" fill="none" stroke="'+QT.temp+'" stroke-width="'+wRib+'" stroke-linecap="round" opacity="0.15"/>';
    });
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
        const x=X(h),y=tlY('temp',TL.temp[h]);
        hilo+='<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="3" fill="#000" stroke="'+QT.temp+'" stroke-width="1.6"/>'
          +'<text x="'+x.toFixed(1)+'" y="'+(y+dy).toFixed(1)+'" text-anchor="middle" fill="var(--text-muted,#93a1b8)" font-size="10.5" font-weight="700">'+tempDisp(Math.round(TL.temp[h]))+'°</text>';
      });
    });
    masked+=ribbons+'<path d="'+tempD+'" fill="none" stroke="'+QT.temp+'" stroke-width="2" stroke-linecap="round" opacity="0.95"/>'+hilo;
  }
  if(TL.lanes.includes('rain')){
    const y0r=TL.laneY.rain, barW=PX*0.42, LHr=TL_LANE_H.rain;
    let rainEcho='', rainBars='';
    for(let h=0;h<TL.n;h++){
      const v=TL.rain[h]; if(v==null||v<0.05)continue;
      const bh=Math.max(2.5,(v/TL.rMax)*LHr), x=X(h);
      const conf=TL.confH.rain[h]!=null?TL.confH.rain[h]:70;
      if(conf<65)rainEcho+='<rect x="'+(x-barW/2-1.5).toFixed(1)+'" y="'+(y0r+LHr-bh-1.5).toFixed(1)+'" width="'+(barW+3).toFixed(1)+'" height="'+(bh+1.5).toFixed(1)+'" rx="'+(barW/2).toFixed(1)+'" fill="'+QT.rain+'" opacity="'+((1-conf/100)*0.5).toFixed(2)+'" filter="url(#tlEcho)"/>';
      rainBars+='<rect x="'+(x-barW/2).toFixed(1)+'" y="'+(y0r+LHr-bh).toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="'+(barW/2).toFixed(1)+'" fill="'+QT.rain+'" opacity="'+(0.35+(conf/100)*0.45+Math.min(0.2,v/4)).toFixed(2)+'"/>';
    }
    masked+='<line x1="0" y1="'+(y0r+LHr)+'" x2="'+TW+'" y2="'+(y0r+LHr)+'" stroke="var(--border,#1c2431)"/>'+rainEcho+rainBars;
  }
  if(TL.lanes.includes('wind')){
    const wBase=TL.laneY.wind+TL_LANE_H.wind*0.5;
    masked+='<line x1="0" y1="'+wBase+'" x2="'+TW+'" y2="'+wBase+'" stroke="var(--border,#1c2431)" stroke-dasharray="2 4" opacity="0.6"/>'
      +'<path id="tl-wind-glow" d="" fill="none" stroke="'+QT.wind+'" opacity="0.10" filter="url(#tlEcho)"/>'
      +'<path id="tl-wind-b" d="" fill="none" stroke="'+QT.wind+'" opacity="0.25"/>'
      +'<path id="tl-wind-a" d="" fill="none" stroke="'+QT.wind+'" stroke-linecap="round" opacity="0.85"/>';
  }
  if(TL.lanes.includes('cloud')){
    const y0c=TL.laneY.cloud, LHc=TL_LANE_H.cloud;
    masked+='<rect x="0" y="'+(y0c+LHc*0.15)+'" width="'+TW+'" height="'+(LHc*0.70)+'" rx="'+(LHc*0.35)+'" fill="url(#tlStCloud)"/>';
  }
  let cloudStops='';
  for(let h=0;h<TL.n;h+=1){
    const c=TL.cloud[h]; if(c==null)continue;
    cloudStops+='<stop offset="'+((X(h)/TW)*100).toFixed(2)+'%" stop-color="'+QT.cloud+'" stop-opacity="'+(0.03+Math.pow(c/100,1.15)*0.85).toFixed(2)+'"/>';
  }
  let lumStops='';
  for(let h=0;h<TL.n;h+=2)lumStops+='<stop offset="'+((h/(TL.n-1))*100).toFixed(2)+'%" stop-color="#fff" stop-opacity="'+tlLum(h).toFixed(2)+'"/>';
  // shared axis: 12pm per day + day names at boundaries (no 6am/6pm)
  let axis='';
  const axY=TL.H-8;
  TL.days.forEach((d,di)=>{
    axis+='<text x="'+(di*TL_W+12*PX).toFixed(1)+'" y="'+axY+'" text-anchor="middle" fill="var(--text-dim,#5c6a80)" font-size="10" font-weight="600">12pm</text>';
    if(di>0)axis+='<text x="'+(di*TL_W).toFixed(1)+'" y="'+axY+'" text-anchor="middle" fill="var(--text-muted,#93a1b8)" font-size="10" font-weight="700">'+d.dow.toUpperCase()+'</text>';
  });
  // sunrise/sunset icons + times, in their own strip under the temp lane
  let suns='';
  const sunY=TL.lanes.includes('temp')?TL.laneY.temp+TL_LANE_H.temp+10:TL.H-TL_AXIS-16;
  TL.suns.forEach(s=>{
    const x=s.h*PX, y=sunY;
    if(x<2||x>TW-2)return;
    const tri=s.kind==='rise'
      ?'M '+(x-2.4)+' '+(y-3)+' L '+x+' '+(y-5.6)+' L '+(x+2.4)+' '+(y-3)
      :'M '+(x-2.4)+' '+(y-5.6)+' L '+x+' '+(y-3)+' L '+(x+2.4)+' '+(y-5.6);
    suns+='<g stroke="'+TL_SUN+'" stroke-width="1.3" stroke-linecap="round" fill="none" opacity="0.5">'
      +'<circle cx="'+x.toFixed(1)+'" cy="'+(y+3)+'" r="2.4"/>'
      +'<line x1="'+(x-5).toFixed(1)+'" y1="'+(y+7)+'" x2="'+(x+5).toFixed(1)+'" y2="'+(y+7)+'"/>'
      +'<path d="'+tri+'"/></g>'
      +'<text x="'+x.toFixed(1)+'" y="'+(y+17)+'" text-anchor="middle" fill="'+TL_SUN+'" opacity="0.65" font-size="9" font-weight="600">'+tlClock(s.ms)+'</text>';
  });
  const nowX=TL.nowH!=null&&TL.nowH>=0&&TL.nowH<=TL.n?TL.nowH*PX:null;
  // headers: icon + figures only (no metric names)
  const IC={temp:MI_TEMP,rain:MI_RAIN,wind:MI_WIND,cloud:MI_CLOUD};
  const heads=TL.lanes.map(m=>
    '<div class="tl-head" id="tl-head-'+m+'" style="top:'+(((TL.laneY[m]-34)/TL.H)*100).toFixed(2)+'%">'
    +'<span class="tl-ic" style="color:'+QT[m]+'">'+IC[m]+'</span>'
    +'<span class="tl-big" id="tl-big-'+m+'"></span>'
    +'<span class="tl-sub" id="tl-sub-'+m+'"></span>'
    +'<span class="tl-right" id="tl-right-'+m+'"></span></div>').join('');
  // right-edge day ceiling/floor per lane
  const scales=TL.lanes.map(m=>
    '<div class="tl-scale" id="tl-scale-'+m+'" style="top:'+((TL.laneY[m]/TL.H)*100).toFixed(2)+'%;height:'+((TL_LANE_H[m]/TL.H)*100).toFixed(2)+'%">'
    +'<span id="tl-hi-'+m+'"></span><span id="tl-lo-'+m+'"></span></div>').join('');

  return '<div class="tl-hourly">'+heads+scales
    +'<svg id="tl-hourly-svg" viewBox="'+(TL.sel*TL_W)+' 0 '+TL_W+' '+TL.H+'" aria-label="Hourly forecast streams">'
    +'<defs>'
    +'<linearGradient id="tlStCloud" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="'+TW+'" y2="0">'+cloudStops+'</linearGradient>'
    +'<linearGradient id="tlStLum" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="'+TW+'" y2="0">'+lumStops+'</linearGradient>'
    +'<mask id="tlStNight"><rect width="'+TW+'" height="'+TL.H+'" fill="url(#tlStLum)"/></mask>'
    +'<filter id="tlSoft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3"/></filter>'
    +'<filter id="tlEcho" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.6"/></filter>'
    +'<filter id="tlNowGlow" x="-300%" y="-5%" width="700%" height="110%"><feGaussianBlur stdDeviation="2.4"/></filter>'
    +'</defs>'
    +body
    +'<g mask="url(#tlStNight)">'+masked
    +(nowX!=null?'<rect x="0" y="0" width="'+nowX.toFixed(1)+'" height="'+(TL.H-TL_AXIS)+'" fill="#000" opacity="0.35"/>':'')
    +'</g>'
    +axis+suns
    +(nowX!=null?
      '<g><line class="tl-now-glow" x1="'+nowX.toFixed(1)+'" y1="6" x2="'+nowX.toFixed(1)+'" y2="'+(TL.H-TL_AXIS+8)+'" stroke="'+TL_NOW+'" stroke-width="5" opacity="0.3" filter="url(#tlNowGlow)"/>'
      +'<line x1="'+nowX.toFixed(1)+'" y1="6" x2="'+nowX.toFixed(1)+'" y2="'+(TL.H-TL_AXIS+8)+'" stroke="'+TL_NOW+'" stroke-width="1.3" opacity="0.9"/>'
      +'<text x="'+nowX.toFixed(1)+'" y="1" text-anchor="middle" dominant-baseline="hanging" fill="'+TL_NOW+'" font-size="8.5" font-weight="800" letter-spacing="1">NOW</text></g>':'')
    +'<g id="tl-scrub" style="display:none;pointer-events:none">'
    +'<line id="tl-scrub-line" y1="10" y2="'+(TL.H-TL_AXIS+8)+'" stroke="var(--text-muted,#93a1b8)" stroke-width="1" stroke-dasharray="3 3" opacity="0.9"/>'
    +'<text id="tl-scrub-t" y="8" text-anchor="middle" fill="var(--text-muted,#93a1b8)" font-size="9" font-weight="700"></text></g>'
    +'</svg></div>';
}
// animated wind ripple across the (visible part of the) stream
function tlWindD(off,t){
  if(!TL.lanes.includes('wind'))return'';
  const PX=TL_W/24, TW=TL.days.length*TL_W, base=TL.laneY.wind+TL_LANE_H.wind*0.5;
  const vb=TL.win.cur/24*TL_W;
  const lo=Math.max(0,vb-60), hi=Math.min(TW,vb+TL_W+60);
  let d='';
  for(let px=lo;px<=hi;px+=4){
    const h=Math.max(0,Math.min(TL.n-1,Math.floor(px/PX)));
    const sp=tlVal(TL.wind,h), gu=tlGust(h);
    const amp=0.6+Math.pow(sp/TL.wMax,1.6)*(TL_LANE_H.wind*0.44)+((gu-sp)/TL.wMax)*(TL_LANE_H.wind*0.28);
    const y=base+Math.sin(px*0.10+t*2.3+off)*amp*0.55+Math.sin(px*0.026-t*1.2+off*2.1)*amp*0.45;
    d+=(d?'L':'M')+px.toFixed(0)+' '+y.toFixed(1);
  }
  return d;
}

// ── headers for the selected day (or scrubbed hour) ─────────────────────
function tlRefHour(){
  if(TL.scrub!=null)return Math.max(0,Math.min(TL.n-1,Math.floor(TL.scrub)));
  const d=TL.days[TL.sel];
  if(d&&d.isToday&&TL.nowH!=null)return Math.max(TL.sel*24,Math.min(TL.sel*24+23,Math.floor(TL.nowH)));
  return TL.sel*24+13;
}
function tlHeads(){
  const d=TL.days[TL.sel]; if(!d)return;
  const h=tlRefHour(), s=TL.sel*24;
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.innerHTML=v;};
  const conf=(m)=>(confVisible[m]&&TL.dayConf[d.date][m]!=null)?TL.dayConf[d.date][m]+'% agree':'';
  const range=(arr)=>{let hi=null,lo=null;for(let k=s;k<s+24;k++){const v=arr[k];if(v==null)continue;hi=hi==null?v:Math.max(hi,v);lo=lo==null?v:Math.min(lo,v);}return[hi,lo];};
  // temp
  const t=TL.temp[h];
  let feels=null;
  if(TL.scrub==null&&d.isToday&&cachedCurrent&&cachedCurrent.c&&cachedCurrent.c.apparent_temperature!=null)feels=cachedCurrent.c.apparent_temperature;
  else if(t!=null&&TL.wind[h]!=null)feels=t-TL.wind[h]*0.11;
  set('tl-big-temp',t!=null?tempDisp(Math.round(t))+'°':'—');
  set('tl-sub-temp',feels!=null?'feels '+tempDisp(Math.round(feels))+'°':'');
  set('tl-right-temp',conf('temp'));
  const [tHi,tLo]=range(TL.temp);
  set('tl-hi-temp',tHi!=null?tempDisp(Math.round(tHi))+'°':'');
  set('tl-lo-temp',tLo!=null?tempDisp(Math.round(tLo))+'°':'');
  // rain — scrubbing shows that hour's actual/forecast; otherwise day totals
  let tot=0,toCome=0;
  for(let k=s;k<s+24;k++){const v=TL.rain[k]||0;tot+=v;if(TL.nowH!=null&&k>=TL.nowH)toCome+=v;}
  if(TL.scrub!=null){
    const rv=TL.rain[h];
    set('tl-big-rain',(rv!=null?rv.toFixed(1):'0.0')+' mm');
    set('tl-sub-rain',(TL.nowH!=null&&h<TL.nowH?'observed ':'forecast ')+tlHourLabel(TL.scrub));
  }else{
    set('tl-big-rain',tot.toFixed(1)+' mm');
    set('tl-sub-rain',d.isToday?toCome.toFixed(1)+' mm to come':(d.past?'observed':'expected'));
  }
  set('tl-right-rain',conf('rain'));
  const [rHi]=range(TL.rain);
  set('tl-hi-rain',rHi!=null&&rHi>0?rHi.toFixed(1):'');
  set('tl-lo-rain','0');
  // wind
  const w=TL.wind[h];
  let dir='';
  if(TL.idx[h]!=null){const dv=wBlendAt('winddirection_10m',TL.idx[h],horizonOf(d.date));if(dv!=null)dir=dirFull(dv);}
  set('tl-big-wind',w!=null?Math.round(w)+' km/h':'—');
  set('tl-sub-wind',dir);
  set('tl-right-wind',conf('wind'));
  const [wHi,wLo]=range(TL.wind);
  set('tl-hi-wind',wHi!=null?Math.round(wHi):'');
  set('tl-lo-wind',wLo!=null?Math.round(wLo):'');
  // cloud
  const c=TL.cloud[h];
  set('tl-big-cloud',c!=null?Math.round(c)+'%':'—');
  set('tl-sub-cloud','cover');
  set('tl-right-cloud',conf('cloud'));
  const [cHi,cLo]=range(TL.cloud);
  set('tl-hi-cloud',cHi!=null?Math.round(cHi)+'%':'');
  set('tl-lo-cloud',cLo!=null?Math.round(cLo)+'%':'');
}

// ── scrub: drag horizontally on the hourly view ─────────────────────────
function tlScrubDraw(){
  const g=document.getElementById('tl-scrub'); if(!g)return;
  if(TL.scrub==null){g.style.display='none';return;}
  const PX=TL_W/24, x=(TL.scrub*PX);
  g.style.display='';
  const ln=document.getElementById('tl-scrub-line'), tx=document.getElementById('tl-scrub-t');
  ln.setAttribute('x1',x.toFixed(1));ln.setAttribute('x2',x.toFixed(1));
  tx.setAttribute('x',x.toFixed(1));
  tx.textContent=tlHourLabel(TL.scrub);
}
function tlBindScrub(svg){
  let active=false;
  const toHour=ev=>{
    const r=svg.getBoundingClientRect();
    const frac=Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width));
    return Math.max(0,Math.min(TL.n-0.01,TL.win.cur+frac*24));
  };
  svg.addEventListener('pointerdown',ev=>{
    active=true;
    try{svg.setPointerCapture(ev.pointerId);}catch(e){}
    TL.scrub=toHour(ev); tlScrubDraw(); tlHeads();
  });
  svg.addEventListener('pointermove',ev=>{
    if(!active)return;
    TL.scrub=toHour(ev); tlScrubDraw(); tlHeads();
  });
  const end=()=>{ if(!active)return; active=false; TL.scrub=null; tlScrubDraw(); tlHeads(); };
  svg.addEventListener('pointerup',end);
  svg.addEventListener('pointercancel',end);
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
  const refH=Math.max(0,Math.min(23,tlRefHour()-TL.sel*24));
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
    if(svg)svg.setAttribute('viewBox',(w.cur/24*TL_W).toFixed(2)+' 0 '+TL_W+' '+TL.H);
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
    tweening=true;
    const p=Math.min(1,(now-w.t0)/w.dur);
    const e=p<0.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
    w.cur=p>=1?w.to:w.from+(w.to-w.from)*e;
    const svg=document.getElementById('tl-hourly-svg');
    if(svg)svg.setAttribute('viewBox',(w.cur/24*TL_W).toFixed(2)+' 0 '+TL_W+' '+TL.H);
    tlLensUpdate();
  }
  tlWindFrame(t); // the ripple IS the data — keep it moving even with reduced motion
}
// draw one wind frame synchronously (lanes are never empty even if rAF is
// throttled or paused)
function tlWindFrame(t){
  if(!TL.lanes.includes('wind'))return;
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
  tlWindFrame((performance.now()-TL.tBase)/1000);
  TL.raf=requestAnimationFrame(tlLoop);
}
['visibilitychange','pageshow','focus'].forEach(ev=>{
  (ev==='visibilitychange'?document:window).addEventListener(ev,()=>{
    if(!document.hidden&&document.getElementById('tl-hourly-svg'))tlEnsureLoop();
  });
});

// ── render root + wiring ────────────────────────────────────────────────
function tlRenderAll(root){
  TL.win.cur=TL.win.to=TL.sel*24;
  TL.scrub=null;
  root.innerHTML=tlWeekHTML()+tlLensHTML()+tlHourlyHTML()+tlSecHTML();
  const week=document.getElementById('tl-week');
  if(week)week.addEventListener('click',ev=>{
    if(ev.target.closest('.tl-wk-nav'))return;
    const r=week.getBoundingClientRect();
    const i=Math.max(0,Math.min(TL.days.length-1,Math.floor(((ev.clientX-r.left)/r.width)*TL.days.length)));
    setSelectedDay(TL.days[i].date,{behavior:'smooth'});
  });
  const prev=document.getElementById('tl-wk-prev'), next=document.getElementById('tl-wk-next');
  const shift=dir=>{TL.startOff=(TL.startOff||0)+dir;renderCurrentBar();};
  if(prev)prev.addEventListener('click',ev=>{ev.stopPropagation();shift(-1);});
  if(next)next.addEventListener('click',ev=>{ev.stopPropagation();shift(1);});
  const btn=document.getElementById('tl-sec-btn');
  if(btn)btn.addEventListener('click',()=>{
    TL.secOpen=!TL.secOpen;
    btn.classList.toggle('open',TL.secOpen);
    document.getElementById('tl-sec-body').classList.toggle('open',TL.secOpen);
    if(TL.secOpen)tlSecRender();
  });
  const svg=document.getElementById('tl-hourly-svg');
  if(svg)tlBindScrub(svg);
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
