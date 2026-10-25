import { useSelector } from '@xstate/react';
import { useEffect } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Rive, { Fit } from 'rive-react-native';

import { Sparkle } from './Sparkle';
import unicornFile from '../assets/unicorn.riv';
import { duckUnicorn, startUnicorn, unicorn, unicornTap, type Cue, type HintTarget, type Pose } from '@/lib/machines/unicorn';
import { springs, useSparkle } from '@/lib/motion';
import { captureError, info } from '@/lib/telemetry';

/** The companion's home: bottom left, about 96 pt, on every screen. Screens pad for it. */
export const UNICORN = {
  size: 96,
  left: 12,
  bottom: 8,
  /** Extra bottom padding for scrolling content so nothing ends up behind the unicorn. */
  padding: 120,
};

const HIDDEN_Y = UNICORN.size + 120;
const DUCK_Y = UNICORN.size * 0.72;

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
 * The unicorn. The Rive loop keeps her breathing; Reanimated does the moments, tricks and idle
 * hints that lib/machines/unicorn.ts decides. This component only renders state and sends TAP.
 */
export function Unicorn({ pose = 'home', tapEnabled = pose !== 'recording', placement = 'absolute' }: Props) {
  const insets = useSafeAreaInsets();
  const state = useSelector(unicorn, (s) => (typeof s.value === 'string' ? s.value : 'idle'));
  const current = useSelector(unicorn, (s) => s.context.current);
  const activePose = useSelector(unicorn, (s) => s.context.pose);
  const hint = useSelector(unicorn, (s) => s.context.hint);
  const launched = useSelector(unicorn, (s) => s.context.launched);
  const onStage = activePose === pose;
  const sparkle = useSparkle();

  // Starts below the shelf; the launch moment brings her up.
  const y = useSharedValue(HIDDEN_Y);
  const x = useSharedValue(0);
  const scale = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const rot = useSharedValue(0);

  useEffect(() => {
    startUnicorn();
  }, []);

  // Bridging a native hook to the machine: the keyboard ducks her, as the rules allow.
  useEffect(() => {
    if (pose !== 'home') return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => duckUnicorn(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => duckUnicorn(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [pose]);

  // Where she sits, from the machine's state.
  useEffect(() => {
    if (!onStage || state === 'hidden') {
      y.set(withTiming(HIDDEN_Y, { duration: 220, easing: Easing.in(Easing.quad) }));
      return;
    }
    if (state === 'ducked') {
      y.set(withSpring(DUCK_Y, springs.swish));
      return;
    }
    if (state === 'idle' || state === 'idleWait') {
      // Before the launch moment has run she stays below; the moment is what brings her up. A home
      // instance mounted later (the add-book modal) reads the same flag and comes straight up.
      if (launched || pose !== 'home') y.set(withSpring(0, springs.swish));
      x.set(withSpring(0, springs.swish));
      rot.set(withSpring(0, springs.swish));
      scale.set(withSpring(1, springs.swish));
      scaleY.set(withSpring(1, springs.swish));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, onStage, pose, launched]);

  // A cue from the machine: one Reanimated sequence per trick or moment, sized to CUES[name].ms.
  useEffect(() => {
    if (state !== 'playing' || !current || !onStage) return;
    runCue(current, { y, x, scale, scaleY, rot, fire: sparkle.fire });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, current, onStage]);

  // Idle hint: a yawn, then a lean toward the useful button. Snaps back when the state changes.
  useEffect(() => {
    if (state !== 'idleHint' || !onStage) return;
    scaleY.set(withSequence(withTiming(1.12, { duration: 500, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 300 })));
    const lean = leanFor(hint);
    x.set(withDelay(800, withSpring(lean.x, springs.swish)));
    rot.set(withDelay(800, withSpring(lean.rot, springs.swish)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hint, onStage]);

  // The recording pose: a slow sway while the mic is open, no sound.
  useEffect(() => {
    if (pose !== 'recording' || !onStage) return;
    rot.set(withRepeat(withSequence(withTiming(-5, { duration: 1400, easing: Easing.inOut(Easing.sin) }), withTiming(5, { duration: 1400, easing: Easing.inOut(Easing.sin) })), -1, true));
    return () => {
      cancelAnimation(rot);
      rot.set(withSpring(0, springs.swish));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose, onStage]);

  // Writing and drawing: a nod now and then.
  useEffect(() => {
    if ((pose !== 'writing' && pose !== 'drawing') || !onStage) return;
    scaleY.set(withRepeat(withSequence(withDelay(2600, withTiming(0.92, { duration: 160 })), withTiming(1, { duration: 220 })), -1, false));
    return () => {
      cancelAnimation(scaleY);
      scaleY.set(withSpring(1, springs.swish));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose, onStage]);

  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${rot.value}deg` }, { scale: scale.value }, { scaleY: scaleY.value }],
  }));

  const canTap = tapEnabled && onStage && state !== 'hidden' && state !== 'ducked';
  return (
    <Animated.View
      pointerEvents={canTap ? 'box-none' : 'none'}
      style={[placement === 'absolute' ? [styles.home, { bottom: insets.bottom + UNICORN.bottom }] : styles.inline, anim]}>
      <Pressable accessibilityRole="image" accessibilityLabel="Enhörningen" onPress={unicornTap} disabled={!canTap} hitSlop={6} style={styles.box}>
        <Rive
          source={unicornFile}
          autoplay
          fit={Fit.Contain}
          style={styles.box}
          onPlay={(animationName) => info('unicorn.rive.play', { animationName })}
          onError={(err) => captureError('unicorn.rive', err)}
        />
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
      // Peeks up from below the shelf, blinks, settles.
      v.y.set(withSpring(0, { damping: 13, stiffness: 120 }));
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
      v.rot.set(withSequence(withTiming(360, { duration: 900, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 0 })));
      v.x.set(withSequence(withTiming(48, { duration: 450, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 450, easing: Easing.inOut(Easing.quad) })));
      return;
  }
}

/** The lean of the idle hint: toward the button that matters on this screen. */
function leanFor(target: HintTarget): { x: number; rot: number } {
  switch (target) {
    case 'plus':
      return { x: 16, rot: 12 };
    case 'done':
      return { x: 16, rot: 12 };
    case 'mic':
      return { x: 10, rot: -8 };
    default:
      return { x: 0, rot: 0 };
  }
}

const styles = StyleSheet.create({
  home: { position: 'absolute', left: UNICORN.left, width: UNICORN.size, height: UNICORN.size, zIndex: 10 },
  inline: { width: UNICORN.size, height: UNICORN.size },
  box: { width: UNICORN.size, height: UNICORN.size },
});
