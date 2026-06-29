-- ════════════════════════════════════════════════════════════════════════
-- WeatherBlend accuracy tracker — Cloudflare D1 schema
-- ════════════════════════════════════════════════════════════════════════
-- Two tables:
--   forecasts : what each model predicted for a future day, captured at issue
--   actuals   : what was actually observed for that day (BOM only — the only
--               independent ground truth; never store Open-Meteo-derived
--               "actuals" here or the accuracy scoring becomes circular)
-- Weights/stats are derived by joining the two on (station, target).
--
-- Apply with:
--   npx wrangler d1 execute weatherblend-accuracy --remote --file=schema.sql
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS forecasts (
  station TEXT NOT NULL,   -- BOM WMO station id (stable per-location key)
  issued  TEXT NOT NULL,   -- date forecast was captured  (YYYY-MM-DD, local)
  target  TEXT NOT NULL,   -- date being forecast          (YYYY-MM-DD, local)
  model   TEXT NOT NULL,   -- 'gfs','ecmwf','icon',...
  tmax  REAL,
  tmin  REAL,
  rain  REAL,
  wind  REAL,              -- daily max wind (km/h)
  cloud REAL,              -- daily mean cloud (%)
  PRIMARY KEY (station, issued, target, model)
);

-- Fast lookups for the rolling-window join
CREATE INDEX IF NOT EXISTS idx_fc_station_issued ON forecasts(station, issued);
CREATE INDEX IF NOT EXISTS idx_fc_join          ON forecasts(station, target);

CREATE TABLE IF NOT EXISTS actuals (
  station TEXT NOT NULL,
  target  TEXT NOT NULL,   -- the observed day
  tmax  REAL,
  tmin  REAL,
  rain  REAL,
  wind  REAL,
  cloud REAL,
  source TEXT,             -- 'bom' (kept for provenance/debugging)
  PRIMARY KEY (station, target)
);

CREATE INDEX IF NOT EXISTS idx_ac_station_target ON actuals(station, target);

-- Registry of stations the app has actually used. The daily cron reads this to
-- know which locations to refresh (gap-free capture) and their coordinates.
CREATE TABLE IF NOT EXISTS stations (
  station   TEXT PRIMARY KEY,  -- BOM WMO id
  lat       REAL,
  lon       REAL,
  state     TEXT,
  name      TEXT,
  last_seen TEXT               -- YYYY-MM-DD a client last synced this station
);

-- ────────────────────────────────────────────────────────────────────────
-- weights_cache : memoises the on-demand weight computation per location.
-- Weights are now derived mostly from Open-Meteo's Previous Runs API (the 7
-- global models' past forecasts at lead 1–7 days) + ERA5/BOM actuals, computed
-- in the Worker and cached here for ~18 h. The Worker also CREATEs this table
-- on first use, so applying this file is optional.
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weights_cache (
  k           TEXT PRIMARY KEY,   -- "latR|lonR|days|station" (lat/lon rounded 0.1°)
  json        TEXT NOT NULL,      -- full computed result (weights + stats + horizon)
  computed_at TEXT NOT NULL       -- datetime('now') at compute time
);

-- ────────────────────────────────────────────────────────────────────────
-- bom_hourly : BOM's published HOURLY forecast, archived as it is issued.
-- BOM's API is future-only, so we keep each target hour (first-write-wins) and
-- serve past hours back to the client so the BOM row shows what BOM forecast
-- for that hour the previous day. 21-day retention; Worker CREATEs it on first
-- use, so applying this file is optional.
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bom_hourly (
  station   TEXT NOT NULL,   -- BOM WMO station id
  target_ts TEXT NOT NULL,   -- the forecast hour (YYYY-MM-DDTHH:MM, local)
  temp REAL,
  rain REAL,
  wind REAL,
  dir  REAL,
  wc   REAL,                 -- weathercode (WMO)
  PRIMARY KEY (station, target_ts)
);
