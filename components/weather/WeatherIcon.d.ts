import React from 'react';

export interface WeatherIconProps {
  /** WMO weather code (0 clear, 1–3 cloud, 45/48 fog, 51–67 rain, 71–86 snow, 80–82 showers, 95+ thunder). @default 0 */
  code?: number;
  /** Swap sun→moon for night. @default false */
  night?: boolean;
  /** Pixel size. @default 26 */
  size?: number;
  style?: React.CSSProperties;
}

/**
 * Condition glyph built procedurally from a WMO weather code.
 * @startingPoint section="Weather" subtitle="Condition glyphs by weather code" viewport="700x150"
 */
export function WeatherIcon(props: WeatherIconProps): JSX.Element;
