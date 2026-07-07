import React from 'react';

const RAMPS = {
  temp: (v) => (v < 5 ? '#60a5fa' : v < 12 ? '#38bdf8' : v < 22 ? '#4ade80' : v < 30 ? '#fbbf24' : '#f87171'),
  rain: (v) => (v < 0.05 ? '#1e3a5f' : v < 0.2 ? '#3b82f6' : v < 0.5 ? '#2563eb' : v < 1 ? '#1d4ed8' : v < 2 ? '#1e40af' : '#172554'),
  wind: (v) => (v < 10 ? '#22c55e' : v < 20 ? '#84cc16' : v < 35 ? '#eab308' : v < 55 ? '#f97316' : '#ef4444'),
  cloud: (v) => (v < 12 ? '#60a5fa' : v < 40 ? '#818cf8' : v < 70 ? '#a78bfa' : '#8b5cf6'),
};

let _uid = 0;

/**
 * Sparkline — the hero day-trace from the condition card. A metric's
 * hourly values drawn as a value-ramped line over a soft gradient area;
 * the segment past `split` is dashed to mark forecast-vs-observed.
 * Optional amber tick lines mark sunrise/sunset. Fills its container.
 */
export function Sparkline({
  values = [],
  metric = 'temp',
  split = 1,
  zeroBase = false,
  ticks = [],
  height = 44,
  style = {},
}) {
  const W = 240, H = height, padX = 2, padT = 6, padB = 5;
  const ramp = RAMPS[metric] || RAMPS.temp;
  const n = values.length;
  const clean = values.filter((v) => v != null && !isNaN(v));
  const gid = `wbspark${_uid++}`;

  if (!clean.length) return <div style={{ height: H, ...style }} />;

  let mn = Math.min(...clean), mx = Math.max(...clean);
  if (zeroBase) mn = 0;
  if (mn === mx) { if (zeroBase) mx = mn + 1; else { mn -= 1; mx += 1; } }

  const X = (i) => padX + (n > 1 ? (i * (W - 2 * padX)) / (n - 1) : 0);
  const Y = (v) => (v == null ? null : (H - padB) - ((Math.max(mn, Math.min(mx, v)) - mn) / (mx - mn)) * (H - padT - padB));
  const pts = values.map((v, i) => (v == null ? null : [X(i), Y(v)]));

  const path = (arr) => { let d = '', on = false; arr.forEach((p) => { if (!p) { on = false; return; } d += (on ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ' '; on = true; }); return d.trim(); };
  const cut = split * (W - 2 * padX) + padX;
  const solid = pts.map((p) => (p && p[0] <= cut + 0.6 ? p : null));
  const dash = split < 1 ? pts.map((p) => (p && p[0] >= cut - 0.6 ? p : null)) : null;
  const firstX = pts.find((p) => p)[0];
  const area = path(pts) + ` L ${X(n - 1).toFixed(1)} ${H - padB} L ${firstX.toFixed(1)} ${H - padB} Z`;
  const stops = values.map((v, i) => (v == null ? null : `<stop offset="${(n > 1 ? i / (n - 1) : 0) * 100}%" stop-color="${ramp(v)}" stop-opacity="0.45"/>`)).filter(Boolean).join('');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: H, overflow: 'visible', ...style }}>
      <defs dangerouslySetInnerHTML={{ __html: `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>` }} />
      <path d={area} fill={`url(#${gid})`} stroke="none" opacity="0.5" />
      {ticks.map((t, i) => {
        const gx = (t.frac * (W - 2 * padX) + padX).toFixed(1);
        return <line key={i} x1={gx} y1={padT - 2} x2={gx} y2={H - padB + 1} stroke="#e7a755" strokeWidth="1" opacity="0.25" strokeDasharray="1.5 2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
      })}
      <path d={path(solid)} fill="none" stroke={`var(--q-${metric})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {dash && <path d={path(dash)} fill="none" stroke={`var(--q-${metric})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 3" opacity="0.7" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
