import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { SparkBurst } from './SparkBurst';
import { useSquish } from '@/lib/motion';
import { playStar } from '@/lib/sounds';
import { colors } from '@/lib/theme';

type Props = {
  value: number | null;
  onChange: (value: number) => void;
  size?: number;
};

const STAR_PATH =
  'M12 2.5l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.3l-6 3.3 1.3-6.6L2.4 9.4l6.7-.8L12 2.5z';

/** 1 to 5 stars. Tapping a star fills up to it with a bounce, a sparkle burst, a haptic tick and a tick that climbs with the level. */
export function StarRating({ value, onChange, size = 44 }: Props) {
  const burst = useSharedValue(0);
  const burstIndex = useSharedValue(-1);

  const tap = (n: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    playStar(n);
    burstIndex.set(n - 1);
    burst.set(0);
    burst.set(withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
    onChange(n);
  };

  return (
    <View style={styles.row} accessibilityRole="adjustable" accessibilityLabel="Stjärnor">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          index={n - 1}
          filled={!!value && n <= value}
          size={size}
          onPress={() => tap(n)}
          burst={burst}
          burstIndex={burstIndex}
          delay={value && n <= value ? (n - 1) * 40 : 0}
        />
      ))}
    </View>
  );
}

type StarProps = {
  index: number;
  filled: boolean;
  size: number;
  onPress: () => void;
  burst: SharedValue<number>;
  burstIndex: SharedValue<number>;
  delay: number;
};

function Star({ index, filled, size, onPress, burst, burstIndex, delay }: StarProps) {
  const scale = useSharedValue(1);
  const fill = useSharedValue(filled ? 1 : 0);
  const squish = useSquish();

  useEffect(() => {
    fill.set(withDelay(delay, withTiming(filled ? 1 : 0, { duration: 220 })));
    if (filled) {
      scale.set(
        withDelay(delay, withSequence(withSpring(1.35, { damping: 6, stiffness: 260 }), withSpring(1, { damping: 10 }))),
      );
    }
  }, [filled, delay, fill, scale]);

  const starStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value }));
  // One burst value is shared by all five stars; only the tapped one shows it.
  const myBurst = useDerivedValue(() => (burstIndex.value === index ? burst.value : 0));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={squish.onPressIn}
      onPressOut={squish.onPressOut}
      hitSlop={6}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityLabel={`${index + 1} stjärnor`}>
      <SparkBurst burst={myBurst} radius={size * 0.95} />
      <Animated.View style={[StyleSheet.absoluteFill, starStyle, squish.style]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d={STAR_PATH} fill={colors.goldSoft} stroke={colors.gold} strokeWidth={1.2} strokeLinejoin="round" />
        </Svg>
        <Animated.View style={[StyleSheet.absoluteFill, fillStyle]}>
          <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d={STAR_PATH} fill={colors.gold} stroke="#F0A500" strokeWidth={1.2} strokeLinejoin="round" />
          </Svg>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
});
