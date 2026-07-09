// ════════════════════════════════════════════════════════════════════════
// WeatherBlend — timeline.js  (mono minimalist UI)
// ════════════════════════════════════════════════════════════════════════
// Load order: engine.js → app.js → timeline.js.
// Replaces the cards UI with the monochrome, static-line redesign:
//   · continuous week overview — a flowing temp line + rain bars across all
//     seven days, MON–SUN labels, the selected day in a rounded box, and a
//     red NOW line that shows only on today
//   · hour section — hero temp + feels-like, then rain/wind/cloud figures
//   · four static sparklines sharing one hour grid: icon · line/bars ·
//     ceiling/floor, dimmed before sunrise / after sunset, per-hour
//     confidence shown as a soft blurred ribbon; rain drawn as bars
//   · a single red NOW line across the lanes — snaps to whole hours,
//     visible on today or while scrubbing, snapping back on release
//   · secondary metrics
// Geometry is fraction-based on a fixed 0..23 hour grid, so the scrub
// position matches the sparklines identically on mobile and desktop.
// No animation — every value is a plain lookup. Honors Show/Confidence
// toggles and model/weighting changes via renderCurrentBar().
// ════════════════════════════════════════════════════════════════════════

const TL_NOW = '#a3392c';
const TL_SVGW = 480, TL_SVGH = 40, TL_PAD = 4;    // hour-lane svg (fraction grid)
const TL_WKW = 700, TL_WKH = 74;                  // week-overview svg
const TL_RAIN_CEIL_MIN = 0.5;                     // rain lane ceiling floor

const TL = {
  days: [], n: 0, idx: [], temp: [], rain: [], wind: [], cloud: [], wdir: [],
  confH: { temp: [], rain: [], wind: [], cloud: [] }, dayConf: {},
  lanes: [], suns: [], streamT0: 0, nowH: null,
  sel: 0, hourSel: 12, scrubbing: false, startOff: 0, _canPrev: false, _canNext: false,
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
function tlHourClock(h) { const hh = ((h % 24) + 24) % 24; const ap = hh < 12 ? 'am' : 'pm'; const h12 = hh % 12 || 12; return h12 + (hh % 1 ? ':' + String(Math.round((hh % 1) * 60)).padStart(2, '0') : '') + ap; }

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
  TL.days = days.map(d => ({ date: d, dow: DOW[new Date(d + 'T12:00').getDay()], dnum: +d.slice(8, 10), isToday: d === today, past: d < today }));
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
  // non-today: mirror the current wall-clock hour
  if (TL.nowH != null) return ((Math.round(TL.nowH) % 24) + 24) % 24;
  return 12;
}
function tlRefHour() { return TL.sel * 24 + Math.max(0, Math.min(23, TL.hourSel)); }
function tlNowLeftPct() { return (TL.hourSel / 23) * 100; }
function tlNowVisible() { return TL.days[TL.sel] && TL.days[TL.sel].isToday || TL.scrubbing; }
function tlDayRange(arr) { const s = TL.sel * 24; let hi = null, lo = null; for (let k = s; k < s + 24; k++) { const v = arr[k]; if (v == null) continue; hi = hi == null ? v : Math.max(hi, v); lo = lo == null ? v : Math.min(lo, v); } return [hi, lo]; }

