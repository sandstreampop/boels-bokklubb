import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EntryCard } from '@/components/EntryCard';
import { RainbowFill } from '@/components/Rainbow';
import { RecorderOverlay } from '@/components/RecorderOverlay';
import { RoundButton } from '@/components/RoundButton';
import { StarRating } from '@/components/StarRating';
import { addAudioEntry, addPhotoEntry, addTextEntry, rateBook } from '@/lib/actions';
import { pickPhoto } from '@/lib/images';
import { useMediaUri } from '@/lib/media';
import { useStore } from '@/lib/store';
import { pullEntries } from '@/lib/sync';
import { colors, fonts, radius } from '@/lib/theme';

export default function BookPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const book = useStore((s) => s.books.find((b) => b.id === id));
  const entries = useStore((s) => s.entries[id ?? ''] ?? []);
  const cover = useMediaUri('covers', book?.cover_path ?? null);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (id) void pullEntries(id);
    }, [id]),
  );

  const sendText = async () => {
    const t = text.trim();
    if (!t || !id) return;
    setText('');
    await addTextEntry(id, t);
  };

  const takePhoto = async (source: 'camera' | 'library') => {
    setPhotoSheet(false);
    if (!id) return;
    const uri = await pickPhoto(source);
    if (uri) await addPhotoEntry(id, uri);
  };

  const header = useMemo(
    () =>
      book ? (
        <View style={styles.header}>
          <View style={styles.coverRow}>
            <View style={styles.cover}>
              {cover ? (
                <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
              ) : (
                <>
                  <RainbowFill seed={book.id} style={StyleSheet.absoluteFill} />
                  <Text style={styles.initial}>{book.title.trim().charAt(0).toUpperCase()}</Text>
                </>
              )}
            </View>
            <View style={styles.titleBlock}>
              <Text style={styles.title}>{book.title}</Text>
              {!!book.author && <Text style={styles.author}>{book.author}</Text>}
            </View>
          </View>
          <StarRating value={book.rating} onChange={(n) => void rateBook(book.id, n)} size={52} />
          <View style={styles.composer}>
            <TextInput
              id="entry-text"
              style={styles.input}
              value={text}
              onChangeText={setText}
              multiline
              autoCorrect={false}
              spellCheck={false}
              autoCapitalize="none"
              autoComplete="off"
              placeholder="Skriv här"
              placeholderTextColor={colors.pink}
              maxLength={4000}
            />
            {text.trim().length > 0 && (
              <RoundButton icon="send" size={48} label="Spara" onPress={sendText} style={styles.sendBtn} />
            )}
          </View>
          <View style={styles.actions}>
            <RoundButton icon="mic" size={88} label="Berätta" onPress={() => setRecording(true)} />
            <RoundButton
              icon="camera"
              size={88}
              color={colors.pink}
              label="Fota"
              onPress={() => setPhotoSheet(true)}
            />
          </View>
        </View>
      ) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book, cover, text],
  );

  if (!book || !id) {
    return <View style={styles.root} />;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 20,
          gap: 14,
        }}
        ListHeaderComponent={header ?? undefined}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <EntryCard entry={item} />}
      />
      <RoundButton
        icon="back"
        size={44}
        color={colors.pinkSoft}
        iconColor={colors.text}
        label="Tillbaka"
        onPress={() => router.back()}
        haptic={false}
        style={[styles.back, { top: insets.top + 8 }]}
      />

      <RecorderOverlay
        bookId={id}
        visible={recording}
        onDone={(uri, ms) => {
          setRecording(false);
          void addAudioEntry(id, uri, ms);
        }}
        onUnavailable={() => setRecording(false)}
      />

      {photoSheet && (
        <Pressable style={styles.sheetBackdrop} onPress={() => setPhotoSheet(false)} accessibilityLabel="Stäng">
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <RoundButton icon="camera" size={92} label="Kamera" onPress={() => void takePhoto('camera')} />
            <RoundButton icon="photo" size={92} color={colors.pink} label="Bilder" onPress={() => void takePhoto('library')} />
          </View>
        </Pressable>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { gap: 22, paddingTop: 52, paddingBottom: 10 },
  coverRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-end' },
  cover: {
    width: 120,
    height: 150,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.pinkSoft,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E9679B',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  initial: { fontFamily: fonts.display, fontSize: 56, color: 'rgba(255,255,255,0.9)' },
  titleBlock: { flex: 1, minWidth: 0, gap: 4, paddingBottom: 6 },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.text },
  author: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.muted },
  composer: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    paddingRight: 64,
    minHeight: 96,
    shadowColor: '#E9679B',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  input: { fontFamily: fonts.body, fontSize: 20, lineHeight: 28, color: colors.text, minHeight: 60, textAlignVertical: 'top' },
  sendBtn: { position: 'absolute', right: 10, bottom: 10 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 28, paddingVertical: 4 },
  back: { position: 'absolute', left: 20 },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(58,36,48,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 32,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
  },
});
