# Portfolio Tracker Pro — Full Code Audit

**Date:** 2026-06-11
**Scope:** Entire repository (server, client, infra/config, tests) at commit `a29c928`.
**Method:** Static review of all source files, `npm audit`, the Jest suite, plus **live black-box testing against a running instance** (fresh install seeded from `demo-portfolio.db`). The most severe findings below were reproduced live, not just read.

## TL;DR

The application **does not currently run in the browser**: two committed frontend files (`portfolio.js`, `portfolio-performance.js`) are truncated mid-function and fail to parse, taking the core UI with them (commit `d66efed`). On the backend, several ordinary user flows are broken or dangerous: any logged-in user can **download the entire multi-user database** (including password hashes and encrypted API keys) or **overwrite it**; creating a price **alert always 500s**; a failed partial-position-close still **credits cash and is infinitely repeatable** (money printer); and a single **re-buy of a closed symbol crashes the whole server**. The documented Docker install ships a **static default `JWT_SECRET`** and a **publicly-known demo login**.

Totals across all areas: **7 Critical, 15 High, 38 Medium, 28 Low.**

Findings I personally reproduced on a live instance are marked **✓ VERIFIED LIVE**.

---

## Remediation status (branch `claude/portfolio-tracker-audit-wg6sjy`)

All **7 Critical** and **15 High** findings have been fixed and verified, except **H11**
(JWT in `localStorage`), which is deferred pending a decision because it requires a
browser-tested rewrite of the auth flow (the httpOnly-cookie infra already exists, and
its exfiltration vector — the XSS sinks in H9/H10 — is now closed).

Fixed and verified in this branch:

- **C1** frontend truncation — both files restored; all 21 scripts load with zero errors (jsdom).
- **C2/C3/C7** backup/restore/self-update — gated behind a new `requireAdmin` middleware (`users.is_admin`).
- **C4** partial-close cash mint — wrapped in a DB transaction; verified cash no longer mints on repeat.
- **C5** re-buy crash — handler wrapped in try/catch + reopens closed rows; verified server stays up.
- **C6** static `JWT_SECRET` — removed from compose; secret resolution centralized; boots with no env var.
- **H1** alert creation — fixed the bad column; verified `POST /api/alerts` returns 200.
- **H2** demo seeding — now opt-in via `DEMO_MODE`.
- **H3/H4/H5** close validation, snapshot double-count, delete double-credit — fixed.
- **H6** ERC-20 wrong-chain scan — restricted to eth/sol.
- **H7/H8** SSRF + missing timeouts — `assertSafeUrl` guard + `AbortSignal.timeout`; verified metadata IP blocked.
- **H9/H10** XSS — escape-at-source everywhere; AI markdown safe even without DOMPurify (verified headless).
- **H12** open registration — gated (`ALLOW_REGISTRATION`, first user bootstraps admin).
- **H13** FK pragma + atomic DB writes + `is_admin` migration.
- **H14/H15** workflow least-privilege permissions + CI security gate; `npm audit fix` cleared all 11 advisories; Node 20→22.
- Also fixed Medium frontend bugs found during live testing: **M-FE1** (`switchPage`→`showPage`), **M-FE2** (`renderDashboard` replaced with real refresh).

**Deferred:** H11 (cookie-only auth migration) and the remaining Medium/Low items.

---

## CRITICAL

### C1 — Frontend is broken: two core JS files are truncated and fail to parse ✓ VERIFIED LIVE
`public/js/portfolio.js:866` and `public/js/portfolio-performance.js:251`. Both files end mid-function with no closing brace; `node --check` reports `SyntaxError: Unexpected end of input` on each. The breakage is committed in `HEAD` (introduced by `d66efed "refactor: extract portfolio.js sub-modules"` — an incomplete extraction). The browser aborts the entire `<script>`, so `renderPositions`, `updateSummary`, `showPositionDetail`, `loadPerformance`, `loadSparklines`, `calcRSI`, `savePortfolioSnapshot`, `reconstructHistory` and more are all `undefined` at runtime; everything that calls them throws `ReferenceError`. The app is effectively non-functional.
**Fix:** restore the truncated remainders (close `updateSummary` and `setPerformanceRange` and re-add whatever followed). Add a CI step that runs `node --check` (or a bundler) on every `public/js/*.js`.

