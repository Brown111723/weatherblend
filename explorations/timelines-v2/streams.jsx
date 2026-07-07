// HourlyStreams — the zoomed-in day view. Four lanes share one SVG and one
// time axis; the 24h window is a slice of the 168h stream and TWEENS along
// it (winStart is animated by the app shell). Each lane's identity:
//   Temp  — glowing line; ribbon width + glow softness = model spread
//   Rain  — accumulation bars; opacity/echo = confidence
//   Wind  — true oscillating ripple around a mid-lane baseline
//   Cloud — constant-width ribbon, opacity = cover
// Daylight is carried by the DATA (a luminance mask dims the lines at
// night); the background stays stable. Metric headers (icon + values) sit
// above each lane as HTML overlays.
function HourlyStreams({ sel, winStart, clock }) {
  const S = window.WB_STREAMS, D = window.WB_DATA, U = window.WB_UI;
  const { MetricIcon } = window.WeatherBlendDesignSystem_0cb5aa;
  if (!S || !D) return null;

  const W = 400, LANE = 82, GAP = 48, TOP = 42, AXIS = 30;
  const lanes = ['temp', 'rain', 'wind', 'cloud'];
  const TOTALH = TOP + lanes.length * LANE + (lanes.length - 1) * GAP + AXIS;
  const laneY = (i) => TOP + i * (LANE + GAP);

  const H2X = (h) => ((h - winStart) / 24) * W;
  const visible = [];
  for (let h = Math.floor(winStart) - 1; h <= Math.ceil(winStart) + 25; h++) if (h >= 0 && h < S.HOURS) visible.push(h);

  // week-wide scales so sliding never rescales
  const sc = {
    temp: [Math.min(...S.temp) - 1, Math.max(...S.temp) + 1],
    rain: [0, Math.max(1.2, Math.max(...S.rain) * 1.1)],
    wind: [0, Math.max(...S.wind) * 1.15],
  };
  const Y = (m, v, y0) => y0 + LANE - ((v - sc[m][0]) / (sc[m][1] - sc[m][0])) * LANE;

  const spreadAt = (h) => S.spread[Math.max(0, Math.min(S.HOURS - 1, h))];
  const meanSpread = visible.reduce((a, h) => a + spreadAt(h), 0) / visible.length;

  const isToday = sel === 1;
  const day = D.days[sel];
  const dayHours = Array.from({ length: 24 }, (_, i) => sel * 24 + i);
  const refH = isToday ? S.NOW : sel * 24 + 13;

  // ── temp lane ──
  const y0t = laneY(0);
  const tempPts = visible.map((h) => [H2X(h), Y('temp', S.temp[h], y0t)]);
  const ribbonW = 3 + meanSpread * 13;
  const glowW = 10 + meanSpread * 22;
  const glowPulse = 0.5 + 0.18 * Math.sin(clock * 1.1);
  let hiH = dayHours[0], loH = dayHours[0];
  dayHours.forEach((h) => { if (S.temp[h] > S.temp[hiH]) hiH = h; if (S.temp[h] < S.temp[loH]) loH = h; });

  // ── rain lane ──
  const y0r = laneY(1);
  const barW = W / 24 * 0.42;
  const rainConf = day.conf.rain;
  const dayRain = +dayHours.reduce((a, h) => a + S.rain[h], 0).toFixed(1);
  const rainToCome = isToday
    ? +dayHours.filter((h) => h >= S.NOW).reduce((a, h) => a + S.rain[h], 0).toFixed(1)
    : sel < 1 ? 0 : dayRain;

  // ── wind lane: oscillating ripple centred on a baseline ──
  const y0w = laneY(2);
  const windBase = y0w + LANE * 0.5;
  const windPath = (off) => {
    let d = '';
    for (let px = 0; px <= W; px += 4) {
      const h = winStart + (px / W) * 24;
      const hi = Math.max(0, Math.min(S.HOURS - 1, Math.floor(h)));
      const sp = S.wind[hi], gu = S.gust[hi];
      const amp = 1.4 + (sp / sc.wind[1]) * 14 + ((gu - sp) / sc.wind[1]) * 12;
      const y = windBase
        + Math.sin(px * 0.10 + clock * 2.3 + off) * amp * 0.55
        + Math.sin(px * 0.026 - clock * 1.2 + off * 2.1) * amp * 0.45;
      d += (px ? 'L' : 'M') + px + ' ' + y.toFixed(1);
    }
    return d;
  };
  const windMean = Math.round(visible.reduce((a, h) => a + S.wind[h], 0) / visible.length);
  const windCoreW = 1.2 + (windMean / sc.wind[1]) * 3.2;
  const windHi = Math.max(...dayHours.map((h) => S.wind[h]));
  const windLo = Math.min(...dayHours.map((h) => S.wind[h]));

  // ── cloud lane ──
  const y0c = laneY(3);
  const cloudStops = visible.map((h) => {
    const x = Math.max(0, Math.min(1, H2X(h) / W));
    return '<stop offset="' + (x * 100).toFixed(1) + '%" stop-color="' + U.COL.cloud + '" stop-opacity="' + (0.03 + Math.pow(S.cloud[h] / 100, 1.15) * 0.85).toFixed(2) + '"/>';
  }).join('');
  const cloudHi = Math.max(...dayHours.map((h) => S.cloud[h]));
  const cloudLo = Math.min(...dayHours.map((h) => S.cloud[h]));

  // ── daylight luminance mask: the lines carry day/night, not the bg ──
  const lumStops = visible.map((h) => {
    const x = Math.max(0, Math.min(1, H2X(h) / W));
    return '<stop offset="' + (x * 100).toFixed(1) + '%" stop-color="#fff" stop-opacity="' + U.lum(h).toFixed(2) + '"/>';
  }).join('');

  // sunrise/sunset markers (icons only, no time labels)
  const suns = [];
  D.days.forEach((d, di) => {
    suns.push({ h: di * 24 + d.rise * 23, kind: 'rise' }, { h: di * 24 + d.set * 23, kind: 'set' });
  });

  // ── headers (HTML overlay) ──
  const headers = [
    {
      m: 'temp',
      primary: Math.round(S.temp[refH]) + '°',
      secondary: 'feels ' + Math.round(S.feels[refH]) + '°',
      right: null,
    },
    {
      m: 'rain',
      primary: dayRain.toFixed(1) + ' mm',
      secondary: isToday ? rainToCome.toFixed(1) + ' mm to come' : sel < 1 ? 'observed' : 'expected',
      right: rainConf + '% conf',
    },
    {
      m: 'wind',
      primary: S.wind[refH] + ' km/h',
      secondary: day.windDir,
      right: '↑' + windHi + ' ↓' + windLo,
    },
    {
      m: 'cloud',
      primary: S.cloud[refH] + '%',
      secondary: 'cover',
      right: '↑' + cloudHi + ' ↓' + cloudLo,
    },
  ];
  const NAME = { temp: 'Temp', rain: 'Rain', wind: 'Wind', cloud: 'Cloud' };

  return (
    <div style={{ position: 'relative' }}>
      {headers.map((hd, i) => (
        <div key={hd.m} style={{
          position: 'absolute', left: 0, right: 0, top: ((laneY(i) - 34) / TOTALH * 100) + '%',
          display: 'flex', alignItems: 'baseline', gap: 8, pointerEvents: 'none',
        }}>
          <span style={{ alignSelf: 'center', display: 'flex' }}><MetricIcon metric={hd.m} size={15} /></span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: U.COL[hd.m] }}>{NAME[hd.m]}</span>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.3px', color: 'var(--wb-text)' }}>{hd.primary}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--wb-text-dim)' }}>{hd.secondary}</span>
          {hd.right && <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: 'var(--wb-text-dim)', fontFamily: 'var(--wb-font-mono)' }}>{hd.right}</span>}
        </div>
      ))}

      <svg viewBox={'0 0 ' + W + ' ' + TOTALH} width="100%" style={{ display: 'block', overflow: 'hidden' }}>
        <defs>
          <linearGradient id="stCloud" x1="0" y1="0" x2="1" y2="0" dangerouslySetInnerHTML={{ __html: cloudStops }} />
          <linearGradient id="stLum" x1="0" y1="0" x2="1" y2="0" dangerouslySetInnerHTML={{ __html: lumStops }} />
          <mask id="stNight"><rect x="0" y="0" width={W} height={TOTALH} fill="url(#stLum)" /></mask>
          <filter id="stSoft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation={2 + meanSpread * 3} /></filter>
          <filter id="stEcho" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.6" /></filter>
          <filter id="stGlowNow" x="-300%" y="-5%" width="700%" height="110%"><feGaussianBlur stdDeviation="2.4" /></filter>
        </defs>

        <g mask="url(#stNight)">
          {/* ═══ TEMP ═══ */}
          <path d={U.smoothPath(tempPts)} fill="none" stroke={U.COL.temp} strokeWidth={glowW} strokeLinecap="round" opacity={0.10 * glowPulse * 2} filter="url(#stSoft)" />
          <path d={U.smoothPath(tempPts)} fill="none" stroke={U.COL.temp} strokeWidth={ribbonW} strokeLinecap="round" opacity="0.16" />
          <path d={U.smoothPath(tempPts)} fill="none" stroke={U.COL.temp} strokeWidth="2" strokeLinecap="round" opacity="0.95" />
          {[hiH, loH].map((h, i) => {
            const x = H2X(h); if (x < -10 || x > W + 10) return null;
            const y = Y('temp', S.temp[h], y0t);
            return (
              <g key={i}>
                <circle cx={x} cy={y} r="3" fill="var(--wb-bg)" stroke={U.COL.temp} strokeWidth="1.6" />
                <text x={x} y={y + (i ? 16 : -9)} textAnchor="middle" fill="var(--wb-text-muted)" style={{ fontSize: 10.5, fontWeight: 700 }}>{Math.round(S.temp[h])}°</text>
              </g>
            );
          })}

          {/* ═══ RAIN ═══ */}
          <line x1="0" y1={y0r + LANE} x2={W} y2={y0r + LANE} stroke="var(--wb-border)" strokeWidth="1" />
          {meanSpread > 0.25 && visible.map((h) => {
            const v = S.rain[h]; if (v < 0.03) return null;
            const x = H2X(h), bh = Math.max(2.5, (v / sc.rain[1]) * LANE);
            return <rect key={'e' + h} x={x - barW / 2 - 1.5} y={y0r + LANE - bh - 1.5} width={barW + 3} height={bh + 1.5} rx={barW / 2}
              fill={U.COL.rain} opacity={meanSpread * 0.35} filter="url(#stEcho)" />;
          })}
          {visible.map((h) => {
            const v = S.rain[h]; if (v < 0.03) return null;
            const x = H2X(h), bh = Math.max(2.5, (v / sc.rain[1]) * LANE);
            return <rect key={h} x={x - barW / 2} y={y0r + LANE - bh} width={barW} height={bh} rx={barW / 2}
              fill={U.COL.rain} opacity={(0.35 + (rainConf / 100) * 0.45) + Math.min(0.2, v / 4)} style={{ transition: 'opacity .6s' }} />;
          })}

          {/* ═══ WIND ═══ */}
          <line x1="0" y1={windBase} x2={W} y2={windBase} stroke="var(--wb-border)" strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />
          <path d={windPath(0)} fill="none" stroke={U.COL.wind} strokeWidth={windCoreW * 2.6} opacity="0.10" filter="url(#stEcho)" />
          <path d={windPath(1.7)} fill="none" stroke={U.COL.wind} strokeWidth={windCoreW * 0.5} opacity="0.25" />
          <path d={windPath(0)} fill="none" stroke={U.COL.wind} strokeWidth={windCoreW} strokeLinecap="round" opacity="0.85" />

          {/* ═══ CLOUD ═══ */}
          <rect x="0" y={y0c + LANE * 0.30} width={W} height={LANE * 0.40} rx={LANE * 0.20} fill="url(#stCloud)" />
        </g>

        {/* shared axis */}
        {[0, 6, 12, 18, 24].map((hh) => {
          const x = H2X(Math.round(winStart) + hh);
          return <text key={hh} x={Math.max(10, Math.min(W - 10, x))} y={TOTALH - 8} textAnchor="middle" fill="var(--wb-text-dim)" style={{ fontSize: 10, fontWeight: 600, fontFamily: 'var(--wb-font-mono)' }}>{U.fmtHr(winStart + hh)}</text>;
        })}
        {/* sunrise / sunset — subtle icons only */}
        {suns.map((s, i) => {
          const x = H2X(s.h); if (x < 4 || x > W - 4) return null;
          const y = TOTALH - AXIS + 5;
          return (
            <g key={i} stroke="var(--wb-sun)" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity="0.55">
              <circle cx={x} cy={y + 3} r="2.4" />
              <line x1={x - 5} y1={y + 7} x2={x + 5} y2={y + 7} />
              <path d={s.kind === 'rise' ? 'M ' + (x - 2.4) + ' ' + (y - 3) + ' L ' + x + ' ' + (y - 5.6) + ' L ' + (x + 2.4) + ' ' + (y - 3) : 'M ' + (x - 2.4) + ' ' + (y - 5.6) + ' L ' + x + ' ' + (y - 3) + ' L ' + (x + 2.4) + ' ' + (y - 5.6)} />
            </g>
          );
        })}

        {/* the shared glowing NOW line */}
        {(() => {
          const x = H2X(S.NOW);
          if (x < -6 || x > W + 6) return null;
          return (
            <g>
              <line x1={x} y1="6" x2={x} y2={TOTALH - AXIS + 10} stroke="var(--wb-now)" strokeWidth="5" opacity={0.25 + 0.12 * Math.sin(clock * 1.4)} filter="url(#stGlowNow)" />
              <line x1={x} y1="6" x2={x} y2={TOTALH - AXIS + 10} stroke="var(--wb-now)" strokeWidth="1.3" opacity="0.9" />
              <text x={x} y="1" textAnchor="middle" dominantBaseline="hanging" fill="var(--wb-now)" style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '1px' }}>NOW</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
window.HourlyStreams = HourlyStreams;
