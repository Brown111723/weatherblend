import React from 'react';

export interface WeatherOrbRanges {
  tempMin?: number;
  tempMax?: number;
  windMax?: number;
  rainMax?: number;
}

export interface WeatherOrbProps {
  /** Temperature (°C) or, if normalized, 0–1. */
  temp?: number;
  /** Rain (mm) or 0–1. @default 0 */
  rain?: number;
  /** Wind (km/h) or 0–1. @default 0 */
  wind?: number;
  /** Cloud (%) or 0–1. @default 0 */
  cloud?: number;
  /** Normalisation ranges for raw values. */
  ranges?: WeatherOrbRanges;
  /** Treat inputs as pre-normalised 0–1 strengths. @default false */
  normalized?: boolean;
  /** Pixel size. @default 64 */
  size?: number;
  /** Breathing animation. @default true */
  animate?: boolean;
  style?: React.CSSProperties;
}

/**
 * The signature data-driven brand mark — four metric circles that grow,
 * brighten and glow with the forecast.
 * @startingPoint section="Weather" subtitle="The data-driven brand orb" viewport="700x220"
 */
export function WeatherOrb(props: WeatherOrbProps): JSX.Element;
