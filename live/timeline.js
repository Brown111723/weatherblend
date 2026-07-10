// ════════════════════════════════════════════════════════════════════════
// WeatherBlend — timeline.js  (mono minimalist UI)
// ════════════════════════════════════════════════════════════════════════
// Load order: engine.js → app.js → timeline.js.
// Replaces the cards UI with the monochrome redesign:
//   · compressed week overview — flowing temp line + rain bars, DOW labels,
//     selected day boxed, red NOW line on today; tap either the chart or a
//     label to select, drag/swipe horizontally to scroll the window across
//     the full table range (≈7 days back, 10 ahead)
//   · hour section — hero temp + feels-like; rain (day total, hourly while
//     scrubbing) / wind + cardinal / cloud figures; sunrise/sunset times on
//     the top axis line shared with the NOW time label
//   · four static sparklines on one hour grid: consistent line weight all
//     day, night shown by a dimmed BACKGROUND band before sunrise / after
//     sunset; per-hour confidence as a soft blurred ribbon; rain as bars;
//     cloud fixed to a 0–100% scale
//   · one red NOW line: exact current time when idle (today only),
//     hour-snapped while scrubbing; slow drag scrubs, quick flick slides
//     to the next/prev day with a slide transition
//   · secondary metrics — same NOW line, scrubbable, figures track the
//     scrub hour like the main metrics
// Geometry is fraction-based on a fixed 0..23 hour grid, so the scrub
// position matches the sparklines identically on mobile and desktop.
// Honors Show/Confidence toggles and model changes via renderCurrentBar().
// ════════════════════════════════════════════════════════════════════════

const TL_NOW = '#a3392c';
const TL_SVGW = 480, TL_SVGH = 40, TL_PAD = 4;    // hour-lane svg (fraction grid)
const TL_WKW = 700, TL_WKH = 38;                  // week-overview svg (compressed)
const TL_RAIN_CEIL_MIN = 0.5;                     // rain lane ceiling floor

const TL = {
  days: [], n: 0, idx: [], temp: [], rain: [], wind: [], cloud: [], wdir: [],
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
  ['temp', 'rain', 'wind', 'cloud'].forEach(k => TL.confH[k] = []);
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
  if (d && d.isToday && TL.nowH != null) return Math.max(0, Math.min(23, Math.round(TL.nowH - TL.sel * 24)));
  if (TL.nowH != null) return ((Math.round(TL.nowH) % 24) + 24) % 24;
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
    return '<rect x="' + (X(gi + 0.5) - bw / 2).toFixed(1) + '" y="' + (rBase - hgt).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hgt.toFixed(1) + '" fill="var(--text-muted,#6f6c64)" opacity="0.5"/>';
  }).join('');
  const colW = W / TL.days.length;
  const selBox = '<rect x="' + (TL.sel * colW + 1).toFixed(1) + '" y="1.5" width="' + (colW - 2).toFixed(1) + '" height="' + (H - 3).toFixed(1) + '" rx="5" fill="none" stroke="var(--text-primary,#141311)" stroke-width="1.3"/>';
  const seps = TL.days.map((d, i) => i === 0 ? '' : '<line x1="' + (i * colW).toFixed(1) + '" y1="3" x2="' + (i * colW).toFixed(1) + '" y2="' + (H - 3) + '" stroke="var(--border,#dedad0)" stroke-width="1"/>').join('');
  const now = (TL.nowH != null && TL.nowH >= 0 && TL.nowH <= n)
    ? '<line x1="' + X(TL.nowH).toFixed(1) + '" y1="2" x2="' + X(TL.nowH).toFixed(1) + '" y2="' + (H - 2) + '" stroke="' + TL_NOW + '" stroke-width="1.4"/>' : '';
  const svg = '<svg class="tlm-wk-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" preserveAspectRatio="none">'
    + seps + '<path d="' + line + '" fill="none" stroke="var(--text-primary,#141311)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>'
    + bars + selBox + now + '</svg>';
  const labels = '<div class="tlm-wk-labels">' + TL.days.map((d, i) =>
    '<button type="button" class="tlm-wk-day' + (i === TL.sel ? ' sel' : '') + '" data-di="' + i + '">'
    + '<span class="tlm-wk-dow">' + (d.isToday ? 'TODAY' : d.dow.toUpperCase()) + '</span></button>').join('') + '</div>';
  return '<div class="tlm-week" id="tlm-week">' + svg + labels + '</div>';
}

