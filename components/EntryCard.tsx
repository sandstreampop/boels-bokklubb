import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { Icon } from './Icon';
import { SparkBurst } from './SparkBurst';
import { Squishy } from './Squishy';
import { formatDate, formatDuration } from '@/lib/format';
import { useMediaUri } from '@/lib/media';
import { startShare } from '@/lib/machines/share';
import { unicornMoment } from '@/lib/machines/unicorn';
import { durations, springs } from '@/lib/motion';
import { isFillIn, splitFillIn } from '@/lib/prompts';
import { effectsAudioMode, play, voiceAudioMode } from '@/lib/sounds';
import { takeFresh } from '@/lib/store';
import { captureError, debug } from '@/lib/telemetry';
import { colors, fonts, radius } from '@/lib/theme';
import type { Entry } from '@/lib/types';

export function EntryCard({ entry }: { entry: Entry }) {
  // Taken once, on first render: a fresh entry is set piece 2. The card springs in with sparks at
  // its corner, the save chime plays, the unicorn hops and trills, and a fresh recording plays.
  const [fresh] = useState(() => takeFresh(entry.id));
  const scale = useSharedValue(fresh ? 0.6 : 1);
  const burst = useSharedValue(0);
  const appear = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  useEffect(() => {
    if (!fresh) return;
    debug('entry.appear', { id: entry.id, kind: entry.kind });
    scale.set(withSpring(1, springs.in));
    burst.set(withTiming(1, { duration: durations.sparkle, easing: Easing.out(Easing.cubic) }));
    play('save');
    unicornMoment('saved');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh]);

  // The share button previews the card before the iOS share sheet opens (see lib/machines/share.ts).
  const share = () => startShare({ kind: 'entry', entryId: entry.id, bookId: entry.book_id });

  return (
    <View>
      <Animated.View style={[styles.card, appear]}>
        {entry.kind !== 'text' && !!entry.prompt && <Text style={styles.prompt}>{entry.prompt}</Text>}
        {entry.kind === 'text' && <TextBody entry={entry} />}
        {(entry.kind === 'photo' || entry.kind === 'drawing') && <PhotoBody entry={entry} />}
        {entry.kind === 'audio' && <AudioBody entry={entry} autoplay={fresh} />}
        <View style={styles.footer}>
          <Text style={styles.date}>{formatDate(entry.created_at)}</Text>
          <View style={styles.footerRight}>
            {entry.pending && <View style={styles.dot} accessibilityLabel="Sparas" />}
            <Squishy onPress={share} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dela" style={styles.shareBtn}>
              <Icon name="share" size={22} color={colors.pinkDeep} />
            </Squishy>
          </View>
        </View>
        {fresh && <SparkBurst burst={burst} radius={60} style={styles.corner} />}
      </Animated.View>
    </View>
  );
}

/** Her words. A fill-in prompt is rendered around them; any other prompt sits above in the muted style. */
function TextBody({ entry }: { entry: Entry }) {
  if (isFillIn(entry.prompt)) {
    const { before, after } = splitFillIn(entry.prompt);
    return (
      <Text style={styles.body}>
        <Text style={styles.promptInline}>{before}</Text>
        {entry.text}
        <Text style={styles.promptInline}>{after}</Text>
      </Text>
    );
  }
  return (
    <>
      {!!entry.prompt && <Text style={styles.prompt}>{entry.prompt}</Text>}
      <Text style={styles.body}>{entry.text}</Text>
    </>
  );
}

function PhotoBody({ entry }: { entry: Entry }) {
  const uri = useMediaUri('media', entry.media_path);
  return (
    <View style={[styles.photo, entry.kind === 'drawing' && styles.drawing]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.pinkSoft }]} />
      )}
    </View>
  );
}

function AudioBody({ entry, autoplay }: { entry: Entry; autoplay: boolean }) {
  const uri = useMediaUri('media', entry.media_path);
  return (
    <View style={{ gap: 10 }}>
      {uri ? (
        <Player uri={uri} durationMs={entry.duration_ms ?? 0} autoplay={autoplay} entryId={entry.id} />
      ) : (
        <PlayerShell durationMs={entry.duration_ms ?? 0} />
      )}
      {entry.transcript ? (
        <Text style={styles.transcript}>{entry.transcript}</Text>
      ) : entry.transcript_status === 'failed' ? null : (
        <View style={styles.transcriptPending}>
          <View style={[styles.pendingBar, { width: '72%' }]} />
          <View style={[styles.pendingBar, { width: '48%' }]} />
        </View>
      )}
    </View>
  );
}

