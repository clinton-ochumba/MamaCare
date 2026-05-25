# MamaCare v1.0

**Maternal health companion app for pregnant women in Kenya.**  
Triage symptoms, send emergency alerts, track your pregnancy — in 8 languages, offline-first.

---

## Quick Start

```bash
# Prerequisites: Node.js 20+, npm 10+, Expo CLI
npm install -g expo-cli

# Clone and install
npm install

# Configure environment
cp .env.example .env
# Edit .env — see Environment Variables section below

# Run tests
npm test

# Start the app
npx expo start
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_GOOGLE_STT_KEY` | Yes (voice) | Google Cloud Speech-to-Text API key. Voice checker is disabled without it. |
| `EXPO_PUBLIC_API_BASE_URL` | Yes (CHW) | MamaCare backend URL. CHW Dashboard shows stub data without it. |
| `AFRICASTALKING_API_KEY` | Yes (SMS) | Africa's Talking key for USSD/SMS fallback on low-end devices. |
| `AFRICASTALKING_USERNAME` | Yes (SMS) | Africa's Talking username (usually `mamacare`). |
| `SESSION_TIMEOUT_MS` | No | Inactivity lock timeout in ms. Default: `1800000` (30 minutes). |
| `EXPO_PUBLIC_VOICE_ENABLED` | No | Set to `false` to disable voice checker. Default: `true`. |

## Frontend Web Deployment (Vercel)

The Expo app can also be deployed as a static web preview on Vercel. The mobile Android/iOS application should still be built through EAS, while Vercel hosts the browser-friendly Expo web output.

### Deploy to Vercel

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build the Expo web app:
   ```bash
   npm run build
   ```
3. Create a Vercel project and connect the GitHub repo.
4. Set the Vercel build command to:
   ```bash
   npm run build
   ```
5. Set the output directory to:
   ```text
   web-build
   ```
6. Add the environment variable:
   - `EXPO_PUBLIC_API_BASE_URL` = `https://<your-backend-url>`

### Notes

- `EXPO_PUBLIC_API_BASE_URL` must point to the deployed backend so the web preview can call the API.
- This static web deployment is for preview/demo use; the mobile app should still be published via EAS.

---

## Project Structure

```
MamaCare/
├── App.js                          # Root navigator + SessionManager wrapper
├── app.config.js                   # Expo configuration
├── babel.config.js                 # Babel/Jest transpilation config
├── .env.example                    # Environment variable template
│
├── src/
│   ├── screens/
│   │   ├── OnboardingScreenEnhanced.js   # Language select, profile setup, LMP entry
│   │   ├── ConsentScreen.js              # ODPC-compliant consent flow
│   │   ├── HomeScreen_Enhanced.js        # Dashboard: gestational age, due date
│   │   ├── VoiceSymptomCheckerScreen.js  # Voice + text symptom triage
│   │   ├── CHWDashboard.jsx              # Community Health Worker view
│   │   ├── DocumentViewer.js             # Legal doc viewer (ToS, Privacy, Disclaimer)
│   │   └── SettingsScreen.js             # Data export, account deletion, PIN reset
│   │
│   ├── utils/
│   │   ├── riskAssessment.js             # Symptom → RED/ORANGE/YELLOW/GREEN triage
│   │   ├── dateCalculations.js           # Gestational age, due date (Naegele's rule)
│   │   ├── EmergencyAlertManager.js      # Throttled, translated emergency SMS
│   │   ├── secureStorage.js              # PHI-aware encrypted storage wrapper
│   │   ├── languages.js                  # 8-language translation strings + t() helper
│   │   └── sms-ussd-gateway.js           # Africa's Talking SMS/USSD bridge
│   │
│   └── components/
│       └── SessionManager.js             # 30-min inactivity lock + PIN screen
│
├── __tests__/
│   ├── utils/
│   │   ├── riskAssessment.test.js        # ← NEW: clinical triage engine (83 tests)
│   │   ├── dateCalculations.test.js      # ← NEW: gestational age calculations (47 tests)
│   │   ├── EmergencyAlertManager.test.js # Emergency alert throttle + SMS
│   │   ├── secureStorage.test.js         # PHI routing + chunking
│   │   ├── languages.test.js             # All 8 languages × 38 keys
│   │   ├── lmpValidation.test.js         # Date validation
│   │   └── validateLmpDate.test.js
│   ├── screens/
│   │   └── screens.test.js               # DocumentViewer, SessionManager
│   └── integration/
│       └── criticalFlows.test.js         # End-to-end safety flows
│
├── __mocks__/                            # Jest mocks for native modules
├── legal/                                # Terms, Privacy Policy, Medical Disclaimer
├── compliance/                           # ODPC Kenya DPA 2019 registration
├── .github/workflows/ci.yml             # GitHub Actions CI pipeline
├── ALPHA_TEST_REPORT.md                 # Full alpha test report (49 test cases)
└── RELEASE_NOTES_v1.0.md
```

