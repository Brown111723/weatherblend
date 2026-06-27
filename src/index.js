// ════════════════════════════════════════════════════════════════════════
// weatherblend BOM proxy — Cloudflare Worker
// ════════════════════════════════════════════════════════════════════════
// BOM's servers send no CORS headers, so a browser can't fetch them directly.
// This Worker fetches them server-side and re-serves with Access-Control-* so
// weatherblend.html can read them.
//
// Endpoints:
//   1) Observations:  /?station=94691&state=NSW
//        - tries the known product IDs for that state until BOM returns data
//        - optional override: /?station=94691&product=IDN60801
//   2) Station list:  /?stations=1
//        - proxies BOM's stations.txt (so the app works without a local copy)
//   3) Forecast:      /?forecast=1&search=Bathurst&lat=-33.42&lon=149.58
//        - searches api.weather.bom.gov.au for the geohash, then returns the
//          hourly forecast for the first-6-char geohash (nearest match to lat/lon)
// ════════════════════════════════════════════════════════════════════════

// Candidate observation product IDs per state, in the order to try them.
// (Regional NSW obs live in IDN60801; most capital-city obs live in IDx60901;
//  Canberra/ACT lives in IDN60903.) Trying a few covers every station.
const STATE_PRODUCTS = {
  NSW: ["IDN60801", "IDN60901", "IDN60903"],
  ACT: ["IDN60903", "IDN60801", "IDN60901"],
  VIC: ["IDV60901", "IDV60801"],
  QLD: ["IDQ60901", "IDQ60801"],
  SA:  ["IDS60901", "IDS60801"],
  WA:  ["IDW60901", "IDW60801"],
  TAS: ["IDT60901", "IDT60801"],
  NT:  ["IDD60901", "IDD60801"]
};

const STATIONS_URL = "https://reg.bom.gov.au/climate/data/lists_by_element/stations.txt";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*"
};

// BOM returns 403 to bot-like requests. Mimic a real browser closely.
const BOM_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-AU,en;q=0.9",
  "Referer": "https://www.bom.gov.au/"
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...CORS }
  });
}

