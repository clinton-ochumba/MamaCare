/**
 * riskAssessment.js
 * ──────────────────
 * Maternal health symptom risk assessment engine.
 * FIX: File was missing — imported by VoiceSymptomCheckerScreen.js but
 * not included in the production zip, causing a module-not-found crash.
 *
 * Path: src/utils/riskAssessment.js
 */

// ─── Risk levels ──────────────────────────────────────────────────────────────
const RISK = {
  RED: '🔴',
  ORANGE: '🟠',
  YELLOW: '🟡',
  GREEN: '🟢',
};

// ─── Symptom risk map ─────────────────────────────────────────────────────────
// Maps symptom IDs to their base risk level and triage priority
const SYMPTOM_RISK_MAP = {
  // RED — life-threatening, emergency hospital NOW
  severe_bleeding:                 { level: RISK.RED,    priority: 'EMERGENCY', sendAlert: true },
  convulsions:                     { level: RISK.RED,    priority: 'EMERGENCY', sendAlert: true },
  no_fetal_movement_24hrs:         { level: RISK.RED,    priority: 'EMERGENCY', sendAlert: true },
  severe_headache_blurred_vision:  { level: RISK.RED,    priority: 'EMERGENCY', sendAlert: true },
  difficulty_breathing:            { level: RISK.RED,    priority: 'EMERGENCY', sendAlert: true },

  // ORANGE — urgent, go to clinic today
  severe_abdominal_pain:           { level: RISK.ORANGE, priority: 'URGENT',    sendAlert: true },
  severe_swelling:                 { level: RISK.ORANGE, priority: 'URGENT',    sendAlert: true },
  fever:                           { level: RISK.ORANGE, priority: 'URGENT',    sendAlert: true },
  persistent_vomiting:             { level: RISK.ORANGE, priority: 'URGENT',    sendAlert: false },
  reduced_fetal_movement:          { level: RISK.ORANGE, priority: 'URGENT',    sendAlert: true },

  // YELLOW — monitor, call CHW or clinic within 24 hrs
  mild_swelling:                   { level: RISK.YELLOW, priority: 'MONITOR',   sendAlert: false },
  mild_headache:                   { level: RISK.YELLOW, priority: 'MONITOR',   sendAlert: false },
  backache:                        { level: RISK.YELLOW, priority: 'MONITOR',   sendAlert: false },
  heartburn:                       { level: RISK.YELLOW, priority: 'MONITOR',   sendAlert: false },
  fatigue:                         { level: RISK.YELLOW, priority: 'MONITOR',   sendAlert: false },
  leg_cramps:                      { level: RISK.YELLOW, priority: 'MONITOR',   sendAlert: false },
  nausea:                          { level: RISK.YELLOW, priority: 'MONITOR',   sendAlert: false },

  // GREEN — normal pregnancy symptom
  breast_tenderness:               { level: RISK.GREEN,  priority: 'NORMAL',    sendAlert: false },
  frequent_urination:              { level: RISK.GREEN,  priority: 'NORMAL',    sendAlert: false },
  mild_nausea:                     { level: RISK.GREEN,  priority: 'NORMAL',    sendAlert: false },
  bloating:                        { level: RISK.GREEN,  priority: 'NORMAL',    sendAlert: false },
};

// ─── Messages per risk level ───────────────────────────────────────────────────
const MESSAGES = {
  [RISK.RED]: {
    en: {
      message: 'DANGER SIGNS detected. Seek emergency care IMMEDIATELY. Call 999 or go to the nearest hospital NOW.',
      messageSwahili: 'Dalili za HATARI. Tafuta msaada wa dharura SASA HIVI. Piga simu 999 au nenda hospitali karibu SASA.',
      action: 'Call 999 or go to hospital NOW',
    },
  },
  [RISK.ORANGE]: {
    en: {
      message: 'URGENT symptoms detected. Go to a clinic or hospital TODAY. Do not wait.',
      messageSwahili: 'Dalili za HARAKA. Nenda kliniki au hospitali LEO. Usisubiri.',
      action: 'Go to clinic or hospital today',
    },
  },
  [RISK.YELLOW]: {
    en: {
      message: 'These symptoms need monitoring. Contact your Community Health Worker or clinic within 24 hours.',
      messageSwahili: 'Dalili hizi zinahitaji kufuatiliwa. Wasiliana na mhudumu wako wa afya au kliniki ndani ya masaa 24.',
      action: 'Contact CHW or clinic within 24 hours',
    },
  },
  [RISK.GREEN]: {
    en: {
      message: 'These are common pregnancy symptoms. Rest, stay hydrated, and mention these at your next antenatal visit.',
      messageSwahili: 'Hizi ni dalili za kawaida za ujauzito. Pumzika, kunywa maji, na zitaje kwenye ziara yako ya kliniki.',
      action: 'Mention at next antenatal visit',
    },
  },
};

