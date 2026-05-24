# MamaCare Backend

Node.js / Express server for:
- SMS/USSD gateway via Africa's Talking
- CHW Dashboard API (`GET /api/chw/mothers`, `GET /api/chw/profile`)
- CHW visit scheduling (`POST /api/chw/visits/urgent`)
- Account deletion processing (30-day grace period)

## Setup

```bash
cd backend
npm install
cp ../.env.example .env  # Fill in AFRICASTALKING_API_KEY etc.
node sms-ussd-gateway.js
```

**Not required for the mobile app to run** — the app degrades gracefully when the backend is unavailable (queues CHW visits locally for retry).
