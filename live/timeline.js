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
// light smoothing (weighted 3-pt moving average, run twice) for a calmer line
function tlClock(ms) { const d = new Date(ms); let h = d.getHours(); const m = d.getMinutes(); const ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12; return h + ':' + String(m).padStart(2, '0') + ap; }

// ── colour canvas ───────────────────────────────────────────────────────
// Temperature drives a cold-blue → hot-red ramp that deliberately passes
// through the quatrefoil's lime and gold on the way, so mild days land on
// colours the rest of the app already uses. Rain and cloud are painted over
// the top as veils rather than hues, so they never fight cold temperatures.
const TL_TRAMP = [
  [-10, '#3B5BD9'], [0, '#4A8FE0'], [5, '#4EC8D6'], [10, '#5FD6A8'],
  [15, '#A8E63E'], [20, '#DCE04A'], [25, '#FFC95E'], [30, '#FFA24E'],
  [35, '#FF6B4E'], [42, '#E8402E']
];
const TL_ARAMP = [
  [0, '#2E4A3A'], [25, '#4ED6A0'], [50, '#A8E63E'], [100, '#FFD75E'],
  [150, '#FFA24E'], [200, '#FF5E7A']
];
const TL_URAMP = [
  [0, '#2E4A3A'], [2, '#4ED6A0'], [5, '#A8E63E'], [7, '#FFD75E'],
  [9, '#FFA24E'], [12, '#FF5E7A']
];
function tlHex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function tlMix(a, b, t) { return [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * Math.max(0, Math.min(1, t))); }
function tlRgb(c) { return 'rgb(' + c.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(',') + ')'; }
function tlRampRgb(v, ramp) {
  if (v == null || isNaN(v)) return tlHex('#161C28');
  if (v <= ramp[0][0]) return tlHex(ramp[0][1]);
  const last = ramp[ramp.length - 1];
  if (v >= last[0]) return tlHex(last[1]);
  for (let i = 0; i < ramp.length - 1; i++) {
    if (v >= ramp[i][0] && v <= ramp[i + 1][0]) {
      const t = (v - ramp[i][0]) / (ramp[i + 1][0] - ramp[i][0]);
      return tlMix(tlHex(ramp[i][1]), tlHex(ramp[i + 1][1]), t);
    }
  }
  return tlHex('#161C28');
}
function tlRampColor(v, ramp) { return tlRgb(tlRampRgb(v, ramp)); }
function tlTempColor(v) { return tlRgb(tlRampRgb(v, TL_TRAMP)); }

// The blended view — one colour per hour rather than stacked translucent
// veils, which turned every warm overcast day the same shade of pink.
// The grammar: vivid means clear, grey means overcast, deep blue and dark
// means wet, and a green lift means windy.
const TL_GREY = [132, 142, 163], TL_WET = [38, 72, 205], TL_DEEP = [7, 13, 40], TL_GUSTY = [168, 230, 62];
function tlBlendColor(t, r, c, w) {
  let col = tlRampRgb(t, TL_TRAMP);
  if (c != null && !isNaN(c)) col = tlMix(col, TL_GREY, 0.46 * Math.min(1, c / 100));
  if (r != null && !isNaN(r) && r >= 0.05) {
    const f = Math.min(1, 0.18 + 0.82 * Math.log1p(r) / Math.log1p(6));
    col = tlMix(col, TL_WET, 0.88 * f);
    col = tlMix(col, TL_DEEP, 0.32 * f);
  }
  if (w != null && !isNaN(w)) col = tlMix(col, TL_GUSTY, 0.16 * Math.min(1, Math.max(0, (w - 15) / 45)));
  return tlRgb(col);
}
function tlAlphaVeil(hex, lo, hi) {
  const rgb = tlHex(hex).join(',');
  const span = (hi - lo) || 1;
  return v => {
    if (v == null || isNaN(v)) return 'rgba(' + rgb + ',0)';
    const t = Math.max(0, Math.min(1, (v - lo) / span));
    return 'rgba(' + rgb + ',' + (0.10 + 0.85 * t).toFixed(3) + ')';
  };
}
// nulls are bridged so the wash stays continuous across gaps in the data
function tlGrad(vals, colorFn) {
  const n = vals.length; if (!n) return 'none';
  const f = vals.slice();
  for (let i = 0; i < n; i++) {
    if (f[i] != null && !isNaN(f[i])) continue;
    let a = null, b = null;
    for (let k = i - 1; k >= 0; k--) if (f[k] != null && !isNaN(f[k])) { a = f[k]; break; }
    for (let k = i + 1; k < n; k++) if (vals[k] != null && !isNaN(vals[k])) { b = vals[k]; break; }
    f[i] = (a != null && b != null) ? (a + b) / 2 : (a != null ? a : b);
  }
  const stops = [];
  for (let i = 0; i < n; i++) stops.push(colorFn(f[i]) + ' ' + ((i / (n - 1)) * 100).toFixed(2) + '%');
  return 'linear-gradient(90deg,' + stops.join(',') + ')';
}
function tlNightGrad(rise, set) {
  const D = 'rgba(4,7,14,.50)', C = 'rgba(4,7,14,0)';
  const r = Math.max(0, Math.min(1, rise)) * 100, s = Math.max(0, Math.min(1, set)) * 100;
  return 'linear-gradient(90deg,' + D + ' 0%,' + D + ' ' + Math.max(0, r - 5).toFixed(1) + '%,'
    + C + ' ' + Math.min(100, r + 4).toFixed(1) + '%,' + C + ' ' + Math.max(0, s - 4).toFixed(1) + '%,'
    + D + ' ' + Math.min(100, s + 5).toFixed(1) + '%,' + D + ' 100%)';
}

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

