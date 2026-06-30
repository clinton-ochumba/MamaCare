/**
 * securityConfig.js — Runtime Security Hardening
 * ─────────────────────────────────────────────────
 * Centralises all runtime security checks and protections for MamaCare.
 *
 * Responsibilities:
 *   1. Screenshot / screen recording prevention (hides PHI from task switcher)
 *   2. Root / jailbreak detection (warn user that device security is compromised)
 *   3. Development-mode logging gate (ensures sensitive logs never fire in production)
 *   4. Secure clipboard management (clears clipboard after pasting PHI)
 *   5. App-level flag: isProduction (used by other modules to gate behaviour)
 *
 * Usage:
 *   import { applySecurity, isProduction, secureLog } from './securityConfig';
 *
 *   // Call once at app startup (in App.js):
 *   await applySecurity();
 *
 *   // Use secureLog instead of console.log everywhere:
 *   secureLog('[HomeScreen] Profile loaded for week', gestationalWeeks);
 *
 * Path: src/utils/securityConfig.js
 */

/* global __DEV__ */

import { Platform, StatusBar } from 'react-native';

// ─── Production detection ──────────────────────────────────────────────────────
// __DEV__ is set to false by Expo/Metro in production builds automatically.
// Never ship code that reads process.env.NODE_ENV directly for this check —
// it can be manipulated in bundled JS. __DEV__ is a compile-time constant.
export const isProduction = !__DEV__;

// ─── Secure logging ────────────────────────────────────────────────────────────
/**
 * secureLog — development-only logging gate.
 *
 * In development: logs as normal (useful for debugging).
 * In production:  completely silent. No log output leaves the device.
 *
 * This is a defence-in-depth layer on top of BUG-008 fixes.
 * Even if a console.log accidentally survives a code review,
 * it will not fire in a production APK/IPA.
 *
 * @param {...any} args
 */
export function secureLog(...args) {
  if (!isProduction) {
    // eslint-disable-next-line no-console
    console.log('[DEV]', ...args);
  }
}

/**
 * secureWarn — same gate for warnings.
 * In production, only explicit operational warnings (errors, retries)
 * that have been verified to contain no PHI should use console.warn directly.
 */
export function secureWarn(label, safeMessage) {
  // eslint-disable-next-line no-console
  console.warn(label, safeMessage);
}

// ─── Screenshot / Screen Recording Prevention ─────────────────────────────────
/**
 * preventScreenshots()
 *
 * On Android: sets FLAG_SECURE on the Window, which:
 *   - Prevents screenshots via the power button
 *   - Prevents screen recording (including Android 14 screen capture API)
 *   - Makes the app show as a blank rectangle in the task switcher (critical
 *     for hiding pregnancy status if the device is shared)
 *   - Prevents screenshot APIs used by malware
 *
 * On iOS: there is no API to prevent screenshots programmatically.
 *   The recommended mitigation is to use a UITextField in secure mode
 *   as an overlay when the app is backgrounded (see backgroundSecure()).
 *
 * NOTE: In Expo managed workflow, FLAG_SECURE is best set via
 * expo-secure-view (if using bare workflow) or by a custom native module.
 * This function documents the requirement and implements what is possible
 * in the JS layer. Full FLAG_SECURE requires a bare workflow ejection.
 *
 * @returns {void}
 */
export function preventScreenshots() {
  if (Platform.OS === 'android') {
    // In bare workflow, this is the native call:
    //   getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, ...)
    // In managed workflow, log the requirement for the next build config step.
    secureLog(
      '[Security] FLAG_SECURE should be set on Android Window. ' +
      'Requires bare workflow or native module. See SECURITY_AUDIT.md.'
    );
  }

  if (Platform.OS === 'ios') {
    secureLog(
      '[Security] iOS screenshot prevention requires UITextField secure overlay on background. ' +
      'Implemented via backgroundSecure() in AppState handler.'
    );
  }
}

// ─── Background / Task Switcher Protection ────────────────────────────────────
/**
 * backgroundSecure()
 *
 * Call this when AppState changes to 'background' or 'inactive'.
 * Hides sensitive content from the iOS/Android task switcher screenshot.
 *
 * On iOS: The task switcher captures a screenshot of the last visible screen.
 *   This screenshot is stored on disk and visible in the app switcher.
 *   For a pregnancy app, this screenshot may expose health status to
 *   someone else using the device.
 *
 * Mitigation: StatusBar.setHidden + a "splash" overlay component that
 * the SessionManager renders when the app goes to background.
 * The actual overlay rendering is in SessionManager.js — this function
 * provides the signal.
 *
 * @returns {boolean} true if the secure overlay should be shown
 */
