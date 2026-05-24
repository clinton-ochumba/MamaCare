# MamaCare v1.0 — Security Audit Report

**Date:** 28 February 2026  
**Auditor:** Automated Static Analysis + Code Review  
**Scope:** Full application — React Native client, backend gateway, configuration  
**Standard:** OWASP Mobile Top 10 (2024), Kenya Data Protection Act 2019

---

## Executive Summary

A targeted security audit of MamaCare v1.0 was conducted following alpha testing. The audit examined data-at-rest security, data-in-transit security, PHI leakage vectors, and Android/iOS platform hardening.

**5 vulnerabilities were identified and remediated during this audit.** No critical unresolved vulnerabilities remain. 2 items require backend/native-layer work before the 50-user pilot.

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| 🔴 Critical | 2 | 2 | 0 |
| 🟠 High | 2 | 2 | 0 |
| 🟡 Medium | 1 | 1 | 0 |
| ⚪ Informational | 3 | — | 3 (by design) |

---

## Vulnerability Details

---

### VULN-001 — ADB Backup Allows Full PHI Extraction
**Severity:** 🔴 Critical  
**OWASP Mobile:** M9 — Insecure Data Storage  
**Status:** ✅ Fixed in `app.config.js`

**Description:**  
`app.config.js` did not set `allowBackup: false` for Android. An attacker with USB access to an unlocked Android device could extract the entire app data sandbox — including all files written by `expo-secure-store` — to a local file with a single command, bypassing the Keystore encryption entirely:

```bash
adb backup -noapk com.mamacare.app
```

The output `backup.ab` file can then be unpacked with standard tools, exposing:
- Full user profile (name, age, phone number, LMP date)
- Complete symptom history
- Emergency contact phone numbers
- Consent records
- The app PIN (used to lock the session)

**Why expo-secure-store doesn't fully protect against this:**  
`expo-secure-store` writes data to Android Keystore, which is encrypted. However, the Keystore's exported keys and encrypted blobs are included in `adb backup` output unless `allowBackup: false` is set. The backup protocol predates per-app storage encryption and does not honour Keystore access controls.

**Fix:**  
```javascript
// app.config.js
android: {
  allowBackup: false,       // Prevents adb backup extraction
  usesCleartextTraffic: false,  // Belt-and-suspenders HTTP block
}
```

**Verification test:** `SEC-005` in `__tests__/security/securityAudit.test.js`

---

### VULN-002 — PHI Logged to Console in 6 Locations
**Severity:** 🔴 Critical  
**OWASP Mobile:** M6 — Inadequate Privacy Controls  
**Status:** ✅ Fixed (BUG-008 extended to remaining files)

**Description:**  
The original BUG-008 fix covered most source files but missed 6 `console.error`/`console.log` calls that pass raw objects (error objects, result objects, or phone number variables) as second arguments. On Android, `adb logcat` — accessible without root on debug builds — would capture these logs. On iOS, Console.app reads device logs over USB.

**Specific violations found:**

| File | Line | Code | PHI Risk |
|------|------|------|----------|
| `src/screens/CHWDashboard.jsx` | 70 | `console.error('Error loading dashboard:', error)` | API response in error object may contain mother records |
| `backend/sms-ussd-gateway.js` | 256 | `console.error('USSD Error:', error)` | Error object contains sessionId + phoneNumber |
| `backend/sms-ussd-gateway.js` | 429 | `console.error('SMS Error:', error)` | Error object contains sender phone number (`from` field) |
| `backend/sms-ussd-gateway.js` | 445 | `console.log('SMS sent:', result)` | Result object contains `to` (recipient numbers) |
| `backend/sms-ussd-gateway.js` | 458 | `console.log('No emergency contacts for', phoneNumber)` | Direct phone number in log |
| `backend/sms-ussd-gateway.js` | 544 | `console.error('Error sending to', subscriber.phoneNumber, error)` | Direct phone number in log |

**Fix applied:** Each call replaced with `console.warn('[Tag] description:', err?.message)` — logging only the error message string, never the raw object.

