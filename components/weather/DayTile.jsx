import React from 'react';
import { Sparkline } from './Sparkline.jsx';

/**
 * DayTile — one tile in the fingerprint day-selector strip. A weekday
 * label, a tiny temperature spark, the day's high/low and rain total.
 * States: selected (accent ring + wash), today (dot after the label),
 * past (dimmed).
 */
export function DayTile({
  dow = 'Mon',
  hi, lo,
  rain = 0,
  values = [],
  selected = false,
  today = false,
  past = false,
  onClick = () => {},
  style = {},
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: '0 0 auto',
        width: 76,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '3px',
        padding: '8px 6px 7px',
        borderRadius: 'var(--wb-radius-lg)',
        border: `1px solid ${selected ? 'var(--wb-accent)' : 'var(--wb-border)'}`,
        background: selected ? 'var(--wb-accent-soft)' : 'rgba(255,255,255,.022)',
        opacity: past && !selected ? 0.6 : 1,
        cursor: 'pointer',
        transition: 'border-color var(--wb-dur-fast), background var(--wb-dur-fast)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ fontFamily: 'var(--wb-font-sans)', fontSize: '10.5px', fontWeight: 700, letterSpacing: '.4px', lineHeight: 1, color: today ? 'var(--wb-text)' : 'var(--wb-text-muted)' }}>
        {dow}{today && <span style={{ color: 'var(--wb-accent)', marginLeft: 3 }}>•</span>}
      </span>
      <div style={{ width: 62, height: 28 }}>
        <Sparkline values={values} metric="temp" height={28} />
      </div>
      <div style={{ display: 'flex', gap: '7px', fontFamily: 'var(--wb-font-sans)', fontSize: '10px', fontWeight: 600, lineHeight: 1, color: 'var(--wb-text-dim)' }}>
        <b style={{ color: 'var(--wb-text)', fontWeight: 700, fontSize: '10.5px' }}>{hi != null ? Math.round(hi) + '°' : '—'}</b>
        <span>{lo != null ? Math.round(lo) + '°' : '—'}</span>
      </div>
      <div style={{ fontFamily: 'var(--wb-font-sans)', fontSize: '9.5px', fontWeight: rain >= 0.2 ? 700 : 600, lineHeight: 1, minHeight: 10, color: rain >= 0.2 ? 'var(--q-rain)' : 'var(--wb-text-dim)', opacity: rain >= 0.2 ? 1 : 0.55 }}>
        {rain >= 0.2 ? rain.toFixed(1) + ' mm' : 'dry'}
      </div>
    </button>
  );
}