function PlayerShell({ durationMs }: { durationMs: number }) {
  return (
    <View style={styles.player}>
      <View style={[styles.playBtn, { opacity: 0.4 }]}>
        <Icon name="play" size={22} color={colors.white} />
      </View>
      <Bars progress={0} />
      <Text style={styles.time}>{formatDuration(durationMs)}</Text>
    </View>
  );
}

function Player({ uri, durationMs, autoplay, entryId }: { uri: string; durationMs: number; autoplay: boolean; entryId: string }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const total = status.duration > 0 ? status.duration * 1000 : durationMs;
  const progress = total > 0 ? Math.min(1, (status.currentTime * 1000) / total) : 0;
  const playing = status.playing;

  // Her words always play, ring switch or not: the voice mode goes on right before play and the
  // effects mode comes back when she stops or the card goes away (decided, see lib/sounds.ts).
  const voiceMode = useRef(false);
  const playHers = () => {
    voiceMode.current = true;
    setAudioModeAsync(voiceAudioMode)
      .catch((err) => captureError('entry.play.mode', err, { id: entryId }))
      .then(() => player.play());
  };
  const restoreMode = () => {
    if (!voiceMode.current) return;
    voiceMode.current = false;
    setAudioModeAsync(effectsAudioMode).catch((err) => captureError('entry.play.mode', err, { id: entryId }));
  };
  useEffect(() => {
    if (!playing) restoreMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => restoreMode, []);

  // The reward: her voice plays back once, as soon as the file is loaded. At the phone's volume.
  const played = useRef(false);
  useEffect(() => {
    if (!autoplay || played.current || !status.isLoaded) return;
    played.current = true;
    debug('entry.autoplay', { id: entryId, durationMs: total });
    playHers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, status.isLoaded]);

  const toggle = () => {
    if (playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish || (total > 0 && progress >= 0.999)) {
      player.seekTo(0);
    }
    playHers();
  };

  return (
    <View style={styles.player}>
      <Squishy onPress={toggle} style={styles.playBtn} accessibilityRole="button" accessibilityLabel={playing ? 'Pausa' : 'Spela'}>
        <Icon name={playing ? 'pause' : 'play'} size={22} color={colors.white} />
      </Squishy>
      <Bars progress={progress} />
      <Text style={styles.time}>{formatDuration(playing || progress > 0 ? status.currentTime * 1000 : total)}</Text>
    </View>
  );
}

const BAR_HEIGHTS = [10, 16, 22, 14, 26, 18, 12, 24, 16, 20, 10, 18, 26, 14, 22, 12, 18, 24, 14, 10];

function Bars({ progress }: { progress: number }) {
  const lit = Math.round(progress * BAR_HEIGHTS.length);
  return (
    <View style={styles.bars}>
      {BAR_HEIGHTS.map((h, i) => (
        <View key={i} style={[styles.bar, { height: h, backgroundColor: i < lit ? colors.pinkDeep : colors.pink }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
    shadowColor: '#E9679B',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  body: { fontFamily: fonts.body, fontSize: 19, lineHeight: 27, color: colors.text },
  prompt: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.muted },
  promptInline: { color: colors.muted },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.pink },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  shareBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  corner: { left: undefined, bottom: undefined, right: -8, top: -8, width: 16, height: 16 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.pinkSoft },
  drawing: { aspectRatio: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  player: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.pinkDeep, alignItems: 'center', justifyContent: 'center' },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, height: 28 },
  bar: { flex: 1, borderRadius: 2 },
  time: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.muted, fontVariant: ['tabular-nums'], minWidth: 36, textAlign: 'right' },
  transcript: { fontFamily: fonts.body, fontSize: 17, lineHeight: 25, color: colors.text },
  transcriptPending: { gap: 6, paddingTop: 2 },
  pendingBar: { height: 10, borderRadius: 5, backgroundColor: colors.pinkSoft },
});
