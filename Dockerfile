FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.server.json vite.config.ts index.html ./
COPY src ./src
COPY shared ./shared
COPY server ./server
COPY scripts ./scripts
COPY neon.ts ./neon.ts
COPY public ./public
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY database/migrations ./database/migrations
USER node
EXPOSE 4000
CMD ["node", "dist-server/server/index.js"]