// Decode a geohash to its centre lat/lon (used to pick the nearest search match).
function decodeGeohash(gh) {
  if (!gh) return null;
  const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let evenBit = true, latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  for (const ch of gh.toLowerCase()) {
    const idx = base32.indexOf(ch);
    if (idx < 0) return null;
    for (let n = 4; n >= 0; n--) {
      const bit = (idx >> n) & 1;
      if (evenBit) { const mid = (lonMin + lonMax) / 2; if (bit) lonMin = mid; else lonMax = mid; }
      else { const mid = (latMin + latMax) / 2; if (bit) latMin = mid; else latMax = mid; }
      evenBit = !evenBit;
    }
  }
  return { lat: (latMin + latMax) / 2, lon: (lonMin + lonMax) / 2 };
}

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

    // ── Accuracy tracker (Cloudflare D1) ──────────────────────────────────
    //   POST /track/sync     { station, issued, forecasts:[...], actuals:[...] }
    //   GET  /track/weights?station=NNNNN&days=60
    if (url.pathname === "/track/sync"    && request.method === "POST") return trackSync(request, env);
    if (url.pathname === "/track/weights" && request.method === "GET")  return trackWeights(url, env);
    if (url.pathname === "/track/horizon" && request.method === "GET")  return trackHorizon(url, env);

    // ── Endpoint 3: BOM forecast (location search -> hourly forecast) ──────
    // /?forecast=1&search=Bathurst&lat=-33.42&lon=149.58
    if (url.searchParams.get("forecast")) {
      const search = url.searchParams.get("search") || "";
      const lat = parseFloat(url.searchParams.get("lat"));
      const lon = parseFloat(url.searchParams.get("lon"));
      if (!search) return json({ error: "Missing 'search' parameter" }, 400);
      try {
        // 1) location search -> geohash
        const sURL = `https://api.weather.bom.gov.au/v1/locations?search=${encodeURIComponent(search)}`;
        const sResp = await fetch(sURL, { headers: BOM_HEADERS });
        if (!sResp.ok) return json({ error: "BOM location search failed", status: sResp.status, url: sURL }, 502);
        const sJson = await sResp.json();
        const results = (sJson && sJson.data) || [];
        if (!results.length) return json({ error: "No BOM location match", search }, 404);

        // Pick the result nearest to the supplied coordinates (falls back to first)
        let chosen = results[0];
        if (!isNaN(lat) && !isNaN(lon)) {
          let best = Infinity;
          for (const r of results) {
            const p = decodeGeohash(r.geohash);
            if (!p) continue;
            const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2;
            if (d < best) { best = d; chosen = r; }
          }
        }
        const gh6 = (chosen.geohash || "").slice(0, 6);
        if (gh6.length < 6) return json({ error: "Bad geohash from search", chosen }, 502);

        // 2) hourly forecast for that geohash
        const fURL = `https://api.weather.bom.gov.au/v1/locations/${gh6}/forecasts/hourly`;
        const fResp = await fetch(fURL, {
          headers: BOM_HEADERS,
          cf: { cacheTtlByStatus: { "200-299": 600, "400-599": 0 }, cacheEverything: true }
        });
        if (!fResp.ok) return json({ error: "BOM forecast fetch failed", status: fResp.status, url: fURL, geohash: gh6 }, 502);
        const fJson = await fResp.json();
        return json({
          source: fURL,
          geohash: gh6,
          location: { name: chosen.name, state: chosen.state, geohash: chosen.geohash },
          data: fJson
        }, 200);
      } catch (e) {
        return json({ error: "BOM forecast error", message: String(e) }, 502);
      }
    }

    // ── Endpoint 2: stations.txt ──────────────────────────────────────────
    if (url.searchParams.get("stations")) {
      try {
        const resp = await fetch(STATIONS_URL, {
          headers: BOM_HEADERS,
          cf: { cacheTtl: 86400, cacheEverything: true } // cache 24h on Cloudflare
        });
        if (!resp.ok) {
          return json({ error: "stations.txt fetch failed", status: resp.status }, 502);
        }
        const text = await resp.text();
        return new Response(text, {
          headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS }
        });
      } catch (e) {
        return json({ error: "stations.txt fetch error", message: String(e) }, 502);
      }
    }

    // ── Endpoint 1: observations ──────────────────────────────────────────
    const station = url.searchParams.get("station");
    const explicitProduct = url.searchParams.get("product");
    const state = (url.searchParams.get("state") || "").toUpperCase();

    if (!station || !/^\d{4,6}$/.test(station)) {
      return json({
        error: "Missing or invalid 'station' parameter",
        example: "?station=94691&state=NSW"
      }, 400);
    }

    // Build the ordered list of product IDs to try.
    let products = [];
    if (explicitProduct) products.push(explicitProduct);
    if (state && STATE_PRODUCTS[state]) products.push(...STATE_PRODUCTS[state]);
    if (!products.length) {
      // No usable state — try every state's products as a last resort.
      products = Object.values(STATE_PRODUCTS).flat();
    }
    products = [...new Set(products)];

    const tried = [];
    for (const productId of products) {
      const bomUrl = `https://www.bom.gov.au/fwo/${productId}/${productId}.${station}.json`;
      try {
        const resp = await fetch(bomUrl, {
          headers: BOM_HEADERS,
          // Only cache successful responses; never cache a 403/404 (avoids stale blocks)
          cf: { cacheTtlByStatus: { "200-299": 300, "400-599": 0 }, cacheEverything: true }
        });
        tried.push(`${productId}:${resp.status}`);
        if (resp.ok) {
          const data = await resp.json();
          const obs = data && data.observations && data.observations.data;
          if (Array.isArray(obs) && obs.length) {
            return json({ source: bomUrl, productId, station, data }, 200);
          }
        }
      } catch (e) {
        tried.push(`${productId}:err`);
      }
    }

    return json({ error: "No BOM observations for station", station, state, tried }, 404);
  },

  // ── Daily cron: refresh every recently-used station, gap-free ──────────────
  async scheduled(event, env, ctx) {
    if (!env || !env.DB) return;
    try {
      const sts = ((await env.DB.prepare(
        "SELECT station,lat,lon,state,name FROM stations WHERE last_seen >= date('now','-30 days') ORDER BY last_seen DESC LIMIT 25"
      ).all()).results) || [];
      for (const st of sts) {
        try { await captureStation(env, st); }
        catch (e) { /* isolate one station's failure from the rest */ }
      }
    } catch (e) { /* swallow — cron must not throw */ }
  }
};

