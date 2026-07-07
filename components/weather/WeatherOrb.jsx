import React from 'react';

const COL = { temp: '#7EE8A5', rain: '#5FA4FF', wind: '#A8E63E', cloud: '#C8A6FF' };
const POS = { temp: [32, 20], rain: [44, 32], wind: [20, 32], cloud: [32, 44] };
const DLY = { temp: 0, rain: 0.55, wind: 1.1, cloud: 1.65 };
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * WeatherOrb — WeatherBlend's signature mark. Instead of a fixed weather
 * icon, four overlapping circles (mint=temp, blue=rain, lime=wind,
 * purple=cloud) grow and brighten with each metric's value; the strongest
 * glows. Screen-blended and gently breathing, every forecast gets its own
 * visual fingerprint. Pass raw values + ranges, or pre-normalised 0–1.
 */
export function WeatherOrb({
  temp, rain = 0, wind = 0, cloud = 0,
  ranges = { tempMin: 0, tempMax: 40, windMax: 60, rainMax: 20 },
  normalized = false,
  size = 64,
  animate = true,
  style = {},
}) {
  const str = normalized
    ? { temp: clamp01(temp), rain: clamp01(rain), wind: clamp01(wind), cloud: clamp01(cloud) }
    : {
        temp: clamp01(((temp ?? ranges.tempMin) - ranges.tempMin) / (ranges.tempMax - ranges.tempMin)),
        wind: clamp01(wind / ranges.windMax),
        rain: clamp01(Math.log1p(Math.max(0, rain)) / Math.log1p(ranges.rainMax)),
        cloud: clamp01(cloud / 100),
      };

  const vis = normalized
    ? { temp: true, rain: rain >= 0.02, wind: wind >= 0.02, cloud: cloud >= 0.02 }
    : { temp: true, rain: rain >= 0.05, wind: wind >= 10, cloud: cloud >= 10 };

  let strong = null, sv = 0.6;
  Object.keys(str).forEach((k) => { if (vis[k] && str[k] > sv) { sv = str[k]; strong = k; } });

  const R = (s) => (7 + s * 6).toFixed(1);
  const O = (s) => (0.34 + s * 0.6).toFixed(2);
  const order = ['wind', 'temp', 'rain', 'cloud'];

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(0 2px 7px rgba(0,0,0,.4))', ...style }}
    >
      <style>{`@keyframes wbOrbBreathe{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}`}</style>
      <g style={{ mixBlendMode: 'screen' }}>
        {order.filter((k) => vis[k]).map((k) => (
          <circle
            key={k}
            cx={POS[k][0]}
            cy={POS[k][1]}
            r={R(str[k])}
            fill={COL[k]}
            opacity={O(str[k])}
            style={{
              transformBox: 'fill-box',
              transformOrigin: 'center',
              animation: animate ? `wbOrbBreathe 4.6s ease-in-out infinite ${DLY[k]}s` : 'none',
              filter: strong === k ? `drop-shadow(0 0 3px ${COL[k]})` : undefined,
            }}
          />
        ))}
      </g>
    </svg>
  );
}
