import { useMachine } from '@xstate/react';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrawingOverlay } from '@/components/DrawingOverlay';
import { EntryCard } from '@/components/EntryCard';
import { RainbowFill, RainbowRing } from '@/components/Rainbow';
import { RecorderOverlay } from '@/components/RecorderOverlay';
import { RoundButton } from '@/components/RoundButton';
import { Squishy } from '@/components/Squishy';
import { StarRating } from '@/components/StarRating';
import { UNICORN } from '@/components/Unicorn';
import { WriterOverlay } from '@/components/WriterOverlay';
import { bookMachine } from '@/lib/machines/book';
import { inspect } from '@/lib/machines/inspect';
import { useMediaUri } from '@/lib/media';
import { swishIn } from '@/lib/motion';
import { useScreen } from '@/lib/screen';
import { selectBook, selectComplete, selectEntries, useStore } from '@/lib/store';
import { pullEntries } from '@/lib/sync';
import { warn } from '@/lib/telemetry';
import { colors, fonts, radius } from '@/lib/theme';

const COVER_W = 120;
const COVER_H = 150;

export default function BookPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const book = useStore(selectBook(id));
  const entries = useStore(selectEntries(id));
  const complete = useStore(selectComplete(id));
  const cover = useMediaUri('covers', book?.cover_path ?? null);
  const [state, send] = useMachine(bookMachine, { input: { bookId: id ?? '' }, inspect });
  const { writePrompt, speakPrompt, drawPrompt } = state.context;
  const recording = state.matches('recording');
  const writing = state.matches('writing');
  const drawing = state.matches('drawing');
  const drawingCover = state.matches('drawingCover');
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
            <Squishy
              style={styles.coverWrap}
              disabled={!!book.cover_path}
              onPress={() => send({ type: 'DRAW_COVER' })}
              accessibilityRole="button"
              accessibilityLabel="Rita omslaget">
              {complete && <RainbowRing width={COVER_W} height={COVER_H} radius={radius.md} />}
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
            </Squishy>
            <View style={styles.titleBlock}>
              <Text style={styles.title}>{book.title}</Text>
              {!!book.author && <Text style={styles.author}>{book.author}</Text>}
            </View>
          </View>
          <StarRating value={book.rating} onChange={(n) => send({ type: 'RATE', rating: n })} size={52} />
          <View style={styles.actions}>
            <RoundButton icon="mic" size={74} label="Berätta" onPress={() => send({ type: 'START_RECORDING' })} />
            <RoundButton icon="pencil" size={74} color={colors.pink} label="Skriv" onPress={() => send({ type: 'START_WRITING' })} />
            <RoundButton icon="camera" size={74} color={colors.pink} label="Fota" onPress={() => send({ type: 'TAKE_PHOTO' })} />
            <RoundButton icon="brush" size={74} color={colors.pink} label="Rita" onPress={() => send({ type: 'START_DRAWING' })} />
          </View>
        </View>
      ) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book, cover, complete],
  );

  if (!book || !id) {
    warn('book.missing', { id });
    return <View style={styles.root} />;
  }

  return (
    <Animated.View entering={swishIn()} style={styles.root}>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + UNICORN.padding,
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
        sound={null}
        style={[styles.back, { top: insets.top + 8 }]}
      />

      <RecorderOverlay
        bookId={id}
        visible={recording}
        onDone={(uri, durationMs) => send({ type: 'RECORDING_DONE', uri, durationMs })}
        onUnavailable={() => send({ type: 'RECORDING_UNAVAILABLE' })}
        onSkip={() => send({ type: 'RECORDING_SKIPPED' })}
        prompt={speakPrompt}
        onReroll={() => send({ type: 'REROLL_PROMPT', pool: 'speak' })}
      />

      <DrawingOverlay
        visible={drawing || drawingCover}
        prompt={drawing ? drawPrompt : null}
        onReroll={() => send({ type: 'REROLL_PROMPT', pool: 'draw' })}
        onDone={(uri) => send(drawingCover ? { type: 'COVER_DONE', uri } : { type: 'DRAWING_DONE', uri })}
      />

      <WriterOverlay
        bookId={id}
        visible={writing}
        prompt={writePrompt}
        onReroll={() => send({ type: 'REROLL_PROMPT', pool: 'write' })}
        onDone={() => send({ type: 'WRITING_DONE' })}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { gap: 22, paddingTop: 52, paddingBottom: 10 },
  coverRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-end' },
  coverWrap: { width: COVER_W, height: COVER_H },
  cover: {
    width: COVER_W,
    height: COVER_H,
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
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingVertical: 4 },
  back: { position: 'absolute', left: 20 },
});
