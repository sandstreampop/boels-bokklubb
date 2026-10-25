import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { unicornTouched } from '@/lib/machines/unicorn';

/**
 * Wraps the whole app once (around the Stack in app/_layout.tsx), and each full-screen Modal,
 * which is its own window. Sees every touch start without claiming it, so the unicorn's idle
 * timer resets whenever she touches anything.
 */
export function TouchWatcher({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[styles.fill, style]}
      onStartShouldSetResponderCapture={() => {
        unicornTouched();
        return false;
      }}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
