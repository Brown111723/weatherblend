import React from 'react';

/**
 * WeatherBlend Button — the app's primary action control.
 * Solid accent-blue by default; a muted "secondary" fill and a borderless
 * "ghost" for low-emphasis actions. Rounded 10px, gentle scale on press.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  icon = null,
  style = {},
  ...rest
}) {
  const pad = size === 'sm' ? '8px 14px' : size === 'lg' ? '13px 20px' : '11px 16px';
  const fs = size === 'sm' ? '13px' : size === 'lg' ? '16px' : '15px';

  const variants = {
    primary: { background: 'var(--wb-accent)', color: '#fff', border: '1px solid transparent' },
    secondary: { background: 'var(--wb-surface-2)', color: 'var(--wb-text)', border: '1px solid var(--wb-border-2)' },
    ghost: { background: 'transparent', color: 'var(--wb-text-muted)', border: '1px solid transparent' },
  };

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: fullWidth ? '100%' : undefined,
    padding: pad,
    fontFamily: 'var(--wb-font-sans)',
    fontSize: fs,
    fontWeight: 600,
    lineHeight: 1,
    borderRadius: 'var(--wb-radius-md)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    transition: 'background var(--wb-dur-fast), border-color var(--wb-dur-fast), transform .1s',
    WebkitTapHighlightColor: 'transparent',
    ...variants[variant],
    ...style,
  };

  return (
    <button
      disabled={disabled}
      style={base}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(0.96)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
