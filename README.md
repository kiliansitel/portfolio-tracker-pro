# Portfolio Tracker Pro — BetaGUI (React)

A greenfield React frontend for **Portfolio Tracker Pro** that replicates the **Figma redesign** and connects to the existing **beta backend API**.

- **Frontend (this repo):** React + TypeScript + Vite + Tailwind v4 + shadcn/ui
- **Backend (existing):** Portfolio Tracker Pro beta API (do not modify)

## URLs / Ports

- **BetaGUI:** http://192.168.20.6:8083
- **Backend API:** http://192.168.20.6:8081

The Vite dev server proxies `/api/*` → `http://192.168.20.6:8081/api/*`.

## Pages

- `/` Dashboard
- `/positions` Positions
- `/watchlist` Watchlist
- `/portfolio` Portfolio
- `/news` News
- `/oracle` Oracle
- `/alerts` Alerts
- `/connections` Connections
- `/settings` Settings
- `/wallet` Wallet
- `/login` Login

## Development

```bash
cd /home/skynet/.openclaw/workspace/portfolio-tracker-betaGUI/frontend
npm install
npm run dev -- --host 0.0.0.0 --port 8083
```

Build:

```bash
npm run build
```

## Auth

- Login endpoint: `POST /api/auth/login` with JSON body `{ "login": "...", "password": "..." }`
- JWT stored in `localStorage` and sent as `Authorization: Bearer <token>`

## Systemd Service

A systemd service is installed as:

- `/etc/systemd/system/portfolio-tracker-betaGUI.service`

Commands:

```bash
sudo systemctl status portfolio-tracker-betaGUI.service
sudo systemctl restart portfolio-tracker-betaGUI.service
sudo journalctl -u portfolio-tracker-betaGUI.service -f
```