### C2 — Any authenticated user can download the entire multi-user database ✓ VERIFIED LIVE
`server/routes/backup.js:8-23` (`GET /api/backup/`). The handler returns `db.export()` — the whole SQLite file — to anyone with a valid JWT. There is no admin role anywhere in the app, and registration is open by default. Live test: logged in as the demo user and downloaded a 282 KB SQLite file containing every table; `strings` on it revealed `demo@test.com` and the argon2id password hash. In a real deployment this exfiltrates **all users'** credentials, emails, portfolios, push subscriptions, and AES-encrypted AI provider keys.
**Fix:** gate behind an admin-only check, or scope the export to the requesting user's own rows.

### C3 — Any authenticated user can overwrite the entire global database
`server/routes/backup.js:26-47` (`POST /api/backup/restore`). `replaceDb()` swaps the live DB for an attacker-uploaded file for *all* users; the only validation is the presence of `users`/`portfolios` tables. A malicious user can wipe everyone's data or inject a crafted `users` row with a known password hash → full app takeover. It also `db.close()`es the shared handle mid-flight, so concurrent requests can crash.
**Fix:** admin-only; validate ownership/scope; never replace the global handle from a user request.

### C4 — Partial position close mints cash on every (failed) attempt, infinitely repeatable ✓ VERIFIED LIVE
`server/routes/portfolio.js:380-408`. Cash is credited *first* (`UPDATE portfolios SET cash = cash + ?`, line 392), then a partial close tries to `INSERT` a second `positions` row with the same `(portfolio_id, symbol)` — which violates `UNIQUE(portfolio_id, symbol)` (db.js:143). The insert throws, the request 500s, **but the cash credit is never rolled back** and the original quantity is never reduced. Live test: three identical "failed" partial-close calls drove the demo portfolio's cash from **\$21,250 → \$22,250 → \$23,250 → \$24,250** (+\$1,000 each), with the position left fully intact at 10 shares / `open`. No DB transaction wraps the operation (the codebase has no `BEGIN/COMMIT` anywhere).
**Fix:** wrap the close in a transaction (rollback on failure); don't model a partial close as a duplicate `positions` row (use a separate closed-lots table or drop the row reuse); apply the cash update last.

### C5 — Re-buying a previously-closed symbol crashes the entire server (one-request DoS) ✓ VERIFIED LIVE
`server/routes/portfolio.js:99-208` (`POST /:id/positions`) has **no try/catch**. The existing-position lookup excludes closed rows (`status != 'closed'`), but `UNIQUE(portfolio_id, symbol)` still covers them, so the `INSERT` at line 172 throws inside an `async` handler. Express 4 doesn't forward async throws, so on Node ≥15 the unhandled rejection terminates the process. Live test: closing AAPL then a single `POST` to re-buy it produced `Error: UNIQUE constraint failed: positions.portfolio_id, positions.symbol` at `portfolio.js:172` and the **Node process exited** — every subsequent request got connection-refused. Any authenticated user can take the server down with two requests.
**Fix:** wrap the handler in try/catch and handle the closed-row collision explicitly (re-open / merge).

### C6 — Static default `JWT_SECRET` in the documented Docker install (full auth bypass + key disclosure)
`docker-compose.yml:15` / `docker-compose-beta.yml:16`: `JWT_SECRET=${JWT_SECRET:-change-this-secret-in-production}`. `README.md` tells users to `git clone && docker-compose up -d` with no mention of setting the variable, so the documented path runs with a publicly-known signing secret. Anyone can forge a token for any user id. Worse, the **same** `JWT_SECRET` is used to AES-encrypt stored AI provider API keys (`ai-providers.js`), so the static default also exposes those keys. The app code has a *safe* auto-generate-and-persist fallback (`auth.js:16-30`) that the compose default actively defeats.
**Fix:** remove the `:-` default; fail fast (`${JWT_SECRET:?set JWT_SECRET}`) or omit the var so the app's auto-generation runs. Use a separate secret for at-rest encryption.

