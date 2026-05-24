/**
 * __tests__/utils/secureStorage.test.js
 *
 * BUG-002 regression suite — encrypted storage
 * Verifies PHI keys route through SecureStore, non-PHI through AsyncStorage,
 * chunking works for large payloads, and the storage helper API is correct.
 */

// In-memory backing stores
const secureMap = {};
const asyncMap = {};

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (k, v) => { secureMap[k] = v; }),
  getItemAsync: jest.fn(async (k) => secureMap[k] ?? null),
  deleteItemAsync: jest.fn(async (k) => { delete secureMap[k]; }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(async (k, v) => { asyncMap[k] = v; }),
  getItem: jest.fn(async (k) => asyncMap[k] ?? null),
  removeItem: jest.fn(async (k) => { delete asyncMap[k]; }),
  multiRemove: jest.fn(async (keys) => keys.forEach((k) => delete asyncMap[k])),
}));

const SecureStore = require('expo-secure-store');
const AsyncStorage = require('@react-native-async-storage/async-storage');

let secureStorage, storage;
beforeAll(() => {
  const mod = require('../../src/utils/secureStorage');
  secureStorage = mod.secureStorage;
  storage = mod.storage;
});

beforeEach(() => {
  Object.keys(secureMap).forEach((k) => delete secureMap[k]);
  Object.keys(asyncMap).forEach((k) => delete asyncMap[k]);
  jest.clearAllMocks();
  SecureStore.setItemAsync.mockImplementation(async (k, v) => { secureMap[k] = v; });
  SecureStore.getItemAsync.mockImplementation(async (k) => secureMap[k] ?? null);
  SecureStore.deleteItemAsync.mockImplementation(async (k) => { delete secureMap[k]; });
  AsyncStorage.setItem.mockImplementation(async (k, v) => { asyncMap[k] = v; });
  AsyncStorage.getItem.mockImplementation(async (k) => asyncMap[k] ?? null);
  AsyncStorage.removeItem.mockImplementation(async (k) => { delete asyncMap[k]; });
  AsyncStorage.multiRemove.mockImplementation(async (keys) => keys.forEach((k) => delete asyncMap[k]));
});

const PHI_KEYS = ['user_profile','user_consents','emergency_contacts','symptom_history','session_timestamp'];
const PLAIN_KEYS = ['ui_language','theme_preference'];

describe('PHI routing — BUG-002', () => {
  PHI_KEYS.forEach((key) => {
    test(`"${key}" routes through SecureStore`, async () => {
      await secureStorage.setItem(key, '"value"');
      expect(SecureStore.setItemAsync).toHaveBeenCalled();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });
  });

  PLAIN_KEYS.forEach((key) => {
    test(`"${key}" routes through AsyncStorage`, async () => {
      await secureStorage.setItem(key, 'value');
      expect(AsyncStorage.setItem).toHaveBeenCalled();
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    });
  });
});

describe('chunking for large payloads', () => {
  test('large value stored across multiple chunks', async () => {
    const large = JSON.stringify({ data: 'x'.repeat(5000) });
    await secureStorage.setItem('symptom_history', large);
    const countKey = Object.keys(secureMap).find((k) => k.includes('__count'));
    expect(countKey).toBeTruthy();
    expect(parseInt(secureMap[countKey], 10)).toBeGreaterThan(1);
  });

  test('large value round-trips correctly', async () => {
    const large = JSON.stringify({ items: Array(300).fill({ s: 'headache', t: Date.now() }) });
    await secureStorage.setItem('symptom_history', large);
    const retrieved = await secureStorage.getItem('symptom_history');
    expect(retrieved).toBe(large);
  });

  test('small value uses single SecureStore call', async () => {
    await secureStorage.setItem('user_profile', '{"name":"Amina"}');
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
  });
});

describe('storage helper — profile', () => {
  test('saveProfile stores encrypted JSON', async () => {
    await storage.saveProfile({ name: 'Fatuma', lmpDate: '01/09/2025' });
    expect(SecureStore.setItemAsync).toHaveBeenCalled();
    expect(JSON.parse(secureMap['user_profile'])).toMatchObject({ name: 'Fatuma' });
  });

  test('getProfile returns parsed object', async () => {
    secureMap['user_profile'] = JSON.stringify({ name: 'Aisha', lmpDate: '15/08/2025' });
    const p = await storage.getProfile();
    expect(p.name).toBe('Aisha');
  });

  test('getProfile returns null when missing', async () => {
    expect(await storage.getProfile()).toBeNull();
  });

  test('updateProfile merges without overwriting other fields', async () => {
    await storage.saveProfile({ name: 'Grace', lmpDate: '10/07/2025', preferredLanguage: 'en-KE' });
    await storage.updateProfile({ preferredLanguage: 'sw-KE' });
    const p = await storage.getProfile();
    expect(p.name).toBe('Grace');
    expect(p.preferredLanguage).toBe('sw-KE');
  });
});

describe('storage helper — emergency contacts', () => {
  test('saves and retrieves contact array', async () => {
    await storage.saveEmergencyContacts(['+254700000001', '+254700000002']);
    const contacts = await storage.getEmergencyContacts();
    expect(contacts).toHaveLength(2);
  });

  test('returns empty array when not set', async () => {
    expect(await storage.getEmergencyContacts()).toEqual([]);
  });
});

describe('storage helper — symptom history', () => {
  test('newest check is first in array', async () => {
    await storage.saveSymptomCheck({ symptoms: ['fever'], timestamp: '2026-01-01T10:00:00Z' });
    await storage.saveSymptomCheck({ symptoms: ['headache'], timestamp: '2026-01-02T10:00:00Z' });
    const h = await storage.getSymptomHistory();
    expect(h[0].symptoms[0]).toBe('headache');
  });

  test('history capped at 200 entries', async () => {
    for (let i = 0; i < 210; i++) {
      await storage.saveSymptomCheck({ symptoms: ['fever'], timestamp: new Date().toISOString() });
    }
    const h = await storage.getSymptomHistory();
    expect(h.length).toBeLessThanOrEqual(200);
  });
});

describe('exportAllData (BUG-012)', () => {
  test('includes all four data categories', async () => {
    await storage.saveProfile({ name: 'Test User', lmpDate: '01/06/2025' });
    await storage.saveEmergencyContacts(['+254700000001']);
    await storage.saveSymptomCheck({ symptoms: ['fever'], timestamp: new Date().toISOString() });
    await storage.saveConsents({ termsOfService: true });
    const exported = await storage.exportAllData();
    expect(exported.profile.name).toBe('Test User');
    expect(exported.emergencyContacts).toHaveLength(1);
    expect(exported.symptomHistory).toHaveLength(1);
    expect(exported.consentRecord.termsOfService).toBe(true);
    expect(exported.exportDate).toBeTruthy();
  });
});

describe('nukeAllUserData (BUG-012)', () => {
  test('clears all PHI after delete', async () => {
    await storage.saveProfile({ name: 'Delete Me' });
    await storage.saveEmergencyContacts(['+254700000001']);
    await secureStorage.nukeAllUserData();
    expect(await storage.getProfile()).toBeNull();
    expect(await storage.getEmergencyContacts()).toEqual([]);
  });
});
