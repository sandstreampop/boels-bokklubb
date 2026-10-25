import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Icon, type IconName } from './Icon';
import { colors } from '@/lib/theme';

type Props = {
  icon: IconName;
  onPress: () => void;
  size?: number;
  color?: string;
  iconColor?: string;
  disabled?: boolean;
  label: string;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
};

/** The one button shape in the app: a circle with an icon. Squishes on press. */
export function RoundButton({
  icon,
  onPress,
  size = 64,
  color = colors.pinkDeep,
  iconColor = colors.white,
  disabled,
  label,
  style,
  haptic = true,
}: Props) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPressIn={() => {
        scale.value = withSpring(0.9, { damping: 12, stiffness: 300 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 10, stiffness: 260 });
      }}
      onPress={() => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      hitSlop={8}
      style={style}>
      <Animated.View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: disabled ? 0.35 : 1 },
          anim,
        ]}>
        <Icon name={icon} size={size * 0.46} color={iconColor} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E9679B',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
});
