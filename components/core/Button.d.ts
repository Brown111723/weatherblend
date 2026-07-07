import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual emphasis. @default 'primary' */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** Stretch to fill the parent width. @default false */
  fullWidth?: boolean;
  /** Optional leading icon (SVG element). */
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Primary action button. Solid accent-blue, muted secondary, or borderless ghost.
 * @startingPoint section="Controls" subtitle="Accent, secondary & ghost buttons" viewport="700x140"
 */
export function Button(props: ButtonProps): JSX.Element;