### C7 — Self-update endpoints let any non-admin user run `git pull` + `npm ci` + restart
`server/routes/updates.js:268-359`. `POST /api/updates/apply` runs `execSync('git fetch')`, `git checkout`, `git pull`, `npm ci --omit=dev` (which executes lifecycle scripts), then `process.exit(0)` to force a restart. `POST /api/updates/settings` flips `autoUpdate: true`. Both require only `authenticateToken`, and the app has no admin concept — so **any** logged-in user can force restarts on demand (DoS) and trigger an install from whatever the branch resolves to. `targetBranch` is whitelisted to `main`/`beta`, so it's not direct argument injection, but the missing privilege gate is the critical issue.
**Fix:** gate all update endpoints behind an admin-only middleware; ideally remove in-app self-update in favor of an out-of-band deploy.

---

## HIGH

### H1 — Alert creation is completely broken (every `POST /api/alerts` 500s) ✓ VERIFIED LIVE
`server/routes/alerts.js:33` (and the duplicate in `ai.js:1056`) does `INSERT INTO alerts (... target_price, value) ...`, but the `alerts` table has **no `target_price` column** and no migration adds one. Live test: `POST /api/alerts` returned `{"error":"Internal server error"}`; the server log showed `Error: table alerts has no column named target_price` at `db.js:49`. The core alerting feature cannot create a single alert.
**Fix:** insert into `value` only (or add the column via migration).

### H2 — Known demo credentials seeded into every fresh install ✓ VERIFIED LIVE
Fresh installs copy `demo-portfolio.db` as the live DB (`db.js:11-22`). It contains user `demo` whose password is published in `README.md` (`demo` / `DemoPass123!`) and hardcoded in `qa-verify.js`. Live test: those exact credentials logged in successfully on a clean boot and returned a valid 30-day JWT. Every internet-exposed fresh deployment has a working public login that can store AI API keys, receive push subscriptions, etc.
**Fix:** gate seeding behind `DEMO_MODE=true`, or randomize the demo password on first boot.

### H3 — Close quantity is unvalidated (phantom proceeds, corrupted P&L)
`server/routes/portfolio.js:362-394`. `quantityToClose = closeQty || position.quantity` with no bounds. `closeQty > quantity` is treated as a full close yet credits cash for shares the user doesn't own; a **negative** `closeQty` is truthy → `isPartial` true → the original quantity *increases* and cash is debited. `close_price` is never validated numeric (a string yields `NaN` realized P&L stored in the DB).
**Fix:** validate `0 < closeQty <= position.quantity` and `close_price` as a finite non-negative number.

### H4 — Snapshots include closed positions → systematic double counting
`server/utils/snapshots.js:23`: `SELECT * FROM positions WHERE portfolio_id = ?` with no `status` filter. A fully-closed position keeps its `quantity`, so its market value is still added to `positionsValue` *and* the sale proceeds already sit in `cash`. Every history/performance chart built on snapshots over-states total value by the full value of every closed position. (Confirmed structurally: after the live full-close test, the closed AAPL row retained `quantity: 25`.)
**Fix:** `WHERE portfolio_id = ? AND (status IS NULL OR status != 'closed')`.

### H5 — Deleting a position double-credits cash (ignores prior sell proceeds)
`server/routes/portfolio.js:302-333`. Deletion reverses all `buy ... affects_cash=1` transactions back into cash but does **not** net out `sell` transactions. Flow: buy \$1,000 → close for \$1,200 (cash +\$1,200) → delete the position (cash +\$1,000 again). Cash is permanently inflated.
**Fix:** net buys minus sells with `affects_cash=1`, or recompute cash from the ledger.

