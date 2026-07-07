# WeatherOrb

WeatherBlend's signature mark and the seed of its logo — four overlapping circles (mint=temp, blue=rain, lime=wind, purple=cloud) that grow and brighten with each metric's value. The strongest metric glows; the whole mark breathes on a slow 4.6s loop. Every forecast produces a unique "fingerprint."

```jsx
{/* raw values with ranges */}
<WeatherOrb temp={24} rain={0.4} wind={22} cloud={60} />

{/* pre-normalised strengths */}
<WeatherOrb temp={0.7} rain={0.2} wind={0.5} cloud={0.6} normalized />
```

Use it as the hero glyph on a condition card, or static (`animate={false}`) as a brand icon.
