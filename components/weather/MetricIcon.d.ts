import React from 'react';

export interface MetricIconProps {
  /** Which metric glyph. @default 'temp' */
  metric?: 'temp' | 'rain' | 'wind' | 'cloud';
  /** Pixel size. @default 16 */
  size?: number;
  /** Override colour (defaults to the metric's quatrefoil hue). */
  color?: string;
  style?: React.CSSProperties;
}

/** Small line-glyph for one metric — thermometer, drop, wind streams, cloud. */
export function MetricIcon(props: MetricIconProps): JSX.Element;
