import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from './Icon';
import { RainbowRing } from './Rainbow';
import type { Stats } from '@/lib/store';
import { colors, fonts, radius } from '@/lib/theme';

/** Six tiles with an icon and a number, no labels. Rainbow books is the big one. Used by the stats screen and its share card. */
export function StatTiles({ stats, scale = 1 }: { stats: Stats; scale?: number }) {
  return (
    <View style={[styles.tiles, { gap: 14 * scale }]}>
      <Tile big value={stats.rainbow} label="Regnbågsböcker" scale={scale}>
        <View style={{ width: 64 * scale, height: 64 * scale, alignItems: 'center', justifyContent: 'center' }}>
          <RainbowRing width={64 * scale} height={64 * scale} radius={32 * scale} stroke={5 * scale} />
          <Icon name="book" size={30 * scale} color={colors.pinkDeep} />
        </View>
      </Tile>
      <Tile icon="book" value={stats.books} label="Böcker" scale={scale} />
      <Tile icon="mic" value={stats.audio} label="Röster" scale={scale} />
      <Tile icon="pencil" value={stats.text} label="Tankar" scale={scale} />
      <Tile icon="camera" value={stats.photo} label="Foton" scale={scale} />
      <Tile icon="crayon" value={stats.drawing} label="Teckningar" scale={scale} />
    </View>
  );
}

function Tile({
  icon,
  value,
  label,
  big,
  scale,
  children,
}: {
  icon?: IconName;
  value: number;
  label: string;
  big?: boolean;
  scale: number;
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.tile, big && styles.tileBig, { borderRadius: radius.lg * scale, gap: 8 * scale }]} accessibilityLabel={`${value} ${label}`}>
      {children ?? (icon && <Icon name={icon} size={(big ? 44 : 34) * scale} color={colors.pinkDeep} strokeWidth={2.2} />)}
      <Text style={[styles.number, { fontSize: (big ? 84 : 48) * scale, lineHeight: (big ? 92 : 54) * scale }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: {
    width: '47%',
    flexGrow: 1,
    aspectRatio: 1.15,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E9679B',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  tileBig: { width: '100%', aspectRatio: 1.6 },
  number: { fontFamily: fonts.display, color: colors.text, fontVariant: ['tabular-nums'] },
});