// ── hour section: hero + 3 metrics + top axis + sparklines ──────────────
function tlLaneMeta() {
  return {
    temp: { label: 'Temp', arr: TL.temp, fmt: v => tempDisp(v) + '°' },
    rain: { label: 'Rain', arr: TL.rain, fmt: v => (v < 0.05 ? '0' : v.toFixed(1)) },
    wind: { label: 'Wind', arr: TL.wind, fmt: v => Math.round(v) },
    cloud: { label: 'Cloud', arr: TL.cloud, fmt: v => Math.round(v) + '%' },
  };
}
function tlLineSparkSVG(m) {
  const s = TL.sel * 24;
  const vals = []; for (let h = 0; h < 24; h++) vals.push(TL[m][s + h]);
  const good = vals.map((v, i) => [i, v]).filter(p => p[1] != null && !isNaN(p[1]));
  if (good.length < 2) return '<svg viewBox="0 0 ' + TL_SVGW + ' ' + TL_SVGH + '" width="100%" height="' + TL_SVGH + '" style="display:block"></svg>';
  const gv = good.map(p => p[1]);
  // cloud is always drawn on a fixed 0–100% scale
  const mn = m === 'cloud' ? 0 : Math.min(...gv);
  const mx = m === 'cloud' ? 100 : Math.max(...gv);
  const span = (mx - mn) || 1;
  const disp = m === 'temp' ? tlSmooth(vals) : vals;
  const XY = i => [(i / 23) * TL_SVGW, TL_SVGH - TL_PAD - (((disp[i] != null ? disp[i] : vals[i]) - mn) / span) * (TL_SVGH - TL_PAD * 2)];
  const pts = good.map(([i]) => XY(i));
  const line = tlPath(pts);
  const MAXW = 6.5;
  const top = [], bot = [];
  good.forEach(([i]) => {
    const [x, y] = XY(i);
    const c = TL.confH[m][s + i]; const cv = c != null ? c : 100;
    const hw = 1 + (1 - cv / 100) * MAXW;
    top.push([x, y - hw]); bot.push([x, y + hw]);
  });
  const ribbon = tlPath(top) + ' L ' + bot[bot.length - 1][0].toFixed(1) + ' ' + bot[bot.length - 1][1].toFixed(1)
    + ' ' + tlPath(bot.slice().reverse()).slice(1) + ' Z';
  const fid = 'tlmB_' + m;
  return '<svg viewBox="0 0 ' + TL_SVGW + ' ' + TL_SVGH + '" width="100%" height="' + TL_SVGH + '" style="display:block;overflow:visible">'
    + '<defs><filter id="' + fid + '" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="2.4"/></filter></defs>'
    + '<path d="' + ribbon + '" fill="var(--text-primary,#141311)" stroke="none" opacity="0.16" filter="url(#' + fid + ')"/>'
    + '<path d="' + line + '" fill="none" stroke="var(--text-primary,#141311)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>'
    + '</svg>';
}
function tlRainSparkSVG() {
  const s = TL.sel * 24;
  const vals = []; for (let h = 0; h < 24; h++) vals.push(TL.rain[s + h]);
  const mx = Math.max(TL_RAIN_CEIL_MIN, ...vals.map(v => v || 0));
  const bw = (TL_SVGW / 24) * 0.6;
  const nowH = TL.nowH - s;
  const bars = vals.map((v, i) => {
    if (!v || v < 0.05) return '';
    const hgt = Math.max(1.5, (Math.log1p(v) / Math.log1p(mx)) * (TL_SVGH - TL_PAD * 2));
    const x = (i / 23) * TL_SVGW - bw / 2;
    const future = i > nowH;
    const conf = TL.confH.rain[s + i]; const cv = conf != null ? conf : 100;
    const op = future ? (0.28 + 0.5 * cv / 100) : 0.85;
    return '<rect x="' + x.toFixed(1) + '" y="' + (TL_SVGH - TL_PAD - hgt).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hgt.toFixed(1) + '" rx="1" fill="var(--text-primary,#141311)" opacity="' + op.toFixed(2) + '"/>';
  }).join('');
  return '<svg viewBox="0 0 ' + TL_SVGW + ' ' + TL_SVGH + '" width="100%" height="' + TL_SVGH + '" style="display:block;overflow:visible">'
    + '<line x1="0" y1="' + (TL_SVGH - TL_PAD) + '" x2="' + TL_SVGW + '" y2="' + (TL_SVGH - TL_PAD) + '" stroke="var(--border,#dedad0)" stroke-width="1"/>'
    + bars + '</svg>';
}
function tlSparkSVG(m) { return m === 'rain' ? tlRainSparkSVG() : tlLineSparkSVG(m); }
function tlLaneCeilFloor(m) {
  const meta = tlLaneMeta()[m];
  const [hi, lo] = tlDayRange(TL[m]);
  if (m === 'rain') {
    const ceil = Math.max(TL_RAIN_CEIL_MIN, hi != null ? hi : 0);
    return '<span class="tlm-ceil">' + ceil.toFixed(1) + '</span><span class="tlm-floor">0.0</span>';
  }
  if (m === 'cloud') return '<span class="tlm-ceil">100%</span><span class="tlm-floor">0%</span>';
  const hiT = hi != null ? meta.fmt(hi) : '';
  const loT = lo != null ? meta.fmt(lo) : '';
  return '<span class="tlm-ceil">' + hiT + '</span><span class="tlm-floor">' + loT + '</span>';
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

  // top axis: sunrise/sunset times + NOW label share this line
  const sun = tlSunFrac();
  const axis = '<div class="tlm-axis"><span class="tlm-axpad"></span><div class="tlm-axtrack">'
    + (sun.riseMs ? '<span class="tlm-suntime" style="left:' + (sun.rise * 100).toFixed(1) + '%">' + wxIcon(0, false, null) + '<b>' + tlClock(sun.riseMs) + '</b></span>' : '')
    + (sun.setMs ? '<span class="tlm-suntime" style="left:' + (sun.set * 100).toFixed(1) + '%">' + wxIcon(0, true, null) + '<b>' + tlClock(sun.setMs) + '</b></span>' : '')
    + '</div><span class="tlm-axpad-r"></span></div>';

  let lanes = '<div class="tlm-lanes">' + TL.lanes.map(m =>
    '<div class="tlm-lane"><span class="tlm-lic tlm-ic-' + m + '">' + IC[m] + '</span>'
    + '<span class="tlm-lspark">' + tlSparkSVG(m) + '</span>'
    + '<span class="tlm-lscale">' + tlLaneCeilFloor(m) + '</span></div>').join('') + '</div>';

  // dimmed background before sunrise / after sunset (the line stays crisp)
  const nightBg = '<div class="tlm-nightbg">'
    + '<div class="tlm-night" style="left:0;width:' + (sun.rise * 100).toFixed(1) + '%"></div>'
    + '<div class="tlm-night" style="left:' + (sun.set * 100).toFixed(1) + '%;width:' + ((1 - sun.set) * 100).toFixed(1) + '%"></div></div>';

  const vis = tlNowVisible();
  const L = (tlNowFrac() * 100).toFixed(2) + '%';
  const overlay = '<div class="tlm-overlay" id="tlm-overlay">'
    + '<div class="tlm-now" id="tlm-now" style="left:' + L + ';display:' + (vis ? 'block' : 'none') + '"></div>'
    + '<div class="tlm-nowlab" id="tlm-nowlab" style="left:' + L + ';display:' + (vis ? 'block' : 'none') + '"></div>'
    + '</div>';

  return hero + axis + '<div class="tlm-chart">' + nightBg + lanes + overlay + '</div>';
}

