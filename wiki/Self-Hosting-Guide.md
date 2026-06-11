# Self-Hosting Guide

Everything you need to deploy Portfolio Tracker Pro on your own server.

---

## Table of Contents

- [Quick Start (Docker)](#quick-start-docker)
- [Docker Compose](#docker-compose)
- [Environment Variables](#environment-variables)
- [Data Persistence](#data-persistence)
- [Reverse Proxy](#reverse-proxy)
- [Multi-Architecture Support](#multi-architecture-support)
- [Updating](#updating)
- [Backup & Restore](#backup--restore)
- [Troubleshooting](#troubleshooting)

---

## Quick Start (Docker)

```bash
docker run -d \
  --name portfolio-tracker \
  -p 8080:8080 \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -v portfolio-data:/app/data \
  kiliansitel/portfolio-tracker-pro:latest
```

Open **http://localhost:8080** and create your account.

---

## Docker Compose

Create a `docker-compose.yml`:

```yaml
version: "3.8"

services:
  portfolio-tracker:
    image: kiliansitel/portfolio-tracker-pro:latest
    container_name: portfolio-tracker
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      # Optional: pin the secret. If omitted, a strong one is generated on first run
      # and persisted to the data volume. Generate with: openssl rand -hex 32
      - JWT_SECRET=${JWT_SECRET:-}
      - NODE_ENV=production
    volumes:
      - portfolio-data:/app/data
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8080/api/tickers/popular"]
      interval: 30s
      timeout: 10s
      start_period: 5s
      retries: 3

volumes:
  portfolio-data:
```

```bash
docker-compose up -d
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `JWT_SECRET` | ⚠️ | Auto-generated | Secret for JWT signing. **Set this** for sessions to survive container restarts |
| `PORT` | ❌ | `8080` | Server port |
| `NODE_ENV` | ❌ | `production` | Environment mode |
| `DATA_DIR` | ❌ | `/app/data` | Database storage directory |
| `CORS_ORIGIN` | ❌ | `false` (same-origin) | Set for cross-origin access |
| `ALERT_API_KEY` | ❌ | Auto-generated | API key for alert cron endpoint |
| `VAPID_PUBLIC_KEY` | ❌ | — | Web push VAPID public key |
| `VAPID_PRIVATE_KEY` | ❌ | — | Web push VAPID private key |
| `APP_ENV` | ❌ | `production` | `production` or `beta` |

### JWT Secret

> ⚠️ **Important:** If you don't set `JWT_SECRET`, the app auto-generates one and persists it to the data volume. This works for Docker but **you should set it explicitly** for reliability.

Generate a secure secret:

```bash
openssl rand -hex 32
```

### VAPID Keys (Push Notifications)

Generate VAPID keys for web push notifications:

```bash
npx web-push generate-vapid-keys
```

Set both `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Push notifications require HTTPS.

---

## Data Persistence

All data is stored in a SQLite database at `/app/data/portfolio.db` inside the container. **Mount a volume** to persist data:

```bash
-v portfolio-data:/app/data
```

Or bind to a host directory:

```bash
-v /path/on/host:/app/data
```

The data directory also stores:
- `.jwt_secret` — Auto-generated JWT secret (if not set via env)
- Database backups

---

## Reverse Proxy

The app supports running behind a reverse proxy. It has `trust proxy` enabled for proper IP detection.

### NGINX

```nginx
server {
    listen 443 ssl;
    server_name protracker.example.com;

    ssl_certificate /etc/ssl/certs/fullchain.pem;
    ssl_certificate_key /etc/ssl/private/privkey.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support (live pricing)
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

### SWAG (Let's Encrypt + NGINX)

Create `/config/nginx/proxy-confs/protracker.subdomain.conf`:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name protracker.*;

    include /config/nginx/ssl.conf;

    location / {
        include /config/nginx/proxy.conf;
        include /config/nginx/resolver.conf;
        set $upstream_app portfolio-tracker;
        set $upstream_port 8080;
        set $upstream_proto http;
        proxy_pass $upstream_proto://$upstream_app:$upstream_port;

        # SSE support
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

### Important: SSE Support

The app uses **Server-Sent Events** for live price streaming. Your reverse proxy must:
- Disable buffering (`proxy_buffering off`)
- Disable caching (`proxy_cache off`)
- Set long read timeout (`proxy_read_timeout 86400s`)
- Clear the Connection header (`proxy_set_header Connection ''`)

---

## Multi-Architecture Support

The Docker image supports:
- **amd64** (x86_64) — Standard PCs and servers
- **arm64** (aarch64) — Raspberry Pi 4/5, Apple Silicon, ARM servers

Docker automatically pulls the correct architecture.

---

## Updating

### Docker

```bash
docker pull kiliansitel/portfolio-tracker-pro:latest
docker stop portfolio-tracker
docker rm portfolio-tracker
docker run -d \
  --name portfolio-tracker \
  -p 8080:8080 \
  -e JWT_SECRET=your-secret \
  -v portfolio-data:/app/data \
  kiliansitel/portfolio-tracker-pro:latest
```

Or with Docker Compose:

```bash
docker-compose pull
docker-compose up -d
```

### In-App Update Check

The app auto-detects Docker environments. Go to **Settings → Updates** to:
- Check for new versions
- See `docker pull` upgrade instructions

### Non-Docker (Git)

```bash
cd portfolio-tracker-pro
git pull origin main
cd server && npm install
# Restart your process manager (systemd, pm2, etc.)
```

---

## Backup & Restore

### Via UI

- **Settings → Backup** → Download backup (`.db` file)
- **Settings → Restore** → Upload a backup file

### Via API

```bash
# Download backup
curl -b cookies.txt http://localhost:8080/api/backup -o backup.db

# Restore backup
curl -b cookies.txt -X POST \
  -H "Content-Type: application/octet-stream" \
  --data-binary @backup.db \
  http://localhost:8080/api/backup/restore
```

### Manual (Docker)

```bash
# Copy database out of container
docker cp portfolio-tracker:/app/data/portfolio.db ./backup.db

# Copy database into container
docker cp ./backup.db portfolio-tracker:/app/data/portfolio.db
docker restart portfolio-tracker
```

---

## Troubleshooting

### Container won't start

Check logs:
```bash
docker logs portfolio-tracker
```

### Sessions expire on restart

Set `JWT_SECRET` as an environment variable. Without it, a new secret is generated on each container creation (unless the data volume persists the auto-generated one).

### "Session expired" errors behind reverse proxy

Ensure your proxy forwards the correct headers:
- `X-Forwarded-For`
- `X-Forwarded-Proto`
- `Host`

The app has `trust proxy` enabled for the first proxy hop.

### SSE/live prices not working behind proxy

Ensure proxy buffering is disabled. See [Reverse Proxy → SSE Support](#important-sse-support).

### Health check failing

The built-in health check hits `/api/tickers/popular`. If the container is healthy but the endpoint times out, increase the timeout:

```yaml
healthcheck:
  timeout: 30s
  start_period: 15s
```
