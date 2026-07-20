// ════════════════════════════════════════════════════════════════════════
// WeatherBlend — timeline.js  (quatrefoil dark UI · merged hero chart)
// ════════════════════════════════════════════════════════════════════════
// Load order: engine.js → app.js → timeline.js.
//   · compressed week overview — glowing temp line + rain bars, DOW labels,
//     selected day boxed, NOW line on today; tap to select, drag to slide
//     the window (animated) across the full table range
//   · hour section — hero temp + feels-like; rain / wind / cloud figures
//   · ONE merged day chart: the temperature mountain (observed solid,
//     forecast dashed, model-agreement ribbon, hi/lo labelled on the
//     curve), rain bars rising from the floor, a soft cloud band across
//     the top of the sky, night shading, and a dot riding the curve at
//     NOW / the scrub hour. Wind stays in the figures — swipe or scrub
//     anywhere on the chart or the figures to read any hour.
//   · quick flick slides to the next/prev day; slow drag scrubs hours
// Geometry is fraction-based on a fixed 0..23 hour grid, so the scrub
// position matches the chart identically on mobile and desktop.
// Honors Show/Confidence toggles and model changes via renderCurrentBar().
// ════════════════════════════════════════════════════════════════════════

const TL_NOW = '#f87171';
const TL_SVGW = 480, TL_SVGH = 176;               // merged hour chart (fraction grid)
const TL_WKW = 700, TL_WKH = 38;                  // week-overview svg (compressed)
const TL_RAIN_CEIL_MIN = 0.5;                     // rain lane ceiling floor

const TL = {
  days: [], n: 0, idx: [], temp: [], rain: [], wind: [], cloud: [], wdir: [],
  fc: { temp: [], rain: [], wind: [], cloud: [] },    // pure blend (no actual substitution)
  act: { temp: [], rain: [], wind: [], cloud: [] },   // observed only (Open-Meteo analysis)
  confH: { temp: [], rain: [], wind: [], cloud: [] }, dayConf: {},
  lanes: [], suns: [], streamT0: 0, nowH: null,
  sel: 0, hourSel: 12, scrubbing: false, startOff: 0, _canPrev: false, _canNext: false,
  sec: null, secKey: null, secOpen: false, _secRows: null,
};

// ── helpers ─────────────────────────────────────────────────────────────
function tlPath(pts) {
  if (!pts.length) return '';
  let d = 'M ' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
  for (let i = 1; i < pts.length; i++) {
    const x0 = pts[i - 1][0], y0 = pts[i - 1][1], x1 = pts[i][0], y1 = pts[i][1], mx = (x0 + x1) / 2;
    d += ' C ' + mx.toFixed(1) + ' ' + y0.toFixed(1) + ', ' + mx.toFixed(1) + ' ' + y1.toFixed(1) + ', ' + x1.toFixed(1) + ' ' + y1.toFixed(1);
  }
  return d;
}
// light smoothing (weighted 3-pt moving average, run twice) for a calmer line
function tlSmooth(vals) {
  let a = vals.slice();
  for (let pass = 0; pass < 2; pass++) {
    const out = a.slice();
    for (let i = 0; i < a.length; i++) {
      if (a[i] == null) { out[i] = null; continue; }
      const p = a[i - 1] != null ? a[i - 1] : a[i];
      const n = a[i + 1] != null ? a[i + 1] : a[i];
      out[i] = p * 0.25 + a[i] * 0.5 + n * 0.25;
    }
    a = out;
  }
  return a;
}
function tlClock(ms) { const d = new Date(ms); let h = d.getHours(); const m = d.getMinutes(); const ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12; return h + ':' + String(m).padStart(2, '0') + ap; }

// selected day's sunrise/sunset as a fraction of the day (0..1), + ms
function tlSunFrac() {
  const s = TL.sel * 24;
  let rise = 0.28, set = 0.80, riseMs = null, setMs = null;
  TL.suns.forEach(o => {
    const f = (o.h - s) / 24;
    if (f >= -0.02 && f <= 1.02) {
      if (o.kind === 'rise') { rise = f; riseMs = o.ms; }
      else { set = f; setMs = o.ms; }
    }
  });
  return { rise: Math.max(0, Math.min(1, rise)), set: Math.max(0, Math.min(1, set)), riseMs, setMs };
}
function tlDayRainTotal(di) { const s = di * 24; let t = 0; for (let k = s; k < s + 24; k++) { const r = TL.rain[k]; if (r) t += r; } return t; }

