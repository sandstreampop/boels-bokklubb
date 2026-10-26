import { useMachine } from '@xstate/react';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrawingOverlay } from '@/components/DrawingOverlay';
import { EntryCard } from '@/components/EntryCard';
import { RainbowFill, RainbowRing } from '@/components/Rainbow';
import { RainbowCelebration } from '@/components/RainbowCelebration';
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
import { celebrated, selectBook, selectCelebrate, selectComplete, selectEntries, useStore } from '@/lib/store';
import { pullEntries } from '@/lib/sync';
import { warn } from '@/lib/telemetry';
import { colors, fonts, radius } from '@/lib/theme';
import { useLayout } from '@/lib/useLayout';

const COVER_W = 120;
const COVER_H = 150;

/**
 * The book page: the cover, title, stars and the four buttons above the stream of entries. On the
 * phone the header is the list's header, as always. On a tablet (lib/layout.ts) the stream sits
 * in a centred column, and a wide landscape puts the header in a column of its own on the left
 * with the stream beside it. The same header element in every case.
 */
export default function BookPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const layout = useLayout();
  const book = useStore(selectBook(id));
  const entries = useStore(selectEntries(id));
  const complete = useStore(selectComplete(id));
  const celebrate = useStore(selectCelebrate(id));
  const cover = useMediaUri('covers', book?.cover_path ?? null);
  const [state, send] = useMachine(bookMachine, { input: { bookId: id ?? '' }, inspect });
  const recording = state.matches('recording');
  const writing = state.matches('writing');
  const drawing = state.matches('drawing');
  const drawingCover = state.matches('drawingCover');
  const twoPane = layout.twoPane;
  useScreen('book', { id, found: !!book });

  useFocusEffect(
    useCallback(() => {
      if (id) void pullEntries(id);
    }, [id]),
  );

  // Set piece 3: the book just went rainbow. The sweep starts at the centre of the cover, measured
  // in the window (the page fills it), with the cover's resting place as the fallback.
  const coverRef = useRef<ComponentRef<typeof View>>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!celebrate) return;
    const fallback = { x: 20 + COVER_W / 2, y: insets.top + 8 + 52 + COVER_H / 2 };
    const node = coverRef.current;
    if (!node) {
      setOrigin(fallback);
      return;
    }
    node.measureInWindow((x, y, w, h) => setOrigin(w > 0 && h > 0 ? { x: x + w / 2, y: y + h / 2 } : fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrate]);

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
              {complete && <RainbowRing width={COVER_W} height={COVER_H} radius={radius.md} draw={celebrate} />}
              <View ref={coverRef} collapsable={false} style={styles.cover}>
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
            {/* In its own pane the title is far from the unicorn and needs no clearance. */}
            <View style={[styles.titleBlock, twoPane && styles.titleBlockPane]}>
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
    [book, cover, complete, celebrate, twoPane],
  );

  if (!book || !id) {
    warn('book.missing', { id });
    return <View style={styles.root} />;
  }

  const stream = { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 14 };

  return (
    <Animated.View entering={swishIn()} style={styles.root}>
      {twoPane ? (
        <View style={styles.panes}>
          <ScrollView style={{ width: layout.paneWidth }} contentContainerStyle={stream}>
            {header}
          </ScrollView>
          <FlatList
            style={styles.pane}
            data={entries}
            keyExtractor={(e) => e.id}
            contentContainerStyle={[stream, { width: '100%', maxWidth: layout.maxContent }]}
            renderItem={({ item }) => <EntryCard entry={item} />}
          />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={[stream, layout.compact ? null : { width: '100%', maxWidth: layout.maxContent, alignSelf: 'center' }]}
          ListHeaderComponent={header ?? undefined}
          renderItem={({ item }) => <EntryCard entry={item} />}
        />
      )}
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

      {/* Each mode owns its question and hands it back inside its answer (docs/PRD-build-9.md §1). */}
      <RecorderOverlay
        bookId={id}
        visible={recording}
        onDone={(answer) => send({ type: 'RECORDING_DONE', ...answer })}
        onUnavailable={() => send({ type: 'RECORDING_UNAVAILABLE' })}
        onSkip={() => send({ type: 'RECORDING_SKIPPED' })}
      />

      <DrawingOverlay visible={drawing || drawingCover} cover={drawingCover} onDone={(answer) => send({ type: 'DRAWING_DONE', ...answer })} />

      <WriterOverlay bookId={id} visible={writing} onDone={(answer) => send({ type: 'WRITING_DONE', ...answer })} />

      {origin && (
        <RainbowCelebration
          origin={origin}
          onDone={() => {
            setOrigin(null);
            celebrated();
          }}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  panes: { flex: 1, flexDirection: 'row' },
  pane: { flex: 1 },
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
  // The unicorn sits top right; a tall title stops short of her.
  titleBlock: { flex: 1, minWidth: 0, gap: 4, paddingBottom: 6, paddingRight: UNICORN.clearance - 20 },
  titleBlockPane: { paddingRight: 0 },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.text },
  author: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.muted },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingVertical: 4 },
  back: { position: 'absolute', left: 20 },
});
