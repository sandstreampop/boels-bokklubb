import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoundButton } from '@/components/RoundButton';
import { StatTiles } from '@/components/StatTiles';
import { startShare } from '@/lib/machines/share';
import { useScreen } from '@/lib/screen';
import { selectStats, useStore } from '@/lib/store';
import { colors } from '@/lib/theme';

/** Totals only, no time axis. A long-press anywhere shares the tiles as a card. */
export default function StatsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const stats = useStore(selectStats);
  useScreen('stats');

  const share = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    startShare({ kind: 'stats' });
  };

  return (
    <Pressable style={styles.root} onLongPress={share} delayLongPress={450} accessibilityLabel="Håll för att dela">
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 40 }]}>
        <Pressable onLongPress={share} delayLongPress={450}>
          <StatTiles stats={stats} />
        </Pressable>
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20 },
  back: { position: 'absolute', left: 20 },
});
