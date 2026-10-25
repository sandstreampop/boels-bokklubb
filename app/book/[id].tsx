import { useMachine } from '@xstate/react';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EntryCard } from '@/components/EntryCard';
import { RainbowFill } from '@/components/Rainbow';
import { RecorderOverlay } from '@/components/RecorderOverlay';
import { RoundButton } from '@/components/RoundButton';
import { StarRating } from '@/components/StarRating';
import { WriterOverlay } from '@/components/WriterOverlay';
import { bookMachine } from '@/lib/machines/book';
import { inspect } from '@/lib/machines/inspect';
import { useMediaUri } from '@/lib/media';
import { useScreen } from '@/lib/screen';
import { selectBook, selectEntries, useStore } from '@/lib/store';
import { pullEntries } from '@/lib/sync';
import { warn } from '@/lib/telemetry';
import { colors, fonts, radius } from '@/lib/theme';

export default function BookPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const book = useStore(selectBook(id));
  const entries = useStore(selectEntries(id));
  const cover = useMediaUri('covers', book?.cover_path ?? null);
  const [state, send] = useMachine(bookMachine, { input: { bookId: id ?? '' }, inspect });
  const { writePrompt, speakPrompt } = state.context;
  const recording = state.matches('recording');
  const writing = state.matches('writing');
  const photoSheet = state.matches('choosingPhoto');
  useScreen('book', { id, found: !!book });

  useFocusEffect(
    useCallback(() => {
      if (id) void pullEntries(id);
    }, [id]),
  );

  const header = useMemo(
    () =>
      book ? (
        <View style={styles.header}>
          <View style={styles.coverRow}>
            <View style={styles.cover}>
              {cover ? (
                <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
              ) : (
                <>
                  <RainbowFill seed={book.id} style={StyleSheet.absoluteFill} />
                  <Text style={styles.initial}>{book.title.trim().charAt(0).toUpperCase()}</Text>
                </>
              )}
            </View>
            <View style={styles.titleBlock}>
              <Text style={styles.title}>{book.title}</Text>
              {!!book.author && <Text style={styles.author}>{book.author}</Text>}
            </View>
          </View>
          <StarRating value={book.rating} onChange={(n) => send({ type: 'RATE', rating: n })} size={52} />
          <View style={styles.actions}>
            <RoundButton icon="mic" size={84} label="Berätta" onPress={() => send({ type: 'START_RECORDING' })} />
            <RoundButton icon="pencil" size={84} color={colors.pink} label="Skriv" onPress={() => send({ type: 'START_WRITING' })} />
            <RoundButton icon="camera" size={84} color={colors.pink} label="Fota" onPress={() => send({ type: 'OPEN_PHOTOS' })} />
          </View>
        </View>
      ) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book, cover],
  );

  if (!book || !id) {
    warn('book.missing', { id });
    return <View style={styles.root} />;
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 20,
          gap: 14,
        }}
        ListHeaderComponent={header ?? undefined}
        renderItem={({ item }) => <EntryCard entry={item} />}
      />
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

      <RecorderOverlay
        bookId={id}
        visible={recording}
        onDone={(uri, durationMs) => send({ type: 'RECORDING_DONE', uri, durationMs })}
        onUnavailable={() => send({ type: 'RECORDING_UNAVAILABLE' })}
        prompt={speakPrompt}
        onReroll={() => send({ type: 'REROLL_PROMPT', pool: 'speak' })}
      />

      <WriterOverlay
        bookId={id}
        visible={writing}
        prompt={writePrompt}
        onReroll={() => send({ type: 'REROLL_PROMPT', pool: 'write' })}
        onDone={() => send({ type: 'WRITING_DONE' })}
      />

      {photoSheet && (
        <Pressable style={styles.sheetBackdrop} onPress={() => send({ type: 'CLOSE_PHOTOS' })} accessibilityLabel="Stäng">
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <RoundButton icon="camera" size={92} label="Kamera" onPress={() => send({ type: 'PICK', source: 'camera' })} />
            <RoundButton icon="photo" size={92} color={colors.pink} label="Bilder" onPress={() => send({ type: 'PICK', source: 'library' })} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { gap: 22, paddingTop: 52, paddingBottom: 10 },
  coverRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-end' },
  cover: {
    width: 120,
    height: 150,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.pinkSoft,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E9679B',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  initial: { fontFamily: fonts.display, fontSize: 56, color: 'rgba(255,255,255,0.9)' },
  titleBlock: { flex: 1, minWidth: 0, gap: 4, paddingBottom: 6 },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.text },
  author: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.muted },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 22, paddingVertical: 4 },
  back: { position: 'absolute', left: 20 },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(58,36,48,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 32,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
  },
});
