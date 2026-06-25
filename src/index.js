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

// Shared insert: forecasts (first-write-wins) + actuals (upsert) + prune.
async function writeCapture(env, station, issued, forecasts, actuals) {
  const stmts = [];
  const fcSql = env.DB.prepare(
    "INSERT OR IGNORE INTO forecasts (station,issued,target,model,tmax,tmin,rain,wind,cloud) VALUES (?,?,?,?,?,?,?,?,?)"
  );
  for (const f of (forecasts || [])) {
    const target = String(f.target || "").trim();
    const model  = String(f.model  || "").trim();
    if (!DATE_RE.test(target) || !model) continue;
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

// GET /track/weights?station=NNNNN&days=60 — per-metric weights + accuracy stats
async function trackWeights(url, env) {
  if (!env || !env.DB) return json({ error: "no-db" }, 200);
  const station = String(url.searchParams.get("station") || "").trim();
  if (!station) return json({ error: "missing-station" }, 400);
  let days = parseInt(url.searchParams.get("days") || "60", 10);
  if (!Number.isFinite(days)) days = 60;
  days = Math.max(7, Math.min(180, days));
  const win = `-${days} days`;
  const MINN = 8;          // min matched samples for a metric to be "scored"
  const MATURE_DAYS = 14;  // distinct verified days before weights are trusted

  try {
    const rows = (await env.DB.prepare(
      `SELECT f.model AS model,
         SUM(CASE WHEN f.tmax IS NOT NULL AND a.tmax IS NOT NULL THEN 1 ELSE 0 END) AS n_tmax,
         AVG(CASE WHEN f.tmax IS NOT NULL AND a.tmax IS NOT NULL THEN (f.tmax-a.tmax)*(f.tmax-a.tmax) END) AS mse_tmax,
         SUM(CASE WHEN f.tmin IS NOT NULL AND a.tmin IS NOT NULL THEN 1 ELSE 0 END) AS n_tmin,
         AVG(CASE WHEN f.tmin IS NOT NULL AND a.tmin IS NOT NULL THEN (f.tmin-a.tmin)*(f.tmin-a.tmin) END) AS mse_tmin,
         SUM(CASE WHEN f.rain IS NOT NULL AND a.rain IS NOT NULL THEN 1 ELSE 0 END) AS n_rain,
         AVG(CASE WHEN f.rain IS NOT NULL AND a.rain IS NOT NULL THEN (f.rain-a.rain)*(f.rain-a.rain) END) AS mse_rain,
         SUM(CASE WHEN f.wind IS NOT NULL AND a.wind IS NOT NULL THEN 1 ELSE 0 END) AS n_wind,
         AVG(CASE WHEN f.wind IS NOT NULL AND a.wind IS NOT NULL THEN (f.wind-a.wind)*(f.wind-a.wind) END) AS mse_wind,
         SUM(CASE WHEN f.cloud IS NOT NULL AND a.cloud IS NOT NULL THEN 1 ELSE 0 END) AS n_cloud,
         AVG(CASE WHEN f.cloud IS NOT NULL AND a.cloud IS NOT NULL THEN (f.cloud-a.cloud)*(f.cloud-a.cloud) END) AS mse_cloud
       FROM forecasts f JOIN actuals a ON f.station=a.station AND f.target=a.target
       WHERE f.station=?1 AND f.issued >= date('now', ?2)
       GROUP BY f.model`
    ).bind(station, win).all()).results || [];

    const meta = (await env.DB.prepare(
      `SELECT COUNT(*) AS pairs, COUNT(DISTINCT f.target) AS days
       FROM forecasts f JOIN actuals a ON f.station=a.station AND f.target=a.target
       WHERE f.station=?1 AND f.issued >= date('now', ?2)`
    ).bind(station, win).first()) || { pairs: 0, days: 0 };

    if (!rows.length) {
      return json({ station, window: days, days: meta.days || 0, pairs: meta.pairs || 0, mature: false, weights: null, stats: [] });
    }

    // Per model -> per metric RMSE + sample count
    const stats = rows.map(r => {
      const rmT = avgRmse([r.mse_tmax, r.mse_tmin]);   // temp = mean of tmax/tmin RMSE
      return {
        model: r.model,
        temp:  rmT,                 nTemp:  (r.n_tmax || 0) + (r.n_tmin || 0),
        rain:  rmse1(r.mse_rain),   nRain:  r.n_rain  || 0,
        wind:  rmse1(r.mse_wind),   nWind:  r.n_wind  || 0,
        cloud: rmse1(r.mse_cloud),  nCloud: r.n_cloud || 0
      };
    });

    // Inverse-RMSE weights per metric; models below MINN inherit overall skill
    const METS = ["temp", "rain", "wind", "cloud"];
    const nKey = { temp: "nTemp", rain: "nRain", wind: "nWind", cloud: "nCloud" };
    const prov = {}, scor = {};
    for (const m of METS) {
      const raw = {}, sc = [];
      for (const s of stats) {
        if (s[nKey[m]] >= MINN && s[m] != null && isFinite(s[m])) { raw[s.model] = 1 / Math.max(0.01, s[m]); sc.push(s.model); }
      }
      const sum = sc.reduce((a, k) => a + raw[k], 0) || 1;
      prov[m] = {}; sc.forEach(k => prov[m][k] = raw[k] / sum);
      scor[m] = new Set(sc);
    }
    const overall = {};
    for (const s of stats) {
      const vals = METS.map(m => scor[m].has(s.model) ? prov[m][s.model] : null).filter(v => v != null);
      overall[s.model] = vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : 1 / stats.length;
    }
    const weights = {};
    for (const m of METS) {
      const w = {};
      for (const s of stats) w[s.model] = scor[m].has(s.model) ? prov[m][s.model] : overall[s.model];
      const sum = stats.reduce((a, s) => a + w[s.model], 0) || 1;
      weights[m] = {}; stats.forEach(s => weights[m][s.model] = w[s.model] / sum);
    }

    return json({
      station, window: days,
      days: meta.days || 0, pairs: meta.pairs || 0,
      mature: (meta.days || 0) >= MATURE_DAYS,
      matureAt: MATURE_DAYS,
      weights, stats
    });
  } catch (e) {
    return json({ error: "db-read", detail: String(e && e.message || e) }, 500);
  }
}

function rmse1(mse) { return (mse == null || isNaN(mse)) ? null : Math.sqrt(mse); }
function avgRmse(mses) {
  const v = mses.map(rmse1).filter(x => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

// ════════════════════════════════════════════════════════════════════════
// CRON CAPTURE — server-side equivalent of the client's snapshot on load
// ════════════════════════════════════════════════════════════════════════
// The 7 Open-Meteo models (BOM's own forecast model is captured by the client
// on visit days; the cron covers the global models gap-free).
const OM_MODELS = [
  { key: "gfs_seamless",      ep: "/v1/forecast" },
  { key: "ecmwf_ifs025",      ep: "/v1/ecmwf"    },
  { key: "icon_seamless",     ep: "/v1/forecast" },
  { key: "gem_seamless",      ep: "/v1/forecast" },
  { key: "ukmo_seamless",     ep: "/v1/forecast" },
  { key: "cma_grapes_global", ep: "/v1/forecast" },
  { key: "jma_seamless",      ep: "/v1/forecast" }
];

async function fetchOpenMeteoModel(lat, lon, model, ep) {
  const u = `https://api.open-meteo.com${ep}?latitude=${lat}&longitude=${lon}` +
            `&hourly=precipitation,windspeed_10m,temperature_2m,cloudcover` +
            `&models=${model}&past_days=2&forecast_days=8&timezone=auto&wind_speed_unit=kmh`;
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// Daily aggregate for one date from a model's hourly arrays (mirrors client modelDay)
function omModelDay(hourly, dateStr) {
  if (!hourly || !hourly.time) return null;
  let tmax = null, tmin = null, rain = 0, wind = null, cs = 0, cn = 0, hasR = false, hasT = false;
  for (let i = 0; i < hourly.time.length; i++) {
    if (String(hourly.time[i]).slice(0, 10) !== dateStr) continue;
    const tv = hourly.temperature_2m ? hourly.temperature_2m[i] : null;
    if (tv != null) { tmax = tmax == null ? tv : Math.max(tmax, tv); tmin = tmin == null ? tv : Math.min(tmin, tv); hasT = true; }
    const pv = hourly.precipitation ? hourly.precipitation[i] : null;
    if (pv != null) { rain += pv; hasR = true; }
    const wv = hourly.windspeed_10m ? hourly.windspeed_10m[i] : null;
    if (wv != null) wind = wind == null ? wv : Math.max(wind, wv);
    const cv = hourly.cloudcover ? hourly.cloudcover[i] : null;
    if (cv != null) { cs += cv; cn++; }
  }
  if (!hasT && !hasR) return null;
  return { tmax, tmin, rain: hasR ? rain : null, wind, cloud: cn ? cs / cn : null };
}

// Fetch raw BOM observation JSON for a station (same product-trying as the endpoint)
async function fetchBomObsData(station, state) {
  let products = [];
  if (state && STATE_PRODUCTS[state]) products.push(...STATE_PRODUCTS[state]);
  if (!products.length) products = Object.values(STATE_PRODUCTS).flat();
  products = [...new Set(products)];
  for (const productId of products) {
    const bomUrl = `https://www.bom.gov.au/fwo/${productId}/${productId}.${station}.json`;
    try {
      const resp = await fetch(bomUrl, { headers: BOM_HEADERS, cf: { cacheTtlByStatus: { "200-299": 300, "400-599": 0 }, cacheEverything: true } });
      if (resp.ok) {
        const data = await resp.json();
        const obs = data && data.observations && data.observations.data;
        if (Array.isArray(obs) && obs.length) return data;
      }
    } catch { /* try next product */ }
  }
  return null;
}

function parseBomRainW(val) {
  if (val == null || val === "-" || val === "") return 0;
  if (typeof val === "number") return val;
  const s = String(val).trim();
  if (s.toLowerCase() === "trace") return 0.1;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// BOM observations -> completed-day actuals (mirrors client parseBomObs + bomDailyActuals)
function bomObsToDailyActuals(data, localToday) {
  const obs = (data && data.observations && data.observations.data) || [];
  if (!obs.length) return [];
  const sorted = obs.slice().sort((a, b) => String(a.local_date_time_full || "").localeCompare(String(b.local_date_time_full || "")));
  const byHour = {};
  for (const o of sorted) {
    const raw = o.local_date_time_full; if (!raw || raw.length < 12) continue;
    const yr = raw.slice(0, 4), mo = raw.slice(4, 6), dy = raw.slice(6, 8), hr = raw.slice(8, 10), mn = raw.slice(10, 12);
    const hourKey = `${yr}-${mo}-${dy}T${hr}:00`;
    const t = parseFloat(o.air_temp);
    const okt = (o.cloud_oktas == null || o.cloud_oktas === "") ? null : parseFloat(o.cloud_oktas);
    const cloud = (okt != null && !isNaN(okt)) ? Math.max(0, Math.min(100, okt / 8 * 100)) : null;
    const wspd = (o.wind_spd_kmh == null || o.wind_spd_kmh === "") ? null : parseFloat(o.wind_spd_kmh);
    const rec = {
      temp: (!isNaN(t) && String(o.air_temp).trim() !== "") ? t : null,
      traceCum: parseBomRainW(o.rain_trace),
      cloud, wind: (wspd != null && !isNaN(wspd)) ? wspd : null
    };
    if (mn === "00" || !(hourKey in byHour)) byHour[hourKey] = rec;
  }
  const keys = Object.keys(byHour).sort();
  // per-hour rain increment (reset when the 9am cumulative drops)
  const byDay = {};
  let prevCum = null;
  for (const k of keys) {
    const r = byHour[k];
    let inc;
    if (prevCum == null) inc = 0;
    else if (r.traceCum < prevCum) inc = r.traceCum;
    else inc = r.traceCum - prevCum;
    prevCum = r.traceCum;
    const d = k.slice(0, 10);
    if (d >= localToday) continue;                  // completed days only
    const o = byDay[d] || (byDay[d] = { tmax: null, tmin: null, rain: 0, wind: null, cs: 0, cn: 0, hasR: false, hasT: false });
    if (r.temp != null) { o.tmax = o.tmax == null ? r.temp : Math.max(o.tmax, r.temp); o.tmin = o.tmin == null ? r.temp : Math.min(o.tmin, r.temp); o.hasT = true; }
    o.rain += Math.max(0, inc); o.hasR = true;
    if (r.wind != null) o.wind = o.wind == null ? r.wind : Math.max(o.wind, r.wind);
    if (r.cloud != null) { o.cs += r.cloud; o.cn++; }
  }
  return Object.keys(byDay).map(d => {
    const o = byDay[d];
    return { target: d, tmax: o.hasT ? o.tmax : null, tmin: o.hasT ? o.tmin : null, rain: o.hasR ? o.rain : null, wind: o.wind, cloud: o.cn ? o.cs / o.cn : null, source: "bom" };
  }).filter(a => a.tmax != null || a.rain != null);
}

async function captureStation(env, st) {
  const lat = st.lat, lon = st.lon;
  if (lat == null || lon == null) return;
  let utcOff = null, localToday = null;
  const forecasts = [];
  for (const mm of OM_MODELS) {
    const om = await fetchOpenMeteoModel(lat, lon, mm.key, mm.ep);
    if (!om || !om.hourly || !om.hourly.time) continue;
    if (utcOff == null) {
      utcOff = om.utc_offset_seconds || 0;
      localToday = new Date(Date.now() + utcOff * 1000).toISOString().slice(0, 10);
    }
    const dates = [...new Set(om.hourly.time.map(t => String(t).slice(0, 10)))].filter(d => d >= localToday).slice(0, 8);
    for (const d of dates) { const a = omModelDay(om.hourly, d); if (a) forecasts.push({ target: d, model: mm.key, ...a }); }
  }
  if (localToday == null) localToday = new Date().toISOString().slice(0, 10);
  let actuals = [];
  try { const data = await fetchBomObsData(st.station, st.state); if (data) actuals = bomObsToDailyActuals(data, localToday); } catch { /* no obs */ }
  await writeCapture(env, st.station, localToday, forecasts, actuals);
}

// ════════════════════════════════════════════════════════════════════════
// PER-HORIZON ACCURACY  GET /track/horizon?station=X&days=60&metric=temp
// ════════════════════════════════════════════════════════════════════════
async function trackHorizon(url, env) {
  if (!env || !env.DB) return json({ error: "no-db" }, 200);
  const station = String(url.searchParams.get("station") || "").trim();
  if (!station) return json({ error: "missing-station" }, 400);
  let days = parseInt(url.searchParams.get("days") || "60", 10);
  if (!Number.isFinite(days)) days = 60;
  days = Math.max(7, Math.min(180, days));
  const win = `-${days} days`;
  const metric = ["temp", "rain", "wind", "cloud"].includes(url.searchParams.get("metric")) ? url.searchParams.get("metric") : "temp";

  // metric -> the squared-error / count expressions
  let sel;
  if (metric === "temp") {
    sel = `SUM(CASE WHEN f.tmax IS NOT NULL AND a.tmax IS NOT NULL THEN 1 ELSE 0 END)
            + SUM(CASE WHEN f.tmin IS NOT NULL AND a.tmin IS NOT NULL THEN 1 ELSE 0 END) AS n,
           AVG(CASE WHEN f.tmax IS NOT NULL AND a.tmax IS NOT NULL THEN (f.tmax-a.tmax)*(f.tmax-a.tmax) END) AS mse_a,
           AVG(CASE WHEN f.tmin IS NOT NULL AND a.tmin IS NOT NULL THEN (f.tmin-a.tmin)*(f.tmin-a.tmin) END) AS mse_b`;
  } else {
    const c = metric; // rain|wind|cloud are single columns of the same name
    sel = `SUM(CASE WHEN f.${c} IS NOT NULL AND a.${c} IS NOT NULL THEN 1 ELSE 0 END) AS n,
           AVG(CASE WHEN f.${c} IS NOT NULL AND a.${c} IS NOT NULL THEN (f.${c}-a.${c})*(f.${c}-a.${c}) END) AS mse_a,
           NULL AS mse_b`;
  }

  try {
    const rows = ((await env.DB.prepare(
      `SELECT f.model AS model,
              CAST(julianday(f.target) - julianday(f.issued) AS INTEGER) AS h,
              ${sel}
       FROM forecasts f JOIN actuals a ON f.station=a.station AND f.target=a.target
       WHERE f.station=?1 AND f.issued >= date('now', ?2)
         AND CAST(julianday(f.target) - julianday(f.issued) AS INTEGER) BETWEEN 0 AND 10
       GROUP BY f.model, h`
    ).bind(station, win).all()).results) || [];

    const out = rows.map(r => {
      const parts = [r.mse_a, r.mse_b].map(m => (m == null || isNaN(m)) ? null : Math.sqrt(m)).filter(x => x != null);
      const rmse = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
      return { model: r.model, h: r.h, rmse, n: r.n || 0 };
    }).filter(r => r.rmse != null);

    return json({ station, window: days, metric, rows: out });
  } catch (e) {
    return json({ error: "db-read", detail: String(e && e.message || e) }, 500);
  }
}
