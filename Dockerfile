# Debian-based (glibc) image on purpose: argon2 ships prebuilt binaries for it, and
# musl/Alpine is where native modules have already bitten this project (sharp).

# --- Stage 1: build everything (shared -> api -> web) with the full dependency tree.
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Manifests first so the dependency layer is cached until a package.json changes.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci

COPY tsconfig.base.json ./
COPY shared shared
COPY api api
COPY web web
RUN npm run build

# --- Stage 2: runtime. Production dependencies of the API only; no compilers, no
# web toolchain, no tsx/drizzle-kit. Migrations run from compiled JS (api/dist/db).
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace=api --include-workspace-root \
 && npm cache clean --force

COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/api/dist api/dist
COPY --from=build /app/api/drizzle api/drizzle
COPY --from=build /app/web/dist web/dist

USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "api/dist/server.js"]
