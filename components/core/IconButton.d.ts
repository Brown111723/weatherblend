import React from 'react';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible label (also the tooltip). */
  label: string;
  /** @default 'square' */
  shape?: 'square' | 'round';
  /** Pixel size of the square. @default 38 */
  size?: number;
  /** Show the hairline border. @default true */
  bordered?: boolean;
  /** Icon glyph (SVG element or character). */
  children?: React.ReactNode;
}

/** Square, icon-only chrome control (menu, close, steppers). */
export function IconButton(props: IconButtonProps): JSX.Element;