### H6 — ERC-20 scanning uses Ethereum mainnet RPC for *all* EVM chains (wrong balances, N× double count)
`server/routes/wallets.js:88-97, 287-297`. For every chain in `TOKEN_CHAINS` (eth, bnb, avax, matic, arb, op) the code calls `fetchErc20Tokens`, which posts only to `ETH_RPC` with Ethereum contract addresses. A Polygon/Arbitrum wallet is credited with the address's *Ethereum mainnet* token balances; because the same `0x` address is valid on all EVM chains, adding it on N chains multiplies token positions N× in `syncTokenPositionsFromWallets`.
**Fix:** restrict token scanning to `chain === 'eth'`, or use per-chain RPC URLs and token lists.

### H7 — SSRF via user-controlled Ollama `baseUrl` ✓ VERIFIED LIVE
`server/routes/ai.js:249-292` (`GET /api/ai/models/ollama`) fetches `${baseUrl}/api/tags` server-side after only `new URL()` syntax validation — no scheme/host allow-list. Live test: requests with `baseUrl=http://169.254.169.254/latest/meta-data` and `baseUrl=http://127.0.0.1:8090/...` both caused the server to make the outbound request and **reflected the internal response status back** (`Server responded with 403` / `401`), turning the server into an internal-network port/host scanner and metadata oracle.
**Fix:** allow only http/https, resolve the host and block private/link-local/loopback ranges, and don't reflect upstream errors.

### H8 — SSRF + missing timeouts via stored custom/Ollama provider `base_url`
`server/utils/ai-providers.js:178-214, 341-373, 402-428`. `PUT /api/ai/providers/:provider/key` stores an arbitrary `baseUrl`; chat/test then fetch it directly. Same SSRF class as H7, **plus** none of the provider fetches pass an `AbortController`/timeout, so a slow endpoint hangs the request and ties up the SSE handler indefinitely.
**Fix:** allow-list/validate stored `base_url` (block private ranges); attach `AbortSignal.timeout(...)` to every provider fetch.

### H9 — Stored XSS: AI markdown rendering only sanitizes if DOMPurify happens to be loaded
`public/js/oracle.js:309-365` (`renderAiMarkdown`) builds HTML with **unescaped** table cells/headers and list items (`<td>${c.trim()}</td>`, etc.) and only runs DOMPurify `if (typeof DOMPurify !== 'undefined')`. If `js/vendor/purify.min.js` fails to load, raw model-controlled HTML (`<img onerror=...>`) is injected with no fallback escaping. AI output is steerable via untrusted tickers/news/notes fed as context.
**Fix:** HTML-escape all cell/list/header text at build time regardless of DOMPurify; fail closed if DOMPurify is missing.

### H10 — Widespread unescaped `innerHTML` of API/user data (XSS); `escapeHtml()` exists but is never called
An `escapeHtml()` helper is defined at `markets.js:439` and used nowhere. Raw interpolation into `innerHTML` includes: position **notes** (`portfolio.js:452`), **news** title/source/link from `/api/news` (`markets.js:413-416`, `href="${item.link}"` allows `javascript:`), wallet **label/token/protocol** (`wallets.js:98-164`, label also placed in an inline `onclick` with quote-only escaping), transaction **location/notes** (`transactions.js:597-599`), ticker **names** from search (`autocomplete.js:146`, `oracle.js:975`). Company/ticker names and notes are user/third-party controlled.
**Fix:** route every interpolated dynamic string through `escapeHtml()` or build via `textContent`.

### H11 — JWT stored in `localStorage`, amplifying every XSS to account takeover
`auth.js:25-26`, `app.js:2`, `utils.js:2`. The bearer token lives in `localStorage`; combined with H9/H10 any injected script can exfiltrate it. No `HttpOnly` cookie option.
**Fix:** prefer an `HttpOnly; Secure; SameSite` cookie for the session token; at minimum eliminate the XSS sinks.

### H12 — Open registration with no gate (default-on)
`server/routes/auth.js:64`, `index.js:81`. `POST /api/auth/register` is mounted with only a rate limiter; there is no `ALLOW_REGISTRATION`/invite/admin flag. Combined with C2/C3 this turns self-service signup into full read/write access to all tenants' data.
**Fix:** env-gated registration toggle (default off for self-hosted single-user), or invite/admin flow.

