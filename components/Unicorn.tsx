import { useSelector } from '@xstate/react';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Rive, { Fit, type RiveRef } from 'rive-react-native';

import { Sparkle } from './Sparkle';
import unicornFile from '../assets/unicorn.riv';
import { startUnicorn, unicorn, unicornTap, type Cue, type Pose } from '@/lib/machines/unicorn';
import { springs, useSparkle } from '@/lib/motion';
import { captureError } from '@/lib/telemetry';

/** The companion's home: top right, about 96 pt, on every screen. Headers keep clear of it. */
export const UNICORN = {
  size: 96,
  right: 12,
  top: 4,
  /** Width a header row leaves free on the right so a title never runs under her. */
  clearance: 96 + 12 + 8,
};

const HIDDEN_X = UNICORN.size + 40;

type Props = {
  /**
   * Which mode this instance belongs to. The root layout mounts the `home` one; a full-screen mode
   * (recorder, writer, canvas) mounts its own with its pose, because a Modal covers the root. Only
   * the instance whose pose matches the machine's is on stage.
   */
  pose?: Pose;
  /** Tapping plays a trick. Off on the recorder: any tap there stops and saves. */
  tapEnabled?: boolean;
  /** `absolute` (default) pins it to its home; `inline` lets the owner place it, as beside the timer. */
  placement?: 'absolute' | 'inline';
};

/**
 * The unicorn. At rest she is still: the Rive loop only runs while a cue plays. Reanimated does the
 * launch, the tricks and the moments that lib/machines/unicorn.ts decides. This component only
 * renders state and sends TAP.
 */
export function Unicorn({ pose = 'home', tapEnabled = pose !== 'recording', placement = 'absolute' }: Props) {
  const insets = useSafeAreaInsets();
  const state = useSelector(unicorn, (s) => (typeof s.value === 'string' ? s.value : 'idle'));
  const current = useSelector(unicorn, (s) => s.context.current);
  const activePose = useSelector(unicorn, (s) => s.context.pose);
  const launched = useSelector(unicorn, (s) => s.context.launched);
  const onStage = activePose === pose;
  const sparkle = useSparkle();
  const rive = useRef<RiveRef>(null);

  // Starts off the right edge; the launch moment brings her in.
  const x = useSharedValue(HIDDEN_X);
  const y = useSharedValue(0);
  const scale = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const rot = useSharedValue(0);

  useEffect(() => {
    startUnicorn();
  }, []);

  // Where she sits, from the machine's state.
  useEffect(() => {
    if (!onStage || state === 'hidden') {
      x.set(withTiming(HIDDEN_X, { duration: 220, easing: Easing.in(Easing.quad) }));
      return;
    }
    if (state === 'idle') {
      // Before the launch moment has run she stays off the edge; the moment is what brings her in.
      if (launched || pose !== 'home') x.set(withSpring(0, springs.swish));
      y.set(withSpring(0, springs.swish));
      rot.set(withSpring(0, springs.swish));
      scale.set(withSpring(1, springs.swish));
      scaleY.set(withSpring(1, springs.swish));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, onStage, pose, launched]);

  // A cue from the machine: the Rive loop runs for its length, with one Reanimated sequence per
  // trick or moment sized to CUES[name].ms. At rest the loop is paused.
  useEffect(() => {
    if (state !== 'playing' || !current || !onStage) {
      rive.current?.pause();
      return;
    }
    rive.current?.play();
    runCue(current, { y, x, scale, scaleY, rot, fire: sparkle.fire });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, current, onStage]);

  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${rot.value}deg` }, { scale: scale.value }, { scaleY: scaleY.value }],
  }));

  const canTap = tapEnabled && onStage && state !== 'hidden';
  return (
    <Animated.View
      pointerEvents={canTap ? 'box-none' : 'none'}
      style={[placement === 'absolute' ? [styles.home, { top: insets.top + UNICORN.top }] : styles.inline, anim]}>
      <Pressable accessibilityRole="image" accessibilityLabel="Enhörningen" onPress={unicornTap} disabled={!canTap} hitSlop={6} style={styles.box}>
        <Rive ref={rive} source={unicornFile} autoplay={false} fit={Fit.Contain} style={styles.box} onError={(err) => captureError('unicorn.rive', err)} />
        <Sparkle burst={sparkle.burst} corner="center" radius={UNICORN.size * 0.7} />
      </Pressable>
    </Animated.View>
  );
}

type Values = {
  y: SharedValue<number>;
  x: SharedValue<number>;
  scale: SharedValue<number>;
  scaleY: SharedValue<number>;
  rot: SharedValue<number>;
  fire: () => void;
};

function runCue(cue: Cue, v: Values) {
  switch (cue.name) {
    case 'launch':
      // Slides in from the right edge, blinks, settles.
      v.x.set(withSpring(0, { damping: 13, stiffness: 120 }));
      v.scaleY.set(withDelay(700, withSequence(withTiming(0.86, { duration: 90 }), withTiming(1, { duration: 140 }))));
      return;
    case 'saved':
      // Hops twice, sparkles.
      v.y.set(withSequence(withSpring(-28, springs.bounce), withSpring(0, springs.bounce), withSpring(-16, springs.bounce), withSpring(0, springs.bounce)));
      setTimeout(v.fire, 120);
      return;
    case 'rainbow':
      // The big one: a high jump with a full spin while the set piece runs around her.
      v.y.set(withSequence(withSpring(-70, { damping: 9, stiffness: 160 }), withSpring(0, springs.bounce)));
      v.rot.set(withSequence(withTiming(360, { duration: 900, easing: Easing.out(Easing.cubic) }), withTiming(0, { duration: 0 })));
      setTimeout(v.fire, 300);
      return;
    case 'spin':
      v.rot.set(withSequence(withTiming(360, { duration: 620, easing: Easing.inOut(Easing.cubic) }), withTiming(0, { duration: 0 })));
      return;
    case 'jump':
      v.y.set(withSequence(withSpring(-44, springs.bounce), withSpring(0, springs.bounce)));
      v.scaleY.set(withSequence(withTiming(0.85, { duration: 80 }), withTiming(1.1, { duration: 160 }), withSpring(1, springs.bounce)));
      return;
    case 'sneeze':
      // Winds up, lets go, sparkles fly.
      v.scale.set(withSequence(withTiming(1.14, { duration: 320, easing: Easing.out(Easing.quad) }), withTiming(0.88, { duration: 90 }), withSpring(1, springs.bounce)));
      v.rot.set(withSequence(withTiming(-8, { duration: 320 }), withTiming(12, { duration: 90 }), withSpring(0, springs.bounce)));
      setTimeout(v.fire, 400);
      return;
    case 'wiggle':
      v.rot.set(withSequence(...[-12, 12, -10, 10, -6, 6].map((d) => withTiming(d, { duration: 90 })), withSpring(0, springs.bounce)));
      return;
    case 'roll':
      // Rolls toward the middle of the screen and back (her home is on the right).
      v.rot.set(withSequence(withTiming(-360, { duration: 900, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 0 })));
      v.x.set(withSequence(withTiming(-48, { duration: 450, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 450, easing: Easing.inOut(Easing.quad) })));
      return;
  }
}

const styles = StyleSheet.create({
  home: { position: 'absolute', right: UNICORN.right, width: UNICORN.size, height: UNICORN.size, zIndex: 10 },
  inline: { width: UNICORN.size, height: UNICORN.size },
  box: { width: UNICORN.size, height: UNICORN.size },
});
