/**
 * __tests__/integration/smsGateway.test.js
 *
 * Tests for:
 *   1. POST /api/emergency-alert  — server-side AT endpoint
 *   2. POST /ussd                 — USSD session flow
 *   3. POST /sms/receive          — inbound SMS keyword handler
 *   4. isRateLimited()            — server-side rate limiter
 *   5. sendEmergencyAlert()       — app-side manager (server path + fallback path)
 *   6. shouldSendAlert()          — client throttle logic
 *
 * All external I/O is mocked:
 *   - Africa's Talking SDK never called (mock injected via require cache)
 *   - fetch() mocked in app-side tests
 *   - expo-sms mocked
 *   - secureStorage mocked
 */

'use strict';

// ── Mock Africa's Talking before requiring the gateway ────────────────────────
const mockATSend = jest.fn().mockResolvedValue({
  SMSMessageData: { Message: 'Sent to 2/2 Total Cost: KES 2' },
  Recipients: [
    { number: '+254712345678', status: 'Success', cost: 'KES 1', messageId: 'msg001' },
    { number: '+254798765432', status: 'Success', cost: 'KES 1', messageId: 'msg002' },
  ],
});

jest.mock('africastalking', () => () => ({
  SMS:  { send: mockATSend },
  USSD: {},
}));

// ── Mock expo-sms ─────────────────────────────────────────────────────────────
const mockIsAvailableAsync = jest.fn().mockResolvedValue(true);
const mockSendSMSAsync     = jest.fn().mockResolvedValue({ result: 'sent' });
jest.mock('expo-sms', () => ({
  isAvailableAsync: mockIsAvailableAsync,
  sendSMSAsync:     mockSendSMSAsync,
}));

