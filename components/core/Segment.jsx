import React from 'react';

/**
 * Segment — segmented control (the app's "Recency / Per-day / Blend"
 * and view switchers). One bordered pill, dividers between options,
 * the active option filled with the accent wash.
 */
export function Segment({ options = [], value, onChange = () => {}, style = {} }) {
  const wrap = {
    display: 'flex',
    border: '1px solid var(--wb-border-2)',
    borderRadius: 'var(--wb-radius-md)',
    overflow: 'hidden',
    background: 'rgba(255,255,255,.03)',
    ...style,
  };
  return (
    <div style={wrap} role="tablist">
      {options.map((opt, i) => {
        const val = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        const on = val === value;
        return (
          <button
            key={val}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(val)}
            style={{
              flex: 1,
              padding: '8px 10px',
              fontFamily: 'var(--wb-font-sans)',
              fontSize: '12px',
              fontWeight: 600,
              color: on ? 'var(--wb-text)' : 'var(--wb-text-muted)',
              background: on ? 'var(--wb-accent-soft)' : 'transparent',
              border: 'none',
              borderRight: i < options.length - 1 ? '1px solid var(--wb-border-2)' : 'none',
              cursor: 'pointer',
              transition: 'background var(--wb-dur-fast), color var(--wb-dur-fast)',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
