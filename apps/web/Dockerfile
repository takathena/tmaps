FROM oven/bun:1.4.4-debian AS builder

WORKDIR /app

COPY package.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY bun.lock ./bun.lock

RUN bun install --frozen-lockfile

COPY apps/web ./apps/web

WORKDIR /app/apps/web

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
ARG VITE_STATUS_POLL_INTERVAL_MS
ENV VITE_STATUS_POLL_INTERVAL_MS=${VITE_STATUS_POLL_INTERVAL_MS}

RUN bun run build

# Production server dengan nginx
FROM nginx:alpine

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
