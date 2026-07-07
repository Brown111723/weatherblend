import React from 'react';

export interface LogoProps {
  /** Mark size in px. @default 30 */
  size?: number;
  /** Show the "WeatherBlend" wordmark beside the mark. @default false */
  wordmark?: boolean;
  style?: React.CSSProperties;
}

/**
 * The WeatherBlend quatrefoil mark, optionally with wordmark.
 * @startingPoint section="Brand" subtitle="Quatrefoil mark & wordmark" viewport="700x150"
 */
export function Logo(props: LogoProps): JSX.Element;
