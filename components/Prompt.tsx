import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Icon } from './Icon';
import { SparkBurst } from './SparkBurst';
import { fonts } from '@/lib/theme';

const WAND = 56;

type Props = {
  prompt: string;
  /** Called when the wand is tapped; the owner picks the next prompt and passes it back. */
  onReroll: () => void;
  color: string;
  wandColor: string;
  size?: number;
  align?: 'left' | 'center';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

/**
 * A prompt with its magic wand. When the prompt changes the old one shrinks and tumbles away, the
 * new one springs in, and sparks fly from the wand tip. The wand itself only asks for a reroll.
 */
export function PromptLine({ prompt, onReroll, color, wandColor, size = 26, align = 'left', style, textStyle }: Props) {
  // The prompt that was on screen before this one, kept so it can tumble away. Adjusted during
  // render when the prop changes (the React pattern for state that follows a prop).
  const [shown, setShown] = useState(prompt);
  const [leaving, setLeaving] = useState<string | null>(null);
  if (prompt !== shown) {
    setLeaving(shown);
    setShown(prompt);
  }
  const enter = useSharedValue(1);
  const leave = useSharedValue(0);
  const burst = useSharedValue(0);

  useEffect(() => {
    if (leaving === null) return;
    leave.set(0);
    leave.set(withTiming(1, { duration: 420, easing: Easing.in(Easing.cubic) }));
    enter.set(0);
    enter.set(withSpring(1, { damping: 11, stiffness: 180, mass: 0.8 }));
    burst.set(0);
    burst.set(withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 1.6),
    transform: [{ scale: 0.4 + 0.6 * enter.value }],
  }));
  const leaveStyle = useAnimatedStyle(() => ({
    opacity: 1 - leave.value,
    transform: [
      { translateY: 50 * leave.value },
      { translateX: -30 * leave.value },
      { rotate: `${-28 * leave.value}deg` },
      { scale: 1 - 0.7 * leave.value },
    ],
  }));

  const text = [styles.text, { color, fontSize: size, lineHeight: Math.round(size * 1.2), textAlign: align }, textStyle];

  return (
    <View style={[styles.row, style]} pointerEvents="box-none">
      <View style={styles.textBox} pointerEvents="none">
        <Animated.Text style={[text, enterStyle]}>{shown}</Animated.Text>
        {leaving !== null && (
          <Animated.Text style={[text, styles.leaving, leaveStyle]}>
            {leaving}
          </Animated.Text>
        )}
      </View>
      <Wand color={wandColor} burst={burst} onPress={onReroll} />
    </View>
  );
}

function Wand({ color, burst, onPress }: { color: string; burst: SharedValue<number>; onPress: () => void }) {
  const scale = useSharedValue(1);
  const squish = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { rotate: `${(1 - scale.value) * -60}deg` }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ny fråga"
      hitSlop={10}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        scale.set(withSequence(withSpring(0.8, { damping: 10, stiffness: 400 }), withSpring(1, { damping: 8, stiffness: 240 })));
        onPress();
      }}
      style={styles.wand}>
      <Animated.View style={squish}>
        <Icon name="wand" size={WAND} color={color} strokeWidth={2.2} />
      </Animated.View>
      {/* The burst sits on the tip of the wand, top right of the icon box. */}
      <SparkBurst burst={burst} radius={WAND * 0.9} style={styles.tip} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  textBox: { flex: 1, minWidth: 0, justifyContent: 'center' },
  text: { fontFamily: fonts.displaySemi },
  leaving: { position: 'absolute', left: 0, right: 0 },
  wand: { width: WAND, height: WAND, alignItems: 'center', justifyContent: 'center' },
  tip: { left: WAND * 0.24, top: -WAND * 0.34 },
});