// ════════════════════════════════════════════════════════════════════════
// ACCURACY TRACKER  (Cloudflare D1)
// ════════════════════════════════════════════════════════════════════════
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const numOrNull = v => (v === null || v === undefined || v === "" || isNaN(Number(v))) ? null : Number(v);

// POST /track/sync — store this load's forecasts + BOM actuals, then prune.
async function trackSync(request, env) {
  if (!env || !env.DB) return json({ error: "no-db", note: "D1 binding 'DB' not configured" }, 200);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad-json" }, 400); }

  const station = String(body.station || "").trim();
  const issued  = String(body.issued  || "").trim();
  if (!station || !DATE_RE.test(issued)) return json({ error: "bad-station-or-issued" }, 400);

  const forecasts = Array.isArray(body.forecasts) ? body.forecasts.slice(0, 400) : [];
  const actuals   = Array.isArray(body.actuals)   ? body.actuals.slice(0, 60)   : [];

  try {
    await writeCapture(env, station, issued, forecasts, actuals);
    // Register the station (coords + state) so the daily cron can refresh it
    const meta = body.meta || {};
    if (meta.lat != null && meta.lon != null) {
      await env.DB.prepare(
        "INSERT INTO stations (station,lat,lon,state,name,last_seen) VALUES (?,?,?,?,?,date('now')) " +
        "ON CONFLICT(station) DO UPDATE SET lat=excluded.lat,lon=excluded.lon,state=excluded.state,name=excluded.name,last_seen=date('now')"
      ).bind(station, numOrNull(meta.lat), numOrNull(meta.lon), String(meta.state || ""), String(meta.name || "")).run();
    }
    return json({ ok: true, forecasts: forecasts.length, actuals: actuals.length });
  } catch (e) {
    return json({ error: "db-write", detail: String(e && e.message || e) }, 500);
  }
}

// Shared insert: BOM-forecast rows only (first-write-wins) + actuals (upsert) + prune.
// The 7 Open-Meteo models are no longer stored — their historical forecasts are
// pulled on demand from Open-Meteo's Previous Runs API at weight-compute time.
// Only BOM's published forecast (not in Open-Meteo) is archived here.
async function writeCapture(env, station, issued, forecasts, actuals) {
  const stmts = [];
  const fcSql = env.DB.prepare(
    "INSERT OR IGNORE INTO forecasts (station,issued,target,model,tmax,tmin,rain,wind,cloud) VALUES (?,?,?,?,?,?,?,?,?)"
  );
  for (const f of (forecasts || [])) {
    const target = String(f.target || "").trim();
    const model  = String(f.model  || "").trim();
    if (model !== "bom_forecast") continue;          // only BOM forecast is archived
    if (!DATE_RE.test(target)) continue;
    stmts.push(fcSql.bind(station, issued, target, model,
      numOrNull(f.tmax), numOrNull(f.tmin), numOrNull(f.rain), numOrNull(f.wind), numOrNull(f.cloud)));
  }
  const acSql = env.DB.prepare(
    "INSERT INTO actuals (station,target,tmax,tmin,rain,wind,cloud,source) VALUES (?,?,?,?,?,?,?,?) " +
    "ON CONFLICT(station,target) DO UPDATE SET tmax=excluded.tmax,tmin=excluded.tmin,rain=excluded.rain," +
    "wind=excluded.wind,cloud=excluded.cloud,source=excluded.source"
  );
  for (const a of (actuals || [])) {
    const target = String(a.target || "").trim();
    if (!DATE_RE.test(target)) continue;
    stmts.push(acSql.bind(station, target,
      numOrNull(a.tmax), numOrNull(a.tmin), numOrNull(a.rain), numOrNull(a.wind), numOrNull(a.cloud),
      String(a.source || "bom")));
  }
  stmts.push(env.DB.prepare("DELETE FROM forecasts WHERE issued < date('now','-120 days')"));
  stmts.push(env.DB.prepare("DELETE FROM actuals   WHERE target < date('now','-120 days')"));
  if (stmts.length) await env.DB.batch(stmts);
}

