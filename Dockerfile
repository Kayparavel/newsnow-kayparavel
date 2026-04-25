FROM node:20.12.2-alpine AS builder
WORKDIR /usr/src
COPY . .
RUN corepack enable
RUN pnpm install
RUN pnpm run build

FROM node:20.12.2-alpine
WORKDIR /usr/app
COPY --from=builder /usr/src/dist/output ./output
ENV HOST=0.0.0.0 PORT=4444 NODE_ENV=production
ENV NODE_USE_ENV_PROXY=1
ENV HTTP_PROXY=http://115.159.101.139:7890
ENV HTTPS_PROXY=http://115.159.101.139:7890
ENV PROXY=http://115.159.101.139:7890
EXPOSE $PORT
CMD ["node", "output/server/index.mjs"]
