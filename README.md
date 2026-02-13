<p align="center">
  <img src="logo.svg" alt="Portfolio Tracker Pro" width="128" height="128">
</p>

<h1 align="center">Portfolio Tracker Pro</h1>

<p align="center">
  <strong>Self-hosted portfolio tracker with AI assistant, real-time prices, and TradingView-style charts.</strong><br>
  Privacy-first. Mobile-ready. One Docker command to start.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.28.1-blue" alt="Version">
  <img src="https://github.com/kiliansitel/portfolio-tracker-pro/actions/workflows/ci.yml/badge.svg" alt="Tests">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/docker-multi--arch-2496ED?logo=docker&logoColor=white" alt="Docker">
</p>

<p align="center">
  <img src="screenshots/dashboard.png" width="280" alt="Dashboard">
  <img src="screenshots/oracle-response-top.png" width="280" alt="Oracle AI in Action">
</p>

## Quick Start

```bash
docker run -d -p 8080:8080 -e JWT_SECRET=$(openssl rand -hex 32) -v portfolio-data:/app/data kiliansitel/portfolio-tracker-pro:latest
```

Open **http://localhost:8080** → create an account → start tracking.

> 🔑 **Set `JWT_SECRET`** for persistent sessions across container restarts.

> **Demo account included** — Username: `demo` / Password: `DemoPass123!`

## Features

- 🧠 **Oracle AI Assistant** — Chat with your portfolio. Build a portfolio from scratch with guided onboarding. Multi-provider support with streaming responses, context injection, and conversation history
- 🎤 **Voice Input for Oracle AI** — Speak your questions using Web Speech API. Mic button with pulsing animation while listening
- 📄 **Export AI Conversations as PDF** — Per-message and full conversation export with clean print-friendly layout and branding
- 🎯 **Strategy Advisor** — Oracle quick action for personalized trading strategies (options plays, DCA plans, hedging, position sizing)
- 🛡️ **Risk & Correlation Analysis** — Oracle quick action for portfolio risk assessment (concentration, correlation, sector exposure, beta, tail risk)
- 📊 **Scheduled AI Reports** — Daily portfolio summaries and weekly digests, configurable in Settings. Reports save as Oracle conversations
- 🤖 **6 AI Providers** — OpenAI, Anthropic, Google, Ollama (with model auto-detection), OpenRouter, and any OpenAI-compatible endpoint
- 🦙 **Ollama Integration** — Auto-detects available models from any Ollama server (custom ports supported). Configurable context window (`num_ctx`) per model
- 📈 **Live Charts** — TradingView-quality candlestick charts with RSI (14), MA100/MA200 toggles, 6 timeframes (1D/5D/1M/3M/1Y/All), logarithmic scale on All, auto-fitting, dynamic bar spacing
- ⚡ **Real-Time Pricing (SSE)** — Server-Sent Events live price streaming (crypto 3s, stocks 8s), micro-tick animations, green/red flash on changes, pulsing live indicator, after-hours/pre-market ticking, index futures on dashboard
- 📊 **Interactive Charts** — TradingView-powered area/candlestick charts with MA overlays, allocation donut, performance tracking
- 💼 **Full Portfolio Tracking** — Stocks, options, crypto, cash. P&L, cost basis, transaction history, source/location tracking. Smart P&L handling shows "—" when cost basis is unknown (e.g. wallet-synced positions)
- 🔗 **13-Chain Wallet Sync** — BTC, ETH, SOL, BNB + 9 more. Chain-specific address validation, auto-sync on add, wallet delete, ERC-20/SPL token and DeFi position detection
- 📥 **CSV Import** — Auto-detect format for Interactive Brokers, Keytrade Bank, CoinMarketCap portfolio export, and generic CSV
- 💱 **Multi-Currency Support** — Positions store original purchase currency (EUR, GBP, etc.). Dashboard aggregates using live exchange rates. Entry prices display in original currency
- 🕐 **After-Hours / Pre-Market Pricing** — PM (blue) and AH (purple) badges show extended hours prices on position cards, watchlist, and dashboard
- 💰 **Dividend Tracking & Income Calendar** — Yield badges on positions, annual income estimate, monthly bar chart, upcoming ex-dates
- 🗺️ **Sector & Geographic Exposure** — Tabbed donut charts (Allocation | Sectors | Regions) on dashboard with Yahoo Finance data
- 🌍 **Global Market Search** — Autocomplete searches all markets via Yahoo Finance (EU, Asia, all exchanges). Local popular tickers prioritized for speed
- 👀 **Smart Watchlists** — Multiple lists, category grouping, price targets, Telegram & push alerts
- 📱 **Mobile-First PWA** — Installable on any device. Service worker with network-first HTML caching for offline support. Responsive design, swipe actions, compact numbers
- 🔒 **Secure Multi-User** — JWT + Argon2id auth, CSP, rate limiting, session management. JWT session persistence in Docker (survives container restarts)
- 💾 **Backup & Restore** — Full database backup/restore with one click
- 🐳 **Docker Ready** — Multi-arch images (amd64/arm64), CI/CD pipeline, one-line deploy. Auto-detects Docker environment and shows `docker pull` upgrade instructions

<p align="center">
  <img src="screenshots/oracle-welcome.png" width="280" alt="Oracle Welcome">
  <img src="screenshots/oracle-response-bottom.png" width="280" alt="Oracle Action Buttons">
</p>

<p align="center">
  <img src="screenshots/positions.png" width="280" alt="Positions">
  <img src="screenshots/chart-detail.png" width="280" alt="TradingView Charts">
</p>

<details>
<summary>📸 More Screenshots</summary>

<p align="center">
  <img src="screenshots/allocation.png" width="280" alt="Allocation">
  <img src="screenshots/watchlist.png" width="280" alt="Watchlist">
