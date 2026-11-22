# Runtime-only image from a Next.js standalone build made elsewhere (no npm install / next build on the server).
# Build first:  cd frontend && INTERNAL_API_URL=http://backend:8000 npm run build
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN adduser -D -u 1001 web
COPY frontend/.next/standalone ./
COPY frontend/.next/static ./.next/static
USER web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3000/login >/dev/null || exit 1
CMD ["node", "server.js"]
