// ════════════════════════════════════════════════════════════════════════
// bom.js — real rain-gauge observations for Australia
//
// WHY THIS EXISTS
// Rain weighting was switched off because the only global truth available
// was a gridded model analysis, and measured against a Sydney gauge it
// recorded 0.0mm during an hour in which 8.4mm fell, while inventing
// drizzle across five dry hours — 25% of the real rainfall. You cannot rank
// forecasts against a record like that.
//
// BOM publishes actual gauge readings. Where a station is close enough,
// this gives WeatherBlend genuine observation-grade truth, and rain
// weighting becomes real rather than nominal. Everywhere else the app falls
// back to the Open-Meteo analysis with rain weighting left off, and says so.
//
// THE TWO OBSTACLES
//  1. BOM sends no CORS headers, so a browser cannot read these files
//     directly. A tiny proxy is required — set BOM_PROXY below.
//  2. Each station's JSON holds only ~72 hours. Scoring needs more, so
//     readings are accumulated into localStorage and build up over time.
//
// URL SHAPE (confirmed):
//   https://www.bom.gov.au/fwo/ID{S}60801/ID{S}60801.{wmo}.json
//   S = state letter, wmo = station number
// Each observation carries lat/lon/name, which is used to verify we reached
// the station we intended — a wrong id fails safely instead of silently
// scoring against the wrong place.
// ════════════════════════════════════════════════════════════════════════

// The Cloudflare Worker that adds the CORS header BOM omits. Must end with
// ?u= — the target URL is appended to it. See BOM_WORKER_SOURCE at the
// bottom of this file for the Worker's code.
const BOM_PROXY = 'https://wb-bom.brown111723.workers.dev/?u=';
const BOM_MAX_KM = 35;         // beyond this a gauge is not your weather
const BOM_KEEP_DAYS = 21;      // how much accumulated history to retain
const BOM_HOUR = 3600000;

