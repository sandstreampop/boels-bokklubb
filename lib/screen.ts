import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { setUnicornHint, type HintTarget } from './machines/unicorn';
import { play } from './sounds';
import { info } from './telemetry';

// The swish is one sound per screen change: the screen that arrives plays `screen-in` on its
// first focus, the screen that goes away plays `screen-out` when it unmounts. A screen that merely
// regains focus is silent, and two swishes inside a quarter second collapse into one (a replace
// unmounts one screen and mounts another in the same frame). The launch has its own set piece.
let anyScreenFocused = false;
let lastSwishAt = 0;
function swish(name: 'screen-in' | 'screen-out') {
  const now = Date.now();
  if (now - lastSwishAt < 250) return;
  lastSwishAt = now;
  play(name);
}

/**
 * One breadcrumb per screen focus, so every error report shows where Boel was. And the swish, and
 * the button the unicorn's idle hint leans toward on this screen.
 */
export function useScreen(name: string, params?: Record<string, unknown>, hint: HintTarget = null) {
  const key = JSON.stringify(params ?? null);
  const arrived = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      info('screen.focus', { screen: name, ...(params ?? {}) });
      setUnicornHint(hint);
      if (!arrived.current) {
        arrived.current = true;
        if (anyScreenFocused) swish('screen-in');
        anyScreenFocused = true;
      }
      return () => {
        // Blur and unmount run the same cleanup; a tick later `alive` tells them apart.
        setTimeout(() => {
          if (!alive.current) swish('screen-out');
        }, 0);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, key, hint]),
  );
}
