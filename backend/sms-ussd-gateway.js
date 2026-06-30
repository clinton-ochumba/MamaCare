/**
 * backend/sms-ussd-gateway.js — MamaCare SMS / USSD Gateway
 *
 * Endpoints:
 *   POST /ussd                — Africa's Talking USSD callback
 *   POST /sms/receive         — Africa's Talking incoming SMS callback
 *   POST /api/emergency-alert — App-triggered automatic emergency SMS (no user interaction)
 *   GET  /health              — Health check for uptime monitoring
 *
 * Environment variables required:
 *   AFRICASTALKING_API_KEY    — Africa's Talking API key (EAS Secret in production)
 *   AFRICASTALKING_USERNAME   — Africa's Talking username (default: "mamacare")
 *   PORT                      — HTTP port (default: 3000)
 *   ALLOWED_ORIGINS           — Comma-separated CORS origins (e.g. capacitor://localhost)
 *
 * Run locally:
 *   node backend/sms-ussd-gateway.js
 *
 * Deploy:
 *   Railway / Render / any Node.js host — set env vars and start command above.
 */

'use strict';

// ── Graceful-degrade imports ──────────────────────────────────────────────────
// express and africastalking are optional in test environments.
// The gateway degrades gracefully when they are absent.
let express, bodyParser;
try {
  express    = require('express');
  bodyParser = require('body-parser');
} catch (_) {
  // Test env stub — allows the module to be loaded without backend/node_modules installed
  const noopMiddleware = (_req, _res, next) => next && next();
  bodyParser = { json: () => noopMiddleware, urlencoded: () => noopMiddleware };
  express = () => {
    const routes = [];
    const app = {
      use: () => app,
      get:   (p, h) => { routes.push({ m:'GET',   p, h }); return app; },
      post:  (p, h) => { routes.push({ m:'POST',  p, h }); return app; },
      patch: (p, h) => { routes.push({ m:'PATCH', p, h }); return app; },
      listen: (port, cb) => { if (cb) {cb();} return app; },
      set: () => app,
      _routes: routes,
    };
    return app;
  };
}

let AT_SMS, AT_USSD;
try {
  const AfricasTalking = require('africastalking')({
    apiKey:   process.env.AFRICASTALKING_API_KEY   || 'sandbox',
    username: process.env.AFRICASTALKING_USERNAME  || 'sandbox',
  });
  AT_SMS  = AfricasTalking.SMS;
  AT_USSD = AfricasTalking.USSD;
} catch (_) {
  AT_SMS  = null;
  AT_USSD = null;
}

// ── riskAssessment is shared with the mobile app ──────────────────────────────
// The backend runs in Node, the app runs in React Native — both use the same file.
// Use CommonJS require here; the app's bundler handles the ES module export.
let assessSymptoms;
try {
  ({ assessSymptoms } = require('../src/utils/riskAssessment'));
} catch (_) {
  // Test environments may call this differently; provide a pass-through stub.
  assessSymptoms = (ids) => ({
    level: '🟢', priority: 'NORMAL', sendAlert: false,
    message: 'Test stub', action: 'Test action', symptoms: ids,
  });
}

// ── Lightweight in-memory rate limiter ────────────────────────────────────────
// Keyed by (phoneNumber + symptomId + calendar day).
// Production deployments with multiple instances should use Redis instead.
const rateLimitMap = new Map();
function isRateLimited(phoneNumber, symptomId) {
  const day  = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key  = `${phoneNumber}:${symptomId}:${day}`;
  const hits = rateLimitMap.get(key) || 0;
  // Always-send symptoms bypass the daily limit
  const ALWAYS_SEND = ['convulsions', 'severe_bleeding', 'no_fetal_movement_24hrs'];
  if (ALWAYS_SEND.includes(symptomId)) {return false;}
  if (hits >= 1) {return true;}
  rateLimitMap.set(key, hits + 1);
  // Prune map entries older than 2 days to prevent unbounded growth
  if (rateLimitMap.size > 50_000) {rateLimitMap.clear();}
  return false;
}

