import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { type SharedValue } from 'react-native-reanimated';

import { SparkBurst } from './SparkBurst';
import { useSparkle } from '@/lib/motion';

export type SparkleCorner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'center';

type Props = {
  /** Where the burst sits in the parent. The parent needs `position: 'relative'` (the RN default) and `overflow: 'visible'`. */
  corner?: SparkleCorner;
  /** How far the sparks fly. */
  radius?: number;
  /** Inset from the corner. */
  inset?: number;
  /** Drive the burst yourself: pass `useSparkle().burst` and call `fire()`. */
  burst?: SharedValue<number>;
  /** Or let the component own it: the burst plays whenever this value changes (not on mount). */
  fireKey?: unknown;
};

/**
 * The sparkle preset of the motion vocabulary: the star burst, standalone, at the corner of whatever
 * was rewarded. Never catches touches. Two ways to drive it, see the props.
 */
export function Sparkle({ corner = 'topRight', radius = 40, inset = 8, burst, fireKey }: Props) {
  const own = useSparkle();
  const first = useRef(true);
  useEffect(() => {
    if (burst) return;
    if (first.current) {
      first.current = false;
      return;
    }
    own.fire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fireKey]);
  const anchor = corner === 'center' ? styles.center : { ...anchors[corner](inset) };
  return (
    <View pointerEvents="none" style={[styles.anchor, anchor]}>
      <SparkBurst burst={burst ?? own.burst} radius={radius} />
    </View>
  );
}

const anchors: Record<Exclude<SparkleCorner, 'center'>, (inset: number) => { top?: number; left?: number; right?: number; bottom?: number }> = {
  topLeft: (i) => ({ top: i, left: i }),
  topRight: (i) => ({ top: i, right: i }),
  bottomLeft: (i) => ({ bottom: i, left: i }),
  bottomRight: (i) => ({ bottom: i, right: i }),
};

const styles = StyleSheet.create({
  // A zero-size box: SparkBurst centres its sparks on it, so the burst centre is exactly the corner.
  anchor: { position: 'absolute', width: 0, height: 0, overflow: 'visible' },
  center: { top: '50%', left: '50%' },
});
