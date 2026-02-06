#!/usr/bin/env node

/**
 * Standalone data collection script
 * 
 * Usage:
 *   node server/scripts/collect-data.js                  # Collect both prices and snapshots
 *   node server/scripts/collect-data.js --prices-only     # Only collect price history
 *   node server/scripts/collect-data.js --snapshots-only  # Only collect portfolio snapshots
 * 
 * Designed to run via cron or manually. Does not require the server to be running.
 */

const path = require('path');

// Load .env from server directory
const dotenvPath = path.join(__dirname, '..', '.env');
const fs = require('fs');
if (fs.existsSync(dotenvPath)) {
  fs.readFileSync(dotenvPath, 'utf8').split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
}

const { initDatabase, dbAll } = require('../db');
const { collectSymbolHistory } = require('../routes/history');
const { collectDailySnapshot } = require('../utils/snapshots');

// Parse flags
const args = process.argv.slice(2);
const pricesOnly = args.includes('--prices-only');
const snapshotsOnly = args.includes('--snapshots-only');

const runPrices = !snapshotsOnly;
const runSnapshots = !pricesOnly;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function collectPriceHistory() {
  console.log('\n📊 Collecting price history...');

  // Get all unique symbols from positions and watchlist_items
  const positionSymbols = dbAll('SELECT DISTINCT symbol FROM positions');
  const watchlistSymbols = dbAll('SELECT DISTINCT symbol FROM watchlist_items');

  const symbolSet = new Set();
  positionSymbols.forEach(r => symbolSet.add(r.symbol.toUpperCase()));
  watchlistSymbols.forEach(r => symbolSet.add(r.symbol.toUpperCase()));

  const symbols = Array.from(symbolSet);

  if (symbols.length === 0) {
    console.log('  No symbols found in positions or watchlist.');
    return { symbols: 0, newRows: 0, errors: [] };
  }

  console.log(`  Found ${symbols.length} symbols: ${symbols.join(', ')}`);

  let totalNewRows = 0;
  const errors = [];

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    process.stdout.write(`  [${i + 1}/${symbols.length}] ${symbol}... `);

    try {
      const newRows = await collectSymbolHistory(symbol);
      totalNewRows += newRows;
      console.log(`${newRows} data points processed`);
    } catch (err) {
      errors.push({ symbol, error: err.message });
      console.log(`ERROR: ${err.message}`);
    }

    // Rate limit: 200ms delay between requests
    if (i < symbols.length - 1) {
      await sleep(200);
    }
  }

  console.log(`  ✅ Price history: ${symbols.length} symbols, ${totalNewRows} data points processed, ${errors.length} errors`);
  return { symbols: symbols.length, newRows: totalNewRows, errors };
}

async function collectSnapshots() {
  console.log('\n📸 Collecting portfolio snapshots...');

  const portfolios = dbAll('SELECT id, name FROM portfolios');

  if (portfolios.length === 0) {
    console.log('  No portfolios found.');
    return { portfolios: 0, snapshots: [] };
  }

  console.log(`  Found ${portfolios.length} portfolios`);

  const snapshots = [];

  for (let i = 0; i < portfolios.length; i++) {
    const portfolio = portfolios[i];
    process.stdout.write(`  [${i + 1}/${portfolios.length}] "${portfolio.name}" (id=${portfolio.id})... `);

    try {
      const snapshot = await collectDailySnapshot(portfolio.id);
      snapshots.push(snapshot);
      console.log(`$${snapshot.total_value.toFixed(2)} (${snapshot.positions.length} positions)`);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      snapshots.push({ portfolio_id: portfolio.id, error: err.message });
    }

    // Rate limit between portfolios
    if (i < portfolios.length - 1) {
      await sleep(200);
    }
  }

  const successful = snapshots.filter(s => !s.error).length;
  console.log(`  ✅ Snapshots: ${successful}/${portfolios.length} portfolios collected`);
  return { portfolios: portfolios.length, snapshots };
}

async function main() {
  const startTime = Date.now();
  console.log('🚀 Portfolio Tracker Data Collection');
  console.log(`   Time: ${new Date().toISOString()}`);
  console.log(`   Mode: ${pricesOnly ? 'prices only' : snapshotsOnly ? 'snapshots only' : 'full collection'}`);

  try {
    // Initialize database (loads from file, same as server)
    await initDatabase();
    console.log('   Database loaded successfully');

    let priceResults = null;
    let snapshotResults = null;

    if (runPrices) {
      priceResults = await collectPriceHistory();
    }

    if (runSnapshots) {
      snapshotResults = await collectSnapshots();
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Collection complete in ${elapsed}s`);

    if (priceResults) {
      console.log(`   Prices: ${priceResults.symbols} symbols, ${priceResults.newRows} data points, ${priceResults.errors.length} errors`);
    }
    if (snapshotResults) {
      const ok = snapshotResults.snapshots.filter(s => !s.error).length;
      console.log(`   Snapshots: ${ok}/${snapshotResults.portfolios} portfolios`);
    }

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
