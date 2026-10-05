# syntax = docker/dockerfile:1

FROM docker.io/library/node:24-alpine
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile

COPY src/ ./src/
COPY README.md ./README.md

ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/server.js"]
