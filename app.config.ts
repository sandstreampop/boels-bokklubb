// The app config, as code so it can refuse to evaluate without the Supabase values. Every
// `expo export` (which every `eas update` runs), `eas build`, `expo start` and `expo-doctor`
// evaluates this file first, so no bundle, build or dev server can exist without them. Locally the
// values come from the committed .env; on EAS from the project's environment variables, which
// scripts/setup.mjs env keeps in step with .env. See docs/PRD-changelog.md, "Invariant".

import type { ExpoConfig } from 'expo/config';

function required(name: string): string {
  const value = process.env[name] ?? '';
  if (!value.trim()) {
    throw new Error(
      `${name} is empty. The app cannot run without it. Locally it comes from .env (written by ` +
        `scripts/setup.mjs env); on EAS from the environment variables of the environment being ` +
        `built or updated (npx eas-cli env:list --environment production).`,
    );
  }
  return value.trim();
}

const supabaseUrl = required('EXPO_PUBLIC_SUPABASE_URL');
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl)) {
  throw new Error(`EXPO_PUBLIC_SUPABASE_URL must look like https://<ref>.supabase.co, got "${supabaseUrl}"`);
}
const anonKey = required('EXPO_PUBLIC_SUPABASE_ANON_KEY');
if (anonKey.length < 40) {
  throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY is too short to be a Supabase key');
}

const config: ExpoConfig =   {
    "name": "Boels bokklubb",
    "slug": "boels-bokklubb",
    "scheme": "boelsbokklubb",
    "version": "1.2.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "ios": {
      "bundleIdentifier": "com.sandstreampop.boelsbokklubb",
      "buildNumber": "1",
      // Build 9 (docs/PRD-build-9.md §2): the real iPad window instead of a scaled iPhone. The
      // top-level "portrait" stays the iPhone's rule; with a tablet on and requireFullScreen off,
      // prebuild adds UISupportedInterfaceOrientations~ipad with all four orientations, which App
      // Store review requires. Every screen lays itself out from lib/layout.ts.
      "supportsTablet": true,
      "infoPlist": {
        "CFBundleDisplayName": "Boels bokklubb",
        "CFBundleDevelopmentRegion": "sv",
        "CFBundleLocalizations": [
          "sv"
        ],
        "ITSAppUsesNonExemptEncryption": false
      }
    },
    "android": {
      "package": "com.sandstreampop.boelsbokklubb",
      "adaptiveIcon": {
        "backgroundColor": "#FFE3EE",
        "foregroundImage": "./assets/android-icon-foreground.png",
        "backgroundImage": "./assets/android-icon-background.png",
        "monochromeImage": "./assets/android-icon-monochrome.png"
      },
      "permissions": [
        "android.permission.MODIFY_AUDIO_SETTINGS",
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_MICROPHONE"
      ]
    },
    "web": {
      "favicon": "./assets/favicon.png",
      "bundler": "metro",
      "output": "single"
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      [
        "expo-audio",
        {
          "microphonePermission": "Boels bokklubb använder mikrofonen så att Boel kan berätta om sina böcker.",
          "enableBackgroundRecording": true,
          "enableBackgroundPlayback": false
        }
      ],
      [
        "expo-image-picker",
        {
          "cameraPermission": "Boels bokklubb använder kameran så att Boel kan fota sina böcker.",
          "photosPermission": "Boels bokklubb använder bildbiblioteket så att Boel kan välja bilder på sina böcker.",
          "microphonePermission": false
        }
      ],
      [
        "expo-splash-screen",
        {
          "backgroundColor": "#FFE3EE",
          "image": "./assets/splash-icon.png",
          "imageWidth": 180
        }
      ],
      [
        "expo-font",
        {
          "fonts": [
            "./node_modules/@expo-google-fonts/fredoka/600SemiBold/Fredoka_600SemiBold.ttf",
            "./node_modules/@expo-google-fonts/fredoka/700Bold/Fredoka_700Bold.ttf",
            "./node_modules/@expo-google-fonts/nunito/400Regular/Nunito_400Regular.ttf",
            "./node_modules/@expo-google-fonts/nunito/600SemiBold/Nunito_600SemiBold.ttf",
            "./node_modules/@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf"
          ]
        }
      ],
      "expo-asset",
      "expo-sharing"
    ],
    "experiments": {
      "typedRoutes": true
    },
    "extra": {
      "eas": {
        "projectId": "5424f273-be34-41f5-9212-bbbc5382f0bb"
      },
      "router": {
        "asyncRoutes": {
          "web": true
        }
      }
    },
    "owner": "visaros-team",
    "updates": {
      "url": "https://u.expo.dev/5424f273-be34-41f5-9212-bbbc5382f0bb",
      "checkAutomatically": "ON_LOAD",
      "fallbackToCacheTimeout": 3000
    },
    "runtimeVersion": {
      "policy": "fingerprint"
    }
  };

export default config;
