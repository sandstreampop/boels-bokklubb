import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { RainbowFill, RainbowRing } from './Rainbow';
import { Squishy } from './Squishy';
import { useMediaUri } from '@/lib/media';
import { selectComplete, useStore } from '@/lib/store';
import { colors, fonts, radius } from '@/lib/theme';
import type { Book } from '@/lib/types';

const STAR = 'M12 2.5l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.3l-6 3.3 1.3-6.6L2.4 9.4l6.7-.8L12 2.5z';

export function BookCard({ book, onPress, width }: { book: Book; onPress: () => void; width: number }) {
  const cover = useMediaUri('covers', book.cover_path);
  const complete = useStore(selectComplete(book.id));
  const h = Math.round(width * 1.25);
  return (
    <Squishy onPress={onPress} accessibilityRole="button" accessibilityLabel={book.title} style={{ width }}>
      {complete && <RainbowRing width={width} height={h} radius={radius.lg} />}
      <View style={[styles.cover, { width, height: h }]}>
        {cover ? (
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <>
            <RainbowFill seed={book.id} style={StyleSheet.absoluteFill} />
            <Text style={styles.initial}>{book.title.trim().charAt(0).toUpperCase()}</Text>
          </>
        )}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {book.title}
      </Text>
      {!!book.rating && (
        <View style={styles.stars}>
          {Array.from({ length: book.rating }).map((_, i) => (
            <Svg key={i} width={14} height={14} viewBox="0 0 24 24">
              <Path d={STAR} fill={colors.gold} />
            </Svg>
          ))}
        </View>
      )}
    </Squishy>
  );
}

const styles = StyleSheet.create({
  cover: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.pinkSoft,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E9679B',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  initial: { fontFamily: fonts.display, fontSize: 64, color: 'rgba(255,255,255,0.9)' },
  title: { fontFamily: fonts.displaySemi, fontSize: 17, color: colors.text, marginTop: 10, lineHeight: 21 },
  stars: { flexDirection: 'row', gap: 1, marginTop: 4 },
});