// ── build 7-day window from engine state (window slides over all dates) ──
function tlBuild() {
  const ref = refHourly(); if (!ref || !ref.time) return false;
  const dates = carouselDates(); if (!dates.length) return false;
  const today = localTodayStr();
  if (!selDate || !dates.includes(selDate)) selDate = dates.includes(today) ? today : dates[0];
  let ti = dates.indexOf(today); if (ti < 0) ti = 0;
  const maxStart = Math.max(0, dates.length - 7);
  const start = Math.max(0, Math.min(ti - 1 + (TL.startOff || 0), maxStart));
  TL.startOff = start - (ti - 1); TL._canPrev = start > 0; TL._canNext = start < maxStart;
  const days = dates.slice(start, start + 7);
  const im = {}; ref.time.forEach((t, i) => { im[t] = i; });
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  TL.days = days.map(d => ({ date: d, dow: DOW[new Date(d + 'T12:00').getDay()], isToday: d === today, past: d < today }));
  TL.n = days.length * 24;
  TL.idx = []; TL.temp = []; TL.rain = []; TL.wind = []; TL.cloud = []; TL.wdir = [];
  ['temp', 'rain', 'wind', 'cloud'].forEach(k => { TL.confH[k] = []; TL.fc[k] = []; TL.act[k] = []; });
  TL.dayConf = {};
  days.forEach(d => {
    TL.dayConf[d] = { temp: confDayMetric(d, 'temp'), rain: confDayMetric(d, 'rain'), wind: confDayMetric(d, 'wind'), cloud: confDayMetric(d, 'cloud') };
    const hz = (typeof horizonOf === 'function') ? horizonOf(d) : 0;
    for (let h = 0; h < 24; h++) {
      const iso = d + 'T' + String(h).padStart(2, '0') + ':00';
      const idx = im[iso]; TL.idx.push(idx != null ? idx : null);
      const td = idx != null ? hourTileData(iso) : null;
      TL.temp.push(td && td.temp != null ? td.temp : null);
      TL.rain.push(td && td.rain != null ? _rcell(td.rain) : null);
      TL.wind.push(td && td.wind != null ? td.wind : null);
      TL.cloud.push(td && td.cloud != null ? td.cloud : null);
      // pure forecast (blend, never actual-substituted) — one line of the pair
      let fT = null, fR = null, fW = null, fC = null;
      if (idx != null && typeof wBlendAt === 'function') {
        try {
          fT = wBlendAt('temperature_2m', idx, hz); fR = wBlendAt('precipitation', idx, hz);
          fW = wBlendAt('windspeed_10m', idx, hz); fC = wBlendAt('cloudcover', idx, hz);
        } catch (e) {}
      }
      TL.fc.temp.push(fT); TL.fc.rain.push(fR != null ? _rcell(fR) : null);
      TL.fc.wind.push(fW); TL.fc.cloud.push(fC);
      // observed only (whatever actuals source is selected) — the other line
      let aT = null, aR = null, aW = null, aC = null;
      try {
        if (typeof actualData !== 'undefined' && actualData && actualData.hourly && actualData.hourly.time) {
          const ai = actualData.hourly.time.indexOf(iso);
          if (ai >= 0) {
            aT = actualData.hourly.temperature_2m ? (actualData.hourly.temperature_2m[ai] ?? null) : null;
            aR = actualData.hourly.precipitation ? (actualData.hourly.precipitation[ai] ?? null) : null;
            aW = actualData.hourly.windspeed_10m ? (actualData.hourly.windspeed_10m[ai] ?? null) : null;
            aC = actualData.hourly.cloudcover ? (actualData.hourly.cloudcover[ai] ?? null) : null;
          }
        }
      } catch (e) {}
      TL.act.temp.push(aT); TL.act.rain.push(aR != null ? _rcell(aR) : null);
      TL.act.wind.push(aW); TL.act.cloud.push(aC);
      let wd = null;
      try { if (idx != null && typeof wBlendAt === 'function') wd = wBlendAt('winddirection_10m', idx, hz); } catch (e) {}
      TL.wdir.push(wd);
      ['temp', 'rain', 'wind', 'cloud'].forEach(k => TL.confH[k].push(idx != null ? confHourMetric(idx, k) : null));
    }
  });
  TL.streamT0 = new Date(days[0] + 'T00:00').getTime();
  TL.nowH = (locNowMs() - TL.streamT0) / 3600000;
  TL.suns = [];
  days.forEach(d => {
    const s = getSunTimes(d); if (!s) return;
    TL.suns.push({ h: (s.riseMs - TL.streamT0) / 3600000, kind: 'rise', ms: s.riseMs }, { h: (s.setMs - TL.streamT0) / 3600000, kind: 'set', ms: s.setMs });
  });
  let lanes = ['temp', 'rain', 'wind', 'cloud'].filter(m => secVisible[m]);
  if (!lanes.length) lanes = ['temp', 'rain', 'wind', 'cloud'];
  TL.lanes = lanes;
  let si = TL.days.findIndex(o => o.date === selDate);
  if (si < 0) { si = Math.max(0, Math.min(TL.days.length - 1, ti - start)); selDate = TL.days[si].date; }
  TL.sel = si;
  TL.scrubbing = false;
  TL.hourSel = tlDefaultHour();
  return true;
}
function tlDefaultHour() {
  const d = TL.days[TL.sel];
  if (d && d.isToday && TL.nowH != null) return Math.max(0, Math.min(23, Math.floor(TL.nowH - TL.sel * 24)));
  if (TL.nowH != null) return ((Math.floor(TL.nowH) % 24) + 24) % 24;
  return 12;
}
function tlRefHour() { return TL.sel * 24 + Math.max(0, Math.min(23, TL.hourSel)); }
// NOW line x-fraction: hour-snapped while scrubbing, exact clock time idle
function tlNowFrac() {
  if (TL.scrubbing) return TL.hourSel / 23;
  const rel = (TL.nowH != null ? TL.nowH : 12) - TL.sel * 24;
  return Math.max(0, Math.min(1, rel / 23));
}
function tlNowVisible() { return (TL.days[TL.sel] && TL.days[TL.sel].isToday) || TL.scrubbing; }
function tlDayRange(arr) { const s = TL.sel * 24; let hi = null, lo = null; for (let k = s; k < s + 24; k++) { const v = arr[k]; if (v == null) continue; hi = hi == null ? v : Math.max(hi, v); lo = lo == null ? v : Math.min(lo, v); } return [hi, lo]; }

