/**
 * __tests__/integration/criticalFlows.test.js
 *
 * End-to-end flow tests simulating the most safety-critical user journeys.
 * These tests cross module boundaries — they call real utility functions
 * and assert on the combined output, catching regressions that unit tests miss.
 *
 * Flows tested:
 *   1. Full onboarding → consent → storage cycle
 *   2. Symptom check → emergency alert → throttle
 *   3. Account deletion → data wipe
 *   4. PHI logging verification (BUG-008)
 */

import * as SMS from 'expo-sms';
import * as SecureStore from 'expo-secure-store';
import { storage, secureStorage } from '../../src/utils/secureStorage';
import { shouldSendAlert, sendEmergencyAlert } from '../../src/utils/EmergencyAlertManager';
import { t, translations, SUPPORTED_LANGUAGES } from '../../src/utils/languages';

// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: Onboarding → Storage cycle', () => {

  test('complete profile + contacts + consent saves and retrieves correctly', async () => {
    // Step 1: Save profile (as onboarding does)
    const profile = {
      name: 'Grace Adhiambo',
      age: 27,
      phoneNumber: '+254722100200',
      lmpDate: '15/08/2025',
      preferredLanguage: 'luo-KE',
      onboardingCompleted: true,
      createdAt: new Date().toISOString(),
    };
    await storage.saveProfile(profile);

    // Step 2: Save emergency contact
    await storage.saveEmergencyContacts(['+254711300400']);

    // Step 3: Save consents (as ConsentScreen does)
    const consentRecord = {
      termsOfService: true,
      privacyPolicy: true,
      medicalDisclaimer: true,
      dataProcessing: true,
      emergencySharing: true,
      chwAccess: true,
      researchData: false,
      marketing: false,
      consentVersion: '1.0',
      timestamp: new Date().toISOString(),
    };
    await storage.saveConsents(consentRecord);

    // Step 4: Retrieve and verify all data
    const savedProfile = await storage.getProfile();
    const savedContacts = await storage.getEmergencyContacts();
    const savedConsents = await storage.getConsents();

    expect(savedProfile.name).toBe('Grace Adhiambo');
    expect(savedProfile.preferredLanguage).toBe('luo-KE');
    expect(savedContacts).toContain('+254711300400');
    expect(savedConsents.consentVersion).toBe('1.0');
    expect(savedConsents.termsOfService).toBe(true);

    // Step 5: Verify PHI is NOT in AsyncStorage (must be in SecureStore)
    const { AsyncStorage } = require('@react-native-async-storage/async-storage');
    if (AsyncStorage?.getItem) {
      const leaked = await AsyncStorage.getItem('user_profile');
      expect(leaked).toBeNull();
    }
  });

  test('profile update preserves existing fields', async () => {
    await storage.saveProfile({ name: 'Beatrice', phoneNumber: '+254733500600' });
    await storage.updateProfile({ preferredLanguage: 'ki-KE' });
    await storage.updateProfile({ lmpDate: '01/07/2025' });

    const profile = await storage.getProfile();
    expect(profile.name).toBe('Beatrice');
    expect(profile.phoneNumber).toBe('+254733500600');
    expect(profile.preferredLanguage).toBe('ki-KE');
    expect(profile.lmpDate).toBe('01/07/2025');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: Symptom check → Emergency alert flow', () => {

  const profile = { name: 'Winnie Wangari', phoneNumber: '+254744600700' };
  const contacts = ['+254755700800'];
  const motherId = profile.phoneNumber;

  test('first RED alert for new symptom sends SMS and records history', async () => {
    const assessment = {
      level: '🔴',
      priority: 'EMERGENCY',
      message: 'Danger detected.',
      symptoms: ['severe_headache_blurred_vision'],
      sendAlert: true,
    };

    const result = await sendEmergencyAlert({
      assessment,
      profile,
      contacts,
      language: 'sw-KE',
      motherId,
    });

    expect(result.sent).toBe(true);
    expect(SMS.sendSMSAsync).toHaveBeenCalledTimes(1);

    // Alert must be recorded in throttle history
    const raw = await SecureStore.getItemAsync('alert_throttle_history');
    const history = JSON.parse(raw);
    expect(history.some((r) => r.motherId === motherId)).toBe(true);
  });

  test('second alert for same symptom same day is throttled', async () => {
    const assessment = {
      level: '🟡',
      priority: 'URGENT',
      symptoms: ['fever'],
      sendAlert: true,
    };

    // First send succeeds
    await sendEmergencyAlert({ assessment, profile, contacts, language: 'en-KE', motherId: '+254744001001' });

    SMS.sendSMSAsync.mockClear();

    // Second send of same symptom same day is blocked
    const result = await sendEmergencyAlert({ assessment, profile, contacts, language: 'en-KE', motherId: '+254744001001' });
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('throttled');
    expect(SMS.sendSMSAsync).not.toHaveBeenCalled();
  });

  test('convulsions ALWAYS bypass throttle (critical life-threatening symptom)', async () => {
    const convulsionAssessment = {
      level: '🔴',
      priority: 'EMERGENCY',
      symptoms: ['convulsions'],
      sendAlert: true,
    };

    const motherId2 = '+254744002002';

    // Saturate throttle history with 5 convulsion alerts
    const history = Array.from({ length: 5 }, (_, i) => ({
      motherId: motherId2,
      symptomId: 'convulsions',
      timestamp: Date.now() - i * 60_000,
      channel: 'sms',
    }));
    await SecureStore.setItemAsync('alert_throttle_history', JSON.stringify(history));

    SMS.sendSMSAsync.mockClear();

    const result = await sendEmergencyAlert({
      assessment: convulsionAssessment,
      profile,
      contacts,
      language: 'en-KE',
      motherId: motherId2,
    });

    expect(result.sent).toBe(true);
    expect(SMS.sendSMSAsync).toHaveBeenCalledTimes(1);
  });

  test('no contacts → user gets actionable message, no SMS sent', async () => {
    const result = await sendEmergencyAlert({
      assessment: { symptoms: ['fever'], level: '🟡', sendAlert: true },
      profile,
      contacts: [],
      language: 'en-KE',
      motherId: '+254744003003',
    });

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('no_contacts');
    expect(result.userMessage).toBeTruthy();
    expect(SMS.sendSMSAsync).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: Alert language × throttle interaction', () => {

  const contacts = ['+254766800900'];

  test('sending in Swahili and then English for same symptom still throttles correctly', async () => {
    const motherId = '+254744004004';

    // First alert — Swahili
    const r1 = await sendEmergencyAlert({
      assessment: { symptoms: ['severe_swelling'], level: '🟡', sendAlert: true },
      profile: { name: 'Asha', phoneNumber: motherId },
      contacts,
      language: 'sw-KE',
      motherId,
    });
    expect(r1.sent).toBe(true);

    SMS.sendSMSAsync.mockClear();

    // Second alert — English, same symptom, same day → throttled
    const r2 = await sendEmergencyAlert({
      assessment: { symptoms: ['severe_swelling'], level: '🟡', sendAlert: true },
      profile: { name: 'Asha', phoneNumber: motherId },
      contacts,
      language: 'en-KE',
      motherId,
    });
    expect(r2.sent).toBe(false);
    expect(SMS.sendSMSAsync).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: Data export completeness', () => {

  test('exportAllData includes all PHI categories needed for ODPC compliance', async () => {
    await storage.saveProfile({ name: 'Mercy Njoki', phoneNumber: '+254777900000', lmpDate: '10/09/2025' });
    await storage.saveEmergencyContacts(['+254788000001', '+254799000002']);
    await storage.saveSymptomCheck({ symptoms: ['fever'], timestamp: '2026-02-15T10:00:00Z', method: 'voice' });
    await storage.saveSymptomCheck({ symptoms: ['headache'], timestamp: '2026-02-16T14:30:00Z', method: 'text' });
    await storage.saveConsents({ termsOfService: true, consentVersion: '1.0', timestamp: '2026-01-01T00:00:00Z' });

    const exported = await storage.exportAllData();

    // Structural requirements for ODPC data portability
    expect(exported.exportDate).toBeDefined();
    expect(new Date(exported.exportDate)).toBeInstanceOf(Date);
    expect(exported.profile).toBeDefined();
    expect(exported.profile.name).toBe('Mercy Njoki');
    expect(exported.emergencyContacts).toHaveLength(2);
    expect(exported.symptomHistory).toHaveLength(2);
    expect(exported.consentRecord.consentVersion).toBe('1.0');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: Account deletion flow (BUG-012)', () => {

  test('nukeAllUserData removes all PHI and data is unrecoverable', async () => {
    // Set up full user data
    await storage.saveProfile({ name: 'Sarah Kamau', phoneNumber: '+254700200300' });
    await storage.saveEmergencyContacts(['+254711200300']);
    await storage.saveSymptomCheck({ symptoms: ['dizziness'], timestamp: new Date().toISOString() });
    await storage.saveConsents({ termsOfService: true });
    await secureStorage.setItem('app_pin', '1234');
    await secureStorage.setItem('session_timestamp', String(Date.now()));

    // Verify data exists
    expect(await storage.getProfile()).not.toBeNull();
    expect(await storage.getEmergencyContacts()).toHaveLength(1);

    // Execute nuke
    await secureStorage.nukeAllUserData();

    // Verify all PHI is gone
    expect(await storage.getProfile()).toBeNull();
    expect(await storage.getEmergencyContacts()).toEqual([]);
    expect(await storage.getSymptomHistory()).toEqual([]);
    expect(await storage.getConsents()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: BUG-008 — PHI not logged to console', () => {

  test('sendEmergencyAlert does not log phone numbers to console.error', async () => {
    await sendEmergencyAlert({
      assessment: { symptoms: ['fever'], level: '🟡', sendAlert: true },
      profile: { name: 'Test User', phoneNumber: '+254700SECRET' },
      contacts: ['+254711SECRET2'],
      language: 'en-KE',
      motherId: '+254700SECRET',
    });

    // console.error must not have been called with any PHI
    const errorCalls = console.error.mock?.calls || [];
    errorCalls.forEach((args) => {
      const callStr = JSON.stringify(args);
      expect(callStr).not.toContain('+254700SECRET');
      expect(callStr).not.toContain('+254711SECRET2');
    });
  });

  test('storage.getProfile does not log raw profile to console.warn on error', async () => {
    // This is a silent test — we just verify no PHI strings appear in warn calls
    await storage.saveProfile({ name: 'PrivateName', phoneNumber: '+254700PRIV' });
    await storage.getProfile();

    const warnCalls = console.warn.mock?.calls || [];
    warnCalls.forEach((args) => {
      const str = JSON.stringify(args);
      expect(str).not.toContain('+254700PRIV');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: All 8 languages produce non-empty UI strings', () => {

  const keySamples = ['home', 'symptomChecker', 'emergency', 'tapAndSpeak', 'emergencyContacts'];

  test.each(SUPPORTED_LANGUAGES)(
    '$code ($name) returns non-empty strings for all sampled UI keys',
    ({ code }) => {
      const empties = keySamples.filter((key) => {
        const val = t(key, code);
        return !val || val === key;
      });
      expect(empties).toHaveLength(0);
    }
  );
});
