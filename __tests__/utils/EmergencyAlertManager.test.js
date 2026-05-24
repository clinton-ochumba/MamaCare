/**
 * __tests__/utils/EmergencyAlertManager.test.js
 *
 * Regression suite covering:
 *   BUG-005 — empty emergency contacts guard
 *   BUG-006 — shouldSendAlert() throttle logic
 *   BUG-007 — translated SMS templates in all 8 languages
 *
 * Architecture note (v1.1):
 *   sendEmergencyAlert() now calls the backend /api/emergency-alert endpoint
 *   (Africa's Talking server-side) as its PRIMARY path, and falls back to
 *   expo-sms (native SMS composer) only when the server is unreachable.
 *   Tests mock global.fetch for the primary path and expo-sms for fallback.
 */

import * as SMS from 'expo-sms';
import * as SecureStore from 'expo-secure-store';
import { shouldSendAlert, sendEmergencyAlert } from '../../src/utils/EmergencyAlertManager';

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeAssessment = (overrides = {}) => ({
  level: '🔴',
  priority: 'EMERGENCY',
  message: 'Danger signs detected.',
  action: 'Go to hospital NOW.',
  sendAlert: true,
  symptoms: ['severe_headache_blurred_vision'],
  ...overrides,
});

const baseProfile  = { name: 'Amina Ochieng', phoneNumber: '+254722000001' };
const baseContacts = ['+254711000002', '+254733000003'];
const motherId     = baseProfile.phoneNumber;

