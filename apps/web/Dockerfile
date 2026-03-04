# ─────────────────────────────────────────────────────────────
# Stage 1: base
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

# ─────────────────────────────────────────────────────────────
# Stage 2: install — full monorepo install (needed for workspace deps)
# ─────────────────────────────────────────────────────────────
FROM base AS install
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/kernel/   packages/kernel/
COPY packages/ui-web/   packages/ui-web/
COPY apps/web/          apps/web/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────
# Stage 3: build
# ─────────────────────────────────────────────────────────────
FROM install AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:3100
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY turbo.json tsconfig.base.json ./
RUN pnpm --filter=@tfsdc/web run build

# ─────────────────────────────────────────────────────────────
# Final: minimal runtime
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS web
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# standalone output includes all necessary server files
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static      apps/web/.next/static
COPY --from=build /app/apps/web/public            apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
