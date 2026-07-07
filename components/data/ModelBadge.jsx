import React from 'react';

/** The 7 global weather models, with their fixed identity colours. */
export const MODELS = {
  gfs:   { short: 'G', color: 'var(--wb-model-gfs)',   label: 'GFS',   desc: 'NOAA · USA' },
  ecmwf: { short: 'E', color: 'var(--wb-model-ecmwf)', label: 'ECMWF', desc: 'ECMWF · 0.25°' },
  icon:  { short: 'I', color: 'var(--wb-model-icon)',  label: 'ICON',  desc: 'DWD · Germany' },
  gem:   { short: 'C', color: 'var(--wb-model-gem)',   label: 'GEM',   desc: 'Env. Canada' },
  ukmo:  { short: 'U', color: 'var(--wb-model-ukmo)',  label: 'UKMO',  desc: 'Met Office · UK' },
  cma:   { short: 'X', color: 'var(--wb-model-cma)',   label: 'CMA',   desc: 'CMA · China' },
  jma:   { short: 'J', color: 'var(--wb-model-jma)',   label: 'JMA',   desc: 'JMA · Japan' },
};

/**
 * ModelBadge — a coloured round "dot" carrying the model's short letter,
 * optionally followed by its current blend-weight percentage. This is how
 * each of the 7 source models is identified in tables and panels.
 */
export function ModelBadge({ model = 'gfs', weight, size = 22, style = {} }) {
  const m = typeof model === 'string' ? (MODELS[model] || MODELS.gfs) : model;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...style }}>
      <span style={{
        width: size, height: size, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--wb-font-sans)', fontSize: '10px', fontWeight: 700, color: '#fff', flexShrink: 0, background: m.color,
      }}>{m.short}</span>
      {weight != null && <WeightBadge weight={weight} />}
    </span>
  );
}

/** WeightBadge — a blend-weight percentage, coloured by magnitude. */
export function WeightBadge({ weight = 0, style = {} }) {
  const pct = Math.round(weight <= 1 ? weight * 100 : weight);
  const color = pct >= 20 ? 'var(--wb-conf-high)' : pct >= 10 ? 'var(--wb-conf-mid)' : 'var(--wb-conf-low)';
  return (
    <span style={{ fontFamily: 'var(--wb-font-sans)', fontSize: '10px', fontWeight: 500, color, ...style }}>{pct}%</span>
  );
}
