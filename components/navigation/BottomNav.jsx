import React from 'react';

/**
 * BottomNav — the app's fixed bottom section switcher (Cards / Table /
 * Map). Icon over a tiny label; the active item takes the accent wash
 * and a lighter blue. Render it inside a fixed footer wrapper.
 */
export function BottomNav({ items = [], active, onChange = () => {}, style = {} }) {
  return (
    <nav
      style={{
        display: 'flex', justifyContent: 'space-around', alignItems: 'stretch',
        background: 'linear-gradient(0deg,#0d121c,#121925)',
        borderTop: '1px solid var(--wb-border-2)',
        padding: '4px 6px', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        ...style,
      }}
    >
      {items.map((it) => {
        const on = it.id === active;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '7px 4px', border: 'none', background: on ? 'var(--wb-accent-soft)' : 'none',
              color: on ? '#bfdbfe' : 'var(--wb-text-dim)',
              fontFamily: 'var(--wb-font-sans)', fontSize: 11, fontWeight: 600,
              borderRadius: 'var(--wb-radius-md)', cursor: 'pointer',
              transition: 'color var(--wb-dur-fast), background var(--wb-dur-fast)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {it.icon}
            <span>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