---

## Supported Languages

| Code | Language | Native Name |
|------|----------|-------------|
| `en-KE` | English | English |
| `sw-KE` | Swahili | Kiswahili |
| `ki-KE` | Kikuyu | Gĩkũyũ |
| `luo-KE` | Luo | Dholuo |
| `kln-KE` | Kalenjin | Kalenjin |
| `kam-KE` | Kamba | Kikamba |
| `luy-KE` | Luhya | Luhya |
| `guz-KE` | Kisii | Ekegusii |

---

## Risk Triage Levels

| Level | Colour | Action |
|-------|--------|--------|
| 🔴 RED | EMERGENCY | Call 999 / go to hospital NOW. SMS sent to emergency contacts. |
| 🟠 ORANGE | URGENT | Go to clinic or hospital today. |
| 🟡 YELLOW | MONITOR | Contact CHW or clinic within 24 hours. |
| 🟢 GREEN | NORMAL | Common pregnancy symptom. Mention at next antenatal visit. |

---

## Testing

```bash
# All tests
npm test

# With coverage report
npm run test:coverage

# Watch mode
npm run test:watch

# Safety invariants only (recommended before every release)
npx jest --testPathPattern="riskAssessment|EmergencyAlertManager" --verbose
```

**Coverage thresholds** (enforced in CI):
- Lines / Statements / Functions: **80%**
- Branches: **70%**

---

## Data Security

All Personal Health Information (PHI) is encrypted at rest using `expo-secure-store` (iOS Keychain / Android Keystore). Sensitive keys include: user profile, symptom history, emergency contacts, consents, alert throttle history, and the app PIN.

Non-PHI UI state (language preference, theme) uses AsyncStorage for performance.

No health data leaves the device except:
1. Emergency SMS to the user's own emergency contacts (with user's explicit consent)
2. Anonymous, aggregated data to the CHW dashboard (with optional research consent)

---

## Compliance

- **Kenya Data Protection Act 2019 / ODPC** — Consent flows, data export, 30-day deletion grace period. See `compliance/ODPC_REGISTRATION_APPLICATION.md`.
- **Medical Disclaimer** — MamaCare is NOT a medical service. See `legal/MEDICAL_DISCLAIMER.txt`.
- **Emergency Numbers** — Kenya: 999 (general emergency), 0800 720 160 (NHIF), 0800 723 253 (Ministry of Health hotline).

---

## Known Limitations (v1.0)

- **BUG-010**: CHW Dashboard requires backend API deployment (`GET /api/chw/mothers`). Shows placeholder data without it.
- **Voice STT**: Kikuyu, Luo, Kalenjin, Kamba, Luhya, and Kisii fall back to English/Swahili STT. Local language model training is a future milestone.
- **Offline voice**: Not yet available. Voice checker requires internet for Google STT.

---

*MamaCare is built for and with communities in Kenya. Translations verified with native speakers.*
