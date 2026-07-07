# WeatherBlend UI Kit

A high-fidelity, interactive recreation of the **WeatherBlend** progressive web app — a mobile-first, multi-model weather forecast. It composes the design-system primitives (never re-implements them).

## Run it
Open `index.html`. It loads the compiled `_ds_bundle.js` and `styles.css` from the project root, then the local `data.js` and screen modules.

## What's interactive
- **Day strip** — tap any `DayTile` to change the selected day; the condition card, sparklines and metric cards all follow.
- **Bottom nav** — switch between **Cards**, **Table** and **Map** (map is a "coming soon" placeholder, exactly as in the product).
- **☰ Drawer** — opens *Forecast accuracy*, *Models & sources* (the sources popover) and *Help & about* (the info modal).
- **Location** — tap the location name to open the city-search modal.
- **Sources popover** — Show / Confidence metric toggles, weight-method segment, and the 7 model toggles (one shown as *unavailable*). Enabling **Sources** reveals per-model rows under each table section.

## Files
Everything is inlined in `index.html` — the app shell (header, day strip, view switching, drawer, modals, sources popover, bottom nav) plus its screen modules: the cards view (condition card with orb, hero temp, side metrics, hourly sparklines, four metric cards), the heat-map table view (blended sections with optional per-model rows), the "Models & sources" popover, and the synthetic 7-day forecast data. Loose module files are deliberately avoided so the design-system compiler never bundles screen code.

All values, colours and layout are lifted from the real source (`Brown111723/weatherblend`), not reconstructed from screenshots. This is a cosmetic recreation — it does not fetch live weather.
