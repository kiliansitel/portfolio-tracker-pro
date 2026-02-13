# Development Guide

Guide for contributors and developers working on Portfolio Tracker Pro.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Running Locally](#running-locally)
- [Testing](#testing)
- [Docker Build](#docker-build)
- [CI/CD Pipeline](#cicd-pipeline)
- [Contributing](#contributing)
- [Coding Conventions](#coding-conventions)

---

## Architecture Overview

Portfolio Tracker Pro is a **monolithic full-stack application**:

```
┌─────────────────────────────────────────┐
│              Browser (SPA)              │
│  Vanilla JS modules + LightweightCharts │
├─────────────────────────────────────────┤
│           Express.js Server             │
│  REST API + SSE + Static File Serving   │
├─────────────────────────────────────────┤
│          SQLite (sql.js)                │
│     In-memory DB with file persistence  │
├─────────────────────────────────────────┤
│         External APIs                   │
│  Yahoo Finance · CoinGecko · AI APIs    │
└─────────────────────────────────────────┘
```

Key architectural decisions:
- **No build step** — Frontend is vanilla JS served as static files
- **sql.js** — SQLite compiled to WebAssembly, runs in-memory with periodic file persistence
- **SSE** — Server-Sent Events for real-time price streaming (no WebSocket complexity)
- **Modular routes** — 14 Express route modules in `server/routes/`

---

## Project Structure

```
portfolio-tracker-pro/
├── public/                    # Frontend (served as static files)
│   ├── index.html            # SPA shell (~1,100 lines)
│   ├── css/
│   │   └── styles.css        # All styles (2,100+ lines)
│   ├── js/
│   │   ├── app.js            # Main app initialization
│   │   ├── auth.js           # Authentication module
│   │   ├── portfolio.js      # Portfolio management
│   │   ├── watchlist.js      # Watchlist module
│   │   ├── oracle.js         # AI chat interface
│   │   ├── charts.js         # Chart rendering
│   │   ├── markets.js        # Market data display
│   │   ├── transactions.js   # Transaction history
│   │   ├── alerts.js         # Price alerts
│   │   ├── settings.js       # Settings page
│   │   ├── utils.js          # Shared utilities
│   │   └── news.js           # News feed
│   │   └── vendor/           # Third-party libraries
│   │       ├── lightweight-charts.js
│   │       └── purify.min.js  # DOMPurify
│   ├── manifest.json         # PWA manifest
│   └── logo.svg              # App logo
├── server/
│   ├── index.js              # Express app entry (~135 lines)
│   ├── db.js                 # sql.js database init & helpers
│   ├── package.json          # Dependencies & scripts
│   ├── routes/               # API route modules
│   │   ├── auth.js           # Authentication (register, login, settings)
│   │   ├── portfolio.js      # Portfolios & positions CRUD
│   │   ├── watchlist.js      # Watchlists CRUD
│   │   ├── alerts.js         # Price alerts
│   │   ├── market.js         # Market data, charts, options, tickers
│   │   ├── transactions.js   # Transaction history
│   │   ├── data.js           # Snapshots & performance
│   │   ├── history.js        # OHLCV price history
│   │   ├── wallets.js        # Blockchain wallet sync
│   │   ├── ai.js             # Oracle AI chat & analysis
│   │   ├── reports.js        # Scheduled AI reports
│   │   ├── push.js           # Web push notifications
│   │   ├── backup.js         # Database backup/restore
│   │   └── updates.js        # Self-update system
│   ├── middleware/
│   │   └── security.js       # Helmet, CORS, rate limiting, sanitization
│   ├── validators/
│   │   ├── auth.js           # Auth input validators
│   │   └── portfolio.js      # Portfolio/position validators
│   ├── utils/
│   │   ├── ai-providers.js   # AI provider abstraction
│   │   ├── yahoo.js          # Yahoo Finance API client
│   │   ├── currency.js       # Exchange rate service
│   │   ├── logger.js         # Winston logging
│   │   ├── snapshots.js      # Daily snapshot collection
│   │   ├── report-scheduler.js # Cron-based report generation
│   │   └── watchlist-sync.js # Auto-add to watchlist
│   ├── scripts/
│   │   └── collect-data.js   # Standalone OHLCV collection
│   └── test/                 # Jest test files
├── Dockerfile                # Multi-stage Docker build
├── docker-compose.yml        # Docker Compose config
├── .github/workflows/
│   └── ci.yml                # GitHub Actions CI/CD
├── VERSIONS.md               # Changelog
└── README.md                 # Project documentation
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Vanilla JS (12 modules) | No framework, no build step |
| **Charts** | [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/) | Candlestick/area charts |
| **XSS Protection** | DOMPurify | Sanitize AI-generated HTML |
| **Backend** | Node.js + Express | REST API server |
| **Security** | Helmet, HPP, express-validator | HTTP headers, parameter pollution, input validation |
| **Database** | sql.js (SQLite in WASM) | In-memory with file persistence |
| **Auth** | JWT + Argon2id | Token auth with modern password hashing |
| **AI** | Multi-provider abstraction | OpenAI, Anthropic, Google, Ollama, OpenRouter |
| **Real-time** | Server-Sent Events (SSE) | Live price streaming |
| **Scheduling** | node-cron | Daily snapshots, report generation |
| **Push** | web-push (VAPID) | Browser push notifications |
| **Logging** | Winston | Structured file & console logging |
| **Testing** | Jest + Supertest | Unit & integration tests |
| **E2E** | Playwright | Browser automation tests |
| **CI/CD** | GitHub Actions | Automated testing + Docker builds |
| **Container** | Docker (multi-arch) | amd64 + arm64 images |

---

## Running Locally

### Prerequisites

- Node.js 20+ (uses native `fetch`)
- npm

### Setup

```bash
git clone https://github.com/kiliansitel/portfolio-tracker-pro.git
cd portfolio-tracker-pro/server
npm install
```

### Start

```bash
npm start
```

The app starts on **http://localhost:8080**.

### Development Mode (auto-restart)

```bash
npm run dev
```

Uses `node --watch` for automatic restarts on file changes.

### Environment File

Create `server/.env` for local configuration:

```env
JWT_SECRET=dev-secret-change-in-production
PORT=8080
NODE_ENV=development
```

---

## Testing

### Unit & Integration Tests

```bash
cd server
npm test
```

Runs Jest with coverage reporting. Tests use Supertest to test Express routes directly.

Coverage requirement: 50%+.

```bash
# Watch mode
npm run test:watch
```

### E2E Tests

```bash
cd server
npm run test:e2e
```

Runs Playwright browser tests. Requires the app to be running.

### Linting

```bash
npm run lint
```

ESLint for code style and security rules.

### Security Audit

```bash
npm run audit
```

---

## Docker Build

### Build Locally

```bash
docker build -t portfolio-tracker-pro .
```

### Multi-Arch Build

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t kiliansitel/portfolio-tracker-pro:latest --push .
```

### Dockerfile Overview

Multi-stage build:
1. **Builder stage** — `node:20-alpine`, installs dependencies (including native `argon2`)
2. **Production stage** — `node:20-alpine`, copies `node_modules`, `server/`, `public/`
3. Non-root user (`portfolio:nodejs`)
4. Health check on `/api/tickers/popular`

---

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`):

1. **Security audit** — `npm audit`
2. **Unit tests** — Jest with coverage
3. **Docker build** — Verify image builds
4. **E2E tests** — Playwright browser tests
5. **Docker push** — Multi-arch push to Docker Hub (on tagged releases)

Triggers: push to `main`/`beta`, pull requests, tags.

---

## Contributing

### Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes and write tests
4. Run `npm test` and ensure all pass
5. Commit with descriptive messages
6. Open a Pull Request

### Commit Messages

Use conventional format:
```
feat: add dividend tracking calendar
fix: resolve SSE connection leak on client disconnect
docs: update API reference for wallet endpoints
refactor: extract price cache into utility module
```

### Pull Request Guidelines

- Describe what changed and why
- Include screenshots for UI changes
- Ensure CI passes
- Reference related issues

---

## Coding Conventions

### Backend

- **ES modules:** CommonJS (`require`/`module.exports`)
- **Route structure:** One module per domain in `server/routes/`
- **Database:** Use `dbRun`, `dbGet`, `dbAll` helpers from `db.js`
- **Validation:** express-validator on all input endpoints
- **Error handling:** Return `{ error: "message" }` with appropriate HTTP status
- **Logging:** Use `logger` from Winston, not bare `console.log` in production paths
- **Security:** Never expose stack traces or SQL errors to clients

### Frontend

- **No framework** — Vanilla JS with module files
- **No build step** — Files served directly
- **DOM manipulation** — Direct DOM API, no jQuery
- **XSS prevention** — All user/AI content sanitized with DOMPurify
- **Formatting helpers** — Use `fc()` for currency, `cs()` for currency symbol
- **Charts** — TradingView Lightweight Charts API

### Database

- **sql.js** — In-memory SQLite compiled to WASM
- **Debounced writes** — Database persists to disk every 1 second (batched)
- **Migrations** — Auto-migrations run on startup in `db.js`
- **Indexes** — Composite indexes on frequently queried columns

### CSS

- Single file (`public/css/styles.css`)
- CSS custom properties for theming (dark/light)
- Mobile-first responsive design
- No preprocessor (plain CSS)
