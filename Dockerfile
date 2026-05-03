FROM node:20.12.2-alpine AS builder
WORKDIR /usr/src
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches/
RUN pnpm install
COPY . .
RUN pnpm run build

FROM node:20.12.2-alpine
WORKDIR /usr/app
COPY --from=builder /usr/src/dist/output ./output
ENV HOST=0.0.0.0 PORT=4444 NODE_ENV=production
EXPOSE $PORT
CMD ["node", "output/server/index.mjs"]
