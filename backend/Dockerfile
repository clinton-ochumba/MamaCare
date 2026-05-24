# ─── MamaCare Backend — Production Dockerfile ─────────────────────────────────
#
# Multi-stage build: builder installs all deps, production image only copies
# the pruned production node_modules. Reduces final image size significantly.
#
# Build:  docker build -t mamacare-backend .
# Run:    docker run -p 3000:3000 --env-file .env mamacare-backend
#
# Required env vars (pass via --env-file or Railway/Render environment panel):
#   AFRICASTALKING_API_KEY
#   AFRICASTALKING_USERNAME
#   ALLOWED_ORIGINS   (comma-separated: capacitor://localhost,https://mamacare.app)
#   PORT              (default: 3000)

FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first (layer caching — only re-runs npm ci if
# package.json or package-lock.json changes, not on every code change)
COPY package.json package-lock.json* ./

RUN npm ci --omit=dev

# ─── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Security: run as non-root
RUN addgroup -S mamacare && adduser -S mamacare -G mamacare

WORKDIR /app

# Copy pruned node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY sms-ussd-gateway.js ./
COPY package.json ./

# The gateway also requires riskAssessment.js from the app's src/utils
# Copy only the shared utility (not the full React Native app)
RUN mkdir -p src/utils
COPY --from=builder /app/../src/utils/riskAssessment.js src/utils/riskAssessment.js 2>/dev/null || true

# Switch to non-root user
USER mamacare

# Health check — Railway / Render will mark the service healthy after this passes
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/health || exit 1

EXPOSE ${PORT:-3000}

CMD ["node", "sms-ussd-gateway.js"]
