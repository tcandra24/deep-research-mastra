# ---------- Tahap build ----------
FROM node:22-slim AS build
WORKDIR /app
ENV MASTRA_TELEMETRY_DISABLED=1

# Salin file dependensi dulu agar lapisan `npm ci` bisa di-cache.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npx mastra build

# ---------- Tahap runtime ----------
# Hanya hasil build (.mastra/output) yang dibawa; folder itu sudah memuat
# node_modules miliknya sendiri.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    MASTRA_TELEMETRY_DISABLED=1

COPY --from=build --chown=node:node /app/.mastra/output ./
USER node

# Railway menyuntikkan PORT; server membacanya (default 4111).
EXPOSE 4111
CMD ["node", "index.mjs"]
