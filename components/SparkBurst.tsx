import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

/** The one sparkle burst in the app: eight pastel sparks flying out from a point. */
export const SPARKS = [
  { angle: -90, color: '#FF9AA2' },
  { angle: -40, color: '#FFDAC1' },
  { angle: 10, color: '#B5EAD7' },
  { angle: 60, color: '#C7CEEA' },
  { angle: 120, color: '#FFD166' },
  { angle: 170, color: '#F8A5C2' },
  { angle: 220, color: '#E2F0CB' },
  { angle: 270, color: '#FFFFFF' },
];

type Props = {
  /** 0 = hidden, animate 0 → 1 to fire. Anything at 0 or 1 draws nothing. */
  burst: SharedValue<number>;
  /** How far the sparks fly. */
  radius: number;
  /** Where the centre of the burst sits; defaults to the centre of the parent. */
  style?: StyleProp<ViewStyle>;
};

export function SparkBurst({ burst, radius, style }: Props) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      {SPARKS.map((s, i) => (
        <Spark key={i} angle={s.angle} color={s.color} radius={radius} burst={burst} />
      ))}
    </View>
  );
}

function Spark({ angle, color, radius, burst }: { angle: number; color: string; radius: number; burst: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = burst.value;
    const rad = (angle * Math.PI) / 180;
    const d = interpolate(t, [0, 1], [0, radius]);
    return {
      opacity: t <= 0 || t >= 1 ? 0 : interpolate(t, [0, 0.15, 1], [0, 1, 0]),
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
