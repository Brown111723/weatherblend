import React from 'react';

export interface SegmentOption {
  value: string;
  label: string;
}

export interface SegmentProps {
  /** Options — plain strings or {value,label} objects. */
  options: (string | SegmentOption)[];
  /** Currently selected value. */
  value: string;
  /** Fires with the newly selected value. */
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}

/** Segmented control for 2–4 mutually-exclusive options. */
export function Segment(props: SegmentProps): JSX.Element;
