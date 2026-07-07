import React from 'react';

export type ModelKey = 'gfs' | 'ecmwf' | 'icon' | 'gem' | 'ukmo' | 'cma' | 'jma';

export interface ModelDef {
  short: string;
  color: string;
  label: string;
  desc: string;
}

/** The 7 global weather models keyed by short id. */
export declare const MODELS: Record<ModelKey, ModelDef>;

export interface ModelBadgeProps {
  /** Model key ('gfs'…'jma') or a custom {short,color} object. @default 'gfs' */
  model?: ModelKey | ModelDef;
  /** Optional blend weight — a fraction (0–1) or a percent — shown after the dot. */
  weight?: number;
  /** Dot diameter (px). @default 22 */
  size?: number;
  style?: React.CSSProperties;
}

export interface WeightBadgeProps {
  /** Weight as a fraction (0–1) or a percent. @default 0 */
  weight?: number;
  style?: React.CSSProperties;
}

/** Coloured round dot identifying one of the 7 source models. */
export function ModelBadge(props: ModelBadgeProps): JSX.Element;
/** Blend-weight percentage, coloured by magnitude (green/amber/rose). */
export function WeightBadge(props: WeightBadgeProps): JSX.Element;
