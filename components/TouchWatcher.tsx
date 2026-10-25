import { StyleSheet, View } from 'react-native';

import { unicornTouched } from '@/lib/machines/unicorn';

/**
 * Wraps the whole app once (around the Stack in app/_layout.tsx). Sees every touch start without
 * claiming it, so the unicorn's idle timer resets whenever she touches anything.
 */
export function TouchWatcher({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={styles.fill}
      onStartShouldSetResponderCapture={() => {
        unicornTouched();
        return false;
      }}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
