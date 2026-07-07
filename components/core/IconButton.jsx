import React from 'react';

/**
 * IconButton — square, icon-only control used across the app chrome
 * (hamburger, close ×, day steppers). Rounded, hairline border by
 * default, brightens on hover. Pass an SVG (or ×) as children.
 */
export function IconButton({
  children,
  label,
  shape = 'square',
  size = 38,
  bordered = true,
  style = {},
  ...rest
}) {
  const radius = shape === 'round' ? '50%' : 'var(--wb-radius-lg)';
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    flexShrink: 0,
    padding: 0,
    borderRadius: radius,
    border: bordered ? '1px solid var(--wb-border)' : 'none',
    background: 'transparent',
    color: 'var(--wb-text-muted)',
    cursor: 'pointer',
    transition: 'background var(--wb-dur-fast), color var(--wb-dur-fast), transform .1s',
    WebkitTapHighlightColor: 'transparent',
    ...style,
  };
  return (
    <button
      aria-label={label}
      title={label}
      style={base}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--wb-border-2)'; e.currentTarget.style.color = 'var(--wb-text)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--wb-text-muted)'; e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.9)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      {...rest}
    >
      {children}
    </button>
  );
}