// Stations are keyed by WMO id and state product letter. Every id below was
// checked against BOM's own "Latest Weather Observations" page for that
// station (October 2026). If one is ever wrong, the response's own lat/lon
// catches it and the next-nearest station is tried instead.
const BOM_STATIONS = [
  // NSW / ACT — IDN60801
  { wmo: 94768, st: 'N', name: 'Sydney (Observatory Hill)', lat: -33.8607, lon: 151.2050 },
  { wmo: 94767, st: 'N', name: 'Sydney Airport',            lat: -33.9465, lon: 151.1731 },
  { wmo: 95753, st: 'N', name: 'Richmond',                  lat: -33.6004, lon: 150.7761 },
  { wmo: 94744, st: 'N', name: 'Katoomba',                  lat: -33.7127, lon: 150.3021 },
  { wmo: 95719, st: 'N', name: 'Dubbo Airport',             lat: -32.2206, lon: 148.5753 },
  { wmo: 95695, st: 'N', name: 'Wilcannia Airport',         lat: -31.5000, lon: 143.4000 },
  { wmo: 95909, st: 'N', name: 'Thredbo Top Station',       lat: -36.5000, lon: 148.3000 },
  { wmo: 94926, st: 'N', name: 'Canberra Airport',          lat: -35.3088, lon: 149.2000 },
  { wmo: 94774, st: 'N', name: 'Newcastle Nobbys',          lat: -32.9185, lon: 151.7981 },
  { wmo: 94776, st: 'N', name: 'Williamtown RAAF',          lat: -32.7932, lon: 151.8358 },
  { wmo: 94910, st: 'N', name: 'Wagga Wagga AMO',           lat: -35.1583, lon: 147.4573 },
  { wmo: 95729, st: 'N', name: 'Coffs Harbour Airport',     lat: -30.3107, lon: 153.1187 },
  { wmo: 94703, st: 'N', name: 'Bourke Airport',            lat: -30.0392, lon: 145.9522 },
  { wmo: 94799, st: 'N', name: 'Port Macquarie Airport',    lat: -31.4358, lon: 152.8631 },
  { wmo: 94750, st: 'N', name: 'Nowra',                     lat: -34.9469, lon: 150.5375 },
  // VIC — IDV60801
  { wmo: 95936, st: 'V', name: 'Melbourne (Olympic Park)',  lat: -37.8255, lon: 144.9816 },
  { wmo: 94866, st: 'V', name: 'Melbourne Airport',         lat: -37.6655, lon: 144.8321 },
  { wmo: 94857, st: 'V', name: 'Geelong Racecourse',        lat: -38.1737, lon: 144.3756 },
  { wmo: 94852, st: 'V', name: 'Ballarat Aerodrome',        lat: -37.5127, lon: 143.7911 },
  { wmo: 94693, st: 'V', name: 'Mildura Airport',           lat: -34.2358, lon: 142.0867 },
  { wmo: 94855, st: 'V', name: 'Bendigo Airport',           lat: -36.7395, lon: 144.3306 },
  // QLD — IDQ60801
  { wmo: 94576, st: 'Q', name: 'Brisbane',                  lat: -27.4808, lon: 153.0389 },
  { wmo: 94578, st: 'Q', name: 'Brisbane Airport',          lat: -27.3917, lon: 153.1292 },
  { wmo: 94580, st: 'Q', name: 'Gold Coast Seaway',         lat: -27.9386, lon: 153.4283 },
  { wmo: 94287, st: 'Q', name: 'Cairns Aero',               lat: -16.8736, lon: 145.7458 },
  { wmo: 94294, st: 'Q', name: 'Townsville Aero',           lat: -19.2483, lon: 146.7661 },
  { wmo: 94374, st: 'Q', name: 'Rockhampton Aero',          lat: -23.3753, lon: 150.4775 },
  { wmo: 95551, st: 'Q', name: 'Toowoomba Airport',         lat: -27.5425, lon: 151.9134 },
  // SA — IDS60801
  { wmo: 94648, st: 'S', name: 'Adelaide (West Terrace)',   lat: -34.9257, lon: 138.5832 },
  { wmo: 94672, st: 'S', name: 'Adelaide Airport',          lat: -34.9524, lon: 138.5204 },
  { wmo: 94653, st: 'S', name: 'Ceduna AMO',                lat: -32.1297, lon: 133.6975 },
  { wmo: 94821, st: 'S', name: 'Mount Gambier Aero',        lat: -37.7473, lon: 140.7739 },
  { wmo: 95666, st: 'S', name: 'Port Augusta',              lat: -32.5069, lon: 137.7167 },
  // WA — IDW60801
  { wmo: 94608, st: 'W', name: 'Perth',                     lat: -31.9192, lon: 115.8728 },
  { wmo: 94610, st: 'W', name: 'Perth Airport',             lat: -31.9275, lon: 115.9764 },
  { wmo: 94403, st: 'W', name: 'Geraldton Airport',         lat: -28.7953, lon: 114.6989 },
  { wmo: 94802, st: 'W', name: 'Albany Airport',            lat: -34.9425, lon: 117.8022 },
  { wmo: 94312, st: 'W', name: 'Port Hedland Airport',      lat: -20.3714, lon: 118.6303 },
  { wmo: 94637, st: 'W', name: 'Kalgoorlie-Boulder Airport',lat: -30.7847, lon: 121.4533 },
  { wmo: 94203, st: 'W', name: 'Broome Airport',            lat: -17.9475, lon: 122.2353 },
  // TAS — IDT60801
  { wmo: 94970, st: 'T', name: 'Hobart (Ellerslie Road)',   lat: -42.8897, lon: 147.3278 },
  { wmo: 94975, st: 'T', name: 'Hobart Airport',            lat: -42.8339, lon: 147.5033 },
  { wmo: 94969, st: 'T', name: 'Launceston (Ti Tree Bend)', lat: -41.4194, lon: 147.1219 },
  { wmo: 95966, st: 'T', name: 'Launceston Airport',        lat: -41.5453, lon: 147.2144 },
  // NT — IDD60801
  { wmo: 94120, st: 'D', name: 'Darwin Airport',            lat: -12.4239, lon: 130.8925 },
  { wmo: 94326, st: 'D', name: 'Alice Springs Airport',     lat: -23.7951, lon: 133.8890 },
  { wmo: 94131, st: 'D', name: 'Tindal (Katherine)',        lat: -14.5211, lon: 132.3775 }
];

