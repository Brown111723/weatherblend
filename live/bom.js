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

// Your Cloudflare Worker, e.g. 'https://wb-bom.<subdomain>.workers.dev/?u='
// The worker should fetch the passed URL and return it with
// Access-Control-Allow-Origin: *   (see BOM_WORKER_SOURCE at the bottom)
const BOM_PROXY = 'https://wb-bom.brown111724.workers.dev/?u=';       // ← set this to enable gauge truth
const BOM_MAX_KM = 35;         // beyond this a gauge is not your weather
const BOM_KEEP_DAYS = 21;      // how much accumulated history to retain

// Stations are keyed by WMO id and state product letter. This list covers
// the capitals and a spread of regional centres; adding more is just
// another row. If an id is wrong the response's own lat/lon catches it.
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
  { wmo: 94776, st: 'N', name: 'Newcastle Nobbys',          lat: -32.9185, lon: 151.7981 },
  { wmo: 94791, st: 'N', name: 'Williamtown RAAF',          lat: -32.7932, lon: 151.8358 },
  { wmo: 94910, st: 'N', name: 'Wagga Wagga AMO',           lat: -35.1583, lon: 147.4573 },
  { wmo: 94759, st: 'N', name: 'Coffs Harbour Airport',     lat: -30.3107, lon: 153.1187 },
  { wmo: 94693, st: 'N', name: 'Bourke Airport',            lat: -30.0392, lon: 145.9522 },
  { wmo: 94750, st: 'N', name: 'Port Macquarie Airport',    lat: -31.4358, lon: 152.8631 },
  { wmo: 94929, st: 'N', name: 'Nowra RAN',                 lat: -34.9469, lon: 150.5375 },
  // VIC — IDV60801
  { wmo: 95936, st: 'V', name: 'Melbourne (Olympic Park)',  lat: -37.8255, lon: 144.9816 },
  { wmo: 94866, st: 'V', name: 'Melbourne Airport',         lat: -37.6655, lon: 144.8321 },
  { wmo: 94870, st: 'V', name: 'Geelong',                   lat: -38.1416, lon: 144.3617 },
  { wmo: 94852, st: 'V', name: 'Ballarat Aerodrome',        lat: -37.5127, lon: 143.7911 },
  { wmo: 94693, st: 'V', name: 'Mildura Airport',           lat: -34.2358, lon: 142.0867 },
  { wmo: 95874, st: 'V', name: 'Bendigo Airport',           lat: -36.7395, lon: 144.3306 },
  // QLD — IDQ60801
  { wmo: 94576, st: 'Q', name: 'Brisbane',                  lat: -27.4808, lon: 153.0389 },
  { wmo: 94578, st: 'Q', name: 'Brisbane Airport',          lat: -27.3917, lon: 153.1292 },
  { wmo: 94592, st: 'Q', name: 'Gold Coast Seaway',         lat: -27.9386, lon: 153.4283 },
  { wmo: 94287, st: 'Q', name: 'Cairns Aero',               lat: -16.8736, lon: 145.7458 },
  { wmo: 94294, st: 'Q', name: 'Townsville Aero',           lat: -19.2483, lon: 146.7661 },
  { wmo: 94510, st: 'Q', name: 'Rockhampton Aero',          lat: -23.3753, lon: 150.4775 },
  { wmo: 94510, st: 'Q', name: 'Toowoomba Airport',         lat: -27.5425, lon: 151.9134 },
  // SA — IDS60801
  { wmo: 94672, st: 'S', name: 'Adelaide (Kent Town)',      lat: -34.9211, lon: 138.6216 },
  { wmo: 94675, st: 'S', name: 'Adelaide Airport',          lat: -34.9524, lon: 138.5204 },
  { wmo: 94653, st: 'S', name: 'Ceduna AMO',                lat: -32.1297, lon: 133.6975 },
  { wmo: 94682, st: 'S', name: 'Mount Gambier Aero',        lat: -37.7473, lon: 140.7739 },
  { wmo: 94648, st: 'S', name: 'Port Augusta Aero',         lat: -32.5069, lon: 137.7167 },
  // WA — IDW60801
  { wmo: 94608, st: 'W', name: 'Perth',                     lat: -31.9192, lon: 115.8728 },
  { wmo: 94610, st: 'W', name: 'Perth Airport',             lat: -31.9275, lon: 115.9764 },
  { wmo: 94430, st: 'W', name: 'Geraldton Airport',         lat: -28.7953, lon: 114.6989 },
  { wmo: 94802, st: 'W', name: 'Albany Airport',            lat: -34.9425, lon: 117.8022 },
  { wmo: 94312, st: 'W', name: 'Port Hedland Airport',      lat: -20.3714, lon: 118.6303 },
  { wmo: 94637, st: 'W', name: 'Kalgoorlie-Boulder Airport',lat: -30.7847, lon: 121.4533 },
  { wmo: 94203, st: 'W', name: 'Broome Airport',            lat: -17.9475, lon: 122.2353 },
  // TAS — IDT60801
  { wmo: 94970, st: 'T', name: 'Hobart (Ellerslie Road)',   lat: -42.8897, lon: 147.3278 },
  { wmo: 94975, st: 'T', name: 'Hobart Airport',            lat: -42.8339, lon: 147.5033 },
  { wmo: 94958, st: 'T', name: 'Launceston Airport',        lat: -41.5453, lon: 147.2144 },
  // NT — IDD60801
  { wmo: 94120, st: 'D', name: 'Darwin Airport',            lat: -12.4239, lon: 130.8925 },
  { wmo: 94326, st: 'D', name: 'Alice Springs Airport',     lat: -23.7951, lon: 133.8890 },
  { wmo: 94150, st: 'D', name: 'Katherine Tindal',          lat: -14.5211, lon: 132.3775 }
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

