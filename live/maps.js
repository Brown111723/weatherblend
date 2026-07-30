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
  gridN: 9,                 // 9×9 = 81 points; ~34km spacing over the default box
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
  tileIdx: 0, tilesOk: 0, log: []
};

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
  const spanLat = 2.6;                                        // ~290km north-south
  const spanLon = spanLat / Math.max(0.25, Math.cos(MAP.lat * Math.PI / 180));
  MAP.lats = []; MAP.lons = [];
  for (let r = 0; r < N; r++) MAP.lats.push(MAP.lat + spanLat / 2 - (spanLat * r) / (N - 1));  // north → south
  for (let c = 0; c < N; c++) MAP.lons.push(MAP.lon - spanLon / 2 + (spanLon * c) / (N - 1));
  MAP.bounds = [[MAP.lats[N - 1], MAP.lons[0]], [MAP.lats[0], MAP.lons[N - 1]]];
}

async function mapFetch() {
  if (MAP.loading) return;
  MAP.loading = true; MAP.error = null; mapStatus('Fetching grid…');
  try {
    MAP.lat = state.lat; MAP.lon = state.lon;
    if (MAP.lat == null || MAP.lon == null) throw new Error('No location set');
    mapBuildGrid();
    const N = MAP.gridN, P = N * N;
    const latCsv = [], lonCsv = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { latCsv.push(MAP.lats[r].toFixed(4)); lonCsv.push(MAP.lons[c].toFixed(4)); }
    const fields = mapMetrics().map(k => MAP_FIELD[k]).filter(Boolean);
    if (!fields.length) throw new Error('No metrics selected');

    const models = MODELS.filter(m => enabled.has(m.key) && !autoHidden.has(m.key));
    if (!models.length) throw new Error('No models enabled');
    MAP.raw = {};
    let ok = 0, done = 0;
    const fails = [];
    await Promise.all(models.map(async m => {
      try {
        const url = `https://api.open-meteo.com${m.ep}`
          + `?latitude=${latCsv.join(',')}&longitude=${lonCsv.join(',')}`
          + `&hourly=${fields.join(',')}&models=${m.key}`
          + `&past_days=1&forecast_days=2&timezone=UTC&wind_speed_unit=kmh`;
        const res = await fetch(url, { signal: AbortSignal.timeout(40000) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        let j = await res.json();
        if (j && j.error) throw new Error(j.reason || 'API error');
        if (!Array.isArray(j)) j = [j];               // single-point responses aren't wrapped
        if (j.length !== P) throw new Error('grid size ' + j.length + ' ≠ ' + P);
        j.forEach(o => { if (typeof normalizeOM === 'function') normalizeOM(o); });
        MAP.raw[m.key] = j; ok++;
      } catch (e) {
        fails.push((m.label || m.key) + ': ' + e.message);
        if (typeof dbg === 'function') dbg('map ' + m.key + ': ' + e.message);
      }
      done++; mapStatus('Fetching grid… ' + done + '/' + models.length + ' models');
    }));
    if (fails.length) mapLog(fails.length + ' model(s) failed — ' + fails[0]);
    if (!ok) throw new Error(fails.length ? fails[0] : 'No model returned grid data');

    mapAlignTimes();
    MAP.blend = {}; MAP.frames = {};
      MAP.ready = true; MAP.loading = false;
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
  const vals = mapBlendMetric(metric)[h];
  const col = MAP_COLOR[metric] || MAP_COLOR.temp;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const gy = (y / (H - 1)) * (N - 1);
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
  MAP.map = L.map(el, { zoomControl: true, attributionControl: true }).setView([lat, lon], 7);
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
  if (fit) { MAP.map.fitBounds(MAP.bounds, { padding: [8, 8] }); mapKick(); }
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
  const metrics = mapMetrics();
  if (metrics.indexOf(MAP.metric) < 0) MAP.metric = metrics[0];
  const chips = metrics.map(k =>
    `<button type="button" class="mp-chip${k === MAP.metric ? ' on' : ''} mp-c-${k}" data-m="${k}">${MAP_LABEL[k]}</button>`).join('');
  const ticks = [0, 6, 12, 18, 23].map(i =>
    `<span class="mp-tick" style="left:${((i / 23) * 100).toFixed(2)}%">${MAP.times.length ? mapClock(i) : ''}</span>`).join('');
  sec.innerHTML =
    `<div class="mp-wrap">
      <div class="mp-chips" id="mp-chips">${chips}</div>
      <div class="mp-stage"><div id="mp-map"></div><div class="mp-status" id="mp-status"></div></div>
      <div class="mp-readout"><span class="mp-rd-val" id="mp-rd-val">—</span><span class="mp-rd-note" id="mp-rd-note"></span></div>
      <div class="mp-legend" id="mp-legend"></div>
      <div class="mp-timerow">
        <button type="button" class="mp-play" id="mp-play" aria-label="Play">▶</button>
        <div class="mp-track" id="mp-track">
          <div class="mp-ticks">${ticks}</div>
          <div class="mp-line" id="mp-line"></div>
          <div class="mp-orb" id="mp-orb"></div>
          <div class="mp-lab" id="mp-lab"></div>
        </div>
      </div>
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
  const v = document.getElementById('mp-rd-val'), n = document.getElementById('mp-rd-note');
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
  if (n) n.textContent = MAP_LABEL[MAP.metric] + ' at your location · ' + mapClock(MAP.hourSel)
    + (MAP.hourSel === MAP.nowIdx ? ' (now)' : '');
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
  const up = () => { down = false; MAP.scrubbing = false; mapSyncScrub(); };
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
  if (MAP.ready) { mapDraw(false); return; }
  if (MAP.loading) return;
  if (state.lat == null) { mapStatus('Set a location first.'); return; }
  mapFetch();
}
// weights changed but the grid is still valid — rebuild the blend only,
// no refetch, so toggling Weighted or a model updates the map instantly
function mapReblend() {
  if (!MAP.ready) return;
  MAP.blend = {}; MAP.frames = {};
  const metrics = mapMetrics();
  if (metrics.indexOf(MAP.metric) < 0) { MAP.metric = metrics[0]; MAP.built = false; mapEnsure(); return; }
  if (typeof sectionsVisible !== 'undefined' && sectionsVisible.map) mapDraw(false);
}
// the tab can already be open from saved prefs, in which case nothing
// would ever have called mapEnsure
window.addEventListener('load', () => {
  setTimeout(() => {
    if (typeof sectionsVisible !== 'undefined' && sectionsVisible.map) mapEnsure();
  }, 500);
});

// location or model changes invalidate the grid
function mapInvalidate() {
  mapStop();
  MAP.ready = false; MAP.built = false; MAP.raw = {}; MAP.blend = {}; MAP.frames = {};
  if (MAP.overlay && MAP.map) { try { MAP.map.removeLayer(MAP.overlay); } catch (e) {} MAP.overlay = null; }
  if (MAP.map) { try { MAP.map.remove(); } catch (e) {} MAP.map = null; }
  if (typeof sectionsVisible !== 'undefined' && sectionsVisible.map) mapEnsure();
}