**Verification test:** `SEC-001` in `__tests__/security/securityAudit.test.js`

---

### VULN-003 — Hardcoded Production API Domain in Source
**Severity:** 🟠 High  
**OWASP Mobile:** M2 — Inadequate Supply Chain Security  
**Status:** ✅ Fixed in `EmergencyAlertManager.js`

**Description:**  
`scheduleCHWVisit()` in `EmergencyAlertManager.js` contained a hardcoded string literal:
```javascript
await fetch('https://api.mamacare.app/chw/visits/urgent', { ... })
```

This creates two risks:
1. **Wrong environment:** If a staging or dev build accidentally uses the production URL, real patient data is sent to production systems during testing.
2. **Brittle rotation:** If the API domain changes, it requires a code change and app store update rather than a configuration change.

**Fix:**
```javascript
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.mamacare.app';
await fetch(`${API_BASE_URL}/chw/visits/urgent`, { ... })
```

**Verification test:** `SEC-002` in `__tests__/security/securityAudit.test.js`

---

### VULN-004 — No Android Network Security Policy
**Severity:** 🟠 High  
**OWASP Mobile:** M3 — Insecure Communication  
**Status:** ✅ Fixed — `android/app/src/main/res/xml/network_security_config.xml` created

**Description:**  
Without an explicit `network_security_config.xml`, Android uses its default policy, which:
- Trusts user-installed CA certificates (allows MITM by custom CA)
- Permits cleartext HTTP traffic on Android API < 28
- Does not restrict which certificate authorities are trusted per-domain

This means an attacker who convinces a user to install a custom CA certificate (common in enterprise environments, cafes with captive portals, or via social engineering) can perform a man-in-the-middle attack on all TLS connections, decrypting the audio sent to Google STT or the CHW visit requests.

**Fix:** Created `android/app/src/main/res/xml/network_security_config.xml` with:
- `cleartextTrafficPermitted="false"` globally
- System CAs only (no user-installed CAs trusted)
- Per-domain policies for `api.mamacare.app`, `speech.googleapis.com`, `africastalking.com`
- Certificate pinning scaffold (ready to activate once TLS cert is stable)

**Verification tests:** `SEC-008` in `__tests__/security/securityAudit.test.js`

---

### VULN-005 — Missing PHI Keys in SENSITIVE_KEYS (Unencrypted Storage)
**Severity:** 🟡 Medium (already fixed in v1.0 alpha cycle as NEW-006)  
**Status:** ✅ Fixed in `secureStorage.js`

**Description:** Four keys containing PHI were missing from `SENSITIVE_KEYS` and were stored in unencrypted AsyncStorage. Documented in Alpha Test Report as NEW-006. Confirmed fixed.

**Keys added:** `alert_throttle_history`, `chw_visit_queue`, `app_pin`, `account_deletion_scheduled`

---

## Informational Findings (No Action Required)

### INFO-001 — Google STT API Key in Environment Variable
**Severity:** ⚪ Informational  
**Status:** Acceptable by design — requires operational process

**Description:** The Google STT API key (`EXPO_PUBLIC_GOOGLE_STT_KEY`) is injected at build time and bundled into the JavaScript bundle. In a production EAS build, this value is readable by anyone who decompiles the APK.

**Accepted risk:** This is a known limitation of all mobile apps using client-side API keys. Mitigation is to:
1. Restrict the API key to `speech.googleapis.com` only (in Google Cloud Console)
2. Add application restrictions (Android package name, iOS bundle ID)
3. Monitor API usage for anomalies in Google Cloud Console

**Not in scope for v1.0:** A backend proxy that makes STT calls server-side (hiding the key entirely) is the long-term solution, but requires backend work beyond the current scope.

---

### INFO-002 — Root/Jailbreak Detection is Heuristic Only
**Severity:** ⚪ Informational  
**Status:** Documented in `securityConfig.js`

**Description:** The `checkDeviceIntegrity()` function in `securityConfig.js` provides JS-layer heuristics only. A root user can modify the JS bundle and bypass any JS-layer check.

