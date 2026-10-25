import { useMachine } from '@xstate/react';
import { RecordingPresets, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './Icon';
import { PromptLine } from './Prompt';
import { formatDuration } from '@/lib/format';
import { info } from '@/lib/telemetry';
import { inspect } from '@/lib/machines/inspect';
import { recorderMachine } from '@/lib/machines/recorder';
import { colors, fonts } from '@/lib/theme';

type Props = {
  bookId: string;
  visible: boolean;
  /** Called with the finished file. Never called with nothing: there is no cancel. */
  onDone: (uri: string, durationMs: number) => void;
  onUnavailable: () => void;
  /** She closed the mode before pressing record: nothing to save. */
  onSkip: () => void;
  /** The question she is answering, shown under the timer. The wand asks the owner for a new one. */
  prompt: string | null;
  onReroll: () => void;
};

/**
 * Full-screen recording, driven by lib/machines/recorder.ts. Opens with the prompt and one record
 * button; recording starts when she presses it, and from then on every tap anywhere stops and
 * saves. Before that, a tap outside the button closes the mode. Backgrounding keeps recording
 * (background audio mode), and a marker file means a crash still produces an entry on next launch.
 */
export function RecorderOverlay({ bookId, visible, onDone, onUnavailable, onSkip, prompt, onReroll }: Props) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'document' });
  const status = useAudioRecorderState(recorder, 250);
  const insets = useSafeAreaInsets();
  const [state, send] = useMachine(recorderMachine, { input: { bookId, recorder }, inspect });
  const recording = state.matches('recording');
  const ready = state.matches('idle');

  const pulse = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 2 - pulse.value,
  }));

  // The record button starts the machine. START is only accepted in idle, so this cannot double-start.
  const start = () => {
    info('recording.armed', { bookId });
    send({ type: 'START', prompt });
  };

  // Pulse and tick once we are really recording.
  useEffect(() => {
    if (!recording) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    pulse.set(withRepeat(withTiming(1.6, { duration: 1100, easing: Easing.out(Easing.quad) }), -1, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  // The duration cap stopped it for us: save.
  useEffect(() => {
    if (recording && !status.isRecording && status.durationMillis > 0 && Date.now() - state.context.startedAt > 2000) {
      send({ type: 'AUTO_STOPPED', durationMs: status.durationMillis });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.isRecording]);

  // Hand the result to the book page and reset for next time.
  useEffect(() => {
    if (state.matches('done')) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      const { uri, durationMs } = state.context;
      if (uri) onDone(uri, durationMs);
      else onUnavailable();
      send({ type: 'RESET' });
    } else if (state.matches('unavailable')) {
      onUnavailable();
      send({ type: 'RESET' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.value]);

  const stop = () => send({ type: 'STOP' });
  const seconds = Math.floor(status.durationMillis / 1000);
  // Before record is pressed a tap outside the button closes the mode; after it, any tap stops and saves.
  const tapAnywhere = () => (ready ? onSkip() : stop());

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={tapAnywhere}>
      <Pressable
        style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}
        onPress={tapAnywhere}
        accessibilityLabel={ready ? 'Stäng' : 'Stoppa och spara'}>
        <View style={styles.top}>
          <Text style={[styles.timer, ready && styles.timerIdle]}>{formatDuration(seconds * 1000)}</Text>
          {prompt !== null && (
            <PromptLine prompt={prompt} onReroll={onReroll} color={colors.white} wandColor={colors.white} size={30} align="center" style={styles.prompt} />
          )}
        </View>
        <View style={styles.center}>
          {ready ? (
            <Pressable onPress={start} style={styles.recordBtn} accessibilityRole="button" accessibilityLabel="Spela in">
              <View style={styles.recordDot} />
            </Pressable>
          ) : (
            <>
              <Animated.View style={[styles.ring, pulseStyle]} />
              <View style={styles.micCircle}>
                <Icon name="mic" size={70} color={colors.white} strokeWidth={2.2} />
              </View>
            </>
          )}
        </View>
        <View style={[styles.stop, ready && styles.hidden]}>
          <Icon name="stop" size={44} color={colors.pinkDeep} />
        </View>
        {!recording && !ready && <View style={styles.dim} pointerEvents="none" />}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pinkDeep, alignItems: 'center', justifyContent: 'space-between' },
  top: { alignItems: 'center', gap: 10, paddingHorizontal: 22, width: '100%' },
  timer: { fontFamily: fonts.display, fontSize: 56, color: colors.white, fontVariant: ['tabular-nums'] },
  timerIdle: { opacity: 0.35 },
  recordBtn: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  recordDot: { width: 92, height: 92, borderRadius: 46, backgroundColor: colors.danger },
  hidden: { opacity: 0 },
  prompt: { width: '100%' },
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
