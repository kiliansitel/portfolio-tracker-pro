<p align="center">
  <img src="https://raw.githubusercontent.com/kiliansitel/portfolio-tracker-pro/main/logo.svg" alt="Portfolio Tracker Pro" width="128" height="128">
</p>

<h1 align="center">Portfolio Tracker Pro</h1>

<p align="center">
  A TradingView-inspired portfolio tracker with real-time prices, interactive charts, and multi-user support.
</p>

![Version](https://img.shields.io/badge/version-0.19.1-blue)
![Tests](https://github.com/kiliansitel/portfolio-tracker-pro/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- 📊 **Interactive Charts** — Area/candlestick views with MA20/50/200 overlays
- 💼 **Portfolio Management** — Track positions, options, and cash with grouped display
- 🔗 **Blockchain Wallets** — Connect public addresses across 13 chains with auto-sync
- ⛓️ **13 Chains** — BTC, ETH, SOL, BNB, AVAX, MATIC, ARB, OP, LTC, DOGE, XRP, ADA, DOT
- 👀 **Watchlists** — Customizable with 12+ categories, price alerts, and dropdown selector
- 🔔 **Alerts** — Set price targets with Telegram & push notifications
- ⛓️ **Options Chain** — View calls/puts with strikes and expiry dates
- 📰 **News Feed** — Real-time market news with stock-specific filtering
- 🥧 **Allocation Chart** — Visual donut chart showing portfolio breakdown
- 📈 **Performance Chart** — Historical portfolio value with daily snapshots
- 📊 **OHLCV History** — Stored daily candles for all tracked symbols (back to 1984)
- 💱 **Multi-Currency** — EUR, USD, GBP, CHF with live exchange rates
- 🔔 **Push Notifications** — Browser push via service worker (HTTPS required)
- 📱 **Mobile-First** — Swipe actions, collapsible sections, responsive design
- 👥 **Multi-User** — JWT auth with per-user portfolios
- 🔒 **Security Hardened** — CSP, CORS lockdown, input validation, audit logging
- ⚡ **Fast** — LocalStorage caching, debounced DB writes, indexed queries
- 🏗️ **Modular Architecture** — Clean route modules, utility services, middleware layers

## Tech Stack

- **Frontend:** Vanilla JS, [LightweightCharts](https://tradingview.github.io/lightweight-charts/), CSS3
- **Backend:** Node.js, Express, Helmet
- **Database:** SQLite (sql.js) with indexed queries
- **Auth:** JWT + Argon2id (OWASP recommended)
- **Notifications:** Web Push (VAPID), Telegram Bot API
- **CI/CD:** GitHub Actions, Docker (multi-arch amd64/arm64)
- **Security:** Rate limiting, input validation, CSP, audit logging

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

📖 **[Full Manual](docs/MANUAL.md)** — Complete user guide, API reference, and self-hosting docs

📦 **[Installation Guide](docs/INSTALL.md)** — Docker, reverse proxy, environment variables, backups

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Get JWT token |
| GET | `/api/portfolios` | List portfolios |
| POST | `/api/portfolios/:id/positions` | Add position |
| GET | `/api/watchlists` | List watchlists |
| GET | `/api/alerts` | List alerts |
| GET | `/api/options/:symbol` | Get options chain |
| GET | `/api/options/:symbol/:expiry` | Get options for expiry |
| GET | `/api/exchange-rates` | Get currency exchange rates |
| POST | `/api/push/subscribe` | Subscribe to push notifications |
| POST | `/api/push/unsubscribe` | Unsubscribe from push |
| POST | `/api/push/test` | Send test push notification |
| GET | `/api/history/:symbol` | Get stored OHLCV data |
| GET | `/api/history/status` | Collection stats |
| POST | `/api/history/collect` | Trigger OHLCV backfill |
| POST | `/api/portfolios/:id/snapshot/auto` | Auto portfolio snapshot |
| GET | `/api/wallets` | List connected wallets |
| POST | `/api/wallets` | Add wallet (chain, address) |
| DELETE | `/api/wallets/:id` | Remove wallet |
| POST | `/api/wallets/:id/sync` | Sync wallet balance |
| POST | `/api/wallets/sync-all` | Sync all wallets |
| GET | `/api/wallets/summary` | On-chain value summary |
| POST | `/api/wallets/:id/fetch-transactions` | Fetch chain transactions |
| GET | `/api/wallets/:id/transactions` | List chain transactions |
| GET | `/api/info` | App version & environment |

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

### Options Chain
![Options Chain](https://raw.githubusercontent.com/kiliansitel/portfolio-tracker-pro/main/screenshots/options-chain.jpg)

### Wallets
![Wallets](https://raw.githubusercontent.com/kiliansitel/portfolio-tracker-pro/main/screenshots/wallets.jpg)

### Wallet Tokens
![Wallet Tokens](https://raw.githubusercontent.com/kiliansitel/portfolio-tracker-pro/main/screenshots/wallet-tokens.jpg)

### Settings
![Settings](https://raw.githubusercontent.com/kiliansitel/portfolio-tracker-pro/main/screenshots/settings.jpg)

## Version History

See [VERSIONS.md](VERSIONS.md) for full changelog.

- **v0.19.1** — ERC-20 token tracking, self-update system, UI polish
- **v0.19.0 "Chain"** — Blockchain wallet tracking (13 chains), positions redesign, auto-sync, on-chain transactions
- **v0.18.2 "Vault"** — Historical OHLCV storage, auto-snapshots, Docker/CI fixes, Playwright caching
- **v0.18.1 "Forge"** — Code modularization, multi-currency (EUR/USD/GBP/CHF), push notifications
- **v0.18.0 "Chain"** — Options chain viewer + security hardening (CSP, CORS, validators, debounced writes)
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

### ✅ Completed
- [x] User authentication (JWT + Argon2id)
- [x] Portfolio & position tracking (stocks, options, crypto)
- [x] Watchlist with 12+ categories and price alerts
- [x] Telegram alert notifications
- [x] Transaction history with realized P&L
- [x] Interactive charts (area/candle, MA20/50/200)
- [x] Options chain viewer (calls/puts, expiry selector, ITM highlighting)
- [x] Portfolio performance chart
- [x] Allocation donut chart
- [x] News integration (Google News RSS)
- [x] Export to CSV/PDF
- [x] Docker + CI/CD pipeline
- [x] Security hardening (CSP, CORS, rate limiting, input validation, audit logging)
- [x] SVG ticker icons for crypto, commodities, indices, forex
- [x] Multi-currency support (EUR/USD/GBP/CHF) with live exchange rates
- [x] Push notifications (browser, VAPID-based)
- [x] Modular architecture (8 route modules, utility services)
- [x] Historical OHLCV price storage with daily collection
- [x] Automated daily portfolio snapshots
- [x] Blockchain wallet tracking (13 chains, auto-sync)
- [x] On-chain transaction history (BTC, ETH)
- [x] Positions page redesign (grouped, sorted, summary bar)
- [x] ERC-20 token tracking (20 popular tokens via RPC)
- [x] Token → position sync (auto-create portfolio positions from wallet tokens)
- [x] Self-update system (check updates, switch channels, one-click apply)
- [x] Comprehensive product manual (16 chapters)
- [x] Automated screenshot generation

### 🚧 In Progress

### 🧠 v0.20.0 "Oracle" — AI Intelligence Layer
The killer feature: connect any LLM to analyze your portfolio.
- [ ] Multi-provider support (OpenAI, Anthropic, Google, Ollama, OpenClaw)
- [ ] API key management with encryption
- [ ] Portfolio review & rebalancing suggestions
- [ ] Watchlist scanner with entry/exit signals
- [ ] Strategy advisor (options plays, DCA plans, hedging)
- [ ] Risk & correlation analysis
- [ ] AI-powered news digest for your holdings
- [ ] Chat interface for follow-up questions
- [ ] Scheduled auto-reports (daily/weekly AI briefings)

### 🔗 Blockchain Integration
- [x] Connect public addresses (13 chains: BTC, ETH, SOL, BNB, AVAX, MATIC, ARB, OP, LTC, DOGE, XRP, ADA, DOT)
- [x] Auto-sync balances from on-chain data (every 5 min)
- [x] Transaction history from block explorers (BTC, ETH)
- [x] Multi-wallet aggregation (sum per chain)
- [x] ERC-20 token tracking (20 popular tokens, direct RPC)
- [x] SPL token tracking (Solana — 14 popular tokens)
- [x] Token → position sync (wallet tokens auto-create positions)
- [x] DeFi position tracking (Aave, Compound, Rocket Pool, Lido)


### 🏦 Broker Integrations
- [ ] [Keytrade Bank API](https://developer.keytradebank.be/apis)
- [ ] Interactive Brokers
- [ ] More brokers TBD

### 🌐 Platform
- [ ] Google Cloud Run demo instance
- [ ] PWA with offline support
- [ ] Mobile app (React Native or Capacitor)
- [ ] Multi-user sharing (read-only portfolio links)

## License

MIT
