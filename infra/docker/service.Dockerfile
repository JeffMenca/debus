# Builds any NestJS service: docker build -f infra/docker/service.Dockerfile --build-arg SERVICE=flota .
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS pruner
ARG SERVICE
COPY . .
RUN pnpm dlx turbo@2 prune @debus/${SERVICE} --docker

FROM base AS builder
ARG SERVICE
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@debus/${SERVICE}
RUN pnpm --filter @debus/${SERVICE} deploy --prod --legacy /prod

# Cloud Run Job image for `prisma migrate deploy` (needs the dev-only Prisma CLI).
FROM builder AS migrator
ARG SERVICE
WORKDIR /app/services/${SERVICE}
CMD ["pnpm", "prisma", "migrate", "deploy"]

FROM node:${NODE_VERSION}-alpine AS runner
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=builder /prod .
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
