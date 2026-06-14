FROM node:20-alpine
WORKDIR /app

# Install system dependencies + create non-root user (SEC-020)
RUN apk add --no-cache python3 make g++ libjpeg-turbo-dev vips-dev wget curl ffmpeg openjdk17-jre unzip \
    && addgroup -g 1001 -S appgroup \
    && adduser  -u 1001 -S appuser -G appgroup

# Download and install Fidelius CLI
RUN wget -q -O /tmp/fidelius.zip \
      https://github.com/mgrmtech/fidelius-cli/releases/download/1.2.0/fidelius-cli-1.2.0.zip \
    && unzip -q /tmp/fidelius.zip -d /opt/fidelius-tmp \
    && mkdir -p /opt/fidelius/lib \
    && find /opt/fidelius-tmp -name "fidelius-cli-*.jar" -exec cp {} /opt/fidelius/fidelius-cli.jar \; \
    && find /opt/fidelius-tmp -name "*.jar" ! -name "fidelius-cli-*.jar" -exec cp {} /opt/fidelius/lib/ \; \
    && rm -rf /tmp/fidelius.zip /opt/fidelius-tmp \
    && chown -R appuser:appgroup /opt/fidelius

ENV FIDELIUS_DIR=/opt/fidelius
ENV FIDELIUS_JAR=/opt/fidelius/fidelius-cli.jar

COPY backend/package.json ./
RUN npm install --only=production --legacy-peer-deps

COPY backend/ .
RUN mkdir -p uploads logs \
    && chown -R appuser:appgroup /app

# Run as non-root (SEC-020)
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health',(r)=>{process.exit(r.statusCode===200?0:1)})" || exit 1

CMD ["node", "server.js"]