</p>

<p align="center">
  <img src="screenshots/news.png" width="280" alt="News">
  <img src="screenshots/transactions.png" width="280" alt="Transactions">
</p>

<p align="center">
  <img src="screenshots/wallets.png" width="280" alt="Wallet Sync">
  <img src="screenshots/settings.png" width="280" alt="Settings">
</p>

<p align="center">
  <img src="screenshots/login.png" width="280" alt="Login">
  <img src="screenshots/alerts.png" width="280" alt="Alerts">
</p>

</details>

## Installation

### Docker Compose

```bash
git clone https://github.com/kiliansitel/portfolio-tracker-pro.git
cd portfolio-tracker-pro
docker-compose up -d
```

### Manual

```bash
git clone https://github.com/kiliansitel/portfolio-tracker-pro.git
cd portfolio-tracker-pro/server
npm install && npm start
```

📖 **[Full Manual](docs/MANUAL.md)** — User guide, API reference, self-hosting docs  
📦 **[Installation Guide](docs/INSTALL.md)** — Reverse proxy, env variables, backups

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Vanilla JS (12 modules), [LightweightCharts](https://tradingview.github.io/lightweight-charts/), CSS3 |
| Backend | Node.js, Express, Helmet |
| Database | SQLite (sql.js) |
| Auth | JWT + Argon2id |
| AI | OpenAI, Anthropic, Google, Ollama, OpenRouter, Custom OpenAI-compatible |
| Offline | Service Worker (network-first HTML caching) |
| Real-Time | Server-Sent Events (SSE) for live price streaming |
| Infra | Docker multi-arch, GitHub Actions CI/CD |

## Version History

See **[VERSIONS.md](VERSIONS.md)** for full changelog.

| Version | Highlights |
|---------|-----------|
| **v0.28.1** | Chart Density Fix — higher-resolution candle intervals (hourly/daily), smart barSpacing cap |
| **v0.28.0** | Live Charts & Real-Time Pricing — candlestick charts with RSI/MA, SSE live streaming, after-hours pricing, index futures |
| **v0.27.0** | Security hardening — DOMPurify XSS protection, rate limiting, input validation, error sanitization |
| **v0.26.0** | Strategy Advisor, Risk & Correlation Analysis, Scheduled Auto-Reports (daily/weekly) |
| **v0.25.0** | Voice input for Oracle AI, PDF export for AI insights, modal fixes, AH badge improvements |
| **v0.24.0** | After-hours/pre-market pricing, dividend tracking & income calendar, sector/geo exposure |
| **v0.23.0** | Native multi-currency support, alerts API auth fix, full position API responses |
| **v0.22.0** | Frontend modularization (14 files) + validation fix (#9) |
| **v0.21.12** | Global ticker search (Yahoo Finance — all markets) + alert fix |
| **v0.21.11** | Reverse proxy compatibility + AI provider resilience |
| **v0.21.10** | Prevent bad snapshots from failed price fetches |
| **v0.21.9** | Fix service worker cache issues, JS syntax error |
| **v0.21.8** | Fix P&L display for wallet-synced positions, service worker cache |
| **v0.21.7** | CoinMarketCap portfolio CSV import support |
| **v0.21.6** | Configurable context window (num_ctx) for Ollama models |
| **v0.21.5** | Fix Ollama model persistence, JWT session survival in Docker |
| **v0.21.4** | Fix Ollama model selection persistence after save |
| **v0.21.3** | Fix Ollama auto-detect on custom ports, model:tag format, Docker git suppression |
| **v0.21.2** | Ollama/LM Studio model auto-detection, login error fix |
| **v0.21.1** | Docker path fix, wallet delete button, chain address validation |
| **v0.21.0** "Oracle" | AI chat assistant, multi-provider, streaming SSE, conversation persistence |
| **v0.20.3** | Visual polish: 4-char logos, blue buttons, centered empty states, 20-color donut |
| **v0.20.2** | Position/watchlist sorting, loading skeletons, session timeout warning |
| **v0.20.1** | Password change, backup/restore, PWA, smart broker CSV import |
| **v0.20.0** "Compass" | Position source tracking, compact numbers, demo database, DeFi tracking |

## Supported CSV Formats

| Broker/Source | Auto-Detect | Notes |
|---------------|:-----------:|-------|
| Interactive Brokers | ✅ | Trades, dividends, positions |
| Keytrade Bank | ✅ | Transaction export |
| CoinMarketCap | ✅ | Portfolio CSV export |
| Generic CSV | — | Manual column mapping |

## Roadmap

- [x] ~~Docker JWT session persistence~~
- [x] ~~Wallet management (delete, auto-sync on add)~~
- [x] ~~Chain-specific address validation (13 chains)~~
- [x] ~~Ollama model auto-detection & custom ports~~
- [x] ~~CoinMarketCap CSV import~~
- [x] ~~Configurable context window for Ollama~~
- [x] ~~Smart P&L for wallet-synced positions~~
- [x] ~~Global market search (EU, Asia, all exchanges via Yahoo Finance)~~
- [x] ~~Multi-currency support (native currency storage + live FX rates)~~
- [x] ~~After-hours / pre-market pricing~~
- [x] ~~Voice input for Oracle AI (Web Speech API)~~
- [x] ~~Export/share AI insights as PDF~~
- [ ] Live broker API sync (Keytrade, IBKR)
- [x] ~~Dividend tracking & income calendar~~
- [x] ~~AI news digest & scheduled reports~~
- [x] ~~Portfolio rebalance suggestions~~
- [x] ~~Sector & geographic exposure views~~
- [ ] Google Cloud Run public demo
- [ ] Mobile app (React Native / Capacitor)

## License

MIT — Use it, fork it, self-host it.