// fill hero + metric figures for the current ref hour
function tlHeads() {
  const d = TL.days[TL.sel]; if (!d) return;
  const h = tlRefHour();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerHTML = v; };
  const t = TL.temp[h];
  let feels = null;
  if (d.isToday && !TL.scrubbing && cachedCurrent && cachedCurrent.c && cachedCurrent.c.apparent_temperature != null) feels = cachedCurrent.c.apparent_temperature;
  else if (t != null && TL.wind[h] != null) feels = t - TL.wind[h] * 0.11;
  set('tlm-temp', t != null ? tempDisp(t) + '°' : '—');
  set('tlm-feels', feels != null ? 'Feels like ' + tempDisp(feels) + '°' : '');
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
  const L = (tlNowFrac() * 100).toFixed(2) + '%';
  const now = document.getElementById('tlm-now'), lab = document.getElementById('tlm-nowlab');
  if (now) { now.style.left = L; now.style.display = vis ? 'block' : 'none'; }
  if (lab) { lab.style.left = L; lab.style.display = vis ? 'block' : 'none'; }
  document.querySelectorAll('.tl-sec-now').forEach(el => { el.style.left = L; el.style.display = vis ? 'block' : 'none'; });
}

// ── scrub / swipe gesture (shared by hour chart + secondary metrics) ─────
// Slow drag = scrub hours; on the hour chart a quick flick slides days.
function tlBindScrubOn(el, fracEl, allowSwipe) {
  if (!el) return;
  let down = false, decided = null, startX = 0, startT = 0;
  const HOLD_MS = 140, SWIPE_DX = 34;
  const hourFromX = clientX => {
    const r = (fracEl || el).getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return Math.round(frac * 23);
  };
  el.addEventListener('pointerdown', ev => {
    down = true; decided = null; startX = ev.clientX; startT = performance.now();
    try { el.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  el.addEventListener('pointermove', ev => {
    if (!down) return;
    const moved = ev.clientX - startX;
    if (decided == null) {
      const dt = performance.now() - startT;
      if (allowSwipe && dt < HOLD_MS && Math.abs(moved) > SWIPE_DX) decided = 'swipe';
      else if (dt >= HOLD_MS) decided = 'scrub';
      else return;
    }
    if (decided === 'scrub') {
      TL.scrubbing = true; TL.hourSel = hourFromX(ev.clientX);
      tlSyncNow(); tlHeads(); tlSecHeads();
    }
  });
  const settle = () => {
    TL.scrubbing = false; TL.hourSel = tlDefaultHour();
    tlSyncNow(); tlHeads(); tlSecHeads();
  };
  el.addEventListener('pointerup', ev => {
    if (!down) return; down = false;
    const dt = performance.now() - startT, dx = (ev.clientX ?? startX) - startX;
    if (allowSwipe && (decided === 'swipe' || (decided == null && dt < HOLD_MS && Math.abs(dx) > SWIPE_DX))) {
      const ni = TL.sel + (dx < 0 ? 1 : -1);
      if (ni >= 0 && ni < TL.days.length) { setSelectedDay(TL.days[ni].date, { behavior: 'smooth' }); return; }
    }
    settle();
  });
  el.addEventListener('pointercancel', () => { down = false; settle(); });
}

// ── week overview interactions: tap = select, drag = scroll window ──────
function tlBindWeek() {
  const wk = document.getElementById('tlm-week'); if (!wk) return;
  let down = false, sx = 0, moved = false;
  wk.addEventListener('pointerdown', ev => {
    down = true; sx = ev.clientX; moved = false;
    try { wk.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  wk.addEventListener('pointermove', ev => { if (down && Math.abs(ev.clientX - sx) > 8) moved = true; });
  wk.addEventListener('pointerup', ev => {
    if (!down) return; down = false;
    const dx = ev.clientX - sx;
    const r = wk.getBoundingClientRect();
    const colW = r.width / (TL.days.length || 7);
    if (moved && Math.abs(dx) >= colW * 0.5) {
      // drag left → scroll ahead; clamped in tlBuild to the table's range
      TL.startOff += Math.max(1, Math.round(Math.abs(dx) / colW)) * (dx < 0 ? 1 : -1);
      const root = document.getElementById('timeline-root');
      if (root && tlBuild()) tlRenderAll(root);
      return;
    }
    // tap — on a label button or anywhere on the chart — selects that day
    const b = ev.target.closest('.tlm-wk-day');
    let di = b ? +b.dataset.di : Math.floor((ev.clientX - r.left) / colW);
    di = Math.max(0, Math.min(TL.days.length - 1, di));
    setSelectedDay(TL.days[di].date, { behavior: 'smooth' });
  });
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
    + '<path d="' + d + '" fill="none" stroke="var(--text-muted,#6f6c64)" stroke-width="1.2" stroke-linecap="round" opacity="0.8" vector-effect="non-scaling-stroke"/></svg>';
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
  // slide out, swap content, slide in from the other side
  hourEl.style.transition = 'transform .15s ease, opacity .15s ease';
  hourEl.style.transform = 'translateX(' + (-dir * 26) + 'px)';
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
  }, 150);
}
function tlBindScrub() { tlBindScrubOn(document.getElementById('tlm-overlay'), null, true); }

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
