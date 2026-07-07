import React from 'react';
import { Logo } from '../brand/Logo.jsx';

/**
 * Drawer — the slide-in left menu (☰). A dimmed overlay and a 280px
 * panel with the brand header, an uppercase section label and a list of
 * list-style items that highlight to the accent on hover. Provide items
 * as {label, icon, onClick} or pass arbitrary children.
 */
export function Drawer({ open = false, onClose = () => {}, label = 'Options', items = [], children, style = {} }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 500, display: open ? 'block' : 'none' }}
    >
      <aside
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 280, maxWidth: '82vw',
          background: 'var(--wb-surface)', borderRight: '1px solid var(--wb-border-2)',
          boxShadow: 'var(--wb-shadow-modal)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
          transform: open ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform var(--wb-dur-drawer) var(--wb-ease)', overflowY: 'auto',
          ...style,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Logo size={26} wordmark />
          <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: 'var(--wb-radius-sm)', border: '1px solid var(--wb-border-2)', background: 'var(--wb-surface-2)', color: 'var(--wb-text-muted)', fontSize: 20, lineHeight: 1, cursor: 'pointer' }}>×</button>
        </div>
        {children ?? (
          <>
            <div style={{ fontFamily: 'var(--wb-font-sans)', fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--wb-text-dim)', marginTop: 6 }}>{label}</div>
            {items.map((it, i) => (
              <button
                key={i}
                onClick={() => { it.onClick?.(); onClose(); }}
                style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', borderRadius: 'var(--wb-radius-md)', border: '1px solid var(--wb-border)', background: 'var(--wb-surface-2)', color: 'var(--wb-text)', fontFamily: 'var(--wb-font-sans)', fontSize: '14.5px', fontWeight: 500, cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--wb-accent)'; e.currentTarget.style.background = 'var(--wb-accent-soft)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--wb-border)'; e.currentTarget.style.background = 'var(--wb-surface-2)'; }}
              >
                <span style={{ color: 'var(--wb-text-muted)', display: 'inline-flex', flexShrink: 0 }}>{it.icon}</span>
                {it.label}
              </button>
            ))}
          </>
        )}
      </aside>
    </div>
  );
}