// ── week overview (compressed) ──────────────────────────────────────────
function tlWeekHTML() {
  const W = TL_WKW, H = TL_WKH, n = TL.n || 168;
  const tTop = 5, tBot = 22, rBase = 34, rTop = 24;
  const X = gi => (gi / n) * W;
  const tg = TL.temp.filter(v => v != null && !isNaN(v));
  const tmn = tg.length ? Math.min(...tg) : 0, tmx = tg.length ? Math.max(...tg) : 1, tspan = (tmx - tmn) || 1;
  const sm = tlSmooth(TL.temp);
  const pts = []; sm.forEach((v, gi) => { if (v == null || isNaN(v)) return; pts.push([X(gi + 0.5), tTop + (tBot - tTop) * (1 - (v - tmn) / tspan)]); });
  const line = tlPath(pts);
  const rmx = Math.max(TL_RAIN_CEIL_MIN, ...TL.rain.map(v => v || 0));
  const bw = (W / n) * 0.62;
  const bars = TL.rain.map((v, gi) => {
    if (!v || v < 0.05) return '';
    const hgt = Math.max(1, (Math.log1p(v) / Math.log1p(rmx)) * (rBase - rTop));
    return '<rect x="' + (X(gi + 0.5) - bw / 2).toFixed(1) + '" y="' + (rBase - hgt).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hgt.toFixed(1) + '" fill="var(--q-rain,#5FA4FF)" opacity="0.6"/>';
  }).join('');
  const colW = W / TL.days.length;
  const selBox = '<rect x="' + (TL.sel * colW + 1).toFixed(1) + '" y="1.5" width="' + (colW - 2).toFixed(1) + '" height="' + (H - 3).toFixed(1) + '" rx="5" fill="none" stroke="var(--text-primary,#f4f7fd)" stroke-width="1.3"/>';
  const seps = TL.days.map((d, i) => i === 0 ? '' : '<line x1="' + (i * colW).toFixed(1) + '" y1="3" x2="' + (i * colW).toFixed(1) + '" y2="' + (H - 3) + '" stroke="var(--border,#1f2733)" stroke-width="1"/>').join('');
  const now = (TL.nowH != null && TL.nowH >= 0 && TL.nowH <= n)
    ? '<line x1="' + X(TL.nowH).toFixed(1) + '" y1="2" x2="' + X(TL.nowH).toFixed(1) + '" y2="' + (H - 2) + '" stroke="' + TL_NOW + '" stroke-width="1.4"/>' : '';
  const svg = '<svg class="tlm-wk-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" preserveAspectRatio="none">'
    + seps + '<path d="' + line + '" fill="none" stroke="var(--q-temp,#7EE8A5)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" opacity="0.9"/>'
    + bars + selBox + now + '</svg>';
  const labels = '<div class="tlm-wk-labels">' + TL.days.map((d, i) =>
    '<button type="button" class="tlm-wk-day' + (i === TL.sel ? ' sel' : '') + '" data-di="' + i + '">'
    + '<span class="tlm-wk-dow">' + (d.isToday ? 'TODAY' : d.dow.toUpperCase()) + '</span></button>').join('') + '</div>';
  return '<div class="tlm-week" id="tlm-week">' + svg + labels + '</div>';
}