// Mock global.fetch (primary AT path)
const mockFetch = jest.fn();
beforeEach(() => {
  global.fetch = mockFetch;
  // Default: server responds successfully
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      sent: true, channel: 'africastalking', recipientCount: 2,
    }),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('shouldSendAlert — BUG-006 throttle logic', () => {

  test('returns send:true for a new symptom with no history', async () => {
    const result = await shouldSendAlert('fever', 'YELLOW', motherId);
    expect(result.send).toBe(true);
  });

  test('ALWAYS sends for convulsions + RED regardless of throttle', async () => {
    const history = Array.from({ length: 5 }, (_, i) => ({
      motherId, symptomId: 'convulsions',
      timestamp: Date.now() - i * 3600_000, channel: 'sms', riskLevel: '🔴',
    }));
    await SecureStore.setItemAsync('alert_throttle_history', JSON.stringify(history));
    const result = await shouldSendAlert('convulsions', '🔴', motherId);
    expect(result.send).toBe(true);
  });

  test('ALWAYS sends for severe_bleeding + RED', async () => {
    const result = await shouldSendAlert('severe_bleeding', '🔴', motherId);
    expect(result.send).toBe(true);
  });

  test('ALWAYS sends for no_fetal_movement_24hrs + RED', async () => {
    const result = await shouldSendAlert('no_fetal_movement_24hrs', '🔴', motherId);
    expect(result.send).toBe(true);
  });

  test('throttles same symptom same day for non-critical symptoms', async () => {
    const history = [{
      motherId, symptomId: 'fever',
      timestamp: new Date().setHours(0, 30, 0, 0), // today
      channel: 'sms', riskLevel: '🟠',
    }];
    await SecureStore.setItemAsync('alert_throttle_history', JSON.stringify(history));
    const result = await shouldSendAlert('fever', '🟠', motherId);
    expect(result.send).toBe(false);
    expect(result.reason).toBe('throttled');
  });

  test('escalates to CHW after same symptom 3+ times in 7 days', async () => {
    const now = Date.now();
    const history = [1, 2, 3].map(i => ({
      motherId, symptomId: 'fever',
      timestamp: now - i * 86400_000, // spread over 3 days
      channel: 'sms', riskLevel: '🟠',
    }));
    await SecureStore.setItemAsync('alert_throttle_history', JSON.stringify(history));
    const result = await shouldSendAlert('fever', '🟠', motherId);
    expect(result.send).toBe(false);
    expect(result.reason).toBe('escalate_chw');
  });

  test('different symptom IDs are tracked independently', async () => {
    const history = [{
      motherId, symptomId: 'fever',
      timestamp: new Date().setHours(0, 30, 0, 0),
      channel: 'sms', riskLevel: '🟠',
    }];
    await SecureStore.setItemAsync('alert_throttle_history', JSON.stringify(history));
    // Different symptom — should still send
    const result = await shouldSendAlert('severe_swelling', '🟠', motherId);
    expect(result.send).toBe(true);
  });

  test('different motherIds are tracked independently', async () => {
    const history = [{
      motherId: '+254799999999', symptomId: 'fever',
      timestamp: new Date().setHours(0, 30, 0, 0),
      channel: 'sms', riskLevel: '🟠',
    }];
    await SecureStore.setItemAsync('alert_throttle_history', JSON.stringify(history));
    // Different mother — should still send
    const result = await shouldSendAlert('fever', '🟠', motherId);
    expect(result.send).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('sendEmergencyAlert — BUG-005 empty contact guard', () => {

  test('returns no_contacts when contacts array is empty', async () => {
    const result = await sendEmergencyAlert({
      assessment: makeAssessment(),
      profile: baseProfile,
      contacts: [],
      language: 'en-KE',
      motherId,
    });
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('no_contacts');
    expect(result.userMessage).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('returns invalid_contacts when all contacts are too short', async () => {
    const result = await sendEmergencyAlert({
      assessment: makeAssessment(),
      profile: baseProfile,
      contacts: ['123', '', 'abc'],
      language: 'en-KE',
      motherId: '+254700001111',
    });
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('invalid_contacts');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('sends SMS when valid contacts are provided (via server)', async () => {
    const result = await sendEmergencyAlert({
      assessment: makeAssessment(),
      profile: baseProfile,
      contacts: baseContacts,
      language: 'en-KE',
      motherId: '+254700002222',
    });
    expect(result.sent).toBe(true);
    expect(result.channel).toBe('africastalking');
    expect(result.automatic).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('filters out blank entries from mixed contacts array', async () => {
    const result = await sendEmergencyAlert({
      assessment: makeAssessment(),
      profile: baseProfile,
      contacts: ['+254711000002', '', '+254733000003'],
      language: 'en-KE',
      motherId: '+254700003333',
    });
    expect(result.sent).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contacts).toHaveLength(2);
    expect(body.contacts).not.toContain('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('sendEmergencyAlert — BUG-007 language-specific SMS', () => {

  test('sends participant name to server in request body', async () => {
    await sendEmergencyAlert({
      assessment: makeAssessment(),
      profile: baseProfile,
      contacts: baseContacts,
      language: 'en-KE',
      motherId: '+254700004444',
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.participantName).toBe('Amina Ochieng');
  });

  test('sends correct language code to server', async () => {
    await sendEmergencyAlert({
      assessment: makeAssessment(),
      profile: baseProfile,
      contacts: baseContacts,
      language: 'sw-KE',
      motherId: '+254700005555',
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.language).toBe('sw-KE');
  });

  test('falls back to expo-sms when server returns non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) });
    const result = await sendEmergencyAlert({
      assessment: makeAssessment(),
      profile: baseProfile,
      contacts: baseContacts,
      language: 'en-KE',
      motherId: '+254700006666',
    });
    expect(result.sent).toBe(true);
    expect(result.fallback).toBe(true);
    expect(SMS.sendSMSAsync).toHaveBeenCalledTimes(1);
  });

  test('falls back to English template for unknown language code', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) });
    const result = await sendEmergencyAlert({
      assessment: makeAssessment(),
      profile: baseProfile,
      contacts: baseContacts,
      language: 'xx-XX', // unknown language
      motherId: '+254700007777',
    });
    // Fallback SMS should still have been attempted
    expect(result.sent).toBe(true);
    expect(SMS.sendSMSAsync).toHaveBeenCalledTimes(1);
    const [, smsBody] = SMS.sendSMSAsync.mock.calls[0];
    // English template contains these phrases
    expect(smsBody).toContain('EMERGENCY');
    expect(smsBody).toContain('999');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('sendEmergencyAlert — throttle integration', () => {

  test('respects throttle — does not hit server for throttled symptom', async () => {
    const throttledMother = '+254700008888';
    const history = [{
      motherId: throttledMother, symptomId: 'fever',
      timestamp: new Date().setHours(0, 30, 0, 0),
      channel: 'africastalking', riskLevel: '🟠',
    }];
    await SecureStore.setItemAsync('alert_throttle_history', JSON.stringify(history));

    const result = await sendEmergencyAlert({
      assessment: makeAssessment({ symptoms: ['fever'], level: '🟠' }),
      profile: baseProfile,
      contacts: baseContacts,
      language: 'en-KE',
      motherId: throttledMother,
    });
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('throttled');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('records alert in throttle history after successful server send', async () => {
    const freshMother = '+254700009999';
    await sendEmergencyAlert({
      assessment: makeAssessment({ symptoms: ['persistent_vomiting'], level: '🟠' }),
      profile: baseProfile,
      contacts: baseContacts,
      language: 'en-KE',
      motherId: freshMother,
    });

    const raw = await SecureStore.getItemAsync('alert_throttle_history');
    const history = JSON.parse(raw);
    const recorded = history.find(r =>
      r.motherId === freshMother && r.symptomId === 'persistent_vomiting'
    );
    expect(recorded).toBeDefined();
    expect(recorded.channel).toBe('africastalking');
  });

  test('records channel as native_sms_fallback when server is unreachable', async () => {
    const offlineMother = '+254700010101';
    mockFetch.mockRejectedValueOnce(new Error('network offline'));

    await sendEmergencyAlert({
      assessment: makeAssessment({ symptoms: ['severe_swelling'], level: '🟠' }),
      profile: baseProfile,
      contacts: baseContacts,
      language: 'en-KE',
      motherId: offlineMother,
    });

    const raw = await SecureStore.getItemAsync('alert_throttle_history');
    const history = JSON.parse(raw || '[]');
    const recorded = history.find(r => r.motherId === offlineMother);
    expect(recorded).toBeDefined();
    expect(recorded.channel).toBe('native_sms_fallback');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('sendEmergencyAlert — safety invariants', () => {

  test('INVAR: convulsions always reaches server (never blocked by throttle)', async () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      motherId: '+254INVAR001', symptomId: 'convulsions',
      timestamp: Date.now() - i * 3600_000, channel: 'at', riskLevel: '🔴',
    }));
    await SecureStore.setItemAsync('alert_throttle_history', JSON.stringify(history));

    const result = await sendEmergencyAlert({
      assessment: makeAssessment({ symptoms: ['convulsions'] }),
      profile: baseProfile,
      contacts: baseContacts,
      language: 'en-KE',
      motherId: '+254INVAR001',
    });
    // shouldSendAlert returns send:true → server is called
    expect(mockFetch).toHaveBeenCalled();
    expect(result.sent).toBe(true);
  });

  test('INVAR: severe_bleeding always reaches server', async () => {
    const history = [{ motherId: '+254INVAR002', symptomId: 'severe_bleeding',
      timestamp: Date.now() - 100, channel: 'at', riskLevel: '🔴' }];
    await SecureStore.setItemAsync('alert_throttle_history', JSON.stringify(history));

    const result = await sendEmergencyAlert({
      assessment: makeAssessment({ symptoms: ['severe_bleeding'] }),
      profile: baseProfile, contacts: baseContacts,
      language: 'en-KE', motherId: '+254INVAR002',
    });
    expect(mockFetch).toHaveBeenCalled();
    expect(result.sent).toBe(true);
  });

  test('INVAR: fallback is attempted when server fails for critical symptoms', async () => {
    mockFetch.mockRejectedValueOnce(new Error('server down'));
    const result = await sendEmergencyAlert({
      assessment: makeAssessment({ symptoms: ['convulsions'] }),
      profile: baseProfile, contacts: baseContacts,
      language: 'en-KE', motherId: '+254INVAR003',
    });
    // expo-sms fallback attempted
    expect(SMS.sendSMSAsync).toHaveBeenCalled();
    expect(result.sent).toBe(true);
    expect(result.fallback).toBe(true);
  });

  test('INVAR: userMessage is provided in correct language when no contacts', async () => {
    const enResult = await sendEmergencyAlert({
      assessment: makeAssessment(), profile: baseProfile,
      contacts: [], language: 'en-KE', motherId: '+254INVAR004',
    });
    expect(enResult.userMessage).toMatch(/Settings|contacts/i);

    const swResult = await sendEmergencyAlert({
      assessment: makeAssessment(), profile: baseProfile,
      contacts: [], language: 'sw-KE', motherId: '+254INVAR005',
    });
    expect(swResult.userMessage).toMatch(/Mipangilio|nambari/i);
  });
});
