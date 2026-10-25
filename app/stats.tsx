import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { RainbowRing } from '@/components/Rainbow';
import { RoundButton } from '@/components/RoundButton';
import { useScreen } from '@/lib/screen';
import { selectStats, useStore } from '@/lib/store';
import { colors, fonts, radius } from '@/lib/theme';

/** Totals only, no time axis: six tiles with an icon and a number. Rainbow books is the big one. */
export default function StatsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const stats = useStore(selectStats);
  useScreen('stats');

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 40 }]}>
        <View style={styles.tiles}>
          <Tile big value={stats.rainbow} label="Regnbågsböcker">
            <View style={styles.ringIcon}>
              <RainbowRing width={64} height={64} radius={32} stroke={5} />
              <Icon name="book" size={30} color={colors.pinkDeep} />
            </View>
          </Tile>
          <Tile icon="book" value={stats.books} label="Böcker" />
          <Tile icon="mic" value={stats.audio} label="Röster" />
          <Tile icon="pencil" value={stats.text} label="Tankar" />
          <Tile icon="camera" value={stats.photo} label="Foton" />
          <Tile icon="crayon" value={stats.drawing} label="Teckningar" />
        </View>
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
    </View>
  );
}

function Tile({ icon, value, label, big, children }: { icon?: IconName; value: number; label: string; big?: boolean; children?: React.ReactNode }) {
  return (
    <View style={[styles.tile, big && styles.tileBig]} accessibilityLabel={`${value} ${label}`}>
      {children ?? (icon && <Icon name={icon} size={big ? 44 : 34} color={colors.pinkDeep} strokeWidth={2.2} />)}
      <Text style={[styles.number, big && styles.numberBig]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  tile: {
    width: '47%',
    flexGrow: 1,
    aspectRatio: 1.15,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#E9679B',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  tileBig: { width: '100%', aspectRatio: 1.6 },
  ringIcon: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  number: { fontFamily: fonts.display, fontSize: 48, lineHeight: 54, color: colors.text, fontVariant: ['tabular-nums'] },
  numberBig: { fontSize: 84, lineHeight: 92 },
  back: { position: 'absolute', left: 20 },
});
