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
