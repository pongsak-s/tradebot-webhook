FROM node:18-alpine AS build
WORKDIR /app

# Copy manifests needed for workspace install
COPY package.json package-lock.json ./
COPY apps/webhook/package.json apps/webhook/package.json
COPY packages/shared/package.json packages/shared/package.json

# Install all deps (incl dev) so tsc + prisma CLI exist
RUN npm ci

# Copy source
COPY . .

# Generate Prisma client (schema lives in shared)
RUN npx prisma generate --schema packages/shared/prisma/schema.prisma

# Build only what webhook needs
RUN npm run build -w @monorepo/shared -w webhook

# Prune dev deps for runtime
RUN npm prune --omit=dev

FROM node:18-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# node_modules includes workspace links; runtime must also contain the linked workspace package
COPY --from=build /app/node_modules ./node_modules

# Copy shared package runtime artifacts (target of workspace link)
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

# Copy webhook runtime artifacts
COPY --from=build /app/apps/webhook/package.json ./apps/webhook/package.json
COPY --from=build /app/apps/webhook/dist ./apps/webhook/dist

EXPOSE 3000
CMD ["node", "apps/webhook/dist/server.js"]
