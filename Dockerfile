# syntax=docker/dockerfile:1
# 前端只构建一次（在构建机原生架构上跑），产物是纯静态文件，与目标架构无关
FROM --platform=$BUILDPLATFORM node:22-alpine AS web
WORKDIR /web
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

# 运行时：服务端零依赖（node:http + node:sqlite），不需要 npm install
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    DSX_DATA_DIR=/data \
    DSX_STATIC_DIR=/app/web
WORKDIR /app/server
COPY server/package.json ./
COPY server/src ./src
COPY --from=web /web/dist /app/web
COPY LICENSE /app/LICENSE
RUN mkdir -p /data && chown -R node:node /data \
 && printf '#!/bin/sh\nexec node --no-warnings /app/server/src/cli.js "$@"\n' > /usr/local/bin/dsx && chmod +x /usr/local/bin/dsx
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--no-warnings", "src/index.js"]
