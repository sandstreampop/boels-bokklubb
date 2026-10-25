import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as Updates from 'expo-updates';
import { AppState, Platform } from 'react-native';

import { writeFatalNow } from './telemetryFiles';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// A bundle without its Supabase config cannot exist: app.config.ts refuses to evaluate without the
// values, so no export, build or dev server is made without them (docs/PRD-changelog.md,
// "Invariant"). If one reaches a phone anyway, this module refuses it: a fatal event is written to
// the telemetry buffer and the module throws at load. For an over-the-air bundle expo-updates then
// treats the launch as a failed update and starts the embedded bundle next time, which passed the
// config check when it was built. There is no placeholder client and no hint on the login screen:
// those only ever displayed the symptom.
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const detail = {
    url_present: SUPABASE_URL.length > 0,
    key_present: SUPABASE_ANON_KEY.length > 0,
    embedded: Updates.isEmbeddedLaunch,
    update: Updates.isEmbeddedLaunch ? null : Updates.updateId,
    runtime: Updates.runtimeVersion,
  };
  writeFatalNow('app.unconfigured_bundle', detail);
  throw new Error(`This bundle has no Supabase config (${JSON.stringify(detail)}). Refusing to start.`);
}

/** One shared family account. The password is the only thing a grown-up ever types. */
export const FAMILY_EMAIL = 'familjen@boelsbokklubb.app';

/** Supabase wants six characters; the family password may be shorter. scripts/setup.mjs applies the same prefix. */
export const serverPassword = (typed: string) => `bokklubb-${typed}`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Keep the session fresh while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
