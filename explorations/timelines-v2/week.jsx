// WeekStreams — the 7-day overview drawn in the SAME visual language as the
// hourly view: glowing temp line, rain bars, oscillating wind ripple, cloud
// opacity ribbon. It is the zoomed-out end of one continuous timeline.
function WeekStreams({ sel, onSel, clock }) {
  const S = window.WB_STREAMS, D = window.WB_DATA, U = window.WB_UI;
  if (!S || !D) return null;
  const W = 400, N = S.HOURS, dayW = W / 7;
  const X = (h) => (h / (N - 1)) * W;

  // lane geometry
  const yT = 4, hT = 30;      // temp line
  const yR = 42, hR = 20;     // rain bars
  const yW = 68, hW = 24;     // wind ripple
  const yC = 98, hC = 12;     // cloud ribbon
  const H = 114;

  const tMin = Math.min(...S.temp) - 1, tMax = Math.max(...S.temp) + 1;
  const rMax = Math.max(1, Math.max(...S.rain));
  const wMax = Math.max(...S.wind);

  // temp — glowing line, sampled every 2h
  const tempPts = [];
  for (let h = 0; h < N; h += 2) tempPts.push([X(h), yT + hT - ((S.temp[h] - tMin) / (tMax - tMin)) * hT]);
  const tempD = U.smoothPath(tempPts);

  // rain — 3h bins → bars
  const bins = [];
  for (let b = 0; b < 56; b++) {
    let v = 0;
    for (let k = 0; k < 3; k++) v += S.rain[b * 3 + k] || 0;
    if (v > 0.05) bins.push([b, v]);
  }
  const binMax = Math.max(1.2, ...bins.map((b) => b[1]));

  // wind — small oscillating ripple around a mid-lane baseline
  const wBase = yW + hW / 2;
  const windD = (() => {
    let d = '';
    for (let px = 0; px <= W; px += 3) {
      const h = Math.min(N - 1, Math.floor((px / W) * N));
      const amp = 0.7 + (S.wind[h] / wMax) * 5.2;
      const y = wBase + Math.sin(px * 0.16 + clock * 1.6) * amp * 0.55 + Math.sin(px * 0.041 - clock * 0.8) * amp * 0.45;
      d += (px ? 'L' : 'M') + px + ' ' + y.toFixed(1);
    }
    return d;
  })();

  // cloud — opacity gradient stops every 3h
  const cloudStops = [];
  for (let h = 0; h < N; h += 3) {
    cloudStops.push('<stop offset="' + ((h / (N - 1)) * 100).toFixed(1) + '%" stop-color="' + U.COL.cloud + '" stop-opacity="' + (0.04 + Math.pow(S.cloud[h] / 100, 1.2) * 0.8).toFixed(2) + '"/>');
  }

  // night dimming as a luminance mask, sampled every 2h
  const lumStops = [];
  for (let h = 0; h < N; h += 2) {
    const l = 0.5 + 0.5 * ((U.lum(h) - 0.30) / 0.70);
    lumStops.push('<stop offset="' + ((h / (N - 1)) * 100).toFixed(1) + '%" stop-color="#fff" stop-opacity="' + l.toFixed(2) + '"/>');
  }

  const nowX = (S.NOW / (N - 1)) * W;
  const click = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSel(Math.max(0, Math.min(6, Math.floor(((e.clientX - r.left) / r.width) * 7))));
  };

  return (
    <div style={{ position: 'relative', cursor: 'pointer', userSelect: 'none' }} onClick={click}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 0 3px' }}>
        {D.days.map((d, i) => (
          <span key={i} style={{
            textAlign: 'center', fontSize: 10, fontWeight: i === sel ? 800 : 600, letterSpacing: '.6px', textTransform: 'uppercase',
            color: i === sel ? 'var(--wb-text)' : i === 1 ? 'var(--wb-text-muted)' : 'var(--wb-text-dim)',
            transition: 'color .3s',
          }}>{d.dow}{i === 1 && <span style={{ color: 'var(--wb-accent)' }}> •</span>}</span>
        ))}
      </div>

      <svg viewBox={'0 0 ' + W + ' ' + H} width="100%" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="wkFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.04" stopColor="#fff" stopOpacity="1" />
            <stop offset="0.96" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="wkLum" x1="0" y1="0" x2="1" y2="0" dangerouslySetInnerHTML={{ __html: lumStops.join('') }} />
          <linearGradient id="wkCloud" x1="0" y1="0" x2="1" y2="0" dangerouslySetInnerHTML={{ __html: cloudStops.join('') }} />
          <mask id="wkMask"><rect x="0" y="0" width={W} height={H} fill="url(#wkFade)" /></mask>
          <mask id="wkNight"><rect x="0" y="0" width={W} height={H} fill="url(#wkLum)" /></mask>
          <filter id="wkGlow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="1.8" /></filter>
        </defs>

        {/* selected-day lens */}
        <g style={{ transform: 'translateX(' + sel * dayW + 'px)', transition: 'transform .55s cubic-bezier(.4,0,.2,1)' }}>
          <rect x="0" y="0" width={dayW} height={H} rx="5" fill="rgba(77,141,240,.07)" stroke="rgba(77,141,240,.30)" strokeWidth="1" />
        </g>

        <g mask="url(#wkMask)">
          <g mask="url(#wkNight)">
            {/* temp */}
            <path d={tempD} fill="none" stroke={U.COL.temp} strokeWidth="4.5" opacity="0.16" filter="url(#wkGlow)" />
            <path d={tempD} fill="none" stroke={U.COL.temp} strokeWidth="1.3" strokeLinecap="round" opacity="0.9" />
            {/* rain */}
            <line x1="0" y1={yR + hR} x2={W} y2={yR + hR} stroke="var(--wb-border)" strokeWidth="1" opacity="0.7" />
            {bins.map(([b, v]) => {
              const bh = Math.max(1.6, (v / binMax) * hR);
              return <rect key={b} x={(b / 56) * W + 1.2} y={yR + hR - bh} width="3.4" height={bh} rx="1.7" fill={U.COL.rain} opacity={0.45 + Math.min(0.45, v / 4)} />;
            })}
            {/* wind */}
            <line x1="0" y1={wBase} x2={W} y2={wBase} stroke="var(--wb-border)" strokeWidth="1" strokeDasharray="2 4" opacity="0.5" />
            <path d={windD} fill="none" stroke={U.COL.wind} strokeWidth="1.1" strokeLinecap="round" opacity="0.8" />
            {/* cloud */}
            <rect x="0" y={yC} width={W} height={hC} rx={hC / 2} fill="url(#wkCloud)" />
          </g>
          {/* past dimmer */}
          <rect x="0" y="0" width={nowX} height={H} fill="rgba(12,15,21,.5)" />
        </g>

        {/* day dividers */}
        {Array.from({ length: 6 }, (_, i) => (
          <line key={i} x1={(i + 1) * dayW} y1="0" x2={(i + 1) * dayW} y2={H} stroke="var(--wb-border)" strokeWidth="1" opacity="0.55" />
        ))}
        {/* now marker */}
        <line x1={nowX} y1="-2" x2={nowX} y2={H + 2} stroke="var(--wb-now)" strokeWidth="1.2" opacity="0.8" />
      </svg>
    </div>
  );
}
window.WeekStreams = WeekStreams;
