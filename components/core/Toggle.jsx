import React from 'react';

/**
 * Toggle — the icon-square toggle used in the Sources panel for the
 * Show / Confidence metric switches. A 40px rounded button holding an
 * icon, with a caption below. When enabled the icon takes its metric
 * (quatrefoil) colour and the button fills; when off it dims.
 */
export function Toggle({
  icon,
  label,
  enabled = false,
  color = 'var(--wb-text)',
  onClick = () => {},
  style = {},
}) {
  return (
    <button
      onClick={() => onClick(!enabled)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '3px',
        width: 54,
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        ...style,
      }}
    >
      <span
        style={{
          width: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--wb-radius-md)',
          border: `1px solid ${enabled ? 'var(--wb-border-2)' : 'var(--wb-border)'}`,
          background: enabled ? 'var(--wb-surface)' : 'transparent',
          color: enabled ? color : 'var(--wb-text-muted)',
          opacity: enabled ? 1 : 0.4,
          transition: 'all var(--wb-dur-fast)',
        }}
      >
        {icon}
      </span>
      <span
        style={{
          fontFamily: 'var(--wb-font-sans)',
          fontSize: '9px',
          color: enabled ? 'var(--wb-text-muted)' : 'var(--wb-text-dim)',
          textAlign: 'center',
          maxWidth: 54,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </button>
  );
}
