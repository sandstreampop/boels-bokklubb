// The window, as a Layout (lib/layout.ts). Re-renders on rotation and on a Split View resize.

import { useWindowDimensions, type ModalProps } from 'react-native';

import { layoutFor, type Layout } from './layout';

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return layoutFor(width, height);
}

/**
 * A Modal is portrait-only unless told otherwise, whatever Info.plist says, and every full-screen
 * mode is a Modal. Without this an iPad in landscape would snap to portrait when the mic opens.
 * The iPhone is unaffected: its Info.plist allows portrait only.
 */
export const MODAL_ORIENTATIONS: NonNullable<ModalProps['supportedOrientations']> = [
  'portrait',
  'portrait-upside-down',
  'landscape',
  'landscape-left',
  'landscape-right',
];