// GET /track/weights?station=&lat=&lon=&days=45
// Per-metric weights + accuracy stats, computed ON DEMAND from Open-Meteo's
// Previous Runs API (the 7 global models' historical forecasts at lead 1–7 days),
// scored against actuals = BOM observations (primary) with ERA5 reanalysis
// fallback. BOM's own published forecast comes from D1 (the only thing still
// archived). The whole result is cached per location for ~18 h.
const PREV_MODELS = ["gfs_seamless","ecmwf_ifs025","icon_seamless","gem_seamless","ukmo_seamless","cma_grapes_global","jma_seamless"];
const PREV_BASE   = ["temperature_2m","precipitation","cloud_cover","wind_speed_10m"];
const CACHE_DDL = "CREATE TABLE IF NOT EXISTS weights_cache (k TEXT PRIMARY KEY, json TEXT NOT NULL, computed_at TEXT NOT NULL)";

function cacheKey(lat, lon, days, station) {
  const latR = Math.round(lat * 10) / 10, lonR = Math.round(lon * 10) / 10;
  return `${latR}|${lonR}|${days}|${station || "-"}`;
}

async function trackWeights(url, env) {
  if (!env || !env.DB) return json({ error: "no-db" }, 200);
  const station = String(url.searchParams.get("station") || "").trim();
  const lat = parseFloat(url.searchParams.get("lat")), lon = parseFloat(url.searchParams.get("lon"));
  if (!isFinite(lat) || !isFinite(lon)) return json({ error: "missing-latlon", note: "pass &lat=&lon=" }, 400);
  let days = parseInt(url.searchParams.get("days") || "45", 10);
  if (!Number.isFinite(days)) days = 45;
  days = Math.max(14, Math.min(90, days));
  const key = cacheKey(lat, lon, days, station);

  try {
    await env.DB.prepare(CACHE_DDL).run();
    const c = await env.DB.prepare("SELECT json FROM weights_cache WHERE k=?1 AND computed_at >= datetime('now','-18 hours')").bind(key).first();
    if (c && c.json) { const obj = JSON.parse(c.json); obj.cached = true; return json(obj); }
  } catch { /* fall through to compute */ }

  let result;
  try { result = await computeWeights(env, lat, lon, station, days); }
  catch (e) { return json({ error: "compute", detail: String(e && e.message || e) }, 500); }

  try {
    await env.DB.prepare("INSERT INTO weights_cache (k,json,computed_at) VALUES (?1,?2,datetime('now')) ON CONFLICT(k) DO UPDATE SET json=excluded.json,computed_at=excluded.computed_at").bind(key, JSON.stringify(result)).run();
    await env.DB.prepare("DELETE FROM weights_cache WHERE computed_at < datetime('now','-3 days')").run();
  } catch { /* cache write best-effort */ }
  result.cached = false;
  return json(result);
}

