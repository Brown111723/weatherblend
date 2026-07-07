import React from 'react';

export interface ConfidenceTagProps {
  /** A percentage (0–100) mapped to a level, or an explicit level string. @default 'High' */
  value?: number | 'High' | 'Medium' | 'Low';
  /** Append the underlying percentage. @default false */
  showPct?: boolean;
  style?: React.CSSProperties;
}

/** Plain-English model-agreement read-out — High / Medium / Low. */
export function ConfidenceTag(props: ConfidenceTagProps): JSX.Element;
