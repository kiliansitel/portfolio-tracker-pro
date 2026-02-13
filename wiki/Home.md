<p align="center">
  <img src="https://raw.githubusercontent.com/kiliansitel/portfolio-tracker-pro/main/logo.svg" alt="Portfolio Tracker Pro" width="96" height="96">
</p>

<h1 align="center">Portfolio Tracker Pro — Wiki</h1>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.28.1-blue" alt="Version">
  <img src="https://github.com/kiliansitel/portfolio-tracker-pro/actions/workflows/ci.yml/badge.svg" alt="Tests">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/docker-multi--arch-2496ED?logo=docker&logoColor=white" alt="Docker">
</p>

**Portfolio Tracker Pro** is a self-hosted portfolio tracker with an AI assistant, real-time prices, and TradingView-style charts. Privacy-first, mobile-ready, one Docker command to start.

🌐 **Live Demo:** [protracker.chillnet.site](https://protracker.chillnet.site) — Login: `demo` / `DemoPass123!`

---

## 📖 Documentation

| Page | Description |
|------|-------------|
| **[User Manual](User-Manual)** | Complete guide to every feature — dashboard, charts, Oracle AI, alerts, exports |
| **[API Reference](API-Reference)** | All REST API endpoints with examples |
| **[Self-Hosting Guide](Self-Hosting-Guide)** | Docker setup, environment variables, reverse proxy, backups |
| **[Development Guide](Development-Guide)** | Architecture, project structure, running locally, testing, contributing |

---

## ⚡ Quick Start

```bash
docker run -d -p 8080:8080 \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -v portfolio-data:/app/data \
  kiliansitel/portfolio-tracker-pro:latest
```

Open **http://localhost:8080** → create an account → start tracking.

---

## ✨ Key Features

- 🧠 **Oracle AI Assistant** — Multi-provider (OpenAI, Anthropic, Google, Ollama, OpenRouter), streaming, voice input, PDF export
- 📈 **Live Charts** — TradingView candlestick charts with RSI, MA100/MA200, 6 timeframes, SSE real-time pricing
- 💼 **Full Portfolio Tracking** — Stocks, options, crypto, cash with P&L, cost basis, multi-currency support
- 🔗 **13-Chain Wallet Sync** — BTC, ETH, SOL, BNB + 9 more with ERC-20/SPL token detection
- 👀 **Smart Watchlists** — Multiple lists, categories, price targets, alerts
- 📱 **Mobile-First PWA** — Installable, offline-capable, responsive
- 🔒 **Secure Multi-User** — JWT + Argon2id, CSP, rate limiting
- 💰 **Dividend Tracking** — Yield badges, income calendar, upcoming ex-dates
- 📊 **Sector & Geographic Exposure** — Donut charts for allocation, sectors, regions
- 📥 **CSV Import** — Interactive Brokers, Keytrade Bank, CoinMarketCap auto-detect

---

## 🔗 Links

- [GitHub Repository](https://github.com/kiliansitel/portfolio-tracker-pro)
- [Docker Hub](https://hub.docker.com/r/kiliansitel/portfolio-tracker-pro)
- [Issues](https://github.com/kiliansitel/portfolio-tracker-pro/issues)
- [Releases](https://github.com/kiliansitel/portfolio-tracker-pro/releases)
- [Changelog (VERSIONS.md)](https://github.com/kiliansitel/portfolio-tracker-pro/blob/main/VERSIONS.md)