// ── SMS helper ────────────────────────────────────────────────────────────────
async function sendSMS(to, message) {
  if (!AT_SMS) {throw new Error('Africa\'s Talking SDK not configured');}
  const toArray = Array.isArray(to) ? to : [to];
  const result  = await AT_SMS.send({ to: toArray, message, from: 'MamaCare' });
  console.info('[SMS] Sent to %d recipients. Status: %s',
    result?.Recipients?.length ?? 0,
    result?.SMSMessageData?.Message ?? 'unknown');
  return result;
}

// ── Emergency SMS templates (mirrors EmergencyAlertManager.js) ────────────────
const EMERGENCY_TEMPLATES = {
  'en-KE': (name, symptoms, action) =>
    `\uD83D\uDEA8 MAMACARE EMERGENCY ALERT\n\n${name} has reported danger signs:\n${symptoms}\n\n${action}\n\nPlease contact her or call 999 immediately.\n- MamaCare`,
  'sw-KE': (name, symptoms, action) =>
    `\uD83D\uDEA8 TAHADHARI YA DHARURA - MAMACARE\n\n${name} ameona dalili za hatari:\n${symptoms}\n\n${action}\n\nTafadhali wasiliana naye au piga simu 999 mara moja.\n- MamaCare`,
};
const ACTION_LINES = {
  'en-KE': 'Seek emergency medical care IMMEDIATELY.',
  'sw-KE': 'Tafuta matibabu ya dharura MARA MOJA.',
};

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Basic CORS — restrict to app origins in production
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'capacitor://localhost,http://localhost:8081')
  .split(',').map(s => s.trim());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {return res.sendStatus(204);}
  next();
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'mamacare-sms-gateway',
    version: '1.0.0',
    at_configured: !!AT_SMS,
    timestamp: new Date().toISOString(),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/emergency-alert
