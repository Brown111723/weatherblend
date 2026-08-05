// ════════════════════════════════════════════════════════════════════════
// maps.js — the map view
//
// Same principle as everything else: nothing here is a single model's
// output. A grid of points is fetched from every enabled model, blended
// through the engine's own weightedAvgOf() with the same per-metric
// accuracy weights the cards and table use, then painted with the same
// colour ramps. What you see on the map agrees with the number in the
// table because it came out of the same function.
//
// Data is requested in UTC deliberately: timezone=auto on a multi-point
// request can hand back different local zones per point near a border,
// which would silently misalign the hours.
// ════════════════════════════════════════════════════════════════════════

const MAP = {
  ready: false, loading: false, error: null, built: false,
  lat: null, lon: null,
  viewIdx: 0,
  points: [], tier: 'coarse',
  spanLat: 9,               // ~1000km box; Nearby frames the middle 30%
  bounds: null,             // [[south,west],[north,east]]
  lats: [], lons: [],
  times: [],                // UTC ISO strings, 24 of them
  nowIdx: 12,
  hourSel: 12, scrubbing: false, playing: false, playTimer: null,
  layers: ['rain', 'cloud'], // painted bottom to top
  metric: 'rain',            // headline layer — must always be one of `layers`
  raw: {},                  // raw[modelKey] = [point][field][hour]
  blend: {},                // blend[metricKey] = [hour][point]
  frames: {},               // frames[metricKey][hour] = dataURL
  map: null, overlay: null, baseLayer: null, labelLayer: null,
  tileIdx: 0, tilesOk: 0, log: [], cache: {}
};

// Detail levels. The box is ~290km across, so 15 points ≈ 20km spacing —
// about as fine as global models actually resolve. Going finer would draw
// smoother pictures without adding real information.
// Two presets rather than two independent dials. Detail and area trade off
// against each other, so pairing them keeps every combination sensible:
// the close view is fine-grained, the wide one is deliberately coarser.
// A single grid serves both views. Region shows all of it; Nearby is the
// same painted field with the camera pulled in — no second request, and
// switching between them is instant because nothing is refetched.
const MAP_VIEWS = [
  { key: 'nearby', label: 'Nearby', crop: 0.30 },
  { key: 'region', label: 'Region', crop: 1 }
];
function mapLoadPrefs() {
  try {
    const k = localStorage.getItem('wb_map_view');
    const i = MAP_VIEWS.findIndex(v => v.key === k);
    if (i >= 0) MAP.viewIdx = i;
    const l = localStorage.getItem('wb_map_layers');
    if (l) {
      const arr = l.split(',').filter(x => LAYER_ORDER.indexOf(x) >= 0);
      if (arr.length) MAP.layers = arr;
    }
  } catch (e) {}
  mapSyncMetric();
}
// the headline figure must belong to a layer that is actually painted
function mapSyncMetric() {
  const on = mapActiveLayers();
  if (!on.length || on.indexOf(MAP.metric) >= 0) return;
  MAP.metric = on.indexOf('rain') >= 0 ? 'rain' : (on.indexOf('cloud') >= 0 ? 'cloud' : on[0]);
}
function mapSetView(i) {
  if (MAP.viewIdx === i || !MAP_VIEWS[i]) return;
  MAP.viewIdx = i;
  try { localStorage.setItem('wb_map_view', MAP_VIEWS[i].key); } catch (e) {}
  document.querySelectorAll('#mp-views .mp-dbtn').forEach((b, k) => b.classList.toggle('on', k === i));
  mapFit(); mapDiag();
}
// the box the camera frames — a centred crop of the fetched grid
function mapViewBounds() {
  if (!MAP.bounds) return null;
  const v = MAP_VIEWS[MAP.viewIdx] || MAP_VIEWS[0];
  if (v.crop >= 1) return MAP.bounds;
  const [[s, w], [n, e]] = MAP.bounds;
  const cLat = (s + n) / 2, cLon = (w + e) / 2;
  // crop in projected space so the framed box stays square on screen
  const mS = mapMerc(s), mN = mapMerc(n), mC = (mS + mN) / 2;
  const hM = (mN - mS) / 2 * v.crop, hLon = (e - w) / 2 * v.crop;
  return [[mapInvMerc(mC - hM), cLon - hLon], [mapInvMerc(mC + hM), cLon + hLon]];
}
// Flicking between settings used to fire a full refetch per tap, which is
// what tripped the rate limit. Coalesce them, and reuse anything already
// fetched for the same settings.
function mapRefetchSoon() {
  mapDiag();
  if (MAP._reTimer) clearTimeout(MAP._reTimer);
  MAP._reTimer = setTimeout(() => { MAP._reTimer = null; mapInvalidate(); }, 1100);
}


const MAP_FIELD = {
  temp: 'temperature_2m', rain: 'precipitation', wind: 'wind_speed_10m',
  cloud: 'cloud_cover', snow: 'snowfall', gust: 'wind_gusts_10m',
  humid: 'relative_humidity_2m', press: 'surface_pressure', uv: 'uv_index',
  _winddir: 'wind_direction_10m'
};
const MAP_SEC = { temp: 'temp', rain: 'rain', wind: 'wind', cloud: 'cloud', snow: 'rain', gust: 'wind', humid: 'cloud', press: null, uv: null, _winddir: 'wind' };
const MAP_LABEL = {
  temp: 'Temp', rain: 'Rain', wind: 'Wind', cloud: 'Cloud',
  snow: 'Snow', gust: 'Gusts', humid: 'Humidity', press: 'Pressure', uv: 'UV'
};
const MAP_UNIT = {
  temp: '°', rain: 'mm', wind: 'km/h', cloud: '%', snow: 'cm',
  gust: 'km/h', humid: '%', press: 'hPa', uv: ''
};

// ── colour ──────────────────────────────────────────────────────────────
// Shared with the cards where the ramp is shared (temp, UV); the rest fade
// from fully transparent so the land underneath stays readable.
const MAP_RAIN_RAMP = [[0, '#6FC0FF'], [0.5, '#4A8CF0'], [2, '#3B5BD9'], [6, '#6B3ED0'], [15, '#8C42C6']];
const MAP_WIND_RAMP = [[0, '#7ED9A0'], [20, '#A8E63E'], [40, '#FFD75E'], [60, '#FFA24E'], [90, '#FF5E5E']];
const MAP_PRESS_RAMP = [[985, '#7A9BE8'], [1000, '#C8A6FF'], [1013, '#F09AD0'], [1025, '#FFB86B'], [1040, '#FFD75E']];

function mapRamp(v, ramp) {
  return (typeof tlRampRgb === 'function') ? tlRampRgb(v, ramp) : [128, 128, 128];
}
function mapPx(rgb, a) { return [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2]), Math.round(a)]; }
const CLEAR = [0, 0, 0, 0];

