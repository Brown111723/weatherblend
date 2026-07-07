import React from 'react';

export interface ModalProps {
  /** Controls visibility. @default true */
  open?: boolean;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  /** Fires on backdrop click or the close ×. */
  onClose?: () => void;
  /** Max width (px). @default 540 */
  maxWidth?: number;
  /** Optional footer node (e.g. a sticky Close button). */
  footer?: React.ReactNode;
  style?: React.CSSProperties;
}

/** Centered dialog with dimmed backdrop, close × and scrolling body. */
export function Modal(props: ModalProps): JSX.Element | null;
