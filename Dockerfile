# ─────────────────────────────────────────────────────────────
# Stage 1: base — Node 20 + pnpm
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

# ─────────────────────────────────────────────────────────────
# Stage 2: fetch — install deps from lockfile only (cache layer)
# ─────────────────────────────────────────────────────────────
FROM base AS fetch
WORKDIR /app
COPY pnpm-lock.yaml ./
RUN pnpm fetch --prod

# ─────────────────────────────────────────────────────────────
# Stage 3: install — full workspace install
# ─────────────────────────────────────────────────────────────
FROM base AS install
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ packages/
COPY apps/api/       apps/api/
COPY apps/projector/ apps/projector/
COPY apps/recovery-worker/ apps/recovery-worker/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────
# Stage 4: build — compile all packages + apps
# ─────────────────────────────────────────────────────────────
FROM install AS build
COPY turbo.json tsconfig.base.json ./
RUN pnpm --filter "@tfsdc/kernel" --filter "@tfsdc/domain" \
         --filter "@tfsdc/application" --filter "@tfsdc/infrastructure" \
         --filter "@tfsdc/policy" --filter "@tfsdc/audit" --filter "@tfsdc/dsl" \
         --filter "@tfsdc/api" --filter "@tfsdc/projector" --filter "@tfsdc/recovery-worker" \
    run build

# ─────────────────────────────────────────────────────────────
# Stage 5a: prune-api — deploy bundle for api
# ─────────────────────────────────────────────────────────────
FROM build AS prune-api
RUN pnpm deploy --filter=@tfsdc/api --prod /deploy/api

# ─────────────────────────────────────────────────────────────
# Stage 5b: prune-projector — deploy bundle for projector
# ─────────────────────────────────────────────────────────────
FROM build AS prune-projector
RUN pnpm deploy --filter=@tfsdc/projector --prod /deploy/projector

# ─────────────────────────────────────────────────────────────
# Stage 5c: prune-recovery — deploy bundle for recovery-worker
# ─────────────────────────────────────────────────────────────
FROM build AS prune-recovery
RUN pnpm deploy --filter=@tfsdc/recovery-worker --prod /deploy/recovery-worker

# ─────────────────────────────────────────────────────────────
# Final: api
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS api
WORKDIR /app
COPY --from=prune-api /deploy/api ./
ENV NODE_ENV=production
EXPOSE 3100
CMD ["node", "dist/index.js"]

# ─────────────────────────────────────────────────────────────
# Final: projector
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS projector
WORKDIR /app
COPY --from=prune-projector /deploy/projector ./
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]

# ─────────────────────────────────────────────────────────────
# Final: recovery-worker
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS recovery-worker
WORKDIR /app
COPY --from=prune-recovery /deploy/recovery-worker ./
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
