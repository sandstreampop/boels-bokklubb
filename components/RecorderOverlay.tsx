import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './Icon';
import { formatDuration } from '@/lib/format';
import { clearRecordingMarker, writeRecordingMarker } from '@/lib/recording';
import { colors, fonts } from '@/lib/theme';

const MAX_SECONDS = 10 * 60;

type Props = {
  bookId: string;
  visible: boolean;
  /** Called with the finished file. Never called with nothing: there is no cancel. */
  onDone: (uri: string, durationMs: number) => void;
  onUnavailable: () => void;
};

/**
 * Full-screen recording. Pit of success: starts the moment it opens, and every tap anywhere stops
 * and saves. Backgrounding keeps recording (background audio mode), and a marker file means a crash
 * still produces an entry on next launch.
 */
export function RecorderOverlay({ bookId, visible, onDone, onUnavailable }: Props) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'document' });
  const state = useAudioRecorderState(recorder, 250);
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<'starting' | 'recording' | 'stopping'>('starting');
  const startedAt = useRef<number>(0);
  const finishing = useRef(false);

  const pulse = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 2 - pulse.value,
  }));

  useEffect(() => {
    if (!visible) return;
    finishing.current = false;
    let cancelled = false;
    (async () => {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) {
          onUnavailable();
          return;
        }
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, allowsBackgroundRecording: true });
        await recorder.prepareToRecordAsync();
        if (cancelled) return;
        recorder.record({ forDuration: MAX_SECONDS });
        startedAt.current = Date.now();
        setPhase('recording');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        pulse.set(withRepeat(withTiming(1.6, { duration: 1100, easing: Easing.out(Easing.quad) }), -1, false));
        if (recorder.uri) {
          void writeRecordingMarker({ bookId, uri: recorder.uri, startedAt: new Date(startedAt.current).toISOString() });
        }
      } catch (err) {
        console.warn('recorder failed to start', err);
        onUnavailable();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // The duration cap stopped it for us: save.
  useEffect(() => {
    if (phase === 'recording' && !state.isRecording && state.durationMillis > 0 && Date.now() - startedAt.current > 2000) {
      void finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isRecording]);

  async function finish() {
    if (finishing.current) return;
    finishing.current = true;
    setPhase('stopping');
    try {
      if (recorder.isRecording) await recorder.stop();
    } catch (err) {
      console.warn('stop failed', err);
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    const uri = recorder.uri;
    const durationMs = Math.max(state.durationMillis, Date.now() - startedAt.current);
    clearRecordingMarker();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    if (uri) onDone(uri, durationMs);
    else onUnavailable();
    setPhase('starting');
  }

  const seconds = Math.floor(state.durationMillis / 1000);

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => void finish()}>
      <Pressable
        style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}
        onPress={() => void finish()}
        accessibilityLabel="Stoppa och spara">
        <Text style={styles.timer}>{formatDuration(seconds * 1000)}</Text>
        <View style={styles.center}>
          <Animated.View style={[styles.ring, pulseStyle]} />
          <View style={styles.micCircle}>
            <Icon name="mic" size={70} color={colors.white} strokeWidth={2.2} />
          </View>
        </View>
        <View style={styles.stop}>
          <Icon name="stop" size={44} color={colors.pinkDeep} />
        </View>
        {phase !== 'recording' && <View style={styles.dim} pointerEvents="none" />}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pinkDeep, alignItems: 'center', justifyContent: 'space-between' },
  timer: { fontFamily: fonts.display, fontSize: 56, color: colors.white, fontVariant: ['tabular-nums'] },
  center: { width: 260, height: 260, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.35)' },
  micCircle: { width: 180, height: 180, borderRadius: 90, backgroundColor: colors.pink, alignItems: 'center', justifyContent: 'center' },
  stop: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(233,103,155,0.35)' },
});
