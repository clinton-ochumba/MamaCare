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

# Copy backend dependency manifests first (layer caching — only re-runs npm ci if
# package.json or package-lock.json changes, not on every code change)
COPY backend/package.json backend/package-lock.json* ./

RUN npm ci --omit=dev

# ─── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Security: run as non-root
RUN addgroup -S mamacare && adduser -S mamacare -G mamacare

WORKDIR /app

# Copy pruned node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY backend/sms-ussd-gateway.js ./
COPY backend/package.json ./

# The gateway also requires the shared riskAssessment helper from the root app
COPY src/utils/riskAssessment.js src/utils/riskAssessment.js

# Switch to non-root user
USER mamacare

# Health check — Railway / Render will mark the service healthy after this passes
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "const http=require('http'); const port=process.env.PORT||3000; const req=http.get({host:'127.0.0.1',port, path:'/health'}, res=> { process.exit(res.statusCode===200 ? 0 : 1); }); req.on('error', ()=>process.exit(1));"

EXPOSE ${PORT:-3000}

CMD ["node", "sms-ussd-gateway.js"]
