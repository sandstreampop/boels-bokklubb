import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { info } from './telemetry';

/** One breadcrumb per screen focus, so every error report shows where Boel was. */
export function useScreen(name: string, params?: Record<string, unknown>) {
  const key = JSON.stringify(params ?? null);
  useFocusEffect(
    useCallback(() => {
      info('screen.focus', { screen: name, ...(params ?? {}) });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, key]),
  );
}
