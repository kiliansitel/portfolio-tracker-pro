# Portfolio Tracker Pro 📊

A sleek, self-hosted portfolio tracking app with TradingView-style charts. Built for investors who want full control of their data.

[![Version](https://img.shields.io/badge/version-0.8.0_Detail-blue?style=flat-square)](VERSIONS.md)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square)](https://nodejs.org)

## ✨ Features

### Portfolio Management
- 💼 **Track positions** — Stocks, options, crypto, ETFs
- 📊 **Real-time P&L** — Automatic calculation with live prices
- 💰 **Cash tracking** — Monitor your dry powder
- 📝 **Notes & metadata** — Strike prices, expiry dates for options

### Watchlists
- 👁️ **Organized categories** — Tech, Crypto, Safe Haven, Robotics, General
- 📂 **Collapsible sections** — Clean, organized view
- 🎯 **Price targets** — Set buy/sell alert levels
- 👆 **Swipe actions** — Edit/delete with a swipe (mobile-friendly)

### Charts
- 📈 **TradingView-style** — Powered by Lightweight Charts
- 🕯️ **Candle & Area views** — Toggle between styles
- 📉 **Moving averages** — MA20, MA50, MA200 with toggles
- ⏱️ **Multiple timeframes** — 1D, 5D, 1M, 3M, 1Y
- 🔍 **Detail view** — Full-screen chart modal

### Price Alerts
- 🔔 **Visual triggers** — See when prices hit targets
- 🟢 **Buy alerts** — "Price below $X"
- 🔴 **Sell alerts** — "Price above $X"

### Markets Overview
- 🌍 **Key indices** — S&P 500, Nasdaq, Dow, VIX, Bitcoin
- 📌 **Pin custom tickers** — Add your favorites to the dashboard
- ⚡ **Fast updates** — Cached for instant loading

### Technical
- 🔐 **Multi-user auth** — JWT-based, secure
- 💾 **SQLite database** — Simple, no external DB needed
- 🚀 **Fast caching** — LocalStorage for instant loads
- 📱 **Mobile-first** — Responsive design with swipe gestures

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Clone the repo
git clone https://github.com/kiliansitel/portfolio-tracker-pro.git
cd portfolio-tracker-pro

# Install dependencies
cd server
npm install

# Start the server
node index.js
```

Open http://localhost:8080 in your browser.

### First Run
1. Click **Register** to create an account
2. Add your first position in **Portfolio**
3. Build your **Watchlist** with categories
4. Set **Price Alerts** on tickers you're watching

## 📁 Project Structure

```
portfolio-tracker-pro/
├── public/
│   └── index.html          # Frontend (single-file app)
├── server/
│   ├── index.js            # Express API server
│   ├── package.json        # Dependencies
│   ├── portfolio.db        # SQLite database (auto-created)
│   └── portfolio-tracker.service  # Systemd service file
├── VERSIONS.md             # Detailed changelog
├── README.md
└── .gitignore
```

## 🔌 API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Get current user |
| PUT | `/api/auth/settings` | Update user settings |

### Portfolios
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/portfolios` | List user's portfolios |
| POST | `/api/portfolios` | Create portfolio |
| PUT | `/api/portfolios/:id` | Update portfolio |
| DELETE | `/api/portfolios/:id` | Delete portfolio |

### Positions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/portfolios/:id/positions` | List positions |
| POST | `/api/portfolios/:id/positions` | Add position |
| PUT | `/api/positions/:id` | Update position |
| DELETE | `/api/positions/:id` | Delete position |

### Watchlists
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/watchlists` | List watchlists with items |
| POST | `/api/watchlists` | Create watchlist |
| POST | `/api/watchlists/:id/items` | Add item to watchlist |
| PUT | `/api/watchlist-items/:id` | Update watchlist item |
| DELETE | `/api/watchlist-items/:id` | Remove from watchlist |

## 🖥️ Deployment

### Systemd Service (Linux)

```bash
# Copy service file
sudo cp server/portfolio-tracker.service /etc/systemd/system/

# Edit paths if needed
sudo nano /etc/systemd/system/portfolio-tracker.service

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable portfolio-tracker
sudo systemctl start portfolio-tracker

# Check status
sudo systemctl status portfolio-tracker
```

### Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name portfolio.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Docker (Coming Soon)
```bash
# TODO: Dockerfile
```

## 🔒 Security Notes

- JWT tokens expire in 30 days
- Passwords hashed with bcrypt (10 rounds)
- Database is local SQLite (no external connections)
- Recommended: Run behind reverse proxy with HTTPS
- Recommended: Firewall to limit access to trusted networks

## 📊 Data Sources

- **Price data:** Yahoo Finance (via CORS proxies)
- **Proxies used:** corsproxy.io, allorigins.win
- **Update frequency:** 60 seconds auto-refresh
- **Caching:** LocalStorage (5 min for prices, 5 min for charts)

## 🛣️ Roadmap

- [ ] Docker container
- [ ] Push notifications for alerts
- [ ] Portfolio performance history
- [ ] Export to CSV/PDF
- [ ] Dark/light theme toggle
- [ ] Options chain viewer
- [ ] News integration
- [ ] Multiple currency support

## 📝 Changelog

See [VERSIONS.md](VERSIONS.md) for detailed version history.

**Latest: v0.8.0 "Detail"**
- Full-screen chart modal with candle view
- MA toggles (MA20, MA50, MA200)
- Pin tickers to Markets
- Clean + buttons

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a PR

## 📄 License

MIT License - feel free to use for personal or commercial projects.

## 👨‍💻 Author

Built by **Skynet** 🤖 via [OpenClaw](https://github.com/openclaw/openclaw)

---

⭐ Star this repo if you find it useful!
