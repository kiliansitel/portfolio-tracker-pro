# Installation Guide

## Quick Start (Node.js)

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Steps

```bash
# Clone the repository
git clone https://github.com/kiliansitel/portfolio-tracker-pro.git
cd portfolio-tracker-pro

# Install dependencies
cd server
npm install

# Start the server
npm start

# Open in browser
open http://localhost:8080
```

The app will create a `portfolio.db` SQLite database on first run.

---

## Docker (Recommended)

### Option 1: Docker Compose (Easiest)

```bash
# Clone and start
git clone https://github.com/kiliansitel/portfolio-tracker-pro.git
cd portfolio-tracker-pro
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Option 2: Docker Run

```bash
# Pull from Docker Hub
docker pull kiliansitel/portfolio-tracker-pro:latest

# Run with persistent data
docker run -d \
  --name portfolio-tracker \
  -p 8080:8080 \
  -v portfolio-data:/app/data \
  kiliansitel/portfolio-tracker-pro:latest

# Or build locally
docker build -t portfolio-tracker-pro .
docker run -d -p 8080:8080 -v portfolio-data:/app/data portfolio-tracker-pro
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `JWT_SECRET` | (random) | Secret for JWT tokens (set in production!) |
| `DATA_DIR` | `/app/data` | Database storage location |

### Docker Compose Configuration

```yaml
version: '3.8'
services:
  portfolio-tracker:
    image: kiliansitel/portfolio-tracker-pro:latest
    ports:
      - "8080:8080"
    volumes:
      - portfolio-data:/app/data
    environment:
      - JWT_SECRET=your-secure-secret-here
    restart: unless-stopped

volumes:
  portfolio-data:
```

---

## Reverse Proxy (Nginx)

For HTTPS access, use Nginx as a reverse proxy:

```nginx
server {
    listen 443 ssl;
    server_name portfolio.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Updating

### Docker
```bash
docker-compose pull
docker-compose up -d
```

### Node.js
```bash
git pull
cd server && npm install
# Restart your process manager (pm2, systemd, etc.)
```

---

## Backup

The database is stored in `portfolio.db`. To backup:

```bash
# Docker
docker cp portfolio-tracker:/app/data/portfolio.db ./backup.db

# Local
cp server/portfolio.db ./backup.db
```

---

## Troubleshooting

### Port already in use
```bash
# Find what's using port 8080
lsof -i :8080

# Use a different port
PORT=3000 npm start
# or
docker run -p 3000:8080 ...
```

### Database errors
```bash
# Reset database (warning: deletes all data)
rm server/portfolio.db
npm start
```

### Docker permission issues
```bash
# Fix volume permissions
sudo chown -R 1001:1001 /path/to/data
```
