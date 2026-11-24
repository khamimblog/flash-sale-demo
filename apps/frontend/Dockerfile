# Frontend image: the built React app served by nginx, which also load-balances the API.
# Build from the repo root: docker build -f apps/frontend/Dockerfile .

FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/frontend/package.json apps/frontend/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @flash-sale-demo/frontend...

COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY apps/frontend apps/frontend
RUN pnpm --filter @flash-sale-demo/frontend build

FROM nginx:1.27-alpine
COPY infrastructure/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
