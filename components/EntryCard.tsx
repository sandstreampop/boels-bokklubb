import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './Icon';
import { formatDate, formatDuration } from '@/lib/format';
import { useMediaUri } from '@/lib/media';
import { colors, fonts, radius } from '@/lib/theme';
import type { Entry } from '@/lib/types';

export function EntryCard({ entry }: { entry: Entry }) {
  return (
    <View style={styles.card}>
      {entry.kind === 'text' && <Text style={styles.body}>{entry.text}</Text>}
      {entry.kind === 'photo' && <PhotoBody entry={entry} />}
      {entry.kind === 'audio' && <AudioBody entry={entry} />}
      <View style={styles.footer}>
        <Text style={styles.date}>{formatDate(entry.created_at)}</Text>
        {entry.pending && <View style={styles.dot} accessibilityLabel="Sparas" />}
      </View>
    </View>
  );
}

function PhotoBody({ entry }: { entry: Entry }) {
  const uri = useMediaUri('media', entry.media_path);
  return (
    <View style={styles.photo}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.pinkSoft }]} />
      )}
    </View>
  );
}

function AudioBody({ entry }: { entry: Entry }) {
  const uri = useMediaUri('media', entry.media_path);
  return (
    <View style={{ gap: 10 }}>
      {uri ? <Player uri={uri} durationMs={entry.duration_ms ?? 0} /> : <PlayerShell durationMs={entry.duration_ms ?? 0} />}
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

function Player({ uri, durationMs }: { uri: string; durationMs: number }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const total = status.duration > 0 ? status.duration * 1000 : durationMs;
  const progress = total > 0 ? Math.min(1, (status.currentTime * 1000) / total) : 0;
  const playing = status.playing;

  const toggle = () => {
    if (playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish || (total > 0 && progress >= 0.999)) {
      player.seekTo(0);
    }
    player.play();
  };

  return (
    <View style={styles.player}>
      <Pressable onPress={toggle} style={styles.playBtn} accessibilityRole="button" accessibilityLabel={playing ? 'Pausa' : 'Spela'}>
        <Icon name={playing ? 'pause' : 'play'} size={22} color={colors.white} />
      </Pressable>
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
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.pink },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.pinkSoft },
  player: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.pinkDeep, alignItems: 'center', justifyContent: 'center' },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, height: 28 },
  bar: { flex: 1, borderRadius: 2 },
  time: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.muted, fontVariant: ['tabular-nums'], minWidth: 36, textAlign: 'right' },
  transcript: { fontFamily: fonts.body, fontSize: 17, lineHeight: 25, color: colors.text },
  transcriptPending: { gap: 6, paddingTop: 2 },
  pendingBar: { height: 10, borderRadius: 5, backgroundColor: colors.pinkSoft },
});
