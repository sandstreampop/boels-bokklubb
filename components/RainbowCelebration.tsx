import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { unicornMoment } from '@/lib/machines/unicorn';
import { play } from '@/lib/sounds';
import { colors, rainbow } from '@/lib/theme';

/** How long the set piece holds the screen; the owner unmounts it when onDone fires. */
export const RAINBOW_CELEBRATION_MS = 2200;

type Props = {
  /** Where the sweep starts, in the overlay's coordinates: the centre of the cover. */
  origin: { x: number; y: number };
  onDone: () => void;
};

/**
 * Set piece 3 of 3: the book goes rainbow. A rainbow sweeps the screen from the cover outward,
 * stars rain for a second, the unicorn jumps with the fanfare, a heavy haptic lands. Mount it over
 * the book page the moment the book completes (once per book) and unmount on onDone. The ring that
 * draws itself around the cover is the cover's own: pass it `celebrating` when this mounts.
 * Never catches touches; never appears on cards.
 */
export function RainbowCelebration({ origin, onDone }: Props) {
  const { width, height } = useWindowDimensions();
  // A ring big enough to cover the far corner of the screen when fully grown.
  const reach = Math.hypot(Math.max(origin.x, width - origin.x), Math.max(origin.y, height - origin.y)) * 2 + RING_WIDTH * 2;

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    play('rainbow');
    unicornMoment('rainbow');
    const t = setTimeout(onDone, RAINBOW_CELEBRATION_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {rainbow.map((c, i) => (
        <Ring key={c} color={c} index={i} origin={origin} reach={reach} />
      ))}
      {STARS.map((s, i) => (
        <FallingStar key={i} {...s} width={width} />
      ))}
    </View>
  );
}

const RING_WIDTH = 28;
const RING_STAGGER = 70;
const SWEEP_MS = 1000;

function Ring({ color, index, origin, reach }: { color: string; index: number; origin: { x: number; y: number }; reach: number }) {
  const grow = useSharedValue(0);
  const fade = useSharedValue(0.95);
  useEffect(() => {
    const delay = index * RING_STAGGER;
    grow.set(withDelay(delay, withTiming(1, { duration: SWEEP_MS, easing: Easing.out(Easing.cubic) })));
    fade.set(withDelay(delay + SWEEP_MS - 350, withTiming(0, { duration: 450, easing: Easing.in(Easing.quad) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ scale: grow.value }] }));
  return (
    <Animated.View
      style={[
        styles.ring,
        { width: reach, height: reach, borderRadius: reach / 2, borderColor: color, left: origin.x - reach / 2, top: origin.y - reach / 2 },
        style,
      ]}
    />
  );
}

const STAR_PATH = 'M12 2.5l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.3l-6 3.3 1.3-6.6L2.4 9.4l6.7-.8L12 2.5z';

// Fixed positions, so the rain looks the same every time and nothing is left to chance at runtime.
const STARS: { x: number; delay: number; duration: number; size: number; spin: number }[] = [
  { x: 0.06, delay: 0, duration: 1150, size: 22, spin: 160 },
  { x: 0.18, delay: 180, duration: 1300, size: 16, spin: -200 },
  { x: 0.27, delay: 60, duration: 1050, size: 26, spin: 120 },
  { x: 0.36, delay: 320, duration: 1250, size: 18, spin: -140 },
  { x: 0.45, delay: 120, duration: 1100, size: 24, spin: 220 },
  { x: 0.53, delay: 400, duration: 1350, size: 14, spin: -90 },
  { x: 0.61, delay: 40, duration: 1200, size: 20, spin: 180 },
  { x: 0.7, delay: 260, duration: 1050, size: 26, spin: -160 },
  { x: 0.78, delay: 140, duration: 1300, size: 16, spin: 130 },
  { x: 0.86, delay: 360, duration: 1150, size: 22, spin: -210 },
  { x: 0.94, delay: 90, duration: 1250, size: 18, spin: 150 },
  { x: 0.12, delay: 520, duration: 1100, size: 20, spin: -120 },
  { x: 0.4, delay: 600, duration: 1200, size: 16, spin: 170 },
  { x: 0.66, delay: 560, duration: 1050, size: 24, spin: -150 },
  { x: 0.9, delay: 640, duration: 1300, size: 14, spin: 110 },
  { x: 0.3, delay: 700, duration: 1150, size: 22, spin: -180 },
];
const FALL = 560;

function FallingStar({ x, delay, duration, size, spin, width }: (typeof STARS)[number] & { width: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(delay, withTiming(1, { duration, easing: Easing.in(Easing.quad) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: t.value === 0 ? 0 : t.value < 0.85 ? 1 : (1 - t.value) / 0.15,
    transform: [{ translateY: -size + t.value * FALL }, { rotate: `${t.value * spin}deg` }],
  }));
  return (
    <Animated.View style={[styles.star, { left: x * width - size / 2 }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={STAR_PATH} fill={colors.gold} stroke="#F0A500" strokeWidth={1.2} strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: RING_WIDTH },
  star: { position: 'absolute', top: 0 },
});
