FROM node:18-alpine AS build
WORKDIR /app

# Copy root manifests for workspaces install
COPY package.json package-lock.json ./
COPY apps/executor/package.json apps/executor/package.json
COPY packages/shared/package.json packages/shared/package.json

# Install ALL deps (incl dev) so tsc + prisma CLI exist
RUN npm ci

# Copy source
COPY . .

# Generate Prisma client (schema lives in shared)
RUN npx prisma generate --schema packages/shared/prisma/schema.prisma

# Build only what executor needs
RUN npm run build -w @monorepo/shared -w executor

# Prune dev deps for smaller runtime image (keep generated client)
RUN npm prune --omit=dev

FROM node:18-alpine AS runtime
RUN apk add --no-cache ca-certificates && update-ca-certificates
WORKDIR /app
ENV NODE_ENV=production

# Copy pruned node_modules (must include generated .prisma folder)
COPY --from=build /app/node_modules ./node_modules

# Workspace links require the target package to exist in runtime
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

# Copy executor runtime artifacts
COPY --from=build /app/apps/executor/dist ./apps/executor/dist
COPY --from=build /app/apps/executor/package.json ./apps/executor/package.json

EXPOSE 3001
CMD ["node", "apps/executor/dist/index.js"]
