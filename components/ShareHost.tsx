import { useSelector } from '@xstate/react';
import { StyleSheet, View } from 'react-native';

import { ShareCard } from './ShareCard';
import { shareActor } from '@/lib/machines/share';

/** Mounted once at the root: renders the card the share machine asked for, off screen, until it is captured. */
export function ShareHost() {
  const target = useSelector(shareActor, (s) => s.context.target);
  const rendering = useSelector(shareActor, (s) => s.matches('rendering') || s.matches('capturing'));
  if (!target || !rendering) return null;
  return (
    <View style={styles.offscreen} pointerEvents="none">
      <ShareCard target={target} onReady={(capture) => shareActor.send({ type: 'READY', capture })} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Far outside the window but still in the view tree, which is what the capture needs.
  offscreen: { position: 'absolute', left: -3000, top: 0 },
});
