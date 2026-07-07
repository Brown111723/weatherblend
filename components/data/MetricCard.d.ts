import React from 'react';

export interface MetricCardProps {
  /** Metric identity — sets the top-accent & title colour. @default 'temp' */
  metric?: 'temp' | 'rain' | 'wind' | 'cloud';
  /** Uppercase title (e.g. "Temp"). */
  title: string;
  /** Main value, already formatted (e.g. "24°", "0.4 mm"). */
  value: React.ReactNode;
  /** Up to two muted sub-lines. */
  subs?: React.ReactNode[];
  /** Optional confidence % appended to the value. */
  confidence?: number;
  /** Translucent glass fill (over the hero gradient) vs solid surface. @default false */
  glass?: boolean;
  style?: React.CSSProperties;
}

/**
 * Glassy metric box with a quatrefoil top-accent, value and sub-lines.
 * @startingPoint section="Data" subtitle="Metric cards for the four metrics" viewport="700x150"
 */
export function MetricCard(props: MetricCardProps): JSX.Element;