// ── Mock secureStorage ────────────────────────────────────────────────────────
const store = {};
jest.mock('../../src/utils/secureStorage', () => ({
  secureStorage: {
    getItem:  jest.fn((key)        => Promise.resolve(store[key] || null)),
    setItem:  jest.fn((key, value) => { store[key] = value; return Promise.resolve(); }),
    removeItem: jest.fn((key)      => { delete store[key]; return Promise.resolve(); }),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────
const request = require('supertest');
const { app, isRateLimited } = require('../../backend/sms-ussd-gateway');

// app-side manager needs to be loaded AFTER mock setup
const {
  sendEmergencyAlert,
  shouldSendAlert,
} = require('../../src/utils/EmergencyAlertManager');

// ── Helpers ───────────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(store).forEach(k => delete store[k]);
  // Reset rate-limit map between tests by calling /health (no side effects)
});

function makeAlertBody(overrides = {}) {
  return {
    participantName: 'Amina W.',
    contacts:        ['+254712345678', '+254798765432'],
    symptoms:        ['severe_bleeding'],
    language:        'en-KE',
    motherId:        'MC-003',
    assessmentLevel: '🔴',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. POST /api/emergency-alert
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/emergency-alert', () => {

  test('GW-001: returns 200 and sent:true for valid RED alert', async () => {
    const res = await request(app)
      .post('/api/emergency-alert')
      .send(makeAlertBody())
      .expect(200);

    expect(res.body.sent).toBe(true);
    expect(res.body.channel).toBe('africastalking');
    expect(res.body.recipientCount).toBe(2);
    expect(mockATSend).toHaveBeenCalledTimes(1);
  });

  test('GW-002: SMS body contains participant name', async () => {
    await request(app).post('/api/emergency-alert').send(makeAlertBody()).expect(200);
    const callArgs = mockATSend.mock.calls[0][0];
    expect(callArgs.message).toContain('Amina W.');
  });

  test('GW-003: SMS body contains 999 for en-KE', async () => {
    await request(app).post('/api/emergency-alert').send(makeAlertBody({ language: 'en-KE' })).expect(200);
    expect(mockATSend.mock.calls[0][0].message).toContain('999');
  });

  test('GW-004: SMS sent in Swahili when language=sw-KE', async () => {
    await request(app).post('/api/emergency-alert').send(makeAlertBody({ language: 'sw-KE' })).expect(200);
    const msg = mockATSend.mock.calls[0][0].message;
    expect(msg).toMatch(/DHARURA|TAHADHARI/);
  });

  test('GW-005: returns 400 when contacts is empty array', async () => {
    const res = await request(app)
      .post('/api/emergency-alert')
      .send(makeAlertBody({ contacts: [] }))
      .expect(400);
    expect(res.body.sent).toBe(false);
    expect(res.body.reason).toBe('no_contacts');
    expect(mockATSend).not.toHaveBeenCalled();
  });

  test('GW-006: returns 400 when contacts is missing', async () => {
    const { contacts: _, ...body } = makeAlertBody();
    await request(app).post('/api/emergency-alert').send(body).expect(400);
    expect(mockATSend).not.toHaveBeenCalled();
  });

  test('GW-007: returns 400 when motherId is missing', async () => {
    const { motherId: _, ...body } = makeAlertBody();
    await request(app).post('/api/emergency-alert').send(body).expect(400);
  });

  test('GW-008: filters out invalid phone numbers', async () => {
    const res = await request(app)
      .post('/api/emergency-alert')
      .send(makeAlertBody({ contacts: ['abc', '', '+254712345678'] }))
      .expect(200);
    // Only valid contact should be in AT call
    const toArray = mockATSend.mock.calls[0][0].to;
    expect(toArray).toEqual(['+254712345678']);
  });

  test('GW-009: throttles same symptom same day (non-critical)', async () => {
    // First call succeeds
    await request(app).post('/api/emergency-alert')
      .send(makeAlertBody({ symptoms: ['fever'], motherId: 'MC-010' })).expect(200);
    // Second call same day is throttled
    const res = await request(app).post('/api/emergency-alert')
      .send(makeAlertBody({ symptoms: ['fever'], motherId: 'MC-010' })).expect(200);
    expect(res.body.sent).toBe(false);
    expect(res.body.reason).toBe('throttled');
    expect(mockATSend).toHaveBeenCalledTimes(1);
  });

  test('GW-010: ALWAYS_SEND symptoms bypass throttle', async () => {
    const body = makeAlertBody({ symptoms: ['severe_bleeding'], motherId: 'MC-011' });
    await request(app).post('/api/emergency-alert').send(body).expect(200);
    await request(app).post('/api/emergency-alert').send(body).expect(200);
    // Both calls should have sent
    expect(mockATSend).toHaveBeenCalledTimes(2);
  });

  test('GW-011: returns 502 when Africa\'s Talking throws', async () => {
    mockATSend.mockRejectedValueOnce(new Error('AT network error'));
    const res = await request(app)
      .post('/api/emergency-alert')
      .send(makeAlertBody({ motherId: 'MC-020' }))
      .expect(502);
    expect(res.body.sent).toBe(false);
    expect(res.body.reason).toBe('at_error');
  });

  test('GW-012: sender ID is always "MamaCare"', async () => {
    await request(app).post('/api/emergency-alert').send(makeAlertBody({ motherId: 'MC-021' })).expect(200);
    expect(mockATSend.mock.calls[0][0].from).toBe('MamaCare');
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. GET /health
// ═══════════════════════════════════════════════════════════════════════════════
describe('GET /health', () => {
  test('GW-013: returns status ok', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('mamacare-sms-gateway');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. POST /ussd — session flow
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /ussd', () => {

  function ussd(text) {
    return request(app)
      .post('/ussd')
      .type('form')
      .send({ sessionId: 'test-session', phoneNumber: '+254712345678', text });
  }

  test('GW-014: empty text returns main menu (CON)', async () => {
    const res = await ussd('').expect(200);
    expect(res.text).toMatch(/^CON/);
    expect(res.text).toContain('Check Symptoms');
  });

  test('GW-015: selection 1 returns symptom categories (CON)', async () => {
    const res = await ussd('1').expect(200);
    expect(res.text).toMatch(/^CON/);
    expect(res.text).toContain('Bleeding');
  });

  test('GW-016: selecting severe bleeding returns END with 999', async () => {
    const res = await ussd('1*1*1').expect(200);
    expect(res.text).toMatch(/^END/);
    expect(res.text).toContain('999');
  });

  test('GW-017: selection 3 returns emergency numbers (END)', async () => {
    const res = await ussd('3').expect(200);
    expect(res.text).toMatch(/^END/);
    expect(res.text).toContain('999');
  });

  test('GW-018: *0 suffix returns main menu', async () => {
    const res = await ussd('1*0').expect(200);
    expect(res.text).toMatch(/^CON/);
    expect(res.text).toContain('Check Symptoms');
  });

  test('GW-019: invalid selection returns END with helpful message', async () => {
    const res = await ussd('9*9*9').expect(200);
    expect(res.text).toMatch(/^END/);
    expect(res.text).toContain('999');
  });

  test('GW-020: content-type is text/plain (required by AT)', async () => {
    const res = await ussd('').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. POST /sms/receive — keyword handler
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /sms/receive', () => {

  function smsIn(text, from = '+254712345678') {
    return request(app)
      .post('/sms/receive')
      .send({ from, text, date: new Date().toISOString() });
  }

  test('GW-021: HELP command triggers SMS response', async () => {
    await smsIn('HELP').expect(200);
    expect(mockATSend).toHaveBeenCalledTimes(1);
    expect(mockATSend.mock.calls[0][0].message).toMatch(/HELP|commands|menu/i);
  });

  test('GW-022: EMERGENCY command sends emergency numbers', async () => {
    await smsIn('EMERGENCY').expect(200);
    expect(mockATSend.mock.calls[0][0].message).toContain('999');
  });

  test('GW-023: BLEEDING command triggers RED assessment response', async () => {
    await smsIn('BLEEDING').expect(200);
    expect(mockATSend.mock.calls[0][0].message).toMatch(/EMERGENCY|999|hospital/i);
  });

  test('GW-024: MSAADA (Swahili HELP) is handled', async () => {
    await smsIn('MSAADA').expect(200);
    expect(mockATSend).toHaveBeenCalledTimes(1);
  });

  test('GW-025: unknown command sends welcome message', async () => {
    await smsIn('KITTENS AND YARN').expect(200);
    expect(mockATSend.mock.calls[0][0].message).toMatch(/MamaCare/);
  });

  test('GW-026: missing from field returns 400', async () => {
    await request(app).post('/sms/receive').send({ text: 'HELP' }).expect(400);
  });

  test('GW-027: STOP command triggers unsubscribe response', async () => {
    await smsIn('STOP').expect(200);
    expect(mockATSend.mock.calls[0][0].message).toMatch(/unsubscri|Unsubscri/);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. isRateLimited() — server-side rate limiter unit tests
// ═══════════════════════════════════════════════════════════════════════════════
describe('isRateLimited()', () => {

  test('GW-028: first call for a key is not limited', () => {
    expect(isRateLimited('MC-030', 'fever')).toBe(false);
  });

  test('GW-029: second call same day is limited', () => {
    isRateLimited('MC-031', 'mild_headache'); // first call
    expect(isRateLimited('MC-031', 'mild_headache')).toBe(true);
  });

  test('GW-030: severe_bleeding is NEVER limited', () => {
    isRateLimited('MC-032', 'severe_bleeding'); // first call
    expect(isRateLimited('MC-032', 'severe_bleeding')).toBe(false); // second call
    expect(isRateLimited('MC-032', 'severe_bleeding')).toBe(false); // third call
  });

  test('GW-031: convulsions is NEVER limited', () => {
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited('MC-033', 'convulsions')).toBe(false);
    }
  });

  test('GW-032: no_fetal_movement_24hrs is NEVER limited', () => {
    isRateLimited('MC-034', 'no_fetal_movement_24hrs');
    expect(isRateLimited('MC-034', 'no_fetal_movement_24hrs')).toBe(false);
  });

  test('GW-033: different symptom IDs for same mother are independent', () => {
    isRateLimited('MC-035', 'fever');         // used up fever limit
    expect(isRateLimited('MC-035', 'severe_abdominal_pain')).toBe(false); // fresh
  });

  test('GW-034: different motherIds are independent', () => {
    isRateLimited('MC-036', 'fever');
    expect(isRateLimited('MC-037', 'fever')).toBe(false); // different mother
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. shouldSendAlert() — client-side throttle unit tests
// ═══════════════════════════════════════════════════════════════════════════════
describe('shouldSendAlert()', () => {

  test('GW-035: first call allows send', async () => {
    const result = await shouldSendAlert('fever', '🟠', 'MC-040');
    expect(result.send).toBe(true);
  });

  test('GW-036: same symptom same day is throttled', async () => {
    const store_key = 'alert_throttle_history';
    const record = [{ motherId:'MC-041', symptomId:'fever', timestamp: Date.now(), riskLevel:'🟠', channel:'africastalking' }];
    store[store_key] = JSON.stringify(record);
    const result = await shouldSendAlert('fever', '🟠', 'MC-041');
    expect(result.send).toBe(false);
    expect(result.reason).toBe('throttled');
  });

  test('GW-037: after 3 same symptoms → escalate_chw', async () => {
    const store_key = 'alert_throttle_history';
    const now = Date.now();
    const records = [
      { motherId:'MC-042', symptomId:'fever', timestamp: now - 3*86400000, riskLevel:'🟠', channel:'at' },
      { motherId:'MC-042', symptomId:'fever', timestamp: now - 2*86400000, riskLevel:'🟠', channel:'at' },
      { motherId:'MC-042', symptomId:'fever', timestamp: now - 1*86400000, riskLevel:'🟠', channel:'at' },
    ];
    store[store_key] = JSON.stringify(records);
    const result = await shouldSendAlert('fever', '🟠', 'MC-042');
    expect(result.send).toBe(false);
    expect(result.reason).toBe('escalate_chw');
    expect(result.count).toBeGreaterThanOrEqual(3);
  });

  test('GW-038: convulsions always sends regardless of history', async () => {
    const store_key = 'alert_throttle_history';
    const now = Date.now();
    const records = [1,2,3,4,5].map(i => ({
      motherId:'MC-043', symptomId:'convulsions', timestamp: now - i*3600000, riskLevel:'🔴', channel:'at',
    }));
    store[store_key] = JSON.stringify(records);
    const result = await shouldSendAlert('convulsions', '🔴', 'MC-043');
    expect(result.send).toBe(true);
  });

  test('GW-039: severe_bleeding always sends', async () => {
    const store_key = 'alert_throttle_history';
    store[store_key] = JSON.stringify([{ motherId:'MC-044', symptomId:'severe_bleeding', timestamp: Date.now() - 100, riskLevel:'🔴', channel:'at' }]);
    const result = await shouldSendAlert('severe_bleeding', '🔴', 'MC-044');
    expect(result.send).toBe(true);
  });

  test('GW-040: no_fetal_movement_24hrs always sends', async () => {
    const store_key = 'alert_throttle_history';
    store[store_key] = JSON.stringify([{ motherId:'MC-045', symptomId:'no_fetal_movement_24hrs', timestamp: Date.now() - 100, riskLevel:'🔴', channel:'at' }]);
    const result = await shouldSendAlert('no_fetal_movement_24hrs', '🔴', 'MC-045');
    expect(result.send).toBe(true);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. sendEmergencyAlert() — app-side manager integration
// ═══════════════════════════════════════════════════════════════════════════════
describe('sendEmergencyAlert() — app-side', () => {

  const mockFetch = jest.fn();

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sent: true, channel: 'africastalking', recipientCount: 2 }),
    });
  });

  const baseParams = {
    assessment: { level: '🔴', priority: 'EMERGENCY', symptoms: ['severe_bleeding'], sendAlert: true },
    profile:    { name: 'Amina W.' },
    contacts:   ['+254712345678'],
    language:   'en-KE',
    motherId:   'MC-050',
  };

  test('GW-041: calls /api/emergency-alert as primary', async () => {
    const result = await sendEmergencyAlert(baseParams);
    expect(result.sent).toBe(true);
    expect(result.channel).toBe('africastalking');
    expect(result.automatic).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/emergency-alert'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('GW-042: falls back to expo-sms when server returns 500', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) });
    const result = await sendEmergencyAlert({ ...baseParams, motherId: 'MC-051' });
    expect(result.sent).toBe(true);
    expect(result.fallback).toBe(true);
    expect(mockSendSMSAsync).toHaveBeenCalled();
  });

  test('GW-043: falls back to expo-sms when server throws (offline)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network offline'));
    const result = await sendEmergencyAlert({ ...baseParams, motherId: 'MC-052' });
    expect(result.sent).toBe(true);
    expect(result.fallback).toBe(true);
    expect(result.fallbackWarning).toBeTruthy();
  });

  test('GW-044: returns no_contacts when contacts array is empty', async () => {
    const result = await sendEmergencyAlert({ ...baseParams, contacts: [], motherId: 'MC-053' });
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('no_contacts');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('GW-045: fallback warning appears in Swahili for sw-KE', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    const result = await sendEmergencyAlert({ ...baseParams, language: 'sw-KE', motherId: 'MC-054' });
    expect(result.sent).toBe(true);
    expect(result.fallbackWarning).toMatch(/Tuma|bonyeza/);
  });

  test('GW-046: returns all_channels_failed when both server and expo-sms fail', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    mockSendSMSAsync.mockRejectedValueOnce(new Error('SMS not available'));
    const result = await sendEmergencyAlert({ ...baseParams, motherId: 'MC-055' });
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('all_channels_failed');
  });

  test('GW-047: request body includes all required fields', async () => {
    await sendEmergencyAlert({ ...baseParams, motherId: 'MC-056' });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.participantName).toBe('Amina W.');
    expect(body.contacts).toContain('+254712345678');
    expect(body.symptoms).toContain('severe_bleeding');
    expect(body.motherId).toBe('MC-056');
    expect(body.language).toBe('en-KE');
  });

  test('GW-048: appends to throttle history after successful send', async () => {
    await sendEmergencyAlert({ ...baseParams, motherId: 'MC-057' });
    const stored = JSON.parse(store['alert_throttle_history'] || '[]');
    const record = stored.find(r => r.motherId === 'MC-057');
    expect(record).toBeTruthy();
    expect(record.channel).toBe('africastalking');
    expect(record.symptomId).toBe('severe_bleeding');
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. SAFETY INVARIANTS — must never fail
// ═══════════════════════════════════════════════════════════════════════════════
describe('SMS SAFETY INVARIANTS', () => {

  const mockFetch = jest.fn();
  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ sent: true, channel: 'africastalking', recipientCount: 1 }) });
  });

  const redAssessment = level => ({ level, priority: 'EMERGENCY', symptoms: ['severe_bleeding'], sendAlert: true });
  const contacts      = ['+254712345678'];

  test('INVAR-SMS-001: convulsions always attempts send (never throttled)', async () => {
    // Pre-fill history with 10 convulsion alerts
    store['alert_throttle_history'] = JSON.stringify(
      Array.from({ length: 10 }, (_, i) => ({
        motherId:'MC-INVAR', symptomId:'convulsions',
        timestamp: Date.now() - i * 3600000, riskLevel:'🔴', channel:'at',
      }))
    );
    const result = await sendEmergencyAlert({
      assessment: { level: '🔴', symptoms: ['convulsions'], sendAlert: true },
      profile: { name: 'Test' }, contacts, language: 'en-KE', motherId: 'MC-INVAR-1',
    });
    // shouldSendAlert returns send:true for convulsions + RED, so server is called
    expect(mockFetch).toHaveBeenCalled();
  });

  test('INVAR-SMS-002: severe_bleeding always attempts send', async () => {
    store['alert_throttle_history'] = JSON.stringify([
      { motherId:'MC-INVAR-2', symptomId:'severe_bleeding', timestamp: Date.now() - 100, riskLevel:'🔴', channel:'at' },
    ]);
    const result = await sendEmergencyAlert({
      assessment: { level: '🔴', symptoms: ['severe_bleeding'], sendAlert: true },
      profile: { name: 'Test' }, contacts, language: 'en-KE', motherId: 'MC-INVAR-2',
    });
    expect(mockFetch).toHaveBeenCalled();
  });

  test('INVAR-SMS-003: no_fetal_movement_24hrs always attempts send', async () => {
    store['alert_throttle_history'] = JSON.stringify([
      { motherId:'MC-INVAR-3', symptomId:'no_fetal_movement_24hrs', timestamp: Date.now() - 100, riskLevel:'🔴', channel:'at' },
    ]);
    await sendEmergencyAlert({
      assessment: { level: '🔴', symptoms: ['no_fetal_movement_24hrs'], sendAlert: true },
      profile: { name: 'Test' }, contacts, language: 'en-KE', motherId: 'MC-INVAR-3',
    });
    expect(mockFetch).toHaveBeenCalled();
  });

  test('INVAR-SMS-004: server /api/emergency-alert ALWAYS_SEND bypasses rate limit', async () => {
    // Call 5 times — all should reach AT
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/emergency-alert')
        .send({ ...makeAlertBody(), symptoms: ['convulsions'], motherId: 'MC-INVAR-4' })
        .expect(200);
    }
    // Rate limiter should have allowed all 5
    expect(mockATSend).toHaveBeenCalledTimes(5);
  });

  test('INVAR-SMS-005: fallback SMS is attempted when server is unreachable for critical symptom', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network timeout'));
    const result = await sendEmergencyAlert({
      assessment: { level: '🔴', symptoms: ['convulsions'], sendAlert: true },
      profile: { name: 'Test' }, contacts, language: 'en-KE', motherId: 'MC-INVAR-5',
    });
    // expo-sms fallback attempted
    expect(mockSendSMSAsync).toHaveBeenCalled();
    expect(result.sent).toBe(true);
  });

});
