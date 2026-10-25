import { useMachine } from '@xstate/react';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrawingOverlay } from '@/components/DrawingOverlay';
import { Icon } from '@/components/Icon';
import { RoundButton } from '@/components/RoundButton';
import { Squishy } from '@/components/Squishy';
import { inspect } from '@/lib/machines/inspect';
import { newBookMachine } from '@/lib/machines/newBook';
import { useScreen } from '@/lib/screen';
import { colors, fonts, radius } from '@/lib/theme';

export default function NewBook() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, send] = useMachine(newBookMachine, { inspect });
  const { title, author, coverUri, book } = state.context;
  const canSave = state.can({ type: 'SAVE' });
  useScreen('book.new');

  useEffect(() => {
    if (state.matches('saved') && book) router.replace({ pathname: '/book/[id]', params: { id: book.id } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.value]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'ios' ? 18 : insets.top + 12, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <RoundButton
            icon="close"
            size={44}
            color={colors.pinkSoft}
            iconColor={colors.text}
            label="Stäng"
            onPress={() => router.back()}
            haptic={false}
            sound={null}
          />
          <RoundButton icon="check" size={56} label="Spara" onPress={() => send({ type: 'SAVE' })} disabled={!canSave} />
        </View>

        <View style={styles.coverWrap}>
          <View style={styles.cover}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <Icon name="photo" size={56} color={colors.pink} strokeWidth={1.8} />
            )}
            <View style={styles.coverButtons}>
              <Squishy onPress={() => send({ type: 'PHOTO' })} style={styles.coverBtn} accessibilityLabel="Fota omslaget">
                <Icon name="camera" size={26} color={colors.pinkDeep} />
              </Squishy>
              <Squishy onPress={() => send({ type: 'DRAW' })} style={styles.coverBtn} accessibilityLabel="Rita omslaget">
                <Icon name="brush" size={26} color={colors.pinkDeep} />
              </Squishy>
            </View>
          </View>
        </View>

        <TextInput
          id="book-title"
          style={styles.title}
          value={title}
          onChangeText={(t) => send({ type: 'SET_TITLE', title: t })}
          autoFocus
          autoCorrect={false}
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          returnKeyType="done"
          maxLength={120}
          multiline
          placeholder="Bokens namn"
          placeholderTextColor={colors.pink}
        />
        <TextInput
          id="book-author"
          style={styles.author}
          value={author}
          onChangeText={(a) => send({ type: 'SET_AUTHOR', author: a })}
          autoCorrect={false}
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          returnKeyType="done"
          maxLength={120}
          placeholder="Vem har skrivit den?"
          placeholderTextColor={colors.pink}
        />
      </ScrollView>
      <DrawingOverlay visible={state.matches('drawing')} prompt={null} onReroll={() => {}} onDone={(uri) => send({ type: 'DRAWING_DONE', uri })} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 22, gap: 22 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  coverWrap: { alignItems: 'center' },
  cover: {
    width: 200,
    height: 250,
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
  coverButtons: { position: 'absolute', bottom: 12, flexDirection: 'row', gap: 10 },
  coverBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 38,
    color: colors.text,
    textAlign: 'center',
    paddingVertical: 6,
  },
  author: { fontFamily: fonts.bodySemi, fontSize: 19, color: colors.text, textAlign: 'center', paddingVertical: 6 },
});
