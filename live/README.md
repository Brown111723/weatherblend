# WeatherBlend — continuous timeline UI (live implementation)

Drop-in replacement for the cards view. The week overview and hourly
forecast are one continuous 7-day stream at two zoom levels.

## What to copy into your repo

- `index.html`  — replaces your root index.html (3 changes: timeline.css link,
  timeline containers inside `#carousels-section`, timeline.js script tag)
- `timeline.js` — new file, the timeline renderer (loads after app.js)
- `timeline.css`— new file, timeline styles
- `styles.css`  — the app stylesheet (extracted from weatherblend-Opus.html's
  inline `<style>`). **Heads-up:** your repo's root `styles.css` is currently
  the *design-system* import file, so the root index.html has no app CSS on
  the live site. Deploy the app from a folder where THIS styles.css sits next
  to index.html (or rename the design-system entry).

`engine.js` and `app.js` are **unchanged** — copies here are for local testing
only. Keep your repo's `styles.css` and `stations.txt` as they are.

## How it works

- `timeline.js` overrides `renderCurrentBar()` (the hook the engine calls) and
  renders into `#timeline-root`; the legacy `#curr-bar` / `#day-bar` stay in
  the DOM (hidden) so existing app.js helpers keep working.
- All values are the engine's real blended, bias-corrected data via
  `hourTileData()`; observed BOM hours automatically replace forecasts in the
  past. Confidence = `confHourMetric()` / `confDayMetric()` (model agreement):
  temp ribbon width + glow, rain bar opacity + haze, all driven by it.
- Day/night is a luminance mask dimming the data lines (sunrise/sunset from
  the models); sunrise/sunset are icon-only markers on the shared axis.
- Tapping a day in the week overview calls `setSelectedDay()` — table view
  stays in sync both ways.
- Secondary metrics (UV, humidity, pressure, visibility, dew point, air
  quality) come from two extra Open-Meteo calls made by timeline.js itself.
- Table and Map views, drawer, modals, accuracy tracking: untouched.
