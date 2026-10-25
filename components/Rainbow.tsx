import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { rainbow } from '@/lib/theme';

/** A soft pastel rainbow band, built from stripes so it needs no gradient library. */
export function RainbowBar({ height = 6, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.row, { height, borderRadius: height / 2 }, style]}>
      {rainbow.map((c) => (
        <View key={c} style={{ flex: 1, backgroundColor: c }} />
      ))}
    </View>
  );
}

/** Placeholder cover: a rainbow wash picked from the book id so each book keeps its own colour. */
export function RainbowFill({ seed, style }: { seed: string; style?: StyleProp<ViewStyle> }) {
  const n = seed.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const a = rainbow[n % rainbow.length];
  const b = rainbow[(n + 2) % rainbow.length];
  return (
    <View style={[styles.fill, style]}>
      <View style={{ flex: 1, backgroundColor: a }} />
      <View style={{ flex: 1, backgroundColor: b }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', overflow: 'hidden' },
  fill: { overflow: 'hidden', flexDirection: 'column' },
});