const MAP_COLOR = {
  temp: v => v == null ? CLEAR : mapPx(mapRamp(v, TL_TRAMP), 168),
  rain: v => {
    if (v == null || v < 0.04) return CLEAR;
    const t = Math.min(1, Math.log1p(v) / Math.log1p(12));
    return mapPx(mapRamp(v, MAP_RAIN_RAMP), 70 + 175 * t);
  },
  snow: v => {
    if (v == null || v < 0.03) return CLEAR;
    const t = Math.min(1, Math.log1p(v) / Math.log1p(4));
    return mapPx([210 + 40 * t, 236 + 16 * t, 255], 70 + 165 * t);
  },
  wind: v => {
    if (v == null) return CLEAR;
    const t = Math.min(1, v / 70);
    return mapPx(mapRamp(v, MAP_WIND_RAMP), 40 + 170 * t);
  },
  gust: v => {
    if (v == null) return CLEAR;
    const t = Math.min(1, v / 95);
    return mapPx(mapRamp(v, MAP_WIND_RAMP), 40 + 180 * t);
  },
  cloud: v => {
    if (v == null || v < 4) return CLEAR;
    const t = Math.min(1, v / 100);
    return mapPx([228, 232, 244], 20 + 165 * t);
  },
  humid: v => {
    if (v == null) return CLEAR;
    const t = Math.max(0, Math.min(1, (v - 25) / 75));
    return mapPx([78, 214, 184], 20 + 175 * t);
  },
  press: v => v == null ? CLEAR : mapPx(mapRamp(v, MAP_PRESS_RAMP), 150),
  uv: v => {
    if (v == null || v < 0.2) return CLEAR;
    const t = Math.min(1, v / 12);
    return mapPx(mapRamp(v, (typeof TL_URAMP !== 'undefined') ? TL_URAMP : MAP_WIND_RAMP), 55 + 175 * t);
  }
};

// legend stops, purely for the strip under the map
const MAP_LEGEND = {
  temp: [-5, 0, 10, 20, 30, 40], rain: [0, 0.5, 2, 6, 15], snow: [0, 0.5, 2, 4],
  wind: [0, 20, 40, 60, 90], gust: [0, 30, 60, 95], cloud: [0, 25, 50, 75, 100],
  humid: [25, 50, 75, 100], press: [985, 1000, 1013, 1025, 1040], uv: [0, 3, 6, 9, 12]
};

const mapMerc = lat => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI / 180) / 2));
const mapInvMerc = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;

// ── which metrics are on ────────────────────────────────────────────────
function mapMetrics() {
  const main = ['temp', 'rain', 'wind', 'cloud'].filter(k => secVisible[k]);
  const extra = (typeof XMET !== 'undefined') ? XMET.map(m => m.key).filter(k => secVisible[k]) : [];
  const all = main.concat(extra);
  return all.length ? all : ['temp', 'rain', 'wind', 'cloud'];
}

// ── which models the map uses ───────────────────────────────────────────
// All of them, always. Billing is max(1, variables/10), so one metric
// across seven models is 7 variables — it lands on the floor and costs
// exactly what three models would. Capping models saved nothing and made
// the map disagree with the table, which is the one thing it must not do.
function mapModels() {
  return MODELS.filter(m => enabled.has(m.key) && !autoHidden.has(m.key));
}

// ── fetching ────────────────────────────────────────────────────────────
// ── grid construction ───────────────────────────────────────────────────
// Points are no longer a uniform lattice. Detail is concentrated where the
// user actually looks — a dense core around their location — with sparse
// rings out to the edge of the box. Weather fields are smooth enough at
// 500km that edge points only need to anchor the interpolation, not
// resolve structure. ~53 points where a 13x13 lattice needed 169.
const MAP_TIERS = {
  coarse:   { core: 3, coreFrac: 0.42, rings: [{ f: 1.00, per: 3 }] },
  adaptive: { core: 5, coreFrac: 0.38, rings: [{ f: 0.68, per: 3 }, { f: 1.00, per: 4 }] }
};
function mapBuildPoints(tier) {
  const T = MAP_TIERS[tier] || MAP_TIERS.adaptive;
  const spanLat = MAP.spanLat || 9;
  const latN = Math.max(-84, Math.min(84, MAP.lat + spanLat / 2));
  const latS = Math.max(-84, Math.min(84, MAP.lat - spanLat / 2));
  // square in Mercator, so the painted box fills a square viewport exactly
  const spanLon = Math.min(340, (mapMerc(latN) - mapMerc(latS)) * 180 / Math.PI);
  const hLat = (latN - latS) / 2, hLon = spanLon / 2;
  const pts = [];
  const push = (dy, dx) => {
    const lat = Math.max(-84, Math.min(84, MAP.lat + hLat * dy));
    const lon = MAP.lon + hLon * dx;
    if (!pts.some(p => Math.abs(p.lat - lat) < 1e-4 && Math.abs(p.lon - lon) < 1e-4)) pts.push({ lat, lon });
  };
  // dense core
  const n = T.core;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      push(T.coreFrac * (1 - 2 * r / (n - 1)), T.coreFrac * (2 * c / (n - 1) - 1));
    }
  }
  // square rings out to the edge — `per` is points per side, corners included
  T.rings.forEach(ring => {
    const m = ring.per, f = ring.f;
    for (let i = 0; i < m; i++) {
      const t = m === 1 ? 0 : (2 * i / (m - 1) - 1);
      push(f, f * t); push(-f, f * t);          // top and bottom edges
      push(f * t, f); push(f * t, -f);          // left and right edges
    }
  });
  MAP.points = pts;
  MAP.bounds = [[latS, MAP.lon - hLon], [latN, MAP.lon + hLon]];
  MAP.tier = tier;
  return pts;
}


// Safety net if the combined request is rejected: the original one-model-
// per-request path, throttled two at a time so it can't trip the limiter.

