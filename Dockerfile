# ── Stage 1: Build Vite frontend ──────────────────────────────────────
FROM node:22-slim AS frontend-builder
WORKDIR /app

# Build args for frontend (passed at build time; anon key is public by design)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_PIPELINE_SERVICE_URL=
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
ENV VITE_PIPELINE_SERVICE_URL=${VITE_PIPELINE_SERVICE_URL}

COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json ./
COPY src/ ./src/
RUN npx vite build

# ── Stage 2: Build pipeline-service (TypeScript) ─────────────────────
FROM node:22-slim AS backend-builder
WORKDIR /app/pipeline-service
COPY pipeline-service/package.json pipeline-service/package-lock.json* ./
RUN npm ci
COPY pipeline-service/tsconfig.json ./
COPY pipeline-service/src/ ./src/
RUN npm run build

# ── Stage 3: Production runtime ──────────────────────────────────────
FROM node:22-slim
RUN apt-get update && apt-get install -y stockfish && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/games/stockfish /usr/local/bin/stockfish
ENV STOCKFISH_PATH=/usr/games/stockfish
WORKDIR /app/pipeline-service

# Install production deps only
COPY pipeline-service/package.json pipeline-service/package-lock.json* ./
RUN npm ci --omit=dev

# Copy compiled backend
COPY --from=backend-builder /app/pipeline-service/dist ./dist

# Copy built frontend to ../dist (where serveStatic expects it)
COPY --from=frontend-builder /app/dist ../dist

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/index.js"]
