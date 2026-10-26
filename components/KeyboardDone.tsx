import { InputAccessoryView, Platform, StyleSheet, View } from 'react-native';

import { RoundButton } from './RoundButton';
import type { IconName } from './Icon';
import { colors } from '@/lib/theme';

/**
 * The one button on top of the keyboard, wherever she types: a pastel bar glued to the keys with
 * a single round button in the middle, the same shape as every other button in the app. It rises
 * and falls with the keyboard, so "where do I press when I am done" is always the same place.
 * iOS only (InputAccessoryView); elsewhere the page's own button stays. A screen renders one of
 * these and gives its text fields `inputAccessoryViewID={id}`. Decided with Viktor 2026-10-26.
 */
export function KeyboardDone({
  id,
  icon,
  label,
  onPress,
  disabled,
}: {
  id: string;
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={id} backgroundColor={colors.pinkSoft}>
      <View style={styles.bar}>
        <RoundButton icon={icon} size={60} label={label} onPress={onPress} disabled={disabled} />
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
});