// ── Data sources ──────────────────────────────────────────────────────────
async function fetchPrevRuns(lat, lon, model, days) {
  const vars = [];
  for (const b of PREV_BASE) for (let n = 1; n <= 7; n++) vars.push(`${b}_previous_day${n}`);
  const u = `https://previous-runs-api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&hourly=${vars.join(",")}&models=${model}&past_days=${days}&forecast_days=1&timezone=auto&wind_speed_unit=kmh`;
  try { const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); if (!r.ok) return null; return await r.json(); }
  catch { return null; }
}

// hourly previous-day arrays -> { date -> { N -> {tmax,tmin,rain,wind,cloud} } }
function aggregatePrev(h) {
  const out = {};
  if (!h || !h.time) return out;
  const T = h.time;
  for (let i = 0; i < T.length; i++) {
    const d = String(T[i]).slice(0, 10);
    let day = out[d]; if (!day) { day = {}; out[d] = day; }
    for (let n = 1; n <= 7; n++) {
      const tv = h[`temperature_2m_previous_day${n}`] && h[`temperature_2m_previous_day${n}`][i];
      const pv = h[`precipitation_previous_day${n}`]   && h[`precipitation_previous_day${n}`][i];
      const cv = h[`cloud_cover_previous_day${n}`]     && h[`cloud_cover_previous_day${n}`][i];
      const wv = h[`wind_speed_10m_previous_day${n}`]  && h[`wind_speed_10m_previous_day${n}`][i];
      if (tv == null && pv == null && cv == null && wv == null) continue;
      let o = day[n]; if (!o) { o = { tmax: null, tmin: null, rsum: 0, hasR: false, wmax: null, csum: 0, ccnt: 0 }; day[n] = o; }
      if (tv != null) { o.tmax = o.tmax == null ? tv : Math.max(o.tmax, tv); o.tmin = o.tmin == null ? tv : Math.min(o.tmin, tv); }
      if (pv != null) { o.rsum += pv; o.hasR = true; }
      if (wv != null) { o.wmax = o.wmax == null ? wv : Math.max(o.wmax, wv); }
      if (cv != null) { o.csum += cv; o.ccnt++; }
    }
  }
  for (const d in out) for (const n in out[d]) {
    const o = out[d][n];
    out[d][n] = { tmax: o.tmax, tmin: o.tmin, rain: o.hasR ? o.rsum : null, wind: o.wmax, cloud: o.ccnt ? o.csum / o.ccnt : null };
  }
  return out;
}

