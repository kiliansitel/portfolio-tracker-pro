# Portfolio Tracker Pro — Version History

## v0.1.0 "Genesis" (2026-02-05)
Initial build with basic portfolio tracking.
- Static HTML with TradingView Lightweight Charts
- Yahoo Finance price fetching via allorigins proxy
- Basic positions display (QQQ LEAP, IREN)
- Market overview (S&P, Nasdaq, Dow, VIX, BTC)
- Mobile "App mode" layout

## v0.2.0 "Foundation" (2026-02-06 ~02:00 UTC)
Added moving averages and expanded tickers.
- MA20, MA50, MA200 overlays on chart
- 25 tickers in watchlist
- Tabbed bottom nav (Positions, Watch, Alerts)
- Compact mode improvements
- Fixed header/ticker overlap issues

## v0.3.0 "Atlas" (2026-02-06 ~05:00 UTC)
Complete backend rewrite with user authentication.
- Node.js/Express backend with SQLite (sql.js)
- JWT authentication (register/login)
- Multi-user support with per-user portfolios
- CRUD API for positions, watchlists, alerts
- Database persistence
- Systemd service for auto-start

## v0.4.0 "Polaris" (2026-02-06 ~06:30 UTC)
Major UI/UX improvements based on feedback.

**Fixes:**
- Fixed `lastInsertRowid` bug (user_id was 0)
- Fixed chart URL double-brace bug
- Fixed form ID references for edit mode

**New Features:**
- **Position cards** — Mobile-friendly layout (no more table overflow)
- **Edit functionality** — ✏️ button on positions and watchlist items
- **Category grouping** — Watchlist grouped by Tech/Crypto/Safe Haven/Robotics
- **Alerts page** — Shows all items with price alerts set
- **Better chart sizing** — Proper dimensions and resize handling

---

## v0.5.0 "Velocity" (2026-02-06 ~06:45 UTC)
Performance and reliability focus.

**New Features:**
- **LocalStorage caching** — Prices persist between sessions, instant load
- **Multi-source fallback** — 3 data sources (corsproxy → allorigins → direct)
- **Batch fetching** — Parallel price fetches in groups of 5
- **About section** — Version info in Settings with cache/source status
- **Background refresh** — UI renders immediately with cached data

---

## v0.5.1 "Velocity" (2026-02-06 ~06:52 UTC)
Critical bug fixes.

**Fixes:**
- ✅ **Edit buttons now work** — Variable declarations moved before function definitions
- ✅ **Moving averages restored** — MA20 (orange) and MA50 (blue) on 1M/3M/1Y charts
- ✅ **Portfolio value correct** — Options use manual `current_price` instead of underlying stock price
- ✅ **Faster init** — Chart/data load non-blocking, UI renders instantly

**New Features:**
- **Manual option pricing** — New "Current Price" field for options (update when you check)
- Database migration adds `current_price` column

---

## v0.5.2 "Velocity" (2026-02-06 ~06:55 UTC) ← CURRENT
Options pricing and alert editing.

**New Features:**
- ✅ **Automatic option price fetching** — Constructs Yahoo option symbols (e.g., QQQ270617C00800000)
- ✅ **Edit alerts** — ✏️ and ✕ buttons on Alerts page
- ✅ **Click alert to view chart** — Clicking alert symbol opens chart

**How option symbols work:**
- Yahoo format: `{TICKER}{YYMMDD}{C/P}{STRIKE*1000}`
- Example: QQQ $800 Call June 17 2027 → `QQQ270617C00800000`
- App auto-constructs this from your position's expiry date and strike price

**Known Limitations:**
- Option prices may still fail if Yahoo rate-limits
- Falls back to manual `current_price` if auto-fetch fails

---

## v0.6.0 "Swipe" (2026-02-06 ~07:05 UTC) ← CURRENT
TradingView-style swipe actions.

**New Features:**
- 👆 **Swipe-to-reveal actions** — Swipe left on watchlist items to reveal Edit/Delete
- 🔧 **Fixed edit functions** — Using querySelector for reliable form access
- 🎨 **Cleaner watchlist rows** — Removed inline buttons, swipe only

**How to use:**
- Swipe left on any watchlist ticker → reveals ✏️ Edit and 🗑️ Delete
- Tap elsewhere to close
- Tap ticker name to view chart

**Technical:**
- Touch event handlers for smooth gesture
- Auto-closes other swipes when opening new one
- 60px threshold to trigger open state

---

## Roadmap Ideas
- [ ] Manual price entry for options
- [ ] Transaction history
- [ ] Portfolio performance over time
- [ ] Push notifications for alerts
- [ ] Dark/light theme toggle
- [ ] Export to CSV
- [ ] HTTPS via nginx reverse proxy

---

*Maintained by Skynet 🤖*
