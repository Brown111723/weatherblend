// ════════════════════════════════════════════════════════════════════════
// weatherblend BOM proxy — Cloudflare Worker
// ════════════════════════════════════════════════════════════════════════
// BOM's servers send no CORS headers, so a browser can't fetch them directly.
// This Worker fetches them server-side and re-serves with Access-Control-* so
// weatherblend.html can read them.
//
// Two endpoints:
//   1) Observations:  /?station=94691&state=NSW
//        - tries the known product IDs for that state until BOM returns data
//        - optional override: /?station=94691&product=IDN60801
//   2) Station list:  /?stations=1
//        - proxies BOM's stations.txt (so the app works without a local copy)
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
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

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
  }
};
