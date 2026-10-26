import { useMachine } from '@xstate/react';
import { useEffect } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CapsInput } from './CapsInput';
import { KeyboardDone } from './KeyboardDone';
import { PromptLine, Wand, usePromptSwap } from './Prompt';
import { RoundButton } from './RoundButton';
import { Unicorn } from './Unicorn';
import { inspect } from '@/lib/machines/inspect';
import { canReroll, writerMachine, writtenAnswer, type WrittenAnswer } from '@/lib/machines/writer';
import { isFillIn, splitFillIn } from '@/lib/prompts';
import { colors, fonts } from '@/lib/theme';
import { useKeyboardShown } from '@/lib/useKeyboard';
import { MODAL_ORIENTATIONS, useLayout } from '@/lib/useLayout';

/** The done bar on the keyboard is this screen's; its fields point at it. */
const DONE_BAR = 'writer-done';

type Props = {
  bookId: string;
  visible: boolean;
  /** Called once when she is done, with her words (maybe empty) and the question they answer. */
  onDone: (answer: WrittenAnswer) => void;
};

/**
 * Full-screen writing, driven by lib/machines/writer.ts, the same shape as the recorder: the
 * prompt at the top, a big text area, a done button bottom right and no cancel. A fill-in prompt
 * puts the caret in its blank. The machine owns the question: the wand sends REROLL and is lit
 * only while the machine accepts it. On a tablet the text sits in a centred column
 * (lib/layout.ts); on the phone nothing is added.
 */
export function WriterOverlay({ bookId, visible, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const layout = useLayout();
  const [state, send] = useMachine(writerMachine, {
    input: { bookId },
    inspect,
  });
  const { text, prompt } = state.context;
  const writing = state.matches('writing');
  const locked = !canReroll(state);

  // Opening the overlay starts the machine. START is only accepted in idle, so this cannot double-start.
  useEffect(() => {
    if (visible) send({ type: 'START' });
  }, [visible, send]);

  // Hand the answer to the book page and reset for next time.
  useEffect(() => {
    if (state.matches('done')) {
      onDone(writtenAnswer(state));
      send({ type: 'RESET' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.value]);

  const setText = (t: string) => send({ type: 'SET_TEXT', text: t });
  const reroll = () => send({ type: 'REROLL' });
  // Capitals and no autocorrect come from CapsInput.
  const inputProps = {
    value: text,
    onChangeText: setText,
    multiline: true,
    autoFocus: true,
    maxLength: 4000,
    editable: writing,
    scrollEnabled: false,
    inputAccessoryViewID: DONE_BAR,
  };
  const column = layout.compact ? null : { width: '100%' as const, maxWidth: layout.maxContent, alignSelf: 'center' as const };
  // One done button at a time: while the phone's keyboard is up, the one on the keyboard bar is
  // it and the page's own steps aside. The iPad keeps both (its keyboard can float, and a floating
  // keyboard has no bar).
  const keyboardShown = useKeyboardShown();
  const done = () => send({ type: 'DONE' });
  const pageButton = !(layout.compact && keyboardShown && Platform.OS === 'ios');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" supportedOrientations={MODAL_ORIENTATIONS} onRequestClose={() => send({ type: 'DONE' })}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]} keyboardShouldPersistTaps="handled">
          <View style={[styles.column, column]}>
            {prompt !== null &&
              (isFillIn(prompt) ? (
                <FillIn prompt={prompt} onReroll={reroll} locked={locked} inputProps={inputProps} />
              ) : (
                <>
                  <PromptLine prompt={prompt} onReroll={reroll} locked={locked} color={colors.pinkDeep} wandColor={colors.pink} size={28} />
                  <CapsInput id="writer-text" style={styles.input} {...inputProps} />
                </>
              ))}
          </View>
        </ScrollView>
        <View style={[styles.bar, column, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {/* Below the text, nodding now and then; the done button is what she leans toward. */}
          <Unicorn pose="writing" placement="inline" />
          {pageButton && <RoundButton icon="check" size={72} label="Klar" onPress={done} disabled={!writing} />}
        </View>
        <KeyboardDone id={DONE_BAR} icon="check" label="Klar" onPress={done} disabled={!writing} />
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** The prompt with her words typed straight into the blank, which is underlined and holds the caret. */
function FillIn({
  prompt,
  onReroll,
  locked,
  inputProps,
}: {
  prompt: string;
  onReroll: () => void;
  locked: boolean;
  inputProps: React.ComponentProps<typeof TextInput>;
}) {
  const { before, after } = splitFillIn(prompt);
  const { enterStyle, burst } = usePromptSwap(prompt);
  const words = (s: string) => s.split(' ').filter((w) => w.length > 0);
  return (
    <Animated.View style={[styles.fillRow, enterStyle]}>
      <View style={styles.wand}>
        <Wand color={colors.pink} burst={burst} onPress={onReroll} locked={locked} />
      </View>
      {words(before).map((w, i) => (
        <Text key={`b${i}`} style={styles.fillWord}>
          {w}
        </Text>
      ))}
      <CapsInput id="writer-blank" style={[styles.input, styles.blank]} {...inputProps} />
      {words(after).map((w, i) => (
        <Text key={`a${i}`} style={styles.fillWord}>
          {w}
        </Text>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingBottom: 24 },
  column: { gap: 18 },
  input: {
    fontFamily: fonts.body,
    fontSize: 24,
    lineHeight: 34,
    color: colors.text,
    minHeight: 160,
    textAlignVertical: 'top',
    padding: 0,
  },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  fillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    columnGap: 8,
    rowGap: 6,
  },
  wand: { width: '100%', alignItems: 'flex-end' },
  fillWord: {
    fontFamily: fonts.displaySemi,
    fontSize: 28,
    lineHeight: 36,
    color: colors.pinkDeep,
  },
  blank: {
    minHeight: 36,
    minWidth: 140,
    flexGrow: 1,
    borderBottomWidth: 3,
    borderBottomColor: colors.pink,
    paddingBottom: 2,
  },
});
