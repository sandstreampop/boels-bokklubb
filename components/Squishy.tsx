import * as Haptics from 'expo-haptics';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useSquish } from '@/lib/motion';
import { play, type SoundName } from '@/lib/sounds';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  /** Styles the visual (the Animated.View that squishes). */
  style?: StyleProp<ViewStyle>;
  /** Styles the touch area, rarely needed. */
  pressableStyle?: StyleProp<ViewStyle>;
  /** The tap sound; null for none (a sound that follows anyway, like a star, plays its own). */
  sound?: SoundName | null;
  haptic?: boolean;
  children?: React.ReactNode;
};

/**
 * The one press behaviour: a squish, a light haptic tick, the tap sound. Wrap covers, entry cards,
 * stars, crayons, the wand: anything pressable that is not a RoundButton (which squishes itself).
 */
export function Squishy({ style, pressableStyle, sound = 'tap', haptic = true, onPress, onPressIn, onPressOut, children, ...rest }: Props) {
  const squish = useSquish();
  return (
    <Pressable
      {...rest}
      style={pressableStyle}
      onPressIn={(e) => {
        squish.onPressIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        squish.onPressOut();
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        if (sound) play(sound);
        onPress?.(e);
      }}>
      <Animated.View style={[style, squish.style]}>{children}</Animated.View>
    </Pressable>
  );
}