// ── week overview ────────────────────────────────────────────────────────
function tlWeekHTML() {
  const W = TL_WKW, H = TL_WKH, n = TL.n || 168;
  const tTop = 8, tBot = 42, rBase = 68, rTop = 46;
  const X = gi => (gi / n) * W;
  // temp (shared y-scale across the whole week), smoothed
  const tg = TL.temp.filter(v => v != null && !isNaN(v));
  const tmn = tg.length ? Math.min(...tg) : 0, tmx = tg.length ? Math.max(...tg) : 1, tspan = (tmx - tmn) || 1;
  const sm = tlSmooth(TL.temp);
  const pts = []; sm.forEach((v, gi) => { if (v == null || isNaN(v)) return; pts.push([X(gi + 0.5), tTop + (tBot - tTop) * (1 - (v - tmn) / tspan)]); });
  const line = tlPath(pts);
  // rain bars (shared log scale)
  const rmx = Math.max(TL_RAIN_CEIL_MIN, ...TL.rain.map(v => v || 0));
  const bw = (W / n) * 0.62;
  const bars = TL.rain.map((v, gi) => {
    if (!v || v < 0.05) return '';
    const hgt = Math.max(1.2, (Math.log1p(v) / Math.log1p(rmx)) * (rBase - rTop));
    return '<rect x="' + (X(gi + 0.5) - bw / 2).toFixed(1) + '" y="' + (rBase - hgt).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hgt.toFixed(1) + '" fill="var(--text-muted,#6f6c64)" opacity="0.5"/>';
  }).join('');
  // selected-day rounded box + day separators
  const colW = W / TL.days.length;
  const selBox = '<rect x="' + (TL.sel * colW + 1).toFixed(1) + '" y="2" width="' + (colW - 2).toFixed(1) + '" height="' + (H - 4).toFixed(1) + '" rx="7" fill="none" stroke="var(--text-primary,#141311)" stroke-width="1.4"/>';
  const seps = TL.days.map((d, i) => i === 0 ? '' : '<line x1="' + (i * colW).toFixed(1) + '" y1="4" x2="' + (i * colW).toFixed(1) + '" y2="' + (H - 4) + '" stroke="var(--border,#dedad0)" stroke-width="1"/>').join('');
  // now line (today only)
  const now = (TL.nowH != null && TL.nowH >= 0 && TL.nowH <= n)
    ? '<line x1="' + X(TL.nowH).toFixed(1) + '" y1="3" x2="' + X(TL.nowH).toFixed(1) + '" y2="' + (H - 3) + '" stroke="' + TL_NOW + '" stroke-width="1.4"/>' : '';
  const svg = '<svg class="tlm-wk-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" preserveAspectRatio="none">'
    + seps + '<path d="' + line + '" fill="none" stroke="var(--text-primary,#141311)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>'
    + bars + selBox + now + '</svg>';
  // labels row (also the click targets)
  const labels = '<div class="tlm-wk-labels">' + TL.days.map((d, i) =>
    '<button type="button" class="tlm-wk-day' + (i === TL.sel ? ' sel' : '') + '" data-di="' + i + '">'
    + '<span class="tlm-wk-dow">' + (d.isToday ? 'Today' : d.dow.toUpperCase()) + '</span>'
    + '<span class="tlm-wk-num">' + d.dnum + '</span></button>').join('') + '</div>';
  return '<div class="tlm-week" id="tlm-week">' + svg + labels + '</div>';
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
function tlNightMaskDefs(gid) {
  const { rise, set } = tlSunFrac();
  const r1 = Math.max(0, rise * 100 - 0.6), r2 = Math.min(100, rise * 100 + 0.6);
  const s1 = Math.max(0, set * 100 - 0.6), s2 = Math.min(100, set * 100 + 0.6);
  return '<linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="0">'
    + '<stop offset="0%" stop-color="#fff" stop-opacity="0.3"/>'
    + '<stop offset="' + r1.toFixed(1) + '%" stop-color="#fff" stop-opacity="0.3"/>'
    + '<stop offset="' + r2.toFixed(1) + '%" stop-color="#fff" stop-opacity="1"/>'
    + '<stop offset="' + s1.toFixed(1) + '%" stop-color="#fff" stop-opacity="1"/>'
    + '<stop offset="' + s2.toFixed(1) + '%" stop-color="#fff" stop-opacity="0.3"/>'
    + '<stop offset="100%" stop-color="#fff" stop-opacity="0.3"/>'
    + '</linearGradient><mask id="m' + gid + '"><rect width="' + TL_SVGW + '" height="' + TL_SVGH + '" fill="url(#' + gid + ')"/></mask>';
}
function tlLineSparkSVG(m) {
  const s = TL.sel * 24;
  const vals = []; for (let h = 0; h < 24; h++) vals.push(TL[m][s + h]);
  const good = vals.map((v, i) => [i, v]).filter(p => p[1] != null && !isNaN(p[1]));
  if (good.length < 2) return '<svg viewBox="0 0 ' + TL_SVGW + ' ' + TL_SVGH + '" width="100%" height="' + TL_SVGH + '" style="display:block"></svg>';
  const gv = good.map(p => p[1]); const mn = Math.min(...gv), mx = Math.max(...gv), span = (mx - mn) || 1;
  const disp = m === 'temp' ? tlSmooth(vals) : vals;   // extra smoothing for temp
  const XY = i => [(i / 23) * TL_SVGW, TL_SVGH - TL_PAD - (((disp[i] != null ? disp[i] : vals[i]) - mn) / span) * (TL_SVGH - TL_PAD * 2)];
  const pts = good.map(([i]) => XY(i));
  const line = tlPath(pts);
  // per-hour confidence ribbon — half-thickness grows as agreement drops
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
  const gid = 'tlmN_' + m, fid = 'tlmB_' + m;
  return '<svg viewBox="0 0 ' + TL_SVGW + ' ' + TL_SVGH + '" width="100%" height="' + TL_SVGH + '" style="display:block;overflow:visible">'
    + '<defs>' + tlNightMaskDefs(gid)
    + '<filter id="' + fid + '" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="2.4"/></filter></defs>'
    + '<g mask="url(#m' + gid + ')">'
    + '<path d="' + ribbon + '" fill="var(--text-primary,#141311)" stroke="none" opacity="0.16" filter="url(#' + fid + ')"/>'
    + '<path d="' + line + '" fill="none" stroke="var(--text-primary,#141311)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>'
    + '</g></svg>';
}
function tlRainSparkSVG() {
  const s = TL.sel * 24;
  const vals = []; for (let h = 0; h < 24; h++) vals.push(TL.rain[s + h]);
  const mx = Math.max(TL_RAIN_CEIL_MIN, ...vals.map(v => v || 0));
  const bw = (TL_SVGW / 24) * 0.6;
  const nowH = TL.nowH - s;   // hour within selected day where "now" sits
  const bars = vals.map((v, i) => {
    if (!v || v < 0.05) return '';
    const hgt = Math.max(1.5, (Math.log1p(v) / Math.log1p(mx)) * (TL_SVGH - TL_PAD * 2));
    const x = (i / 23) * TL_SVGW - bw / 2;
    const future = i > nowH;
    const conf = TL.confH.rain[s + i]; const cv = conf != null ? conf : 100;
    const op = future ? (0.28 + 0.5 * cv / 100) : 0.85;   // future bars fade w/ lower confidence
    return '<rect x="' + x.toFixed(1) + '" y="' + (TL_SVGH - TL_PAD - hgt).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hgt.toFixed(1) + '" rx="1" fill="var(--text-primary,#141311)" opacity="' + op.toFixed(2) + '"/>';
  }).join('');
  const gid = 'tlmN_rain';
  return '<svg viewBox="0 0 ' + TL_SVGW + ' ' + TL_SVGH + '" width="100%" height="' + TL_SVGH + '" style="display:block;overflow:visible">'
    + '<defs>' + tlNightMaskDefs(gid) + '</defs>'
    + '<line x1="0" y1="' + (TL_SVGH - TL_PAD) + '" x2="' + TL_SVGW + '" y2="' + (TL_SVGH - TL_PAD) + '" stroke="var(--border,#dedad0)" stroke-width="1"/>'
    + '<g mask="url(#m' + gid + ')">' + bars + '</g></svg>';
}
function tlSparkSVG(m) { return m === 'rain' ? tlRainSparkSVG() : tlLineSparkSVG(m); }
function tlLaneCeilFloor(m) {
  const meta = tlLaneMeta()[m];
  const [hi, lo] = tlDayRange(TL[m]);
  if (m === 'rain') {
    const ceil = Math.max(TL_RAIN_CEIL_MIN, hi != null ? hi : 0);
    return '<span class="tlm-ceil">' + ceil.toFixed(1) + '</span><span class="tlm-floor">0.0</span>';
  }
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
      '<div class="tlm-metric"><span class="tlm-mic">' + IC[m] + '</span>'
      + '<span class="tlm-mfig" id="tlm-fig-' + m + '"></span>'
      + '<span class="tlm-mconf" id="tlm-conf-' + m + '"></span></div>').join('')
    + '</div></div>';

  let lanes = '<div class="tlm-lanes">' + TL.lanes.map(m =>
    '<div class="tlm-lane"><span class="tlm-lic">' + IC[m] + '</span>'
    + '<span class="tlm-lspark">' + tlSparkSVG(m) + '</span>'
    + '<span class="tlm-lscale">' + tlLaneCeilFloor(m) + '</span></div>').join('') + '</div>';

  const vis = tlNowVisible();
  const overlay = '<div class="tlm-overlay" id="tlm-overlay">'
    + '<div class="tlm-now" id="tlm-now" style="left:' + tlNowLeftPct().toFixed(2) + '%;display:' + (vis ? 'block' : 'none') + '"></div>'
    + '<div class="tlm-nowlab" id="tlm-nowlab" style="left:' + tlNowLeftPct().toFixed(2) + '%;display:' + (vis ? 'block' : 'none') + '"></div>'
    + '</div>';

  const sun = tlSunFrac();
  const axis = '<div class="tlm-axis"><span class="tlm-axpad"></span><div class="tlm-axtrack">'
    + (sun.riseMs ? '<span class="tlm-suntime" style="left:' + (sun.rise * 100).toFixed(1) + '%">' + wxIcon(0, false, null) + '<b>' + tlClock(sun.riseMs) + '</b></span>' : '')
    + (sun.setMs ? '<span class="tlm-suntime" style="left:' + (sun.set * 100).toFixed(1) + '%">' + wxIcon(0, true, null) + '<b>' + tlClock(sun.setMs) + '</b></span>' : '')
    + '</div><span class="tlm-axpad-r"></span></div>';

  return hero + '<div class="tlm-chart">' + lanes + overlay + '</div>' + axis;
}

