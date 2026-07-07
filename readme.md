# WeatherBlend Design System

A design system extracted from **WeatherBlend** — a mobile-first progressive web app that fetches forecasts from seven global weather models at once and *blends* them by how accurately each has recently performed. The premise: a multi-model blend beats any single model, and the UI's whole job is to make a blend of noisy numbers feel calm, legible and trustworthy.

There is one product (the PWA) and one brand. Everything here is lifted from the real source, not reconstructed from screenshots.

## Source

- **GitHub:** https://github.com/Brown111723/weatherblend — a single-page app (`index.html`, `styles.css`, `app.js`, `engine.js`). Explore it to build more faithfully: `engine.js` holds the model registry and blending maths; `app.js` holds the icon set, the data-orb glyph, the sparklines and the table renderer; `styles.css` holds the full visual system. A read-only copy of these lives in `_source/` for reference.
- Forecast data in the real app comes from [Open-Meteo](https://open-meteo.com) (GFS, ECMWF, ICON, GEM, UKMO, CMA, JMA); "actual" observations from Australia's [BOM](https://www.bom.gov.au). No API key. This design system ships **no live data** — the UI kit uses synthetic forecasts.

---

## Content fundamentals

**Voice — plain, confident, quietly expert.** Copy explains a genuinely complex system (multi-model weighting, bias correction, confidence) in everyday language and never talks down. Sentences are short and declarative: *"Multi-model blends are consistently more accurate than any single model."*

- **Person:** addresses the user as **you** ("Tap the location name to search any city"), describes the system as **it**. First person is never used.
- **Casing:** Sentence case everywhere — headings, buttons, labels. The only uppercase is the letter-spaced **eyebrow/section-label** convention (`FORECAST ACCURACY`, `TEMP`). Model names keep their real casing (GFS, ECMWF, UKMO).
- **Emphasis:** key terms are bolded inline (**now card**, **Confidence**, **Actual**) rather than defined in glossaries.
- **Numbers carry units, tightly:** `24°`, `0.4 mm`, `22 km/h`, `60%`. Degrees use `°`; the low temp trails the high (`24° 14°`). Confidence is worded (**High / Medium / Low**) *and* optionally shown as a %.
- **Honest hedging:** the app is careful to say confidence measures *agreement, not certainty*, and that BOM is *observations only, never a forecast*. Precision of language is part of the brand.
- **Emoji:** used sparingly and only as playful punctuation in prose/help (📍, 🗺️, 📡, 🐞) — never inside data, labels or as an icon system. Iconography is custom SVG (see below).

---

## Visual foundations

**Mood:** a dark, cool, near-black **navy** canvas (`#0c0f15`) that lets colour do the talking. It reads like an instrument panel at night — data-dense but composed.

**The quatrefoil palette is the whole identity.** Four hues each *mean* one metric, everywhere, without exception:

- **mint `#7EE8A5`** = temperature · **blue `#5FA4FF`** = rain · **lime `#A8E63E`** = wind · **purple `#C8A6FF`** = cloud.

The logo is these four as overlapping circles; the signature data-orb is the same four sized by live values; metric-card top-borders, icons, sparklines and table section labels all reuse them. Learn the four colours and the app becomes instantly readable. A separate **accent blue `#4d8df0`** carries interaction (selection, links, primary buttons) so it never competes with the rain hue.

**Colour vibe:** saturated but not neon; the metric hues are pastel-bright against deep navy. Magnitude (how hot, how wet) is a *second* encoding — dark heat-map cell backgrounds (`colors-heat` card) — kept visually distinct from the identity hues.

**Type:** system UI sans for all chrome; a **monospace** for the forecast table so digits align in columns. The signature move is the **hero temperature** — 54px at weight **275** with **-2.5px** tracking, huge and airy. Card values are 25px/700/-0.5px. Labels are 11px/700 uppercase with wide tracking. No webfonts ship (see Fonts).

**Spacing & shape:** compact, mobile-first — interior padding clusters around 10–16px, not a strict 4/8 grid (copy exact values). Corners are rounded but restrained: 8px chips → 10px buttons → 12px tiles/nav → 14px metric cards → 16px modals; only icon buttons, model dots and orb circles go fully round.

**Surfaces & elevation:** flat by default — a raised plane is a `--wb-surface` fill with a 1px hairline (`--wb-border`), no shadow. Shadows are reserved and soft/high-spread for a dark UI: popovers get `0 12px 34px rgba(0,0,0,.55)`, the drawer a side shadow. **Glassmorphism** appears in exactly one place: the metric boxes floating over the hero radial gradient use a translucent fill + `blur(3px)` + a 2px quatrefoil top-accent.

**Backgrounds:** no photography, no illustration, no texture. Two subtle gradients only — a radial hero glow behind the condition card and a vertical header gradient. Everything else is flat navy.

**Borders:** 1px hairlines separate everything; `--wb-border` for structure, `--wb-border-2` for interactive/emphasis. The quatrefoil top-accent (2px) is the one coloured border.

**Motion — quiet and functional.** 0.15s colour/border/background transitions on hover; a gentle `scale(0.96)` on press; a 0.22s drawer slide. The one expressive animation is the data-orb's slow 4.6s "breathing" loop (staggered per circle). All animation respects `prefers-reduced-motion`. No bounces, no parallax, no decorative loops.

**Hover / press states:** hover brightens (icon buttons swap to `--wb-border-2` bg + primary text; list items pick up the accent border + `--wb-accent-soft` wash); primary buttons darken to `--wb-accent-press`; press shrinks slightly. Selected states use the accent ring + soft wash (day tiles, nav, segments).

**Transparency & blur** are used only where content floats over other content — glass metric boxes over the gradient, and the `blur(8px)` bottom-nav bar. Overlays dim with `rgba(0,0,0,.55–.8)`.

---

## Iconography

- **Custom hand-tuned SVGs, no icon library.** All glyphs are inline `<svg>` on a 24×24 canvas, copied verbatim from the source.
- **Weather condition glyphs are procedural** — `WeatherIcon` composes sun/moon + cloud + rain streaks / snow dots / fog lines / thunder-bolt by WMO weather code, and swaps sun→moon at night. There is no fixed "sunny.png"; the icon is assembled from the forecast.
- **Metric glyphs** (`MetricIcon`) are four line-icons — thermometer, drop, wind streams, cloud — drawn in `currentColor` so they always take the right quatrefoil hue.
- **UI glyphs** (menu, close, chevrons, chart, cog, help, eye, check, bug, sun-up/down) are stroke icons, `stroke-width` ~2, round caps/joins — a consistent Feather/Lucide-like line style, but bespoke.
- **The data-orb** (`WeatherOrb`) is the brand's hero mark: four filled circles, `mix-blend-mode: screen`, sized/opacity-mapped to live values, the strongest metric glowing.
- **Emoji** appear only as decorative punctuation in help/prose (📍 🗺️ 📡 🐞) — never as a functional icon set.
- **Logo:** the quatrefoil mark is real and shipped — reuse `assets/logo-quatrefoil.svg` or the `Logo` component. Never redraw it.

---

## Fonts

**No webfonts.** The product intentionally uses the OS system UI font (`system-ui, -apple-system, 'Segoe UI', Roboto, …`) for chrome and a system monospace (`ui-monospace, 'SF Mono', Menlo, Consolas, monospace`) for the data table. Nothing to upload — the stacks render natively on every platform. (No substitution was needed or made.)

---

## Components

Reusable primitives, grouped by concern. Enumerated from the product's actual UI — nothing invented.

**Brand**
- **Logo** — the quatrefoil mark, optionally with wordmark.

**Core (`components/core/`)**
- **Button** — primary / secondary / ghost, three sizes.
- **IconButton** — square or round icon-only chrome control.
- **Segment** — segmented control (weight-method, view switch).
- **Toggle** — icon-square metric toggle (Show / Confidence).

**Data (`components/data/`)**
- **MetricCard** — glassy metric box with quatrefoil top-accent.
- **ModelBadge** / **WeightBadge** — coloured model dot + blend-weight %; exports the `MODELS` registry.
- **ConfidenceTag** — High / Medium / Low agreement read-out.
- **ModelToggle** — enable/disable a source model.

**Weather (`components/weather/`)**
- **WeatherIcon** — procedural condition glyph by WMO code.
- **MetricIcon** — thermometer / drop / wind / cloud line-glyphs.
- **WeatherOrb** — the signature data-driven brand mark.
- **Sparkline** — hero day-trace (value-ramped, observed/forecast split).
- **DayTile** — a tile in the fingerprint day-selector strip.

**Feedback (`components/feedback/`)**
- **Modal** — centered dialog with backdrop and scrolling body.

**Navigation (`components/navigation/`)**
- **BottomNav** — fixed Cards / Table / Map switcher.
- **Drawer** — slide-in ☰ menu.

## UI kits
- **`ui_kits/weatherblend/`** — interactive recreation of the full PWA (cards view, heat-map table, sources popover, city search, drawer, help).

---

## Project index

- `styles.css` — global entry point (import this one file); nothing but `@import`s.
- `tokens/` — `colors.css`, `dataviz.css` (heat scales), `typography.css`, `spacing.css`, `effects.css` (radii/shadows/glass/motion).
- `components/` — the primitives above (`<Name>.jsx` + `.d.ts` + `.prompt.md`, one `@dsCard` HTML per group).
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing).
- `assets/` — `logo-quatrefoil.svg`.
- `ui_kits/weatherblend/` — the product recreation.
- `_source/` — read-only copy of the original app for reference.
- `SKILL.md` — Agent-Skill wrapper.

Namespace for `@dsCard` HTML: `window.WeatherBlendDesignSystem_0cb5aa`.