async function fetchEra5(lat, lon, days) {
  const end   = new Date(Date.now() - 86400000).toISOString().slice(0, 10);              // yesterday
  const start = new Date(Date.now() - (days + 1) * 86400000).toISOString().slice(0, 10);
  const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
            `&start_date=${start}&end_date=${end}` +
            `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
            `&hourly=cloud_cover&timezone=auto&wind_speed_unit=kmh`;
  try { const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); if (!r.ok) return {}; return era5ToDaily(await r.json()); }
  catch { return {}; }
}
function era5ToDaily(j) {
  const out = {}, d = j && j.daily;
  if (d && d.time) for (let i = 0; i < d.time.length; i++) {
    out[d.time[i]] = {
      tmax: d.temperature_2m_max ? d.temperature_2m_max[i] : null,
      tmin: d.temperature_2m_min ? d.temperature_2m_min[i] : null,
      rain: d.precipitation_sum  ? d.precipitation_sum[i]  : null,
      wind: d.wind_speed_10m_max ? d.wind_speed_10m_max[i] : null,
      cloud: null
    };
  }
  const h = j && j.hourly;
  if (h && h.time && h.cloud_cover) {
    const cs = {}, cn = {};
    for (let i = 0; i < h.time.length; i++) {
      const dd = String(h.time[i]).slice(0, 10), cv = h.cloud_cover[i];
      if (cv != null) { cs[dd] = (cs[dd] || 0) + cv; cn[dd] = (cn[dd] || 0) + 1; }
    }
    for (const dd in cn) { if (out[dd]) out[dd].cloud = cs[dd] / cn[dd]; else out[dd] = { tmax: null, tmin: null, rain: null, wind: null, cloud: cs[dd] / cn[dd] }; }
  }
  return out;
}

async function bomForecastMap(env, station, days) {
  const rows = ((await env.DB.prepare(
    "SELECT target,tmax,tmin,rain,wind,cloud, CAST(round(julianday(target)-julianday(issued)) AS INTEGER) AS h " +
    "FROM forecasts WHERE station=?1 AND model='bom_forecast' AND issued >= date('now',?2)"
  ).bind(station, `-${days + 7} days`).all()).results) || [];
  const out = {};
  for (const r of rows) {
    const n = r.h; if (n < 1 || n > 7) continue;
    let day = out[r.target]; if (!day) { day = {}; out[r.target] = day; }
    if (!day[n]) day[n] = { tmax: r.tmax, tmin: r.tmin, rain: r.rain, wind: r.wind, cloud: r.cloud };
  }
  return out;
}
async function bomActualsMap(env, station, days) {
  const rows = ((await env.DB.prepare(
    "SELECT target,tmax,tmin,rain,wind,cloud FROM actuals WHERE station=?1 AND target >= date('now',?2)"
  ).bind(station, `-${days} days`).all()).results) || [];
  const out = {};
  for (const r of rows) out[r.target] = { tmax: r.tmax, tmin: r.tmin, rain: r.rain, wind: r.wind, cloud: r.cloud };
  return out;
}
function mergeActuals(bom, era) {
  const out = {}, dates = new Set([...Object.keys(bom), ...Object.keys(era)]);
  for (const d of dates) {
    const b = bom[d] || {}, e = era[d] || {};
    const pick = (x, y) => (x == null ? (y == null ? null : y) : x);
    out[d] = { tmax: pick(b.tmax, e.tmax), tmin: pick(b.tmin, e.tmin), rain: pick(b.rain, e.rain), wind: pick(b.wind, e.wind), cloud: pick(b.cloud, e.cloud) };
  }
  return out;
}

// Inverse-RMSE per-metric weights from a list of per-model stats. Models below
// MINN samples for a metric inherit that model's OVERALL skill (so a model that
// can't be scored on, say, cloud still gets a sensible cloud weight).
function deriveWeights(stats) {
  const MINN = 8, METW = ["temp", "rain", "wind", "cloud"], nKey = { temp: "nTemp", rain: "nRain", wind: "nWind", cloud: "nCloud" };
  const prov = {}, scor = {};
  for (const me of METW) {
    const raw = {}, sc = [];
    for (const s of stats) if (s[nKey[me]] >= MINN && s[me] != null && isFinite(s[me])) { raw[s.model] = 1 / Math.max(0.01, s[me]); sc.push(s.model); }
    const sum = sc.reduce((a, k) => a + raw[k], 0) || 1;
    prov[me] = {}; sc.forEach(k => prov[me][k] = raw[k] / sum); scor[me] = new Set(sc);
  }
  const overall = {};
  for (const s of stats) {
    const vals = METW.map(me => scor[me].has(s.model) ? prov[me][s.model] : null).filter(v => v != null);
    overall[s.model] = vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : (stats.length ? 1 / stats.length : 0);
  }
  const weights = {};
  for (const me of METW) {
    const w = {};
    for (const s of stats) w[s.model] = scor[me].has(s.model) ? prov[me][s.model] : overall[s.model];
    const sum = stats.reduce((a, s) => a + w[s.model], 0) || 1;
    weights[me] = {}; stats.forEach(s => weights[me][s.model] = w[s.model] / sum);
  }
  return weights;
}

// Build a per-model stat list (model + temp/rain/wind/cloud RMSE & sample counts)
// from a {tmax,tmin,rain,wind,cloud}->{se,n} accumulator group.
function statsFromGroup(models, groupOf) {
  const rmse = o => (o && o.n > 0) ? Math.sqrt(o.se / o.n) : null;
  const meanOf = arr => { const v = arr.filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const out = [];
  for (const m of models) {
    const g = groupOf(m); if (!g) continue;
    const s = {
      model: m,
      temp:  meanOf([rmse(g.tmax), rmse(g.tmin)]), nTemp: g.tmax.n + g.tmin.n,
      rain:  rmse(g.rain),  nRain:  g.rain.n,
      wind:  rmse(g.wind),  nWind:  g.wind.n,
      cloud: rmse(g.cloud), nCloud: g.cloud.n
    };
    if (s.nTemp || s.nRain || s.nWind || s.nCloud) out.push(s);
  }
  return out;
}

// ── The computation ─────────────────────────────────────────────────────────
async function computeWeights(env, lat, lon, station, days) {
  if (env.DB) { try { await env.DB.prepare(CACHE_DDL).run(); } catch {} }
  const [prevResults, era, bomFc, bomAc] = await Promise.all([
    Promise.all(PREV_MODELS.map(m => fetchPrevRuns(lat, lon, m, days))),
    fetchEra5(lat, lon, days),
    (env.DB && station) ? bomForecastMap(env, station, days) : Promise.resolve({}),
    (env.DB && station) ? bomActualsMap(env, station, days)  : Promise.resolve({})
  ]);
  const actual = mergeActuals(bomAc, era);

  const fc = {};
  PREV_MODELS.forEach((m, i) => { const j = prevResults[i]; fc[m] = (j && j.hourly) ? aggregatePrev(j.hourly) : {}; });
  fc["bom_forecast"] = bomFc;
  const MODELS_ALL = [...PREV_MODELS, "bom_forecast"];

  const MET = ["tmax", "tmin", "rain", "wind", "cloud"];
  const acc = {}; MODELS_ALL.forEach(m => { acc[m] = { met: {}, hz: {} }; MET.forEach(k => acc[m].met[k] = { se: 0, n: 0 }); });
  const dayset = new Set();
  for (const m of MODELS_ALL) {
    const fm = fc[m]; if (!fm) continue;
    for (const d in fm) {
      const a = actual[d]; if (!a) continue;
      for (const n in fm[d]) {
        const f = fm[d][n];
        for (const k of MET) {
          const fv = f[k], av = a[k]; if (fv == null || av == null) continue;
          const e = (fv - av) * (fv - av);
          acc[m].met[k].se += e; acc[m].met[k].n++;
          let hz = acc[m].hz[n]; if (!hz) { hz = {}; MET.forEach(kk => hz[kk] = { se: 0, n: 0 }); acc[m].hz[n] = hz; }
          hz[k].se += e; hz[k].n++;
          dayset.add(d);
        }
      }
    }
  }

  const rmse = o => (o && o.n > 0) ? Math.sqrt(o.se / o.n) : null;
  const meanOf = arr => { const v = arr.filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

  // Pooled (all horizons) stats + weights — kept as a fallback the client uses
  // for "today" (lead 0) and any horizon beyond 7 days.
  const stats = statsFromGroup(MODELS_ALL, m => acc[m].met);
  const weights = deriveWeights(stats);

  // Per-horizon weights (lead 1–7 days): each displayed day is blended with the
  // weight set learned at its own lead time, so near days lean on near-term skill.
  const weightsByHorizon = {};
  for (let N = 1; N <= 7; N++) {
    const statsN = statsFromGroup(MODELS_ALL, m => acc[m].hz[N]);
    if (statsN.length) weightsByHorizon[N] = deriveWeights(statsN);
  }

  // Per-horizon RMSE rows (for the accuracy panel's lead-time matrix)
  const horizon = { temp: [], rain: [], wind: [], cloud: [] };
  for (const m of MODELS_ALL) {
    const a = acc[m];
    for (const n in a.hz) {
      const hz = a.hz[n], N = +n;
      const tR = meanOf([rmse(hz.tmax), rmse(hz.tmin)]), nT = hz.tmax.n + hz.tmin.n;
      if (tR != null)          horizon.temp.push({ model: m, h: N, rmse: tR, n: nT });
      if (rmse(hz.rain) != null)  horizon.rain.push({ model: m, h: N, rmse: rmse(hz.rain), n: hz.rain.n });
      if (rmse(hz.wind) != null)  horizon.wind.push({ model: m, h: N, rmse: rmse(hz.wind), n: hz.wind.n });
      if (rmse(hz.cloud) != null) horizon.cloud.push({ model: m, h: N, rmse: rmse(hz.cloud), n: hz.cloud.n });
    }
  }

  const ndays = dayset.size, MATURE_DAYS = 14;
  const pairs = stats.reduce((a, s) => a + s.nTemp + s.nRain + s.nWind + s.nCloud, 0);
  return {
    station: station || null, window: days, days: ndays, pairs,
    mature: ndays >= MATURE_DAYS, matureAt: MATURE_DAYS,
    weights: stats.length ? weights : null, weightsByHorizon, stats, horizon,
    source: "previous-runs+era5+bom", generated: new Date().toISOString()
  };
}
// ════════════════════════════════════════════════════════════════════════
// CRON CAPTURE — server-side equivalent of the client's snapshot on load
// ════════════════════════════════════════════════════════════════════════
// The cron keeps BOM observations (the actuals) fresh between visits. The 7
// global models are no longer captured here — their past forecasts are fetched
// on demand from the Previous Runs API. BOM's published forecast is archived by
// the client on visit days.
async function captureStation(env, st) {
  const lat = st.lat, lon = st.lon;
  if (lat == null || lon == null) return;
  // AEST-ish cutoff so only completed local days are written as actuals.
  const localToday = new Date(Date.now() + 10 * 3600 * 1000).toISOString().slice(0, 10);
  let actuals = [];
  try { const data = await fetchBomObsData(st.station, st.state); if (data) actuals = bomObsToDailyActuals(data, localToday); } catch { /* no obs */ }
  if (actuals.length) await writeCapture(env, st.station, localToday, [], actuals);
}
// ════════════════════════════════════════════════════════════════════════
// PER-HORIZON ACCURACY  GET /track/horizon?station=X&days=60&metric=temp
// ════════════════════════════════════════════════════════════════════════
async function trackHorizon(url, env) {
  if (!env || !env.DB) return json({ error: "no-db" }, 200);
  const station = String(url.searchParams.get("station") || "").trim();
  const lat = parseFloat(url.searchParams.get("lat")), lon = parseFloat(url.searchParams.get("lon"));
  if (!isFinite(lat) || !isFinite(lon)) return json({ error: "missing-latlon", note: "pass &lat=&lon=" }, 400);
  const metric = ["temp", "rain", "wind", "cloud"].includes(url.searchParams.get("metric")) ? url.searchParams.get("metric") : "temp";
  let days = parseInt(url.searchParams.get("days") || "45", 10);
  if (!Number.isFinite(days)) days = 45;
  days = Math.max(14, Math.min(90, days));
  const key = cacheKey(lat, lon, days, station);

  let obj = null;
  try {
    await env.DB.prepare(CACHE_DDL).run();
    const c = await env.DB.prepare("SELECT json FROM weights_cache WHERE k=?1 AND computed_at >= datetime('now','-18 hours')").bind(key).first();
    if (c && c.json) obj = JSON.parse(c.json);
  } catch { /* fall through */ }
  if (!obj) {
    try {
      obj = await computeWeights(env, lat, lon, station, days);
      await env.DB.prepare("INSERT INTO weights_cache (k,json,computed_at) VALUES (?1,?2,datetime('now')) ON CONFLICT(k) DO UPDATE SET json=excluded.json,computed_at=excluded.computed_at").bind(key, JSON.stringify(obj)).run();
    } catch (e) { return json({ error: "compute", detail: String(e && e.message || e) }, 500); }
  }
  const rows = (obj.horizon && obj.horizon[metric]) || [];
  return json({ station: station || null, window: days, metric, rows });
}
