import React from 'react';

export interface SparklineTick {
  /** 0–1 position across the width. */
  frac: number;
  kind?: 'rise' | 'set';
}

export interface SparklineProps {
  /** Hourly values (nulls allowed for gaps). */
  values: (number | null)[];
  /** Metric — sets the line colour & value ramp. @default 'temp' */
  metric?: 'temp' | 'rain' | 'wind' | 'cloud';
  /** Fraction (0–1) where forecast begins; the segment past it dashes. @default 1 */
  split?: number;
  /** Force the y-axis to start at 0 (rain/wind). @default false */
  zeroBase?: boolean;
  /** Amber vertical markers (sunrise/sunset). */
  ticks?: SparklineTick[];
  /** Pixel height. @default 44 */
  height?: number;
  style?: React.CSSProperties;
}

/** Hero day-trace sparkline — value-ramped line, soft area, solid/dashed observed/forecast split. */
export function Sparkline(props: SparklineProps): JSX.Element;
