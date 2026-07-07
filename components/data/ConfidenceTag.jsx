import React from 'react';

function levelOf(v) {
  if (typeof v === 'string') return v;
  if (v >= 67) return 'High';
  if (v >= 34) return 'Medium';
  return 'Low';
}
const COLORS = { High: 'var(--wb-conf-high)', Medium: 'var(--wb-conf-mid)', Low: 'var(--wb-conf-low)' };

/**
 * ConfidenceTag — the plain-English model-agreement read-out
 * (High / Medium / Low), coloured green / amber / rose. Optionally
 * shows the underlying percentage. Confidence measures how much the
 * models AGREE — not certainty.
 */
export function ConfidenceTag({ value = 'High', showPct = false, style = {} }) {
  const level = levelOf(value);
  const pct = typeof value === 'number' ? Math.round(value) : null;
  return (
    <span style={{ fontFamily: 'var(--wb-font-sans)', fontSize: '12px', fontWeight: 700, color: COLORS[level] || COLORS.High, ...style }}>
      {level}{showPct && pct != null && <span style={{ fontWeight: 600, opacity: 0.8 }}> · {pct}%</span>}
    </span>
  );
}
