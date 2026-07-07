// App shell — chrome-less, whitespace-led. Header (no hero temperature:
// the streams ARE the identity), week overview, a zoom "lens" connector,
// the hourly streams, and the expandable secondary panel. The window tween
// and ambient clock live here so week / lens / streams stay in sync.
const zvEaseIO = window.WB_UI.easeIO;

function useWindowTween(target, ms = 650) {
  const [cur, setCur] = React.useState(target);
  const ref = React.useRef({ raf: 0 });
  React.useEffect(() => {
    const from = cur, t0 = performance.now();
    cancelAnimationFrame(ref.current.raf);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      setCur(from + (target - from) * zvEaseIO(p));
      if (p < 1) ref.current.raf = requestAnimationFrame(step);
    };
    ref.current.raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(ref.current.raf);
  }, [target]);
  return cur;
}

function useClock() {
  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    let raf, on = true;
    const loop = (now) => { if (!on) return; setT(now / 1000); raf = requestAnimationFrame(loop); };
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!mq.matches) raf = requestAnimationFrame(loop);
    return () => { on = false; cancelAnimationFrame(raf); };
  }, []);
  return t;
}

// The zoom lens — a soft trapezoid linking the selected day's slice of the
// week to the full-width day view, so the two read as one dataset at two
// scales. It tracks the same tween as the hourly window.
function ZoomLens({ winStart }) {
  const W = 400, H = 16, dayW = W / 7;
  const p = winStart / 24;
  const x1 = p * dayW, x2 = (p + 1) * dayW;
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} width="100%" style={{ display: 'block' }}>
      <polygon points={x1 + ',0 ' + x2 + ',0 ' + W + ',' + H + ' 0,' + H} fill="rgba(77,141,240,.05)" />
      <line x1={x1} y1="0" x2="0" y2={H} stroke="rgba(77,141,240,.30)" strokeWidth="1" />
      <line x1={x2} y1="0" x2={W} y2={H} stroke="rgba(77,141,240,.30)" strokeWidth="1" />
    </svg>
  );
}

function App() {
  const { Logo } = window.WeatherBlendDesignSystem_0cb5aa;
  const D = window.WB_DATA;
  const [sel, setSel] = React.useState(1);
  const winStart = useWindowTween(sel * 24);
  const clock = useClock();
  const day = D.days[sel];
  const isToday = sel === 1;
  const dates = ['Mar 3', 'Mar 4', 'Mar 5', 'Mar 6', 'Mar 7', 'Mar 8', 'Mar 9'];

  return (
    <div className="phone">
      <header style={{ padding: '16px 18px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Logo size={26} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.2px' }}>Orange NSW</div>
          <div style={{ fontSize: 10.5, color: 'var(--wb-text-dim)', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', marginTop: 1 }}>
            {isToday ? 'Today' : day.dow} · {dates[sel]} · 7-model blend
          </div>
        </div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 15px 26px' }}>
        <window.WeekStreams sel={sel} onSel={setSel} clock={clock} />
        <ZoomLens winStart={winStart} />
        <window.HourlyStreams sel={sel} winStart={winStart} clock={clock} />

        <window.SecondaryPanel sel={sel} />

        <div style={{ fontSize: 11, color: 'var(--wb-text-dim)', lineHeight: 1.55, padding: '12px 2px 0', borderTop: '1px solid var(--wb-border)' }}>
          The week above and the day below are one continuous stream — tap a day and the view glides along it.
          Glow softness, ribbon width and bar haze show model disagreement; crisp means the seven models agree.
          Lines dim where it is night.
        </div>
      </div>
    </div>
  );
}
if (window.WB_DATA && window.WeatherBlendDesignSystem_0cb5aa && document.getElementById('root')) {
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
}
