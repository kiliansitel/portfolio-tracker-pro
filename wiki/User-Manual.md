# User Manual

Complete guide to using Portfolio Tracker Pro.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Dashboard](#dashboard)
- [Portfolio Management](#portfolio-management)
- [Watchlists](#watchlists)
- [Charts](#charts)
- [Oracle AI Assistant](#oracle-ai-assistant)
- [Transactions](#transactions)
- [Alerts](#alerts)
- [Wallet Sync](#wallet-sync)
- [Dividend Tracking](#dividend-tracking)
- [News](#news)
- [Settings](#settings)
- [Data Export](#data-export)
- [PWA Installation](#pwa-installation)
- [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Getting Started

### Creating an Account

1. Open the app at your instance URL (e.g., `http://localhost:8080`)
2. Click **Register** and enter a username, email, and password
3. Password requirements: 8+ characters, upper/lower case, at least one number

### Demo Account

A pre-loaded demo account is available:
- **Username:** `demo`
- **Password:** `DemoPass123!`

### Login

Enter your username (or email) and password. Sessions last 30 days. The app uses httpOnly cookies for secure authentication.

---

## Dashboard

The dashboard is your home screen showing:

- **Portfolio Summary** — Total value, daily P&L, total P&L
- **Market Cards** — Key indices (S&P 500, NASDAQ, Dow Jones) with live prices. When the cash market is closed, index futures (ES=F, NQ=F, YM=F) are shown instead
- **Allocation Chart** — Tabbed donut charts showing:
  - **Allocation** — Portfolio breakdown by position
  - **Sectors** — Sector exposure (Tech, Healthcare, etc.)
  - **Regions** — Geographic exposure by country
- **Performance Chart** — Line chart of portfolio value over time (1W, 1M, 3M, 1Y, All)

---

## Portfolio Management

### Adding Positions

1. Navigate to the **Positions** page
2. Tap the **+** button
3. Enter: symbol (autocomplete searches all global markets), quantity, entry price
4. Optional fields: type (stock/crypto/option/cash), entry date, notes, location/exchange, currency
5. Tap **Save**

If a position already exists for that symbol, the app calculates a new average cost basis.

### Position Types

| Type | Features |
|------|----------|
| **Stock** | Standard equity tracking |
| **Crypto** | Auto-normalizes symbols (BTC → BTC-USD) |
| **Option** | Supports strike price, expiry date, multiplier (default 100x) |
| **Cash** | Cash position tracking |

### Multi-Currency Support

Positions store the original purchase currency (USD, EUR, GBP, CHF). The dashboard aggregates all positions in your selected app currency using live exchange rates. Entry prices display in their original currency.

### Editing & Deleting

- **Swipe left** on a position to reveal Edit/Delete buttons
- Or tap a position to open the detail view

### Sorting

Use the sort dropdown (top-right) to sort by:
- Name (A-Z)
- Value (high to low)
- P&L % (high to low)
- Daily change %

### Searching

Use the search bar at the top to filter positions by symbol or name. Shortcut: press `/`.

### CSV Import

Go to **Settings → Import Data** and upload a CSV file. Supported formats (auto-detected):

| Broker | Notes |
|--------|-------|
| Interactive Brokers | Trades, dividends, positions |
| Keytrade Bank | Transaction export |
| CoinMarketCap | Portfolio CSV export |
| Generic CSV | Manual column mapping |

### Portfolio Duplication

From the portfolio dropdown, select **Duplicate** to create a copy of your current portfolio with all positions.

---

## Watchlists

### Creating Watchlists

1. Navigate to the **Watchlist** page
2. Tap **+ New Watchlist** to create a list
3. Add items with the **+** button

### Watchlist Items

Each item can have:
- **Symbol** — Auto-complete from all global markets
- **Category** — Group items (e.g., "Tech", "Crypto")
- **Price targets** — Alert above/below prices
- **Notes**

### Quick-Add to Portfolio

Each watchlist item has a **+ ADD** button to quickly add it as a portfolio position.

### Sorting

Sort watchlist by name, price, or daily change %.

---

## Charts

### Mini Charts (Position Cards)

Every position and watchlist item shows a mini chart with the current price trend.

### Detail Charts

Tap any symbol to open the full-screen chart modal:

#### Chart Types
- **Candlestick** (default) — OHLC candles
- **Area** — Filled line chart

Toggle between them with the candle/area button.

#### Timeframes

| Timeframe | Interval | Notes |
|-----------|----------|-------|
| **1D** | 5-minute candles | Intraday |
| **5D** | 15-minute candles | Weekly view |
| **1M** | Hourly candles | ~155 bars |
| **3M** | Hourly candles | ~430 bars |
| **1Y** | Daily candles | ~251 bars |
| **All** | Monthly candles | Logarithmic scale, full history |

#### Indicators

- **RSI (14)** — Always shown below the chart
- **MA100** — 100-period moving average (toggle on/off)
- **MA200** — 200-period moving average (toggle on/off)

#### Features

- Auto-fitting — Charts always fit content, no manual zoom needed
- Dynamic bar spacing — Adapts to dataset size
- Smart barSpacing cap on desktop — Prevents oversized candles

### Live Pricing (SSE)

Real-time price streaming via Server-Sent Events:
- **Crypto** — Updates every 3 seconds
- **Stocks** — Updates every 8 seconds
- Micro-tick animation between real updates
- Green/red flash on price changes
- Pulsing green "live" indicator dot

### After-Hours / Pre-Market

- **PM** (blue badge) — Pre-market prices
- **AH** (purple badge) — After-hours prices
- Displayed on position cards, watchlist items, and dashboard
- Orange dashed line on charts shows extended hours price

---

## Oracle AI Assistant

Oracle is a built-in AI assistant that understands your portfolio.

### Accessing Oracle

Navigate to the **Oracle** page (🧠 icon in the navigation).

### Chat

Type a question or use voice input (🎤 button). Oracle supports streaming responses with markdown rendering.

### Context Injection

Toggle what data Oracle can see:
- **Portfolio** — Your positions, P&L, cost basis
- **Watchlist** — Your watched symbols and targets
- **Market** — Current market data and indices

### Quick Analysis Actions

| Button | Action |
|--------|--------|
| 📊 **Portfolio Review** | Full portfolio analysis |
| 📡 **Watchlist Signals** | Analysis of watchlist items |
| 🔍 **Position Deep Dive** | Detailed analysis of a specific position |
| 🎯 **Strategy Advisor** | Personalized trading strategies, options plays, DCA plans |
| 🛡️ **Risk & Correlation** | Portfolio risk assessment, concentration, beta, tail risk |

### AI Actions

Oracle can suggest actions inline in its responses:
- **Set price alert** — One-click alert creation
- **Add to watchlist** — Add a suggested symbol
- **Add position** — Add a suggested position with quantity and price

### Onboarding

Tell Oracle you're new or ask it to help build your first portfolio. It will guide you through a conversational onboarding:
1. Investment goals and risk tolerance
2. Time horizon and capital
3. Sector preferences
4. Complete portfolio suggestion with one-click add buttons

### Conversation Management

- Conversations auto-save
- Load previous conversations from the history
- Delete old conversations

### Voice Input

Click the 🎤 microphone button to speak your question. Uses Web Speech API. A pulsing red animation shows while listening.

### Export AI Insights

- **Per-message** — Click the 📄 button on any message
- **Full conversation** — Click the export button in the header
- Exports as clean, print-friendly PDF with branding

### Scheduled Reports

Configure in **Settings → Auto-Reports**:
- **Daily summary** — Morning portfolio digest
- **Weekly digest** — Weekly performance review
- Set time and timezone
- Reports save as Oracle conversations with 📊 badges

### Supported AI Providers

| Provider | Key Required | Notes |
|----------|:------------:|-------|
| OpenAI | ✅ | GPT-4, GPT-3.5 |
| Anthropic | ✅ | Claude Opus, Sonnet, Haiku |
| Google | ✅ | Gemini models |
| Ollama | ❌ | Local models, auto-detects available models, custom ports, configurable `num_ctx` |
| OpenRouter | ✅ | Access to many models |
| Custom | ✅ | Any OpenAI-compatible endpoint |

Configure providers in **Settings → AI Provider**.

---

## Transactions

### Viewing Transactions

Navigate to the **Transactions** page to see all buy/sell history.

### Adding Transactions

Transactions are created automatically when adding positions, or manually:
1. Go to a portfolio's transaction view
2. Click **+** to add a transaction
3. Enter: symbol, type (buy/sell), quantity, price, fees, date, notes, location

### Swipe to Delete

Swipe left on a transaction to reveal the delete button.

---

## Alerts

### Creating Alerts

1. Navigate to the **Alerts** page
2. Tap **+** to create an alert
3. Set: symbol, condition (above/below), target price

### Alert Notifications

- **Push notifications** — Via web push (requires HTTPS + VAPID keys)
- Alerts are checked hourly during market hours
- Triggered alerts auto-deactivate

### Alert Progress

Each alert shows a proximity bar:
- 🟢 Green (80%+) — Close to target
- 🟠 Orange (50%+) — Moderate progress
- 🔵 Blue — Waiting

---

## Wallet Sync

### Connecting a Wallet

1. Go to **Settings → Wallets** or the wallet section
2. Click **+ Add Wallet**
3. Select chain, enter public address, optional label
4. Wallet syncs automatically on add

### Supported Chains (13)

BTC, ETH, SOL, BNB, AVAX, MATIC, ARB, OP, LTC, DOGE, XRP, ADA, DOT

### Token Detection

- **ERC-20 tokens** — Auto-detected on ETH/EVM chains (20+ popular tokens via RPC)
- **SPL tokens** — Auto-detected on Solana (JUP, BONK, WIF, PYTH, RENDER, HNT, JTO, etc.)
- **DeFi positions** — Aave aTokens, Compound cTokens, Rocket Pool rETH, Lido stETH

### Sync Behavior

- Wallets auto-sync every 5 minutes
- On-chain positions show a wallet badge
- Removing a wallet converts positions back to manual (not deleted)
- Chain-specific address validation prevents invalid addresses

---

## Dividend Tracking

- **Yield badges** on position cards showing dividend yield
- **Annual income estimate** based on current positions
- **Monthly bar chart** showing projected dividend income
- **Upcoming ex-dates** with status indicators
- Data sourced from Yahoo Finance quote API

---

## News

- **Market news** from Google News RSS
- **Search** by topic (earnings, AI, crypto)
- **Portfolio news** filtered for your holdings
- Source icons for Bloomberg, CNBC, WSJ, etc.

---

## Settings

### Account

- **Change password** with current password verification
- **Edit email** with inline editing
- **Session management** — 30-day JWT sessions with timeout warnings

### Display

- **Theme** — Dark 🌙, Light ☀️, or Auto 🔄 (follows system)
- **Currency** — USD, EUR, GBP, CHF

### AI Provider

Configure your AI provider and API key. See [Oracle AI section](#oracle-ai-assistant).

### Auto-Reports

Configure daily/weekly scheduled AI portfolio reports.

### Push Notifications

Subscribe to push notifications (requires HTTPS + VAPID keys configured on server).

### Backup & Restore

- **Download backup** — Full database export as `.db` file
- **Restore** — Upload a backup file to replace current data

### Import Data

Upload CSV files for bulk import.

---

## Data Export

### CSV Export

Export positions and watchlist data as CSV files from **Settings → Export Data**.

### PDF Report

Generate a full portfolio summary PDF (opens print dialog).

### AI Conversation PDF

Export individual AI messages or full conversations as PDF.

---

## PWA Installation

Portfolio Tracker Pro is a Progressive Web App:

### iOS
1. Open in Safari
2. Tap Share → Add to Home Screen

### Android
1. Open in Chrome
2. Tap the install banner or Menu → Install App

### Desktop
1. Open in Chrome/Edge
2. Click the install icon in the address bar

The PWA supports offline mode via service worker with network-first HTML caching.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus search bar |
| `Esc` | Close modals |
| `Alt+1` | Dashboard |
| `Alt+2` | Positions |
| `Alt+3` | Watchlist |
| `Alt+4` | Oracle AI |
| `Alt+5` | Transactions |
| `Alt+6` | Settings |
