/**
 * Module-level price cache with 30-second TTL.
 * Uses the batch /api/prices?symbols=... endpoint — one request per page load.
 */

const BASE = '/api';
const TTL = 30_000; // 30 seconds

interface PriceData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  name?: string;
  marketState?: string; // 'REGULAR' | 'PRE' | 'POST' | 'CLOSED'
  preMarketPrice?: number;
  preMarketChange?: number;
  postMarketPrice?: number;
  postMarketChange?: number;
}

interface CacheEntry {
  data: PriceData;
  ts: number;
}

const cache: Record<string, CacheEntry> = {};

function getToken(): string | null {
  return localStorage.getItem('pt_gui_token');
}

async function batchFetch(symbols: string[]): Promise<Record<string, PriceData>> {
  if (!symbols.length) return {};
  const token = getToken();
  const qs = symbols.map(s => encodeURIComponent(s)).join(',');
  const res = await fetch(`${BASE}/prices?symbols=${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return {};
  return (await res.json()) || {};
}

/**
 * Get prices for a list of symbols. Uses cache, fetches missing/stale in one batch call.
 * Returns a map: symbol → PriceData (undefined if unavailable).
 */
export async function getPrices(symbols: string[]): Promise<Record<string, PriceData>> {
  if (!symbols.length) return {};
  const now = Date.now();
  const result: Record<string, PriceData> = {};
  const toFetch: string[] = [];

  for (const sym of symbols) {
    const entry = cache[sym];
    if (entry && now - entry.ts < TTL) {
      result[sym] = entry.data;
    } else {
      toFetch.push(sym);
    }
  }

  if (toFetch.length > 0) {
    try {
      const fetched = await batchFetch(toFetch);
      for (const [sym, data] of Object.entries(fetched)) {
        cache[sym] = { data: data as PriceData, ts: now };
        result[sym] = data as PriceData;
      }
    } catch {
      // Silently fall through — symbols just won't have prices
    }
  }

  return result;
}

/** Invalidate a single symbol (force re-fetch next time) */
export function invalidatePrice(symbol: string): void {
  delete cache[symbol];
}

/** Clear entire cache */
export function clearPriceCache(): void {
  for (const key of Object.keys(cache)) delete cache[key];
}
