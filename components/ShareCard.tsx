import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef, type CaptureOptions } from 'react-native-view-shot';

import { Icon } from './Icon';
import { RainbowBar, RainbowFill } from './Rainbow';
import { StatTiles } from './StatTiles';
import { features } from '@/lib/features';
import { formatDate } from '@/lib/format';
import { useMediaUri } from '@/lib/media';
import type { ShareTarget } from '@/lib/machines/share';
import { isFillIn, splitFillIn } from '@/lib/prompts';
import { selectBook, selectEntries, selectStats, useStore } from '@/lib/store';
import { colors, fonts, radius } from '@/lib/theme';
import type { Entry } from '@/lib/types';

// 540 x 675 pt, captured at the screen scale: 1620 x 2025 px on a 3x phone, 4:5, what Messenger shows fully.
const W = 540;
const H = 675;
const PAD = 36;
const STAR = 'M12 2.5l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.3l-6 3.3 1.3-6.6L2.4 9.4l6.7-.8L12 2.5z';

type Props = { target: ShareTarget; onReady: (capture: () => Promise<string>) => void };

/**
 * The card behind every share, rendered off screen and never shown: no chrome, no pending dots,
 * no buttons. Calls onReady once its images have loaded (or after a moment if one never does).
 */
export function ShareCard({ target, onReady }: Props) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [imagesLeft, setImagesLeft] = useState(target.kind === 'entry' ? 2 : 0);
  const [laidOut, setLaidOut] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !laidOut) return;
    const fire = () => {
      if (fired.current) return;
      fired.current = true;
      // The card sits outside the window, so draw its layers directly instead of snapshotting the
      // screen. No width/height here: the layer renderer does not scale into a requested size (the
      // card would land in a corner), so the image is the card's own size times the screen scale.
      const options = { format: 'png', quality: 1, result: 'tmpfile', useRenderInContext: true } as CaptureOptions;
      onReady(() => captureRef(ref, options));
    };
    // One frame after the last image reported in, so the bitmap is on screen before the capture.
    const t = setTimeout(fire, imagesLeft === 0 ? 80 : 1500);
    return () => clearTimeout(t);
  }, [imagesLeft, laidOut, onReady]);

  const imageDone = () => setImagesLeft((n) => Math.max(0, n - 1));

  return (
    <View ref={ref} collapsable={false} onLayout={() => setLaidOut(true)} style={styles.card}>
      {target.kind === 'entry' ? <EntryBody target={target} onImage={imageDone} /> : <StatsBody />}
      <RainbowBar height={14} style={styles.bar} />
    </View>
  );
}

