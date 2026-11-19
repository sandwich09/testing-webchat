# Optional build-time trust for networks that re-sign HTTPS with their own CA (proxied CI or
# sandboxes). Pass a PEM file as the BuildKit secret `extra_ca` (compose: EXTRA_CA_FILE). The secret
# is mounted only for the RUN steps below: it is never copied into a layer or the runtime stage,
# and TLS verification stays on. Without the secret every step behaves exactly as before.
FROM node:24-alpine AS base
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm install -g pnpm@10.28.0
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile --ignore-scripts

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm db:generate && pnpm build

# Seed and stub server: full source and dev dependencies
FROM build AS tools

# Prisma CLI for `migrate deploy` at container start
FROM node:24-alpine AS migrate-deps
WORKDIR /migrate
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm init -y >/dev/null && npm install --no-audit --no-fund prisma@7.10.1

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=migrate-deps /migrate/node_modules ./migrate/node_modules
COPY prisma/schema.prisma ./migrate/prisma/schema.prisma
COPY prisma/migrations ./migrate/prisma/migrations
COPY prisma.config.ts ./migrate/prisma.config.ts
COPY --chmod=755 docker/entrypoint.sh ./entrypoint.sh
RUN mkdir -p /app/.data/uploads && chown -R nextjs:nodejs /app/.data
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["/app/entrypoint.sh"]
