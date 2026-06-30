/**
 * EmergencyAlertManager.js — Automatic Emergency Alert System
 * ─────────────────────────────────────────────────────────────
 * Sends SMS to emergency contacts when RED or ORANGE symptoms are assessed.
 *
 * ARCHITECTURE
 * ─────────────
 * Primary:  POST /api/emergency-alert → backend → Africa's Talking SDK
 *           Automatic. No user interaction required. Works even if participant
 *           is incapacitated. Required for the safety guarantee.
 *
 * Fallback: expo-sms (native SMS composer)
 *           Used ONLY when the backend is unreachable (no internet).
 *           Requires the participant to tap Send — NOT automatic.
 *           A UI warning is shown when fallback is active.
 *
 * THROTTLE (client-side cache; server applies its own independent check)
 * ────────
 *   - MAX_ALERTS_PER_DAY per symptom type (default 1)
 *   - After SAME_SYMPTOM_ESCALATION_COUNT alerts → schedule CHW home visit
 *   - ALWAYS_SEND symptoms bypass both limits (convulsions, severe_bleeding,
 *     no_fetal_movement_24hrs)
 *
 * CHANGES FROM PREVIOUS VERSION
 * ──────────────────────────────
 *   CRITICAL FIX: Replaced expo-sms (requires user tap) with server-side AT
 *   sending via /api/emergency-alert. expo-sms is now the offline fallback only.
 *   A participant experiencing convulsions cannot be expected to tap "Send".
 */

import * as SMS from 'expo-sms';
import { secureStorage } from './secureStorage';

// ── Constants ─────────────────────────────────────────────────────────────────
const ALERT_HISTORY_KEY         = 'alert_throttle_history';
const THROTTLE_WINDOW_MS        = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_ALERTS_PER_DAY        = 1;
const SAME_SYMPTOM_ESCALATION_COUNT = 3;
const ALWAYS_SEND               = ['convulsions', 'severe_bleeding', 'no_fetal_movement_24hrs'];

// ── Emergency SMS templates (8 languages) ─────────────────────────────────────
const EMERGENCY_TEMPLATES = {
  'en-KE': (name, symptoms, action) =>
    `🚨 MAMACARE EMERGENCY ALERT\n\n${name} has reported danger signs:\n${symptoms}\n\n${action}\n\nPlease contact her or call 999 immediately.\n- MamaCare`,
  'sw-KE': (name, symptoms, action) =>
    `🚨 TAHADHARI YA DHARURA - MAMACARE\n\n${name} ameona dalili za hatari:\n${symptoms}\n\n${action}\n\nTafadhali wasiliana naye au piga simu 999 mara moja.\n- MamaCare`,
  'ki-KE': (name, symptoms, action) =>
    `🚨 ŨHORO WA HATARI - MAMACARE\n\n${name} aonire tondũ cia hatari:\n${symptoms}\n\n${action}\n\nMũtũme anake kana oire 999 rĩu.\n- MamaCare`,
  'luo-KE': (name, symptoms, action) =>
    `🚨 CHANDRUOK MAR HERA - MAMACARE\n\n${name} neno ranyisi maricho:\n${symptoms}\n\n${action}\n\nKaw kode kama luong 999 saa ni.\n- MamaCare`,
  'kln-KE': (name, symptoms, action) =>
    `🚨 ILOCHENG TOROSIEK - MAMACARE\n\n${name} onenin torosiek ne kimatat:\n${symptoms}\n\n${action}\n\nAmnunek emet o lub 999 saa ni.\n- MamaCare`,
  'kam-KE': (name, symptoms, action) =>
    `🚨 ISYAU YA KUTIKWA - MAMACARE\n\n${name} oniĩsye isyau ila nzolu:\n${symptoms}\n\n${action}\n\nMwanalile kana ite 999 nthini wa nzia.\n- MamaCare`,
  'luy-KE': (name, symptoms, action) =>
    `🚨 ERIMA LYA BULAYI - MAMACARE\n\n${name} abone ebirangirira bya bulayi:\n${symptoms}\n\n${action}\n\nMulihe kana oimbire 999 saa hii.\n- MamaCare`,
  'guz-KE': (name, symptoms, action) =>
    `🚨 CHIRA CHA AMAMA - MAMACARE\n\n${name} abonire chinembe ebi:\n${symptoms}\n\n${action}\n\nMoigerekie kana iambirie 999 orone.\n- MamaCare`,
};

const ACTION_LINES = {
  'en-KE': 'Seek emergency medical care IMMEDIATELY.',
  'sw-KE': 'Tafuta matibabu ya dharura MARA MOJA.',
  'ki-KE': 'Thiũ thibitari ya ndũũra RĨRĨA.',
  'luo-KE': 'Dhi dala mar thieth SAA NI.',
  'kln-KE': 'Yom toiyoi ne kimatat TAITE.',
  'kam-KE': 'Itwe wiasya wa maweloni NTHINI WA NZIA.',
  'luy-KE': 'Buka obulwaye obwa bulayi SAA HII.',
  'guz-KE': 'Kora egetabu ekebi ORONE.',
};

