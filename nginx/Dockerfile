# Stage 1: Build OPD React SPA
FROM node:20-alpine AS opd-builder
WORKDIR /build
COPY emr-web/package.json ./
RUN npm install --legacy-peer-deps
COPY emr-web/ ./
RUN npm run build
# Output at /build/dist (vite outDir: dist)

# Stage 2: nginx with all static sites
FROM nginx:alpine
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY web                     /var/www/web
COPY --from=opd-builder /build/dist /var/www/opd
COPY backend/public/emr      /var/www/emr
