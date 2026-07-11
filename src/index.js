var STATE_PRODUCTS = {
  NSW: ["IDN60801", "IDN60901", "IDN60903"],
  ACT: ["IDN60903", "IDN60801", "IDN60901"],
  VIC: ["IDV60901", "IDV60801"],
  QLD: ["IDQ60901", "IDQ60801"],
  SA: ["IDS60901", "IDS60801"],
  WA: ["IDW60901", "IDW60801"],
  TAS: ["IDT60901", "IDT60801"],
  NT: ["IDD60901", "IDD60801"]
};
var STATIONS_URL = "https://reg.bom.gov.au/climate/data/lists_by_element/stations.txt";
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*"
};
var BOM_HEADERS = {
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
function decodeGeohash(gh) {
  if (!gh) return null;
  const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let evenBit = true, latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  for (const ch of gh.toLowerCase()) {
    const idx = base32.indexOf(ch);
    if (idx < 0) return null;
    for (let n = 4; n >= 0; n--) {
      const bit = idx >> n & 1;
      if (evenBit) {
        const mid = (lonMin + lonMax) / 2;
        if (bit) lonMin = mid;
        else lonMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (bit) latMin = mid;
        else latMax = mid;
      }
      evenBit = !evenBit;
    }
  }
  return { lat: (latMin + latMax) / 2, lon: (lonMin + lonMax) / 2 };
}
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    if (url.pathname === "/track/sync" && request.method === "POST") return trackSync(request, env);
    if (url.pathname === "/track/weights" && request.method === "GET") return trackWeights(url, env);
    if (url.pathname === "/track/horizon" && request.method === "GET") return trackHorizon(url, env);
    if (url.pathname === "/track/receipts" && request.method === "GET") return trackReceipts(url, env);
    if (url.searchParams.get("forecast")) {
      const search = url.searchParams.get("search") || "";
      const lat = parseFloat(url.searchParams.get("lat"));
      const lon = parseFloat(url.searchParams.get("lon"));
      if (!search) return json({ error: "Missing 'search' parameter" }, 400);
      try {
        const sURL = `https://api.weather.bom.gov.au/v1/locations?search=${encodeURIComponent(search)}`;
        const sResp = await fetch(sURL, { headers: BOM_HEADERS });
        if (!sResp.ok) return json({ error: "BOM location search failed", status: sResp.status, url: sURL }, 502);
        const sJson = await sResp.json();
        const results = sJson && sJson.data || [];
        if (!results.length) return json({ error: "No BOM location match", search }, 404);
        let chosen = results[0];
        if (!isNaN(lat) && !isNaN(lon)) {
          let best = Infinity;
          for (const r of results) {
            const p = decodeGeohash(r.geohash);
            if (!p) continue;
            const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2;
            if (d < best) {
              best = d;
              chosen = r;
            }
          }
        }
        const gh6 = (chosen.geohash || "").slice(0, 6);
        if (gh6.length < 6) return json({ error: "Bad geohash from search", chosen }, 502);
        const fURL = `https://api.weather.bom.gov.au/v1/locations/${gh6}/forecasts/hourly`;
        const fResp = await fetch(fURL, {
          headers: BOM_HEADERS,
          cf: { cacheTtlByStatus: { "200-299": 600, "400-599": 0 }, cacheEverything: true }
        });
        if (!fResp.ok) return json({ error: "BOM forecast fetch failed", status: fResp.status, url: fURL, geohash: gh6 }, 502);
        const fJson = await fResp.json();
        return json({ source: fURL, geohash: gh6, location: { name: chosen.name, state: chosen.state, geohash: chosen.geohash }, data: fJson }, 200);
      } catch (e) {
        return json({ error: "BOM forecast error", message: String(e) }, 502);
      }
    }
    if (url.searchParams.get("stations")) {
      try {
        const resp = await fetch(STATIONS_URL, { headers: BOM_HEADERS, cf: { cacheTtl: 86400, cacheEverything: true } });
        if (!resp.ok) return json({ error: "stations.txt fetch failed", status: resp.status }, 502);
        const text = await resp.text();
        return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS } });
      } catch (e) {
        return json({ error: "stations.txt fetch error", message: String(e) }, 502);
      }
    }
    const station = url.searchParams.get("station");
    const explicitProduct = url.searchParams.get("product");
    const state = (url.searchParams.get("state") || "").toUpperCase();
    if (!station || !/^\d{4,6}$/.test(station)) {
      return json({ error: "Missing or invalid 'station' parameter", example: "?station=94691&state=NSW" }, 400);
    }
    const found = await fetchBomObsData(station, state, explicitProduct);
    if (found && found.data) {
      return json({ source: found.source, productId: found.productId, station, data: found.data }, 200);
    }
    return json({ error: "No BOM observations for station", station, state, tried: found && found.tried || [] }, 404);
  },
  // ── Daily cron: refresh every recently-used station, gap-free ──────────
  async scheduled(event, env, ctx) {
    if (!env || !env.DB) return;
    try {
      const sts = (await env.DB.prepare(
        "SELECT station,lat,lon,state,name FROM stations WHERE last_seen >= date('now','-30 days') ORDER BY last_seen DESC LIMIT 25"
      ).all()).results || [];
      for (const st of sts) {
        try {
          await captureStation(env, st);
        } catch (e) {
        }
      }
    } catch (e) {
    }
  }
};
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var HOUR_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:00$/;
var numOrNull = (v) => v === null || v === void 0 || v === "" || isNaN(Number(v)) ? null : Number(v);
var SHRINK_K = 60;
var W_FLOOR = 0.03;
var W_CAP = 0.4;
var BIAS_K = 30;
var WET_MM = 1;
async function trackSync(request, env) {
  if (!env || !env.DB) return json({ error: "no-db", note: "D1 binding 'DB' not configured" }, 200);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad-json" }, 400);
  }
  const station = String(body.station || "").trim();
  const issued = String(body.issued || "").trim();
  if (!station || !DATE_RE.test(issued)) return json({ error: "bad-station-or-issued" }, 400);
  const forecasts = Array.isArray(body.forecasts) ? body.forecasts.slice(0, 400) : [];
  const actuals = Array.isArray(body.actuals) ? body.actuals.slice(0, 60) : [];
  const hourly = Array.isArray(body.hourly) ? body.hourly.slice(0, 400) : [];
  try {
    await writeCapture(env, station, issued, forecasts, actuals, hourly);
    try {
      await healDailyFromArchive(env, station);
    } catch {
    }
    const meta = body.meta || {};
    if (meta.lat != null && meta.lon != null) {
      await env.DB.prepare(
        "INSERT INTO stations (station,lat,lon,state,name,last_seen) VALUES (?,?,?,?,?,date('now')) ON CONFLICT(station) DO UPDATE SET lat=excluded.lat,lon=excluded.lon,state=excluded.state,name=excluded.name,last_seen=date('now')"
      ).bind(station, numOrNull(meta.lat), numOrNull(meta.lon), String(meta.state || ""), String(meta.name || "")).run();
    }
    return json({ ok: true, actuals: actuals.length, hourly: hourly.length });
  } catch (e) {
    return json({ error: "db-write", detail: String(e && e.message || e) }, 500);
  }
}
var HOURLY_DDL = "CREATE TABLE IF NOT EXISTS actuals_hourly (station TEXT NOT NULL, ts TEXT NOT NULL, temp REAL, rain REAL, wind REAL, cloud REAL, PRIMARY KEY (station, ts))";
async function writeCapture(env, station, issued, forecasts, actuals, hourly) {
  try {
    await env.DB.prepare(HOURLY_DDL).run();
  } catch {
  }
  const stmts = [];
  const fcSql = env.DB.prepare(
    "INSERT INTO forecasts (station,issued,target,model,tmax,tmin,rain,wind,cloud) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(station,issued,target,model) DO UPDATE SET tmax=excluded.tmax,tmin=excluded.tmin,rain=excluded.rain,wind=excluded.wind,cloud=excluded.cloud"
  );
  for (const f of forecasts || []) {
    const target = String(f.target || "").trim();
    if (!DATE_RE.test(target)) continue;
    const model = String(f.model || "").trim().toLowerCase().slice(0, 32);
    if (!model) continue;
    stmts.push(fcSql.bind(
      station,
      issued,
      target,
      model,
      numOrNull(f.tmax),
      numOrNull(f.tmin),
      numOrNull(f.rain),
      numOrNull(f.wind),
      numOrNull(f.cloud)
    ));
  }
  const acSql = env.DB.prepare(
    "INSERT INTO actuals (station,target,tmax,tmin,rain,wind,cloud,source) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(station,target) DO UPDATE SET tmax=excluded.tmax,tmin=excluded.tmin,rain=excluded.rain,wind=excluded.wind,cloud=excluded.cloud,source=excluded.source"
  );
  for (const a of actuals || []) {
    const target = String(a.target || "").trim();
    if (!DATE_RE.test(target)) continue;
    stmts.push(acSql.bind(
      station,
      target,
      numOrNull(a.tmax),
      numOrNull(a.tmin),
      numOrNull(a.rain),
      numOrNull(a.wind),
      numOrNull(a.cloud),
      String(a.source || "bom")
    ));
  }
  stmts.push(env.DB.prepare("DELETE FROM forecasts WHERE issued < date('now','-120 days')"));
  stmts.push(env.DB.prepare("DELETE FROM actuals   WHERE target < date('now','-120 days')"));
  stmts.push(env.DB.prepare("DELETE FROM actuals_hourly WHERE ts < datetime('now','-120 days')"));
  if (stmts.length) await env.DB.batch(stmts);
}
var PREV_MODELS = ["gfs_seamless", "ecmwf_ifs025", "icon_seamless", "gem_seamless", "ukmo_seamless", "cma_grapes_global", "jma_seamless"];
var PREV_BASE = ["temperature_2m", "precipitation", "cloud_cover", "wind_speed_10m"];
var PREV_DAYS = 5;
var CACHE_DDL = "CREATE TABLE IF NOT EXISTS weights_cache (k TEXT PRIMARY KEY, json TEXT NOT NULL, computed_at TEXT NOT NULL)";
function cacheKey(lat, lon, days, station) {
  const latR = Math.round(lat * 10) / 10, lonR = Math.round(lon * 10) / 10;
  return `v2|${latR}|${lonR}|${days}|${station || "-"}`;
}
async function trackWeights(url, env) {
  if (!env || !env.DB) return json({ error: "no-db" }, 200);
  const station = String(url.searchParams.get("station") || "").trim();
  const lat = parseFloat(url.searchParams.get("lat")), lon = parseFloat(url.searchParams.get("lon"));
  if (!isFinite(lat) || !isFinite(lon)) return json({ error: "missing-latlon", note: "pass &lat=&lon=" }, 400);
  let days = parseInt(url.searchParams.get("days") || "60", 10);
  if (!Number.isFinite(days)) days = 60;
  days = Math.max(14, Math.min(90, days));
  const key = cacheKey(lat, lon, days, station);
  try {
    await env.DB.prepare(CACHE_DDL).run();
    const c = await env.DB.prepare("SELECT json FROM weights_cache WHERE k=?1 AND computed_at >= datetime('now','-18 hours')").bind(key).first();
    if (c && c.json) {
      const obj = JSON.parse(c.json);
      obj.cached = true;
      return json(obj);
    }
  } catch {
  }
  let result;
  try {
    result = await computeWeights(env, lat, lon, station, days);
  } catch (e) {
    return json({ error: "compute", detail: String(e && e.message || e) }, 500);
  }
  try {
    await env.DB.prepare("INSERT INTO weights_cache (k,json,computed_at) VALUES (?1,?2,datetime('now')) ON CONFLICT(k) DO UPDATE SET json=excluded.json,computed_at=excluded.computed_at").bind(key, JSON.stringify(result)).run();
    await env.DB.prepare("DELETE FROM weights_cache WHERE computed_at < datetime('now','-3 days')").run();
  } catch {
  }
  result.cached = false;
  return json(result);
}
async function fetchPrevRuns(lat, lon, model, days) {
  const vars = [];
  for (const b of PREV_BASE) for (let n = 1; n <= PREV_DAYS; n++) vars.push(`${b}_previous_day${n}`);
  const u = `https://previous-runs-api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${vars.join(",")}&models=${model}&past_days=${days}&forecast_days=1&timezone=auto&wind_speed_unit=kmh`;
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(3e4) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
function aggregatePrev(h) {
  const out = {};
  if (!h || !h.time) return out;
  const T = h.time;
  for (let i = 0; i < T.length; i++) {
    const d = String(T[i]).slice(0, 10);
    let day = out[d];
    if (!day) {
      day = {};
      out[d] = day;
    }
    for (let n = 1; n <= PREV_DAYS; n++) {
      const tv = h[`temperature_2m_previous_day${n}`] && h[`temperature_2m_previous_day${n}`][i];
      const pv = h[`precipitation_previous_day${n}`] && h[`precipitation_previous_day${n}`][i];
      const cv = h[`cloud_cover_previous_day${n}`] && h[`cloud_cover_previous_day${n}`][i];
      const wv = h[`wind_speed_10m_previous_day${n}`] && h[`wind_speed_10m_previous_day${n}`][i];
      if (tv == null && pv == null && cv == null && wv == null) continue;
      let o = day[n];
      if (!o) {
        o = { tmax: null, tmin: null, rsum: 0, hasR: false, wmax: null, csum: 0, ccnt: 0 };
        day[n] = o;
      }
      if (tv != null) {
        o.tmax = o.tmax == null ? tv : Math.max(o.tmax, tv);
        o.tmin = o.tmin == null ? tv : Math.min(o.tmin, tv);
      }
      if (pv != null) {
        o.rsum += pv;
        o.hasR = true;
      }
      if (wv != null) {
        o.wmax = o.wmax == null ? wv : Math.max(o.wmax, wv);
      }
      if (cv != null) {
        o.csum += cv;
        o.ccnt++;
      }
    }
  }
  for (const d in out) for (const n in out[d]) {
    const o = out[d][n];
    out[d][n] = { tmax: o.tmax, tmin: o.tmin, rain: o.hasR ? o.rsum : null, wind: o.wmax, cloud: o.ccnt ? o.csum / o.ccnt : null };
  }
  return out;
}
async function fetchEra5(lat, lon, days) {
  const end = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
  const start = new Date(Date.now() - (days + 1) * 864e5).toISOString().slice(0, 10);
  const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&hourly=cloud_cover&timezone=auto&wind_speed_unit=kmh`;
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(3e4) });
    if (!r.ok) return {};
    return era5ToDaily(await r.json());
  } catch {
    return {};
  }
}
function era5ToDaily(j) {
  const out = {}, d = j && j.daily;
  if (d && d.time) for (let i = 0; i < d.time.length; i++) {
    out[d.time[i]] = {
      tmax: d.temperature_2m_max ? d.temperature_2m_max[i] : null,
      tmin: d.temperature_2m_min ? d.temperature_2m_min[i] : null,
      rain: d.precipitation_sum ? d.precipitation_sum[i] : null,
      wind: d.wind_speed_10m_max ? d.wind_speed_10m_max[i] : null,
      cloud: null
    };
  }
  const h = j && j.hourly;
  if (h && h.time && h.cloud_cover) {
    const cs = {}, cn = {};
    for (let i = 0; i < h.time.length; i++) {
      const dd = String(h.time[i]).slice(0, 10), cv = h.cloud_cover[i];
      if (cv != null) {
        cs[dd] = (cs[dd] || 0) + cv;
        cn[dd] = (cn[dd] || 0) + 1;
      }
    }
    for (const dd in cn) {
      if (out[dd]) out[dd].cloud = cs[dd] / cn[dd];
      else out[dd] = { tmax: null, tmin: null, rain: null, wind: null, cloud: cs[dd] / cn[dd] };
    }
  }
  return out;
}
async function bomActualsMap(env, station, days) {
  const rows = (await env.DB.prepare(
    "SELECT target,tmax,tmin,rain,wind,cloud FROM actuals WHERE station=?1 AND target >= date('now',?2)"
  ).bind(station, `-${days} days`).all()).results || [];
  const out = {};
  for (const r of rows) out[r.target] = { tmax: r.tmax, tmin: r.tmin, rain: r.rain, wind: r.wind, cloud: r.cloud };
  return out;
}
function mergeActuals(bom, era) {
  const out = {}, dates = new Set([...Object.keys(bom), ...Object.keys(era)]);
  for (const d of dates) {
    const b = bom[d] || {}, e = era[d] || {};
    const pick = (x, y) => x == null ? y == null ? null : y : x;
    out[d] = { tmax: pick(b.tmax, e.tmax), tmin: pick(b.tmin, e.tmin), rain: pick(b.rain, e.rain), wind: pick(b.wind, e.wind), cloud: pick(b.cloud, e.cloud) };
  }
  return out;
}
function deriveWeights(stats) {
  const METW = ["temp", "rain", "wind", "cloud"];
  const nKey = { temp: "nTemp", rain: "nRain", wind: "nWind", cloud: "nCloud" };
  const errOf = (s, me) => me === "rain" ? s.rainScore != null ? s.rainScore : s.rain : s[me];
  const M = stats.length || 1;
  const weights = {};
  for (const me of METW) {
    const raw = {};
    let rsum = 0;
    for (const s of stats) {
      const e = errOf(s, me);
      if (e != null && isFinite(e) && (s[nKey[me]] || 0) > 0) {
        raw[s.model] = 1 / Math.pow(Math.max(0.05, e), 2);
        rsum += raw[s.model];
      }
    }
    const w = {};
    for (const s of stats) {
      const prov = rsum > 0 && raw[s.model] != null ? raw[s.model] / rsum : 1 / M;
      const n = s[nKey[me]] || 0;
      const lam = n / (n + SHRINK_K);
      w[s.model] = lam * prov + (1 - lam) * (1 / M);
    }
    for (const k in w) w[k] = Math.min(W_CAP, Math.max(W_FLOOR, w[k]));
    const sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
    weights[me] = {};
    for (const k in w) weights[me][k] = w[k] / sum;
  }
  return weights;
}
function deriveBiases(stats) {
  const out = { temp: {}, wind: {}, cloud: {} };
  const sh = (b, n) => b == null || !isFinite(b) ? 0 : b * ((n || 0) / ((n || 0) + BIAS_K));
  for (const s of stats) {
    out.temp[s.model] = +sh(s.tempBias, s.nTemp).toFixed(2);
    out.wind[s.model] = +sh(s.windBias, s.nWind).toFixed(2);
    out.cloud[s.model] = +sh(s.cloudBias, s.nCloud).toFixed(1);
  }
  return out;
}
function statsFromGroup(models, groupOf) {
  const rmse = (o) => o && o.n > 0 ? Math.sqrt(o.se / o.n) : null;
  const bias = (o) => o && o.n > 0 ? o.be / o.n : null;
  const meanOf = (arr) => {
    const v = arr.filter((x) => x != null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const out = [];
  for (const m of models) {
    const g = groupOf(m);
    if (!g) continue;
    const rx = g.rainX || { occN: 0, occE: 0, wetAE: 0, wetN: 0 };
    const wetMAE = rx.wetN ? rx.wetAE / rx.wetN : null;
    const occErr = rx.occN ? rx.occE / rx.occN : null;
    const rainScore = wetMAE != null && occErr != null ? wetMAE * 0.6 + occErr * 5 : null;
    const s = {
      model: m,
      temp: meanOf([rmse(g.tmax), rmse(g.tmin)]),
      nTemp: g.tmax.n + g.tmin.n,
      tempBias: meanOf([bias(g.tmax), bias(g.tmin)]),
      rain: rmse(g.rain),
      nRain: g.rain.n,
      rainScore: rainScore != null ? +rainScore.toFixed(3) : null,
      wetMAE: wetMAE != null ? +wetMAE.toFixed(2) : null,
      occErr: occErr != null ? +occErr.toFixed(3) : null,
      wind: rmse(g.wind),
      nWind: g.wind.n,
      windBias: bias(g.wind),
      cloud: rmse(g.cloud),
      nCloud: g.cloud.n,
      cloudBias: bias(g.cloud)
    };
    if (s.nTemp || s.nRain || s.nWind || s.nCloud) out.push(s);
  }
  return out;
}
async function fetchPrevBatched(lat, lon, days) {
  const out = [];
  const BATCH = 3;
  for (let i = 0; i < PREV_MODELS.length; i += BATCH) {
    const slice = PREV_MODELS.slice(i, i + BATCH);
    const res = await Promise.all(slice.map((m) => fetchPrevRuns(lat, lon, m, days)));
    out.push(...res);
  }
  return out;
}
async function computeWeights(env, lat, lon, station, days) {
  if (env.DB) {
    try {
      await env.DB.prepare(CACHE_DDL).run();
    } catch {
    }
  }
  const [prevResults, era, bomAc] = await Promise.all([
    fetchPrevBatched(lat, lon, days),
    fetchEra5(lat, lon, days),
    env.DB && station ? bomActualsMap(env, station, days) : Promise.resolve({})
  ]);
  const actual = mergeActuals(bomAc, era);
  const fc = {};
  const modelsOK = [];
  PREV_MODELS.forEach((m, i) => {
    const j = prevResults[i];
    const ok = !!(j && j.hourly);
    fc[m] = ok ? aggregatePrev(j.hourly) : {};
    if (ok) modelsOK.push(m);
  });
  const MODELS_ALL = PREV_MODELS;
  const diag = { modelsOK, modelsFailed: PREV_MODELS.filter((m) => !modelsOK.includes(m)), eraDays: Object.keys(era).length, bomActualDays: Object.keys(bomAc).length };
  const MET = ["tmax", "tmin", "rain", "wind", "cloud"];
  const newGrp = () => {
    const o = {};
    MET.forEach((k) => o[k] = { se: 0, be: 0, n: 0 });
    o.rainX = { occN: 0, occE: 0, wetAE: 0, wetN: 0 };
    return o;
  };
  const acc = {};
  MODELS_ALL.forEach((m) => {
    acc[m] = { met: newGrp(), hz: {} };
  });
  const dayset = new Set();
  for (const m of MODELS_ALL) {
    const fm = fc[m];
    if (!fm) continue;
    for (const d in fm) {
      const a = actual[d];
      if (!a) continue;
      for (const n in fm[d]) {
        const f = fm[d][n];
        let hz = acc[m].hz[n];
        if (!hz) {
          hz = newGrp();
          acc[m].hz[n] = hz;
        }
        for (const k of MET) {
          const fv = f[k], av = a[k];
          if (fv == null || av == null) continue;
          const err = fv - av, e2 = err * err;
          const g1 = acc[m].met[k];
          g1.se += e2;
          g1.be += err;
          g1.n++;
          const g2 = hz[k];
          g2.se += e2;
          g2.be += err;
          g2.n++;
          if (k === "rain") {
            const fw = fv >= WET_MM, aw = av >= WET_MM;
            for (const rx of [acc[m].met.rainX, hz.rainX]) {
              rx.occN++;
              if (fw !== aw) rx.occE++;
              if (fw || aw) {
                rx.wetAE += Math.abs(err);
                rx.wetN++;
              }
            }
          }
          dayset.add(d);
        }
      }
    }
  }
  const rmse = (o) => o && o.n > 0 ? Math.sqrt(o.se / o.n) : null;
  const meanOf = (arr) => {
    const v = arr.filter((x) => x != null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const stats = statsFromGroup(MODELS_ALL, (m) => acc[m].met);
  const weights = deriveWeights(stats);
  const biases = stats.length ? deriveBiases(stats) : null;
  const weightsByHorizon = {}, biasesByHorizon = {};
  for (let N = 1; N <= PREV_DAYS; N++) {
    const statsN = statsFromGroup(MODELS_ALL, (m) => acc[m].hz[N]);
    if (statsN.length) {
      weightsByHorizon[N] = deriveWeights(statsN);
      biasesByHorizon[N] = deriveBiases(statsN);
    }
  }
  const horizon = { temp: [], rain: [], wind: [], cloud: [] };
  for (const m of MODELS_ALL) {
    const a = acc[m];
    for (const n in a.hz) {
      const hz = a.hz[n], N = +n;
      const tR = meanOf([rmse(hz.tmax), rmse(hz.tmin)]), nT = hz.tmax.n + hz.tmin.n;
      if (tR != null) horizon.temp.push({ model: m, h: N, rmse: tR, n: nT });
      if (rmse(hz.rain) != null) horizon.rain.push({ model: m, h: N, rmse: rmse(hz.rain), n: hz.rain.n });
      if (rmse(hz.wind) != null) horizon.wind.push({ model: m, h: N, rmse: rmse(hz.wind), n: hz.wind.n });
      if (rmse(hz.cloud) != null) horizon.cloud.push({ model: m, h: N, rmse: rmse(hz.cloud), n: hz.cloud.n });
    }
  }
  const ndays = dayset.size, MATURE_DAYS = 14;
  const pairs = stats.reduce((a, s) => a + s.nTemp + s.nRain + s.nWind + s.nCloud, 0);
  return {
    station: station || null,
    window: days,
    days: ndays,
    pairs,
    mature: ndays >= MATURE_DAYS,
    matureAt: MATURE_DAYS,
    weights: stats.length ? weights : null,
    weightsByHorizon,
    biases,
    biasesByHorizon,
    stats,
    horizon,
    diag,
    source: "previous-runs+era5+bom",
    engine: "v2-bias-shrink",
    generated: (new Date()).toISOString()
  };
}
async function fetchBomObsData(station, state, explicitProduct) {
  let products = [];
  if (explicitProduct) products.push(explicitProduct);
  const st = (state || "").toUpperCase();
  if (st && STATE_PRODUCTS[st]) products.push(...STATE_PRODUCTS[st]);
  if (!products.length) products = Object.values(STATE_PRODUCTS).flat();
  products = [...new Set(products)];
  const tried = [];
  for (const productId of products) {
    const bomUrl = `https://www.bom.gov.au/fwo/${productId}/${productId}.${station}.json`;
    try {
      const resp = await fetch(bomUrl, {
        headers: BOM_HEADERS,
        cf: { cacheTtlByStatus: { "200-299": 300, "400-599": 0 }, cacheEverything: true }
      });
      tried.push(`${productId}:${resp.status}`);
      if (resp.ok) {
        const data = await resp.json();
        const obs = data && data.observations && data.observations.data;
        if (Array.isArray(obs) && obs.length) return { data, productId, source: bomUrl, tried };
      }
    } catch (e) {
      tried.push(`${productId}:err`);
    }
  }
  return { data: null, tried };
}
function parseBomRainW(val) {
  if (val == null || val === "-" || val === "") return 0;
  if (typeof val === "number") return val;
  const s = String(val).trim();
  if (s.toLowerCase() === "trace") return 0.1;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function bomObsToActuals(data, localToday) {
  const obs = data && data.observations && data.observations.data;
  if (!Array.isArray(obs) || !obs.length) return { daily: [], hourly: [] };
  obs.sort((a, b) => (a.local_date_time_full || "").localeCompare(b.local_date_time_full || ""));
  const byHour = {};
  for (const o of obs) {
    const raw = o.local_date_time_full;
    if (!raw || raw.length < 12) continue;
    const key = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:00`;
    const min = parseInt(raw.slice(10, 12), 10);
    const t = parseFloat(o.air_temp);
    const okt = o.cloud_oktas == null || o.cloud_oktas === "" ? null : parseFloat(o.cloud_oktas);
    const rec = {
      temp: !isNaN(t) && String(o.air_temp).trim() !== "" ? t : null,
      traceCum: parseBomRainW(o.rain_trace),
      wind: o.wind_spd_kmh == null || o.wind_spd_kmh === "" ? null : parseFloat(o.wind_spd_kmh),
      cloud: okt != null && !isNaN(okt) ? Math.max(0, Math.min(100, okt / 8 * 100)) : null
    };
    if (min === 0 || !(key in byHour)) byHour[key] = rec;
  }
  const keys = Object.keys(byHour).sort();
  const hourly = [];
  let prevCum = null;
  for (const k of keys) {
    const r = byHour[k];
    let inc;
    if (r.traceCum == null) inc = 0;
    else if (prevCum == null) inc = 0;
    else if (r.traceCum < prevCum) inc = r.traceCum;
    else inc = r.traceCum - prevCum;
    if (r.traceCum != null) prevCum = r.traceCum;
    hourly.push({ ts: k, temp: r.temp, rain: Math.max(0, inc), wind: r.wind, cloud: r.cloud });
  }
  const byDate = {};
  for (const h of hourly) {
    const d = h.ts.slice(0, 10);
    if (d >= localToday) continue;
    const o = byDate[d] || (byDate[d] = { tmax: null, tmin: null, rain: 0, wind: null, cs: 0, cn: 0, hasT: false, hrs: 0 });
    o.hrs++;
    if (h.temp != null) {
      o.tmax = o.tmax == null ? h.temp : Math.max(o.tmax, h.temp);
      o.tmin = o.tmin == null ? h.temp : Math.min(o.tmin, h.temp);
      o.hasT = true;
    }
    if (h.rain != null) o.rain += h.rain;
    if (h.wind != null) o.wind = o.wind == null ? h.wind : Math.max(o.wind, h.wind);
    if (h.cloud != null) {
      o.cs += h.cloud;
      o.cn++;
    }
  }
  // The fwo feed only holds ~72 h of observations, so the oldest day in the
  // window is always a truncated tail (evening hours only). Writing a daily
  // row from that slice clobbers the previously-correct full-day row — e.g.
  // a real max of 16.4° becomes the 7pm–11pm max of 8.5°. Only emit days
  // with near-complete coverage; healDailyFromArchive repairs the rest.
  const daily = Object.keys(byDate).filter((d) => byDate[d].hrs >= 20).map((d) => {
    const o = byDate[d];
    return { target: d, tmax: o.hasT ? o.tmax : null, tmin: o.hasT ? o.tmin : null, rain: o.rain, wind: o.wind, cloud: o.cn ? o.cs / o.cn : null, source: "bom" };
  });
  return { daily, hourly };
}
// actuals_hourly is the durable, gap-free record (each capture re-writes the
// full 72 h window, so days accumulate to 24 rows and stay there). Re-derive
// the daily stats from it after every write: any daily row that was ever
// truncated by the feed window gets healed back to true full-day values.
// Same-day (+10 h) local-date convention as captureStation / computeReceipts.
async function healDailyFromArchive(env, station) {
  const localToday = new Date(Date.now() + 10 * 3600 * 1e3).toISOString().slice(0, 10);
  await env.DB.prepare(
    "INSERT INTO actuals (station,target,tmax,tmin,rain,wind,cloud,source) SELECT station, substr(ts,1,10) AS d, MAX(temp), MIN(temp), SUM(rain), MAX(wind), AVG(cloud), 'bom' FROM actuals_hourly WHERE station=?1 AND ts >= datetime('now','-14 days') GROUP BY station, d HAVING COUNT(temp) >= 20 AND d < ?2 ON CONFLICT(station,target) DO UPDATE SET tmax=excluded.tmax,tmin=excluded.tmin,rain=excluded.rain,wind=excluded.wind,cloud=excluded.cloud,source=excluded.source"
  ).bind(station, localToday).run();
}
async function captureStation(env, st) {
  if (st.lat == null || st.lon == null) return;
  const localToday = new Date(Date.now() + 10 * 3600 * 1e3).toISOString().slice(0, 10);
  const found = await fetchBomObsData(st.station, st.state);
  if (!found || !found.data) return;
  const { daily, hourly } = bomObsToActuals(found.data, localToday);
  if (daily.length || hourly.length) await writeCapture(env, st.station, localToday, [], daily, hourly);
  try {
    await healDailyFromArchive(env, st.station);
  } catch (e) {
  }
}
async function trackHorizon(url, env) {
  if (!env || !env.DB) return json({ error: "no-db" }, 200);
  const station = String(url.searchParams.get("station") || "").trim();
  const lat = parseFloat(url.searchParams.get("lat")), lon = parseFloat(url.searchParams.get("lon"));
  if (!isFinite(lat) || !isFinite(lon)) return json({ error: "missing-latlon", note: "pass &lat=&lon=" }, 400);
  const metric = ["temp", "rain", "wind", "cloud"].includes(url.searchParams.get("metric")) ? url.searchParams.get("metric") : "temp";
  let days = parseInt(url.searchParams.get("days") || "60", 10);
  if (!Number.isFinite(days)) days = 60;
  days = Math.max(14, Math.min(90, days));
  const key = cacheKey(lat, lon, days, station);
  let obj = null;
  try {
    await env.DB.prepare(CACHE_DDL).run();
    const c = await env.DB.prepare("SELECT json FROM weights_cache WHERE k=?1 AND computed_at >= datetime('now','-18 hours')").bind(key).first();
    if (c && c.json) obj = JSON.parse(c.json);
  } catch {
  }
  if (!obj) {
    try {
      obj = await computeWeights(env, lat, lon, station, days);
      await env.DB.prepare("INSERT INTO weights_cache (k,json,computed_at) VALUES (?1,?2,datetime('now')) ON CONFLICT(k) DO UPDATE SET json=excluded.json,computed_at=excluded.computed_at").bind(key, JSON.stringify(obj)).run();
    } catch (e) {
      return json({ error: "compute", detail: String(e && e.message || e) }, 500);
    }
  }
  const rows = obj.horizon && obj.horizon[metric] || [];
  return json({ station: station || null, window: days, metric, rows });
}
async function trackReceipts(url, env) {
  if (!env || !env.DB) return json({ error: "no-db" }, 200);
  const station = String(url.searchParams.get("station") || "").trim();
  const lat = parseFloat(url.searchParams.get("lat")), lon = parseFloat(url.searchParams.get("lon"));
  if (!station) return json({ error: "missing-station" }, 400);
  let days = parseInt(url.searchParams.get("days") || "7", 10);
  if (!Number.isFinite(days)) days = 7;
  days = Math.max(3, Math.min(14, days));
  const latR = isFinite(lat) ? Math.round(lat * 10) / 10 : "-";
  const lonR = isFinite(lon) ? Math.round(lon * 10) / 10 : "-";
  const key = `rcpt2|${latR}|${lonR}|${days}|${station}`;
  try {
    await env.DB.prepare(CACHE_DDL).run();
    const c = await env.DB.prepare("SELECT json FROM weights_cache WHERE k=?1 AND computed_at >= datetime('now','-30 minutes')").bind(key).first();
    if (c && c.json) {
      const obj = JSON.parse(c.json);
      obj.cached = true;
      return json(obj);
    }
  } catch {
  }
  let result;
  try {
    result = await computeReceipts(env, station, lat, lon, days);
  } catch (e) {
    return json({ error: "compute", detail: String(e && e.message || e) }, 500);
  }
  try {
    await env.DB.prepare("INSERT INTO weights_cache (k,json,computed_at) VALUES (?1,?2,datetime('now')) ON CONFLICT(k) DO UPDATE SET json=excluded.json,computed_at=excluded.computed_at").bind(key, JSON.stringify(result)).run();
  } catch {
  }
  result.cached = false;
  return json(result);
}
async function computeReceipts(env, station, lat, lon, days) {
  const actuals = await bomActualsMap(env, station, days + 2);
  const stored = {};
  try {
    const rs = (await env.DB.prepare(
      "SELECT target, issued, tmax, tmin, rain FROM forecasts WHERE station=?1 AND model='blend' AND (issued = target OR issued = date(target,'-1 day')) AND target >= date('now', ?2)"
    ).bind(station, `-${days + 1} days`).all()).results || [];
    for (const r of rs) {
      const sameDay = r.issued === r.target;
      if (!stored[r.target] || sameDay && !stored[r.target].sameDay) {
        stored[r.target] = { sameDay, f: { tmax: r.tmax, tmin: r.tmin, rain: r.rain } };
      }
    }
  } catch {
  }
  const todayLocal = new Date(Date.now() + 10 * 3600 * 1e3).toISOString().slice(0, 10);
  const targets = [];
  for (let i = 1; i <= days; i++) {
    targets.push(new Date((new Date(todayLocal + "T12:00:00Z")).getTime() - i * 864e5).toISOString().slice(0, 10));
  }
  const rows = [];
  let aeT = 0, nT = 0, rainHit = 0, rainN = 0;
  for (const d of targets) {
    const a = actuals[d], st = stored[d];
    if (!a || !st) continue;
    const f = st.f;
    rows.push({
      target: d,
      src: st.sameDay ? "same-day" : "day-ahead",
      f: { tmax: f.tmax != null ? +f.tmax.toFixed(1) : null, tmin: f.tmin != null ? +f.tmin.toFixed(1) : null, rain: f.rain != null ? +f.rain.toFixed(2) : null },
      a: { tmax: a.tmax != null ? +a.tmax.toFixed(1) : null, tmin: a.tmin != null ? +a.tmin.toFixed(1) : null, rain: a.rain != null ? +a.rain.toFixed(2) : null }
    });
    if (f.tmax != null && a.tmax != null) {
      aeT += Math.abs(f.tmax - a.tmax);
      nT++;
    }
    if (f.rain != null && a.rain != null) {
      rainN++;
      if (f.rain >= WET_MM === a.rain >= WET_MM) rainHit++;
    }
  }
  const actOut = {};
  for (const d of targets) {
    const a = actuals[d];
    if (!a) continue;
    actOut[d] = { tmax: a.tmax != null ? a.tmax : null, tmin: a.tmin != null ? a.tmin : null, rain: a.rain != null ? a.rain : null };
  }
  return {
    station,
    days,
    rows,
    summary: { n: nT, tmaxMAE: nT ? +(aeT / nT).toFixed(2) : null, tminMAE: null, rainHit, rainN },
    actuals: actOut,
    generated: (new Date()).toISOString()
  };
}