// ─── Risk level ordering (higher index = higher risk) ─────────────────────────
const RISK_ORDER = [RISK.GREEN, RISK.YELLOW, RISK.ORANGE, RISK.RED];

/**
 * assessSymptoms(symptomIds)
 *
 * Takes an array of symptom ID strings and returns a risk assessment.
 *
 * @param {string[]} symptomIds - e.g. ['fever', 'severe_swelling']
 * @returns {{
 *   level: string,       // RISK.RED | RISK.ORANGE | RISK.YELLOW | RISK.GREEN
 *   priority: string,    // 'EMERGENCY' | 'URGENT' | 'MONITOR' | 'NORMAL'
 *   message: string,
 *   messageSwahili: string,
 *   action: string,
 *   sendAlert: boolean,
 *   symptoms: string[],  // the input symptom IDs
 *   unknownSymptoms: string[]
 * }}
 */
export function assessSymptoms(symptomIds) {
  // Normalise input: accept null, undefined, a string, or an array
  const ids = Array.isArray(symptomIds)
    ? symptomIds
    : symptomIds
    ? [String(symptomIds)]
    : [];

  if (ids.length === 0) {
    return {
      level: RISK.GREEN,
      priority: 'NORMAL',
      message: 'No symptoms reported.',
      messageSwahili: 'Hakuna dalili zilizotolewa.',
      action: 'Continue with normal antenatal care',
      sendAlert: false,
      symptoms: [],
      unknownSymptoms: [],
    };
  }

  const known = [];
  const unknown = [];

  let highestRiskIdx = 0; // index into RISK_ORDER
  let shouldAlert = false;

  for (const id of ids) {
    const entry = SYMPTOM_RISK_MAP[id];
    if (!entry) {
      unknown.push(id);
      continue;
    }
    known.push(id);

    const riskIdx = RISK_ORDER.indexOf(entry.level);
    if (riskIdx > highestRiskIdx) {
      highestRiskIdx = riskIdx;
    }
    if (entry.sendAlert) {
      shouldAlert = true;
    }
  }

  // If all symptoms are unknown, default to ORANGE to be safe
  if (known.length === 0 && unknown.length > 0) {
    const msg = MESSAGES[RISK.ORANGE].en;
    return {
      level: RISK.ORANGE,
      priority: 'URGENT',
      ...msg,
      sendAlert: true,
      symptoms: [],
      unknownSymptoms: unknown,
    };
  }

  // If any symptoms are unrecognised, bump minimum risk to ORANGE (safe triage)
  if (unknown.length > 0 && highestRiskIdx < RISK_ORDER.indexOf(RISK.ORANGE)) {
    highestRiskIdx = RISK_ORDER.indexOf(RISK.ORANGE);
  }

  const finalLevel = RISK_ORDER[highestRiskIdx];
  const entry = MESSAGES[finalLevel].en;
  const topSymptom = SYMPTOM_RISK_MAP[known.find((s) => SYMPTOM_RISK_MAP[s]?.level === finalLevel)];

  return {
    level: finalLevel,
    priority: topSymptom?.priority || 'NORMAL',
    message: entry.message,
    messageSwahili: entry.messageSwahili,
    action: entry.action,
    sendAlert: shouldAlert,
    symptoms: ids,
    unknownSymptoms: unknown,
  };
}

/**
 * getSymptomList()
 *
 * Returns all known symptom IDs and their base risk level,
 * useful for rendering the symptom picker UI.
 *
 * @returns {{ id: string, level: string, priority: string }[]}
 */
export function getSymptomList() {
  return Object.entries(SYMPTOM_RISK_MAP).map(([id, meta]) => ({
    id,
    level: meta.level,
    priority: meta.priority,
  }));
}

/**
 * isEmergencySymptom(symptomId)
 * Quick check used by voice checker for real-time feedback.
 *
 * @param {string} symptomId
 * @returns {boolean}
 */
export function isEmergencySymptom(symptomId) {
  return SYMPTOM_RISK_MAP[symptomId]?.level === RISK.RED ?? false;
}
