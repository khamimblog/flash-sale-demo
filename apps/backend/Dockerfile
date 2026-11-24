# Backend image: one image, three commands (API, worker, migrate).
# Build from the repo root: docker build -f apps/backend/Dockerfile .

FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable

# Install dependencies first so this layer is cached until a manifest changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @flash-sale-demo/backend...

COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY apps/backend apps/backend
RUN pnpm --filter @flash-sale-demo/backend... build \
  && pnpm --filter @flash-sale-demo/backend deploy --prod --legacy /out

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/backend/dist ./dist
COPY --from=build /repo/apps/backend/assets ./assets
COPY --from=build /repo/apps/backend/src/infrastructure/database/migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "dist/main.api.js"]
