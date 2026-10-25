import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { RoundButton } from '@/components/RoundButton';
import { addBook } from '@/lib/actions';
import { pickPhoto } from '@/lib/images';
import { colors, fonts, radius } from '@/lib/theme';

export default function NewBook() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave = title.trim().length > 0 && !saving;

  const pick = async (source: 'camera' | 'library') => {
    const uri = await pickPhoto(source);
    if (uri) setCoverUri(uri);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const book = await addBook({ title: title.trim(), author: author.trim() || null, coverUri });
    router.replace({ pathname: '/book/[id]', params: { id: book.id } });
  };

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
          />
          <RoundButton icon="check" size={56} label="Spara" onPress={save} disabled={!canSave} />
        </View>

        <View style={styles.coverWrap}>
          <View style={styles.cover}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <Icon name="photo" size={56} color={colors.pink} strokeWidth={1.8} />
            )}
            <View style={styles.coverButtons}>
              <Pressable onPress={() => pick('camera')} style={styles.coverBtn} accessibilityLabel="Fota omslaget">
                <Icon name="camera" size={26} color={colors.pinkDeep} />
              </Pressable>
              <Pressable onPress={() => pick('library')} style={styles.coverBtn} accessibilityLabel="Välj bild">
                <Icon name="photo" size={26} color={colors.pinkDeep} />
              </Pressable>
            </View>
          </View>
        </View>

        <TextInput
          id="book-title"
          style={styles.title}
          value={title}
          onChangeText={setTitle}
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
          onChangeText={setAuthor}
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
