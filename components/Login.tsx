import { useEffect } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { Icon } from './Icon';
import { RainbowBar } from './Rainbow';
import { RoundButton } from './RoundButton';
import { AppActor } from '@/lib/machines/app';
import { colors, fonts, radius } from '@/lib/theme';

/** One field. A grown-up types the family password once per phone. */
export function Login() {
  const app = AppActor.useActorRef();
  const busy = AppActor.useSelector((s) => s.matches('signingIn'));
  const failures = AppActor.useSelector((s) => s.context.loginFailures);
  const password = AppActor.useSelector((s) => s.context.password);
  const canSubmit = AppActor.useSelector((s) => s.can({ type: 'SIGN_IN' }));
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  useEffect(() => {
    if (failures === 0) return;
    shake.set(
      withSequence(
        withTiming(-10, { duration: 50 }),
        withTiming(10, { duration: 50 }),
        withTiming(-6, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failures]);

  const submit = () => app.send({ type: 'SIGN_IN' });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <View style={styles.inner}>
        <Text style={styles.title}>Boels bokklubb</Text>
        <RainbowBar style={{ width: 160 }} />
        <Animated.View style={[styles.field, shakeStyle]}>
          <Icon name="lock" size={22} color={colors.muted} />
          <TextInput
            id="family-password"
            style={styles.input}
            value={password}
            onChangeText={(p) => app.send({ type: 'SET_PASSWORD', password: p })}
            secureTextEntry
            keyboardType="number-pad"
            autoCapitalize="characters"
            autoCorrect={false}
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            editable={!busy}
          />
          <RoundButton icon="send" size={44} onPress={submit} disabled={!canSubmit} label="Logga in" />
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  inner: { width: '100%', maxWidth: 420, paddingHorizontal: 28, alignItems: 'center', gap: 18 },
  title: { fontFamily: fonts.display, fontSize: 40, color: colors.text },
  field: {
    marginTop: 24,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingLeft: 18,
    paddingRight: 8,
    paddingVertical: 8,
    shadowColor: '#E9679B',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  input: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 20, color: colors.text, paddingVertical: 8 },
});
