import type { Session } from '@supabase/supabase-js';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold } from '@expo-google-fonts/nunito';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Login } from '@/components/Login';
import { startOutbox } from '@/lib/outbox';
import { recoverStrandedRecording } from '@/lib/recording';
import { loadState, useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { captureError, info, startTelemetry, telemetrySignedIn } from '@/lib/telemetry';
import { colors } from '@/lib/theme';
import { sweepTranscriptions } from '@/lib/transcribe';

startTelemetry();
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const loaded = useStore((s) => s.loaded);
  // Embedded by the expo-font plugin on iOS; this only matters for the web preview.
  const [fontsReady] = useFonts({ Fredoka_600SemiBold, Fredoka_700Bold, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold });

  useEffect(() => {
    void loadState();
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        info('auth.session', { present: !!data.session, error: error?.message });
        setSession(data.session);
      })
      .catch((err) => {
        captureError('auth.getSession', err);
        setSession(null);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      info('auth.change', { event, present: !!s });
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !loaded) return;
    telemetrySignedIn();
    startOutbox();
    void recoverStrandedRecording();
    sweepTranscriptions();
  }, [session, loaded]);

  useEffect(() => {
    if (session !== undefined && loaded && fontsReady) {
      info('app.ready', { signedIn: !!session });
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [session, loaded, fontsReady]);

  if (session === undefined || !loaded || !fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <ErrorBoundary>
          {session ? (
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: 'slide_from_right',
              }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="book/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="book/[id]" />
            </Stack>
          ) : (
            <Login />
          )}
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
