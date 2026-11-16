# ---------- Tahap build ----------
FROM oven/bun:1 AS build
WORKDIR /app
ENV MASTRA_TELEMETRY_DISABLED=1

# Jika lockfile-mu bernama bun.lockb (Bun lama), ganti nama di baris ini.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN bun run build

# ---------- Tahap runtime ----------
FROM oven/bun:1-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    MASTRA_TELEMETRY_DISABLED=1

COPY --from=build --chown=bun:bun /app/.mastra/output ./
USER bun

EXPOSE 4111
CMD ["bun", "index.mjs"]