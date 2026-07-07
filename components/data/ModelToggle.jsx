import React from 'react';
import { MODELS } from './ModelBadge.jsx';

/**
 * ModelToggle — a source-model row from the "Models & sources" panel.
 * The model's coloured dot, its name and description, in a bordered pill
 * that fills when enabled, dims when disabled, and shows an italic
 * "unavailable" note when the model returned no data.
 */
export function ModelToggle({
  model = 'gfs',
  enabled = true,
  unavailable = false,
  onClick = () => {},
  style = {},
}) {
  const m = typeof model === 'string' ? (MODELS[model] || MODELS.gfs) : model;
  const off = !enabled || unavailable;
  return (
    <button
      onClick={() => { if (!unavailable) onClick(!enabled); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '7px 11px',
        borderRadius: 'var(--wb-radius-md)',
        border: `1px solid ${unavailable ? '#3a1a0a' : enabled ? 'var(--wb-border-2)' : 'var(--wb-border)'}`,
        background: enabled && !unavailable ? 'var(--wb-surface)' : 'transparent',
        opacity: off ? (unavailable ? 0.5 : 0.4) : 1,
        cursor: unavailable ? 'default' : 'pointer',
        fontFamily: 'var(--wb-font-sans)', fontSize: '14px',
        transition: 'all var(--wb-dur-fast)',
        WebkitTapHighlightColor: 'transparent',
        ...style,
      }}
    >
      <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#fff', flexShrink: 0, background: m.color }}>{m.short}</span>
      <span style={{ fontWeight: 600, color: 'var(--wb-text)' }}>{m.label}</span>
      {unavailable
        ? <span style={{ fontSize: '12px', color: '#b45309', fontStyle: 'italic' }}>unavailable</span>
        : <span style={{ fontSize: '13px', color: 'var(--wb-text-muted)' }}>{m.desc}</span>}
    </button>
  );
}
