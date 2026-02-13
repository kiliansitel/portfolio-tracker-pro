# API Reference

All endpoints are served under `/api`. Unless noted, endpoints require JWT authentication via httpOnly cookie (`auth_token`) or `Authorization: Bearer <token>` header.

---

## Table of Contents

- [Authentication](#authentication)
- [Portfolios](#portfolios)
- [Positions](#positions)
- [Watchlists](#watchlists)
- [Transactions](#transactions)
- [Alerts](#alerts)
- [Market Data](#market-data)
- [Charts & History](#charts--history)
- [Wallets](#wallets)
- [AI / Oracle](#ai--oracle)
- [Reports](#reports)
- [Push Notifications](#push-notifications)
- [Backup & Restore](#backup--restore)
- [Performance & Snapshots](#performance--snapshots)
- [Exchange Rates](#exchange-rates)
- [Updates](#updates)
- [App Info](#app-info)

---

## Authentication

### Register

```
POST /api/auth/register
```

**Auth:** None (rate limited)

| Field | Type | Required | Notes |
|-------|------|:--------:|-------|
| `username` | string | ✅ | Unique |
| `email` | string | ✅ | Unique, lowercased |
| `password` | string | ✅ | 8+ chars, upper/lower/number |

**Response:** `200`
```json
{
  "message": "Registration successful",
  "token": "eyJhbG...",
  "user": { "id": 1, "username": "john", "email": "john@example.com" }
}
```

Also sets `auth_token` httpOnly cookie (30 days).

---

### Login

```
POST /api/auth/login
```

**Auth:** None (rate limited)

| Field | Type | Required | Notes |
|-------|------|:--------:|-------|
| `login` | string | ✅ | Username or email |
| `password` | string | ✅ | |

**Response:** `200`
```json
{
  "token": "eyJhbG...",
  "user": { "id": 1, "username": "john", "email": "john@example.com", "settings": {} }
}
```

---

### Get Current User

```
GET /api/auth/me
```

**Response:** `200`
```json
{
  "id": 1,
  "username": "john",
  "email": "john@example.com",
  "settings": {},
  "created_at": "2026-02-05T12:00:00.000Z"
}
```

---

### Update Settings

```
PUT /api/auth/settings
```

| Field | Type | Required | Notes |
|-------|------|:--------:|-------|
| `settings` | object | ❌ | JSON object, max 10KB |
| `currency` | string | ❌ | `USD`, `EUR`, `GBP`, `CHF` |

---

### Change Password

```
PUT /api/auth/password
```

| Field | Type | Required |
|-------|------|:--------:|
| `currentPassword` | string | ✅ |
| `newPassword` | string | ✅ |

---

### Update Email

```
PUT /api/auth/email
```

| Field | Type | Required |
|-------|------|:--------:|
| `email` | string | ✅ |

---

## Portfolios

### List Portfolios

```
GET /api/portfolios
```

**Response:** Array of portfolio objects sorted by name.

---

### Create Portfolio

```
POST /api/portfolios
```

| Field | Type | Required |
|-------|------|:--------:|
| `name` | string | ✅ |
| `cash` | number | ❌ |

---

### Update Portfolio

```
PUT /api/portfolios/:id
```

| Field | Type | Required |
|-------|------|:--------:|
| `name` | string | ❌ |
| `cash` | number | ❌ |

---

### Duplicate Portfolio

```
POST /api/portfolios/:id/duplicate
```

Creates a copy of the portfolio with all positions. Returns the new portfolio.

---

### Delete Portfolio

```
DELETE /api/portfolios/:id
```

Deletes the portfolio and all its positions.

---

## Positions

### List Positions

```
GET /api/portfolios/:id/positions
```

**Response:** Array of position objects sorted by symbol.

---

### Add Position

```
POST /api/portfolios/:id/positions
```

| Field | Type | Required | Notes |
|-------|------|:--------:|-------|
| `symbol` | string | ✅ | Auto-uppercased |
| `quantity` | number | ✅ | |
| `entry_price` | number | ✅ | Or `avg_cost` |
| `type` | string | ❌ | `stock`, `crypto`, `option`, `cash` |
| `currency` | string | ❌ | Default `USD` |
| `location` | string | ❌ | Exchange/wallet name |
| `entry_date` | string | ❌ | ISO date |
| `notes` | string | ❌ | |
| `strike_price` | number | ❌ | Options only |
| `expiry_date` | string | ❌ | Options only |
| `multiplier` | number | ❌ | Default 1 (100 for options) |

If a position for the same symbol already exists, the quantity and average cost are merged.

---

### Update Position

```
PUT /api/portfolios/positions/:id
```

Same fields as Add Position (all optional for update).

---

### Delete Position

```
DELETE /api/portfolios/positions/:id
```

---

## Watchlists

### List Watchlists (with items)

```
GET /api/watchlists
```

Returns all watchlists with nested `items` arrays.

---

### Create Watchlist

```
POST /api/watchlists
```

| Field | Type | Required |
|-------|------|:--------:|
| `name` | string | ✅ |

---

### Add Watchlist Item

```
POST /api/watchlists/:id/items
```

| Field | Type | Required | Notes |
|-------|------|:--------:|-------|
| `symbol` | string | ✅ | Auto-uppercased, must be unique in list |
| `category` | string | ❌ | Default `general` |
| `name` | string | ❌ | Display name |
| `notes` | string | ❌ | |
| `alert_below` | number | ❌ | Price target (low) |
| `alert_above` | number | ❌ | Price target (high) |

---

### Update Watchlist Item

```
PUT /api/watchlists/items/:id
```

Same fields as Add (all optional for update).

---

### Delete Watchlist Item

```
DELETE /api/watchlists/items/:id
```

---

### Delete Watchlist

```
DELETE /api/watchlists/:id
```

Deletes the watchlist and all its items.

---

## Transactions

### List All Transactions

```
GET /api/transactions
```

| Query Param | Type | Notes |
|-------------|------|-------|
| `limit` | number | Max results |
| `symbol` | string | Filter by symbol |

---

### List Portfolio Transactions

```
GET /api/portfolios/:id/transactions
```

| Query Param | Type | Notes |
|-------------|------|-------|
| `limit` | number | Max results |
| `offset` | number | Pagination offset |

**Response:**
```json
{
  "transactions": [...],
  "total": 42
}
```

---

### Add Transaction

```
POST /api/portfolios/:id/transactions
```

| Field | Type | Required | Notes |
|-------|------|:--------:|-------|
| `symbol` | string | ✅ | Auto-uppercased |
| `type` | string | ❌ | `stock`, `crypto`, `option` |
| `action` | string | ❌ | `buy` or `sell` (default `buy`) |
| `quantity` | number | ✅ | |
| `price` | number | ✅ | |
| `fees` | number | ❌ | Default 0 |
| `notes` | string | ❌ | |
| `executed_at` | string | ❌ | ISO date (default today) |
| `location` | string | ❌ | Exchange/broker |

---

### Delete Transaction

```
DELETE /api/transactions/:id
```

---

## Alerts

### List Alerts

```
GET /api/alerts
```

Returns all alerts for the authenticated user, ordered by creation date.

---

### Create Alert

```
POST /api/alerts
```

| Field | Type | Required | Notes |
|-------|------|:--------:|-------|
| `symbol` | string | ✅ | |
| `condition` | string | ✅ | `above` or `below` |
| `target_price` | number | ✅ | Or `value` |

---

### Delete Alert

```
DELETE /api/alerts/:id
```

---

### Check Alerts (Internal/Cron)

```
GET /api/alerts/check
```

**Auth:** API key via `X-Api-Key` header (not JWT)

Checks all active alerts against current prices. Triggered alerts are deactivated and push notifications sent.

**Response:**
```json
{
  "triggered": [
    { "id": 1, "symbol": "AAPL", "condition": "above", "value": 200, "current_price": 201.5 }
  ],
  "checked": 15
}
```

---

## Market Data

All market data endpoints are **public** (no auth required).

### Get Price

```
GET /api/price/:symbol
```

Returns cached price data (5-minute TTL).

---

### Get Multiple Prices

```
GET /api/prices?symbols=AAPL,MSFT,GOOGL
```

---

### Get Chart Data

```
GET /api/chart/:symbol
```

| Query Param | Type | Notes |
|-------------|------|-------|
| `range` | string | `1d`, `5d`, `1mo`, `3mo`, `6mo`, `1y`, `2y`, `5y`, `10y`, `max`, `ytd` |
| `interval` | string | `1m`, `2m`, `5m`, `15m`, `30m`, `60m`, `1h`, `1d`, `5d`, `1wk`, `1mo` |

---

### Live Price Stream (SSE)

```
GET /api/prices/stream?symbols=AAPL,BTC-USD
```

Server-Sent Events stream. Crypto updates every 3s, stocks every 8s.

---

### Search Tickers

```
GET /api/tickers/search?q=apple
```

Searches local popular tickers first, falls back to Yahoo Finance search API for global markets.

---

### Popular Tickers

```
GET /api/tickers/popular
```

Returns the built-in list of popular tickers (US stocks, ETFs, crypto).

---

### Options Chain

```
GET /api/options/:symbol
```

Returns options chain with expiration dates, strikes, calls, and puts.

---

### Options for Specific Expiry

```
GET /api/options/:symbol/:expiry
```

`expiry` is a Unix timestamp.

---

### News

```
GET /api/news
```

| Query Param | Type | Notes |
|-------------|------|-------|
| `symbol` | string | Stock-specific news |
| `query` | string | Custom search query |

---

## Charts & History

### Get Stored OHLCV Data

```
GET /api/history/:symbol
```

| Query Param | Type | Notes |
|-------------|------|-------|
| `from` | string | Start date (YYYY-MM-DD) |
| `to` | string | End date |
| `limit` | number | Max rows (default 365, max 5000) |

---

### History Collection Status

```
GET /api/history/status
```

**Response:**
```json
{
  "total_rows": 12547,
  "symbols_tracked": 49,
  "earliest_date": "1984-09-07",
  "latest_date": "2026-02-13",
  "last_collection": "2026-02-13T03:00:00.000Z"
}
```

---

### Trigger OHLCV Collection

```
POST /api/history/collect
```

Collects historical OHLCV data for all positions and watchlist symbols from Yahoo Finance.

---

## Wallets

### List Wallets

```
GET /api/wallets
```

---

### Add Wallet

```
POST /api/wallets
```

| Field | Type | Required | Notes |
|-------|------|:--------:|-------|
| `chain` | string | ✅ | `btc`, `eth`, `sol`, `bnb`, `avax`, `matic`, `arb`, `op`, `ltc`, `doge`, `xrp`, `ada`, `dot` |
| `address` | string | ✅ | Public address (chain-validated) |
| `label` | string | ❌ | Display label |

Auto-syncs balance on add. Creates/updates portfolio positions.

---

### Delete Wallet

```
DELETE /api/wallets/:id
```

Removes wallet and converts its positions back to manual.

---

### Sync Single Wallet

```
POST /api/wallets/:id/sync
```

---

### Sync All Wallets

```
POST /api/wallets/sync-all
```

---

### Wallet Summary

```
GET /api/wallets/summary
```

Returns aggregated on-chain value by chain.

---

### Fetch Wallet Transactions

```
POST /api/wallets/:id/fetch-transactions
```

Fetches on-chain transactions from block explorers (BTC/ETH).

---

### List Wallet Transactions

```
GET /api/wallets/:id/transactions
```

---

## AI / Oracle

### Get AI Provider Settings

```
GET /api/ai/providers
```

Returns available providers and user's configured keys.

---

### Save AI Provider

```
POST /api/ai/providers
```

| Field | Type | Required | Notes |
|-------|------|:--------:|-------|
| `provider` | string | ✅ | `openai`, `anthropic`, `google`, `ollama`, `openrouter`, `custom` |
| `apiKey` | string | ❌ | Encrypted and stored |
| `model` | string | ❌ | Model preference |
| `baseUrl` | string | ❌ | Custom endpoint URL |
| `contextLength` | number | ❌ | Ollama `num_ctx` |

---

### Delete AI Provider

```
DELETE /api/ai/providers/:provider
```

---

### Chat

```
POST /api/ai/chat
```

**Rate limit:** 10 requests/minute

| Field | Type | Required | Notes |
|-------|------|:--------:|-------|
| `message` | string | ✅ | Max 5,000 characters |
| `provider` | string | ❌ | Override default provider |
| `context` | string | ❌ | `portfolio`, `watchlist`, `market` (comma-separated) |
| `conversationId` | number | ❌ | Continue existing conversation |
| `history` | array | ❌ | Previous messages (max 20) |

**Response:** SSE stream with `data:` events containing markdown chunks. Final event includes `[DONE]`.

---

### Quick Analysis

```
POST /api/ai/analyze
```

**Rate limit:** 5 requests/minute

| Field | Type | Required | Notes |
|-------|------|:--------:|-------|
| `type` | string | ✅ | `portfolio`, `watchlist`, `news`, `rebalance`, `strategy`, `risk`, `position:SYMBOL` |
| `provider` | string | ❌ | |

---

### List Conversations

```
GET /api/ai/conversations
```

---

### Get Conversation

```
GET /api/ai/conversations/:id
```

---

### Save Conversation

```
POST /api/ai/conversations
```

| Field | Type | Required |
|-------|------|:--------:|
| `title` | string | ✅ |
| `messages` | array | ✅ |
| `context` | string | ❌ |

---

### Delete Conversation

```
DELETE /api/ai/conversations/:id
```

---

### Fetch Ollama Models

```
GET /api/ai/ollama-models?baseUrl=http://localhost:11434
```

Returns available models from an Ollama server.

---

## Reports

### Get Report Settings

```
GET /api/ai/reports/settings
```

---

### Update Report Settings

```
PUT /api/ai/reports/settings
```

| Field | Type | Notes |
|-------|------|-------|
| `daily` | object | `{ enabled, time, timezone }` |
| `weekly` | object | `{ enabled, day, time, timezone }` |

---

### List Generated Reports

```
GET /api/ai/reports
```

| Query Param | Type |
|-------------|------|
| `limit` | number |
| `offset` | number |

---

### Generate Report Manually

```
POST /api/ai/reports/generate
```

| Field | Type | Notes |
|-------|------|-------|
| `type` | string | `daily` or `weekly` |

---

## Push Notifications

### Get VAPID Public Key

```
GET /api/push/vapid-public-key
```

**Auth:** None

---

### Subscribe

```
POST /api/push/subscribe
```

| Field | Type | Required |
|-------|------|:--------:|
| `subscription` | object | ✅ |

The `subscription` object must contain `endpoint` and `keys` (`p256dh`, `auth`) from the browser's Push API.

---

### Unsubscribe

```
POST /api/push/unsubscribe
```

| Field | Type | Required |
|-------|------|:--------:|
| `endpoint` | string | ✅ |

---

### Send Test Notification

```
POST /api/push/test
```

---

## Backup & Restore

### Download Backup

```
GET /api/backup
```

Returns the full SQLite database as a binary `.db` file.

---

### Restore Backup

```
POST /api/backup/restore
```

**Content-Type:** `application/octet-stream`

Upload a `.db` file (max 100MB) to replace the current database.

---

## Performance & Snapshots

### Record Snapshot

```
POST /api/portfolios/:id/snapshot
```

| Field | Type | Required |
|-------|------|:--------:|
| `total_value` | number | ✅ |
| `cash` | number | ✅ |
| `positions_value` | number | ✅ |

Upserts (updates if today's snapshot exists). Rejects if `positions_value` is 0 when positions exist.

---

### Get Performance History

```
GET /api/portfolios/:id/performance
```

| Query Param | Type | Notes |
|-------------|------|-------|
| `days` | number | Limit to last N days |

**Response:**
```json
{
  "snapshots": [...],
  "summary": {
    "total_return": 1500.50,
    "total_return_pct": 12.5,
    "start_value": 12000,
    "current_value": 13500.50,
    "days": 30
  }
}
```

---

### Reconstruct History

```
POST /api/portfolios/:id/reconstruct
```

Rebuilds historical portfolio snapshots from transactions and position data using historical prices from Yahoo Finance.

---

## Exchange Rates

### Get Exchange Rates

```
GET /api/exchange-rates
```

**Auth:** None

**Response:**
```json
{
  "rates": { "EUR": 0.92, "GBP": 0.79, "CHF": 0.88 },
  "supported_currencies": ["USD", "EUR", "GBP", "CHF"],
  "last_updated": "2026-02-13T12:00:00.000Z"
}
```

---

## Updates

### Check for Updates

```
GET /api/updates/check
```

Returns current version, latest available version, and whether an update is available. Detects Docker environment and shows `docker pull` instructions.

---

### Get Update Settings

```
GET /api/updates/settings
```

---

### Save Update Settings

```
PUT /api/updates/settings
```

| Field | Type |
|-------|------|
| `autoUpdate` | boolean |
| `channel` | string |
| `checkInterval` | number |

---

### Apply Update

```
POST /api/updates/apply
```

Pulls latest code via git and restarts the server (non-Docker only).

---

## App Info

### Get App Info

```
GET /api/info
```

**Auth:** None

**Response:**
```json
{
  "version": "0.28.1",
  "env": "production",
  "name": "Portfolio Pro"
}
```
