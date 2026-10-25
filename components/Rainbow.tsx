import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { rainbow } from '@/lib/theme';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
/** How long the ring takes to draw itself around a cover that just went rainbow. */
export const RING_DRAW_MS = 1100;

/**
 * The rainbow ring a complete book earns: a gradient border drawn just outside a cover. Place it
 * absolutely over a wrapper the size of the cover; it draws `stroke` points outside that box.
 */
export function RainbowRing({
  width,
  height,
  radius,
  stroke = 4,
  style,
  draw = false,
}: {
  width: number;
  height: number;
  radius: number;
  stroke?: number;
  style?: StyleProp<ViewStyle>;
  /** Set piece 3: when this turns true the ring draws itself around the cover instead of just being there. */
  draw?: boolean;
}) {
  const w = width + stroke * 2;
  const h = height + stroke * 2;
  // The dash trick: one dash as long as the whole outline, offset all the way, then run to zero.
  const r = radius + stroke / 2;
  const perimeter = 2 * (w - stroke + (h - stroke)) - (8 - 2 * Math.PI) * r;
  const drawn = useSharedValue(draw ? 0 : 1);
  useEffect(() => {
    if (!draw) return;
    drawn.set(0);
    drawn.set(withTiming(1, { duration: RING_DRAW_MS, easing: Easing.inOut(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw]);
  const dash = useAnimatedProps(() => ({ strokeDashoffset: perimeter * (1 - drawn.value) }));
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', left: -stroke, top: -stroke, width: w, height: h }, style]}>
      <Svg width={w} height={h}>
        <Defs>
          <LinearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            {rainbow.map((c, i) => (
              <Stop key={c} offset={i / (rainbow.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <AnimatedRect
          x={stroke / 2}
          y={stroke / 2}
          width={w - stroke}
          height={h - stroke}
          rx={r}
          stroke="url(#ring)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={[perimeter, perimeter]}
          animatedProps={dash}
          fill="none"
        />
      </Svg>
    </View>
  );
}

/** A soft pastel rainbow band, built from stripes so it needs no gradient library. */
export function RainbowBar({ height = 6, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.row, { height, borderRadius: height / 2 }, style]}>
      {rainbow.map((c) => (
        <View key={c} style={{ flex: 1, backgroundColor: c }} />
      ))}
    </View>
  );
}

/** Placeholder cover: a rainbow wash picked from the book id so each book keeps its own colour. */
export function RainbowFill({ seed, style }: { seed: string; style?: StyleProp<ViewStyle> }) {
  const n = seed.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const a = rainbow[n % rainbow.length];
  const b = rainbow[(n + 2) % rainbow.length];
  return (
    <View style={[styles.fill, style]}>
      <View style={{ flex: 1, backgroundColor: a }} />
      <View style={{ flex: 1, backgroundColor: b }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', overflow: 'hidden' },
  fill: { overflow: 'hidden', flexDirection: 'column' },
});
