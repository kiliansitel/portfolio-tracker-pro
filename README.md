<p align="center">
  <img src="https://raw.githubusercontent.com/kiliansitel/portfolio-tracker-pro/main/logo.svg" alt="Portfolio Tracker Pro" width="128" height="128">
</p>

<h1 align="center">Portfolio Tracker Pro</h1>

<p align="center">
  A TradingView-inspired portfolio tracker with real-time prices, interactive charts, and multi-user support.
</p>

![Version](https://img.shields.io/badge/version-0.17.5-blue)
![Tests](https://github.com/kiliansitel/portfolio-tracker-pro/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- 📊 **Interactive Charts** — Area/candlestick views with MA20/50/200 overlays
- 💼 **Portfolio Management** — Track positions, options, and cash
- 👀 **Watchlists** — Customizable with categories and price alerts
- 🔔 **Alerts** — Set price targets with notifications
- 📰 **News Feed** — Real-time market news with stock-specific filtering
- 🥧 **Allocation Chart** — Visual donut chart showing portfolio breakdown
- 📱 **Mobile-First** — Swipe actions, collapsible sections, responsive design
- 👥 **Multi-User** — JWT auth with per-user portfolios
- ⚡ **Fast** — LocalStorage caching, multi-source price fallback

## Tech Stack

- **Frontend:** Vanilla JS, [LightweightCharts](https://tradingview.github.io/lightweight-charts/), CSS3
- **Backend:** Node.js, Express, Helmet
- **Database:** SQLite (sql.js)
- **Auth:** JWT + Argon2id (OWASP recommended)
- **CI/CD:** GitHub Actions, Docker
- **Security:** Rate limiting, input validation, audit logging

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
![Dashboard](https://raw.githubusercontent.com/kiliansitel/portfolio-tracker-pro/main/screenshots/dashboard.jpg)

### Positions
![Positions](https://raw.githubusercontent.com/kiliansitel/portfolio-tracker-pro/main/screenshots/positions.jpg)

### Add/Edit Position
![Add Position](https://raw.githubusercontent.com/kiliansitel/portfolio-tracker-pro/main/screenshots/add-position.jpg)

### Watchlist
![Watchlist](https://raw.githubusercontent.com/kiliansitel/portfolio-tracker-pro/main/screenshots/watchlist.jpg)

### Add to Watchlist
![Add Watchlist](https://raw.githubusercontent.com/kiliansitel/portfolio-tracker-pro/main/screenshots/add-watchlist.jpg)

### Alerts
![Alerts](https://raw.githubusercontent.com/kiliansitel/portfolio-tracker-pro/main/screenshots/alerts.jpg)

### News
![News](https://raw.githubusercontent.com/kiliansitel/portfolio-tracker-pro/main/screenshots/news.jpg)

### Transactions
![Transactions](https://raw.githubusercontent.com/kiliansitel/portfolio-tracker-pro/main/screenshots/transactions.jpg)

### Chart Detail
![Chart Detail](https://raw.githubusercontent.com/kiliansitel/portfolio-tracker-pro/main/screenshots/chart-detail.jpg)

### Settings
![Settings](https://raw.githubusercontent.com/kiliansitel/portfolio-tracker-pro/main/screenshots/settings.jpg)

## Version History

See [VERSIONS.md](VERSIONS.md) for full changelog.

- **v0.17.5** — Logo in app header, CI fix
- **v0.17.4** — Project logo and favicon
- **v0.17.3** — Performance chart uses cost basis (matches P&L)
- **v0.17.2** — Fix performance chart rendering, allocation option prices
- **v0.17.1** — Fix options multiplier, rate limiting
- **v0.17.0 "Horizon"** — Portfolio performance chart with historical reconstruction
- **v0.16.0 "Slice"** — Portfolio allocation donut chart
- **v0.15.0 "Ironclad"** — Security hardening, CI pipeline, tests
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
- [ ] Google Cloud Run demo instance
- [ ] Broker API integrations:
  - [ ] [Keytrade Bank API](https://developer.keytradebank.be/apis)
  - [ ] More brokers TBD

## License

MIT
