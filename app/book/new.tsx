import { useMachine } from '@xstate/react';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CapsInput } from '@/components/CapsInput';
import { Icon } from '@/components/Icon';
import { KeyboardDone } from '@/components/KeyboardDone';
import { RoundButton } from '@/components/RoundButton';
import { Squishy } from '@/components/Squishy';
import { StarRating } from '@/components/StarRating';
import { WizardProgress, type WizardStep } from '@/components/WizardProgress';
import { inspect } from '@/lib/machines/inspect';
import { STEPS, newBookMachine } from '@/lib/machines/newBook';
import { swishIn, swishOut } from '@/lib/motion';
import { useScreen } from '@/lib/screen';
import { colors, fonts, radius } from '@/lib/theme';
import { useKeyboardShown } from '@/lib/useKeyboard';
import { useLayout } from '@/lib/useLayout';

/** The next-arrow bar on the keyboard is this screen's; the name and author fields point at it. */
const NEXT_BAR = 'wizard-next';

const WIZARD: WizardStep[] = [
  { icon: 'camera', label: 'Fota boken' },
  { icon: 'pencil', label: 'Bokens namn' },
  { icon: 'person', label: 'Vem har skrivit den' },
  { icon: 'star', label: 'Hur bra var den' },
];

/**
 * Adding a book as a wizard (lib/machines/newBook.ts): a picture, then the title, then the author,
 * then the stars (optional, there so she remembers), one per screen with the progress strip
 * above. The machine's state is the step.
 */
export default function NewBook() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, send] = useMachine(newBookMachine, { inspect });
  const { step, title, author, coverUri, rating, book } = state.context;
  const index = STEPS.indexOf(step);
  const canNext = state.can({ type: 'NEXT' });
  const busy = state.matches('picking') || state.matches('saving');
  useScreen('book.new', { step });

  useEffect(() => {
    if (state.matches('saved') && book) router.replace({ pathname: '/book/[id]', params: { id: book.id } });
    else if (state.matches('closed')) router.back();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.value]);

  // One next button at a time on the phone: while the keyboard is up, the arrow on the keyboard
  // bar is it (see components/KeyboardDone.tsx); the iPad keeps both, its keyboard can float.
  const layout = useLayout();
  const keyboardShown = useKeyboardShown();
  const pageButton = !(layout.compact && keyboardShown && Platform.OS === 'ios');
  const next = () => send({ type: 'NEXT' });

  // Capitals, no autocorrect: CapsInput. The rest is the wizard's.
  const inputProps = {
    inputAccessoryViewID: NEXT_BAR,
    returnKeyType: 'done' as const,
    maxLength: 120,
    placeholderTextColor: colors.pink,
    autoFocus: true,
    onSubmitEditing: () => send({ type: 'NEXT' }),
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <View style={[styles.top, { paddingTop: Platform.OS === 'ios' ? 14 : insets.top + 12 }]}>
        <RoundButton
          icon={index === 0 ? 'close' : 'back'}
          size={44}
          color={colors.pinkSoft}
          iconColor={colors.text}
          label={index === 0 ? 'Stäng' : 'Tillbaka'}
          onPress={() => send({ type: index === 0 ? 'CLOSE' : 'BACK' })}
          haptic={false}
          sound={null}
        />
        <WizardProgress steps={WIZARD} current={index} />
        <View style={{ width: 44 }} />
      </View>

      {/* One step on stage at a time; the key makes it swish out and the next one swish in. */}
      <Animated.View key={step} entering={swishIn()} exiting={swishOut()} style={styles.stage}>
        {step === 'picture' && (
          <View style={styles.center}>
            <Squishy onPress={() => send({ type: 'PHOTO' })} disabled={busy} accessibilityRole="button" accessibilityLabel="Fota boken" style={styles.cover}>
              {coverUri ? (
                <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <Icon name="camera" size={96} color={colors.pinkDeep} strokeWidth={1.8} />
              )}
              {!!coverUri && (
                <View style={styles.retake}>
                  <Icon name="camera" size={26} color={colors.pinkDeep} />
                </View>
              )}
            </Squishy>
          </View>
        )}
        {step === 'title' && (
          <View style={styles.center}>
            <CapsInput
              id="book-title"
              style={styles.title}
              value={title}
              onChangeText={(t) => send({ type: 'SET_TITLE', title: t })}
              multiline
              submitBehavior="blurAndSubmit"
              placeholder="Bokens namn"
              {...inputProps}
            />
          </View>
        )}
        {step === 'author' && (
          <View style={styles.center}>
            <Text style={styles.titleEcho} numberOfLines={2}>
              {title}
            </Text>
            <CapsInput
              id="book-author"
              style={styles.author}
              value={author}
              onChangeText={(a) => send({ type: 'SET_AUTHOR', author: a })}
              placeholder="Vem har skrivit den?"
              {...inputProps}
            />
          </View>
        )}
        {step === 'rating' && (
          <View style={styles.center}>
            <Text style={styles.titleEcho} numberOfLines={2}>
              {title}
            </Text>
            {/* Optional: the check saves with or without stars. The stars sparkle and tick as on the book page. */}
            <StarRating value={rating} onChange={(n) => send({ type: 'SET_RATING', rating: n })} size={60} />
          </View>
        )}
      </Animated.View>

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {pageButton && (
          <RoundButton
            icon={index === STEPS.length - 1 ? 'check' : 'next'}
            size={72}
            label={index === STEPS.length - 1 ? 'Spara' : 'Nästa'}
            onPress={next}
            disabled={!canNext || busy}
          />
        )}
      </View>
      {/* The name and author steps type; their keyboard carries the arrow. The stars step has no keyboard. */}
      <KeyboardDone id={NEXT_BAR} icon="next" label="Nästa" onPress={next} disabled={!canNext || busy} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 },
  stage: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, gap: 18 },
  cover: {
    width: 220,
    height: 275,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#E9679B',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  retake: {
    position: 'absolute',
    bottom: 12,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 40,
    color: colors.text,
    textAlign: 'center',
    width: '100%',
    paddingVertical: 6,
  },
  titleEcho: { fontFamily: fonts.displaySemi, fontSize: 20, lineHeight: 26, color: colors.muted, textAlign: 'center' },
  author: { fontFamily: fonts.bodySemi, fontSize: 24, color: colors.text, textAlign: 'center', width: '100%', paddingVertical: 6 },
  bar: { alignItems: 'flex-end', paddingHorizontal: 24, paddingTop: 10 },
});
