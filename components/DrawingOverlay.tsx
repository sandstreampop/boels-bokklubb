import { useMachine } from '@xstate/react';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { PromptLine } from './Prompt';
import { RoundButton } from './RoundButton';
import { Squishy } from './Squishy';
import { Unicorn } from './Unicorn';
import { canvasSide, crayonsBeside } from '@/lib/layout';
import { CRAYONS, canReroll, drawingMachine, drawnAnswer, type DrawnAnswer } from '@/lib/machines/drawing';
import { inspect } from '@/lib/machines/inspect';
import { play } from '@/lib/sounds';
import { colors, radius } from '@/lib/theme';
import { MODAL_ORIENTATIONS, useLayout } from '@/lib/useLayout';

const BRUSH = 10;
const EXPORT_PX = 1024;
/** What surrounds the canvas on a tablet: the prompt row, the crayons (when under it), the buttons, the gaps. */
const CHROME = { top: 56, crayons: 100, bar: 72, gaps: 40, padding: 32, crayonColumn: 150 };

type Props = {
  visible: boolean;
  /** A cover for the book: no question, no wand. Otherwise a drawing entry with its question. */
  cover: boolean;
  /** Called once when she is done: the PNG file (null if nothing was drawn) and the question. */
  onDone: (answer: DrawnAnswer) => void;
};

/**
 * Full-screen drawing, driven by lib/machines/drawing.ts. A square white canvas, the pastel
 * rainbow's six colours plus black as crayons, one brush width, undo one step at a time, done.
 * Strokes are SVG paths; done captures the canvas view to a PNG. The machine owns the question:
 * the wand sends REROLL and is lit only while the machine accepts it (a blank canvas). The
 * square's size comes from lib/layout.ts: the phone's rule as before, a tablet fills the height it
 * has, and a wide landscape stands the crayons beside it.
 */
export function DrawingOverlay({ visible, cover, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const layout = useLayout();
  const canvasRef = useRef<ComponentRef<typeof View>>(null);
  const capture = useCallback(
    () =>
      captureRef(canvasRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: EXPORT_PX,
        height: EXPORT_PX,
      }),
    [],
  );
  const [state, send] = useMachine(drawingMachine, {
    input: { capture },
    inspect,
  });
  const { strokes, color, prompt } = state.context;
  const drawing = state.matches('drawing');
  const locked = !canReroll(state);
  const beside = crayonsBeside(layout);
  const side = canvasSide(layout.width, layout.height, {
    vertical: insets.top + insets.bottom + CHROME.padding + CHROME.top + CHROME.bar + CHROME.gaps + (beside ? 0 : CHROME.crayons),
    horizontal: CHROME.padding + (beside ? CHROME.crayonColumn : 0),
  });

  // The stroke under her finger, kept out of the machine until it is finished (one event per
  // stroke); the machine only hears that a finger is down (BEGIN), which locks the wand.
  const live = useRef('');
  const [liveD, setLiveD] = useState('');

  useEffect(() => {
    if (visible) send({ type: 'START', cover });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, send]);

  useEffect(() => {
    if (state.matches('done')) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      onDone(drawnAnswer(state));
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
      play('crayon');
      send({ type: 'BEGIN' });
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

  const canvas = (
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
  );

  const crayons = (
    <View style={[styles.crayons, beside && { flexDirection: 'column', maxWidth: undefined, maxHeight: side, width: CHROME.crayonColumn - 30 }]}>
      {CRAYONS.map((c) => (
        <Squishy
          key={c}
          onPress={() => send({ type: 'SET_COLOR', color: c })}
          accessibilityRole="button"
          accessibilityLabel="Färg"
          hitSlop={6}
          style={[styles.crayon, { backgroundColor: c }, c === color && styles.crayonOn]}
        />
      ))}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" supportedOrientations={MODAL_ORIENTATIONS} onRequestClose={() => send({ type: 'DONE' })}>
      {/* A Modal is its own native window on iOS, so gestures inside it need their own root view. */}
      <GestureHandlerRootView style={[styles.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.top, layout.compact ? null : { maxWidth: layout.maxContent }]}>
          {prompt !== null && (
            <PromptLine prompt={prompt} onReroll={() => send({ type: 'REROLL' })} locked={locked} color={colors.pinkDeep} wandColor={colors.pink} size={26} />
          )}
        </View>

        {/* The phone keeps its four stacked rows; a wide landscape puts the crayons beside the canvas. */}
        {beside ? (
          <View style={styles.beside}>
            {canvas}
            {crayons}
          </View>
        ) : (
          <>
            {canvas}
            {crayons}
          </>
        )}

        <View style={[styles.bar, layout.compact ? null : { maxWidth: layout.maxContent }]}>
          <RoundButton
            icon="undo"
            size={56}
            color={colors.pinkSoft}
            iconColor={colors.text}
            label="Ångra"
            onPress={() => send({ type: 'UNDO' })}
            disabled={strokes.length === 0}
          />
          {/* Below the canvas, between undo and done, nodding now and then. */}
          <Unicorn pose="drawing" placement="inline" />
          <RoundButton icon="check" size={72} label="Klar" onPress={() => send({ type: 'DONE' })} disabled={!drawing} />
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  top: { width: '100%', minHeight: 56, justifyContent: 'center' },
  canvas: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  beside: { flexDirection: 'row', alignItems: 'center', gap: 30 },
  crayons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: 10,
    rowGap: 8,
    maxWidth: 400,
  },
  crayon: { width: 34, height: 34, borderRadius: 17, margin: 4 },
  crayonOn: {
    margin: 0,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 3,
    borderColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  bar: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