// fill hero + metric + right-column figures for the current ref hour
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
  // rain figure = TODAY'S (selected day's) TOTAL, not the hourly rate
  const rainTot = tlDayRainTotal(TL.sel);
  const dir = TL.wdir[h] != null ? ' <span class="tlm-mdir">' + dirFull(TL.wdir[h]) + '</span>' : '';
  const figFor = {
    rain: (rainTot < 0.05 ? '0' : rainTot.toFixed(1)) + ' mm',
    wind: (TL.wind[h] != null ? Math.round(TL.wind[h]) : '—') + ' km/h' + dir,
    cloud: (TL.cloud[h] != null ? Math.round(TL.cloud[h]) : '—') + '%',
  };
  ['rain', 'wind', 'cloud'].forEach(m => {
    set('tlm-fig-' + m, figFor[m]);
    const c = TL.dayConf[d.date][m];
    set('tlm-conf-' + m, (confVisible[m] !== false && c != null) ? c + '%' : '');
  });
  const lab = document.getElementById('tlm-nowlab');
  if (lab) lab.textContent = tlClock(TL.streamT0 + h * 3600000);
}
function tlSyncNow() {
  const vis = tlNowVisible();
  const now = document.getElementById('tlm-now'), lab = document.getElementById('tlm-nowlab');
  const L = tlNowLeftPct().toFixed(2) + '%';
  if (now) { now.style.left = L; now.style.display = vis ? 'block' : 'none'; }
  if (lab) { lab.style.left = L; lab.style.display = vis ? 'block' : 'none'; }
}

