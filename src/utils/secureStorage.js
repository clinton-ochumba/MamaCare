/**
 * secureStorage.js — Encrypted Storage Utility
 * ─────────────────────────────────────────────
 * BUG-002 FIX: Replaces plaintext AsyncStorage with expo-secure-store for
 * all sensitive health data (profile, symptoms, consents, emergency contacts).
 *
 * Non-sensitive keys (e.g. UI preferences, language) still use AsyncStorage
 * for performance. Sensitive keys are encrypted at rest by the OS keychain.
 *
 * Usage:
 *   import { secureStorage } from '../utils/secureStorage';
 *   await secureStorage.setItem('user_profile', JSON.stringify(profile));
 *   const raw = await secureStorage.getItem('user_profile');
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Keys that contain Personal Health Information → always encrypted
// FIX: Added missing sensitive keys: alert_throttle_history (contains motherId + symptom records),
//      chw_visit_queue (contains motherId), app_pin (security credential),
//      account_deletion_scheduled (user account state).
const SENSITIVE_KEYS = [
  'user_profile',
  'user_consents',
  'emergency_contacts',
  'symptom_history',
  'weekly_progress',
  'alreadyLaunched',           // contains onboarding state
  'session_timestamp',
  'alert_throttle_history',    // FIX: contains motherId + symptom history — must be encrypted
  'chw_visit_queue',           // FIX: contains motherId — must be encrypted
  'app_pin',                   // FIX: security credential — must be in SecureStore
  'account_deletion_scheduled',// FIX: sensitive account state
];

// Keys safe to store unencrypted (non-PHI UI state)
const PLAIN_KEYS = [
  'ui_language',
  'theme_preference',
];

function isSensitive(key) {
  return SENSITIVE_KEYS.some((k) => key.startsWith(k));
}

/**
 * expo-secure-store has a 2048-byte value limit per key.
 * For larger payloads (symptom history arrays), we chunk into
 * sequentially numbered keys: symptom_history_0, symptom_history_1, …
 */
const CHUNK_SIZE = 1800; // bytes, conservative to stay under limit

function chunkString(str) {
  const chunks = [];
  for (let i = 0; i < str.length; i += CHUNK_SIZE) {
    chunks.push(str.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

async function setChunked(key, value) {
  const chunks = chunkString(value);
  // Store chunk count
  await SecureStore.setItemAsync(`${key}__count`, String(chunks.length));
  // Store each chunk
  await Promise.all(
    chunks.map((chunk, i) => SecureStore.setItemAsync(`${key}__${i}`, chunk))
  );
}

async function getChunked(key) {
  const countStr = await SecureStore.getItemAsync(`${key}__count`);
  if (!countStr) {return null;}
  const count = parseInt(countStr, 10);
  const chunks = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      SecureStore.getItemAsync(`${key}__${i}`)
    )
  );
  if (chunks.some((c) => c === null)) {return null;}
  return chunks.join('');
}

async function deleteChunked(key) {
  const countStr = await SecureStore.getItemAsync(`${key}__count`);
  if (!countStr) {return;}
  const count = parseInt(countStr, 10);
  await Promise.all([
    SecureStore.deleteItemAsync(`${key}__count`),
    ...Array.from({ length: count }, (_, i) =>
      SecureStore.deleteItemAsync(`${key}__${i}`)
    ),
  ]);
}

export const secureStorage = {
  async setItem(key, value) {
    try {
      if (isSensitive(key)) {
        if (value.length > CHUNK_SIZE) {
          await setChunked(key, value);
        } else {
          await SecureStore.setItemAsync(key, value);
        }
      } else {
        await AsyncStorage.setItem(key, value);
      }
    } catch (err) {
      // BUG-008: never log raw values containing PHI
      console.warn('[secureStorage] setItem failed for key:', key);
      throw err;
    }
  },

  async getItem(key) {
    try {
      if (isSensitive(key)) {
        // Try chunked first, then single
        const chunked = await getChunked(key);
        if (chunked !== null) {return chunked;}
        return await SecureStore.getItemAsync(key);
      } else {
        return await AsyncStorage.getItem(key);
      }
    } catch (err) {
      console.warn('[secureStorage] getItem failed for key:', key);
      return null;
    }
  },

  async removeItem(key) {
    try {
      if (isSensitive(key)) {
        await deleteChunked(key);
        // Also try single-key delete in case it was stored that way
          try { await SecureStore.deleteItemAsync(key); } catch (_) { /* ignore delete error */ }
      } else {
        await AsyncStorage.removeItem(key);
      }
    } catch (err) {
      console.warn('[secureStorage] removeItem failed for key:', key);
    }
  },

  /**
   * Wipe ALL user data — used by account deletion flow (BUG-012).
   * Grace-period callers should schedule this 30 days out.
   */
  async nukeAllUserData() {
    const allSensitiveKeys = [...SENSITIVE_KEYS];
    await Promise.all(allSensitiveKeys.map((k) => this.removeItem(k)));
    // Also clear AsyncStorage non-sensitive prefs
    await AsyncStorage.multiRemove(PLAIN_KEYS);
  },
};

/**
 * Drop-in storage helper that mirrors the original storage.js API
 * but routes through secureStorage under the hood.
 */
export const storage = {
  async saveProfile(profile) {
    await secureStorage.setItem('user_profile', JSON.stringify(profile));
  },

  async getProfile() {
    const raw = await secureStorage.getItem('user_profile');
    return raw ? JSON.parse(raw) : null;
  },

  async updateProfile(partial) {
    const existing = await this.getProfile() || {};
    await this.saveProfile({ ...existing, ...partial });
  },

  async saveEmergencyContacts(contacts) {
    await secureStorage.setItem('emergency_contacts', JSON.stringify(contacts));
  },

  async getEmergencyContacts() {
    const raw = await secureStorage.getItem('emergency_contacts');
    return raw ? JSON.parse(raw) : [];
  },

  async saveSymptomCheck(check) {
    const existing = await this.getSymptomHistory();
    existing.unshift(check); // newest first
    // Keep last 200 entries max
    const trimmed = existing.slice(0, 200);
    await secureStorage.setItem('symptom_history', JSON.stringify(trimmed));
  },

  async getSymptomHistory() {
    const raw = await secureStorage.getItem('symptom_history');
    return raw ? JSON.parse(raw) : [];
  },

  async saveConsents(consentRecord) {
    await secureStorage.setItem('user_consents', JSON.stringify(consentRecord));
  },

  async getConsents() {
    const raw = await secureStorage.getItem('user_consents');
    return raw ? JSON.parse(raw) : null;
  },

  async exportAllData() {
    const profile = await this.getProfile();
    const contacts = await this.getEmergencyContacts();
    const history = await this.getSymptomHistory();
    const consents = await this.getConsents();
    return {
      exportDate: new Date().toISOString(),
      profile,
      emergencyContacts: contacts,
      symptomHistory: history,
      consentRecord: consents,
    };
  },
};