// rain_trace is CUMULATIVE since 9am and resets to 0 each morning, so a
// drop between readings means the reset happened rather than negative rain
function bomToHourly(rows, tzOffsetSec) {
  const obs = rows
    .filter(o => o && o.aifstime_utc)
    .map(o => ({
      ms: Date.parse(String(o.aifstime_utc).replace(
        /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3T$4:$5:$6Z')),
      cum: (o.rain_trace == null || o.rain_trace === '-') ? null : parseFloat(o.rain_trace),
      temp: typeof o.air_temp === 'number' ? o.air_temp : null,
      wind: typeof o.wind_spd_kmh === 'number' ? o.wind_spd_kmh : null,
      hum: typeof o.rel_hum === 'number' ? o.rel_hum : null
    }))
    .filter(o => !isNaN(o.ms))
    .sort((a, b) => a.ms - b.ms);
  if (!obs.length) return null;

  const off = (typeof tzOffsetSec === 'number' ? tzOffsetSec : 0) * 1000;
  const key = ms => new Date(ms + off).toISOString().slice(0, 13) + ':00';
  const H = {};                                    // localISO -> accumulator
  let prev = null;
  obs.forEach(o => {
    if (o.cum != null && !isNaN(o.cum)) {
      if (prev != null) {
        // a fall in the running total is the 9am reset, not negative rain
        const inc = o.cum >= prev ? o.cum - prev : o.cum;
        const k = key(o.ms);
        if (!H[k]) H[k] = { p: 0, t: null, w: null, h: null };
        H[k].p += inc;
      }
      prev = o.cum;
    }
    const k = key(o.ms);
    if (!H[k]) H[k] = { p: 0, t: null, w: null, h: null };
    if (o.temp != null) H[k].t = o.temp;
    if (o.wind != null) H[k].w = o.wind;
    if (o.hum != null) H[k].h = o.hum;
  });
  return H;
}

// ── accumulation ────────────────────────────────────────────────────────
// A station's feed only reaches back ~72 hours, which is too thin to score.
// Readings are merged into localStorage so the record grows with use.
function bomStoreKey(wmo) { return 'wb_bom_' + wmo; }
function bomLoadStore(wmo) {
  try {
    const raw = localStorage.getItem(bomStoreKey(wmo));
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function bomSaveStore(wmo, H) {
  try {
    const cut = Date.now() - BOM_KEEP_DAYS * 86400000;
    const out = {};
    Object.keys(H).forEach(k => { if (Date.parse(k) >= cut) out[k] = H[k]; });
    localStorage.setItem(bomStoreKey(wmo), JSON.stringify(out));
  } catch (e) {}
}

// ── the fetch ───────────────────────────────────────────────────────────
async function bomFetchTruth(lat, lon, tzOffsetSec, log) {
  const say = log || (() => {});
  if (!BOM_PROXY) { say('bom: no proxy configured — gauge truth unavailable'); return null; }
  const cands = bomCandidates(lat, lon);
  if (!cands.length) { say('bom: no station within ' + BOM_MAX_KM + 'km'); return null; }

  for (const st of cands) {
    try {
      const res = await fetch(BOM_PROXY + encodeURIComponent(bomUrl(st)),
        { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
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

      const fresh = bomToHourly(rows, tzOffsetSec);
      if (!fresh) throw new Error('no usable rain readings');

      const store = bomLoadStore(st.wmo);
      Object.keys(fresh).forEach(k => { store[k] = fresh[k]; });
      bomSaveStore(st.wmo, store);

      const times = Object.keys(store).sort();
      const hourly = { time: times, precipitation: [], temperature_2m: [], windspeed_10m: [], relative_humidity_2m: [] };
      times.forEach(t => {
        const v = store[t];
        hourly.precipitation.push(v.p == null ? null : Math.round(v.p * 10) / 10);
        hourly.temperature_2m.push(v.t);
        hourly.windspeed_10m.push(v.w);
        hourly.relative_humidity_2m.push(v.h);
      });
      say(`bom: ${st.name} ${st.km.toFixed(1)}km — ${times.length} gauge hours held `
        + `(${Object.keys(fresh).length} fresh this load)`);
      return { hourly, station: st.name, km: st.km, wmo: st.wmo, tier: 'gauge' };
    } catch (e) {
      say('bom: ' + st.wmo + ' failed (' + e.message + ')');
    }
  }
  return null;
}

/* ── BOM_WORKER_SOURCE ───────────────────────────────────────────────────
   BOM serves no CORS headers, so this eight-line Cloudflare Worker is the
   whole backend. Deploy it, put its URL in BOM_PROXY above with ?u= on the
   end, and gauge truth switches on.

   export default {
     async fetch(req) {
       const u = new URL(req.url).searchParams.get('u');
       if (!u || !/^https:\/\/www\.bom\.gov\.au\//.test(u))
         return new Response('bad url', { status: 400 });
       const r = await fetch(u, { cf: { cacheTtl: 300 } });
       return new Response(r.body, {
         status: r.status,
         headers: { 'content-type': 'application/json',
                    'access-control-allow-origin': '*',
                    'cache-control': 'public, max-age=300' }
       });
     }
   };
   ──────────────────────────────────────────────────────────────────────── */