### H13 — No `PRAGMA foreign_keys = ON` (declared FKs / cascades never enforced)
`server/db.js`. sql.js defaults foreign keys OFF and the pragma is never set. The schema's `ON DELETE CASCADE` on `wallet_transactions` / `wallet_tokens` and all FK constraints are silently inert; deleting a wallet/user orphans child rows.
**Fix:** `db.run('PRAGMA foreign_keys = ON')` immediately after every DB open (init and `replaceDb`).

### H14 — Secret-bearing third-party GitHub Actions pinned to mutable tags
`.github/workflows/deploy-beta.yml:72-76` (`appleboy/ssh-action@v1` receives `DEPLOY_SSH_KEY`/host/user), `publish-wiki.yml:19`, `dockerhub-description.yml:18` (full `DOCKERHUB_TOKEN`, not a scoped read token). A compromised/retagged release of any of these exfiltrates production SSH or DockerHub credentials.
**Fix:** pin non-first-party actions to full commit SHAs; use a scoped DockerHub token; consider a forced-command deploy key.

### H15 — CI security audit can never fail the build, and ESLint never runs
`.github/workflows/ci.yml:26-32` runs `npm audit` and `better-npm-audit` with `continue-on-error: true`, so known high/critical CVEs stay green. The "Lint & Security Scan" job contains **no lint step** at all (`npm run lint` is never invoked). Separately, `npm run lint` is broken anyway — ESLint isn't in `devDependencies` and the repo's `.eslintrc.js` is the legacy format current ESLint rejects.
**Fix:** drop `continue-on-error` on the primary audit; add `npm run lint -- --max-warnings 0`; install ESLint and migrate the config to flat format.

---

## MEDIUM (selected — full list in the per-area sections below)

