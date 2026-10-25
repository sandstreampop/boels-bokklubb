import { useMachine } from '@xstate/react';
import { useEffect } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PromptLine, Wand, usePromptSwap } from './Prompt';
import { RoundButton } from './RoundButton';
import { Unicorn } from './Unicorn';
import { inspect } from '@/lib/machines/inspect';
import { writerMachine } from '@/lib/machines/writer';
import { isFillIn, splitFillIn } from '@/lib/prompts';
import { colors, fonts } from '@/lib/theme';

type Props = {
  bookId: string;
  visible: boolean;
  /** The question at the top. The wand asks the owner for a new one. */
  prompt: string;
  onReroll: () => void;
  /** Called once when she is done, whether or not anything was saved. */
  onDone: () => void;
};

/**
 * Full-screen writing, driven by lib/machines/writer.ts, the same shape as the recorder: the
 * prompt at the top, a big text area, a done button bottom right and no cancel. A fill-in prompt
 * puts the caret in its blank.
 */
export function WriterOverlay({ bookId, visible, prompt, onReroll, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const [state, send] = useMachine(writerMachine, {
    input: { bookId },
    inspect,
  });
  const { text } = state.context;
  const writing = state.matches('writing');

  // Opening the overlay starts the machine. START is only accepted in idle, so this cannot double-start.
  useEffect(() => {
    if (visible) send({ type: 'START', prompt });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, send]);

  // Hand control back to the book page and reset for next time.
  useEffect(() => {
    if (state.matches('done')) {
      onDone();
      send({ type: 'RESET' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.value]);

  const setText = (t: string) => send({ type: 'SET_TEXT', text: t });
  const inputProps = {
    value: text,
    onChangeText: setText,
    multiline: true,
    autoFocus: true,
    autoCorrect: false,
    spellCheck: false,
    autoCapitalize: 'none' as const,
    autoComplete: 'off' as const,
    maxLength: 4000,
    editable: writing,
    scrollEnabled: false,
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => send({ type: 'DONE' })}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]} keyboardShouldPersistTaps="handled">
          {isFillIn(prompt) ? (
            <FillIn prompt={prompt} onReroll={onReroll} inputProps={inputProps} />
          ) : (
            <>
              <PromptLine prompt={prompt} onReroll={onReroll} color={colors.pinkDeep} wandColor={colors.pink} size={28} />
              <TextInput id="writer-text" style={styles.input} {...inputProps} />
            </>
          )}
        </ScrollView>
        <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {/* Below the text, nodding now and then; the done button is what she leans toward. */}
          <Unicorn pose="writing" placement="inline" />
          <RoundButton icon="check" size={72} label="Klar" onPress={() => send({ type: 'DONE' })} disabled={!writing} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** The prompt with her words typed straight into the blank, which is underlined and holds the caret. */
function FillIn({ prompt, onReroll, inputProps }: { prompt: string; onReroll: () => void; inputProps: React.ComponentProps<typeof TextInput> }) {
  const { before, after } = splitFillIn(prompt);
  const { enterStyle, burst } = usePromptSwap(prompt);
  const words = (s: string) => s.split(' ').filter((w) => w.length > 0);
  return (
    <Animated.View style={[styles.fillRow, enterStyle]}>
      <View style={styles.wand}>
        <Wand color={colors.pink} burst={burst} onPress={onReroll} />
      </View>
      {words(before).map((w, i) => (
        <Text key={`b${i}`} style={styles.fillWord}>
          {w}
        </Text>
      ))}
      <TextInput id="writer-blank" style={[styles.input, styles.blank]} {...inputProps} />
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
  content: { paddingHorizontal: 24, paddingBottom: 24, gap: 18 },
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
