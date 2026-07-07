import React from 'react';

/**
 * Logo — the WeatherBlend quatrefoil mark: four overlapping circles in
 * the metric palette (lime/mint/blue/purple). Optionally paired with the
 * "WeatherBlend" wordmark, whose "Blend" carries a mint→blue gradient.
 */
export function Logo({ size = 30, wordmark = false, style = {} }) {
  const mark = (
    <svg viewBox="0 0 64 64" width={size} height={size} style={{ display: 'block', flexShrink: 0 }} aria-label="WeatherBlend">
      <circle cx="20" cy="32" r="12" fill="#A8E63E" />
      <circle cx="32" cy="20" r="12" fill="#7EE8A5" />
      <circle cx="44" cy="32" r="12" fill="#5FA4FF" />
      <circle cx="32" cy="44" r="12" fill="#C8A6FF" />
    </svg>
  );
  if (!wordmark) return <span style={{ display: 'inline-flex', ...style }}>{mark}</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, ...style }}>
      {mark}
      <span style={{ fontFamily: 'var(--wb-font-sans)', fontSize: Math.round(size * 0.66), fontWeight: 700, letterSpacing: '-.3px', color: 'var(--wb-text)' }}>
        Weather
        <span style={{ background: 'linear-gradient(90deg,var(--q-temp),var(--q-rain))', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Blend</span>
      </span>
    </span>
  );
}