- **M-AI1** SSE chat never handles client disconnect — upstream LLM stream keeps consuming tokens and writing to a dead socket (`ai.js:542-587`, no `req.on('close')`).
- **M-AI2** Unauthenticated price-stream SSE (`market.js` mounted public) spawns per-connection 3s/8s `setInterval`s fanning out up to 50 Yahoo fetches each → trivial resource amplification.
- **M-AI3** No timeout on `getYahooCrumb` / `/news` `https.get` calls → hung requests; unbounded response buffering (`market.js:17-47, 424-501`).
- **M-AI4** Partial FX responses produce `NaN` cross/reverse rates that get cached in memory and DB, poisoning later conversions; `convertCurrency` doesn't guard `NaN` (`currency.js:54-91, 114`).
- **M-AI5** Prompt injection: user-stored watchlist `notes` / portfolio names are injected verbatim into the system prompt, which instructs the model to emit one-click `[[[ACTION:...]]]` tags (`ai-providers.js:724-730`).
- **M-DB1** sql.js + debounced non-atomic `writeFileSync` → up to ~1s of committed writes lost on crash/OOM/SIGKILL, and a crash mid-write leaves a truncated, journal-less DB file (`db.js:30-45`). Use temp-file + `rename`, or migrate to `better-sqlite3` (WAL, transactional).
- **M-DB2** Wallet transaction dedupe (`WHERE notes = ?`) is **not scoped by user** and has a check-then-insert race → cross-user suppression and duplicate rows (`wallets.js:1101-1127`).
- **M-DB3** Wallet-derived transactions record **today's** price for historical txs (garbage cost basis) and store crypto-unit fees in a fiat `fees` column (`wallets.js:1113-1126`).
- **M-DB4** Token position symbols (`WSOL-USD`, `RENDER-USD`, `aUSDC-USD`) don't match `TOKEN_YAHOO_TICKERS`, so they're unpriceable → valued at \$0 in snapshots (`wallets.js:861-866`).
- **M-LOGIC1** `data.js:240-243` reconstruction branches on `tx.type` (asset class) instead of `tx.action` (buy/sell), so quantities are never applied — reconstructed snapshots stay at 0.
- **M-LOGIC2** Mixed-currency snapshot totals: cash is converted to USD but position values use raw Yahoo quote currency (EUR/GBp pence is 100× off) (`snapshots.js:30-82`).
- **M-LOGIC3** Adding a transaction via `transactions.js:64-92` writes `affects_cash=1` but never touches cash, while portfolio.js later "reverses" it against cash that was never deducted.
- **M-LOGIC4** `PUT /portfolios/:id` and `PUT /positions/:id` have **no body validation** — negative/NaN/absurd `cash`, `quantity`, `entry_price` flow straight into the DB (`portfolio.js:28-41, 211-284`).
- **M-LOGIC5** Concurrent close requests double-credit cash (status read, then `await fetchExchangeRates()`, then unconditional `cash = cash + ?`; no transaction) (`portfolio.js:344-447`).
- **M-AUTH1** Login user-enumeration timing side channel — no password verify is run when the user is absent (`auth.js:122-126`). Run a dummy argon2 verify.
- **M-AUTH2** Global API rate limiting is disabled; the purpose-built `authLimiter` (20/5min, skip-successful) is imported but never applied to login/register (`index.js:68`, `security.js`).
- **M-AUTH3** JWT verification doesn't pin the algorithm (`auth.js:50-61`) — add `{ algorithms: ['HS256'] }`.
- **M-PUSH1** SSRF via attacker-controlled push `endpoint`: `/subscribe` stores any URL, `/test` makes the server request it (`push.js:23-49, 111-127`).
- **M-FE1** `switchPage()` (`app.js:400`) and `renderDashboard()` (`utils.js:878`) are called but never defined — Alt+number shortcuts and the currency-change refresh throw `ReferenceError`.
- **M-FE2** Out-of-order chart fetches can clobber newer data (single shared `chartAbortController` across main/detail; no per-request symbol guard at render) (`utils.js:732-790`).
- **M-FE3** "Today's change" divides by `1 + changePct/100` with no guard → `Infinity`/`NaN` when a feed reports −100% (`portfolio.js:128-131`).
- **M-INFRA1** `.dockerignore` patterns are non-recursive (`*.db`, `.env.*` only match the root), so a developer's `server/.env` or live `server/portfolio.db` can be baked into a locally-built image.
- **M-INFRA2** `deploy-beta.yml` pulls `:beta` but `docker-compose-beta.yml` has `build: .` and no `image:`, so compose rebuilds from possibly-stale source and ignores the pushed image → deploys can ship old code.
- **M-INFRA3** Node 20 base image is EOL (2026-04-30); not digest-pinned. Move to `node:22-alpine`.
- **M-INFRA4** Dockerfile ships devDependencies (jest/supertest/playwright) and `tests/`, `e2e/`, `qa-verify.js` into the production image.
- **M-TEST1** No cross-user (IDOR) authorization tests — a dropped `AND user_id = ?` would pass CI. Tests are otherwise real integration tests, not stubs.
- **M-TEST2** Coverage thresholds are decorative (8% branches / 12% functions); `forceExit:true` + `detectOpenHandles:false` hide the leaked `setInterval` handles (Jest force-exits).

---

## LOW (selected)