// ── persistent cache ────────────────────────────────────────────────────
// In-memory alone meant every page reload refetched the whole grid. This
// survives reloads, which is where a lot of the waste actually was.
const MAP_TTL = 60 * 60000;
function mapDiskGet(k) {
  try {
    const raw = localStorage.getItem('wb_map_' + k); if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || Date.now() - o.at > MAP_TTL) { localStorage.removeItem('wb_map_' + k); return null; }
    return o;
  } catch (e) { return null; }
}
function mapDiskSet(k, o) {
  try { localStorage.setItem('wb_map_' + k, JSON.stringify({ at: Date.now(), ...o })); }
  catch (e) {
    // quota: drop older map entries and retry once
    try {
      Object.keys(localStorage).filter(x => x.startsWith('wb_map_')).forEach(x => localStorage.removeItem(x));
      localStorage.setItem('wb_map_' + k, JSON.stringify({ at: Date.now(), ...o }));
    } catch (e2) {}
  }
}
function mapCacheKey(tier) {
  return [mapFramesKey(), tier || MAP.tier, MAP.spanLat,
    (state.lat || 0).toFixed(2), (state.lon || 0).toFixed(2),
    Math.floor(Date.now() / 3600000)].join('|');
}
function mapAdopt(o) {
  MAP.raw = o.raw; MAP.times = o.times; MAP.nowIdx = o.nowIdx; MAP._offset = o.offset;
  MAP.bounds = o.bounds; MAP.points = o.points; MAP.tier = o.tier;
  MAP.blend = {}; MAP.frames = {}; MAP.ready = true; MAP.error = null;
  if (MAP.hourSel == null || MAP.hourSel < 0) MAP.hourSel = o.nowIdx;
}

// ── fetching ────────────────────────────────────────────────────────────
// Progressive: a cheap coarse grid paints almost immediately, and the
// finer one only loads if the map is still open a moment later. Most map
// opens are a glance, so most never pay for the refinement.
const MAP_REFINE_MS = 1400;
async function mapFetch() {
  if (MAP.loading) return;
  MAP.lat = state.lat; MAP.lon = state.lon;
  if (MAP.lat == null || MAP.lon == null) { mapWaitForLocation(); return; }

  // already have the fine grid for these settings?
  const fineKey = mapCacheKey('adaptive');
  const memF = MAP.cache[fineKey] || mapDiskGet(fineKey);
  if (memF) { mapAdopt(memF); mapStatus(''); mapLog('cached (fine)'); mapDraw(true); return; }

  const coarseKey = mapCacheKey('coarse');
  const memC = MAP.cache[coarseKey] || mapDiskGet(coarseKey);
  if (memC) { mapAdopt(memC); mapStatus(''); mapLog('cached (coarse)'); mapDraw(true); }
  else {
    const ok = await mapFetchTier('coarse');
    if (!ok) return;
  }
  mapScheduleRefine();
}

function mapScheduleRefine() {
  if (MAP._refineTimer) clearTimeout(MAP._refineTimer);
  MAP._refineTimer = setTimeout(async () => {
    MAP._refineTimer = null;
    // only spend the extra calls if the map is genuinely still being looked at
    if (typeof sectionsVisible === 'undefined' || !sectionsVisible.map) return;
    if (document.hidden) return;
    if (MAP.tier === 'adaptive') return;
    mapLog('refining…');
    await mapFetchTier('adaptive');
  }, MAP_REFINE_MS);
}

