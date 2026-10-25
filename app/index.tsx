import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookCard } from '@/components/BookCard';
import { RainbowBar, RainbowRing } from '@/components/Rainbow';
import { RoundButton } from '@/components/RoundButton';
import { useScreen } from '@/lib/screen';
import { selectCompleteCount, useStore } from '@/lib/store';
import { pullAllEntries, pullBooks } from '@/lib/sync';
import { colors, fonts } from '@/lib/theme';

const GUTTER = 20;
const GAP = 18;

export default function Library() {
  const books = useStore((s) => s.books);
  const rainbowCount = useStore(selectCompleteCount);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [refreshing, setRefreshing] = useState(false);
  const cardWidth = Math.floor((Math.min(width, 700) - GUTTER * 2 - GAP) / 2);
  useScreen('library', { books: books.length });

  useFocusEffect(
    useCallback(() => {
      void pullBooks().then(pullAllEntries);
    }, []),
  );

  const refresh = async () => {
    setRefreshing(true);
    await pullBooks();
    await pullAllEntries();
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <FlatList
        data={books}
        keyExtractor={(b) => b.id}
        numColumns={2}
        columnWrapperStyle={{ gap: GAP, paddingHorizontal: GUTTER }}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 120, gap: 26 }}
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable onPress={() => router.push('/stats')} accessibilityRole="button" accessibilityLabel="Statistik" style={styles.titleRow}>
              <Text style={styles.title}>Boels bokklubb</Text>
              {rainbowCount > 0 && (
                <View style={styles.count}>
                  <RainbowRing width={44} height={44} radius={22} stroke={3} />
                  <Text style={styles.countText}>{rainbowCount}</Text>
                </View>
              )}
            </Pressable>
            <RainbowBar style={{ width: 120, marginTop: 6 }} />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <RainbowBar height={10} style={{ width: 200, opacity: 0.6 }} />
          </View>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.pinkDeep} />}
        renderItem={({ item }) => (
          <BookCard
            book={item}
            width={cardWidth}
            onPress={() => router.push({ pathname: '/book/[id]', params: { id: item.id } })}
          />
        )}
      />
      <RoundButton
        icon="plus"
        size={76}
        label="Ny bok"
        onPress={() => router.push('/book/new')}
        style={[styles.fab, { bottom: insets.bottom + 22 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: GUTTER, paddingBottom: 6, alignItems: 'flex-start' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { fontFamily: fonts.display, fontSize: 38, color: colors.text, lineHeight: 44 },
  count: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  empty: { alignItems: 'center', paddingTop: 80 },
  fab: { position: 'absolute', right: 24 },
});
