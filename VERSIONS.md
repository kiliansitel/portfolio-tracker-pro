# Portfolio Tracker Pro — Version History
## v0.21.5 (2026-02-09)
- 🔧 Fix Ollama model selection no longer resets to hardcoded defaults (dynamic models preserved)
- 🔧 Header model dropdown now fetches real Ollama models dynamically
- 🔧 JWT secret auto-persists to data volume in Docker (sessions survive container restarts)
- 🔧 Ollama model fetch no longer triggers false "session expired" errors

---

## v0.21.4 (2026-02-09)
- 🔧 Fix Ollama model selection persistence — dropdown no longer snaps back to first model after save
- 🔧 Fixed provider data refresh order (refresh before re-render)

---

## v0.21.3 (2026-02-09)
- 🔧 Fix Ollama model auto-detect on custom ports (was using invalid fetch timeout option)
- 🔧 Model name fallbacks use proper `model:tag` format (e.g. `mistral:latest`)
- 🐳 Suppress `git: not found` errors in Docker containers

---

## v0.21.2 (2026-02-09)
- 🤖 Ollama/LM Studio model auto-detection — fetches available models from `/api/tags`
- 🐛 Fix wrong password showing "Session expired" instead of "Invalid credentials"

---

## v0.21.1 (2026-02-09)
- 🐛 Fix Docker path issue — `ENOENT: /public/index.html` (GitHub #3)
- 🗑️ Visible wallet delete button — no more hidden swipe-to-delete (GitHub #4)
- ✅ Chain-specific wallet address validation for all 13 chains (GitHub #5)
- 🔄 Service worker cache bump to v21

---

## v0.21.0 "Oracle" — AI Intelligence Layer (2026-02-08)
- 🧠 Multi-provider AI chat (OpenAI, Anthropic, Google, Ollama, OpenRouter, OpenClaw, Custom)
- 🔗 OpenClaw auto-detection — zero config when running alongside OpenClaw gateway
- 🔑 Anthropic setup-token support — Claude Pro/Max users need no API key
- 🔒 Encrypted API key storage per user
- 💬 Streaming SSE chat with markdown rendering
- 📋 Conversation persistence — save, list, load, delete conversations
- 📊 Context injection — toggle Portfolio, Watchlist, Market data into prompts
- 🔍 Quick analysis — Portfolio Review, Watchlist Signals, Position Deep Dive
- 💡 Dynamic follow-up suggestions after each AI response
- 📱 Mobile-responsive chat layout with safe-area support
- 🔧 Sort dropdown compact redesign
- 🛡️ Stable JWT secrets — sessions survive restarts
- 🗜️ AI responses capped at 2048 tokens, conversation history limited to 20 messages
- ♻️ Service worker cache versioning for instant updates

---

## v0.20.3 (2026-02-08)
Visual polish pass from full QA audit.

- 🎨 4-char fallback logos (AAPL not AAP) with auto-scaling font
- 🔵 Blue pill "+ ADD" buttons on watchlist items
- 📐 Empty states vertically centered (flexbox, 40vh min-height)
- 🌈 20-color donut chart palette (no duplicate oranges)
- 🔽 Sort dropdowns with "Sort ▾" label
- 📸 Updated screenshots (dashboard, positions, watchlist)
- 📖 README: 5 missing API endpoints added, features updated, roadmap cleaned
- 🧹 Zero 404s, zero console errors

---

## v0.20.2 (2026-02-08)
UX polish: sorting, search, empty states, skeletons, and zero 404s.

**New Features:**
- 🔀 **Position Sorting** — Sort by name, value, P&L%, daily change% (dropdown)
- 🔀 **Watchlist Sorting** — Sort by name, price, change%
- ➕ **Quick-Add from Watchlist** — Add to portfolio directly from watchlist items
- 📌 **Remember Last Page** — Returns to your last page after refresh
- 🎨 **Empty States** — Friendly messages with emojis on all empty pages
- 💀 **Loading Skeletons** — Shimmer animations while data loads
- 📝 **Position Notes on Cards** — Notes visible on position cards
- ⏰ **Session Timeout Warning** — Toast 1hr before JWT expiry, auto-logout on 401
- 🖼️ **Smart Logo Caching** — Failed logos cached, never re-requested

**Fixes:**
- 🔧 Zero 404 errors (DeFi tokens skip Yahoo API, logo fallbacks cached)
- 🔧 Confirm dialogs on all delete actions
- 🔧 Portfolio duplicate endpoint added

---

## v0.20.1 (2026-02-08) ← CURRENT
Account management, PWA, UX improvements, and smart broker import.

**New Features:**
- 🔐 **Change Password** — Change password from Settings with current password verification (Argon2id)
- 📧 **Edit Email** — Update email address from Settings with inline editing
- 💾 **Full Database Backup** — Download entire database as a single file from Settings
- 📥 **Database Restore** — Upload and restore from a backup file with validation
- 📱 **PWA Support** — Installable as a native app (manifest, icons, offline caching via service worker)
- 🔍 **Position Search** — Instant search/filter bar on the Positions page
- 🔄 **Auto Theme** — Follows system dark/light preference (new 🔄 button alongside ☀️🌙)
- ⌨️ **Keyboard Shortcuts** — `/` search, `Esc` close modals, `Alt+1-6` navigate pages
- 🏦 **Smart Broker CSV Import** — Auto-detects Keytrade Bank, Interactive Brokers, DeGiro formats
- 🇪🇺 **European CSV Support** — Semicolon separators, comma decimals, location column mapping

**Fixes:**
- 🔧 CI pipeline fixed (Jest forceExit for setInterval/setTimeout timeouts)
- 🔧 Screenshot paths fixed for private repo (relative instead of absolute URLs)
- 🔧 Manual section 16.2 updated to reference Settings password change
- 🔧 About section version corrected to v0.20.0

**Docs:**
- 📖 Manual updated with 20+ screenshots covering all features
- 📖 New sections: Change Password, Edit Email, Backup & Restore, Backup API endpoints
- 📖 README features list compacted from 23 to 11 items

---

## v0.20.0 "Compass" (2026-02-08)
Position source tracking, exchange/location fields, compact number formatting, demo database.

**New Features:**
- 📍 **Position Source Tracking** — Positions now have `source` (manual/wallet) and `location` (exchange/cold storage) fields
- 🏦 **Exchange/Location Field** — Specify where you hold each position (Binance, Kraken, Ledger, Cold Storage, etc.) with autocomplete suggestions
- 🔄 **Smart Wallet Sync** — Wallet sync upgrades manual positions to wallet-tracked when real on-chain data becomes available
- 🔌 **Graceful Wallet Disconnect** — Removing a wallet converts positions back to manual instead of deleting them
- 📐 **Compact Number Formatting** — Large values display as $1.5M, $2.3B instead of breaking mobile layout
- 📊 **Transaction Source/Location** — Transactions also track which exchange/location they occurred on
- 🎁 **Demo Database** — Ships with pre-loaded demo portfolio (demo/DemoPass123!) for instant exploration
- 🪙 **SPL Token Tracking** — Solana SPL tokens (JUP, BONK, WIF, PYTH, RENDER, HNT, JTO + more)
- 🏛️ **DeFi Position Tracking** — Aave aTokens, Compound cTokens, Rocket Pool rETH, Lido stETH

**Fixes:**
- 🔧 Wallet-synced positions no longer overwrite manually added positions
- 🔧 Mobile layout no longer breaks with large portfolio values
- 🔧 Performance chart Y-axis uses compact numbers
- 🔧 Stale wallet data cleaned up properly on wallet address change

---

## v0.19.1 (2026-02-07)
ERC-20 token tracking, self-update system, UI polish.

**New Features:**
- 🪙 **ERC-20 Token Tracking** — Auto-detect tokens in ETH wallets (20 popular tokens via direct RPC)
- 🔗 **Token → Position Sync** — ERC-20 tokens auto-create portfolio positions
- ⬆️ **Self-Update System** — Check for updates, switch channels (main/beta), one-click apply from Settings
- 🔄 **Auto-Update Toggle** — Smooth iOS-style toggle switch

**Fixes:**
- 🔧 **Etherscan v1 deprecated** — Replaced with direct RPC calls (no API key needed)
- 🔧 **CoinGecko rate limit** — Token pricing now via Yahoo Finance
- 🔧 **Delete button stretching** — Token list moved outside swipe container
- 🔧 **Update apply crash** — Frontend handles server restart gracefully

---

## v0.19.0 "Chain" (2026-02-07)
Blockchain wallet tracking, positions redesign, multi-chain support.

**New Features:**
- 🔗 **Blockchain Wallet Tracking** — Connect public addresses, auto-sync balances from chain
- ⛓️ **13 Chains Supported** — BTC, ETH, SOL, BNB, AVAX, MATIC, ARB, OP, LTC, DOGE, XRP, ADA, DOT
- 🔄 **Auto-Sync** — Wallets sync every 5 minutes, positions auto-update from on-chain balances
- 📜 **On-Chain Transactions** — BTC/ETH transaction history fetched from block explorers
- 💼 **Positions Redesign** — Grouped by type (Crypto/Stocks/Options), sorted by value, current price prominent
- 📊 **Portfolio Summary Bar** — Total value, P&L, today's change, cash at a glance
- 🪙 **17 Crypto Tickers** — Full crypto autocomplete support
- 🔗 **Wallet-Synced Positions** — On-chain badge, auto-create/update/delete with wallet changes

**API:**
- `GET /api/wallets` — List connected wallets with USD values
- `POST /api/wallets` — Add wallet (chain, address, label)
- `DELETE /api/wallets/:id` — Remove wallet + cleanup positions
- `POST /api/wallets/:id/sync` — Sync single wallet balance
- `POST /api/wallets/sync-all` — Sync all wallets
- `GET /api/wallets/summary` — Aggregated on-chain value by chain
- `POST /api/wallets/:id/fetch-transactions` — Fetch chain transactions
- `GET /api/wallets/:id/transactions` — List stored chain transactions
- `GET /api/info` — App version and environment info

**Fixes:**
- 🔧 **formatCurrency crash** — Fixed string-to-number coercion in currency formatting
- 🔧 **Watchlist default** — Now selects "Main Watchlist" instead of first alphabetically
- 🔧 **Custom watchlist dropdown** — Dark-themed, replaces broken native select
- 🔧 **Category expand/collapse** — Fixed CSS max-height animation
- 🔧 **Autocomplete click** — Fixed function name collision + blur timing for desktop/mobile
- 🔧 **DB schema alignment** — Auto-migrations for positions, portfolios, watchlist_items, alerts

**Infrastructure:**
- 🏗️ **Beta/Production separation** — Separate directories and branches
- 🔄 **DB auto-migrations** — Schema changes applied automatically on startup

---

## v0.18.2 "Vault" (2026-02-06)
Historical data infrastructure + CI fixes.

**New Features:**
- 📊 **Daily OHLCV Storage** — Stores daily open/high/low/close/volume for all positions + watchlist (12,547 data points across 49 symbols, back to 1984)
- 📸 **Automated Portfolio Snapshots** — Daily value calculation with upsert (replaces manual snapshots)
- 🔧 **Data Collection Script** — Standalone `server/scripts/collect-data.js` with `--prices-only` / `--snapshots-only` flags
- ⏰ **Daily Cron** — Automatic OHLCV + snapshot collection at 10 PM ET Mon-Fri (after market close)

**API:**
- `GET /api/history/:symbol` — Query stored OHLCV data with date range (`from`, `to`, `limit`)
- `GET /api/history/status` — Collection stats (total rows, symbols, date range)
- `POST /api/history/collect` — Trigger OHLCV backfill from Yahoo Finance
- `POST /api/portfolios/:id/snapshot/auto` — Trigger automated snapshot

**Fixes:**
- 🐳 **Docker build fixed** — Was broken since v0.18.1 (missing `db.js`, `routes/`, `scripts/` in Dockerfile)
- 💱 **Performance chart currency** — Chart line now converts to user currency (was showing raw USD)
- ⏱️ **CI Jest timeout** — Added `--forceExit` to prevent `setInterval` handle from hanging CI
- 🔑 **CI Docker test** — Added `load: true` for Buildx so built image is available to `docker run`

**CI Pipeline Optimization:**
- 🚀 **Playwright browser caching** — Saves ~2min Chromium download on subsequent runs
- ⚡ **Parallel E2E** — E2E tests run alongside other jobs instead of waiting
- 🎯 **Smart waits** — Replaced `waitForTimeout()` with `waitForSelector`/`waitForResponse` in E2E tests
- 🧹 **Trimmed E2E** — Removed redundant tests, -113 lines

**Database:**
- New `price_history` table with `UNIQUE(symbol, date)` + composite index
- `*.db.backup*` added to `.gitignore`

---

## v0.18.1 "Forge" (2026-02-06)
Code modularization + multi-currency + push notifications.

**Architecture:**
- 🏗️ **Modularized codebase** — `index.js` from 1,700 → 135 lines, 8 route modules
- 📁 **Route modules** — auth, portfolio, watchlist, alerts, market, transactions, data, push
- 🔧 **Utility services** — Currency exchange rate service (`utils/currency.js`)

**Features:**
- 💱 **Multi-currency** — EUR, USD, GBP, CHF with live exchange rates
- 🔄 **Currency selector** — Settings page, syncs across devices (localStorage + server)
- 🔔 **Push notifications** — VAPID-based web push via service worker
- 📲 **Push settings** — Subscribe/unsubscribe toggle in Settings
- 🔒 **HTTPS detection** — Shows "Requires HTTPS" instead of confusing error on HTTP

**Fixes:**
- 💲 **Currency display** — All 30+ price display points now use `fc()`/`cs()` helpers (was hardcoded `$`)
- 📱 **Push UX** — Graceful degradation on HTTP connections

**API:**
- `GET /api/exchange-rates` — Get currency exchange rates
- `POST /api/push/subscribe` — Subscribe to push notifications
- `POST /api/push/unsubscribe` — Unsubscribe from push
- `POST /api/push/test` — Send test push notification

---

## v0.18.0 "Chain" (2026-02-06)
Options chain viewer + major security hardening.

**Features:**
- ⛓️ **Options chain** — View calls/puts for any stock/ETF
- 📅 **Expiry selector** — Choose from 12 nearest expiration dates
- 💰 **Strike prices** — Filtered to ±15% of current price
- 🟢 **ITM highlighting** — In-the-money options highlighted
- 📱 **Mobile friendly** — Scrollable modal on mobile

**Security Hardening (12 fixes):**
- 🔐 **JWT secret** — Now loaded from `.env` (no more hardcoded fallback)
- 🔑 **Alert API key** — Cryptographically random, loaded from `.env`
- 🌐 **CORS** — Locked to same-origin (was wildcard)
- ✅ **Validators wired** — All routes now use express-validator (were written but unconnected)
- 🛡️ **CSP enabled** — Full Content-Security-Policy with proper directives
- ⚡ **Database writes debounced** — 1s batch instead of write-per-mutation
- 📇 **7 database indexes** — Positions, watchlists, transactions, alerts, snapshots
- 🚫 **Range/interval whitelist** — Chart API params validated against whitelist
- 🗑️ **Dead dependencies removed** — express-mongo-sanitize, uuid, sanitize-html
- 🔢 **Password mismatch fixed** — Frontend now matches server (min 8 chars)
- 🚨 **Global error handler** — Catches unhandled errors with logging
- 📋 **Security event logging** — Failed logins, invalid API keys logged with IP
- 📝 **Settings validation** — Max 10KB, must be JSON object
- 👤 **User enumeration prevented** — Generic error on duplicate registration

**API:**
- `GET /api/options/:symbol` — Get options chain
- `GET /api/options/:symbol/:expiry` — Get options for specific expiry

**Scripts:**
- `scripts/release.sh` — Automated release pipeline

---

## v0.17.5 (2026-02-06)
Logo in app header + CI fix.

**Features:**
- 🎨 Logo displayed in app header
- 🔧 CI: Increased Docker startup time, better error logging

---

## v0.17.4 (2026-02-06)
Added project logo and favicon.

**Features:**
- 🎨 **Logo** — Rising chart with blue→teal gradient
- 🔖 **Favicon** — SVG icon in browser tab
- 📄 **README** — Centered logo header

---

## v0.17.3 (2026-02-06)
Performance chart uses cost basis.

**Fixes:**
- 📊 Performance return now matches P&L (uses cost basis, not first snapshot)
- Start value = what you paid (entry prices × quantities)
- Makes P&L and Performance consistent

---

## v0.17.2 (2026-02-06)
Performance chart and allocation fixes.

**Fixes:**
- 🐛 Performance chart now renders correctly (fixed sort order bug)
- 🐛 Allocation chart uses live option prices from Yahoo (not just entry price)
- 🐛 All option price lookups now consistent across positions, allocation, summary, exports
- 🚫 Added no-cache headers for HTML to prevent stale JS

---

## v0.17.1 (2026-02-06)
Bugfixes for options multiplier and rate limiting.

**Fixes:**
- 🐛 Options now auto-default to 100x multiplier (even if not saved in DB)
- 🐛 Rate limiting relaxed (20/5min, successful logins don't count)
- 🐛 Performance chart creates baseline snapshot if only today exists
- 📝 Added debug logging for reconstruct endpoint

---

## v0.17.0 "Horizon" (2026-02-06)
Portfolio performance chart with historical reconstruction.

**Features:**
- 📈 **Performance chart** — Line chart showing portfolio value over time
- 🔄 **Auto-reconstruction** — Rebuilds history from transactions and positions
- 📊 **Timeframe controls** — 1W, 1M, 3M, 1Y, All views
- 💰 **Summary stats** — Start value, current value, total return
- 📅 **Daily snapshots** — Automatically saved on each visit
- ⏪ **Historical prices** — Fetches past prices from Yahoo Finance

---

## v0.16.0 "Slice" (2026-02-06)
Portfolio allocation donut chart.

**Features:**
- 🥧 **Allocation chart** — Donut chart showing portfolio breakdown
- 📊 **Visual percentages** — See % allocation per position
- 💵 **Cash included** — Cash shown in gray
- 🎨 **Color-coded** — Each position gets unique color
- 📱 **Legend** — Top 8 positions with percentages

---

## v0.15.2 (2026-02-06)
Price alert proximity bars.

**Features:**
- 📊 Progress bars showing how close price is to alert target
- 🟢 Green (80%+), 🟠 Orange (50%+), 🔵 Blue (waiting)

---

## v0.15.1 (2026-02-06)
Bugfixes and CI improvements.

**Fixes:**
- 🐛 CSP was blocking onclick handlers and API calls
- 🐛 Options transactions now show correct 100x multiplier ($5000 not $50)
- 🧪 Added E2E tests to catch CSP issues

---

## v0.15.0 "Ironclad" (2026-02-06)
Security hardening and CI/CD pipeline.

**Security Improvements:**
- 🔐 **Rate limiting** — Auth (10/15min), API (100/min), Write ops (30/min)
- 🛡️ **Input validation** — All endpoints validated with express-validator
- 🧹 **Input sanitization** — XSS and injection prevention
- 🔒 **Password requirements** — 8+ chars, upper/lower/number required
- 📝 **Audit logging** — All security events logged
- 🪖 **Helmet CSP** — Strict Content Security Policy

**Code Quality:**
- 📁 **Modular structure** — Separated middleware, validators, utils
- 🧪 **Unit tests** — Jest with 50%+ coverage requirement
- 🎭 **E2E tests** — Playwright browser automation
- 📋 **ESLint** — Code style and security linting
- 📊 **Winston logging** — Structured file & console logging

**CI/CD Pipeline (GitHub Actions):**
- ✅ Security audit on every push
- ✅ Unit & integration tests
- ✅ Docker build verification
- ✅ E2E browser tests
- ✅ Coverage reporting

---

## v0.14.2 (2026-02-06)
Bugfixes for dashboard loading.

**Fixes:**
- 🐛 Fixed `currentPortfolio is not defined` error breaking dashboard
- 🐛 Fixed double `/api/api/` URL prefix in price/chart/news endpoints
- ✅ Server-side caching now working correctly

---

## v0.14.1 (2026-02-06)
Server-side price caching to eliminate Yahoo rate limits.

**Fixes:**
- 🚀 **Server-side price cache** — Server fetches from Yahoo, caches 2 min
- 📈 **Server-side chart cache** — No more CORS proxy failures
- 🔄 **Smart fallback** — Server API → corsproxy → allorigins
- ⚡ **Faster loads** — Cached responses served instantly

**New API Endpoints:**
```
GET /api/price/:symbol     — Single price (cached)
GET /api/prices?symbols=   — Multiple prices (cached)
GET /api/chart/:symbol     — Chart data (cached)
```

---

## v0.14.0 "Fortress" (2026-02-06)
Security upgrade: Argon2id password hashing.

**New Features:**
- 🔐 **Argon2id hashing** — OWASP-recommended password algorithm
- 🔄 **Hybrid verification** — Supports both argon2 and legacy bcrypt
- ⬆️ **Auto-upgrade** — Bcrypt hashes upgraded to argon2 on login
- 🛡️ **Memory-hard** — Better resistance to GPU/ASIC attacks

**Parameters (OWASP-aligned):**
- Memory: 19 MiB
- Iterations: 2
- Parallelism: 1

Fixes: #1

---

## v0.13.0 "Newswire" (2026-02-06)
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
