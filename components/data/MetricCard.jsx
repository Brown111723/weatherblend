import React from 'react';

const ACCENT = { temp: 'var(--q-temp)', rain: 'var(--q-rain)', wind: 'var(--q-wind)', cloud: 'var(--q-cloud)' };

/**
 * MetricCard — the glassy metric box from the cards view. A quatrefoil
 * top-accent in the metric's colour, an uppercase title, a big value and
 * one or two muted sub-lines. Optional confidence % appended to the title.
 */
export function MetricCard({
  metric = 'temp',
  title,
  value,
  subs = [],
  confidence,
  glass = false,
  style = {},
}) {
  const color = ACCENT[metric] || ACCENT.temp;
  return (
    <div
      style={{
        position: 'relative',
        background: glass ? 'var(--wb-glass-fill)' : 'var(--wb-surface)',
        border: glass ? '1px solid var(--wb-glass-border)' : '1px solid var(--wb-border)',
        borderTop: `2px solid ${color}`,
        borderRadius: 'var(--wb-radius-xl)',
        padding: '12px 13px',
        minHeight: 98,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        backdropFilter: glass ? 'blur(3px)' : undefined,
        WebkitBackdropFilter: glass ? 'blur(3px)' : undefined,
        overflow: 'hidden',
        ...style,
      }}
    >
      <div style={{ fontFamily: 'var(--wb-font-sans)', fontSize: '11px', fontWeight: 700, letterSpacing: '1.1px', textTransform: 'uppercase', marginBottom: 3, color }}>
        {title}
      </div>
      <div style={{ fontFamily: 'var(--wb-font-sans)', fontSize: '25px', fontWeight: 700, letterSpacing: '-.5px', lineHeight: 1.1, color: 'var(--wb-text)', whiteSpace: 'nowrap' }}>
        {value}
        {confidence != null && (
          <span style={{ fontSize: '13px', fontWeight: 700, opacity: 0.62, marginLeft: 6, color }}>{confidence}%</span>
        )}
      </div>
      {subs.map((s, i) => (
        <div key={i} style={{ fontFamily: 'var(--wb-font-sans)', fontSize: '12.5px', color: 'var(--wb-text-muted)', lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s}</div>
      ))}
    </div>
  );
}