function bomKm(aLat, aLon, bLat, bLon) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// nearest candidates, closest first — several are returned so a bad id can
// be skipped rather than losing gauge truth entirely
function bomCandidates(lat, lon, maxKm) {
  return BOM_STATIONS
    .map(s => ({ ...s, km: bomKm(lat, lon, s.lat, s.lon) }))
    .filter(s => s.km <= (maxKm || BOM_MAX_KM))
    .sort((a, b) => a.km - b.km)
    .slice(0, 3);
}

function bomUrl(st) {
  return `https://www.bom.gov.au/fwo/ID${st.st}60801/ID${st.st}60801.${st.wmo}.json`;
}

// ── from a running total to hours ───────────────────────────────────────
// rain_trace is the total since 9am, read every half hour (plus specials).
// The rain between two readings is their difference — or, when the total
// drops, the 9am reset happened and the new reading is all since then.
//
// Each amount belongs to the hour it FELL in. A reading at 04:30 and one at
// exactly 05:00 both close part of the 04:00–05:00 hour, so a bucket is the
// hour that ENDS at or after its closing reading. The first version filed
// rain under the hour the reading was TAKEN, which put 04:00–04:30 in the
// 4am hour but 04:30–05:00 in the 5am hour: half of every hour's rain sat
// one hour early.
//
// Buckets follow the location's own clock hours and are keyed by the UTC
// instant each hour starts. Stored keys therefore survive a daylight-saving
// change; the old local-time keys would have slipped an hour against the
// forecast labels the day the clocks went forward.
//
// An hour is COMPLETE only when the feed has a reading at or before its
// start and another at or after its end. The oldest hour of every feed
// fails that test (its opening rain fell before the earliest reading) and
// so does the hour still in progress. An incomplete hour never overwrites a
// complete one already held — the first version did, which on every refresh
// replaced the oldest stored hour with a zero or a fragment.
const BOM_TS = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;
function bomParseObs(rows, offMs) {
  return rows
    .filter(o => o && o.aifstime_utc)
    .map(o => {
      const ms = Date.parse(String(o.aifstime_utc).replace(BOM_TS, '$1-$2-$3T$4:$5:$6Z'));
      // the station's own clock (what its 9am means), read as label-space ms
      const lf = String(o.local_date_time_full || '');
      const lt = BOM_TS.test(lf) ? Date.parse(lf.replace(BOM_TS, '$1-$2-$3T$4:$5:$6Z')) : ms + (offMs || 0);
      const raw = o.rain_trace;
      const cum = (raw == null || raw === '' || raw === '-') ? NaN : parseFloat(raw);
      return { ms, lt: isFinite(lt) ? lt : ms + (offMs || 0), cum };
    })
    .filter(o => isFinite(o.ms) && isFinite(o.cum) && o.cum >= 0)
    .sort((a, b) => a.ms - b.ms)
    .filter((o, i, arr) => i === 0 || o.ms !== arr[i - 1].ms);
}

