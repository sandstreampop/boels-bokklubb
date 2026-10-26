import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { IconName } from './Icon';
import { RoundButton } from './RoundButton';
import { UNICORN } from './Unicorn';
import { colors } from '@/lib/theme';

/**
 * The one button at the bottom of a screen she types on: a full-width pastel bar with a single
 * round button in the middle, the same shape as every other button in the app. Rendered as the
 * last child of the screen's KeyboardAvoidingView, so the keyboard pushes it up and it sits right
 * on top of the keys while she types, and it rests at the bottom edge when the keyboard is down.
 * "Where do I press when I am done" is always the same place. An optional `left` slot holds the
 * unicorn, balanced by an empty slot on the right so the button stays centred.
 *
 * Not React Native's InputAccessoryView: on 2026-10-26 (update 01a17979) that rendered nothing in
 * the writer's Modal and a stray strip at the top of the wizard under the new architecture.
 */
export function DoneBar({
  icon,
  label,
  onPress,
  disabled,
  left,
  bottomInset = 0,
  contentStyle,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  left?: React.ReactNode;
  /** The safe-area bottom; the bar pads at least a little beneath the button. */
  bottomInset?: number;
  /** Caps the row on a tablet (lib/layout.ts maxContent); the bar itself stays full width. */
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(bottomInset, 10) }]}>
      <View style={[styles.row, contentStyle]}>
        <View style={styles.side}>{left}</View>
        <RoundButton icon={icon} size={64} label={label} onPress={onPress} disabled={disabled} />
        <View style={styles.side} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { width: '100%', backgroundColor: colors.pinkSoft, paddingTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  side: { width: UNICORN.size, alignItems: 'flex-start', justifyContent: 'center' },
});
