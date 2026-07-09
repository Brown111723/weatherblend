// ════════════════════════════════════════════════════════════════════════
// WeatherBlend — timeline.js  (mono minimalist UI)
// ════════════════════════════════════════════════════════════════════════
// Load order: engine.js → app.js → timeline.js.
// Replaces the cards UI with the monochrome, static-line redesign:
//   · condensed 7-day strip (icon + hi/lo + rain-if-any; selected = ink pill)
//   · hour section — hero temp + feels-like, then rain/wind/cloud
//     (icon · figure · confidence %) grouped at the right
//   · four static sparklines sharing one axis: icon · line (with a
//     confidence "shadow" band) · ceiling/floor, dimmed left of sunrise
//     and right of sunset, with sunrise/sunset times and a single
//     draggable NOW line (the one reserved colour: a dim red)
//   · secondary metrics (unchanged layout, mono palette)
// No animation — every value is a plain lookup. Honors Show/Confidence
// toggles and model/weighting changes via renderCurrentBar().
// ════════════════════════════════════════════════════════════════════════

const TL_NOW = '#a3392c';
const TL_ICOL = 26, TL_GAPX = 10, TL_RCOL = 56;   // sparkline grid columns
const TL_SVGW = 300, TL_SVGH = 40, TL_PAD = 3;

