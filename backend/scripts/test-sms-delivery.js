#!/usr/bin/env node
/**
 * backend/scripts/test-sms-delivery.js
 * ──────────────────────────────────────
 * Pre-launch SMS delivery verification script.
 *
 * Run this against your deployed backend (or locally) to confirm:
 *   1. Africa's Talking API key is valid and the backend is reachable
 *   2. SMS reaches Safaricom, Airtel Kenya, and Telkom Kenya SIMs
 *   3. Emergency alert endpoint works end-to-end
 *   4. USSD endpoint responds with correct Content-Type
 *   5. CHW and account endpoints are reachable
 *
 * Usage:
 *   BACKEND_URL=https://your-backend.railway.app \
 *   SAFARICOM_TEST_NUMBER=+2547XXXXXXXX \
 *   AIRTEL_TEST_NUMBER=+2547XXXXXXXX \
 *   TELKOM_TEST_NUMBER=+2540XXXXXXXX \
 *   node backend/scripts/test-sms-delivery.js
 *
 * Local testing (start backend first: node backend/sms-ussd-gateway.js):
 *   BACKEND_URL=http://localhost:3000 \
 *   SAFARICOM_TEST_NUMBER=+2547XXXXXXXX \
 *   node backend/scripts/test-sms-delivery.js
 *
 * IMPORTANT: Use real test SIM cards you own. Africa's Talking sandbox mode
 * does NOT actually deliver SMS — you must use LIVE (production) API keys.
 * Confirm each message is received on the physical device before the pilot.
 *
 * Exit code: 0 = all tests passed, 1 = one or more tests failed
 */

'use strict';

const BACKEND_URL           = process.env.BACKEND_URL           || 'http://localhost:3000';
const SAFARICOM_TEST_NUMBER = process.env.SAFARICOM_TEST_NUMBER || '';
const AIRTEL_TEST_NUMBER    = process.env.AIRTEL_TEST_NUMBER    || '';
const TELKOM_TEST_NUMBER    = process.env.TELKOM_TEST_NUMBER    || '';

const results = [];
let passed = 0;
let failed = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────
function pass(id, desc, detail = '') {
  console.log(`  \u2705  ${id}: ${desc}${detail ? ' \u2014 ' + detail : ''}`);
  results.push({ id, status: 'PASS', desc, detail });
  passed++;
}

function fail(id, desc, detail = '') {
  console.error(`  \u274C  ${id}: ${desc}${detail ? ' \u2014 ' + detail : ''}`);
  results.push({ id, status: 'FAIL', desc, detail });
  failed++;
}

function skip(id, desc, reason = '') {
  console.log(`  \u23ED   ${id}: ${desc} \u2014 SKIPPED (${reason})`);
  results.push({ id, status: 'SKIP', desc, reason });
}

async function post(path, body) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (_) { json = null; }
  return { status: res.status, headers: res.headers, text, json };
}

