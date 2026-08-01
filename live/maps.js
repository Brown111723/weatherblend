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
  gridN: 15,                // set from MAP_VIEWS
  spanLat: 2.6,
  bounds: null,             // [[south,west],[north,east]]
  lats: [], lons: [],
  times: [],                // UTC ISO strings, 24 of them
  nowIdx: 12,
  hourSel: 12, scrubbing: false, playing: false, playTimer: null,
  metric: 'temp',
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
const MAP_VIEWS = [
  { key: 'nearby', label: 'Nearby', n: 15, d: 2.6 },
  { key: 'region', label: 'Region', n: 11, d: 16 }
];
function mapLoadPrefs() {
  try {
    const k = localStorage.getItem('wb_map_view');
    const i = MAP_VIEWS.findIndex(v => v.key === k);
    if (i >= 0) mapApplyView(i, true);
  } catch (e) {}
}
function mapApplyView(i, quiet) {
  const v = MAP_VIEWS[i]; if (!v) return;
  MAP.viewIdx = i; MAP.gridN = v.n; MAP.spanLat = v.d;
  try { localStorage.setItem('wb_map_view', v.key); } catch (e) {}
  if (!quiet) mapRefetchSoon();
}
function mapSetView(i) {
  if (MAP.viewIdx === i) return;
  mapApplyView(i, false);
}
// Flicking between settings used to fire a full refetch per tap, which is
// what tripped the rate limit. Coalesce them, and reuse anything already
// fetched for the same settings.
function mapRefetchSoon() {
  mapBuildUI(); mapDiag();
  if (MAP._reTimer) clearTimeout(MAP._reTimer);
  MAP._reTimer = setTimeout(() => { MAP._reTimer = null; mapInvalidate(); }, 1100);
}
function mapCacheKey() {
  return [MAP.gridN, MAP.spanLat, (state.lat || 0).toFixed(3), (state.lon || 0).toFixed(3)].join('|');
}

const MAP_FIELD = {
  temp: 'temperature_2m', rain: 'precipitation', wind: 'wind_speed_10m',
  cloud: 'cloud_cover', snow: 'snowfall', gust: 'wind_gusts_10m',
  humid: 'relative_humidity_2m', press: 'surface_pressure', uv: 'uv_index'
};
const MAP_SEC = { temp: 'temp', rain: 'rain', wind: 'wind', cloud: 'cloud', snow: 'rain', gust: 'wind', humid: 'cloud', press: null, uv: null };
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

// ── fetching ────────────────────────────────────────────────────────────
function mapBuildGrid() {
  const N = MAP.gridN;
  const spanLat = MAP.spanLat || 2.6;
  const latN = Math.max(-84, Math.min(84, MAP.lat + spanLat / 2));
  const latS = Math.max(-84, Math.min(84, MAP.lat - spanLat / 2));
  // Match the box to the viewport exactly: Mercator x is longitude in
  // radians and Mercator y is the log-tangent, so making those two spans
  // equal gives a box that is precisely square once projected.
  const spanLon = Math.min(340, (mapMerc(latN) - mapMerc(latS)) * 180 / Math.PI);
  MAP.lats = []; MAP.lons = [];
  for (let r = 0; r < N; r++) MAP.lats.push(latN - ((latN - latS) * r) / (N - 1));   // north → south
  for (let c = 0; c < N; c++) MAP.lons.push(MAP.lon - spanLon / 2 + (spanLon * c) / (N - 1));
  MAP.bounds = [[MAP.lats[N - 1], MAP.lons[0]], [MAP.lats[0], MAP.lons[N - 1]]];
}

