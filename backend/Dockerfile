FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++ libjpeg-turbo-dev vips-dev wget curl
COPY backend/package.json ./
RUN npm install --only=production --legacy-peer-deps
COPY backend/ .
RUN mkdir -p uploads logs
EXPOSE 3000
CMD ["node", "server.js"]
