import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';

import { Icon, type IconName } from './Icon';
import { springs } from '@/lib/motion';
import { colors, rainbow } from '@/lib/theme';

export type WizardStep = { icon: IconName; label: string };

type Props = { steps: WizardStep[]; current: number };

// Four steps, a back button and its mirror must fit a 375-point phone: 4 dots plus 3 lines is 236.
const DOT = 40;
const DOT_ON = 50;

/**
 * Where she is in a wizard: one circle per step joined by a line, the current one big and deep
 * pink, the ones behind it ticked in rainbow colours, the ones ahead pale. No words.
 */
export function WizardProgress({ steps, current }: Props) {
  return (
    <View style={styles.row} accessibilityRole="progressbar" accessibilityLabel={`Steg ${current + 1} av ${steps.length}`}>
      {steps.map((step, i) => (
        <View key={step.label} style={styles.item}>
          {i > 0 && <View style={[styles.line, { backgroundColor: i <= current ? colors.pinkDeep : colors.line }]} />}
          <Dot step={step} index={i} current={current} />
        </View>
      ))}
    </View>
  );
}

function Dot({ step, index, current }: { step: WizardStep; index: number; current: number }) {
  const on = index === current;
  const done = index < current;
  const size = useDerivedValue(() => withSpring(on ? DOT_ON : DOT, springs.in));
  const anim = useAnimatedStyle(() => ({ width: size.value, height: size.value, borderRadius: size.value / 2 }));
  const bg = on ? colors.pinkDeep : done ? rainbow[(index * 2) % rainbow.length] : colors.pinkSoft;
  const fg = on ? colors.white : done ? colors.text : colors.pink;
  return (
    <Animated.View style={[styles.dot, { backgroundColor: bg }, on && styles.dotOn, anim]} accessibilityLabel={step.label}>
      <Icon name={done ? 'check' : step.icon} size={on ? 26 : 20} color={fg} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: DOT_ON },
  item: { flexDirection: 'row', alignItems: 'center' },
  line: { width: 14, height: 4, borderRadius: 2, marginHorizontal: 4 },
  dot: { alignItems: 'center', justifyContent: 'center' },
  dotOn: { shadowColor: '#E9679B', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
});
