import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { colors } from '@/lib/theme';

type Props = {
  value: number | null;
  onChange: (value: number) => void;
  size?: number;
};

const STAR_PATH =
  'M12 2.5l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.3l-6 3.3 1.3-6.6L2.4 9.4l6.7-.8L12 2.5z';

/** 1 to 5 stars. Tapping a star fills up to it with a bounce, a sparkle burst and a haptic tick. */
export function StarRating({ value, onChange, size = 44 }: Props) {
  const burst = useSharedValue(0);
  const burstIndex = useSharedValue(-1);

  const tap = (n: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
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

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityLabel={`${index + 1} stjärnor`}>
      <Sparkles index={index} size={size} burst={burst} burstIndex={burstIndex} />
      <Animated.View style={[StyleSheet.absoluteFill, starStyle]}>
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

const SPARKS = [
  { angle: -90, color: '#FF9AA2' },
  { angle: -40, color: '#FFDAC1' },
  { angle: 10, color: '#B5EAD7' },
  { angle: 60, color: '#C7CEEA' },
  { angle: 120, color: '#FFD166' },
  { angle: 170, color: '#F8A5C2' },
  { angle: 220, color: '#E2F0CB' },
  { angle: 270, color: '#FFFFFF' },
];

function Sparkles({
  index,
  size,
  burst,
  burstIndex,
}: {
  index: number;
  size: number;
  burst: SharedValue<number>;
  burstIndex: SharedValue<number>;
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {SPARKS.map((s, i) => (
        <Spark key={i} angle={s.angle} color={s.color} radius={size * 0.95} index={index} burst={burst} burstIndex={burstIndex} />
      ))}
    </View>
  );
}

function Spark({
  angle,
  color,
  radius,
  index,
  burst,
  burstIndex,
}: {
  angle: number;
  color: string;
  radius: number;
  index: number;
  burst: SharedValue<number>;
  burstIndex: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const active = burstIndex.value === index;
    const t = active ? burst.value : 0;
    const rad = (angle * Math.PI) / 180;
    const d = interpolate(t, [0, 1], [0, radius]);
    return {
      opacity: active ? interpolate(t, [0, 0.15, 1], [0, 1, 0]) : 0,
      transform: [
        { translateX: Math.cos(rad) * d },
        { translateY: Math.sin(rad) * d },
        { scale: interpolate(t, [0, 0.3, 1], [0.2, 1, 0.3]) },
        { rotate: `${t * 180}deg` },
      ],
    };
  });
  return (
    <Animated.View style={[styles.spark, { backgroundColor: color }, style]}>
      <View style={[styles.sparkDiamond, { backgroundColor: color }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  spark: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -4,
    marginTop: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sparkDiamond: {
    position: 'absolute',
    width: 8,
    height: 8,
    transform: [{ rotate: '45deg' }],
    borderRadius: 1,
  },
});
