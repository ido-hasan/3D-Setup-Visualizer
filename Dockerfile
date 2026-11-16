# Build the client and the server.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY shared shared
COPY server server
COPY client client
RUN npm run build

# The image that runs: the built app and the server's runtime dependencies only.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=4700 DATA_DIR=/app/data
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --workspace=server && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
VOLUME /app/data
EXPOSE 4700
CMD ["node", "server/dist/index.js"]