// ── hour section: hero + figures + the merged day chart ─────────────────
// Everything on one canvas: temp mountain + rain bars + cloud band + night.
// Scales are shared across hybrid / forecast / actual series so the shape
// never jumps when observations arrive.
function tlChartRange() {
  const s = TL.sel * 24; let hi = null, lo = null;
  [TL.temp, TL.fc.temp, TL.act.temp].forEach(arr => {
    if (!arr) return;
    for (let k = s; k < s + 24; k++) {
      const v = arr[k]; if (v == null || isNaN(v)) continue;
      hi = hi == null ? v : Math.max(hi, v); lo = lo == null ? v : Math.min(lo, v);
    }
  });
  return [hi, lo];
}
function tlMainChartSVG() {
  const W = TL_SVGW, H = TL_SVGH;
  const s = TL.sel * 24;
  const PT = 34, TB = 122;              // temp band
  const RB = H - 8, RH = 46;            // rain baseline + max bar height
  const CY = 6, CH = 5;                 // cloud band
  const X = i => (i / 23) * W;

  const hyb = [], fc = [], act = [], rainF = [], rainA = [], cloudArr = [];
  for (let h = 0; h < 24; h++) {
    hyb.push(TL.temp[s + h]); fc.push(TL.fc.temp[s + h]); act.push(TL.act.temp[s + h]);
    rainF.push(TL.fc.rain[s + h]); rainA.push(TL.act.rain[s + h]); cloudArr.push(TL.cloud[s + h]);
  }
  const actN = act.filter(v => v != null && !isNaN(v)).length;
  const dual = actN >= 2;
  const base = dual ? fc : hyb;

  const [hiR, loR] = tlChartRange();
  const mn = loR, mx = hiR, span = (mx - mn) || 1;
  const Y = v => TB - ((v - mn) / span) * (TB - PT);
  const dispB = tlSmooth(base), dispA = tlSmooth(act), dispH = tlSmooth(hyb);
  const primArr = dual ? act : hyb;      // what the eye follows (and the dot rides)
  const primDisp = dual ? dispA : dispH;

  // per-hour dot track for the NOW/scrub marker (fraction of H)
  TL._dotY = [];
  for (let h = 0; h < 24; h++) {
    let v = primDisp[h]; if (v == null || isNaN(v)) v = dispB[h];
    if (v == null || isNaN(v)) { TL._dotY.push(null); continue; }
    TL._dotY.push(Y(v) / H);
  }

  // night shading (before sunrise / after sunset)
  const sun = tlSunFrac();
  const night =
    '<rect x="0" y="0" width="' + (sun.rise * W).toFixed(1) + '" height="' + (H - 4) + '" fill="#05070c" opacity="0.42"/>' +
    '<rect x="' + (sun.set * W).toFixed(1) + '" y="0" width="' + ((1 - sun.set) * W).toFixed(1) + '" height="' + (H - 4) + '" fill="#05070c" opacity="0.42"/>';

  // cloud band across the top of the sky
  const segw = W / 23;
  const clouds = cloudArr.map((v, i) => {
    if (v == null || v < 15) return '';
    const op = 0.10 + 0.42 * Math.min(1, v / 100);
    return '<rect x="' + (X(i) - segw / 2).toFixed(1) + '" y="' + CY + '" width="' + segw.toFixed(1) + '" height="' + CH + '" rx="2.5" fill="var(--q-cloud,#C8A6FF)" opacity="' + op.toFixed(2) + '"/>';
  }).join('');

  // temperature: area under the primary line, ribbon around the base line
  const ptsOf = (arr, disp) => arr.map((v, i) => [i, v]).filter(p => p[1] != null && !isNaN(p[1]))
    .map(([i]) => [X(i), Y(disp[i] != null ? disp[i] : arr[i])]);
  const basePts = ptsOf(base, dispB);
  if (basePts.length < 2) return '<svg class="tlm-mainsvg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" preserveAspectRatio="none"></svg>';
  const primPts = ptsOf(primArr, primDisp);
  const areaSrc = primPts.length >= 2 ? primPts : basePts;
  const area = tlPath(areaSrc)
    + ' L ' + areaSrc[areaSrc.length - 1][0].toFixed(1) + ' ' + (RB - 2)
    + ' L ' + areaSrc[0][0].toFixed(1) + ' ' + (RB - 2) + ' Z';

  // model-agreement ribbon (follows the forecast/base line)
  const MAXW = 7;
  const top = [], bot = [];
  base.forEach((v, i) => {
    if (v == null || isNaN(v)) return;
    const x = X(i), y = Y(dispB[i] != null ? dispB[i] : v);
    const c = TL.confH.temp[s + i]; const cv = c != null ? c : 100;
    const hw = 1 + (1 - cv / 100) * MAXW;
    top.push([x, y - hw]); bot.push([x, y + hw]);
  });
  const ribbon = top.length >= 2 ? tlPath(top) + ' L ' + bot[bot.length - 1][0].toFixed(1) + ' ' + bot[bot.length - 1][1].toFixed(1)
    + ' ' + tlPath(bot.slice().reverse()).slice(1) + ' Z' : '';

  let lines;
  const baseLine = tlPath(basePts);
  if (dual) {
    const actLine = tlPath(primPts);
    lines =
      '<path d="' + baseLine + '" fill="none" stroke="var(--q-temp,#7EE8A5)" stroke-width="1.5" stroke-dasharray="5 4" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/>'
      + (actLine ? '<path d="' + actLine + '" fill="none" stroke="var(--q-temp,#7EE8A5)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" filter="url(#tlmGlow)"/>' : '');
  } else {
    lines = '<path d="' + baseLine + '" fill="none" stroke="var(--q-temp,#7EE8A5)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" filter="url(#tlmGlow)"/>';
  }

  // hi/lo labelled on the curve itself
  let mkLab = '';
  {
    let hiV = null, hiI = null, loV = null, loI = null;
    primArr.forEach((v, i) => {
      if (v == null || isNaN(v)) return;
      if (hiV == null || v > hiV) { hiV = v; hiI = i; }
      if (loV == null || v < loV) { loV = v; loI = i; }
    });
    const lab = (v, i, above) => {
      if (v == null) return '';
      const x = Math.max(16, Math.min(W - 16, X(i)));
      const yv = Y(primDisp[i] != null ? primDisp[i] : v);
      const y = above ? Math.max(13, yv - 10) : Math.min(H - 26, yv + 17);
      return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="middle" class="tlm-clab' + (above ? '' : ' lo') + '">' + tempDisp(v) + '°</text>';
    };
    mkLab = lab(hiV, hiI, true) + lab(loV, loI, false);
  }

  // rain: forecast bars conf-scaled ahead of now, ghosted behind observed
  const hasAct = rainA.some(v => v != null && v >= 0.05);
  const rmx = Math.max(TL_RAIN_CEIL_MIN, ...rainF.map(v => v || 0), ...rainA.map(v => v || 0));
  const bw = (W / 24) * 0.58;
  const nowH = TL.nowH - s;
  const rect = (i, v, op) => {
    const hgt = Math.max(2, (Math.log1p(v) / Math.log1p(rmx)) * RH);
    return '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + (RB - hgt).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hgt.toFixed(1) + '" rx="1.5" fill="var(--q-rain,#5FA4FF)" opacity="' + op.toFixed(2) + '"/>';
  };
  const fbars = rainF.map((v, i) => {
    if (!v || v < 0.05) return '';
    const future = i > nowH;
    const conf = TL.confH.rain[s + i]; const cv = conf != null ? conf : 100;
    const op = future ? (0.30 + 0.5 * cv / 100) : (hasAct ? 0.20 : 0.85);
    return rect(i, v, op);
  }).join('');
  const abars = rainA.map((v, i) => (v == null || v < 0.05) ? '' : rect(i, v, 0.9)).join('');
  const floor = '<line x1="0" y1="' + RB + '" x2="' + W + '" y2="' + RB + '" stroke="var(--border2,#2b3647)" stroke-width="1"/>';

  return '<svg class="tlm-mainsvg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" preserveAspectRatio="none" style="display:block;overflow:visible">'
    + '<defs>'
    + '<linearGradient id="tlmGradT" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0" stop-color="var(--q-temp,#7EE8A5)" stop-opacity="0.30"/>'
    + '<stop offset="1" stop-color="var(--q-temp,#7EE8A5)" stop-opacity="0.02"/>'
    + '</linearGradient>'
    + '<filter id="tlmGlow" x="-30%" y="-90%" width="160%" height="280%"><feDropShadow dx="0" dy="0" stdDeviation="3.2" flood-color="var(--q-temp,#7EE8A5)" flood-opacity="0.55"/></filter>'
    + '<filter id="tlmRib" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="2.6"/></filter>'
    + '</defs>'
    + night + clouds
    + '<path d="' + area + '" fill="url(#tlmGradT)" stroke="none"/>'
    + (ribbon ? '<path d="' + ribbon + '" fill="var(--q-temp,#7EE8A5)" stroke="none" opacity="0.14" filter="url(#tlmRib)"/>' : '')
    + fbars + abars + floor + lines + mkLab
    + '</svg>';
}
function tlHourHTML() {
  const IC = { temp: MI_TEMP, rain: MI_RAIN, wind: MI_WIND, cloud: MI_CLOUD };
  const sideM = TL.lanes.filter(m => m !== 'temp');

  let hero = '<div class="tlm-hero">'
    + '<div class="tlm-hero-l"><div class="tlm-temp" id="tlm-temp">—</div><div class="tlm-feels" id="tlm-feels"></div></div>'
    + '<div class="tlm-metrics">'
    + sideM.map(m =>
      '<div class="tlm-metric"><span class="tlm-mic tlm-ic-' + m + '">' + IC[m] + '</span>'
      + '<span class="tlm-mfig" id="tlm-fig-' + m + '"></span>'
      + '<span class="tlm-mconf" id="tlm-conf-' + m + '"></span></div>').join('')
    + '</div></div>';

  // top axis: sunrise/sunset times + NOW label share this line (full width)
  const sun = tlSunFrac();
  const axis = '<div class="tlm-axis"><div class="tlm-axtrack">'
    + (sun.riseMs ? '<span class="tlm-suntime" style="left:' + (sun.rise * 100).toFixed(1) + '%">' + wxIcon(0, false, null) + '<b>' + tlClock(sun.riseMs) + '</b></span>' : '')
    + (sun.setMs ? '<span class="tlm-suntime" style="left:' + (sun.set * 100).toFixed(1) + '%">' + wxIcon(0, true, null) + '<b>' + tlClock(sun.setMs) + '</b></span>' : '')
    + '</div></div>';

  const vis = tlNowVisible();
  const L = (tlNowFrac() * 100).toFixed(2) + '%';
  const overlay = '<div class="tlm-overlay" id="tlm-overlay">'
    + '<div class="tlm-now" id="tlm-now" style="left:' + L + ';display:' + (vis ? 'block' : 'none') + '"></div>'
    + '<div class="tlm-dot" id="tlm-dot" style="left:' + L + ';display:none"></div>'
    + '<div class="tlm-nowlab" id="tlm-nowlab" style="left:' + L + ';display:' + (vis ? 'block' : 'none') + '"></div>'
    + '</div>';

  return hero + axis + '<div class="tlm-chart">' + tlMainChartSVG() + overlay + '</div>';
}

// fill hero + metric figures for the current ref hour
function tlHeads() {
  const d = TL.days[TL.sel]; if (!d) return;
  const h = tlRefHour();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerHTML = v; };
  const t = TL.temp[h];
  if (!d.isToday && !TL.scrubbing) {
    // future days: forecast high/low for the day · past days: observed high/low
    const [hi, lo] = tlDayRange(TL.temp);
    set('tlm-temp', hi != null ? tempDisp(hi) + '°' : '—');
    set('tlm-feels', lo != null ? 'Low ' + tempDisp(lo) + '°' : '');
  } else {
    // Feels-like from the same current-hour data as everything else:
    // observed analysis where available, blended forecast otherwise.
    let feels = null;
    const gi = TL.idx ? TL.idx[h] : null;
    if (gi != null) {
      const iso = d.date + 'T' + String(Math.max(0, Math.min(23, TL.hourSel))).padStart(2, '0') + ':00';
      try {
        if (typeof actualData !== 'undefined' && actualData && actualData.hourly && actualData.hourly.time) {
          const ai = actualData.hourly.time.indexOf(iso);
          if (ai >= 0) feels = actualData.hourly.apparent_temperature ? (actualData.hourly.apparent_temperature[ai] ?? null) : null;
        }
        if (feels == null && typeof wBlendAt === 'function') feels = wBlendAt('apparent_temperature', gi, (typeof horizonOf === 'function') ? horizonOf(d.date) : 0);
      } catch (e) {}
    }
    if (feels == null && t != null && TL.wind[h] != null) feels = t - TL.wind[h] * 0.11;
    set('tlm-temp', t != null ? tempDisp(t) + '°' : '—');
    set('tlm-feels', feels != null ? 'Feels like ' + tempDisp(feels) + '°' : '');
  }
  // rain figure: day total idle · hourly figure while scrubbing
  let rainFig;
  if (TL.scrubbing) rainFig = (TL.rain[h] == null ? '—' : TL.rain[h] < 0.05 ? '0' : TL.rain[h].toFixed(1)) + ' mm';
  else { const rt = tlDayRainTotal(TL.sel); rainFig = (rt < 0.05 ? '0' : rt.toFixed(1)) + ' mm'; }
  const dir = TL.wdir[h] != null ? ' <span class="tlm-mdir">' + dirFull(TL.wdir[h]) + '</span>' : '';
  const figFor = {
    rain: rainFig,
    wind: (TL.wind[h] != null ? Math.round(TL.wind[h]) : '—') + ' km/h' + dir,
    cloud: (TL.cloud[h] != null ? Math.round(TL.cloud[h]) : '—') + '%',
  };
  ['rain', 'wind', 'cloud'].forEach(m => {
    set('tlm-fig-' + m, figFor[m]);
    const c = TL.dayConf[d.date][m];
    set('tlm-conf-' + m, (confVisible[m] !== false && c != null) ? c + '%' : '');
  });
  const lab = document.getElementById('tlm-nowlab');
  if (lab) lab.textContent = TL.scrubbing ? tlClock(TL.streamT0 + h * 3600000) : tlClock(locNowMs());
}
function tlSyncNow() {
  const vis = tlNowVisible();
  const frac = tlNowFrac();
  const L = (frac * 100).toFixed(2) + '%';
  const now = document.getElementById('tlm-now'), lab = document.getElementById('tlm-nowlab');
  if (now) { now.style.left = L; now.style.display = vis ? 'block' : 'none'; }
  if (lab) { lab.style.left = L; lab.style.display = vis ? 'block' : 'none'; }
  // the dot rides the temperature curve at the marked hour
  const dot = document.getElementById('tlm-dot');
  if (dot) {
    let y = null;
    if (vis && TL._dotY && TL._dotY.length === 24) {
      const hf = Math.max(0, Math.min(23, frac * 23));
      const h0 = Math.floor(hf), h1 = Math.min(23, h0 + 1), t = hf - h0;
      const y0 = TL._dotY[h0], y1 = TL._dotY[h1];
      if (y0 != null && y1 != null) y = y0 + (y1 - y0) * t;
      else if (y0 != null) y = y0;
    }
    if (y != null) { dot.style.left = L; dot.style.top = (y * 100).toFixed(2) + '%'; dot.style.display = 'block'; }
    else dot.style.display = 'none';
  }
  document.querySelectorAll('.tl-sec-now').forEach(el => { el.style.left = L; el.style.display = vis ? 'block' : 'none'; });
}