// ── week overview: one continuous painting across the whole window ──────
function tlWeekHTML() {
  const n = TL.n || 168;
  const colorAt = i => tlBlendColor(TL.temp[i], TL.rain[i], TL.cloud[i], TL.wind[i]);
  const stops = [];
  for (let i = 0; i < n; i++) stops.push(colorAt(i) + ' ' + ((i / (n - 1)) * 100).toFixed(2) + '%');
  const grad = 'linear-gradient(90deg,' + stops.join(',') + ')';
  const colW = 100 / (TL.days.length || 7);
  const seps = TL.days.map((d, i) => i === 0 ? ''
    : '<div class="tlm-wk-sep" style="left:' + (i * colW).toFixed(3) + '%"></div>').join('');
  const sel = '<div class="tlm-wk-sel" style="left:' + (TL.sel * colW).toFixed(3) + '%;width:' + colW.toFixed(3) + '%"></div>';
  const now = (TL.nowH != null && TL.nowH >= 0 && TL.nowH <= n)
    ? '<div class="tlm-wk-now" style="left:' + ((TL.nowH / n) * 100).toFixed(3) + '%"></div>' : '';
  const canvas = '<div class="tlm-wk-canvas">'
    + '<div class="tlm-lay" style="background:' + grad + '"></div>'
    + seps + sel + now + '</div>';
  const labels = '<div class="tlm-wk-labels">' + TL.days.map((d, i) =>
    '<button type="button" class="tlm-wk-day' + (i === TL.sel ? ' sel' : '') + '" data-di="' + i + '">'
    + '<span class="tlm-wk-dow">' + (d.isToday ? 'TODAY' : d.dow.toUpperCase()) + '</span></button>').join('') + '</div>';
  return '<div class="tlm-week" id="tlm-week">' + canvas + labels + '</div>';
}