function bomToBuckets(obs, offMs) {
  const B = {};                                    // hour-start (UTC ms) -> { p, bad }
  if (obs.length < 2) return { B, firstMs: null, lastMs: null };
  const startOf = ms => Math.floor((ms + offMs) / BOM_HOUR) * BOM_HOUR - offMs;
  const get = b => B[b] || (B[b] = { p: 0, bad: false });
  for (let i = 1; i < obs.length; i++) {
    const a = obs[i - 1], o = obs[i];
    let inc = o.cum - a.cum, unsure = false;
    if (inc < 0) {
      // The total fell. Near 9am (station time; 10am in summer, when BOM
      // keeps standard time) that is the daily reset and the new reading is
      // all rain since it. Any other fall is a correction to an earlier
      // reading — which hour it belongs to is unknowable, so the amount is
      // not guessed and the hour is not trusted. (Treating every fall as the
      // reset would have filed the whole day's total under one hour.)
      const lt = new Date(o.lt), h = lt.getUTCHours(), m = lt.getUTCMinutes();
      const nearReset = (h === 8 && m >= 30) || h === 9 || h === 10 || (h === 11 && m === 0);
      if (!nearReset) { inc = 0; unsure = true; }
      else {
        inc = o.cum;
        // If the reading showing the fall was taken AT the reset (on the
        // hour), whatever fell between the previous reading and the reset is
        // unseen. If the fall shows on a later reading, the reading before it
        // already held the full day and nothing is lost. A lost slice only
        // matters if it was raining around then — and when this is the
        // newest reading, what comes next is not known yet, so the hour waits
        // for the next fetch rather than being stored as settled.
        if (m === 0) {
          const before = i >= 2 ? Math.max(0, a.cum - obs[i - 2].cum) : 0;
          const hasAfter = i + 1 < obs.length;
          const after = hasAfter ? Math.max(0, obs[i + 1].cum - o.cum) : 0;
          unsure = !hasAfter || before > 0 || inc > 0 || after > 0;
        }
      }
    }
    const bA = startOf(a.ms), bO = startOf(o.ms - 1);
    if (bA === bO) {
      const g = get(bA); g.p += inc; if (unsure) g.bad = true;
    } else {
      // readings missing: spread the amount over the hours it spans by
      // time, and only trust those hours if nothing fell
      const span = (o.ms - a.ms) || 1;
      for (let b = bA; b <= bO; b += BOM_HOUR) {
        const lo = Math.max(a.ms, b), hi = Math.min(o.ms, b + BOM_HOUR);
        const g = get(b); g.p += inc * Math.max(0, hi - lo) / span;
        if (inc > 0 || unsure) g.bad = true;
      }
    }
  }
  return { B, firstMs: obs[0].ms, lastMs: obs[obs.length - 1].ms };
}

// ── accumulation ────────────────────────────────────────────────────────
// A station's feed only reaches back ~72 hours, which is too thin to score.
// Complete hours are merged into localStorage so the record grows with use.
// Store v2: { "<UTC ms of hour start>": { p: mm, c: 1 complete | 0 partial } }
function bomStoreKey(wmo) { return 'wb_bom2_' + wmo; }
function bomLoadStore(wmo) {
  try {
    const raw = localStorage.getItem(bomStoreKey(wmo));
    const o = raw ? JSON.parse(raw) : {};
    return (o && typeof o === 'object') ? o : {};
  } catch (e) { return {}; }
}
function bomSaveStore(wmo, S) {
  try {
    const cut = Date.now() - BOM_KEEP_DAYS * 86400000;
    const out = {};
    Object.keys(S).forEach(k => { if (+k >= cut) out[k] = S[k]; });
    localStorage.setItem(bomStoreKey(wmo), JSON.stringify(out));
  } catch (e) {}
}
// The v1 store was filed by local time, an hour out for half of all rain,
// and its oldest hours were overwritten with fragments on every refresh.
// There is no way to repair it, so it is removed rather than trusted.
(function bomDropV1() {
  try {
    Object.keys(localStorage).filter(k => /^wb_bom_\d+$/.test(k))
      .forEach(k => localStorage.removeItem(k));
  } catch (e) {}
})();

// ── the fetch ───────────────────────────────────────────────────────────
// AbortSignal.timeout is not on every browser; AbortController always is.
function bomTimeout(ms) {
  try { if (AbortSignal && AbortSignal.timeout) return { signal: AbortSignal.timeout(ms) }; } catch (e) {}
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return { signal: c.signal };
}