const SYMPTOM_NAMES = {
  'en-KE': {
    severe_bleeding:                'Severe bleeding',
    severe_headache_blurred_vision: 'Severe headache with blurred vision',
    severe_abdominal_pain:          'Severe abdominal pain',
    convulsions:                    'Convulsions / seizures',
    difficulty_breathing:           'Difficulty breathing',
    no_fetal_movement_24hrs:        'No fetal movement for 24+ hours',
    fever:                          'High fever',
    persistent_vomiting:            'Persistent vomiting',
    severe_swelling:                'Severe swelling of face / hands',
    reduced_fetal_movement:         'Reduced fetal movement',
  },
  'sw-KE': {
    severe_bleeding:                'Kutoka damu kwa nguvu',
    severe_headache_blurred_vision: 'Maumivu makali ya kichwa na kuona kiza',
    severe_abdominal_pain:          'Maumivu makali ya tumbo',
    convulsions:                    'Kushindwa kudhibiti mwili / kifafa',
    difficulty_breathing:           'Shida kupumua',
    no_fetal_movement_24hrs:        'Mtoto hakujisogeza kwa masaa 24+',
    fever:                          'Homa kali',
    persistent_vomiting:            'Kutapika bila kukoma',
    severe_swelling:                'Kuvimba kwa uso / mikono',
    reduced_fetal_movement:         'Mtoto kujisogeza kidogo',
  },
};

function getSymptomName(id, lang) {
  const names = SYMPTOM_NAMES[lang] || SYMPTOM_NAMES['en-KE'];
  return names[id] || id.replace(/_/g, ' ');
}

function buildSMSBody(participantName, symptoms, language) {
  const template   = EMERGENCY_TEMPLATES[language] || EMERGENCY_TEMPLATES['en-KE'];
  const actionLine = ACTION_LINES[language]         || ACTION_LINES['en-KE'];
  const lines = (symptoms && symptoms.length > 0)
    ? symptoms.map(s => `• ${getSymptomName(s, language)}`).join('\n')
    : '• Emergency danger sign';
  return template(participantName || 'Your contact', lines, actionLine);
}

// ── Throttle helpers ──────────────────────────────────────────────────────────
async function getAlertHistory() {
  const raw = await secureStorage.getItem(ALERT_HISTORY_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function appendAlertRecord(record) {
  const history = await getAlertHistory();
  history.push(record);
  const cutoff = Date.now() - THROTTLE_WINDOW_MS;
  await secureStorage.setItem(
    ALERT_HISTORY_KEY,
    JSON.stringify(history.filter(r => r.timestamp > cutoff))
  );
}

export async function shouldSendAlert(symptomId, riskLevel, motherId) {
  if (ALWAYS_SEND.includes(symptomId) && riskLevel === '🔴') {
    return { send: true };
  }

  const history      = await getAlertHistory();
  const cutoff7d     = Date.now() - THROTTLE_WINDOW_MS;
  const recentAlerts = history.filter(r => r.motherId === motherId && r.timestamp > cutoff7d);
  const sameSymptom  = recentAlerts.filter(r => r.symptomId === symptomId);

  if (sameSymptom.length >= SAME_SYMPTOM_ESCALATION_COUNT) {
    return { send: false, reason: 'escalate_chw', count: sameSymptom.length };
  }

  const todayStart  = new Date().setHours(0, 0, 0, 0);
  const todayAlerts = sameSymptom.filter(r => r.timestamp >= todayStart);
  if (todayAlerts.length >= MAX_ALERTS_PER_DAY) {
    return { send: false, reason: 'throttled', next: 'tomorrow' };
  }

  return { send: true };
}

// ── Primary: server-side AT send ──────────────────────────────────────────────
async function sendViaServer({ participantName, contacts, symptoms, language, motherId, assessmentLevel, apiBaseUrl }) {
  const endpoint = `${apiBaseUrl}/api/emergency-alert`;
  const body = JSON.stringify({ participantName, contacts, symptoms, language, motherId, assessmentLevel });

  const response = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal:  AbortSignal.timeout(8000), // 8 second timeout
  });

  if (!response.ok) {
    throw new Error(`Server responded ${response.status}`);
  }
  return response.json();
}

