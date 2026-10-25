import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold } from '@expo-google-fonts/nunito';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Login } from '@/components/Login';
import { ShareHost } from '@/components/ShareHost';
import { TouchWatcher } from '@/components/TouchWatcher';
import { Unicorn } from '@/components/Unicorn';
import { AppActor } from '@/lib/machines/app';
import { unicornMoment } from '@/lib/machines/unicorn';
import { startSounds } from '@/lib/sounds';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { info, startTelemetry } from '@/lib/telemetry';
import { colors } from '@/lib/theme';

startTelemetry();
startSounds();
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <AppActor.Provider>
      <Root />
    </AppActor.Provider>
  );
}

function Root() {
  const app = AppActor.useActorRef();
  const phase = AppActor.useSelector((s) => s.value);
  const loaded = useStore((s) => s.loaded);
  // Embedded by the expo-font plugin on iOS; this only matters for the web preview.
  const [fontsReady] = useFonts({ Fredoka_600SemiBold, Fredoka_700Bold, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      info('auth.change', { event, present: !!session });
      // The boot step reads the initial session itself; later changes drive the machine.
      if (event !== 'INITIAL_SESSION') app.send({ type: 'SESSION_CHANGED', session, event });
    });
    return () => sub.subscription.unsubscribe();
  }, [app]);

  const ready = phase !== 'booting' && loaded && fontsReady;
  const signedIn = phase === 'signedIn';

  useEffect(() => {
    if (!ready) return;
    info('app.ready', { signedIn });
    SplashScreen.hideAsync().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Set piece 1 begins: the unicorn peeks up once the signed-in screens are on stage (after a
  // login, that is the moment the family password goes through).
  useEffect(() => {
    if (ready && signedIn) unicornMoment('launch');
  }, [ready, signedIn]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <ErrorBoundary>
          {signedIn ? (
            <>
              <TouchWatcher>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.bg },
                    animation: 'slide_from_right',
                  }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="book/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="book/[id]" />
                  <Stack.Screen name="stats" />
                </Stack>
              </TouchWatcher>
              <Unicorn />
              <ShareHost />
            </>
          ) : (
            <Login />
          )}
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