// ── scrub / swipe gesture (shared by hour chart + secondary metrics) ─────
// Quick horizontal start = day swipe: the card follows the finger (damped,
// rubber-banded at the ends), committing on distance or velocity and
// springing back otherwise. Hold ≥140ms = scrub hours, as before.
function tlBindScrubOn(el, fracEl, allowSwipe) {
  if (!el) return;
  let down = false, decided = null, startX = 0, startY = 0, startT = 0, lastX = 0, lastT = 0, vel = 0;
  const HOLD_MS = 140, SWIPE_DX = 14, COMMIT_DX = 48, COMMIT_V = 0.45;
  const hourEl = () => document.getElementById('tlm-hour');
  const blocked = dx => (dx > 0 && TL.sel <= 0) || (dx < 0 && TL.sel >= TL.days.length - 1);
  const follow = dx => {
    const h = hourEl(); if (!h) return;
    const damp = blocked(dx) ? 0.22 : 0.55;
    const t = Math.max(-90, Math.min(90, dx * damp));
    h.style.transition = 'none';
    h.style.transform = 'translateX(' + t.toFixed(1) + 'px)';
    h.style.opacity = String(1 - Math.min(0.35, Math.abs(t) / 260));
  };
  const spring = () => {
    const h = hourEl(); if (!h) return;
    h.style.transition = 'transform .2s cubic-bezier(.2,.7,.3,1), opacity .2s';
    h.style.transform = 'translateX(0)';
    h.style.opacity = '1';
  };
  const hourFromX = clientX => {
    const r = (fracEl || el).getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return Math.round(frac * 23);
  };
  el.addEventListener('pointerdown', ev => {
    down = true; decided = null;
    startX = lastX = ev.clientX; startY = ev.clientY;
    startT = lastT = performance.now(); vel = 0;
    try { el.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  el.addEventListener('pointermove', ev => {
    if (!down) return;
    const nowT = performance.now(), x = ev.clientX;
    const moved = x - startX;
    if (decided == null) {
      const dt = nowT - startT, my = Math.abs(ev.clientY - startY);
      if (allowSwipe && dt < HOLD_MS && Math.abs(moved) > SWIPE_DX && Math.abs(moved) > my * 1.2) decided = 'swipe';
      else if (dt >= HOLD_MS) decided = 'scrub';
      else return;
    }
    const dT = nowT - lastT;
    if (dT > 0) { vel = (x - lastX) / dT; lastX = x; lastT = nowT; }
    if (decided === 'swipe') { follow(moved); return; }
    if (decided === 'scrub') {
      TL.scrubbing = true; TL.hourSel = hourFromX(x);
      tlSyncNow(); tlHeads(); tlSecHeads();
    }
  });
  const settle = () => {
    TL.scrubbing = false; TL.hourSel = tlDefaultHour();
    tlSyncNow(); tlHeads(); tlSecHeads();
  };
  el.addEventListener('pointerup', ev => {
    if (!down) return; down = false;
    const dx = (ev.clientX ?? startX) - startX;
    if (decided === 'swipe') {
      const ni = TL.sel + (dx < 0 ? 1 : -1);
      if ((Math.abs(dx) >= COMMIT_DX || Math.abs(vel) >= COMMIT_V) && !blocked(dx) && ni >= 0 && ni < TL.days.length) {
        setSelectedDay(TL.days[ni].date, { behavior: 'smooth' });
        return;
      }
      spring();
      return;
    }
    settle();
  });
  el.addEventListener('pointercancel', () => {
    if (!down) return; down = false;
    if (decided === 'swipe') { spring(); return; }
    settle();
  });
}

// ── week overview interactions: tap = select, drag = scroll window ──────
// The strip follows the finger while dragging, rubber-bands when there's
// nothing further that way, glides out/in when the window shifts, and
// springs back on an aborted drag.
function tlBindWeek() {
  const wk = document.getElementById('tlm-week'); if (!wk) return;
  let down = false, sx = 0, moved = false, dx = 0;
  const blockedAt = d => (d > 0 && !TL._canPrev) || (d < 0 && !TL._canNext);
  const spring = () => {
    wk.style.transition = 'transform .22s cubic-bezier(.2,.7,.3,1)';
    wk.style.transform = 'translateX(0)';
  };
  wk.addEventListener('pointerdown', ev => {
    down = true; sx = ev.clientX; moved = false; dx = 0;
    wk.style.transition = 'none';
    try { wk.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  wk.addEventListener('pointermove', ev => {
    if (!down) return;
    dx = ev.clientX - sx;
    if (!moved && Math.abs(dx) > 8) moved = true;
    if (moved) wk.style.transform = 'translateX(' + (blockedAt(dx) ? dx * 0.28 : dx).toFixed(1) + 'px)';
  });
  wk.addEventListener('pointerup', ev => {
    if (!down) return; down = false;
    const r = wk.getBoundingClientRect();
    const colW = r.width / (TL.days.length || 7);
    if (moved && !blockedAt(dx) && Math.abs(dx) >= colW * 0.5) {
      // drag left → scroll ahead; clamped in tlBuild to the table's range
      const step = Math.max(1, Math.round(Math.abs(dx) / colW)) * (dx < 0 ? 1 : -1);
      const dir = dx < 0 ? 1 : -1;
      wk.style.transition = 'transform .13s ease-in, opacity .13s ease-in';
      wk.style.transform = 'translateX(' + (-dir * colW * 1.2).toFixed(1) + 'px)';
      wk.style.opacity = '0.35';
      setTimeout(() => {
        TL.startOff += step;
        const root = document.getElementById('timeline-root');
        if (!root || !tlBuild()) return;
        tlRenderAll(root);
        const nw = document.getElementById('tlm-week');
        if (!nw) return;
        nw.style.transition = 'none';
        nw.style.transform = 'translateX(' + (dir * colW * 1.2).toFixed(1) + 'px)';
        nw.style.opacity = '0.35';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          nw.style.transition = 'transform .2s cubic-bezier(.2,.7,.3,1), opacity .2s';
          nw.style.transform = 'translateX(0)';
          nw.style.opacity = '1';
        }));
      }, 130);
      return;
    }
    if (moved) { spring(); return; }
    // tap — on a label button or anywhere on the chart — selects that day
    const b = ev.target.closest('.tlm-wk-day');
    let di = b ? +b.dataset.di : Math.floor((ev.clientX - r.left) / colW);
    di = Math.max(0, Math.min(TL.days.length - 1, di));
    setSelectedDay(TL.days[di].date, { behavior: 'smooth' });
  });
  wk.addEventListener('pointercancel', () => { if (down) { down = false; spring(); } });
}

// ── secondary metrics ────────────────────────────────────────────────────
async function tlSecFetch() {
  if (state.lat == null || state.lon == null) return;
  const key = state.lat.toFixed(3) + ',' + state.lon.toFixed(3);
  if (TL.secKey === key) return;
  TL.secKey = key; TL.sec = null;
  try {
    const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + state.lat + '&longitude=' + state.lon
      + '&hourly=uv_index,relative_humidity_2m,surface_pressure,visibility,dew_point_2m&past_days=7&forecast_days=10&timezone=auto';
    const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    if (j && j.hourly && j.hourly.time) {
      const im = {}; j.hourly.time.forEach((t, i) => { im[t] = i; });
      TL.sec = { im, uv: j.hourly.uv_index, hum: j.hourly.relative_humidity_2m, pres: j.hourly.surface_pressure, vis: j.hourly.visibility, dew: j.hourly.dew_point_2m, aqi: null, aqiIm: null };
      tlSecRender();
    }
  } catch (e) { dbg('timeline: secondary fetch failed: ' + (e.message || e.name)); }
  try {
    const u2 = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + state.lat + '&longitude=' + state.lon
      + '&hourly=us_aqi&past_days=7&forecast_days=5&timezone=auto';
    const r2 = await fetch(u2, { signal: AbortSignal.timeout(15000) });
    const j2 = await r2.json();
    if (TL.sec && j2 && j2.hourly && j2.hourly.time) {
      const im2 = {}; j2.hourly.time.forEach((t, i) => { im2[t] = i; });
      TL.sec.aqi = j2.hourly.us_aqi; TL.sec.aqiIm = im2;
      tlSecRender();
    }
  } catch (e) {}
}
function tlSpark(vals) {
  const W = 120, H = 24;
  const good = vals.filter(v => v != null && !isNaN(v));
  if (good.length < 2) return '<svg class="tl-sec-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"></svg>';
  const mn = Math.min(...good), mx = Math.max(...good), rng = (mx - mn) || 1;
  const pts = [];
  vals.forEach((v, i) => { if (v == null || isNaN(v)) return; pts.push([(i / (vals.length - 1)) * W, H - 3 - ((v - mn) / rng) * (H - 6)]); });
  const d = tlPath(pts);
  return '<svg class="tl-sec-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">'
    + '<path d="' + d + '" fill="none" stroke="var(--text-muted,#93a6c0)" stroke-width="1.2" stroke-linecap="round" opacity="0.8" vector-effect="non-scaling-stroke"/></svg>';
}
function tlAqiWord(v) { return v == null ? '' : v <= 50 ? 'good' : v <= 100 ? 'moderate' : v <= 150 ? 'poor' : 'bad'; }
function tlSecRender() {
  const body = document.getElementById('tl-sec-body'); if (!body) return;
  if (!TL.sec) { body.innerHTML = ''; TL._secRows = null; return; }
  const d = TL.days[TL.sel]; if (!d) return;
  const refH = Math.max(0, Math.min(23, tlRefHour() - TL.sel * 24));
  const dayVals = (arr, im) => {
    const out = [];
    for (let h = 0; h < 24; h++) {
      const iso = d.date + 'T' + String(h).padStart(2, '0') + ':00';
      const i = im[iso]; out.push(i != null && arr && arr[i] != null ? arr[i] : null);
    }
    return out;
  };
  const S = TL.sec;
  const rows = [
    ['UV index', dayVals(S.uv, S.im), v => v.toFixed(0)],
    ['Humidity', dayVals(S.hum, S.im), v => Math.round(v) + '%'],
    ['Pressure', dayVals(S.pres, S.im), v => Math.round(v) + ' hPa'],
    ['Visibility', dayVals(S.vis, S.im).map(v => v != null ? v / 1000 : null), v => v.toFixed(0) + ' km'],
    ['Dew point', dayVals(S.dew, S.im), v => tempDisp(Math.round(v)) + '°'],
  ];
  if (S.aqi && S.aqiIm) rows.push(['Air quality', dayVals(S.aqi, S.aqiIm), v => Math.round(v) + ' ' + tlAqiWord(v)]);
  TL._secRows = rows.map(([name, vals, fmt]) => ({ name, vals, fmt }));
  const vis = tlNowVisible();
  const L = (tlNowFrac() * 100).toFixed(2) + '%';
  body.innerHTML = '<div class="tl-sec-grid">' + rows.map(([name, vals, fmt], i) => {
    const v = vals[refH];
    return '<div class="tl-sec-item"><div class="tl-sec-row"><span class="tl-sec-name">' + name + '</span>'
      + '<span class="tl-sec-val" id="tl-sec-val-' + i + '">' + (v != null ? fmt(v) : '—') + '</span></div>'
      + '<div class="tl-sec-sparkwrap">' + tlSpark(vals)
      + '<div class="tl-sec-now" style="left:' + L + ';display:' + (vis ? 'block' : 'none') + '"></div></div></div>';
  }).join('') + '</div>';
  // each item scrubs the shared hour (frac measured on its own spark width)
  body.querySelectorAll('.tl-sec-item').forEach(item => {
    tlBindScrubOn(item, item.querySelector('.tl-sec-sparkwrap'), false);
  });
}
// update secondary values in place for the current ref hour (while scrubbing)
function tlSecHeads() {
  if (!TL._secRows) return;
  const refH = Math.max(0, Math.min(23, tlRefHour() - TL.sel * 24));
  TL._secRows.forEach((r, i) => {
    const el = document.getElementById('tl-sec-val-' + i); if (!el) return;
    const v = r.vals[refH];
    el.textContent = v != null ? r.fmt(v) : '—';
  });
}
function tlSecHTML() {
  return '<button class="tl-sec-btn' + (TL.secOpen ? ' open' : '') + '" id="tl-sec-btn" type="button">'
    + '<span class="tl-sec-label">Secondary metrics</span>'
    + '<span class="tl-sec-chev"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg></span></button>'
    + '<div class="tl-sec-body' + (TL.secOpen ? ' open' : '') + '" id="tl-sec-body"></div>';
}

// ── day selection (with slide transition on the hourly section) ─────────
function tlSelect(i) {
  i = Math.max(0, Math.min(TL.days.length - 1, i));
  const dir = i > TL.sel ? 1 : i < TL.sel ? -1 : 0;
  TL.sel = i; selDate = TL.days[i].date; TL.scrubbing = false; TL.hourSel = tlDefaultHour();
  const wk = document.getElementById('tlm-week');
  if (wk) { wk.outerHTML = tlWeekHTML(); tlBindWeek(); }
  const hourEl = document.getElementById('tlm-hour');
  if (!hourEl) return;
  const swap = () => {
    hourEl.innerHTML = tlHourHTML();
    tlBindScrub(); tlHeads(); tlSecRender();
  };
  if (!dir) { swap(); return; }
  // slide out (continuing forward from any follow-drag offset), swap, slide in
  hourEl.style.transition = 'transform .13s ease-in, opacity .13s ease-in';
  hourEl.style.transform = 'translateX(' + (-dir * 64) + 'px)';
  hourEl.style.opacity = '0';
  setTimeout(() => {
    swap();
    hourEl.style.transition = 'none';
    hourEl.style.transform = 'translateX(' + (dir * 26) + 'px)';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      hourEl.style.transition = 'transform .18s ease, opacity .18s ease';
      hourEl.style.transform = 'translateX(0)';
      hourEl.style.opacity = '1';
    }));
  }, 130);
}
function tlBindScrub() {
  const ov = document.getElementById('tlm-overlay');
  tlBindScrubOn(ov, null, true);
  // hero + metric figures: same gesture surface as the sparklines — quick
  // flick changes day, hold-drag scrubs hours (x mapped to the chart grid)
  tlBindScrubOn(document.querySelector('#tlm-hour .tlm-hero'), ov, true);
}