// ── hour section: one equal band per metric ─────────────────────────────
// Each metric is painted across the 24 hours on its own fixed scale, so
// bands are comparable day to day, and carries its own figure inside. The
// forecast-vs-observed comparison lives in the accuracy panel now.
const TL_BANDS = [
  { key: 'temp', name: 'Temp' }, { key: 'rain', name: 'Rain' },
  { key: 'wind', name: 'Wind' }, { key: 'cloud', name: 'Cloud' }
];
function tlRainBand(v) {
  const a = (v == null || v < 0.05) ? 0 : Math.min(0.95, 0.22 + 0.73 * Math.log1p(v) / Math.log1p(8));
  return 'rgba(95,164,255,' + a.toFixed(3) + ')';
}
function tlBandGrad(key, arr) {
  if (key === 'temp') return tlGrad(arr, tlTempColor);
  if (key === 'rain') return tlGrad(arr, tlRainBand);
  if (key === 'wind') return tlGrad(arr, tlAlphaVeil('#A8E63E', 0, 60));
  return tlGrad(arr, tlAlphaVeil('#C8A6FF', 0, 100));
}
function tlBandsHTML() {
  const s = TL.sel * 24;
  const data = { temp: [], rain: [], wind: [], cloud: [] };
  for (let h = 0; h < 24; h++) {
    data.temp.push(TL.temp[s + h]); data.rain.push(TL.rain[s + h]);
    data.wind.push(TL.wind[s + h]); data.cloud.push(TL.cloud[s + h]);
  }
  const sun = tlSunFrac();
  const night = tlNightGrad(sun.rise, sun.set);
  const lanes = TL_BANDS.filter(b => TL.lanes.indexOf(b.key) >= 0);
  return '<div class="tlm-bands">' + lanes.map(b => {
    const val = b.key === 'temp'
      ? '<span class="tlm-mfig" id="tlm-temp">\u2014</span><span class="tlm-msub" id="tlm-feels"></span>'
      : '<span class="tlm-mfig" id="tlm-fig-' + b.key + '"></span><span class="tlm-mconf" id="tlm-conf-' + b.key + '"></span>';
    return '<div class="tlm-mband">'
      + '<div class="tlm-lay" style="background:' + tlBandGrad(b.key, data[b.key]) + '"></div>'
      + '<div class="tlm-lay" style="background:' + night + '"></div>'
      + '<div class="tlm-mscrim"></div>'
      + '<span class="tlm-mname tlm-ic-' + b.key + '">' + b.name + '</span>'
      + '<span class="tlm-mval">' + val + '</span>'
      + '</div>';
  }).join('') + '</div>';
}

function tlHourHTML() {
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
    + '<div class="tlm-nowlab" id="tlm-nowlab" style="left:' + L + ';display:' + (vis ? 'block' : 'none') + '"></div>'
    + '</div>';

  return axis + '<div class="tlm-chart">' + tlBandsHTML() + overlay + '</div>';
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
// Secondary metrics get the same treatment: a band rather than a line.
// Dew point borrows the temperature ramp and UV its own low-to-extreme
// ramp; everything else scales its own colour across the day's range.
function tlSecBand(vals, kind, hex) {
  const good = vals.filter(v => v != null && !isNaN(v));
  if (!good.length) return '<div class="tl-sec-band"></div>';
  let fn;
  if (kind === 'dew') fn = tlTempColor;
  else if (kind === 'uv') fn = v => tlRampColor(v, TL_URAMP);
  else if (kind === 'aqi') fn = v => tlRampColor(v, TL_ARAMP);
  else if (kind === 'fix0100') fn = tlAlphaVeil(hex, 0, 100);
  else {
    const mn = Math.min(...good), mx = Math.max(...good);
    fn = tlAlphaVeil(hex, mn, mx === mn ? mn + 1 : mx);
  }
  return '<div class="tl-sec-band"><div class="tlm-lay" style="background:' + tlGrad(vals, fn) + '"></div></div>';
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
    ['UV index', dayVals(S.uv, S.im), v => v.toFixed(0), 'uv', '#FFD75E'],
    ['Humidity', dayVals(S.hum, S.im), v => Math.round(v) + '%', 'fix0100', '#4ED6B8'],
    ['Pressure', dayVals(S.pres, S.im), v => Math.round(v) + ' hPa', 'lin', '#F09AD0'],
    ['Visibility', dayVals(S.vis, S.im).map(v => v != null ? v / 1000 : null), v => v.toFixed(0) + ' km', 'lin', '#BFE8FF'],
    ['Dew point', dayVals(S.dew, S.im), v => tempDisp(Math.round(v)) + '°', 'dew', '#4EC8D6'],
  ];
  if (S.aqi && S.aqiIm) rows.push(['Air quality', dayVals(S.aqi, S.aqiIm), v => Math.round(v) + ' ' + tlAqiWord(v), 'aqi', '#A8E63E']);
  TL._secRows = rows.map(([name, vals, fmt]) => ({ name, vals, fmt }));
  const vis = tlNowVisible();
  const L = (tlNowFrac() * 100).toFixed(2) + '%';
  body.innerHTML = '<div class="tl-sec-grid">' + rows.map(([name, vals, fmt, kind, hex], i) => {
    const v = vals[refH];
    return '<div class="tl-sec-item"><div class="tl-sec-row"><span class="tl-sec-name">' + name + '</span>'
      + '<span class="tl-sec-val" id="tl-sec-val-' + i + '">' + (v != null ? fmt(v) : '—') + '</span></div>'
      + '<div class="tl-sec-sparkwrap">' + tlSecBand(vals, kind, hex)
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
