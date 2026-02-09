const express = require('express');
const { dbRun, dbGet, dbAll } = require('../db');
const { idParamValidation } = require('../validators/portfolio');
const { body, validationResult } = require('express-validator');
const { fetchYahooPrice } = require('../utils/yahoo');
const { logger } = require('../utils/logger');

const router = express.Router();

// ---- EVM chains that support ERC-20 tokens ----
const EVM_CHAINS = ['eth', 'bnb', 'avax', 'matic', 'arb', 'op'];

// ---- Chains that support token tracking (EVM + Solana SPL) ----
const TOKEN_CHAINS = ['eth', 'bnb', 'avax', 'matic', 'arb', 'op', 'sol'];

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

// ---- Top SPL tokens to check (Solana) ----
const POPULAR_SPL = [
  { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  { mint: 'So11111111111111111111111111111111111111112', symbol: 'WSOL', name: 'Wrapped SOL', decimals: 9 },
  { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', name: 'Jupiter', decimals: 6 },
  { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK', name: 'Bonk', decimals: 5 },
  { mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', symbol: 'WIF', name: 'dogwifhat', decimals: 6 },
  { mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', symbol: 'WETH', name: 'Wrapped ETH (Wormhole)', decimals: 8 },
  { mint: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh', symbol: 'WBTC', name: 'Wrapped BTC (Wormhole)', decimals: 8 },
  { mint: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', symbol: 'PYTH', name: 'Pyth Network', decimals: 6 },
  { mint: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', symbol: 'RENDER', name: 'Render Token', decimals: 8 },
  { mint: 'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux', symbol: 'HNT', name: 'Helium', decimals: 8 },
  { mint: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', symbol: 'JTO', name: 'Jito', decimals: 9 },
  { mint: 'METAewgxyPbgwsseH8T16a39CQ5VyVxZi9zXiDPY18m', symbol: 'MPLX', name: 'Metaplex', decimals: 6 },
  { mint: 'RLBxxFkseAZ4RgJH3Sqn8jXxhmGoz9jWxDNJMh8pL7a', symbol: 'RLBB', name: 'Rollbit', decimals: 2 },
];

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

// ---- DeFi protocol tokens (Aave aTokens, Compound cTokens, Liquid Staking) ----
const DEFI_TOKENS = [
  // Aave v2 aTokens
  { contract: '0xbcca60bb61934080951369a648fb03df4f96263c6', symbol: 'aUSDC', name: 'Aave USDC', decimals: 6, protocol: 'Aave', underlying: 'USDC' },
  { contract: '0x3ed3b47dd13ec9a98b44e6204a523e766b225811', symbol: 'aUSDT', name: 'Aave USDT', decimals: 6, protocol: 'Aave', underlying: 'USDT' },
  { contract: '0x030ba81f1c18d280636f32af80b9aad02cf0854e', symbol: 'aWETH', name: 'Aave WETH', decimals: 18, protocol: 'Aave', underlying: 'WETH' },
  { contract: '0x028171bca77440897b824ca71d1c56cac55b68a3', symbol: 'aDAI', name: 'Aave DAI', decimals: 18, protocol: 'Aave', underlying: 'DAI' },
  // Compound cTokens
  { contract: '0x39aa39c021dfbae8fac545936693ac917d5e7563', symbol: 'cUSDC', name: 'Compound USDC', decimals: 8, protocol: 'Compound', underlying: 'USDC' },
  { contract: '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5', symbol: 'cETH', name: 'Compound ETH', decimals: 8, protocol: 'Compound', underlying: 'ETH' },
  { contract: '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643', symbol: 'cDAI', name: 'Compound DAI', decimals: 8, protocol: 'Compound', underlying: 'DAI' },
  // Liquid staking
  { contract: '0xae78736cd615f374d3085123a210448e74fc6393', symbol: 'rETH', name: 'Rocket Pool ETH', decimals: 18, protocol: 'Rocket Pool', underlying: 'ETH' },
];

// Map DeFi token contracts to their protocol for quick lookup
const DEFI_CONTRACT_MAP = {};
for (const dt of DEFI_TOKENS) {
  DEFI_CONTRACT_MAP[dt.contract.toLowerCase()] = dt;
}

// Identify staking protocol tokens already in POPULAR_ERC20
const STAKING_SYMBOLS = {
  'stETH': { protocol: 'Lido', underlying: 'ETH' },
  'cbETH': { protocol: 'Coinbase', underlying: 'ETH' },
};

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

// Discover tokens by checking popular ERC-20 + DeFi token balances via RPC
async function fetchErc20Tokens(address) {
  const found = [];

  // Combine POPULAR_ERC20 + DEFI_TOKENS for a single scan pass
  const allTokensToCheck = [
    ...POPULAR_ERC20.map(t => ({ ...t, protocol: STAKING_SYMBOLS[t.symbol]?.protocol || null, underlying: STAKING_SYMBOLS[t.symbol]?.underlying || null })),
    ...DEFI_TOKENS,
  ];

  // Deduplicate by contract address (in case of overlap)
  const seen = new Set();
  const uniqueTokens = [];
  for (const t of allTokensToCheck) {
    const key = t.contract.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueTokens.push(t);
    }
  }

  // Check all tokens in parallel (batches of 5)
  for (let i = 0; i < uniqueTokens.length; i += 5) {
    const batch = uniqueTokens.slice(i, i + 5);
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
    if (i + 5 < uniqueTokens.length) await new Promise(r => setTimeout(r, 200));
  }
  return found;
}

// Fetch a single ERC-20 token balance via RPC
async function fetchErc20Balance(address, contractAddress) {
  return fetchErc20BalanceRPC(address, contractAddress);
}

// ---- SPL token fetching (Solana) ----

// Fetch all SPL token accounts for a Solana wallet (single RPC call)
async function fetchSplTokenAccounts(address) {
  try {
    const res = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          address,
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { encoding: 'jsonParsed' }
        ]
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      logger.error(`Solana RPC getTokenAccountsByOwner failed: ${res.status}`);
      return [];
    }
    const data = await res.json();
    if (data.error) {
      logger.error(`Solana RPC error: ${data.error.message}`);
      return [];
    }
    return data.result?.value || [];
  } catch (e) {
    logger.error(`SPL token fetch failed for ${address}:`, e.message);
    return [];
  }
}

// Discover SPL tokens with non-zero balances, matching against POPULAR_SPL
async function fetchSplTokens(address) {
  const accounts = await fetchSplTokenAccounts(address);
  const found = [];

  // Build lookup by mint address
  const splLookup = {};
  for (const tok of POPULAR_SPL) {
    splLookup[tok.mint] = tok;
  }

  for (const account of accounts) {
    try {
      const info = account.account?.data?.parsed?.info;
      if (!info) continue;

      const mint = info.mint;
      const tokenAmount = info.tokenAmount;
      if (!tokenAmount || tokenAmount.uiAmount === 0 || tokenAmount.amount === '0') continue;

      // Match against popular tokens for symbol/name
      const known = splLookup[mint];
      const symbol = known?.symbol || null;
      const name = known?.name || null;
      const decimals = tokenAmount.decimals || (known?.decimals ?? 0);

      // Only include known tokens (skip unknown mints to avoid noise)
      if (!known) continue;

      found.push({
        contract_address: mint, // Use mint as contract_address for DB compatibility
        symbol,
        name,
        decimals,
        balance_raw: tokenAmount.amount,
      });
    } catch (e) {
      logger.error(`Error parsing SPL token account:`, e.message);
    }
  }

  return found;
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
  // SPL tokens (Solana)
  'WSOL': 'SOL-USD', 'JUP': 'JUP-USD', 'BONK': 'BONK-USD',
  'WIF': 'WIF-USD', 'PYTH': 'PYTH-USD', 'RENDER': 'RNDR-USD',
  'HNT': 'HNT-USD', 'JTO': 'JTO-USD', 'MPLX': 'MPLX-USD',
  // DeFi tokens — priced via their underlying asset
  'aUSDC': 'USDC-USD', 'aUSDT': 'USDT-USD', 'aWETH': 'WETH-USD', 'aDAI': 'DAI-USD',
  'cUSDC': 'USDC-USD', 'cETH': 'ETH-USD', 'cDAI': 'DAI-USD',
  'rETH': 'RETH-USD',
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
        // Use contract_address as-is (SPL mints are case-sensitive base58)
        prices[token.contract_address] = quote.price;
      }
    } catch (e) {
      logger.error(`Yahoo price fetch for ${token.symbol}:`, e.message);
    }
  }

  return prices;
}

// Full token sync for a single wallet (ERC-20 for ETH, SPL for SOL)
async function syncWalletTokens(wallet) {
  if (!TOKEN_CHAINS.includes(wallet.chain)) return [];

  try {
    // 1. Discover tokens with non-zero balances
    let discoveredTokens;
    if (wallet.chain === 'sol') {
      discoveredTokens = await fetchSplTokens(wallet.address);
    } else {
      discoveredTokens = await fetchErc20Tokens(wallet.address);
    }
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

      // Determine protocol label
      const protocol = token.protocol || DEFI_CONTRACT_MAP[token.contract_address?.toLowerCase()]?.protocol || STAKING_SYMBOLS[token.symbol]?.protocol || null;

      // Upsert
      const existing = dbGet(
        'SELECT id FROM wallet_tokens WHERE wallet_id = ? AND contract_address = ?',
        [wallet.id, token.contract_address]
      );

      if (existing) {
        dbRun(
          `UPDATE wallet_tokens SET symbol = ?, name = ?, decimals = ?, balance = ?, usd_value = ?, protocol = ?, last_synced = ? WHERE id = ?`,
          [token.symbol, token.name, token.decimals, token.balance, usdValue, protocol, now, existing.id]
        );
      } else {
        dbRun(
          `INSERT INTO wallet_tokens (wallet_id, contract_address, symbol, name, decimals, balance, usd_value, protocol, last_synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [wallet.id, token.contract_address, token.symbol, token.name, token.decimals, token.balance, usdValue, protocol, now]
        );
      }

      results.push({
        contract_address: token.contract_address,
        symbol: token.symbol,
        name: token.name,
        balance: token.balance,
        usd_value: usdValue,
        protocol: protocol,
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
          // Sync tokens for supported chains during auto-sync (EVM + SOL)
          if (TOKEN_CHAINS.includes(wallet.chain)) {
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
          syncTokenPositionsFromWallets(userId);
        } catch (err) {
          logger.error(`Auto-sync position update failed for user ${userId}:`, err.message);
        }
      }

      logger.info(`Auto-sync: synced ${synced} wallets`);
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

// Chain-specific address validation functions
function validateBtcAddress(address) {
  // Bitcoin: starts with 1, 3, or bc1 (base58check or bech32)
  const base58Regex = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
  const bech32Regex = /^bc1[02-9ac-hj-np-z]{7,87}$/;
  return base58Regex.test(address) || bech32Regex.test(address);
}

function validateEvmAddress(address) {
  // EVM chains: 0x + 40 hex chars (42 total)
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function validateSolAddress(address) {
  // Solana: base58, 32-44 chars
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address);
}

function validateLtcAddress(address) {
  // Litecoin: starts with L, M, or ltc1
  const legacyRegex = /^[LM][a-km-zA-HJ-NP-Z1-9]{26,33}$/;
  const bech32Regex = /^ltc1[02-9ac-hj-np-z]{7,87}$/;
  return legacyRegex.test(address) || bech32Regex.test(address);
}

function validateDogeAddress(address) {
  // Dogecoin: starts with D
  return /^D[5-9A-HJ-NP-U][1-9A-HJ-NP-Za-km-z]{32}$/.test(address);
}

function validateXrpAddress(address) {
  // XRP: starts with r, 25-35 chars
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address);
}

function validateAdaAddress(address) {
  // Cardano: starts with addr1
  return /^addr1[02-9ac-hj-np-z]{7,103}$/.test(address);
}

function validateDotAddress(address) {
  // Polkadot: starts with 1, 25-48 chars
  return /^1[a-km-zA-HJ-NP-Z1-9]{24,47}$/.test(address);
}

// Address validation mapping
const ADDRESS_VALIDATORS = {
  btc: validateBtcAddress,
  eth: validateEvmAddress,
  bnb: validateEvmAddress,
  avax: validateEvmAddress,
  matic: validateEvmAddress,
  arb: validateEvmAddress,
  op: validateEvmAddress,
  sol: validateSolAddress,
  ltc: validateLtcAddress,
  doge: validateDogeAddress,
  xrp: validateXrpAddress,
  ada: validateAdaAddress,
  dot: validateDotAddress,
};

// Custom validator that checks chain-specific address format
function validateChainAddress(address, { req }) {
  const chain = req.body.chain;
  if (!chain) return false;
  
  const validator = ADDRESS_VALIDATORS[chain];
  if (!validator) return false;
  
  if (!validator(address)) {
    const chainName = CHAIN_NAMES[chain] || chain.toUpperCase();
    const examples = {
      btc: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa or bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      eth: '0x742d35Cc6639C0532fBa96F4a92b0D9b8F7b5b7',
      bnb: '0x742d35Cc6639C0532fBa96F4a92b0D9b8F7b5b7',
      avax: '0x742d35Cc6639C0532fBa96F4a92b0D9b8F7b5b7',
      matic: '0x742d35Cc6639C0532fBa96F4a92b0D9b8F7b5b7',
      arb: '0x742d35Cc6639C0532fBa96F4a92b0D9b8F7b5b7',
      op: '0x742d35Cc6639C0532fBa96F4a92b0D9b8F7b5b7',
      sol: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      ltc: 'LdP8Qox1VAhCzLJNqrr74YovaWYyNBUWvL or ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      doge: 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L',
      xrp: 'rDfNhYvC2TmFyJ4BFqwbVHDyVGvF7j1M2',
      ada: 'addr1qxy3rsdp8g7qvs9z8w6z8m3j6x9q5v8n7m6k5j4h3g2f1e9d8c7b6a5',
      dot: '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5',
    };
    throw new Error(`Invalid ${chainName} address format. Example: ${examples[chain] || 'please check the address format'}`);
  }
  
  return true;
}

const walletValidation = [
  body('chain')
    .trim()
    .toLowerCase()
    .isIn(ALL_CHAINS)
    .withMessage(`Chain must be one of: ${ALL_CHAINS.join(', ')}`),
  body('address')
    .trim()
    .isLength({ min: 20, max: 128 })
    .withMessage('Address must be 20-128 characters')
    .custom(validateChainAddress),
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

    // First try wallet-synced position, then fall back to any position (upgrade manual → wallet)
    const existing = dbGet(
      "SELECT * FROM positions WHERE portfolio_id = ? AND symbol = ?",
      [portfolioId, symbol]
    );

    if (existing) {
      const notes = `wallet-synced | ${WALLET_SYNCED_NOTE}`;
      const wasManual = existing.source === 'manual';
      dbRun(
        "UPDATE positions SET quantity = ?, notes = ?, source = 'wallet', location = COALESCE(?, location), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [totalBalance, notes, wasManual ? 'On-Chain Wallet' : null, existing.id]
      );
      updatedPositions.push({ id: existing.id, symbol, quantity: totalBalance, action: wasManual ? 'upgraded' : 'updated' });
    } else if (totalBalance > 0) {
      const result = dbRun(
        `INSERT INTO positions (portfolio_id, symbol, quantity, entry_price, type, notes, source, location)
         VALUES (?, ?, ?, 0, 'crypto', ?, 'wallet', 'On-Chain Wallet')`,
        [portfolioId, symbol, totalBalance, `wallet-synced | ${WALLET_SYNCED_NOTE}`]
      );
      updatedPositions.push({ id: result.lastInsertRowid, symbol, quantity: totalBalance, action: 'created' });
    }
  }

  return updatedPositions;
}

// Sync ERC-20 token balances into positions for a user
// Aggregates tokens across all wallets by symbol
function syncTokenPositionsFromWallets(userId) {
  const portfolioId = getUserPortfolioId(userId);
  if (!portfolioId) return [];

  // Get all token balances across all user's wallets
  const userWallets = dbAll('SELECT id FROM wallets WHERE user_id = ?', [userId]);
  if (!userWallets.length) return [];

  const walletIds = userWallets.map(w => w.id);
  const placeholders = walletIds.map(() => '?').join(',');
  const allTokens = dbAll(
    `SELECT symbol, SUM(CAST(balance AS REAL)) as total_balance, SUM(usd_value) as total_usd
     FROM wallet_tokens WHERE wallet_id IN (${placeholders}) AND CAST(balance AS REAL) > 0
     GROUP BY UPPER(symbol)`,
    walletIds
  );

  const updatedPositions = [];
  const WALLET_TOKEN_NOTE = 'wallet-synced | erc20-token';

  for (const token of allTokens) {
    // Map token symbol to Yahoo ticker (e.g. LINK → LINK-USD)
    const symbol = `${token.symbol.toUpperCase()}-USD`;
    const totalBalance = token.total_balance || 0;
    if (totalBalance <= 0) continue;

    // Skip stablecoins as positions (they're just cash equivalents)
    if (['USDT', 'USDC', 'DAI'].includes(token.symbol.toUpperCase())) continue;

    // Look for any existing position (wallet or manual — wallet upgrades manual)
    const existing = dbGet(
      "SELECT * FROM positions WHERE portfolio_id = ? AND symbol = ?",
      [portfolioId, symbol]
    );

    if (existing) {
      const wasManual = existing.source === 'manual';
      dbRun(
        "UPDATE positions SET quantity = ?, notes = ?, source = 'wallet', location = COALESCE(?, location), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [totalBalance, WALLET_TOKEN_NOTE, wasManual ? 'On-Chain Wallet' : null, existing.id]
      );
      updatedPositions.push({ id: existing.id, symbol, quantity: totalBalance, action: wasManual ? 'upgraded' : 'updated' });
    } else {
      try {
        const result = dbRun(
          `INSERT INTO positions (portfolio_id, symbol, quantity, entry_price, type, notes, source, location)
           VALUES (?, ?, ?, 0, 'crypto', ?, 'wallet', 'On-Chain Wallet')`,
          [portfolioId, symbol, totalBalance, WALLET_TOKEN_NOTE]
        );
        updatedPositions.push({ id: result.lastInsertRowid, symbol, quantity: totalBalance, action: 'created' });
      } catch (e) {
        logger.info(`Failed to create wallet token position for ${symbol}: ${e.message}`);
      }
    }
  }

  // Clean up: remove wallet-synced token positions where all wallets no longer hold that token
  const existingTokenPositions = dbAll(
    "SELECT * FROM positions WHERE portfolio_id = ? AND source = 'wallet' AND notes LIKE '%erc20-token%'",
    [portfolioId]
  );
  for (const pos of existingTokenPositions) {
    const stillHeld = allTokens.find(t => `${t.symbol.toUpperCase()}-USD` === pos.symbol && t.total_balance > 0);
    if (!stillHeld) {
      // Convert back to manual instead of deleting — user keeps last known quantity
      dbRun(
        "UPDATE positions SET source = 'manual', notes = 'Formerly on-chain token — no longer held in wallet', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [pos.id]
      );
      updatedPositions.push({ id: pos.id, symbol: pos.symbol, action: 'converted_to_manual' });
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
            `INSERT INTO transactions (portfolio_id, symbol, type, action, quantity, price, fees, notes, executed_at, source, location)
             VALUES (?, ?, 'crypto', ?, ?, ?, ?, ?, ?, 'wallet', 'On-Chain')`,
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
      const tokens = TOKEN_CHAINS.includes(w.chain) ? getWalletTokens(w.id) : [];
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
router.post('/', walletValidation, async (req, res) => {
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

    const newWallet = {
      id: result.lastInsertRowid,
      user_id: req.user.id,
      chain,
      address,
      label: label || null,
      balance: 0,
      last_synced: null,
      created_at: new Date().toISOString(),
    };

    // Auto-sync balance and create position immediately after adding
    try {
      const updated = await syncWalletBalance(newWallet);
      newWallet.balance = updated.balance;
      newWallet.last_synced = updated.last_synced;

      // Sync tokens for supported chains
      if (TOKEN_CHAINS.includes(chain)) {
        try { await syncWalletTokens(newWallet); } catch (e) { logger.error('Token sync on add failed:', e.message); }
      }

      // Aggregate all wallets for this chain and sync position
      const allWalletsForChain = dbAll('SELECT * FROM wallets WHERE user_id = ? AND chain = ?', [req.user.id, chain]);
      const totalBalance = allWalletsForChain.reduce((sum, w) => sum + (w.balance || 0), 0);
      syncPositionsFromWallets(req.user.id, { [chain]: totalBalance });
      syncTokenPositionsFromWallets(req.user.id);

      // Fetch transactions
      try { await fetchAndStoreTransactions(newWallet); } catch (e) { logger.error('Tx fetch on add failed:', e.message); }
    } catch (syncErr) {
      logger.error('Auto-sync on wallet add failed:', syncErr.message);
      // Still return the wallet — user can manually sync later
    }

    const price = await getChainPrice(chain).catch(() => 0);
    const tokens = TOKEN_CHAINS.includes(chain) ? getWalletTokens(newWallet.id) : [];
    const tokensUsd = tokens.reduce((sum, t) => sum + (t.usd_value || 0), 0);
    const nativeUsd = (newWallet.balance || 0) * price;

    res.json({
      ...newWallet,
      usd_value: nativeUsd + tokensUsd,
      chain_price: price,
      chain_name: CHAIN_NAMES[chain] || chain.toUpperCase(),
      tokens,
      token_count: tokens.length,
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
        // No more wallets for this chain — convert wallet position back to manual (don't delete)
        dbRun(
          "UPDATE positions SET source = 'manual', notes = 'Converted from wallet — wallet disconnected', updated_at = CURRENT_TIMESTAMP WHERE portfolio_id = ? AND symbol = ? AND source = 'wallet'",
          [portfolioId, symbol]
        );

        // Check if the user has ANY wallets remaining at all
        const anyWalletsLeft = dbGet('SELECT COUNT(*) as cnt FROM wallets WHERE user_id = ?', [deletedUserId]);
        if (!anyWalletsLeft || anyWalletsLeft.cnt === 0) {
          // No wallets at all — convert ALL wallet-synced positions (including tokens) back to manual
          dbRun(
            "UPDATE positions SET source = 'manual', notes = 'Converted from wallet — all wallets disconnected', updated_at = CURRENT_TIMESTAMP WHERE portfolio_id = ? AND source = 'wallet'",
            [portfolioId]
          );
        }
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

    // Sync tokens for supported chains (EVM + SOL)
    let tokenResult = [];
    if (TOKEN_CHAINS.includes(wallet.chain)) {
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
    syncTokenPositionsFromWallets(req.user.id);

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
        // Sync tokens for supported chains (EVM + SOL)
        if (TOKEN_CHAINS.includes(wallet.chain)) {
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
      const tokens = TOKEN_CHAINS.includes(w.chain) ? getWalletTokens(w.id) : [];
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
    const tokenPositionUpdates = syncTokenPositionsFromWallets(req.user.id);

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
      const tokens = TOKEN_CHAINS.includes(w.chain) ? getWalletTokens(w.id) : [];
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

    if (!TOKEN_CHAINS.includes(wallet.chain)) {
      return res.json({ tokens: [], message: 'Token tracking only available for EVM and Solana chains' });
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

    if (!TOKEN_CHAINS.includes(wallet.chain)) {
      return res.json({ tokens: [], message: 'Token tracking only available for EVM and Solana chains' });
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