// "Failed to fetch" is the browser's catch-all and says nothing useful. A
// no-cors probe separates the two real possibilities: if the opaque request
// succeeds the server is reachable and the response is simply missing its
// CORS header; if it also fails, nothing is getting through at all.
async function bomWhyFailed(url, say) {
  try {
    await fetch(url, Object.assign({ mode: 'no-cors' }, bomTimeout(8000)));
    say('bom: server IS reachable, so the response is missing '
      + 'access-control-allow-origin — the Worker is deployed but not adding the CORS header');
    say('bom: check the Worker returns headers:{"access-control-allow-origin":"*"} '
      + 'and that it deployed without an error');
  } catch (e2) {
    say('bom: nothing reached the server at all (' + (e2.message || e2.name) + ')');
    say('bom: check BOM_PROXY spelling, that it ends with ?u=, and that the Worker URL loads in a browser tab');
  }
}

const bomLabel = (ms, offMs) => new Date(ms + offMs).toISOString().slice(0, 16);

// the station as it identified itself when its readings were verified
function bomMetaKey(wmo) { return 'wb_bom2_meta_' + wmo; }
function bomSaveMeta(st) {
  try { localStorage.setItem(bomMetaKey(st.wmo), JSON.stringify({ name: st.name, km: st.km })); } catch (e) {}
}
function bomLoadMeta(wmo) {
  try { return JSON.parse(localStorage.getItem(bomMetaKey(wmo)) || 'null'); } catch (e) { return null; }
}

// complete hours from a station's store, in forecast-label form
function bomResult(st, store, offMs, extra) {
  const keys = Object.keys(store).map(Number).filter(isFinite).sort((a, b) => a - b);
  const hourly = { time: [], precipitation: [] };
  let held = 0, todayMm = 0, todayTo = null;
  // what the gauge says about today so far — straight from the hours, so
  // it can be checked against BOM's own table
  const midnight = Math.floor((Date.now() + offMs) / 86400000) * 86400000 - offMs;
  keys.forEach(b => {
    const v = store[b], ok = !!(v && v.c);
    hourly.time.push(bomLabel(b, offMs));
    hourly.precipitation.push(ok ? Math.round(v.p * 10) / 10 : null);
    if (ok) { held++; if (b >= midnight) { todayMm += v.p; todayTo = b + BOM_HOUR; } }
  });
  return Object.assign({ hourly, station: st.name, km: st.km, wmo: st.wmo, tier: 'gauge', held,
    todayMm: Math.round(todayMm * 10) / 10, todayTo: todayTo != null ? bomLabel(todayTo, offMs) : null }, extra || {});
}