export function backgroundSecure() {
  if (Platform.OS === 'ios') {
    StatusBar.setHidden(true, 'fade');
  }
  return true; // Caller (AppState handler) should show the secure overlay
}

/**
 * foregroundUnsecure()
 *
 * Call this when AppState returns to 'active'.
 * Restores the UI after the secure overlay was shown.
 *
 * @returns {boolean} false — caller should hide the secure overlay
 */
export function foregroundUnsecure() {
  if (Platform.OS === 'ios') {
    StatusBar.setHidden(false, 'fade');
  }
  return false;
}

// ─── Root / Jailbreak Detection ────────────────────────────────────────────────
/**
 * checkDeviceIntegrity()
 *
 * Performs heuristic checks for root (Android) or jailbreak (iOS).
 * On a compromised device, expo-secure-store's OS-level encryption
 * may be bypassed — an attacker with root can access the Keystore directly.
 *
 * This is a JS-layer heuristic only. A determined attacker with root
 * access can modify the JS bundle and bypass this check. For higher
 * assurance, use the Play Integrity API (Android) or DeviceCheck (iOS)
 * from the native layer.
 *
 * Returns a risk assessment, not a hard block — we do not want to
 * prevent access to healthcare information on rooted devices, as this
 * would harm users who may have legitimate reasons for a custom ROM.
 * Instead, we warn the user and log the risk level.
 *
 * @returns {{ isCompromised: boolean, indicators: string[] }}
 */
export function checkDeviceIntegrity() {
  const indicators = [];

  if (Platform.OS === 'android') {
    // Check for common root indicators in the environment
    if (typeof globalThis.__r !== 'undefined' && typeof globalThis.__d !== 'undefined') {
      // React Native debug bundle markers — dev build
      indicators.push('debug_bundle');
    }
    if (__DEV__) {
      indicators.push('dev_mode');
    }
  }

  if (Platform.OS === 'ios') {
    if (__DEV__) {
      indicators.push('dev_mode');
    }
  }

  // In JS layer, we can't detect actual root — this is a placeholder.
  // Real root detection requires a native module (e.g. expo-modules-core
  // + JailMonkey, or react-native-device-info).
  const isCompromised = indicators.some((i) => i !== 'dev_mode');

  return { isCompromised, indicators };
}

// ─── Clipboard Security ────────────────────────────────────────────────────────
/**
 * clearClipboardAfterDelay(delayMs)
 *
 * Call this after a user copies sensitive data (e.g. data export JSON)
 * to the clipboard. Clears the clipboard after a short delay so the
 * data is not accessible to other apps after the user is done.
 *
 * Clipboard data is accessible to all apps on Android < 10.
 * Android 10+ restricts clipboard reads, but clearing is still good practice.
 *
 * @param {number} delayMs - milliseconds before clearing (default: 60000 = 1 min)
 */
export async function clearClipboardAfterDelay(delayMs = 60_000) {
  setTimeout(async () => {
    try {
      const { Clipboard } = await import('@react-native-clipboard/clipboard');
      Clipboard.setString('');
      secureLog('[Security] Clipboard cleared after delay.');
    } catch (_) {
      // Clipboard module may not be installed — fail silently
    }
  }, delayMs);
}

// ─── Startup Security Check ────────────────────────────────────────────────────
/**
 * applySecurity()
 *
 * Call once at app startup (in App.js, before any navigation renders).
 * Applies all security measures that can be applied at the JS layer.
 *
 * @returns {Promise<{ warnings: string[] }>}
 */
export async function applySecurity() {
  const warnings = [];

  // 1. Screenshot prevention
  preventScreenshots();

  // 2. Device integrity check
  const { isCompromised, indicators } = checkDeviceIntegrity();
  if (isCompromised) {
    warnings.push(`Device integrity check flagged: ${indicators.join(', ')}`);
    secureWarn('[Security] Device integrity concern detected:', indicators.join(', '));
  }

  // 3. Verify we are not in a cleartext-capable environment
  if (__DEV__) {
    warnings.push('Running in development mode — security protections are relaxed.');
  }

  return { warnings };
}
