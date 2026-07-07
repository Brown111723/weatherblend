import React from 'react';

export interface DrawerItem {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}

export interface DrawerProps {
  open?: boolean;
  onClose?: () => void;
  /** Uppercase section label above the items. @default 'Options' */
  label?: string;
  items?: DrawerItem[];
  /** Custom body — overrides the label + items list. */
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/** Slide-in left menu (☰) with brand header and list items. */
export function Drawer(props: DrawerProps): JSX.Element;
