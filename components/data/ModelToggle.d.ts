import React from 'react';
import { ModelKey, ModelDef } from './ModelBadge';

export interface ModelToggleProps {
  /** Model key ('gfs'…'jma') or a {short,color,label,desc} object. @default 'gfs' */
  model?: ModelKey | ModelDef;
  /** Included in the blend. @default true */
  enabled?: boolean;
  /** Model returned no data — non-interactive, italic note. @default false */
  unavailable?: boolean;
  /** Fires with the next enabled state. */
  onClick?: (next: boolean) => void;
  style?: React.CSSProperties;
}

/** Source-model row from the "Models & sources" panel. */
export function ModelToggle(props: ModelToggleProps): JSX.Element;