function EntryBody({ target, onImage }: { target: { entryId: string; bookId: string }; onImage: () => void }) {
  const book = useStore(selectBook(target.bookId));
  const entry = useStore(selectEntries(target.bookId)).find((e) => e.id === target.entryId);
  const cover = useMediaUri('covers', book?.cover_path ?? null);
  const media = useMediaUri('media', entry && (entry.kind === 'photo' || entry.kind === 'drawing') ? entry.media_path : null);
  const picture = !!entry && (entry.kind === 'photo' || entry.kind === 'drawing');

  // Each image slot reports in once: when it has loaded, or at once when there is nothing to load.
  const coverPending = !!book?.cover_path;
  const mediaPending = picture && !!entry.media_path;
  useEffect(() => {
    if (!coverPending) onImage();
    if (!mediaPending) onImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!book || !entry) return null;
  return (
    <>
      <View style={styles.head}>
        <View style={styles.cover}>
          {cover ? (
            <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" onLoad={onImage} onError={onImage} />
          ) : (
            <>
              <RainbowFill seed={book.id} style={StyleSheet.absoluteFill} />
              <Text style={styles.initial}>{book.title.trim().charAt(0).toUpperCase()}</Text>
            </>
          )}
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={3}>
            {book.title}
          </Text>
          {!!book.rating && <Stars n={book.rating} />}
        </View>
      </View>

      {picture ? (
        <View style={[styles.picture, entry.kind === 'drawing' && styles.drawing]}>
          {!!entry.prompt && <Text style={[styles.prompt, styles.pictureCaption]}>{entry.prompt}</Text>}
          {media ? (
            <Image
              source={{ uri: media }}
              style={styles.pictureImage}
              contentFit={entry.kind === 'drawing' ? 'contain' : 'cover'}
              onLoad={onImage}
              onError={onImage}
            />
          ) : (
            <View style={styles.pictureImage} />
          )}
        </View>
      ) : (
        <Words entry={entry} />
      )}

      <Text style={styles.date}>{formatDate(entry.created_at)}</Text>
    </>
  );
}

/** Her words in display type, verbatim; a fill-in prompt wraps around them, any other sits above. */
function Words({ entry }: { entry: Entry }) {
  // A recording's words are its transcript, when transcription is on (lib/features.ts); else the mic alone.
  const words = entry.kind === 'audio' ? (features.transcription ? entry.transcript : null) : entry.text;
  const fill = isFillIn(entry.prompt) ? splitFillIn(entry.prompt) : null;
  return (
    <View style={styles.words}>
      {!fill && !!entry.prompt && <Text style={styles.prompt}>{entry.prompt}</Text>}
      {entry.kind === 'audio' && (
        <View style={styles.micRow}>
          <Icon name="mic" size={28} color={colors.pinkDeep} />
        </View>
      )}
      {(fill || words) && (
        <Text style={styles.text} numberOfLines={9}>
          {fill && <Text style={styles.promptInline}>{fill.before}</Text>}
          {words ?? ''}
          {fill && <Text style={styles.promptInline}>{fill.after}</Text>}
        </Text>
      )}
    </View>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <View style={styles.stars}>
      {Array.from({ length: n }).map((_, i) => (
        <Svg key={i} width={34} height={34} viewBox="0 0 24 24">
          <Path d={STAR} fill={colors.gold} stroke="#F0A500" strokeWidth={1.2} strokeLinejoin="round" />
        </Svg>
      ))}
    </View>
  );
}

function StatsBody() {
  const stats = useStore(selectStats);
  return (
    <>
      <Text style={styles.appTitle}>Boels bokklubb</Text>
      <View style={styles.tiles}>
        <StatTiles stats={stats} scale={0.9} />
      </View>
      <Text style={styles.date}>{formatDate(new Date().toISOString())}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  card: { width: W, height: H, backgroundColor: colors.bg, padding: PAD, paddingBottom: PAD + 14, gap: 22, overflow: 'hidden' },
  head: { flexDirection: 'row', gap: 22, alignItems: 'flex-end' },
  cover: { width: 120, height: 150, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.pinkSoft, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: fonts.display, fontSize: 56, color: 'rgba(255,255,255,0.9)' },
  titleBlock: { flex: 1, gap: 8, paddingBottom: 6 },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, color: colors.text },
  stars: { flexDirection: 'row', gap: 2 },
  words: { flex: 1, gap: 12 },
  prompt: { fontFamily: fonts.bodySemi, fontSize: 20, lineHeight: 26, color: colors.muted },
  promptInline: { color: colors.muted },
  micRow: { flexDirection: 'row' },
  text: { fontFamily: fonts.display, fontSize: 30, lineHeight: 38, color: colors.text },
  picture: { flex: 1, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.pinkSoft },
  drawing: { backgroundColor: colors.white },
  pictureCaption: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, backgroundColor: 'transparent' },
  pictureImage: { flex: 1 },
  date: { fontFamily: fonts.bodySemi, fontSize: 18, color: colors.muted },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderRadius: 0 },
  appTitle: { fontFamily: fonts.display, fontSize: 44, lineHeight: 50, color: colors.text },
  tiles: { flex: 1, justifyContent: 'center' },
});
