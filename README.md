# Portfolio Tracker Pro 📊

A personal portfolio tracking app with TradingView-style charts, built for self-hosting.

![Version](https://img.shields.io/badge/version-0.8.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- 📈 **Real-time prices** via Yahoo Finance
- 📊 **Interactive charts** with Area/Candle views
- 📉 **Moving averages** (MA20, MA50, MA200)
- 💼 **Portfolio tracking** with P&L calculation
- 👁️ **Watchlists** with categories (Tech, Crypto, Safe Haven, Robotics)
- 🔔 **Price alerts** with visual triggers
- 👆 **Swipe actions** (mobile-friendly)
- 📌 **Pin tickers** to Markets overview
- 🔐 **Multi-user auth** (JWT)
- ⚡ **Fast caching** (localStorage for instant loads)

## Tech Stack

- **Frontend:** Vanilla JS, [Lightweight Charts](https://github.com/nicejobinc/lightweight-charts)
- **Backend:** Node.js, Express
- **Database:** SQLite (sql.js)
- **Auth:** JWT + bcrypt

## Quick Start

```bash
# Install dependencies
cd server
npm install

# Start server
node index.js
# → http://localhost:8080
```

## Project Structure

```
portfolio-tracker/
├── public/
│   └── index.html      # Frontend (single file)
├── server/
│   ├── index.js        # Express API
│   ├── package.json
│   └── portfolio.db    # SQLite database (gitignored)
├── VERSIONS.md         # Changelog
└── README.md
```

## API Endpoints

### Auth
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Current user

### Portfolios
- `GET /api/portfolios` - List portfolios
- `POST /api/portfolios` - Create portfolio
- `PUT /api/portfolios/:id` - Update portfolio
- `DELETE /api/portfolios/:id` - Delete portfolio

### Positions
- `GET /api/portfolios/:id/positions` - List positions
- `POST /api/portfolios/:id/positions` - Add position
- `PUT /api/positions/:id` - Update position
- `DELETE /api/positions/:id` - Delete position

### Watchlists
- `GET /api/watchlists` - List watchlists
- `POST /api/watchlists` - Create watchlist
- `POST /api/watchlists/:id/items` - Add item
- `PUT /api/watchlist-items/:id` - Update item
- `DELETE /api/watchlist-items/:id` - Delete item

## Deployment

### Systemd Service

```bash
sudo cp server/portfolio-tracker.service /etc/systemd/system/
sudo systemctl enable portfolio-tracker
sudo systemctl start portfolio-tracker
```

### Nginx Reverse Proxy (optional)

```nginx
location /portfolio/ {
    proxy_pass http://localhost:8080/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
}
```

## Development

Built overnight by [Skynet](https://github.com/openclaw/openclaw) 🤖

See [VERSIONS.md](VERSIONS.md) for full changelog.

## License

MIT
