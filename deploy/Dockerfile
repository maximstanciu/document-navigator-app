# syntax=docker/dockerfile:1
# The API server for self-hosting (deploy/README.md): API routes from src/app/api exported for
# Node and served by deploy/server.js. Build context is the repository root — compose.yaml sets it.

FROM node:24-trixie-slim AS build
WORKDIR /app
ENV CI=1 EXPO_NO_TELEMETRY=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# API routes only: no web app, no native bundles.
RUN npx expo export --platform web --api-only --output-dir dist

FROM node:24-trixie-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
# The route bundles are self-contained; the adapter is the only package they need at runtime.
COPY --from=build /app/node_modules/expo-server ./node_modules/expo-server
COPY --from=build /app/dist/server ./dist/server
COPY deploy/server.js ./server.js
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "--enable-source-maps", "server.js"]
