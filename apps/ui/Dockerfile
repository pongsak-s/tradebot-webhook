FROM node:18-alpine AS build
WORKDIR /app

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Copy root manifests for workspaces install
COPY package.json package-lock.json ./
COPY apps/ui/package.json apps/ui/package.json

# Install ALL deps (incl dev) so vite exists
RUN npm ci

# Copy source
COPY . .

# Build only UI
RUN npm run build -w ui

# Prune dev deps for runtime

FROM node:18-alpine AS runtime
ENV NODE_ENV=production

# Keep node_modules at /app so binaries (vite) are available
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules

# Put UI app files in place
COPY --from=build /app/apps/ui/package.json ./apps/ui/package.json
COPY --from=build /app/apps/ui/dist ./apps/ui/dist

# Run from the UI folder so npm finds apps/ui/package.json
WORKDIR /app/apps/ui

EXPOSE 3002
CMD ["npm", "run", "serve", "--", "--host", "0.0.0.0", "--port", "3002"]
