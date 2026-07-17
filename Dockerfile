# syntax=docker/dockerfile:1

# ---- Build stage ----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies against the committed lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# VITE_PLAUSIBLE_DOMAIN is inlined at build time (Vite). Pass it with
# --build-arg to enable analytics; left empty it stays off (the default).
ARG VITE_PLAUSIBLE_DOMAIN=""
ENV VITE_PLAUSIBLE_DOMAIN=$VITE_PLAUSIBLE_DOMAIN

COPY . .
RUN npm run build

# ---- Runtime stage --------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Nitro's node-server listens on PORT (default 3000).
ENV PORT=3000
EXPOSE 3000

# Nitro bundles a self-contained server — no node_modules needed at runtime.
COPY --from=build /app/.output ./.output

# Container-level liveness probe (busybox wget ships with alpine).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO /dev/null "http://127.0.0.1:${PORT:-3000}/" || exit 1

USER node
CMD ["node", ".output/server/index.mjs"]
