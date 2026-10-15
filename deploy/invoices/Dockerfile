# Free self-hosted worker. Requires an existing continuously running host.
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-17-jre-headless curl unzip ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
RUN mkdir -p /opt/kosit/config && \
 curl -fL https://repo1.maven.org/maven2/org/kosit/validator/1.6.3/validator-1.6.3-standalone.jar -o /opt/kosit/validator.jar && \
 curl -fL https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/v2026-08-31/xrechnung-3.0.2-validator-configuration-2026-08-31.zip -o /opt/kosit/config.zip && \
 echo '799e64befca97d4080e03608c80b85dd5a5ecc5f4ae4f35d1116ec2855b9a7c9  /opt/kosit/validator.jar' | sha256sum -c - && \
 echo '2530cd107c414511c5d0462ec10f886910395abfca820db82e83d70bf01221a8  /opt/kosit/config.zip' | sha256sum -c - && \
 unzip -q /opt/kosit/config.zip -d /opt/kosit/config && rm /opt/kosit/config.zip
COPY src/lib/invoices ./src/lib/invoices
COPY src/lib/i18n/catalog-de.json ./src/lib/i18n/catalog-de.json
COPY scripts/invoices ./scripts/invoices
COPY scripts/finance ./scripts/finance
COPY public/kaptan-logo.png ./public/kaptan-logo.png
ENV KOSIT_JAR=/opt/kosit/validator.jar KOSIT_CONFIG=/opt/kosit/config JAVA_BIN=java
USER node
CMD ["node", "scripts/invoices/loop.mjs"]
