import React from 'react';

export interface BottomNavItem {
  id: string;
  label: string;
  /** Icon element (SVG). */
  icon?: React.ReactNode;
}

export interface BottomNavProps {
  items: BottomNavItem[];
  /** id of the active item. */
  active?: string;
  onChange?: (id: string) => void;
  style?: React.CSSProperties;
}

/** Fixed bottom section switcher (Cards / Table / Map). */
export function BottomNav(props: BottomNavProps): JSX.Element;
