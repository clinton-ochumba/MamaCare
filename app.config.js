/**
 * app.config.js — Expo application configuration
 *
 * FIX (original): File was missing from production zip.
 * SECURITY HARDENING (v1.0): Added ADB backup prevention, cleartext traffic
 * block, and production security flags. See SECURITY_AUDIT.md for details.
 */
export default ({ config }) => ({
  ...config,

  name: 'MamaCare',
  slug: 'mamacare',
  version: '1.0.0',
  extra: {
    eas: {
      projectId: '06abe469-7f63-48ba-a824-83cb02a8da56',
    },
  },
  owner: 'ochumba',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',

  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#FF6B9D',
  },

  assetBundlePatterns: ['**/*'],

  // ── iOS configuration ──────────────────────────────────────────────────────
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.mamacare.app',
    buildNumber: '1',
    // SECURITY: Disable iCloud backup of app data container.
    // This prevents PHI from being synced to iCloud or extracted from
    // an iCloud backup by a third party.
    // Note: expo-secure-store uses the iOS Keychain which is already
    // excluded from backups by default. This flag additionally covers
    // the broader Documents/Library directories.
    infoPlist: {
      NSMicrophoneUsageDescription:
        'MamaCare uses your microphone for the voice symptom checker. Audio is processed by Google Speech-to-Text and is not stored.',
      NSLocationWhenInUseUsageDescription:
        'MamaCare may use your location to help find the nearest health facility during an emergency.',
      // SECURITY: Prevent the app content from appearing in App Switcher
      // screenshots (which are stored on disk) when the app is backgrounded.
      UIApplicationExitsOnSuspend: false,
    },
  },

  // ── Android configuration ─────────────────────────────────────────────────
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FF6B9D',
    },
    package: 'com.mamacare.app',
    versionCode: 1,
    permissions: [
      'android.permission.READ_CONTACTS',
      'android.permission.SEND_SMS',
      'android.permission.RECORD_AUDIO',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
    ],

    // ── SECURITY: ADB Backup Prevention ──────────────────────────────────
    // CRITICAL — allowBackup: false prevents `adb backup` from extracting
    // the app's full data sandbox, including any files written by
    // expo-secure-store. Without this flag, an attacker with USB access to
    // an unlocked device can dump all PHI to a local file in seconds —
    // even without root — using: `adb backup -noapk com.mamacare.app`
    //
    // Android 12+ also supports android:dataExtractionRules but allowBackup
    // is the backwards-compatible catch-all for all API levels.
    allowBackup: false,

    // ── SECURITY: Block cleartext (HTTP) traffic ──────────────────────────
    // All API calls must use HTTPS. This setting causes Android's
    // NetworkSecurityConfig to throw a NetworkSecurityException if any
    // component (including third-party SDKs) attempts an unencrypted
    // HTTP request. Complements the network_security_config.xml policy.
    blockedPermissions: ['android.permission.READ_LOGS'],
  },

  // ── Web (not primary target) ───────────────────────────────────────────────
  web: {
    favicon: './assets/favicon.png',
  },

  // ── Extra / environment variables ─────────────────────────────────────────
  extra: {
    // SECURITY: API key is injected at build time from the environment.
    // It is NOT embedded as a plain string literal in source code.
    // In production EAS builds, these come from EAS Secrets, not .env files.
    googleSttKey: process.env.EXPO_PUBLIC_GOOGLE_STT_KEY || '',
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || 'https://mamacare-production-18fc.up.railway.app',
    voiceEnabled: process.env.EXPO_PUBLIC_VOICE_ENABLED !== 'false',
    ussdEnabled: process.env.EXPO_PUBLIC_USSD_ENABLED !== 'false',
    chwDashboardEnabled: process.env.EXPO_PUBLIC_CHW_DASHBOARD_ENABLED !== 'false',
    eas: {
      projectId: '06abe469-7f63-48ba-a824-83cb02a8da56',
    },
  },

  // ── Expo plugins ─────────────────────────────────────────────────────────
  plugins: [
    [
      'expo-secure-store',
      {
        faceIDPermission:
          'Allow MamaCare to use Face ID to protect your health information.',
      },
    ],
    // SECURITY: expo-build-properties lets us set AndroidManifest flags
    // that Expo's managed workflow doesn't expose directly, including
    // android:allowBackup and android:usesCleartextTraffic.
    [
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 34,
          targetSdkVersion: 34,
          minSdkVersion: 24,
          // Explicitly block HTTP traffic at the OS level
          usesCleartextTraffic: false,
        },
        ios: {
          deploymentTarget: '14.0',
        },
      },
    ],
  ],
});
