import React from 'react';

export interface ToggleProps {
  /** Icon glyph (SVG element) shown in the square. */
  icon: React.ReactNode;
  /** Caption below the square. */
  label: string;
  /** On/off state. @default false */
  enabled?: boolean;
  /** Colour the icon takes when enabled — pass the metric's quatrefoil hue. */
  color?: string;
  /** Fires with the next (toggled) boolean. */
  onClick?: (next: boolean) => void;
  style?: React.CSSProperties;
}

/** Icon-square metric toggle (Show / Confidence switches). */
export function Toggle(props: ToggleProps): JSX.Element;
