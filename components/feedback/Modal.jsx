import React from 'react';

/**
 * Modal — the app's centered dialog (Help, Accuracy, City search). A
 * dimmed backdrop, a rounded surface card capped at 540px with its own
 * scroll, a close × in the corner, and an optional sticky footer button.
 * Click the backdrop to dismiss.
 */
export function Modal({
  open = true,
  title,
  subtitle,
  children,
  onClose = () => {},
  maxWidth = 540,
  footer,
  style = {},
}) {
  if (!open) return null;
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        style={{
          position: 'relative', background: 'var(--wb-surface)', border: '1px solid var(--wb-border-2)',
          borderRadius: 'var(--wb-radius-2xl)', maxWidth, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 28,
          ...style,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: 'var(--wb-radius-sm)', border: '1px solid var(--wb-border-2)', background: 'var(--wb-surface-2)', color: 'var(--wb-text-muted)', fontSize: 14, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6 }}
        >✕</button>
        {title && <h2 style={{ fontFamily: 'var(--wb-font-sans)', fontSize: 20, fontWeight: 700, color: 'var(--wb-text)', margin: 0, marginBottom: subtitle ? 4 : 12 }}>{title}</h2>}
        {subtitle && <div style={{ fontFamily: 'var(--wb-font-sans)', fontSize: 13, color: 'var(--wb-text-muted)', marginBottom: 20 }}>{subtitle}</div>}
        <div style={{ fontFamily: 'var(--wb-font-sans)', fontSize: 14, color: 'var(--wb-text-muted)', lineHeight: 1.6 }}>{children}</div>
        {footer}
      </div>
    </div>
  );
}
