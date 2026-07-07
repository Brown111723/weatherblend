import React from 'react';

/* Metric line-icons — copied verbatim from the product (app.js MI_*).
   Drawn with currentColor so they inherit the quatrefoil hue. */
const PATHS = {
  temp: { fill: 'none', stroke: true, sw: 2.2, inner: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>' },
  rain: { fill: 'currentColor', stroke: false, inner: '<path d="M12 2.7c2.9 4 5.3 7 5.3 10A5.3 5.3 0 0 1 12 18a5.3 5.3 0 0 1-5.3-5.3c0-3 2.4-6 5.3-10z"/>' },
  wind: { fill: 'none', stroke: true, sw: 2.2, inner: '<path d="M3 8h10.5a2.5 2.5 0 1 0-2.4-3.2"/><path d="M3 16h7.5a2.5 2.5 0 1 1-2.4 3.2"/><path d="M3 12h15a2.5 2.5 0 1 0-2.4-3.2"/>' },
  cloud: { fill: 'currentColor', stroke: false, inner: '<path d="M7 18h10a3.8 3.8 0 0 0 .5-7.6 5.3 5.3 0 0 0-10.2-1.1A3.6 3.6 0 0 0 7 18z"/>' },
};

const DEFAULT_COLOR = {
  temp: 'var(--q-temp)', rain: 'var(--q-rain)', wind: 'var(--q-wind)', cloud: 'var(--q-cloud)',
};

/**
 * MetricIcon — the small line-glyph for a single metric
 * (temperature thermometer, rain drop, wind streams, cloud). Uses
 * currentColor; defaults to that metric's quatrefoil hue.
 */
export function MetricIcon({ metric = 'temp', size = 16, color, style = {} }) {
  const p = PATHS[metric] || PATHS.temp;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={p.fill}
      stroke={p.stroke ? 'currentColor' : 'none'}
      strokeWidth={p.sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'inline-block', color: color || DEFAULT_COLOR[metric], ...style }}
      dangerouslySetInnerHTML={{ __html: p.inner }}
    />
  );
}
