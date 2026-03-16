# ────────────────────────────────────────────────────
# Stage 1: Build frontend
# ────────────────────────────────────────────────────
FROM node:20-slim AS frontend

WORKDIR /app/webui
COPY webui/package*.json ./
RUN npm ci
COPY webui/ ./
RUN npm run build

# ────────────────────────────────────────────────────
# Stage 2: Runtime
# ────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Install curl for the HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Install production Node dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Application source
COPY src/ ./src/
COPY spec/ ./spec/

# Built frontend from Stage 1
COPY --from=frontend /app/webui/dist ./webui/dist/

# C++ binaries are pre-compiled and must be mounted at runtime
VOLUME /app/build

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://127.0.0.1:3000/api/client/status || exit 1

CMD ["node", "src/api/server.js"]
