FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++ libjpeg-turbo-dev vips-dev wget curl ffmpeg openjdk17-jre unzip
RUN wget -q -O /tmp/fidelius.zip \
      https://github.com/mgrmtech/fidelius-cli/releases/download/1.2.0/fidelius-cli-1.2.0.zip \
    && unzip -q /tmp/fidelius.zip -d /opt/fidelius-tmp \
    && mkdir -p /opt/fidelius/lib \
    && find /opt/fidelius-tmp -name "fidelius-cli-*.jar" -exec cp {} /opt/fidelius/fidelius-cli.jar \; \
    && find /opt/fidelius-tmp -name "bcprov-*.jar" -exec cp {} /opt/fidelius/lib/ \; \
    && rm -rf /tmp/fidelius.zip /opt/fidelius-tmp
ENV FIDELIUS_DIR=/opt/fidelius
ENV FIDELIUS_JAR=/opt/fidelius/fidelius-cli.jar
COPY backend/package.json ./
RUN npm install --only=production --legacy-peer-deps
COPY backend/ .
RUN mkdir -p uploads logs
EXPOSE 3000
CMD ["node", "server.js"]
