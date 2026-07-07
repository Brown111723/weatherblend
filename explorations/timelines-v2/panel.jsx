// SecondaryPanel — expandable strip of supporting metrics. Collapsed it is
// a single quiet row; expanded it reveals small sparklines in the same
// visual style (soft glow line) but in a neutral tone so they never
// compete with the four primary streams.
function SecondaryPanel({ sel }) {
  const S = window.WB_STREAMS, U = window.WB_UI;
  const [open, setOpen] = React.useState(false);
  if (!S) return null;
  const sec = S.secondary;
  const isToday = sel === 1;
  const refH = isToday ? S.NOW : sel * 24 + 13;

  const items = [
    { k: 'uv', label: 'UV index', val: sec.uv[refH].toFixed(0) },
    { k: 'hum', label: 'Humidity', val: sec.hum[refH] + '%' },
    { k: 'pres', label: 'Pressure', val: Math.round(sec.pres[refH]) + ' hPa' },
    { k: 'vis', label: 'Visibility', val: sec.vis[refH].toFixed(0) + ' km' },
    { k: 'dew', label: 'Dew point', val: Math.round(sec.dew[refH]) + '°' },
    { k: 'aqi', label: 'Air quality', val: sec.aqi[refH] + ' good' },
  ];

  function Spark({ vals }) {
    const W = 170, H = 26;
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const pts = vals.map((v, i) => [(i / (vals.length - 1)) * W, H - 3 - ((v - mn) / (mx - mn || 1)) * (H - 6)]);
    const d = U.smoothPath(pts);
    return (
      <svg viewBox={'0 0 ' + W + ' ' + H} width="100%" height={H} style={{ display: 'block' }}>
        <path d={d} fill="none" stroke="var(--wb-text-muted)" strokeWidth="3.5" opacity="0.12" />
        <path d={d} fill="none" stroke="var(--wb-text-muted)" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
      </svg>
    );
  }

  const dayVals = (arr) => Array.from({ length: 24 }, (_, h) => arr[sel * 24 + h]);

  return (
    <div>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
        borderTop: '1px solid var(--wb-border)', padding: '13px 2px 12px', cursor: 'pointer',
        color: 'var(--wb-text-dim)', fontFamily: 'inherit',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' }}>Secondary metrics</span>
        <span style={{ marginLeft: 'auto', display: 'flex', transition: 'transform .3s', transform: open ? 'rotate(180deg)' : 'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"></path></svg>
        </span>
      </button>
      <div style={{ overflow: 'hidden', maxHeight: open ? 320 : 0, opacity: open ? 1 : 0, transition: 'max-height .45s cubic-bezier(.4,0,.2,1), opacity .35s' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 22px', padding: '2px 2px 14px' }}>
          {items.map((it) => (
            <div key={it.k} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--wb-text-dim)' }}>{it.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 600, color: 'var(--wb-text-muted)' }}>{it.val}</span>
              </div>
              <Spark vals={dayVals(sec[it.k])} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
window.SecondaryPanel = SecondaryPanel;
