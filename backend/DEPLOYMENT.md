# MamaCare Backend — Deployment Guide

> **Pilot timeline:** Backend must be deployed and `test-sms-delivery.js` passing at **T-7 days** before the pilot begins.

---

## What the backend does

| Endpoint | Called by | Purpose |
|---|---|---|
| `POST /api/emergency-alert` | Mobile app | Sends automatic SMS to emergency contacts via Africa's Talking. This is the **critical path** — without it, alerts require user interaction. |
| `POST /ussd` | Africa's Talking | Handles USSD session callbacks for `*384*6262#` |
| `POST /sms/receive` | Africa's Talking | Handles inbound SMS keywords (HELP, BLEEDING, EMERGENCY…) |
| `POST /chw/visits/urgent` | Mobile app | Queues a CHW home visit when a symptom has escalated |
| `GET /api/chw/visits/pending` | CHW Dashboard | Lists pending urgent visits |
| `GET /health` | Railway/Render | Health check for uptime monitoring |
| `POST /api/account/delete-schedule` | Mobile app | Schedules 30-day account deletion (DPA 2019 compliance) |

---

## Option A: Deploy to Railway (recommended for pilot)

Railway offers a free hobby tier and one-click deploys from GitHub. Estimated setup time: 20 minutes.

### Step 1 — Push code to GitHub

```bash
git add .
git commit -m "Add backend deployment configuration"
git push origin main
```

### Step 2 — Create Railway project