// Returns complete hours only, labelled the way the forecast grid labels
// them: "2026-10-03T05:00" = the rain that fell from 5am to 6am, local.
async function bomFetchTruth(lat, lon, tzOffsetSec, log) {
  const say = log || (() => {});
  if (!BOM_PROXY) { say('bom: no proxy configured — gauge truth unavailable'); return null; }
  if (!/\?u=$|&u=$/.test(BOM_PROXY)) {
    say('bom: BOM_PROXY must end with ?u=  (currently "' + BOM_PROXY.slice(-12) + '")');
  }
  const cands = bomCandidates(lat, lon);
  if (!cands.length) { say('bom: no station within ' + BOM_MAX_KM + 'km'); return null; }
  const offMs = (typeof tzOffsetSec === 'number' ? tzOffsetSec : 0) * 1000;

  let probed = false;
  for (const st of cands) {
    const target = BOM_PROXY + encodeURIComponent(bomUrl(st));
    try {
      const res = await fetch(target, bomTimeout(9000));
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error('HTTP ' + res.status + (body ? ' — ' + body.slice(0, 120) : ''));
      }
      const j = await res.json();
      const rows = j?.observations?.data;
      if (!Array.isArray(rows) || !rows.length) throw new Error('no observations');

      // the response states where it actually is — verify before trusting it
      const r0 = rows[0];
      if (typeof r0.lat === 'number' && typeof r0.lon === 'number') {
        const realKm = bomKm(lat, lon, r0.lat, r0.lon);
        if (realKm > BOM_MAX_KM + 15) {
          say(`bom: ${st.wmo} is ${realKm.toFixed(0)}km away, not ${st.km.toFixed(0)} — skipping`);
          continue;
        }
        st.km = realKm;
        if (r0.name) st.name = r0.name;
      }

      const obs = bomParseObs(rows, offMs);
      if (obs.length < 2) throw new Error('no usable rain readings');
      const { B, firstMs, lastMs } = bomToBuckets(obs, offMs);

      const store = bomLoadStore(st.wmo);
      let nFresh = 0, nKept = 0, nPart = 0;
      Object.keys(B).forEach(k => {
        const b = +k, g = B[k];
        const complete = !g.bad && firstMs <= b && lastMs >= b + BOM_HOUR;
        const p = Math.round(g.p * 100) / 100;
        if (complete) { store[k] = { p, c: 1 }; nFresh++; return; }
        nPart++;
        if (store[k] && store[k].c) { nKept++; return; }   // never overwrite a complete hour
        store[k] = { p, c: 0 };
      });
      bomSaveStore(st.wmo, store);
      bomSaveMeta(st);

      const out = bomResult(st, store, offMs, { asOfMs: lastMs });
      const latest = obs[obs.length - 1];
      say(`bom: ${st.name} ${st.km.toFixed(1)}km — ${out.held} complete gauge hours held `
        + `(${nFresh} complete this load, ${nPart} partial${nKept ? ', ' + nKept + ' kept from earlier' : ''})`);
      say(`bom: latest reading ${bomLabel(latest.ms, offMs).slice(11)} — ${latest.cum.toFixed(1)}mm since 9am`
        + (out.todayTo != null ? ` · gauge since midnight ${out.todayMm.toFixed(1)}mm to ${out.todayTo.slice(11)}` : ''));
      return out;
    } catch (e) {
      const msg = e.message || e.name || String(e);
      say('bom: ' + st.wmo + ' failed — ' + msg);
      // A network-level failure (offline, proxy down, timeout) will be the
      // same for every station, so don't make the user wait through each.
      if (/failed to fetch|networkerror|load failed|cors|abort|timeout/i.test(msg) || e.name === 'AbortError' || e.name === 'TimeoutError') {
        if (!probed && /failed to fetch|networkerror|load failed|cors/i.test(msg)) {
          probed = true;
          await bomWhyFailed(target, say);
        }
        break;
      }
    }
  }
  // The live feed is out of reach, but the hours already gathered are still
  // real measurements. Keep using them — dropping to the analysis would
  // switch rain weighting off for the session over one failed request.
  for (const st of cands) {
    const store = bomLoadStore(st.wmo);
    if (!Object.keys(store).some(k => store[k] && store[k].c)) continue;
    const meta = bomLoadMeta(st.wmo);
    if (meta) { if (meta.name) st.name = meta.name; if (typeof meta.km === 'number') st.km = meta.km; }
    const out = bomResult(st, store, offMs, { stale: true });
    say(`bom: live feed unavailable — using ${out.held} saved gauge hours from ${st.name}`);
    return out;
  }
  return null;
}

/* ── BOM_WORKER_SOURCE ───────────────────────────────────────────────────
   BOM serves no CORS headers, so this small Cloudflare Worker is the whole
   backend. Deploy it, put its URL in BOM_PROXY above with ?u= on the end,
   and gauge truth switches on. The /fwo/ check matters: without it anyone
   could point the Worker at any address and spend your quota.

   export default {
     async fetch(req) {
       const u = new URL(req.url).searchParams.get('u');
       if (!u || !/^https:\/\/www\.bom\.gov\.au\/fwo\//.test(u))
         return new Response('bad url', { status: 400,
           headers: { 'access-control-allow-origin': '*' } });
       const r = await fetch(u, { cf: { cacheTtl: 300, cacheEverything: true } });
       return new Response(r.body, {
         status: r.status,
         headers: { 'content-type': 'application/json',
                    'access-control-allow-origin': '*',
                    'cache-control': 'public, max-age=300' }
       });
     }
   };
   ──────────────────────────────────────────────────────────────────────── */