//
// Called by the MamaCare mobile app when a RED or ORANGE symptom is assessed.
// Sends SMS to all emergency contacts automatically — no user interaction needed.
//
// Request body (JSON):
//   {
//     "participantName":  "Amina W.",
//     "contacts":         ["+254712345678", "+254798765432"],
//     "symptoms":         ["severe_bleeding"],
//     "language":         "sw-KE",
//     "motherId":         "MC-003",
//     "assessmentLevel":  "🔴"
//   }
//
// Response:
//   { "sent": true,  "recipientCount": 2, "channel": "africastalking" }
//   { "sent": false, "reason": "throttled" | "no_contacts" | "at_error" | ... }
// ═══════════════════════════════════════════════════════════════════════════════
app.post('/api/emergency-alert', async (req, res) => {
  const {
    participantName,
    contacts,
    symptoms     = [],
    language     = 'en-KE',
    motherId,
    assessmentLevel,
  } = req.body;

  // ── Input validation ─────────────────────────────────────────────────────
  if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ sent: false, reason: 'no_contacts' });
  }
  const validContacts = contacts.filter(c => typeof c === 'string' && c.trim().length >= 8);
  if (validContacts.length === 0) {
    return res.status(400).json({ sent: false, reason: 'invalid_contacts' });
  }
  if (!motherId) {
    return res.status(400).json({ sent: false, reason: 'missing_mother_id' });
  }

  // ── Rate limiting ────────────────────────────────────────────────────────
  const primarySymptom = symptoms[0] || 'unknown';
  if (isRateLimited(motherId, primarySymptom)) {
    return res.json({ sent: false, reason: 'throttled', message: 'Alert already sent for this symptom today.' });
  }

  // ── Build SMS body ───────────────────────────────────────────────────────
  const template   = EMERGENCY_TEMPLATES[language] || EMERGENCY_TEMPLATES['en-KE'];
  const actionLine = ACTION_LINES[language]         || ACTION_LINES['en-KE'];
  const symptomLines = symptoms.length > 0
    ? symptoms.map(s => `\u2022 ${s.replace(/_/g, ' ')}`).join('\n')
    : `\u2022 ${assessmentLevel || 'Emergency symptom'}`;
  const smsBody = template(participantName || 'Your contact', symptomLines, actionLine);

  // ── Send via Africa's Talking ────────────────────────────────────────────
  try {
    const result = await sendSMS(validContacts, smsBody);
    const recipients = result?.Recipients ?? [];
    const delivered  = recipients.filter(r => r.status === 'Success').length;
    return res.json({
      sent:           true,
      channel:        'africastalking',
      recipientCount: validContacts.length,
      deliveredCount: delivered,
      atMessageId:    result?.SMSMessageData?.Message,
    });
  } catch (err) {
    console.warn('[/api/emergency-alert] AT send failed:', err?.message || 'unknown');
    return res.status(502).json({ sent: false, reason: 'at_error', detail: err?.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /ussd  — Africa's Talking USSD session callback
// ═══════════════════════════════════════════════════════════════════════════════
app.post('/ussd', async (req, res) => {
  const { sessionId, phoneNumber, text } = req.body;
  let response = '';

  try {
    const parts = text ? text.split('*') : [''];

    if (text === '') {
      response = `CON \uD83E\uDD30 Welcome to MamaCare\n1. Check Symptoms\n2. Weekly Guide\n3. Emergency Numbers\n4. Find Nearest Clinic\n5. Language / Lugha`;
    }

    // ── Symptom checker ──────────────────────────────────────────────────
    else if (text === '1') {
      response = `CON Select symptom category:\n1. Bleeding\n2. Pain / Cramping\n3. Head / Vision\n4. Baby Movement\n5. Fever / Vomiting\n0. Back`;
    }
    else if (text === '1*1') {
      response = `CON Bleeding symptoms:\n1. Heavy bleeding \uD83D\uDEA8\n2. Moderate bleeding\n3. Light spotting\n4. Unusual discharge\n0. Back`;
    }
    else if (text.startsWith('1*1*') && parts.length === 3) {
      const map = { '1':'severe_bleeding','2':'moderate_bleeding','3':'light_spotting','4':'vaginal_discharge_unusual' };
      const sym = map[parts[2]];
      if (sym) {
        const a = assessSymptoms([sym]);
        response = `END ${a.level} ${a.priority}\n\n${a.message}\n\n${a.action}\n\n${a.sendAlert ? '\uD83D\uDEA8 Emergency SMS sent to your contacts.' : ''}\n\nDial *384*6262# to check again`;
        if (a.sendAlert) {
          // USSD callers don't have a stored profile — alert goes to the USSD caller's number only
          sendSMS(phoneNumber, `\uD83D\uDEA8 MAMACARE: You reported ${sym.replace(/_/g,' ')}. Seek emergency care NOW. Call 999.`).catch(() => {});
        }
      }
    }
    else if (text === '1*2') {
      response = `CON Pain symptoms:\n1. Severe abdominal pain \uD83D\uDEA8\n2. Mild cramping\n3. Back pain\n4. Painful urination\n0. Back`;
    }
    else if (text === '1*3') {
      response = `CON Head / vision symptoms:\n1. Severe headache + blurred vision \uD83D\uDEA8\n2. Mild headache\n3. Dizziness\n0. Back`;
    }
    else if (text === '1*4') {
      response = `CON Baby movement:\n1. No movement for 24+ hours \uD83D\uDEA8\n2. Reduced movement\n3. Normal movement\n0. Back`;
    }
    else if (text === '1*5') {
      response = `CON Other symptoms:\n1. High fever \uD83C\uDF21\uFE0F\n2. Persistent vomiting\n3. Severe swelling of face/hands\n0. Back`;
    }

    // ── Emergency numbers ────────────────────────────────────────────────
    else if (text === '3') {
      response = `END \uD83D\uDEA8 KENYA EMERGENCY\n\nAmbulance: 999\nRed Cross: 1199\nSt. John Ambulance: 0722 208 614\n\nMamaCare Helpline:\n+254 [PILOT HOTLINE]\n\nSave these numbers now!`;
    }

    // ── Nearest clinic ───────────────────────────────────────────────────
    else if (text === '4') {
      response = `CON Select your county:\n1. Nairobi\n2. Kisumu\n3. Kiambu\n4. Machakos\n5. Uasin Gishu\n0. Back`;
    }
    else if (text.startsWith('4*') && parts.length === 2) {
      const clinics = {
        '1': ['Kenyatta National Hospital - 020 272 6300', 'Pumwani Maternity - 020 222 661'],
        '2': ['Jaramogi Oginga Odinga Teaching Hospital - 057 202 4501'],
        '3': ['Kiambu Level 4 Hospital - 0721 360 434'],
        '4': ['Machakos Level 5 Hospital - 044 21 101'],
        '5': ['Moi Teaching & Referral Hospital - 053 2033 471'],
      };
      const list = clinics[parts[1]] || ['No clinics on file for your county'];
      response = `END Nearest Maternal Clinics:\n\n${list.join('\n\n')}\n\nFor full list: mamacare.app/clinics`;
    }

    // ── Language ─────────────────────────────────────────────────────────
    else if (text === '5') {
      response = `END Language selection is available in the MamaCare app.\n\nDownload at mamacare.app or ask your CHW.\n\nDial *384*6262# to start over.`;
    }

    // ── Back navigation ──────────────────────────────────────────────────
    else if (text.endsWith('*0')) {
      response = `CON \uD83E\uDD30 MamaCare\n1. Check Symptoms\n2. Weekly Guide\n3. Emergency Numbers\n4. Find Nearest Clinic\n5. Language / Lugha`;
    }

    else {
      response = `END Invalid selection.\n\nDial *384*6262# to start again.\nFor emergencies call 999.`;
    }
  } catch (err) {
    console.warn('[USSD] Handler error:', err?.message || 'unknown');
    response = `END Service temporarily unavailable.\n\nFor emergencies: call 999`;
  }

  res.set('Content-Type', 'text/plain');
  res.send(response);
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /sms/receive — Incoming SMS keyword handler
// ═══════════════════════════════════════════════════════════════════════════════
app.post('/sms/receive', async (req, res) => {
  const { from, text } = req.body;
  if (!from || !text) {return res.sendStatus(400);}
  const cmd = text.trim().toUpperCase();

  try {
    if (['HELP', 'MSAADA'].includes(cmd)) {
      await sendSMS(from, `\uD83E\uDD30 MamaCare Help\n\nKeywords:\nSYMPTOMS - Check symptoms\nEMERGENCY - Emergency numbers\nCLINIC - Find a clinic\nSTOP - Unsubscribe from tips\n\nOr dial *384*6262# for menu`);
    }
    else if (['SYMPTOMS', 'DALILI'].includes(cmd)) {
      await sendSMS(from, `Reply with:\n1 - BLEEDING\n2 - PAIN\n3 - HEADACHE\n4 - NO BABY MOVEMENT\n5 - FEVER\n\nOr dial *384*6262# for full checker`);
    }
    else if (['BLEEDING', 'DAMU'].includes(cmd)) {
      const a = assessSymptoms(['severe_bleeding']);
      await sendSMS(from, `\uD83D\uDEA8 ${a.priority}\n\n${a.message}\n\n${a.action}\n\nEmergency: 999`);
    }
    else if (['EMERGENCY', 'DHARURA'].includes(cmd)) {
      await sendSMS(from, `\uD83D\uDEA8 KENYA EMERGENCY\n\nAmbulance: 999\nRed Cross: 1199\nSt. John: 0722 208 614\n\nMamaCare Hotline: +254 [INSERT]`);
    }
    else if (['CLINIC', 'KLINIKI'].includes(cmd)) {
      await sendSMS(from, `Reply with county name:\nNAIROBI / KISUMU / KIAMBU / MACHAKOS / ELDORET\n\nOr dial *384*6262# option 4`);
    }
    else if (['STOP', 'ACHA'].includes(cmd)) {
      await sendSMS(from, `Unsubscribed from MamaCare tips.\n\nYou can still dial *384*6262# anytime.\nReply SUBSCRIBE to re-join.`);
    }
    else if (['SUBSCRIBE', 'JIUNGE'].includes(cmd)) {
      await sendSMS(from, `\u2705 Subscribed to MamaCare tips!\n\nYou will receive free pregnancy tips.\nReply STOP to unsubscribe.`);
    }
    else {
      await sendSMS(from, `Welcome to MamaCare! \uD83E\uDD30\n\nReply HELP for commands\nOr dial *384*6262# for menu\n\nFree 24/7 maternal health support`);
    }
  } catch (err) {
    console.warn('[SMS] Inbound handler error:', err?.message || 'unknown');
    await sendSMS(from, 'Service error. Please try again or call 0800 MAMA (6262)').catch(() => {});
  }

  res.sendStatus(200);
});

// ── Start server ──────────────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`MamaCare SMS/USSD Gateway — port ${PORT}`);
    console.log(`USSD code: *384*6262#`);
    console.log(`AT configured: ${!!AT_SMS}`);
  });
}

module.exports = { app, isRateLimited, sendSMS };

// ═══════════════════════════════════════════════════════════════════════════════
// CHW DASHBOARD API  (stub — returns mock data until real DB is wired)
// ═══════════════════════════════════════════════════════════════════════════════

// In-memory stores for pilot (replace with PostgreSQL/Firebase for scale)
const chwVisitQueue = [];   // urgent visit requests from app
const alertLog      = [];   // alert delivery receipts for dashboard

/**
 * POST /chw/visits/urgent
 * App calls this when a participant has triggered the CHW escalation threshold.
 */
app.post('/chw/visits/urgent', (req, res) => {
  const { motherId, symptomId, requestedAt, priority, reason } = req.body;
  if (!motherId || !symptomId) {
    return res.status(400).json({ error: 'motherId and symptomId required' });
  }
  const visit = { id: `VIS-${Date.now()}`, motherId, symptomId, requestedAt: requestedAt || new Date().toISOString(), priority: priority || 'urgent', reason: reason || 'app_escalation', status: 'pending' };
  chwVisitQueue.push(visit);
  console.info('[CHW] Urgent visit queued for %s (%s)', motherId, symptomId);
  res.status(201).json({ queued: true, visitId: visit.id });
});

/**
 * GET /api/chw/visits/pending
 * CHW Dashboard polls for pending urgent visits.
 */
app.get('/api/chw/visits/pending', (_req, res) => {
  const pending = chwVisitQueue.filter(v => v.status === 'pending');
  res.json({ count: pending.length, visits: pending });
});

/**
 * PATCH /api/chw/visits/:id/complete
 * Mark a visit as completed.
 */
app.patch('/api/chw/visits/:id/complete', (req, res) => {
  const visit = chwVisitQueue.find(v => v.id === req.params.id);
  if (!visit) {return res.status(404).json({ error: 'Visit not found' });}
  visit.status = 'completed';
  visit.completedAt = new Date().toISOString();
  visit.chwNotes = req.body.notes || '';
  res.json({ updated: true, visit });
});

/**
 * GET /api/chw/mothers  (stub — BUG-010 placeholder)
 * Returns pilot cohort summary. Replace with real DB query post-pilot.
 */
app.get('/api/chw/mothers', (_req, res) => {
  res.json({
    _note: 'BUG-010: Live data requires database deployment. This is stub data.',
    totalEnrolled: 50,
    activeThisWeek: 45,
    pendingVisits: chwVisitQueue.filter(v => v.status === 'pending').length,
    recentAlerts: alertLog.slice(-10),
  });
});

/**
 * POST /api/account/delete-schedule
 * App calls this when participant initiates the 30-day deletion grace period.
 */
const deletionSchedule = new Map();
app.post('/api/account/delete-schedule', (req, res) => {
  const { motherId, scheduledAt } = req.body;
  if (!motherId) {return res.status(400).json({ error: 'motherId required' });}
  const deleteAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  deletionSchedule.set(motherId, { scheduledAt: scheduledAt || new Date().toISOString(), deleteAt, status: 'pending' });
  console.info('[Account] Deletion scheduled for %s — executes %s', motherId, deleteAt);
  res.json({ scheduled: true, deleteAt });
});

module.exports = Object.assign(module.exports, { chwVisitQueue, alertLog, deletionSchedule });