1. Go to [railway.app](https://railway.app) and sign in
2. Click **New Project → Deploy from GitHub repo**
3. Select your MamaCare repository
4. Railway will detect `railway.toml` automatically

### Step 3 — Set environment variables

In the Railway dashboard → your service → **Variables**, add:

| Variable | Value | Notes |
|---|---|---|
| `AFRICASTALKING_API_KEY` | `(your key)` | From AT dashboard — use **live** key, not sandbox |
| `AFRICASTALKING_USERNAME` | `mamacare` | Your AT username |
| `ALLOWED_ORIGINS` | `capacitor://localhost,https://mamacare.app` | Adjust to your actual origins |
| `PORT` | `3000` | Railway injects `$PORT` but set this as fallback |
| `NODE_ENV` | `production` | |

> **Never commit API keys to the repository.** Set them only in Railway's Variables panel or via `eas secret:create` for the mobile app.

### Step 4 — Deploy

Railway deploys automatically on push. Watch the build logs in the Railway dashboard.

### Step 5 — Get your backend URL

After deployment, Railway assigns a URL like:  
`https://mamacare-backend-production.up.railway.app`

Copy this URL — you will need it in the next step.

---

## Option B: Deploy to Render (free tier alternative)

1. Go to [render.com](https://render.com) → **New Web Service**
2. Connect your GitHub repository
3. Set **Root Directory** to `backend`
4. Set **Build Command** to `npm install --omit=dev`
5. Set **Start Command** to `node sms-ussd-gateway.js`
6. Add environment variables in the Render dashboard (same list as Railway above)
7. Deploy — your URL will be `https://mamacare-backend.onrender.com`

> **Note:** Render's free tier spins down after 15 minutes of inactivity, causing a ~30-second cold start. Upgrade to the Starter tier (£5/month) for always-on behaviour during the pilot.

---

## Set the backend URL in the mobile app

Once deployed, update EAS Secrets so the pilot APK points to your backend:

```bash
# Set the API URL (replace with your actual Railway/Render URL)
eas secret:create \
  --scope project \
  --name EXPO_PUBLIC_API_BASE_URL \
  --value https://mamacare-backend-production.up.railway.app

# Set Africa's Talking credentials (also needed if backend calls AT directly)
eas secret:create --scope project --name AFRICASTALKING_API_KEY --value YOUR_KEY_HERE
eas secret:create --scope project --name AFRICASTALKING_USERNAME --value mamacare

# Set Google STT key
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_STT_KEY --value YOUR_STT_KEY_HERE
```

Then rebuild the pilot APK:

```bash
eas build --platform android --profile pilot
```

---

## Verify deployment — Pre-launch SMS test

**This step is mandatory before the pilot begins.** Run the test script against your deployed backend with real Kenyan SIM cards:

```bash
# Install Node.js 20+ if not already installed
# Then run:

BACKEND_URL=https://your-backend.railway.app \
SAFARICOM_TEST_NUMBER=+2547XXXXXXXX \
AIRTEL_TEST_NUMBER=+2547XXXXXXXX \
TELKOM_TEST_NUMBER=+2540XXXXXXXX \
node backend/scripts/test-sms-delivery.js
```

The script runs 12 tests:

| Test | What it checks |
|---|---|
| T-01 | Backend health check passes, AT configured |
| T-02 | USSD returns `text/plain` (required by Africa's Talking) |
| T-03 | USSD main menu has correct options |
| T-04 | USSD severe bleeding path shows 999 |
| T-05–06 | Emergency alert endpoint validates inputs correctly |
| T-07 | **SMS physically received on Safaricom SIM** ← confirm on device |
| T-08 | **SMS physically received on Airtel Kenya SIM** ← confirm on device |
| T-09 | **SMS physically received on Telkom Kenya SIM** ← confirm on device |
| T-10–12 | CHW visits and account deletion endpoints reachable |

**All 12 tests must pass before the pilot begins.** Exit code 0 = all passed.

> The live SMS tests (T-07–09) use real Africa's Talking credits and send actual SMS messages to your test SIMs. Use your own SIM cards — not participant numbers.

---

## Africa's Talking setup

### 1. Create an account

1. Go to [africastalking.com](https://africastalking.com) and sign up
2. Create a new app: **Applications → Create App**
3. App name: `MamaCare`

### 2. Get API credentials

Dashboard → **Settings → API Key**

Copy the **Live API Key** (not the Sandbox key — sandbox does not deliver SMS).

### 3. Register a Sender ID (optional but recommended)

A registered Sender ID ("MamaCare") makes alerts more recognisable and trustworthy to participants.

Dashboard → **SMS → Sender IDs → Add Sender ID**

- Sender ID: `MamaCare`
- Use case: Health alerts for pregnant women
- Approval: 1–3 business days in Kenya

Until approved, AT will use a shared short code. The alerts still work.

### 4. Register your USSD code

To activate `*384*6262#`:

Dashboard → **USSD → Create Channel**

- USSD code: `*384*6262#` (or request one — AT assigns codes)
- Callback URL: `https://your-backend-url/ussd`

### 5. Configure inbound SMS

Dashboard → **SMS → Incoming Messages → Create Inbox**

- Short code or alphanumeric: `MamaCare`
- Callback URL: `https://your-backend-url/sms/receive`

---

## Configure Africa's Talking webhook URLs

After deploying your backend, set these URLs in the AT dashboard:

| Service | AT Dashboard path | URL to set |
|---|---|---|
| USSD callback | USSD → your channel → Edit | `https://your-backend-url/ussd` |
| Inbound SMS | SMS → Incoming Messages → your inbox | `https://your-backend-url/sms/receive` |

---

## Monitoring during the pilot

### Health check URL

Bookmark this and check it daily:

```
https://your-backend-url/health
```

Expected response:
```json
{ "status": "ok", "at_configured": true, "service": "mamacare-sms-gateway" }
```

### Africa's Talking delivery reports

Dashboard → **SMS → Sent Messages**

- Filter by date to see all alerts sent during the pilot
- Check "Delivered" vs "Failed" counts
- Target: ≥95% delivery rate (see Pilot Launch Runbook, Section 8.2)

### Railway/Render logs

Both platforms show real-time server logs. Watch for:

```
[SMS] Sent to 2 recipients.        ← good
[/api/emergency-alert] AT send failed: ...  ← investigate immediately
```

### Alert throttle monitoring

The server-side rate limiter is in-memory. If the backend restarts, throttle state is reset. This is acceptable for the pilot — it means a participant could theoretically receive two alerts for the same symptom if the server restarts between checks. Monitor restart frequency in Railway/Render logs.

**For post-pilot production:** Replace the in-memory map with Redis for persistent throttle state across restarts and multiple instances.

---

## Scaling beyond the pilot

The pilot backend is intentionally minimal — in-memory stores, single instance, no database. Before scaling to hundreds of participants, these changes are needed:

| Component | Pilot (current) | Production recommendation |
|---|---|---|
| Rate limiter | In-memory Map | Redis (persistent, multi-instance) |
| CHW visit queue | In-memory array | PostgreSQL or Firebase Firestore |
| Account deletion | In-memory Map | Database with scheduled job |
| AT delivery receipts | Not stored | Webhook → database |
| Secrets management | Railway Variables | AWS Secrets Manager or GCP Secret Manager |
| Scaling | Single instance | Horizontal scaling behind a load balancer |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/health` returns `at_configured: false` | `AFRICASTALKING_API_KEY` not set | Set in Railway/Render Variables panel and redeploy |
| SMS sent by AT but not received | Wrong number format | Ensure numbers include country code: `+2547XXXXXXXX` |
| SMS not sent, AT error in logs | Invalid API key or insufficient credit | Check AT dashboard — add credits, confirm live key |
| USSD not responding | Callback URL not configured in AT | Update AT dashboard → USSD → your channel → callback URL |
| `502` from `/api/emergency-alert` | AT SDK unreachable or key invalid | Check AT status at [africastalking.com/status](https://africastalking.com/status) |
| App falls back to native SMS | Backend URL wrong in EAS Secrets | Check `EXPO_PUBLIC_API_BASE_URL` in EAS and rebuild |
| Cold start delays on Render free tier | Instance spun down | Upgrade to Render Starter or use Railway (no spin-down) |

---

## Environment variables — complete reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `AFRICASTALKING_API_KEY` | Yes | — | Africa's Talking live API key |
| `AFRICASTALKING_USERNAME` | Yes | `sandbox` | Africa's Talking app username |
| `ALLOWED_ORIGINS` | Yes | `capacitor://localhost` | CORS allowed origins (comma-separated) |
| `PORT` | No | `3000` | HTTP server port |
| `NODE_ENV` | No | — | Set to `production` |

---

*Last updated: February 2026 — MamaCare v1.0 pilot release*