// ── scrub / swipe: quick flick = change day, slow drag = scrub hours ─────
function tlBindScrub() {
  const ov = document.getElementById('tlm-overlay'); if (!ov) return;
  let down = false, decided = null, startX = 0, startT = 0, moved = 0;
  const HOLD_MS = 140, SWIPE_DX = 34;
  const hourFromX = clientX => {
    const r = ov.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return Math.round(frac * 23);
  };
  ov.addEventListener('pointerdown', ev => {
    down = true; decided = null; startX = ev.clientX; startT = performance.now(); moved = 0;
    try { ov.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  ov.addEventListener('pointermove', ev => {
    if (!down) return;
    moved = ev.clientX - startX;
    if (decided == null) {
      const dt = performance.now() - startT;
      if (dt < HOLD_MS && Math.abs(moved) > SWIPE_DX) decided = 'swipe';
      else if (dt >= HOLD_MS) decided = 'scrub';
      else return;   // still ambiguous — wait
    }
    if (decided === 'scrub') {
      TL.scrubbing = true; TL.hourSel = hourFromX(ev.clientX); tlSyncNow(); tlHeads();
    }
  });
  const end = ev => {
    if (!down) return; down = false;
    const dt = performance.now() - startT, dx = (ev.clientX ?? startX) - startX;
    if (decided === 'swipe' || (decided == null && dt < HOLD_MS && Math.abs(dx) > SWIPE_DX)) {
      const dir = dx < 0 ? 1 : -1;   // swipe left → next day
      const ni = TL.sel + dir;
      if (ni >= 0 && ni < TL.days.length) { setSelectedDay(TL.days[ni].date, { behavior: 'smooth' }); return; }
    }
    // was a scrub (or a tap) — release: snap back to default hour
    TL.scrubbing = false; TL.hourSel = tlDefaultHour();
    tlSyncNow(); tlHeads(); tlSecRender();
  };
  ov.addEventListener('pointerup', end);
  ov.addEventListener('pointercancel', () => { down = false; TL.scrubbing = false; TL.hourSel = tlDefaultHour(); tlSyncNow(); tlHeads(); });
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
  TL.sel = i; selDate = TL.days[i].date; TL.scrubbing = false; TL.hourSel = tlDefaultHour();
  const hourEl = document.getElementById('tlm-hour');
  if (hourEl) hourEl.innerHTML = tlHourHTML();
  const wk = document.getElementById('tlm-week');
  if (wk) wk.outerHTML = tlWeekHTML();
  tlBindWeek(); tlBindScrub(); tlHeads(); tlSecRender();
}

// ── render root + wiring ────────────────────────────────────────────────
function tlBindWeek() {
  const wk = document.getElementById('tlm-week');
  if (wk) wk.addEventListener('click', ev => {
    const b = ev.target.closest('.tlm-wk-day'); if (!b) return;
    setSelectedDay(TL.days[+b.dataset.di].date, { behavior: 'smooth' });
  });
}
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
