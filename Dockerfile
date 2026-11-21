# syntax=docker/dockerfile:1.7
#
# نوبتیار — Dockerfile چندمرحله‌ای (monorepo pnpm + Turborepo)
#
# targetها:
#   api      NestJS (production deps فقط، کاربر غیر root)   docker build --target api -t nobatyar/api .
#   migrate  job ی مهاجرت/seed (prisma CLI + tsx)           docker build --target migrate -t nobatyar/migrate .
#   web      Next.js خروجی standalone (کاربر غیر root)      docker build --target web \
#                                                            --build-arg API_URL=http://api:3000 \
#                                                            --build-arg LIVEKIT_PUBLIC_URL=wss://lk.example.ir -t nobatyar/web .
#
# پیش‌نیاز: pnpm-lock.yaml باید commit شده باشد (turbo prune و --frozen-lockfile به آن نیاز دارند).
# هر target فقط workspace ی «هرس‌شده»ی خودش را می‌بیند (turbo prune): تغییر در web کش لایه‌های api را نمی‌شکند.

ARG NODE_VERSION=20
ARG PNPM_VERSION=9.12.0
ARG TURBO_VERSION=2.1.3

# ───────────────────────────── base ─────────────────────────────
FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
# openssl: موتور Prisma روی alpine؛ libc6-compat: باینری‌های native؛ tini: PID 1 (سیگنال و reaping)
RUN apk add --no-cache libc6-compat openssl tini
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# ───────────────────────────── turbo prune ─────────────────────────────
FROM base AS prune-api
ARG TURBO_VERSION
COPY . .
RUN pnpm dlx turbo@${TURBO_VERSION} prune @nobatyar/api --docker

FROM base AS prune-web
ARG TURBO_VERSION
COPY . .
RUN pnpm dlx turbo@${TURBO_VERSION} prune @nobatyar/web --docker

# ───────────────────────────── API ─────────────────────────────
# build کامل (devDependencies دارد): کامپایل tsc + مبنای target ی migrate
FROM base AS api-build
COPY --from=prune-api /app/out/json/ ./
COPY --from=prune-api /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
# postinstall ی api دستور «prisma generate» است و schema را لازم دارد؛ پیش از install فقط همان را بیاور
COPY --from=prune-api /app/out/full/apps/api/prisma/schema.prisma ./apps/api/prisma/schema.prisma
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=prune-api /app/out/full/ ./
RUN pnpm exec turbo run build --filter=@nobatyar/api

# فقط وابستگی‌های production (بدون typescript/vitest/eslint/…)
FROM base AS api-deps
COPY --from=prune-api /app/out/json/ ./
COPY --from=prune-api /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=prune-api /app/out/full/apps/api/prisma/schema.prisma ./apps/api/prisma/schema.prisma
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

# job ی مهاجرت: prisma CLI + tsx (برای seed). کاربر غیر root؛ هیچ پورتی باز نمی‌کند.
FROM api-build AS migrate
ENV NODE_ENV=production \
    HOME=/tmp \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    CHECKPOINT_DISABLE=1
WORKDIR /app/apps/api
USER node
ENTRYPOINT ["/sbin/tini", "--", "sh", "scripts/migrate-deploy.sh"]
CMD ["deploy"]

# تصویر اجرایی API
FROM node:${NODE_VERSION}-alpine AS api
RUN apk add --no-cache libc6-compat openssl tini
ENV NODE_ENV=production \
    API_PORT=3000
WORKDIR /app
# کد فقط‌خواندنی و متعلق به root: پروسه‌ی API نمی‌تواند کد خودش را تغییر دهد
COPY --from=api-deps  /app/node_modules                 ./node_modules
COPY --from=api-deps  /app/apps/api/node_modules        ./apps/api/node_modules
COPY --from=api-build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=api-build /app/packages/shared/dist         ./packages/shared/dist
COPY --from=api-build /app/apps/api/package.json        ./apps/api/package.json
COPY --from=api-build /app/apps/api/dist                ./apps/api/dist
WORKDIR /app/apps/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=5 \
  CMD wget -q --spider "http://127.0.0.1:${API_PORT}/api/v1/health" || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]

# ───────────────────────────── Web ─────────────────────────────
FROM base AS web-build
COPY --from=prune-web /app/out/json/ ./
COPY --from=prune-web /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=prune-web /app/out/full/ ./
# ⚠️ هر دو در «زمان build» داخل خروجی Next ثبت می‌شوند (rewrite ی /api/v1 و CSP)؛ پس image ی web به این مقادیر وابسته است.
ARG API_URL=http://api:3000
ARG LIVEKIT_PUBLIC_URL=
ARG STORAGE_PUBLIC_URL=
# Sentry مرورگر (اختیاری؛ خالی = خاموش). NEXT_PUBLIC_* در bundle ی کلاینت ثبت می‌شود و DSN راز نیست، ولی رویدادها scrub می‌شوند.
ARG NEXT_PUBLIC_SENTRY_DSN=
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
ENV API_URL=${API_URL} LIVEKIT_PUBLIC_URL=${LIVEKIT_PUBLIC_URL} STORAGE_PUBLIC_URL=${STORAGE_PUBLIC_URL} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} NEXT_PUBLIC_SENTRY_ENVIRONMENT=${NEXT_PUBLIC_SENTRY_ENVIRONMENT}
RUN pnpm exec turbo run build --filter=@nobatyar/web

FROM node:${NODE_VERSION}-alpine AS web
RUN apk add --no-cache libc6-compat tini
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# standalone: server.js + فقط node_modules ی ردیابی‌شده (نه کل workspace)
COPY --from=web-build /app/apps/web/.next/standalone ./
COPY --from=web-build /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=web-build /app/apps/web/public           ./apps/web/public
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -q --spider "http://127.0.0.1:${PORT}/" || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
