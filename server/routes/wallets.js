const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db');
const { idParamValidation } = require('../validators/portfolio');
const { body, validationResult } = require('express-validator');
const { fetchYahooPrice } = require('../utils/yahoo');
const { logger } = require('../utils/logger');

const router = express.Router();

// ---- EVM chains that support ERC-20 tokens ----
const EVM_CHAINS = ['eth', 'bnb', 'avax', 'matic', 'arb', 'op'];

// ---- Top ERC-20 tokens to check (no API key needed, uses RPC) ----
const POPULAR_ERC20 = [
  { contract: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT',  name: 'Tether USD',     decimals: 6 },
  { contract: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC',  name: 'USD Coin',       decimals: 6 },
  { contract: '0x6b175474e89094c44da98b954eedeac495271d0f', symbol: 'DAI',   name: 'Dai Stablecoin',  decimals: 18 },
  { contract: '0x514910771af9ca656af840dff83e8264ecf986ca', symbol: 'LINK',  name: 'Chainlink',       decimals: 18 },
  { contract: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', symbol: 'UNI',   name: 'Uniswap',         decimals: 18 },
  { contract: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', symbol: 'AAVE',  name: 'Aave',            decimals: 18 },
  { contract: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', symbol: 'SHIB',  name: 'Shiba Inu',       decimals: 18 },
  { contract: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', symbol: 'WBTC',  name: 'Wrapped BTC',     decimals: 8 },
  { contract: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', symbol: 'WETH',  name: 'Wrapped Ether',   decimals: 18 },
  { contract: '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0', symbol: 'MATIC', name: 'Polygon',         decimals: 18 },
  { contract: '0x4d224452801aced8b2f0aebe155379bb5d594381', symbol: 'APE',   name: 'ApeCoin',         decimals: 18 },
  { contract: '0x6982508145454ce325ddbe47a25d4ec3d2311933', symbol: 'PEPE',  name: 'Pepe',            decimals: 18 },
  { contract: '0x5a98fcbea516cf06857215779fd812ca3bef1b32', symbol: 'LDO',   name: 'Lido DAO',        decimals: 18 },
  { contract: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', symbol: 'stETH', name: 'Lido Staked ETH', decimals: 18 },
  { contract: '0xbe9895146f7af43049ca1c1ae358b0541ea49704', symbol: 'cbETH', name: 'Coinbase Staked ETH', decimals: 18 },
  { contract: '0xa0b73e1ff0b80914ab6fe0444e65848c4c34450b', symbol: 'CRO',   name: 'Cronos',          decimals: 8 },
  { contract: '0x75231f58b43240c9718dd58b4967c5114342a86c', symbol: 'OKB',   name: 'OKB',             decimals: 18 },
  { contract: '0x4e15361fd6b4bb609fa63c81a2be19d873717870', symbol: 'FTM',   name: 'Fantom',          decimals: 18 },
  { contract: '0x3845badade8e6dff049820680d1f14bd3903a5d0', symbol: 'SAND',  name: 'The Sandbox',     decimals: 18 },
  { contract: '0x0f5d2fb29fb7d3cfee444a200298f468908cc942', symbol: 'MANA',  name: 'Decentraland',    decimals: 18 },
];

const ETH_RPC = 'https://ethereum-rpc.publicnode.com';
const BALANCE_OF_SELECTOR = '0x70a08231';

// Fetch ERC-20 balance via direct RPC eth_call (no API key needed)
async function fetchErc20BalanceRPC(walletAddress, contractAddress) {
  const paddedAddr = '000000000000000000000000' + walletAddress.replace('0x', '').toLowerCase();
  const data = BALANCE_OF_SELECTOR + paddedAddr;

  try {
    const res = await fetch(ETH_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: contractAddress, data }, 'latest'],
        id: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return '0';
    const result = await res.json();
    if (!result.result || result.result === '0x' || result.result === '0x0') return '0';
    return BigInt(result.result).toString();
  } catch (e) {
    logger.error(`RPC balanceOf failed for ${contractAddress}:`, e.message);
    return '0';
  }
}

// Discover tokens by checking popular ERC-20 balances via RPC
async function fetchErc20Tokens(address) {
  const found = [];
  // Check all popular tokens in parallel (batches of 5)
  for (let i = 0; i < POPULAR_ERC20.length; i += 5) {
    const batch = POPULAR_ERC20.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(async (tok) => {
        const bal = await fetchErc20BalanceRPC(address, tok.contract);
        if (bal !== '0') {
          return { ...tok, contract_address: tok.contract, balance_raw: bal };
        }
        return null;
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) found.push(r.value);
    }
    // Small delay between batches
    if (i + 5 < POPULAR_ERC20.length) await new Promise(r => setTimeout(r, 200));
  }
  return found;
}

// Fetch a single ERC-20 token balance via RPC
async function fetchErc20Balance(address, contractAddress) {
  return fetchErc20BalanceRPC(address, contractAddress);
}

// Map token symbols to Yahoo Finance tickers for pricing
const TOKEN_YAHOO_TICKERS = {
  'USDT': 'USDT-USD', 'USDC': 'USDC-USD', 'DAI': 'DAI-USD',
  'LINK': 'LINK-USD', 'UNI': 'UNI-USD', 'AAVE': 'AAVE-USD',
  'SHIB': 'SHIB-USD', 'WBTC': 'WBTC-USD', 'WETH': 'WETH-USD',
  'MATIC': 'MATIC-USD', 'APE': 'APE-USD', 'PEPE': 'PEPE-USD',
  'LDO': 'LDO-USD', 'stETH': 'STETH-USD', 'cbETH': 'CBETH-USD',
  'CRO': 'CRO-USD', 'OKB': 'OKB-USD', 'FTM': 'FTM-USD',
  'SAND': 'SAND-USD', 'MANA': 'MANA-USD',
};

// Fetch token USD prices via Yahoo Finance (same as rest of app)
async function fetchTokenPrices(tokens) {
  const prices = {}; // keyed by contract_address

  for (const token of tokens) {
    const yahooTicker = TOKEN_YAHOO_TICKERS[token.symbol];
    if (!yahooTicker) continue;

    try {
      const quote = await fetchYahooPrice(yahooTicker);
      if (quote && quote.price) {
        prices[token.contract_address.toLowerCase()] = quote.price;
      }
    } catch (e) {
      logger.error(`Yahoo price fetch for ${token.symbol}:`, e.message);
    }
  }

  return prices;
}

// Full ERC-20 sync for a single ETH wallet
async function syncWalletTokens(wallet) {
  if (wallet.chain !== 'eth') return []; // ETH only for now

  try {
    // 1. Discover tokens with non-zero balances via RPC
    const discoveredTokens = await fetchErc20Tokens(wallet.address);
    if (discoveredTokens.length === 0) return [];

    // 2. Convert raw balances to human-readable
    const tokensWithBalance = [];
    for (const token of discoveredTokens) {
      try {
        const balanceBigInt = BigInt(token.balance_raw || '0');
        if (balanceBigInt === 0n) continue;

        const decimals = token.decimals || 18;
        const divisor = BigInt(10) ** BigInt(decimals);
        const wholePart = balanceBigInt / divisor;
        const fracPart = balanceBigInt % divisor;
        const fracStr = fracPart.toString().padStart(decimals, '0').slice(0, 8);
        const humanBalance = `${wholePart}.${fracStr}`.replace(/0+$/, '').replace(/\.$/, '');

        tokensWithBalance.push({
          ...token,
          balance: humanBalance || '0',
        });
      } catch (e) {
        logger.error(`Failed to parse balance for token ${token.symbol}:`, e.message);
      }
    }

    if (tokensWithBalance.length === 0) return [];

    // 3. Fetch USD prices via Yahoo Finance
    const prices = await fetchTokenPrices(tokensWithBalance);

    // 4. Store in DB — upsert each token
    const now = new Date().toISOString();
    const results = [];

    for (const token of tokensWithBalance) {
      const usdPrice = prices[token.contract_address] || 0;
      const balanceNum = parseFloat(token.balance) || 0;
      const usdValue = balanceNum * usdPrice;

      // Filter out dust (< $1)
      if (usdValue < 1 && usdPrice > 0) continue;
      // If no price data, still store if balance is significant
      if (usdPrice === 0 && balanceNum < 0.001) continue;

      // Upsert
      const existing = dbGet(
        'SELECT id FROM wallet_tokens WHERE wallet_id = ? AND contract_address = ?',
        [wallet.id, token.contract_address]
      );

      if (existing) {
        dbRun(
          `UPDATE wallet_tokens SET symbol = ?, name = ?, decimals = ?, balance = ?, usd_value = ?, last_synced = ? WHERE id = ?`,
          [token.symbol, token.name, token.decimals, token.balance, usdValue, now, existing.id]
        );
      } else {
        dbRun(
          `INSERT INTO wallet_tokens (wallet_id, contract_address, symbol, name, decimals, balance, usd_value, last_synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [wallet.id, token.contract_address, token.symbol, token.name, token.decimals, token.balance, usdValue, now]
        );
      }

      results.push({
        contract_address: token.contract_address,
        symbol: token.symbol,
        name: token.name,
        balance: token.balance,
        usd_value: usdValue,
      });
    }

    // Clean up tokens that no longer have balance (remove if balance went to zero)
    const storedTokens = dbAll('SELECT id, contract_address FROM wallet_tokens WHERE wallet_id = ?', [wallet.id]);
    const activeContracts = new Set(tokensWithBalance.map(t => t.contract_address));
    for (const st of storedTokens) {
      if (!activeContracts.has(st.contract_address)) {
        dbRun('DELETE FROM wallet_tokens WHERE id = ?', [st.id]);
      }
    }

    return results;
  } catch (e) {
    logger.error(`Token sync failed for wallet ${wallet.id} (${wallet.chain}:${wallet.address}):`, e.message);
    return [];
  }
}

// Get stored tokens for a wallet
function getWalletTokens(walletId) {
  return dbAll(
    'SELECT * FROM wallet_tokens WHERE wallet_id = ? AND CAST(balance AS REAL) > 0 ORDER BY usd_value DESC',
    [walletId]
  );
}

// ---- Chain configuration for all 13 supported chains ----
const CHAIN_CONFIG = {
  btc:   { ticker: 'BTC-USD',  name: 'Bitcoin',    decimals: 8  },
  eth:   { ticker: 'ETH-USD',  name: 'Ethereum',   decimals: 18 },
  sol:   { ticker: 'SOL-USD',  name: 'Solana',     decimals: 9  },
  bnb:   { ticker: 'BNB-USD',  name: 'BNB',        decimals: 18 },
  avax:  { ticker: 'AVAX-USD', name: 'Avalanche',  decimals: 18 },
  matic: { ticker: 'MATIC-USD',name: 'Polygon',    decimals: 18 },
  arb:   { ticker: 'ARB-USD',  name: 'Arbitrum',   decimals: 18 },
  op:    { ticker: 'OP-USD',   name: 'Optimism',   decimals: 18 },
  ltc:   { ticker: 'LTC-USD',  name: 'Litecoin',   decimals: 8  },
  doge:  { ticker: 'DOGE-USD', name: 'Dogecoin',   decimals: 8  },
  xrp:   { ticker: 'XRP-USD',  name: 'Ripple',     decimals: 6  },
  ada:   { ticker: 'ADA-USD',  name: 'Cardano',    decimals: 6  },
  dot:   { ticker: 'DOT-USD',  name: 'Polkadot',   decimals: 10 },
};

const ALL_CHAINS = Object.keys(CHAIN_CONFIG);

// ---- Auto-sync interval ----
const MIN_SYNC_INTERVAL = 2 * 60 * 1000; // 2 minutes minimum
const DEFAULT_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes default
let autoSyncTimer = null;

function startAutoSync() {
  if (autoSyncTimer) return; // Already running

  let interval = parseInt(process.env.WALLET_SYNC_INTERVAL_MS, 10) || DEFAULT_SYNC_INTERVAL;
  if (interval < MIN_SYNC_INTERVAL) {
    logger.warn(`WALLET_SYNC_INTERVAL_MS (${interval}ms) is below minimum (${MIN_SYNC_INTERVAL}ms), using minimum`);
    interval = MIN_SYNC_INTERVAL;
  }

  logger.info(`Starting wallet auto-sync every ${interval / 1000}s`);

  autoSyncTimer = setInterval(async () => {
    try {
      const wallets = dbAll('SELECT * FROM wallets');
      if (!wallets || wallets.length === 0) {
        return; // Skip if no wallets
      }

      let synced = 0;
      for (const wallet of wallets) {
        try {
          await syncWalletBalance(wallet);
          // Also fetch new transactions during auto-sync
          try {
            await fetchAndStoreTransactions(wallet);
          } catch (txErr) {
            logger.error(`Auto-sync tx fetch failed for wallet ${wallet.id}:`, txErr.message);
          }
          // Sync ERC-20 tokens for EVM wallets during auto-sync
          if (EVM_CHAINS.includes(wallet.chain)) {
            try {
              await syncWalletTokens(wallet);
            } catch (tokenErr) {
              logger.error(`Auto-sync token sync failed for wallet ${wallet.id}:`, tokenErr.message);
            }
          }
          synced++;
        } catch (err) {
          logger.error(`Auto-sync failed for wallet ${wallet.id} (${wallet.chain}:${wallet.address}):`, err.message);
        }
      }

      // After syncing all wallets, update positions per user
      const userIds = [...new Set(wallets.map(w => w.user_id))];
      for (const userId of userIds) {
        try {
          const userWallets = dbAll('SELECT * FROM wallets WHERE user_id = ?', [userId]);
          const chainBalances = {};
          for (const w of userWallets) {
            chainBalances[w.chain] = (chainBalances[w.chain] || 0) + (w.balance || 0);
          }
          syncPositionsFromWallets(userId, chainBalances);
        } catch (err) {
          logger.error(`Auto-sync position update failed for user ${userId}:`, err.message);
        }
      }

      console.log(`Auto-sync: synced ${synced} wallets`);
    } catch (err) {
      logger.error('Auto-sync error:', err.message);
    }
  }, interval);
}

// Start auto-sync when module loads (will be a no-op if called multiple times)
// Delay slightly to let DB initialize
setTimeout(() => startAutoSync(), 5000);

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};

const walletValidation = [
  body('chain')
    .trim()
    .toLowerCase()
    .isIn(ALL_CHAINS)
    .withMessage(`Chain must be one of: ${ALL_CHAINS.join(', ')}`),
  body('address')
    .trim()
    .isLength({ min: 20, max: 128 })
    .withMessage('Address must be 20-128 characters'),
  body('label')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Label too long')
    .escape(),
  validate,
];

// ---- Chain balance fetchers ----

async function fetchBtcBalance(address) {
  const url = `https://blockchain.info/q/addressbalance/${address}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`BTC balance fetch failed: ${res.status}`);
  const satoshis = parseInt(await res.text(), 10);
  if (isNaN(satoshis)) throw new Error('Invalid BTC balance response');
  return satoshis / 1e8;
}

async function fetchEthBalance(address) {
  return fetchEvmRpcBalance(address, 'https://ethereum-rpc.publicnode.com', 'ETH');
}

async function fetchSolBalance(address) {
  const url = 'https://api.mainnet-beta.solana.com';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [address]
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`SOL balance fetch failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Solana RPC error: ${data.error.message}`);
  return (data.result?.value || 0) / 1e9;
}

// Reusable EVM JSON-RPC balance fetcher
async function fetchEvmRpcBalance(address, rpcUrl, label) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getBalance',
      params: [address, 'latest']
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${label} balance fetch failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`${label} RPC error: ${data.error.message}`);
  return parseInt(data.result, 16) / 1e18;
}

// EVM chain RPC URLs
const EVM_RPC_URLS = {
  bnb:   'https://bsc-dataseed.binance.org',
  avax:  'https://api.avax.network/ext/bc/C/rpc',
  matic: 'https://polygon-rpc.com',
  arb:   'https://arb1.arbitrum.io/rpc',
  op:    'https://mainnet.optimism.io',
};

async function fetchLtcBalance(address) {
  const url = `https://api.blockcypher.com/v1/ltc/main/addrs/${address}/balance`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`LTC balance fetch failed: ${res.status}`);
  const data = await res.json();
  return (data.final_balance || 0) / 1e8;
}

async function fetchDogeBalance(address) {
  const url = `https://api.blockcypher.com/v1/doge/main/addrs/${address}/balance`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`DOGE balance fetch failed: ${res.status}`);
  const data = await res.json();
  return (data.final_balance || 0) / 1e8;
}

async function fetchXrpBalance(address) {
  const url = `https://api.xrpscan.com/api/v1/account/${address}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`XRP balance fetch failed: ${res.status}`);
  const data = await res.json();
  return parseFloat(data.xrpBalance) || 0;
}

async function fetchAdaBalance(address) {
  const url = 'https://api.koios.rest/api/v1/address_info';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ _addresses: [address] }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`ADA balance fetch failed: ${res.status}`);
  const data = await res.json();
  const balance = data?.[0]?.balance || 0;
  return parseInt(balance, 10) / 1e6; // lovelace to ADA
}

async function fetchDotBalance(address) {
  const url = 'https://polkadot.api.subscan.io/api/v2/scan/search';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: address }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`DOT balance fetch failed: ${res.status}`);
  const data = await res.json();
  const balance = data?.data?.account?.balance || 0;
  return parseFloat(balance) / 1e10;
}

const CHAIN_FETCHERS = {
  btc:   fetchBtcBalance,
  eth:   fetchEthBalance,
  sol:   fetchSolBalance,
  bnb:   (addr) => fetchEvmRpcBalance(addr, EVM_RPC_URLS.bnb,   'BNB'),
  avax:  (addr) => fetchEvmRpcBalance(addr, EVM_RPC_URLS.avax,  'AVAX'),
  matic: (addr) => fetchEvmRpcBalance(addr, EVM_RPC_URLS.matic, 'MATIC'),
  arb:   (addr) => fetchEvmRpcBalance(addr, EVM_RPC_URLS.arb,   'ARB'),
  op:    (addr) => fetchEvmRpcBalance(addr, EVM_RPC_URLS.op,    'OP'),
  ltc:   fetchLtcBalance,
  doge:  fetchDogeBalance,
  xrp:   fetchXrpBalance,
  ada:   fetchAdaBalance,
  dot:   fetchDotBalance,
};

// Derive CHAIN_TICKERS and CHAIN_NAMES from CHAIN_CONFIG
const CHAIN_TICKERS = {};
const CHAIN_NAMES = {};
for (const [chain, cfg] of Object.entries(CHAIN_CONFIG)) {
  CHAIN_TICKERS[chain] = cfg.ticker;
  CHAIN_NAMES[chain] = cfg.name;
}

// Fetch current USD price for a chain
async function getChainPrice(chain) {
  const ticker = CHAIN_TICKERS[chain];
  if (!ticker) return 0;
  try {
    const data = await fetchYahooPrice(ticker);
    return data?.price || 0;
  } catch (e) {
    logger.error(`Failed to fetch price for ${chain}:`, e.message);
    return 0;
  }
}

// Sync a single wallet's balance
async function syncWalletBalance(wallet) {
  const fetcher = CHAIN_FETCHERS[wallet.chain];
  if (!fetcher) throw new Error(`Unsupported chain: ${wallet.chain}`);

  const balance = await fetcher(wallet.address);
  const now = new Date().toISOString();

  dbRun('UPDATE wallets SET balance = ?, last_synced = ? WHERE id = ?',
    [balance, now, wallet.id]);

  return { ...wallet, balance, last_synced: now };
}

// Get the user's default (or first) portfolio ID
function getUserPortfolioId(userId) {
  const portfolio = dbGet(
    'SELECT id FROM portfolios WHERE user_id = ? AND is_default = 1', [userId]
  );
  if (portfolio) return portfolio.id;
  // Fallback: first portfolio
  const first = dbGet('SELECT id FROM portfolios WHERE user_id = ? ORDER BY id LIMIT 1', [userId]);
  return first ? first.id : null;
}

const WALLET_SYNCED_NOTE = 'Auto-synced from on-chain wallet';

// Sync aggregated wallet balances into positions for a user
// chainBalances: { btc: 1.5, eth: 10.0, ... }
function syncPositionsFromWallets(userId, chainBalances) {
  const portfolioId = getUserPortfolioId(userId);
  if (!portfolioId) {
    logger.warn(`No portfolio found for user ${userId}, skipping position sync`);
    return [];
  }

  const updatedPositions = [];

  for (const [chain, totalBalance] of Object.entries(chainBalances)) {
    const symbol = CHAIN_TICKERS[chain];
    if (!symbol) continue;

    const existing = dbGet(
      'SELECT * FROM positions WHERE portfolio_id = ? AND symbol = ?',
      [portfolioId, symbol]
    );

    if (existing) {
      // Always update quantity and mark as wallet-synced (even if it was a manual position)
      const notes = `wallet-synced | ${WALLET_SYNCED_NOTE}`;
      dbRun(
        'UPDATE positions SET quantity = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [totalBalance, notes, existing.id]
      );
      updatedPositions.push({ id: existing.id, symbol, quantity: totalBalance, action: 'updated' });
    } else if (totalBalance > 0) {
      // Create new position
      const result = dbRun(
        `INSERT INTO positions (portfolio_id, symbol, quantity, entry_price, type, notes)
         VALUES (?, ?, ?, 0, 'crypto', ?)`,
        [portfolioId, symbol, totalBalance, `wallet-synced | ${WALLET_SYNCED_NOTE}`]
      );
      updatedPositions.push({ id: result.lastInsertRowid, symbol, quantity: totalBalance, action: 'created' });
    }
  }

  return updatedPositions;
}

// ---- On-chain transaction fetchers ----

// Block explorer URLs
const EXPLORER_TX = {
  btc:   'https://mempool.space/tx/',
  eth:   'https://etherscan.io/tx/',
  sol:   'https://solscan.io/tx/',
  bnb:   'https://bscscan.com/tx/',
  avax:  'https://snowtrace.io/tx/',
  matic: 'https://polygonscan.com/tx/',
  arb:   'https://arbiscan.io/tx/',
  op:    'https://optimistic.etherscan.io/tx/',
  ltc:   'https://blockchair.com/litecoin/transaction/',
  doge:  'https://blockchair.com/dogecoin/transaction/',
  xrp:   'https://xrpscan.com/tx/',
  ada:   'https://cardanoscan.io/transaction/',
  dot:   'https://subscan.io/extrinsic/',
};

async function fetchBtcTransactions(address, sinceBlockHeight = 0) {
  const url = `https://blockchain.info/rawaddr/${address}?limit=50`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    if (res.status === 429) throw new Error('Rate limited by blockchain.info, try again later');
    throw new Error(`BTC tx fetch failed: ${res.status}`);
  }
  const data = await res.json();
  const txs = data.txs || [];
  const addrLower = address.toLowerCase();

  const results = [];
  for (const tx of txs) {
    const blockHeight = tx.block_height || 0;
    if (blockHeight > 0 && blockHeight <= sinceBlockHeight) continue; // Already have this

    // Check if our address is in inputs (outgoing) or outputs (incoming)
    const isInInput = tx.inputs?.some(inp =>
      inp.prev_out?.addr?.toLowerCase() === addrLower
    );
    const outputToUs = tx.out?.filter(o => o.addr?.toLowerCase() === addrLower)
      .reduce((sum, o) => sum + (o.value || 0), 0) || 0;
    const inputFromUs = tx.inputs?.filter(inp => inp.prev_out?.addr?.toLowerCase() === addrLower)
      .reduce((sum, inp) => sum + (inp.prev_out?.value || 0), 0) || 0;

    let direction, amount, counterparty;
    if (isInInput) {
      direction = 'out';
      amount = (inputFromUs - outputToUs) / 1e8; // net outflow in BTC
      // counterparty is the first output that isn't us
      const otherOut = tx.out?.find(o => o.addr?.toLowerCase() !== addrLower);
      counterparty = otherOut?.addr || null;
    } else {
      direction = 'in';
      amount = outputToUs / 1e8;
      // counterparty is the first input
      counterparty = tx.inputs?.[0]?.prev_out?.addr || null;
    }

    if (amount <= 0) continue; // Skip zero-value

    const fee = (tx.fee || 0) / 1e8;
    const blockTime = tx.time ? new Date(tx.time * 1000).toISOString() : null;

    results.push({
      tx_hash: tx.hash,
      chain: 'btc',
      direction,
      amount: Math.abs(amount),
      fee,
      counterparty,
      block_height: blockHeight,
      block_time: blockTime,
    });
  }
  return results;
}

async function fetchEthTransactions(address, sinceBlockHeight = 0) {
  const startBlock = sinceBlockHeight > 0 ? sinceBlockHeight + 1 : 0;
  const apiKey = process.env.ETHERSCAN_API_KEY || '';
  let url = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=${startBlock}&endblock=99999999&sort=desc&page=1&offset=50`;
  if (apiKey) url += `&apikey=${apiKey}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`ETH tx fetch failed: ${res.status}`);
  const data = await res.json();

  if (data.status !== '1' && data.message !== 'OK' && data.message !== 'No transactions found') {
    if (data.result?.includes('rate limit')) throw new Error('Rate limited by Etherscan');
    // No transactions is OK
    if (data.message === 'No transactions found') return [];
    throw new Error(`Etherscan error: ${data.message || data.result}`);
  }

  const txList = data.result || [];
  if (!Array.isArray(txList)) return [];

  const addrLower = address.toLowerCase();
  const results = [];

  for (const tx of txList) {
    const fromLower = (tx.from || '').toLowerCase();
    const toLower = (tx.to || '').toLowerCase();
    const direction = fromLower === addrLower ? 'out' : 'in';
    const amount = parseInt(tx.value || '0', 10) / 1e18; // wei to ETH
    const fee = (parseInt(tx.gasUsed || '0', 10) * parseInt(tx.gasPrice || '0', 10)) / 1e18;
    const blockTime = tx.timeStamp ? new Date(parseInt(tx.timeStamp, 10) * 1000).toISOString() : null;
    const counterparty = direction === 'out' ? tx.to : tx.from;

    if (amount <= 0 && fee <= 0) continue;

    results.push({
      tx_hash: tx.hash,
      chain: 'eth',
      direction,
      amount: Math.abs(amount),
      fee,
      counterparty,
      block_height: parseInt(tx.blockNumber || '0', 10),
      block_time: blockTime,
    });
  }
  return results;
}

async function fetchSolTransactions(/* address, sinceBlockHeight */) {
  // SOL transaction history is complex — coming soon for MVP
  return [];
}

// Only BTC/ETH have tx history fetchers; new chains return empty arrays
async function fetchNoopTransactions() { return []; }

const CHAIN_TX_FETCHERS = {
  btc:   fetchBtcTransactions,
  eth:   fetchEthTransactions,
  sol:   fetchSolTransactions,
  bnb:   fetchNoopTransactions,
  avax:  fetchNoopTransactions,
  matic: fetchNoopTransactions,
  arb:   fetchNoopTransactions,
  op:    fetchNoopTransactions,
  ltc:   fetchNoopTransactions,
  doge:  fetchNoopTransactions,
  xrp:   fetchNoopTransactions,
  ada:   fetchNoopTransactions,
  dot:   fetchNoopTransactions,
};

// Fetch transactions from chain and store in DB, also create main app transactions
async function fetchAndStoreTransactions(wallet) {
  const fetcher = CHAIN_TX_FETCHERS[wallet.chain];
  if (!fetcher) return { fetched: 0, stored: 0, appTxCreated: 0 };

  // Get latest block_height we already have for this wallet
  const latest = dbGet(
    'SELECT MAX(block_height) as max_height FROM wallet_transactions WHERE wallet_id = ?',
    [wallet.id]
  );
  const sinceBlock = latest?.max_height || 0;

  const txs = await fetcher(wallet.address, sinceBlock);
  let stored = 0;
  let appTxCreated = 0;

  for (const tx of txs) {
    // Check if already stored (by unique constraint)
    const existing = dbGet(
      'SELECT id FROM wallet_transactions WHERE wallet_id = ? AND tx_hash = ?',
      [wallet.id, tx.tx_hash]
    );
    if (existing) continue;

    // Store in wallet_transactions
    dbRun(
      `INSERT INTO wallet_transactions (wallet_id, tx_hash, chain, direction, amount, fee, counterparty, block_height, block_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [wallet.id, tx.tx_hash, tx.chain, tx.direction, tx.amount, tx.fee, tx.counterparty, tx.block_height, tx.block_time]
    );
    stored++;

    // Auto-create main app transaction
    try {
      const noteTag = `wallet-tx:${tx.tx_hash}`;
      const existingAppTx = dbGet(
        'SELECT id FROM transactions WHERE notes = ?',
        [noteTag]
      );
      if (!existingAppTx) {
        const portfolioId = getUserPortfolioId(wallet.user_id);
        if (portfolioId) {
          const ticker = CHAIN_TICKERS[wallet.chain];
          const action = tx.direction === 'in' ? 'buy' : 'sell';
          // Try to get current price as fallback
          let price = 0;
          try {
            price = await getChainPrice(wallet.chain);
          } catch (e) {
            // Use 0 if price fetch fails
          }
          const executedAt = tx.block_time || new Date().toISOString();

          dbRun(
            `INSERT INTO transactions (portfolio_id, symbol, type, action, quantity, price, fees, notes, executed_at)
             VALUES (?, ?, 'crypto', ?, ?, ?, ?, ?, ?)`,
            [portfolioId, ticker, action, tx.amount, price, tx.fee || 0, noteTag, executedAt]
          );
          appTxCreated++;
        }
      }
    } catch (appTxErr) {
      logger.error(`Failed to create app transaction for ${tx.tx_hash}:`, appTxErr.message);
    }
  }

  return { fetched: txs.length, stored, appTxCreated };
}

// ---- Routes ----

// GET /wallets — list user's wallets
router.get('/', async (req, res) => {
  try {
    const wallets = dbAll('SELECT * FROM wallets WHERE user_id = ? ORDER BY chain, label', [req.user.id]);

    // Fetch prices for all chains present
    const chains = [...new Set(wallets.map(w => w.chain))];
    const prices = {};
    await Promise.all(chains.map(async (chain) => {
      prices[chain] = await getChainPrice(chain);
    }));

    // Enrich with USD value and tokens
    const enriched = wallets.map(w => {
      const nativeUsd = (w.balance || 0) * (prices[w.chain] || 0);
      const tokens = EVM_CHAINS.includes(w.chain) ? getWalletTokens(w.id) : [];
      const tokensUsd = tokens.reduce((sum, t) => sum + (t.usd_value || 0), 0);

      return {
        ...w,
        usd_value: nativeUsd + tokensUsd,
        native_usd_value: nativeUsd,
        tokens_usd_value: tokensUsd,
        chain_price: prices[w.chain] || 0,
        chain_name: CHAIN_NAMES[w.chain] || w.chain,
        tokens: tokens,
        token_count: tokens.length,
      };
    });

    res.json(enriched);
  } catch (error) {
    logger.error('Error listing wallets:', error);
    res.status(500).json({ error: 'Failed to list wallets' });
  }
});

// POST /wallets — add wallet
router.post('/', walletValidation, (req, res) => {
  try {
    const { chain, address, label } = req.body;

    // Check for duplicate
    const existing = dbGet(
      'SELECT * FROM wallets WHERE user_id = ? AND chain = ? AND address = ?',
      [req.user.id, chain, address]
    );
    if (existing) {
      return res.status(400).json({ error: 'Wallet already added' });
    }

    const result = dbRun(
      'INSERT INTO wallets (user_id, chain, address, label) VALUES (?, ?, ?, ?)',
      [req.user.id, chain, address, label || null]
    );

    res.json({
      id: result.lastInsertRowid,
      user_id: req.user.id,
      chain,
      address,
      label: label || null,
      balance: 0,
      last_synced: null,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error adding wallet:', error);
    res.status(500).json({ error: 'Failed to add wallet' });
  }
});

// DELETE /wallets/:id — remove wallet
router.delete('/:id', idParamValidation, (req, res) => {
  try {
    const { id } = req.params;

    const wallet = dbGet('SELECT * FROM wallets WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const deletedChain = wallet.chain;
    const deletedUserId = wallet.user_id;

    dbRun('DELETE FROM wallet_tokens WHERE wallet_id = ?', [id]);
    dbRun('DELETE FROM wallet_transactions WHERE wallet_id = ?', [id]);
    dbRun('DELETE FROM wallets WHERE id = ?', [id]);

    // Position cleanup: check if other wallets remain for this chain
    const remainingWallets = dbAll(
      'SELECT * FROM wallets WHERE user_id = ? AND chain = ?',
      [deletedUserId, deletedChain]
    );

    const symbol = CHAIN_TICKERS[deletedChain];
    const portfolioId = getUserPortfolioId(deletedUserId);

    if (symbol && portfolioId) {
      if (remainingWallets.length === 0) {
        // No more wallets for this chain — delete the wallet-synced position
        dbRun(
          "DELETE FROM positions WHERE portfolio_id = ? AND symbol = ? AND notes LIKE '%wallet-synced%'",
          [portfolioId, symbol]
        );
      } else {
        // Recalculate position quantity from remaining wallet balances
        const totalBalance = remainingWallets.reduce((sum, w) => sum + (w.balance || 0), 0);
        syncPositionsFromWallets(deletedUserId, { [deletedChain]: totalBalance });
      }
    }

    res.json({ message: 'Wallet deleted' });
  } catch (error) {
    logger.error('Error deleting wallet:', error);
    res.status(500).json({ error: 'Failed to delete wallet' });
  }
});

// POST /wallets/:id/sync — sync single wallet
router.post('/:id/sync', idParamValidation, async (req, res) => {
  try {
    const { id } = req.params;

    const wallet = dbGet('SELECT * FROM wallets WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const updated = await syncWalletBalance(wallet);
    const price = await getChainPrice(wallet.chain);

    // Also fetch new transactions during manual sync
    let txResult = { fetched: 0, stored: 0, appTxCreated: 0 };
    try {
      txResult = await fetchAndStoreTransactions(wallet);
    } catch (txErr) {
      logger.error(`Tx fetch during sync failed for wallet ${wallet.id}:`, txErr.message);
    }

    // Sync ERC-20 tokens for EVM wallets
    let tokenResult = [];
    if (EVM_CHAINS.includes(wallet.chain)) {
      try {
        tokenResult = await syncWalletTokens(wallet);
      } catch (tokenErr) {
        logger.error(`Token sync during manual sync failed for wallet ${wallet.id}:`, tokenErr.message);
      }
    }

    // After syncing this wallet, aggregate all balances for this chain and sync position
    const allWalletsForChain = dbAll(
      'SELECT * FROM wallets WHERE user_id = ? AND chain = ?',
      [req.user.id, wallet.chain]
    );
    const totalBalance = allWalletsForChain.reduce((sum, w) => sum + (w.balance || 0), 0);
    const positionUpdates = syncPositionsFromWallets(req.user.id, { [wallet.chain]: totalBalance });

    const tokens = getWalletTokens(wallet.id);
    const tokensUsd = tokens.reduce((sum, t) => sum + (t.usd_value || 0), 0);
    const nativeUsd = (updated.balance || 0) * price;

    res.json({
      ...updated,
      usd_value: nativeUsd + tokensUsd,
      native_usd_value: nativeUsd,
      tokens_usd_value: tokensUsd,
      chain_price: price,
      chain_name: CHAIN_NAMES[wallet.chain] || wallet.chain,
      tokens: tokens,
      token_count: tokens.length,
      position_sync: positionUpdates,
      transactions: txResult,
      token_sync: { synced: tokenResult.length },
    });
  } catch (error) {
    logger.error(`Error syncing wallet ${req.params.id}:`, error);
    res.status(500).json({ error: `Sync failed: ${error.message}` });
  }
});

// POST /wallets/sync-all — sync all wallets
router.post('/sync-all', async (req, res) => {
  try {
    const wallets = dbAll('SELECT * FROM wallets WHERE user_id = ?', [req.user.id]);

    if (wallets.length === 0) {
      return res.json({ synced: 0, wallets: [], position_sync: [] });
    }

    const results = [];
    const errors = [];

    for (const wallet of wallets) {
      try {
        const updated = await syncWalletBalance(wallet);
        // Also fetch new transactions
        try {
          await fetchAndStoreTransactions(wallet);
        } catch (txErr) {
          logger.error(`Tx fetch during sync-all failed for wallet ${wallet.id}:`, txErr.message);
        }
        // Sync ERC-20 tokens for EVM wallets
        if (EVM_CHAINS.includes(wallet.chain)) {
          try {
            await syncWalletTokens(wallet);
          } catch (tokenErr) {
            logger.error(`Token sync during sync-all failed for wallet ${wallet.id}:`, tokenErr.message);
          }
        }
        results.push(updated);
      } catch (e) {
        logger.error(`Sync failed for wallet ${wallet.id} (${wallet.chain}:${wallet.address}):`, e.message);
        errors.push({ id: wallet.id, chain: wallet.chain, address: wallet.address, error: e.message });
        results.push(wallet); // Keep old data
      }
    }

    // Fetch prices
    const chains = [...new Set(wallets.map(w => w.chain))];
    const prices = {};
    await Promise.all(chains.map(async (chain) => {
      prices[chain] = await getChainPrice(chain);
    }));

    const enriched = results.map(w => {
      const nativeUsd = (w.balance || 0) * (prices[w.chain] || 0);
      const tokens = EVM_CHAINS.includes(w.chain) ? getWalletTokens(w.id) : [];
      const tokensUsd = tokens.reduce((sum, t) => sum + (t.usd_value || 0), 0);

      return {
        ...w,
        usd_value: nativeUsd + tokensUsd,
        native_usd_value: nativeUsd,
        tokens_usd_value: tokensUsd,
        chain_price: prices[w.chain] || 0,
        chain_name: CHAIN_NAMES[w.chain] || w.chain,
        tokens: tokens,
        token_count: tokens.length,
      };
    });

    // Aggregate balances by chain and sync into positions
    const chainBalances = {};
    for (const w of results) {
      chainBalances[w.chain] = (chainBalances[w.chain] || 0) + (w.balance || 0);
    }
    const positionUpdates = syncPositionsFromWallets(req.user.id, chainBalances);

    res.json({
      synced: results.length - errors.length,
      total: wallets.length,
      errors: errors.length > 0 ? errors : undefined,
      wallets: enriched,
      position_sync: positionUpdates,
    });
  } catch (error) {
    logger.error('Error syncing all wallets:', error);
    res.status(500).json({ error: 'Failed to sync wallets' });
  }
});

// GET /wallets/summary — total on-chain value by chain
router.get('/summary', async (req, res) => {
  try {
    const wallets = dbAll('SELECT * FROM wallets WHERE user_id = ?', [req.user.id]);

    // Get prices for all chains
    const chains = [...new Set(wallets.map(w => w.chain))];
    const prices = {};
    await Promise.all(chains.map(async (chain) => {
      prices[chain] = await getChainPrice(chain);
    }));

    // Aggregate by chain
    const byChain = {};
    let totalUsd = 0;
    let totalTokensUsd = 0;

    for (const w of wallets) {
      const price = prices[w.chain] || 0;
      const nativeUsd = (w.balance || 0) * price;
      const tokens = EVM_CHAINS.includes(w.chain) ? getWalletTokens(w.id) : [];
      const tokensUsd = tokens.reduce((sum, t) => sum + (t.usd_value || 0), 0);
      const walletTotalUsd = nativeUsd + tokensUsd;

      if (!byChain[w.chain]) {
        byChain[w.chain] = {
          chain: w.chain,
          chain_name: CHAIN_NAMES[w.chain] || w.chain,
          total_balance: 0,
          total_usd: 0,
          total_tokens_usd: 0,
          chain_price: price,
          wallet_count: 0,
          token_count: 0,
        };
      }

      byChain[w.chain].total_balance += w.balance || 0;
      byChain[w.chain].total_usd += walletTotalUsd;
      byChain[w.chain].total_tokens_usd += tokensUsd;
      byChain[w.chain].wallet_count++;
      byChain[w.chain].token_count += tokens.length;
      totalUsd += walletTotalUsd;
      totalTokensUsd += tokensUsd;
    }

    res.json({
      total_usd: totalUsd,
      total_tokens_usd: totalTokensUsd,
      by_chain: Object.values(byChain),
      wallet_count: wallets.length,
    });
  } catch (error) {
    logger.error('Error getting wallet summary:', error);
    res.status(500).json({ error: 'Failed to get wallet summary' });
  }
});

// POST /wallets/:id/fetch-transactions — fetch and store chain transactions for a wallet
router.post('/:id/fetch-transactions', idParamValidation, async (req, res) => {
  try {
    const { id } = req.params;

    const wallet = dbGet('SELECT * FROM wallets WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    if (wallet.chain === 'sol') {
      return res.json({
        message: 'SOL transaction history coming soon',
        fetched: 0,
        stored: 0,
        appTxCreated: 0,
      });
    }

    const result = await fetchAndStoreTransactions(wallet);
    res.json({
      message: `Fetched ${result.fetched} transactions, stored ${result.stored} new, created ${result.appTxCreated} app transactions`,
      ...result,
    });
  } catch (error) {
    logger.error(`Error fetching transactions for wallet ${req.params.id}:`, error);
    res.status(500).json({ error: `Failed to fetch transactions: ${error.message}` });
  }
});

// GET /wallets/:id/transactions — list stored transactions for a wallet
router.get('/:id/transactions', idParamValidation, async (req, res) => {
  try {
    const { id } = req.params;

    const wallet = dbGet('SELECT * FROM wallets WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;

    const txs = dbAll(
      `SELECT * FROM wallet_transactions WHERE wallet_id = ? ORDER BY block_time DESC, id DESC LIMIT ? OFFSET ?`,
      [id, limit, offset]
    );

    const total = dbGet('SELECT COUNT(*) as count FROM wallet_transactions WHERE wallet_id = ?', [id]);

    res.json({
      transactions: txs,
      total: total?.count || 0,
      wallet_chain: wallet.chain,
      explorer_base: EXPLORER_TX[wallet.chain] || '',
    });
  } catch (error) {
    logger.error(`Error listing transactions for wallet ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to list wallet transactions' });
  }
});

// GET /wallets/:id/tokens — dedicated endpoint for token list
router.get('/:id/tokens', idParamValidation, async (req, res) => {
  try {
    const { id } = req.params;

    const wallet = dbGet('SELECT * FROM wallets WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    if (!EVM_CHAINS.includes(wallet.chain)) {
      return res.json({ tokens: [], message: 'Token tracking only available for EVM chains' });
    }

    const tokens = getWalletTokens(wallet.id);
    const totalUsd = tokens.reduce((sum, t) => sum + (t.usd_value || 0), 0);

    res.json({
      tokens,
      total_usd: totalUsd,
      token_count: tokens.length,
      wallet_chain: wallet.chain,
    });
  } catch (error) {
    logger.error(`Error listing tokens for wallet ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to list wallet tokens' });
  }
});

// POST /wallets/:id/sync-tokens — sync tokens only (without full wallet sync)
router.post('/:id/sync-tokens', idParamValidation, async (req, res) => {
  try {
    const { id } = req.params;

    const wallet = dbGet('SELECT * FROM wallets WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    if (!EVM_CHAINS.includes(wallet.chain)) {
      return res.json({ tokens: [], message: 'Token tracking only available for EVM chains' });
    }

    const syncResult = await syncWalletTokens(wallet);
    const tokens = getWalletTokens(wallet.id);
    const totalUsd = tokens.reduce((sum, t) => sum + (t.usd_value || 0), 0);

    res.json({
      tokens,
      total_usd: totalUsd,
      token_count: tokens.length,
      synced: syncResult.length,
    });
  } catch (error) {
    logger.error(`Error syncing tokens for wallet ${req.params.id}:`, error);
    res.status(500).json({ error: `Token sync failed: ${error.message}` });
  }
});

module.exports = router;
module.exports.startAutoSync = startAutoSync;