async function get(path) {
  const res = await fetch(`${BACKEND_URL}${path}`, { signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (_) { json = null; }
  return { status: res.status, headers: res.headers, text, json };
}

async function postForm(path, params) {
  const body = new URLSearchParams(params).toString();
  const res  = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  return { status: res.status, contentType: res.headers.get('content-type'), text: await res.text() };
}

function prompt(question) {
  return new Promise(resolve => {
    process.stdout.write(question);
    process.stdin.once('data', data => resolve(data.toString().trim().toUpperCase()));
  });
}

// ── Test suite ────────────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n' + '='.repeat(64));
  console.log('  MamaCare Backend Pre-Launch Delivery Test');
  console.log('  Backend: ' + BACKEND_URL);
  console.log('  Date:    ' + new Date().toISOString());
  console.log('='.repeat(64) + '\n');

  // T-01: Health check
  console.log('[ Infrastructure ]');
  try {
    const r = await get('/health');
    if (r.status === 200 && r.json?.status === 'ok') {
      pass('T-01', 'Health check passes', 'AT configured: ' + r.json.at_configured);
      if (!r.json.at_configured) {
        fail('T-01b', 'Africa\'s Talking not configured',
          'AFRICASTALKING_API_KEY is missing or africastalking package not installed');
      }
    } else {
      fail('T-01', 'Health check', 'HTTP ' + r.status + ': ' + r.text.slice(0, 100));
    }
  } catch (e) {
    fail('T-01', 'Health check', 'Cannot reach backend: ' + e.message);
    console.error('\n  FATAL: Backend is unreachable. Confirm it is running and BACKEND_URL is correct.\n');
    printSummary();
    process.exit(1);
  }

  // T-02: USSD content-type (Africa's Talking requires text/plain)
  try {
    const r = await postForm('/ussd', {
      sessionId: 'prelaunch-test', phoneNumber: '+254700000001', text: '',
    });
    if (r.status === 200 && r.contentType && r.contentType.includes('text/plain')) {
      pass('T-02', 'USSD returns Content-Type: text/plain (required by Africa\'s Talking)');
    } else {
      fail('T-02', 'USSD Content-Type', 'Got: ' + r.contentType + ' (need text/plain)');
    }
  } catch (e) { fail('T-02', 'USSD content-type test', e.message); }

  // T-03: USSD main menu structure
  try {
    const r = await postForm('/ussd', {
      sessionId: 'prelaunch-test-2', phoneNumber: '+254700000002', text: '',
    });
    if (r.text.startsWith('CON') && r.text.includes('Check Symptoms') && r.text.includes('Emergency')) {
      pass('T-03', 'USSD main menu contains expected options');
    } else {
      fail('T-03', 'USSD main menu content', r.text.slice(0, 100));
    }
  } catch (e) { fail('T-03', 'USSD main menu', e.message); }

  // T-04: USSD severe bleeding path → END with 999
  try {
    const r = await postForm('/ussd', {
      sessionId: 'prelaunch-test-3', phoneNumber: '+254700000003', text: '1*1*1',
    });
    if (r.text.startsWith('END') && r.text.includes('999')) {
      pass('T-04', 'USSD severe bleeding path returns END with emergency number 999');
    } else {
      fail('T-04', 'USSD bleeding response', r.text.slice(0, 120));
    }
  } catch (e) { fail('T-04', 'USSD bleeding flow', e.message); }

  // T-05–06: Emergency alert input validation
  console.log('\n[ /api/emergency-alert validation ]');
  try {
    const r = await post('/api/emergency-alert', {
      contacts: [], motherId: 'MC-TEST-PRELAUNCH', symptoms: ['severe_bleeding'],
    });
    r.status === 400 && r.json?.reason === 'no_contacts'
      ? pass('T-05', 'Empty contacts array rejected with 400 + no_contacts reason')
      : fail('T-05', 'Empty contacts validation', 'HTTP ' + r.status + ': ' + JSON.stringify(r.json));
  } catch (e) { fail('T-05', 'Contacts validation', e.message); }

  try {
    const { motherId: _drop, ...body } = {
      contacts: ['+254712345678'], symptoms: ['severe_bleeding'], motherId: undefined,
    };
    const r = await post('/api/emergency-alert', body);
    r.status === 400
      ? pass('T-06', 'Missing motherId rejected with 400')
      : fail('T-06', 'motherId validation', 'HTTP ' + r.status);
  } catch (e) { fail('T-06', 'motherId validation', e.message); }

  // T-07–09: Live SMS delivery per network
  console.log('\n[ Live SMS delivery \u2014 requires physical SIM confirmation ]');
  console.log('  Each test sends a real SMS to your test SIM. Confirm receipt on device.\n');

  const networks = [
    { id: 'T-07', name: 'Safaricom',    number: SAFARICOM_TEST_NUMBER },
    { id: 'T-08', name: 'Airtel Kenya', number: AIRTEL_TEST_NUMBER    },
    { id: 'T-09', name: 'Telkom Kenya', number: TELKOM_TEST_NUMBER    },
  ];

  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  for (const { id, name, number } of networks) {
    if (!number) {
      skip(id, name + ' SMS delivery', name.split(' ')[0].toUpperCase() + '_TEST_NUMBER env var not set');
      continue;
    }

    console.log('  Sending test alert to ' + name + ' (' + number + ')...');
    try {
      const r = await post('/api/emergency-alert', {
        participantName: 'MamaCare Pre-Launch Test',
        contacts:        [number],
        symptoms:        ['severe_bleeding'],
        language:        'en-KE',
        motherId:        'PRELAUNCH-' + name.replace(/\s/g, '-') + '-' + Date.now(),
        assessmentLevel: '\uD83D\uDD34',
      });

      if (r.status === 200 && r.json?.sent === true) {
        console.log('  API response: SENT \u2713  (AT: ' + (r.json.atMessageId || 'n/a') + ')');
        console.log('  Expected: "MAMACARE EMERGENCY ALERT ... Seek emergency medical care IMMEDIATELY."');

        const answer = await prompt('  Did the SMS arrive on the ' + name + ' SIM? (Y/N): ');
        if (answer === 'Y') {
          pass(id, name + ' SMS delivery', 'Physically confirmed on device');
        } else {
          fail(id, name + ' SMS delivery',
            'API reported sent but not received — check AT dashboard > SMS > Delivery Reports');
        }

      } else if (r.status === 200 && r.json?.sent === false && r.json?.reason === 'throttled') {
        skip(id, name + ' SMS delivery', 'Rate-limited (same motherId used today). Change BACKEND_URL or wait until midnight EAT.');
      } else {
        fail(id, name + ' SMS delivery',
          'HTTP ' + r.status + ': ' + JSON.stringify(r.json));
      }
    } catch (e) {
      fail(id, name + ' SMS delivery', e.message);
    }
  }

  process.stdin.pause();

  // T-10–12: CHW and account endpoints
  console.log('\n[ CHW & account API ]');
  try {
    const r = await post('/chw/visits/urgent', {
      motherId: 'MC-PRELAUNCH', symptomId: 'fever', priority: 'urgent', reason: 'prelaunch-test',
    });
    r.status === 201 && r.json?.queued === true
      ? pass('T-10', 'POST /chw/visits/urgent creates a visit', 'visitId: ' + r.json.visitId)
      : fail('T-10', 'CHW urgent visit', 'HTTP ' + r.status + ': ' + JSON.stringify(r.json));
  } catch (e) { fail('T-10', 'CHW visits endpoint', e.message); }

  try {
    const r = await get('/api/chw/visits/pending');
    r.status === 200 && typeof r.json?.count === 'number'
      ? pass('T-11', 'GET /api/chw/visits/pending returns count', r.json.count + ' pending')
      : fail('T-11', 'Pending visits endpoint', 'HTTP ' + r.status);
  } catch (e) { fail('T-11', 'Pending visits', e.message); }

  try {
    const r = await post('/api/account/delete-schedule', { motherId: 'MC-PRELAUNCH-DEL' });
    r.status === 200 && r.json?.scheduled === true
      ? pass('T-12', 'POST /api/account/delete-schedule schedules deletion', 'deleteAt: ' + r.json.deleteAt)
      : fail('T-12', 'Deletion scheduling', 'HTTP ' + r.status + ': ' + JSON.stringify(r.json));
  } catch (e) { fail('T-12', 'Deletion scheduling', e.message); }

  printSummary();
}

function printSummary() {
  const skipped = results.filter(r => r.status === 'SKIP').length;

  console.log('\n' + '='.repeat(64));
  console.log('  PRE-LAUNCH TEST SUMMARY');
  console.log('='.repeat(64));
  console.log('  Passed:  ' + passed + '  |  Failed: ' + failed + '  |  Skipped: ' + skipped);
  console.log('-'.repeat(64));

  if (failed === 0 && skipped === 0) {
    console.log('  \u2705  ALL TESTS PASSED \u2014 backend is ready for pilot launch');
  } else if (failed === 0) {
    console.log('  \u26A0\uFE0F  Infrastructure tests passed but SMS delivery not fully confirmed.');
    console.log('  Set SAFARICOM_TEST_NUMBER, AIRTEL_TEST_NUMBER, TELKOM_TEST_NUMBER and re-run.');
  } else {
    console.log('  \u274C  ' + failed + ' TEST(S) FAILED \u2014 do NOT proceed to pilot until resolved');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log('  \u2022 ' + r.id + ': ' + r.desc);
      if (r.detail) console.log('    ' + r.detail);
    });
  }

  if (skipped > 0) {
    console.log('\n  Skipped (no test number provided):');
    results.filter(r => r.status === 'SKIP').forEach(r => {
      console.log('  \u2022 ' + r.id + ': ' + r.desc);
    });
  }

  console.log('='.repeat(64) + '\n');
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Unexpected test runner error:', e);
  process.exit(1);
});
