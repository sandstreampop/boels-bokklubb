import type { Session } from '@supabase/supabase-js';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Login } from '@/components/Login';
import { startOutbox } from '@/lib/outbox';
import { recoverStrandedRecording } from '@/lib/recording';
import { loadState, useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { sweepTranscriptions } from '@/lib/transcribe';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const loaded = useStore((s) => s.loaded);

  useEffect(() => {
    void loadState();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !loaded) return;
    startOutbox();
    void recoverStrandedRecording();
    sweepTranscriptions();
  }, [session, loaded]);

  useEffect(() => {
    if (session !== undefined && loaded) SplashScreen.hideAsync().catch(() => {});
  }, [session, loaded]);

  if (session === undefined || !loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
