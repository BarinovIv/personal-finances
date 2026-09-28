FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/entry-line/package.json packages/entry-line/
COPY packages/ledger/package.json packages/ledger/
COPY packages/protocol/package.json packages/protocol/
COPY packages/server/package.json packages/server/
COPY packages/sync/package.json packages/sync/
COPY packages/web/package.json packages/web/
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

ENV PORT=8080 \
    STATIC_DIR=packages/web/dist \
    DB_PATH=/data/finances.sqlite

EXPOSE 8080
CMD ["npx", "tsx", "packages/server/main.ts"]