- **L1** `report-scheduler.js:11` `JWT_SECRET || 'fallback-secret'` (dead today, latent footgun).
- **L2** AI provider keys encrypted with AES-256-**CBC** (no MAC/GCM) using `SHA256(JWT_SECRET)` — malleable, reuses the auth secret (`ai-providers.js:13-30`).
- **L3** `quoteInfoCache` (24h) is never swept → slow unbounded memory growth (`yahoo.js:284-325`).
- **L4** Report scheduler uses exact `hour===t && minute===t` equality on a once-per-minute cron → a missed/long tick silently skips that day's report.
- **L5** Register-issued JWT omits `tv`, so logout can't invalidate it for 30 days (`auth.js:96` vs `152`).
- **L6** CSP allows `'unsafe-inline'` for scripts (`security.js:65,89`), weakening XSS defense for an app that renders user fields.
- **L7** Alerts `/check` API-key compare uses `!==` (not timing-safe) and the whole endpoint is duplicated dead code (`alerts.js:60-218`).
- **L8** `history.js` collection: `newRows` counts attempts not inserts (`INSERT OR IGNORE`); trading-day date via UTC ISO shifts non-UTC exchanges off-by-one; `POST /collect` iterates **all** users' symbols.
- **L9** Several routes leak `err.message` / SQLite constraint text to clients (`portfolio.js:282,339,445`; `wallets.js:1367,1537,1628`; `ai.js:286,433`).
- **L10** Unvalidated pagination (`parseInt(limit)` → NaN/`LIMIT -1` unbounded) in `transactions.js` and `reports.js`.
- **L11** EVM wallet address duplicate check is case-sensitive → same wallet addable twice, doubling positions (`wallets.js:1184-1190`).
- **L12** 27 currencies accepted by validators but only 4 have FX rates → cash adjustments silently skipped for the rest (`validators/portfolio.js:85-88` vs `currency.js:9`).
- **L13** Dividend frequency heuristic misreads Yahoo's `dividendRate` (forward-annual, not per-payment) → almost everything classified "annual"; monthly income calendar is wrong (`portfolio.js:495-557`).
- **L14** Service-worker churn: `sw.js` self-unregisters and `app.js` unregisters all SWs + clears caches every load, while push registration re-adds it → unreliable push.
- **L15** `qa-verify.js` / systemd unit leak a personal LAN IP, home path (`/home/skynet/.openclaw/...`), username, and demo creds.
- **L16** systemd unit has no hardening (`NoNewPrivileges`, `ProtectSystem`, dedicated user) and writes secrets/DB next to the source tree.
- **L17** Both `argon2` and legacy `bcryptjs@2.4.3` are dependencies (one likely dead weight; document the legacy-migration purpose or drop it).

---

## Dependency / tooling status

- `npm audit`: **11 vulnerabilities (5 high, 6 moderate)** — notably `express-rate-limit` (IPv4-mapped IPv6 rate-limit bypass), `lodash` (prototype pollution / `_.template` code injection), `qs` DoS via `express`/`body-parser`, and ReDoS in `picomatch`/`minimatch`. Most are fixable with `npm audit fix`.
- Jest: **45/45 pass**, but the run leaks open handles (timers/scheduler not torn down) and only survives via `--forceExit`.
- ESLint: effectively **not wired up** (missing dep + legacy config rejected by current ESLint) and not run in CI.

## Verified clean (no finding)

- No SQL injection: every query in scope is parameterized; the only string interpolation builds `?` placeholder lists / fixed column names.
- IDOR on business routes: portfolio/position/transaction/watchlist/alert/wallet queries correctly scope by `req.user.id` (the *backup* routes are the exception — see C2/C3).
- Password hashing is argon2id with OWASP params; legacy bcrypt hashes are verified and upgraded on login.
- The committed `demo-portfolio.db` contains only the (already-public) demo user — no real API keys, personal emails, or push endpoints. No `.env`/`.pem`/key files are tracked or in git history.
- No `pull_request_target` and no interpolation of untrusted `github.event.*` into workflow `run:` blocks.

## Recommended fix order

1. **C1** — restore the truncated frontend files (the app doesn't run without this).
2. **C4 / C5 / H1 / H3 / H4 / H5** — the money-math and crash bugs in `portfolio.js` / `alerts.js` / `snapshots.js`; wrap all multi-statement money operations in DB transactions and add try/catch + input validation.
3. **C2 / C3 / C6 / C7 / H12** — lock down backup/update endpoints behind an admin role, remove the static `JWT_SECRET` default, gate registration.
4. **H2** — make demo seeding opt-in.
5. **H7 / H8 / M-PUSH1** — SSRF guards + fetch timeouts.
6. **H9 / H10 / H11** — escape all `innerHTML` sinks; move the token to an HttpOnly cookie.
7. **H13 / H14 / H15** + `npm audit fix` — enable FK pragma, SHA-pin actions, make CI actually lint and fail on CVEs.