// Safety net if the combined request is rejected: the original one-model-
// per-request path, throttled two at a time so it can't trip the limiter.
async function mapFetchPerModel(models, fields, winStart, winEnd, P, report) {
  const N = MAP.gridN;
  const latCsv = [], lonCsv = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { latCsv.push(MAP.lats[r].toFixed(4)); lonCsv.push(MAP.lons[c].toFixed(4)); }
  let ok = 0, done = 0, rateLimited = false;
  const fails = [];
  const one = async m => {
    const base = `https://api.open-meteo.com${m.ep}`
      + `?latitude=${latCsv.join(',')}&longitude=${lonCsv.join(',')}`
      + `&hourly=${fields.join(',')}&models=${m.key}&timezone=UTC&wind_speed_unit=kmh`;
    const grab = async span => {
      const res = await fetch(base + span, { signal: AbortSignal.timeout(45000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      let j = await res.json();
      if (j && j.error) throw new Error(j.reason || 'API error');
      if (!Array.isArray(j)) j = [j];
      if (j.length !== P) throw new Error('grid size ' + j.length + ' ≠ ' + P);
      j.forEach(o => { if (typeof normalizeOM === 'function') normalizeOM(o); });
      if (!j[0].hourly || !j[0].hourly.time || !j[0].hourly.time.length) throw new Error('no hours');
      return j;
    };
    try {
      let j;
      try { j = await grab(`&start_hour=${winStart}&end_hour=${winEnd}`); }
      catch (e1) { j = await grab('&past_days=1&forecast_days=2'); }
      MAP.raw[m.key] = j; ok++;
    } catch (e) {
      if (/429/.test(e.message)) rateLimited = true;
      fails.push((m.label || m.key) + ': ' + e.message);
      if (typeof dbg === 'function') dbg('map ' + m.key + ': ' + e.message);
    }
    done++; mapStatus('Fetching grid… ' + done + '/' + models.length + ' models');
  };
  for (let i = 0; i < models.length; i += 2) {
    await Promise.all(models.slice(i, i + 2).map(one));
    if (i + 2 < models.length) await new Promise(r => setTimeout(r, 260));
  }
  report({ ok, fails, rateLimited });
}

async function mapFetch() {
  if (MAP.loading) return;
  const ck = mapCacheKey();
  const hit = MAP.cache[ck];
  if (hit && Date.now() - hit.at < 60 * 60000) {          // one full refresh cycle
    Object.assign(MAP, {
      raw: hit.raw, times: hit.times, nowIdx: hit.nowIdx, _offset: hit.offset,
      bounds: hit.bounds, lats: hit.lats, lons: hit.lons, gridN: hit.gridN,
      blend: {}, frames: {}, ready: true, error: null
    });
    MAP.hourSel = hit.nowIdx;
    mapStatus(''); mapLog('reused cached grid'); mapDraw(true);
    return;
  }
  MAP.loading = true; MAP.error = null; mapStatus('Fetching grid…');
  try {
    MAP.lat = state.lat; MAP.lon = state.lon;
    if (MAP.lat == null || MAP.lon == null) throw new Error('No location set');
    mapBuildGrid();
    const N = MAP.gridN, P = N * N;
    const latCsv = [], lonCsv = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { latCsv.push(MAP.lats[r].toFixed(4)); lonCsv.push(MAP.lons[c].toFixed(4)); }
    // every field, always: variables are cheap next to locations, and it
    // means switching or enabling a metric never triggers another fetch
    const fields = Object.keys(MAP_FIELD).map(k => MAP_FIELD[k]);

    const hr = Math.floor(Date.now() / 3600000) * 3600000;
    const isoH = ms => new Date(ms).toISOString().slice(0, 13) + ':00';
    const winStart = isoH(hr - 12 * 3600000), winEnd = isoH(hr + 11 * 3600000);

    const models = MODELS.filter(m => enabled.has(m.key) && !autoHidden.has(m.key));
    if (!models.length) throw new Error('No models enabled');
    MAP.raw = {};
    let ok = 0, done = 0, rateLimited = false;
    const fails = [];

    // One request for all models: the grid points are what cost, and this
    // sends them once instead of once per model.
    const keys = models.map(m => m.key);
    try {
      mapStatus('Fetching grid…');
      const url = `https://api.open-meteo.com/v1/forecast`
        + `?latitude=${latCsv.join(',')}&longitude=${lonCsv.join(',')}`
        + `&hourly=${fields.join(',')}&models=${keys.join(',')}`
        + `&start_hour=${winStart}&end_hour=${winEnd}&timezone=UTC&wind_speed_unit=kmh`;
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      let j = await res.json();
      if (j && j.error) throw new Error(j.reason || 'API error');
      if (!Array.isArray(j)) j = [j];
      if (j.length !== P) throw new Error('grid size ' + j.length + ' ≠ ' + P);
      const single = keys.length === 1;
      keys.forEach(k => {
        const per = j.map(pt => {
          const h = pt.hourly || {}, dst = { time: h.time };
          Object.keys(h).forEach(name => {
            if (name === 'time') return;
            if (single) { dst[name] = h[name]; return; }
            const suf = '_' + k;
            if (name.endsWith(suf)) dst[name.slice(0, -suf.length)] = h[name];
          });
          const o = { hourly: dst };
          if (typeof normalizeOM === 'function') normalizeOM(o);
          return o;
        });
        if (per[0] && per[0].hourly && per[0].hourly.temperature_2m
            && per[0].hourly.temperature_2m.some(v => v != null)) { MAP.raw[k] = per; ok++; }
      });
      if (!ok) throw new Error('combined grid held no usable model');
      mapLog('combined grid: ' + ok + '/' + keys.length + ' models in 1 request');
    } catch (eC) {
      mapLog('combined grid failed (' + eC.message + ') — per-model fallback');
      if (/429/.test(eC.message)) rateLimited = true;
      MAP.raw = {};
      await mapFetchPerModel(models, fields, winStart, winEnd, P, r => {
        ok = r.ok; fails.push.apply(fails, r.fails); if (r.rateLimited) rateLimited = true;
      });
    }

    if (fails.length) mapLog(fails.length + ' model(s) failed — ' + fails[0]);
    if (!ok) {
      throw new Error(rateLimited
        ? 'Open-Meteo rate limit reached — give it a minute, then reopen the map'
        : (fails.length ? fails[0] : 'No model returned grid data'));
    }
    if (rateLimited) mapLog('some models rate limited — showing the rest');

    mapAlignTimes();
    MAP.blend = {}; MAP.frames = {};
      MAP.ready = true; MAP.loading = false;
    MAP.cache[ck] = {
      at: Date.now(), raw: MAP.raw, times: MAP.times, nowIdx: MAP.nowIdx, offset: MAP._offset,
      bounds: MAP.bounds, lats: MAP.lats, lons: MAP.lons, gridN: MAP.gridN
    };
    mapStatus('');
    mapLog('grid ready (' + ok + ' models, ' + MAP.times.length + ' hours)');
    mapDraw(true);
  } catch (e) {
    MAP.loading = false; MAP.error = e.message;
    mapStatus('Could not load map data — ' + e.message);
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
  const P = MAP.gridN * MAP.gridN, keys = Object.keys(MAP.raw);
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
function mapFrame(metric, h) {
  if (!MAP.frames[metric]) MAP.frames[metric] = [];
  if (MAP.frames[metric][h]) return MAP.frames[metric][h];
  const N = MAP.gridN, W = 300, H = 300;
  const latN = MAP.lats[0], latS = MAP.lats[N - 1];
  const mN = mapMerc(latN), mS = mapMerc(latS), dLat = (latN - latS) || 1;
  const vals = mapBlendMetric(metric)[h];
  const col = MAP_COLOR[metric] || MAP_COLOR.temp;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    // Leaflet lays the image out in Web Mercator, where latitude is not
    // linear down the image — so invert properly rather than assuming it is
    const lat = mapInvMerc(mN + (mS - mN) * (y / (H - 1)));
    const gy = Math.max(0, Math.min(N - 1, ((latN - lat) / dLat) * (N - 1)));
    const r0 = Math.min(N - 1, Math.floor(gy)), r1 = Math.min(N - 1, r0 + 1), ty = gy - r0;
    for (let x = 0; x < W; x++) {
      const gx = (x / (W - 1)) * (N - 1);
      const c0 = Math.min(N - 1, Math.floor(gx)), c1 = Math.min(N - 1, c0 + 1), tx = gx - c0;
      const a = vals[r0 * N + c0], b = vals[r0 * N + c1], c = vals[r1 * N + c0], d = vals[r1 * N + c1];
      let v = null;
      if (a != null && b != null && c != null && d != null) {
        v = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
      }
      const px = col(v), o = (y * W + x) * 4;
      img.data[o] = px[0]; img.data[o + 1] = px[1]; img.data[o + 2] = px[2]; img.data[o + 3] = px[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = cv.toDataURL('image/png');
  MAP.frames[metric][h] = url;
  return url;
}

// ── tiles, with an automatic fallback ───────────────────────────────────
// If the first provider fails (blocked, rate limited, offline) we drop to
// plain OSM and darken it with a CSS filter rather than showing nothing.
const MAP_TILES = [
  { name: 'CARTO', dark: false,
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
    labels: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
    opts: { subdomains: 'abcd', maxZoom: 12, attribution: '&copy; OpenStreetMap &copy; CARTO' } },
  { name: 'OSM', dark: true,
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', labels: null,
    opts: { maxZoom: 12, attribution: '&copy; OpenStreetMap' } }
];

function mapAddTiles(idx) {
  if (!MAP.map || !MAP_TILES[idx]) return;
  const spec = MAP_TILES[idx];
  MAP.tileIdx = idx; MAP.tilesOk = 0;
  if (MAP.baseLayer) { try { MAP.map.removeLayer(MAP.baseLayer); } catch (e) {} }
  if (MAP.labelLayer) { try { MAP.map.removeLayer(MAP.labelLayer); } catch (e) {} MAP.labelLayer = null; }
  let errs = 0;
  MAP.baseLayer = L.tileLayer(spec.url, Object.assign({ className: spec.dark ? 'mp-tiles-dark' : '' }, spec.opts));
  MAP.baseLayer.on('tileload', () => { MAP.tilesOk++; if (MAP.tilesOk === 1) mapDiag(); });
  MAP.baseLayer.on('tileerror', () => {
    errs++;
    if (errs >= 5 && MAP.tilesOk === 0 && idx + 1 < MAP_TILES.length) {
      mapLog('tiles: ' + spec.name + ' not responding, switching to ' + MAP_TILES[idx + 1].name);
      mapAddTiles(idx + 1);
    } else mapDiag();
  });
  MAP.baseLayer.addTo(MAP.map);
  if (spec.labels) {
    if (!MAP.map.getPane('mp-labels')) {
      MAP.map.createPane('mp-labels');
      MAP.map.getPane('mp-labels').style.zIndex = 450;
      MAP.map.getPane('mp-labels').style.pointerEvents = 'none';
    }
    MAP.labelLayer = L.tileLayer(spec.labels, Object.assign({ pane: 'mp-labels' }, spec.opts)).addTo(MAP.map);
  }
  mapDiag();
}

// ── the Leaflet map ─────────────────────────────────────────────────────
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
  mapAddTiles(0);
  if (state.lat != null) {
    L.circleMarker([state.lat, state.lon], {
      radius: 5, color: '#fff', weight: 2, fillColor: '#f87171', fillOpacity: 1
    }).addTo(MAP.map);
  }
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
    MAP.map.invalidateSize();
    MAP.map.fitBounds(MAP.bounds, { padding: [0, 0], animate: false });
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
  const bits = [];
  bits.push(MAP.ready ? Object.keys(MAP.raw).length + '/' + want + ' models · ' + (MAP.gridN * MAP.gridN) + ' pts'
    : MAP.loading ? 'fetching grid…' : 'no grid yet');
  bits.push('tiles: ' + (MAP.tilesOk ? MAP.tilesOk + ' loaded (' + MAP_TILES[MAP.tileIdx || 0].name + ')' : 'none yet'));
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
  if (MAP.map) { try { MAP.map.remove(); } catch (e) {} MAP.map = null; MAP.overlay = null; MAP.baseLayer = null; MAP.labelLayer = null; }
  const metrics = mapMetrics();
  if (metrics.indexOf(MAP.metric) < 0) MAP.metric = metrics[0];
  const chips = metrics.map(k =>
    `<button type="button" class="mp-chip${k === MAP.metric ? ' on' : ''} mp-c-${k}" data-m="${k}">${MAP_LABEL[k]}</button>`).join('');
  const km = Math.round((MAP.spanLat || 2.6) * 111);
  const spacing = Math.round(km / (MAP.gridN - 1));
  const detail = `<div class="mp-ctl">`
    + `<div class="mp-detail" id="mp-views">`
    + MAP_VIEWS.map((v, i) => `<button type="button" class="mp-dbtn${i === MAP.viewIdx ? ' on' : ''}" data-i="${i}">${v.label}</button>`).join('')
    + `</div>`
    + `<div class="mp-ctl-note">${km}km across · ${MAP.gridN}×${MAP.gridN} points · ~${spacing}km spacing</div></div>`;
  const ticks = [0, 6, 12, 18, 23].map(i =>
    `<span class="mp-tick" style="left:${((i / 23) * 100).toFixed(2)}%">${MAP.times.length ? mapClock(i) : ''}</span>`).join('');
  sec.innerHTML =
    `<div class="mp-wrap">
      <div class="mp-chips" id="mp-chips">${chips}</div>
      <div class="mp-stage">
        <div id="mp-map"></div>
        <div class="mp-hud">
          <span class="mp-rd-val" id="mp-rd-val">—</span>
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
    MAP.metric = b.dataset.m;
    document.querySelectorAll('.mp-chip').forEach(x => x.classList.toggle('on', x === b));
    mapLegend(); mapDraw(false);
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
  const stops = MAP_LEGEND[MAP.metric] || [0, 1];
  const col = MAP_COLOR[MAP.metric] || MAP_COLOR.temp;
  const lo = stops[0], hi = stops[stops.length - 1], span = (hi - lo) || 1;
  const grad = [];
  for (let i = 0; i <= 24; i++) {
    const v = lo + (span * i) / 24, p = col(v);
    grad.push(`rgba(${p[0]},${p[1]},${p[2]},${(p[3] / 255).toFixed(2)}) ${((i / 24) * 100).toFixed(1)}%`);
  }
  el.innerHTML = `<div class="mp-lg-bar" style="background:linear-gradient(90deg,${grad.join(',')})"></div>`
    + `<div class="mp-lg-ax">${stops.map(v => `<span>${v}${MAP_UNIT[MAP.metric]}</span>`).join('')}</div>`;
}

// value under the centre point, so the map always states a number
function mapReadout() {
  const v = document.getElementById('mp-rd-val');
  if (!v || !MAP.ready) return;
  const N = MAP.gridN, mid = Math.floor(N / 2) * N + Math.floor(N / 2);
  const val = mapBlendMetric(MAP.metric)[MAP.hourSel][mid];
  const u = MAP_UNIT[MAP.metric];
  let txt = '—';
  if (val != null) {
    txt = (MAP.metric === 'temp') ? (typeof tempDisp === 'function' ? tempDisp(val) : val.toFixed(1)) + u
      : (MAP.metric === 'rain' || MAP.metric === 'snow') ? (val < 0.05 ? '0' : val.toFixed(1)) + ' ' + u
        : (MAP.metric === 'uv') ? (Math.round(val * 10) / 10) + ''
          : Math.round(val) + (u === '%' ? u : ' ' + u);
  }
  v.textContent = txt;
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
  if (!MAP.ready) return;
  MAP.blend = {}; MAP.frames = {};
  const metrics = mapMetrics();
  const stale = metrics.indexOf(MAP.metric) < 0;
  if (stale) MAP.metric = metrics[0];
  if (typeof sectionsVisible === 'undefined' || !sectionsVisible.map) return;
  mapBuildUI();          // chip row follows the metric set
  mapInitLeaflet();
  mapDraw(true);
}
// the tab can already be open from saved prefs, in which case nothing
// would ever have called mapEnsure
window.addEventListener('load', () => {
  mapLoadPrefs();
  setTimeout(() => {
    if (typeof sectionsVisible !== 'undefined' && sectionsVisible.map) mapEnsure();
  }, 500);
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
