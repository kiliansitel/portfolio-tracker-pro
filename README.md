# Portfolio Tracker Pro

A TradingView-inspired portfolio tracker with real-time prices, interactive charts, and multi-user support.

![Version](https://img.shields.io/badge/version-0.14.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- 📊 **Interactive Charts** — Area/candlestick views with MA20/50/200 overlays
- 💼 **Portfolio Management** — Track positions, options, and cash
- 👀 **Watchlists** — Customizable with categories and price alerts
- 🔔 **Alerts** — Set price targets with notifications
- 📰 **News Feed** — Real-time market news with stock-specific filtering
- 📱 **Mobile-First** — Swipe actions, collapsible sections, responsive design
- 👥 **Multi-User** — JWT auth with per-user portfolios
- ⚡ **Fast** — LocalStorage caching, multi-source price fallback

## Tech Stack

- **Frontend:** Vanilla JS, Chart.js, CSS3
- **Backend:** Node.js, Express
- **Database:** SQLite (sql.js)
- **Auth:** JWT + bcrypt

## Quick Start

### Docker (Recommended)
```bash
docker run -d -p 8080:8080 -v portfolio-data:/app/data kiliansitel/portfolio-tracker-pro:latest
```

### Docker Compose
```bash
git clone https://github.com/kiliansitel/portfolio-tracker-pro.git
cd portfolio-tracker-pro
docker-compose up -d
```

### Node.js
```bash
git clone https://github.com/kiliansitel/portfolio-tracker-pro.git
cd portfolio-tracker-pro/server
npm install && npm start
```

Open http://localhost:8080

📖 **[Full Installation Guide](docs/INSTALL.md)** — Docker, reverse proxy, environment variables, backups

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Get JWT token |
| GET | `/api/portfolios` | List portfolios |
| POST | `/api/portfolios/:id/positions` | Add position |
| GET | `/api/watchlists` | List watchlists |
| GET | `/api/alerts` | List alerts |

## Screenshots

### Dashboard
![Dashboard](screenshots/dashboard.jpg)

### Positions
![Positions](screenshots/positions.jpg)

### Watchlist
![Watchlist](screenshots/watchlist.jpg)

### Alerts
![Alerts](screenshots/alerts.jpg)

### Chart Detail
![Chart Detail](screenshots/chart-detail.jpg)

## Version History

See [VERSIONS.md](VERSIONS.md) for full changelog.

- **v0.14.0 "Fortress"** — Argon2id password hashing (fixes #1)
- **v0.13.0 "Newswire"** — Market news integration
- **v0.12.0 "Chronicle"** — Transaction history, alert notifications
- **v0.11.0 "Container"** — Docker support
- **v0.10.0 "Export"** — CSV/PDF export
- **v0.9.0 "Theme"** — Dark/light mode
- **v0.8.0 "Detail"** — Full-screen charts, MA toggles

## Roadmap

- [x] User authentication (JWT)
- [x] Portfolio & position tracking
- [x] Watchlist with categories
- [x] Price alerts with Telegram notifications
- [x] Transaction history
- [x] Interactive charts (area/candle, MA overlays)
- [x] Export to CSV/PDF
- [x] Docker support
- [x] Cross-device sync (pinned markets)
- [x] Portfolio performance over time
- [x] News integration
- [ ] Options chain viewer
- [ ] Push notifications (browser/mobile)
- [ ] Multiple currency support

## License

MIT
