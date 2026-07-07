import React from 'react';

export interface DayTileProps {
  /** Short weekday label. @default 'Mon' */
  dow?: string;
  hi?: number;
  lo?: number;
  /** Day rain total (mm). @default 0 */
  rain?: number;
  /** Hourly temps for the mini spark. */
  values?: (number | null)[];
  selected?: boolean;
  today?: boolean;
  past?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/** One tile in the horizontal fingerprint day-selector strip. */
export function DayTile(props: DayTileProps): JSX.Element;
