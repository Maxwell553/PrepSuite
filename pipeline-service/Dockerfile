FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
COPY standard_rating_list.txt ./
RUN npm run build

FROM node:22-slim
RUN apt-get update && apt-get install -y stockfish && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/standard_rating_list.txt ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/index.js"]
