import React from 'react';

/* Glyph parts — copied verbatim from the product (app.js). Each is inner
   SVG markup on a 24×24 canvas, composed by weather code. */
const _sun = '<circle cx="12" cy="12" r="4.6" fill="#fbbf24"/><g stroke="#fbbf24" stroke-width="1.7" stroke-linecap="round"><line x1="12" y1="1.6" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.4"/><line x1="1.6" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.4" y2="12"/><line x1="4.5" y1="4.5" x2="6.2" y2="6.2"/><line x1="17.8" y1="17.8" x2="19.5" y2="19.5"/><line x1="19.5" y1="4.5" x2="17.8" y2="6.2"/><line x1="6.2" y1="17.8" x2="4.5" y2="19.5"/></g>';
const _moon = '<path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5 6.7 6.7 0 0 0 20.5 14.2z" fill="#cbd5e1"/>';
const _sunSm = '<circle cx="8.2" cy="7.6" r="3.1" fill="#fbbf24"/><g stroke="#fbbf24" stroke-width="1.3" stroke-linecap="round"><line x1="8.2" y1="1.8" x2="8.2" y2="3.2"/><line x1="2.4" y1="7.6" x2="3.8" y2="7.6"/><line x1="4.1" y1="3.5" x2="5.1" y2="4.5"/><line x1="12.3" y1="3.5" x2="11.3" y2="4.5"/></g>';
const _moonSm = '<path d="M13.2 7.7A4.5 4.5 0 1 1 7.8 3.1 3.5 3.5 0 0 0 13.2 7.7z" fill="#cbd5e1"/>';
const _cloud = (c) => `<path d="M7 18.5h9.4a3.6 3.6 0 0 0 .42-7.16 5.3 5.3 0 0 0-10.2-1.2A4 4 0 0 0 7 18.5z" fill="${c}"/>`;
const _rain = (n) => { const x = [8.5, 12, 15.5]; let s = '<g stroke="#60a5fa" stroke-width="1.8" stroke-linecap="round">'; for (let i = 0; i < n; i++) s += `<line x1="${x[i]}" y1="19.8" x2="${x[i] - 1}" y2="22.6"/>`; return s + '</g>'; };
const _snow = '<g fill="#e2e8f0"><circle cx="8.5" cy="20.9" r="1.15"/><circle cx="12" cy="22.1" r="1.15"/><circle cx="15.5" cy="20.9" r="1.15"/></g>';
const _bolt = '<polygon points="12.6,18.4 9.6,22.4 11.7,22.4 10.7,23.8 14,19.7 11.9,19.7 13.4,18.4" fill="#facc15"/>';
const _fog = '<g stroke="#9aa7b8" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="8" x2="20" y2="8"/><line x1="5.5" y1="12" x2="18.5" y2="12"/><line x1="4" y1="16" x2="17" y2="16"/><line x1="7" y1="20" x2="20" y2="20"/></g>';
const GRAY = '#94a3b8', DARK = '#6b7a8f';

function innerFor(c, night) {
  const n = !!night;
  if (c === 0) return n ? _moon : _sun;
  if (c === 1 || c === 2) return (n ? _moonSm : _sunSm) + _cloud(GRAY);
  if (c === 3) return _cloud(DARK);
  if (c === 45 || c === 48) return _fog;
  if (c >= 51 && c <= 57) return (n ? '' : _sunSm) + _cloud(GRAY) + _rain(2);
  if (c >= 61 && c <= 65) return _cloud(GRAY) + _rain(3);
  if (c === 66 || c === 67) return _cloud(GRAY) + _rain(2);
  if (c >= 71 && c <= 77) return _cloud(GRAY) + _snow;
  if (c >= 80 && c <= 82) return (n ? '' : _sunSm) + _cloud(GRAY) + _rain(3);
  if (c === 85 || c === 86) return (n ? '' : _sunSm) + _cloud(GRAY) + _snow;
  if (c >= 95) return _cloud(DARK) + _bolt;
  return _cloud(GRAY);
}

/**
 * WeatherIcon — the app's condition glyph, built by WMO weather code.
 * Sun/moon, cloud, rain streaks, snow, fog and thunder are layered
 * procedurally; `night` swaps sun→moon. Sizes to `size` (px).
 */
export function WeatherIcon({ code = 0, night = false, size = 26, style = {} }) {
  if (code == null) return <span style={{ opacity: 0.4, ...style }}>–</span>;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ display: 'inline-block', verticalAlign: '-0.18em', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.45))', ...style }}
      dangerouslySetInnerHTML={{ __html: innerFor(code, night) }}
    />
  );
}
