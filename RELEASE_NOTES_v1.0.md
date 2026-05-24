# MamaCare v1.0 Release Notes

**Release Date:** 28 February 2026  
**Previous Version:** v2.1.0-rc1 (internal pre-alpha)  
**Build Type:** Alpha-tested, pilot-ready

---

## What's in This Release

MamaCare v1.0 is the first fully stable, alpha-tested build of MamaCare — a maternal health companion app for pregnant women in Kenya, supporting 8 languages and working in offline-first, low-bandwidth environments.

### Key Features
- **Voice & Text Symptom Checker** — Describe symptoms by voice or text; real-time triage into RED/ORANGE/YELLOW/GREEN
- **Emergency Alert System** — Automated SMS to emergency contacts in user's language when danger signs are detected; smart throttling prevents alert fatigue
- **8-Language Support** — English, Kiswahili, Gĩkũyũ, Dholuo, Kalenjin, Kikamba, Luhya, Ekegusii
- **Encrypted Health Data** — All PHI stored in OS-level SecureStore (not plaintext storage)
- **Session Lock** — Auto-locks after 30 minutes of inactivity; PIN-protected
- **Legal Compliance** — ODPC Kenya DPA 2019-compliant consent flows, data export, 30-day deletion grace period
- **CHW Dashboard** — Community Health Worker view of patient alerts and progress (requires backend)
- **Weekly Pregnancy Guide** — Week-by-week content from conception to delivery

### Fixes Since Pre-Alpha (v2.1-rc1)
7 new defects discovered and resolved during alpha testing. See `ALPHA_TEST_REPORT.md` for full details.

The most important fix: **3 sensitive data keys were being stored unencrypted** (`alert_throttle_history`, `app_pin`, `chw_visit_queue`). These now correctly route through `expo-secure-store`.

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and fill in: EXPO_PUBLIC_GOOGLE_STT_KEY, EXPO_PUBLIC_API_BASE_URL, AFRICASTALKING_API_KEY

# 3. Run tests
npm test

# 4. Start the app
npx expo start
```

---

## Known Limitations

- **BUG-010 (CHW Dashboard):** Requires backend API deployment. Dashboard shows stub data without it.
- **Voice STT for local languages:** Kikuyu, Luo, Kalenjin, Kamba, Luhya, Kisii fall back to English or Swahili STT. Local language model training is a future milestone.
- **Offline voice recognition:** Not yet available. Voice checker requires internet for STT API call.

---

*MamaCare is NOT a medical service. See `legal/MEDICAL_DISCLAIMER.txt` for full disclaimer.*