async function mapFetchTier(tier) {
  if (MAP.loading) return false;
  const ck = mapCacheKey(tier);
  MAP.loading = true; MAP.error = null;
  mapStatus(tier === 'coarse' ? 'Loading map…' : '');
  try {
    const pts = mapBuildPoints(tier);
    const P = pts.length;
    const latCsv = pts.map(p => p.lat.toFixed(4)).join(',');
    const lonCsv = pts.map(p => p.lon.toFixed(4)).join(',');

    const hr = Math.floor(Date.now() / 3600000) * 3600000;
    const isoH = ms => new Date(ms).toISOString().slice(0, 13) + ':00';
    const winStart = isoH(hr - 12 * 3600000), winEnd = isoH(hr + 11 * 3600000);

    // only the layers on screen; wind direction only when arrows are shown
    const want = mapActiveLayers().slice();
    if (want.indexOf('wind') >= 0) want.push('_winddir');
    const fields = want.map(k => MAP_FIELD[k]).filter(Boolean);
    if (!fields.length) throw new Error('No layers selected');

    const models = mapModels();
    if (!models.length) throw new Error('No models enabled');
    const keys = models.map(m => m.key);

    const q = new URLSearchParams({
      latitude: latCsv, longitude: lonCsv,
      hourly: fields.join(','), models: keys.join(','),
      start_hour: winStart, end_hour: winEnd,
      timezone: 'UTC', wind_speed_unit: 'kmh'
    });
    const res = await fetch('https://api.open-meteo.com/v1/forecast?' + q.toString(),
      { signal: AbortSignal.timeout(45000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let j = await res.json();
    if (j && j.error) throw new Error(j.reason || 'API error');
    if (!Array.isArray(j)) j = [j];
    if (j.length !== P) throw new Error('grid ' + j.length + ' ≠ ' + P);

    const single = keys.length === 1;
    const raw = {};
    keys.forEach(k => {
      const per = j.map(pt => {
        const hsrc = pt.hourly || {}, dst = { time: hsrc.time };
        Object.keys(hsrc).forEach(name => {
          if (name === 'time') return;
          if (single) { dst[name] = hsrc[name]; return; }
          const suf = '_' + k;
          if (name.endsWith(suf)) dst[name.slice(0, -suf.length)] = hsrc[name];
        });
        const o = { hourly: dst };
        if (typeof normalizeOM === 'function') normalizeOM(o);
        return o;
      });
      if (per[0] && per[0].hourly && Object.keys(per[0].hourly).length > 1) raw[k] = per;
    });
    if (!Object.keys(raw).length) throw new Error('no usable model in response');

    MAP.raw = raw; MAP.points = pts; MAP.tier = tier;
    mapAlignTimes();
    MAP.blend = {}; MAP.frames = {}; MAP.ready = true; MAP.loading = false;
    const store = { raw, times: MAP.times, nowIdx: MAP.nowIdx, offset: MAP._offset,
      bounds: MAP.bounds, points: pts, tier };
    MAP.cache[ck] = store; mapDiskSet(ck, store);
    mapStatus('');
    mapLog(tier + ': ' + Object.keys(raw).length + ' models, ' + P + ' pts');
    mapDraw(true);
    return true;
  } catch (e) {
    MAP.loading = false;
    if (tier === 'coarse') {
      MAP.error = /429/.test(e.message)
        ? 'Rate limited — wait a minute, then reopen the map' : e.message;
      mapStatus('Could not load map data — ' + MAP.error);
    } else {
      mapLog('refine failed: ' + e.message);   // coarse is still on screen
    }
    mapDiag();
    return false;
  }
}

// 24 hours centred on now: twelve behind, twelve ahead
function mapAlignTimes() {
  const first = Object.values(MAP.raw)[0];
  const t = first && first[0] && first[0].hourly ? first[0].hourly.time : null;
  if (!t || !t.length) throw new Error('No time axis');
  const nowMs = Date.now();
  let ni = 0;
  for (let i = 0; i < t.length; i++) { if (Date.parse(t[i] + 'Z') <= nowMs) ni = i; else break; }
  const start = Math.max(0, Math.min(t.length - 24, ni - 12));
  MAP.times = t.slice(start, start + 24);
  MAP.nowIdx = Math.max(0, Math.min(23, ni - start));
  MAP.hourSel = MAP.nowIdx;
  MAP._offset = {};
  Object.keys(MAP.raw).forEach(k => {
    const ht = MAP.raw[k][0] && MAP.raw[k][0].hourly ? MAP.raw[k][0].hourly.time : null;
    MAP._offset[k] = ht ? ht.indexOf(MAP.times[0]) : -1;
  });
}

// ── blending ────────────────────────────────────────────────────────────
// One call to the engine's weightedAvgOf per point per hour, so the map
// inherits the same weights, the same weighted/plain toggle, and the same
// clamping the rest of the app uses.
function mapBlendMetric(metric) {
  if (MAP.blend[metric]) return MAP.blend[metric];
  const field = MAP_FIELD[metric], sec = MAP_SEC[metric];
  const P = MAP.points.length, keys = Object.keys(MAP.raw);
  const out = [];
  for (let h = 0; h < MAP.times.length; h++) {
    const row = new Array(P).fill(null);
    for (let p = 0; p < P; p++) {
      const pairs = [];
      for (const k of keys) {
        const off = MAP._offset[k]; if (off < 0) continue;
        const hr = MAP.raw[k][p] && MAP.raw[k][p].hourly;
        const arr = hr ? hr[field] : null;
        const v = arr ? arr[off + h] : null;
        if (v != null && !isNaN(v)) pairs.push({ key: k, val: v });
      }
      if (pairs.length) {
        row[p] = (typeof weightedAvgOf === 'function')
          ? weightedAvgOf(pairs, sec, 0, field)
          : pairs.reduce((s, x) => s + x.val, 0) / pairs.length;
      }
    }
    out.push(row);
  }
  MAP.blend[metric] = out;
  return out;
}

// ── painting ────────────────────────────────────────────────────────────
const LAYER_ORDER = ['temp', 'humid', 'press', 'uv', 'cloud', 'snow', 'rain', 'gust', 'wind'];
function mapActiveLayers() {
  const on = (MAP.layers && MAP.layers.length) ? MAP.layers : [MAP.metric];
  return LAYER_ORDER.filter(k => on.indexOf(k) >= 0);
}
function mapFramesKey() { return mapActiveLayers().join('+'); }

// Layers use distinct visual channels so they can be read at once: temp
// owns hue, cloud removes saturation, rain adds its own colour only where
// it falls, wind is arrows. Four translucent colour fields would be mud.
function mapCentreIdx() {
  if (!MAP.points || !MAP.points.length) return 0;
  let best = 0, bd = Infinity;
  MAP.points.forEach((p, i) => {
    const d = Math.abs(p.lat - MAP.lat) + Math.abs(p.lon - MAP.lon);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

// ── scattered interpolation ─────────────────────────────────────────────
// The points are irregular now, so bilinear no longer applies. Inverse
// distance weighting over the nearest few points handles any layout.
// Crucially the weights depend only on geometry, so they are built once
// and reused across all 24 hours and every layer.
const MAP_IMG = 260, MAP_IDW_K = 6;
function mapBuildWeights() {
  if (MAP._wKey === MAP.tier + '|' + MAP.points.length + '|' + MAP.spanLat) return;
  const W = MAP_IMG, H = MAP_IMG, P = MAP.points;
  const [[latS, lonW], [latN, lonE]] = MAP.bounds;
  const mN = mapMerc(latN), mS = mapMerc(latS);
  // project points once
  const px = P.map(p => ({
    x: (p.lon - lonW) / ((lonE - lonW) || 1),
    y: (mN - mapMerc(p.lat)) / ((mN - mS) || 1)
  }));
  const idx = new Int16Array(W * H * MAP_IDW_K);
  const wgt = new Float32Array(W * H * MAP_IDW_K);
  const d2 = new Float64Array(P.length);
  for (let y = 0; y < H; y++) {
    const fy = y / (H - 1);
    for (let x = 0; x < W; x++) {
      const fx = x / (W - 1);
      for (let i = 0; i < P.length; i++) {
        const dx = px[i].x - fx, dy = px[i].y - fy;
        d2[i] = dx * dx + dy * dy;
      }
      // k nearest by partial selection
      const o = (y * W + x) * MAP_IDW_K;
      const used = [];
      for (let k = 0; k < MAP_IDW_K; k++) {
        let best = -1, bd = Infinity;
        for (let i = 0; i < P.length; i++) {
          if (used.indexOf(i) >= 0) continue;
          if (d2[i] < bd) { bd = d2[i]; best = i; }
        }
        if (best < 0) { idx[o + k] = -1; wgt[o + k] = 0; continue; }
        used.push(best);
        idx[o + k] = best;
        wgt[o + k] = bd < 1e-9 ? 1e9 : 1 / (bd * bd);   // IDW power 4 on d^2 => smooth
      }
      let sum = 0;
      for (let k = 0; k < MAP_IDW_K; k++) sum += wgt[o + k];
      if (sum > 0) for (let k = 0; k < MAP_IDW_K; k++) wgt[o + k] /= sum;
    }
  }
  MAP._wIdx = idx; MAP._wVal = wgt;
  MAP._wKey = MAP.tier + '|' + MAP.points.length + '|' + MAP.spanLat;
}
function mapSampleAt(vals, o) {
  let acc = 0, wsum = 0;
  for (let k = 0; k < MAP_IDW_K; k++) {
    const i = MAP._wIdx[o + k]; if (i < 0) continue;
    const v = vals[i]; if (v == null || isNaN(v)) continue;
    const w = MAP._wVal[o + k];
    acc += v * w; wsum += w;
  }
  return wsum > 0 ? acc / wsum : null;
}

function mapFrame(metric, h) {
  const fkey = mapFramesKey();
  if (!MAP.frames[fkey]) MAP.frames[fkey] = [];
  if (MAP.frames[fkey][h]) return MAP.frames[fkey][h];
  mapBuildWeights();
  const W = MAP_IMG, H = MAP_IMG;
  const layers = mapActiveLayers();
  const grids = {};
  layers.forEach(k => { grids[k] = mapBlendMetric(k)[h]; });
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * MAP_IDW_K;
      // composite each layer over what is already painted
      let R = 0, G = 0, B = 0, A = 0;
      for (const k of layers) {
        if (k === 'wind') continue;                  // arrows, not colour
        const v = mapSampleAt(grids[k], o);
        const px = (MAP_COLOR[k] || MAP_COLOR.temp)(v);
        const sa = px[3] / 255; if (sa <= 0) continue;
        if (k === 'cloud' && A > 0) {
          // cloud drains colour from what is beneath instead of tinting it
          const lum = 0.299 * R + 0.587 * G + 0.114 * B;
          R += (lum - R) * sa * 0.55; G += (lum - G) * sa * 0.55; B += (lum - B) * sa * 0.55;
          R += (238 - R) * sa * 0.30; G += (242 - G) * sa * 0.30; B += (250 - B) * sa * 0.30;
          A = A + sa * (1 - A);
          continue;
        }
        const na = sa + A * (1 - sa);
        if (na > 0) {
          R = (px[0] * sa + R * A * (1 - sa)) / na;
          G = (px[1] * sa + G * A * (1 - sa)) / na;
          B = (px[2] * sa + B * A * (1 - sa)) / na;
        }
        A = na;
      }
      const q = (y * W + x) * 4;
      img.data[q] = R; img.data[q + 1] = G; img.data[q + 2] = B; img.data[q + 3] = A * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (layers.indexOf('wind') >= 0) mapDrawWind(ctx, W, H, h);
  const url = cv.toDataURL('image/png');
  MAP.frames[fkey][h] = url;
  return url;
}

// wind as arrows — a channel of its own, legible over any colour field
function mapDrawWind(ctx, W, H, h) {
  const spd = mapBlendMetric('wind')[h];
  const dir = mapBlendMetric('_winddir')[h];
  const [[latS, lonW], [latN, lonE]] = MAP.bounds;
  const mN = mapMerc(latN), mS = mapMerc(latS);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  MAP.points.forEach((p, i) => {
    const v = spd[i]; if (v == null) return;
    const d = dir ? dir[i] : null;
    const x = ((p.lon - lonW) / ((lonE - lonW) || 1)) * W;
    const y = ((mN - mapMerc(p.lat)) / ((mN - mS) || 1)) * H;
    const len = 5 + Math.min(11, v / 6);
    const a = ((d == null ? 0 : d) + 180) * Math.PI / 180;    // pointing downwind
    const dx = Math.sin(a) * len, dy = -Math.cos(a) * len;
    ctx.strokeStyle = 'rgba(255,255,255,' + Math.min(0.92, 0.36 + v / 70).toFixed(2) + ')';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke();
    const hx = x + dx, hy = y + dy, sz = 3.4;
    ctx.beginPath();
    ctx.moveTo(hx, hy); ctx.lineTo(hx - Math.sin(a - 0.42) * sz, hy + Math.cos(a - 0.42) * sz);
    ctx.moveTo(hx, hy); ctx.lineTo(hx - Math.sin(a + 0.42) * sz, hy + Math.cos(a + 0.42) * sz);
    ctx.stroke();
  });
}

// ── the Leaflet map ─────────────────────────────────────────────────────
// ── tiles, with automatic fallback ──────────────────────────────────────
// Place names live on their own layer so they can sit ABOVE the weather
// field. If a provider fails we drop through the list rather than showing
// a blank map; the last option has names baked in, so the field is drawn
// lighter there to keep them readable.
const MAP_TILES = [
  { name: 'CARTO', dark: false,
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
    labels: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
    opts: { subdomains: 'abcd', maxZoom: 12, attribution: '&copy; OpenStreetMap &copy; CARTO' } },
  { name: 'CARTO-alt', dark: false,
    url: 'https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
    labels: 'https://basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
    opts: { maxZoom: 12, attribution: '&copy; OpenStreetMap &copy; CARTO' } },
  { name: 'OSM', dark: true,
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', labels: null,
    opts: { maxZoom: 12, attribution: '&copy; OpenStreetMap' } }
];

// Panes fix the stacking order: weather field (400) < place names (450)
// < your location pin (460). Without this the field paints over the names.
function mapEnsurePanes() {
  if (!MAP.map) return;
  [['mp-labels', 450], ['mp-pin', 460]].forEach(([name, z]) => {
    if (!MAP.map.getPane(name)) {
      MAP.map.createPane(name);
      MAP.map.getPane(name).style.zIndex = z;
      MAP.map.getPane(name).style.pointerEvents = 'none';
    }
  });
}

function mapAddTiles(idx) {
  if (!MAP.map || !MAP_TILES[idx]) return;
  const spec = MAP_TILES[idx];
  MAP.tileIdx = idx; MAP.tilesOk = 0;
  if (MAP.baseLayer) { try { MAP.map.removeLayer(MAP.baseLayer); } catch (e) {} }
  if (MAP.labelLayer) { try { MAP.map.removeLayer(MAP.labelLayer); } catch (e) {} MAP.labelLayer = null; }
  mapEnsurePanes();
  let errs = 0;
  MAP.baseLayer = L.tileLayer(spec.url,
    Object.assign({ className: spec.dark ? 'mp-tiles-dark' : '' }, spec.opts));
  MAP.baseLayer.on('tileload', () => { MAP.tilesOk++; if (MAP.tilesOk === 1) mapDiag(); });
  MAP.baseLayer.on('tileerror', () => {
    errs++;
    if (errs >= 5 && MAP.tilesOk === 0 && idx + 1 < MAP_TILES.length) {
      mapLog('tiles: ' + spec.name + ' not responding, trying ' + MAP_TILES[idx + 1].name);
      mapAddTiles(idx + 1);
    } else mapDiag();
  });
  MAP.baseLayer.addTo(MAP.map);
  if (spec.labels) {
    MAP.labelLayer = L.tileLayer(spec.labels,
      Object.assign({ pane: 'mp-labels' }, spec.opts)).addTo(MAP.map);
  }
  // basemap already carries names — ease the field back so they read
  const el = document.getElementById('mp-map');
  if (el) el.classList.toggle('mp-baked-labels', !spec.labels);
  mapMarkLocation();
  mapDiag();
}

// the chosen location, named, always on top at any zoom or range
function mapMarkLocation() {
  if (!MAP.map || typeof state === 'undefined' || state.lat == null) return;
  mapEnsurePanes();
  if (MAP.pin) { try { MAP.map.removeLayer(MAP.pin); } catch (e) {} MAP.pin = null; }
  if (MAP.pinLabel) { try { MAP.map.removeLayer(MAP.pinLabel); } catch (e) {} MAP.pinLabel = null; }
  MAP.pin = L.circleMarker([state.lat, state.lon], {
    radius: 6, color: '#fff', weight: 2.5, opacity: 1,
    fillColor: '#f87171', fillOpacity: 1, pane: 'mp-pin'
  }).addTo(MAP.map);
  let name = '';
  try {
    const el = document.getElementById('loc-name');
    if (el) name = (el.textContent || '').trim().split(',')[0];
  } catch (e) {}
  if (name) {
    MAP.pinLabel = L.marker([state.lat, state.lon], {
      pane: 'mp-pin', interactive: false,
      icon: L.divIcon({ className: 'mp-pin-lab', html: '<span>' + name + '</span>',
        iconSize: [1, 1], iconAnchor: [-9, 16] })
    }).addTo(MAP.map);
  }
}

function mapInitLeaflet() {
  if (MAP.map || typeof L === 'undefined') return;
  const el = document.getElementById('mp-map'); if (!el) return;
  // Leaflet measures its container at construction. If the tab was still
  // hidden (or mid-layout) that measurement is 0×0 and no tile is ever
  // requested — the map looks dead but the controls render fine.
  if (!el.offsetWidth || !el.offsetHeight) {
    if ((MAP._sizeTries = (MAP._sizeTries || 0) + 1) < 60) { requestAnimationFrame(mapInitLeaflet); return; }
    mapLog('container never gained a size'); return;
  }
  const lat = MAP.lat != null ? MAP.lat : (state.lat || 0);
  const lon = MAP.lon != null ? MAP.lon : (state.lon || 0);
  MAP.map = L.map(el, {
    zoomControl: false, attributionControl: true, zoomSnap: 0,
    dragging: false, touchZoom: false, scrollWheelZoom: false,
    doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false, inertia: false
  }).setView([lat, lon], 7);
  try { MAP.map.attributionControl.setPosition('topright'); } catch (e) {}
  mapEnsurePanes();
  mapAddTiles(0);
  mapKick();
  if (typeof ResizeObserver !== 'undefined') {
    try {
      MAP._ro = new ResizeObserver(() => { if (MAP.map) MAP.map.invalidateSize(); });
      MAP._ro.observe(el);
    } catch (e) {}
  }
}
// zoom so the painted area fills the view, whatever the range is set to
function mapFit() {
  if (!MAP.map || !MAP.bounds) return;
  const go = () => {
    if (!MAP.map) return;
    const b = mapViewBounds(); if (!b) return;
    MAP.map.invalidateSize();
    MAP.map.fitBounds(b, { padding: [0, 0], animate: false });
  };
  go();
  [120, 400].forEach(ms => setTimeout(go, ms));   // size can still be settling
}

// a single rAF isn't always enough on mobile after a tab becomes visible
function mapKick() {
  [0, 60, 220, 600, 1200].forEach(ms => setTimeout(() => {
    if (MAP.map) { MAP.map.invalidateSize(); }
  }, ms));
}

function mapLog(m) {
  if (typeof dbg === 'function') dbg('map: ' + m);
  MAP.log.push(m); if (MAP.log.length > 4) MAP.log.shift();
  mapDiag();
}
// a permanent one-line readout of what the map actually managed to do
function mapDiag() {
  const el = document.getElementById('mp-diag'); if (!el) return;
  const want = (typeof MODELS !== 'undefined')
    ? MODELS.filter(m => enabled.has(m.key) && !autoHidden.has(m.key)).length : 0;
  const P = MAP.points ? MAP.points.length : 0;
  const km = Math.round((MAP.spanLat || 9) * 111);
  const T = MAP_TIERS[MAP.tier] || MAP_TIERS.adaptive;
  const coreKm = Math.round(km * T.coreFrac);
  const spacing = Math.round(coreKm / Math.max(1, T.core - 1));
  const vv = MAP_VIEWS[MAP.viewIdx] || MAP_VIEWS[0];
  const shownKm = Math.round(km * vv.crop);
  const nMod = MAP.ready ? Object.keys(MAP.raw).length : mapModels().length;
  const nLay = mapActiveLayers().length + (mapActiveLayers().indexOf('wind') >= 0 ? 1 : 0);
  const cost = Math.round(Math.max(1, (nMod * nLay) / 10) * P);
  const bits = [];
  bits.push(MAP.ready ? nMod + '/' + want + ' models · ' + P + ' pts · ~' + cost + ' API calls'
    : MAP.loading ? 'fetching grid…' : 'no grid yet');
  bits.push(MAP.tier + ' grid over ' + km + 'km · core ~' + spacing + 'km');
  bits.push('layers: ' + mapActiveLayers().join(', '));
  bits.push('showing ' + shownKm + 'km' + (vv.crop < 1 ? ' (zoomed, no extra fetch)' : ''));
  bits.push('tiles: ' + (MAP.tilesOk ? MAP.tilesOk + ' loaded (' + MAP_TILES[MAP.tileIdx || 0].name + ')' : 'none yet'));
  // surface any drift between the grid and the table straight away
  if (MAP.ready) {
    try {
      const g = mapBlendMetric(MAP.metric)[MAP.hourSel][mapCentreIdx()], t = mapTableValue();
      if (g != null && t != null) {
        const d = Math.abs(g - t);
        bits.push('grid vs table: ' + g.toFixed(1) + ' / ' + t.toFixed(1)
          + (d > Math.max(0.6, Math.abs(t) * 0.06) ? ' ⚠ drift' : ' ✓'));
      }
    } catch (e) {}
  }
  if (MAP.error) bits.push('⚠ ' + MAP.error);
  if (MAP.log.length) bits.push(MAP.log[MAP.log.length - 1]);
  el.textContent = bits.join('   ·   ');
}

function mapDraw(fit) {
  if (!MAP.ready || !MAP.map) return;
  const url = mapFrame(MAP.metric, MAP.hourSel);
  if (!MAP.overlay) {
    MAP.overlay = L.imageOverlay(url, MAP.bounds, { opacity: 1, interactive: false, className: 'mp-field' }).addTo(MAP.map);
  } else {
    MAP.overlay.setUrl(url);
    MAP.overlay.setBounds(MAP.bounds);
  }
  if (fit) mapFit();
  mapMarkLocation();
  mapSyncScrub();
  mapReadout();
  mapDiag();
}

// ── UI ──────────────────────────────────────────────────────────────────
function mapLocalMs(i) {
  const off = (typeof locationOffsetSec === 'number' && locationOffsetSec != null) ? locationOffsetSec : 0;
  return Date.parse(MAP.times[i] + 'Z') + off * 1000 + new Date().getTimezoneOffset() * 60000;
}
function mapClock(i) {
  if (!MAP.times[i]) return '';
  const d = new Date(mapLocalMs(i));
  let h = d.getHours(); const m = d.getMinutes();
  const ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12;
  return h + (m ? ':' + String(m).padStart(2, '0') : '') + ap;
}

function mapBuildUI() {
  const sec = document.getElementById('map-section'); if (!sec) return;
  // tearing down a working map here caused a rebuild race on first load
  if (MAP.map) { try { MAP.map.remove(); } catch (e) {} }
  MAP.map = null; MAP.overlay = null; MAP.baseLayer = null; MAP.labelLayer = null;
  const metrics = mapMetrics();
  if (metrics.indexOf(MAP.metric) < 0) MAP.metric = metrics[0];
  mapSyncMetric();
  const on = mapActiveLayers();
  const chips = metrics.map(k =>
    `<button type="button" class="mp-chip${on.indexOf(k) >= 0 ? ' on' : ''} mp-c-${k}" data-m="${k}">${MAP_LABEL[k]}</button>`).join('');
  const detail = `<div class="mp-ctl"><div class="mp-detail" id="mp-views">`
    + MAP_VIEWS.map((v, i) => `<button type="button" class="mp-dbtn${i === MAP.viewIdx ? ' on' : ''}" data-i="${i}">${v.label}</button>`).join('')
    + `</div></div>`;
  const ticks = [0, 6, 12, 18, 23].map(i =>
    `<span class="mp-tick" style="left:${((i / 23) * 100).toFixed(2)}%">${MAP.times.length ? mapClock(i) : ''}</span>`).join('');
  sec.innerHTML =
    `<div class="mp-wrap">
      <div class="mp-chips" id="mp-chips">${chips}</div>
      <div class="mp-stage">
        <div id="mp-map"></div>
        <div class="mp-hud">
          <span class="mp-rd-val" id="mp-rd-val">—</span>
          <span class="mp-rd-extra" id="mp-rd-extra"></span>
          <div class="mp-legend" id="mp-legend"></div>
        </div>
        <div class="mp-status" id="mp-status"></div>
      </div>
      <div class="mp-timerow">
        <button type="button" class="mp-play" id="mp-play" aria-label="Play">▶</button>
        <div class="mp-track" id="mp-track">
          <div class="mp-ticks">${ticks}</div>
          <div class="mp-line" id="mp-line"></div>
          <div class="mp-orb" id="mp-orb"></div>
          <div class="mp-lab" id="mp-lab"></div>
        </div>
      </div>
      ${detail}
      <div class="mp-diag" id="mp-diag"></div>
      <div class="mp-foot">Blended across every enabled model, weighted by each one's accuracy here.</div>
    </div>`;
  MAP.built = true;
  document.getElementById('mp-chips').addEventListener('click', ev => {
    const b = ev.target.closest('.mp-chip'); if (!b) return;
    const k = b.dataset.m;
    const cur = mapActiveLayers();
    let next = cur.indexOf(k) >= 0 ? cur.filter(x => x !== k) : cur.concat([k]);
    if (!next.length) next = [k];                   // never leave the map blank
    MAP.layers = next;
    MAP.metric = LAYER_ORDER.filter(x => next.indexOf(x) >= 0).pop() || k;
    try { localStorage.setItem('wb_map_layers', next.join(',')); } catch (e) {}
    document.querySelectorAll('.mp-chip').forEach(x => x.classList.toggle('on', next.indexOf(x.dataset.m) >= 0));
    mapLegend();
    MAP.blend = {}; MAP.frames = {}; MAP.ready = false;
    mapFetch();                                     // cached per combination
  });
  document.getElementById('mp-play').addEventListener('click', mapTogglePlay);
  const vw = document.getElementById('mp-views');
  if (vw) vw.addEventListener('click', ev => {
    const b = ev.target.closest('.mp-dbtn'); if (!b) return;
    mapSetView(parseInt(b.dataset.i, 10));
  });
  mapBindScrub();
  mapLegend();
  mapDiag();
}

function mapLegend() {
  const el = document.getElementById('mp-legend'); if (!el) return;
  const layers = mapActiveLayers().filter(k => k !== 'wind');
  const rows = layers.slice(-2).map(k => {              // keep the HUD short
    const stops = MAP_LEGEND[k] || [0, 1];
    const col = MAP_COLOR[k] || MAP_COLOR.temp;
    const lo = stops[0], hi = stops[stops.length - 1], span = (hi - lo) || 1;
    const grad = [];
    for (let i = 0; i <= 24; i++) {
      const v = lo + (span * i) / 24, p = col(v);
      grad.push(`rgba(${p[0]},${p[1]},${p[2]},${(p[3] / 255).toFixed(2)}) ${((i / 24) * 100).toFixed(1)}%`);
    }
    return `<div class="mp-lg-row"><span class="mp-lg-name mp-c-t-${k}">${MAP_LABEL[k]}</span>`
      + `<div class="mp-lg-bar" style="background:linear-gradient(90deg,${grad.join(',')})"></div>`
      + `<span class="mp-lg-hi">${stops[stops.length - 1]}${MAP_UNIT[k]}</span></div>`;
  }).join('');
  const windNote = mapActiveLayers().indexOf('wind') >= 0
    ? `<div class="mp-lg-row mp-lg-note">→ arrows show wind</div>` : '';
  el.innerHTML = rows + windNote;
}

// value under the centre point, so the map always states a number
// the same figure the table shows for this hour, when we can get it
const MAP_TFIELD = { temp: 'temperature_2m', rain: 'precipitation', wind: 'windspeed_10m',
  cloud: 'cloudcover', snow: 'snowfall', gust: 'wind_gusts_10m',
  humid: 'relative_humidity_2m', press: 'surface_pressure', uv: 'uv_index' };
function mapTableValueFor(metric) {
  try {
    if (typeof refHourly !== 'function' || typeof wBlendAt !== 'function') return null;
    const ref = refHourly(); if (!ref || !ref.time) return null;
    const iso = MAP.times[MAP.hourSel]; if (!iso) return null;
    // map times are UTC; the table grid is local
    const off = (typeof locationOffsetSec === 'number' && locationOffsetSec != null) ? locationOffsetSec : 0;
    const local = new Date(Date.parse(iso + 'Z') + off * 1000).toISOString().slice(0, 16);
    const i = ref.time.indexOf(local); if (i < 0) return null;
    const field = MAP_TFIELD[metric]; if (!field) return null;
    const hz = (typeof horizonOf === 'function') ? horizonOf(local.slice(0, 10)) : 0;
    return wBlendAt(field, i, hz);
  } catch (e) { return null; }
}
function mapTableValue() { return mapTableValueFor(MAP.metric); }

function mapReadout() {
  const v = document.getElementById('mp-rd-val');
  if (!v || !MAP.ready) return;
  let val = mapTableValue();
  if (val == null) val = mapBlendMetric(MAP.metric)[MAP.hourSel][mapCentreIdx()];
  const u = MAP_UNIT[MAP.metric];
  let txt = '—';
  if (val != null) {
    txt = (MAP.metric === 'temp') ? (typeof tempDisp === 'function' ? tempDisp(val) : val.toFixed(1)) + u
      : (MAP.metric === 'rain' || MAP.metric === 'snow') ? (val < 0.05 ? '0' : val.toFixed(1)) + ' ' + u
        : (MAP.metric === 'uv') ? (Math.round(val * 10) / 10) + ''
          : Math.round(val) + (u === '%' ? u : ' ' + u);
  }
  v.textContent = txt;
  const extra = document.getElementById('mp-rd-extra');
  if (extra) {
    const others = mapActiveLayers().filter(k => k !== MAP.metric);
    extra.innerHTML = others.map(k => {
      const t = mapTableValueFor(k);
      if (t == null) return '';
      const u = MAP_UNIT[k];
      const f = (k === 'rain' || k === 'snow') ? (t < 0.05 ? '0' : t.toFixed(1))
        : (k === 'temp') ? (typeof tempDisp === 'function' ? tempDisp(t) : t.toFixed(1))
          : Math.round(t);
      return `<span class="mp-rd-x mp-c-t-${k}">${f}${u === '%' || u === '°' ? u : ' ' + u}</span>`;
    }).join('');
  }
}

function mapSyncScrub() {
  const L2 = ((MAP.hourSel / 23) * 100).toFixed(2) + '%';
  const line = document.getElementById('mp-line'), orb = document.getElementById('mp-orb'), lab = document.getElementById('mp-lab');
  if (line) line.style.left = L2;
  if (orb) orb.style.left = L2;
  if (lab) {
    lab.style.left = L2;
    lab.textContent = mapClock(MAP.hourSel);
    lab.classList.toggle('past', MAP.hourSel < MAP.nowIdx);
    lab.style.display = (MAP.scrubbing || MAP.playing || MAP.hourSel !== MAP.nowIdx) ? 'block' : 'none';
  }
  const nl = document.getElementById('mp-track');
  if (nl) nl.style.setProperty('--nowpc', ((MAP.nowIdx / 23) * 100).toFixed(2) + '%');
}

function mapBindScrub() {
  const tr = document.getElementById('mp-track'); if (!tr) return;
  let down = false;
  const setFrom = clientX => {
    const r = tr.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const h = Math.round(f * 23);
    if (h !== MAP.hourSel) { MAP.hourSel = h; mapDraw(false); } else mapSyncScrub();
  };
  tr.addEventListener('pointerdown', ev => {
    down = true; MAP.scrubbing = true; mapStop();
    try { tr.setPointerCapture(ev.pointerId); } catch (e) {}
    setFrom(ev.clientX);
  });
  tr.addEventListener('pointermove', ev => { if (down) setFrom(ev.clientX); });
  const up = () => {
    if (!down) return;
    down = false; MAP.scrubbing = false;
    if (!MAP.playing && MAP.hourSel !== MAP.nowIdx) { MAP.hourSel = MAP.nowIdx; mapDraw(false); }
    else mapSyncScrub();
  };
  tr.addEventListener('pointerup', up);
  tr.addEventListener('pointercancel', up);
}

function mapTogglePlay() { MAP.playing ? mapStop() : mapPlay(); }
function mapPlay() {
  if (!MAP.ready) return;
  MAP.playing = true;
  const b = document.getElementById('mp-play'); if (b) { b.textContent = '❚❚'; b.classList.add('on'); }
  MAP.playTimer = setInterval(() => {
    MAP.hourSel = (MAP.hourSel + 1) % 24;
    mapDraw(false);
  }, 550);
}
function mapStop() {
  MAP.playing = false;
  if (MAP.playTimer) { clearInterval(MAP.playTimer); MAP.playTimer = null; }
  const b = document.getElementById('mp-play'); if (b) { b.textContent = '▶'; b.classList.remove('on'); }
}

function mapStatus(msg) {
  const el = document.getElementById('mp-status'); if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'flex' : 'none';
}

// ── entry point, called when the Map tab is opened ──────────────────────
function mapEnsure() {
  if (!MAP.built) mapBuildUI();
  if (typeof L === 'undefined') { mapStatus('Map library did not load — check the connection.'); return; }
  mapInitLeaflet();
  if (MAP.map) requestAnimationFrame(() => MAP.map.invalidateSize());
  if (MAP.ready) { mapDraw(false); mapFit(); return; }
  if (MAP.loading) return;
  // Geolocation and the saved-location lookup both resolve after first
  // paint, so the map used to give up before the app knew where it was.
  if (state.lat == null) { mapWaitForLocation(); return; }
  mapFetch();
}
function mapWaitForLocation() {
  if (MAP._locTimer) return;
  mapStatus('Waiting for location…');
  let tries = 0;
  MAP._locTimer = setInterval(() => {
    if (state.lat != null) {
      clearInterval(MAP._locTimer); MAP._locTimer = null;
      if (MAP.map) MAP.map.setView([state.lat, state.lon], 7);
      mapFetch();
    } else if (++tries > 60) {                       // ~30s, then stop nagging
      clearInterval(MAP._locTimer); MAP._locTimer = null;
      mapStatus('No location yet — set one from the menu, then reopen the map.');
    }
  }, 500);
}
// weights changed but the grid is still valid — rebuild the blend only,
// no refetch, so toggling Weighted or a model updates the map instantly
function mapReblend() {
  // Weights changed, so blended output is stale — but the raw grid is not,
  // and the disk cache holds raw data. Keep it.
  MAP.blend = {}; MAP.frames = {};
  mapSyncMetric();
  if (typeof sectionsVisible === 'undefined' || !sectionsVisible.map) return;
  if (!MAP.built) mapBuildUI();
  mapInitLeaflet();
  if (MAP.ready) { mapDraw(true); return; }
  // nothing on screen yet — make sure a fetch is actually running
  if (!MAP.loading && !MAP._locTimer) mapFetch();
}
// the tab can already be open from saved prefs, in which case nothing
// would ever have called mapEnsure
window.addEventListener('load', () => {
  mapLoadPrefs();
  // The app's own data load races with this; re-check a few times so the
  // map can never end up visible but idle.
  [400, 1500, 3500].forEach(ms => setTimeout(() => {
    if (typeof sectionsVisible === 'undefined' || !sectionsVisible.map) return;
    if (MAP.ready || MAP.loading || MAP._locTimer) { mapEnsure(); return; }
    mapEnsure();
  }, ms));
});

// location or model changes invalidate the grid
function mapInvalidate() {
  mapStop();
  if (MAP._locTimer) { clearInterval(MAP._locTimer); MAP._locTimer = null; }
  MAP.ready = false; MAP.built = false; MAP.raw = {}; MAP.blend = {}; MAP.frames = {};
  if (MAP.overlay && MAP.map) { try { MAP.map.removeLayer(MAP.overlay); } catch (e) {} MAP.overlay = null; }
  if (MAP.map) { try { MAP.map.remove(); } catch (e) {} MAP.map = null; }
  if (typeof sectionsVisible !== 'undefined' && sectionsVisible.map) mapEnsure();
}