const TL = {
  days: [], n: 0, idx: [], temp: [], rain: [], wind: [], cloud: [],
  confH: { temp: [], rain: [], wind: [], cloud: [] }, dayConf: {},
  lanes: [], suns: [], streamT0: 0, nowH: null,
  sel: 0, frac: 0.5, startOff: 0, _canPrev: false, _canNext: false,
  sec: null, secKey: null, secOpen: false,
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
function tlClock(ms) { const d = new Date(ms); let h = d.getHours(); const m = d.getMinutes(); const ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12; return h + ':' + String(m).padStart(2, '0') + ap; }
function tlHourLabel(h) { const hh = ((Math.round(h) % 24) + 24) % 24; return hh === 0 ? '12am' : hh < 12 ? hh + 'am' : hh === 12 ? '12pm' : (hh - 12) + 'pm'; }
function tlEsc(s) { return String(s); }

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

// representative condition code for a day (from its own data)
function tlDayCode(di) {
  const s = di * 24; let rainSum = 0, cloudSum = 0, cn = 0;
  for (let h = s; h < s + 24; h++) { rainSum += TL.rain[h] || 0; if (TL.cloud[h] != null) { cloudSum += TL.cloud[h]; cn++; } }
  const cloud = cn ? cloudSum / cn : 0;
  if (rainSum >= 2) return 61; if (rainSum >= 0.3) return 80;
  if (cloud > 75) return 3; if (cloud > 40) return 2; if (cloud > 15) return 1; return 0;
}

// ── build 7-day streams from engine state (unchanged data model) ────────
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
  TL.idx = []; TL.temp = []; TL.rain = []; TL.wind = []; TL.cloud = [];
  ['temp', 'rain', 'wind', 'cloud'].forEach(k => TL.confH[k] = []);
  TL.dayConf = {};
  days.forEach(d => {
    TL.dayConf[d] = { temp: confDayMetric(d, 'temp'), rain: confDayMetric(d, 'rain'), wind: confDayMetric(d, 'wind'), cloud: confDayMetric(d, 'cloud') };
    for (let h = 0; h < 24; h++) {
      const iso = d + 'T' + String(h).padStart(2, '0') + ':00';
      const idx = im[iso]; TL.idx.push(idx != null ? idx : null);
      const td = idx != null ? hourTileData(iso) : null;
      TL.temp.push(td && td.temp != null ? td.temp : null);
      TL.rain.push(td && td.rain != null ? _rcell(td.rain) : null);
      TL.wind.push(td && td.wind != null ? td.wind : null);
      TL.cloud.push(td && td.cloud != null ? td.cloud : null);
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
  TL.frac = tlDefaultFrac();
  return true;
}
function tlDefaultFrac() {
  const d = TL.days[TL.sel];
  if (d && d.isToday && TL.nowH != null) return Math.max(0, Math.min(1, (TL.nowH - TL.sel * 24) / 24));
  return 0.54;
}
function tlRefHour() { return Math.max(TL.sel * 24, Math.min(TL.sel * 24 + 23, TL.sel * 24 + Math.round(TL.frac * 23))); }
function tlDayRange(arr) { const s = TL.sel * 24; let hi = null, lo = null; for (let k = s; k < s + 24; k++) { const v = arr[k]; if (v == null) continue; hi = hi == null ? v : Math.max(hi, v); lo = lo == null ? v : Math.min(lo, v); } return [hi, lo]; }

// ── daily strip ─────────────────────────────────────────────────────────
function tlStripHTML() {
  return '<div class="tlm-strip" id="tlm-strip">' + TL.days.map((d, i) => {
    const sel = i === TL.sel;
    const s = i * 24; let hi = null, lo = null, rt = 0;
    for (let k = s; k < s + 24; k++) { const v = TL.temp[k]; if (v != null) { hi = hi == null ? v : Math.max(hi, v); lo = lo == null ? v : Math.min(lo, v); } const r = TL.rain[k]; if (r) rt += r; }
    const rainTxt = rt >= 0.1 ? (rt >= 10 ? Math.round(rt) : rt.toFixed(1)) + 'mm' : '';
    return '<button type="button" class="tlm-day' + (sel ? ' sel' : '') + '" data-di="' + i + '">'
      + '<span class="tlm-dow">' + (d.isToday ? 'Today' : d.dow) + '</span>'
      + '<span class="tlm-hilo">' + (hi != null ? tempDisp(Math.round(hi)) : '—') + '° <span class="tlm-lo">' + (lo != null ? tempDisp(Math.round(lo)) + '°' : '') + '</span></span>'
      + '<span class="tlm-rain">' + rainTxt + '</span>'
      + '</button>';
  }).join('') + '</div>';
}

// ── hour section: hero + 3 metrics + sparklines + axis ──────────────────
function tlLaneMeta() {
  return {
    temp: { label: 'Temp', arr: TL.temp, fmt: v => tempDisp(v) + '°' },
    rain: { label: 'Rain', arr: TL.rain, fmt: v => (v < 0.05 ? '0' : v.toFixed(1)) },
    wind: { label: 'Wind', arr: TL.wind, fmt: v => Math.round(v) },
    cloud: { label: 'Cloud', arr: TL.cloud, fmt: v => Math.round(v) + '%' },
  };
}
function tlSparkSVG(m) {
  const s = TL.sel * 24;
  const vals = []; for (let h = 0; h < 24; h++) vals.push(TL[m][s + h]);
  const good = vals.map((v, i) => [i, v]).filter(p => p[1] != null && !isNaN(p[1]));
  if (good.length < 2) return '<svg viewBox="0 0 ' + TL_SVGW + ' ' + TL_SVGH + '" width="100%" height="' + TL_SVGH + '" style="display:block"></svg>';
  const gv = good.map(p => p[1]); const mn = Math.min(...gv), mx = Math.max(...gv), span = (mx - mn) || 1;
  const XY = i => [(i / 23) * TL_SVGW, TL_SVGH - TL_PAD - ((vals[i] - mn) / span) * (TL_SVGH - TL_PAD * 2)];
  const pts = good.map(([i]) => XY(i));
  const line = tlPath(pts);
  // per-hour confidence "shadow": a ribbon whose half-thickness grows as
  // that hour's model agreement (the table's confidence figure) drops.
  const MAXW = 7;
  const top = [], bot = [];
  good.forEach(([i]) => {
    const [x, y] = XY(i);
    const c = TL.confH[m][s + i]; const cv = c != null ? c : 100;
    const hw = (1 - cv / 100) * MAXW;
    top.push([x, y - hw]); bot.push([x, y + hw]);
  });
  const ribbon = tlPath(top) + ' L ' + bot[bot.length - 1][0].toFixed(1) + ' ' + bot[bot.length - 1][1].toFixed(1)
    + ' ' + tlPath(bot.slice().reverse()).slice(1) + ' Z';
  // night mask: full opacity between sunrise and sunset, dimmed outside —
  // line WIDTH stays constant across the whole day, only opacity changes.
  const { rise, set } = tlSunFrac();
  const r1 = Math.max(0, rise * 100 - 0.6), r2 = Math.min(100, rise * 100 + 0.6);
  const s1 = Math.max(0, set * 100 - 0.6), s2 = Math.min(100, set * 100 + 0.6);
  const gid = 'tlmN_' + m;
  return '<svg viewBox="0 0 ' + TL_SVGW + ' ' + TL_SVGH + '" width="100%" height="' + TL_SVGH + '" style="display:block;overflow:visible">'
    + '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="0">'
    + '<stop offset="0%" stop-color="#fff" stop-opacity="0.3"/>'
    + '<stop offset="' + r1.toFixed(1) + '%" stop-color="#fff" stop-opacity="0.3"/>'
    + '<stop offset="' + r2.toFixed(1) + '%" stop-color="#fff" stop-opacity="1"/>'
    + '<stop offset="' + s1.toFixed(1) + '%" stop-color="#fff" stop-opacity="1"/>'
    + '<stop offset="' + s2.toFixed(1) + '%" stop-color="#fff" stop-opacity="0.3"/>'
    + '<stop offset="100%" stop-color="#fff" stop-opacity="0.3"/>'
    + '</linearGradient><mask id="m' + gid + '"><rect width="' + TL_SVGW + '" height="' + TL_SVGH + '" fill="url(#' + gid + ')"/></mask></defs>'
    + '<g mask="url(#m' + gid + ')">'
    + '<path d="' + ribbon + '" fill="var(--text-primary,#141311)" stroke="none" opacity="0.15"/>'
    + '<path d="' + line + '" fill="none" stroke="var(--text-primary,#141311)" stroke-width="1.6" stroke-linecap="round" opacity="0.92"/>'
    + '</g></svg>';
}
function tlLaneCeilFloor(m) {
  const meta = tlLaneMeta()[m];
  const [hi, lo] = tlDayRange(TL[m]);
  const hiT = m === 'rain' ? (hi != null && hi > 0 ? hi.toFixed(1) : '0.0') : (hi != null ? meta.fmt(hi) : '');
  const loT = m === 'rain' ? '0.0' : (lo != null ? meta.fmt(lo) : '');
  return '<span class="tlm-ceil">' + hiT + '</span><span class="tlm-floor">' + loT + '</span>';
}
function tlHourHTML() {
  const IC = { temp: MI_TEMP, rain: MI_RAIN, wind: MI_WIND, cloud: MI_CLOUD };
  const sideM = TL.lanes.filter(m => m !== 'temp');
  const meta = tlLaneMeta();

  // hero + 3 metrics (values filled by tlHeads); icon sits with its figure
  let hero = '<div class="tlm-hero">'
    + '<div class="tlm-hero-l"><div class="tlm-temp" id="tlm-temp">—</div><div class="tlm-feels" id="tlm-feels"></div></div>'
    + '<div class="tlm-metrics">'
    + sideM.map(m =>
      '<div class="tlm-metric"><span class="tlm-mic">' + IC[m] + '</span>'
      + '<span class="tlm-mfig" id="tlm-fig-' + m + '"></span>'
      + '<span class="tlm-mconf" id="tlm-conf-' + m + '"></span></div>').join('')
    + '</div></div>';

  // sparkline lanes
  let lanes = '<div class="tlm-lanes">' + TL.lanes.map(m =>
    '<div class="tlm-lane"><span class="tlm-lic">' + IC[m] + '</span>'
    + '<span class="tlm-lspark">' + tlSparkSVG(m) + '</span>'
    + '<span class="tlm-lscale">' + tlLaneCeilFloor(m) + '</span></div>').join('') + '</div>';

  // overlay: draggable NOW line only (sunrise/sunset shown by the dimming)
  const overlay = '<div class="tlm-overlay" id="tlm-overlay">'
    + '<div class="tlm-now" id="tlm-now" style="left:' + (TL.frac * 100).toFixed(1) + '%"></div>'
    + '<div class="tlm-nowlab" id="tlm-nowlab" style="left:' + (TL.frac * 100).toFixed(1) + '%"></div>'
    + '</div>';

  // axis: sunrise / sunset times
  const sun = tlSunFrac();
  const rise = sun.rise, set = sun.set;
  const axis = '<div class="tlm-axis"><span class="tlm-axpad"></span><div class="tlm-axtrack">'
    + (sun.riseMs ? '<span class="tlm-suntime" style="left:' + (rise * 100).toFixed(1) + '%">' + wxIcon(0, false, null) + '<b>' + tlClock(sun.riseMs) + '</b></span>' : '')
    + (sun.setMs ? '<span class="tlm-suntime" style="left:' + (set * 100).toFixed(1) + '%">' + wxIcon(0, true, null) + '<b>' + tlClock(sun.setMs) + '</b></span>' : '')
    + '</div><span class="tlm-axpad-r"></span></div>';

  return hero + '<div class="tlm-chart">' + lanes + overlay + '</div>' + axis;
}

// fill hero + metric + right-column figures for the current ref hour
function tlHeads() {
  const d = TL.days[TL.sel]; if (!d) return;
  const h = tlRefHour();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerHTML = v; };
  const meta = tlLaneMeta();
  // temp + feels
  const t = TL.temp[h];
  let feels = null;
  if (d.isToday && Math.round(TL.frac * 23) === Math.round((TL.nowH - TL.sel * 24)) && cachedCurrent && cachedCurrent.c && cachedCurrent.c.apparent_temperature != null) feels = cachedCurrent.c.apparent_temperature;
  else if (t != null && TL.wind[h] != null) feels = t - TL.wind[h] * 0.11;
  set('tlm-temp', t != null ? tempDisp(t) + '°' : '—');
  set('tlm-feels', feels != null ? 'Feels like ' + tempDisp(feels) + '°' : '');
  // side metrics — match the table's cell formatting exactly
  const figFor = {
    rain: (TL.rain[h] == null ? '—' : TL.rain[h] < 0.05 ? '0' : TL.rain[h].toFixed(1)) + ' mm',
    wind: (TL.wind[h] != null ? Math.round(TL.wind[h]) : '—') + ' km/h',
    cloud: (TL.cloud[h] != null ? Math.round(TL.cloud[h]) : '—') + '%',
  };
  ['rain', 'wind', 'cloud'].forEach(m => {
    set('tlm-fig-' + m, figFor[m]);
    const c = TL.dayConf[d.date][m];
    set('tlm-conf-' + m, (confVisible[m] !== false && c != null) ? c + '%' : '');
  });
  // now label
  const lab = document.getElementById('tlm-nowlab');
  if (lab) lab.textContent = tlClock(TL.streamT0 + (TL.sel * 24 + TL.frac * 24) * 3600000);
}

// ── drag the now line to scrub ──────────────────────────────────────────
function tlBindScrub() {
  const ov = document.getElementById('tlm-overlay'); if (!ov) return;
  let active = false;
  const setFrom = ev => {
    const r = ov.getBoundingClientRect();
    TL.frac = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    const now = document.getElementById('tlm-now'), lab = document.getElementById('tlm-nowlab');
    if (now) now.style.left = (TL.frac * 100).toFixed(1) + '%';
    if (lab) lab.style.left = (TL.frac * 100).toFixed(1) + '%';
    tlHeads();
  };
  ov.addEventListener('pointerdown', ev => { active = true; try { ov.setPointerCapture(ev.pointerId); } catch (e) {} setFrom(ev); });
  ov.addEventListener('pointermove', ev => { if (active) setFrom(ev); });
  // on release, snap the NOW line back to the live current time
  const end = () => {
    if (!active) return; active = false;
    TL.frac = tlDefaultFrac();
    const now = document.getElementById('tlm-now'), lab = document.getElementById('tlm-nowlab');
    if (now) now.style.left = (TL.frac * 100).toFixed(1) + '%';
    if (lab) lab.style.left = (TL.frac * 100).toFixed(1) + '%';
    tlHeads(); tlSecRender();
  };
  ov.addEventListener('pointerup', end); ov.addEventListener('pointercancel', end);
}

// ── secondary metrics (unchanged layout) ────────────────────────────────
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
  const W = 170, H = 26;
  const good = vals.filter(v => v != null && !isNaN(v));
  if (good.length < 2) return '<svg viewBox="0 0 ' + W + ' ' + H + '" height="' + H + '"></svg>';
  const mn = Math.min(...good), mx = Math.max(...good), rng = (mx - mn) || 1;
  const pts = [];
  vals.forEach((v, i) => { if (v == null || isNaN(v)) return; pts.push([(i / (vals.length - 1)) * W, H - 3 - ((v - mn) / rng) * (H - 6)]); });
  const d = tlPath(pts);
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" height="' + H + '" preserveAspectRatio="none">'
    + '<path d="' + d + '" fill="none" stroke="var(--text-muted,#6f6c64)" stroke-width="3.5" opacity="0.12"/>'
    + '<path d="' + d + '" fill="none" stroke="var(--text-muted,#6f6c64)" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/></svg>';
}
function tlAqiWord(v) { return v == null ? '' : v <= 50 ? 'good' : v <= 100 ? 'moderate' : v <= 150 ? 'poor' : 'bad'; }
function tlSecRender() {
  const body = document.getElementById('tl-sec-body'); if (!body) return;
  if (!TL.sec) { body.innerHTML = ''; return; }
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
  body.innerHTML = '<div class="tl-sec-grid">' + rows.map(([name, vals, fmt]) => {
    const v = vals[refH];
    return '<div class="tl-sec-item"><div class="tl-sec-row"><span class="tl-sec-name">' + name + '</span>'
      + '<span class="tl-sec-val">' + (v != null ? fmt(v) : '—') + '</span></div>' + tlSpark(vals) + '</div>';
  }).join('') + '</div>';
}
function tlSecHTML() {
  return '<button class="tl-sec-btn' + (TL.secOpen ? ' open' : '') + '" id="tl-sec-btn" type="button">'
    + '<span class="tl-sec-label">Secondary metrics</span>'
    + '<span class="tl-sec-chev"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg></span></button>'
    + '<div class="tl-sec-body' + (TL.secOpen ? ' open' : '') + '" id="tl-sec-body"></div>';
}

// ── day selection ───────────────────────────────────────────────────────
function tlSelect(i) {
  i = Math.max(0, Math.min(TL.days.length - 1, i));
  TL.sel = i; selDate = TL.days[i].date; TL.frac = tlDefaultFrac();
  const hourEl = document.getElementById('tlm-hour');
  if (hourEl) hourEl.innerHTML = tlHourHTML();
  const strip = document.getElementById('tlm-strip');
  if (strip) [...strip.children].forEach((el, k) => el.classList.toggle('sel', k === i));
  tlBindScrub(); tlHeads(); tlSecRender();
}

// ── render root + wiring ────────────────────────────────────────────────
function tlRenderAll(root) {
  root.innerHTML = '<div class="tlm">' + tlStripHTML()
    + '<div class="tlm-hour" id="tlm-hour">' + tlHourHTML() + '</div>'
    + tlSecHTML() + '</div>';
  const strip = document.getElementById('tlm-strip');
  if (strip) strip.addEventListener('click', ev => {
    const b = ev.target.closest('.tlm-day'); if (!b) return;
    const i = +b.dataset.di;
    setSelectedDay(TL.days[i].date, { behavior: 'smooth' });
  });
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
