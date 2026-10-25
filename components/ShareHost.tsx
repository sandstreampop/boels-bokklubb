import { useSelector } from '@xstate/react';
import { Image } from 'expo-image';
import { Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoundButton } from './RoundButton';
import { ShareCard } from './ShareCard';
import { shareActor } from '@/lib/machines/share';
import { colors, fonts, radius } from '@/lib/theme';

/**
 * Mounted once at the root. While a card is being made it renders off screen for the capture;
 * then a sheet shows the picture with Share and Cancel, the iOS way of confirming before sending.
 */
export function ShareHost() {
  const target = useSelector(shareActor, (s) => s.context.target);
  const uri = useSelector(shareActor, (s) => s.context.uri);
  const rendering = useSelector(shareActor, (s) => s.matches('rendering') || s.matches('capturing'));
  const previewing = useSelector(shareActor, (s) => s.matches('previewing') || s.matches('sharing'));
  const sharing = useSelector(shareActor, (s) => s.matches('sharing'));
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const imageW = Math.min(width - 48, 420);

  return (
    <>
      {target && rendering && (
        <View style={styles.offscreen} pointerEvents="none">
          <ShareCard target={target} onReady={(capture) => shareActor.send({ type: 'READY', capture })} />
        </View>
      )}
      <Modal visible={previewing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => shareActor.send({ type: 'CANCEL' })}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <Text style={styles.title}>Dela</Text>
          <View style={styles.imageWrap}>
            {uri && <Image source={{ uri }} style={{ width: imageW, height: imageW * 1.25, borderRadius: radius.md }} contentFit="contain" />}
          </View>
          <View style={styles.bar}>
            <RoundButton icon="close" size={56} color={colors.pinkSoft} iconColor={colors.text} label="Avbryt" onPress={() => shareActor.send({ type: 'CANCEL' })} haptic={false} sound={null} />
            <RoundButton icon="share" size={76} label="Dela" onPress={() => shareActor.send({ type: 'CONFIRM' })} disabled={sharing} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Far outside the window but still in the view tree, which is what the capture needs.
  offscreen: { position: 'absolute', left: -3000, top: 0 },
  sheet: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', paddingTop: 18, paddingHorizontal: 24, gap: 16 },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.text },
  imageWrap: {
    flex: 1,
    justifyContent: 'center',
    shadowColor: '#E9679B',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  bar: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8 },
});
