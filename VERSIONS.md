# Portfolio Tracker Pro — Version History

## v0.13.0 "Newswire" (2026-02-06) ← CURRENT
Market news integration.

**New Features:**
- 📰 **News Feed** — Real-time market news from Google News RSS
- 🔍 **Search News** — Search any topic (earnings, AI, crypto)
- 💼 **Portfolio News** — Filter news for your owned stocks
- 🏷️ **Source Icons** — Visual icons for Bloomberg, CNBC, WSJ, etc.
- 📱 **Clean UI** — TradingView-inspired news cards

**API Endpoints:**
```
GET /api/news                — General market news
GET /api/news?symbol=NVDA    — Stock-specific news
GET /api/news?query=AI       — Custom search query
```

---

## v0.12.0 "Chronicle" (2026-02-06)
Transaction history and alert notifications.

**New Features:**
- 📜 **Transaction History** — Track buys/sells with dates, prices, fees
- 🔔 **Alert Notifications** — Telegram alerts when price targets hit
- ⏰ **Cron-based checking** — Hourly checks during market hours
- 🔄 **Swipe to delete** — Transactions support swipe actions

**API Endpoints:**
```
GET  /api/transactions              — All user transactions
GET  /api/portfolios/:id/transactions — Portfolio transactions
POST /api/portfolios/:id/transactions — Add transaction
DELETE /api/transactions/:id        — Delete transaction
GET  /api/alerts/check              — Internal alert checker
```

---

## v0.11.0 "Container" (2026-02-06)
Docker containerization.

**New Features:**
- 🐳 **Dockerfile** — Multi-stage build, alpine-based
- 🐳 **docker-compose.yml** — Easy deployment with volumes
- 📁 **Configurable data directory** — DATA_DIR environment variable
- ❤️ **Health checks** — Built-in container health monitoring

**Usage:**
```bash
docker-compose up -d
```

---

## v0.10.0 "Export" (2026-02-06)
Data export functionality.

**New Features:**
- 📄 **CSV Export** — Export positions and watchlist to CSV
- 📑 **PDF Report** — Full portfolio summary (opens print dialog)
- Settings → Export Data section

---

## v0.9.0 "Theme" (2026-02-06)
Dark/light theme toggle.

**New Features:**
- 🌙☀️ **Theme toggle** — Switch between dark and light mode
- Settings → Appearance → Choose theme
- Persists in localStorage
- Chart colors update automatically

---

## v0.8.0 "Detail" (2026-02-06)
Full-screen chart modal with advanced features.

**New Features:**
- 📊 **Detail chart modal** — Full-screen view on ticker tap
- 🕯️ **Candle/Area toggle** — Switch chart types
- 📉 **MA toggles** — MA20, MA50, MA200 checkboxes
- 📌 **Pin to Markets** — Add tickers to dashboard overview
- ➕ **Clean + buttons** — Minimal circular add buttons

---

## v0.7.0 "Turbo" (2026-02-06)
Chart performance optimizations.

**Features:**
- ⚡ **Instant chart display** — Shows cached data immediately
- 📦 **Chart data caching** — LocalStorage with 5 min freshness
- 🔄 **Background refresh** — Fresh data without blocking UI
- 🚫 **Abort on switch** — Cancels previous fetch
- 🔀 **Multi-proxy fallback** — corsproxy → allorigins

---

## v0.6.x "Swipe" (2026-02-06)
Mobile-friendly swipe actions.

**Features:**
- 👆 **Swipe actions** — Swipe left to reveal Edit/Delete
- 📂 **Collapsible categories** — Tap to expand/collapse
- Works on Portfolio, Watchlist, and Alerts pages

---

## v0.5.x "Velocity" (2026-02-06)
Price caching and multi-source fetching.

**Features:**
- 📦 **LocalStorage caching** — Instant loads
- 🔀 **Multiple data sources** — Automatic failover
- ⚡ **Batch fetching** — Parallel requests

---

## v0.4.0 "Polaris" (2026-02-06)
UI/UX improvements.

**Features:**
- 📱 **Position cards** — Mobile-friendly layout
- ✏️ **Edit functionality** — Edit positions and watchlist items
- 📂 **Category grouping** — Watchlist organized by category
- 🔔 **Alerts page** — View all price alerts

---

## v0.3.0 "Atlas" (2026-02-06)
Backend with authentication.

**Features:**
- 🔐 **JWT authentication** — Register/login
- 👥 **Multi-user support** — Per-user portfolios
- 💾 **SQLite database** — Persistent storage
- 🔌 **REST API** — Full CRUD operations

---

## v0.2.0 "Foundation" (2026-02-05)
Moving averages and expanded features.

**Features:**
- 📈 **Moving averages** — MA20, MA50, MA200
- 📋 **25 tickers** — Expanded watchlist
- 📱 **Mobile layout** — Tab navigation

---

## v0.1.0 "Genesis" (2026-02-05)
Initial release.

**Features:**
- 📊 **TradingView charts** — Lightweight Charts
- 💼 **Portfolio tracking** — Positions with P&L
- 🌍 **Markets overview** — Key indices
- 📱 **Mobile-first** — Responsive design

---

## Roadmap
- [x] Dark/light theme toggle
- [x] Export to CSV/PDF
- [x] Docker container
- [x] Portfolio performance history
- [x] News integration
- [ ] Options chain viewer
- [ ] Push notifications for alerts
- [ ] Multiple currency support

---

*Made with ☕ and late nights*
