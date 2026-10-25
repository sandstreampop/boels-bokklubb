import { useMachine } from '@xstate/react';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { PromptLine } from './Prompt';
import { RoundButton } from './RoundButton';
import { CRAYONS, drawingMachine } from '@/lib/machines/drawing';
import { inspect } from '@/lib/machines/inspect';
import { colors, radius } from '@/lib/theme';

const BRUSH = 10;
const EXPORT_PX = 1024;

type Props = {
  visible: boolean;
  /** The draw prompt at the top, or null for a cover (no question, no wand). */
  prompt: string | null;
  onReroll: () => void;
  /** Called once when she is done: the PNG file, or null if nothing was drawn. */
  onDone: (uri: string | null) => void;
};

/**
 * Full-screen drawing, driven by lib/machines/drawing.ts. A square white canvas, the pastel
 * rainbow's six colours plus black as crayons, one brush width, undo one step at a time, done.
 * Strokes are SVG paths; done captures the canvas view to a PNG.
 */
export function DrawingOverlay({ visible, prompt, onReroll, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const canvasRef = useRef<ComponentRef<typeof View>>(null);
  const capture = useCallback(
    () => captureRef(canvasRef, { format: 'png', quality: 1, result: 'tmpfile', width: EXPORT_PX, height: EXPORT_PX }),
    [],
  );
  const [state, send] = useMachine(drawingMachine, { input: { capture }, inspect });
  const { strokes, color } = state.context;
  const drawing = state.matches('drawing');
  const side = Math.floor(Math.min(width - 32, height * 0.56));

  // The stroke under her finger, kept out of the machine until it is finished (one event per stroke).
  const live = useRef('');
  const [liveD, setLiveD] = useState('');

  useEffect(() => {
    if (visible) send({ type: 'START', prompt });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, send]);

  useEffect(() => {
    if (state.matches('done')) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      onDone(state.context.uri);
      send({ type: 'RESET' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.value]);

  const pt = (x: number, y: number) => `${Math.max(0, Math.min(side, x)).toFixed(1)} ${Math.max(0, Math.min(side, y)).toFixed(1)}`;
  const pan = usePanGesture({
    runOnJS: true,
    minDistance: 0,
    maxPointers: 1,
    shouldCancelWhenOutside: false,
    onBegin: (e) => {
      live.current = `M ${pt(e.x, e.y)}`;
      setLiveD(live.current);
    },
    onUpdate: (e) => {
      live.current += ` L ${pt(e.x, e.y)}`;
      setLiveD(live.current);
    },
    onFinalize: (e) => {
      let d = live.current;
      if (!d) return;
      // A tap leaves a dot: a zero-length line with round caps renders as a circle.
      if (!d.includes('L')) d += ` L ${pt(e.x + 0.01, e.y)}`;
      live.current = '';
      setLiveD('');
      send({ type: 'STROKE', stroke: { color, d } });
    },
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => send({ type: 'DONE' })}>
      {/* A Modal is its own native window on iOS, so gestures inside it need their own root view. */}
      <GestureHandlerRootView style={[styles.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.top}>
          {prompt !== null && <PromptLine prompt={prompt} onReroll={onReroll} color={colors.pinkDeep} wandColor={colors.pink} size={26} />}
        </View>

        <GestureDetector gesture={pan}>
          <View ref={canvasRef} collapsable={false} style={[styles.canvas, { width: side, height: side }]}>
            <Svg width={side} height={side}>
              {strokes.map((s, i) => (
                <Path key={i} d={s.d} stroke={s.color} strokeWidth={BRUSH} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              ))}
              {liveD !== '' && <Path d={liveD} stroke={color} strokeWidth={BRUSH} strokeLinecap="round" strokeLinejoin="round" fill="none" />}
            </Svg>
          </View>
        </GestureDetector>

        <View style={styles.crayons}>
          {CRAYONS.map((c) => (
            <Pressable
              key={c}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                send({ type: 'SET_COLOR', color: c });
              }}
              accessibilityRole="button"
              accessibilityLabel="Färg"
              hitSlop={6}
              style={[styles.crayon, { backgroundColor: c }, c === color && styles.crayonOn]}
            />
          ))}
        </View>

        <View style={styles.bar}>
          <RoundButton icon="undo" size={56} color={colors.pinkSoft} iconColor={colors.text} label="Ångra" onPress={() => send({ type: 'UNDO' })} disabled={strokes.length === 0} />
          <RoundButton icon="check" size={72} label="Klar" onPress={() => send({ type: 'DONE' })} disabled={!drawing} />
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  top: { width: '100%', minHeight: 56, justifyContent: 'center' },
  canvas: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 2, borderColor: colors.line, overflow: 'hidden' },
  crayons: { flexDirection: 'row', gap: 12, alignItems: 'flex-end', height: 56 },
  crayon: { width: 36, height: 36, borderRadius: 18 },
  crayonOn: { width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: colors.white, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  bar: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