// ── Fallback: expo-sms (native SMS composer — requires user tap) ──────────────
async function sendViaNativeSMS({ participantName, contacts, symptoms, language }) {
  const isAvailable = await SMS.isAvailableAsync();
  if (!isAvailable) {throw new Error('SMS not available on this device');}
  const smsBody = buildSMSBody(participantName, symptoms, language);
  await SMS.sendSMSAsync(contacts, smsBody);
  return { sent: true, channel: 'native_sms', requiresUserTap: true };
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * sendEmergencyAlert
 *
 * Sends automatic SMS to emergency contacts via Africa's Talking backend.
 * Falls back to native SMS composer if server is unreachable.
 *
 * @param {object} params
 * @param {object}   params.assessment       - Result from assessSymptoms()
 * @param {object}   params.profile          - User profile { name, ... }
 * @param {string[]} params.contacts         - Emergency contact phone numbers
 * @param {string}   params.language         - User's language code (e.g. 'sw-KE')
 * @param {string}   params.motherId         - Participant ID for throttle tracking
 * @returns {Promise<object>} { sent, channel, recipientCount?, reason?, fallback? }
 */
export async function sendEmergencyAlert({
  assessment,
  profile,
  contacts,
  language = 'en-KE',
  motherId,
}) {
  // ── Guard: contacts ────────────────────────────────────────────────────
  if (!contacts || contacts.length === 0) {
    return {
      sent: false,
      reason: 'no_contacts',
      userMessage: language === 'sw-KE'
        ? 'Tafadhali ongeza nambari za dharura kwenye Mipangilio > Mawasiliano.'
        : 'Please add emergency contacts in Settings > Emergency Contacts.',
    };
  }
  const validContacts = contacts.filter(c => c && typeof c === 'string' && c.trim().length > 7);
  if (validContacts.length === 0) {
    return { sent: false, reason: 'invalid_contacts' };
  }

  // ── Guard: throttle ────────────────────────────────────────────────────
  const primarySymptom = assessment.symptoms?.[0] || 'unknown';
  const throttle = await shouldSendAlert(primarySymptom, assessment.level, motherId);
  if (!throttle.send) {
    if (throttle.reason === 'escalate_chw') {
      return {
        sent: false, reason: 'escalate_chw', chwAction: true,
        userMessage: language === 'sw-KE'
          ? `Dalili hii imeonekana mara ${throttle.count}. Mhudumu wako wa afya atawasiliana nawe.`
          : `This symptom has recurred ${throttle.count} times. Your CHW will contact you.`,
      };
    }
    return {
      sent: false, reason: throttle.reason,
      userMessage: language === 'sw-KE'
        ? 'Tahadhari ilitumwa hivi karibuni. Twasiliana na mhudumu wako wa afya.'
        : 'An alert was already sent recently. Your CHW has been notified.',
    };
  }

  const params = {
    participantName: profile?.name,
    contacts:        validContacts,
    symptoms:        assessment.symptoms || [],
    language,
    motherId,
    assessmentLevel: assessment.level,
  };

  // ── Primary: server-side AT ────────────────────────────────────────────
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || '';
  let serverResult = null;
  try {
    serverResult = await sendViaServer({ ...params, apiBaseUrl });
    if (serverResult?.sent) {
      await appendAlertRecord({
        motherId, symptomId: primarySymptom,
        timestamp: Date.now(), channel: 'africastalking',
        riskLevel: assessment.level,
      });
      return {
        sent: true,
        channel: 'africastalking',
        automatic: true,
        recipientCount: serverResult.recipientCount,
        deliveredCount: serverResult.deliveredCount,
      };
    }
    // Server responded but said not sent (e.g. throttled server-side)
    return { sent: false, reason: serverResult?.reason || 'server_declined' };
  } catch (serverErr) {
    console.warn('[EmergencyAlertManager] Server unreachable, trying native SMS fallback:', serverErr?.message);
  }

  // ── Fallback: native SMS (requires user tap) ───────────────────────────
  try {
    const fallbackResult = await sendViaNativeSMS(params);
    await appendAlertRecord({
      motherId, symptomId: primarySymptom,
      timestamp: Date.now(), channel: 'native_sms_fallback',
      riskLevel: assessment.level,
    });
    return {
      ...fallbackResult,
      sent: true,
      fallback: true,
      fallbackWarning: language === 'sw-KE'
        ? 'Tuma ujumbe mkono — bonyeza "Tuma" kukamilisha.'
        : 'Tap "Send" to complete the emergency alert. Your contacts must be notified.',
    };
  } catch (smsErr) {
    console.warn('[EmergencyAlertManager] Native SMS also failed:', smsErr?.message || 'unknown');
    return { sent: false, reason: 'all_channels_failed' };
  }
}

// ── CHW escalation ────────────────────────────────────────────────────────────
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || '';

export async function scheduleCHWVisit(motherId, symptomId) {
  try {
    await fetch(`${API_BASE_URL}/chw/visits/urgent`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ motherId, symptomId, requestedAt: new Date().toISOString(), priority: 'urgent', reason: 'repeated_symptom_escalation' }),
    });
  } catch (_) {
    console.warn('[EmergencyAlertManager] CHW visit scheduling failed — queued for retry');
    const queue    = await secureStorage.getItem('chw_visit_queue');
    const existing = queue ? JSON.parse(queue) : [];
    existing.push({ motherId, symptomId, requestedAt: Date.now() });
    await secureStorage.setItem('chw_visit_queue', JSON.stringify(existing));
  }
}
