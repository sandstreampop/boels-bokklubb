// One motion vocabulary for the whole app (PRD build 7 §4). Five presets, reused everywhere rather
// than a new effect per screen. Reanimated only; colours and sizes stay in theme.ts.
//
//   springIn  scale 0.6 → 1 with overshoot, about 420 ms. New cards, buttons appearing, prompts.
//   squish    scale 0.9 on press-in, spring back on release. Every pressable (components/Squishy.tsx).
//   sparkle   the star burst, standalone, at the corner of whatever was rewarded (components/Sparkle.tsx).
//   swish     a screen or the unicorn slides in with a slight overshoot; out is a short slide away.
//   tumble    out-animation for things being replaced: shrink, tilt, drop, fade (prompts on reroll).
//
// Entering and exiting presets are functions so they can take a delay (the launch cascade staggers
// the shelf by 40 ms a book): `<Animated.View entering={springIn(index * 40)} exiting={tumble()}>`.
// Press feedback is a hook because it owns a shared value: `const squish = useSquish()`.

import { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, type WithSpringConfig } from 'react-native-reanimated';

export const springs = {
  /** Overshoots once and settles in about 420 ms. */
  in: { damping: 11, stiffness: 170, mass: 0.9 } satisfies WithSpringConfig,
  pressIn: { damping: 12, stiffness: 300 } satisfies WithSpringConfig,
  pressOut: { damping: 10, stiffness: 260 } satisfies WithSpringConfig,
  swish: { damping: 15, stiffness: 150 } satisfies WithSpringConfig,
  /** The unicorn's hops and wiggles: lively, lands quickly. */
  bounce: { damping: 8, stiffness: 240 } satisfies WithSpringConfig,
};

export const durations = {
  springIn: 420,
  tumble: 260,
  sparkle: 650,
  swishOut: 180,
  /** Stagger between books in the launch cascade. */
  cascade: 40,
};

export const squishScale = 0.9;

/** Entering: scale from 0.6 with a spring overshoot, fading in on the way. */
export const springIn = (delayMs = 0) => () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.6 }] },
    animations: {
      opacity: withDelay(delayMs, withTiming(1, { duration: 160 })),
      transform: [{ scale: withDelay(delayMs, withSpring(1, springs.in)) }],
    },
  };
};

/** Exiting: shrink, tilt and drop out of the way, gone in about 260 ms. */
export const tumble = (delayMs = 0) => () => {
  'worklet';
  const timing = { duration: durations.tumble, easing: Easing.in(Easing.quad) };
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }, { rotate: '0deg' }, { translateY: 0 }] },
    animations: {
      opacity: withDelay(delayMs, withTiming(0, timing)),
      transform: [
        { scale: withDelay(delayMs, withTiming(0.7, timing)) },
        { rotate: withDelay(delayMs, withTiming('-14deg', timing)) },
        { translateY: withDelay(delayMs, withTiming(24, timing)) },
      ],
    },
  };
};

/** Entering: slide in from the right with a slight overshoot. Screens and the unicorn ride it. */
export const swishIn = (delayMs = 0, fromX = 48) => () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateX: fromX }] },
    animations: {
      opacity: withDelay(delayMs, withTiming(1, { duration: 140 })),
      transform: [{ translateX: withDelay(delayMs, withSpring(0, springs.swish)) }],
    },
  };
};

/** Exiting: a short slide away to the left while fading. */
export const swishOut = (delayMs = 0, toX = -32) => () => {
  'worklet';
  const timing = { duration: durations.swishOut, easing: Easing.in(Easing.quad) };
  return {
    initialValues: { opacity: 1, transform: [{ translateX: 0 }] },
    animations: {
      opacity: withDelay(delayMs, withTiming(0, timing)),
      transform: [{ translateX: withDelay(delayMs, withTiming(toX, timing)) }],
    },
  };
};

/** Press feedback: spread `onPressIn`/`onPressOut` on a Pressable, `style` on the Animated.View inside. */
export function useSquish() {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: () => scale.set(withSpring(squishScale, springs.pressIn)),
    onPressOut: () => scale.set(withSpring(1, springs.pressOut)),
  };
}

/** Owns a burst value for components/Sparkle.tsx. `fire()` plays the burst from the start. */
export function useSparkle() {
  const burst = useSharedValue(0);
  return {
    burst,
    fire: () => {
      burst.set(0);
      burst.set(withTiming(1, { duration: durations.sparkle, easing: Easing.out(Easing.cubic) }));
    },
  };
}
