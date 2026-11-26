# AppGrowth API image — also runs the worker and scheduler (different command, same code).
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl && rm -rf /var/lib/apt/lists/*
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/api/ ./
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/* \
 && groupadd -r app && useradd -r -g app -d /app app && mkdir -p /data/storage && chown app:app /data/storage
ENV NODE_ENV=production STORAGE_PATH=/data/storage PORT=4100
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/dist-seed ./dist-seed
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/package.json ./package.json
USER app
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--max-old-space-size=192", "dist/main"]