// ── render root + wiring ────────────────────────────────────────────────
function tlRenderAll(root) {
  root.innerHTML = '<div class="tlm">' + tlWeekHTML()
    + '<div class="tlm-hour" id="tlm-hour">' + tlHourHTML() + '</div>'
    + tlSecHTML() + '</div>';
  tlBindWeek();
  const btn = document.getElementById('tl-sec-btn');
  if (btn) btn.addEventListener('click', () => {
    TL.secOpen = !TL.secOpen;
    btn.classList.toggle('open', TL.secOpen);
    document.getElementById('tl-sec-body').classList.toggle('open', TL.secOpen);
    if (TL.secOpen) tlSecRender();
  });
  tlBindScrub(); tlHeads(); tlSecRender();
}

// ── override the cards renderer + hook day selection ────────────────────
const _tlOrigRenderCurrentBar = renderCurrentBar;
renderCurrentBar = function () {
  const root = document.getElementById('timeline-root');
  if (!root) { _tlOrigRenderCurrentBar(); return; }
  if (!tlBuild()) { root.innerHTML = ''; return; }
  tlSecFetch();
  tlRenderAll(root);
  updateDateUI();
};
const _tlOrigSetSelectedDay = setSelectedDay;
setSelectedDay = function (date, opts) {
  _tlOrigSetSelectedDay(date, opts);
  const i = TL.days.findIndex(o => o.date === date);
  if (i >= 0 && document.getElementById('tlm-hour')) tlSelect(i);
};
dbg('timeline.js loaded — mono minimalist UI active');
