FROM oven/bun:1.4.4-debian

RUN apt-get update \
  && apt-get install -y --no-install-recommends iputils-ping ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY bun.lock ./bun.lock

RUN bun install --frozen-lockfile --production

COPY apps/api ./apps/api

WORKDIR /app/apps/api

RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
