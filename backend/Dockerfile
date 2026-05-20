# Stage 1: Build EMR React app
FROM node:20-alpine AS emr-builder
WORKDIR /build/emr-web
COPY emr-web/package.json ./
RUN npm install --legacy-peer-deps
COPY emr-web/ ./
RUN npm run build
# Output lands at /build/backend/public/opd (vite outDir: ../backend/public/opd)

# Stage 2: Backend runtime
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++ libjpeg-turbo-dev vips-dev wget curl
COPY backend/package.json ./
RUN npm install --only=production --legacy-peer-deps
COPY backend/ .
COPY --from=emr-builder /build/backend/public/opd ./public/opd
RUN mkdir -p uploads logs
EXPOSE 3000
CMD ["node", "server.js"]
