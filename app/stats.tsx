import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoundButton } from '@/components/RoundButton';
import { StatTiles } from '@/components/StatTiles';
import { startShare } from '@/lib/machines/share';
import { useScreen } from '@/lib/screen';
import { selectStats, useStore } from '@/lib/store';
import { colors } from '@/lib/theme';

/** Totals only, no time axis. The share button top right previews the tiles as a card. */
export default function StatsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const stats = useStore(selectStats);
  useScreen('stats');

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 40 }]}>
        <StatTiles stats={stats} />
      </ScrollView>
      <RoundButton
        icon="back"
        size={44}
        color={colors.pinkSoft}
        iconColor={colors.text}
        label="Tillbaka"
        onPress={() => router.back()}
        haptic={false}
        style={[styles.back, { top: insets.top + 8 }]}
      />
      <RoundButton
        icon="share"
        size={44}
        color={colors.pinkSoft}
        iconColor={colors.pinkDeep}
        label="Dela"
        onPress={() => startShare({ kind: 'stats' })}
        style={[styles.share, { top: insets.top + 8 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20 },
  back: { position: 'absolute', left: 20 },
  share: { position: 'absolute', right: 20 },
});