**Accepted risk:** MamaCare's threat model prioritises preventing data extraction by opportunistic attackers (e.g. someone finding an unlocked phone), not by determined technical attackers with root access to the device owner's phone. The combination of `allowBackup: false` + `expo-secure-store` + network security config provides adequate protection for the target threat model.

**Future enhancement:** Integrate the Play Integrity API (Android) / DeviceCheck (iOS) from a native module for higher assurance.

---

### INFO-003 — Screenshot Prevention Requires Native Module
**Severity:** ⚪ Informational  
**Status:** Documented — requires bare workflow ejection

**Description:** Full FLAG_SECURE protection (prevents task-switcher screenshots that might expose pregnancy status) requires access to the Android `Window` API, which is not available in Expo managed workflow.

**Current mitigation:** `SessionManager.js` renders a blank overlay when the app goes to background, hiding health data from the task switcher image. This addresses the most common privacy risk (someone else seeing the screen).

**Full fix:** Eject to bare workflow and add a native module that calls `getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, ...)`.

---

## Security Test Coverage

The `__tests__/security/securityAudit.test.js` suite provides automated regression coverage for all 5 fixed vulnerabilities. These tests run as part of the standard CI pipeline and cannot be skipped.

| Test ID | What It Catches | Regression Risk |
|---------|----------------|-----------------|
| SEC-001 | PHI in console.error/log | High — easy to reintroduce in new screens |
| SEC-002 | Hardcoded API domains | Medium — new integrations may repeat the pattern |
| SEC-003 | HTTP URLs | Low — ESLint rule also catches this |
| SEC-004 | Missing PHI keys in SENSITIVE_KEYS | High — easy to miss when adding new features |
| SEC-005 | ADB backup / cleartext config | Low — one-time config change |
| SEC-006 | Hardcoded API keys | High — common mistake in new feature PRs |
| SEC-007 | Storage routing correctness | High — core security property, must never regress |
| SEC-008 | Network security config | Low — file rarely changes |

---

## Pre-Pilot Security Checklist

Complete these items before the 50-user pilot:

- [x] ADB backup prevention (`allowBackup: false`) — **Done**
- [x] Cleartext traffic blocked (`usesCleartextTraffic: false`) — **Done**
- [x] Network security config deployed — **Done**
- [x] PHI logging violations fixed — **Done (6 instances)**
- [x] Hardcoded API URL replaced with env variable — **Done**
- [x] Automated security test suite — **Done (SEC-001 through SEC-008)**
- [ ] Restrict Google STT API key to bundle ID in Google Cloud Console — **Operational**
- [ ] Enable Play Integrity API attestation on backend (POST /chw/visits) — **Backend work**
- [ ] Add certificate pins to `network_security_config.xml` once TLS cert is stable — **Post-launch**
- [ ] Run `npm audit` and resolve any HIGH/CRITICAL packages before pilot — **Pre-build**
- [ ] Confirm `.env` is in `.gitignore` and no secrets are in version control — **Verify on first push**

---

## Recommended Security Practices for Ongoing Development

1. **Before every PR:** Run `npm run lint` — the ESLint config flags multi-argument console calls and hardcoded domains automatically.

2. **Before every release:** Run `npm run test -- --testPathPattern=security` — the security audit tests catch regressions.

3. **New storage keys:** Whenever adding a new `secureStorage.setItem()` call with a new key, ask: does this key contain a name, phone number, health status, or date? If yes, add it to `SENSITIVE_KEYS`.

4. **New API calls:** Always use `API_BASE_URL` from `process.env.EXPO_PUBLIC_API_BASE_URL`. Never hardcode a domain. Add the domain to `network_security_config.xml`.

5. **Error handling:** In catch blocks, always log `error?.message || 'unknown'` — never log the raw `error` object. It may contain response bodies with PHI.

---

*This audit covers the MamaCare React Native client and the Africa's Talking SMS/USSD backend gateway. It does not cover the MamaCare REST API backend (not yet deployed). A separate API security review should be conducted before connecting CHW Dashboard features.*
